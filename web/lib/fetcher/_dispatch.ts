/**
 * GitHub Actions `playwright-fetch` workflow 트리거 + 짧은 polling.
 *
 * 흐름:
 *   1) Valkey cache miss 시 fetcher.search() 가 호출됨
 *   2) 같은 query 가 in-flight 인지 확인 (Valkey lock 5분 TTL) — 중복 트리거 방지
 *   3) workflow_dispatch 호출 → workflow 가 캐시 적재
 *   4) 짧게 (최대 ~25초) polling 으로 캐시 hit 대기 — 첫 호출은 그래도 ~30-60s 대기 가능
 *   5) 캐시 hit 못 잡으면 throw 'pending' → search route 가 202 응답
 *
 * Vercel 환경변수:
 *   GITHUB_OWNER, GITHUB_REPO, GITHUB_DISPATCH_TOKEN (workflow scope PAT)
 */
import { valkey } from '@/lib/valkey';
import { getCachedSearch, getCachedSnapshot } from '@/lib/cache';
import type { EventIndexEntry, SeatSnapshot, Site } from '@/lib/types/seat';

export class PendingError extends Error {
  constructor(message = 'pending') {
    super(message);
    this.name = 'PendingError';
  }
}

const OWNER = process.env.GITHUB_OWNER ?? 'emfoa23';
const REPO = process.env.GITHUB_REPO ?? 'seatwatch';
const TOKEN = process.env.GITHUB_DISPATCH_TOKEN;
const WORKFLOW_FILE = 'playwright-fetch.yml';

async function triggerWorkflow(site: Site | string, query: string): Promise<void> {
  if (!TOKEN) {
    throw new Error('GITHUB_DISPATCH_TOKEN 미설정 — Vercel env 에 PAT 등록 필요');
  }
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: { site, queries: query },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`workflow_dispatch ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * 캐시 miss → workflow 트리거 + 짧은 polling.
 * @param holdoff in-flight lock TTL (초). 같은 query 중복 트리거 방지.
 * @param pollMs polling 간격
 * @param maxWaitMs polling 총 시간
 */
export async function dispatchAndWait(
  site: Site,
  query: string,
  opts: { holdoff?: number; pollMs?: number; maxWaitMs?: number } = {},
): Promise<EventIndexEntry[]> {
  const holdoff = opts.holdoff ?? 300; // 5분
  const pollMs = opts.pollMs ?? 2_000;
  const maxWaitMs = opts.maxWaitMs ?? 25_000;

  const lockKey = `dispatch:${site}:${query}`;
  const acquired = await valkey.set(lockKey, '1', 'EX', holdoff, 'NX');
  if (acquired === 'OK') {
    // 처음 트리거하는 경우만 실제 dispatch
    try {
      await triggerWorkflow(site, query);
    } catch (e) {
      // dispatch 실패 시 lock 해제 + throw
      await valkey.del(lockKey);
      throw e;
    }
  }

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const cached = await getCachedSearch(site, query);
    if (cached) return cached;
  }
  throw new PendingError(
    `데이터 수집 중 — 잠시 후 다시 검색해 주세요 (${site}/${query})`,
  );
}

/**
 * Snapshot 용 dispatch — workflow 가 (예: catchtable-snapshot) shopRef 받아 timeslot 적재.
 * lock 은 (workflowSite, externalEventId) 단위. 캐시 hit 까지 polling.
 */
export async function dispatchSnapshot(
  workflowSite: string,
  externalEventId: string,
  eventDatetime: string,
  opts: { holdoff?: number; pollMs?: number; maxWaitMs?: number; cacheSite?: Site } = {},
): Promise<SeatSnapshot> {
  const holdoff = opts.holdoff ?? 300;
  const pollMs = opts.pollMs ?? 2_000;
  const maxWaitMs = opts.maxWaitMs ?? 25_000;
  const cacheSite = opts.cacheSite ?? 'catchtable';

  const lockKey = `dispatch:${workflowSite}:${externalEventId}`;
  const acquired = await valkey.set(lockKey, '1', 'EX', holdoff, 'NX');
  if (acquired === 'OK') {
    try {
      await triggerWorkflow(workflowSite, externalEventId);
    } catch (e) {
      await valkey.del(lockKey);
      throw e;
    }
  }
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const cached = await getCachedSnapshot(cacheSite, externalEventId, eventDatetime);
    if (cached) return cached;
  }
  throw new PendingError(
    `좌석/타임슬롯 수집 중 — 잠시 후 다시 시도 (${workflowSite}/${externalEventId})`,
  );
}
