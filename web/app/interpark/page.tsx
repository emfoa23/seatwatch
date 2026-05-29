import { EventSearch } from '@/app/_components/EventSearch';

export const dynamic = 'force-dynamic';

export default function InterparkIndex() {
  return <EventSearch site="interpark" placeholder="공연명 검색" />;
}
