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
import type {World} from './patrol-world.ts';

export type {FrameInput};

let elm: ElmSimulation | null = null;

// Routes the page's simulation to the Elm worker's adapter, or back to the
// TypeScript with null.
export function useElmSimulation(simulation: ElmSimulation | null): void { elm = simulation; }
export const elmSimulationActive = (): boolean => elm !== null;

// Runs a TypeScript call at once, delivering its result or failure as the
// worker's would be delivered.
const typedCall = <T>(job: () => T): Promise<T> => {
  try { return Promise.resolve(job()); } catch (e) { return Promise.reject(e); }
};

type Options = Parameters<typeof typed.createGame>[2];
type Point = {x: number; y: number; vx?: number; vy?: number; altitude?: number};

export const createGame = (mission = 'recon', seed = 19830604, options: Options = {}): Promise<World> =>
  elm ? elm.create(mission, seed, options as Record<string, unknown>) : typedCall(() => typed.createGame(mission, seed, options));
export const restore = (raw: string): Promise<World | null> => elm ? elm.restore(raw) : typedCall(() => typed.restore(raw));
export const step = (s: World, dt: number, input: FrameInput = {}): Promise<void> => elm ? elm.step(s, dt, input) : typedCall(() => {
  const {beforeTicks, ...frame} = input;
  beforeTicks?.(s);
  typed.step(s, dt, frame);
});
export const ping = (s: World): Promise<boolean> => elm ? elm.act(s, {kind: 'ping'}) as Promise<boolean> : typedCall(() => typed.ping(s));
export const photograph = (s: World, look: number): Promise<boolean> =>
  elm ? elm.act(s, {kind: 'photograph', look}) as Promise<boolean> : typedCall(() => typed.photograph(s, look));
export const fire = (s: World, id: string): Promise<boolean> => elm ? elm.act(s, {kind: 'fire', id}) as Promise<boolean> : typedCall(() => typed.fire(s, id));
export const decoy = (s: World): Promise<boolean> => elm ? elm.act(s, {kind: 'decoy'}) as Promise<boolean> : typedCall(() => typed.decoy(s));
export const deployDrone = (s: World): Promise<boolean> => elm ? elm.act(s, {kind: 'deployDrone'}) as Promise<boolean> : typedCall(() => typed.deployDrone(s));
export const recallDrone = (s: World): Promise<void> => elm ? elm.act(s, {kind: 'recallDrone'}).then(() => undefined) : typedCall(() => typed.recallDrone(s));
export const log = (s: World, text: string, logKind?: string): Promise<void> =>
  elm ? elm.act(s, {kind: 'log', text, logKind}).then(() => undefined) : typedCall(() => typed.log(s, text, logKind));
export const fireDeckGun = (s: World, aim: {bearing: number; elevation: number}): Promise<boolean> =>
  elm ? elm.act(s, {kind: 'fireDeckGun', bearing: aim.bearing, elevation: aim.elevation}) as Promise<boolean> : typedCall(() => typedFireDeckGun(s, aim));
export const aimGunAt = (s: World, point: Point): Promise<void> =>
  elm ? elm.act(s, {kind: 'aimGunAt', ...point}).then(() => undefined) : typedCall(() => typedAimGunAt(s, point));
export const orderScope = (s: World, raised: boolean): Promise<void> =>
  elm ? elm.act(s, {kind: 'orderScope', raised}).then(() => undefined) : typedCall(() => typedOrderScope(s, raised));
export const requestRecon = (s: World, area: {x: number; y: number; size: number}): Promise<boolean> =>
  elm ? elm.act(s, {kind: 'requestRecon', area}) as Promise<boolean> : typedCall(() => typedRequestRecon(s, area));
export const startRescue = (s: World): Promise<boolean> => elm ? elm.act(s, {kind: 'startRescue'}) as Promise<boolean> : typedCall(() => typedStartRescue(s));
export const dronePhotograph = (s: World): Promise<{ok: boolean; text: string}> =>
  elm ? elm.act(s, {kind: 'dronePhotograph'}) as Promise<{ok: boolean; text: string}> : typedCall(() => typedDronePhotograph(s));
export const endPatrolEarly = (s: World): Promise<'partial' | 'withdrawn' | null> =>
  elm ? elm.act(s, {kind: 'endPatrolEarly'}) as Promise<'partial' | 'withdrawn' | null> : typedCall(() => typedEndPatrolEarly(s));
