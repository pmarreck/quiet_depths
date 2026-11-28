// The Elm simulation's worker as the adapter's tests reach it: its program
// on the same thread or the shipped worker file, and the checks every such
// test shares. Used by elm-simulation.test.mjs and
// elm-simulation-orders.test.mjs.
import {workerScript} from '../scripts/sim-worker-script.mjs';
import {compiledElm, elmSource, exact} from './sim-harness.mjs';


// The worker's program, stock: each reply arrives once the event loop turns.
export const program = compiledElm('elm/SimWorker.elm').SimWorker;
// The worker file the site ships, compiled once.
const shippedScript = workerScript(elmSource('elm/SimWorker.elm'));
// The shipped worker file, run in a stand-in for a Web Worker's global
// scope; what crosses between the page and the worker is cloned as
// postMessage clones it, so a function or other value a worker could not
// receive fails here.
export function shippedWorker() {
  const listeners = [], scope = {postMessage: reply => { const data = structuredClone(reply); for (const l of listeners) l({data}); }};
  new Function('self', shippedScript).call(scope, scope);
  return {postMessage: command => scope.onmessage({data: structuredClone(command)}), addEventListener: (type, l) => { if (type === 'message') listeners.push(l); }};
}
// The worker as the adapter reaches it: its program on the same thread,
// sending whole worlds, or with `shipped` the shipped worker file, sending
// only the fields that changed. With `hold`, each reply waits until the
// test releases it, so the test can act while a command is in flight;
// `sent` lists the commands in the order they went.
export function transport({hold = false, shipped = false} = {}) {
  const source = shipped ? (w => ({send: c => w.postMessage(c), subscribe: l => w.addEventListener('message', e => l(e.data))}))(shippedWorker())
    : (app => ({send: c => app.ports.commands.send(c), subscribe: l => app.ports.replies.subscribe(l)}))(program.init());
  const held = [], sent = [], received = [];
  let listener = null, arrived = null;
  source.subscribe(reply => {
    received.push(reply);
    if (!hold) { listener(reply); return; }
    held.push(reply);
    arrived?.();
  });
  return {
    send: command => { sent.push(command); source.send(command); },
    listen: l => { listener = l; },
    sent,
    received,
    // Delivers the next reply once the worker has sent it.
    async release() {
      while (!held.length) await new Promise(resolve => { arrived = resolve; });
      arrived = null;
      listener(held.shift());
    },
  };
}
export const worker = () => transport();
// The tests that run both ways.
export const SOURCES = [['on the page', {}], ['through the shipped worker', {shipped: true}]];
// Fails a test that writes, on the page's patrol object, a field only the
// simulation changes; the worker would never see it.
export const strict = {onStray: fields => { throw new Error('written outside the orders: ' + fields.join(', ')); }};
export const pageless = s => {
  const w = exact(s);
  for (const key of ['photoArchive', 'photoSequence', 'captain']) delete w[key];
  for (const ship of w.ships) if (ship.tracking === null) delete ship.tracking;
  return exact(w);
};
