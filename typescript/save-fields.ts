// Mirrored in elm/Sim/WorldDecoder.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
// The fields each record in a saved patrol may hold beyond those restore
// checks one by one, and the type each must have when present. A save holding
// anything else is refused, so the simulation never meets a field of the
// wrong type: a switch that is text, a number that is a list, a record that
// is null. The world decoder and the record decoders it composes (ship,
// contact, sound, ordnance) hold the same fields to the same types;
// tests/sim-patrol-restore.test.mjs holds the two restores equal.

type FieldType = 'number' | 'integer' | 'boolean' | 'string' | 'record' | readonly (string | null)[];
type Fields = Readonly<Record<string, FieldType>>;

const holds = (value: unknown, type: FieldType): boolean =>
  type === 'number' ? Number.isFinite(value)
  : type === 'integer' ? Number.isInteger(value)
  : type === 'record' ? !!value && typeof value === 'object' && !Array.isArray(value)
  : Array.isArray(type) ? type.includes(value as string)
  : typeof value === type;

// Each listed field is absent or of its type; a required one must be present.
export function fieldsHold(record: unknown, fields: Fields, required: readonly string[] = []): boolean {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const r = record as Record<string, unknown>;
  return Object.entries(fields).every(([key, type]) => r[key] === undefined ? !required.includes(key) : holds(r[key], type));
}

const KINDS = ['merchant', 'fishing', 'escort', 'sub', 'carrier'] as const;
const SIGHTINGS = ['visual', 'passive', 'active', 'lights', 'lamp', 'satellite'] as const;
const AIRCRAFT_PHASES = ['takeoff', 'approach', 'search', 'attack', 'egress', 'return', 'down', 'gone'] as const;

const SHIP: Fields = {
  military: 'boolean', disabled: 'boolean', playerDamaged: 'boolean', incidental: 'boolean', fixedWreck: 'boolean', lights: 'boolean', blackout: 'boolean', settled: 'boolean',
  collapsed: 'boolean', flood: 'number', roll: 'number', verticalSpeed: 'number', groundedAt: 'number', patrolSpeed: 'number', lastAttackAt: 'number', pitch: 'number', noise: 'number',
  lastTubeSide: 'number', lastHitLog: 'number', directHits: 'number', fighterCount: 'number', side: ['friendly', 'hostile'], tracking: [null, 'tracking', 'searching', 'decoy'],
  clue: 'record', parley: 'record', wreckMark: 'record', report: 'record', lampFix: 'record',
};
const CONTACT: Fields = {
  identified: 'boolean', military: 'boolean', courseEstimated: 'boolean', name: 'string', kind: KINDS, method: SIGHTINGS, passiveBearing: 'number', passiveX: 'number', passiveY: 'number',
  depthEstimate: 'number', fix: 'record', sweepArea: 'record',
};
const SOUND: Fields = {
  id: 'integer', depth: 'number', altitude: 'number', heardAt: 'number', vessel: 'string', friendly: 'boolean', own: 'boolean', touched: 'boolean', missed: 'boolean', warning: 'boolean',
  ownHit: 'boolean', droneHit: 'boolean', perceived: 'record',
};
const PERCEIVED: Fields = {distance: 'number', delay: 'number', pan: 'number', gain: 'number', cutoff: 'number'};
const AIRCRAFT: Fields = {name: 'string', phase: AIRCRAFT_PHASES, takeoffUntil: 'number', attack: 'number', bank: 'number', bombDropped: 'boolean', previous: 'record', egress: 'number'};
const ALOFT: Fields = {x: 'number', y: 'number', altitude: 'number'};
const DRONE: Fields = {lostReason: 'string', lowAlarm: 'boolean', rangeAlarm: 'boolean'};
const BLAST: Fields = {
  id: 'integer', totalDelay: 'number', exploded: 'boolean', explodedAt: 'number', airTime: 'number', airHeight: 'number', splashed: 'boolean', convoyCharge: 'boolean',
  kind: ['charge', 'bomb'],
};

interface Saved {
  ships: unknown[]; contacts: unknown[]; acoustics: unknown[]; aircraft: unknown[]; impacts: unknown[]; lightning: unknown[]; blasts: unknown[]; drone: unknown;
  patrol: {variant: unknown}; airSupport: {lastKnown?: unknown};
}
const all = (list: unknown[], ok: (r: Record<string, unknown>) => boolean) => list.every(r => !!r && typeof r === 'object' && ok(r as Record<string, unknown>));

// Every record's further fields hold their types.
export function savedRecordsHold(s: Saved): boolean {
  const lastKnown = s.airSupport.lastKnown as Record<string, unknown> | null | undefined;
  return all(s.ships, v => fieldsHold(v, SHIP) && (v.report === undefined || fieldsHold(v.report, {reason: 'string'})))
    && all(s.contacts, c => fieldsHold(c, CONTACT) && (c.fix === undefined || fieldsHold(c.fix, {source: 'string'})))
    && all(s.acoustics, e => fieldsHold(e, SOUND) && (e.perceived === undefined || fieldsHold(e.perceived, PERCEIVED, Object.keys(PERCEIVED))))
    && all(s.aircraft, p => fieldsHold(p, AIRCRAFT, ['name', 'phase', 'takeoffUntil', 'attack', 'bank', 'bombDropped']) && (p.previous === undefined || fieldsHold(p.previous, ALOFT, Object.keys(ALOFT))))
    && all(s.impacts, p => fieldsHold(p, {id: 'integer', kind: 'string'}, ['kind']))
    && all(s.lightning, e => fieldsHold(e, {id: 'integer'}))
    && all(s.blasts, b => fieldsHold(b, BLAST, ['id', 'totalDelay', 'exploded', 'kind']))
    && fieldsHold(s.drone, DRONE, Object.keys(DRONE)) && Number.isInteger(s.patrol.variant)
    && (!lastKnown || fieldsHold(lastKnown, {reason: 'string'}));
}
