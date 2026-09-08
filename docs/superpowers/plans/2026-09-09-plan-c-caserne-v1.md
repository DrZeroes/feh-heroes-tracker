# Plan C — Caserne v1 (collection perso) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Permettre à l'utilisateur d'enregistrer *sa* collection dans le navigateur : marquer un héros **possédé**, saisir **fusions** (0–10), **IV +/−**, **rang Soutien de l'Invocateur** (C/B/A/**S**, un seul S) ; **filtrer** le catalogue par statut (tous / possédés / manquants) ; voir un **compteur X / total** ; **exporter / importer** un fichier `ma-collection.json`. Tout côté client, `localStorage`, aucun backend.

**Architecture :** un module pur `js/collection.mjs` (forme, migration, règle « un seul S », dérivés) testé sous `node --test`. `app.js` charge/écrit `localStorage['feh-collection-v1']`, ajoute un **éditeur** dans le panneau détail (toggle possédé + fusions + IV + soutien, sauvegarde immédiate), un **filtre statut**, un **compteur**, un **indicateur possédé** sur les cartes, et **export/import** JSON. Hors périmètre v1 : doubles, wishlist, projets +10, onglet Stats, Nouveaux héros, Ajouter un héros, mode ajout rapide → Plan C.2.

**Tech Stack :** HTML/CSS/JS ESM natif. `node --test`. Zéro dépendance, aucun build.

## Global Constraints

- `node --test` **sans argument** ; suite actuellement **91/91**, doit rester verte. `node --check app.js` doit passer.
- Chemins relatifs, ESM `.mjs`, LF endings, thème via tokens existants.
- **Fichier collection** — clé `localStorage` : `feh-collection-v1`. Forme :
  ```json
  {
    "version": 1,
    "updated": "YYYY-MM-DD",
    "owned": {
      "<WikiName>": { "merges": 0, "ivPlus": null, "ivMinus": null, "support": null }
    }
  }
  ```
  - `merges` : entier borné **0–10**.
  - `ivPlus` / `ivMinus` : `"hp" | "atk" | "spd" | "def" | "res" | null`.
  - `support` : `null | "C" | "B" | "A" | "S"`. **Au plus un héros** avec `"S"` : poser `"S"` sur un héros retire le `"S"` de tout autre.
  - Un héros est « possédé » ⇔ sa clé existe dans `owned`. Retirer = supprimer la clé.
- **Export** : télécharge `ma-collection.json` (le JSON ci-dessus, `updated` = date du jour). **Import** : lit un fichier, valide, puis **remplace** ou **fusionne** (demande à l'utilisateur) ; ignore les `id` inconnus du catalogue mais les conserve + avertit du nombre.
- `localStorage` : **tout accès** enveloppé `try/catch` (fenêtre privée / quota).
- `applyFilters` (pur, `js/catalog-view.mjs`) **ne change pas** — le filtrage par statut se fait via `filterByStatus` (nouveau, pur) appliqué dans `app.js` après `applyFilters` + `sortHeroes`.
- Commits : `feat:` / `fix:` / `test:` ; se terminent par
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## File Structure

| Fichier | Changement |
|---|---|
| `js/collection.mjs` | **Nouveau.** Pur : `emptyCollection`, `migrateCollection`, `clampMerges`, `setOwned`, `setSupport`, `ownedIdSet`, `collectionStats`, `filterByStatus`. |
| `js/collection.test.mjs` | **Nouveau.** |
| `i18n/en.json`, `i18n/fr.json` | + ~18 clés (statut, champs éditeur, soutien, export/import). |
| `i18n/i18n-keys.test.mjs` | `REQUIRED` mis à jour. |
| `index.html` | + `#status-filter` (select), `#collection-count` (span), `#export-btn`, `#import-btn`, `#import-file` (input hidden). |
| `styles.css` | états carte possédé/manquant ; lignes de l'éditeur détail ; boutons export/import. |
| `app.js` | chargement/sauvegarde collection ; éditeur dans `openDetail` ; filtre statut + compteur + indicateur carte ; export/import. |
| `feh-collection-tracker-design.md` | §5.3 : noter la forme v1 réduite (support ajouté, copies/project/wanted → C.2). |

---

## Task 1: `js/collection.mjs` — module pur

**Files:** Create `g:\GITHUB\feh-comp\js\collection.mjs` + `g:\GITHUB\feh-comp\js\collection.test.mjs`

**Interfaces:**
- `emptyCollection() -> { version: 1, updated: string, owned: {} }` (`updated` = `new Date().toISOString().slice(0,10)`).
- `clampMerges(n) -> number` — entier borné 0–10 (`NaN`/absent → 0).
- `migrateCollection(raw) -> Collection` — accepte un objet quelconque ; garde `owned` valide ; chaque entrée normalisée `{ merges: clampMerges, ivPlus: iv|null, ivMinus: iv|null, support: rank|null }` (`iv` ∈ hp/atk/spd/def/res ; `rank` ∈ C/B/A/S) ; `version: 1` ; `updated` conservé si string sinon date du jour. Entrée non-objet → ignorée.
- `setOwned(col, id, owned) -> Collection` — nouvel objet ; `owned=true` ajoute `{ merges:0, ivPlus:null, ivMinus:null, support:null }` si absent ; `owned=false` supprime la clé.
- `setSupport(col, id, rank) -> Collection` — `rank` ∈ `null|C|B|A|S` ; si `rank==='S'`, retire `support:'S'` de tout autre héros ; le héros `id` doit déjà être possédé (sinon renvoie `col` inchangé).
- `ownedIdSet(col) -> Set<string>`.
- `collectionStats(col, heroes) -> { owned: number, total: number, pct: number }` — `owned` = nb de clés de `col.owned` qui existent AUSSI dans `heroes` (par `id`) ; `total` = `heroes.length` ; `pct` = arrondi entier.
- `filterByStatus(heroes, ownedSet, status) -> Hero[]` — `status` ∈ `'all' | 'owned' | 'missing'` ; `'all'` renvoie l'entrée telle quelle.

- [ ] **Step 1: Test (RED)**

`js/collection.test.mjs` :
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCollection, clampMerges, migrateCollection, setOwned, setSupport,
  ownedIdSet, collectionStats, filterByStatus,
} from './collection.mjs';

test('emptyCollection', () => {
  const c = emptyCollection();
  assert.equal(c.version, 1);
  assert.deepEqual(c.owned, {});
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
  assert.deepEqual(c.owned.A, { merges: 10, ivPlus: 'atk', ivMinus: null, support: 'S' });
  assert.deepEqual(c.owned.B, { merges: 0, ivPlus: null, ivMinus: null, support: null });
  assert.ok(!('C' in c.owned));
  assert.equal(c.version, 1);
});

test('migrateCollection tolère un objet vide / non conforme', () => {
  assert.deepEqual(migrateCollection(null).owned, {});
  assert.deepEqual(migrateCollection({ owned: null }).owned, {});
});

test('setOwned ajoute / retire', () => {
  let c = emptyCollection();
  c = setOwned(c, 'Marth X', true);
  assert.deepEqual(c.owned['Marth X'], { merges: 0, ivPlus: null, ivMinus: null, support: null });
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
```

Run: `node --test js/collection.test.mjs` → FAIL.

- [ ] **Step 2: Implémentation**

`js/collection.mjs` :
```js
// js/collection.mjs — forme et dérivés de la collection perso. Pur, sans DOM.

const IVS = new Set(['hp', 'atk', 'spd', 'def', 'res']);
const RANKS = new Set(['C', 'B', 'A', 'S']);

const today = () => new Date().toISOString().slice(0, 10);

export function emptyCollection() {
  return { version: 1, updated: today(), owned: {} };
}

export function clampMerges(n) {
  const i = Math.floor(Number(n));
  if (!Number.isFinite(i) || i < 0) return 0;
  return i > 10 ? 10 : i;
}

function normEntry(e) {
  const o = e && typeof e === 'object' ? e : {};
  return {
    merges: clampMerges(o.merges),
    ivPlus: IVS.has(o.ivPlus) ? o.ivPlus : null,
    ivMinus: IVS.has(o.ivMinus) ? o.ivMinus : null,
    support: RANKS.has(o.support) ? o.support : null,
  };
}

export function migrateCollection(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawOwned = src.owned && typeof src.owned === 'object' ? src.owned : {};
  const owned = {};
  for (const [id, e] of Object.entries(rawOwned)) {
    if (e && typeof e === 'object') owned[id] = normEntry(e);
  }
  return {
    version: 1,
    updated: typeof src.updated === 'string' ? src.updated : today(),
    owned,
  };
}

export function setOwned(col, id, owned) {
  const next = migrateCollection(col);
  if (owned) {
    if (!next.owned[id]) next.owned[id] = { merges: 0, ivPlus: null, ivMinus: null, support: null };
  } else {
    delete next.owned[id];
  }
  next.updated = today();
  return next;
}

export function setSupport(col, id, rank) {
  const next = migrateCollection(col);
  if (!next.owned[id]) return col;
  const r = RANKS.has(rank) ? rank : null;
  if (r === 'S') {
    for (const [k, e] of Object.entries(next.owned)) {
      if (k !== id && e.support === 'S') e.support = null;
    }
  }
  next.owned[id] = { ...next.owned[id], support: r };
  next.updated = today();
  return next;
}

export function ownedIdSet(col) {
  return new Set(Object.keys(col && col.owned ? col.owned : {}));
}

export function collectionStats(col, heroes) {
  const set = ownedIdSet(col);
  const total = heroes.length;
  let owned = 0;
  for (const h of heroes) if (set.has(h.id)) owned += 1;
  return { owned, total, pct: total ? Math.round((owned / total) * 100) : 0 };
}

export function filterByStatus(heroes, ownedSet, status) {
  if (status === 'owned') return heroes.filter((h) => ownedSet.has(h.id));
  if (status === 'missing') return heroes.filter((h) => !ownedSet.has(h.id));
  return heroes;
}
```

Run: `node --test js/collection.test.mjs` → PASS. Puis `node --test`.

- [ ] **Step 3: Commit**
```bash
git add js/collection.mjs js/collection.test.mjs
git commit -m "$(printf 'feat: pure collection model (owned, merges, IV, support S rule)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: i18n

**Files:** `i18n/en.json`, `i18n/fr.json`, `i18n/i18n-keys.test.mjs`

**Interfaces:** clés présentes dans les deux langues :
`filter.status`, `status.all`, `status.owned`, `status.missing`,
`field.owned`, `field.merges`, `field.ivPlus`, `field.ivMinus`, `field.support`,
`support.none`, `support.C`, `support.B`, `support.A`, `support.S`,
`iv.none`, `iv.hp`, `iv.atk`, `iv.spd`, `iv.def`, `iv.res`,
`collection.count`, `action.export`, `action.import`, `import.mode`, `import.replace`, `import.merge`, `import.unknown`

- [ ] **Step 1: `REQUIRED` (RED)** — ajouter les clés ci-dessus au tableau `REQUIRED` de `i18n/i18n-keys.test.mjs`. `node --test i18n/i18n-keys.test.mjs` → FAIL.

- [ ] **Step 2: `i18n/en.json`** (ajouter) :
```json
  "filter.status": "Status",
  "status.all": "All",
  "status.owned": "Owned",
  "status.missing": "Missing",
  "field.owned": "Owned",
  "field.merges": "Merges",
  "field.ivPlus": "IV +",
  "field.ivMinus": "IV \u2212",
  "field.support": "Summoner Support",
  "support.none": "\u2014",
  "support.C": "C",
  "support.B": "B",
  "support.A": "A",
  "support.S": "S",
  "iv.none": "Neutral",
  "iv.hp": "HP",
  "iv.atk": "Atk",
  "iv.spd": "Spd",
  "iv.def": "Def",
  "iv.res": "Res",
  "collection.count": "{owned} / {total} owned ({pct}%)",
  "action.export": "Export",
  "action.import": "Import",
  "import.mode": "Import: replace your collection or merge into it?",
  "import.replace": "Replace",
  "import.merge": "Merge",
  "import.unknown": "{n} unknown hero id(s) kept as-is."
```

- [ ] **Step 3: `i18n/fr.json`** (ajouter) :
```json
  "filter.status": "Statut",
  "status.all": "Tous",
  "status.owned": "Poss\u00e9d\u00e9s",
  "status.missing": "Manquants",
  "field.owned": "Poss\u00e9d\u00e9",
  "field.merges": "Fusions",
  "field.ivPlus": "IV +",
  "field.ivMinus": "IV \u2212",
  "field.support": "Soutien de l'Invocateur",
  "support.none": "\u2014",
  "support.C": "C",
  "support.B": "B",
  "support.A": "A",
  "support.S": "S",
  "iv.none": "Neutre",
  "iv.hp": "PV",
  "iv.atk": "Atq",
  "iv.spd": "Vit",
  "iv.def": "D\u00e9f",
  "iv.res": "R\u00e9s",
  "collection.count": "{owned} / {total} poss\u00e9d\u00e9s ({pct}%)",
  "action.export": "Exporter",
  "action.import": "Importer",
  "import.mode": "Import : remplacer ta collection ou fusionner dedans ?",
  "import.replace": "Remplacer",
  "import.merge": "Fusionner",
  "import.unknown": "{n} id(s) de h\u00e9ros inconnus conserv\u00e9s tels quels."
```

- [ ] **Step 4: GREEN** — `node --test i18n/i18n-keys.test.mjs` → PASS. Puis `node --test`.

- [ ] **Step 5: Commit**
```bash
git add i18n/en.json i18n/fr.json i18n/i18n-keys.test.mjs
git commit -m "$(printf 'feat: i18n keys for collection editor and status filter\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: `index.html` — contrôles collection

**Files:** `index.html`

- [ ] **Step 1: Éditer**

Dans `.controls`, juste après le bloc `.group` (checkbox « Grouper par personnage ») :
```html
    <label class="status">
      <span data-i18n="filter.status">Statut</span>
      <select id="status-filter">
        <option value="all" data-i18n="status.all">Tous</option>
        <option value="owned" data-i18n="status.owned">Possédés</option>
        <option value="missing" data-i18n="status.missing">Manquants</option>
      </select>
    </label>
    <span id="collection-count" class="collection-count" aria-live="polite"></span>
```

Dans `.topbar`, juste avant `#theme-toggle` :
```html
    <button id="export-btn" type="button" class="lang" data-i18n="action.export">Export</button>
    <button id="import-btn" type="button" class="lang" data-i18n="action.import">Import</button>
    <input id="import-file" type="file" accept="application/json,.json" hidden>
```

- [ ] **Step 2: Vérif servie**
```bash
node scripts/serve.mjs 8160 & SV=$!; sleep 1
for id in status-filter collection-count export-btn import-btn import-file; do
  echo "$id: $(curl -s http://localhost:8160/ | grep -c "id=\"$id\"")"
done
kill $SV
```
Expected : chaque `1`.

- [ ] **Step 3: Commit**
```bash
git add index.html
git commit -m "$(printf 'feat: status filter, collection counter, export/import controls\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: `styles.css` — états carte + éditeur détail

**Files:** `styles.css`

- [ ] **Step 1: Ajouter**
```css
.card.is-owned::after {
  content: "\2713";
  position: absolute; top: .4rem; left: .4rem;
  width: 1.05rem; height: 1.05rem; line-height: 1.05rem; text-align: center;
  font-size: .8rem; font-weight: 700; color: #fff;
  background: var(--owned, #3fae52); border: 2px solid var(--card); border-radius: 50%;
}
.card.is-missing { opacity: .62; }
.card.is-missing:hover { opacity: 1; }

.status, .collection-count { display: flex; align-items: center; gap: .35rem; font-size: .85rem; color: var(--muted); }
.collection-count { font-weight: 600; color: var(--fg); }

.editor { display: grid; grid-template-columns: auto 1fr; gap: .45rem .8rem; align-items: center;
  margin: .9rem 0 0; padding-top: .8rem; border-top: 1px solid var(--border); }
.editor label { color: var(--muted); }
.editor input[type="number"], .editor select {
  width: 100%; padding: .3rem .4rem; border: 1px solid var(--border);
  border-radius: 6px; background: var(--card); color: var(--fg);
}
.editor .owned-row { grid-column: 1 / -1; display: flex; align-items: center; gap: .5rem; font-weight: 600; }
```

- [ ] **Step 2: Vérif** — `node scripts/serve.mjs 8161 & SV=$!; sleep 1; curl -s http://localhost:8161/styles.css | grep -c 'card.is-owned'; kill $SV` → `1`.

- [ ] **Step 3: Commit**
```bash
git add styles.css
git commit -m "$(printf 'feat: owned/missing card states and detail-panel editor styles\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: `app.js` — état collection + éditeur détail

**Files:** `app.js`

**Interfaces:**
- Consomme `js/collection.mjs` (Task 1). Nouveau `state.collection` (objet du module) chargé de `localStorage['feh-collection-v1']` via `migrateCollection`, sauvé à chaque changement.
- `openDetail(hero)` : à la fin du corps, ajoute un `<div class="editor">` : ligne « Possédé » (checkbox) ; si possédé, lignes Fusions (`<input type="number" min=0 max=10>`), IV + (`<select>` iv.none/hp/atk/spd/def/res), IV − (idem), Soutien (`<select>` support.none/C/B/A/S). Chaque `change` → mute `state.collection` via le module, `saveCollection()`, `refreshCard(hero.id)` + `updateCollectionCount()` ; changer « Possédé » re-render l'éditeur.

- [ ] **Step 1: Imports + état + load/save**

En tête de `app.js` :
```js
import {
  migrateCollection, emptyCollection, setOwned, setSupport, clampMerges,
  ownedIdSet, collectionStats, filterByStatus,
} from './js/collection.mjs';
```
Constantes : `const LS_COLLECTION = 'feh-collection-v1';`
Dans `state` : `collection: emptyCollection(), status: 'all',`
Helpers :
```js
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
```

- [ ] **Step 2: Éditeur dans `openDetail`**

À la fin de `openDetail(hero)` (après le `dl`) :
```js
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
      state.collection.owned[hero.id] = { ...entry, merges: v };
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
```

- [ ] **Step 3: `refreshCard`**

```js
function refreshCard(id) {
  for (const el of document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"]`)) {
    el.classList.toggle('is-owned', isOwned(id));
    el.classList.toggle('is-missing', !isOwned(id) && state.status !== 'owned');
  }
}
```
Dans `card(hero)` : après `el.className = 'card';` ajouter `el.dataset.id = hero.id;` puis
```js
  el.classList.toggle('is-owned', isOwned(hero.id));
```
(l'état `is-missing` est posé par `recompute` selon le filtre statut — voir Task 6.)

- [ ] **Step 4: `main()`**

Après `readPrefs()` : `loadCollection();`
Après `applyStaticI18n()` : `updateCollectionCount();`
Dans `setLang()` : après `applyStaticI18n()` : `updateCollectionCount();`

- [ ] **Step 5: Vérifs**
```bash
node --check app.js && node --test
node scripts/serve.mjs 8162 & SV=$!; sleep 1
curl -s http://localhost:8162/app.js | grep -c "from './js/collection.mjs'"   # 1
curl -s http://localhost:8162/app.js | grep -c 'updateCollectionCount'        # >=3
kill $SV
```
Cross-check (rapport) : ids `#collection-count` présents dans `index.html` ; `state.status` défaut `'all'`.

- [ ] **Step 6: Commit**
```bash
git add app.js
git commit -m "$(printf 'feat: collection state + detail-panel editor (owned/merges/IV/support)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 6: `app.js` — filtre statut + indicateur carte

**Files:** `app.js`

- [ ] **Step 1: `recompute()`** — après `state.view = sortHeroes(filtered, state.sort);` insérer :
```js
    state.view = filterByStatus(state.view, ownedIdSet(state.collection), state.status);
```
(avant `state.shown = 0;`).

Dans le rendu des cartes (mode grille **et** mode groupé), après création de la carte, poser `is-missing` :
le plus simple — dans `card(hero)`, remplacer la ligne `el.classList.toggle('is-owned', isOwned(hero.id));` par :
```js
  el.classList.toggle('is-owned', isOwned(hero.id));
  el.classList.toggle('is-missing', !isOwned(hero.id) && state.status !== 'owned');
```

- [ ] **Step 2: Handler + persistance**

Dans `main()`, après les autres `addEventListener` :
```js
  $('#status-filter').value = state.status;
  $('#status-filter').addEventListener('change', (e) => {
    state.status = e.target.value;
    writePrefs();
    recompute();
  });
```
Dans `readPrefs()` : après `state.group = !!p.group;` → `if (['all','owned','missing'].includes(p.status)) state.status = p.status;`
Dans `writePrefs()` : ajouter `status: state.status,` à l'objet sérialisé.
Dans le handler `#filter-reset` (Plan B.2) : ajouter `state.status = 'all'; $('#status-filter').value = 'all';` avant `recompute()`.

- [ ] **Step 3: Vérifs**
```bash
node --check app.js && node --test
node scripts/serve.mjs 8163 & SV=$!; sleep 1
curl -s http://localhost:8163/app.js | grep -c 'filterByStatus'          # >=1
curl -s http://localhost:8163/app.js | grep -c 'status-filter'           # >=2
kill $SV
```

- [ ] **Step 4: Commit**
```bash
git add app.js
git commit -m "$(printf 'feat: status filter (all/owned/missing) + missing-card dimming\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 7: `app.js` — export / import

**Files:** `app.js`

- [ ] **Step 1: Export**

Dans `main()` :
```js
  $('#export-btn').addEventListener('click', () => {
    const out = { ...state.collection, updated: new Date().toISOString().slice(0, 10) };
    const blob = new Blob([`${JSON.stringify(out, null, 2)}\n`], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ma-collection.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
```

- [ ] **Step 2: Import**

```js
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let incoming;
    try {
      incoming = migrateCollection(JSON.parse(await file.text()));
    } catch { alert(state.t('import.mode')); return; }
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
```
(`alert`/`confirm` sont acceptables pour la v1 — pas de dépendance, comportement bloquant simple.)

- [ ] **Step 3: Vérifs**
```bash
node --check app.js && node --test    # attendu inchangé (aucun test app.js), 91 + Task1(11) + = 102/102
node scripts/serve.mjs 8164 & SV=$!; sleep 1
curl -s http://localhost:8164/app.js | grep -c "download = 'ma-collection.json'"   # 1
curl -s http://localhost:8164/app.js | grep -c 'import-file'                       # >=2
kill $SV
```

- [ ] **Step 4: Commit**
```bash
git add app.js
git commit -m "$(printf 'feat: export/import ma-collection.json (replace or merge)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 8: spec + [orchestrateur] déploiement

**Files:** `feh-collection-tracker-design.md`

- [ ] **Step 1: Spec** — dans `feh-collection-tracker-design.md` §5.3, ajouter une note en tête :
> **Plan C v1 (implémenté) :** forme réduite `{ version:1, updated, owned: { <id>: { merges, ivPlus, ivMinus, support } } }` — `support` ∈ `null|C|B|A|S` (un seul `S`). `copies`, `project`, `wanted` restent prévus pour Plan C.2.

Commit :
```bash
git add feh-collection-tracker-design.md
git commit -m "$(printf 'docs: note Plan C v1 reduced collection shape (+ support rank)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

- [ ] **Step 2: Suite + push** — `node --test` → tout vert. `git push`.

- [ ] **Step 3: Déploiement** — attendre `pages build and deployment` → success.
```bash
B=https://drzeroes.github.io/feh-heroes-tracker
curl -s -o /dev/null -w '%{http_code}\n' "$B/js/collection.mjs"      # 200
curl -s "$B/" | grep -c 'id="status-filter"'                        # 1
```
Ouvrir le site (Ctrl+Shift+R) : ouvrir un héros → cocher **Possédé** → régler fusions/IV/soutien → la carte prend le ✓ vert, le compteur monte ; filtre **Statut = Possédés** ne montre que les possédés ; **Export** télécharge `ma-collection.json` ; **Import** de ce fichier (fusion ou remplacement) restaure l'état ; poser un **Soutien S** sur un 2ᵉ héros retire le S du 1ᵉʳ.

---

## Self-Review

**Couverture demande utilisateur (caserne v1) :**

| Élément | Task |
|---|---|
| Ajouter un héros à la caserne (possédé) | 1 (`setOwned`), 5 (toggle) |
| Nombre de fusions | 1 (`clampMerges`), 5 (input 0–10) |
| IV +/− | 1 (normalisation), 5 (selects) |
| Rank S (Soutien de l'Invocateur, un seul S) | 1 (`setSupport`), 5 (select) |
| Filtre statut (tous/possédés/manquants) | 1 (`filterByStatus`), 6 |
| Compteur X / total | 1 (`collectionStats`), 5 (`updateCollectionCount`) |
| Export / Import JSON | 7 |
| Persistance navigateur | 5 (`loadCollection`/`saveCollection`, `localStorage` try/catch) |

**Placeholders :** aucun ; code complet à chaque étape. Tasks 3–7 (DOM) ont vérifs servies + cross-check statique (cohérent avec Plans B/B.1).

**Cohérence des types :**
- `js/collection.mjs` : signatures fixées Task 1, consommées telles quelles Tasks 5–7 (`migrateCollection`, `setOwned`, `setSupport`, `clampMerges`, `ownedIdSet`, `collectionStats`, `filterByStatus`).
- `collection.count` prend `{owned,total,pct}` — exactement la forme renvoyée par `collectionStats` (Task 1) ; l'app passe `s` directement à `state.t` (Task 5).
- `state.status` ∈ `all|owned|missing` — mêmes 3 valeurs dans `<select>` (Task 3), `filterByStatus` (Task 1), `readPrefs`/reset (Task 6).
- Clé `localStorage` `feh-collection-v1` — Global Constraints + Task 5.
- `state.collection.owned[id]` forme `{merges,ivPlus,ivMinus,support}` — produite par `migrateCollection`/`setOwned` (Task 1), lue par l'éditeur (Task 5).

---

## Execution Handoff

**1. Subagent-Driven (recommandé)** — Task 8 = orchestrateur.
**2. Inline Execution.**
