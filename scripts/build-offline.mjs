import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = process.argv[2];
const template = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8');
const files = (await readdir(output, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => join(entry.parentPath, entry.name).slice(output.length + 1))
  .sort();
const hash = createHash('sha256').update(template);
for (const file of files) {
  hash.update(JSON.stringify(file));
  hash.update(createHash('sha256').update(await readFile(join(output, file))).digest());
}
const source = `const assets = ${JSON.stringify(['./', ...files])};\nconst revision = ${JSON.stringify(hash.digest('hex'))};\n${template}`;
await writeFile(join(output, 'service-worker.js'), source, { flag: 'wx' });
