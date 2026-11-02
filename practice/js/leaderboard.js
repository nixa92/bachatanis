// Online leaderboard (Firebase project "bachata-nis", Firestore).
// It talks to the Firestore REST API directly, so the page loads no Firebase library.
// The web config is not a secret: the database is protected by its rules (tools/firestore.rules).
//
// One document per game in the collection "runs", updated after every level:
//   name (may be empty), named (true when there is a name), mode, level (highest level played),
//   total (points summed over the levels), points (the points of each level), month ("2026-11"), date (server time).
// Games without a name are saved too (they show how far players get), but only named games are shown.

const API_KEY = 'AIzaSyDcoOyFXHJsYqnqRQX1t1BVFUm6PZs9564';
const PROJECT = 'bachata-nis';
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOCS}`;
const TIMEOUT_MS = 8000;

export const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

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

// the best named games of a mode, all time or for one month; one row per name (its best game)
export async function topRuns(mode, month = null, count = 10) {
  const filters = [eq('mode', { stringValue: mode }), eq('named', { booleanValue: true })];
  if (month) filters.push(eq('month', { stringValue: month }));
  const rows = await post(':runQuery', {
    structuredQuery: {
      from: [{ collectionId: 'runs' }],
      where: { compositeFilter: { op: 'AND', filters } },
      orderBy: [{ field: { fieldPath: 'total' }, direction: 'DESCENDING' }],
      limit: 40, // more than shown, because one player can have several games near the top
    },
  });
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    if (!r.document) continue;
    const f = r.document.fields;
    const name = f.name.stringValue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: r.document.name.split('/').pop(),
      name,
      level: Number(f.level.integerValue),
      total: Number(f.total.integerValue),
    });
    if (out.length === count) break;
  }
  return out;
}
