import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stationHint} from '../src/panel-readings.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [page,app,header,hints]=await Promise.all([read('src/index.html'),read('src/app.js'),read('elm/ViewHeader.elm'),read('elm/ViewHints.elm')]);
const HEADER=['view-label','view-subtitle','lamp-copy','view-tag','bow-readout','sight-bearings','sight-relative','sight-order','compass','look-heading'],HINTS=['view-hint','view-range'];

test('the view header and the line under the view are drawn only by their Elm views',()=>{
 assert.match(page,/<div id="view-header-root"><\/div>/);
 assert.match(page,/<div id="view-hints-root"><\/div>/);
 for(const id of [...HEADER,...HINTS])assert.doesNotMatch(page,new RegExp(`id="${id}"`),'index.html must not keep a static #'+id);
 for(const id of HEADER)assert.match(header,new RegExp(`id "${id}"`),'the header view renders #'+id);
 for(const id of HINTS)assert.match(hints,new RegExp(`id "${id}"`),'the hints view renders #'+id);
 for(const id of [...HEADER,...HINTS])assert.ok(!app.includes(`$('${id}')`),'app.js must not reach #'+id);
 assert.ok(!app.includes("'.compass span'"));
 assert.match(app,/globalThis\.Elm\.ViewHeader\.init\(\{node:\$\('view-header-root'\)\}\),viewHints=globalThis\.Elm\.ViewHints\.init\(\{node:\$\('view-hints-root'\)\}\);/);
 // The structure the stylesheets select: the header's parts, spans directly in the bow readout and the bottom line.
 assert.match(header,/div \[ class "sight-header" \]\n\s+\[ div \[ class "view-top" \]\n\s+\[ div \[\]\n\s+\[ span \[ class "live-dot" \] \[\]/);
 assert.match(header,/small \[ id "lamp-copy", hidden \(not r\.lampShown\) \]/);
 assert.match(header,/div \[ id "bow-readout", class "bow-readout", classList \[ \( "hidden", not r\.bowShown \) \] \]\n\s+\[ span \[ id "sight-bearings" \]/);
 assert.match(header,/div \[ class "compass", id "compass", classList \[ \( "hidden", not r\.compassShown \) \] \] \(List\.map \(\\m -> span \[\] \[ text m \]\) r\.marks\)/);
 assert.match(hints,/div \[ class "view-bottom" \] \[ span \[ id "view-hint" \] \[ text r\.hint \], span \[ id "view-range" \] \[ text r\.range \] \]/);
});

test('each part is worded once, the tower\'s binoculars and the sonar imagers included',()=>{
 assert.ok(app.includes("tower:['CONNING TOWER',active?'BINOCULARS · '+zoom.toFixed(1)+'× · DRAG TO LOOK AROUND':'SURFACE TO GO TOPSIDE']"));
 assert.ok(!app.includes('OPEN BRIDGE'),'the subtitle the binoculars always replaced is gone');
 assert.ok(app.includes("const message=stationLamp(s),lampShown=!!message&&['scope','tower'].includes(view)&&active,rel=((s.scopeAngle+540)%360)-180,imaging=view==='sonar'&&instrument!=='bearings';"));
 assert.ok(app.includes("tag:optical?active?(paused?'FROZEN':'LIVE FEED'):'OFFLINE':view==='chart'?'SECTOR 07':'HEADING UP'"));
 assert.ok(app.includes("bowShown:view==='scope'&&active,"));
 assert.ok(app.includes("compassShown:optical&&active,marks:[-2,-1,0,1,2].map(i=>deg(absLook+i*(drone?15:7.5/zoom))),look:deg(absLook)+'° TRUE'"));
 assert.ok(app.includes("viewHints.ports.hintsReading.send(imaging?{hint:instrument==='scribbler'?'Seafloor strip · newest returns at the top':'Forward sweep · elevation increases upward',range:''}:{hint,range});"));
});

// Each station's line under the view names what that station does; the
// photos station once fell through to the drone's NO DRONE SIGNAL.
test('the line under the view is worded for each station',()=>{
 assert.equal(stationHint('photos',false,0),'NO PHOTOGRAPHS ARCHIVED');
 assert.equal(stationHint('photos',false,3),'SELECT A PHOTOGRAPH TO ENLARGE · NEWEST FIRST');
 assert.deepEqual(['scope','drone'].map(v=>[stationHint(v,true,0),stationHint(v,false,0)]),[['DRAG TO ROTATE SCOPE · WHEEL TO ZOOM','NO OPTICAL SIGNAL'],['CAMERA FIXED TO ROV NOSE','NO DRONE SIGNAL']]);
 assert.deepEqual(['sonar','chart','tower','gun'].map(v=>stationHint(v,false,0)),['BOW AT TOP · CONTACT BEARINGS RELATIVE TO HULL','DRAG TO PAN · WHEEL TO ZOOM · CLICK TO PLOT','DRAG TO LOOK AROUND / DOWN · WHEEL FOR BINOCULARS','DRAG TO AIM · HOLD FIRE / J · WATERLINE HITS CAUSE FLOODING']);
 assert.equal(stationHint('orbit',true,0),'','the orbit camera hides the line');
 assert.equal(stationHint('constructor',true,0),'','only a station has a hint');
 assert.ok(app.includes('const hint=stationHint(view,active,photoArchive(s).length);'));
});
