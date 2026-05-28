import Link from 'next/link';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function PaymentSuccess({
  searchParams,
}: {
  searchParams: Promise<{ paymentKey?: string; orderId?: string; amount?: string }>;
}) {
  const { paymentKey, orderId, amount } = await searchParams;
  if (!paymentKey || !orderId || !amount) {
    return (
      <div className="payment-result">
        <h1>결제 정보 누락</h1>
        <p>잘못된 접근입니다.</p>
        <Link href="/my/billing" className="btn btn-primary">결제 페이지로</Link>
      </div>
    );
  }

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host')!;
  const cookie = h.get('cookie') ?? '';

  const res = await fetch(`${proto}://${host}/api/payment/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.error) {
    return (
      <div className="payment-result fail">
        <h1>결제 처리 실패</h1>
        <p className="mono">{data.detail?.message ?? data.error ?? '알 수 없는 오류'}</p>
        <p className="dim">결제는 자동 취소됩니다. 다시 시도하거나 문의해주세요.</p>
        <Link href="/my/billing" className="btn btn-primary">결제 페이지로</Link>
      </div>
    );
  }

  return (
    <div className="payment-result ok">
      <h1>결제 완료</h1>
      <p>슬롯 {data.slotsGranted}개가 추가됐습니다.</p>
      <p className="dim small">주문번호 {orderId} · {Number(amount).toLocaleString()}원</p>
      <div className="cta-row">
        <Link href="/my/watches" className="btn btn-primary">내 알림으로</Link>
        <Link href="/my/billing" className="btn btn-secondary">결제 내역</Link>
      </div>
    </div>
  );
}
