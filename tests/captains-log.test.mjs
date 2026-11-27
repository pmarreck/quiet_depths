import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/CaptainsLog.elm')]);

test('the captain’s log is drawn only by its Elm view, as a keyed list',()=>{
 assert.match(page,/<div id="drone-bay-root"><\/div><\/div><div id="captains-log-root"><\/div>/);
 for(const id of ['log','log-count']){
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
  assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
 }
 assert.match(elm,/Keyed\.node "div"\n\s+\[ id "log", attribute "role" "log", attribute "aria-label" "Captain’s log entries", tabindex 0 \]/);
 assert.match(elm,/\( entry\.key\n\s+, div \[ class \("log-entry " \+\+ entry\.kind\) \] \[ node "time" \[\] \[ text entry\.time \], span \[\] \[ text entry\.text \] \]/);
 assert.match(elm,/section \[ class "log-panel" \]/);
});

test('the page sends the log only when it changes and keeps a reader at the top there',()=>{
 const fn=app.match(/function updatePatrolLog\(events\)\{\n([\s\S]*?)\n\}/)[1].split('\n').filter(l=>!l.trim().startsWith('//'));
 assert.deepEqual(fn,[
  ' if(events[0]===lastLogHead&&events.length===lastLogCount)return;',
  ' lastLogHead=events[0];lastLogCount=events.length;',
  " const atTop=$('log').scrollTop===0;",
  ' captainsLog.ports.logReading.send(logReading(events,logKey));',
  " if(atTop)requestAnimationFrame(()=>{$('log').scrollTop=0;});",
 ]);
 assert.ok(app.includes('const logKey=event=>{if(!logKeys.has(event))logKeys.set(event,++logSequence);return logKeys.get(event);};'));
});
