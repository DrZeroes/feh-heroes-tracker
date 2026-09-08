// js/collection.mjs — forme et dérivés de la collection perso. Pur, sans DOM.

const IVS = new Set(['hp', 'atk', 'spd', 'def', 'res']);
const RANKS = new Set(['C', 'B', 'A', 'S']);

const today = () => new Date().toISOString().slice(0, 10);

export function emptyCollection() {
  return { version: 1, updated: today(), owned: {} };
}

export function clampMerges(n) {
  const i = Math.floor(Number(n));
  if (!Number.isFinite(i) || i < 0) return 0;
  return i > 10 ? 10 : i;
}

function normEntry(e) {
  const o = e && typeof e === 'object' ? e : {};
  return {
    merges: clampMerges(o.merges),
    ivPlus: IVS.has(o.ivPlus) ? o.ivPlus : null,
    ivMinus: IVS.has(o.ivMinus) ? o.ivMinus : null,
    support: RANKS.has(o.support) ? o.support : null,
  };
}

export function migrateCollection(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawOwned = src.owned && typeof src.owned === 'object' ? src.owned : {};
  const owned = {};
  for (const [id, e] of Object.entries(rawOwned)) {
    if (e && typeof e === 'object') owned[id] = normEntry(e);
  }
  return {
    version: 1,
    updated: typeof src.updated === 'string' ? src.updated : today(),
    owned,
  };
}

export function setOwned(col, id, owned) {
  const next = migrateCollection(col);
  if (owned) {
    if (!next.owned[id]) next.owned[id] = { merges: 0, ivPlus: null, ivMinus: null, support: null };
  } else {
    delete next.owned[id];
  }
  next.updated = today();
  return next;
}

export function setSupport(col, id, rank) {
  const next = migrateCollection(col);
  if (!next.owned[id]) return col;
  const r = RANKS.has(rank) ? rank : null;
  if (r === 'S') {
    for (const [k, e] of Object.entries(next.owned)) {
      if (k !== id && e.support === 'S') e.support = null;
    }
  }
  next.owned[id] = { ...next.owned[id], support: r };
  next.updated = today();
  return next;
}

export function ownedIdSet(col) {
  return new Set(Object.keys(col && col.owned ? col.owned : {}));
}

export function collectionStats(col, heroes) {
  const set = ownedIdSet(col);
  const total = heroes.length;
  let owned = 0;
  for (const h of heroes) if (set.has(h.id)) owned += 1;
  return { owned, total, pct: total ? Math.round((owned / total) * 100) : 0 };
}

export function filterByStatus(heroes, ownedSet, status) {
  if (status === 'owned') return heroes.filter((h) => ownedSet.has(h.id));
  if (status === 'missing') return heroes.filter((h) => !ownedSet.has(h.id));
  return heroes;
}
