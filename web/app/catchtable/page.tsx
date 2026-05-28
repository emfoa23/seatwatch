import { EventSearch } from '@/app/_components/EventSearch';
import { parseFiltersFromSearch } from '@/lib/parse-filters';

export const dynamic = 'force-dynamic';

export default async function CatchtableIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return <EventSearch site="catchtable" filters={parseFiltersFromSearch(sp)} placeholder="식당 · 지역 · 카테고리 검색" />;
}
