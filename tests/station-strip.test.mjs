import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,strip,caption]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/StationStrip.elm'),read('elm/HelmCaption.elm')]);
const chain=(source,fn,next)=>source.match(new RegExp(`${fn} r =\\n([\\s\\S]*?)\\n\\n\\n${next}`))[1].replace(/\s+/g,' ').trim();
const words=source=>Object.fromEntries([...source.matchAll(/^ {8}(\w+) ->\n {12}"([^"]+)"$/gm)].map(m=>[m[1],m[2]]));

test('the station strip and helm caption are drawn only by their Elm views',()=>{
 assert.match(page,/<div id="station-strip-root"><\/div>/);
 assert.match(page,/<div id="soundings-root"><\/div><div id="helm-caption-root"><\/div>/);
 for(const [id,elm] of [['station-status',strip],['weather',strip],['sim-time',strip],['helm-mode',caption]]){
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
  assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
  assert.doesNotMatch(app,new RegExp(`\\$\\('${id}'\\)`),'app.js must not write #'+id+' directly');
 }
 assert.ok(app.includes(' stationStrip.ports.stationReading.send(stationReading(s,env,clock));'));
 assert.ok(app.includes(" helmCaption.ports.helmCaptionReading.send({drone,mode:drone?String(v.mode):''});"));
});

test('the station status names the first condition that applies',()=>{
 assert.equal(chain(strip,'station','stationText'),'if r.bottomed then Bottomed else if r.surfaced then Surfaced else if r.depth <= 15 then PeriscopeDepth else if r.silent then SilentRunning else Submerged');
 assert.deepEqual(words(strip),{Bottomed:'RESTING ON THE BOTTOM',Surfaced:'SURFACED · EXPOSED',PeriscopeDepth:'PERISCOPE DEPTH',SilentRunning:'SILENT RUNNING',Submerged:'SUBMERGED'});
});

test('the helm caption names whose helm it is',()=>{
 assert.equal(chain(caption,'helm','helmText'),'if not r.drone then Submarine else if r.mode == "remote" then DroneRemote else if r.mode == "return" then DroneReturning else DroneOffline');
 assert.deepEqual(words(caption),{Submarine:'SUBMARINE HELM',DroneRemote:'DRONE HELM',DroneReturning:'DRONE · AUTO RETURN',DroneOffline:'DRONE · OFFLINE'});
});
