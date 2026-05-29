import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { payments } from '@/lib/db/schema';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const session = (await auth())!;
  const rows = await db.query.payments.findMany({
    where: eq(payments.userId, session.user.id),
    orderBy: [desc(payments.createdAt)],
    limit: 100,
  });

  return (
    <div className="payments-page">
      <h1>결제 내역</h1>
      {rows.length === 0 ? (
        <p className="empty">결제 내역이 없습니다.</p>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>주문번호</th>
              <th>금액</th>
              <th>슬롯</th>
              <th>상태</th>
              <th>등록</th>
              <th>완료</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="mono">{p.orderId}</td>
                <td>{p.amountKrw.toLocaleString()}원</td>
                <td>{p.slotsGranted}</td>
                <td><span className={`pay-status pay-${p.status}`}>{p.status}</span></td>
                <td>{fmtDateTime(p.createdAt)}</td>
                <td>{p.paidAt ? fmtDateTime(p.paidAt) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
