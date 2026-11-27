import {save, type World} from './sim.ts';
import {photoArchive} from './photos.ts';
import {saveServiceRecord} from './service-record.ts';
import {recordOutcome} from './captain.ts';

export function resumablePatrol<P extends {status: string}>(saved: P | null | undefined, current: P | null | undefined): P | null {
  if (saved?.status === 'patrol') return saved;
  return current?.status === 'patrol' ? current : null;
}

// Browser storage can refuse a write at any time; report what was kept.
export function persistPatrol(storage: Storage, state: World, started: boolean) {
  if (!started) return false;
  if (state.status === 'patrol') storage.setItem('quiet-depths-v1', save({...state, photoArchive: []}));
  else storage.removeItem('quiet-depths-v1');
  let photosSaved = true, recordSaved = true;
  try { storage.setItem('quiet-depths-photos-v1', JSON.stringify(photoArchive(state))); } catch { photosSaved = false; }
  try { if (state.status !== 'patrol') saveServiceRecord(storage, state); } catch { recordSaved = false; }
  try { recordOutcome(storage, state); } catch { recordSaved = false; }
  return {photosSaved, recordSaved};
}
