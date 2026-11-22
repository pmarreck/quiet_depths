import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = process.argv[2];
const template = await readFile(process.argv[3], 'utf8');
const files = (await readdir(output, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => join(entry.parentPath, entry.name).slice(output.length + 1))
  .sort();
const hash = createHash('sha256').update(template);
const assets = [];
for (const file of files) {
  const digest = createHash('sha256').update(await readFile(join(output, file))).digest();
  hash.update(JSON.stringify(file));
  hash.update(digest);
  const integrity = 'sha256-' + digest.toString('base64');
  assets.push([file, integrity]);
  if (file === 'index.html') assets.push(['./', integrity]);
}
const source = `const assets = ${JSON.stringify(assets)};\nconst revision = ${JSON.stringify(hash.digest('hex'))};\n${template}`;
await writeFile(join(output, 'service-worker.js'), source, { flag: 'wx' });
