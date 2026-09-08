# FEH Collection Tracker — Design / Spec

> Document de conception à réutiliser dans un **autre projet Claude Code / VS Code**.
> Date : 2026-09-08. Auteur des besoins : Thomas. Jeu concerné : **Fire Emblem Heroes (FEH)**.
> Langue du produit final : **bilingue EN + FR**.
> Révision 2026-09-08b : catalogue enrichi (genre, artiste, doubleurs, bénédiction, rareté du pool), vue groupée par personnage, collection v2 (doubles, wishlist, projets +10), stats timeline, mode ajout rapide, PWA offline, export résumé.

---

## 1. Objectif

Remplacer un Google Sheet de suivi de collection de héros FEH par un **site statique hébergé sur GitHub Pages**, qui :

1. affiche le **catalogue complet** des héros du jeu (référence), avec genre, artiste, doubleurs, élément de bénédiction et rareté du pool,
2. se **met à jour tout seul** à chaque nouveau héros (via l'API du wiki Fandom),
3. permet à **plusieurs utilisateurs** d'enregistrer *leur* collection (héros possédés, fusions, IV, doubles en rab, date, projets +10, wishlist), **chacun dans son navigateur** + export/import d'un fichier JSON (pas de compte, pas de backend, pas de synchro cloud),
4. est **bilingue EN / FR**,
5. est **installable (PWA) et utilisable hors-ligne** — pensé comme compagnon du jeu mobile.

Lien du sheet d'origine : `https://docs.google.com/spreadsheets/d/1EVT6AteuKfHzl2Nt7Cz-JeJ9HD6YLSNDb9_4qUbpDs4/edit`

---

## 2. Décisions déjà prises

| Sujet | Décision |
|---|---|
| Hébergement | GitHub Pages, site **100 % statique** |
| Stack | **Vanilla** HTML + JS + CSS, **aucun framework, aucun build** pour l'appli |
| Stockage collection | `localStorage` par navigateur + **Exporter / Importer** un fichier JSON. Multi-users = chacun son fichier. **Pas** de login / cloud / synchro. |
| Source du catalogue | **Cargo API du wiki Fandom** `feheroes.fandom.com` (game8.co écarté : pas d'API) |
| Mise à jour catalogue | Script Node lancé par **GitHub Action** (bouton manuel + planifié hebdo) qui régénère `data/heroes.json` et commit si diff |
| Ajout manuel | Page « Ajouter un héros » dans le site → génère un bloc JSON à coller dans `data/heroes.overrides.json` |
| i18n | Interface + vocabulaire fixe traduits EN/FR. Noms de héros en **anglais** (le wiki est en anglais), épithète FR optionnelle par héros dans les overrides. |
| Migration du sheet actuel | Script one-shot **après** la v1 (non bloquant pour la v1) |
| PWA | `manifest.webmanifest` + service worker (app shell en cache-first, `heroes.json` en stale-while-revalidate), icônes 192/512 **générées** (SVG→PNG, remplaçables) |
| Ajout rapide | Grille dense : tap = possédé/non, stepper fusions inline, pas de panneau détail. **Pas** de concept de « session d'invocation ». |
| Partage v1 | **Export d'un résumé `.md`** uniquement (+ export/import JSON déjà prévu). |

### Hors périmètre v1 (YAGNI)
Comptes cloud & synchro multi-appareils · base de compétences / skills · simulateur d'invocation / probabilités · appli mobile native · classement / social · **lien de partage lecture seule (état compressé dans l'URL) → v2** · **comparaison / diff de deux collections → v2** · **compteur de pity/orbes → v2**.

---

## 3. Source de données : Cargo API du wiki Fandom

### Endpoint
```
https://feheroes.fandom.com/api.php?action=cargoquery&format=json
    &tables=Units
    &fields=WikiName,Name,Title,WeaponType,MoveType,Origin,Properties,ReleaseDate,AdditionDate,IntID
    &order_by=ReleaseDate+DESC,CharSort+ASC
    &limit=500
    &offset=0
```

- Pagination : `limit` max 500, incrémenter `offset` jusqu'à réponse vide (~1000+ héros au total).
- **Rate limit anonyme agressif** (`code: "ratelimited"`). Mitigation dans le script : `User-Agent` explicite, pause ~2–5 s entre pages, retry avec back-off.
- Réponses JSON : chaque élément est `{ "title": { ...champs... } }`.
- Endpoint utilitaire : `?action=cargofields&table=Units&format=json` pour lister les champs.

### Champs de la table `Units` (vérifiés)
`Name, Title, WikiName (unique, clé), Person, Origin, Entries (list), GameSort (int), CharSort (int), TagID, IntID (int), Gender, WeaponType, MoveType, GrowthMod, Artist, ActorEN (list), ActorJP (list), AdditionDate (date), ReleaseDate (date), Properties (list, delim ","), Description`

### Exemple de réponse réelle (2026-08-31)
```json
{ "WikiName": "Rhea The Final Child", "Name": "Rhea", "Title": "The Final Child",
  "WeaponType": "Blue Breath", "MoveType": "Infantry",
  "Origin": "Fire Emblem: Three Houses", "Properties": "legendary,hat",
  "ReleaseDate": "2026-08-31" }
```

### Normalisation à appliquer (dans `scripts/fetch-heroes.mjs`)

**`WeaponType`** = `"<Couleur> <Arme>"` → séparer :

| Couleur (EN) | code | | Arme (EN) | code | FR |
|---|---|---|---|---|---|
| Red | `r` | | Sword | `sword` | Épée |
| Blue | `b` | | Lance | `lance` | Lance |
| Green | `v` | | Axe | `axe` | Hache |
| Colorless | `g` | | Bow | `bow` | Arc |
| | | | Dagger | `dagger` | Dague |
| | | | Tome | `tome` | Magie |
| | | | Staff | `staff` | Bâton |
| | | | Breath | `breath` | Souffle |
| | | | Beast | `beast` | Bête |

> ⚠️ codes couleur : le sheet d'origine utilise `r`/`v`/`b`/`g` = rouge / **vert** / bleu / **gris (incolore)**. Garder cette convention.

**`MoveType`** :

| EN | code | FR |
|---|---|---|
| Infantry | `infantry` | Pieds |
| Cavalry | `cavalry` | Cheval |
| Flying | `flying` | Volant |
| Armored | `armored` | Armure |

**`Properties`** (liste) → dériver `category` + flags. Valeurs vues : `legendary, mythic, brave, duo, harmonic, ghb, tt, special, limited, refresher, hat`, etc.
Proposition de `category` (priorité haut → bas) : `mythic` → `legendary` → `duo` → `harmonic` → `brave` → `ghb` → `tt` → `special` → sinon `standard`.
Conserver aussi `properties` brut (array) pour filtres fins. `refresher` (danseur) = flag utile.

**`ReleaseDate`** : ISO `YYYY-MM-DD`. Sert au tri « Nouveaux héros ».

**`Gender`** : garder tel quel (`M` / `F` / autre). Filtre + affichage détail.

**`Artist`**, **`ActorEN`** (list), **`ActorJP`** (list) : `Artist` → string ; `ActorEN` / `ActorJP` → array (split `,`). Affichage détail + recherche texte.

**`Person`** : identifiant du personnage de base, commun à tous ses alts. Sert de clé pour la **vue groupée par personnage**. Conserver tel quel.

**Clé primaire** : `WikiName` (unique, stable). C'est aussi la clé dans le fichier collection utilisateur.

### Tables jointes (3 passes Cargo supplémentaires)

Jointure par **nom de page** : `_pageName` de ces tables ≈ `"<Name>: <Title>"`. Le script construit une map `pageName → valeur` puis rapproche chaque unit (dériver son pageName depuis `Name` + `Title`, tolérant : comparer aussi en normalisant espaces / `:` / casse ; log des non-résolus).

| Table | Requête | Champ retenu | Cible dans `heroes.json` |
|---|---|---|---|
| `LegendaryHero` | `fields=_pageName=Page,LegendaryEffect` | `LegendaryEffect` ∈ `Fire/Water/Wind/Earth` | `blessing` (lowercase) |
| `MythicHero` | `fields=_pageName=Page,MythicEffect` | `MythicEffect` ∈ `Light/Dark/Astra/Anima` | `blessing` (lowercase) |
| `SummoningAvailability` | `fields=_pageName=Page,Rarity,Property,StartTime` `order_by=StartTime DESC` | `Rarity` ∈ `3/4/5` | `poolRarity` (int) + `poolFlags` |

- **`blessing`** : `fire|water|wind|earth|light|dark|astra|anima|null`. Uniquement légendaires / mythiques ; `null` sinon. (Les deux tables sont petites : 1 ligne par héros.)
- **`poolRarity`** : prendre la ligne avec le `StartTime` **le plus récent** pour ce héros ; ignorer les lignes `Property = "revivalOnly"`. `null` si le héros n'apparaît dans aucune ligne (GHB / TT / exclusifs légendaire-mythique / seasonal hors pool standard). `SummoningAvailability` est plus grosse → paginer (`limit=500`, `offset`).
- **`poolFlags`** : array des `Property` non vides vus pour ce héros (`specialRate`, `SHSpecialRate`, …). Filtre fin optionnel.
- Rate limit : ces 3 passes s'ajoutent au budget de `fetch-heroes.mjs` (pause 2–5 s entre pages, retry back-off, `User-Agent` explicite). Run hebdo → surcoût acceptable.

---

## 4. Structure du repo

```
/index.html                  → l'appli, page unique
/app.js
/styles.css
/manifest.webmanifest        → PWA (name, icons, display standalone, start_url "./", theme_color)
/sw.js                       → service worker (app shell cache-first ; heroes.json stale-while-revalidate)
/icons/
    icon-192.png             → généré (SVG→PNG), remplaçable
    icon-512.png
/data/
    heroes.json              → catalogue complet normalisé (GÉNÉRÉ — ne pas éditer à la main)
    heroes.overrides.json    → ajouts / corrections manuels + épithètes FR
/i18n/
    en.json
    fr.json
/scripts/
    fetch-heroes.mjs         → Cargo API (Units + 3 tables jointes), pagine, normalise, fusionne overrides, écrit data/heroes.json
    make-icons.mjs           → (one-shot) génère icons/*.png depuis un SVG source
    migrate-sheet.mjs        → (post-v1) convertit l'ancien Google Sheet en ma-collection.json
/.github/workflows/
    update-heroes.yml        → workflow_dispatch (bouton) + schedule hebdo ; run script ; commit si diff
/README.md
```

Aucun `package.json` requis si `fetch-heroes.mjs` n'utilise que `fetch` natif (Node ≥ 20) et `fs`.

---

## 5. Formats de fichiers

### 5.1 `data/heroes.json` (généré)
```json
{
  "generatedAt": "2026-09-08T00:00:00Z",
  "source": "feheroes.fandom.com Cargo API (Units + LegendaryHero + MythicHero + SummoningAvailability)",
  "count": 1234,
  "heroes": [
    {
      "id": "Rhea The Final Child",
      "name": "Rhea",
      "title": "The Final Child",
      "titleFr": null,
      "person": "Rhea",
      "color": "b",
      "weapon": "breath",
      "move": "infantry",
      "gender": "F",
      "origin": "Fire Emblem: Three Houses",
      "category": "legendary",
      "properties": ["legendary", "hat"],
      "blessing": "fire",
      "poolRarity": null,
      "poolFlags": [],
      "artist": "Kaya8",
      "actorEn": ["Cherami Leigh"],
      "actorJp": ["Ai Kayano"],
      "releaseDate": "2026-08-31",
      "intId": 12345
    }
  ]
}
```

Champs ajoutés en rév. 2026-09-08b : `person`, `gender`, `blessing`, `poolRarity`, `poolFlags`, `artist`, `actorEn`, `actorJp`. Valeurs d'exemple ci-dessus illustratives.

### 5.2 `data/heroes.overrides.json` (manuel)
```json
{
  "add": [
    { "id": "Some Hero Not Yet On Wiki", "name": "...", "title": "...",
      "color": "r", "weapon": "sword", "move": "cavalry",
      "origin": "...", "category": "standard", "properties": [], "releaseDate": "2026-09-05" }
  ],
  "patch": {
    "Rhea The Final Child": { "titleFr": "L'Enfant Ultime" }
  }
}
```
Le script : part du Cargo, applique `patch` par `id`, ajoute `add` (en écrasant si `id` déjà présent).

### 5.3 Fichier collection utilisateur — `ma-collection.json` (v2)
Clé `localStorage` : `feh-collection-v1` (inchangée ; le versionnage se fait par le champ `version`).
```json
{
  "version": 2,
  "updated": "2026-09-08",
  "owned": {
    "Rhea The Final Child": {
      "merges": 1,
      "ivPlus": "atk",
      "ivMinus": "spd",
      "copies": 2,
      "date": "2026-09-01",
      "note": "",
      "project": { "targetMerges": 10, "targetIvPlus": "atk", "notes": "" }
    },
    "Sigurd Legacy of Justice": { "merges": 0, "ivPlus": null, "ivMinus": null, "copies": 0, "date": "2026-08-20", "note": "" }
  },
  "wanted": {
    "Some Upcoming Hero": { "priority": "high", "note": "banner du 20/09" }
  }
}
```
- `merges` : entier 0–10.
- `ivPlus` / `ivMinus` : `hp|atk|spd|def|res|null` (null = neutre / « X » dans l'ancien sheet).
- `copies` : entier ≥ 0. **Doubles en rab** non fusionnés (fodder / hérédité), distinct de `merges`. Défaut 0.
- `project` : optionnel, sur un héros possédé. `{ targetMerges (0–10), targetIvPlus (hp|atk|spd|def|res|null), notes }`. Pilote les barres « projet +10 » de l'onglet Stats.
- `wanted` : bloc racine, **indépendant de `owned`**. `wanted[id] = { priority: "high"|"normal", note }`. Un id peut être à la fois `wanted` et `owned` (projet d'alt / de fusion) — l'UI le signale.
- Boutons **Exporter** (download `ma-collection.json`) / **Importer** (remplace ou fusionne, demander).
- **Migration v1→v2** (à l'import ET au chargement `localStorage`) : si `version` absent ou `1` → ajouter `copies: 0` à chaque `owned`, créer `wanted: {}`, passer `version: 2`, réécrire. Sans perte.
- Validation à l'import : ignorer les `id` inconnus du catalogue mais les garder en mémoire (héros pas encore synchro) + avertir. Idem pour les `id` de `wanted`.

### 5.4 `i18n/*.json`
```json
{
  "app.title": "FEH Collection Tracker",
  "nav.collection": "Collection",
  "nav.stats": "Stats",
  "nav.new": "Nouveaux héros",
  "nav.wanted": "Wishlist",
  "nav.add": "Ajouter un héros",
  "filter.color": "Couleur",
  "filter.gender": "Genre",
  "filter.blessing": "Bénédiction",
  "filter.poolRarity": "Rareté du pool",
  "filter.groupByPerson": "Grouper par personnage",
  "weapon.sword": "Épée",
  "move.infantry": "Pieds",
  "category.legendary": "Légendaire",
  "blessing.fire": "Feu",
  "blessing.light": "Lumière",
  "gender.M": "Masculin",
  "gender.F": "Féminin",
  "field.merges": "Fusions",
  "field.ivPlus": "IV +",
  "field.copies": "Doubles",
  "field.artist": "Illustrateur",
  "field.actorEn": "Voix (EN)",
  "field.actorJp": "Voix (JP)",
  "project.title": "Projet +10",
  "project.target": "Objectif",
  "stats.timeline": "Héros obtenus par mois",
  "stats.fodder": "Stock de doubles",
  "stats.wantedSummary": "Wishlist",
  "action.export": "Exporter",
  "action.import": "Importer",
  "action.quickAdd": "Ajout rapide",
  "action.exportSummary": "Exporter le résumé",
  "action.want": "Ajouter à la wishlist",
  "pwa.updateAvailable": "Catalogue mis à jour — recharger"
}
```
> Liste non exhaustive : extraire toutes les nouvelles chaînes en clés au fil de l'implémentation. `blessing.*` = 8 clés (fire/water/wind/earth/light/dark/astra/anima), `gender.*` selon valeurs réelles de l'API.
- Langue mémorisée : `localStorage` clé `feh-lang` (`en` | `fr`), défaut = langue du navigateur sinon `en`.
- Clés manquantes → fallback `en` → fallback clé brute.

---

## 6. L'appli (`index.html` + `app.js`)

Page unique, navigation par onglets (hash router : `#/collection`, `#/stats`, `#/new`, `#/wanted`, `#/add`).

### 6.1 Onglet Collection / Catalogue
- Chargement : `fetch('data/heroes.json')` puis merge état possédé + wishlist depuis `localStorage` (avec migration v1→v2, §5.3).
- Grille de cartes héros (nom + épithète, pastille couleur, icône arme, icône déplacement, badge catégorie, badge bénédiction si présent, badge rareté du pool si présent, badge « Possédé » / « Manquant », étoile « voulu » si dans `wanted`).
- **Filtres** (combinables) : couleur, arme, déplacement, catégorie, jeu d'origine, **genre**, **élément de bénédiction**, **rareté du pool** (3 / 4 / 5 / n. a.), statut (tous / possédés / manquants / voulus).
- **Recherche** texte sur `name` + `title` + `artist` + `actorEn` + `actorJp`.
- **Tri** : date de sortie (défaut, récent → ancien), nom A→Z.
- **Toggle « Grouper par personnage »** (off par défaut) : regroupe par `person`. Carte-groupe = nom du perso + pastilles couleur par alt + « X / N possédés », dépliable vers les cartes d'alts. Les filtres et la recherche s'appliquent au sein des groupes (un groupe est masqué si aucun alt ne passe).
- Clic sur une carte → **panneau détail** : toggle Possédé, `merges` (0–10), `ivPlus`, `ivMinus`, **`copies`** (stepper), `date`, `note`, bloc **Projet +10** (`targetMerges`, `targetIvPlus`, `notes`), bouton **Ajouter / retirer de la wishlist**. Infos catalogue en lecture : artiste, voix EN/JP, origine, bénédiction, rareté du pool. Sauvegarde immédiate en `localStorage`.
- **Mode ajout rapide** (bouton `action.quickAdd`) : bascule la grille en version dense ; tap sur une carte = toggle Possédé ; stepper `merges` inline sur la carte ; pas de panneau détail. Re-tap `action.quickAdd` pour revenir au mode normal. Pas de concept de « session d'invocation ».
- Perf : ~1000+ cartes → rendu virtualisé simple ou pagination/scroll infini (lot de 60). Le mode groupé pagine les groupes.

### 6.2 Onglet Stats
- Total possédés / total catalogue + %.
- Répartition possédés par **couleur**, par **arme**, par **déplacement**, par **catégorie**, par **élément de bénédiction** (barres).
- « Il te manque : N légendaires, M mythiques, … ».
- Nombre de `+10`, nombre de fusionnés, répartition IV (optionnel).
- **Timeline** : héros obtenus par mois — barres CSS, une par `YYYY-MM` dérivé de `owned[id].date` (ignorer les entrées sans date).
- **Projets +10** : liste des héros possédés ayant un `project`, barre de progression `merges / targetMerges` + rappel `targetIvPlus`.
- **Stock de doubles (fodder)** : somme des `copies`, et top ~10 des héros avec le plus de `copies`.
- **Résumé wishlist** : nombre de `wanted`, dont X encore manquants (pas dans `owned`), répartition par `priority`.
- Tout calculé côté client, pas de lib de graph obligatoire (barres CSS).

### 6.3 Onglet Nouveaux héros
- 30 derniers par `releaseDate`, badge « pas encore possédé », **badge « voulu » si dans `wanted`** (surlignage de la carte), badges rareté du pool + bénédiction, clic = même panneau détail.

### 6.4 Onglet Wishlist
- Liste des héros de `wanted`, triés par `priority` puis `releaseDate` desc.
- Chaque ligne : carte héros + statut (`manquant` / `possédé`), `priority` éditable, `note` éditable, bouton retirer.
- Filtre rapide : manquants seulement.
- Vide → message d'invite (« marque des héros comme voulus depuis le catalogue »).

### 6.5 Onglet Ajouter un héros
- Formulaire (name, title, color, weapon, move, origin, category, releaseDate).
- Sortie : bloc JSON prêt à coller dans `data/heroes.overrides.json` → `add`, + rappel « commit puis re-déploiement ».
- Optionnel : bouton « copier » + lien direct vers l'éditeur GitHub du fichier.

---

## 7. GitHub Action — `update-heroes.yml`

```yaml
name: Update heroes catalog
on:
  workflow_dispatch:
  schedule:
    - cron: "0 6 * * 1"   # tous les lundis 06:00 UTC
permissions:
  contents: write
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: node scripts/fetch-heroes.mjs
      - name: Commit if changed
        run: |
          if ! git diff --quiet -- data/heroes.json; then
            git config user.name "feh-bot"
            git config user.email "feh-bot@users.noreply.github.com"
            git add data/heroes.json
            git commit -m "chore: update heroes catalog ($(date -u +%F))"
            git push
          fi
```

`scripts/fetch-heroes.mjs` — pseudo :
1. **Units** : boucle `offset` 0, +500… jusqu'à page vide ; concat. `fields` inclut désormais `Gender,Artist,ActorEN,ActorJP,Person` (en plus de ceux de la §3).
2. **Tables jointes** (§3) : requêter `LegendaryHero`, `MythicHero` (petites, 1 passe chacune), `SummoningAvailability` (paginée). Construire :
   - `blessingByPage : pageName → "fire|water|…"` (fusion des deux premières, lowercase).
   - `poolByPage : pageName → { rarity, flags[] }` : parmi les lignes d'un même page, ignorer `Property = "revivalOnly"`, garder celle au `StartTime` max ; `flags` = union des `Property` non vides.
3. pour chaque unit : normaliser (section 3) → objet héros ; dériver `pageName = "<Name>: <Title>"` et rapprocher `blessing` / `poolRarity` / `poolFlags` (matching tolérant espaces/`:`/casse ; logguer les héros légendaires/mythiques sans `blessing` résolu).
4. charger `data/heroes.overrides.json`, appliquer `patch` puis `add` (les overrides peuvent aussi fixer `blessing` / `poolRarity` / `gender`).
5. trier par `releaseDate` desc.
6. écrire `data/heroes.json` (JSON indenté 2, `generatedAt`, `count`).
7. exit 0 même si aucun changement (le workflow gère le diff).
8. gestion `ratelimited` : pause 2–5 s entre pages + retry back-off (max ~5), `User-Agent` explicite ; sinon échec explicite. Budget total plus élevé (4 tables) → prévoir un run de quelques minutes.

---

## 8. Déploiement GitHub Pages
- Repo public → **Settings → Pages → Source : branche `main`, dossier `/` (root)**.
- URL : `https://<user>.github.io/<repo>/`.
- Chemins **relatifs** dans `index.html` (`data/heroes.json`, pas `/data/...`) pour marcher sous sous-dossier.
- Aucun build. Le seul « CI » est l'action de mise à jour du catalogue.

---

## 9. Migration du Google Sheet actuel (post-v1)

### Analyse du sheet (un seul onglet, **plusieurs tableaux empilés**)

| Zone (approx.) | Contenu | Colonnes |
|---|---|---|
| Lignes ~3–155 | **Collection principale possédée** | `rvbg` (couleur), `--héros` (nom), `fusion` (+1…+6), `+Nature` / `-Nature` (IV, ou `X` = neutre), `depla` (Pieds/Cheval/Volant/Armure), `type arme` (Épée/Lance/Hache/Arc/Dague/Magie/Bâton/Souffle), `date` (JJ/MM/AA), `#` (n° d'invocation), + note occasionnelle dernière colonne (`w11ser`, `ws2019`…) |
| ~156–280 | Liste secondaire : nom, couleur, arme, déplacement + catégorie (`Three Houses`, `Mythique`, `Lapin`…) + compteurs | |
| ~300–390 | Journal spéciaux / GHB / TT : couleur, rareté, `S`, nom, épithète, `0`, `Heroes`, catégorie, date, n° | |
| ~400–490 | Zone stats : nom + nombre + pourcentage (calcul de pity / probas) | |
| ~520–740 | Journal de scores : score, nombre, type de bannière, date | |
| ~760–1235 | **Catalogue complet** : rareté du pool (3/4/5), couleur, nom, nombre de copies possédées, arme — le vrai « possédé vs roster » | |

### Problèmes connus
- **Encodage cassé** : `é`, `ê`, `É`, `'` → séquences `�` / `\xef\xbf\xbd`. Nettoyer.
- Noms **en français / custom** (`Chrom Lapin`, `Xander Lapin`, `DaraenF`, `LuciMASK`, `Nabarl`…) à rapprocher des `WikiName` **anglais** (`Chrom Spring…`, `Xander Spring…`, `Robin (F)…`, `Lucina Masked…`, `Navarre…`).

### Plan de migration
1. Export CSV/XLSX du sheet.
2. `scripts/migrate-sheet.mjs` : détecte les zones, nettoie l'encodage, extrait la **zone collection principale** (fusion / IV / date / n°).
3. Table de correspondance FR→WikiName : auto par similarité (nom + couleur + arme + déplacement) puis **revue manuelle** d'un fichier `mapping-review.csv` (lignes non résolues).
4. Génère `ma-collection.json` (section 5.3) → l'utilisateur l'**importe** au premier lancement.
5. Zones 2–5 (journaux, stats de proba) : **non migrées** en v1 (hors périmètre).

---

## 10. Questions ouvertes / à trancher au démarrage du projet

1. ~~Périmètre des stats v1~~ → **tranché** : total/%/répartitions **+** suivi `+10` / IV **+** timeline **+** projets **+** fodder **+** résumé wishlist (§6.2).
2. **Migration** : la faire dès la v1 (pour avoir la collection de Thomas d'entrée) ou vraiment après ?
3. Nom du repo GitHub + compte (`<user>.github.io/<repo>`).
4. Épithètes FR des héros : on en veut un jeu complet à terme, ou seulement au cas par cas ?
5. Fréquence du cron (hebdo suffisant ? les bannières sortent ~toutes les 2 semaines).
6. ~~Doublons de personnage / grouper par perso~~ → **tranché** : clé `WikiName`, + **toggle « Grouper par personnage »** basé sur `person` (§6.1).
7. **Matching `pageName` des tables jointes** : confirmer sur données réelles que `"<Name>: <Title>"` reconstruit bien `_pageName` de `LegendaryHero` / `MythicHero` / `SummoningAvailability` (cas des `:` déjà dans le titre, apostrophes, espaces). Prévoir un rapport de non-résolus dans le script.
8. **Règle `poolRarity`** : « ligne au `StartTime` max, hors `revivalOnly` » — valider sur quelques héros connus (standard 3-4★, 5★-exclusif, revival). Comportement voulu pour un héros retiré du pool puis jamais revenu : garder la dernière `Rarity` connue ou passer à `null` ?
9. **`gender`** : valeurs réelles renvoyées par l'API (au-delà de `M`/`F` ?) → figer la table i18n `gender.*`.

---

## 11. Ordre d'implémentation suggéré

1. `scripts/fetch-heroes.mjs` (Units seul) + `data/heroes.json` généré une première fois (à la main en local).
2. `index.html` + `app.js` : chargement catalogue + grille + filtres + recherche (lecture seule).
3. État possédé : `localStorage`, toggle + panneau détail (merges/IV/date/note).
4. Export / Import JSON.
5. i18n EN/FR (extraire tous les textes en clés au fur et à mesure).
6. Onglets Stats + Nouveaux héros + Ajouter un héros (version de base).
6b. **Catalogue enrichi** : étendre `fetch-heroes.mjs` (3 tables jointes, §3/§7) → champs `gender`/`artist`/`actor*`/`blessing`/`poolRarity`/`person` ; filtres genre / bénédiction / rareté ; **vue groupée par personnage**.
6c. **Collection v2** : `copies`, `wanted`, `project` + migration v1→v2 (§5.3) ; onglet **Wishlist** ; stats **timeline** + **projets +10** + **fodder** + **résumé wishlist** (§6.2).
6d. **Mode ajout rapide** (§6.1).
6e. **PWA** : `manifest.webmanifest` + `sw.js` + `scripts/make-icons.mjs` + enregistrement SW + toast maj (§12).
6f. **Export résumé `.md`** (§13).
7. GitHub Action `update-heroes.yml` (avec les 4 tables).
8. Déploiement Pages + README.
9. (post-v1) `scripts/migrate-sheet.mjs`.

---

## 12. PWA / offline

- **`manifest.webmanifest`** : `name`, `short_name`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `background_color`, `theme_color`, `icons` → `icons/icon-192.png` (192×192, `purpose "any maskable"`) + `icons/icon-512.png`. Lié depuis `index.html` (`<link rel="manifest">` + `<meta name="theme-color">`).
- **Icônes** : générées par `scripts/make-icons.mjs` depuis un SVG source (emblème FEH-like simple) → PNG 192 & 512, commités dans `/icons/`. Remplaçables sans changer le code.
- **`sw.js`** :
  - `install` : pré-cache l'**app shell** (`./`, `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `i18n/en.json`, `i18n/fr.json`, `icons/*`). `skipWaiting`.
  - `activate` : purge des anciens caches versionnés. `clients.claim`.
  - `fetch` : app shell → **cache-first** ; `data/heroes.json` → **stale-while-revalidate** (répondre depuis le cache, revalider en arrière-plan, mettre à jour le cache) ; autres requêtes (Cargo API, etc.) → réseau direct, pas d'interception.
  - Nom de cache versionné (`feh-shell-v1`) → bump manuel à chaque changement de shell.
- **Enregistrement** dans `app.js` : `if ('serviceWorker' in navigator)` et `location.protocol !== 'file:'` → `navigator.serviceWorker.register('sw.js')`. Chemins **relatifs** (compat sous-dossier GitHub Pages, cf. §8).
- **Toast maj catalogue** : quand la revalidation SWR détecte un `heroes.json` avec un `generatedAt` plus récent que celui affiché → `postMessage` au client → afficher un bandeau `pwa.updateAvailable` avec bouton « recharger ».
- Aucune dépendance, pas de lib PWA, pas de build.

---

## 13. Export résumé (partage v1)

Bouton `action.exportSummary` (onglet Stats) → génère et télécharge un fichier **`feh-collection-summary.md`** (texte, pas de rendu image en v1).

Contenu type :

```markdown
# Ma collection FEH — 2026-09-08

**842 / 1250 héros (67 %)**

## Par catégorie
- Légendaires : 58 / 72  (manque 14)
- Mythiques   : 41 / 55  (manque 14)
- …

## Fusions
- +10 : 37 héros
- Fusionnés (1–9) : 112 héros
- Doubles en rab : 260

## Wishlist (encore manquants)
- Some Upcoming Hero  (priorité haute)
- …
```

- 100 % client (concat de chaînes + `Blob` + `URL.createObjectURL` + `<a download>`).
- Respecte la langue courante (réutilise les clés i18n).
- **Non inclus en v1** (→ v2) : export image/PNG, lien de partage lecture seule (état compressé dans l'URL), comparaison de deux collections.
```
