import {save, type World} from './sim.ts';
import {restore} from './simulation.ts';
import {slotCount, readStorage, replaceStorage, type Backup} from './patrol-transfer.ts';

const storeName = 'patrols';
export const SLOT_COUNT = slotCount;

export interface SlotEntry {id: number; version: number; revision: string; image: string; label: string; snapshot: string; station: unknown}
type Finish<T> = (value: T) => void;
type Fail = (error: unknown) => void;

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: Finish<T>, fail: Fail) => void): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('quiet-depths-slots', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let result: T, problem: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(problem || tx.error || new Error('Save storage unavailable.'));
      const fail = (error: unknown) => { problem = error; tx.abort(); };
      try { run(tx.objectStore(storeName), value => { result = value; }, fail); } catch (error) { fail(error); }
    });
  } finally { db.close(); }
}

export function allSlotEntries(): Promise<SlotEntry[]> {
  return transaction<SlotEntry[]>('readonly', (store, done) => {
    const read = store.getAll(IDBKeyRange.bound(1, SLOT_COUNT));
    read.onsuccess = () => done(read.result);
  });
}
export async function listSlots() { return (await allSlotEntries()).map(({id, revision, image, label}) => ({id, revision, image, label})); }

function slotEntry(id: number, patrol: {status: string}, image: string, label: string, station: unknown): SlotEntry {
  if (!Number.isInteger(id) || id < 1 || id > SLOT_COUNT || patrol.status !== 'patrol') throw new Error('Choose an active patrol and a valid slot.');
  return {id, version: 1, revision: crypto.randomUUID(), image, label, snapshot: save(patrol as World), station};
}

export function writeSlot(id: number, expected: string, state: World, image: string, label: string, station: unknown = null) {
  const entry = slotEntry(id, state, image, label, station);
  return transaction<undefined>('readwrite', (store, done, fail) => {
    const read = store.get(id);
    read.onsuccess = () => {
      if ((read.result?.revision ?? '') !== expected) { fail(new Error('This slot changed in another window. Review it before saving.')); return; }
      store.put(entry);
    };
  });
}

export function unpackSlot(entry: SlotEntry) {
  const patrol = entry.version === 1 && restore(entry.snapshot);
  if (!patrol || patrol.status !== 'patrol') throw new Error('This saved patrol could not be read.');
  return {id: entry.id, patrol, image: entry.image, label: entry.label, station: entry.station ?? null};
}

export async function readSlotEntry(id: number, expected: string) {
  const entry = await transaction<SlotEntry | undefined>('readonly', (store, done) => {
    const read = store.get(id);
    read.onsuccess = () => done(read.result);
  });
  if (!entry || entry.revision !== expected) throw new Error('This slot changed in another window. Select it again.');
  return unpackSlot(entry);
}
export async function loadSlot(id: number, expected: string) { return (await readSlotEntry(id, expected)).patrol; }

export async function installBackup(storage: Storage, backup: Backup, token: string): Promise<void> {
  let previous: ReturnType<typeof readStorage> | null = null;
  try {
    await transaction<undefined>('readwrite', (store, done, fail) => {
      // Hold the slot write transaction while swapping the local keyspace.
      const ready = store.getAllKeys();
      ready.onsuccess = () => {
        try {
          for (const key of ready.result) if (typeof key === 'number') store.delete(key);
          for (const s of backup.slots) store.put(slotEntry(s.id, s.patrol, s.image, s.label, s.station));
          store.put({id: token, setup: backup.setup, started: backup.started, current: backup.current});
          previous = readStorage(storage);
          replaceStorage(storage, backup.localStorage);
        } catch (error) { fail(error); }
      };
    });
  } catch (error) {
    if (previous !== null) replaceStorage(storage, previous);
    throw error;
  }
}

export function importedSession(token: string, remove = false) {
  return transaction<unknown>(remove ? 'readwrite' : 'readonly', (store, done) => {
    const read = remove ? store.delete(token) : store.get(token);
    read.onsuccess = () => done(read.result);
  });
}
