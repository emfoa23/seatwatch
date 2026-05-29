'use client';

import { useState } from 'react';
import { loadTossPayments } from '@tosspayments/payment-sdk';

interface RecentPayment {
  orderId: string;
  amount: number;
  status: string;
  slotsGranted: number;
  createdAt: string;
  paidAt: string | null;
}

interface Props {
  free: number;
  paid: number;
  pricePerSlot: number;
  email: string;
  recent: RecentPayment[];
}

type Method = '카드';
const METHODS: { id: Method; label: string }[] = [
  { id: '카드', label: '신용/체크카드' },
];

export function BillingClient({ free, paid, pricePerSlot, email, recent }: Props) {
  const [slots, setSlots] = useState(1);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pay(method: Method) {
    setPending(method);
    setErr(null);
    try {
      const initRes = await fetch('/api/payment/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });
      if (!initRes.ok) {
        const body = await initRes.text();
        setErr(`결제 준비 실패: ${initRes.status} ${body}`);
        setPending(null);
        return;
      }
      const init = await initRes.json();
      const tossPayments = await loadTossPayments(init.clientKey);
      await tossPayments.requestPayment(method, {
        amount: init.amount,
        orderId: init.orderId,
        orderName: init.orderName,
        customerEmail: email,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPending(null);
    }
  }

  const total = pricePerSlot * slots;

  return (
    <div className="billing">
      <header className="billing-header">
        <h1>슬롯 결제</h1>
        <p className="hint">알림 슬롯 1개당 {pricePerSlot.toLocaleString()}원. 결제 후 즉시 사용 가능.</p>
      </header>

      <section className="billing-summary">
        <div>
          <span className="dim">현재 보유</span>
          <strong>{free + paid}개</strong>
          <span className="dim small">무료 {free} · 추가 {paid}</span>
        </div>
        <div>
          <span className="dim">구매 수량</span>
          <div className="qty-input">
            <button type="button" onClick={() => setSlots(Math.max(1, slots - 1))}>-</button>
            <span>{slots}</span>
            <button type="button" onClick={() => setSlots(Math.min(50, slots + 1))}>+</button>
          </div>
        </div>
        <div>
          <span className="dim">결제 금액</span>
          <strong className="price">{total.toLocaleString()}원</strong>
        </div>
      </section>

      <section className="billing-methods">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            className="btn btn-primary btn-pay"
            disabled={pending !== null}
            onClick={() => pay(m.id)}
          >
            {pending === m.id ? '결제창 준비중...' : `${total.toLocaleString()}원 결제하기`}
          </button>
        ))}
        <p className="method-note">간편결제 · 신용/체크카드 모두 가능 (결제창에서 선택)</p>
        {err && <p className="auth-error" style={{ marginTop: 12 }}>{err}</p>}
      </section>

      <section className="billing-history">
        <h2>최근 결제 내역</h2>
        {recent.length === 0 ? (
          <p className="empty">결제 내역이 없습니다.</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>주문번호</th>
                <th>금액</th>
                <th>슬롯</th>
                <th>상태</th>
                <th>일시</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.orderId}>
                  <td className="mono">{p.orderId}</td>
                  <td>{p.amount.toLocaleString()}원</td>
                  <td>{p.slotsGranted}</td>
                  <td><span className={`pay-status pay-${p.status}`}>{p.status}</span></td>
                  <td>{new Date(p.paidAt ?? p.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
