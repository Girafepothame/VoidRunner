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
    stroke(255, 255, 255, 170); strokeWeight(1); circle(this.x, this.y, this.radius * 0.68);
    for(let i=0;i<4;i++){
      const angle = this.phase * 0.7 + i * HALF_PI;
      line(this.x + Math.cos(angle) * 24, this.y + Math.sin(angle) * 24, this.x + Math.cos(angle) * 39, this.y + Math.sin(angle) * 39);
    }
  }
}

export class Particle {
  constructor(x=0,y=0,vx=0,vy=0,life=0,col=null){ this.reset(x,y,vx,vy,life,col); }
  reset(x,y,vx,vy,life,col){
    this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; this.col=col; this.active = true;
  }
  update(){ this.x += this.vx; this.y += this.vy; this.vx *= 0.94; this.vy *= 0.94; this.life--; }
  draw(){ const c = this.col; fill(red(c), green(c), blue(c), map(this.life,0,50,0,255)); circle(this.x, this.y, 3); }
}

let shockwaveFrames = [];

export function setShockwaveFrames(frames){
  shockwaveFrames = frames;
}

export class Shockwave {
  constructor(x,y,radius=42){ this.x=x; this.y=y; this.radius=4; this.maxRadius=radius; this.life=36; this.maxLife=36; }
  update(){ this.radius += (this.maxRadius-this.radius) * 0.32; this.life--; }
  draw(){
    if(shockwaveFrames.length){
      const progress = constrain((this.maxLife - this.life) / (this.maxLife - 1), 0, 1);
      const framePosition = progress * (shockwaveFrames.length - 1);
      const frameIndex = Math.floor(framePosition);
      const nextFrameIndex = Math.min(frameIndex + 1, shockwaveFrames.length - 1);
      const blend = framePosition - frameIndex;
      const diameter = this.maxRadius * 2;
      push();
      imageMode(CENTER);
      tint(255, 255 * (1 - blend));
      image(shockwaveFrames[frameIndex], this.x, this.y, diameter, diameter);
      if(blend > 0){
        tint(255, 255 * blend);
        image(shockwaveFrames[nextFrameIndex], this.x, this.y, diameter, diameter);
      }
      pop();
      return;
    }
    const alpha = map(this.life,0,this.maxLife,0,190);
    noFill(); stroke(255,184,79,alpha); strokeWeight(2); circle(this.x, this.y, this.radius*2);
  }
}
