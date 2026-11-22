import {estimateAt} from './contact-readings.js';
export {estimateAt};
// Timestamped observations are independent of live vessel state. All distances
// are meters; velocity is east/north m/s; ellipse angle is a compass bearing.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=Number.isFinite;
export function designation(index){
 if(!Number.isSafeInteger(index)||index<1)throw new RangeError('Contact sequence must be a positive safe integer');
 let column=Math.floor((index-1)/9)+1,letters='';
 while(column){column--;letters=String.fromCharCode(65+column%26)+letters;column=Math.floor(column/26);}
 return letters+((index-1)%9+1);
}
export function fixContact(contact,observation){
 if(!contact||!observation||!['x','y','time'].every(k=>finite(observation[k]))||observation.time<0)return false;
 const fix={x:observation.x,y:observation.y,time:observation.time,vx:observation.vx??0,vy:observation.vy??0,positionSigma:observation.positionSigma??0,velocitySigma:observation.velocitySigma??.25,maneuverSigma:observation.maneuverSigma??.008,source:observation.source||'observation'};
 if(!['vx','vy','positionSigma','velocitySigma','maneuverSigma'].every(k=>finite(fix[k]))||['positionSigma','velocitySigma','maneuverSigma'].some(k=>fix[k]<0))return false;
 if(contact.fix&&finite(contact.fix.time)&&fix.time<contact.fix.time)return false;
 contact.fix=fix;return true;
}
export function chartContacts(s){
 if(!s.difficulty?.omniscientChart)return s.contacts;
 const identified=s.search?new Set(s.contacts.filter(c=>c.identified||c.kind==='sub'&&c.fix).map(c=>c.id)):null;
 const hostile=new Set(s.ships.filter(ship=>ship.military&&ship.side!=='friendly'&&(!identified||identified.has(ship.id))).map(ship=>ship.id));
 const observed=s.contacts.filter(contact=>!hostile.has(contact.id));
 const exact=s.ships.filter(ship=>hostile.has(ship.id)&&ship.hull>0).map(ship=>({
  id:ship.id,label:'LIVE',name:ship.name,identified:true,kind:ship.kind,military:ship.military,side:ship.side,age:0,range:1,exact:true,
  x:ship.x,y:ship.y,depthEstimate:ship.kind==='sub'?ship.depth:undefined,
  fix:{time:s.time,x:ship.x,y:ship.y,vx:Math.sin(ship.heading*Math.PI/180)*ship.speed*.514444,
   vy:Math.cos(ship.heading*Math.PI/180)*ship.speed*.514444,positionSigma:0,velocitySigma:0,maneuverSigma:0}
 }));
 return [...observed,...exact];
}
export function applyReconPacket(s,packet){
 if(!s||!['time','x','y'].every(k=>finite(s[k]))||!packet||!Array.isArray(packet.tracks)||packet.tracks.length>256||!finite(packet.capturedAt)||!finite(packet.receivedAt)||packet.receivedAt>s.time||packet.capturedAt>packet.receivedAt)return false;
 const observations=[],ids=new Set();
 for(const track of packet.tracks){
  if(!track||typeof track.id!=='string'||ids.has(track.id))return false;ids.add(track.id);
  const observation={x:track.x,y:track.y,vx:track.vx??0,vy:track.vy??0,time:track.time??packet.capturedAt,positionSigma:track.positionSigma??0,velocitySigma:track.velocitySigma??.25,maneuverSigma:track.maneuverSigma??.008,source:'satellite'};
  if(observation.time>packet.capturedAt||!fixContact({},observation))return false;observations.push({track,observation});
 }
 s.contacts??=[];if(!Number.isSafeInteger(s.nextId)||s.nextId<1)s.nextId=1;
 for(const {track,observation}of observations){
  let contact=s.contacts.find(c=>c.id===track.id);
  if(!contact){contact={id:track.id,label:designation(s.nextId++),identified:false,bearing:0,range:0,confidence:0,age:0,x:track.x,y:track.y,method:'satellite'};s.contacts.push(contact);}
  if(fixContact(contact,observation)){
   const estimate=estimateAt(contact,s.time);contact.x=observation.x;contact.y=observation.y;contact.range=Math.hypot(estimate.x-s.x,estimate.y-s.y);contact.bearing=(Math.atan2(estimate.x-s.x,estimate.y-s.y)*180/Math.PI+360)%360;contact.confidence=observation.positionSigma===0?1:clamp(1-observation.positionSigma/1200,.2,.95);contact.age=estimate.age;contact.method='satellite';
  }
  if(track.identified&&typeof track.name==='string'){contact.identified=true;contact.name=track.name;if(track.side==='friendly'||track.side==='hostile')contact.side=track.side;if(typeof track.kind==='string')contact.kind=track.kind;if(typeof track.military==='boolean')contact.military=track.military;}
 }
 return true;
}
