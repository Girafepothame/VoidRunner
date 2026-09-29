// META definitions and upgrade pools
import gameData from './data/game.json' with { type: 'json' };

export const SHIP_PROFILES = gameData.ships;

export const LEVEL_UP_DEFS = [
  { id:'dmg', name:'Noyau de Puissance', icon:'◈', desc:'+1 dégât', max:8, apply:p=>{ p.dmg += 1; } },
  { id:'explosive', name:'Charge Explosive', icon:'✹', desc:'Active les dégâts de zone sur les impacts', max:1, apply:p=>{ p.explosive = true; } },
  { id:'magnet', name:'Bobine Magnétique', icon:'◉', desc:'+40% rayon de collecte', max:5, apply:p=>{ p.magnet *= 1.4; } },
];

export const EXPLOSION_SUB_DEFS = [
  { id:'explosiveRadius', name:'Fragmentation Large', icon:'⊚', desc:'+12% rayon de l’explosion', max:5, apply:p=>{ p.explosionRadius *= 1.12; } },
  { id:'explosiveDamage', name:'Charge Instable', icon:'⊛', desc:'+5% dégâts de l’explosion', max:5, apply:p=>{ p.explosionDamage += 0.05; } },
];

export let meta = { scrap: 0 };

export default { SHIP_PROFILES, LEVEL_UP_DEFS, EXPLOSION_SUB_DEFS, meta };