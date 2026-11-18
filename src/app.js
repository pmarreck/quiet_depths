import {createGame,step,bottom,bearing,delta,distance,rad,clamp,ping,photograph,fire,decoy,deployDrone,recallDrone,log,MISSIONS,save,restore} from './sim.js';
import {OceanScene} from './scene.js';
import {wrapHeading,relativeBearing,scopeBearing,canIssue,feedActive,helmFor,setHelmOrder,applyHelmKeys,chartTransform,chartWorldAt,panChart,zoomChart} from './controls.js';
const $=id=>document.getElementById(id),all=q=>[...document.querySelectorAll(q)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deg=n=>String(Math.round(wrapHeading(n))%360).padStart(3,'0');
let state=createGame(),view='scope',zoom=1,rate=1,paused=false,selected=null,missionChoice='recon',last=performance.now(),lastUI=0,lastSave=0,lastToast='',resultShown=false,toastTimer,renderClock=0;
let chart={x:0,y:0,zoom:1,follow:true},saved=null;
try{saved=restore(localStorage.getItem('quiet-depths-v1'));}catch{}
let scene=null;
try{scene=new OceanScene($('world'));}catch(e){console.warn('WebGL unavailable',e);toast('WebGL unavailable. Sonar and chart are available.');view='sonar';}
const keys=new Set(),commandControls=[];
const context=()=>({view,paused,modal:!!document.querySelector('dialog[open]')});
const pilotEnabled=()=>view!=='drone'||state.drone.mode==='remote';
class Sound{
 constructor(){this.on=false;this.ctx=null;}
 toggle(){
  if(!this.ctx){const A=window.AudioContext||window.webkitAudioContext;if(!A)return;this.ctx=new A();this.master=this.ctx.createGain();this.master.gain.value=0;this.master.connect(this.ctx.destination);
   const n=this.ctx.createBuffer(1,this.ctx.sampleRate*3,this.ctx.sampleRate),a=n.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*.18;const sea=this.ctx.createBufferSource();sea.buffer=n;sea.loop=true;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=280;sea.connect(filter).connect(this.master);sea.start();
   this.engine=this.ctx.createOscillator();this.engine.type='sine';this.engine.frequency.value=42;this.engineGain=this.ctx.createGain();this.engineGain.gain.value=.05;this.engine.connect(this.engineGain).connect(this.master);this.engine.start();
  }
  this.on=!this.on;this.ctx.resume();$('sound').innerHTML=`♩ <span>SOUND ${this.on?'ON':'OFF'}</span>`;$('sound').setAttribute('aria-label',this.on?'Disable sound':'Enable sound');this.update();if(this.on)this.tone('contact');
 }
 tone(type){if(!this.on||!this.ctx||!canIssue(state,context()))return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.connect(g).connect(this.master);o.type=type==='damage'?'sawtooth':'sine';o.frequency.setValueAtTime(type==='ping'?1240:type==='photo'?620:type==='damage'?55:type==='fire'?95:440,t);o.frequency.exponentialRampToValueAtTime(type==='damage'?22:type==='ping'?970:200,t+1);g.gain.setValueAtTime(type==='damage'?.32:.2,t);g.gain.exponentialRampToValueAtTime(.001,t+(type==='ping'?2:1));o.start();o.stop(t+2.1);}
 update(){if(!this.ctx)return;this.master.gain.setTargetAtTime((this.on&&canIssue(state,context()))?0.48:0,this.ctx.currentTime,.15);this.engine.frequency.setTargetAtTime(32+Math.abs(state.speed)*2,this.ctx.currentTime,.5);this.engineGain.gain.setTargetAtTime(state.engine==='diesel'?.12:.035,this.ctx.currentTime,.5);}
}
const sound=new Sound();
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
function persist(){try{if(state.status==='patrol')localStorage.setItem('quiet-depths-v1',save(state));else localStorage.removeItem('quiet-depths-v1');$('save-status').textContent='PATROL SAVED';setTimeout(()=>$('save-status').textContent='LOCAL AUTOSAVE',1400);}catch{$('save-status').textContent='SAVING UNAVAILABLE';}}
function bindCommand(element,event,action,enabled=()=>true){
 const el=typeof element==='string'?$(element):element;commandControls.push({el,enabled});el.dataset.command='true';
 el.addEventListener(event,e=>{if(!canIssue(state,context())||!enabled())return;action(e);updateUI();});
}
function order(axis,value){return setHelmOrder(state,context(),axis,value);}
function setRate(r){rate=r;all('[data-time]').forEach(b=>b.classList.toggle('active',+b.dataset.time===r));}
function setPaused(p){paused=p;keys.clear();drag=null;document.body.classList.toggle('paused',p);$('pause').textContent=p?'RESUME · ESC':'PAUSE · ESC';$('pause').setAttribute('aria-label',p?'Resume patrol':'Pause patrol');updateUI();sound.update();persist();}
function setView(v){view=v;keys.clear();drag=null;all('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);b.setAttribute('aria-pressed',b.dataset.view===v);});updateUI();}
function chooseMission(id){missionChoice=id;all('.mission-option').forEach(b=>b.classList.toggle('active',b.dataset.mission===id));document.querySelector('.briefing-tip p').innerHTML=esc(MISSIONS.find(m=>m.id===id).desc)+' <strong>Esc pauses everything.</strong>';}
function openBriefing(){keys.clear();persist();$('briefing').showModal();$('resume').classList.toggle('hidden',!saved&&state.time===0);sound.update();}
function start(resuming=false){
 if(resuming)state=saved||state;else{state=createGame(missionChoice,19830604+Math.floor(Math.random()*100000));selected=null;}
 chart={x:state.x,y:state.y,zoom:1,follow:true};saved=null;resultShown=false;lastToast='';clearTimeout(toastTimer);$('toast').classList.remove('show');setRate(1);$('briefing').close();setView(scene?'scope':'sonar');setPaused(false);persist();
}
$('mission-picker').innerHTML=MISSIONS.map(m=>`<button class="mission-option ${m.id==='recon'?'active':''}" data-mission="${m.id}"><span></span><div><b>${m.name}</b><small>${m.type}</small></div><span>${m.minutes}</span></button>`).join('');
$('mission-picker').addEventListener('click',e=>{const b=e.target.closest('[data-mission]');if(b)chooseMission(b.dataset.mission);});
$('start').onclick=()=>start(false);$('resume').onclick=()=>start(true);$('close-briefing').onclick=()=>{$('briefing').close();updateUI();};$('another-patrol').onclick=()=>{$('result-dialog').close();$('briefing').showModal();$('resume').classList.add('hidden');};
$('sound').onclick=()=>sound.toggle();$('pause').onclick=()=>setPaused(!paused);$('guide').onclick=()=>{keys.clear();$('help-dialog').showModal();updateUI();};$('close-help').onclick=()=>{$('help-dialog').close();updateUI();};$('new-patrol').onclick=()=>{$('help-dialog').close();openBriefing();};document.querySelector('.brand').onclick=e=>{e.preventDefault();openBriefing();};
all('dialog').forEach(d=>d.addEventListener('close',()=>{keys.clear();updateUI();}));
all('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));all('[data-time]').forEach(b=>bindCommand(b,'click',()=>setRate(+b.dataset.time)));
function scopeToggle(){if(!canIssue(state,context()))return;if(state.depth>15){toast('Rise to 15 meters or less to raise the scope.');return;}state.scope=!state.scope;if(!state.scope)scene?.clear();updateUI();}
function takePhoto(){if(!canIssue(state,context())||view!=='scope'||!feedActive(state,'scope'))return;if(photograph(state,scopeBearing(state))){sound.tone('photo');toast(`Photograph recorded. ${state.photos.length}/2 silhouettes.`);}else toast(state.photoCooldown>0?'Camera reloading.':'Center a merchant silhouette in the reticle.');updateUI();}
function doPing(){if(!canIssue(state,context()))return;if(ping(state)){sound.tone('ping');setRate(1);}else toast('Sonar capacitors recharging.');updateUI();}
function silent(){if(!canIssue(state,context())||view==='drone')return;state.silent=!state.silent;if(state.silent){state.targetSpeed=clamp(state.targetSpeed,-3,3);log(state,'Rig for silent running. Maximum three knots.');}updateUI();}
bindCommand('scope-toggle','click',scopeToggle);bindCommand('photo','click',takePhoto,()=>feedActive(state,'scope')&&state.photoCooldown===0);bindCommand('ping','click',doPing,()=>state.pingCooldown===0);bindCommand('silent','click',silent,()=>view!=='drone');
for(const axis of ['heading','depth','speed'])bindCommand(axis,'input',e=>order(axis,+e.target.value),pilotEnabled);
bindCommand('port','click',()=>order('heading',helmFor(state,view).targetHeading-15),pilotEnabled);bindCommand('starboard','click',()=>order('heading',helmFor(state,view).targetHeading+15),pilotEnabled);
all('[data-depth]').forEach(b=>bindCommand(b,'click',()=>order('depth',+b.dataset.depth),pilotEnabled));
bindCommand('electric','click',()=>{state.engine='electric';log(state,'Electric motors engaged.');},()=>view!=='drone');
bindCommand('diesel','click',()=>{if(state.depth>14){toast('Diesel needs air. Rise to 14 meters or less first.');return;}if(state.fuel<=0){toast('Diesel fuel exhausted.');return;}state.engine='diesel';state.silent=false;log(state,'Diesels engaged. Recharging, but loud.','warning');},()=>view!=='drone');
bindCommand('repair','click',()=>{if(state.hull>=100&&state.flood===0){toast('No damage to repair.');return;}state.repair=120;log(state,'Damage control assigned. Patching hull and pumping compartments.');toast('Damage control working for 2 minutes. Uses battery.');});
bindCommand('decoy','click',()=>{if(decoy(state)){sound.tone('fire');toast('Noisemaker deployed. Turn away and go quiet.');}},()=>state.decoys>0);
bindCommand('fire','click',()=>{const c=state.contacts.find(c=>c.id===selected);if(state.depth>100){toast('Rise above 100 meters to fire.');return;}if(c.identified&&!c.military){toast('Identified neutral. Firing is withheld.');return;}if(fire(state,selected)){sound.tone('fire');setRate(1);toast('Torpedo running. It will seek the loudest return ahead.');}},()=>!!state.contacts.find(c=>c.id===selected)&&state.torps>0);
$('contacts').onclick=e=>{const b=e.target.closest('[data-contact]');if(!b)return;selected=b.dataset.contact;const c=state.contacts.find(c=>c.id===selected);if(c&&view==='scope'&&feedActive(state,'scope')&&canIssue(state,context()))state.scopeAngle=relativeBearing(c.bearing,state.heading);updateUI();};
bindCommand('deploy-drone','click',()=>{if(deployDrone(state)){setView('drone');toast('Drone helm: W/S speed, A/D heading, Space/C depth.');}else toast('Rise to 80 meters or less to deploy.');},()=>state.drone.mode==='stowed'&&state.drone.battery>5);
bindCommand('recall-drone','click',()=>recallDrone(state),()=>state.drone.mode==='remote');
bindCommand('clear-route','click',()=>{state.route=null;toast('Waypoint cleared. Holding ordered heading.');});
bindCommand('plot-home','click',()=>{state.route={...state.home};state.targetSpeed=6;state.silent=false;toast('Extraction plotted. Surface inside the pickup circle to finish.');});
$('center-chart').onclick=()=>{chart.follow=true;updateUI();};
const vp=$('viewport');let drag=null;
vp.addEventListener('pointerdown',e=>{
 if(e.target.closest('button'))return;
 if(view!=='chart'&&(view!=='scope'||!feedActive(state,'scope')||!canIssue(state,context())))return;
 e.preventDefault();drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};vp.setPointerCapture(e.pointerId);
});
vp.addEventListener('pointermove',e=>{
 if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6)drag.moved=true;
 if(view==='scope'&&feedActive(state,'scope')&&canIssue(state,context()))state.scopeAngle=wrapHeading(state.scopeAngle+dx*.16/zoom);
 if(view==='chart'&&drag.moved){const r=vp.getBoundingClientRect();panChart(chart,dx,dy,r.width,r.height,state);}
 drag.x=e.clientX;drag.y=e.clientY;
});
vp.addEventListener('pointerup',e=>{
 if(drag&&view==='chart'&&!drag.moved&&canIssue(state,context())){const r=vp.getBoundingClientRect();state.route=chartWorldAt(chart,e.clientX-r.left,e.clientY-r.top,r.width,r.height,state);state.targetSpeed=Math.max(4,state.targetSpeed);state.silent=false;toast('Waypoint plotted. Holding requested depth.');}
 drag=null;updateUI();
});
vp.addEventListener('pointercancel',()=>drag=null);
vp.addEventListener('wheel',e=>{
 if(view==='chart'){e.preventDefault();const r=vp.getBoundingClientRect();zoomChart(chart,Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top,r.width,r.height,state);updateUI();}
 else if(view==='scope'&&feedActive(state,'scope')&&canIssue(state,context())){e.preventDefault();zoom=clamp(zoom-e.deltaY*.002,1,2.5);updateUI();}
},{passive:false});
const helmKeys=new Set(['KeyW','KeyA','KeyS','KeyD','Space','KeyC']);
window.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches('textarea,input:not([type="range"]),[contenteditable="true"]'))return;
 if(context().modal)return;
 if(e.code==='Escape'){e.preventDefault();if(!e.repeat)setPaused(!paused);return;}
 const stations={Digit1:'scope',Digit2:'sonar',Digit3:'chart',Digit4:'drone'};
 if(stations[e.code]){e.preventDefault();if(!e.repeat)setView(stations[e.code]);return;}
 if(helmKeys.has(e.code)){e.preventDefault();if(canIssue(state,context())&&pilotEnabled()){keys.add(e.code);if(!e.repeat){applyHelmKeys(state,context(),new Set([e.code]),.12);updateUI();}}return;}
 if(!canIssue(state,context())||e.repeat)return;
 ({KeyP:scopeToggle,KeyF:takePhoto,KeyG:doPing,KeyR:silent})[e.code]?.();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();if(!context().modal&&state.status==='patrol')setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();setPaused(true);}});window.addEventListener('pagehide',persist);

function updateUI(){
 const s=state,m=MISSIONS.find(m=>m.id===s.mission),extract=s.phase==='extract',pickup=extract&&distance(s,s.home)<400;
 $('mission-type').textContent=m.type;$('mission-name').innerHTML=esc(m.name).replace('observation','<br>observation.').replace('home','<br>home.').replace('through','<br>through.');
 $('mission-desc').textContent=extract?'Your work is done. Bring everyone home.':s.mission==='recon'?'Listen first. Look carefully. Leave no trace.':s.mission==='intercept'?'Identify. Intercept. Disappear.':'No shots. Just bring back the story.';
 $('objective-label').textContent=pickup?'SURFACE FOR PICKUP':extract?'RETURN TO EXTRACTION':s.mission==='recon'?'PHOTOGRAPH THE CONVOY':s.mission==='intercept'?'INTERCEPT COBALT':'LISTEN WITHOUT BEING SEEN';
 $('objective-text').textContent=pickup?'Request 0 m and wait until surfaced':extract?'Reach the green circle and surface':m.short;
 $('progress').textContent=extract?'✓':s.mission==='recon'?s.photos.length+'/2':s.mission==='shadow'?Math.min(180,Math.floor(s.trackTime))+'/180':'0/1';
 $('home-distance').textContent=(distance(s,s.home)/1000).toFixed(1)+' km · '+deg(bearing(s,s.home))+'°';
 $('hull-value').innerHTML=Math.round(s.hull)+'<span>%</span>';$('hull-bar').style.width=s.hull+'%';$('hull-bar').style.background=s.hull<45?'var(--red)':'var(--green)';
 $('system-status').innerHTML=`<i></i> ${s.repair>0?'DAMAGE CONTROL WORKING':s.flood>0?'FLOODING · '+s.flood.toFixed(1)+' T/MIN':'ALL SYSTEMS NOMINAL'}`;$('system-status').style.color=s.flood>0?'var(--red)':'var(--green)';
 $('log').innerHTML=s.events.slice(0,12).map(e=>`<div class="log-entry ${esc(e.kind)}"><time>${String(Math.floor(e.t/60)).padStart(2,'0')}:${String(Math.floor(e.t%60)).padStart(2,'0')}</time><span>${esc(e.text)}</span></div>`).join('');$('log-count').textContent=String(s.events.length).padStart(2,'0');
 $('engine-status').textContent=s.engine==='diesel'?(s.depth<=14?'DIESEL · CHARGING':'DIESEL · NO AIR INTAKE'):'RUNNING ON BATTERIES';
 const drone=view==='drone',v=helmFor(s,view),actual={heading:v.heading,depth:v.depth,speed:v.speed},requested={heading:v.targetHeading,depth:v.targetDepth,speed:v.targetSpeed};
 $('helm-mode').textContent=drone?(v.mode==='remote'?'DRONE HELM':v.mode==='return'?'DRONE · AUTO RETURN':'DRONE · OFFLINE'):'SUBMARINE HELM';
 $('heading-value').textContent=deg(v.heading);$('depth-value').textContent=Math.round(v.depth);$('speed-value').textContent=v.speed.toFixed(1);
 $('heading-order').textContent=`ACT ${deg(v.heading)}° · REQ ${deg(v.targetHeading)}°`;
 $('depth-order').textContent=`ACT ${v.depth.toFixed(0)} m · REQ ${v.targetDepth.toFixed(0)} m`;
 $('speed-order').textContent=`ACT ${v.speed.toFixed(1)} · REQ ${v.targetSpeed.toFixed(1)} kn`;
 $('depth-label').textContent=v.depth<=1?'SURFACED':drone?'ROV':v.depth<=15?'SCOPE':v.depth>220?'STRAIN':'SUBMERGED';
 $('noise-label').textContent=drone?(v.speed<0?'ASTERN':'ROV'):s.noise<28?'QUIET':s.noise<55?'AUDIBLE':'LOUD';$('noise-label').style.color=!drone&&s.noise>55?'var(--red)':'var(--green)';
 for(const axis of ['heading','depth','speed']){
  const el=$(axis);el.min=axis==='speed'?(drone?-3:-4):0;el.max=axis==='heading'?359.9:axis==='depth'?(drone?150:280):(drone?(v.mode==='return'?14:10):17);el.step=axis==='heading'?.1:axis==='speed'?.1:1;
  el.value=requested[axis];el.dataset.actual=actual[axis];el.dataset.requested=requested[axis];el.setAttribute('aria-valuetext',`Actual ${actual[axis].toFixed(1)}; requested ${requested[axis].toFixed(1)}`);
  const track=el.closest('.dual-range');track.style.setProperty('--actual',clamp((actual[axis]-Number(el.min))/(Number(el.max)-Number(el.min))*100,0,100)+'%');
 }
 $('electric').classList.toggle('active',s.engine==='electric');$('diesel').classList.toggle('active',s.engine==='diesel');$('silent').classList.toggle('active',s.silent);
 $('engine-hint').textContent=drone?'Boat holds its own helm orders.':s.silent?'Silent running limits actual speed to 3 kn.':s.engine==='diesel'?(s.depth<=14?'Charging. High acoustic signature.':'No intake. Rise to 14 m or switch.'):s.battery<=0?'Battery exhausted. Surface for diesel.':'Quiet motors. Electric limit: 14 kn.';
 const active=feedActive(s,view),absLook=drone?s.drone.heading:scopeBearing(s),optical=view==='scope'||drone;
 const labels={scope:['OPTICAL OBSERVATION',active?`PERISCOPE · ${deg(s.scopeAngle)}° RELATIVE · ${(6*zoom).toFixed(0)}×`:'OPTICS OFFLINE'],sonar:['ACOUSTIC OBSERVATION',`HEADING UP · ${deg(s.heading)}° TRUE · ESTIMATED CONTACTS`],chart:['NAVIGATION CHART',`NORTH UP · ${chart.zoom.toFixed(1)}× · ${chart.follow?'FOLLOWING BOAT':'FREE PAN'}`],drone:['REMOTE INSPECTION',`ROV ${s.drone.mode.toUpperCase()} · BATTERY ${Math.round(s.drone.battery)}%`]};
 $('view-label').textContent=labels[view][0];$('view-subtitle').textContent=labels[view][1];$('view-tag').textContent=optical?active?(paused?'FROZEN':'LIVE FEED'):'OFFLINE':view==='chart'?'SECTOR 07':'HEADING UP';
 $('look-heading').textContent=deg(absLook)+'° TRUE';all('.compass span').forEach((el,i)=>el.textContent=deg(absLook+(i-2)*(drone?15:7.5/zoom)));
 const world=$('world');if(!active&&world.dataset.online!=='false')scene?.clear();world.dataset.online=String(active);world.style.display=active?'block':'none';world.setAttribute('aria-hidden',String(!active));world.style.opacity='1';
 $('tactical').style.display=view==='sonar'||view==='chart'?'block':'none';$('scope-overlay').style.display=view==='scope'&&active?'block':'none';$('scope-overlay').style.opacity='1';
 for(const id of ['compass','look-heading']){$(id).classList.toggle('hidden',!optical||!active);$(id).style.opacity='1';}
 $('view-message').classList.toggle('hidden',!optical||active);
 $('view-message').innerHTML=view==='scope'?`PERISCOPE OFFLINE<br><small>${s.depth>15?'Rise to 15 meters or less to look.':'The mast is lowered. Press P to raise it.'}</small>`:s.drone.mode==='lost'?'DRONE SIGNAL LOST':'DRONE STOWED<br><small>Deploy above 80 meters to establish a feed.</small>';
 $('scope-tools').classList.toggle('hidden',view!=='scope');$('chart-tools').classList.toggle('hidden',view!=='chart');$('drone-tools').classList.toggle('hidden',view!=='drone');
 $('scope-toggle').innerHTML=(s.scope?'LOWER SCOPE':'RAISE SCOPE')+' <kbd>P</kbd>';
 $('view-hint').textContent=view==='scope'?(active?'DRAG TO ROTATE SCOPE · WHEEL TO ZOOM':'NO OPTICAL SIGNAL'):view==='sonar'?'BOW AT TOP · CONTACT BEARINGS RELATIVE TO HULL':view==='chart'?'DRAG TO PAN · WHEEL TO ZOOM · CLICK TO PLOT':active?'CAMERA FIXED AHEAD · W/S SPEED · A/D HEADING':'NO DRONE SIGNAL';
 $('view-range').textContent=drone?(active?`HDG ${deg(v.heading)}° · ${v.speed.toFixed(1)} KN · ${v.depth.toFixed(0)} M`:''):view==='chart'?`ZOOM ${chart.zoom.toFixed(1)}×`:'VISIBILITY 6.5 KM';
 $('station-status').textContent=s.depth<=1?'SURFACED · EXPOSED':s.depth<=15?'PERISCOPE DEPTH':s.silent?'SILENT RUNNING':'SUBMERGED';
 $('sim-time').textContent=new Date((18*3600+42*60+s.time)*1000).toISOString().slice(11,19);$('ping').innerHTML=s.pingCooldown>0?`RECHARGING ${Math.ceil(s.pingCooldown)}s`:'ACTIVE PING <kbd>G</kbd>';
 $('contacts-count').textContent=String(s.contacts.length).padStart(2,'0');
 $('contacts').innerHTML=s.contacts.length?s.contacts.map(c=>`<button class="contact-row ${selected===c.id?'active':''}" data-contact="${esc(c.id)}" aria-pressed="${selected===c.id}"><span class="contact-icon">${c.identified?(c.kind==='escort'?'⌁':c.kind==='fishing'?'△':'◇'):'◌'}</span><span><strong>${esc(c.identified?c.name:c.label)}</strong><small>${c.identified?(c.military?'MILITARY':'NEUTRAL'):'UNCLASSIFIED'} · ${c.range?(c.range/1000).toFixed(1)+' KM':'RANGE ?'}</small></span><span class="contact-bearing">${deg(relativeBearing(c.bearing,s.heading))}° R</span></button>`).join(''):'<div class="empty-contacts">Listening to the dark.<br>Contacts appear as you hear them.</div>';
 $('torp-count').textContent=String(s.torps).padStart(2,'0');$('tubes').innerHTML=Array.from({length:4},(_,i)=>`<i class="${i>=s.torps?'spent':''}"></i>`).join('');
 const target=s.contacts.find(c=>c.id===selected);$('weapon-hint').textContent=target?(target.identified&&!target.military?'Identified neutral. Hold fire.':`Firing bearing ${deg(target.bearing)}° true. Seeker may choose another target.`):'Select a contact to set firing bearing.';$('decoy-count').textContent=s.decoys+' LEFT';
 for(const id of ['battery','oxygen','fuel']){$(id+'-value').textContent=Math.round(s[id])+'%';$(id+'-bar').style.width=s[id]+'%';$(id+'-value').style.color=s[id]<20?'var(--red)':'';}
 $('alert-label').textContent=s.alert>60?'UNDER PURSUIT':s.alert>30?'POSSIBLE DETECTION':'UNDETECTED';$('alert-label').style.color=s.alert>30?'var(--red)':'var(--green)';$('alert-dot').style.background=s.alert>30?'var(--red)':'var(--green)';
 $('noise-value').textContent='SELF NOISE '+Math.round(s.noise)+' dB';$('clearance').textContent='KEEL CLEARANCE '+Math.round(bottom(s.x,s.y)-s.depth)+' m';$('damage-flash').style.opacity=s.shock?String(s.shock*.2):'0';$('cracks').classList.toggle('hidden',s.hull>30);
 $('viewport').dataset.paused=String(paused);$('viewport').dataset.station=view;
 for(const {el,enabled} of commandControls)el.disabled=!canIssue(s,context())||!enabled();
}

function canvasContext(id){const c=$(id),r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);if(c.width!==Math.round(r.width*d)||c.height!==Math.round(r.height*d)){c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);}const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);return{ctx,w:r.width,h:r.height};}
function drawSonar(id,mini,time){
 const {ctx:c,w,h}=canvasContext(id);if(!w||!h)return;const cx=w/2,cy=mini?h*.49:h*.47,R=mini?Math.min(w*.35,h*.32):Math.min(w*.33,h*.33);
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
 for(const q of state.contacts){if(!q.identified||q.age>3||q.kind==='sub')continue;const d=delta(q.bearing,look);if(Math.abs(d)>19/zoom)continue;const x=clamp(cx+Math.tan(rad(d))/Math.tan(rad(19/zoom))*cx,105,w-105);c.fillStyle='#d8d9b5';c.font='14px IBM Plex Mono,monospace';c.fillText(q.name.toUpperCase(),x,h*.59);c.fillStyle='#bdc7b0';c.font='12px IBM Plex Mono,monospace';c.fillText((q.range/1000).toFixed(1)+' KM · '+(q.military?'MILITARY':'NEUTRAL'),x,h*.59+19);}
}
function showResult(){if(resultShown)return;resultShown=true;persist();const win=state.status==='won';$('result-title').textContent=win?'Home, quietly.':state.status==='compromised'?'A costly mistake.':state.status==='expired'?'The window has closed.':'The sea falls silent.';$('result-body').textContent=win?'The intelligence is aboard. The crew is safe. Somewhere out there, the convoy sails on.':state.status==='compromised'?'A neutral vessel was lost. Your patrol has been recalled. Identify a silhouette before trusting a seeker.':state.status==='expired'?'Command has recalled the patrol after 30 simulated minutes. Time compression is useful, but keep an eye on the clock.':'Your boat could take no more. A quieter speed, a little more water under the keel, or one fewer look might change the next patrol.';$('result-stats').innerHTML=`<span>PATROL<br>${Math.floor(state.time/60)}m ${Math.floor(state.time%60)}s</span><span>HULL<br>${Math.round(state.hull)}%</span><span>PHOTOS<br>${state.photos.length}</span>`;$('result-dialog').showModal();}
function frame(now){
 const realDt=Math.min((now-last)/1000,.12);last=now;const ctx=context();
 if(canIssue(state,ctx)){
  const before=state.events[0],priorAlert=state.alert,wasOutsidePickup=distance(state,state.home)>=400;
  applyHelmKeys(state,ctx,keys,realDt);const hadRoute=!!state.route;step(state,realDt*rate);renderClock=state.time;
  if(hadRoute&&!state.route){setRate(1);toast('Waypoint reached. All stop. Time compression disengaged.');}
  if(wasOutsidePickup&&state.phase==='extract'&&distance(state,state.home)<400){setRate(1);toast('Pickup area reached. Surface to complete the patrol.');}
  if(state.alert>40&&priorAlert<=40){setRate(1);toast('Possible detection. Time compression disengaged.');sound.tone('contact');}
  if(before!==state.events[0]){const e=state.events[0];if(e.kind==='contact'||e.kind==='damage'||(state.alert>40&&rate>1))setRate(1);if(e.kind==='damage')sound.tone('damage');if(e.kind==='contact')sound.tone('contact');if(e.kind==='success'&&lastToast!==e.text){toast(e.text);lastToast=e.text;}}
  if(state.status!=='patrol')showResult();
 }
 if(String(feedActive(state,view))!==$('world').dataset.online)updateUI();
 const r=vp.getBoundingClientRect();
 if(scene&&feedActive(state,view)){scene.resize(r.width,r.height);scene.render(state,view,zoom,renderClock);}
 if(view==='scope'&&feedActive(state,'scope'))drawScope();if(view==='sonar')drawSonar('tactical',false,renderClock);if(view==='chart')drawChart();drawSonar('mini-sonar',true,renderClock);
 if(now-lastUI>100){updateUI();sound.update();lastUI=now;}if(now-lastSave>8000&&!ctx.modal&&!paused){persist();lastSave=now;}requestAnimationFrame(frame);
}
setView(scene?'scope':'sonar');updateUI();if(saved)$('resume').classList.remove('hidden');$('briefing').showModal();requestAnimationFrame(frame);
