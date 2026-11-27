// Mirrored in elm/Sim/Equipment.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
// Condition and repair limits are independent. A light hit may leave more
// working equipment intact than the crew could rebuild after a later hit.
export const SYSTEM_NAMES = {
  diesel: 'DIESEL GENERATOR', fuelTank: 'FUEL TANK / FEED', batteryBank: 'BATTERY BANK',
  tubes: 'BOW TUBES', engine: 'ELECTRIC DRIVE MOTOR', propeller: 'PROPELLER', oxygen: 'AIR / SCRUBBERS',
  ballast: 'BALLAST', planes: 'DIVE PLANES', rudder: 'RUDDER', sonar: 'SONAR',
  periscope: 'PERISCOPE', deckgun: 'DECK GUN', crew: 'REPAIR CREW',
} as const;

export const SYSTEM_KEYS = Object.keys(SYSTEM_NAMES) as (keyof typeof SYSTEM_NAMES)[];
export const BOAT_PARTS = ['hull', ...SYSTEM_KEYS] as const;
export const DRONE_HIT_FACTORS = {hull: 1, mobility: .8, buoyancy: .7, camera: .95} as const;
export const DRONE_PARTS = Object.keys(DRONE_HIT_FACTORS) as (keyof typeof DRONE_HIT_FACTORS)[];

export const operatingFraction = (condition: number) => condition >= 20 ? condition / 100 : 0;

export function fullCondition<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map(key => [key, 100])) as Record<K, number>;
}

export function damagePart<K extends string>(
  parts: Record<K, number>, limits: Record<K, number>, key: K, amount: number,
) {
  if (!Number.isFinite(amount) || amount <= 0 || parts[key] <= 0) return;
  parts[key] = Math.max(0, parts[key] - amount);
  limits[key] = parts[key] === 0 ? 0 : limits[key] * .85;
}

export function repairPart(current: number, limit: number, amount: number) {
  if (current <= 0 || current >= limit) return current;
  return Math.min(limit, current + amount);
}

// Older patrols have no hit history. Preserve surviving equipment as saved and
// begin counting its repair-limit losses with the next hit.
export function readLimits<K extends string>(
  keys: readonly K[], parts: Record<K, number>, saved: unknown,
): Record<K, number> | null {
  const valid = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  if (saved !== undefined && (!saved || typeof saved !== 'object' || Array.isArray(saved))) return null;
  const limits = fullCondition(keys);
  for (const key of keys) {
    if (!valid(parts[key])) return null;
    const value = saved === undefined ? 100 : (saved as Record<K, unknown>)[key];
    if (!valid(value)) return null;
    limits[key] = parts[key] === 0 ? 0 : value;
  }
  return limits;
}

export function conditionLabel(current: number, limit: number, offlineBelow20 = true) {
  if (current === 0) return 'DESTROYED';
  const flag = current < 20 && offlineBelow20 ? ' · OFFLINE' : '';
  const ceiling = limit < 100 ? ' · MAX REPAIR ' + (Math.floor(limit*100)/100) + '%' : '';
  return Math.floor(current) + '%' + flag + ceiling;
}

type Section = 'bow' | 'midships' | 'stern';
type System = keyof typeof SYSTEM_NAMES;
// Fictional board-game compartments. A shock can also damage equipment elsewhere.
const compartments: Record<System, Section> = {
  tubes:'bow', deckgun:'bow', crew:'bow', ballast:'midships', oxygen:'midships',
  periscope:'midships', sonar:'midships', batteryBank:'midships', diesel:'stern',
  fuelTank:'stern', engine:'stern', propeller:'stern', rudder:'stern', planes:'stern',
};
const sections = Object.fromEntries(['bow','midships','stern'].map(z =>
  [z, SYSTEM_KEYS.filter(key => compartments[key] === z)])) as Record<Section, System[]>;

export function hitSection(s: {x:number;y:number;heading:number}, hit: {x:number;y:number}): Section {
  const angle=s.heading*Math.PI/180, dx=hit.x-s.x, dy=hit.y-s.y;
  const longitudinal=(dx*Math.sin(angle)+dy*Math.cos(angle))/Math.max(30,Math.hypot(dx,dy));
  return longitudinal > .34 ? 'bow' : longitudinal < -.34 ? 'stern' : 'midships';
}

export function hitSystem(section: Section | null, roll: number): System {
  const local=section!==null && roll<.8;
  const pool=local ? sections[section] : SYSTEM_KEYS;
  const pick=section===null ? roll : local ? roll/.8 : (roll-.8)/.2;
  return pool[Math.min(pool.length-1,Math.floor(pick*pool.length))];
}
