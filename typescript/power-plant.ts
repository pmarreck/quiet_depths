// Mirrored in elm/Sim/PowerPlant.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {cbrt} from './sim-math.ts';
import {operatingFraction} from './equipment.ts';

export const SURFACE_KNOTS = 20.5;
export const ELECTRIC_KNOTS = 16;
export const dieselModes = {charge:'Charge',drive:'Drive',assist:'Battery assist'} as const;
type DieselMode = keyof typeof dieselModes;
export function isDieselMode(value: unknown): value is DieselMode {
  return typeof value === 'string' && Object.hasOwn(dieselModes,value);
}
interface Plant {
  engine: string; depth: number; fuel: number; battery: number;
  systems: Record<string, number>;
}
export const generatorOutput = (s: Plant) => s.engine === 'diesel' && s.depth <= 14 && s.fuel > 0
  ? Math.min(operatingFraction(s.systems.diesel), operatingFraction(s.systems.fuelTank)) : 0;
export const batteryOutput = (s: Plant) => s.battery > 0 ? operatingFraction(s.systems.batteryBank) : 0;

// Keep the original saved lever range. Both directions reach full throttle.
export const throttlePercent = (order: number) => Math.min(100, Math.max(-100, order * 100 / (order < 0 ? 4 : 17)));
export const throttleOrder = (percent: number) => percent * (percent < 0 ? 4 : 17) / 100;

export function propulsion(s: Plant & {dieselMode: DieselMode; targetSpeed: number; silent: boolean}) {
  const generator = generatorOutput(s), battery = batteryOutput(s);
  const shaft = Math.min(operatingFraction(s.systems.engine), operatingFraction(s.systems.propeller));
  if (s.engine === 'electric') {
    const drive = Math.min(battery,shaft);
    return {generator,drive,ahead:drive*ELECTRIC_KNOTS,astern:4*drive,chargeRate:0,assistDrain:0};
  }
  const submerged = Math.max(0, Math.min(1, (s.depth - 1) / 4));
  const rating = (surface: number, snorkeling: number) => surface + (snorkeling-surface)*submerged;
  const dieselRating = rating(SURFACE_KNOTS,13);
  const bank = operatingFraction(s.systems.batteryBank);
  const space = Math.max(0,s.systems.batteryBank-s.battery);
  const charging = s.dieselMode === 'charge' && space > 0 ? bank : 0;
  const reserve = charging*Math.min(1,space/2);
  const drive = Math.min(generator,shaft);
  const genKnots = drive*dieselRating;
  const allocated = generator*(dieselRating-reserve*(dieselRating-rating(18.5,9)));
  let ahead = Math.min(shaft*dieselRating,allocated), assistDrain = 0;
  if (s.dieselMode === 'assist' && generator > 0 && battery > 0) {
    // Approximate shaft power as proportional to speed cubed. Only the demand
    // above generator capacity draws on the battery. Both sources share a motor.
    const combined = cbrt(genKnots**3+(Math.min(battery,shaft)*ELECTRIC_KNOTS)**3);
    ahead = Math.min(shaft*rating(22,17),combined);
    const demand = Math.min(s.silent?3:ahead,Math.max(0,throttlePercent(s.targetSpeed))/100*ahead);
    assistDrain = .20*Math.max(0,demand**3-genKnots**3)/ELECTRIC_KNOTS**3;
  }
  const acceleration = reserve>0 || assistDrain>0 ? ahead/dieselRating : drive;
  return {generator,drive:acceleration,ahead,astern:4*drive,chargeRate:.12*generator*charging,assistDrain};
}

export function dieselRoutingStatus(s: Plant & {dieselMode: DieselMode}, plant: ReturnType<typeof propulsion>) {
  if (!plant.generator) return '';
  switch (s.dieselMode) {
    case 'charge':
      if (plant.chargeRate > 0) return 'CHARGING';
      return operatingFraction(s.systems.batteryBank) ? 'BATTERY FULL' : 'BATTERY OFFLINE';
    case 'drive': return 'CHARGE OFF';
    case 'assist':
      if (!batteryOutput(s)) return 'ASSIST UNAVAILABLE';
      return plant.assistDrain > 0 ? 'BATTERY ASSIST ACTIVE' : 'BATTERY ASSIST READY';
  }
}

// Patrol-scale energy per simulation second. The fixed load keeps the lights,
// pumps and instruments running. Propulsion follows a cubic speed-power curve.
export function energyDraw(speed:number,chargeRate:number,assistDrain:number){
 const knots=Math.abs(speed);
 return {
  electric:.009+.18*(knots/ELECTRIC_KNOTS)**3,
  diesel:.004+.032*Math.max(0,(knots/SURFACE_KNOTS)**3-assistDrain/.20*(ELECTRIC_KNOTS/SURFACE_KNOTS)**3)+.10*chargeRate
 };
}
