import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGame,restore,save} from '../src/sim.js';
import {earlyEndOffered,earlyEndRule,endPatrolEarly,extractionPrompt,partialCredit,partialSummary,pickupRadius} from '../src/early-end.js';
import {captainRecords,recordOutcome,serviceCredit,starLabel,validOutcome} from '../src/captain.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
// A fresh patrol, surfaced just inside the pickup circle.
function atPickup(mission,seed=7,offset=pickupRadius-1){
 const s=createGame(mission,seed);
 Object.assign(s,{x:s.home.x+offset,y:s.home.y,depth:0,targetDepth:0});
 return s;
}

test('each mission’s early end comes from its Elm definition, and only where extraction leaves the objective open',()=>{
 const rules=Object.fromEntries(['recon','intercept','seek-and-destroy','big-kahuna','seek-and-destroy-sub','sneaky-seamen','shadow','undersea-rescue','surface-rescue','survey','tiebreaker','wolf-in-the-henhouse']
  .map(id=>[id,earlyEndRule(id)]));
 assert.deepEqual(rules,{
  recon:{kind:'photographs',atLeast:1},intercept:{kind:'none'},'seek-and-destroy':{kind:'sunk',atLeast:1},'big-kahuna':{kind:'carrierFoundering'},
  'seek-and-destroy-sub':null,'sneaky-seamen':null,shadow:{kind:'tracking',share:.5},'undersea-rescue':{kind:'survivors',atLeast:1},
  'surface-rescue':{kind:'survivors',atLeast:1},survey:{kind:'scanOrPhotographs',scanShare:.5,photographs:1},tiebreaker:null,'wolf-in-the-henhouse':null});
 assert.throws(()=>earlyEndRule('nowhere'),/Unknown patrol mission/);
 const elm=read('elm/PatrolMission.elm');
 return elm.then(source=>{
  assert.match(source,/\(Photographs merchantPhotos\)\n {16}\(EndEarly \(PhotographsTaken 1\)\)/);
  assert.match(source,/Survive\n {16}NoEarlyEnd\n/);
  assert.match(source,/\(ReachGate 200\)\n {16}NoEarlyEnd\n/);
  assert.match(source,/\(FleetLead 2\)\n {16}NoEarlyEnd\n/);
  assert.match(source,/\(ProtectConvoy "wolf" 2\)\n {16}NoEarlyEnd\n/);
 });
});

test('the question is offered only surfaced inside the pickup circle with the objective still open',()=>{
 assert.equal(earlyEndOffered(atPickup('recon')),true);
 assert.equal(earlyEndOffered(atPickup('recon',7,pickupRadius)),false,'the circle edge is outside');
 assert.equal(earlyEndOffered(Object.assign(atPickup('recon'),{depth:1})),true,'1 m counts as surfaced, as it does for pickup');
 assert.equal(earlyEndOffered(Object.assign(atPickup('recon'),{depth:1.01})),false);
 assert.equal(earlyEndOffered(Object.assign(atPickup('recon'),{phase:'extract'})),false,'a finished objective surfaces for a full success');
 for(const status of ['won','lost','expired','partial','withdrawn'])assert.equal(earlyEndOffered(Object.assign(atPickup('recon'),{status})),false,status);
 for(const mission of ['seek-and-destroy-sub','sneaky-seamen','tiebreaker','wolf-in-the-henhouse'])assert.equal(earlyEndOffered(atPickup(mission)),false,mission);
 for(const mission of ['recon','intercept','seek-and-destroy','big-kahuna','shadow','undersea-rescue','surface-rescue','survey'])assert.equal(earlyEndOffered(atPickup(mission)),true,mission);
});

test('each mission’s partial credit needs its measurable part of the objective',()=>{
 const credit=(mission,change)=>{const s=atPickup(mission);change(s);return partialCredit(s);};
 assert.equal(credit('recon',()=>{}),false);
 assert.equal(credit('recon',s=>{s.photos=['p1'];}),true);
 assert.equal(credit('intercept',s=>{s.photos=['p1'];s.trackTime=9999;}),false,'a single-target interception has no partial credit');
 assert.equal(credit('seek-and-destroy',s=>{s.ships.find(v=>v.id==='tern').hull=0;s.ships.find(v=>v.id==='kestrel').hull=0;}),false,'only the briefed transports count');
 assert.equal(credit('seek-and-destroy',s=>{s.ships.find(v=>v.id==='meridian').hull=1;}),false,'a damaged transport is not sunk');
 assert.equal(credit('seek-and-destroy',s=>{s.ships.find(v=>v.id==='meridian').hull=0;}),true);
 assert.equal(credit('big-kahuna',s=>{s.ships.find(v=>v.id==='solstice').directHits=1;}),false);
 assert.equal(credit('big-kahuna',s=>{s.ships.find(v=>v.id==='solstice').directHits=2;}),true,'two hits start irreversible flooding');
 assert.equal(credit('shadow',s=>{s.trackTime=s.patrol.trackGoal/2-.01;}),false);
 assert.equal(credit('shadow',s=>{s.trackTime=s.patrol.trackGoal/2;}),true);
 for(const mission of ['undersea-rescue','surface-rescue']){
  assert.equal(credit(mission,()=>{}),false,mission);
  assert.equal(credit(mission,s=>{s.operation.rescued=1;}),true,mission);
 }
 assert.equal(credit('survey',s=>{s.operation.scan=22.49;}),false);
 assert.equal(credit('survey',s=>{s.operation.scan=22.5;}),true,'half of 45 scan seconds');
 assert.equal(credit('survey',s=>{s.operation.photoAngles=[40];}),true,'one ROV photograph');
 assert.equal(partialCredit(atPickup('seek-and-destroy-sub')),false);
});

test('the question comes once per entry into the pickup circle',()=>{
 const s=atPickup('recon',7,pickupRadius+50);
 let armed=true,asked=0;
 const tick=change=>{change?.(s);const next=extractionPrompt(armed,s);armed=next.armed;if(next.ask)asked++;return next;};
 assert.deepEqual(tick(),{ask:false,armed:true});
 Object.assign(s,{x:s.home.x+100,depth:20});
 assert.deepEqual(tick(),{ask:false,armed:true},'entering submerged does not ask yet');
 assert.deepEqual(tick(v=>{v.depth=0;}),{ask:true,armed:false},'surfacing inside asks');
 tick();tick(v=>{v.depth=10;});tick(v=>{v.depth=0;});
 assert.equal(asked,1,'declining keeps the patrol running without asking again inside the circle');
 tick(v=>{v.x=v.home.x+pickupRadius;});
 assert.equal(armed,true,'leaving re-arms');
 tick(v=>{v.x=v.home.x+10;});
 assert.equal(asked,2,'re-entering asks again');
 s.phase='extract';tick(v=>{v.x=v.home.x+pickupRadius+1;});tick(v=>{v.x=v.home.x;});
 assert.equal(asked,2,'a finished objective is never asked about');
});

test('ending early records a partial success or a failure, and nothing when the question no longer applies',()=>{
 const partial=atPickup('recon');partial.photos=['p1'];
 assert.equal(endPatrolEarly(partial),'partial');
 assert.equal(partial.status,'partial');
 assert.equal(partial.events[0].text,'Patrol ended at extraction with part of the objective complete.');
 assert.equal(partial.events[0].kind,'success');
 assert.equal(partial.debrief.at(-1).text,'You ended the patrol at extraction with part of the objective complete.');
 assert.equal(endPatrolEarly(partial),null,'an ended patrol cannot end again');
 assert.equal(partialSummary(partial),`1 of ${partial.patrol.photoGoal} merchant photographs came home.`);
 const empty=atPickup('intercept');
 assert.equal(endPatrolEarly(empty),'withdrawn');
 assert.equal(empty.status,'withdrawn');
 assert.equal(empty.events[0].kind,'warning');
 assert.equal(empty.debrief.at(-1).text,'You ended the patrol at extraction before any part of the objective was met.');
 assert.throws(()=>partialSummary(empty),/no partial credit/);
 const away=atPickup('recon',7,pickupRadius+1),before=save(away);
 assert.equal(endPatrolEarly(away),null);
 assert.equal(save(away),before,'an order outside the circle changes nothing');
});

test('each partial success says what came home',()=>{
 const summary=(mission,change)=>{const s=atPickup(mission);change(s);return partialSummary(s);};
 assert.equal(summary('seek-and-destroy',s=>{s.ships.find(v=>v.id==='alder').hull=0;}),'1 of 3 military transports sank before you withdrew.');
 assert.equal(summary('big-kahuna',s=>{s.ships.find(v=>v.id==='solstice').directHits=2;}),'The carrier was already sinking when you withdrew.');
 assert.equal(summary('undersea-rescue',s=>{s.operation.rescued=3;}),'3 survivors came home with you.');
 assert.equal(summary('survey',s=>{s.operation.scan=30;}),'Part of the wreck survey came home.');
 assert.equal(summary('shadow',s=>{s.trackTime=95.7;}),`95 of ${atPickup('shadow').patrol.trackGoal} seconds of convoy tracking came home.`);
});

test('a patrol ended early survives a save, and a save that could not have ended early is rejected',()=>{
 const s=atPickup('survey');s.operation.photoAngles=[40];endPatrolEarly(s);
 const back=restore(save(s));
 assert.equal(back?.status,'partial');
 const withdrawn=atPickup('recon');endPatrolEarly(withdrawn);
 assert.equal(restore(save(withdrawn))?.status,'withdrawn');
 const hunt=createGame('seek-and-destroy-sub',7);hunt.status='partial';
 assert.equal(restore(save(hunt)),null,'Sub Hunt never ends early');
 const finished=atPickup('recon');finished.status='partial';finished.phase='extract';
 assert.equal(restore(save(finished)),null,'an early end happens before the objective is met');
});

test('partial successes are their own tally and count half toward service stars',()=>{
 const values=new Map(),store={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const end=(i,status)=>recordOutcome(store,{patrolId:i.toString(16).padStart(32,'0'),captain:'Rita Bilge',patrol:{seed:1},status});
 for(let i=0;i<4;i++)end(i,'won');
 end(4,'partial');end(5,'withdrawn');end(6,'partial');end(6,'won');
 assert.deepEqual(JSON.parse(values.get('quiet-depths-patrol-outcome-v1:'+(4).toString(16).padStart(32,'0'))),{captain:'Rita Bilge',won:false,partial:true});
 assert.deepEqual(JSON.parse(values.get('quiet-depths-patrol-outcome-v1:'+(5).toString(16).padStart(32,'0'))),{captain:'Rita Bilge',won:false});
 const rita=captainRecords(store).captains.get('rita bilge');
 assert.deepEqual(rita,{name:'Rita Bilge',completed:7,succeeded:4,partial:2,failed:1},'a recorded outcome is never rewritten');
 assert.equal(serviceCredit(rita),5);
 assert.equal(starLabel(serviceCredit(rita)),'★ 1 service star');
 assert.equal(starLabel(serviceCredit({succeeded:4,partial:1})),'','4.5 successes earn no star yet');
 assert.equal(serviceCredit(undefined),0);
 assert.equal(validOutcome({captain:'Rita Bilge',won:true,partial:true}),false,'a won patrol is not partial');
 assert.equal(validOutcome({captain:'Rita Bilge',won:false,partial:'yes'}),false);
 assert.equal(validOutcome({captain:'Rita Bilge',won:false,partial:false}),true);
});

test('the end-mission dialog asks in Elm, opens on its heading and sends only its two answers',async()=>{
 const [elm,app,page,flake]=await Promise.all([read('elm/EndMission.elm'),read('src/app.js'),read('src/index.html'),read('flake.nix')]);
 assert.match(page,/<dialog id="end-mission-dialog" aria-labelledby="end-mission-title"><div id="end-mission-root"><\/div><\/dialog>/);
 assert.match(flake,/ elm\/EndMission\.elm /);
 assert.deepEqual([...elm.matchAll(/Answer "(\w+)"/g)].map(m=>m[1]),['end','continue']);
 assert.match(elm,/div \[ class "report-heading", tabindex -1, autofocus True \]/);
 assert.match(elm,/PartialSuccess ->\n {12}"Ending now records a partial success\."/);
 assert.match(elm,/Unsuccessful ->\n {12}"Nothing toward the objective is aboard yet\. Ending now records an unsuccessful patrol\."/);
 assert.ok(app.includes(`endMission.ports.endMissionOrder.subscribe(answer=>{
 $('end-mission-dialog').close();
 if(answer==='end'&&canIssue(state,context()))endPatrolEarly(state).then(ended=>{if(ended)updateUI();});
});`));
 assert.ok(app.includes(`const extraction=extractionPrompt(extractionArmed,state);extractionArmed=extraction.armed;if(extraction.ask)askEndMission();`));
 assert.match(app,/lossSoundPlayed=false;extractionArmed=true;/,'a new patrol arms the question');
 assert.ok(app.includes(`endMission.ports.endMissionReading.send({objective:MISSIONS.find(m=>m.id===state.mission).short,partial:partialCredit(state)});
 $('end-mission-dialog').showModal();`),'the dialog opens with the briefed objective and the credit already sent');
 assert.match(elm,/"You are surfaced at extraction, but the objective is not complete: " \+\+ r\.objective \+\+ "\."/);
});
