export class Asteroid {
  constructor(params){
    Object.assign(this, params);
    this.rotation = random(TWO_PI);
    this.rotationSpeed = random(-0.018, 0.018);
    this.points = Array.from({ length: 6 }, (_, i) => ({
      angle: i * TWO_PI / 6,
      radius: this.r * random(0.78, 1.18),
    }));
    this.meshRings = [-0.82, 0, 0.82].map(latitude =>
      this.points.map(point => ({
        x: Math.cos(point.angle) * point.radius * Math.cos(latitude),
        y: Math.sin(latitude) * point.radius * 0.78,
        z: Math.sin(point.angle) * point.radius * Math.cos(latitude),
      }))
    );
  }
  update(){ this.x += this.vx; this.y += this.vy; this.rotation += this.rotationSpeed; }
  draw(){
    push(); translate(this.x, this.y);
    const glowColor = this.rewardType === 'xp' ? [79, 217, 255] : [255, 184, 79];
    const yaw = this.rotation;
    const pitch = 0.72 + Math.sin(this.rotation * 0.65) * 0.12;
    const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
    const projected = this.meshRings.map(ring => ring.map(point => {
      const rotatedX = point.x * cosYaw - point.z * sinYaw;
      const rotatedZ = point.x * sinYaw + point.z * cosYaw;
      const rotatedY = point.y * cosPitch - rotatedZ * sinPitch;
      const depth = point.y * sinPitch + rotatedZ * cosPitch;
      const perspective = 2.8 / (2.8 - depth / this.r * 0.38);
      return { x: rotatedX * perspective, y: rotatedY * perspective, depth };
    }));

    const edges = [];
    for(let ringIndex = 0; ringIndex < projected.length; ringIndex++){
      const ring = projected[ringIndex];
      for(let pointIndex = 0; pointIndex < ring.length; pointIndex++){
        const nextIndex = (pointIndex + 1) % ring.length;
        edges.push([ring[pointIndex], ring[nextIndex]]);
        if(ringIndex < projected.length - 1){
          const nextRing = projected[ringIndex + 1];
          edges.push([ring[pointIndex], nextRing[pointIndex]]);
        }
      }
    }

    noFill();
    stroke(glowColor[0], glowColor[1], glowColor[2], 32);
    strokeWeight(Math.max(2, this.r * 0.055));
    beginShape(LINES);
    for(const [start, end] of edges){
      vertex(start.x, start.y); vertex(end.x, end.y);
    }
    endShape();

    stroke(177, 151, 139, 76); strokeWeight(1);
    beginShape(LINES);
    for(const [start, end] of edges){
      if((start.depth + end.depth) * 0.5 <= 0){
        vertex(start.x, start.y); vertex(end.x, end.y);
      }
    }
    endShape();

    stroke(glowColor[0], glowColor[1], glowColor[2], 220); strokeWeight(1.5);
    beginShape(LINES);
    for(const [start, end] of edges){
      if((start.depth + end.depth) * 0.5 > 0){
        vertex(start.x, start.y); vertex(end.x, end.y);
      }
    }
    endShape();
    pop();
    if(this.hp < this.maxHp){
      const w = this.r * 1.8;
      noStroke(); fill(0, 0, 0, 150); rect(this.x-w/2, this.y-this.r-10, w, 4);
      fill(this.rewardType === 'xp' ? color(79,217,255) : color(255,184,79));
      rect(this.x-w/2, this.y-this.r-10, w * (this.hp/this.maxHp), 4);
    }
  }
}
