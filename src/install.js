const install = document.getElementById('install-game');
const instructions = document.getElementById('install-help');
let offer;

if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
  install.hidden = true;
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  offer = event;
  install.hidden = false;
});

window.addEventListener('appinstalled', () => {
  offer = undefined;
  install.hidden = true;
  instructions.hidden = true;
});

install.addEventListener('click', async () => {
  if (offer) {
    const prompt = offer;
    offer = undefined;
    try {
      await prompt.prompt();
      return;
    } catch {
      // The prompt can expire when the tab has been in the background.
    }
  }
  instructions.hidden = !instructions.hidden;
  install.setAttribute('aria-expanded', String(!instructions.hidden));
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./service-worker.js').catch(error => {
    console.warn('Quiet Depths offline install unavailable', error);
  });
}
