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
    if (!res.ok) {
      const err = new Error((data && data[0] && data[0].error && data[0].error.message) || (data && data.error && data.error.message) || `HTTP ${res.status}`);
      // refused by the rules (or a bad request): sending it again cannot help. Anything else (no network, a timeout,
      // the day's quota used up, a server error) can pass on a later try.
      err.refused = [400, 403, 404].includes(res.status);
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const int = (n) => ({ integerValue: String(Math.round(n)) });

const cleanName = (name) => String(name || '').trim().slice(0, 40);
// The name's key: the same name in another case is the same player. Not toLocaleLowerCase: a phone set to Turkish
// turns "I" into "ı", which would give the same name a second entry.
const nameKey = (name) => name.toLowerCase();

// one level of a game: the document of the game grows to `level` (0: the game has started, no points yet)
function writeRun(docId, { name, mode, month, points }, level) {
  const upTo = points.slice(0, level);
  const fields = {
    name: { stringValue: name },
    named: { booleanValue: name.length > 0 },
    mode: { stringValue: mode },
    level: int(level),
    total: int(upTo.reduce((s, p) => s + p, 0)),
    points: { arrayValue: { values: upTo.map(int) } },
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
const playerId = (month, name) => `${month}_${encodeURIComponent(nameKey(name))}`;

// the player's entry for the month keeps the bigger of its best and this game
function writeBest({ name, mode, month, level, total }) {
  return post(':commit', {
    writes: [{
      update: { name: `${DOCS}/players/${playerId(month, name)}`, fields: { name: { stringValue: name }, month: { stringValue: month } } },
      updateMask: { fieldPaths: ['name', 'month'] },
      updateTransforms: [{ fieldPath: mode, maximum: int(total * SCORE + level) }],
    }],
  });
}

// What is not saved in the database yet. It is kept in localStorage, so a save that failed (weak signal, a timeout,
// the app closed) is sent again: after a short wait, when the network or the app comes back, and when the page
// opens the next time.
//   runs:  { docId: { name, mode, month, points, sent } }  sent: the highest level saved (-1: not even the start)
//   bests: [ { name, mode, month, level, total } ]
// A game is sent one level at a time, in order, because the rules let its document grow only by one level.
const OUT_KEY = 'vezbaj.neposlato';
const RETRY_MS = [5000, 20000, 60000];
const outbox = { runs: {}, bests: [] };
try {
  const kept = JSON.parse(localStorage.getItem(OUT_KEY) || 'null');
  if (kept && kept.runs && Array.isArray(kept.bests)) {
    outbox.runs = Object.fromEntries(Object.entries(kept.runs).filter(([, r]) => r && Array.isArray(r.points) && Number.isInteger(r.sent)));
    outbox.bests = kept.bests.filter((b) => b && typeof b.name === 'string' && b.total > 0);
  }
} catch (e) { /* private mode */ }
function keepOutbox() {
  try { localStorage.setItem(OUT_KEY, JSON.stringify(outbox)); } catch (e) { /* storage full or blocked */ }
}
// a save the rules refuse is dropped; any other error stops the sending until the next try
const unlessRefused = (saving) => saving.catch((e) => {
  if (!e.refused) throw e;
  console.warn('[tabela] refused:', e.message);
});
async function sendAll() {
  for (const id of Object.keys(outbox.runs)) {
    for (let r = outbox.runs[id]; r && r.sent < r.points.length; r = outbox.runs[id]) {
      const level = r.sent + 1;
      // A refused level counts as saved: most often it was saved and only the answer was lost, so the next level
      // has to follow it. (If the game is really refused, each level is tried once and then it is dropped.)
      await unlessRefused(writeRun(id, r, level));
      if (outbox.runs[id]) outbox.runs[id].sent = level;
      keepOutbox();
    }
  }
  while (outbox.bests.length) {
    const best = outbox.bests[0];
    await unlessRefused(writeBest(best));
    outbox.bests = outbox.bests.filter((b) => b !== best);
    keepOutbox();
  }
}
let sending = false;
let sendAgain = false; // something was added while sending
let tries = 0;
let retryTimer = 0;
async function send() {
  clearTimeout(retryTimer);
  if (sending) { sendAgain = true; return; }
  sending = true;
  try {
    do { sendAgain = false; await sendAll(); } while (sendAgain);
    tries = 0;
  } catch (e) {
    console.warn('[tabela] not saved yet:', e.message);
    if (tries < RETRY_MS.length) retryTimer = setTimeout(send, RETRY_MS[tries++]);
  } finally {
    sending = false;
  }
}
window.addEventListener('online', send);
send(); // what the last visit could not save

// Saves the game after a level (points: the points of the levels played; none when the game starts).
// The same document is updated on the next level.
export function submitRun({ docId, name, mode, points, month }) {
  // the games saved to the end are forgotten; only the game in play keeps its place
  for (const [id, r] of Object.entries(outbox.runs)) if (id !== docId && r.sent >= r.points.length) delete outbox.runs[id];
  const old = outbox.runs[docId];
  // a game this list does not know (started before a reload): its earlier levels were sent then
  outbox.runs[docId] = { name: cleanName(name), mode, month, points, sent: old ? old.sent : points.length - 1 };
  keepOutbox();
  tries = 0;
  send();
}

// after a level: the player's best of the game (level: the levels played, total: the points of the game)
export function submitBest({ name, mode, month, level, total }) {
  const clean = cleanName(name);
  if (!clean || !total) return;
  outbox.bests = [...outbox.bests, { name: clean, mode, month, level, total }].slice(-50);
  keepOutbox();
  tries = 0;
  send();
}

// The leaderboards on the screen are read again when the app comes back after AWAY_MS in the background (phones
// keep the page open for days): everything read before `readSince` is old. onReturn: called then, to draw them again.
const AWAY_MS = 2 * 60 * 1000;
let readSince = Date.now();
let hiddenAt = 0;
const returning = [];
export function onReturn(fn) { returning.push(fn); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  send();
  if (!hiddenAt || Date.now() - hiddenAt < AWAY_MS) return;
  readSince = Date.now();
  for (const fn of returning) fn();
});

// The archive of past months (data/archive.json, a file of the website, not the database): { winners, players, months }.
// It is read once per page load and again after a return from the background, so a phone that stays open into a
// new month gets last month's winner. A read that fails is tried again the next time; the last archive read stays.
const NO_ARCHIVE = { winners: {}, players: {}, months: [] };
let archiveRead = null; // { at, result }
let archiveData = null;
export function archive() {
  if (!archiveRead || archiveRead.at < readSince) {
    const read = { at: Date.now() };
    read.result = fetch('data/archive.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((a) => {
        if (a) archiveData = a;
        else if (archiveRead === read) archiveRead = null;
        return archiveData || NO_ARCHIVE;
      });
    archiveRead = read;
  }
  return archiveRead.result;
}
// the archived bests as players: [{ name, games: { puls: { total, level } } }]
const archivedPlayers = (a) => Object.values(a.players || {}).map((p) => ({
  name: p.name, games: Object.fromEntries(MODE_IDS.filter((m) => p[m]).map((m) => [m, p[m]])),
}));
// players as one entry per game played: [{ name, mode, total, level }]
const asBests = (list) => list.flatMap((p) => Object.entries(p.games).map(([mode, g]) => ({ name: p.name, mode, ...g })));
// all time: the archive with this month added (the better of the two for each game)
const withMonth = (arch, list) => asBests(list).reduce(place, archivedPlayers(arch));

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
  // One name, one row. The rules cannot tie a document's id to its name, so a name can have a second document
  // (written by hand with the public key, or by a phone that lower-cases differently): the better result of each
  // game counts, so a second document can neither show the name twice nor lower its result.
  return asBests(out).reduce(place, []);
}

// The month's players are read once per page load, when a leaderboard is first shown (choosing a game, going back
// or finishing a game reads nothing), and again after a return from the background (readSince, above). The player's
// own games are added on the phone (addOwnRun), so a finished game shows on the leaderboard at once. The players are
// also kept in localStorage, so a leaderboard shows at once while it is read.
// Past months are never read from the database; all time is the archive plus this month.
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
const isFresh = (entry) => !!entry && entry.readAt >= readSince;
// The same month asked for twice at once (the game list and the game cards) is read once.
const reading = new Map();
function players(month) {
  if (!month) return Promise.all([archive(), players(monthOf())]).then(([a, list]) => withMonth(a, list));
  const key = month;
  const kept = load(key);
  if (isFresh(kept)) return Promise.resolve(kept.players);
  if (reading.has(key)) return reading.get(key);
  const p = readPlayers(key).then((list) => {
    // the player's own games are not lost: the ones played since the read started, and the ones not saved yet
    const entry = { players: [...outbox.bests, ...own].filter((r) => r.month === month).reduce(place, list), readAt: Date.now() };
    keep(key, entry);
    return entry.players;
  }).finally(() => reading.delete(key));
  reading.set(key, p);
  return p;
}

// The player's own games of this session, so they show on the leaderboards without reading them again.
const own = [];
function place(list, run) {
  const k = nameKey(run.name);
  const i = list.findIndex((p) => nameKey(p.name) === k);
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

// Equal points: by name, in the order the monthly archive uses for the winner (month.py: lower case, by character
// code), so the first place on the screen is the winner archived. Not localeCompare: its order depends on the phone.
function byName(a, b) {
  const x = Array.from(nameKey(a.name), (c) => c.codePointAt(0));
  const y = Array.from(nameKey(b.name), (c) => c.codePointAt(0));
  for (let i = 0; i < x.length && i < y.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
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
