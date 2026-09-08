# Plan B.1 — Finition catalogue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cinq finitions du catalogue lecture seule : (1) cadre couleur sur la carte, (2) badge rareté `3★/4★/5★`, (3) bouton « Réinitialiser les filtres », (4) tri qui bascule ↑/↓ au re-clic, (5) épithètes FR (`titleFr`) tirées de la localisation officielle du jeu, avec repli sur l'anglais.

**Architecture :** (1)–(4) sont des retouches de `app.js` / `styles.css` / `index.html` / `i18n/*` + une extension de `sortHeroes` dans `js/catalog-view.mjs`. (5) ajoute un module pur `scripts/lib/locale.mjs` + un script occasionnel `scripts/fetch-locale.mjs` qui produit un artefact commité `data/locale-fr.json` (~1000 épithètes) ; `fetch-heroes.mjs` le lit et remplit `titleFr` ; l'app affiche `titleFr` en mode FR.

**Tech Stack :** HTML/CSS/JS ESM natif ; Node ≥ 20 + `node --test` pour le pipeline ; zéro dépendance npm, aucun build.

## Global Constraints

- Tests : `node --test` **sans argument**. Zéro dépendance npm, aucun `package.json`, aucun build.
- `data/heroes.json` et `data/locale-fr.json` sont **générés** ; `JSON.stringify(obj, null, 2)` + `\n` final.
- Forme héros = **23 clés** (inchangée). `titleFr` (déjà présent, valait `null`) est désormais rempli quand une épithète FR officielle existe, sinon reste `null`.
- Source FR : dépôt `HertzDevil/feh-assets-json`, branche `book7-2023`, dossiers `files/assets/USEN/Message/Data/` et `files/assets/EUFR/Message/Data/`. Clés `MPID_<jpId>` = nom, `MPID_HONOR_<jpId>` = épithète. Jointure catalogue via `(name, title)` EN, avec repli sur une clé normalisée (minuscule, ponctuation compressée).
- Couverture attendue : ~1000 / 1410 héros (dump figé sept. 2023) ; les autres gardent `titleFr = null` → l'app affiche l'épithète anglaise.
- i18n : la langue reste `localStorage['feh-lang']`, fallback `en` → clé brute. En mode `fr`, l'épithète affichée = `hero.titleFr ?? hero.title`.
- `sortHeroes(heroes, key)` — `key` ∈ `'release-desc' | 'release-asc' | 'name-asc' | 'name-desc'`. Ne mute pas l'entrée.
- Commits : préfixes `feat:` / `chore:` / `test:` ; se terminent par
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## File Structure

| Fichier | Changement |
|---|---|
| `js/catalog-view.mjs` | `sortHeroes` gère 4 clés (ajout `release-asc`, `name-desc`). |
| `js/catalog-view.test.mjs` | + tests des 2 nouvelles clés. |
| `i18n/en.json`, `i18n/fr.json` | + `filter.reset`, `sort.byDate`, `sort.byName` ; `sort.releaseDesc`/`sort.nameAsc` supprimées. |
| `i18n/i18n-keys.test.mjs` | `REQUIRED` mis à jour. |
| `index.html` | Bouton reset ; le `<select id="sort">` devient 2 boutons `#sort-date` / `#sort-name` + glyphe de sens. |
| `styles.css` | `.card` cadre couleur ; `.card .rarity` ; `.reset` ; `.sortbtn`. |
| `app.js` | Carte : cadre couleur + badge rareté + épithète FR ; handlers reset & tri-bascule ; `epithetFor(hero)`. |
| `scripts/lib/locale.mjs` | **Nouveau.** Pur : `indexMessages`, `buildFrTitleIndex`, `normalizeTitleKey`, `frTitleFor`. |
| `scripts/lib/locale.test.mjs` | **Nouveau.** |
| `scripts/fetch-locale.mjs` | **Nouveau.** Télécharge les dumps EN+FR, écrit `data/locale-fr.json`. |
| `scripts/fetch-locale.test.mjs` | **Nouveau.** Smoke avec `fetchImpl` bouché. |
| `scripts/fetch-heroes.mjs` | Lit `data/locale-fr.json`, remplit `titleFr` avant les overrides. |
| `scripts/fetch-heroes.test.mjs` | + assertion `titleFr`. |
| `scripts/heroes-catalog.test.mjs` | + invariant `titleFr` (string non vide ou null). |
| `data/locale-fr.json` | **Généré + commité.** |
| `feh-collection-tracker-design.md` | §3 + §5.1 : `titleFr` source + format. |

---

## Task 1: `sortHeroes` — 4 directions

**Files:**
- Modify: `g:\GITHUB\feh-comp\js\catalog-view.mjs`
- Test: `g:\GITHUB\feh-comp\js\catalog-view.test.mjs` (append)

**Interfaces:**
- Produces: `sortHeroes(heroes, key)` accepte `'release-desc'` (défaut), `'release-asc'`, `'name-asc'`, `'name-desc'`. Tie-breaks : `release-*` → puis `name` asc ; `name-*` → puis `releaseDate` desc. Copie l'entrée.

- [ ] **Step 1: Test qui échoue**

Ajouter à `js/catalog-view.test.mjs` :

```js
test('sortHeroes : release-asc (plus anciens d\'abord)', () => {
  const out = sortHeroes(DATA, 'release-asc');
  assert.deepEqual(out.map((h) => h.name), ['Bravo', 'Charlie', 'Charlie', 'Alpha']);
});

test('sortHeroes : name-desc', () => {
  const out = sortHeroes(DATA, 'name-desc');
  assert.deepEqual(out.map((h) => `${h.name}${h.title}`), ['CharlieAlt', 'Charlie', 'Bravo', 'Alpha']);
});

test('sortHeroes : clé inconnue -> release-desc', () => {
  assert.deepEqual(
    sortHeroes(DATA, 'bogus').map((h) => h.name),
    sortHeroes(DATA, 'release-desc').map((h) => h.name),
  );
});
```

(`DATA` de Task 8 de Plan B : Bravo=2024-06-01, Charlie=2024-06-01, Charlie/Alt=2025-03-03, Alpha=2026-01-01. Pour `release-asc` : dates asc puis nom asc → Bravo(2024-06), Charlie(2024-06), Charlie/Alt(2025-03), Alpha(2026-01). Pour `name-desc` : nom Z→A puis date desc → CharlieAlt(2025) avant Charlie(2024), puis Bravo, Alpha.)

- [ ] **Step 2: Vérifier l'échec**

Run: `node --test js/catalog-view.test.mjs`
Expected: FAIL — `release-asc` renvoie encore l'ordre `release-desc`.

- [ ] **Step 3: Implémentation**

Dans `js/catalog-view.mjs`, remplacer `sortHeroes` par :

```js
function cmpName(a, b) {
  return String(a.name).localeCompare(String(b.name));
}

export function sortHeroes(heroes, key = 'release-desc') {
  const out = [...heroes];
  switch (key) {
    case 'release-asc':
      out.sort((a, b) => {
        const d = -cmpReleaseDesc(a, b);
        return d !== 0 ? d : cmpName(a, b);
      });
      break;
    case 'name-asc':
      out.sort((a, b) => cmpName(a, b) || cmpReleaseDesc(a, b));
      break;
    case 'name-desc':
      out.sort((a, b) => -cmpName(a, b) || cmpReleaseDesc(a, b));
      break;
    case 'release-desc':
    default:
      out.sort(cmpReleaseDesc);
      break;
  }
  return out;
}
```

(`cmpReleaseDesc` existe déjà dans le fichier et gère déjà le tie-break `name` asc ; `-cmpReleaseDesc` inverse la partie date mais garde le tie-break — acceptable, les dates égales sont rares et l'ordre secondaire reste déterministe.)

- [ ] **Step 4: Vérifier le succès**

Run: `node --test js/catalog-view.test.mjs` → PASS. Puis `node --test`.

- [ ] **Step 5: Commit**

```bash
git add js/catalog-view.mjs js/catalog-view.test.mjs
git commit -m "$(printf 'feat: sortHeroes supports asc/desc for both dimensions\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: i18n — reset + libellés de tri

**Files:**
- Modify: `g:\GITHUB\feh-comp\i18n\en.json`, `g:\GITHUB\feh-comp\i18n\fr.json`
- Modify: `g:\GITHUB\feh-comp\i18n\i18n-keys.test.mjs`

**Interfaces:**
- Produces : clés `filter.reset`, `sort.byDate`, `sort.byName` présentes dans les 2 langues ; `sort.releaseDesc` / `sort.nameAsc` retirées ; `sort.label` conservée.

- [ ] **Step 1: Mettre à jour le test (RED)**

Dans `i18n/i18n-keys.test.mjs`, dans le tableau `REQUIRED` :
- retirer `'sort.releaseDesc', 'sort.nameAsc'`
- ajouter `'filter.reset', 'sort.byDate', 'sort.byName'`

Run: `node --test i18n/i18n-keys.test.mjs` → FAIL (clés manquantes dans en/fr).

- [ ] **Step 2: `i18n/en.json`**

Retirer les lignes `"sort.releaseDesc"` et `"sort.nameAsc"`. Ajouter (près de `"sort.label"`) :
```json
  "sort.byDate": "Date",
  "sort.byName": "Name",
```
Ajouter (près de `"filter.any"`) :
```json
  "filter.reset": "Reset filters",
```

- [ ] **Step 3: `i18n/fr.json`**

Retirer `"sort.releaseDesc"` et `"sort.nameAsc"`. Ajouter :
```json
  "sort.byDate": "Date",
  "sort.byName": "Nom",
```
```json
  "filter.reset": "Réinitialiser les filtres",
```

- [ ] **Step 4: GREEN**

Run: `node --test i18n/i18n-keys.test.mjs` → PASS. Puis `node --test`.

- [ ] **Step 5: Commit**

```bash
git add i18n/en.json i18n/fr.json i18n/i18n-keys.test.mjs
git commit -m "$(printf 'feat: i18n keys for reset button and toggle sort\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: `index.html` — bouton reset + tri en boutons

**Files:**
- Modify: `g:\GITHUB\feh-comp\index.html`

**Interfaces:**
- Produces : dans `.controls` — un `<button id="filter-reset" data-i18n="filter.reset">` ; le bloc `<label class="sort">…<select id="sort">…</select></label>` remplacé par :

```html
    <div class="sort" role="group" aria-label="sort">
      <span data-i18n="sort.label">Tri</span>
      <button type="button" class="sortbtn" id="sort-date" data-sortkey="release" data-i18n="sort.byDate">Date</button>
      <button type="button" class="sortbtn" id="sort-name" data-sortkey="name" data-i18n="sort.byName">Nom</button>
    </div>
```

- [ ] **Step 1: Éditer `index.html`**

Remplacer l'ancien `<label class="sort">…</label>` par le bloc ci-dessus. Juste après le `</div>` de `#filters` (avant le bloc `.sort`), ajouter :
```html
    <button type="button" class="reset" id="filter-reset" data-i18n="filter.reset">Réinitialiser les filtres</button>
```

- [ ] **Step 2: Vérif structurelle**

```bash
node scripts/serve.mjs 8140 &
SV=$!; sleep 1
curl -s http://localhost:8140/ | grep -c 'id="filter-reset"'   # 1
curl -s http://localhost:8140/ | grep -c 'id="sort-date"'       # 1
curl -s http://localhost:8140/ | grep -c 'id="sort-name"'       # 1
curl -s http://localhost:8140/ | grep -c '<select id="sort"'    # 0
kill $SV
```
Expected: `1 1 1 0`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(printf 'feat: reset button and toggle-sort buttons in shell\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: `styles.css` — cadre couleur, badge rareté, boutons

**Files:**
- Modify: `g:\GITHUB\feh-comp\styles.css`

- [ ] **Step 1: Ajouter à `styles.css`** (après la règle `.card { … }` existante)

```css
.card {
  border-width: 1px 1px 1px 4px;
  border-left-color: var(--card-accent, var(--border));
}
.card .rarity {
  position: absolute; bottom: .45rem; left: .5rem;
  font-size: .66rem; font-weight: 700;
  background: color-mix(in srgb, var(--fg) 12%, transparent);
  color: var(--fg); border-radius: 6px; padding: .02rem .3rem;
}
.reset {
  border: 1px solid var(--border); background: var(--card); color: var(--fg);
  border-radius: 8px; padding: .4rem .7rem; cursor: pointer; font-size: .85rem;
}
.reset:hover { border-color: var(--accent); }
.sortbtn {
  border: 1px solid var(--border); background: var(--card); color: var(--fg);
  border-radius: 8px; padding: .35rem .6rem; cursor: pointer; font: inherit;
}
.sortbtn[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.sortbtn[aria-pressed="true"]::after { content: attr(data-dir); margin-left: .3rem; }
```

- [ ] **Step 2: Vérif servie** — `node scripts/serve.mjs 8141 &` → `curl -s .../styles.css | grep -c 'card-accent'` → `1` → `kill`.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "$(printf 'feat: colour frame, rarity badge, reset/sort button styles\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: `app.js` — carte enrichie + handlers reset & tri

**Files:**
- Modify: `g:\GITHUB\feh-comp\app.js`

**Interfaces:**
- Consumes : `sortHeroes` 4-clés (Task 1) ; hooks `#filter-reset`, `#sort-date`, `#sort-name` (Task 3) ; classes `.rarity` / `--card-accent` (Task 4) ; `hero.titleFr`, `hero.poolRarity`.
- Produces : rien d'exporté. `state.sort` prend les 4 valeurs `release-desc|release-asc|name-asc|name-desc`.

- [ ] **Step 1: Ajouter le helper d'épithète** — après la déclaration de `state` :

```js
function epithetFor(hero) {
  return state.lang === 'fr' && hero.titleFr ? hero.titleFr : hero.title;
}
```

- [ ] **Step 2: Carte — cadre couleur + rareté + épithète FR.** Dans `card(hero)` :
  - après `el.className = 'card';` ajouter `el.style.setProperty('--card-accent', colorHex(hero.color));`
  - remplacer `ep.textContent = hero.title;` par `ep.textContent = epithetFor(hero);`
  - après le bloc `icons`, ajouter :
    ```js
    if (hero.poolRarity != null) {
      const r = document.createElement('span');
      r.className = 'rarity';
      r.textContent = `${hero.poolRarity}★`;
      el.appendChild(r);
    }
    ```

- [ ] **Step 3: Panneau détail — épithète FR.** Dans `openDetail`, remplacer `ep.textContent = hero.title;` par `ep.textContent = epithetFor(hero);`

- [ ] **Step 4: Tri en boutons.** Remplacer le listener `$('#sort').addEventListener('change', …)` et la ligne `$('#sort').value = state.sort;` par une fonction `syncSortButtons()` + des listeners :

```js
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
```

Dans `main()` : retirer `$('#sort').value = state.sort;` ; après `applyStaticI18n()` appeler `syncSortButtons()` ; ajouter
```js
  $('#sort-date').addEventListener('click', () => onSortClick('release'));
  $('#sort-name').addEventListener('click', () => onSortClick('name'));
```
et dans `setLang()` appeler `syncSortButtons()` après `applyStaticI18n()`.

- [ ] **Step 5: Bouton reset.** Dans `main()`, ajouter :
```js
  $('#filter-reset').addEventListener('click', () => {
    for (const f of FACETS) state.filters[f] = null;
    state.query = '';
    $('#search').value = '';
    for (const sel of document.querySelectorAll('#filters select')) sel.value = '';
    writePrefs();
    recompute();
  });
```

- [ ] **Step 6: Vérifs**

```bash
node --check app.js
node --test
node scripts/serve.mjs 8142 &
SV=$!; sleep 1
curl -s http://localhost:8142/app.js | grep -c 'epithetFor'      # >=3
curl -s http://localhost:8142/app.js | grep -c "onSortClick"     # >=3
kill $SV
```
Static cross-check (record in report) : les ids `#filter-reset`, `#sort-date`, `#sort-name` existent dans `index.html` ; `state.sort` par défaut `'release-desc'` ∈ des 4 clés de `sortHeroes`.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "$(printf 'feat: colour frame, rarity badge, FR epithet, reset, toggle sort\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 6: `scripts/lib/locale.mjs` — index d'épithètes FR

**Files:**
- Create: `g:\GITHUB\feh-comp\scripts\lib\locale.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\lib\locale.test.mjs`

**Interfaces:**
- Produces :
  - `indexMessages(entries: Array<{key,value}>) -> Record<string,string>` — map `key → value`.
  - `normalizeTitleKey(name: string, title: string) -> string` — `\`${name}\`+\`\\u001f\`+\`${title}\`` en minuscule, apostrophes typographiques → `'`, `&` → `and`, espaces compressés, trim.
  - `buildFrTitleIndex(enMsg: Record<string,string>, frMsg: Record<string,string>) -> { exact: Map<string,string>, norm: Map<string,string> }` — pour chaque clé `MPID_<jp>` de `enMsg` telle que `MPID_HONOR_<jp>` existe : `enName = enMsg['MPID_'+jp]`, `enHonor = enMsg['MPID_HONOR_'+jp]`, `frHonor = frMsg['MPID_HONOR_'+jp]`. Si `enName && enHonor && frHonor` : `exact.set(\`${enName}\u001f${enHonor}\`, frHonor)` et `norm.set(normalizeTitleKey(enName, enHonor), frHonor)`.
  - `frTitleFor(name: string, title: string, index) -> string|null` — `index.exact.get(\`${name}\u001f${title}\`) ?? index.norm.get(normalizeTitleKey(name, title)) ?? null`.

- [ ] **Step 1: Test (RED)**

`scripts/lib/locale.test.mjs` :

```js
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
    normalizeTitleKey('Anna', 'Commander \u2019n Chief'),
    normalizeTitleKey('anna', "commander 'n  chief"),
  );
  assert.equal(normalizeTitleKey('A & B', 'X'), 'a and b\u001fx');
});

test('buildFrTitleIndex + frTitleFor : exact puis normalisé', () => {
  const en = {
    'MPID_ex1': 'Eliwood', 'MPID_HONOR_ex1': 'Pledged Friend',
    'MPID_ex2': 'Anna', 'MPID_HONOR_ex2': "Commander \u2019n Chief",
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
```

Run: `node --test scripts/lib/locale.test.mjs` → FAIL.

- [ ] **Step 2: Implémentation**

`scripts/lib/locale.mjs` :

```js
// scripts/lib/locale.mjs — construit un index d'épithètes FR depuis les dumps de messages. Pur.

export function indexMessages(entries) {
  const out = {};
  for (const e of entries ?? []) {
    if (e && typeof e.key === 'string') out[e.key] = e.value;
  }
  return out;
}

export function normalizeTitleKey(name, title) {
  const norm = (s) => String(s ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${norm(name)}\u001f${norm(title)}`;
}

export function buildFrTitleIndex(enMsg, frMsg) {
  const exact = new Map();
  const norm = new Map();
  for (const key of Object.keys(enMsg)) {
    if (!key.startsWith('MPID_') || key.startsWith('MPID_HONOR_')) continue;
    const jp = key.slice('MPID_'.length);
    const enName = enMsg[key];
    const enHonor = enMsg[`MPID_HONOR_${jp}`];
    const frHonor = frMsg[`MPID_HONOR_${jp}`];
    if (!enName || !enHonor || !frHonor) continue;
    exact.set(`${enName}\u001f${enHonor}`, frHonor);
    norm.set(normalizeTitleKey(enName, enHonor), frHonor);
  }
  return { exact, norm };
}

export function frTitleFor(name, title, index) {
  return (
    index.exact.get(`${name}\u001f${title}`)
    ?? index.norm.get(normalizeTitleKey(name, title))
    ?? null
  );
}
```

Run: `node --test scripts/lib/locale.test.mjs` → PASS. Puis `node --test`.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/locale.mjs scripts/lib/locale.test.mjs
git commit -m "$(printf 'feat: FR epithet index builder from game message dumps\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 7: `scripts/fetch-locale.mjs`

**Files:**
- Create: `g:\GITHUB\feh-comp\scripts\fetch-locale.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\fetch-locale.test.mjs`

**Interfaces:**
- Consumes : `data/heroes.json` (pour les couples `(name,title)` à résoudre), l'API GitHub contents + les fichiers raw du dépôt `feh-assets-json`.
- Produces : `run(opts?) -> Promise<{ count, matched, missed }>`. `opts` = `{ fetchImpl?, sleepImpl?, pauseMs?, catalogPath?, outPath?, ref? }`.
  Effet : écrit `outPath` (défaut `data/locale-fr.json`) =
  `{ generatedAt, source, ref, count, titles: { "<enName>\u001f<enTitle>": "<frTitle>" } }`, uniquement les entrées qui matchent un héros du catalogue.
  `main` seulement si lancé directement.

- [ ] **Step 1: Test (RED)**

`scripts/fetch-locale.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './fetch-locale.mjs';

test('run résout titleFr pour les héros du catalogue et écrit locale-fr.json', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'feh-locale-'));
  const catalogPath = path.join(dir, 'heroes.json');
  await writeFile(catalogPath, JSON.stringify({
    heroes: [
      { name: 'Eliwood', title: 'Pledged Friend' },
      { name: 'Anna', title: "Commander 'n Chief" },
      { name: 'Brandnew', title: 'Not In Dump' },
    ],
  }), 'utf8');
  const outPath = path.join(dir, 'locale-fr.json');

  // fetchImpl route : /contents -> liste ; raw USEN/EUFR -> contenu
  const enFile = [
    { key: 'MPID_e', value: 'Eliwood' }, { key: 'MPID_HONOR_e', value: 'Pledged Friend' },
    { key: 'MPID_a', value: 'Anna' }, { key: 'MPID_HONOR_a', value: 'Commander \u2019n Chief' },
  ];
  const frFile = [
    { key: 'MPID_HONOR_e', value: 'Ami loyal' },
    { key: 'MPID_HONOR_a', value: 'Cheffe en chef' },
  ];
  const fetchImpl = async (url) => {
    if (url.includes('api.github.com') && url.includes('USEN')) {
      return { ok: true, status: 200, json: async () => [{ name: 'D.json', download_url: 'https://raw/USEN/D.json' }] };
    }
    if (url.includes('api.github.com') && url.includes('EUFR')) {
      return { ok: true, status: 200, json: async () => [{ name: 'D.json', download_url: 'https://raw/EUFR/D.json' }] };
    }
    if (url === 'https://raw/USEN/D.json') return { ok: true, status: 200, json: async () => enFile };
    if (url === 'https://raw/EUFR/D.json') return { ok: true, status: 200, json: async () => frFile };
    throw new Error(`unexpected url ${url}`);
  };

  const res = await run({ fetchImpl, sleepImpl: async () => {}, pauseMs: 0, catalogPath, outPath });
  assert.equal(res.matched, 2);
  assert.equal(res.missed, 1);
  const written = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(written.titles['Eliwood\u001fPledged Friend'], 'Ami loyal');
  assert.equal(written.titles["Anna\u001fCommander 'n Chief"], 'Cheffe en chef');
  assert.equal(Object.keys(written.titles).length, 2);
});
```

Run: `node --test scripts/fetch-locale.test.mjs` → FAIL.

- [ ] **Step 2: Implémentation**

`scripts/fetch-locale.mjs` :

```js
// scripts/fetch-locale.mjs — construit data/locale-fr.json depuis les dumps de messages FEH.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { indexMessages, buildFrTitleIndex, frTitleFor } from './lib/locale.mjs';

const REPO = 'HertzDevil/feh-assets-json';
const DEFAULT_REF = 'book7-2023';
const UA = 'feh-collection-tracker/1.0 (+https://github.com/DrZeroes/feh-heroes-tracker) locale fetch';
const RETRYABLE = new Set([403, 429, 500, 502, 503, 504]);
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, { fetchImpl, sleepImpl, pauseMs, maxRetries = 4 }) {
  let attempt = 0;
  for (;;) {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (RETRYABLE.has(res.status) && attempt < maxRetries) {
      attempt += 1;
      await sleepImpl(pauseMs * 2 ** attempt);
      continue;
    }
    throw new Error(`locale fetch HTTP ${res.status} for ${url}`);
  }
}

async function loadLang(langDir, ctx) {
  const listUrl = `https://api.github.com/repos/${REPO}/contents/files/assets/${langDir}/Message/Data?ref=${ctx.ref}`;
  const list = await getJson(listUrl, ctx);
  const merged = {};
  for (const entry of list) {
    if (!entry.name.endsWith('.json')) continue;
    const arr = await getJson(entry.download_url, ctx);
    Object.assign(merged, indexMessages(arr));
    await ctx.sleepImpl(ctx.pauseMs);
  }
  return merged;
}

export async function run({
  fetchImpl = globalThis.fetch,
  sleepImpl = defaultSleep,
  pauseMs = 300,
  catalogPath = new URL('../data/heroes.json', import.meta.url),
  outPath = new URL('../data/locale-fr.json', import.meta.url),
  ref = DEFAULT_REF,
} = {}) {
  const ctx = { fetchImpl, sleepImpl, pauseMs, ref };
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const enMsg = await loadLang('USEN', ctx);
  const frMsg = await loadLang('EUFR', ctx);
  const index = buildFrTitleIndex(enMsg, frMsg);

  const titles = {};
  let matched = 0;
  let missed = 0;
  for (const h of catalog.heroes ?? []) {
    const fr = frTitleFor(h.name, h.title, index);
    if (fr) { titles[`${h.name}\u001f${h.title}`] = fr; matched += 1; }
    else missed += 1;
  }

  const outObj = {
    generatedAt: new Date().toISOString(),
    source: `${REPO}@${ref} USEN+EUFR Message/Data`,
    ref,
    count: matched,
    titles,
  };
  await writeFile(outPath, `${JSON.stringify(outObj, null, 2)}\n`, 'utf8');
  return { count: (catalog.heroes ?? []).length, matched, missed };
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  run().then(
    (r) => console.log(`[fetch-locale] ${r.matched}/${r.count} épithètes FR (${r.missed} sans correspondance)`),
    (err) => { console.error(err); process.exitCode = 1; },
  );
}
```

Run: `node --test scripts/fetch-locale.test.mjs` → PASS. Puis `node --test`.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-locale.mjs scripts/fetch-locale.test.mjs
git commit -m "$(printf 'feat: fetch-locale builds data/locale-fr.json from message dumps\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 8: `fetch-heroes.mjs` — appliquer `titleFr`

**Files:**
- Modify: `g:\GITHUB\feh-comp\scripts\fetch-heroes.mjs`
- Modify: `g:\GITHUB\feh-comp\scripts\fetch-heroes.test.mjs`
- Modify: `g:\GITHUB\feh-comp\scripts\heroes-catalog.test.mjs`
- Modify: `g:\GITHUB\feh-comp\feh-collection-tracker-design.md`

**Interfaces:**
- Consumes : `data/locale-fr.json` (optionnel — absent → `titleFr` reste `null` partout).
- Produces : `run()` gagne l'option `localePath` (défaut `../data/locale-fr.json`). Après `heroes = units.map(... mergeJoins ...)` et **avant** `applyOverrides`, pour chaque héros : `hero.titleFr = localeTitles[`${hero.name}\u001f${hero.title}`] ?? null`. Les overrides `patch` peuvent toujours écraser `titleFr`.

- [ ] **Step 1: Tests (RED)**

Dans `scripts/fetch-heroes.test.mjs`, test `run normalise, joint, trie et écrit le catalogue` : passer une option `localePath` vers un fichier tmp écrit dans le test avec
`{ "titles": { "Rhea\u001fThe Final Child": "L'Enfant ultime" } }`, puis
```js
  assert.equal(first.titleFr, "L'Enfant ultime");
```
Ajouter un 2ᵉ test : sans `localePath` (fichier absent) → `first.titleFr === null`.

Dans `scripts/heroes-catalog.test.mjs`, ajouter :
```js
test('catalog: titleFr est une chaîne non vide ou null', () => {
  for (const h of catalog.heroes) {
    assert.ok(h.titleFr === null || (typeof h.titleFr === 'string' && h.titleFr.length > 0), h.id);
  }
});
```

Run: `node --test` → les nouveaux tests fetch-heroes échouent (titleFr toujours `null`).

- [ ] **Step 2: Implémentation** dans `scripts/fetch-heroes.mjs`

Ajouter le paramètre `localePath = new URL('../data/locale-fr.json', import.meta.url)` à `run({...})`.
Après le bloc qui construit `heroes` via `mergeJoins` et **avant** le `console.warn` des orphelins / `applyOverrides` :

```js
  let localeTitles = {};
  try {
    localeTitles = JSON.parse(await readFile(localePath, 'utf8')).titles ?? {};
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  for (const h of heroes) {
    h.titleFr = localeTitles[`${h.name}\u001f${h.title}`] ?? null;
  }
```

(`readFile` est déjà importé.)

- [ ] **Step 3: Spec**

Dans `feh-collection-tracker-design.md` §3, après le paragraphe `Origin` ajouter :
> **`titleFr`** : épithète française officielle, résolue par `scripts/fetch-locale.mjs` depuis les dumps de messages `USEN`/`EUFR` de `HertzDevil/feh-assets-json@book7-2023` (jointure `(name, title)` EN, repli clé normalisée), stockée dans `data/locale-fr.json` puis appliquée par `fetch-heroes.mjs`. `null` si non résolu (héros post-sept. 2023 ou mismatch) → l'app affiche l'épithète EN. Overridable via `patch`.

Dans §5.1, mettre `"titleFr": "L'Enfant ultime",` dans l'exemple (au lieu de `null`) + note « Rév. 2026-09-08e : `titleFr` rempli via `data/locale-fr.json` ».

- [ ] **Step 4: GREEN**

Run: `node --test` → `fetch-heroes` verts. `heroes-catalog` : le nouvel invariant `titleFr` passe (l'ancien `data/heroes.json` a `titleFr: null` partout — valide). Tout vert.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-heroes.mjs scripts/fetch-heroes.test.mjs scripts/heroes-catalog.test.mjs feh-collection-tracker-design.md
git commit -m "$(printf 'feat: apply FR epithets from data/locale-fr.json in the pipeline\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 9: [orchestrateur] générer `locale-fr.json`, régénérer, déployer

**Files:**
- Created: `g:\GITHUB\feh-comp\data\locale-fr.json`
- Regenerated: `g:\GITHUB\feh-comp\data\heroes.json`

- [ ] **Step 1: Générer l'index FR**

Run: `node scripts/fetch-locale.mjs`
Expected: `[fetch-locale] ~1000/1410 épithètes FR (~400 sans correspondance)`. `data/locale-fr.json` créé (~60–90 Ko).
Note : ~66 fichiers, dont 2 de ~5 Mo → prévoir 2–3 min. En cas d'échec réseau, relancer.

- [ ] **Step 2: Contrôle qualité de l'index**

```bash
node -e "const l=require('./data/locale-fr.json'); const e=Object.entries(l.titles); console.log('count',l.count); console.log(e.slice(0,8).map(([k,v])=>k.split('\u001f').join(' — ')+'  =>  '+v).join('\n'));"
```
Vérifier que les paires EN → FR sont cohérentes (ex. `Marth — Altean Prince  =>  Marth — Prince d'Altéa`).

- [ ] **Step 3: Régénérer le catalogue**

Run: `node scripts/fetch-heroes.mjs` (~5 min).
```bash
node -e "const c=require('./data/heroes.json'); const withFr=c.heroes.filter(h=>h.titleFr).length; console.log('titleFr renseigné:', withFr, '/', c.count); console.log('ex:', c.heroes.find(h=>h.titleFr) && (c.heroes.find(h=>h.titleFr).name+' — '+c.heroes.find(h=>h.titleFr).titleFr));"
```
Expected: `titleFr renseigné` ≈ 1000.

- [ ] **Step 4: Suite + commit**

```bash
node --test          # tout vert
git add data/locale-fr.json data/heroes.json
git commit -m "$(printf 'chore: generate FR epithet index and apply to catalog\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
git push
```

- [ ] **Step 5: Déploiement**

Attendre `pages build and deployment` → success. Vérifier en ligne :
```bash
B=https://drzeroes.github.io/feh-heroes-tracker
curl -s -o /dev/null -w '%{http_code}\n' "$B/data/locale-fr.json"   # 200
curl -s "$B/data/heroes.json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s);console.log('live titleFr count', c.heroes.filter(h=>h.titleFr).length)})"
```
Puis ouvrir le site, passer en **FR**, vérifier qu'une carte d'un héros ancien (ex. Marth, Ike) affiche l'épithète française ; qu'un cadre couleur + un badge `5★` apparaissent ; que « Réinitialiser » vide les filtres ; que re-cliquer « Date » inverse ▲/▼.

---

## Self-Review

**Couverture des 5 demandes utilisateur :**

| Demande | Task |
|---|---|
| Cadre couleur sur la carte | 4 (CSS), 5 (`--card-accent`) |
| Indiquer la rareté sur la carte | 4 (`.rarity`), 5 (badge `N★`) |
| Bouton « Réinitialiser les filtres » | 2 (i18n), 3 (bouton), 5 (handler) |
| Tri qui bascule asc/desc au re-clic | 1 (`sortHeroes` 4 clés), 2 (i18n), 3 (boutons), 5 (`onSortClick`, `syncSortButtons`) |
| Épithète/surnom en FR | 6 (`locale.mjs`), 7 (`fetch-locale.mjs`), 8 (pipeline + spec), 9 (génération + déploiement), 5 (`epithetFor` dans l'app) |

**Placeholders :** aucun ; code complet à chaque étape ; Tasks 3–5 ont des vérifs servies + un cross-check statique (pas de test unitaire DOM, cohérent avec Plan B).

**Cohérence des types :**
- `sortHeroes` 4 clés (Task 1) ↔ `state.sort` ∈ ces 4 valeurs, `onSortClick` ne produit que celles-ci (Task 5).
- `frTitleFor(name, title, index)` (Task 6) ↔ utilisé par `fetch-locale.mjs` (Task 7) ; `data/locale-fr.json.titles` clé `\`${name}\u001f${title}\`` (Task 7) ↔ lu à l'identique par `fetch-heroes.mjs` (Task 8).
- `epithetFor(hero)` lit `hero.titleFr` (Task 5) ↔ rempli par Task 8, généré par Task 9. `titleFr` reste dans les 23 clés (aucun changement de forme).
- Hooks `#filter-reset` / `#sort-date` / `#sort-name` : créés Task 3, consommés Task 5.

---

## Execution Handoff

Plan sauvegardé dans `docs/superpowers/plans/2026-09-08-plan-b1-finition-catalogue.md`.

**1. Subagent-Driven (recommandé)** — un subagent par task, revue entre chaque. Task 9 = orchestrateur (réseau + déploiement).
**2. Inline Execution** — via executing-plans.

Quelle approche ?
