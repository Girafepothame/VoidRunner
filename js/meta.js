// META definitions and upgrade pools
export const SHIP_PROFILES = {
  standard: {
    name:'Éclaireur', tagline:'Profil équilibré', details:'Vitesse et cadence standard',
    speed:5, fireRate:16, dmg:10, multishot:1, magazine:3,
    color:[255,255,255], shape:[[24,0],[0,11],[-11,0],[0,-11]],
  },
};

export const MOD_DEFS = [
  { id:'turretRight', name:'Tourelle droite', icon:'▸', desc:'Tourelle latérale automatique visant le curseur', max:1, common:true, shopCost:1500, apply:p=>{ p.turretRight += 1; } },
  { id:'turretLeft', name:'Tourelle gauche', icon:'◂', desc:'Tourelle latérale automatique visant le curseur', max:1, common:true, shopCost:1500, apply:p=>{ p.turretLeft += 1; } },
];

export const LEVEL_STAT_GROWTH = {
  maxHp: 10,
  dmg: 1,
  fireRate: 1,
  minFireRate: 4,
  magazine: 1,
  magazineEvery: 5,
};

export const LEVEL_UP_DEFS = [
  { id:'dmg', name:'Noyau de Puissance', icon:'◈', desc:'+1 dégât gagné à chaque niveau', max:8, apply:p=>{ p.dmgPerLevel += 1; } },
  { id:'explosive', name:'Charge Explosive', icon:'✹', desc:'Active les dégâts de zone sur les impacts', max:1, apply:p=>{ p.explosive = true; } },
  { id:'magnet', name:'Bobine Magnétique', icon:'◉', desc:'+40% rayon de collecte', max:5, apply:p=>{ p.magnet *= 1.4; } },
];

export const EXPLOSION_SUB_DEFS = [
  { id:'explosiveRadius', name:'Fragmentation Large', icon:'⊚', desc:'+12% rayon de l’explosion', max:5, apply:p=>{ p.explosionRadius *= 1.12; } },
  { id:'explosiveDamage', name:'Charge Instable', icon:'⊛', desc:'+5% dégâts de l’explosion', max:5, apply:p=>{ p.explosionDamage += 0.05; } },
];

export let meta = { scrap: 0, mods: {} };
MOD_DEFS.forEach(mod => { meta.mods[mod.id] = 0; });

export function modCost(mod){ return mod.shopCost; }

export default { MOD_DEFS, LEVEL_UP_DEFS, EXPLOSION_SUB_DEFS, meta, modCost };
