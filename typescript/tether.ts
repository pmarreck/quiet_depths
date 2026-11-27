import {tetherAttachment, droneTetherAttachment, droneStatus} from './vehicle-status.ts';
import {boatSurfacePose, environmentAt, type EnvironmentConfig} from './environment.ts';

type Point = {x: number; y: number; depth: number};
type Pose = Point & {heading: number; pitch: number; roll?: number};
type Drone = Point & {mode: string; mobility?: number; heading: number; verticalSpeed: number; nosePitch: number | null};
type Patrol = Pose & {time: number; speed: number; drone: Drone; environment?: EnvironmentConfig; wavePhase?: number};

// The reel pays out only what is needed. Bounded droop and current-driven
// flutter prevent a near-camera segment resembling a hanging vertical rope.
export function tetherPoints(s: Patrol, time = s.time, count = 48, pose?: Pose): Point[] {
  if (!droneStatus(s).deployed) return [];
  const e = environmentAt(s), a = tetherAttachment(pose ?? boatSurfacePose(s, e, time)), b = droneTetherAttachment(s.drone);
  const length = Math.hypot(b.x - a.x, b.y - a.y, b.depth - a.depth), sag = Math.min(2.1, .35 + length * .025);
  const wave = Math.exp(-Math.max(0, (a.depth + b.depth) / 2) / 25) * e.waveScale * .35;
  return Array.from({length: count}, (_, i) => {
    const f = i / (count - 1), bow = 4 * f * (1 - f), flutter = (.18 + wave) * Math.sin(time * .8 - f * 6.5), cross = (.12 + wave * .7) * Math.cos(time * .57 + f * 5.2);
    return {x: a.x + (b.x - a.x) * f + bow * flutter, y: a.y + (b.y - a.y) * f + bow * cross,
      depth: a.depth + (b.depth - a.depth) * f + bow * (sag + wave * .3 * Math.sin(time * .6 - f * 4))};
  });
}
