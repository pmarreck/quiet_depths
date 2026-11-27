// Mirrored in elm/Sim/TrackEstimates.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {estimateAt} from './contact-readings.ts';
export {estimateAt};
// Timestamped observations are independent of live vessel state. All distances
// are meters; velocity is east/north m/s; ellipse angle is a compass bearing.
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const finite = Number.isFinite;

export interface Fix {
  x: number; y: number; time: number; vx: number; vy: number;
  positionSigma: number; velocitySigma: number; maneuverSigma: number; source?: string;
}
export interface Contact {
  id: string; x: number; y: number; range: number; bearing: number; confidence: number; age: number;
  label?: string; identified?: boolean; name?: string; side?: string; kind?: string; military?: boolean; method?: string;
  fix?: Fix; [key: string]: unknown;
}
type Observation = Partial<Fix> & {x: number; y: number; time: number};
type Ship = {id: string; name: string; kind: string; military: boolean; side?: string; hull: number; x: number; y: number; depth: number; heading: number; speed: number};

export function designation(index: number): string {
  if (!Number.isSafeInteger(index) || index < 1) throw new RangeError('Contact sequence must be a positive safe integer');
  let column = Math.floor((index - 1) / 9) + 1, letters = '';
  while (column) { column--; letters = String.fromCharCode(65 + column % 26) + letters; column = Math.floor(column / 26); }
  return letters + ((index - 1) % 9 + 1);
}

export function fixContact(contact: {fix?: Fix} | null | undefined, observation: Observation | null | undefined): boolean {
  if (!contact || !observation || !finite(observation.x) || !finite(observation.y) || !finite(observation.time) || observation.time < 0) return false;
  const fix: Fix = {x: observation.x, y: observation.y, time: observation.time, vx: observation.vx ?? 0, vy: observation.vy ?? 0,
    positionSigma: observation.positionSigma ?? 0, velocitySigma: observation.velocitySigma ?? .25, maneuverSigma: observation.maneuverSigma ?? .008,
    source: observation.source || 'observation'};
  const numbers = [fix.vx, fix.vy, fix.positionSigma, fix.velocitySigma, fix.maneuverSigma];
  if (!numbers.every(finite) || [fix.positionSigma, fix.velocitySigma, fix.maneuverSigma].some(n => n < 0)) return false;
  if (contact.fix && finite(contact.fix.time) && fix.time < contact.fix.time) return false;
  contact.fix = fix;
  return true;
}

export function chartContacts(s: {difficulty?: {omniscientChart?: boolean}; search?: unknown; contacts: Contact[]; ships: Ship[]; time: number}) {
  if (!s.difficulty?.omniscientChart) return s.contacts;
  const identified = s.search ? new Set(s.contacts.filter(c => c.identified || c.kind === 'sub' && c.fix).map(c => c.id)) : null;
  const hostile = new Set(s.ships.filter(ship => ship.military && ship.side !== 'friendly' && (!identified || identified.has(ship.id))).map(ship => ship.id));
  const observed = s.contacts.filter(contact => !hostile.has(contact.id));
  const exact = s.ships.filter(ship => hostile.has(ship.id) && ship.hull > 0).map(ship => ({
    id: ship.id, label: 'LIVE', name: ship.name, identified: true, kind: ship.kind, military: ship.military, side: ship.side, age: 0, range: 1, exact: true,
    x: ship.x, y: ship.y, depthEstimate: ship.kind === 'sub' ? ship.depth : undefined,
    fix: {time: s.time, x: ship.x, y: ship.y, vx: Math.sin(ship.heading * Math.PI / 180) * ship.speed * .514444,
      vy: Math.cos(ship.heading * Math.PI / 180) * ship.speed * .514444, positionSigma: 0, velocitySigma: 0, maneuverSigma: 0},
  }));
  return [...observed, ...exact];
}

type Track = Partial<Fix> & {id: string; x: number; y: number; identified?: boolean; name?: unknown; side?: unknown; kind?: unknown; military?: unknown};
type Packet = {tracks: Track[]; capturedAt: number; receivedAt: number};

export function applyReconPacket(s: {time: number; x: number; y: number; contacts?: Contact[]; nextId?: number} | null, packet: Packet | null): boolean {
  if (!s || !finite(s.time) || !finite(s.x) || !finite(s.y) || !packet || !Array.isArray(packet.tracks) || packet.tracks.length > 256 ||
    !finite(packet.capturedAt) || !finite(packet.receivedAt) || packet.receivedAt > s.time || packet.capturedAt > packet.receivedAt) return false;
  const observations: {track: Track; observation: Observation}[] = [], ids = new Set<string>();
  for (const track of packet.tracks) {
    if (!track || typeof track.id !== 'string' || ids.has(track.id)) return false;
    ids.add(track.id);
    const observation: Observation = {x: track.x, y: track.y, vx: track.vx ?? 0, vy: track.vy ?? 0, time: track.time ?? packet.capturedAt,
      positionSigma: track.positionSigma ?? 0, velocitySigma: track.velocitySigma ?? .25, maneuverSigma: track.maneuverSigma ?? .008, source: 'satellite'};
    if (observation.time > packet.capturedAt || !fixContact({}, observation)) return false;
    observations.push({track, observation});
  }
  const contacts = s.contacts ??= [];
  if (!Number.isSafeInteger(s.nextId) || (s.nextId as number) < 1) s.nextId = 1;
  for (const {track, observation} of observations) {
    let contact = contacts.find(c => c.id === track.id);
    if (!contact) {
      contact = {id: track.id, label: designation((s.nextId as number)++), identified: false, bearing: 0, range: 0, confidence: 0, age: 0, x: track.x, y: track.y, method: 'satellite'};
      contacts.push(contact);
    }
    if (fixContact(contact, observation)) {
      const estimate = estimateAt(contact, s.time)!;
      contact.x = observation.x; contact.y = observation.y;
      contact.range = Math.hypot(estimate.x - s.x, estimate.y - s.y);
      contact.bearing = (Math.atan2(estimate.x - s.x, estimate.y - s.y) * 180 / Math.PI + 360) % 360;
      contact.confidence = observation.positionSigma === 0 ? 1 : clamp(1 - (observation.positionSigma as number) / 1200, .2, .95);
      contact.age = estimate.age; contact.method = 'satellite';
    }
    if (track.identified && typeof track.name === 'string') {
      contact.identified = true; contact.name = track.name;
      if (track.side === 'friendly' || track.side === 'hostile') contact.side = track.side;
      if (typeof track.kind === 'string') contact.kind = track.kind;
      if (typeof track.military === 'boolean') contact.military = track.military;
    }
  }
  return true;
}
