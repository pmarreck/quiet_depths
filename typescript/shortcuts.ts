type ShortcutScope = 'sub' | 'rov' | 'both';
interface Shortcut {label: string; key: string; scope: ShortcutScope}

// Established action IDs are also the keys in players' saved preferences.
const shared: Record<string, string> = {
  Escape:'Pause or resume', KeyV:'External orbit camera', Digit1:'Periscope', Digit2:'Sonar',
  Digit3:'Chart', Digit4:'ROV', Digit5:'Conning tower', Digit6:'Deck gun', Digit7:'Photos',
  KeyJ:'Fire deck gun',
  KeyP:'Raise or lower periscope', KeyF:'Photograph', KeyG:'Active sonar ping', KeyR:'Silent running'
};
const shortcuts: Record<string, Shortcut> = Object.fromEntries(
  Object.entries(shared).map(([key,label]) => [key,{key,label,scope:'both'}])
);
for (const [key,label] of Object.entries({KeyW:'Sub throttle up',KeyS:'Sub throttle down',KeyA:'Sub turn port',KeyD:'Sub turn starboard',Space:'Sub rise',KeyC:'Sub dive'})) {
  shortcuts[key] = {key,label,scope:'sub'};
}
for (const [id,key,label] of [
  ['rovPitchUp','KeyW','ROV nose up'], ['rovPitchDown','KeyS','ROV nose down'],
  ['rovLeft','KeyA','ROV turn left'], ['rovRight','KeyD','ROV turn right'],
  ['rovFaster','ArrowUp','ROV throttle up'], ['rovSlower','ArrowDown','ROV throttle down'],
  ['rovStop','Space','ROV all-stop']
]) shortcuts[id] = {key,label,scope:'rov'};

export const shortcutActions = Object.fromEntries(Object.entries(shortcuts).map(([id,s]) => [id,s.label]));
type Bindings = Record<string,string>;
export function allowedShortcut(key: unknown): key is string {
  return typeof key === 'string' && /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Escape|Bracket(Left|Right)|Minus|Equal)$/.test(key);
}
export function shortcutConflict(bindings: Bindings, id: string, key: string) {
  const scope = shortcuts[id].scope;
  return Object.keys(bindings).find(other => other !== id && bindings[other] === key &&
    (scope === 'both' || shortcuts[other].scope === 'both' || shortcuts[other].scope === scope));
}
export function shortcutBindings(input: Record<string,unknown> | null = {}): Bindings {
  const result: Bindings = {};
  const ids = Object.keys(shortcuts);
  // Honor saved choices first, including an older patrol's use of an arrow for a shared action.
  for (const id of ids) {
    const key = input?.[id];
    if (allowedShortcut(key) && !shortcutConflict(result,id,key)) result[id] = key;
  }
  for (const id of ids) {
    const key = shortcuts[id].key;
    if (!result[id] && !shortcutConflict(result,id,key)) result[id] = key;
  }
  const spare = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => 'Key'+letter);
  for (const id of ids) {
    if (result[id]) continue;
    const key = spare.find(candidate => !shortcutConflict(result,id,candidate));
    if (!key) throw new Error('No available shortcut for '+id);
    result[id] = key;
  }
  return result;
}
export function actionForKey(bindings: Bindings, code: string, view: string) {
  const scope = view === 'drone' ? 'rov' : 'sub';
  return Object.keys(bindings).find(id => bindings[id] === code && (shortcuts[id].scope === 'both' || shortcuts[id].scope === scope));
}
export function keyLabel(key: string) {
  return key === 'Escape' ? 'Esc' : key.replace(/^(Key|Digit)/,'').replace(/^Arrow/,'Arrow ').replace(/^Numpad/,'Numpad ');
}
