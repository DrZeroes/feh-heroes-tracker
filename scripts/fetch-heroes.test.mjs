import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './fetch-heroes.mjs';

function routeFetch(tables) {
  return async (url) => {
    const u = new URL(url);
    const table = u.searchParams.get('tables');
    const offset = Number(u.searchParams.get('offset') || '0');
    const rows = offset === 0 ? (tables[table] ?? []) : [];
    return {
      ok: true,
      status: 200,
      json: async () => ({ cargoquery: rows.map((title) => ({ title })) }),
    };
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
    {
      WikiName: 'Axe Fighter ENEMY', Name: 'Axe Fighter', Title: 'ENEMY',
      WeaponType: 'Green Axe', MoveType: 'Infantry', Origin: 'X', Properties: 'enemy',
      ReleaseDate: '', IntID: '', Gender: 'M', Artist: '', ActorEN: '', ActorJP: '',
      Person: 'Axe Fighter',
    },
  ],
  LegendaryHero: [{ Page: 'Rhea: The Final Child', LegendaryEffect: 'Fire' }],
  MythicHero: [{ Page: 'Nobody: Ghost', MythicEffect: 'Light' }],
  SummoningAvailability: [
    { Page: 'Greeny: The Older', Rarity: '3', Property: '', StartTime: '2020-01-01 07:00:00' },
    { Page: 'Greeny: The Older', Rarity: '4', Property: 'specialRate', StartTime: '2021-06-01 07:00:00' },
  ],
};

test('run normalise, joint, trie et écrit le catalogue', async () => {
  const outPath = path.join(os.tmpdir(), `feh-heroes-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const localePath = path.join(os.tmpdir(), `feh-locale-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(localePath, JSON.stringify({ titles: { 'Rhea\u001fThe Final Child': "L'Enfant ultime" } }), 'utf8');
  const partnersPath = path.join(os.tmpdir(), `feh-partners-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(partnersPath, JSON.stringify({ 'Rhea The Final Child': 'Seiros' }), 'utf8');
  const catalog = await run({
    fetchImpl: routeFetch(TABLES),
    sleepImpl: async () => {},
    pauseMs: 0,
    minHeroes: 0,
    now: () => new Date('2026-09-08T00:00:00.000Z'),
    outPath,
    overridesPath: path.join(os.tmpdir(), 'feh-no-such-overrides.json'),
    localePath,
    partnersPath,
  });

  assert.equal(catalog.count, 2);
  assert.deepEqual(
    catalog.heroes.filter((h) => h.properties.includes('enemy')).map((h) => h.id),
    [],
  );
  assert.ok(!catalog.heroes.some((h) => h.id === 'Axe Fighter ENEMY'));
  assert.equal(catalog.generatedAt, '2026-09-08T00:00:00.000Z');
  assert.equal(catalog.source, 'feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)');

  const [first, second] = catalog.heroes;
  assert.equal(first.id, 'Rhea The Final Child');      // date la plus récente en tête
  assert.equal(first.titleFr, "L'Enfant ultime");      // jointure data/locale-fr.json
  assert.equal(first.partner, 'Seiros');               // jointure data/partners.json
  assert.equal(second.partner, null);
  assert.equal(first.blessing, 'fire');                // jointure LegendaryHero
  assert.equal(first.color, 'b');
  assert.equal(first.weapon, 'breath');
  assert.deepEqual(first.actorEn, ['Cherami Leigh']);
  assert.equal(first.gender, 'female'); // RAW fixture Gender 'F'
  assert.deepEqual(first.origins, ['Fire Emblem: Three Houses']);
  assert.equal(first.image, 'https://static.wikia.nocookie.net/feheroes_gamepedia_en/images/0/05/Rhea_The_Final_Child_Face_FC.webp');

  assert.equal(second.id, 'Greeny The Older');
  assert.equal(second.poolRarity, 4);                  // StartTime le plus récent
  assert.deepEqual(second.poolFlags, ['specialRate']);
  assert.equal(second.blessing, null);

  const onDisk = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(onDisk.count, 2);
  assert.equal(onDisk.heroes[0].id, 'Rhea The Final Child');
});

test('run: titleFr reste null quand le fichier locale est absent', async () => {
  const outPath = path.join(os.tmpdir(), `feh-heroes-nolocale-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const catalog = await run({
    fetchImpl: routeFetch(TABLES),
    sleepImpl: async () => {},
    pauseMs: 0,
    minHeroes: 0,
    now: () => new Date('2026-09-08T00:00:00.000Z'),
    outPath,
    overridesPath: path.join(os.tmpdir(), 'feh-no-such-overrides.json'),
    localePath: path.join(os.tmpdir(), `feh-no-such-locale-${Date.now()}.json`),
  });
  const [first] = catalog.heroes;
  assert.equal(first.titleFr, null);
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
    minHeroes: 0,
    now: () => new Date('2026-09-08T00:00:00.000Z'),
    outPath,
    overridesPath,
  });
  const rhea = catalog.heroes.find((h) => h.id === 'Rhea The Final Child');
  assert.equal(rhea.titleFr, "L'Enfant Ultime");
});

test('run refuse d\'écrire sous le plancher minHeroes', async () => {
  const outPath = path.join(os.tmpdir(), `feh-heroes-floor-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await assert.rejects(
    run({
      fetchImpl: routeFetch(TABLES),
      sleepImpl: async () => {},
      pauseMs: 0,
      minHeroes: 10,
      now: () => new Date('2026-09-08T00:00:00.000Z'),
      outPath,
      overridesPath: path.join(os.tmpdir(), 'feh-no-such-overrides.json'),
    }),
    /floor 10/,
  );
});

test('run refuse d\'écrire sur une chute massive vs catalogue précédent', async () => {
  const outPath = path.join(os.tmpdir(), `feh-heroes-drop-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await (await import('node:fs/promises')).writeFile(
    outPath, JSON.stringify({ count: 100, heroes: [] }), 'utf8',
  );
  await assert.rejects(
    run({
      fetchImpl: routeFetch(TABLES),
      sleepImpl: async () => {},
      pauseMs: 0,
      minHeroes: 0,
      now: () => new Date('2026-09-08T00:00:00.000Z'),
      outPath,
      overridesPath: path.join(os.tmpdir(), 'feh-no-such-overrides.json'),
    }),
    /drop/,
  );
});

test('run prévient sur des clés de jointure orphelines (dérive de nom de page)', async (t) => {
  const outPath = path.join(os.tmpdir(), `feh-heroes-orphan-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const warn = t.mock.method(console, 'warn');
  await run({
    fetchImpl: routeFetch(TABLES),
    sleepImpl: async () => {},
    pauseMs: 0,
    minHeroes: 0,
    now: () => new Date('2026-09-08T00:00:00.000Z'),
    outPath,
    overridesPath: path.join(os.tmpdir(), 'feh-no-such-overrides.json'),
  });
  const messages = warn.mock.calls.map((c) => String(c.arguments[0]));
  assert.ok(messages.some((m) => /matched no hero/.test(m)), messages.join('\n'));
});
