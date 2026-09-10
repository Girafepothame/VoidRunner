import { MOD_DEFS, SHIP_PROFILES, meta } from './meta.js';

// Classes for game entities: Player, Bullet, Enemy, Particle, Orb, ScrapPickup
export class Player {
  constructor(x=0,y=0,profileId='standard'){
    this.x = x || width/2; this.y = y || height/2; this.angle = -HALF_PI;
    const profile = SHIP_PROFILES[profileId] || SHIP_PROFILES.standard;
    this.profileId = SHIP_PROFILES[profileId] ? profileId : 'standard';
    this.profile = profile;
    this.speed = profile.speed; this.hp = 100; this.maxHp = 100;
    this.fireCooldown = 0; this.fireRate = profile.fireRate;
    this.dmg = profile.dmg; this.dmgPerLevel = 0; this.lastDamageGain = 0; this.bulletSpeed = 50; this.bulletLength = 24; this.bulletSize = 3;
    this.maxAmmo = profile.magazine; this.ammo = this.maxAmmo; this.reloadTimer = 0; this.reloadDuration = 72; this.triggerHeld = false;
    this.multishot = profile.multishot; this.pierce = 0; this.critChance = 0.05; this.regen = 0;
    this.magnet = 60; this.explosive = false;
    this.explosionRadius = 42; this.explosionDamage = 0.2;
    this.ricochet = 0; this.chainLightning = 0; this.laserLevel = 0;
    this.droneCount = 0; this.orbitalCount = 0; this.orbitalDamage = 4;
    this.dashDamage = 0; this.lowHpDamage = 0; this.revive = 0;
    this.lives = 0; this.invuln = 0; this.level = 1; this.xp = 0; this.xpNeeded = 6;
    this.thrust = 0; this.upgradeCounts = {};
    this.turretRight = 0; this.turretLeft = 0;
    this.mode = 'folded';
    this.boost = 100; this.boostMax = 100;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.dashDuration = 18;
    this.dashDistance = 0;
    this.dashAngle = 0;
    this.dashProgress = 0;
    this.dashAppliedDistance = 0;
    this.dashHitTimer = 0;
    // apply persistent meta upgrades
    MOD_DEFS.forEach(d => {
      const level = meta.mods[d.id];
      this.upgradeCounts[d.id] = level;
      for(let i=0;i<level; i++) d.apply(this);
    });
  }
}

export class Bullet {
  constructor(x,y,vx,vy,dmg,crit=false,pierce=0,size=5,explosive=false,length=0){
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.dmg = dmg; this.crit = crit; this.pierce = pierce; this.size = size; this.explosive = explosive; this.length = length;
    this.ricochets = 0; this.lastHit = null; this.ricochetCooldown = 0; this.hitTargets = new Set();
  }
  update(){
    this.previousX = this.x; this.previousY = this.y;
    this.x += this.vx;
    this.y += this.vy;
  }
  offscreen(){
    return this.x < -20 || this.x > width+20 || this.y < -20 || this.y > height+20;
  }
  draw(){
    fill(this.crit ? color(255,220,120) : color(255,255,255));
    const angle = Math.atan2(this.vy, this.vx);
    push(); translate(this.x, this.y); rotate(angle);
    fill(this.crit ? color(255,220,120) : color(255,255,255));
    if(this.length > 0) rect(0, 0, this.length, this.size, this.size / 2);
    else circle(0, 0, this.size);
    pop();
  }
}

export class Drone {
  constructor(angle=0){ this.angle = angle; this.distance = 48; this.spin = 0.035; this.x = 0; this.y = 0; this.fireCooldown = 20; }
  update(player, enemies, bullets){
    this.angle += this.spin;
    this.x = player.x + Math.cos(this.angle) * this.distance;
    this.y = player.y + Math.sin(this.angle) * this.distance;
    this.fireCooldown--;
    if(this.fireCooldown <= 0 && enemies.length){
      const target = enemies.reduce((nearest, enemy) => {
        if(!nearest) return enemy;
        const enemyDistance = Math.hypot(enemy.x-this.x, enemy.y-this.y);
        const nearestDistance = Math.hypot(nearest.x-this.x, nearest.y-this.y);
        return enemyDistance < nearestDistance ? enemy : nearest;
      }, null);
      const aim = Math.atan2(target.y-this.y, target.x-this.x);
      bullets.push(new Bullet(this.x, this.y, Math.cos(aim)*14, Math.sin(aim)*14, player.dmg*0.55, false, 0, 4, false));
      this.fireCooldown = 42;
    }
  }
  draw(){ noStroke(); fill(255,184,79,220); circle(this.x, this.y, 9); fill(255,240,180); circle(this.x, this.y, 3); }
}

export class Orbital {
  constructor(angle=0){ this.angle = angle; this.distance = 42; this.x = 0; this.y = 0; }
  update(player){
    this.angle += 0.045;
    this.x = player.x + Math.cos(this.angle) * this.distance;
    this.y = player.y + Math.sin(this.angle) * this.distance;
  }
  draw(){ noFill(); stroke(79,217,255,220); strokeWeight(2); circle(this.x, this.y, 10); }
}

export class Enemy {
  constructor(params){ Object.assign(this, params); }
  // now accepts enemyBullets array reference as third arg to avoid global dependency
  update(player, run, enemyBulletsRef){
    const dx = player.x-this.x, dy = player.y-this.y;
    const d = Math.hypot(dx,dy) || 1;
    this.angle = atan2(dy,dx);
    if(this.type==='chaser'){
      this.x += (dx/d)*this.speed; this.y += (dy/d)*this.speed;
    } else if(this.type==='zigzag'){
      this.phase += 0.12;
      const perpX = -dy/d, perpY = dx/d;
      this.x += (dx/d)*this.speed + perpX*Math.sin(this.phase)*2.2;
      this.y += (dy/d)*this.speed + perpY*Math.sin(this.phase)*2.2;
    } else if(this.type==='shooter'){
      const minShootDistance = 140;
      const maxShootDistance = 260;
      if(d > maxShootDistance){ this.x += (dx/d)*this.speed; this.y += (dy/d)*this.speed; }
      else if(d<160){ this.x -= (dx/d)*this.speed; this.y -= (dy/d)*this.speed; }
      this.fireCooldown--;
      const inShootingRange = d >= minShootDistance && d <= maxShootDistance;
      if(this.fireCooldown<=0 && inShootingRange){
        this.fireCooldown = Math.max(40, 100 - run.wave*4);
        if(Array.isArray(enemyBulletsRef)){
          enemyBulletsRef.push(new Bullet(this.x,this.y,(dx/d)*5,(dy/d)*5,this.dmg*0.6,false,5));
        }
      }
    }
  }
  draw(){
    push(); translate(this.x,this.y); rotate(this.angle);
    stroke(this.color[0],this.color[1],this.color[2]); strokeWeight(2);
    fill(this.color[0],this.color[1],this.color[2], 40);
    if(this.type==='shooter'){
      rectMode(CENTER); rect(0,0,this.r*1.7,this.r*1.7,3);
    } else {
      triangle(this.r*1.3,0, -this.r*0.9,this.r*0.9, -this.r*0.9,-this.r*0.9);
    }
    pop();
    if(this.hp < this.maxHp){ const w=24; noStroke(); fill(0,0,0,150); rect(this.x-w/2, this.y-this.r-10, w,4); fill(255,90,120); rect(this.x-w/2, this.y-this.r-10, w*(this.hp/this.maxHp),4); }
  }
}

export class Asteroid {
  constructor(params){
    Object.assign(this, params);
    this.rotation = random(TWO_PI);
    this.rotationSpeed = random(-0.018, 0.018);
    this.points = Array.from({ length: 9 }, (_, i) => ({
      angle: i * TWO_PI / 9,
      radius: this.r * random(0.78, 1.18),
    }));
  }
  update(){
    this.x += this.vx; this.y += this.vy; this.rotation += this.rotationSpeed;
  }
  draw(){
    push(); translate(this.x, this.y); rotate(this.rotation);
    const glowColor = this.rewardType === 'xp' ? [79, 217, 255] : [255, 184, 79];
    noStroke();
    for(const [scale, alpha] of [[1.28, 18], [1.16, 30], [1.06, 46]]){
      fill(glowColor[0], glowColor[1], glowColor[2], alpha);
      beginShape();
      this.points.forEach(point => vertex(Math.cos(point.angle) * point.radius * scale, Math.sin(point.angle) * point.radius * scale));
      endShape(CLOSE);
    }
    stroke(177, 151, 139, 220); strokeWeight(2); fill(105, 91, 92, 210);
    beginShape(); this.points.forEach(point => vertex(Math.cos(point.angle) * point.radius, Math.sin(point.angle) * point.radius)); endShape(CLOSE);
    pop();
    if(this.hp < this.maxHp){
      const w = this.r * 1.8;
      noStroke(); fill(0, 0, 0, 150); rect(this.x-w/2, this.y-this.r-10, w, 4);
      fill(this.rewardType === 'xp' ? color(79,217,255) : color(255,184,79));
      rect(this.x-w/2, this.y-this.r-10, w * (this.hp/this.maxHp), 4);
    }
  }
}

export class Particle {
  constructor(x,y,vx,vy,life,col){
    this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; this.col=col;
  }
  update(){
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.94; this.vy *= 0.94; this.life--;
  }
  draw(){
    const c = this.col;
    fill(red(c), green(c), blue(c), map(this.life,0,50,0,255));
    circle(this.x, this.y, 3);
  }
}

export class Shockwave {
  constructor(x,y,radius=42){ this.x=x; this.y=y; this.radius=4; this.maxRadius=radius; this.life=14; this.maxLife=14; }
  update(){
    this.radius += (this.maxRadius-this.radius) * 0.32;
    this.life--;
  }
  draw(){
    const alpha = map(this.life,0,this.maxLife,0,190);
    noFill(); stroke(255,184,79,alpha); strokeWeight(2);
    circle(this.x, this.y, this.radius*2);
  }
}


export class Orb { 
  constructor(x,y,amount=1){ this.x=x; this.y=y; this.amount=amount; this.vx=0; this.vy=0; this.homing=false; this.homingSpeed=0.6; }
  update(player){ const dx = player.x - this.x; const dy = player.y - this.y; const d = Math.hypot(dx,dy) || 1;
    // if within magnet, activate homing and accelerate over time until collected
    if(d < player.magnet) this.homing = true;
    if(this.homing){ this.homingSpeed = Math.min(12, this.homingSpeed * 1.09 + 0.2); const a = Math.atan2(dy,dx); this.vx = Math.cos(a) * this.homingSpeed; this.vy = Math.sin(a) * this.homingSpeed; }
    // apply movement directly (no heavy damping) so they reliably reach the player
    this.x += this.vx; this.y += this.vy;
    // small drag to avoid runaway values
    this.vx *= 0.98; this.vy *= 0.98;
  }
  draw(){
    fill(79,217,255,220); push(); translate(this.x,this.y);
    rotate(frameCount*0.05); rectMode(CENTER); rect(0,0,7,7,1); pop();
  }
}

export class ScrapPickup { 
  constructor(x,y,amount=1){ this.x=x; this.y=y; this.amount=amount; this.vx=0; this.vy=0; this.homing=false; this.homingSpeed=0.6; }
  update(player){ const dx = player.x - this.x; const dy = player.y - this.y; const d = Math.hypot(dx,dy) || 1;
    if(d < player.magnet) this.homing = true;
    if(this.homing){ this.homingSpeed = Math.min(10, this.homingSpeed * 1.08 + 0.15); const a = Math.atan2(dy,dx); this.vx = Math.cos(a) * this.homingSpeed; this.vy = Math.sin(a) * this.homingSpeed; }
    this.x += this.vx; this.y += this.vy; this.vx *= 0.98; this.vy *= 0.98;
  }
  draw(){
    fill(255,184,79); push(); translate(this.x,this.y);
    rotate(-frameCount*0.05); rectMode(CENTER);
    const size = 5 + Math.sqrt(this.amount) * 2;
    rect(0,0,size,size,1); pop();
  }
}

export class Turret {
  constructor(side){
    this.side = side;
    this.x = 0; this.y = 0; this.angle = 0;
    this.fireCooldown = 0;
  }
  update(player, targetX, targetY, bullets){
    const sideOffset = this.side * 14;
    const sideAngle = player.angle + HALF_PI;
    this.x = player.x + Math.cos(sideAngle) * sideOffset;
    this.y = player.y + Math.sin(sideAngle) * sideOffset;
    this.angle = Math.atan2(targetY - this.y, targetX - this.x);
    if(this.fireCooldown > 0) this.fireCooldown--;
    if(this.fireCooldown > 0) return;
    bullets.push(new Bullet(this.x, this.y, Math.cos(this.angle) * 14, Math.sin(this.angle) * 14, player.dmg * 0.55, false, 0, 4, player.explosive));
    this.fireCooldown = 42;
  }
  draw(){
    push(); translate(this.x, this.y); rotate(this.angle);
    stroke(255,184,79); strokeWeight(2); fill(255,184,79,210);
    rectMode(CENTER); rect(0, 0, 12, 7, 2); line(3, 0, 10, 0);
    pop();
  }
}


