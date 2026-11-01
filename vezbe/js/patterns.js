// Music patterns as data. One phrase = 8 counts = 2 bars = 16 eighth-note steps.
// Step s (0..15): count = floor(s/2)+1, odd steps are the "&" between counts.
// The chord loop is 4 bars (= 2 phrases). Velocities are 0..1.

// --- Numere (tracks). Each is a loop of bars: a chord and a lead guitar line.
// Optional leadVel and leadLowpass (Hz) make the lead softer and darker.
// A lead bar has 8 tokens, one per eighth: a note, x for a rest, or two notes "E5/D5" for two sixteenths.
// All melodies are written for this app. Bass, guitar and percussion come from the patterns below.
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const lead = (...bars) => bars.map((b) => b.split(' ').map((tok) => (tok === 'x' ? null : tok.split('/').map(noteToMidi))));
// Mambo: a written solo for each track, 8 bars. Derecho and majao play the melody in NUMERE.
const SOLOS = {
  clasica: lead(
    'A4/B4 C5/D5 E5 x A5/G5 E5 C5 x', 'G5/F5 D5 B4 x D5/E5 F5 G5 x', 'A5/G5 F5 C5 x F5/E5 C5 A4 x', 'G#4/B4 E5 G#5 x B5/A5 G#5 E5 x',
    'E5/E5 E5 x C5/D5 E5/G5 A5 x x', 'G5/G5 G5 x D5/E5 D5/B4 G4 x x', 'F5/F5 A5 x G5/F5 C5/D5 C5 A4 x', 'B4/C5 D5 E5/D5 C5 B4/G#4 E4 x x'),
  luna: lead(
    'A4/C5 E5 A5 x E5/D5 C5/B4 A4 x', 'F5/A5 C6 A5 x F5/E5 F5/A5 G5 F5', 'G5/E5 C5 E5/G5 C6 x G5/E5 C5 x', 'B4/D5 G5 x F5/E5 D5/B4 G4 x D5',
    'E5 x E5/G5 A5 C6/A5 G5/E5 D5 C5', 'C5 x C5/F5 A5 C6/A5 F5 x x', 'E5/F5 G5 E5/F5 G5 C6/B5 A5/G5 E5 C5', 'D5/E5 D5 B4 G4 x G4/B4 D5/F5 G5'),
  'calle-38': lead(
    'D5/E5 F5 A5 x D6/C6 A5 F5 x', 'C6/Bb5 G5 E5 x G5/F5 E5 C5 x', 'Bb4/D5 F5 Bb5 x F5/G5 A5/G5 F5 D5', 'A4/C#5 E5 A5 x E5/G5 F5/E5 C#5 A4',
    'A5 x A5/G5 F5 D5/E5 F5/G5 A5 x', 'G5 x G5/F5 E5 C5/D5 E5/F5 G5 x', 'F5 x F5/E5 D5 Bb4/C5 D5/E5 F5 x', 'E5/F5 E5/D5 C#5 x A4 C#5/E5 A5 x'),
  'nis-de-noche': lead(
    'x E5/F#5 G5 B5 B5/A5 G5 E5 x', 'x C5/D5 E5 G5 C6/B5 G5 E5 x', 'x G5/A5 B5 D6 B5/A5 G5 D5 x', 'F#5/G5 A5 F#5/E5 D5 A4/B4 C5/D5 F#5 A5',
    'B5/B5 B5 x G5/F#5 E5/F#5 G5 x x', 'C6/C6 C6 x G5/F#5 E5/F#5 G5 x x', 'D6/D6 D6 x B5/A5 G5/A5 B5 x x', 'A5/G5 F#5 E5/D5 C5 A4/C5 D5 x x'),
  lluvia: lead(
    'A4/B4 C5 E5/G5 A5 E5/C5 A4 x x', 'D5/E5 F5 A5/C6 D6 A5/F5 D5 x x', 'G5/A5 B5 D6 x B5/G5 D5/B4 G4 x', 'C5/E5 G5 C6 x G5/E5 C5 x x',
    'F5/G5 A5 C6 x A5/F5 C5 F5 x', 'D5/F5 A5 D6/C6 A5 F5/E5 D5 A4 x', 'E5/F5 G#5 B5 x G#5/F5 E5/B4 G#4 x', 'A4/C5 E5 A5/G5 E5 C5/B4 A4 x x'),
  cafe: lead(
    'C5/D5 E5 G5/A5 G5 E5/D5 C5 x x', 'B4/C5 D5 G5/A5 G5 D5/C5 B4 x x', 'A4/B4 C5 E5/G5 A5 E5/D5 C5 x x', 'F5/G5 A5 C6/A5 G5 F5/E5 D5/E5 F5 x',
    'G5 x G5/A5 G5 E5 x C6/B5 A5/G5', 'G5 x G5/A5 G5 D5 x B5/A5 G5/F5', 'E5 x E5/G5 A5 C6 x A5/G5 E5', 'F5/A5 C6 A5/F5 C5 F5/A5 G5 F5/E5 D5'),
  domingo: lead(
    'G4/B4 D5 G5 x B5/A5 G5 D5 x', 'A4/D5 F#5 A5 x D6/C#6 A5 F#5 x', 'G4/B4 E5 G5 x B5/A5 G5 E5 x', 'G4/C5 E5 G5/A5 G5 E5/D5 C5 x x',
    'B5/A5 G5 x D5 G5/A5 B5/A5 G5 x', 'A5/G5 F#5 x D5 F#5/G5 A5/G5 F#5 x', 'G5/F#5 E5 x B4 E5/F#5 G5/F#5 E5 x', 'E5/D5 C5 G4/A4 B4 C5/D5 E5/F#5 G5 x'),
  fuego: lead(
    'B4/C#5 D5 F#5 B5 F#5/D5 B4 x F#5', 'G5/A5 B5 D6/B5 G5 D5/B4 G4 x D5', 'F#5/G5 A5 D6/A5 F#5 A5/F#5 D5 x A4', 'C#5/E5 A5 E5/C#5 A4 E5/F#5 G5/F#5 E5 x',
    'F#5/F#5 F#5/E5 D5 C#5 B4/D5 F#5 B5 x', 'G5/G5 G5/F#5 E5 D5 B4/D5 G5 B5 x', 'A5/A5 A5/G5 F#5 E5 D5/F#5 A5 D6 x', 'C#6/B5 A5 G5/F#5 E5 C#5/D5 E5 A5 x'),
  mar: lead(
    'F5 x A5/G5 F5 C5 x F5/G5 A5', 'G5 x E5/F5 G5 C6 x G5/E5 C5', 'A5 x F5/E5 D5 A4 x D5/E5 F5', 'F5 x D5/C5 Bb4 D5 x F5/G5 A5',
    'C6/A5 F5 C5/A4 C5 F5/G5 A5/C6 A5 F5', 'C6/G5 E5 C5/G4 C5 E5/F5 G5/C6 G5 E5', 'D6/A5 F5 D5/A4 D5 F5/G5 A5/D6 A5 F5', 'Bb5/F5 D5 Bb4/F4 Bb4 D5/F5 Bb5/A5 G5 F5'),
  sol: lead(
    'A4/B4 C#5 E5/F#5 A5 E5/C#5 A4 x E5', 'G#5/F#5 E5 B4/C#5 E5 B5/G#5 E5 x E5', 'F#5/G#5 A5 C#6/A5 F#5 C#5/D5 E5 F#5 x', 'D5/F#5 A5 D6/A5 F#5 A5/G#5 F#5 D5 E5',
    'E5 x A5/B5 C#6 A5/E5 C#5 x x', 'E5 x G#5/A5 B5 G#5/E5 B4 x x', 'F#5 x A5/B5 C#6 A5/F#5 C#5 x x', 'D5/E5 F#5/A5 B5/A5 F#5 A5/B5 A5 E5 x'),
};

export const NUMERE = [
  { id: 'clasica', naziv: 'Clásica', chords: ['Am', 'G', 'F', 'E'], leadVel: 0.55, leadLowpass: 2200, lead: lead(
    'E5 x C5 E5 A4 x C5 x', 'D5 x B4 D5 G4 x B4 x', 'C5 x A4 C5 F4 x A4 x', 'B4 x G#4 B4 E5 x B4 x') },
  { id: 'luna', naziv: 'Luna', chords: ['Am', 'F', 'C', 'G'], lead: lead(
    'E5 x E5 D5/C5 A4 x C5 E5', 'F5 x F5 E5/D5 C5 x A4 C5', 'E5 x E5 D5/C5 G4 x C5 E5', 'D5 x B4 D5 G5 x F5/E5 D5') },
  { id: 'calle-38', naziv: 'Calle 38', chords: ['Dm', 'C', 'Bb', 'A'], lead: lead(
    'A4 x D5 F5 A5 x F5 D5', 'G4 x C5 E5 G5 x E5 C5', 'F4 x Bb4 D5 F5 x D5 Bb4', 'E5 C#5/D5 E5 x A4 x C#5 E5') },
  { id: 'nis-de-noche', naziv: 'Niš de noche', chords: ['Em', 'C', 'G', 'D'], lead: lead(
    'x B4 E5 G5/F#5 E5 x B4 x', 'x C5 E5 G5/F#5 E5 x C5 x', 'x B4 D5 G5/F#5 D5 x B4 x', 'A4 D5 F#5 x A5 G5/F#5 E5 D5') },
  { id: 'lluvia', naziv: 'Lluvia', chords: ['Am', 'Dm', 'G', 'C', 'F', 'Dm', 'E', 'Am'], lead: lead(
    'C5 x A4 C5 E5 x D5 C5', 'D5 x F5 x A5 x F5 D5', 'B4 x D5 x G5 x F5 E5', 'E5 x C5 x G4 x x x',
    'F5 x C5 F5 A5 x G5 F5', 'F5 E5/D5 D5 x A4 x x x', 'E5 x B4 E5 G#5 x E5 B4', 'A4 x x x x x x x') },
  { id: 'cafe', naziv: 'Café', chords: ['C', 'G', 'Am', 'F'], lead: lead(
    'G5 E5 C5 E5 G5 E5 C5 x', 'G5 D5 B4 D5 G5 D5 B4 x', 'A5 E5 C5 E5 A5 E5 C5 x', 'A5 F5 C5 F5 A5/G5 G5 F5 E5') },
  { id: 'domingo', naziv: 'Domingo', chords: ['G', 'D', 'Em', 'C'], lead: lead(
    'D5 D5 x B4 G4 x B4 D5', 'D5 D5 x A4 F#4 x A4 D5', 'E5 E5 x B4 G4 x B4 E5', 'E5 x G5 E5 C5 D5 E5 x') },
  { id: 'fuego', naziv: 'Fuego', chords: ['Bm', 'G', 'D', 'A'], lead: lead(
    'F#5/F#5 F#5 x D5 B4 x D5 x', 'G5/G5 G5 x D5 B4 x D5 x', 'F#5/F#5 F#5 x A5 F#5 x D5 x', 'E5/E5 E5 x C#5 A4 x E5 x') },
  { id: 'mar', naziv: 'Mar', chords: ['F', 'C', 'Dm', 'Bb'], lead: lead(
    'A4 x x C5 F5 x x C5', 'G4 x x C5 E5 x x C5', 'A4 x x D5 F5 x x D5', 'Bb4 x x D5 F5 x G5 F5') },
  { id: 'sol', naziv: 'Sol', chords: ['A', 'E', 'F#m', 'D'], lead: lead(
    'E5 x C#5 E5 A5 x E5 x', 'E5 x B4 E5 G#5 x E5 x', 'F#5 x C#5 F#5 A5 x F#5 E5', 'D5 x F#5 A5 F#5 D5 E5 x') },
].map((n) => ({
  ...n,
  chords: n.chords.map(chordFromName),
  leads: { derecho: n.lead, majao: n.lead, mambo: SOLOS[n.id] },
}));

function noteToMidi(name) {
  const m = name.match(/^([A-G])([#b]?)(\d)$/);
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// bass = root in E1..D#2, guitar = triad with its root in D3..C#4
function chordFromName(name) {
  const m = name.match(/^([A-G][#b]?)(m?)$/);
  const pc = noteToMidi(`${m[1]}0`) % 12;
  const third = m[2] ? 3 : 4;
  const low = 50 + ((pc - 50 % 12 + 12) % 12);
  return { name, bass: 28 + ((pc - 4 + 12) % 12), guitar: [low, low + third, low + 7] };
}

let current = NUMERE[0];
export const setNumera = (id) => { current = NUMERE.find((n) => n.id === id) || NUMERE[0]; };
export const numeraId = () => current.id;
export const leadVel = () => current.leadVel || 0.7;
export const leadLowpass = () => current.leadLowpass || 0;
const barOf = (g) => Math.floor(g / 8);
// the chord and the lead bar at a global step
export const chordAt = (g) => current.chords[barOf(g) % current.chords.length];
export const leadBarAt = (g, section) => {
  const bars = current.leads[section] || current.leads.derecho;
  return bars[barOf(g) % bars.length];
};
// every guitar and lead note, so the synth fallback can prepare them
export const allGuitarNotes = () => NUMERE.flatMap((n) => n.chords.flatMap((c) => c.guitar));
export const allLeadNotes = () => NUMERE.flatMap((n) => [...n.lead, ...n.leads.mambo].flat(2).filter((x) => x !== null));

// Three bachata rhythms (song sections):
//   derecho — verses: bongo (martillo) and güira play every eighth; the low drum on 4
//   majao   — usually the chorus: bongo and güira play only the counts, güira with longer scrapes
//   mambo   — bridge / instrumental break, the most energetic part: güira plays 3 short strokes per count;
//             the other instruments improvise (here: a busier bongo with more open tones)
// Source: bachataclass.com/bachatablog/bachata-instruments, Ubisoft "Breaking Down Bachata, Part 2".
export const SECTIONS = ['derecho', 'majao', 'mambo'];

// --- Bongo. 8 steps (one bar, repeated) or 16 steps (whole phrase): [stroke, velocity] or null (rest).
// count:        1                &              2              &              3                &              4 (lowest)        &
export const BONGO = {
  // derecho (caminando) = martillo, from the notation in "BACHATA EN BONGÓ - PATRON DEL DERECHO":
  // per bar (8 eighths = dance counts 1&2&3&4&), hands R L R L R L R L:
  //   1 open covered | & open | 2 open | & palm | 3 open covered | & open | 4 OPEN LOW DRUM | & palm
  // 2& is much softer than 4&, as in the reference song (about 10 dB).
  // open covered ("abierto tapado") -> 'tip' (muffled), palm -> 'heel', low drum (hembra) -> 'openLow'
  derecho: [['tip', 0.7], ['open', 0.55], ['open', 0.7], ['heel', 0.16], ['tip', 0.7], ['open', 0.55], ['openLow', 1.0], ['heel', 0.5]],
  // majao: only the counts. Transcribed from "Bachata Basic Bongo Rhythms" (Bachata Academy):
  // open tones on 1, 2 and 3, the low drum on 4.
  majao:   [['open', 0.75], null, ['open', 0.75], null, ['open', 0.8], null, ['openLow', 1.0], null],
  // mambo, same video: a fast run of four sixteenths on the small drum (1&, 1a, 2, 2e),
  // then 2& low drum, 3 open, 3& open, 4 low drum, 4& palm; a slap on 1.
  // A step can hold several strokes: [[offset in eighths, stroke, velocity], ...]
  mambo: [
    ['tap', 0.9], [[0, 'open', 0.7], [0.5, 'open', 0.6]], [[0, 'open', 0.72], [0.5, 'open', 0.6]], ['openLow', 0.6],
    ['open', 0.7], ['open', 0.5], ['openLow', 1.0], ['heel', 0.5],
  ],
};

// --- Güira. Per bar 8 steps: [scrape length in eighths, velocity], a list of strokes
// [[offset in eighths, length in eighths, velocity], ...], or null.
// Measured from "3 basic Bachata rhythms on Guira" (Bachata Academy): every stroke is short
// (about 110 ms at 120 BPM) and evenly loud. derecho: every eighth. majao: only the counts.
// mambo: 3 strokes per count, on the count, the "&" and the "a".
const MAMBO_COUNT = [[0, 0.42, 0.68]];
const MAMBO_AND = [[0, 0.42, 0.68], [0.5, 0.42, 0.68]];
export const GUIRA = {
  derecho: Array(8).fill([0.45, 0.55]),
  majao: [[0.52, 0.65], null, [0.52, 0.65], null, [0.52, 0.65], null, [0.52, 0.65], null],
  mambo: [MAMBO_COUNT, MAMBO_AND, MAMBO_COUNT, MAMBO_AND, MAMBO_COUNT, MAMBO_AND, MAMBO_COUNT, MAMBO_AND],
};

// --- Bas gitara. Per bar: [stepInBar, interval above root, length in steps, velocity]
// 1 held for 1½ beats, a pickup on 2&, then 3 and 4 one beat each. Nothing on 2.
export const BASS_BAR = [
  [0, 0, 3, 1.0],
  [3, 7, 1, 0.55],
  [4, 7, 2, 0.75],
  [6, 12, 2, 0.7],
];
// Mambo has no fixed bass rhythm. Base taken from the majao described by iASO Records
// (Bachata Breakdown): 1, 2, 2&, 4, 4&, no 3, with 1 and 2& emphasized and 2& held 1.5 beats.
// The intervals are our choice.
export const BASS_MAMBO_BAR = [
  [0, 0, 2, 1.0],
  [2, 7, 1, 0.55],
  [3, 7, 3, 0.85],
  [6, 12, 1, 0.65],
  [7, 7, 1, 0.55],
];
export const bassBar = (section) => (section === 'mambo' ? BASS_MAMBO_BAR : BASS_BAR);
export const BASS_SECOND_BAR_ROOT_VEL = 0.85; // count 5 a bit lighter than count 1

// --- Ritam gitara (segunda). Per bar 8 steps: [voicing note indexes, muted?, velocity]
// Bass note (lowest voicing note) on 1, 3 and 4; short muted strums in between.
export const GUITAR_BAR = [
  [[0], false, 0.6], [[1, 2], true, 0.32], [[1, 2], true, 0.36], [[1, 2], true, 0.32],
  [[0], false, 0.55], [[1, 2], true, 0.32], [[0], false, 0.55], [[1, 2], true, 0.32],
];

// Returns hits for one instrument at a phrase step — used both for drawing lanes
// and for scheduling. Returns a velocity (0 = nothing).
export function laneVelocity(inst, s, section) {
  const b = s % 8;
  switch (inst) {
    case 'bongo': {
      const arr = BONGO[section] || BONGO.derecho;
      const h = arr[arr.length === 16 ? s : b];
      if (!h) return 0;
      return Array.isArray(h[0]) ? Math.max(...h.map((x) => x[2])) : h[1];
    }
    case 'guira': {
      const h = (GUIRA[section] || GUIRA.derecho)[b];
      if (!h) return 0;
      return Array.isArray(h[0]) ? Math.max(...h.map((x) => x[2])) : h[1];
    }
    case 'bas': {
      const hit = bassBar(section).find((h) => h[0] === b);
      if (!hit) return 0;
      return b === 0 && s === 8 ? BASS_SECOND_BAR_ROOT_VEL : hit[3];
    }
    case 'gitara':
      return GUITAR_BAR[b][2];
    case 'requinto': {
      return leadBarAt(s, section)[b] ? 0.4 : 0;
    }
  }
  return 0;
}
