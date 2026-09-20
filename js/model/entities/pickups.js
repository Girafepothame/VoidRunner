import { rarityById } from '../../equipment.js';

export class Orb {
  constructor(x,y,amount=1){ this.x=x; this.y=y; this.amount=amount; this.vx=0; this.vy=0; this.homing=false; this.homingSpeed=0.6; }
  update(player){
    const dx = player.x - this.x; const dy = player.y - this.y; const d = Math.hypot(dx,dy) || 1;
    if(d < player.magnet) this.homing = true;
    if(this.homing){ this.homingSpeed = Math.min(12, this.homingSpeed * 1.09 + 0.2); const a = Math.atan2(dy,dx); this.vx = Math.cos(a) * this.homingSpeed; this.vy = Math.sin(a) * this.homingSpeed; }
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.98; this.vy *= 0.98;
  }
  draw(){ fill(79,217,255,220); push(); translate(this.x,this.y); rotate(frameCount*0.05); rectMode(CENTER); rect(0,0,7,7,1); pop(); }
}

export class ScrapPickup {
  constructor(x,y,amount=1){ this.x=x; this.y=y; this.amount=amount; this.vx=0; this.vy=0; this.homing=false; this.homingSpeed=0.6; }
  update(player){
    const dx = player.x - this.x; const dy = player.y - this.y; const d = Math.hypot(dx,dy) || 1;
    if(d < player.magnet) this.homing = true;
    if(this.homing){ this.homingSpeed = Math.min(10, this.homingSpeed * 1.08 + 0.15); const a = Math.atan2(dy,dx); this.vx = Math.cos(a) * this.homingSpeed; this.vy = Math.sin(a) * this.homingSpeed; }
    this.x += this.vx; this.y += this.vy; this.vx *= 0.98; this.vy *= 0.98;
  }
  draw(){
    fill(255,184,79); push(); translate(this.x,this.y); rotate(-frameCount*0.05); rectMode(CENTER);
    const size = 5 + Math.sqrt(this.amount) * 2; rect(0,0,size,size,1); pop();
  }
}

export class EquipmentPickup {
  constructor(x,y,item){ this.x=x; this.y=y; this.item=item; this.vx=0; this.vy=0; this.homing=false; this.homingSpeed=0.6; }
  update(player){
    const dx = player.x - this.x; const dy = player.y - this.y; const d = Math.hypot(dx,dy) || 1;
    if(d < player.magnet) this.homing = true;
    if(this.homing){ this.homingSpeed = Math.min(11, this.homingSpeed * 1.08 + 0.18); const a = Math.atan2(dy,dx); this.vx = Math.cos(a) * this.homingSpeed; this.vy = Math.sin(a) * this.homingSpeed; }
    this.x += this.vx; this.y += this.vy; this.vx *= 0.98; this.vy *= 0.98;
  }
  draw(){
    const rarity = rarityById(this.item.rarityId); const c = color(rarity.color);
    push(); translate(this.x, this.y); rotate(frameCount*0.04);
    noFill(); stroke(red(c), green(c), blue(c), 230); strokeWeight(2); rectMode(CENTER); rect(0, 0, 12, 12, 2);
    noStroke(); fill(red(c), green(c), blue(c), 220); circle(0, 0, 5); pop();
  }
}
