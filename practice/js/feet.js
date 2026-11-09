import { t } from './i18n.js?v=20261109215235';
import { KORACI, NOGA_NA_NOGU } from './steps.js?v=20261109215235';
// Top-down feet animation for the Koraci screen.
// Positions come from steps.js; time comes from the audio engine (positionAt),
// so the feet land exactly on the counts you hear.

const NS = 'http://www.w3.org/2000/svg';
const SWAP = { L: 'D', D: 'L' };
const START = { L: [-0.3, 0], D: [0.3, 0] };
const GAP = 1.4; // distance between partners in "Oboje" view (toes about 0.4 foot apart; checked: no overlap in any step)
const FOOT = 0.85; // drawn foot size; smaller feet leave clear space between them in turns
const SHIFT = 0.15; // in "Oboje" the follower stands a little to the lead's right, so their feet zigzag

// right foot, toes up, ~1 unit long; the left foot is this mirrored
const SOLE = 'M0.02,-0.5 C0.17,-0.5 0.2,-0.3 0.19,-0.13 C0.18,0.05 0.13,0.16 0.13,0.3 ' +
  'C0.13,0.45 0.07,0.52 0,0.52 C-0.09,0.52 -0.13,0.43 -0.12,0.3 C-0.11,0.12 -0.17,0.0 ' +
  '-0.17,-0.2 C-0.17,-0.4 -0.1,-0.5 0.02,-0.5 Z';
const TOES = [[-0.09, -0.6, 0.075], [0.005, -0.625, 0.05], [0.075, -0.6, 0.045], [0.13, -0.55, 0.04], [0.175, -0.48, 0.035]];

export function moveLabel(m) {
  if (!m) return '';
  return t(m.tap ? `foot.tap${m.noga}` : `foot.${m.noga}`);
}

// moves and the foot state after every count, for one role ('vodja' | 'pratilja')
export function buildStates(step, role) {
  const moves = step.brojevi.map((b) => !b ? null
    : role === 'vodja'
      ? { noga: b.noga, x: b.x, y: b.y, tap: !!b.tap, ugao: b.ugao, vuci: !!b.vuci }
      // in a turn or a cross behind the follower is a left-right mirror, so y stays;
      // otherwise she goes back when the lead goes forward
      // with ogledalo the whole step is a left-right mirror: both partners go forward together
      : b.ugao === undefined && !b.iza && !step.ogledalo
        ? { noga: SWAP[b.noga], x: -b.x, y: -b.y, tap: !!b.tap, vuci: !!b.vuci }
        : { noga: SWAP[b.noga], x: -b.x, y: b.y, tap: !!b.tap, vuci: !!b.vuci, ugao: b.ugao === undefined ? undefined : -b.ugao });
  const pos = {};
  const real = moves.filter(Boolean); // counts where a foot moves (null = both feet hold)
  for (const foot of ['L', 'D']) {
    const last = [...real].reverse().find((m) => m.noga === foot);
    const st = role === 'vodja' ? START[foot] : [-START[SWAP[foot]][0], 0];
    pos[foot] = last ? [last.x, last.y] : st;
  }
  const lastWeighted = [...real].reverse().find((m) => !m.tap);
  let weight = lastWeighted ? lastWeighted.noga : 'L';
  const lastTurned = [...real].reverse().find((m) => m.ugao !== undefined);
  let angle = lastTurned ? lastTurned.ugao : 0;
  // Each foot has its own angle and turns only while it is in the air; the standing foot stays still.
  // A turning step spins its foot in the turn's direction; any other step takes the short way.
  const footAngle = { L: angle, D: angle };
  const spin = (m, body) => {
    const target = m.ugao !== undefined ? m.ugao : body;
    let d = turnBy(footAngle[m.noga], target);
    if (m.ugao !== undefined && d * Math.sign(m.ugao) < 0) d += 360 * Math.sign(m.ugao);
    return d;
  };
  // one pass to find where each foot points at the end of the phrase, which is where it starts
  let body = angle;
  for (const m of real) {
    if (m.ugao !== undefined) body = m.ugao;
    footAngle[m.noga] += spin(m, body);
  }
  const tapped = {};
  for (const foot of ['L', 'D']) {
    const last = [...real].reverse().find((m) => m.noga === foot);
    tapped[foot] = !!(last && last.tap);
  }
  const states = moves.map((m) => {
    if (!m) return { pos: { L: [...pos.L], D: [...pos.D] }, weight, angle, footAngle: { ...footAngle }, tapped: { ...tapped } };
    pos[m.noga] = [m.x, m.y];
    if (!m.tap) weight = m.noga;
    if (m.ugao !== undefined) angle = m.ugao;
    m.spin = spin(m, angle); // how far this foot turns on its way to this count
    footAngle[m.noga] += m.spin;
    tapped[m.noga] = m.tap;
    return { pos: { L: [...pos.L], D: [...pos.D] }, weight, angle, footAngle: { ...footAngle }, tapped: { ...tapped } };
  });
  return { moves, states };
}

// shortest way from angle a to angle b, in degrees (-180..180)
const turnBy = (a, b) => (((b - a + 180) % 360) + 360) % 360 - 180;

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export class FeetView {
  constructor(svg) {
    this.svg = svg;
    this.persons = [];
  }

  // view: 'vodja' | 'pratilja' | 'oboje'
  setStep(step, view) {
    this.step = step;
    this.view = view;
    this.svg.textContent = '';
    this.persons = [];
    // a foot in a tap shows only its front part
    const clip = el('clipPath', { id: 'foot-front' });
    clip.appendChild(el('rect', { x: '-1', y: '-1', width: '2', height: '1.05' }));
    this.svg.appendChild(clip);
    const add = (role, place, source = step) => {
      const data = buildStates(source, role);
      data.intro = buildStates(NOGA_NA_NOGU, role); // shown in a song's intro when the option is on
      data.short = buildStates(KORACI.find((k) => k.id === 'korak-tap'), role); // a song's 4-beat bar
      const g = el('g', { class: `person person-${role}` });
      this.svg.appendChild(g);
      const feet = {};
      for (const foot of ['L', 'D']) feet[foot] = makeFoot(g, foot);
      this.persons.push({ role, place, ...data, feet });
    };
    if (view === 'vodja') add('vodja', { map: (x, y) => [x, -y], rot: 0 });
    else if (view === 'pratilja') add('pratilja', { map: (x, y) => [x, -y], rot: 0 });
    else {
      // in a turn only the follower turns; the lead dances the step named in vodjaOboje
      const leadStep = KORACI.find((k) => k.id === step.vodjaOboje) || step;
      add('vodja', { map: (x, y) => [x, -y], rot: 0 }, leadStep);
      // follower stands opposite, facing the lead: own frame rotated 180°
      const gap = step.razmak || GAP; // partners who step toward each other need more room
      add('pratilja', { map: (x, y) => [SHIFT - x, -(gap - y)], rot: 180 });
    }
    this._fitViewBox();
    this.render(null);
  }

  _fitViewBox() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of this.persons) {
      for (const st of p.states) {
        for (const foot of ['L', 'D']) {
          const [sx, sy] = p.place.map(...st.pos[foot]);
          minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
        }
      }
    }
    const pad = 0.6; // a little room around the feet (less padding inside the card)
    let w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
    let x = minX - pad, y = minY - pad;
    const minW = 3.6, minH = 2.6;
    if (w < minW) { x -= (minW - w) / 2; w = minW; }
    if (h < minH) { y -= (minH - h) / 2; h = minH; }
    if (this.view === 'oboje') {
      // names of the partners: the follower is at the top, the lead at the bottom
      const band = 0.24;
      y -= band; h += band * 2;
      const cx = (x + w / 2).toFixed(2); // quiet captions, centred
      const top = el('text', { class: 'role-name role-name-pratilja', x: cx, y: (y + 0.18).toFixed(2), 'text-anchor': 'middle' });
      top.textContent = t('role.pratilja');
      const bottom = el('text', { class: 'role-name role-name-vodja', x: cx, y: (y + h - 0.08).toFixed(2), 'text-anchor': 'middle' });
      bottom.textContent = t('role.vodja');
      this.svg.append(top, bottom);
    }
    this.svg.setAttribute('viewBox', `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    this.svg.style.aspectRatio = `${w.toFixed(2)} / ${h.toFixed(2)}`; // the card is as tall as the step needs
  }

  // pos: {entry, frac} from engine.positionAt, or null when stopped.
  // pattern: 'step' (the picked step), 'intro' (the weight shifts of a song's intro) or 'short'
  // (korak tap, for a song's 4-beat bar: it takes 4 counts and ends where it started).
  // nextPattern, nextCount: the pattern and count (0..7) of the next beat, when it is not simply the
  // next count of the same pattern (a new phrase with another pattern, or a 4-beat bar);
  // the foot then already travels to where the next pattern puts it, so it never jumps.
  // Returns the current count index (0..7) or -1.
  render(pos, { pattern = 'step', nextPattern = pattern, nextCount = null } = {}) {
    let ci = 7, f = 0, idle = true;
    if (pos) {
      const b = (pos.entry.s + pos.frac) / 2; // beats into the phrase, 0..8
      ci = Math.min(7, Math.floor(b));
      f = b - ci;
      idle = false;
    }
    for (const person of this.persons) {
      const pick = (name) => (name === 'step' ? person : person[name]);
      const p = { ...person, ...pick(pattern) };
      const nextMoves = pick(nextPattern).moves;
      const st = p.states[ci];
      const cur = p.moves[ci];
      const next = nextMoves[nextCount ?? (ci + 1) % 8];
      for (const foot of ['L', 'D']) {
        let [x, y] = st.pos[foot];
        let angle = st.footAngle[foot];
        let lift = 0;
        let onBall = !idle && st.tapped[foot];
        // the foot of the next count travels during the second half of the beat;
        // a sliding foot (vuci) moves along the floor through the whole beat, so the slide looks continuous
        if (!idle && next && next.noga === foot && next.vuci) {
          x += (next.x - x) * f;
          y += (next.y - y) * f;
          onBall = true;
        } else if (!idle && next && next.noga === foot && f > 0.5) {
          const k = ease((f - 0.5) / 0.5);
          x += (next.x - x) * k;
          y += (next.y - y) * k;
          lift = Math.sin(Math.PI * k);
          angle += next.spin * k; // the foot turns only in the air
          onBall = false; // a foot in the air touches nothing, so it is drawn empty (e.g. between the two taps of dupli tap)
        }
        // no flash in the middle of a slide, only where it ends
        const sliding = next && next.vuci && cur && next.noga === cur.noga;
        const flash = !idle && cur && cur.tap && cur.noga === foot && !sliding ? Math.max(0, 1 - f / 0.55) : 0;
        const [sx, sy] = p.place.map(x, y);
        updateFoot(p.feet[foot], sx, sy, p.place.rot + angle, st.weight === foot, lift, flash, onBall);
      }
    }
    return idle ? -1 : ci;
  }

  labels(ci) {
    return this.persons.map((p) => ({ role: p.role, text: ci < 0 ? '' : moveLabel(p.moves[ci]) }));
  }
}

function el(name, attrs) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function makeFoot(parent, foot) {
  const g = el('g', { class: `foot foot-${foot}` });
  const ring = el('circle', { class: 'foot-ring', r: '0.62', cx: '0', cy: '-0.05' });
  const body = el('g', { class: 'foot-body' });
  const inner = el('g', { transform: foot === 'L' ? 'scale(-1,1)' : '' });
  inner.appendChild(el('path', { d: SOLE, class: 'foot-ghost' }));
  const sole = el('path', { d: SOLE, class: 'foot-sole' });
  inner.appendChild(sole);
  for (const [cx, cy, r] of TOES) inner.appendChild(el('circle', { cx, cy, r, class: 'foot-sole' }));
  body.appendChild(inner);
  const label = el('text', { class: 'foot-letter', x: '0', y: '0.2', 'text-anchor': 'middle' });
  label.textContent = foot;
  body.appendChild(label);
  g.appendChild(ring);
  g.appendChild(body);
  parent.appendChild(g);
  return { g, ring, body, label, sole };
}

function updateFoot(f, x, y, rot, weighted, lift, flash, onBall) {
  const s = FOOT * (1 + lift * 0.1);
  f.g.setAttribute('transform', `translate(${x.toFixed(3)} ${y.toFixed(3)}) rotate(${rot}) scale(${s.toFixed(3)})`);
  f.label.setAttribute('transform', `rotate(${(-rot).toFixed(1)} 0 0.08)`); // the letter stays upright
  if (onBall) f.sole.setAttribute('clip-path', 'url(#foot-front)');
  else f.sole.removeAttribute('clip-path');
  f.g.classList.toggle('is-on-ball', onBall);
  f.g.classList.toggle('is-weighted', weighted);
  f.g.classList.toggle('is-lifted', lift > 0.05);
  f.ring.style.opacity = flash.toFixed(3);
  f.ring.setAttribute('r', (0.55 + (1 - flash) * 0.25).toFixed(3));
}
