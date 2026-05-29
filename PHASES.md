# Phase 정책 (env / 데이터 격리)

## 현 인프라

- **Aiven Valkey** — 1 인스턴스, 1 URI
- **Neon Postgres** — 1 인스턴스, 1 DB (`neondb`), 1 schema (`public`)
- 환경: **로컬 dev** (localhost) / **Vercel Production** / **GitHub Actions**

## 핵심 원칙

> **인프라는 1통, phase 는 prefix + 운영 룰로 격리한다.**

| 자원 | 분리 방법 | 강제 수단 |
|---|---|---|
| Valkey 캐시·큐 | `VALKEY_KEY_PREFIX` (코드가 모든 key 에 자동 prepend) | 코드 (`lib/valkey.ts`) |
| Neon DB (사용자·결제·watch·이벤트 메타) | 같은 DB 공유 | 운영 룰 + session 가드 |
| 세션 | `NEXTAUTH_SECRET` 환경별 다름 | 환경변수 |
| 크롤링 데이터 | prod 만 (mock 은 dev) | seed 도구 prefix |
| 외부 사이트 데이터 | prod 만 | Actions secrets |

## 환경 매트릭스

### Valkey 격리 (prefix)

| 환경 | `VALKEY_KEY_PREFIX` | 키 예시 |
|---|---|---|
| 로컬 dev | `seatwatch:dev` | `seatwatch:dev:events:cgv`, `seatwatch:dev:snapshot:...` |
| Vercel Production | `seatwatch:prod` | `seatwatch:prod:events:cgv`, `seatwatch:prod:notify:queue` |
| GitHub Actions (crawler · notify · monitor) | `seatwatch:prod` | 동일 |
| Brian (omok/2048 — 별도 서비스) | `omok:prod` / `2048:prod` | 자기 prefix |

→ Aiven 1 instance 안에서 4개 phase·서비스가 충돌 없이 공존.

### NEXTAUTH_SECRET 격리

| 환경 | 값 | 효과 |
|---|---|---|
| 로컬 dev | 값 A | 로컬 JWT 가 운영에서 무효 |
| Vercel Production | 값 B | 운영 JWT 가 로컬에서 무효 |

→ secret 분리 시 cookie 자체가 다른 environment 의 secret 으로 서명되어 자동 격리.

### OAuth · 외부 서비스 키

| 키 | 환경별 분리 | 이유 |
|---|---|---|
| `GOOGLE_CLIENT_ID/SECRET` | **공유** | redirect URI 가 환경 분기 (`localhost:3000/*` + `seatwatch-mu.vercel.app/*` 둘 다 등록) |
| `KAKAO_CLIENT_ID/SECRET` | 공유 | 동일 |
| `NAVER_CLIENT_ID/SECRET` | 가능하면 분리 | Naver 검수 단위가 앱 — 운영 검수 통과 후엔 분리가 안전 |
| `RESEND_API_KEY` | 공유 | 발신 제한은 from 주소가 결정 |
| `RESEND_FROM_EMAIL` | **분리** | dev: `onboarding@resend.dev`, prod: 본 도메인 인증 후 |
| `TOSS_*` | 운영 가맹점 심사 통과 후 라이브 키 — prod 만 사용 | 테스트 키는 환경 공유 가능 |

## DB 단일 공유의 위험과 룰

### 위험

1. 로컬 dev 의 seed/test 가 prod 의 사용자 데이터 옆에 row 쌓임
2. 로컬에서 `db:push` 잘못 → schema 변경이 prod 까지 적용
3. 로컬 가입 user 가 prod 의 user 와 같은 테이블

### 대응 룰

| 룰 | 강제 수단 |
|---|---|
| `db:push` 는 PR 머지 직후 또는 의도된 운영자만 | 사람 규칙 |
| 로컬 가입 = test alias (`test+xxx@example.com`) | 사람 규칙 — 운영 user 와 혼동 방지 |
| Mock seed 는 dev prefix 만 영향 | 코드 (`scripts/seed-mock.ts` 가 `.env.local` 의 VALKEY_KEY_PREFIX 사용) |
| 다른 user 의 row 수정 불가 | 코드 (`/api/*` 가 `session.user.id` 로만 mutation) |
| 로컬에서 의도치 않게 prod watch 등록 가능 | 운영 worker 가 그것도 처리 — 명백한 자기 메일로만 발송이라 사고는 자기 메일 도착 정도 |

### 미래 확장 — DB 도 분리 필요해지면

**Neon Branch** 가 답:
- main branch = prod
- dev branch 추가 (Neon free tier 안에서 0.5GB 까지 무료)
- 로컬 `.env.local` 의 `DATABASE_URL` 만 dev branch 의 connection string 으로 교체
- schema 마이그레이션 시: dev branch 에서 먼저 적용 후 main 으로 promote

지금은 단일이지만 사고 1회 발생 시 즉시 branch 추가 권장.

## 환경별 책임 매트릭스

| 환경 | 읽기 | 쓰기 |
|---|---|---|
| **로컬 dev** | Neon 전체, Valkey `seatwatch:dev:*` | 자기 user 의 row, `seatwatch:dev:*` 캐시 |
| **Vercel prod** | Neon 전체, Valkey `seatwatch:prod:*` | 사용자 session 의 row 만 (API 의 `session.user.id` 가드) |
| **GitHub Actions crawler** | Valkey `seatwatch:prod:events:*` | events_meta · seat_events · crawl_jobs · `seatwatch:prod:snapshot:*` · `seatwatch:prod:notify:queue` |
| **GitHub Actions notify-drain** | `seatwatch:prod:notify:queue` · watch_targets · users | notifications · cooldown 키 |
| **GitHub Actions monitor** | Valkey freshness · crawl_jobs · notifications | metrics/*.json (repo), GitHub Issue |

## 데이터 소스의 진실

| 데이터 | 어디서 만들어지는가 | 어디에서 읽는가 |
|---|---|---|
| events_meta · Valkey events index · snapshot | crawler (prod) 또는 seed-mock (dev) | Vercel SSR, GitHub Actions notify-drain |
| watch_targets | Vercel API `/api/watch` | crawler diff, notify-drain |
| users · oauth_accounts · slot_inventory | Vercel API (signup, OAuth callback) | Vercel SSR, notify-drain |
| payments | Vercel API (`/api/payment/*`) | Vercel SSR (마이페이지) |
| notifications | notify-drain | monitor (성공률), 마이페이지 |

**핵심**: 어떤 row 도 두 곳에서 동시에 쓰지 않음 — write 권한이 명확히 한 곳에만.

## 환경별 .env 정리

### 로컬 (`.env.local`)
```bash
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
VALKEY_URL=rediss://default:...@valkey-...aivencloud.com:23140
VALKEY_KEY_PREFIX=seatwatch:dev
NEXTAUTH_SECRET=<로컬 전용 32-byte>
NEXTAUTH_URL=http://localhost:3000
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=onboarding@resend.dev
GOOGLE_CLIENT_ID/SECRET=...        # 공유
KAKAO_CLIENT_ID/SECRET=...         # 공유
NAVER_CLIENT_ID/SECRET=...         # 공유 (또는 dev 앱 별도)
TOSS_CLIENT_KEY/SECRET_KEY=test_*  # 테스트 키
```

### Vercel Production
- 위 키들 다 등록, 단:
  - `VALKEY_KEY_PREFIX=seatwatch:prod`
  - `NEXTAUTH_SECRET=<운영 전용 32-byte>`
  - `NEXTAUTH_URL=https://seatwatch-mu.vercel.app`
  - `RESEND_FROM_EMAIL=<본 도메인 인증 후 발신 주소>` (또는 onboarding 임시)
  - `TOSS_*=live_*` (가맹점 심사 통과 후)

### GitHub Actions Secrets (seatwatch repo)
- `DATABASE_URL`, `VALKEY_URL`, `VALKEY_KEY_PREFIX=seatwatch:prod`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `PUBLIC_SITE_URL=https://seatwatch-mu.vercel.app`

### GitHub Actions Secrets (seatwatch-crawler repo)
- `DATABASE_URL`, `VALKEY_URL`, `VALKEY_KEY_PREFIX=seatwatch:prod`
- `CRAWLER_USER_AGENT_POOL=<base64>`

## 사고 시나리오와 복구

| 사고 | 복구 |
|---|---|
| 로컬에서 실수로 seed 가 prod prefix 로 적재 | `redis-cli --scan --pattern 'seatwatch:prod:snapshot:*' \| xargs redis-cli del` 또는 crawler 재실행 (덮어쓰기) |
| 로컬에서 `db:push` 가 prod schema 손상 | drizzle migration 의 역방향 SQL 수동 적용 + Neon point-in-time restore (paid 만, free 는 backup 7일) |
| Valkey 인스턴스 다운 | Aiven 의 maintenance window 외 자동 복구. snapshot TTL 3시간 이내에 crawler 가 재적재 |
| Neon 인스턴스 다운 | session JWT 는 valid 하나 DB 조회 실패 → 페이지 5xx. Vercel function timeout 까지 retry |
| NEXTAUTH_SECRET 노출 | 새 값으로 회전 → 모든 사용자 재로그인 |

## 향후 분리 결정 트리

1. **Valkey 부족 → key 수가 충돌**? prefix 잘 지키면 안 일어남. 일어나면 Aiven 의 별도 service.
2. **DB 사고 → 로컬 실수로 prod 손상**? Neon dev branch 추가 ($0).
3. **OAuth Naver 검수 통과** 후 운영 안정성 필요? Naver 만 dev/prod 앱 분리.
4. **결제 운영 시작**? TOSS 라이브 키 + Webhook + 가상계좌 webhook.

지금은 **인프라 1통 + prefix · 운영 룰**이 비용·복잡도 최저로 안전.
