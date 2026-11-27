import {scopeExtension} from './periscope.ts';
import {replayEvent} from './replay-events.ts';
import {carrierSize, incidentalHull} from './carrier.ts';
import {damagePart} from './equipment.ts';
import {recordCivilianHit} from './patrol-reports.ts';
import {bottom, clamp, distance, rad, log, type LogEntry} from './mechanics.ts';
import {boatPoint} from './vehicle-status.ts';
import type {DebriefEntry} from './debrief.ts';

type Point = {x: number; y: number; depth: number};
type Offset = {side?: number; forward?: number; down?: number};
// Traffic may omit depth, pitch or roll; boatPoint treats missing attitude as level.
interface Body {
  x: number; y: number; depth?: number; heading: number; pitch?: number; roll?: number; speed: number; verticalSpeed?: number;
  kind?: string; id?: string; name?: string; hull?: number; military?: boolean; fixedWreck?: boolean;
}
type Ship = Body & {id: string; name: string; hull: number; sunkAt?: number; sinkDepth: number; groundedAt?: number; neutralHitAt?: number};
interface Patrol extends Body {
  depth: number; time: number; site?: Body | null; ships: Ship[]; environment: {chartSeed: number}; collisionHits: Record<string, number>;
  systems: Record<string, number>; repairLimits: Record<string, number>; scope: boolean; scopeTravel?: number; events: LogEntry[]; debrief?: DebriefEntry[];
}
type Hurt = (s: Patrol, severity: number, text: string, part: string) => void;
type Part = {a: Point; b: Point; r: number};
type Contact = {point: Point; nx: number; ny: number; nd: number; overlap: number; lateralGap: number};

const pointOn = (body: Body, offset: Offset) => boatPoint(body as Body & {depth: number; pitch: number}, offset);

// Rounded hulls and a separate sail. Endpoints use the same forward, starboard
// and down coordinates as the visible boat.
function hullParts(body: Body): Part[] {
  const sub = body.kind === 'sub' || body.kind === 'wreck' || !body.kind;
  const size = body.kind === 'fishing' || body.kind === 'surface' ? .38 : body.kind === 'escort' ? .78 : 1;
  const pose = {...body, depth: body.depth ?? 3};
  const part = (a: Offset, b: Offset, r: number) => ({a: pointOn(pose, a), b: pointOn(pose, b), r});
  if (body.kind === 'carrier') { const end = carrierSize.halfLength - carrierSize.halfBeam; return [part({forward: -end}, {forward: end}, carrierSize.halfBeam)]; }
  if (sub) return [part({forward: -27.5}, {forward: 27.5}, 5), part({forward: 5, down: -4}, {forward: 5, down: -11}, 2.1)];
  return [part({forward: -52 * size}, {forward: 52 * size}, 12 * size)];
}
const vector = (a: Point, b: Point) => [a.x - b.x, a.y - b.y, a.depth - b.depth];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function closestContact(a: Part, b: Part, heading: number): Contact | null {
  const u = vector(a.b, a.a), v = vector(b.b, b.a), w = vector(a.a, b.a);
  const uu = dot(u, u), vv = dot(v, v), uv = dot(u, v), uw = dot(u, w), vw = dot(v, w);
  const det = uu * vv - uv * uv;
  let t = det > 1e-8 ? clamp((uv * vw - vv * uw) / det, 0, 1) : 0;
  const k = clamp((uv * t + vw) / vv, 0, 1);
  t = clamp((uv * k - uw) / uu, 0, 1);
  const dx = w[0] + t * u[0] - k * v[0], dy = w[1] + t * u[1] - k * v[1], dz = w[2] + t * u[2] - k * v[2];
  const d = Math.hypot(dx, dy, dz), overlap = a.r + b.r - d;
  if (overlap <= 0) return null;
  const lateralGap = Math.sqrt(Math.max(0, (a.r + b.r) ** 2 - dz * dz)) - Math.hypot(dx, dy);
  const point = {x: a.a.x + t * u[0] - (d ? dx / d : 0) * a.r, y: a.a.y + t * u[1] - (d ? dy / d : 0) * a.r, depth: a.a.depth + t * u[2] - (d ? dz / d : 0) * a.r};
  return d > .0001 ? {point, nx: dx / d, ny: dy / d, nd: dz / d, overlap, lateralGap}
    : {point, nx: Math.cos(rad(heading)), ny: -Math.sin(rad(heading)), nd: 0, overlap, lateralGap};
}

export function hullContact(a: Body, b: Body): Contact | null {
  if (distance(a, b) > (a.kind === 'carrier' || b.kind === 'carrier' ? 225 : 145) || Math.abs((a.depth ?? 3) - (b.depth ?? 3)) > 32) return null;
  let deepest: Contact | null = null;
  const other = hullParts(b);
  for (const part of hullParts(a)) for (const second of other) {
    const hit = closestContact(part, second, a.heading);
    if (hit && (!deepest || hit.overlap > deepest.overlap)) deepest = hit;
  }
  return deepest;
}

function weight(body: Body, site?: Body | null) {
  if (body.fixedWreck || body === site && body.kind !== 'surface') return 0;
  if (body.kind === 'carrier') return .15;
  if (body.kind === 'merchant') return .28;
  if (body.kind === 'escort') return .55;
  return body.kind === 'fishing' || body.kind === 'surface' ? 1.6 : 1;
}
function displace(body: Body, amount: number, n: {nx: number; ny: number}, vertical: number) {
  body.x += amount * n.nx; body.y += amount * n.ny;
  if (vertical) body.depth = (body.depth as number) + vertical;
}

function resolvePair(s: Patrol, a: Body, b: Body, hurt: Hurt) {
  const hit = hullContact(a, b);
  if (!hit) return;
  const wa = weight(a, s.site), wb = weight(b, s.site), sum = wa + wb;
  // Surface traffic and grounded wrecks cannot be pushed down. Give the
  // remaining displacement to the submerged hull, or separate horizontally.
  const va = (!a.kind || a.kind === 'sub') && a !== s.site ? wa : 0;
  const vb = (!b.kind || b.kind === 'sub') && b !== s.site ? wb : 0;
  let move = hit.overlap + .015;
  let da = va ? move * hit.nd * va / (va + vb) : 0, db = vb ? -move * hit.nd * vb / (va + vb) : 0;
  const blocked = (body: Body, d: number) => {
    const depth = body.depth as number;
    return d < 0 && depth + d < 0 || d > 0 && depth + d > keelLimit(body, s.environment.chartSeed);
  };
  if (!(va + vb) || blocked(a, da) || blocked(b, db)) {
    const angle = rad(a.heading), len = Math.hypot(hit.nx, hit.ny);
    hit.nx = len > .001 ? hit.nx / len : Math.cos(angle); hit.ny = len > .001 ? hit.ny / len : -Math.sin(angle);
    move = hit.lateralGap + .015; da = 0; db = 0;
  }
  const closing = Math.hypot(Math.sin(rad(a.heading)) * a.speed - Math.sin(rad(b.heading)) * b.speed,
    Math.cos(rad(a.heading)) * a.speed - Math.cos(rad(b.heading)) * b.speed, (a.verticalSpeed || 0) - (b.verticalSpeed || 0));
  displace(a, move * wa / sum, hit, da); displace(b, -move * wb / sum, hit, db);
  const key = [a === s ? 'boat' : a.id ?? 'site', b === s ? 'boat' : b.id ?? 'site'].sort().join('/');
  if (s.time - (s.collisionHits[key] ?? -99) < 4) return;
  s.collisionHits[key] = s.time;
  const severity = clamp(2 + closing * 1.1, 2, 36);
  for (const body of [a, b]) {
    if (body === s) {
      const other = a === s ? b : a;
      replayEvent(s, {kind: 'collision', target: other.id, point: hit.point});
      hurt(s, severity, b === s.site ? 'Hull contact with the casualty.' : 'Hull collision with another vessel.', 'planes');
    } else {
      const before = body.hull ?? 100;
      body.hull = incidentalHull(body, severity);
      if (a === s && body.military === false && before > 0 && body.hull === 0)
        recordCivilianHit(s, body as Body & {id: string; name: string}, 'Your sub collided with the neutral ' + body.name + ' and sank her.');
    }
    if (body !== s.site) { body.speed *= .45; if (body.verticalSpeed) body.verticalSpeed *= .4; }
  }
}

export function keelLimit(body: Body, seed: number): number {
  const sub = !body.kind || body.kind === 'sub', scale = body.kind === 'fishing' ? .38 : body.kind === 'escort' ? .78 : 1;
  const half = body.kind === 'carrier' ? carrierSize.halfLength : sub ? 27.5 : 52 * scale, draft = sub ? 5 : 5 * scale;
  let floor = Infinity;
  for (const forward of [-half, 0, half]) {
    const pose = pointOn(body, {forward});
    floor = Math.min(floor, bottom(pose.x, pose.y, seed) - draft + forward * Math.sin(body.pitch || 0));
  }
  return floor;
}

export function resolveTraffic(s: Patrol, hurt: Hurt): void {
  const ships = s.ships.filter(v => v.hull > 0);
  for (const wreck of s.ships) {
    if (wreck.hull > 0 || wreck.sunkAt === undefined || distance(s, wreck) > (wreck.kind === 'carrier' ? 225 : 145)) continue;
    resolvePair(s, s, {...wreck, depth: (wreck.kind === 'sub' ? wreck.depth as number : 0) + wreck.sinkDepth, fixedWreck: true}, hurt);
  }
  if (s.site) resolvePair(s, s, s.site, hurt);
  for (let i = 0; i < ships.length; i++) {
    const ship = ships[i];
    if (ship.kind !== 'sub' && scopeExtension(s) > 0 && s.depth <= 15 && distance(s, ship) < 48 && s.systems.periscope > 0) {
      damagePart(s.systems, s.repairLimits, 'periscope', 100); s.scope = false; delete s.scopeTravel;
      log(s, 'Periscope sheared away under a vessel.', 'damage');
    }
    resolvePair(s, s, ship, hurt);
    if (s.site) resolvePair(s, ship, s.site, hurt);
    for (let j = 0; j < i; j++) resolvePair(s, ship, ships[j], hurt);
    const floor = keelLimit(ship, s.environment.chartSeed);
    if ((ship.depth ?? 0) > floor) {
      if (ship.kind === 'sub') ship.depth = Math.max(0, floor);
      if (floor < 0) pushOffShoal(ship, -floor, s.environment.chartSeed);
      if (s.time - (ship.groundedAt ?? -99) > 5) { ship.hull = incidentalHull(ship, 2 + Math.abs(ship.speed) * .7); ship.groundedAt = s.time; }
      ship.speed *= .35;
    }
  }
}

export function pushOffShoal(body: {x: number; y: number}, overlap: number, seed: number): void {
  const dx = (bottom(body.x + 1, body.y, seed) - bottom(body.x - 1, body.y, seed)) / 2;
  const dy = (bottom(body.x, body.y + 1, seed) - bottom(body.x, body.y - 1, seed)) / 2;
  const slope = dx * dx + dy * dy;
  if (slope < 1e-8) return;
  const scale = Math.min((overlap + .01) / slope, 30 / Math.sqrt(slope));
  body.x += dx * scale; body.y += dy * scale;
}
