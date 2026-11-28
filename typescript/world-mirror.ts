// Keeps the page's patrol object in step with the world the Elm simulation
// sends back, the way the TypeScript simulation changed it in place. The
// object, its records and its lists keep their identity. In a list, a record
// carrying an id merges into the old record with that id; any other entry
// equal to an old one keeps the old one; only new entries are new objects.
// So a reader holding a ship, caching by a record, or comparing the newest
// log line by identity keeps working as it did.

type Fields = Record<string, unknown>;

const isRecord = (v: unknown): v is Fields => !!v && typeof v === 'object' && !Array.isArray(v);

// Tells apart every value a reply can hold, -0, NaN and the infinities included.
const key = (v: unknown): string => JSON.stringify(v, (_, x) =>
  typeof x === 'number' && (Object.is(x, -0) || !Number.isFinite(x)) ? '\u0000' + (Object.is(x, -0) ? '-0' : String(x)) : x);

function mergeRecord(old: Fields, next: Fields, keep: readonly string[] = []): Fields {
  for (const k of Object.keys(old)) if (!(k in next) && !keep.includes(k)) delete old[k];
  for (const [k, v] of Object.entries(next)) old[k] = merge(old[k], v);
  return old;
}

function merge(old: unknown, next: unknown): unknown {
  if (Array.isArray(next)) return Array.isArray(old) ? mergeList(old, next) : next;
  if (isRecord(next)) return isRecord(old) ? mergeRecord(old, next) : next;
  return next;
}

function mergeList(old: unknown[], next: unknown[]): unknown[] {
  const byId = new Map<unknown, Fields>(), byKey = new Map<string, unknown[]>();
  for (const o of old) {
    if (isRecord(o) && o.id !== undefined && !byId.has(o.id)) { byId.set(o.id, o); continue; }
    const k = key(o), same = byKey.get(k);
    if (same) same.push(o); else byKey.set(k, [o]);
  }
  const merged = next.map(n => {
    if (isRecord(n) && n.id !== undefined) {
      const o = byId.get(n.id);
      if (!o) return n;
      byId.delete(n.id);
      return mergeRecord(o, n);
    }
    const same = byKey.get(key(n));
    return same?.length ? same.shift() : n;
  });
  old.length = 0;
  old.push(...merged);
  return old;
}

// Refreshes `mirror` to hold exactly `next`, keeping the fields named in
// `keep`, which only the page holds.
export function refreshMirror(mirror: object, next: object, keep: readonly string[] = []): void {
  mergeRecord(mirror as Fields, next as Fields, keep);
}
