// scripts/fetch-heroes.mjs
// Orchestrateur : Cargo (4 tables) -> normalisation -> overrides -> data/heroes.json.

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cargoQuery } from './lib/cargo.mjs';
import {
  normalizeUnit, mergeJoins, applyOverrides, buildCatalog,
  normalizePageName, blessingFromEffect, pickPoolRarity,
} from './lib/normalize.mjs';

const UNIT_FIELDS = [
  'WikiName', 'Name', 'Title', 'Person', 'Origin', 'IntID', 'Gender',
  'WeaponType', 'MoveType', 'Artist', 'ActorEN', 'ActorJP', 'ReleaseDate', 'Properties',
].join(',');

export async function run({
  fetchImpl = globalThis.fetch,
  sleepImpl,
  pauseMs,
  now = () => new Date(),
  outPath = new URL('../data/heroes.json', import.meta.url),
  overridesPath = new URL('../data/heroes.overrides.json', import.meta.url),
} = {}) {
  const common = { fetchImpl };
  if (sleepImpl) common.sleepImpl = sleepImpl;
  if (pauseMs !== undefined) common.pauseMs = pauseMs;

  const units = await cargoQuery({
    ...common, table: 'Units', fields: UNIT_FIELDS,
    orderBy: 'ReleaseDate DESC,CharSort ASC',
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
  await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
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
