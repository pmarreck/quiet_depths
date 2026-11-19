import {createGame,step,bottom,bearing,delta,distance,rad,clamp,ping,photograph,fire,decoy,deployDrone,recallDrone,log,MISSIONS,save,restore,getSoundings} from './sim.js';
import {droneDeployReason,SYSTEM_NAMES,DRONE_LIMITS} from './systems.js';
import {separation} from './mechanics.js';
import {objectiveState,operationApproach,dronePhotograph} from './missions.js';
import {OceanScene} from './scene.js';
import {fireDeckGun,aimGunAt} from './combat.js';
import {HeldInput} from './input.js';
import {SoundSystem} from './audio.js';
import {environmentAt,WEATHER,TIMES,scopeWashed} from './environment.js';
import {wrapHeading,relativeBearing,scopeBearing,alignScope,canIssue,feedActive,helmFor,setHelmOrder,applyHelmKeys,chartTransform,chartWorldAt,panChart,zoomChart} from './controls.js';
const $=id=>document.getElementById(id),all=q=>[...document.querySelectorAll(q)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deg=n=>String(Math.round(wrapHeading(n))%360).padStart(3,'0');
let state=createGame(),view='scope',zoom=1,rate=1,paused=false,selected=null,missionChoice='recon',last=performance.now(),lastUI=0,lastSave=0,lastToast='',resultShown=false,toastTimer,renderClock=0;
let chart={x:0,y:0,zoom:1,follow:true},saved=null;
try{saved=restore(localStorage.getItem('quiet-depths-v1'));}catch{}
let scene=null;
try{scene=new OceanScene($('world'));}catch(e){console.warn('WebGL unavailable',e);toast('WebGL unavailable. Sonar and chart are available.');view='sonar';}
const held=new HeldInput(),keys=held.keys,commandControls=[];let drawer=null;
const context=()=>({view,paused,modal:!!document.querySelector('dialog[open]')});
const pilotEnabled=()=>view!=='drone'||state.drone.mode==='remote';
const sound=new SoundSystem(()=>state,context,status=>{
 const el=$('sound');el.dataset.audioContext=status.context;el.dataset.engineSources=status.engines;el.dataset.effects=status.effects;
 if(status.last){el.dataset.lastAcoustic=status.last.type;el.dataset.lastDelay=status.last.delay.toFixed(3);el.dataset.lastGain=(status.last.currentGain??status.last.gain).toFixed(4);el.dataset.lastCutoff=(status.last.currentCutoff??status.last.cutoff).toFixed(0);}else{for(const key of ['lastAcoustic','lastDelay','lastGain','lastCutoff'])delete el.dataset[key];}
});
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
function persist(){try{if(state.status==='patrol')localStorage.setItem('quiet-depths-v1',save(state));else localStorage.removeItem('quiet-depths-v1');$('save-status').textContent='PATROL SAVED';setTimeout(()=>$('save-status').textContent='LOCAL AUTOSAVE',1400);}catch{$('save-status').textContent='SAVING UNAVAILABLE';}}
function bindCommand(element,event,action,enabled=()=>true){
 const el=typeof element==='string'?$(element):element;commandControls.push({el,enabled});el.dataset.command='true';
 el.addEventListener(event,e=>{if(!canIssue(state,context())||!enabled())return;action(e);updateUI();});
}
function order(axis,value){return setHelmOrder(state,context(),axis,value);}
function closeDrawer(){drawer=null;document.body.removeAttribute('data-drawer');$('drawer-backdrop').classList.add('hidden');all('[data-panel]').forEach(b=>b.setAttribute('aria-expanded','false'));}
function setRate(r){rate=r;all('[data-time]').forEach(b=>b.classList.toggle('active',+b.dataset.time===r));}
function setPaused(p){paused=p;held.clear();drag=null;document.body.classList.toggle('paused',p);$('pause').textContent=p?'RESUME · ESC':'PAUSE · ESC';$('pause').setAttribute('aria-label',p?'Resume patrol':'Pause patrol');updateUI();sound.update();persist();}
function setView(v){if(v==='scope'&&state.systems.periscope===0)v='tower';view=v;held.clear();drag=null;closeDrawer();all('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);b.setAttribute('aria-pressed',b.dataset.view===v);});updateUI();}
function chooseMission(id){missionChoice=id;all('.mission-option').forEach(b=>b.classList.toggle('active',b.dataset.mission===id));document.querySelector('.briefing-tip p').innerHTML=esc(MISSIONS.find(m=>m.id===id).desc)+' <strong>Esc pauses everything.</strong>';}
function openBriefing(){held.clear();persist();$('briefing').showModal();$('resume').classList.toggle('hidden',!saved&&state.time===0);sound.update();}
function start(resuming=false){
 if(resuming)state=saved||state;else{const seedText=$('patrol-seed').value.trim(),seed=seedText?Number(seedText)>>>0:crypto.getRandomValues(new Uint32Array(1))[0];state=createGame(missionChoice,seed,{timeOfDay:$('patrol-time').value,weather:$('patrol-weather').value,changing:$('changing-weather').checked});selected=null;}
 chart={x:state.x,y:state.y,zoom:1,follow:true};saved=null;resultShown=false;lastToast='';clearTimeout(toastTimer);$('toast').classList.remove('show');setRate(1);$('briefing').close();setView(scene?(state.depth<=.05?'tower':'scope'):'sonar');setPaused(false);persist();
}
$('patrol-time').innerHTML='<option value="random">Random</option>'+Object.entries(TIMES).map(([id,t])=>`<option value="${id}" ${''}>${t.name}</option>`).join('');
$('patrol-weather').innerHTML='<option value="random">Random</option>'+Object.entries(WEATHER).map(([id,w])=>`<option value="${id}">${w.name}</option>`).join('');
$('mission-picker').innerHTML=MISSIONS.map(m=>`<button class="mission-option ${m.id==='recon'?'active':''}" data-mission="${m.id}"><span></span><div><b>${m.name}</b><small>${m.type}</small></div><span>${m.minutes}</span></button>`).join('');
$('mission-picker').addEventListener('click',e=>{const b=e.target.closest('[data-mission]');if(b)chooseMission(b.dataset.mission);});
$('start').onclick=()=>start(false);$('resume').onclick=()=>start(true);$('close-briefing').onclick=()=>{$('briefing').close();updateUI();};$('another-patrol').onclick=()=>{$('result-dialog').close();$('briefing').showModal();$('resume').classList.add('hidden');};
$('sound').onclick=()=>{const on=sound.toggle();$('sound').innerHTML=`♩ <span>SOUND ${on?'ON':'OFF'}</span>`;$('sound').setAttribute('aria-label',on?'Disable sound':'Enable sound');};$('pause').onclick=()=>setPaused(!paused);$('guide').onclick=()=>{held.clear();$('help-dialog').showModal();updateUI();};$('close-help').onclick=()=>{$('help-dialog').close();updateUI();};$('new-patrol').onclick=()=>{$('help-dialog').close();openBriefing();};document.querySelector('.brand').onclick=e=>{e.preventDefault();openBriefing();};
all('dialog').forEach(d=>d.addEventListener('close',()=>{held.clear();updateUI();}));
all('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));all('[data-time]').forEach(b=>bindCommand(b,'click',()=>setRate(+b.dataset.time)));
function scopeToggle(){if(!canIssue(state,context())||state.systems.periscope===0)return;if(state.depth>15){toast('Rise to 15 meters or less to raise the scope.');return;}state.scope=!state.scope;if(!state.scope)scene?.clear();updateUI();}
function takePhoto(){if(!canIssue(state,context()))return;if(view==='drone'){const result=dronePhotograph(state);toast(result.text);if(result.ok)sound.tone('photo');updateUI();return;}if(view!=='scope'||!feedActive(state,'scope'))return;if(scopeWashed(state)){toast('A wave washed over the lens. Wait for the trough.');return;}if(photograph(state,scopeBearing(state))){sound.tone('photo');toast(`Photograph recorded. ${state.photos.length}/${state.patrol.photoGoal} silhouettes.`);}else toast(state.photoCooldown>0?'Camera reloading.':'Center a merchant silhouette in the reticle.');updateUI();}
function doPing(){if(!canIssue(state,context()))return;if(ping(state)){sound.tone('ping');setRate(1);}else toast('Sonar capacitors recharging.');updateUI();}
function silent(){if(!canIssue(state,context())||view==='drone')return;state.silent=!state.silent;if(state.silent){state.targetSpeed=clamp(state.targetSpeed,-3,3);log(state,'Rig for silent running. Maximum three knots.');}updateUI();}
$('scope-align-toggle').onclick=()=>{const open=$('scope-alignment').classList.toggle('open');$('scope-align-toggle').setAttribute('aria-expanded',String(open));};
bindCommand('center-scope','click',()=>{alignScope(state,context(),'center');$('scope-alignment').classList.remove('open');$('scope-align-toggle').setAttribute('aria-expanded','false');},()=>feedActive(state,'scope'));
bindCommand('steer-scope','click',()=>{alignScope(state,context(),'helm-to-scope');$('scope-alignment').classList.remove('open');$('scope-align-toggle').setAttribute('aria-expanded','false');},()=>feedActive(state,'scope'));
bindCommand('open-gun','click',()=>setView('gun'));
bindCommand('aim-gun','click',()=>{const id=$('gun-target').value,c=state.contacts.find(c=>c.id===id),air=state.aircraft.find(p=>p.id===id);if(air&&visualAircraft().some(v=>v.id===id)){aimGunAt(state,{...air,vx:Math.sin(rad(air.heading))*air.speed,vy:Math.cos(rad(air.heading))*air.speed});return;}if(c?.range)aimGunAt(state,{x:c.x,y:c.y,altitude:2});},()=>view==='gun'&&feedActive(state,'gun')&&!!$('gun-target').value);
bindCommand('scope-toggle','click',scopeToggle);bindCommand('photo','click',takePhoto,()=>feedActive(state,'scope')&&state.photoCooldown===0&&!scopeWashed(state));bindCommand('ping','click',doPing,()=>state.pingCooldown===0&&state.systems.sonar>25);bindCommand('silent','click',silent,()=>view!=='drone');
for(const axis of ['heading','depth','speed'])bindCommand(axis,'input',e=>order(axis,+e.target.value),pilotEnabled);
bindCommand('port','click',()=>order('heading',helmFor(state,view).targetHeading-15),pilotEnabled);bindCommand('starboard','click',()=>order('heading',helmFor(state,view).targetHeading+15),pilotEnabled);
all('[data-depth]').forEach(b=>bindCommand(b,'click',()=>order('depth',+b.dataset.depth),pilotEnabled));
bindCommand('electric','click',()=>{state.engine='electric';log(state,'Electric motors engaged.');},()=>view!=='drone');
bindCommand('diesel','click',()=>{if(state.depth>14){toast('Diesel needs air. Rise to 14 meters or less first.');return;}if(state.fuel<=0){toast('Diesel fuel exhausted.');return;}state.engine='diesel';state.silent=false;log(state,'Diesels engaged. Recharging, but loud.','warning');},()=>view!=='drone');
bindCommand('repair','click',()=>{if(state.hull>=100&&state.flood===0&&Object.values(state.systems).every(v=>v===100)){toast('No damage to repair.');return;}state.repair=120;log(state,'Damage control assigned. Patching hull and pumping compartments.');toast('Damage control working for 2 minutes. Uses battery.');});
bindCommand('decoy','click',()=>{if(decoy(state)){sound.tone('fire');toast('Noisemaker deployed. Turn away and go quiet.');}},()=>state.decoys>0);
bindCommand('fire','click',()=>{const c=state.contacts.find(c=>c.id===selected);if(state.depth>100){toast('Rise above 100 meters to fire.');return;}if(c.identified&&!c.military){toast('Identified neutral. Firing is withheld.');return;}if(fire(state,selected)){sound.tone('fire');setRate(1);toast('Torpedo running. Its own sonar will arm and acquire a return.');closeDrawer();}},()=>!!state.contacts.find(c=>c.id===selected)&&state.torps>0);
function visualAircraft(){const e=environmentAt(state);return state.depth<=.05?state.aircraft.filter(p=>p.hull>0&&distance(state,p)<e.opticalRange):[];}
 $('contacts').onclick=e=>{const b=e.target.closest('[data-contact]');if(!b)return;selected=b.dataset.contact;$('gun-target').value=selected;const c=state.contacts.find(c=>c.id===selected);if(c&&view==='scope'&&feedActive(state,'scope')&&canIssue(state,context())){state.scopeSteerBearing=null;state.scopeAngle=relativeBearing(c.bearing,state.heading);}updateUI();};
bindCommand('deploy-drone','click',()=>{if(deployDrone(state)){setView('drone');toast('Drone helm: W/S speed, A/D heading, Space/C depth.');}else toast(droneDeployReason(state));},()=>!droneDeployReason(state));
bindCommand('drone-photo','click',takePhoto,()=>state.mission==='survey'&&feedActive(state,'drone')&&state.photoCooldown===0);
bindCommand('approach-site','click',()=>{const p=operationApproach(state);if(!p)return;state.route={x:p.x,y:p.y,radius:p.radius};state.targetDepth=p.depth;state.targetSpeed=3;state.silent=false;toast('Approach plotted. Boat will stop beside the site. Watch clearance.');},()=>!!state.site);
bindCommand('hold-position','click',()=>{state.route=null;state.targetSpeed=0;state.targetDepth=state.site?operationApproach(state).depth:state.depth;toast('All stop. Ballast and planes holding ordered depth.');});
bindCommand('recall-drone','click',()=>recallDrone(state),()=>state.drone.mode==='remote');
bindCommand('clear-route','click',()=>{state.route=null;toast('Waypoint cleared. Holding ordered heading.');});
bindCommand('plot-home','click',()=>{state.route={...state.home};state.targetSpeed=6;state.silent=false;toast('Extraction plotted. Surface inside the pickup circle to finish.');});
$('center-chart').onclick=()=>{chart.follow=true;updateUI();};
 for(const [id,factor] of [['chart-zoom-in',1.4],['chart-zoom-out',1/1.4]])$(id).onclick=()=>{const r=$('viewport').getBoundingClientRect();zoomChart(chart,factor,r.width/2,r.height/2,r.width,r.height,state);updateUI();};
 all('[data-panel]').forEach(b=>b.onclick=()=>{const next=b.dataset.panel;if(drawer===next){closeDrawer();return;}drawer=next;document.body.dataset.drawer=next;$('drawer-backdrop').classList.remove('hidden');all('[data-panel]').forEach(el=>el.setAttribute('aria-expanded',String(el.dataset.panel===next)));});$('drawer-backdrop').onclick=closeDrawer;
 bindCommand('mobile-stop','click',()=>order('speed',0),pilotEnabled);bindCommand('mobile-silent','click',silent,()=>view!=='drone');bindCommand('mobile-engine','click',()=>{if(state.engine==='diesel'){state.engine='electric';return;}if(state.depth>14||state.fuel<=0){toast('Diesel needs air above 14 m and fuel.');return;}state.engine='diesel';state.silent=false;},()=>view!=='drone');
 all('[data-key]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(!canIssue(state,context())||button.dataset.key!=='KeyJ'&&!pilotEnabled())return;button.setPointerCapture(e.pointerId);held.press('touch:'+e.pointerId,button.dataset.key);applyHelmKeys(state,context(),new Set([button.dataset.key]),.12);button.classList.add('held');updateUI();});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{held.release('touch:'+e.pointerId);button.classList.remove('held');});});
const vp=$('viewport');let drag=null;
vp.addEventListener('pointerdown',e=>{
 if(e.target.closest('button'))return;
 if(view!=='chart'&&(!['scope','tower','gun'].includes(view)||!feedActive(state,view)||!canIssue(state,context())))return;
 e.preventDefault();drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};vp.setPointerCapture(e.pointerId);
});
vp.addEventListener('pointermove',e=>{
 if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6)drag.moved=true;
 if(view==='scope'&&feedActive(state,'scope')&&canIssue(state,context())){state.scopeSteerBearing=null;state.scopeAngle=wrapHeading(state.scopeAngle+dx*.16/zoom);}
 if(view==='tower'&&feedActive(state,'tower')&&canIssue(state,context())){state.towerAngle=wrapHeading(state.towerAngle+dx*.16/zoom);state.towerPitch=clamp(state.towerPitch-dy*.003/zoom,-1.45,.75);}
 if(view==='gun'&&feedActive(state,'gun')&&canIssue(state,context())){state.gun.angle=wrapHeading(state.gun.angle+dx*.12/zoom);state.gun.elevation=clamp(state.gun.elevation-dy*.12/zoom,-15,85);}
 if(view==='chart'&&drag.moved){const r=vp.getBoundingClientRect();panChart(chart,dx,dy,r.width,r.height,state);}
 drag.x=e.clientX;drag.y=e.clientY;
});
vp.addEventListener('pointerup',e=>{
 if(drag&&view==='chart'&&!drag.moved&&canIssue(state,context())){const r=vp.getBoundingClientRect();state.scopeSteerBearing=null;state.route=chartWorldAt(chart,e.clientX-r.left,e.clientY-r.top,r.width,r.height,state);state.targetSpeed=Math.max(4,state.targetSpeed);state.silent=false;toast('Waypoint plotted. Holding requested depth.');}
 drag=null;updateUI();
});
vp.addEventListener('pointercancel',()=>drag=null);
vp.addEventListener('wheel',e=>{
 if(view==='chart'){e.preventDefault();const r=vp.getBoundingClientRect();zoomChart(chart,Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top,r.width,r.height,state);updateUI();}
 else if(['scope','tower','gun'].includes(view)&&feedActive(state,view)&&canIssue(state,context())){e.preventDefault();zoom=clamp(zoom-e.deltaY*.002,1,2.5);updateUI();}
},{passive:false});
const helmKeys=new Set(['KeyW','KeyA','KeyS','KeyD','Space','KeyC','KeyJ']);
window.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches('textarea,input:not([type="range"]),[contenteditable="true"]'))return;
 if(context().modal)return;
 if(e.code==='Escape'){e.preventDefault();if(!e.repeat)setPaused(!paused);return;}
 const stations={Digit1:'scope',Digit2:'sonar',Digit3:'chart',Digit4:'drone',Digit5:'tower',Digit6:'gun'};
 if(stations[e.code]){e.preventDefault();if(!e.repeat)setView(stations[e.code]);return;}
 if(helmKeys.has(e.code)){e.preventDefault();if(canIssue(state,context())&&pilotEnabled()){held.press('keyboard:'+e.code,e.code);if(!e.repeat){applyHelmKeys(state,context(),new Set([e.code]),.12);updateUI();}}return;}
 if(!canIssue(state,context())||e.repeat)return;
 ({KeyP:scopeToggle,KeyF:takePhoto,KeyG:doPing,KeyR:silent})[e.code]?.();
});
window.addEventListener('keyup',e=>held.release('keyboard:'+e.code));
window.addEventListener('blur',()=>{held.clear();if(!context().modal&&state.status==='patrol')setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){held.clear();setPaused(true);}});window.addEventListener('pagehide',persist);

function updateUI(){
 const s=state,env=environmentAt(s),m=MISSIONS.find(m=>m.id===s.mission),extract=s.phase==='extract',pickup=extract&&distance(s,s.home)<400,objective=objectiveState(s);
 if(view==='scope'&&s.systems.periscope===0)view='tower';
 $('mission-type').textContent=m.type;$('mission-name').innerHTML=esc(m.name).replace('observation','<br>observation.').replace('home','<br>home.').replace('through','<br>through.');
 $('mission-desc').textContent=extract?'Your work is done. Bring everyone home.':m.short;
 $('objective-label').textContent=pickup?'SURFACE FOR PICKUP':extract?'RETURN TO EXTRACTION':objective.label;
 $('objective-text').textContent=pickup?'Request 0 m and wait until surfaced':extract?'Reach the green circle and surface':objective.text;
 $('progress').textContent=extract?'✓':objective.progress;
 $('operation-card').classList.toggle('hidden',!s.operation);$('operation-range').textContent=s.site?Math.round(distance(s,s.site))+' M':'';$('operation-advice').textContent=objective.advice;$('approach-site').textContent=s.mission==='survey'?'PLOT SURVEY APPROACH':'PLOT RESCUE APPROACH';
 document.querySelector('.top-coords b').textContent=String(s.patrol.seed);$('home-distance').textContent=(distance(s,s.home)/1000).toFixed(1)+' km · '+deg(bearing(s,s.home))+'°';
 $('hull-value').innerHTML=Math.round(s.hull)+'<span>%</span>';$('hull-bar').style.width=s.hull+'%';$('hull-bar').style.background=s.hull<45?'var(--red)':'var(--green)';
 $('system-status').innerHTML=`<i></i> ${s.repair>0?'DAMAGE CONTROL WORKING':s.flood>0?'FLOODING · '+s.flood.toFixed(1)+' T/MIN · '+s.water.toFixed(1)+' T ABOARD':'ALL SYSTEMS NOMINAL'}`;$('system-status').style.color=s.flood>0?'var(--red)':'var(--green)';
 $('log').innerHTML=s.events.slice(0,12).map(e=>`<div class="log-entry ${esc(e.kind)}"><time>${String(Math.floor(e.t/60)).padStart(2,'0')}:${String(Math.floor(e.t%60)).padStart(2,'0')}</time><span>${esc(e.text)}</span></div>`).join('');$('log-count').textContent=String(s.events.length).padStart(2,'0');
 $('subsystems').innerHTML=Object.entries(SYSTEM_NAMES).map(([key,name])=>`<div><span>${name}</span><b class="${s.systems[key]<60?'damaged':''}">${Math.round(s.systems[key])}%</b></div>`).join('');$('buoyancy-readout').textContent=`BALLAST ${s.ballast>0?'FLOODING':'BLOWING'} ${Math.abs(s.ballast*100).toFixed(0)}% · VERTICAL ${s.verticalSpeed.toFixed(2)} M/S · ${s.propRpm.toFixed(0)} RPM${s.cavitation>.05?' · CAVITATING':''}`;
 $('drone-bay-mode').textContent=s.drone.mode.toUpperCase();$('drone-bay-mode').classList.toggle('damaged',s.drone.mode==='lost');$('drone-bay-metrics').innerHTML=`<span>CHARGE <b>${Math.round(s.drone.battery)}%</b></span><span>HULL <b>${Math.round(s.drone.hull)}%</b></span><span>MOBILITY <b>${Math.round(s.drone.mobility)}%</b></span><span>CAMERA <b>${Math.round(s.drone.camera)}%</b></span>`;$('drone-bay-advice').textContent=s.drone.mode==='lost'?s.drone.lostReason:s.drone.mode==='stowed'?(droneDeployReason(s)||'READY · 280 M MAX · DEPLOY ≤3 KN'):Math.round(separation(s,s.drone))+' / 100 M LINK · BUOYANCY '+Math.round(s.drone.buoyancy)+'%';
 $('engine-status').textContent=s.engine==='diesel'?(s.depth<=14?'DIESEL · CHARGING':'DIESEL · NO AIR INTAKE'):'RUNNING ON BATTERIES';
 const drone=view==='drone',v=helmFor(s,view),actual={heading:v.heading,depth:v.depth,speed:v.speed},requested={heading:v.targetHeading,depth:v.targetDepth,speed:v.targetSpeed};
 $('helm-mode').textContent=drone?(v.mode==='remote'?'DRONE HELM':v.mode==='return'?'DRONE · AUTO RETURN':'DRONE · OFFLINE'):'SUBMARINE HELM';
 $('heading-value').textContent=deg(v.heading);$('depth-value').textContent=Math.round(v.depth);$('speed-value').textContent=v.speed.toFixed(1);
 $('heading-order').innerHTML=`<span>ACT ${deg(v.heading)}°</span><span>REQ ${deg(v.targetHeading)}°</span>`;
 $('depth-order').innerHTML=`<span>ACT ${v.depth.toFixed(0)} m</span><span>REQ ${v.targetDepth.toFixed(0)} m</span>`;
 $('speed-order').innerHTML=`<span>ACT ${v.speed.toFixed(1)} kn</span><span>REQ ${v.targetSpeed.toFixed(1)} kn</span>`;
 $('depth-label').textContent=v.depth<=1?'SURFACED':drone?'ROV':v.depth<=15?'SCOPE':v.depth>220?'STRAIN':'SUBMERGED';
 $('noise-label').textContent=drone?(v.speed<0?'ASTERN':'ROV'):s.noise<28?'QUIET':s.noise<55?'AUDIBLE':'LOUD';$('noise-label').style.color=!drone&&s.noise>55?'var(--red)':'var(--green)';
 for(const axis of ['heading','depth','speed']){
  const el=$(axis);el.min=axis==='speed'?(drone?-3:-4):0;el.max=axis==='heading'?359.9:axis==='depth'?280:(drone?10:17);el.step=axis==='heading'?.1:axis==='speed'?.1:1;
  el.value=requested[axis];el.dataset.actual=actual[axis];el.dataset.requested=requested[axis];el.setAttribute('aria-valuetext',`Actual ${actual[axis].toFixed(1)}; requested ${requested[axis].toFixed(1)}`);
  const track=el.closest('.dual-range');track.style.setProperty('--actual',clamp((actual[axis]-Number(el.min))/(Number(el.max)-Number(el.min))*100,0,100)+'%');
 }
 $('electric').classList.toggle('active',s.engine==='electric');$('diesel').classList.toggle('active',s.engine==='diesel');$('silent').classList.toggle('active',s.silent);
 $('engine-hint').textContent=drone?'Boat holds its own helm orders.':s.silent?'Silent running limits actual speed to 3 kn.':s.engine==='diesel'?(s.depth<=14?'Charging. High acoustic signature.':'No intake. Rise to 14 m or switch.'):s.battery<=0?'Battery exhausted. Surface for diesel.':'Quiet motors. Electric limit: 14 kn.';
 const active=feedActive(s,view),tower=view==='tower',gun=view==='gun',absLook=drone?s.drone.heading:gun?wrapHeading(s.heading+s.gun.angle):tower?wrapHeading(s.heading+s.towerAngle):scopeBearing(s),optical=view==='scope'||drone||tower||gun;
 const labels={gun:['DECK GUN',active?`DU EXPLOSIVE · ${s.gun.ammo} ROUNDS · ${s.gun.elevation.toFixed(1)}° ELEVATION`:'SURFACE TO MAN THE GUN'],tower:['CONNING TOWER',active?'OPEN BRIDGE · DRAG VERTICALLY TO LOOK DOWN':'SURFACE TO GO TOPSIDE'],scope:['OPTICAL OBSERVATION',active?`PERISCOPE · ${scopeWashed(s,env)?'LENS AWASH':deg(s.scopeAngle)+'° RELATIVE'} · ${(6*zoom).toFixed(0)}×`:'OPTICS OFFLINE'],sonar:['ACOUSTIC OBSERVATION',`HEADING UP · ${deg(s.heading)}° TRUE · ESTIMATED CONTACTS`],chart:['NAVIGATION CHART',`NORTH UP · ${chart.zoom.toFixed(1)}× · ${chart.follow?'FOLLOWING BOAT':'FREE PAN'}`],drone:['REMOTE INSPECTION',`ROV ${s.drone.mode.toUpperCase()} · BATTERY ${Math.round(s.drone.battery)}%`]};
 const scopeTab=document.querySelector('[data-view=scope]'),droneTab=document.querySelector('[data-view=drone]');scopeTab.classList.toggle('hidden',s.systems.periscope===0);droneTab.classList.toggle('damaged',s.drone.mode==='lost');droneTab.innerHTML='<span>04</span> '+(s.drone.mode==='lost'?'DRONE LOST':'DRONE');
 all('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
 $('view-label').textContent=labels[view][0];$('view-subtitle').textContent=labels[view][1];$('view-tag').textContent=optical?active?(paused?'FROZEN':'LIVE FEED'):'OFFLINE':view==='chart'?'SECTOR 07':'HEADING UP';
 $('look-heading').textContent=deg(absLook)+'° TRUE';all('.compass span').forEach((el,i)=>el.textContent=deg(absLook+(i-2)*(drone?15:7.5/zoom)));
 const world=$('world');if(!active&&world.dataset.online!=='false')scene?.clear();world.dataset.online=String(active);world.style.display=active?'block':'none';world.setAttribute('aria-hidden',String(!active));world.style.opacity='1';
 $('tactical').style.display=view==='sonar'||view==='chart'?'block':'none';$('scope-overlay').style.display=(view==='scope'||gun)&&active?'block':'none';$('scope-overlay').style.opacity='1';
 for(const id of ['compass','look-heading']){$(id).classList.toggle('hidden',!optical||!active);$(id).style.opacity='1';}
 $('view-message').classList.toggle('hidden',!optical||active);
 $('view-message').innerHTML=gun?'DECK GUN OFFLINE<br><small>Surface fully to aim and fire the deck gun.</small>':tower?'CONNING TOWER OFFLINE<br><small>Surface to view from the top of the conning tower.</small>':view==='scope'?`PERISCOPE OFFLINE<br><small>${s.depth>15?'Rise to 15 meters or less to look.':'The mast is lowered. Press P to raise it.'}</small>`:s.drone.mode==='lost'?'DRONE LOST<br><small>'+esc(s.drone.lostReason)+'</small>':'DRONE STOWED<br><small>'+esc(droneDeployReason(s)||'Deploy at ≤3 knots, down to 280 meters. Keep within 100 m.')+'</small>';
 $('scope-tools').classList.toggle('hidden',view!=='scope');$('scope-alignment').classList.toggle('hidden',view!=='scope');$('bow-readout').classList.toggle('hidden',view!=='scope'||!active);const rel=((s.scopeAngle+540)%360)-180;$('bow-readout').textContent=`BOW ${deg(s.heading)}° · VIEW ${deg(scopeBearing(s))}° · ${Math.abs(rel).toFixed(0)}° ${rel<0?'PORT':'STARBOARD'}${s.scopeSteerBearing!==null?' · BOAT TURNING TO VIEW':''}`;$('gun-tools').classList.toggle('hidden',!gun);$('gun-trigger').disabled=!canIssue(s,context())||!active||s.gun.ammo<=0||s.systems.deckgun<=10;$('gun-sight-status').textContent=`${s.gun.ammo} ROUNDS · ELEV ${s.gun.elevation.toFixed(1)}°`;$('air-warning').classList.toggle('hidden',!['arming','airborne'].includes(s.airSupport.status));$('air-warning').textContent=s.airSupport.status==='arming'?`AIR SUPPORT PREPARING · ${Math.ceil(s.airSupport.launchAt-s.time)}s`:'AIRCRAFT AIRBORNE · DIVE TO BREAK VISUAL CONTACT';$('drone-photo').classList.toggle('hidden',s.mission!=='survey');
 $('drone-instruments').classList.toggle('hidden',!drone||!active);$('drone-instruments').innerHTML=`<b>ROV ${s.drone.mode.toUpperCase()}</b><span>CHARGE ${Math.round(s.drone.battery)}% · HULL ${Math.round(s.drone.hull)}%</span><span>LINK ${Math.round(separation(s,s.drone))} / 100 M</span><span>MOBILITY ${Math.round(s.drone.mobility)}% · BUOYANCY ${Math.round(s.drone.buoyancy)}%</span>`;
 const strike=s.lightning.at(-1);$('lightning-cue').classList.toggle('hidden',!strike||s.time-strike.time>5||!optical||!active);$('lightning-cue').textContent=strike?`LIGHTNING · ${deg(bearing(s,strike))}° · ${(distance(s,strike)/1000).toFixed(1)} KM${sound.on?' · THUNDER TRAVELING':' · ENABLE SOUND FOR THUNDER'}`:'';$('chart-tools').classList.toggle('hidden',view!=='chart');$('drone-tools').classList.toggle('hidden',view!=='drone');
 $('scope-toggle').innerHTML=(s.scope?'LOWER SCOPE':'RAISE SCOPE')+' <kbd>P</kbd>';
 $('view-hint').textContent=gun?'DRAG TO AIM · HOLD FIRE / J · WATERLINE HITS CAUSE FLOODING':tower?'DRAG TO LOOK AROUND / DOWN · WHEEL FOR BINOCULARS':view==='scope'?(active?'DRAG TO ROTATE SCOPE · WHEEL TO ZOOM':'NO OPTICAL SIGNAL'):view==='sonar'?'BOW AT TOP · CONTACT BEARINGS RELATIVE TO HULL':view==='chart'?'DRAG TO PAN · WHEEL TO ZOOM · CLICK TO PLOT':active?'CAMERA FIXED AHEAD · W/S SPEED · A/D HEADING':'NO DRONE SIGNAL';
 $('view-range').textContent=drone?(active?`HDG ${deg(v.heading)}° · ${v.speed.toFixed(1)} KN · ${v.depth.toFixed(0)} M`:''):view==='chart'?`ZOOM ${chart.zoom.toFixed(1)}×`:'VISIBILITY '+(env.opticalRange/1000).toFixed(1)+' KM';
 $('station-status').textContent=s.depth<=1?'SURFACED · EXPOSED':s.depth<=15?'PERISCOPE DEPTH':s.silent?'SILENT RUNNING':'SUBMERGED';
 $('sim-time').textContent='SKY '+new Date(Math.floor(env.hour*3600)*1000).toISOString().slice(11,16);
 $('weather').textContent=env.phase+' · '+env.weather+' · SEA '+env.seaState;
 $('viewport').dataset.weather=env.weatherId;$('viewport').dataset.dayPhase=env.phase;$('viewport').dataset.lightningActive=String(env.flash>.1);$('viewport').dataset.simSeconds=s.time.toFixed(2);
 $('viewport').dataset.lastLightning=s.lightning.at(-1)?.id||'';$('viewport').dataset.heardThunder=s.acoustics.filter(a=>a.type==='thunder'&&a.heard).length;
 $('viewport').dataset.visibleBolt=String(!!scene?.boltVisible);
 const droneSounding=view==='drone'&&feedActive(s,'drone'),seabed=getSoundings(s,droneSounding);
 $('below-label').textContent=droneSounding?'BELOW DRONE':'BELOW KEEL';$('below-keel').textContent=seabed.belowKeel.toFixed(0)+' m';$('water-depth').textContent=seabed.waterDepth>0?seabed.waterDepth.toFixed(0)+' m':'LAND';
 const warning=seabed.belowKeel<0?'BOTTOM CONTACT':seabed.belowKeel<10?'DANGER · RISE':seabed.belowKeel<30?'SHALLOW CLEARANCE':'CLEAR BELOW';if($('seabed-advice').textContent!==warning)$('seabed-advice').textContent=warning;
 $('soundings').classList.toggle('caution',seabed.belowKeel<30);$('soundings').classList.toggle('danger',seabed.belowKeel<10);
 $('wind-value').textContent=Math.round(env.wind)+' km/h WIND';$('ping').innerHTML=s.pingCooldown>0?`RECHARGING ${Math.ceil(s.pingCooldown)}s`:'ACTIVE PING <kbd>G</kbd>';
 $('contacts-count').textContent=String(s.contacts.length).padStart(2,'0');
 $('contacts').innerHTML=s.contacts.length?s.contacts.map(c=>`<button class="contact-row ${selected===c.id?'active':''}" data-contact="${esc(c.id)}" aria-pressed="${selected===c.id}"><span class="contact-icon">${c.identified?(c.kind==='escort'?'⌁':c.kind==='fishing'?'△':'◇'):'◌'}</span><span><strong>${esc(c.identified?c.name:c.label)}</strong><small>${c.identified?(c.military?'MILITARY':'NEUTRAL'):'UNCLASSIFIED'} · ${c.range?(c.range/1000).toFixed(1)+' KM':'RANGE ?'}</small></span><span class="contact-bearing">${deg(relativeBearing(c.bearing,s.heading))}° R</span></button>`).join(''):'<div class="empty-contacts">Listening to the dark.<br>Contacts appear as you hear them.</div>';
 $('torp-count').textContent=String(s.torps).padStart(2,'0');$('tubes').innerHTML=Array.from({length:6},(_,i)=>`<i class="${i>=s.torps?'spent':''}"></i>`).join('');
 const target=s.contacts.find(c=>c.id===selected);$('weapon-hint').textContent=target?(target.identified&&!target.military?'Identified neutral. Hold fire.':`Firing bearing ${deg(target.bearing)}° true. Seeker may choose another target.`):'Select a contact to set firing bearing.';$('decoy-count').textContent=s.decoys+' LEFT';$('gun-ammo').textContent=s.gun.ammo;const choice=$('gun-target').value;const options='<option value="">MANUAL AIM</option>'+s.contacts.filter(c=>c.identified&&c.age<10&&c.range&&c.kind!=='sub').map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${(c.range/1000).toFixed(1)} KM</option>`).join('')+visualAircraft().map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${Math.round(p.altitude)} M ALT</option>`).join('');if($('gun-target').innerHTML!==options){$('gun-target').innerHTML=options;$('gun-target').value=choice;}if(!choice&&selected)$('gun-target').value=selected;$('torpedo-status').textContent=s.projectiles.map((p,i)=>`TORP ${i+1} · ${p.age<4?'ARMING':p.lock?'SONAR TRACK':'SEARCHING'} · ${deg(p.heading)}°`).join(' / ');$('mobile-engine').textContent=s.engine.toUpperCase();$('mobile-silent').classList.toggle('active',s.silent);$('mobile-stop').textContent=drone?'STOP ROV':'ALL STOP';
 for(const id of ['battery','oxygen','fuel']){$(id+'-value').textContent=Math.round(s[id])+'%';$(id+'-bar').style.width=s[id]+'%';$(id+'-value').style.color=s[id]<20?'var(--red)':'';}
 $('alert-label').textContent=s.alert>60?'UNDER PURSUIT':s.alert>30?'POSSIBLE DETECTION':'UNDETECTED';$('alert-label').style.color=s.alert>30?'var(--red)':'var(--green)';$('alert-dot').style.background=s.alert>30?'var(--red)':'var(--green)';
 $('noise-value').textContent='SELF NOISE '+Math.round(s.noise)+' dB';$('clearance').textContent='KEEL CLEARANCE '+Math.round(getSoundings(s).belowKeel)+' m';$('damage-flash').style.opacity=s.shock?String(s.shock*.2):'0';$('cracks').classList.toggle('hidden',!(drone?active&&s.drone.camera<65:view==='scope'&&active&&s.hull<=30));
 $('viewport').dataset.paused=String(paused);$('viewport').dataset.station=view;
 for(const {el,enabled} of commandControls)el.disabled=!canIssue(s,context())||!enabled();
 all('[data-key]').forEach(b=>{b.disabled=!canIssue(s,context())||(b.dataset.key==='KeyJ'?view!=='gun'||!active||s.gun.ammo<=0||s.systems.deckgun<=10:!pilotEnabled());if(b.disabled||!keys.has(b.dataset.key))b.classList.remove('held');});
}

function canvasContext(id){const c=$(id),r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);if(c.width!==Math.round(r.width*d)||c.height!==Math.round(r.height*d)){c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);}const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);return{ctx,w:r.width,h:r.height};}
function drawSonar(id,mini,time){
 const {ctx:c,w,h}=canvasContext(id);if(!w||!h)return;const cx=w/2,cy=mini?h*.49:h*.47,R=mini?Math.min(w*.35,h*.32):Math.min(w*.33,h*.33);
 if(state.systems.sonar<=25){c.fillStyle='#102321';c.fillRect(0,0,w,h);c.fillStyle='#db8075';c.font='14px IBM Plex Mono,monospace';c.textAlign='center';c.fillText('ARRAY DAMAGED',w/2,h/2);return;}
 c.fillStyle=mini?'#102321':'#0e1f21';c.fillRect(0,0,w,h);const glow=c.createRadialGradient(cx,cy,0,cx,cy,R);glow.addColorStop(0,'#1c3930');glow.addColorStop(1,'#102320');c.fillStyle=glow;c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.fill();
 c.lineWidth=.7;c.strokeStyle='#547c6050';for(let i=1;i<=4;i++){c.beginPath();c.arc(cx,cy,R*i/4,0,Math.PI*2);c.stroke();}for(let a=0;a<360;a+=30){c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.sin(rad(a))*R,cy-Math.cos(rad(a))*R);c.stroke();}
 c.fillStyle='#9cb794';c.font=(mini?'12':'14')+'px IBM Plex Mono, monospace';c.textAlign='center';for(let a=0;a<360;a+=30)c.fillText(deg(a),cx+Math.sin(rad(a))*(R+19),cy-Math.cos(rad(a))*(R+19)+4);
 const north=rad(relativeBearing(0,state.heading));c.fillStyle='#d7b77d';c.font='12px IBM Plex Mono,monospace';c.fillText('N',cx+Math.sin(north)*(R-12),cy-Math.cos(north)*(R-12)+4);
 const sweep=(time*.18)%(Math.PI*2);c.save();c.translate(cx,cy);c.rotate(sweep);const sg=c.createConicGradient(-.5,0,0);sg.addColorStop(0,'#b0bc6d00');sg.addColorStop(.06,'#a0bc6d25');sg.addColorStop(.08,'#b8ce8020');sg.addColorStop(.081,'#b0bc6d00');sg.addColorStop(1,'#b0bc6d00');c.fillStyle=sg;c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.fill();c.restore();
 if(state.pingAge<8){c.strokeStyle=`rgba(192,209,136,${.6*(1-state.pingAge/8)})`;c.beginPath();c.arc(cx,cy,R*state.pingAge/8,0,Math.PI*2);c.stroke();}
 const labels=[];
 for(const q of state.contacts){
  const a=rad(relativeBearing(q.bearing,state.heading)),r=q.range?Math.min(.95,q.range/6000)*R:R*.78,x=cx+Math.sin(a)*r,y=cy-Math.cos(a)*r;
  c.strokeStyle=q.id===selected?'#efd19a':'#a3bd78';c.globalAlpha=Math.max(.25,1-q.age/220);c.lineWidth=q.id===selected?1.5:1;
  if(!q.range){c.beginPath();c.arc(cx,cy,r,a-Math.PI/2-.05,a-Math.PI/2+.05);c.stroke();c.setLineDash([2,5]);c.beginPath();c.moveTo(cx+Math.sin(a)*R*.2,cy-Math.cos(a)*R*.2);c.lineTo(x,y);c.stroke();c.setLineDash([]);}else{c.beginPath();c.moveTo(x,y-5);c.lineTo(x+5,y);c.lineTo(x,y+5);c.lineTo(x-5,y);c.closePath();c.stroke();}
  if(!mini)labels.push({q,x,y});c.globalAlpha=1;
 }
 const occupied=[];
 for(const {q,x,y} of labels.sort((a,b)=>a.y-b.y)){
  let ly=clamp(y-8,108,h-150),lx=clamp(x+15,20,w-190);while(occupied.some(p=>Math.abs(p.x-lx)<180&&Math.abs(p.y-ly)<38))ly+=38;occupied.push({x:lx,y:ly});
  c.strokeStyle='#86a17c66';c.beginPath();c.moveTo(x+5,y);c.lineTo(lx-4,ly);c.stroke();c.textAlign='left';c.font='14px IBM Plex Mono,monospace';c.fillStyle='#d4d6af';c.fillText(q.identified?q.name:q.label,lx,ly);c.font='12px IBM Plex Mono,monospace';c.fillStyle='#a2b69a';c.fillText(q.range?Math.round(q.confidence*100)+'% CONFIDENCE':'RANGE UNKNOWN',lx,ly+17);
 }
 c.fillStyle='#e2d19e';c.beginPath();c.moveTo(cx,cy-8);c.lineTo(cx-4,cy+5);c.lineTo(cx+4,cy+5);c.closePath();c.fill();
 if(!mini){const yy=h-82;c.strokeStyle='#46675b66';c.beginPath();c.moveTo(30,yy);c.lineTo(w-30,yy);c.stroke();c.fillStyle='#a0b49c';c.textAlign='left';c.font='12px IBM Plex Mono,monospace';c.fillText('HYDROPHONE ARRAY · RELATIVE BEARING',30,yy-12);c.beginPath();for(let x=30;x<w-30;x+=2){const noise=Math.sin(x*1.53+time*3)*Math.sin(x*.31+time*1.4)*3,signal=state.contacts.reduce((n,q)=>n+Math.exp(-(((x/w-relativeBearing(q.bearing,state.heading)/360)*80)**2))*13,0),y=yy+20+noise-signal;if(x===30)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle='#a5b678';c.stroke();}
}
function drawChart(){
 const {ctx:c,w,h}=canvasContext('tactical'),p=chartTransform(chart,w,h,state),{scale:k,cx,cy}=p,sx=x=>cx+x*k,sy=y=>cy-y*k;
 c.fillStyle='#142a2d';c.fillRect(0,0,w,h);
 const cell=clamp(200/chart.zoom,35,800),tl=chartWorldAt(chart,0,0,w,h,state),br=chartWorldAt(chart,w,h,w,h,state),startX=Math.floor(tl.x/cell)*cell,startY=Math.floor(br.y/cell)*cell,nx=Math.ceil((br.x-startX)/cell)+1,ny=Math.ceil((tl.y-startY)/cell)+1,depths=new Float32Array((nx+1)*(ny+1));
 for(let ix=0;ix<=nx;ix++)for(let iy=0;iy<=ny;iy++)depths[ix*(ny+1)+iy]=bottom(startX+ix*cell,startY+iy*cell);
 const at=(x,y)=>depths[x*(ny+1)+y];
 for(let ix=0;ix<nx;ix++)for(let iy=0;iy<ny;iy++){const d=at(ix,iy);if(d<0)c.fillStyle='#536750';else if(d<60)c.fillStyle='#385957';else if(d<120)c.fillStyle='#264849';else if(d<180)c.fillStyle='#1b373b';else continue;c.fillRect(sx(startX+ix*cell),sy(startY+(iy+1)*cell),cell*k+1,cell*k+1);}
 c.lineWidth=.7;
 for(const level of [0,40,80,120,160,200,240]){c.strokeStyle=level===0?'#8e9b6c':'#6c8e7c50';c.beginPath();for(let ix=0;ix<nx;ix++)for(let iy=0;iy<ny;iy++){
  const x=startX+ix*cell,y=startY+iy*cell,corners=[{x,y,d:at(ix,iy)},{x:x+cell,y,d:at(ix+1,iy)},{x:x+cell,y:y+cell,d:at(ix+1,iy+1)},{x,y:y+cell,d:at(ix,iy+1)}],hits=[];
  for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];if((a.d<level)!==(b.d<level)){const t=(level-a.d)/(b.d-a.d);hits.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}
  if(hits.length>=2){c.moveTo(sx(hits[0].x),sy(hits[0].y));c.lineTo(sx(hits[1].x),sy(hits[1].y));}
 }c.stroke();}
 c.strokeStyle='#759a8133';c.lineWidth=.6;const grid=chart.zoom<.6?5000:1000;
 for(let x=Math.floor(tl.x/grid)*grid;x<br.x;x+=grid){c.beginPath();c.moveTo(sx(x),0);c.lineTo(sx(x),h);c.stroke();}for(let y=Math.floor(br.y/grid)*grid;y<tl.y;y+=grid){c.beginPath();c.moveTo(0,sy(y));c.lineTo(w,sy(y));c.stroke();}
 c.textAlign='center';c.font='14px IBM Plex Mono,monospace';c.fillStyle='#b9c5a4';c.fillText('GREYBANK ISLAND',sx(-3800),sy(4000));c.fillStyle='#9ab29f';c.font='12px IBM Plex Mono,monospace';c.fillText('REEF · 65–110 M',sx(1900),sy(700));
 c.strokeStyle='#90bb9f';c.setLineDash([3,4]);c.beginPath();c.arc(sx(state.home.x),sy(state.home.y),400*k,0,Math.PI*2);c.stroke();c.setLineDash([]);c.fillStyle='#bdd5af';c.font='14px IBM Plex Mono,monospace';c.fillText('EXTRACTION · SURFACE',sx(state.home.x),sy(state.home.y)+400*k+23);
 if(state.site){const site=state.site;c.strokeStyle='#e5c389';c.beginPath();c.arc(sx(site.x),sy(site.y),Math.max(7,75*k),0,Math.PI*2);c.stroke();c.fillStyle='#efcf98';c.font='14px IBM Plex Mono,monospace';c.textAlign='left';c.fillText(site.name,sx(site.x)+12,sy(site.y)-12);c.font='12px IBM Plex Mono,monospace';c.fillText('MISSION SITE · '+Math.round(site.depth)+' M',sx(site.x)+12,sy(site.y)+8);}
 if(['remote','return'].includes(state.drone.mode)){c.strokeStyle='#81dfcc';c.setLineDash([3,3]);c.beginPath();c.moveTo(sx(state.x),sy(state.y));c.lineTo(sx(state.drone.x),sy(state.drone.y));c.stroke();c.setLineDash([]);c.fillStyle='#81dfcc';c.fillRect(sx(state.drone.x)-3,sy(state.drone.y)-3,6,6);}
 for(const q of state.contacts){c.strokeStyle=q.id===selected?'#d6bd86':'#acb997';c.globalAlpha=clamp(1-q.age/240,.2,.8);c.setLineDash([4,5]);if(q.range){const uncertainty=(1-q.confidence)*1500+100;c.beginPath();c.ellipse(sx(q.x),sy(q.y),uncertainty*k,uncertainty*k*.65,-rad(q.bearing),0,Math.PI*2);c.stroke();c.fillStyle='#d6d3a7';c.fillRect(sx(q.x)-2,sy(q.y)-2,4,4);c.textAlign='left';c.font='14px IBM Plex Mono,monospace';c.fillText((q.identified?q.name:q.label)+' ?',sx(q.x)+10,sy(q.y)-10);}else{c.beginPath();c.moveTo(sx(state.x),sy(state.y));c.lineTo(sx(state.x+Math.sin(rad(q.bearing))*6500),sy(state.y+Math.cos(rad(q.bearing))*6500));c.stroke();}c.setLineDash([]);c.globalAlpha=1;}
 if(state.route){c.setLineDash([4,5]);c.strokeStyle='#d7bd82';c.beginPath();c.moveTo(sx(state.x),sy(state.y));c.lineTo(sx(state.route.x),sy(state.route.y));c.stroke();c.setLineDash([]);c.beginPath();c.arc(sx(state.route.x),sy(state.route.y),6,0,Math.PI*2);c.stroke();}
 c.save();c.translate(sx(state.x),sy(state.y));c.rotate(rad(state.heading));c.fillStyle='#e5d3a4';c.beginPath();c.moveTo(0,-11);c.lineTo(6,8);c.lineTo(0,5);c.lineTo(-6,8);c.closePath();c.fill();c.restore();c.fillStyle='#ced9c1';c.textAlign='left';c.font='12px IBM Plex Mono,monospace';c.fillText('YOU · '+Math.round(state.depth)+' M',sx(state.x)+15,sy(state.y)+22);
 c.strokeStyle='#b3c6a6';c.beginPath();c.moveTo(w-55,95);c.lineTo(w-55,132);c.stroke();c.fillStyle='#b3c6a6';c.textAlign='center';c.font='14px IBM Plex Mono,monospace';c.fillText('N',w-55,87);c.fillText('▲',w-55,106);
 c.font='12px IBM Plex Mono,monospace';c.textAlign='right';c.fillText((grid/1000)+' KM GRID',w-25,h-116);
}

function drawScope(){
 const look=scopeBearing(state);
 const {ctx:c,w,h}=canvasContext('scope-overlay');c.clearRect(0,0,w,h);if(!state.scope||state.depth>15)return;
 const vignette=c.createRadialGradient(w/2,h*.48,Math.min(w,h)*.18,w/2,h*.48,Math.max(w,h)*.62);vignette.addColorStop(0,'#06101400');vignette.addColorStop(.65,'#06101405');vignette.addColorStop(1,'#030b11e0');c.fillStyle=vignette;c.fillRect(0,0,w,h);
 const cy=h*.5,cx=w/2;c.strokeStyle='#d5d8ba8c';c.lineWidth=.8;c.beginPath();c.moveTo(cx-100,cy);c.lineTo(cx-17,cy);c.moveTo(cx+17,cy);c.lineTo(cx+100,cy);c.moveTo(cx,cy-53);c.lineTo(cx,cy-15);c.moveTo(cx,cy+15);c.lineTo(cx,cy+53);for(let x=-80;x<=80;x+=20){if(!x)continue;c.moveTo(cx+x,cy-4);c.lineTo(cx+x,cy+4);}c.stroke();c.strokeStyle='#d5d8ba55';c.beginPath();c.arc(cx,cy,13,0,Math.PI*2);c.stroke();c.fillStyle='#c8ccb3';c.font='14px IBM Plex Mono,monospace';c.textAlign='center';c.fillText('6',cx+124,cy+3);c.fillText('6',cx-124,cy+3);
 if(scopeWashed(state))return;
 const focused=state.contacts.filter(q=>q.identified&&q.age<=3&&q.kind!=='sub'&&Math.abs(delta(q.bearing,look))<19/zoom).sort((a,b)=>Math.abs(delta(a.bearing,look))-Math.abs(delta(b.bearing,look))).slice(0,1);
 for(const q of focused){const d=delta(q.bearing,look);const x=clamp(cx+Math.tan(rad(d))/Math.tan(rad(19/zoom))*cx,105,w-105);c.fillStyle='#d8d9b5';c.font='14px IBM Plex Mono,monospace';c.fillText(q.name.toUpperCase(),x,h*.56);c.fillStyle='#bdc7b0';c.font='12px IBM Plex Mono,monospace';c.fillText((q.range/1000).toFixed(1)+' KM · '+(q.military?'MILITARY':'NEUTRAL'),x,h*.56+19);}
}
function drawGun(){const {ctx:c,w,h}=canvasContext('scope-overlay');c.clearRect(0,0,w,h);const x=w/2,y=h/2;c.strokeStyle='#e3d4ab';c.lineWidth=1;c.beginPath();c.arc(x,y,11,0,Math.PI*2);c.moveTo(x-50,y);c.lineTo(x-15,y);c.moveTo(x+15,y);c.lineTo(x+50,y);c.moveTo(x,y-35);c.lineTo(x,y-15);c.moveTo(x,y+15);c.lineTo(x,y+35);c.stroke();}
function showResult(){if(resultShown)return;resultShown=true;persist();const win=state.status==='won';$('result-title').textContent=win?'Home, quietly.':state.status==='compromised'?'A costly mistake.':state.status==='expired'?'The window has closed.':'The sea falls silent.';$('result-body').textContent=win?(state.operation?(state.mission==='survey'?state.operation.find:`${state.operation.rescued} survivors brought home. ${state.operation.dead} lost before recovery. The rescue crew is safely aboard.`):'The intelligence is aboard. The crew is safe. Somewhere out there, the convoy sails on.'):state.status==='compromised'?'A neutral vessel was lost. Your patrol has been recalled. Identify a silhouette before trusting a seeker.':state.status==='expired'?'Command has recalled the patrol after 30 simulated minutes. Time compression is useful, but keep an eye on the clock.':'Your boat could take no more. A quieter speed, a little more water under the keel, or one fewer look might change the next patrol.';$('result-stats').innerHTML=`<span>PATROL<br>${Math.floor(state.time/60)}m ${Math.floor(state.time%60)}s</span><span>HULL<br>${Math.round(state.hull)}%</span><span>PHOTOS<br>${state.photos.length}</span>`;$('result-dialog').showModal();}
function frame(now){
 const realDt=Math.min((now-last)/1000,.5);last=now;const ctx=context();
 if(canIssue(state,ctx)){
  const before=state.events[0],priorAlert=state.alert,wasOutsidePickup=distance(state,state.home)>=400,priorRescued=state.operation?.rescued||0,wasHolding=state.operation?.holding;
  applyHelmKeys(state,ctx,keys,realDt);if(view==='gun'&&keys.has('KeyJ')&&feedActive(state,'gun')){if(fireDeckGun(state,{bearing:wrapHeading(state.heading+state.gun.angle),elevation:state.gun.elevation}))setRate(1);}const hadRoute=!!state.route;step(state,realDt*rate);renderClock=state.time;
  if((state.operation?.rescued||0)>priorRescued)sound.tone('photo');
  if(state.mission!=='survey'&&state.operation?.holding&&!wasHolding){setRate(1);toast('Rescue holding conditions met. Crew transfer underway.');}
  if(hadRoute&&!state.route){setRate(1);toast('Waypoint reached. All stop. Time compression disengaged.');}
  if(wasOutsidePickup&&state.phase==='extract'&&distance(state,state.home)<400){setRate(1);toast('Pickup area reached. Surface to complete the patrol.');}
  if(state.alert>40&&priorAlert<=40){setRate(1);toast('Possible detection. Time compression disengaged.');sound.tone('contact');}
  if(before!==state.events[0]){const e=state.events[0];if(e.kind==='contact'||e.kind==='damage'||e.text.startsWith('Drone link')||(state.alert>40&&rate>1))setRate(1);if(e.text.startsWith('Drone link')){toast(e.text);sound.tone('contact');}if(e.kind==='damage'&&!e.text.includes('Depth charge shock'))sound.tone(e.text.includes('in the water')?'contact':'damage');if(e.kind==='contact')sound.tone('contact');if(e.kind==='success'&&lastToast!==e.text){toast(e.text);lastToast=e.text;}}
  sound.update(state,ctx);if(state.status!=='patrol')showResult();
 }
 if(String(feedActive(state,view))!==$('world').dataset.online)updateUI();
 const r=vp.getBoundingClientRect();
 if(scene&&feedActive(state,view)){scene.resize(r.width,r.height);scene.render(state,view,zoom,renderClock);}
 if(view==='scope'&&feedActive(state,'scope'))drawScope();if(view==='gun'&&feedActive(state,'gun'))drawGun();if(view==='sonar')drawSonar('tactical',false,renderClock);if(view==='chart')drawChart();drawSonar('mini-sonar',true,renderClock);
 if(now-lastUI>100){updateUI();sound.update();lastUI=now;}if(now-lastSave>8000&&!ctx.modal&&!paused){persist();lastSave=now;}requestAnimationFrame(frame);
}
setView(scene?'scope':'sonar');updateUI();if(saved)$('resume').classList.remove('hidden');$('briefing').showModal();requestAnimationFrame(frame);
