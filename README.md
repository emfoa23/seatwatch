# seatwatch

CGV·인터파크 티켓·캐치테이블의 좌석/시간대 예약 현황을 한 UI 에서 조회하고, 마감된 자리에 빈자리가 나오면 메일로 알림 받는 서비스.

설계 문서 (Personal/.claude/plans/): `vectorized-floating-parnas.md`

## 구성

- `web/` — Next.js (App Router). Vercel 배포.
- `worker/` — Node.js 알림 큐 consumer. Render Background Worker.
- `shared/` — web/worker 가 공유하는 타입.
- `.github/workflows/` — CI + 신선도 모니터링.

크롤러는 별도 repo: [emfoa23/seatwatch-crawler](https://github.com/emfoa23/seatwatch-crawler) (public, GitHub Actions 무제한 사용).

## 기술 스택

| 영역 | 선택 |
|---|---|
| FE | Next.js + React (App Router) |
| 인증 | Auth.js v5 (Google/Kakao/Naver OAuth + Credentials) |
| 영속 DB | Neon (Postgres) |
| 좌석 캐시 / 큐 | Aiven Valkey (prefix `seatwatch:prod:`) |
| 결제 | 토스페이먼츠 |
| 메일 | Resend |
| 호스팅 | Vercel (web) + Render (worker) |
| Cron | cron-job.org → GitHub Actions `workflow_dispatch` |

## 외부 서비스 발급 체크리스트

본격 구현 전에 아래 키들을 발급받아 환경변수에 등록. `.env.example` 참고.

1. **Neon** — [neon.tech](https://neon.tech) → Create Project (region: AWS ap-southeast-1 Singapore). Branch 2개: `main` (prod) + `dev`. → `DATABASE_URL`
2. **Resend** — [resend.com](https://resend.com) → API Keys. → `RESEND_API_KEY`. 초기엔 `onboarding@resend.dev` 발신.
3. **Google OAuth** — [console.cloud.google.com](https://console.cloud.google.com) → OAuth client ID (Web). Redirect: `https://<도메인>/api/auth/callback/google` + `http://localhost:3000/api/auth/callback/google`
4. **Kakao OAuth** — [developers.kakao.com](https://developers.kakao.com) → 카카오 로그인 활성화 + client_secret 발급
5. **Naver OAuth** — [developers.naver.com](https://developers.naver.com) → 애플리케이션 등록. 검수 전엔 본인+테스트 5명 한도.
6. **토스페이먼츠** — [tosspayments.com](https://tosspayments.com) → 가입 → "개인 비사업자". 테스트 키로 전체 플로우 가능.
7. **cron-job.org** — [cron-job.org](https://cron-job.org) → 무료 가입. 4-5개 job 등록 (다음 세션에 안내).
8. **GitHub PAT** — Settings → Developer settings → Tokens (classic, `workflow` scope). cron-job.org Authorization 헤더용.
9. **Aiven Valkey** — 기존 인스턴스 재사용. prefix `seatwatch:prod:` 로 격리.

## 환경변수

`.env.example` 참고. 분류:
- **Vercel (web)**: DATABASE_URL, VALKEY_URL, NEXTAUTH_*, OAuth 4종, TOSS_*, RESEND_*
- **Render (worker)**: DATABASE_URL, VALKEY_URL, RESEND_API_KEY
- **GitHub Secrets (crawler repo)**: DATABASE_URL, VALKEY_URL, CRAWLER_USER_AGENT_POOL

`VALKEY_KEY_PREFIX=seatwatch:prod` (dev 는 `seatwatch:dev`) — 키 prefix 강제 wrap.

## 법적 / 운영 리스크

이 서비스는 외부 사이트(CGV·인터파크·캐치테이블)의 공개 정보를 정기 조회. 각 사이트 ToS 가 "자동화된 수단 접근 금지" 일반 조항을 포함하고 있어 **IP 차단·계정 차단·법적 분쟁** 위험이 있음. 운영 시 모니터링·SLA 운영 메모 별도.

## 개발 룰

- Personal/CLAUDE.md 따름 (브랜치 최신화, README 갱신, merge commit, 모듈화).
- 한 파일 ~300-400줄 부근에서 책임 분리. 임의 추상화 금지.
