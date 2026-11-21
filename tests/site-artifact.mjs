import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Exercise the installed site, including the cache requests made on first install.
const root=process.argv[2];
const read=name=>readFile(join(root,name),'utf8');
const info=JSON.parse(await read('build-provenance.json'));
const html=await read('index.html');
const badges=[...html.matchAll(/<span id="briefing-build"(?: title="([^"]*)")?>([^<]*)<\/span>/g)].map(match=>[match[2],match[1]]);
assert.equal(info.releaseVersion,JSON.parse(await readFile(new URL('../package.json',import.meta.url))).version);
if(info.status==='verified'){
 assert.match(info.commit,/^[a-f0-9]{40}$/);
 assert.match(info.firstParentBase,/^[a-f0-9]{40}$/);
 assert.ok(Number.isSafeInteger(info.baseCommitCount)&&info.baseCommitCount>0);
 const expected='r'+info.baseCommitCount+'-'+info.commit.slice(0,6);
 assert.equal(info.revision,expected);
 assert.deepEqual(badges,[['r'+info.baseCommitCount,expected]],'the short briefing label and full tooltip must identify the same build');
}else{
 assert.ok(['dirty','unavailable'].includes(info.status));
 assert.equal(info.revision,null);
 assert.deepEqual(badges,[['Build number unavailable',undefined]]);
}

const files=(await readdir(root,{recursive:true,withFileTypes:true})).filter(f=>f.isFile())
 .map(f=>relative(root,join(f.parentPath,f.name)));
const scope='https://example.invalid/game/';
const handlers=new Map();
let requested;
vm.runInNewContext(await read('service-worker.js'),{
 self:{registration:{scope},addEventListener:(event,handler)=>handlers.set(event,handler)},
 URL,Request,caches:{open:async()=>({addAll:requests=>{requested=Array.from(requests,r=>r.url);}})}
});
let install;
handlers.get('install')({waitUntil:result=>{install=result;}});
await install;
// The browser fetches the worker itself independently of the asset cache.
assert.deepEqual(requested.sort(),[scope,...files.filter(f=>f!=='service-worker.js').map(f=>new URL(f,scope).href)].sort());
for(const name of ['mission-picker.js','app.js','manifest.webmanifest','LICENSE'])assert.ok(files.includes(name),name);

const about=execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/serve.mjs',import.meta.url)),root,'--about'],{
 encoding:'utf8',env:{...process.env,PF:'unrelated-platform'}
}).trim();
const os={linux:'linux',darwin:'macos',win32:'mswin'}[process.platform],arch={x64:'amd64',arm64:'arm64'}[process.arch];
assert.equal(about,`Quiet Depths ${info.releaseVersion} | ${info.revision??'Build revision unavailable'} | Browser submarine game preview | PF=${os}-${arch}`);
