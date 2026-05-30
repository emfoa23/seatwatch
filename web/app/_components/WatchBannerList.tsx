'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { WatchContext } from '@/lib/watch-context';

function summarize(ctx: WatchContext): string {
  return ctx.registered.length === 0
    ? '-'
    : `회차 ${ctx.registered.length}개 알림`;
}

export function WatchBannerList({ contexts }: { contexts: WatchContext[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeWatch = sp.get('watch');
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  if (contexts.length === 0) return null;

  function selectWatch(id: string) {
    const next = new URLSearchParams(sp.toString());
    if (activeWatch === id) next.delete('watch');
    else next.set('watch', id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  async function cancel(id: string) {
    if (!confirm('이 알림을 취소할까요?')) return;
    setBusy(id);
    const res = await fetch('/api/watch', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setBusy(null);
    if (!res.ok) {
      alert(`취소 실패: ${res.status}`);
      return;
    }
    if (activeWatch === id) {
      const next = new URLSearchParams(sp.toString());
      next.delete('watch');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="watch-banner-list">
      <p className="watch-banner-heading">내가 등록한 알림 {contexts.length}개</p>
      {contexts.map((ctx) => {
        const isActive = activeWatch === ctx.watchId;
        return (
          <div
            key={ctx.watchId}
            className={`watch-banner ${isActive ? 'watch-banner-active' : ''}`}
            onClick={() => selectWatch(ctx.watchId)}
            role="button"
            tabIndex={0}
          >
            <span className="watch-banner-tag">알림</span>
            <span className="watch-banner-desc">{summarize(ctx)}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm watch-banner-cancel"
              disabled={busy === ctx.watchId}
              onClick={(e) => { e.stopPropagation(); cancel(ctx.watchId); }}
            >
              {busy === ctx.watchId ? '취소중…' : '취소'}
            </button>
          </div>
        );
      })}
      {activeWatch && (
        <p className="watch-banner-hint">
          이 슬롯의 자리만 강조 중. 다시 클릭하면 전체 보기로 돌아갑니다.
        </p>
      )}
    </div>
  );
}
