import {save,restore} from './sim.js';
import {slotCount,readStorage,replaceStorage} from './patrol-transfer.js';

const storeName='patrols';
export const SLOT_COUNT=slotCount;

async function transaction(mode,run){
 const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open('quiet-depths-slots',1);
  request.onupgradeneeded=()=>request.result.createObjectStore(storeName,{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(storeName,mode);
   let result,problem;
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(problem||tx.error||new Error('Save storage unavailable.'));
   const fail=error=>{problem=error;tx.abort();};
   try{run(tx.objectStore(storeName),value=>{result=value;},fail);}catch(error){fail(error);}
  });
 }finally{db.close();}
}
export function allSlotEntries(){
 return transaction('readonly',(store,done)=>{
  const read=store.getAll(IDBKeyRange.bound(1,SLOT_COUNT));read.onsuccess=()=>done(read.result);
 });
}
export async function listSlots(){return (await allSlotEntries()).map(({id,revision,image,label})=>({id,revision,image,label}));}

function slotEntry(id,patrol,image,label,station){
 if(!Number.isInteger(id)||id<1||id>SLOT_COUNT||patrol.status!=='patrol')throw new Error('Choose an active patrol and a valid slot.');
 return {id,version:1,revision:crypto.randomUUID(),image,label,snapshot:save(patrol),station};
}
export function writeSlot(id,expected,state,image,label,station=null){
 const entry=slotEntry(id,state,image,label,station);
 return transaction('readwrite',(store,done,fail)=>{
  const read=store.get(id);
  read.onsuccess=()=>{
   if((read.result?.revision??'')!==expected){fail(new Error('This slot changed in another window. Review it before saving.'));return;}
   store.put(entry);
  };
 });
}
export function unpackSlot(entry){
 const patrol=entry.version===1&&restore(entry.snapshot);
 if(patrol?.status!=='patrol')throw new Error('This saved patrol could not be read.');
 return {id:entry.id,patrol,image:entry.image,label:entry.label,station:entry.station??null};
}
export async function readSlotEntry(id,expected){
 const entry=await transaction('readonly',(store,done)=>{
  const read=store.get(id);read.onsuccess=()=>done(read.result);
 });
 if(!entry||entry.revision!==expected)throw new Error('This slot changed in another window. Select it again.');
 return unpackSlot(entry);
}
export async function loadSlot(id,expected){return (await readSlotEntry(id,expected)).patrol;}

export async function installBackup(storage,backup,token){
 let previous=null;
 try{
  await transaction('readwrite',(store,done,fail)=>{
   // Hold the slot write transaction while swapping the local keyspace.
   const ready=store.getAllKeys();
   ready.onsuccess=()=>{
    try{
     for(const key of ready.result)if(typeof key==='number')store.delete(key);
     for(const s of backup.slots)store.put(slotEntry(s.id,s.patrol,s.image,s.label,s.station));
     store.put({id:token,setup:backup.setup,started:backup.started,current:backup.current});
     previous=readStorage(storage);
     replaceStorage(storage,backup.localStorage);
    }catch(error){fail(error);}
   };
  });
 }catch(error){
  if(previous!==null)replaceStorage(storage,previous);
  throw error;
 }
}
export function importedSession(token,remove=false){
 return transaction(remove?'readwrite':'readonly',(store,done)=>{
  const read=remove?store.delete(token):store.get(token);read.onsuccess=()=>done(read.result);
 });
}
