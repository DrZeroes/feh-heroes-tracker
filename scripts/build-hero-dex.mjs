// scripts/build-hero-dex.mjs — régénère data/hero-dex.json (numéro du Recueil des
// Héros, ordre in-game) depuis les clés de tri du jeu exposées par le wiki FEH
// (Units.GameSort / Units.CharSort). Aucune donnée perso, aucun entretien manuel.
//
//   node scripts/build-hero-dex.mjs [--write]
//
// Sans --write : dry-run (affiche le décompte, n'écrit rien).
// fetch-heroes.mjs fait déjà ça à chaque regen hebdo ; ce script sert à
// rafraîchir le numéro seul (ex. juste après la sortie de nouveaux héros).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cargoQuery } from './lib/cargo.mjs';

async function run({ fetchImpl = globalThis.fetch } = {}) {
  const write = process.argv.includes('--write');
  const outUrl = new URL('../data/hero-dex.json', import.meta.url);
  const { heroes } = JSON.parse(await readFile(new URL('../data/heroes.json', import.meta.url), 'utf8'));

  const units = await cargoQuery({
    table: 'Units', fields: 'WikiName,GameSort,CharSort,ReleaseDate', fetchImpl,
  });
  const meta = new Map();
  for (const u of units) {
    const g = Number.parseInt(u.GameSort, 10);
    const c = Number.parseInt(u.CharSort, 10);
    if (Number.isFinite(g)) meta.set(u.WikiName, { g, c: Number.isFinite(c) ? c : 0 });
  }

  const ordered = heroes
    .filter((h) => meta.has(h.id))
    .sort((a, b) => {
      const A = meta.get(a.id); const B = meta.get(b.id);
      return A.g - B.g || A.c - B.c
        || String(a.releaseDate).localeCompare(String(b.releaseDate))
        || String(a.name).localeCompare(String(b.name));
    });
  const dex = {};
  ordered.forEach((h, i) => { dex[h.id] = i + 1; });

  const missing = heroes.filter((h) => !meta.has(h.id));
  console.log(`[hero-dex] ${units.length} unités wiki, ${Object.keys(dex).length} héros numérotés, ${missing.length} sans GameSort`);
  for (const h of missing.slice(0, 20)) console.log(`  - ${h.id}`);
  if (missing.length > 20) console.log(`  … +${missing.length - 20}`);

  if (!write) { console.log('\n(dry-run : relancer avec --write)'); return dex; }
  await writeFile(outUrl, `${JSON.stringify(dex)}\n`, 'utf8');
  console.log(`\n[hero-dex] écrit data/hero-dex.json`);
  return dex;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) run().catch((e) => { console.error(e); process.exit(1); });

export { run };
