// Elm's outgoing ports deliver one batch of values per turn of the event
// loop: each port's effect manager starts with, and returns to after every
// batch, a zero-length timer (`_Process_sleep(0)`). The simulation worker's
// replies must arrive within the command that asked for them, so its compiled
// output takes this one change, which lets a port deliver at once. Apply it
// to the simulation worker's own compiled program only. It fails unless the
// runtime's code is exactly as expected, so an Elm upgrade that changes it
// is caught at build time rather than in play.
const SLEEP = 'var init = _Process_sleep(0);';
const AT_ONCE = 'var init = _Scheduler_succeed(null);';

export function synchronousPorts(js) {
  const at = js.indexOf(SLEEP), setup = js.lastIndexOf('function _Platform_setupOutgoingPort(', at);
  if (at < 0 || js.indexOf(SLEEP, at + 1) >= 0 || setup < 0 || at - setup > 400)
    throw new Error('The compiled Elm runtime no longer sets up outgoing ports as expected; review scripts/elm-sync-ports.mjs');
  return js.slice(0, at) + AT_ONCE + js.slice(at + SLEEP.length);
}
