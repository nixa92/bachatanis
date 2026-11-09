import { t } from './i18n.js?v=20261109211754';

// Test sluha: the music starts at once and every tap counts. A level ends when the player
// lands enough hits in a row; the faster that happens, the more points.
// Tap times are converted to "heard" context time, so output latency is accounted for.

// first: index of the first target beat, step: beats between targets, need: hits in a row to finish,
// Points: fastest possible time / your time, reduced for timing error. A full score needs a hit
// from the very first target and every tap dead on the beat, so it is close to impossible.
export const MODES = {
  puls:  { first: 0, step: 1, need: 8 },
  tap:   { first: 3, step: 4, need: 4 },
  jedan: { first: 0, step: 8, need: 2 },
};
const START_COUNTS = [2, 3, 4, 6, 7, 8]; // where Nađi tap and Nađi jedinicu may start
const TIMING_WEIGHT = 0.3; // share of the points that depends on timing

// The test runs through these levels in order. It plays the real songs (songs.json): slower songs on
// the lower levels, and the part it starts in gets harder: majao, then derecho, then mambo.
// The last three levels play the generated music at 160, 180 and 200 BPM.
// bpm and sections are used only if the songs cannot be loaded (then the generated music plays).
// hitMs: tolerance in Prati ritam. Nađi tap and Nađi jedinicu only ask for the tap to be closest to the right beat.
const MAJAO = ['majao'];
const MAJAO_DERECHO = ['majao', 'derecho'];
export const LEVELS = [
  { kind: 'majao', bpm: 100, sections: MAJAO, hitMs: 120 },
  { kind: 'majao', bpm: 110, sections: MAJAO, hitMs: 115 },
  { kind: 'majao', bpm: 120, sections: MAJAO, hitMs: 110 },
  { kind: 'derecho', bpm: 130, sections: MAJAO_DERECHO, hitMs: 105 },
  { kind: 'derecho', bpm: 140, sections: MAJAO_DERECHO, hitMs: 100 },
  { kind: 'derecho', bpm: 155, sections: MAJAO_DERECHO, hitMs: 95 },
  { kind: 'mambo', bpm: 170, sections: MAJAO_DERECHO, hitMs: 90 },
  { kind: 'mambo', bpm: 185, sections: MAJAO_DERECHO, hitMs: 80 },
  { kind: 'mambo', bpm: 200, sections: MAJAO_DERECHO, hitMs: 75 },
  // the last three: generated music, fast (owner: "let's knock them out")
  { generated: true, bpm: 160, sections: MAJAO_DERECHO, hitMs: 75 },
  { generated: true, bpm: 180, sections: MAJAO_DERECHO, hitMs: 70 },
  { generated: true, bpm: 200, sections: MAJAO_DERECHO, hitMs: 65 },
];
const SONG_LEVELS = LEVELS.filter((l) => !l.generated).length;
const HARDER = { majao: ['majao', 'derecho', 'mambo'], derecho: ['derecho', 'majao', 'mambo'], mambo: ['mambo', 'derecho', 'majao'] };

// The first levels play slowed songs, to make the start easier. Only songs that still sound good slowed
// have a slower version ("slow" in songs.json, made by tools/slow-songs.py, at the speed the owner picked by ear).
const SLOW_LEVELS = 3;

// a song's slower version, as a song of its own: one file (all tracks mixed), its own tempo and lag
export function slowSong(meta) {
  const { speed, file, lag } = meta.slow;
  return {
    ...meta, id: `${meta.id}-x${speed}`, dir: meta.id, files: [file], speed,
    bpm: meta.bpm * speed, lag, mixVol: 1, tracks: [{ kind: 'mix', sr: 'Cela pesma', en: 'Full song' }],
  };
}

// Songs for one game, one per level. The first levels: slowed songs (picked at random), slowest first.
// The other levels: the other songs sorted by tempo into slow, middle and fast thirds, each third in a new
// random order, so the lower levels get the slower songs.
export function songsForGame(songs) {
  if (!songs.length) return [];
  const slow = shuffled(songs.filter((s) => s.slow)).slice(0, SLOW_LEVELS).map(slowSong).sort((a, b) => a.bpm - b.bpm);
  const used = new Set(slow.map((s) => s.dir));
  const rest = songs.filter((s) => !used.has(s.id));
  const sorted = [...(rest.length ? rest : songs)].sort((a, b) => a.bpm - b.bpm);
  const third = Math.ceil(sorted.length / 3);
  const out = [...slow];
  for (let k = 0; k < 3; k++) out.push(...shuffled(sorted.slice(k * third, (k + 1) * third)));
  while (out.length < SONG_LEVELS) out.push(...shuffled(sorted));
  return out.slice(0, SONG_LEVELS);
}
function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [out[i], out[k]] = [out[k], out[i]];
  }
  return out;
}

// Where a level starts in a song: a beat in a block of the wanted rhythm (or the next one by difficulty),
// with 48 beats of regular 8-counts and no intro ahead, so the player never waits through a part without
// a beat, and enough of the song left. Nađi tap and Nađi jedinicu never start on 1 or 5; Prati ritam
// starts on 1. Returns a beat index, or null.
export function pickStart(meta, kind, mode) {
  const beats = meta.beats;
  const AHEAD = 48;
  const LEFT = 160; // beats of song left, about 75 s: time to finish the level
  for (const k of HARDER[kind] || [kind]) {
    const found = [];
    for (let i = 0; i < beats.length - Math.max(AHEAD, LEFT); i++) {
      const c = beats[i][0];
      if (beats[i][3] !== k) continue;
      if (mode.step > 1 ? c === 1 || c === 5 : c !== 1) continue;
      let ok = true;
      for (let j = 1; j < AHEAD && ok; j++) {
        const b = beats[i + j];
        ok = b[3] !== 'intro' && b[0] === ((c - 1 + j) % 8) + 1;
      }
      if (ok) found.push(i);
    }
    if (found.length) return found[Math.floor(Math.random() * found.length)];
  }
  return null;
}
export const MAX_POINTS = 100;
// timing is shown to the nearest 50 ms: finer numbers would suggest more accuracy than a phone can measure
export const roundMs = (ms) => Math.round(ms / 50) * 50;

export class EarTest {
  constructor(engine) {
    this.engine = engine;
    this.running = false;
  }

  // levelNumber: 1..LEVELS.length; song: a loaded song (engine.loadSong) or null for the generated music
  begin(modeId, levelNumber, song = null) {
    const e = this.engine;
    const mode = MODES[modeId];
    const level = LEVELS[levelNumber - 1];
    this.modeId = modeId;
    this.levelNumber = levelNumber;
    this.mode = mode;
    this.level = level;
    this.saved = {
      bpm: e.bpm, voice: e.voice, countVol: e.countVol, clickOn: e.clickOn,
      sectionOverride: e.sectionOverride, song: e.song,
    };
    e.stop();
    const start = song && !level.generated ? pickStart(song.meta, level.kind, mode) : null;
    this.song = start === null ? null : song;
    e.song = this.song;
    e.bpm = this.song ? this.song.meta.bpm : level.bpm;
    e.clickOn = false;
    e.voice = 'off';
    e.fullMix = true;
    e.sectionOverride = (ph) => level.sections[ph % level.sections.length];

    this.streak = 0;
    this.lastHit = null;   // target index of the last hit
    this.lastUsed = null;  // target index the last tap went to
    this.misses = 0;
    this.errs = [];
    this.wrongCounts = {};
    this.endTime = null;
    // Nađi tap and Nađi jedinicu start on a random count and fade in over two beats: a hard start
    // would sound like a 1 and give the answer away. Not on 5: each bar repeats, so 5 sounds like 1.
    const fadeIn = mode.step > 1 ? 2 * 60 / e.bpm : 0.03; // Prati ritam: only a click-free start
    if (this.song) {
      this.offset = song.meta.beats[start][0] - 1; // beats since the count 1
      e.pausedPos = { entry: e.songEntry(start * 2), frac: 0, from: start * 2 };
      e.start({ fadeIn });
      e.pausedPos = null;
    } else {
      this.offset = mode.step > 1 ? START_COUNTS[Math.floor(Math.random() * START_COUNTS.length)] - 1 : 0;
      e.start({ fromStep: this.offset * 2, fadeIn });
    }
    this.beatDur = 60 / e.bpm;
    this.origin = e.startTime - this.offset * this.beatDur; // where count 1 would have been
    // first target the player can hear
    this.firstTarget = Math.max(0, Math.ceil((this.offset - mode.first) / mode.step));
    this.hitWindow = mode.step > 1 ? this.beatDur / 2 : level.hitMs / 1000;
    this.running = true;
  }

  // Judges one tap. kind: 'hit' | 'early' | 'late' | 'wrong' (not near a target) | 'extra' (second tap on a target)
  tap(perfMs) {
    if (!this.running) return null;
    const time = this.engine.heardTime(perfMs);
    const { first, step } = this.mode;
    const fromStart = time - this.origin;
    const index = Math.max(0, Math.round((fromStart / this.beatDur - first) / step));
    const err = fromStart - (first + index * step) * this.beatDur;
    const result = (kind, ms = 0) => ({ kind, ms: Math.round(Math.abs(ms) * 1000), late: ms > 0, streak: this.streak, done: this.streak >= this.mode.need });

    if (Math.abs(err) >= this.beatDur / 2) {
      this._miss();
      const count = ((Math.round(fromStart / this.beatDur) % 8) + 8) % 8 + 1;
      this.wrongCounts[count] = (this.wrongCounts[count] || 0) + 1;
      return { ...result('wrong'), count };
    }
    if (index === this.lastUsed) {
      this._miss();
      return result('extra');
    }
    this.lastUsed = index;
    this.errs.push(err);
    if (Math.abs(err) > this.hitWindow) {
      this._miss();
      return result(err < 0 ? 'early' : 'late', err);
    }
    this.streak = this.lastHit === index - 1 ? this.streak + 1 : 1;
    this.lastHit = index;
    if (this.streak >= this.mode.need) this.endTime = time;
    return result('hit', err);
  }

  // True once, when the next target went by without a tap: the streak is over.
  checkMissed() {
    if (!this.running || this.streak === 0) return false;
    const { first, step } = this.mode;
    const nextBeat = this.origin + (first + (this.lastHit + 1) * step) * this.beatDur;
    if (this.engine.heardTime() <= nextBeat + this.hitWindow) return false;
    this._miss();
    return true;
  }

  _miss() {
    this.misses++;
    this.streak = 0;
  }

  // seconds since the music started
  elapsed() { return Math.max(0, this.engine.heardTime() - this.engine.startTime); }

  abort() { this._teardown(); }

  finish() {
    const seconds = this.endTime - this.engine.startTime;
    const { first, step, need } = this.mode;
    const fastest = (first + (this.firstTarget + need - 1) * step - this.offset) * this.beatDur;
    const avgError = mean(this.errs.map((x) => Math.min(Math.abs(x), this.hitWindow))) / this.hitWindow;
    this._teardown();
    return {
      mode: this.modeId, level: this.levelNumber, bpm: Math.round(60 / this.beatDur), date: new Date().toISOString(),
      song: this.song ? this.song.meta.title : '',
      seconds,
      points: Math.round(MAX_POINTS * Math.min(1, fastest / seconds) * (1 - TIMING_WEIGHT * avgError)),
      misses: this.misses,
      avgOffsetMs: mean(this.errs) * 1000,
      spreadMs: std(this.errs) * 1000,
      wrongCounts: this.wrongCounts,
    };
  }

  _teardown() {
    if (!this.running) return;
    this.running = false;
    const e = this.engine;
    e.stop();
    e.bpm = this.saved.bpm;
    e.voice = this.saved.voice;
    e.clickOn = this.saved.clickOn;
    e.sectionOverride = this.saved.sectionOverride;
    e.song = this.saved.song;
    e.fullMix = false;
    e.setCountVol(this.saved.countVol);
  }
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function std(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

// a random message of the band, never the same one twice in a row
let lastMessage = '';
// these messages send the player to practice on the Muzika screen
const SENDS_AWAY = ['fb.low.1', 'fb.low.3'];
// only a big timing error is worth leaving the game for; smaller ones are practiced right here
const PRACTICE_MS = 150;

function pickMessage(band, sendAway) {
  const options = [1, 2, 3, 4].map((i) => `fb.${band}.${i}`)
    .filter((k) => sendAway || !SENDS_AWAY.includes(k))
    .map((k) => t(k)).filter((m) => m !== lastMessage);
  lastMessage = options[Math.floor(Math.random() * options.length)];
  return lastMessage;
}

// Friendly feedback in the current language
export function feedback(r) {
  const off = r.avgOffsetMs;
  // timing within about 50 ms is good: only praise, whatever the points
  const onTime = Math.abs(off) < 75;
  const band = r.points >= 95 ? 'perfect' : r.points >= 85 || onTime ? 'great' : r.points >= 65 ? 'good' : r.points >= 40 ? 'ok' : 'low';
  const lines = [pickMessage(band, Math.abs(off) >= PRACTICE_MS)];

  // up to about 50 ms is a good result: no advice about rushing or dragging
  if (off <= -75) lines.push(t('fb.early', { ms: roundMs(-off) }));
  else if (off >= 75) lines.push(t('fb.late', { ms: roundMs(off) }));

  if (r.mode === 'puls' && r.spreadMs > 100 && !onTime) lines.push(t('fb.spread'));

  const wc = Object.entries(r.wrongCounts || {}).sort((a, b) => b[1] - a[1]);
  if (wc.length && wc[0][1] >= 2) {
    const c = Number(wc[0][0]);
    if (r.mode === 'jedan' && c === 5) lines.push(t('fb.five'));
    else if (r.mode === 'jedan') lines.push(t('fb.wrong1', { c }));
    else if (r.mode === 'tap') lines.push(t('fb.wrongTap', { c }));
  }
  return lines;
}
