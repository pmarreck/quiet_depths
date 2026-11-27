import {clamp, rad} from './mechanics.ts';
import {carrierSize} from './carrier.ts';
import type {Aloft, Point} from './combat-types.ts';

export const wrap = (n: number) => (n % 360 + 360) % 360;

type Hull = Point & {heading: number; kind?: string; sinkDepth?: number; depth?: number};
// Fraction along a segment where it enters a ship's box, in the ship's own frame.
export function shipHit(from: Aloft, to: Aloft, ship: Hull, kind = ship.kind): number | null {
  const a = rad(ship.heading), sn = Math.sin(a), cs = Math.cos(a), scale = kind === 'fishing' ? .38 : kind === 'escort' ? .78 : kind === 'sub' ? .5 : 1;
  const local = (p: Aloft) => [(p.x - ship.x) * cs - (p.y - ship.y) * sn, (p.x - ship.x) * sn + (p.y - ship.y) * cs, p.altitude + (ship.sinkDepth || 0) + (kind === 'sub' ? ship.depth ?? 65 : 0)];
  const p = local(from), q = local(to);
  const bounds = kind === 'carrier' ? [[-carrierSize.halfBeam, carrierSize.halfBeam], [-carrierSize.halfLength, carrierSize.halfLength], [-7, carrierSize.deckHeight]]
    : [[-14 * scale, 14 * scale], [-65 * scale, 65 * scale], [-7, kind === 'sub' ? 7 : 23 * scale]];
  let enter = 0, leave = 1;
  for (let i = 0; i < 3; i++) {
    const v = q[i] - p[i];
    if (Math.abs(v) < 1e-10) { if (p[i] < bounds[i][0] || p[i] > bounds[i][1]) return null; continue; }
    let lo = (bounds[i][0] - p[i]) / v, hi = (bounds[i][1] - p[i]) / v;
    if (lo > hi) [lo, hi] = [hi, lo];
    enter = Math.max(enter, lo); leave = Math.min(leave, hi);
    if (enter > leave) return null;
  }
  return enter >= 0 && enter <= 1 ? enter : null;
}

export function sphereHit(from: Aloft, to: Aloft, body: Aloft, radius: number): number | null {
  const x = to.x - from.x, y = to.y - from.y, z = to.altitude - from.altitude, q = x * x + y * y + z * z;
  const t = q ? clamp(((body.x - from.x) * x + (body.y - from.y) * y + (body.altitude - from.altitude) * z) / q, 0, 1) : 0;
  return Math.hypot(from.x + t * x - body.x, from.y + t * y - body.y, from.altitude + t * z - body.altitude) < radius ? t : null;
}
