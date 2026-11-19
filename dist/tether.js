import {tetherAttachment,droneTetherAttachment,droneStatus} from './vehicle-status.js';
import {environmentAt} from './environment.js';

// The reel pays out only what is needed. Bounded droop and current-driven
// flutter prevent a near-camera segment resembling a hanging vertical rope.
export function tetherPoints(s,time=s.time,count=48){
 if(!droneStatus(s).deployed)return[];
 const a=tetherAttachment(s),b=droneTetherAttachment(s.drone),length=Math.hypot(b.x-a.x,b.y-a.y,b.depth-a.depth),e=environmentAt(s),sag=Math.min(2.1,.35+length*.025),wave=Math.exp(-Math.max(0,(a.depth+b.depth)/2)/25)*e.waveScale*.35;
 return Array.from({length:count},(_,i)=>{const f=i/(count-1),bow=4*f*(1-f),flutter=(.18+wave)*Math.sin(time*.8-f*6.5),cross=(.12+wave*.7)*Math.cos(time*.57+f*5.2);
  return{x:a.x+(b.x-a.x)*f+bow*flutter,y:a.y+(b.y-a.y)*f+bow*cross,depth:a.depth+(b.depth-a.depth)*f+bow*(sag+wave*.3*Math.sin(time*.6-f*4))};
 });
}
