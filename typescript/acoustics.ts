// Mirrored in elm/Sim/Acoustics.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {exp} from './sim-math.ts';
// Constant-speed, flat-interface approximation. Typical speeds: NOAA,
// https://oceanservice.noaa.gov/facts/sound.html . Not a full ocean acoustic model.
export const AIR_SOUND_SPEED = 340;
export const WATER_SOUND_SPEED = 1500;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

type Listener = {x: number; y: number; depth?: number; heading?: number};
type Source = {x: number; y: number; depth?: number; type?: string; altitude?: number; power?: number};
type Perceived = {distance: number; delay: number; pan: number; gain: number; cutoff: number};
export interface Sound extends Source {
  id: number; time: number; power: number; heard: boolean; heardAt?: number; perceived?: Perceived; own?: boolean; [key: string]: unknown;
}
type Patrol = Listener & {time: number; soundSequence: number; acoustics: Sound[]};

export function airWaterPath(horizontal: number, airHeight: number, waterDepth: number): number {
  const r = Math.abs(horizontal), h = Math.max(0, airHeight), d = Math.max(0, waterDepth);
  if (d === 0) return Math.hypot(r, h) / AIR_SOUND_SPEED;
  if (h === 0) return Math.hypot(r, d) / WATER_SOUND_SPEED;
  // Fermat's principle: minimum travel time over the flat air/water interface.
  let lo = 0, hi = r;
  for (let i = 0; i < 48; i++) {
    const x = (lo + hi) / 2;
    const derivative = x / (AIR_SOUND_SPEED * Math.hypot(x, h)) - (r - x) / (WATER_SOUND_SPEED * Math.hypot(r - x, d));
    if (derivative > 0) hi = x; else lo = x;
  }
  const x = (lo + hi) / 2;
  return Math.hypot(x, h) / AIR_SOUND_SPEED + Math.hypot(r - x, d) / WATER_SOUND_SPEED;
}

export function propagationTime(source: Source, listener: Listener): number {
  const horizontal = Math.hypot(source.x - listener.x, source.y - listener.y), depth = Math.max(0, listener.depth || 0);
  if (source.type === 'thunder' || source.type === 'gunfire')
    return depth <= 1 ? Math.hypot(horizontal, Math.max(0, (source.altitude || 0) - 3)) / AIR_SOUND_SPEED : airWaterPath(horizontal, source.altitude || 0, depth);
  return Math.hypot(horizontal, (source.depth || 0) - depth) / WATER_SOUND_SPEED;
}

export function spatialPan(source: {x: number; y: number}, listener: Listener): number {
  const absolute = Math.atan2(source.x - listener.x, source.y - listener.y), relative = absolute - (listener.heading || 0) * Math.PI / 180;
  return Math.sin(relative);
}

// How loud a source is: its power, never below silence; a missing or non-finite
// power counts as 1.
const loudness = (power: number | undefined): number => Number.isFinite(power) ? Math.max(0, power as number) : 1;

export function perceivedSound(source: Source, listener: Listener): Perceived {
  const depth = Math.max(0, listener.depth || 0), horizontal = Math.hypot(source.x - listener.x, source.y - listener.y);
  const distance = Math.hypot(horizontal, (source.depth || 0) - depth), under = depth > 1;
  if (source.type === 'thunder' || source.type === 'gunfire') return {distance, delay: propagationTime(source, listener), pan: spatialPan(source, listener),
    gain: loudness(source.power) / (1 + (Math.hypot(horizontal, source.altitude || 0) / 3400) ** 1.2) * (under ? .55 * exp(-depth / 170) : 1),
    cutoff: under ? Math.max(85, 950 / (1 + depth / 28)) : 3200};
  return {distance, delay: propagationTime(source, listener), pan: spatialPan(source, listener),
    gain: clamp(loudness(source.power) / (1 + (distance / 220) ** 1.25), 0, 1), cutoff: Math.max(130, 4200 / (1 + distance / 1200))};
}

export function engineSound(ship: {x: number; y: number; depth?: number; speed?: number; kind: string; hull: number}, listener: Listener) {
  const distance = Math.hypot(ship.x - listener.x, ship.y - listener.y, (ship.depth || 0) - (listener.depth || 0)), speed = Math.abs(ship.speed || 0);
  const base = ship.kind === 'merchant' ? .28 : ship.kind === 'escort' ? .34 : ship.kind === 'fishing' ? .19 : .12;
  const under = (listener.depth || 0) > 1, scale = under ? 480 : 220, limit = under ? 10000 : 4500;
  const gain = ship.hull <= 0 || distance > limit ? 0 : base * (.2 + speed / 9) / (1 + (distance / scale) ** (under ? 1.25 : 1.6));
  return {distance, gain: Math.min(.36, gain), pan: spatialPan(ship, listener), cutoff: Math.max(110, 1800 / (1 + distance / 1000 + (listener.depth || 0) / 180)),
    frequency: (ship.kind === 'escort' ? 47 : ship.kind === 'fishing' ? 68 : ship.kind === 'sub' ? 25 : 34) + speed * 2.2, bladeRate: 1.4 + speed * .28};
}

export function aircraftSound(plane: {x: number; y: number; altitude?: number; speed?: number; hull: number}, listener: Listener) {
  const depth = Math.max(0, listener.depth || 0), under = depth > 1, distance = Math.hypot(plane.x - listener.x, plane.y - listener.y, (plane.altitude || 0) + depth);
  return {distance, gain: plane.hull <= 0 || distance > 6000 ? 0 : .28 / (1 + (distance / 500) ** 1.5) * (under ? .35 * exp(-depth / 90) : 1),
    pan: spatialPan(plane, listener), cutoff: under ? Math.max(90, 700 / (1 + depth / 25)) : 2200, frequency: 68 + (plane.speed || 0) * .35, bladeRate: 12};
}

export function emitSound(s: Patrol, data: Source & Record<string, unknown>): Sound {
  const source: Sound = {id: s.soundSequence++, time: s.time, power: 1, heard: false, ...data};
  s.acoustics.push(source);
  return source;
}

export function launchNoise(s: Patrol, launcher: {x: number; y: number; depth?: number}, own = false): void {
  emitSound(s, {type: 'launch', x: launcher.x, y: launcher.y, depth: launcher.depth ?? 0, power: .75, own});
}

export function updateAcoustics(s: Patrol, onBlast?: (source: Sound, distance: number) => void, onReceipt?: (source: Sound) => void): void {
  for (const source of s.acoustics) {
    if (source.heard || s.time - source.time < propagationTime(source, s)) continue;
    source.heard = true; source.heardAt = s.time;
    const perceived = source.perceived = perceivedSound(source, s);
    if (perceived.gain >= .002) onReceipt?.(source);
    if (source.type === 'blast') onBlast?.(source, perceived.distance);
  }
  // Retain enough history to resume without replaying old sounds; bound storage.
  s.acoustics = s.acoustics.filter(e => s.time - e.time < 120).slice(-96);
}
