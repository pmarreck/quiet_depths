import {clamp,rad,separation} from './mechanics.js';

export const SURFACE_DEPTH=1;
export const isSurfaced=s=>Number.isFinite(s.depth)&&s.depth<=SURFACE_DEPTH;
export const droneReturnSpeed=d=>10*(.15+.85*clamp(d.mobility??100,0,100)/100);

// Hull coordinates are forward, starboard and down. Match the renderer's YXZ
// rotation, including pitch, so recovery and the visible attachment agree.
export function boatPoint(s,{side=0,forward=0,down=0}){
 const a=rad(s.heading),cp=Math.cos(s.pitch||0),sp=Math.sin(s.pitch||0),sn=Math.sin(a),cs=Math.cos(a);
 return{x:s.x+side*cs+forward*sn*cp+down*sn*sp,y:s.y-side*sn+forward*cs*cp+down*cs*sp,depth:s.depth-forward*sp+down*cp};
}
export function boatLocal(s,p){
 const a=rad(s.heading),cp=Math.cos(s.pitch||0),sp=Math.sin(s.pitch||0),dx=p.x-s.x,dy=p.y-s.y,dz=p.depth-s.depth,horizontal=dx*Math.sin(a)+dy*Math.cos(a);
 return{side:dx*Math.cos(a)-dy*Math.sin(a),forward:horizontal*cp-dz*sp,down:horizontal*sp+dz*cp};
}
export const tetherAttachment=s=>boatPoint(s,{side:4.65,down:2});
export function droneTetherAttachment(d){
 const a=rad(d.heading);return{x:d.x+Math.cos(a)*.35-Math.sin(a)*1.1,y:d.y-Math.sin(a)*.35-Math.cos(a)*1.1,depth:d.depth+.2};
}
export function recoveryDock(s){const p=boatPoint(s,{side:6.8,down:2.5});p.depth=clamp(p.depth,2.5,280);return p;}
export function droneStatus(s){
 const d=s.drone,deployed=['remote','return'].includes(d.mode),distance=separation(s,d),returnSpeed=droneReturnSpeed(d),outrunning=deployed&&Math.abs(s.speed)>=returnSpeed,canRecover=deployed&&Math.abs(s.speed)<=3;
 const warning=!deployed?'':outrunning?`DRONE CANNOT CATCH BOAT · ${distance.toFixed(0)} m · slow below ${returnSpeed.toFixed(1)} kn`:!canRecover?`DRONE DEPLOYED · ${distance.toFixed(0)} m · slow to 3 kn for pickup`:distance>=70?`DRONE LINK ${distance.toFixed(0)} / 100 m · recall now`:'';
 return{deployed,distance,returnSpeed,outrunning,canRecover,warning};
}
