import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="hero">
      <h1>seatwatch</h1>
      <p className="lead">
        CGV · 인터파크 · 캐치테이블 좌석 현황을 한 곳에서. 마감된 자리에 빈자리가 나오면 메일로 알림.
      </p>
      <div className="cta-row">
        <Link href="/signup" className="btn btn-primary">시작하기</Link>
        <Link href="/login" className="btn btn-secondary">로그인</Link>
      </div>
      <h2>샘플 좌석 페이지 (Mock)</h2>
      <ul className="sample-list">
        <li><Link href="/cgv/test">CGV — 듄: 파트3 (4DX 1관)</Link></li>
        <li><Link href="/interpark/test">인터파크 — 오페라의 유령</Link></li>
        <li><Link href="/catchtable/test">캐치테이블 — 정식당</Link></li>
      </ul>
    </div>
  );
}
