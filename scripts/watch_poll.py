"""watch-poll — 활성 watch_targets 의 snapshot 폴링.

Lazy fetch 모델: 검색은 사용자 요청 시점, 좌석은 활성 watch_target 만 매 분 cron 폴링.
폴링이 occupied → available 전환을 감지하면 Valkey notify:queue 에 LPUSH.

흐름:
  1. SELECT * FROM watch_targets WHERE status='active' AND (last_checked_at IS NULL OR last_checked_at < now() - interval '<MIN_MIN> min')
  2. 각 watch 에 대해 Vercel /api/snapshot/<site>/<eid> 호출 (캐시 hit 이면 즉시, miss 이면 fetcher 호출)
  3. snapshot 응답에서 watch_target.seat_selector 에 매칭되는 좌석/시간슬롯의 상태 확인
  4. 직전 snapshot (Valkey snapshot:prev:<watch_id>) 과 비교 → occupied → available 변화 감지
  5. 변화 발생 → notify:queue LPUSH (notify-drain workflow 가 처리)
  6. last_checked_at 갱신

Usage:
  python scripts/watch_poll.py

Env required:
  DATABASE_URL, VALKEY_URL, VALKEY_KEY_PREFIX, PUBLIC_SITE_URL
"""
from __future__ import annotations
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row
import redis


PREFIX = os.environ.get('VALKEY_KEY_PREFIX', 'seatwatch:prod')
PUBLIC_SITE_URL = os.environ.get('PUBLIC_SITE_URL', 'https://seatwatch.vercel.app')
POLL_MIN = int(os.environ.get('WATCH_POLL_MIN', '5'))
MAX_PER_RUN = int(os.environ.get('WATCH_POLL_MAX', '50'))


def now() -> datetime:
    return datetime.now(timezone.utc)


def fetch_snapshot(site: str, eid: str, timeout: int = 30) -> dict[str, Any] | None:
    """Vercel /api/snapshot/<site>/<eid> 호출."""
    url = f'{PUBLIC_SITE_URL}/api/snapshot/{site}/{eid}'
    try:
        req = urllib.request.Request(url, headers={
            'Accept': 'application/json',
            'User-Agent': 'seatwatch-watch-poll/1.0',
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 202:
            # pending — dispatch 발생, 다음 폴링에서 결과 확인
            return None
        print(f'  HTTP {e.code} for {site}/{eid}')
        return None
    except Exception as e:
        print(f'  err {type(e).__name__}: {e}')
        return None


def diff_seats(prev: dict[str, Any] | None, curr: dict[str, Any], selector: dict[str, Any]) -> list[dict[str, Any]]:
    """직전 snapshot 과 비교 → occupied → available 전환 감지.
    selector: {kind:'seat'|'time', values:['A1','A2']} 형태 (또는 단순 seats list).
    """
    if not curr:
        return []
    kind = selector.get('kind', 'seat')
    target_values = set(selector.get('values', []))
    if not target_values:
        return []
    out = []
    if kind == 'seat':
        prev_map = {s['id']: s['status'] for s in (prev or {}).get('seats', []) or []}
        for s in curr.get('seats', []) or []:
            if s['id'] not in target_values:
                continue
            if s['status'] == 'available' and prev_map.get(s['id']) != 'available':
                out.append({'kind': 'seat', 'seat': s})
    elif kind == 'time':
        prev_map = {t['time']: t.get('available', False) for t in (prev or {}).get('timeSlots', []) or []}
        for t in curr.get('timeSlots', []) or []:
            if t['time'] not in target_values:
                continue
            if t.get('available') and not prev_map.get(t['time'], False):
                out.append({'kind': 'time', 'slot': t})
    return out


def push_notification(rc: redis.Redis, watch: dict, change: dict) -> None:
    """notify:queue 에 LPUSH."""
    dedupe = f"{watch['id']}:{change.get('seat', change.get('slot', {})).get('id', change.get('slot', {}).get('time', 'na'))}:{int(time.time() // 1800)}"
    payload = {
        'watch_id': str(watch['id']),
        'user_id': str(watch['user_id']),
        'email': watch['email'],
        'site': watch['site'],
        'event_id': watch['external_event_id'],
        'event_datetime': watch['event_datetime'].isoformat() if hasattr(watch['event_datetime'], 'isoformat') else str(watch['event_datetime']),
        'seat': change.get('seat') or change.get('slot') or {},
        'dedupe_key': dedupe,
    }
    rc.lpush(f'{PREFIX}:notify:queue', json.dumps(payload, ensure_ascii=False))
    print(f'  notify enqueued: {watch["id"]} {payload["seat"]}')


def main() -> int:
    db_url = os.environ['DATABASE_URL']
    valkey_url = os.environ['VALKEY_URL']
    rc = redis.Redis.from_url(valkey_url, decode_responses=True)
    conn = psycopg.connect(db_url, row_factory=dict_row)
    polled = 0
    notified = 0

    try:
        sql = f"""
            SELECT wt.id, wt.user_id, wt.site, wt.external_event_id, wt.event_datetime,
                   wt.seat_selector, u.email
              FROM watch_targets wt
              JOIN users u ON u.id = wt.user_id
             WHERE wt.status='active'
               AND (wt.last_checked_at IS NULL OR wt.last_checked_at < now() - interval '{int(POLL_MIN)} minutes')
             ORDER BY wt.last_checked_at NULLS FIRST
             LIMIT {int(MAX_PER_RUN)}
        """
        with conn.cursor() as cur:
            cur.execute(sql)
            watches = cur.fetchall()

        for w in watches:
            print(f'[poll] {w["site"]}/{w["external_event_id"]} watch={w["id"]}')
            snap = fetch_snapshot(w['site'], w['external_event_id'])
            if snap is None:
                # pending 또는 에러 — last_checked_at 갱신 안 함 (재시도)
                continue

            curr = (snap or {}).get('snapshot') or {}
            prev_raw = rc.get(f'{PREFIX}:watchprev:{w["id"]}')
            prev = json.loads(prev_raw) if prev_raw else None

            changes = diff_seats(prev, curr, dict(w['seat_selector'] or {}))
            for c in changes:
                push_notification(rc, w, c)
                notified += 1

            # prev 갱신 (30분 TTL)
            rc.set(f'{PREFIX}:watchprev:{w["id"]}', json.dumps(curr, ensure_ascii=False), ex=1800)
            # last_checked_at 갱신
            with conn.cursor() as cur2:
                cur2.execute(
                    'UPDATE watch_targets SET last_checked_at=now() WHERE id=%s',
                    (w['id'],),
                )
            polled += 1
            conn.commit()
        print(f'[done] polled={polled} notified={notified}')
        return 0
    finally:
        rc.close()
        conn.close()


if __name__ == '__main__':
    sys.exit(main())
