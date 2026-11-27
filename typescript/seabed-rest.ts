// Resting on the seabed. A gentle landing is safe and a hard one risks damage.
// A stopped sub on the bottom blends into it. Trying to move scrapes the outer hull.
export const RESTING_KNOTS = 0.3;
const SAFE_IMPACT = 0.4;
const HEAVY_IMPACT = 2;
const WEAR_PER_KNOT_SECOND = 0.06;

// Driving into a bank counts as an impact as well as sinking onto it.
export function touchdownImpact(descent: number, speedKnots: number): number {
  return Math.max(descent, 0.2 * Math.abs(speedKnots));
}

export function touchdownChance(impact: number): number {
  return Math.min(1, Math.max(0, (impact - SAFE_IMPACT) / (HEAVY_IMPACT - SAFE_IMPACT)));
}

export function touchdownDamage(impact: number): number {
  if (impact <= SAFE_IMPACT) return 0;
  return 4 + 12 * Math.min(1.5, (impact - SAFE_IMPACT) / (HEAVY_IMPACT - SAFE_IMPACT));
}

// Outer hull points lost while the sub works against the seabed.
export function seabedWear(effortKnots: number, dt: number): number {
  const effort = Math.abs(effortKnots);
  return effort > RESTING_KNOTS ? WEAR_PER_KNOT_SECOND * effort * dt : 0;
}

export function restingStealth(bottomed: boolean, effortKnots: number): number {
  return bottomed && Math.abs(effortKnots) <= RESTING_KNOTS ? 0.25 : 1;
}

export function sweepClutter(bottomed: boolean, effortKnots: number): number {
  return bottomed && Math.abs(effortKnots) <= RESTING_KNOTS ? 0.5 : 1;
}
