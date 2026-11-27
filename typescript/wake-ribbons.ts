// The wake's foam ribbons for the renderer, drawn from the trail the
// simulation records in surface-wake.ts.
import {expm1} from './sim-math.ts';
import {surfaceHeight} from './surface-motion.ts';
import {recordWake,surfaceCrossing,wakeLifetime,type WakeSample} from './surface-wake.ts';

type Boat = Parameters<typeof recordWake>[0];
type Sea = Parameters<typeof recordWake>[1];

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
   const spread=distance+3.8*strength*Math.sqrt(-expm1(-distance));
   const thickness=Math.min(spread,(.23+1.4*strength)*(1+.075*age));
   const angle=heading*Math.PI/180,east=Math.cos(angle),north=-Math.sin(angle);
   const alpha=Math.sqrt(strength)*Math.max(0,1-age/wakeLifetime)*.94;
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
   if(s.time-p.time>wakeLifetime)continue;
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
