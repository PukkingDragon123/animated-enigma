// ===========================================================================
//  INTRO — "MANATEE VS BOATS" opening cinematic.
//  A ten-beat side-scrolling story told in 640x360 pixel art.  Every layer is
//  generated procedurally at load and scrolled; nothing is rebuilt per frame.
//  Public API:  Intro.reset() / Intro.update(dt) / Intro.render(ctx) /
//               Intro.done / Intro.skip()
// ===========================================================================
(function (global) {
'use strict';

// ------------------------------------------------------------- tiny raster
const R = Math.round;
function can(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
function cx2(c) { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; }
function spr(c, ax, ay) { return { c: c, w: c.width, h: c.height, ax: ax === undefined ? c.width / 2 : ax, ay: ay === undefined ? c.height / 2 : ay }; }
function P(ctx, col, x, y, w, h) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w === undefined ? 1 : w | 0, h === undefined ? 1 : h | 0); }
// hard-edged 1px line (no AA, no strokes)
function LN(ctx, col, x0, y0, x1, y1) {
  x0 = x0 | 0; y0 = y0 | 0; x1 = x1 | 0; y1 = y1 | 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, n = 0;
  ctx.fillStyle = col;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if ((x0 === x1 && y0 === y1) || ++n > 900) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
function tri(ctx, col, ax, ay, bx, by, cx, cy) {
  ctx.fillStyle = col;
  const y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
  for (let y = y0; y <= y1; y++) {
    let lo = 1e9, hi = -1e9;
    const pts = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
    for (const [px0, py0, px1, py1] of pts) {
      if ((py0 <= y && py1 > y) || (py1 <= y && py0 > y)) {
        const t = (y - py0) / (py1 - py0), x = px0 + (px1 - px0) * t;
        if (x < lo) lo = x; if (x > hi) hi = x;
      }
    }
    if (hi >= lo) ctx.fillRect(Math.round(lo), y, Math.max(1, Math.round(hi - lo)), 1);
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bay(x, y) { return (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16; }
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return 'rgb(' + R(A[0] + (B[0] - A[0]) * t) + ',' + R(A[1] + (B[1] - A[1]) * t) + ',' + R(A[2] + (B[2] - A[2]) * t) + ')';
}
function qa(a) { return Math.max(0, Math.min(1, Math.round(a * 12) / 12)); }   // quantized alpha
function rgbaq(hex, a) { const c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + qa(a) + ')'; }

// ----------------------------------------------------------------- palette
const IP = {
  ink: '#101018', ink2: '#1d1b28',
  // water ramps, surface -> depths
  shallow: ['#6fd0b4', '#48ad9e', '#2f8a88', '#1f6a72', '#15505e', '#0e3a4a', '#0a2a38'],
  open:    ['#4aa0cf', '#3480b4', '#246394', '#1a4b78', '#12365c', '#0c2544', '#081a32'],
  deep:    ['#1d5c86', '#154668', '#0f3450', '#0a253c', '#07192c', '#05111f', '#030b16'],
  night:   ['#12405e', '#0d3049', '#092338', '#061829', '#04101d', '#030b15', '#02070f'],
  tank:    ['#7d9a4c', '#63803d', '#4c6632', '#3a5028', '#2b3c1f', '#1f2c17', '#16200f'],
  sky:     ['#3f86bc', '#58a0cf', '#7bbcde', '#a4d6e8', '#cfe9ee', '#eef0da'],
  // vegetation
  kelp: ['#0f3a24', '#1b5c35', '#2c7f45', '#46a05a', '#6fc077'],
  grass: ['#14402a', '#245e35', '#3a8244', '#5aa457'],
  coralA: ['#7a2438', '#a8374a', '#d4566a', '#f08a94'],
  coralB: ['#7a4a18', '#b06f22', '#dd9a33', '#f5c464'],
  coralC: ['#3d2a5c', '#5b3f84', '#7f5cae', '#a98cd0'],
  sand: ['#4b4a38', '#6d6a4c', '#8f8a62', '#b2ab7d', '#d0c79a'],
  rock: ['#1b2230', '#2b3444', '#3d4859', '#535f72', '#6e7b8e'],
  // blood
  blood: ['#4b0a12', '#7a0d16', '#a8151f', '#c4202c', '#e8515a'],
  foam: ['#cfe8f2', '#e9f6fb', '#ffffff'],
  bone: '#e8e4d8',
};
const MOOD = ['shallow', 'open', 'deep', 'night', 'tank'];

// ================================================================== WATER ==
function buildWater(ramp, w, h, opt) {
  opt = opt || {};
  const c = can(w, h), x = cx2(c), img = x.createImageData(w, h), d = img.data;
  const cols = ramp.map(hexToRgb), n = cols.length;
  const wob = opt.wob === undefined ? 0.7 : opt.wob;
  const pw = opt.pow === undefined ? 1 : opt.pow;
  for (let y = 0; y < h; y++) {
    const k = Math.pow(y / (h - 1), pw);
    for (let px = 0; px < w; px++) {
      let fi = k * (n - 1);
      fi += (vnoise(px * 0.010, y * 0.030) - 0.5) * wob;
      fi += Math.sin(px * 0.017 + y * 0.008) * 0.16;
      let i0 = Math.floor(fi), fr = fi - i0;
      if (i0 < 0) { i0 = 0; fr = 0; }
      if (i0 >= n - 1) { i0 = n - 1; fr = 0; }
      const idx = fr > bay(px, y) ? Math.min(n - 1, i0 + 1) : i0;
      const col = cols[idx], p = (y * w + px) * 4;
      d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

// ============================================================== SUN SHAFTS ==
function buildShafts(w, h, tint) {
  const c = can(w, h), x = cx2(c);
  const rng = new SeededRandom(9137);
  for (let i = 0; i < 11; i++) {
    const bx = rng.range(0, w), bw = rng.range(9, 34), slope = rng.range(0.16, 0.40);
    const len = rng.range(h * 0.55, h);
    for (let y = 0; y < len; y++) {
      const k = 1 - y / len;
      const a0 = qa(k * k * 0.16);
      if (a0 <= 0) continue;
      const ww = Math.max(2, R(bw * (0.55 + k * 0.45)));
      const sx = R(bx + y * slope);
      x.fillStyle = rgbaq(tint, a0 * 0.45); x.fillRect(sx, y, ww, 1);
      x.fillStyle = rgbaq(tint, a0); x.fillRect(sx + R(ww * 0.3), y, Math.max(1, R(ww * 0.35)), 1);
    }
  }
  return c;
}

function drawChurn(ctx, px, py, t, inten) {
  for (let i = 0; i < 24; i++) {
    const d = i * 5.5, k = i / 24;
    const hgt = 7 + k * 40 + Math.sin(t * 9 + i * 0.7) * 4;
    const yy = py - hgt / 2 + Math.sin(t * 5 + i * 0.5) * 3;
    ctx.fillStyle = rgbaq('#bcdcea', qa((0.30 - k * 0.26) * inten));
    ctx.fillRect(R(px + d), R(yy), 6, R(hgt));
    ctx.fillStyle = rgbaq('#eaf8ff', qa((0.34 - k * 0.32) * inten));
    ctx.fillRect(R(px + d), R(yy + hgt * 0.22), 6, R(hgt * 0.46));
    if (hash2(i, Math.floor(t * 12)) > 0.55) { ctx.fillStyle = rgbaq('#ffffff', qa(0.5 - k * 0.45)); ctx.fillRect(R(px + d), R(yy + hash2(i, 3) * hgt), 4, 2); }
  }
}
// ============================================================== VEGETATION ==
function kelpStalk(x, rng, baseY, hgt, ramp, thick, lean) {
  // returns a draw function so the same stalk can be stamped on several layers
  const ph = rng.range(0, TAU), amp = rng.range(3, 9);
  return function (ctx) {
    let px = x;
    for (let i = 0; i < hgt; i++) {
      const y = baseY - i, k = i / hgt;
      px = x + Math.sin(k * 3.1 + ph) * amp * k + lean * k * k * 18;
      const tw = Math.max(1, R(thick * (1 - k * 0.55)));
      P(ctx, ramp[1], R(px), y, tw, 1);
      P(ctx, ramp[3], R(px), y, 1, 1);
      P(ctx, IP.ink, R(px) - 1, y, 1, 1);
      P(ctx, IP.ink, R(px) + tw, y, 1, 1);
      // blades
      if (i > 5 && i % 6 === (x | 0) % 6) {
        const side = (i % 18 < 9) ? 1 : -1;
        const bl = R(rng.range(7, 14));
        for (let b = 0; b < bl; b++) {
          const by = y + R(b * 0.55), bxx = R(px) + side * (b + tw);
          P(ctx, ramp[2], bxx, by, 1, 2);
          if (b < bl - 2) P(ctx, ramp[4], bxx, by, 1, 1);
          P(ctx, IP.ink, bxx, by + 2, 1, 1);
        }
      }
    }
    // holdfast
    P(ctx, ramp[0], R(px) - 2, baseY - 1, 5, 2);
  };
}
function drawCoralFan(ctx, x, y, s, ramp) {
  const rng = new SeededRandom((x * 77 + y * 13) | 1);
  for (let a = -1.25; a <= 1.25; a += 0.12) {
    const len = s * (0.65 + Math.cos(a) * 0.45) * rng.range(0.85, 1.15);
    const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
    LN(ctx, ramp[1], x, y, R(ex), R(ey));
    LN(ctx, ramp[2], x + 1, y, R(ex) + 1, R(ey));
  }
  for (let a = -1.2; a <= 1.2; a += 0.36) {
    const len = s * (0.62 + Math.cos(a) * 0.42);
    LN(ctx, ramp[3], x, y, R(x + Math.sin(a) * len), R(y - Math.cos(a) * len));
  }
  P(ctx, IP.ink, x - 2, y - 1, 5, 3);
  P(ctx, ramp[0], x - 1, y - 1, 3, 2);
}
function drawCoralBrain(ctx, x, y, s, ramp) {
  const W = s * 2 + 4, H = s + 4;
  const f = blobField(W, H, [
    { x: W * 0.32, y: H * 0.72, rx: s * 0.62, ry: s * 0.62 },
    { x: W * 0.55, y: H * 0.62, rx: s * 0.78, ry: s * 0.75 },
    { x: W * 0.76, y: H * 0.75, rx: s * 0.52, ry: s * 0.5 },
  ]);
  const o = shadeBlob(W, H, f, [ramp[0], ramp[1], ramp[2], ramp[3]], { outline: IP.ink, lift: 0.18, smooth: 2 });
  // squiggle grooves
  for (let i = 0; i < s * 1.5; i++) {
    const gx = R(2 + hash2(i * 3, s) * (W - 4)), gy = R(2 + hash2(i * 7, s * 3) * (H - 4));
    if (f[gy * W + gx] > 0.12) { P(o.ctx, ramp[0], gx, gy, 2, 1); P(o.ctx, ramp[3], gx, gy - 1, 2, 1); }
  }
  ctx.drawImage(o.c, x - (W >> 1), y - H);
}
function drawCoralTubes(ctx, x, y, s, ramp) {
  const rng = new SeededRandom((x * 31 + y * 17) | 1);
  for (let i = 0; i < 5; i++) {
    const tw = R(rng.range(3, 6)), th = R(rng.range(s * 0.5, s * 1.25));
    const tx = R(x + rng.range(-s, s)), ty = y - th;
    P(ctx, IP.ink, tx - 1, ty - 1, tw + 2, th + 2);
    P(ctx, ramp[1], tx, ty, tw, th);
    P(ctx, ramp[2], tx, ty, 1, th);
    P(ctx, ramp[3], tx, ty, tw, 1);
    P(ctx, IP.ink, tx + 1, ty, Math.max(1, tw - 2), 1);
  }
}
function drawStaghorn(ctx, x, y, s, ramp, ang, depth) {
  if (depth > 3 || s < 3) return;
  const ex = x + Math.cos(ang) * s, ey = y + Math.sin(ang) * s;
  LN(ctx, IP.ink, x, y - 1, R(ex), R(ey) - 1);
  LN(ctx, ramp[1], x, y, R(ex), R(ey));
  LN(ctx, ramp[2], x + 1, y, R(ex) + 1, R(ey));
  if (depth >= 2) P(ctx, ramp[3], R(ex), R(ey) - 1, 2, 2);
  drawStaghorn(ctx, R(ex), R(ey), s * 0.68, ramp, ang - 0.55 - hash2(x, y) * 0.3, depth + 1);
  drawStaghorn(ctx, R(ex), R(ey), s * 0.68, ramp, ang + 0.5 + hash2(y, x) * 0.3, depth + 1);
}
function drawRockForm(ctx, x, yBase, w, h, ramp, spiky) {
  const W = w + 4, H = h + 4;
  const lobes = [];
  const n = spiky ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    lobes.push({ x: W * (0.2 + k * 0.62), y: H - (spiky ? h * (0.28 + hash2(x, i) * 0.55) : h * 0.35), rx: w * (0.18 + hash2(i, x) * 0.16), ry: h * (0.32 + hash2(i * 3, x) * 0.5) });
  }
  lobes.push({ x: W * 0.5, y: H - h * 0.18, rx: w * 0.46, ry: h * 0.3 });
  const f = blobField(W, H, lobes);
  const o = shadeBlob(W, H, f, ramp, { outline: IP.ink, lift: 0.2, smooth: 2 });
  for (let i = 0; i < w; i++) {
    const gx = R(hash2(i * 5, x) * W), gy = R(hash2(i * 11, x * 3) * H);
    if (f[gy * W + gx] > 0.3 && hash2(gx, gy) > 0.6) P(o.ctx, ramp[0], gx, gy, 1, 2);
  }
  ctx.drawImage(o.c, x - (W >> 1), yBase - H + 2);
}

// ---- layer builders --------------------------------------------------------
const LW = 768;                                   // tile width of every layer
function buildBed() {
  const H = 86, c = can(LW, H), x = cx2(c);
  const rng = new SeededRandom(2255);
  // sand body, dithered bands, lighter toward the top
  const cols = IP.sand;
  for (let y = 0; y < H; y++) {
    for (let px = 0; px < LW; px++) {
      const k = 1 - y / H;
      let fi = k * 2.1 + (vnoise(px * 0.035, y * 0.08) - 0.5) * 1.5 + 1.1;
      let i0 = Math.floor(fi), fr = fi - i0;
      i0 = clamp(i0, 0, cols.length - 1);
      const idx = clamp(fr > bay(px, y) ? i0 + 1 : i0, 0, cols.length - 1);
      P(x, cols[idx], px, y);
    }
  }
  // dune crest line
  for (let px = 0; px < LW; px++) {
    const yy = R(2 + vnoise(px * 0.02, 5) * 7);
    P(x, IP.ink, px, yy + 2, 1, 1);
    P(x, cols[4], px, yy, 1, 2);
    for (let y = 0; y < yy; y++) P(x, 'rgba(0,0,0,0)', px, y);
  }
  // clear everything above the crest
  const img = x.getImageData(0, 0, LW, H), d = img.data;
  for (let px = 0; px < LW; px++) {
    const yy = R(2 + vnoise(px * 0.02, 5) * 7);
    for (let y = 0; y < yy; y++) { const p = (y * LW + px) * 4; d[p + 3] = 0; }
  }
  x.putImageData(img, 0, 0);
  // ripples, pebbles, shells
  for (let i = 0; i < 150; i++) {
    const rx = R(rng.range(0, LW)), ry = R(rng.range(10, H - 4)), rw = R(rng.range(5, 18));
    P(x, cols[Math.max(0, 2 - (ry / H * 2 | 0))], rx, ry, rw, 1);
    P(x, cols[4], rx + 1, ry - 1, Math.max(1, rw - 3), 1);
  }
  for (let i = 0; i < 70; i++) {
    const rx = R(rng.range(0, LW)), ry = R(rng.range(12, H - 6)), s = R(rng.range(1, 3));
    P(x, IP.ink, rx, ry, s + 1, s + 1); P(x, IP.rock[3], rx, ry, s, s);
  }
  for (let i = 0; i < 14; i++) {
    const rx = R(rng.range(0, LW)), ry = R(rng.range(14, H - 8));
    P(x, IP.ink, rx - 1, ry - 1, 6, 4); P(x, IP.bone, rx, ry, 4, 2); P(x, '#fff8e6', rx, ry, 4, 1);
  }
  return c;
}
function buildGrass(H, ramp, dens, tall, seed) {
  const c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let i = 0; i < dens; i++) {
    const gx = R(rng.range(0, LW)), h = R(rng.range(tall * 0.4, tall));
    const bend = rng.range(-0.5, 0.5), ph = rng.range(0, TAU);
    let px = gx;
    for (let j = 0; j < h; j++) {
      const k = j / h;
      px = gx + Math.sin(k * 2.2 + ph) * 3 * k + bend * k * k * 10;
      P(x, IP.ink, R(px) - 1, H - 1 - j, 3, 1);
      P(x, ramp[1 + ((j + gx) % 2)], R(px), H - 1 - j, 1, 1);
      if (k > 0.7) P(x, ramp[3], R(px), H - 1 - j, 1, 1);
    }
  }
  return c;
}
function buildShallowMid(seed) {
  const H = 190, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let i = 0; i < 11; i++) drawRockForm(x, R(rng.range(0, LW)), H - R(rng.range(0, 7)), R(rng.range(20, 52)), R(rng.range(12, 30)), IP.rock, false);
  for (let i = 0; i < 12; i++) {
    const kx = R(rng.range(0, LW));
    kelpStalk(kx, rng, H - R(rng.range(0, 6)), R(rng.range(50, 130)), IP.kelp, R(rng.range(2, 4)), rng.range(-0.5, 0.5))(x);
  }
  for (let i = 0; i < 8; i++) drawCoralFan(x, R(rng.range(0, LW)), H - R(rng.range(2, 12)), R(rng.range(12, 24)), pick([IP.coralA, IP.coralC, IP.coralB]));
  for (let i = 0; i < 8; i++) drawCoralBrain(x, R(rng.range(0, LW)), H - R(rng.range(0, 8)), R(rng.range(7, 14)), pick([IP.coralB, IP.coralA]));
  for (let i = 0; i < 6; i++) drawCoralTubes(x, R(rng.range(0, LW)), H - R(rng.range(0, 6)), R(rng.range(10, 20)), pick([IP.coralC, IP.coralA]));
  for (let i = 0; i < 6; i++) drawStaghorn(x, R(rng.range(0, LW)), H - 4, rng.range(9, 14), IP.coralB, -Math.PI / 2 + rng.range(-0.3, 0.3), 0);
  return c;
}
function buildDeepMid(seed) {
  const H = 210, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  const dark = ['#0a1220', '#111b2c', '#1a263a', '#26354c', '#35465f'];
  for (let i = 0; i < 13; i++) drawRockForm(x, R(rng.range(0, LW)), H - R(rng.range(0, 6)), R(rng.range(16, 44)), R(rng.range(30, 130)), dark, true);
  const deadKelp = ['#101c20', '#1b2e2c', '#27403a', '#365349', '#496c5c'];
  for (let i = 0; i < 9; i++) {
    const kx = R(rng.range(0, LW));
    kelpStalk(kx, rng, H - R(rng.range(0, 4)), R(rng.range(40, 110)), deadKelp, 2, rng.range(-0.6, 0.6))(x);
  }
  return c;
}
function tintLayer(src, col, a) {
  const c = can(src.width, src.height), x = cx2(c);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = rgbaq(col, a); x.fillRect(0, 0, c.width, c.height);
  return c;
}
function buildSurfaceUnder(seed, foamCol, waterCol) {
  const H = 34, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let px = 0; px < LW; px++) {
    const w = Math.sin(px * 0.055) * 3.2 + Math.sin(px * 0.021 + 1.7) * 2.4 + Math.sin(px * 0.11) * 1.1;
    const top = R(6 + w);
    for (let y = 0; y < top; y++) P(x, 'rgba(0,0,0,0)', px, y);
    P(x, foamCol[2], px, top, 1, 1);
    P(x, foamCol[1], px, top + 1, 1, 2);
    P(x, foamCol[0], px, top + 3, 1, 1);
    for (let y = top + 4; y < top + 16 && y < H; y++) {
      const k = (y - top) / 16;
      if (hash2(px, y) > 0.52 + k * 0.5) P(x, foamCol[0], px, y, 1, 1);
    }
  }
  for (let i = 0; i < 40; i++) {
    const bx = R(rng.range(0, LW)), by = R(rng.range(2, 12));
    P(x, foamCol[2], bx, by, R(rng.range(2, 6)), 1);
  }
  return c;
}

// ================================================================ MANATEES ==
const MAN_RAMP = {
  dad: ['#2a2630', '#403c47', '#57525e', '#6f6a78', '#8a8593'],
  mom: ['#372f3a', '#4f4854', '#6b6372', '#877e8d', '#a298a8'],
  you: ['#332f39', '#4b4851', '#67646d', '#827e88', '#9d99a3'],
  bro: ['#3b333e', '#564d5b', '#756c7a', '#928897', '#ada3b1'],
};
function buildManateeBodyCan(L, ramp, opt) {
  opt = opt || {};
  const W = R(L) + 8, H = R(L * 0.56) + 8, cy = H / 2;
  const U = u => 4 + u * L, V = v => cy + v * L;
  const lobes = [
    { x: U(0.030), y: V(0.004), rx: L * 0.075, ry: L * 0.058 },
    { x: U(0.120), y: V(0.006), rx: L * 0.090, ry: L * 0.095 },
    { x: U(0.225), y: V(0.010), rx: L * 0.105, ry: L * 0.148 },
    { x: U(0.345), y: V(0.014), rx: L * 0.125, ry: L * 0.190 },
    { x: U(0.470), y: V(0.016), rx: L * 0.135, ry: L * 0.208 },
    { x: U(0.590), y: V(0.012), rx: L * 0.130, ry: L * 0.203 },
    { x: U(0.700), y: V(0.004), rx: L * 0.118, ry: L * 0.180 },
    { x: U(0.795), y: V(-0.008), rx: L * 0.100, ry: L * 0.148 },
    { x: U(0.875), y: V(-0.018), rx: L * 0.082, ry: L * 0.118 },
    { x: U(0.938), y: V(-0.010), rx: L * 0.062, ry: L * 0.092 },
    { x: U(0.982), y: V(0.014), rx: L * 0.042, ry: L * 0.066 },
  ];
  const f = blobField(W, H, lobes);
  const o = shadeBlob(W, H, f, ramp, { outline: IP.ink, lx: -0.22, ly: -0.92, contrast: 0.86, lift: 0.24, smooth: 3 });
  const ctx = o.ctx;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0;
  // ---- pale belly: recolour the lowest quarter of every column
  const belly = ['#6c7887', '#87939f', '#a3aeb8'];
  for (let x = 0; x < W; x++) {
    let y0 = -1, y1 = -1;
    for (let y = 0; y < H; y++) if (f[y * W + x] > 0) { if (y0 < 0) y0 = y; y1 = y; }
    if (y0 < 0 || y1 - y0 < 4) continue;
    const hgt = y1 - y0;
    for (let y = y0 + 1; y < y1; y++) {
      const k = (y - y0) / hgt;
      if (k < 0.58) continue;
      const edge = !inside(x, y + 1) || !inside(x - 1, y) || !inside(x + 1, y);
      if (edge && y >= y1 - 1) continue;
      const g = (k - 0.58) / 0.42 * 3;
      let gi = Math.floor(g); const gf = g - gi;
      if (gf > bay(x, y)) gi++;
      if (gi <= 0) continue;
      P(ctx, belly[Math.min(2, gi - 1)], x, y);
    }
  }
  // ---- transverse skin folds
  for (const u of [0.33, 0.60]) {
    const fx = R(U(u));
    for (let y = 0; y < H; y++) {
      const k = (y - cy) / (L * 0.21);
      if (k > 0.55) continue;
      const bend = R(Math.sin(k * 1.1) * L * 0.026);
      const x = fx + bend;
      if (!inside(x, y) || !inside(x, y + 1) || !inside(x - 1, y) || !inside(x + 1, y)) continue;
      P(ctx, ramp[1], x, y);
    }
  }
  // ---- algae & barnacle speckle on the back
  for (let y = 2; y < H - 2; y++) for (let x = 6; x < W - 6; x++) {
    if (!inside(x, y) || !inside(x, y - 1)) continue;
    const k = (y - cy) / (L * 0.2);
    if (k > -0.2) continue;
    if (hash2(x * 7, y * 13) > 0.975) P(ctx, '#3f6b4c', x, y, 1 + (x & 1), 1);
    else if (hash2(x * 11, y * 5) > 0.991) { P(ctx, ramp[4], x, y); P(ctx, ramp[0], x, y + 1); }
  }
  // ---- flipper socket crease
  const sx = R(U(0.71)), sy = R(V(0.085));
  for (let i = 0; i < R(L * 0.07); i++) if (inside(sx + i, sy + R(i * 0.4))) P(ctx, ramp[0], sx + i, sy + R(i * 0.4));
  // ---- snout: nostril, mouth crease, whiskers
  const nx = R(U(0.975)), ny = R(V(-0.048));
  P(ctx, IP.ink, nx, ny, Math.max(1, R(L * 0.022)), Math.max(1, R(L * 0.02)));
  const mx = R(U(0.955)), my = R(V(0.040));
  const wk = Math.max(1, R(L / 42));
  for (let i = 0; i < 4; i++) {
    P(ctx, ramp[4], R(U(0.99)) - (i & 1), my - 2 - i * wk);
    P(ctx, ramp[4], R(U(0.985)) - (i & 1), my + 2 + i * wk);
  }
  // ---- peduncle ridge
  for (let i = 0; i < R(L * 0.16); i++) {
    const x = R(U(0.06)) + i, y = R(V(-0.035));
    if (inside(x, y)) P(ctx, ramp[4], x, y);
  }
  if (opt.scars) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < R(L * 0.09); j++) {
      const x = R(U(0.34 + i * 0.07)) + j, y = R(V(-0.10)) + j;
      if (inside(x, y)) P(ctx, i % 2 ? ramp[4] : belly[2], x, y);
    }
  }
  return { c: o.c, f: f, W: W, H: H, cy: cy, ax: 4 + L * 0.5, ay: cy, U: U, V: V };
}
function addPropGash(b, L) {
  // three raw parallel cuts across the back, plus torn edges
  const ctx = cx2(b.c), f = b.f, W = b.W;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < b.H && f[y * W + x] > 0;
  for (let i = 0; i < 3; i++) {
    const x0 = R(b.U(0.34 + i * 0.10)), y0 = R(b.V(-0.20));
    const len = R(L * 0.13);
    for (let j = 0; j < len; j++) {
      const x = x0 + R(j * 0.55), y = y0 + j;
      if (!inside(x, y)) continue;
      P(ctx, IP.blood[1], x, y, Math.max(1, R(L * 0.030)), 1);
      P(ctx, IP.blood[3], x, y, Math.max(1, R(L * 0.018)), 1);
      P(ctx, IP.blood[0], x - 1, y, 1, 1);
      if ((j & 2) === 0) P(ctx, IP.blood[4], x + 1, y);
    }
  }
  return b;
}
function buildFluke(L, ramp) {
  const W = R(L * 0.48) + 4, H = R(L * 0.36) + 4, cy = H / 2;
  const f = blobField(W, H, [
    { x: W * 0.99, y: cy, rx: W * 0.10, ry: H * 0.13 },
    { x: W * 0.86, y: cy, rx: W * 0.12, ry: H * 0.15 },
    { x: W * 0.72, y: cy, rx: W * 0.13, ry: H * 0.19 },
    { x: W * 0.56, y: cy, rx: W * 0.15, ry: H * 0.27 },
    { x: W * 0.36, y: cy, rx: W * 0.19, ry: H * 0.39 },
    { x: W * 0.19, y: cy, rx: W * 0.17, ry: H * 0.45 },
    { x: W * 0.09, y: cy, rx: W * 0.10, ry: H * 0.36 },
  ]);
  const o = shadeBlob(W, H, f, ramp, { outline: IP.ink, lx: -0.3, ly: -0.85, lift: 0.16, smooth: 2 });
  for (let i = -2; i <= 2; i++) {
    if (!i) continue;
    for (let x = 3; x < W * 0.7; x++) {
      const y = R(cy + i * H * 0.10 + (W * 0.7 - x) * i * 0.035);
      if (y > 0 && y < H && f[y * W + x] > 0.06 && ((x + i) & 1) === 0) P(o.ctx, ramp[1], x, y);
    }
  }
  return spr(o.c, W - 2, cy);
}
function buildFlipper(L, ramp) {
  const W = R(L * 0.30) + 3, H = R(L * 0.115) + 3, cy = H / 2;
  const f = blobField(W, H, [
    { x: W * 0.10, y: cy, rx: W * 0.16, ry: H * 0.44 },
    { x: W * 0.32, y: cy + H * 0.04, rx: W * 0.20, ry: H * 0.42 },
    { x: W * 0.55, y: cy + H * 0.08, rx: W * 0.20, ry: H * 0.36 },
    { x: W * 0.76, y: cy + H * 0.12, rx: W * 0.17, ry: H * 0.28 },
    { x: W * 0.90, y: cy + H * 0.14, rx: W * 0.10, ry: H * 0.20 },
  ]);
  const o = shadeBlob(W, H, f, ramp, { outline: IP.ink, lift: 0.08, smooth: 1 });
  for (let i = 0; i < 3; i++) P(o.ctx, ramp[4], R(W * 0.84) + i, R(cy + H * 0.06) + i);
  return spr(o.c, 2, cy);
}
function buildManatee(L, who, opt) {
  opt = opt || {};
  const ramp = MAN_RAMP[who] || MAN_RAMP.you;
  const b = buildManateeBodyCan(L, ramp, opt);
  const body = spr(b.c, b.ax, b.ay);
  const scarCan = can(b.W, b.H); cx2(scarCan).drawImage(b.c, 0, 0);
  const bs = { c: scarCan, f: b.f, W: b.W, H: b.H, U: b.U, V: b.V };
  addPropGash(bs, L);
  const bodyScar = spr(scarCan, b.ax, b.ay);
  const k = Math.max(1, R(L / 30));
  return {
    L: L, k: k, who: who,
    body: body, bodyScar: bodyScar,
    fluke: buildFluke(L, ramp),
    flip: buildFlipper(L, ramp),
    flipFar: buildFlipper(L * 0.80, [ramp[0], ramp[0], ramp[1], ramp[1], ramp[2]]),
    ramp: ramp,
    eye: [b.U(0.876) - b.ax, b.V(-0.062) - b.ay],
    mouth: [b.U(0.958) - b.ax, b.V(0.046) - b.ay],
    tailX: -L * 0.245, shoX: L * 0.175, shoY: L * 0.080,
  };
}
// ---- live, expressive face -------------------------------------------------
function manateeFace(ctx, M, exp, blink, t) {
  const k = M.k, ex = R(M.eye[0]), ey = R(M.eye[1]), mx = R(M.mouth[0]), my = R(M.mouth[1]);
  const ink = IP.ink, dark = '#0b0b10', white = '#e9f0f4', sh = '#ffffff';
  const shut = blink && exp !== 'dead' && exp !== 'pain' && exp !== 'wide';
  if (exp === 'pain' || shut) {
    P(ctx, ink, ex - 1, ey, k + 3, 1);
    P(ctx, ink, ex - 2, ey - 1, 1, 1); P(ctx, ink, ex + k + 2, ey - 1, 1, 1);
    if (exp === 'pain') { P(ctx, M.ramp[0], ex - 2, ey - 2 - k, k + 4, 1); P(ctx, M.ramp[0], ex - 1, ey - 3 - k, k + 2, 1); }
  } else if (exp === 'dead') {
    P(ctx, ink, ex - 1, ey - 1, k + 3, k + 2);
    P(ctx, '#575160', ex, ey, k, k);
  } else if (exp === 'wide') {
    P(ctx, ink, ex - 2, ey - 2, k + 3, k + 3);
    P(ctx, white, ex - 1, ey - 1, k + 1, k + 1);
    P(ctx, dark, ex, ey, Math.max(1, k - 1), Math.max(1, k - 1));
    P(ctx, sh, ex, ey, 1, 1);
    P(ctx, M.ramp[0], ex - 2, ey - 4, k + 3, 1);
  } else {
    P(ctx, ink, ex - 1, ey - 1, k + 2, k + 2);
    P(ctx, dark, ex, ey, k, k);
    P(ctx, sh, ex + k - 1, ey, 1, 1);
    if (exp === 'angry') { P(ctx, M.ramp[0], ex - 2, ey - 2, k + 3, 1); P(ctx, M.ramp[0], ex + 1, ey - 3, k + 1, 1); P(ctx, ink, ex - 1, ey - 1, k + 2, 1); }
    else if (exp === 'sad') { P(ctx, M.ramp[0], ex - 2, ey - 3, k + 2, 1); P(ctx, M.ramp[0], ex - 3, ey - 2, 2, 1); }
    else P(ctx, M.ramp[1], ex - 1, ey - 2, k + 2, 1);
  }
  // mouth
  const open = exp === 'wide' || exp === 'pain' || (exp === 'talk' && (Math.floor(t * 7) & 1));
  if (open) {
    P(ctx, ink, mx - 1, my - 1, 2 * k, R(1.6 * k) + 1);
    P(ctx, '#2a1218', mx, my, Math.max(1, 2 * k - 2), Math.max(1, R(1.6 * k) - 1));
  } else {
    P(ctx, ink, mx - 1, my, 2 * k, 1);
    if (exp === 'sad') P(ctx, ink, mx - 2, my - 1, 1, 1);
  }
}
// ---- draw a manatee actor --------------------------------------------------
function drawManatee(ctx, m, t) {
  const M = m.set; if (!M) return;
  ctx.save();
  ctx.translate(R(m.x), R(m.y));
  ctx.rotate(m.rot || 0);
  const fx = m.flip ? -1 : 1;
  ctx.scale(fx * (m.sx || 1), m.sy || 1);
  const ph = m.phase || 0;
  const amp = m.tailAmp === undefined ? 0.26 : m.tailAmp;
  // far flipper first
  const fa = (m.flipperA === undefined ? 2.12 : m.flipperA) + Math.sin(ph + 0.9) * 0.26;
  ctx.save(); ctx.translate(M.shoX - 6, M.shoY - 4); ctx.rotate(fa - 0.22);
  ctx.drawImage(M.flipFar.c, -M.flipFar.ax, -M.flipFar.ay); ctx.restore();
  // tail
  ctx.save(); ctx.translate(M.tailX, 0); ctx.rotate(Math.sin(ph) * amp);
  const fl = M.fluke; ctx.drawImage(fl.c, -fl.ax, -fl.ay); ctx.restore();
  // body
  const b = m.scarred ? M.bodyScar : M.body;
  ctx.drawImage(b.c, -b.ax, -b.ay);
  if (m.flash > 0) {
    ctx.save(); ctx.globalAlpha = qa(m.flash); ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(b.c, -b.ax, -b.ay);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-b.ax, -b.ay, b.w, b.h);
    ctx.restore();
  }
  // near flipper
  ctx.save(); ctx.translate(M.shoX, M.shoY); ctx.rotate(fa);
  ctx.drawImage(M.flip.c, -M.flip.ax, -M.flip.ay); ctx.restore();
  // face
  manateeFace(ctx, M, m.exp || 'calm', m.blink, t);
  ctx.restore();
}

// ============================================================== SEA  OTTER ==
function buildOtterParts() {
  const F = ['#5d2d14', '#84431f', '#a95c2c', '#c8784a', '#e0a070'];
  // ---- gaunt, hunched body
  const W = 36, H = 30;
  const f = blobField(W, H, [
    { x: 7, y: 21, rx: 5.4, ry: 5.6 },
    { x: 13, y: 18, rx: 6.6, ry: 7.8 },
    { x: 19, y: 15, rx: 6.8, ry: 8.4 },
    { x: 25, y: 13, rx: 5.6, ry: 7.0 },
    { x: 30, y: 12, rx: 3.6, ry: 4.6 },
  ]);
  const o = shadeBlob(W, H, f, F, { outline: IP.ink, lift: 0.20, smooth: 2 });
  for (let x = 3; x < W - 3; x++) {
    let y0 = -1, y1 = -1;
    for (let y = 0; y < H; y++) if (f[y * W + x] > 0) { if (y0 < 0) y0 = y; y1 = y; }
    if (y0 < 0 || y1 - y0 < 4) continue;
    for (let y = y0; y < y1; y++) { const k = (y - y0) / (y1 - y0); if (k > 0.74) P(o.ctx, k > 0.88 ? '#e8d3ae' : '#c9ae87', x, y); }
  }
  for (let i = 0; i < 4; i++) {
    const rx = 14 + i * 4;
    for (let y = 8; y < 22; y++) if (f[y * W + rx] > 0.16) { P(o.ctx, F[0], rx, y); if ((y & 1) === 0) P(o.ctx, F[3], rx + 1, y); }
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) P(o.ctx, '#e8d3ae', 17 + i * 5 + j, 8 + j);
  const body = spr(o.c, 17, 15);
  // ---- head: big round skull, blunt muzzle, real ears
  const HW = 28, HH = 26;
  const hf = blobField(HW, HH, [
    { x: 11, y: 15, rx: 8.4, ry: 8.0 },
    { x: 17, y: 17, rx: 6.0, ry: 5.2 },
    { x: 22, y: 18, rx: 3.6, ry: 3.2 },
  ]);
  const ho = shadeBlob(HW, HH, hf, F, { outline: IP.ink, lift: 0.24, smooth: 2 });
  const hx = ho.ctx;
  P(hx, IP.ink, 4, 7, 7, 7); P(hx, F[1], 5, 8, 5, 5); P(hx, F[0], 6, 9, 3, 3);
  P(hx, IP.ink, 15, 15, 9, 7); P(hx, '#e8d3ae', 15, 16, 8, 5); P(hx, '#c9ae87', 15, 20, 8, 1);
  for (let i = 0; i < 6; i++) P(hx, '#f0e0bd', 8 + i, 7 + i);
  // crude half-made tricorn
  const HAT = { k: IP.ink, h: '#3d4767', x: '#28314c', H: '#586590', X: '#7684ad' };
  stamp(hx, [
    '...kkkkkkkkk...',
    '.kkxxxxxxxxxkk.',
    'kxxhhhhhhhhhxxk',
    'kxhhhhHHHhhhhxk',
    'kxhhhhhhhhhhhxk',
    'kkxxhhhhhhhxxkk',
    '.kkxxxxxxxxxkk.',
    '..kkkkkkkkkkk..',
  ], 0, 0, HAT);
  P(hx, '#9aa4ab', 1, 6, 13, 1);
  P(hx, IP.ink, 13, 0, 2, 3); P(hx, '#7684ad', 12, 1, 3, 2);
  P(hx, IP.ink, 0, 2, 2, 4);
  P(hx, '#c4202c', 3, 4, 4, 1);
  const head = spr(ho.c, 11, 16);
  // ---- arm
  const AW = 15, AH = 8;
  const af = blobField(AW, AH, [{ x: 3, y: 4, rx: 3.4, ry: 3.4 }, { x: 8, y: 4.2, rx: 3.6, ry: 2.8 }, { x: 12.5, y: 4.6, rx: 2.6, ry: 2.4 }]);
  const ao = shadeBlob(AW, AH, af, F, { outline: IP.ink, lift: 0.16, smooth: 1 });
  P(ao.ctx, '#e8d3ae', 11, 3, 3, 3);
  const arm = spr(ao.c, 2, 4);
  // ---- tail
  const TW = 22, TH = 12;
  const tf = blobField(TW, TH, [{ x: 4, y: 6, rx: 5.4, ry: 5.4 }, { x: 10, y: 6, rx: 5.4, ry: 4.4 }, { x: 16, y: 6, rx: 4.4, ry: 3.0 }, { x: 20, y: 6, rx: 2.8, ry: 1.8 }]);
  const to = shadeBlob(TW, TH, tf, F, { outline: IP.ink, lift: 0.16, smooth: 1 });
  const tail = spr(to.c, 2, 6);
  return { body: body, head: head, arm: arm, tail: tail, F: F, ex: -11 + 8, ey: -16 + 11, nx: -11 + 21, ny: -16 + 18 };
}
function otterFace(ctx, exp, blink, t) {
  const ink = IP.ink, O = OT;
  const ex = O.ex, ey = O.ey, nx = O.nx, ny = O.ny;
  if (blink || exp === 'sly') { P(ctx, ink, ex - 1, ey + 1, 5, 1); P(ctx, ink, ex + 7, ey + 1, 5, 1); }
  else {
    for (const dx of [0, 8]) {
      P(ctx, ink, ex + dx - 1, ey - 1, 6, 6);
      P(ctx, '#e9f0f4', ex + dx, ey, 4, 4);
      P(ctx, '#0b0b10', ex + dx + (exp === 'plot' ? 2 : 1), ey + 1, 2, 3);
      P(ctx, '#ffffff', ex + dx + 1, ey + 1, 1, 1);
    }
  }
  if (exp === 'angry' || exp === 'plot') { P(ctx, O.F[0], ex - 2, ey - 3, 6, 2); P(ctx, O.F[0], ex + 7, ey - 3, 6, 2); P(ctx, ink, ex, ey - 2, 5, 1); P(ctx, ink, ex + 8, ey - 2, 4, 1); }
  P(ctx, ink, nx - 1, ny - 1, 4, 3); P(ctx, '#2a1a10', nx, ny - 1, 2, 1);
  const talk = exp === 'talk' && (Math.floor(t * 8) & 1);
  if (talk) { P(ctx, ink, nx - 3, ny + 3, 6, 4); P(ctx, '#4a1420', nx - 2, ny + 4, 4, 2); }
  else if (exp === 'grin' || exp === 'sly') { P(ctx, ink, nx - 5, ny + 3, 8, 1); P(ctx, ink, nx + 3, ny + 2, 1, 1); P(ctx, '#e9f0f4', nx - 4, ny + 4, 6, 1); P(ctx, ink, nx - 4, ny + 5, 6, 1); }
  else P(ctx, ink, nx - 4, ny + 3, 6, 1);
  P(ctx, '#f0e0bd', nx + 2, ny - 2, 5, 1); P(ctx, '#f0e0bd', nx + 2, ny + 1, 5, 1);
}
function drawOtter(ctx, o, t) {
  const O = OT;
  ctx.save(); ctx.translate(R(o.x), R(o.y));
  if (o.flip) ctx.scale(-1, 1);
  ctx.rotate(o.rot || 0);
  const s = o.s || 1; ctx.scale(s, s);
  const ph = o.phase || 0;
  ctx.save(); ctx.translate(-12, 7); ctx.rotate(2.75 + Math.sin(ph) * 0.22);
  ctx.drawImage(O.tail.c, -O.tail.ax, -O.tail.ay); ctx.restore();
  ctx.save(); ctx.translate(8, 8); ctx.rotate((o.armFar === undefined ? 0.7 : o.armFar));
  ctx.drawImage(O.arm.c, -O.arm.ax, -O.arm.ay); ctx.restore();
  ctx.drawImage(O.body.c, -O.body.ax, -O.body.ay);
  ctx.save(); ctx.translate(12, 6); ctx.rotate((o.armNear === undefined ? 0.35 : o.armNear) + Math.sin(ph * 1.3) * 0.12);
  ctx.drawImage(O.arm.c, -O.arm.ax, -O.arm.ay); ctx.restore();
  ctx.save(); ctx.translate(16 + (o.headX || 0), -14 + (o.headY || 0) + Math.sin(ph * 0.8) * 0.6);
  ctx.rotate(o.headR || 0);
  ctx.drawImage(O.head.c, -O.head.ax, -O.head.ay);
  otterFace(ctx, o.exp || 'idle', o.blink, t);
  ctx.restore();
  ctx.restore();
}

// ================================================================== FISH ====
function buildFish(L, ramp, opt) {
  opt = opt || {};
  const W = R(L) + 4, H = R(L * 0.52) + 4, cy = H / 2;
  const f = blobField(W, H, [
    { x: W * 0.30, y: cy, rx: L * 0.14, ry: L * 0.13 },
    { x: W * 0.48, y: cy, rx: L * 0.20, ry: L * 0.21 },
    { x: W * 0.68, y: cy, rx: L * 0.17, ry: L * 0.16 },
    { x: W * 0.84, y: cy, rx: L * 0.10, ry: L * 0.08 },
  ]);
  const o = shadeBlob(W, H, f, ramp, { outline: IP.ink, lift: 0.22, smooth: 2 });
  const ctx = o.ctx;
  // tail fin + dorsal
  tri(ctx, IP.ink, 2, cy - L * 0.24, 2, cy + L * 0.24, W * 0.34, cy);
  tri(ctx, ramp[2], 4, cy - L * 0.18, 4, cy + L * 0.18, W * 0.32, cy);
  tri(ctx, IP.ink, W * 0.40, cy - L * 0.20, W * 0.62, cy - L * 0.20, W * 0.52, cy - L * 0.34);
  tri(ctx, ramp[3], W * 0.42, cy - L * 0.19, W * 0.60, cy - L * 0.19, W * 0.52, cy - L * 0.30);
  tri(ctx, ramp[1], W * 0.45, cy + L * 0.10, W * 0.62, cy + L * 0.12, W * 0.50, cy + L * 0.26);
  // stripe + eye
  for (let x = 5; x < W - 4; x++) { const y = R(cy - L * 0.03); if (f[y * W + x] > 0.1) P(ctx, ramp[4], x, y); }
  const ek = Math.max(1, R(L / 14));
  P(ctx, IP.ink, R(W * 0.78) - 1, R(cy) - 1, ek + 2, ek + 2);
  P(ctx, opt.dead ? '#cfd6c8' : '#0b0b10', R(W * 0.78), R(cy), ek, ek);
  if (opt.dead) { P(ctx, IP.ink, R(W * 0.78), R(cy), 1, 1); P(ctx, IP.ink, R(W * 0.78) + ek - 1, R(cy) + ek - 1, 1, 1); }
  else P(ctx, '#ffffff', R(W * 0.78), R(cy), 1, 1);
  return spr(o.c, W * 0.5, cy);
}

// ============================================================ HUMAN  RIGS ==
function cap(ctx, col, x0, y0, x1, y1, w) {
  const n = Math.max(1, R(Math.hypot(x1 - x0, y1 - y0)));
  ctx.fillStyle = col;
  const h = w / 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(R(x0 + (x1 - x0) * t - h), R(y0 + (y1 - y0) * t - h), w, w);
  }
}
// A silhouetted deck hand.  p: {lean, armA, armB, foreA, foreB, legA, legB,
// kneeA, kneeB, head, facing, cap}
function figure(ctx, x, y, s, p, col, rim) {
  const f = p.facing === undefined ? -1 : p.facing;
  const pass = (ox, oy, c) => {
    ctx.save(); ctx.translate(R(x + ox), R(y + oy - s * 0.47));
    const lean = p.lean || 0;
    const shX = Math.sin(lean) * -s * 0.40, shY = -s * 0.44;
    const limb = Math.max(3, R(s * 0.095));
    const leg = (a, b, side) => {
      const hx = side * Math.max(1, R(s * 0.035));
      const kx = hx + f * Math.sin(a) * s * 0.24, ky = Math.cos(a) * s * 0.24;
      cap(ctx, c, hx, 0, kx, ky, limb);
      const ex = kx + f * Math.sin(b) * s * 0.24, ey = ky + Math.cos(b) * s * 0.24;
      cap(ctx, c, kx, ky, ex, ey, Math.max(2, limb - 1));
      ctx.fillStyle = c; ctx.fillRect(R(ex) - (f > 0 ? 2 : R(s * 0.19) - 2), R(ey) - 1, R(s * 0.19), 4);
    };
    leg(p.legB === undefined ? -0.48 : p.legB, p.kneeB || 0.10, -1);
    // torso
    cap(ctx, c, 0, 0, shX * 0.45, shY * 0.45, Math.max(4, R(s * 0.25)));
    cap(ctx, c, shX * 0.45, shY * 0.45, shX, shY, Math.max(4, R(s * 0.21)));
    cap(ctx, c, shX - f * s * 0.09, shY + 1, shX + f * s * 0.09, shY + 1, Math.max(3, R(s * 0.11)));
    leg(p.legA === undefined ? 0.48 : p.legA, p.kneeA || -0.08, 1);
    const arm = (a, b, wm, off) => {
      const ax0 = shX + f * s * 0.075 * off, ay0 = shY + 1;
      const ex = ax0 + f * Math.sin(a) * s * 0.23, ey = ay0 + Math.cos(a) * s * 0.23;
      cap(ctx, c, ax0, ay0, ex, ey, Math.max(2, R(s * 0.10 * wm)));
      const hx = ex + f * Math.sin(b) * s * 0.22, hy = ey + Math.cos(b) * s * 0.22;
      cap(ctx, c, ex, ey, hx, hy, Math.max(2, R(s * 0.085 * wm)));
      return [hx, hy];
    };
    arm(p.armB === undefined ? 0.55 : p.armB, p.foreB === undefined ? 0.95 : p.foreB, 0.85, -1);
    // head: rounded skull with a peaked cap
    const hr = Math.max(4, R(s * 0.125));
    const hx2 = shX + f * Math.sin(p.head || 0) * s * 0.14, hy2 = shY - Math.cos(p.head || 0) * s * 0.15;
    ctx.fillStyle = c;
    ctx.fillRect(R(hx2) - hr, R(hy2) - hr + 1, hr * 2, hr * 2 - 1);
    ctx.fillRect(R(hx2) - hr + 1, R(hy2) - hr, hr * 2 - 2, hr * 2 + 1);
    cap(ctx, c, shX, shY, hx2, hy2 + hr, Math.max(3, R(s * 0.10)));   // neck
    ctx.fillRect(R(hx2) - hr - 1, R(hy2) - hr - 2, hr * 2 + 2, Math.max(2, R(s * 0.05)));  // cap crown
    ctx.fillRect(R(hx2) + (f > 0 ? hr : -hr - R(s * 0.13)), R(hy2) - hr, R(s * 0.13), 2); // brim
    const ha = arm(p.armA === undefined ? 0.75 : p.armA, p.foreA === undefined ? 1.15 : p.foreA, 1, 1);
    ctx.restore();
    return ha;
  };
  pass(-2, -2, rim || '#50708c');
  pass(-1, -1, rim || '#50708c');
  return pass(0, 0, col || '#0c0f15');
}
// ---- harpoon + rope --------------------------------------------------------
function buildHarpoon() {
  const c = can(30, 7), x = cx2(c);
  P(x, IP.ink, 0, 2, 26, 3);
  P(x, '#9aa6b6', 1, 3, 24, 1);
  P(x, '#5d6675', 1, 4, 24, 1);
  // barbed head
  tri(x, IP.ink, 24, 0, 24, 6, 30, 3);
  tri(x, '#cdd9ea', 25, 1, 25, 5, 29, 3);
  P(x, IP.ink, 20, 1, 2, 5);
  P(x, '#7d4a22', 2, 2, 5, 3);            // wooden butt + rope eye
  P(x, '#e0a838', 1, 1, 2, 5);
  return spr(c, 2, 3);
}
function drawRope(ctx, x0, y0, x1, y1, sag, col, dark) {
  const n = 26;
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cxp = (x0 + x1) / 2, cyp = (y0 + y1) / 2 + sag;
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, cc = t * t;
    const nx2 = a * x0 + b * cxp + cc * x1, ny2 = a * y0 + b * cyp + cc * y1;
    LN(ctx, (i & 1) ? col : dark, R(px), R(py), R(nx2), R(ny2));
    px = nx2; py = ny2;
  }
}

// ============================================================ FISHING BOAT ==
function curveAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (x <= b[0]) { const t = (x - a[0]) / (b[0] - a[0]); const s = t * t * (3 - 2 * t); return a[1] + (b[1] - a[1]) * s; }
  }
  return pts[pts.length - 1][1];
}
const BOAT_WL = 54;   // waterline inside the boat sprite
function buildFishingBoat() {
  const W = 268, H = 132, c = can(W, H), x = cx2(c);
  const sheer = [[16, 20], [46, 31], [110, 36], [180, 34], [244, 26]];
  const keel = [[36, 66], [90, 88], [150, 96], [200, 94], [244, 82]];
  const topAt = xx => curveAt(sheer, xx);
  const botAt = xx => Math.min(20 + (xx - 16) * 2.35, curveAt(keel, xx));
  for (let xx = 16; xx <= 244; xx++) {
    const t0 = R(topAt(xx)), b0 = R(botAt(xx));
    if (b0 <= t0) continue;
    for (let y = t0; y <= b0; y++) {
      let col;
      const d0 = y - t0;
      if (y < BOAT_WL - 9) col = d0 < 2 ? '#d4dac9' : ((y % 6) === 0) ? '#8e968c' : '#b9c0b2';
      else if (y < BOAT_WL - 5) col = '#2c3a4e';
      else if (y < BOAT_WL - 1) col = '#e2e6d8';
      else if (y < BOAT_WL + 3) col = '#3a5a3e';
      else col = ((y % 7) === 0) ? '#42191a' : ((y % 7) === 3) ? '#54211f' : '#5f2724';
      if (y === t0 || y === b0) col = IP.ink;
      P(x, col, xx, y);
    }
    // rubbing strake + rust streaks
    P(x, '#2a2f26', xx, R(topAt(xx)) + 4, 1, 2);
    if (hash2(xx, 3) > 0.90) for (let y = R(topAt(xx)) + 6; y < BOAT_WL - 6; y++) P(x, '#7a5a3a', xx, y);
  }
  // stern transom
  for (let y = R(topAt(244)); y <= R(botAt(244)); y++) P(x, IP.ink, 245, y);
  // ---- deck gear above the sheer
  const deckY = xx => R(topAt(xx));
  // bulwark / gunwale rail
  for (let xx = 20; xx <= 243; xx++) {
    const dy = deckY(xx);
    P(x, IP.ink, xx, dy - 9, 1, 1);
    P(x, '#9aa292', xx, dy - 8, 1, 8);
    P(x, '#5e665a', xx, dy - 2, 1, 2);
    if (xx % 13 === 0) P(x, IP.ink, xx, dy - 9, 1, 9);
  }
  // wheelhouse (aft)
  const wh = { x: 176, y: 0, w: 56, h: 34 };
  const wy = deckY(200) - 8 - wh.h;
  P(x, IP.ink, wh.x - 1, wy - 1, wh.w + 2, wh.h + 2);
  P(x, '#a8b0a2', wh.x, wy, wh.w, wh.h);
  P(x, '#c6cdbc', wh.x, wy, wh.w, 3);
  P(x, '#6d7568', wh.x, wy + wh.h - 4, wh.w, 4);
  for (let i = 0; i < 3; i++) { P(x, IP.ink, wh.x + 5 + i * 17, wy + 7, 13, 11); P(x, '#2b3a4a', wh.x + 6 + i * 17, wy + 8, 11, 9); P(x, '#4f6a80', wh.x + 6 + i * 17, wy + 8, 11, 2); }
  P(x, IP.ink, wh.x + 4, wy - 7, 8, 7); P(x, '#3a4150', wh.x + 5, wy - 6, 6, 6);   // exhaust stack
  // mast + derrick
  P(x, IP.ink, 128, wy - 40, 4, 62); P(x, '#8a6a3a', 129, wy - 39, 2, 60);
  LN(x, IP.ink, 130, wy - 38, 70, wy - 6); LN(x, '#6d7568', 130, wy - 37, 70, wy - 5);
  for (let i = 0; i < 5; i++) P(x, '#d8d0b0', 126 + i * 2, wy - 44 + i, 2, 2);
  // net drum + floats on deck
  P(x, IP.ink, 88, deckY(100) - 22, 34, 16); P(x, '#3f4a3a', 89, deckY(100) - 21, 32, 14);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 7; j++) if (((i + j) & 1) === 0) P(x, '#8fa88a', 90 + i * 2, deckY(100) - 20 + j * 2);
  for (let i = 0; i < 4; i++) { P(x, IP.ink, 48 + i * 9, deckY(60) - 14, 8, 8); P(x, '#c4202c', 49 + i * 9, deckY(60) - 13, 6, 6); P(x, '#ff6161', 49 + i * 9, deckY(60) - 13, 6, 2); }
  // round tyre fenders slung over the side on short ropes
  for (const fx of [66, 100, 156]) {
    const fy = R(topAt(fx)) + 7;
    P(x, '#c9bda0', fx + 4, R(topAt(fx)) - 8, 1, 9);
    for (let yy = -6; yy <= 6; yy++) for (let xx2 = -5; xx2 <= 5; xx2++) {
      const d = Math.hypot(xx2, yy * 1.05);
      if (d > 6) continue;
      P(x, d > 5 ? IP.ink : d > 2.6 ? ((xx2 + yy) & 1 ? '#232833' : '#2e3440') : d > 2.0 ? IP.ink : '#7c8496', fx + 4 + xx2, fy + yy);
    }
    P(x, '#4a5260', fx + 1, fy - 4, 2, 2);
  }
  // hull planking seams + a name board
  for (let xx = 20; xx < 240; xx++) {
    if (xx % 24 === 0) for (let y = R(topAt(xx)) + 2; y < BOAT_WL - 10; y++) P(x, '#98a096', xx, y);
  }
  P(x, IP.ink, 188, BOAT_WL - 24, 46, 10); P(x, '#22303f', 189, BOAT_WL - 23, 44, 8);
  for (let i = 0; i < 6; i++) P(x, '#c8a63a', 193 + i * 7, BOAT_WL - 21, 4, 4);
  // ---- stern gear: shaft, A-bracket, rudder
  LN(x, IP.ink, 232, 74, 254, 92); LN(x, IP.ink, 233, 74, 255, 92);
  P(x, '#5d6675', 233, 75, 2, 2); P(x, '#5d6675', 240, 81, 2, 2); P(x, '#5d6675', 247, 87, 2, 2);
  LN(x, IP.ink, 244, 72, 252, 88); LN(x, '#6d7686', 245, 72, 253, 88);
  P(x, IP.ink, 240, 62, 5, 22); P(x, '#4a525e', 241, 63, 3, 20); P(x, '#767f8d', 241, 63, 1, 20);
  return { s: spr(c, W / 2, BOAT_WL), prop: [254 - W / 2, 92 - BOAT_WL], gun: [200 - W / 2, wy - 8 - BOAT_WL], W: W, H: H, deckY: deckY(180) - 8 - BOAT_WL };
}
function drawProp(ctx, x, y, r, ang, churn) {
  ctx.save(); ctx.translate(R(x), R(y));
  // motion arcs
  if (churn > 0) {
    for (let i = 0; i < 4; i++) {
      const a = qa(0.10 + i * 0.05) * churn;
      ctx.fillStyle = rgbaq('#dff0ff', a);
      const rr = r * (0.55 + i * 0.15);
      ctx.fillRect(-R(rr * 0.42), -R(rr), Math.max(1, R(rr * 0.84)), Math.max(1, R(rr * 2)));
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = ang + i * TAU / 3;
    const tipY = Math.sin(a) * r, tipX = Math.cos(a) * r * 0.36;
    const bl = Math.abs(Math.cos(a)) > 0.8 ? '#8d97a6' : '#c3ccd8';
    tri(ctx, IP.ink, -1, 0, tipX - 2, tipY, tipX + 3, tipY - 1);
    tri(ctx, bl, 0, 0, tipX - 1, tipY, tipX + 2, tipY - 1);
  }
  P(ctx, IP.ink, -3, -4, 7, 9); P(ctx, '#9aa6b6', -2, -3, 5, 7); P(ctx, '#d8e2ee', -2, -3, 2, 7);
  ctx.restore();
}

// ================================================================== YACHT ===
const YACHT_WL = 70;
function buildYacht() {
  const W = 392, H = 156, c = can(W, H), x = cx2(c);
  // hull: bow at the RIGHT, transom at the LEFT
  const sheer = [[22, 36], [120, 30], [250, 22], [340, 10], [368, 4]];
  const keel = [[22, 72], [66, 94], [150, 106], [250, 100], [320, 82], [356, 62]];
  const stem = xx => 4 + (368 - xx) * 2.9;
  for (let xx = 22; xx <= 368; xx++) {
    const t0 = R(curveAt(sheer, xx)), b0 = R(Math.min(stem(xx), curveAt(keel, xx)));
    if (b0 <= t0) continue;
    for (let y = t0; y <= b0; y++) {
      let col;
      if (y < YACHT_WL - 10) col = '#e6ecf2';
      else if (y < YACHT_WL - 6) col = '#c0c9d4';
      else if (y < YACHT_WL - 2) col = '#1c2a44';
      else if (y < YACHT_WL + 2) col = '#c8a63a';
      else col = ((y % 8) === 0) ? '#101826' : '#1b2636';
      if (y === t0 || y === b0) col = IP.ink;
      P(x, col, xx, y);
    }
  }
  // bulbous bow
  for (let yy = -7; yy <= 7; yy++) for (let xx = -11; xx <= 11; xx++) {
    const d = Math.hypot(xx / 11, yy / 7);
    if (d > 1) continue;
    P(x, d > 0.86 ? IP.ink : yy < -2 ? '#2c3a52' : '#1b2636', 352 + xx, 66 + yy);
  }
  // skeg, shaft and rudder aft
  P(x, IP.ink, 92, 100, 40, 10); P(x, '#141c2a', 93, 101, 38, 8);
  LN(x, IP.ink, 60, 94, 96, 104); LN(x, '#4a5568', 61, 94, 97, 104);
  P(x, IP.ink, 50, 88, 6, 20); P(x, '#222c3e', 51, 89, 4, 18); P(x, '#4a5568', 51, 89, 1, 18);
  // long tinted window band
  for (let xx = 60; xx <= 300; xx++) {
    const t0 = R(curveAt(sheer, xx));
    P(x, IP.ink, xx, t0 + 9, 1, 9);
    P(x, '#16202f', xx, t0 + 10, 1, 7);
    if ((xx % 31) < 9) P(x, '#41546e', xx, t0 + 10, 1, 7);
    P(x, '#8e99a8', xx, t0 + 10, 1, 1);
  }
  // ---- superstructure
  const deck = xx => R(curveAt(sheer, xx));
  const c1 = { x: 74, w: 196, h: 36 }, cy1 = deck(170) - c1.h;
  P(x, IP.ink, c1.x - 1, cy1 - 1, c1.w + 2, c1.h + 2);
  P(x, '#f2f6fa', c1.x, cy1, c1.w, c1.h);
  P(x, '#cfd8e2', c1.x, cy1 + c1.h - 5, c1.w, 5);
  for (let i = 0; i < 9; i++) { P(x, IP.ink, c1.x + 8 + i * 21, cy1 + 8, 17, 15); P(x, '#1a2739', c1.x + 9 + i * 21, cy1 + 9, 15, 13); P(x, '#4e627c', c1.x + 9 + i * 21, cy1 + 9, 15, 3); }
  // flybridge
  const c2 = { x: 128, w: 108, h: 22 }, cy2 = cy1 - c2.h;
  P(x, IP.ink, c2.x - 1, cy2 - 1, c2.w + 2, c2.h + 2);
  P(x, '#f2f6fa', c2.x, cy2, c2.w, c2.h);
  P(x, '#1a2739', c2.x + 6, cy2 + 5, c2.w - 12, 10);
  P(x, '#4e627c', c2.x + 6, cy2 + 5, c2.w - 12, 2);
  // radar arch + antennae
  P(x, IP.ink, c2.x + 12, cy2 - 16, 5, 16); P(x, IP.ink, c2.x + c2.w - 18, cy2 - 16, 5, 16);
  P(x, '#dbe3ec', c2.x + 13, cy2 - 15, 3, 15); P(x, '#dbe3ec', c2.x + c2.w - 17, cy2 - 15, 3, 15);
  P(x, IP.ink, c2.x + 12, cy2 - 18, c2.w - 24, 4); P(x, '#dbe3ec', c2.x + 13, cy2 - 17, c2.w - 26, 2);
  P(x, IP.ink, c2.x + 44, cy2 - 26, 16, 8); P(x, '#b9c4d0', c2.x + 45, cy2 - 25, 14, 6);
  P(x, '#dbe3ec', c2.x + 70, cy2 - 34, 1, 18);
  // foredeck rails
  for (let xx = 276; xx < 356; xx += 12) { const d = deck(xx); P(x, '#c3ccd8', xx, d - 13, 1, 13); P(x, IP.ink, xx, d - 14, 1, 1); }
  for (let xx = 274; xx < 358; xx++) { const d = deck(xx); P(x, '#dfe6ee', xx, d - 13, 1, 1); P(x, '#9aa6b6', xx, d - 7, 1, 1); }
  // aft deck rails
  for (let xx = 26; xx < 72; xx += 11) { const d = deck(xx); P(x, '#c3ccd8', xx, d - 13, 1, 13); }
  for (let xx = 24; xx < 74; xx++) { const d = deck(xx); P(x, '#dfe6ee', xx, d - 13, 1, 1); P(x, '#9aa6b6', xx, d - 7, 1, 1); }
  return { s: spr(c, W / 2, YACHT_WL), W: W, H: H, deck: deck, cy1: cy1, c1: c1, rail: [300 - W / 2, deck(300) - 13 - YACHT_WL], aft: [48 - W / 2, deck(48) - 13 - YACHT_WL] };
}

// =========================================================== BUSINESSMAN ====
function buildBiz() {
  const SUIT = ['#151928', '#20263c', '#2d3450', '#3c4568', '#4e588a'];
  const SKIN = ['#8a5a3a', '#b47a52', '#d79a6e', '#e9b78c', '#f6d0aa'];
  // ---- body: narrow shoulders, enormous belly
  const W = 34, H = 40;
  const f = blobField(W, H, [
    { x: 15, y: 8, rx: 8.5, ry: 6.5 },
    { x: 16, y: 16, rx: 11.5, ry: 8.5 },
    { x: 16, y: 24, rx: 13.0, ry: 9.5 },
    { x: 15, y: 31, rx: 10.5, ry: 7.0 },
  ]);
  const o = shadeBlob(W, H, f, SUIT, { outline: IP.ink, lift: 0.22, smooth: 3 });
  const b = o.ctx;
  // shirt + tie down the belly
  for (let y = 4; y < 30; y++) {
    const half = Math.max(1, R(4 - (y - 4) * 0.02));
    P(b, '#eef3f8', 15 - half, y, half * 2, 1);
  }
  P(b, IP.ink, 14, 4, 2, 26); P(b, IP.ink, 17, 4, 2, 26);
  for (let y = 7; y < 30; y++) { const w2 = Math.max(1, R(1.4 + (y - 7) * 0.12)); P(b, '#a8151f', 16 - (w2 >> 1), y, w2, 1); P(b, '#c4202c', 16 - (w2 >> 1), y, 1, 1); }
  P(b, '#e8515a', 15, 5, 3, 3); P(b, IP.ink, 15, 4, 3, 1);
  // lapels
  LN(b, SUIT[4], 12, 4, 8, 18); LN(b, SUIT[0], 13, 4, 9, 18);
  LN(b, SUIT[4], 20, 4, 25, 18); LN(b, SUIT[0], 19, 4, 24, 18);
  P(b, '#e0a838', 24, 20, 2, 2);          // pocket square / button
  // trousers + shoes
  P(b, IP.ink, 7, 36, 10, 5); P(b, '#1a1f30', 8, 36, 8, 4);
  P(b, IP.ink, 17, 36, 10, 5); P(b, '#252c44', 18, 36, 8, 4);
  const body = spr(o.c, 16, 20);
  // ---- head
  const HW = 22, HH = 20;
  const hf = blobField(HW, HH, [
    { x: 10, y: 9, rx: 7.2, ry: 7.0 },
    { x: 14, y: 12, rx: 5.4, ry: 4.6 },
    { x: 10, y: 15, rx: 6.6, ry: 4.4 },
  ]);
  function headWith(grin) {
    const ho = shadeBlob(HW, HH, hf, SKIN, { outline: IP.ink, lift: 0.24, smooth: 2 });
    const h = ho.ctx;
    // slicked-back hair
    stamp(h, [
      '..kkkkkkk..',
      '.kHHHHHHHk.',
      'kHHhhhhhHHk',
      'kHhhhhhhhhk',
      '.kHhhhhhhk.',
    ], 2, 0, { k: IP.ink, H: '#3a2c1e', h: '#251a12' });
    P(h, '#5a4630', 4, 2, 5, 1);
    // ear
    P(h, IP.ink, 4, 9, 3, 4); P(h, SKIN[1], 5, 10, 2, 2);
    // sunglasses
    P(h, IP.ink, 6, 7, 13, 5);
    P(h, '#0b0d13', 7, 8, 5, 3); P(h, '#0b0d13', 13, 8, 5, 3);
    P(h, '#3c4a5e', 7, 8, 5, 1); P(h, '#3c4a5e', 13, 8, 5, 1);
    P(h, '#cfe0ee', 10, 9, 1, 1); P(h, '#cfe0ee', 16, 9, 1, 1);
    P(h, IP.ink, 12, 9, 1, 1);
    // jowls
    P(h, SKIN[1], 6, 15, 9, 1); P(h, SKIN[1], 7, 17, 7, 1);
    if (grin) {
      P(h, IP.ink, 9, 14, 9, 5);
      P(h, '#f4f7fb', 10, 15, 7, 2);
      P(h, '#c4202c', 10, 17, 7, 1);
      for (let i = 0; i < 3; i++) P(h, IP.ink, 11 + i * 2, 15, 1, 2);
    } else {
      P(h, IP.ink, 10, 15, 6, 2); P(h, SKIN[1], 10, 17, 6, 1);
    }
    return spr(ho.c, 10, 11);
  }
  // ---- arm + hand
  const AW = 18, AH = 9;
  const af = blobField(AW, AH, [{ x: 4, y: 4.5, rx: 4.4, ry: 4.2 }, { x: 10, y: 4.5, rx: 4.0, ry: 3.4 }, { x: 15, y: 4.5, rx: 2.8, ry: 2.6 }]);
  const ao = shadeBlob(AW, AH, af, SUIT, { outline: IP.ink, lift: 0.18, smooth: 1 });
  P(ao.ctx, '#eef3f8', 13, 3, 2, 4);
  P(ao.ctx, IP.ink, 15, 2, 3, 6); P(ao.ctx, SKIN[3], 15, 3, 3, 4); P(ao.ctx, SKIN[4], 15, 3, 3, 1);
  const arm = spr(ao.c, 3, 4.5);
  // ---- binoculars
  const bc = can(16, 10), bx = cx2(bc);
  P(bx, IP.ink, 0, 0, 12, 10); P(bx, '#2a3040', 1, 1, 10, 8);
  P(bx, '#4c576e', 1, 1, 10, 2); P(bx, '#14181f', 1, 7, 10, 2);
  P(bx, IP.ink, 11, 1, 5, 3); P(bx, '#3a4356', 12, 2, 4, 1);
  P(bx, IP.ink, 11, 6, 5, 3); P(bx, '#3a4356', 12, 7, 4, 1);
  P(bx, '#8fa4bc', 2, 2, 2, 1);
  const binoc = spr(bc, 2, 5);
  // ---- cigar
  const cc = can(12, 5), cxx = cx2(cc);
  P(cxx, IP.ink, 0, 0, 11, 5); P(cxx, '#4a2c18', 1, 1, 8, 3); P(cxx, '#6d4327', 1, 1, 8, 1);
  P(cxx, '#ff8b2e', 9, 1, 2, 3); P(cxx, '#ffd27a', 9, 2, 2, 1);
  const cigar = spr(cc, 1, 2);
  return { body: body, head: headWith(false), headGrin: headWith(true), arm: arm, binoc: binoc, cigar: cigar };
}
function drawBiz(ctx, o, t) {
  const B = BIZ;
  ctx.save(); ctx.translate(R(o.x), R(o.y));
  if (o.flip) ctx.scale(-1, 1);
  const s = o.s || 1; ctx.scale(s, s);
  const bob = Math.sin(t * 2.2) * 0.6;
  // far arm
  ctx.save(); ctx.translate(-2, -8 + bob); ctx.rotate(o.armFar === undefined ? 0.9 : o.armFar);
  ctx.drawImage(B.arm.c, -B.arm.ax, -B.arm.ay); ctx.restore();
  ctx.save(); ctx.translate(0, bob);
  ctx.drawImage(B.body.c, -B.body.ax, -B.body.ay);
  ctx.restore();
  // head
  const hd = o.grin ? B.headGrin : B.head;
  ctx.save(); ctx.translate(2 + (o.headX || 0), -26 + bob + (o.headY || 0)); ctx.rotate(o.headR || 0);
  ctx.drawImage(hd.c, -hd.ax, -hd.ay);
  if (o.cigar) { ctx.drawImage(B.cigar.c, 6, -1); }
  ctx.restore();
  // near arm (+ binoculars)
  const an = o.armNear === undefined ? 1.1 : o.armNear;
  ctx.save(); ctx.translate(2, -10 + bob); ctx.rotate(an);
  ctx.drawImage(B.arm.c, -B.arm.ax, -B.arm.ay);
  if (o.binoc) { ctx.translate(B.arm.w - 5, 1); ctx.rotate(-an); ctx.drawImage(B.binoc.c, -B.binoc.ax, -B.binoc.ay); }
  ctx.restore();
  ctx.restore();
}

// ================================================================= CRANE ====
function buildCrane() {
  function truss(L, T) {
    const c = can(L, T), x = cx2(c);
    P(x, IP.ink, 0, 0, L, T);
    P(x, '#e0a838', 1, 1, L - 2, 3); P(x, '#f8dc86', 1, 1, L - 2, 1);
    P(x, '#a87a1e', 1, T - 4, L - 2, 3); P(x, '#7a5612', 1, T - 2, L - 2, 1);
    for (let i = 2; i < L - 6; i += 12) {
      LN(x, '#c89a30', i, 4, i + 6, T - 5);
      LN(x, '#c89a30', i + 6, 4, i + 12, T - 5);
      LN(x, IP.ink, i + 1, 4, i + 7, T - 5);
    }
    for (let i = 3; i < L - 3; i += 16) { P(x, '#f8dc86', i, 2, 1, 1); P(x, '#f8dc86', i, T - 3, 1, 1); }
    return spr(c, 3, T / 2);
  }
  // pivot housing
  const pc = can(26, 24), px2 = cx2(pc);
  P(px2, IP.ink, 0, 0, 26, 24); P(px2, '#4a525e', 1, 1, 24, 22);
  P(px2, '#767f8d', 1, 1, 24, 4); P(px2, '#2a3038', 1, 18, 24, 5);
  for (let i = 0; i < 4; i++) { P(px2, '#aab3c0', 4 + i * 6, 6, 2, 2); P(px2, IP.ink, 4 + i * 6, 8, 2, 1); }
  P(px2, '#e0a838', 3, 12, 20, 3); P(px2, IP.ink, 3, 15, 20, 1);
  const pivot = spr(pc, 13, 12);
  // claw body + finger
  const cb = can(38, 24), bx = cx2(cb);
  P(bx, IP.ink, 0, 0, 38, 24); P(bx, '#5d6675', 1, 1, 36, 22);
  P(bx, '#8c97a8', 1, 1, 36, 4); P(bx, '#343b46', 1, 18, 36, 5);
  P(bx, IP.ink, 6, 5, 8, 14); P(bx, '#232935', 7, 6, 6, 12); P(bx, '#aab3c0', 7, 6, 6, 3);
  P(bx, IP.ink, 24, 5, 8, 14); P(bx, '#232935', 25, 6, 6, 12); P(bx, '#aab3c0', 25, 6, 6, 3);
  P(bx, '#e0a838', 16, 2, 6, 20); P(bx, IP.ink, 16, 2, 1, 20);
  for (let i = 0; i < 4; i++) { P(bx, '#c0cad6', 4 + i * 9, 20, 3, 2); P(bx, IP.ink, 4 + i * 9, 22, 3, 1); }
  const clawBody = spr(cb, 19, 6);
  const fc = can(34, 16), fx = cx2(fc);
  for (let i = 0; i < 28; i++) {
    const yy = R(3 + Math.pow(i / 28, 2.1) * 9);
    P(fx, IP.ink, i + 1, yy - 1, 1, 9);
    P(fx, '#6d7686', i + 1, yy, 1, 7);
    P(fx, '#aab3c0', i + 1, yy, 1, 2);
  }
  tri(fx, IP.ink, 28, 9, 34, 14, 28, 16);
  tri(fx, '#cdd9ea', 28, 10, 32, 14, 28, 15);
  const finger = spr(fc, 2, 6);
  return { boom1: truss(200, 20), boom2: truss(86, 14), pivot: pivot, clawBody: clawBody, finger: finger };
}
function drawCrane(ctx, o) {
  const C = CR;
  ctx.save(); ctx.translate(R(o.x), R(o.y));
  ctx.drawImage(C.pivot.c, -C.pivot.ax, -C.pivot.ay);
  ctx.rotate(o.a1);
  ctx.drawImage(C.boom1.c, -C.boom1.ax, -C.boom1.ay);
  ctx.translate(C.boom1.w - 6, 0);
  if (o.hook) { P(ctx, IP.ink, -2, -6, 4, 12); P(ctx, '#aab3c0', -1, -5, 2, 10); }
  ctx.rotate(o.a2);
  ctx.drawImage(C.boom2.c, -C.boom2.ax, -C.boom2.ay);
  ctx.translate(C.boom2.w - 6, 0);
  ctx.rotate(o.a3 === undefined ? -o.a1 - o.a2 : o.a3);
  // claw
  ctx.drawImage(C.clawBody.c, -C.clawBody.ax, -C.clawBody.ay);
  const sp = o.open === undefined ? 0.7 : o.open;
  for (const [sx, dir] of [[-13, -1], [0, 0], [13, 1]]) {
    ctx.save(); ctx.translate(sx, 17); ctx.rotate(dir === 0 ? 1.57 : 1.57 + dir * sp * 0.8); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.drawImage(C.finger.c, -C.finger.ax, -C.finger.ay);
    ctx.restore();
  }
  ctx.restore();
}

// =================================================================== NET ====
function drawNet(ctx, o) {
  const N = 12, M = 18;
  const WS = [1.00, 1.05, 1.08, 1.08, 1.05, 1.00, 0.95, 0.88, 0.80, 0.71, 0.61, 0.50, 0.36];
  const cinch = o.cinch || 0, t = o.t || 0;
  const pts = [];
  for (let j = 0; j <= N; j++) {
    const row = [];
    let wj = o.w * 0.5 * WS[j];
    if (j < 5) wj *= (1 - 0.86 * cinch * (1 - j / 6));
    const cxj = o.x + Math.sin(t * 1.4 + j * 0.5) * (o.sway || 0) * (j / N);
    const yj = o.y + (j / N) * o.h + Math.sin(t * 1.9 + j) * (o.sway || 0) * 0.25;
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      row.push([cxj + (u - 0.5) * 2 * wj, yj + Math.sin(u * Math.PI) * o.h * 0.05 * (1 - j / N)]);
    }
    pts.push(row);
  }
  const hole = o.hole;
  const knot = '#a9bdb0', dk = '#2c3f38';
  for (let j = 0; j <= N; j++) for (let i = 0; i < M; i++) {
    if (hole && j >= hole.j && j < hole.j + hole.h && i >= hole.i && i < hole.i + hole.w) continue;
    LN(ctx, (i & 1) ? knot : dk, R(pts[j][i][0]), R(pts[j][i][1]), R(pts[j][i + 1][0]), R(pts[j][i + 1][1]));
  }
  for (let i = 0; i <= M; i++) for (let j = 0; j < N; j++) {
    if (hole && j >= hole.j && j < hole.j + hole.h && i > hole.i && i < hole.i + hole.w) continue;
    LN(ctx, (j & 1) ? knot : dk, R(pts[j][i][0]), R(pts[j][i][1]), R(pts[j + 1][i][0]), R(pts[j + 1][i][1]));
  }
  // lead weights on the mouth rim
  for (let i = 0; i <= M; i += 3) {
    const p = pts[0][i];
    P(ctx, IP.ink, R(p[0]) - 2, R(p[1]) - 2, 5, 5);
    P(ctx, '#3c424c', R(p[0]) - 1, R(p[1]) - 1, 3, 3);
    P(ctx, '#767f8d', R(p[0]) - 1, R(p[1]) - 1, 2, 1);
  }
  return pts;
}

// ================================================================== TANK ====
function buildTank() {
  const bg = buildWater(IP.tank, 640, 360, { wob: 1.1, pow: 0.85 });
  const x = cx2(bg);
  // suspended muck and light streaks
  for (let i = 0; i < 700; i++) {
    const mx = R(hash2(i, 3) * 640), my = R(hash2(i * 5, 9) * 360);
    P(x, hash2(i, 11) > 0.5 ? '#8fa85c' : '#2b3a1c', mx, my, 1 + (i & 1), 1);
  }
  for (let i = 0; i < 5; i++) {
    const sx = R(hash2(i * 13, 2) * 420), sw = R(8 + hash2(i, 7) * 18);
    for (let y = 0; y < 300; y++) { const a = qa((1 - y / 300) * 0.05); if (a > 0) { x.fillStyle = rgbaq('#d8f0a0', a); x.fillRect(sx + R(y * 0.10), y, sw, 1); } }
  }
  // sludge floor with bones and rubbish
  for (let px = 0; px < 640; px++) {
    const yy = 330 + R(vnoise(px * 0.03, 2) * 10);
    P(x, IP.ink, px, yy, 1, 1);
    for (let y = yy + 1; y < 360; y++) P(x, hash2(px, y) > 0.6 ? '#232f16' : '#1a2410', px, y);
  }
  for (let i = 0; i < 26; i++) {
    const bx = R(hash2(i * 7, 21) * 640), by = 336 + R(hash2(i, 5) * 16);
    P(x, IP.ink, bx, by, 7, 3); P(x, '#c9c2a4', bx + 1, by + 1, 5, 1);
  }
  // ---- riveted frame
  const fr = can(640, 360), f = cx2(fr);
  const drawBar = (bx, by, bw, bh) => {
    P(f, IP.ink, bx, by, bw, bh);
    P(f, '#4b5460', bx + 1, by + 1, bw - 2, bh - 2);
    P(f, '#79838f', bx + 1, by + 1, bw - 2, 2);
    P(f, '#2a303a', bx + 1, by + bh - 4, bw - 2, 3);
    for (let i = 4; i < (bw > bh ? bw : bh) - 4; i += 13) {
      if (bw > bh) { P(f, '#9aa4b0', bx + i, by + 4, 2, 2); P(f, IP.ink, bx + i, by + 6, 2, 1); }
      else { P(f, '#9aa4b0', bx + 4, by + i, 2, 2); P(f, IP.ink, bx + 4, by + i + 2, 2, 1); }
    }
    // rust
    for (let i = 0; i < bw * bh / 26; i++) {
      const rx = bx + R(hash2(i * 3, bx) * bw), ry = by + R(hash2(i * 7, by) * bh);
      P(f, hash2(rx, ry) > 0.5 ? '#7a4a26' : '#5c3418', rx, ry, 2, 1);
    }
  };
  drawBar(0, 0, 640, 22); drawBar(0, 338, 640, 22);
  drawBar(0, 0, 20, 360); drawBar(620, 0, 20, 360);
  drawBar(430, 18, 14, 324);
  // ---- grimy glass
  const gl = can(640, 360), g = cx2(gl);
  for (let i = 0; i < 46; i++) {
    const sx = R(hash2(i * 11, 5) * 640), sy = R(hash2(i * 3, 17) * 340), sh = R(20 + hash2(i, 9) * 120);
    g.fillStyle = rgbaq('#cfe8c8', qa(0.05 + hash2(i, 2) * 0.05));
    g.fillRect(sx, sy, 1 + (i % 3), sh);
  }
  for (let i = 0; i < 24; i++) {
    const sx = R(hash2(i * 19, 8) * 640), sy = R(hash2(i * 23, 4) * 340);
    g.fillStyle = rgbaq('#2c3a18', qa(0.10 + hash2(i, 6) * 0.10));
    g.fillRect(sx, sy, R(10 + hash2(i, 3) * 40), R(4 + hash2(i, 12) * 14));
  }
  for (let i = 0; i < 6; i++) {
    const sx = R(hash2(i * 29, 1) * 600);
    g.fillStyle = rgbaq('#f2fff0', 0.06);
    for (let y = 22; y < 338; y++) g.fillRect(sx + R(y * 0.16), y, 14, 1);
  }
  // ---- the deck seen through the glass
  const dv = can(300, 250), d = cx2(dv);
  for (let y = 0; y < 96; y++) {
    const k = y / 96, cols = IP.sky;
    const fi = k * (cols.length - 1);
    let i0 = Math.floor(fi), frr = fi - i0; i0 = clamp(i0, 0, cols.length - 1);
    for (let px = 0; px < 300; px++) P(d, cols[clamp(frr > bay(px, y) ? i0 + 1 : i0, 0, cols.length - 1)], px, y);
  }
  // sea horizon
  P(d, '#2d74ab', 0, 88, 300, 8); P(d, '#1a4b78', 0, 92, 300, 4);
  // deck planks
  for (let y = 96; y < 250; y++) {
    const col = ((y % 9) === 0) ? '#8e8572' : ((y % 9) < 4 ? '#cfc6ae' : '#bdb49c');
    P(d, col, 0, y, 300, 1);
  }
  for (let px = 0; px < 300; px += 37) P(d, '#8e8572', px, 96, 1, 154);
  // railing + stanchions
  for (let px = 10; px < 300; px += 40) { P(d, IP.ink, px, 40, 4, 58); P(d, '#c3ccd8', px + 1, 41, 2, 56); }
  P(d, IP.ink, 0, 40, 300, 4); P(d, '#dfe6ee', 0, 41, 300, 2);
  P(d, IP.ink, 0, 66, 300, 3); P(d, '#b9c4d0', 0, 67, 300, 1);
  // crates, a cooler and a winch
  P(d, IP.ink, 30, 118, 54, 40); P(d, '#8a5f2f', 31, 119, 52, 38); P(d, '#b5813f', 31, 119, 52, 4);
  for (let i = 0; i < 4; i++) P(d, '#5c3a1c', 31, 124 + i * 9, 52, 2);
  P(d, IP.ink, 190, 128, 64, 34); P(d, '#d8dde4', 191, 129, 62, 32); P(d, '#9aa6b6', 191, 153, 62, 8);
  P(d, '#c4202c', 196, 133, 52, 4);
  P(d, IP.ink, 110, 100, 40, 30); P(d, '#4a525e', 111, 101, 38, 28); P(d, '#767f8d', 111, 101, 38, 5);
  for (let i = 0; i < 5; i++) P(d, '#2a3038', 114 + i * 7, 106, 3, 20);
  return { bg: bg, frame: fr, glass: gl, deck: dv };
}

// ============================================================ ASSET STORE ==
const WATER = {}, LAY = {}, MAN = {};
let OT = null, BIZ = null, CR = null, BOAT = null, YAC = null, TANK = null, HARP = null;
let FISHSPR = [], FISHDEAD = [], BUILT = false;

function buildNearClutter(seed, kramp) {
  const H = 200, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let i = 0; i < 5; i++) drawRockForm(x, R(rng.range(0, LW)), H + 6, R(rng.range(60, 130)), R(rng.range(30, 66)), IP.rock, false);
  for (let i = 0; i < 6; i++) {
    const kx = R(rng.range(0, LW));
    kelpStalk(kx, rng, H - 1, R(rng.range(90, 180)), kramp, R(rng.range(4, 6)), rng.range(-0.5, 0.5))(x);
  }
  return c;
}
function buildFarRidge(seed, tint) {
  const H = 150, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let i = 0; i < 16; i++) {
    const rx = R(rng.range(0, LW)), w = R(rng.range(40, 110)), h = R(rng.range(20, 74));
    drawRockForm(x, rx, H - R(rng.range(0, 5)), w, h, IP.rock, rng.next() > 0.6);
  }
  for (let i = 0; i < 10; i++) {
    const kx = R(rng.range(0, LW));
    kelpStalk(kx, rng, H - 2, R(rng.range(30, 74)), IP.kelp, 2, rng.range(-0.4, 0.4))(x);
  }
  return tintLayer(c, tint, 0.62);
}
function buildIntroArt() {
  if (BUILT) return;
  if (typeof blobField !== 'function' || typeof shadeBlob !== 'function') return;
  WATER.shallow = buildWater(IP.shallow, 640, 360, { pow: 1.05 });
  WATER.open = buildWater(IP.open, 640, 360, { pow: 1.0 });
  WATER.deep = buildWater(IP.deep, 640, 360, { pow: 0.9 });
  WATER.night = buildWater(IP.night, 640, 360, { pow: 0.85 });
  LAY.shafts = buildShafts(LW, 300, '#d4f8ff');
  LAY.bed = buildBed();
  LAY.grassNear = buildGrass(44, IP.grass, 150, 42, 771);
  LAY.grassFar = tintLayer(buildGrass(28, IP.grass, 120, 26, 991), '#144a58', 0.55);
  LAY.midS = buildShallowMid(4242);
  LAY.nearS = tintLayer(buildNearClutter(313, IP.kelp), '#04141d', 0.76);
  LAY.farS = buildFarRidge(777, '#16525f');
  LAY.midD = buildDeepMid(1234);
  LAY.nearD = tintLayer(buildNearClutter(555, ['#101c20', '#1b2e2c', '#27403a', '#365349', '#496c5c']), '#02060c', 0.82);
  LAY.farD = buildFarRidge(888, '#071a2c');
  LAY.surfS = buildSurfaceUnder(11, IP.foam, '#48ad9e');
  LAY.surfD = buildSurfaceUnder(12, ['#9dbdd4', '#cfe4f0', '#eef8ff'], '#2d74ab');
  MAN.dad = buildManatee(98, 'dad', { scars: true });
  MAN.mom = buildManatee(86, 'mom');
  MAN.you = buildManatee(54, 'you');
  MAN.bro = buildManatee(40, 'bro');
  MAN.youBig = buildManatee(96, 'you');
  MAN.broBig = buildManatee(58, 'bro');
  OT = buildOtterParts();
  BIZ = buildBiz();
  CR = buildCrane();
  BOAT = buildFishingBoat();
  YAC = buildYacht();
  TANK = buildTank();
  HARP = buildHarpoon();
  const fr = [
    ['#7a5a18', '#a8801f', '#d2a52f', '#eec756', '#fdeb9f'],
    ['#1d4a6a', '#2a6a92', '#3b8db8', '#63b3d8', '#a3dcf0'],
    ['#6a2a30', '#933b44', '#bc5560', '#dd8188', '#f4b8bc'],
    ['#3d5a22', '#557a2f', '#74a040', '#9cc35f', '#c8e493'],
  ];
  FISHSPR = []; FISHDEAD = [];
  for (let i = 0; i < 4; i++) {
    FISHSPR.push([buildFish(7, fr[i]), buildFish(11, fr[i]), buildFish(17, fr[i])]);
    FISHDEAD.push(buildFish(14, ['#3a4038', '#50584a', '#6d7562', '#8b9480', '#b0b8a2'], { dead: true }));
  }
  BUILT = true;
}

// ==================================================================== FX ====
const FX = {
  list: [],
  clear() { this.list.length = 0; },
  add(o) { if (this.list.length < 460) this.list.push(o); return o; },
  bubble(x, y, n, spd) {
    for (let i = 0; i < n; i++) this.add({ k: 'b', x: x + rand(-8, 8), y: y + rand(-6, 6), vx: rand(-8, 8), vy: -rand(14, 40) * (spd || 1), r: randi(1, 3), life: rand(1.2, 3.4), ph: rand(0, TAU) });
  },
  blood(x, y, n, pw) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(8, 54) * (pw || 1);
      this.add({ k: 'r', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: rand(2, 7) * (pw || 1), g: rand(1.4, 3.6), life: rand(1.6, 4.2), max: 0 });
    }
  },
  foam(x, y, n, pw) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(20, 120) * (pw || 1);
      this.add({ k: 'f', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(1, 4), life: rand(0.3, 0.9) });
    }
  },
  drops(x, y, n, up) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.92, -Math.PI * 0.08), s = rand(40, 230) * (up || 1);
      this.add({ k: 'd', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.4), c: Math.random() < 0.35 ? '#8ac6ff' : '#eaf8ff' });
    }
  },
  chunks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0), s = rand(40, 190);
      this.add({ k: 'c', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.8, 2.0), w: randi(2, 5), h: randi(1, 3), c: pick(['#b57d3f', '#8f5c2c', '#5c3a1c', '#d9a25a']) });
    }
  },
  ring(x, y, max, life, col) { this.add({ k: 'g', x: x, y: y, r: 2, max: max, life: life, t0: life, c: col || '#eaf8ff' }); },
  update(dt, flowY) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L.splice(i, 1); continue; }
      switch (p.k) {
        case 'b': p.x += p.vx * dt + Math.sin(p.ph + p.life * 4) * 8 * dt; p.y += p.vy * dt; p.vy -= 12 * dt; break;
        case 'r': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.6; p.vy = p.vy * (1 - dt * 1.6) - 5 * dt;
          // clouds spread slowly and stop: an unbounded one swallows the frame
          p.r += p.g * dt * 1.5; if (p.r > 15) p.r = 15; break;
        case 'f': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; break;
        case 'd': p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; break;
        case 'c': p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (flowY === undefined ? 90 : flowY) * dt; p.vx *= 1 - dt * 0.7; break;
        case 'g': p.r += (p.max / p.t0) * dt; break;
      }
    }
  },
  render(ctx) {
    for (const p of this.list) {
      switch (p.k) {
        case 'b': {
          const r = p.r;
          ctx.fillStyle = 'rgba(214,240,255,0.85)';
          ctx.fillRect(R(p.x), R(p.y), r + 1, 1); ctx.fillRect(R(p.x), R(p.y) + r, r + 1, 1);
          ctx.fillRect(R(p.x), R(p.y), 1, r + 1); ctx.fillRect(R(p.x) + r, R(p.y), 1, r + 1);
          break;
        }
        case 'r': {
          // a diffuse dithered cloud, not a solid block: scanline rows with a
          // broken edge, plus a speckled fringe that thins into the water
          const k = Math.min(1, p.life / 1.4);
          const c = IP.blood[k > 0.85 ? 3 : k > 0.55 ? 2 : k > 0.3 ? 1 : 0];
          const r = R(p.r), cx = R(p.x), cy = R(p.y);
          // the wider it spreads, the thinner it gets
          const thin = 1 - Math.min(0.75, r / 20);
          ctx.fillStyle = rgbaq(c, Math.min(0.55, (k * 0.55 + 0.08) * thin));
          for (let dy = -r; dy <= r; dy++) {
            let w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
            if (w <= 0) continue;
            w -= (hash2(cx + dy * 7, cy) * 2.2) | 0;
            if (w <= 0) continue;
            ctx.fillRect(cx - w, cy + dy, w * 2, 1);
          }
          ctx.fillStyle = rgbaq(IP.blood[4], Math.min(0.30, k * 0.30 * thin));
          for (let i = 0; i < 7; i++) {
            const a = hash2(cx + i * 11, cy + i * 5) * TAU;
            const rr = r * (0.82 + hash2(cx + i * 3, cy + i) * 0.55);
            ctx.fillRect(cx + Math.round(Math.cos(a) * rr), cy + Math.round(Math.sin(a) * rr), 2, 2);
          }
          break;
        }
        case 'f': ctx.fillStyle = rgbaq(IP.foam[p.life > 0.5 ? 2 : 1], Math.min(1, p.life * 2)); ctx.fillRect(R(p.x), R(p.y), R(p.r) + 1, R(p.r) + 1); break;
        case 'd': ctx.fillStyle = p.c; ctx.fillRect(R(p.x), R(p.y), 2, 2); break;
        case 'c': ctx.fillStyle = p.c; ctx.fillRect(R(p.x), R(p.y), p.w, p.h); break;
        case 'g': {
          const a = qa(p.life / p.t0 * 0.8);
          if (a <= 0) break;
          ctx.fillStyle = rgbaq(p.c, a);
          const r = R(p.r);
          for (let i = 0; i < 20; i++) {
            const an = i / 20 * TAU;
            ctx.fillRect(R(p.x + Math.cos(an) * r), R(p.y + Math.sin(an) * r * 0.62), 2, 2);
          }
          break;
        }
      }
    }
  },
};

// =============================================================== BACKDROP ==
function tile(ctx, c, scroll, y, alpha) {
  if (!c) return;
  if (alpha !== undefined && alpha < 1) { ctx.save(); ctx.globalAlpha = qa(alpha); }
  let x = -(((scroll % c.width) + c.width) % c.width);
  for (; x < 640; x += c.width) ctx.drawImage(c, R(x), R(y));
  if (alpha !== undefined && alpha < 1) ctx.restore();
}
function motes(ctx, scroll, t, n, col, a) {
  ctx.fillStyle = rgbaq(col || '#cfe8f0', a === undefined ? 0.30 : a);
  for (let i = 0; i < n; i++) {
    const sx = (hash2(i, 7) * 1400 - scroll * (0.6 + hash2(i, 3) * 0.7) + t * 5) % 660;
    const sy = (hash2(i, 11) * 400 + Math.sin(t * 0.5 + i) * 6 + t * 3) % 380;
    ctx.fillRect(R(sx < 0 ? sx + 660 : sx) - 10, R(sy) - 10, 1 + (i & 1), 1);
  }
}
function caustics(ctx, y0, t, rows, a, col) {
  for (let i = 0; i < rows; i++) {
    const yy = y0 + i * 6;
    ctx.fillStyle = rgbaq(col || '#cff6ff', a * (1 - i / rows));
    for (let x = 0; x < 640; x += 6) {
      const w = Math.sin(x * 0.05 + t * 1.3 + i * 1.1) > 0.25 ? 4 : 0;
      if (w) ctx.fillRect(x, R(yy + Math.sin(x * 0.03 + t) * 2), w, 1);
    }
  }
}
function backdrop(ctx, o) {
  const s = o.scroll || 0, t = o.t || 0;
  ctx.drawImage(WATER[o.mood] || WATER.open, 0, 0);
  if (o.shafts) { ctx.save(); ctx.globalAlpha = qa(o.shafts); tile(ctx, LAY.shafts, s * 0.16, (o.surfY === undefined || o.surfY === null ? -40 : o.surfY)); ctx.restore(); }
  const set = o.set === 'D' ? 'D' : 'S';
  if (o.bedY !== undefined && o.bedY !== null) {
    tile(ctx, LAY['far' + set], s * 0.26, o.bedY - LAY['far' + set].height + 6);
    tile(ctx, LAY.grassFar, s * 0.40, o.bedY - LAY.grassFar.height + 10);
    tile(ctx, LAY['mid' + set], s * 0.58, o.bedY - LAY['mid' + set].height + 4);
    tile(ctx, LAY.bed, s * 0.78, o.bedY);
    if (o.causticBed) caustics(ctx, o.bedY + 4, t, 4, 0.16, '#ffeec0');
  }
  if (o.surfY !== undefined && o.surfY !== null) {
    tile(ctx, set === 'D' ? LAY.surfD : LAY.surfS, s * 0.34, o.surfY - 6);
    caustics(ctx, o.surfY + 14, t, 5, 0.20);
  }
  if (o.fog) { ctx.fillStyle = rgbaq(o.fog[0], o.fog[1]); ctx.fillRect(0, 0, 640, 360); }
  motes(ctx, s, t, 60, '#bcdfe8', 0.24);
}
function foreground(ctx, o) {
  const s = o.scroll || 0, t = o.t || 0;
  const set = o.set === 'D' ? 'D' : 'S';
  if (o.bedY !== undefined && o.bedY !== null) {
    tile(ctx, LAY['near' + set], s * 1.35, o.bedY - LAY['near' + set].height + 34);
    tile(ctx, LAY.grassNear, s * 1.7, o.bedY - 6);
  }
  motes(ctx, s * 2, t, 26, '#e6f6ff', 0.34);
}
// ---- drifting fish school --------------------------------------------------
function makeSchool(n, x, y, spread, sz, kind, spd) {
  const f = [];
  for (let i = 0; i < n; i++) f.push({ x: x + rand(-spread, spread), y: y + rand(-spread * 0.4, spread * 0.4), ph: rand(0, TAU), s: sz, kind: kind, spd: spd + rand(-6, 6) });
  return f;
}
function drawSchool(ctx, sch, t, dt, flip) {
  for (const f of sch) {
    f.x += f.spd * dt;
    if (f.x > 700) f.x -= 780; if (f.x < -80) f.x += 780;
    const sy = f.y + Math.sin(t * 2.4 + f.ph) * 4;
    const sp = FISHSPR[f.kind][f.s];
    ctx.save(); ctx.translate(R(f.x), R(sy));
    if ((f.spd < 0) !== !!flip) ctx.scale(-1, 1);
    ctx.rotate(Math.sin(t * 2.4 + f.ph) * 0.12);
    ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.restore();
  }
}

// ================================================================= TEXT ====
const BAR = 24;
function letterbox(ctx, k) {
  const h = R(BAR * (k === undefined ? 1 : k));
  P(ctx, '#000000', 0, 0, 640, h);
  P(ctx, '#000000', 0, 360 - h, 640, h);
}
function narrate(ctx, text, prog) {
  if (!text) return;
  const n = Math.max(0, Math.min(text.length, Math.floor(prog * 44)));
  const shown = text.slice(0, n);
  pixelTextOutlined(ctx, shown, 320, 345, 8, '#e8eef4', '#000000', 'center');
  if (n < text.length && (Math.floor(prog * 8) & 1)) P(ctx, '#e8eef4', 320 + R(textWidth(shown, 8) / 2) + 2, 346, 4, 7);
}
function bubble(ctx, x, y, text, dir, style, prog) {
  const size = 7;
  const lines = wrapText(ctx, text, 126, size);
  let w = 0; for (const l of lines) w = Math.max(w, textWidth(l, size));
  w = R(w) + 13; const h = lines.length * 10 + 9;
  let bx = R(x - w / 2), by = R(dir > 0 ? y - h - 7 : y + 7);
  bx = clamp(bx, 4, 636 - w);
  const warm = style === 'otter';
  const fill = warm ? '#e6dcbc' : '#cfe0ea', fill2 = warm ? '#c6b993' : '#a9bfcf', ink = warm ? '#2b2114' : '#152230';
  P(ctx, ink, bx - 1, by - 1, w + 2, h + 2);
  P(ctx, fill, bx, by, w, h);
  P(ctx, fill2, bx, by + h - 3, w, 3);
  P(ctx, fill2, bx, by, 1, h);
  P(ctx, warm ? '#f6efd6' : '#eaf4fa', bx + 1, by + 1, w - 2, 1);
  // tail
  for (let i = 0; i < 7; i++) {
    const ty = dir > 0 ? by + h + i : by - 1 - i;
    P(ctx, ink, R(x) - 4 + i, ty, 8 - i, 1);
    if (i < 6) P(ctx, i > 3 ? fill2 : fill, R(x) - 3 + i, ty, 6 - i, 1);
  }
  let total = 0; for (const l of lines) total += l.length;
  let shown = Math.floor((prog === undefined ? 1 : prog) * total * 1.0);
  for (let i = 0; i < lines.length; i++) {
    const take = Math.max(0, Math.min(lines[i].length, shown));
    shown -= lines[i].length;
    if (take > 0) pixelText(ctx, lines[i].slice(0, take), bx + 6, by + 5 + i * 10, size, ink, 'left', false);
  }
}
function titleCard(ctx, k, t) {
  if (k <= 0) return;
  const slide = clamp(k * 3, 0, 1), s2 = slide * slide * (3 - 2 * slide);
  const y = R(lerp(-60, 96, s2));
  const a = clamp(k < 0.85 ? 1 : (1 - k) / 0.15, 0, 1);
  ctx.save(); ctx.globalAlpha = qa(a);
  pixelTextOutlined(ctx, 'MANATEE', 320, y, 34, '#e6f2ff', '#0a1018', 'center');
  if (k > 0.14) pixelTextOutlined(ctx, 'VS', 320, y + 36, 15, '#ff6161', '#0a1018', 'center');
  if (k > 0.22) {
    const k3 = clamp((k - 0.22) * 6, 0, 1), s3 = k3 * k3 * (3 - 2 * k3);
    pixelTextOutlined(ctx, 'BOATS', 320, R(lerp(-40, y + 54, s3)), 34, '#ffe48f', '#0a1018', 'center');
  }
  ctx.restore();
}

// ================================================================== SKY =====
function buildSky() {
  const H = 96, c = can(LW, H), x = cx2(c), cols = IP.sky;
  for (let y = 0; y < H; y++) {
    const k = Math.pow(y / (H - 1), 0.8) * (cols.length - 1);
    let i0 = Math.floor(k), fr = k - i0; i0 = clamp(i0, 0, cols.length - 1);
    for (let px = 0; px < LW; px++) P(x, cols[clamp(fr > bay(px, y) ? i0 + 1 : i0, 0, cols.length - 1)], px, y);
  }
  const rng = new SeededRandom(6161);
  for (let i = 0; i < 9; i++) {
    const cxx = R(rng.range(0, LW)), cyy = R(rng.range(6, 52)), w = R(rng.range(30, 90)), h = R(rng.range(6, 14));
    for (let j = 0; j < 5; j++) {
      const ox = R(rng.range(-w * 0.4, w * 0.4)), oy = R(rng.range(-h * 0.3, h * 0.3));
      P(x, '#f6f8ee', cxx + ox, cyy + oy, R(w * rng.range(0.3, 0.6)), h);
      P(x, '#ffffff', cxx + ox, cyy + oy, R(w * rng.range(0.2, 0.4)), Math.max(1, h >> 1));
      P(x, '#cfd6d0', cxx + ox, cyy + oy + h - 1, R(w * rng.range(0.25, 0.5)), 1);
    }
  }
  for (let i = 0; i < 7; i++) {
    const gx = R(rng.range(0, LW)), gy = R(rng.range(8, 44));
    P(x, '#20303c', gx, gy, 3, 1); P(x, '#20303c', gx + 2, gy - 1, 2, 1); P(x, '#20303c', gx + 4, gy, 3, 1);
  }
  return c;
}
function drawAir(ctx, surfY, scroll, t) {
  if (!LAY.sky) LAY.sky = buildSky();
  const sy = R(surfY);
  if (sy <= 0) return;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 640, sy); ctx.clip();
  tile(ctx, LAY.sky, scroll * 0.10, sy - LAY.sky.height - 10);
  // far sea, sitting on the horizon
  const hz = sy - 12;
  for (let x = 0; x < 640; x++) {
    const w2 = Math.sin(x * 0.035 + t * 0.4) * 1.4;
    P(ctx, '#2a6f9c', x, hz + R(w2), 1, 12);
    P(ctx, '#1d5580', x, hz + 4 + R(w2), 1, 8);
    if (hash2(x, 17) > 0.90) P(ctx, '#bcdcec', x, hz + 1 + R(w2), 3, 1);
  }
  // chop + whitecaps at the waterline
  for (let x = 0; x < 640; x++) {
    const w = Math.sin(x * 0.07 + t * 2.2) * 2 + Math.sin(x * 0.021 - t * 1.3) * 1.6;
    const yy = sy - 3 + R(w);
    P(ctx, '#2d6f86', x, yy, 1, sy - yy);
    if (hash2(x, Math.floor(t * 3)) > 0.86) P(ctx, '#eaf8ff', x, yy - 1, 2, 2);
  }
  ctx.restore();
  P(ctx, '#0d2a33', 0, sy - 1, 640, 1);
  for (let x = 0; x < 640; x += 3) if (hash2(x, Math.floor(t * 5)) > 0.7) P(ctx, '#cfeaf2', x, sy + R(Math.sin(x * 0.07 + t * 2.2) * 2), 3, 1);
}
function speedLines(ctx, x, y, n, len, dir, col, seed) {
  ctx.fillStyle = col || 'rgba(225,244,255,0.5)';
  for (let i = 0; i < n; i++) {
    const oy = R(y + (hash2(i, seed | 0) - 0.5) * 42);
    const ox = R(x + (hash2(i * 3, seed | 0) - 0.5) * 40);
    ctx.fillRect(ox, oy, R(len * (0.5 + hash2(i * 7, seed | 0) * 0.8)) * (dir < 0 ? -1 : 1), 1);
  }
}
// ---------------------------------------------------------------- actors ---
function actor(set, x, y, o) {
  return Object.assign({
    set: set, x: x, y: y, rot: 0, phase: rand(0, TAU), exp: 'calm', flip: false,
    scarred: false, tailAmp: 0.30, flipperA: 0.45, sx: 1, sy: 1, flash: 0, blink: false,
    vx: 0, vy: 0, beat: 1.6,
  }, o || {});
}
function swim(m, dt, rate) { m.phase += dt * (rate === undefined ? m.beat : rate); }
let sndT = 0, sndT2 = 0;
function engine(dt, inten) {
  if (typeof Audio_ === 'undefined') return;
  sndT -= dt;
  if (sndT <= 0) {
    sndT = 0.17;
    Audio_.noise(0.24, 0.045 * inten, 230, 40);
    Audio_.tone(42 + rand(0, 7), 0.20, 'sawtooth', 0.030 * inten);
  }
}
function churnSound(dt, inten) {
  if (typeof Audio_ === 'undefined') return;
  sndT2 -= dt;
  if (sndT2 <= 0) { sndT2 = 0.33; Audio_.noise(0.28, 0.035 * inten, 1400, 500); }
}

// ================================================================= BEATS ====
const A = {};
const SC = {};
const BEATS = [];

// ---------------------------------------------------------------- 1. PEACE
BEATS.push({
  name: 'peace', dur: 9.5,
  lines: [[1.6, 'The shallows were warm and the grass was sweet.'], [5.4, 'We had no word for boat.']],
  enter() {
    A.dad = actor(MAN.dad, 150, 148, { beat: 1.1, tailAmp: 0.22 });
    A.mom = actor(MAN.mom, 430, 242, { beat: 1.0, rot: 0.42, tailAmp: 0.18 });
    A.you = actor(MAN.you, 262, 196, { beat: 1.8 });
    A.bro = actor(MAN.bro, 216, 214, { beat: 2.4 });
    SC.sch1 = makeSchool(16, 480, 140, 70, 0, 1, -26);
    SC.sch2 = makeSchool(11, 120, 250, 50, 1, 3, 20);
    SC.sch3 = makeSchool(7, 560, 262, 40, 2, 0, -14);
    FX.bubble(A.mom.x + 40, A.mom.y - 10, 5, 0.6);
  },
  update(dt, bt) {
    Intro.scroll += 15 * dt;
    for (const k of ['dad', 'mom', 'you', 'bro']) swim(A[k], dt);
    A.dad.x += 9 * dt; A.dad.y = 148 + Math.sin(bt * 0.5) * 7;
    A.dad.rot = Math.sin(bt * 0.4) * 0.05;
    A.mom.x = 430 + Math.sin(bt * 0.32) * 10; A.mom.y = 240 + Math.sin(bt * 0.6) * 4;
    A.mom.rot = 0.40 + Math.sin(bt * 0.5) * 0.06;
    A.you.x = 262 + Math.sin(bt * 0.45) * 16; A.you.y = 196 + Math.sin(bt * 0.75) * 8;
    A.you.rot = Math.sin(bt * 0.75 + 1) * 0.10;
    A.bro.x = A.you.x - 68 + Math.sin(bt * 0.9) * 16;
    A.bro.y = A.you.y + 30 + Math.sin(bt * 1.25) * 10;
    A.bro.rot = Math.sin(bt * 1.25) * 0.22;
    A.bro.exp = (bt % 4) > 3.2 ? 'talk' : 'calm';
    if (Math.random() < 0.7 * dt) FX.bubble(A.mom.x + 38, A.mom.y - 6, 1, 0.5);
    if (Math.random() < 0.4 * dt) FX.bubble(A.you.x + 22, A.you.y - 8, 1, 0.5);
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'shallow', scroll: Intro.scroll, t: Intro.t, surfY: 34, bedY: 296, set: 'S', shafts: 1, causticBed: true });
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    drawSchool(ctx, SC.sch3, Intro.t, Intro.dt);
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.dad, Intro.t);
    drawSchool(ctx, SC.sch2, Intro.t, Intro.dt);
    drawManatee(ctx, A.you, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    FX.render(ctx);
    foreground(ctx, { scroll: Intro.scroll, t: Intro.t, bedY: 296, set: 'S' });
    titleCard(ctx, clamp((bt - 0.5) / 7.0, 0, 1), bt);
  },
});

// ----------------------------------------------------------------- 2. BOAT
BEATS.push({
  name: 'boat', dur: 7.5,
  lines: [[0.5, 'Then the water started shaking.'], [3.8, 'It came through the grass without slowing down.']],
  enter() {
    SC.surfY = 100; SC.boatX = 820; SC.boatY = 100; SC.propA = 0; SC.boatRot = 0;
    A.dad = actor(MAN.dad, 300, 214, { beat: 1.4 });
    A.mom = actor(MAN.mom, 214, 232, { beat: 1.4 });
    A.you = actor(MAN.you, 268, 272, { beat: 2.2 });
    A.bro = actor(MAN.bro, 214, 296, { beat: 2.8 });
    SC.sch1 = makeSchool(18, 420, 200, 60, 0, 1, -30);
  },
  update(dt, bt) {
    Intro.scroll += 26 * dt;
    const k = clamp(bt / 3.4, 0, 1), e = 1 - Math.pow(1 - k, 2.2);
    SC.boatX = lerp(820, 452, e) - Math.max(0, bt - 3.4) * 9;
    SC.boatY = SC.surfY + Math.sin(bt * 2.4) * 2;
    SC.boatRot = Math.sin(bt * 2.0) * 0.02;
    SC.propA += dt * 34;
    engine(dt, clamp(bt * 0.5, 0, 1)); churnSound(dt, clamp(bt * 0.4, 0, 1));
    if (bt > 1.4) {
      Intro.shake = Math.max(Intro.shake, 1.2 * clamp((bt - 1.4) / 2, 0, 1));
      const px = SC.boatX + BOAT.prop[0], py = SC.boatY + BOAT.prop[1];
      FX.bubble(px + rand(-6, 6), py + rand(-10, 10), 2, 2.4);
      if (Math.random() < 0.7) FX.foam(px + rand(0, 26), py + rand(-12, 12), 1, 0.6);
    }
    for (const k2 of ['dad', 'mom', 'you', 'bro']) swim(A[k2], dt);
    const panic = clamp((bt - 1.6) / 1.2, 0, 1);
    A.dad.beat = lerp(1.4, 4.4, panic); A.dad.exp = bt > 1.7 ? 'angry' : 'calm';
    A.dad.x = lerp(300, 372, panic) + Math.sin(bt) * 4; A.dad.y = lerp(214, 170, panic);
    A.dad.rot = -panic * 0.22;
    A.mom.beat = lerp(1.4, 4.8, panic); A.mom.exp = bt > 1.7 ? 'wide' : 'calm';
    A.mom.x = lerp(214, 126, panic * panic); A.mom.y = lerp(232, 272, panic);
    A.mom.rot = panic * 0.26;
    A.you.beat = lerp(2.2, 6.0, panic); A.you.exp = bt > 1.7 ? 'wide' : 'calm';
    A.you.x = lerp(268, 108, panic * panic); A.you.y = lerp(272, 300, panic);
    A.bro.beat = lerp(2.8, 7.0, panic); A.bro.exp = bt > 1.7 ? 'wide' : 'calm';
    A.bro.x = lerp(214, 60, panic * panic); A.bro.y = lerp(296, 318, panic);
    if (panic > 0.2 && Math.random() < 14 * dt) { FX.bubble(A.you.x + 20, A.you.y - 6, 1, 1.4); FX.bubble(A.bro.x + 14, A.bro.y - 4, 1, 1.4); }
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'shallow', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 336, set: 'S', shafts: 0.85, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t);
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    // boat + churn
    ctx.save(); ctx.translate(R(SC.boatX), R(SC.boatY)); ctx.rotate(SC.boatRot);
    ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay);
    drawProp(ctx, BOAT.prop[0], BOAT.prop[1], 15, SC.propA, 1);
    ctx.restore();
    // churned white water trailing aft of the prop
    const px = SC.boatX + BOAT.prop[0], py = SC.boatY + BOAT.prop[1];
    drawChurn(ctx, px, py, Intro.t, 1);
    drawManatee(ctx, A.dad, Intro.t);
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    FX.render(ctx);
    foreground(ctx, { scroll: Intro.scroll, t: Intro.t, bedY: 336, set: 'S' });
  },
});

// ------------------------------------------------------------- 3. THE SCAR
BEATS.push({
  name: 'scar', dur: 7.0,
  lines: [[0.4, 'She turned to put herself between it and us.'], [3.0, 'The propeller found her back.'], [5.2, 'The water went red and warm.']],
  enter() {
    SC.surfY = 104; SC.boatX = 420; SC.boatY = 104; SC.propA = 0; SC.hit = false;
    A.mom = actor(MAN.mom, 452, 258, { beat: 3.2, exp: 'wide' });
    A.you = actor(MAN.you, 210, 296, { beat: 2.4, exp: 'wide' });
    A.bro = actor(MAN.bro, 146, 314, { beat: 3.0, exp: 'wide' });
    A.dad = actor(MAN.dad, -160, 210, { beat: 3.0, exp: 'angry' });
  },
  update(dt, bt) {
    Intro.scroll += 12 * dt;
    SC.boatX = 420 - bt * 5; SC.boatY = SC.surfY + Math.sin(bt * 2.2) * 2;
    SC.propA += dt * 34;
    engine(dt, 1); churnSound(dt, 0.8);
    const px = SC.boatX + BOAT.prop[0], py = SC.boatY + BOAT.prop[1];
    FX.bubble(px + rand(-6, 6), py + rand(-10, 10), 1, 2.2);
    for (const k of ['dad', 'mom', 'you', 'bro']) swim(A[k], dt);
    // mom rises into the blades
    const k = clamp(bt / 2.35, 0, 1), e = k * k;
    if (!SC.hit) {
      A.mom.x = lerp(452, px - 26, e); A.mom.y = lerp(258, py + 14, e);
      A.mom.rot = lerp(0.1, -0.45, e);
      if (bt >= 2.35) {
        SC.hit = true; A.mom.scarred = true; A.mom.exp = 'pain'; A.mom.flash = 1;
        Intro.shake = 13;
        FX.blood(A.mom.x + 6, A.mom.y - 10, 34, 1.15);
        FX.foam(px, py, 26, 1.4);
        if (typeof Audio_ !== 'undefined') { Audio_.hurt(); Audio_.splash(2); Audio_.noise(0.5, 0.3, 900, 120); }
      }
    } else {
      const h = bt - 2.35;
      A.mom.flash = Math.max(0, 1 - h * 5);
      A.mom.vx = approach(A.mom.vx === 0 ? -80 : A.mom.vx, -14, 60 * dt);
      A.mom.vy = approach(A.mom.vy === 0 ? 34 : A.mom.vy, 12, 40 * dt);
      A.mom.x += A.mom.vx * dt; A.mom.y += A.mom.vy * dt;
      A.mom.rot = lerp(A.mom.rot, 0.55 + Math.sin(h * 3.4) * 0.18, 3 * dt);
      A.mom.beat = lerp(3.2, 0.9, clamp(h / 2, 0, 1));
      A.mom.tailAmp = lerp(0.3, 0.12, clamp(h / 2, 0, 1));
      A.mom.exp = h > 1.6 ? 'sad' : 'pain';
      if (Math.random() < 20 * dt) FX.blood(A.mom.x + rand(-6, 14), A.mom.y - 8 + rand(-4, 4), 1, 0.55);
    }
    A.you.x = 210 + Math.sin(bt * 0.8) * 5; A.you.y = 296 + Math.sin(bt * 1.1) * 4;
    A.bro.x = 146 + Math.sin(bt * 0.9) * 4; A.bro.y = 314 + Math.sin(bt * 1.3) * 4;
    if (bt > 4.6) { A.dad.x = lerp(-160, -50, clamp((bt - 4.6) / 2.4, 0, 1)); A.dad.y = 240; }
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'shallow', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 340, set: 'S', shafts: 0.8 });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t);
    ctx.save(); ctx.translate(R(SC.boatX), R(SC.boatY)); ctx.rotate(Math.sin(bt * 2) * 0.02);
    ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay);
    drawProp(ctx, BOAT.prop[0], BOAT.prop[1], 15, SC.propA, 1);
    ctx.restore();
    drawManatee(ctx, A.dad, Intro.t);
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    FX.render(ctx);
    if (SC.hit && bt - 2.35 < 0.16) { ctx.fillStyle = rgbaq('#ffffff', 0.55 - (bt - 2.35) * 3); ctx.fillRect(0, 0, 640, 360); }
    foreground(ctx, { scroll: Intro.scroll, t: Intro.t, bedY: 340, set: 'S' });
  },
});

// ---------------------------------------------------------------- 4. THE RAM
BEATS.push({
  name: 'ram', dur: 6.5,
  lines: [[0.3, 'Dad did not make a sound.'], [2.9, 'He hit it like a landslide.']],
  enter() {
    SC.surfY = 116; SC.boatX = 430; SC.boatY = 116; SC.propA = 0; SC.rammed = false;
    SC.rock = 0; SC.rockV = 0;
    A.dad = actor(MAN.dad, -90, 214, { beat: 5.0, exp: 'angry', tailAmp: 0.5 });
    A.mom = actor(MAN.mom, 112, 286, { beat: 0.9, rot: 0.5, exp: 'sad', scarred: true, tailAmp: 0.12 });
    A.you = actor(MAN.you, 190, 312, { beat: 2.0, exp: 'wide' });
    A.bro = actor(MAN.bro, 134, 326, { beat: 2.6, exp: 'wide' });
    SC.men = [-64, -22, 16];
  },
  update(dt, bt) {
    Intro.scroll += 10 * dt;
    SC.propA += dt * 30;
    engine(dt, 1); churnSound(dt, 0.6);
    for (const k of ['dad', 'mom', 'you', 'bro']) swim(A[k], dt);
    const hullX = SC.boatX - 96;
    if (!SC.rammed) {
      const k = clamp(bt / 2.7, 0, 1), e = k * k * k;
      A.dad.x = lerp(-90, hullX, e); A.dad.y = lerp(214, 168, e);
      A.dad.rot = -e * 0.30;
      if (bt > 1.0 && Math.random() < 30 * dt) FX.bubble(A.dad.x - 40, A.dad.y + 6, 1, 2.2);
      if (bt >= 2.7) {
        SC.rammed = true; Intro.shake = 18; SC.rockV = -2.6;
        FX.ring(A.dad.x + 40, A.dad.y - 6, 120, 0.55, '#ffffff');
        FX.chunks(A.dad.x + 46, A.dad.y - 20, 22);
        FX.foam(A.dad.x + 44, A.dad.y - 10, 40, 1.6);
        FX.bubble(A.dad.x + 30, A.dad.y, 24, 2.6);
        if (typeof Audio_ !== 'undefined') { Audio_.explosion(0.9); Audio_.stun(); Audio_.splash(3); }
      }
    } else {
      const h = bt - 2.7;
      A.dad.x -= 40 * dt * Math.max(0, 1 - h);
      A.dad.y += 14 * dt;
      A.dad.rot = lerp(A.dad.rot, -0.1 + Math.sin(h * 5) * 0.08, 4 * dt);
      A.dad.beat = lerp(5.0, 2.4, clamp(h, 0, 1));
      SC.rockV += (-SC.rock * 26 - SC.rockV * 3.4) * dt;
      SC.rock += SC.rockV * dt;
      if (Math.random() < 6 * dt) FX.chunks(SC.boatX - 90 + rand(-10, 10), SC.boatY + rand(-16, 4), 1);
    }
    A.mom.y = 286 + Math.sin(bt * 0.8) * 3;
    if (Math.random() < 4 * dt) FX.blood(A.mom.x + rand(-4, 12), A.mom.y - 6, 1, 0.5);
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'shallow', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 344, set: 'S', shafts: 0.8 });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t);
    // deck hands, drawn before the hull so the bulwark covers their legs
    const feet = SC.boatY - 25;
    const st = SC.rammed ? clamp(1 - (bt - 2.7) * 0.9, 0, 1) : 0;
    SC.men.forEach((ox, i) => {
      const lean = SC.rammed ? -0.5 * st + Math.sin((bt - 2.7) * 14 + i) * 0.2 * st : 0.30 + Math.sin(bt * 1.4 + i) * 0.06;
      figure(ctx, SC.boatX + ox + SC.rock * 8, feet + SC.rock * 4, 38, {
        facing: -1, lean: lean, armA: 0.95 + st * 0.85, foreA: 1.25 + st * 1.0,
        armB: 0.80 + st * 0.55, foreB: 1.10 + st * 0.8,
        legA: 0.50 + st * 0.3, legB: -0.46 - st * 0.2, kneeA: -0.1, kneeB: 0.12, head: -0.3 + st * 0.6,
      }, '#10141c', '#6d8fae');
    });
    ctx.save(); ctx.translate(R(SC.boatX), R(SC.boatY + Math.abs(SC.rock) * 5)); ctx.rotate(SC.rock * 0.10 + Math.sin(bt * 2) * 0.02);
    ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay);
    drawProp(ctx, BOAT.prop[0], BOAT.prop[1], 15, SC.propA, 1);
    ctx.restore();
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    drawManatee(ctx, A.dad, Intro.t);
    if (!SC.rammed && bt > 1.2) speedLines(ctx, A.dad.x - 70, A.dad.y, 9, 34, -1, 'rgba(225,244,255,0.45)', 3);
    FX.render(ctx);
    if (SC.rammed && bt - 2.7 < 0.12) { ctx.fillStyle = rgbaq('#ffffff', 0.6 - (bt - 2.7) * 4); ctx.fillRect(0, 0, 640, 360); }
    foreground(ctx, { scroll: Intro.scroll, t: Intro.t, bedY: 344, set: 'S' });
  },
});

// ------------------------------------------------------------ 5. HARPOONS
BEATS.push({
  name: 'harpoons', dur: 11.0,
  lines: [[0.3, 'Then the ropes came down.'], [3.4, 'They took him first.'], [6.6, 'Then they took her.'], [9.2, 'Nobody was left to tell us to swim.']],
  enter() {
    SC.surfY = 116; SC.boatX = 452; SC.boatY = 116; SC.propA = 0;
    SC.men = [-78, -36, 6];
    SC.harps = [];
    A.dad = actor(MAN.dad, 286, 236, { beat: 3.4, exp: 'angry' });
    A.mom = actor(MAN.mom, 380, 290, { beat: 1.0, rot: 0.5, exp: 'sad', scarred: true, tailAmp: 0.12 });
    A.you = actor(MAN.you, 142, 310, { beat: 1.8, exp: 'wide' });
    A.bro = actor(MAN.bro, 96, 322, { beat: 2.2, exp: 'wide' });
  },
  gunPos(i) { return [SC.boatX + SC.men[i] - 12, SC.boatY - 40]; },
  fire(i, target, bt) {
    const g = this.gunPos(i);
    const a = angleTo(g[0], g[1], target.x + 4, target.y - 6);
    SC.harps.push({ x: g[0], y: g[1], a: a, sp: 420, gun: i, tgt: target, stuck: false, t0: bt, ox: 0, oy: 0 });
    if (typeof Audio_ !== 'undefined') { Audio_.shot('harpoon'); Audio_.tone(90, 0.2, 'square', 0.12, -40); }
  },
  update(dt, bt) {
    Intro.scroll += 8 * dt;
    SC.boatY = SC.surfY + Math.sin(bt * 2.1) * 2; SC.propA += dt * 22;
    engine(dt, 0.7);
    for (const k of ['dad', 'mom', 'you', 'bro']) swim(A[k], dt);
    if (bt > 1.6 && SC.harps.length === 0) this.fire(1, A.dad, bt);
    if (bt > 4.4 && SC.harps.length === 1) this.fire(0, A.mom, bt);
    for (const h of SC.harps) {
      if (!h.stuck) {
        h.x += Math.cos(h.a) * h.sp * dt; h.y += Math.sin(h.a) * h.sp * dt;
        FX.bubble(h.x, h.y, 1, 1.6);
        if (dist(h.x, h.y, h.tgt.x + 4, h.tgt.y - 6) < 16) {
          h.stuck = true; h.hitT = bt; h.ox = h.x - h.tgt.x; h.oy = h.y - h.tgt.y;
          h.tgt.flash = 1; h.tgt.exp = 'pain'; h.tgt.tailAmp = 0.5;
          FX.blood(h.x, h.y, 26, 1.0);
          Intro.shake = 8;
          if (typeof Audio_ !== 'undefined') { Audio_.hit(); Audio_.hurt(); }
        }
      } else {
        const e = bt - h.hitT;
        h.tgt.flash = Math.max(0, 1 - e * 4);
        h.x = h.tgt.x + h.ox; h.y = h.tgt.y + h.oy;
        const g = this.gunPos(h.gun);
        if (e > 0.1 && e < 1.0) {
          // thrashing on the line
          h.tgt.rot = Math.sin(e * 16) * 0.35;
          h.tgt.x += Math.sin(e * 19) * 40 * dt;
          if (Math.random() < 18 * dt) FX.blood(h.tgt.x + h.ox, h.tgt.y + h.oy, 1, 0.5);
          if (Math.random() < 26 * dt) FX.bubble(h.tgt.x, h.tgt.y, 1, 2.0);
        } else if (e >= 1.0) {
          const k = clamp((e - 1.0) / 3.6, 0, 1), s = k * k;
          h.tgt.x = lerp(h.tgt.x, g[0] - h.ox, 2.2 * dt);
          h.tgt.y = lerp(h.tgt.y, -70, 1.1 * dt * (0.4 + s * 2));
          h.tgt.rot = lerp(h.tgt.rot, -1.15, 2.0 * dt);
          h.tgt.exp = 'dead'; h.tgt.beat = lerp(h.tgt.beat, 0.25, dt); h.tgt.tailAmp = lerp(h.tgt.tailAmp, 0.06, dt * 2);
          if (Math.random() < 9 * dt) FX.blood(h.tgt.x + h.ox, h.tgt.y + h.oy, 1, 0.6);
        }
      }
    }
    // the kids shrink back, pressed together
    A.you.x = 142 + Math.sin(bt * 0.7) * 5; A.you.y = 310 + Math.sin(bt * 1.0) * 3;
    A.bro.x = A.you.x - 40 + Math.sin(bt * 0.9) * 3; A.bro.y = A.you.y + 12;
    A.bro.rot = -0.12 + Math.sin(bt * 0.9) * 0.05;
    if (bt > 8.0) { A.you.exp = 'sad'; A.bro.exp = 'sad'; }
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'shallow', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 348, set: 'S', shafts: 0.7, fog: ['#0a2a38', 0.12] });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t);
    const feet = SC.boatY - 25;
    SC.men.forEach((ox, i) => {
      const fired = SC.harps.some(h => h.gun === i);
      const rec = fired ? clamp(1 - (bt - SC.harps.find(h => h.gun === i).t0) * 3, 0, 1) : 0;
      const aim = i === 1 ? (bt > 1.0 ? 1 : 0) : i === 0 ? (bt > 3.6 ? 1 : 0) : 0;
      figure(ctx, SC.boatX + ox, feet, 38, {
        facing: -1, lean: 0.30 + aim * 0.10 - rec * 0.22,
        armA: 0.92 + aim * 0.30 - rec * 0.35, foreA: 1.15 + aim * 0.22 - rec * 0.45,
        armB: 0.78 + aim * 0.28 - rec * 0.25, foreB: 1.02 + aim * 0.20 - rec * 0.35,
        legA: 0.52, legB: -0.48, kneeA: -0.12, kneeB: 0.1, head: -0.28 - aim * 0.20,
      }, '#10141c', '#6d8fae');
      if (aim) {
        // the harpoon gun in their hands
        const g = this.gunPos(i);
        ctx.save(); ctx.translate(R(g[0] + 10), R(g[1] + 2)); ctx.rotate(0.85 - rec * 0.3);
        P(ctx, IP.ink, -12, -3, 22, 6); P(ctx, '#4a525e', -11, -2, 20, 4); P(ctx, '#8c97a8', -11, -2, 20, 1);
        P(ctx, '#5c3a1c', -14, -2, 4, 6);
        ctx.restore();
      }
    });
    ctx.save(); ctx.translate(R(SC.boatX), R(SC.boatY)); ctx.rotate(Math.sin(bt * 2) * 0.015);
    ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay);
    drawProp(ctx, BOAT.prop[0], BOAT.prop[1], 15, SC.propA, 0.4);
    ctx.restore();
    // ropes
    for (const h of SC.harps) {
      const g = this.gunPos(h.gun);
      const taut = h.stuck ? clamp(1 - (bt - h.hitT) / 1.2, 0, 1) : 1;
      drawRope(ctx, g[0], g[1], h.x, h.y, 30 * taut + 6, '#d8cfae', '#7a6a44');
    }
    drawManatee(ctx, A.dad, Intro.t);
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    for (const h of SC.harps) { ctx.save(); ctx.translate(R(h.x), R(h.y)); ctx.rotate(h.a); ctx.drawImage(HARP.c, -HARP.ax, -HARP.ay); ctx.restore(); }
    FX.render(ctx);
    foreground(ctx, { scroll: Intro.scroll, t: Intro.t, bedY: 348, set: 'S' });
  },
});

// -------------------------------------------------------------- 6. ESCAPE
BEATS.push({
  name: 'escape', dur: 6.0,
  lines: [[0.4, 'We swam.'], [2.6, 'We swam until the light went out of the water.']],
  enter() {
    A.you = actor(MAN.you, 260, 180, { beat: 7.0, exp: 'wide', tailAmp: 0.55 });
    A.bro = actor(MAN.bro, 186, 206, { beat: 8.0, exp: 'wide', tailAmp: 0.55 });
    SC.boatX = 430; SC.boatS = 0.40;
    if (typeof Audio_ !== 'undefined') Audio_.roll();
  },
  update(dt, bt) {
    Intro.scroll += lerp(70, 300, clamp(bt / 2.5, 0, 1)) * dt;
    for (const k of ['you', 'bro']) swim(A[k], dt);
    A.you.y = 180 + Math.sin(bt * 3.2) * 10; A.you.rot = Math.sin(bt * 3.2) * 0.12;
    A.bro.y = 208 + Math.sin(bt * 3.6 + 1) * 12; A.bro.rot = Math.sin(bt * 3.6 + 1) * 0.14;
    A.bro.x = 186 - Math.max(0, bt - 3) * 6;
    SC.boatX -= 62 * dt; SC.boatS = Math.max(0.08, 0.40 - bt * 0.055);
    if (Math.random() < 30 * dt) { FX.bubble(A.you.x - 26, A.you.y + 4, 1, 2.6); FX.bubble(A.bro.x - 20, A.bro.y + 3, 1, 2.6); }
    if (bt > 3.4) Intro.fade = Math.min(0.55, (bt - 3.4) * 0.22);
  },
  render(ctx, bt) {
    const dk = clamp(bt / 4.5, 0, 1);
    backdrop(ctx, { mood: bt > 2.6 ? 'night' : 'deep', scroll: Intro.scroll, t: Intro.t, surfY: 30 - dk * 60, bedY: 350, set: 'D', shafts: 0.5 * (1 - dk), fog: ['#020a14', dk * 0.30] });
    // the boat shrinking behind
    ctx.save(); ctx.translate(R(SC.boatX), 44 + bt * 4); ctx.scale(SC.boatS, SC.boatS); ctx.globalAlpha = qa(0.9 - dk * 0.75);
    ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay); ctx.restore();
    drawManatee(ctx, A.bro, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    speedLines(ctx, A.you.x - 74, A.you.y, 14, 54, -1, 'rgba(190,225,245,0.34)', 7);
    speedLines(ctx, A.bro.x - 58, A.bro.y, 11, 42, -1, 'rgba(190,225,245,0.26)', 13);
    FX.render(ctx);
    foreground(ctx, { scroll: Intro.scroll, t: Intro.t, bedY: 350, set: 'D' });
  },
});

// --------------------------------------------------------------- 7. YACHT
BEATS.push({
  name: 'yacht', dur: 7.0,
  lines: [[0.5, 'The next boat was white, and quiet.'], [3.4, 'The man on it pointed at us like we were money.']],
  enter() {
    SC.surfY = 132; SC.yX = -260; SC.yY = 132;
    A.you = actor(MAN.you, 240, 244, { beat: 2.4, exp: 'wide' });
    A.bro = actor(MAN.bro, 184, 268, { beat: 2.8, exp: 'wide' });
    SC.spot = 0;
  },
  update(dt, bt) {
    Intro.scroll += 34 * dt;
    SC.yX = lerp(-250, 340, clamp(bt / 5.4, 0, 1));
    SC.yY = SC.surfY + Math.sin(bt * 1.7) * 2;
    if (typeof Audio_ !== 'undefined') { sndT -= dt; if (sndT <= 0) { sndT = 0.5; Audio_.tone(66, 0.55, 'sine', 0.05); Audio_.noise(0.4, 0.02, 500, 60); } }
    for (const k of ['you', 'bro']) swim(A[k], dt);
    A.you.y = 244 + Math.sin(bt * 1.3) * 6; A.you.rot = -0.16 + Math.sin(bt * 1.3) * 0.06;
    A.bro.y = 268 + Math.sin(bt * 1.6) * 6; A.bro.rot = -0.2;
    A.you.x = 240 + Math.sin(bt * 0.6) * 8;
    SC.spot = clamp((bt - 2.8) / 0.4, 0, 1);
    if (Math.random() < 3 * dt) { FX.bubble(A.you.x + 22, A.you.y - 6, 1, 0.8); FX.bubble(A.bro.x + 16, A.bro.y - 4, 1, 0.8); }
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'deep', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 352, set: 'D', shafts: 0.45 });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t);
    // hull wake under the waterline
    ctx.save(); ctx.translate(R(SC.yX), R(SC.yY));
    ctx.drawImage(YAC.s.c, -YAC.s.ax, -YAC.s.ay); ctx.restore();
    for (let i = 0; i < 20; i++) {
      const a = qa(0.34 - i * 0.017); if (a <= 0) break;
      const hgt = R(5 + i * 1.6);
      ctx.fillStyle = rgbaq('#cfe8f5', a);
      ctx.fillRect(R(SC.yX - 190 - i * 8), R(SC.yY - 2 + Math.sin(Intro.t * 5 + i) * 3), 8, hgt);
      if (hash2(i, Math.floor(Intro.t * 10)) > 0.6) { ctx.fillStyle = rgbaq('#ffffff', qa(a * 1.4)); ctx.fillRect(R(SC.yX - 190 - i * 8), R(SC.yY - 4 + hash2(i, 3) * hgt), 4, 2); }
    }
    // the businessman at the foredeck rail
    const bx = SC.yX + 104, by = SC.yY - 76;
    const grin = SC.spot > 0.5;
    drawBiz(ctx, {
      x: bx, y: by, flip: false, grin: grin, cigar: true,
      binoc: SC.spot < 0.6,
      armNear: SC.spot < 0.6 ? -1.15 - Math.sin(bt * 0.9) * 0.12 : lerp(-1.1, 1.05, clamp((SC.spot - 0.6) * 2.5, 0, 1)),
      armFar: SC.spot < 0.6 ? -1.0 : 1.5,
      headR: SC.spot < 0.6 ? Math.sin(bt * 0.8) * 0.12 : 0.28,
      headY: SC.spot > 0.5 && SC.spot < 0.9 ? -2 : 0,
    }, Intro.t);
    // cigar smoke
    for (let i = 0; i < 5; i++) {
      const k = (Intro.t * 0.5 + i * 0.2) % 1;
      ctx.fillStyle = rgbaq('#b9b3ad', qa(0.28 * (1 - k)));
      ctx.fillRect(R(bx + 12 + Math.sin(k * 6 + i) * 4), R(by - 28 - k * 26), 2 + R(k * 3), 2 + R(k * 3));
    }
    if (SC.spot > 0.5 && (Math.floor(bt * 6) & 1)) {
      P(ctx, '#ffe48f', R(bx + 22), R(by - 30), 2, 2);
      P(ctx, '#ffffff', R(bx + 26), R(by - 34), 2, 2);
    }
    drawManatee(ctx, A.bro, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    FX.render(ctx);
    foreground(ctx, { scroll: Intro.scroll, t: Intro.t, bedY: 352, set: 'D' });
  },
});

// ----------------------------------------------------------------- 8. NET
BEATS.push({
  name: 'net', dur: 11.0,
  lines: [[0.6, 'The net came down with weights sewn into it.'], [4.4, 'I found a tear in the mesh.'], [6.4, 'He did not.'], [8.8, 'He reached for me the whole way up.']],
  enter() {
    SC.surfY = 116; SC.yX = 150; SC.yY = 116;
    SC.netY = -180; SC.netX = 448; SC.cinch = 0; SC.free = false;
    A.you = actor(MAN.you, 416, 232, { beat: 2.6, exp: 'wide' });
    A.bro = actor(MAN.bro, 470, 254, { beat: 3.0, exp: 'wide' });
  },
  update(dt, bt) {
    Intro.scroll += 10 * dt;
    SC.yY = SC.surfY + Math.sin(bt * 1.5) * 2;
    for (const k of ['you', 'bro']) swim(A[k], dt);
    if (bt < 0.8) {
      A.you.y = 232 + Math.sin(bt * 1.4) * 5; A.bro.y = 254 + Math.sin(bt * 1.7) * 5;
    } else if (bt < 3.0) {
      const k = clamp((bt - 0.8) / 2.2, 0, 1);
      SC.netY = lerp(-180, 168, k * k);
      if (k > 0.2 && Math.random() < 10 * dt) FX.bubble(SC.netX + rand(-90, 90), SC.netY + rand(0, 40), 1, 1.6);
      A.you.beat = 5; A.bro.beat = 5.5;
      A.you.x = lerp(416, 412, k); A.you.y = lerp(232, 250, k);
      A.bro.x = lerp(470, 480, k); A.bro.y = lerp(254, 266, k);
      if (k >= 1 && typeof Audio_ !== 'undefined' && !SC.splashed) { SC.splashed = true; Audio_.splash(2); Audio_.noise(0.5, 0.18, 800, 120); }
    } else if (bt < 4.8) {
      const k = clamp((bt - 3.0) / 1.8, 0, 1);
      SC.cinch = k * 0.86; SC.netY = 168 - k * 14;
      A.you.beat = 9; A.bro.beat = 9;
      A.you.x = 412 + Math.sin(bt * 19) * 11; A.you.y = 250 + Math.sin(bt * 14) * 8;
      A.you.rot = Math.sin(bt * 17) * 0.5;
      A.bro.x = 482 + Math.sin(bt * 16 + 2) * 11; A.bro.y = 266 + Math.sin(bt * 13 + 1) * 8;
      A.bro.rot = Math.sin(bt * 15 + 1) * 0.5;
      if (Math.random() < 40 * dt) { FX.bubble(A.you.x, A.you.y, 1, 2.6); FX.bubble(A.bro.x, A.bro.y, 1, 2.6); }
      Intro.shake = Math.max(Intro.shake, 2);
    } else if (bt < 6.0) {
      const k = clamp((bt - 4.8) / 1.2, 0, 1);
      SC.cinch = 0.86; SC.netY = 154;
      A.you.x = lerp(412, 306, k * k); A.you.y = lerp(250, 296, k);
      A.you.rot = lerp(0.4, -0.1, k); A.you.beat = 8;
      A.bro.x = 482 + Math.sin(bt * 16 + 2) * 9; A.bro.y = 266 + Math.sin(bt * 13) * 7;
      A.bro.rot = Math.sin(bt * 15) * 0.45;
      if (k > 0.25 && !SC.free) { SC.free = true; if (typeof Audio_ !== 'undefined') Audio_.roll(); FX.bubble(A.you.x, A.you.y, 12, 2.4); }
      if (Math.random() < 25 * dt) FX.bubble(A.bro.x, A.bro.y, 1, 2.4);
    } else {
      const k = clamp((bt - 6.0) / 4.4, 0, 1), e = k * k;
      SC.netY = lerp(154, -300, e);
      SC.cinch = 0.9;
      A.bro.x = SC.netX + 34; A.bro.y = SC.netY + 80;
      A.bro.rot = lerp(0.2, -0.5, clamp(k * 2, 0, 1));
      A.bro.flip = true;
      A.bro.beat = lerp(9, 2.2, clamp(k * 1.6, 0, 1));
      A.bro.exp = 'wide';
      A.you.x = lerp(306, 336, k); A.you.y = lerp(296, 262, k);
      A.you.rot = -0.22; A.you.beat = lerp(8, 1.3, clamp(k * 2, 0, 1));
      A.you.exp = k > 0.4 ? 'sad' : 'wide';
      if (Math.random() < 6 * dt) FX.bubble(A.bro.x, A.bro.y, 1, 1.6);
      if (bt > 9.6) Intro.fade = (bt - 9.6) / 1.4 * 0.5;
    }
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'deep', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 354, set: 'D', shafts: 0.45 });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t);
    ctx.save(); ctx.translate(R(SC.yX), R(SC.yY)); ctx.drawImage(YAC.s.c, -YAC.s.ax, -YAC.s.ay); ctx.restore();
    // davit rope down to the net
    drawRope(ctx, SC.yX + 178, SC.yY - 78, SC.netX, SC.netY + 2, 14, '#d8cfae', '#7a6a44');
    drawManatee(ctx, A.bro, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    // the brother's outstretched flipper, reaching back
    if (bt > 6.0) {
      const M = A.bro.set, b = A.bro;
      const cs = Math.cos(b.rot), sn = Math.sin(b.rot), fxs = b.flip ? -1 : 1;
      const sx = b.x + (M.shoX * fxs) * cs - M.shoY * sn;
      const sy = b.y + (M.shoX * fxs) * sn + M.shoY * cs;
      const a = angleTo(sx, sy, A.you.x, A.you.y);
      ctx.save(); ctx.translate(R(sx), R(sy)); ctx.rotate(a); ctx.scale(1.5, 1.3);
      ctx.drawImage(M.flip.c, -M.flip.ax, -M.flip.ay);
      ctx.restore();
    }
    drawNet(ctx, { x: SC.netX, y: SC.netY, w: 206, h: 150, cinch: SC.cinch, t: Intro.t, sway: 7, hole: { j: 7, i: 0, w: 4, h: 4 } });
    FX.render(ctx);
    foreground(ctx, { scroll: Intro.scroll, t: Intro.t, bedY: 354, set: 'D' });
  },
});

// --------------------------------------------- 9. CAPTURED / THE BLACKOUT
BEATS.push({
  name: 'captured', dur: 8.0,
  lines: [[0.4, 'Then the machine came down for me.'], [4.4, 'It did not care that I was screaming.'], [6.4, 'After that, nothing, for a while.']],
  enter() {
    SC.surfY = -40; SC.pvx = 700; SC.pvy = -260; SC.a1 = 1.90; SC.a2 = 0.25;
    SC.clamped = false; SC.broke = false; SC.black = 0; SC.beatT = 0;
    A.you = actor(MAN.you, 430, 216, { beat: 4.0, exp: 'wide' });
  },
  claw() { // forward kinematics for the boom tip
    const x1 = SC.pvx + Math.cos(SC.a1) * 194, y1 = SC.pvy + Math.sin(SC.a1) * 194;
    return [x1 + Math.cos(SC.a1 + SC.a2) * 80, y1 + Math.sin(SC.a1 + SC.a2) * 80];
  },
  update(dt, bt) {
    Intro.scroll += 6 * dt;
    swim(A.you, dt);
    if (bt < 2.4) {                                   // the arm comes down
      const k = clamp(bt / 2.2, 0, 1), e = k * k * (3 - 2 * k);
      SC.pvx = lerp(700, 537, e); SC.pvy = lerp(-260, -35, e);
      const c = this.claw();
      if (bt < 1.9) { A.you.x = 430 + Math.sin(bt * 2.2) * 22; A.you.y = 216 + Math.sin(bt * 3) * 12; A.you.rot = Math.sin(bt * 3) * 0.2; }
      else { A.you.x = lerp(A.you.x, c[0], 8 * dt); A.you.y = lerp(A.you.y, c[1] + 22, 8 * dt); }
      if (bt >= 2.15 && !SC.clamped) {
        SC.clamped = true; Intro.shake = 12;
        FX.bubble(A.you.x, A.you.y, 20, 2.6);
        if (typeof Audio_ !== 'undefined') { Audio_.tone(150, 0.22, 'square', 0.22, -70); Audio_.noise(0.3, 0.3, 1600, 200); Audio_.hurt(); }
      }
      if (Math.random() < 10 * dt) FX.bubble(A.you.x + rand(-14, 14), A.you.y, 1, 1.8);
    } else if (bt < 4.3) {                            // hauled out of the water
      const k = clamp((bt - 2.4) / 1.9, 0, 1);
      SC.pvx = lerp(537, 610, k); SC.pvy = lerp(-35, -330, k * k);
      SC.surfY = lerp(-60, 330, k);
      const c = this.claw();
      A.you.x = c[0]; A.you.y = c[1] + 22; A.you.rot = 0.15 + Math.sin(bt * 8) * 0.16 * (1 - k);
      A.you.beat = 7; A.you.exp = 'pain';
      if (!SC.broke && A.you.y > SC.surfY) {
        SC.broke = true; FX.drops(A.you.x, SC.surfY, 70, 1.2); FX.foam(A.you.x, SC.surfY, 30, 1.4);
        if (typeof Audio_ !== 'undefined') Audio_.splash(3);
      }
      if (SC.broke && Math.random() < 30 * dt) FX.drops(A.you.x + rand(-20, 20), A.you.y + 10, 1, 0.4);
    } else if (bt < 6.3) {                            // swung over the deck, sight going
      const k = clamp((bt - 4.3) / 2.0, 0, 1);
      SC.deckClawX = lerp(130, 470, k * k * (3 - 2 * k));
      SC.deckClawY = lerp(74, 108 + k * 26, k);
      A.you.rot = 0.2 + Math.sin(bt * 5) * 0.12 * (1 - k);
      A.you.beat = lerp(5, 1.2, k);
      A.you.exp = k > 0.5 ? 'dead' : 'pain';
      SC.black = clamp((bt - 4.9) / 1.4, 0, 1);
      if (Math.random() < 14 * dt * (1 - k)) FX.drops(SC.deckClawX + rand(-16, 16), SC.deckClawY + 30, 1, 0.3);
      if (typeof Audio_ !== 'undefined' && bt > 4.9) {
        SC.ring = (SC.ring || 0) - dt;
        if (SC.ring <= 0) { SC.ring = 0.9; Audio_.tone(760 - SC.black * 300, 1.1, 'sine', 0.05 * (1 - SC.black * 0.5)); }
      }
    } else {                                          // black: just a heartbeat
      SC.black = 1;
      SC.beatT -= dt;
      if (SC.beatT <= 0) {
        SC.beatT = 1.05;
        if (typeof Audio_ !== 'undefined') {
          Audio_.tone(52, 0.16, 'sine', 0.22, -14);
          setTimeout(() => { if (typeof Audio_ !== 'undefined') Audio_.tone(44, 0.22, 'sine', 0.16, -10); }, 230);
        }
      }
    }
  },
  render(ctx, bt) {
    if (bt < 4.3) {
      backdrop(ctx, { mood: 'deep', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY > 0 ? SC.surfY : null, bedY: 356, set: 'D', shafts: 0.4 });
      if (SC.surfY > 0) drawAir(ctx, SC.surfY, Intro.scroll, Intro.t);
      if (SC.surfY < 40) { ctx.save(); ctx.translate(180, SC.surfY - 4); ctx.drawImage(YAC.s.c, -YAC.s.ax, -YAC.s.ay); ctx.restore(); }
      drawManatee(ctx, A.you, Intro.t);
      drawCrane(ctx, { x: SC.pvx, y: SC.pvy, a1: SC.a1, a2: SC.a2, a3: -SC.a1 - SC.a2, hook: 1, open: SC.clamped ? 0.12 : 0.85 });
      FX.render(ctx);
    } else if (bt < 6.3) {
      drawDeck(ctx, Intro.t, bt);
      ctx.save(); ctx.translate(R(SC.deckClawX), R(SC.deckClawY));
      P(ctx, IP.ink, -3, -300, 6, 300); P(ctx, '#e0a838', -2, -300, 4, 300);
      ctx.drawImage(CR.clawBody.c, -CR.clawBody.ax, -CR.clawBody.ay);
      ctx.restore();
      const yy = Object.assign({}, A.you, { x: SC.deckClawX, y: SC.deckClawY + 30, set: MAN.you });
      drawManatee(ctx, yy, Intro.t);
      ctx.save(); ctx.translate(R(SC.deckClawX), R(SC.deckClawY));
      for (const [sx, dir] of [[-13, -1], [0, 0], [13, 1]]) {
        ctx.save(); ctx.translate(sx, 17); ctx.rotate(dir === 0 ? 1.57 : 1.57 + dir * 0.12 * 0.8); ctx.scale(dir < 0 ? -1 : 1, 1);
        ctx.drawImage(CR.finger.c, -CR.finger.ax, -CR.finger.ay); ctx.restore();
      }
      ctx.restore();
      FX.render(ctx);
      // consciousness going: a hard-edged vignette closing in, then black
      if (SC.black > 0) {
        const k = SC.black;
        for (let i = 0; i < 12; i++) {
          const a = qa(clamp(k * 1.6 - i * 0.10, 0, 1));
          if (a <= 0) continue;
          ctx.fillStyle = rgbaq('#000000', a);
          const inset = R(i * 13 * (1 - k * 0.35));
          ctx.fillRect(0, inset, 640, 13); ctx.fillRect(0, 360 - inset - 13, 640, 13);
          ctx.fillRect(inset, 0, 16, 360); ctx.fillRect(640 - inset - 16, 0, 16, 360);
        }
      }
    } else {
      P(ctx, '#000000', 0, 0, 640, 360);
      // the heartbeat, as a dim red breath at the edges
      const ph = 1 - clamp(SC.beatT / 1.05, 0, 1);
      const pulse = Math.max(0, Math.sin(ph * 9) * Math.max(0, 1 - ph * 3));
      if (pulse > 0.02) {
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = rgbaq('#3a0a10', qa(pulse * (0.26 - i * 0.04)));
          const inset = i * 11;
          ctx.fillRect(0, inset, 640, 11); ctx.fillRect(0, 349 - inset, 640, 11);
          ctx.fillRect(inset, 0, 13, 360); ctx.fillRect(627 - inset, 0, 13, 360);
        }
      }
    }
  },
});
// ---- the yacht deck, seen from the side ------------------------------------
function drawDeck(ctx, t, bt) {
  if (!LAY.sky) LAY.sky = buildSky();
  P(ctx, IP.sky[0], 0, 0, 640, 360);
  tile(ctx, LAY.sky, t * 4, 152 - LAY.sky.height);
  // open sea behind the rail
  for (let y = 152; y < 190; y++) {
    const k = (y - 152) / 38;
    P(ctx, k < 0.3 ? '#2a6f9c' : k < 0.62 ? '#1f5a86' : '#17466b', 0, y, 640, 1);
  }
  for (let x = 0; x < 640; x += 3) if (hash2(x, Math.floor(t * 2) + (x % 5)) > 0.84) P(ctx, '#bcdcec', x, 154 + R(hash2(x, 3) * 32), 4, 1);
  // guard rail
  for (let x = 6; x < 640; x += 44) { P(ctx, IP.ink, x, 150, 5, 44); P(ctx, '#c3ccd8', x + 1, 151, 3, 42); P(ctx, '#eef4fa', x + 1, 151, 1, 42); }
  P(ctx, IP.ink, 0, 146, 640, 5); P(ctx, '#dfe6ee', 0, 147, 640, 2); P(ctx, '#9aa6b6', 0, 149, 640, 1);
  P(ctx, IP.ink, 0, 168, 640, 3); P(ctx, '#b9c4d0', 0, 169, 640, 1);
  // bulwark cap + coaming
  P(ctx, IP.ink, 0, 190, 640, 4);
  P(ctx, '#eef2f7', 0, 194, 640, 12); P(ctx, '#ccd4de', 0, 203, 640, 3);
  P(ctx, IP.ink, 0, 206, 640, 2);
  // deck sole, darker where it meets the bulwark
  for (let y = 208; y < 360; y++) {
    const k = (y - 208) / 152;
    const base = k < 0.16 ? '#7e7a6a' : k < 0.44 ? '#9a9584' : k < 0.74 ? '#aea895' : '#bdb6a1';
    P(ctx, ((y % 11) === 0) ? '#5f5c50' : base, 0, y, 640, 1);
  }
  for (let x = 0; x < 640; x += 61) { P(ctx, '#5f5c50', x, 208, 1, 152); P(ctx, '#c9c2ad', x + 1, 208, 1, 152); }
  for (let i = 0; i < 90; i++) { const gx = R(hash2(i, 5) * 640), gy = 210 + R(hash2(i, 9) * 148); P(ctx, hash2(gx, gy) > 0.5 ? '#8d8878' : '#c6bfab', gx, gy, 2, 1); }
  for (let i = 0; i < 6; i++) { const gx = 40 + R(hash2(i, 21) * 520); P(ctx, '#7f8f86', gx, 300 + R(hash2(i, 3) * 44), R(20 + hash2(i, 7) * 40), 3); }
  // ---- crates, cooler and winch to port
  P(ctx, IP.ink, 36, 246, 78, 58); P(ctx, '#8a5f2f', 37, 247, 76, 56); P(ctx, '#b5813f', 37, 247, 76, 5);
  for (let i = 0; i < 5; i++) P(ctx, '#5c3a1c', 37, 255 + i * 11, 76, 2);
  P(ctx, '#3f3324', 36, 304, 78, 4);
  P(ctx, IP.ink, 132, 262, 58, 42); P(ctx, '#d8dde4', 133, 263, 56, 40); P(ctx, '#9aa6b6', 133, 292, 56, 11);
  P(ctx, '#c4202c', 138, 268, 46, 5); P(ctx, '#3f3324', 132, 304, 58, 4);
  P(ctx, IP.ink, 206, 232, 54, 72); P(ctx, '#4a525e', 207, 233, 52, 70); P(ctx, '#767f8d', 207, 233, 52, 7);
  for (let i = 0; i < 5; i++) P(ctx, '#2a3038', 211 + i * 9, 246, 4, 46);
  P(ctx, '#3f3324', 206, 304, 54, 4);
  // ---- the tank, standing on the deck
  const tx = 392, ty = 150, tw = 212, th = 176;
  P(ctx, IP.ink, tx - 6, ty - 6, tw + 12, th + 12);
  P(ctx, '#4b5460', tx - 5, ty - 5, tw + 10, th + 10);
  P(ctx, '#79838f', tx - 5, ty - 5, tw + 10, 3); P(ctx, '#2a303a', tx - 5, ty + th + 2, tw + 10, 3);
  for (let i = 0; i < tw; i += 17) { P(ctx, '#9aa4b0', tx + i + 4, ty - 4, 2, 2); P(ctx, '#9aa4b0', tx + i + 4, ty + th + 2, 2, 2); }
  P(ctx, '#3f5a2c', tx, ty, tw, th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (hash2(x + y * 7, y) > 0.87) P(ctx, hash2(x, y) > 0.5 ? '#4e6f36' : '#32491f', tx + x, ty + y);
  P(ctx, '#20301a', tx, ty + th - 24, tw, 24);
  P(ctx, '#6f8f4a', tx, ty + 4, tw, 6); P(ctx, '#d8f0a0', tx, ty + 4, tw, 2); P(ctx, IP.ink, tx, ty + 3, tw, 1);
  for (let i = 0; i < 26; i++) {
    const fx2 = tx + 8 + R(hash2(i * 7, 3) * (tw - 24)), fy = ty + 18 + R(hash2(i, 9) * (th - 46));
    const sp = FISHSPR[i % 4][i % 3];
    ctx.save(); ctx.translate(fx2, fy + R(Math.sin(t * 2 + i) * 3)); if (i & 1) ctx.scale(-1, 1); ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.restore();
  }
  for (let i = 0; i < 6; i++) { const sp = FISHDEAD[i % 4]; ctx.save(); ctx.translate(tx + 22 + i * 32, ty + 13 + R(Math.sin(t * 0.6 + i) * 2)); ctx.scale(1, -1); ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.restore(); }
  for (let i = 0; i < 5; i++) { ctx.fillStyle = rgbaq('#f2fff0', 0.07); ctx.fillRect(tx + 14 + i * 42, ty + 8, 10, th - 16); }
  P(ctx, IP.ink, tx - 6, ty + th + 6, tw + 12, 8); P(ctx, '#2a3038', tx - 5, ty + th + 6, tw + 10, 7);
  // ---- deck hands watching the catch come aboard
  figure(ctx, 286, 322, 48, { facing: 1, lean: -0.05, armA: 0.25, foreA: 0.45, armB: 0.15, foreB: 0.30, legA: 0.46, legB: -0.44, head: 0.12 }, '#222c3e', '#6d8fae');
  figure(ctx, 338, 324, 45, { facing: 1, lean: 0.08, armA: -0.45, foreA: -0.9, armB: 0.30, foreB: 0.55, legA: -0.42, legB: 0.46, head: 0.18 }, '#2b2436', '#7a7290');
  void bt;
}
// ===========================================================================
//  BELOW DECK — the hold, the crate, the catch
// ===========================================================================
const HOLD = {};
function buildShrimpSprites() {
  const out = [];
  const pink = ['#7a3a3c', '#a85a52', '#d08a76', '#eab79c'];
  const silver = ['#4a5560', '#6d7a86', '#93a0aa', '#c3ced6'];
  // shrimp: curled body, legs, black eye
  for (let v = 0; v < 2; v++) {
    const W = 11, H = 8, c = can(W, H), x = cx2(c);
    const ramp = v ? ['#8a4230', '#b8634a', '#dc9370', '#f3c2a0'] : pink;
    for (let i = 0; i < 7; i++) {
      const a = -0.5 + i * 0.34;
      const px2 = R(2 + i * 1.2), py = R(2 + Math.sin(a) * 2.2 + i * 0.35);
      const h = Math.max(2, 5 - Math.abs(i - 2));
      P(x, IP.ink, px2, py - 1, 2, h + 2);
      P(x, ramp[1 + (i & 1)], px2, py, 2, h);
      P(x, ramp[3], px2, py, 2, 1);
    }
    P(x, IP.ink, 1, 2, 2, 2); P(x, '#0b0b10', 1, 3, 1, 1);
    P(x, ramp[2], 9, 5, 2, 1); P(x, ramp[2], 10, 3, 1, 2);
    out.push(spr(c, 5, 4));
  }
  // small dead fish
  for (let v = 0; v < 2; v++) {
    const W = 14, H = 7, c = can(W, H), x = cx2(c);
    const ramp = v ? silver : ['#4d5a3c', '#6f7d50', '#94a06c', '#c2cb96'];
    for (let i = 0; i < 9; i++) {
      const h = Math.max(1, R(5 - Math.abs(i - 3) * 0.9));
      P(x, IP.ink, 3 + i, 3 - h, 1, h * 2 + 1);
      P(x, ramp[1], 3 + i, 4 - h, 1, h * 2 - 1);
      P(x, ramp[3], 3 + i, 4 - h, 1, 1);
    }
    tri(x, IP.ink, 0, 0, 0, 6, 4, 3); tri(x, ramp[2], 1, 1, 1, 5, 4, 3);
    P(x, IP.ink, 10, 2, 2, 2); P(x, '#d8dce0', 10, 2, 2, 2); P(x, IP.ink, 10, 2, 1, 1); P(x, IP.ink, 11, 3, 1, 1);
    out.push(spr(c, 7, 3));
  }
  return out;
}
function buildHoldBG() {
  const c = can(640, 360), x = cx2(c);
  const W = ['#140f0c', '#1e1712', '#2a2019', '#382b21', '#4a3a2c'];
  // back wall planking
  for (let y = 0; y < 360; y++) {
    const b = ((y % 13) === 0) ? 0 : ((y % 13) < 4 ? 2 : 1);
    for (let px2 = 0; px2 < 640; px2++) {
      const n = vnoise(px2 * 0.03, y * 0.05);
      P(x, W[clamp(b + (n > 0.62 ? 1 : n < 0.34 ? -1 : 0), 0, 4)], px2, y);
    }
  }
  // hull frames
  for (let fx = -20; fx < 660; fx += 96) {
    const lean = (fx - 320) * 0.035;
    for (let y = 0; y < 360; y++) {
      const px2 = R(fx + lean * (1 - y / 360) * 6);
      P(x, IP.ink, px2 - 1, y, 16, 1);
      P(x, W[3], px2, y, 13, 1);
      P(x, W[4], px2, y, 3, 1);
      P(x, W[0], px2 + 11, y, 2, 1);
    }
    for (let y = 26; y < 360; y += 58) {
      P(x, IP.ink, R(fx) - 3, y, 20, 7); P(x, '#4a525e', R(fx) - 2, y + 1, 18, 5);
      P(x, '#767f8d', R(fx) - 2, y + 1, 18, 2);
      for (let i = 0; i < 3; i++) { P(x, '#9aa4b0', R(fx) + 1 + i * 6, y + 3, 2, 2); P(x, IP.ink, R(fx) + 1 + i * 6, y + 5, 2, 1); }
    }
  }
  // overhead deck beams, with a hatch gap around x 250..332
  P(x, IP.ink, 0, 0, 640, 46);
  for (let px2 = 0; px2 < 640; px2++) {
    if (px2 > 250 && px2 < 332) continue;
    for (let y = 0; y < 44; y++) {
      const b = ((y % 9) === 0) ? 0 : ((y % 9) < 3 ? 2 : 1);
      P(x, W[b], px2, y);
    }
  }
  for (const bx of [40, 150, 360, 470, 580]) {
    P(x, IP.ink, bx - 2, 0, 26, 52); P(x, W[3], bx, 0, 22, 50); P(x, W[4], bx, 0, 22, 3);
    P(x, W[0], bx + 18, 0, 4, 50);
    P(x, IP.ink, bx + 2, 40, 18, 8); P(x, '#4a525e', bx + 3, 41, 16, 6); P(x, '#8c97a8', bx + 3, 41, 16, 2);
  }
  // stacked crates in the background
  const rng = new SeededRandom(8181);
  for (let i = 0; i < 7; i++) {
    const bx = R(rng.range(-20, 600)), by = R(rng.range(120, 250)), bw = R(rng.range(54, 96)), bh = R(rng.range(44, 70));
    P(x, IP.ink, bx, by, bw, bh);
    P(x, '#2e2418', bx + 1, by + 1, bw - 2, bh - 2);
    for (let j = 1; j < 5; j++) P(x, '#1c150d', bx + 1, by + R(j * bh / 5), bw - 2, 2);
    P(x, '#3d2f1e', bx + 1, by + 1, bw - 2, 2);
    P(x, '#191209', bx + 1, by + bh - 4, bw - 2, 3);
  }
  // hanging chain, hooks, coiled rope
  for (let y = 44; y < 150; y += 6) { P(x, IP.ink, 549, y, 7, 5); P(x, '#5d6675', 550, y + 1, 5, 3); P(x, '#9aa6b6', 550, y + 1, 5, 1); }
  P(x, IP.ink, 546, 150, 13, 16); P(x, '#767f8d', 547, 151, 11, 14); P(x, '#2a3038', 550, 158, 5, 7);
  for (let y = 44; y < 96; y += 5) { P(x, '#6a5330', 92, y, 3, 4); P(x, '#8a6a3a', 92, y, 1, 4); }
  for (let i = 0; i < 5; i++) { P(x, IP.ink, 76, 96 + i * 7, 36, 8); P(x, '#8a6a3a', 77, 97 + i * 7, 34, 6); P(x, '#b08a4c', 77, 97 + i * 7, 34, 2); }
  // barrels
  for (const [bx, by] of [[186, 216], [222, 226]]) {
    P(x, IP.ink, bx, by, 34, 56); P(x, '#4a3520', bx + 1, by + 1, 32, 54);
    P(x, '#6b4d2c', bx + 1, by + 1, 32, 4); P(x, '#2c1f10', bx + 1, by + 50, 32, 5);
    for (const ry of [10, 26, 42]) { P(x, '#5d6675', bx + 1, by + ry, 32, 4); P(x, '#9aa6b6', bx + 1, by + ry, 32, 1); }
  }
  // bilge water + drain
  for (let y = 330; y < 360; y++) for (let px2 = 0; px2 < 640; px2++) {
    const n = vnoise(px2 * 0.05, y * 0.2 + 3);
    P(x, n > 0.56 ? '#22301f' : n > 0.36 ? '#18220f' : '#10170a', px2, y);
  }
  P(x, IP.ink, 0, 328, 640, 2);
  P(x, IP.ink, 400, 336, 44, 20); P(x, '#2a3038', 401, 337, 42, 18);
  for (let i = 0; i < 5; i++) P(x, '#5d6675', 404 + i * 8, 338, 3, 16);
  // slime streaks down the wall
  for (let i = 0; i < 40; i++) {
    const sx = R(hash2(i * 7, 3) * 640), sy = R(hash2(i * 3, 11) * 300);
    x.fillStyle = rgbaq('#4b5c34', qa(0.10 + hash2(i, 5) * 0.12));
    x.fillRect(sx, sy, 1 + (i % 3), R(12 + hash2(i, 9) * 60));
  }
  return c;
}
function buildCrateWall() {
  const c = can(640, 360), x = cx2(c);
  const W = ['#241a11', '#33251733', '#000000'];
  const board = (bx, bw) => {
    for (let px2 = bx; px2 < bx + bw && px2 < 640; px2++) {
      if (px2 < 0) continue;
      for (let y = 0; y < 360; y++) {
        const n = vnoise(px2 * 0.06, y * 0.03);
        const edge = px2 === bx || px2 === bx + bw - 1;
        let col = edge ? '#150e07' : n > 0.66 ? '#4d3a24' : n > 0.44 ? '#3c2d1c' : n > 0.26 ? '#2f2316' : '#241a11';
        if ((y % 71) < 2 && !edge) col = '#1b1309';
        P(x, col, px2, y);
      }
      // grain
      for (let y = 0; y < 360; y += 9) if (hash2(px2, y) > 0.72) P(x, '#1d1409', px2, y + R(hash2(px2, 3) * 6), 1, 3);
    }
    // nails
    for (const ny of [30, 128, 232, 330]) { P(x, IP.ink, bx + 3, ny, 3, 3); P(x, '#8c97a8', bx + 4, ny + 1, 2, 2); P(x, IP.ink, bx + bw - 6, ny, 3, 3); P(x, '#8c97a8', bx + bw - 5, ny + 1, 2, 2); }
  };
  for (let bx = -12; bx < 660; bx += 42) {
    if (bx > 484 && bx < 520) continue;                 // the loose board lives here
    board(bx, 33);
  }
  // heavy corner posts, in front of everything
  for (const [bx, bw] of [[0, 30], [610, 30]]) {
    for (let px2 = bx; px2 < bx + bw; px2++) for (let y = 0; y < 360; y++) {
      const n = vnoise(px2 * 0.05, y * 0.04);
      P(x, (px2 === bx || px2 === bx + bw - 1) ? IP.ink : n > 0.6 ? '#3a2b1a' : n > 0.36 ? '#2a1f12' : '#1c140b', px2, y);
    }
    for (let y = 18; y < 360; y += 64) { P(x, IP.ink, bx + 2, y, bw - 4, 9); P(x, '#4a525e', bx + 3, y + 1, bw - 6, 7); P(x, '#8c97a8', bx + 3, y + 1, bw - 6, 2); }
  }
  // top rail band under the deck beams
  for (let px2 = 0; px2 < 640; px2++) for (let y = 44; y < 62; y++) {
    const n = vnoise(px2 * 0.04, y * 0.1);
    P(x, (y === 44 || y === 61) ? IP.ink : n > 0.55 ? '#46341f' : '#33261650', px2, y);
  }
  for (let px2 = 0; px2 < 640; px2++) for (let y = 45; y < 61; y++) {
    const n = vnoise(px2 * 0.04, y * 0.1);
    P(x, n > 0.55 ? '#46341f' : n > 0.3 ? '#382a19' : '#2b2013', px2, y);
  }
  P(x, IP.ink, 0, 44, 640, 2); P(x, IP.ink, 0, 60, 640, 2);
  void W;
  return c;
}
function buildLooseBoard() {
  const c = can(36, 360), x = cx2(c);
  for (let px2 = 0; px2 < 33; px2++) for (let y = 0; y < 360; y++) {
    const n = vnoise((px2 + 486) * 0.06, y * 0.03);
    const edge = px2 === 0 || px2 === 32;
    P(x, edge ? '#150e07' : n > 0.66 ? '#4d3a24' : n > 0.44 ? '#3c2d1c' : n > 0.26 ? '#2f2316' : '#241a11', px2, y);
  }
  for (const ny of [30, 128, 232, 330]) { P(x, IP.ink, 3, ny, 3, 3); P(x, '#8c97a8', 4, ny + 1, 2, 2); }
  return spr(c, 16, 180);
}
function buildFishPile(W, H, seed, dense) {
  const c = can(W, H), x = cx2(c), rng = new SeededRandom(seed);
  const sp = HOLD.shrimp;
  for (let i = 0; i < dense; i++) {
    const u = rng.next();
    const px2 = R(rng.range(4, W - 4));
    const hump = Math.sin((px2 / W) * Math.PI) * 0.75 + 0.25;
    const py = R(H - rng.range(2, H * hump));
    const s = sp[rng.int(0, sp.length - 1)];
    x.save(); x.translate(px2, py); x.rotate(rng.range(-1.2, 1.2));
    if (rng.next() > 0.5) x.scale(-1, 1);
    x.drawImage(s.c, -s.ax, -s.ay); x.restore();
  }
  // wet sheen and slime pooling between them
  for (let i = 0; i < W; i++) {
    const hump = Math.sin((i / W) * Math.PI) * 0.75 + 0.25;
    const top = R(H - H * hump);
    for (let y = top; y < H; y++) if (hash2(i, y) > 0.955) P(x, '#c9d6b0', i, y, 2, 1);
  }
  return c;
}
function buildBulb() {
  const c = can(13, 20), x = cx2(c);
  P(x, '#2a2018', 6, 0, 1, 7);
  P(x, IP.ink, 3, 6, 7, 6); P(x, '#767f8d', 4, 7, 5, 4); P(x, '#c0cad6', 4, 7, 5, 1);
  for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) {
    const d = Math.hypot(xx / 5, yy / 5.4);
    if (d > 1) continue;
    P(x, d > 0.86 ? IP.ink : d > 0.55 ? '#e8d27a' : '#fff6cc', 6 + xx, 14 + yy);
  }
  P(x, '#ff9a3c', 5, 13, 1, 3); P(x, '#ff9a3c', 7, 13, 1, 3); P(x, '#fff6cc', 6, 12, 1, 2);
  return spr(c, 6, 0);
}
function buildBackPlate() {
  const c = can(40, 26), x = cx2(c);
  P(x, IP.ink, 2, 4, 36, 18);
  for (let y = 5; y < 21; y++) for (let px2 = 3; px2 < 37; px2++) {
    const top = y < 8, bot = y > 17;
    P(x, top ? '#93a4c0' : bot ? '#2a3342' : ((px2 * 3 + y) % 7 === 0 ? '#45526b' : '#63728d'), px2, y);
  }
  for (let i = 0; i < 5; i++) { P(x, '#cdd9ea', 6 + i * 7, 7, 2, 2); P(x, IP.ink, 6 + i * 7, 9, 2, 1); P(x, '#cdd9ea', 6 + i * 7, 17, 2, 2); P(x, IP.ink, 6 + i * 7, 19, 2, 1); }
  // straps over the top and bottom edges
  for (const sy of [0, 22]) { P(x, IP.ink, 8, sy, 7, 5); P(x, '#6d4527', 9, sy + 1, 5, 3); P(x, '#8f6038', 9, sy + 1, 5, 1); P(x, IP.ink, 26, sy, 7, 5); P(x, '#6d4527', 27, sy + 1, 5, 3); P(x, '#8f6038', 27, sy + 1, 5, 1); }
  P(x, '#e0a838', 18, 11, 5, 5); P(x, '#f8dc86', 18, 11, 5, 2); P(x, IP.ink, 18, 16, 5, 1);
  return spr(c, 20, 13);
}
function buildTool() {
  const c = can(22, 9), x = cx2(c);
  P(x, IP.ink, 0, 3, 18, 4); P(x, '#6d7686', 1, 4, 16, 2); P(x, '#aab3c0', 1, 4, 16, 1);
  P(x, IP.ink, 15, 0, 7, 6); P(x, '#8c97a8', 16, 1, 5, 4); P(x, IP.ink, 18, 2, 3, 2);
  P(x, '#5c3a1c', 1, 3, 5, 4); P(x, '#8a5f2f', 1, 3, 5, 1);
  return spr(c, 2, 4.5);
}
function holdArt() {
  if (HOLD.bg) return HOLD;
  HOLD.shrimp = buildShrimpSprites();
  HOLD.bg = buildHoldBG();
  HOLD.wall = buildCrateWall();
  HOLD.board = buildLooseBoard();
  HOLD.pileBack = buildFishPile(640, 150, 1717, 420);
  HOLD.pileFront = buildFishPile(560, 96, 9292, 260);
  HOLD.bulb = buildBulb();
  HOLD.plate = buildBackPlate();
  HOLD.tool = buildTool();
  return HOLD;
}
// ---- the in-game Captain Otter, reused so the two match --------------------
const CAP = {};
function capOtter() {
  if (CAP.ready) return CAP;
  if (typeof CH === 'undefined' || !CH.otterTorso || !CH.otterHead) return null;
  // a rougher, hungrier copy of the same torso: grime, salt, a torn cape hem
  const t = CH.otterTorso, c = can(t.w, t.h), x = cx2(c);
  x.drawImage(t.c, 0, 0);
  const img = x.getImageData(0, 0, t.w, t.h), d = img.data;
  for (let y = 0; y < t.h; y++) for (let px2 = 0; px2 < t.w; px2++) {
    const i = (y * t.w + px2) * 4;
    if (d[i + 3] < 40) continue;
    if (hash2(px2 * 5, y * 7) > 0.90) { d[i] = (d[i] * 0.55) | 0; d[i + 1] = (d[i + 1] * 0.55) | 0; d[i + 2] = (d[i + 2] * 0.5) | 0; }
    else if (hash2(px2 * 11, y * 3) > 0.965) { d[i] = 232; d[i + 1] = 228; d[i + 2] = 216; }
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 4; i++) P(x, '#e8e4d8', 8 + i, 12 + i);
  CAP.torso = spr(c, t.ax, t.ay);
  CAP.arm = CH.otterArm; CAP.tail = CH.otterTail; CAP.ready = true;
  return CAP;
}
function drawCapOtter(ctx, o, t) {
  const C = capOtter();
  if (!C) { drawOtter(ctx, o, t); return; }
  ctx.save();
  ctx.translate(R(o.x), R(o.y));
  if (o.flip) ctx.scale(-1, 1);
  ctx.rotate(o.rot || 0);
  const s = o.s === undefined ? 1 : o.s;
  ctx.scale(s, s);
  const ph = o.phase || 0;
  ctx.save(); ctx.translate(-10, 5); ctx.rotate(2.45 + Math.sin(ph) * 0.12);
  ctx.drawImage(C.tail.c, -C.tail.ax, -C.tail.ay); ctx.restore();
  ctx.save(); ctx.translate(-2, 2); ctx.rotate(o.armFar === undefined ? 1.15 : o.armFar);
  ctx.drawImage(C.arm.c, -C.arm.ax, -C.arm.ay); ctx.restore();
  const torso = o.rough === false ? CH.otterTorso : C.torso;
  ctx.drawImage(torso.c, -torso.ax, -torso.ay);
  ctx.save(); ctx.translate(2, 3); ctx.rotate(o.armNear === undefined ? 0.7 : o.armNear);
  ctx.drawImage(C.arm.c, -C.arm.ax, -C.arm.ay);
  if (o.tool) { ctx.translate(C.arm.w - 3, 0); ctx.rotate(o.toolR || 0); ctx.drawImage(HOLD.tool.c, -HOLD.tool.ax, -HOLD.tool.ay); }
  ctx.restore();
  ctx.save();
  ctx.translate(o.headX || 0, -9 + (o.headY || 0) + Math.sin(ph * 0.8) * 0.5);
  ctx.rotate(o.headR || 0);
  const hd = otterHeadWithFace(o.exp || 'idle', o.blink, t, false);
  ctx.drawImage(hd, -CH.otterHead.ax, -CH.otterHead.ay);
  if (o.rough !== false) { for (let i = 0; i < 4; i++) P(ctx, '#e8e4d8', -CH.otterHead.ax + 4 + i, -CH.otterHead.ay + 8 + i); }
  if (o.cigar !== false) {
    ctx.drawImage(CH.cigar.c, 6, -1);
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.45 + i * 0.25) % 1;
      ctx.fillStyle = rgbaq('#b9b3ad', qa(0.30 * (1 - k)));
      ctx.fillRect(R(17 + Math.sin(k * 6 + i) * 3), R(-2 - k * 20), 2 + R(k * 3), 2 + R(k * 3));
    }
  }
  ctx.restore();
  ctx.restore();
}
// ---- lighting + eyelids ----------------------------------------------------
function glowPatch(ctx, x, y, rx, ry, col, a0, steps) {
  for (let i = steps; i >= 1; i--) {
    const k = i / steps, a = qa(a0 * (1 - k) * (1 - k) + a0 * 0.08);
    if (a <= 0) continue;
    ctx.fillStyle = rgbaq(col, a);
    const RX = rx * k, RY = ry * k;
    for (let yy = -RY; yy <= RY; yy += 2) {
      const w = Math.sqrt(Math.max(0, 1 - (yy / RY) * (yy / RY))) * RX;
      if (w < 1) continue;
      ctx.fillRect(R(x - w), R(y + yy), R(w * 2), 2);
    }
  }
}
function slatShaft(ctx, x0, x1, y0, y1, lean, a0, col) {
  for (let y = y0; y < y1; y++) {
    const k = (y - y0) / (y1 - y0);
    const a = qa(a0 * (1 - k) * (1 - k));
    if (a <= 0) continue;
    ctx.fillStyle = rgbaq(col || '#ffe9b0', a);
    const off = R(lean * (y - y0));
    ctx.fillRect(R(x0 + off - k * 8), y, R((x1 - x0) + k * 16), 1);
  }
}
function eyelids(ctx, open) {
  if (open >= 1) return;
  const o = clamp(open, 0, 1);
  for (let x = 0; x < 640; x += 2) {
    const u = (x - 320) / 348;
    const cv = Math.pow(Math.max(0, 1 - u * u), 0.55);
    const half = 180 * o * cv;
    const top = R(180 - half), bot = R(180 + half);
    P(ctx, '#000000', x, 0, 2, Math.max(0, top));
    P(ctx, '#000000', x, bot, 2, Math.max(0, 360 - bot));
    if (half > 2) { P(ctx, '#0d0a08', x, top, 2, 2); P(ctx, '#0d0a08', x, bot - 2, 2, 2); }
  }
}

// ============================================================== THE  INTRO =
const Intro = {
  t: 0, bt: 0, dt: 1 / 60, beat: 0, done: false,
  scroll: 0, shake: 0, fade: 0, grace: 0.35, blink: false, blinkT: 2,
  reset() {
    buildIntroArt();
    this.t = 0; this.bt = 0; this.dt = 1 / 60; this.beat = 0; this.done = false;
    this.scroll = 0; this.shake = 0; this.fade = 0; this.grace = 0.4;
    this.blink = false; this.blinkT = 2;
    sndT = 0; sndT2 = 0;
    FX.clear();
    for (const k in SC) delete SC[k];
    if (BUILT && BEATS[0].enter) BEATS[0].enter();
  },
  skip() { this.done = true; },
  next() {
    this.beat++; this.bt = 0; this.fade = 0; this.scroll = 0; this.shake = 0;
    FX.clear();
    for (const k in SC) delete SC[k];
    if (this.beat >= BEATS.length) { this.done = true; return; }
    if (BEATS[this.beat].enter) BEATS[this.beat].enter();
  },
  update(dt) {
    if (this.done) return;
    if (!BUILT) { buildIntroArt(); if (!BUILT) { this.done = true; return; } if (BEATS[this.beat].enter) BEATS[this.beat].enter(); }
    if (dt > 1 / 20) dt = 1 / 20;
    this.dt = dt; this.t += dt; this.bt += dt; this.grace -= dt;
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = !this.blink; this.blinkT = this.blink ? 0.10 : rand(1.6, 4.6); }
    if (this.grace <= 0 && typeof Input !== 'undefined' && Input.mouse) {
      const adv = (Input.hit && (Input.hit('Enter') || Input.hit('NumpadEnter') || Input.hit('Space'))) || Input.mouse.clicked;
      if (adv) { this.next(); return; }
      if (Input.anyKey) { this.skip(); return; }
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    const b = BEATS[this.beat];
    if (!b) { this.done = true; return; }
    b.update(dt, this.bt);
    FX.update(dt);
    if (this.bt >= b.dur) this.next();
  },
  render(ctx) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (!BUILT || this.done) {
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 640, 360);
      ctx.restore(); return;
    }
    const b = BEATS[this.beat];
    if (!b) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 640, 360); ctx.restore(); return; }
    ctx.save();
    if (this.shake > 0.2) ctx.translate(R(rand(-this.shake, this.shake)), R(rand(-this.shake, this.shake)));
    b.render(ctx, this.bt);
    ctx.restore();
    if (this.fade > 0) { ctx.fillStyle = rgbaq('#000000', this.fade); ctx.fillRect(0, 0, 640, 360); }
    if (this.t < 0.9) { ctx.fillStyle = rgbaq('#000000', 1 - this.t / 0.9); ctx.fillRect(0, 0, 640, 360); }
    letterbox(ctx);
    // narration
    if (b.lines) {
      let line = null, prog = 0;
      for (const L of b.lines) if (this.bt >= L[0]) { line = L[1]; prog = this.bt - L[0]; }
      if (line && prog < line.length / 44 + 3.4) narrate(ctx, line, prog);
    }
    // persistent skip hint + beat pips
    if (this.t > 0.6) {
      pixelText(ctx, 'press any key to skip', 634, 9, 6, Math.floor(this.t * 0.8) % 2 ? '#7f8a96' : '#5f6a76', 'right');
      pixelText(ctx, 'ENTER / click: next scene', 6, 9, 6, '#4e5a66', 'left');
      for (let i = 0; i < BEATS.length; i++) {
        P(ctx, i < this.beat ? '#5f6a76' : i === this.beat ? '#e8eef4' : '#2a323c', 258 + i * 13, 11, i === this.beat ? 9 : 7, 2);
      }
    }
    ctx.restore();
  },
};

try { if (typeof document !== 'undefined' && document.createElement) buildIntroArt(); } catch (e) { /* built lazily on reset */ }

global.Intro = Intro;
global.IntroBeats = BEATS;
global.__introDebug = { MAN: MAN, drawManatee: drawManatee, drawOtter: drawOtter, drawBiz: drawBiz, figure: figure, drawCrane: drawCrane, drawNet: drawNet, get HARP() { return HARP; }, get BOAT() { return BOAT; }, get YAC() { return YAC; }, get TANK() { return TANK; } };
})(typeof window !== 'undefined' ? window : this);
