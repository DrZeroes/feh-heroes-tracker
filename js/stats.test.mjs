import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distribution, acquisitionTimeline, topCopies, wishlistSummary,
  wishlistByPriority, projectProgress,
} from './stats.mjs';

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

test('wishlistByPriority', () => {
  const col = {
    wanted: {
      A: { priority: 'high' }, B: { priority: 'high' },
      C: { priority: 'normal' }, D: true,
    },
  };
  assert.deepEqual(wishlistByPriority(col, new Set(['A'])), {
    high: { total: 2, missing: 1 },
    normal: { total: 2, missing: 2 },
  });
});

test('projectProgress trie par avancement décroissant', () => {
  const col = {
    owned: {
      A: { merges: 5, project: { targetMerges: 10, targetIvPlus: 'atk', notes: '' } },
      B: { merges: 10, project: { targetMerges: 10, targetIvPlus: null, notes: '' } },
      C: { merges: 3, project: null },
    },
  };
  const p = projectProgress(col, heroes);
  assert.deepEqual(p.map((x) => [x.id, x.pct, x.done]), [
    ['B', 100, true],
    ['A', 50, false],
  ]);
});
