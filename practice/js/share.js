// A result picture for an Instagram story (1080 x 1920), drawn on a canvas, shared with the phone's
// share sheet (Instagram, Viber, WhatsApp…). Where the browser cannot share files, the picture is downloaded.
// Instagram covers about 250 px at the top and the bottom of a story, so the text stays inside that.

const W = 1080, H = 1920;
const RED = '#A5071C', PAPER = '#F7F3EC';
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

// d: { mode, total, unit, levelText, rank, challenge, url }  (all texts already translated)
export async function drawCard(d) {
  await fontsReady();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // a plain red background; few things, with room around them
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, H);
  const SOFT = 'rgba(247,243,236,0.72)';

  // the logo: BACHATA with Anita i Nikola written over it
  ctx.fillStyle = PAPER;
  spaced(ctx, 3);
  ctx.font = '800 84px Sequel, system-ui, sans-serif';
  ctx.fillText('BACHATA', W / 2, 340);
  spaced(ctx, 0);
  ctx.font = '70px Northwell, Sacramento, cursive';
  ctx.fillText('Anita i Nikola', W / 2 + 8, 396);

  // the game
  const modeSize = fit(ctx, d.mode, (s) => `600 ${s}px Sequel, system-ui, sans-serif`, 60, W - 200);
  ctx.font = `600 ${modeSize}px Sequel, system-ui, sans-serif`;
  ctx.fillStyle = SOFT;
  ctx.fillText(d.mode, W / 2, 700);

  // the score
  const score = String(d.total);
  const scoreSize = fit(ctx, score, (s) => `800 ${s}px Sequel, system-ui, sans-serif`, 360, W - 160);
  ctx.font = `800 ${scoreSize}px Sequel, system-ui, sans-serif`;
  ctx.fillStyle = PAPER;
  ctx.fillText(score, W / 2, 1050);
  ctx.font = '600 48px Sequel, system-ui, sans-serif';
  ctx.fillText(d.unit, W / 2, 1130);

  // level and place, one quiet line
  const info = [d.levelText, d.rank].filter(Boolean).join('  ·  ');
  const infoSize = fit(ctx, info, (s) => `500 ${s}px Montserrat, system-ui, sans-serif`, 36, W - 160);
  ctx.font = `500 ${infoSize}px Montserrat, system-ui, sans-serif`;
  ctx.fillStyle = SOFT;
  ctx.fillText(info, W / 2, 1220);

  // the challenge and where to play
  ctx.fillStyle = PAPER;
  const chSize = fit(ctx, d.challenge, (s) => `${s}px Northwell, Sacramento, cursive`, 124, W - 200);
  ctx.font = `${chSize}px Northwell, Sacramento, cursive`;
  ctx.fillText(d.challenge, W / 2, 1500);
  ctx.fillStyle = SOFT;
  spaced(ctx, 2);
  ctx.font = '500 30px Montserrat, system-ui, sans-serif';
  ctx.fillText(d.url, W / 2, 1620);
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
