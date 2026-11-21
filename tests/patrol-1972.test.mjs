import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGame,step,MISSIONS,save,restore,bottom,contact,fire} from '../src/sim.js';
import {objectiveState,parsePatrolSeed,patrolSetup} from '../src/missions.js';
import * as controls from '../src/controls.js';
import * as THREE from '../vendor/three.module.js';
import * as acoustics from '../src/acoustics.js';
import * as combat from '../src/combat.js';
import {propellerState} from '../src/mechanics.js';
const live={view:'scope',paused:false,modal:false};

test('the setup recovered from a played and restored patrol reproduces its entire initial state',()=>{
 for(const {id} of MISSIONS)for(const seed of [0,1983,4294967295]){
  const original=createGame(id,seed,{timeOfDay:'random',weather:seed?'rain':'random',changing:seed===0,difficulty:{orbitCamera:true,drone:false}});
  const progressed=restore(save(original));step(progressed,8);
  const setup=patrolSetup(restore(save(progressed)));
  assert.deepEqual(createGame(setup.mission,setup.seed,setup.options),original);
 }
});

test('patrol seeds distinguish random selection, exact decimal values, and invalid input',()=>{
 assert.equal(parsePatrolSeed(''),null);
 assert.equal(parsePatrolSeed('  '),null);
 for(const [input,expected] of [['0',0],['0000000042',42],[' 123 ',123],['4294967295',4294967295]]){
  assert.equal(parsePatrolSeed(input),expected);
 }
 for(const input of ['-1','1.0','1e2','0x10','12foo','00000000000','4294967296','9999999999']){
  assert.equal(parsePatrolSeed(input),undefined,input);
 }
});

test('every statically required application control exists in the HTML exactly once',async()=>{
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8'),app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'HTML IDs must be unique');
 const required=new Set([...app.matchAll(/(?:\$\(|bindCommand\()'([^']+)'/g)].map(m=>m[1]));
 for(const id of required)assert.ok(ids.includes(id),`missing required UI control: ${id}`);
});

test('each modal takes its accessible name from its own heading',async()=>{
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 const dialogs=[...html.matchAll(/<dialog\s+([^>]+)>([\s\S]*?)<\/dialog>/g)];
 assert.ok(dialogs.length>0);
 for(const [,attributes,content] of dialogs){
  const label=/\baria-labelledby="([^"]+)"/.exec(attributes)?.[1];
  assert.ok(label&&content.includes(`<h2 id="${label}">`),attributes);
 }
});

test('aircraft engines approach spatially and become quieter and muffled below the surface',()=>{
 assert.equal(typeof acoustics.aircraftSound,'function');
 const plane={x:0,y:600,altitude:100,hull:100,speed:70},listener={x:0,y:0,depth:0,heading:270};
 const near=acoustics.aircraftSound(plane,listener),far=acoustics.aircraftSound({...plane,y:2400},listener),deep=acoustics.aircraftSound(plane,{...listener,depth:100});
 assert.ok(near.gain>far.gain&&far.gain>0);assert.ok(deep.gain<near.gain&&deep.cutoff<near.cutoff);assert.ok(near.pan>.9);
 assert.equal(acoustics.aircraftSound({...plane,hull:0},listener).gain,0);
});
test('falling bombs cross the surface before sinking to the fuse depth',()=>{
 assert.equal(typeof combat.chargeAltitude,'function');
 const bomb={airTime:3,airHeight:90,totalDelay:8,depth:30,exploded:false};
 const altitude=elapsed=>combat.chargeAltitude({...bomb,delay:8-elapsed});
 assert.equal(altitude(0),90);assert.ok(altitude(1.5)>0);assert.equal(altitude(3),0);assert.equal(altitude(5.5),-15);assert.equal(altitude(8),-30);
 assert.equal(combat.chargeAltitude({depth:60,totalDelay:10,delay:5,exploded:false}),-30);
});
test('cavitation pressure uses the radius of the rendered propeller',async()=>{
 const {SUB_DESIGN:d}=await import('../src/hull-design.js'),p=propellerState(12,20);
 const expected=(101325+1025*9.81*(20-d.propellerRadius)-2300)/(.5*1025*((12*.514444)**2+(p.rpm*Math.PI/30*d.propellerRadius)**2));
 assert.ok(Math.abs(p.sigma-expected)<1e-10);
});

test('every patrol carries defensive torpedoes, including survey and surveillance',()=>{
 for(const m of MISSIONS)assert.ok(createGame(m.id,19).torps>0,m.id);
});
test('every mission gets reproducible but varied locations, traffic and extraction',()=>{
 for(const m of MISSIONS){const layouts=new Set();for(let seed=1;seed<=20;seed++){
  const s=createGame(m.id,seed),same=createGame(m.id,seed);assert.deepEqual(s,same);
  layouts.add(JSON.stringify([s.x,s.y,s.heading,s.home,s.site,s.ships.map(v=>[v.x,v.y,v.heading,v.speed])]));
  assert.ok(bottom(s.x,s.y)>s.depth+5,'start must clear bottom');assert.ok(bottom(s.home.x,s.home.y)>10,'pickup must be water');
 }assert.ok(layouts.size>=16,`${m.id}: ${layouts.size} different layouts`);}
});
test('briefed mission parameters vary and persist without rerolling a loaded patrol',()=>{
 const goals=new Set();for(let seed=1;seed<=20;seed++){const s=createGame('recon',seed);assert.equal(s.patrol.seed,seed);assert.ok(s.patrol.photoGoal>=2);assert.ok(s.ships.filter(v=>v.kind==='merchant').length>=s.patrol.photoGoal);goals.add(s.patrol.photoGoal);assert.deepEqual(restore(save(s)),s);}assert.ok(goals.size>1);
});
test('Seek and Destroy briefs an undiscovered convoy of three military transports',()=>{
 assert.ok(MISSIONS.some(m=>m.id==='seek-and-destroy'&&m.type==='SEEK AND DESTROY'));
 for(const seed of [1,19,31,32768]){
  const s=createGame('seek-and-destroy',seed);
  const transports=s.ships.filter(v=>v.kind==='merchant');
  assert.equal(transports.length,3);
  assert.ok(transports.every(v=>v.military&&v.hull>0));
  assert.ok(s.ships.some(v=>v.kind==='escort'&&v.military));
  assert.ok(s.ships.some(v=>v.kind==='fishing'&&!v.military));
  assert.deepEqual(s.contacts,[]);
  assert.equal(objectiveState(s).progress,'0/3');
  assert.equal(createGame('intercept',seed).ships.filter(v=>v.kind==='merchant'&&v.military).length,1);
 }
});
test('Seek and Destroy preserves partial progress and requires the last transport and surfaced pickup',()=>{
 const s=createGame('seek-and-destroy',31,{timeOfDay:'day',weather:'clear',changing:false});
 assert.equal(s.mission,'seek-and-destroy');
 const [first,second,last]=s.ships.filter(v=>v.kind==='merchant');
 first.hull=second.hull=0;
 for(const ship of s.ships.filter(v=>v.kind==='escort'||v.kind==='sub'))ship.hull=0;
 Object.assign(last,{disabled:true,x:s.x,y:s.y+400,heading:0,speed:0});
 Object.assign(s,{speed:0,targetSpeed:0});
 step(s,.25);
 assert.equal(s.phase,'objective');
 assert.equal(objectiveState(s).progress,'2/3');
 const resumed=restore(save(s));
 assert.deepEqual(resumed,s);
 assert.equal(restore(save({...s,phase:'extract'})),null);
 const incomplete=structuredClone(s);
 incomplete.ships.splice(incomplete.ships.indexOf(incomplete.ships.find(v=>v.id===last.id)),1);
 assert.equal(restore(save(incomplete)),null);

 contact(resumed,resumed.ships.find(v=>v.id===last.id),'active');
 assert.ok(fire(resumed,last.id));
 step(resumed,30);
 assert.equal(objectiveState(resumed).progress,'3/3');
 assert.equal(resumed.phase,'extract');
 assert.equal(resumed.status,'patrol');
 Object.assign(resumed,{...resumed.home,depth:10,targetDepth:10});
 step(resumed,.25);
 assert.equal(resumed.status,'patrol');
 Object.assign(resumed,{depth:0,targetDepth:0});
 step(resumed,.25);
 assert.equal(resumed.status,'won');
});
test('scope bow alignment is explicit, wraps correctly and preserves the boat’s actual heading',()=>{
 assert.equal(typeof controls.alignScope,'function');
 for(const heading of [0,45,179,270,359])for(const angle of [20,90,180,340]){
  const s=createGame();s.heading=s.targetHeading=heading;s.scopeAngle=angle;
  assert.ok(controls.alignScope(s,live,'center'));assert.equal(s.scopeAngle,0);assert.equal(s.heading,heading);
  s.scopeAngle=angle;const look=controls.scopeBearing(s);assert.ok(controls.alignScope(s,live,'helm-to-scope'));assert.equal(s.targetHeading,look);assert.equal(s.heading,heading);
  step(s,2);assert.ok(Math.abs(((controls.scopeBearing(s)-look+540)%360)-180)<.01,'view holds the commanded bearing while the hull turns');
 }
});
test('offline and paused optics cannot issue alignment orders',()=>{
 assert.equal(typeof controls.alignScope,'function');for(const ctx of [{...live,paused:true},{...live,modal:true}]){const s=createGame(),before=save(s);assert.equal(controls.alignScope(s,ctx,'helm-to-scope'),false);assert.equal(save(s),before);}
 const s=createGame();s.scope=false;assert.equal(controls.alignScope(s,live,'center'),false);
});
test('public game copy uses 1972 and never prescribes a bedtime use',async()=>{
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');assert.ok(html.includes('1972'));assert.ok(!/1968|before bed|bedtime/i.test(html));
});
test('revised propeller is dark, compact, and derived from the hull design',async()=>{
 let module;try{module=await import('../src/hull-design.js');}catch{}
 assert.ok(module,'shared researched hull design must exist');const d=module.SUB_DESIGN;assert.equal(d.year,1972);assert.equal(d.propellerColor,d.hullColor);assert.ok(d.propellerRadius*2<d.hullRadius*1.1);assert.ok(d.propellerRadius<2.5);assert.ok(d.stations.length>=8);assert.ok(d.stations.at(-1).radius<d.hullRadius*.2,'stern tapers into the shaft');
});
test('the actual rendered submarine has a tapered hull and a compact, matching propeller',async()=>{
 let module;try{module=await import('../src/submarine-model.js');}catch{}assert.ok(module,'the renderer must use the tested model');
 const model=module.createSubmarine(THREE),body=model.userData.hull,prop=model.userData.prop;
 const size=o=>new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
 assert.ok(size(body).z>60&&size(body).z<75);assert.ok(size(prop).x<size(body).x*.55);assert.ok(size(prop).y<size(body).y*.55);
 prop.traverse(o=>{if(o.isMesh)assert.ok(o.material.color.equals(body.material.color),'propeller material must match the hull');});
 const positions=body.geometry.attributes.position;let sternRadius=0;for(let i=0;i<positions.count;i++)if(positions.getZ(i)>29)sternRadius=Math.max(sternRadius,Math.hypot(positions.getX(i),positions.getY(i)));assert.ok(sternRadius<2,'stern tapers around its shaft');
});
test('touch inputs support simultaneous steering and speed, release and cancellation',async()=>{
 let module;try{module=await import('../src/input.js');}catch{}assert.ok(module,'input state must be shared by touch and keyboard');const h=new module.HeldInput();
 h.press('finger1','KeyW');h.press('finger2','KeyD');assert.deepEqual([...h.keys].sort(),['KeyD','KeyW']);h.release('finger1');assert.deepEqual([...h.keys],['KeyD']);h.clear();assert.equal(h.keys.size,0);
 h.press('keyboard','KeyW');h.press('finger','KeyW');h.release('keyboard');assert.ok(h.keys.has('KeyW'),'releasing one input must preserve another held input');h.release('finger');assert.equal(h.keys.size,0);
});

test('Home Screen, favicon and manifest icons resolve to PNGs of their declared sizes',async()=>{
 const page=new URL('../src/index.html',import.meta.url);
 const html=await readFile(page,'utf8');
 const head=html.slice(0,html.indexOf('</head>'));
 const links=Array.from(head.matchAll(/<link\b[^>]*>/g),([tag])=>
  Object.fromEntries(Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g),([,key,value])=>[key,value])));
 const touch=links.find(link=>link.rel==='apple-touch-icon'),favicon=links.find(link=>link.rel==='icon');
 assert.equal(touch?.sizes,'180x180');
 const manifestUrl=new URL(links.find(link=>link.rel==='manifest').href,page);
 const manifest=JSON.parse(await readFile(manifestUrl,'utf8'));
 assert.ok(manifest.icons.length>0);
 const images=[[page,touch.href,touch.sizes],[page,favicon.href,favicon.sizes],
  ...manifest.icons.map(icon=>[manifestUrl,icon.src,icon.sizes])];
 for(const [base,path,size] of images){
  const png=await readFile(new URL(path,base));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a',path);
  assert.equal(png.readUInt32BE(16)+'x'+png.readUInt32BE(20),size,path);
 }
});
