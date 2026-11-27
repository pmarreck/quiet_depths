// Sources, rather than keys alone, make simultaneous touch/keyboard holds safe.
export class HeldInput {
  sources = new Map<unknown, string>();
  keys = new Set<string>();
  press(source: unknown, key: string) { this.sources.set(source, key); this.sync(); }
  release(source: unknown) { this.sources.delete(source); this.sync(); }
  clear() { this.sources.clear(); this.keys.clear(); }
  sync() { this.keys.clear(); for (const key of this.sources.values()) this.keys.add(key); }
}
