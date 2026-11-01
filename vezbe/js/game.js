import { t } from './i18n.js';

// Test sluha: the music starts at once and every tap counts. A level ends when the player
// lands enough hits in a row; the faster that happens, the more points.
// Tap times are converted to "heard" context time, so output latency is accounted for.

// first: index of the first target beat, step: beats between targets, need: hits in a row to finish,
// Points: fastest possible time / your time, reduced for timing error. A full score needs a hit
// from the very first target and every tap dead on the beat, so it is close to impossible.
export const MODES = {
  puls:  { first: 0, step: 1, need: 16 },
  tap:   { first: 3, step: 4, need: 4 },
  jedan: { first: 0, step: 8, need: 2 },
};
const TIMING_WEIGHT = 0.3; // share of the points that depends on timing

// The test runs through these levels in order. Tempo rises every level, and every two levels a rhythm is added.
const MAJAO = ['majao'];
const MAJAO_DERECHO = ['majao', 'derecho'];
const ALL_RHYTHMS = ['majao', 'derecho', 'mambo'];
export const LEVELS = [
  { bpm: 100, sections: MAJAO },
  { bpm: 120, sections: MAJAO },
  { bpm: 140, sections: MAJAO_DERECHO },
  { bpm: 160, sections: MAJAO_DERECHO },
  { bpm: 180, sections: ALL_RHYTHMS },
  { bpm: 200, sections: ALL_RHYTHMS },
];
const HIT_WINDOW = 0.075; // seconds from the beat that still count as a hit
export const MAX_POINTS = 100;
// timing is shown to the nearest 50 ms: finer numbers would suggest more accuracy than a phone can measure
export const roundMs = (ms) => Math.round(ms / 50) * 50;

export class EarTest {
  constructor(engine) {
    this.engine = engine;
    this.running = false;
  }

  // levelNumber: 1..LEVELS.length
  begin(modeId, levelNumber) {
    const e = this.engine;
    const mode = MODES[modeId];
    const level = LEVELS[levelNumber - 1];
    this.modeId = modeId;
    this.levelNumber = levelNumber;
    this.mode = mode;
    this.level = level;
    this.saved = {
      bpm: e.bpm, voice: e.voice, countVol: e.countVol, clickOn: e.clickOn,
      sectionOverride: e.sectionOverride,
    };
    e.stop();
    e.bpm = level.bpm;
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
    e.start();
    this.beatDur = 60 / e.bpm;
    this.hitWindow = HIT_WINDOW;
    this.running = true;
  }

  // Judges one tap. kind: 'hit' | 'early' | 'late' | 'wrong' (not near a target) | 'extra' (second tap on a target)
  tap(perfMs) {
    if (!this.running) return null;
    const time = this.engine.heardTime(perfMs);
    const { first, step } = this.mode;
    const fromStart = time - this.engine.startTime;
    const index = Math.max(0, Math.round((fromStart / this.beatDur - first) / step));
    const err = fromStart - (first + index * step) * this.beatDur;
    const result = (kind, ms = 0) => ({ kind, ms: Math.round(Math.abs(ms) * 1000), late: ms > 0, streak: this.streak, done: this.streak >= this.mode.need });

    if (Math.abs(err) >= this.beatDur / 2) {
      this._miss();
      const count = ((Math.round(fromStart / this.beatDur) % 8) + 8) % 8 + 1;
      this.wrongCounts[count] = (this.wrongCounts[count] || 0) + 1;
      return result('wrong');
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
    const fastest = (first + (need - 1) * step) * this.beatDur;
    const avgError = mean(this.errs.map((x) => Math.min(Math.abs(x), this.hitWindow))) / this.hitWindow;
    this._teardown();
    return {
      mode: this.modeId, level: this.levelNumber, bpm: this.level.bpm, date: new Date().toISOString(),
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
function pickMessage(band) {
  const options = [1, 2, 3, 4].map((i) => t(`fb.${band}.${i}`)).filter((m) => m !== lastMessage);
  lastMessage = options[Math.floor(Math.random() * options.length)];
  return lastMessage;
}

// Friendly feedback in the current language
export function feedback(r) {
  const band = r.points >= 95 ? 'perfect' : r.points >= 85 ? 'great' : r.points >= 65 ? 'good' : r.points >= 40 ? 'ok' : 'low';
  const lines = [pickMessage(band)];

  const off = r.avgOffsetMs;
  if (off < -60) lines.push(t('fb.early', { ms: roundMs(-off) }));
  else if (off > 60) lines.push(t('fb.late', { ms: roundMs(off) }));

  if (r.mode === 'puls' && r.spreadMs > 100) lines.push(t('fb.spread'));

  const wc = Object.entries(r.wrongCounts || {}).sort((a, b) => b[1] - a[1]);
  if (wc.length && wc[0][1] >= 2) {
    const c = Number(wc[0][0]);
    if (r.mode === 'jedan' && c === 5) lines.push(t('fb.five'));
    else if (r.mode === 'jedan') lines.push(t('fb.wrong1', { c }));
    else if (r.mode === 'tap') lines.push(t('fb.wrongTap', { c }));
  }
  return lines;
}
