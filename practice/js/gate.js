// Club gate: the app opens only after the player types the club code (shared in the club's Viber group).
// The code changes about once a month; a phone that knows the current code is let in at once.
// This only stops casual visitors (the site is static); real accounts may come later.
import { CODE_HASH } from './access.js?v=20261110225925';
import { applyStatic, t } from './i18n.js?v=20261110225925';

const KEY = 'vezbaj.pristup';
const $ = (id) => document.getElementById(id);

async function hashOf(code) {
  const data = new TextEncoder().encode(`bachatanis:${code.trim().toLowerCase()}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function known() {
  try { return localStorage.getItem(KEY) === CODE_HASH; } catch (e) { return false; }
}

// resolves when the app may start
export function unlocked() {
  if (!CODE_HASH || known()) {
    document.body.classList.remove('is-locked');
    return Promise.resolve();
  }
  applyStatic($('gate'));
  $('gate').hidden = false;
  return new Promise((resolve) => {
    $('gate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = $('gate-code').value;
      if (code.trim() && await hashOf(code) === CODE_HASH) {
        try { localStorage.setItem(KEY, CODE_HASH); } catch (err) { /* private mode: asked again next time */ }
        $('gate').hidden = true;
        document.body.classList.remove('is-locked');
        resolve();
      } else {
        $('gate-error').textContent = t('gate.wrong');
        $('gate-code').select();
      }
    });
  });
}
