import { EventSearch } from '@/app/_components/EventSearch';
import { parseFiltersFromSearch } from '@/lib/parse-filters';

export const dynamic = 'force-dynamic';

export default async function MegaboxIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return <EventSearch site="megabox" filters={parseFiltersFromSearch(sp)} placeholder="영화 · 극장 · 지역 검색" />;
}
