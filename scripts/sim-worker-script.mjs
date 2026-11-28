// The simulation worker's file: the Elm program (elm/SimWorker.elm), stock,
// followed by a few lines that run it in a Web Worker, sending each command
// the page posts to its commands port and each reply from its replies port
// back to the page. Elm's compiled program attaches itself to `this`, which
// at the top of a classic worker's script is the worker's global scope.
export const RELAY = `
;(scope => {
  const app = scope.Elm.SimWorker.init();
  app.ports.replies.subscribe(reply => scope.postMessage(reply));
  scope.onmessage = event => app.ports.commands.send(event.data);
})(self);
`;

export const workerScript = elmJs => elmJs + RELAY;
