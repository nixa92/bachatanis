// Audio engine: AudioContext, mixer, lookahead scheduler, count voice.
// All timing lives on the AudioContext clock. Visuals ask positionAt(heardTime())
// and get the step that is sounding right now, so sound and picture stay locked
// even when the tempo changes mid-play.

import * as I from './instruments.js?v=20261101235018';
import * as P from './patterns.js?v=20261101235018';
import { SampleBank } from './samples.js?v=20261101235018';

export const STEPS_PER_PHRASE = 16;
const LOOKAHEAD = 0.12;    // schedule this far ahead (s)
const TICK_MS = 25;        // scheduler wake-up interval
const START_DELAY = 0.08;

export const CHANNELS = [
  { id: 'bongo', name: 'Bongo', vol: 0.6 },
  { id: 'guira', name: 'Güira', vol: 0.6 },
  { id: 'bas', name: 'Bas', vol: 0.6 },
  { id: 'gitara', name: 'Ritam gitara', vol: 0.6 },
  { id: 'requinto', name: 'Requinto', vol: 0.6 },
];

const COUNT_FILES = { sr: 'audio/sr-', en: 'audio/en-' };

export class Engine {
  constructor() {
    this.ctx = null;
    this.bpm = 120;
    this.playing = false;
    this.sectionMode = 'majao';   // 'derecho' | 'majao' | 'mambo'
    this.sectionOverride = null;    // optional fn(phrase) -> 'derecho'|'majao' (used by the ear test)
    this.voice = 'off';             // count voice language: 'sr' | 'en' | 'off'
    this.countVol = 0.6;
    this.clickOn = false;           // metronome click on every beat (alongside the voice)
    this.clickVol = 0.6;
    this.fullMix = false;           // ignore the mixer (ear test)
    this.musicOn = true;
    this.mix = {};
    for (const c of CHANNELS) this.mix[c.id] = { vol: c.vol, mute: !!c.mute, solo: false };
    this.queue = [];
    this.listeners = new Set();
    this.voices = {};
    this._timer = null;
    this.pausedPos = null;          // { entry, frac } where pause() stopped; start() continues from there
    this.samples = new SampleBank(); // sample variants; falls back to the synth per instrument
  }

  // Called when the page opens: creates the audio context (it stays suspended) and loads all sounds,
  // so that the first press of play starts at once.
  prepare() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const ctx = this.ctx;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 10;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.2;
      this.master = ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.comp).connect(ctx.destination);
      this._loadVoices();
      this.samples.attach(ctx);
    }
  }

  // Must be called from inside a user gesture (tap/click) the first time — iOS rule.
  unlock() {
    this.prepare();
    // a silent buffer started inside the gesture fully unlocks iOS output
    const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start(0);
    if (this.ctx.state !== 'running') return this.ctx.resume();
    return Promise.resolve();
  }

  async _loadVoices() {
    for (const [lang, prefix] of Object.entries(COUNT_FILES)) {
      const list = [];
      for (let i = 1; i <= 8; i++) {
        list.push(this._loadWord(prefix + i));
      }
      this.voices[lang] = await Promise.all(list);
    }
  }

  async _loadWord(base) {
    for (const ext of ['.m4a', '.wav']) {
      try {
        const res = await fetch(base + ext);
        if (!res.ok) continue;
        const data = await res.arrayBuffer();
        const buf = await new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail));
        return { buf, offset: onsetOf(buf) };
      } catch (e) { /* try the next format */ }
    }
    return null;
  }

  // ---------------------------------------------------------------- mixer
  _gainFor(id) {
    if (this.fullMix) return CHANNELS.find((c) => c.id === id).vol; // ear test: every instrument, default level
    const anySolo = CHANNELS.some((c) => this.mix[c.id].solo);
    const m = this.mix[id];
    if (anySolo) return m.solo ? m.vol : 0;
    return m.mute ? 0 : m.vol;
  }
  setMix(id, patch) {
    Object.assign(this.mix[id], patch);
    this._applyMix();
  }
  _applyMix() {
    if (!this.run) return;
    const t = this.ctx.currentTime;
    for (const c of CHANNELS) {
      const v = this.musicOn ? this._gainFor(c.id) : 0;
      this.run.bus[c.id].gain.setTargetAtTime(v, t, 0.015);
    }
    this.run.bus.count.gain.setTargetAtTime(this.countVol, t, 0.015);
    this.run.bus.click.gain.setTargetAtTime(this.clickVol, t, 0.015);
  }
  setMusicOn(on) { this.musicOn = on; this._applyMix(); }
  setCountVol(v) { this.countVol = v; this._applyMix(); }
  setClickVol(v) { this.clickVol = v; this._applyMix(); }

  // a fresh set of buses per run, so stopping can fade out notes already scheduled
  _buildRun() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.connect(this.master);
    const bus = {};
    for (const id of [...CHANNELS.map((c) => c.id), 'count', 'click']) {
      bus[id] = ctx.createGain();
      bus[id].connect(out);
    }
    bus.click.gain.value = this.clickVol;
    this.run = { out, bus };
    for (const c of CHANNELS) bus[c.id].gain.value = this.musicOn ? this._gainFor(c.id) : 0;
    bus.count.gain.value = this.countVol;
  }

  // ---------------------------------------------------------------- transport
  get stepDur() { return 30 / this.bpm; } // eighth note = 60 / bpm / 2

  // leadIn: seconds of silence before count 1, so the feet can move into it
  start({ leadIn = 0 } = {}) {
    if (this.playing || !this.ctx) return;
    this._buildRun();
    this.playing = true;
    this.g = this.pausedPos ? this.pausedPos.entry.g + 1 : 0;
    this.nextTime = this.ctx.currentTime + START_DELAY + (this.pausedPos ? 0 : leadIn);
    this.startTime = this.nextTime;
    this.queue = [];
    this._tick();
  }

  // stop and forget the position: the next start() begins at count 1
  stop() {
    this.pausedPos = null;
    this._halt();
  }

  // stop but remember the position: the next start() continues from the next step
  pause() {
    if (!this.playing) return;
    this.pausedPos = this.positionAt(this.heardTime()) || this.positionAt(this.ctx.currentTime) || this.pausedPos;
    this._halt();
  }

  _halt() {
    if (!this.playing) return;
    this.playing = false;
    clearTimeout(this._timer);
    const run = this.run;
    const t = this.ctx.currentTime;
    run.out.gain.setTargetAtTime(0, t, 0.02);
    setTimeout(() => run.out.disconnect(), 400);
    this.run = null;
    this.queue = [];
    this._emit({ type: 'stop' });
  }

  _tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    // tab was throttled: don't fire a burst of late notes, jump ahead instead
    if (this.nextTime < now - 0.05) this.nextTime = now + 0.03;
    while (this.nextTime < now + LOOKAHEAD) {
      this._schedule(this.g, this.nextTime);
      this.nextTime += this.stepDur;
      this.g++;
    }
    this._timer = setTimeout(() => this._tick(), TICK_MS);
  }

  sectionFor(phrase) {
    if (this.sectionOverride) return this.sectionOverride(phrase);
    return this.sectionMode;
  }

  _schedule(g, t) {
    const ctx = this.ctx;
    const s = g % STEPS_PER_PHRASE;
    const phrase = Math.floor(g / STEPS_PER_PHRASE);
    const dur = this.stepDur;
    const section = this.sectionFor(phrase);
    const count = Math.floor(s / 2) + 1;
    const onBeat = s % 2 === 0;
    const entry = { g, s, phrase, t, dur, section, count, onBeat };
    this.queue.push(entry);
    if (this.queue.length > 64) this.queue.splice(0, this.queue.length - 64);
    const bus = this.run.bus;

    const b = s % 8;
    const chord = P.chordAt(g);

    // bongo
    const ba = P.BONGO[section] || P.BONGO.derecho;
    const bh = ba[ba.length === 16 ? s : b];
    if (bh) {
      const strokes = Array.isArray(bh[0]) ? bh : [[0, bh[0], bh[1]]];
      for (const [off, type, vel] of strokes) this._play('playBongo', t + off * dur, type, bus.bongo, vel * humanize());
    }

    // güira
    const gh = (P.GUIRA[section] || P.GUIRA.derecho)[b];
    if (gh) {
      const strokes = Array.isArray(gh[0]) ? gh : [[0, gh[0], gh[1]]];
      for (const [off, len, vel] of strokes) this._play('playGuira', t + off * dur, len * dur, bus.guira, vel * humanize());
    }

    // bass
    for (const [step, interval, len, v] of P.bassBar(section)) {
      if (step !== b) continue;
      const vel = step === 0 && s === 8 ? P.BASS_SECOND_BAR_ROOT_VEL : v;
      this._play('playBass', t, chord.bass + interval, len * dur, bus.bas, vel);
    }

    // segunda
    const [which, muted, gv] = P.GUITAR_BAR[b];
    const notes = which === 'all' ? chord.guitar : which.map((i) => chord.guitar[i]);
    this._play('playGuitar', t, notes, bus.gitara, gv * humanize(), { muted });

    // lead guitar: one note per eighth, or two sixteenths
    if (this._gainFor('requinto') > 0) {
      const notes = P.leadBarAt(g, section)[b] || [];
      notes.forEach((midi, k) => this._play('playRequinto', t + k * dur / 2, midi, bus.requinto, P.leadVel() * humanize(), P.leadLowpass()));
    }

    // count voice / click
    if (onBeat) this._scheduleCount(entry, bus);
    this._emit({ type: 'step', entry });
  }

  // one instrument hit: the selected sample variant if it is loaded, otherwise the synth.
  // Both get the same `time`, so switching variants never moves a note.
  _play(fn, ...args) {
    if (!this.samples[fn](this.ctx, ...args)) I[fn](this.ctx, ...args);
  }

  _scheduleCount(entry, bus) {
    const { t, count } = entry;
    const level = count === 1 ? 2 : count % 4 === 0 ? 1 : 0;
    if (this.clickOn) I.playClick(this.ctx, t, level, bus.click, 0.7);
    if (this.voice === 'off') return;
    const word = this.voices[this.voice] && this.voices[this.voice][count - 1];
    if (!word) {
      // voice not loaded yet: fall back to click so the count is never silent
      if (!this.clickOn) I.playClick(this.ctx, t, level, bus.count, 0.7);
      return;
    }
    const v = count === 1 ? 1.15 : 1;
    I.playSample(this.ctx, t, word.buf, bus.count, v, word.offset, this.stepDur * 2 * 0.95);
  }

  // ---------------------------------------------------------------- clock helpers
  // The context time that is reaching the speakers right now.
  heardTime(perfMs) {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const pnow = performance.now();
    const p = perfMs === undefined ? pnow : perfMs;
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    const fallback = ctx.currentTime - (pnow - p) / 1000 - lat;
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
        const est = ts.contextTime + (p - ts.performanceTime) / 1000;
        if (Math.abs(est - fallback) < 0.5) return est;
      }
    }
    return fallback;
  }

  // Which step is sounding at context time `time`, and how far into it (0..1).
  positionAt(time) {
    const q = this.queue;
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].t <= time) {
        const frac = Math.min(1, Math.max(0, (time - q[i].t) / q[i].dur));
        return { entry: q[i], frac };
      }
    }
    return null;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(ev) { for (const fn of this.listeners) fn(ev); }
}

function humanize() { return 0.94 + Math.random() * 0.1; }

// Where the word actually starts (first sample above 10 % of the peak), minus 8 ms.
function onsetOf(buf) {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const th = peak * 0.1;
  for (let i = 0; i < d.length; i++) {
    if (Math.abs(d[i]) > th) return Math.max(0, i / buf.sampleRate - 0.008);
  }
  return 0;
}
