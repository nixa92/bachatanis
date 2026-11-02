// Instrument voices.
// Every voice is a function (ctx, time, ..., dest) that schedules one hit at `time`
// (AudioContext clock) and connects to `dest`. To switch to real samples later,
// replace the body of a function with an AudioBufferSourceNode that plays a
// decoded sample (see playSample at the bottom) and keep the same signature.

let noiseBuf = null;
function noise(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noiseSource(ctx, time, dur) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.start(time, Math.random() * 1.5, dur + 0.05);
  return src;
}

// attack/decay envelope on a fresh GainNode
function envGain(ctx, time, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  return g;
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- BONGO
// type: 'tip' (soft fingertip), 'heel' (low thud), 'open' (macho open tone),
//       'openLow' (hembra open tone), 'tap' (accented slap, mambo count 1)
const BONGO = {
  tip:     { f: 520, bend: 1.15, decay: 0.045, tone: 0.22, click: 0.20, clickF: 3200 },
  heel:    { f: 190, bend: 1.10, decay: 0.07,  tone: 0.34, click: 0.06, clickF: 900 },
  open:    { f: 400, bend: 1.30, decay: 0.16,  tone: 0.50, click: 0.18, clickF: 2600 },
  openLow: { f: 265, bend: 1.30, decay: 0.22,  tone: 0.55, click: 0.14, clickF: 2000 },
  tap:     { f: 410, bend: 1.40, decay: 0.12,  tone: 0.55, click: 0.45, clickF: 1900, slap: true },
};

export function playBongo(ctx, time, type, dest, vel = 1) {
  const p = BONGO[type] || BONGO.tip;
  // membrane: sine with a fast downward pitch bend
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(p.f * p.bend, time);
  o.frequency.exponentialRampToValueAtTime(p.f, time + 0.03);
  const g = envGain(ctx, time, p.tone * vel, 0.002, p.decay);
  o.connect(g).connect(dest);
  o.start(time);
  o.stop(time + p.decay + 0.05);

  // inharmonic second mode gives the skin character
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(p.f * 1.59 * p.bend, time);
  o2.frequency.exponentialRampToValueAtTime(p.f * 1.59, time + 0.025);
  const g2 = envGain(ctx, time, p.tone * 0.3 * vel, 0.002, p.decay * 0.45);
  o2.connect(g2).connect(dest);
  o2.start(time);
  o2.stop(time + p.decay + 0.05);

  // hand click (band-passed noise)
  const nDur = p.slap ? 0.07 : 0.018;
  const n = noiseSource(ctx, time, nDur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = p.clickF;
  bp.Q.value = p.slap ? 0.9 : 1.4;
  const gn = envGain(ctx, time, p.click * vel, 0.001, nDur);
  n.connect(bp).connect(gn).connect(dest);
}

// ---------------------------------------------------------------- GÜIRA
// dur: length of the scrape in seconds (long scrape ~ 0.2 s, short ~ 0.05 s)
export function playGuira(ctx, time, dur, dest, vel = 1) {
  const n = noiseSource(ctx, time, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3800;
  const pk = ctx.createBiquadFilter();
  pk.type = 'peaking';
  pk.frequency.value = 7600;
  pk.Q.value = 1.2;
  pk.gain.value = 7;

  // the comb scraping across ridges: amplitude modulation at ridge rate
  const am = ctx.createGain();
  am.gain.value = 0.55;
  const lfo = ctx.createOscillator();
  lfo.type = 'sawtooth';
  lfo.frequency.setValueAtTime(dur > 0.1 ? 95 : 150, time);
  lfo.frequency.linearRampToValueAtTime(dur > 0.1 ? 130 : 170, time + dur);
  const depth = ctx.createGain();
  depth.gain.value = 0.45;
  lfo.connect(depth).connect(am.gain);
  lfo.start(time);
  lfo.stop(time + dur + 0.05);

  // envelope: scrape swells, then stops quickly
  const g = ctx.createGain();
  const peak = 0.32 * vel;
  const rise = dur > 0.1 ? dur * 0.6 : dur * 0.25;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak * (dur > 0.1 ? 0.55 : 1), time + 0.004);
  g.gain.linearRampToValueAtTime(peak, time + rise);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

  n.connect(hp).connect(pk).connect(am).connect(g).connect(dest);
}

// ---------------------------------------------------------------- BAS
export function playBass(ctx, time, midi, dur, dest, vel = 1) {
  const f = midiToFreq(midi);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(380 + 900 * vel, time);
  lp.frequency.exponentialRampToValueAtTime(260, time + 0.18);

  const g = ctx.createGain();
  const peak = 0.55 * vel;
  const end = time + Math.max(0.08, dur);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + 0.006);
  const knee = Math.min(time + 0.12, end - 0.03);
  g.gain.exponentialRampToValueAtTime(peak * 0.55, knee);
  g.gain.setValueAtTime(peak * 0.55, end - 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);

  const sine = ctx.createOscillator();
  sine.type = 'sine';
  sine.frequency.value = f;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  const sawG = ctx.createGain();
  sawG.gain.value = 0.35;
  const sineG = ctx.createGain();
  sineG.gain.value = 0.8;
  sine.connect(sineG).connect(g);
  saw.connect(sawG).connect(lp).connect(g);
  g.connect(dest);
  for (const o of [sine, saw]) { o.start(time); o.stop(end + 0.1); }
}

// ---------------------------------------------------------------- GUITARS (Karplus-Strong)
// Strings are rendered once into AudioBuffers and cached.
const ksCache = new Map();

function renderString(ctx, midi, { damp = 0.994, bright = 0.6, seconds = 1.4 } = {}) {
  const key = `${midi}|${damp}|${bright}|${ctx.sampleRate}`;
  if (ksCache.has(key)) return ksCache.get(key);
  const sr = ctx.sampleRate;
  const f = midiToFreq(midi);
  const N = Math.max(2, Math.round(sr / f));
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const line = new Float32Array(N);
  // excitation: noise, smoothed by `bright` (lower = darker pluck)
  let prev = 0;
  for (let i = 0; i < N; i++) {
    const r = Math.random() * 2 - 1;
    prev = prev + bright * (r - prev);
    line[i] = prev;
  }
  let idx = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const a = line[idx];
    const b = line[(idx + 1) % N];
    const y = damp * 0.5 * (a + b);
    out[i] = a;
    line[idx] = y;
    idx = (idx + 1) % N;
    const abs = Math.abs(a);
    if (abs > peak) peak = abs;
  }
  if (peak > 0) for (let i = 0; i < len; i++) out[i] /= peak;
  const entry = { buf, rate: f / (sr / N) }; // playbackRate corrects integer-delay tuning
  ksCache.set(key, entry);
  return entry;
}


const GUITAR_OPEN = { damp: 0.995, bright: 0.55, seconds: 1.2 };
const GUITAR_MUTED = { damp: 0.97, bright: 0.35, seconds: 0.25 };
const REQUINTO = { damp: 0.996, bright: 0.8, seconds: 1.0 };

function playString(ctx, time, entry, dest, gain, length, lpFreq) {
  const src = ctx.createBufferSource();
  src.buffer = entry.buf;
  src.playbackRate.value = entry.rate;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lpFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.setValueAtTime(gain, time + length * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, time + length);
  src.connect(lp).connect(g).connect(dest);
  src.start(time);
  src.stop(time + length + 0.02);
}

// Ritam gitara (segunda). midis: array of notes; spread: strum delay between strings (s)
export function playGuitar(ctx, time, midis, dest, vel = 1, { muted = false, spread = 0.011 } = {}) {
  const notes = Array.isArray(midis) ? midis : [midis];
  notes.forEach((m, i) => {
    const entry = renderString(ctx, m, muted ? GUITAR_MUTED : GUITAR_OPEN);
    const g = (muted ? 0.22 : 0.26) * vel / Math.sqrt(notes.length);
    playString(ctx, time + i * spread, entry, dest, g, muted ? 0.11 : 0.75, muted ? 1800 : 4200);
  });
}

// Requinto (lead guitar): brighter, single notes
export function playRequinto(ctx, time, midi, dest, vel = 1) {
  const entry = renderString(ctx, midi, REQUINTO);
  playString(ctx, time, entry, dest, 0.3 * vel, 0.5, 6000);
}

// ---------------------------------------------------------------- KLIK (metronome)
// level: 2 = count 1, 1 = counts 4/8 (tap), 0 = other counts
export function playClick(ctx, time, level, dest, vel = 1) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = level === 2 ? 1760 : level === 1 ? 1320 : 990;
  const g = envGain(ctx, time, 0.5 * vel, 0.001, 0.035);
  o.connect(g).connect(dest);
  o.start(time);
  o.stop(time + 0.06);
}

// ---------------------------------------------------------------- SAMPLES
// Plays a decoded AudioBuffer. `offset` skips leading silence, `maxDur` cuts the tail
// with a short fade so words never pile up at fast tempos.
export function playSample(ctx, time, buffer, dest, vel = 1, offset = 0, maxDur = 0, fade = 0.04) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = vel;
  src.connect(g).connect(dest);
  src.start(time, offset);
  if (maxDur > 0 && buffer.duration - offset > maxDur) {
    g.gain.setValueAtTime(vel, time + maxDur - fade);
    g.gain.linearRampToValueAtTime(0, time + maxDur);
    src.stop(time + maxDur + 0.01);
  }
}
