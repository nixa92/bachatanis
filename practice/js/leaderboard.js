// Online leaderboard (Firebase project "bachata-nis", Firestore).
// It talks to the Firestore REST API directly, so the page loads no Firebase library.
// The web config is not a secret: the database is protected by its rules (tools/firestore.rules).
//
// One document per game in the collection "runs", updated after every level:
//   name (may be empty), named (true when there is a name), mode, level (highest level played),
//   total (points summed over the levels), points (the points of each level), month ("2026-11"), date (server time).
// A game is first saved when it starts, with level 0 (no points), so the games that end inside level 1 are counted.
// A name is required since November 2026; older games without a name stay in the database, but only named games are shown.

const API_KEY = 'AIzaSyDcoOyFXHJsYqnqRQX1t1BVFUm6PZs9564';
const PROJECT = 'bachata-nis';
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOCS}`;
const TIMEOUT_MS = 8000;

export const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// the month before, as "2026-10"
export function prevMonth(d = new Date()) {
  return monthOf(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

// a random document id; the game's own id (a timestamp) would be easy to guess
export function newRunId() {
  const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

async function post(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data[0] && data[0].error && data[0].error.message) || (data && data.error && data.error.message) || `HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const int = (n) => ({ integerValue: String(Math.round(n)) });

// saves the game after a level; the same document is updated on the next level
export function submitRun({ docId, name, mode, points, month }) {
  const clean = String(name || '').trim().slice(0, 40);
  const fields = {
    name: { stringValue: clean },
    named: { booleanValue: clean.length > 0 },
    mode: { stringValue: mode },
    level: int(points.length),
    total: int(points.reduce((s, p) => s + p, 0)),
    points: { arrayValue: { values: points.map(int) } },
    month: { stringValue: month },
  };
  return post(':commit', {
    writes: [{
      update: { name: `${DOCS}/runs/${docId}`, fields },
      updateTransforms: [{ fieldPath: 'date', setToServerValue: 'REQUEST_TIME' }],
    }],
  });
}

const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value } });

// all named players of a mode, all time or for one month, best first; one row per name (its best game).
// The rules allow at most 50 documents per query, so the games are read in pages of 50.
const PAGE = 50;
const MAX_PAGES = 20; // up to 1000 games: far more than the club plays in a month
export async function topRuns(mode, month = null) {
  const filters = [eq('mode', { stringValue: mode }), eq('named', { booleanValue: true })];
  if (month) filters.push(eq('month', { stringValue: month }));
  const seen = new Set();
  const out = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await post(':runQuery', {
      structuredQuery: {
        from: [{ collectionId: 'runs' }],
        where: { compositeFilter: { op: 'AND', filters } },
        orderBy: [{ field: { fieldPath: 'total' }, direction: 'DESCENDING' }],
        offset: page * PAGE,
        limit: PAGE,
      },
    });
    const docs = (rows || []).filter((r) => r.document);
    for (const r of docs) {
      const f = r.document.fields;
      if (f.level.integerValue === '0') continue; // started, but no level finished
      const name = f.name.stringValue;
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: r.document.name.split('/').pop(),
        name,
        level: Number(f.level.integerValue),
        total: Number(f.total.integerValue),
        date: f.date && f.date.timestampValue ? Date.parse(f.date.timestampValue) : 0,
      });
    }
    if (docs.length < PAGE) break;
  }
  return out;
}

export const MODE_IDS = ['puls', 'tap', 'jedan'];

// The total leaderboard: for each name, the best game of each of the three games added up (all time,
// or for one month). A game not played counts 0. Equal totals: the one who reached it first is ahead.
// Read from the three per-game leaderboards, so it needs no index of its own.
export async function totalRuns(month = null) {
  const lists = await Promise.all(MODE_IDS.map((mode) => topRuns(mode, month)));
  const byName = new Map();
  lists.forEach((rows, i) => {
    for (const r of rows) {
      const key = r.name.toLocaleLowerCase();
      if (!byName.has(key)) byName.set(key, { name: r.name, games: {}, total: 0, date: 0 });
      const p = byName.get(key);
      p.games[MODE_IDS[i]] = r.total;
      p.total += r.total;
      p.date = Math.max(p.date, r.date);
    }
  });
  return [...byName.values()].sort((a, b) => b.total - a.total || a.date - b.date);
}
