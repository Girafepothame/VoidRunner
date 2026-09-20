// Compatibility facade for the entity model.
// New code should import classes from js/model/entities/* directly.
export { Player } from './model/entities/player.js';
export { Bullet } from './model/entities/projectile.js';
export { Enemy } from './model/entities/combat.js';
export { Asteroid } from './model/entities/world.js';
export { Orb, ScrapPickup, EquipmentPickup } from './model/entities/pickups.js';
export { Drone, Orbital, Turret } from './model/entities/support.js';
export { HyperPortal, Particle, Shockwave } from './model/entities/effects.js';
