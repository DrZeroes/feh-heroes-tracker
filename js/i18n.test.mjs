import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLang, makeTranslator } from './i18n.mjs';

test('resolveLang : stored valide gagne', () => {
  assert.equal(resolveLang('fr', ['en-US'], ['en', 'fr']), 'fr');
});
test('resolveLang : sinon première langue navigateur supportée', () => {
  assert.equal(resolveLang(null, ['de', 'fr-FR', 'en'], ['en', 'fr']), 'fr');
  assert.equal(resolveLang('xx', ['pt-BR'], ['en', 'fr']), 'en');
});
test('resolveLang : défaut = premier supporté', () => {
  assert.equal(resolveLang(null, [], ['en', 'fr']), 'en');
});

test('makeTranslator : clé primaire, fallback en, puis clé brute', () => {
  const dicts = { en: { hi: 'Hi', bye: 'Bye' }, fr: { hi: 'Salut' } };
  const t = makeTranslator(dicts, 'fr');
  assert.equal(t('hi'), 'Salut');
  assert.equal(t('bye'), 'Bye');       // fallback en
  assert.equal(t('missing'), 'missing'); // clé brute
});
test('makeTranslator : interpolation {param}', () => {
  const t = makeTranslator({ en: { n: '{count} heroes' } }, 'en');
  assert.equal(t('n', { count: 42 }), '42 heroes');
});
