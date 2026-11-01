// Sample-based instrument voices (see samples/FORMAT.md).
// samples/manifest.json lists the sounds (built by tools/build-manifest.py); each instrument uses its first entry.
// Every play* method returns true if it played a sample, false if the caller
// should use the synth instead (still loading, or failed).

export const SAMPLE_INSTRUMENTS = ['bongo', 'guira', 'bas', 'gitara', 'requinto'];

const MANIFEST_URL = 'samples/manifest.json';

// base level per instrument so a -1 dBFS sample sits close to the synth voice
// balanced against a reference song; variant gains in variant.json even out the bass and guitar variants
const BASE_GAIN = { bongo: 0.78, guira: 0.5, bas: 0.51, gitara: 0.59, requinto: 0.25 };
const SLOT_FALLBACK = { heel: ['tip'], openLow: ['open'], tap: ['open'], tip: ['heel'], open: ['tap'], short: ['long'] };

export class SampleBank {
  constructor() {
    this.ctx = null;
    this.manifest = {};
    this.cache = new Map();   // 'inst/id' -> { state: 'loading'|'ready'|'error', slots, notes, muted }
    this.rr = new Map();
    this.ready = fetch(MANIFEST_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((m) => {
        this.manifest = m && typeof m === 'object' ? m : {};
        if (this.ctx) for (const inst of SAMPLE_INSTRUMENTS) this._ensure(inst);
      });
  }

  // called by the engine once the AudioContext exists
  attach(ctx) {
    this.ctx = ctx;
    for (const inst of SAMPLE_INSTRUMENTS) this._ensure(inst);
  }

  variant(inst) { return Array.isArray(this.manifest[inst]) ? this.manifest[inst][0] || null : null; }

  _ensure(inst) {
    const v = this.variant(inst);
    if (!v || !this.ctx) return;
    const key = `${inst}/${v.id}`;
    if (this.cache.has(key)) return;
    const entry = { state: 'loading', slots: {}, notes: [], muted: [] };
    this.cache.set(key, entry);
    const load = (file) => this._decode(v.path + file);
    const jobs = [];
    for (const [slot, files] of Object.entries(v.slots || {})) {
      entry.slots[slot] = [];
      for (const f of [].concat(files)) jobs.push(load(f).then((b) => b && entry.slots[slot].push(b)));
    }
    for (const [mapKey, list] of [['notes_map', entry.notes], ['muted_notes_map', entry.muted]]) {
      for (const [midi, f] of Object.entries(v[mapKey] || {})) {
        jobs.push(load(f).then((b) => b && list.push({ midi: Number(midi), buf: b })));
      }
    }
    entry.promise = Promise.all(jobs).then(() => {
      for (const k of Object.keys(entry.slots)) if (!entry.slots[k].length) delete entry.slots[k];
      const any = Object.keys(entry.slots).length || entry.notes.length;
      entry.state = any ? 'ready' : 'error';
      if (!any) console.warn(`[samples] ${key}: nothing could be loaded, using the synth`);
    });
  }

  // resolves when the selected variants are loaded (or failed), at most after `ms`
  whenReady(ms = 1500) {
    const all = this.ready.then(() => Promise.all(SAMPLE_INSTRUMENTS.map((inst) => {
      this._ensure(inst);
      const v = this.variant(inst);
      const e = v && this.cache.get(`${inst}/${v.id}`);
      return e && e.promise;
    })));
    return Promise.race([all, new Promise((ok) => setTimeout(ok, ms))]);
  }

  async _decode(url) {
    try {
      let res;
      for (let i = 0; ; i++) {
        try { res = await fetch(url); break; } catch (e) {
          if (i >= 2) throw e; // network hiccup: try twice more
          await new Promise((ok) => setTimeout(ok, 250 * (i + 1)));
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      return await new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail));
    } catch (e) {
      console.warn(`[samples] could not load ${url}:`, e.message || e);
      return null;
    }
  }

  _ready(inst) {
    const v = this.variant(inst);
    if (!v) return null;
    const e = this.cache.get(`${inst}/${v.id}`);
    if (!e) this._ensure(inst);
    return e && e.state === 'ready' ? e : null;
  }

  _gain(inst) {
    const v = this.variant(inst);
    return BASE_GAIN[inst] * (v && v.gain > 0 ? v.gain : 1);
  }

  _slotBuf(inst, e, slot) {
    for (const s of [slot, ...(SLOT_FALLBACK[slot] || [])]) {
      const list = e.slots[s];
      if (list && list.length) {
        const k = `${inst}.${s}`;
        const i = this.rr.get(k) || 0;
        this.rr.set(k, i + 1);
        return list[i % list.length];
      }
    }
    return null;
  }

  // one buffer through a gain envelope; len > 0 cuts it with a fade of `fade` seconds
  _shot(time, buf, dest, gain, { rate = 1, len = 0, fade = 0.03, lp = 0 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    let node = src;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      node = node.connect(f);
    }
    node.connect(g).connect(dest);
    src.start(time);
    const natural = buf.duration / rate;
    if (len > 0 && natural > len) {
      const f = Math.min(fade, len * 0.5);
      g.gain.setValueAtTime(gain, time + len - f);
      g.gain.linearRampToValueAtTime(0, time + len);
      src.stop(time + len + 0.01);
    }
  }

  _nearest(list, midi) {
    let best = null;
    for (const n of list) if (!best || Math.abs(n.midi - midi) < Math.abs(best.midi - midi)) best = n;
    return best;
  }

  // ------------------------------------------------------------ voices (same arguments as instruments.js)
  playBongo(ctx, time, type, dest, vel = 1) {
    const e = this._ready('bongo');
    const buf = e && this._slotBuf('bongo', e, type);
    if (!buf) return false;
    this._shot(time, buf, dest, this._gain('bongo') * vel, { len: 0.6, fade: 0.05 });
    return true;
  }

  // dur > 0.09 s = long scrape, else a short flick; both cut to `dur` with a short fade
  playGuira(ctx, time, dur, dest, vel = 1) {
    const e = this._ready('guira');
    const buf = e && this._slotBuf('guira', e, dur > 0.09 ? 'long' : 'short');
    if (!buf) return false;
    this._shot(time, buf, dest, this._gain('guira') * vel, { len: dur, fade: dur > 0.09 ? 0.03 : 0.015 });
    return true;
  }

  _note(inst, list, time, midi, dest, gain, opts) {
    const n = this._nearest(list, midi);
    if (!n) return false;
    this._shot(time, n.buf, dest, gain, { rate: Math.pow(2, (midi - n.midi) / 12), ...opts });
    return true;
  }

  playBass(ctx, time, midi, dur, dest, vel = 1) {
    const e = this._ready('bas');
    if (!e) return false;
    return this._note('bas', e.notes, time, midi, dest, this._gain('bas') * vel, { len: Math.max(0.08, dur) + 0.06, fade: 0.06 });
  }

  playGuitar(ctx, time, midis, dest, vel = 1, { muted = false, spread = 0.011 } = {}) {
    const e = this._ready('gitara');
    if (!e || !e.notes.length) return false;
    const notes = Array.isArray(midis) ? midis : [midis];
    const useMuted = muted && e.muted.length;
    const gain = this._gain('gitara') * vel / Math.sqrt(notes.length) * (muted ? 0.85 : 1);
    const opts = muted
      ? (useMuted ? { len: 0.2, fade: 0.04 } : { len: 0.11, fade: 0.04, lp: 1800 })
      : { len: 0.75, fade: 0.2 };
    notes.forEach((m, i) => this._note('gitara', useMuted ? e.muted : e.notes, time + i * spread, m, dest, gain, opts));
    return true;
  }

  playRequinto(ctx, time, midi, dest, vel = 1, lowpass = 0) {
    const e = this._ready('requinto');
    if (!e) return false;
    return this._note('requinto', e.notes, time, midi, dest, this._gain('requinto') * vel, { len: 0.5, fade: 0.15, lp: lowpass });
  }
}
