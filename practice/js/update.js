// New versions for phones that keep the app open for days.
// tools/publish.py stamps a version on the scripts (?v=… in their address) and writes it to version.json.
// The app reads version.json when it comes back to the screen and every 10 minutes. When a new version is out:
// if nothing plays, the page reloads at once (the player only sees the app open again);
// otherwise a bar offers to reload. During a game nothing shows; the bar waits for the game to end.
import { t } from './i18n.js?v=20261109214108';

const MINE = new URL(import.meta.url).searchParams.get('v'); // null when run locally (not published)
const EVERY_MS = 10 * 60 * 1000;
const TRIED_KEY = 'vezbaj.osvezeno'; // the version a reload was tried for, so a stale copy never reloads in a loop

let latest = null;
let bar = null;

async function check() {
  if (!MINE || document.hidden) return;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (version && version > MINE) latest = version;
  } catch (e) { /* offline: try next time */ }
}

// busy(): music plays; inGame(): a level runs
export function watchUpdates({ busy, inGame }) {
  if (!MINE) return;
  const act = (returning) => {
    if (!latest || inGame()) return;
    let tried = null;
    try { tried = sessionStorage.getItem(TRIED_KEY); } catch (e) { /* private mode */ }
    if (returning && !busy() && tried !== latest) {
      try { sessionStorage.setItem(TRIED_KEY, latest); } catch (e) { /* private mode */ }
      location.reload();
      return;
    }
    showBar();
  };
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    await check();
    act(true);
  });
  setInterval(async () => { await check(); act(false); }, EVERY_MS);
  // after a game, the bar that waited for it
  new MutationObserver(() => act(false)).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function showBar() {
  if (bar) return;
  bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<span></span><button type="button"></button>`;
  bar.querySelector('span').textContent = t('update.text');
  const btn = bar.querySelector('button');
  btn.textContent = t('update.reload');
  btn.addEventListener('click', () => location.reload());
  document.body.appendChild(bar);
}
