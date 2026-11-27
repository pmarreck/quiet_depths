import {environmentAt, hash01, WEATHER, type EnvironmentConfig} from './environment.ts';
// Experimental 1972 imagery relay is a deliberate historical exception. Real
// VLF is low-throughput, one-way and shallow-antenna reception. Depth limits and
// all timings below are fictional play tuning, not calibrated radio performance.
export const RECON_LIMITS = Object.freeze({footprint: 10000, uplinkDepth: 15, receiveDepth: 30, cooldown: 480, uplinkSeconds: 8,
  exposureSeconds: 10, processingSeconds: 12, surfaceTransferSeconds: 18, maxTracks: 256});
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const finite = Number.isFinite;

const PHASES = ['idle', 'queued', 'uplinking', 'tasking', 'imaging', 'processing', 'receiving', 'complete', 'failed'] as const;
type Phase = typeof PHASES[number];
type Area = {x: number; y: number; size: number};
interface FrameWeather {id: string; name: string; waveScale: number; waveSpeed: number; wavePhase: number; cloud: number; rain: number; storm: number; daylight: number; hour: number}
interface FrameShip {id: string; x: number; y: number; heading: number; speed: number; kind: string; hull: number; name: string; military: boolean; side?: string}
interface Frame {time: number; night: boolean; weather: FrameWeather; ships: FrameShip[]}
interface ReconTrack {
  id: string; x: number; y: number; vx: number; vy: number; time: number; identified: boolean;
  positionSigma: number; velocitySigma: number; maneuverSigma: number; name?: string; kind?: string; military?: boolean; side?: string;
}
interface SceneShip {id: string; x: number; y: number; heading: number; speed: number; kind: string; hull: number}
interface Packet {
  id: string; photoId: string; area: Area; capturedAt: number; receivedAt: number | null; night: boolean; weather: FrameWeather;
  coverage: number; quality: number; tracks: ReconTrack[]; sceneShips: SceneShip[];
  image: {width: number; height: number; mode: string; firstFrameAt: number; secondFrameAt: number; footprintMeters: number};
}
export interface Recon {
  phase: Phase; area: Area | null; requestedAt: number | null; startedAt: number | null; readyAt: number | null; cooldownUntil: number;
  progress: number; packet: Packet | null; sequence: number; firstFrame: Frame | null; transferStartedAt: number | null;
}
type Ship = FrameShip & {depth?: number; lights?: boolean; blackout?: boolean};
type Patrol = {
  status: string; time: number; depth: number; recon?: Recon; ships: Ship[]; difficulty?: {satellite?: boolean};
  patrol?: {seed: number}; environment?: EnvironmentConfig; wavePhase?: number; lightning?: {time: number; x: number; y: number}[]; x?: number; y?: number;
};

export const freshRecon = (): Recon => ({phase: 'idle', area: null, requestedAt: null, startedAt: null, readyAt: null, cooldownUntil: 0,
  progress: 0, packet: null, sequence: 0, firstFrame: null, transferStartedAt: null});
const settled = (phase: string) => ['idle', 'complete', 'failed'].includes(phase);
export function reconAreaForDisplay(recon: Recon, selected?: Area | null) { return settled(recon.phase) ? selected || recon.area : recon.area; }

export function reconLink(s: {depth?: number} | null | undefined) {
  const depth = finite(s?.depth) ? Math.max(0, s!.depth as number) : Infinity;
  const canUplink = depth <= RECON_LIMITS.uplinkDepth, canReceive = depth <= RECON_LIMITS.receiveDepth;
  return {canUplink, canReceive, rate: !canReceive ? 0 : depth <= 1 ? 1 / RECON_LIMITS.surfaceTransferSeconds : 1 / (80 + depth * 8),
    label: !canReceive ? 'Reception held · rise to 30 m' : depth <= 1 ? 'Surface radio relay' : 'Slow shallow VLF relay'};
}
const seedOf = (s: Patrol) => s.patrol?.seed ?? s.environment?.seed ?? 1;
function weatherBlocks(s: Patrol) { return environmentAt(s).storm > .5; }
function validArea(value: unknown) {
  const area = value as Area | null | undefined;
  return area && finite(area.x) && finite(area.y) && Math.abs(area.x) <= 20000 && Math.abs(area.y) <= 20000 && area.size === RECON_LIMITS.footprint;
}

export function requestRecon(s: Patrol | null | undefined, area: Area): boolean {
  if (!s || s.difficulty?.satellite === false || s.status !== 'patrol' || !finite(s.time) || s.time < 0 || !s.recon || !validArea(area) ||
    s.time < s.recon.cooldownUntil || !settled(s.recon.phase) || weatherBlocks(s)) return false;
  const sequence = s.recon.sequence + 1;
  Object.assign(s.recon, freshRecon(), {phase: 'queued', area: {x: area.x, y: area.y, size: area.size}, requestedAt: s.time, cooldownUntil: s.time + RECON_LIMITS.cooldown, sequence});
  return true;
}

const codeOf = (id: string) => { let value = 0; for (const c of id) value = (Math.imul(value, 31) + c.charCodeAt(0)) | 0; return value; };

function snapshot(s: Patrol & {recon: Recon}): Frame {
  const area = s.recon.area!, half = area.size / 2, e = environmentAt(s), night = e.daylight < .25;
  const ships = s.ships.filter(v => v.hull > 0 && v.kind !== 'sub' && (v.depth || 0) <= 3 && Math.abs(v.x - area.x) <= half && Math.abs(v.y - area.y) <= half &&
    (!night || v.lights !== false && !v.blackout)).slice(0, RECON_LIMITS.maxTracks)
    .map(v => ({id: v.id, x: v.x, y: v.y, heading: v.heading, speed: v.speed, kind: v.kind, hull: v.hull, name: v.name, military: v.military, ...(v.side ? {side: v.side} : {})}));
  return {time: s.time, night, weather: {id: e.weatherId, name: e.weather, waveScale: e.waveScale, waveSpeed: e.waveSpeed, wavePhase: s.wavePhase ?? s.time * e.waveSpeed,
    cloud: Math.max(e.cloud, e.fog), rain: e.rain, storm: e.storm, daylight: e.daylight, hour: e.hour}, ships};
}

function makePacket(s: Patrol & {recon: Recon}, first: Frame, second: Frame): Packet {
  const seed = seedOf(s), cloud = second.weather.cloud, night = second.night, clear = cloud < .35 && second.weather.rain < .1;
  const coverage = clear ? 1 : clamp(1 - cloud * .8 - second.weather.rain * .15, .12, .9), quality = clear ? 1 : clamp(1 - cloud * .7 - second.weather.rain * .2, .1, .85);
  const tracks: ReconTrack[] = [], sceneShips: SceneShip[] = [];
  const firstById = new Map(first.ships.map(v => [v.id, v])), interval = Math.max(.001, second.time - first.time);
  for (const ship of second.ships) {
    const previous = firstById.get(ship.id);
    if (!previous) continue;
    // The mask belongs to a world patch, not a screen pixel. A held transmission
    // never resamples it or gets a new chance to see through the same clouds.
    const code = codeOf(ship.id) + Math.floor(ship.x / 1300) * 19 + Math.floor(ship.y / 1300) * 43;
    if (!clear && hash01(seed, code) > coverage) continue;
    const positionSigma = clear ? 0 : 40 + cloud * 150 + second.weather.rain * 100;
    const dx = (hash01(seed, code + 1201) - .5) * positionSigma * 2, dy = (hash01(seed, code + 1202) - .5) * positionSigma * 2;
    const track: ReconTrack = {id: ship.id, x: ship.x + dx, y: ship.y + dy, vx: (ship.x - previous.x) / interval, vy: (ship.y - previous.y) / interval, time: second.time,
      identified: !night && clear, positionSigma, velocitySigma: clear ? .25 : .8, maneuverSigma: .008};
    if (track.identified) Object.assign(track, {name: ship.name, kind: ship.kind, military: ship.military, ...(ship.side ? {side: ship.side} : {})});
    tracks.push(track);
    sceneShips.push({id: ship.id, x: track.x, y: track.y, heading: ship.heading, speed: ship.speed, kind: night ? 'light' : ship.kind, hull: ship.hull});
  }
  const id = 'sat-' + s.recon.sequence;
  return {id, photoId: id, area: {...s.recon.area!}, capturedAt: second.time, receivedAt: null, night, weather: second.weather, coverage, quality, tracks, sceneShips,
    image: {width: 640, height: 640, mode: night ? 'night-lights' : 'daylight', firstFrameAt: first.time, secondFrameAt: second.time, footprintMeters: s.recon.area!.size}};
}

export function updateRecon(s: Patrol | null | undefined, dt: number): Packet | null {
  if (!s || s.status !== 'patrol' || !finite(s.time) || !s.recon || !finite(dt) || dt <= 0) return null;
  const tasked = s as Patrol & {recon: Recon}, r = tasked.recon, link = reconLink(s);
  if (r.phase === 'queued') {
    if (!link.canUplink) return null;
    r.phase = 'uplinking'; r.startedAt = s.time; r.progress = 0;
  }
  if (r.phase === 'uplinking') {
    if (!link.canUplink) return null;
    r.progress = clamp(r.progress + dt / RECON_LIMITS.uplinkSeconds, 0, 1);
    if (r.progress < 1) return null;
    r.phase = 'tasking'; r.startedAt = s.time; r.readyAt = s.time + 90 + Math.floor(hash01(seedOf(s), 700 + r.sequence) * 61); r.progress = 0;
    return null;
  }
  if (r.phase === 'tasking') {
    const started = r.startedAt as number, ready = r.readyAt as number;
    r.progress = clamp((s.time - started) / (ready - started), 0, 1);
    if (s.time < ready) return null;
    r.firstFrame = snapshot(tasked); r.phase = 'imaging'; r.startedAt = s.time; r.progress = 0;
    return null;
  }
  if (r.phase === 'imaging') {
    r.progress = clamp((s.time - (r.startedAt as number)) / RECON_LIMITS.exposureSeconds, 0, 1);
    if (r.progress < 1) return null;
    const second = snapshot(tasked);
    r.packet = makePacket(tasked, r.firstFrame!, second); r.firstFrame = null; r.phase = 'processing'; r.startedAt = s.time; r.progress = 0;
    return null;
  }
  if (r.phase === 'processing') {
    r.progress = clamp((s.time - (r.startedAt as number)) / RECON_LIMITS.processingSeconds, 0, 1);
    if (r.progress < 1) return null;
    r.phase = 'receiving'; r.startedAt = s.time; r.transferStartedAt = s.time; r.progress = 0;
    return null;
  }
  if (r.phase === 'receiving') {
    r.progress = clamp(r.progress + dt * link.rate, 0, 1);
    if (r.progress < 1) return null;
    const packet = r.packet!;
    packet.receivedAt = s.time; r.phase = 'complete'; r.progress = 1; r.cooldownUntil = Math.max(r.cooldownUntil, s.time + RECON_LIMITS.cooldown);
    return structuredClone(packet);
  }
  return null;
}

export function reconStatus(s: Patrol) {
  const r = s.recon || freshRecon(), link = reconLink(s), cooldownRemaining = Math.max(0, r.cooldownUntil - s.time), blocked = weatherBlocks(s);
  const labels: Record<Phase, [string, string]> = {
    idle: ['Orbital reconnaissance', blocked ? 'Storm obscures optical reconnaissance.' : 'Place a 10 km square on the chart.'],
    queued: ['Awaiting radio uplink', link.canUplink ? 'Sending tasking request.' : 'Rise to antenna depth: 15 m or less.'],
    uplinking: ['Transmitting tasking request', link.canUplink ? 'Radio request in progress.' : 'Uplink held: rise to 15 m.'],
    tasking: ['Retasking · awaiting overpass', 'The satellite is moving into the requested observing geometry.'],
    imaging: ['Imaging the search square', 'Two exposures measure surface motion. Clouds and darkness limit identification.'],
    processing: ['Processing reconnaissance', 'Decoding and checking the captured observations.'],
    receiving: ['Receiving reconnaissance', link.canReceive ? link.label : 'Reception held: rise to 30 m or less for the shallow antenna.'],
    complete: ['Reconnaissance received', r.packet?.tracks.length ? `${r.packet.tracks.length} surface tracks · observation ${Math.round(s.time - r.packet.capturedAt)} s old` : 'No usable surface returns in this exposure.'],
    failed: ['Reconnaissance unavailable', 'No usable exposure received.'],
  };
  const [title, detail] = labels[r.phase] || labels.idle;
  return {phase: r.phase, title, detail, progress: clamp(r.progress || 0, 0, 1), canRequest: settled(r.phase) && cooldownRemaining <= 0 && !blocked, cooldownRemaining, linkLabel: link.label};
}

// Save validation: values arrive as untrusted JSON, so each check stays at run time.
function validWeather(input: unknown) {
  const value = input as FrameWeather | null | undefined;
  return value && Object.hasOwn(WEATHER, value.id) && (['waveScale', 'waveSpeed', 'wavePhase'] as const).every(k => value[k] === undefined || finite(value[k]) && value[k] >= 0) &&
    (['cloud', 'rain', 'storm', 'daylight', 'hour'] as const).every(k => finite(value[k])) && (['cloud', 'rain', 'storm', 'daylight'] as const).every(k => value[k] >= 0 && value[k] <= 1);
}
function validFrame(input: unknown) {
  const value = input as Frame | null | undefined;
  return value && finite(value.time) && value.time >= 0 && typeof value.night === 'boolean' && validWeather(value.weather) && Array.isArray(value.ships) &&
    value.ships.length <= RECON_LIMITS.maxTracks && value.ships.every(v => v && typeof v.id === 'string' && (['x', 'y', 'heading', 'speed', 'hull'] as const).every(k => finite(v[k])));
}
export function validateReconState(input: unknown): boolean {
  const value = input as Recon | null | undefined;
  if (!value || !(PHASES as readonly string[]).includes(value.phase) || !finite(value.progress) || value.progress < 0 || value.progress > 1 ||
    !finite(value.cooldownUntil) || value.cooldownUntil < 0 || !Number.isSafeInteger(value.sequence) || value.sequence < 0) return false;
  for (const key of ['requestedAt', 'startedAt', 'readyAt', 'transferStartedAt'] as const) {
    const at = value[key];
    if (at !== null && (!finite(at) || (at as number) < 0)) return false;
  }
  if (value.area !== null && !validArea(value.area)) return false;
  if (!['idle', 'failed'].includes(value.phase) && !validArea(value.area)) return false;
  if (value.firstFrame !== null && !validFrame(value.firstFrame) || value.phase === 'imaging' && !validFrame(value.firstFrame)) return false;
  const p = value.packet;
  if (!p) return !['processing', 'receiving', 'complete'].includes(value.phase);
  if (typeof p.id !== 'string' || typeof p.photoId !== 'string' || !validArea(p.area) || !finite(p.capturedAt) || p.capturedAt < 0 ||
    p.receivedAt !== null && (!finite(p.receivedAt) || p.receivedAt < p.capturedAt) || typeof p.night !== 'boolean' || !validWeather(p.weather) ||
    !(['coverage', 'quality'] as const).every(k => finite(p[k]) && p[k] >= 0 && p[k] <= 1)) return false;
  if (value.phase === 'complete' && !finite(p.receivedAt)) return false;
  if (!Array.isArray(p.tracks) || p.tracks.length > RECON_LIMITS.maxTracks || !Array.isArray(p.sceneShips) || p.sceneShips.length !== p.tracks.length) return false;
  const ids = new Set<string>();
  for (const track of p.tracks) {
    if (!track || typeof track.id !== 'string' || ids.has(track.id) ||
      !(['x', 'y', 'vx', 'vy', 'time', 'positionSigma', 'velocitySigma', 'maneuverSigma'] as const).every(k => finite(track[k])) || track.time > p.capturedAt || track.time < 0 ||
      (['positionSigma', 'velocitySigma', 'maneuverSigma'] as const).some(k => track[k] < 0) || typeof track.identified !== 'boolean') return false;
    ids.add(track.id);
  }
  const rendered = new Set<string>();
  for (const ship of p.sceneShips) {
    if (!ship || !ids.has(ship.id) || rendered.has(ship.id) || !(['x', 'y', 'heading', 'speed', 'hull'] as const).every(k => finite(ship[k])) || p.night && ship.kind !== 'light') return false;
    rendered.add(ship.id);
  }
  const image = p.image;
  return !!image && image.width === 640 && image.height === 640 && ['night-lights', 'daylight'].includes(image.mode) && finite(image.firstFrameAt) && finite(image.secondFrameAt) &&
    image.firstFrameAt < image.secondFrameAt && image.secondFrameAt === p.capturedAt && image.footprintMeters === RECON_LIMITS.footprint;
}
