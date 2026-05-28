import { getSnapshot } from '@/lib/snapshot';
import { SeatMap } from '@/app/_components/SeatMap';
import { EventHeader } from '@/app/_components/EventHeader';
import { WatchHandler } from '@/app/_components/WatchHandler';

export const dynamic = 'force-dynamic';

export default async function InterparkPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const decoded = decodeURIComponent(eventId);
  const { snapshot, source } = await getSnapshot('interpark', decoded);
  return (
    <div className="event-page">
      <EventHeader snapshot={snapshot} source={source} />
      <WatchHandler
        site="interpark"
        externalEventId={decoded}
        eventDatetime={snapshot.eventDatetime}
        selectorMode="seat"
      >
        <SeatMap snapshot={snapshot} />
      </WatchHandler>
    </div>
  );
}
