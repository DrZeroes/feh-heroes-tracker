// scripts/lib/locale.mjs — construit un index d'épithètes FR depuis les dumps de messages. Pur.

// Séparateur name/title dans les clés composites : U+001F (Unit Separator), improbable dans un texte.
const SEP = String.fromCharCode(0x1f);
const APOSTROPHES = /[‘’ʼ]/g;

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
    .replace(APOSTROPHES, "'")
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${norm(name)}${SEP}${norm(title)}`;
}

export function buildFrTitleIndex(enMsg, frMsg) {
  const exact = new Map();
  const norm = new Map();
  const nameByEn = new Map(); // nom EN -> nom FR (quand il diffère)
  for (const key of Object.keys(enMsg)) {
    if (!key.startsWith('MPID_') || key.startsWith('MPID_HONOR_')) continue;
    const jp = key.slice('MPID_'.length);
    const enName = enMsg[key];
    const frName = frMsg[key];
    if (enName && frName && frName !== enName && !nameByEn.has(enName)) {
      nameByEn.set(enName, frName);
    }
    const enHonor = enMsg[`MPID_HONOR_${jp}`];
    const frHonor = frMsg[`MPID_HONOR_${jp}`];
    if (!enName || !enHonor || !frHonor) continue;
    exact.set(`${enName}${SEP}${enHonor}`, frHonor);
    norm.set(normalizeTitleKey(enName, enHonor), frHonor);
  }
  return { exact, norm, nameByEn };
}

export function frNameFor(name, index) {
  return index.nameByEn.get(name) ?? null;
}

export function frTitleFor(name, title, index) {
  return (
    index.exact.get(`${name}${SEP}${title}`)
    ?? index.norm.get(normalizeTitleKey(name, title))
    ?? null
  );
}
