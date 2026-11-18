import { mkdir, copyFile, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const file of ['src/app.js','src/scene.js','src/sim.js']) {
  const result = spawnSync(process.execPath, ['--check',file], {stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'sim.js', 'scene.js']) await copyFile('src/' + file, 'dist/' + file);
await cp('vendor', 'dist/vendor', { recursive: true });
console.log('Built static game in dist/');
