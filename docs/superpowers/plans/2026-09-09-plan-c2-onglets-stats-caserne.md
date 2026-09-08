# Plan C.2 — Onglets · Caserne · Stats · Wishlist · Manuels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Passer d'un écran unique à une **appli à onglets** (Catalogue · Caserne · Stats · Wishlist · Manuels), enrichir la collection (`copies` doubles, `date` d'obtention, `wanted` wishlist, `manuals` manuels de combat), ajouter un bouton **[+]** sur les cartes pour marquer possédé sans ouvrir le détail, et fournir un écran Stats (total %, répartitions, timeline par mois, top doubles, résumé wishlist).

**Architecture :** le module pur `js/collection.mjs` gagne les champs v2 + fonctions (migration v1→v2 sans perte). `js/stats.mjs` (nouveau, pur) calcule les agrégats Stats. `index.html` gagne une `<nav>` d'onglets et enveloppe chaque vue dans une `<section data-view>`. `app.js` gagne un routeur par hash (`#/catalogue` défaut, `#/caserne`, `#/stats`, `#/wishlist`, `#/manuels`), le rendu de chaque onglet, et le [+] sur les cartes. Rien de nouveau côté pipeline.

**Tech Stack :** HTML/CSS/JS ESM natif. `node --test`. Zéro dépendance, aucun build.

## Global Constraints

- `node --test` **sans argument** ; suite actuellement **102/102**, doit rester verte. `node --check app.js` doit passer.
- Chemins relatifs, ESM `.mjs`, LF endings, thème via tokens existants.
- **Fichier collection v2** — clé `localStorage` : `feh-collection-v1` (inchangée). Migration **v1→v2 automatique, sans perte** (`migrateCollection` ajoute les champs manquants).
  ```json
  {
    "version": 2,
    "updated": "YYYY-MM-DD",
    "owned": {
      "<WikiName>": { "merges": 0, "ivPlus": null, "ivMinus": null, "support": null, "copies": 0, "date": null }
    },
    "wanted": { "<WikiName>": true },
    "manuals": { "<WikiName>": 2 }
  }
  ```
  - `copies` : entier ≥ 0 (doubles non fusionnés).
  - `date` : `"YYYY-MM-DD"` ou `null` (date d'obtention, optionnelle).
  - `wanted[id] === true` ⇔ héros voulu. Indépendant de `owned`.
  - `manuals[id]` : entier ≥ 1 (nombre de manuels de combat de ce héros). `0`/absent = pas de manuel.
- Routeur : hash `#/<vue>` ∈ `catalogue | caserne | stats | wishlist | manuels` ; inconnu → `catalogue`. Dernier onglet mémorisé dans `localStorage['feh-view']`.
- `localStorage` : **tout accès** `try/catch`.
- Modules `js/*.mjs` : purs, **sans DOM**, importables sous Node.
- Commits : `feat:` / `fix:` / `test:` ; se terminent par
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## File Structure

| Fichier | Changement |
|---|---|
| `js/collection.mjs` | v2 : `copies`/`date` dans `owned`, blocs `wanted`/`manuals` ; `+ setCopies, setDate, setWanted, wantedIdSet, setManualCount, manualsTotal` ; `migrateCollection` v1→v2. |
| `js/collection.test.mjs` | + tests v2. |
| `js/stats.mjs` | **Nouveau.** Pur : `distribution(heroes, ownedSet, key)`, `acquisitionTimeline(collection)`, `topCopies(collection, heroes, n)`, `wishlistSummary(collection, ownedSet)`. |
| `js/stats.test.mjs` | **Nouveau.** |
| `i18n/en.json`, `i18n/fr.json` | + ~20 clés (onglets, champs copies/date, wishlist, manuels, libellés Stats). |
| `i18n/i18n-keys.test.mjs` | `REQUIRED` mis à jour. |
| `index.html` | `<nav id="tabs">` + `<section data-view="…">` autour de chaque vue ; conteneurs `#view-caserne` `#view-stats` `#view-wishlist` `#view-manuels`. |
| `styles.css` | onglets ; lignes Caserne ; barres Stats ; lignes Manuels ; bouton `.card-add`. |
| `app.js` | routeur ; rendu Caserne / Stats / Wishlist / Manuels ; [+] sur les cartes ; `copies`/`date`/`wanted` dans l'éditeur détail. |
| `feh-collection-tracker-design.md` | §5.3 : forme v2 réellement implémentée. |

---

## Task 1: `js/collection.mjs` — modèle v2

**Files:** Modify `g:\GITHUB\feh-comp\js\collection.mjs` + `g:\GITHUB\feh-comp\js\collection.test.mjs`

**Interfaces:** (en plus de l'existant — inchangé)
- `migrateCollection(raw)` : produit `version: 2` ; chaque `owned` entry `{merges, ivPlus, ivMinus, support, copies, date}` (`copies` = entier ≥ 0 via un `clampCount`, `date` = string `YYYY-MM-DD` sinon `null`) ; racines `wanted` (map `id→true`, ne garde que les `=== true`) et `manuals` (map `id→entier ≥ 1`, retire `≤ 0`).
- `clampCount(n) -> number` — `Math.floor`, min 0, NaN→0 (pas de borne haute).
- `setCopies(col, id, n) -> Collection` — sur un héros **possédé** ; `n` via `clampCount` ; sinon `col` inchangé.
- `setDate(col, id, date) -> Collection` — sur un héros possédé ; `date` = `YYYY-MM-DD` valide sinon `null`.
- `setWanted(col, id, bool) -> Collection` — `true` ajoute `wanted[id]=true`, `false` supprime la clé.
- `wantedIdSet(col) -> Set<string>`.
- `setManualCount(col, id, n) -> Collection` — `n` via `clampCount` ; `0` supprime la clé, sinon `manuals[id]=n`.
- `manualsTotal(col) -> number` — somme des `manuals`.

- [ ] **Step 1: Tests (RED)** — ajouter à `js/collection.test.mjs` :
```js
import {
  clampCount, setCopies, setDate, setWanted, wantedIdSet, setManualCount, manualsTotal,
} from './collection.mjs';

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
```
Run: `node --test js/collection.test.mjs` → FAIL.

- [ ] **Step 2: Implémentation** — dans `js/collection.mjs` :

Remplacer `normEntry` et `migrateCollection` :
```js
export function clampCount(n) {
  const i = Math.floor(Number(n));
  return Number.isFinite(i) && i > 0 ? i : 0;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normEntry(e) {
  const o = e && typeof e === 'object' ? e : {};
  return {
    merges: clampMerges(o.merges),
    ivPlus: IVS.has(o.ivPlus) ? o.ivPlus : null,
    ivMinus: IVS.has(o.ivMinus) ? o.ivMinus : null,
    support: RANKS.has(o.support) ? o.support : null,
    copies: clampCount(o.copies),
    date: typeof o.date === 'string' && DATE_RE.test(o.date) ? o.date : null,
  };
}

export function migrateCollection(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawOwned = src.owned && typeof src.owned === 'object' ? src.owned : {};
  const owned = {};
  for (const [id, e] of Object.entries(rawOwned)) {
    if (e && typeof e === 'object') owned[id] = normEntry(e);
  }
  const wanted = {};
  if (src.wanted && typeof src.wanted === 'object') {
    for (const [id, v] of Object.entries(src.wanted)) if (v === true) wanted[id] = true;
  }
  const manuals = {};
  if (src.manuals && typeof src.manuals === 'object') {
    for (const [id, v] of Object.entries(src.manuals)) {
      const n = clampCount(v);
      if (n > 0) manuals[id] = n;
    }
  }
  return {
    version: 2,
    updated: typeof src.updated === 'string' ? src.updated : today(),
    owned,
    wanted,
    manuals,
  };
}
```
`emptyCollection` :
```js
export function emptyCollection() {
  return { version: 2, updated: today(), owned: {}, wanted: {}, manuals: {} };
}
```
`setOwned` : l'entrée ajoutée devient `{ merges: 0, ivPlus: null, ivMinus: null, support: null, copies: 0, date: null }`.

Ajouter :
```js
export function setCopies(col, id, n) {
  const next = migrateCollection(col);
  if (!next.owned[id]) return col;
  next.owned[id] = { ...next.owned[id], copies: clampCount(n) };
  next.updated = today();
  return next;
}

export function setDate(col, id, date) {
  const next = migrateCollection(col);
  if (!next.owned[id]) return col;
  next.owned[id] = { ...next.owned[id], date: typeof date === 'string' && DATE_RE.test(date) ? date : null };
  next.updated = today();
  return next;
}

export function setWanted(col, id, bool) {
  const next = migrateCollection(col);
  if (bool) next.wanted[id] = true;
  else delete next.wanted[id];
  next.updated = today();
  return next;
}

export function wantedIdSet(col) {
  return new Set(Object.keys(col && col.wanted ? col.wanted : {}));
}

export function setManualCount(col, id, n) {
  const next = migrateCollection(col);
  const c = clampCount(n);
  if (c > 0) next.manuals[id] = c;
  else delete next.manuals[id];
  next.updated = today();
  return next;
}

export function manualsTotal(col) {
  return Object.values(col && col.manuals ? col.manuals : {}).reduce((a, b) => a + b, 0);
}
```

- [ ] **Step 3: GREEN** — `node --test js/collection.test.mjs` → PASS. Puis `node --test` (les tests v1 existants doivent rester verts : `emptyCollection` renvoie maintenant `version: 2` + `wanted`/`manuals` — **ajuster** l'assertion du test `emptyCollection` existant si elle vérifie `version === 1` ou la forme exacte de `owned`).

- [ ] **Step 4: Commit**
```bash
git add js/collection.mjs js/collection.test.mjs
git commit -m "$(printf 'feat: collection v2 (copies, date, wanted, manuals) + migration\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: `js/stats.mjs` — agrégats

**Files:** Create `g:\GITHUB\feh-comp\js\stats.mjs` + `g:\GITHUB\feh-comp\js\stats.test.mjs`

**Interfaces:**
- `distribution(heroes, ownedSet, key) -> Array<{ value, total, owned }>` — pour `key` ∈ `color|weapon|move|category|blessing`, compte par valeur : `total` (catalogue), `owned` (∈ `ownedSet`). Ignore les valeurs falsy. Trié par `total` desc.
- `acquisitionTimeline(collection) -> Array<{ month: "YYYY-MM", count }>` — regroupe `owned[id].date` non nuls par mois, trié chronologiquement.
- `topCopies(collection, heroes, n=10) -> Array<{ id, name, title, copies }>` — héros possédés triés par `copies` desc, `copies > 0`, limité à `n` ; `name`/`title` résolus depuis `heroes`.
- `wishlistSummary(collection, ownedSet) -> { total, missing }` — `total` = taille de `wanted` ; `missing` = ceux pas dans `ownedSet`.

- [ ] **Step 1: Tests (RED)** — `js/stats.test.mjs` :
```js
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
```
Run → FAIL.

- [ ] **Step 2: Implémentation** — `js/stats.mjs` :
```js
// js/stats.mjs — agrégats pour l'onglet Stats. Pur, sans DOM.

export function distribution(heroes, ownedSet, key) {
  const map = new Map();
  for (const h of heroes) {
    const v = h[key];
    if (!v) continue;
    const e = map.get(v) || { value: v, total: 0, owned: 0 };
    e.total += 1;
    if (ownedSet.has(h.id)) e.owned += 1;
    map.set(v, e);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || String(a.value).localeCompare(String(b.value)));
}

export function acquisitionTimeline(collection) {
  const owned = collection && collection.owned ? collection.owned : {};
  const map = new Map();
  for (const e of Object.values(owned)) {
    if (!e || typeof e.date !== 'string' || e.date.length < 7) continue;
    const month = e.date.slice(0, 7);
    map.set(month, (map.get(month) || 0) + 1);
  }
  return [...map.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function topCopies(collection, heroes, n = 10) {
  const owned = collection && collection.owned ? collection.owned : {};
  const byId = new Map(heroes.map((h) => [h.id, h]));
  return Object.entries(owned)
    .filter(([, e]) => e && e.copies > 0)
    .map(([id, e]) => {
      const h = byId.get(id) || { name: id, title: '' };
      return { id, name: h.name, title: h.title, copies: e.copies };
    })
    .sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function wishlistSummary(collection, ownedSet) {
  const wanted = collection && collection.wanted ? Object.keys(collection.wanted) : [];
  return { total: wanted.length, missing: wanted.filter((id) => !ownedSet.has(id)).length };
}
```
Run → PASS. Puis `node --test`.

- [ ] **Step 3: Commit**
```bash
git add js/stats.mjs js/stats.test.mjs
git commit -m "$(printf 'feat: pure stats aggregates (distribution, timeline, top copies, wishlist)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: i18n

**Files:** `i18n/en.json`, `i18n/fr.json`, `i18n/i18n-keys.test.mjs`

Clés (les deux langues, ajouter à `REQUIRED`) :
`nav.catalogue`, `nav.caserne`, `nav.stats`, `nav.wishlist`, `nav.manuels`,
`field.copies`, `field.date`, `field.wanted`,
`stats.total`, `stats.byColor`, `stats.byWeapon`, `stats.byMove`, `stats.byCategory`, `stats.byBlessing`,
`stats.timeline`, `stats.topCopies`, `stats.wishlist`, `stats.wishlistLine`,
`caserne.empty`, `wishlist.empty`, `manuels.empty`, `manuels.total`, `manuels.add`,
`card.add`, `card.remove`

- [ ] **Step 1: `REQUIRED` (RED).**
- [ ] **Step 2: `i18n/en.json`** :
```json
  "nav.catalogue": "Catalogue",
  "nav.caserne": "Barracks",
  "nav.stats": "Stats",
  "nav.wishlist": "Wishlist",
  "nav.manuels": "Manuals",
  "field.copies": "Spare copies",
  "field.date": "Obtained on",
  "field.wanted": "Wanted",
  "stats.total": "{owned} / {total} heroes ({pct}%)",
  "stats.byColor": "By colour",
  "stats.byWeapon": "By weapon",
  "stats.byMove": "By movement",
  "stats.byCategory": "By category",
  "stats.byBlessing": "By blessing",
  "stats.timeline": "Heroes obtained per month",
  "stats.topCopies": "Most spare copies",
  "stats.wishlist": "Wishlist",
  "stats.wishlistLine": "{total} wanted, {missing} still missing",
  "caserne.empty": "No hero in your barracks yet. Tick \u201cOwned\u201d on a hero.",
  "wishlist.empty": "No hero marked as wanted.",
  "manuels.empty": "No combat manual recorded.",
  "manuels.total": "{n} combat manuals",
  "manuels.add": "Add a manual\u2026",
  "card.add": "Add to barracks",
  "card.remove": "Remove from barracks"
```
- [ ] **Step 3: `i18n/fr.json`** :
```json
  "nav.catalogue": "Catalogue",
  "nav.caserne": "Caserne",
  "nav.stats": "Stats",
  "nav.wishlist": "Wishlist",
  "nav.manuels": "Manuels",
  "field.copies": "Doubles en rab",
  "field.date": "Obtenu le",
  "field.wanted": "Voulu",
  "stats.total": "{owned} / {total} h\u00e9ros ({pct}%)",
  "stats.byColor": "Par couleur",
  "stats.byWeapon": "Par arme",
  "stats.byMove": "Par d\u00e9placement",
  "stats.byCategory": "Par cat\u00e9gorie",
  "stats.byBlessing": "Par b\u00e9n\u00e9diction",
  "stats.timeline": "H\u00e9ros obtenus par mois",
  "stats.topCopies": "Le plus de doubles",
  "stats.wishlist": "Wishlist",
  "stats.wishlistLine": "{total} voulus, {missing} encore manquants",
  "caserne.empty": "Aucun h\u00e9ros dans ta caserne. Coche \u00ab Poss\u00e9d\u00e9 \u00bb sur un h\u00e9ros.",
  "wishlist.empty": "Aucun h\u00e9ros marqu\u00e9 comme voulu.",
  "manuels.empty": "Aucun manuel de combat enregistr\u00e9.",
  "manuels.total": "{n} manuels de combat",
  "manuels.add": "Ajouter un manuel\u2026",
  "card.add": "Ajouter \u00e0 la caserne",
  "card.remove": "Retirer de la caserne"
```
- [ ] **Step 4: GREEN** — `node --test`.
- [ ] **Step 5: Commit**
```bash
git add i18n/en.json i18n/fr.json i18n/i18n-keys.test.mjs
git commit -m "$(printf 'feat: i18n keys for tabs, stats, wishlist, manuals\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: `index.html` — barre d'onglets + sections

**Files:** `index.html`

- [ ] **Step 1: Éditer**

Juste après `</header>` (avant `<section class="controls">`) :
```html
  <nav id="tabs" class="tabs" aria-label="views">
    <button type="button" class="tab" data-view="catalogue" data-i18n="nav.catalogue">Catalogue</button>
    <button type="button" class="tab" data-view="caserne" data-i18n="nav.caserne">Caserne</button>
    <button type="button" class="tab" data-view="stats" data-i18n="nav.stats">Stats</button>
    <button type="button" class="tab" data-view="wishlist" data-i18n="nav.wishlist">Wishlist</button>
    <button type="button" class="tab" data-view="manuels" data-i18n="nav.manuels">Manuels</button>
  </nav>
```

Envelopper l'existant : de `<section class="controls">` jusqu'à `<div id="load-more-sentinel"…>` **inclus**, entourer par :
```html
  <section data-view="catalogue" class="view">
    … (controls + grid-count + grid + sentinel inchangés) …
  </section>
```

Après cette section, ajouter :
```html
  <section data-view="caserne" class="view" hidden><div id="view-caserne"></div></section>
  <section data-view="stats" class="view" hidden><div id="view-stats"></div></section>
  <section data-view="wishlist" class="view" hidden><div id="view-wishlist"></div></section>
  <section data-view="manuels" class="view" hidden><div id="view-manuels"></div></section>
```
(le panneau `#detail` et le `<footer>` restent **hors** des sections, communs à toutes les vues.)

- [ ] **Step 2: Vérif servie**
```bash
node scripts/serve.mjs 8170 & SV=$!; sleep 1
curl -s http://localhost:8170/ | grep -c 'id="tabs"'                       # 1
curl -s http://localhost:8170/ | grep -oE 'data-view="[a-z]+"' | sort -u   # 5 lignes distinctes
for v in view-caserne view-stats view-wishlist view-manuels; do echo "$v: $(curl -s http://localhost:8170/ | grep -c "id=\"$v\"")"; done
kill $SV
```

- [ ] **Step 3: Commit**
```bash
git add index.html
git commit -m "$(printf 'feat: tab bar and per-view sections in the shell\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: `styles.css` — onglets + vues

**Files:** `styles.css`

- [ ] **Step 1: Ajouter**
```css
.tabs { display: flex; gap: .25rem; padding: .4rem 1rem 0; border-bottom: 1px solid var(--border);
  overflow-x: auto; }
.tab { border: 1px solid transparent; border-bottom: none; background: transparent; color: var(--muted);
  padding: .45rem .8rem; border-radius: 8px 8px 0 0; cursor: pointer; font: inherit; white-space: nowrap; }
.tab[aria-selected="true"] { color: var(--fg); border-color: var(--border); background: var(--card); font-weight: 600; }

.view { min-height: 40vh; }

.stat-block { margin: 1rem; }
.stat-block h3 { margin: 0 0 .5rem; font-size: .95rem; }
.bar-row { display: grid; grid-template-columns: 7rem 1fr auto; gap: .5rem; align-items: center;
  font-size: .82rem; margin: .2rem 0; }
.bar { height: .8rem; border-radius: 4px; background: color-mix(in srgb, var(--accent) 30%, var(--card));
  position: relative; overflow: hidden; }
.bar > i { position: absolute; inset: 0 auto 0 0; background: var(--accent); }
.bar-row .num { color: var(--muted); font-variant-numeric: tabular-nums; }

.roster { display: grid; gap: .5rem; padding: 1rem; }
.roster-row { display: grid; grid-template-columns: 2.4rem 1fr repeat(4, minmax(4rem, auto));
  gap: .5rem; align-items: center; background: var(--card); border: 1px solid var(--border);
  border-radius: 10px; padding: .4rem .6rem; }
.roster-row img { width: 2.4rem; height: 2.4rem; border-radius: 6px; background: var(--bg); }
.roster-row .who { min-width: 0; }
.roster-row .who b { display: block; font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.roster-row .who span { font-size: .72rem; color: var(--muted); }
.roster-row select, .roster-row input { padding: .25rem .3rem; border: 1px solid var(--border);
  border-radius: 6px; background: var(--card); color: var(--fg); width: 100%; }

.manual-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: .5rem; align-items: center;
  padding: .4rem .6rem; border-bottom: 1px solid var(--border); }
.manual-row button { border: 1px solid var(--border); background: var(--card); color: var(--fg);
  border-radius: 6px; width: 1.8rem; height: 1.8rem; cursor: pointer; }

.card .card-add { position: absolute; bottom: .4rem; right: .4rem; width: 1.5rem; height: 1.5rem;
  border-radius: 50%; border: 1px solid var(--border); background: var(--card); color: var(--fg);
  font-weight: 700; line-height: 1; cursor: pointer; z-index: 2; }
.card.is-owned .card-add { background: var(--owned, #3fae52); color: #fff; border-color: transparent; }
.empty-note { padding: 2rem 1rem; text-align: center; color: var(--muted); }
```

- [ ] **Step 2: Vérif** — `node scripts/serve.mjs 8171 & SV=$!; sleep 1; curl -s http://localhost:8171/styles.css | grep -c '.tab\[aria-selected'; curl -s http://localhost:8171/styles.css | grep -c 'card-add'; kill $SV` → `1` `2`. Braces équilibrées.

- [ ] **Step 3: Commit**
```bash
git add styles.css
git commit -m "$(printf 'feat: styles for tabs, stat bars, roster rows, manual rows, card [+]\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 6: `app.js` — routeur d'onglets

**Files:** `app.js`

**Interfaces:** `state.view` ∈ `catalogue|caserne|stats|wishlist|manuels`. Hash `#/<view>` fait foi ; au chargement, priorité hash > `localStorage['feh-view']` > `catalogue`. Changer d'onglet met à jour le hash, `localStorage`, l'`aria-selected` des `.tab`, le `hidden` des `.view`, et **rend** la vue cible.

- [ ] **Step 1: Ajouter à `app.js`**
```js
const LS_VIEW = 'feh-view';
const VIEWS = ['catalogue', 'caserne', 'stats', 'wishlist', 'manuels'];

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
```
Dans `state` : `view: 'catalogue',`.
Dans `main()`, **après** `buildFilterControls()` et le premier `recompute()` sont câblés, remplacer l'appel direct `recompute();` de fin d'init par :
```js
  let startView = currentHashView();
  if (!startView) { try { startView = localStorage.getItem(LS_VIEW); } catch { /* ignore */ } }
  setView(VIEWS.includes(startView) ? startView : 'catalogue', { push: false });
  window.addEventListener('hashchange', () => setView(currentHashView() || 'catalogue', { push: false }));
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  }
```
Ajouter des stubs (remplis Tasks 7–10) pour éviter les `ReferenceError` :
```js
function renderCaserne() { $('#view-caserne').innerHTML = ''; }
function renderStats() { $('#view-stats').innerHTML = ''; }
function renderWishlist() { $('#view-wishlist').innerHTML = ''; }
function renderManuels() { $('#view-manuels').innerHTML = ''; }
```
(Chaque task suivante remplace le stub correspondant par le vrai rendu.)

Dans `setLang()` : après `applyStaticI18n()` + les autres syncs, ajouter `renderView();` (re-traduit la vue courante).

- [ ] **Step 2: Vérifs**
```bash
node --check app.js && node --test
node scripts/serve.mjs 8172 & SV=$!; sleep 1
curl -s http://localhost:8172/app.js | grep -c 'function renderView'      # 1
curl -s http://localhost:8172/app.js | grep -c "VIEWS ="                   # 1
kill $SV
```

- [ ] **Step 3: Commit**
```bash
git add app.js
git commit -m "$(printf 'feat: hash-based tab router (catalogue/caserne/stats/wishlist/manuels)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 7: `app.js` — bouton [+] sur les cartes

**Files:** `app.js`

- [ ] **Step 1: Dans `card(hero)`**, avant `const open = () => openDetail(hero);` :
```js
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'card-add';
  const syncAdd = () => {
    const owned = isOwned(hero.id);
    add.textContent = owned ? '\u2713' : '+';
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
```
(`setOwned` déjà importé. `refreshCard` toggle `is-owned`/`is-missing`. Le `stopPropagation` évite d'ouvrir le détail.)

- [ ] **Step 2: Vérifs**
```bash
node --check app.js && node --test
node scripts/serve.mjs 8173 & SV=$!; sleep 1
curl -s http://localhost:8173/app.js | grep -c "className = 'card-add'"   # 1
kill $SV
```

- [ ] **Step 3: Commit**
```bash
git add app.js
git commit -m "$(printf 'feat: [+] toggle-owned button on catalogue cards\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 8: `app.js` — éditeur détail v2 (copies, date, wanted)

**Files:** `app.js`

- [ ] **Step 1: Dans `openDetail`**, dans le bloc `if (isOwned(hero.id))` (après le champ Soutien), ajouter :
```js
    const copies = document.createElement('input');
    copies.type = 'number'; copies.min = '0'; copies.value = String(entry.copies ?? 0);
    copies.addEventListener('change', () => {
      state.collection = setCopies(state.collection, hero.id, copies.value);
      copies.value = String(state.collection.owned[hero.id].copies);
      saveCollection();
    });
    addRow('field.copies', copies);

    const date = document.createElement('input');
    date.type = 'date'; date.value = entry.date ?? '';
    date.addEventListener('change', () => {
      state.collection = setDate(state.collection, hero.id, date.value || null);
      saveCollection();
    });
    addRow('field.date', date);
```
Import à compléter : `setCopies, setDate, setWanted, wantedIdSet` depuis `./js/collection.mjs`.

Dans le même `openDetail`, **hors** du `if owned` (toujours affiché), sous l'éditeur, ajouter une case « Voulu » :
```js
  const wantRow = document.createElement('label');
  wantRow.className = 'owned-row';
  const wantCb = document.createElement('input');
  wantCb.type = 'checkbox';
  wantCb.checked = wantedIdSet(state.collection).has(hero.id);
  wantCb.addEventListener('change', () => {
    state.collection = setWanted(state.collection, hero.id, wantCb.checked);
    saveCollection();
  });
  wantRow.append(wantCb, document.createTextNode(` ${state.t('field.wanted')}`));
  ed.appendChild(wantRow);
```

- [ ] **Step 2: Vérifs** — `node --check app.js && node --test` ; served grep `setCopies` ≥1, `field.wanted` ≥1.

- [ ] **Step 3: Commit**
```bash
git add app.js
git commit -m "$(printf 'feat: detail editor v2 (spare copies, obtained-on date, wanted flag)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 9: `app.js` — onglet Caserne

**Files:** `app.js`

**Interfaces:** `renderCaserne()` remplit `#view-caserne` : si `owned` vide → `<p class="empty-note">` (`caserne.empty`). Sinon, pour chaque héros possédé (présent dans `state.heroes`, trié `release-desc`), une `.roster-row` : mini-portrait (`hero.image`), nom + épithète (`epithetFor`), et **4 contrôles inline** : Fusions (`<input type=number 0..10>`), IV + (`<select>`), IV − (`<select>`), Soutien (`<select>` —/C/B/A/S). Chaque change → mute via le module (`setSupport` pour le soutien ; spread pour merges/IV), `saveCollection()`, et `refreshCard(id)`.

- [ ] **Step 1: Remplacer le stub `renderCaserne`**
```js
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
  const list = ids.map((id) => heroesById.get(id)).filter(Boolean);
  list.sort((a, b) => sortHeroes([a, b], 'release-desc')[0] === a ? -1 : 1);
  if (!list.length) {
    box.innerHTML = `<p class="empty-note">${state.t('caserne.empty')}</p>`;
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'roster';
  for (const hero of list) {
    const entry = state.collection.owned[hero.id];
    const row = document.createElement('div');
    row.className = 'roster-row';

    const img = document.createElement('img');
    img.loading = 'lazy'; img.alt = ''; img.src = hero.image || '';
    row.appendChild(img);

    const who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = `<b></b><span></span>`;
    who.querySelector('b').textContent = hero.name;
    who.querySelector('span').textContent = epithetFor(hero);
    row.appendChild(who);

    const merges = document.createElement('input');
    merges.type = 'number'; merges.min = '0'; merges.max = '10'; merges.value = String(entry.merges);
    merges.addEventListener('change', () => {
      const v = clampMerges(merges.value);
      merges.value = String(v);
      state.collection.owned[hero.id] = { ...state.collection.owned[hero.id], merges: v };
      state.collection.updated = new Date().toISOString().slice(0, 10);
      saveCollection();
    });
    row.appendChild(merges);

    const ivP = document.createElement('select');
    ivOptions(ivP, entry.ivPlus);
    ivP.addEventListener('change', () => {
      state.collection.owned[hero.id] = { ...state.collection.owned[hero.id], ivPlus: ivP.value || null };
      state.collection.updated = new Date().toISOString().slice(0, 10);
      saveCollection();
    });
    row.appendChild(ivP);

    const ivM = document.createElement('select');
    ivOptions(ivM, entry.ivMinus);
    ivM.addEventListener('change', () => {
      state.collection.owned[hero.id] = { ...state.collection.owned[hero.id], ivMinus: ivM.value || null };
      state.collection.updated = new Date().toISOString().slice(0, 10);
      saveCollection();
    });
    row.appendChild(ivM);

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
      renderCaserne(); // re-render : la règle un-seul-S peut changer une autre ligne
    });
    row.appendChild(sup);

    wrap.appendChild(row);
  }
  box.appendChild(wrap);
}
```

- [ ] **Step 2: Vérifs** — `node --check app.js && node --test` ; served grep `function renderCaserne` (1, pas le stub — vérifier qu'il n'y a plus `$('#view-caserne').innerHTML = ''; }` en une ligne).

- [ ] **Step 3: Commit**
```bash
git add app.js
git commit -m "$(printf 'feat: Barracks tab (owned heroes, inline merges/IV/support editing)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 10: `app.js` — onglet Stats

**Files:** `app.js`

- [ ] **Step 1: Import** — ajouter `import { distribution, acquisitionTimeline, topCopies, wishlistSummary } from './js/stats.mjs';`

- [ ] **Step 2: Remplacer le stub `renderStats`**
```js
function barBlock(titleKey, rows) {
  const b = document.createElement('div');
  b.className = 'stat-block';
  const h = document.createElement('h3');
  h.textContent = state.t(titleKey);
  b.appendChild(h);
  const max = Math.max(1, ...rows.map((r) => r.total ?? r.count ?? 0));
  for (const r of rows) {
    const v = r.total ?? r.count ?? 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    const label = document.createElement('span');
    label.textContent = r.label;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round((v / max) * 100)}%`;
    bar.appendChild(fill);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = r.owned != null ? `${r.owned} / ${r.total}` : String(v);
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
  box.appendChild(head);

  const facetLabel = (key, v) => (key === 'blessing'
    ? state.t(`blessing.${v}`)
    : state.t(`${key === 'move' ? 'move' : key === 'weapon' ? 'weapon' : key === 'color' ? 'color' : 'category'}.${v}`));

  for (const [key, titleKey] of [
    ['color', 'stats.byColor'], ['weapon', 'stats.byWeapon'], ['move', 'stats.byMove'],
    ['category', 'stats.byCategory'], ['blessing', 'stats.byBlessing'],
  ]) {
    const rows = distribution(state.heroes, ownedSet, key)
      .map((d) => ({ label: facetLabel(key, d.value), total: d.total, owned: d.owned }));
    if (rows.length) box.appendChild(barBlock(titleKey, rows));
  }

  const tl = acquisitionTimeline(state.collection).map((m) => ({ label: m.month, count: m.count }));
  if (tl.length) box.appendChild(barBlock('stats.timeline', tl));

  const tc = topCopies(state.collection, state.heroes, 10)
    .map((h) => ({ label: `${h.name}${h.title ? ` (${h.title})` : ''}`, count: h.copies }));
  if (tc.length) box.appendChild(barBlock('stats.topCopies', tc));

  const w = wishlistSummary(state.collection, ownedSet);
  const wl = document.createElement('p');
  wl.className = 'stat-block';
  wl.textContent = state.t('stats.wishlistLine', w);
  box.appendChild(wl);
}
```

- [ ] **Step 3: Vérifs** — `node --check app.js && node --test` ; served grep `function renderStats` & `from './js/stats.mjs'`.

- [ ] **Step 4: Commit**
```bash
git add app.js
git commit -m "$(printf 'feat: Stats tab (distributions, timeline, top copies, wishlist line)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 11: `app.js` — onglets Wishlist + Manuels

**Files:** `app.js`

- [ ] **Step 1: Remplacer le stub `renderWishlist`**
```js
function renderWishlist() {
  const box = $('#view-wishlist');
  box.innerHTML = '';
  const ids = [...wantedIdSet(state.collection)];
  const heroesById = new Map(state.heroes.map((h) => [h.id, h]));
  const list = ids.map((id) => heroesById.get(id)).filter(Boolean);
  if (!list.length) {
    box.innerHTML = `<p class="empty-note">${state.t('wishlist.empty')}</p>`;
    return;
  }
  list.sort((a, b) => (sortHeroes([a, b], 'release-desc')[0] === a ? -1 : 1));
  const grid = document.createElement('main');
  grid.className = 'grid';
  for (const hero of list) grid.appendChild(card(hero));
  box.appendChild(grid);
}
```

- [ ] **Step 2: Remplacer le stub `renderManuels`**
```js
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
  addWrap.className = 'manual-row';
  const input = document.createElement('input');
  input.setAttribute('list', 'manual-hero-list');
  input.placeholder = state.t('manuels.add');
  const dl = document.createElement('datalist');
  dl.id = 'manual-hero-list';
  for (const h of state.heroes) {
    const o = document.createElement('option');
    o.value = `${h.name} — ${h.title}`;
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
    const label = document.createElement('span');
    label.textContent = `${h.name}${h.title ? ` — ${h.title}` : ''}`;
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
    row.append(label, minus, count, plus);
    box.appendChild(row);
  }
}
```
Import à compléter : `setManualCount, manualsTotal` depuis `./js/collection.mjs`.

- [ ] **Step 3: Vérifs** — `node --check app.js && node --test` ; served grep `function renderWishlist`, `function renderManuels`, `manualsTotal`.

- [ ] **Step 4: Commit**
```bash
git add app.js
git commit -m "$(printf 'feat: Wishlist and Manuals tabs\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 12: spec + [orchestrateur] déploiement

**Files:** `feh-collection-tracker-design.md`

- [ ] **Step 1: Spec** — §5.3, remplacer la note « Plan C v1 » par la forme **v2** réellement implémentée (`copies`, `date` dans `owned` ; racines `wanted` map `id→true` ; `manuals` map `id→entier`). Mentionner : onglets Catalogue/Caserne/Stats/Wishlist/Manuels, bouton [+] carte.

- [ ] **Step 2: Suite + push** — `node --test` → tout vert. `git push`.

- [ ] **Step 3: Déploiement** — attendre `pages build and deployment` → success.
```bash
B=https://drzeroes.github.io/feh-heroes-tracker
curl -s -o /dev/null -w '%{http_code}\n' "$B/js/stats.mjs"       # 200
curl -s -o /dev/null -w '%{http_code}\n' "$B/js/collection.mjs"   # 200
curl -s "$B/" | grep -c 'id="tabs"'                              # 1
```
Ouvrir le site (Ctrl+Shift+R) :
- 5 onglets ; l'onglet actif reste après rechargement (`localStorage['feh-view']`) ; le hash `#/stats` etc. marche en direct.
- Catalogue : **[+]** sur une carte l'ajoute (devient ✓ vert) sans ouvrir le détail.
- Détail d'un héros possédé : champs **Doubles**, **Obtenu le**, case **Voulu**.
- **Caserne** : liste des possédés, édition inline fusions/IV/Soutien ; poser un S ré-affiche la ligne qui perd son S.
- **Stats** : total %, 5 blocs de répartition (possédés / total), timeline si des dates sont saisies, top doubles, ligne wishlist.
- **Wishlist** : grille des héros « voulus ».
- **Manuels** : champ d'ajout (autocomplétion catalogue), lignes ± par héros, total.

---

## Self-Review

| Demande utilisateur | Task |
|---|---|
| Bouton sur la miniature pour ajouter un possédé | 5 (CSS), 7 |
| Écran Caserne (possédés, IV/fusion/S inline) | 4 (HTML), 5 (CSS), 6 (routeur), 9 |
| Écran Manuels (manuels de combat + quantité) | 1 (`manuals`), 11 |
| Onglet Stats (total %, répartitions, timeline, doubles, wishlist) | 2 (`js/stats.mjs`), 10 ; timeline via `date` (Task 1 + 8) |
| Wishlist | 1 (`wanted`), 8 (case), 11 |
| Profondeur collection : `copies`, `date` | 1, 8 |

**Placeholders :** aucun ; code complet à chaque étape. Tasks 4–11 (DOM) : vérifs servies + cross-check statique.

**Cohérence des types :**
- `js/collection.mjs` v2 : `migrateCollection` renvoie `{version:2, updated, owned, wanted, manuals}` — consommé tel quel par le routeur et les rendus.
- `emptyCollection` renvoie désormais `version: 2` → **le test v1 existant de `emptyCollection` doit être ajusté** (Task 1 Step 3).
- `js/stats.mjs` : `distribution/acquisitionTimeline/topCopies/wishlistSummary` — signatures fixées Task 2, appelées Task 10 avec `state.heroes` / `ownedIdSet(state.collection)` / `state.collection`.
- Routeur `state.view` ∈ `VIEWS` — mêmes 5 valeurs dans `index.html` (`data-view`), `VIEWS`, le hash, `localStorage['feh-view']`.
- `renderCaserne/renderStats/renderWishlist/renderManuels` : stubs Task 6, remplacés Tasks 9/10/11 (Wishlist+Manuels ensemble Task 11).
- `setSupport` (single-S) réutilisé dans la Caserne (Task 9) et l'éditeur détail (Plan C).
- `card(hero)` gagne `.card-add` (Task 7) — réutilisé tel quel par la grille Wishlist (Task 11).

---

## Execution Handoff

**1. Subagent-Driven (recommandé)** — Task 12 = orchestrateur.
**2. Inline Execution.**
