import {captainName} from './captain.ts';
import {earlyEndRule} from './early-end.ts';
import {freshTransmitters, validTransmitters} from './sonar-imager.ts';
import {watchWarnings, validWarnings} from './watch-warnings.ts';
import {sailingDay} from './patrol-calendar.ts';
import {resumeTraffic, validTraffic} from './cold-watch.ts';
import {launchWatchSeconds} from './mess-watch.ts';
import {validTubeTimes} from './torpedo-tubes.ts';
import {validAlliedWatch} from './convoy-watch.ts';
import {validEcho, validTracks} from './torpedo-watch.ts';
import {BOAT_PARTS, DRONE_PARTS, readLimits} from './equipment.ts';
import {makeEnvironment, WEATHER} from './environment.ts';
import {MISSIONS, validMissionTargets} from './missions.ts';
import {isDieselMode} from './power-plant.ts';
import {maxNosePitch} from './rov-flight.ts';
import {freshSystems, freshMotion, freshDrone} from './systems.ts';
import {MAX_RUN, ENEMY_DECOY_SUPPLY, freshCombat, restoreIncomingRun, restoreTorpedo} from './combat.ts';
import {freshRecon, validateReconState} from './recon.ts';
import {designation, fixContact} from './track-estimates.ts';
import {photoArchive, validPhoto, PHOTO_BUDGET} from './photos.ts';
import {validReport} from './hostile-tracks.ts';
import {patrolDifficulty} from './difficulty.ts';
import {validSearch} from './patrol-search.ts';
import {validDebrief} from './debrief.ts';
import {createGame, getSoundings} from './patrol-create.ts';
import type {World} from './patrol-world.ts';

type Fields = Record<string, unknown>;
const finite = Number.isFinite;
const allFinite = (value: unknown, keys: readonly string[]) => keys.every(k => finite((value as Fields)[k]));

export function save(s: World): string { return JSON.stringify(s); }

// A saved patrol is untrusted JSON. Older saves gain fields added since, in the
// order below, and every field is checked before the patrol may resume.
export function restore(raw: string): World | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const s = parsed as World, fields = parsed as Fields;
    if (!s || s.version !== 1 || !MISSIONS.some(m => m.id === s.mission) || !['patrol', 'won', 'partial', 'withdrawn', 'lost', 'compromised', 'expired', 'convoy-lost'].includes(s.status)) return null;
    if (s.scopeTravel !== undefined && (!finite(s.scopeTravel) || s.scopeTravel < 0 || s.scopeTravel > 1)) return null;
    if (s.captain !== undefined && (typeof s.captain !== 'string' || !s.captain || s.captain !== captainName(s.captain))) return null;
    if (s.mission !== 'wolf-in-the-henhouse' && (s.convoy !== undefined || s.status === 'convoy-lost')) return null;
    if (['partial', 'withdrawn'].includes(s.status) && (s.phase !== 'objective' || earlyEndRule(s.mission) === null)) return null;
    if (s.imagers === undefined) s.imagers = freshTransmitters();
    if (!validTransmitters(s.imagers)) return null;
    if (s.imagingTime !== undefined && (!finite(s.imagingTime) || s.imagingTime < 0 || s.imagingTime > s.time + .001)) return null;
    if (s.newYearWatch !== undefined && (!Number.isSafeInteger(s.newYearWatch) || s.newYearWatch < 0)) return null;
    if (s.unpoweredSince !== undefined && (!finite(s.unpoweredSince) || s.unpoweredSince < 0 || s.unpoweredSince > s.time)) return null;
    if (s.wavePhase !== undefined && (!finite(s.wavePhase) || s.wavePhase < 0)) return null;
    // Patrols saved before the orbit option existed always used station views.
    s.difficulty = patrolDifficulty({orbitCamera: false, instantReplay: false, ...s.difficulty});
    s.wake ??= [];
    if (!Array.isArray(s.wake) || s.wake.length > 28 || !s.wake.every(p => p && [p.x, p.y, p.heading, p.time, p.width, p.strength].every(finite) && p.time <= s.time && p.width >= 0 &&
      p.strength >= 0 && p.strength <= 1)) return null;
    s.soundBearings ??= [];
    if (!Array.isArray(s.soundBearings) || s.soundBearings.length > 16 || !s.soundBearings.every(b => b && [b.x, b.y, b.bearing, b.time].every(finite) && b.bearing >= 0 && b.bearing < 360 &&
      b.time <= s.time && ['launch', 'splashdown'].includes(b.kind))) return null;
    if (s.torpedoTracks === undefined) s.torpedoTracks = [];
    if (!validTracks(s.torpedoTracks, s.time)) return null;
    s.debrief ??= [];
    if (!validDebrief(s.debrief, s.time) || s.patrolId !== undefined && (typeof s.patrolId !== 'string' || !/^[a-f0-9]{32}$/.test(s.patrolId))) return null;
    const legacyCrewWatch = s.crewQuietUntil === undefined;
    if (!legacyCrewWatch && (!finite(s.crewQuietUntil) || s.crewQuietUntil < 0 || s.crewQuietUntil > s.time + launchWatchSeconds)) return null;
    if (s.noisemaker !== undefined && !validReport(s.noisemaker, s.time)) return null;
    // Migrate existing v1 patrols without discarding their progress or drone state.
    if (s.recon === undefined) s.recon = freshRecon();
    if (s.reconArchivedSequence === undefined) s.reconArchivedSequence = 0;
    if (s.photoArchive === undefined) s.photoArchive = [];
    if (s.photoSequence === undefined) s.photoSequence = 1;
    const archive = s.photoArchive as unknown[];
    if (!validateReconState(s.recon) || !Array.isArray(archive) || archive.length > 24 || !Number.isSafeInteger(s.photoSequence) || s.photoSequence < 1) return null;
    if (!archive.every(p => validPhoto(p) && Number.isSafeInteger(p.id) && (p.id as number) > 0) || new Set(archive.map(p => (p as Fields).id)).size !== archive.length ||
      archive.reduce((n: number, p) => n + (p as {image: string}).image.length, 0) > PHOTO_BUDGET) return null;
    photoArchive(s);
    if (s.scopeAngle === undefined) s.scopeAngle = 0;
    if (s.scopeSteerBearing === undefined) s.scopeSteerBearing = null;
    if (s.environment === undefined) { s.environment = makeEnvironment(s.patrol?.seed ?? s.rng); delete (s.environment as Partial<World['environment']>).chartSeed; }
    if (s.lightning === undefined) s.lightning = [];
    if (s.acoustics === undefined) s.acoustics = [];
    if (s.nextLightningAt === undefined) s.nextLightningAt = s.time + 8;
    if (s.soundSequence === undefined) s.soundSequence = 1;
    if (s.patrol === undefined) fields.patrol = {seed: s.environment.seed, photoGoal: 2, trackGoal: 180, variant: 0};
    const systems = s.systems as Fields | undefined, limits = s.repairLimits as Fields | undefined;
    if (fields.plantVersion === undefined) {
      if (systems) for (const key of ['diesel', 'fuelTank', 'batteryBank', 'tubes']) {
        systems[key] = key === 'diesel' ? systems.engine : 100;
        if (limits) limits[key] = key === 'diesel' ? limits.engine : 100;
      }
    } else if (fields.plantVersion !== 1 || ![s.fuelLeak, s.fuelFire].every(finite) || s.fuelLeak < 0 || s.fuelLeak > 1 || s.fuelFire < 0 || s.fuelFire > 24 || typeof s.cookoff !== 'boolean') return null;
    for (const [k, v] of Object.entries(freshCombat())) if (fields[k] === undefined) fields[k] = v;
    if (!validTubeTimes(s.tubeReadyAt, s.time) || !Number.isInteger(s.torps) || s.torps < 0) return null;
    if (s.outerHull === undefined) s.outerHull = s.hull;
    for (const [k, v] of Object.entries({...freshMotion(), towerAngle: 0, towerPitch: 0, cavitation: 0, propRpm: 0})) if (fields[k] === undefined) fields[k] = v;
    if (s.systems === undefined) s.systems = freshSystems(); else if (s.systems && s.systems.deckgun === undefined) s.systems.deckgun = 100;
    if (s.shells === undefined) s.shells = [];
    if (s.site === undefined) s.site = null;
    if (s.operation === undefined) s.operation = null;
    if (s.drone) {
      const drone = s.drone as unknown as Fields;
      for (const [k, v] of Object.entries({...freshDrone(), targetDepth: s.drone.depth, targetHeading: s.drone.heading})) if (drone[k] === undefined) drone[k] = v;
    }
    const template = createGame(s.mission), templateFields = template as unknown as Fields;
    for (const [k, v] of Object.entries(templateFields)) {
      if (typeof v === 'number' && !finite(fields[k])) return null;
      if (typeof v === 'boolean' && typeof fields[k] !== 'boolean') return null;
      if (Array.isArray(v) && !Array.isArray(fields[k])) return null;
    }
    const hits = s.collisionHits as unknown;
    if (typeof s.bottomed !== 'boolean' || s.outerHull < 0 || s.outerHull > 100 || s.criticalExposure < 0 || ![0, 1, 2].includes(s.pressureAlarm) || !hits || Array.isArray(hits) ||
      typeof hits !== 'object' || !Object.values(hits).every(t => finite(t) && t >= 0 && t <= s.time)) return null;
    if (!isDieselMode(s.dieselMode)) return null;
    if (!['objective', 'extract'].includes(s.phase) || !['electric', 'diesel'].includes(s.engine) || !s.home || !finite(s.home.x) || !finite(s.home.y) || !s.drone ||
      !['stowed', 'remote', 'return', 'lost'].includes(s.drone.mode)) return null;
    s.environment.startDay ??= sailingDay(s.environment.seed);
    if (!Number.isInteger(s.environment.startDay) || s.environment.startDay < 0 || s.environment.startDay > 365) return null;
    if (s.environment?.chartSeed !== undefined && (!Number.isInteger(s.environment.chartSeed) || s.environment.chartSeed < 0 || s.environment.chartSeed > 0xffffffff)) return null;
    if (!s.environment || !(WEATHER as Readonly<Record<string, unknown>>)[s.environment.startWeather] || !finite(s.environment.startHour) || !finite(s.environment.seed) ||
      typeof s.environment.changing !== 'boolean') return null;
    if (!s.systems || Object.keys(freshSystems()).some(k => { const v = (s.systems as Fields)[k]; return !finite(v) || (v as number) < 0 || (v as number) > 100; })) return null;
    s.repairLimits = readLimits(BOAT_PARTS, {...s.systems, hull: s.hull}, s.repairLimits)!;
    s.drone.repairLimits = readLimits(DRONE_PARTS, s.drone, s.drone.repairLimits)!;
    if (!s.repairLimits || !s.drone.repairLimits) return null;
    if (!s.patrol || !allFinite(s.patrol, ['seed', 'photoGoal', 'trackGoal', 'variant']) || s.scopeSteerBearing !== null && !finite(s.scopeSteerBearing)) return null;
    // Old fleet-action patrols left port with three. Preserve rounds already spent.
    if (s.patrol.startingTorpedoes === undefined) {
      const oldFleetLoad = s.mission === 'tiebreaker' && s.torps <= 3;
      s.patrol.startingTorpedoes = oldFleetLoad && s.status !== 'patrol' ? 3 : template.torps;
      if (oldFleetLoad && s.status === 'patrol') s.torps += template.torps - 3;
    }
    if (!Number.isSafeInteger(s.patrol.startingTorpedoes) || s.patrol.startingTorpedoes < 0) return null;
    if (s.runSetting < 100 || s.runSetting > MAX_RUN || !s.reports.every(r => r && typeof r.id === 'string' && typeof r.text === 'string' && finite(r.time) && r.time <= s.time)) return null;
    if (!s.gun || !allFinite(s.gun, ['ammo', 'cooldown', 'shots', 'angle', 'elevation'])) return null;
    const support = s.airSupport;
    if (!support || !['idle', 'arming', 'airborne', 'spent'].includes(support.status) || !support.base || !allFinite(support.base, ['x', 'y'])) return null;
    for (const k of ['requestedAt', 'launchAt'] as const) if (support[k] !== null && !finite(support[k])) return null;
    if (support.lastKnown && !validReport(support.lastKnown, s.time, true)) return null;
    for (const p of s.aircraft) if (!allFinite(p, ['x', 'y', 'altitude', 'heading', 'speed', 'hull']) || typeof p.id !== 'string') return null;
    for (const p of s.gunRounds) if (!allFinite(p, ['id', 'x', 'y', 'altitude', 'vx', 'vy', 'vz', 'age']) || !['player', 'aircraft'].includes(p.owner) || typeof p.tracer !== 'boolean') return null;
    for (const p of s.impacts) if (!allFinite(p, ['id', 'x', 'y', 'altitude', 'time'])) return null;
    if (!allFinite(s.drone, ['hull', 'mobility', 'buoyancy', 'camera', 'verticalSpeed', 'collisionCooldown', 'returnStage', 'returnClearance', 'returnHoldSide', 'returnHoldForward'])) return null;
    if (['undersea-rescue', 'surface-rescue', 'survey'].includes(s.mission)) {
      const site = s.site;
      if (!site || !s.operation || !allFinite(site, ['x', 'y', 'depth', 'heading']) || !['surface', 'wreck', 'sub'].includes(site.kind) || typeof site.name !== 'string') return null;
      site.hull ??= 100;
      if (!finite(site.hull) || site.hull < 0 || site.hull > 100) return null;
      const o = s.operation as unknown as Fields;
      if (!['rescued', 'remaining', 'dead', 'assessment', 'boarding', 'diverReturn', 'scan', 'lastCasualty'].every(k => finite(o[k]) && (o[k] as number) >= 0) ||
        !['known', 'holding', 'active', 'completed'].every(k => typeof o[k] === 'boolean') || !Array.isArray(o.photoAngles) || !o.photoAngles.every(finite)) return null;
    } else if (s.site || s.operation) return null;
    for (const p of s.shells) if (!allFinite(p, ['id', 'x', 'y', 'depth', 'delay', 'fromX', 'fromY', 'total'])) return null;
    if (!allFinite(s.drone, ['x', 'y', 'heading', 'depth', 'battery', 'speed', 'targetSpeed', 'targetDepth', 'targetHeading'])) return null;
    if (s.route && (!finite(s.route.x) || !finite(s.route.y))) return null;
    for (const ship of s.ships) if (!ship || typeof ship.id !== 'string' || typeof ship.name !== 'string' || !['merchant', 'fishing', 'escort', 'sub', 'carrier'].includes(ship.kind) ||
      !allFinite(ship, ['x', 'y', 'heading', 'speed', 'hull', 'alert', 'attack'])) return null;
    for (const v of s.ships) {
      const vessel = v as unknown as Fields;
      for (const key of ['sinkDepth', 'sunkAt', 'nextCreak', 'collapsedAt', 'nextSweep', 'neutralHitAt']) if (vessel[key] !== undefined && (!finite(vessel[key]) || (vessel[key] as number) < 0)) return null;
      if (v.clue && (![v.clue.x, v.clue.y, v.clue.time].every(finite) || v.clue.time < 0 || v.clue.time > s.time)) return null;
      if (vessel.nextInquiry !== undefined && (!finite(vessel.nextInquiry) || (vessel.nextInquiry as number) < 0)) return null;
      if (v.wreckMark && (!finite(v.wreckMark.x) || !finite(v.wreckMark.y) || typeof v.wreckMark.observed !== 'boolean')) return null;
    }
    if (s.ships.some(ship => ship.report !== undefined && !validReport(ship.report, s.time))) return null;
    if (s.ships.some(ship => ship.torpedoDecoys !== undefined && (!Number.isInteger(ship.torpedoDecoys) || ship.torpedoDecoys < 0 || ship.torpedoDecoys > ENEMY_DECOY_SUPPLY))) return null;
    if (s.traffic === undefined) s.traffic = resumeTraffic(s.time, s.patrol.seed);
    if (s.watchWarnings !== undefined && !validWarnings(s.watchWarnings)) return null;
    s.watchWarnings ??= watchWarnings(getSoundings(s).belowKeel, s.battery);
    if (!validTraffic(s) || !validAlliedWatch(s) || !validMissionTargets(s)) return null;
    if (s.difficulty.longPatrol ? !validSearch(s) : s.search !== undefined) return null;
    for (const c of s.contacts) if (!c || typeof c.id !== 'string' || typeof c.label !== 'string' || !allFinite(c, ['bearing', 'range', 'confidence', 'age', 'x', 'y']) ||
      c.depthEstimate !== undefined && !finite(c.depthEstimate) || c.courseEstimated !== undefined && typeof c.courseEstimated !== 'boolean') return null;
    if (s.drone.nosePitch !== null && (!finite(s.drone.nosePitch) || Math.abs(s.drone.nosePitch) > maxNosePitch)) return null;
    if (s.drone.returnStage < 0 || s.drone.returnStage > 3 || !Number.isInteger(s.drone.returnStage)) return null;
    for (const c of s.contacts) {
      for (const side of [c.side, c.probableSide]) if (side !== undefined && (!s.convoy && s.mission !== 'tiebreaker' && !s.ships.some(v => v.id === c.id && v.incidental) ||
        !['friendly', 'hostile'].includes(side as string))) return null;
      if (c.passiveAt !== undefined && (!finite(c.passiveAt) || (c.passiveAt as number) < 0 || (c.passiveAt as number) > s.time || ![c.passiveBearing, c.passiveX, c.passiveY].every(finite))) return null;
      if (c.lastSweep !== undefined && (!finite(c.lastSweep) || (c.lastSweep as number) < 0 || (c.lastSweep as number) > s.time)) return null;
      const area = c.sweepArea as Fields | undefined;
      if (area && (!allFinite(area, ['x', 'y', 'time', 'size']) || area.size !== 900 || (area.time as number) > s.time)) return null;
      if (c.fix && !fixContact({}, c.fix)) return null;
      const old = /^Sierra (\d+)$/.exec(c.label as string);
      if (old) c.label = designation(Number(old[1]));
    }
    for (const e of s.events) if (!e || typeof e.text !== 'string' || typeof e.kind !== 'string' || !finite(e.t)) return null;
    if (!s.projectiles.every(p => restoreTorpedo(s, p))) return null;
    // Older saves can still date a player launch from a running torpedo.
    if (legacyCrewWatch) {
      for (const p of s.projectiles) if (p.owner === 'player' && p.age >= 0 && p.age <= s.time) s.crewQuietUntil = Math.max(s.crewQuietUntil, s.time - p.age + launchWatchSeconds);
    }
    for (const b of s.blasts) {
      if (!allFinite(b, ['x', 'y', 'depth', 'delay', 'age'])) return null;
      if (b.id === undefined) b.id = s.soundSequence++;
      if (b.totalDelay === undefined) b.totalDelay = Math.max(1, b.delay);
      if (b.exploded === undefined) b.exploded = b.age > 0;
      if (b.exploded && b.explodedAt === undefined) b.explodedAt = s.time - b.age;
    }
    s.blasts = s.blasts.filter(b => {
      if (b.kind !== 'weapon' || b.exploded) return true;
      restoreIncomingRun(s, b); return false;
    });
    for (const e of s.lightning) if (!allFinite(e, ['id', 'time', 'x', 'y', 'height', 'seed'])) return null;
    for (const e of s.acoustics) {
      if (!allFinite(e, ['id', 'time', 'x', 'y', 'power']) || !['thunder', 'blast', 'detonation', 'gunfire', 'seeker', 'creak', 'collapse', 'settling', 'sweep', 'launch', 'splashdown'].includes(e.type as string) ||
        typeof e.heard !== 'boolean') return null;
      if (['sweep', 'collapse', 'settling'].includes(e.type as string) && !s.ships.some(v => v.id === e.vessel)) return null;
      if (e.echo !== undefined && (e.type !== 'seeker' || !validEcho(e.echo as Parameters<typeof validEcho>[0], e.time) || (e.echo as {time: number}).time !== e.time)) return null;
      if (e.ownHit !== undefined && typeof e.ownHit !== 'boolean') return null;
    }
    return s;
  } catch { return null; }
}
