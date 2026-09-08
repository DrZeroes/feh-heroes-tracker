import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classIconFile, moveIconFile, assetName, collectIconSpecs } from './wiki-assets.mjs';

test('classIconFile mappe couleur+arme vers le nom wiki', () => {
  assert.equal(classIconFile('r', 'sword'), 'Icon_Class_Red_Sword.png');
  assert.equal(classIconFile('g', 'bow'), 'Icon_Class_Colorless_Bow.png');
  assert.equal(classIconFile('v', 'beast'), 'Icon_Class_Green_Beast.png');
  assert.equal(classIconFile('x', 'sword'), null);
  assert.equal(classIconFile('r', 'nope'), null);
});

test('moveIconFile mappe le déplacement', () => {
  assert.equal(moveIconFile('infantry'), 'Icon_Move_Infantry.png');
  assert.equal(moveIconFile('armored'), 'Icon_Move_Armored.png');
  assert.equal(moveIconFile('boat'), null);
});

test('assetName produit le nom de fichier local', () => {
  assert.equal(assetName('class', 'r', 'sword'), 'class-r-sword.webp');
  assert.equal(assetName('move', 'flying'), 'move-flying.webp');
});

test('collectIconSpecs dédupe, couvre moves + couples présents', () => {
  const heroes = [
    { color: 'r', weapon: 'sword', move: 'infantry' },
    { color: 'r', weapon: 'sword', move: 'cavalry' },
    { color: 'b', weapon: 'lance', move: 'infantry' },
    { color: null, weapon: null, move: 'flying' },
  ];
  const specs = collectIconSpecs(heroes);
  const assetFiles = specs.map((s) => s.assetFile).sort();
  assert.deepEqual(assetFiles, [
    'class-b-lance.webp', 'class-r-sword.webp',
    'move-cavalry.webp', 'move-flying.webp', 'move-infantry.webp',
  ]);
  const sword = specs.find((s) => s.assetFile === 'class-r-sword.webp');
  assert.equal(sword.wikiFile, 'Icon_Class_Red_Sword.png');
});
