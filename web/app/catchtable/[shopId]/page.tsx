import { getSnapshot } from '@/lib/snapshot';
import { TimeSlots } from '@/app/_components/TimeSlots';
import { EventHeader } from '@/app/_components/EventHeader';

export const dynamic = 'force-dynamic';

export default async function CatchtablePage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const { snapshot, source } = await getSnapshot('catchtable', shopId);
  return (
    <div className="event-page">
      <EventHeader snapshot={snapshot} source={source} />
      <TimeSlots snapshot={snapshot} />
    </div>
  );
}
