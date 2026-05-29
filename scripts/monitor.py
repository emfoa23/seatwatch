"""monitor-freshness — Valkey/Neon health 체크 + 임계 초과 시 GitHub Issue 생성.

체크 항목:
  - Valkey freshness:<site>:<id> 30분 이상 stale
  - crawl_jobs 직전 1시간 failed/total > 30%
  - watch_targets last_checked_at NULL or > 30분 (active 만)
  - notifications status='failed' 직전 1시간 비율 > 10%

각 위반에 대해 GitHub Issue 생성 (cooldown 1시간, label 'monitor').

metrics/YYYY-MM-DD.json 누적 commit.

Usage:
  python scripts/monitor.py

Env required:
  VALKEY_URL, VALKEY_KEY_PREFIX, DATABASE_URL, GITHUB_TOKEN, GITHUB_REPOSITORY
"""
from __future__ import annotations
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import psycopg
import redis


STALE_FRESHNESS_MIN = 30
JOB_FAIL_THRESHOLD = 0.30
WATCH_STALE_MIN = 30
NOTIF_FAIL_THRESHOLD = 0.10
ISSUE_COOLDOWN_MIN = 60


def now() -> datetime:
    return datetime.now(timezone.utc)


def get_redis() -> redis.Redis:
    url = os.environ['VALKEY_URL']
    return redis.Redis.from_url(url, decode_responses=True)


def get_db() -> psycopg.Connection:
    return psycopg.connect(os.environ['DATABASE_URL'])


PREFIX = os.environ.get('VALKEY_KEY_PREFIX', 'seatwatch:prod')


def check_freshness(rc: redis.Redis) -> list[dict[str, Any]]:
    """Valkey 의 freshness:* 키 timestamp 가 N분 이상 오래된 entry 추출."""
    violations: list[dict[str, Any]] = []
    pattern = f'{PREFIX}:freshness:*'
    keys = list(rc.scan_iter(match=pattern, count=200))
    for k in keys:
        ts_raw = rc.get(k)
        if not ts_raw:
            continue
        try:
            ts = datetime.fromisoformat(ts_raw.replace('Z', '+00:00'))
        except ValueError:
            continue
        age_min = (now() - ts).total_seconds() / 60
        if age_min > STALE_FRESHNESS_MIN:
            violations.append({
                'kind': 'freshness_stale',
                'key': k,
                'age_min': round(age_min, 1),
            })
    return violations


def check_crawl_jobs(conn: psycopg.Connection) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT site,
                      COUNT(*) FILTER (WHERE status='failed') AS failed,
                      COUNT(*) AS total
               FROM crawl_jobs
               WHERE started_at > now() - interval '1 hour'
               GROUP BY site""",
        )
        rows = cur.fetchall()
    out = {'rows': [], 'violations': []}
    for site, failed, total in rows:
        ratio = (failed / total) if total else 0
        out['rows'].append({'site': site, 'failed': failed, 'total': total, 'ratio': round(ratio, 2)})
        if total > 0 and ratio > JOB_FAIL_THRESHOLD:
            out['violations'].append({
                'kind': 'crawl_jobs_failure_rate',
                'site': site,
                'ratio': round(ratio, 2),
                'failed': failed,
                'total': total,
            })
    return out


def check_watch_stale(conn: psycopg.Connection) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT site, COUNT(*)
               FROM watch_targets
               WHERE status='active'
                 AND (last_checked_at IS NULL OR last_checked_at < now() - interval %s)
               GROUP BY site""",
            (f'{WATCH_STALE_MIN} minutes',),
        )
        rows = cur.fetchall()
    return [{'kind': 'watch_stale', 'site': s, 'count': c} for s, c in rows if c > 0]


def check_notifications(conn: psycopg.Connection) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT COUNT(*) FILTER (WHERE status='failed') AS failed,
                      COUNT(*) AS total
               FROM notifications
               WHERE created_at > now() - interval '1 hour'""",
        )
        failed, total = cur.fetchone()
    ratio = (failed / total) if total else 0
    out = {'failed': failed, 'total': total, 'ratio': round(ratio, 2), 'violations': []}
    if total > 0 and ratio > NOTIF_FAIL_THRESHOLD:
        out['violations'].append({
            'kind': 'notifications_failure_rate',
            'ratio': round(ratio, 2),
            'failed': failed,
            'total': total,
        })
    return out


def github_post(path: str, payload: dict) -> dict:
    token = os.environ['GITHUB_TOKEN']
    repo = os.environ['GITHUB_REPOSITORY']
    url = f'https://api.github.com/repos/{repo}{path}'
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def github_get(path: str) -> Any:
    token = os.environ['GITHUB_TOKEN']
    repo = os.environ['GITHUB_REPOSITORY']
    url = f'https://api.github.com/repos/{repo}{path}'
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def create_issue_if_needed(violations: list[dict[str, Any]]) -> str | None:
    if not violations or not os.environ.get('GITHUB_TOKEN'):
        return None

    # cooldown: 최근 ISSUE_COOLDOWN_MIN 분 안에 monitor 라벨 issue 있으면 skip
    open_issues = github_get('/issues?state=open&labels=monitor&per_page=10')
    cutoff = (now() - timedelta(minutes=ISSUE_COOLDOWN_MIN)).isoformat()
    for it in open_issues:
        if it.get('created_at', '') > cutoff:
            print(f'[skip] recent monitor issue exists #{it["number"]}')
            return None

    title = f'[monitor] {len(violations)} alert(s) — {now().strftime("%Y-%m-%d %H:%M UTC")}'
    body_lines = ['# monitor-freshness alerts', '']
    for v in violations:
        body_lines.append(f'- **{v.get("kind")}** — `{json.dumps({k: v[k] for k in v if k != "kind"}, ensure_ascii=False)}`')
    issue = github_post('/issues', {
        'title': title,
        'body': '\n'.join(body_lines),
        'labels': ['monitor'],
    })
    return f'#{issue["number"]}'


def main() -> int:
    rc = get_redis()
    conn = get_db()
    try:
        fresh_v = check_freshness(rc)
        jobs = check_crawl_jobs(conn)
        watch_v = check_watch_stale(conn)
        notif = check_notifications(conn)

        all_v = [*fresh_v, *jobs['violations'], *watch_v, *notif['violations']]
        result = {
            'timestamp': now().isoformat(),
            'freshness_violations': fresh_v,
            'crawl_jobs': jobs,
            'watch_stale': watch_v,
            'notifications': notif,
            'total_violations': len(all_v),
        }

        # metrics 기록
        metrics_dir = Path('metrics')
        metrics_dir.mkdir(exist_ok=True)
        fname = metrics_dir / f'{now().strftime("%Y-%m-%d")}.json'
        history = []
        if fname.exists():
            try:
                history = json.loads(fname.read_text())
            except json.JSONDecodeError:
                history = []
        history.append(result)
        fname.write_text(json.dumps(history, ensure_ascii=False, indent=2))

        issue_ref = create_issue_if_needed(all_v) if all_v else None

        summary = {
            'violations': len(all_v),
            'issue': issue_ref,
            'kinds': sorted({v.get('kind') for v in all_v}) if all_v else [],
        }
        print(json.dumps(summary, ensure_ascii=False))
        return 0
    finally:
        rc.close()
        conn.close()


if __name__ == '__main__':
    sys.exit(main())
