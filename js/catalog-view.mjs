// js/catalog-view.mjs — filtrage / tri / groupement du catalogue. Pur, sans DOM.

const COLOR_ORDER = ['r', 'b', 'v', 'g'];

// Ordre de sortie (JP) des jeux Fire Emblem + spin-offs présents/à venir dans FEH.
const GAME_ORDER = [
  'Fire Emblem: Shadow Dragon and the Blade of Light', // 1990
  'Fire Emblem Gaiden',                                // 1992
  'Fire Emblem: Mystery of the Emblem',                // 1994
  'Fire Emblem: Genealogy of the Holy War',            // 1996
  'Fire Emblem: Thracia 776',                          // 1999
  'Fire Emblem: The Binding Blade',                    // 2002
  'Fire Emblem: The Blazing Blade',                    // 2003
  'Fire Emblem: The Sacred Stones',                    // 2004
  'Fire Emblem: Path of Radiance',                     // 2005
  'Fire Emblem: Radiant Dawn',                         // 2007
  'Fire Emblem: Shadow Dragon',                        // 2008 (DS remake)
  'Fire Emblem: New Mystery of the Emblem',            // 2010
  'Fire Emblem Awakening',                             // 2012
  'Tokyo Mirage Sessions ♯FE Encore',                 // 2015 / Encore 2020
  'Fire Emblem Fates',                                 // 2015
  'Fire Emblem Heroes',                                // 2017
  'Fire Emblem Echoes: Shadows of Valentia',           // 2017
  'Fire Emblem Warriors',                              // 2017
  'Fire Emblem: Three Houses',                         // 2019
  'Fire Emblem Warriors: Three Hopes',                 // 2022
  'Fire Emblem Engage',                                // 2023
  'Fire Emblem Shadows',                               // 2025 (mobile, social deduction)
  "Fire Emblem: Fortune's Weave",                      // 2026 (Switch 2)
];
const GAME_RANK = new Map(GAME_ORDER.map((g, i) => [g, i]));

function compareOrigin(a, b) {
  const ra = GAME_RANK.has(a) ? GAME_RANK.get(a) : Number.MAX_SAFE_INTEGER;
  const rb = GAME_RANK.has(b) ? GAME_RANK.get(b) : Number.MAX_SAFE_INTEGER;
  if (ra !== rb) return ra - rb;
  return String(a).localeCompare(String(b));
}

function uniqSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

export function buildFacetOptions(heroes) {
  const pool = uniqSorted(
    heroes.map((h) => (h.poolRarity == null ? 'na' : String(h.poolRarity))),
  );
  return {
    color: uniqSorted(heroes.map((h) => h.color).filter(Boolean)),
    weapon: uniqSorted(heroes.map((h) => h.weapon).filter(Boolean)),
    move: uniqSorted(heroes.map((h) => h.move).filter(Boolean)),
    category: uniqSorted(heroes.map((h) => h.category).filter(Boolean)),
    origin: [...new Set(heroes.flatMap((h) => h.origins ?? []))].sort(compareOrigin),
    gender: uniqSorted(heroes.map((h) => h.gender).filter(Boolean)),
    blessing: (() => {
      const present = uniqSorted(heroes.map((h) => h.blessing).filter(Boolean));
      const head = [];
      if (heroes.some((h) => h.blessing == null)) head.push('none');
      if (present.length) head.push('any');
      return [...head, ...present];
    })(),
    poolRarity: pool,
  };
}

const SCALAR_FACETS = ['color', 'weapon', 'move', 'category', 'gender'];

export function applyFilters(heroes, filters = {}, query = '') {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return heroes.filter((h) => {
    for (const f of SCALAR_FACETS) {
      if (filters[f] && h[f] !== filters[f]) return false;
    }
    if (filters.origin && !(h.origins ?? []).includes(filters.origin)) return false;
    if (filters.blessing) {
      if (filters.blessing === 'none') { if (h.blessing != null) return false; }
      else if (filters.blessing === 'any') { if (h.blessing == null) return false; }
      else if (h.blessing !== filters.blessing) return false;
    }
    if (filters.poolRarity) {
      const want = filters.poolRarity;
      const have = h.poolRarity == null ? 'na' : String(h.poolRarity);
      if (have !== want) return false;
    }
    if (terms.length) {
      const hay = [
        h.name, h.title, h.artist,
        (h.actorEn ?? []).join(' '), (h.actorJp ?? []).join(' '),
      ].join(' ').toLowerCase();
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
