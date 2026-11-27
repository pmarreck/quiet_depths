import {readFileSync} from 'node:fs';

// The TypeScript modules the simulation reaches from sim.ts through value
// imports and re-exports (type-only imports carry no code), with their source.
export function simulationModules() {
  const source = name => readFileSync(new URL(`../typescript/${name}.ts`, import.meta.url), 'utf8');
  const modules = new Map(), pending = ['sim'];
  while (pending.length) {
    const name = pending.pop();
    if (modules.has(name)) continue;
    modules.set(name, source(name));
    for (const [, next] of modules.get(name).matchAll(/^(?:import|export) (?!type)[^;]*from '\.\/([a-z0-9-]+)\.ts'/gm)) pending.push(next);
  }
  return modules;
}
