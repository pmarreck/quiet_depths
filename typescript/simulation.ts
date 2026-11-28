// The simulation the page drives. The TypeScript simulation runs it unless
// the page hands over the Elm worker's adapter with `useElmSimulation`;
// then each function here routes there instead, with the same signature and
// result, so the page's code reads the same either way.
//
// Every function is asynchronous in both modes: it resolves with its result
// once the simulation has applied it to the patrol object, and the page acts
// on the result then. The TypeScript applies each call at once, so its
// patrol changes before the call returns; the worker's changes arrive with
// its reply, in the page's own order (see elm-simulation.ts).
import * as typed from './sim.ts';
import {fireDeckGun as typedFireDeckGun, aimGunAt as typedAimGunAt} from './combat.ts';
import {orderScope as typedOrderScope} from './periscope.ts';
import {requestRecon as typedRequestRecon} from './recon.ts';
import {startRescue as typedStartRescue, dronePhotograph as typedDronePhotograph} from './operation.ts';
import {endPatrolEarly as typedEndPatrolEarly} from './early-end.ts';
import type {ElmSimulation, FrameInput} from './elm-simulation.ts';
import type {PlayRecorder} from './play-recording.ts';
import type {World} from './patrol-world.ts';

export type {FrameInput};

let elm: ElmSimulation | null = null;

// Routes the page's simulation to the Elm worker's adapter, or back to the
// TypeScript with null.
export function useElmSimulation(simulation: ElmSimulation | null): void {
  if (simulation && recorder) throw new Error('Play is recorded only with the TypeScript simulation');
  elm = simulation;
}
export const elmSimulationActive = (): boolean => elm !== null;

let recorder: PlayRecorder | null = null;

// Records every call the page makes, for the replay tests, or stops with
// null. Only the TypeScript simulation records (see play-recording.ts).
export function recordPlay(r: PlayRecorder | null): void {
  if (r && elm) throw new Error('Play is recorded only with the TypeScript simulation');
  recorder = r;
}

// Runs a TypeScript call at once, delivering its result or failure as the
// worker's would be delivered; `name`, `s` and `args` are for the recorder.
const typedCall = <T>(name: string, s: World | null, args: unknown[], job: () => T): Promise<T> => {
  try { return Promise.resolve(recorder ? recorder.call(name, s, args, job) : job()); } catch (e) { return Promise.reject(e); }
};

type Options = Parameters<typeof typed.createGame>[2];
type Point = {x: number; y: number; vx?: number; vy?: number; altitude?: number};

export const createGame = (mission = 'recon', seed = 19830604, options: Options = {}): Promise<World> =>
  elm ? elm.create(mission, seed, options as Record<string, unknown>) : typedCall('createGame', null, [mission, seed, options], () => typed.createGame(mission, seed, options));
export const restore = (raw: string): Promise<World | null> => elm ? elm.restore(raw) : typedCall('restore', null, [raw], () => typed.restore(raw));
export const step = (s: World, dt: number, input: FrameInput = {}): Promise<void> => {
  if (elm) return elm.step(s, dt, input);
  // The recorder keeps the frame's values, not the page's hooks.
  const {beforeTicks, ...frame} = input, {afterTick: _, ...recorded} = frame;
  return typedCall('step', s, [dt, recorded], () => {
    beforeTicks?.(s);
    typed.step(s, dt, frame);
  });
};
export const ping = (s: World): Promise<boolean> => elm ? elm.act(s, {kind: 'ping'}) as Promise<boolean> : typedCall('ping', s, [], () => typed.ping(s));
export const photograph = (s: World, look: number): Promise<boolean> =>
  elm ? elm.act(s, {kind: 'photograph', look}) as Promise<boolean> : typedCall('photograph', s, [look], () => typed.photograph(s, look));
export const fire = (s: World, id: string): Promise<boolean> => elm ? elm.act(s, {kind: 'fire', id}) as Promise<boolean> : typedCall('fire', s, [id], () => typed.fire(s, id));
export const decoy = (s: World): Promise<boolean> => elm ? elm.act(s, {kind: 'decoy'}) as Promise<boolean> : typedCall('decoy', s, [], () => typed.decoy(s));
export const deployDrone = (s: World): Promise<boolean> => elm ? elm.act(s, {kind: 'deployDrone'}) as Promise<boolean> : typedCall('deployDrone', s, [], () => typed.deployDrone(s));
export const recallDrone = (s: World): Promise<void> => elm ? elm.act(s, {kind: 'recallDrone'}).then(() => undefined) : typedCall('recallDrone', s, [], () => typed.recallDrone(s));
export const log = (s: World, text: string, logKind?: string): Promise<void> =>
  elm ? elm.act(s, {kind: 'log', text, logKind}).then(() => undefined) : typedCall('log', s, [text, logKind], () => typed.log(s, text, logKind));
export const fireDeckGun = (s: World, aim: {bearing: number; elevation: number}): Promise<boolean> =>
  elm ? elm.act(s, {kind: 'fireDeckGun', bearing: aim.bearing, elevation: aim.elevation}) as Promise<boolean> : typedCall('fireDeckGun', s, [aim], () => typedFireDeckGun(s, aim));
export const aimGunAt = (s: World, point: Point): Promise<void> =>
  elm ? elm.act(s, {kind: 'aimGunAt', ...point}).then(() => undefined) : typedCall('aimGunAt', s, [point], () => typedAimGunAt(s, point));
export const orderScope = (s: World, raised: boolean): Promise<void> =>
  elm ? elm.act(s, {kind: 'orderScope', raised}).then(() => undefined) : typedCall('orderScope', s, [raised], () => typedOrderScope(s, raised));
export const requestRecon = (s: World, area: {x: number; y: number; size: number}): Promise<boolean> =>
  elm ? elm.act(s, {kind: 'requestRecon', area}) as Promise<boolean> : typedCall('requestRecon', s, [area], () => typedRequestRecon(s, area));
export const startRescue = (s: World): Promise<boolean> => elm ? elm.act(s, {kind: 'startRescue'}) as Promise<boolean> : typedCall('startRescue', s, [], () => typedStartRescue(s));
export const dronePhotograph = (s: World): Promise<{ok: boolean; text: string}> =>
  elm ? elm.act(s, {kind: 'dronePhotograph'}) as Promise<{ok: boolean; text: string}> : typedCall('dronePhotograph', s, [], () => typedDronePhotograph(s));
export const endPatrolEarly = (s: World): Promise<'partial' | 'withdrawn' | null> =>
  elm ? elm.act(s, {kind: 'endPatrolEarly'}) as Promise<'partial' | 'withdrawn' | null> : typedCall('endPatrolEarly', s, [], () => typedEndPatrolEarly(s));
