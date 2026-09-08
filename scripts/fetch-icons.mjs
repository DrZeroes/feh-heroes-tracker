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
