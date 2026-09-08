import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { originGroup } from '../js/catalog-view.mjs';
import { BOOK_STARTS } from './lib/normalize.mjs';

const HERO_KEYS = ['id', 'name', 'title', 'titleFr', 'person', 'color', 'weapon', 'move', 'gender', 'origin',
  'origins', 'category', 'properties', 'blessing', 'poolRarity', 'poolFlags', 'artist', 'actorEn', 'actorJp',
  'image', 'imageFull', 'releaseDate', 'book', 'partner', 'intId'];
const CATEGORIES = new Set(['mythic', 'legendary', 'emblem', 'rearmed', 'attuned', 'ascended',
  'duo', 'harmonized', 'aided', 'entwined', 'vista', 'chosen', 'refresher',
  'ghb', 'tempest', 'special', 'standard']);

// Propriétés wiki connues (suffixe _<chiffres> retiré). Nouvelle valeur ->
// soit un tag cosmétique à ajouter ici, soit un NOUVEAU TYPE de héros à câbler
// dans CATEGORY_PRIORITY (js n'est pas au courant, le héros retombe en standard).
const KNOWN_PROPS = new Set([
  'aide', 'aided', 'ascended', 'askr', 'attuned', 'brave', 'chosen', 'demoted',
  'dokkalfheimr', 'duo', 'embla', 'emblem', 'entwined', 'fallen', 'ghb', 'hair',
  'harmonized', 'hat', 'hel', 'jotunheimr', 'legendary', 'limited', 'ljosalfheimr',
  'mask', 'muspell', 'mythic', 'nidavellir', 'nifl', 'notRandomized', 'prologue',
  'rearmed', 'refresher', 'resplendent', 'specDisplay', 'specRate', 'special',
  'story', 'tempest', 'tiara', 'vanaheimr', 'vista', 'yggdrasill',
]);
const propStem = (p) => String(p).replace(/_\d{2,6}$/, '');

const catalog = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8'));

test('catalog: count === heroes.length', () => {
  assert.equal(catalog.count, catalog.heroes.length);
});
test('catalog: source string exact', () => {
  assert.equal(catalog.source,
    'feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)');
});
test('catalog: every hero has exactly the 25 keys', () => {
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
test('catalog: every origin maps to a GAME_GROUPS entry', () => {
  // garde-fou : un nouveau jeu non listé -> ajouter dans js/catalog-view.mjs GAME_GROUPS
  const ungrouped = [...new Set(catalog.heroes.flatMap((h) => h.origins))]
    .filter((o) => originGroup(o) === null);
  assert.deepEqual(ungrouped, [], `origines sans groupe: ${ungrouped.join(', ')}`);
});
test('catalog: no unrecognised hero property', () => {
  // garde-fou : nouvelle propriété -> tag cosmétique (KNOWN_PROPS) ou nouveau type (CATEGORY_PRIORITY)
  const seen = new Set(catalog.heroes.flatMap((h) => (h.properties ?? []).map(propStem)));
  const unknown = [...seen].filter((p) => !KNOWN_PROPS.has(p)).sort();
  assert.deepEqual(unknown, [], `propriétés inconnues: ${unknown.join(', ')}`);
});
test('catalog: color / weapon / move jamais null (nouvel enum wiki non mappé)', () => {
  for (const f of ['color', 'weapon', 'move']) {
    const bad = catalog.heroes.filter((h) => h[f] == null).map((h) => h.id);
    assert.deepEqual(bad, [], `${f} null (mapper le nouvel enum dans scripts/lib/normalize.mjs): ${bad.slice(0, 5).join(', ')}`);
  }
});
test('catalog: book is 1..10 (ou null)', () => {
  const ok = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  const bad = [...new Set(catalog.heroes.map((h) => h.book))].filter((b) => b !== null && !ok.has(b));
  assert.deepEqual(bad, [], `book hors 1..10: ${bad.join(', ')}`);
});
test('catalog: aucun héros trop postérieur au dernier Livre défini', () => {
  // garde-fou : si un héros sort > ~14 mois après le début du dernier Livre connu,
  // c'est qu'un nouveau Livre est sorti -> ajouter sa ligne dans BOOK_STARTS.
  const [lastBook, lastStart] = BOOK_STARTS[BOOK_STARTS.length - 1];
  const limit = new Date(lastStart);
  limit.setMonth(limit.getMonth() + 14);
  const cutoff = limit.toISOString().slice(0, 10);
  const late = catalog.heroes
    .filter((h) => h.releaseDate && h.releaseDate > cutoff)
    .map((h) => `${h.id} (${h.releaseDate})`);
  assert.deepEqual(late, [], `Livre ${Number(lastBook) + 1} probablement sorti — étendre BOOK_STARTS. En retard: ${late.join(', ')}`);
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
