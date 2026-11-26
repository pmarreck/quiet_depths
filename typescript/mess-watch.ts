import {SYSTEM_KEYS} from './equipment.ts';
import {isOpponent,activeVolleys,fleetShotPose,type Volley} from './fleet-action.ts';
import {missions} from './mission-catalog.ts';

type MissionId=(typeof missions)[number]['id'];
type Point={x:number;y:number};
type Vessel=Point & {military:boolean;side?:'friendly'|'hostile';hull:number;tracking?:string};
type LaunchWatch=Point & {time:number;crewQuietUntil:number};
interface CrewWatch extends LaunchWatch {
  hull:number;systems:Record<string,number>;repairLimits:Record<string,number>;
  fuelLeak:number;fuelFire:number;water:number;projectiles:Point[];
  traffic?:{volleys:Volley[]};convoy?:{shot:Volley|null};battle?:{volleys:Volley[]};
  mission:MissionId;ships:Vessel[];aircraft:(Point & {hull:number;phase?:string})[];
  silent:boolean;alert:number;shock:number;flood:number;pressureAlarm:number;gunLoudUntil:number;
}
const combatPatrols=new Set<MissionId>(missions.filter(m=>m.actionStations).map(m=>m.id));
const nearby=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)<=2000;
export const launchWatchSeconds=90;

// Remember range at launch even when the crew audio is off or the shot has ended.
export function recordLocalLaunch(s:LaunchWatch,launcher:Point){
  if(nearby(s,launcher))s.crewQuietUntil=s.time+launchWatchSeconds;
}
export function crewOnAlert(s:CrewWatch,actionStations=true){
  if(actionStations&&combatPatrols.has(s.mission)||s.silent||s.alert>30||s.shock>0||s.flood>0||s.pressureAlarm||s.time<s.gunLoudUntil)return true;
  if(s.time<s.crewQuietUntil)return true;
  if(s.fuelLeak>0||s.fuelFire>0||s.water>4||s.hull<s.repairLimits.hull||
     SYSTEM_KEYS.some(key=>s.systems[key]<s.repairLimits[key]))return true;
  if(s.projectiles.some(shot=>nearby(s,shot)))return true;
  const nearbyVolley=(shot:Volley)=>shot.underwater&&nearby(s,fleetShotPose(shot,s.time));
  if(activeVolleys(s).some(nearbyVolley))return true;
  return s.ships.some(v=>v.hull>0&&isOpponent(v)&&(nearby(s,v)||v.tracking==='tracking'||v.tracking==='searching'))
    ||s.aircraft.some(v=>v.hull>0&&v.phase!=='gone'&&v.phase!=='down'&&nearby(s,v));
}

const breakfast=['eggs','morning','coffee','mess-a','mess-b'];
const dinner=['steak','chicken','ice-cream','mmm','horse','elephant'];
const coffee=['coffee','mess-a'];
export function crewPeriod(hour:number){
  if(hour>=0&&hour<6)return 'sleep';
  if(hour>=7&&hour<8)return 'breakfast';
  if(hour>=14&&hour<15)return 'coffee';
  if((hour>=12&&hour<12.55)||(hour>=18&&hour<18.55))return 'meal';
  if(hour>=19&&hour<23)return 'music';
  return hour>=23&&hour<23.25?'lights-out':null;
}
export function messLine(period:ReturnType<typeof crewPeriod>,choice:number,last?:string){
  const lines=period==='breakfast'?breakfast:period==='coffee'?coffee:period==='meal'?dinner:[];
  const pool=lines.filter(line=>line!==last);
  return pool[Math.floor(choice*pool.length)];
}
export const messClips=[...new Set([...breakfast,...dinner,...coffee,'goodnight','what-noise','hear-that'])];
