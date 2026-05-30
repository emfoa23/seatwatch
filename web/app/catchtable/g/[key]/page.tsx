import { GroupDetail } from '@/app/_components/GroupDetail';
import { decodeGroupKey } from '@/lib/events';

export const dynamic = 'force-dynamic';

export default async function CatchtableGroup({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ watch?: string }>;
}) {
  const { key } = await params;
  const { watch } = await searchParams;
  return <GroupDetail site="catchtable" groupKey={decodeGroupKey(key)} watch={watch} />;
}
