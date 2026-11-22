import {damagePart} from './equipment.js';
import {clamp,log,rand} from './mechanics.js';
import {addDebrief} from './debrief.js';

// Gameplay limits for this fictional boat. Wear on the outer shell lasts the patrol.
export const depthLimit=s=>Math.round(220*(.15+.35*s.outerHull/100+.5*s.hull/100));
export const pressureLevel=s=>s.depth>depthLimit(s)*1.12?2:s.depth>depthLimit(s)?1:0;

export function updatePressure(s,dt){
 const level=pressureLevel(s);
 if(level!==s.pressureAlarm){
  if(level===2)log(s,'CRITICAL DEPTH. Pressure bulkheads at risk. Rise now!','damage');
  else if(level===1)log(s,'Depth tolerance exceeded. Order a shallower depth.','warning');
  else log(s,'Back within depth tolerance.');
  s.pressureAlarm=level;
 }
 s.criticalExposure=level===2?s.criticalExposure+dt:0;
 if(!level)return;
 const excess=s.depth/depthLimit(s)-1;
 if(rand(s)<-Math.expm1(-dt*(.012+.075*excess))){
  s.flood=clamp(s.flood+.8+rand(s)*1.8,0,25);
  damagePart(s,s.repairLimits,'hull',.4);log(s,'Pressure seam leaking. Assign damage control to seal it and pump the bilge.','damage');
 }
 if(level===2&&s.criticalExposure>20&&rand(s)<-Math.expm1(-dt*(excess-.12)*.035)){
  damagePart(s,s.repairLimits,'hull',100);s.status='lost';s.imploded=true;s.shock=2;
  const text='Pressure hull imploded beyond the damaged sub’s depth tolerance.';
  log(s,text,'damage');addDebrief(s,text);
 }
}
