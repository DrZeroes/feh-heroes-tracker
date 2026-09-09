// scripts/apply-frdex.mjs — one-shot : injecte des noms/épithètes FR depuis un
// « heroesDex » CSV perso dans data/heroes.overrides.json (patch) puis réécrit
// data/heroes.json en appliquant les overrides (sans refetch réseau).
//
//   node scripts/apply-frdex.mjs <heroesDex.csv> [--write]
//
// Colonnes CSV : couleur, livre, S, nomFR, titreFR, _, jeu(EN), pool, catFR,
//                date JJ/MM/AAAA, #, got
// Sans --write : dry-run (n'écrit rien, imprime le rapport + un CSV de relecture).
// Ne remplit QUE les champs actuellement null (ne touche jamais une valeur
// officielle déjà présente).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applyOverrides } from './lib/normalize.mjs';

// noms FR -> 1er token EN quand ils divergent (hors alias déjà connus du catalogue)
const FR_FIRST = {
  alphonse: 'alfonse', chrys: 'chrom', daraen: 'robin', linfan: 'morgan',
  eltoshan: 'eldigan', sylvia: 'silvia', jamke: 'jamke', lakche: 'larcei',
  scaith: 'skasaher', delmud: 'diarmuid', asaello: 'asvel', tinny: 'tine',
  homer: 'homère', travant: 'travant', bserafew: 'seraphine',
};

function foldText(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[ðþøæœßłđħı]/g, (c) => ({
      'ð': 'd', 'þ': 'th', 'ø': 'o', 'æ': 'ae', 'œ': 'oe',
      'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ħ': 'h', 'ı': 'i',
    }[c] ?? c))
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

function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

function toIso(dmy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(dmy).trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const COLOR = { r: 'r', b: 'b', v: 'v', g: 'g' };

async function run() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith('--'));
  const write = args.includes('--write');
  // La colonne « nom » du heroesDex a trop de coquilles (Corin/Ananko/Sillas…)
  // pour être injectée telle quelle : --names l'active explicitement.
  const doNames = args.includes('--names');
  if (!csvPath) {
    console.error('usage: node scripts/apply-frdex.mjs <heroesDex.csv> [--write]');
    process.exit(1);
  }

  const catUrl = new URL('../data/heroes.json', import.meta.url);
  const ovUrl = new URL('../data/heroes.overrides.json', import.meta.url);
  const catalog = JSON.parse(await readFile(catUrl, 'utf8'));
  const heroes = catalog.heroes;
  const overrides = JSON.parse(await readFile(ovUrl, 'utf8'));
  overrides.add ??= [];
  overrides.patch ??= {};

  const byFirstTok = new Map();
  for (const h of heroes) {
    for (const key of [h.name, h.nameFr, ...(h.aliases ?? [])].filter(Boolean)) {
      const t = foldText(key).split(' ')[0];
      if (!t) continue;
      if (!byFirstTok.has(t)) byFirstTok.set(t, []);
      byFirstTok.get(t).push(h);
    }
  }

  const rows = (await readFile(csvPath, 'utf8')).split(/\r?\n/);
  const report = {
    matched: 0, nameFr: 0, titleFr: 0, ambiguous: [], unmatched: [], skipped: 0,
  };
  const mapping = [];
  const seen = new Set();

  for (const line of rows) {
    if (!line.trim()) continue;
    const c = parseCsvLine(line);
    const color = COLOR[(c[0] || '').trim()];
    const frName = (c[3] || '').trim();
    const frTitle = (c[4] || '').trim();
    const date = toIso(c[9]);
    if (!color || !frName) continue;

    const isDuo = /\+/.test(frName);
    const base = frName.split('+')[0].trim();
    let first = foldText(base).split(' ')[0];
    first = FR_FIRST[first] ?? first;

    let keys = [first];
    if (!byFirstTok.has(first)) {
      keys = [...byFirstTok.keys()].filter(
        (k) => lev(k, first) <= 1 && Math.abs(k.length - first.length) <= 1,
      );
    }
    let cands = [...new Map(
      keys.flatMap((k) => byFirstTok.get(k) ?? []).map((h) => [h.id, h]),
    ).values()];
    if (isDuo) {
      cands = cands.filter((h) => (h.properties ?? []).some((p) => p === 'duo' || p === 'harmonized'));
    }
    if (color && cands.some((h) => h.color === color)) cands = cands.filter((h) => h.color === color);
    if (!cands.length) { report.unmatched.push(`${frName} [${color}/${c[9]}] — 1er token « ${first} » inconnu`); continue; }

    // meilleure candidate = date de sortie la plus proche
    const scored = cands.map((h) => {
      const dd = date && h.releaseDate
        ? Math.abs((new Date(date) - new Date(h.releaseDate)) / 864e5)
        : 9e9;
      return { h, dd };
    }).sort((a, b) => a.dd - b.dd);
    const best = scored[0];
    if (best.dd > 45) {
      report.unmatched.push(`${frName} [${color}/${c[9]}] — aucune sortie catalogue à ±45j (plus proche : ${best.h.id} ${best.h.releaseDate})`);
      continue;
    }
    if (seen.has(best.h.id)) {
      report.ambiguous.push(`${frName} [${c[9]}] -> ${best.h.id} déjà pris`);
      continue;
    }
    if (scored[1] && Math.abs(scored[1].dd - best.dd) < 2 && scored[1].dd <= 45) {
      report.ambiguous.push(`${frName} [${c[9]}] -> ${best.h.id} (ou ${scored[1].h.id})`);
      continue;
    }
    seen.add(best.h.id);
    report.matched += 1;

    const h = best.h;
    const patch = overrides.patch[h.id] && typeof overrides.patch[h.id] === 'object'
      ? overrides.patch[h.id] : {};
    const fields = {};
    if (doNames && !h.nameFr && frName && !isDuo && foldText(frName) !== foldText(h.name)) {
      fields.nameFr = frName;
    }
    if (!h.titleFr && frTitle) fields.titleFr = frTitle;
    if (!Object.keys(fields).length) continue;

    if (fields.nameFr) report.nameFr += 1;
    if (fields.titleFr) report.titleFr += 1;
    overrides.patch[h.id] = { ...patch, ...fields };
    mapping.push({
      id: h.id, en: `${h.name} / ${h.title}`, nameFr: fields.nameFr ?? h.nameFr ?? '', titleFr: fields.titleFr ?? h.titleFr ?? '',
    });
  }

  // relecture
  const mapCsv = ['id,en,nameFr,titleFr']
    .concat(mapping.map((m) => [m.id, m.en, m.nameFr, m.titleFr]
      .map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')))
    .join('\n');
  const mapOut = csvPath.replace(/\.csv$/i, '') + '.frdex.mapping.csv';
  await writeFile(mapOut, `${mapCsv}\n`, 'utf8');

  console.log(`[frdex] ${report.matched} lignes appariées — +${report.nameFr} nomFR, +${report.titleFr} titreFR`);
  console.log(`[frdex] relecture -> ${mapOut}`);
  const dump = (label, arr) => {
    if (!arr.length) return;
    console.log(`\n${arr.length} ${label} :`);
    for (const x of arr.slice(0, 60)) console.log('  -', x);
    if (arr.length > 60) console.log(`  … +${arr.length - 60}`);
  };
  dump('ambigus (ignorés)', report.ambiguous);
  dump('non appariés (ignorés)', report.unmatched);

  if (!write) {
    console.log('\n(dry-run : rien écrit. relancer avec --write pour appliquer)');
    return;
  }

  await writeFile(ovUrl, `${JSON.stringify(overrides, null, 2)}\n`, 'utf8');
  const patched = applyOverrides(
    heroes.map((h) => ({ ...h })),
    overrides,
  );
  const nextCatalog = { ...catalog, heroes: patched };
  await writeFile(catUrl, `${JSON.stringify(nextCatalog, null, 2)}\n`, 'utf8');
  console.log('\n[frdex] data/heroes.overrides.json + data/heroes.json réécrits.');
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) run().catch((e) => { console.error(e); process.exit(1); });

export { foldText, toIso };
