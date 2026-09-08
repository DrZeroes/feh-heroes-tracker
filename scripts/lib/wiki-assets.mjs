// scripts/lib/wiki-assets.mjs — noms de fichiers wiki des icônes classe / déplacement.
const COLOR_NAME = { r: 'Red', b: 'Blue', v: 'Green', g: 'Colorless' };
const WEAPON_NAME = {
  sword: 'Sword', lance: 'Lance', axe: 'Axe', bow: 'Bow', dagger: 'Dagger',
  tome: 'Tome', staff: 'Staff', breath: 'Breath', beast: 'Beast',
};
const MOVE_NAME = { infantry: 'Infantry', cavalry: 'Cavalry', flying: 'Flying', armored: 'Armored' };

export function classIconFile(color, weapon) {
  const c = COLOR_NAME[color];
  const w = WEAPON_NAME[weapon];
  return c && w ? `Icon_Class_${c}_${w}.png` : null;
}

export function moveIconFile(move) {
  const m = MOVE_NAME[move];
  return m ? `Icon_Move_${m}.png` : null;
}

export function assetName(kind, a, b) {
  return kind === 'class' ? `class-${a}-${b}.webp` : `move-${a}.webp`;
}

export function collectIconSpecs(heroes) {
  const byAsset = new Map();
  for (const h of heroes) {
    const mv = moveIconFile(h.move);
    if (mv) byAsset.set(assetName('move', h.move), { wikiFile: mv, assetFile: assetName('move', h.move) });
    const cl = classIconFile(h.color, h.weapon);
    if (cl) {
      byAsset.set(assetName('class', h.color, h.weapon), {
        wikiFile: cl, assetFile: assetName('class', h.color, h.weapon),
      });
    }
  }
  return [...byAsset.values()].sort((x, y) => x.assetFile.localeCompare(y.assetFile));
}
