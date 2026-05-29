# Deployment Guide

운영 환경 배포 가이드.

## 1. Vercel — web (Next.js)

### 1-1. 프로젝트 import
1. https://vercel.com/new → emfoa23/seatwatch import
2. **Root Directory**: `web`
3. Framework Preset: `Next.js` (자동 인식)

### 1-2. Environment Variables (Production)
| 키 | 값 |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `VALKEY_URL` | `rediss://default:<pw>@<host>:<port>` |
| `VALKEY_KEY_PREFIX` | **`seatwatch:prod`** |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` (로컬과 다른 새 값) |
| `NEXTAUTH_URL` | `https://seatwatch-mu.vercel.app` |
| `GOOGLE_CLIENT_ID/SECRET` | Google Cloud Console |
| `KAKAO_CLIENT_ID/SECRET` | Kakao Developers |
| `NAVER_CLIENT_ID/SECRET` | Naver Developers |
| `TOSS_CLIENT_KEY/SECRET_KEY` | 토스 (테스트→라이브 심사 후) |
| `RESEND_API_KEY` | Resend |
| `RESEND_FROM_EMAIL` | 검증된 도메인 발신 주소 |

### 1-3. OAuth redirect URI
각 provider 콘솔에서 운영 URL 의 redirect 추가:
- Google: `https://seatwatch-mu.vercel.app/api/auth/callback/google`
- Kakao: `https://seatwatch-mu.vercel.app/api/auth/callback/kakao`
- Naver: `https://seatwatch-mu.vercel.app/api/auth/callback/naver`

---

## 2. GitHub Actions — worker (notify-drain) · crawler · monitor

**Render 미사용**. 모든 백그라운드 작업은 GitHub Actions 로.

### 2-1. seatwatch repo Secrets
Settings → Secrets and variables → Actions:

| 키 | 값 |
|---|---|
| `DATABASE_URL` | Vercel 과 동일 |
| `VALKEY_URL` | 동일 |
| `VALKEY_KEY_PREFIX` | `seatwatch:prod` |
| `RESEND_API_KEY` | 동일 |
| `RESEND_FROM_EMAIL` | 동일 |
| `PUBLIC_SITE_URL` | `https://seatwatch-mu.vercel.app` |

활성 workflows:
- `notify-drain.yml` — 매 분 schedule + workflow_dispatch (Resend 발송)
- `monitor-freshness.yml` — workflow_dispatch (Valkey/Neon health 체크)
- `ci.yml` — PR/push 시 typecheck

### 2-2. seatwatch-crawler repo Secrets
| 키 | 값 |
|---|---|
| `DATABASE_URL` | 동일 |
| `VALKEY_URL` | 동일 |
| `VALKEY_KEY_PREFIX` | `seatwatch:prod` |
| `CRAWLER_USER_AGENT_POOL` | base64(JSON array of UAs) |

### 2-3. cron-job.org 트리거 등록
GitHub Actions schedule 은 best-effort 라 백업으로 cron-job.org 의 workflow_dispatch 트리거 권장.

https://cron-job.org → New cron job:
- URL: `https://api.github.com/repos/emfoa23/<repo>/actions/workflows/<workflow>.yml/dispatches`
- Method: POST
- Headers:
  - `Authorization: Bearer <GitHub PAT (workflow scope)>`
  - `Accept: application/vnd.github+json`
  - `Content-Type: application/json`
- Body: `{"ref": "main"}`

| Job | Repo | Workflow | 주기 |
|---|---|---|---|
| Notify drain (백업) | seatwatch | notify-drain.yml | 1분 |
| CGV 크롤 | seatwatch-crawler | crawl-cgv.yml | 15분 |
| 인터파크 크롤 | seatwatch-crawler | crawl-interpark.yml | 15분 |
| 캐치 크롤 | seatwatch-crawler | crawl-catchtable.yml | 15분 |
| Watch 폴링 | seatwatch-crawler | crawl-watch-poll.yml | 3분 |
| 모니터 | seatwatch | monitor-freshness.yml | 15분 |

---

## 3. 도메인 (선택)

운영 도메인 (`seatwatch.kr` 등) 사용 시:
1. Cloudflare Registrar 등에서 도메인 구매
2. Vercel → Settings → Domains → Add
3. Cloudflare DNS 에 CNAME 추가
4. `NEXTAUTH_URL` · `PUBLIC_SITE_URL` 을 새 도메인으로 변경
5. OAuth 3사 redirect URI 도 새 도메인 추가

---

## 4. 토스페이먼츠 운영 전환

1. 간이사업자등록 (홈택스 5분) 후 토스 가맹점 신청
2. 심사 통과 → 라이브 키 발급
3. Vercel `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` 라이브 키로 교체
4. (선택, 가상계좌 결제 활성화 시) Webhook 등록:
   - 토스 대시보드 → 웹훅 → URL `https://<도메인>/api/webhook/toss`
   - 시크릿 발급 → Vercel `TOSS_WEBHOOK_SECRET`

---

## 5. 운영 체크리스트

- [ ] Vercel 배포 완료 (`seatwatch-mu.vercel.app`)
- [ ] OAuth 3사 redirect URI 업데이트
- [ ] Resend 본 도메인 인증 + `RESEND_FROM_EMAIL` 갱신
- [ ] GitHub seatwatch repo secrets 등록 (6개)
- [ ] GitHub seatwatch-crawler repo secrets 등록
- [ ] cron-job.org 6개 job 등록 + GitHub PAT (workflow scope)
- [ ] notify-drain 수동 실행 확인 (`drain done. processed=0`)
- [ ] monitor-freshness 수동 실행 + Issue 생성 동작 확인
- [ ] 토스 가맹점 심사 (운영 결제 시점)
- [ ] 이용약관 / 개인정보처리방침 footer 노출 확인
