"""CGV fetch — curl_cffi (Chrome131 TLS) + HMAC-SHA256 signature 자체 생성.

알고리즘 (JS bundle 의 chunks_1453 에서 역추출):
  signature = base64(HMAC-SHA256(secret, f"{timestamp}|{pathname}|{body}"))
  secret = "ydqXY0ocnFLmJGHr_zNzFcpjwAsXq_8JcBNURAkRscg"
  헤더: X-TIMESTAMP, X-SIGNATURE

흐름:
  search 모드 (queries): /tme/more/itgrSrch/searchItgrSrchAll → entries + 캐시 적재
  snapshot 모드 (movNos): 모든 인기 극장 × searchSchByMov → timeSlots 합쳐 적재

Env: VALKEY_URL, VALKEY_KEY_PREFIX, MODE (search|snapshot), QUERIES or MOV_NOS
"""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import urlparse
from curl_cffi import requests
import redis


PREFIX = os.environ.get('VALKEY_KEY_PREFIX', 'seatwatch:prod')
VALKEY_URL = os.environ['VALKEY_URL']
SECRET = b'ydqXY0ocnFLmJGHr_zNzFcpjwAsXq_8JcBNURAkRscg'
CGV_BASE = 'https://api.cgv.co.kr'
CO_CD = 'A420'

# 서울/수도권 인기 극장 (siteInfo 의 regnGrpCd='01'/'02')
# 검증된 siteNo. 운영 중 갱신은 searchAllRegionAndSite 로 동기화.
DEFAULT_SITE_NOS = [
    '0056', '0008', '0036', '0024', '0064',  # 강남, 용산, 영등포, 왕십리, 청담씨네시티
    '0044', '0040', '0052', '0058', '0011',  # 동대문, 압구정, 구로, 천호, 상암
    '0202', '0102', '0120',                   # 분당, 오리, 일산
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_ymd_kst() -> str:
    return datetime.fromtimestamp(time.time() + 9 * 3600, timezone.utc).strftime('%Y%m%d')


def sign(url: str, body: str = '') -> tuple[str, str]:
    pn = urlparse(url).path
    t = str(int(time.time()))
    sig = base64.b64encode(hmac.new(SECRET, f'{t}|{pn}|{body}'.encode(), hashlib.sha256).digest()).decode()
    return t, sig


def signed_headers(url: str, body: str = '') -> dict[str, str]:
    t, sig = sign(url, body)
    return {
        'accept': 'application/json',
        'accept-language': 'ko-KR,ko;q=0.9',
        'origin': 'https://cgv.co.kr',
        'referer': 'https://cgv.co.kr/',
        'X-TIMESTAMP': t,
        'X-SIGNATURE': sig,
    }


def normalize_query(q: str) -> str:
    return ' '.join(q.strip().lower().split())


def search_key(q: str) -> str:
    h = hashlib.sha256(normalize_query(q).encode()).hexdigest()[:24]
    return f'{PREFIX}:search:cgv:{h}'


def parse_movies_to_entries(d: dict) -> list[dict]:
    """searchItgrSrchAll 응답 → entries[]."""
    data = d.get('data') or {}
    lists = [
        (data.get('atktPsblMovInfo') or {}).get('atktPsblMovLst') or [],
        data.get('atktPsblMovTop10Lst') or [],
        (data.get('movInfo') or {}).get('movLst') or [],
    ]
    out: dict[str, dict] = {}
    for lst in lists:
        for m in lst:
            title = m.get('movNm') or m.get('movieNm')
            mov_no = str(m.get('movNo') or m.get('movieNo') or '').strip()
            if not title or not mov_no:
                continue
            release = m.get('rlsYmd') or ''
            if release and len(release) >= 8:
                dt = f'{release[:4]}-{release[4:6]}-{release[6:8]}T19:00:00+09:00'
            else:
                kst = datetime.fromtimestamp(time.time() + 9 * 3600, timezone.utc)
                dt = f'{kst.strftime("%Y-%m-%d")}T19:00:00+09:00'
            eid = f'cgv_{mov_no}'[:16]
            if eid in out:
                continue
            out[eid] = {
                'site': 'cgv',
                'externalEventId': eid,
                'eventDatetime': dt,
                'title': title,
                'venue': 'CGV',
                'meta': {'movNo': mov_no},
            }
    return list(out.values())


def parse_schedules_to_slots(items: list[dict]) -> list[dict]:
    """searchSchByMov 응답 → timeSlots[]."""
    out = []
    for x in items or []:
        scnsrt = x.get('scnsrtTm', '')  # "1920"
        scnend = x.get('scnendTm', '')  # "2137"
        scn_ymd = x.get('scnYmd', '')
        if not scnsrt or not scn_ymd:
            continue
        st = f'{scnsrt[:2]}:{scnsrt[2:]}' if len(scnsrt) >= 4 else scnsrt
        et = f'{scnend[:2]}:{scnend[2:]}' if len(scnend) >= 4 else scnend
        d_label = f'{scn_ymd[:4]}-{scn_ymd[4:6]}-{scn_ymd[6:8]}'
        remain = int(x.get('frSeatCnt') or 0)
        capacity = int(x.get('stcnt') or 0)
        slot_id = f'{x.get("siteNo","")}-{x.get("scnsNo","")}-{scn_ymd}-{x.get("scnSseq","")}'
        out.append({
            'slotId': slot_id,
            'time': f'{d_label} {st}~{et}',
            'remain': remain,
            'capacity': capacity if capacity > 0 else None,
            'available': remain > 0,
            'venue': x.get('siteNm') or '',
            'screen': x.get('expoScnsNm') or x.get('scnsNm') or '',
        })
    return out


def do_search(s: requests.Session, r: redis.Redis, query: str) -> bool:
    from urllib.parse import quote
    url = f'{CGV_BASE}/tme/more/itgrSrch/searchItgrSrchAll?coCd={CO_CD}&swrd={quote(query)}&lmtSrchYn=Y'
    try:
        resp = s.get(url, headers=signed_headers(url), timeout=15)
    except Exception as e:
        print(f'  fail: {e}'); return False
    if resp.status_code != 200:
        print(f'  HTTP {resp.status_code}: {resp.text[:200]}'); return False
    entries = parse_movies_to_entries(resp.json())
    print(f'  parsed entries={len(entries)}')
    if entries:
        pipe = r.pipeline()
        for e in entries:
            pipe.hset(f'{PREFIX}:events:cgv', e['externalEventId'], json.dumps(e, ensure_ascii=False))
        pipe.set(search_key(query), json.dumps(entries, ensure_ascii=False), ex=60 * 60)
        pipe.execute()
    else:
        r.set(search_key(query), json.dumps([]), ex=60 * 10)
    return True


def fetch_one_site(session: requests.Session, mov_no: str, site_no: str, ymd: str) -> list[dict]:
    url = (
        f'{CGV_BASE}/cnm/atkt/searchSchByMov'
        f'?coCd={CO_CD}&movNo={mov_no}&siteNo={site_no}&scnYmd={ymd}&rtctlScopCd=08'
    )
    try:
        resp = session.get(url, headers=signed_headers(url), timeout=10)
    except Exception:
        return []
    if resp.status_code != 200:
        return []
    try:
        d = resp.json()
        return d.get('data') or []
    except Exception:
        return []


def do_snapshot(s: requests.Session, r: redis.Redis, mov_no: str) -> bool:
    today = today_ymd_kst()
    eid = f'cgv_{mov_no}'[:16]
    all_schedules: list[dict] = []
    # 인기 극장 ~15개 병렬 호출 (curl_cffi 의 session 은 thread-safe 아니라 ThreadPool 안에서 새 세션)
    def task(site_no: str) -> list[dict]:
        sub_s = requests.Session(impersonate='chrome131')
        try:
            return fetch_one_site(sub_s, mov_no, site_no, today)
        finally:
            sub_s.close()

    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = [ex.submit(task, sn) for sn in DEFAULT_SITE_NOS]
        for f in as_completed(futures):
            try:
                rows = f.result()
                all_schedules.extend(rows)
            except Exception:
                pass

    slots = parse_schedules_to_slots(all_schedules)
    slots.sort(key=lambda x: x['time'])
    title = all_schedules[0].get('expoProdNm') or all_schedules[0].get('movNm') or '' if all_schedules else ''

    captured = now_iso()
    dt_iso = f'{today[:4]}-{today[4:6]}-{today[6:8]}T19:00:00+09:00'
    snap = {
        'site': 'cgv',
        'externalEventId': eid,
        'eventDatetime': dt_iso,
        'capturedAt': captured,
        'title': title,
        'venue': 'CGV',
        'timeSlots': slots,
    }
    r.set(
        f'{PREFIX}:snapshot:cgv:{eid}:{dt_iso}',
        json.dumps(snap, ensure_ascii=False),
        ex=60 * 5,
    )
    r.set(f'{PREFIX}:freshness:cgv:{eid}', captured)
    # events index 의 entry.eventDatetime 도 today 로 동기화 (Vercel snapshot route 가 캐시 hit 하도록)
    raw = r.hget(f'{PREFIX}:events:cgv', eid)
    if raw:
        try:
            entry = json.loads(raw)
            entry['eventDatetime'] = dt_iso
            if title:
                entry['title'] = title
            r.hset(f'{PREFIX}:events:cgv', eid, json.dumps(entry, ensure_ascii=False))
        except Exception:
            pass
    print(f'  slots={len(slots)} title={title}')
    return True


def main() -> int:
    mode = (os.environ.get('MODE') or 'search').strip()
    raw = os.environ.get('QUERIES' if mode == 'search' else 'MOV_NOS', '')
    items = [x.strip() for x in raw.split(',') if x.strip()]
    if not items:
        print(f'no items for mode={mode}')
        return 0
    print(f'[cgv-fetch] mode={mode} items={items}')
    s = requests.Session(impersonate='chrome131')
    r = redis.Redis.from_url(VALKEY_URL, decode_responses=True)
    try:
        ok = fail = 0
        for x in items:
            print(f'[cgv-fetch] {mode}: {x}')
            success = do_search(s, r, x) if mode == 'search' else do_snapshot(s, r, x)
            if success:
                ok += 1
            else:
                fail += 1
        print(f'[cgv-fetch] done ok={ok} fail={fail}')
        return 0 if (ok > 0 or fail == 0) else 1
    finally:
        s.close()
        r.close()


if __name__ == '__main__':
    sys.exit(main())
