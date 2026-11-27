import {operatingFraction} from './equipment.ts';
import {boatPoint} from './surface-motion.ts';
import {clamp, separation} from './mechanics.ts';
export {boatPoint, boatLocal} from './surface-motion.ts';
export {droneTetherAttachment} from './rov-flight.ts';

type Hull = {x: number; y: number; depth: number; heading: number; pitch: number; roll?: number};
type Drone = {x: number; y: number; depth: number; mode: string; mobility?: number};

export const SURFACE_DEPTH = 1;
export const isSurfaced = (s: {depth: number}) => Number.isFinite(s.depth) && s.depth <= SURFACE_DEPTH;
export const droneReturnSpeed = (d: {mobility?: number}) => 10 * operatingFraction(d.mobility ?? 100);

export const tetherAttachment = (s: Hull) => boatPoint(s, {side: 4.65, down: 2});
export function recoveryDock(s: Hull) {
  const p = boatPoint(s, {side: 6.8, down: 2.5});
  p.depth = clamp(p.depth, 2.5, 280);
  return p;
}

export function droneStatus(s: Hull & {speed: number; drone: Drone}) {
  const d = s.drone, deployed = ['remote', 'return'].includes(d.mode), distance = separation(s, d), returnSpeed = droneReturnSpeed(d);
  const outrunning = deployed && Math.abs(s.speed) >= returnSpeed, canRecover = deployed && Math.abs(s.speed) <= 3;
  const warning = !deployed ? '' : returnSpeed === 0 ? 'ROV PROPULSION OFFLINE · bring the sub alongside for pickup'
    : outrunning ? `DRONE CANNOT CATCH SUB · ${distance.toFixed(0)} m · slow below ${returnSpeed.toFixed(1)} kn`
    : !canRecover ? `DRONE DEPLOYED · ${distance.toFixed(0)} m · slow to 3 kn for pickup`
    : distance >= 70 ? `DRONE LINK ${distance.toFixed(0)} / 100 m · recall now` : '';
  return {deployed, distance, returnSpeed, outrunning, canRecover, warning};
}
