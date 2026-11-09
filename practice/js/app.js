import { Engine, CHANNELS } from './engine.js?v=20261109204003';
import { laneVelocity, NUMERE, setNumera, numeraId } from './patterns.js?v=20261109204003';
import { KORACI } from './steps.js?v=20261109204003';
import { FeetView } from './feet.js?v=20261109204003';
import { EarTest, MODES, LEVELS, roundMs, feedback, songsForGame } from './game.js?v=20261109204003';
import * as store from './storage.js?v=20261109204003';
import * as board from './leaderboard.js?v=20261109204003';
import { t, lang, setLang, onLangChange, applyStatic, pointsWord } from './i18n.js?v=20261109204003';
import { ICONS } from './icons.js?v=20261109204003';
import { unlocked } from './gate.js?v=20261109204003';

await unlocked(); // the club gate: nothing starts (no song downloads) until the code is typed

const $ = (id) => document.getElementById(id);
const engine = new Engine();
engine.prepare();
const state = { screen: 'ritam', step: KORACI[0], view: 'vodja', mode: 'puls', level: 1, voiceOn: false }; // the count starts off (owner)
const BPM_MIN = 60, BPM_MAX = 200;

// ------------------------------------------------------------ language (SR / EN, like the site)
applyStatic();
engine.voice = state.voiceOn ? lang : 'off';
for (const b of document.querySelectorAll('.lang button')) b.addEventListener('click', () => setLang(b.dataset.lang));
onLangChange((l) => {
  if (state.voiceOn && !test.running) engine.voice = l;
  renderPlay();
  setBpm(engine.bpm);
  renderTiles();
  renderMusicPicker();
  renderSongTiles();
  showSongMode(!!engine.song);
  buildSeek();
  renderGames();
  renderBoard();
  renderIntro();
  renderStepList();
  setupFeet();
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
engine.on((ev) => {
  if (ev.type !== 'end') return; // a song played to its end
  renderPlay();
  if (test.running) { test.abort(); startTest(state.mode); } // the game ran out of song: the level starts again
});

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

let genBpm = 125; // the generated music's tempo, kept while a song plays at its own tempo
function setBpm(v) {
  if (engine.song) {
    // a real song plays at its recorded tempo
    engine.bpm = engine.song.meta.bpm;
    $('bpm-down').disabled = $('bpm-up').disabled = true;
    $('bpm-val').textContent = engine.bpm;
    $('bpm-name').textContent = t('preset.song');
    return;
  }
  engine.bpm = genBpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v / 5) * 5));
  $('bpm-down').disabled = engine.bpm <= BPM_MIN;
  $('bpm-up').disabled = engine.bpm >= BPM_MAX;
  $('bpm-val').textContent = engine.bpm;
  $('bpm-name').textContent = engine.bpm <= 100 ? t('preset.slow') : engine.bpm >= 150 ? t('preset.fast') : t('preset.mid');
}
$('bpm-down').addEventListener('click', () => setBpm(engine.bpm - 5));
$('bpm-up').addEventListener('click', () => setBpm(engine.bpm + 5));
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
    c.className = `${cls}-cell` + (i % 4 === 0 ? ' is-tap' : '');
    c.innerHTML = `<span class="${cls}-num">${i}</span>`;
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
function makeTile(tile, box) {
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
  el.querySelector('.tile-head').addEventListener('click', () => { tile.toggle(); renderTiles(); renderSongTiles(); drawLanes(currentSection); });
  el.querySelector('.tile-vol').addEventListener('input', (e) => { tile.setVol(Number(e.target.value)); drawLanes(currentSection); });
  if (tile.id === 'requinto') el.insertBefore($('numera-field'), el.querySelector('.tile-vol'));
  box.appendChild(el);
  tile.el = el;
}
for (const tile of TILES) makeTile(tile, $(tile.box));
function renderTiles(tiles = TILES) {
  for (const tile of tiles) {
    const iconId = tile.icon || tile.id;
    const name = tile.name ? tile.name() : t(TILE_NAME[tile.id] || `ch.${tile.id}`);
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

// ------------------------------------------------------------ real songs (emusicality.co.uk)
// "Izaberi pesmu": the generated music, or a real song with every instrument on its own track.
const MUSIC_KEY = 'vezbaj.muzika';
const MUSIC_DAY_KEY = 'vezbaj.muzika.dan'; // the day the song was picked: a pick from an earlier day gives way to the song of the day
// Song of the day: every day the next song in songs.json, in a circle. On 3. 11. 2026 it is Del Mar.
const FIRST_DAY = { id: 'delmar', date: [2026, 11, 3] };
const dayNumber = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
const today = () => new Date().toDateString();
function songOfTheDay() {
  const start = songList.findIndex((s) => s.id === FIRST_DAY.id);
  const [y, m, d] = FIRST_DAY.date;
  const days = dayNumber(new Date()) - dayNumber(new Date(y, m - 1, d));
  const n = songList.length;
  return songList[(((Math.max(start, 0) + days) % n) + n) % n];
}
const musicSel = $('muzika');
let songList = [];
let songTiles = [];
let songLoad = 0; // id of the latest load, so an older one that finishes late is ignored

function renderMusicPicker() {
  const value = musicSel.value || 'gen';
  musicSel.textContent = '';
  // one flat list: the generated music first, then the songs, all at the same level
  musicSel.add(new Option(t('muzika.gen'), 'gen'));
  for (const s of songList) musicSel.add(new Option(`${s.title} – ${s.artist}`, s.id));
  musicSel.value = [...musicSel.options].some((o) => o.value === value) ? value : 'gen';
}
// in a song the rhythm is not picked: the panel shows the rhythm and the part playing now
// for beginners a song has 4 kinds of block: intro, derecho, majao and mambo (songs.json, made by import-songs.py)
const BLOCK_NAMES = { intro: 'Intro', derecho: 'Derecho', majao: 'Majao', mambo: 'Mambo', bachata: 'Bachata' };
// "Izaberi prikaz ritma": simple (default) shows only Intro and Bachata (derecho, majao and mambo together);
// detailed shows all four blocks. Used by the rhythm panel and the seek bar.
const VIEW_KEY = 'vezbaj.prikaz';
let songView = 'simple';
try { if (localStorage.getItem(VIEW_KEY) === 'detail') songView = 'detail'; } catch (e) { /* private mode */ }
const shownBlock = (kind) => (songView === 'simple' && kind !== 'intro' ? 'bachata' : kind);
for (const b of seg('songview').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.value === songView));
bindSeg(seg('songview'), (v) => {
  songView = v;
  try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* private mode */ }
  buildSeek();
  shownBeat = undefined;
  showSongRhythm(null);
});
let shownBeat = null;
function showSongMode(on) {
  $('mixer').hidden = on;
  $('song-mixer').hidden = !on;
  $('lanes-wrap').hidden = on;
  seg('section').hidden = on;
  seg('songview').hidden = !on;
  if (on) placeInd(seg('songview'), false);
  $('song-rhythm').hidden = !on;
  $('lbl-section').textContent = t(on ? 'section.song' : 'section.label');
  shownBeat = undefined;
  if (on) showSongRhythm(null);
  else describeSection();
}
// entry: the step playing now, or null before the song plays
function showSongRhythm(entry) {
  const key = entry ? shownBlock(entry.section) : null;
  if (key === shownBeat) return;
  shownBeat = key;
  if (!entry) {
    $('song-rhythm-name').textContent = '—';
    $('song-rhythm-part').textContent = '';
    $('section-help').textContent = t('song.idle');
    return;
  }
  const b = shownBlock(entry.section);
  $('song-rhythm-name').textContent = BLOCK_NAMES[b] || b;
  $('song-rhythm-part').textContent = '';
  $('section-help').textContent = t(`section.${b}.help`);
}
function renderSongTiles() {
  renderTiles(songTiles);
}
// Play is off while a song loads, so the previous song cannot start in the meantime
function setLoading(on) {
  $('play').disabled = on;
  $('play').classList.toggle('is-loading', on);
  $('play').setAttribute('aria-busy', String(on));
}
async function pickMusic(id) {
  const load = ++songLoad;
  if (engine.playing || engine.pausedPos) { engine.stop(); renderPlay(); }
  // let go of the previous song's sound now, so it is not in memory while the new song decodes (~270 MB)
  if (engine.song) engine.song.buffers = null;
  setLoading(false);
  try { localStorage.setItem(MUSIC_KEY, id); localStorage.setItem(MUSIC_DAY_KEY, today()); } catch (e) { /* private mode */ }
  const status = $('song-status');
  const meta = songList.find((s) => s.id === id);
  if (!meta) {
    engine.song = null;
    buildSeek();
    showSongMode(false);
    status.textContent = '';
    setBpm(genBpm);
    return;
  }
  status.textContent = t('song.loading', { done: 0, total: meta.tracks.length });
  setLoading(true);
  try {
    const song = await engine.loadSong(meta, (done, total) => {
      if (load === songLoad) status.textContent = t('song.loading', { done, total });
    }, { parallel: true });
    if (load !== songLoad) return;
    engine.song = song;
    setLoading(false);
  } catch (e) {
    if (load !== songLoad) return;
    setLoading(false);
    status.textContent = t('song.error');
    musicSel.value = 'gen';
    engine.song = null;
    buildSeek();
    showSongMode(false);
    setBpm(genBpm);
    return;
  }
  status.textContent = '';
  const box = $('song-mixer');
  box.textContent = '';
  songTiles = meta.tracks.map((tr, n) => ({
    id: `t${n}`, icon: tr.kind,
    name: () => (lang === 'en' ? tr.en : tr.sr),
    isOn: () => !engine.song.mix[n].mute,
    toggle: () => engine.setSongMix(n, { mute: !engine.song.mix[n].mute }),
    vol: () => engine.song.mix[n].vol,
    setVol: (v) => engine.setSongMix(n, { vol: v }),
  }));
  for (const tile of songTiles) makeTile(tile, box);
  renderSongTiles();
  showSongMode(true);
  buildSeek();
  setBpm();
}
musicSel.addEventListener('change', () => pickMusic(musicSel.value));
renderMusicPicker();
fetch('songs/songs.json', { cache: 'no-cache' }).then((r) => r.json()).then((data) => {
  songList = data.songs;
  engine.songVersion = data.version || '';
  // download every song's files in the background, so picking a song only has to decode it
  setTimeout(() => engine.prefetchSongs(songList), 3000);
  renderMusicPicker();
  // the song picked today stays; otherwise the song of the day
  let saved = null;
  try { if (localStorage.getItem(MUSIC_DAY_KEY) === today()) saved = localStorage.getItem(MUSIC_KEY); } catch (e) { /* private mode */ }
  const pick = saved === 'gen' || songList.some((s) => s.id === saved) ? saved : songOfTheDay()?.id;
  if (pick) {
    musicSel.value = pick;
    pickMusic(pick);
  }
}).catch(() => { /* no songs: only the generated music */ });

// ------------------------------------------------------------ song seek bar
// One segment per block of the song (intro, derecho, majao, mambo), filled as it plays. Seeking lands on a count 1.
let seekSegs = [];
let seeking = null; // beat index under the finger while dragging
function buildSeek() {
  const song = engine.song;
  $('seek').hidden = !song;
  $('transport').classList.toggle('is-song', !!song);
  const box = $('seek-segs');
  box.textContent = '';
  seekSegs = [];
  if (!song) return;
  // blocks as shown: in the simple view neighbouring derecho, majao and mambo merge into one Bachata block
  const blocks = [];
  for (const b of song.meta.blocks) {
    const kind = shownBlock(b.kind);
    if (blocks.length && blocks[blocks.length - 1].kind === kind) blocks[blocks.length - 1].end = b.end;
    else blocks.push({ kind, start: b.start, end: b.end });
  }
  for (const sec of blocks) {
    const el = document.createElement('div');
    el.className = `seek-seg is-${sec.kind}`;
    el.style.flex = `${sec.end - sec.start + 1} 1 0`;
    el.title = BLOCK_NAMES[sec.kind];
    el.appendChild(document.createElement('i'));
    box.appendChild(el);
    seekSegs.push({ sec, el, fill: el.firstChild });
  }
}
// x on the screen -> the count 1 at or before that beat, inside its block
function beatAt(clientX) {
  let seg = seekSegs[seekSegs.length - 1];
  for (const sg of seekSegs) if (clientX <= sg.el.getBoundingClientRect().right) { seg = sg; break; }
  const r = seg.el.getBoundingClientRect();
  const { sec } = seg;
  const k = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  let i = Math.round(sec.start + k * (sec.end - sec.start));
  const beats = engine.song.meta.beats;
  while (i > sec.start && beats[i][0] !== 1) i--;
  return i;
}
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
function updateSeek(i) {
  const { meta } = engine.song;
  const beat = 60 / meta.bpm;
  const bar = $('seek-bar').getBoundingClientRect();
  for (const { sec, el, fill } of seekSegs) {
    const k = Math.max(0, Math.min(1, (i - sec.start) / (sec.end - sec.start + 1)));
    fill.style.width = `${(k * 100).toFixed(2)}%`;
    if (i >= sec.start && i < sec.end + 1) {
      const r = el.getBoundingClientRect();
      $('seek-thumb').style.transform = `translateX(${(r.left - bar.left + k * r.width).toFixed(1)}px)`;
      const text = BLOCK_NAMES[sec.kind];
      if ($('seek-part').textContent !== text) $('seek-part').textContent = text;
    }
  }
  const time = `${clock(i * beat)} / ${clock(meta.beats.length * beat)} · ${meta.bpm} BPM`;
  if ($('seek-time').textContent !== time) $('seek-time').textContent = time;
  $('seek-bar').setAttribute('aria-valuenow', String(Math.round((100 * i) / meta.beats.length)));
  $('seek-bar').setAttribute('aria-valuetext', `${$('seek-part').textContent}, ${time}`);
}
const seekBar = $('seek-bar');
seekBar.addEventListener('pointerdown', (e) => {
  if (!engine.song) return;
  seekBar.setPointerCapture(e.pointerId);
  seeking = beatAt(e.clientX);
});
seekBar.addEventListener('pointermove', (e) => { if (seeking !== null) seeking = beatAt(e.clientX); });
const endSeek = () => {
  if (seeking === null) return;
  engine.seekSong(seeking);
  seeking = null;
  renderPlay();
};
seekBar.addEventListener('pointerup', endSeek);
seekBar.addEventListener('pointercancel', () => { seeking = null; });
// arrows: one 8-count back or forward; Home: the start
seekBar.addEventListener('keydown', (e) => {
  if (!engine.song) return;
  const pos = engine.playing ? engine.positionAt(engine.heardTime()) : engine.pausedPos;
  const now = pos ? Math.floor(pos.entry.g / 2) : 0;
  const beats = engine.song.meta.beats;
  let i = null;
  if (e.key === 'Home') i = 0;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    i = now + dir;
    while (i > 0 && i < beats.length - 1 && beats[i][0] !== 1) i += dir;
  }
  if (i === null) return;
  e.preventDefault();
  engine.seekSong(i);
});

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
// "S noge na nogu u intro": in a song's intro the feet shift weight at half speed instead of the step
const SHIFT_KEY = 'vezbaj.nogaNaNogu';
let introShift = true;
try { introShift = localStorage.getItem(SHIFT_KEY) !== 'off'; } catch (e) { /* private mode */ }
$('intro-shift').setAttribute('aria-checked', String(introShift));
// the switch toggles; tapping the text does the same
$('intro-shift-row').addEventListener('click', () => {
  introShift = !introShift;
  $('intro-shift').setAttribute('aria-checked', String(introShift));
  try { localStorage.setItem(SHIFT_KEY, introShift ? 'on' : 'off'); } catch (err) { /* private mode */ }
});
function setupFeet() {
  feet.setStep(state.step, state.view);
  $('feet').dataset.view = state.view;
}
setupFeet();

// ------------------------------------------------------------ TEST
const test = new EarTest(engine);
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

// opts.board: passed to renderBoard when the intro (with the leaderboard) opens
function showTestPart(part, opts = {}) {
  if (part !== 'run') setNumera(numeraSel.value); // back to the player's own pick
  setGameView(part === 'run');
  $('test-setup').hidden = part !== 'setup';
  $('test-intro').hidden = part !== 'intro';
  $('test-run').hidden = part !== 'run';
  $('test-result').hidden = part !== 'result';
  if (part === 'run') window.scrollTo(0, 0);
  if (part === 'result') $('test-result').scrollIntoView();
  if (part === 'intro') renderBoard(opts.board);
}

const showStreak = (n) => {
  const need = MODES[state.mode].need;
  $('run-streak').textContent = t('run.streak', { n, need });
  $('progress-bar').style.width = `${(100 * n / need).toFixed(1)}%`;
};
const seconds = (s) => `${s.toFixed(1).replace('.', t('decimal'))} s`;
const levelText = (n) => t('level.of', { n, total: LEVELS.length });

// The game plays the real songs: the level's song is loaded while the button shows "Učitavam…",
// and the next level's song loads while the result shows. If a song cannot load, another song is
// tried; only if none loads does the generated music play.
const gameSongs = new Map(); // song id -> promise of the loaded song (this level's and the next one)
function loadGameSong(meta) {
  if (!meta) return Promise.resolve(null);
  if (!gameSongs.has(meta.id)) {
    gameSongs.set(meta.id, engine.loadSong(meta).catch((e) => { console.warn('[igra] song load failed:', e); return null; }));
  }
  return gameSongs.get(meta.id);
}
// after a level: let go of its song and load the next level's while the result shows
function preloadNextSong() {
  const next = run && run.songs[state.level];
  for (const id of [...gameSongs.keys()]) if (!next || id !== next.id) gameSongs.delete(id);
  loadGameSong(next);
}
async function startTest(modeId, btn = null) {
  await engine.unlock();
  await engine.samples.whenReady();
  let song = null;
  if (state.level <= run.songs.length) {
    const label = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = t('song.loadingShort'); }
    // this level's song; if it cannot load, another song of the game, before falling back to the generated music
    const order = [run.songs[state.level - 1], ...run.songs.filter((_, i) => i !== state.level - 1)];
    for (const meta of order) {
      song = await loadGameSong(meta);
      if (song) break;
      console.warn(`[igra] ${meta.id} could not be loaded, trying another song`);
      gameSongs.delete(meta.id);
    }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  if (!song) setNumera(run.tracks[(state.level - 1) % run.tracks.length]);
  test.begin(modeId, state.level, song);
  $('run-title').textContent = `${t(`mode.${modeId}`)}, ${levelText(state.level)}`;
  $('run-instr').textContent = t(`mode.${modeId}.how`);
  // a song level that fell back to the generated music says so (usually the phone ran out of memory)
  $('tap-fb').textContent = state.level <= run.songs.length && !test.song ? t('game.fallback') : '';
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
    id: run.id, docId: run.docId, name: run.name, mode: run.mode, date: r.date,
    level: Math.max(...Object.keys(run.points).map(Number)),
    total: run.total,
  });
  // the online leaderboard: the same document grows by one level; the name stays the one the game started with
  const points = Object.keys(run.points).map(Number).sort((a, b) => a - b).map((l) => run.points[l]);
  // the leaderboard shown after the game waits for this save
  run.saving = board.submitRun({ docId: run.docId, name: run.name, mode: run.mode, points, month: run.month })
    .catch((e) => console.warn('[tabela] not saved:', e.message));
}
$('test-start').addEventListener('click', () => {
  const name = $('player-name').value.trim();
  if (!name) {
    $('name-error').textContent = t('name.missing');
    $('player-name').focus();
    return;
  }
  $('name-error').textContent = '';
  state.level = 1;
  store.setName(name);
  run = { id: Date.now(), docId: board.newRunId(), month: board.monthOf(), name, mode: state.mode, points: {}, tracks: shuffled(NUMERE.map((n) => n.id)), songs: songsForGame(songList) };
  // "level 0": the game is saved when it starts, so the games that end inside level 1 are counted too
  board.submitRun({ docId: run.docId, name, mode: run.mode, points: [], month: run.month })
    .catch((e) => console.warn('[tabela] start not saved:', e.message));
  startTest(state.mode, $('test-start'));
});
$('player-name').addEventListener('input', () => { $('name-error').textContent = ''; });
$('res-next').addEventListener('click', () => { state.level++; startTest(state.mode, $('res-next')); });
$('res-back').addEventListener('click', () => showTestPart('setup'));
$('res-board').addEventListener('click', showBoardAfterGame);
$('res-quit').addEventListener('click', showBoardAfterGame);
$('intro-back').addEventListener('click', () => showTestPart('setup'));
$('test-abort').addEventListener('click', abortTest);
function abortTest() { test.abort(); showBoardAfterGame(); }
// after a game (stopped, or all levels passed): the leaderboard, loaded again once the game is saved;
// it scrolls to the player's name, or to the leaderboard if they are not on it
function showBoardAfterGame() {
  const played = run && Object.keys(run.points).length > 0;
  showTestPart('intro', { board: played ? { after: run.saving, findMe: true } : {} });
  window.scrollTo(0, 0);
}

function tapText({ kind, ms, late, count }) {
  if (kind === 'hit') return ms <= 50 ? t('tap.hit') : t(late ? 'tap.hitLate' : 'tap.hitEarly');
  if (kind === 'early' || kind === 'late') return t(`tap.${kind}`, { ms: roundMs(ms) });
  if (kind === 'extra') return t('tap.extra');
  return t(`tap.wrong.${state.mode}`, { c: count });
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
  preloadNextSong();
  r.name = $('player-name').value.trim();
  store.setName(r.name);
  addToRun(r);
  $('res-run').textContent = t('res.run', { total: run.total });
  showLevelPoints(r.points);
  $('res-time').textContent = seconds(r.seconds);
  $('res-misses').textContent = r.misses;
  $('res-offset').textContent = offsetText(r.avgOffsetMs);
  $('res-bpm').textContent = `${r.bpm} BPM`;
  const last = state.level === LEVELS.length;
  const lines = feedback(r);
  if (last) lines.push(t('res.done', { total: LEVELS.length }));
  $('res-level').textContent = `${t(`mode.${r.mode}`)}, ${levelText(r.level)}`;
  $('res-next').hidden = last;
  // between levels: the next level or quit (to the leaderboard); another game is offered only after the last level
  $('res-quit').hidden = last;
  $('res-back').hidden = !last;
  $('res-board').hidden = !last;
  $('res-msg').innerHTML = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  showTestPart('result');
  renderGames();
}
// the level's points as "+75 bodova", counted up from 0
let countUp = 0;
function showLevelPoints(points) {
  const score = $('res-score');
  $('res-unit').textContent = pointsWord(points);
  const id = ++countUp;
  if (!points || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { score.textContent = `+${points}`; return; }
  const DURATION = 900;
  const start = performance.now();
  const step = (now) => {
    if (id !== countUp) return;
    const p = Math.min(1, (now - start) / DURATION);
    score.textContent = `+${Math.round(points * (1 - (1 - p) ** 3))}`; // ease out: fast, then slowing to the end
    if (p < 1) requestAnimationFrame(step);
  };
  score.textContent = '+0';
  requestAnimationFrame(step);
}
function offsetText(ms) {
  const a = roundMs(Math.abs(ms));
  if (a === 0) return t('off.exact');
  return t(ms < 0 ? 'off.early' : 'off.late', { ms: a });
}

function renderGames() {
  const runs = store.getRuns();
  $('game-list').innerHTML = Object.keys(MODES).map((mode) => {
    const mine = runs.filter((r) => r.mode === mode);
    const top = mine.length ? mine.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    return `<button type="button" class="game-card" data-mode="${mode}"><b>${t(`mode.${mode}`)}</b><span>${t(`goal.${mode}`)}</span><small>${top ? t('games.record', { total: top.total, level: top.level }) : t('hist.none')}</small></button>`;
  }).join('');
}
$('game-list').addEventListener('click', (e) => {
  const card = e.target.closest('.game-card');
  if (!card) return;
  state.mode = card.dataset.mode;
  renderIntro();
  showTestPart('intro');
  window.scrollTo(0, 0);
});
function renderIntro() {
  $('intro-title').textContent = t(`mode.${state.mode}`);
  $('intro-steps').innerHTML = [t('intro.music'), t(`mode.${state.mode}.how`), t(`goal.${state.mode}`), t('intro.miss'), t('intro.speed', { total: LEVELS.length })]
    .map((l) => `<li>${l}</li>`).join('');
}
renderGames();

// ------------------------------------------------------------ leaderboard
const boardView = { period: 'month' }; // the game is the one opened (state.mode)
let boardLoad = 0;
$('board-period').addEventListener('change', (e) => { boardView.period = e.target.value; renderBoard(); });
// opts.after: a promise to wait for first (the save of the game just played)
// opts.findMe: scroll to the player's row, if they are on the list
async function renderBoard(opts = {}) {
  if ($('test-intro').hidden) return;
  boardView.mode = state.mode;
  const load = ++boardLoad;
  const list = $('board-list');
  const me = $('board-me');
  const month = boardView.period === 'month' ? board.monthOf() : null;
  if (!list.children.length || list.dataset.view !== `${boardView.mode}/${boardView.period}`) {
    list.innerHTML = `<li class="board-note">${escapeHtml(t('board.loading'))}</li>`;
  }
  let rows;
  try {
    if (opts.after) await opts.after;
    rows = await board.topRuns(boardView.mode, month);
  } catch (e) {
    console.warn('[tabela]', e.message);
    if (load === boardLoad) { list.innerHTML = `<li class="board-note">${escapeHtml(t('board.error'))}</li>`; me.hidden = true; }
    return;
  }
  if (load !== boardLoad) return;
  list.dataset.view = `${boardView.mode}/${boardView.period}`;
  // this phone's own games are highlighted; its best game is shown below if it is not in the list
  const mine = store.getRuns().filter((r) => r.mode === boardView.mode && r.docId && (!month || board.monthOf(new Date(r.date)) === month));
  const myIds = new Set(mine.map((r) => r.docId));
  list.innerHTML = rows.length
    ? rows.map((r, i) => `<li class="board-row${myIds.has(r.id) ? ' is-me' : ''}"><span class="board-rank">${i + 1}.</span><span class="board-name">${escapeHtml(r.name)}</span><span class="board-level">${escapeHtml(t('board.level', { level: r.level }))}</span><b class="board-total">${escapeHtml(t('board.points', { total: r.total }))}</b></li>`).join('')
    : `<li class="board-note">${escapeHtml(t('board.empty'))}</li>`;
  const best = mine.length ? mine.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  me.hidden = !best || rows.some((r) => myIds.has(r.id));
  if (best) me.textContent = t('board.me', { total: best.total, level: best.level });
  // after a game: to the player's row if they are on the list, otherwise to the top of the leaderboard
  if (opts.findMe) {
    const myRow = list.querySelector('.is-me');
    if (myRow) {
      myRow.classList.add('is-found');
      myRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      $('board-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
renderBoard();

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
// Koraci with a real song: which pattern the feet show. It is decided once per phrase, by the beat on
// count 1, so the feet never switch in the middle of an 8-count; every pattern starts and ends in the
// same place, so a switch on count 1 is smooth:
//   intro: weight shifts (if the switch is on), short: korak tap for a 4-beat bar (counts 1-4, then 1 again),
//   step: the picked step.
// The next beat's pattern is given too, so on the last beat the foot already travels to the next pattern's spot.
function feetMode(pos) {
  if (!engine.song) return {};
  const beats = engine.song.meta.beats;
  const patternAt = (i) => {
    let k = i; // back to the phrase's count 1 (or the song's first beat)
    while (k > 0 && i - k < 8 && beats[k][0] !== 1) k--;
    if (introShift && beats[k][3] === 'intro') return 'intro';
    if (beats[k][0] === 1 && beats[k + 3] && beats[k + 3][0] === 4 && beats[k + 4] && beats[k + 4][0] === 1) return 'short';
    return 'step';
  };
  if (!pos) { // the lead-in before the song's first beat
    const first = patternAt(0);
    return { pattern: first, nextPattern: first, nextCount: beats[0][0] - 1 };
  }
  const b = pos.entry.phrase;
  if (!beats[b]) return {};
  const pattern = patternAt(b);
  const nb = beats[b + 1];
  if (!nb) return { pattern };
  return { pattern, nextPattern: nb[0] === 1 ? patternAt(b + 1) : pattern, nextCount: nb[0] - 1 };
}
function frameBody() {
  // fall back to the scheduler clock if the output-latency estimate is off (some browsers)
  // while paused, and just after resuming, the picture holds the paused position
  const pos = engine.playing
    ? (engine.positionAt(engine.heardTime()) || engine.positionAt(engine.ctx.currentTime) || engine.pausedPos)
    : engine.pausedPos;
  const ci = pos ? Math.floor(pos.entry.s / 2) : -1;

  if (engine.song && state.screen !== 'test') updateSeek(seeking ?? (pos ? (pos.entry.g + pos.frac) / 2 : 0));
  if (engine.song && state.screen === 'ritam') showSongRhythm(pos && pos.entry.part !== undefined ? pos.entry : null);
  if (state.screen === 'ritam') {
    lightCells(barCells, ci);
    lightLanes(pos ? pos.entry.s : -1);
    if (engine.playing && !engine.song && pos && pos.entry.section !== currentSection) drawLanes(pos.entry.section);
  } else if (state.screen === 'koraci') {
    const fci = feet.render(pos || leadInPos(), feetMode(pos));
    lightCells(barCells, pos ? fci : -1);
  } else if (state.screen === 'test' && test.running) {
    $('run-time').textContent = seconds(test.elapsed());
    if (test.checkMissed()) {
      showStreak(0);
      $('tap-fb').textContent = t(`tap.missed.${state.mode}`);
      $('tap-fb').className = 'tap-fb is-miss';
    }
  }
}
requestAnimationFrame(frame);
// some embedded browser previews pause requestAnimationFrame; fall back to a timer there
setInterval(() => { if (performance.now() - lastFrame > 120) { lastFrame = performance.now(); frameBody(); } }, 33);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    engine.stale = true;
    if (test.running) abortTest();
  } else if (engine.playing && engine.ctx.state !== 'running') {
    // the sound stopped in the background: show Play, so the next tap starts the sound again
    engine.pause();
    renderPlay();
  }
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
