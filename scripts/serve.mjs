import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('A built site directory is required');
const root = resolve(output);
if(process.argv[3]==='--about'){
  const {releaseVersion,revision}=JSON.parse(await readFile(resolve(root,'build-provenance.json'),'utf8'));
  const os={linux:'linux',darwin:'macos',win32:'mswin'}[process.platform];
  const arch={x64:'amd64',arm64:'arm64'}[process.arch];
  if(!os||!arch)throw new Error('Unsupported preview platform');
  console.log(`Quiet Depths ${releaseVersion} | ${revision??'Build revision unavailable'} | Browser submarine game preview | PF=${os}-${arch}`);
  process.exit(0);
}
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg', '.wav':'audio/wav', '.ttf':'font/ttf', '.wasm':'application/wasm' };
http.createServer(async (req,res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) throw Error('Path');
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    res.end(await readFile(file));
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.error('Preview at http://127.0.0.1:4173'));
