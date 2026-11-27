// Mirrored in elm/Sim/SonarTransmitters.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
// The imaging sonars as the simulation sees them: which instruments are
// transmitting, how far each profile reaches, how much it exposes the boat to
// a listening enemy, and what falls inside each instrument's beam. Drawing
// the recorder paper is display work and lives in sonar-imager.ts.
export type Instrument = 'scribbler' | 'painter';
export type Profile = 'survey' | 'detail';
export const instruments:readonly Instrument[]=['scribbler','painter'];
export type Transmitters=Record<Instrument,Profile|null>;
export const freshTransmitters=():Transmitters=>({scribbler:null,painter:null});
export function validTransmitters(t:Transmitters){
  return !!t&&instruments.every(mode=>t[mode]===null||t[mode]==='survey'||t[mode]==='detail');
}
export function transmissionNotice(t:Transmitters,online:boolean){
  const names=instruments.filter(mode=>t[mode]).map(mode=>mode==='scribbler'?'Scribbler':'Painter');
  return names.length?names.join(' + ')+(online?' transmitting · Increased detection risk':' armed · Sonar offline'):'';
}
// Fictional instrument presets: listening range in meters and how readily a
// transmission gives the boat away.
export const transmitterProfiles = {
  survey: {range:1600, exposure:.24},
  detail: {range:650, exposure:.56},
} as const satisfies Record<Profile,{range:number;exposure:number}>;
type Pose = {x:number; y:number; depth:number; heading:number};
const radians = Math.PI/180;

export function scanSector(eye:Pose, object:{x:number;y:number;depth?:number}, mode:Instrument, range:number) {
  const dx=object.x-eye.x, dy=object.y-eye.y, a=eye.heading*radians;
  const along=dx*Math.sin(a)+dy*Math.cos(a), across=dx*Math.cos(a)-dy*Math.sin(a);
  const dz=(object.depth??0)-eye.depth;
  if(Math.hypot(dx,dy,dz)>range)return false;
  // The Painter's cone admits only objects ahead: |across| < 1.2·along fails when along <= 0.
  return mode==='painter' ? Math.abs(across)<along*1.2 && Math.abs(dz)<along*.65 :
    dz>=0 && Math.abs(along)<Math.max(14,Math.abs(across)*.10);
}
