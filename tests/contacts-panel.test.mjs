import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,elm,ui]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/ContactsPanel.elm'),read('typescript/ui.ts')]);

test('the contacts panel is drawn only by its Elm view, in place in the right panel',()=>{
 assert.match(page,/<div id="contacts-panel-root"><\/div>/);
 for(const id of ['contacts','contacts-count','torpedo-tracks'])assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
 assert.doesNotMatch(page,/class="contacts-panel"/);
 for(const id of ['contacts','contacts-count','torpedo-tracks'])assert.match(elm,new RegExp(`id "${id}"`),'the Elm view renders #'+id);
 assert.doesNotMatch(app,/\$\('(contacts|contacts-count|torpedo-tracks)'\)/);
 assert.doesNotMatch(ui,/contactRow|updateContactRow/,'the page no longer builds contact rows');
 assert.match(app,/globalThis\.Elm\.ContactsPanel\.init\(\{node:\$\('contacts-panel-root'\)\}\)/);
 // The stylesheets select the section, #contacts as its child, and each row's parts.
 assert.match(elm,/section \[ class "contacts-panel" \]\n\s+\[ div \[ class "section-heading" \]/);
 assert.match(elm,/\[ span \[ class "contact-icon" \] \[ text c\.icon \]\n\s+, span \[ class "contact-summary" \] \[ strong \[\] \[ text c\.title \], small \[\] \[ text c\.detail \] \]\n\s+, span \[ class "contact-bearing" \] \[ text c\.bearing \]/);
 assert.match(elm,/button\n\s+\[ class "contact-row"\n\s+, classList \[ \( "active", c\.selected \) \]\n\s+, attribute "data-contact" c\.id/);
});

test('an empty list says so, and a selection is the page\'s, turning a working periscope',()=>{
 assert.match(elm,/if List\.isEmpty r\.contacts then\n\s+div \[ id "contacts" \] \[ div \[ class "empty-contacts" \] \[ text "Listening to the dark\.", br \[\] \[\], text "Contacts will appear as you hear them\." \] \]/);
 const handler=app.match(/contactsPanel\.ports\.contactOrder\.subscribe\(\(\{id,seq\}\)=>\{(.*)\}\);/)[1];
 assert.equal(handler,"contactsHandled=Math.max(contactsHandled,seq);selected=id;gunTarget=selected;const c=state.contacts.find(c=>c.id===selected);"+
  "if(c&&view==='scope'&&feedActive(state,'scope')&&canIssue(state,context())){state.scopeSteerBearing=null;state.scopeAngle=relativeBearing(c.bearing,state.heading);}updateUI();");
 assert.ok(app.includes("contactsPanel.ports.contactsReading.send({count:String(s.contacts.length).padStart(2,'0'),contacts:contactModels,tracks,handled:contactsHandled});"));
 // A selection is held until handled.
 assert.match(elm,/if reading\.handled >= model\.seq then/);
 assert.match(elm,/contactOrder \{ id = chosen, seq = model\.seq \+ 1 \}/);
});
