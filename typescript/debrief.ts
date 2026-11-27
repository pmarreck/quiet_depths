// The end-of-patrol debrief records what actually happened, newest last.
export interface DebriefEntry {time: number; text: string}

export function addDebrief(state: {debrief?: DebriefEntry[]; time: number}, text: string): void {
  const entries = state.debrief ??= [];
  const last = entries.at(-1);
  if (last?.text === text && state.time - last.time < 4) return;
  entries.push({time: state.time, text});
  if (entries.length > 48) entries.shift();
}

export function validDebrief(entries: unknown, time: number): boolean {
  return Array.isArray(entries) && entries.length <= 48 && entries.every(entry => entry && Number.isFinite(entry.time) &&
    entry.time >= 0 && entry.time <= time && typeof entry.text === 'string' && entry.text.length <= 220);
}
