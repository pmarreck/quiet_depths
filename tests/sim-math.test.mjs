import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import * as shared from '../src/sim-math.js';
import {elm, sameResults, seeded} from './sim-harness.mjs';
import {simulationModules} from './sim-modules.mjs';

// The Elm simulation's arithmetic must equal JavaScript's to the last bit,
// signed zeros and NaN included, so its results can match the TypeScript.
const specials = [0, -0, 5e-324, -5e-324, 2.2250738585072014e-308, 1e-300, 0.5, 1, 3, 4, 12, 360, 359.99999999999994, 720, 1e15, 9007199254740993, 1e300, 1.7976931348623157e308, -1, -360, -720, Infinity, -Infinity, NaN];
const same = (actual, expected, label) => {
  assert.equal(actual.length, expected.length);
  const bad = expected.flatMap((value, i) => Object.is(actual[i], value) ? [] : [[i, actual[i], value]]);
  assert.deepEqual(bad.slice(0, 5), [], label + ': ' + bad.length + ' results differ from JavaScript');
};

function corpus(seed, arity, count) {
  const random = seeded(seed), scales = [1e-300, 1e-8, 1, 37, 360, 1500, 1e6, 1e150], cases = [];
  for (const a of specials) for (const b of specials) cases.push(arity === 2 ? [a, b] : [a, b, specials[(cases.length * 7) % specials.length]]);
  for (let i = 0; i < count; i++) cases.push(Array.from({length: arity}, () => {
    const r = random();
    return r < .05 ? 0 : r < .1 ? specials[Math.floor(random() * specials.length)] : (random() - .5) * scales[Math.floor(random() * scales.length)];
  }));
  return cases;
}

test('Elm hypot of two and three values equals Math.hypot bit for bit', async () => {
  const two = corpus(21, 2, 60000), three = corpus(22, 3, 60000);
  same(await elm('math.hypot2', two), two.map(args => Math.hypot(...args)), 'hypot2');
  same(await elm('math.hypot3', three), three.map(args => Math.hypot(...args)), 'hypot3');
});

test('Elm remainder equals the JavaScript % operator bit for bit', async () => {
  const random = seeded(23), cases = corpus(24, 2, 60000);
  for (let i = 0; i < 20000; i++) cases.push([(random() - .5) * 1e5, 360], [(random() - .5) * 720, 360], [random() * 1e6, random() * 10 + 1e-9]);
  same(await elm('math.remainder', cases), cases.map(([x, y]) => x % y), 'remainder');
});

test('Elm exp, expm1, tanh and cbrt equal the TypeScript simulation’s shared versions bit for bit', async () => {
  const random = seeded(25), inputs = [...specials, -746, -745, -40, -20.000001, -20, -19.99, -1e-12, 1e-12, 19.99, 20, 20.000001, 709, 710, 27, -27, 8, 1 / 3];
  for (let i = 0; i < 40000; i++) inputs.push((random() - .5) * [1e-6, 1, 10, 60, 800][i % 5]);
  for (const name of ['exp', 'expm1', 'tanh', 'cbrt'])
    same(await elm('math.' + name, inputs.map(x => [x])), inputs.map(shared[name]), name);
});

// A simulation module that called the built-ins directly would drift from the
// Elm port, so every module the simulation reaches must use the shared ones.
test('the simulation reaches exp, expm1, tanh and cbrt only through the shared module', () => {
  const modules = simulationModules();
  assert.ok(modules.has('coast') && modules.has('systems') && modules.size > 50, 'the walk reaches the whole simulation');
  const direct = [...modules].filter(([name, code]) => name !== 'sim-math' && /Math\.(exp|expm1|tanh|cbrt)\(/.test(code)).map(([name]) => name);
  assert.deepEqual(direct, []);
});

// Whatever moves to Elm must be pure simulation. Display and browser code
// stays in the page, so no module the simulation reaches may touch them.
// Classes and typed arrays are how this codebase keeps render buffers and
// recorders, and Elm has neither, so they count as display code too.
test('the simulation reaches no Three.js, DOM, canvas, browser storage, class or typed array code', () => {
  const modules = simulationModules();
  for (const display of ['sonar-imager', 'stern-spray', 'wake-ribbons', 'instant-replay', 'sea-shading'])
    assert.ok(!modules.has(display), display + ' stays outside the simulation');
  assert.ok(modules.has('sonar-transmitters') && modules.has('replay-events'), 'the simulation halves are reached');
  const display = [...modules].flatMap(([name, code]) =>
    [...code.matchAll(/vendor\/three|\bdocument\.|\bwindow\.|CanvasRenderingContext2D|getContext\(|requestAnimationFrame|localStorage|\bnavigator\.|^\s*(?:export\s+)?class\s|\b(?:Float32|Float64|Int8|Uint8|Uint8Clamped|Int16|Uint16|Int32|Uint32)Array\b/gm)].map(m => name + ': ' + m[0].trim()));
  assert.deepEqual(display, []);
});

test('Elm max, min, abs, sign and clamp follow JavaScript for NaN and signed zeros', async () => {
  const pairs = corpus(26, 2, 20000), singles = pairs.map(([x]) => [x]);
  same(await elm('math.max', pairs), pairs.map(([a, b]) => Math.max(a, b)), 'max');
  same(await elm('math.min', pairs), pairs.map(([a, b]) => Math.min(a, b)), 'min');
  same(await elm('math.abs', singles), singles.map(([x]) => Math.abs(x)), 'abs');
  same(await elm('math.sign', singles), singles.map(([x]) => Math.sign(x)), 'sign');
  const triples = corpus(27, 3, 20000);
  same(await elm('math.clamp', triples), triples.map(([low, high, x]) => Math.max(low, Math.min(high, x))), 'clamp');
});

// Elm's own max, min, abs, clamp and truncate disagree with JavaScript's,
// e ^ x is not Math.exp, and the optimizer compiles x == 0 to !x, which is true
// for NaN. A simulation module must take the Sim.Math versions, qualified, say
// Basics. when it means Elm's on integers, and test zero with M.isZero.
test('Elm simulation modules never use the Basics arithmetic that differs from JavaScript', () => {
  const dir = new URL('../elm/Sim/', import.meta.url), offenders = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.elm') && f !== 'Math.elm')) {
    const code = readFileSync(new URL(file, dir), 'utf8').replace(/\{-[\s\S]*?-\}/g, '').replace(/--.*$/gm, '').replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const m of code.matchAll(/(?<![.\w])(max|min|abs|clamp|truncate)\b|(?<![.\w])e \^|(?:==|\/=)\s*0(?![.\d])/g)) offenders.push(file + ': ' + m[0]);
  }
  assert.deepEqual(offenders, []);
});

test('Elm imul and toInt32 equal Math.imul and x | 0 bit for bit', async () => {
  const random = seeded(28), edges = [0, 1, -1, 2, 0x7fffffff, -0x80000000, 0x80000000, 0xffffffff, 0x9e3779b9, 0x21f0aaad, 0x735a2d97, 65535, 65536, -65536];
  const pairs = edges.flatMap(a => edges.map(b => [a, b]));
  for (let i = 0; i < 20000; i++) pairs.push([Math.floor((random() - .5) * 2 ** 33), Math.floor((random() - .5) * 2 ** 33)]);
  same(await elm('math.imul', pairs), pairs.map(([a, b]) => Math.imul(a, b)), 'imul');
  const values = [...specials, 2 ** 31, 2 ** 31 - 1, -(2 ** 31), -(2 ** 31) - 1, 2 ** 32, 2 ** 32 + 5, -1.5, 1.5, 1e20, -1e20, 2 ** 53 + 2, ...Array.from({length: 20000}, () => (random() - .5) * 2 ** (random() * 70))];
  same(await elm('math.toInt32', values.map(v => [v])), values.map(v => v | 0), 'toInt32');
});

test('Elm reads every string as the UTF-16 code units JavaScript does, unpaired surrogates included', async () => {
  const random = seeded(29), texts = ['', 'kestrel', 'Ünïcode', 'ship 🚢', '🚢', '\ud800', '\udc00', '\ud800lone', 'lone\udfff', 'a\udc00b', '􏿿', '\ud800𐀀', '￿퟿'];
  for (let i = 0; i < 2000; i++) texts.push(String.fromCharCode(...Array.from({length: Math.floor(random() * 12)}, () => random() < .3 ? 0xd800 + Math.floor(random() * 0x800) : Math.floor(random() * 0x10000))));
  sameResults(await elm('text.codeUnits', texts.map(t => [t])), texts.map(t => Array.from({length: t.length}, (_, i) => t.charCodeAt(i))));
});

// Until the game loop switches to Elm, a gameplay change to a ported module
// must be made in both languages. Every TypeScript module the Elm harness
// mirrors says so on its first line, and names its Elm twin, so nobody edits
// one side unawares. The mirrored set comes from the harness itself.
test('every TypeScript module mirrored in Elm says so and names its twin', () => {
  const harness = new URL('../elm/SimHarness/', import.meta.url), prefixes = new Set();
  for (const file of readdirSync(harness).filter(f => f.endsWith('.elm')))
    for (const [, prefix] of readFileSync(new URL(file, harness), 'utf8').matchAll(/\n {8}"([a-zA-Z]+)\.\w+" ->/g)) prefixes.add(prefix);
  // Harness prefixes with no TypeScript module of their own, and the one whose module is named differently.
  const noModule = new Set(['text', 'ship', 'contact', 'sound', 'boat']), renamed = {math: ['sim-math', 'Math']};
  const missing = [];
  for (const prefix of [...prefixes].filter(p => !noModule.has(p))) {
    const [file, elm] = renamed[prefix] ?? [prefix.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), prefix[0].toUpperCase() + prefix.slice(1)];
    const first = readFileSync(new URL(`../typescript/${file}.ts`, import.meta.url), 'utf8').split('\n')[0];
    readFileSync(new URL(`../elm/Sim/${elm}.elm`, import.meta.url));
    if (first !== `// Mirrored in elm/Sim/${elm}.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.`) missing.push(file);
  }
  assert.ok(prefixes.size > 20, 'the harness mirrors the ported modules');
  assert.deepEqual(missing, []);
});

test('Elm writes numbers exactly as JavaScript toFixed does, rounding the binary value half up', async () => {
  const random = seeded(30), values = [0, -0, .5, 1.5, 2.5, -2.5, .15, .25, 1.005, 1.45, -.04, -.05, .0005, .0015, 1e-7, -1e-7, 99.95, 999.9995, 123456.789,
    9e12, -9e12, 1e21, 2e21, -1e21, NaN, Infinity, -Infinity, 1 / 3, 2 / 3, 0.1 + 0.2, 4.35, 8.675, 1.0049999999999999];
  for (let i = 0; i < 20000; i++) {
    const r = random();
    values.push(r < .3 ? Math.round((random() - .5) * 2e6) / [1, 10, 100, 1000, 2000, 8][i % 6] : r < .6 ? (random() - .5) * 10 ** Math.floor(random() * 10) : (Math.floor(random() * 2e5) + .5) / 10 ** (i % 4));
  }
  const cases = values.flatMap(v => [0, 1, 2, 3].map(d => [d, v]));
  // The hardest inputs: within three units in the last place of a half-way point.
  const step = (x, ulps) => {const b = new Float64Array([x]), u = new BigInt64Array(b.buffer); u[0] += BigInt(ulps); return b[0];};
  for (const d of [1, 2, 3]) for (let i = 0; i < 2000; i++) {
    const mid = (Math.floor(random() * 2e5) + .5) / 10 ** d;
    for (let s = -3; s <= 3; s++) cases.push([d, step(mid, s)]);
  }
  sameResults(await elm('text.toFixed', cases), cases.map(([d, v]) => v.toFixed(d)));
});

// Elm compiles <, >, <= and >= to JavaScript's operators only when one side
// is a literal. Between two variables it calls _Utils_cmp, which counts NaN
// as greater, so `a > b` and `a >= b` are true when either is NaN, where
// JavaScript says false. `<` and `<=` keep JavaScript's meaning, so the
// simulation writes `b < a` for `a > b`, and `>` or `>=` only before a literal.
// The one exception is Sim.Math's notLess, which names Elm's `>=` as what it
// is, JavaScript's `!(a < b)`; the test removes exactly that body and no more.
test('Elm simulation modules compare two values only with < and <=, which NaN cannot fool', () => {
  const dir = new URL('../elm/Sim/', import.meta.url), offenders = [], notLess = 'notLess a b =\n    a >= b\n';
  for (const file of readdirSync(dir).filter(f => f.endsWith('.elm'))) {
    let source = readFileSync(new URL(file, dir), 'utf8');
    if (file === 'Math.elm') {
      assert.ok(source.includes(notLess), 'Sim.Math defines notLess as the sanctioned >=');
      source = source.replace(notLess, '');
    }
    const code = source.replace(/\{-[\s\S]*?-\}/g, '').replace(/--.*$/gm, '').replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    for (const m of code.matchAll(/(?<![-|>=<])>=?(?!>)\s+(?!\(?-?\d)(\S+)/g)) offenders.push(`${file}: ${m[0].trim().slice(0, 30)}`);
  }
  assert.deepEqual(offenders, []);
});
