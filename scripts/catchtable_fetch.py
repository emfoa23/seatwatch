"""CatchTable fetch (curl_cffi 로 Chrome JA3 fingerprint spoofing).

Cloudflare WAF 우회 — TLS fingerprint 만 흉내내면 통과. Playwright 대비:
- 호출당 ~1-2s (Playwright 30-60s cold start)
- 메모리 매우 적음
- GitHub Actions 무료 분 절약

흐름:
  search 모드 (queries):
    POST ct-api/api/v6/search/list keyword=<q>
    → search:catchtable:<hash> 캐시 + events:catchtable hash 적재
  snapshot 모드 (shopRefs):
    GET  ct-api/api/reservation/v1/dining/day-slots?shopRef=<ref>
    → snapshot:catchtable:<eid>:<dt> 캐시 + freshness 갱신

Env: VALKEY_URL, VALKEY_KEY_PREFIX, MODE (search|snapshot), QUERIES 또는 SHOP_REFS (CSV)
"""
from __future__ import annotations
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from curl_cffi import requests
import redis


PREFIX = os.environ.get('VALKEY_KEY_PREFIX', 'seatwatch:prod')
VALKEY_URL = os.environ['VALKEY_URL']

CT_BASE = 'https://ct-api.catchtable.co.kr'
HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'ko-KR,ko;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://app.catchtable.co.kr',
    'referer': 'https://app.catchtable.co.kr/',
    'x-device-id': '5a1ef292-956f-401e-8577-c917a58bdaf0',
    'x-requested-with': 'XMLHttpRequest',
    'x-transaction-id': '1',
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_query(q: str) -> str:
    return ' '.join(q.strip().lower().split())


def search_key(q: str) -> str:
    h = hashlib.sha256(normalize_query(q).encode()).hexdigest()[:24]
    return f'{PREFIX}:search:catchtable:{h}'


def eid_of(shop_ref: str) -> str:
    return hashlib.sha256(f'catchtable|{shop_ref}|'.encode()).hexdigest()[:16]


def parse_shops_to_entries(json_data: dict) -> tuple[list[dict], dict[str, str]]:
    """CatchTable search 응답 → entries[] + (eid → shopRef) mapping."""
    shops = (json_data.get('data') or {}).get('shopResults', {}).get('shops', [])
    entries = []
    eid_to_ref = {}
    today_kst = (datetime.now(timezone.utc).timestamp() + 9 * 3600)
    dt_iso = f'{datetime.fromtimestamp(today_kst, timezone.utc).strftime("%Y-%m-%d")}T18:00:00+09:00'
    for s in shops or []:
        meta = s.get('shopMeta') or s
        shop_ref = meta.get('shopRef') or meta.get('urlPathAlias')
        title = meta.get('shopName') or meta.get('name')
        if not shop_ref or not title:
            continue
        addr = s.get('shopAddress') or s.get('address') or {}
        region = addr.get('addressLevel1') or meta.get('landName') or ''
        venue = meta.get('landName') or region
        eid = eid_of(shop_ref)
        entries.append({
            'site': 'catchtable',
            'externalEventId': eid,
            'eventDatetime': dt_iso,
            'title': title,
            'venue': venue or '캐치테이블',
            'region': region or None,
            'meta': {'shopRef': shop_ref},
        })
        eid_to_ref[eid] = shop_ref
    # dedupe
    seen = set()
    dedup = []
    for e in entries:
        if e['externalEventId'] in seen:
            continue
        seen.add(e['externalEventId'])
        dedup.append(e)
    return dedup, eid_to_ref


def parse_day_slots(json_data: dict, shop_ref: str) -> list[dict]:
    """day-slots 응답 → timeSlots[]."""
    out = []
    items = json_data.get('data') or []
    for x in items if isinstance(items, list) else []:
        date = x.get('date')
        status = x.get('availableStatus')
        persons = x.get('availablePersonCounts') or []
        if not date:
            continue
        # available = AVAILABLE / OPEN / 그 외
        available = status in ('AVAILABLE', 'OPEN', 'AVAILABLE_FOR_ALL')
        out.append({
            'slotId': f'{shop_ref}-{date}',
            'time': date,
            'available': available,
            'partySize': [min(persons), max(persons)] if persons else [1, 8],
        })
    return out


def do_search(s: requests.Session, r: redis.Redis, query: str) -> bool:
    body = {
        'paging': {'offset': '0', 'size': 30},
        'listType': 'GENERAL',
        'reservationParams': {},
        'notUseSpellCorrection': False,
        'divideType': 'DIVIDE_BY_AVAILABILITY',
        'sort': {'sortType': 'recommended', 'sortChunkSize': 5},
        'userInfo': {'clientGeoPoint': {'lat': 37.5665, 'lon': 126.978}},
        'filters': {
            'legalDistrictCodes': [], 'facilityCodes': [], 'filterTags': [],
            'contractedType': 'CONTRACTED_ONLY',
        },
        'keywordSearch': {'keyword': query},
        'recommendationModel': 'bmk-cwse',
        'useRerank': True,
    }
    try:
        resp = s.post(f'{CT_BASE}/api/v6/search/list', headers=HEADERS, json=body, timeout=15)
    except Exception as e:
        print(f'  fail: {e}')
        return False
    if resp.status_code != 200:
        print(f'  HTTP {resp.status_code}: {resp.text[:200]}')
        return False
    entries, _ = parse_shops_to_entries(resp.json())
    print(f'  parsed entries={len(entries)}')
    if entries:
        pipe = r.pipeline()
        for e in entries:
            pipe.hset(f'{PREFIX}:events:catchtable', e['externalEventId'], json.dumps(e, ensure_ascii=False))
        pipe.set(search_key(query), json.dumps(entries, ensure_ascii=False), ex=60 * 60)
        pipe.execute()
    else:
        r.set(search_key(query), json.dumps([]), ex=60 * 10)
    return True


def do_snapshot(s: requests.Session, r: redis.Redis, shop_ref: str) -> bool:
    url = f'{CT_BASE}/api/reservation/v1/dining/day-slots?shopRef={shop_ref}&tableSeqs=&personCounts='
    try:
        resp = s.get(url, headers=HEADERS, timeout=15)
    except Exception as e:
        print(f'  fail: {e}')
        return False
    if resp.status_code != 200:
        print(f'  HTTP {resp.status_code}: {resp.text[:200]}')
        return False
    slots = parse_day_slots(resp.json(), shop_ref)
    eid = eid_of(shop_ref)
    captured = now_iso()
    today = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + 9 * 3600, timezone.utc).strftime('%Y-%m-%d')
    dt_iso = f'{today}T18:00:00+09:00'
    snap = {
        'site': 'catchtable',
        'externalEventId': eid,
        'eventDatetime': dt_iso,
        'capturedAt': captured,
        'title': '',
        'venue': '',
        'timeSlots': slots,
    }
    r.set(
        f'{PREFIX}:snapshot:catchtable:{eid}:{dt_iso}',
        json.dumps(snap, ensure_ascii=False),
        ex=60 * 5,
    )
    r.set(f'{PREFIX}:freshness:catchtable:{eid}', captured)
    # events index 의 entry.eventDatetime 도 today 로 동기화
    raw = r.hget(f'{PREFIX}:events:catchtable', eid)
    if raw:
        try:
            entry = json.loads(raw)
            entry['eventDatetime'] = dt_iso
            r.hset(f'{PREFIX}:events:catchtable', eid, json.dumps(entry, ensure_ascii=False))
        except Exception:
            pass
    print(f'  slots={len(slots)} eid={eid}')
    return True


def main() -> int:
    mode = (os.environ.get('MODE') or 'search').strip()
    raw = os.environ.get('QUERIES' if mode == 'search' else 'SHOP_REFS', '')
    items = [x.strip() for x in raw.split(',') if x.strip()]
    if not items:
        print(f'no items for mode={mode}')
        return 0
    print(f'[ct-fetch] mode={mode} items={items}')
    s = requests.Session(impersonate='chrome131')
    r = redis.Redis.from_url(VALKEY_URL, decode_responses=True)
    try:
        ok = fail = 0
        for x in items:
            print(f'[ct-fetch] {mode}: {x}')
            success = do_search(s, r, x) if mode == 'search' else do_snapshot(s, r, x)
            if success:
                ok += 1
            else:
                fail += 1
        print(f'[ct-fetch] done ok={ok} fail={fail}')
        return 0 if (ok > 0 or fail == 0) else 1
    finally:
        r.close()


if __name__ == '__main__':
    sys.exit(main())
