// What the interface shows and asks about a patrol's mission: the objective panel,
// the patrol seed a player types, and the setup that replays a patrol. These read the
// simulation but are not part of it, so they stay out of its Elm port.
import {carrierId} from './carrier.ts';
import {convoyLosses} from './convoy-watch.ts';
import {distance} from './mechanics.ts';
import {TIMES} from './environment.ts';
import {MISSIONS, type Patrol} from './missions.ts';
import {operationConditions, rescueCriteria} from './operation.ts';
import {surveyCriteria} from './wreck-survey.ts';
import {slice} from './world-slice.ts';

export function patrolSetup(state: Patrol) {
  const env = state.environment;
  const timeOfDay = (Object.keys(TIMES) as (keyof typeof TIMES)[]).find(key => TIMES[key].hour === env.startHour);
  return {mission: state.mission, seed: state.patrol.seed, options: {
    timeOfDay: timeOfDay ?? 'random', weather: env.startWeather, changing: env.changing, difficulty: {...state.difficulty},
  }};
}

export function parsePatrolSeed(text: string): number | null | undefined {
  const digits = text.trim();
  if (digits === '') return null;
  if (!/^[0-9]{1,10}$/.test(digits)) return undefined;
  const seed = Number(digits);
  return seed <= 0xffffffff ? seed : undefined;
}

export function objectiveState(s: Patrol) {
  if (s.convoy) return {label: 'PROTECT THE CONVOY', text: 'Sink the hunter. Further convoy losses: ' + convoyLosses(slice(s)) + '/2.', progress: '', advice: ''};
  if (s.site && s.search && !s.search.located)
    return {label: 'FIND THE MISSION SITE', text: 'Search the last reported area.', progress: '', advice: 'Look for the casualty or wreck. A close sonar ping can resolve the site.'};
  if (s.mission === 'tiebreaker') return {label: s.phase === 'extract' ? 'EXTRACTION OPEN' : 'TURN THE TIDE',
    text: s.phase === 'extract' ? 'Stay to assist or surface at extraction.' : 'Put the friendly fleet two vessels ahead. Your sub is excluded.', progress: s.phase === 'extract' ? 'CLEARED' : '', advice: ''};
  if (s.mission === 'big-kahuna') return {label: 'BIG KAHUNA', text: 'Sink fleet carrier Solstice and return to extraction',
    progress: s.ships.find(v => v.id === carrierId)?.wreckMark ? 'WRECK MARKED' : '', advice: ''};
  if (s.mission === 'sneaky-seamen') return {label: 'GATE A → GATE B', text: 'Reach Gate B at any depth', progress: (distance(s, s.home) / 1000).toFixed(1) + ' km', advice: 'The convoy is expecting you.'};
  if (s.mission === 'seek-and-destroy-sub') return {label: 'HUNT OR WITHDRAW', text: 'Surface at extraction to survive the patrol', progress: s.ships.filter(ship => ship.wreckMark).length + ' WRECK SITES', advice: ''};
  if (s.mission === 'seek-and-destroy') return {label: 'SINK THE CONVOY', text: 'Find and sink the military transports', progress: s.ships.filter(ship => ship.wreckMark).length + ' WRECK SITES', advice: ''};
  if (s.operation) {
    const o = s.operation, c = operationConditions(s)!, r = rescueCriteria(s);
    if (s.mission === 'survey') {
      const camera = s.difficulty?.drone !== false && s.drone.mode !== 'lost', v = surveyCriteria;
      const tally = Math.floor(o.scan) + '/' + v.scanSeconds, prefix = o.active ? 'Scanning. ' : s.drone.mode === 'lost' ? 'ROV lost. ' : '';
      return {label: 'SURVEY THE WRECK', text: tally + ' s scan' + (camera ? ' · ' + o.photoAngles.length + '/' + v.photographs + ' camera angles' : ''), progress: tally,
        advice: o.find || prefix + `Your sub scans automatically at ${v.slowestKnots}–${v.fastestKnots} kn, within ${v.horizontalRange} m horizontally and ${v.verticalRange} m vertically. Slow passes add up.`};
    }
    return {label: s.site!.kind === 'surface' ? 'RECOVER SURVIVORS' : 'DIVER RESCUE', text: `${o.rescued} aboard · ${o.known ? o.remaining : '?'} awaiting rescue`,
      progress: o.rescued + '/' + (o.known ? o.rescued + o.remaining : '?'),
      advice: o.completed ? `${o.rescued} survivors and the rescue team aboard. Surface at extraction.`
        : c.holding ? (o.known ? `Hold position. Transfers every ${r.transferSeconds} seconds.` : 'Hold position. Rescue team assessing the casualty…')
        : `Hold ${r.closestRange}–${r.farthestRange} m away · depth ${c.depth.toFixed(0)} m ±${r.depthTolerance} · ≤${r.fastestKnots} kn`};
  }
  return {label: s.mission === 'recon' ? 'PHOTOGRAPH THE CONVOY' : s.mission === 'intercept' ? 'INTERCEPT ' + (s.ships.find(v => v.id === 'cobalt')?.name || 'MILITARY FREIGHTER').toUpperCase() : 'LISTEN WITHOUT BEING SEEN',
    text: s.mission === 'recon' ? `Photograph ${s.patrol.photoGoal} different merchant ships` : s.mission === 'shadow' ? `Track quietly for ${s.patrol.trackGoal} seconds` : MISSIONS.find(m => m.id === s.mission)!.short,
    progress: s.mission === 'recon' ? s.photos.length + '/' + s.patrol.photoGoal : s.mission === 'shadow' ? Math.min(s.patrol.trackGoal, Math.floor(s.trackTime)) + '/' + s.patrol.trackGoal : '0/1', advice: ''};
}
