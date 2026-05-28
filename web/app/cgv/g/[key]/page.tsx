import { GroupDetail } from '@/app/_components/GroupDetail';
import { decodeGroupKey } from '@/lib/events';

export const dynamic = 'force-dynamic';

export default async function CgvGroup({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ dt?: string; watch?: string }>;
}) {
  const { key } = await params;
  const { dt, watch } = await searchParams;
  return <GroupDetail site="cgv" groupKey={decodeGroupKey(key)} dt={dt} watch={watch} />;
}
