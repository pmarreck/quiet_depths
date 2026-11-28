import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/TimeControls.elm')]);

test('the footer\'s time controls are drawn only by their Elm view',()=>{
 assert.match(page,/<div id="time-controls-root"><\/div><\/footer>/);
 assert.doesNotMatch(page,/class="time-controls"|id="save-status"/);
 assert.equal([...page.matchAll(/data-time="/g)].length,1,'only the phone footer\'s rate button stays in the page');
 assert.match(page,/<button id="mobile-time" data-time="1">1×<\/button>/);
 assert.match(elm,/div \[ class "time-controls" \]\n\s+\(span \[\] \[ text "TIME" \]/);
 assert.match(elm,/button \[ attribute "data-time" \(String\.fromInt rate\), classList \[ \( "active", rate == reading\.rate \) \], disabled \(not reading\.enabled\), onClick \(Choose rate\) \]/);
 assert.match(elm,/\+\+ \[ span \[ class "footer-rule" \] \[\], span \[ id "save-status" \] \[ text reading\.save \] \]/);
 assert.match(elm,/rates =\n\s+\[ 1, 5, 20 \]/);
 assert.ok(!app.includes("$('save-status')")&&!app.includes("all('[data-time]')"),'the page no longer reaches the footer\'s rate buttons or save status');
});

test('a chosen rate is checked as a command was, and the page reports rate, permission and autosave',()=>{
 assert.ok(app.includes("timeControls.ports.timeOrder.subscribe(({rate:chosen,seq})=>{timeHandled=Math.max(timeHandled,seq);if(view!=='orbit'&&canIssue(state,context()))setRate(chosen);sendTime();updateUI();});"));
 assert.ok(app.includes("function sendTime(){timeControls.ports.timeReading.send({rate,enabled:canIssue(state,context()),save:saveStatus,handled:timeHandled});}"));
 assert.match(app,/function setRate\(r\)\{rate=r;\$\('mobile-time'\)\.classList\.toggle\('active',r===1\);.*sendTime\(\);\}/);
 assert.ok(app.includes("bindCommand('mobile-time','click',()=>setRate(rate===1?5:rate===5?20:1));"));
 assert.ok(app.includes(" saveStatus=warning||'PATROL SAVED';sendTime();\n if(!warning)saveStatusTimer=setTimeout(()=>{saveStatus='LOCAL AUTOSAVE';sendTime();},1400);"));
 assert.match(elm,/if reading\.handled >= model\.seq then/);
 assert.match(elm,/timeOrder \{ rate = rate, seq = model\.seq \+ 1 \}/);
});
