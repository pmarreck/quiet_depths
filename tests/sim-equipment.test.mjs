import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as ts from '../src/equipment.js';
import {elm, sameResults, seeded} from './sim-harness.mjs';

// Every input is compared with the TypeScript it replaces. The edge values
// sit on each rule's boundaries; the random ones cover the space between.
const edges = [-5, -0, 0, 0.001, 19.999, 20, 20.001, 50, 99.999, 100, 120, NaN];

test('the Elm equipment list, names and compartments are the TypeScript ones, in order', async () => {
  const [systems] = await elm('equipment.systems');
  assert.deepEqual(systems, ts.SYSTEM_KEYS);
  const [names] = await elm('equipment.systemName');
  assert.deepEqual(names, ts.SYSTEM_NAMES);
  const [sections] = await elm('equipment.compartment');
  const fromHits = Object.fromEntries(ts.SYSTEM_KEYS.map(key => [key, ['bow', 'midships', 'stern'].find(section =>
    Array.from({length: 1000}, (_, i) => ts.hitSystem(section, i / 1250)).includes(key))]));
  assert.deepEqual(sections, fromHits, 'each system sits in the section whose local hits reach it');
});

test('the Elm operating fraction matches the TypeScript at and between its 20% threshold', async () => {
  const random = seeded(1), inputs = [...edges, ...Array.from({length: 400}, () => random() * 120 - 10)];
  sameResults(await elm('equipment.operatingFraction', inputs.map(x => [x])), inputs.map(ts.operatingFraction));
});

test('Elm damage and repair change a part exactly as the TypeScript does', async () => {
  const random = seeded(2), cases = [];
  for (const condition of edges) for (const limit of [0, 40, 85, 100]) for (const amount of [-1, 0, 0.5, 19.999, 20, 150, NaN, Infinity])
    cases.push([amount, {condition, limit}]);
  for (let i = 0; i < 600; i++) cases.push([random() * 60 - 5, {condition: random() * 100, limit: random() * 100}]);
  const damaged = cases.map(([amount, part]) => {
    const parts = {p: part.condition}, limits = {p: part.limit};
    ts.damagePart(parts, limits, 'p', amount);
    return {condition: parts.p, limit: limits.p};
  });
  sameResults(await elm('equipment.damage', cases), damaged);
  const repaired = cases.map(([amount, part]) => ({condition: ts.repairPart(part.condition, part.limit, amount), limit: part.limit}));
  sameResults(await elm('equipment.repair', cases), repaired);
});

test('the Elm condition label reads exactly as the TypeScript one', async () => {
  const random = seeded(3), cases = [];
  for (const condition of [0, 0.4, 5, 19.99, 20, 64.5, 100]) for (const limit of [0, 61.4125, 72.25, 85, 99.999, 100]) for (const offline of [true, false])
    cases.push([offline, {condition, limit}]);
  for (let i = 0; i < 300; i++) cases.push([random() < .5, {condition: random() * 100, limit: random() * 100}]);
  sameResults(await elm('equipment.conditionLabel', cases), cases.map(([offline, p]) => ts.conditionLabel(p.condition, p.limit, offline)));
});

test('Elm hit location picks the same section and system as the TypeScript', async () => {
  const random = seeded(4), hits = [];
  for (let i = 0; i < 1500; i++) {
    const boat = {x: random() * 2000 - 1000, y: random() * 2000 - 1000, heading: random() * 360};
    const range = random() < .3 ? random() * 40 : random() * 900, angle = random() * Math.PI * 2;
    hits.push([boat, {x: boat.x + Math.sin(angle) * range, y: boat.y + Math.cos(angle) * range}]);
  }
  hits.push([{x: 0, y: 0, heading: 0}, {x: 0, y: 0}], [{x: 0, y: 0, heading: 90}, {x: 30 * 0.34, y: 0}]);
  sameResults(await elm('equipment.hitSection', hits), hits.map(([boat, hit]) => ts.hitSection(boat, hit)));
  const rolls = [];
  for (const section of [null, 'bow', 'midships', 'stern']) {
    for (const roll of [0, 0.25, 0.5, 0.79999, 0.8, 0.80001, 0.99999]) rolls.push([section, roll]);
    for (let i = 0; i < 200; i++) rolls.push([section, random()]);
  }
  sameResults(await elm('equipment.hitSystem', rolls), rolls.map(([section, roll]) => ts.hitSystem(section, roll)));
});

test('the harness reports a function it does not know instead of answering', async () => {
  await assert.rejects(elm('equipment.nothing'), /unknown function equipment\.nothing/);
});
