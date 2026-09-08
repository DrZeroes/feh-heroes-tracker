// js/stats.mjs - agrégats pour l'onglet Stats. Pur, sans DOM.

export function distribution(heroes, ownedSet, key) {
  const map = new Map();
  for (const h of heroes) {
    const v = h[key];
    if (!v) continue;
    const e = map.get(v) || { value: v, total: 0, owned: 0 };
    e.total += 1;
    if (ownedSet.has(h.id)) e.owned += 1;
    map.set(v, e);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || String(a.value).localeCompare(String(b.value)));
}

export function acquisitionTimeline(collection) {
  const owned = collection && collection.owned ? collection.owned : {};
  const map = new Map();
  for (const units of Object.values(owned)) {
    for (const u of units || []) {
      if (!u || typeof u.date !== 'string' || u.date.length < 7) continue;
      const month = u.date.slice(0, 7);
      map.set(month, (map.get(month) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// Héros détenus en plusieurs exemplaires (doublons de caserne).
export function topCopies(collection, heroes, n = 10) {
  const owned = collection && collection.owned ? collection.owned : {};
  const byId = new Map(heroes.map((h) => [h.id, h]));
  return Object.entries(owned)
    .filter(([, units]) => (units || []).length > 1)
    .map(([id, units]) => {
      const h = byId.get(id) || { name: id, title: '' };
      return { id, name: h.name, title: h.title, copies: units.length };
    })
    .sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function wishlistSummary(collection, ownedSet) {
  const wanted = collection && collection.wanted ? Object.keys(collection.wanted) : [];
  return { total: wanted.length, missing: wanted.filter((id) => !ownedSet.has(id)).length };
}

export function wishlistByPriority(collection, ownedSet) {
  const wanted = collection && collection.wanted ? collection.wanted : {};
  const out = { high: { total: 0, missing: 0 }, normal: { total: 0, missing: 0 } };
  for (const [id, v] of Object.entries(wanted)) {
    const p = v && typeof v === 'object' && v.priority === 'high' ? 'high' : 'normal';
    out[p].total += 1;
    if (!ownedSet.has(id)) out[p].missing += 1;
  }
  return out;
}

export function projectProgress(collection, heroes) {
  const owned = collection && collection.owned ? collection.owned : {};
  const byId = new Map(heroes.map((h) => [h.id, h]));
  const out = [];
  for (const [id, units] of Object.entries(owned)) {
    const list = units || [];
    list.forEach((u, i) => {
      if (!u || !u.project) return;
      const h = byId.get(id) || { name: id, title: '' };
      const target = Math.max(1, u.project.targetMerges || 0);
      out.push({
        id,
        unit: i,
        name: list.length > 1 ? `${h.name} #${i + 1}` : h.name,
        title: h.title,
        merges: u.merges,
        targetMerges: u.project.targetMerges,
        targetIvPlus: u.project.targetIvPlus,
        done: u.merges >= target,
        pct: Math.min(100, Math.round((u.merges / target) * 100)),
      });
    });
  }
  return out.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
}
