import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './fetch-heroes.mjs';

function routeFetch(tables) {
  return async (url) => {
    const u = new URL(url);
    const table = u.searchParams.get('tables');
    const offset = Number(u.searchParams.get('offset') || '0');
    const rows = offset === 0 ? (tables[table] ?? []) : [];
    return { json: async () => ({ cargoquery: rows.map((title) => ({ title })) }) };
  };
}

const TABLES = {
  Units: [
    {
      WikiName: 'Rhea The Final Child', Name: 'Rhea', Title: 'The Final Child',
      Person: 'Rhea', Origin: 'Fire Emblem: Three Houses', IntID: '1200', Gender: 'F',
      WeaponType: 'Blue Breath', MoveType: 'Infantry', Artist: 'Kaya8',
      ActorEN: 'Cherami Leigh', ActorJP: 'Ai Kayano',
      ReleaseDate: '2026-08-31', Properties: 'legendary,hat',
    },
    {
      WikiName: 'Greeny The Older', Name: 'Greeny', Title: 'The Older',
      Person: 'Greeny', Origin: 'X', IntID: '10', Gender: 'M',
      WeaponType: 'Green Axe', MoveType: 'Armored', Artist: 'Z',
      ActorEN: '', ActorJP: '', ReleaseDate: '2020-01-01', Properties: '',
    },
  ],
  LegendaryHero: [{ Page: 'Rhea: The Final Child', LegendaryEffect: 'Fire' }],
  MythicHero: [],
  SummoningAvailability: [
    { Page: 'Greeny: The Older', Rarity: '3', Property: '', StartTime: '2020-01-01 07:00:00' },
    { Page: 'Greeny: The Older', Rarity: '4', Property: 'specialRate', StartTime: '2021-06-01 07:00:00' },
  ],
};

test('run normalise, joint, trie et écrit le catalogue', async () => {
  const outPath = path.join(os.tmpdir(), `feh-heroes-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const catalog = await run({
    fetchImpl: routeFetch(TABLES),
    sleepImpl: async () => {},
    pauseMs: 0,
    now: () => new Date('2026-09-08T00:00:00.000Z'),
    outPath,
    overridesPath: path.join(os.tmpdir(), 'feh-no-such-overrides.json'),
  });

  assert.equal(catalog.count, 2);
  assert.equal(catalog.generatedAt, '2026-09-08T00:00:00.000Z');
  assert.equal(catalog.source, 'feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)');

  const [first, second] = catalog.heroes;
  assert.equal(first.id, 'Rhea The Final Child');      // date la plus récente en tête
  assert.equal(first.blessing, 'fire');                // jointure LegendaryHero
  assert.equal(first.color, 'b');
  assert.equal(first.weapon, 'breath');
  assert.deepEqual(first.actorEn, ['Cherami Leigh']);

  assert.equal(second.id, 'Greeny The Older');
  assert.equal(second.poolRarity, 4);                  // StartTime le plus récent
  assert.deepEqual(second.poolFlags, ['specialRate']);
  assert.equal(second.blessing, null);

  const onDisk = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(onDisk.count, 2);
  assert.equal(onDisk.heroes[0].id, 'Rhea The Final Child');
});

test('run applique les overrides quand le fichier existe', async () => {
  const outPath = path.join(os.tmpdir(), `feh-heroes-ovr-${Date.now()}.json`);
  const overridesPath = path.join(os.tmpdir(), `feh-ovr-${Date.now()}.json`);
  await (await import('node:fs/promises')).writeFile(
    overridesPath,
    JSON.stringify({ add: [], patch: { 'Rhea The Final Child': { titleFr: "L'Enfant Ultime" } } }),
    'utf8',
  );
  const catalog = await run({
    fetchImpl: routeFetch(TABLES),
    sleepImpl: async () => {},
    pauseMs: 0,
    now: () => new Date('2026-09-08T00:00:00.000Z'),
    outPath,
    overridesPath,
  });
  const rhea = catalog.heroes.find((h) => h.id === 'Rhea The Final Child');
  assert.equal(rhea.titleFr, "L'Enfant Ultime");
});
