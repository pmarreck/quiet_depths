// Fixed edge fractures let a player recognize the same damaged instrument
// after pausing or loading. Coordinates are fractions of the display.
const fractures = [
  [[0,.21],[.045,.25],[.066,.24],[.10,.31],[.14,.33]],
  [[1,.74],[.95,.71],[.94,.67],[.90,.66],[.86,.60]],
  [[.73,0],[.70,.08],[.71,.12],[.67,.18],[.66,.27]],
  [[.26,1],[.29,.92],[.28,.88],[.32,.82],[.34,.74]],
  [[1,.14],[.95,.18],[.92,.17],[.87,.24],[.82,.25]],
  [[0,.81],[.06,.76],[.09,.77],[.13,.72],[.18,.70]],
] as const;

export function drawSonarGlass(ctx: CanvasRenderingContext2D, width: number, height: number, health: number) {
  if (health >= 100) return;
  const damage = (100 - health) / 100;
  const count = Math.ceil(damage * fractures.length);
  ctx.save();
  ctx.globalAlpha = .28 + damage * .52;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#a4b9af';
  ctx.beginPath();
  for (const points of fractures.slice(0, count)) {
    ctx.moveTo(points[0][0] * width, points[0][1] * height);
    for (const [x,y] of points.slice(1)) ctx.lineTo(x * width, y * height);
    const [x,y] = points[2], [tipX,tipY] = points[4];
    ctx.moveTo(x * width, y * height);
    ctx.lineTo((x + (tipX-x)*.28) * width, (y - (tipY-y)*.38) * height);
  }
  ctx.stroke();
  ctx.restore();
}

// Only vary echo brightness. A damaged screen still puts the return at the
// measured bearing and distance. Use real presentation time even on fast play.
export function signalOpacity(health: number, phase: number, seconds: number, reducedMotion: boolean) {
  if (health >= 100) return 1;
  const damage = (100 - health) / 100;
  const fade = reducedMotion ? .55 : .17 + .79 * ((1 + Math.sin(seconds*2.1 + phase)) / 2) ** 2;
  return 1 - damage * fade;
}

export function lensFilter(health: number) {
  if (health >= 100) return '';
  const damage = (100 - health) / 100;
  return `blur(${(damage*5).toFixed(2)}px) saturate(${1-damage*.55}) contrast(${1-damage*.42})`;
}
