import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {appleTouchDevice,isHardwareShortcut,offersInstall,showsKeyboardHints,TOUCH_FIRST_QUERY} from '../src/device-profile.js';

const page=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const picker=await readFile(new URL('../elm/MissionPicker.elm',import.meta.url),'utf8');
const css=(await Promise.all(['style.css','controls.css','interface.css','mobile.css','operations.css','warfare.css','atmosphere.css']
 .map(name=>readFile(new URL('../src/'+name,import.meta.url),'utf8')))).join('\n');
const element=(html,open,close)=>{const start=html.indexOf(open);assert.ok(start>=0,'missing '+open);const end=html.indexOf(close,start);assert.ok(end>start,'unclosed '+open);return html.slice(start,end+close.length);};

test('Install Game is offered on phones and tablets, never on desktop or inside the installed app',()=>{
 for(const standalone of [false,true])for(const touchFirst of [false,true])for(const appleTouch of [false,true]){
  const expected=!standalone&&(touchFirst||appleTouch);
  assert.equal(offersInstall({standalone,touchFirst,appleTouch}),expected,JSON.stringify({standalone,touchFirst,appleTouch}));
 }
 assert.equal(TOUCH_FIRST_QUERY,'(hover: none) and (pointer: coarse)');
 assert.match(element(page,'<button id="install-game"','</button>'),/ hidden[ >]/,'the button starts hidden until the device qualifies');
});

test('Apple touch devices are recognized, including iPadOS reporting a desktop browser',()=>{
 const cases=[
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1','iPhone',5,true],
  ['Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1','iPad',5,true],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15','MacIntel',5,true],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15','MacIntel',0,false],
  ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36','Linux armv81',5,false],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36','Win32',10,false],
 ];
 for(const [agent,platform,touches,expected] of cases)assert.equal(appleTouchDevice(agent,platform,touches),expected,platform+' '+touches);
});

test('keyboard hints hide on touch-only devices and return after a hardware shortcut key',()=>{
 assert.equal(showsKeyboardHints(false,false),true);
 assert.equal(showsKeyboardHints(false,true),true);
 assert.equal(showsKeyboardHints(true,false),false);
 assert.equal(showsKeyboardHints(true,true),true);
 const body={tagName:'BODY',isContentEditable:false};
 assert.equal(isHardwareShortcut({isTrusted:true,key:'w',target:body}),true);
 assert.equal(isHardwareShortcut({isTrusted:true,key:'Escape',target:null}),true);
 assert.equal(isHardwareShortcut({isTrusted:false,key:'w',target:body}),false,'scripted events are not a keyboard');
 for(const key of ['Unidentified','Process'])assert.equal(isHardwareShortcut({isTrusted:true,key,target:body}),false,key);
 // Typing a captain name or seed on an on-screen keyboard must not reveal hints.
 for(const tagName of ['INPUT','TEXTAREA','SELECT'])assert.equal(isHardwareShortcut({isTrusted:true,key:'a',target:{tagName,isContentEditable:false}}),false,tagName);
 assert.equal(isHardwareShortcut({isTrusted:true,key:'a',target:{tagName:'DIV',isContentEditable:true}}),false);
});

test('keyboard-only markup is marked so touch-only devices hide it',()=>{
 assert.match(page,/<script type="module" src="device-hints\.js"><\/script>/);
 assert.match(css,/\.touch-only kbd,\.touch-only \.key-only,\.touch-only \.key-guide\{display:none!important\}/);
 assert.match(css,/html:not\(\.touch-only\) \.touch-hint\{display:none\}/);
 assert.match(page,/<span id="rov-key-hint" class="key-only">/);
 assert.match(page,/<button id="briefing-settings" type="button">Settings<\/button>/);

 const settings=element(page,'<dialog id="settings-dialog"','</dialog>');
 assert.match(settings,/<h2 id="settings-title">Settings<\/h2>/);
 const keyboard=element(settings,'<section class="key-only"','</section>');
 for(const id of ['shortcut-status','shortcut-list','reset-shortcuts'])assert.ok(keyboard.includes('id="'+id+'"'),id+' belongs to the keyboard section');
 assert.ok(settings.includes('id="invert-rov-pitch"')&&!keyboard.includes('id="invert-rov-pitch"'),'ROV inversion also applies to touch');

 // Strip what touch-only devices hide; the field guide must not mention keys.
 const guide=element(page,'<dialog id="help-dialog"','</dialog>')
  .replace(/<span class="key-only">.*?<\/span>/g,'').replace(/<p class="key-guide">.*?<\/p>/g,'').replace(/<[^>]+>/g,' ');
 for(const phrase of [/\bEsc\b/,/\bSpace\b/,/\bW\/S\b/,/\bA\/D\b/,/arrows/,/\bor J\b/,/\bwith F\b/,/\bR limits\b/,/\bBy default W\b/])
  assert.doesNotMatch(guide,phrase);
 assert.ok(app.includes('<span class="key-only">Press P to raise it.</span><span class="touch-hint">Choose Raise Scope to raise it.</span>'));
 // The briefing's first orders name the pause key from the current bindings.
 assert.match(picker,/Html\.strong \[ class "key-only" \] \[ text \(model\.pauseKey \+\+ " pauses the patrol\."\) \]/);
});
