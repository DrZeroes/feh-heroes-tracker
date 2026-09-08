import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverrideEntry, overridesSnippet } from './overrides.mjs';

test('buildOverrideEntry : id dérivé, valeurs bornées', () => {
  const e = buildOverrideEntry({
    name: '  Some  Hero ', title: ' The Brave  ',
    color: 'v', weapon: 'axe', move: 'flying',
    origin: 'Fire Emblem Awakening, Fire Emblem Heroes',
    category: 'legendary', releaseDate: '2026-09-05',
  });
  assert.equal(e.id, 'Some Hero The Brave');
  assert.equal(e.name, 'Some Hero');
  assert.equal(e.title, 'The Brave');
  assert.equal(e.color, 'v');
  assert.equal(e.weapon, 'axe');
  assert.equal(e.move, 'flying');
  assert.deepEqual(e.origins, ['Fire Emblem Awakening', 'Fire Emblem Heroes']);
  assert.equal(e.category, 'legendary');
  assert.equal(e.releaseDate, '2026-09-05');
  assert.deepEqual(e.properties, []);
});

test('buildOverrideEntry : valeurs invalides -> défauts', () => {
  const e = buildOverrideEntry({ name: 'X', title: 'Y', color: 'zzz', weapon: '?', move: '', category: 'nope', releaseDate: 'bad' });
  assert.equal(e.color, 'r');
  assert.equal(e.weapon, 'sword');
  assert.equal(e.move, 'infantry');
  assert.equal(e.category, 'standard');
  assert.equal(e.releaseDate, null);
  assert.deepEqual(e.origins, []);
});

test('buildOverrideEntry : nom ou titre manquant -> null', () => {
  assert.equal(buildOverrideEntry({ name: '', title: 'Y' }), null);
  assert.equal(buildOverrideEntry({ name: 'X', title: '  ' }), null);
  assert.equal(buildOverrideEntry({}), null);
});

test('overridesSnippet : JSON { add: [entry] }', () => {
  const e = buildOverrideEntry({ name: 'X', title: 'Y' });
  const parsed = JSON.parse(overridesSnippet(e));
  assert.deepEqual(parsed, { add: [e] });
  assert.ok(overridesSnippet(e).includes('\n  '));
});
