import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,contact,step,ping,fire,restore,save} from '../src/sim.js';
import {chartContacts} from '../src/track-estimates.js';
import {affiliation,classifyEcho,fleetShotPose,sidesAfloat} from '../src/fleet-action.js';
import {patrolKills} from '../src/service-record.js';
import {disciplinaryFinding} from '../src/patrol-reports.js';
import {patrolNotices} from '../src/ui.js';

function ready(seed=23){
 const s=createGame('tiebreaker',seed,{difficulty:{airSupport:false,instantReplay:false}});
 s.depth=s.targetDepth=50;s.speed=s.targetSpeed=0;s.scope=false;return s;
}
test('an equally matched battle is already in progress at arrival and survives saves mid-exchange',()=>{
 for(let seed=1;seed<=12;seed++){
  const s=ready(seed);
  assert.deepEqual(sidesAfloat(s.ships),{friendly:4,hostile:4});assert.equal(s.torps,3);
  for(const side of ['friendly','hostile']){
   const cast=s.ships.filter(v=>v.side===side);assert.equal(cast.filter(v=>v.kind==='sub').length,1);
   assert.ok(s.battle.volleys.some(v=>cast.some(ship=>ship.id===v.source)));
  }
  const plans=structuredClone(s.battle.areas);assert.equal(chartContacts(s).length,0);
  const copy=restore(save(s));assert.ok(copy);step(s,60);step(copy,60);assert.deepEqual(copy,s);
  assert.deepEqual(s.battle.areas,plans);assert.ok(s.ships.some(v=>v.hull<100));
  assert.ok(s.ships.filter(v=>v.side==='friendly').every(v=>!v.report));
  assert.deepEqual(patrolKills(s),{ships:0,submarines:0});
 }
});
test('briefed areas favor friendly recognition; passive bearings and friendly forecasts never disclose a live fix',()=>{
 const s=ready(),ally=s.ships.find(v=>v.side==='friendly'),enemy=s.ships.find(v=>v.side==='hostile');
 const a=contact(s,ally,'passive');assert.equal(a.range,0);assert.equal(a.side,undefined);assert.equal(a.probableSide,undefined);
 const area=s.battle.areas[0],rolls=Array.from({length:100},(_,i)=>(i+.5)/100);
 assert.equal(rolls.filter(r=>classifyEcho(s.battle,ally,area,r)==='friendly').length,88);
 assert.equal(rolls.filter(r=>classifyEcho(s.battle,enemy,area,r)==='hostile').length,28);
 ping(s);assert.ok(a.range>0);assert.equal(a.identified,false);
 // The opt-in live enemy chart still uses observations for friendly vessels.
 s.difficulty.omniscientChart=true;assert.equal(chartContacts(s).find(v=>v.id===ally.id).exact,undefined);
 assert.equal(chartContacts(s).find(v=>v.id===enemy.id).exact,true);
 contact(s,ally,'visual');assert.equal(affiliation(a),'FRIENDLY');assert.equal(fire(s,ally.id),false);assert.equal(s.torps,3);
 ally.playerDamaged=true;ally.hull=0;assert.equal(patrolKills(s).ships,0);assert.match(disciplinaryFinding(s).reason,/Friendly fire/);
});
test('surface pickup stays locked at a one-vessel lead and stays open once a two-vessel lead has been earned',()=>{
 const s=ready();Object.assign(s,{x:s.home.x,y:s.home.y,depth:0,targetDepth:0});const foes=s.ships.filter(v=>v.side==='hostile'),allies=s.ships.filter(v=>v.side==='friendly');
 foes[0].hull=0;step(s,.25);assert.equal(s.phase,'objective');assert.equal(s.status,'patrol');
 s.x+=1000;foes[1].hull=0;step(s,.25);assert.equal(s.phase,'extract');assert.equal(s.status,'patrol');
 assert.ok(patrolNotices(s,false,false,'chart').some(n=>n.id==='fleet-clearance'));
 const r=restore(save(s));for(const v of r.ships.filter(v=>v.side==='friendly').slice(0,3))v.hull=0;
 r.time=1801;step(r,.25);assert.equal(r.status,'patrol');assert.equal(r.phase,'extract');
 Object.assign(r,{x:r.home.x,y:r.home.y,depth:0,targetDepth:0});step(r,.25);assert.equal(r.status,'won');
 assert.equal(allies.length,4);
});
test('if only one friendly remains before clearance the patrol resolves, and damaged saves fail to load',()=>{
 const s=ready();for(const v of s.ships.filter(v=>v.side==='friendly').slice(1))v.hull=0;step(s,.25);
 assert.equal(s.status,'expired');assert.match(s.debrief.at(-1).text,/recalled/);
 for(const change of [s=>s.ships[0].side='hostile',s=>s.battle.volleys[0].target='unknown',s=>s.battle.areas.pop(),s=>s.battle.volleys[1].id=s.battle.volleys[0].id,s=>contact(s,s.ships[0],'visual').side='unknown']){
  const b=ready();change(b);assert.equal(restore(save(b)),null);
 }
});
test('a fleet torpedo in the water gives a separate sonar return and moves toward its depicted impact',()=>{
 let s,v;
 for(let seed=1;seed<50&&!v;seed++){s=ready(seed);v=s.battle.volleys.find(v=>v.underwater);}
 assert.ok(v);const a=fleetShotPose(v,v.launched),b=fleetShotPose(v,(v.launched+v.arrives)/2),c=fleetShotPose(v,v.arrives);
 assert.ok(Math.abs(b.x-(a.x+c.x)/2)<.001);assert.ok(b.depth>0);assert.ok(ping(s));assert.ok(s.torpedoTracks.some(t=>t.id===v.id&&!t.inboundRun));assert.ok(restore(save(s)));
});
