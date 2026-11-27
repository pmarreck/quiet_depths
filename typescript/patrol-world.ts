// Ship, with restore's checks on a saved ship, is mirrored in elm/Sim/Ship.elm until the simulation moves to Elm: change both.
// The whole patrol, derived from the slice each typed module declares for the
// functions the simulation hands it. A slice that drifts out of agreement with
// another stops compiling here instead of failing during play.
import type {randomizePatrol, objectiveComplete, validMissionTargets, updateFleetBattle} from './missions.ts';
import type {longPatrol, validSearch} from './patrol-search.ts';
import type {updateBoat, updateDrone, hurt} from './systems.ts';
import type {recordWake} from './surface-wake.ts';
import type {updateHostileTrack, reportHunterState, pursueAndAttack} from './hostile-tracks.ts';
import type {isOpponent} from './fleet-action.ts';
import type {incidentalHull} from './carrier.ts';
import type {advanceTraffic, playerSignal, canAttackPlayer, validTraffic} from './cold-watch.ts';
import type {imagerClue, leaveClue, activeClue, searchClue} from './suspicion.ts';
import type {updateConvoyRaid, updateLamp, updateAlliedWatch, resolveConvoyCharge, convoyLosses, validAlliedWatch} from './convoy-watch.ts';
import type {resolveTraffic} from './hull-contacts.ts';
import type {updateRecon} from './recon.ts';
import type {applyReconPacket} from './track-estimates.ts';
import type {updateCombat, launchTorpedo, restoreTorpedo, restoreIncomingRun} from './combat.ts';
import type {updateAcoustics} from './acoustics.ts';
import type {trackingConvoy} from './convoy-tracking.ts';
import type {observeTorpedo} from './torpedo-watch.ts';
import type {activeVolleys} from './fleet-action.ts';
import type {photoArchive} from './photos.ts';
import type {scopeWashed} from './environment.ts';
import type {hearWreck} from './patrol-reports.ts';
import type {Transmitters} from './sonar-transmitters.ts';
import type {WatchWarnings} from './watch-warnings.ts';
import type {fleetTheater} from './fleet-action.ts';

type Slice<F extends (...args: never[]) => unknown> = NonNullable<Parameters<F>[0]>;
type Strike = {id: number; time: number; x: number; y: number; height: number; seed: number; altitude?: number};
// Fields the simulation keeps for itself rather than handing to a module.
interface SimFields {
  version: number; phase: string; pingAge: number; pingCooldown: number; photoCooldown: number; decoys: number; alert: number;
  scopeAngle: number; scopeSteerBearing: number | null; towerAngle: number; towerPitch: number; lightning: Strike[]; nextLightningAt: number; nextId: number;
  imagers: Transmitters; soundBearings: {x: number; y: number; bearing: number; time: number; kind: string}[]; watchWarnings?: WatchWarnings;
  imagingTime?: number; shock: number; reconArchivedSequence: number; photoSequence: number; battle?: ReturnType<typeof fleetTheater>['battle'];
  newYearWatch?: number; captain?: string; patrolId?: string; route: ({x: number; y: number; radius?: number}) | null;
  noisemaker?: {x: number; y: number; depth: number; heading: number; speed: number; time: number};
}
type Slices = [
  Slice<typeof randomizePatrol>, Slice<typeof objectiveComplete>, Slice<typeof validMissionTargets>, Slice<typeof updateFleetBattle>,
  Slice<typeof longPatrol>, Slice<typeof validSearch>, Slice<typeof updateBoat>, Slice<typeof updateDrone>,
  Slice<typeof hurt>, Slice<typeof recordWake>, Slice<typeof updateHostileTrack>, Slice<typeof reportHunterState>,
  Slice<typeof pursueAndAttack>, Slice<typeof advanceTraffic>, Slice<typeof playerSignal>, Slice<typeof canAttackPlayer>,
  Slice<typeof validTraffic>, Slice<typeof imagerClue>, Slice<typeof leaveClue>, Slice<typeof activeClue>,
  Slice<typeof searchClue>, Slice<typeof updateConvoyRaid>, Slice<typeof updateLamp>, Slice<typeof updateAlliedWatch>,
  Slice<typeof resolveConvoyCharge>, Slice<typeof convoyLosses>, Slice<typeof validAlliedWatch>, Slice<typeof resolveTraffic>,
  Slice<typeof updateRecon>, Slice<typeof applyReconPacket>, Slice<typeof updateCombat>, Slice<typeof launchTorpedo>,
  Slice<typeof restoreTorpedo>, Slice<typeof restoreIncomingRun>, Slice<typeof updateAcoustics>, Slice<typeof trackingConvoy>,
  Slice<typeof observeTorpedo>, Slice<typeof activeVolleys>, Slice<typeof photoArchive>, Slice<typeof scopeWashed>,
  Slice<typeof hearWreck>,
];
type Vessel<F extends (...args: never[]) => unknown> = NonNullable<Parameters<F>[1]>;
// Functions the simulation hands a single vessel, by the vessel parameter they declare.
type VesselSlices = [
  Vessel<typeof updateHostileTrack>, Vessel<typeof reportHunterState>, Vessel<typeof pursueAndAttack>, Vessel<typeof playerSignal>,
  Vessel<typeof canAttackPlayer>, Vessel<typeof imagerClue>, Vessel<typeof leaveClue>, Vessel<typeof activeClue>, Vessel<typeof searchClue>,
  Parameters<typeof isOpponent>[0], Parameters<typeof incidentalHull>[0],
];
type Intersect<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type ShipOf<T> = T extends {ships: readonly (infer E)[]} ? E : never;
// One vessel carries every field any module reads or writes on it.
export type Ship = Intersect<ShipOf<Slices[number]> | VesselSlices[number]>;
export type World = SimFields & Omit<Intersect<Slices[number]>, 'ships'> & {ships: Ship[]};

// Compile-time check: two slices may not claim one field with incompatible types.
type NeverKeys<T> = {[K in keyof T]-?: [T[K]] extends [never] ? K : never}[keyof T];
type Assert<T extends true> = T;
export type WorldAgrees = Assert<[NeverKeys<World>] extends [never] ? true : false>;
export type ShipsAgree = Assert<[NeverKeys<Ship>] extends [never] ? true : false>;
