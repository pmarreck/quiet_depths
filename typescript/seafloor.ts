// Mirrored in elm/Sim/Seafloor.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {bottom} from './mechanics.ts';

export const FLOOR_WIDTH = 16000, FLOOR_SEGMENTS = 140;

// Three's PlaneGeometry splits each cell along its bottom-left to top-right diagonal.
// x and north are simulation coordinates. Slope Z increases toward world-space south.
export function floorSurface(x: number, north: number, seed?: number) {
  const cell = FLOOR_WIDTH / FLOOR_SEGMENTS, half = FLOOR_WIDTH / 2;
  const col = Math.floor((x + half) / cell);
  const row = Math.floor((half - north) / cell);
  const west = col * cell - half, top = half - row * cell, u = (x - west) / cell, v = (top - north) / cell;
  const b = -bottom(west, top - cell, seed), d = -bottom(west + cell, top, seed);
  if (u + v <= 1) {
    const a = -bottom(west, top, seed);
    return {height: a + (d - a) * u + (b - a) * v, slopeX: (d - a) / cell, slopeZ: (b - a) / cell};
  }
  const c = -bottom(west + cell, top - cell, seed);
  return {height: c + (c - b) * (u - 1) + (c - d) * (v - 1), slopeX: (c - b) / cell, slopeZ: (c - d) / cell};
}
