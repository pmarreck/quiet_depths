// A small DevTools protocol client over Node's own WebSocket for the
// browser scripts here: one page, its console warnings, errors and uncaught
// exceptions collected, and helpers to load the game and begin a patrol.
// Start Chromium with --remote-debugging-port (headless is fine; WebGL
// needs --use-angle=swiftshader --enable-unsafe-swiftshader there) and
// serve a built site with scripts/serve.mjs before running them.

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Opens a page in the browser at `cdp` (such as http://127.0.0.1:9222).
export async function openPage(cdp) {
  const target = await (await fetch(cdp + '/json/new?about:blank', {method: 'PUT'})).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let next = 0, loaded = null;
  const pending = new Map(), heard = [];
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      const {resolve, reject} = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type))
      heard.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' ').slice(0, 300));
    if (m.method === 'Runtime.exceptionThrown') heard.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400));
    if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) heard.push('log ' + m.params.entry.level + ': ' + m.params.entry.text.slice(0, 300));
    if (m.method === 'Page.loadEventFired' && loaded) { loaded(); loaded = null; }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  };
  // Waits until `expression` is true in the page.
  const until = async (expression, ms = 30000) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await pause(150)) if (await evaluate(expression).catch(() => false)) return;
    throw new Error('timed out waiting for ' + expression);
  };
  const load = async url => {
    const done = new Promise(resolve => { loaded = resolve; });
    await send('Page.navigate', {url});
    await done;
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  return {
    send, evaluate, until, load, heard,
    // Starts from nothing: no service worker, caches or storage from earlier runs.
    clear: url => send('Storage.clearDataForOrigin', {origin: new URL(url).origin, storageTypes: 'all'}),
    close: async () => { await fetch(cdp + '/json/close/' + target.id); ws.close(); },
  };
}

// Loads the game at `url` with no saved patrol and begins `mission` from the briefing.
export async function beginPatrol(page, url, mission) {
  await page.load(url);
  await page.evaluate('localStorage.clear()');
  await page.load(url);
  await page.until(`document.querySelector('[data-mission="${mission}"]') && document.getElementById('briefing').open`);
  await page.evaluate(`document.querySelector('[data-mission="${mission}"]').click()`);
  await pause(300);
  await page.evaluate(`document.getElementById('start').click()`);
  await page.until(`!document.getElementById('briefing').open`, 10000);
}

// The page's console since `from`, or that it stayed quiet.
export const heardSince = (heard, from = 0) => heard.length > from ? '\n    ' + [...new Set(heard.slice(from))].join('\n    ') : 'quiet';
