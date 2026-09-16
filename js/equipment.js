// equipment.js — Modèle de données pour les objets équipables (drones,
// réacteurs, coques) : rareté, génération aléatoire, et calcul des bonus de
// stats appliqués au joueur. Module pur (aucune dépendance p5/DOM) pour
// rester simple à tester et réutiliser (UI, debug, drops...).

export const RARITIES = [
  { id: 'common',    name: 'Commun',     color: '#9fb0c9', weight: 100, statMult: [0.85, 1.05] },
  { id: 'rare',      name: 'Rare',       color: '#39ffb0', weight: 42,  statMult: [1.05, 1.3]  },
  { id: 'epic',      name: 'Épique',     color: '#b46bff', weight: 14,  statMult: [1.3, 1.65]  },
  { id: 'legendary', name: 'Légendaire', color: '#ffb84f', weight: 4,   statMult: [1.65, 2.1]  },
];

export function rarityById(id){ return RARITIES.find(r => r.id === id) || RARITIES[0]; }

// Plus le danger de la run est élevé (voir difficultyScale() dans
// gameplay.js — distance à l'origine + temps de survie), plus les raretés
// hautes sont favorisées : chaque palier au-dessus du précédent est boosté
// un peu plus fort. Cohérent avec le thème "plus loin/plus longtemps =
// meilleur loot" du système de danger continu.
export function rollRarity(dangerScale = 1){
  const boost = Math.max(0, dangerScale - 1);
  let total = 0;
  const weighted = RARITIES.map((rarity, index) => {
    const weight = rarity.weight * (1 + boost * index * 0.55);
    total += weight;
    return { rarity, weight };
  });
  let roll = Math.random() * total;
  for(const entry of weighted){
    if(roll < entry.weight) return entry.rarity;
    roll -= entry.weight;
  }
  return weighted[weighted.length - 1].rarity;
}

// Catégories d'équipement : chacune correspond à un groupe de slots sur le
// vaisseau, et sait générer ses stats à partir d'un multiplicateur de
// rareté (mult ~1 = bas de la plage "commun", mult ~2 = haut de la plage
// "légendaire").
export const EQUIPMENT_CATEGORIES = {
  drone: {
    label: 'Drone',
    icon: '▸',
    rollStats: (mult) => ({
      dmgMult: +(0.5 * mult).toFixed(2),
      fireRate: Math.max(18, Math.round(46 / mult)),
    }),
    describe: (stats) => `Tourelle ${stats.dmgMult.toFixed(2)}× dégâts, cadence ${stats.fireRate}f`,
  },
  reactor: {
    label: 'Réacteur',
    icon: '◉',
    rollStats: (mult) => ({
      boostRegen: +(0.5 * mult).toFixed(2),
      speedBonus: +(0.06 * (mult - 1)).toFixed(3),
    }),
    describe: (stats) => `+${stats.boostRegen.toFixed(2)} régén. boost, +${Math.round(stats.speedBonus*100)}% vitesse`,
  },
  hull: {
    label: 'Coque',
    icon: '⛨',
    rollStats: (mult) => ({
      maxHpBonus: Math.round(12 * mult),
      regen: +(0.15 * mult).toFixed(2),
    }),
    describe: (stats) => `+${stats.maxHpBonus} PV max, +${stats.regen.toFixed(2)}/s régén.`,
  },
};

let nextEquipmentId = 1;

export function rollEquipment(category, dangerScale = 1){
  const def = EQUIPMENT_CATEGORIES[category];
  if(!def) return null;
  const rarity = rollRarity(dangerScale);
  const [min, max] = rarity.statMult;
  const mult = min + Math.random() * (max - min);
  return {
    id: 'eq' + (nextEquipmentId++),
    category,
    rarityId: rarity.id,
    stats: def.rollStats(mult),
  };
}

// Recalcule intégralement les stats dérivées de l'équipement à partir du
// loadout courant. Appelée à chaque equip/unequip — jamais de mutation
// destructive/cumulative comme l'ancien système de mods permanents
// (MOD_DEFS.apply()) : ici on peut toujours retirer un objet et retrouver
// exactement les stats d'avant.
export function recomputeEquipmentStats(player){
  let maxHpBonus = 0, regen = 0, boostRegenBonus = 0, speedBonus = 0;
  for(const item of player.loadout.hull){
    if(!item) continue;
    maxHpBonus += item.stats.maxHpBonus || 0;
    regen += item.stats.regen || 0;
  }
  for(const item of player.loadout.reactor){
    if(!item) continue;
    boostRegenBonus += item.stats.boostRegen || 0;
    speedBonus += item.stats.speedBonus || 0;
  }
  const previousMaxHp = player.maxHp;
  player.maxHp = player.baseMaxHp + maxHpBonus;
  // Une augmentation de PV max (équipement) soigne d'autant ; un retrait ne
  // blesse jamais le joueur, il réduit juste le plafond.
  const delta = player.maxHp - previousMaxHp;
  player.hp = delta > 0 ? Math.min(player.maxHp, player.hp + delta) : Math.min(player.hp, player.maxHp);
  player.regen = regen;
  player.boostRegenBonus = boostRegenBonus;
  player.speed = player.baseSpeed * (1 + speedBonus);
}