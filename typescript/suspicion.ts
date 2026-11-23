import {profiles,scanSector,type Instrument,type Profile} from './sonar-imager.ts';
import {hash01} from './surface-motion.ts';

type Point={x:number;y:number};
type Clue=Point & {time:number};
type Watch=Point & {alert:number;heading:number;id:string;kind:string;depth?:number;clue?:Clue;nextInquiry?:number};
type Patrol=Point & {time:number;heading:number;depth:number;patrol:{seed:number};difficulty:{pingDetection:number;detection:number;pursuit:number}};

export const searchSeconds=(pursuit:number)=>100*pursuit;
export function suspicionLabel(level:number,ships:readonly {tracking?:string|null}[]) {
  if(level>=60&&ships.some(v=>v.tracking==='tracking'))return 'Under pursuit';
  if(level>=30)return 'Searching';
  if(level>=12)return 'Suspicious';
  return 'No suspicion';
}

export function leaveClue(s:Patrol,v:Watch,amount:number,observed:Point & {time:number}=s){
  // An encounter clue names a chart square. It supplies no firing solution.
  const square=600;
  v.clue={x:(Math.floor(observed.x/square)+.5)*square,y:(Math.floor(observed.y/square)+.5)*square,time:observed.time};
  v.alert=Math.min(100,v.alert+amount);
}
export function imagerClue(s:Patrol,v:Watch,mode:Instrument,profile:Profile,beat:number){
  const p=profiles[profile];
  if(Math.hypot(v.x-s.x,v.y-s.y)>p.range*1.5)return;
  const direct=scanSector(s,v,mode,p.range);
  const risk=p.exposure*(direct?1:.16)*s.difficulty.pingDetection*s.difficulty.detection;
  let key=beat*157;
  for(const letter of v.id)key=Math.imul(key,31)+letter.charCodeAt(0);
  if(hash01(s.patrol.seed,key)<risk)leaveClue(s,v,direct?24:12);
}
export function searchClue(s:Patrol,v:Watch,dt:number){
  if(!v.clue)return false;
  if(s.time-v.clue.time>searchSeconds(s.difficulty.pursuit)||v.alert<1){
    delete v.clue;delete v.nextInquiry;return false;
  }
  const dx=v.clue.x-v.x,dy=v.clue.y-v.y;
  if(Math.hypot(dx,dy)>140){
    const course=Math.atan2(dx,dy)*180/Math.PI;
    const turn=((course-v.heading+540)%360)-180;
    v.heading=(v.heading+Math.min(dt,Math.max(-dt,turn))+360)%360;
  }
  v.nextInquiry??=s.time+(v.kind==='sub'?20:9);
  if(s.time<v.nextInquiry)return false;
  v.nextInquiry=s.time+(v.kind==='sub'?70:35);
  return true;
}
