// Online leaderboard (Firebase project "bachata-nis", Firestore).
// It talks to the Firestore REST API directly, so the page loads no Firebase library.
// The web config is not a secret: the database is protected by its rules (tools/firestore.rules).
//
// Two collections:
// "runs": one document per game, updated after every level (the record of each game; the app does not read it):
//   name, named (true when there is a name), mode, level (highest level played), total (points summed over the levels),
//   points (the points of each level), month ("2026-11"), date (server time).
//   A game is first saved when it starts, with level 0 (no points), so the games that end inside level 1 are counted.
// "players": one document per player per month; the leaderboards read only the current month's.
//   id "2026-11_ana%20p." (month, then the name in lower case), name, month, and for each game (puls, tap, jedan)
//   the player's best as one number: points * 100 + level. Firestore keeps the bigger number on each save
//   ("maximum"), so the phone never has to read the old best first.
// Past months are archived on the website, in data/archive.json (Website/.github/scripts/month.py, on the 1st of
// each month): last month's winner and the all-time bests come from there, not from the database.
// Reading is what the free plan limits (50,000 documents a day): a leaderboard read costs one read per player.

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

// the player's best of a game, as one number: points first, then the level
const SCORE = 100;
const playerId = (month, name) => `${month}_${encodeURIComponent(name.toLocaleLowerCase())}`;

// after a level: the player's entry for the month keeps the bigger of its best and this game
export function submitBest({ name, mode, month, level, total }) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean || !total) return Promise.resolve();
  return post(':commit', {
    writes: [{
      update: { name: `${DOCS}/players/${playerId(month, clean)}`, fields: { name: { stringValue: clean }, month: { stringValue: month } } },
      updateMask: { fieldPaths: ['name', 'month'] },
      updateTransforms: [{ fieldPath: mode, maximum: int(total * SCORE + level) }],
    }],
  });
}

// The archive of past months (data/archive.json), read once per page: { winners, players, months }.
let archiveRead = null;
let archiveData = null;
export function archive() {
  if (!archiveRead) {
    archiveRead = fetch('data/archive.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((a) => { archiveData = a || { winners: {}, players: {}, months: [] }; return archiveData; });
  }
  return archiveRead;
}
// the archived bests as players: [{ name, games: { puls: { total, level } } }]
const archivedPlayers = (a) => Object.values(a.players || {}).map((p) => ({
  name: p.name, games: Object.fromEntries(MODE_IDS.filter((m) => p[m]).map((m) => [m, p[m]])),
}));
// all time: the archive with this month added (the better of the two for each game)
function withMonth(arch, list) {
  return list.flatMap((p) => Object.entries(p.games).map(([mode, g]) => ({ name: p.name, mode, ...g }))).reduce(place, archivedPlayers(arch));
}

export const MODE_IDS = ['puls', 'tap', 'jedan'];

// all players of a month (or "all"), as { name, games: { puls: { total, level }, ... } }
// The rules allow at most 50 documents per query, so they are read in pages of 50.
const PAGE = 50;
async function readPlayers(month) {
  const out = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const query = {
      from: [{ collectionId: 'players' }],
      where: { fieldFilter: { field: { fieldPath: 'month' }, op: 'EQUAL', value: { stringValue: month } } },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: PAGE,
    };
    if (after) query.startAt = { values: [{ referenceValue: after }], before: false };
    const rows = await post(':runQuery', { structuredQuery: query });
    const docs = (rows || []).filter((r) => r.document).map((r) => r.document);
    for (const d of docs) {
      const f = d.fields;
      const games = {};
      for (const mode of MODE_IDS) {
        const score = f[mode] ? Number(f[mode].integerValue) : 0;
        if (score > 0) games[mode] = { total: Math.floor(score / SCORE), level: score % SCORE };
      }
      out.push({ name: f.name.stringValue, games });
    }
    if (docs.length < PAGE) break;
    after = docs[docs.length - 1].name;
  }
  return out;
}

// A leaderboard is read at most once every FRESH_MS on a phone; in between, the players kept on the phone are
// shown, and the player's own games are added to them on the phone (addOwnRun), so a finished game shows on the
// leaderboard at once without reading it again. They are kept in localStorage, so a reload does not read them again.
// Past months are never read from the database; all time is the archive plus this month.
export const FRESH_MS = 10 * 60 * 1000;
const cache = new Map(); // month -> { players, readAt }
const STORE_KEY = 'vezbaj.igraci.';
function load(key) {
  if (cache.has(key)) return cache.get(key);
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(STORE_KEY + key) || 'null'); } catch (e) { /* private mode */ }
  if (kept && Array.isArray(kept.players)) cache.set(key, kept);
  return cache.get(key) || null;
}
function keep(key, entry) {
  cache.set(key, entry);
  try { localStorage.setItem(STORE_KEY + key, JSON.stringify(entry)); } catch (e) { /* storage full or blocked */ }
}
const isFresh = (entry) => !!entry && entry.readAt <= Date.now() && Date.now() - entry.readAt < FRESH_MS;
// The same month asked for twice at once (the game list and the game cards) is read once.
const reading = new Map();
function players(month) {
  if (!month) return Promise.all([archive(), players(monthOf())]).then(([a, list]) => withMonth(a, list));
  const key = month;
  const kept = load(key);
  if (isFresh(kept)) return Promise.resolve(kept.players);
  if (reading.has(key)) return reading.get(key);
  const p = readPlayers(key).then((list) => {
    // the player's own games saved since the read started are not lost
    const entry = { players: own.filter((r) => r.month === month).reduce(place, list), readAt: Date.now() };
    keep(key, entry);
    return entry.players;
  }).finally(() => reading.delete(key));
  reading.set(key, p);
  return p;
}

// The player's own games of this session, so they show on the leaderboards without reading them again.
const own = [];
function place(list, run) {
  const k = run.name.toLocaleLowerCase();
  const i = list.findIndex((p) => p.name.toLocaleLowerCase() === k);
  const old = i >= 0 ? list[i].games[run.mode] : null;
  if (old && old.total * SCORE + old.level >= run.total * SCORE + run.level) return list;
  const p = i >= 0 ? list[i] : { name: run.name, games: {} };
  const next = { ...p, games: { ...p.games, [run.mode]: { total: run.total, level: run.level } } };
  return i >= 0 ? list.map((q, j) => (j === i ? next : q)) : [...list, next];
}
// run: { name, mode, month, level, total }; called after each level
export function addOwnRun(run) {
  if (!run.name || !run.total) return;
  own.push(run);
  const kept = load(run.month);
  if (kept) keep(run.month, { ...kept, players: place(kept.players, run) });
}

const byName = (a, b) => a.name.localeCompare(b.name);
// one game's leaderboard: the players who played it, best first
function gameRows(list, mode) {
  return list.filter((p) => p.games[mode])
    .map((p) => ({ name: p.name, total: p.games[mode].total, level: p.games[mode].level }))
    .sort((a, b) => b.total - a.total || byName(a, b));
}
// The total leaderboard: for each name, the best of each of the three games added up. A game not played counts 0.
function totalRows(list) {
  return list.map((p) => ({ name: p.name, games: Object.fromEntries(Object.entries(p.games).map(([m, g]) => [m, g.total])) }))
    .map((p) => ({ ...p, total: Object.values(p.games).reduce((s, n) => s + n, 0) }))
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total || byName(a, b));
}
// the rows kept on the phone, however old, so a leaderboard shows at once; null if never read
export function cachedRuns(mode, month = null) {
  const kept = load(month || monthOf());
  if (!kept) return null;
  if (month) return gameRows(kept.players, mode);
  return archiveData ? gameRows(withMonth(archiveData, kept.players), mode) : null;
}
export const topRuns = async (mode, month = null) => gameRows(await players(month), mode);
export const totalRuns = async (month = null) => totalRows(await players(month));
