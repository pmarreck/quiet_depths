// Real play, recorded for the replay tests (tests/play-replay.test.mjs):
// every call the page makes to the simulation, with its arguments and the
// orders the page changed on the patrol object since its last call. Orders
// are the only fields of a patrol the page writes, so the calls and the
// orders are everything the page puts into the simulation, and replaying
// them must reach the same worlds.
//
// What the calls gave back is kept apart, as an oracle for each way of
// computing transcendental functions: each call's result and a digest of
// the world after it (after every action and every 30th step). Engines
// differ there: Chromium 158 rounds sin, exp, log and the rest correctly,
// Node 24 does not, and one unit in the last place grows into a different
// patrol (docs/plan_context/simulation-to-elm.md, "Replaying real play").
// The page writes the oracle for its own engine, `addOracle` one for
// another, and a replay is held to the oracle of its own engine's math.
//
// Only the TypeScript simulation records or makes an oracle, so they stay
// the TypeScript's once its simulation is gone. The page records under
// `?record`.
import {PAGE_FIELDS} from './page-fields.ts';
import type {World} from './patrol-world.ts';

export const RECORDING_FORMAT = 'quiet-depths-play/1';

// The fields of a patrol the page writes, which the simulation takes as
// orders: on the boat, its deck gun and its drone. A test holds this equal
// to the Elm worker's own list.
export const ORDER_FIELDS = {
  boat: ['targetSpeed', 'targetDepth', 'targetHeading', 'silent', 'engine', 'dieselMode', 'route', 'scopeAngle', 'scopeSteerBearing', 'towerAngle',
    'towerPitch', 'runSetting', 'imagers', 'repair', 'photoCooldown', 'reconArchivedSequence', 'newYearWatch', 'patrolId'],
  gun: ['angle', 'elevation'],
  drone: ['targetSpeed', 'targetDepth', 'targetHeading', 'nosePitch'],
} as const;

export interface RecordedCall {
  call: string;
  args: unknown[];
  patrol?: number; // the patrol the call acts on, by the order the recording made them
  orders?: Record<string, unknown>; // the orders the page set since its last call on that patrol
  unset?: string[]; // and those it removed
  made?: number; // the patrol a create or restore made
}
// What the calls gave back under one engine's math, by call index: each
// result other than none, each failure's message, and the digests.
export interface Oracle {engine: string; results: Record<number, unknown>; threw: Record<number, string>; digests: Record<number, string>}
export interface Recording {format: string; orderFields: typeof ORDER_FIELDS; calls: RecordedCall[]; oracles: Record<string, Oracle>}
// The page's simulation module, or anything with its functions.
export type Simulation = Record<string, (...args: never[]) => Promise<unknown>>;

type Fields = Record<string, unknown>;

// Each order by name, `gun.angle` for the gun's, with where it lives.
const PLACES: readonly (readonly [string, 'gun' | 'drone' | null, string])[] = [
  ...ORDER_FIELDS.boat.map(f => [f, null, f] as const),
  ...ORDER_FIELDS.gun.map(f => ['gun.' + f, 'gun', f] as const),
  ...ORDER_FIELDS.drone.map(f => ['drone.' + f, 'drone', f] as const),
];
const orderAt = (s: object, part: string | null, f: string): unknown => {
  const w = s as Fields;
  return part ? (w[part] as Fields | undefined)?.[f] : w[f];
};
const MAKERS = new Set(['createGame', 'restore']);

// JSON that keeps every number exactly: -0, NaN and both infinities cross
// as tagged strings, which no field of a world holds.
const TAG = '\u0000';
export const exactJson = (value: unknown): string => JSON.stringify(value, (_, x: unknown) =>
  typeof x === 'number' && (Object.is(x, -0) || !Number.isFinite(x)) ? TAG + (Object.is(x, -0) ? '-0' : String(x)) : x);
export const fromExactJson = (text: string): unknown => JSON.parse(text, (_, x: unknown) =>
  typeof x === 'string' && x.startsWith(TAG) ? Number(x.slice(1)) : x);

// cyrb53: a fast 53-bit string hash, ample for telling worlds apart.
const hash = (text: string): string => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// A digest of a world as both simulations hold it: without the page's own
// fields, keys whose value is undefined or a ship's null tracking (the Elm
// leaves out what is absent), keys in order and every number exact.
export function worldDigest(world: World): string {
  const top = {...world} as Fields;
  for (const k of PAGE_FIELDS) delete top[k];
  if (Array.isArray(top.ships)) top.ships = top.ships.map((ship: Fields) => {
    if (ship?.tracking !== null) return ship;
    const {tracking: _, ...rest} = ship;
    return rest;
  });
  return hash(exactJson(sorted(top)));
}
const sorted = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sorted);
  if (!v || typeof v !== 'object') return v;
  const o = v as Fields;
  return Object.fromEntries(Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => [k, sorted(o[k])]));
};

// Names this engine's transcendental functions by their results on fixed
// arguments: two engines with one fingerprint compute the simulation alike.
export function mathFingerprint(): string {
  const out: number[] = [];
  for (let i = 1; i <= 400; i++) {
    const x = Math.sin(i * 12.9898) * 437.5453, y = i * 0.73 - 150;
    out.push(Math.sin(x), Math.cos(x), Math.tan(x), Math.exp(y / 40), Math.log(Math.abs(x) + 1e-3), Math.atan(x), Math.atan2(x, y),
      Math.asin(Math.sin(x)), Math.acos(Math.cos(x)), Math.cbrt(x), Math.log10(Math.abs(y) + 1), Math.expm1(y / 300), Math.hypot(x, y), Math.pow(Math.abs(x) + 1, y / 100));
  }
  return hash(exactJson(out));
}

// Digests are kept after every action and every 30th step.
const STEP_DIGEST_EVERY = 30;

// Sets a recorded call's orders on the patrol before the call, as the page did.
export function applyOrders(s: World, orders: Record<string, unknown> = {}, unset: string[] = []): void {
  for (const [name, part, f] of PLACES) {
    const target = (part ? (s as unknown as Fields)[part] : s) as Fields;
    if (name in orders) target[f] = structuredClone(orders[name]);
    else if (unset.includes(name)) delete target[f];
  }
}

// Replays a recording's first `until` calls through `sim`, setting each
// call's orders on its patrol first, as the page did. `seen` gets each
// call's index, the call, its result (or undefined if it threw), the
// message it threw, and the world it acted on or made.
export async function replayCalls(recording: Recording, sim: Simulation,
  seen: (i: number, c: RecordedCall, result: unknown, threw: string | undefined, world: World | null) => void = () => {},
  until = recording.calls.length): Promise<World[]> {
  const patrols: World[] = [];
  for (const [i, c] of recording.calls.slice(0, until).entries()) {
    const s = c.patrol === undefined ? null : patrols[c.patrol];
    if (s) applyOrders(s, c.orders, c.unset);
    let result: unknown, threw: string | undefined;
    try { result = await (sim[c.call] as (...a: unknown[]) => Promise<unknown>)(...(s ? [s] : []), ...c.args); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
    if (c.made !== undefined) patrols[c.made] = result as World;
    seen(i, c, result, threw, c.made !== undefined ? result as World : s);
  }
  return patrols;
}

// Fills an oracle with a call's outcome, as a recording keeps it.
function observe(oracle: Oracle, i: number, c: RecordedCall, result: unknown, threw: string | undefined, world: World | null, steps: number) {
  if (threw !== undefined) oracle.threw[i] = threw;
  else if (!MAKERS.has(c.call) && result !== undefined) oracle.results[i] = structuredClone(result);
  else if (MAKERS.has(c.call) && !world) oracle.results[i] = null;
  if (world && (c.call !== 'step' || steps % STEP_DIGEST_EVERY === 0)) oracle.digests[i] = worldDigest(world);
}

// Adds the oracle of this engine's math, replaying the recording through
// `sim`, which must be the TypeScript simulation.
export async function addOracle(recording: Recording, sim: Simulation, engine: string): Promise<Oracle> {
  const oracle: Oracle = {engine, results: {}, threw: {}, digests: {}};
  let steps = 0;
  await replayCalls(recording, sim, (i, c, result, threw, world) => observe(oracle, i, c, result, threw, world, c.call === 'step' ? ++steps : steps));
  recording.oracles[mathFingerprint()] = oracle;
  return oracle;
}

// Where a replay through `sim` first parts from the oracle of this engine's
// math, or null if it never does; undefined if there is no such oracle.
export async function checkReplay(recording: Recording, sim: Simulation): Promise<{i: number; call: string; expected: unknown; got: unknown} | null | undefined> {
  const oracle = recording.oracles[mathFingerprint()];
  if (!oracle) return undefined;
  const replayed: Oracle = {engine: '', results: {}, threw: {}, digests: {}};
  let steps = 0, first: {i: number; call: string; expected: unknown; got: unknown} | null = null;
  await replayCalls(recording, sim, (i, c, result, threw, world) => {
    if (first) return;
    observe(replayed, i, c, result, threw, world, c.call === 'step' ? ++steps : steps);
    for (const part of ['results', 'threw', 'digests'] as const) {
      const expected = oracle[part][i], got = replayed[part][i];
      if (exactJson(expected) !== exactJson(got)) { first = {i, call: c.call + ' ' + part, expected, got}; return; }
    }
  });
  return first;
}

export interface PlayRecorder {
  // Records one call and runs it; `job` is the TypeScript simulation's call.
  call<T>(name: string, s: World | null, args: unknown[], job: () => T): T;
  recording(): Recording;
  text(): string;
  // Downloads the recording, gzipped, from the page.
  save(): Promise<void>;
}

// A save as a recording keeps it: without the page's own fields (the photo
// archive's images, the photo number and the captain's name), which the
// simulation never reads and restore fills in, as for an older save.
function withoutPageFields(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  let save: unknown;
  try { save = JSON.parse(raw); } catch { return raw; }
  if (!save || typeof save !== 'object' || Array.isArray(save)) return raw;
  const kept = {...save} as Fields;
  for (const k of PAGE_FIELDS) delete kept[k];
  return JSON.stringify(kept);
}

// `engine` names the browser and its major version, nothing more.
export function playRecorder(engine: string): PlayRecorder {
  const calls: RecordedCall[] = [], oracle: Oracle = {engine, results: {}, threw: {}, digests: {}};
  const patrols = new WeakMap<object, number>(), logged = new WeakMap<object, (string | undefined)[]>(), fingerprint = mathFingerprint();
  let made = 0, steps = 0;
  const keys = (s: object) => PLACES.map(([, part, f]) => {
    const v = orderAt(s, part, f);
    return v === undefined ? undefined : exactJson(v);
  });
  const recording = (): Recording => ({format: RECORDING_FORMAT, orderFields: ORDER_FIELDS, calls, oracles: {[fingerprint]: oracle}});
  const text = () => exactJson(recording());
  return {
    call<T>(name: string, s: World | null, args: unknown[], job: () => T): T {
      const entry: RecordedCall = {call: name, args: name === 'restore' ? [withoutPageFields(args[0])] : structuredClone(args)}, i = calls.length;
      while (entry.args.length && entry.args.at(-1) === undefined) entry.args.pop();
      if (s) {
        const patrol = patrols.get(s);
        if (patrol === undefined) throw new Error('The play recorder was handed a patrol it did not see made');
        entry.patrol = patrol;
        const before = logged.get(s)!, orders: Record<string, unknown> = {}, unset: string[] = [];
        keys(s).forEach((k, n) => {
          if (k === before[n]) return;
          const [placeName, part, f] = PLACES[n];
          if (k === undefined) unset.push(placeName); else orders[placeName] = structuredClone(orderAt(s, part, f));
        });
        if (Object.keys(orders).length) entry.orders = orders;
        if (unset.length) entry.unset = unset;
      }
      calls.push(entry);
      if (name === 'step') steps++;
      let result: T;
      try { result = job(); } catch (e) {
        observe(oracle, i, entry, undefined, e instanceof Error ? e.message : String(e), s, steps);
        if (s) logged.set(s, keys(s));
        throw e;
      }
      const world = MAKERS.has(name) ? result as unknown as World | null : s;
      if (MAKERS.has(name) && world) { entry.made = made; patrols.set(world, made++); }
      observe(oracle, i, entry, result, undefined, world, steps);
      if (world) logged.set(world, keys(world));
      return result;
    },
    recording,
    text,
    async save() {
      const gzipped = new Blob([text()]).stream().pipeThrough(new CompressionStream('gzip'));
      const url = URL.createObjectURL(await new Response(gzipped).blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `quiet-depths-play-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
  };
}
