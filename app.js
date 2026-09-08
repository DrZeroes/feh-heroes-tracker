// app.js — câblage DOM du catalogue (lecture seule). Module ES, chemins relatifs.
import { resolveLang, makeTranslator } from './js/i18n.mjs';
import { colorHex, classIconPath, moveIconPath, imageCandidates, shortOrigin } from './js/hero-media.mjs';
import { buildFacetOptions, applyFilters, sortHeroes, groupByPerson } from './js/catalog-view.mjs';

const SUPPORTED = ['en', 'fr'];
const FACETS = ['color', 'weapon', 'move', 'category', 'origin', 'gender', 'blessing', 'poolRarity'];
const PAGE = 60;
const LS_LANG = 'feh-lang';
const LS_PREFS = 'feh-catalog-prefs';

const $ = (sel) => document.querySelector(sel);
const state = {
  heroes: [], dicts: {}, lang: 'en', t: (k) => k,
  filters: Object.fromEntries(FACETS.map((f) => [f, null])),
  query: '', sort: 'release-desc', group: false,
  view: [], shown: 0,
};

function epithetFor(hero) {
  return state.lang === 'fr' && hero.titleFr ? hero.titleFr : hero.title;
}

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_PREFS) || '{}');
    if (p && typeof p === 'object') {
      Object.assign(state.filters, p.filters || {});
      if (typeof p.query === 'string') state.query = p.query;
      if (p.sort) state.sort = p.sort;
      state.group = !!p.group;
    }
  } catch { /* ignore */ }
}
function writePrefs() {
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify({
      filters: state.filters, query: state.query, sort: state.sort, group: state.group,
    }));
  } catch { /* ignore */ }
}

function labelFor(facet, value) {
  const map = {
    color: `color.${value}`, weapon: `weapon.${value}`, move: `move.${value}`,
    category: `category.${value}`, gender: `gender.${value}`, blessing: `blessing.${value}`,
    poolRarity: value === 'na' ? 'poolRarity.na' : `poolRarity.${value}`,
  };
  return map[facet] ? state.t(map[facet]) : value;
}

function applyStaticI18n() {
  document.documentElement.lang = state.lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = state.t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-attr]')) {
    const [attr, key] = el.dataset.i18nAttr.split(':');
    el.setAttribute(attr, state.t(key));
  }
  $('#lang-toggle').textContent = state.t(state.lang === 'en' ? 'lang.fr' : 'lang.en');
}

function buildFilterControls() {
  const facets = buildFacetOptions(state.heroes);
  const box = $('#filters');
  box.innerHTML = '';
  for (const f of FACETS) {
    const sel = document.createElement('select');
    sel.dataset.facet = f;
    const any = document.createElement('option');
    any.value = '';
    any.textContent = `${state.t(`filter.${f}`)}: ${state.t('filter.any')}`;
    sel.appendChild(any);
    for (const v of facets[f]) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = f === 'origin' ? shortOrigin(v) : labelFor(f, v);
      if (state.filters[f] === v) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      state.filters[f] = sel.value || null;
      writePrefs();
      recompute();
    });
    box.appendChild(sel);
  }
}

function fallbackTile(hero) {
  const d = document.createElement('div');
  d.className = 'fallback';
  d.style.background = colorHex(hero.color);
  d.textContent = (hero.weapon || '?').slice(0, 2).toUpperCase();
  return d;
}

function portrait(hero, cls, srcs) {
  const list = srcs.slice();
  if (!list.length) return fallbackTile(hero);
  const img = document.createElement('img');
  img.className = cls;
  img.loading = 'lazy';
  img.alt = hero.name;
  img.src = list.shift();
  img.addEventListener('error', function onErr() {
    if (list.length) { img.src = list.shift(); return; }
    img.replaceWith(fallbackTile(hero));
  });
  return img;
}

function card(hero) {
  const el = document.createElement('article');
  el.className = 'card';
  el.style.setProperty('--card-accent', colorHex(hero.color));
  el.tabIndex = 0;

  const pip = document.createElement('span');
  pip.className = 'pip';
  pip.style.background = colorHex(hero.color);
  el.appendChild(pip);

  if (hero.category && hero.category !== 'standard') {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = state.t(`category.${hero.category}`);
    el.appendChild(b);
  }

  el.appendChild(portrait(hero, 'portrait', imageCandidates(hero)));

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = hero.name;
  el.appendChild(name);
  const ep = document.createElement('span');
  ep.className = 'epithet';
  ep.textContent = epithetFor(hero);
  el.appendChild(ep);

  const icons = document.createElement('div');
  icons.className = 'icons';
  for (const p of [classIconPath(hero), moveIconPath(hero)]) {
    if (!p) continue;
    const i = document.createElement('img');
    i.src = p; i.alt = ''; i.loading = 'lazy';
    icons.appendChild(i);
  }
  el.appendChild(icons);

  if (hero.poolRarity != null) {
    const r = document.createElement('span');
    r.className = 'rarity';
    r.textContent = `${hero.poolRarity}★`;
    el.appendChild(r);
  }

  const open = () => openDetail(hero);
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  return el;
}

function renderGridPage() {
  const grid = $('#grid');
  const slice = state.view.slice(state.shown, state.shown + PAGE);
  for (const hero of slice) grid.appendChild(card(hero));
  state.shown += slice.length;
}

function renderGroups() {
  const grid = $('#grid');
  grid.classList.add('grouped');
  for (const g of groupByPerson(state.view)) {
    const det = document.createElement('details');
    det.className = 'group-card';
    const sum = document.createElement('summary');
    const pips = document.createElement('span');
    pips.className = 'pips';
    for (const c of g.colors) {
      const i = document.createElement('i');
      i.style.background = colorHex(c);
      pips.appendChild(i);
    }
    sum.append(pips, ` ${g.person} `, `· ${state.t('group.alts', { n: g.heroes.length })}`);
    det.appendChild(sum);
    const sub = document.createElement('div');
    sub.className = 'sub-grid';
    for (const hero of g.heroes) sub.appendChild(card(hero));
    det.appendChild(sub);
    grid.appendChild(det);
  }
}

function recompute() {
  const filtered = applyFilters(state.heroes, state.filters, state.query);
  state.view = sortHeroes(filtered, state.sort);
  state.shown = 0;
  const grid = $('#grid');
  grid.innerHTML = '';
  grid.classList.toggle('grouped', state.group);
  $('#grid-count').textContent = state.t('grid.count', { n: state.view.length });
  if (!state.view.length) {
    grid.innerHTML = `<p class="grid-count">${state.t('grid.empty')}</p>`;
    return;
  }
  if (state.group) renderGroups();
  else renderGridPage();
}

function openDetail(hero) {
  const body = $('#detail-body');
  body.innerHTML = '';
  body.appendChild(portrait(hero, 'big', [hero.imageFull, hero.image].filter(Boolean)));
  const h = document.createElement('h2');
  h.textContent = hero.name;
  const ep = document.createElement('p');
  ep.className = 'epithet';
  ep.textContent = epithetFor(hero);
  body.append(h, ep);

  const dl = document.createElement('dl');
  const row = (key, val) => {
    if (!val) return;
    const dt = document.createElement('dt');
    dt.textContent = state.t(key);
    const dd = document.createElement('dd');
    dd.textContent = val;
    dl.append(dt, dd);
  };
  row('detail.origin', (hero.origins || []).map(shortOrigin).join(' · '));
  row('detail.released', hero.releaseDate);
  row('detail.blessing', hero.blessing ? state.t(`blessing.${hero.blessing}`) : '');
  row('detail.poolRarity', state.t(hero.poolRarity == null ? 'poolRarity.na' : `poolRarity.${hero.poolRarity}`));
  row('detail.artist', hero.artist);
  row('detail.actorEn', (hero.actorEn || []).join(', '));
  row('detail.actorJp', (hero.actorJp || []).join(', '));
  row('detail.properties', (hero.properties || []).join(', '));
  body.appendChild(dl);

  $('#detail').hidden = false;
}
function closeDetail() { $('#detail').hidden = true; }

function syncSortButtons() {
  const dim = state.sort.startsWith('name') ? 'name' : 'release';
  const dir = state.sort.endsWith('asc') ? 'asc' : 'desc';
  for (const btn of document.querySelectorAll('.sortbtn')) {
    const active = btn.dataset.sortkey === dim;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.dataset.dir = active ? (dir === 'asc' ? '▲' : '▼') : '';
  }
}
function onSortClick(dim) {
  const cur = state.sort;
  if (cur.startsWith(dim)) {
    state.sort = cur.endsWith('asc') ? `${dim}-desc` : `${dim}-asc`;
  } else {
    state.sort = dim === 'name' ? 'name-asc' : 'release-desc';
  }
  writePrefs();
  syncSortButtons();
  recompute();
}

function setLang(lang) {
  state.lang = lang;
  state.t = makeTranslator(state.dicts, lang);
  try { localStorage.setItem(LS_LANG, lang); } catch { /* ignore */ }
  applyStaticI18n();
  syncSortButtons();
  buildFilterControls();
  recompute();
}

async function main() {
  const [heroesRes, enRes, frRes] = await Promise.all([
    fetch('data/heroes.json'), fetch('i18n/en.json'), fetch('i18n/fr.json'),
  ]);
  const catalog = await heroesRes.json();
  state.heroes = catalog.heroes || [];
  state.dicts = { en: await enRes.json(), fr: await frRes.json() };

  readPrefs();
  let stored = null;
  try { stored = localStorage.getItem(LS_LANG); } catch { /* ignore */ }
  state.lang = resolveLang(stored, navigator.languages || [navigator.language], SUPPORTED);
  state.t = makeTranslator(state.dicts, state.lang);

  $('#search').value = state.query;
  $('#group-toggle').checked = state.group;

  applyStaticI18n();
  syncSortButtons();
  buildFilterControls();
  recompute();

  $('#lang-toggle').addEventListener('click', () => setLang(state.lang === 'en' ? 'fr' : 'en'));
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; writePrefs(); recompute(); });
  $('#sort-date').addEventListener('click', () => onSortClick('release'));
  $('#sort-name').addEventListener('click', () => onSortClick('name'));
  $('#group-toggle').addEventListener('change', (e) => { state.group = e.target.checked; writePrefs(); recompute(); });
  $('#filter-reset').addEventListener('click', () => {
    for (const f of FACETS) state.filters[f] = null;
    state.query = '';
    $('#search').value = '';
    for (const sel of document.querySelectorAll('#filters select')) sel.value = '';
    writePrefs();
    recompute();
  });
  $('#detail-close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

  const sentinel = document.getElementById('load-more-sentinel');
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.group && state.shown < state.view.length) renderGridPage();
  }, { rootMargin: '600px' }).observe(sentinel);
}

main();
