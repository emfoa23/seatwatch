import Link from 'next/link';

export default async function PaymentFail({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; message?: string; orderId?: string }>;
}) {
  const { code, message, orderId } = await searchParams;
  return (
    <div className="payment-result fail">
      <h1>결제가 취소됐어요</h1>
      <p className="dim">{message ? decodeURIComponent(message) : '결제가 정상적으로 완료되지 않았습니다.'}</p>
      {code && <p className="mono">에러 코드: {code}</p>}
      {orderId && <p className="mono small">주문 {orderId}</p>}
      <div className="cta-row">
        <Link href="/my/billing" className="btn btn-primary">다시 시도</Link>
        <Link href="/my/watches" className="btn btn-secondary">내 알림</Link>
      </div>
    </div>
  );
}
