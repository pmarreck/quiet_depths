// Runs the patrol simulation in the Elm worker (elm/SimWorker.elm) while the
// page keeps reading and writing its patrol object as it did with the
// TypeScript simulation. The worker holds the world. Each command sends the
// page's orders, the fields it writes itself, read from its patrol object;
// each reply refreshes that object in place from the world the worker sends
// back, and passes on the replay events and invalid numbers announced. A
// frame comes back tick by tick, so the per-tick hook still sees each tick.
//
// Every call is asynchronous, and one command is in flight at a time: each
// waits for the reply to the one before it. The orders a call carries are
// those the page changed since its previous call, read when it is called and
// sent on top of the orders the worker last reported, so a write the page
// makes after the call applies after it, and a reply never overwrites an
// order the page wrote: each reply is applied, hooks and all, and the
// page's orders not yet applied by the worker are laid back over it. Every
// outcome is therefore the synchronous page's, in the page's own order.
//
// The worker holds one patrol; when the page steps or acts on a different
// patrol object than the one it last created or restored (a save slot
// checked, then the autosave resumed), the adapter first loads that patrol
// into the worker. The worker takes only the orders from the page's patrol
// object; anything else the page writes there would be lost at the next
// reply. `onStray`, when given, hears the names of such fields before each
// command.
import {refreshMirror} from './world-mirror.ts';
import {markReplay, type ReplayEvent} from './replay-events.ts';
import {reportInvalidNumber, type InvalidNumber} from './invalid-numbers.ts';
import {PAGE_FIELDS, restorePageFields} from './page-fields.ts';
import type {StepInput} from './patrol-tick.ts';
import type {World} from './patrol-world.ts';

type Fields = Record<string, unknown>;
type Announced = {replay: {time: number; event: ReplayEvent}[]; invalid: InvalidNumber[]};
export type Reply = Partial<Announced> & {error?: string; world?: Fields | null; ticks?: (Announced & {world: Fields})[]; result?: unknown;
  boat?: string[]; gun?: string[]; drone?: string[]};

// How commands reach the worker and replies come back.
export interface Transport {send(command: unknown): void; listen(listener: (reply: Reply) => void): void}

// The worker's program running on the page itself.
export const portTransport = (app: {ports: {commands: {send(command: unknown): void}; replies: {subscribe(listener: (reply: Reply) => void): void}}}): Transport =>
  ({send: command => app.ports.commands.send(command), listen: listener => app.ports.replies.subscribe(listener)});

// The worker's program in a Web Worker.
export const workerTransport = (worker: {postMessage(message: unknown): void; addEventListener(type: 'message', listener: (event: {data: Reply}) => void): void}): Transport =>
  ({send: command => worker.postMessage(command), listen: listener => worker.addEventListener('message', event => listener(event.data))});

export interface Action {kind: string; [argument: string]: unknown}

// A frame's input: the simulation's, and a hook the page uses to look at the
// patrol just before a step's reply changes it.
export type FrameInput = StepInput & {beforeTicks?: (s: World) => void};

export interface ElmSimulation {
  create(mission: string, seed: number, options?: Fields): Promise<World>;
  restore(raw: string): Promise<World | null>;
  step(s: World, dt: number, input?: FrameInput): Promise<void>;
  act(s: World, action: Action): Promise<unknown>;
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

type Exchange = (command: Fields) => Promise<Reply>;
type Queue = <T>(job: (exchange: Exchange) => Promise<T>) => Promise<T>;

// Runs each job once every earlier one has finished, failed or not; a job
// exchanges commands for replies, one at a time.
function queue(transport: Transport): Queue {
  let waiting: ((reply: Reply) => void) | null = null;
  transport.listen(reply => {
    const deliver = waiting;
    waiting = null;
    if (!deliver) throw new Error('The Elm simulation replied to no command');
    deliver(reply);
  });
  const exchange: Exchange = command => new Promise((resolve, reject) => {
    waiting = reply => { if (reply.error) reject(new Error('The Elm simulation refused a command: ' + reply.error)); else resolve(reply); };
    transport.send(command);
  });
  let tail: Promise<unknown> = Promise.resolve();
  return job => {
    const run = tail.then(() => job(exchange));
    tail = run.catch(() => undefined);
    return run;
  };
}

export async function elmSimulation(transport: Transport, options: Options = {}): Promise<ElmSimulation> {
  const jobs = queue(transport);
  const reply = await jobs(exchange => exchange({kind: 'orderFields'})).catch((e: Error) => ({error: e.message} as Reply));
  if (reply.error || !reply.boat || !reply.gun || !reply.drone) throw new Error('The Elm simulation did not start: ' + (reply.error ?? 'no order fields'));
  return ready(jobs, {boat: reply.boat, gun: reply.gun, drone: reply.drone}, options);
}

// What the adapter knows of one patrol object: the orders the worker last
// reported for it, the orders it will hold once every call so far is applied
// (as comparable keys, so a change on the page shows), each pending call's
// changes in order, and the fields only the simulation changes as the last
// reply left them.
interface Track {base: unknown[]; logged: string[]; unreplied: Map<number, unknown>[]; replied: Map<string, string>}

function ready(jobs: Queue, fields: {boat: string[]; gun: string[]; drone: string[]}, {onStray}: Options): ElmSimulation {
  // Every order's place on the patrol object: on the boat, its gun or its drone.
  const places = [...fields.boat.map(f => [null, f] as const), ...fields.gun.map(f => ['gun', f] as const), ...fields.drone.map(f => ['drone', f] as const)];
  const at = (s: object, [part, f]: readonly [string | null, string]) => {
    const w = s as Fields;
    return part ? (w[part] as Fields | undefined)?.[f] : w[f];
  };
  // The orders, as a command carries them; an undefined order is left out.
  const shaped = (values: unknown[]) => {
    const out: Fields = {gun: {}, drone: {}};
    places.forEach(([part, f], i) => { if (values[i] !== undefined) (part ? out[part] as Fields : out)[f] = values[i]; });
    return out;
  };
  const merged = (base: unknown[], changes: Map<number, unknown>[]) => base.map((v, i) => {
    let value = v;
    for (const c of changes) if (c.has(i)) value = c.get(i);
    return value;
  });
  // The orders on the page's object that differ from what the adapter has logged.
  const changed = (s: World, t: Track) => {
    const out = new Map<number, unknown>();
    places.forEach((p, i) => { const v = at(s, p); if (key(v) !== t.logged[i]) out.set(i, structuredClone(v)); });
    return out;
  };
  // Each field the simulation alone changes, as the last reply left it.
  const simulated = (s: World) => {
    const w = s as unknown as Fields, out = new Map<string, string>();
    if (!onStray) return out;
    for (const [k, v] of Object.entries(w)) {
      if (fields.boat.includes(k) || (PAGE_FIELDS as readonly string[]).includes(k)) continue;
      const own = k === 'gun' ? fields.gun : k === 'drone' ? fields.drone : null;
      out.set(k, key(own && v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([f]) => !own.includes(f))) : v));
    }
    return out;
  };
  const checked = (s: World, t: Track) => {
    if (!onStray) return;
    const now = simulated(s), stray = [...new Set([...now.keys(), ...t.replied.keys()])].filter(k => now.get(k) !== t.replied.get(k));
    if (stray.length) onStray(stray);
  };
  // Every patrol object comes from `create` or `restore`, which track it.
  const tracks = new WeakMap<object, Track>();
  const track = (s: World): Track => {
    const t = tracks.get(s);
    if (!t) throw new Error('The Elm simulation was handed a patrol it did not create or restore');
    return t;
  };
  // Applies a reply's worlds to the page's object in turn, then lays back
  // over the last the page's orders the worker has not yet applied: those of
  // later calls, and those written since the page's last call. `own` is the
  // call's changes, which the reply has applied.
  const landed = (s: World, t: Track, worlds: Fields[], own: Map<number, unknown> | null, before = () => {}, each: (index: number) => void = () => {}) => {
    if (own && t.unreplied[0] === own) t.unreplied.shift();
    const since = changed(s, t);
    before();
    for (const [i, world] of worlds.entries()) { refreshMirror(s, world, PAGE_FIELDS); t.replied = simulated(s); each(i); }
    const last = worlds[worlds.length - 1];
    t.base = last ? places.map(p => structuredClone(at(s, p))) : merged(t.base, own ? [own] : []);
    const later = merged(t.base, t.unreplied);
    t.logged = later.map(key);
    const over = new Map([...t.unreplied.flatMap(c => [...c]), ...since]);
    if (!over.size || !last) return;
    checked(s, t);
    const world: Fields = {...last, gun: {...last.gun as Fields}, drone: {...last.drone as Fields}};
    for (const [i, value] of over) {
      const [part, f] = places[i], into = part ? world[part] as Fields : world;
      if (value === undefined) delete into[f]; else into[f] = structuredClone(value);
    }
    refreshMirror(s, world, PAGE_FIELDS);
    t.replied = simulated(s);
  };
  let held: object | null = null;
  // Loads a patrol the worker does not hold, as the worker last knew it.
  const holding = async (s: World, t: Track, exchange: Exchange) => {
    if (s === held) return;
    const world = {...s, gun: {...s.gun}, drone: {...s.drone}} as Fields;
    places.forEach(([part, f], i) => {
      const into = part ? world[part] as Fields : world;
      if (t.base[i] === undefined) delete into[f]; else into[f] = t.base[i];
    });
    for (const k of PAGE_FIELDS) delete world[k];
    const reply = await exchange({kind: 'load', world: JSON.parse(JSON.stringify(world))});
    landed(s, t, [reply.world as Fields], null);
    held = s;
  };
  // Logs the page's order changes as this call's, then runs `job` in its turn.
  const call = <T>(s: World, job: (exchange: Exchange, t: Track, own: Map<number, unknown>) => Promise<T>): Promise<T> => {
    const t = track(s);
    checked(s, t);
    const own = changed(s, t);
    for (const i of own.keys()) t.logged[i] = key(at(s, places[i]));
    t.unreplied.push(own);
    return jobs(async exchange => {
      try { return await job(exchange, t, own); } catch (e) {
        if (t.unreplied[0] === own) t.unreplied.shift();
        t.logged = merged(t.base, t.unreplied).map(key);
        throw e;
      }
    });
  };
  const orders = (t: Track, own: Map<number, unknown>) => shaped(merged(t.base, [own]));
  const adopt = <T>(world: T): T => {
    if (!world) return world;
    const s = world as unknown as World, orders = places.map(p => structuredClone(at(s, p)));
    tracks.set(s, {base: orders, logged: orders.map(key), unreplied: [], replied: simulated(s)});
    held = s;
    return world;
  };
  const announce = (s: World, {replay = [], invalid = []}: Partial<Announced>) => {
    for (const m of replay) markReplay(s, m.time, m.event);
    for (const p of invalid) reportInvalidNumber(p.where, p.value);
  };
  return {
    create: (mission, seed, options = {}) => jobs(async exchange => {
      const world = (await exchange({kind: 'create', mission, seed, options})).world as Fields;
      return adopt(Object.assign(world, {photoArchive: [], photoSequence: 1}) as unknown as World);
    }),
    restore: raw => jobs(async exchange => {
      let saved: unknown;
      try { saved = JSON.parse(raw); } catch { return null; }
      if (!isRecord(saved) || !restorePageFields(saved)) return null;
      const page = pick(saved, PAGE_FIELDS.filter(k => saved[k] !== undefined)), rest = {...saved};
      for (const k of PAGE_FIELDS) delete rest[k];
      const world = (await exchange({kind: 'restore', save: rest})).world;
      return world ? adopt(Object.assign(world, page) as unknown as World) : null;
    }),
    step: (s, dt, input = {}) => call(s, async (exchange, t, own) => {
      const {afterTick, beforeTicks, ...frame} = input;
      await holding(s, t, exchange);
      const ticks = (await exchange({kind: 'step', orders: orders(t, own), dt, input: defined(frame)})).ticks ?? [];
      landed(s, t, ticks.map(tick => tick.world), own, () => beforeTicks?.(s), i => { announce(s, ticks[i]); afterTick?.(s); });
    }),
    act: (s, action) => call(s, async (exchange, t, own) => {
      await holding(s, t, exchange);
      const done = await exchange({kind: 'act', orders: orders(t, own), action: defined(action)});
      landed(s, t, [done.world as Fields], own);
      announce(s, done);
      return done.result;
    }),
  };
}
