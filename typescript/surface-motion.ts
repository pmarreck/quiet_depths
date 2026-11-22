import {SUB_DESIGN} from './hull-design.ts';

interface Sea { waveScale: number; waveSpeed: number }
interface Point { x: number; y: number; depth: number }
interface Hull extends Point { heading: number; pitch: number; roll?: number }
interface Offset { side?: number; forward?: number; down?: number }
interface Droplet { x: number; y: number; height: number; vx: number; vy: number; up: number; born: number; life: number; mist: boolean }

export const periscopeDepth = 15;
export const WAVE_COMPONENTS = [
  {kx:.023, ky:0, omega:.85, amplitude:1.1}, {kx:0, ky:.038, omega:1.1, amplitude:.65},
  {kx:.065, ky:.065, omega:-1.3, amplitude:.24}, {kx:.14, ky:.06, omega:1.8, amplitude:.3},
  {kx:0, ky:.31, omega:-2.3, amplitude:.11}
] as const;

export function surfaceHeight(x: number, y: number, time: number, sea: Sea): number {
  let sum = 0;
  for (const w of WAVE_COMPONENTS) sum += w.amplitude * Math.sin(x*w.kx + y*w.ky + time*sea.waveSpeed*w.omega);
  return sea.waveScale * sum;
}

export function surfaceMotion(boat: Hull, sea: Sea, time: number): Hull {
  const hullRadius = SUB_DESIGN.hullRadius;
  const {x, y, heading} = boat;
  const response = Math.max(0, 1 - Math.max(0, boat.depth) / periscopeDepth) ** 2;
  if (!response) return {x, y, heading, depth:boat.depth, pitch:boat.pitch, roll:0};
  const angle = heading*Math.PI/180, east = Math.sin(angle), north = Math.cos(angle);
  const wave = (ahead: number, right: number) => surfaceHeight(x+ahead*east+right*north, y+ahead*north-right*east, time, sea);
  const arm = 23, bow = wave(arm,0), stern = wave(-arm,0);
  const heave = (bow + 2*wave(0,0) + stern) / 4;
  return {
    x, y, heading,
    depth: boat.depth + response*(hullRadius/3 - heave),
    pitch: boat.pitch + response*Math.atan2(bow-stern, 2*arm),
    roll: response*.45*Math.atan2(wave(0,hullRadius)-wave(0,-hullRadius), 2*hullRadius)
  };
}

// Local axes are starboard, forward and down. Apply roll, pitch and heading
// in the same order as the Three.js YXZ hull transform.
export function boatPoint(boat: Hull, offset: Offset): Point {
  const {side=0, forward=0, down=0} = offset;
  const angle=boat.heading*Math.PI/180, sn=Math.sin(angle), cs=Math.cos(angle);
  const cp=Math.cos(boat.pitch||0), sp=Math.sin(boat.pitch||0);
  const cr=Math.cos(boat.roll||0), sr=Math.sin(boat.roll||0);
  const right=side*cr+down*sr, below=down*cr-side*sr, ahead=forward*cp+below*sp;
  return {x:boat.x+right*cs+ahead*sn, y:boat.y-right*sn+ahead*cs, depth:boat.depth-forward*sp+below*cp};
}

export function boatLocal(boat: Hull, at: Point): Required<Offset> {
  const angle=boat.heading*Math.PI/180, sn=Math.sin(angle), cs=Math.cos(angle);
  const cp=Math.cos(boat.pitch||0), sp=Math.sin(boat.pitch||0);
  const cr=Math.cos(boat.roll||0), sr=Math.sin(boat.roll||0);
  const dx=at.x-boat.x, dy=at.y-boat.y, dz=at.depth-boat.depth;
  const ahead=dx*sn+dy*cs, right=dx*cs-dy*sn, below=ahead*sp+dz*cp;
  return {side:right*cr-below*sr, forward:ahead*cp-dz*sp, down:below*cr+right*sr};
}

export function hash01(seed: number, n = 0): number {
  let x = (seed + Math.imul(n+1,0x9e3779b9)) | 0;
  x = Math.imul(x ^ (x>>>16),0x21f0aaad);
  x = Math.imul(x ^ (x>>>15),0x735a2d97);
  return ((x ^ (x>>>15))>>>0)/4294967296;
}

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
