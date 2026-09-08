// scripts/lib/cargo.mjs
// Client Cargo API du wiki FEH : pagination + anti-rate-limit. fetch/sleep injectables.

const API = 'https://feheroes.fandom.com/api.php';
const DEFAULT_UA = 'feh-collection-tracker/1.0 (+https://github.com/) catalog updater';
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl({ table, fields, orderBy, where, limit, offset }) {
  const parts = [
    'action=cargoquery',
    'format=json',
    `tables=${encodeURIComponent(table)}`,
    `fields=${encodeURIComponent(fields)}`,
    `limit=${limit}`,
    `offset=${offset}`,
  ];
  if (orderBy) parts.push(`order_by=${encodeURIComponent(orderBy)}`);
  if (where) parts.push(`where=${encodeURIComponent(where)}`);
  return `${API}?${parts.join('&')}`;
}

function stripPrecision(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.endsWith('__precision')) continue;
    out[k] = v;
  }
  return out;
}

export async function cargoQuery({
  table,
  fields,
  orderBy = '',
  where = '',
  limit = 500,
  fetchImpl = globalThis.fetch,
  sleepImpl = defaultSleep,
  pauseMs = 2500,
  maxRetries = 5,
  timeoutMs = 30000,
  userAgent = DEFAULT_UA,
}) {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = buildUrl({ table, fields, orderBy, where, limit, offset });
    let page = null;
    let attempt = 0;
    for (;;) {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        if (res.status === 429 || res.status === 503 || res.status >= 500) {
          attempt += 1;
          if (attempt > maxRetries) {
            throw new Error(
              `Cargo HTTP ${res.status} on ${table} (offset ${offset}) after ${maxRetries} retries`,
            );
          }
          await sleepImpl(pauseMs * 2 ** attempt);
          continue;
        }
        throw new Error(`Cargo HTTP ${res.status} on ${table} (offset ${offset})`);
      }
      const json = await res.json();
      if (json.error && json.error.code === 'ratelimited') {
        attempt += 1;
        if (attempt > maxRetries) {
          throw new Error(
            `Cargo ratelimited on ${table} (offset ${offset}) after ${maxRetries} retries`,
          );
        }
        await sleepImpl(pauseMs * 2 ** attempt);
        continue;
      }
      if (json.error) {
        throw new Error(`Cargo error on ${table}: ${JSON.stringify(json.error)}`);
      }
      if (!Array.isArray(json.cargoquery)) {
        throw new Error(
          `Cargo malformed response on ${table} (offset ${offset}): no cargoquery array`,
        );
      }
      page = json.cargoquery.map((e) => stripPrecision(e.title ?? {}));
      break;
    }
    all.push(...page);
    if (page.length < limit) break;
    offset += limit;
    await sleepImpl(pauseMs);
  }
  return all;
}
