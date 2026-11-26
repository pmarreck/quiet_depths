// Degrees above the horizon. A null order leaves the automatic depth controller in charge.
import {boatPoint} from './surface-motion.ts';

export const maxNosePitch = 60;
const depthHoldPitch = (verticalSpeed: number) => -18 * Math.max(-1, Math.min(1, verticalSpeed));
export function droneCameraPitch(verticalSpeed: number, nosePitch: number | null = null) {
  const degrees = nosePitch ?? depthHoldPitch(verticalSpeed);
  return degrees * Math.PI / 180;
}

// The cable gland is mounted aft on the starboard frame. Use this mount in
// both the model and the simulation so pitching the nose keeps the cable seated.
export const cableGland = {side:.35, down:.2, forward:-1.1};
interface RovPose {
  x:number; y:number; depth:number; heading:number; verticalSpeed:number; nosePitch:number|null;
}
export function droneTetherAttachment(d:RovPose) {
  return boatPoint({...d,pitch:droneCameraPitch(d.verticalSpeed,d.nosePitch)},cableGland);
}
export function changeNosePitch(drone: {nosePitch: number | null; verticalSpeed: number; targetDepth: number; depth: number}, degrees: number, inverted = false) {
  const current = drone.nosePitch ?? depthHoldPitch(drone.verticalSpeed);
  drone.nosePitch = Math.max(-maxNosePitch, Math.min(maxNosePitch, current + (inverted ? -degrees : degrees)));
  drone.targetDepth = drone.depth;
}
