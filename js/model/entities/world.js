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
  update(){ this.x += this.vx; this.y += this.vy; this.rotation += this.rotationSpeed; }
  draw(){
    push(); translate(this.x, this.y); rotate(this.rotation);
    const glowColor = this.rewardType === 'xp' ? [79, 217, 255] : [255, 184, 79];
    noStroke();
    for(const [scale, alpha] of [[1.28, 18], [1.16, 30], [1.06, 46]]){
      fill(glowColor[0], glowColor[1], glowColor[2], alpha);
      beginShape(); this.points.forEach(point => vertex(Math.cos(point.angle) * point.radius * scale, Math.sin(point.angle) * point.radius * scale)); endShape(CLOSE);
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
