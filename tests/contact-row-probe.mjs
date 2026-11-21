import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {reconcileKeyedChildren} from '../src/ui.js';

// Count key reads on actual rows and contacts. A new scan of every row for
// each contact would be visible even if its output still looked correct.
export function countContactRowReads(size,seed){
 let reads=0;
 const keys=Array.from({length:size},(_,i)=>String(i+seed));
 const items=keys.map((key,i)=>({get id(){reads++;return key;},range:size-i}));
 const children=keys.map(key=>({dataset:{get rowKey(){reads++;return key;}}}));
 const original=children.slice();
 reconcileKeyedChildren({children},items,item=>item.id,()=>assert.fail('existing row replaced'),
  (node,item)=>{node.range=item.range;});
 for(let i=0;i<size;i++){
  assert.equal(children[i],original[i]);
  assert.equal(children[i].range,size-i);
 }
 return reads;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const sizes=process.argv[2].split(',').map(Number),seed=Number(process.argv[3]);
 const rows=sizes.map(size=>({size,samples:{
  operations:Array.from({length:5},()=>countContactRowReads(size,seed))
 }}));
 console.log(JSON.stringify({schema:'performance-measurement/v1',correct:true,
  build_mode:'optimized',runtime:process.version,seed,rows}));
}
