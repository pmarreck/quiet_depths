export const shortcutActions = Object.freeze({
  Escape:'Pause or resume',KeyV:'External orbit camera',Digit1:'Periscope',Digit2:'Sonar',
  Digit3:'Chart',Digit4:'ROV',Digit5:'Conning tower',Digit6:'Deck gun',Digit7:'Photos',
  KeyW:'Increase speed',KeyS:'Decrease speed',KeyA:'Turn port',KeyD:'Turn starboard',
  Space:'Rise',KeyC:'Dive',KeyJ:'Fire deck gun',KeyP:'Raise or lower periscope',
  KeyF:'Photograph',KeyG:'Active sonar ping',KeyR:'Silent running'
});

export function allowedShortcut(key){
  return typeof key==='string'&&/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Escape|Bracket(Left|Right)|Minus|Equal)$/.test(key);
}

export function shortcutBindings(input={}){
  const actions=Object.keys(shortcutActions),keys=actions.map(action=>input?.[action]??action);
  if(!keys.every(allowedShortcut)||new Set(keys).size!==keys.length)return Object.fromEntries(actions.map(action=>[action,action]));
  return Object.fromEntries(actions.map((action,index)=>[action,keys[index]]));
}

export function keyLabel(key){
  return key==='Escape'?'Esc':key.replace(/^(Key|Digit)/,'').replace(/^Arrow/,'Arrow ').replace(/^Numpad/,'Numpad ');
}
