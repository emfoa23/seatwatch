import { EventSearch } from '@/app/_components/EventSearch';

export const dynamic = 'force-dynamic';

export default async function InterparkIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <EventSearch site="interpark" query={q} placeholder="공연 · 공연장 · 장르 검색" />;
}
