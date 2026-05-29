import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getCachedSnapshot,
  setCachedSnapshot,
  checkRateLimit,
  RateLimitError,
} from '@/lib/cache';
import { getFetcher } from '@/lib/fetcher';
import { getEventIndexEntry } from '@/lib/events';
import type { Site } from '@/lib/types/seat';

const SITES: Site[] = ['cgv', 'megabox', 'lotte', 'interpark', 'catchtable'];

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ site: string; eid: string }> },
) {
  const { site: siteRaw, eid } = await params;
  if (!SITES.includes(siteRaw as Site)) {
    return NextResponse.json({ error: 'invalid_site' }, { status: 400 });
  }
  const site = siteRaw as Site;

  // Rate limit (IP 또는 user) — 분당 60회 (좌석 조회는 검색보다 후하게)
  const session = await auth();
  const userKey =
    session?.user?.id ?? (req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'anon');
  try {
    await checkRateLimit(`snapshot:${userKey}`, 60, 60);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'rate_limit', retryAfter: e.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(e.retryAfterSec) } },
      );
    }
    throw e;
  }

  // 1) Event index 에서 datetime resolve (cache key 의 일부)
  const entry = await getEventIndexEntry(site, eid);
  if (!entry) {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }

  // 2) Cache hit
  const cached = await getCachedSnapshot(site, eid, entry.eventDatetime);
  if (cached) {
    return NextResponse.json({ source: 'cache', snapshot: cached });
  }

  // 3) Lazy fetch
  const fetcher = await getFetcher(site);
  try {
    const snap = await fetcher.snapshot(eid, entry.eventDatetime);
    await setCachedSnapshot(snap);
    return NextResponse.json({ source: 'fetch', snapshot: snap });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ source: 'error', error: msg }, { status: 502 });
  }
}
