// Transcendental functions the simulation shares with its Elm port. Elm has no
// exp, expm1, tanh or cbrt, and its e ^ x (Math.pow) differs from Math.exp in
// the last bits for most inputs, so both simulations compute these the same way
// from Math.pow. Results stay within a few units in the last place of the
// built-ins; browsers already disagree with one another at that level.
export const exp = (x: number): number => Math.E ** x;
export const expm1 = (x: number): number => Math.E ** x - 1;
// Beyond ±20 the result is ±1 to double precision; the cutoff keeps e^(2x) finite.
export function tanh(x: number): number {
  if (x > 20) return 1;
  if (x < -20) return -1;
  const e2 = Math.E ** (2 * x);
  return (e2 - 1) / (e2 + 1);
}
export const cbrt = (x: number): number => x < 0 ? -((-x) ** (1 / 3)) : x ** (1 / 3);
