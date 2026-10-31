// Shared canvas UI helpers for the town and battle scenes.

export const FONT = '8px "Press Start 2P", monospace';

export function panel(ctx, x, y, w, h, color = '#000000aa') {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ffffff22';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function text(ctx, str, x, y, color) {
  ctx.fillStyle = '#000000';
  ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function fit(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
