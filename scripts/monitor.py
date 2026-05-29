"""monitor-freshness — lazy fetch 모델 기반 건강성 체크.

Lazy fetch 로 전환 이후 운영 가정:
  - Valkey 의 `freshness:*` / `crawl_jobs` 는 활성 watch_targets 가 cron 으로 폴링할 때만 쌓임
  - 활성 watch_targets 가 없는 경우 freshness 도 정상적으로 비어 있음 (false positive 가드)

체크 항목:
  1) 활성 watch_targets 중 last_checked_at 이 STALE_MIN 분 이상 오래된 site 수 → 알림 cron 미동작 가능성
  2) 직전 1시간 `notifications` failure 비율 > NOTIF_FAIL_THRESHOLD → Resend 또는 worker 이상

각 위반에 대해 GitHub Issue 1건 생성 (cooldown).

Usage:
  python scripts/monitor.py

Env required:
  DATABASE_URL, GITHUB_TOKEN, GITHUB_REPOSITORY
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


WATCH_STALE_MIN = 30
NOTIF_FAIL_THRESHOLD = 0.10
ISSUE_COOLDOWN_MIN = 60


def now() -> datetime:
    return datetime.now(timezone.utc)


def get_db() -> psycopg.Connection:
    return psycopg.connect(os.environ['DATABASE_URL'])


def check_watch_stale(conn: psycopg.Connection) -> list[dict[str, Any]]:
    sql = f"""SELECT site, COUNT(*)
              FROM watch_targets
              WHERE status='active'
                AND (last_checked_at IS NULL OR last_checked_at < now() - interval '{int(WATCH_STALE_MIN)} minutes')
              GROUP BY site"""
    with conn.cursor() as cur:
        cur.execute(sql)
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
    open_issues = github_get('/issues?state=open&labels=monitor&per_page=10')
    cutoff = (now() - timedelta(minutes=ISSUE_COOLDOWN_MIN)).isoformat()
    for it in open_issues:
        if it.get('created_at', '') > cutoff:
            print(f'[skip] recent monitor issue exists #{it["number"]}')
            return None
    title = f'[monitor] {len(violations)} alert(s) — {now().strftime("%Y-%m-%d %H:%M UTC")}'
    body_lines = ['# monitor alerts', '']
    for v in violations:
        body_lines.append(f'- **{v.get("kind")}** — `{json.dumps({k: v[k] for k in v if k != "kind"}, ensure_ascii=False)}`')
    issue = github_post('/issues', {
        'title': title,
        'body': '\n'.join(body_lines),
        'labels': ['monitor'],
    })
    return f'#{issue["number"]}'


def main() -> int:
    conn = get_db()
    try:
        watch_v = check_watch_stale(conn)
        notif = check_notifications(conn)

        all_v = [*watch_v, *notif['violations']]
        result = {
            'timestamp': now().isoformat(),
            'watch_stale': watch_v,
            'notifications': notif,
            'total_violations': len(all_v),
        }

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
        conn.close()


if __name__ == '__main__':
    sys.exit(main())
