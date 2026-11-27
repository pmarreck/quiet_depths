// Mirrored in elm/Sim/Pressure.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {expm1} from './sim-math.ts';
import {damagePart} from './equipment.ts';
import {clamp, log, rand, type LogEntry} from './mechanics.ts';
import {addDebrief, type DebriefEntry} from './debrief.ts';

type Boat = {
  outerHull: number; hull: number; depth: number; pressureAlarm: number; criticalExposure: number; flood: number;
  repairLimits: Record<'hull', number>; status: string; imploded: boolean; shock: number; rng: number;
  events: LogEntry[]; time: number; debrief?: DebriefEntry[];
};

// Gameplay limits for this fictional boat. Wear on the outer shell lasts the patrol.
export const depthLimit = (s: {outerHull: number; hull: number}) => Math.round(220 * (.15 + .35 * s.outerHull / 100 + .5 * s.hull / 100));
export const pressureLevel = (s: {depth: number; outerHull: number; hull: number}) =>
  s.depth > depthLimit(s) * 1.12 ? 2 : s.depth > depthLimit(s) ? 1 : 0;

export function updatePressure(s: Boat, dt: number): void {
  const level = pressureLevel(s);
  if (level !== s.pressureAlarm) {
    if (level === 2) log(s, 'CRITICAL DEPTH. Pressure bulkheads at risk. Rise now!', 'damage');
    else if (level === 1) log(s, 'Depth tolerance exceeded. Order a shallower depth.', 'warning');
    else log(s, 'Back within depth tolerance.');
    s.pressureAlarm = level;
  }
  s.criticalExposure = level === 2 ? s.criticalExposure + dt : 0;
  if (!level) return;
  const excess = s.depth / depthLimit(s) - 1;
  if (rand(s) < -expm1(-dt * (.012 + .075 * excess))) {
    s.flood = clamp(s.flood + .8 + rand(s) * 1.8, 0, 25);
    damagePart(s, s.repairLimits, 'hull', .4);
    log(s, 'Pressure seam leaking. Assign damage control to seal it and pump the bilge.', 'damage');
  }
  if (level === 2 && s.criticalExposure > 20 && rand(s) < -expm1(-dt * (excess - .12) * .035)) {
    damagePart(s, s.repairLimits, 'hull', 100);
    s.status = 'lost'; s.imploded = true; s.shock = 2;
    const text = 'Pressure hull imploded beyond the damaged sub’s depth tolerance.';
    log(s, text, 'damage'); addDebrief(s, text);
  }
}
