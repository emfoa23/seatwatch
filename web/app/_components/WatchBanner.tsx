import type { WatchContext } from '@/lib/watch-context';

export function WatchBanner({ ctx }: { ctx: WatchContext }) {
  const desc = ctx.selectorKind === 'multi-time'
    ? `시간대 ${ctx.registered.join(', ')} · ${ctx.partySize ?? 1}명 예약`
    : ctx.selectorKind === 'multi-seat'
      ? `좌석 ${ctx.registered.join(', ')}${(ctx.adjacency ?? 1) > 1 ? ` · ${ctx.adjacency}명 연속` : ''}`
      : `${ctx.registered.join(', ')}`;
  return (
    <div className="watch-banner">
      <span className="watch-banner-tag">알림 등록됨</span>
      <span className="watch-banner-desc">{desc}</span>
      <span className="watch-banner-hint">표시된 자리에 노란 outline 으로 강조됩니다.</span>
    </div>
  );
}
