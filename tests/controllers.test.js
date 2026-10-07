import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatController } from '../js/gameplay/combat-controller.js';
import { PlayerController } from '../js/gameplay/player-controller.js';
import { PlayerWeaponController } from '../js/gameplay/player-weapon-controller.js';
import { ProgressionController } from '../js/gameplay/progression-controller.js';
import { WorldController } from '../js/gameplay/world-controller.js';
import { LEVEL_UP_DEFS } from '../js/meta.js';

function createPlayer(overrides = {}){
  return {
    x: 0,
    y: 0,
    angle: 0,
    turnVelocity: 0,
    vx: 0,
    vy: 0,
    speed: 10,
    boost: 100,
    boostMax: 100,
    boostRegenBonus: 0,
    dashCooldownTimer: 0,
    dashTimer: 0,
    dashDamage: 0,
    lastMoveDirection: 'z',
    invuln: 0,
    hp: 100,
    maxHp: 100,
    armor: [],
    armorRotation: 0,
    dmg: 10,
    chainLightning: 0,
    explosionRadius: 20,
    explosionDamage: 0.2,
    xp: 0,
    xpNeeded: 100,
    level: 1,
    upgradeCounts: {},
    magnet: 20,
    fireCooldown: 0,
    fireRate: 5,
    wingRecoil: 0,
    ammo: 3,
    magazineSize: 3,
    reloadDuration: 3,
    reloadTimer: 0,
    multishot: 2,
    bulletSize: 3,
    critChance: 0.1,
    lowHpDamage: 0,
    pierce: 0,
    bulletSpeed: 20,
    explosive: false,
    bulletLength: 24,
    ricochet: 0,
    laserLevel: 1,
    ...overrides,
  };
}

function createCombatController({
  player = createPlayer(),
  run = { score: 0, kills: 0 },
  bullets = [],
  enemyBullets = [],
  enemies = [],
  asteroids = [],
  armorShape = [],
  spawnXpOrbs = () => {},
  spawnGoldOrbs = () => {},
} = {}){
  const bursts = [];
  const recharged = [];
  const controller = new CombatController({
    getPlayer: () => player,
    getRun: () => run,
    getBullets: () => bullets,
    getEnemyBullets: () => enemyBullets,
    getEnemies: () => enemies,
    getAsteroids: () => asteroids,
    getLightningArcs: () => [],
    getShockwaves: () => [],
    spawnBurst: (...args) => bursts.push(args),
    spawnPickupsFrom: () => {},
    spawnXpOrbs,
    spawnGoldOrbs,
    isOutsideScreen: () => false,
    getPlayerPlateShape: () => armorShape,
    isInRange: (first, second, range) => (first.x - second.x) ** 2 + (first.y - second.y) ** 2 < range ** 2,
    createColor: (...components) => components,
    rechargeDashFull: () => recharged.push('full'),
    rechargeDashPercent: (_player, fraction) => recharged.push(fraction),
  });
  return { controller, player, run, bullets, enemies, asteroids, bursts, recharged };
}

test('player controller accelerates and applies dash distance incrementally', () => {
  const bursts = [];
  const shakes = [];
  const controller = new PlayerController({
    getEnemies: () => [],
    getEnemyBullets: () => [],
    damageEnemy: () => {},
    spawnBurst: (...args) => bursts.push(args),
    triggerShake: (...args) => shakes.push(args),
    createColor: (...components) => components,
  });
  const player = createPlayer();

  controller.applyDirectionalMovement(player, { z: true });
  assert.equal(player.vx, 0.52);
  assert.equal(player.x, 0.52);

  controller.requestDash(player, 'd');
  assert.equal(player.dashTimer, 4);
  assert.equal(player.dashCooldownTimer, 240);
  controller.updateMovement(player, {}, false);
  assert.ok(Math.abs(player.x - 0.52) < 1e-9);
  assert.equal(player.y, 90);
  assert.deepEqual(shakes, [[4, 6]]);
  assert.equal(bursts.length, 2);
});

test('player controller advances trail lifetimes during simulation updates', () => {
  const controller = new PlayerController({
    getEnemies: () => [],
    getEnemyBullets: () => [],
    damageEnemy: () => {},
    spawnBurst: () => {},
    triggerShake: () => {},
    createColor: (...components) => components,
  });
  const player = createPlayer({
    trailPoints: [{ x: 0, y: 0, age: 0 }],
    wingTrailPoints: [[{ x: 0, y: 0, age: 0 }], []],
    vx: 1,
    boosting: true,
  });

  controller.updateTrails(player, 0);
  assert.equal(player.trailPoints[0].age, 1);
  assert.equal(player.wingTrailPoints[0][0].age, 1);
  assert.equal(player.showWingTrails, true);

  controller.updateTrails(player, 0);
  assert.equal(player.trailPoints[0].age, 2);
  assert.equal(player.wingTrailPoints[0][0].age, 2);
});

test('world controller computes difficulty and synchronizes chunk entities', () => {
  const player = { x: 300, y: 400 };
  const run = { time: 60, biome: 2, spawnTimer: 40 };
  const asteroids = [{ _chunkKey: 'old' }];
  const scrapPickups = [{ _chunkKey: 'old' }];
  const spawnedAsteroid = { _chunkKey: 'new' };
  const spawnedPickup = { _chunkKey: 'new' };
  const chunkManager = {
    resetCalled: false,
    reset(){ this.resetCalled = true; },
    update: () => ({
      spawnedAsteroids: [spawnedAsteroid],
      spawnedPickups: [spawnedPickup],
      unloadedKeys: ['old'],
    }),
  };
  const controller = new WorldController({
    getPlayer: () => player,
    getRun: () => run,
    getEnemies: () => [],
    getAsteroids: () => asteroids,
    getScrapPickups: () => scrapPickups,
    enemyDefinitions: {},
    dangerConfig: { distancePerChunk: 0.1, timePerSecond: 0.01, biomeBonus: 0.5 },
    chunkSize: 100,
    chunkManager,
    flashWaveBanner: () => {},
    spawnBossLaser: () => {},
    fireBossLaser: () => {},
  });

  assert.equal(controller.difficultyScale(), 3.1);
  assert.equal(controller.getMaxEnemies(), 26);
  assert.equal(controller.computeSpawnInterval(), 35);
  controller.updateChunks();
  assert.deepEqual(asteroids, [spawnedAsteroid]);
  assert.deepEqual(scrapPickups, [spawnedPickup]);
  controller.reset();
  assert.equal(chunkManager.resetCalled, true);
});

test('combat controller resolves projectile and asteroid damage rewards', () => {
  const enemy = { x: 5, y: 0, r: 5, hp: 1, maxHp: 1, score: 10, dmg: 10, color: [1, 2, 3] };
  const bullet = {
    x: 10,
    y: 0,
    previousX: 0,
    previousY: 0,
    size: 2,
    dmg: 1,
    pierce: 0,
    ricochets: 0,
    hitTargets: new Set(),
    crit: false,
    explosive: false,
  };
  const asteroid = { x: 200, y: 0, r: 20, hp: 1, rewardType: 'xp', reward: 2 };
  let xpReward = 0;
  const context = createCombatController({
    player: createPlayer({ x: -100 }),
    bullets: [bullet],
    enemies: [enemy],
    asteroids: [asteroid],
    spawnXpOrbs: (_x, _y, amount) => { xpReward += amount; },
  });

  context.controller.checkCollisions();
  assert.equal(context.enemies.length, 0);
  assert.equal(context.bullets.length, 0);
  assert.equal(context.run.score, 10);
  assert.equal(context.run.kills, 1);
  assert.deepEqual(context.recharged, [0.2]);

  assert.equal(context.controller.damageAsteroid(asteroid, 1), true);
  assert.equal(context.asteroids.length, 0);
  assert.equal(context.run.score, 18);
  assert.equal(xpReward, 2);
});

test('combat controller checks swept projectiles against player armor', () => {
  const context = createCombatController({
    player: createPlayer({ armor: [{}] }),
    armorShape: [[-5, -5], [5, -5], [5, 5], [-5, 5]],
  });

  assert.equal(context.controller.damagePlayerAtProjectile({
    previousX: -10,
    previousY: 0,
    x: 10,
    y: 0,
  }, 12), true);
  assert.equal(context.player.hp, 88);
});

test('progression controller spawns and collects rewards, then applies level-ups', () => {
  const player = createPlayer();
  const run = { score: 0, scrapEarned: 0 };
  const xpOrbs = [];
  const scrapPickups = [];
  const meta = { scrap: 7 };
  let levelUpCount = 0;
  const random = (...args) => args.length === 0 ? 0.1 : args.length === 1 ? 0 : args[0];
  const controller = new ProgressionController({
    getPlayer: () => player,
    getRun: () => run,
    getXpOrbs: () => xpOrbs,
    getScrapPickups: () => scrapPickups,
    meta,
    isInRange: () => true,
    random,
    cos: () => 1,
    sin: () => 0,
    twoPi: () => Math.PI * 2,
    onLevelUp: () => levelUpCount++,
  });

  controller.spawnPickupsFrom({ x: 0, y: 0, maxHp: 10, dmg: 8, score: 10, xp: 3 });
  assert.equal(xpOrbs.length, 3);
  assert.equal(scrapPickups.reduce((sum, pickup) => sum + pickup.amount, 0), 4);
  controller.updatePickups();
  assert.equal(player.xp, 3);
  assert.equal(run.scrapEarned, 4);
  assert.equal(run.score, 29);

  player.xp = 9;
  player.xpNeeded = 10;
  assert.equal(controller.gainXp(4), true);
  assert.equal(player.level, 2);
  assert.equal(player.xp, 3);
  assert.equal(player.xpNeeded, 12);
  assert.equal(levelUpCount, 1);

  const choices = controller.getLevelUpChoices();
  assert.ok(choices.length > 0 && choices.length <= 3);
  const regularUpgrade = choices.find(upgrade => upgrade.id !== 'explosive');
  assert.ok(regularUpgrade);
  assert.equal(controller.applyUpgrade(regularUpgrade), true);
  const explosiveUpgrade = LEVEL_UP_DEFS.find(upgrade => upgrade.id === 'explosive');
  assert.equal(controller.applyUpgrade(explosiveUpgrade), true);
  assert.equal(controller.applyUpgrade(explosiveUpgrade), false);
  assert.equal(controller.settleRunRewards(), 4);
  assert.equal(meta.scrap, 11);
});

test('weapon controller handles aim lock, firing, reload timing and laser hits', () => {
  const enemy = { x: 100, y: 0, r: 8 };
  const asteroid = { x: 200, y: 0, r: 20 };
  const bullets = [];
  const damages = [];
  let laserDraws = 0;
  const player = createPlayer();
  const controller = new PlayerWeaponController({
    getEnemies: () => [enemy],
    getAsteroids: () => [asteroid],
    getBullets: () => bullets,
    damageEnemy: (target, damage) => damages.push([target, damage]),
    damageAsteroid: (target, damage) => damages.push([target, damage]),
    random: () => 0,
    cos: Math.cos,
    sin: Math.sin,
    drawLaser: () => laserDraws++,
  });

  controller.setRightMouseDown(true);
  for(let frame = 0; frame < 45; frame++) controller.updateAim(player, [enemy], 100, 0);
  assert.equal(controller.getAimRenderState().target, enemy);
  assert.equal(controller.getAimRenderState().locked, true);
  assert.equal(controller.getAimRenderState().lockCharge, 45);

  assert.equal(controller.firePlayerBullets('playing', player), true);
  assert.equal(bullets.length, 2);
  assert.equal(player.ammo, 1);
  assert.ok(bullets.every(bullet => bullet.crit));
  assert.equal(controller.firePlayerBullets('menu', player), true);
  assert.equal(player.ammo, 0);
  assert.equal(player.reloadTimer, 0);
  assert.equal(controller.requestReload('playing', player), true);
  for(let frame = 0; frame < player.reloadDuration; frame++) controller.updateTimers(player);
  assert.equal(player.ammo, player.magazineSize);

  controller.fireLaser(player);
  assert.equal(laserDraws, 1);
  assert.equal(damages.length, 2);
  controller.setRightMouseDown(false);
  controller.updateAim(player, [enemy], 100, 0);
  assert.equal(controller.getAimRenderState().target, null);
});

test('laser damages every aligned target even when earlier targets are removed', () => {
  const enemies = [
    { x: 100, y: 0, r: 8 },
    { x: 200, y: 0, r: 8 },
  ];
  const asteroids = [
    { x: 300, y: 0, r: 20 },
    { x: 400, y: 0, r: 20 },
  ];
  const targets = [...enemies, ...asteroids];
  const damaged = [];
  const player = createPlayer({ laserLevel: 1 });
  const controller = new PlayerWeaponController({
    getEnemies: () => enemies,
    getAsteroids: () => asteroids,
    getBullets: () => [],
    damageEnemy: target => {
      damaged.push(target);
      enemies.splice(enemies.indexOf(target), 1);
    },
    damageAsteroid: target => {
      damaged.push(target);
      asteroids.splice(asteroids.indexOf(target), 1);
    },
    random: () => 0,
    cos: Math.cos,
    sin: Math.sin,
    drawLaser: () => {},
  });

  controller.fireLaser(player);

  assert.equal(damaged.length, targets.length);
  assert.deepEqual(new Set(damaged), new Set(targets));
  assert.equal(enemies.length, 0);
  assert.equal(asteroids.length, 0);
});
