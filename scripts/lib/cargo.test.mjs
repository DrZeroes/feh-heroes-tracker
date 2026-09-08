import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargoQuery } from './cargo.mjs';

const resp = (payload, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => payload,
});
const noSleep = async () => {};

test('cargoQuery pagine jusqu\'à une page courte', async () => {
  const pages = [
    { cargoquery: Array.from({ length: 2 }, (_, i) => ({ title: { Name: `A${i}` } })) },
    { cargoquery: [{ title: { Name: 'B0' } }] },
  ];
  let call = 0;
  const fetchImpl = async () => resp(pages[call++]);
  const rows = await cargoQuery({
    table: 'Units', fields: 'Name', limit: 2, fetchImpl, sleepImpl: noSleep, pauseMs: 0,
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[2], { Name: 'B0' });
});

test('cargoQuery retente sur ratelimited puis réussit', async () => {
  const seq = [
    { error: { code: 'ratelimited', info: 'slow down' } },
    { cargoquery: [{ title: { Name: 'ok' } }] },
  ];
  let call = 0;
  const fetchImpl = async () => resp(seq[call++]);
  const rows = await cargoQuery({
    table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0, maxRetries: 3,
  });
  assert.deepEqual(rows, [{ Name: 'ok' }]);
});

test('cargoQuery jette après maxRetries', async () => {
  const fetchImpl = async () => resp({ error: { code: 'ratelimited' } });
  await assert.rejects(
    cargoQuery({ table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0, maxRetries: 2 }),
    /ratelimited/,
  );
});

test('cargoQuery jette sur une autre erreur Cargo', async () => {
  const fetchImpl = async () => resp({ error: { code: 'badquery', info: 'nope' } });
  await assert.rejects(
    cargoQuery({ table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0 }),
    /badquery/,
  );
});

test('cargoQuery retire les clés __precision', async () => {
  const fetchImpl = async () => resp({
    cargoquery: [{ title: { StartTime: '2026-01-01 00:00:00', StartTime__precision: 0 } }],
  });
  const rows = await cargoQuery({
    table: 'X', fields: 'StartTime', limit: 500, fetchImpl, sleepImpl: noSleep, pauseMs: 0,
  });
  assert.deepEqual(rows, [{ StartTime: '2026-01-01 00:00:00' }]);
});

test('cargoQuery retente sur HTTP 500 puis jette', async () => {
  const fetchImpl = async () => resp({ garbage: true }, 500);
  await assert.rejects(
    cargoQuery({
      table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0, maxRetries: 2,
    }),
    /HTTP 500/,
  );
});

test('cargoQuery retente sur HTTP 429 sans corps exploitable puis jette', async () => {
  const fetchImpl = async () => resp({ servedBy: 'node-1' }, 429);
  await assert.rejects(
    cargoQuery({
      table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0, maxRetries: 2,
    }),
    /HTTP 429/,
  );
});

test('cargoQuery jette immédiatement sur HTTP 404 (un seul appel)', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return resp({ nope: true }, 404); };
  await assert.rejects(
    cargoQuery({
      table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0, maxRetries: 5,
    }),
    /HTTP 404/,
  );
  assert.equal(calls, 1);
});

test('cargoQuery jette sur HTTP 200 malformé (ni error ni cargoquery)', async () => {
  const fetchImpl = async () => resp({ servedBy: 'x' }, 200);
  await assert.rejects(
    cargoQuery({ table: 'Units', fields: 'Name', fetchImpl, sleepImpl: noSleep, pauseMs: 0 }),
    /malformed/,
  );
});

test('cargoQuery construit une URL Cargo correcte', async () => {
  let seen;
  const fetchImpl = async (url) => { seen = url; return resp({ cargoquery: [] }); };
  await cargoQuery({
    table: 'Units', fields: '_pageName=Page,LegendaryEffect', orderBy: 'StartTime DESC',
    fetchImpl, sleepImpl: noSleep, pauseMs: 0,
  });
  const u = new URL(seen);
  assert.equal(u.searchParams.get('action'), 'cargoquery');
  assert.equal(u.searchParams.get('format'), 'json');
  assert.equal(u.searchParams.get('tables'), 'Units');
  assert.equal(u.searchParams.get('fields'), '_pageName=Page,LegendaryEffect');
  assert.equal(u.searchParams.get('order_by'), 'StartTime DESC');
});
