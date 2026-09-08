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
