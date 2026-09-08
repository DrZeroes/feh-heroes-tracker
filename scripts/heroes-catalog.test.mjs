import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const HERO_KEYS = ['id', 'name', 'title', 'titleFr', 'person', 'color', 'weapon', 'move', 'gender', 'origin',
  'origins', 'category', 'properties', 'blessing', 'poolRarity', 'poolFlags', 'artist', 'actorEn', 'actorJp',
  'image', 'imageFull', 'releaseDate', 'book', 'intId'];
const CATEGORIES = new Set(['mythic', 'legendary', 'emblem', 'rearmed', 'attuned', 'ascended',
  'duo', 'harmonized', 'aided', 'entwined', 'vista', 'chosen', 'refresher',
  'ghb', 'tempest', 'special', 'standard']);

const catalog = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8'));

test('catalog: count === heroes.length', () => {
  assert.equal(catalog.count, catalog.heroes.length);
});
test('catalog: source string exact', () => {
  assert.equal(catalog.source,
    'feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)');
});
test('catalog: every hero has exactly the 24 keys', () => {
  const want = [...HERO_KEYS].sort();
  for (const h of catalog.heroes) {
    assert.deepEqual(Object.keys(h).sort(), want, `bad shape: ${h.id}`);
  }
});
test('catalog: titleFr est une chaîne non vide ou null', () => {
  for (const h of catalog.heroes) {
    assert.ok(h.titleFr === null || (typeof h.titleFr === 'string' && h.titleFr.length > 0), h.id);
  }
});
test('catalog: no enemy rows', () => {
  assert.deepEqual(catalog.heroes.filter((h) => h.properties.includes('enemy')).map((h) => h.id), []);
});
test('catalog: every category is known', () => {
  const bad = [...new Set(catalog.heroes.map((h) => h.category))].filter((c) => !CATEGORIES.has(c));
  assert.deepEqual(bad, []);
});
test('catalog: unreachable harmonic/tt never appear', () => {
  const cats = new Set(catalog.heroes.map((h) => h.category));
  assert.ok(!cats.has('harmonic') && !cats.has('tt'));
});
test('catalog: join keys unique per "Name: Title"', () => {
  const seen = new Map();
  for (const h of catalog.heroes) {
    const key = `${h.name}: ${h.title}`.toLowerCase();
    assert.ok(!seen.has(key), `dup join key "${key}": ${seen.get(key)} vs ${h.id}`);
    seen.set(key, h.id);
  }
});
test('catalog: sorted by releaseDate desc then name asc', () => {
  const h = catalog.heroes;
  for (let i = 1; i < h.length; i += 1) {
    const da = h[i - 1].releaseDate ?? '';
    const db = h[i].releaseDate ?? '';
    if (da !== db) assert.ok(da > db, `order break @${i}: ${da} then ${db}`);
    else assert.ok(String(h[i - 1].name).localeCompare(String(h[i].name)) <= 0, `name order break @${i}`);
  }
});
test('catalog: all legendary & mythic heroes have a blessing', () => {
  const missing = catalog.heroes.filter(
    (h) => (h.category === 'legendary' || h.category === 'mythic') && !h.blessing,
  );
  assert.deepEqual(missing.map((h) => h.id), []);
});
test('catalog: gender ∈ {female,male,multi,other}', () => {
  const bad = [...new Set(catalog.heroes.map((h) => h.gender))].filter(
    (g) => !['female', 'male', 'multi', 'other'].includes(g),
  );
  assert.deepEqual(bad, []);
});
test('catalog: image/imageFull are Fandom CDN URLs', () => {
  const cdn = /^https:\/\/static\.wikia\.nocookie\.net\/feheroes_gamepedia_en\/images\/[0-9a-f]\/[0-9a-f]{2}\/.+/;
  for (const h of catalog.heroes) {
    assert.match(h.image, cdn, h.id);
    assert.match(h.image, /_Face_FC\.webp$/, h.id);
    assert.match(h.imageFull, cdn, h.id);
    assert.match(h.imageFull, /_Face\.webp$/, h.id);
  }
});
