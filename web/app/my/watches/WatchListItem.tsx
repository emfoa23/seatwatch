'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SITE_LABELS, type Site } from '@/lib/types/seat';
import { SiteLogo } from '@/app/_components/Icons';

interface Item {
  id: string;
  site: Site;
  title: string;
  venue: string;
  eventDatetime: string;
  seatSelector: unknown;
  detailHref: string;
}

function describeSelector(sel: unknown): string {
  if (typeof sel !== 'object' || !sel) return '';
  const s = sel as {
    type?: string;
    id?: string;
    time?: string;
    grade?: string;
    row?: string;
    values?: string[];
    adjacency?: number;
    partySize?: number;
    mode?: 'seat' | 'time';
  };
  if (s.type === 'multi' && s.values) {
    const label = s.mode === 'time' ? '시간대' : '좌석';
    const opt = s.mode === 'time'
      ? ` · ${s.partySize ?? 1}명 예약`
      : (s.adjacency ?? 1) > 1 ? ` · ${s.adjacency}명 연속` : '';
    const preview = s.values.slice(0, 3).join(', ') + (s.values.length > 3 ? ` 외 ${s.values.length - 3}` : '');
    return `${label} ${preview}${opt}`;
  }
  if (s.type === 'seat') return `좌석 ${s.id}`;
  if (s.type === 'time') return `시간 ${s.time}`;
  if (s.type === 'grade') return `${s.grade} 등급`;
  if (s.type === 'row') return `${s.row}열`;
  if (s.type === 'any') return '아무 빈자리';
  return '-';
}

export function WatchListItem({ item }: { item: Item }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  async function cancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('이 알림을 취소할까요?')) return;
    const res = await fetch('/api/watch', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    });
    if (res.ok) {
      setRemoved(true);
      startTransition(() => router.refresh());
    } else {
      alert(`취소 실패: ${res.status}`);
    }
  }

  if (removed) return null;

  return (
    <li className="watch-item">
      <Link href={item.detailHref} className="watch-link">
        <div className="watch-site">
          <SiteLogo site={item.site} size={20} />
          <span className="watch-site-label">{SITE_LABELS[item.site]}</span>
        </div>
        <div className="watch-body">
          <span className="watch-title">{item.title}</span>
          {item.venue && <span className="dim small">{item.venue}</span>}
          <span className="dim">{new Date(item.eventDatetime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
          <span className="dim small">{describeSelector(item.seatSelector)}</span>
        </div>
      </Link>
      <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={pending}>
        {pending ? '취소중...' : '알림 취소'}
      </button>
    </li>
  );
}
