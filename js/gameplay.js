import { Player, Bullet, Enemy, Asteroid, Particle, Shockwave, Orb, ScrapPickup, Turret, Drone, Orbital } from './entities.js';
import { EXPLOSION_SUB_DEFS, LEVEL_STAT_GROWTH, LEVEL_UP_DEFS, meta } from './meta.js';
import { showScreen, flashWaveBanner } from './ui.js';
import { chunkManager } from './chunks.js';

// Gameplay state and logic: spawning, updates, collisions, particles
export let gameState = 'menu'; // menu, playing, paused, levelup, gameover, shop
export let shopReturnState = 'menu';
export let player, run;
export let bullets = [], enemyBullets = [], enemies = [], asteroids = [], xpOrbs = [], scrapPickups = [], particles = [], shockwaves = [], lightningArcs = [];
export let drones = [], orbitals = [], turrets = [];
export let keys = {};
export let waveBannerTimer = 0;
export let currentCards = [];
// NOTE: WORLD_W / WORLD_H ne servent plus à borner le monde (celui-ci est
// désormais infini, généré par chunks). Conservés uniquement si d'autres
// fichiers (ex: ui.js, minimap) s'y réfèrent encore — vérifie ces usages.
export let WORLD_W = 24000;
export let WORLD_H = 16000;
export let camX = 0, camY = 0;

// Wave banner timer accessors to avoid assigning to module namespace
export function setWaveBannerTimer(n){ waveBannerTimer = n; }
export function getWaveBannerTimer(){ return waveBannerTimer; }
export function tickWaveBannerTimer(){ if(waveBannerTimer>0) waveBannerTimer--; return waveBannerTimer; }

// accessors for state vars that other modules may change
export function setShopReturnState(v){ shopReturnState = v; }
export function setGameState(s){ gameState = s; }
export function getShopReturnState(){ return shopReturnState; }

export function togglePlayerMode(){
  if(!player) return;
  player.mode = player.mode === 'folded' ? 'combat' : 'folded';
  player.thrust = 0;
}

export function pauseRun(){
  if(gameState !== 'playing') return;
  gameState = 'paused';
  showScreen('pause-screen');
  const hud = document.getElementById('hud'); if(hud) hud.classList.add('hidden');
}

export function resumeRun(){
  if(gameState !== 'paused') return;
  gameState = 'playing';
  showScreen(null);
  const hud = document.getElementById('hud'); if(hud) hud.classList.remove('hidden');
}

export function quitToMenu(){
  if(gameState !== 'paused') return;
  gameState = 'menu';
  showScreen('menu-screen');
  const hud = document.getElementById('hud'); if(hud) hud.classList.add('hidden');
}

export function drawEnemies(){
  for(const enemy of enemies) enemy.draw();
}

export function drawPlayerShip(){
  const pl = player; if(!pl) return;
  const profile = pl.profile;
  push(); translate(pl.x, pl.y); rotate(pl.angle);
  const flicker = pl.invuln>0 && frameCount%10<5;
  stroke(flicker ? color(255,150,0) : color(profile.color[0],profile.color[1],profile.color[2]));
  strokeWeight(2); fill(13,20,36, flicker?100:220); beginShape();
  profile.shape.forEach(([x,y]) => vertex(x,y));
  endShape(CLOSE);
  pop();
}

export function makePlayer(profileId='standard'){
  // Le joueur démarre à l'origine du monde (0,0) : c'est aussi le point de
  // référence utilisé par les chunks pour calculer la distance/difficulté.
  return new Player(0, 0, profileId);
}

export function startRun(profileId='standard'){
  camX = 0; camY = 0;
  player = makePlayer(profileId);
  run = { time:0, wave:1, kills:0, score:0, scrapEarned:0, spawnTimer:1, waveTotal:0, waveSpawned:0, interWaveTimer:0 };
  bullets=[]; enemyBullets=[]; enemies=[]; asteroids=[]; xpOrbs=[]; scrapPickups=[]; particles=[]; shockwaves=[]; lightningArcs=[];
  chunkManager.reset(); // repart d'un monde vierge à chaque nouvelle run
  drones = Array.from({ length: player.droneCount }, (_, i) => new Drone(i * TWO_PI / Math.max(1, player.droneCount)));
  orbitals = Array.from({ length: player.orbitalCount }, (_, i) => new Orbital(i * TWO_PI / Math.max(1, player.orbitalCount)));
  turrets = createTurrets();
  beginWave();
  gameState = 'playing';
  showScreen(null);
  document.getElementById('hud').classList.remove('hidden');
}

export function endRun(){
  gameState = 'gameover';
  const earned = run.scrapEarned;
  run.scrapEarned = earned;
  meta.scrap += earned;
  const goScore = document.getElementById('go-score'); if(goScore) goScore.innerText = run.score;
  const goScrap = document.getElementById('go-scrap'); if(goScrap) goScrap.innerText = '+'+earned;
  const hud = document.getElementById('hud'); if(hud) hud.classList.add('hidden');
  showScreen('gameover-screen');
}

export function beginWave(){
  run.waveTotal = 4 + run.wave * 2;
  run.waveSpawned = 0;
  run.spawnTimer = 1;
  flashWaveBanner('VAGUE ' + run.wave);
}

export function updateRun(){
  run.time += 1/60;
  updatePlayer();
  updateWaveState();
  updateWorld();
  completeWaveIfNeeded();
  handlePlayerDefeat();
}

export function updatePlayer(){
  updateCameraAndAim();
  updateMovement();
  updatePlayerResources();
  handlePlayerWeapons();
}

function updateWaveState(){
  if(run.interWaveTimer <= 0){ handleSpawning(); return; }
  run.interWaveTimer--;
  if(run.interWaveTimer === 0){ run.wave++; beginWave(); }
}

function updateWorld(){
  updateChunks();
  updateEnemies(); updateAsteroids(); updateDrones();
  updateOrbitals(); updateTurrets(); updateBullets(); updateEnemyBullets(); updateOrbs();
  updateParticles(); updateShockwaves(); checkCollisions();
}

// Charge/décharge les chunks autour du joueur et synchronise leurs entités
// (astéroïdes, caches de scrap) avec les tableaux globaux du jeu.
function updateChunks(){
  const { spawnedAsteroids, spawnedPickups, unloadedKeys } = chunkManager.update(player.x, player.y);

  if(spawnedAsteroids.length) asteroids.push(...spawnedAsteroids);
  if(spawnedPickups.length) scrapPickups.push(...spawnedPickups);

  if(unloadedKeys.length){
    const unloadedSet = new Set(unloadedKeys);
    removeByChunkKey(asteroids, unloadedSet);
    removeByChunkKey(scrapPickups, unloadedSet);
  }
}

function removeByChunkKey(list, unloadedSet){
  for(let i=list.length-1;i>=0;i--){
    if(list[i]._chunkKey && unloadedSet.has(list[i]._chunkKey)) list.splice(i, 1);
  }
}

function completeWaveIfNeeded(){
  const waveComplete = run.interWaveTimer === 0 && run.waveSpawned >= run.waveTotal && enemies.length === 0;
  if(waveComplete){ run.interWaveTimer = 180; flashWaveBanner('VAGUE TERMINEE'); }
}

function handlePlayerDefeat(){
  if(player.hp > 0) return;
  if(player.lives > 0){
    player.lives--; player.hp = player.maxHp; player.invuln = 90;
    spawnBurst(player.x, player.y, color(79,217,255), 26);
  } else if(player.revive > 0){
    player.revive--; player.hp = player.maxHp * 0.35; player.invuln = 120;
    spawnBurst(player.x, player.y, color(255,184,79), 36);
  } else {
    spawnBurst(player.x, player.y, color(255,79,126), 40);
    endRun();
  }
}

function updateCameraAndAim(){
  // Monde infini : la caméra suit simplement le joueur, sans être clampée
  // dans des bornes de monde fixes.
  camX = player.x - width/2;
  camY = player.y - height/2;
  const targetAngle = atan2(mouseY + camY - player.y, mouseX + camX - player.x);
  let delta = targetAngle - player.angle;
  while(delta > PI) delta -= TWO_PI;
  while(delta < -PI) delta += TWO_PI;
  player.angle += constrain(delta, -0.22, 0.22);
}

function updateMovement(){
  if(player.mode === 'folded') updateFoldedMovement();
  else updateCombatMovement();
}

function updateFoldedMovement(){
  const forward = keys['z'] ? 1 : (keys['s'] ? -0.32 : 0);
  const boosting = keys['shift'] && player.boost > 0 && forward > 0;
  const speed = player.speed * (boosting ? 2.8 : 1);
  player.x += Math.cos(player.angle) * forward * speed;
  player.y += Math.sin(player.angle) * forward * speed;
  updateDash();
  player.boost = boosting ? Math.max(0, player.boost - 1.8) : Math.min(player.boostMax, player.boost + 0.65);
  player.thrust = forward > 0 ? (boosting ? 1.5 : 1) : forward < 0 ? 0.35 : 0;
}

function updateCombatMovement(){
  const horizontal = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['q'] || keys['arrowleft'] ? 1 : 0);
  const vertical = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['z'] || keys['arrowup'] ? 1 : 0);
  const length = Math.hypot(horizontal, vertical) || 1;
  player.x += horizontal / length * player.speed;
  player.y += vertical / length * player.speed;
  player.boost = Math.min(player.boostMax, player.boost + 0.65);
  player.thrust = Math.min(1, Math.abs(horizontal) + Math.abs(vertical));
}

function updateDash(){
  if(player.dashCooldown > 0) player.dashCooldown--;
  if(player.dashTimer <= 0){ startDashIfRequested(); return; }
  player.dashProgress = Math.min(1, player.dashProgress + 1 / player.dashDuration);
  const easedProgress = 1 - Math.pow(1 - player.dashProgress, 4);
  const distance = lerp(0, player.dashDistance, easedProgress);
  const step = distance - player.dashAppliedDistance;
  player.x += Math.cos(player.dashAngle) * step;
  player.y += Math.sin(player.dashAngle) * step;
  player.dashAppliedDistance = distance;
  player.dashTimer--; player.dashHitTimer--;
  if(player.dashHitTimer <= 0){
    for(const enemy of enemies.slice()){
      if(Math.hypot(enemy.x-player.x, enemy.y-player.y) < enemy.r + 18) damageEnemy(enemy, player.dashDamage);
    }
    player.dashHitTimer = 4;
  }
}

function startDashIfRequested(){
  if(player.dashCooldown > 0) return;
  const direction = keys['d'] ? 1 : (keys['q'] ? -1 : 0);
  if(direction === 0) return;
  player.dashAngle = player.angle + HALF_PI * direction;
  player.dashDistance = player.speed * 9;
  player.dashProgress = 0; player.dashAppliedDistance = 0;
  player.dashTimer = player.dashDuration; player.dashHitTimer = 0; player.dashCooldown = 45;
}

function updatePlayerResources(){
  if(player.regen > 0 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + player.regen / 60);
  if(player.invuln > 0) player.invuln--;
  if(player.fireCooldown > 0) player.fireCooldown--;
  if(player.reloadTimer > 0){
    player.reloadTimer--;
    if(player.reloadTimer === 0) player.ammo = player.maxAmmo;
  }
}

function handlePlayerWeapons(){
  const firing = mouseIsPressed || keys[' '];
  if(firing && !player.triggerHeld && player.fireCooldown <= 0 && player.reloadTimer <= 0 && player.ammo > 0){
    firePlayerBullets();
    player.ammo--;
    player.fireCooldown = player.fireRate;
    if(player.ammo === 0) player.reloadTimer = player.reloadDuration;
  }
  player.triggerHeld = firing;
  if(player.laserLevel > 0 && firing) fireLaser();
}

export function firePlayerBullets(){
  const n = player.multishot;
  const spacing = Math.max(8, player.bulletSize * 1.8);
  for(let i=0;i<n;i++){
    const lateral = (i - (n-1)/2) * spacing;
    const isCrit = random() < player.critChance;
    const launchX = player.x + cos(player.angle)*20 - sin(player.angle)*lateral;
    const launchY = player.y + sin(player.angle)*20 + cos(player.angle)*lateral;
    const damage = player.dmg * (isCrit?2:1) * (player.hp < player.maxHp*0.3 ? 1 + player.lowHpDamage : 1);
    const bullet = new Bullet(launchX, launchY, cos(player.angle)*player.bulletSpeed, sin(player.angle)*player.bulletSpeed, damage, isCrit, player.pierce, player.bulletSize, player.explosive, player.bulletLength);
    bullet.ricochets = player.ricochet;
    bullets.push(bullet);
  }
}

export function fireLaser(){
  const range = 520;
  stroke(255,220,120,170); strokeWeight(2 + player.laserLevel); line(player.x, player.y, player.x + cos(player.angle)*range, player.y + sin(player.angle)*range);
  for(const enemy of enemies){
    const dx = enemy.x-player.x, dy = enemy.y-player.y;
    const forward = dx*cos(player.angle) + dy*sin(player.angle);
    const side = Math.abs(dx*sin(player.angle) - dy*cos(player.angle));
    if(forward > 0 && forward < range && side < enemy.r + 5) damageEnemy(enemy, player.dmg * (0.08 + player.laserLevel*0.035));
  }
  for(const asteroid of asteroids){
    const dx = asteroid.x-player.x, dy = asteroid.y-player.y;
    const forward = dx*cos(player.angle) + dy*sin(player.angle);
    const side = Math.abs(dx*sin(player.angle) - dy*cos(player.angle));
    if(forward > 0 && forward < range && side < asteroid.r + 5) damageAsteroid(asteroid, player.dmg * (0.08 + player.laserLevel*0.035));
  }
}

export function triggerChainLightning(source){
  if(player.chainLightning <= 0) return;
  const target = enemies.find(enemy => enemy !== source && Math.hypot(enemy.x-source.x, enemy.y-source.y) < 120);
  if(!target) return;
  damageEnemy(target, player.dmg * 0.35 * player.chainLightning);
  lightningArcs.push({ source, target, life: 8, maxLife: 8 });
}

export function updateDrones(){
  for(const drone of drones) drone.update(player, enemies, bullets);
}
function createTurrets(){
  const result = [];
  if(player.turretRight > 0) result.push(new Turret(1));
  if(player.turretLeft > 0) result.push(new Turret(-1));
  return result;
}
export function refreshTurrets(){
  turrets = createTurrets();
}
function updateTurrets(){
  const targetX = mouseX + camX;
  const targetY = mouseY + camY;
  for(const turret of turrets) turret.update(player, targetX, targetY, bullets);
}
export function updateOrbitals(){
  for(const orbital of orbitals){
    orbital.update(player);
    for(const enemy of enemies){
      if(isInRange(orbital, enemy, enemy.r + 7)) damageEnemy(enemy, player.orbitalDamage/60);
    }
  }
}

export function difficultyScale(){ return 1 + (run.wave-1)*0.18; }
export function handleSpawning(){
  if(run.waveSpawned >= run.waveTotal) return;
  run.spawnTimer--;
  if(run.spawnTimer <= 0){
    run.spawnTimer = 90;
    spawnEnemy();
    if(random() < 0.35) spawnAsteroid();
    run.waveSpawned++;
  }
}

export function spawnAsteroid(){
  // Monde infini : les positions de spawn sont relatives au joueur uniquement,
  // plus besoin de les clamper dans WORLD_W/WORLD_H.
  const edge = floor(random(4)); let x, y;
  const margin = 80;
  if(edge===0){ x=player.x + random(-width/2, width/2); y=player.y-height/2-margin; }
  else if(edge===1){ x=player.x+width/2+margin; y=player.y+random(-height/2, height/2); }
  else if(edge===2){ x=player.x + random(-width/2, width/2); y=player.y+height/2+margin; }
  else { x=player.x-width/2-margin; y=player.y+random(-height/2, height/2); }
  const rewardType = random() < 0.5 ? 'xp' : 'scrap';
  const radius = random(20, 34);
  asteroids.push(new Asteroid({ x, y, vx:random(-0.45, 0.45), vy:random(-0.45, 0.45), r:radius,
    hp:Math.round(10 + run.wave * 2), maxHp:Math.round(10 + run.wave * 2), rewardType,
    reward:Math.max(1, Math.round(radius / 8)) }));
}

export function spawnEnemy(){
  const edge = floor(random(4)); let x,y;
  const margin = 100;
  if(edge===0){ x=player.x + random(-width/2,width/2); y=player.y-height/2-margin; }
  else if(edge===1){ x=player.x+width/2+margin; y=player.y+random(-height/2,height/2); }
  else if(edge===2){ x=player.x + random(-width/2,width/2); y=player.y+height/2+margin; }
  else { x=player.x-width/2-margin; y=player.y+random(-height/2,height/2); }
  const roll = random(); let type = 'chaser'; if(run.wave>=2 && roll<0.28) type='shooter'; else if(run.wave>=3 && roll<0.5) type='zigzag';
  const scale = difficultyScale();
  // reduced base speeds and gentler difficulty scaling to slow enemies
  // base speeds lowered; final speed capped relative to player speed so enemies cannot match/overrun player
  const base = { chaser: { hp: 10, speed: 1.0, r: 13, dmg: 10, xp:1, color:[255,79,126], score:10 }, shooter:{ hp: 14, speed: 0.7, r: 15, dmg: 8, xp:3, color:[255,140,80], score:16 }, zigzag: { hp: 6,  speed: 1.2, r: 9, dmg: 8, xp:2, color:[190,100,255], score:14 }, }[type];
  const speedMult = 1 + (scale - 1) * 0.04; // gentler scaling
  const desiredSpeed = base.speed * speedMult;
  const maxAllowed = (player && player.speed) ? player.speed * 0.75 : desiredSpeed; // keep enemies slower than player
  const finalSpeed = Math.min(desiredSpeed, maxAllowed);
  enemies.push(new Enemy({ x,y, type, hp: Math.max(1, base.hp*scale), maxHp: Math.max(1, base.hp*scale), speed: finalSpeed, r: base.r, dmg: base.dmg, xp: base.xp, color: base.color, score: base.score, fireCooldown: random(60,120), phase: random(TWO_PI), angle:0 }));
}

export function updateEnemies(){ for(const e of enemies) e.update(player, run, enemyBullets); }
export function updateAsteroids(){
  for(let i=asteroids.length-1;i>=0;i--){
    const asteroid = asteroids[i];
    asteroid.update();
    // Les astéroïdes issus d'un chunk sont retirés quand leur chunk se
    // décharge (voir updateChunks). Ceux de vague (sans _chunkKey) sont
    // nettoyés s'ils dérivent trop loin du joueur.
    if(!asteroid._chunkKey && isFarFromPlayer(asteroid, 3000)) asteroids.splice(i, 1);
  }
}

export function updateBullets(){
  for(let i=bullets.length-1;i>=0;i--){
    const bullet = bullets[i];
    bullet.update(enemies);
    if(bullet.ricochetCooldown > 0) bullet.ricochetCooldown--;
    if(isOutsideScreen(bullet, 20)) bullets.splice(i, 1);
  }
}

function isInRange(first, second, range){
  return Math.hypot(first.x-second.x, first.y-second.y) < range;
}

function isFarFromPlayer(entity, maxDist){
  return Math.hypot(entity.x - player.x, entity.y - player.y) > maxDist;
}

function isOutsideScreen(entity, margin){
  return entity.x < camX - margin || entity.x > camX + width + margin
    || entity.y < camY - margin || entity.y > camY + height + margin;
}

export function updateEnemyBullets(){
  for(let i=enemyBullets.length-1;i>=0;i--){
    const bullet = enemyBullets[i];
    bullet.update();
    if(isOutsideScreen(bullet, 40)){ enemyBullets.splice(i, 1); continue; }
    if(!isInRange(bullet, player, bullet.size + 13)) continue;
    if(player.invuln <= 0) damagePlayerWithBullet(bullet, i);
  }
}

function damagePlayerWithBullet(bullet, index){
  player.hp -= bullet.dmg; player.invuln = 40;
  enemyBullets.splice(index, 1);
  spawnBurst(bullet.x, bullet.y, color(255,120,140), 8);
}

export function drawBullets(){ noStroke(); for(const b of bullets) b.draw(); for(const b of enemyBullets){ fill(255,110,140); circle(b.x,b.y,b.size); } }

export function spawnPickupsFrom(e){
  const strength = getEnemyStrength(e);
  const xpOrbCount = Math.max(1, Math.round((e.xp || 1) * strength));
  spawnXpOrbs(e.x, e.y, xpOrbCount);
  if(random() < 0.32) spawnGoldOrbs(e.x, e.y, Math.max(1, Math.round(2 + strength * 2)));
}

function spawnXpOrbs(x, y, count){
  for(let i=0;i<count;i++){
    const angle = random(TWO_PI);
    const distance = random(4, 14);
    xpOrbs.push(new Orb(x + cos(angle) * distance, y + sin(angle) * distance, 1));
  }
}

function spawnGoldOrbs(x, y, amount){
  const denominations = [10, 5, 3, 1];
  let remaining = amount;
  let index = 0;
  while(remaining > 0){
    const value = denominations[index] <= remaining ? denominations[index] : denominations[denominations.length - 1];
    const angle = random(TWO_PI);
    const distance = random(4, 14);
    scrapPickups.push(new ScrapPickup(x + cos(angle) * distance, y + sin(angle) * distance, value));
    remaining -= value;
    if(denominations[index] > remaining && index < denominations.length - 1) index++;
  }
}

function getEnemyStrength(enemy){
  const healthFactor = enemy.maxHp / 10;
  const damageFactor = enemy.dmg / 8;
  const scoreFactor = enemy.score / 10;
  return Math.max(1, (healthFactor + damageFactor + scoreFactor) / 3);
}

export function updateOrbs(){
  collectXpOrbs();
  collectScrapPickups();
}
function collectXpOrbs(){
  for(let i=xpOrbs.length-1;i>=0;i--){
    const orb = xpOrbs[i]; orb.update(player);
    if(isInRange(orb, player, 16)){ gainXp(orb.amount); xpOrbs.splice(i, 1); }
  }
}
function collectScrapPickups(){
  for(let i=scrapPickups.length-1;i>=0;i--){
    const pickup = scrapPickups[i]; pickup.update(player);
    if(isInRange(pickup, player, 16)){ run.scrapEarned += pickup.amount; run.score += pickup.amount * 5; scrapPickups.splice(i, 1); }
  }
}
export function drawOrbs(){ for(const o of xpOrbs) o.draw(); for(const o of scrapPickups) o.draw(); }

export function gainXp(n){
  player.xp += n; run.score += 3;
  if(player.xp >= player.xpNeeded){
    player.xp -= player.xpNeeded;
    player.level += 1;
    player.maxHp += LEVEL_STAT_GROWTH.maxHp;
    player.hp = Math.min(player.maxHp, player.hp + LEVEL_STAT_GROWTH.maxHp);
    player.lastDamageGain = LEVEL_STAT_GROWTH.dmg + player.dmgPerLevel;
    player.dmg += player.lastDamageGain;
    player.fireRate = Math.max(LEVEL_STAT_GROWTH.minFireRate, player.fireRate - LEVEL_STAT_GROWTH.fireRate);
    if(player.level % LEVEL_STAT_GROWTH.magazineEvery === 0){
      player.maxAmmo += LEVEL_STAT_GROWTH.magazine;
      player.ammo = player.maxAmmo;
    }
    player.xpNeeded = Math.round(6 + player.level*3.2);
    triggerLevelUp();
  }
}

function triggerLevelUp(){
  gameState = 'levelup';
  const stats = document.getElementById('level-stats');
  if(stats){
    const previousMaxHp = player.maxHp - LEVEL_STAT_GROWTH.maxHp;
    const damageGain = player.lastDamageGain || LEVEL_STAT_GROWTH.dmg;
    const previousDmg = player.dmg - damageGain;
    const previousFireRate = player.fireRate + LEVEL_STAT_GROWTH.fireRate;
    const magazineIncrease = player.level % LEVEL_STAT_GROWTH.magazineEvery === 0 ? LEVEL_STAT_GROWTH.magazine : 0;
    const previousAmmo = player.maxAmmo - magazineIncrease;
    const magazineRow = magazineIncrease ? `<div>Chargeur <span>${previousAmmo} → ${player.maxAmmo} <b>(+${magazineIncrease})</b></span></div>` : '';
    stats.innerHTML = `<div class="level-stats-title">STATS DU VAISSEAU</div><div class="level-stats-list"><div>Coque max <span>${previousMaxHp} ➤ ${player.maxHp} <b>(+${LEVEL_STAT_GROWTH.maxHp})</b></span></div><div>Dégâts <span>${previousDmg.toFixed(1)} → ${player.dmg.toFixed(1)} <b>(+${damageGain.toFixed(1)})</b></span></div><div>Cadence <span>${previousFireRate}f → ${player.fireRate}f <b>(-${LEVEL_STAT_GROWTH.fireRate}f)</b></span></div>${magazineRow}</div>`;
  }
  const equipment = document.getElementById('level-equipment');
  if(equipment){
    equipment.innerHTML = `<div class="level-equipment-title">ÉQUIPEMENTS</div><div class="level-ship-preview"><div class="level-ship-preview-body"></div></div><div class="level-equipment-list"><div><span>Tourelles</span><b>${player.turretRight + player.turretLeft}</b></div><div><span>Drones</span><b>${player.droneCount}</b></div><div><span>Orbitaux</span><b>${player.orbitalCount}</b></div></div>`;
    const shipBody = equipment.querySelector('.level-ship-preview-body');
    const shape = player.profile.shape;
    const xValues = shape.map(([x]) => x);
    const yValues = shape.map(([, y]) => y);
    const minX = Math.min(...xValues), maxX = Math.max(...xValues);
    const minY = Math.min(...yValues), maxY = Math.max(...yValues);
    const shipPoints = shape.map(([x, y]) => `${((x - minX) / (maxX - minX) * 80 + 10).toFixed(2)}% ${((y - minY) / (maxY - minY) * 80 + 10).toFixed(2)}%`).join(', ');
    shipBody.style.clipPath = `polygon(${shipPoints})`;
    shipBody.style.backgroundColor = `rgb(${player.profile.color.join(',')})`;
  }
  const explosionActive = (player.upgradeCounts.explosive || 0) > 0;
  const explosionChoices = explosionActive ? EXPLOSION_SUB_DEFS : LEVEL_UP_DEFS.filter(upgrade => upgrade.id === 'explosive');
  const regularChoices = LEVEL_UP_DEFS.filter(upgrade => upgrade.id !== 'explosive');
  const availableChoices = regularChoices.concat(explosionChoices).filter(upgrade => {
    return upgrade.max !== 1 || (player.upgradeCounts[upgrade.id] || 0) < upgrade.max;
  });
  currentCards = availableChoices.sort(() => random(-1, 1)).slice(0, 3);
  const container = document.getElementById('cards-container');
  if(!container) return;
  container.innerHTML = '';
  currentCards.forEach(upgrade => {
    const level = player.upgradeCounts[upgrade.id] || 0;
    const disabled = upgrade.max === 1 && level >= upgrade.max;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="icon">${upgrade.icon}</div><div class="name">${upgrade.name}</div><div class="desc">${upgrade.desc}</div><div class="lvl">Niveau ${level} → ${level+1}</div>`;
    card.onclick = () => {
      if(disabled) return;
      upgrade.apply(player);
      player.upgradeCounts[upgrade.id] = level + 1;
      gameState = 'playing'; showScreen(null);
    };
    container.appendChild(card);
  });
  showScreen('levelup-screen');
}

export function spawnBurst(x,y,col,n){ for(let i=0;i<n;i++){ const a=random(TWO_PI), sp=random(1,5); particles.push(new Particle(x,y,cos(a)*sp,sin(a)*sp,30+random(20),col)); } }
export function updateParticles(){
  for(let i=particles.length-1;i>=0;i--){
    const particle = particles[i]; particle.update();
    if(particle.life <= 0) particles.splice(i, 1);
  }
  updateLightningArcs();
}
export function updateShockwaves(){ for(let i=shockwaves.length-1;i>=0;i--){ const wave=shockwaves[i]; wave.update(); if(wave.life<=0) shockwaves.splice(i,1); } }
export function drawParticles(){
  noStroke();
  for(const particle of particles) particle.draw();
  for(const wave of shockwaves) wave.draw();
  drawLightningArcs();
}

function updateLightningArcs(){
  for(let i=lightningArcs.length-1;i>=0;i--){
    lightningArcs[i].life--;
    if(lightningArcs[i].life <= 0) lightningArcs.splice(i, 1);
  }
}

function drawLightningArcs(){
  for(const arc of lightningArcs){
    const alpha = map(arc.life, 0, arc.maxLife, 0, 220);
    stroke(120,230,255,alpha); strokeWeight(2.5);
    line(arc.source.x, arc.source.y, arc.target.x, arc.target.y);
    stroke(220,250,255,alpha * 0.8); strokeWeight(1);
    line(arc.source.x, arc.source.y, arc.target.x, arc.target.y);
  }
}

export function damageEnemy(e, damage){ e.hp -= damage; if(e.hp<=0){ run.score += e.score; run.kills += 1; spawnBurst(e.x,e.y, color(e.color[0],e.color[1],e.color[2]), 16); spawnPickupsFrom(e); enemies.splice(enemies.indexOf(e),1); return true; } return false; }
export function damageAsteroid(asteroid, damage){
  asteroid.hp -= damage;
  if(asteroid.hp > 0) return false;
  run.score += 8;
  const colorValue = asteroid.rewardType === 'xp' ? color(79,217,255) : color(255,184,79);
  spawnBurst(asteroid.x, asteroid.y, colorValue, 14);
  if(asteroid.rewardType === 'xp') spawnXpOrbs(asteroid.x, asteroid.y, asteroid.reward);
  else spawnGoldOrbs(asteroid.x, asteroid.y, getAsteroidGold(asteroid));
  asteroids.splice(asteroids.indexOf(asteroid), 1);
  return true;
}

function getAsteroidGold(asteroid){
  return Math.max(10, Math.round(asteroid.r * 0.5));
}
export function explodeAt(x,y,damage,source){
  const radius = player.explosionRadius;
  const explosionDamage = damage * (player.explosionDamage / 0.2);
  shockwaves.push(new Shockwave(x, y, radius));
  let hit = false;
  for(const enemy of enemies.slice()){
    if(enemy !== source && Math.hypot(x-enemy.x, y-enemy.y) <= radius){
      damageEnemy(enemy, explosionDamage); hit = true;
    }
  }
  if(hit) spawnBurst(x, y, color(255,184,79), 10);
}

function ricochetFrom(b, target){
  if(b.ricochets <= 0) return false;
  const dx = b.x - target.x, dy = b.y - target.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance, ny = dy / distance;
  const velocityAlongNormal = b.vx * nx + b.vy * ny;
  b.vx -= 2 * velocityAlongNormal * nx;
  b.vy -= 2 * velocityAlongNormal * ny;
  b.x = target.x + nx * (target.r + b.size / 2 + 1);
  b.y = target.y + ny * (target.r + b.size / 2 + 1);
  b.ricochets--;
  b.lastHit = target;
  b.ricochetCooldown = 3;
  return true;
}

export function checkCollisions(){
  for(let i=bullets.length-1;i>=0;i--){
    const bullet = bullets[i];
    const enemyResult = collideBulletWithEnemies(bullet);
    const asteroidResult = !enemyResult.hit || bullet.pierce > 0
      ? collideBulletWithAsteroids(bullet)
      : { hit:false, bounced:false };
    const hit = enemyResult.hit || asteroidResult.hit;
    const bounced = enemyResult.bounced || asteroidResult.bounced;
    if(hit && bullet.pierce <= 0 && !bounced) bullets.splice(i, 1);
  }
  collidePlayerWithEnemies();
}

function collideBulletWithEnemies(bullet){
  let hit = false;
  let bounced = false;
  for(let i=enemies.length-1;i>=0;i--){
    const enemy = enemies[i];
    if(bullet.hitTargets.has(enemy) || !isBulletTouching(bullet, enemy) || wasRecentlyHit(bullet, enemy)) continue;
    damageEnemy(enemy, bullet.dmg);
    bullet.hitTargets.add(enemy);
    if(bullet.crit) triggerChainLightning(enemy);
    spawnBurst(bullet.x, bullet.y, color(enemy.color[0], enemy.color[1], enemy.color[2]), 5);
    if(bullet.explosive) explodeAt(bullet.x, bullet.y, bullet.dmg * 0.2, enemy);
    hit = true;
    bounced = ricochetFrom(bullet, enemy);
    if(bullet.pierce > 0) bullet.pierce--;
    else if(!bounced) break;
  }
  return { hit, bounced };
}

function collideBulletWithAsteroids(bullet){
  let hit = false;
  let bounced = false;
  for(let i=asteroids.length-1;i>=0;i--){
    const asteroid = asteroids[i];
    if(bullet.hitTargets.has(asteroid) || !isBulletTouching(bullet, asteroid) || wasRecentlyHit(bullet, asteroid)) continue;
    damageAsteroid(asteroid, bullet.dmg);
    bullet.hitTargets.add(asteroid);
    spawnBurst(bullet.x, bullet.y, color(177,151,139), 5);
    hit = true;
    bounced = ricochetFrom(bullet, asteroid);
    if(bullet.pierce > 0) bullet.pierce--;
    else if(!bounced) break;
  }
  return { hit, bounced };
}

function isBulletTouching(bullet, target){
  const startX = bullet.previousX ?? bullet.x;
  const startY = bullet.previousY ?? bullet.y;
  const deltaX = bullet.x - startX;
  const deltaY = bullet.y - startY;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
  const projection = segmentLengthSquared === 0
    ? 0
    : constrain(((target.x - startX) * deltaX + (target.y - startY) * deltaY) / segmentLengthSquared, 0, 1);
  const closestX = startX + deltaX * projection;
  const closestY = startY + deltaY * projection;
  return Math.hypot(target.x - closestX, target.y - closestY) < target.r + bullet.size / 2;
}

function wasRecentlyHit(bullet, target){
  return bullet.lastHit === target && bullet.ricochetCooldown > 0;
}

function collidePlayerWithEnemies(){
  if(player.invuln > 0) return;
  for(const enemy of enemies){
    if(!isInRange(enemy, player, enemy.r + 14)) continue;
    player.hp -= enemy.dmg; player.invuln = 45;
    spawnBurst(player.x, player.y, color(255,120,140), 10);
    break;
  }
}

export function drawEntities(){
  drawOrbs();
  drawParticles();
  drawAsteroids();
  drawEnemies();
  drawBullets();
  drawOrbitals();
  drawDrones();
  drawTurrets();
  drawPlayerShip();
}

export function drawEnemyIndicators(){
  if(!player || !run || run.waveSpawned < run.waveTotal || enemies.length > 3) return;
  const edgePadding = 24;
  const centerX = width / 2;
  const centerY = height / 2;
  for(const enemy of enemies){
    const screenX = enemy.x - camX;
    const screenY = enemy.y - camY;
    const isVisible = screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height;
    if(isVisible) continue;
    drawEnemyIndicator(screenX, screenY, centerX, centerY, edgePadding, enemy.color);
  }
}

function drawEnemyIndicator(targetX, targetY, centerX, centerY, padding, enemyColor){
  const directionX = targetX - centerX;
  const directionY = targetY - centerY;
  const distance = Math.hypot(directionX, directionY) || 1;
  const unitX = directionX / distance;
  const unitY = directionY / distance;
  const horizontalScale = (width / 2 - padding) / Math.max(Math.abs(unitX), 0.001);
  const verticalScale = (height / 2 - padding) / Math.max(Math.abs(unitY), 0.001);
  const edgeDistance = Math.min(horizontalScale, verticalScale);
  const indicatorX = centerX + unitX * edgeDistance;
  const indicatorY = centerY + unitY * edgeDistance;
  const angle = Math.atan2(unitY, unitX);
  push(); translate(indicatorX, indicatorY); rotate(angle);
  noStroke(); fill(enemyColor[0], enemyColor[1], enemyColor[2], 220);
  triangle(10, 0, -7, 7, -7, -7);
  pop();
}

function drawAsteroids(){
  for(const asteroid of asteroids) asteroid.draw();
}

function drawOrbitals(){
  for(const orbital of orbitals) orbital.draw();
}

function drawDrones(){
  if(drones.length){
    noFill(); stroke(255,184,79,35); strokeWeight(1);
    circle(player.x, player.y, 96);
  }
  for(const drone of drones) drone.draw();
}

function drawTurrets(){
  for(const turret of turrets) turret.draw();
}

export function updateHUD(){
  const hpFill = document.getElementById('hp-fill'); if(hpFill) hpFill.style.width = Math.max(0,(player.hp/player.maxHp*100))+'%';
  const hp = document.getElementById('hp-val'); if(hp) hp.innerText = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`;
  const xpFill = document.getElementById('xp-fill'); if(xpFill) xpFill.style.width = (player.xp/player.xpNeeded*100)+'%';
  const lvl = document.getElementById('lvl-val'); if(lvl) lvl.innerText = player.level;
  const wave = document.getElementById('wave-val'); if(wave) wave.innerText = run.wave;
  const scrapRun = document.getElementById('scrap-run-val'); if(scrapRun) scrapRun.innerText = run.scrapEarned;
  const score = document.getElementById('score-val'); if(score) score.innerText = run.score;
  const mode = document.getElementById('mode-val'); if(mode) mode.innerText = player.mode === 'folded' ? 'REPLIÉ' : 'COMBAT';
  const boost = document.getElementById('boost-fill'); if(boost) boost.style.width = (player.boost/player.boostMax*100)+'%';
  const remaining = Math.max(0, run.waveTotal - run.waveSpawned + enemies.length);
  const enemyCount = document.getElementById('enemy-count'); if(enemyCount) enemyCount.innerText = remaining;
  const enemyFill = document.getElementById('enemy-fill'); if(enemyFill) enemyFill.style.width = (run.waveTotal ? remaining/run.waveTotal*100 : 0) + '%';
}

export function drawCrosshair(){
  if(!player) return;
  const centerX = mouseX;
  const centerY = mouseY;
  const radius = 28;
  const barWidth = 12;
  const barAngles = [-Math.PI * 0.72, 0, Math.PI * 0.72];
  push();
  translate(centerX, centerY);
  noFill();
  stroke(57, 255, 176, 210); strokeWeight(1.5);
  circle(0, 0, 8);
  line(-13, 0, -6, 0); line(6, 0, 13, 0);
  line(0, -13, 0, -6); line(0, 6, 0, 13);
  for(let index = 0; index < player.maxAmmo; index++){
    const angle = barAngles.length === player.maxAmmo
      ? barAngles[index]
      : -Math.PI * 0.72 + index * (Math.PI * 1.44 / Math.max(1, player.maxAmmo - 1));
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const loaded = index < player.ammo && player.reloadTimer <= 0;
    stroke(loaded ? color(255, 184, 79, 235) : color(118, 134, 168, 100));
    strokeWeight(loaded ? 3 : 1.5);
    line(x - Math.sin(angle) * barWidth / 2, y + Math.cos(angle) * barWidth / 2, x + Math.sin(angle) * barWidth / 2, y - Math.cos(angle) * barWidth / 2);
  }
  pop();
}

export function keyPressed(){ keys[key.toLowerCase()] = true; return false; }
export function keyReleased(){ keys[key.toLowerCase()] = false; return false; }