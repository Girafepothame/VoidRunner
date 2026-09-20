import { Bullet } from './projectile.js';

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

export class Turret {
  constructor(side){
    this.side = side;
    this.x = 0; this.y = 0; this.angle = 0;
    this.fireCooldown = 0;
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
