import Link from 'next/link';

export const metadata = { title: '개인정보처리방침 — seatwatch' };

export default function PrivacyPage() {
  return (
    <article className="legal">
      <h1>개인정보처리방침</h1>
      <p className="dim small">최종 갱신: 2026-05-28</p>

      <section>
        <h2>1. 수집 항목</h2>
        <ul>
          <li><strong>회원가입</strong>: 이메일, 닉네임, (비밀번호 가입의 경우) bcrypt 해시값</li>
          <li><strong>OAuth 가입</strong>: 이메일, 닉네임, provider 의 사용자 식별값 (Google sub / Kakao id / Naver id)</li>
          <li><strong>알림 등록</strong>: 외부 사이트 회차 ID, 좌석/시간 선택값</li>
          <li><strong>결제</strong>: 토스페이먼츠가 제공하는 결제 키·주문 ID·금액·결제 상태. 카드번호 등 결제수단 정보는 본 서비스가 저장하지 않습니다.</li>
          <li><strong>알림 발송 이력</strong>: 발송 시점, 상태 (sent/failed/deduped), 본문 payload</li>
        </ul>
      </section>

      <section>
        <h2>2. 수집 목적</h2>
        <ul>
          <li>회원 인증 및 로그인 세션 관리</li>
          <li>알림 등록/취소 처리 및 빈자리 발생 시 이메일 발송</li>
          <li>슬롯 결제 처리 및 정산</li>
          <li>서비스 품질 모니터링 (알림 성공률 통계)</li>
        </ul>
      </section>

      <section>
        <h2>3. 보관 기간</h2>
        <ul>
          <li>회원 정보: 회원 탈퇴 시 즉시 삭제 (단, 결제·환불 관련 정보는 상법에 따라 5년)</li>
          <li>알림 발송 이력: 90일 후 자동 삭제</li>
          <li>모니터링 메트릭: 1년</li>
        </ul>
      </section>

      <section>
        <h2>4. 제3자 제공</h2>
        <ul>
          <li><strong>토스페이먼츠</strong>: 결제 처리에 필요한 주문 ID, 금액, 사용자 이메일</li>
          <li><strong>Resend</strong>: 알림 메일 발송에 필요한 수신자 이메일, 제목, 본문</li>
          <li>그 외 제3자에게 제공하지 않습니다.</li>
        </ul>
      </section>

      <section>
        <h2>5. 외부 사이트 접근</h2>
        <p>
          본 서비스는 사용자가 등록한 외부 사이트의 회차/좌석 정보를 정기 조회합니다.
          외부 사이트에 사용자의 개인정보를 전송하지 않으며, 사용자를 식별할 수 있는 토큰을
          외부 사이트에 보내지 않습니다.
        </p>
      </section>

      <section>
        <h2>6. 사용자 권리</h2>
        <ul>
          <li>마이페이지 → 프로필 편집에서 닉네임·비밀번호·OAuth 연동 변경 가능</li>
          <li>회원 탈퇴 시 위 보관 기간 정책에 따라 정보 삭제</li>
          <li>개인정보 열람·정정 요청: <a href="mailto:emfoa23@gmail.com">emfoa23@gmail.com</a></li>
        </ul>
      </section>

      <section>
        <h2>7. 보안</h2>
        <ul>
          <li>비밀번호는 bcrypt 해시로 저장됩니다.</li>
          <li>모든 통신은 HTTPS 로 암호화됩니다.</li>
          <li>DB · 캐시 접근은 access token 기반 인증, 최소 권한 원칙으로 운영됩니다.</li>
        </ul>
      </section>

      <p style={{ marginTop: 32 }}>
        <Link href="/terms">이용약관 →</Link>
      </p>
    </article>
  );
}
