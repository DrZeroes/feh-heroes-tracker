// scripts/lib/normalize.mjs
// Fonctions pures de normalisation du catalogue FEH. Aucun I/O, aucun réseau.

import { createHash } from 'node:crypto';

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

// Priorité de dérivation : quand un héros porte plusieurs propriétés,
// la première trouvée ici gagne. (Ordre d'affichage : cf. CATEGORY_ORDER dans js/catalog-view.mjs.)
// NB : `brave`/CYL et `refresher`/danse n'ont pas de catégorie propre.
// `brave` -> retombe sur `standard` (ou une propriété plus prioritaire).
// `refresher` -> transverse : c'est une FACETTE à part (cf. isDancer), un héros
// « Danse + Horizon » (ex. Leda) garde `category: vista`.
const CATEGORY_PRIORITY = [
  'mythic', 'legendary', 'emblem', 'rearmed', 'attuned', 'ascended',
  'duo', 'harmonized', 'aided', 'entwined', 'vista', 'chosen',
  'ghb', 'tempest', 'special',
];

export function parseListField(raw) {
  return String(raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

// Date de début de chaque « Livre » FEH (maj majeure annuelle, début février).
// Ajouter la ligne du Livre suivant quand il sort.
export const BOOK_STARTS = [
  ['1', '2017-02-02'], ['2', '2018-02-02'], ['3', '2019-02-08'], ['4', '2020-02-05'],
  ['5', '2021-02-04'], ['6', '2022-02-03'], ['7', '2023-02-02'], ['8', '2024-02-07'],
  ['9', '2025-02-06'], ['10', '2026-02-05'],
];

// Livre (1-10) déduit de la date de sortie. `null` si pas de date valide.
export function deriveBook(releaseDate) {
  const d = String(releaseDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  let book = '1';
  for (const [n, start] of BOOK_STARTS) {
    if (d >= start) book = n;
  }
  return book;
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
  const origin = String(raw.Origin ?? '').trim() || null;
  const { image, imageFull } = heroImageUrls(raw.WikiName);
  return {
    id: String(raw.WikiName ?? '').trim(),
    name: String(raw.Name ?? '').trim(),
    title: String(raw.Title ?? '').trim(),
    titleFr: null,
    person: String(raw.Person ?? '').trim() || null,
    color,
    weapon,
    move: normalizeMoveType(raw.MoveType),
    gender: normalizeGender(raw.Gender),
    origin,
    origins: parseOrigins(raw.Origin),
    category: deriveCategory(properties),
    properties,
    blessing: null,
    poolRarity: null,
    poolFlags: [],
    artist: String(raw.Artist ?? '').trim() || null,
    actorEn: parseListField(raw.ActorEN),
    actorJp: parseListField(raw.ActorJP),
    image,
    imageFull,
    releaseDate,
    book: deriveBook(releaseDate),
    partner: null, // rempli par fetch-heroes depuis data/partners.json (Duo/Harmonique)
    aliases: [], // rempli par fetch-heroes depuis data/name-aliases.json (recherche)
    intId: Number.isFinite(intIdNum) ? intIdNum : null,
  };
}

// Personnage de base sans le suffixe de genre (« Robin M » -> « Robin »).
export function basePerson(person) {
  return String(person ?? '').replace(/\s+(?:M|F|MF|FM|F2|M2)$/, '').trim();
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
  // backfill des champs dérivés pour les ajouts d'overrides qui ne les précisent pas
  const filled = heroes.map((h) => ({
    ...h,
    book: 'book' in h ? h.book : deriveBook(h.releaseDate ?? null),
    partner: 'partner' in h ? h.partner : null,
    aliases: Array.isArray(h.aliases) ? h.aliases : [],
  }));
  const sorted = [...filled].sort((a, b) => {
    const da = a.releaseDate ?? '';
    const db = b.releaseDate ?? '';
    if (da !== db) return db < da ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
  return { generatedAt, source: SOURCE, count: sorted.length, heroes: sorted };
}

// Direct Fandom image CDN. Special:FilePath on the wiki domain 403s intermittently
// (Cloudflare); the CDN with the md5-sharded path is stable from a browser <img>.
const WIKI_CDN = 'https://static.wikia.nocookie.net/feheroes_gamepedia_en/images';

function cdnUrl(fileName) {
  const h = createHash('md5').update(fileName).digest('hex');
  return `${WIKI_CDN}/${h[0]}/${h.slice(0, 2)}/${fileName}`;
}

export function heroImageUrls(wikiName) {
  const name = String(wikiName ?? '').trim();
  if (!name) return { image: null, imageFull: null };
  const slug = name.replace(/ /g, '_');
  return {
    image: cdnUrl(`${slug}_Face_FC.webp`),
    imageFull: cdnUrl(`${slug}_Face.webp`),
  };
}

export function normalizeGender(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === 'FEMALE' || s === 'F') return 'female';
  if (s === 'MALE' || s === 'M') return 'male';
  if (/^[MF]{2,}$/.test(s)) return 'multi';
  return 'other';
}

export function parseOrigins(raw) {
  return String(raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}
