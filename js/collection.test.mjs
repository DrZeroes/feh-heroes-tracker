import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCollection, clampMerges, clampCount, migrateCollection,
  setOwned, addUnit, removeUnit, setUnit, setSupport, setProject,
  ownedIdSet, unitCount, collectionStats, filterByStatus,
  setWanted, wantedIdSet, setWantedPriority, setWantedNote,
  setManualCount, manualsTotal, manualsByRarity,
} from './collection.mjs';

const U = (o = {}) => ({
  rarity: null, merges: 0, dragonflowers: 0, ivPlus: null, ivMinus: null, support: null,
  date: null, project: null, ...o,
});

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
  assert.equal(clampMerges(7), 7);
  assert.equal(clampMerges(11), 10);
  assert.equal(clampMerges(3.9), 3);
  assert.equal(clampMerges('x'), 0);
});

test('clampCount', () => {
  assert.equal(clampCount(-1), 0);
  assert.equal(clampCount(2.7), 2);
  assert.equal(clampCount('x'), 0);
  assert.equal(clampCount(50), 50);
});

test('migrateCollection : ancienne entrée objet -> liste d\'une unité', () => {
  const c = migrateCollection({
    owned: {
      A: { merges: 99, ivPlus: 'atk', ivMinus: 'zzz', support: 'S' },
      B: { merges: -1 },
      C: 'nope',
    },
  });
  assert.deepEqual(c.owned.A, [U({ merges: 10, ivPlus: 'atk', support: 'S' })]);
  assert.deepEqual(c.owned.B, [U()]);
  assert.ok(!('C' in c.owned));
});

test('migrateCollection : ancien `copies` -> unités vierges supplémentaires', () => {
  const c = migrateCollection({ owned: { A: { merges: 2, copies: 2 } } });
  assert.equal(c.owned.A.length, 3);
  assert.deepEqual(c.owned.A[0], U({ merges: 2 }));
  assert.deepEqual(c.owned.A[1], U());
  assert.deepEqual(c.owned.A[2], U());
});

test('migrateCollection : liste d\'unités conservée et normalisée', () => {
  const c = migrateCollection({ owned: { A: [{ merges: 3 }, { merges: 40, ivPlus: 'spd' }, 'junk'] } });
  assert.deepEqual(c.owned.A, [U({ merges: 3 }), U({ merges: 10, ivPlus: 'spd' })]);
});

test('migrateCollection tolère null / owned non conforme', () => {
  assert.deepEqual(migrateCollection(null).owned, {});
  assert.deepEqual(migrateCollection({ owned: null }).owned, {});
});

test('setOwned ajoute une unité / retire le héros', () => {
  let c = emptyCollection();
  c = setOwned(c, 'Marth X', true);
  assert.deepEqual(c.owned['Marth X'], [U()]);
  c = setOwned(c, 'Marth X', true); // idempotent
  assert.equal(c.owned['Marth X'].length, 1);
  c = setOwned(c, 'Marth X', false);
  assert.ok(!('Marth X' in c.owned));
});

test('addUnit / removeUnit', () => {
  let c = setOwned(emptyCollection(), 'A', true);
  c = addUnit(c, 'A');
  assert.equal(c.owned.A.length, 2);
  c = addUnit(c, 'B'); // crée B
  assert.equal(c.owned.B.length, 1);
  c = removeUnit(c, 'A', 0);
  assert.equal(c.owned.A.length, 1);
  c = removeUnit(c, 'A', 0);
  assert.ok(!('A' in c.owned)); // dernière unité retirée -> héros supprimé
  assert.equal(removeUnit(c, 'A', 0), c); // index hors borne -> inchangé
});

test('setUnit : modifie l\'exemplaire ciblé seulement', () => {
  let c = migrateCollection({ owned: { A: [{}, {}] } });
  c = setUnit(c, 'A', 1, { merges: 5, ivPlus: 'atk', ivMinus: 'spd', date: '2026-03-01' });
  assert.deepEqual(c.owned.A[0], U());
  assert.deepEqual(c.owned.A[1], U({ merges: 5, ivPlus: 'atk', ivMinus: 'spd', date: '2026-03-01' }));
  c = setUnit(c, 'A', 1, { date: 'nope' });
  assert.equal(c.owned.A[1].date, null);
  c = setUnit(c, 'A', 0, { rarity: 4 });
  assert.equal(c.owned.A[0].rarity, 4);
  c = setUnit(c, 'A', 0, { dragonflowers: 20 });
  assert.equal(c.owned.A[0].dragonflowers, 20);
  c = setUnit(c, 'A', 0, { dragonflowers: -3 });
  assert.equal(c.owned.A[0].dragonflowers, 0);
  c = setUnit(c, 'A', 0, { rarity: 9 });
  assert.equal(c.owned.A[0].rarity, null);
  assert.equal(setUnit(c, 'A', 9, { merges: 1 }), c);
});

test('setSupport : un seul S sur toute la collection', () => {
  let c = migrateCollection({ owned: { A: [{ support: 'S' }], B: [{}, {}] } });
  c = setSupport(c, 'B', 1, 'S');
  assert.equal(c.owned.A[0].support, null);
  assert.equal(c.owned.B[0].support, null);
  assert.equal(c.owned.B[1].support, 'S');
  c = setSupport(c, 'B', 1, 'A');
  assert.equal(c.owned.B[1].support, 'A');
});

test('setProject : par exemplaire, null pour retirer', () => {
  let c = migrateCollection({ owned: { A: [{ merges: 4 }, {}] } });
  c = setProject(c, 'A', 0, { targetIvPlus: 'atk' });
  assert.deepEqual(c.owned.A[0].project, { targetMerges: 10, targetIvPlus: 'atk', notes: '' });
  assert.equal(c.owned.A[1].project, null);
  c = setProject(c, 'A', 0, { targetMerges: 7, notes: 'ok' });
  assert.deepEqual(c.owned.A[0].project, { targetMerges: 7, targetIvPlus: 'atk', notes: 'ok' });
  c = setProject(c, 'A', 0, null);
  assert.equal(c.owned.A[0].project, null);
});

test('ownedIdSet / unitCount', () => {
  const c = migrateCollection({ owned: { A: [{}, {}], B: [{}] } });
  assert.deepEqual([...ownedIdSet(c)].sort(), ['A', 'B']);
  assert.equal(unitCount(c), 3);
});

test('collectionStats : héros du catalogue + total d\'unités', () => {
  const heroes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const c = migrateCollection({ owned: { A: [{}, {}], B: [{}], Zzz: [{}] } });
  assert.deepEqual(collectionStats(c, heroes), { owned: 2, total: 3, pct: 67, units: 4 });
});

test('filterByStatus', () => {
  const heroes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const set = new Set(['A', 'C']);
  assert.deepEqual(filterByStatus(heroes, set, 'owned').map((h) => h.id), ['A', 'C']);
  assert.deepEqual(filterByStatus(heroes, set, 'missing').map((h) => h.id), ['B']);
  assert.deepEqual(filterByStatus(heroes, set, 'all').map((h) => h.id), ['A', 'B', 'C']);
});

test('migrateCollection v1 -> unités + wanted/manuals', () => {
  const c = migrateCollection({ version: 1, owned: { A: { merges: 3 } } });
  assert.equal(c.version, 2);
  assert.deepEqual(c.owned.A, [U({ merges: 3 })]);
  assert.deepEqual(c.wanted, {});
  assert.deepEqual(c.manuals, {});
});

test('setWanted crée { priority, note } ; wantedIdSet', () => {
  let c = setWanted(migrateCollection({}), 'A', true);
  assert.deepEqual(c.wanted.A, { priority: 'normal', note: '' });
  assert.deepEqual([...wantedIdSet(c)], ['A']);
  c = setWanted(c, 'A', false);
  assert.deepEqual([...wantedIdSet(c)], []);
});

test('migrateCollection : wanted objet / true / rejets', () => {
  const c = migrateCollection({
    wanted: { A: { priority: 'high', note: 'x' }, B: { priority: 'zzz' }, C: true, D: false },
  });
  assert.deepEqual(c.wanted.A, { priority: 'high', note: 'x' });
  assert.deepEqual(c.wanted.B, { priority: 'normal', note: '' });
  assert.deepEqual(c.wanted.C, { priority: 'normal', note: '' });
  assert.ok(!('D' in c.wanted));
});

test('setWantedPriority / setWantedNote', () => {
  let c = setWanted(migrateCollection({}), 'A', true);
  c = setWantedPriority(c, 'A', 'high');
  assert.equal(c.wanted.A.priority, 'high');
  c = setWantedPriority(c, 'A', 'bogus');
  assert.equal(c.wanted.A.priority, 'normal');
  c = setWantedNote(c, 'A', 'note');
  assert.equal(c.wanted.A.note, 'note');
  assert.equal(setWantedPriority(c, 'Ghost', 'high'), c);
});

test('setManualCount par rareté / manualsTotal / manualsByRarity', () => {
  let c = setManualCount(migrateCollection({}), 'A', 5, 3);
  c = setManualCount(c, 'A', 4, 2);
  c = setManualCount(c, 'B', 3, 1);
  assert.deepEqual(c.manuals.A, { 4: 2, 5: 3 });
  assert.deepEqual(manualsByRarity(c, 'A'), { 3: 0, 4: 2, 5: 3 });
  assert.equal(manualsTotal(c), 6);
  c = setManualCount(c, 'A', 5, 0);
  assert.deepEqual(c.manuals.A, { 4: 2 });
  c = setManualCount(c, 'A', 4, 0);
  assert.ok(!('A' in c.manuals));
});

test('migrateCollection : ancien manuels entier -> 5★', () => {
  const c = migrateCollection({ manuals: { A: 3, B: { 3: 1, 5: 2 }, C: 0 } });
  assert.deepEqual(c.manuals.A, { 5: 3 });
  assert.deepEqual(c.manuals.B, { 3: 1, 5: 2 });
  assert.ok(!('C' in c.manuals));
});
