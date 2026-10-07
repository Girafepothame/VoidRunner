import { Shockwave } from '../model/entities/effects.js';

const COLLISION_CELL_SIZE = 150;
const COLLISION_QUERY_MARGIN = 70;
const EMPTY_ARRAY = [];

// The query box covers each projectile's swept segment plus a safe target-radius margin.
function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function cellKeyOf(cx, cy){
  return cx + '_' + cy;
}

export class CombatController {
  constructor({
    getPlayer,
    getRun,
    getBullets,
    getEnemyBullets,
    getEnemies,
    getAsteroids,
    getLightningArcs,
    getShockwaves,
    spawnBurst,
    spawnPickupsFrom,
    spawnXpOrbs,
    spawnGoldOrbs,
    isOutsideScreen,
    getPlayerPlateShape,
    isInRange,
    createColor,
    rechargeDashFull,
    rechargeDashPercent,
  }){
    this.getPlayer = getPlayer;
    this.getRun = getRun;
    this.getBullets = getBullets;
    this.getEnemyBullets = getEnemyBullets;
    this.getEnemies = getEnemies;
    this.getAsteroids = getAsteroids;
    this.getLightningArcs = getLightningArcs;
    this.getShockwaves = getShockwaves;
    this.spawnBurst = spawnBurst;
    this.spawnPickupsFrom = spawnPickupsFrom;
    this.spawnXpOrbs = spawnXpOrbs;
    this.spawnGoldOrbs = spawnGoldOrbs;
    this.isOutsideScreen = isOutsideScreen;
    this.getPlayerPlateShape = getPlayerPlateShape;
    this.isInRange = isInRange;
    this.createColor = createColor;
    this.rechargeDashFull = rechargeDashFull;
    this.rechargeDashPercent = rechargeDashPercent;
  }

  updateBullets(){
    const bullets = this.getBullets();
    const enemies = this.getEnemies();
    for(let i = bullets.length - 1; i >= 0; i--){
      const bullet = bullets[i];
      bullet.update(enemies);
      if(bullet.ricochetCooldown > 0) bullet.ricochetCooldown--;
      if(this.isOutsideScreen(bullet, 20)) bullets.splice(i, 1);
    }
  }

  updateEnemyBullets(){
    const bullets = this.getEnemyBullets();
    const player = this.getPlayer();
    for(let i = bullets.length - 1; i >= 0; i--){
      const bullet = bullets[i];
      bullet.update();
      if(bullet.exploded){ bullets.splice(i, 1); continue; }
      if(bullet.isLaser){
        if(!bullet.hasHit && this.damagePlayerAtProjectile(bullet, 28)){
          bullet.hasHit = true;
          player.invuln = 8;
          this.spawnBurst(player.x, player.y, this.createColor(255, 120, 180), 12);
        }
        continue;
      }
      if(this.isOutsideScreen(bullet, 40)){ bullets.splice(i, 1); continue; }
      if(!this.isInRange(bullet, player, bullet.size + 32)) continue;
      this.damagePlayerWithBullet(bullet, i);
    }
  }

  damagePlayerWithBullet(bullet, index){
    const player = this.getPlayer();
    if(this.damagePlayerAtProjectile(bullet)){
      player.invuln = 8;
      this.spawnBurst(bullet.x, bullet.y, this.createColor(255, 120, 140), 8);
    }
    this.getEnemyBullets().splice(index, 1);
  }

  damageEnemy(enemy, damage){
    const player = this.getPlayer();
    const run = this.getRun();
    const enemies = this.getEnemies();
    enemy.provoked = true;
    enemy.hp -= damage;
    if(enemy.hp > 0) return false;
    run.score += enemy.score;
    run.kills += 1;
    this.spawnBurst(
      enemy.x,
      enemy.y,
      this.createColor(enemy.color[0], enemy.color[1], enemy.color[2]),
      enemy.isMiniboss ? 34 : 16,
    );
    this.spawnPickupsFrom(enemy);
    if(player.dashTimer > 0) this.rechargeDashFull(player);
    else this.rechargeDashPercent(player, 0.2);
    enemies.splice(enemies.indexOf(enemy), 1);
    return true;
  }

  damageAsteroid(asteroid, damage){
    const run = this.getRun();
    const asteroids = this.getAsteroids();
    asteroid.hp -= damage;
    if(asteroid.hp > 0) return false;
    run.score += 8;
    const colorValue = asteroid.rewardType === 'xp'
      ? this.createColor(79, 217, 255)
      : this.createColor(255, 184, 79);
    this.spawnBurst(asteroid.x, asteroid.y, colorValue, 14);
    if(asteroid.rewardType === 'xp') this.spawnXpOrbs(asteroid.x, asteroid.y, asteroid.reward);
    else this.spawnGoldOrbs(asteroid.x, asteroid.y, Math.max(10, Math.round(asteroid.r * 0.5)));
    asteroids.splice(asteroids.indexOf(asteroid), 1);
    return true;
  }

  explodeAt(x, y, damage, source){
    const player = this.getPlayer();
    const enemies = this.getEnemies();
    const radius = player.explosionRadius;
    const explosionDamage = damage * (player.explosionDamage / 0.2);
    this.getShockwaves().push(new Shockwave(x, y, radius));
    let hit = false;
    for(const enemy of enemies.slice()){
      if(enemy !== source && Math.hypot(x - enemy.x, y - enemy.y) <= radius){
        this.damageEnemy(enemy, explosionDamage);
        hit = true;
      }
    }
    if(hit) this.spawnBurst(x, y, this.createColor(255, 184, 79), 10);
  }

  triggerChainLightning(source){
    const player = this.getPlayer();
    if(player.chainLightning <= 0) return;
    const enemies = this.getEnemies();
    const target = enemies.find(enemy => enemy !== source && Math.hypot(enemy.x - source.x, enemy.y - source.y) < 120);
    if(!target) return;
    this.damageEnemy(target, player.dmg * 0.35 * player.chainLightning);
    this.getLightningArcs().push({ source, target, life: 8, maxLife: 8 });
  }

  ricochetFrom(bullet, target){
    if(bullet.ricochets <= 0) return false;
    const dx = bullet.x - target.x, dy = bullet.y - target.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance, ny = dy / distance;
    const velocityAlongNormal = bullet.vx * nx + bullet.vy * ny;
    bullet.vx -= 2 * velocityAlongNormal * nx;
    bullet.vy -= 2 * velocityAlongNormal * ny;
    const targetRadius = target.collisionRadius ?? target.r;
    bullet.x = target.x + nx * (targetRadius + bullet.size / 2 + 1);
    bullet.y = target.y + ny * (targetRadius + bullet.size / 2 + 1);
    bullet.ricochets--;
    bullet.lastHit = target;
    bullet.ricochetCooldown = 3;
    return true;
  }

  buildSpatialGrid(entities){
    const grid = new Map();
    for(const item of entities){
      const cx = Math.floor(item.x / COLLISION_CELL_SIZE);
      const cy = Math.floor(item.y / COLLISION_CELL_SIZE);
      const key = cellKeyOf(cx, cy);
      let bucket = grid.get(key);
      if(!bucket){ bucket = []; grid.set(key, bucket); }
      bucket.push(item);
    }
    return grid;
  }

  queryGridForBullet(grid, bullet){
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
    for(let cx = minCx; cx <= maxCx; cx++){
      for(let cy = minCy; cy <= maxCy; cy++){
        const bucket = grid.get(cellKeyOf(cx, cy));
        if(bucket) result.push(...bucket);
      }
    }
    return result;
  }

  checkCollisions(){
    const bullets = this.getBullets();
    const enemies = this.getEnemies();
    const asteroids = this.getAsteroids();
    const enemyGrid = bullets.length && enemies.length ? this.buildSpatialGrid(enemies) : null;
    const asteroidGrid = bullets.length && asteroids.length ? this.buildSpatialGrid(asteroids) : null;

    for(let i = bullets.length - 1; i >= 0; i--){
      const bullet = bullets[i];
      const nearbyEnemies = enemyGrid ? this.queryGridForBullet(enemyGrid, bullet) : EMPTY_ARRAY;
      const enemyResult = nearbyEnemies.length
        ? this.collideBulletWithEnemies(bullet, nearbyEnemies)
        : { hit: false, bounced: false };
      let asteroidResult = { hit: false, bounced: false };
      if((!enemyResult.hit || bullet.pierce > 0) && asteroidGrid){
        const nearbyAsteroids = this.queryGridForBullet(asteroidGrid, bullet);
        if(nearbyAsteroids.length){
          asteroidResult = this.collideBulletWithAsteroids(bullet, nearbyAsteroids);
        }
      }
      const hit = enemyResult.hit || asteroidResult.hit;
      const bounced = enemyResult.bounced || asteroidResult.bounced;
      if(hit && bullet.pierce <= 0 && !bounced) bullets.splice(i, 1);
    }
    this.collideEnemiesWithAsteroids();
    this.collidePlayerWithEnemies();
    this.collidePlayerWithAsteroids();
  }

  collideBulletWithEnemies(bullet, candidates){
    const enemies = this.getEnemies();
    let hit = false;
    let bounced = false;
    for(const enemy of candidates){
      if(bullet.hitTargets.has(enemy) || !this.isBulletTouching(bullet, enemy) || this.wasRecentlyHit(bullet, enemy)) continue;
      if(enemies.indexOf(enemy) === -1) continue;
      this.damageEnemy(enemy, bullet.dmg);
      bullet.hitTargets.add(enemy);
      if(bullet.crit) this.triggerChainLightning(enemy);
      this.spawnBurst(bullet.x, bullet.y, this.createColor(enemy.color[0], enemy.color[1], enemy.color[2]), 5);
      if(bullet.explosive) this.explodeAt(bullet.x, bullet.y, bullet.dmg * 0.2, enemy);
      hit = true;
      bounced = this.ricochetFrom(bullet, enemy);
      if(bullet.pierce > 0) bullet.pierce--;
      else if(!bounced) break;
    }
    return { hit, bounced };
  }

  collideBulletWithAsteroids(bullet, candidates){
    const asteroids = this.getAsteroids();
    let hit = false;
    let bounced = false;
    for(const asteroid of candidates){
      if(bullet.hitTargets.has(asteroid) || !this.isBulletTouching(bullet, asteroid) || this.wasRecentlyHit(bullet, asteroid)) continue;
      if(asteroids.indexOf(asteroid) === -1) continue;
      this.damageAsteroid(asteroid, bullet.dmg);
      bullet.hitTargets.add(asteroid);
      this.spawnBurst(bullet.x, bullet.y, this.createColor(177, 151, 139), 5);
      hit = true;
      bounced = this.ricochetFrom(bullet, asteroid);
      if(bullet.pierce > 0) bullet.pierce--;
      else if(!bounced) break;
    }
    return { hit, bounced };
  }

  isBulletTouching(bullet, target){
    const startX = bullet.previousX ?? bullet.x;
    const startY = bullet.previousY ?? bullet.y;
    const deltaX = bullet.x - startX;
    const deltaY = bullet.y - startY;
    const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
    const projection = segmentLengthSquared === 0
      ? 0
      : clamp(((target.x - startX) * deltaX + (target.y - startY) * deltaY) / segmentLengthSquared, 0, 1);
    const closestX = startX + deltaX * projection;
    const closestY = startY + deltaY * projection;
    const targetRadius = target.collisionRadius ?? target.r;
    return Math.hypot(target.x - closestX, target.y - closestY) < targetRadius + bullet.size / 2;
  }

  playerWorldToLocal(x, y){
    const player = this.getPlayer();
    const dx = x - player.x, dy = y - player.y;
    const angle = player.angle + player.armorRotation;
    return { x: dx * Math.cos(angle) + dy * Math.sin(angle), y: -dx * Math.sin(angle) + dy * Math.cos(angle) };
  }

  damagePlayer(damage){
    const player = this.getPlayer();
    if(player.invuln > 0 || player.hp <= 0) return false;
    player.hp = Math.max(0, player.hp - damage);
    return true;
  }

  damagePlayerAtProjectile(bullet, damage = 10){
    const player = this.getPlayer();
    if(player.invuln > 0) return false;
    const start = this.playerWorldToLocal(bullet.previousX ?? bullet.x, bullet.previousY ?? bullet.y);
    const end = this.playerWorldToLocal(bullet.x, bullet.y);
    for(const plate of player.armor){
      const polygon = this.getPlayerPlateShape(plate);
      const hit = bullet.isLaser
        ? this.laserTouchesPolygon(start, end, polygon, bullet.size / 2)
        : this.segmentTouchesPolygon(start, end, polygon);
      if(hit) return this.damagePlayer(damage);
    }
    return false;
  }

  isPointInsidePolygon(x, y, polygon){
    let inside = false;
    for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i++){
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
      const crosses = (yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
      if(crosses) inside = !inside;
    }
    return inside;
  }

  segmentsIntersect(a, b, c, d){
    const orientation = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
    return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))
      && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
  }

  segmentTouchesPolygon(start, end, polygon){
    if(this.isPointInsidePolygon(start.x, start.y, polygon)
      || this.isPointInsidePolygon(end.x, end.y, polygon)) return true;
    for(let i = 0; i < polygon.length; i++){
      const current = polygon[i], next = polygon[(i + 1) % polygon.length];
      if(this.segmentsIntersect(start, end, { x: current[0], y: current[1] }, { x: next[0], y: next[1] })) return true;
    }
    return false;
  }

  laserTouchesPolygon(start, end, polygon, radius){
    if(this.segmentTouchesPolygon(start, end, polygon)) return true;
    const radiusSquared = radius * radius;
    const pointSegmentDistanceSquared = (point, segmentStart, segmentEnd) => {
      const dx = segmentEnd.x - segmentStart.x, dy = segmentEnd.y - segmentStart.y;
      const lengthSquared = dx * dx + dy * dy;
      const projection = lengthSquared === 0
        ? 0
        : clamp(((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSquared, 0, 1);
      const closestX = segmentStart.x + dx * projection;
      const closestY = segmentStart.y + dy * projection;
      return (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
    };
    for(let i = 0; i < polygon.length; i++){
      const current = { x: polygon[i][0], y: polygon[i][1] };
      const next = { x: polygon[(i + 1) % polygon.length][0], y: polygon[(i + 1) % polygon.length][1] };
      if(pointSegmentDistanceSquared(current, start, end) <= radiusSquared
        || pointSegmentDistanceSquared(start, current, next) <= radiusSquared
        || pointSegmentDistanceSquared(end, current, next) <= radiusSquared) return true;
    }
    return false;
  }

  wasRecentlyHit(bullet, target){
    return bullet.lastHit === target && bullet.ricochetCooldown > 0;
  }

  collidePlayerWithEnemies(){
    const player = this.getPlayer();
    if(player.invuln > 0) return;
    for(const enemy of this.getEnemies()){
      if(!this.isInRange(enemy, player, (enemy.collisionRadius ?? enemy.r) + 14)) continue;
      this.damagePlayer(enemy.dmg ?? 10);
      player.invuln = 45;
      this.spawnBurst(player.x, player.y, this.createColor(255, 120, 140), 10);
      break;
    }
  }

  collidePlayerWithAsteroids(){
    const player = this.getPlayer();
    if(player.invuln > 0) return;
    for(const asteroid of this.getAsteroids()){
      const dx = player.x - asteroid.x;
      const dy = player.y - asteroid.y;
      const distance = Math.hypot(dx, dy);
      const collisionDistance = asteroid.r + 14;
      if(distance >= collisionDistance) continue;
      const normalX = distance > 0 ? dx / distance : 1;
      const normalY = distance > 0 ? dy / distance : 0;
      this.damagePlayer(10);
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
      this.spawnBurst(player.x, player.y, this.createColor(255, 184, 79), 10);
      break;
    }
  }

  collideEnemiesWithAsteroids(){
    const enemies = this.getEnemies();
    const asteroids = this.getAsteroids();
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
        this.damageEnemy(enemy, impactDamage);
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
        this.spawnBurst(enemy.x, enemy.y, this.createColor(enemy.color[0], enemy.color[1], enemy.color[2]), 8);
        break;
      }
    }
  }
}
