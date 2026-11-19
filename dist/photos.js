export const PHOTO_LIMIT=24,PHOTO_BUDGET=1400000;
const sources=new Set(['scope','drone','satellite']);
export const validPhoto=p=>p&&sources.has(p.source)&&Number.isFinite(p.takenAt)&&p.takenAt>=0&&typeof p.image==='string'&&p.image.length<300000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image);
export function photoArchive(s){if(!Array.isArray(s.photoArchive))s.photoArchive=[];return s.photoArchive;}
export function recordExposure(s,metadata,capture){const image=capture();return image?recordPhoto(s,{...metadata,image}):null;}
export function recordPhoto(s,photo){
 if(!validPhoto(photo))return null;
 const archive=photoArchive(s);s.photoSequence=Math.max(1,s.photoSequence||1,...archive.map(p=>(Number(p.id)||0)+1));
 const p=JSON.parse(JSON.stringify({...photo,id:s.photoSequence++,caption:String(photo.caption||'Photograph').slice(0,200)}));archive.push(p);
 while(archive.length>PHOTO_LIMIT||archive.reduce((n,v)=>n+v.image.length,0)>PHOTO_BUDGET)archive.shift();return p;
}
export function restorePhotos(raw){
 if(!Array.isArray(raw))return[];const state={photoArchive:[],photoSequence:1};
 for(const p of raw.slice(-PHOTO_LIMIT))if(validPhoto(p))recordPhoto(state,p);
 return state.photoArchive;
}
