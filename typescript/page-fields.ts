// The fields of a saved patrol that the page keeps beside the simulation: the
// photo archive, the number of its next photo, and the captain's name. The
// simulation never reads them, so they stay in TypeScript when the
// simulation runs in Elm; restore checks them here and fills an older save's
// archive, whichever simulation resumes the rest.
import {captainName} from './captain.ts';
import {validPhoto, PHOTO_BUDGET} from './photos.ts';

export const PAGE_FIELDS = ['photoArchive', 'photoSequence', 'captain'] as const;

type Fields = Record<string, unknown>;

// Whether a save's page fields may resume, filling an older save's archive
// and photo number.
export function restorePageFields(s: Fields): boolean {
  if (s.captain !== undefined && (typeof s.captain !== 'string' || !s.captain || s.captain !== captainName(s.captain))) return false;
  if (s.photoArchive === undefined) s.photoArchive = [];
  if (s.photoSequence === undefined) s.photoSequence = 1;
  const archive = s.photoArchive as Fields[];
  return Array.isArray(archive) && archive.length <= 24 && Number.isSafeInteger(s.photoSequence) && (s.photoSequence as number) >= 1 &&
    archive.every(p => validPhoto(p) && Number.isSafeInteger(p.id) && (p.id as number) > 0) && new Set(archive.map(p => p.id)).size === archive.length &&
    archive.reduce((n, p) => n + (p.image as string).length, 0) <= PHOTO_BUDGET;
}
