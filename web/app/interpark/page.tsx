import { EventSearch } from '@/app/_components/EventSearch';
import { parseFiltersFromSearch } from '@/lib/parse-filters';

export const dynamic = 'force-dynamic';

export default async function InterparkIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return <EventSearch site="interpark" filters={parseFiltersFromSearch(sp)} placeholder="공연 · 공연장 · 장르 검색" />;
}
