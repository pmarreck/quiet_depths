import {patrol} from './mission-catalog.ts';
import {hash01} from './surface-motion.ts';

type Point={x:number;y:number};
type Traffic=Point & {id:string;kind:string;military:boolean;incidental?:boolean;side?:string};
type Setup=Point & {mission:string;patrol:{seed:number};ships:Traffic[];site:Point|null};
export interface SearchArea extends Point {
  radius:number;targets:string[];recognized:string[];located:boolean;activeSeconds:number;protectedTime:number;
}
function objectives(s:Setup):Traffic[]{
  switch(s.mission){
    case 'big-kahuna':return s.ships.filter(v=>v.kind==='carrier');
    case 'intercept':return s.ships.filter(v=>v.id==='cobalt');
    case 'seek-and-destroy-sub':return s.ships.filter(v=>v.kind==='sub');
    case 'tiebreaker':return s.ships.filter(v=>v.side==='hostile');
    case 'wolf-in-the-henhouse':return s.ships.filter(v=>v.side==='friendly'&&v.id!=='plover');
    case 'seek-and-destroy':return s.ships.filter(v=>v.military&&v.kind==='merchant');
    case 'recon':case 'shadow':return s.ships.filter(v=>v.kind==='merchant');
    default:return s.ships;
  }
}
export function longPatrol(s:Setup){
  const goals=objectives(s),points=s.site?[s.site]:goals;
  const seed=s.patrol.seed,h=(n:number)=>hash01(seed,7100+n);
  const mean={x:0,y:0};
  for(const p of points){mean.x+=p.x/points.length;mean.y+=p.y/points.length;}
  const angle=h(0)*Math.PI*2,offset=350+800*h(1);
  const x=mean.x+Math.cos(angle)*offset,y=mean.y+Math.sin(angle)*offset;
  const margin=s.mission==='tiebreaker'?1200:600;
  const radius=margin+Math.max(1400,...points.map(p=>Math.hypot(p.x-x,p.y-y)));
  const search:SearchArea={x,y,radius,targets:s.site?[]:goals.map(v=>v.id),recognized:[],located:false,activeSeconds:0,protectedTime:0};
  // Enter from open water south of the nearest traffic, including incidental fishing vessels.
  const start={x:mean.x+(h(2)-.5)*5600,y:Math.min(...s.ships.map(v=>v.y),mean.y)-6600-1300*h(3)};
  const heading=(Math.atan2(x-start.x,y-start.y)*180/Math.PI+360)%360;
  const pickup={x:start.x+(h(4)-.5)*1900,y:start.y+1900+2200*h(5)};
  return {...start,heading,targetHeading:heading,search,...(s.mission==='sneaky-seamen'?{}:{home:pickup})};
}
export function advanceApproach(search:SearchArea,dt:number,timeRate:number){
  // Minutes of unpaused play, plus transit allowance for a cruising sub at 1x.
  const {searchSeconds,protectedTransit}=patrol;
  if(search.activeSeconds>=searchSeconds&&search.protectedTime>=protectedTransit)return false;
  const active=search.activeSeconds+dt/Math.max(1,timeRate);
  search.activeSeconds=active>searchSeconds-1e-8?searchSeconds:active;
  search.protectedTime+=dt;
  return true;
}
export const approachProgress=(a:SearchArea)=>Math.min(1,a.activeSeconds/patrol.searchSeconds,a.protectedTime/patrol.protectedTransit);
export function validSearch(s:Setup & {search?:SearchArea;time:number}){
  const a=s.search;if(!a)return false;
  const expected=s.site?[]:objectives({...s,ships:s.ships.filter(v=>!v.incidental)}).map(v=>v.id);
  return [a.x,a.y,a.radius,a.activeSeconds,a.protectedTime].every(Number.isFinite)&&a.radius>0&&
    a.activeSeconds>=0&&a.activeSeconds<=patrol.searchSeconds&&a.protectedTime>=0&&a.protectedTime<=s.time+.001&&
    typeof a.located==='boolean'&&Array.isArray(a.targets)&&a.targets.length===expected.length&&expected.every(id=>a.targets.includes(id))&&
    Array.isArray(a.recognized)&&a.recognized.length===new Set(a.recognized).size&&a.recognized.every(id=>expected.includes(id));
}
