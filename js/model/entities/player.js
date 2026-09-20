import { SLOT_DEFS, SHIP_PROFILES } from '../../meta.js';
import gameData from '../../data/game.json' with { type: 'json' };

export class Player {
  constructor(x=0,y=0,profileId='standard'){
    this.x = x || width/2; this.y = y || height/2; this.angle = -HALF_PI;
    const profile = SHIP_PROFILES[profileId] || SHIP_PROFILES.standard;
    this.profileId = SHIP_PROFILES[profileId] ? profileId : 'standard';
    this.profile = profile;
    this.baseSpeed = profile.speed; this.speed = profile.speed;
    this.vx = 0; this.vy = 0;
    this.baseMaxHp = 100; this.hp = 100; this.maxHp = 100;
    this.core = gameData.playerArmor.core;
    this.armorRotation = (gameData.playerArmor.rotationDegrees || 0) * Math.PI / 180;
    this.armor = Object.entries(gameData.playerArmor.parts).map(([id, shape]) => ({
      id,
      shape,
      hp: gameData.playerArmor.plateHp,
      maxHp: gameData.playerArmor.plateHp,
      respawnTimer: 0,
    }));
    this.fireCooldown = 0; this.fireRate = profile.fireRate;
    this.dmg = profile.dmg; this.dmgPerLevel = 0; this.lastDamageGain = 0; this.bulletSpeed = 50; this.bulletLength = 24; this.bulletSize = 3;
    this.multishot = profile.multishot; this.pierce = 0; this.critChance = 0.05; this.regen = 0; this.boostRegenBonus = 0;
    this.magnet = 60; this.explosive = false;
    this.explosionRadius = 42; this.explosionDamage = 0.2;
    this.ricochet = 0; this.chainLightning = 0; this.laserLevel = 0;
    this.droneCount = 0; this.orbitalCount = 0; this.orbitalDamage = 4;
    this.dashDamage = 0; this.lowHpDamage = 0; this.revive = 0;
    this.lives = 0; this.invuln = 0; this.level = 1; this.xp = 0; this.xpNeeded = 6;
    this.thrust = 0; this.upgradeCounts = {};
    this.lastMoveDirection = 'z';
    this.shipOpening = 0;
    this.boost = 100; this.boostMax = 100;
    this.dashCooldownTimer = 0;
    this.dashTimer = 0;
    this.dashDuration = 10;
    this.dashDistance = 0;
    this.dashAngle = 0;
    this.dashProgress = 0;
    this.dashAppliedDistance = 0;
    this.loadout = {
      drone: new Array(SLOT_DEFS.drone.max).fill(null),
      reactor: new Array(SLOT_DEFS.reactor.max).fill(null),
      hull: new Array(SLOT_DEFS.hull.max).fill(null),
    };
    this.inventory = new Array(5).fill(null);
  }
}
