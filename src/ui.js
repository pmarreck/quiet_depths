import {DAY_SECONDS} from './environment.js';
import {threats,etaText} from './torpedo-watch.js';
import {bearing,delta,distance} from './mechanics.js';
import {depthLimit,pressureLevel} from './pressure.js';

export function patrolNotices(s,opticalActive,soundOn,view,rate=1,paused=false){
 if(s.status!=='patrol')return [];
 const notices=[],pressure=pressureLevel(s),support=s.airSupport;
 for(const t of threats(s)){
  const shipTime=new Date(1000*(s.environment.startHour*3600+(t.arrival%DAY_SECONDS)*86400/DAY_SECONDS)).toISOString().slice(11,16);
  notices.push({id:'torpedo-'+t.id,text:'Torpedo likely targeting us! ETA '+shipTime+' ship · '+etaText(t.arrival,s.time,rate,paused)+' · T'+t.id,critical:true});
 }
 if(pressure)notices.push({id:'pressure',text:(pressure===2?'Critical · implosion risk':'Pressure alarm')+' · Rise above '+depthLimit(s)+' m',critical:pressure===2});
 if(s.fuelFire>0)notices.push({id:'fuel-fire',text:'Fuel fire · Assign damage control',critical:true});
 if(s.fuelLeak>0)notices.push({id:'fuel-leak',text:'Fuel tank leaking · Assign damage control'});
 if(s.flood>0)notices.push({id:'flood',text:'Taking on water'});
 if(s.repair>0)notices.push({id:'repair',text:'Damage control working'});
 if(s.alert>30)notices.push({id:'detection',text:s.alert>60?'Under pursuit':'Possible detection'});
 if(s.difficulty?.airSupport!==false){
  if(support.status==='arming')notices.push({id:'air',text:'Air support preparing · '+Math.max(0,Math.ceil(support.launchAt-s.time))+' s'});
  if(support.status==='airborne'&&s.aircraft.some(p=>p.hull>0&&!['down','return','gone'].includes(p.phase)))notices.push({id:'air',text:'Aircraft airborne'});
 }
 // Half the helm's 0.1° input step keeps rounding residue from raising a notice.
 if(view!=='drone'&&s.speed===0&&Math.abs(delta(s.targetHeading,s.heading))>=.05){
  notices.push({id:'course',text:'Course correction requires forward or reverse movement.'});
 }
 const strike=s.lightning.at(-1);
 if(opticalActive&&strike&&s.time-strike.time<=5){
  const direction=String(Math.round(bearing(s,strike))%360).padStart(3,'0');
  notices.push({id:'lightning',text:'Lightning · '+direction+'° · '+(distance(s,strike)/1000).toFixed(1)+' km'+(soundOn?' · Thunder traveling':' · Enable sound for thunder')});
 }
 for(const r of s.reports??[])if(s.time-r.time<18)notices.push({id:r.id,text:r.text});
 return notices;
}

export function sonarLayout(width,height,mini=false){
 if(mini)return{cx:width/2,cy:height*.49,radius:Math.min(width*.35,height*.32)};
 const top=height>=190?55:height>=140?32:18,room=Math.max(0,height-top-48);
 return{cx:width/2,cy:(height+top)/2,radius:Math.min(Math.max(0,width/2-34),room/2)};
}
export function hydrophoneStrength(angles,bearing){
 return Math.min(1,angles.reduce((total,a)=>total+Math.exp(-((delta(a,bearing)/4.5)**2)),0));
}
export const SONAR_RANGES=[1500,3000,6000];
// A passive bearing stays on its lettered spoke when the range scale changes.
export const sonarRangeFraction=(range,scale)=>range===null?.78:range<=scale?range/scale:null;
// Keep interactive row elements alive while telemetry changes underneath a press.
export function reconcileKeyedChildren(container,items,keyOf,create,update){
 const old=new Map([...container.children].map(node=>[node.dataset.rowKey,node])),keep=new Set();
 items.forEach((item,index)=>{const key=String(keyOf(item));let node=old.get(key);if(!node){node=create(item);node.dataset.rowKey=key;}update(node,item);keep.add(node);if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);});
 for(const node of [...container.children])if(!keep.has(node))node.remove();
}

export function contactRow(document){
 const button=document.createElement('button');button.className='contact-row';
 for(const name of ['contact-icon','contact-summary','contact-bearing']){const span=document.createElement('span');span.className=name;button.appendChild(span);}
 const summary=button.children[1];summary.appendChild(document.createElement('strong'));summary.appendChild(document.createElement('small'));return button;
}
export function updateContactRow(button,model){
 button.dataset.contact=model.id;button.classList.toggle('active',model.selected);button.setAttribute('aria-pressed',String(model.selected));
 button.children[0].textContent=model.icon;button.children[1].children[0].textContent=model.title;button.children[1].children[1].textContent=model.detail;button.children[2].textContent=model.bearing;
}
