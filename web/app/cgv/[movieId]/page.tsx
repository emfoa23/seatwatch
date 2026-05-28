import { getSnapshot } from '@/lib/snapshot';
import { SeatMap } from '@/app/_components/SeatMap';
import { EventHeader } from '@/app/_components/EventHeader';
import { WatchHandler } from '@/app/_components/WatchHandler';
import { WatchBanner } from '@/app/_components/WatchBanner';
import { loadWatchContext } from '@/lib/watch-context';

export const dynamic = 'force-dynamic';

export default async function CgvPage({
  params,
  searchParams,
}: {
  params: Promise<{ movieId: string }>;
  searchParams: Promise<{ watch?: string }>;
}) {
  const { movieId } = await params;
  const { watch } = await searchParams;
  const decoded = decodeURIComponent(movieId);
  const { snapshot, source } = await getSnapshot('cgv', decoded);
  const ctx = await loadWatchContext('cgv', decoded, watch);
  return (
    <div className="event-page">
      <EventHeader snapshot={snapshot} source={source} />
      {ctx && <WatchBanner ctx={ctx} />}
      <WatchHandler
        site="cgv"
        externalEventId={decoded}
        eventDatetime={snapshot.eventDatetime}
        selectorMode="seat"
      >
        <SeatMap snapshot={snapshot} registered={ctx?.registered ?? []} />
      </WatchHandler>
    </div>
  );
}
