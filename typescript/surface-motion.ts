// Mirrored in elm/Sim/SurfaceMotion.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {SUB_DESIGN} from './hull-design.ts';

interface Sea { waveScale: number; waveSpeed: number; wavePhase?: number; sampledAt?: number }
interface Point { x: number; y: number; depth: number }
interface Hull extends Point { heading: number; pitch: number; roll?: number }
interface Offset { side?: number; forward?: number; down?: number }

export const periscopeDepth = 15;
export const WAVE_COMPONENTS = [
  {kx:.023, ky:0, omega:.85, amplitude:1.1}, {kx:0, ky:.038, omega:1.1, amplitude:.65},
  {kx:.065, ky:.065, omega:-1.3, amplitude:.24}, {kx:.14, ky:.06, omega:1.8, amplitude:.3},
  {kx:0, ky:.31, omega:-2.3, amplitude:.11}
] as const;

// Phase is accumulated during play. A saved or photographed frame can be
// sampled again without retiming every preceding wave when the front changes.
export function wavePhaseAt(time: number, sea: Sea): number {
  return sea.wavePhase === undefined ? time*sea.waveSpeed : sea.wavePhase+(time-(sea.sampledAt??time))*sea.waveSpeed;
}

export function surfaceHeight(x: number, y: number, time: number, sea: Sea): number {
  const phase = wavePhaseAt(time,sea);
  let sum = 0;
  for (const w of WAVE_COMPONENTS) sum += w.amplitude * Math.sin(x*w.kx + y*w.ky + phase*w.omega);
  return sea.waveScale * sum;
}

export function surfaceMotion(boat: Hull, sea: Sea, time: number): Hull & {roll: number} {
  const hullRadius = SUB_DESIGN.hullRadius;
  const {x, y, heading} = boat;
  const response = Math.max(0, 1 - Math.max(0, boat.depth) / periscopeDepth) ** 2;
  if (!response) return {x, y, heading, depth:boat.depth, pitch:boat.pitch, roll:0};
  const angle = heading*Math.PI/180, east = Math.sin(angle), north = Math.cos(angle);
  const arm = 23, phase = wavePhaseAt(time,sea);
  let heave = 0, pitchSlope = 0, rollSlope = 0;
  for (const w of WAVE_COMPONENTS) {
    const at = x*w.kx + y*w.ky + phase*w.omega;
    const forward = w.kx*east + w.ky*north, starboard = w.kx*north - w.ky*east;
    // Steady response of a 1.25-second first-order lag to this harmonic.
    // Long swells carry the hull. Short crests mostly pass underneath it.
    const lag = 1.25*w.omega*sea.waveSpeed, scale = w.amplitude*sea.waveScale/(1+lag*lag);
    const sin = Math.sin(at), cos = Math.cos(at);
    const height = scale*(sin-lag*cos), slope = scale*(cos+lag*sin);
    heave += height*(1+Math.cos(forward*arm))/2;
    pitchSlope += slope*Math.sin(forward*arm)/arm;
    rollSlope += slope*Math.sin(starboard*hullRadius)/hullRadius;
  }
  return {
    x, y, heading,
    depth: boat.depth + response*(hullRadius/2 - heave),
    pitch: boat.pitch + response*Math.atan(pitchSlope),
    roll: response*.45*Math.atan(rollSlope)
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
