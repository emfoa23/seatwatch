import { GroupDetail } from '@/app/_components/GroupDetail';
import { decodeGroupKey } from '@/lib/events';

export const dynamic = 'force-dynamic';

export default async function CatchtableGroup({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ dt?: string }>;
}) {
  const { key } = await params;
  const { dt } = await searchParams;
  return <GroupDetail site="catchtable" groupKey={decodeGroupKey(key)} dt={dt} />;
}
