const given=['Barnaby','Bubbles','Dottie','Mabel','Monty','Nell','Otis','Pip'];
const surnames=['Barnacle','Bilgewater','Flounder','Haddock','Keelhaul','Puddles','Saltbottom','Wobblefin'];
export const captainPreference='quiet-depths-captain-v1';
export const outcomePrefix='quiet-depths-patrol-outcome-v1:';
export function captainName(value:unknown):string {
  return typeof value==='string'?Array.from(value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/^(?:captain\b[.\s]*)+/i,'').replace(/\s+/g,' ').trim()).slice(0,48).join(''):'';
}
export function humorousName(seed:number) {
  return given[(seed>>>0)%given.length]+' '+surnames[Math.floor((seed>>>0)/given.length)%surnames.length];
}
export function patrolCaptain(s:{captain?:string;patrol:{seed:number}}){
  return captainName(s.captain)||humorousName(s.patrol.seed);
}
// Patrols predating the per-run ID have only their mission and seed for identity.
export function legacyPatrolId(s:{mission:string;patrol:{seed:number}}){
  let hash=2166136261;
  for(const ch of s.mission)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  return '0000000000000000'+(hash>>>0).toString(16).padStart(8,'0')+(s.patrol.seed>>>0).toString(16).padStart(8,'0');
}
export function transferFilename(name:string,mission?:string){
  const part=(s:string)=>s.normalize('NFC').replace(/[^\p{L}\p{N}\p{M}]+/gu,'_').replace(/^_+|_+$/g,'');
  return 'Captain_'+(part(name)||'Skipper')+(mission?'-'+(part(mission)||'Patrol')+'.qdsave.json':'.qdstate.json');
}
// A patrol ended early with part of its objective met is a partial success:
// not won, and kept apart from failures.
interface Outcome {captain:string;won:boolean;partial?:boolean}
export function validOutcome(row:unknown):row is Outcome {
  if(!row||typeof row!=='object')return false;
  const r=row as Partial<Outcome>;
  return !!r.captain&&r.captain===captainName(r.captain)&&typeof r.won==='boolean'&&
    (r.partial===undefined||typeof r.partial==='boolean'&&!(r.partial&&r.won));
}
export function recordOutcome(storage:Storage,s:{patrolId?:string;captain?:string;patrol:{seed:number};status:string}){
  if(!s.patrolId||s.status==='patrol')return;
  const key=outcomePrefix+s.patrolId;
  const captain=patrolCaptain(s);
  if(storage.getItem(key)===null)storage.setItem(key,JSON.stringify(s.status==='partial'?{captain,won:false,partial:true}:{captain,won:s.status==='won'}));
}
const totals=()=>({completed:0,succeeded:0,partial:0,failed:0});
// Each partial success counts as half a success toward service stars. The
// half credit is never shown; only whole stars are.
export const serviceCredit=(r:{succeeded:number;partial:number}|undefined)=>r?r.succeeded+r.partial/2:0;
export const serviceStars=(successes:number)=>Math.floor(successes/5);
export function starLabel(successes:number){
  const stars=serviceStars(successes);
  return stars?'★ '+stars+(stars===1?' service star':' service stars'):'';
}
export function captainRecords(storage:Storage){
  const fleet=totals(),captains=new Map<string,ReturnType<typeof totals>&{name:string}>();
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);if(!key?.startsWith(outcomePrefix))continue;
    let row;try{row=JSON.parse(storage.getItem(key)??'null');}catch{continue;}
    if(!validOutcome(row))continue;
    const id=row.captain.toLowerCase(),r=captains.get(id)??{...totals(),name:row.captain};
    for(const tally of [fleet,r]){tally.completed++;if(row.won)tally.succeeded++;else if(row.partial)tally.partial++;else tally.failed++;}
    captains.set(id,r);
  }
  return {fleet,captains};
}
