// js/collection.mjs - forme et dérivés de la collection perso. Pur, sans DOM.
//
// `owned[id]` est une LISTE d'unités (exemplaires physiques du même héros).
// Chaque unité : { merges, ivPlus, ivMinus, support, date, project }.
// Un héros est « possédé » dès qu'il a au moins une unité.

const IVS = new Set(['hp', 'atk', 'spd', 'def', 'res']);
const RANKS = new Set(['C', 'B', 'A', 'S']);
const PRIORITIES = new Set(['high', 'normal']);
const STARS = [3, 4, 5];
const star = (v) => (STARS.includes(Number(v)) ? Number(v) : null);

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

function normProject(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    targetMerges: clampMerges(p.targetMerges),
    targetIvPlus: IVS.has(p.targetIvPlus) ? p.targetIvPlus : null,
    notes: typeof p.notes === 'string' ? p.notes : '',
  };
}

function normUnit(e) {
  const o = e && typeof e === 'object' ? e : {};
  return {
    rarity: star(o.rarity),
    merges: clampMerges(o.merges),
    dragonflowers: clampCount(o.dragonflowers),
    ivPlus: IVS.has(o.ivPlus) ? o.ivPlus : null,
    ivMinus: IVS.has(o.ivMinus) ? o.ivMinus : null,
    support: RANKS.has(o.support) ? o.support : null,
    date: typeof o.date === 'string' && DATE_RE.test(o.date) ? o.date : null,
    project: normProject(o.project),
  };
}

export function freshUnit() {
  return {
    rarity: null, merges: 0, dragonflowers: 0, ivPlus: null, ivMinus: null, support: null,
    date: null, project: null,
  };
}

// Accepte l'ancienne forme (objet unique, avec éventuel `copies`) ou une liste.
// Renvoie une liste d'au moins une unité, ou null si rien d'exploitable.
function normUnitList(v) {
  if (Array.isArray(v)) {
    const units = v.filter((u) => u && typeof u === 'object').map(normUnit);
    return units.length ? units : null;
  }
  if (v && typeof v === 'object') {
    const spares = clampCount(v.copies); // ancien compteur de doubles → unités vierges en plus
    return [normUnit(v), ...Array.from({ length: spares }, () => freshUnit())];
  }
  return null;
}

// Manuels de combat par rareté : { "3": n, "4": n, "5": n } (entrées non nulles).
// Ancienne forme (entier) -> supposée 5★.
function normManuals(v) {
  if (typeof v === 'number') {
    const n = clampCount(v);
    return n > 0 ? { 5: n } : null;
  }
  if (v && typeof v === 'object') {
    const out = {};
    for (const r of STARS) {
      const n = clampCount(v[r]);
      if (n > 0) out[r] = n;
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

function normWanted(v) {
  if (v === true) return { priority: 'normal', note: '' };
  if (v && typeof v === 'object') {
    return {
      priority: PRIORITIES.has(v.priority) ? v.priority : 'normal',
      note: typeof v.note === 'string' ? v.note : '',
    };
  }
  return null;
}

export function migrateCollection(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawOwned = src.owned && typeof src.owned === 'object' ? src.owned : {};
  const owned = {};
  for (const [id, e] of Object.entries(rawOwned)) {
    const units = normUnitList(e);
    if (units) owned[id] = units;
  }
  const wanted = {};
  if (src.wanted && typeof src.wanted === 'object') {
    for (const [id, v] of Object.entries(src.wanted)) {
      const w = normWanted(v);
      if (w) wanted[id] = w;
    }
  }
  const manuals = {};
  if (src.manuals && typeof src.manuals === 'object') {
    for (const [id, v] of Object.entries(src.manuals)) {
      const rec = normManuals(v);
      if (rec) manuals[id] = rec;
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
    if (!next.owned[id]) next.owned[id] = [freshUnit()];
  } else {
    delete next.owned[id];
  }
  next.updated = today();
  return next;
}

// Ajoute un exemplaire (crée l'entrée si le héros n'était pas possédé).
export function addUnit(col, id) {
  const next = migrateCollection(col);
  if (!next.owned[id]) next.owned[id] = [];
  next.owned[id] = [...next.owned[id], freshUnit()];
  next.updated = today();
  return next;
}

// Retire l'exemplaire `index` ; supprime le héros s'il ne reste plus rien.
export function removeUnit(col, id, index) {
  const next = migrateCollection(col);
  const units = next.owned[id];
  if (!units || index < 0 || index >= units.length) return col;
  const rest = units.filter((_, i) => i !== index);
  if (rest.length) next.owned[id] = rest;
  else delete next.owned[id];
  next.updated = today();
  return next;
}

// Modifie des champs simples (rarity/merges/ivPlus/ivMinus/date) d'un exemplaire.
export function setUnit(col, id, index, patch) {
  const next = migrateCollection(col);
  const units = next.owned[id];
  if (!units || index < 0 || index >= units.length) return col;
  const cur = units[index];
  const merged = {
    ...cur,
    ...('rarity' in patch ? { rarity: star(patch.rarity) } : {}),
    ...('merges' in patch ? { merges: clampMerges(patch.merges) } : {}),
    ...('dragonflowers' in patch ? { dragonflowers: clampCount(patch.dragonflowers) } : {}),
    ...('ivPlus' in patch ? { ivPlus: IVS.has(patch.ivPlus) ? patch.ivPlus : null } : {}),
    ...('ivMinus' in patch ? { ivMinus: IVS.has(patch.ivMinus) ? patch.ivMinus : null } : {}),
    ...('date' in patch
      ? { date: typeof patch.date === 'string' && DATE_RE.test(patch.date) ? patch.date : null }
      : {}),
  };
  next.owned[id] = units.map((u, i) => (i === index ? merged : u));
  next.updated = today();
  return next;
}

export function setWanted(col, id, bool) {
  const next = migrateCollection(col);
  if (bool) { if (!next.wanted[id]) next.wanted[id] = { priority: 'normal', note: '' }; }
  else delete next.wanted[id];
  next.updated = today();
  return next;
}

export function setWantedPriority(col, id, priority) {
  const next = migrateCollection(col);
  if (!next.wanted[id]) return col;
  next.wanted[id] = { ...next.wanted[id], priority: PRIORITIES.has(priority) ? priority : 'normal' };
  next.updated = today();
  return next;
}

export function setWantedNote(col, id, note) {
  const next = migrateCollection(col);
  if (!next.wanted[id]) return col;
  next.wanted[id] = { ...next.wanted[id], note: typeof note === 'string' ? note : '' };
  next.updated = today();
  return next;
}

// Projet +10 sur l'exemplaire `index` ; `patch === null` retire le projet.
export function setProject(col, id, index, patch) {
  const next = migrateCollection(col);
  const units = next.owned[id];
  if (!units || index < 0 || index >= units.length) return col;
  const cur = units[index];
  let project;
  if (patch === null) {
    project = null;
  } else {
    const base = cur.project || { targetMerges: 10, targetIvPlus: null, notes: '' };
    project = normProject({ ...base, ...patch });
  }
  next.owned[id] = units.map((u, i) => (i === index ? { ...u, project } : u));
  next.updated = today();
  return next;
}

export function wantedIdSet(col) {
  return new Set(Object.keys(col && col.wanted ? col.wanted : {}));
}

// Fixe le nombre de manuels d'un héros pour une rareté (3, 4 ou 5).
export function setManualCount(col, id, rarity, n) {
  const next = migrateCollection(col);
  const r = star(rarity) ?? 5;
  const c = clampCount(n);
  const rec = next.manuals[id] && typeof next.manuals[id] === 'object' ? { ...next.manuals[id] } : {};
  if (c > 0) rec[r] = c;
  else delete rec[r];
  if (Object.keys(rec).length) next.manuals[id] = rec;
  else delete next.manuals[id];
  next.updated = today();
  return next;
}

export function manualsByRarity(col, id) {
  const rec = col && col.manuals && col.manuals[id] ? col.manuals[id] : {};
  return { 3: rec[3] || 0, 4: rec[4] || 0, 5: rec[5] || 0 };
}

export function manualsTotal(col) {
  const m = col && col.manuals ? col.manuals : {};
  let t = 0;
  for (const rec of Object.values(m)) {
    for (const n of Object.values(rec || {})) t += Number(n) || 0;
  }
  return t;
}

// Soutien de l'Invocateur : un seul `S` sur TOUTE la collection (tous héros, tous exemplaires).
export function setSupport(col, id, index, rank) {
  const next = migrateCollection(col);
  const units = next.owned[id];
  if (!units || index < 0 || index >= units.length) return col;
  const r = RANKS.has(rank) ? rank : null;
  if (r === 'S') {
    for (const [k, list] of Object.entries(next.owned)) {
      next.owned[k] = list.map((u, i) => (
        (k === id && i === index) || u.support !== 'S' ? u : { ...u, support: null }
      ));
    }
  }
  next.owned[id] = next.owned[id].map((u, i) => (i === index ? { ...u, support: r } : u));
  next.updated = today();
  return next;
}

export function ownedIdSet(col) {
  return new Set(Object.keys(col && col.owned ? col.owned : {}));
}

export function unitCount(col) {
  return Object.values(col && col.owned ? col.owned : {}).reduce((a, list) => a + list.length, 0);
}

export function collectionStats(col, heroes) {
  const set = ownedIdSet(col);
  const total = heroes.length;
  let owned = 0;
  for (const h of heroes) if (set.has(h.id)) owned += 1;
  return {
    owned, total, pct: total ? Math.round((owned / total) * 100) : 0, units: unitCount(col),
  };
}

export function filterByStatus(heroes, ownedSet, status) {
  if (status === 'owned') return heroes.filter((h) => ownedSet.has(h.id));
  if (status === 'missing') return heroes.filter((h) => !ownedSet.has(h.id));
  return heroes;
}
