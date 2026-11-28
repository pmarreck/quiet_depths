import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm,mobile,torpedo]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/GunControl.elm'),read('src/mobile.css'),read('elm/TorpedoControl.elm')]);

test('the deck gun and noisemaker are drawn only by their Elm view, beside torpedo control',()=>{
 assert.match(page,/<section class="weapons"><div id="torpedo-control-root"><\/div><div id="gun-control-root"><\/div><\/section>/);
 for(const id of ['gun-ammo','gun-target','open-gun','decoy','decoy-count'])
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
 for(const id of ['gun-ammo','gun-target','open-gun','decoy','decoy-count'])assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
 assert.doesNotMatch(app,/(\$|bindCommand)\('(gun-ammo|gun-target|open-gun|decoy|decoy-count)'/);
 assert.match(app,/globalThis\.Elm\.GunControl\.init\(\{node:\$\('gun-control-root'\)\}\)/);
 // The classes the stylesheets select keep their places.
 assert.match(elm,/div \[ class "gun-control" \]\n\s+\[ div \[ class "section-heading" \]/);
 assert.match(elm,/button \[ id "decoy", class "text-button"/);
});

test('every deck gun order has the rule its control had, and the target is the page\'s own choice',()=>{
 assert.deepEqual([...new Set([...elm.matchAll(/gunOrder \{ kind = "(\w+)"/g)].map(m=>m[1]))].sort(),['decoy','open','target']);
 const table=app.match(/const gunOrders=\{([\s\S]*?)\n\};/)[1];
 const rules=Object.fromEntries([...table.matchAll(/^ (\w+):\{enabled:(.*?),run:(.*)\},?$/gm)].map(m=>[m[1],[m[2],m[3]]]));
 assert.deepEqual(rules,{
  open:['()=>true',"()=>setView('gun')"],
  decoy:['()=>state.decoys>0',"()=>decoy(state).then(away=>{if(away){sound.tone('fire');toast('Noisemaker deployed. Turn away and go quiet.');}})"],
 });
 const handler=app.match(/gunControl\.ports\.gunOrder\.subscribe\(\(\{kind,target,seq\}\)=>\{\n([\s\S]*?)\n\}\);/)[1].split('\n');
 assert.deepEqual(handler,[' gunHandled=Math.max(gunHandled,seq);'," if(kind==='target')gunTarget=target;",' const command=gunOrders[kind];',
  " if(command&&view!=='orbit'&&canIssue(state,context())&&command.enabled())command.run();",' updateUI();']);
 assert.ok(app.includes("openEnabled:able(gunOrders.open.enabled),decoyEnabled:able(gunOrders.decoy.enabled),handled:gunHandled"));
 // The aim command and a contact's selection read and set the same choice.
 assert.match(app,/bindCommand\('aim-gun','click',\(\)=>\{const id=gunTarget,/);
 assert.match(app,/\},\(\)=>view==='gun'&&feedActive\(state,'gun'\)&&!!gunTarget\);/);
 assert.match(app,/contactsPanel\.ports\.contactOrder\.subscribe\(\(\{id,seq\}\)=>\{contactsHandled=Math\.max\(contactsHandled,seq\);selected=id;gunTarget=selected;/);
 assert.ok(app.includes("const wanted=gunTarget||selected||'';gunTarget=options.some(o=>o.id===wanted)?wanted:'';"));
 // A chosen target is held until handled; opening the sight and deploying claim no new sequence number.
 assert.match(elm,/if reading\.handled >= model\.seq then/);
 assert.match(elm,/gunOrder \{ kind = "target", target = chosen, seq = model\.seq \+ 1 \}/);
 assert.match(elm,/gunOrder \{ kind = "open", target = "", seq = model\.seq \}/);
 assert.match(elm,/gunOrder \{ kind = "decoy", target = "", seq = model\.seq \}/);
});

// On a phone, the gun station's contacts drawer shows the deck gun and hides
// torpedo control's heading and tubes, which its Elm view nests in its root.
test('the gun station\'s contacts drawer hides torpedo control\'s heading and tubes',()=>{
 const rule=mobile.match(/([^}]*)\{display:none\}/g).find(r=>r.includes('#torpedo-status'));
 for(const part of ['.torpedo-control>.section-heading','.torpedo-control>.tubes','#fire','#weapon-hint','#torpedo-status'])
  assert.ok(rule.includes('body[data-station=gun][data-drawer=contacts] '+part),part);
 assert.match(torpedo,/div \[ class "torpedo-control" \]\n\s+\[ div \[ class "section-heading" \]/);
 assert.match(torpedo,/, div \[ class "tubes", attribute "aria-label" "Bow tubes"/);
});
