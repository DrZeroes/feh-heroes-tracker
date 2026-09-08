// js/hero-media.mjs — chemins d'assets et couleurs pour les cartes. Pur, sans DOM.

const COLOR_HEX = { r: '#d34b4b', b: '#3b6fd4', v: '#3fae52', g: '#8a8f98' };

export function colorHex(color) {
  return COLOR_HEX[color] ?? COLOR_HEX.g;
}

export function classIconPath(hero) {
  if (!hero || !hero.color || !hero.weapon) return null;
  return `assets/icons/class-${hero.color}-${hero.weapon}.webp`;
}

export function moveIconPath(hero) {
  if (!hero || !hero.move) return null;
  return `assets/icons/move-${hero.move}.webp`;
}

export function imageCandidates(hero) {
  return [hero?.image, hero?.imageFull].filter(Boolean);
}

export function shortOrigin(name) {
  return String(name ?? '').replace(/^Fire Emblem:?\s+/, '');
}

// Étoile à afficher : la rareté du pool si connue, sinon déduite.
// GHB / Tempest Trials = unités à Orbes héroïques, base 4★. Tout le reste hors
// pool (légendaires, mythiques, duo, harmonisés, réarmés, emblèmes, aidés,
// saisonniers…) = 5★.
export function displayRarity(hero) {
  if (!hero) return null;
  if (hero.poolRarity != null) return hero.poolRarity;
  if (hero.category === 'ghb' || hero.category === 'tempest') return 4;
  return 5;
}
