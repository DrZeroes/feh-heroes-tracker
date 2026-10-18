import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lv40Stats } from './unit-stats.mjs';

// Alfonse: Prince of Askr — niv. 40 neutre officiel : 43/35/25/32/22.
const ALFONSE = { stats: { base: [19, 9, 6, 8, 5], growth: [55, 60, 45, 55, 40] } };
const lv40 = (unit) => lv40Stats(ALFONSE, unit)?.stats;

test('neutre, sans fusion : stats niv. 40 officielles', () => {
  assert.deepEqual(lv40({ rarity: 5 }), [43, 35, 25, 32, 22]);
  assert.equal(lv40Stats(ALFONSE, { rarity: 5 }).total, 157);
});

test('rareté non renseignée = 5★', () => {
  assert.deepEqual(lv40({}), [43, 35, 25, 32, 22]);
});

test('atout / faille : ±1 niv. 1 et ±5 % de croissance', () => {
  assert.deepEqual(lv40({ ivPlus: 'atk', ivMinus: 'res' }), [43, 38, 25, 32, 19]);
});

test('1re fusion d\'un neutre : +1 aux 3 premières stats en plus', () => {
  assert.deepEqual(lv40({ merges: 1 }), [45, 37, 25, 33, 22]);
});

test('+10 neutre', () => {
  assert.deepEqual(lv40({ merges: 10 }), [48, 40, 29, 37, 26]);
});

test('la 1re fusion efface la faille (pas de bonus neutre)', () => {
  assert.deepEqual(lv40({ ivPlus: 'atk', ivMinus: 'res', merges: 1 }), [44, 39, 25, 32, 22]);
});

test('fleurs : +1 par fleur dans l\'ordre des stats niv. 1', () => {
  assert.deepEqual(lv40({ dragonflowers: 3 }), [44, 36, 25, 33, 22]);
  assert.deepEqual(lv40({ dragonflowers: 6 }), [45, 36, 26, 33, 23]);
});

test('égalité de stats niv. 1 : ordre PV > Atq > Vit > Déf > Rés', () => {
  const h = { stats: { base: [10, 10, 10, 10, 10], growth: [0, 0, 0, 0, 0] } };
  assert.deepEqual(lv40Stats(h, { dragonflowers: 2 }).stats, [11, 11, 10, 10, 10]);
});

test('hors 5★ ou sans stats : null', () => {
  assert.equal(lv40Stats(ALFONSE, { rarity: 4 }), null);
  assert.equal(lv40Stats({ stats: null }, {}), null);
  assert.equal(lv40Stats({}, {}), null);
});
