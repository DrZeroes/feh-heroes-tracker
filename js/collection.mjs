// js/collection.mjs — forme et dérivés de la collection perso. Pur, sans DOM.

const IVS = new Set(['hp', 'atk', 'spd', 'def', 'res']);
const RANKS = new Set(['C', 'B', 'A', 'S']);

const today = () => new Date().toISOString().slice(0, 10);

export function emptyCollection() {
  return { version: 2, updated: today(), owned: {}, wanted: {}, manuals: {} };
}

export function clampMerges(n) {
  const i = Math.floor(Number(n));
  if (!Number.isFinite(i) || i < 0) return 0;
  return i > 10 ? 10 : i;
}

export function clampCount(n) {
  const i = Math.floor(Number(n));
  return Number.isFinite(i) && i > 0 ? i : 0;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normEntry(e) {
  const o = e && typeof e === 'object' ? e : {};
  return {
    merges: clampMerges(o.merges),
    ivPlus: IVS.has(o.ivPlus) ? o.ivPlus : null,
    ivMinus: IVS.has(o.ivMinus) ? o.ivMinus : null,
    support: RANKS.has(o.support) ? o.support : null,
    copies: clampCount(o.copies),
    date: typeof o.date === 'string' && DATE_RE.test(o.date) ? o.date : null,
  };
}

export function migrateCollection(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawOwned = src.owned && typeof src.owned === 'object' ? src.owned : {};
  const owned = {};
  for (const [id, e] of Object.entries(rawOwned)) {
    if (e && typeof e === 'object') owned[id] = normEntry(e);
  }
  const wanted = {};
  if (src.wanted && typeof src.wanted === 'object') {
    for (const [id, v] of Object.entries(src.wanted)) if (v === true) wanted[id] = true;
  }
  const manuals = {};
  if (src.manuals && typeof src.manuals === 'object') {
    for (const [id, v] of Object.entries(src.manuals)) {
      const n = clampCount(v);
      if (n > 0) manuals[id] = n;
    }
  }
  return {
    version: 2,
    updated: typeof src.updated === 'string' ? src.updated : today(),
    owned,
    wanted,
    manuals,
  };
}

export function setOwned(col, id, owned) {
  const next = migrateCollection(col);
  if (owned) {
    if (!next.owned[id]) {
      next.owned[id] = { merges: 0, ivPlus: null, ivMinus: null, support: null, copies: 0, date: null };
    }
  } else {
    delete next.owned[id];
  }
  next.updated = today();
  return next;
}

export function setCopies(col, id, n) {
  const next = migrateCollection(col);
  if (!next.owned[id]) return col;
  next.owned[id] = { ...next.owned[id], copies: clampCount(n) };
  next.updated = today();
  return next;
}

export function setDate(col, id, date) {
  const next = migrateCollection(col);
  if (!next.owned[id]) return col;
  next.owned[id] = { ...next.owned[id], date: typeof date === 'string' && DATE_RE.test(date) ? date : null };
  next.updated = today();
  return next;
}

export function setWanted(col, id, bool) {
  const next = migrateCollection(col);
  if (bool) next.wanted[id] = true;
  else delete next.wanted[id];
  next.updated = today();
  return next;
}

export function wantedIdSet(col) {
  return new Set(Object.keys(col && col.wanted ? col.wanted : {}));
}

export function setManualCount(col, id, n) {
  const next = migrateCollection(col);
  const c = clampCount(n);
  if (c > 0) next.manuals[id] = c;
  else delete next.manuals[id];
  next.updated = today();
  return next;
}

export function manualsTotal(col) {
  return Object.values(col && col.manuals ? col.manuals : {}).reduce((a, b) => a + b, 0);
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
