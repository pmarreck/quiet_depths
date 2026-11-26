import {SUB_DESIGN as hull} from './hull-design.ts';

type Scope = {scope: boolean; scopeTravel?: number};
type Mast = {visible: boolean; position: {y: number}};
const fullTravelSeconds = 3;
const stowedEye = hull.bridgeRoof - 0.2;

export function scopeExtension(s: Scope): number {
  return s.scopeTravel ?? Number(s.scope);
}

export function orderScope(s: Scope, raised: boolean) {
  if (s.scope === raised) return;
  s.scopeTravel = scopeExtension(s);
  s.scope = raised;
}

export function advanceScope(s: Scope, seconds: number) {
  if (s.scopeTravel === undefined) return;
  const step = seconds / fullTravelSeconds;
  const target = Number(s.scope);
  if (Math.abs(target - s.scopeTravel) <= step) delete s.scopeTravel;
  else s.scopeTravel += s.scope ? step : -step;
}

export function scopeEyeHeight(s: Scope): number {
  return stowedEye + scopeExtension(s) * (hull.scopeEye - stowedEye);
}

export function applyScopePose(mast: Mast, s: Scope & {systems: {periscope: number}}) {
  mast.position.y = scopeEyeHeight(s) - hull.scopeEye;
  mast.visible = scopeExtension(s) > 0 && s.systems.periscope > 0;
}
