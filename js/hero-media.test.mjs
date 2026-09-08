import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorHex, classIconPath, moveIconPath, imageCandidates, shortOrigin, displayRarity } from './hero-media.mjs';

test('colorHex : 4 couleurs + repli', () => {
  assert.match(colorHex('r'), /^#[0-9a-f]{6}$/i);
  assert.equal(colorHex('zzz'), colorHex('g'));
});
test('classIconPath', () => {
  assert.equal(classIconPath({ color: 'r', weapon: 'sword' }), 'assets/icons/class-r-sword.webp');
  assert.equal(classIconPath({ color: null, weapon: 'sword' }), null);
});
test('moveIconPath', () => {
  assert.equal(moveIconPath({ move: 'flying' }), 'assets/icons/move-flying.webp');
  assert.equal(moveIconPath({ move: null }), null);
});
test('imageCandidates : ordre image puis imageFull, sans falsy', () => {
  assert.deepEqual(imageCandidates({ image: 'a', imageFull: 'b' }), ['a', 'b']);
  assert.deepEqual(imageCandidates({ image: null, imageFull: 'b' }), ['b']);
  assert.deepEqual(imageCandidates({ image: null, imageFull: null }), []);
});

test('shortOrigin retire le préfixe Fire Emblem', () => {
  assert.equal(shortOrigin('Fire Emblem: Three Houses'), 'Three Houses');
  assert.equal(shortOrigin('Fire Emblem Echoes: Shadows of Valentia'), 'Echoes: Shadows of Valentia');
  assert.equal(shortOrigin('Fire Emblem Heroes'), 'Heroes');
  assert.equal(shortOrigin('Fire Emblem Warriors: Three Hopes'), 'Warriors: Three Hopes');
  assert.equal(shortOrigin('Tokyo Mirage Sessions ♯FE Encore'), 'Tokyo Mirage Sessions ♯FE Encore');
  assert.equal(shortOrigin(''), '');
});

test('displayRarity : pool connu, sinon déduit', () => {
  assert.equal(displayRarity({ poolRarity: 3, category: 'standard' }), 3);
  assert.equal(displayRarity({ poolRarity: 5, category: 'legendary' }), 5);
  assert.equal(displayRarity({ poolRarity: null, category: 'ghb' }), 4);
  assert.equal(displayRarity({ poolRarity: null, category: 'tempest' }), 4);
  assert.equal(displayRarity({ poolRarity: null, category: 'legendary' }), 5);
  assert.equal(displayRarity({ poolRarity: null, category: 'standard' }), 5);
  assert.equal(displayRarity(null), null);
});
