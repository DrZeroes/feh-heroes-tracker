// scripts/lib/normalize.mjs
// Fonctions pures de normalisation du catalogue FEH. Aucun I/O, aucun réseau.

const COLOR_CODE = { Red: 'r', Blue: 'b', Green: 'v', Colorless: 'g' };
const WEAPON_CODE = {
  Sword: 'sword', Lance: 'lance', Axe: 'axe', Bow: 'bow', Dagger: 'dagger',
  Tome: 'tome', Staff: 'staff', Breath: 'breath', Beast: 'beast',
};
const MOVE_CODE = {
  Infantry: 'infantry', Cavalry: 'cavalry', Flying: 'flying', Armored: 'armored',
};

export function splitWeaponType(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { color: null, weapon: null };
  const parts = s.split(/\s+/);
  const weaponWord = parts[parts.length - 1];
  const colorWord = parts.slice(0, -1).join(' ');
  return {
    color: COLOR_CODE[colorWord] ?? null,
    weapon: WEAPON_CODE[weaponWord] ?? null,
  };
}

export function normalizeMoveType(raw) {
  return MOVE_CODE[String(raw ?? '').trim()] ?? null;
}

const CATEGORY_PRIORITY = [
  'mythic', 'legendary', 'duo', 'harmonic', 'brave', 'ghb', 'tt', 'special',
];

export function parseListField(raw) {
  return String(raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function deriveCategory(properties) {
  const set = new Set((properties ?? []).map((p) => String(p).toLowerCase()));
  for (const c of CATEGORY_PRIORITY) {
    if (set.has(c)) return c;
  }
  return 'standard';
}

const BLESSING = new Set([
  'fire', 'water', 'wind', 'earth', 'light', 'dark', 'astra', 'anima',
]);

export function pageNameFor(name, title) {
  const n = String(name ?? '').trim();
  const t = String(title ?? '').trim();
  return t ? `${n}: ${t}` : n;
}

export function normalizePageName(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/:/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function blessingFromEffect(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  return BLESSING.has(key) ? key : null;
}

export function pickPoolRarity(rows) {
  const list = rows ?? [];
  const poolFlags = [...new Set(
    list.map((r) => r.property).filter((p) => p && p.length > 0),
  )];
  const usable = list.filter((r) => r.property !== 'revivalOnly');
  if (usable.length === 0) return { poolRarity: null, poolFlags };
  let best = usable[0];
  for (const r of usable) {
    if (String(r.startTime) > String(best.startTime)) best = r;
  }
  const n = Number.parseInt(best.rarity, 10);
  return { poolRarity: Number.isFinite(n) ? n : null, poolFlags };
}
