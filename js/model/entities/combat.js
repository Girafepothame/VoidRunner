import { Bullet } from './projectile.js';

let _bulletCritColor = null;
let _bulletNormalColor = null;

export { Bullet };

export class Enemy {
  constructor(params){
    Object.assign(this, params);
    this.parts = params.parts || (params.shape ? [params.shape] : []);
    this.core = params.core || (this.parts.length ? { x: 0, y: -6, r: 3 } : null);
    this.aggroRange = params.aggroRange ?? (this.isPortalBoss || this.isMiniboss ? Infinity : 320);
    this.wanderAngle = params.wanderAngle ?? random(TWO_PI);
    this.wanderTimer = params.wanderTimer ?? random(45, 140);
    this.wanderTurn = params.wanderTurn ?? random(-0.025, 0.025);
  }
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
        if(this.aimTimer <= 0){ this.state = 'firing'; this.fireTimer = 10; }
      } else if(this.state === 'firing'){
        this.angle = Math.atan2(dy,dx);
        this.fireTimer--;
        if(this.fireTimer <= 0){ this.state = 'laserGap'; this.fireTimer = 2; }
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
      const alpha = this.state === 'aiming' ? map(this.aimTimer, 70, 0, 40, 255) : 255;
      const laserAngle = this.laserTimer > 0 ? this.laserAngle : this.angle;
      const laserLength = Math.max(width, height) * 3;
      stroke(255,80,80,alpha); strokeWeight(this.laserTimer > 0 ? 3 : 1.5);
      line(this.x, this.y, this.x+Math.cos(laserAngle)*laserLength, this.y+Math.sin(laserAngle)*laserLength);
    }
    push(); translate(this.x,this.y); rotate(this.angle + (this.parts.length ? HALF_PI : 0));
    stroke(this.color[0],this.color[1],this.color[2]); strokeWeight(2);
    fill(this.color[0],this.color[1],this.color[2], 40);
    if(this.parts.length){
      this.parts.forEach(part => { beginShape(); part.forEach(([x,y]) => vertex(x,y)); endShape(CLOSE); });
      noStroke(); fill(255, 225, 150, 230); circle(this.core.x, this.core.y, this.core.r * 2);
      fill(255, 255, 255, 230); circle(this.core.x, this.core.y, this.core.r * 0.7);
    } else if(this.type==='shooter'){
      rectMode(CENTER); rect(0,0,this.r*1.7,this.r*1.7,3);
    } else {
      triangle(this.r*1.3,0, -this.r*0.9,this.r*0.9, -this.r*0.9,-this.r*0.9);
    }
    pop();
    if(this.hp < this.maxHp){ const w=24; noStroke(); fill(0,0,0,150); rect(this.x-w/2, this.y-this.r-10, w,4); fill(255,90,120); rect(this.x-w/2, this.y-this.r-10, w*(this.hp/this.maxHp),4); }
  }
}
