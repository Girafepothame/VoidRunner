import { Asteroid } from '../model/entities/world.js';
import { Enemy } from '../model/entities/combat.js';
import { isVisibleOnScreen } from '../utils/viewport.js';

export class WorldController {
  constructor({
    getPlayer,
    getRun,
    getEnemies,
    getAsteroids,
    getScrapPickups,
    enemyDefinitions,
    dangerConfig,
    chunkSize,
    chunkManager,
    flashWaveBanner,
    spawnBossLaser,
    fireBossLaser,
  }){
    this.getPlayer = getPlayer;
    this.getRun = getRun;
    this.getEnemies = getEnemies;
    this.getAsteroids = getAsteroids;
    this.getScrapPickups = getScrapPickups;
    this.enemyDefinitions = enemyDefinitions;
    this.dangerConfig = dangerConfig;
    this.chunkSize = chunkSize;
    this.chunkManager = chunkManager;
    this.flashWaveBanner = flashWaveBanner;
    this.spawnBossLaser = spawnBossLaser;
    this.fireBossLaser = fireBossLaser;
    this.lastThreatTier = 0;
  }

  reset(){
    this.chunkManager.reset();
    this.lastThreatTier = 0;
  }

  difficultyScale(){
    const player = this.getPlayer();
    const run = this.getRun();
    const distanceDanger = player
      ? Math.hypot(player.x, player.y) / this.chunkSize * this.dangerConfig.distancePerChunk
      : 0;
    const timeDanger = run ? run.time * this.dangerConfig.timePerSecond : 0;
    const biomeDanger = run ? run.biome * this.dangerConfig.biomeBonus : 0;
    return 1 + distanceDanger + timeDanger + biomeDanger;
  }

  getMaxEnemies(){
    return Math.min(60, 8 + Math.floor(this.difficultyScale() * 6));
  }

  computeSpawnInterval(){
    return Math.max(16, Math.min(110, Math.round(110 / this.difficultyScale())));
  }

  updateSpawning(){
    const enemies = this.getEnemies();
    const run = this.getRun();
    if(enemies.length >= this.getMaxEnemies()){
      run.spawnTimer = Math.min(run.spawnTimer, 20);
      return;
    }
    run.spawnTimer--;
    if(run.spawnTimer <= 0){
      this.spawnEnemy();
      if(random() < 0.12) this.spawnAsteroid();
      run.spawnTimer = this.computeSpawnInterval();
    }
  }

  updateThreatTier(){
    const tier = Math.floor(this.difficultyScale());
    if(tier <= this.lastThreatTier) return;
    this.lastThreatTier = tier;
    this.flashWaveBanner('MENACE ' + tier);
    const enemies = this.getEnemies();
    if(tier >= 5 && tier % 5 === 0 && !enemies.some(enemy => enemy.isDreadnought)){
      this.spawnDreadnought();
    }
  }

  getSpawnPosition(margin){
    const player = this.getPlayer();
    const edge = floor(random(4));
    if(edge === 0) return { x: player.x + random(-width / 2, width / 2), y: player.y - height / 2 - margin };
    if(edge === 1) return { x: player.x + width / 2 + margin, y: player.y + random(-height / 2, height / 2) };
    if(edge === 2) return { x: player.x + random(-width / 2, width / 2), y: player.y + height / 2 + margin };
    return { x: player.x - width / 2 - margin, y: player.y + random(-height / 2, height / 2) };
  }

  spawnAsteroid(){
    const { x, y } = this.getSpawnPosition(80);
    const rewardType = random() < 0.5 ? 'xp' : 'scrap';
    const radius = random(40, 68);
    const asteroidHp = Math.round(35 + (this.difficultyScale() - 1) * 18);
    this.getAsteroids().push(new Asteroid({
      x, y,
      vx: random(-0.45, 0.45),
      vy: random(-0.45, 0.45),
      r: radius,
      hp: asteroidHp,
      maxHp: asteroidHp,
      rewardType,
      reward: Math.max(1, Math.round(radius / 8)),
      lifetime: 45 * 60,
    }));
  }

  spawnEnemy(){
    const player = this.getPlayer();
    const { x, y } = this.getSpawnPosition(100);
    const scale = this.difficultyScale();
    const roll = random();
    const type = roll < 0.2 ? 'charger' : roll < 0.35 ? 'bombardier' : 'fighter';
    const base = this.enemyDefinitions[type];
    const speedMult = 1 + (scale - 1) * 0.04;
    const desiredSpeed = base.speed * speedMult;
    const maxAllowed = player && player.speed ? player.speed * 0.75 : desiredSpeed;
    const finalSpeed = Math.min(desiredSpeed, maxAllowed);
    const dashSpeed = base.dashSpeed
      ? Math.min(base.dashSpeed * speedMult, player.speed * 2.5)
      : finalSpeed;
    this.getEnemies().push(new Enemy({
      x, y, type,
      hp: Math.max(1, base.hp * scale),
      maxHp: Math.max(1, base.hp * scale),
      speed: finalSpeed,
      r: base.radius,
      collisionRadius: base.collisionRadius,
      dmg: base.damage,
      xp: base.xp,
      color: base.color,
      score: base.score,
      aggroRange: base.aggroRange,
      behavior: base.behavior,
      warmupDuration: base.warmupDuration,
      dashDuration: base.dashDuration,
      recoveryDuration: base.recoveryDuration,
      burstDuration: base.burstDuration,
      dashSpeed,
      parts: base.parts || [],
      angle: 0,
    }));
  }

  spawnDreadnought(){
    const { x, y } = this.getSpawnPosition(140);
    const base = this.enemyDefinitions.dreadnought;
    const scale = this.difficultyScale();
    this.getEnemies().push(new Enemy({
      x, y, type: 'boss', isDreadnought: true,
      hp: Math.max(1, base.hp * scale),
      maxHp: Math.max(1, base.hp * scale),
      speed: base.speed,
      r: base.radius,
      collisionRadius: base.collisionRadius,
      dmg: base.damage,
      xp: base.xp,
      color: base.color,
      score: base.score,
      aggroRange: base.aggroRange,
      parts: base.parts,
      bossAttackStart: this.spawnBossLaser,
      bossAttackFire: this.fireBossLaser,
      laserOriginOffset: base.radius + 20,
      angle: 0,
    }));
    this.flashWaveBanner('DREADNOUGHT');
  }

  updateChunks(){
    const player = this.getPlayer();
    const asteroids = this.getAsteroids();
    const scrapPickups = this.getScrapPickups();
    const { spawnedAsteroids, spawnedPickups, unloadedKeys } = this.chunkManager.update(player.x, player.y);
    if(spawnedAsteroids.length) asteroids.push(...spawnedAsteroids);
    if(spawnedPickups.length) scrapPickups.push(...spawnedPickups);
    if(!unloadedKeys.length) return;

    const unloadedSet = new Set(unloadedKeys);
    this.removeByChunkKey(asteroids, unloadedSet);
    this.removeByChunkKey(scrapPickups, unloadedSet);
  }

  removeByChunkKey(entities, unloadedKeys){
    for(let i = entities.length - 1; i >= 0; i--){
      if(entities[i]._chunkKey && unloadedKeys.has(entities[i]._chunkKey)) entities.splice(i, 1);
    }
  }

  updateEnemies(){
    const enemies = this.getEnemies();
    const player = this.getPlayer();
    const asteroids = this.getAsteroids();
    for(const enemy of enemies){
      enemy.flockX = enemy.x;
      enemy.flockY = enemy.y;
    }
    for(const enemy of enemies){
      enemy.update(player, asteroids, enemies);
    }
  }

  updateAsteroids(cameraX, cameraY){
    const asteroids = this.getAsteroids();
    const player = this.getPlayer();
    for(let i = asteroids.length - 1; i >= 0; i--){
      const asteroid = asteroids[i];
      if(asteroid.lifetime > 0){
        asteroid.lifetime--;
        if(asteroid.lifetime === 0){ asteroids.splice(i, 1); continue; }
      }
      if(!asteroid._chunkKey
        || isVisibleOnScreen(asteroid, cameraX, cameraY, width, height, Math.max(width, height))){
        asteroid.update();
      }
      if(!asteroid._chunkKey){
        const dx = asteroid.x - player.x, dy = asteroid.y - player.y;
        if(dx * dx + dy * dy > 3000 * 3000) asteroids.splice(i, 1);
      }
    }
  }
}
