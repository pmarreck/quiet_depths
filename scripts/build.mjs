import { mkdir, readdir, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = process.argv[2];
if (!output) throw new Error('A fresh output directory is required');

for (const name of await readdir('src')) {
  if (!name.endsWith('.js')) continue;
  const file = 'src/' + name;
  const result = spawnSync(process.execPath, ['--check',file], {stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
await mkdir(output);
await cp('src', output, { recursive: true });
await cp('vendor', join(output, 'vendor'), { recursive: true });
console.log('Built static game');
