// Constant-speed, flat-interface approximation. Typical speeds: NOAA,
// https://oceanservice.noaa.gov/facts/sound.html . Not a full ocean acoustic model.
export const AIR_SOUND_SPEED=340;
export const WATER_SOUND_SPEED=1500;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function airWaterPath(horizontal,airHeight,waterDepth){
 const r=Math.abs(horizontal),h=Math.max(0,airHeight),d=Math.max(0,waterDepth);
 if(d===0)return Math.hypot(r,h)/AIR_SOUND_SPEED;
 if(h===0)return Math.hypot(r,d)/WATER_SOUND_SPEED;
 // Fermat's principle: minimum travel time over the flat air/water interface.
 let lo=0,hi=r;for(let i=0;i<48;i++){const x=(lo+hi)/2;
  const derivative=x/(AIR_SOUND_SPEED*Math.hypot(x,h))-(r-x)/(WATER_SOUND_SPEED*Math.hypot(r-x,d));
  if(derivative>0)hi=x;else lo=x;
 }
 const x=(lo+hi)/2;return Math.hypot(x,h)/AIR_SOUND_SPEED+Math.hypot(r-x,d)/WATER_SOUND_SPEED;
}
export function propagationTime(source,listener){
 const horizontal=Math.hypot(source.x-listener.x,source.y-listener.y),depth=Math.max(0,listener.depth||0);
 if(source.type==='thunder'||source.type==='gunfire')return depth<=1?Math.hypot(horizontal,Math.max(0,(source.altitude||0)-3))/AIR_SOUND_SPEED:airWaterPath(horizontal,source.altitude||0,depth);
 return Math.hypot(horizontal,(source.depth||0)-depth)/WATER_SOUND_SPEED;
}
export function spatialPan(source,listener){
 const absolute=Math.atan2(source.x-listener.x,source.y-listener.y),relative=absolute-(listener.heading||0)*Math.PI/180;return Math.sin(relative);
}
export function perceivedSound(source,listener){
 const depth=Math.max(0,listener.depth||0),horizontal=Math.hypot(source.x-listener.x,source.y-listener.y),distance=Math.hypot(horizontal,(source.depth||0)-depth),under=depth>1;
 if(source.type==='thunder'||source.type==='gunfire')return{distance,delay:propagationTime(source,listener),pan:spatialPan(source,listener),gain:(source.power||1)/(1+(Math.hypot(horizontal,source.altitude||0)/3400)**1.2)*(under?.55*Math.exp(-depth/170):1),cutoff:under?Math.max(85,950/(1+depth/28)):3200};
 return{distance,delay:propagationTime(source,listener),pan:spatialPan(source,listener),gain:clamp((source.power||1)/(1+(distance/220)**1.25),0,1),cutoff:Math.max(130,4200/(1+distance/1200))};
}
export function engineSound(ship,listener){
 const distance=Math.hypot(ship.x-listener.x,ship.y-listener.y,(ship.depth||0)-(listener.depth||0)),speed=Math.abs(ship.speed||0);
 const base=ship.kind==='merchant'?.28:ship.kind==='escort'?.34:ship.kind==='fishing'?.19:.12;
 const under=(listener.depth||0)>1,scale=under?480:220,limit=under?10000:4500;
 const gain=ship.hull<=0||distance>limit?0:base*(.2+speed/9)/(1+(distance/scale)**(under?1.25:1.6));
 return{distance,gain:Math.min(.36,gain),pan:spatialPan(ship,listener),cutoff:Math.max(110,1800/(1+distance/1000+(listener.depth||0)/180)),frequency:(ship.kind==='escort'?47:ship.kind==='fishing'?68:ship.kind==='sub'?25:34)+speed*2.2,bladeRate:1.4+speed*.28};
}
export function emitSound(s,data){
 const source={id:s.soundSequence++,time:s.time,power:1,heard:false,...data};s.acoustics.push(source);return source;
}
export function updateAcoustics(s,onBlast){
 for(const source of s.acoustics){
  if(source.heard||s.time-source.time<propagationTime(source,s))continue;
  source.heard=true;source.heardAt=s.time;source.perceived=perceivedSound(source,s);
  if(source.type==='blast')onBlast?.(source,source.perceived.distance);
 }
 // Retain enough history to resume without replaying old sounds; bound storage.
 s.acoustics=s.acoustics.filter(e=>s.time-e.time<120).slice(-96);
}
