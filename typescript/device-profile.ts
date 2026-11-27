// Device decisions for the briefing and station hints. Browser adapters pass in
// what they observe, so each combination can be checked without a browser.
export const TOUCH_FIRST_QUERY = '(hover: none) and (pointer: coarse)';

export interface InstallTraits {
  standalone: boolean;
  touchFirst: boolean;
  appleTouch: boolean;
}

// Phones and tablets install the game from the briefing. Desktop browsers keep
// their own install controls, and the installed app needs no offer.
export function offersInstall(traits: InstallTraits): boolean {
  return !traits.standalone && (traits.touchFirst || traits.appleTouch);
}

// Safari on iPadOS identifies itself as a Mac, so touch points separate the two.
export function appleTouchDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /\b(iPhone|iPad|iPod)\b/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function showsKeyboardHints(touchFirst: boolean, hardwareKeySeen: boolean): boolean {
  return !touchFirst || hardwareKeySeen;
}

interface KeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

// On-screen keyboards also send key events while a text field has focus.
export function isHardwareShortcut(event: {isTrusted: boolean; key: string; target: KeyTarget | null}): boolean {
  if (!event.isTrusted || event.key === 'Unidentified' || event.key === 'Process') return false;
  const target = event.target;
  if (!target) return true;
  return !target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName ?? '');
}
