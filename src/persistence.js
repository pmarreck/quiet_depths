import {save} from './sim.js';
import {photoArchive} from './photos.js';
import {saveServiceRecord} from './service-record.js';

export function resumablePatrol(saved,current){
 if(saved?.status==='patrol')return saved;
 return current?.status==='patrol'?current:null;
}

export function persistPatrol(storage,state,started){
 if(!started)return false;
 if(state.status==='patrol')storage.setItem('quiet-depths-v1',save({...state,photoArchive:[]}));
 else storage.removeItem('quiet-depths-v1');

 let photosSaved=true,recordSaved=true;
 try{storage.setItem('quiet-depths-photos-v1',JSON.stringify(photoArchive(state)));}catch{photosSaved=false;}
 try{if(state.status!=='patrol')saveServiceRecord(storage,state);}catch{recordSaved=false;}
 return {photosSaved,recordSaved};
}
