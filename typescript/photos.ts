// Photos holds real scene exposures and recon plates within a storage budget.
export const PHOTO_LIMIT = 24, PHOTO_BUDGET = 1400000;
const sources = new Set(['scope', 'drone', 'satellite']);

export interface Photo {id?: number | string; source: string; takenAt: number; image: string; caption?: unknown; [key: string]: unknown}
type Archive = {photoArchive?: unknown; photoSequence?: number};

export function validPhoto(p: unknown): p is Photo {
  if (!p || typeof p !== 'object') return false;
  const photo = p as Record<string, unknown>;
  return sources.has(photo.source as string) && Number.isFinite(photo.takenAt) && (photo.takenAt as number) >= 0 &&
    typeof photo.image === 'string' && photo.image.length < 300000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo.image);
}

export function photoArchive(s: Archive): Photo[] {
  if (!Array.isArray(s.photoArchive)) s.photoArchive = [];
  return s.photoArchive as Photo[];
}

export function recordExposure(s: Archive, metadata: Record<string, unknown>, capture: () => string | null | undefined) {
  const image = capture();
  return image ? recordPhoto(s, {...metadata, image}) : null;
}

export function recordPhoto(s: Archive, photo: unknown): Photo | null {
  if (!validPhoto(photo)) return null;
  const archive = photoArchive(s);
  s.photoSequence = Math.max(1, s.photoSequence || 1, ...archive.map(p => (Number(p.id) || 0) + 1));
  const p = JSON.parse(JSON.stringify({...photo, id: s.photoSequence++, caption: String(photo.caption || 'Photograph').slice(0, 200)})) as Photo;
  archive.push(p);
  while (archive.length > PHOTO_LIMIT || archive.reduce((n, v) => n + v.image.length, 0) > PHOTO_BUDGET) archive.shift();
  return p;
}

export function restorePhotos(raw: unknown): Photo[] {
  if (!Array.isArray(raw)) return [];
  const state: Archive = {photoArchive: [], photoSequence: 1};
  for (const p of raw.slice(-PHOTO_LIMIT)) if (validPhoto(p)) recordPhoto(state, p);
  return state.photoArchive as Photo[];
}
