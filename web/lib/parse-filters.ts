import type { EventFilters } from './events';

export function parseFiltersFromSearch(sp: Record<string, string | undefined>): EventFilters {
  return {
    query: sp.q,
    dateFrom: sp.date_from || undefined,
    dateTo: sp.date_to || undefined,
    timeFrom: sp.time_from || undefined,
    timeTo: sp.time_to || undefined,
  };
}
