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
// Each page starts after the last game of the page before (a cursor): with "offset" Firestore also
// bills every game it skips, so the reads grew with the square of the number of games.
// Only games with points are read: a game saved at its start (level 0) has none and is never shown.
const PAGE = 50;
const MAX_PAGES = 20; // up to 1000 games: far more than the club plays in a month
// Reading is what the free plan limits (50,000 documents a day), and each leaderboard read costs about one
// read per game with points. So a leaderboard is read at most once every FRESH_MS on a phone; in between,
// the rows kept on the phone are shown, and the player's own games are added to them on the phone
// (addOwnRun), so a finished game shows on the leaderboard at once without reading it again.
// The rows are kept in localStorage, so a reload (a new version of the app) does not read them again.
// A month that is over does not change any more: it is read only once (if read a day after it ended,
// so the games started on its last evening are finished).
export const FRESH_MS = 10 * 60 * 1000;
const cache = new Map(); // key -> { rows, readAt }
const cacheKey = (mode, month) => `${mode}/${month || 'all'}`;
const STORE_KEY = 'vezbaj.tabela.';
const isPast = (month) => !!month && month < monthOf();
function load(key) {
  if (cache.has(key)) return cache.get(key);
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(STORE_KEY + key) || 'null'); } catch (e) { /* private mode */ }
  if (kept && Array.isArray(kept.rows)) cache.set(key, kept);
  return cache.get(key) || null;
}
function keep(key, entry) {
  cache.set(key, entry);
  try { localStorage.setItem(STORE_KEY + key, JSON.stringify(entry)); } catch (e) { /* storage full or blocked */ }
}
const endedLongAgo = (month) => {
  const [y, m] = month.split('-').map(Number);
  return Date.now() >= new Date(y, m, 2).getTime(); // the 2nd of the month after
};
function isFresh(entry, month) {
  if (!entry) return false;
  if (entry.final) return true;
  return Date.now() - entry.readAt < FRESH_MS && entry.readAt <= Date.now();
}
// the rows kept on the phone, however old, so a leaderboard shows at once; null if never read
export const cachedRuns = (mode, month = null) => (load(cacheKey(mode, month)) || {}).rows || null;
// The same leaderboard asked for twice at once (the game list and the game cards) is read once.
const reading = new Map();
export function topRuns(mode, month = null) {
  const key = cacheKey(mode, month);
  const kept = load(key);
  if (isFresh(kept, month)) return Promise.resolve(kept.rows);
  if (reading.has(key)) return reading.get(key);
  const p = readTopRuns(mode, month).then((rows) => {
    // the player's own games saved since the read started are not lost
    const entry = { rows: mergeOwn(rows, mode, month), readAt: Date.now() };
    if (isPast(month) && endedLongAgo(month)) entry.final = true;
    keep(key, entry);
    return entry.rows;
  }).finally(() => reading.delete(key));
  reading.set(key, p);
  return p;
}

// The player's own games, as saved on this phone after each level, so they show on the leaderboards
// without reading them again. Only this session's games: older ones are already in a later read.
const own = [];
function place(rows, run) {
  const k = run.name.toLocaleLowerCase();
  const i = rows.findIndex((r) => r.name.toLocaleLowerCase() === k);
  if (i >= 0 && (rows[i].total > run.total || rows[i].id === run.id && rows[i].total === run.total && rows[i].level === run.level)) return rows;
  const out = rows.filter((_, j) => j !== i);
  const row = { id: run.id, name: run.name, level: run.level, total: run.total, date: run.date };
  // after the rows with more points, or as many (they were there first)
  const at = out.findIndex((r) => r.total < row.total);
  out.splice(at < 0 ? out.length : at, 0, row);
  return out;
}
function mergeOwn(rows, mode, month) {
  return own.filter((r) => r.mode === mode && (!month || r.month === month)).reduce(place, rows);
}
// run: { id (the document id), name, mode, month, level, total }; called after each level is saved
export function addOwnRun(run) {
  if (!run.name || !run.total) return;
  const r = { ...run, date: Date.now() };
  const i = own.findIndex((o) => o.id === r.id);
  if (i >= 0) own[i] = r; else own.push(r);
  for (const month of [r.month, null]) {
    const key = cacheKey(r.mode, month);
    const kept = load(key);
    if (kept) keep(key, { ...kept, rows: place(kept.rows, r) });
  }
}

async function readTopRuns(mode, month) {
  const filters = [
    eq('mode', { stringValue: mode }),
    eq('named', { booleanValue: true }),
    { fieldFilter: { field: { fieldPath: 'total' }, op: 'GREATER_THAN', value: int(0) } },
  ];
  if (month) filters.push(eq('month', { stringValue: month }));
  const seen = new Set();
  const out = [];
  let after = null; // the last game of the page before: [total, document name]
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = {
      from: [{ collectionId: 'runs' }],
      where: { compositeFilter: { op: 'AND', filters } },
      // the document name breaks ties, so the cursor is exact (it is the order Firestore uses anyway)
      orderBy: [
        { field: { fieldPath: 'total' }, direction: 'DESCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
      ],
      limit: PAGE,
    };
    if (after) query.startAt = { values: [{ integerValue: after[0] }, { referenceValue: after[1] }], before: false };
    const rows = await post(':runQuery', { structuredQuery: query });
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
    const last = docs[docs.length - 1].document;
    after = [last.fields.total.integerValue, last.name];
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
