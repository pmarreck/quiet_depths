import {operatingFraction} from './equipment.ts';
import {clamp, rad, type World} from './sim.ts';
import {isSurfaced} from './vehicle-status.ts';
import {changeNosePitch} from './rov-flight.ts';
export {droneCameraPitch} from './rov-flight.ts';

type Context = {paused?: boolean; modal?: boolean; view?: string; invertRovPitch?: boolean};
type Chart = {zoom: number; follow: boolean; x: number; y: number};
type Point = {x: number; y: number};

export const wrapHeading = (n: number) => ((n % 360) + 360) % 360;
export const throttleDetent = (knots: number) => Math.abs(knots) <= .5 ? 0 : knots;
export const relativeBearing = (absolute: number, heading: number) => wrapHeading(absolute - heading);
export const scopeBearing = (s: {heading: number; scopeAngle: number}) => wrapHeading(s.heading + s.scopeAngle);
export const canIssue = (s: {status: string}, context: Context) => s.status === 'patrol' && !context.paused && !context.modal;
export const feedActive = (s: World, view: string | undefined) => view === 'orbit' ? s.difficulty?.orbitCamera === true
  : view === 'scope' ? s.scope && s.depth <= 15 && operatingFraction(s.systems?.periscope ?? 100) > 0
  : ['tower', 'gun'].includes(view as string) ? isSurfaced(s)
  : view === 'drone' ? ['remote', 'return'].includes(s.drone.mode) && operatingFraction(s.drone.camera ?? 100) > 0 : false;
export const opticalZoomLimit = (view: string) => view === 'tower' ? 48 : view === 'scope' ? 4 : view === 'gun' ? 5 : 1;
export const helmFor = (s: World, view: string | undefined) => view === 'drone' ? s.drone : s;

export function setHelmOrder(s: World, context: Context, axis: string, value: number): boolean {
  if (!canIssue(s, context) || !Number.isFinite(value)) return false;
  const drone = context.view === 'drone', v = helmFor(s, context.view);
  if (drone && s.drone.mode !== 'remote') return false;
  switch (axis) {
    case 'heading': v.targetHeading = wrapHeading(value); if (!drone) { s.route = null; s.scopeSteerBearing = null; } break;
    case 'depth': v.targetDepth = clamp(value, 0, 280); if (drone) s.drone.nosePitch = null; break;
    case 'speed': v.targetSpeed = clamp(value, drone ? -3 : -4, drone ? 10 : 17); if (!drone && v.targetSpeed > 3) s.silent = false; break;
    default: return false;
  }
  return true;
}

export function alignScope(s: World, context: Context, mode: string): boolean {
  if (!canIssue(s, context) || !feedActive(s, 'scope')) return false;
  if (mode === 'center') { s.scopeAngle = 0; s.scopeSteerBearing = null; return true; }
  if (mode === 'helm-to-scope') { s.scopeSteerBearing = scopeBearing(s); s.targetHeading = s.scopeSteerBearing; s.route = null; return true; }
  return false;
}

export function nudgeHelm(s: World, context: Context, degrees: number): boolean {
  return setHelmOrder(s, context, 'heading', helmFor(s, context.view).targetHeading + degrees);
}

export function applyHelmKeys(s: World, context: Context, keys: Set<string>, dt: number): void {
  if (!canIssue(s, context)) return;
  const drone = context.view === 'drone', v = helmFor(s, context.view);
  if (drone) {
    const d = s.drone;
    if (d.mode !== 'remote') return;
    if (keys.has('rovStop')) { d.targetSpeed = 0; d.targetHeading = d.heading; d.targetDepth = d.depth; return; }
    const pitch = Number(keys.has('rovPitchUp')) - Number(keys.has('rovPitchDown'));
    if (pitch) changeNosePitch(d, pitch * 30 * dt, context.invertRovPitch);
  }
  const speed = Number(keys.has(drone ? 'rovFaster' : 'KeyW')) - Number(keys.has(drone ? 'rovSlower' : 'KeyS'));
  const turn = Number(keys.has('KeyD') || drone && keys.has('rovRight')) - Number(keys.has('KeyA') || drone && keys.has('rovLeft'));
  const depth = Number(keys.has('KeyC')) - Number(keys.has('Space'));
  // Orders change at a real-time rate. Time compression accelerates the vehicle,
  // not the keyboard. The simulation alone advances actual controls.
  if (speed) setHelmOrder(s, context, 'speed', v.targetSpeed + speed * 2 * dt);
  if (turn) nudgeHelm(s, context, turn * 20 * dt);
  if (depth) setHelmOrder(s, context, 'depth', v.targetDepth + depth * 12 * dt);
}

export function steerDrone(s: World, context: Context, dx: number, dy: number): void {
  if (context.view !== 'drone' || !canIssue(s, context) || s.drone.mode !== 'remote') return;
  const d = s.drone;
  if (dx) setHelmOrder(s, context, 'heading', d.targetHeading + dx * .4);
  if (dy) changeNosePitch(d, -dy * .25, context.invertRovPitch);
}

// Look along the boat from its stern quarter, below the waterline even at periscope depth.
export const initialOrbit = (boat: {heading: number}) => ({yaw: rad(boat.heading + 146), pitch: -.08, distance: 72});
// Keep at least 56 degrees of the scene in view on both axes.
export const orbitVerticalFov = (aspect: number) => 2 * Math.atan(Math.tan(rad(28)) / Math.min(1, aspect)) / rad(1);
export const orbitDrag = (orbit: {yaw: number; pitch: number}, dx: number, dy: number) => {
  orbit.yaw = (orbit.yaw + dx * .008) % (2 * Math.PI);
  orbit.pitch = clamp(orbit.pitch + dy * .008, -1.28, 1.28);
};

// Explicit yaw/pitch/roll order preserves a world-up horizon through all azimuths.
// Never modify a single XYZ Euler component after lookAt's quaternion conversion.
export const cameraEuler = (heading: number, pitch = 0, roll = 0) => ({x: pitch, y: -rad(wrapHeading(heading)), z: roll, order: 'YXZ' as const});

export function chartTransform(chart: Chart, w: number, h: number, boat: Point) {
  const scale = Math.min(w, h) / 12500 * chart.zoom, x = chart.follow ? boat.x : chart.x, y = chart.follow ? boat.y : chart.y;
  return {cx: w * .52 - x * scale, cy: h * .51 + y * scale, scale};
}
export function chartWorldAt(chart: Chart, x: number, y: number, w: number, h: number, boat: Point) {
  const p = chartTransform(chart, w, h, boat);
  return {x: (x - p.cx) / p.scale, y: -(y - p.cy) / p.scale};
}
function detachChart(chart: Chart, boat: Point) { if (chart.follow) { chart.x = boat.x; chart.y = boat.y; chart.follow = false; } }
export function panChart(chart: Chart, dx: number, dy: number, w: number, h: number, boat: Point) {
  const p = chartTransform(chart, w, h, boat);
  detachChart(chart, boat); chart.x -= dx / p.scale; chart.y += dy / p.scale;
}
export function zoomChart(chart: Chart, factor: number, x: number, y: number, w: number, h: number, boat: Point) {
  const before = chartWorldAt(chart, x, y, w, h, boat);
  detachChart(chart, boat); chart.zoom = clamp(chart.zoom * factor, .25, 128);
  const after = chartWorldAt(chart, x, y, w, h, boat);
  chart.x += before.x - after.x; chart.y += before.y - after.y;
}
