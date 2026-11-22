import {disciplinaryFinding} from './patrol-reports.js';
import {depthLimit,pressureLevel} from './pressure.js';
import {createGame,step,bottom,bearing,delta,distance,rad,clamp,ping,photograph,fire,decoy,deployDrone,recallDrone,log,MISSIONS,restore,getSoundings} from './sim.js';
import {droneDeployReason,SYSTEM_NAMES,DRONE_LIMITS} from './systems.js';
import {separation} from './mechanics.js';
import {objectiveState,operationApproach,operationConditions,startRescue,dronePhotograph,parsePatrolSeed,patrolSetup} from './missions.js';
import {OceanScene} from './scene.js';
import {MAX_RUN,fireDeckGun,aimGunAt,firingBearing} from './combat.js';
import {HeldInput} from './input.js';
import {SoundSystem} from './audio.js';
import {environmentAt,WEATHER,TIMES,scopeWashed} from './environment.js';
import {wrapHeading,relativeBearing,scopeBearing,alignScope,canIssue,feedActive,helmFor,setHelmOrder,nudgeHelm,throttleDetent,applyHelmKeys,steerDrone,initialOrbit,orbitDrag,chartTransform,chartWorldAt,panChart,zoomChart,opticalZoomLimit} from './controls.js';
import {isSurfaced,droneStatus} from './vehicle-status.js';
import {reconcileKeyedChildren,contactRow,updateContactRow,patrolNotices,hydrophoneStrength,sonarLayout,SONAR_RANGES,sonarRangeFraction} from './ui.js';
import {photoArchive,recordPhoto,recordExposure,restorePhotos} from './photos.js';
import {captureOptics,captureSatellite,captureSlotPortrait} from './photo-capture.js';
import {requestRecon,reconStatus,reconAreaForDisplay} from './recon.js';
import {chartContacts,estimateAt} from './track-estimates.js';
import {sonarReading} from './contact-readings.js';
import {lossPresentation} from './loss.js';
import {persistPatrol,resumablePatrol} from './persistence.js';
import {SLOT_COUNT,listSlots,writeSlot,loadSlot} from './patrol-slots.js';
import {difficultyControls,patrolDifficulty} from './difficulty.js';
import {allowedShortcut,keyLabel,shortcutActions,shortcutBindings} from './shortcuts.js';
import {patrolKills,serviceRecord} from './service-record.js';
const $=id=>document.getElementById(id),all=q=>[...document.querySelectorAll(q)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deg=n=>String(Math.round(wrapHeading(n))%360).padStart(3,'0');
let state=createGame(),view='scope',zoom=1,rate=1,paused=false,selected=null,last=performance.now(),lastUI=0,lastSave=0,lastToast='',resultShown=false,toastTimer,renderClock=0,presentationSeconds=0;
let chart={x:0,y:0,zoom:1,follow:true,reconArea:null},saved=null,patrolStarted=false;
let orderAxis=null,reconPlacement=false,photoKey='',lossStartedAt=0;const zooms={scope:1,tower:1,gun:1};let library=[];
let difficulty=patrolDifficulty();
try{difficulty=patrolDifficulty(JSON.parse(localStorage.getItem('quiet-depths-difficulty-v1')));}catch{}
let previousView='scope';
let sonarRange=SONAR_RANGES.at(-1);
let orbit=null;
let bindings=shortcutBindings(),remapping=null;
try{bindings=shortcutBindings(JSON.parse(localStorage.getItem('quiet-depths-shortcuts-v1')));}catch{}
try{library=restorePhotos(JSON.parse(localStorage.getItem('quiet-depths-photos-v1')||'[]'));}catch{}
state.photoArchive=library;
try{saved=resumablePatrol(restore(localStorage.getItem('quiet-depths-v1')));}catch{}
let scene=null;
try{scene=new OceanScene($('world'));}catch(e){console.warn('WebGL unavailable',e);toast('WebGL unavailable. Sonar and chart are available.');view='sonar';}
const held=new HeldInput(),keys=held.keys,commandControls=[];let drawer=null;
const context=()=>({view,paused,modal:!!document.querySelector('dialog[open]')});
const pilotEnabled=()=>view!=='orbit'&&(view!=='drone'||state.drone.mode==='remote');
const compactLayout=matchMedia('(max-width:1100px)');
const sound=new SoundSystem(()=>state,context,status=>{
 const el=$('sound');el.dataset.audioContext=status.context;el.dataset.engineSources=status.engines;el.dataset.effects=status.effects;
 if(status.last){el.dataset.lastAcoustic=status.last.type;el.dataset.lastDelay=status.last.delay.toFixed(3);el.dataset.lastGain=(status.last.currentGain??status.last.gain).toFixed(4);el.dataset.lastCutoff=(status.last.currentCutoff??status.last.cutoff).toFixed(0);}else{for(const key of ['lastAcoustic','lastDelay','lastGain','lastCutoff'])delete el.dataset[key];}
});
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
let saveStatusTimer,saveWarning='';
function persist(){
 if(!patrolStarted)return;
 library=photoArchive(state);
 const status=$('save-status');
 clearTimeout(saveStatusTimer);
 let warning='';
 try{
  const {photosSaved,recordSaved}=persistPatrol(localStorage,state,patrolStarted);
  if(!photosSaved&&!recordSaved)warning='Photos and service record could not be saved.';
  else if(!photosSaved)warning='Photos could not be saved.';
  else if(!recordSaved)warning='Service record could not be saved.';
 }catch{warning='Patrol progress could not be saved.';}
 status.textContent=warning||'PATROL SAVED';
 if(!warning)saveStatusTimer=setTimeout(()=>status.textContent='LOCAL AUTOSAVE',1400);
 if(warning&&warning!==saveWarning)toast(warning);
 saveWarning=warning;
}
function bindCommand(element,event,action,enabled=()=>true){
 const el=typeof element==='string'?$(element):element;commandControls.push({el,enabled});el.dataset.command='true';
 el.addEventListener(event,e=>{if(view==='orbit'||!canIssue(state,context())||!enabled())return;action(e);updateUI();});
}
function order(axis,value){return setHelmOrder(state,context(),axis,value);}
function bindOrderRange(id,axisForInput){
 const input=$(id);
 let useDetent=true;
 input.addEventListener('pointerdown',()=>{useDetent=true;});
 input.addEventListener('keydown',()=>{useDetent=false;});
 bindCommand(input,'input',()=>{
  const axis=axisForInput(),value=input.valueAsNumber;
  const requested=axis==='speed'&&useDetent?throttleDetent(value):value;
  if(axis&&order(axis,requested)&&requested!==value)input.value=requested;
 },pilotEnabled);
}
function closeDrawer(){drawer=null;document.body.removeAttribute('data-drawer');$('drawer-backdrop').classList.add('hidden');all('[data-panel]').forEach(b=>b.setAttribute('aria-expanded','false'));}
function setRate(r){rate=r;all('[data-time]').forEach(b=>b.classList.toggle('active',+b.dataset.time===r));$('mobile-time').textContent=r+'×';$('mobile-time').setAttribute('aria-label','Time compression '+r+' times');}
function setPaused(p){paused=p;held.clear();drag=null;document.body.classList.toggle('paused',p);$('pause').setAttribute('aria-label',p?'Resume patrol':'Pause patrol');updateUI();sound.update();persist();}
function setView(v){if(v==='drone'&&!state.difficulty.drone)return;zooms[view]=zoom;zoom=zooms[v]||1;orderAxis=null;$('order-sheet').classList.add('hidden');if(v==='scope'&&state.systems.periscope===0)v='tower';view=v;document.body.classList.toggle('orbiting',v==='orbit');held.clear();drag=null;closeDrawer();all('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);b.setAttribute('aria-pressed',b.dataset.view===v);});updateUI();}
function changeOrbit(){
 if(view==='orbit'){setView(previousView);$('open-orbit').focus();return;}
 if(!scene||!state.difficulty.orbitCamera||context().modal||!patrolStarted)return;
 orbit??=initialOrbit(state);
 previousView=view;setView('orbit');$('orbit-pause').focus({preventScroll:true});
}
function zoomOrbit(factor){orbit.distance=clamp(orbit.distance*factor,37,120);}
function updateMissionBriefing(id){
 const mission=MISSIONS.find(m=>m.id===id);
 if(!mission)return;
 document.querySelector('.briefing-tip p').innerHTML=esc(mission.desc)+' <strong>'+esc(keyLabel(bindings.Escape))+' pauses the patrol.</strong>';
}
function renderServiceRecord(){
 try{const record=serviceRecord(localStorage);$('service-record').textContent=`${record.ships} ships sunk · ${record.submarines} submarines sunk · ${record.doubleHunts} two-submarine patrols`;}catch{}
}
const briefingPatrol=()=>patrolStarted?state:saved;
let briefingVisit=0;
function openBriefing(){
 held.clear();persist();renderServiceRecord();briefingVisit++;
 const current=briefingPatrol();
 $('current-patrol').hidden=!current;
 if(current){
  $('current-mission').textContent=MISSIONS.find(m=>m.id===current.mission).name;
  $('current-seed').textContent='Seed '+current.patrol.seed;
  $('current-seed').setAttribute('aria-label','Copy patrol seed '+current.patrol.seed);
 }
 $('seed-status').textContent='';$('current-seed-status').textContent='';
 $('briefing').showModal();
 $('resume').classList.toggle('hidden',!resumablePatrol(current));
 refreshSlots();sound.update();
}
function start(setup=null,snapshot=null){
 if(!$('briefing').open)return;
 const previousPatrol=state;
 if(setup===null){
  const resumed=snapshot||resumablePatrol(saved,patrolStarted?state:null);
  if(!resumed)return;
  if(resumed!==state)selected=null;
  state=resumed;
 }else{
  const seedInput=$('patrol-seed');
  seedInput.value=seedInput.value.trim();
  const seed=parsePatrolSeed(seedInput.value);
  seedInput.setCustomValidity(seed===undefined?'Enter a whole number from 0 to 4294967295.':'');
  if(!seedInput.reportValidity())return;
  state=createGame(setup.mission,seed??randomSeed(),{...setup.conditions,difficulty});
  selected=null;
  newSeed();
 }
 if(state!==previousPatrol)orbit=null;
 patrolStarted=true;
 state.patrolId??=Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');
 state.photoArchive=library.length?library:photoArchive(state);photoKey='';reconPlacement=false;document.body.classList.remove('loss');$('loss-layer').classList.add('hidden');
 chart={x:state.x,y:state.y,zoom:1,follow:true,reconArea:state.recon.area};saved=null;resultShown=false;lastToast='';clearTimeout(toastTimer);$('toast').classList.remove('show');setRate(1);$('briefing').close();setView(scene?(isSurfaced(state)?'tower':'scope'):'sonar');setPaused(false);persist();
}
const randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
function newSeed(){
 const input=$('patrol-seed'),previous=parsePatrolSeed(input.value);
 let next=randomSeed();if(next===previous)next=(next+1)>>>0;
 input.value=String(next);input.setCustomValidity('');$('seed-status').textContent='';
}
async function copySeed(value,status=$('seed-status')){
 if(!Number.isInteger(value)){status.textContent='Enter a valid seed to copy.';return;}
 try{await navigator.clipboard.writeText(String(value));status.textContent='Copied seed '+value+'.';}
 catch{status.textContent='Select the number to copy it. '+value;}
}
newSeed();
$('new-seed').onclick=newSeed;
$('current-seed').onclick=()=>copySeed(briefingPatrol().patrol.seed,$('current-seed-status'));
$('copy-seed').onclick=()=>copySeed(parsePatrolSeed($('patrol-seed').value));
$('patrol-seed').onclick=event=>{event.target.select();copySeed(parsePatrolSeed(event.target.value));};
$('patrol-seed').addEventListener('input',event=>{event.target.setCustomValidity('');$('seed-status').textContent='';});
function renderDifficulty(){$('difficulty-options').innerHTML=difficultyControls.map(control=>{
 const value=difficulty[control.id];
 if(typeof value==='boolean')return `<label>${control.label}<input type="checkbox" data-difficulty="${control.id}" ${value?'checked':''}></label>`;
 return `<label>${control.label}<output>${value}</output><input type="range" data-difficulty="${control.id}" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}"><small>${control.low} ↔ ${control.high}</small></label>`;
}).join('');}
renderDifficulty();
$('difficulty-options').addEventListener('input',event=>{
 const input=event.target,id=input.dataset.difficulty;
 if(!id)return;
 difficulty=patrolDifficulty({...difficulty,[id]:input.type==='checkbox'?input.checked:Number(input.value)});
 const output=input.closest('label').querySelector('output');if(output)output.value=difficulty[id];
 try{localStorage.setItem('quiet-depths-difficulty-v1',JSON.stringify(difficulty));}catch{}
});
const conditionChoices=catalog=>Object.entries(catalog).map(([id,{name}])=>({id,name}));
const missionPicker=globalThis.Elm.MissionPicker.init({
 node:$('patrol-briefing-controls'),
 flags:{selected:state.mission,times:conditionChoices(TIMES),weather:conditionChoices(WEATHER)}
});
missionPicker.ports.missionSelected.subscribe(updateMissionBriefing);
missionPicker.ports.patrolRequested.subscribe(start);
$('reuse-patrol').onclick=()=>{
 const {seed,mission,options}=patrolSetup(briefingPatrol());
 missionPicker.ports.selectSetup.send({mission,conditions:{timeOfDay:options.timeOfDay,weather:options.weather,changing:options.changing}});
 $('patrol-seed').value=seed;$('patrol-seed').setCustomValidity('');
 difficulty=patrolDifficulty(options.difficulty);renderDifficulty();
 $('current-seed-status').textContent='Original setup selected. Choose Begin Patrol to replay.';
};
let slotsRequest=0;
async function refreshSlots(message=''){
 const request=++slotsRequest;
 let entries=[];
 try{
  const stored=await listSlots();
  entries=Array.from({length:SLOT_COUNT},(_,index)=>stored.find(entry=>entry.id===index+1)||
   {id:index+1,revision:'',image:'',label:'Empty'});
 }catch{message=message||'Save slots are unavailable in this browser.';}
 if(request===slotsRequest)missionPicker.ports.showSlots.send({entries,message,canSave:briefingPatrol()?.status==='patrol'});
}
missionPicker.ports.saveSlot.subscribe(async({id,revision})=>{
 const current=briefingPatrol();
 if(!current||current.status!=='patrol')return refreshSlots('Start a patrol to save it.');
 let image='';
 try{image=captureSlotPortrait(scene,current);}catch{/* A camera failure leaves the patrol save usable. */}
 const name=MISSIONS.find(m=>m.id===current.mission).name;
 const minutes=Math.floor(current.time/60),seconds=String(Math.floor(current.time)%60).padStart(2,'0');
 const label=name+' · '+minutes+':'+seconds+' · Seed '+current.patrol.seed;
 try{await writeSlot(id,revision,current,image,label);await refreshSlots('Saved to slot '+id+'.');}
 catch(error){await refreshSlots(error.message||'Could not write the slot.');}
});
missionPicker.ports.readSlot.subscribe(async({id,revision})=>{
 const visit=briefingVisit;
 try{
  const loaded=await loadSlot(id,revision);
  if($('briefing').open&&visit===briefingVisit){start(null,loaded);toast('Loaded slot '+id+'.');}
 }catch(error){await refreshSlots(error.message||'Could not load the slot.');}
});
function requestPatrol(){missionPicker.ports.beginPatrol.send(null);}
function dismissBriefing(){
 if(patrolStarted){$('briefing').close();updateUI();}
 else if(saved)start();
 else requestPatrol();
}
$('start').onclick=requestPatrol;$('resume').onclick=()=>start();$('close-briefing').onclick=dismissBriefing;$('another-patrol').onclick=()=>{$('result-dialog').close();openBriefing();};
$('sound').onclick=()=>{sound.toggle();renderSound();};$('pause').onclick=()=>setPaused(!paused);$('guide').onclick=()=>{held.clear();$('help-dialog').showModal();updateUI();};$('close-help').onclick=()=>{$('help-dialog').close();updateUI();};$('new-patrol').onclick=()=>{$('help-dialog').close();openBriefing();};document.querySelector('.brand').onclick=e=>{e.preventDefault();openBriefing();};
all('dialog').forEach(d=>d.addEventListener('close',()=>{held.clear();updateUI();}));
$('briefing').addEventListener('cancel',e=>{e.preventDefault();dismissBriefing();});
all('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));all('[data-time]').forEach(b=>bindCommand(b,'click',()=>setRate(b.id==='mobile-time'?(rate===1?5:rate===5?20:1):+b.dataset.time)));
$('open-orbit').onclick=changeOrbit;$('orbit-exit').onclick=changeOrbit;$('orbit-pause').onclick=()=>setPaused(!paused);
$('orbit-in').onclick=()=>zoomOrbit(1/1.2);$('orbit-out').onclick=()=>zoomOrbit(1.2);
function scopeToggle(){if(!canIssue(state,context())||state.systems.periscope===0)return;if(state.depth>15){toast('Rise to 15 meters or less to raise the scope.');return;}state.scope=!state.scope;if(!state.scope)scene?.clear();updateUI();}
function takePhoto(){
 if(!canIssue(state,context())||state.photoCooldown>0)return;
 if(view==='drone'&&feedActive(state,'drone')){if(state.mission==='survey'){const result=dronePhotograph(state);toast(result.text);}state.photoCooldown=4;expose({source:'drone',takenAt:state.time,bearing:state.drone.heading,depth:state.drone.depth,caption:state.mission==='survey'?'ROV survey exposure':'ROV camera exposure',seed:state.patrol.seed,mission:state.mission});sound.tone('photo');updateUI();return;}
 if(view!=='scope'||!feedActive(state,'scope'))return;
 if(scopeWashed(state)){toast('A wave washed over the lens. Wait for the trough.');return;}
 const evidence=photograph(state,scopeBearing(state));state.photoCooldown=4;
 expose({source:'scope',takenAt:state.time,bearing:scopeBearing(state),depth:state.depth,caption:evidence?'Merchant silhouette · '+state.photos.length+'/'+state.patrol.photoGoal:'Periscope exposure',seed:state.patrol.seed,mission:state.mission});sound.tone('photo');updateUI();
}
function doPing(){if(!canIssue(state,context()))return;if(ping(state)){sound.tone('ping');setRate(1);}else toast('Sonar capacitors recharging.');updateUI();}
function silent(forceBoat=false){if(!canIssue(state,context())||view==='drone'&&!forceBoat)return;state.silent=!state.silent;if(state.silent){state.targetSpeed=clamp(state.targetSpeed,-3,3);log(state,'Rig for silent running. Maximum three knots.');}updateUI();}
$('scope-align-toggle').onclick=()=>{const open=$('scope-alignment').classList.toggle('open');$('scope-align-toggle').setAttribute('aria-expanded',String(open));};
bindCommand('center-scope','click',()=>{alignScope(state,context(),'center');$('scope-alignment').classList.remove('open');$('scope-align-toggle').setAttribute('aria-expanded','false');},()=>feedActive(state,'scope'));
bindCommand('steer-scope','click',()=>{alignScope(state,context(),'helm-to-scope');$('scope-alignment').classList.remove('open');$('scope-align-toggle').setAttribute('aria-expanded','false');},()=>feedActive(state,'scope'));
bindCommand('open-gun','click',()=>setView('gun'));
bindCommand('aim-gun','click',()=>{const id=$('gun-target').value,c=state.contacts.find(c=>c.id===id),air=state.aircraft.find(p=>p.id===id);if(air&&visualAircraft().some(v=>v.id===id)){aimGunAt(state,{...air,vx:Math.sin(rad(air.heading))*air.speed,vy:Math.cos(rad(air.heading))*air.speed});return;}if(c?.range){const e=estimateAt(c,state.time);aimGunAt(state,{x:e.x,y:e.y,vx:c.fix?.vx||0,vy:c.fix?.vy||0,altitude:2});}},()=>view==='gun'&&feedActive(state,'gun')&&!!$('gun-target').value);
bindCommand('scope-toggle','click',scopeToggle);bindCommand('photo','click',takePhoto,()=>feedActive(state,'scope')&&state.photoCooldown===0&&!scopeWashed(state));bindCommand('ping','click',doPing,()=>state.pingCooldown===0&&state.systems.sonar>25);bindCommand('silent','click',silent,()=>view!=='drone');
for(const axis of ['heading','depth','speed'])bindOrderRange(axis,()=>axis);
bindCommand('port','click',()=>nudgeHelm(state,context(),-15),pilotEnabled);bindCommand('starboard','click',()=>nudgeHelm(state,context(),15),pilotEnabled);
all('[data-depth]').forEach(b=>bindCommand(b,'click',()=>order('depth',+b.dataset.depth),pilotEnabled));
bindCommand('electric','click',()=>{state.engine='electric';log(state,'Electric motors engaged.');},()=>view!=='drone');
bindCommand('diesel','click',()=>{if(state.depth>14){toast('Diesel needs air. Rise to 14 meters or less first.');return;}if(state.fuel<=0){toast('Diesel fuel exhausted.');return;}state.engine='diesel';state.silent=false;log(state,'Diesels engaged. Recharging, but loud.','warning');},()=>view!=='drone');
bindCommand('repair','click',()=>{if(state.hull>=100&&state.flood===0&&state.water===0&&Object.values(state.systems).every(v=>v===100)){toast('No damage to repair.');return;}state.repair=120;log(state,'Damage control assigned. Sealing leaks, reinforcing pressure bulkheads and pumping the bilge.');toast('Damage control working for 2 minutes. Uses battery.');});
bindCommand('decoy','click',()=>{if(decoy(state)){sound.tone('fire');toast('Noisemaker deployed. Turn away and go quiet.');}},()=>state.decoys>0);
$('run-limit').max=MAX_RUN;
bindCommand('run-limit','input',e=>{state.runSetting=clamp(e.target.valueAsNumber,100,MAX_RUN);});
bindCommand('fire','click',launchSelected,()=>!!state.contacts.find(c=>c.id===selected)&&state.torps>0&&state.depth<=100);
function visualAircraft(){const e=environmentAt(state);return isSurfaced(state)?state.aircraft.filter(p=>p.hull>0&&distance(state,p)<e.opticalRange):[];}
 $('contacts').onclick=e=>{const b=e.target.closest('[data-contact]');if(!b)return;selected=b.dataset.contact;$('gun-target').value=selected;const c=state.contacts.find(c=>c.id===selected);if(c&&view==='scope'&&feedActive(state,'scope')&&canIssue(state,context())){state.scopeSteerBearing=null;state.scopeAngle=relativeBearing(c.bearing,state.heading);}updateUI();};
bindCommand('deploy-drone','click',()=>{if(deployDrone(state)){setView('drone');if(!compactLayout.matches)toast('Drone helm: W/S speed, A/D heading, Space/C depth.');}else toast(droneDeployReason(state));},()=>!droneDeployReason(state));
bindCommand('drone-photo','click',takePhoto,()=>feedActive(state,'drone')&&state.photoCooldown===0);
bindCommand('approach-site','click',()=>{const p=operationApproach(state);if(!p)return;state.route={x:p.x,y:p.y,radius:p.radius};state.targetDepth=p.depth;state.targetSpeed=3;state.silent=false;toast('Approach plotted. Boat will stop beside the site. Watch clearance.');},()=>!!state.site);
bindCommand('start-rescue','click',()=>{
 if(startRescue(state)){setRate(1);toast(state.events[0].text);}
},()=>!!state.operation&&!state.operation.completed&&state.mission!=='survey'&&operationConditions(state).onStation);
bindCommand('hold-position','click',()=>{state.route=null;state.targetSpeed=0;state.targetDepth=state.site?operationApproach(state).depth:state.depth;toast('All stop. Ballast and planes holding ordered depth.');});
bindCommand('recall-drone','click',()=>recallDrone(state),()=>state.drone.mode==='remote');
bindCommand('clear-route','click',()=>{state.route=null;toast('Waypoint cleared. Holding ordered heading.');});
bindCommand('plot-home','click',()=>{state.route={...state.home};state.targetSpeed=6;state.silent=false;toast(state.mission==='sneaky-seamen'?'Gate B plotted. Cross at any depth.':'Extraction plotted. Surface inside the pickup circle to finish.');});
$('center-chart').onclick=()=>{chart.follow=true;updateUI();};
 for(const [id,factor] of [['chart-zoom-in',1.4],['chart-zoom-out',1/1.4]])$(id).onclick=()=>{const r=$('viewport').getBoundingClientRect();zoomChart(chart,factor,r.width/2,r.height/2,r.width,r.height,state);updateUI();};
 all('[data-panel]').forEach(b=>b.onclick=()=>{const next=b.dataset.panel;if(drawer===next){closeDrawer();return;}openDrawer(next);});$('drawer-backdrop').onclick=closeDrawer;
 bindCommand('mobile-stop','click',()=>setHelmOrder(state,{...context(),view:'chart'},'speed',0));bindCommand('mobile-silent','click',()=>silent(true));bindCommand('mobile-engine','click',()=>{if(state.engine==='diesel'){state.engine='electric';return;}if(state.depth>14||state.fuel<=0){toast('Diesel needs air above 14 m and fuel.');return;}state.engine='diesel';state.silent=false;});
 all('[data-key]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(!canIssue(state,context())||button.dataset.key!=='KeyJ'&&!pilotEnabled())return;button.setPointerCapture(e.pointerId);held.press('touch:'+e.pointerId,button.dataset.key);applyHelmKeys(state,context(),new Set([button.dataset.key]),.12);button.classList.add('held');updateUI();});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{held.release('touch:'+e.pointerId);button.classList.remove('held');});});
const vp=$('viewport');let drag=null;
let shaking=false;
const isDragControl=target=>target.closest('button,input,select,.photo-card,.order-sheet');
const canSteerDrone=()=>scene&&pilotEnabled()&&canIssue(state,context());
function beginViewDrag(pointer,x,y){drag={pointer,x,y,startX:x,startY:y,moved:false};}
function steerFromDrag(x,y){
 const {moved,startX,startY}=drag;
 if(!moved&&Math.hypot(x-startX,y-startY)<=6)return;
 steerDrone(state,context(),x-(moved?drag.x:startX),y-(moved?drag.y:startY));
 drag.x=x;drag.y=y;drag.moved=true;
}
vp.addEventListener('pointerdown',e=>{
 if(drag||isDragControl(e.target))return;
 if(view==='drone'){
  if(e.pointerType==='touch'||!compactLayout.matches||!canSteerDrone())return;
 }else if(!['chart','orbit'].includes(view)&&(!['scope','tower','gun'].includes(view)||!feedActive(state,view)||!canIssue(state,context())))return;
 e.preventDefault();beginViewDrag(e.pointerId,e.clientX,e.clientY);vp.setPointerCapture(e.pointerId);
});
vp.addEventListener('pointermove',e=>{
 if(!drag||drag.pointer!==e.pointerId)return;
 if(view==='drone'){steerFromDrag(e.clientX,e.clientY);return;}
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6)drag.moved=true;
 if(view==='orbit')orbitDrag(orbit,dx,dy);
 if(view==='scope'&&feedActive(state,'scope')&&canIssue(state,context())){state.scopeSteerBearing=null;state.scopeAngle=wrapHeading(state.scopeAngle+dx*.16/zoom);}
 if(view==='tower'&&feedActive(state,'tower')&&canIssue(state,context())){state.towerAngle=wrapHeading(state.towerAngle+dx*.16/zoom);state.towerPitch=clamp(state.towerPitch-dy*.003/zoom,-1.45,.75);}
 if(view==='gun'&&feedActive(state,'gun')&&canIssue(state,context())){state.gun.angle=wrapHeading(state.gun.angle+dx*.12/zoom);state.gun.elevation=clamp(state.gun.elevation-dy*.12/zoom,-15,85);}
 if(view==='chart'&&drag.moved){const r=vp.getBoundingClientRect();panChart(chart,dx,dy,r.width,r.height,state);}
 drag.x=e.clientX;drag.y=e.clientY;
});
vp.addEventListener('pointerup',e=>{
 if(drag?.pointer!==e.pointerId)return;
 if(drag&&view==='chart'&&!drag.moved&&canIssue(state,context())){const r=vp.getBoundingClientRect(),point=chartWorldAt(chart,e.clientX-r.left,e.clientY-r.top,r.width,r.height,state);if(reconPlacement){chart.reconArea={...point,size:10000};reconPlacement=false;openDrawer('recon');toast('10 km search square placed. Review conditions and request the pass.');}else{state.scopeSteerBearing=null;state.route=point;state.targetSpeed=Math.max(4,state.targetSpeed);state.silent=false;toast('Waypoint plotted. Holding requested depth.');}}
 drag=null;updateUI();
});
for(const event of ['pointercancel','lostpointercapture'])vp.addEventListener(event,e=>{if(drag?.pointer===e.pointerId)drag=null;});
// Touch events follow the initiating finger even when the browser does not
// deliver a captured pointer stream to the live view.
vp.addEventListener('touchstart',e=>{
 if(view!=='drone'||drag||isDragControl(e.target)||!canSteerDrone())return;
 const touch=e.changedTouches[0];
 e.preventDefault();beginViewDrag(`touch:${touch.identifier}`,touch.clientX,touch.clientY);
},{passive:false});
vp.addEventListener('touchmove',e=>{
 if(view!=='drone'||!drag)return;
 const touch=Array.from(e.changedTouches).find(t=>`touch:${t.identifier}`===drag.pointer);
 if(!touch)return;
 e.preventDefault();steerFromDrag(touch.clientX,touch.clientY);
},{passive:false});
for(const event of ['touchend','touchcancel'])vp.addEventListener(event,e=>{
 if(drag&&Array.from(e.changedTouches).some(t=>`touch:${t.identifier}`===drag.pointer)){drag=null;updateUI();}
});
vp.addEventListener('wheel',e=>{
 if(view==='orbit'){e.preventDefault();zoomOrbit(Math.exp(e.deltaY*.001));return;}
 if(view==='chart'){e.preventDefault();const r=vp.getBoundingClientRect();zoomChart(chart,Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top,r.width,r.height,state);updateUI();}
 else if(['scope','tower','gun'].includes(view)&&feedActive(state,view)&&canIssue(state,context())){e.preventDefault();zoom=clamp(zoom-e.deltaY*.002,1,opticalZoomLimit(view));updateUI();}
},{passive:false});
function saveShortcuts(){try{localStorage.setItem('quiet-depths-shortcuts-v1',JSON.stringify(bindings));}catch{}}
function showShortcuts(){
 $('shortcut-list').replaceChildren(...Object.entries(shortcutActions).map(([action,label])=>{
  const button=document.createElement('button');button.type='button';button.dataset.shortcut=action;
  const name=document.createElement('span'),key=document.createElement('kbd');name.textContent=label;key.textContent=keyLabel(bindings[action]);
  button.append(name,key);return button;
 }));
}
function openSettings(){held.clear();remapping=null;showShortcuts();$('settings-dialog').showModal();}
$('open-settings').onclick=openSettings;$('briefing-settings').onclick=openSettings;
$('close-settings').onclick=()=>$('settings-dialog').close();
$('reset-shortcuts').onclick=()=>{remapping=null;bindings=shortcutBindings();saveShortcuts();showShortcuts();updateUI();$('shortcut-status').textContent='Default shortcuts restored.';};
$('shortcut-list').onclick=event=>{const button=event.target.closest('[data-shortcut]');if(!button)return;remapping=button.dataset.shortcut;$('shortcut-status').textContent='Press a key for '+shortcutActions[remapping]+'.';};
$('settings-dialog').addEventListener('keydown',event=>{
 if(!remapping||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.code==='Tab')return;
 event.preventDefault();event.stopPropagation();
 const key=event.code;if(!allowedShortcut(key)){$('shortcut-status').textContent='Choose a letter, number, arrow, Space, Esc, bracket, minus or equals.';return;}
 const other=Object.keys(bindings).find(action=>action!==remapping&&bindings[action]===key);
 if(other){$('shortcut-status').textContent=keyLabel(key)+' is already assigned to '+shortcutActions[other]+'.';return;}
 const action=remapping;bindings[action]=key;remapping=null;saveShortcuts();showShortcuts();updateUI();
 $('shortcut-list').querySelector(`[data-shortcut="${action}"]`).focus();
 $('shortcut-status').textContent=shortcutActions[action]+' set to '+keyLabel(key)+'.';
});
const helmKeys=new Set(['KeyW','KeyA','KeyS','KeyD','Space','KeyC','KeyJ']);
window.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches('textarea,input:not([type="range"]),[contenteditable="true"]'))return;
 if(context().modal)return;
 const action=Object.keys(bindings).find(key=>bindings[key]===e.code);
 if(view==='orbit'){
  if(e.code==='Escape'||action==='KeyV'){e.preventDefault();if(!e.repeat)changeOrbit();}
  else if(action==='Escape'){e.preventDefault();if(!e.repeat)setPaused(!paused);}
  return;
 }
 if(action==='KeyV'){e.preventDefault();if(!e.repeat)changeOrbit();return;}
 if(action==='Escape'){e.preventDefault();if(!e.repeat)setPaused(!paused);return;}
 const stations={Digit1:'scope',Digit2:'sonar',Digit3:'chart',Digit4:'drone',Digit5:'tower',Digit6:'gun',Digit7:'photos'};
 if(stations[action]){e.preventDefault();if(!e.repeat)setView(stations[action]);return;}
 if(helmKeys.has(action)){e.preventDefault();if(canIssue(state,context())&&pilotEnabled()){held.press('keyboard:'+e.code,action);if(!e.repeat){applyHelmKeys(state,context(),new Set([action]),.12);updateUI();}}return;}
 if(!canIssue(state,context())||e.repeat)return;
 ({KeyP:scopeToggle,KeyF:takePhoto,KeyG:doPing,KeyR:silent})[action]?.();
});
window.addEventListener('keyup',e=>held.release('keyboard:'+e.code));
window.addEventListener('blur',()=>{held.clear();if(!context().modal&&state.status==='patrol')setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){held.clear();setPaused(true);}});window.addEventListener('pagehide',persist);

function updateTicker(notices){
 const ticker=$('status-ticker'),items=$('ticker-items'),next=$('ticker-next');
 ticker.hidden=!notices.length;
 reconcileKeyedChildren(items,notices,n=>n.id,()=>document.createElement('span'),(node,n)=>{
  if(node.textContent!==n.text)node.textContent=n.text;
  node.classList.toggle('critical',!!n.critical);
 });
 next.hidden=items.scrollWidth<=ticker.clientWidth;
}
$('ticker-next').onclick=()=>{
 const items=$('ticker-items');
 items.scrollLeft=items.scrollLeft+items.clientWidth<items.scrollWidth-1?items.scrollLeft+items.clientWidth:0;
};
function updateUI(){
 const s=state,env=environmentAt(s),m=MISSIONS.find(m=>m.id===s.mission),extract=s.phase==='extract',pickup=(extract||['intercept','seek-and-destroy'].includes(s.mission))&&distance(s,s.home)<400,objective=objectiveState(s);
 if(view==='scope'&&s.systems.periscope===0)view='tower';
 $('open-orbit').classList.toggle('hidden',!s.difficulty.orbitCamera||!scene);
 $('pause').textContent=(paused?'RESUME':'PAUSE')+' · '+keyLabel(bindings.Escape).toUpperCase();
 $('pause').title='Pause or resume ['+keyLabel(bindings.Escape)+']';
 $('open-orbit').title='Toggle external camera ['+keyLabel(bindings.KeyV)+']';
 $('orbit-tools').hidden=view!=='orbit';$('orbit-pause').textContent=paused?'Resume':'Pause';
 $('recon-place').classList.toggle('hidden',!s.difficulty.satellite);
 document.querySelector('[data-view=drone]').classList.toggle('hidden',!s.difficulty.drone);
 $('show-recon-chart').classList.toggle('hidden',!s.difficulty.satellite);
 $('recon-panel').classList.toggle('hidden',!s.difficulty.satellite);
 $('mission-type').textContent=m.type;$('mission-name').innerHTML=esc(m.name).replace('observation','<br>observation.').replace('home','<br>home.').replace('through','<br>through.');
 const returning=extract&&!['seek-and-destroy-sub','seek-and-destroy','intercept'].includes(s.mission);
 $('plot-home').textContent=s.mission==='sneaky-seamen'?'PLOT GATE B':'PLOT EXTRACTION';
 $('mission-desc').textContent=returning?'Your work is done. Bring everyone home.':m.short;
 $('objective-label').textContent=pickup?'SURFACE FOR PICKUP':returning?'RETURN TO EXTRACTION':objective.label;
 $('objective-text').textContent=pickup?'Request 0 m and wait until surfaced':returning?'Reach the green circle and surface':objective.text;
 $('progress').textContent=returning?'✓':objective.progress;
 $('operation-card').classList.toggle('hidden',!s.operation);$('operation-range').textContent=s.site?Math.round(distance(s,s.site))+' M':'';$('operation-advice').textContent=objective.advice;$('approach-site').textContent=s.mission==='survey'?'PLOT SURVEY APPROACH':'PLOT RESCUE APPROACH';
 $('start-rescue').hidden=!s.operation||s.mission==='survey'||s.operation.completed;
 $('start-rescue').textContent=s.operation?.active?'RESCUE UNDERWAY':'START RESCUE HERE';
 if(s.site)$('operation-range').textContent+=' · Hull '+Math.ceil(s.site.hull)+'%';
 const limit=depthLimit(s),pressure=pressureLevel(s);
 $('hull-limits').textContent='Outer hull '+Math.ceil(s.outerHull)+'% · Depth limit '+limit+' m';
 $('pressure-warning').hidden=view!=='orbit'||!pressure||s.status!=='patrol';
 $('pressure-warning').classList.toggle('critical',pressure===2);
 $('pressure-warning').textContent=(pressure===2?'CRITICAL · IMPLOSION RISK':'PRESSURE ALARM')+' · Rise above '+limit+' m';
 document.querySelector('.top-coords b').textContent=String(s.patrol.seed);$('home-distance').textContent=(distance(s,s.home)/1000).toFixed(1)+' km · '+deg(bearing(s,s.home))+'°';
 $('hull-value').innerHTML=Math.round(s.hull)+'<span>%</span>';$('hull-bar').style.width=s.hull+'%';$('hull-bar').style.background=s.hull<45?'var(--red)':'var(--green)';
 const boatStatus=s.repair>0?'DAMAGE CONTROL WORKING':s.flood>0?'FLOODING · '+s.flood.toFixed(1)+' T/MIN · '+s.water.toFixed(1)+' T ABOARD':s.hull<99.9?'PRESSURE HULL DAMAGED':s.outerHull<99.9?'OUTER HULL DAMAGED':'ALL SYSTEMS NOMINAL';
 $('system-status').textContent=boatStatus;$('system-status').style.color=s.flood>0?'var(--red)':s.outerHull<99.9?'var(--gold)':'var(--green)';
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
 $('depth-label').textContent=isSurfaced(v)?'SURFACED':drone?'ROV':v.depth<=15?'SCOPE':v.depth>220?'STRAIN':'SUBMERGED';
 $('noise-label').textContent=drone?(v.speed<0?'ASTERN':'ROV'):s.noise<28?'QUIET':s.noise<55?'AUDIBLE':'LOUD';$('noise-label').style.color=!drone&&s.noise>55?'var(--red)':'var(--green)';
 for(const axis of ['heading','depth','speed']){
  const el=$(axis);el.min=axis==='speed'?(drone?-3:-4):0;el.max=axis==='heading'?359.9:axis==='depth'?280:(drone?10:17);el.step=axis==='heading'?.1:axis==='speed'?.1:1;
  el.value=requested[axis];el.dataset.actual=actual[axis];el.dataset.requested=requested[axis];el.setAttribute('aria-valuetext',`Actual ${actual[axis].toFixed(1)}; requested ${requested[axis].toFixed(1)}`);
  const track=el.closest('.dual-range');track.style.setProperty('--actual',clamp((actual[axis]-Number(el.min))/(Number(el.max)-Number(el.min))*100,0,100)+'%');
 }
 $('electric').classList.toggle('active',s.engine==='electric');$('diesel').classList.toggle('active',s.engine==='diesel');$('silent').classList.toggle('active',s.silent);
 $('engine-hint').textContent=drone?'Boat holds its own helm orders.':s.silent?'Silent running limits actual speed to 3 kn.':s.engine==='diesel'?(s.depth<=14?'Charging. High acoustic signature.':'No intake. Rise to 14 m or switch.'):s.battery<=0?'Battery exhausted. Surface for diesel.':'Quiet motors. Electric limit: 14 kn.';
 const active=feedActive(s,view),tower=view==='tower',gun=view==='gun',absLook=drone?s.drone.heading:gun?wrapHeading(s.heading+s.gun.angle):tower?wrapHeading(s.heading+s.towerAngle):scopeBearing(s),optical=view==='scope'||drone||tower||gun;
 const labels={photos:['PHOTOGRAPHIC EVIDENCE',photoArchive(s).length+' ARCHIVED EXPOSURES'],gun:['DECK GUN',active?`DU EXPLOSIVE · ${s.gun.ammo} ROUNDS · ${s.gun.elevation.toFixed(1)}° ELEVATION`:'SURFACE TO MAN THE GUN'],tower:['CONNING TOWER',active?'OPEN BRIDGE · DRAG VERTICALLY TO LOOK DOWN':'SURFACE TO GO TOPSIDE'],scope:['OPTICAL OBSERVATION',active?`PERISCOPE · ${scopeWashed(s,env)?'LENS AWASH':deg(s.scopeAngle)+'° RELATIVE'} · ${(6*zoom).toFixed(0)}×`:'OPTICS OFFLINE'],sonar:['ACOUSTIC OBSERVATION',`BOW UP · DASHES: BEARING · DIAMONDS: RANGE`],chart:['NAVIGATION CHART',`NORTH UP · ${chart.zoom.toFixed(1)}× · ${chart.follow?'FOLLOWING BOAT':'FREE PAN'}`],drone:['REMOTE INSPECTION',`ROV ${s.drone.mode.toUpperCase()} · BATTERY ${Math.round(s.drone.battery)}%`]};
 const scopeTab=document.querySelector('[data-view=scope]'),droneTab=document.querySelector('[data-view=drone]');scopeTab.classList.toggle('hidden',s.systems.periscope===0);droneTab.classList.toggle('damaged',s.drone.mode==='lost');droneTab.innerHTML='<span>04</span> '+(s.drone.mode==='lost'?'DRONE LOST':'DRONE');
 all('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
 const [viewLabel,viewSubtitle]=labels[view]||['EXTERNAL ORBIT','DRAG TO ORBIT'];
 $('view-label').textContent=viewLabel;$('view-subtitle').textContent=viewSubtitle;$('view-tag').textContent=optical?active?(paused?'FROZEN':'LIVE FEED'):'OFFLINE':view==='chart'?'SECTOR 07':'HEADING UP';
 $('look-heading').textContent=deg(absLook)+'° TRUE';all('.compass span').forEach((el,i)=>el.textContent=deg(absLook+(i-2)*(drone?15:7.5/zoom)));
 const world=$('world');if(!active&&world.dataset.online!=='false')scene?.clear();world.dataset.online=String(active);world.style.display=active?'block':'none';world.setAttribute('aria-hidden',String(!active));world.style.opacity='1';
 $('tactical').style.display=view==='sonar'||view==='chart'?'block':'none';$('scope-overlay').style.display=(view==='scope'||gun)&&active?'block':'none';$('scope-overlay').style.opacity='1';
 for(const id of ['compass','look-heading']){$(id).classList.toggle('hidden',!optical||!active);$(id).style.opacity='1';}
 $('view-message').classList.toggle('hidden',!optical||active);
 $('view-message').innerHTML=gun?'DECK GUN OFFLINE<br><small>Surface fully to aim and fire the deck gun.</small>':tower?'CONNING TOWER OFFLINE<br><small>Surface to view from the top of the conning tower.</small>':view==='scope'?`PERISCOPE OFFLINE<br><small>${s.depth>15?'Rise to 15 meters or less to look.':'The mast is lowered. Press P to raise it.'}</small>`:s.drone.mode==='lost'?'DRONE LOST<br><small>'+esc(s.drone.lostReason)+'</small>':'DRONE STOWED<br><small>'+esc(droneDeployReason(s)||'Deploy at ≤3 knots, down to 280 meters. Keep within 100 m.')+'</small>';
 $('scope-tools').classList.toggle('hidden',view!=='scope');$('zoom-tools').classList.toggle('hidden',!['scope','tower','gun'].includes(view));$('zoom-readout').textContent=(view==='scope'?6*zoom:zoom).toFixed(zoom<2?1:0)+'×';$('scope-alignment').classList.toggle('hidden',view!=='scope');$('bow-readout').classList.toggle('hidden',view!=='scope'||!active);const rel=((s.scopeAngle+540)%360)-180;$('bow-readout').textContent=`BOW ${deg(s.heading)}° · VIEW ${deg(scopeBearing(s))}° · ${Math.abs(rel).toFixed(0)}° ${rel<0?'PORT':'STARBOARD'}${s.scopeSteerBearing!==null?' · BOAT TURNING TO VIEW':''}`;$('gun-tools').classList.toggle('hidden',!gun);$('gun-trigger').disabled=!canIssue(s,context())||!active||s.gun.ammo<=0||s.systems.deckgun<=10;$('gun-sight-status').textContent=`${s.gun.ammo} ROUNDS · ELEV ${s.gun.elevation.toFixed(1)}°`;$('drone-photo').textContent=s.mission==='survey'?'SURVEY PHOTO':'PHOTO';
 $('drone-instruments').classList.toggle('hidden',!drone||!active);$('drone-instruments').innerHTML=`<b>ROV ${s.drone.mode.toUpperCase()}</b><span>CHARGE ${Math.round(s.drone.battery)}% · HULL ${Math.round(s.drone.hull)}%</span><span>LINK ${Math.round(separation(s,s.drone))} / 100 M</span><span>MOBILITY ${Math.round(s.drone.mobility)}% · BUOYANCY ${Math.round(s.drone.buoyancy)}%</span>`;
 updateTicker(patrolNotices(s,optical&&active,sound.on,view));
 $('hydrophones').hidden=view!=='sonar'||s.systems.sonar<=25;
 $('chart-tools').classList.toggle('hidden',view!=='chart');$('drone-tools').classList.toggle('hidden',view!=='drone');
 $('scope-toggle').innerHTML=(s.scope?'LOWER SCOPE':'RAISE SCOPE')+' <kbd>'+esc(keyLabel(bindings.KeyP))+'</kbd>';$('scope-toggle').dataset.short=s.scope?'Lower':'Raise';
 $('view-hint').textContent=gun?'DRAG TO AIM · HOLD FIRE / J · WATERLINE HITS CAUSE FLOODING':tower?'DRAG TO LOOK AROUND / DOWN · WHEEL FOR BINOCULARS':view==='scope'?(active?'DRAG TO ROTATE SCOPE · WHEEL TO ZOOM':'NO OPTICAL SIGNAL'):view==='sonar'?'BOW AT TOP · CONTACT BEARINGS RELATIVE TO HULL':view==='chart'?'DRAG TO PAN · WHEEL TO ZOOM · CLICK TO PLOT':active?'CAMERA FIXED AHEAD · W/S SPEED · A/D HEADING':'NO DRONE SIGNAL';
 $('view-range').textContent=drone?(active?`HDG ${deg(v.heading)}° · ${v.speed.toFixed(1)} KN · ${v.depth.toFixed(0)} M`:''):view==='chart'?`ZOOM ${chart.zoom.toFixed(1)}×`:'VISIBILITY '+(env.opticalRange/1000).toFixed(1)+' KM';
 $('station-status').textContent=isSurfaced(s)?'SURFACED · EXPOSED':s.depth<=15?'PERISCOPE DEPTH':s.silent?'SILENT RUNNING':'SUBMERGED';
 const clock=new Date(Math.floor(env.hour*3600)*1000).toISOString().slice(11,16);
 $('sim-time').textContent='SKY '+clock;
 $('watch-time').textContent=clock;
 $('watch-elapsed').textContent=String(Math.floor(s.time/60)).padStart(2,'0')+':'+String(Math.floor(s.time%60)).padStart(2,'0');
 $('watch-limit').textContent=limit+' m';
 $('weather').textContent=env.phase+' · '+env.weather+' · SEA '+env.seaState;
 $('viewport').dataset.weather=env.weatherId;$('viewport').dataset.dayPhase=env.phase;$('viewport').dataset.lightningActive=String(env.flash>.1);$('viewport').dataset.simSeconds=s.time.toFixed(2);
 $('viewport').dataset.lastLightning=s.lightning.at(-1)?.id||'';$('viewport').dataset.heardThunder=s.acoustics.filter(a=>a.type==='thunder'&&a.heard).length;
 $('viewport').dataset.visibleBolt=String(!!scene?.boltVisible);
 const droneSounding=view==='drone'&&feedActive(s,'drone'),seabed=getSoundings(s,droneSounding);
 $('below-label').textContent=droneSounding?'BELOW DRONE':'BELOW KEEL';$('below-keel').textContent=seabed.belowKeel.toFixed(0)+' m';$('water-depth').textContent=seabed.waterDepth>0?seabed.waterDepth.toFixed(0)+' m':'LAND';
 const warning=seabed.belowKeel<0?'BOTTOM CONTACT':seabed.belowKeel<10?'DANGER · RISE':seabed.belowKeel<30?'SHALLOW CLEARANCE':'CLEAR BELOW';if($('seabed-advice').textContent!==warning)$('seabed-advice').textContent=warning;
 $('soundings').classList.toggle('caution',seabed.belowKeel<30);$('soundings').classList.toggle('danger',seabed.belowKeel<10);
 $('wind-value').textContent=Math.round(env.wind)+' km/h WIND';$('ping').innerHTML=s.pingCooldown>0?`RECHARGING ${Math.ceil(s.pingCooldown)}s`:'ACTIVE PING <kbd>'+esc(keyLabel(bindings.KeyG))+'</kbd>';
 $('contacts-count').textContent=String(s.contacts.length).padStart(2,'0');
 const contactModels=s.contacts.map(c=>{const {range,bearing}=sonarReading(s,c);return{id:c.id,selected:selected===c.id,icon:c.identified?(c.kind==='escort'?'⌁':c.kind==='fishing'?'△':'◇'):c.kind==='sub'?'◆':'◌',title:c.label+(c.identified?' · '+c.name:''),detail:(c.identified?(c.military?'MILITARY':'NEUTRAL'):c.kind==='sub'?'SUBMARINE':'UNCLASSIFIED')+' · '+(range===null?'RANGE ?':(range/1000).toFixed(1)+' KM'),bearing:deg(relativeBearing(bearing,s.heading))+'° R'};});
 reconcileKeyedChildren($('contacts'),contactModels,c=>c.id,()=>contactRow(document),updateContactRow);

 $('torp-count').textContent=String(s.torps).padStart(2,'0');$('tubes').innerHTML=Array.from({length:6},(_,i)=>`<i class="${i>=s.torps?'spent':''}"></i>`).join('');
 $('run-limit').value=s.runSetting;$('run-readout').textContent=(s.runSetting/1000).toFixed(2)+' km';
 const target=s.contacts.find(c=>c.id===selected);$('weapon-hint').textContent=target?(target.identified&&!target.military?'Identified neutral. Hold fire.':`Firing bearing ${deg(firingBearing(s,target))}° true. Seeker may choose another target.`):'Select a contact to set firing bearing.';$('decoy-count').textContent=s.decoys+' LEFT';$('gun-ammo').textContent=s.gun.ammo;const choice=$('gun-target').value;const options=[{id:'',label:'MANUAL AIM'},...s.contacts.filter(c=>c.identified&&c.age<10&&c.range&&c.kind!=='sub').map(c=>({id:c.id,label:`${c.name} · ${(c.range/1000).toFixed(1)} KM`})),...visualAircraft().map(p=>({id:p.id,label:`${p.name} · ${Math.round(p.altitude)} M ALT`}))];reconcileKeyedChildren($('gun-target'),options,o=>o.id,()=>document.createElement('option'),(node,o)=>{node.value=o.id;node.textContent=o.label;});$('gun-target').value=choice||selected||'';$('torpedo-status').textContent=s.projectiles.filter(p=>p.owner==='player').map((p,i)=>`TORP ${i+1} · ${p.age<4?'ARMING':p.lock?'SONAR TRACK':'SEARCHING'} · ${deg(p.heading)}°`).join(' / ');$('mobile-engine').textContent=s.engine.toUpperCase();$('mobile-silent').classList.toggle('active',s.silent);$('mobile-stop').textContent='BOAT STOP';
 for(const id of ['battery','oxygen','fuel']){$(id+'-value').textContent=Math.round(s[id])+'%';$(id+'-bar').style.width=s[id]+'%';$(id+'-value').style.color=s[id]<20?'var(--red)':'';}
 $('alert-label').textContent=s.alert>60?'UNDER PURSUIT':s.alert>30?'POSSIBLE DETECTION':'UNDETECTED';$('alert-label').style.color=s.alert>30?'var(--red)':'var(--green)';$('alert-dot').style.background=s.alert>30?'var(--red)':'var(--green)';
 $('noise-value').textContent='SELF NOISE '+Math.round(s.noise)+' dB';$('clearance').textContent='KEEL CLEARANCE '+Math.round(getSoundings(s).belowKeel)+' m';$('damage-flash').style.opacity=s.shock?String(s.shock*.2):'0';$('cracks').classList.toggle('hidden',!(drone?active&&s.drone.camera<65:view==='scope'&&active&&s.hull<=30));
 updateExtras(s,env,v);
 $('viewport').dataset.paused=String(paused);$('viewport').dataset.station=view;
 for(const {el,enabled} of commandControls)el.disabled=!canIssue(s,context())||!enabled();
 all('[data-key]').forEach(b=>{b.disabled=!canIssue(s,context())||(b.dataset.key==='KeyJ'?view!=='gun'||!active||s.gun.ammo<=0||s.systems.deckgun<=10:!pilotEnabled());if(b.disabled||!keys.has(b.dataset.key))b.classList.remove('held');});
}

function canvasContext(id){const c=$(id),r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);if(c.width!==Math.round(r.width*d)||c.height!==Math.round(r.height*d)){c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);}const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);return{ctx,w:r.width,h:r.height};}
function drawSonar(id,mini,time){
 const {ctx:c,w,h}=canvasContext(id);if(!w||!h)return;const layout=sonarLayout(w,h,mini),{cx,cy,radius:R}=layout,shortLabels=w<600||h<420;
 const scale=mini?SONAR_RANGES.at(-1):sonarRange;
 if(state.systems.sonar<=25){c.fillStyle='#102321';c.fillRect(0,0,w,h);c.fillStyle='#db8075';c.font='14px IBM Plex Mono,monospace';c.textAlign='center';c.fillText('ARRAY DAMAGED',w/2,h/2);return;}
 c.fillStyle=mini?'#102321':'#0e1f21';c.fillRect(0,0,w,h);const glow=c.createRadialGradient(cx,cy,0,cx,cy,R);glow.addColorStop(0,'#1c3930');glow.addColorStop(1,'#102320');c.fillStyle=glow;c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.fill();
 c.lineWidth=.7;c.strokeStyle='#547c6050';for(let i=1;i<=4;i++){c.beginPath();c.arc(cx,cy,R*i/4,0,Math.PI*2);c.stroke();}for(let a=0;a<360;a+=30){c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.sin(rad(a))*R,cy-Math.cos(rad(a))*R);c.stroke();}
 c.fillStyle='#9cb794';c.font=(mini?'12':'14')+'px IBM Plex Mono, monospace';c.textAlign='center';for(let a=0;a<360;a+=30)c.fillText(deg(a),cx+Math.sin(rad(a))*(R+19),cy-Math.cos(rad(a))*(R+19)+4);
 const north=rad(relativeBearing(0,state.heading));c.fillStyle='#d7b77d';c.font='12px IBM Plex Mono,monospace';c.fillText('N',cx+Math.sin(north)*(R-12),cy-Math.cos(north)*(R-12)+4);
 const sweep=(time*.18)%(Math.PI*2);c.save();c.translate(cx,cy);c.rotate(sweep);const sg=c.createConicGradient(-.5,0,0);sg.addColorStop(0,'#b0bc6d00');sg.addColorStop(.06,'#a0bc6d25');sg.addColorStop(.08,'#b8ce8020');sg.addColorStop(.081,'#b0bc6d00');sg.addColorStop(1,'#b0bc6d00');c.fillStyle=sg;c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.fill();c.restore();
 if(state.pingAge<8){c.strokeStyle=`rgba(192,209,136,${.6*(1-state.pingAge/8)})`;c.beginPath();c.arc(cx,cy,R*state.pingAge/8,0,Math.PI*2);c.stroke();}
 const labels=[];
 for(const q of state.contacts){
  const {bearing,range}=sonarReading(state,q);
  const fraction=sonarRangeFraction(range,scale);
  if(fraction===null)continue;
  const a=rad(relativeBearing(bearing,state.heading)),r=fraction*R,x=cx+Math.sin(a)*r,y=cy-Math.cos(a)*r;
  c.strokeStyle=q.id===selected?'#efd19a':'#a3bd78';c.globalAlpha=Math.max(.25,1-q.age/220);c.lineWidth=q.id===selected?1.5:1;
  if(range===null){c.beginPath();c.arc(cx,cy,r,a-Math.PI/2-.05,a-Math.PI/2+.05);c.stroke();c.setLineDash([2,5]);c.beginPath();c.moveTo(cx+Math.sin(a)*R*.2,cy-Math.cos(a)*R*.2);c.lineTo(x,y);c.stroke();c.setLineDash([]);}else{c.beginPath();c.moveTo(x,y-5);c.lineTo(x+5,y);c.lineTo(x,y+5);c.lineTo(x-5,y);c.closePath();c.stroke();}
  if(!mini)labels.push({q,x,y,range});c.globalAlpha=1;
 }
 const occupied=[];
 for(const {q,x,y,range} of labels.sort((a,b)=>a.y-b.y)){
  if(shortLabels){let lx=clamp(x+9,15,w-35),ly=clamp(y-8,65,h-20);if(occupied.some(p=>Math.abs(p.x-lx)<25&&Math.abs(p.y-ly)<14))ly+=14;occupied.push({x:lx,y:ly});c.fillStyle=q.id===selected?'#efd19a':'#c2cfa5';c.textAlign='left';c.font='11px IBM Plex Mono,monospace';c.fillText(q.label,lx,ly);continue;}
  let ly=clamp(y-8,65,h-30),lx=clamp(x+15,20,w-190);while(occupied.some(p=>Math.abs(p.x-lx)<180&&Math.abs(p.y-ly)<38))ly+=38;occupied.push({x:lx,y:ly});
  c.strokeStyle='#86a17c66';c.beginPath();c.moveTo(x+5,y);c.lineTo(lx-4,ly);c.stroke();c.textAlign='left';c.font='14px IBM Plex Mono,monospace';c.fillStyle='#d4d6af';c.fillText(q.identified?q.name:q.label,lx,ly);c.font='12px IBM Plex Mono,monospace';c.fillStyle='#a2b69a';c.fillText(range===null?'RANGE UNKNOWN':Math.round(q.confidence*100)+'% CONFIDENCE',lx,ly+17);
 }
 c.fillStyle='#e2d19e';c.beginPath();c.moveTo(cx,cy-8);c.lineTo(cx-4,cy+5);c.lineTo(cx+4,cy+5);c.closePath();c.fill();
}
function drawHydrophones(time){
 if($('hydrophones').hidden)return;
 const {ctx:c,w,h}=canvasContext('hydrophone-trace');
 if(w<2||h<2)return;
 c.clearRect(0,0,w,h);
 const angles=state.contacts.map(q=>relativeBearing(q.bearing,state.heading));
 c.beginPath();
 for(let x=0;x<=w;x+=2){
  const noise=Math.sin(x*1.53+time*3)*Math.sin(x*.31+time*1.4);
  const y=h*(.78+.1*noise-.68*hydrophoneStrength(angles,x/w*360));
  if(x===0)c.moveTo(x,y);else c.lineTo(x,y);
 }
 c.strokeStyle='#a5b678';c.lineWidth=1;c.stroke();
}
function drawChart(){
 const {ctx:c,w,h}=canvasContext('tactical'),p=chartTransform(chart,w,h,state),{scale:k,cx,cy}=p,sx=x=>cx+x*k,sy=y=>cy-y*k;
 c.fillStyle='#142a2d';c.fillRect(0,0,w,h);
 const cell=clamp(200/chart.zoom,2,800),tl=chartWorldAt(chart,0,0,w,h,state),br=chartWorldAt(chart,w,h,w,h,state),startX=Math.floor(tl.x/cell)*cell,startY=Math.floor(br.y/cell)*cell,nx=Math.ceil((br.x-startX)/cell)+1,ny=Math.ceil((tl.y-startY)/cell)+1,depths=new Float32Array((nx+1)*(ny+1));
 for(let ix=0;ix<=nx;ix++)for(let iy=0;iy<=ny;iy++)depths[ix*(ny+1)+iy]=bottom(startX+ix*cell,startY+iy*cell);
 const at=(x,y)=>depths[x*(ny+1)+y];
 for(let ix=0;ix<nx;ix++)for(let iy=0;iy<ny;iy++){const d=at(ix,iy);if(d<0)c.fillStyle='#536750';else if(d<60)c.fillStyle='#385957';else if(d<120)c.fillStyle='#264849';else if(d<180)c.fillStyle='#1b373b';else continue;c.fillRect(sx(startX+ix*cell),sy(startY+(iy+1)*cell),cell*k+1,cell*k+1);}
 c.lineWidth=.7;
 for(const level of [0,40,80,120,160,200,240]){c.strokeStyle=level===0?'#8e9b6c':'#6c8e7c50';c.beginPath();for(let ix=0;ix<nx;ix++)for(let iy=0;iy<ny;iy++){
  const x=startX+ix*cell,y=startY+iy*cell,corners=[{x,y,d:at(ix,iy)},{x:x+cell,y,d:at(ix+1,iy)},{x:x+cell,y:y+cell,d:at(ix+1,iy+1)},{x,y:y+cell,d:at(ix,iy+1)}],hits=[];
  for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];if((a.d<level)!==(b.d<level)){const t=(level-a.d)/(b.d-a.d);hits.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}
  if(hits.length>=2){c.moveTo(sx(hits[0].x),sy(hits[0].y));c.lineTo(sx(hits[1].x),sy(hits[1].y));}
 }c.stroke();}
 c.strokeStyle='#759a8133';c.lineWidth=.6;const grid=chart.zoom<.6?5000:chart.zoom<6?1000:chart.zoom<24?250:chart.zoom<80?100:25;
 for(let x=Math.floor(tl.x/grid)*grid;x<br.x;x+=grid){c.beginPath();c.moveTo(sx(x),0);c.lineTo(sx(x),h);c.stroke();}for(let y=Math.floor(br.y/grid)*grid;y<tl.y;y+=grid){c.beginPath();c.moveTo(0,sy(y));c.lineTo(w,sy(y));c.stroke();}
 c.textAlign='center';c.font='14px IBM Plex Mono,monospace';c.fillStyle='#b9c5a4';c.fillText('GREYBANK ISLAND',sx(-3800),sy(4000));c.fillStyle='#9ab29f';c.font='12px IBM Plex Mono,monospace';c.fillText('REEF · 65–110 M',sx(1900),sy(700));
 c.strokeStyle='#90bb9f';c.setLineDash([3,4]);c.beginPath();c.arc(sx(state.home.x),sy(state.home.y),(state.departure?200:400)*k,0,Math.PI*2);c.stroke();c.setLineDash([]);c.fillStyle='#bdd5af';c.font='14px IBM Plex Mono,monospace';c.fillText(state.departure?'GATE B · ANY DEPTH':'EXTRACTION · SURFACE',sx(state.home.x),sy(state.home.y)+(state.departure?200:400)*k+23);
 if(state.departure){const x=sx(state.departure.x),y=sy(state.departure.y);c.beginPath();c.arc(x,y,5,0,2*Math.PI);c.stroke();c.fillText('GATE A',x,y-9);}
 for(const v of state.ships){
  if(!v.wreckMark)continue;
  const mark=v.wreckMark,x=sx(mark.x),y=sy(mark.y);
  c.strokeStyle='#e6d7b7';c.lineWidth=2;c.beginPath();c.moveTo(x,y-7);c.lineTo(x,y+8);c.moveTo(x-5,y-2);c.lineTo(x+5,y-2);c.stroke();
  c.textAlign='left';c.fillStyle='#e6d7b7';c.font='11px IBM Plex Mono,monospace';c.fillText(mark.observed?'WRECK':'PROBABLE WRECK',x+8,y+3);
 }
 c.lineWidth=1;
 if(state.site){const site=state.site;c.strokeStyle='#e5c389';c.beginPath();c.arc(sx(site.x),sy(site.y),Math.max(7,75*k),0,Math.PI*2);c.stroke();c.fillStyle='#efcf98';c.font='14px IBM Plex Mono,monospace';c.textAlign='left';c.fillText(site.name,sx(site.x)+12,sy(site.y)-12);c.font='12px IBM Plex Mono,monospace';c.fillText('MISSION SITE · '+Math.round(site.depth)+' M',sx(site.x)+12,sy(site.y)+8);}
 if(['remote','return'].includes(state.drone.mode)){c.strokeStyle='#81dfcc';c.setLineDash([3,3]);c.beginPath();c.moveTo(sx(state.x),sy(state.y));c.lineTo(sx(state.drone.x),sy(state.drone.y));c.stroke();c.setLineDash([]);c.fillStyle='#81dfcc';c.fillRect(sx(state.drone.x)-3,sy(state.drone.y)-3,6,6);}
 for(const q of chartContacts(state)){
  const e=estimateAt(q,state.time),sub=q.kind==='sub',area=q.sweepArea;
  if(area&&!q.range&&state.time-area.time<90){
   const half=area.size/2;c.fillStyle='#91adba21';c.fillRect(sx(area.x-half),sy(area.y+half),area.size*k,area.size*k);
   c.fillStyle='#a9bfbd';c.textAlign='center';c.font='11px IBM Plex Mono,monospace';c.fillText('REPEATED PINGS · APPROX.',sx(area.x),sy(area.y));
  }
  c.strokeStyle=q.id===selected?'#dfc99b':sub?'#94ccdc':'#acb997';
  c.globalAlpha=q.exact?1:clamp(1-q.age/900,.25,.9);
  c.setLineDash(q.exact?[]:[4,5]);
  c.beginPath();
  if(q.range&&e){
   if(!q.exact){c.ellipse(sx(e.x),sy(e.y),Math.min(30000,e.major)*k,Math.min(30000,e.minor)*k,rad(e.angle)-Math.PI/2,0,Math.PI*2);c.stroke();}
   c.setLineDash([]);c.fillStyle=sub?'#b0ddec':'#ded8af';
   if(sub){const x=sx(e.x),y=sy(e.y);c.beginPath();c.moveTo(x,y-5);c.lineTo(x+5,y);c.lineTo(x,y+5);c.lineTo(x-5,y);c.closePath();c.stroke();}
   else c.fillRect(sx(e.x)-2,sy(e.y)-2,4,4);
   if(q.fix){c.beginPath();c.moveTo(sx(e.x),sy(e.y));c.lineTo(sx(e.x+q.fix.vx*60),sy(e.y+q.fix.vy*60));c.stroke();}
   c.textAlign='left';c.font='12px IBM Plex Mono,monospace';
   c.fillText(q.label+(q.identified?' · '+q.name:sub?' · SUBMARINE':''),sx(e.x)+9,sy(e.y)-9);
   c.font='11px IBM Plex Mono,monospace';
   const age=q.exact?'LIVE':e.hasFix?Math.round(e.age)+' s OLD':'ESTIMATE';
   const motion=q.fix&&(q.exact||q.courseEstimated)?deg(e.angle)+'° · '+(Math.hypot(q.fix.vx,q.fix.vy)/.514444).toFixed(1)+' KN':'COURSE / SPEED ?';
   const depth=Number.isFinite(q.depthEstimate)?(q.exact?'':'~')+Math.round(q.depthEstimate)+' M':'DEPTH ?';
   c.fillText(sub?(depth+' · '+motion+' · '+age):age,sx(e.x)+9,sy(e.y)+8);
  }else{
   c.moveTo(sx(state.x),sy(state.y));c.lineTo(sx(state.x+Math.sin(rad(q.bearing))*6500),sy(state.y+Math.cos(rad(q.bearing))*6500));c.stroke();
  }
  c.setLineDash([]);c.globalAlpha=1;
 }
 drawReconArea(c,sx,sy,k);

 if(state.route){c.setLineDash([4,5]);c.strokeStyle='#d7bd82';c.beginPath();c.moveTo(sx(state.x),sy(state.y));c.lineTo(sx(state.route.x),sy(state.route.y));c.stroke();c.setLineDash([]);c.beginPath();c.arc(sx(state.route.x),sy(state.route.y),6,0,Math.PI*2);c.stroke();}
 c.save();c.translate(sx(state.x),sy(state.y));c.rotate(rad(state.heading));c.fillStyle='#e5d3a4';c.beginPath();c.moveTo(0,-11);c.lineTo(6,8);c.lineTo(0,5);c.lineTo(-6,8);c.closePath();c.fill();c.restore();c.fillStyle='#ced9c1';c.textAlign='left';c.font='12px IBM Plex Mono,monospace';c.fillText('YOU · '+Math.round(state.depth)+' M',sx(state.x)+15,sy(state.y)+22);
 c.strokeStyle='#b3c6a6';c.beginPath();c.moveTo(w-55,95);c.lineTo(w-55,132);c.stroke();c.fillStyle='#b3c6a6';c.textAlign='center';c.font='14px IBM Plex Mono,monospace';c.fillText('N',w-55,87);c.fillText('▲',w-55,106);
 c.font='12px IBM Plex Mono,monospace';c.textAlign='right';c.fillText((grid<1000?grid+' M':(grid/1000)+' KM')+' GRID',w-25,h-116);
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
function patrolVictory(s){
 if(s.mission==='sneaky-seamen')return 'Gate B reached. You crossed the patrol area and brought your crew through alive.';
 if(s.mission==='intercept')return 'The briefed freighter sank and your crew reached pickup.';
 if(s.mission==='seek-and-destroy')return 'All three military transports sank. The boat and crew made it home.';
 if(s.mission==='seek-and-destroy-sub')return 'You reached extraction alive. The boat and crew made it home.';
 if(!s.operation)return 'The intelligence is aboard. The crew is safe. Somewhere out there, the convoy sails on.';
 if(s.mission==='survey')return s.operation.find;
 return `${s.operation.rescued} survivors brought home. ${s.operation.dead} lost before recovery. The rescue crew is safely aboard.`;
}
function showResult(){
 if(resultShown)return;
 resultShown=true;
 if(state.status==='lost'){lossStartedAt=performance.now();document.body.classList.add('loss');$('loss-layer').classList.remove('hidden');sound.loss(state);}
 persist();
 const win=state.status==='won';
 $('result-title').textContent=win?'Home, quietly.':state.status==='compromised'?'A costly mistake.':state.status==='expired'?'The window has closed.':'The sea falls silent.';
 $('result-body').textContent=win?patrolVictory(state):state.imploded?'Your pressure hull collapsed at '+Math.round(state.depth)+' m.':state.status==='compromised'?'A neutral vessel was lost. Your patrol has been recalled. Identify a silhouette before trusting a seeker.':state.status==='expired'?'Command has recalled the patrol after 30 simulated minutes. Time compression is useful, but keep an eye on the clock.':'Your boat could take no more. A quieter speed, a little more water under the keel, or one fewer look might change the next patrol.';
 const kills=patrolKills(state),medals=$('patrol-medals');
 medals.hidden=kills.submarines===0;
 medals.textContent=kills.submarines>=2?'✦ Two-submarine patrol commendation':'✦ Submarine patrol commendation';
 const finding=disciplinaryFinding(state),stamp=$('discipline-stamp');stamp.hidden=!finding;
 if(finding){stamp.textContent=finding.title;stamp.style.setProperty('--stamp-angle',finding.angle+'deg');}
 const entries=[...state.debrief];if(finding)entries.push({time:state.time,text:finding.title+'. '+finding.reason});
 const debrief=$('patrol-debrief');debrief.hidden=!entries.length;
 $('debrief-entries').replaceChildren(...entries.map(event=>{
  const entry=document.createElement('li');entry.textContent=`${Math.floor(event.time/60)}m ${Math.floor(event.time%60)}s · ${event.text}`;return entry;
 }));
 $('result-stats').innerHTML=`<span>PATROL<br>${Math.floor(state.time/60)}m ${Math.floor(state.time%60)}s</span><span>HULL<br>${Math.round(state.hull)}%</span><span>PHOTOS<br>${state.photos.length}</span><span>SUNK<br>${kills.ships} ships · ${kills.submarines} subs</span>`;
 $('result-dialog').showModal();
}
function frame(now){
 const realDt=Math.min((now-last)/1000,.5);last=now;const ctx=context();
 if(canIssue(state,ctx)){
  const previousPressure=state.pressureAlarm,before=state.events[0],priorAlert=state.alert,wasOutsidePickup=distance(state,state.home)>=400,priorRescued=state.operation?.rescued||0,wasHolding=state.operation?.holding;
  applyHelmKeys(state,ctx,keys,realDt);if(view==='gun'&&keys.has('KeyJ')&&feedActive(state,'gun')){if(fireDeckGun(state,{bearing:wrapHeading(state.heading+state.gun.angle),elevation:state.gun.elevation}))setRate(1);}const hadRoute=!!state.route;const observation=['scope','gun','tower','drone'].includes(view)&&feedActive(state,view)?view:null;
  step(state,realDt*rate,{observation,look:view==='drone'?state.drone.heading:view==='gun'?state.heading+state.gun.angle:view==='tower'?state.heading+state.towerAngle:scopeBearing(state)});renderClock=state.time;presentationSeconds+=realDt;
  if(state.pressureAlarm>previousPressure)setRate(1);
  if((state.operation?.rescued||0)>priorRescued)sound.tone('photo');
  if(state.mission!=='survey'&&state.operation?.holding&&!wasHolding){setRate(1);toast('Rescue holding conditions met. Crew transfer underway.');}
  if(hadRoute&&!state.route){setRate(1);toast('Waypoint reached. All stop. Time compression disengaged.');}
  if(wasOutsidePickup&&!['intercept','seek-and-destroy'].includes(state.mission)&&state.phase==='extract'&&distance(state,state.home)<400){setRate(1);toast('Pickup area reached. Surface to complete the patrol.');}
  if(state.alert>40&&priorAlert<=40){setRate(1);toast('Possible detection. Time compression disengaged.');sound.tone('contact');}
  if(before!==state.events[0]){const e=state.events[0];if(e.kind==='contact'||e.kind==='damage'||e.text.startsWith('Drone link')||(state.alert>40&&rate>1))setRate(1);if(e.text.startsWith('Drone link')){toast(e.text);sound.tone('contact');}if(e.kind==='damage'&&!e.text.includes('Depth charge shock'))sound.tone(e.text.includes('in the water')?'contact':'damage');if(e.kind==='contact')sound.tone('contact');if(e.kind==='success'&&lastToast!==e.text){toast(e.text);lastToast=e.text;}}
  sound.update(state,ctx);if(state.status!=='patrol')showResult();
 }
 if(String(feedActive(state,view))!==$('world').dataset.online)updateUI();
 if(state.shock||shaking){
  shaking=state.shock>0;
  vp.style.setProperty('--shock-x',Math.sin(renderClock*27)*state.shock*2.3+'px');
  vp.style.setProperty('--shock-y',Math.cos(renderClock*19)*state.shock*1.7+'px');
 }
 const r=vp.getBoundingClientRect();
 if(scene&&feedActive(state,view)){scene.resize(r.width,r.height);scene.render(state,view,zoom,renderClock,orbit,presentationSeconds);}
 if(view==='scope'&&feedActive(state,'scope'))drawScope();if(view==='gun'&&feedActive(state,'gun'))drawGun();if(view==='sonar'){drawSonar('tactical',false,renderClock);drawHydrophones(renderClock);}if(view==='chart')drawChart();drawSonar('mini-sonar',true,renderClock);captureEvidence();
 if(now-lastUI>100){updateUI();sound.update();lastUI=now;}if(now-lastSave>8000&&!ctx.modal&&!paused){persist();lastSave=now;}requestAnimationFrame(frame);
}
function openDrawer(next){drawer=next;document.body.dataset.drawer=next;$('drawer-backdrop').classList.remove('hidden');all('[data-panel]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.panel===next)));}
function renderSound(){
 const on=sound.on;$('sound').innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5Z"/>${on?'<path d="M15 8a6 6 0 0 1 0 8m3-12a11 11 0 0 1 0 16"/>':'<path d="m16 9 6 6m0-6-6 6"/>'}</svg><span>${on?'ON':'OFF'}</span>`;$('sound').setAttribute('aria-label',on?'Disable sound':'Enable sound');$('sound').setAttribute('aria-pressed',String(on));
}
function launchSelected(){
 const target=state.contacts.find(c=>c.id===selected);if(!target)return;
 if(state.depth>100){toast('Rise to 100 m or less to fire.');return;}if(target.identified&&!target.military){toast('Identified neutral. Firing is withheld.');return;}
 if(fire(state,selected)){sound.tone('fire');setRate(1);toast('Torpedo running. Its own sonar will arm and acquire a return.');closeDrawer();}
}
function changeZoom(factor){if(!canIssue(state,context())||!feedActive(state,view))return;zoom=clamp(zoom*factor,1,opticalZoomLimit(view));zooms[view]=zoom;updateUI();}
function responsiveTools(){
 const host=compactLayout.matches?$('station-actions'):$('viewport');
 for(const id of ['scope-tools','scope-alignment','chart-tools','drone-tools','gun-tools','zoom-tools'])if($(id).parentElement!==host)host.appendChild($(id));
}
function openOrder(axis){
 if(!['heading','depth','speed'].includes(axis))return;closeDrawer();orderAxis=axis;const v=helmFor(state,view),range=$(axis);
 $('order-title').textContent=(view==='drone'?'ROV ':'BOAT ')+axis.toUpperCase()+' ORDER';for(const id of ['order-number','order-slider']){const input=$(id);input.min=range.min;input.max=range.max;input.step=range.step;input.value=v['target'+axis[0].toUpperCase()+axis.slice(1)];}
 $('order-sheet').classList.remove('hidden');updateUI();
}
function beginReconArea(){
 if(!state.difficulty.satellite)return;
 if(!canIssue(state,context()))return;closeDrawer();setView('chart');if(!['idle','complete','failed'].includes(state.recon.phase)){reconPlacement=false;openDrawer('recon');updateUI();return;}reconPlacement=true;chart.zoom=Math.min(chart.zoom,1);toast('Tap the chart to center a 10 km reconnaissance square. Drag still pans.');updateUI();
}
function initializeExtras(){
 renderSound();responsiveTools();window.addEventListener('resize',()=>{held.clear();drag=null;responsiveTools();updateUI();});
 all('[data-close-drawer]').forEach(b=>b.onclick=closeDrawer);all('[data-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.order));$('close-order').onclick=()=>{orderAxis=null;$('order-sheet').classList.add('hidden');};
 bindCommand('order-number','input',e=>{if(orderAxis)order(orderAxis,e.target.valueAsNumber);},pilotEnabled);
 bindOrderRange('order-slider',()=>orderAxis);
 bindOrderRange('mobile-speed',()=>'speed');
 all('[data-sonar-range]').forEach(button=>button.onclick=()=>{
  sonarRange=Number(button.dataset.sonarRange);
  updateUI();
 });
 bindCommand('mobile-ping','click',doPing,()=>state.pingCooldown===0&&state.systems.sonar>25);
 bindCommand('mobile-decoy','click',()=>{if(decoy(state)){sound.tone('fire');toast('Noisemaker away. Turn and go quiet.');}},()=>state.decoys>0);
 bindCommand('mobile-repair','click',()=>{state.repair=120;toast('Damage control assigned.');});
 bindCommand('monitor-recall','click',()=>recallDrone(state),()=>state.drone.mode==='remote');$('monitor-boat').onclick=()=>setView('chart');
 bindCommand('zoom-in','click',()=>changeZoom(1.3),()=>feedActive(state,view)&&zoom<opticalZoomLimit(view));bindCommand('zoom-out','click',()=>changeZoom(1/1.3),()=>feedActive(state,view)&&zoom>1);$('zoom-readout').onclick=()=>changeZoom(1);
 bindCommand('recon-place','click',beginReconArea);$('show-recon-chart').onclick=()=>{closeDrawer();setView('chart');if(!chart.reconArea&&!state.recon.area)beginReconArea();};
 bindCommand('request-recon','click',()=>{if(requestRecon(state,chart.reconArea)){setRate(1);toast('Recon task queued. Radio uplink needs 15 m or less; reception holds below 30 m.');persist();}},()=>!!chart.reconArea&&reconStatus(state).canRequest);
 $('close-photo').onclick=()=>$('photo-dialog').close();$('photo-gallery').onclick=e=>{const button=e.target.closest('[data-photo]');if(!button)return;const photo=photoArchive(state).find(p=>String(p.id)===button.dataset.photo);if(!photo)return;$('photo-full').src=photo.image;$('photo-title').textContent=photo.caption;$('photo-meta').textContent=photoMetadata(photo);$('photo-dialog').showModal();updateUI();sound.update();};
 for(let i=0;i<36;i++){const bubble=document.createElement('i');bubble.style.setProperty('--x',((i*61.803)%100)+'%');bubble.style.setProperty('--size',(7+i%8*4)+'px');bubble.style.setProperty('--duration',(5+i%7*.7)+'s');bubble.style.setProperty('--delay',(-i%13*.47)+'s');$('loss-bubbles').appendChild(bubble);}
}
function photoMetadata(p){const time=Math.floor(p.takenAt/60)+'m '+Math.floor(p.takenAt%60)+'s';return(p.source==='scope'?'PERISCOPE':p.source==='drone'?'ROV CAMERA':'ORBITAL RECON')+' · CAPTURE '+time+(Number.isFinite(p.receivedAt)?' · RECEIVED '+Math.floor(p.receivedAt/60)+'m '+Math.floor(p.receivedAt%60)+'s':'')+(p.source==='satellite'?' · '+Math.round(p.coverage*100)+'% COVERAGE'+(p.night?' · LIGHTS ONLY':''):' · '+deg(p.bearing||0)+'° · '+Math.round(p.depth||0)+' m');}
function updateGallery(){
 const archive=photoArchive(state),key=archive.map(p=>p.id).join(',');if(key===photoKey)return;photoKey=key;
 reconcileKeyedChildren($('photo-gallery'),[...archive].reverse(),p=>p.id,()=>{const button=document.createElement('button');button.className='photo-card';button.appendChild(document.createElement('img'));button.appendChild(document.createElement('strong'));button.appendChild(document.createElement('small'));return button;},(button,p)=>{button.dataset.photo=p.id;button.children[0].src=p.image;button.children[0].alt=p.caption;button.children[0].loading='lazy';button.children[1].textContent=p.caption;button.children[2].textContent=photoMetadata(p);});
}
function updateExtras(s,env,v){
 document.body.dataset.station=view;$('pause').dataset.short=paused?'Resume':'Pause';
 const compact=compactLayout.matches,ds=droneStatus(s),rov=view==='drone',below=getSoundings(s,rov&&feedActive(s,'drone')).belowKeel;
 const rovTouch=rov&&compact&&!!scene;
 document.body.classList.toggle('rov-touch-helm',rovTouch);
 $('rov-steering-hint').hidden=!(rovTouch&&s.drone.mode==='remote');
 $('sonar-tools').classList.toggle('hidden',view!=='sonar');$('mobile-ping').textContent=s.pingCooldown>0?'PING · '+Math.ceil(s.pingCooldown)+' s':'ACTIVE PING';
 for(const button of all('[data-sonar-range]'))button.setAttribute('aria-pressed',String(Number(button.dataset.sonarRange)===sonarRange));
 $('mobile-boat-resources').textContent=`FUEL ${Math.round(s.fuel)}% · BATTERY ${Math.round(s.battery)}% · OXYGEN ${Math.round(s.oxygen)}%`;
 const warn=(value,limit)=>value<limit?'danger':'';
 $('mobile-vitals').innerHTML=rov?`<span>ROV <b class="${warn(s.drone.battery,15)}">${Math.round(s.drone.battery)}%</b></span><span>Hull <b>${Math.round(s.drone.hull)}</b></span><span>Link <b>${Math.round(ds.distance)}/100m</b></span><span class="${warn(below,10)}">Bottom ${Math.round(below)}m</span>`:`<span>H <b class="${warn(s.hull,45)}">${Math.round(s.hull)}</b></span><span>Bat <b class="${warn(s.battery,20)}">${Math.round(s.battery)}</b></span><span>O₂ <b class="${warn(s.oxygen,20)}">${Math.round(s.oxygen)}</b></span><span class="${warn(below,10)}">Keel ${Math.round(below)}m</span><b class="${s.alert>40?'danger':''}">${s.alert>60?'HUNTED':s.alert>30?'CAUTION':'QUIET'}</b>`;
 $('drone-monitor').classList.toggle('hidden',!ds.deployed||compact&&rov&&s.drone.mode==='remote'&&!ds.warning);$('drone-monitor').classList.toggle('danger',ds.outrunning);$('drone-monitor').classList.toggle('caution',!!ds.warning&&!ds.outrunning);
 $('drone-monitor-text').textContent=ds.warning||`ROV ${s.drone.mode==='return'?'RETURNING':'DEPLOYED'} · ${Math.round(ds.distance)} / 100 m · ${Math.round(s.drone.battery)}% CHARGE`;
 const fields={heading:[$('mobile-heading-actual'),$('mobile-heading-requested')],depth:[$('mobile-depth-actual'),$('mobile-depth-requested')],speed:[$('mobile-speed-actual'),$('mobile-speed-requested')]};for(const [axis,elements] of Object.entries(fields)){const cap=axis[0].toUpperCase()+axis.slice(1),unit=axis==='heading'?'°':axis==='depth'?' m':' kn',format=n=>axis==='heading'?deg(n):axis==='depth'?Math.round(n):n.toFixed(1);elements[0].textContent=format(v[axis])+unit;elements[1].textContent='REQ '+format(v['target'+cap])+unit;}
 const ms=$('mobile-speed');ms.min=rov?-3:-4;ms.max=rov?10:17;ms.value=v.targetSpeed;ms.dataset.actual=v.speed;ms.dataset.requested=v.targetSpeed;ms.setAttribute('aria-valuetext',`Actual ${v.speed.toFixed(1)}; requested ${v.targetSpeed.toFixed(1)} knots`);$('mobile-speed-track').querySelector('.mobile-speed-rail').style.setProperty('--actual',clamp((v.speed-Number(ms.min))/(Number(ms.max)-Number(ms.min))*100,0,100)+'%');
 ms.setAttribute('aria-label',rov?'Requested ROV speed':'Requested submarine speed');
 ms.setAttribute('aria-orientation',rovTouch?'horizontal':'vertical');
 if(orderAxis){const cap=orderAxis[0].toUpperCase()+orderAxis.slice(1),requested=v['target'+cap];for(const id of ['order-number','order-slider'])if(document.activeElement!==$(id))$(id).value=requested;$('order-actual').textContent='ACTUAL '+v[orderAxis].toFixed(1)+' · REQUESTED '+requested.toFixed(1);}
 const rs=reconStatus(s);$('recon-title').textContent=rs.title.toUpperCase();$('recon-detail').textContent=rs.detail+(reconPlacement?' Tap the chart to place the square.':!chart.reconArea?' Select a search square first.':'')+(rs.cooldownRemaining>0&&['complete','idle'].includes(rs.phase)?' Next task in '+Math.ceil(rs.cooldownRemaining)+' s.':'');$('recon-link').textContent=rs.linkLabel+(rs.phase==='idle'?'':' · '+Math.round(rs.progress*100)+'%');$('recon-progress').style.width=rs.progress*100+'%';$('recon-progress').parentElement.setAttribute('aria-valuenow',String(Math.round(rs.progress*100)));$('recon-panel').classList.toggle('loading',!['idle','complete','failed'].includes(rs.phase));$('recon-panel').dataset.phase=rs.phase;
 $('photo-gallery').classList.toggle('hidden',view!=='photos'||!photoArchive(s).length);$('photo-empty').classList.toggle('hidden',view!=='photos'||!!photoArchive(s).length);updateGallery();
 if(view==='tower')$('view-subtitle').textContent=feedActive(s,'tower')?'BINOCULARS · '+zoom.toFixed(1)+'× · DRAG TO LOOK AROUND':'SURFACE TO GO TOPSIDE';
 if(view==='photos'){$('view-message').classList.add('hidden');$('scope-overlay').style.display='none';}
 if(s.status==='lost'){const e=lossPresentation(s,(performance.now()-lossStartedAt)/1000,view);$('loss-layer').classList.toggle('hidden',!e.active);}
}
function drawReconArea(c,sx,sy,k){
 const area=reconAreaForDisplay(state.recon,chart.reconArea);if(!area){if(reconPlacement){c.fillStyle='#e4cd9c';c.font='13px IBM Plex Mono,monospace';c.textAlign='left';c.fillText('TAP TO PLACE 10 KM RECON SQUARE',12,78);}return;}
 const rs=reconStatus(state),active=!['idle','complete','failed'].includes(rs.phase);c.save();c.setLineDash(active?[9,5]:[5,7]);c.strokeStyle=rs.phase==='complete'?'#9ccea2':'#e2be7e';c.lineWidth=1.5;c.strokeRect(sx(area.x-area.size/2),sy(area.y+area.size/2),area.size*k,area.size*k);c.setLineDash([]);c.fillStyle='#d4cb9d';c.font='12px IBM Plex Mono,monospace';c.textAlign='left';c.fillText('RECON · '+(reconPlacement?'TAP TO MOVE':rs.phase.toUpperCase())+(active?' '+Math.round(rs.progress*100)+'%':''),12,78);if(active){c.beginPath();c.arc(20,96,5,state.time*3,state.time*3+Math.PI*1.4);c.stroke();}c.restore();
}
let reconCaptureAttempt=0;
function expose(p){
 try{if(!scene)throw new Error('Camera unavailable');const r=vp.getBoundingClientRect();scene.resize(r.width,r.height);scene.render(state,p.source,zoom,state.time,undefined,presentationSeconds);const photo=recordExposure(state,p,()=>captureOptics(scene));if(photo){persist();photoKey='';toast('Photograph archived in Photos.');}else toast('Camera image unavailable. Exposure was not archived.');}catch(error){console.warn('Camera capture unavailable',error);toast('Camera capture failed. Try another exposure.');}
}
function captureEvidence(){
 const r=state.recon;if(!scene||r.phase!=='complete'||!r.packet||state.reconArchivedSequence>=r.sequence||performance.now()<reconCaptureAttempt)return;
 const existing=photoArchive(state).some(p=>p.reconId===r.packet.id&&p.seed===state.patrol.seed&&p.takenAt===r.packet.capturedAt);if(existing){state.reconArchivedSequence=r.sequence;return;}
 reconCaptureAttempt=performance.now()+5000;
 try{const image=captureSatellite(scene,state,r.packet);if(image){recordPhoto(state,{source:'satellite',image,takenAt:r.packet.capturedAt,receivedAt:r.packet.receivedAt,caption:'CLASSIFIED · '+(r.packet.night?'Night lights':'Surface reconnaissance'),night:r.packet.night,coverage:r.packet.coverage,area:r.packet.area,reconId:r.packet.id,seed:state.patrol.seed,mission:state.mission});state.reconArchivedSequence=r.sequence;persist();photoKey='';toast('Reconnaissance image archived in Photos.');}}catch(error){console.warn('Reconnaissance camera unavailable',error);toast('Image rendering unavailable. The timestamped contact report is still on the chart.');}
}

initializeExtras();
setView(scene?'scope':'sonar');updateUI();openBriefing();requestAnimationFrame(frame);
