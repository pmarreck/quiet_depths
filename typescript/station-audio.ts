export const interiorStation = (view: string) =>
  view === 'scope' || view === 'sonar' || view === 'chart' || view === 'photos';

type Boat = {depth: number; drone?: {depth: number}};
export function weatherMix(s: Boat, view: string, cameraDepth?: number) {
  const externalCamera = view === 'drone' || view === 'orbit' || view === 'replay';
  const depth = externalCamera ? cameraDepth ?? (view === 'drone' ? s.drone?.depth ?? s.depth : s.depth) : s.depth;
  const openAir = (view === 'tower' || view === 'gun') && s.depth <= 1 || externalCamera && depth <= 0;
  if (openAir) return {openAir, rain: .40, cutoff: 4400, thunder: 1.45, sea: 2.5, seaCutoff: 2.2};
  const hull = depth <= 2 ? 1 : .4 * Math.exp(-depth / 200);
  const sea = depth <= 2 ? 1 : .18 * Math.exp(-depth / 200);
  return {openAir, rain: .05 * hull, cutoff: depth <= 2 ? 850 : 330, thunder: .38, sea, seaCutoff: 1};
}

const underwaterSounds = new Set(['blast', 'detonation', 'implosion', 'collapse', 'creak', 'settling']);
export function stationMix<P extends {gain: number; cutoff: number; distance: number}>(sound: P, type: string, mix: ReturnType<typeof weatherMix>) {
  if (type === 'thunder') return {...sound, gain: sound.gain * mix.thunder, cutoff: Math.min(sound.cutoff, mix.cutoff)};
  if (!mix.openAir || !underwaterSounds.has(type)) return sound;
  // Preserve the nearby impact. Across the air/water boundary the distant tail
  // loses level and high frequencies as the listener moves out onto the deck.
  const distance = Math.min(1, Math.max(0, (sound.distance - 80) / 600));
  return {...sound, gain: sound.gain * (1 - .79 * distance), cutoff: sound.cutoff * (1 - .68 * distance)};
}
