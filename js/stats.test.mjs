import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribution, acquisitionTimeline, topCopies, wishlistSummary } from './stats.mjs';

const heroes = [
  { id: 'A', name: 'A', title: '', color: 'r', weapon: 'sword', move: 'infantry', category: 'legendary', blessing: 'fire' },
  { id: 'B', name: 'B', title: '', color: 'r', weapon: 'lance', move: 'flying', category: 'standard', blessing: null },
  { id: 'C', name: 'C', title: 'x', color: 'b', weapon: 'sword', move: 'infantry', category: 'standard', blessing: null },
];

test('distribution par couleur', () => {
  const d = distribution(heroes, new Set(['A']), 'color');
  assert.deepEqual(d, [
    { value: 'r', total: 2, owned: 1 },
    { value: 'b', total: 1, owned: 0 },
  ]);
});

test('acquisitionTimeline groupe par mois', () => {
  const col = { owned: { A: { date: '2026-01-15' }, B: { date: '2026-01-02' }, C: { date: '2025-12-20' } } };
  assert.deepEqual(acquisitionTimeline(col), [
    { month: '2025-12', count: 1 },
    { month: '2026-01', count: 2 },
  ]);
});

test('acquisitionTimeline ignore les dates nulles', () => {
  const col = { owned: { A: { date: null }, B: {} } };
  assert.deepEqual(acquisitionTimeline(col), []);
});

test('topCopies', () => {
  const col = { owned: { A: { copies: 5 }, B: { copies: 0 }, C: { copies: 2 } } };
  assert.deepEqual(topCopies(col, heroes, 10), [
    { id: 'A', name: 'A', title: '', copies: 5 },
    { id: 'C', name: 'C', title: 'x', copies: 2 },
  ]);
});

test('wishlistSummary', () => {
  const col = { wanted: { A: true, B: true, Z: true } };
  assert.deepEqual(wishlistSummary(col, new Set(['A'])), { total: 3, missing: 2 });
});
