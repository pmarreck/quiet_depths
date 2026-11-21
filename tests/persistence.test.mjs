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
  assert.deepEqual(persistence.persistPatrol(store,game,true),expected);
  assert.equal(restore(store.getItem('quiet-depths-v1')).time,92);
  assert.equal(store.getItem('quiet-depths-photos-v1'),expected.photosSaved?'[]':'existing library');
  assert.equal(store.getItem('quiet-depths-service-record-v1:'+game.patrolId),expected.recordSaved?'{"ships":1,"submarines":0}':null);
  assert.deepEqual(persistence.persistPatrol(store,{...game,status:'lost'},true),expected);
  assert.equal(store.getItem('quiet-depths-v1'),null);
 }
});

test('a failed patrol save leaves the previous patrol and archive recoverable',()=>{
 const store=storage(key=>key==='quiet-depths-v1'),before=[...store.values];
 assert.throws(()=>persistence.persistPatrol(store,createGame(),true),{name:'QuotaExceededError'});
 assert.deepEqual([...store.values],before);
});
