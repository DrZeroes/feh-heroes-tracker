import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitWeaponType, normalizeMoveType, parseListField, deriveCategory,
  pageNameFor, normalizePageName, blessingFromEffect, pickPoolRarity,
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

test('pageNameFor assemble "Name: Title"', () => {
  assert.equal(pageNameFor('Rhea', 'The Final Child'), 'Rhea: The Final Child');
  assert.equal(pageNameFor('Askr', ''), 'Askr');
  assert.equal(pageNameFor(' Alear ', ' Engaging Fire '), 'Alear: Engaging Fire');
});

test('normalizePageName rend une clé tolérante', () => {
  assert.equal(
    normalizePageName('Rhea: The Final Child'),
    normalizePageName('Rhea  The Final Child'),
  );
  assert.equal(normalizePageName('Alear: Awoken Divinity'), 'alear awoken divinity');
});

test('blessingFromEffect mappe les 8 éléments, insensible à la casse', () => {
  assert.equal(blessingFromEffect('Fire'), 'fire');
  assert.equal(blessingFromEffect('water'), 'water');
  assert.equal(blessingFromEffect('ASTRA'), 'astra');
  assert.equal(blessingFromEffect('Anima'), 'anima');
  assert.equal(blessingFromEffect(''), null);
  assert.equal(blessingFromEffect('Thunder'), null);
});

test('pickPoolRarity prend la ligne la plus récente hors revivalOnly', () => {
  const rows = [
    { rarity: '3', property: '', startTime: '2020-01-01 07:00:00' },
    { rarity: '4', property: 'specialRate', startTime: '2021-06-01 07:00:00' },
    { rarity: '5', property: '', startTime: '2019-01-01 07:00:00' },
  ];
  assert.deepEqual(pickPoolRarity(rows), { poolRarity: 4, poolFlags: ['specialRate'] });
});

test('pickPoolRarity ignore revivalOnly pour la rareté mais le garde en flag', () => {
  const rows = [
    { rarity: '3', property: '', startTime: '2020-01-01 07:00:00' },
    { rarity: '5', property: 'revivalOnly', startTime: '2025-01-01 07:00:00' },
  ];
  assert.deepEqual(pickPoolRarity(rows), { poolRarity: 3, poolFlags: ['revivalOnly'] });
});

test('pickPoolRarity renvoie null si aucune ligne utilisable', () => {
  assert.deepEqual(pickPoolRarity([]), { poolRarity: null, poolFlags: [] });
  assert.deepEqual(
    pickPoolRarity([{ rarity: '5', property: 'revivalOnly', startTime: '2025-01-01 07:00:00' }]),
    { poolRarity: null, poolFlags: ['revivalOnly'] },
  );
});
