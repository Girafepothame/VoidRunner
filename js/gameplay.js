import { Player } from './model/entities/player.js';
import { Bullet } from './model/entities/projectile.js';
import { Enemy } from './model/entities/combat.js';
import { Asteroid } from './model/entities/world.js';
import { Orb, ScrapPickup, EquipmentPickup } from './model/entities/pickups.js';
import { Turret, Drone, Orbital } from './model/entities/support.js';
import { Particle, Shockwave, HyperPortal } from './model/entities/effects.js';
import { EXPLOSION_SUB_DEFS, LEVEL_STAT_GROWTH, LEVEL_UP_DEFS, SLOT_DEFS, meta } from './meta.js';
import { rollEquipment, recomputeEquipmentStats } from './equipment.js';
import { showScreen, flashWaveBanner, buildInventoryUI } from './ui.js';
import { chunkManager, CHUNK_SIZE } from './chunks.js';
import gameData from './data/game.json' with { type: 'json' };

// Gameplay state and logic: spawning, updates, collisions, particles
export let gameState = 'menu'; // menu, playing, paused, levelup, gameover, shop
export let shopReturnState = 'menu';
export let player, run;
export let bullets = [], enemyBullets = [], enemies = [], asteroids = [], xpOrbs = [], scrapPickups = [], equipmentPickups = [], shockwaves = [], lightningArcs = [];
export let drones = [], orbitals = [], turrets = [];
const BIOMES = gameData.biomes;
const PORTAL_CONFIG = gameData.portal;
const ENEMY_DEFS = gameData.enemies;
const DANGER_CONFIG = gameData.danger;
const FIRST_PORTAL_SCORE = PORTAL_CONFIG.firstScore;
export let hyperPortal = null;
export let keys = {};
export let waveBannerTimer = 0;
export let currentCards = [];
const PLAYER_SCALE = 0.65;
// Overlay d'inventaire (touche I) : n'est volontairement PAS une vraie
// pause. Voir main.js, qui ralentit la simulation (frame skip) plutôt que
// de la stopper pendant que l'overlay est ouvert.
export let inventoryOpen = false;
// NOTE: WORLD_W / WORLD_H ne servent plus à borner le monde (celui-ci est
// désormais infini, généré par chunks). Conservés uniquement si d'autres
// fichiers (ex: ui.js, minimap) s'y réfèrent encore — vérifie ces usages.
export let WORLD_W = 24000;
export let WORLD_H = 16000;
export let camX = 0, camY = 0;
let aimAssistTarget = null;
let dashKeyWasDown = false;

const AIM_ASSIST_RANGE = 760;
const AIM_ASSIST_CONE = 0.22;

// --- Pool de particules --------------------------------------------------
// Les particules (impacts, morts, explosions...) sont de loin l'entité la
// plus créée/détruite du jeu : un simple burst en spawn/détruit des dizaines
// en continu. Plutôt que new Particle() + push()/splice() (allocations et
// GC en continu), on garde un tableau de taille fixe réutilisé à l'infini.
// spawnBurst() écrit dans les slots existants au lieu d'en créer de
// nouveaux ; updateParticles/drawParticles ne traitent que les slots actifs.
const PARTICLE_POOL_SIZE = 600;
export let particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => new Particle(0, 0, 0, 0, 0, null));
particles.forEach(p => { p.active = false; });
let particleCursor = 0;

// Wave banner timer accessors to avoid assigning to module namespace
export function setWaveBannerTimer(n){ waveBannerTimer = n; }
export function getWaveBannerTimer(){ return waveBannerTimer; }
export function tickWaveBannerTimer(){ if(waveBannerTimer>0) waveBannerTimer--; return waveBannerTimer; }

// accessors for state vars that other modules may change
export function setShopReturnState(v){ shopReturnState = v; }
export function setGameState(s){ gameState = s; }
export function getShopReturnState(){ return shopReturnState; }

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
  push(); translate(pl.x, pl.y); rotate(pl.angle + pl.armorRotation);
  const flicker = pl.invuln>0 && frameCount%10<5;
  stroke(flicker ? color(255,150,0) : color(profile.color[0],profile.color[1],profile.color[2]));
  strokeWeight(2);
  for(const plate of pl.armor){
    if(plate.respawnTimer > 0) continue;
    const alpha = flicker ? 100 : 220;
    fill(13,20,36, alpha);
    beginShape(); getPlayerPlateShape(plate).forEach(([x,y]) => vertex(x,y)); endShape(CLOSE);
  }
  noStroke(); fill(255, 225, 150, 240); circle(pl.core.x, pl.core.y, pl.core.radius * 2 * PLAYER_SCALE);
  fill(255, 255, 255, 230); circle(pl.core.x, pl.core.y, pl.core.radius * 0.7 * PLAYER_SCALE);
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
  run = {
    time:0, kills:0, score:0, scrapEarned:0, spawnTimer:1,
    biome:0, nextPortalScore:FIRST_PORTAL_SCORE,
    portalBoss:null, portalEvent:'hidden', portalTimer:0,
  };
  bullets=[]; enemyBullets=[]; enemies=[]; asteroids=[]; xpOrbs=[]; scrapPickups=[]; equipmentPickups=[]; shockwaves=[]; lightningArcs=[];
  aimAssistTarget = null;
  inventoryOpen = false;
  hyperPortal = null;
  for(const p of particles) p.active = false;
  particleCursor = 0;
  chunkManager.reset(); // repart d'un monde vierge à chaque nouvelle run
  drones = Array.from({ length: player.droneCount }, (_, i) => new Drone(i * TWO_PI / Math.max(1, player.droneCount)));
  orbitals = Array.from({ length: player.orbitalCount }, (_, i) => new Orbital(i * TWO_PI / Math.max(1, player.orbitalCount)));
  recomputeEquipmentStats(player); // loadout vide au départ, mais fixe hp/speed de base proprement
  turrets = createTurrets();
  lastThreatTier = 0;
  run.spawnTimer = computeSpawnInterval();
  gameState = 'playing';
  showScreen(null);
  document.getElementById('hud').classList.remove('hidden');
}

export function endRun(){
  if(inventoryOpen) toggleInventory();
  gameState = 'gameover';
  const earned = run.scrapEarned;
  run.scrapEarned = earned;
  meta.scrap += earned;
  const goScore = document.getElementById('go-score'); if(goScore) goScore.innerText = run.score;
  const goScrap = document.getElementById('go-scrap'); if(goScrap) goScrap.innerText = '+'+earned;
  const hud = document.getElementById('hud'); if(hud) hud.classList.add('hidden');
  showScreen('gameover-screen');
}

export function updateRun(){
  run.time += 1/60;
  updatePlayer();
  updateSpawning();
  updateThreatTier();
  updateWorld();
  updateHyperPortal();
  handlePlayerDefeat();
}

export function updatePlayer(){
  const dashKeyDown = typeof keyIsDown === 'function' && keyIsDown(32);
  if(dashKeyDown && !dashKeyWasDown) requestPlayerDash();
  dashKeyWasDown = dashKeyDown;
  updateCameraAndAim();
  updateMovement();
  updatePlayerResources();
  handlePlayerWeapons();
}

function updateWorld(){
  updateChunks();
  updateEnemies(); updateAsteroids(); updateDrones();
  updateOrbitals(); updateTurrets(); updateBullets(); updateEnemyBullets(); updateOrbs();
  updateParticles(); updateShockwaves(); checkCollisions();
}

function updateHyperPortal(){
  if(!hyperPortal){
    if(run.score < run.nextPortalScore) return;
    const angle = random(TWO_PI);
    const distance = random(650, 900);
    const biome = BIOMES[run.biome % BIOMES.length];
    hyperPortal = new HyperPortal(
      player.x + Math.cos(angle) * distance,
      player.y + Math.sin(angle) * distance,
      biome.color,
    );
    run.portalEvent = 'found';
    flashWaveBanner('PORTAIL HYPER-ESPACE');
    return;
  }

  hyperPortal.update();
  if(run.portalEvent === 'active'){
    run.portalTimer--;
    if(run.portalTimer <= 0){
      run.portalEvent = 'cleanup';
      flashWaveBanner('DERNIÈRE VAGUE');
    }
    return;
  }
  if(run.portalEvent === 'cleanup'){
    if(enemies.length === 0){
      run.portalEvent = 'ready';
      flashWaveBanner('PORTAIL PRÊT');
    }
    return;
  }
  if(run.portalEvent === 'found' && isInRange(hyperPortal, player, hyperPortal.radius + 18)){
    activatePortalEvent();
    return;
  }
  if(run.portalEvent === 'ready' && isInRange(hyperPortal, player, hyperPortal.radius + 18)) completePortalBoss();
}

function activatePortalEvent(){
  const durationSeconds = constrain(
    Math.round(PORTAL_CONFIG.eventDurationMaxSeconds - difficultyScale() * 4),
    PORTAL_CONFIG.eventDurationMinSeconds,
    PORTAL_CONFIG.eventDurationMaxSeconds,
  );
  run.portalEvent = 'active';
  run.portalTimer = durationSeconds * 60;
  spawnPortalBoss();
  flashWaveBanner('TÉLÉPORTEUR ACTIVÉ');
}

function spawnPortalBoss(){
  const angle = random(TWO_PI);
  const distance = 260;
  const scale = difficultyScale();
  const hp = Math.round(260 + scale * 90);
  const biome = BIOMES[run.biome % BIOMES.length];
  const boss = new Enemy({
    x: player.x + Math.cos(angle) * distance,
    y: player.y + Math.sin(angle) * distance,
    type:'chaser', isPortalBoss:true,
    hp, maxHp:hp,
    speed: Math.min(1.1, player.speed * 0.55),
    r: 30, dmg: 24, xp: 20,
    color: biome.color, score: 250,
    fireCooldown: 90, phase: random(TWO_PI), angle:0,
  });
  enemies.push(boss);
  run.portalBoss = boss;
  flashWaveBanner('BOSS DU PORTAIL');
  spawnBurst(hyperPortal.x, hyperPortal.y, color(biome.color[0], biome.color[1], biome.color[2]), 28);
}

function completePortalBoss(){
  const convertedXp = Math.floor(run.scrapEarned / 10);
  if(convertedXp > 0){
    run.scrapEarned -= convertedXp * 10;
    gainXp(convertedXp);
  }
  run.biome += 1;
  run.nextPortalScore = run.score + FIRST_PORTAL_SCORE + run.biome * PORTAL_CONFIG.nextBiomeScore;
  hyperPortal = null;
  run.portalBoss = null;
  run.portalEvent = 'hidden';
  run.portalTimer = 0;
  enemies = [];
  enemyBullets = [];
  run.spawnTimer = 45;
  const biome = BIOMES[run.biome % BIOMES.length];
  flashWaveBanner('BIOME ' + biome.name);
  spawnBurst(player.x, player.y, color(biome.color[0], biome.color[1], biome.color[2]), 34);
  triggerShake(8, 14);
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
  applyShake();
  const mouseAngle = atan2(mouseY + camY - player.y, mouseX + camX - player.x);
  aimAssistTarget = findAimAssistTarget(mouseAngle);
  const targetAngle = aimAssistTarget
    ? blendAimAngle(mouseAngle, atan2(aimAssistTarget.y - player.y, aimAssistTarget.x - player.x), 0.72)
    : mouseAngle;
  let delta = targetAngle - player.angle;
  while(delta > PI) delta -= TWO_PI;
  while(delta < -PI) delta += TWO_PI;
  player.angle += constrain(delta, -0.22, 0.22);
}

function findAimAssistTarget(mouseAngle){
  let bestTarget = null;
  let bestScore = Infinity;
  for(const enemy of enemies){
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const distance = Math.hypot(dx, dy);
    if(distance <= 1 || distance > AIM_ASSIST_RANGE) continue;
    let angleDelta = atan2(dy, dx) - mouseAngle;
    while(angleDelta > PI) angleDelta -= TWO_PI;
    while(angleDelta < -PI) angleDelta += TWO_PI;
    const cone = AIM_ASSIST_CONE + Math.min(0.08, (enemy.r || 0) / distance);
    if(Math.abs(angleDelta) > cone) continue;
    const score = Math.abs(angleDelta) * 1000 + distance * 0.08;
    if(score < bestScore){ bestScore = score; bestTarget = enemy; }
  }
  return bestTarget;
}

function blendAimAngle(firstAngle, secondAngle, amount){
  let delta = secondAngle - firstAngle;
  while(delta > PI) delta -= TWO_PI;
  while(delta < -PI) delta += TWO_PI;
  return firstAngle + delta * amount;
}

// Micro screen-shake (dash, impacts...) : décale légèrement la caméra
// pendant quelques frames plutôt que de la clamper à une valeur fixe.
let shakeTimer = 0, shakeMagnitude = 0;
function triggerShake(magnitude, duration){
  shakeMagnitude = magnitude; shakeTimer = duration;
}
function applyShake(){
  if(shakeTimer <= 0) return;
  camX += random(-shakeMagnitude, shakeMagnitude);
  camY += random(-shakeMagnitude, shakeMagnitude);
  shakeTimer--;
}

// --- Mouvement -------------------------------------------------------------
// Contrôle unifié (plus de mode replié/combat) : la souris vise en
// permanence, Z/S avancent ou reculent le long de cet axe de visée, Q/D
// orbitent perpendiculairement (strafe). Le tir reste indépendant du
// déplacement (voir handlePlayerWeapons).
function updateMovement(){
  updateDash();
  if(player.dashTimer > 0){
    updateShipOpening();
    return; // l'impulsion de dash prend le pas sur le déplacement normal
  }
  applyDirectionalMovement();
  updateShipOpening();
}

function updateShipOpening(){
  const currentSpeed = Math.hypot(player.vx, player.vy);
  const maximumBoostSpeed = player.speed * 2.25;
  const targetOpening = player.dashTimer > 0
    ? 1
    : constrain(currentSpeed / maximumBoostSpeed, 0, 1);
  player.shipOpening += (targetOpening - player.shipOpening) * 0.16;
}

function applyDirectionalMovement(){
  const forward = (keys['z'] ? 1 : 0) - (keys['s'] ? 1 : 0);
  const strafe = (keys['d'] ? 1 : 0) - (keys['q'] ? 1 : 0);
  const boosting = keys['shift'] && player.boost > 0 && (forward !== 0 || strafe !== 0);
  player.boost = boosting ? Math.max(0, player.boost - 1.8) : Math.min(player.boostMax, player.boost + 0.65 + player.boostRegenBonus);
  const hasInput = forward !== 0 || strafe !== 0;
  if(hasInput){
    if(keys['z']) player.lastMoveDirection = 'z';
    else if(keys['s']) player.lastMoveDirection = 's';
    else if(keys['q']) player.lastMoveDirection = 'q';
    else if(keys['d']) player.lastMoveDirection = 'd';
  }
  const acceleration = 0.34;
  const deceleration = 0.12;
  if(hasInput){
    const forwardMultiplier = forward > 0 ? 1.25 : 1;
    const speed = player.speed * forwardMultiplier * (boosting ? 1.8 : 1);
    const length = Math.hypot(forward, strafe) || 1;
    const forwardX = Math.cos(player.angle), forwardY = Math.sin(player.angle);
    const strafeX = Math.cos(player.angle + HALF_PI), strafeY = Math.sin(player.angle + HALF_PI);
    const targetVx = (forwardX*forward + strafeX*strafe) / length * speed;
    const targetVy = (forwardY*forward + strafeY*strafe) / length * speed;
    player.vx += constrain(targetVx - player.vx, -acceleration, acceleration);
    player.vy += constrain(targetVy - player.vy, -acceleration, acceleration);
    player.thrust = boosting ? 1.5 : 1;
  } else {
    player.vx *= Math.max(0, 1 - deceleration);
    player.vy *= Math.max(0, 1 - deceleration);
    player.thrust = 0;
  }
  player.x += player.vx;
  player.y += player.vy;
}

// --- Dash --------------------------------------------------------------
// Une charge unique, courte et violente (impulsion de ~0.15s, pas un
// sprint). Déclenchée par Espace dans la dernière direction de déplacement. Se recharge
// automatiquement avec le temps, et plus vite via l'agressivité : tuer un
// ennemi, dasher à travers un ennemi ou un projectile, ou tuer PENDANT un
// dash (recharge instantanée) — de quoi enchaîner dash → kill → dash.
const DASH_COOLDOWN_FRAMES = 240; // ~4s à 60fps sans bonus de recharge
const DASH_DURATION_FRAMES = 4; // déplacement quasi instantané (~0.07s)
let dashGrazedEnemies = new Set();

export function requestPlayerDash(){
  if(gameState !== 'playing' || inventoryOpen || !player) return;
  const activeDirection = ['z', 's', 'q', 'd'].find(direction => keys[direction]);
  requestDash(activeDirection || player.lastMoveDirection || 'z');
}

function directionToAngle(direction){
  switch(direction){
    case 's': return player.angle + PI;
    case 'q': return player.angle - HALF_PI;
    case 'd': return player.angle + HALF_PI;
    default: return player.angle; // 'z' = avant, direction par défaut
  }
}

function requestDash(direction){
  if(player.dashCooldownTimer > 0 || player.dashTimer > 0) return;
  player.dashAngle = directionToAngle(direction);
  player.dashDistance = player.speed * 36; // blink court, indépendant de la vélocité
  player.dashProgress = 0; player.dashAppliedDistance = 0;
  player.dashDuration = DASH_DURATION_FRAMES;
  player.dashTimer = DASH_DURATION_FRAMES;
  player.dashCooldownTimer = DASH_COOLDOWN_FRAMES;
  player.vx = 0; player.vy = 0;
  player.invuln = Math.max(player.invuln, DASH_DURATION_FRAMES + 2);
  dashGrazedEnemies = new Set();
  triggerShake(4, 6);
  spawnBurst(player.x, player.y, color(180,107,255), 14);
}

function rechargeDashPercent(fraction){
  player.dashCooldownTimer = Math.max(0, player.dashCooldownTimer - DASH_COOLDOWN_FRAMES*fraction);
}
function rechargeDashFull(){ player.dashCooldownTimer = 0; }

function updateDash(){
  if(player.dashCooldownTimer > 0) player.dashCooldownTimer--;
  if(player.dashTimer <= 0) return;
  player.dashProgress = Math.min(1, player.dashProgress + 1 / player.dashDuration);
  const distance = lerp(0, player.dashDistance, player.dashProgress);
  const step = distance - player.dashAppliedDistance;
  player.x += Math.cos(player.dashAngle) * step;
  player.y += Math.sin(player.dashAngle) * step;
  player.dashAppliedDistance = distance;
  player.dashTimer--;
  if(player.dashTimer <= 0){ player.vx = 0; player.vy = 0; }
  spawnBurst(player.x, player.y, color(180,107,255,160), 2); // légère traînée
  checkDashGrazes();
}

// "Dash à travers" un ennemi ou un projectile ennemi : détecté une seule
// fois par cible et par dash (dashGrazedEnemies), récompensé en recharge de
// dash plutôt qu'en dégâts (voir description du système : ça doit se sentir
// comme une esquive réflexe, pas juste une attaque de plus).
function checkDashGrazes(){
  for(const enemy of enemies){
    if(dashGrazedEnemies.has(enemy)) continue;
    if(Math.hypot(enemy.x-player.x, enemy.y-player.y) < enemy.r + 18){
      dashGrazedEnemies.add(enemy);
      if(player.dashDamage > 0) damageEnemy(enemy, player.dashDamage);
      rechargeDashPercent(0.25);
      spawnBurst(player.x, player.y, color(180,107,255), 6);
    }
  }
  for(let i=enemyBullets.length-1;i>=0;i--){
    const bullet = enemyBullets[i];
    if(Math.hypot(bullet.x-player.x, bullet.y-player.y) < bullet.size + 16){
      enemyBullets.splice(i,1);
      rechargeDashPercent(0.5);
      spawnBurst(player.x, player.y, color(57,255,176), 8);
    }
  }
}

function updatePlayerResources(){
  if(player.regen > 0 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + player.regen / 60);
  if(player.invuln > 0) player.invuln--;
  if(player.fireCooldown > 0) player.fireCooldown--;
  for(const plate of player.armor){
    if(plate.respawnTimer > 0){
      plate.respawnTimer--;
      if(plate.respawnTimer === 0) plate.hp = plate.maxHp;
    }
  }
}

function handlePlayerWeapons(){
  const firing = mouseIsPressed;
  if(player.fireCooldown <= 0){
    firePlayerBullets();
    player.fireCooldown = player.fireRate;
  }
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
// Les tourelles latérales ("drones" de combat, catégorie d'équipement
// 'drone') sont entièrement pilotées par le loadout : convention index 0 =
// côté gauche, index 1 = côté droit. Reconstruites à chaque equip/unequip
// via refreshTurrets().
function createTurrets(){
  const result = [];
  const slots = player.loadout.drone;
  if(slots[0]) result.push(makeTurretFromEquipment(slots[0], -1));
  if(slots[1]) result.push(makeTurretFromEquipment(slots[1], 1));
  return result;
}
function makeTurretFromEquipment(item, side){
  const turret = new Turret(side);
  turret.dmgMult = item.stats.dmgMult;
  turret.fireRate = item.stats.fireRate;
  return turret;
}
export function refreshTurrets(){
  turrets = createTurrets();
}
function updateTurrets(){
  const targetX = mouseX + camX;
  const targetY = mouseY + camY;
  for(const turret of turrets) turret.update(player, targetX, targetY, bullets);
}

// --- Équipement : equip/unequip, inventaire en run, outils de debug ------
// Équipe un objet stocké au premier slot débloqué ET libre de sa catégorie.
// Ne fait rien (renvoie false) si aucun slot n'est disponible.
export function equipFromInventory(inventoryIndex){
  const item = player.inventory[inventoryIndex];
  if(!item) return false;
  const category = item.category;
  const unlockedCount = meta.unlockedSlots[category] || 0;
  const slots = player.loadout[category];
  let targetIndex = -1;
  for(let i=0;i<unlockedCount;i++){ if(!slots[i]){ targetIndex = i; break; } }
  if(targetIndex === -1) return false;
  slots[targetIndex] = item;
  player.inventory[inventoryIndex] = null;
  recomputeEquipmentStats(player);
  refreshTurrets();
  return true;
}

// Retire un objet équipé vers l'inventaire. Ne fait rien si l'inventaire
// est plein (on ne perd jamais un objet en le déséquipant).
export function unequipItem(category, index){
  const item = player.loadout[category][index];
  if(!item) return false;
  const freeSlot = player.inventory.findIndex(slot => slot === null);
  if(freeSlot === -1) return false;
  player.inventory[freeSlot] = item;
  player.loadout[category][index] = null;
  recomputeEquipmentStats(player);
  refreshTurrets();
  return true;
}

// Ouvre/ferme l'overlay d'inventaire pendant la run et fige la simulation.
export function toggleInventory(){
  if(!inventoryOpen && gameState !== 'playing') return;
  inventoryOpen = !inventoryOpen;
  gameState = inventoryOpen ? 'paused' : 'playing';
  const overlay = document.getElementById('inventory-screen');
  if(overlay) overlay.classList.toggle('hidden', !inventoryOpen);
  if(inventoryOpen) buildInventoryUI();
}

// Outils de debug (menu F3) pour tester le système sans attendre un drop
// de mini-boss ou grinder du scrap à l'atelier.
export function debugAddEquipment(category){
  const item = rollEquipment(category, difficultyScale());
  const freeSlot = player.inventory.findIndex(slot => slot === null);
  if(freeSlot !== -1) player.inventory[freeSlot] = item;
  return item;
}
export function debugUnlockSlot(category){
  const def = SLOT_DEFS[category];
  if(!def) return;
  if((meta.unlockedSlots[category] || 0) < def.max) meta.unlockedSlots[category] += 1;
}
export function updateOrbitals(){
  for(const orbital of orbitals){
    orbital.update(player);
    for(const enemy of enemies){
      if(isInRange(orbital, enemy, enemy.r + 7)) damageEnemy(enemy, player.orbitalDamage/60);
    }
  }
}

// --- Danger continu : distance à l'origine + temps de survie -------------
// Option "hybride" façon Risk of Rain : là où RoR fait grimper le danger
// uniquement avec le temps (tout le stage devient plus dur pendant que vous
// hésitez à partir), ici on combine deux sources qui s'additionnent :
//  - une composante SPATIALE : s'éloigner de l'origine augmente le danger de
//    base, cohérent avec le monde infini par chunks (mêmes distances que la
//    densité d'astéroïdes dans chunks.js) ;
//  - une composante TEMPORELLE : même en restant proche de l'origine, le
//    danger grimpe lentement avec la durée de la run, pour empêcher de
//    camper indéfiniment une zone sûre.
// Le résultat (>= 1) pilote à la fois les stats des ennemis, l'intervalle
// de spawn et le nombre max d'ennemis simultanés.
function getDistanceDanger(){
  if(!player) return 0;
  const distance = Math.hypot(player.x, player.y);
  return (distance / CHUNK_SIZE) * DANGER_CONFIG.distancePerChunk;
}

function getTimeDanger(){
  if(!run) return 0;
  return run.time * DANGER_CONFIG.timePerSecond;
}

export function difficultyScale(){ return 1 + getDistanceDanger() + getTimeDanger() + (run ? run.biome * DANGER_CONFIG.biomeBonus : 0); }

// Nombre d'ennemis simultanés autorisés : grandit avec le danger, plafonné
// pour rester jouable et pour ne pas dégrader les perfs (voir grille
// spatiale de collision, qui reste efficace même avec ce plafond haut).
function getMaxEnemies(){
  return Math.min(60, 8 + Math.floor(difficultyScale() * 6));
}

// Intervalle (en frames) avant le prochain spawn : plus le danger est élevé,
// plus les ennemis arrivent vite. Bornes pour éviter un flux instantané ou
// à l'inverse un désert d'ennemis en tout début de run.
function computeSpawnInterval(){
  return constrain(Math.round(110 / difficultyScale()), 16, 110);
}

export function updateSpawning(){
  if(run.portalEvent === 'cleanup' || run.portalEvent === 'ready') return;
  maybeSpawnMiniboss();
  if(enemies.length >= getMaxEnemies()){
    run.spawnTimer = Math.min(run.spawnTimer, 20);
    return;
  }
  run.spawnTimer--;
  if(run.spawnTimer <= 0){
    spawnEnemy();
    if(random() < 0.35) spawnAsteroid();
    run.spawnTimer = computeSpawnInterval();
  }
}

// Suivi du palier de danger courant : à chaque franchissement d'un palier
// entier (1 -> 2 -> 3...), on flashe une bannière pour donner au joueur un
// repère de progression, sans réintroduire de notion de "vague".
let lastThreatTier = 0;
function updateThreatTier(){
  const tier = Math.floor(difficultyScale());
  if(tier > lastThreatTier){
    lastThreatTier = tier;
    flashWaveBanner('MENACE ' + tier);
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
  const asteroidHp = Math.round(10 + (difficultyScale() - 1) * 12);
  asteroids.push(new Asteroid({ x, y, vx:random(-0.45, 0.45), vy:random(-0.45, 0.45), r:radius,
    hp:asteroidHp, maxHp:asteroidHp, rewardType,
    reward:Math.max(1, Math.round(radius / 8)) }));
}

export function spawnEnemy(){
  const edge = floor(random(4)); let x,y;
  const margin = 100;
  if(edge===0){ x=player.x + random(-width/2,width/2); y=player.y-height/2-margin; }
  else if(edge===1){ x=player.x+width/2+margin; y=player.y+random(-height/2,height/2); }
  else if(edge===2){ x=player.x + random(-width/2,width/2); y=player.y+height/2+margin; }
  else { x=player.x-width/2-margin; y=player.y+random(-height/2,height/2); }
  const scale = difficultyScale();
  const roll = random(); let type = 'chaser';
  if(scale>=2.8 && roll<0.15) type='sniper';
  else if(scale>=2.2 && roll<0.5) type='zigzag';
  else if(scale>=1.6 && roll<0.28) type='shooter';
  // reduced base speeds and gentler difficulty scaling to slow enemies
  // base speeds lowered; final speed capped relative to player speed so enemies cannot match/overrun player
  const base = ENEMY_DEFS[type];
  const speedMult = 1 + (scale - 1) * 0.04; // gentler scaling
  const desiredSpeed = base.speed * speedMult;
  const maxAllowed = (player && player.speed) ? player.speed * 0.75 : desiredSpeed; // keep enemies slower than player
  const finalSpeed = Math.min(desiredSpeed, maxAllowed);
  enemies.push(new Enemy({ x,y, type, hp: Math.max(1, base.hp*scale), maxHp: Math.max(1, base.hp*scale), speed: finalSpeed, r: base.radius, dmg: base.damage, xp: base.xp, color: base.color, score: base.score, aggroRange: base.aggroRange, parts: base.parts?.map(partName => gameData.enemyShapes[partName]), fireCooldown: random(60,120), phase: random(TWO_PI), angle:0 }));
}

export function updateEnemies(){
  for(const e of enemies){
    const fireCallback = e.type === 'sniper' ? applySniperLaser : enemyBullets;
    e.update(player, run, fireCallback);
  }
}

function applySniperLaser(sniper){
  const dx = player.x - sniper.x;
  const dy = player.y - sniper.y;
  const distanceAlongLaser = dx * Math.cos(sniper.laserAngle) + dy * Math.sin(sniper.laserAngle);
  if(distanceAlongLaser < 0) return;
  const closestX = sniper.x + Math.cos(sniper.laserAngle) * distanceAlongLaser;
  const closestY = sniper.y + Math.sin(sniper.laserAngle) * distanceAlongLaser;
  if(Math.hypot(player.x - closestX, player.y - closestY) > 14) return;
  if(player.invuln > 0) return;
  damagePlayerAtPoint(player.x, player.y);
  player.invuln = 45;
  spawnBurst(player.x, player.y, color(255,80,80), 14);
}

// --- Mini-boss : seule source de drop d'équipement ------------------------
// Contrairement aux ennemis normaux (spawn continu piloté par le danger),
// les mini-boss sont des apparitions rares et ponctuelles : un seul à la
// fois, avec un délai minimum entre deux apparitions. Leur mort est la
// SEULE façon d'obtenir de l'équipement dans le jeu.
const MINIBOSS_MIN_INTERVAL = 70; // secondes minimum entre deux apparitions
let lastMinibossTime = -999;

function maybeSpawnMiniboss(){
  if(run.portalBoss || run.portalEvent === 'active') return;
  if(enemies.some(e => e.isMiniboss)) return;
  if(run.time - lastMinibossTime < MINIBOSS_MIN_INTERVAL) return;
  if(random() < 0.006){
    spawnMiniboss();
    lastMinibossTime = run.time;
  }
}

function spawnMiniboss(){
  const edge = floor(random(4)); let x,y;
  const margin = 160;
  if(edge===0){ x=player.x + random(-width/2,width/2); y=player.y-height/2-margin; }
  else if(edge===1){ x=player.x+width/2+margin; y=player.y+random(-height/2,height/2); }
  else if(edge===2){ x=player.x + random(-width/2,width/2); y=player.y+height/2+margin; }
  else { x=player.x-width/2-margin; y=player.y+random(-height/2,height/2); }
  const scale = difficultyScale();
  const minibossParts = [
    gameData.enemyShapes.right.map(([partX, partY]) => [partX + 4, partY]),
    gameData.enemyShapes.left.map(([partX, partY]) => [partX - 4, partY]),
  ];
  enemies.push(new Enemy({
    x, y, type:'chaser', isMiniboss:true,
    hp: Math.round(50 + scale*22), maxHp: Math.round(50 + scale*22),
    speed: Math.min(0.85, (player ? player.speed*0.5 : 0.85)),
    r: 30, dmg: 20, xp: 14, color:[255,214,79], score:140,
    parts: minibossParts,
    fireCooldown: random(60,120), phase: random(TWO_PI), angle:0,
  }));
  flashWaveBanner('MINI-BOSS EN APPROCHE');
}

function dropEquipment(x, y){
  const categories = Object.keys(SLOT_DEFS);
  const category = categories[Math.floor(random(categories.length))];
  const item = rollEquipment(category, difficultyScale());
  equipmentPickups.push(new EquipmentPickup(x, y, item));
}

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

// Distance au carré : évite un Math.hypot/sqrt à chaque appel. Ces checks de
// portée tournent des centaines de fois par frame (orbes, orbitaux, tourelles,
// collisions joueur/ennemis...) donc c'est un des points chauds du jeu.
function isInRange(first, second, range){
  const dx = first.x - second.x, dy = first.y - second.y;
  return dx*dx + dy*dy < range*range;
}

function isFarFromPlayer(entity, maxDist){
  const dx = entity.x - player.x, dy = entity.y - player.y;
  return dx*dx + dy*dy > maxDist*maxDist;
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
    if(!isInRange(bullet, player, bullet.size + 32)) continue;
    damagePlayerWithBullet(bullet, i);
  }
}

function damagePlayerWithBullet(bullet, index){
  if(isBulletTouchingPlayerCore(bullet)){
    enemyBullets.splice(index, 1);
    spawnBurst(player.x, player.y, color(255,80,80), 24);
    endRun();
    return;
  }
  damagePlayerAtProjectile(bullet);
  player.invuln = 8;
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
  collectEquipmentPickups();
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
function collectEquipmentPickups(){
  for(let i=equipmentPickups.length-1;i>=0;i--){
    const pickup = equipmentPickups[i]; pickup.update(player);
    if(!isInRange(pickup, player, 18)) continue;
    const freeSlot = player.inventory.findIndex(slot => slot === null);
    if(freeSlot !== -1){
      player.inventory[freeSlot] = pickup.item;
      flashWaveBanner('OBJET RÉCUPÉRÉ');
    } else {
      flashWaveBanner('INVENTAIRE PLEIN');
    }
    equipmentPickups.splice(i, 1);
  }
}
export function drawOrbs(){ for(const o of xpOrbs) o.draw(); for(const o of scrapPickups) o.draw(); for(const o of equipmentPickups) o.draw(); }

export function gainXp(n){
  player.xp += n; run.score += 3;
  if(player.xp >= player.xpNeeded){
    player.xp -= player.xpNeeded;
    player.level += 1;
    player.baseMaxHp += LEVEL_STAT_GROWTH.maxHp;
    recomputeEquipmentStats(player); // met à jour maxHp (base + bonus équipement) et soigne d'autant
    player.lastDamageGain = LEVEL_STAT_GROWTH.dmg + player.dmgPerLevel;
    player.dmg += player.lastDamageGain;
    player.fireRate = Math.max(LEVEL_STAT_GROWTH.minFireRate, player.fireRate - LEVEL_STAT_GROWTH.fireRate);
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
    stats.innerHTML = `<div class="level-stats-title">STATS DU VAISSEAU</div><div class="level-stats-list"><div>Coque max <span>${previousMaxHp} ➤ ${player.maxHp} <b>(+${LEVEL_STAT_GROWTH.maxHp})</b></span></div><div>Dégâts <span>${previousDmg.toFixed(1)} → ${player.dmg.toFixed(1)} <b>(+${damageGain.toFixed(1)})</b></span></div><div>Cadence <span>${previousFireRate}f → ${player.fireRate}f <b>(-${LEVEL_STAT_GROWTH.fireRate}f)</b></span></div></div>`;
  }
  const equipment = document.getElementById('level-equipment');
  if(equipment){
    const equippedDrones = player.loadout.drone.filter(Boolean).length;
    equipment.innerHTML = `<div class="level-equipment-title">ÉQUIPEMENTS</div><div class="level-ship-preview"><div class="level-ship-preview-body"></div></div><div class="level-equipment-list"><div><span>Drones</span><b>${equippedDrones}</b></div><div><span>Drones orbitaux</span><b>${player.orbitalCount}</b></div></div>`;
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

// spawnBurst n'alloue plus de Particle : on recycle des slots du pool en
// boucle (round-robin). Si le pool est "plein" (toutes les particules du
// dernier tour sont encore vivantes), on écrase les plus anciennes — un burst
// visuel perdu de temps en temps est invisible à l'écran, contrairement à un
// stutter de GC.
export function spawnBurst(x,y,col,n){
  for(let i=0;i<n;i++){
    const a=random(TWO_PI), sp=random(1,5);
    const p = particles[particleCursor];
    particleCursor = (particleCursor + 1) % particles.length;
    p.reset(x, y, cos(a)*sp, sin(a)*sp, 30+random(20), col);
  }
}
export function updateParticles(){
  for(const p of particles){
    if(!p.active) continue;
    p.update();
    if(p.life <= 0) p.active = false;
  }
  updateLightningArcs();
}
export function updateShockwaves(){ for(let i=shockwaves.length-1;i>=0;i--){ const wave=shockwaves[i]; wave.update(); if(wave.life<=0) shockwaves.splice(i,1); } }
export function drawParticles(){
  noStroke();
  for(const p of particles){ if(p.active) p.draw(); }
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

export function damageEnemy(e, damage){
  e.hp -= damage;
  if(e.hp<=0){
    run.score += e.score; run.kills += 1;
    spawnBurst(e.x,e.y, color(e.color[0],e.color[1],e.color[2]), e.isMiniboss ? 34 : 16);
    spawnPickupsFrom(e);
    if(e.isMiniboss) dropEquipment(e.x, e.y);
    if(e.isPortalBoss) run.portalBoss = null;
    if(player.dashTimer > 0) rechargeDashFull(); else rechargeDashPercent(0.2);
    enemies.splice(enemies.indexOf(e),1);
    return true;
  }
  return false;
}
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

// --- Grille spatiale pour les collisions balles ↔ ennemis/astéroïdes ------
// Sans ça, chaque balle est testée contre TOUS les ennemis puis TOUS les
// astéroïdes chaque frame : avec le monde infini par chunks, le nombre
// d'astéroïdes chargés peut monter à plusieurs centaines, et le coût devient
// O(bullets × entities). La grille regroupe les entités par cellule ; pour
// chaque balle on ne teste que les cellules réellement traversées par son
// déplacement de la frame (previousX/Y -> x/y), plus une marge de sécurité.
const COLLISION_CELL_SIZE = 150;
// Marge ajoutée à la boîte englobante d'une balle pour être sûr de couvrir
// le plus grand rayon d'entité pouvant être touché (gros astéroïde ~42 + un
// peu de jeu).
const COLLISION_QUERY_MARGIN = 70;

function cellKeyOf(cx, cy){ return cx + '_' + cy; }

function buildSpatialGrid(list){
  const grid = new Map();
  for(const item of list){
    const cx = Math.floor(item.x / COLLISION_CELL_SIZE);
    const cy = Math.floor(item.y / COLLISION_CELL_SIZE);
    const key = cellKeyOf(cx, cy);
    let bucket = grid.get(key);
    if(!bucket){ bucket = []; grid.set(key, bucket); }
    bucket.push(item);
  }
  return grid;
}

// Renvoie les entités des cellules couvrant le segment parcouru par la balle
// cette frame (utile car bulletSpeed peut dépasser la taille d'une cellule).
function queryGridForBullet(grid, bullet){
  if(grid.size === 0) return EMPTY_ARRAY;
  const x0 = bullet.previousX ?? bullet.x;
  const y0 = bullet.previousY ?? bullet.y;
  const minX = Math.min(x0, bullet.x) - COLLISION_QUERY_MARGIN;
  const maxX = Math.max(x0, bullet.x) + COLLISION_QUERY_MARGIN;
  const minY = Math.min(y0, bullet.y) - COLLISION_QUERY_MARGIN;
  const maxY = Math.max(y0, bullet.y) + COLLISION_QUERY_MARGIN;
  const minCx = Math.floor(minX / COLLISION_CELL_SIZE);
  const maxCx = Math.floor(maxX / COLLISION_CELL_SIZE);
  const minCy = Math.floor(minY / COLLISION_CELL_SIZE);
  const maxCy = Math.floor(maxY / COLLISION_CELL_SIZE);
  const result = [];
  for(let cx=minCx; cx<=maxCx; cx++){
    for(let cy=minCy; cy<=maxCy; cy++){
      const bucket = grid.get(cellKeyOf(cx, cy));
      if(bucket) result.push(...bucket);
    }
  }
  return result;
}
const EMPTY_ARRAY = [];

export function checkCollisions(){
  // Grilles reconstruites une fois par frame (pas par balle) : coût O(n).
  const enemyGrid = enemies.length ? buildSpatialGrid(enemies) : null;
  const asteroidGrid = asteroids.length ? buildSpatialGrid(asteroids) : null;

  for(let i=bullets.length-1;i>=0;i--){
    const bullet = bullets[i];
    const nearbyEnemies = enemyGrid ? queryGridForBullet(enemyGrid, bullet) : EMPTY_ARRAY;
    const enemyResult = nearbyEnemies.length ? collideBulletWithEnemies(bullet, nearbyEnemies) : { hit:false, bounced:false };
    let asteroidResult = { hit:false, bounced:false };
    if((!enemyResult.hit || bullet.pierce > 0) && asteroidGrid){
      const nearbyAsteroids = queryGridForBullet(asteroidGrid, bullet);
      if(nearbyAsteroids.length) asteroidResult = collideBulletWithAsteroids(bullet, nearbyAsteroids);
    }
    const hit = enemyResult.hit || asteroidResult.hit;
    const bounced = enemyResult.bounced || asteroidResult.bounced;
    if(hit && bullet.pierce <= 0 && !bounced) bullets.splice(i, 1);
  }
  collidePlayerWithEnemies();
  collidePlayerWithAsteroids();
}

function collideBulletWithEnemies(bullet, candidates){
  let hit = false;
  let bounced = false;
  for(const enemy of candidates){
    if(bullet.hitTargets.has(enemy) || !isBulletTouching(bullet, enemy) || wasRecentlyHit(bullet, enemy)) continue;
    // l'ennemi a pu être retiré du jeu par un autre coup ce même tick
    if(enemies.indexOf(enemy) === -1) continue;
    const damageMultiplier = isBulletTouchingCore(bullet, enemy) ? 2.5 : 1;
    damageEnemy(enemy, bullet.dmg * damageMultiplier);
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

function collideBulletWithAsteroids(bullet, candidates){
  let hit = false;
  let bounced = false;
  for(const asteroid of candidates){
    if(bullet.hitTargets.has(asteroid) || !isBulletTouching(bullet, asteroid) || wasRecentlyHit(bullet, asteroid)) continue;
    if(asteroids.indexOf(asteroid) === -1) continue;
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

function isBulletTouchingCore(bullet, enemy){
  if(!enemy.core) return false;
  const coreAngle = enemy.angle + (enemy.parts.length ? HALF_PI : 0);
  const coreCos = Math.cos(coreAngle), coreSin = Math.sin(coreAngle);
  const coreX = enemy.x + enemy.core.x * coreCos - enemy.core.y * coreSin;
  const coreY = enemy.y + enemy.core.x * coreSin + enemy.core.y * coreCos;
  return isBulletTouchingPoint(bullet, coreX, coreY, enemy.core.r);
}

function isBulletTouchingPoint(bullet, targetX, targetY, targetRadius){
  const startX = bullet.previousX ?? bullet.x;
  const startY = bullet.previousY ?? bullet.y;
  const deltaX = bullet.x - startX;
  const deltaY = bullet.y - startY;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
  const projection = segmentLengthSquared === 0
    ? 0
    : constrain(((targetX - startX) * deltaX + (targetY - startY) * deltaY) / segmentLengthSquared, 0, 1);
  const closestX = startX + deltaX * projection;
  const closestY = startY + deltaY * projection;
  return Math.hypot(targetX - closestX, targetY - closestY) < targetRadius + bullet.size / 2;
}

function isBulletTouchingPlayerCore(bullet){
  const core = playerLocalToWorld(player.core.x, player.core.y);
  return isBulletTouchingPoint(bullet, core.x, core.y, player.core.radius * PLAYER_SCALE);
}

function getPlayerPlateShape(plate){
  const spread = player.shipOpening * 12;
  if(spread === 0) return plate.shape.map(([x, y]) => [x * PLAYER_SCALE, y * PLAYER_SCALE]);
  let centerX = 0, centerY = 0;
  for(const [x, y] of plate.shape){ centerX += x; centerY += y; }
  centerX /= plate.shape.length || 1;
  centerY /= plate.shape.length || 1;
  const distance = Math.hypot(centerX, centerY) || 1;
  const offsetX = centerX / distance * spread;
  const offsetY = centerY / distance * spread;
  return plate.shape.map(([x, y]) => [(x + offsetX) * PLAYER_SCALE, (y + offsetY) * PLAYER_SCALE]);
}

function playerWorldToLocal(x, y){
  const dx = x - player.x, dy = y - player.y;
  const angle = player.angle + player.armorRotation;
  return { x: dx * Math.cos(angle) + dy * Math.sin(angle), y: -dx * Math.sin(angle) + dy * Math.cos(angle) };
}

function playerLocalToWorld(x, y){
  const angle = player.angle + player.armorRotation;
  return {
    x: player.x + x * Math.cos(angle) - y * Math.sin(angle),
    y: player.y + x * Math.sin(angle) + y * Math.cos(angle),
  };
}

function damagePlayerPlate(plate){
  if(!plate || plate.respawnTimer > 0) return false;
  plate.hp = Math.max(0, plate.hp - 1);
  if(plate.hp === 0) plate.respawnTimer = gameData.playerArmor.respawnFrames;
  return true;
}

function damagePlayerAtPoint(x, y){
  const localPoint = playerWorldToLocal(x, y);
  for(const plate of player.armor){
    if(plate.respawnTimer > 0) continue;
    if(isPointInsidePolygon(localPoint.x, localPoint.y, getPlayerPlateShape(plate))) return damagePlayerPlate(plate);
  }
  return false;
}

function damagePlayerAtProjectile(bullet){
  const start = playerWorldToLocal(bullet.previousX ?? bullet.x, bullet.previousY ?? bullet.y);
  const end = playerWorldToLocal(bullet.x, bullet.y);
  for(const plate of player.armor){
    if(plate.respawnTimer > 0) continue;
    if(segmentTouchesPolygon(start, end, getPlayerPlateShape(plate))) return damagePlayerPlate(plate);
  }
  return false;
}

function isPointInsidePolygon(x, y, polygon){
  let inside = false;
  for(let i=0, j=polygon.length-1; i<polygon.length; j=i++){
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    const crosses = (yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
    if(crosses) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a, b, c, d){
  const orientation = (p, q, r) => (q.x-p.x)*(r.y-p.y) - (q.y-p.y)*(r.x-p.x);
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))
    && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

function segmentTouchesPolygon(start, end, polygon){
  if(isPointInsidePolygon(start.x, start.y, polygon) || isPointInsidePolygon(end.x, end.y, polygon)) return true;
  for(let i=0; i<polygon.length; i++){
    const current = polygon[i], next = polygon[(i + 1) % polygon.length];
    if(segmentsIntersect(start, end, { x: current[0], y: current[1] }, { x: next[0], y: next[1] })) return true;
  }
  return false;
}

function wasRecentlyHit(bullet, target){
  return bullet.lastHit === target && bullet.ricochetCooldown > 0;
}

function collidePlayerWithEnemies(){
  if(player.invuln > 0) return;
  for(const enemy of enemies){
    if(!isInRange(enemy, player, enemy.r + 14)) continue;
    damagePlayerAtPoint(enemy.x, enemy.y); player.invuln = 45;
    spawnBurst(player.x, player.y, color(255,120,140), 10);
    break;
  }
}

function collidePlayerWithAsteroids(){
  if(player.invuln > 0) return;
  for(const asteroid of asteroids){
    if(!isInRange(asteroid, player, asteroid.r + 14)) continue;
    damagePlayerAtPoint(asteroid.x, asteroid.y); player.invuln = 45;
    spawnBurst(player.x, player.y, color(255,184,79), 10);
    break;
  }
}

export function drawEntities(){
  drawOrbs();
  drawParticles();
  drawAsteroids();
  drawEnemies();
  if(hyperPortal) hyperPortal.draw();
  drawBullets();
  drawOrbitals();
  drawDrones();
  drawTurrets();
  drawPlayerShip();
}

export function drawEnemyIndicators(){
  if(!player || !run || enemies.length === 0 || enemies.length > 3) return;
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

export function drawPortalIndicator(){
  if(!player || !hyperPortal) return;
  const screenX = hyperPortal.x - camX;
  const screenY = hyperPortal.y - camY;
  if(screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height) return;
  const centerX = width / 2;
  const centerY = height / 2;
  const directionX = screenX - centerX;
  const directionY = screenY - centerY;
  const distance = Math.hypot(directionX, directionY) || 1;
  const unitX = directionX / distance;
  const unitY = directionY / distance;
  const padding = 30;
  const edgeDistance = Math.min(
    (width / 2 - padding) / Math.max(Math.abs(unitX), 0.001),
    (height / 2 - padding) / Math.max(Math.abs(unitY), 0.001),
  );
  const indicatorX = centerX + unitX * edgeDistance;
  const indicatorY = centerY + unitY * edgeDistance;
  push(); translate(indicatorX, indicatorY); rotate(Math.atan2(unitY, unitX));
  noStroke(); fill(hyperPortal.color[0], hyperPortal.color[1], hyperPortal.color[2], 230);
  triangle(14, 0, -9, 8, -9, -8);
  pop();
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
  const hpRatio = player.maxHp ? constrain(player.hp / player.maxHp, 0, 1) : 0;
  const vignette = document.getElementById('damage-vignette');
  if(vignette) vignette.style.opacity = hpRatio >= 0.7 ? '0' : String(Math.min(0.6, (0.7 - hpRatio) / 0.7 * 0.6));
  const critical = document.getElementById('hp-critical');
  const criticalValue = document.getElementById('hp-critical-val');
  if(critical) critical.style.display = hpRatio < 0.3 ? 'block' : 'none';
  if(criticalValue) criticalValue.innerText = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  const xpFill = document.querySelector('#xp-sliver > div'); if(xpFill) xpFill.style.width = (player.xp/player.xpNeeded*100)+'%';
  const wave = document.getElementById('wave-val'); if(wave) wave.innerText = Math.max(1, Math.floor(difficultyScale()));
  const scrapRun = document.getElementById('scrap-run-val'); if(scrapRun) scrapRun.innerText = run.scrapEarned;
  const score = document.getElementById('score-val'); if(score) score.innerText = run.score;
  const biome = document.getElementById('biome-val'); if(biome) biome.innerText = BIOMES[run.biome % BIOMES.length].name;
  const portal = document.getElementById('portal-val');
  if(portal){
    const portalStatus = {
      found: 'ACTIVER',
      active: `${Math.ceil(run.portalTimer / 60)}s`,
      cleanup: 'NETTOYAGE',
      ready: 'OUVERT',
    }[run.portalEvent];
    portal.innerText = portalStatus || `À ${run.nextPortalScore}`;
    const portalStatusLine = document.getElementById('portal-status');
    if(portalStatusLine) portalStatusLine.classList.toggle('actionable', run.portalEvent === 'found' || run.portalEvent === 'ready');
  }
  const dashGlyph = document.getElementById('dash-glyph');
  if(dashGlyph){
    const ready = player.dashCooldownTimer <= 0;
    dashGlyph.style.opacity = ready ? '1' : '0.35';
    dashGlyph.classList.toggle('ready', ready);
  }
  const boostGlyph = document.getElementById('boost-glyph');
  if(boostGlyph){
    const boostRatio = player.boostMax ? constrain(player.boost / player.boostMax, 0, 1) : 0;
    boostGlyph.style.opacity = String(0.25 + boostRatio * 0.75);
    boostGlyph.classList.toggle('ready', boostRatio >= 0.6);
  }
  const maxEnemies = getMaxEnemies();
  const enemyCount = document.getElementById('enemy-count'); if(enemyCount) enemyCount.innerText = enemies.length;
  const enemyRatio = maxEnemies ? Math.min(1, enemies.length / maxEnemies) : 0;
  const enemyFill = document.getElementById('enemy-fill'); if(enemyFill){ enemyFill.style.width = enemyRatio * 100 + '%'; enemyFill.style.opacity = 0.4 + 0.5 * enemyRatio; }
}

export function drawCrosshair(){
  if(!player) return;
  const centerX = mouseX;
  const centerY = mouseY;
  push();
  translate(centerX, centerY);
  noFill();
  stroke(57, 255, 176, 210); strokeWeight(1.5);
  circle(0, 0, 8);
  line(-13, 0, -6, 0); line(6, 0, 13, 0);
  line(0, -13, 0, -6); line(0, 6, 0, 13);
  if(aimAssistTarget){
    stroke(255, 184, 79, 220); strokeWeight(1);
    circle(aimAssistTarget.x - camX - centerX, aimAssistTarget.y - camY - centerY, (aimAssistTarget.r || 12) * 2 + 10);
    line(0, 0, aimAssistTarget.x - camX - centerX, aimAssistTarget.y - camY - centerY);
  }
  pop();
}

export function keyPressed(){ keys[key.toLowerCase()] = true; return false; }
export function keyReleased(){ keys[key.toLowerCase()] = false; return false; }