import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitWeaponType, normalizeMoveType, parseListField, deriveCategory,
} from './normalize.mjs';

test('splitWeaponType sépare couleur et arme', () => {
  assert.deepEqual(splitWeaponType('Blue Breath'), { color: 'b', weapon: 'breath' });
  assert.deepEqual(splitWeaponType('Colorless Bow'), { color: 'g', weapon: 'bow' });
  assert.deepEqual(splitWeaponType('Green Axe'), { color: 'v', weapon: 'axe' });
  assert.deepEqual(splitWeaponType('Red Sword'), { color: 'r', weapon: 'sword' });
});

test('splitWeaponType renvoie null sur vide ou inconnu', () => {
  assert.deepEqual(splitWeaponType(''), { color: null, weapon: null });
  assert.deepEqual(splitWeaponType(null), { color: null, weapon: null });
  assert.deepEqual(splitWeaponType('Purple Hammer'), { color: null, weapon: null });
});

test('normalizeMoveType mappe les 4 types', () => {
  assert.equal(normalizeMoveType('Infantry'), 'infantry');
  assert.equal(normalizeMoveType('Cavalry'), 'cavalry');
  assert.equal(normalizeMoveType('Flying'), 'flying');
  assert.equal(normalizeMoveType('Armored'), 'armored');
  assert.equal(normalizeMoveType('Dragon'), null);
  assert.equal(normalizeMoveType(''), null);
});

test('parseListField découpe, trim et retire les vides', () => {
  assert.deepEqual(parseListField('legendary,hat'), ['legendary', 'hat']);
  assert.deepEqual(parseListField(' a , b ,, c '), ['a', 'b', 'c']);
  assert.deepEqual(parseListField(''), []);
  assert.deepEqual(parseListField(null), []);
});

test('deriveCategory applique la priorité mythic>legendary>...>standard', () => {
  assert.equal(deriveCategory(['legendary', 'hat']), 'legendary');
  assert.equal(deriveCategory(['duo', 'legendary']), 'legendary');
  assert.equal(deriveCategory(['mythic', 'legendary']), 'mythic');
  assert.equal(deriveCategory(['brave']), 'brave');
  assert.equal(deriveCategory(['ghb']), 'ghb');
  assert.equal(deriveCategory(['tt', 'special']), 'tt');
  assert.equal(deriveCategory(['refresher']), 'standard');
  assert.equal(deriveCategory([]), 'standard');
});
