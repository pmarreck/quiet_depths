import {hash01} from './surface-motion.ts';

export const DAY_SECONDS=2880;
const epoch=Date.UTC(1972,0,1),dayMs=86400000;
const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
// Successive primary phases, beginning with new moon on 17 December 1971.
// Minutes from 1972-01-01 0000 UTC. NASA, Phases of the Moon 1901–2000:
// https://eclipse.gsfc.nasa.gov/phase/phases1901.html
const phases=[-20457,-9985,-220,10891,22252,32249,42418,53951,64829,74480,85152,96905,107255,116772,127925,139664,149551,159165,170684,182186,191768,201676,213387,224482,233970,244301,256006,266605,276219,287026,298523,308642,318566,329829,340942,350688,361048,372673,383287,392836,403688,415495,425605,435161,446481,458221,467947,477705,489384,500796,510345,520467,532302,543207,552808,563405];
export const sailingDay=(seed:number)=>Math.floor(hash01(seed,1972366)*366);
export function moonCycle(day:number){
 const minute=day*1440;
 let lo=0,hi=phases.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(phases[mid]<=minute)lo=mid;else hi=mid;}
 const phase=(lo+(minute-phases[lo])/(phases[lo+1]-phases[lo]))/4;
 return phase-Math.floor(phase);
}
const dates=new Map<number,{date:string;holiday:'christmas'|'new-year'|null}>();
export function patrolCalendar(startDay:number,startHour:number,time:number){
 const day=startDay+startHour/24+time/DAY_SECONDS,index=Math.floor(day);
 let entry=dates.get(index);
 if(!entry){const d=new Date(epoch+index*dayMs),month=d.getUTCMonth(),n=d.getUTCDate();
  entry={date:String(n).padStart(2,'0')+' '+months[month]+' '+d.getUTCFullYear(),holiday:month===0&&n===1?'new-year':month===11&&n===25?'christmas':null};
  dates.set(index,entry);
 }
 const cycle=moonCycle(day),angle=2*Math.PI*cycle;
 return {...entry,day:index,cycle,illumination:(1-Math.cos(angle))/2};
}
