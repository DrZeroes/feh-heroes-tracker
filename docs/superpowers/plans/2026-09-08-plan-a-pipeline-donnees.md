# Plan A — Pipeline de données (FEH Collection Tracker) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un script Node sans dépendance qui interroge la Cargo API du wiki FEH (tables `Units`, `LegendaryHero`, `MythicHero`, `SummoningAvailability`), normalise le tout dans `data/heroes.json`, applique `data/heroes.overrides.json`, plus une GitHub Action qui le rejoue chaque semaine et commit en cas de diff.

**Architecture:** Fonctions pures de normalisation dans `scripts/lib/normalize.mjs` (aucun I/O, aucun réseau — 100 % testables en isolation). Couche réseau paginée + anti-rate-limit dans `scripts/lib/cargo.mjs` avec `fetch` injectable pour les tests. Orchestrateur mince `scripts/fetch-heroes.mjs` qui câble les deux, lit les overrides et écrit le fichier ; il exporte une fonction `run()` injectable pour un test de bout en bout hors ligne.

**Tech Stack:** Node ≥ 20 (natif : `fetch`, `node:fs/promises`, `node:test`, `node:assert`). ESM (`.mjs`). Zéro dépendance npm. Pas de `package.json`. Pas de build. GitHub Actions pour le cron.

## Global Constraints

- **Node ≥ 20**, modules ESM `.mjs` uniquement.
- **Zéro dépendance npm, aucun `package.json`, aucun build.** Tests via `node --test` **sans argument** (découverte récursive depuis la racine du dépôt). ⚠️ Sur Node 22 un argument répertoire (`node --test scripts/`) est interprété comme un module à exécuter → `MODULE_NOT_FOUND`. Un fichier précis reste ciblable : `node --test scripts/lib/normalize.test.mjs`.
- Fichier généré `data/heroes.json` : `JSON.stringify(obj, null, 2)` **+ un `\n` final**.
- Clé primaire d'un héros = `WikiName` de la table `Units`, exposée sous le champ `id`.
- Codes couleur : `r` = Red, `b` = Blue, `v` = Green, `g` = Colorless.
- Catalogue trié par `releaseDate` **décroissant**, puis `name` **croissant (A→Z)**.
- Champ `source` de `heroes.json`, valeur exacte : `feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)`.
- Tout appel Cargo porte un `User-Agent` explicite ; pause 2–5 s entre pages ; sur `error.code === "ratelimited"` → retry avec back-off, max 5, puis échec explicite.
- Commits fréquents. Préfixes `feat:` / `chore:` / `test:`. Chaque message de commit se termine par :
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `.gitignore` | Exclusions basiques (pas de `node_modules`, logs). |
| `README.md` | Pointeur vers le spec + commandes du pipeline (stub, étoffé plus tard). |
| `data/heroes.overrides.json` | Corrections/ajouts manuels. Seed : `{ "add": [], "patch": {} }`. |
| `data/heroes.json` | **Généré.** Catalogue normalisé complet. Commité comme artefact. |
| `scripts/lib/normalize.mjs` | Fonctions pures : parsing `WeaponType`/`MoveType`/listes, `category`, noms de page, `blessing`, `pickPoolRarity`, `normalizeUnit`, `mergeJoins`, `applyOverrides`, `buildCatalog`. Aucun I/O. |
| `scripts/lib/normalize.test.mjs` | Tests unitaires de `normalize.mjs` (Tasks 2→7). |
| `scripts/lib/cargo.mjs` | `cargoQuery()` : pagination, anti-rate-limit, `fetchImpl`/`sleepImpl` injectables. |
| `scripts/lib/cargo.test.mjs` | Tests de `cargoQuery()` avec `fetch` bouchonné. |
| `scripts/fetch-heroes.mjs` | Orchestrateur. Exporte `run(opts)` ; `main` si lancé directement. Écrit `data/heroes.json`. |
| `scripts/fetch-heroes.test.mjs` | Test de bout en bout hors ligne (4 tables bouchonnées → fichier écrit). |
| `.github/workflows/update-heroes.yml` | `workflow_dispatch` + cron hebdo → tests → régénération → commit si diff. |

---

## Task 1: Squelette du dépôt

**Files:**
- Create: `g:\GITHUB\feh-comp\.gitignore`
- Create: `g:\GITHUB\feh-comp\README.md`
- Create: `g:\GITHUB\feh-comp\data\heroes.overrides.json`

**Interfaces:**
- Consumes: rien.
- Produces: un dépôt git initialisé ; `data/heroes.overrides.json` = objet JSON `{ add: [], patch: {} }` (lu par `run()` en Task 9).

- [ ] **Step 1: Initialiser git**

Run:
```bash
cd /g/GITHUB/feh-comp && git init
```
Expected: `Initialized empty Git repository in G:/GITHUB/feh-comp/.git/`

- [ ] **Step 2: Créer `.gitignore`**

```
node_modules/
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Créer `README.md`**

```
# FEH Collection Tracker

Suivi de collection Fire Emblem Heroes — site statique.
Spec complète : `feh-collection-tracker-design.md`.

## Pipeline de données (Plan A)

Régénérer le catalogue localement :

    node scripts/fetch-heroes.mjs

Lancer les tests :

    node --test
```

- [ ] **Step 4: Créer `data/heroes.overrides.json`**

```json
{
  "add": [],
  "patch": {}
}
```

- [ ] **Step 5: Vérifier que le seed parse**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('data/heroes.overrides.json','utf8')); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add .gitignore README.md data/heroes.overrides.json
git commit -m "$(printf 'chore: initialise repo skeleton for data pipeline\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: `normalize.mjs` — `splitWeaponType` + `normalizeMoveType`

**Files:**
- Create: `g:\GITHUB\feh-comp\scripts\lib\normalize.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\lib\normalize.test.mjs`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `splitWeaponType(raw: string) -> { color: 'r'|'b'|'v'|'g'|null, weapon: string|null }`
  - `normalizeMoveType(raw: string) -> 'infantry'|'cavalry'|'flying'|'armored'|null`

- [ ] **Step 1: Écrire le test qui échoue**

Fichier `scripts/lib/normalize.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitWeaponType, normalizeMoveType } from './normalize.mjs';

test('splitWeaponType sépare couleur et arme', () => {
  assert.deepEqual(splitWeaponType('Blue Breath'), { color: 'b', weapon: 'breath' });
  assert.deepEqual(splitWeaponType('Colorless Bow'), { color: 'g', weapon: 'bow' });
  assert.deepEqual(splitWeaponType('Green Axe'), { color: 'v', weapon: 'axe' });
  assert.deepEqual(splitWeaponType('Red Sword'), { color: 'r', weapon: 'sword' });
});

test('splitWeaponType renvoie null sur vide ou inconnu', () => {
  assert.deepEqual(splitWeaponType(''), { color: null, weapon: null });
  assert.deepEqual(splitWeaponType(null), { color: null, weapon: null });
  assert.deepEqual(splitWeaponType('Purple Hammer'), { color: null, weapon: null });
});

test('normalizeMoveType mappe les 4 types', () => {
  assert.equal(normalizeMoveType('Infantry'), 'infantry');
  assert.equal(normalizeMoveType('Cavalry'), 'cavalry');
  assert.equal(normalizeMoveType('Flying'), 'flying');
  assert.equal(normalizeMoveType('Armored'), 'armored');
  assert.equal(normalizeMoveType('Dragon'), null);
  assert.equal(normalizeMoveType(''), null);
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: FAIL — `Cannot find module '.../normalize.mjs'` (le module n'existe pas encore).

- [ ] **Step 3: Écrire l'implémentation minimale**

Fichier `scripts/lib/normalize.mjs` :

```js
// scripts/lib/normalize.mjs
// Fonctions pures de normalisation du catalogue FEH. Aucun I/O, aucun réseau.

const COLOR_CODE = { Red: 'r', Blue: 'b', Green: 'v', Colorless: 'g' };
const WEAPON_CODE = {
  Sword: 'sword', Lance: 'lance', Axe: 'axe', Bow: 'bow', Dagger: 'dagger',
  Tome: 'tome', Staff: 'staff', Breath: 'breath', Beast: 'beast',
};
const MOVE_CODE = {
  Infantry: 'infantry', Cavalry: 'cavalry', Flying: 'flying', Armored: 'armored',
};

export function splitWeaponType(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { color: null, weapon: null };
  const parts = s.split(/\s+/);
  const weaponWord = parts[parts.length - 1];
  const colorWord = parts.slice(0, -1).join(' ');
  return {
    color: COLOR_CODE[colorWord] ?? null,
    weapon: WEAPON_CODE[weaponWord] ?? null,
  };
}

export function normalizeMoveType(raw) {
  return MOVE_CODE[String(raw ?? '').trim()] ?? null;
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: PASS — 3 tests, 0 échec.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.mjs scripts/lib/normalize.test.mjs
git commit -m "$(printf 'feat: add weapon/move normalization helpers\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: `normalize.mjs` — `parseListField` + `deriveCategory`

**Files:**
- Modify: `g:\GITHUB\feh-comp\scripts\lib\normalize.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\lib\normalize.test.mjs` (append)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `parseListField(raw: string) -> string[]` (split `,`, trim, retire les vides)
  - `deriveCategory(properties: string[]) -> 'mythic'|'legendary'|'duo'|'harmonic'|'brave'|'ghb'|'tt'|'special'|'standard'`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `scripts/lib/normalize.test.mjs` :

```js
import {
  parseListField, deriveCategory,
} from './normalize.mjs';

test('parseListField découpe, trim et retire les vides', () => {
  assert.deepEqual(parseListField('legendary,hat'), ['legendary', 'hat']);
  assert.deepEqual(parseListField(' a , b ,, c '), ['a', 'b', 'c']);
  assert.deepEqual(parseListField(''), []);
  assert.deepEqual(parseListField(null), []);
});

test('deriveCategory applique la priorité mythic>legendary>...>standard', () => {
  assert.equal(deriveCategory(['legendary', 'hat']), 'legendary');
  assert.equal(deriveCategory(['duo', 'legendary']), 'legendary');
  assert.equal(deriveCategory(['mythic', 'legendary']), 'mythic');
  assert.equal(deriveCategory(['brave']), 'brave');
  assert.equal(deriveCategory(['ghb']), 'ghb');
  assert.equal(deriveCategory(['tt', 'special']), 'tt');
  assert.equal(deriveCategory(['refresher']), 'standard');
  assert.equal(deriveCategory([]), 'standard');
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: FAIL — `parseListField is not a function` / `deriveCategory is not a function`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à `scripts/lib/normalize.mjs` (après `normalizeMoveType`) :

```js
const CATEGORY_PRIORITY = [
  'mythic', 'legendary', 'duo', 'harmonic', 'brave', 'ghb', 'tt', 'special',
];

export function parseListField(raw) {
  return String(raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function deriveCategory(properties) {
  const set = new Set((properties ?? []).map((p) => String(p).toLowerCase()));
  for (const c of CATEGORY_PRIORITY) {
    if (set.has(c)) return c;
  }
  return 'standard';
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.mjs scripts/lib/normalize.test.mjs
git commit -m "$(printf 'feat: add list-field parsing and category derivation\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: `normalize.mjs` — noms de page + `blessingFromEffect`

**Files:**
- Modify: `g:\GITHUB\feh-comp\scripts\lib\normalize.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\lib\normalize.test.mjs` (append)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `pageNameFor(name: string, title: string) -> string` — `"<name>: <title>"`, ou `"<name>"` si `title` vide
  - `normalizePageName(raw: string) -> string` — clé de rapprochement tolérante (minuscule, `:` → espace, espaces compressés, trim)
  - `blessingFromEffect(raw: string) -> 'fire'|'water'|'wind'|'earth'|'light'|'dark'|'astra'|'anima'|null`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `scripts/lib/normalize.test.mjs` :

```js
import {
  pageNameFor, normalizePageName, blessingFromEffect,
} from './normalize.mjs';

test('pageNameFor assemble "Name: Title"', () => {
  assert.equal(pageNameFor('Rhea', 'The Final Child'), 'Rhea: The Final Child');
  assert.equal(pageNameFor('Askr', ''), 'Askr');
  assert.equal(pageNameFor(' Alear ', ' Engaging Fire '), 'Alear: Engaging Fire');
});

test('normalizePageName rend une clé tolérante', () => {
  assert.equal(
    normalizePageName('Rhea: The Final Child'),
    normalizePageName('Rhea  The Final Child'),
  );
  assert.equal(normalizePageName('Alear: Awoken Divinity'), 'alear awoken divinity');
});

test('blessingFromEffect mappe les 8 éléments, insensible à la casse', () => {
  assert.equal(blessingFromEffect('Fire'), 'fire');
  assert.equal(blessingFromEffect('water'), 'water');
  assert.equal(blessingFromEffect('ASTRA'), 'astra');
  assert.equal(blessingFromEffect('Anima'), 'anima');
  assert.equal(blessingFromEffect(''), null);
  assert.equal(blessingFromEffect('Thunder'), null);
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: FAIL — exports manquants.

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à `scripts/lib/normalize.mjs` :

```js
const BLESSING = new Set([
  'fire', 'water', 'wind', 'earth', 'light', 'dark', 'astra', 'anima',
]);

export function pageNameFor(name, title) {
  const n = String(name ?? '').trim();
  const t = String(title ?? '').trim();
  return t ? `${n}: ${t}` : n;
}

export function normalizePageName(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/:/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function blessingFromEffect(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  return BLESSING.has(key) ? key : null;
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.mjs scripts/lib/normalize.test.mjs
git commit -m "$(printf 'feat: add page-name helpers and blessing mapping\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: `normalize.mjs` — `pickPoolRarity`

**Files:**
- Modify: `g:\GITHUB\feh-comp\scripts\lib\normalize.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\lib\normalize.test.mjs` (append)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `pickPoolRarity(rows: Array<{ rarity: string, property: string, startTime: string }>) -> { poolRarity: number|null, poolFlags: string[] }`
  - Règle : `poolFlags` = ensemble des `property` non vides sur **toutes** les lignes ; `poolRarity` = `Rarity` (entier) de la ligne au `startTime` **max** parmi celles dont `property !== 'revivalOnly'` ; `null` si aucune ligne utilisable.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `scripts/lib/normalize.test.mjs` :

```js
import { pickPoolRarity } from './normalize.mjs';

test('pickPoolRarity prend la ligne la plus récente hors revivalOnly', () => {
  const rows = [
    { rarity: '3', property: '', startTime: '2020-01-01 07:00:00' },
    { rarity: '4', property: 'specialRate', startTime: '2021-06-01 07:00:00' },
    { rarity: '5', property: '', startTime: '2019-01-01 07:00:00' },
  ];
  assert.deepEqual(pickPoolRarity(rows), { poolRarity: 4, poolFlags: ['specialRate'] });
});

test('pickPoolRarity ignore revivalOnly pour la rareté mais le garde en flag', () => {
  const rows = [
    { rarity: '3', property: '', startTime: '2020-01-01 07:00:00' },
    { rarity: '5', property: 'revivalOnly', startTime: '2025-01-01 07:00:00' },
  ];
  assert.deepEqual(pickPoolRarity(rows), { poolRarity: 3, poolFlags: ['revivalOnly'] });
});

test('pickPoolRarity renvoie null si aucune ligne utilisable', () => {
  assert.deepEqual(pickPoolRarity([]), { poolRarity: null, poolFlags: [] });
  assert.deepEqual(
    pickPoolRarity([{ rarity: '5', property: 'revivalOnly', startTime: '2025-01-01 07:00:00' }]),
    { poolRarity: null, poolFlags: ['revivalOnly'] },
  );
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: FAIL — `pickPoolRarity is not a function`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à `scripts/lib/normalize.mjs` :

```js
export function pickPoolRarity(rows) {
  const list = rows ?? [];
  const poolFlags = [...new Set(
    list.map((r) => r.property).filter((p) => p && p.length > 0),
  )];
  const usable = list.filter((r) => r.property !== 'revivalOnly');
  if (usable.length === 0) return { poolRarity: null, poolFlags };
  let best = usable[0];
  for (const r of usable) {
    if (String(r.startTime) > String(best.startTime)) best = r;
  }
  const n = Number.parseInt(best.rarity, 10);
  return { poolRarity: Number.isFinite(n) ? n : null, poolFlags };
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.mjs scripts/lib/normalize.test.mjs
git commit -m "$(printf 'feat: add summon-pool rarity selection\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 6: `normalize.mjs` — `normalizeUnit` + `mergeJoins`

**Files:**
- Modify: `g:\GITHUB\feh-comp\scripts\lib\normalize.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\lib\normalize.test.mjs` (append)

**Interfaces:**
- Consumes: `splitWeaponType`, `normalizeMoveType`, `parseListField`, `deriveCategory`, `pageNameFor`, `normalizePageName` (Tasks 2–4).
- Produces:
  - `normalizeUnit(raw: object) -> Hero` où `Hero` =
    `{ id, name, title, titleFr: null, person: string|null, color, weapon, move, gender: string|null, origin: string|null, category, properties: string[], blessing: null, poolRarity: null, poolFlags: [], artist: string|null, actorEn: string[], actorJp: string[], releaseDate: string|null, intId: number|null }`
    (`raw` = objet `title` d'une ligne Cargo `Units` : clés `WikiName, Name, Title, Person, Origin, IntID, Gender, WeaponType, MoveType, Artist, ActorEN, ActorJP, ReleaseDate, Properties`)
  - `mergeJoins(hero: Hero, maps: { blessingByPage: Map<string,string>, poolByPage: Map<string,{poolRarity,poolFlags}> }) -> Hero` — renseigne `blessing`, `poolRarity`, `poolFlags` via `normalizePageName(pageNameFor(hero.name, hero.title))`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `scripts/lib/normalize.test.mjs` :

```js
import { normalizeUnit, mergeJoins } from './normalize.mjs';

const RAW_RHEA = {
  WikiName: 'Rhea The Final Child', Name: 'Rhea', Title: 'The Final Child',
  Person: 'Rhea', Origin: 'Fire Emblem: Three Houses', IntID: '1234', Gender: 'F',
  WeaponType: 'Blue Breath', MoveType: 'Infantry', Artist: 'Kaya8',
  ActorEN: 'Cherami Leigh', ActorJP: 'Ai Kayano',
  ReleaseDate: '2026-08-31', Properties: 'legendary,hat',
};

test('normalizeUnit produit un héros normalisé sans jointures', () => {
  const h = normalizeUnit(RAW_RHEA);
  assert.equal(h.id, 'Rhea The Final Child');
  assert.equal(h.name, 'Rhea');
  assert.equal(h.title, 'The Final Child');
  assert.equal(h.titleFr, null);
  assert.equal(h.person, 'Rhea');
  assert.equal(h.color, 'b');
  assert.equal(h.weapon, 'breath');
  assert.equal(h.move, 'infantry');
  assert.equal(h.gender, 'F');
  assert.equal(h.origin, 'Fire Emblem: Three Houses');
  assert.equal(h.category, 'legendary');
  assert.deepEqual(h.properties, ['legendary', 'hat']);
  assert.equal(h.blessing, null);
  assert.equal(h.poolRarity, null);
  assert.deepEqual(h.poolFlags, []);
  assert.equal(h.artist, 'Kaya8');
  assert.deepEqual(h.actorEn, ['Cherami Leigh']);
  assert.deepEqual(h.actorJp, ['Ai Kayano']);
  assert.equal(h.releaseDate, '2026-08-31');
  assert.equal(h.intId, 1234);
});

test('normalizeUnit tolère les champs manquants', () => {
  const h = normalizeUnit({ WikiName: 'X', Name: 'X', Title: '' });
  assert.equal(h.person, null);
  assert.equal(h.color, null);
  assert.equal(h.move, null);
  assert.equal(h.gender, null);
  assert.equal(h.intId, null);
  assert.equal(h.releaseDate, null);
  assert.deepEqual(h.actorEn, []);
});

test('normalizeUnit tronque une date horodatée à YYYY-MM-DD', () => {
  const h = normalizeUnit({ WikiName: 'X', Name: 'X', Title: 'Y', ReleaseDate: '2026-08-31 00:00:00' });
  assert.equal(h.releaseDate, '2026-08-31');
});

test('mergeJoins renseigne blessing et pool via la clé de page', () => {
  const base = normalizeUnit(RAW_RHEA);
  const blessingByPage = new Map([['rhea the final child', 'fire']]);
  const poolByPage = new Map([['rhea the final child', { poolRarity: 5, poolFlags: ['specialRate'] }]]);
  const merged = mergeJoins(base, { blessingByPage, poolByPage });
  assert.equal(merged.blessing, 'fire');
  assert.equal(merged.poolRarity, 5);
  assert.deepEqual(merged.poolFlags, ['specialRate']);
});

test('mergeJoins laisse les valeurs par défaut si aucune correspondance', () => {
  const base = normalizeUnit(RAW_RHEA);
  const merged = mergeJoins(base, { blessingByPage: new Map(), poolByPage: new Map() });
  assert.equal(merged.blessing, null);
  assert.equal(merged.poolRarity, null);
  assert.deepEqual(merged.poolFlags, []);
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: FAIL — `normalizeUnit is not a function`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à `scripts/lib/normalize.mjs` :

```js
export function normalizeUnit(raw) {
  const { color, weapon } = splitWeaponType(raw.WeaponType);
  const properties = parseListField(raw.Properties);
  const releaseDate = String(raw.ReleaseDate ?? '').slice(0, 10) || null;
  const intIdNum = Number.parseInt(raw.IntID, 10);
  return {
    id: String(raw.WikiName ?? '').trim(),
    name: String(raw.Name ?? '').trim(),
    title: String(raw.Title ?? '').trim(),
    titleFr: null,
    person: String(raw.Person ?? '').trim() || null,
    color,
    weapon,
    move: normalizeMoveType(raw.MoveType),
    gender: String(raw.Gender ?? '').trim() || null,
    origin: String(raw.Origin ?? '').trim() || null,
    category: deriveCategory(properties),
    properties,
    blessing: null,
    poolRarity: null,
    poolFlags: [],
    artist: String(raw.Artist ?? '').trim() || null,
    actorEn: parseListField(raw.ActorEN),
    actorJp: parseListField(raw.ActorJP),
    releaseDate,
    intId: Number.isFinite(intIdNum) ? intIdNum : null,
  };
}

export function mergeJoins(hero, { blessingByPage, poolByPage }) {
  const key = normalizePageName(pageNameFor(hero.name, hero.title));
  const pool = poolByPage.get(key) ?? { poolRarity: null, poolFlags: [] };
  return {
    ...hero,
    blessing: blessingByPage.get(key) ?? null,
    poolRarity: pool.poolRarity,
    poolFlags: pool.poolFlags,
  };
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.mjs scripts/lib/normalize.test.mjs
git commit -m "$(printf 'feat: add unit normalization and join merge\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 7: `normalize.mjs` — `applyOverrides` + `buildCatalog`

**Files:**
- Modify: `g:\GITHUB\feh-comp\scripts\lib\normalize.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\lib\normalize.test.mjs` (append)

**Interfaces:**
- Consumes: rien (opère sur des `Hero` déjà normalisés).
- Produces:
  - `applyOverrides(heroes: Hero[], overrides: { add?: object[], patch?: Record<string, object> }) -> Hero[]` — applique `patch` par `id` (ignore un `id` absent), puis `add` (remplace si `id` déjà présent, sinon ajoute).
  - `buildCatalog(heroes: Hero[], opts: { generatedAt: string }) -> { generatedAt: string, source: string, count: number, heroes: Hero[] }` — trié `releaseDate` desc puis `name` asc ; `source` = constante des Global Constraints.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `scripts/lib/normalize.test.mjs` :

```js
import { applyOverrides, buildCatalog } from './normalize.mjs';

const H = (id, extra = {}) => ({
  id, name: id, title: '', titleFr: null, person: id, color: 'r', weapon: 'sword',
  move: 'infantry', gender: 'M', origin: 'X', category: 'standard', properties: [],
  blessing: null, poolRarity: null, poolFlags: [], artist: null, actorEn: [], actorJp: [],
  releaseDate: '2020-01-01', intId: 1, ...extra,
});

test('applyOverrides applique patch puis add', () => {
  const base = [H('A'), H('B')];
  const out = applyOverrides(base, {
    patch: { A: { titleFr: 'Alpha' }, ZZ: { titleFr: 'ignoré' } },
    add: [H('C', { name: 'Cee' }), H('B', { name: 'B2' })],
  });
  const byId = Object.fromEntries(out.map((h) => [h.id, h]));
  assert.equal(byId.A.titleFr, 'Alpha');
  assert.equal(byId.B.name, 'B2');
  assert.equal(byId.C.name, 'Cee');
  assert.equal(out.length, 3);
  assert.ok(!('ZZ' in byId));
});

test('applyOverrides tolère un objet overrides vide ou partiel', () => {
  const base = [H('A')];
  assert.deepEqual(applyOverrides(base, {}), base);
  assert.deepEqual(applyOverrides(base, { add: [] }), base);
});

test('buildCatalog trie par date desc puis nom asc et compte', () => {
  const cat = buildCatalog([
    H('old', { name: 'old', releaseDate: '2019-05-05' }),
    H('newB', { name: 'B', releaseDate: '2026-01-01' }),
    H('newA', { name: 'A', releaseDate: '2026-01-01' }),
  ], { generatedAt: '2026-09-08T00:00:00.000Z' });
  assert.equal(cat.count, 3);
  assert.equal(cat.generatedAt, '2026-09-08T00:00:00.000Z');
  assert.equal(cat.source, 'feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)');
  assert.deepEqual(cat.heroes.map((h) => h.id), ['newA', 'newB', 'old']);
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: FAIL — `applyOverrides is not a function`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à `scripts/lib/normalize.mjs` :

```js
const SOURCE = 'feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)';

export function applyOverrides(heroes, overrides) {
  const add = Array.isArray(overrides?.add) ? overrides.add : [];
  const patch = (overrides && typeof overrides.patch === 'object' && overrides.patch) || {};
  const byId = new Map(heroes.map((h) => [h.id, { ...h }]));
  for (const [id, fields] of Object.entries(patch)) {
    if (byId.has(id)) byId.set(id, { ...byId.get(id), ...fields });
  }
  for (const entry of add) {
    if (!entry || !entry.id) continue;
    byId.set(entry.id, { ...(byId.get(entry.id) ?? {}), ...entry });
  }
  return [...byId.values()];
}

export function buildCatalog(heroes, { generatedAt }) {
  const sorted = [...heroes].sort((a, b) => {
    const da = a.releaseDate ?? '';
    const db = b.releaseDate ?? '';
    if (da !== db) return db < da ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
  return { generatedAt, source: SOURCE, count: sorted.length, heroes: sorted };
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: PASS — tous les tests de `normalize.test.mjs` verts.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.mjs scripts/lib/normalize.test.mjs
git commit -m "$(printf 'feat: add overrides merge and catalog assembly\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 8: `cargo.mjs` — client Cargo paginé + anti-rate-limit

**Files:**
- Create: `g:\GITHUB\feh-comp\scripts\lib\cargo.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\lib\cargo.test.mjs`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `cargoQuery(opts) -> Promise<object[]>` où `opts` =
    `{ table: string, fields: string, orderBy?: string, where?: string, limit?: number=500, fetchImpl?: typeof fetch, sleepImpl?: (ms:number)=>Promise<void>, pauseMs?: number=2500, maxRetries?: number=5, userAgent?: string }`
  - Renvoie la concaténation de tous les objets `title` de toutes les pages, débarrassés des clés suffixées `__precision`.
  - Sur `error.code === 'ratelimited'` : attend `pauseMs * 2**attempt` via `sleepImpl`, retry jusqu'à `maxRetries`, puis `throw`. Sur toute autre `error` : `throw` immédiat.
  - Arrête la pagination quand une page renvoie `< limit` lignes.

- [ ] **Step 1: Écrire le test qui échoue**

Fichier `scripts/lib/cargo.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargoQuery } from './cargo.mjs';

const resp = (payload) => ({ json: async () => payload });
const noSleep = async () => {};

test('cargoQuery pagine jusqu\'à une page courte', async () => {
  const pages = [
    { cargoquery: Array.from({ length: 2 }, (_, i) => ({ title: { Name: `A${i}` } })) },
    { cargoquery: [{ title: { Name: 'B0' } }] },
  ];
  let call = 0;
  const fetchImpl = async () => resp(pages[call++]);
  const rows = await cargoQuery({
    table: 'Units', fields: 'Name', limit: 2, fetchImpl, sleepImpl: noSleep, pauseMs: 0,
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[2], { Name: 'B0' });
});

test('cargoQuery retente sur ratelimited puis réussit', async () => {
  const seq = [
    { error: { code: 'ratelimited', info: 'slow down' } },
    { cargoquery: [{ title: { Name: 'ok' } }] },
  ];
  let call = 0;
  const fetchImpl = async () => resp(seq[call++]);
  const rows = await cargoQuery({
    table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0, maxRetries: 3,
  });
  assert.deepEqual(rows, [{ Name: 'ok' }]);
});

test('cargoQuery jette après maxRetries', async () => {
  const fetchImpl = async () => resp({ error: { code: 'ratelimited' } });
  await assert.rejects(
    cargoQuery({ table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0, maxRetries: 2 }),
    /ratelimited/,
  );
});

test('cargoQuery jette sur une autre erreur Cargo', async () => {
  const fetchImpl = async () => resp({ error: { code: 'badquery', info: 'nope' } });
  await assert.rejects(
    cargoQuery({ table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0 }),
    /badquery/,
  );
});

test('cargoQuery retire les clés __precision', async () => {
  const fetchImpl = async () => resp({
    cargoquery: [{ title: { StartTime: '2026-01-01 00:00:00', StartTime__precision: 0 } }],
  });
  const rows = await cargoQuery({
    table: 'X', fields: 'StartTime', limit: 500, fetchImpl, sleepImpl: noSleep, pauseMs: 0,
  });
  assert.deepEqual(rows, [{ StartTime: '2026-01-01 00:00:00' }]);
});

test('cargoQuery construit une URL Cargo correcte', async () => {
  let seen;
  const fetchImpl = async (url) => { seen = url; return resp({ cargoquery: [] }); };
  await cargoQuery({
    table: 'Units', fields: '_pageName=Page,LegendaryEffect', orderBy: 'StartTime DESC',
    fetchImpl, sleepImpl: noSleep, pauseMs: 0,
  });
  const u = new URL(seen);
  assert.equal(u.searchParams.get('action'), 'cargoquery');
  assert.equal(u.searchParams.get('format'), 'json');
  assert.equal(u.searchParams.get('tables'), 'Units');
  assert.equal(u.searchParams.get('fields'), '_pageName=Page,LegendaryEffect');
  assert.equal(u.searchParams.get('order_by'), 'StartTime DESC');
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `node --test scripts/lib/cargo.test.mjs`
Expected: FAIL — `Cannot find module '.../cargo.mjs'`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Fichier `scripts/lib/cargo.mjs` :

```js
// scripts/lib/cargo.mjs
// Client Cargo API du wiki FEH : pagination + anti-rate-limit. fetch/sleep injectables.

const API = 'https://feheroes.fandom.com/api.php';
const DEFAULT_UA = 'feh-collection-tracker/1.0 (+https://github.com/) catalog updater';
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl({ table, fields, orderBy, where, limit, offset }) {
  const parts = [
    'action=cargoquery',
    'format=json',
    `tables=${encodeURIComponent(table)}`,
    `fields=${encodeURIComponent(fields)}`,
    `limit=${limit}`,
    `offset=${offset}`,
  ];
  if (orderBy) parts.push(`order_by=${encodeURIComponent(orderBy)}`);
  if (where) parts.push(`where=${encodeURIComponent(where)}`);
  return `${API}?${parts.join('&')}`;
}

function stripPrecision(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.endsWith('__precision')) continue;
    out[k] = v;
  }
  return out;
}

export async function cargoQuery({
  table,
  fields,
  orderBy = '',
  where = '',
  limit = 500,
  fetchImpl = globalThis.fetch,
  sleepImpl = defaultSleep,
  pauseMs = 2500,
  maxRetries = 5,
  userAgent = DEFAULT_UA,
}) {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = buildUrl({ table, fields, orderBy, where, limit, offset });
    let page = null;
    let attempt = 0;
    for (;;) {
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
      const json = await res.json();
      if (json.error && json.error.code === 'ratelimited') {
        attempt += 1;
        if (attempt > maxRetries) {
          throw new Error(
            `Cargo ratelimited on ${table} (offset ${offset}) after ${maxRetries} retries`,
          );
        }
        await sleepImpl(pauseMs * 2 ** attempt);
        continue;
      }
      if (json.error) {
        throw new Error(`Cargo error on ${table}: ${JSON.stringify(json.error)}`);
      }
      page = (json.cargoquery ?? []).map((e) => stripPrecision(e.title ?? {}));
      break;
    }
    all.push(...page);
    if (page.length < limit) break;
    offset += limit;
    await sleepImpl(pauseMs);
  }
  return all;
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `node --test scripts/lib/cargo.test.mjs`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cargo.mjs scripts/lib/cargo.test.mjs
git commit -m "$(printf 'feat: add paginated Cargo API client with rate-limit backoff\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 9: Orchestrateur `fetch-heroes.mjs` + test de bout en bout hors ligne

**Files:**
- Create: `g:\GITHUB\feh-comp\scripts\fetch-heroes.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\fetch-heroes.test.mjs`

**Interfaces:**
- Consumes: `cargoQuery` (Task 8) ; `normalizeUnit`, `mergeJoins`, `applyOverrides`, `buildCatalog`, `normalizePageName`, `pageNameFor`, `blessingFromEffect`, `pickPoolRarity` (Tasks 4–7).
- Produces:
  - `run(opts?) -> Promise<Catalog>` où `opts` =
    `{ fetchImpl?, sleepImpl?, pauseMs?, now?: () => Date, outPath?: string|URL, overridesPath?: string|URL }`
    Effet de bord : écrit `outPath` (défaut `../data/heroes.json`) en JSON indenté 2 + `\n`. Retourne l'objet catalogue.
  - Lorsqu'il est lancé directement (`node scripts/fetch-heroes.mjs`), appelle `run()` avec les défauts et `process.exitCode = 1` en cas d'erreur.
  - Requête `Units` avec `fields = 'WikiName,Name,Title,Person,Origin,IntID,Gender,WeaponType,MoveType,Artist,ActorEN,ActorJP,ReleaseDate,Properties'` et `orderBy = 'ReleaseDate DESC,CharSort ASC'`.

- [ ] **Step 1: Écrire le test qui échoue**

Fichier `scripts/fetch-heroes.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './fetch-heroes.mjs';

function routeFetch(tables) {
  return async (url) => {
    const u = new URL(url);
    const table = u.searchParams.get('tables');
    const offset = Number(u.searchParams.get('offset') || '0');
    const rows = offset === 0 ? (tables[table] ?? []) : [];
    return { json: async () => ({ cargoquery: rows.map((title) => ({ title })) }) };
  };
}

const TABLES = {
  Units: [
    {
      WikiName: 'Rhea The Final Child', Name: 'Rhea', Title: 'The Final Child',
      Person: 'Rhea', Origin: 'Fire Emblem: Three Houses', IntID: '1200', Gender: 'F',
      WeaponType: 'Blue Breath', MoveType: 'Infantry', Artist: 'Kaya8',
      ActorEN: 'Cherami Leigh', ActorJP: 'Ai Kayano',
      ReleaseDate: '2026-08-31', Properties: 'legendary,hat',
    },
    {
      WikiName: 'Greeny The Older', Name: 'Greeny', Title: 'The Older',
      Person: 'Greeny', Origin: 'X', IntID: '10', Gender: 'M',
      WeaponType: 'Green Axe', MoveType: 'Armored', Artist: 'Z',
      ActorEN: '', ActorJP: '', ReleaseDate: '2020-01-01', Properties: '',
    },
  ],
  LegendaryHero: [{ Page: 'Rhea: The Final Child', LegendaryEffect: 'Fire' }],
  MythicHero: [],
  SummoningAvailability: [
    { Page: 'Greeny: The Older', Rarity: '3', Property: '', StartTime: '2020-01-01 07:00:00' },
    { Page: 'Greeny: The Older', Rarity: '4', Property: 'specialRate', StartTime: '2021-06-01 07:00:00' },
  ],
};

test('run normalise, joint, trie et écrit le catalogue', async () => {
  const outPath = path.join(os.tmpdir(), `feh-heroes-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const catalog = await run({
    fetchImpl: routeFetch(TABLES),
    sleepImpl: async () => {},
    pauseMs: 0,
    now: () => new Date('2026-09-08T00:00:00.000Z'),
    outPath,
    overridesPath: path.join(os.tmpdir(), 'feh-no-such-overrides.json'),
  });

  assert.equal(catalog.count, 2);
  assert.equal(catalog.generatedAt, '2026-09-08T00:00:00.000Z');
  assert.equal(catalog.source, 'feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)');

  const [first, second] = catalog.heroes;
  assert.equal(first.id, 'Rhea The Final Child');      // date la plus récente en tête
  assert.equal(first.blessing, 'fire');                // jointure LegendaryHero
  assert.equal(first.color, 'b');
  assert.equal(first.weapon, 'breath');
  assert.deepEqual(first.actorEn, ['Cherami Leigh']);

  assert.equal(second.id, 'Greeny The Older');
  assert.equal(second.poolRarity, 4);                  // StartTime le plus récent
  assert.deepEqual(second.poolFlags, ['specialRate']);
  assert.equal(second.blessing, null);

  const onDisk = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(onDisk.count, 2);
  assert.equal(onDisk.heroes[0].id, 'Rhea The Final Child');
});

test('run applique les overrides quand le fichier existe', async () => {
  const outPath = path.join(os.tmpdir(), `feh-heroes-ovr-${Date.now()}.json`);
  const overridesPath = path.join(os.tmpdir(), `feh-ovr-${Date.now()}.json`);
  await (await import('node:fs/promises')).writeFile(
    overridesPath,
    JSON.stringify({ add: [], patch: { 'Rhea The Final Child': { titleFr: "L'Enfant Ultime" } } }),
    'utf8',
  );
  const catalog = await run({
    fetchImpl: routeFetch(TABLES),
    sleepImpl: async () => {},
    pauseMs: 0,
    now: () => new Date('2026-09-08T00:00:00.000Z'),
    outPath,
    overridesPath,
  });
  const rhea = catalog.heroes.find((h) => h.id === 'Rhea The Final Child');
  assert.equal(rhea.titleFr, "L'Enfant Ultime");
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `node --test scripts/fetch-heroes.test.mjs`
Expected: FAIL — `Cannot find module '.../fetch-heroes.mjs'`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Fichier `scripts/fetch-heroes.mjs` :

```js
// scripts/fetch-heroes.mjs
// Orchestrateur : Cargo (4 tables) -> normalisation -> overrides -> data/heroes.json.

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cargoQuery } from './lib/cargo.mjs';
import {
  normalizeUnit, mergeJoins, applyOverrides, buildCatalog,
  normalizePageName, blessingFromEffect, pickPoolRarity,
} from './lib/normalize.mjs';

const UNIT_FIELDS = [
  'WikiName', 'Name', 'Title', 'Person', 'Origin', 'IntID', 'Gender',
  'WeaponType', 'MoveType', 'Artist', 'ActorEN', 'ActorJP', 'ReleaseDate', 'Properties',
].join(',');

export async function run({
  fetchImpl = globalThis.fetch,
  sleepImpl,
  pauseMs,
  now = () => new Date(),
  outPath = new URL('../data/heroes.json', import.meta.url),
  overridesPath = new URL('../data/heroes.overrides.json', import.meta.url),
} = {}) {
  const common = { fetchImpl };
  if (sleepImpl) common.sleepImpl = sleepImpl;
  if (pauseMs !== undefined) common.pauseMs = pauseMs;

  const units = await cargoQuery({
    ...common, table: 'Units', fields: UNIT_FIELDS,
    orderBy: 'ReleaseDate DESC,CharSort ASC',
  });
  const legendary = await cargoQuery({
    ...common, table: 'LegendaryHero', fields: '_pageName=Page,LegendaryEffect',
  });
  const mythic = await cargoQuery({
    ...common, table: 'MythicHero', fields: '_pageName=Page,MythicEffect',
  });
  const availability = await cargoQuery({
    ...common, table: 'SummoningAvailability',
    fields: '_pageName=Page,Rarity,Property,StartTime', orderBy: 'StartTime DESC',
  });

  const blessingByPage = new Map();
  for (const r of legendary) {
    const b = blessingFromEffect(r.LegendaryEffect);
    if (b) blessingByPage.set(normalizePageName(r.Page), b);
  }
  for (const r of mythic) {
    const b = blessingFromEffect(r.MythicEffect);
    if (b) blessingByPage.set(normalizePageName(r.Page), b);
  }

  const poolRowsByPage = new Map();
  for (const r of availability) {
    const key = normalizePageName(r.Page);
    if (!poolRowsByPage.has(key)) poolRowsByPage.set(key, []);
    poolRowsByPage.get(key).push({
      rarity: r.Rarity, property: r.Property ?? '', startTime: r.StartTime ?? '',
    });
  }
  const poolByPage = new Map();
  for (const [key, rows] of poolRowsByPage) {
    poolByPage.set(key, pickPoolRarity(rows));
  }

  let heroes = units.map(
    (u) => mergeJoins(normalizeUnit(u), { blessingByPage, poolByPage }),
  );

  let overrides = { add: [], patch: {} };
  try {
    overrides = JSON.parse(await readFile(overridesPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  heroes = applyOverrides(heroes, overrides);

  const unresolved = heroes.filter(
    (h) => (h.category === 'legendary' || h.category === 'mythic') && !h.blessing,
  );
  if (unresolved.length) {
    console.warn(`[fetch-heroes] ${unresolved.length} héros legendary/mythic sans blessing résolu :`);
    for (const h of unresolved) console.warn(`  - ${h.id}`);
  }

  const catalog = buildCatalog(heroes, { generatedAt: now().toISOString() });
  await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  return catalog;
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  run().then(
    (c) => console.log(`[fetch-heroes] ${c.count} héros écrits dans data/heroes.json`),
    (err) => { console.error(err); process.exitCode = 1; },
  );
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `node --test scripts/fetch-heroes.test.mjs`
Expected: PASS — 2 tests.

- [ ] **Step 5: Lancer toute la suite**

Run: `node --test`
Expected: PASS — `normalize.test.mjs` + `cargo.test.mjs` + `fetch-heroes.test.mjs`, 0 échec.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-heroes.mjs scripts/fetch-heroes.test.mjs
git commit -m "$(printf 'feat: add fetch-heroes orchestrator with offline e2e test\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 10: Première génération réelle du catalogue (réseau)

**Files:**
- Create (généré): `g:\GITHUB\feh-comp\data\heroes.json`

**Interfaces:**
- Consumes: `run()` par défaut (réseau réel vers `feheroes.fandom.com`).
- Produces: `data/heroes.json` réel commité, consommé plus tard par le Plan B.

- [ ] **Step 1: Lancer le script contre l'API réelle**

Run: `node scripts/fetch-heroes.mjs`
Expected: se termine par `[fetch-heroes] <N> héros écrits dans data/heroes.json` avec `N > 1000`.
Note rate-limit : si le script échoue sur `Cargo ratelimited ... after 5 retries`, attendre ~2–3 min et relancer. Le back-off intégré gère les ralentissements ponctuels ; un blocage total est temporaire côté wiki.

- [ ] **Step 2: Vérifier la forme du fichier généré**

Run:
```bash
node -e "const c=require('./data/heroes.json'); console.log(c.count, c.source); const h=c.heroes[0]; console.log(Object.keys(h).join(',')); const L=c.heroes.filter(x=>x.category==='legendary'); console.log('legendary:',L.length,'avec blessing:',L.filter(x=>x.blessing).length); console.log('poolRarity renseigné:', c.heroes.filter(x=>x.poolRarity!=null).length)"
```
Expected :
- `count` cohérent avec le nombre affiché au Step 1, `source` = la constante exacte.
- les clés du 1er héros incluent `id,name,title,titleFr,person,color,weapon,move,gender,origin,category,properties,blessing,poolRarity,poolFlags,artist,actorEn,actorJp,releaseDate,intId`.
- « legendary avec blessing » proche du total des légendaires (quelques non-résolus tolérés — voir warnings du Step 1, à traiter via `heroes.overrides.json` si nombreux ; cf. §10 Q7 du spec).
- « poolRarity renseigné » > 0 (héros du pool standard).

- [ ] **Step 3: Vérifier le tri**

Run:
```bash
node -e "const c=require('./data/heroes.json'); const d=c.heroes.map(h=>h.releaseDate); const sorted=[...d].sort((a,b)=> (b||'')<(a||'')?-1:1); console.log('tri date desc OK:', JSON.stringify(d)===JSON.stringify(sorted))"
```
Expected: `tri date desc OK: true`

- [ ] **Step 4: Commit**

```bash
git add data/heroes.json
git commit -m "$(printf 'chore: add first generated heroes catalog\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 11: GitHub Action `update-heroes.yml`

**Files:**
- Create: `g:\GITHUB\feh-comp\.github\workflows\update-heroes.yml`

**Interfaces:**
- Consumes: `node --test` et `node scripts/fetch-heroes.mjs` (Tasks 2–10).
- Produces: workflow `workflow_dispatch` + cron hebdo qui régénère et commit `data/heroes.json` en cas de diff.

- [ ] **Step 1: Créer le workflow**

Fichier `.github/workflows/update-heroes.yml` :

```yaml
name: Update heroes catalog

on:
  workflow_dispatch:
  schedule:
    - cron: "0 6 * * 1"  # lundis 06:00 UTC — ajustable (cf. spec §10 Q5)

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Run tests
        run: node --test

      - name: Regenerate catalog
        run: node scripts/fetch-heroes.mjs

      - name: Commit if changed
        run: |
          if ! git diff --quiet -- data/heroes.json; then
            git config user.name "feh-bot"
            git config user.email "feh-bot@users.noreply.github.com"
            git add data/heroes.json
            git commit -m "chore: update heroes catalog ($(date -u +%F))"
            git push
          else
            echo "No catalog changes."
          fi
```

- [ ] **Step 2: Revue de conformité du fichier**

Vérifier à la lecture :
- `permissions: contents: write` présent (nécessaire au `git push` du job).
- l'étape `Run tests` précède `Regenerate catalog`.
- le bloc `Commit if changed` ne commit **que** si `data/heroes.json` a changé (`git diff --quiet` inversé).
- indentation YAML à 2 espaces, pas de tabulation.

- [ ] **Step 3: Rejouer localement la commande exacte du job**

Run: `node --test && node scripts/fetch-heroes.mjs`
Expected: tests verts puis `[fetch-heroes] <N> héros écrits...`. `git status` doit montrer `data/heroes.json` inchangé ou avec un diff mineur de `generatedAt` uniquement (normal — ne pas committer ce diff seul ici).

- [ ] **Step 4: Restaurer `heroes.json` si seul `generatedAt` a bougé**

Run:
```bash
git checkout -- data/heroes.json
```
Expected: `git status` propre hormis le nouveau workflow.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/update-heroes.yml
git commit -m "$(printf 'feat: add weekly catalog update workflow\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

- [ ] **Step 6: (après mise en ligne du dépôt sur GitHub) déclencher manuellement**

Quand le dépôt est poussé sur GitHub : onglet **Actions → Update heroes catalog → Run workflow**. Vérifier le run vert et, dans les logs de l'étape `Commit if changed`, soit un commit `chore: update heroes catalog (...)`, soit `No catalog changes.` Cette étape n'est pas bloquante pour le Plan A (aucun remote requis en local).

---

## Self-Review

**1. Spec coverage** (spec = `feh-collection-tracker-design.md`, portée Plan A = §3, §4 partiel, §5.1/§5.2, §7) :

| Exigence spec | Task |
|---|---|
| Endpoint Cargo `Units` paginé, `limit` 500, `User-Agent`, back-off `ratelimited` (§3, §7.8) | Task 8 |
| Normalisation `WeaponType` → `color`/`weapon`, codes `r/b/v/g` (§3) | Task 2 |
| Normalisation `MoveType` (§3) | Task 2 |
| `Properties` → `category` (priorité) + array brut (§3) | Task 3 |
| `ReleaseDate` ISO, tri « nouveaux » (§3) | Task 6 (troncature), Task 7 (tri) |
| `Gender`, `Artist`, `ActorEN/JP` → champs (§3) | Task 6 |
| `Person` → clé de regroupement (§3) | Task 6 |
| Tables jointes `LegendaryHero` / `MythicHero` → `blessing` (§3) | Tasks 4, 9 |
| Table `SummoningAvailability` → `poolRarity` + `poolFlags`, règle StartTime max hors `revivalOnly` (§3) | Tasks 5, 9 |
| Jointure par `_pageName` ≈ `"Name: Title"`, matching tolérant, log des non-résolus (§3, §7.3) | Tasks 4, 9 (warn) |
| `heroes.json` : `generatedAt`, `source`, `count`, `heroes[]`, indenté 2 (§5.1) | Task 7, Task 9 (écriture + `\n`) |
| Champs héros de `heroes.json` (§5.1) | Task 6 (forme), Task 10 (vérif réelle) |
| `heroes.overrides.json` : `add` + `patch` par `id`, `add` écrase (§5.2) | Task 1 (seed), Task 7 (logique) |
| `fetch-heroes.mjs` pseudo 1→8 (§7) | Task 9 |
| Aucun `package.json`, `fetch` natif + `fs` (§4) | Global Constraints, toutes tasks |
| GitHub Action `workflow_dispatch` + cron hebdo + commit si diff (§7) | Task 11 |
| Chemins générés commités (`data/heroes.json`) (§2) | Task 10 |

Hors périmètre Plan A (couvert par B/C/D) : app web, i18n, `localStorage`, PWA, export résumé, `migrate-sheet.mjs`. Aucune exigence Plan A sans task.

**2. Placeholder scan** : aucun « TBD/TODO », chaque étape de code contient le code complet, chaque commande a une sortie attendue. Task 11 Step 6 est une action distante explicitement non bloquante, pas un placeholder.

**3. Type consistency** :
- `Hero` : forme fixée en Task 6, réutilisée à l'identique en Tasks 7/9 (mêmes 20 clés).
- `pickPoolRarity` renvoie `{ poolRarity, poolFlags }` (Task 5) — consommé tel quel par `mergeJoins` (Task 6) et l'orchestrateur (Task 9).
- `cargoQuery(opts)` signature (Task 8) — appelée en Task 9 avec `{ ...common, table, fields, orderBy }`, cohérent.
- `run(opts)` signature (Task 9) — appelée en Task 9 (tests) et Task 10/11 (défauts), cohérent.
- `normalizePageName` / `pageNameFor` : mêmes noms partout (Tasks 4, 6, 9).

---

## Execution Handoff

Plan complet et sauvegardé dans `docs/superpowers/plans/2026-09-08-plan-a-pipeline-donnees.md`. Deux options d'exécution :

**1. Subagent-Driven (recommandé)** — un subagent neuf par task, revue entre chaque, itération rapide.

**2. Inline Execution** — exécution des tasks dans cette session via executing-plans, par lots avec points de contrôle.

Quelle approche ?
