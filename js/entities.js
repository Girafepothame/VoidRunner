import { SLOT_DEFS, SHIP_PROFILES } from './meta.js';
import { EQUIPMENT_CATEGORIES, rarityById } from './equipment.js';

// Classes for game entities: Player, Bullet, Enemy, Particle, Orb, ScrapPickup
export class Player {
  constructor(x=0,y=0,profileId='standard'){
    this.x = x || width/2; this.y = y || height/2; this.angle = -HALF_PI;
    const profile = SHIP_PROFILES[profileId] || SHIP_PROFILES.standard;
    this.profileId = SHIP_PROFILES[profileId] ? profileId : 'standard';
    this.profile = profile;
    this.baseSpeed = profile.speed; this.speed = profile.speed;
    this.vx = 0; this.vy = 0;
    this.baseMaxHp = 100; this.hp = 100; this.maxHp = 100;
    this.fireCooldown = 0; this.fireRate = profile.fireRate;
    this.dmg = profile.dmg; this.dmgPerLevel = 0; this.lastDamageGain = 0; this.bulletSpeed = 50; this.bulletLength = 24; this.bulletSize = 3;
    this.maxAmmo = profile.magazine; this.ammo = this.maxAmmo; this.reloadTimer = 0; this.reloadDuration = 72; this.triggerHeld = false;
    this.multishot = profile.multishot; this.pierce = 0; this.critChance = 0.05; this.regen = 0; this.boostRegenBonus = 0;
    this.magnet = 60; this.explosive = false;
    this.explosionRadius = 42; this.explosionDamage = 0.2;
    this.ricochet = 0; this.chainLightning = 0; this.laserLevel = 0;
    this.droneCount = 0; this.orbitalCount = 0; this.orbitalDamage = 4;
    this.dashDamage = 0; this.lowHpDamage = 0; this.revive = 0;
    this.lives = 0; this.invuln = 0; this.level = 1; this.xp = 0; this.xpNeeded = 6;
    this.thrust = 0; this.upgradeCounts = {};
    this.boost = 100; this.boostMax = 100;
    this.dashCooldownTimer = 0;
    this.dashTimer = 0;
    this.dashDuration = 10;
    this.dashDistance = 0;
    this.dashAngle = 0;
    this.dashProgress = 0;
    this.dashAppliedDistance = 0;
    // Équipement : slots fixes par catégorie (taille = max débloquable dans
    // la meta-progression, voir SLOT_DEFS), + un petit inventaire de
    // stockage pour les objets trouvés en run mais pas encore équipés. Ni
    // les slots remplis ni l'inventaire ne persistent entre les runs — seul
    // le NOMBRE de slots débloqués (meta.unlockedSlots) est permanent.
    this.loadout = {
      drone: new Array(SLOT_DEFS.drone.max).fill(null),
      reactor: new Array(SLOT_DEFS.reactor.max).fill(null),
      hull: new Array(SLOT_DEFS.hull.max).fill(null),
    };
    this.inventory = new Array(5).fill(null);
  }
}

export class HyperPortal {
  constructor(x, y, colorValue){
    this.x = x; this.y = y; this.radius = 46; this.color = colorValue; this.phase = 0;
  }
  update(){ this.phase += 0.06; }
  draw(){
    const pulse = 1 + Math.sin(this.phase) * 0.08;
    noFill();
    for(const [scale, alpha, weight] of [[1.65, 25, 2], [1.35, 60, 3], [1, 230, 3]]){
      stroke(this.color[0], this.color[1], this.color[2], alpha); strokeWeight(weight);
      circle(this.x, this.y, this.radius * scale * pulse);
    }
    stroke(255, 255, 255, 170); strokeWeight(1);
    circle(this.x, this.y, this.radius * 0.68);
    for(let i=0;i<4;i++){
      const angle = this.phase * 0.7 + i * HALF_PI;
      line(this.x + Math.cos(angle) * 24, this.y + Math.sin(angle) * 24,
        this.x + Math.cos(angle) * 39, this.y + Math.sin(angle) * 39);
    }
  }
}

// Couleurs des balles mises en cache au premier draw() (on ne peut pas
// appeler color() avant que p5 soit initialisé, donc init paresseuse).
// Évite de recréer un objet p5.Color à chaque frame pour chaque balle.
let _bulletCritColor = null;
let _bulletNormalColor = null;

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
    if(!_bulletCritColor){ _bulletCritColor = color(255,220,120); _bulletNormalColor = color(255,255,255); }
    const angle = Math.atan2(this.vy, this.vx);
    push(); translate(this.x, this.y); rotate(angle);
    fill(this.crit ? _bulletCritColor : _bulletNormalColor);
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
  constructor(params){
    Object.assign(this, params);
    this.aggroRange = params.aggroRange ?? (this.isPortalBoss || this.isMiniboss ? Infinity : 320);
    this.wanderAngle = params.wanderAngle ?? random(TWO_PI);
    this.wanderTimer = params.wanderTimer ?? random(45, 140);
    this.wanderTurn = params.wanderTurn ?? random(-0.025, 0.025);
  }
  // now accepts enemyBullets array reference as third arg to avoid global dependency
  update(player, run, enemyBulletsRef){
    const dx = player.x-this.x, dy = player.y-this.y;
    const d = Math.hypot(dx,dy) || 1;
    const sniperLocked = this.type === 'sniper' && (this.state === 'aiming' || this.state === 'firing' || this.state === 'laserGap');
    const aggro = d <= this.aggroRange || sniperLocked;
    if(!aggro){
      if(this.type === 'sniper' && this.state === 'cooldown'){
        this.fireCooldown--;
        if(this.fireCooldown <= 0) this.state = 'seeking';
      }
      this.wanderTimer--;
      this.wanderAngle += this.wanderTurn;
      if(this.wanderTimer <= 0){
        this.wanderTimer = random(45, 140);
        this.wanderTurn = random(-0.025, 0.025);
        this.wanderAngle += random(-0.7, 0.7);
      }
      this.angle = this.wanderAngle;
      this.x += Math.cos(this.wanderAngle) * this.speed * 0.65;
      this.y += Math.sin(this.wanderAngle) * this.speed * 0.65;
      return;
    }
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
        this.fireCooldown = Math.max(40, 100 - Math.floor((run?.biome || 0) * 4));
        if(Array.isArray(enemyBulletsRef)){
          enemyBulletsRef.push(new Bullet(this.x,this.y,(dx/d)*5,(dy/d)*5,this.dmg*0.6,false,5));
        }
      }
    } else if(this.type==='sniper'){
      // Garde ses distances, télégraphie une grosse attaque (ligne rouge qui
      // suit le joueur) puis tire un projectile rapide et puissant une fois
      // le viseur verrouillé — force à changer brutalement de direction.
      const idealDist = 380;
      if(this.state !== 'aiming' && this.state !== 'firing'){
        if(d > idealDist+40){ this.x += (dx/d)*this.speed; this.y += (dy/d)*this.speed; }
        else if(d < idealDist-40){ this.x -= (dx/d)*this.speed; this.y -= (dy/d)*this.speed; }
      }
      if(!this.state) this.state = 'seeking';
      if(this.state === 'seeking'){
        this.fireCooldown--;
        if(this.fireCooldown <= 0){ this.state = 'aiming'; this.aimTimer = 70; }
      } else if(this.state === 'aiming'){
        this.angle = Math.atan2(dy,dx);
        this.aimTimer--;
        if(this.aimTimer <= 0){
          this.state = 'firing'; this.fireTimer = 10;
        }
      } else if(this.state === 'firing'){
        this.angle = Math.atan2(dy,dx);
        this.fireTimer--;
        if(this.fireTimer <= 0){
          this.state = 'laserGap'; this.fireTimer = 2;
        }
      } else if(this.state === 'laserGap'){
        this.fireTimer--;
        if(this.fireTimer > 0) return;
        this.angle = Math.atan2(dy,dx);
        this.state = 'cooldown'; this.fireCooldown = 150;
        this.laserAngle = this.angle;
        this.laserTimer = 5;
        if(typeof enemyBulletsRef === 'function') enemyBulletsRef(this);
      } else if(this.state === 'cooldown'){
        this.fireCooldown--;
        if(this.fireCooldown <= 0) this.state = 'seeking';
      }
      if(this.laserTimer > 0) this.laserTimer--;
    }
  }
  draw(){
    if(this.type==='sniper' && (this.state==='aiming' || this.state==='firing' || this.laserTimer > 0)){
      const alpha = this.state === 'aiming'
        ? map(this.aimTimer, 70, 0, 40, 255)
        : 255;
      const laserAngle = this.laserTimer > 0 ? this.laserAngle : this.angle;
      const laserLength = Math.max(width, height) * 3;
      stroke(255,80,80,alpha); strokeWeight(this.laserTimer > 0 ? 3 : 1.5);
      line(this.x, this.y, this.x+Math.cos(laserAngle)*laserLength, this.y+Math.sin(laserAngle)*laserLength);
    }
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

// Particle est maintenant poolable : reset() réinitialise une instance
// existante au lieu d'en créer une nouvelle (voir spawnBurst dans
// gameplay.js). Le flag `active` indique si la particule doit être mise à
// jour / dessinée, sans jamais faire d'allocation en jeu.
export class Particle {
  constructor(x=0,y=0,vx=0,vy=0,life=0,col=null){
    this.reset(x,y,vx,vy,life,col);
  }
  reset(x,y,vx,vy,life,col){
    this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; this.col=col;
    this.active = true;
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

// Pickup d'équipement : dropé uniquement par les mini-boss. Homing comme
// les autres pickups, coloré selon la rareté de l'objet transporté
// (this.item, généré par equipment.js::rollEquipment).
export class EquipmentPickup {
  constructor(x,y,item){ this.x=x; this.y=y; this.item=item; this.vx=0; this.vy=0; this.homing=false; this.homingSpeed=0.6; }
  update(player){
    const dx = player.x - this.x; const dy = player.y - this.y; const d = Math.hypot(dx,dy) || 1;
    if(d < player.magnet) this.homing = true;
    if(this.homing){ this.homingSpeed = Math.min(11, this.homingSpeed * 1.08 + 0.18); const a = Math.atan2(dy,dx); this.vx = Math.cos(a) * this.homingSpeed; this.vy = Math.sin(a) * this.homingSpeed; }
    this.x += this.vx; this.y += this.vy; this.vx *= 0.98; this.vy *= 0.98;
  }
  draw(){
    const rarity = rarityById(this.item.rarityId);
    const c = color(rarity.color);
    push(); translate(this.x, this.y); rotate(frameCount*0.04);
    noFill(); stroke(red(c), green(c), blue(c), 230); strokeWeight(2);
    rectMode(CENTER); rect(0, 0, 12, 12, 2);
    noStroke(); fill(red(c), green(c), blue(c), 220);
    circle(0, 0, 5);
    pop();
  }
}

export class Turret {
  constructor(side){
    this.side = side;
    this.x = 0; this.y = 0; this.angle = 0;
    this.fireCooldown = 0;
    // Renseignés depuis l'objet d'équipement "drone" qui occupe ce slot
    // (voir makeTurretFromEquipment dans gameplay.js) ; valeurs par défaut
    // si jamais créée sans équipement (ne devrait pas arriver en jeu).
    this.dmgMult = 0.55;
    this.fireRate = 42;
  }
  update(player, targetX, targetY, bullets){
    const sideOffset = this.side * 14;
    const sideAngle = player.angle + HALF_PI;
    this.x = player.x + Math.cos(sideAngle) * sideOffset;
    this.y = player.y + Math.sin(sideAngle) * sideOffset;
    this.angle = Math.atan2(targetY - this.y, targetX - this.x);
    if(this.fireCooldown > 0) this.fireCooldown--;
    if(this.fireCooldown > 0) return;
    bullets.push(new Bullet(this.x, this.y, Math.cos(this.angle) * 14, Math.sin(this.angle) * 14, player.dmg * this.dmgMult, false, 0, 4, player.explosive));
    this.fireCooldown = this.fireRate;
  }
  draw(){
    push(); translate(this.x, this.y); rotate(this.angle);
    stroke(255,184,79); strokeWeight(2); fill(255,184,79,210);
    rectMode(CENTER); rect(0, 0, 12, 7, 2); line(3, 0, 10, 0);
    pop();
  }
}