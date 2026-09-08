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

export function normalizeUnit(raw) {
  const { color, weapon } = splitWeaponType(raw.WeaponType);
  const properties = parseListField(raw.Properties);
  const releaseDate = String(raw.ReleaseDate ?? '').slice(0, 10) || null;
  const intIdNum = Number.parseInt(raw.IntID, 10);
  return {
    id: String(raw.WikiName ?? '').trim(),
    name: String(raw.Name ?? '').trim(),
    title: String(raw.Title ?? '').trim(),
    titleFr: null,
    person: String(raw.Person ?? '').trim() || null,
    color,
    weapon,
    move: normalizeMoveType(raw.MoveType),
    gender: String(raw.Gender ?? '').trim() || null,
    origin: String(raw.Origin ?? '').trim() || null,
    category: deriveCategory(properties),
    properties,
    blessing: null,
    poolRarity: null,
    poolFlags: [],
    artist: String(raw.Artist ?? '').trim() || null,
    actorEn: parseListField(raw.ActorEN),
    actorJp: parseListField(raw.ActorJP),
    releaseDate,
    intId: Number.isFinite(intIdNum) ? intIdNum : null,
  };
}

export function mergeJoins(hero, { blessingByPage, poolByPage }) {
  const key = normalizePageName(pageNameFor(hero.name, hero.title));
  const pool = poolByPage.get(key) ?? { poolRarity: null, poolFlags: [] };
  return {
    ...hero,
    blessing: blessingByPage.get(key) ?? null,
    poolRarity: pool.poolRarity,
    poolFlags: pool.poolFlags,
  };
}

const SOURCE = 'feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)';

export function applyOverrides(heroes, overrides) {
  const add = Array.isArray(overrides?.add) ? overrides.add : [];
  const patch = (overrides && typeof overrides.patch === 'object' && overrides.patch) || {};
  const byId = new Map(heroes.map((h) => [h.id, { ...h }]));
  for (const [id, fields] of Object.entries(patch)) {
    if (byId.has(id)) byId.set(id, { ...byId.get(id), ...fields });
  }
  for (const entry of add) {
    if (!entry || !entry.id) continue;
    byId.set(entry.id, { ...(byId.get(entry.id) ?? {}), ...entry });
  }
  return [...byId.values()];
}

export function buildCatalog(heroes, { generatedAt }) {
  const sorted = [...heroes].sort((a, b) => {
    const da = a.releaseDate ?? '';
    const db = b.releaseDate ?? '';
    if (da !== db) return db < da ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
  return { generatedAt, source: SOURCE, count: sorted.length, heroes: sorted };
}
