import {exp} from './sim-math.ts';
import {scopeEyeHeight} from './periscope.ts';
import {surfaceMotion, wavePhaseAt, surfaceHeight, WAVE_COMPONENTS, hash01, boatPoint} from './surface-motion.ts';
import {SUB_DESIGN as D} from './hull-design.ts';
import {DAY_SECONDS, sailingDay, patrolCalendar} from './patrol-calendar.ts';
export {wavePhaseAt, surfaceHeight, WAVE_COMPONENTS, hash01};
export {DAY_SECONDS};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

interface Weather {name: string; cloud: number; rain: number; storm: number; waveScale: number; waveSpeed: number; wind: number; visibility: number}
type Blended = Exclude<keyof Weather, 'name'>;
const blended: readonly Blended[] = ['cloud', 'rain', 'storm', 'waveScale', 'waveSpeed', 'wind', 'visibility'];

export const WEATHER = Object.freeze({
  clear: {name: 'Clear', cloud: .12, rain: 0, storm: 0, waveScale: .55, waveSpeed: .75, wind: 9, visibility: 1},
  cloudy: {name: 'Cloudy', cloud: .82, rain: 0, storm: 0, waveScale: 1, waveSpeed: 1, wind: 22, visibility: .82},
  rain: {name: 'Rain', cloud: .95, rain: .6, storm: 0, waveScale: 1.45, waveSpeed: 1.2, wind: 38, visibility: .65},
  storm: {name: 'Storm', cloud: 1, rain: 1, storm: 1, waveScale: 2.6, waveSpeed: 1.55, wind: 65, visibility: .46},
} satisfies Record<string, Weather>);
export const TIMES = Object.freeze({dawn: {name: 'Dawn', hour: 6}, day: {name: 'Day', hour: 12}, dusk: {name: 'Dusk', hour: 18}, night: {name: 'Night', hour: 22}});
// Lookups by saved or chosen name, including names this build does not know.
const weatherNamed = WEATHER as Readonly<Record<string, Weather | undefined>>;
const timeNamed = TIMES as Readonly<Record<string, {name: string; hour: number} | undefined>>;

export interface EnvironmentConfig {startDay?: number; chartSeed: number; startHour: number; startWeather: string; changing: boolean; seed: number}
type Direction = {x: number; y: number; z: number};
export interface Environment extends Omit<Weather, 'name'> {
  sampledAt?: number; wavePhase?: number;
  weather: string; weatherId: string; hour: number; sunAltitude: number; daylight: number; twilight: number; phase: string; fog: number;
  date: string; holiday: 'christmas' | 'new-year' | null; day: number; cycle: number; illumination: number;
  moonDirection: Direction; clearLight: number; moonLight: number; sunDirection: Direction;
  opticalRange: number; subVisualRange: number; lightRange: number; navigationLights: boolean; seaState: number; flash: number;
}
type Strike = {time: number; x: number; y: number};
type Sky = {environment?: EnvironmentConfig; time?: number; wavePhase?: number; lightning?: Strike[]; x?: number; y?: number};

export function makeEnvironment(seed = 19830604, options: {timeOfDay?: string; weather?: string; changing?: boolean} = {}): EnvironmentConfig {
  return {startDay: sailingDay(seed), chartSeed: seed >>> 0,
    startHour: options.timeOfDay === 'random' ? Object.values(TIMES)[Math.floor(hash01(seed, 750) * 4)].hour : timeNamed[options.timeOfDay as string]?.hour ?? 18,
    startWeather: options.weather === 'random' ? Object.keys(WEATHER)[Math.floor(hash01(seed, 751) * 4)] : weatherNamed[options.weather as string] ? options.weather as string : 'clear',
    changing: options.changing !== false, seed: seed >>> 0};
}

export function environmentAt(s: Sky): Environment {
  const cfg = s.environment || makeEnvironment(), time = s.time || 0, ids = Object.keys(WEATHER), slot = Math.floor(time / 300);
  const idAt = (n: number) => n <= 0 ? cfg.startWeather : ids[Math.floor(hash01(cfg.seed, n) * ids.length)];
  const a = weatherNamed[idAt(cfg.changing ? slot - 1 : 0)]!, b = weatherNamed[idAt(cfg.changing ? slot : 0)]!;
  const blend = slot > 0 && cfg.changing ? smooth(0, 75, time % 300) : 0;
  // Fields are assigned in a fixed order, as the original module did.
  const e = {} as Environment;
  for (const k of blended) e[k] = mix(a[k], b[k], blend);
  if (s.wavePhase !== undefined) { e.sampledAt = time; e.wavePhase = s.wavePhase; }
  e.weather = (blend < .5 ? a : b).name;
  e.weatherId = blend < .5 ? idAt(cfg.changing ? slot - 1 : 0) : idAt(cfg.changing ? slot : 0);
  e.hour = ((cfg.startHour + time * 24 / DAY_SECONDS) % 24 + 24) % 24;
  const angle = (e.hour - 6) * Math.PI / 12;
  e.sunAltitude = Math.sin(angle); e.daylight = smooth(-.14, .18, e.sunAltitude); e.twilight = 1 - Math.abs(e.daylight * 2 - 1);
  e.phase = e.daylight < .12 ? 'Night' : e.daylight > .9 ? 'Day' : e.hour < 12 ? 'Dawn' : 'Dusk';
  const day = Math.floor((cfg.startHour + time * 24 / DAY_SECONDS) / 24), mist = hash01(cfg.seed, 8150 + day);
  e.fog = mist < .46 ? (1 - smooth(.05, .55, e.rain)) * smooth(4.5, 5.75, e.hour) * (1 - smooth(7, 9, e.hour)) * (.64 + .30 * mist / .46) : 0;
  if (e.fog > .16) e.weather = 'Morning fog';
  e.visibility *= 1 - .79 * e.fog;
  Object.assign(e, patrolCalendar(cfg.startDay ?? sailingDay(cfg.seed), cfg.startHour, time));
  const lunarAngle = angle - 2 * Math.PI * e.cycle;
  e.moonDirection = {x: Math.cos(lunarAngle), y: Math.sin(lunarAngle), z: -.32 * Math.cos(2 * Math.PI * e.cycle)};
  e.clearLight = (1 - e.cloud) ** 2 * (1 - e.fog);
  e.moonLight = e.illumination * smooth(-.01, .12, e.moonDirection.y) * e.clearLight;
  e.sunDirection = {x: Math.cos(angle), y: Math.sin(angle), z: -.32};
  e.opticalRange = (3900 + 2600 * e.daylight) * e.visibility;
  e.subVisualRange = (1800 + 3700 * e.daylight) * e.visibility;
  e.lightRange = (7000 - 1000 * e.daylight) * (.65 + .35 * e.visibility);
  if (e.fog > 0) e.lightRange *= 1 - .55 * e.fog;
  e.navigationLights = e.daylight < .85 || e.fog > .16;
  e.seaState = e.waveScale < .7 ? 2 : e.waveScale < 1.2 ? 3 : e.waveScale < 1.8 ? 4 : 6;
  e.flash = 0;
  for (const strike of s.lightning || []) {
    const age = time - strike.time;
    if (age >= 0 && age < .75) {
      const pulse = exp(-age * 13) + .75 * exp(-(((age - .22) / .05) ** 2));
      const d = Math.hypot(strike.x - (s.x as number), strike.y - (s.y as number));
      e.flash = Math.max(e.flash, pulse / (1 + d / 14000));
    }
  }
  return e;
}

// Visual approximation of clear seawater. Attenuation is exponential in
// meters, with blue retaining about 1% of surface daylight at 200 m.
export function waterColumnLight(depth: number, e: {daylight: number; cloud: number; sunAltitude: number}) {
  const meters = Math.max(0, depth), diffuse = e.daylight * (1 - .52 * e.cloud);
  return {
    red: diffuse * exp(-.12 * meters),
    green: diffuse * exp(-.045 * meters),
    blue: diffuse * exp(-.023 * meters),
    direct: e.daylight * Math.sqrt(Math.max(0, e.sunAltitude)) * (1 - e.cloud) ** 2,
  };
}

export const SEA_GLSL = 'float sea(vec2 p){return waveScale*(' + WAVE_COMPONENTS.map(w =>
  `sin(p.x*${w.kx.toFixed(3)}+p.y*${w.ky.toFixed(3)}+wavePhase*${w.omega.toFixed(3)})*${w.amplitude.toFixed(3)}`).join('+') + ');}';
export const SEA_SAMPLE_GLSL = 'vec3 seaSample(vec2 p){vec3 s=vec3(0.);' + WAVE_COMPONENTS.map((w, i) =>
  `float phase${i}=p.x*${w.kx.toFixed(3)}+p.y*${w.ky.toFixed(3)}+wavePhase*${w.omega.toFixed(3)};s+=${w.amplitude.toFixed(3)}*vec3(sin(phase${i}),cos(phase${i})*${w.kx.toFixed(3)},cos(phase${i})*${w.ky.toFixed(3)});`).join('') + 'return s*waveScale;}';

type Boat = {x: number; y: number; depth: number; heading: number; pitch: number; roll?: number; time: number};
type Pose = {x: number; y: number; depth: number; heading: number; pitch: number; roll?: number};
type Scope = {scope: boolean; scopeTravel?: number};

export function boatSurfacePose(s: Boat & Sky, e = environmentAt(s), time = s.time) { return surfaceMotion(s, e, time); }
export function scopePosition(pose: Pose, s: Scope = {scope: true}) {
  return boatPoint(pose, {forward: -D.scopeZ, down: -scopeEyeHeight(s)});
}
export function scopeWashed(s: Boat & Sky & Scope, e = environmentAt(s)) {
  const eye = scopePosition(boatSurfacePose(s, e), s);
  return -eye.depth <= surfaceHeight(eye.x, eye.y, s.time, e) + .15;
}
export function soundings(waterDepth: number, referenceDepth: number, keelOffset = 5) {
  return {waterDepth, referenceDepth, belowKeel: waterDepth - referenceDepth - keelOffset, keelOffset};
}
