import { Bullet } from '../model/entities/projectile.js';

const AIM_ASSIST_RANGE = 760;
const AIM_ASSIST_CURSOR_RANGE = 70;
const AIM_LOCK_CHARGE_FRAMES = 45;
const FULL_TURN = Math.PI * 2;

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

export class PlayerWeaponController {
  constructor({
    getEnemies,
    getAsteroids,
    getBullets,
    damageEnemy,
    damageAsteroid,
    random,
    cos,
    sin,
    drawLaser,
  }){
    this.getEnemies = getEnemies;
    this.getAsteroids = getAsteroids;
    this.getBullets = getBullets;
    this.damageEnemy = damageEnemy;
    this.damageAsteroid = damageAsteroid;
    this.random = random;
    this.cos = cos;
    this.sin = sin;
    this.drawLaser = drawLaser;
    this.fireButtonDown = false;
    this.rightMouseDown = false;
    this.aimAssistTarget = null;
    this.aimLockTarget = null;
    this.aimChargeTarget = null;
    this.aimLockCharge = 0;
  }

  reset(){
    this.fireButtonDown = false;
    this.rightMouseDown = false;
    this.aimAssistTarget = null;
    this.aimLockTarget = null;
    this.aimChargeTarget = null;
    this.aimLockCharge = 0;
  }

  setFireButtonDown(isDown){
    this.fireButtonDown = isDown;
  }

  setRightMouseDown(isDown){
    if(isDown && !this.rightMouseDown && this.aimLockTarget){
      this.aimLockTarget = null;
      this.aimAssistTarget = null;
      this.aimChargeTarget = null;
      this.aimLockCharge = 0;
    }
    this.rightMouseDown = isDown;
  }

  getAimRenderState(){
    return {
      target: this.aimAssistTarget,
      lockCharge: this.aimLockCharge,
      lockChargeFrames: AIM_LOCK_CHARGE_FRAMES,
      locked: Boolean(this.aimLockTarget),
    };
  }

  updateAim(player, enemies, cursorX, cursorY){
    const mouseAngle = Math.atan2(cursorY - player.y, cursorX - player.x);
    if(this.aimLockTarget && !enemies.includes(this.aimLockTarget)){
      this.aimLockTarget = null;
      this.aimLockCharge = 0;
    }
    const hoveredTarget = this.rightMouseDown
      ? this.findAimAssistTarget(player, enemies, cursorX, cursorY)
      : null;
    if(!this.rightMouseDown){
      this.aimAssistTarget = null;
      this.aimLockTarget = null;
      this.aimChargeTarget = null;
      this.aimLockCharge = 0;
    } else if(this.aimLockTarget){
      this.aimAssistTarget = this.aimLockTarget;
    } else {
      this.aimAssistTarget = hoveredTarget;
      if(hoveredTarget){
        if(hoveredTarget !== this.aimChargeTarget){
          this.aimChargeTarget = hoveredTarget;
          this.aimLockCharge = 0;
        }
        this.aimLockCharge++;
        if(this.aimLockCharge >= AIM_LOCK_CHARGE_FRAMES){
          this.aimLockTarget = hoveredTarget;
          this.aimLockCharge = AIM_LOCK_CHARGE_FRAMES;
        }
      } else {
        this.aimChargeTarget = null;
        this.aimLockCharge = 0;
      }
    }
    const targetAngle = this.aimAssistTarget
      ? Math.atan2(this.aimAssistTarget.y - player.y, this.aimAssistTarget.x - player.x)
      : mouseAngle;
    let delta = targetAngle - player.angle;
    while(delta > Math.PI) delta -= FULL_TURN;
    while(delta < -Math.PI) delta += FULL_TURN;
    const speedRatio = clamp(Math.hypot(player.vx, player.vy) / (player.speed * 2.25), 0, 1);
    const maxTurnRate = 0.22 - speedRatio * 0.165;
    const turnAcceleration = 0.035 * (1 - speedRatio * 0.65);
    const brakingRate = Math.sqrt(2 * turnAcceleration * Math.abs(delta));
    const targetTurnVelocity = Math.sign(delta) * Math.min(maxTurnRate, brakingRate);
    player.turnVelocity += clamp(targetTurnVelocity - player.turnVelocity, -turnAcceleration, turnAcceleration);
    if(Math.abs(delta) <= Math.abs(player.turnVelocity) && delta * player.turnVelocity >= 0){
      player.angle += delta;
      player.turnVelocity = 0;
    } else {
      player.angle += player.turnVelocity;
    }
  }

  findAimAssistTarget(player, enemies, cursorX, cursorY){
    let bestTarget = null;
    let bestScore = Infinity;
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

  updateTimers(player){
    if(player.fireCooldown > 0) player.fireCooldown--;
    if(player.wingRecoil > 0) player.wingRecoil = Math.max(0, player.wingRecoil - 0.16);
    if(player.reloadTimer > 0){
      player.reloadTimer--;
      if(player.reloadTimer === 0) player.ammo = player.magazineSize;
    }
  }

  handleWeapons(gameState, player){
    const firing = this.fireButtonDown;
    if(firing && player.reloadTimer <= 0){
      if(player.ammo <= 0) this.requestReload(gameState, player);
      else if(player.fireCooldown <= 0 && this.firePlayerBullets(gameState, player)) player.fireCooldown = player.fireRate;
    }
    if(player.laserLevel > 0 && firing) this.fireLaser(player);
  }

  requestReload(gameState, player){
    if(gameState !== 'playing' || !player || player.reloadTimer > 0 || player.ammo >= player.magazineSize) return false;
    player.reloadTimer = player.reloadDuration;
    return true;
  }

  firePlayerBullets(gameState, player){
    if(player.ammo <= 0 || player.reloadTimer > 0) return false;
    const count = Math.min(Math.max(1, Math.floor(player.multishot)), player.ammo);
    const spacing = Math.max(8, player.bulletSize * 1.8);
    const bullets = this.getBullets();
    for(let i = 0; i < count; i++){
      const lateral = (i - (count - 1) / 2) * spacing;
      const isCrit = this.random() < player.critChance;
      const cosAngle = this.cos(player.angle), sinAngle = this.sin(player.angle);
      const launchX = player.x + cosAngle * 20 - sinAngle * lateral;
      const launchY = player.y + sinAngle * 20 + cosAngle * lateral;
      const damage = player.dmg * (isCrit ? 2 : 1) * (player.hp < player.maxHp * 0.3 ? 1 + player.lowHpDamage : 1);
      const bullet = new Bullet(
        launchX,
        launchY,
        cosAngle * player.bulletSpeed,
        sinAngle * player.bulletSpeed,
        damage,
        isCrit,
        player.pierce,
        player.bulletSize,
        player.explosive,
        player.bulletLength,
      );
      bullet.ricochets = player.ricochet;
      bullets.push(bullet);
    }
    player.wingRecoil = 1;
    player.ammo -= count;
    if(player.ammo === 0) this.requestReload(gameState, player);
    return true;
  }

  fireLaser(player){
    const range = 520;
    this.drawLaser(player, range);
    const enemies = this.getEnemies();
    for(let i = enemies.length - 1; i >= 0; i--){
      const enemy = enemies[i];
      const dx = enemy.x - player.x, dy = enemy.y - player.y;
      const forward = dx * this.cos(player.angle) + dy * this.sin(player.angle);
      const side = Math.abs(dx * this.sin(player.angle) - dy * this.cos(player.angle));
      if(forward > 0 && forward < range && side < enemy.r + 5){
        this.damageEnemy(enemy, player.dmg * (0.08 + player.laserLevel * 0.035));
      }
    }
    const asteroids = this.getAsteroids();
    for(let i = asteroids.length - 1; i >= 0; i--){
      const asteroid = asteroids[i];
      const dx = asteroid.x - player.x, dy = asteroid.y - player.y;
      const forward = dx * this.cos(player.angle) + dy * this.sin(player.angle);
      const side = Math.abs(dx * this.sin(player.angle) - dy * this.cos(player.angle));
      if(forward > 0 && forward < range && side < asteroid.r + 5){
        this.damageAsteroid(asteroid, player.dmg * (0.08 + player.laserLevel * 0.035));
      }
    }
  }
}
