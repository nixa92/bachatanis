import { Engine, CHANNELS } from './engine.js?v=20261101231123';
import { laneVelocity, NUMERE, setNumera, numeraId } from './patterns.js?v=20261101231123';
import { KORACI } from './steps.js?v=20261101231123';
import { FeetView } from './feet.js?v=20261101231123';
import { EarTest, MODES, LEVELS, roundMs, feedback } from './game.js?v=20261101231123';
import * as store from './storage.js?v=20261101231123';
import { t, lang, setLang, onLangChange, applyStatic } from './i18n.js?v=20261101231123';
import { ICONS } from './icons.js?v=20261101231123';

const $ = (id) => document.getElementById(id);
const engine = new Engine();
const state = { screen: 'ritam', step: KORACI[0], view: 'vodja', mode: 'puls', level: 1, voiceOn: false };
const BPM_MIN = 80, BPM_MAX = 200;

// ------------------------------------------------------------ language (SR / EN, like the site)
applyStatic();
engine.voice = state.voiceOn ? lang : 'off';
for (const b of document.querySelectorAll('.lang button')) b.addEventListener('click', () => setLang(b.dataset.lang));
onLangChange((l) => {
  if (state.voiceOn && !test.running) engine.voice = l;
  renderPlay();
  setBpm(engine.bpm);
  renderTiles();
  renderStepList();
  setupFeet();
  describeTest();
  renderHistory();
  drawLanes(currentSection);
  describeSection();
});
const stepName = (k) => (lang === 'en' && k.naziv_en) || k.naziv;

// ------------------------------------------------------------ segmented controls
// pill-shaped segmented control: a filled pill slides to the picked segment
function initSeg(group) {
  const ind = document.createElement('span');
  ind.className = 'seg-ind';
  ind.setAttribute('aria-hidden', 'true');
  group.prepend(ind);
  // sizes change when the screen is shown, the language changes or the window resizes
  new ResizeObserver(() => placeInd(group, false)).observe(group);
}
function placeInd(group, animate = true) {
  const ind = group.querySelector('.seg-ind');
  if (!ind) return;
  const b = group.querySelector('button[aria-checked="true"], button[aria-pressed="true"]');
  if (!b || !b.offsetWidth) { ind.style.opacity = '0'; return; }
  if (!animate) ind.style.transition = 'none';
  ind.style.opacity = '1';
  ind.style.width = `${b.offsetWidth}px`;
  ind.style.height = `${b.offsetHeight}px`;
  ind.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
  if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
}
for (const g of document.querySelectorAll('.seg')) initSeg(g);

function bindSeg(group, onChange) {
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b || b.disabled) return;
    for (const x of group.querySelectorAll('button[data-value]')) x.setAttribute('aria-checked', String(x === b));
    placeInd(group);
    onChange(b.dataset.value);
  });
}
const seg = (name) => document.querySelector(`.seg[data-name="${name}"]`);

// ------------------------------------------------------------ tabs
const SCREENS = ['ritam', 'koraci', 'test'];
function showScreen(id) {
  if (test.running) abortTest();
  state.screen = id;
  for (const s of SCREENS) {
    $(s).hidden = s !== id;
    $(`tab-${s}`).setAttribute('aria-selected', String(s === id));
  }
  $('transport').hidden = id === 'test';
  document.body.dataset.screen = id;
  if (id === 'test' && engine.playing) togglePlay();
  if (location.hash.slice(1) !== id) history.replaceState(null, '', id === 'ritam' ? location.pathname : `#${id}`);
}
for (const s of SCREENS) $(`tab-${s}`).addEventListener('click', () => showScreen(s));
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = SCREENS.indexOf(state.screen) + (e.key === 'ArrowRight' ? 1 : -1);
  const next = SCREENS[(i + SCREENS.length) % SCREENS.length];
  showScreen(next);
  $(`tab-${next}`).focus();
});

// ------------------------------------------------------------ transport
let starting = false;
async function togglePlay() {
  if (starting) return;
  if (engine.playing) {
    engine.pause();
  } else {
    starting = true;
    try {
      await engine.unlock();   // created/resumed inside the tap handler (iOS)
      await engine.samples.whenReady(); // so the first bar is not the synth
      // half a beat before count 1 so the feet travel into it, as they do when the phrase repeats
      engine.start({ leadIn: state.screen === 'koraci' ? 30 / engine.bpm : 0 });
    } finally { starting = false; }
  }
  renderPlay();
}
function renderPlay() {
  const on = engine.playing;
  $('play').setAttribute('aria-label', t(on ? 'pause' : 'play'));
  $('play').setAttribute('aria-pressed', String(on));
}
$('play').addEventListener('click', togglePlay);
renderPlay();

// ------------------------------------------------------------ track picker (shared by Ritam and Koraci)
const NUMERA_KEY = 'vezbaj.numera';
const numeraSel = $('numera');
for (const n of NUMERE) numeraSel.add(new Option(n.naziv, n.id));
try { setNumera(localStorage.getItem(NUMERA_KEY)); } catch (e) { /* private mode */ }
numeraSel.value = numeraId();
numeraSel.addEventListener('change', () => {
  setNumera(numeraSel.value); // takes effect from the next step, even while playing
  try { localStorage.setItem(NUMERA_KEY, numeraSel.value); } catch (e) { /* private mode */ }
  if (!engine.playing) drawLanes(currentSection);
});

function setBpm(v) {
  engine.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v / 5) * 5));
  $('bpm').value = engine.bpm;
  $('bpm-val').textContent = engine.bpm;
  $('bpm-name').textContent = engine.bpm <= 100 ? t('preset.slow') : engine.bpm >= 150 ? t('preset.fast') : '';
}
$('bpm').addEventListener('input', (e) => setBpm(Number(e.target.value)));
setBpm(125);

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' && e.target.type === 'text') return;
  if (state.screen === 'test') {
    if (test.running) { e.preventDefault(); onTap(e); }
    return;
  }
  if (tag === 'button' || tag === 'select') return; // let space activate the focused control
  e.preventDefault();
  togglePlay();
});

// ------------------------------------------------------------ 8-count strip (bottom bar, shared by Ritam and Koraci)
function buildCounts(container, cls) {
  const cells = [];
  for (let i = 1; i <= 8; i++) {
    const c = document.createElement('div');
    c.className = `${cls}-cell` + (i % 4 === 0 ? ' is-tap' : '') + (i === 1 ? ' is-one' : '') + (i === 5 ? ' is-five' : '');
    c.innerHTML = `<span class="${cls}-num">${i}</span>` + (i % 4 === 0 ? `<span class="${cls}-tap">tap</span>` : '');
    container.appendChild(c);
    cells.push(c);
  }
  return cells;
}
const barCells = buildCounts($('bar-counts'), 'bar');

let lastLit = new Map();
function lightCells(cells, ci) {
  if (lastLit.get(cells) === ci) return;
  lastLit.set(cells, ci);
  cells.forEach((c, i) => c.classList.toggle('is-now', i === ci));
}

// ------------------------------------------------------------ RITAM: controls
function describeSection() { $('section-help').textContent = t(`section.${engine.sectionMode}.help`); }
describeSection();
bindSeg(seg('section'), (v) => {
  engine.sectionMode = v;
  describeSection();
  if (!engine.playing) drawLanes(v);
});

// instrument + count tiles: tap the tile to mute / unmute, slider for volume
const TILES = [
  ...CHANNELS.map((ch) => ({
    id: ch.id, box: 'mixer',
    isOn: () => !engine.mix[ch.id].mute,
    toggle: () => engine.setMix(ch.id, { mute: !engine.mix[ch.id].mute }),
    vol: () => engine.mix[ch.id].vol,
    setVol: (v) => engine.setMix(ch.id, { vol: v }),
  })),
  {
    id: 'glas', box: 'count-tiles',
    isOn: () => state.voiceOn,
    toggle: () => { state.voiceOn = !state.voiceOn; engine.voice = state.voiceOn ? lang : 'off'; },
    vol: () => engine.countVol,
    setVol: (v) => engine.setCountVol(v),
  },
  {
    id: 'klik', box: 'count-tiles',
    isOn: () => engine.clickOn,
    toggle: () => { engine.clickOn = !engine.clickOn; },
    vol: () => engine.clickVol,
    setVol: (v) => engine.setClickVol(v),
  },
];
const TILE_NAME = { glas: 'ch.brojanje', klik: 'ch.klik' };
for (const tile of TILES) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.id = tile.id;
  el.innerHTML = `
    <div class="tile-head">
      <span class="tile-icon"></span>
      <span class="tile-name"></span>
      <button type="button" role="switch" class="switch"><span class="switch-thumb"></span></button>
    </div>
    <input type="range" class="tile-vol" min="0" max="1.2" step="0.05" value="${tile.vol()}">`;
  // the switch toggles; tapping the icon or name does the same
  el.querySelector('.tile-head').addEventListener('click', () => { tile.toggle(); renderTiles(); drawLanes(currentSection); });
  el.querySelector('.tile-vol').addEventListener('input', (e) => { tile.setVol(Number(e.target.value)); drawLanes(currentSection); });
  $(tile.box).appendChild(el);
  tile.el = el;
}
function renderTiles() {
  for (const tile of TILES) {
    const iconId = tile.id;
    const name = t(TILE_NAME[tile.id] || `ch.${tile.id}`);
    const on = tile.isOn();
    const el = tile.el;
    if (el.dataset.icon !== iconId) { el.querySelector('.tile-icon').innerHTML = ICONS[iconId]; el.dataset.icon = iconId; }
    el.querySelector('.tile-name').textContent = name;
    el.classList.toggle('is-off', !on);
    const sw = el.querySelector('.switch');
    sw.setAttribute('aria-checked', String(on));
    sw.setAttribute('aria-label', name);
    el.querySelector('.tile-vol').setAttribute('aria-label', `${t('instr.volume')}: ${name}`);
  }
}

// lanes: which instrument plays on which eighth
const LANE_NAMES = { bongo: () => 'Bongo', guira: () => 'Güira', bas: () => t('lane.bas'), gitara: () => t('lane.gitara'), requinto: () => t('lane.requinto') };
const lanesEl = $('lanes');
const laneCols = [];
(function buildLanes() {
  const head = document.createElement('div');
  head.className = 'lane lane-head';
  head.innerHTML = '<span class="lane-name"></span>' + Array.from({ length: 16 }, (_, s) =>
    `<span class="lane-cell${s % 2 ? ' is-and' : ''}">${s % 2 ? '&' : s / 2 + 1}</span>`).join('');
  lanesEl.appendChild(head);
  for (const ch of CHANNELS) {
    const row = document.createElement('div');
    row.className = 'lane';
    row.dataset.id = ch.id;
    row.innerHTML = `<span class="lane-name">${LANE_NAMES[ch.id]()}</span>` +
      Array.from({ length: 16 }, () => '<span class="lane-cell"><i></i></span>').join('');
    lanesEl.appendChild(row);
  }
  for (let s = 0; s < 16; s++) {
    laneCols.push([...lanesEl.querySelectorAll(`.lane > .lane-cell:nth-child(${s + 2})`)]);
  }
})();
let currentSection = 'majao';
function drawLanes(section) {
  currentSection = section;
  const anySolo = CHANNELS.some((c) => engine.mix[c.id].solo);
  for (const row of lanesEl.querySelectorAll('.lane[data-id]')) {
    const id = row.dataset.id;
    const m = engine.mix[id];
    row.classList.toggle('is-silent', (anySolo ? !m.solo : m.mute) || m.vol === 0);
    row.firstChild.textContent = LANE_NAMES[id]();
    row.querySelectorAll('.lane-cell i').forEach((dot, s) => {
      const v = laneVelocity(id, s, section);
      dot.style.opacity = v ? (0.25 + v * 0.75).toFixed(2) : '0';
      dot.classList.toggle('is-accent', v >= 0.9);
    });
  }
}
drawLanes('majao');
renderTiles();
let lastCol = -1;
function lightLanes(s) {
  if (s === lastCol) return;
  if (lastCol >= 0) laneCols[lastCol].forEach((c) => c.classList.remove('is-now'));
  if (s >= 0) laneCols[s].forEach((c) => c.classList.add('is-now'));
  lastCol = s;
}

// ------------------------------------------------------------ KORACI
const feet = new FeetView($('feet'));
const stepList = $('step-list');
for (const k of KORACI) {
  const o = document.createElement('option');
  o.value = k.id;
  stepList.appendChild(o);
}
stepList.value = state.step.id;
function renderStepList() {
  [...stepList.options].forEach((o, i) => { o.textContent = stepName(KORACI[i]); });
}
renderStepList();
stepList.addEventListener('change', () => { state.step = KORACI.find((k) => k.id === stepList.value); setupFeet(); });

bindSeg(seg('view'), (v) => { state.view = v; setupFeet(); });
function setupFeet() {
  feet.setStep(state.step, state.view);
  $('feet').dataset.view = state.view;
}
setupFeet();

// ------------------------------------------------------------ TEST
const test = new EarTest(engine);
bindSeg(seg('mode'), (v) => { state.mode = v; describeTest(); });
function describeTest() {
  $('mode-help').textContent = t(`mode.${state.mode}.how`);
}
describeTest();
$('player-name').value = store.getName();
$('player-name').addEventListener('change', (e) => store.setName(e.target.value.trim()));


// While a level runs the page shows only the game. It takes one history step, so the back gesture quits the level.
let ignoreNextPop = false;
function setGameView(on) {
  if (on === document.body.classList.contains('is-game')) return;
  document.body.classList.toggle('is-game', on);
  if (on) {
    history.pushState({ game: true }, '', location.href);
  } else if (history.state && history.state.game) {
    ignoreNextPop = true;
    history.back();
  }
}
window.addEventListener('popstate', () => {
  if (ignoreNextPop) { ignoreNextPop = false; return; }
  if (test.running) abortTest();
});

function showTestPart(part) {
  if (part !== 'run') setNumera(numeraSel.value); // back to the player's own pick
  setGameView(part === 'run');
  $('test-setup').hidden = part !== 'setup';
  $('test-run').hidden = part !== 'run';
  $('test-result').hidden = part !== 'result';
  if (part === 'run') window.scrollTo(0, 0);
  if (part === 'result') $('test-result').scrollIntoView();
}

const showStreak = (n) => {
  const need = MODES[state.mode].need;
  $('run-streak').textContent = t('run.streak', { n, need });
  $('progress-bar').style.width = `${(100 * n / need).toFixed(1)}%`;
};
const seconds = (s) => `${s.toFixed(1).replace('.', t('decimal'))} s`;
const levelText = (n) => t('level.of', { n, total: LEVELS.length });

async function startTest(modeId) {
  await engine.unlock();
  await engine.samples.whenReady();
  setNumera(run.tracks[state.level - 1]);
  test.begin(modeId, state.level);
  $('run-title').textContent = `${t(`mode.${modeId}`)}, ${levelText(state.level)}`;
  $('run-instr').textContent = t(`mode.${modeId}.how`);
  $('tap-fb').textContent = '';
  $('tap-fb').className = 'tap-fb';
  showStreak(0);
  showTestPart('run');
  $('tap-pad').focus();
}
const shuffled = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [out[i], out[k]] = [out[k], out[i]];
  }
  return out;
};
// one play through the levels; every level has its own track, in a new order each game
let run = null;
function addToRun(r) {
  run.points[r.level] = r.points;
  run.total = Object.values(run.points).reduce((sum, p) => sum + p, 0);
  store.saveRun({
    id: run.id, name: r.name, mode: run.mode, date: r.date,
    level: Math.max(...Object.keys(run.points).map(Number)),
    total: run.total,
  });
}
$('test-start').addEventListener('click', () => {
  state.level = 1;
  run = { id: Date.now(), mode: state.mode, points: {}, tracks: shuffled(NUMERE.map((n) => n.id)) };
  startTest(state.mode);
});
$('res-next').addEventListener('click', () => { state.level++; startTest(state.mode); });
$('res-back').addEventListener('click', () => showTestPart('setup'));
$('test-abort').addEventListener('click', abortTest);
function abortTest() { test.abort(); showTestPart('setup'); }

function tapText({ kind, ms, late }) {
  if (kind === 'hit') return ms <= 50 ? t('tap.hit') : t(late ? 'tap.hitLate' : 'tap.hitEarly');
  if (kind === 'early' || kind === 'late') return t(`tap.${kind}`, { ms: roundMs(ms) });
  if (kind === 'extra') return t('tap.extra');
  return t(`tap.wrong.${state.mode}`);
}

function onTap(e) {
  const ts = e && e.timeStamp > 0 && e.timeStamp <= performance.now() + 5 ? e.timeStamp : performance.now();
  const res = test.tap(ts);
  if (!res) return;
  showStreak(res.streak);
  const fb = $('tap-fb');
  fb.textContent = tapText(res);
  fb.className = `tap-fb is-${res.kind === 'hit' ? 'hit' : 'miss'}`;
  const pad = $('tap-pad');
  pad.classList.remove('is-hit');
  void pad.offsetWidth;
  pad.classList.add('is-hit');
  if (res.done) finishTest();
}
$('tap-pad').addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(e); });
$('tap-pad').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); onTap(e); } });
// space is handled on document keydown; stop it from also "clicking" the focused pad
document.addEventListener('keyup', (e) => { if (e.code === 'Space' && test.running) e.preventDefault(); });

function finishTest() {
  const r = test.finish();
  r.name = $('player-name').value.trim();
  store.setName(r.name);
  addToRun(r);
  $('res-run').textContent = t('res.run', { total: run.total });
  $('res-score').textContent = r.points;
  $('res-time').textContent = seconds(r.seconds);
  $('res-misses').textContent = r.misses;
  $('res-offset').textContent = offsetText(r.avgOffsetMs);
  $('res-bpm').textContent = `${r.bpm} BPM`;
  const last = state.level === LEVELS.length;
  const lines = feedback(r);
  if (last) lines.push(t('res.done', { total: LEVELS.length }));
  $('res-level').textContent = `${t(`mode.${r.mode}`)}, ${levelText(r.level)}`;
  $('res-next').hidden = last;
  $('res-msg').innerHTML = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  showTestPart('result');
  renderHistory();
}
function offsetText(ms) {
  const a = roundMs(Math.abs(ms));
  if (a === 0) return t('off.exact');
  return t(ms < 0 ? 'off.early' : 'off.late', { ms: a });
}

function renderBest(list) {
  $('best').innerHTML = Object.keys(MODES).map((mode) => {
    const runs = list.filter((r) => r.mode === mode);
    const top = runs.length ? runs.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    return `<li><span class="h-score">${top ? top.total : '–'}</span><span class="h-what">${t(`mode.${mode}`)}</span><span class="h-meta">${top ? levelText(top.level) : t('hist.none')}</span></li>`;
  }).join('');
}

function renderHistory() {
  const list = store.getRuns();
  renderBest(list);
  const ol = $('history');
  $('history-clear').hidden = list.length === 0;
  if (!list.length) {
    ol.innerHTML = `<li class="history-empty">${t('hist.empty')}</li>`;
    return;
  }
  ol.innerHTML = list.slice(0, 20).map((r) => {
    const d = new Date(r.date);
    const when = `${d.getDate()}. ${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const what = `${MODES[r.mode] ? t(`mode.${r.mode}`) : r.mode}, ${levelText(r.level)}`;
    return `<li><span class="h-score">${r.total}</span><span class="h-what">${what}${r.name ? `<em>${escapeHtml(r.name)}</em>` : ''}</span><span class="h-meta">${when}</span></li>`;
  }).join('');
}
$('history-clear').addEventListener('click', () => {
  if (confirm(t('hist.confirm'))) { store.clearResults(); renderHistory(); }
});
renderHistory();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------ frame loop
// Everything visual is derived from the audio clock here.
let lastFrame = 0;
function frame() {
  requestAnimationFrame(frame);
  lastFrame = performance.now();
  frameBody();
}
// the second half of count 8, before the first count 1 sounds
function leadInPos() {
  if (!engine.playing) return null;
  const half = 30 / engine.bpm;
  const frac = 1 - (engine.startTime - engine.heardTime()) / half;
  return { entry: { s: 15 }, frac: Math.max(0, Math.min(1, frac)) };
}
function frameBody() {
  // fall back to the scheduler clock if the output-latency estimate is off (some browsers)
  // while paused, and just after resuming, the picture holds the paused position
  const pos = engine.playing
    ? (engine.positionAt(engine.heardTime()) || engine.positionAt(engine.ctx.currentTime) || engine.pausedPos)
    : engine.pausedPos;
  const ci = pos ? Math.floor(pos.entry.s / 2) : -1;

  if (state.screen === 'ritam') {
    lightCells(barCells, ci);
    lightLanes(pos ? pos.entry.s : -1);
    if (engine.playing && pos && pos.entry.section !== currentSection) drawLanes(pos.entry.section);
  } else if (state.screen === 'koraci') {
    const fci = feet.render(pos || leadInPos());
    lightCells(barCells, pos ? fci : -1);
  } else if (state.screen === 'test' && test.running) {
    $('run-time').textContent = seconds(test.elapsed());
  }
}
requestAnimationFrame(frame);
// some embedded browser previews pause requestAnimationFrame; fall back to a timer there
setInterval(() => { if (performance.now() - lastFrame > 120) { lastFrame = performance.now(); frameBody(); } }, 33);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && test.running) abortTest();
});

// open a screen directly: vezbaj/#koraci, vezbaj/#test
const startScreen = location.hash.slice(1);
if (SCREENS.includes(startScreen) && startScreen !== 'ritam') showScreen(startScreen);

// handy for debugging in the browser console
window.vezbaj = { engine, test };

// keep the page content clear of the fixed bottom bar, whatever its height
const transportEl = $('transport');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--transport-h', `${transportEl.offsetHeight}px`);
}).observe(transportEl);
