# Plan B.2 — Correctifs UX catalogue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Quatre correctifs sur le catalogue déployé : (1) le survol de carte ne doit plus écraser le cadre couleur du héros ; (2) un `<select>` de filtre actif est visuellement surligné ; (3) le bouton « Réinitialiser » est bien visible et remet aussi tri + groupement à zéro ; (4) diagnostic + garde-fou sur le filtre Bénédiction « Tous ».

**Architecture :** retouches `styles.css` + `app.js` uniquement. Aucun changement de pipeline, aucun changement de données. La logique pure (`js/*.mjs`) est déjà correcte ; on ajoute juste du feedback visuel et on durcit le reset.

**Tech Stack :** HTML/CSS/JS ESM natif. `node --test` pour la non-régression. Zéro dépendance, aucun build.

## Global Constraints

- `node --test` **sans argument** ; suite actuellement **90/90**, doit le rester (ce plan ne touche aucun module testé ; `node --check app.js` doit passer).
- Chemins relatifs. LF endings. ESM `.mjs`.
- Thème : les nouveaux styles utilisent les tokens existants (`--accent`, `--card`, `--border`, `--fg`, `--card-accent`) — pas de nouvelle couleur en dur.
- Commits : `fix:` / `feat:` ; se terminent par
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## Task 1: Survol de carte — préserver le cadre couleur

**Files:** `g:\GITHUB\feh-comp\styles.css`

**Problème :** `.card:hover { border-color: var(--accent); }` repeint **les 4 bords** dont le bord gauche coloré (`border-left-color: var(--card-accent)`), donc au survol la couleur du héros disparaît.

- [ ] **Step 1: Corriger `styles.css`**

Remplacer `.card:hover { border-color: var(--accent); }` par :
```css
.card:hover,
.card:focus-visible {
  border-color: var(--accent);
  border-left-color: var(--card-accent, var(--accent));
  outline: none;
}
```
(le bord gauche reste la couleur du héros ; les 3 autres bords passent en accent pour indiquer le survol.)

- [ ] **Step 2: Vérif servie**
```bash
node scripts/serve.mjs 8150 & SV=$!; sleep 1
curl -s http://localhost:8150/styles.css | grep -c 'border-left-color: var(--card-accent, var(--accent))'   # 1
kill $SV
```

- [ ] **Step 3: Commit**
```bash
git add styles.css
git commit -m "$(printf 'fix: card hover keeps the hero colour frame on the left border\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: Surligner les filtres actifs

**Files:** `g:\GITHUB\feh-comp\styles.css`, `g:\GITHUB\feh-comp\app.js`

**Interfaces:**
- `app.js` : après chaque `recompute()` (ou dans une fonction `syncFilterControls()` appelée par `buildFilterControls` + les handlers `change` + le reset), chaque `#filters select` reçoit/perd la classe `is-active` selon `sel.value !== ''`.

- [ ] **Step 1: CSS** — ajouter à `styles.css` (près des règles `.filters select`) :
```css
.filters select.is-active {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
  background: color-mix(in srgb, var(--accent) 8%, var(--card));
}
```

- [ ] **Step 2: `app.js`** — ajouter une fonction :
```js
function syncFilterControls() {
  for (const sel of document.querySelectorAll('#filters select')) {
    sel.classList.toggle('is-active', sel.value !== '');
  }
}
```
- l'appeler à la fin de `buildFilterControls()` ;
- dans le handler `change` de chaque select (dans `buildFilterControls`), après `state.filters[f] = sel.value || null;` ajouter `syncFilterControls();` ;
- dans le handler `#filter-reset` (voir Task 3), après avoir remis les `sel.value = ''`, appeler `syncFilterControls();`.

- [ ] **Step 3: Vérifs**
```bash
node --check app.js && node --test
node scripts/serve.mjs 8151 & SV=$!; sleep 1
curl -s http://localhost:8151/app.js | grep -c 'syncFilterControls'          # >=3
curl -s http://localhost:8151/styles.css | grep -c 'select.is-active'        # 1
kill $SV
```

- [ ] **Step 4: Commit**
```bash
git add styles.css app.js
git commit -m "$(printf 'feat: highlight active filter selects\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: Bouton reset visible + reset tri/groupe

**Files:** `g:\GITHUB\feh-comp\styles.css`, `g:\GITHUB\feh-comp\app.js`

**Interfaces:**
- `#filter-reset` : style accentué (bordure + texte accent), toujours visible. Au clic : filtres + recherche **+ `state.sort = 'release-desc'` + `state.group = false`** ; met à jour les `<select>`/checkbox/boutons de tri ; `writePrefs()` ; `recompute()`.

- [ ] **Step 1: CSS** — remplacer le bloc `.reset { … }` et `.reset:hover { … }` par :
```css
.reset {
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--card));
  color: var(--accent);
  border-radius: 8px;
  padding: .4rem .75rem;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}
.reset:hover { background: color-mix(in srgb, var(--accent) 20%, var(--card)); }
.reset::before { content: "↺ "; }
```

- [ ] **Step 2: `app.js`** — remplacer le handler `#filter-reset` existant par :
```js
  $('#filter-reset').addEventListener('click', () => {
    for (const f of FACETS) state.filters[f] = null;
    state.query = '';
    state.sort = 'release-desc';
    state.group = false;
    $('#search').value = '';
    $('#group-toggle').checked = false;
    for (const sel of document.querySelectorAll('#filters select')) sel.value = '';
    syncFilterControls();
    syncSortButtons();
    writePrefs();
    recompute();
  });
```

- [ ] **Step 3: Vérifs**
```bash
node --check app.js && node --test
node scripts/serve.mjs 8152 & SV=$!; sleep 1
curl -s http://localhost:8152/styles.css | grep -c 'border: 1px solid var(--accent)'   # >=1
curl -s http://localhost:8152/app.js | grep -c "state.sort = 'release-desc'"            # >=2  (onSortClick default + reset)
kill $SV
```

- [ ] **Step 4: Commit**
```bash
git add styles.css app.js
git commit -m "$(printf 'feat: prominent reset button, also resets sort and grouping\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: Filtre Bénédiction « Tous » — diagnostic + garde-fou

**Files:** `g:\GITHUB\feh-comp\app.js`, `g:\GITHUB\feh-comp\js\catalog-view.test.mjs`

**Contexte :** `applyFilters` est correct — `if (filters.blessing)` saute le filtre quand la valeur est `null` (option « Tous », `sel.value === ''`). Le symptôme « Tous n'affiche pas tout » vient très probablement d'un **filtre persistant** (`localStorage['feh-catalog-prefs']`) restauré et invisible avant Task 2/3, ou d'un `app.js` en cache. Ce task ajoute une garde et un test explicite.

- [ ] **Step 1: Test explicite (RED si régression)**

Ajouter à `js/catalog-view.test.mjs` :
```js
test('applyFilters : blessing null/"" ne filtre rien', () => {
  const heroes = [
    { blessing: 'fire', color: 'r', weapon: 'sword', move: 'infantry', category: 'standard', gender: 'male', origins: [], poolRarity: null },
    { blessing: null, color: 'b', weapon: 'lance', move: 'flying', category: 'standard', gender: 'male', origins: [], poolRarity: null },
  ];
  assert.equal(applyFilters(heroes, { blessing: null }, '').length, 2);
  assert.equal(applyFilters(heroes, { blessing: '' }, '').length, 2);
  assert.equal(applyFilters(heroes, {}, '').length, 2);
});
```
Run: `node --test js/catalog-view.test.mjs` → doit PASSER (confirme que la logique est bonne).

- [ ] **Step 2: Garde-fou `app.js`** — dans `readPrefs()`, après `Object.assign(state.filters, p.filters || {})`, filtrer les valeurs orphelines :
```js
    for (const f of FACETS) {
      if (state.filters[f] === '' ) state.filters[f] = null;
    }
```
(une valeur `''` persistée par erreur serait traitée comme « pas de filtre ».)

- [ ] **Step 3: Vérifs**
```bash
node --check app.js && node --test    # 91/91 (90 + le nouveau test)
```

- [ ] **Step 4: Commit**
```bash
git add app.js js/catalog-view.test.mjs
git commit -m "$(printf 'fix: guard against empty-string persisted filters; test blessing "any"\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: [orchestrateur] déploiement

- [ ] `node --test` → 91/91. `git push`.
- [ ] Attendre `pages build and deployment` → success.
- [ ] Vérifs live :
```bash
B=https://drzeroes.github.io/feh-heroes-tracker
curl -s "$B/styles.css" | grep -c 'select.is-active'      # 1
curl -s "$B/app.js" | grep -c 'syncFilterControls'        # >=3
```
Ouvrir le site (Ctrl+Shift+R), vérifier : survol garde le cadre couleur ; un filtre choisi surligne son `<select>` ; le bouton **↺ Réinitialiser** est bien visible et remet filtres + tri + groupe ; Bénédiction « Tous » affiche 1410.

---

## Self-Review

| Correctif demandé | Task |
|---|---|
| Survol repeint le cadre en bleu | 1 |
| Filtre actif pas visible | 2 |
| Bouton reset introuvable / ne reset pas le tri | 3 |
| Bénédiction « Tous » n'affiche pas tout | 4 (garde-fou + test) ; 2–3 rendent l'état visible |

Placeholders : aucun. Cohérence : `syncFilterControls` défini Task 2, réutilisé Task 3 ; `syncSortButtons` existe déjà (Plan B.1 Task 5) ; `state.sort='release-desc'` est une des 4 clés de `sortHeroes`.

---

## Execution Handoff

**1. Subagent-Driven (recommandé)** — Task 5 = orchestrateur.
**2. Inline Execution.**
