import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,restore} from '../src/sim.js';
import * as persistence from '../src/persistence.js';

const storage=()=>{const values=new Map([['quiet-depths-v1','existing patrol'],['quiet-depths-photos-v1','existing library']]);return{values,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('opening, hiding or closing the briefing cannot replace an existing saved patrol or library',()=>{
 assert.equal(typeof persistence.persistPatrol,'function');const store=storage(),before=[...store.values];
 for(const status of ['patrol','lost','won']){const s=createGame();s.status=status;assert.equal(persistence.persistPatrol(store,s,false),false);assert.deepEqual([...store.values],before);}
});
test('an explicitly started patrol persists once, stores images separately and keeps evidence after its end',()=>{
 assert.equal(typeof persistence.persistPatrol,'function');const store=storage(),s=createGame();s.time=37;s.photoArchive=[{id:1,source:'scope',takenAt:12,image:'data:image/jpeg;base64,QUJD',caption:'Evidence'}];
 assert.equal(persistence.persistPatrol(store,s,true),true);const game=restore(store.values.get('quiet-depths-v1'));assert.ok(game);assert.equal(game.time,37);assert.deepEqual(game.photoArchive,[]);assert.deepEqual(JSON.parse(store.values.get('quiet-depths-photos-v1')),s.photoArchive);
 s.status='lost';assert.equal(persistence.persistPatrol(store,s,true),true);assert.equal(store.values.has('quiet-depths-v1'),false);assert.equal(JSON.parse(store.values.get('quiet-depths-photos-v1')).length,1);
});
