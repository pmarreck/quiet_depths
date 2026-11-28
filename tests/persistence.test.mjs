import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,restore} from '../src/sim.js';
import * as persistence from '../src/persistence.js';

const storage=(failWrite=()=>false)=>{
 const values=new Map([['quiet-depths-v1','existing patrol'],['quiet-depths-photos-v1','existing library']]);
 return{
  values,
  getItem:key=>values.get(key)??null,
  setItem(key,value){
   if(failWrite(key))throw new DOMException('Storage quota exceeded','QuotaExceededError');
   values.set(key,value);
  },
  removeItem:key=>values.delete(key)
 };
};
test('opening, hiding or closing the briefing cannot replace an existing saved patrol or library',()=>{
 assert.equal(typeof persistence.persistPatrol,'function');const store=storage(),before=[...store.values];
 for(const status of ['patrol','lost','won']){const s=createGame();s.status=status;assert.equal(persistence.persistPatrol(store,s,false),false);assert.deepEqual([...store.values],before);}
});
test('only an active saved or current patrol can be resumed',()=>{
 const saved=createGame('recon',17),current=createGame('survey',42);
 assert.equal(persistence.resumablePatrol(saved,current),saved);
 assert.equal(persistence.resumablePatrol(null,current),current);
 for(const status of ['lost','won','compromised','expired']){
  assert.equal(persistence.resumablePatrol({...saved,status},current),current);
  assert.equal(persistence.resumablePatrol({...saved,status},{...current,status}),null);
 }
 assert.equal(persistence.resumablePatrol(null,null),null);
});
test('an explicitly started patrol persists once, stores images separately and keeps evidence after its end',()=>{
 assert.equal(typeof persistence.persistPatrol,'function');const store=storage(),s=createGame();s.time=37;s.photoArchive=[{id:1,source:'scope',takenAt:12,image:'data:image/jpeg;base64,QUJD',caption:'Evidence'}];
 assert.deepEqual(persistence.persistPatrol(store,s,true),{photosSaved:true,recordSaved:true});const game=restore(store.values.get('quiet-depths-v1'));assert.ok(game);assert.equal(game.time,37);assert.deepEqual(game.photoArchive,[]);assert.deepEqual(JSON.parse(store.values.get('quiet-depths-photos-v1')),s.photoArchive);
 s.status='lost';assert.deepEqual(persistence.persistPatrol(store,s,true),{photosSaved:true,recordSaved:true});assert.equal(store.values.has('quiet-depths-v1'),false);assert.equal(JSON.parse(store.values.get('quiet-depths-photos-v1')).length,1);
});

test('photo or service-record quota errors do not block saving or retiring the patrol',()=>{
 const game=createGame();game.time=92;game.patrolId='a'.repeat(32);
 Object.assign(game.ships[0],{military:true,playerDamaged:true,hull:0});
 for(const failedKey of ['quiet-depths-photos-v1','quiet-depths-service-record-v1:'+game.patrolId]){
  const store=storage(key=>key===failedKey);
  const expected={photosSaved:failedKey!=='quiet-depths-photos-v1',recordSaved:!failedKey.includes('service-record')};
  assert.deepEqual(persistence.persistPatrol(store,game,true),{...expected,recordSaved:true});
  assert.equal(restore(store.getItem('quiet-depths-v1')).time,92);
  assert.equal(store.getItem('quiet-depths-photos-v1'),expected.photosSaved?'[]':'existing library');
  assert.equal(store.getItem('quiet-depths-service-record-v1:'+game.patrolId),null);
  assert.deepEqual(persistence.persistPatrol(store,{...game,status:'lost'},true),expected);
  assert.equal(store.getItem('quiet-depths-service-record-v1:'+game.patrolId),expected.recordSaved?'{"ships":1,"submarines":0}':null);
  assert.equal(store.getItem('quiet-depths-v1'),null);
 }
});

test('a failed patrol save leaves the previous patrol and archive recoverable',()=>{
 const store=storage(key=>key==='quiet-depths-v1'),before=[...store.values];
 assert.throws(()=>persistence.persistPatrol(store,createGame(),true),{name:'QuotaExceededError'});
 assert.deepEqual([...store.values],before);
});

test('only explicit briefing commands begin or continue a patrol',async()=>{
 const {bindBriefingNavigation}=await import('../src/briefing-navigation.js');
 const dialog=new EventTarget(),buttons=new Map(['#start','#resume','#close-briefing'].map(id=>[id,new EventTarget()]));
 const actions=[];
 dialog.querySelector=id=>buttons.get(id);
 dialog.close=()=>actions.push('closed');
 bindBriefingNavigation(dialog,()=>actions.push('begin'),()=>actions.push('continue'),()=>actions.push('return'));

 buttons.get('#close-briefing').dispatchEvent(new Event('click'));
 assert.deepEqual(actions.splice(0),['closed','return']);
 const escape=new Event('cancel',{cancelable:true});
 dialog.dispatchEvent(escape);
 assert.ok(escape.defaultPrevented);
 assert.deepEqual(actions.splice(0),['closed','return']);

 buttons.get('#start').dispatchEvent(new Event('click'));
 assert.deepEqual(actions.splice(0),['begin']);
 buttons.get('#resume').dispatchEvent(new Event('click'));
 assert.deepEqual(actions,['continue']);
});

test('each ended patrol counts once for its captain, including losses with no sinkings',async()=>{
 const {captainRecords,recordOutcome,starLabel,humorousName,captainName,transferFilename}=await import('../src/captain.js');
 const values=new Map(),store={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const patrol={patrol:{seed:42},captain:'Rita Bilge',status:'patrol'};
 for(let i=0;i<11;i++){
  const s={...patrol,patrolId:i.toString(16).padStart(32,'0')};recordOutcome(store,s);
  const won=i<5;s.captain=i===10?'Nell Haddock':i===4?'RITA BILGE':s.captain;
  s.status=won?'won':['lost','expired','compromised','convoy-lost'][i%4];recordOutcome(store,s);
  recordOutcome(store,s);recordOutcome(store,{...s,status:won?'lost':'won'});
 }
 const {fleet,captains}=captainRecords(store);assert.deepEqual(fleet,{completed:11,succeeded:5,partial:0,failed:6});
 assert.deepEqual(captains.get('rita bilge'),{name:'Rita Bilge',completed:10,succeeded:5,partial:0,failed:5});
 assert.deepEqual([0,4,5,9,10].map(starLabel),['','','★ 1 service star','★ 1 service star','★ 2 service stars']);
 assert.equal(captainName('  Captain   Captain Rita   Bilge  '),'Rita Bilge');
 assert.equal(transferFilename('Nell / Hāddock','What the sea remembers'),'Captain_Nell_Hāddock-What_the_sea_remembers.qdsave.json');
 assert.equal(transferFilename('Nell Haddock'),'Captain_Nell_Haddock.qdstate.json');
 assert.ok(new Set(Array.from({length:64},(_,i)=>humorousName(i))).size>=32);
});

test('plain JSON transfers preserve the seeded simulation and reject invalid backups before applying anything',async()=>{
 const {saveDocument,stateDocument,decodeFile}=await import('../src/patrol-transfer.js');
 const {validPhoto}=await import('../src/photos.js');
 const {step,save}=await import('../src/sim.js');
 const s=createGame('survey',1729);s.captain='Rita Bilge';s.patrolId='a'.repeat(32);step(s,7.25);
 const entry={patrol:s,label:'Survey',image:'',station:null},decode=(file,type)=>decodeFile(JSON.stringify(file),type,async raw=>restore(raw),()=>assert.fail('unexpected station'),validPhoto);
 const imported=(await decode(saveDocument(entry),'patrol')).patrol;
 step(s,11);step(imported,11);assert.equal(save(imported),save(s));
 const slot={...entry,id:2},setup={mission:'survey',seed:'0',captain:'Rita Bilge',defaultCaptain:'Nell Haddock',conditions:{weather:'rain',timeOfDay:'dusk',changing:true}};
 const file=stateDocument({current:entry,started:true,slots:[slot],setup,localStorage:{'quiet-depths-v1':{...s}}});
 assert.deepEqual((await decode(file,'state')).setup,setup);
 for(const patch of [{version:2},{format:'Quiet Depths patrol'},{slots:[slot,slot]},{slots:[{...slot,id:7}]},{started:true,current:null},{localStorage:{unrelated:true}},{localStorage:{'quiet-depths-v1':{version:1}}},{slots:[{...slot,image:'https://example.invalid/image'}]}]){
  await assert.rejects(()=>decode({...file,...patch},'state'));
 }
});

test('sonar paper transfer preserves historical rows, the browsed position and a partially written row',async()=>{
 const {ImagerPaper}=await import('../src/sonar-imager.js');
 const plates={},s=createGame('recon',31);s.speed=-3;s.ships=[];
 for(const mode of ['scribbler','painter']){
  const paper=new ImagerPaper(mode,'survey',plates);
  for(let t=0;t<201;t++){s.time=t*.23;paper.advance(s,.23,1);}
  paper.scrollRows(17.5);
  const copy=ImagerPaper.fromSnapshot(JSON.parse(JSON.stringify(paper.snapshot())),plates);
  assert.deepEqual(copy.snapshot(),paper.snapshot());
  s.time+=.14;paper.advance(s,.14,1);copy.advance(s,.14,1);assert.deepEqual(copy.snapshot(),paper.snapshot());
  assert.throws(()=>ImagerPaper.fromSnapshot({...paper.snapshot(),x:-1},plates));
 }
});
