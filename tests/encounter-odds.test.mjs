import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encounterGroups} from '../src/cold-watch.js';
import {hash01} from '../src/environment.js';

// Reference behavior recorded from r99: four independent seeded chances per
// twelve-hour watch, and a holiday cut to hostile initiative.
test('each watch rolls independent chances for each kind of passing traffic',()=>{
 const odds={friendlySub:.28,hostileSub:.30,friendlySurface:.30,hostileSurface:.30};
 const seen={friendlySub:0,hostileSub:0,friendlySurface:0,hostileSurface:0};
 for(const seed of [0,1972,4294967295,7,31])for(let window=0;window<200;window++){
  const groups=encounterGroups(seed,window);
  Object.keys(odds).forEach((kind,i)=>{
   assert.equal(groups[kind],hash01(seed,81000+100*window+i+1)<odds[kind],`${kind} seed ${seed} window ${window}`);
   seen[kind]+=groups[kind];
  });
 }
 for(const [kind,count] of Object.entries(seen))assert.ok(Math.abs(count/1000-odds[kind])<.05,kind+' rate '+count/1000);
});

test('the Elm patrol definition supplies the encounter odds and holiday restraint',async()=>{
 const {encounterOdds}=await import('../src/cold-watch.js');
 assert.deepEqual(encounterOdds,{friendlySub:.28,hostileSub:.3,friendlySurface:.3,hostileSurface:.3,holidayInitiative:.25});
 // Static documents cannot import the catalog. Edit them when the Elm values change.
 const guide=await readFile(new URL('../README.md',import.meta.url),'utf8');
 assert.ok(guide.includes(`On December 25 and January 1, general hostile tendency is reduced by ${Math.round((1-encounterOdds.holidayInitiative)*100)}%.`));
});
