const TOSS_API = 'https://api.tosspayments.com/v1/payments';
const SLOT_PRICE_KRW = 1000;

export const PAYMENT = {
  SLOT_PRICE_KRW,
  orderName(slots: number) {
    return `알림 슬롯 ${slots}개`;
  },
};

interface ConfirmInput {
  paymentKey: string;
  orderId: string;
  amount: number;
}

interface TossPayment {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt?: string;
  method?: string;
  card?: { issuerCode?: string; number?: string };
  receipt?: { url?: string };
}

export async function confirmPayment(input: ConfirmInput): Promise<{ ok: true; data: TossPayment } | { ok: false; error: { code: string; message: string; status: number } }> {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error('TOSS_SECRET_KEY missing');

  const auth = Buffer.from(`${secret}:`).toString('base64');
  const res = await fetch(`${TOSS_API}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
      'Idempotency-Key': input.orderId,
    },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  if (!res.ok) {
    return { ok: false, error: { code: body.code ?? 'UNKNOWN', message: body.message ?? '', status: res.status } };
  }
  return { ok: true, data: body as TossPayment };
}

export async function cancelPayment(paymentKey: string, cancelReason: string): Promise<{ ok: boolean; status: number; body: string }> {
  const secret = process.env.TOSS_SECRET_KEY!;
  const auth = Buffer.from(`${secret}:`).toString('base64');
  const res = await fetch(`${TOSS_API}/${paymentKey}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({ cancelReason }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}
