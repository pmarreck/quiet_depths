import {appleTouchDevice, offersInstall, TOUCH_FIRST_QUERY} from './device-profile.ts';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<unknown>;
}

const install = document.querySelector<HTMLButtonElement>('#install-game')!;
const instructions = document.querySelector<HTMLElement>('#install-help')!;
const updateLink = document.querySelector<HTMLAnchorElement>('#update-game')!;
let offer: InstallPrompt | undefined;
const touchFirst = matchMedia(TOUCH_FIRST_QUERY);
const standalone = matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true);
const appleTouch = appleTouchDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);

function showInstall() {
  install.hidden = !offersInstall({standalone, touchFirst: touchFirst.matches, appleTouch});
  if (install.hidden) {
    instructions.hidden = true;
    install.setAttribute('aria-expanded', 'false');
  }
}
showInstall();
touchFirst.addEventListener('change', showInstall);

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  offer = event as InstallPrompt;
  showInstall();
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
      await prompt.userChoice;
      return;
    } catch {
      // A saved installation offer can expire in the background.
    }
  }
  instructions.hidden = !instructions.hidden;
  install.setAttribute('aria-expanded', String(!instructions.hidden));
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  const workers = navigator.serviceWorker;
  let previous = workers.controller;
  workers.addEventListener('controllerchange', () => {
    if (previous && workers.controller !== previous) {
      updateLink.textContent = 'New build ready · Reopen game';
      updateLink.href = './';
    }
    previous = workers.controller;
  });
  workers.register('./service-worker.js', {updateViaCache:'none'}).then(registration => {
    let lastCheck = -Infinity;
    function check() {
      if (document.hidden || !navigator.onLine || !registration.active || performance.now()-lastCheck < 60000) return;
      lastCheck = performance.now();
      registration.update().catch(() => {}); // Keep playing the installed build offline.
    }
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('online', check);
  }).catch(error => console.warn('Quiet Depths offline install unavailable', error));
}
