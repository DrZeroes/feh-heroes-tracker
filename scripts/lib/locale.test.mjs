import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexMessages, normalizeTitleKey, buildFrTitleIndex, frTitleFor } from './locale.mjs';

test('indexMessages : tableau -> map', () => {
  assert.deepEqual(
    indexMessages([{ key: 'a', value: '1' }, { key: 'b', value: '2' }]),
    { a: '1', b: '2' },
  );
});

test('normalizeTitleKey : casse, apostrophe, &, espaces', () => {
  assert.equal(
    normalizeTitleKey('Anna', 'Commander ’n Chief'),
    normalizeTitleKey('anna', "commander 'n  chief"),
  );
  assert.equal(normalizeTitleKey('A & B', 'X'), 'a and bx');
});

test('buildFrTitleIndex + frTitleFor : exact puis normalisé', () => {
  const en = {
    'MPID_ex1': 'Eliwood', 'MPID_HONOR_ex1': 'Pledged Friend',
    'MPID_ex2': 'Anna', 'MPID_HONOR_ex2': "Commander ’n Chief",
    'MPID_ex3': 'Ghost', // pas de HONOR -> ignoré
  };
  const fr = {
    'MPID_HONOR_ex1': 'Ami loyal',
    'MPID_HONOR_ex2': 'Cheffe en chef',
  };
  const idx = buildFrTitleIndex(en, fr);
  assert.equal(frTitleFor('Eliwood', 'Pledged Friend', idx), 'Ami loyal');
  // titre reçu avec apostrophe droite -> passe par la clé normalisée
  assert.equal(frTitleFor('Anna', "Commander 'n Chief", idx), 'Cheffe en chef');
  assert.equal(frTitleFor('Nobody', 'Nowhere', idx), null);
});
