// js/overrides.mjs — construit un bloc pour data/heroes.overrides.json. Pur, sans DOM.

export const COLORS = ['r', 'b', 'v', 'g'];
export const WEAPONS = ['sword', 'lance', 'axe', 'bow', 'dagger', 'tome', 'staff', 'breath', 'beast'];
export const MOVES = ['infantry', 'cavalry', 'flying', 'armored'];
export const CATEGORIES = [
  'mythic', 'legendary', 'emblem', 'rearmed', 'attuned', 'ascended',
  'duo', 'harmonized', 'brave', 'ghb', 'tempest', 'special', 'standard',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pick = (set, v, fallback) => (set.includes(v) ? v : fallback);

export function buildOverrideEntry(form = {}) {
  const name = String(form.name || '').replace(/\s+/g, ' ').trim();
  const title = String(form.title || '').replace(/\s+/g, ' ').trim();
  if (!name || !title) return null;
  const origin = String(form.origin || '').trim();
  return {
    id: `${name} ${title}`.replace(/\s+/g, ' ').trim(),
    name,
    title,
    color: pick(COLORS, form.color, 'r'),
    weapon: pick(WEAPONS, form.weapon, 'sword'),
    move: pick(MOVES, form.move, 'infantry'),
    origin,
    origins: origin ? origin.split(',').map((s) => s.trim()).filter(Boolean) : [],
    category: pick(CATEGORIES, form.category, 'standard'),
    properties: [],
    releaseDate: DATE_RE.test(form.releaseDate) ? form.releaseDate : null,
  };
}

export function overridesSnippet(entry) {
  return JSON.stringify({ add: [entry] }, null, 2);
}
