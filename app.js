// app.js — câblage DOM du catalogue (lecture seule). Module ES, chemins relatifs.
import { resolveLang, makeTranslator } from './js/i18n.mjs';
import {
  colorHex, classIconPath, moveIconPath, imageCandidates, shortOrigin, displayRarity,
} from './js/hero-media.mjs';
import { buildFacetOptions, applyFilters, sortHeroes, groupByPerson } from './js/catalog-view.mjs';
import {
  migrateCollection, emptyCollection, setOwned, setSupport, clampMerges,
  ownedIdSet, collectionStats, filterByStatus,
} from './js/collection.mjs';

const SUPPORTED = ['en', 'fr'];
const FACETS = ['color', 'weapon', 'move', 'category', 'origin', 'gender', 'blessing', 'poolRarity'];
const PAGE = 60;
const LS_LANG = 'feh-lang';
const LS_PREFS = 'feh-catalog-prefs';
const LS_THEME = 'feh-theme';
const LS_COLLECTION = 'feh-collection-v1';
const LS_VIEW = 'feh-view';
const VIEWS = ['catalogue', 'caserne', 'stats', 'wishlist', 'manuels'];

const $ = (sel) => document.querySelector(sel);
const state = {
  heroes: [], dicts: {}, lang: 'en', t: (k) => k,
  filters: Object.fromEntries(FACETS.map((f) => [f, null])),
  query: '', sort: 'release-desc', group: false,
  list: [], shown: 0, view: 'catalogue',
  collection: emptyCollection(), status: 'all',
};

function loadCollection() {
  try {
    const raw = localStorage.getItem(LS_COLLECTION);
    state.collection = migrateCollection(raw ? JSON.parse(raw) : null);
  } catch { state.collection = emptyCollection(); }
}
function saveCollection() {
  try { localStorage.setItem(LS_COLLECTION, JSON.stringify(state.collection)); } catch { /* ignore */ }
}
function isOwned(id) { return !!state.collection.owned[id]; }
function updateCollectionCount() {
  const s = collectionStats(state.collection, state.heroes);
  $('#collection-count').textContent = state.t('collection.count', s);
}

function epithetFor(hero) {
  return state.lang === 'fr' && hero.titleFr ? hero.titleFr : hero.title;
}

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_PREFS) || '{}');
    if (p && typeof p === 'object') {
      Object.assign(state.filters, p.filters || {});
      for (const f of FACETS) {
        if (state.filters[f] === '') state.filters[f] = null;
      }
      if (typeof p.query === 'string') state.query = p.query;
      if (p.sort) state.sort = p.sort;
      state.group = !!p.group;
      if (['all', 'owned', 'missing'].includes(p.status)) state.status = p.status;
    }
  } catch { /* ignore */ }
}
function writePrefs() {
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify({
      filters: state.filters, query: state.query, sort: state.sort, group: state.group,
      status: state.status,
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

function effectiveDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyThemeButton() {
  const dark = effectiveDark();
  const btn = $('#theme-toggle');
  btn.textContent = dark ? '☀️' : '🌙';
  btn.setAttribute('aria-label', state.t(dark ? 'theme.toLight' : 'theme.toDark'));
  btn.title = btn.getAttribute('aria-label');
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
      syncFilterControls();
      writePrefs();
      recompute();
    });
    box.appendChild(sel);
  }
  syncFilterControls();
}

function syncFilterControls() {
  for (const sel of document.querySelectorAll('#filters select')) {
    sel.classList.toggle('is-active', sel.value !== '');
  }
}

function hasActiveControls() {
  return FACETS.some((f) => state.filters[f])
    || state.query !== ''
    || state.sort !== 'release-desc'
    || state.group
    || state.status !== 'all';
}
function syncResetButton() {
  $('#filter-reset').hidden = !hasActiveControls();
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
  el.dataset.id = hero.id;
  el.classList.toggle('is-owned', isOwned(hero.id));
  el.classList.toggle('is-missing', !isOwned(hero.id) && state.status !== 'owned');
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

  const rarity = displayRarity(hero);
  if (rarity != null) {
    const r = document.createElement('span');
    r.className = 'rarity';
    r.textContent = `${rarity}★`;
    el.appendChild(r);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'card-add';
  const syncAdd = () => {
    const owned = isOwned(hero.id);
    add.textContent = owned ? '✓' : '+';
    add.setAttribute('aria-label', state.t(owned ? 'card.remove' : 'card.add'));
    add.title = add.getAttribute('aria-label');
  };
  syncAdd();
  add.addEventListener('click', (e) => {
    e.stopPropagation();
    state.collection = setOwned(state.collection, hero.id, !isOwned(hero.id));
    saveCollection();
    refreshCard(hero.id);
    syncAdd();
    updateCollectionCount();
  });
  el.appendChild(add);

  const open = () => openDetail(hero);
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  return el;
}

function refreshCard(id) {
  for (const el of document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"]`)) {
    el.classList.toggle('is-owned', isOwned(id));
    el.classList.toggle('is-missing', !isOwned(id) && state.status !== 'owned');
  }
}

function renderGridPage() {
  const grid = $('#grid');
  const slice = state.list.slice(state.shown, state.shown + PAGE);
  for (const hero of slice) grid.appendChild(card(hero));
  state.shown += slice.length;
}

function renderGroups() {
  const grid = $('#grid');
  grid.classList.add('grouped');
  for (const g of groupByPerson(state.list)) {
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
  syncResetButton();
  const filtered = applyFilters(state.heroes, state.filters, state.query);
  state.list = sortHeroes(filtered, state.sort);
  state.list = filterByStatus(state.list, ownedIdSet(state.collection), state.status);
  state.shown = 0;
  const grid = $('#grid');
  grid.innerHTML = '';
  grid.classList.toggle('grouped', state.group);
  $('#grid-count').textContent = state.t('grid.count', { n: state.list.length });
  if (!state.list.length) {
    grid.innerHTML = `<p class="grid-count">${state.t('grid.empty')}</p>`;
    return;
  }
  if (state.group) renderGroups();
  else renderGridPage();
}

function currentHashView() {
  const m = /^#\/([a-z]+)/.exec(location.hash);
  return m && VIEWS.includes(m[1]) ? m[1] : null;
}

function renderView() {
  const v = state.view;
  for (const sec of document.querySelectorAll('.view')) sec.hidden = sec.dataset.view !== v;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', tab.dataset.view === v ? 'true' : 'false');
  }
  if (v === 'catalogue') recompute();
  else if (v === 'caserne') renderCaserne();
  else if (v === 'stats') renderStats();
  else if (v === 'wishlist') renderWishlist();
  else if (v === 'manuels') renderManuels();
}

function setView(v, { push = true } = {}) {
  state.view = VIEWS.includes(v) ? v : 'catalogue';
  try { localStorage.setItem(LS_VIEW, state.view); } catch { /* ignore */ }
  if (push && location.hash !== `#/${state.view}`) location.hash = `#/${state.view}`;
  renderView();
}

function renderCaserne() { $('#view-caserne').innerHTML = ''; }
function renderStats() { $('#view-stats').innerHTML = ''; }
function renderWishlist() { $('#view-wishlist').innerHTML = ''; }
function renderManuels() { $('#view-manuels').innerHTML = ''; }

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

  const ed = document.createElement('div');
  ed.className = 'editor';
  const ownedRow = document.createElement('label');
  ownedRow.className = 'owned-row';
  const ownedCb = document.createElement('input');
  ownedCb.type = 'checkbox';
  ownedCb.checked = isOwned(hero.id);
  const ownedTxt = document.createElement('span');
  ownedTxt.textContent = state.t('field.owned');
  ownedRow.append(ownedCb, ownedTxt);
  ed.appendChild(ownedRow);
  ownedCb.addEventListener('change', () => {
    state.collection = setOwned(state.collection, hero.id, ownedCb.checked);
    saveCollection();
    refreshCard(hero.id);
    updateCollectionCount();
    openDetail(hero); // re-render l'éditeur
  });

  if (isOwned(hero.id)) {
    const entry = state.collection.owned[hero.id];
    const addRow = (key, node) => {
      const l = document.createElement('label');
      l.textContent = state.t(key);
      ed.append(l, node);
    };
    const merges = document.createElement('input');
    merges.type = 'number'; merges.min = '0'; merges.max = '10'; merges.value = String(entry.merges);
    merges.addEventListener('change', () => {
      const v = clampMerges(merges.value);
      merges.value = String(v);
      state.collection.owned[hero.id] = { ...state.collection.owned[hero.id], merges: v };
      state.collection.updated = new Date().toISOString().slice(0, 10);
      saveCollection();
    });
    addRow('field.merges', merges);

    const ivSelect = (cur, onChange) => {
      const s = document.createElement('select');
      for (const v of ['none', 'hp', 'atk', 'spd', 'def', 'res']) {
        const o = document.createElement('option');
        o.value = v === 'none' ? '' : v;
        o.textContent = state.t(`iv.${v}`);
        if ((cur ?? '') === o.value) o.selected = true;
        s.appendChild(o);
      }
      s.addEventListener('change', () => onChange(s.value || null));
      return s;
    };
    addRow('field.ivPlus', ivSelect(entry.ivPlus, (v) => {
      state.collection.owned[hero.id] = { ...state.collection.owned[hero.id], ivPlus: v };
      state.collection.updated = new Date().toISOString().slice(0, 10);
      saveCollection();
    }));
    addRow('field.ivMinus', ivSelect(entry.ivMinus, (v) => {
      state.collection.owned[hero.id] = { ...state.collection.owned[hero.id], ivMinus: v };
      state.collection.updated = new Date().toISOString().slice(0, 10);
      saveCollection();
    }));

    const sup = document.createElement('select');
    for (const v of ['none', 'C', 'B', 'A', 'S']) {
      const o = document.createElement('option');
      o.value = v === 'none' ? '' : v;
      o.textContent = state.t(`support.${v}`);
      if ((entry.support ?? '') === o.value) o.selected = true;
      sup.appendChild(o);
    }
    sup.addEventListener('change', () => {
      state.collection = setSupport(state.collection, hero.id, sup.value || null);
      saveCollection();
    });
    addRow('field.support', sup);
  }

  body.appendChild(ed);

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
  updateCollectionCount();
  applyThemeButton();
  syncSortButtons();
  buildFilterControls();
  recompute();
  renderView();
}

async function main() {
  const [heroesRes, enRes, frRes] = await Promise.all([
    fetch('data/heroes.json'), fetch('i18n/en.json'), fetch('i18n/fr.json'),
  ]);
  const catalog = await heroesRes.json();
  state.heroes = catalog.heroes || [];
  state.dicts = { en: await enRes.json(), fr: await frRes.json() };

  readPrefs();
  loadCollection();
  let stored = null;
  try { stored = localStorage.getItem(LS_LANG); } catch { /* ignore */ }
  state.lang = resolveLang(stored, navigator.languages || [navigator.language], SUPPORTED);
  state.t = makeTranslator(state.dicts, state.lang);

  let storedTheme = null;
  try { storedTheme = localStorage.getItem(LS_THEME); } catch { /* ignore */ }
  if (storedTheme === 'dark' || storedTheme === 'light') document.documentElement.dataset.theme = storedTheme;

  $('#search').value = state.query;
  $('#group-toggle').checked = state.group;

  applyStaticI18n();
  updateCollectionCount();
  applyThemeButton();
  syncSortButtons();
  buildFilterControls();

  let startView = currentHashView();
  if (!startView) { try { startView = localStorage.getItem(LS_VIEW); } catch { /* ignore */ } }
  setView(VIEWS.includes(startView) ? startView : 'catalogue', { push: false });
  window.addEventListener('hashchange', () => setView(currentHashView() || 'catalogue', { push: false }));
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  }

  $('#lang-toggle').addEventListener('click', () => setLang(state.lang === 'en' ? 'fr' : 'en'));
  $('#theme-toggle').addEventListener('click', () => {
    const next = effectiveDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(LS_THEME, next); } catch { /* ignore */ }
    applyThemeButton();
  });
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; writePrefs(); recompute(); });
  $('#sort-date').addEventListener('click', () => onSortClick('release'));
  $('#sort-name').addEventListener('click', () => onSortClick('name'));
  $('#group-toggle').addEventListener('change', (e) => { state.group = e.target.checked; writePrefs(); recompute(); });
  $('#status-filter').value = state.status;
  $('#status-filter').addEventListener('change', (e) => {
    state.status = e.target.value;
    writePrefs();
    recompute();
  });
  $('#filter-reset').addEventListener('click', () => {
    for (const f of FACETS) state.filters[f] = null;
    state.query = '';
    state.sort = 'release-desc';
    state.group = false;
    state.status = 'all';
    $('#status-filter').value = 'all';
    $('#search').value = '';
    $('#group-toggle').checked = false;
    for (const sel of document.querySelectorAll('#filters select')) sel.value = '';
    syncFilterControls();
    syncSortButtons();
    writePrefs();
    recompute();
  });
  $('#detail-close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

  $('#export-btn').addEventListener('click', () => {
    const out = { ...state.collection, updated: new Date().toISOString().slice(0, 10) };
    const blob = new Blob([`${JSON.stringify(out, null, 2)}\n`], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ma-collection.json';
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  });

  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let incoming;
    try {
      incoming = migrateCollection(JSON.parse(await file.text()));
    } catch { alert(state.t('import.error')); return; }
    const merge = window.confirm(`${state.t('import.mode')}\n\nOK = ${state.t('import.merge')} / Annuler = ${state.t('import.replace')}`);
    if (merge) {
      state.collection = migrateCollection({
        ...state.collection,
        owned: { ...state.collection.owned, ...incoming.owned },
      });
    } else {
      state.collection = incoming;
    }
    saveCollection();
    const catalogIds = new Set(state.heroes.map((h) => h.id));
    const unknown = Object.keys(state.collection.owned).filter((id) => !catalogIds.has(id)).length;
    if (unknown) alert(state.t('import.unknown', { n: unknown }));
    // re-render tout
    for (const el of document.querySelectorAll('.card')) {
      const id = el.dataset.id;
      el.classList.toggle('is-owned', isOwned(id));
      el.classList.toggle('is-missing', !isOwned(id) && state.status !== 'owned');
    }
    updateCollectionCount();
    recompute();
  });

  const sentinel = document.getElementById('load-more-sentinel');
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.group && state.shown < state.list.length) renderGridPage();
  }, { rootMargin: '600px' }).observe(sentinel);
}

main();
