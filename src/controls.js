import {operatingFraction} from './equipment.js';
import {clamp,rad} from './sim.js';
import {isSurfaced} from './vehicle-status.js';
import {changeNosePitch} from './rov-flight.js';
export {droneCameraPitch} from './rov-flight.js';

export const wrapHeading=n=>((n%360)+360)%360;
export const throttleDetent=knots=>Math.abs(knots)<=.5?0:knots;
export const relativeBearing=(absolute,heading)=>wrapHeading(absolute-heading);
export const scopeBearing=s=>wrapHeading(s.heading+s.scopeAngle);
export const canIssue=(s,context)=>s.status==='patrol'&&!context.paused&&!context.modal;
export const feedActive=(s,view)=>view==='orbit'?s.difficulty?.orbitCamera===true:view==='scope'?s.scope&&s.depth<=15&&operatingFraction(s.systems?.periscope??100)>0:['tower','gun'].includes(view)?isSurfaced(s):view==='drone'?['remote','return'].includes(s.drone.mode)&&operatingFraction(s.drone.camera??100)>0:false;
export const opticalZoomLimit=view=>view==='tower'?48:view==='scope'?4:view==='gun'?5:1;
export const helmFor=(s,view)=>view==='drone'?s.drone:s;

export function setHelmOrder(s,context,axis,value){
 if(!canIssue(s,context)||!Number.isFinite(value))return false;
 const drone=context.view==='drone',v=helmFor(s,context.view);
 if(drone&&v.mode!=='remote')return false;
 switch(axis){
  case 'heading':v.targetHeading=wrapHeading(value);if(!drone){s.route=null;s.scopeSteerBearing=null;}break;
  case 'depth':v.targetDepth=clamp(value,0,280);if(drone)v.nosePitch=null;break;
  case 'speed':v.targetSpeed=clamp(value,drone?-3:-4,drone?10:17);if(!drone&&v.targetSpeed>3)s.silent=false;break;
  default:return false;
 }
 return true;
}
export function alignScope(s,context,mode){
 if(!canIssue(s,context)||!feedActive(s,'scope'))return false;
 if(mode==='center'){s.scopeAngle=0;s.scopeSteerBearing=null;return true;}
 if(mode==='helm-to-scope'){s.scopeSteerBearing=scopeBearing(s);s.targetHeading=s.scopeSteerBearing;s.route=null;return true;}
 return false;
}

export function nudgeHelm(s,context,degrees){
 return setHelmOrder(s,context,'heading',helmFor(s,context.view).targetHeading+degrees);
}

export function applyHelmKeys(s,context,keys,dt){
 if(!canIssue(s,context))return;
 const drone=context.view==='drone',v=helmFor(s,context.view);
 if(drone){
  if(v.mode!=='remote')return;
  if(keys.has('rovStop')){
   v.targetSpeed=0;v.targetHeading=v.heading;v.targetDepth=v.depth;
   return;
  }
  const pitch=Number(keys.has('rovPitchUp'))-Number(keys.has('rovPitchDown'));
  if(pitch)changeNosePitch(v,pitch*30*dt,context.invertRovPitch);
 }
 const speed=Number(keys.has(drone?'rovFaster':'KeyW'))-Number(keys.has(drone?'rovSlower':'KeyS'));
 const turn=Number(keys.has('KeyD')||drone&&keys.has('rovRight'))-Number(keys.has('KeyA')||drone&&keys.has('rovLeft'));
 const depth=Number(keys.has('KeyC'))-Number(keys.has('Space'));
 // Orders change at a real-time rate. Time compression accelerates the vehicle,
 // not the keyboard. The simulation alone advances actual controls.
 if(speed)setHelmOrder(s,context,'speed',v.targetSpeed+speed*2*dt);
 if(turn)nudgeHelm(s,context,turn*20*dt);
 if(depth)setHelmOrder(s,context,'depth',v.targetDepth+depth*12*dt);
}

export function steerDrone(s,context,dx,dy){
 if(context.view!=='drone'||!canIssue(s,context)||s.drone.mode!=='remote')return;
 const d=s.drone;
 if(dx)setHelmOrder(s,context,'heading',d.targetHeading+dx*.4);
 if(dy)changeNosePitch(d,-dy*.25,context.invertRovPitch);
}

// Look along the boat from its stern quarter, below the waterline even at periscope depth.
export const initialOrbit=boat=>({yaw:rad(boat.heading+146),pitch:-.08,distance:72});
// Keep at least 56 degrees of the scene in view on both axes.
export const orbitVerticalFov=aspect=>2*Math.atan(Math.tan(rad(28))/Math.min(1,aspect))/rad(1);
export const orbitDrag=(orbit,dx,dy)=>{
 orbit.yaw=(orbit.yaw+dx*.008)%(2*Math.PI);
 orbit.pitch=clamp(orbit.pitch+dy*.008,-1.28,1.28);
};

// Explicit yaw/pitch/roll order preserves a world-up horizon through all azimuths.
// Never modify a single XYZ Euler component after lookAt's quaternion conversion.
export const cameraEuler=(heading,pitch=0,roll=0)=>({x:pitch,y:-rad(wrapHeading(heading)),z:roll,order:'YXZ'});

export function chartTransform(chart,w,h,boat){
 const scale=Math.min(w,h)/12500*chart.zoom,x=chart.follow?boat.x:chart.x,y=chart.follow?boat.y:chart.y;
 return{cx:w*.52-x*scale,cy:h*.51+y*scale,scale};
}
export function chartWorldAt(chart,x,y,w,h,boat){const p=chartTransform(chart,w,h,boat);return{x:(x-p.cx)/p.scale,y:-(y-p.cy)/p.scale};}
function detachChart(chart,boat){if(chart.follow){chart.x=boat.x;chart.y=boat.y;chart.follow=false;}}
export function panChart(chart,dx,dy,w,h,boat){const p=chartTransform(chart,w,h,boat);detachChart(chart,boat);chart.x-=dx/p.scale;chart.y+=dy/p.scale;}
export function zoomChart(chart,factor,x,y,w,h,boat){
 const before=chartWorldAt(chart,x,y,w,h,boat);detachChart(chart,boat);chart.zoom=clamp(chart.zoom*factor,.25,128);const after=chartWorldAt(chart,x,y,w,h,boat);chart.x+=before.x-after.x;chart.y+=before.y-after.y;
}
