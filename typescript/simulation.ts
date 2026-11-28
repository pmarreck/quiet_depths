// The simulation the page drives. The TypeScript simulation runs it unless
// the page hands over the Elm worker's adapter with `useElmSimulation`;
// then each function here routes there instead, with the same signature and
// result, so the page's code reads the same either way.
import * as typed from './sim.ts';
import {fireDeckGun as typedFireDeckGun, aimGunAt as typedAimGunAt} from './combat.ts';
import {orderScope as typedOrderScope} from './periscope.ts';
import {requestRecon as typedRequestRecon} from './recon.ts';
import {startRescue as typedStartRescue, dronePhotograph as typedDronePhotograph} from './operation.ts';
import {endPatrolEarly as typedEndPatrolEarly} from './early-end.ts';
import type {ElmSimulation} from './elm-simulation.ts';
import type {World} from './patrol-world.ts';
import type {StepInput} from './patrol-tick.ts';

let elm: ElmSimulation | null = null;

// Routes the page's simulation to the Elm worker's adapter, or back to the
// TypeScript with null.
export function useElmSimulation(simulation: ElmSimulation | null): void { elm = simulation; }
export const elmSimulationActive = (): boolean => elm !== null;

type Options = Parameters<typeof typed.createGame>[2];
type Point = {x: number; y: number; vx?: number; vy?: number; altitude?: number};

export const createGame = (mission = 'recon', seed = 19830604, options: Options = {}): World =>
  elm ? elm.create(mission, seed, options as Record<string, unknown>) : typed.createGame(mission, seed, options);
export const restore = (raw: string): World | null => elm ? elm.restore(raw) : typed.restore(raw);
export const step = (s: World, dt: number, input: StepInput = {}): void => { if (elm) elm.step(s, dt, input); else typed.step(s, dt, input); };
export const ping = (s: World): boolean => elm ? elm.act(s, {kind: 'ping'}) as boolean : typed.ping(s);
export const photograph = (s: World, look: number): boolean => elm ? elm.act(s, {kind: 'photograph', look}) as boolean : typed.photograph(s, look);
export const fire = (s: World, id: string): boolean => elm ? elm.act(s, {kind: 'fire', id}) as boolean : typed.fire(s, id);
export const decoy = (s: World): boolean => elm ? elm.act(s, {kind: 'decoy'}) as boolean : typed.decoy(s);
export const deployDrone = (s: World): boolean => elm ? elm.act(s, {kind: 'deployDrone'}) as boolean : typed.deployDrone(s);
export const recallDrone = (s: World): void => { if (elm) elm.act(s, {kind: 'recallDrone'}); else typed.recallDrone(s); };
export const log = (s: World, text: string, logKind?: string): void => { if (elm) elm.act(s, {kind: 'log', text, logKind}); else typed.log(s, text, logKind); };
export const fireDeckGun = (s: World, aim: {bearing: number; elevation: number}): boolean =>
  elm ? elm.act(s, {kind: 'fireDeckGun', bearing: aim.bearing, elevation: aim.elevation}) as boolean : typedFireDeckGun(s, aim);
export const aimGunAt = (s: World, point: Point): void => { if (elm) elm.act(s, {kind: 'aimGunAt', ...point}); else typedAimGunAt(s, point); };
export const orderScope = (s: World, raised: boolean): void => { if (elm) elm.act(s, {kind: 'orderScope', raised}); else typedOrderScope(s, raised); };
export const requestRecon = (s: World, area: {x: number; y: number; size: number}): boolean =>
  elm ? elm.act(s, {kind: 'requestRecon', area}) as boolean : typedRequestRecon(s, area);
export const startRescue = (s: World): boolean => elm ? elm.act(s, {kind: 'startRescue'}) as boolean : typedStartRescue(s);
export const dronePhotograph = (s: World): {ok: boolean; text: string} =>
  elm ? elm.act(s, {kind: 'dronePhotograph'}) as {ok: boolean; text: string} : typedDronePhotograph(s);
export const endPatrolEarly = (s: World): 'partial' | 'withdrawn' | null =>
  elm ? elm.act(s, {kind: 'endPatrolEarly'}) as 'partial' | 'withdrawn' | null : typedEndPatrolEarly(s);
