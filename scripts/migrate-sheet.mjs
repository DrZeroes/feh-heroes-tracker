// scripts/migrate-sheet.mjs — one-shot : convertit un CSV « ma caserne » (export
// Excel perso, noms FR approximatifs) en ma-collection.json importable.
//
//   node scripts/migrate-sheet.mjs <caserne.csv> [ma-collection.json de base] [sortie.json]
//
// Colonnes CSV attendues : rvbg, héros, fusion, +Nature, -Nature, depla, type arme, date, #
// Fusionne : le CSV donne fusion/IV/date ; le fichier de base garde
// rareté/soutien/cradofleurs/projet + wanted + manuals.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const HERO_MOVE = { pieds: 'infantry', cheval: 'cavalry', volant: 'flying', armure: 'armored' };
const HERO_WEAPON = {
  'épée': 'sword', epee: 'sword', lance: 'lance', hache: 'axe',
  magie: 'tome', 'magie bleue': 'tome', 'magie rouge': 'tome', 'magie verte': 'tome',
  arc: 'bow', dague: 'dagger', shuriken: 'dagger',
  'bâton': 'staff', baton: 'staff', souffle: 'breath', soufle: 'breath', 'bête': 'beast', bete: 'beast',
};
const IV = {
  x: null, hp: 'hp', atk: 'atk', spd: 'spd', def: 'def', res: 'res',
  pv: 'hp', atq: 'atk', vit: 'spd', 'déf': 'def', 'rés': 'res',
};

// Balises d'alt dans la colonne « héros » -> propriété attendue OU indice de titre.
const TAG_PROP = {
  mythique: 'mythic', legendaire: 'legendary', 'légendaire': 'legendary',
  brave: 'brave', fallen: 'fallen', dechu: 'fallen', 'déchu': 'fallen',
  danse: 'refresher', dance: 'refresher',
  emblem: 'emblem', embleme: 'emblem', 'emblème': 'emblem',
  ascendant: 'ascended', ascended: 'ascended', exalte: 'ascended', 'exalté': 'ascended',
  harmonise: 'harmonized', 'harmonisé': 'harmonized', harmonized: 'harmonized',
  duo: 'duo', renforce: 'aided', 'renforcé': 'aided', aided: 'aided',
  mele: 'entwined', 'mêlé': 'entwined', entwined: 'entwined',
  mysterieux: 'rearmed', 'mystérieux': 'rearmed', rearmed: 'rearmed',
  arcane: 'rearmed', // les héros « Réarmé » sortent sur bannière Arcane
  attuned: 'attuned', symbiose: 'attuned',
};
// Mots de la colonne « héros » redondants avec les colonnes couleur/arme/déplacement.
const NOISE_TOKENS = new Set([
  'fly', 'flying', 'volant', 'cheval', 'cavalry', 'pieds', 'infantry', 'armure', 'armored',
  'sword', 'epee', 'lance', 'axe', 'hache', 'bow', 'arc', 'tome', 'magie', 'dagger', 'dague',
  'staff', 'baton', 'breath', 'souffle', 'beast', 'bete',
  'vert', 'green', 'bleu', 'blue', 'rouge', 'red', 'gris', 'incolore', 'colorless',
]);
// Balises « saisonnier » -> le titre du héros contient souvent l'un de ces mots.
const TAG_TITLE = {
  lapin: ['spring', 'blossom', 'bloom', 'egg', 'rabbit'],
  spring: ['spring', 'blossom', 'bloom'],
  ete: ['summer', 'beach', 'sea', 'tropical'],
  'été': ['summer', 'beach', 'sea', 'tropical'],
  summer: ['summer', 'beach', 'sea'],
  hiver: ['winter', 'frost', 'ice', 'snow', 'gift', 'holiday'],
  winter: ['winter', 'frost', 'ice', 'snow', 'gift'],
  noel: ['winter', 'gift', 'holiday', 'santa'],
  'noël': ['winter', 'gift', 'holiday'],
  mariage: ['bride', 'bridal', 'groom', 'wedding', 'vows', 'nuptial'],
  bride: ['bride', 'bridal'],
  love: ['love', 'valentine', 'spirit', 'sweet', 'heart'],
  amour: ['love', 'valentine', 'spirit'],
  newyear: ['new year', 'new-year', 'spirits', 'newyear'],
  nouvelan: ['new year', 'spirits'],
  performing: ['dance', 'dancer', 'performing', 'stage', 'song'],
  festival: ['festival', 'dance', 'performing'],
  halloween: ['halloween', 'trick', 'treat', 'pumpkin', 'costume'],
  picnic: ['picnic', 'flower', 'spring'],
  young: ['naga', 'young', 'dragon scion'],
  enfant: ['child', 'young', 'little', 'tiny', 'naga'],
  ninja: ['ninja', 'shuriken', 'shadow'],
  desert: ['desert', 'sand', 'oasis', 'nomad'],
  'désert': ['desert', 'sand', 'oasis'],
  adrift: ['adrift', 'nohr', 'hoshido'],
  fates: ['fates'], // traité comme indice d'origine, pas de titre
  awakening: ['awakening'],
};
// Noms FR divergents non couverts par heroes.json / name-aliases.json.
// Clé = 1er token FR (folded) ; valeur = 1er token EN visé. (Ne mettre que de vraies différences.)
const FR_NAME_FIX = {
  daraen: 'robin', athenais: 'athena', edgar: 'draug',
  priscillia: 'priscilla', camus: 'sirius', nabarl: 'navarre', sagaro: 'sedgar',
  reinahrdt: 'reinhardt', linfan: 'morgan', linfanh: 'morgan', palne: 'panne',
  'gunthrà': 'gunnthra', gunthra: 'gunnthra', nerpuz: 'nerthuz', setheh: 'seteth',
  gonzales: 'gonzalez', sophia: 'sophia', luci: 'marth', lucimask: 'marth',
  'céline': 'celine', celine: 'celine',
};
// Expressions FR entières -> nom EN (1er token) + balise à injecter.
const FR_PHRASE_FIX = {
  'chevalier noir': ['black', 'knight'],
  'chevalier macabre': ['death', 'knight'],
  'empereur des flammes': ['flame', 'emperor'],
};

function foldText(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[ðþøæœßłđħı]/g, (c) => ({ 'ð': 'd', 'þ': 'th', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ħ': 'h', 'ı': 'i' }[c] ?? c))
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lev(a, b) {
  const m = a.length; const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    }
  }
  return d[m][n];
}

function parseCsv(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const c = raw.split(',');
    rows.push(c);
  }
  return rows;
}

function toIso(dmy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(String(dmy).trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  return `20${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function run() {
  const [csvPath, basePath, outPath] = process.argv.slice(2);
  if (!csvPath) {
    console.error('usage: node scripts/migrate-sheet.mjs <caserne.csv> [base ma-collection.json] [out.json]');
    process.exit(1);
  }
  const out = outPath ?? csvPath.replace(/\.csv$/i, '') + '.ma-collection.json';

  const catalog = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8'));
  const heroes = catalog.heroes;
  const base = basePath
    ? JSON.parse(await readFile(basePath, 'utf8'))
    : { version: 2, updated: new Date().toISOString().slice(0, 10), owned: {}, wanted: {}, manuals: {} };
  const ownedSet = new Set(Object.keys(base.owned ?? {}));

  // index de recherche
  const byFirstTok = new Map();
  for (const h of heroes) {
    for (const key of [h.name, h.nameFr, ...(h.aliases ?? [])].filter(Boolean)) {
      const t = foldText(key).split(' ')[0];
      if (!t) continue;
      if (!byFirstTok.has(t)) byFirstTok.set(t, []);
      byFirstTok.get(t).push(h);
    }
  }

  const rows = parseCsv(await readFile(csvPath, 'utf8'));
  rows.shift(); // en-tête
  const report = {
    matched: 0, ambiguous: [], impossible: [], unmatched: [],
  };
  const owned = JSON.parse(JSON.stringify(base.owned ?? {}));
  const GRACE = 30 * 864e5; // tolérance date sheet vs sortie

  for (const r of rows) {
    const [rvbg, heroRaw, fusionRaw, ivP, ivM, deplaRaw, armeRaw, dateRaw] = r;
    if (!heroRaw || heroRaw === '#N/A' || rvbg === '#N/A' || rvbg === 'rvbg') continue;

    const color = ['r', 'b', 'v', 'g'].includes((rvbg || '').trim()) ? rvbg.trim() : null;
    const move = HERO_MOVE[foldText(deplaRaw)] ?? null;
    const weapon = HERO_WEAPON[foldText(armeRaw)] ?? null;
    const date = toIso(dateRaw);
    const merges = /^\+?(\d+)$/.test((fusionRaw || '').trim()) ? Math.min(10, Number(RegExp.$1)) : 0;
    const ivPlus = IV[foldText(ivP)] ?? null;
    const ivMinus = IV[foldText(ivM)] ?? null;

    // "OlwenVert" -> "olwen vert", "DaraenF" -> "daraen f"
    const foldName = foldText(String(heroRaw).replace(/([a-zà-ÿ0-9])([A-Z])/g, '$1 $2'));
    const isDuo = /\+/.test(heroRaw);
    let toks = foldName.replace(/\+/g, ' ').split(' ').filter(Boolean);
    // fusion FR d'expression entière
    const phrase = Object.keys(FR_PHRASE_FIX).find((p) => foldName.startsWith(p));
    if (phrase) toks = [...FR_PHRASE_FIX[phrase], ...toks.slice(phrase.split(' ').length)];

    let first = toks[0];
    if (first === 'luci' || (first === 'lucina' && toks.includes('mask'))) { first = 'marth'; toks.push('lucina'); }
    first = FR_NAME_FIX[first] ?? first;
    const tags = toks.slice(1).filter((t) => !NOISE_TOKENS.has(t));

    // Filtre dur : nom + duo. Couleur = filtre souple (retiré si ça vide tout).
    const okDuo = (h) => !isDuo || (h.properties ?? []).some((p) => p === 'duo' || p === 'harmonized');
    const dedup = (arr) => [...new Map(arr.map((h) => [h.id, h])).values()];

    let keys = [first];
    if (!byFirstTok.has(first)) {
      keys = [...byFirstTok.keys()].filter((k) => lev(k, first) <= 1 && Math.abs(k.length - first.length) <= 1);
    }
    let cands = dedup(keys.flatMap((k) => byFirstTok.get(k) ?? []).filter(okDuo));
    if (color && cands.some((h) => h.color === color)) cands = cands.filter((h) => h.color === color);
    // priorité aux sorties <= date (+ grâce), mais on garde tout pour le repli
    const inWindow = cands.filter((h) => !date || !h.releaseDate
      || (new Date(h.releaseDate) - new Date(date)) <= GRACE);
    const pool = inWindow.length ? inWindow : cands;
    if (!pool.length) {
      const raw = dedup(keys.flatMap((k) => byFirstTok.get(k) ?? []));
      const why = raw.length
        ? `${raw.length} même nom, aucun ne colle [${raw.slice(0, 3).map((h) => `${h.id}:${h.color}/${h.weapon}/${h.move}/${h.releaseDate}`).join(' | ')}]`
        : `1er token « ${first} » inconnu`;
      report.unmatched.push(`${heroRaw} [${color}/${weapon}/${move}/${dateRaw}] — ${why}`);
      continue;
    }
    cands = pool;

    const score = (h) => {
      let s = 0;
      const props = new Set(h.properties ?? []);
      const title = foldText(h.title);
      const origins = foldText((h.origins ?? []).join(' '));
      if (weapon && h.weapon === weapon) s += 3;
      if (move && h.move === move) s += 3;
      for (const tg of tags) {
        if (TAG_PROP[tg] && props.has(TAG_PROP[tg])) s += 8;
        if (TAG_TITLE[tg] && TAG_TITLE[tg].some((w) => title.includes(w) || origins.includes(w))) s += 5;
        if ((tg === 'f' && h.gender === 'female') || (tg === 'm' && h.gender === 'male')) s += 3;
        if (title.includes(tg)) s += 4;
      }
      // « Tiki Old / vieille » = Tiki adulte -> pénalise les titres « jeune »
      if (['old', 'vieille', 'vieux', 'adulte', 'grande'].some((t) => tags.includes(t))
        && ['naga', 'young', 'scion'].some((w) => title.includes(w))) s -= 6;
      if (tags.length === 0) {
        // nom nu -> version de base : pas de balise saisonnière/mythique/légendaire
        if (!['mythic', 'legendary', 'emblem', 'aided', 'entwined'].some((p) => props.has(p))
          && !props.has('hat') && !props.has('tiara')) s += 3;
      }
      if (ownedSet.has(h.id)) s += 2;
      // proximité de date : summon ~ à la sortie
      if (date && h.releaseDate) {
        const days = (new Date(date) - new Date(h.releaseDate)) / 864e5;
        s += days >= 0 ? Math.max(0, 6 - Math.min(6, days / 120)) : -4; // pénalise sortie postérieure
      }
      return s;
    };

    cands = [...cands].sort((a, b) => score(b) - score(a)
      || String(b.releaseDate).localeCompare(String(a.releaseDate)));
    const best = cands[0];
    const tie = cands[1] && Math.abs(score(cands[1]) - score(best)) < 0.5 && cands[1].id !== best.id;

    // date aberrante (> 90 j avant la sortie du héros = faute de saisie) -> on n'écrit pas la date
    const wayOff = date && best.releaseDate
      && (new Date(best.releaseDate) - new Date(date)) > 90 * 864e5;
    const finalDate = wayOff ? null : date;

    if (!owned[best.id]) {
      owned[best.id] = [{
        rarity: null, merges, dragonflowers: 0, ivPlus, ivMinus, support: null, date: finalDate, project: null,
      }];
    } else {
      const u = owned[best.id][0];
      if (!u.merges) u.merges = merges;
      if (!u.ivPlus) u.ivPlus = ivPlus;
      if (!u.ivMinus) u.ivMinus = ivMinus;
      if (!u.date) u.date = finalDate;
    }
    report.matched += 1;
    if (date && best.releaseDate && best.releaseDate > toIso(dateRaw)) {
      report.impossible.push(`${heroRaw} (${dateRaw}) -> ${best.id} sorti ${best.releaseDate}`);
    } else if (tie) {
      report.ambiguous.push(`${heroRaw} -> ${best.id} (ou ${cands[1].id})`);
    }
  }

  const result = {
    version: 2,
    updated: new Date().toISOString().slice(0, 10),
    owned,
    wanted: base.wanted ?? {},
    manuals: base.manuals ?? {},
  };
  await writeFile(out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`[migrate-sheet] ${report.matched} lignes appariées, ${Object.keys(owned).length} héros au total`);
  console.log(`[migrate-sheet] écrit ${out}`);
  const dump = (label, arr, mark) => {
    if (!arr.length) return;
    console.log(`\n${arr.length} ${label} :`);
    for (const x of arr) console.log(`  ${mark}`, x);
  };
  dump('appariements à date impossible (héros sorti après la date sheet)', report.impossible, '!');
  dump('appariements ambigus (à vérifier)', report.ambiguous, '?');
  dump('lignes NON appariées', report.unmatched, '✗');
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) run().catch((e) => { console.error(e); process.exit(1); });

export { foldText, toIso };
