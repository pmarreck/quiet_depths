import {scopeEyeHeight,scopeExtension} from './periscope.ts';
import {boatPoint,surfaceHeight,surfaceMotion} from './surface-motion.ts';
import {SUB_DESIGN as D} from './hull-design.ts';

type Sea = Parameters<typeof surfaceMotion>[1];
export interface WakeSample {x:number;y:number;heading:number;time:number;width:number;strength:number}
interface Boat {x:number;y:number;heading:number;depth:number;pitch:number;speed:number;scope:boolean;systems?:{periscope:number};time:number;wake:WakeSample[]}
type Column = {forward:number;top:number;base:number;beam:number};
type Point = ReturnType<typeof boatPoint>;

const lifetime = 26;
const hullProfile = D.stations.map(({z,radius})=>({forward:-z,top:radius,base:-radius,beam:radius}));
// Cross sections of the capsule used for the sail in the exterior model.
const sailProfile = Array.from({length:9},(_,i)=>{
 const angle=i*Math.PI/8,cap=D.sailRadius*Math.sin(angle),center=D.bridgeRoof-D.sailRadius-D.sailBarrel/2;
 return {forward:-D.bridgeZ+D.sailRadius*D.sailStretch*Math.cos(angle),
  top:center+D.sailBarrel/2+cap,base:center-D.sailBarrel/2-cap,beam:D.sailRadius};
});

function surfaceCrossing(s:Boat,sea:Sea):WakeSample|undefined {
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
 if(s.wake.length&&s.time-s.wake[0].time>lifetime)s.wake=s.wake.filter(p=>s.time-p.time<=lifetime);
 const last=s.wake.at(-1);
 if(last&&s.time-last.time<1)return;
 const sample=surfaceCrossing(s,sea);
 if(sample)s.wake.push(sample);
}

// Each crossing emits a pair of foam crests. Width is their outward travel
// per second. Thickening and fading the crests leaves open water between them.
export class WakeRibbons {
 // Up to 28 saved crossings plus the live bow, with extra rows near the tip.
 private readonly rows=29*4;
 readonly positions=new Float32Array(this.rows*6*3);
 readonly foam=new Float32Array(this.rows*6);
 readonly indices=new Uint16Array(this.rows*24);

 update(s:Boat,sea:Sea):number {
  const trail=s.wake??[];
  if(!trail.length)return 0;
  const last=trail.at(-1);
  const tip=last?.time===s.time?undefined:surfaceCrossing(s,sea);
  let vertices=0,count=0;
  const row=(x:number,y:number,heading:number,time:number,width:number,strength:number,connect:boolean)=>{
   const age=Math.max(0,s.time-time),distance=width*age;
   const spread=distance+3.8*strength*Math.sqrt(-Math.expm1(-distance));
   const thickness=Math.min(spread,(.23+1.4*strength)*(1+.075*age));
   const angle=heading*Math.PI/180,east=Math.cos(angle),north=-Math.sin(angle);
   const alpha=Math.sqrt(strength)*Math.max(0,1-age/lifetime)*.94;
   for(const side of [-1,1]){
    const start=vertices;
    for(let edge=-1;edge<=1;edge++){
     const offset=side*(spread+edge*thickness),px=x+east*offset,py=y+north*offset;
     this.positions[vertices*3]=px;
     this.positions[vertices*3+1]=surfaceHeight(px,py,s.time,sea)+.105;
     this.positions[vertices*3+2]=-py;
     this.foam[vertices++]=edge===0?alpha:0;
    }
    if(connect)for(let j=start;j<start+2;j++){
     this.indices[count++]=j-6;this.indices[count++]=j;this.indices[count++]=j-5;
     this.indices[count++]=j-5;this.indices[count++]=j;this.indices[count++]=j+1;
    }
   }
  };
  let previous:WakeSample|undefined;
  for(let i=0;i<trail.length+(tip?1:0);i++){
   const p=i<trail.length?trail[i]:tip!;
   if(s.time-p.time>lifetime)continue;
   const a=previous,turn=a?((p.heading-a.heading+540)%360)-180:0;
   const connect=!!a&&p.time-a.time<2&&Math.abs(turn)<90;
   if(a&&connect&&s.time-p.time<3){
    for(let j=1;j<4;j++){
     const f=j/4;
     row(a.x+(p.x-a.x)*f,a.y+(p.y-a.y)*f,a.heading+turn*f,a.time+(p.time-a.time)*f,
      a.width+(p.width-a.width)*f,a.strength+(p.strength-a.strength)*f,true);
    }
   }
   row(p.x,p.y,p.heading,p.time,p.width,p.strength,connect);
   previous=p;
  }
  return count;
 }
}
