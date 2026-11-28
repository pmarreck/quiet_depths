// Mirrored in elm/Sim/Missions.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {recordLocalLaunch} from './mess-watch.ts';
import {carrierGroup} from './carrier.ts';
import {setupHenhouse} from './convoy-watch.ts';
import {advanceFleetAction, fleetTheater} from './fleet-action.ts';
import {emitSound, launchNoise, type Sound} from './acoustics.ts';
import {replayEvent} from './replay-events.ts';
import {rad, bearing, log, type LogEntry} from './mechanics.ts';
import {hash01, type EnvironmentConfig} from './environment.ts';
import {MISSIONS, convoyTransportIds, evaluateObjective} from './mission-objective.ts';
import {setupOperation, updateRescue, updateSurvey, type Site, type Operation} from './operation.ts';
import {trackingCriteria, trackingGoal} from './convoy-tracking.ts';
import {photoCriteria, photoGoal} from './recon-photos.ts';
import {slice} from './world-slice.ts';
export {MISSIONS};
// Rescues and surveys live in operation.ts, and the objective panel in mission-panel.ts;
// importers reach the rescues and surveys here as before.
export {setupOperation, operationApproach, operationConditions, startRescue, casualtyDeadline, dronePhotograph, updateSurvey, updateOperation, updateRescue} from './operation.ts';

type MissionId = (typeof MISSIONS)[number]['id'];
type Point = {x: number; y: number};
interface Ship extends Point {
  id: string; name: string; kind: string; military?: boolean; side?: string; hull: number; heading: number; speed: number; depth?: number;
  alert?: number; attack?: number; flood?: number; disabled?: boolean; sinkDepth?: number; wreckMark?: unknown; nextSweep?: number; incidental?: boolean;
}
export interface Patrol extends Point {
  mission: MissionId; time: number; depth: number; targetDepth: number; heading: number; targetHeading: number; speed: number; targetSpeed: number;
  scope: boolean; route?: unknown; status: string; phase?: string; torps: number;
  patrol: {seed: number; startingTorpedoes: number; photoGoal: number; trackGoal: number; variant: number};
  home: Point; departure?: Point; ships: Ship[]; site: Site | null; operation: Operation | null; search?: {located: boolean; protectedTime: number};
  environment: EnvironmentConfig; difficulty: {longPatrol?: boolean; drone?: boolean; [key: string]: unknown};
  drone: {mode: string; x: number; y: number; depth: number; heading: number; camera: number}; systems: {sonar: number};
  photoCooldown: number; photos: string[]; trackTime: number; convoy?: unknown; battle?: unknown; airSupport: {base?: Point};
  events: LogEntry[]; impacts: {id: number; x: number; y: number; altitude: number; time: number; kind: string}[]; weaponSequence: number;
  acoustics: Sound[]; soundSequence: number; crewQuietUntil: number;
}


export function updateFleetBattle(s: Patrol): void {
  advanceFleetAction(slice(s), (ship, v, fired) => {
    const p = fired ? v.from : v.to;
    if (fired && v.underwater) { recordLocalLaunch(s, p); launchNoise(s, {...p, depth: -p.altitude}); }
    const type = fired ? (v.underwater ? 'seeker' : 'gunfire') : 'detonation';
    emitSound(s, {type, x: p.x, y: p.y, depth: Math.max(0, -p.altitude), altitude: p.altitude, power: fired ? .55 : .9});
    if (!fired) {
      const kind = v.damage && v.underwater ? 'torpedo' : !v.damage && p.altitude >= -2 ? 'splash' : 'hit';
      s.impacts.push({id: s.weaponSequence++, x: p.x, y: p.y, altitude: p.altitude, time: s.time, kind});
      if (v.underwater && v.damage) replayEvent(s, {kind: 'torpedo', shot: v.id, target: ship.id, enemy: true, point: {x: p.x, y: p.y, depth: -p.altitude}});
    }
  });
}




export const objectiveComplete = (s: Patrol, dt: number) => evaluateObjective(s, dt, {rescue: updateRescue, survey: updateSurvey});

export function randomizePatrol(s: Patrol, seed: number): void {
  const h = (n: number) => hash01(seed, n), heading = 220 + h(21) * 65, start = {x: (h(22) - .5) * 500, y: (h(23) - .5) * 500};
  s.patrol = {seed, startingTorpedoes: s.torps, photoGoal: photoGoal(h(24), photoCriteria), trackGoal: trackingGoal(h(25), trackingCriteria), variant: 1 + Math.floor(h(26) * 999)};
  Object.assign(s, {...start, heading: 20 + h(27) * 35, targetHeading: 20 + h(27) * 35});
  s.home = {x: start.x - 1100 - h(28) * 650, y: start.y - 1000 - h(29) * 650};
  const convoy = {x: start.x + 1050 + h(30) * 650, y: start.y + 1800 + h(31) * 650}, speed = 3.5 + h(32) * 3;
  const hunting = s.mission === 'seek-and-destroy';
  if (hunting) {
    const course = rad(-15 + h(84) * 85), range = 2700 + h(85) * 1200;
    convoy.x = start.x + Math.sin(course) * range;
    convoy.y = start.y + Math.cos(course) * range;
  }
  const militaryNames = ['Cobalt', 'Borealis', 'Vesper', 'Ironwood', 'Kittiwake'];
  for (const [i, v] of s.ships.entries()) {
    v.x = convoy.x + (i === 3 ? -2200 : 0) + (h(40 + i) - .5) * 800; v.y = convoy.y + (i === 3 ? -900 : 0) + (h(50 + i) - .5) * 700; v.heading = heading + (h(60 + i) - .5) * 12;
    v.speed = v.kind === 'fishing' ? 2 + h(70 + i) * 2 : speed + (v.kind === 'escort' ? 2 : 0); v.flood = 0; v.disabled = false; v.sinkDepth = 0;
    if (v.id === 'cobalt') v.name = militaryNames[Math.floor(h(80) * militaryNames.length)];
  }
  // Recon always has enough distinct silhouettes, without reusing a photograph.
  s.ships.push({id: 'alder', name: ['Alder', 'Seaforth', 'Larch'][Math.floor(h(81) * 3)], kind: 'merchant', military: false, x: convoy.x + 400 + h(82) * 500, y: convoy.y + 450 + h(83) * 300,
    heading, speed, hull: 100, alert: 0, attack: 0, flood: 0, disabled: false, sinkDepth: 0});
  setupOperation(s, seed);
  s.events = s.events.filter(e => !e.text.startsWith('Helm steady.'));
  if (s.mission === 'wolf-in-the-henhouse') { setupHenhouse(slice(s)); return; }
  if (s.mission === 'tiebreaker') {
    Object.assign(s, fleetTheater(start, seed)); s.home = {x: start.x - 450, y: start.y - 550};
    if (!s.difficulty.longPatrol) updateFleetBattle(s);
    log(s, 'Lark, Marlin and Calliope fly blue forked pennants. The orange pennants are hostile. Nacre is our submarine.');
    log(s, s.difficulty.longPatrol ? 'Both fleets are approaching the sector. Friendly patrol areas are marked on the chart.'
      : 'Fleet action in progress. Chart rings are friendly patrol areas from the briefing. No current positions confirmed.');
    return;
  }
  if (s.mission === 'big-kahuna') {
    s.ships = carrierGroup(convoy.x, convoy.y, heading, speed, h(981) < .5, h(982));
    s.airSupport.base = {...convoy};
    log(s, 'Fleet carrier Solstice and her escort were last reported to the northeast. No alarm has been raised.');
    return;
  }
  if (s.mission === 'seek-and-destroy-sub') {
    s.ships = s.ships.filter(ship => ship.kind === 'fishing' || ship.id === 'echo');
    const primary = s.ships.find(ship => ship.id === 'echo')!;
    Object.assign(primary, {depth: 55 + h(86) * 40, heading: 188 + h(88) * 60});
    if (h(89) < .36) s.ships.push({...primary, id: 'echo-two', x: primary.x + 700 + h(90) * 1200, y: primary.y + 400 + h(91) * 1100, depth: 45 + h(92) * 45, heading: 150 + h(93) * 105});
    s.phase = 'extract';
    log(s, `Patrol ${seed}. An enemy submarine was reported in this sector. Engage or withdraw. Surface at extraction to survive.`);
    return;
  }
  if (s.mission === 'sneaky-seamen') {
    s.departure = {...start};
    const course = rad(30 + h(920) * 35), east = Math.sin(course), north = Math.cos(course), length = 2700 + h(921) * 550;
    s.home = {x: start.x + east * length, y: start.y + north * length};
    s.heading = s.targetHeading = bearing(start, s.home);
    s.ships.forEach((v, i) => {
      const along = length * (.37 + h(930 + i) * .36), across = (h(940 + i) - .5) * 1100;
      v.x = start.x + east * along + north * across; v.y = start.y + north * along - east * across;
      if (v.kind === 'escort' || v.kind === 'sub') v.nextSweep = 15 + h(960 + i) * 35;
    });
    log(s, 'Gate A passed. Cross the convoy patrol and reach Gate B. No attack or surfacing required.');
    return;
  }
  if (hunting) {
    for (const ship of s.ships) if ((convoyTransportIds as readonly string[]).includes(ship.id)) ship.military = true;
    if (h(87) >= .4) s.ships = s.ships.filter(ship => ship.id !== 'echo');
    const lastBearing = (Math.round(bearing(start, convoy) / 45) * 45) % 360;
    if (!s.difficulty.longPatrol) log(s, `Patrol ${seed}. Last report put the convoy around bearing ${String(lastBearing).padStart(3, '0')}°. Listen for the transports and escort.`);
    return;
  }
  log(s, `Patrol ${seed}. ${s.operation ? s.site!.name : s.mission === 'shadow' ? s.patrol.trackGoal + ' seconds of passive tracking' : s.mission === 'recon' ? s.patrol.photoGoal + ' merchant photographs required' : s.ships[0].name + ' is the objective'}.`);
}
