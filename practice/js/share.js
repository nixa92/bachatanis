// A result picture for an Instagram story (1080 x 1920), drawn on a canvas, shared with the phone's
// share sheet (Instagram, Viber, WhatsApp…). Where the browser cannot share files, the picture is downloaded.
// Instagram covers about 250 px at the top and the bottom of a story, so the text stays inside that.

const W = 1080, H = 1920;
const RED = '#A5071C', RED_DARK = '#7C0514', CREAM = '#EFE9E0', PAPER = '#F7F3EC';
export const APP_URL = 'https://bachatanis.rs/practice/';

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('800 100px Sequel'),
      document.fonts.load('600 100px Sequel'),
      document.fonts.load('100px Northwell'),
      document.fonts.load('600 40px Montserrat'),
    ]);
  } catch (e) { /* the fallback fonts are fine */ }
}

// shrinks the font until the text fits in maxW
function fit(ctx, text, font, size, maxW) {
  let s = size;
  ctx.font = font(s);
  while (s > 20 && ctx.measureText(text).width > maxW) { s -= 4; ctx.font = font(s); }
  return s;
}

function spaced(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; }

// d: { name, game, mode, total, unit, levelText, rank, challenge, url }  (all texts already translated)
export async function drawCard(d) {
  await fontsReady();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // background: red, with a soft lighter glow behind the score
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 880, 40, W / 2, 880, 900);
  glow.addColorStop(0, 'rgba(255,255,255,0.10)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // the logo: BACHATA with Anita i Nikola written over it
  ctx.fillStyle = PAPER;
  spaced(ctx, 4);
  ctx.font = '800 118px Sequel, system-ui, sans-serif';
  ctx.fillText('BACHATA', W / 2, 350);
  spaced(ctx, 0);
  ctx.font = '96px Northwell, Sacramento, cursive';
  ctx.fillText('Anita i Nikola', W / 2 + 10, 428);

  // the game
  ctx.fillStyle = CREAM;
  spaced(ctx, 8);
  ctx.font = '600 34px Montserrat, system-ui, sans-serif';
  ctx.fillText(d.game.toUpperCase(), W / 2, 580);
  spaced(ctx, 0);
  const modeSize = fit(ctx, d.mode, (s) => `800 ${s}px Sequel, system-ui, sans-serif`, 76, W - 160);
  ctx.font = `800 ${modeSize}px Sequel, system-ui, sans-serif`;
  ctx.fillStyle = PAPER;
  ctx.fillText(d.mode, W / 2, 670);

  // the score
  const score = String(d.total);
  const scoreSize = fit(ctx, score, (s) => `800 ${s}px Sequel, system-ui, sans-serif`, 330, W - 140);
  ctx.font = `800 ${scoreSize}px Sequel, system-ui, sans-serif`;
  ctx.fillText(score, W / 2, 990);
  ctx.font = '600 52px Sequel, system-ui, sans-serif';
  ctx.fillStyle = CREAM;
  ctx.fillText(d.unit, W / 2, 1070);

  // level and place, in two pills
  const pills = [d.levelText, d.rank].filter(Boolean);
  ctx.font = '600 36px Montserrat, system-ui, sans-serif';
  const padX = 34, pillH = 78, gap = 20;
  const widths = pills.map((p) => ctx.measureText(p).width + padX * 2);
  let x = (W - widths.reduce((a, b) => a + b, 0) - gap * (pills.length - 1)) / 2;
  const pillY = 1130;
  pills.forEach((p, i) => {
    ctx.beginPath();
    ctx.roundRect(x, pillY, widths[i], pillH, pillH / 2);
    ctx.fillStyle = RED_DARK;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(247,243,236,0.35)';
    ctx.stroke();
    ctx.fillStyle = PAPER;
    ctx.fillText(p, x + widths[i] / 2, pillY + 52);
    x += widths[i] + gap;
  });

  // the player's name
  if (d.name) {
    const nameSize = fit(ctx, d.name, (s) => `600 ${s}px Montserrat, system-ui, sans-serif`, 44, W - 200);
    ctx.font = `600 ${nameSize}px Montserrat, system-ui, sans-serif`;
    ctx.fillStyle = CREAM;
    ctx.fillText(d.name, W / 2, 1290);
  }

  // the count 1–8, with the taps (4 and 8) marked
  const dotY = 1380, step = 92;
  ctx.font = '800 34px Sequel, system-ui, sans-serif';
  for (let i = 0; i < 8; i++) {
    const cx = W / 2 + (i - 3.5) * step + (i < 4 ? -14 : 14);
    const tap = i === 3 || i === 7;
    ctx.beginPath();
    ctx.arc(cx, dotY, tap ? 32 : 26, 0, Math.PI * 2);
    ctx.fillStyle = tap ? PAPER : 'rgba(247,243,236,0.16)';
    ctx.fill();
    ctx.fillStyle = tap ? RED : PAPER;
    ctx.fillText(String(i + 1), cx, dotY + 12);
  }

  // the challenge and where to play
  ctx.fillStyle = PAPER;
  const chSize = fit(ctx, d.challenge, (s) => `${s}px Northwell, Sacramento, cursive`, 130, W - 160);
  ctx.font = `${chSize}px Northwell, Sacramento, cursive`;
  ctx.fillText(d.challenge, W / 2, 1540);
  ctx.fillStyle = CREAM;
  spaced(ctx, 2);
  ctx.font = '600 32px Montserrat, system-ui, sans-serif';
  ctx.fillText(d.url, W / 2, 1665);
  spaced(ctx, 0);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
}

// shares the picture; returns 'shared', 'cancelled' or 'downloaded'
export async function shareCard(blob, { text, fileName = 'rezultat.png' } = {}) {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      // NotAllowedError: the tap was too long ago (the picture was still being drawn); download it instead
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
