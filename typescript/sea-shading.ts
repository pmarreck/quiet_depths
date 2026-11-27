// How the renderer shades the sea: the water shader's wave sum and the
// daylight that reaches a camera below the surface. Neither affects play.
import {exp} from './sim-math.ts';
import {WAVE_COMPONENTS} from './surface-motion.ts';

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

export const SEA_SAMPLE_GLSL = 'vec3 seaSample(vec2 p){vec3 s=vec3(0.);' + WAVE_COMPONENTS.map((w, i) =>
  `float phase${i}=p.x*${w.kx.toFixed(3)}+p.y*${w.ky.toFixed(3)}+wavePhase*${w.omega.toFixed(3)};s+=${w.amplitude.toFixed(3)}*vec3(sin(phase${i}),cos(phase${i})*${w.kx.toFixed(3)},cos(phase${i})*${w.ky.toFixed(3)});`).join('') + 'return s*waveScale;}';
