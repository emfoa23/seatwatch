import { EventSearch } from '@/app/_components/EventSearch';

export const dynamic = 'force-dynamic';

export default function CgvIndex() {
  return <EventSearch site="cgv" placeholder="영화명 검색" />;
}
