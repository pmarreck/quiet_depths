import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/ResourcePanel.elm')]);

test('the resource gauges are drawn only by their Elm view',()=>{
 assert.match(page,/<div id="resources-root"><\/div>/);
 for(const key of ['battery','oxygen','fuel'])for(const part of ['value','bar'])
  assert.doesNotMatch(page,new RegExp(`id="${key}-${part}"`),`index.html must not keep a static #${key}-${part}`);
 assert.match(elm,/b \[ id \(g\.key \+\+ "-value"\), style "color" \(levelColor g\.level\) \]/);
 assert.match(elm,/i \[ id \(g\.key \+\+ "-bar"\), style "width" \(String\.fromFloat g\.level \+\+ "%"\) \]/);
 assert.doesNotMatch(app,/\$\(id\+'-(value|bar)'\)/);
 assert.ok(app.includes(' resourcePanel.ports.resourceReading.send(resourceReading(s));'));
});

test('a store below 20% reads red, and each gauge keeps its label',()=>{
 assert.equal(elm.match(/levelColor level =\n([\s\S]*?)\n\n\n/)[1].replace(/\s+/g,' ').trim(),'if level < 20 then "var(--red)" else ""');
 const labels=Object.fromEntries([...elm.matchAll(/^ {8}("\w+"|_) ->\n {12}"([^"]+)"$/gm)].map(m=>[m[1],m[2]]));
 assert.deepEqual(labels,{'"battery"':'▰ \\u{00A0} BATTERY','"oxygen"':'◌ \\u{00A0} OXYGEN',_:'◒ \\u{00A0} DIESEL FUEL'});
});
