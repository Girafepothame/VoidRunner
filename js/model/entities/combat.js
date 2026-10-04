import { Bullet } from './projectile.js';

const ASTEROID_ORBIT_APPROACH_DISTANCE = 110;

export { Bullet };

export class Enemy {
  constructor(params){
    Object.assign(this, params);
    this.parts = params.parts || (params.shape ? [params.shape] : []);
    this.collisionRadius = params.collisionRadius ?? this.r * 1.3;
    this.flockX = this.x;
    this.flockY = this.y;
    this.core = { x: 0, y: 0, radius: Math.max(2, this.r * 0.22) };
    const shapePoints = Array.isArray(this.parts) ? this.parts.flat() : Object.values(this.parts).flat();
    this.trailRearOffset = shapePoints.reduce(
      (offset, point) => Array.isArray(point) ? Math.max(offset, point[1]) : offset,
      0,
    ) + 2;
    if(this.trailRearOffset === 2) this.trailRearOffset = this.r * 0.9;
    this.aggroRange = params.aggroRange ?? (this.isPortalBoss || this.isMiniboss ? Infinity : 320);
    this.aggroed = false;
    this.provoked = false;
    this.wanderAngle = params.wanderAngle ?? random(TWO_PI);
    this.wanderTimer = params.wanderTimer ?? random(45, 140);
    this.wanderTurn = params.wanderTurn ?? random(-0.025, 0.025);
    this.orbitingAsteroid = null;
    this.orbitDirection = random() < 0.5 ? -1 : 1;
    this.orbitRadius = 0;
    this.behavior = params.behavior ?? 'chase';
    this.warmupDuration = params.warmupDuration ?? 0;
    this.dashDuration = params.dashDuration ?? 0;
    this.recoveryDuration = params.recoveryDuration ?? 0;
    this.dashSpeed = params.dashSpeed ?? this.speed;
    this.chargeState = 'warmup';
    this.chargeTimer = this.warmupDuration;
    this.dashDirectionX = 0;
    this.dashDirectionY = 0;
    this.chargeVelocityX = 0;
    this.chargeVelocityY = 0;
    this.bounceVelocityX = 0;
    this.bounceVelocityY = 0;
    this.bounceFrames = 0;
    this.asteroidContactCooldown = 0;
    this.burstDuration = params.burstDuration ?? 12;
    this.burstTimer = 0;
    this.bossAttackTimer = params.bossAttackTimer ?? 70;
    this.bossPhaseIndex = params.bossPhaseIndex ?? 0;
    this.bossAttackStart = params.bossAttackStart ?? null;
    this.bossAttackFire = params.bossAttackFire ?? null;
    this.bossLaserChargeFrames = 0;
    this.trailPoints = this.type === 'fighter' || this.type === 'bombardier' || this.behavior === 'charger' ? [] : null;
    this.trailLifetime = 42;
    this.trailSpacing = 2;
  }
  update(player, asteroids = [], enemies = []){
    if(this.type === 'boss'){
      this.updateBossAI(player);
      return;
    }
    if(this.asteroidContactCooldown > 0) this.asteroidContactCooldown--;
    if(this.bounceFrames > 0){
      this.x += this.bounceVelocityX;
      this.y += this.bounceVelocityY;
      this.bounceVelocityX *= 0.82;
      this.bounceVelocityY *= 0.82;
      this.bounceFrames--;
      return;
    }
    const dx = player.x-this.x, dy = player.y-this.y;
    const d = Math.hypot(dx,dy) || 1;
    if(this.burstTimer > 0) this.burstTimer--;
    const aggro = this.provoked || d <= this.aggroRange * (this.aggroed ? 2 : 1);
    this.aggroed = aggro;
    const chargeInProgress = this.behavior === 'charger' && this.chargeState !== 'warmup';
    if(!aggro && !chargeInProgress){
      this.wanderTimer--;
      this.wanderAngle += this.wanderTurn;
      if(this.wanderTimer <= 0){
        this.wanderTimer = random(45, 140);
        this.wanderTurn = random(-0.025, 0.025);
        this.wanderAngle += random(-0.7, 0.7);
      }
      const asteroid = this.getNearbyAsteroid(asteroids);
      const heading = asteroid
        ? this.getAsteroidOrbitDirection(asteroid)
        : { x: Math.cos(this.wanderAngle), y: Math.sin(this.wanderAngle) };
      const direction = this.getAvoidanceDirection(heading.x, heading.y, asteroids, enemies);
      this.angle = atan2(direction.y, direction.x);
      this.x += direction.x * this.speed * 0.65;
      this.y += direction.y * this.speed * 0.65;
      this.updateTrail();
      return;
    }
    if(this.behavior === 'charger'){
      this.updateCharge(dx, dy, d);
      return;
    }
    const direction = this.getAvoidanceDirection(dx / d, dy / d, asteroids, enemies);
    this.angle = atan2(direction.y, direction.x);
    const chaseSpeed = this.speed * 1.5;
    this.x += direction.x * chaseSpeed; this.y += direction.y * chaseSpeed;
    this.updateTrail();
  }
  getNearbyAsteroid(asteroids){
    if(this.orbitingAsteroid && asteroids.includes(this.orbitingAsteroid)){
      const distance = Math.hypot(this.x - this.orbitingAsteroid.x, this.y - this.orbitingAsteroid.y);
      const orbitRange = this.orbitingAsteroid.r + this.collisionRadius + ASTEROID_ORBIT_APPROACH_DISTANCE + 60;
      if(distance <= orbitRange) return this.orbitingAsteroid;
    }
    this.orbitingAsteroid = null;
    let nearestAsteroid = null;
    let nearestDistance = Infinity;
    for(const asteroid of asteroids){
      const distance = Math.hypot(this.x - asteroid.x, this.y - asteroid.y);
      const approachRange = asteroid.r + this.collisionRadius + ASTEROID_ORBIT_APPROACH_DISTANCE;
      if(distance <= approachRange && distance < nearestDistance){
        nearestAsteroid = asteroid;
        nearestDistance = distance;
      }
    }
    if(nearestAsteroid){
      this.orbitingAsteroid = nearestAsteroid;
      this.orbitDirection = random() < 0.5 ? -1 : 1;
      this.orbitRadius = nearestAsteroid.r + this.collisionRadius + random(22, 48);
    }
    return nearestAsteroid;
  }
  getAsteroidOrbitDirection(asteroid){
    const offsetX = this.x - asteroid.x;
    const offsetY = this.y - asteroid.y;
    const distance = Math.hypot(offsetX, offsetY);
    const radialX = distance > 0 ? offsetX / distance : Math.cos(this.wanderAngle);
    const radialY = distance > 0 ? offsetY / distance : Math.sin(this.wanderAngle);
    const tangentX = -radialY * this.orbitDirection;
    const tangentY = radialX * this.orbitDirection;
    const clearance = asteroid.r + this.collisionRadius + 8;
    const radialStrength = distance < clearance
      ? 3
      : Math.max(-1.25, Math.min(1.25, (this.orbitRadius - distance) / this.orbitRadius));
    const tangentStrength = distance < clearance ? 0.35 : 1;
    const directionX = radialX * radialStrength + tangentX * tangentStrength;
    const directionY = radialY * radialStrength + tangentY * tangentStrength;
    const length = Math.hypot(directionX, directionY) || 1;
    return { x: directionX / length, y: directionY / length };
  }
  getAvoidanceDirection(directionX, directionY, asteroids, enemies){
    let steeringX = directionX;
    let steeringY = directionY;
    for(const asteroid of asteroids){
      const offsetX = asteroid.x - this.x;
      const offsetY = asteroid.y - this.y;
      const forwardDistance = offsetX * directionX + offsetY * directionY;
      const lateralDistance = Math.abs(offsetX * directionY - offsetY * directionX);
      const clearance = (this.collisionRadius ?? this.r) + asteroid.r + 8;
      const avoidanceDistance = clearance + Math.max(50, this.speed * 10);
      if(forwardDistance < -clearance || forwardDistance > avoidanceDistance
        || lateralDistance > clearance + 28) continue;

      const cross = directionX * offsetY - directionY * offsetX;
      const dodgeSide = cross > 0 ? -1 : cross < 0 ? 1 : this.wanderTurn >= 0 ? -1 : 1;
      const proximity = 1 - lateralDistance / (clearance + 28);
      const urgency = 1 - Math.max(0, forwardDistance) / avoidanceDistance;
      const force = proximity * (0.8 + urgency);
      steeringX -= directionY * dodgeSide * force * 1.7;
      steeringY += directionX * dodgeSide * force * 1.7;
      const distance = Math.hypot(offsetX, offsetY) || 1;
      steeringX -= offsetX / distance * force * 0.55;
      steeringY -= offsetY / distance * force * 0.55;
    }
    for(const enemy of enemies){
      if(enemy === this) continue;
      const offsetX = this.x - enemy.flockX;
      const offsetY = this.y - enemy.flockY;
      const distance = Math.hypot(offsetX, offsetY);
      const separationDistance = this.collisionRadius + (enemy.collisionRadius ?? enemy.r) + 12;
      if(distance >= separationDistance) continue;
      const separationStrength = 2 * (1 - distance / separationDistance);
      const separationAngle = distance > 0
        ? Math.atan2(offsetY, offsetX)
        : enemies.indexOf(this) * 2.399963229728653;
      steeringX += Math.cos(separationAngle) * separationStrength;
      steeringY += Math.sin(separationAngle) * separationStrength;
    }
    const length = Math.hypot(steeringX, steeringY) || 1;
    return { x: steeringX / length, y: steeringY / length };
  }
  updateTrail(recordPoint = true){
    if(!this.trailPoints) return;
    for(const point of this.trailPoints) point.age++;
    while(this.trailPoints.length && this.trailPoints[0].age >= this.trailLifetime){
      this.trailPoints.shift();
    }
    if(!recordPoint) return;
    const point = {
      x: this.x - Math.cos(this.angle) * this.trailRearOffset,
      y: this.y - Math.sin(this.angle) * this.trailRearOffset,
      age: 0,
    };
    const lastPoint = this.trailPoints[this.trailPoints.length - 1];
    if(!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= this.trailSpacing){
      this.trailPoints.push(point);
    }
  }
  drawTrail(){
    if(!this.trailPoints || this.trailPoints.length < 2) return;
    const points = this.trailPoints;
    const first = points[0], last = points[points.length - 1];
    const context = drawingContext;
    context.save();
    const gradient = context.createLinearGradient(first.x, first.y, last.x, last.y);
    const [red, green, blue] = this.behavior === 'charger' ? [255, 132, 28] : this.color;
    const fade = Math.max(0, 1 - last.age / this.trailLifetime);
    gradient.addColorStop(0, `rgba(${red},${green},${blue},0)`);
    gradient.addColorStop(1, `rgba(${red},${green},${blue},${0.72 * fade})`);
    context.strokeStyle = gradient;
    context.lineWidth = 4.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(first.x, first.y);
    for(let i = 0; i < points.length - 1; i++){
      const previous = points[Math.max(0, i - 1)];
      const start = points[i], end = points[i + 1];
      const next = points[Math.min(points.length - 1, i + 2)];
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
  updateCharge(dx, dy, distance){
    if(this.chargeState === 'warmup'){
      this.updateTrail(false);
      this.angle = atan2(dy,dx);
      this.chargeTimer--;
      if(this.chargeTimer <= 0){
        this.dashDirectionX = dx / distance;
        this.dashDirectionY = dy / distance;
        this.angle = atan2(this.dashDirectionY, this.dashDirectionX);
        this.chargeVelocityX = 0;
        this.chargeVelocityY = 0;
        this.chargeState = 'dash';
        this.chargeTimer = this.dashDuration;
        this.burstTimer = this.burstDuration;
      }
      return;
    }
    if(this.chargeState === 'dash'){
      const elapsed = this.dashDuration - this.chargeTimer;
      const acceleration = Math.min(1, (elapsed + 1) / 8);
      const braking = 0.55 + 0.45 * Math.min(1, this.chargeTimer / 10);
      const chargeSpeed = this.dashSpeed * acceleration * braking;
      this.chargeVelocityX = this.dashDirectionX * chargeSpeed;
      this.chargeVelocityY = this.dashDirectionY * chargeSpeed;
      this.x += this.chargeVelocityX;
      this.y += this.chargeVelocityY;
      this.updateTrail();
      this.chargeTimer--;
      if(this.chargeTimer <= 0){
        this.chargeState = 'recovery';
        this.chargeTimer = this.recoveryDuration;
      }
      return;
    }
    this.x += this.chargeVelocityX;
    this.y += this.chargeVelocityY;
    this.chargeVelocityX *= 0.8;
    this.chargeVelocityY *= 0.8;
    this.updateTrail();
    this.chargeTimer--;
    if(this.chargeTimer <= 0){
      this.chargeState = 'warmup';
      this.chargeTimer = this.warmupDuration;
    }
  }
  updateBossAI(player){
    if(this.bossLaserChargeFrames > 0){
      const dx = player.x - this.x, dy = player.y - this.y;
      if(dx * dx + dy * dy > this.aggroRange * this.aggroRange){
        this.bossLaserChargeFrames = 0;
        this.bossAttackTimer = 30;
        return;
      }
      if(this.bossLaserChargeFrames > 12){
        this.angle = atan2(player.y - this.y, player.x - this.x);
      }
      this.bossLaserChargeFrames--;
      if(this.bossLaserChargeFrames === 0 && typeof this.bossAttackFire === 'function'){
        this.bossAttackFire(this, player);
      }
      return;
    }
    this.angle = atan2(player.y - this.y, player.x - this.x);
    this.bossAttackTimer--;
    if(this.bossAttackTimer <= 0){
      const dx = player.x - this.x, dy = player.y - this.y;
      if(dx * dx + dy * dy <= this.aggroRange * this.aggroRange){
        if(typeof this.bossAttackStart === 'function'){ this.bossAttackStart(this, player); }
        this.bossPhaseIndex += 1;
      }
      this.bossAttackTimer = this.bossPhaseIndex % 2 === 0 ? 100 : 120;
    }
  }
  draw(){
    this.drawTrail();
    push(); translate(this.x,this.y); rotate(this.angle + HALF_PI);
    if(this.behavior === 'charger' && this.aggroed && this.chargeState === 'warmup'){
      noFill(); stroke(255, 190, 80, 180); strokeWeight(1); circle(0, 0, this.r * 2.4);
      const warmupProgress = Math.min(1, 1 - this.chargeTimer / this.warmupDuration);
      const orbRadius = 3 + warmupProgress * 9;
      const orbY = this.r + 8;
      noStroke();
      fill(255, 92, 18, 48); circle(0, orbY, orbRadius * 3);
      fill(255, 130, 28, 112); circle(0, orbY, orbRadius * 1.8);
      fill(255, 196, 72, 245); circle(0, orbY, orbRadius);
    }
    if(this.behavior === 'charger' && this.burstTimer > 0){
      const burstProgress = 1 - this.burstTimer / this.burstDuration;
      noFill(); stroke(255, 145, 38, 210 * (1 - burstProgress)); strokeWeight(2);
      circle(0, this.r + 8, this.r * (0.9 + burstProgress * 2.8));
    }
    noStroke();
    fill(this.color[0], this.color[1], this.color[2]);
    const parts = Array.isArray(this.parts) ? this.parts : Object.values(this.parts || {});
    if(parts.length){
      const entries = Array.isArray(this.parts) ? parts.map((points, index) => [String(index), points]) : Object.entries(this.parts || {});
      for(const [key, points] of entries){
        if(!Array.isArray(points) || points.length === 0) continue;
        if(points.length === 1){
          const [x, y] = points[0];
          circle(x, y, 3);
          continue;
        }
        if(points.length === 2){
          line(points[0][0], points[0][1], points[1][0], points[1][1]);
          continue;
        }
        beginShape();
        for(const [x, y] of points){
          vertex(x, y);
        }
        endShape(CLOSE);
      }
    } else {
      triangle(this.r * 1.2, 0, -this.r * 0.9, this.r * 0.9, -this.r * 0.9, -this.r * 0.9);
    }
    noStroke();
    fill(this.color[0], this.color[1], this.color[2], 90);
    circle(this.core.x, this.core.y, this.core.radius * 2.6);
    fill(255, 245, 255, 245);
    circle(this.core.x, this.core.y, this.core.radius);
    if(this.type === 'boss' && this.bossLaserChargeFrames > 0){
      const progress = 1 - this.bossLaserChargeFrames / 120;
      const pulse = 0.85 + Math.sin(frameCount * 0.35) * 0.15;
      const orbRadius = (8 + progress * 20) * pulse;
      if(this.bossLaserChargeFrames <= 12){
        const previewRange = Math.max(0, this.aggroRange - 104);
        const previewAlpha = map(this.bossLaserChargeFrames, 12, 0, 100, 230);
        stroke(255, 35, 45, previewAlpha); strokeWeight(4);
        line(0, -104, 0, -104 - previewRange);
      }
      stroke(255, 190, 230, 245); strokeWeight(3);
      fill(255, 45, 150, 245); circle(0, -100, orbRadius);
    }
    pop();
    if(this.hp < this.maxHp){
      const w = this.type === 'boss' ? 72 : 24;
      const barY = this.y - this.r - (this.type === 'boss' ? 26 : 10);
      noStroke(); fill(0,0,0,170); rect(this.x - w / 2, barY, w, this.type === 'boss' ? 6 : 4);
      fill(this.type === 'boss' ? [180, 255, 120] : [255, 90, 120]);
      rect(this.x - w / 2, barY, w * (this.hp / this.maxHp), this.type === 'boss' ? 6 : 4);
    }
  }
}
