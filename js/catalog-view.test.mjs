import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFacetOptions, applyFilters, sortHeroes, groupByPerson, orderedBy, poolTier, isDancer,
  CATEGORY_ORDER,
} from './catalog-view.mjs';

const H = (o) => ({
  id: o.id ?? o.name, name: o.name, title: o.title ?? '', person: o.person ?? o.name,
  color: o.color ?? 'r', weapon: o.weapon ?? 'sword', move: o.move ?? 'infantry',
  gender: o.gender ?? 'male', origin: (o.origins ?? ['G1']).join(','), origins: o.origins ?? ['G1'],
  category: o.category ?? 'standard', blessing: o.blessing ?? null,
  poolRarity: o.poolRarity ?? null, artist: o.artist ?? '', actorEn: o.actorEn ?? [], actorJp: o.actorJp ?? [],
  releaseDate: o.releaseDate ?? '2020-01-01',
});

const DATA = [
  H({ name: 'Alpha', color: 'r', weapon: 'sword', category: 'legendary', blessing: 'fire', poolRarity: null, releaseDate: '2026-01-01', origins: ['Awakening', 'Engage'], artist: 'Kita' }),
  H({ name: 'Bravo', color: 'b', weapon: 'lance', category: 'standard', poolRarity: 5, releaseDate: '2024-06-01', origins: ['Fates'] }),
  H({ name: 'Charlie', color: 'r', weapon: 'bow', category: 'standard', poolRarity: 3, releaseDate: '2024-06-01', origins: ['Awakening'], person: 'Charlie', actorEn: ['Jane Doe'] }),
  H({ name: 'Charlie', title: 'Alt', color: 'g', weapon: 'staff', person: 'Charlie', releaseDate: '2025-03-03', origins: ['Awakening'] }),
];

test('buildFacetOptions liste les valeurs présentes, dans l\'ordre d\'affichage', () => {
  const f = buildFacetOptions(DATA);
  assert.deepEqual(f.color, ['r', 'b', 'g']); // r, b, v, g -> v absent
  assert.deepEqual(f.origin, ['Awakening', 'Engage', 'Fates']);
  assert.deepEqual(f.category, ['legendary', 'standard']); // ordre CATEGORY_ORDER
  assert.deepEqual(f.poolRarity, ['low', '5', 'na']);
});

test('orderedBy : suit l\'ordre fourni, inconnus à la fin en alpha', () => {
  assert.deepEqual(
    orderedBy(['refresher', 'mythic', 'zzz', 'legendary'], CATEGORY_ORDER),
    ['legendary', 'mythic', 'refresher', 'zzz'],
  );
});

test('buildFacetOptions : armes et catégories dans l\'ordre voulu', () => {
  const mk = (weapon, category) => ({ color: 'r', weapon, move: 'infantry', category,
    gender: 'male', origins: [], blessing: null, poolRarity: null });
  const f = buildFacetOptions([
    mk('bow', 'standard'), mk('sword', 'refresher'), mk('tome', 'legendary'), mk('staff', 'vista'),
  ]);
  assert.deepEqual(f.weapon, ['sword', 'tome', 'bow', 'staff']);
  assert.deepEqual(f.category, ['legendary', 'vista', 'standard', 'refresher']);
});

test('applyFilters : couleur', () => {
  assert.deepEqual(applyFilters(DATA, { color: 'r' }, '').map((h) => h.name).sort(), ['Alpha', 'Charlie']);
});

test('Danse : facette transverse (refresher) + option catégorie', () => {
  const mk = (name, category, props) => ({ id: name, name, title: '', color: 'r', weapon: 'sword',
    move: 'infantry', gender: 'male', origins: [], blessing: null, poolRarity: null,
    category, properties: props });
  const heroes = [
    mk('Leda', 'vista', ['refresher', 'vista']), // Danse + Horizon
    mk('Azura', 'standard', ['refresher']),
    mk('Marth', 'legendary', ['legendary']),
  ];
  assert.equal(isDancer(heroes[0]), true);
  assert.equal(isDancer(heroes[2]), false);
  assert.ok(buildFacetOptions(heroes).category.includes('refresher'));
  // filtre "refresher" = tous les danseurs, quelle que soit leur catégorie
  assert.deepEqual(applyFilters(heroes, { category: 'refresher' }, '').map((h) => h.name), ['Leda', 'Azura']);
  // filtre "vista" attrape quand même Leda
  assert.deepEqual(applyFilters(heroes, { category: 'vista' }, '').map((h) => h.name), ['Leda']);
});
test('applyFilters : origin matche via origins[]', () => {
  assert.deepEqual(applyFilters(DATA, { origin: 'Engage' }, '').map((h) => h.name), ['Alpha']);
});
test('applyFilters : poolRarity "na" = poolRarity null', () => {
  // Alpha (null) + Charlie/"Alt" (null) ; Bravo=5, Charlie=3 exclus
  const r = applyFilters(DATA, { poolRarity: 'na' }, '').map((h) => h.name).sort();
  assert.deepEqual(r, ['Alpha', 'Charlie']);
});

test('poolTier : rareté + drapeaux -> paliers', () => {
  assert.equal(poolTier({ poolRarity: null }), 'na');
  assert.equal(poolTier({ poolRarity: 3 }), 'low');
  assert.equal(poolTier({ poolRarity: 4 }), 'low');
  assert.equal(poolTier({ poolRarity: 5 }), '5');
  assert.equal(poolTier({ poolRarity: 5, poolFlags: ['revivalOnly'] }), '5');
  assert.equal(poolTier({ poolRarity: 5, poolFlags: ['specialRate'] }), '4sr');
  assert.equal(poolTier({ poolRarity: 5, poolFlags: ['SHSpecialRate'] }), '4sr');
  assert.equal(poolTier({ poolRarity: 4, poolFlags: ['specialRate'] }), '4sr');
});

test('buildFacetOptions.poolRarity : paliers dans l\'ordre', () => {
  const mk = (poolRarity, poolFlags = []) => ({ color: 'r', weapon: 'sword', move: 'infantry',
    category: 'standard', gender: 'male', origins: [], blessing: null, poolRarity, poolFlags });
  const { poolRarity } = buildFacetOptions([
    mk(null), mk(5, ['SHSpecialRate']), mk(3), mk(5), mk(5, ['specialRate']),
  ]);
  assert.deepEqual(poolRarity, ['low', '5', '4sr', 'na']);
});
test('applyFilters : recherche multi-termes sur name/title/artist/actor', () => {
  assert.deepEqual(applyFilters(DATA, {}, 'char alt').map((h) => h.title), ['Alt']);
  assert.deepEqual(applyFilters(DATA, {}, 'kita').map((h) => h.name), ['Alpha']);
  assert.deepEqual(applyFilters(DATA, {}, 'jane').map((h) => h.name), ['Charlie']);
});

test('sortHeroes : release-desc par défaut, ne mute pas', () => {
  const input = [...DATA];
  const out = sortHeroes(input, 'release-desc');
  assert.deepEqual(out.map((h) => h.name), ['Alpha', 'Charlie', 'Bravo', 'Charlie']);
  assert.deepEqual(input.map((h) => h.name), DATA.map((h) => h.name));
});
test('sortHeroes : name-asc', () => {
  const out = sortHeroes(DATA, 'name-asc');
  assert.deepEqual(out.map((h) => `${h.name}${h.title}`), ['Alpha', 'Bravo', 'CharlieAlt', 'Charlie']);
});

test('sortHeroes : release-asc (plus anciens d\'abord)', () => {
  const out = sortHeroes(DATA, 'release-asc');
  assert.deepEqual(out.map((h) => h.name), ['Bravo', 'Charlie', 'Charlie', 'Alpha']);
});

test('sortHeroes : name-desc (nom Z->A, puis date desc)', () => {
  const out = sortHeroes(DATA, 'name-desc');
  assert.deepEqual(out.map((h) => `${h.name}${h.title}`), ['CharlieAlt', 'Charlie', 'Bravo', 'Alpha']);
});

test('sortHeroes : clé inconnue -> release-desc', () => {
  assert.deepEqual(
    sortHeroes(DATA, 'bogus').map((h) => h.name),
    sortHeroes(DATA, 'release-desc').map((h) => h.name),
  );
});

test('groupByPerson : regroupe, trie groupes par date max desc, couleurs ordonnées', () => {
  const groups = groupByPerson(DATA);
  assert.deepEqual(groups.map((g) => g.person), ['Alpha', 'Charlie', 'Bravo']);
  const charlie = groups.find((g) => g.person === 'Charlie');
  assert.equal(charlie.heroes.length, 2);
  assert.deepEqual(charlie.colors, ['r', 'g']);
});

test('buildFacetOptions.origin est en ordre de sortie des jeux', () => {
  const heroes = [
    { origins: ['Fire Emblem Engage'] },
    { origins: ['Fire Emblem: Mystery of the Emblem'] },
    { origins: ['Fire Emblem Awakening'] },
    { origins: ['Fire Emblem Heroes', 'Zzz Unknown Game'] },
  ].map((o) => ({ color: 'r', weapon: 'sword', move: 'infantry', category: 'standard',
    gender: 'male', blessing: null, poolRarity: null, ...o }));
  const { origin } = buildFacetOptions(heroes);
  assert.deepEqual(origin, [
    'Fire Emblem: Mystery of the Emblem',
    'Fire Emblem Awakening',
    'Fire Emblem Heroes',
    'Fire Emblem Engage',
    'Zzz Unknown Game',
  ]);
});

test('blessing : none + any dans les facettes, filtrage', () => {
  const H2 = (b) => ({ color: 'r', weapon: 'sword', move: 'infantry', category: 'standard',
    gender: 'male', origins: ['G1'], poolRarity: null, blessing: b });
  const heroes = [H2('fire'), H2('water'), H2(null), H2(null)];
  const { blessing } = buildFacetOptions(heroes);
  assert.deepEqual(blessing, ['none', 'any', 'fire', 'water']);
  assert.equal(applyFilters(heroes, { blessing: 'none' }, '').length, 2);
  assert.equal(applyFilters(heroes, { blessing: 'any' }, '').length, 2);
  assert.equal(applyFilters(heroes, { blessing: 'fire' }, '').length, 1);
});

test('applyFilters : blessing null/"" ne filtre rien', () => {
  const heroes = [
    { blessing: 'fire', color: 'r', weapon: 'sword', move: 'infantry', category: 'standard', gender: 'male', origins: [], poolRarity: null },
    { blessing: null, color: 'b', weapon: 'lance', move: 'flying', category: 'standard', gender: 'male', origins: [], poolRarity: null },
  ];
  assert.equal(applyFilters(heroes, { blessing: null }, '').length, 2);
  assert.equal(applyFilters(heroes, { blessing: '' }, '').length, 2);
  assert.equal(applyFilters(heroes, {}, '').length, 2);
});
