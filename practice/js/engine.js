// Audio engine: AudioContext, mixer, lookahead scheduler, count voice.
// All timing lives on the AudioContext clock. Visuals ask positionAt(heardTime())
// and get the step that is sounding right now, so sound and picture stay locked
// even when the tempo changes mid-play.

import * as I from './instruments.js?v=20261102181249';
import * as P from './patterns.js?v=20261102181249';
import { SampleBank } from './samples.js?v=20261102181249';

export const STEPS_PER_PHRASE = 16;
const LOOKAHEAD = 0.18;    // schedule this far ahead (s); a count word may start up to 0.15 s before its beat
const TICK_MS = 25;        // scheduler wake-up interval
const START_DELAY = 0.08;

export const CHANNELS = [
  { id: 'bongo', name: 'Bongo', vol: 0.6 },
  { id: 'guira', name: 'Güira', vol: 0.6 },
  { id: 'bas', name: 'Bas', vol: 0.6 },
  { id: 'gitara', name: 'Ritam gitara', vol: 0.6 },
  { id: 'requinto', name: 'Requinto', vol: 0.6 },
];

// count voice per language: files audio/<lang>-<id>-1..8, made by tools/make-voices.py
const VOICES = { sr: 'lana', en: 'samantha' };

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
    this.song = null;               // a real song (loadSong) plays instead of the generated music
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
    for (const [lang, id] of Object.entries(VOICES)) {
      const list = [];
      for (let i = 1; i <= 8; i++) list.push(this._loadWord(`audio/${lang}-${id}-${i}`));
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
        const offset = onsetOf(buf);
        // the ear hears a word on its vowel: "sedam" starts with a hiss and its "e" comes 125 ms later,
        // so it is started that much earlier and every count sounds evenly spaced
        return { buf, offset, lead: Math.min(0.15, Math.max(0, vowelOf(buf) - offset)) };
      } catch (e) { /* try the next format */ }
    }
    return null;
  }

  // ---------------------------------------------------------------- real songs
  // Loads every track of a song from songs/songs.json. onProgress(done, total) after each track.
  // Returns { meta, buffers, mix } to set as engine.song.
  // A whole song decoded is large (a 4-minute track at 48 kHz is about 50 MB), and a phone can refuse to
  // decode more. So tracks are decoded at 32 kHz (a third less memory, no audible loss for practice)
  // and one after another, so the memory peak stays low.
  // parallel: decode every track at once. Faster where the browser decodes on several threads, but the
  // memory peak is higher (each running decode keeps a temporary buffer of about 45 MB), so the game,
  // which loads the next level's song while the current one is still in memory, stays one at a time.
  async loadSong(meta, onProgress = () => {}, { parallel = false } = {}) {
    this.prepare();
    const total = meta.tracks.length;
    let buffers = [];
    if (parallel) {
      const files = await Promise.all(meta.tracks.map((_, n) => this._songFile(meta, n).then((r) => r.arrayBuffer())));
      let done = 0;
      buffers = await Promise.all(files.map((data) => this._decodeSong(data).then((buf) => { onProgress(++done, total); return buf; })));
    } else {
      for (let n = 0; n < total; n++) {
        const res = await this._songFile(meta, n);
        buffers.push(await this._decodeSong(await res.arrayBuffer()));
        onProgress(n + 1, total);
      }
    }
    return { meta, buffers, mix: meta.tracks.map(() => ({ vol: 0.6, mute: false })) }; // 0.6 = the middle of the slider (0-1.2)
  }
  // Song files are kept in the browser's Cache Storage (on disk, not in memory), so a song picked later
  // only has to be decoded. The version from songs.json is in the address, so a new import is fetched
  // again and old files are dropped. Cache Storage needs https (or localhost); elsewhere it just fetches.
  async _songFile(meta, n) {
    const url = `songs/${meta.id}/${n}.m4a?v=${this.songVersion || 0}`;
    const cache = await this._songCache();
    let res = cache && await cache.match(url);
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error(`${meta.id} track ${n}: HTTP ${res.status}`);
      if (cache) await cache.put(url, res.clone()).catch(() => {});
    }
    return res;
  }
  async _songCache() {
    if (!window.caches) return null;
    if (!this._cachePromise) {
      this._cachePromise = caches.open('vezbaj-pesme').then(async (cache) => {
        // drop files of an older import
        for (const req of await cache.keys()) if (!req.url.endsWith(`v=${this.songVersion || 0}`)) cache.delete(req);
        return cache;
      }).catch(() => null);
    }
    return this._cachePromise;
  }
  // downloads every song's files into the cache, one at a time, unless the phone saves data
  async prefetchSongs(songs) {
    if (navigator.connection && navigator.connection.saveData) return;
    const cache = await this._songCache();
    if (!cache) return;
    for (const meta of songs) {
      for (let n = 0; n < meta.tracks.length; n++) {
        try { const r = await this._songFile(meta, n); await r.arrayBuffer(); } catch (e) { return; }
      }
    }
  }

  _decodeSong(data) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    let ctx = this.ctx;
    try { if (OAC) ctx = new OAC(1, 1, 32000); } catch (e) { /* fall back to the main context's rate */ }
    return new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail));
  }
  setSongMix(n, patch) {
    Object.assign(this.song.mix[n], patch);
    this._applyMix();
  }
  _songGain(n) {
    const m = this.song.mix[n];
    return this.musicOn && !m.mute ? m.vol : 0;
  }
  // starts every track so that eighth g of the song sounds at context time `when`
  _startSong(g, when) {
    const { meta, buffers } = this.song;
    const pos = meta.lag + g * this.stepDur; // file time of that eighth
    this.run.sources = buffers.map((buf, n) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.run.bus[`t${n}`]);
      if (pos >= 0) src.start(when, pos);
      else src.start(when - pos, 0);
      return src;
    });
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
    if (this.song && this.run.song) this.song.mix.forEach((_, n) => this.run.bus[`t${n}`].gain.setTargetAtTime(this._songGain(n), t, 0.015));
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
    this.run = { out, bus, song: !!this.song, sources: [] };
    for (const c of CHANNELS) bus[c.id].gain.value = this.musicOn ? this._gainFor(c.id) : 0;
    bus.count.gain.value = this.countVol;
    if (this.song) {
      this.song.mix.forEach((_, n) => {
        bus[`t${n}`] = ctx.createGain();
        bus[`t${n}`].gain.value = this._songGain(n);
        bus[`t${n}`].connect(out);
      });
    }
  }

  // ---------------------------------------------------------------- transport
  get stepDur() { return 30 / this.bpm; } // eighth note = 60 / bpm / 2

  // leadIn: seconds of silence before count 1, so the feet can move into it
  // fromStep: eighth to start on instead of count 1 (the ear game starts mid-bar)
  // fadeIn: seconds to fade the music in, so the first note heard does not sound like a 1
  start({ leadIn = 0, fromStep = 0, fadeIn = 0 } = {}) {
    if (this.playing || !this.ctx) return;
    this._buildRun();
    this.playing = true;
    this.g = this.pausedPos ? (this.pausedPos.from ?? this.pausedPos.entry.g + 1) : fromStep;
    this.nextTime = this.ctx.currentTime + START_DELAY + (this.pausedPos ? 0 : leadIn);
    this.startTime = this.nextTime;
    if (fadeIn > 0) {
      this.run.out.gain.setValueAtTime(0, this.startTime);
      this.run.out.gain.linearRampToValueAtTime(1, this.startTime + fadeIn);
    }
    this.queue = [];
    if (this.song) this._startSong(this.g, this.nextTime);
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
    for (const src of run.sources) src.stop(t + 0.15);
    setTimeout(() => run.out.disconnect(), 400);
    this.run = null;
    this.queue = [];
    this._emit({ type: 'stop' });
  }

  _tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    // tab was throttled: don't fire a burst of late notes, jump ahead instead.
    // A song keeps playing on its own, so skip the missed steps to stay on its beat.
    if (this.nextTime < now - 0.05) {
      if (this.song) while (this.nextTime < now) { this.nextTime += this.stepDur; this.g++; }
      else this.nextTime = now + 0.03;
    }
    while (this.nextTime < now + LOOKAHEAD) {
      // a song ends 8 beats after its last counted beat, so the last notes can ring
      if (this.song && this.g >= (this.song.meta.beats.length + 8) * 2) {
        this.stop();
        this._emit({ type: 'end' });
        return;
      }
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
    if (this.song) { this._scheduleSong(g, t); return; }
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

  // a song plays from its own tracks; this only keeps the count, the click and the visuals in step.
  // Counts come from the song's breakdown, so a 4-beat bar counts 1-4 (or 5-8) like the dancers do.
  _scheduleSong(g, t) {
    const entry = this.songEntry(g, t);
    if (!entry) return; // the tail after the last counted beat
    const { onBeat } = entry;
    this.queue.push(entry);
    if (this.queue.length > 64) this.queue.splice(0, this.queue.length - 64);
    if (onBeat) this._scheduleCount(entry, this.run.bus);
    this._emit({ type: 'step', entry });
  }

  // the step of eighth g of the song, as the scheduler makes it (t = when it sounds)
  songEntry(g, t = 0) {
    const beat = this.song && this.song.meta.beats[Math.floor(g / 2)];
    if (!beat) return null;
    // section: the beginner's block (intro, derecho, majao or mambo); part and rhythm: the full breakdown
    const [count, part, rhythm, block] = beat;
    return { g, s: (count - 1) * 2 + (g % 2), phrase: Math.floor(g / 2), t, dur: this.stepDur, section: block, part, rhythm, count, onBeat: g % 2 === 0 };
  }

  // jumps to beat i of the song (from 0); keeps playing if it was playing, otherwise waits there
  seekSong(i) {
    if (!this.song) return;
    const g = Math.max(0, Math.min(i, this.song.meta.beats.length - 1)) * 2;
    const was = this.playing;
    this._halt();
    // start() continues from the step after pausedPos, so point it one step back
    this.pausedPos = { entry: this.songEntry(g), frac: 0, from: g };
    if (was) this.start();
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
    // start before the beat by the word's lead, but never in the past (then skip that much of the hiss)
    const start = Math.max(t - word.lead, this.ctx.currentTime + 0.005);
    const skip = word.offset + (start - (t - word.lead));
    // a word may sound until shortly before the next one; it fades out gently instead of being cut
    I.playSample(this.ctx, start, word.buf, bus.count, v, skip, this.stepDur * 2 * 0.9, 0.09);
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

// Where the vowel starts: the first moment the low band (below ~1 kHz, so not the hiss of s, š, č)
// reaches 30 % of its loudest, minus 10 ms.
function vowelOf(buf) {
  const d = buf.getChannelData(0);
  const a = 1 - Math.exp((-2 * Math.PI * 1000) / buf.sampleRate);
  const win = Math.round(buf.sampleRate * 0.01);
  const env = new Float32Array(d.length);
  let y = 0;
  let sum = 0;
  const sq = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) {
    y += a * (d[i] - y);
    sq[i] = y * y;
    sum += sq[i] - (i >= win ? sq[i - win] : 0);
    env[i] = sum;
  }
  let max = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > max) max = env[i];
  const th = max * 0.09; // 30 % of the level = 9 % of the energy
  for (let i = 0; i < env.length; i++) if (env[i] > th) return Math.max(0, (i - win) / buf.sampleRate - 0.01);
  return 0;
}

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
