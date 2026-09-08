// js/stats.mjs — agrégats pour l'onglet Stats. Pur, sans DOM.

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
  for (const e of Object.values(owned)) {
    if (!e || typeof e.date !== 'string' || e.date.length < 7) continue;
    const month = e.date.slice(0, 7);
    map.set(month, (map.get(month) || 0) + 1);
  }
  return [...map.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function topCopies(collection, heroes, n = 10) {
  const owned = collection && collection.owned ? collection.owned : {};
  const byId = new Map(heroes.map((h) => [h.id, h]));
  return Object.entries(owned)
    .filter(([, e]) => e && e.copies > 0)
    .map(([id, e]) => {
      const h = byId.get(id) || { name: id, title: '' };
      return { id, name: h.name, title: h.title, copies: e.copies };
    })
    .sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function wishlistSummary(collection, ownedSet) {
  const wanted = collection && collection.wanted ? Object.keys(collection.wanted) : [];
  return { total: wanted.length, missing: wanted.filter((id) => !ownedSet.has(id)).length };
}
