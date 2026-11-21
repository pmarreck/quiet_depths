import { mkdir, readdir, cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = process.argv[2];
if (!output) throw new Error('A fresh output directory is required');
const provenance = JSON.parse(process.argv[3]);
const buildNumber = provenance.status === 'verified'
  ? `r${provenance.baseCommitCount}`
  : 'Build number unavailable';

for (const name of await readdir('src')) {
  if (!name.endsWith('.js')) continue;
  const file = 'src/' + name;
  const result = spawnSync(process.execPath, ['--check',file], {stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
await mkdir(output);
await cp('src', output, { recursive: true });
await cp('vendor', join(output, 'vendor'), { recursive: true });
const index = join(output, 'index.html');
const html = await readFile(index, 'utf8');
const buildNumberElement = '<span id="briefing-build">Build number unavailable</span>';
if (!html.includes(buildNumberElement)) throw new Error('The briefing is missing its build number field');
const title=provenance.status==='verified'?` title="${provenance.revision}"`:'';
await writeFile(index, html.replace(buildNumberElement, `<span id="briefing-build"${title}>${buildNumber}</span>`));
await writeFile(join(output, 'build-provenance.json'), JSON.stringify(provenance) + '\n', { flag: 'wx' });
console.log('Built static game');
