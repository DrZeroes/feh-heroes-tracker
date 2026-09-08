// js/catalog-view.mjs — filtrage / tri / groupement du catalogue. Pur, sans DOM.

const COLOR_ORDER = ['r', 'b', 'v', 'g'];

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
    origin: uniqSorted(heroes.flatMap((h) => h.origins ?? [])),
    gender: uniqSorted(heroes.map((h) => h.gender).filter(Boolean)),
    blessing: uniqSorted(heroes.map((h) => h.blessing).filter(Boolean)),
    poolRarity: pool,
  };
}

const SCALAR_FACETS = ['color', 'weapon', 'move', 'category', 'gender', 'blessing'];

export function applyFilters(heroes, filters = {}, query = '') {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return heroes.filter((h) => {
    for (const f of SCALAR_FACETS) {
      if (filters[f] && h[f] !== filters[f]) return false;
    }
    if (filters.origin && !(h.origins ?? []).includes(filters.origin)) return false;
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

export function sortHeroes(heroes, key = 'release-desc') {
  const out = [...heroes];
  if (key === 'name-asc') {
    out.sort((a, b) => {
      const n = String(a.name).localeCompare(String(b.name));
      return n !== 0 ? n : cmpReleaseDesc(a, b);
    });
  } else {
    out.sort(cmpReleaseDesc);
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
