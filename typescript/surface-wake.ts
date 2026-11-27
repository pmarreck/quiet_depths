// Mirrored in elm/Sim/SurfaceWake.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {scopeEyeHeight,scopeExtension} from './periscope.ts';
import {boatPoint,surfaceHeight,surfaceMotion} from './surface-motion.ts';
import {SUB_DESIGN as D} from './hull-design.ts';

type Sea = Parameters<typeof surfaceMotion>[1];
export interface WakeSample {x:number;y:number;heading:number;time:number;width:number;strength:number}
interface Boat {x:number;y:number;heading:number;depth:number;pitch:number;speed:number;scope:boolean;systems?:{periscope:number};time:number;wake:WakeSample[]}
type Column = {forward:number;top:number;base:number;beam:number};
type Point = ReturnType<typeof boatPoint>;

// Seconds a crossing stays in the trail.
export const wakeLifetime = 26;
const hullProfile = D.stations.map(({z,radius})=>({forward:-z,top:radius,base:-radius,beam:radius}));
// Cross sections of the capsule used for the sail in the exterior model.
const sailProfile = Array.from({length:9},(_,i)=>{
 const angle=i*Math.PI/8,cap=D.sailRadius*Math.sin(angle),center=D.bridgeRoof-D.sailRadius-D.sailBarrel/2;
 return {forward:-D.bridgeZ+D.sailRadius*D.sailStretch*Math.cos(angle),
  top:center+D.sailBarrel/2+cap,base:center-D.sailBarrel/2-cap,beam:D.sailRadius};
});

export function surfaceCrossing(s:Boat,sea:Sea):WakeSample|undefined {
 const speed=Math.abs(s.speed);
 if(s.depth>23||speed<.1)return;
 const hull=surfaceMotion(s,sea,s.time),angle=s.heading*Math.PI/180,sign=Math.sign(s.speed);
 const east=sign*Math.sin(angle),north=sign*Math.cos(angle);
 let leading=-Infinity,x=0,y=0,exposure=0;
 const clearance=(p:Point)=>-p.depth-surfaceHeight(p.x,p.y,s.time,sea);
 function consider(a:Point,b:Point,f:number){
  const px=a.x+(b.x-a.x)*f,py=a.y+(b.y-a.y)*f,along=(px-s.x)*east+(py-s.y)*north;
  if(along>leading){leading=along;x=px;y=py;}
 }
 function section({forward,top,base,beam}:Column){
  const upper=boatPoint(hull,{forward,down:-top}),lower=boatPoint(hull,{forward,down:-base});
  const high=clearance(upper),low=clearance(lower);
  if(high>=0&&low<=0){
   consider(upper,lower,high===low?0:high/(high-low));
   exposure=Math.max(exposure,Math.min(high,beam));
  }
  return {upper,lower,high,low};
 }
 function profile(columns:Column[]){
  let a=section(columns[0]);
  for(let i=1;i<columns.length;i++){
   const b=section(columns[i]);
   // The leading intersection usually falls between two model stations.
   // A pitched-up bow can meet the water along its underside.
   if((a.high>0)!==(b.high>0))consider(a.upper,b.upper,a.high/(a.high-b.high));
   if((a.low>0)!==(b.low>0))consider(a.lower,b.lower,a.low/(a.low-b.low));
   a=b;
  }
 }
 profile(hullProfile);
 profile(sailProfile);
 section({forward:-29.6,top:4.3,base:.8,beam:.13}); // Upper rudder, when backing down
 section({forward:16.7,top:5.95,base:5.15,beam:.7}); // Deck mount
 section({forward:-D.bridgeZ,top:D.bridgeRoof+.97,base:D.bridgeRoof,beam:.55});
 section({forward:2.6,top:15,base:11,beam:.09}); // Fixed snorkel
 section({forward:1.6,top:13.5,base:10.5,beam:.06}); // Aerial
 if(scopeExtension(s)>0&&s.systems?.periscope!==0)section({forward:-D.scopeZ,top:scopeEyeHeight(s),base:scopeEyeHeight(s)-6,beam:.16});
 if(!exposure)return;
 const exposed=Math.sqrt(exposure/D.hullRadius);
 return {x,y,time:s.time,heading:(s.heading+(sign<0?180:0))%360,
  width:speed*.514444*(.22+.20*exposed),strength:Math.min(1,speed/10)*exposed};
}

export function recordWake(s:Boat,sea:Sea){
 if(s.wake.length&&s.time-s.wake[0].time>wakeLifetime)s.wake=s.wake.filter(p=>s.time-p.time<=wakeLifetime);
 const last=s.wake.at(-1);
 if(last&&s.time-last.time<1)return;
 const sample=surfaceCrossing(s,sea);
 if(sample)s.wake.push(sample);
}
