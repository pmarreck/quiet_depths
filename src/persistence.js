import {save} from './sim.js';
import {photoArchive} from './photos.js';

export function persistPatrol(storage,state,started){
 if(!started)return false;
 storage.setItem('quiet-depths-photos-v1',JSON.stringify(photoArchive(state)));
 if(state.status==='patrol')storage.setItem('quiet-depths-v1',save({...state,photoArchive:[]}));
 else storage.removeItem('quiet-depths-v1');
 return true;
}
