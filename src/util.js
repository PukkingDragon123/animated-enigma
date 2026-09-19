// ---- Math & helpers ------------------------------------------------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sign = v => v < 0 ? -1 : 1;
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
function angleDiff(a, b) {
  return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}
function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  return Math.max(v - step, target);
}
// Cheap deterministic hash noise (for water & rocks)
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
class SeededRandom {
  constructor(seed) { this.s = seed >>> 0 || 1; }
  next() { let s = this.s; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; this.s = s; return s / 4294967296; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(r, g, b, a) { return `rgba(${r|0},${g|0},${b|0},${a})`; }
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
// Draw crisp pixel text (rendered on the low-res canvas so it stays chunky)
function pixelText(ctx, text, x, y, size, color, align = 'left', shadow = true) {
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (shadow) { ctx.fillStyle = '#000'; ctx.fillText(text, x + 1, y + 1); }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
function wrapText(ctx, text, maxWidth, size) {
  ctx.font = `bold ${size}px monospace`;
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Truncate a label to fit a pixel width, using the real measured font.
function fitLabel(text, maxW, size) {
  if (typeof textWidth !== 'function') return text;
  if (textWidth(text, size) <= maxW) return text;
  let s = text;
  while (s.length > 1 && textWidth(s + '.', size) > maxW) s = s.slice(0, -1);
  return s + '.';
}
