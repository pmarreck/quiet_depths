import {operatingFraction} from './equipment.ts';

export const SURFACE_KNOTS = 20.5;
export const ELECTRIC_KNOTS = 16;
const SNORKEL_KNOTS = 9;
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

export function propulsion(s: Plant) {
  const generator = generatorOutput(s), source = s.engine === 'diesel' ? generator : batteryOutput(s);
  const drive = Math.min(source, operatingFraction(s.systems.engine), operatingFraction(s.systems.propeller));
  const submerged = Math.max(0, Math.min(1, (s.depth - 1) / 4));
  const dieselKnots = SURFACE_KNOTS + (SNORKEL_KNOTS - SURFACE_KNOTS) * submerged;
  return {generator, drive, ahead: drive * (s.engine === 'diesel' ? dieselKnots : ELECTRIC_KNOTS), astern: 4 * drive};
}
