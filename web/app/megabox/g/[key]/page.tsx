import { GroupDetail } from '@/app/_components/GroupDetail';
import { decodeGroupKey } from '@/lib/events';

export const dynamic = 'force-dynamic';

export default async function MegaboxGroup({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ eid?: string; day?: string; screen?: string; watch?: string }>;
}) {
  const { key } = await params;
  const { eid, day, screen, watch } = await searchParams;
  return <GroupDetail site="megabox" groupKey={decodeGroupKey(key)} eid={eid} day={day} screen={screen} watch={watch} />;
}
