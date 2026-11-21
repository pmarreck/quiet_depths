import {save,restore} from './sim.js';

const storeName='patrols';
export const SLOT_COUNT=6;

// Let the browser serialize competing writers. The preview and snapshot commit together.
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
   run(tx.objectStore(storeName),value=>{result=value;},error=>{problem=error;tx.abort();});
  });
 }finally{db.close();}
}

export function listSlots(){
 return transaction('readonly',(store,done)=>{
  const read=store.getAll();
  read.onsuccess=()=>done(read.result.map(({id,revision,image,label})=>({id,revision,image,label})));
 });
}

export function writeSlot(id,expected,state,image,label){
 if(!Number.isInteger(id)||id<1||id>SLOT_COUNT||state.status!=='patrol')throw new Error('Choose an active patrol and a valid slot.');
 const entry={id,version:1,revision:crypto.randomUUID(),image,label,snapshot:save({...state,photoArchive:[]})};
 return transaction('readwrite',(store,done,fail)=>{
  const read=store.get(id);
  read.onsuccess=()=>{
   if((read.result?.revision??'')!==expected){fail(new Error('This slot changed in another window. Review it before saving.'));return;}
   store.put(entry);
  };
 });
}

export function loadSlot(id,expected){
 return transaction('readonly',(store,done,fail)=>{
  const read=store.get(id);
  read.onsuccess=()=>{
   const entry=read.result;
   if(!entry||entry.revision!==expected){fail(new Error('This slot changed in another window. Select it again.'));return;}
   const patrol=entry.version===1&&restore(entry.snapshot);
   if(patrol?.status!=='patrol'){fail(new Error('This saved patrol could not be read.'));return;}
   done(patrol);
  };
 });
}
