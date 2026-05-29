# Deployment Guide

운영 환경 배포 가이드. dev 단계 키를 새 운영 키로 발급받아 진행.

## 1. Vercel — web (Next.js)

### 1-1. 프로젝트 import
1. https://vercel.com/new → emfoa23/seatwatch import
2. **Root Directory**: `web`
3. Framework Preset: `Next.js` (자동 인식)
4. Build Command / Install Command 그대로

### 1-2. Environment Variables
| 키 | 값 |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `VALKEY_URL` | `rediss://default:<pw>@<host>:<port>` |
| `VALKEY_KEY_PREFIX` | `seatwatch:prod` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://<vercel-domain>` (배포 후 확인 가능한 URL) |
| `GOOGLE_CLIENT_ID/SECRET` | Google Cloud Console |
| `KAKAO_CLIENT_ID/SECRET` | Kakao Developers |
| `NAVER_CLIENT_ID/SECRET` | Naver Developers |
| `TOSS_CLIENT_KEY/SECRET_KEY` | 토스 (라이브 키 — 사업자 심사 통과 후) |
| `RESEND_API_KEY` | Resend |
| `RESEND_FROM_EMAIL` | 검증된 도메인 발신 주소 |

### 1-3. OAuth redirect URI 업데이트
각 provider 콘솔에서 운영 URL 의 redirect 추가:
- Google: `https://<vercel-domain>/api/auth/callback/google`
- Kakao: `https://<vercel-domain>/api/auth/callback/kakao`
- Naver: `https://<vercel-domain>/api/auth/callback/naver`

### 1-4. Resend 본 도메인 인증
- Resend → Domains → Add → 도메인 입력 → SPF/DKIM/DMARC DNS 4건 추가
- `RESEND_FROM_EMAIL` 을 본 도메인 발신 주소로 변경

---

## 2. Render — worker (Node.js 알림 큐 consumer)

### 2-1. Blueprint 등록
1. https://render.com → New → Blueprint
2. seatwatch repo 연결 → Render 가 `render.yaml` 자동 인식
3. `seatwatch-worker` 서비스 생성

### 2-2. Environment Variables (Render Dashboard → Worker → Environment)
| 키 | 값 |
|---|---|
| `DATABASE_URL` | Vercel 과 동일 |
| `VALKEY_URL` | 동일 |
| `VALKEY_KEY_PREFIX` | `seatwatch:prod` |
| `RESEND_API_KEY` | 동일 |
| `RESEND_FROM_EMAIL` | 동일 |
| `PUBLIC_SITE_URL` | `https://<vercel-domain>` (메일 본문 링크) |
| `SENTRY_DSN` (선택) | 워커 전용 Sentry project |

### 2-3. 로그 확인
- Render Dashboard → Worker → Logs → `worker started. queue=seatwatch:prod:notify:queue` 확인

---

## 3. GitHub Actions — crawler · monitor

### 3-1. Crawler secrets (emfoa23/seatwatch-crawler repo)
Settings → Secrets and variables → Actions:
| 키 | 값 |
|---|---|
| `DATABASE_URL` | Neon |
| `VALKEY_URL` | Aiven |
| `VALKEY_KEY_PREFIX` | `seatwatch:prod` |
| `CRAWLER_USER_AGENT_POOL` | base64(JSON array of UAs) |

### 3-2. Monitor secrets (emfoa23/seatwatch repo)
| 키 | 값 |
|---|---|
| `DATABASE_URL` | Neon |
| `VALKEY_URL` | Aiven |
| `VALKEY_KEY_PREFIX` | `seatwatch:prod` |
| (`GITHUB_TOKEN` 은 자동 제공) | |

### 3-3. cron-job.org 트리거 등록
https://cron-job.org → New cron job. 각 workflow 별:
- URL: `https://api.github.com/repos/emfoa23/<repo>/actions/workflows/<workflow>.yml/dispatches`
- Method: POST
- Headers:
  - `Authorization: Bearer <GitHub PAT (workflow scope)>`
  - `Accept: application/vnd.github+json`
  - `Content-Type: application/json`
- Body: `{"ref": "main"}`

| Job | Workflow | 주기 |
|---|---|---|
| CGV 크롤 | emfoa23/seatwatch-crawler/crawl-cgv.yml | 15분 |
| 인터파크 크롤 | emfoa23/seatwatch-crawler/crawl-interpark.yml | 15분 |
| 캐치 크롤 | emfoa23/seatwatch-crawler/crawl-catchtable.yml | 15분 |
| Watch 폴링 | emfoa23/seatwatch-crawler/crawl-watch-poll.yml | 3분 |
| 모니터 | emfoa23/seatwatch/monitor-freshness.yml | 15분 |

---

## 4. 도메인 (선택)

운영 도메인 (`seatwatch.kr` 등) 사용 시:
1. Cloudflare Registrar 등에서 도메인 구매
2. Vercel → Settings → Domains → Add → 도메인 입력
3. Cloudflare DNS 에 CNAME 추가 (Vercel 안내 따라)
4. `NEXTAUTH_URL` · `PUBLIC_SITE_URL` 을 새 도메인으로 변경
5. OAuth 3사 redirect URI 도 새 도메인 추가

---

## 5. 토스페이먼츠 운영 전환

1. 토스 가맹점 신청 — 간이사업자등록 (홈택스 5분) 후 신청
2. 심사 통과 후 라이브 키 발급
3. Vercel `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` 를 라이브 키로 교체
4. Webhook 등록 (선택, 가상계좌 결제 활성화 시 필수):
   - 토스 대시보드 → 웹훅 → URL `https://<도메인>/api/webhook/toss`
   - 시크릿 발급 → Vercel `TOSS_WEBHOOK_SECRET`

---

## 6. 운영 체크리스트

- [ ] Vercel 배포 완료, URL 확인
- [ ] OAuth 3사 redirect URI 업데이트
- [ ] Resend 본 도메인 인증
- [ ] Render Worker 배포 + 로그 확인
- [ ] cron-job.org 5개 job 등록
- [ ] monitor workflow 첫 실행 확인 + Issue 생성 동작 확인
- [ ] 토스 가맹점 심사 (운영 결제 시점)
- [ ] 이용약관 / 개인정보처리방침 footer 노출 확인
