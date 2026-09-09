// scripts/fetch-heroes.mjs
// Orchestrateur : Cargo (4 tables) -> normalisation -> overrides -> data/heroes.json.

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cargoQuery } from './lib/cargo.mjs';
import {
  normalizeUnit, mergeJoins, applyOverrides, buildCatalog,
  normalizePageName, pageNameFor, blessingFromEffect, pickPoolRarity, basePerson,
} from './lib/normalize.mjs';

const UNIT_FIELDS = [
  'WikiName', 'Name', 'Title', 'Person', 'Origin', 'IntID', 'Gender',
  'WeaponType', 'MoveType', 'Artist', 'ActorEN', 'ActorJP', 'ReleaseDate', 'Properties',
  'GameSort', 'CharSort',
].join(',');

export async function run({
  fetchImpl = globalThis.fetch,
  sleepImpl,
  pauseMs,
  now = () => new Date(),
  minHeroes = 900,
  maxDropRatio = 0.9,
  outPath = new URL('../data/heroes.json', import.meta.url),
  overridesPath = new URL('../data/heroes.overrides.json', import.meta.url),
  localePath = new URL('../data/locale-fr.json', import.meta.url),
  localeManualPath = new URL('../data/locale-fr.manual.json', import.meta.url),
  partnersPath = new URL('../data/partners.json', import.meta.url),
  aliasesPath = new URL('../data/name-aliases.json', import.meta.url),
  heroDexPath = new URL('../data/hero-dex.json', import.meta.url),
} = {}) {
  const common = { fetchImpl };
  if (sleepImpl) common.sleepImpl = sleepImpl;
  if (pauseMs !== undefined) common.pauseMs = pauseMs;

  const units = await cargoQuery({
    ...common, table: 'Units', fields: UNIT_FIELDS,
    orderBy: 'ReleaseDate DESC,CharSort ASC',
    where: "Units.Properties HOLDS NOT 'enemy'",
  });
  const legendary = await cargoQuery({
    ...common, table: 'LegendaryHero', fields: '_pageName=Page,LegendaryEffect',
  });
  const mythic = await cargoQuery({
    ...common, table: 'MythicHero', fields: '_pageName=Page,MythicEffect',
  });
  const availability = await cargoQuery({
    ...common, table: 'SummoningAvailability',
    fields: '_pageName=Page,Rarity,Property,StartTime', orderBy: 'StartTime DESC',
  });

  const blessingByPage = new Map();
  for (const r of legendary) {
    const b = blessingFromEffect(r.LegendaryEffect);
    if (b) blessingByPage.set(normalizePageName(r.Page), b);
  }
  for (const r of mythic) {
    const b = blessingFromEffect(r.MythicEffect);
    if (b) blessingByPage.set(normalizePageName(r.Page), b);
  }

  const poolRowsByPage = new Map();
  for (const r of availability) {
    const key = normalizePageName(r.Page);
    if (!poolRowsByPage.has(key)) poolRowsByPage.set(key, []);
    poolRowsByPage.get(key).push({
      rarity: r.Rarity, property: r.Property ?? '', startTime: r.StartTime ?? '',
    });
  }
  const poolByPage = new Map();
  for (const [key, rows] of poolRowsByPage) {
    poolByPage.set(key, pickPoolRarity(rows));
  }

  let heroes = units.map(
    (u) => mergeJoins(normalizeUnit(u), { blessingByPage, poolByPage }),
  );

  // Le `where` Cargo ci-dessus est le filtre principal ; ceci est le filet de
  // sécurité si un `enemy` passe malgré tout (ex. réponse partielle / cache).
  heroes = heroes.filter((h) => !h.properties.includes('enemy'));

  let localeTitles = {};
  let localeNames = {};
  try {
    const loc = JSON.parse(await readFile(localePath, 'utf8'));
    localeTitles = loc.titles ?? {};
    localeNames = loc.names ?? {};
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  for (const h of heroes) {
    h.titleFr = localeTitles[`${h.name}\u001f${h.title}`] ?? null;
    const nf = localeNames[h.name];
    h.nameFr = typeof nf === 'string' && nf.trim() && nf !== h.name ? nf.trim() : null;
  }

  // Repli FR « à la main » (data/locale-fr.manual.json) : ne remplit QUE ce que
  // la localisation officielle n'a pas fourni. Un vrai texte officiel gagne
  // toujours et écrase le manuel au prochain regen.
  let localeManual = {};
  try {
    localeManual = JSON.parse(await readFile(localeManualPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  for (const h of heroes) {
    const m = localeManual[h.id];
    if (!m || typeof m !== 'object') continue;
    if (!h.titleFr && typeof m.titleFr === 'string' && m.titleFr.trim()) h.titleFr = m.titleFr.trim();
    if (!h.nameFr && typeof m.nameFr === 'string' && m.nameFr.trim() && m.nameFr.trim() !== h.name) {
      h.nameFr = m.nameFr.trim();
    }
  }

  let partners = {};
  try {
    partners = JSON.parse(await readFile(partnersPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  for (const h of heroes) {
    const p = partners[h.id];
    h.partner = typeof p === 'string' && p.trim() ? p.trim() : null;
  }

  let nameAliases = {};
  try {
    nameAliases = JSON.parse(await readFile(aliasesPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  for (const h of heroes) {
    const raw = nameAliases[basePerson(h.person)] ?? nameAliases[h.name] ?? [];
    h.aliases = (Array.isArray(raw) ? raw : []).map((a) => String(a).trim()).filter(Boolean);
  }

  const consumed = new Set(heroes.map((h) => normalizePageName(pageNameFor(h.name, h.title))));
  const orphanBlessings = [...blessingByPage.keys()].filter((k) => !consumed.has(k));
  if (orphanBlessings.length) {
    console.warn(`[fetch-heroes] ${orphanBlessings.length} blessing row(s) matched no hero (page-name drift?):`);
    for (const k of orphanBlessings) console.warn(`  - ${k}`);
  }
  const orphanPools = [...poolByPage.keys()].filter((k) => !consumed.has(k));
  if (orphanPools.length) {
    console.warn(`[fetch-heroes] ${orphanPools.length} summon-availability key(s) matched no hero (first 10):`);
    for (const k of orphanPools.slice(0, 10)) console.warn(`  - ${k}`);
  }

  let overrides = { add: [], patch: {} };
  try {
    overrides = JSON.parse(await readFile(overridesPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  heroes = applyOverrides(heroes, overrides);

  const unresolved = heroes.filter(
    (h) => (h.category === 'legendary' || h.category === 'mythic') && !h.blessing,
  );
  if (unresolved.length) {
    console.warn(`[fetch-heroes] ${unresolved.length} héros legendary/mythic sans blessing résolu :`);
    for (const h of unresolved) console.warn(`  - ${h.id}`);
  }

  const catalog = buildCatalog(heroes, { generatedAt: now().toISOString() });

  if (catalog.count < minHeroes) {
    throw new Error(`[fetch-heroes] refusing to write: only ${catalog.count} heroes (floor ${minHeroes}) — likely a partial fetch`);
  }
  let prevCount = null;
  try {
    const prev = JSON.parse(await readFile(outPath, 'utf8'));
    if (typeof prev.count === 'number') prevCount = prev.count;
  } catch { /* no readable previous catalog — skip drop check */ }
  if (prevCount !== null && catalog.count < prevCount * maxDropRatio) {
    throw new Error(`[fetch-heroes] refusing to write: ${catalog.count} heroes vs previous ${prevCount} (> ${Math.round((1 - maxDropRatio) * 100)}% drop)`);
  }

  await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  // data/hero-dex.json : numéro du Recueil des Héros (ordre in-game), dérivé des
  // clés de tri du jeu exposées par le wiki (GameSort, CharSort). Aucun entretien
  // manuel : les nouveaux héros sont numérotés dès que le wiki leur pose un GameSort.
  const sortMeta = new Map();
  for (const u of units) {
    const g = Number.parseInt(u.GameSort, 10);
    const c = Number.parseInt(u.CharSort, 10);
    if (Number.isFinite(g)) sortMeta.set(u.WikiName, { g, c: Number.isFinite(c) ? c : 0 });
  }
  const dexOrder = catalog.heroes
    .filter((h) => sortMeta.has(h.id))
    .sort((a, b) => {
      const A = sortMeta.get(a.id); const B = sortMeta.get(b.id);
      return A.g - B.g || A.c - B.c
        || String(a.releaseDate).localeCompare(String(b.releaseDate))
        || String(a.name).localeCompare(String(b.name));
    });
  const dex = {};
  dexOrder.forEach((h, i) => { dex[h.id] = i + 1; });
  await writeFile(heroDexPath, `${JSON.stringify(dex)}\n`, 'utf8');
  return catalog;
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  run().then(
    (c) => console.log(`[fetch-heroes] ${c.count} héros écrits dans data/heroes.json`),
    (err) => { console.error(err); process.exitCode = 1; },
  );
}
