import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as lamp from '../src/signal-lamp.js';
import {elm, sameResults, seeded} from './sim-harness.mjs';

const progress = m => ({elapsed: m.elapsed, since: m.since, copied: m.copied, delivered: m.delivered, completedAt: m.completedAt});
const sendable = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const word = (random, n) => Array.from({length: n}, () => sendable[Math.floor(random() * sendable.length)]).join('');
const ship = (random, id) => ({id, x: (random() - .5) * 20000, y: (random() - .5) * 20000});

// Telegrams from many senders, and allied fixes from many targets.
function messages(random, n) {
  return Array.from({length: n}, (_, i) => {
    if (i % 3) return lamp.makeTransmission(ship(random, 'c' + i), ship(random, 'wolf'), Math.floor(random() * 2 ** 32), 1 + i % 9, random() * 900);
    const target = {...ship(random, 'u' + i), depth: random() * 200, heading: random() * 360, speed: random() * 14, side: 'hostile', kind: 'sub', hull: 100, name: 'U'};
    return lamp.liveTransmission(lamp.alliedFix({id: 'a' + i}, target, random() * 900, 1 + i % 5));
  });
}

test('Elm Morse scripts match the TypeScript, and unsendable messages have none', async () => {
  const random = seeded(111);
  assert.deepEqual((await elm('signalLamp.constants'))[0], {dotSeconds: lamp.dotSeconds});
  const texts = ['SOS', 'E', 'T', sendable, 'SUB NE 12 KM', 'E123 N456 D80 C270 K12', ...Array.from({length: 300}, (_, i) => Array.from({length: 1 + i % 4}, () => word(random, 1 + Math.floor(random() * 6))).join(' ')),
    '', ' A', 'A ', 'A  B', 'a', 'A-B', 'Ä', '\ud800', 'A\nB'];
  const expected = texts.map(t => {try {return lamp.morseScript(t);} catch {return null;}});
  assert.equal(expected.filter(s => s === null).length, 9, 'the unsendable messages are refused');
  sameResults(await elm('signalLamp.morseScript', texts.map(t => [t])), expected);
});

test('Elm telegrams, allied fixes and lamp ranges match the TypeScript', async () => {
  const random = seeded(112), calls = [];
  for (let i = 0; i < 3000; i++) {
    const sender = ship(random, 'c' + i), hunter = i % 50 ? ship(random, 'wolf') : {x: sender.x, y: sender.y};
    calls.push([sender, hunter, Math.floor(random() * 2 ** 32), 1 + Math.floor(random() * 40), random() * 900]);
  }
  const telegrams = calls.map(c => lamp.makeTransmission(...c));
  assert.equal(new Set(telegrams.map(t => t.estimate.text.split(' ')[1])).size, 8, 'every compass point is sent');
  sameResults(await elm('signalLamp.makeTransmission', calls), telegrams);
  const fixes = [];
  for (let i = 0; i < 2000; i++) fixes.push([{id: 'a' + i}, {id: 'u' + i, ...ship(random, ''), depth: random() * 300, heading: random() * 360, speed: random() * 20}, random() * 900, 1 + i]);
  // Rounding at halves, a coordinate that rounds to -0, and headings either side of north.
  for (const [x, depth, heading, speed] of [[-3, -.3, 359.6, 2.5], [-5, 2.5, -10, -2.5], [15, 0, 359.4, 0], [-25, 120.5, -0.4, 13.49], [123456, 79.5, 720.2, 7]])
    fixes.push([{id: 'a'}, {id: 'u', x, y: -x, depth, heading, speed}, 10, 3]);
  const allied = fixes.map(f => lamp.alliedFix(...f));
  assert.ok(allied.some(f => Object.is(f.depth, -0)) && allied.some(f => f.text.startsWith('W')), 'signed zeroes and western fixes are spelled');
  sameResults(await elm('signalLamp.alliedFix', fixes), allied);
  sameResults(await elm('signalLamp.liveTransmission', allied.map(f => [f])), allied.map(lamp.liveTransmission));
  const skies = Array.from({length: 500}, () => [{daylight: random(), twilight: random(), storm: random(), rain: random(), fog: random() * .9}]);
  sameResults(await elm('signalLamp.lampRange', skies), skies.map(([e]) => lamp.lampRange(e)));
});

test('Elm lamps flash and are copied letter by letter as the TypeScript does', async () => {
  const random = seeded(113), lit = [], steps = [], percents = [];
  for (const m of messages(random, 240)) {
    for (let i = 0; i < 160; i++) {
      lit.push([structuredClone(m)]);
      percents.push([structuredClone(m)]);
      const seconds = [1 / 60, .25, 1, 3, .07][i % 5], inView = random() < (i < 120 ? .9 : .3);
      steps.push([structuredClone(m), seconds, inView]);
      lamp.copyLamp(m, seconds, inView);
    }
  }
  // Steps ending exactly on a letter's last element, where dividing by the dot
  // length can land a hair short of it, and watches beginning a hair after a
  // letter starts: both still copy the letter.
  for (const m of messages(random, 12)) for (const letter of lamp.morseScript(m.estimate.text).letters) {
    steps.push([{...structuredClone(m), elapsed: 0, since: 0}, letter.end * lamp.dotSeconds, true]);
    steps.push([{...structuredClone(m), elapsed: letter.start * lamp.dotSeconds + 5e-10, since: null}, (letter.end - letter.start) * lamp.dotSeconds, true]);
  }
  // An undelivered message carrying a completion time keeps it.
  for (const m of messages(random, 6)) steps.push([{...structuredClone(m), completedAt: 1}, .25, true]);
  // Starting exactly on a mark's edges.
  const sos = lamp.makeTransmission({id: 's', x: 0, y: 0}, {x: 0, y: 5000}, 1, 1, 0), script = lamp.morseScript(sos.estimate.text);
  for (const mark of script.marks.slice(0, 6)) for (const edge of [mark.start, mark.end]) lit.push([{...sos, elapsed: edge * lamp.dotSeconds}]);
  const expectedLit = lit.map(([m]) => lamp.lampLit(m));
  assert.ok(expectedLit.filter(Boolean).length > 1000 && expectedLit.filter(l => !l).length > 1000, 'lamps flash on and off');
  sameResults(await elm('signalLamp.lampLit', lit), expectedLit);
  const expected = steps.map(([m, seconds, inView]) => {const c = structuredClone(m), delivered = lamp.copyLamp(c, seconds, inView); return {delivered, message: progress(c)};});
  assert.ok(expected.filter(r => r.delivered).length > 60 && expected.some(r => !r.delivered && r.message.copied > 0), 'messages are delivered and partly copied');
  sameResults(await elm('signalLamp.copyLamp', steps), expected);
  sameResults(await elm('signalLamp.copyPercent', percents), percents.map(([m]) => lamp.copyPercent(m)));
});

test('Elm telegram regions and bearing matches agree with the TypeScript', async () => {
  const random = seeded(114), radii = [], matches = [];
  for (let i = 0; i < 400; i++) {const p = messages(random, 1)[0].estimate; radii.push([p, p.time + [0, 500, 999.99, 1000, 4000, -5][i % 6]]);}
  sameResults(await elm('signalLamp.reportRadius', radii), radii.map(([p, t]) => lamp.reportRadius(p, t)));
  for (let i = 0; i < 3000; i++) {
    const p = messages(random, 1)[0].estimate, time = p.time + random() * 600, observer = {x: p.x + (random() - .5) * 30000, y: p.y + (random() - .5) * 30000};
    const contacts = Array.from({length: i % 5}, (_, j) => {
      const c = {id: 'k' + j, identified: random() < .3};
      if (random() < .9) c.passiveAt = time - [0, 18, 18.01, random() * 30][j % 4];
      if (random() < .9) {
        const truth = Math.atan2(p.x - observer.x, p.y - observer.y) * 180 / Math.PI;
        c.passiveBearing = (truth + (random() - .5) * [4, 30, 200][j % 3] + 360) % 360;
      }
      if (random() < .2) {c.passiveX = observer.x + (random() - .5) * 2000; c.passiveY = observer.y + (random() - .5) * 2000;}
      if (random() < .3) c.kind = random() < .5 ? 'sub' : 'escort';
      if (random() < .2) c.side = random() < .5 ? 'friendly' : 'hostile';
      return c;
    });
    matches.push([i % 40 ? p : null, observer, time, contacts]);
  }
  // Listening from inside the region, and from exactly its edge.
  for (const y of [500, 800]) matches.push([{x: 0, y: 0, radius: 800, time: 0}, {x: 0, y}, 0, [{id: 'edge', passiveAt: 0, passiveBearing: 180, identified: false}]]);
  const expected = matches.map(args => lamp.matchingBearing(...args) ?? null);
  assert.ok(expected.filter(id => id !== null).length > 300 && expected.filter(id => id === null).length > 300, 'bearings match and miss');
  sameResults(await elm('signalLamp.matchingBearing', matches), expected);
});

test('Elm accepts and rejects saved telegrams, copies and fixes as the TypeScript does', async () => {
  const random = seeded(115), estimates = [], copies = [], fixes = [];
  for (const m of messages(random, 300)) {
    for (let i = 0; i < 30; i++) lamp.copyLamp(m, random() * 4, random() < .85);
    const time = m.elapsed + random() * 50, full = (1 << lamp.morseScript(m.estimate.text).letters.length) - 1;
    const variants = [{}, {elapsed: time + .0011}, {elapsed: time + .0009}, {elapsed: -1}, {since: m.elapsed + 1}, {since: -0.5}, {copied: m.copied | 1 << 30}, {copied: -1},
      {delivered: !m.delivered}, {completedAt: null}, {completedAt: m.elapsed}, {completedAt: m.elapsed + 1}, {since: null}, {since: m.elapsed},
      {copied: full + 1, delivered: false, completedAt: null}];
    for (const v of variants) copies.push([{...structuredClone(m), ...v}, time]);
    if (m.estimate.target === undefined) {
      for (const v of [{}, {radius: 0}, {time: -1}, {time: time + 1}, {number: 0}, {number: 1.5}, {number: 2 ** 53}, {x: NaN}, {y: Infinity},
        {text: 'SUB X 1 KM'}, {text: 'SUB N 0 KM'}, {text: 'SUB N 012 KM'}, {text: 'SUB N 123456 KM'}, {text: 'SUB NW 99999 KM'}, {text: 'SUB N 1 KM '}])
        estimates.push([{...m.estimate, ...v}, time]);
    } else {
      for (const v of [{}, {text: 'E123456 N1 D1 C1 K1'}, {text: 'E1 N1 D1 C1 K123'}, {text: 'X1 N1 D1 C1 K1'}, {text: 'E1 N1 D1 C1'}, {course: 360}, {course: -1}, {depth: -1}, {speed: -0.5},
        {radius: 9}, {number: 0}, {number: 2 ** 53 - 1}, {time: time + 1}, {x: NaN}])
        fixes.push([{...m.estimate, ...v}, time]);
    }
  }
  const verdicts = (rows, f) => rows.map(([p, t]) => f(p, t));
  const estimateVerdicts = verdicts(estimates, lamp.validEstimate), copyVerdicts = verdicts(copies, lamp.validCopy), fixVerdicts = verdicts(fixes, lamp.validLampFix);
  for (const [name, v] of [['estimates', estimateVerdicts], ['copies', copyVerdicts], ['fixes', fixVerdicts]]) assert.ok(v.some(Boolean) && v.some(x => !x), name + ' are accepted and rejected');
  sameResults(await elm('signalLamp.validEstimate', estimates), estimateVerdicts);
  sameResults(await elm('signalLamp.validCopy', copies), copyVerdicts);
  const telegrams = copies.filter(([m]) => m.estimate.target === undefined);
  sameResults(await elm('signalLamp.validTransmission', telegrams), verdicts(telegrams, lamp.validTransmission));
  sameResults(await elm('signalLamp.validLampFix', fixes), fixVerdicts);
});
