// Pointer steering for the heading-up helm compass. The card rotates so the
// actual heading is at the top, so a point on the rim names the bearing found
// by adding its clockwise angle from the top to the actual heading.
const HUB_FRACTION = 0.5;

export function pointerHeading(x: number, y: number, width: number, height: number, actualHeading: number): number | null {
  const dx = x - width / 2, dy = y - height / 2;
  if (Math.hypot(dx, dy) < (Math.min(width, height) / 2) * HUB_FRACTION) return null;
  const clockwise = Math.atan2(dx, -dy) * 180 / Math.PI;
  return Math.round((((actualHeading + clockwise) % 360) + 360) % 360) % 360;
}

// The pointer stays captured while dragging, so the order follows the pointer
// even outside the compass. Holding still keeps the last order while the card turns.
export function attachCompassSteering(element: HTMLElement, actualHeading: () => number, steer: (heading: number) => void): void {
  let pointer: number | null = null;
  const headingAt = (event: PointerEvent) => {
    const box = element.getBoundingClientRect();
    return pointerHeading(event.clientX - box.left, event.clientY - box.top, box.width, box.height, actualHeading());
  };
  element.addEventListener('pointerdown', event => {
    const heading = headingAt(event);
    if (heading === null || pointer !== null) return;
    pointer = event.pointerId;
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
    steer(heading);
  });
  element.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    const heading = headingAt(event);
    if (heading !== null) steer(heading);
  });
  const release = (event: PointerEvent) => {
    if (event.pointerId === pointer) pointer = null;
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
}
