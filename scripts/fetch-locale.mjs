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
