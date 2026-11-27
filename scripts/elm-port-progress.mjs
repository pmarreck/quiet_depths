#!/usr/bin/env node
// How much of the simulation is mirrored in Elm, by code lines (comments and
// blank lines aside), and the largest modules still to port. A module counts
// once its first line names its Elm twin. The mission catalog is generated
// from Elm already and is left out.
import {simulationModules} from '../tests/sim-modules.mjs';

const modules = simulationModules();
modules.delete('mission-catalog');
const codeLines = code => code.split('\n').filter(line => line.trim() && !/^\s*\/\//.test(line)).length;
let total = 0, mirrored = 0;
const remaining = [];
for (const [name, code] of modules) {
  const lines = codeLines(code);
  total += lines;
  if (code.startsWith('// Mirrored in elm/Sim/')) mirrored += lines;
  else remaining.push([name, lines]);
}
console.log(`${modules.size - remaining.length} of ${modules.size} modules, ${mirrored} of ${total} code lines (${(100 * mirrored / total).toFixed(1)}%) mirrored in Elm`);
console.log('largest remaining: ' + remaining.sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, lines]) => `${name} ${lines}`).join(', '));
