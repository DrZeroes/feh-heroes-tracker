// js/unit-stats.mjs - stats niveau 40 d'un exemplaire (5★, sans arme ni compétences).
// Pur, sans DOM. `hero.stats` = { base: [PV, Atq, Vit, Déf, Rés] niv. 1 5★, growth: [taux %] }.
//
// Règles du jeu :
//  - croissance niv. 1→40 = floor(39 × floor(taux × 1,14) / 100) en 5★ ;
//  - atout : +1 niv. 1 et +5 % de taux ; faille : −1 et −5 % ;
//  - la 1re fusion efface la faille ; un exemplaire neutre (ni atout ni faille)
//    y gagne en plus +1 aux 3 premières stats de l'ordre ;
//  - chaque fusion : +1 aux 2 stats suivantes de l'ordre (cyclique) ;
//  - chaque fleur : +1 à la stat suivante de l'ordre (cyclique) ;
//  - ordre = stats niv. 1 (avec atout/faille actifs) décroissantes, égalité PV>Atq>Vit>Déf>Rés.

export const STAT_KEYS = ['hp', 'atk', 'spd', 'def', 'res'];

const validArr = (a) => Array.isArray(a) && a.length === 5 && a.every(Number.isFinite);

export function lv40Stats(hero, unit) {
  const s = hero?.stats;
  if (!s || !validArr(s.base) || !validArr(s.growth)) return null;
  const u = unit || {};
  if (u.rarity != null && Number(u.rarity) !== 5) return null;

  const merges = Math.max(0, Math.min(10, Math.floor(Number(u.merges) || 0)));
  const flowers = Math.max(0, Math.floor(Number(u.dragonflowers) || 0));
  const plus = STAT_KEYS.indexOf(u.ivPlus);
  let minus = STAT_KEYS.indexOf(u.ivMinus);
  if (minus === plus) minus = -1;
  const neutral = plus < 0 && minus < 0;
  if (merges > 0) minus = -1;

  const lv1 = s.base.map((v, i) => v + (i === plus) - (i === minus));
  const gr = s.growth.map((v, i) => v + 5 * (i === plus) - 5 * (i === minus));
  const out = lv1.map((v, i) => v + Math.floor((39 * Math.floor((gr[i] * 114) / 100)) / 100));

  const order = [0, 1, 2, 3, 4].sort((a, b) => lv1[b] - lv1[a] || a - b);
  if (neutral && merges > 0) for (let k = 0; k < 3; k++) out[order[k]] += 1;
  for (let k = 0; k < merges * 2; k++) out[order[k % 5]] += 1;
  for (let k = 0; k < flowers; k++) out[order[k % 5]] += 1;

  return { stats: out, total: out.reduce((a, b) => a + b, 0) };
}
