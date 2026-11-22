import {operatingFraction} from './equipment.js';
import {SUB_DESIGN} from './hull-design.js';
// Simulation coordinates: x east, y north, depth down. SI units except knots/degrees.
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const rad=d=>d*Math.PI/180;
export const bearing=(a,b)=>(Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI+360)%360;
export const delta=(a,b)=>((a-b+540)%360)-180;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const separation=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.depth-b.depth);
export function rand(s){s.rng^=s.rng<<13;s.rng^=s.rng>>>17;s.rng^=s.rng<<5;return(s.rng>>>0)/4294967296;}
export function log(s,text,kind='info'){if(s.events[0]?.text===text)return;s.events.unshift({t:s.time,text,kind});s.events=s.events.slice(0,45);}
export {chartDepth as bottom} from './coast.js';
// Signed distance to a capsule, using the same centerline and radius as its mesh.
export function capsuleContact(point,body,halfLength=27.5,radius=5,pointRadius=.7){
 const a=rad(body.heading),sn=Math.sin(a),cs=Math.cos(a),cp=Math.cos(body.pitch||0),sp=Math.sin(body.pitch||0),dx=point.x-body.x,dy=point.y-body.y,dz=point.depth-body.depth;
 const horizontal=dx*sn+dy*cs,forward=horizontal*cp-dz*sp,side=dx*cs-dy*sn,along=forward-clamp(forward,-halfLength,halfLength),down=horizontal*sp+dz*cp;
 const length=Math.hypot(side,along,down),penetration=radius+pointRadius-length;
 if(penetration<=0)return null;
 const local=length>1e-8?{side:side/length,along:along/length,down:down/length}:{side:1,along:0,down:0};
 return {penetration,nx:local.side*cs+local.along*sn*cp+local.down*sn*sp,ny:-local.side*sn+local.along*cs*cp+local.down*cs*sp,nd:-local.along*sp+local.down*cp};
}
// Local cavitation number, following MIT 2.611 Cavitation Notes. Blade loading
// (critical sigma=1.25), RPM gearing and bubble density are fictional tuning.
export function propellerState(speed,depth,health=100){
 const rpm=speed*13*operatingFraction(health),radius=SUB_DESIGN.propellerRadius,omega=rpm*Math.PI/30;
 const q=.5*1025*((speed*.514444)**2+(omega*radius)**2);
 const sigma=q>0?(101325+1025*9.81*Math.max(0,depth-radius)-2300)/q:Infinity;
 return {rpm,sigma,cavitation:rpm!==0&&q>0?clamp((1.25-sigma)/1.25,0,1):0};
}
