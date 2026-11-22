import {DRONE_PARTS,operatingFraction} from './equipment.ts';

type DronePart=typeof DRONE_PARTS[number];
type DockedDrone=Record<DronePart,number> & {mode:string;repairLimits:Record<DronePart,number>};
interface Boat {pressureAlarm:number; repair:number; hull:number; water:number; flood:number;
  systems:Record<string,number>;repairLimits:Record<string,number>;drone:DockedDrone;
  engine:string;depth:number;fuel:number;battery:number}
const needsMajorRepair=(value:number,limit:number)=>value>0 && value<50 && value<limit;
export function seriousRepairs(s:Boat){
  const drone=s.drone,powered=s.battery>1 ||
    (s.engine==='diesel'&&s.depth<=14&&s.fuel>0&&operatingFraction(s.systems.engine)>0);
  if(drone.mode==='stowed'&&powered&&s.systems.crew>0&&DRONE_PARTS.some(k=>needsMajorRepair(drone[k],drone.repairLimits[k])))return true;
  if(s.repair<=0)return false;
  return s.flood>0 || s.water>4 || needsMajorRepair(s.hull,s.repairLimits.hull) ||
    Object.entries(s.systems).some(([key,value])=>needsMajorRepair(value,s.repairLimits[key]));
}

// One rising horn sweep. The softer layer supplies the slightly beating
// upper partial of a mechanical klaxon without a repeating chirp.
export function redAlertSound(c:AudioContext,output:AudioNode,quiet:boolean){
  const t=c.currentTime,filter=c.createBiquadFilter(),gain=c.createGain();
  filter.type='lowpass';filter.frequency.value=1700;filter.Q.value=.7;
  filter.connect(gain).connect(output);
  const peak=quiet?.080:.34;
  gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(peak,t+.085);
  gain.gain.setValueAtTime(peak,t+1.15);gain.gain.exponentialRampToValueAtTime(.0001,t+1.37);
  for(const [start,end,type] of [[315,640,'sawtooth'],[473,958,'triangle']] as const){
    const o=c.createOscillator();o.type=type;o.frequency.setValueAtTime(start,t);
    o.frequency.linearRampToValueAtTime(end,t+1.2);o.connect(filter);o.start(t);o.stop(t+1.38);
  }
}
