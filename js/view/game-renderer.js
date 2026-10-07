import { isVisibleOnScreen } from '../utils/viewport.js';

const PLAYER_SCALE = 0.65;

let crosshairX = null;
let crosshairY = null;
let crosshairRadius = 10;

export function resetGameRenderer(){
  crosshairX = null;
  crosshairY = null;
  crosshairRadius = 10;
}

export function drawEnemies({ enemies, camX, camY }){
  for(const enemy of enemies){
    if(isVisibleOnScreen(enemy, camX, camY, width, height, enemy.r + 40)) enemy.draw();
  }
}

function drawPlayerTrail(points, lineWidth, wingSide = 0, shipRotation = 0){
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
  for(let i = 0; i < transformedPoints.length - 1; i++){
    const previous = transformedPoints[Math.max(0, i - 1)];
    const start = transformedPoints[i], end = transformedPoints[i + 1];
    const next = transformedPoints[Math.min(transformedPoints.length - 1, i + 2)];
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

export function drawPlayerShip({ player, getPlayerPlateShape }){
  if(!player) return;
  const profile = player.profile;
  const shipRotation = player.angle + player.armorRotation;
  drawPlayerTrail(player.trailPoints, 4.5);
  if(player.showWingTrails){
    for(let i = 0; i < player.wingTrailPoints.length; i++){
      drawPlayerTrail(player.wingTrailPoints[i], 2.2, i === 0 ? -1 : 1, shipRotation);
    }
  }
  push(); translate(player.x, player.y); rotate(shipRotation);
  const flicker = player.invuln > 0 && frameCount % 10 < 5;
  const shipColor = flicker ? color(255, 150, 0) : color(profile.color[0], profile.color[1], profile.color[2]);
  stroke(shipColor); strokeWeight(1); fill(shipColor);
  for(const plate of player.armor){
    beginShape(); getPlayerPlateShape(plate, true).forEach(([x, y]) => vertex(x, y)); endShape(CLOSE);
  }
  noStroke(); fill(255, 225, 150, 240); circle(player.core.x, player.core.y, player.core.radius * 2 * PLAYER_SCALE);
  fill(255, 255, 255, 230); circle(player.core.x, player.core.y, player.core.radius * 0.7 * PLAYER_SCALE);
  pop();
}

export function drawBullets({ bullets, enemyBullets }){
  noStroke();
  for(const bullet of bullets) bullet.draw();
  for(const bullet of enemyBullets){
    if(bullet.isLaser){
      if(typeof bullet.draw === 'function') bullet.draw();
      continue;
    }
    if(typeof bullet.draw === 'function'){ bullet.draw(); continue; }
    fill(255, 110, 140); circle(bullet.x, bullet.y, bullet.size);
  }
}

export function drawOrbs({ xpOrbs, scrapPickups }){
  for(const orb of xpOrbs) orb.draw();
  for(const pickup of scrapPickups) pickup.draw();
}

export function drawParticles({ particles, shockwaves, lightningArcs }){
  noStroke();
  for(const particle of particles){
    if(particle.active) particle.draw();
  }
  for(const wave of shockwaves) wave.draw();
  for(const arc of lightningArcs){
    const alpha = map(arc.life, 0, arc.maxLife, 0, 220);
    stroke(120, 230, 255, alpha); strokeWeight(2.5);
    line(arc.source.x, arc.source.y, arc.target.x, arc.target.y);
    stroke(220, 250, 255, alpha * 0.8); strokeWeight(1);
    line(arc.source.x, arc.source.y, arc.target.x, arc.target.y);
  }
}

function drawAsteroids({ asteroids, camX, camY }){
  for(const asteroid of asteroids){
    if(isVisibleOnScreen(asteroid, camX, camY, width, height, asteroid.r * 1.3)) asteroid.draw();
  }
}

export function drawEntities(state){
  drawOrbs(state);
  drawParticles(state);
  drawAsteroids(state);
  drawEnemies(state);
  drawBullets(state);
  drawPlayerShip(state);
}

export function drawEnemyIndicators({ player, run, enemies, camX, camY }){
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

export function updateHUD({ player, run, enemies, biomes, difficultyScale, maxEnemies }){
  const cursorAmmo = document.querySelectorAll('#cursor-ammo-stack i');
  cursorAmmo.forEach((round, index) => round.classList.toggle('loaded', index < player.ammo));
  const cursorAmmoStack = document.getElementById('cursor-ammo-stack');
  if(cursorAmmoStack) cursorAmmoStack.classList.toggle('reloading', player.reloadTimer > 0);
  const hpRatio = player.maxHp ? constrain(player.hp / player.maxHp, 0, 1) : 0;
  const vignette = document.getElementById('damage-vignette');
  if(vignette) vignette.style.opacity = hpRatio >= 0.7 ? '0' : String(Math.min(0.6, (0.7 - hpRatio) / 0.7 * 0.6));
  const xpFill = document.querySelector('#xp-sliver > div');
  if(xpFill) xpFill.style.width = (player.xp / player.xpNeeded * 100) + '%';
  const wave = document.getElementById('wave-val');
  if(wave) wave.innerText = Math.max(1, Math.floor(difficultyScale));
  const scrapRun = document.getElementById('scrap-run-val');
  if(scrapRun) scrapRun.innerText = run.scrapEarned;
  const score = document.getElementById('score-val');
  if(score) score.innerText = run.score;
  const biome = document.getElementById('biome-val');
  if(biome) biome.innerText = biomes[run.biome % biomes.length].name;
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
  const enemyCount = document.getElementById('enemy-count');
  if(enemyCount) enemyCount.innerText = enemies.length;
  const enemyRatio = maxEnemies ? Math.min(1, enemies.length / maxEnemies) : 0;
  const enemyFill = document.getElementById('enemy-fill');
  if(enemyFill){
    enemyFill.style.width = enemyRatio * 100 + '%';
    enemyFill.style.opacity = 0.4 + 0.5 * enemyRatio;
  }
}

export function drawCrosshair({ player, target, camX, camY, lockCharge, lockChargeFrames, locked }){
  if(!player) return;
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
  if(target && lockCharge > 0 && !locked){
    const progress = lockCharge / lockChargeFrames;
    stroke(57, 255, 176, 230); strokeWeight(3);
    arc(0, 0, crosshairRadius * 2 + 8, crosshairRadius * 2 + 8, -HALF_PI, -HALF_PI + TWO_PI * progress);
  } else if(target && locked){
    stroke(57, 255, 176, 240); strokeWeight(3);
    arc(0, 0, crosshairRadius * 2 + 8, crosshairRadius * 2 + 8, 0, TWO_PI);
  }
  pop();
}
