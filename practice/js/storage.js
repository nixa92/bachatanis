// All saving goes through this file. Today it is localStorage only.
// To add an online leaderboard later, send `result` to the server inside
// saveRun (keep the local copy) and merge server data in getRuns.
//
// run = one play through the levels: { id, name, mode, level, total, date }
// level = highest level played, total = points summed over the levels.

const RESULTS_KEY = 'vezbaj.rezultati.v2'; // v1 used another scoring, its totals do not compare
const NAME_KEY = 'vezbaj.ime';

export function saveRun(run) {
  const clean = {
    id: run.id,
    name: String(run.name || '').trim().slice(0, 40),
    mode: run.mode,
    level: run.level,
    total: run.total,
    date: run.date,
  };
  const list = readAll().filter((r) => r.id !== clean.id);
  list.unshift(clean);
  try { localStorage.setItem(RESULTS_KEY, JSON.stringify(list.slice(0, 200))); } catch (e) { /* storage full or blocked */ }
  return Promise.resolve(clean);
}

function readAll() {
  try {
    const list = JSON.parse(localStorage.getItem(RESULTS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export function getRuns() {
  return readAll();
}

export function clearResults() {
  try { localStorage.removeItem(RESULTS_KEY); } catch (e) { /* ignore */ }
}

export function getName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
}
export function setName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* ignore */ }
}
