import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitWeaponType, normalizeMoveType, parseListField, deriveCategory,
  pageNameFor, normalizePageName, blessingFromEffect, pickPoolRarity,
  normalizeUnit, mergeJoins,
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

const RAW_RHEA = {
  WikiName: 'Rhea The Final Child', Name: 'Rhea', Title: 'The Final Child',
  Person: 'Rhea', Origin: 'Fire Emblem: Three Houses', IntID: '1234', Gender: 'F',
  WeaponType: 'Blue Breath', MoveType: 'Infantry', Artist: 'Kaya8',
  ActorEN: 'Cherami Leigh', ActorJP: 'Ai Kayano',
  ReleaseDate: '2026-08-31', Properties: 'legendary,hat',
};

test('normalizeUnit produit un héros normalisé sans jointures', () => {
  const h = normalizeUnit(RAW_RHEA);
  assert.equal(h.id, 'Rhea The Final Child');
  assert.equal(h.name, 'Rhea');
  assert.equal(h.title, 'The Final Child');
  assert.equal(h.titleFr, null);
  assert.equal(h.person, 'Rhea');
  assert.equal(h.color, 'b');
  assert.equal(h.weapon, 'breath');
  assert.equal(h.move, 'infantry');
  assert.equal(h.gender, 'F');
  assert.equal(h.origin, 'Fire Emblem: Three Houses');
  assert.equal(h.category, 'legendary');
  assert.deepEqual(h.properties, ['legendary', 'hat']);
  assert.equal(h.blessing, null);
  assert.equal(h.poolRarity, null);
  assert.deepEqual(h.poolFlags, []);
  assert.equal(h.artist, 'Kaya8');
  assert.deepEqual(h.actorEn, ['Cherami Leigh']);
  assert.deepEqual(h.actorJp, ['Ai Kayano']);
  assert.equal(h.releaseDate, '2026-08-31');
  assert.equal(h.intId, 1234);
});

test('normalizeUnit tolère les champs manquants', () => {
  const h = normalizeUnit({ WikiName: 'X', Name: 'X', Title: '' });
  assert.equal(h.person, null);
  assert.equal(h.color, null);
  assert.equal(h.move, null);
  assert.equal(h.gender, null);
  assert.equal(h.intId, null);
  assert.equal(h.releaseDate, null);
  assert.deepEqual(h.actorEn, []);
});

test('normalizeUnit tronque une date horodatée à YYYY-MM-DD', () => {
  const h = normalizeUnit({ WikiName: 'X', Name: 'X', Title: 'Y', ReleaseDate: '2026-08-31 00:00:00' });
  assert.equal(h.releaseDate, '2026-08-31');
});

test('mergeJoins renseigne blessing et pool via la clé de page', () => {
  const base = normalizeUnit(RAW_RHEA);
  const blessingByPage = new Map([['rhea the final child', 'fire']]);
  const poolByPage = new Map([['rhea the final child', { poolRarity: 5, poolFlags: ['specialRate'] }]]);
  const merged = mergeJoins(base, { blessingByPage, poolByPage });
  assert.equal(merged.blessing, 'fire');
  assert.equal(merged.poolRarity, 5);
  assert.deepEqual(merged.poolFlags, ['specialRate']);
});

test('mergeJoins laisse les valeurs par défaut si aucune correspondance', () => {
  const base = normalizeUnit(RAW_RHEA);
  const merged = mergeJoins(base, { blessingByPage: new Map(), poolByPage: new Map() });
  assert.equal(merged.blessing, null);
  assert.equal(merged.poolRarity, null);
  assert.deepEqual(merged.poolFlags, []);
});
