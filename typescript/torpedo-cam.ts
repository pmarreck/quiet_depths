// TorpedoCam: in Orbit, number keys or on-screen buttons follow the player's
// torpedoes in launch order, and 0 returns to the sub. After a followed shot
// detonates or runs out, the camera holds on its last position briefly.
export const HOLD_SECONDS = 4;

type Point = {x: number; y: number; depth: number};
type Shot = Point & {id: number; owner: string};
export interface FollowState {
  follow: number | null;
  last: Point | null;
  lostAt: number | null;
}

export const torpedoCamActive = (d: {orbitCamera: boolean; torpedoCam: boolean}) => d.orbitCamera && d.torpedoCam;

export function playerTorpedoes<T extends Shot>(projectiles: readonly T[]): T[] {
  return projectiles.filter(p => p.owner === 'player').sort((a, b) => a.id - b.id);
}

// Returns the torpedo to follow, null for the sub, or undefined to change nothing.
export function followForDigit(digit: number, projectiles: readonly Shot[]): number | null | undefined {
  if (digit === 0) return null;
  return playerTorpedoes(projectiles)[digit - 1]?.id;
}

export function followFocus(state: FollowState, projectiles: readonly Shot[], time: number): {state: FollowState; focus: Point | null} {
  if (state.follow === null) return {state, focus: null};
  const shot = projectiles.find(p => p.id === state.follow);
  if (shot) {
    const last = {x: shot.x, y: shot.y, depth: shot.depth};
    return {state: {follow: state.follow, last, lostAt: null}, focus: last};
  }
  const lostAt = state.lostAt ?? time;
  if (state.last && time - lostAt < HOLD_SECONDS) return {state: {...state, lostAt}, focus: state.last};
  return {state: {follow: null, last: null, lostAt: null}, focus: null};
}
