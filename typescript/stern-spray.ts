// Spray thrown up by a propeller breaking the surface, for the renderer.
import {SUB_DESIGN} from './hull-design.ts';
import {boatPoint,hash01,surfaceHeight,surfaceMotion} from './surface-motion.ts';

type Hull = Parameters<typeof surfaceMotion>[0];
type Sea = Parameters<typeof surfaceMotion>[1];
type Point = ReturnType<typeof boatPoint>;
interface Droplet { x: number; y: number; height: number; vx: number; vy: number; up: number; born: number; life: number; mist: boolean }

// World-space emission at fixed patrol-clock intervals. A paused frame can
// redraw the same drops from any camera without emitting or advancing them.
const ticksPerSecond = 16, dropsPerTick = 14, maxLife = 1.5;
export class SternSpray {
  readonly capacity = (Math.ceil(maxLife*ticksPerSecond)+1)*dropsPerTick;
  readonly positions = new Float32Array(this.capacity*3);
  readonly opacity = new Float32Array(this.capacity);
  readonly widths = new Float32Array(this.capacity);
  private drops: Droplet[] = [];
  private lastTick = -1;
  private patrol?: object;
  private previous?: {time:number; hub:Point; rpm:number};

  update(patrol: object, time: number, pose: Hull, rpm: number, sea: Sea): number {
    const {heading,pitch}=pose, radius=SUB_DESIGN.propellerRadius;
    const hub=boatPoint(pose,{forward:-SUB_DESIGN.propellerZ});
    const tick = Math.floor(time*ticksPerSecond);
    if (patrol !== this.patrol || !this.previous || time < this.previous.time || time-this.previous.time > maxLife) {
      this.drops.length = 0;
      this.lastTick = tick-1;
      this.patrol = patrol;
      this.previous = {time,hub,rpm};
    }
    const previous = this.previous;
    if (tick > this.lastTick && this.drops.length) this.drops = this.drops.filter(d => time-d.born < d.life);
    for (let batch = this.lastTick+1; batch <= tick; batch++) {
      const born = batch/ticksPerSecond;
      const f = time===previous.time ? 1 : Math.max(0, (born-previous.time)/(time-previous.time));
      const depth = previous.hub.depth + (hub.depth-previous.hub.depth)*f;
      const shaftSpeed = previous.rpm + (rpm-previous.rpm)*f;
      if (shaftSpeed===0 || depth>radius+7) continue; // Below even the deepest game wave trough.
      const x = previous.hub.x + (hub.x-previous.hub.x)*f, y = previous.hub.y + (hub.y-previous.hub.y)*f;
      const water = surfaceHeight(x,y,born,sea), reach = radius*Math.cos(pitch);
      const exposed = (reach-depth-water)/(2*reach);
      if (exposed<=0 || exposed>=1) continue;
      const spin = Math.min(1,Math.abs(shaftSpeed)/180);
      const count = Math.ceil(dropsPerTick*spin*Math.sqrt(4*exposed*(1-exposed)));
      const angle = heading*Math.PI/180, sn = Math.sin(angle), cs = Math.cos(angle);
      for (let i=0; i<count; i++) {
        const seed = batch*dropsPerTick+i, side = 2*hash01(seed,1)-1;
        const across = side*(1.5+spin*5), aft = Math.sign(shaftSpeed)*spin*(1+hash01(seed,2)*4);
        const up = (2+spin*7)*(.45+.55*hash01(seed,3));
        this.drops.push({x:x+side*radius*cs,y:y-side*radius*sn,height:water+.08,
          vx:across*cs-aft*sn,vy:-across*sn-aft*cs,up,born,life:Math.min(maxLife,up/4.9),mist:i%4===0});
      }
    }
    this.lastTick = tick;
    this.previous = {time,hub,rpm};
    let visible = 0;
    for (const d of this.drops) {
      const age = time-d.born;
      if (age>=d.life) continue;
      const i = visible++;
      this.positions[i*3] = d.x+d.vx*age;
      this.positions[i*3+1] = d.height+d.up*age-4.9*age*age;
      this.positions[i*3+2] = -(d.y+d.vy*age);
      const fraction=age/d.life;
      this.opacity[i] = (1-fraction*fraction)*(d.mist?.24:.82);
      this.widths[i] = d.mist?2+2.5*fraction:.65+.35*(1-fraction);
    }
    return visible;
  }
}
