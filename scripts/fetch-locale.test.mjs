import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './fetch-locale.mjs';

test('run résout titleFr pour les héros du catalogue et écrit locale-fr.json', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'feh-locale-'));
  const catalogPath = path.join(dir, 'heroes.json');
  await writeFile(catalogPath, JSON.stringify({
    heroes: [
      { name: 'Eliwood', title: 'Pledged Friend' },
      { name: 'Anna', title: "Commander 'n Chief" },
      { name: 'Brandnew', title: 'Not In Dump' },
    ],
  }), 'utf8');
  const outPath = path.join(dir, 'locale-fr.json');

  // fetchImpl route : /contents -> liste ; raw USEN/EUFR -> contenu
  const enFile = [
    { key: 'MPID_e', value: 'Eliwood' }, { key: 'MPID_HONOR_e', value: 'Pledged Friend' },
    { key: 'MPID_a', value: 'Anna' }, { key: 'MPID_HONOR_a', value: 'Commander \u2019n Chief' },
  ];
  const frFile = [
    { key: 'MPID_HONOR_e', value: 'Ami loyal' },
    { key: 'MPID_HONOR_a', value: 'Cheffe en chef' },
  ];
  const fetchImpl = async (url) => {
    if (url.includes('api.github.com') && url.includes('USEN')) {
      return { ok: true, status: 200, json: async () => [{ name: 'D.json', download_url: 'https://raw/USEN/D.json' }] };
    }
    if (url.includes('api.github.com') && url.includes('EUFR')) {
      return { ok: true, status: 200, json: async () => [{ name: 'D.json', download_url: 'https://raw/EUFR/D.json' }] };
    }
    if (url === 'https://raw/USEN/D.json') return { ok: true, status: 200, json: async () => enFile };
    if (url === 'https://raw/EUFR/D.json') return { ok: true, status: 200, json: async () => frFile };
    throw new Error(`unexpected url ${url}`);
  };

  const res = await run({ fetchImpl, sleepImpl: async () => {}, pauseMs: 0, catalogPath, outPath });
  assert.equal(res.matched, 2);
  assert.equal(res.missed, 1);
  const written = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(written.titles['Eliwood\u001fPledged Friend'], 'Ami loyal');
  assert.equal(written.titles["Anna\u001fCommander 'n Chief"], 'Cheffe en chef');
  assert.equal(Object.keys(written.titles).length, 2);
});
