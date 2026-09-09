// scripts/build-hero-dex.mjs — one-shot : produit data/hero-dex.json à partir
// d'un « heroesDex » CSV perso (colonne « # » = numéro du Recueil des Héros).
//
//   node scripts/build-hero-dex.mjs <heroesDex.csv> [--write]
//
// L'ordre du Recueil (in-game) = jeu, puis personnage, puis ordre de sortie des
// alts. On se contente de reprendre le numéro tel quel : il porte déjà ce tri.
// Sans --write : dry-run.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const COLOR = { r: 'r', b: 'b', v: 'v', g: 'g' };
const FR_FIRST = {
  alphonse: 'alfonse', chrys: 'chrom', daraen: 'robin', linfan: 'morgan',
  eltoshan: 'eldigan', sylvia: 'silvia', lakche: 'larcei', scaith: 'skasaher',
  delmud: 'diarmuid', asaello: 'asvel', tinny: 'tine', travant: 'travant',
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

async function run() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith('--'));
  const write = args.includes('--write');
  if (!csvPath) {
    console.error('usage: node scripts/build-hero-dex.mjs <heroesDex.csv> [--write]');
    process.exit(1);
  }

  const outUrl = new URL('../data/hero-dex.json', import.meta.url);
  const catalog = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8'));
  const heroes = catalog.heroes;

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
  const dex = {};
  const seen = new Set();
  const unmatched = [];
  let matched = 0;

  for (const line of rows) {
    if (!line.trim()) continue;
    const c = parseCsvLine(line);
    const color = COLOR[(c[0] || '').trim()];
    const frName = (c[3] || '').trim();
    const date = toIso(c[9]);
    const num = /^\d+$/.test((c[10] || '').trim()) ? Number(c[10].trim()) : null;
    if (!color || !frName || num == null) continue;

    const isDuo = /\+/.test(frName);
    let first = foldText(frName.split('+')[0].trim()).split(' ')[0];
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
    if (!cands.length) { unmatched.push(`#${num} ${frName} [${color}/${c[9]}]`); continue; }

    const scored = cands.map((h) => ({
      h,
      dd: date && h.releaseDate ? Math.abs((new Date(date) - new Date(h.releaseDate)) / 864e5) : 9e9,
    })).sort((a, b) => a.dd - b.dd);
    const best = scored[0];
    if (best.dd > 45 || seen.has(best.h.id)) { unmatched.push(`#${num} ${frName} [${color}/${c[9]}]`); continue; }
    if (scored[1] && Math.abs(scored[1].dd - best.dd) < 2 && scored[1].dd <= 45) {
      unmatched.push(`#${num} ${frName} [${color}/${c[9]}] (ambigu)`);
      continue;
    }
    seen.add(best.h.id);
    dex[best.h.id] = num;
    matched += 1;
  }

  const ordered = Object.fromEntries(
    Object.entries(dex).sort((a, b) => a[1] - b[1]),
  );
  console.log(`[hero-dex] ${matched} héros numérotés, ${unmatched.length} lignes ignorées`);
  for (const u of unmatched.slice(0, 40)) console.log('  -', u);
  if (unmatched.length > 40) console.log(`  … +${unmatched.length - 40}`);

  if (!write) { console.log('\n(dry-run : relancer avec --write)'); return; }
  await writeFile(outUrl, `${JSON.stringify(ordered, null, 0)}\n`, 'utf8');
  console.log(`\n[hero-dex] écrit data/hero-dex.json (${Object.keys(ordered).length} entrées)`);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) run().catch((e) => { console.error(e); process.exit(1); });

export { foldText, toIso };
