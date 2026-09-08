# Plan B — App catalogue (lecture seule) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un site statique vanilla (aucun build, zéro dépendance) servi par GitHub Pages qui charge `data/heroes.json` et affiche un **catalogue navigable** : grille de cartes avec portraits + icônes classe/déplacement, filtres combinables (couleur, arme, déplacement, catégorie, jeu d'origine, genre, bénédiction, rareté du pool), recherche texte, tri, toggle « grouper par personnage », panneau détail en lecture seule, interface bilingue EN/FR. Aucun état de collection perso (c'est le Plan C).

**Architecture :** Le pipeline Plan A est étendu (helpers purs dans `scripts/lib/normalize.mjs`) pour écrire `image` / `imageFull` / `origins` et un `gender` normalisé dans `heroes.json` ; un nouveau `scripts/fetch-icons.mjs` rapatrie les ~23 icônes classe/déplacement du wiki dans `assets/icons/`. L'app est découpée en **modules ESM purs testables** sous `js/` (`i18n.mjs`, `hero-media.mjs`, `catalog-view.mjs`) + un `app.js` mince de câblage DOM. Les modules purs tournent sous `node --test` sans DOM ; `app.js` / `index.html` / `styles.css` sont vérifiés en servant le site localement (`scripts/serve.mjs`, zéro dépendance) puis visuellement sur GitHub Pages.

**Tech Stack :** HTML5 + CSS + JavaScript ESM natif. Aucun framework, aucun bundler, aucun `package.json`, aucune dépendance npm. Node ≥ 20 uniquement pour le pipeline et les tests (`node --test`). GitHub Pages pour l'hébergement.

## Global Constraints

- **Aucun `package.json`, aucun build, zéro dépendance npm.** Tests : `node --test` **sans argument** (découverte récursive ; un argument répertoire échoue sur Node 22). Fichier ciblé : `node --test js/i18n.test.mjs`.
- Modules ESM `.mjs` pour le code testé sous `js/` et `scripts/`. `app.js` est un module ES (`<script type="module">`).
- **Chemins relatifs partout** dans `index.html` / `app.js` (`data/heroes.json`, `js/…`, `assets/…`) — le site vit sous `https://drzeroes.github.io/feh-heroes-tracker/`.
- `data/heroes.json` reste **généré** (`JSON.stringify(obj, null, 2)` + `\n` final) ; ne jamais l'éditer à la main.
- Forme d'un héros dans `heroes.json` après ce plan — **23 clés** dans cet ordre :
  `id, name, title, titleFr, person, color, weapon, move, gender, origin, origins, category, properties, blessing, poolRarity, poolFlags, artist, actorEn, actorJp, image, imageFull, releaseDate, intId`
- `gender` **normalisé** : `female | male | multi | other` (les valeurs brutes du wiki sont `Female/Male/F/M/MF/FM/FF/MM/N/NF/…`).
- `origins` : `string[]` = `origin` scindé sur `,` et trimé (le wiki renvoie parfois plusieurs jeux joints par virgule). `origin` (string brute) est conservé pour l'affichage.
- URL image : `https://feheroes.fandom.com/wiki/Special:FilePath/<WikiName_avec_underscores><suffixe>` — `image` = suffixe `_Face_FC.webp`, `imageFull` = suffixe `_Face.webp`.
- Icônes locales : `assets/icons/move-<move>.webp` (`infantry|cavalry|flying|armored`) et `assets/icons/class-<color>-<weapon>.webp` (`color` ∈ `r|b|v|g`, `weapon` ∈ `sword|lance|axe|bow|dagger|tome|staff|breath|beast`).
- Codes couleur : `r`=Red, `b`=Blue, `v`=Green, `g`=Colorless.
- i18n : langue mémorisée `localStorage['feh-lang']` (`en`|`fr`), défaut = langue navigateur sinon `en` ; clé manquante → fallback `en` → clé brute.
- Thème : clair/sombre via `prefers-color-scheme`, tokens CSS sur `:root`.
- Commits fréquents. Préfixes `feat:` / `chore:` / `test:`. Chaque message se termine par :
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `scripts/lib/normalize.mjs` | **+** `heroImageUrls(wikiName)`, `normalizeGender(raw)`, `parseOrigins(raw)` ; `normalizeUnit` gagne `image`/`imageFull`/`origins` et un `gender` normalisé. |
| `scripts/lib/wiki-assets.mjs` | **Nouveau.** `classIconFile(color, weapon)`, `moveIconFile(move)` → noms de fichiers wiki (`Icon_Class_Red_Sword.png`, `Icon_Move_Infantry.png`). |
| `scripts/fetch-icons.mjs` | **Nouveau.** Lit `data/heroes.json`, énumère les couples `(color,weapon)` + les 4 déplacements présents, télécharge dans `assets/icons/`. `fetchImpl` injectable. |
| `scripts/serve.mjs` | **Nouveau.** Serveur statique zéro-dépendance (`node scripts/serve.mjs [port]`) pour tester l'app en local. |
| `assets/icons/*.webp` | **Généré puis commité.** ~4 déplacements + ~19 classes. |
| `js/i18n.mjs` | Pur : `resolveLang(stored, navLangs, supported)`, `makeTranslator(dicts, lang, fallback)` → `t(key, params?)`. |
| `js/hero-media.mjs` | Pur : `colorHex(color)`, `classIconPath(hero)`, `moveIconPath(hero)`, `imageCandidates(hero)`. |
| `js/catalog-view.mjs` | Pur : `buildFacetOptions(heroes)`, `applyFilters(heroes, filters, query)`, `sortHeroes(heroes, key)`, `groupByPerson(heroes)`. |
| `js/*.test.mjs` | Tests `node --test` des 3 modules ci-dessus (aucun DOM). |
| `i18n/en.json`, `i18n/fr.json` | Vocabulaire d'interface + libellés des valeurs (couleur, arme, déplacement, catégorie ×13, bénédiction ×8, genre ×4, rareté). |
| `index.html` | Remplace le placeholder. Coquille : header (titre, bascule langue), barre de contrôles, `<main id="grid">`, `<aside id="detail" hidden>`, footer. |
| `styles.css` | Thème clair/sombre, grille responsive, carte, panneau détail, tuile de repli. |
| `app.js` | Câblage : charge données + i18n, peuple les contrôles depuis les facettes, rend la grille paginée (IntersectionObserver), carte → panneau détail, bascule langue, persistance `localStorage`. |
| `feh-collection-tracker-design.md` | §3 + §5.1 mis à jour (gender normalisé, `origins`, `image`/`imageFull` déjà en §3 rév c). |

---

## Task 1: `normalize.mjs` — helpers image / gender / origins

**Files:**
- Modify: `g:\GITHUB\feh-comp\scripts\lib\normalize.mjs`
- Test: `g:\GITHUB\feh-comp\scripts\lib\normalize.test.mjs` (append)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `heroImageUrls(wikiName: string) -> { image: string|null, imageFull: string|null }` — `null`/`null` si `wikiName` vide.
  - `normalizeGender(raw: string) -> 'female'|'male'|'multi'|'other'`
  - `parseOrigins(raw: string) -> string[]`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `scripts/lib/normalize.test.mjs` :

```js
import { heroImageUrls, normalizeGender, parseOrigins } from './normalize.mjs';

test('heroImageUrls dérive les deux URL du WikiName', () => {
  assert.deepEqual(heroImageUrls('Rhea The Final Child'), {
    image: 'https://feheroes.fandom.com/wiki/Special:FilePath/Rhea_The_Final_Child_Face_FC.webp',
    imageFull: 'https://feheroes.fandom.com/wiki/Special:FilePath/Rhea_The_Final_Child_Face.webp',
  });
  assert.deepEqual(heroImageUrls(''), { image: null, imageFull: null });
  assert.deepEqual(heroImageUrls(null), { image: null, imageFull: null });
});

test('normalizeGender ramène à female/male/multi/other', () => {
  assert.equal(normalizeGender('Female'), 'female');
  assert.equal(normalizeGender('F'), 'female');
  assert.equal(normalizeGender('Male'), 'male');
  assert.equal(normalizeGender('M'), 'male');
  assert.equal(normalizeGender('MF'), 'multi');
  assert.equal(normalizeGender('FM'), 'multi');
  assert.equal(normalizeGender('FF'), 'multi');
  assert.equal(normalizeGender('MM'), 'multi');
  assert.equal(normalizeGender('N'), 'other');
  assert.equal(normalizeGender('NF'), 'other');
  assert.equal(normalizeGender(''), 'other');
  assert.equal(normalizeGender(null), 'other');
});

test('parseOrigins scinde sur la virgule', () => {
  assert.deepEqual(parseOrigins('Fire Emblem Awakening'), ['Fire Emblem Awakening']);
  assert.deepEqual(
    parseOrigins('Fire Emblem Awakening,Fire Emblem Engage'),
    ['Fire Emblem Awakening', 'Fire Emblem Engage'],
  );
  assert.deepEqual(parseOrigins(' A , , B '), ['A', 'B']);
  assert.deepEqual(parseOrigins(''), []);
  assert.deepEqual(parseOrigins(null), []);
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: FAIL — `heroImageUrls is not a function`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à `scripts/lib/normalize.mjs` :

```js
const WIKI_FILEPATH = 'https://feheroes.fandom.com/wiki/Special:FilePath';

export function heroImageUrls(wikiName) {
  const name = String(wikiName ?? '').trim();
  if (!name) return { image: null, imageFull: null };
  const slug = name.replace(/ /g, '_');
  return {
    image: `${WIKI_FILEPATH}/${slug}_Face_FC.webp`,
    imageFull: `${WIKI_FILEPATH}/${slug}_Face.webp`,
  };
}

export function normalizeGender(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === 'FEMALE' || s === 'F') return 'female';
  if (s === 'MALE' || s === 'M') return 'male';
  if (/^[MF]{2,}$/.test(s)) return 'multi';
  return 'other';
}

export function parseOrigins(raw) {
  return String(raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `node --test scripts/lib/normalize.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.mjs scripts/lib/normalize.test.mjs
git commit -m "$(printf 'feat: add hero image URL, gender and origins helpers\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: `normalizeUnit` — nouveaux champs + forme à 23 clés

**Files:**
- Modify: `g:\GITHUB\feh-comp\scripts\lib\normalize.mjs` (`normalizeUnit`)
- Modify: `g:\GITHUB\feh-comp\scripts\lib\normalize.test.mjs` (test de forme)
- Modify: `g:\GITHUB\feh-comp\scripts\heroes-catalog.test.mjs` (`HERO_KEYS`)
- Modify: `g:\GITHUB\feh-comp\scripts\fetch-heroes.test.mjs` (assertions e2e)
- Modify: `g:\GITHUB\feh-comp\feh-collection-tracker-design.md` (§3 gender + `origins`, §5.1 exemple)

**Interfaces:**
- Consumes: `heroImageUrls`, `normalizeGender`, `parseOrigins` (Task 1) ; `splitWeaponType`, `normalizeMoveType`, `parseListField`, `deriveCategory` (Plan A).
- Produces: `normalizeUnit(raw)` renvoie un `Hero` de **23 clés** :
  `{ id, name, title, titleFr, person, color, weapon, move, gender: 'female'|'male'|'multi'|'other', origin: string|null, origins: string[], category, properties: string[], blessing: null, poolRarity: null, poolFlags: [], artist: string|null, actorEn: string[], actorJp: string[], image: string|null, imageFull: string|null, releaseDate: string|null, intId: number|null }`
  (`blessing`/`poolRarity`/`poolFlags` toujours remplis ensuite par `mergeJoins`, inchangé.)

- [ ] **Step 1: Mettre à jour les tests (RED)**

Dans `scripts/lib/normalize.test.mjs`, test `normalizeUnit produit un héros normalisé sans jointures` : ajouter aux assertions
```js
  assert.equal(h.gender, 'female'); // RAW_RHEA.Gender = 'F' -> normalisé
  assert.deepEqual(h.origins, ['Fire Emblem: Three Houses']);
  assert.equal(h.image, 'https://feheroes.fandom.com/wiki/Special:FilePath/Rhea_The_Final_Child_Face_FC.webp');
  assert.equal(h.imageFull, 'https://feheroes.fandom.com/wiki/Special:FilePath/Rhea_The_Final_Child_Face.webp');
```
et dans le test `normalizeUnit tolère les champs manquants` :
```js
  assert.equal(h.gender, 'other');
  assert.deepEqual(h.origins, []);
  assert.equal(h.image, 'https://feheroes.fandom.com/wiki/Special:FilePath/X_Face_FC.webp');
```
(le fixture `{ WikiName: 'X', Name: 'X', Title: '' }` a bien un `WikiName`.)

Dans `scripts/heroes-catalog.test.mjs`, remplacer `HERO_KEYS` par :
```js
const HERO_KEYS = ['id','name','title','titleFr','person','color','weapon','move','gender','origin',
  'origins','category','properties','blessing','poolRarity','poolFlags','artist','actorEn','actorJp',
  'image','imageFull','releaseDate','intId'];
```
et ajouter un test :
```js
test('catalog: gender ∈ {female,male,multi,other}', () => {
  const bad = [...new Set(catalog.heroes.map((h) => h.gender))].filter(
    (g) => !['female', 'male', 'multi', 'other'].includes(g),
  );
  assert.deepEqual(bad, []);
});
test('catalog: image/imageFull are Special:FilePath URLs', () => {
  for (const h of catalog.heroes) {
    assert.match(h.image, /^https:\/\/feheroes\.fandom\.com\/wiki\/Special:FilePath\/.+_Face_FC\.webp$/, h.id);
    assert.match(h.imageFull, /_Face\.webp$/, h.id);
  }
});
```

Dans `scripts/fetch-heroes.test.mjs`, test `run normalise, joint, trie et écrit le catalogue` : ajouter
```js
  assert.equal(first.gender, 'female'); // RAW fixture Gender 'F'
  assert.deepEqual(first.origins, ['Fire Emblem: Three Houses']);
  assert.equal(first.image, 'https://feheroes.fandom.com/wiki/Special:FilePath/Rhea_The_Final_Child_Face_FC.webp');
```

Run: `node --test` → FAIL (forme à 20 clés, `gender` brut).

- [ ] **Step 2: Implémenter dans `normalizeUnit`**

Remplacer le corps de `normalizeUnit` dans `scripts/lib/normalize.mjs` (ajouts en gras — garder l'ordre des clés du bloc Interfaces) :

```js
export function normalizeUnit(raw) {
  const { color, weapon } = splitWeaponType(raw.WeaponType);
  const properties = parseListField(raw.Properties);
  const releaseDate = String(raw.ReleaseDate ?? '').slice(0, 10) || null;
  const intIdNum = Number.parseInt(raw.IntID, 10);
  const origin = String(raw.Origin ?? '').trim() || null;
  const { image, imageFull } = heroImageUrls(raw.WikiName);
  return {
    id: String(raw.WikiName ?? '').trim(),
    name: String(raw.Name ?? '').trim(),
    title: String(raw.Title ?? '').trim(),
    titleFr: null,
    person: String(raw.Person ?? '').trim() || null,
    color,
    weapon,
    move: normalizeMoveType(raw.MoveType),
    gender: normalizeGender(raw.Gender),
    origin,
    origins: parseOrigins(raw.Origin),
    category: deriveCategory(properties),
    properties,
    blessing: null,
    poolRarity: null,
    poolFlags: [],
    artist: String(raw.Artist ?? '').trim() || null,
    actorEn: parseListField(raw.ActorEN),
    actorJp: parseListField(raw.ActorJP),
    image,
    imageFull,
    releaseDate,
    intId: Number.isFinite(intIdNum) ? intIdNum : null,
  };
}
```

- [ ] **Step 3: Mettre à jour le design spec**

Dans `feh-collection-tracker-design.md` §3, remplacer la ligne `**`Gender`** : garder tel quel …` par :
> **`Gender`** : brut du wiki = `Female/Male/F/M/MF/FM/FF/MM/N/NF/…`. Normalisé → `female | male | multi | other` (`multi` = code à 2 lettres d'une paire duo/harmonique). Filtre + affichage.

et ajouter après la ligne `**`Person`** :
> **`Origin`** : peut contenir plusieurs jeux joints par `,`. Conserver `origin` (string brute, affichage) **et** `origins` (array scindé, filtre/facette).

Dans §5.1, ajouter `"origins": ["Fire Emblem: Three Houses"],` sous `"origin": …` dans l'exemple, et noter en fin : « Rév. 2026-09-08d : `origins`, `gender` normalisé. »

- [ ] **Step 4: GREEN**

Run: `node --test`
Expected: `normalize` + `cargo` + `fetch-heroes` verts. `heroes-catalog.test.mjs` : les tests `gender ∈ …`, `image/imageFull …` et la forme à 23 clés **échouent contre l'ancien `data/heroes.json`** — c'est attendu, régénération en Task 4. Tous les autres verts.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/normalize.mjs scripts/lib/normalize.test.mjs scripts/heroes-catalog.test.mjs scripts/fetch-heroes.test.mjs feh-collection-tracker-design.md
git commit -m "$(printf 'feat: add image/origins fields and normalized gender to hero shape\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: `wiki-assets.mjs` + `fetch-icons.mjs`

**Files:**
- Create: `g:\GITHUB\feh-comp\scripts\lib\wiki-assets.mjs`
- Create: `g:\GITHUB\feh-comp\scripts\lib\wiki-assets.test.mjs`
- Create: `g:\GITHUB\feh-comp\scripts\fetch-icons.mjs`
- Create: `g:\GITHUB\feh-comp\scripts\fetch-icons.test.mjs`

**Interfaces:**
- Consumes: `data/heroes.json` (au runtime du script).
- Produces:
  - `classIconFile(color, weapon) -> string` — ex. `('r','sword') -> 'Icon_Class_Red_Sword.png'`. `null` si couleur/arme inconnue.
  - `moveIconFile(move) -> string` — ex. `'infantry' -> 'Icon_Move_Infantry.png'`. `null` si inconnu.
  - `assetName(kind, ...) -> string` — `assetName('class','r','sword') -> 'class-r-sword.webp'`, `assetName('move','infantry') -> 'move-infantry.webp'`.
  - `collectIconSpecs(heroes) -> Array<{ wikiFile: string, assetFile: string }>` — dédupliqué, trié, couvre les moves + les couples `(color,weapon)` présents.
  - `run(opts?)` dans `fetch-icons.mjs` : `{ fetchImpl?, sleepImpl?, pauseMs?, catalogPath?, outDir? }` → télécharge chaque spec absente dans `outDir`, retourne `{ downloaded: string[], skipped: string[] }`.

- [ ] **Step 1: Test `wiki-assets` (RED)**

`scripts/lib/wiki-assets.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classIconFile, moveIconFile, assetName, collectIconSpecs } from './wiki-assets.mjs';

test('classIconFile mappe couleur+arme vers le nom wiki', () => {
  assert.equal(classIconFile('r', 'sword'), 'Icon_Class_Red_Sword.png');
  assert.equal(classIconFile('g', 'bow'), 'Icon_Class_Colorless_Bow.png');
  assert.equal(classIconFile('v', 'beast'), 'Icon_Class_Green_Beast.png');
  assert.equal(classIconFile('x', 'sword'), null);
  assert.equal(classIconFile('r', 'nope'), null);
});

test('moveIconFile mappe le déplacement', () => {
  assert.equal(moveIconFile('infantry'), 'Icon_Move_Infantry.png');
  assert.equal(moveIconFile('armored'), 'Icon_Move_Armored.png');
  assert.equal(moveIconFile('boat'), null);
});

test('assetName produit le nom de fichier local', () => {
  assert.equal(assetName('class', 'r', 'sword'), 'class-r-sword.webp');
  assert.equal(assetName('move', 'flying'), 'move-flying.webp');
});

test('collectIconSpecs dédupe, couvre moves + couples présents', () => {
  const heroes = [
    { color: 'r', weapon: 'sword', move: 'infantry' },
    { color: 'r', weapon: 'sword', move: 'cavalry' },
    { color: 'b', weapon: 'lance', move: 'infantry' },
    { color: null, weapon: null, move: 'flying' },
  ];
  const specs = collectIconSpecs(heroes);
  const assetFiles = specs.map((s) => s.assetFile).sort();
  assert.deepEqual(assetFiles, [
    'class-b-lance.webp', 'class-r-sword.webp',
    'move-cavalry.webp', 'move-flying.webp', 'move-infantry.webp',
  ]);
  const sword = specs.find((s) => s.assetFile === 'class-r-sword.webp');
  assert.equal(sword.wikiFile, 'Icon_Class_Red_Sword.png');
});
```

Run: `node --test scripts/lib/wiki-assets.test.mjs` → FAIL (module manquant).

- [ ] **Step 2: `wiki-assets.mjs`**

```js
// scripts/lib/wiki-assets.mjs — noms de fichiers wiki des icônes classe / déplacement.
const COLOR_NAME = { r: 'Red', b: 'Blue', v: 'Green', g: 'Colorless' };
const WEAPON_NAME = {
  sword: 'Sword', lance: 'Lance', axe: 'Axe', bow: 'Bow', dagger: 'Dagger',
  tome: 'Tome', staff: 'Staff', breath: 'Breath', beast: 'Beast',
};
const MOVE_NAME = { infantry: 'Infantry', cavalry: 'Cavalry', flying: 'Flying', armored: 'Armored' };

export function classIconFile(color, weapon) {
  const c = COLOR_NAME[color];
  const w = WEAPON_NAME[weapon];
  return c && w ? `Icon_Class_${c}_${w}.png` : null;
}

export function moveIconFile(move) {
  const m = MOVE_NAME[move];
  return m ? `Icon_Move_${m}.png` : null;
}

export function assetName(kind, a, b) {
  return kind === 'class' ? `class-${a}-${b}.webp` : `move-${a}.webp`;
}

export function collectIconSpecs(heroes) {
  const byAsset = new Map();
  for (const h of heroes) {
    const mv = moveIconFile(h.move);
    if (mv) byAsset.set(assetName('move', h.move), { wikiFile: mv, assetFile: assetName('move', h.move) });
    const cl = classIconFile(h.color, h.weapon);
    if (cl) {
      byAsset.set(assetName('class', h.color, h.weapon), {
        wikiFile: cl, assetFile: assetName('class', h.color, h.weapon),
      });
    }
  }
  return [...byAsset.values()].sort((x, y) => x.assetFile.localeCompare(y.assetFile));
}
```

Run: `node --test scripts/lib/wiki-assets.test.mjs` → PASS.

- [ ] **Step 3: Test `fetch-icons` (RED)**

`scripts/fetch-icons.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './fetch-icons.mjs';

test('run télécharge les specs absentes et saute les présentes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'feh-icons-'));
  const catalogPath = path.join(dir, 'heroes.json');
  await writeFile(catalogPath, JSON.stringify({
    heroes: [
      { color: 'r', weapon: 'sword', move: 'infantry' },
      { color: 'b', weapon: 'lance', move: 'flying' },
    ],
  }), 'utf8');
  const outDir = path.join(dir, 'icons');
  await (await import('node:fs/promises')).mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'move-infantry.webp'), 'x', 'utf8'); // déjà présent

  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(`bytes:${url}`).buffer };
  };
  const res = await run({
    fetchImpl, sleepImpl: async () => {}, pauseMs: 0, catalogPath, outDir,
  });

  assert.ok(!res.downloaded.includes('move-infantry.webp'));         // sauté
  assert.deepEqual(res.downloaded.sort(), ['class-b-lance.webp', 'class-r-sword.webp', 'move-flying.webp']);
  assert.equal(calls.length, 3);
  assert.match(calls[0], /Special:FilePath\/Icon_/);
  const written = (await readdir(outDir)).sort();
  assert.deepEqual(written, ['class-b-lance.webp', 'class-r-sword.webp', 'move-flying.webp', 'move-infantry.webp']);
  assert.equal(await readFile(path.join(outDir, 'move-flying.webp'), 'utf8'), 'bytes:https://feheroes.fandom.com/wiki/Special:FilePath/Icon_Move_Flying.png');
});
```

Run: `node --test scripts/fetch-icons.test.mjs` → FAIL (module manquant).

- [ ] **Step 4: `fetch-icons.mjs`**

```js
// scripts/fetch-icons.mjs — rapatrie les icônes classe/déplacement du wiki dans assets/icons/.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collectIconSpecs } from './lib/wiki-assets.mjs';

const FILEPATH = 'https://feheroes.fandom.com/wiki/Special:FilePath';
const UA = 'feh-collection-tracker/1.0 (+https://github.com/DrZeroes/feh-heroes-tracker) icon fetch';
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

export async function run({
  fetchImpl = globalThis.fetch,
  sleepImpl = defaultSleep,
  pauseMs = 1500,
  catalogPath = new URL('../data/heroes.json', import.meta.url),
  outDir = new URL('../assets/icons/', import.meta.url),
} = {}) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const outDirPath = typeof outDir === 'string' ? outDir : fileURLToPath(outDir);
  await mkdir(outDirPath, { recursive: true });
  const specs = collectIconSpecs(catalog.heroes ?? []);
  const downloaded = [];
  const skipped = [];
  for (const { wikiFile, assetFile } of specs) {
    const dest = `${outDirPath.replace(/[/\\]$/, '')}/${assetFile}`;
    if (await exists(dest)) { skipped.push(assetFile); continue; }
    const url = `${FILEPATH}/${wikiFile}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`icon fetch HTTP ${res.status} for ${wikiFile}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    downloaded.push(assetFile);
    await sleepImpl(pauseMs);
  }
  return { downloaded, skipped };
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  run().then(
    (r) => console.log(`[fetch-icons] ${r.downloaded.length} téléchargées, ${r.skipped.length} déjà présentes`),
    (err) => { console.error(err); process.exitCode = 1; },
  );
}
```

Run: `node --test scripts/fetch-icons.test.mjs` → PASS. Puis `node --test` (suite complète, `heroes-catalog` toujours en échec attendu vs ancien `data/heroes.json`).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/wiki-assets.mjs scripts/lib/wiki-assets.test.mjs scripts/fetch-icons.mjs scripts/fetch-icons.test.mjs
git commit -m "$(printf 'feat: add wiki icon fetcher for class/move icons\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: [orchestrateur] régénérer le catalogue + rapatrier les icônes

**Files:**
- Regenerated: `g:\GITHUB\feh-comp\data\heroes.json`
- Created: `g:\GITHUB\feh-comp\assets\icons\*.webp`

**Interfaces:**
- Consumes: `run()` de `fetch-heroes.mjs` (Task 2) et `fetch-icons.mjs` (Task 3), réseau réel.
- Produces: `data/heroes.json` avec les 23 clés + `assets/icons/` peuplé et commité.

- [ ] **Step 1: Régénérer le catalogue**

Run: `node scripts/fetch-heroes.mjs`  (≈ 5 min ; back-off intégré, relancer en cas de `ratelimited ... after 5 retries`).
Expected: `[fetch-heroes] <N> héros écrits dans data/heroes.json` avec `N` ≈ 1410.

- [ ] **Step 2: Vérifier la nouvelle forme**

Run:
```bash
node -e "const c=require('./data/heroes.json'); const h=c.heroes[0]; console.log(Object.keys(h).join(',')); const g={}; for(const x of c.heroes) g[x.gender]=(g[x.gender]||0)+1; console.log(g); console.log('multi-origin:', c.heroes.filter(x=>x.origins.length>1).length); console.log('image ex:', h.image);"
```
Expected : 23 clés dans l'ordre du bloc Interfaces de Task 2 ; `gender` ∈ `{female,male,multi,other}` ; quelques `origins.length > 1` ; `image` en `..._Face_FC.webp`.

- [ ] **Step 3: Rapatrier les icônes**

Run: `node scripts/fetch-icons.mjs`
Expected: `[fetch-icons] ~19 téléchargées, 0 déjà présentes` (puis `~23 déjà présentes` si relancé).
Run: `ls assets/icons/` → `move-*.webp` (4) + `class-*-*.webp` (~19).

- [ ] **Step 4: Suite complète verte**

Run: `node --test`
Expected: **tout vert**, y compris `scripts/heroes-catalog.test.mjs` (9 + 3 nouveaux tests).

- [ ] **Step 5: Commit**

```bash
git add data/heroes.json assets/icons
git commit -m "$(printf 'chore: regenerate catalog (23-key shape) and vendor class/move icons\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: `js/i18n.mjs`

**Files:**
- Create: `g:\GITHUB\feh-comp\js\i18n.mjs`
- Test: `g:\GITHUB\feh-comp\js\i18n.test.mjs`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `resolveLang(stored: string|null, navigatorLanguages?: string[], supported?: string[]) -> string`
  - `makeTranslator(dicts: Record<string, Record<string,string>>, lang: string, fallbackLang='en') -> (key: string, params?: Record<string,string|number>) => string`

- [ ] **Step 1: Test (RED)**

`js/i18n.test.mjs` :

```js
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
```

Run: `node --test js/i18n.test.mjs` → FAIL.

- [ ] **Step 2: Implémentation**

`js/i18n.mjs` :

```js
// js/i18n.mjs — résolution de langue + fabrique de traducteur. Pur, sans DOM.

export function resolveLang(stored, navigatorLanguages = [], supported = ['en', 'fr']) {
  if (supported.includes(stored)) return stored;
  for (const l of navigatorLanguages) {
    const base = String(l).toLowerCase().split('-')[0];
    if (supported.includes(base)) return base;
  }
  return supported[0];
}

export function makeTranslator(dicts, lang, fallbackLang = 'en') {
  const primary = dicts[lang] ?? {};
  const fallback = dicts[fallbackLang] ?? {};
  return function t(key, params) {
    let s = primary[key] ?? fallback[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };
}
```

Run: `node --test js/i18n.test.mjs` → PASS.

- [ ] **Step 3: Commit**

```bash
git add js/i18n.mjs js/i18n.test.mjs
git commit -m "$(printf 'feat: add i18n language resolver and translator\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 6: `i18n/en.json` + `i18n/fr.json`

**Files:**
- Create: `g:\GITHUB\feh-comp\i18n\en.json`
- Create: `g:\GITHUB\feh-comp\i18n\fr.json`
- Test: `g:\GITHUB\feh-comp\i18n\i18n-keys.test.mjs`

**Interfaces:**
- Consumes: rien.
- Produces: deux dictionnaires plats `Record<string,string>` avec **le même jeu de clés**.

- [ ] **Step 1: Test de parité des clés (RED)**

`i18n/i18n-keys.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const en = JSON.parse(await readFile(new URL('./en.json', import.meta.url), 'utf8'));
const fr = JSON.parse(await readFile(new URL('./fr.json', import.meta.url), 'utf8'));

const REQUIRED = [
  'app.title', 'app.tagline', 'lang.en', 'lang.fr',
  'search.placeholder', 'filter.any', 'filter.color', 'filter.weapon', 'filter.move',
  'filter.category', 'filter.origin', 'filter.gender', 'filter.blessing', 'filter.poolRarity',
  'sort.label', 'sort.releaseDesc', 'sort.nameAsc', 'group.byPerson', 'group.alts',
  'grid.count', 'grid.empty', 'detail.close', 'detail.artist', 'detail.actorEn', 'detail.actorJp',
  'detail.origin', 'detail.blessing', 'detail.poolRarity', 'detail.properties', 'detail.released',
  'color.r', 'color.b', 'color.v', 'color.g',
  'weapon.sword', 'weapon.lance', 'weapon.axe', 'weapon.bow', 'weapon.dagger',
  'weapon.tome', 'weapon.staff', 'weapon.breath', 'weapon.beast',
  'move.infantry', 'move.cavalry', 'move.flying', 'move.armored',
  'category.mythic', 'category.legendary', 'category.emblem', 'category.rearmed', 'category.attuned',
  'category.ascended', 'category.duo', 'category.harmonized', 'category.brave', 'category.ghb',
  'category.tempest', 'category.special', 'category.standard',
  'blessing.fire', 'blessing.water', 'blessing.wind', 'blessing.earth',
  'blessing.light', 'blessing.dark', 'blessing.astra', 'blessing.anima',
  'gender.female', 'gender.male', 'gender.multi', 'gender.other',
  'poolRarity.3', 'poolRarity.4', 'poolRarity.5', 'poolRarity.na',
];

test('en.json contient toutes les clés requises', () => {
  const missing = REQUIRED.filter((k) => !(k in en));
  assert.deepEqual(missing, []);
});
test('fr.json a exactement les mêmes clés que en.json', () => {
  const ek = Object.keys(en).sort();
  const fk = Object.keys(fr).sort();
  assert.deepEqual(fk, ek);
});
test('aucune valeur vide', () => {
  for (const [k, v] of Object.entries(en)) assert.ok(v, `en.${k} vide`);
  for (const [k, v] of Object.entries(fr)) assert.ok(v, `fr.${k} vide`);
});
test('grid.count et group.alts gardent le paramètre {n}', () => {
  for (const d of [en, fr]) {
    assert.match(d['grid.count'], /\{n\}/);
    assert.match(d['group.alts'], /\{n\}/);
  }
});
```

Run: `node --test i18n/i18n-keys.test.mjs` → FAIL (fichiers manquants).

- [ ] **Step 2: `i18n/en.json`**

```json
{
  "app.title": "FEH Collection Tracker",
  "app.tagline": "Fire Emblem Heroes catalogue",
  "lang.en": "EN",
  "lang.fr": "FR",
  "search.placeholder": "Search name, epithet, artist, voice…",
  "filter.any": "Any",
  "filter.color": "Colour",
  "filter.weapon": "Weapon",
  "filter.move": "Movement",
  "filter.category": "Category",
  "filter.origin": "Game",
  "filter.gender": "Gender",
  "filter.blessing": "Blessing",
  "filter.poolRarity": "Pool rarity",
  "sort.label": "Sort",
  "sort.releaseDesc": "Newest first",
  "sort.nameAsc": "Name A–Z",
  "group.byPerson": "Group by character",
  "group.alts": "{n} alts",
  "grid.count": "{n} heroes",
  "grid.empty": "No hero matches these filters.",
  "detail.close": "Close",
  "detail.artist": "Artist",
  "detail.actorEn": "Voice (EN)",
  "detail.actorJp": "Voice (JP)",
  "detail.origin": "Game",
  "detail.blessing": "Blessing",
  "detail.poolRarity": "Summon pool",
  "detail.properties": "Tags",
  "detail.released": "Released",
  "color.r": "Red",
  "color.b": "Blue",
  "color.v": "Green",
  "color.g": "Colourless",
  "weapon.sword": "Sword",
  "weapon.lance": "Lance",
  "weapon.axe": "Axe",
  "weapon.bow": "Bow",
  "weapon.dagger": "Dagger",
  "weapon.tome": "Tome",
  "weapon.staff": "Staff",
  "weapon.breath": "Breath",
  "weapon.beast": "Beast",
  "move.infantry": "Infantry",
  "move.cavalry": "Cavalry",
  "move.flying": "Flying",
  "move.armored": "Armoured",
  "category.mythic": "Mythic",
  "category.legendary": "Legendary",
  "category.emblem": "Emblem",
  "category.rearmed": "Rearmed",
  "category.attuned": "Attuned",
  "category.ascended": "Ascended",
  "category.duo": "Duo",
  "category.harmonized": "Harmonized",
  "category.brave": "Brave",
  "category.ghb": "Grand Hero Battle",
  "category.tempest": "Tempest Trials",
  "category.special": "Special",
  "category.standard": "Standard",
  "blessing.fire": "Fire",
  "blessing.water": "Water",
  "blessing.wind": "Wind",
  "blessing.earth": "Earth",
  "blessing.light": "Light",
  "blessing.dark": "Dark",
  "blessing.astra": "Astra",
  "blessing.anima": "Anima",
  "gender.female": "Female",
  "gender.male": "Male",
  "gender.multi": "Pair",
  "gender.other": "Other",
  "poolRarity.3": "3–4★",
  "poolRarity.4": "4–5★",
  "poolRarity.5": "5★ only",
  "poolRarity.na": "Not in pool"
}
```

- [ ] **Step 3: `i18n/fr.json`**

```json
{
  "app.title": "FEH Collection Tracker",
  "app.tagline": "Catalogue Fire Emblem Heroes",
  "lang.en": "EN",
  "lang.fr": "FR",
  "search.placeholder": "Nom, épithète, illustrateur, voix…",
  "filter.any": "Tous",
  "filter.color": "Couleur",
  "filter.weapon": "Arme",
  "filter.move": "Déplacement",
  "filter.category": "Catégorie",
  "filter.origin": "Jeu",
  "filter.gender": "Genre",
  "filter.blessing": "Bénédiction",
  "filter.poolRarity": "Rareté du pool",
  "sort.label": "Tri",
  "sort.releaseDesc": "Plus récents",
  "sort.nameAsc": "Nom A–Z",
  "group.byPerson": "Grouper par personnage",
  "group.alts": "{n} alts",
  "grid.count": "{n} héros",
  "grid.empty": "Aucun héros ne correspond à ces filtres.",
  "detail.close": "Fermer",
  "detail.artist": "Illustrateur",
  "detail.actorEn": "Voix (EN)",
  "detail.actorJp": "Voix (JP)",
  "detail.origin": "Jeu",
  "detail.blessing": "Bénédiction",
  "detail.poolRarity": "Pool d'invocation",
  "detail.properties": "Tags",
  "detail.released": "Sortie",
  "color.r": "Rouge",
  "color.b": "Bleu",
  "color.v": "Vert",
  "color.g": "Incolore",
  "weapon.sword": "Épée",
  "weapon.lance": "Lance",
  "weapon.axe": "Hache",
  "weapon.bow": "Arc",
  "weapon.dagger": "Dague",
  "weapon.tome": "Magie",
  "weapon.staff": "Bâton",
  "weapon.breath": "Souffle",
  "weapon.beast": "Bête",
  "move.infantry": "Fantassin",
  "move.cavalry": "Cavalier",
  "move.flying": "Volant",
  "move.armored": "Armure",
  "category.mythic": "Mythique",
  "category.legendary": "Légendaire",
  "category.emblem": "Emblème",
  "category.rearmed": "Réarmé",
  "category.attuned": "Attuned",
  "category.ascended": "Ascendant",
  "category.duo": "Duo",
  "category.harmonized": "Harmonisé",
  "category.brave": "Brave",
  "category.ghb": "Bataille de héros",
  "category.tempest": "Épreuves du chaos",
  "category.special": "Spécial",
  "category.standard": "Standard",
  "blessing.fire": "Feu",
  "blessing.water": "Eau",
  "blessing.wind": "Vent",
  "blessing.earth": "Terre",
  "blessing.light": "Lumière",
  "blessing.dark": "Ténèbres",
  "blessing.astra": "Astral",
  "blessing.anima": "Anima",
  "gender.female": "Féminin",
  "gender.male": "Masculin",
  "gender.multi": "Duo",
  "gender.other": "Autre",
  "poolRarity.3": "3–4★",
  "poolRarity.4": "4–5★",
  "poolRarity.5": "5★ seul.",
  "poolRarity.na": "Hors pool"
}
```

- [ ] **Step 4: GREEN**

Run: `node --test i18n/i18n-keys.test.mjs` → PASS. Puis `node --test`.

- [ ] **Step 5: Commit**

```bash
git add i18n/en.json i18n/fr.json i18n/i18n-keys.test.mjs
git commit -m "$(printf 'feat: add EN/FR interface dictionaries\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 7: `js/hero-media.mjs`

**Files:**
- Create: `g:\GITHUB\feh-comp\js\hero-media.mjs`
- Test: `g:\GITHUB\feh-comp\js\hero-media.test.mjs`

**Interfaces:**
- Consumes: rien (opère sur un objet `Hero` de `heroes.json`).
- Produces:
  - `colorHex(color: string) -> string` (hex ; `g` par défaut si inconnu)
  - `classIconPath(hero) -> string|null` — `assets/icons/class-<color>-<weapon>.webp`, `null` si `color`/`weapon` absent
  - `moveIconPath(hero) -> string|null` — `assets/icons/move-<move>.webp`, `null` si `move` absent
  - `imageCandidates(hero) -> string[]` — `[hero.image, hero.imageFull]` sans les valeurs falsy

- [ ] **Step 1: Test (RED)**

`js/hero-media.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorHex, classIconPath, moveIconPath, imageCandidates } from './hero-media.mjs';

test('colorHex : 4 couleurs + repli', () => {
  assert.match(colorHex('r'), /^#[0-9a-f]{6}$/i);
  assert.equal(colorHex('zzz'), colorHex('g'));
});
test('classIconPath', () => {
  assert.equal(classIconPath({ color: 'r', weapon: 'sword' }), 'assets/icons/class-r-sword.webp');
  assert.equal(classIconPath({ color: null, weapon: 'sword' }), null);
});
test('moveIconPath', () => {
  assert.equal(moveIconPath({ move: 'flying' }), 'assets/icons/move-flying.webp');
  assert.equal(moveIconPath({ move: null }), null);
});
test('imageCandidates : ordre image puis imageFull, sans falsy', () => {
  assert.deepEqual(imageCandidates({ image: 'a', imageFull: 'b' }), ['a', 'b']);
  assert.deepEqual(imageCandidates({ image: null, imageFull: 'b' }), ['b']);
  assert.deepEqual(imageCandidates({ image: null, imageFull: null }), []);
});
```

Run: `node --test js/hero-media.test.mjs` → FAIL.

- [ ] **Step 2: Implémentation**

`js/hero-media.mjs` :

```js
// js/hero-media.mjs — chemins d'assets et couleurs pour les cartes. Pur, sans DOM.

const COLOR_HEX = { r: '#d34b4b', b: '#3b6fd4', v: '#3fae52', g: '#8a8f98' };

export function colorHex(color) {
  return COLOR_HEX[color] ?? COLOR_HEX.g;
}

export function classIconPath(hero) {
  if (!hero || !hero.color || !hero.weapon) return null;
  return `assets/icons/class-${hero.color}-${hero.weapon}.webp`;
}

export function moveIconPath(hero) {
  if (!hero || !hero.move) return null;
  return `assets/icons/move-${hero.move}.webp`;
}

export function imageCandidates(hero) {
  return [hero?.image, hero?.imageFull].filter(Boolean);
}
```

Run: `node --test js/hero-media.test.mjs` → PASS.

- [ ] **Step 3: Commit**

```bash
git add js/hero-media.mjs js/hero-media.test.mjs
git commit -m "$(printf 'feat: add hero media path helpers\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 8: `js/catalog-view.mjs`

**Files:**
- Create: `g:\GITHUB\feh-comp\js\catalog-view.mjs`
- Test: `g:\GITHUB\feh-comp\js\catalog-view.test.mjs`

**Interfaces:**
- Consumes: rien (opère sur un `Hero[]` de `heroes.json`).
- Produces:
  - `buildFacetOptions(heroes) -> { color, weapon, move, category, origin, gender, blessing, poolRarity }` — chaque valeur un `string[]` trié des valeurs distinctes présentes (`origin` vient de `origins` aplati ; `poolRarity` = `['3','4','5','na']` restreint aux présents, `na` si un héros a `poolRarity === null`).
  - `applyFilters(heroes, filters, query) -> Hero[]` — `filters` : `{ color, weapon, move, category, origin, gender, blessing, poolRarity }` chacun `string|null` (null = pas de filtre) ; `poolRarity` filtre sur `'na'` ↔ `poolRarity === null` sinon `String(poolRarity) === filters.poolRarity` ; `origin` matche si `hero.origins.includes(filters.origin)`. `query` : chaîne ; découpée en termes (espaces) ; un héros passe si **chaque** terme (insensible casse) est sous-chaîne de `name|title|artist|actorEn joined|actorJp joined`.
  - `sortHeroes(heroes, key) -> Hero[]` — `key` : `'release-desc'` (défaut ; `releaseDate` desc puis `name` asc) | `'name-asc'` (`name` asc puis `releaseDate` desc). Ne mute pas l'entrée.
  - `groupByPerson(heroes) -> Array<{ person, heroes, colors }>` — `heroes` triés par `sortHeroes` défaut ; `colors` = couleurs distinctes du groupe dans l'ordre `r,b,v,g` ; groupes triés par `releaseDate` max desc ; héros sans `person` → groupe solo clé = `id`.

- [ ] **Step 1: Test (RED)**

`js/catalog-view.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacetOptions, applyFilters, sortHeroes, groupByPerson } from './catalog-view.mjs';

const H = (o) => ({
  id: o.id ?? o.name, name: o.name, title: o.title ?? '', person: o.person ?? o.name,
  color: o.color ?? 'r', weapon: o.weapon ?? 'sword', move: o.move ?? 'infantry',
  gender: o.gender ?? 'male', origin: (o.origins ?? ['G1']).join(','), origins: o.origins ?? ['G1'],
  category: o.category ?? 'standard', blessing: o.blessing ?? null,
  poolRarity: o.poolRarity ?? null, artist: o.artist ?? '', actorEn: o.actorEn ?? [], actorJp: o.actorJp ?? [],
  releaseDate: o.releaseDate ?? '2020-01-01',
});

const DATA = [
  H({ name: 'Alpha', color: 'r', weapon: 'sword', category: 'legendary', blessing: 'fire', poolRarity: null, releaseDate: '2026-01-01', origins: ['Awakening', 'Engage'], artist: 'Kita' }),
  H({ name: 'Bravo', color: 'b', weapon: 'lance', category: 'standard', poolRarity: 5, releaseDate: '2024-06-01', origins: ['Fates'] }),
  H({ name: 'Charlie', color: 'r', weapon: 'bow', category: 'standard', poolRarity: 3, releaseDate: '2024-06-01', origins: ['Awakening'], person: 'Charlie', actorEn: ['Jane Doe'] }),
  H({ name: 'Charlie', title: 'Alt', color: 'g', weapon: 'staff', person: 'Charlie', releaseDate: '2025-03-03', origins: ['Awakening'] }),
];

test('buildFacetOptions liste les valeurs présentes triées', () => {
  const f = buildFacetOptions(DATA);
  assert.deepEqual(f.color, ['b', 'g', 'r']);
  assert.deepEqual(f.origin, ['Awakening', 'Engage', 'Fates']);
  assert.deepEqual(f.category.sort(), ['legendary', 'standard']);
  assert.deepEqual(f.poolRarity, ['3', '5', 'na']);
});

test('applyFilters : couleur', () => {
  assert.deepEqual(applyFilters(DATA, { color: 'r' }, '').map((h) => h.name).sort(), ['Alpha', 'Charlie']);
});
test('applyFilters : origin matche via origins[]', () => {
  assert.deepEqual(applyFilters(DATA, { origin: 'Engage' }, '').map((h) => h.name), ['Alpha']);
});
test('applyFilters : poolRarity "na" = poolRarity null', () => {
  // Alpha (null) + Charlie/"Alt" (null) ; Bravo=5, Charlie=3 exclus
  const r = applyFilters(DATA, { poolRarity: 'na' }, '').map((h) => h.name).sort();
  assert.deepEqual(r, ['Alpha', 'Charlie']);
});
test('applyFilters : recherche multi-termes sur name/title/artist/actor', () => {
  assert.deepEqual(applyFilters(DATA, {}, 'char alt').map((h) => h.title), ['Alt']);
  assert.deepEqual(applyFilters(DATA, {}, 'kita').map((h) => h.name), ['Alpha']);
  assert.deepEqual(applyFilters(DATA, {}, 'jane').map((h) => h.name), ['Charlie']);
});

test('sortHeroes : release-desc par défaut, ne mute pas', () => {
  const input = [...DATA];
  const out = sortHeroes(input, 'release-desc');
  assert.deepEqual(out.map((h) => h.name), ['Alpha', 'Charlie', 'Bravo', 'Charlie']);
  assert.deepEqual(input.map((h) => h.name), DATA.map((h) => h.name));
});
test('sortHeroes : name-asc', () => {
  const out = sortHeroes(DATA, 'name-asc');
  assert.deepEqual(out.map((h) => `${h.name}${h.title}`), ['Alpha', 'Bravo', 'CharlieAlt', 'Charlie']);
});

test('groupByPerson : regroupe, trie groupes par date max desc, couleurs ordonnées', () => {
  const groups = groupByPerson(DATA);
  assert.deepEqual(groups.map((g) => g.person), ['Alpha', 'Charlie', 'Bravo']);
  const charlie = groups.find((g) => g.person === 'Charlie');
  assert.equal(charlie.heroes.length, 2);
  assert.deepEqual(charlie.colors, ['r', 'g']);
});
```

Run: `node --test js/catalog-view.test.mjs` → FAIL.

- [ ] **Step 2: Implémentation**

`js/catalog-view.mjs` :

```js
// js/catalog-view.mjs — filtrage / tri / groupement du catalogue. Pur, sans DOM.

const COLOR_ORDER = ['r', 'b', 'v', 'g'];

function uniqSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

export function buildFacetOptions(heroes) {
  const pool = uniqSorted(
    heroes.map((h) => (h.poolRarity == null ? 'na' : String(h.poolRarity))),
  );
  return {
    color: uniqSorted(heroes.map((h) => h.color).filter(Boolean)),
    weapon: uniqSorted(heroes.map((h) => h.weapon).filter(Boolean)),
    move: uniqSorted(heroes.map((h) => h.move).filter(Boolean)),
    category: uniqSorted(heroes.map((h) => h.category).filter(Boolean)),
    origin: uniqSorted(heroes.flatMap((h) => h.origins ?? [])),
    gender: uniqSorted(heroes.map((h) => h.gender).filter(Boolean)),
    blessing: uniqSorted(heroes.map((h) => h.blessing).filter(Boolean)),
    poolRarity: pool,
  };
}

const SCALAR_FACETS = ['color', 'weapon', 'move', 'category', 'gender', 'blessing'];

export function applyFilters(heroes, filters = {}, query = '') {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return heroes.filter((h) => {
    for (const f of SCALAR_FACETS) {
      if (filters[f] && h[f] !== filters[f]) return false;
    }
    if (filters.origin && !(h.origins ?? []).includes(filters.origin)) return false;
    if (filters.poolRarity) {
      const want = filters.poolRarity;
      const have = h.poolRarity == null ? 'na' : String(h.poolRarity);
      if (have !== want) return false;
    }
    if (terms.length) {
      const hay = [
        h.name, h.title, h.artist,
        (h.actorEn ?? []).join(' '), (h.actorJp ?? []).join(' '),
      ].join(' ').toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

function cmpReleaseDesc(a, b) {
  const da = a.releaseDate ?? '';
  const db = b.releaseDate ?? '';
  if (da !== db) return da < db ? 1 : -1;
  return String(a.name).localeCompare(String(b.name));
}

export function sortHeroes(heroes, key = 'release-desc') {
  const out = [...heroes];
  if (key === 'name-asc') {
    out.sort((a, b) => {
      const n = String(a.name).localeCompare(String(b.name));
      return n !== 0 ? n : cmpReleaseDesc(a, b);
    });
  } else {
    out.sort(cmpReleaseDesc);
  }
  return out;
}

export function groupByPerson(heroes) {
  const groups = new Map();
  for (const h of heroes) {
    const key = h.person || h.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }
  const list = [...groups.entries()].map(([person, hs]) => ({
    person,
    heroes: sortHeroes(hs, 'release-desc'),
    colors: COLOR_ORDER.filter((c) => hs.some((h) => h.color === c)),
    _max: hs.reduce((m, h) => (h.releaseDate > m ? h.releaseDate : m), ''),
  }));
  list.sort((a, b) => (a._max < b._max ? 1 : a._max > b._max ? -1 : a.person.localeCompare(b.person)));
  return list.map(({ _max, ...g }) => g);
}
```

Run: `node --test js/catalog-view.test.mjs` → PASS. Puis `node --test`.

- [ ] **Step 3: Commit**

```bash
git add js/catalog-view.mjs js/catalog-view.test.mjs
git commit -m "$(printf 'feat: add catalog filter/sort/group logic\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 9: `index.html` + `styles.css` + `scripts/serve.mjs`

**Files:**
- Modify (replace): `g:\GITHUB\feh-comp\index.html`
- Create: `g:\GITHUB\feh-comp\styles.css`
- Create: `g:\GITHUB\feh-comp\scripts\serve.mjs`

**Interfaces:**
- Consumes: rien encore (Task 10 câble `app.js`).
- Produces: coquille DOM avec ces `id`/`data-*` que `app.js` (Task 10) attend :
  `#lang-toggle`, `#search`, `#filters` (conteneur des `<select>`), `#sort`, `#group-toggle` (checkbox), `#grid`, `#grid-count`, `#load-more-sentinel`, `#detail` (`<aside hidden>`), `#detail-body`, `#detail-close`.
  Chaque `<select>` de filtre : `<select data-facet="color">` … pour `color,weapon,move,category,origin,gender,blessing,poolRarity`.

- [ ] **Step 1: `index.html` (remplacer intégralement)**

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FEH Collection Tracker</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <strong data-i18n="app.title">FEH Collection Tracker</strong>
      <span class="tagline" data-i18n="app.tagline">Catalogue Fire Emblem Heroes</span>
    </div>
    <button id="lang-toggle" type="button" class="lang" aria-label="language">EN</button>
  </header>

  <section class="controls">
    <input id="search" type="search" autocomplete="off" data-i18n-attr="placeholder:search.placeholder" placeholder="Rechercher…">
    <div id="filters" class="filters"></div>
    <label class="sort">
      <span data-i18n="sort.label">Tri</span>
      <select id="sort">
        <option value="release-desc" data-i18n="sort.releaseDesc">Plus récents</option>
        <option value="name-asc" data-i18n="sort.nameAsc">Nom A–Z</option>
      </select>
    </label>
    <label class="group">
      <input id="group-toggle" type="checkbox">
      <span data-i18n="group.byPerson">Grouper par personnage</span>
    </label>
  </section>

  <p id="grid-count" class="grid-count" aria-live="polite"></p>
  <main id="grid" class="grid"></main>
  <div id="load-more-sentinel" aria-hidden="true"></div>

  <aside id="detail" class="detail" hidden>
    <button id="detail-close" type="button" class="detail-close" data-i18n="detail.close">Fermer</button>
    <div id="detail-body"></div>
  </aside>

  <footer class="foot">
    <a href="https://github.com/DrZeroes/feh-heroes-tracker">github.com/DrZeroes/feh-heroes-tracker</a>
  </footer>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `styles.css`**

```css
:root {
  color-scheme: light dark;
  --bg: #f6f6f8; --fg: #1b1b1f; --muted: #5b5b66; --card: #fff;
  --border: #e2e2e8; --accent: #3b6fd4; --shadow: 0 1px 3px rgba(0,0,0,.08);
  --owned: #3fae52;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #151519; --fg: #ececf0; --muted: #9a9aa6; --card: #1f1f26;
    --border: #32323c; --accent: #6f9bff; --shadow: 0 1px 3px rgba(0,0,0,.4);
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }

.topbar { display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding: .75rem 1rem; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--bg); z-index: 5; }
.brand strong { display: block; font-size: 1rem; }
.brand .tagline { font-size: .8rem; color: var(--muted); }
.lang { border: 1px solid var(--border); background: var(--card); color: var(--fg);
  border-radius: 8px; padding: .35rem .6rem; cursor: pointer; font-weight: 600; }

.controls { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center;
  padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
.controls input#search { flex: 1 1 14rem; min-width: 10rem; padding: .45rem .6rem;
  border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--fg); }
.filters { display: flex; flex-wrap: wrap; gap: .5rem; }
.filters select, .sort select { padding: .4rem .5rem; border: 1px solid var(--border);
  border-radius: 8px; background: var(--card); color: var(--fg); }
.sort, .group { display: flex; align-items: center; gap: .35rem; font-size: .85rem; color: var(--muted); }

.grid-count { margin: .5rem 1rem 0; color: var(--muted); font-size: .85rem; }
.grid { display: grid; gap: .75rem; padding: .75rem 1rem 3rem;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); }

.card { position: relative; background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: .6rem; text-align: center; cursor: pointer; box-shadow: var(--shadow); }
.card:hover { border-color: var(--accent); }
.card .portrait { width: 100%; aspect-ratio: 1/1; object-fit: cover; border-radius: 10px;
  background: var(--bg); }
.card .fallback { width: 100%; aspect-ratio: 1/1; border-radius: 10px; display: grid;
  place-items: center; font-weight: 700; color: #fff; }
.card .name { display: block; margin-top: .4rem; font-weight: 600; font-size: .85rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .epithet { display: block; font-size: .72rem; color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .icons { display: flex; justify-content: center; gap: .3rem; margin-top: .3rem; }
.card .icons img { width: 18px; height: 18px; }
.card .pip { position: absolute; top: .5rem; left: .5rem; width: .7rem; height: .7rem;
  border-radius: 50%; border: 2px solid var(--card); }
.card .badge { position: absolute; top: .4rem; right: .4rem; font-size: .62rem;
  background: var(--accent); color: #fff; border-radius: 6px; padding: .05rem .3rem; }

.grid.grouped { grid-template-columns: 1fr; }
.group-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: .6rem .8rem; }
.group-card > summary { cursor: pointer; font-weight: 600; display: flex; gap: .5rem; align-items: center; }
.group-card .pips { display: inline-flex; gap: .2rem; }
.group-card .pips i { width: .6rem; height: .6rem; border-radius: 50%; display: inline-block; }
.group-card .sub-grid { display: grid; gap: .6rem; margin-top: .6rem;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); }

.detail { position: fixed; inset: auto 0 0 0; max-height: 85vh; overflow: auto;
  background: var(--card); border-top: 1px solid var(--border); border-radius: 16px 16px 0 0;
  padding: 1rem 1.1rem 2rem; box-shadow: 0 -4px 20px rgba(0,0,0,.25); z-index: 20; }
@media (min-width: 46rem) {
  .detail { inset: 0 0 0 auto; width: 26rem; max-height: 100vh; border-radius: 0;
    border-left: 1px solid var(--border); border-top: none; }
}
.detail-close { float: right; border: 1px solid var(--border); background: var(--bg);
  color: var(--fg); border-radius: 8px; padding: .3rem .6rem; cursor: pointer; }
.detail h2 { margin: .2rem 0 0; }
.detail .epithet { color: var(--muted); margin: 0 0 .8rem; }
.detail img.big { width: 100%; border-radius: 12px; background: var(--bg); }
.detail dl { display: grid; grid-template-columns: auto 1fr; gap: .3rem .8rem; margin: .8rem 0 0; }
.detail dt { color: var(--muted); }

.foot { padding: 1.5rem 1rem 3rem; text-align: center; font-size: .85rem; color: var(--muted); }
a { color: var(--accent); }
[hidden] { display: none !important; }
img { max-width: 100%; }
```

- [ ] **Step 3: `scripts/serve.mjs` (serveur statique zéro-dépendance)**

```js
// scripts/serve.mjs — serveur statique local. Usage: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2] || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const full = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(full);
    res.writeHead(200, { 'content-type': TYPES[extname(full)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  }
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
```

- [ ] **Step 4: Vérification structurelle**

```bash
node scripts/serve.mjs 8137 &
SERVER=$!
sleep 1
curl -s http://localhost:8137/ | grep -c 'id="grid"'            # attendu: 1
curl -s http://localhost:8137/ | grep -c 'src="app.js"'         # attendu: 1
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8137/styles.css   # attendu: 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8137/data/heroes.json  # attendu: 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8137/i18n/fr.json      # attendu: 200
kill $SERVER
```
Expected: `1`, `1`, `200`, `200`, `200`.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css scripts/serve.mjs
git commit -m "$(printf 'feat: catalogue shell (index.html, styles, static server)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 10: `app.js` — câblage

**Files:**
- Create: `g:\GITHUB\feh-comp\app.js`

**Interfaces:**
- Consumes: `js/i18n.mjs`, `js/hero-media.mjs`, `js/catalog-view.mjs` ; `data/heroes.json`, `i18n/en.json`, `i18n/fr.json` ; les `id`/`data-*` de Task 9.
- Produces: l'app fonctionnelle. Aucun export.

- [ ] **Step 1: Écrire `app.js`**

```js
// app.js — câblage DOM du catalogue (lecture seule). Module ES, chemins relatifs.
import { resolveLang, makeTranslator } from './js/i18n.mjs';
import { colorHex, classIconPath, moveIconPath, imageCandidates } from './js/hero-media.mjs';
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
      opt.textContent = labelFor(f, v);
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
  ep.textContent = hero.title;
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
  ep.textContent = hero.title;
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
  row('detail.origin', (hero.origins || []).join(' · '));
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

function setLang(lang) {
  state.lang = lang;
  state.t = makeTranslator(state.dicts, lang);
  try { localStorage.setItem(LS_LANG, lang); } catch { /* ignore */ }
  applyStaticI18n();
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
  $('#sort').value = state.sort;
  $('#group-toggle').checked = state.group;

  applyStaticI18n();
  buildFilterControls();
  recompute();

  $('#lang-toggle').addEventListener('click', () => setLang(state.lang === 'en' ? 'fr' : 'en'));
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; writePrefs(); recompute(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; writePrefs(); recompute(); });
  $('#group-toggle').addEventListener('change', (e) => { state.group = e.target.checked; writePrefs(); recompute(); });
  $('#detail-close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

  const sentinel = document.getElementById('load-more-sentinel');
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.group && state.shown < state.view.length) renderGridPage();
  }, { rootMargin: '600px' }).observe(sentinel);
}

main();
```

- [ ] **Step 2: Vérification structurelle + servie**

```bash
node --test    # tous les modules js/ + scripts/ verts
node scripts/serve.mjs 8138 &
SERVER=$!
sleep 1
curl -s http://localhost:8138/app.js | grep -c "import { resolveLang"    # 1
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8138/js/catalog-view.mjs  # 200
kill $SERVER
```
Expected: suite verte ; `1` ; `200`.

- [ ] **Step 3: Vérification visuelle (manuelle, notée dans le rapport)**

Servir (`node scripts/serve.mjs 8138`), ouvrir `http://localhost:8138/` dans un navigateur, vérifier :
1. la grille se peuple (cartes avec portraits ou tuiles de repli) ;
2. un filtre (ex. Couleur = Rouge) réduit la grille et le compteur ;
3. la recherche « marth » filtre ;
4. le tri « Nom A–Z » réordonne ;
5. « Grouper par personnage » bascule en groupes dépliables ;
6. clic sur une carte → panneau détail avec grand portrait + infos ; `Échap` / bouton ferme ;
7. bascule EN/FR : libellés, options de filtres et compteur changent de langue ;
8. recharger la page conserve langue + filtres + tri (localStorage) ;
9. scroll → chargement des lots suivants (mode non groupé).

Consigner le résultat (OK / écarts) dans le rapport. Joindre une capture si possible.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "$(printf 'feat: wire the read-only catalogue app\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 11: [orchestrateur] déploiement GitHub Pages

**Files:** aucun (push + vérification).

- [ ] **Step 1: Suite verte + push**

```bash
node --test
git push
```

- [ ] **Step 2: Attendre le déploiement Pages**

Run: `gh run list --workflow "pages build and deployment" --limit 1` jusqu'à `completed / success` (ou vérifier `gh api repos/DrZeroes/feh-heroes-tracker/pages --jq .status` → `built`).

- [ ] **Step 3: Vérifier le site en ligne**

```bash
curl -s https://drzeroes.github.io/feh-heroes-tracker/ | grep -c 'id="grid"'        # 1
curl -s -o /dev/null -w '%{http_code}\n' https://drzeroes.github.io/feh-heroes-tracker/data/heroes.json   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://drzeroes.github.io/feh-heroes-tracker/assets/icons/move-infantry.webp  # 200
```
Ouvrir l'URL, refaire le tour de la checklist visuelle de Task 10 Step 3 sur le site déployé. Screenshot pour l'utilisateur.

---

## Self-Review

**1. Couverture spec** (spec = `feh-collection-tracker-design.md`, portée Plan B = §6.1 catalogue + §5.4 i18n + le volet images §3 rév c/d) :

| Exigence | Task |
|---|---|
| `image` / `imageFull` dérivés du WikiName, hotlink, overridables (§3) | 1, 2, 4 |
| `gender` normalisé, `origins` scindé (§3 rév d) | 1, 2 |
| Icônes classe/déplacement rapatriées dans `assets/icons/` (§3, §4) | 3, 4 |
| Grille de cartes : portrait + repli, pastille couleur, icône arme, icône déplacement, badge catégorie/bénédiction/rareté (§6.1) | 7, 9, 10 |
| Filtres : couleur, arme, déplacement, catégorie, origine, genre, bénédiction, rareté (§6.1) | 8, 10 |
| Recherche `name`+`title`+`artist`+`actorEn`+`actorJp` (§6.1) | 8 |
| Tri date desc (défaut) / nom A→Z (§6.1) | 8 |
| Toggle « grouper par personnage » + carte groupe (pastilles, compte) (§6.1) | 8, 10 |
| Panneau détail lecture seule (grand portrait, artiste, voix, origine, bénédiction, rareté, tags, date) (§6.1) | 10 |
| Perf ~1400 cartes → pagination par lots de 60 (§6.1) | 10 |
| i18n EN/FR, `localStorage['feh-lang']`, fallback en→clé (§5.4) | 5, 6, 10 |
| Chemins relatifs, GitHub Pages sous sous-dossier (§8) | 9, 10, 11 |
| Remplace le placeholder `index.html` | 9 |

Hors portée Plan B (Plan C/D) : état possédé/`localStorage` de collection, onglets Stats/Nouveaux/Wishlist/Ajouter, mode ajout rapide, PWA, export résumé, filtre statut (possédés/manquants/voulus).

**2. Scan placeholders** : aucun « TBD/TODO » ; chaque étape de code porte le code complet ; chaque commande a une sortie attendue. Tasks 4 et 11 sont des étapes orchestrateur (réseau réel / déploiement) explicitement marquées, pas des placeholders.

**3. Cohérence des types** :
- `Hero` à 23 clés fixé en Task 2, consommé tel quel par `heroes-catalog.test.mjs` (Task 2), les modules `js/` (Tasks 7–8) et `app.js` (Task 10).
- `buildFacetOptions` renvoie les 8 clés de `FACETS` (Task 8) ; `app.js` itère exactement `FACETS` (Task 10) ; `i18n-keys.test.mjs` exige `filter.<facet>` pour ces 8 (Task 6).
- `applyFilters(heroes, filters, query)` / `sortHeroes(heroes, key)` / `groupByPerson(heroes)` — signatures identiques Task 8 ↔ Task 10.
- `makeTranslator(dicts, lang)` → `t(key, params?)` : Task 5 ↔ Tasks 6/10 (params `{ n }` pour `grid.count` / `group.alts`).
- `classIconPath`/`moveIconPath` produisent `assets/icons/class-<c>-<w>.webp` / `move-<m>.webp` (Task 7) = exactement ce que `fetch-icons.mjs` écrit via `assetName` (Task 3).
- `heroImageUrls` (Task 1) : mêmes URL que celles attendues par `heroes-catalog.test.mjs` (Task 2) et le repli détail de `app.js` (Task 10).

---

## Execution Handoff

Plan complet et sauvegardé dans `docs/superpowers/plans/2026-09-08-plan-b-app-catalogue.md`. Deux options d'exécution :

**1. Subagent-Driven (recommandé)** — un subagent neuf par task, revue entre chaque, itération rapide. Tasks 4 et 11 exécutées par l'orchestrateur (réseau réel / déploiement).

**2. Inline Execution** — exécution dans cette session via executing-plans, par lots avec points de contrôle.

Quelle approche ?
