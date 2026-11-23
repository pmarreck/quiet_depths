// These mono MP3s use independent 80 kb/s MPEG-1 Layer III frames at 32 kHz.
// Fetch one compressed song and decode just the excerpt, including decoder preroll.
const frameBytes = 360;
const frameSeconds = 1152 / 32000;
const preroll = 3 * frameSeconds;
const seconds = 10;
const windowFrames = Math.ceil(seconds / frameSeconds) + 6;
export const songs = [1, 2, 3, 4, 5, 6, 7, 8] as const;
type Song = typeof songs[number];
const historyKey = 'quiet-depths-radio-history-v1';

export function radioWindow(bytes: number, choice: number) {
  const starts = Math.floor(bytes / frameBytes) - windowFrames + 1;
  if (starts < 1) throw new Error('Radio recording is shorter than an excerpt');
  const start = Math.floor(choice * starts) * frameBytes;
  return {start, end: start + windowFrames * frameBytes};
}

export class EveningRadio {
  private readonly context: BaseAudioContext;
  private readonly bus: AudioNode;
  private recent: Song[] = [];
  private loading: AbortController | null = null;
  private playing: {source: AudioBufferSourceNode; level: GainNode; at: number} | null = null;
  private readyAt = 0;

  constructor(context: BaseAudioContext, bus: AudioNode) {
    this.context = context;
    this.bus = bus;
    try {
      const history: unknown = JSON.parse(localStorage.getItem(historyKey) ?? '[]');
      if (Array.isArray(history)) this.recent = history.filter((id): id is Song => songs.includes(id)).slice(-2);
    } catch { /* Storage is optional in private or restricted browsing. */ }
  }

  async play(songChoice: number, clipChoice: number) {
    const c = this.context;
    if (this.loading || this.playing || c.currentTime < this.readyAt) return;
    const eligible = songs.filter(song => !this.recent.includes(song));
    const song = eligible[Math.floor(songChoice * eligible.length)];
    const request = new AbortController();
    this.loading = request;
    try {
      const response = await fetch(new URL(`radio/song${song}.mp3`, import.meta.url), {signal: request.signal});
      if (!response.ok) return;
      const file = await response.blob();
      const {start, end} = radioWindow(file.size, clipChoice);
      const buffer = await c.decodeAudioData(await file.slice(start, end).arrayBuffer());
      if (request.signal.aborted || buffer.duration < seconds + preroll) return;
      const source = c.createBufferSource(), level = c.createGain(), now = c.currentTime;
      source.buffer = buffer;
      level.gain.setValueAtTime(0, now);
      level.gain.linearRampToValueAtTime(.14, now + 1);
      level.gain.setValueAtTime(.14, now + seconds - 1);
      level.gain.linearRampToValueAtTime(0, now + seconds);
      source.connect(level).connect(this.bus);
      source.onended = () => {
        source.disconnect();
        level.disconnect();
        if (this.playing?.source === source) this.playing = null;
      };
      source.start(now, preroll, seconds);
      this.playing = {source, level, at: now};
      this.readyAt = now + seconds + 20;
      this.recent = [...this.recent.slice(-1), song];
      try { localStorage.setItem(historyKey, JSON.stringify(this.recent)); } catch { /* Keep session history. */ }
    } catch { /* An interrupted fetch or decode can retry at the next eligible slot. */ }
    finally { if (this.loading === request) this.loading = null; }
  }

  stop() {
    this.loading?.abort();
    this.loading = null;
    if (this.playing) {
      const {source, level, at} = this.playing;
      const now = this.context.currentTime, age = now - at;
      level.gain.cancelScheduledValues(now);
      level.gain.setValueAtTime(.14 * Math.max(0, Math.min(age, 1, seconds - age)), now);
      level.gain.linearRampToValueAtTime(0, now + .025);
      source.stop(now + .025);
      this.playing = null;
    }
  }
}
