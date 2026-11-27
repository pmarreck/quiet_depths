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
