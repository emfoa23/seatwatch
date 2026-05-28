import { getSnapshot } from '@/lib/snapshot';
import { TimeSlots } from '@/app/_components/TimeSlots';
import { EventHeader } from '@/app/_components/EventHeader';
import { WatchHandler } from '@/app/_components/WatchHandler';

export const dynamic = 'force-dynamic';

export default async function CatchtablePage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const decoded = decodeURIComponent(shopId);
  const { snapshot, source } = await getSnapshot('catchtable', decoded);
  return (
    <div className="event-page">
      <EventHeader snapshot={snapshot} source={source} />
      <WatchHandler
        site="catchtable"
        externalEventId={decoded}
        eventDatetime={snapshot.eventDatetime}
        selectorMode="time"
      >
        <TimeSlots snapshot={snapshot} />
      </WatchHandler>
    </div>
  );
}
