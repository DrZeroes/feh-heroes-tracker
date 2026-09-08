// app.js — câblage DOM du catalogue (lecture seule). Module ES, chemins relatifs.
import { resolveLang, makeTranslator } from './js/i18n.mjs';
import {
  colorHex, classIconPath, moveIconPath, imageCandidates, shortOrigin, displayRarity,
} from './js/hero-media.mjs';
import {
  buildFacetOptions, applyFilters, sortHeroes, groupByPerson, orderedBy, poolTier,
  CATEGORY_ORDER, BLESSING_ORDER, COLOR_ORDER, WEAPON_ORDER, MOVE_ORDER,
} from './js/catalog-view.mjs';
import {
  migrateCollection, emptyCollection, setOwned, setSupport, clampMerges,
  ownedIdSet, collectionStats, filterByStatus,
  addUnit, removeUnit, setUnit, setWanted, wantedIdSet,
  setManualCount, manualsTotal,
  setWantedPriority, setWantedNote, setProject,
} from './js/collection.mjs';
import {
  distribution, acquisitionTimeline, topCopies, wishlistSummary,
  wishlistByPriority, projectProgress,
} from './js/stats.mjs';

const SUPPORTED = ['en', 'fr'];
const FACETS = ['color', 'weapon', 'move', 'category', 'origin', 'gender', 'blessing', 'poolRarity'];
const PAGE = 60;
const LS_LANG = 'feh-lang';
const LS_PREFS = 'feh-catalog-prefs';
const LS_THEME = 'feh-theme';
const LS_COLLECTION = 'feh-collection-v1';
const LS_VIEW = 'feh-view';
const VIEWS = ['catalogue', 'caserne', 'new', 'stats', 'wishlist', 'manuels', 'about'];
const STATUSES = ['all', 'owned', 'missing', 'wanted'];
const GH_REPO = 'DrZeroes/feh-heroes-tracker';
const APP_VERSION = '0.3.0';

const $ = (sel) => document.querySelector(sel);
const quickActive = () => state.quickAdd && state.view === 'catalogue';
const state = {
  heroes: [], dicts: {}, lang: 'en', t: (k) => k,
  filters: Object.fromEntries(FACETS.map((f) => [f, null])),
  query: '', sort: 'release-desc', group: false, quickAdd: false,
  list: [], shown: 0, view: 'catalogue',
  collection: emptyCollection(), status: 'all', wishMissingOnly: false,
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
      state.quickAdd = !!p.quickAdd;
      if (STATUSES.includes(p.status)) state.status = p.status;
    }
  } catch { /* ignore */ }
}
function writePrefs() {
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify({
      filters: state.filters, query: state.query, sort: state.sort, group: state.group,
      status: state.status, quickAdd: state.quickAdd,
    }));
  } catch { /* ignore */ }
}

function labelFor(facet, value) {
  const map = {
    color: `color.${value}`, weapon: `weapon.${value}`, move: `move.${value}`,
    category: `category.${value}`, gender: `gender.${value}`, blessing: `blessing.${value}`,
    poolRarity: `poolRarity.${value}`,
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
  const n = FACETS.filter((f) => state.filters[f]).length;
  const panel = $('#filter-panel');
  const badge = $('#filter-count');
  if (panel) panel.classList.toggle('is-active', n > 0);
  if (badge) {
    badge.hidden = n === 0;
    badge.textContent = n ? String(n) : '';
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
  el.classList.toggle('is-wanted', wantedIdSet(state.collection).has(hero.id));
  el.style.setProperty('--card-accent', colorHex(hero.color));
  el.tabIndex = 0;

  const pip = document.createElement('span');
  pip.className = 'pip';
  pip.style.background = colorHex(hero.color);
  el.appendChild(pip);

  const star = document.createElement('span');
  star.className = 'card-star';
  star.textContent = '★';
  star.title = state.t('card.wanted');
  star.hidden = !wantedIdSet(state.collection).has(hero.id);
  el.appendChild(star);

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
  add.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOwned(hero.id);
  });
  el.appendChild(add);

  const mrg = document.createElement('div');
  mrg.className = 'card-merges';
  mrg.hidden = !(quickActive() && isOwned(hero.id));
  mrg.addEventListener('click', (e) => e.stopPropagation());
  const mInput = document.createElement('input');
  mInput.type = 'number'; mInput.min = '0'; mInput.max = '10';
  mInput.value = String(state.collection.owned[hero.id]?.[0]?.merges ?? 0);
  mInput.addEventListener('change', (e) => {
    e.stopPropagation();
    const v = clampMerges(mInput.value);
    mInput.value = String(v);
    if (state.collection.owned[hero.id]) {
      state.collection = setUnit(state.collection, hero.id, 0, { merges: v });
      saveCollection();
    }
  });
  mrg.append('+', mInput);
  el.appendChild(mrg);

  syncCardControls(el, hero.id);

  const open = () => (quickActive() ? toggleOwned(hero.id) : openDetail(hero));
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  return el;
}

function toggleOwned(id) {
  const next = !isOwned(id);
  state.collection = setOwned(state.collection, id, next);
  saveCollection();
  updateCollectionCount();
  if (state.view === 'catalogue' && (state.status === 'owned' || state.status === 'missing')) {
    recompute();
  } else {
    refreshCard(id);
  }
}

function syncCardControls(el, id) {
  const owned = isOwned(id);
  const wanted = wantedIdSet(state.collection).has(id);
  el.classList.toggle('is-owned', owned);
  el.classList.toggle('is-missing', !owned && state.status !== 'owned');
  el.classList.toggle('is-wanted', wanted);
  const add = el.querySelector('.card-add');
  if (add) {
    add.textContent = owned ? '✓' : '+';
    add.setAttribute('aria-label', state.t(owned ? 'card.remove' : 'card.add'));
    add.title = add.getAttribute('aria-label');
  }
  const star = el.querySelector('.card-star');
  if (star) star.hidden = !wanted;
  const mrg = el.querySelector('.card-merges');
  if (mrg) {
    mrg.hidden = !(quickActive() && owned);
    const input = mrg.querySelector('input');
    if (input) input.value = String(state.collection.owned[id]?.[0]?.merges ?? 0);
  }
}

function refreshCard(id) {
  for (const el of document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"]`)) {
    syncCardControls(el, id);
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
  if (state.status === 'wanted') {
    const w = wantedIdSet(state.collection);
    state.list = state.list.filter((h) => w.has(h.id));
  } else {
    state.list = filterByStatus(state.list, ownedIdSet(state.collection), state.status);
  }
  state.shown = 0;
  const grid = $('#grid');
  grid.innerHTML = '';
  grid.classList.toggle('grouped', state.group);
  grid.classList.toggle('quick', state.quickAdd);
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
  else if (v === 'new') renderNew();
  else if (v === 'stats') renderStats();
  else if (v === 'wishlist') renderWishlist();
  else if (v === 'manuels') renderManuels();
  else if (v === 'about') renderAbout();
}

function setView(v, { push = true } = {}) {
  state.view = VIEWS.includes(v) ? v : 'catalogue';
  try { localStorage.setItem(LS_VIEW, state.view); } catch { /* ignore */ }
  if (push && location.hash !== `#/${state.view}`) location.hash = `#/${state.view}`;
  renderView();
}

function ivOptions(sel, cur) {
  for (const v of ['none', 'hp', 'atk', 'spd', 'def', 'res']) {
    const o = document.createElement('option');
    o.value = v === 'none' ? '' : v;
    o.textContent = state.t(`iv.${v}`);
    if ((cur ?? '') === o.value) o.selected = true;
    sel.appendChild(o);
  }
}

function renderCaserne() {
  const box = $('#view-caserne');
  box.innerHTML = '';
  const ids = Object.keys(state.collection.owned);
  const heroesById = new Map(state.heroes.map((h) => [h.id, h]));
  const list = sortHeroes(ids.map((id) => heroesById.get(id)).filter(Boolean), 'release-desc');
  if (!list.length) {
    box.innerHTML = `<p class="empty-note">${state.t('caserne.empty')}</p>`;
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'roster';

  const head = document.createElement('div');
  head.className = 'roster-row roster-head';
  for (const label of [
    '', state.t('caserne.colHero'), state.t('field.merges'),
    state.t('field.ivPlus'), state.t('field.ivMinus'), state.t('field.support'), '',
  ]) {
    const c = document.createElement('span');
    c.textContent = label;
    head.appendChild(c);
  }
  wrap.appendChild(head);

  const commit = (rerender) => {
    saveCollection();
    if (rerender) renderCaserne();
  };

  for (const hero of list) {
    const units = state.collection.owned[hero.id];
    units.forEach((unit, idx) => {
      const row = document.createElement('div');
      row.className = 'roster-row';

      const img = document.createElement('img');
      img.loading = 'lazy'; img.alt = hero.name; img.src = hero.image || '';
      img.className = 'roster-portrait';
      img.title = epithetFor(hero);
      img.addEventListener('click', () => openDetail(hero, idx));
      if (idx > 0) img.style.visibility = 'hidden';
      row.appendChild(img);

      const who = document.createElement('button');
      who.type = 'button';
      who.className = 'who';
      who.innerHTML = '<b></b><span></span>';
      who.querySelector('b').textContent = units.length > 1 ? `${hero.name} #${idx + 1}` : hero.name;
      who.querySelector('span').textContent = epithetFor(hero);
      who.addEventListener('click', () => openDetail(hero, idx));
      row.appendChild(who);

      const merges = document.createElement('input');
      merges.type = 'number'; merges.min = '0'; merges.max = '10'; merges.value = String(unit.merges);
      merges.addEventListener('change', () => {
        merges.value = String(clampMerges(merges.value));
        state.collection = setUnit(state.collection, hero.id, idx, { merges: merges.value });
        commit(false);
      });
      row.appendChild(merges);

      const ivP = document.createElement('select');
      ivOptions(ivP, unit.ivPlus);
      ivP.addEventListener('change', () => {
        state.collection = setUnit(state.collection, hero.id, idx, { ivPlus: ivP.value || null });
        commit(false);
      });
      row.appendChild(ivP);

      const ivM = document.createElement('select');
      ivOptions(ivM, unit.ivMinus);
      ivM.addEventListener('change', () => {
        state.collection = setUnit(state.collection, hero.id, idx, { ivMinus: ivM.value || null });
        commit(false);
      });
      row.appendChild(ivM);

      const sup = document.createElement('select');
      for (const v of ['none', 'C', 'B', 'A', 'S']) {
        const o = document.createElement('option');
        o.value = v === 'none' ? '' : v;
        o.textContent = state.t(`support.${v}`);
        if ((unit.support ?? '') === o.value) o.selected = true;
        sup.appendChild(o);
      }
      sup.addEventListener('change', () => {
        state.collection = setSupport(state.collection, hero.id, idx, sup.value || null);
        commit(true); // règle un-seul-S : d'autres lignes peuvent changer
      });
      row.appendChild(sup);

      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'roster-remove';
      rm.textContent = '✕';
      rm.title = state.t('caserne.remove');
      rm.setAttribute('aria-label', state.t('caserne.remove'));
      rm.addEventListener('click', () => {
        const last = units.length === 1;
        if (last && !window.confirm(state.t('caserne.removeConfirm', { name: hero.name }))) return;
        state.collection = removeUnit(state.collection, hero.id, idx);
        if (last) refreshCard(hero.id);
        updateCollectionCount();
        commit(true);
      });
      row.appendChild(rm);

      wrap.appendChild(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'roster-add';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = `＋ ${state.t('caserne.addCopy')}`;
    addBtn.addEventListener('click', () => {
      state.collection = addUnit(state.collection, hero.id);
      updateCollectionCount();
      commit(true);
    });
    addRow.appendChild(addBtn);
    wrap.appendChild(addRow);
  }
  box.appendChild(wrap);
}
// rows: { label, owned, total }  -> jauge de complétion (pleine à 100 % = owned === total)
//       { label, count }          -> barre relative au max du bloc
function barBlock(titleKey, rows) {
  const b = document.createElement('div');
  b.className = 'stat-block';
  const h = document.createElement('h3');
  h.textContent = state.t(titleKey);
  b.appendChild(h);
  const max = Math.max(1, ...rows.map((r) => r.count ?? 0));
  for (const r of rows) {
    const ratio = r.owned != null
      ? (r.total ? r.owned / r.total : 0)
      : (r.count ?? 0) / max;
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    const row = document.createElement('div');
    row.className = 'bar-row';
    const label = document.createElement('span');
    label.textContent = r.label;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = `${pct}%`;
    if (r.owned != null && r.total && r.owned >= r.total) fill.classList.add('done');
    bar.appendChild(fill);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = r.owned != null ? `${r.owned} / ${r.total}` : String(r.count ?? 0);
    row.append(label, bar, num);
    b.appendChild(row);
  }
  return b;
}

function renderStats() {
  const box = $('#view-stats');
  box.innerHTML = '';
  const ownedSet = ownedIdSet(state.collection);
  const s = collectionStats(state.collection, state.heroes);

  const head = document.createElement('p');
  head.className = 'stat-block';
  head.style.fontWeight = '700';
  head.textContent = state.t('stats.total', s);
  if (s.units > s.owned) {
    const u = document.createElement('span');
    u.style.cssText = 'font-weight:400;color:var(--muted)';
    u.textContent = ` · ${state.t('stats.units', { n: s.units })}`;
    head.appendChild(u);
  }
  box.appendChild(head);

  const FACET_ORDER = {
    color: COLOR_ORDER, weapon: WEAPON_ORDER, move: MOVE_ORDER,
    category: CATEGORY_ORDER, blessing: BLESSING_ORDER,
  };

  for (const [key, titleKey] of [
    ['color', 'stats.byColor'], ['weapon', 'stats.byWeapon'], ['move', 'stats.byMove'],
    ['category', 'stats.byCategory'], ['blessing', 'stats.byBlessing'],
  ]) {
    const dist = distribution(state.heroes, ownedSet, key);
    const ordered = orderedBy(dist.map((d) => d.value), FACET_ORDER[key]);
    const byValue = new Map(dist.map((d) => [d.value, d]));
    const rows = ordered.map((v) => {
      const d = byValue.get(v);
      return { label: state.t(`${key}.${v}`), total: d.total, owned: d.owned };
    });
    if (rows.length) box.appendChild(barBlock(titleKey, rows));
  }

  const tl = acquisitionTimeline(state.collection).map((m) => ({ label: m.month, count: m.count }));
  if (tl.length) box.appendChild(barBlock('stats.timeline', tl));

  const tc = topCopies(state.collection, state.heroes, 10)
    .map((h) => ({ label: `${h.name}${h.title ? ` (${h.title})` : ''}`, count: h.copies }));
  if (tc.length) box.appendChild(barBlock('stats.topCopies', tc));

  const pp = projectProgress(state.collection, state.heroes);
  if (pp.length) {
    const rows = pp.map((p) => ({
      label: p.targetIvPlus
        ? `${p.name} · ${state.t('project.ivReminder', { iv: state.t(`iv.${p.targetIvPlus}`) })}`
        : p.name,
      owned: p.merges,
      total: p.targetMerges,
    }));
    box.appendChild(barBlock('stats.projects', rows));
  }

  const w = wishlistSummary(state.collection, ownedSet);
  const wl = document.createElement('p');
  wl.className = 'stat-block';
  wl.textContent = state.t('stats.wishlistLine', w);
  box.appendChild(wl);

  const wbp = wishlistByPriority(state.collection, ownedSet);
  if (w.total) {
    const missWord = state.t('wishlist.missing').toLowerCase();
    const wl2 = document.createElement('p');
    wl2.className = 'stat-block';
    wl2.style.color = 'var(--muted)';
    wl2.textContent = `${state.t('stats.wishlistByPriority')} : `
      + `${state.t('priority.high')}: ${wbp.high.total} (${wbp.high.missing} ${missWord}) · `
      + `${state.t('priority.normal')}: ${wbp.normal.total} (${wbp.normal.missing} ${missWord})`;
    box.appendChild(wl2);
  }
}
const PRIO_RANK = { high: 0, normal: 1 };

function renderWishlist() {
  const box = $('#view-wishlist');
  box.innerHTML = '';
  const ids = [...wantedIdSet(state.collection)];
  if (!ids.length) {
    box.innerHTML = `<p class="empty-note">${state.t('wishlist.empty')}</p>`;
    return;
  }
  const ownedSet = ownedIdSet(state.collection);
  const heroesById = new Map(state.heroes.map((h) => [h.id, h]));

  const bar = document.createElement('label');
  bar.className = 'status wishlist-bar';
  const only = document.createElement('input');
  only.type = 'checkbox';
  only.checked = state.wishMissingOnly;
  only.addEventListener('change', () => { state.wishMissingOnly = only.checked; renderWishlist(); });
  bar.append(only, document.createTextNode(` ${state.t('wishlist.missingOnly')}`));
  box.appendChild(bar);

  let list = ids
    .map((id) => ({ id, hero: heroesById.get(id), w: state.collection.wanted[id] }))
    .filter((x) => x.hero);
  if (state.wishMissingOnly) list = list.filter((x) => !ownedSet.has(x.id));
  list.sort((a, b) => (
    (PRIO_RANK[a.w.priority] ?? 1) - (PRIO_RANK[b.w.priority] ?? 1)
    || String(b.hero.releaseDate || '').localeCompare(String(a.hero.releaseDate || ''))
  ));

  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = state.t('wishlist.empty');
    box.appendChild(p);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'wishlist';
  for (const { id, hero, w } of list) {
    const isOwn = ownedSet.has(id);
    const row = document.createElement('div');
    row.className = 'wish-row';
    row.classList.toggle('is-owned', isOwn);

    const img = document.createElement('img');
    img.loading = 'lazy'; img.alt = hero.name; img.src = hero.image || '';
    img.className = 'roster-portrait';
    img.addEventListener('click', () => openDetail(hero));
    row.appendChild(img);

    const who = document.createElement('button');
    who.type = 'button';
    who.className = 'who';
    who.innerHTML = '<b></b><span></span>';
    who.querySelector('b').textContent = hero.name;
    who.querySelector('span').textContent = epithetFor(hero);
    who.addEventListener('click', () => openDetail(hero));
    row.appendChild(who);

    const st = document.createElement('span');
    st.className = `wish-status ${isOwn ? 'ok' : 'ko'}`;
    st.textContent = state.t(isOwn ? 'wishlist.owned' : 'wishlist.missing');
    row.appendChild(st);

    const prio = document.createElement('select');
    for (const p of ['high', 'normal']) {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = state.t(`priority.${p}`);
      if (w.priority === p) o.selected = true;
      prio.appendChild(o);
    }
    prio.addEventListener('change', () => {
      state.collection = setWantedPriority(state.collection, id, prio.value);
      saveCollection();
      renderWishlist();
    });
    row.appendChild(prio);

    const note = document.createElement('input');
    note.type = 'text';
    note.value = w.note || '';
    note.placeholder = state.t('wishlist.notePlaceholder');
    note.addEventListener('change', () => {
      state.collection = setWantedNote(state.collection, id, note.value);
      saveCollection();
    });
    row.appendChild(note);

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'roster-remove';
    rm.textContent = '✕';
    rm.title = state.t('wishlist.remove');
    rm.setAttribute('aria-label', state.t('wishlist.remove'));
    rm.addEventListener('click', () => {
      state.collection = setWanted(state.collection, id, false);
      saveCollection();
      refreshCard(id);
      renderWishlist();
    });
    row.appendChild(rm);

    wrap.appendChild(row);
  }
  box.appendChild(wrap);
}

function renderNew() {
  const box = $('#view-new');
  box.innerHTML = '';
  const intro = document.createElement('p');
  intro.className = 'grid-count';
  intro.style.margin = '.75rem 1rem 0';
  intro.textContent = state.t('new.intro');
  box.appendChild(intro);
  const list = sortHeroes(state.heroes, 'release-desc').slice(0, 30);
  const grid = document.createElement('main');
  grid.className = 'grid';
  for (const hero of list) grid.appendChild(card(hero));
  box.appendChild(grid);
}
function renderManuels() {
  const box = $('#view-manuels');
  box.innerHTML = '';

  const total = document.createElement('p');
  total.className = 'stat-block';
  total.style.fontWeight = '700';
  total.textContent = state.t('manuels.total', { n: manualsTotal(state.collection) });
  box.appendChild(total);

  // ajout : datalist sur le catalogue
  const addWrap = document.createElement('div');
  addWrap.className = 'manual-add';
  const input = document.createElement('input');
  input.setAttribute('list', 'manual-hero-list');
  input.placeholder = state.t('manuels.add');
  const dl = document.createElement('datalist');
  dl.id = 'manual-hero-list';
  for (const h of state.heroes) {
    const o = document.createElement('option');
    o.value = `${h.name} · ${h.title}`;
    o.dataset.id = h.id;
    dl.appendChild(o);
  }
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => {
    const opt = [...dl.children].find((o) => o.value === input.value);
    if (!opt) return;
    const id = opt.dataset.id;
    state.collection = setManualCount(state.collection, id, (state.collection.manuals[id] || 0) + 1);
    saveCollection();
    input.value = '';
    renderManuels();
  });
  addWrap.append(input, dl, document.createElement('span'), addBtn);
  box.appendChild(addWrap);

  const entries = Object.entries(state.collection.manuals);
  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = state.t('manuels.empty');
    box.appendChild(p);
    return;
  }
  const heroesById = new Map(state.heroes.map((h) => [h.id, h]));
  entries.sort((a, b) => (heroesById.get(a[0])?.name || a[0]).localeCompare(heroesById.get(b[0])?.name || b[0]));
  for (const [id, n] of entries) {
    const h = heroesById.get(id) || { name: id, title: '' };
    const row = document.createElement('div');
    row.className = 'manual-row';

    const img = document.createElement('img');
    img.className = 'roster-portrait';
    img.loading = 'lazy'; img.alt = h.name; img.src = h.image || '';
    if (heroesById.has(id)) img.addEventListener('click', () => openDetail(h));
    row.appendChild(img);

    const icons = document.createElement('div');
    icons.className = 'manual-icons';
    for (const p of [moveIconPath(h), classIconPath(h)]) {
      if (!p) continue;
      const i = document.createElement('img');
      i.src = p; i.alt = ''; i.loading = 'lazy';
      icons.appendChild(i);
    }
    row.appendChild(icons);

    const label = document.createElement('span');
    label.className = 'manual-name';
    label.textContent = `${h.name}${h.title ? ` · ${h.title}` : ''}`;
    row.appendChild(label);

    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−';
    minus.addEventListener('click', () => {
      state.collection = setManualCount(state.collection, id, n - 1);
      saveCollection();
      renderManuels();
    });
    const count = document.createElement('span');
    count.textContent = String(n);
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+';
    plus.addEventListener('click', () => {
      state.collection = setManualCount(state.collection, id, n + 1);
      saveCollection();
      renderManuels();
    });
    row.append(minus, count, plus);
    box.appendChild(row);
  }
}

function aboutSection(titleKey, bodyKey) {
  const wrap = document.createElement('section');
  wrap.className = 'about-block';
  const h = document.createElement('h3');
  h.textContent = state.t(titleKey);
  const p = document.createElement('p');
  p.textContent = state.t(bodyKey);
  wrap.append(h, p);
  return wrap;
}

function renderAbout() {
  const box = $('#view-about');
  box.innerHTML = '';

  const h = document.createElement('h2');
  h.className = 'about-block';
  h.textContent = state.t('about.title');
  box.appendChild(h);

  const lead = document.createElement('p');
  lead.className = 'about-block';
  lead.textContent = state.t('about.body');
  box.appendChild(lead);

  box.appendChild(aboutSection('about.dataTitle', 'about.dataBody'));
  box.appendChild(aboutSection('about.updateTitle', 'about.updateBody'));
  box.appendChild(aboutSection('about.privacyTitle', 'about.privacyBody'));
  box.appendChild(aboutSection('about.legalTitle', 'about.legalBody'));

  const src = document.createElement('section');
  src.className = 'about-block';
  const sh = document.createElement('h3');
  sh.textContent = state.t('about.sourceTitle');
  const sp = document.createElement('p');
  const a = document.createElement('a');
  a.href = `https://github.com/${GH_REPO}`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = `github.com/${GH_REPO}`;
  sp.appendChild(a);
  const ver = document.createElement('p');
  ver.style.color = 'var(--muted)';
  ver.textContent = state.t('about.version', { v: APP_VERSION });
  src.append(sh, sp, ver);
  box.appendChild(src);
}

function openDetail(hero, unitIndex = 0) {
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
  row('detail.poolRarity', state.t(`poolRarity.${poolTier(hero)}`));
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
    const units = state.collection.owned[hero.id];
    const idx = Math.max(0, Math.min(unitIndex, units.length - 1));
    const unit = units[idx];
    const addRow = (key, node) => {
      const l = document.createElement('label');
      l.textContent = state.t(key);
      ed.append(l, node);
    };

    const copiesBar = document.createElement('div');
    copiesBar.className = 'owned-row copies-bar';
    units.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `copy-tab${i === idx ? ' is-active' : ''}`;
      b.textContent = `#${i + 1}`;
      b.addEventListener('click', () => openDetail(hero, i));
      copiesBar.appendChild(b);
    });
    const addCopy = document.createElement('button');
    addCopy.type = 'button';
    addCopy.className = 'copy-tab copy-add';
    addCopy.textContent = '＋';
    addCopy.title = state.t('caserne.addCopy');
    addCopy.addEventListener('click', () => {
      state.collection = addUnit(state.collection, hero.id);
      saveCollection();
      updateCollectionCount();
      openDetail(hero, state.collection.owned[hero.id].length - 1);
    });
    copiesBar.appendChild(addCopy);
    if (units.length > 1) {
      const delCopy = document.createElement('button');
      delCopy.type = 'button';
      delCopy.className = 'copy-tab copy-del';
      delCopy.textContent = '✕';
      delCopy.title = state.t('caserne.remove');
      delCopy.addEventListener('click', () => {
        state.collection = removeUnit(state.collection, hero.id, idx);
        saveCollection();
        updateCollectionCount();
        openDetail(hero, Math.max(0, idx - 1));
      });
      copiesBar.appendChild(delCopy);
    }
    ed.appendChild(copiesBar);

    const merges = document.createElement('input');
    merges.type = 'number'; merges.min = '0'; merges.max = '10'; merges.value = String(unit.merges);
    merges.addEventListener('change', () => {
      merges.value = String(clampMerges(merges.value));
      state.collection = setUnit(state.collection, hero.id, idx, { merges: merges.value });
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
    addRow('field.ivPlus', ivSelect(unit.ivPlus, (v) => {
      state.collection = setUnit(state.collection, hero.id, idx, { ivPlus: v });
      saveCollection();
    }));
    addRow('field.ivMinus', ivSelect(unit.ivMinus, (v) => {
      state.collection = setUnit(state.collection, hero.id, idx, { ivMinus: v });
      saveCollection();
    }));

    const sup = document.createElement('select');
    for (const v of ['none', 'C', 'B', 'A', 'S']) {
      const o = document.createElement('option');
      o.value = v === 'none' ? '' : v;
      o.textContent = state.t(`support.${v}`);
      if ((unit.support ?? '') === o.value) o.selected = true;
      sup.appendChild(o);
    }
    sup.addEventListener('change', () => {
      state.collection = setSupport(state.collection, hero.id, idx, sup.value || null);
      saveCollection();
    });
    addRow('field.support', sup);

    const date = document.createElement('input');
    date.type = 'date'; date.value = unit.date ?? '';
    date.addEventListener('change', () => {
      state.collection = setUnit(state.collection, hero.id, idx, { date: date.value || null });
      saveCollection();
    });
    addRow('field.date', date);

    const projRow = document.createElement('label');
    projRow.className = 'owned-row';
    const projCb = document.createElement('input');
    projCb.type = 'checkbox';
    projCb.checked = !!unit.project;
    projCb.addEventListener('change', () => {
      state.collection = setProject(state.collection, hero.id, idx, projCb.checked ? {} : null);
      saveCollection();
      openDetail(hero, idx);
    });
    projRow.append(projCb, document.createTextNode(` ${state.t('project.enable')}`));
    ed.appendChild(projRow);

    if (unit.project) {
      const tm = document.createElement('input');
      tm.type = 'number'; tm.min = '0'; tm.max = '10';
      tm.value = String(unit.project.targetMerges);
      tm.addEventListener('change', () => {
        state.collection = setProject(state.collection, hero.id, idx, { targetMerges: tm.value });
        tm.value = String(state.collection.owned[hero.id][idx].project.targetMerges);
        saveCollection();
      });
      addRow('project.targetMerges', tm);
      addRow('project.targetIvPlus', ivSelect(unit.project.targetIvPlus, (v) => {
        state.collection = setProject(state.collection, hero.id, idx, { targetIvPlus: v });
        saveCollection();
      }));
      const pn = document.createElement('input');
      pn.type = 'text'; pn.value = unit.project.notes || '';
      pn.addEventListener('change', () => {
        state.collection = setProject(state.collection, hero.id, idx, { notes: pn.value });
        saveCollection();
      });
      addRow('project.notes', pn);
    }
  }

  const wantRow = document.createElement('label');
  wantRow.className = 'owned-row';
  const wantCb = document.createElement('input');
  wantCb.type = 'checkbox';
  wantCb.checked = wantedIdSet(state.collection).has(hero.id);
  wantCb.addEventListener('change', () => {
    state.collection = setWanted(state.collection, hero.id, wantCb.checked);
    saveCollection();
    refreshCard(hero.id);
    openDetail(hero);
  });
  wantRow.append(wantCb, document.createTextNode(` ${state.t('field.wanted')}`));
  ed.appendChild(wantRow);

  if (wantedIdSet(state.collection).has(hero.id)) {
    const w = state.collection.wanted[hero.id];
    const pl = document.createElement('label');
    pl.textContent = state.t('field.wantedPriority');
    const psel = document.createElement('select');
    for (const p of ['high', 'normal']) {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = state.t(`priority.${p}`);
      if (w.priority === p) o.selected = true;
      psel.appendChild(o);
    }
    psel.addEventListener('change', () => {
      state.collection = setWantedPriority(state.collection, hero.id, psel.value);
      saveCollection();
    });
    ed.append(pl, psel);

    const nl = document.createElement('label');
    nl.textContent = state.t('field.wantedNote');
    const ni = document.createElement('input');
    ni.type = 'text'; ni.value = w.note || '';
    ni.addEventListener('change', () => {
      state.collection = setWantedNote(state.collection, hero.id, ni.value);
      saveCollection();
    });
    ed.append(nl, ni);
  }

  const manRow = document.createElement('div');
  manRow.className = 'owned-row manual-inline';
  const manBtn = document.createElement('button');
  manBtn.type = 'button';
  manBtn.className = 'lang';
  manBtn.textContent = state.t('detail.addManual');
  const manCount = document.createElement('span');
  const syncMan = () => {
    const n = state.collection.manuals[hero.id] || 0;
    manCount.textContent = n ? `${state.t('detail.manuals')}: ${n}` : '';
  };
  syncMan();
  manBtn.addEventListener('click', () => {
    state.collection = setManualCount(state.collection, hero.id, (state.collection.manuals[hero.id] || 0) + 1);
    saveCollection();
    syncMan();
  });
  manRow.append(manBtn, manCount);
  ed.appendChild(manRow);

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
  $('#quick-add').setAttribute('aria-pressed', state.quickAdd ? 'true' : 'false');

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
  $('#quick-add').addEventListener('click', () => {
    state.quickAdd = !state.quickAdd;
    $('#quick-add').setAttribute('aria-pressed', state.quickAdd ? 'true' : 'false');
    writePrefs();
    recompute();
  });
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
    state.quickAdd = false;
    state.status = 'all';
    $('#status-filter').value = 'all';
    $('#quick-add').setAttribute('aria-pressed', 'false');
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
        wanted: { ...state.collection.wanted, ...incoming.wanted },
        manuals: { ...state.collection.manuals, ...incoming.manuals },
      });
    } else {
      state.collection = incoming;
    }
    saveCollection();
    const catalogIds = new Set(state.heroes.map((h) => h.id));
    const unknown = Object.keys(state.collection.owned).filter((id) => !catalogIds.has(id)).length;
    if (unknown) alert(state.t('import.unknown', { n: unknown }));
    updateCollectionCount();
    renderView();
  });

  const sentinel = document.getElementById('load-more-sentinel');
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.group && state.shown < state.list.length) renderGridPage();
  }, { rootMargin: '600px' }).observe(sentinel);
}

main();
