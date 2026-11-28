// Runs the patrol simulation in the Elm worker (elm/SimWorker.elm) while the
// page keeps reading and writing its patrol object as it did with the
// TypeScript simulation. The worker holds the world. Each command sends the
// page's orders, the fields it writes itself, read from its patrol object;
// each reply refreshes that object in place from the world the worker sends
// back, and passes on the replay events and invalid numbers announced. A
// frame comes back tick by tick, so the per-tick hook still sees each tick.
// The worker answers its first command once the event loop has turned, and
// every later command within `send`, so the simulation is ready after a
// first exchange and synchronous from then on. The worker holds one patrol;
// when the page steps or acts on a different patrol object than the one it
// last created or restored (a save slot checked, then the autosave resumed),
// the adapter first loads that patrol into the worker.
//
// The worker takes only the orders from the page's patrol object; anything
// else the page writes there would be lost at the next reply. `onStray`, when
// given, hears the names of such fields before each command.
import {refreshMirror} from './world-mirror.ts';
import {markReplay, type ReplayEvent} from './replay-events.ts';
import {reportInvalidNumber, type InvalidNumber} from './invalid-numbers.ts';
import {PAGE_FIELDS, restorePageFields} from './page-fields.ts';
import type {StepInput} from './patrol-tick.ts';
import type {World} from './patrol-world.ts';

type Fields = Record<string, unknown>;
type Announced = {replay: {time: number; event: ReplayEvent}[]; invalid: InvalidNumber[]};
type Reply = Partial<Announced> & {error?: string; world?: Fields | null; ticks?: (Announced & {world: Fields})[]; result?: unknown;
  boat?: string[]; gun?: string[]; drone?: string[]};

export interface SimWorker {
  ports: {commands: {send(command: unknown): void}; replies: {subscribe(listener: (reply: Reply) => void): void}};
}

export interface Action {kind: string; [argument: string]: unknown}

export interface ElmSimulation {
  create(mission: string, seed: number, options?: Fields): World;
  restore(raw: string): World | null;
  step(s: World, dt: number, input?: StepInput): void;
  act(s: World, action: Action): unknown;
}

const isRecord = (v: unknown): v is Fields => !!v && typeof v === 'object' && !Array.isArray(v);
// A field left undefined is absent, as JSON would leave it; Elm reads a
// present field as malformed when it is undefined.
const pick = (from: Fields, keys: readonly string[]) => Object.fromEntries(keys.filter(k => from[k] !== undefined).map(k => [k, from[k]]));
const defined = (from: object) => pick(from as Fields, Object.keys(from));

export interface Options {onStray?: (fields: string[]) => void}

// Tells apart every value a reply can hold, -0, NaN and the infinities included.
const key = (v: unknown): string => JSON.stringify(v, (_, x) =>
  typeof x === 'number' && (Object.is(x, -0) || !Number.isFinite(x)) ? '\u0000' + (Object.is(x, -0) ? '-0' : String(x)) : x);

export function elmSimulation(worker: SimWorker, options: Options = {}): Promise<ElmSimulation> {
  return new Promise((resolve, reject) => {
    let started = false;
    worker.ports.replies.subscribe(reply => {
      if (started) return;
      started = true;
      if (reply.error || !reply.boat || !reply.gun || !reply.drone) reject(new Error('The Elm simulation did not start: ' + (reply.error ?? 'no order fields')));
      else resolve(ready(worker, {boat: reply.boat, gun: reply.gun, drone: reply.drone}, options));
    });
    worker.ports.commands.send({kind: 'orderFields'});
  });
}

function ready(worker: SimWorker, fields: {boat: string[]; gun: string[]; drone: string[]}, {onStray}: Options): ElmSimulation {
  let answer: Reply | null = null;
  worker.ports.replies.subscribe(reply => { answer = reply; });
  const call = (command: Fields): Reply => {
    answer = null;
    worker.ports.commands.send(command);
    const reply = answer as Reply | null;
    answer = null;
    if (!reply) throw new Error('The Elm simulation did not answer within the call');
    if (reply.error) throw new Error('The Elm simulation refused a command: ' + reply.error);
    return reply;
  };
  const orders = (s: World) => ({...pick(s as unknown as Fields, fields.boat), gun: pick(s.gun as unknown as Fields, fields.gun), drone: pick(s.drone as unknown as Fields, fields.drone)});
  // Each field the simulation alone changes, as the last reply left it.
  const simulated = (s: World) => {
    const w = s as unknown as Fields, out = new Map<string, string>();
    for (const [k, v] of Object.entries(w)) {
      if (fields.boat.includes(k) || (PAGE_FIELDS as readonly string[]).includes(k)) continue;
      const own = k === 'gun' ? fields.gun : k === 'drone' ? fields.drone : null;
      out.set(k, key(own && v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([f]) => !own.includes(f))) : v));
    }
    return out;
  };
  let replied = new Map<string, string>();
  const settled = (s: World) => { if (onStray) replied = simulated(s); };
  const checked = (s: World) => {
    if (!onStray) return;
    const now = simulated(s), stray = [...new Set([...now.keys(), ...replied.keys()])].filter(k => now.get(k) !== replied.get(k));
    if (stray.length) onStray(stray);
  };
  let held: object | null = null;
  const holding = (s: World) => {
    if (s === held) { checked(s); return; }
    const world = {...s} as Fields;
    for (const k of PAGE_FIELDS) delete world[k];
    refreshMirror(s, call({kind: 'load', world: JSON.parse(JSON.stringify(world))}).world as Fields, PAGE_FIELDS);
    held = s;
    settled(s);
  };
  const adopt = <T>(world: T): T => { if (world) { held = world as object; settled(world as unknown as World); } return world; };
  const announce = (s: World, {replay = [], invalid = []}: Partial<Announced>) => {
    for (const m of replay) markReplay(s, m.time, m.event);
    for (const p of invalid) reportInvalidNumber(p.where, p.value);
  };
  return {
    create(mission, seed, options = {}) {
      const world = call({kind: 'create', mission, seed, options}).world as Fields;
      return adopt(Object.assign(world, {photoArchive: [], photoSequence: 1}) as unknown as World);
    },
    restore(raw) {
      let saved: unknown;
      try { saved = JSON.parse(raw); } catch { return null; }
      if (!isRecord(saved) || !restorePageFields(saved)) return null;
      const page = pick(saved, PAGE_FIELDS.filter(k => saved[k] !== undefined)), rest = {...saved};
      for (const k of PAGE_FIELDS) delete rest[k];
      const world = call({kind: 'restore', save: rest}).world;
      return world ? adopt(Object.assign(world, page) as unknown as World) : null;
    },
    step(s, dt, input = {}) {
      const {afterTick, ...frame} = input;
      holding(s);
      for (const tick of call({kind: 'step', orders: orders(s), dt, input: defined(frame)}).ticks ?? []) {
        refreshMirror(s, tick.world, PAGE_FIELDS);
        settled(s);
        announce(s, tick);
        afterTick?.(s);
      }
    },
    act(s, action) {
      holding(s);
      const done = call({kind: 'act', orders: orders(s), action: defined(action)});
      refreshMirror(s, done.world as Fields, PAGE_FIELDS);
      settled(s);
      announce(s, done);
      return done.result;
    },
  };
}
