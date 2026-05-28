import { EventSearch } from '@/app/_components/EventSearch';

export const dynamic = 'force-dynamic';

export default async function CatchtableIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <EventSearch site="catchtable" query={q} placeholder="식당 · 지역 · 카테고리 검색" />;
}
