const LEN_MIN = 4;
const LEN_MAX = 160;
const BULLET_ACCELERATION_FRAMES = 12;
const WHITE = [255, 255, 255];

function bullet(x, y, dx, dy, len, w, c, alpha){
  const px = -dy * w, py = dx * w;
  const rearX = x - dx * len, rearY = y - dy * len;
  fill(c[0], c[1], c[2], alpha);
  triangle(rearX, rearY, x + px, y + py, x - px, y - py);
}

export class Bullet {
  constructor(x,y,vx,vy,dmg,crit=false,pierce=0,size=5,explosive=false,length=0){
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.dmg = dmg; this.crit = crit; this.pierce = pierce; this.size = size; this.explosive = explosive; this.length = length;
    this.maxSpeed = Math.hypot(vx, vy);
    this.age = 0;
    this.ricochets = 0; this.lastHit = null; this.ricochetCooldown = 0; this.hitTargets = new Set();
  }
  update(){
    this.previousX = this.x; this.previousY = this.y;
    this.age++;
    const speed = Math.hypot(this.vx, this.vy);
    if(speed > 0 && this.age <= BULLET_ACCELERATION_FRAMES){
      const acceleratedSpeed = this.maxSpeed * this.age / BULLET_ACCELERATION_FRAMES;
      this.vx = this.vx / speed * acceleratedSpeed;
      this.vy = this.vy / speed * acceleratedSpeed;
    }
    this.x += this.vx;
    this.y += this.vy;
  }
  offscreen(){
    return this.x < -20 || this.x > width+20 || this.y < -20 || this.y > height+20;
  }
  draw(){
    const speed = Math.hypot(this.vx, this.vy);
    const directionLength = speed || 1;
    const dx = this.vx / directionLength, dy = this.vy / directionLength;
    const speedProgress = this.maxSpeed > 0 ? Math.min(1, speed / this.maxSpeed) : 0;
    const len = lerp(LEN_MIN, LEN_MAX, speedProgress);
    bullet(this.x, this.y, dx, dy, len, this.size, WHITE, 255);
  }
}
