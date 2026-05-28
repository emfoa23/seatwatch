import { getSnapshot } from '@/lib/snapshot';
import { SeatMap } from '@/app/_components/SeatMap';
import { EventHeader } from '@/app/_components/EventHeader';

export const dynamic = 'force-dynamic';

export default async function CgvPage({ params }: { params: Promise<{ movieId: string }> }) {
  const { movieId } = await params;
  const { snapshot, source } = await getSnapshot('cgv', movieId);
  return (
    <div className="event-page">
      <EventHeader snapshot={snapshot} source={source} />
      <SeatMap snapshot={snapshot} />
    </div>
  );
}
