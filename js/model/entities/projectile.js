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
    const angle = Math.atan2(this.vy, this.vx);
    push(); translate(this.x, this.y); rotate(angle);
    fill(this.crit ? color(255,220,120) : color(255,255,255));
    if(this.length > 0) rect(0, 0, this.length, this.size, this.size / 2);
    else circle(0, 0, this.size);
    pop();
  }
}
