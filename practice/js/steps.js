// =====================================================================
//  KORACI — ovde se dodaju novi koraci
// =====================================================================
//
//  Svaki korak ima:
//    id     — kratko ime bez razmaka (npr. 'osnovni')
//    naziv  — ime koje se prikazuje na dugmetu (naziv_en — isto na engleskom)
//    opis   — jedna rečenica ispod animacije (opis_en — isto na engleskom)
//    brojevi — TAČNO 8 redova, za brojeve 1..8. Svaki red je:
//
//      { noga: 'L', x: -1.3, y: 0 }            leva noga staje na tačku (x, y), prenosi težinu
//      { noga: 'D', x:  0.3, y: 0, tap: true } desna noga dodiruje tačku BEZ težine (tap)
//
//  Okret: dodaj ugao: u koji pravac je telo okrenuto posle tog broja, u stepenima.
//    0 = napred, -90 = ulevo, 90 = udesno. Minus je okret ulevo, plus udesno.
//    { noga: 'L', x: -1.1, y: 0, ugao: -90 }  noga se okreće samo dok je u vazduhu; noga na kojoj se stoji miruje.
//    Red bez ugla zadržava prethodni pravac. Okret ima tri prenosa težine; na trećem napiši ugao -360 ili 360, a tap posle njega je bez ugla.
//
//  Iza (cross back): dodaj iza: true kad noga staje iza druge. Tada je i kod pratilje iza
//    (inače se pratilja računa kao ogledalo napred <-> nazad).
//    { noga: 'D', x: -0.85, y: -0.35, iza: true }
//
//  Ogledalo: dodaj ogledalo: true na ceo korak kad pratilja ide napred kad i vođa (npr. Face to face).
//    Tada je pratilja samo ogledalo levo <-> desno. razmak: 2.8 razmiče partnere u prikazu Oboje.
//
//  Vučenje (slide): dodaj vuci: true kad noga klizi po podu do te tačke, bez podizanja.
//    { noga: 'L', x: -0.8, y: 0, tap: true, vuci: true }
//
//  Sve se piše iz ugla VOĐE. Pratilja se računa sama (ogledalo: leva <-> desna,
//  napred <-> nazad), ne treba je pisati.
//
//  Koordinate (gledano odozgo, vođa gleda nagore):
//    x — levo je minus, desno je plus
//    y — napred je plus, nazad je minus
//    1 = otprilike dužina jednog stopala (~25 cm)
//    Korak u stranu je 0.7 (mali koraci, kao na času).
//  Početni stav: leva noga na x: -0.3, desna na x: 0.3, obe na y: 0.
//
//  Važno: posle broja 8 noge moraju da budu tamo gde su bile pre broja 1,
//  inače animacija "skoči" kad se fraza ponovi.
//
//  Primer novog koraka: kopiraj jedan blok { ... }, promeni id, naziv i brojeve,
//  i ostavi zarez između blokova.
// =====================================================================

export const KORACI = [
  {
    id: 'osnovni',
    naziv: 'Osnovni',
    naziv_en: 'Basic',
    opis: 'Dva koraka ulevo pa tap, dva koraka udesno pa tap.',
    opis_en: 'Two steps to the left and tap, two steps to the right and tap.',
    brojevi: [
      { noga: 'L', x: -1.0, y: 0 },             // 1 leva u stranu
      { noga: 'D', x: -0.4, y: 0 },             // 2 desna prilazi levoj
      { noga: 'L', x: -1.7, y: 0 },             // 3 leva u stranu
      { noga: 'D', x: -1.1, y: 0, tap: true },  // 4 tap desnom
      { noga: 'D', x: -0.4, y: 0 },             // 5 desna u stranu
      { noga: 'L', x: -1.0, y: 0 },             // 6 leva prilazi desnoj
      { noga: 'D', x: 0.3, y: 0 },              // 7 desna u stranu
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 8 tap levom
    ],
  },
  {
    id: 'napred-nazad',
    naziv: 'Napred',
    naziv_en: 'Forward',
    opis: 'Kao osnovni, samo napred i nazad: dva koraka napred pa tap, dva koraka nazad pa tap.',
    opis_en: 'Like the basic, but forward and back: two steps forward and tap, two steps back and tap.',
    brojevi: [
      { noga: 'L', x: -0.3, y: 0.7 },           // 1 leva napred
      { noga: 'D', x: 0.3, y: 0.7 },            // 2 desna prilazi levoj
      { noga: 'L', x: -0.3, y: 1.4 },           // 3 leva napred
      { noga: 'D', x: 0.3, y: 1.4, tap: true }, // 4 tap desnom
      { noga: 'D', x: 0.3, y: 0.7 },            // 5 desna nazad
      { noga: 'L', x: -0.3, y: 0.7 },           // 6 leva prilazi desnoj
      { noga: 'D', x: 0.3, y: 0 },              // 7 desna nazad
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 8 tap levom
    ],
  },
  {
    id: 'face-to-face',
    naziv: 'Face to face',
    naziv_en: 'Face to face',
    opis: 'Korak napred, druga noga prilazi, nazad na početak i tap, pa isto drugom nogom. Vođa i pratilja idu napred zajedno, kao u ogledalu.',
    opis_en: 'Step forward, the other foot closes, back to the start and tap, then the same with the other foot. Leader and follower go forward together, like a mirror.',
    ogledalo: true, // pratilja je ogledalo levo <-> desno, ali ide napred kad i vođa
    razmak: 2.8,    // u prikazu Oboje idu jedno ka drugom, pa stoje dalje
    brojevi: [
      { noga: 'L', x: -0.3, y: 0.7 },            // 1 leva napred
      { noga: 'D', x: 0.3, y: 0.7 },             // 2 desna prilazi levoj
      { noga: 'L', x: -0.3, y: 0 },              // 3 leva nazad, na početak
      { noga: 'D', x: 0.3, y: 0, tap: true },    // 4 tap desnom pored leve
      { noga: 'D', x: 0.3, y: 0.7 },             // 5 desna napred
      { noga: 'L', x: -0.3, y: 0.7 },            // 6 leva prilazi desnoj
      { noga: 'D', x: 0.3, y: 0 },               // 7 desna nazad, na početak
      { noga: 'L', x: -0.3, y: 0, tap: true },   // 8 tap levom pored desne
    ],
  },
  {
    id: 'u-mestu',
    naziv: 'U mestu',
    naziv_en: 'In place',
    opis: 'Prenos težine u mestu: leva, desna, leva, tap, pa obrnuto.',
    opis_en: 'Weight changes in place: left, right, left, tap, then the other way.',
    brojevi: [
      { noga: 'L', x: -0.3, y: 0 },
      { noga: 'D', x: 0.3, y: 0 },
      { noga: 'L', x: -0.3, y: 0 },
      { noga: 'D', x: 0.3, y: 0, tap: true },
      { noga: 'D', x: 0.3, y: 0 },
      { noga: 'L', x: -0.3, y: 0 },
      { noga: 'D', x: 0.3, y: 0 },
      { noga: 'L', x: -0.3, y: 0, tap: true },
    ],
  },
  {
    id: 'side-step',
    naziv: 'Side step',
    naziv_en: 'Side step',
    opis: 'Leva u stranu, desna u mestu, leva do noge i tap desnom, pa isto na drugu stranu.',
    opis_en: 'Left foot to the side, right foot in place, left foot back next to it and tap right, then the same to the other side.',
    brojevi: [
      { noga: 'L', x: -1.0, y: 0 },             // 1 leva u stranu
      { noga: 'D', x: 0.3, y: 0 },              // 2 desna u mestu
      { noga: 'L', x: -0.3, y: 0 },             // 3 leva do noge
      { noga: 'D', x: 0.3, y: 0, tap: true },   // 4 tap desnom
      { noga: 'D', x: 1.0, y: 0 },              // 5 desna u stranu
      { noga: 'L', x: -0.3, y: 0 },             // 6 leva u mestu
      { noga: 'D', x: 0.3, y: 0 },              // 7 desna do noge
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 8 tap levom
    ],
  },
  {
    id: 'kocka',
    naziv: 'Box',
    naziv_en: 'Box',
    opis: 'U stranu, prilaz, napred i tap, pa u stranu, prilaz, nazad i tap.',
    opis_en: 'Side, close, forward and tap, then side, close, back and tap.',
    brojevi: [
      { noga: 'L', x: -1.0, y: 0 },             // 1 leva u stranu
      { noga: 'D', x: -0.4, y: 0 },             // 2 desna prilazi
      { noga: 'L', x: -1.0, y: 0.7 },           // 3 leva napred
      { noga: 'D', x: -0.4, y: 0.7, tap: true },// 4 tap desnom
      { noga: 'D', x: 0.3, y: 0.7 },            // 5 desna u stranu
      { noga: 'L', x: -0.3, y: 0.7 },           // 6 leva prilazi
      { noga: 'D', x: 0.3, y: 0 },              // 7 desna nazad
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 8 tap levom
    ],
  },
  {
    id: 'korak-tap',
    naziv: 'Korak tap',
    naziv_en: 'Step tap',
    opis: 'Korak levom ulevo i tap desnom pored, pa korak desnom udesno i tap levom pored. Traje 4 broja.',
    opis_en: 'Step left and tap the right foot next to it, then step right and tap the left foot next to it. It takes 4 counts.',
    // korak traje 4 broja, pa se u frazi od 8 ponavlja dva puta
    brojevi: [
      { noga: 'L', x: -1.0, y: 0 },             // 1 leva u stranu
      { noga: 'D', x: -0.4, y: 0, tap: true },  // 2 tap desnom pored leve
      { noga: 'D', x: 0.3, y: 0 },              // 3 desna u stranu
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 4 tap levom pored desne
      { noga: 'L', x: -1.0, y: 0 },             // 5 leva u stranu
      { noga: 'D', x: -0.4, y: 0, tap: true },  // 6 tap desnom pored leve
      { noga: 'D', x: 0.3, y: 0 },              // 7 desna u stranu
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 8 tap levom pored desne
    ],
  },
  {
    id: 'dupli-tap',
    naziv: 'Dupli tap',
    naziv_en: 'Double tap',
    opis: 'Tap levom u stranu, tap levom do noge, korak levom i tap desnom, pa isto na drugu stranu.',
    opis_en: 'Tap the left foot out to the side, tap it next to the right foot, step left and tap right, then the same to the other side.',
    brojevi: [
      { noga: 'L', x: -1.0, y: 0, tap: true },  // 1 tap levom u stranu, na širini koraka
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 2 tap levom do desne noge
      { noga: 'L', x: -1.0, y: 0 },             // 3 leva u stranu
      { noga: 'D', x: -0.4, y: 0, tap: true },  // 4 tap desnom
      { noga: 'D', x: 0.3, y: 0, tap: true },   // 5 tap desnom u stranu
      { noga: 'D', x: -0.4, y: 0, tap: true },  // 6 tap desnom do leve noge
      { noga: 'D', x: 0.3, y: 0 },              // 7 desna u stranu
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 8 tap levom
    ],
  },
  {
    id: 'cross-back',
    naziv: 'Cross back',
    naziv_en: 'Cross back',
    opis: 'Kao osnovni, samo na 2 desna staje iza leve, a na 6 leva iza desne.',
    opis_en: 'Like the basic, but on 2 the right foot steps behind the left, and on 6 the left behind the right.',
    // manji prvi korak (1 i 5), da ukrštena noga stane iza bez preklapanja (stopala su 0.4 razmaknuta)
    brojevi: [
      { noga: 'L', x: -0.85, y: 0 },                    // 1 leva u stranu, manji korak
      { noga: 'D', x: -1.25, y: -0.45, iza: true },     // 2 desna iza leve, ukršteno
      { noga: 'L', x: -1.65, y: 0 },                    // 3 leva u stranu
      { noga: 'D', x: -1.05, y: 0, tap: true },         // 4 tap desnom
      { noga: 'D', x: -0.5, y: 0 },                     // 5 desna u stranu, manji korak
      { noga: 'L', x: -0.1, y: -0.45, iza: true },      // 6 leva iza desne, ukršteno
      { noga: 'D', x: 0.3, y: 0 },                      // 7 desna u stranu
      { noga: 'L', x: -0.3, y: 0, tap: true },          // 8 tap levom
    ],
  },
  {
    id: 'slide',
    naziv: 'Slide',
    naziv_en: 'Slide',
    opis: 'Osnovni ulevo, pa na 5 jedan veliki korak desnom udesno, a leva se do 8 vuče po podu do desne.',
    opis_en: 'The basic to the left, then on 5 one big step to the right, and the left foot slides along the floor to the right foot by 8.',
    brojevi: [
      { noga: 'L', x: -1.0, y: 0 },                        // 1 leva u stranu
      { noga: 'D', x: -0.4, y: 0 },                        // 2 desna prilazi levoj
      { noga: 'L', x: -1.7, y: 0 },                        // 3 leva u stranu
      { noga: 'D', x: -1.1, y: 0, tap: true },             // 4 tap desnom
      { noga: 'D', x: 0.3, y: 0 },                         // 5 veliki korak desnom, odmah tamo gde bi bila na 7
      { noga: 'L', x: -1.05, y: 0, tap: true, vuci: true },// 6 leva klizi po podu
      { noga: 'L', x: -0.65, y: 0, tap: true, vuci: true },// 7 leva klizi dalje
      { noga: 'L', x: -0.3, y: 0, tap: true, vuci: true }, // 8 leva stiže do desne, kao tap
    ],
  },
  {
    id: 'okret-1',
    naziv: 'Okret na 1',
    naziv_en: 'Turn on 1',
    vodjaOboje: 'osnovni', // u prikazu Oboje vođa radi osnovni, okreće se samo pratilja
    opis: 'Pun okret ulevo na brojeve 1, 2 i 3, tap na 4, pa osnovni udesno.',
    opis_en: 'A full turn to the left on counts 1, 2 and 3, a tap on 4, then the basic to the right.',
    // završava na istim mestima kao osnovni, da u prikazu Oboje partneri ostanu jedan naspram drugog
    brojevi: [
      // mali koraci, kao u osnovnom: jasnije je gde se staje, a okrenuta stopala se mogu malo preklopiti
      { noga: 'L', x: -0.75, y: 0, ugao: -120 },  // 1 leva ulevo, trećina okreta
      { noga: 'D', x: -1.25, y: 0, ugao: -240 },  // 2 desna prolazi levu, dve trećine
      { noga: 'L', x: -1.7, y: 0, ugao: -360 },   // 3 leva prolazi desnu, ravno napred
      { noga: 'D', x: -1.1, y: 0, tap: true },    // 4 tap desnom
      { noga: 'D', x: -0.4, y: 0 },               // 5 desna u stranu
      { noga: 'L', x: -1.0, y: 0 },               // 6 leva prilazi desnoj
      { noga: 'D', x: 0.3, y: 0 },                // 7 desna u stranu
      { noga: 'L', x: -0.3, y: 0, tap: true },    // 8 tap levom
    ],
  },
  {
    id: 'okret-5',
    naziv: 'Okret na 5',
    naziv_en: 'Turn on 5',
    vodjaOboje: 'osnovni',
    opis: 'Osnovni ulevo, pa pun okret udesno na brojeve 5, 6 i 7, tap na 8.',
    opis_en: 'The basic to the left, then a full turn to the right on counts 5, 6 and 7, a tap on 8.',
    brojevi: [
      { noga: 'L', x: -1.0, y: 0 },               // 1 leva u stranu
      { noga: 'D', x: -0.4, y: 0 },               // 2 desna prilazi levoj
      { noga: 'L', x: -1.7, y: 0 },               // 3 leva u stranu
      { noga: 'D', x: -1.1, y: 0, tap: true },    // 4 tap desnom
      { noga: 'D', x: -0.65, y: 0, ugao: 120 },   // 5 desna udesno, trećina okreta
      { noga: 'L', x: -0.15, y: 0, ugao: 240 },   // 6 leva prolazi desnu, dve trećine
      { noga: 'D', x: 0.3, y: 0, ugao: 360 },     // 7 desna prolazi levu, ravno napred
      { noga: 'L', x: -0.3, y: 0, tap: true },    // 8 tap levom
    ],
  },
];

// "S noge na nogu": u intro delovima pesme, dok ne krene bachata, težina prelazi s noge na nogu u mestu,
// duplo sporije (na 1, 3, 5 i 7), kao energija bolera. null = na tom broju noge miruju.
// Na kraju je težina na desnoj, a leva je slobodna, kao pre broja 1 svakog koraka.
export const NOGA_NA_NOGU = {
  id: 'noga-na-nogu',
  naziv: 'S noge na nogu',
  naziv_en: 'Weight shifts',
  brojevi: [
    { noga: 'L', x: -0.3, y: 0 }, null,
    { noga: 'D', x: 0.3, y: 0 }, null,
    { noga: 'L', x: -0.3, y: 0 }, null,
    { noga: 'D', x: 0.3, y: 0 }, null,
  ],
};
