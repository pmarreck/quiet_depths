// One-line submarine status for widescreen stations that do not show the helm.
const compass = (degrees: number) => String(Math.round(((degrees % 360) + 360) % 360) % 360).padStart(3, '0');

export interface HelmReading {
  heading: number;
  targetHeading: number;
  depth: number;
  targetDepth: number;
  speed: number;
}

export function helmStatusText(v: HelmReading, throttlePercent: number): string {
  return `HDG ${compass(v.heading)}° → ${compass(v.targetHeading)}° · DEPTH ${Math.round(v.depth)} → ${Math.round(v.targetDepth)} m · ` +
    `SPEED ${v.speed.toFixed(1)} kn · THR ${Math.round(throttlePercent)}%`;
}
