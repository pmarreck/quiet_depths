import {isHardwareShortcut, showsKeyboardHints, TOUCH_FIRST_QUERY} from './device-profile.ts';

// Touch-only devices hide keyboard shortcuts until a hardware key is pressed.
const root = document.documentElement;
const touchFirst = matchMedia(TOUCH_FIRST_QUERY);
let hardwareKeySeen = false;

function apply() {
  root.classList.toggle('touch-only', !showsKeyboardHints(touchFirst.matches, hardwareKeySeen));
}

touchFirst.addEventListener('change', apply);
window.addEventListener('keydown', event => {
  if (hardwareKeySeen || !isHardwareShortcut({isTrusted: event.isTrusted, key: event.key, target: event.target as HTMLElement | null})) return;
  hardwareKeySeen = true;
  apply();
}, {capture: true});
apply();
