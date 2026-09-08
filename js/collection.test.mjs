import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCollection, clampMerges, migrateCollection, setOwned, setSupport,
  ownedIdSet, collectionStats, filterByStatus,
} from './collection.mjs';
import {
  clampCount, setCopies, setDate, setWanted, wantedIdSet, setManualCount, manualsTotal,
} from './collection.mjs';

test('emptyCollection', () => {
  const c = emptyCollection();
  assert.equal(c.version, 2);
  assert.deepEqual(c.owned, {});
  assert.deepEqual(c.wanted, {});
  assert.deepEqual(c.manuals, {});
  assert.match(c.updated, /^\d{4}-\d{2}-\d{2}$/);
});

test('clampMerges borne 0..10', () => {
  assert.equal(clampMerges(-3), 0);
  assert.equal(clampMerges(0), 0);
  assert.equal(clampMerges(7), 7);
  assert.equal(clampMerges(11), 10);
  assert.equal(clampMerges(3.9), 3);
  assert.equal(clampMerges('x'), 0);
  assert.equal(clampMerges(undefined), 0);
});

test('migrateCollection normalise les entrées', () => {
  const c = migrateCollection({
    owned: {
      A: { merges: 99, ivPlus: 'atk', ivMinus: 'zzz', support: 'S' },
      B: { merges: -1 },
      C: 'nope',
    },
  });
  assert.deepEqual(c.owned.A, { merges: 10, ivPlus: 'atk', ivMinus: null, support: 'S', copies: 0, date: null });
  assert.deepEqual(c.owned.B, { merges: 0, ivPlus: null, ivMinus: null, support: null, copies: 0, date: null });
  assert.ok(!('C' in c.owned));
  assert.equal(c.version, 2);
});

test('migrateCollection tolère un objet vide / non conforme', () => {
  assert.deepEqual(migrateCollection(null).owned, {});
  assert.deepEqual(migrateCollection({ owned: null }).owned, {});
});

test('setOwned ajoute / retire', () => {
  let c = emptyCollection();
  c = setOwned(c, 'Marth X', true);
  assert.deepEqual(c.owned['Marth X'], { merges: 0, ivPlus: null, ivMinus: null, support: null, copies: 0, date: null });
  c = setOwned(c, 'Marth X', false);
  assert.ok(!('Marth X' in c.owned));
});

test('setSupport : un seul S', () => {
  let c = migrateCollection({ owned: { A: { support: 'S' }, B: {}, C: {} } });
  c = setSupport(c, 'B', 'S');
  assert.equal(c.owned.A.support, null);
  assert.equal(c.owned.B.support, 'S');
  c = setSupport(c, 'B', 'A');
  assert.equal(c.owned.B.support, 'A');
});

test('setSupport : héros non possédé -> inchangé', () => {
  const c = emptyCollection();
  assert.equal(setSupport(c, 'Ghost', 'S'), c);
});

test('ownedIdSet', () => {
  const c = migrateCollection({ owned: { A: {}, B: {} } });
  assert.deepEqual([...ownedIdSet(c)].sort(), ['A', 'B']);
});

test('collectionStats compte seulement les héros du catalogue', () => {
  const heroes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const c = migrateCollection({ owned: { A: {}, B: {}, Zzz: {} } });
  assert.deepEqual(collectionStats(c, heroes), { owned: 2, total: 3, pct: 67 });
});

test('filterByStatus', () => {
  const heroes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const set = new Set(['A', 'C']);
  assert.deepEqual(filterByStatus(heroes, set, 'all').map((h) => h.id), ['A', 'B', 'C']);
  assert.deepEqual(filterByStatus(heroes, set, 'owned').map((h) => h.id), ['A', 'C']);
  assert.deepEqual(filterByStatus(heroes, set, 'missing').map((h) => h.id), ['B']);
});

test('migrateCollection v1 -> v2 ajoute copies/date/wanted/manuals', () => {
  const c = migrateCollection({ version: 1, owned: { A: { merges: 3 } } });
  assert.equal(c.version, 2);
  assert.deepEqual(c.owned.A, { merges: 3, ivPlus: null, ivMinus: null, support: null, copies: 0, date: null });
  assert.deepEqual(c.wanted, {});
  assert.deepEqual(c.manuals, {});
});

test('migrateCollection v2 : wanted garde seulement true, manuals >=1', () => {
  const c = migrateCollection({
    owned: { A: {} },
    wanted: { A: true, B: false, C: 1 },
    manuals: { X: 3, Y: 0, Z: -2, W: 2.9 },
  });
  assert.deepEqual(Object.keys(c.wanted), ['A']);
  assert.deepEqual(c.manuals, { X: 3, W: 2 });
});

test('clampCount', () => {
  assert.equal(clampCount(-1), 0);
  assert.equal(clampCount(2.7), 2);
  assert.equal(clampCount('x'), 0);
  assert.equal(clampCount(50), 50);
});

test('setCopies / setDate : héros possédé requis', () => {
  let c = migrateCollection({ owned: { A: {} } });
  c = setCopies(c, 'A', 4);
  assert.equal(c.owned.A.copies, 4);
  c = setDate(c, 'A', '2026-03-01');
  assert.equal(c.owned.A.date, '2026-03-01');
  c = setDate(c, 'A', 'nope');
  assert.equal(c.owned.A.date, null);
  assert.equal(setCopies(c, 'Ghost', 3), c);
});

test('setWanted / wantedIdSet', () => {
  let c = migrateCollection({});
  c = setWanted(c, 'A', true);
  assert.deepEqual([...wantedIdSet(c)], ['A']);
  c = setWanted(c, 'A', false);
  assert.deepEqual([...wantedIdSet(c)], []);
});

test('setManualCount / manualsTotal', () => {
  let c = migrateCollection({});
  c = setManualCount(c, 'A', 3);
  c = setManualCount(c, 'B', 1);
  assert.equal(manualsTotal(c), 4);
  c = setManualCount(c, 'A', 0);
  assert.deepEqual(c.manuals, { B: 1 });
  assert.equal(manualsTotal(c), 1);
});
