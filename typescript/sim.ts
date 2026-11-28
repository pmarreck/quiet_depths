// Mirrored in elm/Sim/Patrol.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
// The patrol simulation: creation, player actions, the fixed-step tick and saves.
// Units: meters, seconds, knots, degrees clockwise from north. No rendering here.
export {clamp, rad, bearing, delta, distance, bottom, log} from './mechanics.ts';
export {MISSIONS} from './missions.ts';
export {deployDrone, recallDrone, hurt} from './systems.ts';
export {createGame, getSoundings} from './patrol-create.ts';
export {isVisible, contact, ping, photograph, fire, decoy, dropDepthCharge} from './patrol-contacts.ts';
export {step, type StepInput} from './patrol-tick.ts';
export {save, restore} from './patrol-restore.ts';
export type {World, Ship} from './patrol-world.ts';
