// The simulation worker's file: the Elm program (elm/SimWorker.elm), stock,
// followed by a few lines that run it in a Web Worker, sending each command
// the page posts to its commands port and each reply from its replies port
// back to the page. Elm's compiled program attaches itself to `this`, which
// at the top of a classic worker's script is the worker's global scope.
//
// A world goes back as only the fields that changed since the last world
// sent (`changes: {set, unset, whole}`), so the page receives and refreshes
// a fraction of each tick; the comparison runs here, off the page's thread.
// The orders always go, set or unset: the page writes them between replies,
// so one the simulation applies and returns to its old value within a reply
// would otherwise look unchanged here while the page still holds its write.
// The relay learns which fields are orders from the worker's list of them.
// A command that replaces the patrol (create, restore, load) starts afresh,
// and its world goes whole.
export const RELAY = `
;(scope => {
  const app = scope.Elm.SimWorker.init();
  // Tells apart every value a world can hold, -0, NaN and the infinities included.
  const key = v => JSON.stringify(v, (_, x) =>
    typeof x === 'number' && (Object.is(x, -0) || !Number.isFinite(x)) ? '\\u0000' + (Object.is(x, -0) ? '-0' : String(x)) : x);
  let sent = null, orders = new Set();
  const changes = world => {
    const set = {}, fields = {}, whole = !sent;
    for (const [k, v] of Object.entries(world)) { fields[k] = key(v); if (whole || orders.has(k) || sent[k] !== fields[k]) set[k] = v; }
    const unset = whole ? [] : [...new Set([...Object.keys(sent), ...orders])].filter(k => !(k in fields));
    sent = fields;
    return {set, unset, whole};
  };
  app.ports.replies.subscribe(reply => {
    if (reply.boat) orders = new Set([...reply.boat, 'gun', 'drone']);
    const out = {...reply};
    if (reply.world) { delete out.world; out.changes = changes(reply.world); }
    if (reply.ticks) out.ticks = reply.ticks.map(({world, ...tick}) => ({...tick, changes: changes(world)}));
    scope.postMessage(out);
  });
  scope.onmessage = event => {
    if (['create', 'restore', 'load'].includes(event.data && event.data.kind)) sent = null;
    app.ports.commands.send(event.data);
  };
})(self);
`;

export const workerScript = elmJs => elmJs + RELAY;
