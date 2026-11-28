import {watchWarnings, bottomCall, batteryCall} from './watch-warnings.ts';
import {freshTransmitters} from './sonar-transmitters.ts';
import {freshTraffic} from './cold-watch.ts';
import {fullCondition, BOAT_PARTS, DRONE_PARTS} from './equipment.ts';
import {makeEnvironment, hash01, soundings} from './environment.ts';
import {bottom, log} from './mechanics.ts';
import {MISSIONS, randomizePatrol} from './missions.ts';
import {freshSystems, freshMotion, freshDrone} from './systems.ts';
import {freshCombat} from './combat.ts';
import {freshRecon} from './recon.ts';
import {patrolDifficulty} from './difficulty.ts';
import {longPatrol} from './patrol-search.ts';
import type {World} from './patrol-world.ts';
// Units: meters, seconds, knots, degrees clockwise from north. No rendering here.

type Options = {timeOfDay?: string; weather?: string; changing?: boolean; difficulty?: unknown};

export function getSoundings(s: World, drone = false) {
  const v = drone ? s.drone : s;
  return soundings(bottom(v.x, v.y, s.environment.chartSeed), v.depth, drone ? .7 : 5 + 27.5 * Math.abs(Math.sin(s.pitch)));
}

export function updateWatchWarnings(s: World): void {
  const previous = s.watchWarnings;
  const current = watchWarnings(getSoundings(s).belowKeel, s.battery, previous);
  if (previous?.bottom && !current.bottom) log(s, 'Keel clearance restored to 20 m or more.');
  if (previous && current.battery < previous.battery) log(s, current.battery === 1 ? 'Battery above 10%. Critical reserve warning cleared.' : 'Battery reserve restored to 20% or more.');
  if (current.bottom && !previous?.bottom) log(s, bottomCall, 'warning');
  if (current.battery > (previous?.battery ?? 0)) log(s, batteryCall(current.battery as 1 | 2), 'warning');
  s.watchWarnings = current;
}

const startingShips = () => [
  {id: 'cobalt', name: 'Cobalt', kind: 'merchant', military: true, x: 1450, y: 2700, heading: 255, speed: 5, hull: 100, alert: 0, attack: 0},
  {id: 'meridian', name: 'Meridian', kind: 'merchant', military: false, x: 2350, y: 2900, heading: 255, speed: 5, hull: 100, alert: 0, attack: 0},
  {id: 'kestrel', name: 'Kestrel', kind: 'escort', military: true, x: 2300, y: 2050, heading: 255, speed: 7, hull: 100, alert: 0, attack: 0},
  {id: 'tern', name: 'Tern', kind: 'fishing', military: false, x: -850, y: 1350, heading: 110, speed: 3, hull: 100, alert: 0, attack: 0},
  {id: 'echo', name: 'Unknown submarine', kind: 'sub', military: true, x: 3800, y: 900, depth: 75, heading: 280, speed: 4, hull: 100, alert: 0, attack: 0},
];

export function createGame(mission = 'recon', seed = 19830604, options: Options = {}): World {
  const m = MISSIONS.find(m => m.id === mission) || MISSIONS[0];
  // The patrol is assembled in steps; randomizePatrol and the long-patrol setup complete it.
  const s = {version: 1, rng: seed || 1, time: 0, status: 'patrol', mission: m.id, phase: 'objective', trackTime: 0, photos: [], hull: 100, battery: 92, oxygen: 100, fuel: 86,
    flood: 0, shock: 0, repair: 0, torps: m.torps, noise: 12, alert: 0, pingAge: 999, pingCooldown: 0, photoCooldown: 0, decoys: 3, engine: 'electric', silent: false, scope: true,
    scopeAngle: 0, scopeSteerBearing: null, towerAngle: 0, towerPitch: 0, systems: freshSystems(), ...freshMotion(), ...freshCombat(), cavitation: 0, propRpm: 52,
    speed: 4, targetSpeed: 4, depth: 12, targetDepth: 12, heading: 32, targetHeading: 32, x: 0, y: 0, route: null, home: {x: -1500, y: -1700},
    environment: makeEnvironment(seed, options), lightning: [], nextLightningAt: 8 + hash01(seed) * 8, acoustics: [], soundSequence: 1,
    events: [{t: 0, text: 'Helm steady. Faint screws bearing 028. Your patrol begins.', kind: 'info'}], contacts: [], projectiles: [], blasts: [], shells: [], nextId: 1,
    drone: freshDrone(), ships: startingShips()} as unknown as World;
  s.imagers = freshTransmitters(); s.traffic = freshTraffic(); s.wake = []; s.soundBearings = []; s.torpedoTracks = [];
  s.repairLimits = fullCondition(BOAT_PARTS); s.drone.repairLimits = fullCondition(DRONE_PARTS); s.debrief = [];
  s.difficulty = patrolDifficulty(options.difficulty); s.recon = freshRecon(); s.reconArchivedSequence = 0; s.photoArchive = []; s.photoSequence = 1;
  randomizePatrol(s, seed);
  if (s.difficulty.longPatrol) {
    Object.assign(s, longPatrol(s));
    if (s.battle) {
      const areas = s.battle.areas, east = Math.sign(areas[1].x - areas[0].x);
      for (const ship of s.ships) {
        const direction = ship.side === 'friendly' ? east : -east;
        ship.x -= direction * 800; ship.heading = direction > 0 ? 90 : 270;
      }
    }
    if (s.departure) s.departure = {x: s.x, y: s.y};
    log(s, 'Long patrol. Search the dashed area on the chart. Its center is an estimate.');
  }
  updateWatchWarnings(s);
  return s;
}
