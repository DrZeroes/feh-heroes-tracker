// scripts/lib/locale.mjs — construit un index d'épithètes FR depuis les dumps de messages. Pur.

export function indexMessages(entries) {
  const out = {};
  for (const e of entries ?? []) {
    if (e && typeof e.key === 'string') out[e.key] = e.value;
  }
  return out;
}

export function normalizeTitleKey(name, title) {
  const norm = (s) => String(s ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${norm(name)}${norm(title)}`;
}

export function buildFrTitleIndex(enMsg, frMsg) {
  const exact = new Map();
  const norm = new Map();
  for (const key of Object.keys(enMsg)) {
    if (!key.startsWith('MPID_') || key.startsWith('MPID_HONOR_')) continue;
    const jp = key.slice('MPID_'.length);
    const enName = enMsg[key];
    const enHonor = enMsg[`MPID_HONOR_${jp}`];
    const frHonor = frMsg[`MPID_HONOR_${jp}`];
    if (!enName || !enHonor || !frHonor) continue;
    exact.set(`${enName}${enHonor}`, frHonor);
    norm.set(normalizeTitleKey(enName, enHonor), frHonor);
  }
  return { exact, norm };
}

export function frTitleFor(name, title, index) {
  return (
    index.exact.get(`${name}${title}`)
    ?? index.norm.get(normalizeTitleKey(name, title))
    ?? null
  );
}
