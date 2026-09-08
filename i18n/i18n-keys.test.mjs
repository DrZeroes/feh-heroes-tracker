import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const en = JSON.parse(await readFile(new URL('./en.json', import.meta.url), 'utf8'));
const fr = JSON.parse(await readFile(new URL('./fr.json', import.meta.url), 'utf8'));

const REQUIRED = [
  'app.title', 'app.tagline', 'lang.en', 'lang.fr',
  'search.placeholder', 'filter.any', 'filter.color', 'filter.weapon', 'filter.move',
  'filter.category', 'filter.origin', 'filter.gender', 'filter.blessing', 'filter.poolRarity', 'filter.reset',
  'filter.status',
  'sort.label', 'sort.byDate', 'sort.byName', 'group.byPerson', 'group.alts',
  'theme.toLight', 'theme.toDark',
  'grid.count', 'grid.empty', 'detail.close', 'detail.artist', 'detail.actorEn', 'detail.actorJp',
  'detail.origin', 'detail.blessing', 'detail.poolRarity', 'detail.properties', 'detail.released',
  'color.r', 'color.b', 'color.v', 'color.g',
  'weapon.sword', 'weapon.lance', 'weapon.axe', 'weapon.bow', 'weapon.dagger',
  'weapon.tome', 'weapon.staff', 'weapon.breath', 'weapon.beast',
  'move.infantry', 'move.cavalry', 'move.flying', 'move.armored',
  'category.mythic', 'category.legendary', 'category.emblem', 'category.rearmed', 'category.attuned',
  'category.ascended', 'category.duo', 'category.harmonized', 'category.brave', 'category.ghb',
  'category.tempest', 'category.special', 'category.standard',
  'blessing.fire', 'blessing.water', 'blessing.wind', 'blessing.earth',
  'blessing.light', 'blessing.dark', 'blessing.astra', 'blessing.anima',
  'blessing.none', 'blessing.any',
  'gender.female', 'gender.male', 'gender.multi', 'gender.other',
  'poolRarity.3', 'poolRarity.4', 'poolRarity.5', 'poolRarity.na',
  'status.all', 'status.owned', 'status.missing',
  'field.owned', 'field.merges', 'field.ivPlus', 'field.ivMinus', 'field.support',
  'support.none', 'support.C', 'support.B', 'support.A', 'support.S',
  'iv.none', 'iv.hp', 'iv.atk', 'iv.spd', 'iv.def', 'iv.res',
  'collection.count', 'action.export', 'action.import', 'import.mode', 'import.replace', 'import.merge', 'import.unknown', 'import.error',
];

test('en.json contient toutes les clés requises', () => {
  const missing = REQUIRED.filter((k) => !(k in en));
  assert.deepEqual(missing, []);
});
test('fr.json a exactement les mêmes clés que en.json', () => {
  const ek = Object.keys(en).sort();
  const fk = Object.keys(fr).sort();
  assert.deepEqual(fk, ek);
});
test('aucune valeur vide', () => {
  for (const [k, v] of Object.entries(en)) assert.ok(v, `en.${k} vide`);
  for (const [k, v] of Object.entries(fr)) assert.ok(v, `fr.${k} vide`);
});
test('grid.count et group.alts gardent le paramètre {n}', () => {
  for (const d of [en, fr]) {
    assert.match(d['grid.count'], /\{n\}/);
    assert.match(d['group.alts'], /\{n\}/);
  }
});
