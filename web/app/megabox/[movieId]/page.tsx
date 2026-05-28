import { getSnapshot } from '@/lib/snapshot';
import { SeatMap } from '@/app/_components/SeatMap';
import { EventHeader } from '@/app/_components/EventHeader';
import { WatchHandler } from '@/app/_components/WatchHandler';
import { WatchBannerList } from '@/app/_components/WatchBannerList';
import { loadAllWatchContexts, resolveHighlight } from '@/lib/watch-context';

export const dynamic = 'force-dynamic';

export default async function MegaboxDetail({
  params,
  searchParams,
}: {
  params: Promise<{ movieId: string }>;
  searchParams: Promise<{ watch?: string }>;
}) {
  const { movieId } = await params;
  const { watch } = await searchParams;
  const decoded = decodeURIComponent(movieId);
  const { snapshot, source } = await getSnapshot('megabox', decoded);
  const contexts = await loadAllWatchContexts('megabox', decoded);
  const highlighted = resolveHighlight(contexts, watch);
  return (
    <div className="event-page">
      <EventHeader snapshot={snapshot} source={source} />
      <WatchBannerList contexts={contexts} />
      <WatchHandler
        site="megabox"
        externalEventId={decoded}
        eventDatetime={snapshot.eventDatetime}
        selectorMode="seat"
      >
        <SeatMap snapshot={snapshot} registered={highlighted} />
      </WatchHandler>
    </div>
  );
}
