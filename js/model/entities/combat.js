import { Bullet } from './projectile.js';

let _bulletCritColor = null;
let _bulletNormalColor = null;

export { Bullet };

export class Enemy {
  constructor(params){
    Object.assign(this, params);
    this.parts = params.parts || (params.shape ? [params.shape] : []);
    this.collisionRadius = this.r * 1.3;
    this.aggroRange = params.aggroRange ?? (this.isPortalBoss || this.isMiniboss ? Infinity : 320);
    this.aggroed = false;
    this.provoked = false;
    this.wanderAngle = params.wanderAngle ?? random(TWO_PI);
    this.wanderTimer = params.wanderTimer ?? random(45, 140);
    this.wanderTurn = params.wanderTurn ?? random(-0.025, 0.025);
  }
  update(player, run, enemyBulletsRef){
    const dx = player.x-this.x, dy = player.y-this.y;
    const d = Math.hypot(dx,dy) || 1;
    const aggro = this.provoked || d <= this.aggroRange * (this.aggroed ? 2 : 1);
    this.aggroed = aggro;
    if(!aggro){
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
    const chaseSpeed = this.speed * 1.5;
    this.x += (dx/d)*chaseSpeed; this.y += (dy/d)*chaseSpeed;
  }
  draw(){
    push(); translate(this.x,this.y); rotate(this.angle);
    stroke(this.color[0], this.color[1], this.color[2]); strokeWeight(2);
    fill(this.color[0], this.color[1], this.color[2], 40);
    triangle(this.r * 1.2, 0, -this.r * 0.9, this.r * 0.9, -this.r * 0.9, -this.r * 0.9);
    pop();
    if(this.hp < this.maxHp){ const w=24; noStroke(); fill(0,0,0,150); rect(this.x-w/2, this.y-this.r-10, w,4); fill(255,90,120); rect(this.x-w/2, this.y-this.r-10, w*(this.hp/this.maxHp),4); }
  }
}
