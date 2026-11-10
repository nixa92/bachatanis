#!/usr/bin/env python3
"""Archives a finished month of the practice app's leaderboards into practice/data/archive.json, so the app shows
last month's winner and the all-time leaderboard without reading the database. The database is read only for the
current month (one entry per player in "players").
Runs by itself on the 1st of each month (.github/workflows/month.yml); by hand:
    python3 .github/scripts/month.py            # last month
    python3 .github/scripts/month.py 2026-10    # a given month
Reads the month's player entries (one read per player). Months before November 2026 have no player entries, so
their games ("runs") are read instead. Running it again for the same month changes nothing.

archive.json:
  winners: { "2026-10": { name, total, games: { puls: points, ... } } }   the total leaderboard's first place
  players: { "ana p.": { name, puls: { total, level }, ... } }            each name's best of each game, all months archived
  months:  [ "2026-10", ... ]                                             the months archived
"""
import datetime
import json
import os
import subprocess
import sys

API_KEY = 'AIzaSyDcoOyFXHJsYqnqRQX1t1BVFUm6PZs9564'
DOCS = 'projects/bachata-nis/databases/(default)/documents'
URL = f'https://firestore.googleapis.com/v1/{DOCS}:runQuery?key={API_KEY}'
MODES = ['puls', 'tap', 'jedan']
PAGE = 50
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'practice', 'data', 'archive.json')


def query(q):
    """all documents of a query, in pages of 50 (the rules allow no more); q must order by __name__ last"""
    after = None
    while True:
        if after:
            q['startAt'] = {'values': after, 'before': False}
        # curl, because the Python on macOS often has no certificates installed
        out = subprocess.run(['curl', '-s', '-m', '30', URL, '-H', 'Content-Type: application/json',
                              '-d', json.dumps({'structuredQuery': {**q, 'limit': PAGE}})],
                             capture_output=True, text=True, check=True).stdout
        data = json.loads(out)
        if not isinstance(data, list) or any('error' in r for r in data):
            raise SystemExit(f'Firestore: {data}')
        docs = [r['document'] for r in data if 'document' in r]
        yield from docs
        if len(docs) < PAGE:
            return
        last = docs[-1]
        after = [last['fields'][o['field']['fieldPath']] if o['field']['fieldPath'] != '__name__' else {'referenceValue': last['name']}
                 for o in q['orderBy']]


def eq(field, value):
    return {'fieldFilter': {'field': {'fieldPath': field}, 'op': 'EQUAL', 'value': value}}


def from_players(month):
    """{name lower: {name, mode: {total, level}}} from the month's player entries; empty if there are none"""
    out = {}
    for d in query({'from': [{'collectionId': 'players'}], 'where': eq('month', {'stringValue': month}),
                    'orderBy': [{'field': {'fieldPath': '__name__'}, 'direction': 'ASCENDING'}]}):
        f = d['fields']
        p = {'name': f['name']['stringValue']}
        for m in MODES:
            if m in f and int(f[m]['integerValue']) > 0:
                s = int(f[m]['integerValue'])
                p[m] = {'total': s // 100, 'level': s % 100}
        out[p['name'].lower()] = p
    return out


def from_runs(month):
    """the same, from every game of the month with points (before November 2026)"""
    out = {}
    for m in MODES:
        filters = [eq('mode', {'stringValue': m}), eq('named', {'booleanValue': True}), eq('month', {'stringValue': month}),
                   {'fieldFilter': {'field': {'fieldPath': 'total'}, 'op': 'GREATER_THAN', 'value': {'integerValue': '0'}}}]
        for d in query({'from': [{'collectionId': 'runs'}], 'where': {'compositeFilter': {'op': 'AND', 'filters': filters}},
                        'orderBy': [{'field': {'fieldPath': 'total'}, 'direction': 'DESCENDING'},
                                    {'field': {'fieldPath': '__name__'}, 'direction': 'DESCENDING'}]}):
            f = d['fields']
            p = out.setdefault(f['name']['stringValue'].lower(), {'name': f['name']['stringValue']})
            if m not in p:  # the games come best first
                p[m] = {'total': int(f['total']['integerValue']), 'level': int(f['level']['integerValue'])}
    return out


def better(a, b):
    return a if not b or (a['total'], a['level']) > (b['total'], b['level']) else b


def main():
    if len(sys.argv) > 1:
        month = sys.argv[1]
    else:
        first = datetime.date.today().replace(day=1)
        month = (first - datetime.timedelta(days=1)).strftime('%Y-%m')
    try:
        with open(OUT, encoding='utf-8') as fh:
            archive = json.load(fh)
    except FileNotFoundError:
        archive = {'winners': {}, 'players': {}, 'months': []}
    if month in archive['months']:
        print(f'{month} is already archived.')
        return
    players = from_players(month) or from_runs(month)
    for key, p in players.items():
        a = archive['players'].setdefault(key, {'name': p['name']})
        a['name'] = p['name']  # the latest spelling of the name
        for m in MODES:
            if m in p:
                a[m] = better(p[m], a.get(m))
    totals = sorted(({'name': p['name'], 'games': {m: p[m]['total'] for m in MODES if m in p}} for p in players.values()),
                    key=lambda p: p['name'].lower())
    for p in totals:
        p['total'] = sum(p['games'].values())
    totals.sort(key=lambda p: -p['total'])
    if totals and totals[0]['total'] > 0:
        archive['winners'][month] = totals[0]
    archive['months'] = sorted(archive['months'] + [month])
    archive['winners'] = dict(sorted(archive['winners'].items()))
    archive['players'] = dict(sorted(archive['players'].items()))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(archive, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    w = archive['winners'].get(month)
    print(f"{month}: {len(players)} players; winner: {w['name'] + ', ' + str(w['total']) if w else 'none'}")


main()
