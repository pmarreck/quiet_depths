export const difficultyControls = [
  {id:'damage', label:'Damage advantage', min:-1, max:1, step:.1, initial:0, low:'Enemy advantage', high:'Player advantage'},
  {id:'detection', label:'Enemy detection sensitivity', min:.4, max:1.8, step:.1, initial:1, low:'Hard to detect', high:'Easy to detect'},
  {id:'pingDetection', label:'Chance either side hears a ping', min:0, max:1, step:.05, initial:.9, low:'Never', high:'Likely nearby'},
  {id:'depthStealth', label:'Depth protection from detection', min:0, max:2, step:.1, initial:1, low:'Weak', high:'Strong'},
  {id:'pursuit', label:'Enemy pursuit persistence', min:.4, max:2, step:.1, initial:1, low:'Careless', high:'Relentless'},
  {id:'airSupport', label:'Enemy air support', initial:true},
  {id:'longPatrol', label:'Longer mission (contacts start out of sonar range)', initial:false},
  {id:'satellite', label:'Classified satellite photography', initial:true},
  {id:'drone', label:'External ROV', initial:true},
  {id:'omniscientChart', label:'Exact enemy positions on chart', initial:false},
  {id:'orbitCamera', label:'External orbit camera (Turn off for more realism)', initial:true},
  {id:'instantReplay', label:'Instant replay', initial:true},
  {id:'enemyReplay', label:'Also instant-replay enemy events (even less realism)', initial:false, requires:'instantReplay'}
] as const;


type Control = typeof difficultyControls[number];
type SettingId = Control['id'];
type Difficulty = {
  [K in SettingId]: Extract<Control,{id:K}>['initial'] extends boolean ? boolean : number
};

export function patrolDifficulty(input:unknown={}):Difficulty {
  const stored=input&&typeof input==='object'?input:{};
  return Object.fromEntries(difficultyControls.map(control=>{
    const value=Reflect.get(stored,control.id);
    if(!('min' in control))return [control.id,typeof value==='boolean'?value:control.initial];
    return [control.id,typeof value==='number'&&Number.isFinite(value)?Math.min(control.max,Math.max(control.min,value)):control.initial];
  })) as Difficulty;
}

export function difficultyPanel(values:Difficulty){
  return {
    sliders:difficultyControls.flatMap(c=>'min' in c?[{...c,value:values[c.id]}]:[]),
    switches:difficultyControls.flatMap(c=>'min' in c?[]:[{
      id:c.id,label:c.label,value:values[c.id],requires:'requires' in c?c.requires:null
    }])
  };
}
