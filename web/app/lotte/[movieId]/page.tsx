import { getSnapshot } from '@/lib/snapshot';
import { SeatMap } from '@/app/_components/SeatMap';
import { EventHeader } from '@/app/_components/EventHeader';
import { WatchHandler } from '@/app/_components/WatchHandler';

export const dynamic = 'force-dynamic';

export default async function LotteDetail({ params }: { params: Promise<{ movieId: string }> }) {
  const { movieId } = await params;
  const decoded = decodeURIComponent(movieId);
  const { snapshot, source } = await getSnapshot('lotte', decoded);
  return (
    <div className="event-page">
      <EventHeader snapshot={snapshot} source={source} />
      <WatchHandler
        site="lotte"
        externalEventId={decoded}
        eventDatetime={snapshot.eventDatetime}
        selectorMode="seat"
      >
        <SeatMap snapshot={snapshot} />
      </WatchHandler>
    </div>
  );
}
