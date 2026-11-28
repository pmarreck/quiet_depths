// Mirrored in elm/Sim/Operation.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
// Each tick's work and the ROV's survey photographs are elm/Sim/OperationWork.elm.
import {operatingFraction} from './equipment.ts';
import {bearing, delta, distance, separation, bottom, log} from './mechanics.ts';
import {hash01} from './environment.ts';
import {addScan, scanRate, surveyComplete, surveyCriteria, type SurveyCriteria} from './wreck-survey.ts';
import {casualtyDepth, initialSurvivors, nextLossDelay, rescueCriteriaFor, stationKeeping, surfaceRescue, type RescueCriteria} from './rescue-operation.ts';
import type {Patrol} from './missions.ts';

// A rescue or survey: the site its mission makes, the boat's approach and station keeping
// beside it, and the operation's tally of survivors, scans and photographs.
type Point = {x: number; y: number};
export interface Site extends Point {hull: number; depth: number; heading: number; kind: string; name: string; speed: number}
export interface Operation {
  rescued: number; remaining: number; dead: number; known: boolean; assessment: number; boarding: number; diverReturn: number; holding: boolean;
  active: boolean; scan: number; photoAngles: number[]; lastCasualty: number; completed: boolean; find: string | null;
}
type Operating = Patrol & {site: Site; operation: Operation};

export function setupOperation(s: Patrol, seed: number): void {
  s.site = null; s.operation = null;
  if (!['undersea-rescue', 'surface-rescue', 'survey'].includes(s.mission)) return;
  const surface = s.mission === 'surface-rescue', survey = s.mission === 'survey', x = 1430 + hash01(seed, 801) * 330, y = 420 + hash01(seed, 802) * 450;
  const name = (names: string[]) => names[Math.floor(hash01(seed, 804) * 3)];
  const site: Site = s.site = {x, y, hull: 100, depth: surface ? surfaceRescue.sinking!.startDepth : bottom(x, y, s.environment.chartSeed) - 5, heading: 35 + hash01(seed, 803) * 100,
    kind: surface ? 'surface' : survey ? 'wreck' : 'sub',
    name: surface ? name(['R/V Halcyon', 'M/V Solway', 'R/V Northstar']) : survey ? name(['SS Aster, 1912', 'SS Caledonia, 1906', 'SS Pelican, 1921']) : name(['SS-118 Lantern', 'SS-142 Cormorant', 'SS-107 Narwhal']),
    speed: 0};
  const rules = rescueCriteriaFor(site.kind);
  s.operation = {rescued: 0, remaining: initialSurvivors(hash01(seed, 811), hash01(seed, 812), rules), dead: 0, known: false, assessment: 0, boarding: 0, diverReturn: 0,
    holding: false, active: false, scan: 0, photoAngles: [], lastCasualty: rules.casualtyClockStart, completed: false, find: null};
  const start = {x: x - 260 - hash01(seed, 805) * 120, y: y - 200 - hash01(seed, 806) * 180}, heading = bearing(start, site), depth = surface ? 0 : 35 + Math.floor(hash01(seed, 807) * 20);
  Object.assign(s, {...start, depth, targetDepth: depth, heading, targetHeading: heading, speed: 3, targetSpeed: 3, scope: surface});
  s.home = {x: start.x - 250 - hash01(seed, 808) * 150, y: start.y - 350 - hash01(seed, 809) * 180};
  const hostile = hash01(seed, 813) > .4;
  const escort = s.ships.find(v => v.id === 'kestrel')!;
  Object.assign(escort, {x: x + 1200, y: y + 700, heading: 230, speed: 5, alert: hostile ? 35 : 0});
  // Civil traffic remains distant; an optional hunter is the pressure on a rescue.
  if (!hostile || survey) s.ships = s.ships.filter(v => v.kind !== 'escort' && v.kind !== 'sub');
  log(s, s.difficulty.longPatrol ? 'Last report received. Search the briefed area for the mission site.'
    : survey ? 'Wreck coordinates received. Plot an approach and inspect the reef shelf.' : 'Distress coordinates received. Survivor count unknown. Time matters.');
}

export function operationApproach(s: Patrol) {
  if (!s.site || s.search && !s.search.located) return null;
  return {x: s.site.x - 55, y: s.site.y, depth: s.site.kind === 'surface' ? 0 : Math.max(0, s.site.depth - 11), radius: 8};
}

export function operationConditions(s: Patrol) {
  if (!s.site) return null;
  const d = distance(s, s.site), surface = s.site.kind === 'surface', depth = surface ? 0 : s.site.depth - 11;
  return {range: d, depth, ...stationKeeping(d, s.speed, s.depth - depth, rescueCriteriaFor(s.site.kind))};
}

export function startRescue(s: Patrol): boolean {
  const c = operationConditions(s);
  if (!c?.onStation || s.status !== 'patrol' || s.mission === 'survey' || s.operation!.completed) return false;
  s.route = null; s.targetSpeed = 0; s.targetDepth = c.depth;
  log(s, c.holding ? 'Rescue team on station. Hold here for transfers.' : 'Holding station. Moving to rescue depth.');
  return true;
}

export const rescueCriteria = (s: Patrol) => rescueCriteriaFor(s.site?.kind);

export function casualtyDeadline(s: Patrol): number {
  const o = s.operation!, seed = s.patrol.seed;
  return o.lastCasualty + nextLossDelay(o.dead, hash01(seed, o.dead === 0 ? 821 : 822 + o.dead), rescueCriteria(s));
}

export function dronePhotograph(s: Patrol) {
  const d = s.drone, o = s.operation, site = s.site!;
  if (s.mission !== 'survey' || !o || !['remote', 'return'].includes(d.mode) || s.photoCooldown > 0) return {ok: false, text: 'No survey camera task available.'};
  const reach = 85 * operatingFraction(d.camera);
  if (!reach) return {ok: false, text: 'ROV camera offline.'};
  if (separation(d, site) > reach || separation(d, site) < 8 || Math.abs(delta(bearing(d, site), d.heading)) > 32)
    return {ok: false, text: `Aim at the wreck within ${Math.floor(reach)} m. Inspect from above or beside it.`};
  const angle = bearing(site, d);
  const c = surveyCriteria;
  if (o.photoAngles.some(a => Math.abs(delta(angle, a)) < c.photoSeparation)) return {ok: false, text: 'This side is already recorded. Move around the wreck for another angle.'};
  o.photoAngles.push(angle); s.photoCooldown = 4;
  log(s, `Wreck photograph ${o.photoAngles.length}/${c.photographs} recorded.`, 'success');
  return {ok: true, text: `Survey image ${o.photoAngles.length}/${c.photographs} recorded.`};
}

const SURVEY_FINDS = ['A brass ship’s bell, engraved ASTER · 1912. A museum will want her story.', 'A sealed navigation journal and ceramic cargo. The archaeology team is delighted.',
  'Silver trade coins in a broken strongbox. Treasure, with a provenance worth preserving.'];

export function updateSurvey(s: Patrol, dt: number, criteria: SurveyCriteria = surveyCriteria): boolean {
  const o = s.operation;
  if (!o || o.completed) return false;
  const c = operationConditions(s)!;
  o.holding = c.holding;
  const rate = scanRate({range: c.range, vertical: Math.abs(s.depth - s.site!.depth), speed: s.speed, sonar: s.systems.sonar}, criteria);
  o.active = rate > 0;
  if (o.active) o.scan = addScan(o.scan, rate, dt, criteria);
  if (surveyComplete(o, criteria)) { o.completed = true; o.find = SURVEY_FINDS[Math.floor(hash01(s.environment.seed, 819) * SURVEY_FINDS.length)]; log(s, o.find, 'success'); }
  return o.completed;
}

export function updateOperation(s: Patrol, dt: number): boolean {
  if (s.mission === 'survey') return updateSurvey(s, dt);
  return updateRescue(s, dt, rescueCriteria(s));
}

export function updateRescue(s: Patrol, dt: number, rules: RescueCriteria): boolean {
  const o = s.operation;
  if (!o || o.completed) return false;
  const live = s as Operating, c = operationConditions(s)!;
  o.holding = c.holding;
  if (c.holding) {
    o.active = true; o.assessment += dt;
    if (o.assessment >= rules.assessmentSeconds && !o.known) { o.known = true; log(s, `Rescue team report: ${o.remaining} survivors still awaiting transfer.`, 'success'); }
    if (o.remaining > 0) {
      o.boarding += dt;
      if (o.boarding >= rules.transferSeconds) { o.boarding -= rules.transferSeconds; o.remaining--; o.rescued++; log(s, `Survivor aboard. ${o.rescued} rescued.`, 'success'); }
    }
    if (o.known && o.remaining === 0) {
      o.diverReturn += dt;
      if (o.diverReturn >= rules.returnSeconds) {
        o.completed = true; o.active = false;
        log(s, o.rescued ? `Rescue team recovered. ${o.rescued} survivors safe aboard.` : 'Rescue search complete. No survivors found. Team recovered.', o.rescued ? 'success' : 'warning');
      }
    }
  } else { o.active = false; o.boarding = 0; o.diverReturn = 0; }
  if (s.time > casualtyDeadline(s) && o.remaining > 0) {
    o.lastCasualty = s.time; o.remaining--; o.dead++;
    if (o.known) log(s, 'A survivor’s signal has stopped. Rescue window is narrowing.', 'warning');
  }
  if (live.site.kind === 'surface' && rules.sinking) {
    const age = s.time - (s.search?.protectedTime ?? 0);
    const sink = rules.sinking;
    live.site.depth = casualtyDepth(age, hash01(s.patrol.seed, 820), sink, bottom(live.site.x, live.site.y, s.environment.chartSeed) - 5);
    if (live.site.depth > sink.lostBelow && o.remaining > 0) { o.dead += o.remaining; o.remaining = 0; log(s, 'The casualty has gone under. No further survivor signals. Recover the rescue team.', 'damage'); }
  }
  return o.completed;
}
