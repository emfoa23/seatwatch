import { EventSearch } from '@/app/_components/EventSearch';

export const dynamic = 'force-dynamic';

export default function MegaboxIndex() {
  return <EventSearch site="megabox" placeholder="영화명 검색" />;
}
