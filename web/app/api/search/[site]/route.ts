import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getCachedSearch, setCachedSearch, checkRateLimit, RateLimitError } from '@/lib/cache';
import { getFetcher } from '@/lib/fetcher';
import { indexEvent } from '@/lib/events';
import type { Site } from '@/lib/types/seat';

const SITES: Site[] = ['cgv', 'megabox', 'lotte', 'interpark', 'catchtable'];
const querySchema = z.string().trim().min(1).max(60);

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ site: string }> }
) {
  const { site: siteRaw } = await params;
  if (!SITES.includes(siteRaw as Site)) {
    return NextResponse.json({ error: 'invalid_site' }, { status: 400 });
  }
  const site = siteRaw as Site;

  const url = new URL(req.url);
  const q = querySchema.safeParse(url.searchParams.get('q'));
  if (!q.success) {
    return NextResponse.json({ error: 'invalid_query', detail: '검색어는 1-60자' }, { status: 400 });
  }

  // Rate limit — IP 기준 분당 30회 (검색)
  const session = await auth();
  const userKey = session?.user?.id ?? (req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'anon');
  try {
    await checkRateLimit(`search:${userKey}`, 30, 60);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'rate_limit', retryAfter: e.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(e.retryAfterSec) } },
      );
    }
    throw e;
  }

  // 1) Cache hit?
  const cached = await getCachedSearch(site, q.data);
  if (cached) {
    return NextResponse.json({ source: 'cache', entries: cached });
  }

  // 2) Lazy fetch
  const fetcher = await getFetcher(site);
  try {
    const result = await fetcher.search(q.data);
    // Index events (for groupKeyForEvent + watch deep link)
    await Promise.all(result.entries.map((e) => indexEvent(e).catch(() => null)));
    await setCachedSearch(site, q.data, result.entries);
    return NextResponse.json({ source: 'fetch', entries: result.entries });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ source: 'error', error: msg, entries: [] }, { status: 502 });
  }
}
