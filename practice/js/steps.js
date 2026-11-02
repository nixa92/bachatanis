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
//  Sve se piše iz ugla VOĐE. Pratilja se računa sama (ogledalo: leva <-> desna,
//  napred <-> nazad), ne treba je pisati.
//
//  Koordinate (gledano odozgo, vođa gleda nagore):
//    x — levo je minus, desno je plus
//    y — napred je plus, nazad je minus
//    1 = otprilike dužina jednog stopala (~25 cm)
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
      { noga: 'L', x: -1.3, y: 0 },             // 1 leva u stranu
      { noga: 'D', x: -0.7, y: 0 },             // 2 desna prilazi levoj
      { noga: 'L', x: -2.3, y: 0 },             // 3 leva u stranu
      { noga: 'D', x: -1.7, y: 0, tap: true },  // 4 tap desnom
      { noga: 'D', x: -0.7, y: 0 },             // 5 desna u stranu
      { noga: 'L', x: -1.3, y: 0 },             // 6 leva prilazi desnoj
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
      { noga: 'L', x: -0.3, y: 1 },             // 1 leva napred
      { noga: 'D', x: 0.3, y: 1 },              // 2 desna prilazi levoj
      { noga: 'L', x: -0.3, y: 2 },             // 3 leva napred
      { noga: 'D', x: 0.3, y: 2, tap: true },   // 4 tap desnom
      { noga: 'D', x: 0.3, y: 1 },              // 5 desna nazad
      { noga: 'L', x: -0.3, y: 1 },             // 6 leva prilazi desnoj
      { noga: 'D', x: 0.3, y: 0 },              // 7 desna nazad
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 8 tap levom
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
    id: 'kocka',
    naziv: 'Box',
    naziv_en: 'Box',
    opis: 'U stranu, prilaz, napred i tap, pa u stranu, prilaz, nazad i tap.',
    opis_en: 'Side, close, forward and tap, then side, close, back and tap.',
    brojevi: [
      { noga: 'L', x: -1.3, y: 0 },             // 1 leva u stranu
      { noga: 'D', x: -0.7, y: 0 },             // 2 desna prilazi
      { noga: 'L', x: -1.3, y: 0.9 },           // 3 leva napred
      { noga: 'D', x: -0.7, y: 0.9, tap: true },// 4 tap desnom
      { noga: 'D', x: 0.3, y: 0.9 },            // 5 desna u stranu
      { noga: 'L', x: -0.3, y: 0.9 },           // 6 leva prilazi
      { noga: 'D', x: 0.3, y: 0 },              // 7 desna nazad
      { noga: 'L', x: -0.3, y: 0, tap: true },  // 8 tap levom
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
      { noga: 'L', x: -1.0, y: 0, ugao: -120 },  // 1 leva ulevo, trećina okreta
      { noga: 'D', x: -1.65, y: 0, ugao: -240 }, // 2 desna prolazi levu, dve trećine
      { noga: 'L', x: -2.3, y: 0, ugao: -360 },  // 3 leva prolazi desnu, ravno napred
      { noga: 'D', x: -1.7, y: 0, tap: true },   // 4 tap desnom
      { noga: 'D', x: -0.7, y: 0 },              // 5 desna u stranu
      { noga: 'L', x: -1.3, y: 0 },              // 6 leva prilazi desnoj
      { noga: 'D', x: 0.3, y: 0 },               // 7 desna u stranu
      { noga: 'L', x: -0.3, y: 0, tap: true },   // 8 tap levom
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
      { noga: 'L', x: -1.3, y: 0 },              // 1 leva u stranu
      { noga: 'D', x: -0.7, y: 0 },              // 2 desna prilazi levoj
      { noga: 'L', x: -2.3, y: 0 },              // 3 leva u stranu
      { noga: 'D', x: -1.7, y: 0, tap: true },   // 4 tap desnom
      { noga: 'D', x: -1.0, y: 0, ugao: 120 },   // 5 desna udesno, trećina okreta
      { noga: 'L', x: -0.35, y: 0, ugao: 240 },  // 6 leva prolazi desnu, dve trećine
      { noga: 'D', x: 0.3, y: 0, ugao: 360 },    // 7 desna prolazi levu, ravno napred
      { noga: 'L', x: -0.3, y: 0, tap: true },   // 8 tap levom
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
