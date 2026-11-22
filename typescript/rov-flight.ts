// Degrees above the horizon. A null order leaves the automatic depth controller in charge.
export const maxNosePitch = 60;
const depthHoldPitch = (verticalSpeed: number) => -18 * Math.max(-1, Math.min(1, verticalSpeed));
export function droneCameraPitch(verticalSpeed: number, nosePitch: number | null = null) {
  const degrees = nosePitch ?? depthHoldPitch(verticalSpeed);
  return degrees * Math.PI / 180;
}
export function changeNosePitch(drone: {nosePitch: number | null; verticalSpeed: number; targetDepth: number; depth: number}, degrees: number, inverted = false) {
  const current = drone.nosePitch ?? depthHoldPitch(drone.verticalSpeed);
  drone.nosePitch = Math.max(-maxNosePitch, Math.min(maxNosePitch, current + (inverted ? -degrees : degrees)));
  drone.targetDepth = drone.depth;
}
