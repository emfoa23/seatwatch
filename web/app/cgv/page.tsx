import { EventSearch } from '@/app/_components/EventSearch';

export const dynamic = 'force-dynamic';

export default async function CgvIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <EventSearch site="cgv" query={q} placeholder="영화 · 극장 · 지역 검색" />;
}
