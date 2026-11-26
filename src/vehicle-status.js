import {operatingFraction} from './equipment.js';
import {boatPoint} from './surface-motion.js';
export {boatPoint,boatLocal} from './surface-motion.js';
import {clamp,separation} from './mechanics.js';
export {droneTetherAttachment} from './rov-flight.js';

export const SURFACE_DEPTH=1;
export const isSurfaced=s=>Number.isFinite(s.depth)&&s.depth<=SURFACE_DEPTH;
export const droneReturnSpeed=d=>10*operatingFraction(d.mobility??100);

export const tetherAttachment=s=>boatPoint(s,{side:4.65,down:2});
export function recoveryDock(s){const p=boatPoint(s,{side:6.8,down:2.5});p.depth=clamp(p.depth,2.5,280);return p;}
export function droneStatus(s){
 const d=s.drone,deployed=['remote','return'].includes(d.mode),distance=separation(s,d),returnSpeed=droneReturnSpeed(d),outrunning=deployed&&Math.abs(s.speed)>=returnSpeed,canRecover=deployed&&Math.abs(s.speed)<=3;
 const warning=!deployed?'':returnSpeed===0?'ROV PROPULSION OFFLINE · bring the sub alongside for pickup':outrunning?`DRONE CANNOT CATCH SUB · ${distance.toFixed(0)} m · slow below ${returnSpeed.toFixed(1)} kn`:!canRecover?`DRONE DEPLOYED · ${distance.toFixed(0)} m · slow to 3 kn for pickup`:distance>=70?`DRONE LINK ${distance.toFixed(0)} / 100 m · recall now`:'';
 return{deployed,distance,returnSpeed,outrunning,canRecover,warning};
}
