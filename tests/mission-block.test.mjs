import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/MissionBlock.elm')]);
const body=(fn,next)=>elm.match(new RegExp(`\\n${fn} r =\\n([\\s\\S]*?)\\n\\n\\n${next}`))[1].replace(/\s+/g,' ').trim();

test('the mission block is drawn only by its Elm view',()=>{
 assert.match(page,/<div id="mission-block-root"><\/div>/);
 for(const id of ['mission-type','mission-name','mission-desc','objective-label','objective-text','progress','home-distance']){
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
  assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
  assert.doesNotMatch(app,new RegExp(`\\$\\('${id}'\\)`),'app.js must not write #'+id+' directly');
 }
 assert.doesNotMatch(app,/querySelector\('\.extraction'\)/);
 assert.match(elm,/div \[ class "extraction", hidden r\.convoy \]/);
 assert.ok(app.includes(' missionBlock.ports.missionReading.send(missionReading(s,m,objective,extract,pickup));'));
});

test('pickup and the return home replace the objective in their established order',()=>{
 assert.equal(body('objectiveLabel','objectiveText'),'if r.pickup then "SURFACE FOR PICKUP" else if r.returning then "RETURN TO EXTRACTION" else r.objectiveLabel');
 assert.equal(body('objectiveText','progress'),'if r.pickup then "Request 0 m and wait until surfaced" else if r.returning then "Reach the green circle and surface" else r.objectiveText');
 assert.equal(body('progress','summary'),'if r.returning then "✓" else r.objectiveProgress');
 assert.equal(body('summary','\\{-\\|'),'if r.returning then [ text "Your work is done. Bring everyone home." ] else [ text r.short ]');
 assert.match(elm,/closingWords =\n\s+\[ "observation", "home", "through" \]/);
});
