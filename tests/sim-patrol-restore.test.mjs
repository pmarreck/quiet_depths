import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createGame, save, restore, step, MISSIONS} from '../src/sim.js';
import {elm, sameResults, exact} from './sim-harness.mjs';
import {writeFileSync} from 'node:fs';
const require_write = list => writeFileSync(process.env.RESTORE_DIFFERING, list.join('\n'));

const PAGE = ['photoArchive', 'photoSequence', 'captain'];
// The patrol as restore leaves it, every number exactly; the page keeps the
// photo archive and the captain's name, and a ship's lost track is null or
// absent alike.
const pageless = s => {
  const w = exact(s);
  for (const key of PAGE) delete w[key];
  for (const ship of w.ships ?? []) if (ship && ship.tracking === null) delete ship.tracking;
  // Restore reads a fix's null velocity or uncertainty as absent (`??`).
  for (const c of w.contacts ?? []) if (c && c.fix) for (const k of ['vx', 'vy', 'positionSigma', 'velocitySigma', 'maneuverSigma']) if (c.fix[k] === null) delete c.fix[k];
  return w;
};
const withoutPage = saved => { const w = structuredClone(saved); for (const key of PAGE) delete w[key]; return w; };
const verdict = saved => { let r = null; try { r = restore(JSON.stringify(saved)); } catch { r = null; } return r ? pageless(r) : null; };

// Saves from every mission, short and long, fresh and after some play.
function saves(frames = [0, 30]) {
  const out = [];
  for (const [n, {id}] of MISSIONS.entries()) for (const longPatrol of [false, true]) {
    const s = createGame(id, 500 + 2 * n + Number(longPatrol), {difficulty: {longPatrol}, weather: n % 3 ? 'storm' : undefined});
    let played = 0;
    for (const target of frames) {
      for (; played < target; played++) step(s, 15, {timeRate: 4, observation: 'scope'});
      out.push({name: id + (longPatrol ? ' long' : '') + ' @' + target, saved: JSON.parse(save(s))});
    }
  }
  return out;
}

test('a current save restores as the TypeScript restores it', async () => {
  const calls = saves([0, 10, 40]).map(({name, saved}) => ({name, input: withoutPage(saved), expected: verdict(saved)}));
  assert.ok(calls.every(c => c.expected), 'every current save restores');
  sameResults(await elm('patrolRestore.restore', calls.map(c => [c.input])), calls.map(c => c.expected));
});

// Restores a batch both ways and names the cases that differ.
async function compare(calls) {
  const actual = await elm('patrolRestore.restore', calls.map(c => [c.input]));
  const differing = calls.filter((c, i) => !isDeepStrictEqual(actual[i], c.expected)).map(c => c.name + ' (TypeScript ' + (c.expected ? 'restores' : 'refuses') + ')');
  if (process.env.RESTORE_DIFFERING) require_write(differing);
  assert.deepEqual(differing.slice(0, 40), [], differing.length + ' of ' + calls.length + ' differ');
  sameResults(actual, calls.map(c => c.expected));
}

const JUNK = [['string', 'x'], ['null', null], ['negative', -1], ['zero', 0], ['object', {}], ['array', []], ['true', true], ['absent', undefined]];
const OPTIONAL = ['convoy', 'battle', 'departure', 'alliedLamp', 'search', 'noisemaker', 'route', 'site', 'operation', 'imagingTime', 'newYearWatch', 'unpoweredSince', 'wavePhase', 'patrolId', 'scopeTravel', 'watchWarnings'];

test('a save with any field missing or of the wrong type is refused or restored as the TypeScript does', async () => {
  const calls = [];
  for (const {name, saved} of saves([0, 30]).filter((_, i) => i % 3 === 0)) {
    for (const key of new Set([...Object.keys(saved), ...OPTIONAL])) if (!PAGE.includes(key)) for (const [label, value] of JUNK) {
      if (value === undefined && !(key in saved)) continue;
      const copy = structuredClone(saved);
      if (value === undefined) delete copy[key]; else copy[key] = value;
      calls.push({name: name + ': ' + key + ' = ' + label, input: withoutPage(copy), expected: verdict(copy)});
    }
  }
  await compare(calls);
});

// Older saves lack fields added since: each migration fills them, sometimes
// from other fields, singly and all at once.
test('an older save is brought up to date as the TypeScript brings it', async () => {
  const calls = [];
  const older = (name, saved, change) => { const copy = structuredClone(saved); change(copy); calls.push({name, input: withoutPage(copy), expected: verdict(copy)}); };
  const PLANT = ['diesel', 'fuelTank', 'batteryBank', 'tubes'];
  const DRONE = ['mode', 'x', 'y', 'depth', 'heading', 'battery', 'hull', 'mobility', 'buoyancy', 'camera', 'nosePitch', 'verticalSpeed', 'speed', 'targetSpeed', 'targetDepth', 'targetHeading',
    'collisionCooldown', 'lowAlarm', 'rangeAlarm', 'lostReason', 'returnStage', 'returnClearance', 'returnHoldSide', 'returnHoldForward', 'repairLimits'];
  for (const {name, saved} of saves([0, 30])) {
    older(name + ': no plant version', saved, c => { delete c.plantVersion; });
    older(name + ': the plant before its new systems', saved, c => { delete c.plantVersion; for (const k of PLANT) { delete c.systems[k]; delete c.repairLimits[k]; } });
    older(name + ': no systems before the plant', saved, c => { delete c.plantVersion; delete c.systems; for (const k of PLANT) delete c.repairLimits[k]; });
    older(name + ': no deck gun', saved, c => { delete c.systems.deckgun; });
    older(name + ': no repair limits', saved, c => { delete c.repairLimits; delete c.drone.repairLimits; });
    for (const k of DRONE) older(name + ': drone without ' + k, saved, c => { delete c.drone[k]; });
    older(name + ': no sailing day', saved, c => { delete c.environment.startDay; });
    older(name + ': a null sailing day', saved, c => { c.environment.startDay = null; });
    older(name + ': no chart seed', saved, c => { delete c.environment.chartSeed; });
    older(name + ': no starting torpedoes', saved, c => { delete c.patrol.startingTorpedoes; });
    older(name + ': no outer hull', saved, c => { delete c.outerHull; });
    older(name + ': no crew watch', saved, c => { delete c.crewQuietUntil; });
    older(name + ': a very old save', saved, c => {
      for (const k of ['environment', 'patrol', 'plantVersion', 'recon', 'reconArchivedSequence', 'imagers', 'wake', 'soundBearings', 'torpedoTracks', 'debrief', 'crewQuietUntil', 'scopeAngle',
        'scopeSteerBearing', 'lightning', 'acoustics', 'nextLightningAt', 'soundSequence', 'shells', 'traffic', 'watchWarnings', 'route', 'outerHull', 'towerAngle', 'towerPitch', 'cavitation',
        'propRpm', 'gunLoudUntil', 'airSupport', 'aircraft', 'gunRounds', 'impacts', 'gun', 'reports', 'runSetting', 'tubeReadyAt', 'weaponSequence', 'search', 'wavePhase']) delete c[k];
      for (const k of PLANT) { delete c.systems[k]; delete c.repairLimits[k]; }
      delete c.systems.deckgun;
      for (const v of c.contacts) if (/^[A-Z]\d+$/.test(v.label)) v.label = 'Sierra ' + (Number(v.label.slice(1)) || 1);
    });
  }
  // An old fleet action's torpedo load, mid-patrol and after it.
  const fleet = JSON.parse(save(createGame('tiebreaker', 7)));
  for (const [torps, status] of [[3, 'patrol'], [2, 'patrol'], [3, 'won'], [4, 'patrol']])
    older('fleet with ' + torps + ' torpedoes, ' + status, fleet, c => { delete c.patrol.startingTorpedoes; c.torps = torps; c.status = status; });
  // Blasts from before their ids, fuses and explosions were saved, and
  // weapon blasts from before torpedo runs.
  const charged = saves([30]).map(s => s.saved).find(s => s.blasts.length) ?? JSON.parse(save(createGame('intercept', 3)));
  const blast = (extra, x = charged.x + 300) => ({x, y: charged.y, depth: 40, delay: 3, age: 0, kind: 'charge', ...extra});
  older('a blast without id or fuse', charged, c => { c.blasts = [{...blast({}), id: undefined, totalDelay: undefined}].map(b => JSON.parse(JSON.stringify(b))); });
  older('an exploded blast without its time', charged, c => { c.blasts = [JSON.parse(JSON.stringify({...blast({age: 2, delay: -2}), exploded: undefined}))]; });
  older('an unexploded weapon blast', charged, c => { c.blasts = [blast({kind: 'weapon', id: 950, totalDelay: 3, exploded: false})]; });
  // Torpedoes in flight from before the crew's quiet watch.
  const fired = JSON.parse(save(createGame('intercept', 4)));
  older('player torpedoes without a crew watch', fired, c => {
    c.time = 200;
    c.projectiles = [{x: c.x + 100, y: c.y, heading: 30, age: 12}, {x: c.x + 300, y: c.y, heading: 30, age: 150, owner: 'player'}];
    delete c.crewQuietUntil;
  });
  // A survey site from before its hull was saved.
  const survey = JSON.parse(save(createGame('survey', 5)));
  older('a site without a hull', survey, c => { delete c.site.hull; });
  assert.ok(calls.filter(c => c.expected).length > calls.length / 2, 'most older saves restore');
  await compare(calls);
});

// Nested fields damaged in turn: every path to depth four, in the first two
// entries of each list, given a value of another type or removed.
test('a save with a nested field missing or of the wrong type is refused or restored as the TypeScript does', async () => {
  const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  const junk = [['string', 'x'], ['null', null], ['object', {}], ['array', []], ['boolean', true], ['number', 7.5], ['absent', undefined]];
  function* paths(v, path = []) {
    if (path.length > 1) yield path;
    if (path.length >= 4) return;
    if (Array.isArray(v)) for (let i = 0; i < Math.min(v.length, 2); i++) yield* paths(v[i], [...path, i]);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) yield* paths(v[k], [...path, k]);
  }
  const get = (o, path) => path.reduce((a, k) => a == null ? undefined : a[k], o);
  const calls = [];
  for (const {name, saved} of saves([0, 30])) for (const path of paths(saved)) {
    if (PAGE.includes(path[0])) continue;
    const original = get(saved, path);
    for (const [label, value] of [...junk, ...(typeOf(original) === 'number' ? [['fraction', original + .5], ['negative', -1 - Math.abs(original)]] : [])]) {
      if (label === typeOf(original)) continue;
      const copy = structuredClone(saved), parent = get(copy, path.slice(0, -1));
      if (value === undefined) delete parent[path.at(-1)]; else parent[path.at(-1)] = value;
      calls.push({name: path.map(p => typeof p === 'number' ? '[]' : p).join('.') + ' = ' + label, input: withoutPage(copy), expected: verdict(copy)});
    }
  }
  // Optional fields a record may carry but these saves lack, added with junk.
  const OPTIONAL_FIELDS = {
    ships: ['military', 'side', 'depth', 'sinkDepth', 'flood', 'disabled', 'playerDamaged', 'neutralHitAt', 'wreckMark', 'lampFix', 'nextSweep', 'incidental', 'roll', 'verticalSpeed', 'fixedWreck',
      'groundedAt', 'clue', 'nextInquiry', 'report', 'tracking', 'patrolSpeed', 'lastAttackAt', 'parley', 'lights', 'blackout', 'pitch', 'noise', 'torpedoDecoys', 'lastTubeSide', 'lastHitLog',
      'directHits', 'settled', 'sunkAt', 'nextCreak', 'collapsed', 'collapsedAt', 'fighterCount'],
    contacts: ['identified', 'name', 'side', 'probableSide', 'kind', 'military', 'method', 'fix', 'lastSweep', 'sweepArea', 'passiveAt', 'passiveBearing', 'passiveX', 'passiveY', 'depthEstimate', 'courseEstimated'],
    acoustics: ['depth', 'altitude', 'heardAt', 'perceived', 'vessel', 'friendly', 'own', 'touched', 'missed', 'warning', 'ownHit', 'droneHit', 'echo'],
    blasts: ['airTime', 'airHeight', 'splashed', 'explodedAt', 'convoyCharge'],
  };
  for (const {name, saved} of saves([30])) for (const [list, keys] of Object.entries(OPTIONAL_FIELDS)) for (const [i, record] of (saved[list] ?? []).slice(0, 2).entries())
    for (const key of keys) if (!(key in record)) for (const [label, value] of [...junk.filter(([l]) => l !== 'absent'), ['fraction', .5], ['negative', -1]]) {
      const copy = structuredClone(saved);
      copy[list][i][key] = value;
      calls.push({name: list + '.[].' + key + ' added = ' + label, input: withoutPage(copy), expected: verdict(copy)});
    }
  await compare(calls);
});
