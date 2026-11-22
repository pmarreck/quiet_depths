import {hash01} from './surface-motion.ts';

type Point = {x: number; y: number};
interface Fix extends Point {
  time: number;
  vx: number;
  vy: number;
  positionSigma: number;
  velocitySigma: number;
  maneuverSigma: number;
}
interface Contact extends Point {
  range: number;
  bearing: number;
  confidence: number;
  age: number;
  fix?: Fix;
}

// Repeated looks at the same vessel share the patrol's estimation error.
export function observationBias(seed: number, id: string, method: 'visual' | 'passive'): number {
  let key = method === 'visual' ? 1 : 2;
  for (let i = 0; i < id.length; i++) key = Math.imul(key, 31) + id.charCodeAt(i);
  return 2 * hash01(seed, key) - 1;
}

function usableFix(fix?: Fix): fix is Fix {
  return !!fix && Number.isFinite(fix.x) && Number.isFinite(fix.y) && Number.isFinite(fix.time)
    && Number.isFinite(fix.vx) && Number.isFinite(fix.vy) && Number.isFinite(fix.positionSigma)
    && Number.isFinite(fix.velocitySigma) && Number.isFinite(fix.maneuverSigma);
}

function projectedPosition(fix: Fix, age: number): Point {
  return {x: fix.x + fix.vx * age, y: fix.y + fix.vy * age};
}

export function estimateAt(contact: Contact | null, time: number) {
  if (!contact || !Number.isFinite(time)) return null;
  const fix = contact.fix;
  if (!usableFix(fix)) {
    if (!Number.isFinite(contact.x) || !Number.isFinite(contact.y)) return null;
    const confidence = Math.min(1, Math.max(0, contact.confidence || 0));
    const major = contact.range ? (1 - confidence) * 1500 + 100 : 6500;
    return {x: contact.x, y: contact.y, major, minor: major * .65, angle: contact.bearing || 0,
      age: Math.max(0, contact.age || 0), hasFix: false};
  }
  const age = Math.max(0, time - fix.time);
  const speed = Math.hypot(fix.vx, fix.vy);
  const maneuver = .5 * fix.maneuverSigma * age * age;
  // 95% uncertainty ellipse, using the game's observation and drift settings.
  const major = 2.448 * Math.hypot(fix.positionSigma, fix.velocitySigma * age, maneuver);
  const minor = 2.448 * Math.hypot(fix.positionSigma, fix.velocitySigma * age * (speed > .1 ? .6 : 1), maneuver);
  const angle = speed > .01 ? (Math.atan2(fix.vx, fix.vy) * 180 / Math.PI + 360) % 360 : contact.bearing || 0;
  return {...projectedPosition(fix, age), major, minor, angle, age, hasFix: true};
}

export function sonarReading(observer: Point & {time: number}, contact: Contact): {bearing: number; range: number | null} {
  const fix = contact.fix;
  // Old saves may have a measured point without a timestamped fix.
  const point = usableFix(fix) ? projectedPosition(fix, Math.max(0, observer.time - fix.time)) : contact.range ? contact : null;
  if (!point) return {bearing: contact.bearing, range: null};
  const dx = point.x - observer.x, dy = point.y - observer.y;
  const range = Math.hypot(dx, dy);
  return {bearing: range === 0 ? contact.bearing : (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360, range};
}
