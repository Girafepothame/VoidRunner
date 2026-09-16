// META definitions and upgrade pools
import gameData from './data/game.json' with { type: 'json' };

export const SHIP_PROFILES = gameData.ships;

// Emplacements d'équipement débloquables en meta-progression (à l'atelier,
// contre du scrap). L'équipement lui-même (les objets qui remplissent ces
// emplacements, voir equipment.js) ne persiste JAMAIS entre les runs — seul
// le NOMBRE d'emplacements disponibles est une progression permanente.
// "drone" reprend l'ancien système de tourelles latérales (gauche/droite).
export const SLOT_DEFS = gameData.slots;

export const LEVEL_STAT_GROWTH = gameData.levelGrowth;

export const LEVEL_UP_DEFS = [
  { id:'dmg', name:'Noyau de Puissance', icon:'◈', desc:'+1 dégât gagné à chaque niveau', max:8, apply:p=>{ p.dmgPerLevel += 1; } },
  { id:'explosive', name:'Charge Explosive', icon:'✹', desc:'Active les dégâts de zone sur les impacts', max:1, apply:p=>{ p.explosive = true; } },
  { id:'magnet', name:'Bobine Magnétique', icon:'◉', desc:'+40% rayon de collecte', max:5, apply:p=>{ p.magnet *= 1.4; } },
];

export const EXPLOSION_SUB_DEFS = [
  { id:'explosiveRadius', name:'Fragmentation Large', icon:'⊚', desc:'+12% rayon de l’explosion', max:5, apply:p=>{ p.explosionRadius *= 1.12; } },
  { id:'explosiveDamage', name:'Charge Instable', icon:'⊛', desc:'+5% dégâts de l’explosion', max:5, apply:p=>{ p.explosionDamage += 0.05; } },
];

export let meta = { scrap: 0, unlockedSlots: { drone: 0, reactor: 0, hull: 0 } };

// Coût du prochain slot à débloquer pour une catégorie, ou null si déjà au max.
export function nextSlotCost(category){
  const def = SLOT_DEFS[category];
  if(!def) return null;
  const index = meta.unlockedSlots[category] || 0;
  return index < def.max ? def.costs[index] : null;
}

export function unlockSlot(category){
  const cost = nextSlotCost(category);
  if(cost === null || meta.scrap < cost) return false;
  meta.scrap -= cost;
  meta.unlockedSlots[category] = (meta.unlockedSlots[category] || 0) + 1;
  return true;
}

export default { SHIP_PROFILES, SLOT_DEFS, LEVEL_UP_DEFS, EXPLOSION_SUB_DEFS, meta, nextSlotCost, unlockSlot };