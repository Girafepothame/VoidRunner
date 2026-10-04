import { Player } from './model/entities/player.js';
import { Bullet } from './model/entities/projectile.js';
import { Enemy } from './model/entities/combat.js';
import { Asteroid } from './model/entities/world.js';
import { Orb, ScrapPickup } from './model/entities/pickups.js';
import { Particle, Shockwave } from './model/entities/effects.js';
import { EXPLOSION_SUB_DEFS, LEVEL_UP_DEFS, meta } from './meta.js';
import { showScreen, flashWaveBanner } from './ui.js';
import { chunkManager, CHUNK_SIZE } from './chunks.js';
import gameData from './data/game.json' with { type: 'json' };

// Gameplay state and logic: spawning, updates, collisions, particles
export let gameState = 'menu'; // menu, playing, paused, levelup, gameover, shop
export let shopReturnState = 'menu';
export let player, run;
export let bullets = [], enemyBullets = [], enemies = [], asteroids = [], xpOrbs = [], scrapPickups = [], shockwaves = [], lightningArcs = [];
const BIOMES = gameData.biomes;
const ENEMY_DEFS = gameData.enemies;
const DANGER_CONFIG = gameData.danger;
export let keys = {};
export let waveBannerTimer = 0;
export let currentCards = [];
const PLAYER_SCALE = 0.65;
const PLAYER_TRAIL_LIFETIME = 42;
const PLAYER_WING_TRAIL_LIFETIME = PLAYER_TRAIL_LIFETIME * 0.25;
const PLAYER_TRAIL_SPACING = 2;
export let camX = 0, camY = 0;
let aimAssistTarget = null;
let aimLockTarget = null;
let aimChargeTarget = null;
let aimLockCharge = 0;
let crosshairX = null, crosshairY = null, crosshairRadius = 10;
export let rightMouseDown = false;
let fireButtonDown = false;
let dashKeyWasDown = false;

const AIM_ASSIST_RANGE = 760;
const AIM_ASSIST_CURSOR_RANGE = 70;
const AIM_LOCK_CHARGE_FRAMES = 45;

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
  for(const enemy of enemies){
    if(isVisibleOnScreen(enemy, enemy.r + 40)) enemy.draw();
  }
}

function updatePlayerTrail(pl, shipRotation){
  for(const point of pl.trailPoints) point.age++;
  while(pl.trailPoints.length && pl.trailPoints[0].age >= PLAYER_TRAIL_LIFETIME){
    pl.trailPoints.shift();
  }
  for(const points of pl.wingTrailPoints){
    for(const point of points) point.age++;
    while(points.length && points[0].age >= PLAYER_WING_TRAIL_LIFETIME) points.shift();
  }

  const forwardX = Math.cos(pl.angle), forwardY = Math.sin(pl.angle);
  const movementX = pl.dashTimer > 0 ? Math.cos(pl.dashAngle) : pl.vx;
  const movementY = pl.dashTimer > 0 ? Math.sin(pl.dashAngle) : pl.vy;
  const forwardSpeed = movementX * forwardX + movementY * forwardY;
  const isReversing = forwardSpeed < -0.2;
  const isMoving = pl.dashTimer > 0 || Math.hypot(pl.vx, pl.vy) > 0.2;

  if(isReversing){
    pl.trailPoints.length = 0;
  } else if(isMoving){
    const rearOffset = 31.5 * PLAYER_SCALE;
    const exhaustX = pl.x - Math.sin(shipRotation) * rearOffset;
    const exhaustY = pl.y + Math.cos(shipRotation) * rearOffset;
    const lastPoint = pl.trailPoints[pl.trailPoints.length - 1];
    if(!lastPoint || Math.hypot(exhaustX - lastPoint.x, exhaustY - lastPoint.y) >= PLAYER_TRAIL_SPACING){
      pl.trailPoints.push({ x: exhaustX, y: exhaustY, age: 0 });
    }
  }

  const showWingTrails = pl.boosting || isReversing;
  if(showWingTrails && isMoving){
    const cos = Math.cos(shipRotation), sin = Math.sin(shipRotation);
    for(let i = 0; i < pl.wingTrailPoints.length; i++){
      const localX = (i === 0 ? -12 : 12) * PLAYER_SCALE;
      const localY = 23 * PLAYER_SCALE;
      const exhaustX = pl.x + localX * cos - localY * sin;
      const exhaustY = pl.y + localX * sin + localY * cos;
      const points = pl.wingTrailPoints[i];
      const lastPoint = points[points.length - 1];
      if(!lastPoint || Math.hypot(exhaustX - lastPoint.x, exhaustY - lastPoint.y) >= PLAYER_TRAIL_SPACING){
        points.push({ x: exhaustX, y: exhaustY, age: 0 });
      }
    }
  } else {
    for(const points of pl.wingTrailPoints) points.length = 0;
  }

  return { showWingTrails };
}

function drawPlayerTrail(pl, points, lineWidth, wingSide = 0, shipRotation = 0){
  if(points.length < 2) return;

  const last = points[points.length - 1];
  const transformedPoints = wingSide === 0 ? points : points.map(point => {
    const dx = point.x - last.x, dy = point.y - last.y;
    const localX = dx * Math.cos(shipRotation) + dy * Math.sin(shipRotation);
    const localY = -dx * Math.sin(shipRotation) + dy * Math.cos(shipRotation);
    const angle = -wingSide * Math.PI / 4;
    const rotatedX = localX * Math.cos(angle) - localY * Math.sin(angle);
    const rotatedY = localX * Math.sin(angle) + localY * Math.cos(angle);
    return {
      x: last.x + rotatedX * Math.cos(shipRotation) - rotatedY * Math.sin(shipRotation),
      y: last.y + rotatedX * Math.sin(shipRotation) + rotatedY * Math.cos(shipRotation),
    };
  });
  const trailStart = transformedPoints[0], trailEnd = transformedPoints[transformedPoints.length - 1];
  const context = drawingContext;
  context.save();
  const gradient = context.createLinearGradient(trailStart.x, trailStart.y, trailEnd.x, trailEnd.y);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(1, 'rgba(255,255,255,1)');
  context.strokeStyle = gradient;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(trailStart.x, trailStart.y);
  for(let i=0;i<transformedPoints.length-1;i++){
    const previous = transformedPoints[Math.max(0, i-1)];
    const start = transformedPoints[i], end = transformedPoints[i+1];
    const next = transformedPoints[Math.min(transformedPoints.length-1, i+2)];
    context.bezierCurveTo(
      start.x + (end.x - previous.x) / 6,
      start.y + (end.y - previous.y) / 6,
      end.x - (next.x - start.x) / 6,
      end.y - (next.y - start.y) / 6,
      end.x,
      end.y,
    );
  }
  context.stroke();
  context.restore();
}

export function drawPlayerShip(){
  const pl = player; if(!pl) return;
  const profile = pl.profile;
  const shipRotation = pl.angle + pl.armorRotation;
  const { showWingTrails } = updatePlayerTrail(pl, shipRotation);
  drawPlayerTrail(pl, pl.trailPoints, 4.5);
  if(showWingTrails){
    for(let i = 0; i < pl.wingTrailPoints.length; i++){
      drawPlayerTrail(pl, pl.wingTrailPoints[i], 2.2, i === 0 ? -1 : 1, shipRotation);
    }
  }
  push(); translate(pl.x, pl.y); rotate(shipRotation);
  const flicker = pl.invuln>0 && frameCount%10<5;
  const shipColor = flicker ? color(255,150,0) : color(profile.color[0],profile.color[1],profile.color[2]);
  stroke(shipColor); strokeWeight(1); fill(shipColor);
  for(const plate of pl.armor){
    if(plate.respawnTimer > 0) continue;
    beginShape(); getPlayerPlateShape(plate, true).forEach(([x,y]) => vertex(x,y)); endShape(CLOSE);
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
  crosshairX = null; crosshairY = null; crosshairRadius = 10;
  player = makePlayer(profileId);
  run = {
    time:0, kills:0, score:0, scrapEarned:0, spawnTimer:1,
    biome:0,
  };
  bullets=[]; enemyBullets=[]; enemies=[]; asteroids=[]; xpOrbs=[]; scrapPickups=[]; shockwaves=[]; lightningArcs=[];
  aimAssistTarget = null;
  aimLockTarget = null;
  aimChargeTarget = null;
  aimLockCharge = 0;
  rightMouseDown = false;
  fireButtonDown = false;
  for(const p of particles) p.active = false;
  particleCursor = 0;
  chunkManager.reset(); // repart d'un monde vierge à chaque nouvelle run
  lastThreatTier = 0;
  run.spawnTimer = computeSpawnInterval();
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

export function updateRun(){
  run.time += 1/60;
  updatePlayer();
  updateSpawning();
  updateThreatTier();
  updateWorld();
  handlePlayerDefeat();
}

export function updatePlayer(){
  const dashKeyDown = typeof keyIsDown === 'function' && keyIsDown(32);
  if(dashKeyDown && !dashKeyWasDown) requestPlayerDash();
  dashKeyWasDown = dashKeyDown;
  const previousX = player.x;
  const previousY = player.y;
  updateCameraAndAim();
  updateMovement();
  if(player.dashTimer <= 0){
    camX += player.x - previousX;
    camY += player.y - previousY;
  }
  updatePlayerResources();
  handlePlayerWeapons();
}

function updateWorld(){
  updateChunks();
  updateEnemies(); updateAsteroids(); updateBullets(); updateEnemyBullets(); updateOrbs();
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
  if(aimLockTarget && !enemies.includes(aimLockTarget)){
    aimLockTarget = null;
    aimLockCharge = 0;
  }
  const hoveredTarget = rightMouseDown ? findAimAssistTarget() : null;
  if(!rightMouseDown){
    aimAssistTarget = null;
    aimLockTarget = null;
    aimChargeTarget = null;
    aimLockCharge = 0;
  } else if(aimLockTarget){
    aimAssistTarget = aimLockTarget;
  } else {
    aimAssistTarget = hoveredTarget;
    if(hoveredTarget){
      if(hoveredTarget !== aimChargeTarget){
        aimChargeTarget = hoveredTarget;
        aimLockCharge = 0;
      }
      aimLockCharge++;
      if(aimLockCharge >= AIM_LOCK_CHARGE_FRAMES){
        aimLockTarget = hoveredTarget;
        aimLockCharge = AIM_LOCK_CHARGE_FRAMES;
      }
    } else {
      aimChargeTarget = null;
      aimLockCharge = 0;
    }
  }
  const targetAngle = aimAssistTarget
    ? atan2(aimAssistTarget.y - player.y, aimAssistTarget.x - player.x)
    : mouseAngle;
  let delta = targetAngle - player.angle;
  while(delta > PI) delta -= TWO_PI;
  while(delta < -PI) delta += TWO_PI;
  const speedRatio = constrain(Math.hypot(player.vx, player.vy) / (player.speed * 2.25), 0, 1);
  const maxTurnRate = 0.22 - speedRatio * 0.165;
  const turnAcceleration = 0.035 * (1 - speedRatio * 0.65);
  const brakingRate = Math.sqrt(2 * turnAcceleration * Math.abs(delta));
  const targetTurnVelocity = Math.sign(delta) * Math.min(maxTurnRate, brakingRate);
  player.turnVelocity += constrain(
    targetTurnVelocity - player.turnVelocity,
    -turnAcceleration,
    turnAcceleration,
  );
  if(Math.abs(delta) <= Math.abs(player.turnVelocity) && delta * player.turnVelocity >= 0){
    player.angle += delta;
    player.turnVelocity = 0;
  } else {
    player.angle += player.turnVelocity;
  }
}

function findAimAssistTarget(){
  let bestTarget = null;
  let bestScore = Infinity;
  const cursorX = mouseX + camX;
  const cursorY = mouseY + camY;
  for(const enemy of enemies){
    const distanceFromPlayer = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    const distanceFromCursor = Math.hypot(enemy.x - cursorX, enemy.y - cursorY);
    const cursorRange = Math.max(AIM_ASSIST_CURSOR_RANGE, (enemy.r || 0) + 30);
    if(distanceFromPlayer <= 1 || distanceFromPlayer > AIM_ASSIST_RANGE || distanceFromCursor > cursorRange) continue;
    const score = distanceFromCursor + distanceFromPlayer * 0.02;
    if(score < bestScore){ bestScore = score; bestTarget = enemy; }
  }
  return bestTarget;
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
    player.boosting = false;
    updateAimOpening();
    return; // l'impulsion de dash prend le pas sur le déplacement normal
  }
  applyDirectionalMovement();
  updateAimOpening();
}

function updateAimOpening(){
  const aimOpening = rightMouseDown ? 1 : 0;
  player.aimOpening += (aimOpening - player.aimOpening) * 0.2;
}

function applyDirectionalMovement(){
  const forward = (keys['z'] ? 1 : 0) - (keys['s'] ? 1 : 0);
  const strafe = (keys['d'] ? 1 : 0) - (keys['q'] ? 1 : 0);
  const boosting = keys['shift'] && player.boost > 0 && (forward !== 0 || strafe !== 0);
  player.boosting = boosting;
  const boostHeldWhileMoving = keys['shift'] && (forward !== 0 || strafe !== 0);
  player.boost = boosting
    ? Math.max(0, player.boost - 1.8)
    : boostHeldWhileMoving
      ? player.boost
      : Math.min(player.boostMax, player.boost + 0.65 + player.boostRegenBonus);
  const hasInput = forward !== 0 || strafe !== 0;
  if(hasInput){
    if(keys['z']) player.lastMoveDirection = 'z';
    else if(keys['s']) player.lastMoveDirection = 's';
    else if(keys['q']) player.lastMoveDirection = 'q';
    else if(keys['d']) player.lastMoveDirection = 'd';
  }
  const acceleration = 0.52;
  const deceleration = 0.22;
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
  if(gameState !== 'playing' || !player) return;
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
  if(player.wingRecoil > 0) player.wingRecoil = Math.max(0, player.wingRecoil - 0.16);
  if(player.reloadTimer > 0){
    player.reloadTimer--;
    if(player.reloadTimer === 0) player.ammo = player.magazineSize;
  }
  for(const plate of player.armor){
    if(plate.respawnTimer > 0){
      plate.respawnTimer--;
      if(plate.respawnTimer === 0) plate.hp = plate.maxHp;
    }
  }
}

function handlePlayerWeapons(){
  const firing = fireButtonDown;
  if(firing && player.reloadTimer <= 0){
    if(player.ammo <= 0) requestPlayerReload();
    else if(player.fireCooldown <= 0 && firePlayerBullets()) player.fireCooldown = player.fireRate;
  }
  if(player.laserLevel > 0 && firing) fireLaser();
}

export function setFireButtonDown(isDown){
  fireButtonDown = isDown;
}

export function setRightMouseDown(isDown){
  if(isDown && !rightMouseDown && aimLockTarget){
    aimLockTarget = null;
    aimAssistTarget = null;
    aimChargeTarget = null;
    aimLockCharge = 0;
  }
  rightMouseDown = isDown;
}

export function requestPlayerReload(){
  if(gameState !== 'playing' || !player || player.reloadTimer > 0 || player.ammo >= player.magazineSize) return false;
  player.reloadTimer = player.reloadDuration;
  return true;
}

export function firePlayerBullets(){
  if(player.ammo <= 0 || player.reloadTimer > 0) return false;
  const n = Math.min(Math.max(1, Math.floor(player.multishot)), player.ammo);
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
  player.wingRecoil = 1;
  player.ammo -= n;
  if(player.ammo === 0) requestPlayerReload();
  return true;
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
  if(enemies.length >= getMaxEnemies()){
    run.spawnTimer = Math.min(run.spawnTimer, 20);
    return;
  }
  run.spawnTimer--;
  if(run.spawnTimer <= 0){
    spawnEnemy();
    if(random() < 0.12) spawnAsteroid();
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
  // Monde infini : les positions de spawn sont relatives au joueur.
  const edge = floor(random(4)); let x, y;
  const margin = 80;
  if(edge===0){ x=player.x + random(-width/2, width/2); y=player.y-height/2-margin; }
  else if(edge===1){ x=player.x+width/2+margin; y=player.y+random(-height/2, height/2); }
  else if(edge===2){ x=player.x + random(-width/2, width/2); y=player.y+height/2+margin; }
  else { x=player.x-width/2-margin; y=player.y+random(-height/2, height/2); }
  const rewardType = random() < 0.5 ? 'xp' : 'scrap';
  const radius = random(40, 68);
  const asteroidHp = Math.round(35 + (difficultyScale() - 1) * 18);
  asteroids.push(new Asteroid({ x, y, vx:random(-0.45, 0.45), vy:random(-0.45, 0.45), r:radius,
    hp:asteroidHp, maxHp:asteroidHp, rewardType,
    reward:Math.max(1, Math.round(radius / 8)), lifetime:45 * 60 }));
}

export function spawnEnemy(){
  const edge = floor(random(4)); let x,y;
  const margin = 100;
  if(edge===0){ x=player.x + random(-width/2,width/2); y=player.y-height/2-margin; }
  else if(edge===1){ x=player.x+width/2+margin; y=player.y+random(-height/2,height/2); }
  else if(edge===2){ x=player.x + random(-width/2,width/2); y=player.y+height/2+margin; }
  else { x=player.x-width/2-margin; y=player.y+random(-height/2,height/2); }
  const scale = difficultyScale();
  const roll = random();
  const type = roll < 0.2 ? 'charger' : roll < 0.35 ? 'bombardier' : 'fighter';
  const base = ENEMY_DEFS[type];
  const speedMult = 1 + (scale - 1) * 0.04;
  const desiredSpeed = base.speed * speedMult;
  const maxAllowed = (player && player.speed) ? player.speed * 0.75 : desiredSpeed;
  const finalSpeed = Math.min(desiredSpeed, maxAllowed);
  const dashSpeed = base.dashSpeed
    ? Math.min(base.dashSpeed * speedMult, player.speed * 2.5)
    : finalSpeed;
  enemies.push(new Enemy({
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

export function updateEnemies(){
  for(const e of enemies){
    e.update(player, asteroids);
  }
}

// Les mini-boss sont retirés pour le moment : le jeu ne garde que la base
// ennemie simple et lisible, sans variations ni boss de phase.
export function updateAsteroids(){
  for(let i=asteroids.length-1;i>=0;i--){
    const asteroid = asteroids[i];
    if(asteroid.lifetime > 0){
      asteroid.lifetime--;
      if(asteroid.lifetime === 0){ asteroids.splice(i, 1); continue; }
    }
    // Les astéroïdes de décor restent chargés avec leurs chunks, mais leur
    // mouvement peut être suspendu loin de la caméra jusqu'à ce qu'ils
    // redeviennent pertinents à l'écran.
    if(!asteroid._chunkKey || isVisibleOnScreen(asteroid, Math.max(width, height))) asteroid.update();
    // Les astéroïdes de spawn libres sont aussi supprimés dès qu'ils dérivent
    // trop loin, même s'ils n'ont pas atteint leur durée de vie maximale.
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

function spawnBossLaser(enemy){
  enemy.bossLaserChargeFrames = 120;
}

function fireBossLaser(enemy, playerRef = player){
  const playerOffsetX = playerRef.x - enemy.x, playerOffsetY = playerRef.y - enemy.y;
  if(playerOffsetX * playerOffsetX + playerOffsetY * playerOffsetY > enemy.aggroRange * enemy.aggroRange) return;
  const angle = enemy.angle;
  const originX = enemy.x + Math.cos(angle) * 104;
  const originY = enemy.y + Math.sin(angle) * 104;
  const range = Math.max(0, enemy.aggroRange - 104);
  const targetX = originX + Math.cos(angle) * range;
  const targetY = originY + Math.sin(angle) * range;
  enemyBullets.push({
    isLaser: true,
    x: targetX,
    y: targetY,
    previousX: originX,
    previousY: originY,
    originX,
    originY,
    targetX,
    targetY,
    activeFrames: 12,
    elapsed: 0,
    size: 50,
    hasHit: false,
    draw(){
      const alpha = map(this.elapsed, 0, this.activeFrames, 255, 100);
      push(); strokeCap(ROUND);
      stroke(255, 190, 230, alpha); strokeWeight(this.size);
      line(this.originX, this.originY, this.targetX, this.targetY);
      stroke(255, 45, 150, alpha); strokeWeight(this.size * 0.86);
      line(this.originX, this.originY, this.targetX, this.targetY);
      pop();
    },
    update(){
      this.elapsed++;
      this.exploded = this.elapsed > this.activeFrames;
      this.previousX = this.originX;
      this.previousY = this.originY;
    },
  });
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
    if(bullet.exploded){ enemyBullets.splice(i, 1); continue; }
    if(bullet.isLaser){
      if(!bullet.hasHit && damagePlayerAtProjectile(bullet)){
        bullet.hasHit = true;
        player.invuln = 8;
        spawnBurst(player.x, player.y, color(255, 120, 180), 12);
      }
      continue;
    }
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

export function drawBullets(){
  noStroke();
  for(const b of bullets) b.draw();
  for(const b of enemyBullets){
    if(b.isLaser){
      if(typeof b.draw === 'function'){ b.draw(); }
      continue;
    }
    if(typeof b.draw === 'function'){ b.draw(); continue; }
    fill(255,110,140); circle(b.x,b.y,b.size);
  }
}

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
    player.xpNeeded = Math.round(6 + player.level*3.2);
    triggerLevelUp();
  }
}

function triggerLevelUp(){
  gameState = 'levelup';
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
  e.provoked = true;
  e.hp -= damage;
  if(e.hp<=0){
    run.score += e.score; run.kills += 1;
    spawnBurst(e.x,e.y, color(e.color[0],e.color[1],e.color[2]), e.isMiniboss ? 34 : 16);
    spawnPickupsFrom(e);
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

export function triggerShockwaveAnimation(){
  if(gameState !== 'playing' || !player) return false;
  shockwaves.push(new Shockwave(player.x, player.y, 90));
  return true;
}

function ricochetFrom(b, target){
  if(b.ricochets <= 0) return false;
  const dx = b.x - target.x, dy = b.y - target.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance, ny = dy / distance;
  const velocityAlongNormal = b.vx * nx + b.vy * ny;
  b.vx -= 2 * velocityAlongNormal * nx;
  b.vy -= 2 * velocityAlongNormal * ny;
  const targetRadius = target.collisionRadius ?? target.r;
  b.x = target.x + nx * (targetRadius + b.size / 2 + 1);
  b.y = target.y + ny * (targetRadius + b.size / 2 + 1);
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
  const enemyGrid = bullets.length && enemies.length ? buildSpatialGrid(enemies) : null;
  const asteroidGrid = bullets.length && asteroids.length ? buildSpatialGrid(asteroids) : null;

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
  collideEnemiesWithAsteroids();
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
  const targetRadius = target.collisionRadius ?? target.r;
  return Math.hypot(target.x - closestX, target.y - closestY) < targetRadius + bullet.size / 2;
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

function getPlayerPlateShape(plate, visual = false){
  const aimSpread = player.aimOpening * 10;
  let centerX = 0;
  for(const [x] of plate.shape) centerX += x;
  centerX /= plate.shape.length || 1;
  const wingSide = plate.id === 'right-wing' ? 1 : plate.id === 'left-wing' ? -1 : 0;
  const recoil = visual && wingSide ? player.wingRecoil : 0;
  const offsetX = Math.sign(centerX) * aimSpread + wingSide * recoil * 5;
  const offsetY = recoil * 8;
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
    const polygon = getPlayerPlateShape(plate);
    const hit = bullet.isLaser
      ? laserTouchesPolygon(start, end, polygon, bullet.size / 2)
      : segmentTouchesPolygon(start, end, polygon);
    if(hit) return damagePlayerPlate(plate);
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

function laserTouchesPolygon(start, end, polygon, radius){
  if(segmentTouchesPolygon(start, end, polygon)) return true;
  const radiusSquared = radius * radius;
  const pointSegmentDistanceSquared = (point, segmentStart, segmentEnd) => {
    const dx = segmentEnd.x - segmentStart.x, dy = segmentEnd.y - segmentStart.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared === 0 ? 0 : constrain(((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSquared, 0, 1);
    const closestX = segmentStart.x + dx * projection;
    const closestY = segmentStart.y + dy * projection;
    return (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
  };
  for(let i=0; i<polygon.length; i++){
    const current = { x: polygon[i][0], y: polygon[i][1] };
    const next = { x: polygon[(i + 1) % polygon.length][0], y: polygon[(i + 1) % polygon.length][1] };
    if(pointSegmentDistanceSquared(current, start, end) <= radiusSquared
      || pointSegmentDistanceSquared(start, current, next) <= radiusSquared
      || pointSegmentDistanceSquared(end, current, next) <= radiusSquared) return true;
  }
  return false;
}

function wasRecentlyHit(bullet, target){
  return bullet.lastHit === target && bullet.ricochetCooldown > 0;
}

function collidePlayerWithEnemies(){
  if(player.invuln > 0) return;
  for(const enemy of enemies){
    if(!isInRange(enemy, player, (enemy.collisionRadius ?? enemy.r) + 14)) continue;
    damagePlayerAtPoint(enemy.x, enemy.y); player.invuln = 45;
    spawnBurst(player.x, player.y, color(255,120,140), 10);
    break;
  }
}

function collidePlayerWithAsteroids(){
  if(player.invuln > 0) return;
  for(const asteroid of asteroids){
    const dx = player.x - asteroid.x;
    const dy = player.y - asteroid.y;
    const distance = Math.hypot(dx, dy);
    const collisionDistance = asteroid.r + 14;
    if(distance >= collisionDistance) continue;
    const normalX = distance > 0 ? dx / distance : 1;
    const normalY = distance > 0 ? dy / distance : 0;
    const contactPoints = [
      [asteroid.x + normalX * asteroid.r, asteroid.y + normalY * asteroid.r],
      [player.x - normalX * 8, player.y - normalY * 8],
      [player.x, player.y],
    ];
    for(const [contactX, contactY] of contactPoints){
      if(damagePlayerAtPoint(contactX, contactY)) break;
    }
    const separation = collisionDistance - distance + 0.5;
    player.x += normalX * separation;
    player.y += normalY * separation;
    const relativeVx = player.vx - (asteroid.vx ?? 0);
    const relativeVy = player.vy - (asteroid.vy ?? 0);
    const normalVelocity = relativeVx * normalX + relativeVy * normalY;
    if(normalVelocity < 0){
      const impulse = -normalVelocity * 1.8;
      player.vx += normalX * impulse;
      player.vy += normalY * impulse;
    } else {
      player.vx += normalX * 2.8;
      player.vy += normalY * 2.8;
    }
    player.invuln = 45;
    spawnBurst(player.x, player.y, color(255,184,79), 10);
    break;
  }
}

function collideEnemiesWithAsteroids(){
  for(const enemy of enemies){
    for(const asteroid of asteroids){
      const dx = enemy.x - asteroid.x;
      const dy = enemy.y - asteroid.y;
      const distance = Math.hypot(dx, dy);
      const collisionDistance = (enemy.collisionRadius ?? enemy.r) + asteroid.r;
      if(distance >= collisionDistance) continue;

      const normalX = distance > 0 ? dx / distance : Math.cos(enemy.angle || 0);
      const normalY = distance > 0 ? dy / distance : Math.sin(enemy.angle || 0);
      enemy.x += normalX * (collisionDistance - distance + 0.5);
      enemy.y += normalY * (collisionDistance - distance + 0.5);
      if(enemy.asteroidContactCooldown > 0) break;

      enemy.asteroidContactCooldown = 24;
      const charging = enemy.behavior === 'charger' && enemy.chargeState === 'dash';
      const impactDamage = Math.max(1, Math.round(asteroid.r * (charging ? 0.18 : 0.1)));
      const impactSpeed = charging
        ? Math.hypot(enemy.chargeVelocityX, enemy.chargeVelocityY)
        : enemy.speed * (enemy.aggroed ? 1.5 : 0.65);
      damageEnemy(enemy, impactDamage);
      if(!enemies.includes(enemy)) break;

      if(charging){
        const directionDot = enemy.dashDirectionX * normalX + enemy.dashDirectionY * normalY;
        if(directionDot < 0){
          enemy.dashDirectionX -= 2 * directionDot * normalX;
          enemy.dashDirectionY -= 2 * directionDot * normalY;
        }
      }
      enemy.angle = Math.atan2(normalY, normalX);
      const reboundSpeed = Math.max(enemy.behavior === 'charger' ? 4 : 2.5, Math.min(impactSpeed * 0.8, 12));
      enemy.bounceVelocityX = normalX * reboundSpeed;
      enemy.bounceVelocityY = normalY * reboundSpeed;
      enemy.bounceFrames = 8;
      spawnBurst(enemy.x, enemy.y, color(enemy.color[0], enemy.color[1], enemy.color[2]), 8);
      break;
    }
  }
}

export function drawEntities(){
  drawOrbs();
  drawParticles();
  drawAsteroids();
  drawEnemies();
  drawBullets();
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
  for(const asteroid of asteroids){
    if(isVisibleOnScreen(asteroid, asteroid.r * 1.3)) asteroid.draw();
  }
}

function isVisibleOnScreen(entity, margin){
  return entity.x >= camX - margin && entity.x <= camX + width + margin
    && entity.y >= camY - margin && entity.y <= camY + height + margin;
}

export function updateHUD(){
  const cursorAmmo = document.querySelectorAll('#cursor-ammo-stack i');
  cursorAmmo.forEach((round, index) => round.classList.toggle('loaded', index < player.ammo));
  const cursorAmmoStack = document.getElementById('cursor-ammo-stack');
  if(cursorAmmoStack) cursorAmmoStack.classList.toggle('reloading', player.reloadTimer > 0);
  const hpRatio = player.maxHp ? constrain(player.hp / player.maxHp, 0, 1) : 0;
  const healthCount = document.getElementById('health-count');
  if(healthCount) healthCount.innerText = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  const healthFill = document.getElementById('health-fill');
  if(healthFill){
    healthFill.style.width = `${hpRatio * 100}%`;
    healthFill.classList.toggle('critical', hpRatio < 0.3);
  }
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
  const dashGlyph = document.getElementById('dash-glyph');
  if(dashGlyph){
    const ready = player.dashCooldownTimer <= 0;
    dashGlyph.style.opacity = ready ? '1' : '0.35';
    dashGlyph.classList.toggle('ready', ready);
  }
  const dashCountdown = document.getElementById('dash-countdown');
  if(dashCountdown){
    dashCountdown.innerText = player.dashCooldownTimer <= 0
      ? 'PRÊT'
      : `${Math.ceil(player.dashCooldownTimer / 60)}s`;
  }
  const boostGlyph = document.getElementById('boost-glyph');
  if(boostGlyph){
    const boostRatio = player.boostMax ? constrain(player.boost / player.boostMax, 0, 1) : 0;
    boostGlyph.style.opacity = String(0.25 + boostRatio * 0.75);
    boostGlyph.classList.toggle('ready', boostRatio >= 0.6);
    const boostCount = document.getElementById('boost-count');
    if(boostCount) boostCount.innerText = `${Math.round(boostRatio * 100)}%`;
  }
  const maxEnemies = getMaxEnemies();
  const enemyCount = document.getElementById('enemy-count'); if(enemyCount) enemyCount.innerText = enemies.length;
  const enemyRatio = maxEnemies ? Math.min(1, enemies.length / maxEnemies) : 0;
  const enemyFill = document.getElementById('enemy-fill'); if(enemyFill){ enemyFill.style.width = enemyRatio * 100 + '%'; enemyFill.style.opacity = 0.4 + 0.5 * enemyRatio; }
}

export function drawCrosshair(){
  if(!player) return;
  const target = aimAssistTarget;
  const destinationX = target ? target.x - camX : mouseX;
  const destinationY = target ? target.y - camY : mouseY;
  const destinationRadius = target ? (target.collisionRadius ?? target.r) + 7 : 10;
  if(crosshairX === null || crosshairY === null){
    crosshairX = mouseX;
    crosshairY = mouseY;
  }
  if(target){
    crosshairX += (destinationX - crosshairX) * 0.42;
    crosshairY += (destinationY - crosshairY) * 0.42;
    crosshairRadius += (destinationRadius - crosshairRadius) * 0.42;
  } else {
    crosshairX = mouseX;
    crosshairY = mouseY;
    crosshairRadius = 10;
  }
  push();
  translate(crosshairX, crosshairY);
  noFill();
  stroke(57, 255, 176, 220);
  strokeWeight(target ? 2 : 1.5);
  circle(0, 0, crosshairRadius * 2);
  circle(0, 0, 3);
  if(target && aimLockCharge > 0 && !aimLockTarget){
    const progress = aimLockCharge / AIM_LOCK_CHARGE_FRAMES;
    stroke(57, 255, 176, 230); strokeWeight(3);
    arc(0, 0, crosshairRadius * 2 + 8, crosshairRadius * 2 + 8, -HALF_PI, -HALF_PI + TWO_PI * progress);
  } else if(target && aimLockTarget){
    stroke(57, 255, 176, 240); strokeWeight(3);
    arc(0, 0, crosshairRadius * 2 + 8, crosshairRadius * 2 + 8, 0, TWO_PI);
  }
  pop();
}

export function keyPressed(){ keys[key.toLowerCase()] = true; return false; }
export function keyReleased(){ keys[key.toLowerCase()] = false; return false; }