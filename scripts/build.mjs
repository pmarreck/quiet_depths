import { mkdir, readdir, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const name of await readdir('src')) {
  if (!name.endsWith('.js')) continue;
  const file = 'src/' + name;
  const result = spawnSync(process.execPath, ['--check',file], {stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
await mkdir('dist', { recursive: true });
await cp('src', 'dist', { recursive: true });
await cp('vendor', 'dist/vendor', { recursive: true });
console.log('Built static game in dist/');
