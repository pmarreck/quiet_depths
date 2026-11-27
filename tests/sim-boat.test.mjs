import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as plant from '../src/power-plant.js';
import {elm, seeded} from './sim-harness.mjs';

const pick = (random, list) => list[Math.floor(random() * list.length)];

function plants(random) {
  const cases = [], conditions = [0, 19.999, 20, 55, 100], modes = ['charge', 'drive', 'assist'];
  // Every engine and diesel mode across the snorkel depth, fuel, battery and bank limits.
  for (const engine of ['diesel', 'electric']) for (const dieselMode of modes) for (const depth of [0, 1, 3, 5, 14, 14.0001, 60])
    for (const [fuel, battery, bank] of [[0, 50, 100], [10, 0, 100], [10, 50, 100], [10, 100, 100], [10, 99, 100], [10, 98.5, 100], [10, 40, 19.999]])
      for (const [targetSpeed, silent] of [[17, false], [17, true], [4, false], [-4, false], [0, false]])
        cases.push({engine, dieselMode, depth, fuel, battery, targetSpeed, silent, systems: {diesel: 100, fuelTank: 100, batteryBank: bank, engine: 100, propeller: 100}});
  for (let i = 0; i < 3000; i++) cases.push({
    engine: pick(random, ['diesel', 'electric']), dieselMode: pick(random, modes), depth: pick(random, [0, 1, 14, 30]) + random() * 6, fuel: random() < .1 ? 0 : random() * 100,
    battery: random() < .1 ? 0 : random() * 100, targetSpeed: random() * 25 - 6, silent: random() < .3,
    systems: Object.fromEntries(['diesel', 'fuelTank', 'batteryBank', 'engine', 'propeller'].map(k => [k, random() < .3 ? pick(random, conditions) : random() * 100]))
  });
  return cases;
}

test('the Elm power plant matches the TypeScript generator, battery, propulsion and routing', async () => {
  assert.deepEqual((await elm('powerPlant.constants'))[0], {SURFACE_KNOTS: plant.SURFACE_KNOTS, ELECTRIC_KNOTS: plant.ELECTRIC_KNOTS});
  const modes = ['charge', 'drive', 'assist', 'Charge', 'toString', 'constructor', '', 7, null].map(v => [v]);
  assert.deepEqual(await elm('powerPlant.isDieselMode', modes), modes.map(([v]) => plant.isDieselMode(v)));
  const cases = plants(seeded(61)), one = cases.map(s => [s]);
  assert.deepEqual(await elm('powerPlant.generatorOutput', one), cases.map(plant.generatorOutput));
  assert.deepEqual(await elm('powerPlant.batteryOutput', one), cases.map(plant.batteryOutput));
  const expected = cases.map(plant.propulsion);
  assert.ok(expected.some(p => p.assistDrain > 0) && expected.some(p => p.chargeRate > 0), 'the corpus assists and charges');
  assert.deepEqual(await elm('powerPlant.propulsion', one), expected);
  const routed = cases.map((s, i) => [s, expected[i]]), statuses = routed.map(([s, p]) => plant.dieselRoutingStatus(s, p));
  assert.deepEqual([...new Set(statuses)].sort(), ['', 'ASSIST UNAVAILABLE', 'BATTERY ASSIST ACTIVE', 'BATTERY ASSIST READY', 'BATTERY FULL', 'BATTERY OFFLINE', 'CHARGE OFF', 'CHARGING'], 'every routing status appears');
  assert.deepEqual(await elm('powerPlant.dieselRoutingStatus', routed), statuses);
  // NaN conditions read as offline in both, as JavaScript's falsy NaN does.
  const offline = {generator: 1, drive: 1, ahead: 1, astern: 1, chargeRate: 0, assistDrain: 0}, broken = {...cases[0], battery: 50, systems: {...cases[0].systems, batteryBank: NaN}};
  const nan = ['charge', 'assist'].map(dieselMode => [{...broken, dieselMode}, offline]).concat([[broken, {...offline, generator: NaN}]]);
  assert.deepEqual(await elm('powerPlant.dieselRoutingStatus', nan), nan.map(([s, p]) => plant.dieselRoutingStatus(s, p)));
});

test('the Elm throttle lever and energy draw match the TypeScript', async () => {
  const random = seeded(62), levers = [-5, -4, -3.9999, -0, 0, 1, 16.9999, 17, 18, ...Array.from({length: 500}, () => random() * 30 - 8)].map(v => [v]);
  assert.deepEqual(await elm('powerPlant.throttlePercent', levers), levers.map(([v]) => plant.throttlePercent(v)));
  const percents = [-101, -100, -50, -0, 0, 50, 100, 101, ...Array.from({length: 500}, () => random() * 220 - 110)].map(v => [v]);
  assert.deepEqual(await elm('powerPlant.throttleOrder', percents), percents.map(([v]) => plant.throttleOrder(v)));
  const draws = [[0, 0, 0], [-16, 0, 0], [20.5, .12, 0], [20.5, 0, .2], [12, 0, .5], ...Array.from({length: 1000}, () => [random() * 44 - 22, random() * .12, random() * .3])];
  assert.deepEqual(await elm('powerPlant.energyDraw', draws), draws.map(d => plant.energyDraw(...d)));
});

test('the Elm sea surface, hull motion, boat axes and seeded hash match the TypeScript', async () => {
  const motion = await import('../src/surface-motion.js'), random = seeded(63);
  const [constants] = await elm('surfaceMotion.constants');
  assert.deepEqual(constants, {periscopeDepth: motion.periscopeDepth, WAVE_COMPONENTS: motion.WAVE_COMPONENTS.map(w => ({...w}))});
  const sea = () => {
    const s = {waveScale: random() * 2.5, waveSpeed: .4 + random() * 1.2};
    if (random() < .5) s.wavePhase = random() * 900;
    if (random() < .4) s.sampledAt = random() * 600;
    return s;
  };
  const phases = Array.from({length: 600}, () => [random() * 900, sea()]);
  assert.deepEqual(await elm('surfaceMotion.wavePhaseAt', phases), phases.map(([t, s]) => motion.wavePhaseAt(t, s)));
  const heights = Array.from({length: 3000}, () => [(random() - .5) * 20000, (random() - .5) * 20000, random() * 900, sea()]);
  assert.deepEqual(await elm('surfaceMotion.surfaceHeight', heights), heights.map(([x, y, t, s]) => motion.surfaceHeight(x, y, t, s)));
  // Depths across the periscope depth where the sea stops moving the hull.
  const hulls = [];
  for (const depth of [-2, 0, 3, 14.999, 15, 15.001, 40]) for (let i = 0; i < 40; i++)
    hulls.push([{x: (random() - .5) * 8000, y: (random() - .5) * 8000, heading: random() * 360, depth, pitch: (random() - .5) * .2}, sea(), random() * 900]);
  for (let i = 0; i < 2000; i++) hulls.push([{x: (random() - .5) * 8000, y: (random() - .5) * 8000, heading: random() * 360, depth: random() * 18 - 1, pitch: (random() - .5) * .3}, sea(), random() * 900]);
  assert.deepEqual(await elm('surfaceMotion.surfaceMotion', hulls), hulls.map(([b, s, t]) => motion.surfaceMotion(b, s, t)));
  const boat = () => {
    const b = {x: (random() - .5) * 4000, y: (random() - .5) * 4000, heading: random() * 360, depth: random() * 200, pitch: random() < .05 ? NaN : (random() - .5) * .6};
    if (random() < .8) b.roll = random() < .05 ? NaN : (random() - .5) * .8;
    return b;
  };
  const offsets = Array.from({length: 3000}, () => {
    const o = {};
    for (const key of ['side', 'forward', 'down']) if (random() < .8) o[key] = (random() - .5) * 60;
    return [boat(), o];
  });
  assert.deepEqual(await elm('surfaceMotion.boatPoint', offsets), offsets.map(([b, o]) => motion.boatPoint(b, o)));
  const locals = Array.from({length: 3000}, () => [boat(), {x: (random() - .5) * 4000, y: (random() - .5) * 4000, depth: random() * 300}]);
  assert.deepEqual(await elm('surfaceMotion.boatLocal', locals), locals.map(([b, p]) => motion.boatLocal(b, p)));
  const draws = [[0, 0], [1, 0], [-1, 0], [2 ** 31, 7], [2 ** 32 + 3, 7], [-(2 ** 40), 3], [1.5, 2.5], [NaN, 1], [42, -1], [42, 2 ** 31], [42, 1e12]];
  for (let i = 0; i < 20000; i++) draws.push([Math.floor(random() * 2 ** 32), Math.floor(random() * 5000)]);
  same(await elm('surfaceMotion.hash01', draws), draws.map(([seed, n]) => motion.hash01(seed, n)));
});

function same(actual, expected) {
  const differ = expected.flatMap((e, i) => Object.is(e, actual[i]) ? [] : [i]);
  assert.equal(differ.length, 0, `${differ.length} hash results differ, first at ${differ[0]}: ${actual[differ[0]]} vs ${expected[differ[0]]}`);
}
