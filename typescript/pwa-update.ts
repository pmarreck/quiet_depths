function waitForActivation(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(false), 60000);
    function finish(success: boolean) {
      clearTimeout(timeout);
      worker.removeEventListener('statechange', changed);
      if (success) resolve();
      else reject(new Error('The updated build could not be installed.'));
    }
    function changed() {
      if (worker.state === 'activated') finish(true);
      else if (worker.state === 'redundant') finish(false);
    }
    worker.addEventListener('statechange', changed);
    changed();
  });
}

async function reopenGame() {
  const message = document.querySelector<HTMLElement>('#update-status')!;
  if (!('serviceWorker' in navigator)) {
    message.textContent = 'Offline installation is unavailable in this browser. Open the game to play online.';
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', {updateViaCache:'none'});
    if (registration.active) await registration.update();
    const next = registration.installing ?? registration.waiting ?? registration.active;
    if (!next) throw new Error('No game worker is available.');
    await waitForActivation(next);
    location.replace('./');
  } catch {
    message.textContent = 'Couldn’t finish checking for an update. Reconnect and retry, or open your installed game.';
    document.querySelector<HTMLButtonElement>('#retry-update')!.hidden = false;
  }
}

document.querySelector<HTMLButtonElement>('#retry-update')!.addEventListener('click', () => location.reload());
void reopenGame();
