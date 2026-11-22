export const difficultyControls = [
  {id:'damage', label:'Damage advantage', min:-1, max:1, step:.1, initial:0, low:'Enemy advantage', high:'Player advantage'},
  {id:'detection', label:'Enemy detection sensitivity', min:.4, max:1.8, step:.1, initial:1, low:'Hard to detect', high:'Easy to detect'},
  {id:'pingDetection', label:'Chance either side hears a ping', min:0, max:1, step:.05, initial:.9, low:'Never', high:'Likely nearby'},
  {id:'depthStealth', label:'Depth protection from detection', min:0, max:2, step:.1, initial:1, low:'Weak', high:'Strong'},
  {id:'pursuit', label:'Enemy pursuit persistence', min:.4, max:2, step:.1, initial:1, low:'Careless', high:'Relentless'},
  {id:'airSupport', label:'Enemy air support', initial:true},
  {id:'satellite', label:'Classified satellite photography', initial:true},
  {id:'drone', label:'External ROV', initial:true},
  {id:'omniscientChart', label:'Exact enemy positions on chart', initial:false},
  {id:'orbitCamera', label:'External orbit camera (Turn off for more realism)', initial:true}
];

export function patrolDifficulty(input={}) {
  return Object.fromEntries(difficultyControls.map(control=>{
    const value=input?.[control.id];
    if(typeof control.initial==='boolean')return [control.id,typeof value==='boolean'?value:control.initial];
    return [control.id,Number.isFinite(value)?Math.min(control.max,Math.max(control.min,value)):control.initial];
  }));
}
