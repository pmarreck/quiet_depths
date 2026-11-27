import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/Soundings.elm')]);
const ids=['soundings','below-label','below-keel','water-depth','seabed-advice','wind-value'];

test('the soundings strip is drawn only by its Elm view',()=>{
 assert.match(page,/<div id="helm-status" class="helm-status"><\/div><div id="soundings-root"><\/div><div class="helm-caption">/);
 for(const id of ids){
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
  assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
  assert.doesNotMatch(app,new RegExp(`\\$\\('${id}'\\)`),'app.js must not write #'+id+' directly');
 }
 // The view root keeps the class and label that the strip's styles and landmarks use.
 assert.match(elm,/classList \[ \( "soundings-strip", True \), \( "caution", look\.caution \), \( "danger", look\.danger \) \]/);
 assert.match(elm,/attribute "aria-label" "Seafloor soundings"/);
 assert.match(elm,/span \[ id "seabed-advice", attribute "aria-live" "polite" \]/);
});

test('each frame sends the measured clearance with the figures formatted as before',()=>{
 assert.match(app,/const soundingsStrip=globalThis\.Elm\.Soundings\.init\(\{node:\$\('soundings-root'\)\}\);/);
 assert.ok(app.includes(' soundingsStrip.ports.soundingsReading.send(soundingsReading(seabed,droneSounding,env.wind));'));
});

test('clearance advice keeps its thresholds, wording and styling',()=>{
 const body=elm.match(/clearance below =\n([\s\S]*?)\n\n\nadvice/)[1].replace(/\s+/g,' ');
 assert.match(body,/^ if below < 0 then Contact else if below < 10 then Danger else if below < 30 then Shallow else (-- [^\n]*? )?Clear$/);
 const words=Object.fromEntries([...elm.matchAll(/^ {8}(Clear|Shallow|Danger|Contact) ->\n {12}"([^"]+)"/gm)].map(m=>[m[1],m[2]]));
 assert.deepEqual(words,{Clear:'CLEAR BELOW',Shallow:'SHALLOW CLEARANCE',Danger:'DANGER · RISE',Contact:'BOTTOM CONTACT'});
 const looks=Object.fromEntries([...elm.matchAll(/^ {8}(Clear|Shallow|Danger|Contact) ->\n {12}\{ caution = (True|False), danger = (True|False) \}/gm)].map(m=>[m[1],m.slice(2).join(',')]));
 assert.deepEqual(looks,{Clear:'False,False',Shallow:'True,False',Danger:'True,True',Contact:'True,True'});
});
