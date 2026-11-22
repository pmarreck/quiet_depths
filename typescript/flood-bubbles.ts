import {hash01} from './surface-motion.ts';

type Point={x:number;y:number;z:number};
export type Leak=Point & {id:string;rate:number};
type Bubble=Point & {born:number;phase:number;rise:number;life:number;width:number};
type Emitter={point:Point;next:number;sequence:number;seed:number};
const capacity=768;

// Each patrol keeps its own visual history. Positions are in the water's
// coordinate frame once released, so a turn or a repair leaves the trail behind.
export class FloodBubbles {
  readonly positions=new Float32Array(capacity*3);
  readonly sizes=new Float32Array(capacity);
  private bubbles:Bubble[]=[];
  private emitters=new Map<string,Emitter>();
  private clock:number|null=null;
  update(now:number,leaks:readonly Leak[],surface:(x:number,z:number)=>number):number {
    const before=this.clock??now;
    if(now<before||now-before>5){this.bubbles=[];this.emitters.clear();}
    this.clock=now;
    for(const id of this.emitters.keys())if(!leaks.some(l=>l.id===id&&l.rate>0))this.emitters.delete(id);
    for(const leak of leaks){
      if(!(leak.rate>0))continue;
      let stream=this.emitters.get(leak.id);
      if(!stream){
        const seed=Array.from(leak.id).reduce((n,c)=>((n*31)^c.charCodeAt(0))>>>0,17);
        stream={point:{...leak},next:now,sequence:0,seed};this.emitters.set(leak.id,stream);
      }
      while(stream.next<=now&&this.bubbles.length<capacity){
        const t=stream.next,frac=now>before?Math.max(0,Math.min(1,(t-before)/(now-before))):1;
        const seq=stream.sequence++,random=(i:number)=>hash01(stream.seed,seq*7+i);
        const x=stream.point.x+(leak.x-stream.point.x)*frac,y=stream.point.y+(leak.y-stream.point.y)*frac,z=stream.point.z+(leak.z-stream.point.z)*frac;
        this.bubbles.push({x:x+(random(1)-.5)*.18,y,z:z+(random(2)-.5)*.18,born:t,
          phase:random(3)*2*Math.PI,rise:1.1+random(4)*.9,life:12+random(5)*10,width:.16+random(6)*.27});
        stream.next+= (.16+random(0)*.08)/(1+Math.min(12,leak.rate)*.07);
      }
      if(stream.next<now)stream.next=now;
      stream.point={...leak};
    }
    let count=0;
    for(const b of this.bubbles){
      const age=now-b.born;if(age>=b.life)continue;
      const wobble=.09+Math.min(.5,age*.035);
      const x=b.x+age*.065+wobble*(Math.sin(b.phase+age*2.4)-Math.sin(b.phase));
      const y=b.y+b.rise*age,z=b.z+wobble*(Math.cos(b.phase+age*2)-Math.cos(b.phase));
      if(y>=surface(x,z))continue;
      this.positions[3*count]=x;this.positions[3*count+1]=y;this.positions[3*count+2]=z;
      this.sizes[count]=b.width*(1+Math.min(.6,age*.09))*Math.min(1,(b.life-age)/2);
      this.bubbles[count++]=b;
    }
    this.bubbles.length=count;
    return count;
  }
}
