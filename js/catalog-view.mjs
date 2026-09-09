// js/catalog-view.mjs - filtrage / tri / groupement du catalogue. Pur, sans DOM.

// Ordres d'affichage des facettes (menus déroulants + barres de stats).
export const COLOR_ORDER = ['r', 'b', 'v', 'g'];
export const WEAPON_ORDER = ['sword', 'lance', 'axe', 'tome', 'bow', 'dagger', 'staff', 'breath', 'beast'];
export const MOVE_ORDER = ['infantry', 'cavalry', 'flying', 'armored'];
export const CATEGORY_ORDER = [
  'standard', 'special',
  'legendary', 'mythic', 'duo', 'harmonized', 'ascended', 'rearmed', 'attuned', 'emblem',
  'aided', 'entwined', 'chosen', 'vista',
  'refresher', // « Danse »
  'ghb', 'tempest', // unités Orbes héroïques : après la danse
];
export const BLESSING_ORDER = ['fire', 'water', 'wind', 'earth', 'light', 'dark', 'astra', 'anima'];
export const POOL_ORDER = ['low', '5', '4sr', 'na'];
export const BOOK_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// « Danse » : facette transverse (un héros peut être Danse + n'importe quelle catégorie).
export function isDancer(hero) {
  return !!hero && (hero.properties ?? []).includes('refresher');
}

// Palier de pool d'invocation, dérivé de poolRarity + poolFlags.
//  low   : pool général 1-4★ (démote possible)
//  5     : 5★ du pool général (sans taux spécial)
//  4sr   : « 4★ taux spécial » (démote focus) - base OU saisonnier, peu importe ici
//  na    : hors pool (GHB / TT / exclusifs légendaire-mythique…)
export function poolTier(hero) {
  if (!hero || hero.poolRarity == null) return 'na';
  const flags = new Set(hero.poolFlags ?? []);
  if (flags.has('specialRate') || flags.has('SHSpecialRate')) return '4sr';
  return hero.poolRarity >= 5 ? '5' : 'low';
}

// Trie `values` selon `order` ; les valeurs hors liste vont à la fin, en ordre alpha.
export function orderedBy(values, order) {
  const rank = new Map(order.map((v, i) => [v, i]));
  return [...values].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : String(a).localeCompare(String(b));
  });
}

// Regroupement des jeux d'origine pour la facette « Jeu » : liste FIXE, dans cet
// ordre. Un remake est fondu dans le jeu d'origine ; les jeux non listés
// (Warriors, etc.) n'apparaissent pas dans le filtre. label -> origines brutes.
export const GAME_GROUPS = [
  ['Heroes', ['Fire Emblem Heroes']],
  ['Shadow Dragon / Mystery', [
    'Fire Emblem: Shadow Dragon and the Blade of Light',
    'Fire Emblem: Shadow Dragon',
    'Fire Emblem: Mystery of the Emblem',
    'Fire Emblem: New Mystery of the Emblem',
  ]],
  ['Echoes', ['Fire Emblem Gaiden', 'Fire Emblem Echoes: Shadows of Valentia']],
  ['Genealogy of the Holy War', ['Fire Emblem: Genealogy of the Holy War']],
  ['Thracia 776', ['Fire Emblem: Thracia 776']],
  ['The Binding Blade', ['Fire Emblem: The Binding Blade']],
  ['The Blazing Blade', ['Fire Emblem: The Blazing Blade']],
  ['The Sacred Stones', ['Fire Emblem: The Sacred Stones']],
  ['Path of Radiance', ['Fire Emblem: Path of Radiance']],
  ['Radiant Dawn', ['Fire Emblem: Radiant Dawn']],
  ['Awakening', ['Fire Emblem Awakening']],
  ['Fates', ['Fire Emblem Fates']],
  ['Three Houses', ['Fire Emblem: Three Houses', 'Fire Emblem Warriors: Three Hopes']],
  ['Tokyo Mirage Sessions', ['Tokyo Mirage Sessions ♯FE Encore']],
  ['Engage', ['Fire Emblem Engage']],
  ['Shadows', ['Fire Emblem Shadows']],
  ["Fortune's Weave", ["Fire Emblem: Fortune's Weave"]],
];
const GROUP_ORDER = GAME_GROUPS.map(([label]) => label);
const RAW_TO_GROUP = new Map(GAME_GROUPS.flatMap(([label, raws]) => raws.map((r) => [r, label])));
const GROUP_RAWS = new Map(GAME_GROUPS);

export function originGroup(rawOrigin) {
  return RAW_TO_GROUP.get(rawOrigin) ?? null;
}

function uniqSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

export function buildFacetOptions(heroes) {
  const present = (key) => [...new Set(heroes.map((h) => h[key]).filter(Boolean))];
  return {
    color: orderedBy(present('color'), COLOR_ORDER),
    weapon: orderedBy(present('weapon'), WEAPON_ORDER),
    move: orderedBy(present('move'), MOVE_ORDER),
    category: orderedBy(
      [...new Set([...present('category'), ...(heroes.some(isDancer) ? ['refresher'] : [])])],
      CATEGORY_ORDER,
    ),
    origin: orderedBy(
      [...new Set(heroes.flatMap((h) => (h.origins ?? []).map(originGroup).filter(Boolean)))],
      GROUP_ORDER,
    ),
    gender: uniqSorted(heroes.map((h) => h.gender).filter(Boolean)),
    book: orderedBy(present('book'), BOOK_ORDER),
    blessing: (() => {
      const blessed = orderedBy(present('blessing'), BLESSING_ORDER);
      const head = [];
      if (heroes.some((h) => h.blessing == null)) head.push('none');
      if (blessed.length) head.push('any');
      return [...head, ...blessed];
    })(),
    poolRarity: orderedBy([...new Set(heroes.map(poolTier))], POOL_ORDER),
  };
}

const SCALAR_FACETS = ['color', 'weapon', 'move', 'gender', 'book'];

// Lettres nordiques/spéciales des noms FE que NFD ne décompose pas.
const LETTER_FOLD = { ð: 'd', þ: 'th', ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ħ: 'h', ı: 'i' };

// Casse + accents + lettres spéciales retirés, pour une recherche tolérante.
export function foldText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[ðþøæœßłđħı]/g, (c) => LETTER_FOLD[c] ?? c);
}

export function applyFilters(heroes, filters = {}, query = '') {
  const terms = foldText(query).split(/\s+/).filter(Boolean);
  return heroes.filter((h) => {
    for (const f of SCALAR_FACETS) {
      if (filters[f] && h[f] !== filters[f]) return false;
    }
    if (filters.category) {
      // « refresher » (Danse) est transverse : match sur la propriété, pas la catégorie.
      if (filters.category === 'refresher') { if (!isDancer(h)) return false; }
      else if (h.category !== filters.category) return false;
    }
    if (filters.origin) {
      const raws = GROUP_RAWS.get(filters.origin) ?? [filters.origin];
      const ok = (h.origins ?? []).some((o) => o === filters.origin || raws.includes(o));
      if (!ok) return false;
    }
    if (filters.blessing) {
      if (filters.blessing === 'none') { if (h.blessing != null) return false; }
      else if (filters.blessing === 'any') { if (h.blessing == null) return false; }
      else if (h.blessing !== filters.blessing) return false;
    }
    if (filters.poolRarity && poolTier(h) !== filters.poolRarity) return false;
    if (terms.length) {
      const hay = foldText([
        h.name, h.title, h.titleFr, h.artist,
        (h.actorEn ?? []).join(' '), (h.actorJp ?? []).join(' '),
      ].join(' '));
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

function cmpReleaseDesc(a, b) {
  const da = a.releaseDate ?? '';
  const db = b.releaseDate ?? '';
  if (da !== db) return da < db ? 1 : -1;
  return String(a.name).localeCompare(String(b.name));
}

function cmpName(a, b) {
  return String(a.name).localeCompare(String(b.name));
}

function cmpReleaseDateAsc(a, b) {
  const da = a.releaseDate ?? '';
  const db = b.releaseDate ?? '';
  return da < db ? -1 : da > db ? 1 : 0;
}

export function sortHeroes(heroes, key = 'release-desc') {
  const out = [...heroes];
  switch (key) {
    case 'release-asc':
      out.sort((a, b) => {
        const d = cmpReleaseDateAsc(a, b);
        return d !== 0 ? d : cmpName(a, b);
      });
      break;
    case 'name-asc':
      out.sort((a, b) => cmpName(a, b) || cmpReleaseDesc(a, b));
      break;
    case 'name-desc':
      out.sort((a, b) => {
        const n = -cmpName(a, b);
        return n !== 0 ? n : cmpReleaseDesc(a, b);
      });
      break;
    case 'release-desc':
    default:
      out.sort(cmpReleaseDesc);
      break;
  }
  return out;
}

export function groupByPerson(heroes) {
  const groups = new Map();
  for (const h of heroes) {
    const key = h.person || h.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }
  const list = [...groups.entries()].map(([person, hs]) => ({
    person,
    heroes: sortHeroes(hs, 'release-desc'),
    colors: COLOR_ORDER.filter((c) => hs.some((h) => h.color === c)),
    _max: hs.reduce((m, h) => (h.releaseDate > m ? h.releaseDate : m), ''),
  }));
  list.sort((a, b) => (a._max < b._max ? 1 : a._max > b._max ? -1 : a.person.localeCompare(b.person)));
  return list.map(({ _max, ...g }) => g);
}
