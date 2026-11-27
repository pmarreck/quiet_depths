// A captain's lifetime record, kept per patrol so replaying one cannot inflate it.
const storagePrefix = 'quiet-depths-service-record-v1:';

type Ship = {military?: boolean; side?: string; playerDamaged?: boolean; hull: number; kind: string};
type Kills = {ships: number; submarines: number};
type RecordStore = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;

export function patrolKills(state: {ships: Ship[]}): Kills {
  const credited = state.ships.filter(ship => ship.military && ship.side !== 'friendly' && ship.playerDamaged && ship.hull === 0);
  const submarines = credited.filter(ship => ship.kind === 'sub').length;
  return {ships: credited.length - submarines, submarines};
}

function readEntry(storage: RecordStore, key: string): Kills {
  try {
    const entry = JSON.parse(storage.getItem(key) as string);
    if (Number.isSafeInteger(entry?.ships) && entry.ships >= 0 && Number.isSafeInteger(entry.submarines) && entry.submarines >= 0) return entry;
  } catch {}
  return {ships: 0, submarines: 0};
}

export function saveServiceRecord(storage: RecordStore, state: {patrolId?: string; ships: Ship[]}): void {
  if (!state.patrolId) return;
  const current = patrolKills(state);
  if (!current.ships && !current.submarines) return;
  const key = storagePrefix + state.patrolId, previous = readEntry(storage, key);
  const ships = Math.max(previous.ships, current.ships), submarines = Math.max(previous.submarines, current.submarines);
  if (ships === previous.ships && submarines === previous.submarines) return;
  storage.setItem(key, JSON.stringify({ships, submarines}));
}

export function serviceRecord(storage: RecordStore) {
  const record = {ships: 0, submarines: 0, doubleHunts: 0};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(storagePrefix)) continue;
    const entry = readEntry(storage, key);
    record.ships += entry.ships; record.submarines += entry.submarines; record.doubleHunts += Number(entry.submarines >= 2);
  }
  return record;
}
