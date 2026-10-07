const DASH_COOLDOWN_FRAMES = 240;
const DASH_DURATION_FRAMES = 4;
const PLAYER_SCALE = 0.65;
const PLAYER_TRAIL_LIFETIME = 42;
const PLAYER_WING_TRAIL_LIFETIME = PLAYER_TRAIL_LIFETIME * 0.25;
const PLAYER_TRAIL_SPACING = 2;

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

export class PlayerController {
  constructor({ getEnemies, getEnemyBullets, damageEnemy, spawnBurst, triggerShake, createColor }){
    this.getEnemies = getEnemies;
    this.getEnemyBullets = getEnemyBullets;
    this.damageEnemy = damageEnemy;
    this.spawnBurst = spawnBurst;
    this.triggerShake = triggerShake;
    this.createColor = createColor;
    this.dashGrazedEnemies = new Set();
    this.dashKeyWasDown = false;
  }

  handleDashKey(isDown, gameState, player, keys){
    if(isDown && !this.dashKeyWasDown && gameState === 'playing'){
      this.requestPlayerDash(player, keys);
    }
    this.dashKeyWasDown = isDown;
  }

  requestPlayerDash(player, keys){
    const activeDirection = ['z', 's', 'q', 'd'].find(direction => keys[direction]);
    this.requestDash(player, activeDirection || player.lastMoveDirection || 'z');
  }

  requestDash(player, direction){
    if(player.dashCooldownTimer > 0 || player.dashTimer > 0) return;
    player.dashAngle = this.directionToAngle(player, direction);
    player.dashDistance = player.speed * 36;
    player.dashProgress = 0;
    player.dashAppliedDistance = 0;
    player.dashDuration = DASH_DURATION_FRAMES;
    player.dashTimer = DASH_DURATION_FRAMES;
    player.dashCooldownTimer = DASH_COOLDOWN_FRAMES;
    player.vx = 0;
    player.vy = 0;
    player.invuln = Math.max(player.invuln, DASH_DURATION_FRAMES + 2);
    this.dashGrazedEnemies = new Set();
    this.triggerShake(4, 6);
    this.spawnBurst(player.x, player.y, this.createColor(180, 107, 255), 14);
  }

  directionToAngle(player, direction){
    switch(direction){
      case 's': return player.angle + Math.PI;
      case 'q': return player.angle - Math.PI / 2;
      case 'd': return player.angle + Math.PI / 2;
      default: return player.angle;
    }
  }

  rechargeDashPercent(player, fraction){
    player.dashCooldownTimer = Math.max(0, player.dashCooldownTimer - DASH_COOLDOWN_FRAMES * fraction);
  }

  rechargeDashFull(player){
    player.dashCooldownTimer = 0;
  }

  updateMovement(player, keys, rightMouseDown){
    this.updateDash(player);
    if(player.dashTimer > 0){
      player.boosting = false;
      this.updateAimOpening(player, rightMouseDown);
      return;
    }
    this.applyDirectionalMovement(player, keys);
    this.updateAimOpening(player, rightMouseDown);
  }

  updateTrails(player, shipRotation){
    for(const point of player.trailPoints) point.age++;
    while(player.trailPoints.length && player.trailPoints[0].age >= PLAYER_TRAIL_LIFETIME){
      player.trailPoints.shift();
    }
    for(const points of player.wingTrailPoints){
      for(const point of points) point.age++;
      while(points.length && points[0].age >= PLAYER_WING_TRAIL_LIFETIME) points.shift();
    }

    const forwardX = Math.cos(player.angle), forwardY = Math.sin(player.angle);
    const movementX = player.dashTimer > 0 ? Math.cos(player.dashAngle) : player.vx;
    const movementY = player.dashTimer > 0 ? Math.sin(player.dashAngle) : player.vy;
    const forwardSpeed = movementX * forwardX + movementY * forwardY;
    const isReversing = forwardSpeed < -0.2;
    const isMoving = player.dashTimer > 0 || Math.hypot(player.vx, player.vy) > 0.2;

    if(isReversing){
      player.trailPoints.length = 0;
    } else if(isMoving){
      const rearOffset = 31.5 * PLAYER_SCALE;
      const exhaustX = player.x - Math.sin(shipRotation) * rearOffset;
      const exhaustY = player.y + Math.cos(shipRotation) * rearOffset;
      const lastPoint = player.trailPoints[player.trailPoints.length - 1];
      if(!lastPoint || Math.hypot(exhaustX - lastPoint.x, exhaustY - lastPoint.y) >= PLAYER_TRAIL_SPACING){
        player.trailPoints.push({ x: exhaustX, y: exhaustY, age: 0 });
      }
    }

    player.showWingTrails = player.boosting || isReversing;
    if(player.showWingTrails && isMoving){
      const cos = Math.cos(shipRotation), sin = Math.sin(shipRotation);
      for(let i = 0; i < player.wingTrailPoints.length; i++){
        const localX = (i === 0 ? -12 : 12) * PLAYER_SCALE;
        const localY = 23 * PLAYER_SCALE;
        const exhaustX = player.x + localX * cos - localY * sin;
        const exhaustY = player.y + localX * sin + localY * cos;
        const points = player.wingTrailPoints[i];
        const lastPoint = points[points.length - 1];
        if(!lastPoint || Math.hypot(exhaustX - lastPoint.x, exhaustY - lastPoint.y) >= PLAYER_TRAIL_SPACING){
          points.push({ x: exhaustX, y: exhaustY, age: 0 });
        }
      }
    } else {
      for(const points of player.wingTrailPoints) points.length = 0;
    }
  }

  updateAimOpening(player, rightMouseDown){
    const aimOpening = rightMouseDown ? 1 : 0;
    player.aimOpening += (aimOpening - player.aimOpening) * 0.2;
  }

  applyDirectionalMovement(player, keys){
    const forward = (keys.z ? 1 : 0) - (keys.s ? 1 : 0);
    const strafe = (keys.d ? 1 : 0) - (keys.q ? 1 : 0);
    const boosting = keys.shift && player.boost > 0 && (forward !== 0 || strafe !== 0);
    player.boosting = boosting;
    const boostHeldWhileMoving = keys.shift && (forward !== 0 || strafe !== 0);
    player.boost = boosting
      ? Math.max(0, player.boost - 1.8)
      : boostHeldWhileMoving
        ? player.boost
        : Math.min(player.boostMax, player.boost + 0.65 + player.boostRegenBonus);
    const hasInput = forward !== 0 || strafe !== 0;
    if(hasInput){
      if(keys.z) player.lastMoveDirection = 'z';
      else if(keys.s) player.lastMoveDirection = 's';
      else if(keys.q) player.lastMoveDirection = 'q';
      else if(keys.d) player.lastMoveDirection = 'd';
    }
    const acceleration = 0.52;
    const deceleration = 0.22;
    if(hasInput){
      const forwardMultiplier = forward > 0 ? 1.25 : 1;
      const speed = player.speed * forwardMultiplier * (boosting ? 1.8 : 1);
      const length = Math.hypot(forward, strafe) || 1;
      const forwardX = Math.cos(player.angle), forwardY = Math.sin(player.angle);
      const strafeX = Math.cos(player.angle + Math.PI / 2), strafeY = Math.sin(player.angle + Math.PI / 2);
      const targetVx = (forwardX * forward + strafeX * strafe) / length * speed;
      const targetVy = (forwardY * forward + strafeY * strafe) / length * speed;
      player.vx += clamp(targetVx - player.vx, -acceleration, acceleration);
      player.vy += clamp(targetVy - player.vy, -acceleration, acceleration);
      player.thrust = boosting ? 1.5 : 1;
    } else {
      player.vx *= Math.max(0, 1 - deceleration);
      player.vy *= Math.max(0, 1 - deceleration);
      player.thrust = 0;
    }
    player.x += player.vx;
    player.y += player.vy;
  }

  updateDash(player){
    if(player.dashCooldownTimer > 0) player.dashCooldownTimer--;
    if(player.dashTimer <= 0) return;
    player.dashProgress = Math.min(1, player.dashProgress + 1 / player.dashDuration);
    const distance = player.dashDistance * player.dashProgress;
    const step = distance - player.dashAppliedDistance;
    player.x += Math.cos(player.dashAngle) * step;
    player.y += Math.sin(player.dashAngle) * step;
    player.dashAppliedDistance = distance;
    player.dashTimer--;
    if(player.dashTimer <= 0){ player.vx = 0; player.vy = 0; }
    this.spawnBurst(player.x, player.y, this.createColor(180, 107, 255, 160), 2);
    this.checkDashGrazes(player);
  }

  checkDashGrazes(player){
    for(const enemy of this.getEnemies()){
      if(this.dashGrazedEnemies.has(enemy)) continue;
      if(Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.r + 18){
        this.dashGrazedEnemies.add(enemy);
        if(player.dashDamage > 0) this.damageEnemy(enemy, player.dashDamage);
        this.rechargeDashPercent(player, 0.25);
        this.spawnBurst(player.x, player.y, this.createColor(180, 107, 255), 6);
      }
    }
    const enemyBullets = this.getEnemyBullets();
    for(let i = enemyBullets.length - 1; i >= 0; i--){
      const bullet = enemyBullets[i];
      if(Math.hypot(bullet.x - player.x, bullet.y - player.y) < bullet.size + 16){
        enemyBullets.splice(i, 1);
        this.rechargeDashPercent(player, 0.5);
        this.spawnBurst(player.x, player.y, this.createColor(57, 255, 176), 8);
      }
    }
  }
}
