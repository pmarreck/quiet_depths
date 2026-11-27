// Run the optimized Elm exporter at build time so patrol ticks never wait on a port.
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const context = {setTimeout, clearTimeout};
runInNewContext(await readFile(process.argv[2], 'utf8'), context);
const app = context.Elm.ExportPatrolMissions.init({flags:null});
const {missions, patrol, encounters} = await new Promise(resolve => app.ports.catalog.subscribe(resolve));
console.log('// Generated from elm/PatrolMission.elm by the Nix build.');
console.log('export const missions = [');
for (const mission of missions) console.log('  ' + JSON.stringify(mission) + ',');
console.log('] as const;');
console.log('export const patrol = ' + JSON.stringify(patrol) + ' as const;');
console.log('export const encounters = ' + JSON.stringify(encounters) + ' as const;');
