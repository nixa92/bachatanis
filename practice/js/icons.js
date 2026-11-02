// Line drawings of the instruments for the mixer tiles (64×64, currentColor).
const svg = (body) =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // two drums joined in the middle: small macho, larger hembra
  bongo: svg(`
    <ellipse cx="18" cy="24" rx="11" ry="4"/>
    <path d="M7 24 L10.5 49 Q18 53 25.5 49 L29 24"/>
    <ellipse cx="44" cy="21" rx="14" ry="5"/>
    <path d="M30 21 L34 49 Q44 54 54 49 L58 21"/>
    <path d="M27.5 33 h4 M27.8 39 h3.6"/>
    <path d="M12 31 l1.2 14 M24 31 l-1.2 14 M37 29 l1.5 17 M51 29 l-1.5 17" stroke-width="1.4" opacity=".55"/>`),

  // metal cylinder with a handle and the scraper
  guira: svg(`
    <rect x="8" y="22" width="36" height="22" rx="11"/>
    <path d="M16 22 Q26 10 36 22"/>
    <g fill="currentColor" stroke="none">
      <circle cx="17" cy="29" r="1.3"/><circle cx="23" cy="29" r="1.3"/><circle cx="29" cy="29" r="1.3"/><circle cx="35" cy="29" r="1.3"/>
      <circle cx="20" cy="34" r="1.3"/><circle cx="26" cy="34" r="1.3"/><circle cx="32" cy="34" r="1.3"/>
      <circle cx="17" cy="39" r="1.3"/><circle cx="23" cy="39" r="1.3"/><circle cx="29" cy="39" r="1.3"/><circle cx="35" cy="39" r="1.3"/>
    </g>
    <path d="M50 54 L58 26"/>
    <path d="M46 52 l4 2 M47.5 47 l4 2 M49 42 l4 2" stroke-width="1.6"/>`),

  // electric bass: small body, long neck, 4 tuners
  bas: svg(`
    <path d="M14 58 C6 56 6 46 12 43 C15 41 15 37 19 36 C23 35 25 39 28 39 C31 39 34 43 32 48 C30 53 24 59 14 58 Z"/>
    <path d="M24 42 L50 10"/>
    <path d="M28 40 L53 12"/>
    <path d="M49 9 L56 4 L60 8 L54 14 Z"/>
    <path d="M20 49 h7" stroke-width="1.6"/>`),

  // acoustic guitar
  gitara: svg(`
    <path d="M18 60 C8 60 5 52 9 46 C12 42 10 37 14 33 C18 29 23 31 26 34 C29 37 34 36 37 40 C41 45 35 52 30 56 C26 59 22 60 18 60 Z"/>
    <circle cx="21" cy="46" r="4"/>
    <path d="M25 43 L50 14"/>
    <path d="M48 12 L54 6 L58 10 L52 16 Z"/>
    <path d="M15 53 l8 -3" stroke-width="1.6"/>`),

  // small lead guitar + a melody note
  requinto: svg(`
    <path d="M14 58 C6 58 4 52 7 47 C9 44 8 40 11 37 C14 34 18 36 20 38 C22 40 26 40 28 43 C31 47 26 52 23 55 C20 57 17 58 14 58 Z"/>
    <circle cx="16" cy="47" r="3"/>
    <path d="M19 45 L38 24"/>
    <path d="M37 22 L41 18 L44 21 L40 25 Z"/>
    <path d="M50 30 V12 l8 -3 v16" stroke-width="2"/>
    <ellipse cx="47.5" cy="30.5" rx="3" ry="2.4" fill="currentColor" stroke="none"/>
    <ellipse cx="55.5" cy="25.5" rx="3" ry="2.4" fill="currentColor" stroke="none"/>`),

  // speech bubble with the count
  glas: svg(`
    <path d="M8 12 h48 a4 4 0 0 1 4 4 v24 a4 4 0 0 1 -4 4 H26 l-12 10 v-10 H8 a4 4 0 0 1 -4 -4 V16 a4 4 0 0 1 4 -4 Z"/>
    <text x="32" y="34" text-anchor="middle" font-size="15" font-weight="800" fill="currentColor" stroke="none" font-family="Sequel, system-ui, sans-serif">1 2 3</text>`),

  // microphone
  vokal: svg(`
    <rect x="23" y="6" width="18" height="30" rx="9"/>
    <path d="M15 28 a17 17 0 0 0 34 0"/>
    <path d="M32 45 V56 M22 58 h20"/>
    <path d="M23 18 h6 M23 24 h6" stroke-width="1.6"/>`),

  // kick drum, seen from the front, with the pedal
  kik: svg(`
    <circle cx="32" cy="30" r="20"/>
    <circle cx="32" cy="30" r="13" stroke-width="1.6" opacity=".55"/>
    <path d="M18 50 L12 58 M46 50 L52 58"/>
    <path d="M32 50 V58 M27 58 h10"/>`),

  // keyboard
  sint: svg(`
    <rect x="4" y="20" width="56" height="26" rx="3"/>
    <path d="M12 20 V46 M20 20 V46 M28 20 V46 M36 20 V46 M44 20 V46 M52 20 V46" stroke-width="1.4"/>
    <g fill="currentColor" stroke="none">
      <rect x="9.5" y="20" width="5" height="15"/><rect x="17.5" y="20" width="5" height="15"/>
      <rect x="33.5" y="20" width="5" height="15"/><rect x="41.5" y="20" width="5" height="15"/><rect x="49.5" y="20" width="5" height="15"/>
    </g>`),

  // metronome
  klik: svg(`
    <path d="M24 6 h16 l12 52 H12 Z"/>
    <path d="M14 48 h36"/>
    <path d="M32 44 L44 14"/>
    <circle cx="40.5" cy="23" r="2.6" fill="currentColor" stroke="none"/>`),
};
