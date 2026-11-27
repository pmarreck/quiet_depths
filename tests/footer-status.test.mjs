import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/FooterStatus.elm')]);

test('the bottom bar status group is drawn only by its Elm view',()=>{
 assert.match(page,/<footer class="bottom-bar"><div id="footer-status-root"><\/div><div class="mobile-footer-actions">/);
 for(const id of ['alert-dot','alert-label','noise-value','clearance']){
  assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
  assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
  assert.doesNotMatch(app,new RegExp(`\\$\\('${id}'\\)`),'app.js must not write #'+id+' directly');
 }
 assert.ok(app.includes(' footerStatus.ports.footerReading.send(footerReading(s,getSoundings(s).belowKeel));'));
});

test('suspicion shows only when the patrol allows it, and reads red above 30%',()=>{
 assert.equal(elm.match(/alertColor r =\n([\s\S]*?)\n\n\n/)[1].replace(/\s+/g,' ').trim(),'if r.alert > 30 then "var(--red)" else "var(--green)"');
 assert.match(elm,/span \[ id "alert-dot", class "status-light", hidden \(not r\.show\), style "background" \(alertColor r\) \]/);
 assert.match(elm,/b \[ id "alert-label", hidden \(not r\.show\), style "color" \(alertColor r\) \]/);
});
