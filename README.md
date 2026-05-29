# seatwatch

CGV · 메가박스 · 롯데시네마 · 인터파크 티켓 · 캐치테이블의 좌석/시간대 예약 현황을 한 UI 에서 조회하고, 마감된 자리에 빈자리가 나오면 메일로 알림 받는 서비스.

설계 문서 (Personal/.claude/plans/): `vectorized-floating-parnas.md`

## 구성

- `web/` — Next.js (App Router). Vercel 배포. **Lazy fetch 모델** — 탭 진입 시 검색창만 보이고, 검색·좌석 조회 시점에만 외부 API 호출 + Valkey 캐시.
- `worker/` — Node.js 알림 큐 consumer. GitHub Actions `notify-drain` 가 매 분 build + drain.
- `scripts/monitor.py` — Valkey/Neon health 모니터링 (cron-job.org → workflow_dispatch).
- `.github/workflows/` — CI · notify-drain · monitor-freshness.

크롤러는 별도 repo: [emfoa23/seatwatch-crawler](https://github.com/emfoa23/seatwatch-crawler) (public, GitHub Actions 무제한 사용).

## 기술 스택

| 영역 | 선택 |
|---|---|
| FE | Next.js + React (App Router) |
| 인증 | Auth.js v5 (Google/Kakao/Naver OAuth + Credentials) |
| 영속 DB | Neon (Postgres) — 1 인스턴스 |
| 좌석 캐시 / 큐 | Aiven Valkey — 1 인스턴스, `VALKEY_KEY_PREFIX` 로 phase 격리 |
| 결제 | 토스페이먼츠 |
| 메일 | Resend |
| 호스팅 (web) | Vercel |
| Worker (알림 큐 drain) | GitHub Actions `notify-drain.yml` (매 분 schedule + cron-job.org workflow_dispatch) |
| 크롤러 | GitHub Actions (seatwatch-crawler repo) |

## Phase 정책

Aiven Valkey 1통 + Neon Postgres 1통을 모든 환경이 공유. 격리는 **prefix** 와 **운영 룰** 로:

| 환경 | DATABASE_URL | VALKEY_KEY_PREFIX | 비고 |
|---|---|---|---|
| **로컬 dev** (localhost:3000) | 같은 Neon | `seatwatch:dev` | 캐시 격리 |
| **Vercel Production** | 같은 Neon | `seatwatch:prod` | 운영 — 실사용자 데이터 |
| **GitHub Actions** (crawler · notify · monitor) | 같은 Neon | `seatwatch:prod` | 항상 prod prefix |

자세한 정책은 `PHASES.md` 참조.

## 로컬 개발

```bash
cd web
npm install
npm run db:push          # Neon 에 스키마 적용 (최초 1회)
npm run dev              # http://localhost:3000
```

`.env.local` 은 repo root + `web/` 의 symlink. `web/.env.local` 만들 때 `ln -s ../.env.local web/.env.local`.

주요 페이지:
- `/` — 홈
- `/cgv` · `/megabox` · `/lotte` · `/interpark` · `/catchtable` — 검색 (탭 진입 시 검색창만, 결과 list 없음)
- `/<site>/g/<groupKey>?day=...&screen=...&eid=...` — 그룹 상세 (날짜·상영관·시간 picker, 좌석맵, 알림 등록)
- `/login` · `/signup` — 인증
- `/my` · `/my/watches` · `/my/billing` · `/my/payments` · `/my/profile` — 마이페이지

API:
- `GET /api/search/<site>?q=<name>` — 이름 검색만 (영화명/공연명/식당명). 극장·지역·장르·공연장·카테고리 검색은 거부.
- `GET /api/snapshot/<site>/<eid>` — 특정 회차/시간대의 좌석/시간슬롯 조회.

캐시 + rate limit:
- 검색 캐시 1h TTL, 좌석 캐시 5m TTL (`web/lib/cache.ts`).
- 검색 분당 30회, 좌석 분당 60회 / 유저 또는 IP.

스크립트:
- `npm run db:push` — drizzle 마이그레이션 push
- `npm run db:studio` — drizzle studio
- `npm run typecheck` — TS 검증

## 데이터 흐름 (Lazy fetch 모델)

### 1) 검색
```
[사용자: 영화/공연/식당명 입력]
       ↓
[GET /api/search/<site>?q=...]
       ↓                             ↑ (캐시 hit 1h TTL)
[Valkey search:<site>:<hash>]  ─────┘
       ↓ miss
[fetcher.search() → 외부 사이트 API]
       ↓
[Valkey 캐시 set + events index hset]
       ↓
[브라우저: 결과 list 렌더]
```

### 2) 좌석/시간대 조회
```
[사용자: 날짜·상영관·시간 picker 선택]
       ↓
[GET /api/snapshot/<site>/<eid>]
       ↓                              ↑ (캐시 hit 5m TTL)
[Valkey snapshot:<site>:<eid>:<dt>] ─┘
       ↓ miss
[fetcher.snapshot() → 외부 사이트 API]
       ↓
[Valkey snapshot set + freshness 갱신]
       ↓
[브라우저: SeatMap / TimeSlots 렌더]
```

### 3) 활성 watch 만 cron 폴링
```
[활성 watch_targets ── GitHub Actions ──→ 사이트별 fetcher.snapshot()]
                                        ↓
                                   diff: occupied → available
                                        ↓
                                Valkey notify:queue (LPUSH)
                                        ↓
                      [GitHub Actions notify-drain (매 분)]
                                        ↓
                                  Resend → 사용자 메일
```

## 배포

`DEPLOYMENT.md` 참고. Vercel 자동 배포 + GitHub Actions secrets 등록만 하면 끝.

## 법적 / 운영 리스크

외부 사이트(CGV·메가박스·롯데시네마·인터파크·캐치테이블)의 공개 정보를 정기 조회. 각 사이트 ToS 가 "자동화된 수단 접근 금지" 일반 조항을 포함하고 있어 **IP 차단·계정 차단·법적 분쟁** 위험이 있음.

## 개발 룰

- Personal/CLAUDE.md 따름 (브랜치 최신화, README 갱신, merge commit, 모듈화).
- 한 파일 ~300-400줄 부근에서 책임 분리. 임의 추상화 금지.
