// The readings the page sends its Elm panels each frame. Each interface mirrors
// the Reading record that its Elm view decodes. The figures are formatted here,
// exactly as the page wrote them before those panels moved to Elm; the views
// decide what the measurements mean.
import {clamp} from './mechanics.ts';
import {wrapHeading} from './controls.ts';
import {isSurfaced} from './vehicle-status.ts';
import {conditionLabel, SYSTEM_NAMES} from './equipment.ts';
import {throttlePercent, SURFACE_KNOTS} from './power-plant.ts';
import type {World} from './sim.ts';

/** A heading as three whole degrees, 000 to 359. */
export const deg = (n: number) => String(Math.round(wrapHeading(n)) % 360).padStart(3, '0');

export interface Preset {label: string; value: number}
export interface AxisReading {
  value: string; sublabel: string; sublabelColor: string; min: number; max: number; step: number;
  requested: number; actual: number; actualPercent: number; valueText: string; ariaLabel: string;
  act: string; req: string; enabled: boolean; presets: Preset[];
}
/** The boat's helm, or the drone's while it is being piloted. */
export interface Helm {heading: number; targetHeading: number; depth: number; targetDepth: number; speed: number; targetSpeed: number}

export const depthPresets: Preset[] = [{label: 'SURFACE', value: 0}, {label: 'SCOPE', value: 12}, {label: 'DIVE', value: 90}];

export function headingReading(v: Helm, enabled: boolean): AxisReading {
  return {value: deg(v.heading), sublabel: '', sublabelColor: '', min: 0, max: 359.9, step: .1, requested: v.targetHeading, actual: v.heading,
    actualPercent: clamp(v.heading / 359.9 * 100, 0, 100), valueText: `Actual ${v.heading.toFixed(1)}; requested ${v.targetHeading.toFixed(1)}`,
    ariaLabel: 'Requested heading', act: `ACT ${deg(v.heading)}°`, req: `REQ ${deg(v.targetHeading)}°`, enabled, presets: []};
}

export function depthReading(v: Helm, drone: boolean, enabled: boolean): AxisReading {
  return {value: String(Math.round(v.depth)), sublabelColor: '',
    sublabel: isSurfaced(v) ? 'SURFACED' : drone ? 'ROV' : v.depth <= 15 ? 'SCOPE' : v.depth > 220 ? 'STRAIN' : 'SUBMERGED',
    min: 0, max: 280, step: 1, requested: v.targetDepth, actual: v.depth, actualPercent: clamp(v.depth / 280 * 100, 0, 100),
    valueText: `Actual ${v.depth.toFixed(1)}; requested ${v.targetDepth.toFixed(1)}`, ariaLabel: 'Requested depth',
    act: `ACT ${v.depth.toFixed(0)} m`, req: `REQ ${v.targetDepth.toFixed(0)} m`, enabled, presets: depthPresets};
}

/** The boat's speed axis is a throttle; the drone's is a requested speed. */
export function speedReading(v: Helm, drone: boolean, noise: number, enabled: boolean): AxisReading {
  const lo = drone ? -3 : -4, hi = drone ? 10 : 17, throttle = Math.round(throttlePercent(v.targetSpeed));
  // The boat's tick reaches the top of the rail at full surface speed.
  const tick = !drone && v.speed > 0 ? v.speed * 17 / SURFACE_KNOTS : v.speed;
  return {value: v.speed.toFixed(1), sublabel: drone ? (v.speed < 0 ? 'ASTERN' : 'ROV') : noise < 28 ? 'QUIET' : noise < 55 ? 'AUDIBLE' : 'LOUD',
    sublabelColor: !drone && noise > 55 ? 'var(--red)' : 'var(--green)', min: lo, max: hi, step: .1, requested: v.targetSpeed, actual: v.speed,
    actualPercent: clamp((tick - lo) / (hi - lo) * 100, 0, 100),
    valueText: drone ? `Actual ${v.speed.toFixed(1)}; requested ${v.targetSpeed.toFixed(1)}` : throttle + '% throttle, actual ' + v.speed.toFixed(1) + ' knots',
    ariaLabel: drone ? 'Requested ROV speed' : 'Submarine throttle', act: `ACT ${v.speed.toFixed(1)} kn`,
    req: drone ? 'REQ ' + v.targetSpeed.toFixed(1) + ' kn' : 'THR ' + throttle + '%', enabled, presets: []};
}

export interface SoundingsReading {drone: boolean; belowKeel: number; belowKeelText: string; waterDepthText: string; windText: string}

export function soundingsReading(seabed: {belowKeel: number; waterDepth: number}, drone: boolean, wind: number): SoundingsReading {
  return {drone, belowKeel: seabed.belowKeel, belowKeelText: seabed.belowKeel.toFixed(0) + ' m',
    waterDepthText: seabed.waterDepth > 0 ? seabed.waterDepth.toFixed(0) + ' m' : 'LAND', windText: Math.round(wind) + ' km/h WIND'};
}

export interface Subsystem {name: string; condition: number; label: string}
export interface BoatReading {
  hull: number; hullText: string; hullLimits: string; outerHull: number; flood: number; floodText: string; waterText: string;
  fuelFire: boolean; fuelLeak: boolean; repair: number; systemConditions: number[]; subsystems: Subsystem[];
  ballast: number; ballastText: string; verticalText: string; rpmText: string; cavitation: number; repairEnabled: boolean;
}
type Boat = Pick<World, 'hull' | 'outerHull' | 'flood' | 'water' | 'fuelFire' | 'fuelLeak' | 'repair' | 'systems' | 'repairLimits' | 'ballast' | 'verticalSpeed' | 'propRpm' | 'cavitation'>;

/** Number() keeps each comparison the Elm view makes exactly as JavaScript made
 * it, even for a missing field; the flooding figures are formatted only while
 * the boat is flooding, as before. */
export function boatReading(s: Boat, limit: number, repairEnabled: boolean): BoatReading {
  const systems = s.systems as Record<string, number>, limits = s.repairLimits as Record<string, number>;
  return {hull: Number(s.hull), hullText: String(Math.round(s.hull)),
    hullLimits: 'Outer hull ' + Math.floor(s.outerHull) + '% · Pressure hull ' + conditionLabel(s.hull, limits.hull, false) + ' · Depth limit ' + limit + ' m',
    outerHull: Number(s.outerHull), flood: Number(s.flood), floodText: s.flood > 0 ? s.flood.toFixed(1) : '', waterText: s.flood > 0 ? s.water.toFixed(1) : '',
    fuelFire: !!s.fuelFire, fuelLeak: !!s.fuelLeak, repair: Number(s.repair), systemConditions: Object.values(systems).map(Number),
    subsystems: Object.entries(SYSTEM_NAMES).map(([key, name]) => ({name, condition: Number(systems[key]), label: String(conditionLabel(systems[key], limits[key], key !== 'crew'))})),
    ballast: Number(s.ballast), ballastText: Math.abs(s.ballast * 100).toFixed(0), verticalText: s.verticalSpeed.toFixed(2), rpmText: Number(s.propRpm).toFixed(0),
    cavitation: Number(s.cavitation), repairEnabled};
}
