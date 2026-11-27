import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/TorpedoControl.elm')]);
const fn=(name,next)=>elm.match(new RegExp(`\\n${name} [a-z]+ =\\n([\\s\\S]*?)\\n\\n\\n${next}`))[1].replace(/\s+/g,' ').trim();

test('torpedo control is drawn only by its Elm view, beside the static deck gun controls',()=>{
 assert.match(page,/<section class="weapons"><div id="torpedo-control-root"><\/div><div class="gun-control">/);
 for(const id of ['torp-count','tube-port','tube-starboard','run-limit','run-readout','fire','weapon-hint','torpedo-status'])
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
 for(const id of ['torp-count','run-limit','run-readout','fire','weapon-hint','torpedo-status'])assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
 assert.match(elm,/b \[ id \("tube-" \+\+ tube\.key\), classList \[ \( "ready", state == Ready \) \] \]/);
 assert.doesNotMatch(app,/(\$|bindCommand)\('(torp-count|tube-port|tube-starboard|run-limit|run-readout|fire|weapon-hint|torpedo-status)'/);
 assert.match(app,/globalThis\.Elm\.TorpedoControl\.init\(\{node:\$\('torpedo-control-root'\),flags:\{maxRun:MAX_RUN\}\}\)/);
});

test('every torpedo order has a guarded handler with the rule its control had',()=>{
 assert.deepEqual([...new Set([...elm.matchAll(/torpedoOrder \{ kind = "(\w+)"/g)].map(m=>m[1]))].sort(),['fire','run']);
 const table=app.match(/const torpedoOrders=\{([\s\S]*?)\n\};/)[1];
 const rules=Object.fromEntries([...table.matchAll(/^ (\w+):\{enabled:(.*?),run:(.*)\},?$/gm)].map(m=>[m[1],[m[2],m[3]]]));
 assert.deepEqual(rules,{
  fire:['()=>!!state.contacts.find(c=>c.id===selected)&&operatingFraction(state.systems.tubes)>0&&torpedoTubes(state).next!==null&&state.depth<=100','()=>launchSelected()'],
  run:['()=>true','value=>{state.runSetting=clamp(value,100,MAX_RUN);}'],
 });
 const handler=app.match(/torpedoControl\.ports\.torpedoOrder\.subscribe\(\(\{kind,value,seq\}\)=>\{\n([\s\S]*?)\n\}\);/)[1].split('\n');
 assert.deepEqual(handler,[' torpedoHandled=Math.max(torpedoHandled,seq);',' const command=torpedoOrders[kind];',
  " if(command&&view!=='orbit'&&canIssue(state,context())&&command.enabled())command.run(value);",' updateUI();']);
 assert.ok(app.includes('fireEnabled:able(torpedoOrders.fire.enabled),runEnabled:able(torpedoOrders.run.enabled),handled:torpedoHandled'));
 // A set run is held until handled, as on the helm sliders; a launch claims no new sequence number.
 assert.match(elm,/if reading\.handled >= model\.seq then/);
 assert.match(elm,/torpedoOrder \{ kind = "fire", value = 0, seq = model\.seq \}/);
});

test('tubes and the target hint read as they always have',()=>{
 assert.equal(fn('tubeState','tubeText'),'if tube.offline then Offline else case tube.remaining of Nothing -> Empty Just remaining -> if remaining == 0 then Ready else Reloading remaining');
 assert.match(elm,/Reloading remaining ->\n\s+"Reload " \+\+ String\.fromInt \(ceiling remaining\) \+\+ " s"/);
 assert.equal(fn('hint','tubeView'),'case target of Nothing -> "Select a contact to set firing bearing." Just t -> if t.side == "friendly" then "Confirmed friendly. Hold fire." else if t.probableSide == "friendly" && not t.identified then "Probable friendly. Check identification." else if t.identified && not t.military then "Identified neutral. Hold fire." else "Firing bearing " ++ t.bearing ++ "° true. Seeker may choose another target."');
});
