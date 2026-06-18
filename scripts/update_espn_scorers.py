#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OUT = Path('data/espn-scorers.json')
ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event={event_id}'

EVENTS = {
    1:'66456904', 2:'66456906', 3:'66456916', 4:'66456940', 5:'66456930', 6:'66456942',
    7:'66456928', 8:'66456918', 9:'66457072', 10:'66457070', 11:'66456968', 12:'66456970',
    13:'66456996', 14:'66456994', 15:'66456984', 16:'66456982', 17:'66457006', 18:'66457008',
    19:'66457018', 20:'66457020', 21:'66457044', 22:'66457042', 23:'66457030', 24:'66457032',
    25:'66456910', 26:'66456922', 27:'66456920', 28:'66456908', 29:'66456932', 30:'66456934',
    31:'66456946', 32:'66456944', 33:'66456972', 34:'66457074', 35:'66457076', 36:'66456974',
    37:'66456998', 38:'66456986', 39:'66457000', 40:'66456988', 41:'66457022', 42:'66457010',
    43:'66457012', 44:'66457024', 45:'66457034', 46:'66457046', 47:'66457048', 48:'66457036',
    49:'66456924', 50:'66456926', 51:'66456936', 52:'66456938', 53:'66456912', 54:'66456914',
    55:'66457078', 56:'66457080', 57:'66456976', 58:'66456978', 59:'66456948', 60:'66456950',
    61:'66457014', 62:'66457016', 63:'66457002', 64:'66457004', 65:'66456990', 66:'66456992',
    67:'66457050', 68:'66457052', 69:'66457038', 70:'66457040', 71:'66457026', 72:'66457028',
}


def norm(s: object) -> str:
    raw = str(s or '').lower()
    raw = unicodedata.normalize('NFD', raw)
    raw = ''.join(ch for ch in raw if unicodedata.category(ch) != 'Mn')
    raw = re.sub(r'[^a-z0-9]+', ' ', raw)
    return raw.strip()


def get_first(d: dict, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, ''):
            return d[k]
    return default


def fetch_json(event_id: str) -> dict | None:
    req = Request(ESPN_URL.format(event_id=event_id), headers={
        'User-Agent': 'Mozilla/5.0 VM26 updater',
        'Accept': 'application/json,text/plain,*/*',
    })
    try:
        with urlopen(req, timeout=25) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f'WARN event {event_id}: {exc}', file=sys.stderr)
        return None


def competition(summary: dict) -> dict | None:
    header_comp = summary.get('header', {}).get('competitions') or []
    if header_comp:
        return header_comp[0]
    comps = summary.get('competitions') or []
    return comps[0] if comps else None


def team_names(summary: dict) -> dict:
    comp = competition(summary) or {}
    out = {'home': '', 'away': '', 'map': {}}
    for c in comp.get('competitors') or []:
        side = c.get('homeAway') or ''
        team = c.get('team') or {}
        display = get_first(team, 'displayName', 'shortDisplayName', 'name', 'location', 'abbreviation', default='')
        if side in ('home', 'away'):
            out[side] = display
        for val in [team.get('id'), team.get('displayName'), team.get('shortDisplayName'), team.get('name'), team.get('location'), team.get('abbreviation')]:
            if val:
                out['map'][norm(val)] = display
                out['map'][str(val)] = display
    return out


def status_and_score(summary: dict) -> tuple[str | None, int | None, int | None]:
    comp = competition(summary) or {}
    status_type = (comp.get('status') or {}).get('type') or {}
    status = None
    if status_type.get('completed'):
        status = 'finished'
    elif status_type.get('state') == 'in' or status_type.get('name') == 'STATUS_IN_PROGRESS':
        status = 'live'
    elif status_type.get('state') == 'pre':
        status = 'scheduled'

    home = away = None
    for c in comp.get('competitors') or []:
        try:
            score = int(c.get('score'))
        except (TypeError, ValueError):
            continue
        if c.get('homeAway') == 'home':
            home = score
        if c.get('homeAway') == 'away':
            away = score
    return status, home, away


def clock_minute(clock) -> str:
    if isinstance(clock, dict):
        display = get_first(clock, 'displayValue', 'display', 'text', default='')
        if display and re.search(r'\d', str(display)):
            return re.sub(r'\s+', '', str(display)).replace('’', "'").replace('′', "'")
        value = clock.get('value')
        if isinstance(value, (int, float)) and value > 0:
            return f"{math.ceil(value / 60)}'"
    if isinstance(clock, str) and re.search(r'\d', clock):
        return re.sub(r'\s+', '', clock).replace('’', "'").replace('′', "'")
    return ''


def all_candidate_plays(summary: dict) -> list[dict]:
    plays: list[dict] = []
    for key in ('scoringPlays', 'scoringplays', 'plays', 'commentary'):
        if isinstance(summary.get(key), list):
            plays.extend(x for x in summary[key] if isinstance(x, dict))
    comp = competition(summary) or {}
    for key in ('details', 'plays', 'commentary'):
        if isinstance(comp.get(key), list):
            plays.extend(x for x in comp[key] if isinstance(x, dict))
    comps = summary.get('competitions') or []
    if comps:
        for key in ('details', 'plays', 'commentary'):
            if isinstance(comps[0].get(key), list):
                plays.extend(x for x in comps[0][key] if isinstance(x, dict))
    drives = summary.get('drives') or {}
    for d in drives.get('previous') or []:
        if isinstance(d, dict) and isinstance(d.get('plays'), list):
            plays.extend(x for x in d['plays'] if isinstance(x, dict))
    # Deduplicate roughly by id/text/clock
    seen = set()
    unique = []
    for p in plays:
        key = (p.get('id'), p.get('text') or p.get('shortText') or p.get('displayText'), json.dumps(p.get('clock'), sort_keys=True, ensure_ascii=False))
        if key in seen:
            continue
        seen.add(key)
        unique.append(p)
    return unique


def is_goal_play(play: dict) -> bool:
    if play.get('scoringPlay') is True:
        return True
    try:
        if float(play.get('scoreValue') or 0) > 0:
            return True
    except (TypeError, ValueError):
        pass
    blob = ' '.join(str(x or '') for x in [
        (play.get('type') or {}).get('text'),
        (play.get('type') or {}).get('name'),
        play.get('text'), play.get('shortText'), play.get('displayText')
    ])
    n = norm(blob)
    if 'own goal' in n:
        return True
    return bool(re.search(r'\bgoal\b', n)) and 'yellow' not in n and 'red card' not in n


def player_name(play: dict) -> str:
    for key in ('athletesInvolved', 'participants', 'involvedAthletes', 'athletes'):
        arr = play.get(key)
        if isinstance(arr, list):
            for item in arr:
                if not isinstance(item, dict):
                    continue
                for node in (item, item.get('athlete') or {}, item.get('player') or {}):
                    if isinstance(node, dict):
                        name = get_first(node, 'displayName', 'fullName', 'shortName', default='')
                        if name:
                            return str(name)
    text = str(get_first(play, 'text', 'shortText', 'displayText', default='')).strip()
    m = re.match(r"^([^,(]+?)\s*(?:\(|,| scores| scored| Goal| goal)", text)
    return (m.group(1).strip() if m else text).strip()


def team_for_play(play: dict, names: dict) -> str:
    team = play.get('team') or {}
    if isinstance(team, dict):
        for val in [team.get('id'), team.get('displayName'), team.get('shortDisplayName'), team.get('name'), team.get('location'), team.get('abbreviation')]:
            if val and (str(val) in names['map'] or norm(val) in names['map']):
                return names['map'].get(str(val)) or names['map'].get(norm(val)) or ''
    text = norm(' '.join(str(get_first(play, 'text', 'shortText', 'displayText', default='')).split()))
    for side in ('home', 'away'):
        if names.get(side) and norm(names[side]) in text:
            return names[side]
    return ''


def goals_from_summary(summary: dict) -> list[dict]:
    names = team_names(summary)
    goals: list[dict] = []
    for play in all_candidate_plays(summary):
        if not is_goal_play(play):
            continue
        name = player_name(play)
        if not name:
            continue
        text = ' '.join(str(get_first(play, 'text', 'shortText', 'displayText', default='')).split())
        goals.append({
            'team': team_for_play(play, names),
            'player': name,
            'minute': clock_minute(play.get('clock') or play.get('time') or play.get('periodClock')),
            'ownGoal': bool(re.search(r'own goal|selvmål', text, re.I)),
            'note': 'straffe' if re.search(r'penalty|straffe', text, re.I) else '',
        })
    return goals


def main() -> int:
    rows = []
    errors = []
    for match_no, event_id in EVENTS.items():
        summary = fetch_json(event_id)
        if not summary:
            errors.append({'matchNumber': match_no, 'eventId': event_id, 'error': 'fetch failed'})
            continue
        status, home_score, away_score = status_and_score(summary)
        goals = goals_from_summary(summary)
        expected = (home_score or 0) + (away_score or 0)
        minutes_complete = all(g.get('minute') for g in goals)
        goals_complete = bool(goals) and (not expected or len(goals) == expected)
        row = {
            'matchNumber': match_no,
            'eventId': event_id,
            'status': status,
            'homeScore': home_score,
            'awayScore': away_score,
            'goalsComplete': goals_complete,
            'minutesComplete': minutes_complete,
            'goals': goals if goals_complete else [],
        }
        if status in ('finished', 'live') or goals_complete:
            rows.append(row)
        time.sleep(0.15)

    payload = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'source': 'ESPN summary API via GitHub Actions',
        'coverage': {
            'eventsMapped': len(EVENTS),
            'matchesWithGoals': sum(1 for r in rows if r.get('goals')),
            'matchesWithCompleteMinutes': sum(1 for r in rows if r.get('goals') and r.get('minutesComplete')),
        },
        'errors': errors[:20],
        'matches': rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    old = OUT.read_text(encoding='utf-8') if OUT.exists() else ''
    new = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    OUT.write_text(new, encoding='utf-8')
    if old == new:
        print('No scorer changes')
    else:
        print(f"Wrote {OUT} with {len(rows)} match rows")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
