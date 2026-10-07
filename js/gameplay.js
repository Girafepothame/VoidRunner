import { Player } from './model/entities/player.js';
import { Particle, Shockwave } from './model/entities/effects.js';
import { meta } from './meta.js';
import { chunkManager, CHUNK_SIZE } from './chunks.js';
import gameData from './data/game.json' with { type: 'json' };
import * as gameRenderer from './view/game-renderer.js';
import { PlayerController } from './gameplay/player-controller.js';
import { WorldController } from './gameplay/world-controller.js';
import { CombatController } from './gameplay/combat-controller.js';
import { ProgressionController } from './gameplay/progression-controller.js';
import { PlayerWeaponController } from './gameplay/player-weapon-controller.js';

// Gameplay run state and orchestration
let uiActions;

export function setUIActions(actions){
  if(!actions || typeof actions.showScreen !== 'function'
    || typeof actions.flashWaveBanner !== 'function'
    || typeof actions.renderLevelUp !== 'function'
    || typeof actions.setHudVisible !== 'function'
    || typeof actions.renderGameOver !== 'function'){
    throw new TypeError('UI actions must provide showScreen, flashWaveBanner, renderLevelUp, setHudVisible, and renderGameOver functions.');
  }
  uiActions = actions;
}

function showScreen(id){
  if(!uiActions) throw new Error('UI actions have not been configured.');
  uiActions.showScreen(id);
}

function flashWaveBanner(text){
  if(!uiActions) throw new Error('UI actions have not been configured.');
  uiActions.flashWaveBanner(text);
}

function setHudVisible(visible){
  if(!uiActions) throw new Error('UI actions have not been configured.');
  uiActions.setHudVisible(visible);
}

let gameState = 'menu'; // menu, playing, paused, levelup, gameover, shop
let player, run;
let bullets = [], enemyBullets = [], enemies = [], asteroids = [], xpOrbs = [], scrapPickups = [], shockwaves = [], lightningArcs = [];
const BIOMES = gameData.biomes;
let keys = {};
let currentCards = [];
const PLAYER_SCALE = 0.65;
export let camX = 0, camY = 0;
let rightMouseDown = false;
const progressionController = new ProgressionController({
  getPlayer: () => player,
  getRun: () => run,
  getXpOrbs: () => xpOrbs,
  getScrapPickups: () => scrapPickups,
  meta,
  isInRange,
  random: (...args) => random(...args),
  cos: angle => cos(angle),
  sin: angle => sin(angle),
  twoPi: () => TWO_PI,
  onLevelUp: () => triggerLevelUp(),
});
const combatController = new CombatController({
  getPlayer: () => player,
  getRun: () => run,
  getBullets: () => bullets,
  getEnemyBullets: () => enemyBullets,
  getEnemies: () => enemies,
  getAsteroids: () => asteroids,
  getLightningArcs: () => lightningArcs,
  getShockwaves: () => shockwaves,
  spawnBurst,
  spawnPickupsFrom: enemy => progressionController.spawnPickupsFrom(enemy),
  spawnXpOrbs: (...args) => progressionController.spawnXpOrbs(...args),
  spawnGoldOrbs: (...args) => progressionController.spawnGoldOrbs(...args),
  isOutsideScreen: (entity, margin) => entity.x < camX - margin || entity.x > camX + width + margin
    || entity.y < camY - margin || entity.y > camY + height + margin,
  getPlayerPlateShape,
  isInRange,
  createColor: (...components) => color(...components),
  rechargeDashFull: currentPlayer => playerController.rechargeDashFull(currentPlayer),
  rechargeDashPercent: (currentPlayer, fraction) => playerController.rechargeDashPercent(currentPlayer, fraction),
});
const playerWeaponController = new PlayerWeaponController({
  getEnemies: () => enemies,
  getAsteroids: () => asteroids,
  getBullets: () => bullets,
  damageEnemy: (enemy, damage) => combatController.damageEnemy(enemy, damage),
  damageAsteroid: (asteroid, damage) => combatController.damageAsteroid(asteroid, damage),
  random: (...args) => random(...args),
  cos: angle => cos(angle),
  sin: angle => sin(angle),
  drawLaser: (currentPlayer, range) => {
    stroke(255,220,120,170);
    strokeWeight(2 + currentPlayer.laserLevel);
    line(
      currentPlayer.x,
      currentPlayer.y,
      currentPlayer.x + cos(currentPlayer.angle) * range,
      currentPlayer.y + sin(currentPlayer.angle) * range,
    );
  },
});
const playerController = new PlayerController({
  getEnemies: () => enemies,
  getEnemyBullets: () => enemyBullets,
  damageEnemy: (enemy, damage) => combatController.damageEnemy(enemy, damage),
  spawnBurst,
  triggerShake,
  createColor: (...components) => color(...components),
});
const worldController = new WorldController({
  getPlayer: () => player,
  getRun: () => run,
  getEnemies: () => enemies,
  getAsteroids: () => asteroids,
  getScrapPickups: () => scrapPickups,
  enemyDefinitions: gameData.enemies,
  dangerConfig: gameData.danger,
  chunkSize: CHUNK_SIZE,
  chunkManager,
  flashWaveBanner,
  spawnBossLaser,
  fireBossLaser,
});

// --- Pool de particules --------------------------------------------------
// Les particules (impacts, morts, explosions...) sont de loin l'entité la
// plus créée/détruite du jeu : un simple burst en spawn/détruit des dizaines
// en continu. Plutôt que new Particle() + push()/splice() (allocations et
// GC en continu), on garde un tableau de taille fixe réutilisé à l'infini.
// spawnBurst() écrit dans les slots existants au lieu d'en créer de
// nouveaux ; updateParticles/drawParticles ne traitent que les slots actifs.
const PARTICLE_POOL_SIZE = 600;
let particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => new Particle(0, 0, 0, 0, 0, null));
particles.forEach(p => { p.active = false; });
let particleCursor = 0;

export function getGameState(){ return gameState; }
export function hasPlayer(){ return player !== undefined && player !== null; }
export function setKeyState(key, isDown){ keys[key.toLowerCase()] = isDown; }

export function enterShop(){ gameState = 'shop'; }
export function exitShop(returnState){ gameState = returnState === 'gameover' ? 'gameover' : 'menu'; }
export function enterDebug(){
  if(gameState !== 'playing' && gameState !== 'paused') return false;
  gameState = 'debug';
  return true;
}
export function exitDebug(){
  if(gameState !== 'debug') return false;
  gameState = 'playing';
  return true;
}

export function pauseRun(){
  if(gameState !== 'playing') return;
  gameState = 'paused';
  showScreen('pause-screen');
  setHudVisible(false);
}

export function resumeRun(){
  if(gameState !== 'paused') return;
  gameState = 'playing';
  showScreen(null);
  setHudVisible(true);
}

export function quitToMenu(){
  if(gameState !== 'paused') return;
  gameState = 'menu';
  showScreen('menu-screen');
  setHudVisible(false);
}

export function makePlayer(profileId='standard'){
  // Le joueur démarre à l'origine du monde (0,0) : c'est aussi le point de
  // référence utilisé par les chunks pour calculer la distance/difficulté.
  return new Player(0, 0, profileId);
}

export function startRun(profileId='standard'){
  camX = 0; camY = 0;
  gameRenderer.resetGameRenderer();
  player = makePlayer(profileId);
  run = {
    time:0, kills:0, score:0, scrapEarned:0, spawnTimer:1,
    biome:0,
  };
  bullets=[]; enemyBullets=[]; enemies=[]; asteroids=[]; xpOrbs=[]; scrapPickups=[]; shockwaves=[]; lightningArcs=[];
  rightMouseDown = false;
  playerWeaponController.reset();
  for(const p of particles) p.active = false;
  particleCursor = 0;
  worldController.reset();
  run.spawnTimer = worldController.computeSpawnInterval();
  gameState = 'playing';
  showScreen(null);
  setHudVisible(true);
}

export function endRun(){
  gameState = 'gameover';
  const earned = progressionController.settleRunRewards();
  setHudVisible(false);
  if(!uiActions) throw new Error('UI actions have not been configured.');
  uiActions.renderGameOver(run.score, earned);
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
  playerController.handleDashKey(dashKeyDown, gameState, player, keys);
  const previousX = player.x;
  const previousY = player.y;
  updateCameraAndAim();
  playerController.updateMovement(player, keys, rightMouseDown);
  if(player.dashTimer <= 0){
    camX += player.x - previousX;
    camY += player.y - previousY;
  }
  playerController.updateTrails(player, player.angle + player.armorRotation);
  updatePlayerResources();
  playerWeaponController.updateTimers(player);
  playerWeaponController.handleWeapons(gameState, player);
}

function updateWorld(){
  worldController.updateChunks();
  updateEnemies(); updateAsteroids(); updateBullets(); updateEnemyBullets(); updateOrbs();
  updateParticles(); updateShockwaves(); checkCollisions();
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
  camX = player.x - width/2;
  camY = player.y - height/2;
  applyShake();
  playerWeaponController.updateAim(player, enemies, mouseX + camX, mouseY + camY);
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

export function requestPlayerDash(){
  if(gameState !== 'playing' || !player) return;
  playerController.requestPlayerDash(player, keys);
}

function updatePlayerResources(){
  if(player.regen > 0 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + player.regen / 60);
  if(player.invuln > 0) player.invuln--;
}

export function setFireButtonDown(isDown){
  playerWeaponController.setFireButtonDown(isDown);
}

export function setRightMouseDown(isDown){
  rightMouseDown = isDown;
  playerWeaponController.setRightMouseDown(isDown);
}

export function requestPlayerReload(){
  return playerWeaponController.requestReload(gameState, player);
}

export function firePlayerBullets(){
  return playerWeaponController.firePlayerBullets(gameState, player);
}

export function fireLaser(){
  playerWeaponController.fireLaser(player);
}

export function triggerChainLightning(source){
  combatController.triggerChainLightning(source);
}

export function difficultyScale(){ return worldController.difficultyScale(); }
export function updateSpawning(){ worldController.updateSpawning(); }
export function spawnAsteroid(){ worldController.spawnAsteroid(); }
export function spawnEnemy(){ worldController.spawnEnemy(); }
export function updateEnemies(){ worldController.updateEnemies(); }
export function updateAsteroids(){ worldController.updateAsteroids(camX, camY); }
function updateThreatTier(){ worldController.updateThreatTier(); }
function getMaxEnemies(){ return worldController.getMaxEnemies(); }

export function updateBullets(){ combatController.updateBullets(); }

function spawnBossLaser(enemy){
  enemy.bossLaserChargeFrames = 120;
}

function fireBossLaser(enemy, playerRef = player){
  const playerOffsetX = playerRef.x - enemy.x, playerOffsetY = playerRef.y - enemy.y;
  if(playerOffsetX * playerOffsetX + playerOffsetY * playerOffsetY > enemy.aggroRange * enemy.aggroRange) return;
  const angle = enemy.angle;
  const originOffset = enemy.laserOriginOffset ?? 104;
  const originX = enemy.x + Math.cos(angle) * originOffset;
  const originY = enemy.y + Math.sin(angle) * originOffset;
  const range = Math.max(0, enemy.aggroRange - originOffset);
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

export function updateEnemyBullets(){ combatController.updateEnemyBullets(); }

export function drawBullets(){
  gameRenderer.drawBullets(getRenderState());
}

export function spawnPickupsFrom(e){
  progressionController.spawnPickupsFrom(e);
}

export function updateOrbs(){
  progressionController.updatePickups();
}
export function drawOrbs(){ gameRenderer.drawOrbs(getRenderState()); }

export function gainXp(n){
  progressionController.gainXp(n);
}

function triggerLevelUp(){
  gameState = 'levelup';
  currentCards = progressionController.getLevelUpChoices();
  uiActions.renderLevelUp(currentCards, player.upgradeCounts, chooseLevelUpCard);
}

function chooseLevelUpCard(upgrade){
  if(!progressionController.applyUpgrade(upgrade)) return false;
  gameState = 'playing';
  showScreen(null);
  return true;
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
function updateLightningArcs(){
  for(let i=lightningArcs.length-1;i>=0;i--){
    lightningArcs[i].life--;
    if(lightningArcs[i].life <= 0) lightningArcs.splice(i, 1);
  }
}

export function drawParticles(){ gameRenderer.drawParticles(getRenderState()); }

export function damageEnemy(enemy, damage){ return combatController.damageEnemy(enemy, damage); }
export function damageAsteroid(asteroid, damage){ return combatController.damageAsteroid(asteroid, damage); }
export function explodeAt(x, y, damage, source){ combatController.explodeAt(x, y, damage, source); }

export function triggerShockwaveAnimation(){
  if(gameState !== 'playing' || !player) return false;
  shockwaves.push(new Shockwave(player.x, player.y, 90));
  return true;
}

export function checkCollisions(){ combatController.checkCollisions(); }

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

const renderState = {};

function getRenderState(){
  renderState.player = player;
  renderState.run = run;
  renderState.bullets = bullets;
  renderState.enemyBullets = enemyBullets;
  renderState.enemies = enemies;
  renderState.asteroids = asteroids;
  renderState.xpOrbs = xpOrbs;
  renderState.scrapPickups = scrapPickups;
  renderState.particles = particles;
  renderState.shockwaves = shockwaves;
  renderState.lightningArcs = lightningArcs;
  renderState.camX = camX;
  renderState.camY = camY;
  renderState.getPlayerPlateShape = getPlayerPlateShape;
  return renderState;
}

export function drawEnemies(){ gameRenderer.drawEnemies(getRenderState()); }
export function drawPlayerShip(){ gameRenderer.drawPlayerShip(getRenderState()); }
export function drawEntities(){ gameRenderer.drawEntities(getRenderState()); }
export function drawEnemyIndicators(){ gameRenderer.drawEnemyIndicators(getRenderState()); }

export function updateHUD(){
  const state = getRenderState();
  state.biomes = BIOMES;
  state.difficultyScale = difficultyScale();
  state.maxEnemies = getMaxEnemies();
  gameRenderer.updateHUD(state);
}

export function drawCrosshair(){
  const state = getRenderState();
  Object.assign(state, playerWeaponController.getAimRenderState());
  gameRenderer.drawCrosshair(state);
}

export function keyPressed(){ setKeyState(key, true); return false; }
export function keyReleased(){ setKeyState(key, false); return false; }