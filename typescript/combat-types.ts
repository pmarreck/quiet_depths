import type {Sound} from './acoustics.ts';
import type {LogEntry} from './mechanics.ts';
import type {DebriefEntry} from './debrief.ts';
import type {Report} from './hostile-tracks.ts';
import type {Contact} from './track-estimates.ts';
import type {EnvironmentConfig} from './environment.ts';

// The slice of patrol state that weapons, aircraft and ship damage share.
export type Point = {x: number; y: number};
export type Point3 = Point & {depth: number};
export type Aloft = Point & {altitude: number};
export interface Ship extends Point {
  id: string; name: string; kind: string; military?: boolean; side?: 'friendly' | 'hostile'; hull: number; heading: number; speed: number; depth?: number; pitch?: number;
  sinkDepth?: number; flood?: number; disabled?: boolean; alert: number; attack: number; report?: Report; noise?: number; torpedoDecoys?: number;
  lastTubeSide?: number; playerDamaged?: boolean; lastHitLog?: number; directHits?: number; settled?: boolean; sunkAt?: number; nextCreak?: number;
  collapsed?: boolean; collapsedAt?: number; fighterCount?: number; incidental?: boolean;
}
export interface DecoyTarget extends Point3 {expiresAt: number}
export interface Torpedo extends Point3 {
  id: number; owner: string; runLimit: number; traveled: number; age: number; intended: string | null; lock: string | null; pingAge: number;
  orderedHeading: number; orderedDepth: number; pitch: number; tubeSide: number; searchAge: number; runOut: number; searchDirection: number;
  decoysChecked: string[]; decoyTarget: DecoyTarget | null; diverted: boolean; heading: number; path: (Point3 & {time: number})[];
  launcher?: string | null; aim?: Point | null; decoyCheckedAt?: number;
}
export interface Round extends Aloft {id: number; owner: string; vx: number; vy: number; vz: number; age: number; tracer: boolean; previous?: Aloft}
export interface Aircraft extends Aloft {
  id: string; name: string; heading: number; speed: number; hull: number; phase: string; takeoffUntil: number; attack: number; bank: number;
  bombDropped: boolean; previous?: Aloft; egress?: number;
}
export interface AirSupport {status: string; requestedAt: number | null; launchAt: number | null; base: Point; lastKnown: Report | null}
export interface Blast extends Point3 {id: number; delay: number; totalDelay: number; airTime?: number; airHeight?: number; age: number; exploded: boolean; kind: string}
export interface Impact extends Aloft {id: number; time: number; kind: string}
export interface CombatWorld extends Point3 {
  time: number; heading: number; pitch: number; roll?: number; speed: number; status: string; mission: string; rng: number;
  patrol: {seed: number}; environment: EnvironmentConfig; wavePhase?: number;
  difficulty: {damage?: number; airSupport?: boolean; detection?: number; [key: string]: unknown};
  systems: Record<string, number>; scope: boolean; scopeTravel?: number; torps: number; runSetting: number; tubeReadyAt: Record<'port' | 'starboard', number>;
  contacts: Contact[]; ships: Ship[]; projectiles: Torpedo[]; gunRounds: Round[]; impacts: Impact[]; aircraft: Aircraft[]; airSupport: AirSupport; blasts: Blast[];
  gun: {ammo: number; cooldown: number; shots: number; angle: number; elevation: number}; gunLoudUntil: number; weaponSequence: number;
  soundSequence: number; acoustics: Sound[]; events: LogEntry[]; debrief?: DebriefEntry[]; reports: {id: string; text: string; time: number}[];
  crewQuietUntil: number; noisemaker?: Point3 & {time: number};
}
