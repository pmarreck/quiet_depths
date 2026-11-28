// Versioned plain JSON. The patrol decoder is shared with the normal Continue path.
import {missions} from './mission-catalog.ts';
import {captainName,captainPreference,outcomePrefix,validOutcome} from './captain.ts';
import {shortcutActions,allowedShortcut} from './shortcuts.ts';
import {difficultyControls} from './difficulty.ts';

export const slotCount=6;
export const transferVersion=1;
export const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validImage=(v:unknown)=>v===''||typeof v==='string'&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
const missionId=(v:unknown)=>missions.some(m=>m.id===v);
type Json=unknown;
type Patrol={status:string;mission:string;patrol:{seed:number};captain?:string};
// The simulation's restore, which answers asynchronously.
type Decoder=(raw:string)=>Promise<Patrol|null>;
type SessionDecoder=(session:unknown)=>void;
export interface PortablePatrol {patrol:Patrol;station:unknown;image:string;label:string}
export interface SlotFile extends PortablePatrol {id:number}
export interface Setup {mission:string;conditions:{timeOfDay:string;weather:string;changing:boolean};seed:string;captain:string;defaultCaptain:string}
export interface Backup {localStorage:Record<string,Json>;slots:SlotFile[];current:PortablePatrol|null;started:boolean;setup:Setup}
export const saveDocument=(save:PortablePatrol)=>({format:'Quiet Depths patrol',version:transferVersion,...save});
export const stateDocument=(state:Backup)=>({format:'Quiet Depths state',version:transferVersion,...state});
const bad=(what:string):never=>{throw new Error('Invalid '+what+'. No changes made.');};
export async function readPatrol(value:unknown,restore:Decoder,checkStation:SessionDecoder,active:boolean):Promise<PortablePatrol>{
  if(!object(value)||!object(value.patrol)||!validImage(value.image)||typeof value.label!=='string'||value.label.length>500)return bad('patrol file');
  const patrol=await restore(JSON.stringify(value.patrol));
  if(!patrol||active&&patrol.status!=='patrol')return bad('patrol snapshot');
  if(value.station!==null)checkStation(value.station);
  return {patrol,station:value.station,image:value.image as string,label:value.label};
}
const safeCount=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const owned=(key:string)=>key.startsWith('quiet-depths-');
export function readStorage(storage:Storage):Record<string,Json>{
  const entries:Record<string,Json>={};
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);if(!key||!owned(key))continue;
    const raw=storage.getItem(key);if(raw!==null)entries[key]=JSON.parse(raw);
  }
  return entries;
}
export function replaceStorage(storage:Storage,entries:Record<string,Json>){
  const keys=Object.keys(entries);
  if(keys.some(key=>!owned(key)))throw new Error('Unrecognized storage key.');
  // Release the old quota before adding a potentially equally large archive.
  const existing:string[]=[];
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k&&owned(k))existing.push(k);}
  for(const k of existing)storage.removeItem(k);
  for(const k of keys)storage.setItem(k,JSON.stringify(entries[k]));
}
async function checkStorage(entries:Record<string,unknown>,restore:Decoder,photo:(p:unknown)=>boolean){
  for(const [k,v] of Object.entries(entries)){
    if(!owned(k))bad('storage key');
    if(k==='quiet-depths-v1'&&(await restore(JSON.stringify(v)))?.status!=='patrol')bad('autosave');
    if(k==='quiet-depths-photos-v1'&&(!Array.isArray(v)||v.length>24||!v.every(photo)))bad('photo archive');
    if(k.startsWith(outcomePrefix)&&(!/^[0-9a-f]{32}$/.test(k.slice(outcomePrefix.length))||!validOutcome(v)))bad('captain record');
    if(k.startsWith('quiet-depths-service-record-v1:')&&(!object(v)||!safeCount(v.ships)||!safeCount(v.submarines)))bad('service record');
    if(k===captainPreference&&(typeof v!=='string'||v!==captainName(v)))bad('captain name');
    if(k==='quiet-depths-invert-rov-pitch'&&typeof v!=='boolean')bad('ROV settings');
    if(k==='quiet-depths-shortcuts-v1'&&(!object(v)||!Object.entries(v).every(([id,key])=>Object.hasOwn(shortcutActions,id)&&allowedShortcut(key))))bad('shortcuts');
    if(k==='quiet-depths-difficulty-v1'&&(!object(v)||!difficultyControls.every(c=>!(c.id in v)||('min' in c?typeof v[c.id]==='number'&&Number(v[c.id])>=c.min&&Number(v[c.id])<=c.max:typeof v[c.id]==='boolean'))))bad('difficulty settings');
    if(k==='quiet-depths-radio-history-v1'&&(!Array.isArray(v)||v.length>2||!v.every(n=>Number.isInteger(n)&&n>=1&&n<=8)))bad('radio history');
  }
}
export async function decodeFile(text:string,kind:'patrol'|'state',restore:Decoder,checkStation:SessionDecoder,photo:(p:unknown)=>boolean){
  const v:unknown=JSON.parse(text);
  if(!object(v)||v.format!=='Quiet Depths '+kind||v.version!==transferVersion)throw new Error('Choose a supported Quiet Depths '+kind+' JSON file (version 1).');
  if(kind==='patrol')return readPatrol(v,restore,checkStation,true);
  const s=v.setup;
  if(!object(s)||!missionId(s.mission)||typeof s.seed!=='string'||typeof s.captain!=='string'||s.captain.length>100||
    typeof s.defaultCaptain!=='string'||!s.defaultCaptain||captainName(s.defaultCaptain)!==s.defaultCaptain||
    !object(s.conditions)||typeof s.conditions.changing!=='boolean'||
    !['random','dawn','day','dusk','night'].includes(String(s.conditions.timeOfDay))||
    !['random','clear','cloudy','rain','storm'].includes(String(s.conditions.weather)))return bad('mission setup');
  if(typeof v.started!=='boolean'||!Array.isArray(v.slots)||v.slots.length>slotCount||!object(v.localStorage))return bad('app backup');
  await checkStorage(v.localStorage,restore,photo);
  const ids=new Set<number>(),slots=[];
  for(const row of v.slots){
    if(!object(row)||typeof row.id!=='number'||!Number.isInteger(row.id)||row.id<1||row.id>slotCount||ids.has(row.id))return bad('save slot');
    ids.add(row.id);slots.push({...await readPatrol(row,restore,checkStation,true),id:row.id});
  }
  const current=v.current===null?null:await readPatrol(v.current,restore,checkStation,false);
  if(v.started&&!current)return bad('live patrol');
  return {started:v.started,current,slots,setup:s as unknown as Setup,localStorage:v.localStorage} satisfies Backup;
}

const views=['scope','tower','gun','drone','chart','sonar','photos','orbit'];
const within=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
export function checkStation(v:unknown,readPaper:(sheet:unknown)=>unknown) {
  if(!object(v)||!views.includes(String(v.view))||!views.slice(0,-1).includes(String(v.previousView))||
    ![1,5,20].includes(Number(v.rate))||typeof v.rate!=='number'||typeof v.paused!=='boolean'||typeof v.sound!=='boolean'||
    !(v.selected===null||typeof v.selected==='string')||!object(v.chart)||![v.chart.x,v.chart.y].every(Number.isFinite)||
    !within(v.chart.zoom,.25,128)||typeof v.chart.follow!=='boolean'||!object(v.zooms)||
    !Object.entries(v.zooms).every(([k,z])=>views.includes(k)&&within(z,1,k==='tower'?48:k==='scope'?4:k==='gun'?5:1))||
    !['bearings','scribbler','painter'].includes(String(v.instrument))||![1500,3000,6000].includes(Number(v.sonarRange))||typeof v.sonarRange!=='number'||
    !object(v.profiles)||!['survey','detail'].includes(String(v.profiles.scribbler))||!['survey','detail'].includes(String(v.profiles.painter))||
    !Array.isArray(v.papers)||v.papers.length>4)return bad('station settings');
  const orbit=v.orbit;
  if(v.view==='orbit'&&!orbit||orbit!==null&&(!object(orbit)||!Number.isFinite(orbit.yaw)||!within(orbit.pitch,-1.28,1.28)||!within(orbit.distance,37,120)))bad('orbit camera');
  const area=v.chart.reconArea;
  if(area!==null&&(!object(area)||![area.x,area.y,area.size].every(Number.isFinite)))bad('chart area');
  const keys=new Set();
  for(const sheet of v.papers){
    if(!object(sheet)||keys.has(String(sheet.mode)+'-'+String(sheet.profile)))bad('sonar sheets');
    readPaper(sheet);keys.add(String(sheet.mode)+'-'+String(sheet.profile));
  }
}

export function downloadJson(name:string,payload:unknown){
  // Sonar archives can contain millions of byte samples. Keep a paper strip
  // compact and readable as one JSON array, without indentation per sample.
  const parts:BlobPart[]=[];
  for(const [key,value] of Object.entries(payload as Record<string,unknown>)){
    const indent=key==='slots'||key==='current'||key==='station'?undefined:2;
    parts.push(parts.length?',\n  ':'{\n  ',JSON.stringify(key),': ',JSON.stringify(value,null,indent));
  }
  parts.push('\n}\n');
  const url=URL.createObjectURL(new Blob(parts,{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
