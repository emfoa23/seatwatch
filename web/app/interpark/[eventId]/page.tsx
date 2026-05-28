import { getSnapshot } from '@/lib/snapshot';
import { SeatMap } from '@/app/_components/SeatMap';
import { EventHeader } from '@/app/_components/EventHeader';

export const dynamic = 'force-dynamic';

export default async function InterparkPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { snapshot, source } = await getSnapshot('interpark', eventId);
  return (
    <div className="event-page">
      <EventHeader snapshot={snapshot} source={source} />
      <SeatMap snapshot={snapshot} />
    </div>
  );
}
