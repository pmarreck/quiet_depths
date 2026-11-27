import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as calendar from '../src/patrol-calendar.js';
import {chartDepth, shelfOutcrops} from '../src/coast.js';
import {elm, seeded} from './sim-harness.mjs';

test('the Elm patrol calendar gives the TypeScript dates, holidays and moon', async () => {
  const random = seeded(71);
  assert.deepEqual((await elm('patrolCalendar.constants'))[0], {DAY_SECONDS: calendar.DAY_SECONDS});
  const seeds = [0, 1, -1, 2 ** 31, 1.5, ...Array.from({length: 2000}, () => Math.floor(random() * 2 ** 32))].map(s => [s]);
  assert.deepEqual(await elm('patrolCalendar.sailingDay', seeds), seeds.map(([s]) => calendar.sailingDay(s)));
  // Days before, inside and after NASA's table of phases.
  const days = [-30, -14.2, 0, .5, 59, 59.99, 365, 391.3, 395, 500, ...Array.from({length: 3000}, () => random() * 420 - 20)].map(d => [d]);
  assert.deepEqual(await elm('patrolCalendar.moonCycle', days), days.map(([d]) => calendar.moonCycle(d)));
  // Year ends, Christmas, leap days, the century boundaries of the
  // Gregorian 400-year cycle (1900, 2000, 2100 to 2400) and dates before the epoch.
  const starts = [];
  for (const day of [0, 58, 59, 60, 358, 359, 365, 366, 730, 10285, 10286, 10287, 46810, 46811, 83334, 83335, 119857, 119858, 156382, 156383,
    -26239, -26238, -1, -366, -730, -800000, 800000])
    for (const hour of [0, 12, 23.99]) for (const time of [0, 1439, 1440, 2879.99, 2880]) starts.push([day, hour, time]);
  for (let i = 0; i < 3000; i++) starts.push([Math.floor(random() * 366), random() * 24, random() * 2880 * 40]);
  const expected = starts.map(([d, h, t]) => calendar.patrolCalendar(d, h, t));
  assert.ok(expected.some(e => e.holiday === 'christmas') && expected.some(e => e.holiday === 'new-year'), 'both holidays appear');
  assert.ok(expected.some(e => e.date.endsWith('FEB 2000')) && expected.some(e => e.date === '29 FEB 1972'), 'leap days appear');
  assert.deepEqual(await elm('patrolCalendar.patrolCalendar', starts), expected);
});

test('the Elm chart gives the TypeScript depths on the shelf, among the islands and at the shore', async () => {
  const random = seeded(72), points = [];
  for (const seed of [null, 7, 12345, 2 ** 31 + 9]) {
    // The surveyed shelf's edges, where the seeded coast begins to blend in.
    for (const x of [-4500.0001, -4500, -4499.999, 0, 4499.999, 4500, 7300, 7300.001]) for (const y of [-4500.001, -4500, -4499.999, 0, 5599.999, 5600, 8200.001])
      points.push([x, y, seed]);
  }
  // Seed 55 is one whose mainland shore reaches the shelf's northern edge.
  for (const y of [5599.999, 5600, 5600.001]) points.push([4000, y, 55]);
  for (let i = 0; i < 12000; i++) points.push([(random() - .5) * 50000, (random() - .5) * 50000, i % 10 === 0 ? null : Math.floor(random() * 2 ** 32)]);
  // Dense samples where the island chains lie, for a few seeds.
  for (const seed of [3, 99, 4242]) for (let i = 0; i < 3000; i++) points.push([(random() < .5 ? -1 : 1) * (9000 + random() * 14000), (random() - .5) * 30000, seed]);
  const expected = points.map(([x, y, seed]) => chartDepth(x, y, seed ?? undefined));
  assert.ok(expected.some(d => d < 0) && expected.some(d => d === -360), 'the corpus reaches islands above water and the depth floor');
  assert.deepEqual(await elm('coast.chartDepth', points), expected);
  const sites = Array.from({length: 300}, () => [{x: (random() - .5) * 8000, y: (random() - .5) * 8000}, Math.floor(random() * 2 ** 32)]);
  assert.deepEqual(await elm('coast.shelfOutcrops', sites), sites.map(([site, seed]) => shelfOutcrops(site, seed)));
});
