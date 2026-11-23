import type {HullClass} from './surface-hull.ts';

type SurfaceShip = Exclude<HullClass, 'launch'>;
type Vessel = {kind: SurfaceShip | 'sub'; hull: number; sinkDepth?: number;
  sunkAt?: number; settled?: boolean; collapsed?: boolean; wreckMark?: {observed?: boolean}};

// Final list and trim while passing beneath the surface. The bow is local -Z.
const profiles = {
  merchant: {scale: 1, list: .74, trim: -.39, lastVisible: 39.86},
  escort:   {scale: .78, list: -.79, trim: .36, lastVisible: 25.76},
  fishing:  {scale: .38, list: -.82, trim: -.44, lastVisible: 13.36},
  carrier:  {scale: 1.55, list: .57, trim: -.32, lastVisible: 53.36}
} satisfies Record<SurfaceShip, {scale:number; list:number; trim:number; lastVisible:number}>;

function ease(from: number, to: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function founderingPose(kind: SurfaceShip, drop: number) {
  const p = profiles[kind], immersion = drop / p.scale;
  const list = .28 * ease(0, 2, immersion) + .72 * ease(2, 16, immersion);
  // Descent begins on a nearly level keel. Deep underwater the hull rolls
  // farther onto its side and levels out along its length.
  const deep = ease(p.lastVisible + 3, p.lastVisible + 40 * p.scale, drop);
  return {
    roll: p.list * list * (1 + deep * .55),
    pitch: p.trim * ease(2, 16, immersion) * (1 - .94 * deep),
    wave: 1 - ease(0, 14, immersion)
  };
}

export const submergedDepth = (kind: SurfaceShip) => profiles[kind].lastVisible;
export const descentSpeed = (age: number) => .12 + 1.18 * ease(0, 26, age);
export const surfaceCollapseAge = 80;

export function wreckVisible(v: Vessel, now: number) {
  if (v.hull > 0) return false;
  // Preexisting charted casualties and older saves without a sinking clock.
  if (v.settled && (v.sunkAt === undefined || (v.sunkAt === 0 && v.wreckMark?.observed))) return true;
  if (v.kind === 'sub') return !!(v.collapsed || v.settled);
  return !!(v.collapsed || v.settled) && now - (v.sunkAt ?? now) >= surfaceCollapseAge
    && (v.sinkDepth ?? 0) > submergedDepth(v.kind);
}
