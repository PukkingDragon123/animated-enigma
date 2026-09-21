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
  night:   ['#1a5478', '#12405e', '#0d3049', '#0a2440', '#08182f', '#060f22', '#040916'],
  tank:    ['#7d9a4c', '#63803d', '#4c6632', '#3a5028', '#2b3c1f', '#1f2c17', '#16200f'],
  sky:     ['#3f86bc', '#58a0cf', '#7bbcde', '#a4d6e8', '#cfe9ee', '#eef0da'],
  // vegetation
  kelp: ['#0d3f22', '#1a6b35', '#2d9a4a', '#4bc45f', '#7ee87f'],
  grass: ['#13472a', '#237038', '#3aa04a', '#5fca5e'],
  coralA: ['#8a1d3c', '#c22f53', '#f0546f', '#ff94a4'],
  coralB: ['#8a4a0e', '#cc7a14', '#f5a82a', '#ffd977'],
  coralC: ['#432a78', '#6a3fae', '#9160dc', '#c096f2'],
  sand: ['#4b4a38', '#6d6a4c', '#8f8a62', '#b2ab7d', '#d0c79a'],
  rock: ['#1b2230', '#2b3444', '#3d4859', '#535f72', '#6e7b8e'],
  // sun-warmed sandstone for the shallow reef, so the bed is not all blue-grey
  rockWarm: ['#2a2018', '#3f3324', '#5a4835', '#785f45', '#977a5a'],
  // blood
  blood: ['#4b0a12', '#7a0d16', '#a8151f', '#c4202c', '#e8515a'],
  foam: ['#cfe8f2', '#e9f6fb', '#ffffff'],
  bone: '#e8e4d8',
  // ---- per-beat water ramps: each act of the story gets its own hour ------
  // sunlit lagoon: turquoise over warm gold-green sand light
  lagoon:  ['#86e6c0', '#46c6ab', '#25a293', '#177e7c', '#0e5f64', '#0a4750', '#07353c'],
  // the boat arrives: the same sea, drained cold and steely
  cold:    ['#63aec6', '#3f89a9', '#2b6a8e', '#1e5175', '#153c5c', '#0f2b46', '#0a1d32'],
  // the harpooning: teal water bruising down into maroon and black
  bruise:  ['#52a09c', '#3a7e84', '#2b5c68', '#39404a', '#4a2833', '#33131d', '#1c080e'],
  // the money water around the yacht: deep ink-navy, hard cyan skim on top
  money:   ['#2e88b0', '#1f6a95', '#154f77', '#0e3a5d', '#0a2946', '#061c33', '#041222'],
  // the run for open water at the end: bright, hopeful, sunlit blue
  dawn:    ['#7fe2ec', '#4cbcd8', '#3195bf', '#2375a4', '#195b88', '#124369', '#0c2f4d'],
  // ---- coloured light -----------------------------------------------------
  sunGold: '#ffdf96', sunAmber: '#ffb45a', sunCold: '#cfefff', sunRed: '#ff7a5e',
  lampHot: '#ffe6a8', lampCore: '#fff6d2', steelBlue: '#5f9fd4',
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

// ============================================================ CAUSTIC NET ==
//  The play field's ocean lights its water with three warped sine fields,
//  posterized into four steps and ADDED over the depth ramp, plus specular
//  glitter on the crests and plankton glints in the gloom (src/water.js does
//  all of it per pixel per frame).  Without it the cinematic's water is a
//  clean vertical ramp and reads like a painted backdrop next to the bay you
//  actually play in.  A wide shot cannot afford the shader, so the same three
//  fields are baked into a tile here at three phases and cycled -- two
//  drawImage calls a frame, and the beat's own grade recolours it, exactly
//  the way the sun shafts and the motes are already handled.
const CAUST_H = 300;
function buildCaustNet(seed, ph) {
  const c = can(LW, CAUST_H), x = cx2(c);
  const img = x.createImageData(LW, CAUST_H), d = img.data;
  for (let y = 0; y < CAUST_H; y++) {
    const dep = y / (CAUST_H - 1);
    const fade = Math.max(0, 1 - dep * 1.22);        // gone by four fifths down
    for (let px = 0; px < LW; px++) {
      // the same three fields, stretched along the swell so the net reads as
      // light on water rather than as noise
      const q3 = Math.sin(px * 0.020 - y * 0.038 + ph * 0.55);
      const s1 = Math.sin(px * 0.042 + y * 0.062 + ph * 1.15 + q3 * 2.1);
      const s2 = Math.sin(-px * 0.033 + y * 0.104 - ph * 0.95 - q3 * 1.7);
      const cv = s1 + s2 + q3 * 0.55;
      // Two hard steps of light with an ordered dither between them -- the
      // same posterize-then-Bayer the water ramps and the colour grades in
      // this file are built with.  A smooth wash would read as blur, which is
      // the one thing the play field never does.
      const g = Math.max(0, (cv - 0.52) / 1.55) * 2.4 * fade;
      const gi = Math.floor(g), lv = Math.min(2, (g - gi) > bay(px, y) ? gi + 1 : gi);
      let a = [0, 0.26, 0.50][lv < 0 ? 0 : lv];
      if (y < 22 && hash2(px, y + seed * 97) > 0.972) a = 0.72 * fade;           // crest glitter
      else if (dep > 0.55 && (px & 3) === 0 && (y & 3) === 0 && hash2(px >> 2, (y >> 2) + seed * 31) > 0.980) a = 0.28;
      a = qa(a);
      if (a <= 0.02) continue;
      const q = (y * LW + px) * 4;
      d[q] = 226; d[q + 1] = 250; d[q + 2] = 255; d[q + 3] = R(a * 255);
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

// ============================================================ COLOUR GRADE ==
// A baked, posterised, dithered wash.  `stops` are [yFraction, hex, alpha]
// read top to bottom; the vertical position is quantised into hard bands and
// bayer-dithered at the seams, and the alpha is quantised to 1/16ths, so the
// result stays pixel art rather than a canvas gradient.  Built once, blitted.
function buildGrade(stops, bands) {
  bands = bands || 22;
  const c = can(640, 360), x = cx2(c), img = x.createImageData(640, 360), d = img.data;
  const cols = stops.map(s => hexToRgb(s[1]));
  for (let y = 0; y < 360; y++) {
    const f = y / 359 * bands;
    const i0 = Math.floor(f), fr = f - i0;
    for (let px = 0; px < 640; px++) {
      const b = clamp((fr > bay(px, y) ? i0 + 1 : i0) / bands, 0, 1);
      // locate the segment this banded position falls in
      let s = 0;
      while (s < stops.length - 2 && b > stops[s + 1][0]) s++;
      const a0 = stops[s], a1 = stops[s + 1];
      const span = Math.max(1e-6, a1[0] - a0[0]);
      const k = clamp((b - a0[0]) / span, 0, 1);
      const c0 = cols[s], c1 = cols[s + 1];
      const r = a0[2] + (a1[2] - a0[2]) * k;
      if (r <= 0.002) continue;
      const aq = r * 16, ai = Math.floor(aq), af = aq - ai;
      const A = clamp((af > bay(px + 2, y + 1) ? ai + 1 : ai) / 16, 0, 1);
      if (A <= 0) continue;
      const p = (y * 640 + px) * 4;
      d[p] = R(c0[0] + (c1[0] - c0[0]) * k);
      d[p + 1] = R(c0[1] + (c1[1] - c0[1]) * k);
      d[p + 2] = R(c0[2] + (c1[2] - c0[2]) * k);
      d[p + 3] = R(A * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
// Each entry: [scenery grade (under the actors), light grade (over everything)]
// plus the colour of the sun shafts and the caustics for that beat.
const GRADE = {}, GLOW = {};
const GRADE_SPEC = {
  // warm sunlit lagoon: gold light pouring in on top, cool green-blue floor
  lagoon: {
    bg: [[0, '#ffe58e', 0.34], [0.18, '#ffcf72', 0.13], [0.46, '#4fd8a8', 0.03], [0.72, '#2f9e7e', 0.08], [1, '#ffc055', 0.20]],
    fg: [[0, '#ffe7a4', 0.20], [0.30, '#ffd27e', 0.09], [0.66, '#7fe0c0', 0.02], [1, '#0e5468', 0.10]],
    shaft: 'warm', caustic: '#ffeaa8', bedCaustic: '#ffe09a', mote: '#ffeec2',
  },
  // the boat: the warmth drains out, steel and cyan
  cold: {
    bg: [[0, '#cfeaff', 0.20], [0.26, '#8fc4e4', 0.11], [0.56, '#2f6f94', 0.10], [1, '#07243c', 0.32]],
    fg: [[0, '#dff1ff', 0.14], [0.34, '#9fcde8', 0.05], [1, '#062036', 0.14]],
    shaft: 'cold', caustic: '#d8f2ff', bedCaustic: '#bfe4ff', mote: '#cfe8f8',
  },
  // the harpooning: bruised, red at the edges, black below
  bruise: {
    bg: [[0, '#ffb07a', 0.26], [0.16, '#e07a5e', 0.14], [0.40, '#6a4258', 0.10], [0.72, '#5a1c2c', 0.22], [1, '#1a0508', 0.44]],
    fg: [[0, '#ff9e6e', 0.16], [0.26, '#b05a52', 0.09], [0.62, '#4a1c2a', 0.10], [1, '#14060a', 0.26]],
    shaft: 'red', caustic: '#ffb59a', bedCaustic: '#c9645c', mote: '#e8a89a',
  },
  // running into the dark
  night: {
    bg: [[0, '#5e9ad0', 0.20], [0.24, '#25548c', 0.14], [0.62, '#132a5a', 0.20], [1, '#050a20', 0.44]],
    fg: [[0, '#6ea6da', 0.14], [0.40, '#18305c', 0.12], [1, '#04081c', 0.28]],
    shaft: 'cold', caustic: '#8fc0e0', bedCaustic: '#5d86a8', mote: '#9cc4e0',
  },
  // the yacht: glossy chrome, money-blue, a hard white skim on the surface
  money: {
    bg: [[0, '#eafaff', 0.26], [0.14, '#8fd8f4', 0.16], [0.38, '#1a6d9e', 0.10], [0.72, '#0a2f52', 0.24], [1, '#030f22', 0.42]],
    fg: [[0, '#f2ffff', 0.18], [0.20, '#9ee2f8', 0.07], [0.60, '#0d3459', 0.10], [1, '#03101f', 0.24]],
    shaft: 'cold', caustic: '#dffaff', bedCaustic: '#7fb6d8', mote: '#cfeeff',
  },
  // out, and into open sun
  dawn: {
    bg: [[0, '#fff0b4', 0.34], [0.18, '#ffe08a', 0.17], [0.44, '#9fe8ec', 0.07], [0.74, '#2f9fc8', 0.10], [1, '#0b3358', 0.26]],
    fg: [[0, '#fff4c8', 0.18], [0.30, '#a8ecef', 0.06], [1, '#0c3a60', 0.12]],
    shaft: 'warm', caustic: '#fff0c0', bedCaustic: '#ffe4a8', mote: '#e8fbff',
  },
};

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
    P(x, IP.ink, rx, ry, s + 1, s + 1); P(x, IP.rockWarm[3], rx, ry, s, s);
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
  for (let i = 0; i < 11; i++) drawRockForm(x, R(rng.range(0, LW)), H - R(rng.range(0, 7)), R(rng.range(20, 52)), R(rng.range(12, 30)), IP.rockWarm, false);
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
//  Nobody in this cinematic is drawn here any more.  Every manatee in the
//  opening IS the cast's own side-on manatee — CH.side out of src/chars.js,
//  the same sprite set src/death.js and src/scenes.js compose — so when she
//  is rebuilt the whole opening moves with her.
//
//  The family are variations ON her, not four different animals: the same
//  raster, reduced to each body's length on the cast's own most-opaque-wins
//  filter, re-inked round the silhouette with her own outline, and put
//  through a hide shift that leaves the ink, the eye, the algae, the bone
//  and the blood exactly where she left them.
//
//  One grid.  The cast's side-on art is one art pixel per world unit, which
//  is what every baked layer in this file already is, and the game's 2x
//  presentation turns that into a square 2x2 block of screen pixels.
//  Nothing here is drawn at a fractional scale.
// Each family member is her hide put through a multiply and a lift.  Small
// numbers: they are her mother, her father and her brother.
const MAN_SHIFT = {
  you: null,                                        // the hero: the cast, as built
  dad: { m: [0.80, 0.81, 0.86], a: [2, 1, 6] },     // older, heavier, colder
  mom: { m: [1.00, 0.97, 0.95], a: [6, 3, 1] },     // a shade warmer
  bro: { m: [1.04, 1.05, 1.09], a: [5, 6, 10] },    // young: paler and bluer
};

// ---- one reduction, the cast's own ----------------------------------------
// The most opaque sample in each source block wins, so nothing thin falls out
// of a smaller body.  Same filter chars.js bakes CH.manatee with and
// src/scenes.js reduces the side set with.
function shrinkSpr(s, k) {
  const SW = s.c.width, SH = s.c.height;
  const W = Math.max(1, R(SW * k)), H = Math.max(1, R(SH * k));
  const src = cx2(can(SW, SH));
  src.drawImage(s.c, 0, 0, SW, SH, 0, 0, SW, SH);        // 8-arg: no hi-res bridge
  if (W === SW && H === SH) return spr(src.canvas, s.ax, s.ay);
  const d = src.getImageData(0, 0, SW, SH).data;
  const c = can(W, H), x = cx2(c), img = x.createImageData(W, H), o = img.data;
  const bw = SW / W, bh = SH / H;
  for (let y = 0; y < H; y++) for (let px = 0; px < W; px++) {
    let best = -1, bi = 0;
    const x0 = Math.floor(px * bw), x1 = Math.max(x0 + 1, Math.ceil((px + 1) * bw));
    const y0 = Math.floor(y * bh), y1 = Math.max(y0 + 1, Math.ceil((y + 1) * bh));
    for (let sy = y0; sy < y1 && sy < SH; sy++) for (let sx = x0; sx < x1 && sx < SW; sx++) {
      const q = (sy * SW + sx) * 4;
      if (d[q + 3] > best) { best = d[q + 3]; bi = q; }
    }
    const q = (y * W + px) * 4;
    o[q] = d[bi]; o[q + 1] = d[bi + 1]; o[q + 2] = d[bi + 2]; o[q + 3] = d[bi + 3];
  }
  x.putImageData(img, 0, 0);
  return spr(c, s.ax * k, s.ay * k);
}
// Re-ink the outermost opaque pixel all the way round.  A reduced body
// otherwise keeps a chewed edge where the filter dropped an outline pixel,
// and a manatee with no line round her is the one thing the play field never
// is.  Same pass src/scenes.js puts back after it darkens a part.  Her bone
// whites -- the barnacles and the whiskers standing off her snout -- are let
// through, because they are meant to sit outside the line.
function inkEdge(c, col) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  const C = hexToRgb(col);
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
    const i = y * w + px;
    if (!op[i]) continue;
    if (px > 0 && op[i - 1] && px < w - 1 && op[i + 1] && y > 0 && op[i - w] && y < h - 1 && op[i + w]) continue;
    const q = i * 4;
    if (d[q] > 200 && d[q + 1] > 190 && d[q + 2] > 165) continue;
    d[q] = C[0]; d[q + 1] = C[1]; d[q + 2] = C[2]; d[q + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
// Read the cast's own outline colour off her raster instead of naming it
// here: shadeBlob paints every silhouette pixel with it, so the first opaque
// pixel down any column of her body IS the ink.
let CAST_INK = null;
function castInk() {
  if (CAST_INK) return CAST_INK;
  CAST_INK = IP.ink;
  const b = CH && CH.side && CH.side.body;
  if (!b) return CAST_INK;
  const W = b.c.width, H = b.c.height, x = cx2(can(W, H));
  x.drawImage(b.c, 0, 0, W, H, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, mid = W >> 1;
  for (let y = 0; y < H; y++) {
    const q = (y * W + mid) * 4;
    if (d[q + 3] > 200) { CAST_INK = 'rgb(' + d[q] + ',' + d[q + 1] + ',' + d[q + 2] + ')'; break; }
  }
  return CAST_INK;
}
// The hide shift.  Every distinct colour on her goes through it EXCEPT the
// ink (which holds the silhouette), the greens (algae), the reds (what the
// propeller did) and the near-whites (barnacle, whisker, eye shine) — those
// are hers and read the same on all four of them.
function shiftHide(c, sh, inkRGB) {
  if (!sh) return c;
  const x = cx2(c), W = c.width, H = c.height;
  const img = x.getImageData(0, 0, W, H), d = img.data;
  const M = sh.m, A = sh.a;
  for (let i = 0, n = W * H; i < n; i++) {
    const q = i * 4;
    if (d[q + 3] < 8) continue;
    const r = d[q], g = d[q + 1], b = d[q + 2];
    if (r === inkRGB[0] && g === inkRGB[1] && b === inkRGB[2]) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 30) continue;                       // algae, blood: hers
    if (mn > 210) continue;                           // bone, shine: hers
    d[q] = Math.min(255, (r * M[0] + A[0]) | 0);
    d[q + 1] = Math.min(255, (g * M[1] + A[1]) | 0);
    d[q + 2] = Math.min(255, (b * M[2] + A[2]) | 0);
  }
  x.putImageData(img, 0, 0);
  return c;
}
// The one hide tone her face needs, read back off the finished body: the
// darkest grey on her that is not the ink, which is what chars.js draws her
// brows and her shut lids with.
function hideTones(c, inkRGB) {
  const W = c.width, H = c.height, x = cx2(can(W, H));
  x.drawImage(c, 0, 0, W, H, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  let dk = null, dkL = 1e9;
  for (let i = 0, n = W * H; i < n; i++) {
    const q = i * 4;
    if (d[q + 3] < 200) continue;
    const r = d[q], g = d[q + 1], b = d[q + 2];
    if (r === inkRGB[0] && g === inkRGB[1] && b === inkRGB[2]) continue;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 30) continue;
    const L = r + g + b;
    if (L < dkL) { dkL = L; dk = [r, g, b]; }
  }
  return [dk ? 'rgb(' + dk[0] + ',' + dk[1] + ',' + dk[2] + ')' : '#332f39'];
}
// ---- one family member -----------------------------------------------------
function buildManatee(len, who) {
  const S = CH.side;
  const k = len / S.len;
  const ink = castInk(), inkRGB = hexToRgb(ink), sh = MAN_SHIFT[who] || null;
  // At her own length nothing is resampled, so nothing needs re-inking and
  // she comes out of here pixel for pixel the sprite the cast handed over.
  const part = (s) => {
    const r = shrinkSpr(s, k);
    shiftHide(r.c, sh, inkRGB);
    if (k < 0.999) inkEdge(r.c, ink);
    return r;
  };
  const body = part(S.body);
  const tones = hideTones(body.c, inkRGB);
  return {
    L: len, k: k, who: who, ink: ink, dark: tones[0],
    // the eye box: three art pixels of pupil on the adults, one on the calf,
    // so the face reads at every distance without ever going soft
    ek: len > 74 ? 3 : len > 48 ? 2 : 1,
    body: body, bodyScar: part(S.bodyScar),
    fluke: part(S.fluke), flip: part(S.flip), flipFar: part(S.flipFar),
    eye: [S.eye[0] * k, S.eye[1] * k], mouth: [S.mouth[0] * k, S.mouth[1] * k],
    tailX: S.tailX * k, shoX: S.shoX * k, shoY: S.shoY * k,
  };
}
// ---- her face, live, at the member's own anchors ---------------------------
// The cast paints this in chars.js (CH.sideFace) at one size only; this is the
// same recipe — same boxes, same order, her ink and her hide tones — opened
// out so a calf can carry it too.
function manateeFace(ctx, M, exp, blink, t) {
  const e = M.ek, ex = R(M.eye[0]), ey = R(M.eye[1]);
  const mx = R(M.mouth[0]), my = R(M.mouth[1]);
  const O = M.ink, mw = Math.max(3, R(6 * M.k)), mh = Math.max(1, R(M.k));
  const shut = blink && exp !== 'dead' && exp !== 'wide';
  if (exp === 'pain' || shut) {
    P(ctx, O, ex - 1, ey, e + 2, mh); P(ctx, M.dark, ex - 1, ey - 2, e + 2, mh);
  } else if (exp === 'dead') {
    P(ctx, O, ex - 1, ey - 1, e + 2, e + 2); P(ctx, '#5c5668', ex, ey, e, e);
  } else {
    const big = exp === 'wide' ? 1 : 0;
    P(ctx, O, ex - 1 - big, ey - 1 - big, e + 2 + big * 2, e + 2 + big * 2);
    P(ctx, '#241a12', ex - big, ey - big, e + big * 2, e + big * 2);
    P(ctx, '#ffffff', ex + (e > 1 ? 1 : 0), ey, 1, 1);
    if (exp === 'angry') { P(ctx, M.dark, ex - 2, ey - 2, e + 3, mh); P(ctx, M.dark, ex + 1, ey - 3, e + 1, mh); }
    else if (exp === 'sad') { P(ctx, M.dark, ex - 3, ey - 3, e + 2, mh); }
  }
  const open = exp === 'wide' || exp === 'pain' || (exp === 'talk' && (Math.floor(t * 7) & 1));
  if (open) { P(ctx, O, mx - 2, my - 1, mw, mh * 3 + 1); P(ctx, '#2a1218', mx - 1, my, mw - 2, mh * 2); }
  else P(ctx, O, mx - 2, my, mw, mh);
}
// ---- draw a manatee actor --------------------------------------------------
// Composed in chars.js's own order, at chars.js's own offsets, scaled to the
// member: far flipper, fluke, body, near flipper, face.
function drawManatee(ctx, m, t) {
  const M = m.set; if (!M) return;
  const k = M.k;
  ctx.save();
  ctx.translate(R(m.x), R(m.y));
  ctx.rotate(m.rot || 0);
  const fx = m.flip ? -1 : 1;
  ctx.scale(fx * (m.sx || 1), m.sy || 1);
  const ph = m.phase || 0;
  const amp = m.tailAmp === undefined ? 0.26 : m.tailAmp;
  const fa = (m.flipperA === undefined ? 2.15 : m.flipperA) + Math.sin(ph + 0.9) * 0.24;
  ctx.save(); ctx.translate(M.shoX - 5 * k, M.shoY - 4 * k); ctx.rotate(fa - 0.22);
  ctx.drawImage(M.flipFar.c, -M.flipFar.ax, -M.flipFar.ay); ctx.restore();
  ctx.save(); ctx.translate(M.tailX, 0); ctx.rotate(Math.sin(ph) * amp);
  const fl = M.fluke; ctx.drawImage(fl.c, -fl.ax, -fl.ay); ctx.restore();
  const b = m.scarred ? M.bodyScar : M.body;
  ctx.drawImage(b.c, -b.ax, -b.ay);
  if (m.flash > 0) {
    ctx.save(); ctx.globalAlpha = qa(m.flash); ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(b.c, -b.ax, -b.ay);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-b.ax, -b.ay, b.w, b.h);
    ctx.restore();
  }
  ctx.save(); ctx.translate(M.shoX, M.shoY); ctx.rotate(fa);
  ctx.drawImage(M.flip.c, -M.flip.ax, -M.flip.ay); ctx.restore();
  manateeFace(ctx, M, m.exp || 'calm', m.blink, t);
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

// ============================================================ ASSET STORE ==
const WATER = {}, LAY = {}, MAN = {};
let BIZ = null, CR = null, BOAT = null, YAC = null, HARP = null;
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
  // the whole cast comes out of chars.js now, so nothing is baked until it is
  // there; Intro.reset() comes back through here once buildCharacters() has run
  if (typeof CH === 'undefined' || !CH.side || !CH.otterStandHi || !CH.headWithFace) return;
  WATER.shallow = buildWater(IP.shallow, 640, 360, { pow: 1.05 });
  WATER.open = buildWater(IP.open, 640, 360, { pow: 1.0 });
  WATER.deep = buildWater(IP.deep, 640, 360, { pow: 0.9 });
  WATER.night = buildWater(IP.night, 640, 360, { pow: 0.85 });
  WATER.lagoon = buildWater(IP.lagoon, 640, 360, { pow: 1.15, wob: 0.85 });
  WATER.cold = buildWater(IP.cold, 640, 360, { pow: 1.0 });
  WATER.bruise = buildWater(IP.bruise, 640, 360, { pow: 1.15, wob: 0.9 });
  WATER.money = buildWater(IP.money, 640, 360, { pow: 0.95 });
  WATER.dawn = buildWater(IP.dawn, 640, 360, { pow: 1.05, wob: 0.8 });
  for (const k in GRADE_SPEC) { GRADE[k] = buildGrade(GRADE_SPEC[k].bg); GLOW[k] = buildGrade(GRADE_SPEC[k].fg, 16); }
  for (const k in SKYMODE) skyCan(k);      // every sky baked up front, never mid-cinematic
  LAY.deckLight = buildGrade([[0, '#eafaff', 0.10], [0.36, '#ffe6a0', 0.04], [0.54, '#123a6c', 0.26], [0.60, '#ffd68a', 0.06], [0.82, '#ffb85e', 0.14], [1, '#ff8e3a', 0.26]], 26);
  LAY.caust = [buildCaustNet(0, 0), buildCaustNet(1, 2.09), buildCaustNet(2, 4.19)];
  LAY.shafts = buildShafts(LW, 300, '#d4f8ff');
  LAY.shaftsWarm = buildShafts(LW, 300, '#ffe2a0');
  LAY.shaftsRed = buildShafts(LW, 300, '#ff9a72');
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
  // the family, off the cast's own side-on body: her father at her full
  // length, her mother six sevenths of it, and the two calves at four
  // sevenths and a clean half.  Same animal, four ages.
  MAN.dad = buildManatee(98, 'dad');
  MAN.mom = buildManatee(84, 'mom');
  MAN.you = buildManatee(56, 'you');
  MAN.bro = buildManatee(49, 'bro');
  MAN.youBig = buildManatee(98, 'you');
  MAN.broBig = buildManatee(56, 'bro');
  capOtter();
  BIZ = buildBiz();
  CR = buildCrane();
  BOAT = buildFishingBoat();
  YAC = buildYacht();
  HARP = buildHarpoon();
  holdArt();            // bake the hold and the catch now, not mid-cinematic
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
  catchSpray(x, y, n, pw) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0.4), sp = rand(60, 320) * (pw || 1);
      this.add({ k: 'sh', x: x + rand(-40, 40), y: y + rand(-14, 14), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rand(0, TAU), vr: rand(-9, 9), life: rand(0.8, 2.0), s: randi(0, CATCH.all.length - 1) });
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
        case 'sh': p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 330 * dt; p.vx *= 1 - dt * 0.5; p.r += p.vr * dt; break;
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
        case 'sh': { const sp = CATCH.all && CATCH.all[p.s]; if (!sp) break; ctx.save(); ctx.translate(R(p.x), R(p.y)); ctx.rotate(p.r); ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.restore(); break; }
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
  const G = GRADE_SPEC[o.grade] || null;
  ctx.drawImage(WATER[o.mood] || WATER.open, 0, 0);
  if (o.shafts) {
    const sh = !G || G.shaft === 'cold' ? LAY.shafts : G.shaft === 'red' ? LAY.shaftsRed : LAY.shaftsWarm;
    ctx.save(); ctx.globalAlpha = qa(o.shafts); tile(ctx, sh, s * 0.16, (o.surfY === undefined || o.surfY === null ? -40 : o.surfY)); ctx.restore();
  }
  // the lit water itself: the ocean's own caustics, boiling and drifting
  const ca = o.caust === undefined ? 0.62 : o.caust;
  if (ca > 0 && LAY.caust) {
    const top = (o.surfY === undefined || o.surfY === null ? -34 : o.surfY) - 6;
    tile(ctx, LAY.caust[Math.floor(t * 6) % 3], s * 0.22 + t * 7, top, ca);
  }
  const set = o.set === 'D' ? 'D' : 'S';
  if (o.bedY !== undefined && o.bedY !== null) {
    tile(ctx, LAY['far' + set], s * 0.26, o.bedY - LAY['far' + set].height + 6);
    tile(ctx, LAY.grassFar, s * 0.40, o.bedY - LAY.grassFar.height + 10);
    tile(ctx, LAY['mid' + set], s * 0.58, o.bedY - LAY['mid' + set].height + 4);
    tile(ctx, LAY.bed, s * 0.78, o.bedY);
    if (o.causticBed) caustics(ctx, o.bedY + 4, t, 4, 0.20, G ? G.bedCaustic : '#ffeec0');
  }
  if (o.surfY !== undefined && o.surfY !== null) {
    tile(ctx, set === 'D' ? LAY.surfD : LAY.surfS, s * 0.34, o.surfY - 6);
    caustics(ctx, o.surfY + 14, t, 5, 0.22, G ? G.caustic : undefined);
  }
  // one baked, dithered wash gives the whole beat its hour of the day
  if (GRADE[o.grade]) ctx.drawImage(GRADE[o.grade], 0, 0);
  if (o.fog) { ctx.fillStyle = rgbaq(o.fog[0], o.fog[1]); ctx.fillRect(0, 0, 640, 360); }
  motes(ctx, s, t, 60, G ? G.mote : '#bcdfe8', 0.26);
}
function foreground(ctx, o) {
  const s = o.scroll || 0, t = o.t || 0;
  const set = o.set === 'D' ? 'D' : 'S';
  const G = GRADE_SPEC[o.grade] || null;
  if (o.bedY !== undefined && o.bedY !== null) {
    tile(ctx, LAY['near' + set], s * 1.35, o.bedY - LAY['near' + set].height + 34);
    tile(ctx, LAY.grassNear, s * 1.7, o.bedY - 6);
  }
  // the coloured light itself, laid over the actors so they sit in the scene
  if (GLOW[o.grade]) ctx.drawImage(GLOW[o.grade], 0, 0);
  motes(ctx, s * 2, t, 26, G ? G.mote : '#e6f6ff', 0.36);
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
function buildSky(cols, cloudPal) {
  cols = cols || IP.sky; cloudPal = cloudPal || ['#f6f8ee', '#ffffff', '#cfd6d0'];
  const H = 96, c = can(LW, H), x = cx2(c);
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
      P(x, cloudPal[0], cxx + ox, cyy + oy, R(w * rng.range(0.3, 0.6)), h);
      P(x, cloudPal[1], cxx + ox, cyy + oy, R(w * rng.range(0.2, 0.4)), Math.max(1, h >> 1));
      P(x, cloudPal[2], cxx + ox, cyy + oy + h - 1, R(w * rng.range(0.25, 0.5)), 1);
    }
  }
  for (let i = 0; i < 7; i++) {
    const gx = R(rng.range(0, LW)), gy = R(rng.range(8, 44));
    P(x, '#20303c', gx, gy, 3, 1); P(x, '#20303c', gx + 2, gy - 1, 2, 1); P(x, '#20303c', gx + 4, gy, 3, 1);
  }
  return c;
}
// Each sky is its own hour: ramp, cloud palette, far-sea bands, whitecap and
// the colour of the waterline.  All four are baked once into LAY.
const SKYMODE = {
  day:    { zenith: '#1b4f86', key: 'sky',       sea: ['#2a6f9c', '#1d5580'], glint: '#bcdcec', chop: '#2d6f86', cap: '#eaf8ff', line: '#0d2a33', lip: '#cfeaf2' },
  gold:   { zenith: '#15487e', key: 'skyGold',   sea: ['#2f6f92', '#1f5070'], glint: '#ffe3a2', chop: '#2b6478', cap: '#fff0c4', line: '#241a22', lip: '#ffdfa0' },
  dusk:   { zenith: '#140d34', key: 'skyDusk',   sea: ['#4a3a58', '#33243c'], glint: '#ff9e63', chop: '#402a38', cap: '#ffb782', line: '#1a0a10', lip: '#ff9d6a' },
  chrome: { zenith: '#0b3f78', key: 'skyChrome', sea: ['#1f6a9e', '#134a78'], glint: '#f2fbff', chop: '#1b567a', cap: '#ffffff', line: '#061826', lip: '#dff6ff' },
  dawnsky:{ zenith: '#0c4a80', key: 'skyDawn',   sea: ['#2b7fae', '#1b5e8c'], glint: '#ffeaae', chop: '#256f92', cap: '#fffbe6', line: '#0a2436', lip: '#ffeec0' },
};
const SKY_RAMP = {
  sky: [IP.sky, ['#f6f8ee', '#ffffff', '#cfd6d0']],
  skyGold: [['#2c68a8', '#4a92c4', '#7fbad4', '#bcd3c6', '#f2d89a', '#ffc472'], ['#ffdfa8', '#fff3d2', '#c98f6a']],
  skyDusk: [['#241f4e', '#47305f', '#7c3f63', '#bb565a', '#ec8340', '#ffbb6e'], ['#7a3f5c', '#d06a52', '#341c38']],
  skyChrome: [['#175c9c', '#3486bf', '#68abd4', '#a2d0e8', '#daf0f8', '#ffffff'], ['#ffffff', '#ffffff', '#b6cddc']],
  skyDawn: [['#1d6ca8', '#3f9ac4', '#7ac8da', '#b2e5e6', '#ffe9b0', '#ffd07a'], ['#fff2cc', '#ffffff', '#c9a06e']],
};
function buildSkyTop(zenith, horizon) {
  const c = can(640, 240), x = cx2(c), A = hexToRgb(zenith), B = hexToRgb(horizon);
  const bands = 9;
  for (let y = 0; y < 240; y++) {
    const f = y / 239 * bands, i0 = Math.floor(f), fr = f - i0;
    for (let px = 0; px < 640; px++) {
      const k = clamp((fr > bay(px, y) ? i0 + 1 : i0) / bands, 0, 1);
      P(x, 'rgb(' + R(A[0] + (B[0] - A[0]) * k) + ',' + R(A[1] + (B[1] - A[1]) * k) + ',' + R(A[2] + (B[2] - A[2]) * k) + ')', px, y);
    }
  }
  return c;
}
function skyCan(mode) {
  const m = SKYMODE[mode] || SKYMODE.day;
  if (!LAY[m.key]) {
    LAY[m.key] = buildSky(SKY_RAMP[m.key][0], SKY_RAMP[m.key][1]);
    LAY[m.key + 'Top'] = buildSkyTop(m.zenith, SKY_RAMP[m.key][0][0]);
  }
  return LAY[m.key];
}
function drawAir(ctx, surfY, scroll, t, mode) {
  const m = SKYMODE[mode] || SKYMODE.day;
  const sc = skyCan(mode);
  const sy = R(surfY);
  if (sy <= 0) return;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 640, sy); ctx.clip();
  const topY = sy - sc.height - 10;
  P(ctx, m.zenith, 0, 0, 640, Math.max(0, topY - 240));
  ctx.drawImage(LAY[m.key + 'Top'], 0, R(topY - 240));
  tile(ctx, sc, scroll * 0.10, topY);
  // far sea, sitting on the horizon
  const hz = sy - 12;
  for (let x = 0; x < 640; x += 2) {
    const w2 = Math.sin(x * 0.035 + t * 0.4) * 1.4;
    P(ctx, m.sea[0], x, hz + R(w2), 2, 12);
    P(ctx, m.sea[1], x, hz + 4 + R(w2), 2, 8);
    if (hash2(x, 17) > 0.90) P(ctx, m.glint, x, hz + 1 + R(w2), 3, 1);
  }
  // chop + whitecaps at the waterline
  for (let x = 0; x < 640; x += 2) {
    const w = Math.sin(x * 0.07 + t * 2.2) * 2 + Math.sin(x * 0.021 - t * 1.3) * 1.6;
    const yy = sy - 3 + R(w);
    P(ctx, m.chop, x, yy, 2, sy - yy);
    if (hash2(x, Math.floor(t * 3)) > 0.86) P(ctx, m.cap, x, yy - 1, 2, 2);
  }
  ctx.restore();
  P(ctx, m.line, 0, sy - 1, 640, 1);
  for (let x = 0; x < 640; x += 3) if (hash2(x, Math.floor(t * 5)) > 0.7) P(ctx, m.lip, x, sy + R(Math.sin(x * 0.07 + t * 2.2) * 2), 3, 1);
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
    backdrop(ctx, { mood: 'lagoon', grade: 'lagoon', scroll: Intro.scroll, t: Intro.t, surfY: 34, bedY: 296, set: 'S', shafts: 1, causticBed: true });
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    drawSchool(ctx, SC.sch3, Intro.t, Intro.dt);
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.dad, Intro.t);
    drawSchool(ctx, SC.sch2, Intro.t, Intro.dt);
    drawManatee(ctx, A.you, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'lagoon', scroll: Intro.scroll, t: Intro.t, bedY: 296, set: 'S' });
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
    backdrop(ctx, { mood: 'cold', grade: 'cold', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 336, set: 'S', shafts: 0.85, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'gold');
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
    foreground(ctx, { grade: 'cold', scroll: Intro.scroll, t: Intro.t, bedY: 336, set: 'S' });
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
    backdrop(ctx, { mood: 'cold', grade: 'cold', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 340, set: 'S', shafts: 0.8 });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'gold');
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
    foreground(ctx, { grade: 'cold', scroll: Intro.scroll, t: Intro.t, bedY: 340, set: 'S' });
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
    backdrop(ctx, { mood: 'cold', grade: 'cold', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 344, set: 'S', shafts: 0.8 });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'gold');
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
    foreground(ctx, { grade: 'cold', scroll: Intro.scroll, t: Intro.t, bedY: 344, set: 'S' });
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
    backdrop(ctx, { mood: 'bruise', grade: 'bruise', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 348, set: 'S', shafts: 0.7, fog: ['#2a0c14', 0.14] });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'dusk');
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
    foreground(ctx, { grade: 'bruise', scroll: Intro.scroll, t: Intro.t, bedY: 348, set: 'S' });
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
    backdrop(ctx, { mood: bt > 2.6 ? 'night' : 'deep', grade: 'night', scroll: Intro.scroll, t: Intro.t, surfY: 30 - dk * 60, bedY: 350, set: 'D', shafts: 0.5 * (1 - dk), fog: ['#04122e', dk * 0.28] });
    // the boat shrinking behind
    ctx.save(); ctx.translate(R(SC.boatX), 44 + bt * 4); ctx.scale(SC.boatS, SC.boatS); ctx.globalAlpha = qa(0.9 - dk * 0.75);
    ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay); ctx.restore();
    drawManatee(ctx, A.bro, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    speedLines(ctx, A.you.x - 74, A.you.y, 14, 54, -1, 'rgba(190,225,245,0.34)', 7);
    speedLines(ctx, A.bro.x - 58, A.bro.y, 11, 42, -1, 'rgba(190,225,245,0.26)', 13);
    FX.render(ctx);
    foreground(ctx, { grade: 'night', scroll: Intro.scroll, t: Intro.t, bedY: 350, set: 'D' });
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
    backdrop(ctx, { mood: 'money', grade: 'money', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 352, set: 'D', shafts: 0.45 });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'chrome');
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
    foreground(ctx, { grade: 'money', scroll: Intro.scroll, t: Intro.t, bedY: 352, set: 'D' });
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
    backdrop(ctx, { mood: 'money', grade: 'money', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 354, set: 'D', shafts: 0.45 });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'chrome');
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
    foreground(ctx, { grade: 'money', scroll: Intro.scroll, t: Intro.t, bedY: 354, set: 'D' });
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
      backdrop(ctx, { mood: 'money', grade: 'money', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY > 0 ? SC.surfY : null, bedY: 356, set: 'D', shafts: 0.4 });
      if (SC.surfY > 0) drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'chrome');
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
      if (SC.black > 0) aperture(ctx, SC.black);
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
    P(ctx, k < 0.3 ? '#2f86bc' : k < 0.62 ? '#1f679c' : '#154d7c', 0, y, 640, 1);
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
    const base = k < 0.16 ? '#7b5c33' : k < 0.44 ? '#a07a44' : k < 0.74 ? '#bf9456' : '#d8b171';
    P(ctx, ((y % 11) === 0) ? '#54391d' : base, 0, y, 640, 1);
  }
  for (let x = 0; x < 640; x += 61) { P(ctx, '#54391d', x, 208, 1, 152); P(ctx, '#e8c78c', x + 1, 208, 1, 152); }
  for (let i = 0; i < 90; i++) { const gx = R(hash2(i, 5) * 640), gy = 210 + R(hash2(i, 9) * 148); P(ctx, hash2(gx, gy) > 0.5 ? '#7d5c31' : '#e3c28a', gx, gy, 2, 1); }
  for (let i = 0; i < 6; i++) { const gx = 40 + R(hash2(i, 21) * 520); P(ctx, '#3f7f72', gx, 300 + R(hash2(i, 3) * 44), R(20 + hash2(i, 7) * 40), 3); }
  // ---- crates, cooler and winch to port
  P(ctx, IP.ink, 36, 246, 78, 58); P(ctx, '#9a6526', 37, 247, 76, 56); P(ctx, '#e0a03c', 37, 247, 76, 5);
  for (let i = 0; i < 5; i++) P(ctx, '#5c3a1c', 37, 255 + i * 11, 76, 2);
  P(ctx, '#3f3324', 36, 304, 78, 4);
  P(ctx, IP.ink, 132, 262, 58, 42); P(ctx, '#d8dde4', 133, 263, 56, 40); P(ctx, '#9aa6b6', 133, 292, 56, 11);
  P(ctx, '#e8222e', 138, 268, 46, 5); P(ctx, '#3f3324', 132, 304, 58, 4);
  P(ctx, IP.ink, 206, 232, 54, 72); P(ctx, '#4a525e', 207, 233, 52, 70); P(ctx, '#767f8d', 207, 233, 52, 7);
  for (let i = 0; i < 5; i++) P(ctx, '#2a3038', 211 + i * 9, 246, 4, 46);
  P(ctx, '#b8541e', 207, 252, 52, 3); P(ctx, '#e07a2e', 207, 252, 52, 1);
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
  for (let i = 0; i < 5; i++) { ctx.fillStyle = rgbaq('#bff8ff', 0.09); ctx.fillRect(tx + 14 + i * 42, ty + 8, 10, th - 16); }
  P(ctx, '#d8f8ff', tx + 2, ty + 6, 3, th - 18); P(ctx, '#8fd8e8', tx + tw - 5, ty + 6, 3, th - 18);
  P(ctx, IP.ink, tx - 6, ty + th + 6, tw + 12, 8); P(ctx, '#2a3038', tx - 5, ty + th + 6, tw + 10, 7);
  // ---- deck hands watching the catch come aboard
  figure(ctx, 286, 322, 48, { facing: 1, lean: -0.05, armA: 0.25, foreA: 0.45, armB: 0.15, foreB: 0.30, legA: 0.46, legB: -0.44, head: 0.12 }, '#222c3e', '#ffc46a');
  figure(ctx, 338, 324, 45, { facing: 1, lean: 0.08, armA: -0.45, foreA: -0.9, armB: 0.30, foreB: 0.55, legA: -0.42, legB: 0.46, head: 0.18 }, '#4a2230', '#ffb45a');
  if (LAY.deckLight) ctx.drawImage(LAY.deckLight, 0, 0);
  void bt;
}
// ===========================================================================
//  BELOW DECK — the hold, the crate, the catch
// ===========================================================================
const HOLD = {};
// ---- the catch: hand-drawn shrimp, fish and crab bits -----------------------
const CATCH_PAL = {
  k: '#170f07', o: '#0a0704', b: '#0b0b10', W: '#f2f7fa',
  s: '#8a3f33', S: '#b25c44', t: '#d68d68', T: '#f0bc96', u: '#ffe3c6',
  g: '#37424e', G: '#5b6a78', h: '#8b9aa7', H: '#c2d0da', w: '#eef5f8',
  e: '#3d4a2c', E: '#5d7040', f: '#889b60', F: '#bccb92',
  r: '#7d2a20', R: '#ab432c', q: '#d4775a',
  i: '#bcd8e0', I: '#eafaff', y: '#cfc9ad', d: '#6b6450',
};
const CATCH_ART = {
  // shrimp: segmented body, fan tail, antennae, black bead eye
  shrimpStraight: [
    '..kk..............',
    '.kbk.kkkkkkkkkkk..',
    'kTTkkTuTuTuTuTuTk.',
    'kTTTTtStStStStStk.',
    'kTTTtSsSsSsSsSsSTk',
    'kTTTTtStStStStStTk',
    'kTTkkTuTuTuTuTuTTk',
    '.kbk.kkkkkkkkkTTTk',
    '..kk...........kk.',
  ],
  shrimpCurl: [
    '....kkk.....',
    '...kTuTk....',
    '..kTuTtSk...',
    '.kbTuTtSk...',
    '.kkTuTtSk...',
    '...kTuTtSk..',
    '...kTuTtSk..',
    '....kTuTtSk.',
    '....kTuTtSk.',
    '.....kTTtSSk',
    '...kkTTkkkkk',
    '...kTTk.....',
    '...kkk......',
  ],
  shrimpSmall: [
    '..kkk...',
    '.kTuTk..',
    'kbTuTSk.',
    'kkTuTSk.',
    '..kTuTSk',
    '..kTTtSk',
    '..kkTTkk',
    '....kk..',
  ],
  // fish: forked tail left, head and eye right, pale belly
  fishSilver: [
    'kk.......kkkk.....',
    'kHkk...kkHHHHkk...',
    'kHHHk.kHHhhhhhHk..',
    'kHHHHkkHhhGGGGhHk.',
    'kHHHHHHhhGGGGGGhHk',
    'kHHHHkkHhhGGGbGhHk',
    'kHHHk.kHHhhGGGGhhk',
    'kHkk...kkHwwwwwhkk',
    'kk.......kkkkkkkk.',
  ],
  fishSilverSm: [
    'kk....kkk..',
    'kHk.kkHHHkk',
    'kHHkkHhhhHk',
    'kHHHHhGbGhk',
    'kHHkkHhhwhk',
    'kHk.kkHwwkk',
    'kk....kkkk.',
  ],
  fishOlive: [
    'kk......kkk.....',
    'kFkk..kkFFFkk...',
    'kFFFkkFFfffFFk..',
    'kFFFFFFffEEEfFk.',
    'kFFFFFffEEEbEfFk',
    'kFFFFFFffEEEEfFk',
    'kFFFkkFFffEEffk.',
    'kFkk..kkFwwwwfk.',
    'kk......kkkkkkk.',
  ],
  // a big one gone belly up: pale side up, dull clouded eye
  fishDeadBig: [
    'kk........kkkkkkkk......',
    'kwkk....kkwwwwwwwwkk....',
    'kwwwkkkkwwwwwwwwwwwwkk..',
    'kwwwwwwwwwwwwwwwwwwwwwk.',
    'kwwwwwwwwwwwwwwwwwwwwwwk',
    'kwwwwwwwwwwwwwwwyyywwwdk',
    'kwwwwwwwhhhhhhhhyWywhhdk',
    'kwwwkkkkhGGGGGGGyyyGGhdk',
    'kwkk....kGGGGGGGGGGGGgk.',
    'kk........kkGGGGGGGGkk..',
    '............kkkkkkkk....',
  ],
  crabClaw: [
    '..kkk.....',
    '.kqqRk....',
    'kqqRRrk...',
    'kqRRrrkk..',
    'kkRrrk.kk.',
    '.kRrrkkqRk',
    '.kRRrrqqRk',
    '..kRRRRRk.',
    '...kkRRk..',
    '.....kk...',
  ],
  crabShell: [
    '.kk....kk.',
    'kRRkkkkRRk',
    'kRqqqqqqRk',
    'kRqbqqbqRk',
    'kRqqqqqqRk',
    'kRRqqqqRRk',
    '.kRRRRRRk.',
    '..kkkkkk..',
  ],
  fleckA: ['kkk', 'kIk', 'kkk'],
  fleckB: ['kk.', 'kIk', '.kk'],
  fleckC: ['.kk.', 'kIIk', 'kiIk', '.kk.'],
};
const CATCH = { all: [], big: [], fleck: [], small: [] };
function buildCatchSprites() {
  if (CATCH.all.length) return CATCH;
  const mk = rows => makeSprite(rows, { pal: CATCH_PAL });
  const A = CATCH_ART;
  const body = ['shrimpCurl', 'shrimpStraight', 'shrimpSmall', 'fishSilver', 'fishSilverSm', 'fishOlive', 'crabClaw', 'crabShell'];
  CATCH.byName = {};
  for (const k in A) CATCH.byName[k] = mk(A[k]);
  // the mix that makes up the bulk of a heap: plenty of shrimp, fewer fish
  CATCH.all = [
    CATCH.byName.shrimpCurl, CATCH.byName.shrimpCurl, CATCH.byName.shrimpCurl,
    CATCH.byName.shrimpStraight, CATCH.byName.shrimpStraight,
    CATCH.byName.shrimpSmall, CATCH.byName.shrimpSmall, CATCH.byName.shrimpSmall,
    CATCH.byName.fishSilver, CATCH.byName.fishSilverSm, CATCH.byName.fishSilverSm,
    CATCH.byName.fishOlive, CATCH.byName.crabClaw, CATCH.byName.crabShell,
  ];
  CATCH.big = [CATCH.byName.fishDeadBig, CATCH.byName.fishSilver, CATCH.byName.fishOlive];
  CATCH.fleck = [CATCH.byName.fleckA, CATCH.byName.fleckB, CATCH.byName.fleckC];
  CATCH.small = [CATCH.byName.shrimpSmall, CATCH.byName.shrimpCurl, CATCH.byName.fishSilverSm, CATCH.byName.crabClaw];
  void body;
  return CATCH;
}
// ---- the heap --------------------------------------------------------------
// Surfaces are in screen space: the back heap rises behind the manatee, the
// front lip buries him to the shoulders.
function pileBackTop(x) {
  return 190 + 44 * Math.exp(-Math.pow((x - 300) / 215, 2)) + Math.sin(x * 0.047) * 5 + vnoise(x * 0.018, 3.5) * 10;
}
function pileFrontTop(x) {
  return 232 + 32 * Math.exp(-Math.pow((x - 300) / 210, 2))
    + 20 * Math.exp(-Math.pow((x - 322) / 86, 2))
    + Math.sin(x * 0.062 + 1.4) * 4 + vnoise(x * 0.022, 7.5) * 8;
}
function pileThinTop(x) {
  return 318 + 14 * Math.exp(-Math.pow((x - 300) / 230, 2)) + Math.sin(x * 0.05) * 3;
}
function buildPileLayer(topFn, yOff, H, seed, count, opts) {
  opts = opts || {};
  const c = can(640, H), x = cx2(c), rng = new SeededRandom(seed);
  // packed mass under the surface, so the heap reads as deep instead of hollow
  for (let px2 = 0; px2 < 640; px2++) {
    const t0 = R(topFn(px2) - yOff);
    for (let y = Math.max(0, t0 + 2); y < H; y++) {
      const dd = (y - t0) / Math.max(8, H - t0);
      const n = vnoise(px2 * 0.055, y * 0.075);
      P(x, n > 0.60 ? (dd > 0.55 ? '#3a2c1e' : '#55402b') : n > 0.38 ? (dd > 0.55 ? '#2b2016' : '#3f3021') : '#211809', px2, y);
    }
  }
  // the bulk: overlapping sprites, sorted back to front
  const list = [];
  for (let i = 0; i < count; i++) {
    const px2 = rng.range(-10, 650);
    const t0 = topFn(px2) - yOff;
    const d = Math.pow(rng.next(), 0.62) * Math.max(6, H - t0);
    list.push({ x: px2, y: t0 + d - 3, r: rng.range(-3.15, 3.15), f: rng.next() > 0.5, s: rng.int(0, CATCH.all.length - 1) });
  }
  // a handful of big dead fish lying across the heap
  for (let i = 0; i < (opts.big === undefined ? 7 : opts.big); i++) {
    const px2 = rng.range(0, 640), t0 = topFn(px2) - yOff;
    list.push({ x: px2, y: t0 + rng.range(2, 26), r: rng.range(-0.6, 0.6), f: rng.next() > 0.5, big: rng.int(0, CATCH.big.length - 1) });
  }
  list.sort((a, b) => a.y - b.y);
  for (const o of list) {
    const sp = o.big !== undefined ? CATCH.big[o.big] : CATCH.all[o.s];
    x.save(); x.translate(R(o.x), R(o.y)); x.rotate(o.r); if (o.f) x.scale(-1, 1);
    x.drawImage(sp.c, -sp.ax, -sp.ay); x.restore();
  }
  // ice and scale flecks caught in the heap
  for (let i = 0; i < count * 0.22; i++) {
    const px2 = rng.range(0, 640), t0 = topFn(px2) - yOff;
    const sp = CATCH.fleck[rng.int(0, CATCH.fleck.length - 1)];
    x.save(); x.translate(R(px2), R(t0 + Math.pow(rng.next(), 0.5) * Math.max(6, H - t0))); x.rotate(rng.range(0, 3.14));
    x.drawImage(sp.c, -sp.ax, -sp.ay); x.restore();
  }
  // wet sheen along the crest, slime pooling low down, a dark stain at the foot
  for (let px2 = 0; px2 < 640; px2++) {
    const t0 = R(topFn(px2) - yOff);
    for (let y = Math.max(0, t0); y < Math.min(H, t0 + 14); y++) if (hash2(px2 * 3, y * 5) > 0.93) P(x, '#dfeccb', px2, y, 1 + (px2 & 1), 1);
    for (let y = H - 26; y < H; y++) if (hash2(px2, y) > 0.88) P(x, '#2e3a1c', px2, y, 2, 1);
  }
  x.fillStyle = rgbaq('#0d0a06', 0.34); x.fillRect(0, H - 14, 640, 14);
  x.fillStyle = rgbaq('#0d0a06', 0.18); x.fillRect(0, H - 30, 640, 16);
  for (let i = 0; i < 26; i++) {
    const px2 = R(rng.range(0, 640)), t0 = R(topFn(px2) - yOff);
    x.fillStyle = rgbaq('#e8f4d0', 0.16);
    x.fillRect(px2, t0 + R(rng.range(0, 20)), 1, R(rng.range(6, 26)));
  }
  return c;
}
// ---- loose catch that slides, rains in and scatters ------------------------
function looseAdd(list, o) { if (list.length < 340) list.push(o); }
function looseSpawnRain(list, rng) {
  looseAdd(list, {
    x: rand(252, 332), y: 38, vx: rand(-22, 22), vy: rand(70, 170),
    r: rand(0, TAU), vr: rand(-8, 8), s: randi(0, CATCH.all.length - 1),
    f: Math.random() > 0.5, rest: 0, hop: 0,
  });
  void rng;
}
function looseUpdate(list, dt, surfFn, t) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.dead) { list.splice(i, 1); continue; }
    if (p.rest < 1) {
      p.vy += 660 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      const sy = surfFn(p.x);
      if (p.y >= sy && p.vy > 0) {
        p.y = sy;
        p.hop++;
        p.vy = -p.vy * (p.hop > 2 ? 0.10 : 0.30);
        p.vx *= 0.52; p.vr *= 0.45;
        if (Math.abs(p.vy) < 34 || p.hop > 3) { p.rest = 1; p.vy = 0; p.slide = rand(0.6, 1.5); }
      }
      if (p.x < -30 || p.x > 670 || p.y > 400) p.dead = true;
    } else {
      // settle: creep down the slope until it is shallow enough to hold
      const sl = (surfFn(p.x + 5) - surfFn(p.x - 5)) / 10;
      if (p.slide > 0) {
        p.slide -= dt;
        p.x -= sl * 52 * dt;
        p.r += sl * 1.4 * dt;
      }
      p.y = surfFn(p.x);
      if (p.twitch === undefined && Math.random() < 0.12 * dt) p.twitch = 0.22;
      if (p.twitch > 0) { p.twitch -= dt; p.r += Math.sin(t * 40) * 2.2 * dt; if (p.twitch <= 0) p.twitch = undefined; }
    }
  }
  while (list.length > 320) list.shift();
}
function looseRender(ctx, list) {
  for (const p of list) {
    const sp = CATCH.all[p.s]; if (!sp) continue;
    ctx.save(); ctx.translate(R(p.x), R(p.y)); ctx.rotate(p.r); if (p.f) ctx.scale(-1, 1);
    ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.restore();
  }
}
function pileBurst(list, cx0, cy0, n) {
  for (let i = 0; i < n; i++) {
    const px2 = rand(20, 620);
    const py = lerp(pileFrontTop(px2), 356, Math.pow(Math.random(), 0.6));
    const a = angleTo(cx0, cy0, px2, py) + rand(-0.5, 0.5);
    const sp = rand(120, 470) * (1 - Math.min(0.7, dist(cx0, cy0, px2, py) / 620));
    looseAdd(list, {
      x: px2, y: py, vx: Math.cos(a) * sp + rand(40, 180), vy: Math.sin(a) * sp - rand(60, 260),
      r: rand(0, TAU), vr: rand(-13, 13), s: randi(0, CATCH.all.length - 1),
      f: Math.random() > 0.5, rest: 0, hop: 0,
    });
  }
}
function buildHoldBG() {
  const c = can(640, 360), x = cx2(c);
  const W = ['#0e0b08', '#16110c', '#1f1711', '#2b2018', '#3a2c20'];
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
      const u = (px2 - bx) / bw;
      for (let y = 0; y < 360; y++) {
        const n = vnoise(px2 * 0.09, y * 0.02) * 0.6 + 0.2;
        const edge = px2 === bx || px2 === bx + bw - 1;
        const shade = u < 0.12 ? 1 : u > 0.86 ? -1 : 0;
        let col = edge ? '#130d06'
          : shade > 0 ? (n > 0.42 ? '#5a4429' : '#4c3922')
            : shade < 0 ? (n > 0.42 ? '#2a1f13' : '#221a0f')
              : (n > 0.5 ? '#44331f' : n > 0.34 ? '#3a2b1a' : '#312414');
        if ((y % 71) < 2 && !edge) col = '#1b1309';
        P(x, col, px2, y);
      }
      // grain
      for (let y = 0; y < 360; y += 13) if (hash2(px2, y) > 0.86) P(x, '#251b0f', px2, y + R(hash2(px2, 3) * 8), 1, 3);
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
      const u = (px2 - bx) / bw, n = vnoise(px2 * 0.07, y * 0.03) * 0.5 + 0.25;
      P(x, (px2 === bx || px2 === bx + bw - 1) ? IP.ink : u < 0.18 ? '#3a2b1a' : u > 0.8 ? '#150f08' : n > 0.45 ? '#2a1f12' : '#211809', px2, y);
    }
    for (let y = 18; y < 360; y += 64) { P(x, IP.ink, bx + 2, y, bw - 4, 9); P(x, '#4a525e', bx + 3, y + 1, bw - 6, 7); P(x, '#8c97a8', bx + 3, y + 1, bw - 6, 2); }
  }
  // top rail band under the deck beams
  for (let px2 = 0; px2 < 640; px2++) for (let y = 44; y < 62; y++) {
    const n = vnoise(px2 * 0.04, y * 0.1);
    P(x, (y === 44 || y === 61) ? IP.ink : n > 0.55 ? '#46341f' : '#33261650', px2, y);
  }
  for (let px2 = 0; px2 < 640; px2++) for (let y = 45; y < 61; y++) {
    const n = vnoise(px2 * 0.05, y * 0.06) * 0.5 + 0.25;
    P(x, y < 48 ? '#503c24' : y > 57 ? '#241a0e' : (n > 0.45 ? '#3e2e1b' : '#342715'), px2, y);
  }
  P(x, IP.ink, 0, 44, 640, 2); P(x, IP.ink, 0, 60, 640, 2);
  void W;
  return c;
}
function buildLooseBoard() {
  const c = can(36, 360), x = cx2(c);
  for (let px2 = 0; px2 < 33; px2++) {
    const u = px2 / 33;
    for (let y = 0; y < 360; y++) {
      const n = vnoise((px2 + 486) * 0.09, y * 0.02) * 0.6 + 0.2;
      const edge = px2 === 0 || px2 === 32;
      P(x, edge ? '#130d06' : u < 0.12 ? (n > 0.42 ? '#5a4429' : '#4c3922') : u > 0.86 ? (n > 0.42 ? '#2a1f13' : '#221a0f') : (n > 0.5 ? '#44331f' : n > 0.34 ? '#3a2b1a' : '#312414'), px2, y);
    }
  }
  for (const ny of [30, 128, 232, 330]) { P(x, IP.ink, 3, ny, 3, 3); P(x, '#8c97a8', 4, ny + 1, 2, 2); }
  return spr(c, 16, 180);
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
// One baked lighting pass for the hold: a single warm lamp burning a pool out
// of a cold blue-steel dark.  Posterised into hard bands, dithered at the
// seams, blitted once per frame.
function buildHoldLight() {
  const c = can(640, 360), x = cx2(c), img = x.createImageData(640, 360), d = img.data;
  const WARM = ['#fff4d2', '#ffe2a0', '#ffbe63', '#e8853a', '#b4552a'];
  const COLD = ['#5f97cc', '#4478ae', '#2d5c90', '#1b3f70', '#0d2448'];
  const W = WARM.map(hexToRgb), C = COLD.map(hexToRgb);
  const LX = 168, LY = 152, RX = 430, RY = 360;
  for (let y = 0; y < 360; y++) {
    for (let px = 0; px < 640; px++) {
      // distance from the lamp, banded into hard steps and dithered
      const raw = Math.sqrt(Math.pow((px - LX) / RX, 2) + Math.pow((y - LY) / RY, 2));
      const f = clamp(raw, 0, 1.6) * 9;
      const i0 = Math.floor(f), fr = f - i0;
      const band = clamp((fr > bay(px, y) ? i0 + 1 : i0) / 9, 0, 1.6);
      let col, a;
      if (band < 0.62) {                       // inside the lamp's reach
        const k = band / 0.62 * (W.length - 1);
        const j = clamp(Math.floor(k), 0, W.length - 2), kf = k - j;
        const c0 = W[j], c1 = W[j + 1];
        col = [R(c0[0] + (c1[0] - c0[0]) * kf), R(c0[1] + (c1[1] - c0[1]) * kf), R(c0[2] + (c1[2] - c0[2]) * kf)];
        a = 0.40 * Math.pow(1 - band / 0.62, 1.15);
      } else {                                  // the cold dark beyond it
        const k = clamp((band - 0.62) / 0.78, 0, 1) * (C.length - 1);
        const j = clamp(Math.floor(k), 0, C.length - 2), kf = k - j;
        const c0 = C[j], c1 = C[j + 1];
        col = [R(c0[0] + (c1[0] - c0[0]) * kf), R(c0[1] + (c1[1] - c0[1]) * kf), R(c0[2] + (c1[2] - c0[2]) * kf)];
        a = 0.14 + 0.54 * clamp((band - 0.62) / 0.78, 0, 1);
      }
      // the bilge at the bottom stays coldest of all
      if (y > 320) a += (y - 320) / 40 * 0.10;
      const aq = clamp(a, 0, 1) * 16, ai = Math.floor(aq), af = aq - ai;
      const A = clamp((af > bay(px + 1, y + 2) ? ai + 1 : ai) / 16, 0, 1);
      if (A <= 0) continue;
      const q = (y * 640 + px) * 4;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = R(A * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
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
  buildCatchSprites();
  HOLD.shrimp = CATCH.all;
  HOLD.bg = buildHoldBG();
  HOLD.wall = buildCrateWall();
  HOLD.board = buildLooseBoard();
  {  // short broken plank used for flying debris
    const pc = can(34, 104), px3 = cx2(pc);
    px3.drawImage(HOLD.board.c, -1, -90);
    for (let i = 0; i < 6; i++) { const yy = i & 1 ? 0 : 103; P(px3, IP.ink, 4 + i * 5, yy, 4, 2); P(px3, '#8a6a3a', 4 + i * 5, yy === 0 ? 2 : 101, 4, 1); }
    HOLD.plank = spr(pc, 16, 52);
  }
  HOLD.pileBack = buildPileLayer(pileBackTop, 180, 184, 1717, 1150, { big: 9 });
  HOLD.pileFront = buildPileLayer(pileFrontTop, 228, 136, 9292, 760, { big: 6 });
  HOLD.pileThin = buildPileLayer(pileThinTop, 310, 54, 3131, 220, { big: 3 });
  HOLD.bulb = buildBulb();
  HOLD.light = buildHoldLight();
  HOLD.plate = buildBackPlate();
  HOLD.tool = buildTool();
  return HOLD;
}
// ============================================================== SEA  OTTER ==
//  He is the cast's otter too: CH.otterStand on his feet, CH.otterTorso when
//  he is riding her, his own arm, his own tail and his live head, composed at
//  chars.js's own offsets.  Only the fortnight in a fish hold is new.
//
//  chars.js rasterizes him at DETAIL art pixels per world unit and scales
//  those canvases down on the way out; here every part is copied at its own
//  raster size and drawn 1:1, so one of HIS art pixels is one logical unit —
//  exactly like one of hers.  That is the whole point: before this, his head
//  and sleeves came out of the hi-res bridge twice as fine as the hide of the
//  animal he was standing on, and his torso was scaled by 1.7 on top of that.
const CAP = { ready: false };
// his raster, at its own resolution, with the world anchors brought with it
function rawSpr(s) {
  const W = s.c.width, H = s.c.height;
  const c = can(W, H);
  cx2(c).drawImage(s.c, 0, 0, W, H, 0, 0, W, H);       // 8-arg: no hi-res bridge
  const k = W / Math.max(1, R(s.w));
  return { c: c, w: W, h: H, ax: s.ax * k, ay: s.ay * k, k: k };
}
// salt, grime and a bleached patch or two, in his own art pixels
function grimeSpr(sp, seed) {
  const x = cx2(sp.c), W = sp.c.width, H = sp.c.height;
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let px = 0; px < W; px++) {
    const i = (y * W + px) * 4;
    if (d[i + 3] < 40) continue;
    if (hash2(px * 5 + seed, y * 7) > 0.90) { d[i] = (d[i] * 0.58) | 0; d[i + 1] = (d[i + 1] * 0.58) | 0; d[i + 2] = (d[i + 2] * 0.52) | 0; }
    else if (hash2(px * 11, y * 3 + seed) > 0.968) { d[i] = 232; d[i + 1] = 228; d[i + 2] = 216; }
  }
  x.putImageData(img, 0, 0);
  return sp;
}
function capOtter() {
  if (CAP.ready) return CAP;
  if (typeof CH === 'undefined' || !CH.otterStandHi || !CH.otterHead || !CH.otterArm || !CH.otterTail) return null;
  CAP.stand = grimeSpr(rawSpr(CH.otterStandHi), 0);
  CAP.arm = grimeSpr(rawSpr(CH.otterArm), 7);
  CAP.tail = grimeSpr(rawSpr(CH.otterTail), 13);
  CAP.ride = grimeSpr(rawSpr(CH.otterTorso), 3);
  CAP.cigar = rawSpr(CH.cigar);
  CAP.hk = (CH.headBuf ? CH.headBuf.width : CH.otterHead.c.width) / Math.max(1, R(CH.otterHead.w));
  CAP.hax = CH.otterHead.ax * CAP.hk; CAP.hay = CH.otterHead.ay * CAP.hk;
  CAP.ready = true;
  return CAP;
}
// the cinematic's moods, said in the cast's own vocabulary
const OEXP = { plot: 'angry', sly: 'idle', grin: 'happy', shout: 'angry' };
function drawCapOtter(ctx, o, t) {
  const C = capOtter(); if (!C) return;
  const D = C.stand.k;                       // his art pixels per world unit
  ctx.save();
  ctx.translate(R(o.x), R(o.y));
  if (o.flip) ctx.scale(-1, 1);
  ctx.rotate(o.rot || 0);
  // NOTE: no per-beat scale.  He is one size, on her grid, all the way
  // through, which is the only way his pixels stay the size of hers.
  const ph = o.phase || 0;
  const ride = !!o.ride;
  const arms = [o.armNear === undefined ? (ride ? 0.9 : -0.25) : o.armNear,
                o.armFar === undefined ? (ride ? -0.9 : 0.35) : o.armFar];
  const body = ride ? C.ride : C.stand;
  // tail, far arm, body, near arm + whatever is in his paw, head
  ctx.save();
  ctx.translate(ride ? -7 * D : -6 * D, (ride ? 3 : 4) * D);
  ctx.rotate((ride ? 2.5 : 2.9) + Math.sin(ph) * 0.10 + (o.tail || 0));
  ctx.drawImage(C.tail.c, -C.tail.ax, -C.tail.ay); ctx.restore();
  ctx.save(); ctx.translate(D, (ride ? 4 : -1) * D); ctx.rotate(arms[1]);
  ctx.drawImage(C.arm.c, -C.arm.ax, -C.arm.ay); ctx.restore();
  ctx.drawImage(body.c, -body.ax, -body.ay);
  ctx.save(); ctx.translate(2 * D, (ride ? -4 : -2) * D); ctx.rotate(arms[0] + Math.sin(ph * 1.3) * 0.08);
  ctx.drawImage(C.arm.c, -C.arm.ax, -C.arm.ay);
  if (o.tool && typeof HOLD !== 'undefined' && HOLD.tool) {
    ctx.save(); ctx.translate(C.arm.w - C.arm.ax, 0); ctx.rotate(o.toolR || 0);
    ctx.drawImage(HOLD.tool.c, -HOLD.tool.ax, -HOLD.tool.ay); ctx.restore();
  }
  ctx.restore();
  ctx.save();
  ctx.translate((o.headX || 0) + (ride ? 0 : D), (ride ? -7 : -11) * D + (o.headY || 0) + R(Math.sin(ph * 0.8) * 0.8));
  ctx.rotate(o.headR || 0);
  const ex = OEXP[o.exp] || o.exp || 'idle';
  const hd = CH.headWithFace(ex, !!o.blink, t, false);
  ctx.drawImage(hd, 0, 0, hd.width, hd.height, -C.hax, -C.hay, hd.width, hd.height);
  if (o.rough !== false) for (let i = 0; i < 4; i++) P(ctx, '#e8e4d8', -C.hax + 8 + i, -C.hay + 16 + i, 1, 1);
  if (o.cigar !== false) {
    ctx.drawImage(C.cigar.c, 2 * D, D);
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
function hullHole(ctx, x, y, r, seed) {
  for (let yy = -r; yy <= r; yy++) {
    const k = Math.sqrt(Math.max(0, 1 - (yy / r) * (yy / r)));
    const w = r * k * (0.80 + hash2(seed, yy + 128) * 0.32);
    if (w < 1) continue;
    P(ctx, '#0a0806', R(x - w), R(y + yy * 0.9), R(w * 2), 2);
  }
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * TAU;
    const r0 = r * (0.78 + hash2(seed + i, 3) * 0.16);
    const r1 = r * (0.98 + hash2(seed + i, 7) * 0.22);
    const ax0 = x + Math.cos(a) * r0, ay0 = y + Math.sin(a) * r0 * 0.9;
    const ax1 = x + Math.cos(a) * r1, ay1 = y + Math.sin(a) * r1 * 0.9;
    const bw = 2 + hash2(seed + i, 11) * 2;
    tri(ctx, IP.ink, ax0, ay0 - bw - 1, ax0, ay0 + bw + 1, ax1, ay1);
    tri(ctx, hash2(i, seed) > 0.5 ? '#8a5f2f' : '#6b4a2a', ax0, ay0 - bw, ax0, ay0 + bw, ax1 - Math.cos(a), ay1 - Math.sin(a));
  }
}
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
  for (let y = y0; y < y1; y += 2) {
    const k = (y - y0) / (y1 - y0);
    const a = qa(a0 * (1 - k) * (1 - k));
    if (a <= 0) continue;
    ctx.fillStyle = rgbaq(col || '#ffe9b0', a);
    const off = R(lean * (y - y0));
    ctx.fillRect(R(x0 + off - k * 8), y, R((x1 - x0) + k * 16), 2);
  }
}
// vision closing down to nothing: a hard-edged iris, drawn in two steps so the
// rim reads as a band rather than a blur
function aperture(ctx, k) {
  if (k <= 0) return;
  const draw = (rx, ry, a) => {
    if (a <= 0) return;
    ctx.fillStyle = rgbaq('#000000', a);
    for (let y = 0; y < 360; y += 3) {
      const dy = (y - 176) / Math.max(1, ry);
      const w = Math.abs(dy) >= 1 ? 0 : Math.sqrt(1 - dy * dy) * rx;
      const x0 = R(324 - w), x1 = R(324 + w);
      if (x0 > 0) ctx.fillRect(0, y, x0, 3);
      if (x1 < 640) ctx.fillRect(x1, y, 640 - x1, 3);
    }
  };
  draw(430 * (1 - k) + 40, 260 * (1 - k) + 26, 0.5);
  draw(400 * (1 - k), 236 * (1 - k), 1);
  if (k > 0.94) { ctx.fillStyle = rgbaq('#000000', (k - 0.94) / 0.06); ctx.fillRect(0, 0, 640, 360); }
}
function eyelids(ctx, open) {
  if (open >= 1) return;
  const o = clamp(open, 0, 1);
  for (let x = 0; x < 640; x += 4) {
    const u = (x - 320) / 348;
    const cv = Math.pow(Math.max(0, 1 - u * u), 0.55);
    const half = 180 * o * cv;
    const top = R(180 - half), bot = R(180 + half);
    P(ctx, '#000000', x, 0, 4, Math.max(0, top));
    P(ctx, '#000000', x, bot, 4, Math.max(0, 360 - bot));
    if (half > 2) { P(ctx, '#0d0a08', x, top, 4, 2); P(ctx, '#0d0a08', x, bot - 2, 4, 2); }
  }
}


// ------------------------------------------------------------- 10. THE CRATE
function crateScene(ctx, t, o) {
  const H = holdArt();
  ctx.drawImage(H.bg, 0, 0);
  // hatch light from the deck gap, plus the swinging bulb beyond the slats
  const sw = Math.sin(t * 1.1) * 16;
  slatShaft(ctx, 252, 330, 44, 320, 0.10, 0.20 + (o.hatch || 0) * 0.34);
  glowPatch(ctx, 150 + sw, 120, 150, 122, '#ffdf9a', 0.26, 5);
  // the crate itself
  ctx.drawImage(H.wall, 0, 0);
  if (!o.boardOff) ctx.drawImage(H.board.c, 486, 0);
  else {
    ctx.save(); ctx.translate(R(502 + (o.boardOff.x || 0)), R(190 + (o.boardOff.y || 0)));
    ctx.rotate(o.boardOff.r || 0); ctx.drawImage(H.plank.c, -H.plank.ax, -H.plank.ay); ctx.restore();
  }
  // light bleeding through the slat gaps
  for (let gx = -12; gx < 660; gx += 42) {
    if (gx > 484 && gx < 520 && !o.boardOff) continue;
    ctx.fillStyle = rgbaq('#ffe1a4', 0.10);
    ctx.fillRect(gx + 33, 62, 9, 298);
    ctx.fillStyle = rgbaq('#ffe1a4', 0.05);
    ctx.fillRect(gx + 31, 62, 2, 298); ctx.fillRect(gx + 42, 62, 2, 298);
  }
  // hatch mouth overhead, open when they are tipping more catch in
  if (o.hatch) {
    ctx.fillStyle = rgbaq('#ffeec2', qa(0.22 * o.hatch));
    ctx.fillRect(252, 0, 78, 46);
    P(ctx, '#ffe9b0', 252, 44, 78, 2);
    for (let i = 0; i < 3; i++) { const bx = 262 + i * 24; P(ctx, IP.ink, bx, 0, 14, R(16 + Math.sin(t * 6 + i) * 3)); }
  }
  // the bulb, swinging on its cord beyond the slats
  ctx.save(); ctx.translate(R(150 + sw), 44); ctx.rotate(Math.sin(t * 1.1) * 0.16);
  ctx.drawImage(H.bulb.c, -H.bulb.ax, -H.bulb.ay); ctx.restore();
  // the catch: a heap you are half buried in
  ctx.drawImage(o.thin ? H.pileThin : H.pileBack, 0, o.thin ? 310 : 180);
}
// the hold's lamp, laid over everything in the crate so the manatee, the
// otter and the heap all sit in the same pool of light
function holdLight(ctx) { ctx.drawImage(holdArt().light, 0, 0); }
function cratePileFront(ctx, thin) {
  if (thin) return;
  ctx.drawImage(holdArt().pileFront, 0, 228);
}
BEATS.push({
  name: 'crate', dur: 9.5,
  lines: [[2.6, 'I woke up in a box, under the catch.'], [5.2, 'Every so often the hatch opened and more came down.'], [7.8, 'Shrimp. Dead things. And me.']],
  enter() {
    holdArt();
    SC.open = 0; SC.hatch = 0; SC.loose = []; SC.rainT = 0;
    A.you = actor(MAN.youBig, 286, 254, { beat: 0.5, exp: 'pain', tailAmp: 0.05, rot: 0.06 });
    for (let i = 0; i < 26; i++) looseAdd(SC.loose, { x: rand(30, 610), y: pileFrontTop(300) - 40, vx: rand(-20, 20), vy: rand(0, 60), r: rand(0, TAU), vr: rand(-4, 4), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
  },
  update(dt, bt) {
    swim(A.you, dt);
    // waking: two flutters, then open
    SC.open = bt < 0.9 ? 0 : bt < 1.3 ? (bt - 0.9) / 0.4 * 0.30
      : bt < 1.7 ? 0.30 - (bt - 1.3) / 0.4 * 0.24
        : bt < 2.4 ? 0.06 + (bt - 1.7) / 0.7 * 0.62
          : bt < 2.8 ? 0.68 - (bt - 2.4) / 0.4 * 0.16
            : Math.min(1, 0.52 + (bt - 2.8) / 0.4 * 0.48);
    A.you.exp = bt < 3.4 ? 'pain' : bt < 6 ? 'sad' : 'wide';
    A.you.y = 254 + Math.sin(bt * 0.7) * 2;
    A.you.rot = 0.06 + Math.sin(bt * 0.5) * 0.02;
    // the hatch opens and another load comes down
    SC.hatch = (bt > 4.4 && bt < 6.6) ? clamp(Math.min(bt - 4.4, 6.6 - bt) / 0.4, 0, 1) : 0;
    if (bt > 4.8 && bt < 6.3) {
      SC.rainT += dt;
      while (SC.rainT > 0.022) { SC.rainT -= 0.022; looseSpawnRain(SC.loose); }
      if (Math.random() < 5 * dt && typeof Audio_ !== 'undefined') Audio_.noise(0.14, 0.05, 2600, 700);
    }
    if (bt > 4.75 && bt < 4.85 && typeof Audio_ !== 'undefined') { Audio_.noise(0.5, 0.14, 900, 120); Audio_.tone(70, 0.3, 'square', 0.1, -20); }
    looseUpdate(SC.loose, dt, pileFrontTop, Intro.t);
    if (bt > 5.0 && bt < 6.4) Intro.shake = Math.max(Intro.shake, 1.0);
  },
  render(ctx, bt) {
    crateScene(ctx, Intro.t, { hatch: SC.hatch });
    drawManatee(ctx, A.you, Intro.t);
    cratePileFront(ctx);
    looseRender(ctx, SC.loose);
    FX.render(ctx);
    // a little grime on the lens: floating scales caught in the light
    holdLight(ctx);
    motes(ctx, Intro.t * 6, Intro.t, 30, '#ffe0a0', 0.26);
    eyelids(ctx, SC.open);
    void bt;
  },
});

// -------------------------------------------------------- 11. THE METAL NOISE
BEATS.push({
  name: 'noise', dur: 8.0,
  lines: [[0.5, 'Something in the hold was working at the metal.'], [3.2, 'It got closer every time it hit.'], [6.2, 'And then it looked back at me.']],
  enter() {
    holdArt();
    SC.clank = 0; SC.next = 0.7; SC.step = 0; SC.spark = 0; SC.reveal = 0; SC.loose = [];
    for (let i = 0; i < 34; i++) looseAdd(SC.loose, { x: rand(20, 620), y: pileFrontTop(300) - 30, vx: rand(-16, 16), vy: rand(0, 40), r: rand(0, TAU), vr: rand(-4, 4), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    A.you = actor(MAN.youBig, 286, 254, { beat: 0.6, exp: 'wide', tailAmp: 0.06, rot: 0.06 });
    SC.ot = { x: 560, y: 262, phase: 0, s: 1.7, exp: 'idle', flip: true, armNear: 0.5, armFar: 1.2, headR: 0, tool: true, toolR: 0 };
  },
  update(dt, bt) {
    swim(A.you, dt);
    SC.ot.phase += dt * 1.4;
    A.you.y = 254 + Math.sin(bt * 0.8) * 2 - clamp((bt - 0.8) / 1.2, 0, 1) * 10;
    looseUpdate(SC.loose, dt, pileFrontTop, Intro.t);
    if (SC.clank > 0.6 && Math.random() < 6 * dt) looseAdd(SC.loose, { x: rand(380, 600), y: pileFrontTop(480) - 18, vx: rand(-40, -6), vy: rand(-40, 10), r: rand(0, TAU), vr: rand(-7, 7), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    A.you.rot = 0.06 - clamp((bt - 0.8) / 1.2, 0, 1) * 0.16;
    SC.spark = Math.max(0, SC.spark - dt * 3);
    SC.next -= dt;
    if (SC.next <= 0 && bt < 6.6) {
      SC.step++;
      SC.next = Math.max(0.42, 1.25 - SC.step * 0.12);
      SC.clank = 1; SC.spark = 1;
      Intro.shake = Math.max(Intro.shake, 2 + SC.step * 0.5);
      const vol = clamp(0.06 + SC.step * 0.022, 0, 0.24);
      if (typeof Audio_ !== 'undefined') {
        Audio_.tone(190 + SC.step * 26, 0.10, 'square', vol, -90);
        Audio_.noise(0.13, vol * 0.8, 3600 + SC.step * 300, 800);
      }
      for (let i = 0; i < 9; i++) FX.add({ k: 'd', x: 503 + rand(-4, 4), y: 239 + rand(-10, 10), vx: rand(-150, -20), vy: rand(-110, 40), life: rand(0.2, 0.55), c: Math.random() < 0.5 ? '#ffd27a' : '#fff6cc' });
    }
    SC.clank = Math.max(0, SC.clank - dt * 5);
    SC.reveal = clamp((bt - 5.4) / 0.6, 0, 1);
    SC.ot.x = lerp(580, 512, SC.reveal);
    SC.ot.y = lerp(280, 250, SC.reveal);
    SC.ot.exp = bt > 6.4 ? 'angry' : 'idle';
    SC.ot.armNear = 0.5 + Math.sin(bt * 5) * 0.28 * (bt < 6.4 ? 1 : 0.2);
    SC.ot.toolR = Math.sin(bt * 5) * 0.4;
    SC.ot.blink = Intro.blink;
  },
  render(ctx, bt) {
    crateScene(ctx, Intro.t, { hatch: 0 });
    drawManatee(ctx, A.you, Intro.t);
    cratePileFront(ctx);
    looseRender(ctx, SC.loose);
    // the otter works at the bolt on the far side of the slats
    if (bt > 2.2) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, 640, 360); ctx.clip();
      ctx.globalAlpha = qa(0.35 + SC.reveal * 0.65);
      drawCapOtter(ctx, SC.ot, Intro.t);
      ctx.restore();
    }
    // sparks at the bolt, and the bolt itself
    P(ctx, IP.ink, 496, 232, 14, 14); P(ctx, '#5d6675', 497, 233, 12, 12);
    P(ctx, '#9aa6b6', 497, 233, 12, 4); P(ctx, IP.ink, 500, 237, 6, 6);
    if (SC.spark > 0) {
      glowPatch(ctx, 503, 239, 54, 40, '#ffd27a', 0.38 * SC.spark, 4);
      P(ctx, '#fff6cc', 500, 236, 5, 5);
    }
    FX.render(ctx);
    if (SC.clank > 0) { ctx.fillStyle = rgbaq('#ffe9b0', qa(SC.clank * 0.10)); ctx.fillRect(0, 0, 640, 360); }
    holdLight(ctx);
    motes(ctx, Intro.t * 6, Intro.t, 30, '#ffe0a0', 0.26);
  },
});

// ------------------------------------------------------------- 12. THE PLAN
const TALK = [
  [0.7, 'otter', 'Breathe. You are not the first one they boxed.'],
  [3.4, 'you', 'Who are you?'],
  [5.0, 'otter', 'Nobody worth a bullet. I take things. Tools, mostly.'],
  [8.0, 'otter', 'Eleven days in this hold. Hold still - you are getting plate.'],
  [11.6, 'you', 'There was another one. Smaller. My brother.'],
  [14.4, 'otter', 'Grey, about so big? He went out last night.'],
  [16.6, 'otter', 'Different boat. Different buyer. He is already gone.'],
  [20.4, 'you', 'Where.'],
  [21.8, 'otter', 'The village these boats crawl home to. We work up the chain.'],
];
BEATS.push({
  name: 'plan', dur: 24.5,
  lines: [],
  enter() {
    holdArt();
    SC.talkI = -1; SC.lastTalk = -2; SC.plate = 0; SC.clink = false; SC.dim = 0; SC.loose = [];
    for (let i = 0; i < 38; i++) looseAdd(SC.loose, { x: rand(20, 620), y: pileFrontTop(300) - 30, vx: rand(-14, 14), vy: rand(0, 40), r: rand(0, TAU), vr: rand(-4, 4), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    A.you = actor(MAN.youBig, 250, 252, { beat: 0.5, exp: 'sad', tailAmp: 0.05, rot: 0.04 });
    SC.ot = { x: 452, y: 264, phase: 0, s: 1.6, exp: 'talk', flip: true, armNear: 0.6, armFar: 1.2, headR: 0 };
  },
  update(dt, bt) {
    swim(A.you, dt);
    SC.ot.phase += dt * 1.2;
    let cur = -1;
    for (let i = 0; i < TALK.length; i++) if (bt >= TALK[i][0]) cur = i;
    SC.talkI = cur;
    const who = cur >= 0 ? TALK[cur][1] : null;
    const typing = cur >= 0 && (bt - TALK[cur][0]) < TALK[cur][2].length / 26;
    if (cur !== SC.lastTalk) { SC.lastTalk = cur; if (typeof Audio_ !== 'undefined' && cur >= 0) Audio_.tone(who === 'otter' ? 300 : 220, 0.06, 'square', 0.06); }
    if (typing && Math.random() < 9 * dt && typeof Audio_ !== 'undefined') Audio_.tone(who === 'otter' ? 480 + rand(0, 80) : 330 + rand(0, 50), 0.03, 'square', 0.04);
    // he fits the first plate while he talks
    if (bt > 8.6) {
      const k = clamp((bt - 8.6) / 1.5, 0, 1);
      SC.plate = k;
      if (bt > 8.6 && bt < 9.6) { SC.ot.x = lerp(452, 366, clamp((bt - 8.6) / 1.0, 0, 1)); SC.ot.y = lerp(264, 252, clamp((bt - 8.6) / 1.0, 0, 1)); }
      if (k >= 1 && !SC.clink) { SC.clink = true; Intro.shake = 3; if (typeof Audio_ !== 'undefined') { Audio_.tone(430, 0.09, 'square', 0.16, -160); Audio_.noise(0.12, 0.12, 4200, 900); } }
      SC.ot.armNear = 0.6 + Math.sin(bt * 7) * 0.4 * (1 - k);
    }
    if (bt > 11.0 && bt < 12.2) { SC.ot.x = lerp(366, 442, clamp((bt - 11.0) / 1.2, 0, 1)); SC.ot.y = lerp(252, 264, clamp((bt - 11.0) / 1.2, 0, 1)); }
    // the news lands: the light drops out of the scene for a moment
    SC.dim = (bt > 19.0 && bt < 21.4) ? clamp(Math.min(bt - 19.0, 21.4 - bt) / 0.7, 0, 1) : 0;
    A.you.exp = (who === 'you' && typing) ? 'talk' : bt > 22.6 ? 'angry' : bt > 19.0 ? 'sad' : 'calm';
    SC.ot.exp = (who === 'otter' && typing) ? 'talk' : bt > 19.0 && bt < 21.4 ? 'idle' : 'angry';
    SC.ot.blink = Intro.blink;
    A.you.blink = Intro.blink;
    A.you.y = 252 + Math.sin(bt * 0.6) * 2 - (bt > 19 ? clamp((bt - 19) / 2, 0, 1) * 4 : 0);
    looseUpdate(SC.loose, dt, pileFrontTop, Intro.t);
    if (Math.random() < 1.1 * dt) looseAdd(SC.loose, { x: rand(40, 600), y: pileFrontTop(300) - 26, vx: rand(-18, 18), vy: rand(-20, 20), r: rand(0, TAU), vr: rand(-5, 5), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    A.you.rot = 0.04 + Math.sin(bt * 0.45) * 0.02;
    if (Math.random() < 1.4 * dt) FX.add({ k: 'd', x: rand(60, 580), y: 60, vx: rand(-4, 4), vy: rand(20, 50), life: rand(1.6, 3), c: '#8f9a6a' });
  },
  render(ctx, bt) {
    crateScene(ctx, Intro.t, { hatch: 0 });
    drawManatee(ctx, A.you, Intro.t);
    // the first plate, strapped across the back
    if (SC.plate > 0) {
      const k = SC.plate, H = holdArt();
      ctx.save();
      ctx.translate(R(A.you.x - 4), R(A.you.y - 9 - (1 - k) * 26));
      ctx.rotate(A.you.rot - (1 - k) * 0.3);
      ctx.globalAlpha = qa(0.35 + k * 0.65);
      ctx.drawImage(H.plate.c, -H.plate.ax, -H.plate.ay);
      ctx.restore();
    }
    drawCapOtter(ctx, SC.ot, Intro.t);
    cratePileFront(ctx);
    looseRender(ctx, SC.loose);
    FX.render(ctx);
    holdLight(ctx);
    motes(ctx, Intro.t * 6, Intro.t, 30, '#ffe0a0', 0.26);
    if (SC.dim > 0) { ctx.fillStyle = rgbaq('#05070c', qa(SC.dim * 0.55)); ctx.fillRect(0, 0, 640, 360); }
    const cur = SC.talkI;
    if (cur >= 0) {
      const t0 = TALK[cur][0], who = TALK[cur][1], text = TALK[cur][2];
      const prog = clamp((bt - t0) / (text.length / 26), 0, 1);
      if (bt - t0 < text.length / 26 + 2.2) {
        if (who === 'otter') bubble(ctx, SC.ot.x - 4, SC.ot.y - 54, text, 1, 'otter', prog);
        else bubble(ctx, A.you.x + 16, A.you.y - 30, text, 1, 'you', prog);
      }
    }
  },
});

// --------------------------------------------------------- 13. THE BREAK OUT
BEATS.push({
  name: 'breakout', dur: 12.0,
  lines: [[0.3, 'He had been chewing on that one bolt for a week.'], [5.8, 'We did not use the door.']],
  enter() {
    holdArt();
    SC.popped = false; SC.burst = false; SC.smash = false; SC.splash = false;
    SC.boardOff = null; SC.run = 0; SC.flash = 0; SC.shout = 0; SC.loose = []; SC.thin = false;
    for (let i = 0; i < 30; i++) looseAdd(SC.loose, { x: rand(20, 620), y: pileFrontTop(300) - 26, vx: rand(-14, 14), vy: rand(0, 30), r: rand(0, TAU), vr: rand(-4, 4), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    SC.boatX = 214; SC.boatY = 158;
    A.you = actor(MAN.youBig, 250, 252, { beat: 1.0, exp: 'angry', tailAmp: 0.2, rot: 0.04 });
    SC.ot = { x: 470, y: 232, phase: 0, s: 1.4, exp: 'angry', flip: true, armNear: 0.6, armFar: 1.2, tool: true, toolR: 0 };
  },
  update(dt, bt) {
    swim(A.you, dt);
    SC.ot.phase += dt * 1.6;
    SC.flash = Math.max(0, SC.flash - dt * 4);
    if (bt < 1.7) {                                    // the last few turns of the bolt
      SC.ot.armNear = 0.6 + Math.sin(bt * 12) * 0.5;
      SC.ot.toolR = Math.sin(bt * 12) * 0.5;
      if (Math.random() < 10 * dt) { Intro.shake = Math.max(Intro.shake, 2); if (typeof Audio_ !== 'undefined') Audio_.tone(220, 0.07, 'square', 0.12, -80); }
      A.you.beat = 1.4;
    } else if (bt < 3.1) {                             // POP, and the crate lets go
      if (!SC.popped) {
        SC.popped = true; SC.flash = 1; Intro.shake = 16;
        SC.boardOff = { x: 0, y: 0, r: 0, vx: 210, vy: -60, vr: 5 };
        SC.boards = [];
        for (let i = 0; i < 3; i++) SC.boards.push({ x: 420 - i * 44, y: 0, r: 0, vx: 140 + i * 60, vy: -120 - i * 40, vr: rand(-6, 6) });
        FX.chunks(506, 176, 34);
        SC.thin = true;
        pileBurst(SC.loose, 470, 214, 240);
        FX.catchSpray(330, 270, 40, 1.15);
        if (typeof Audio_ !== 'undefined') { Audio_.explosion(0.7); Audio_.noise(0.4, 0.3, 2600, 300); }
        for (let i = 0; i < 40; i++) FX.add({ k: 'd', x: rand(440, 560), y: rand(120, 260), vx: rand(20, 260), vy: rand(-180, 120), life: rand(0.5, 1.4), c: '#ffd27a' });
      }
      const k = clamp((bt - 1.7) / 1.4, 0, 1);
      A.you.x = lerp(250, 320, k); A.you.y = lerp(252, 226, k * k);
      A.you.rot = lerp(0.04, -0.18, k); A.you.beat = 7;
      SC.ot.x = lerp(470, 388, k); SC.ot.y = lerp(232, 206, k);
      if (Math.random() < 40 * dt) FX.add({ k: 'c', x: rand(200, 520), y: rand(200, 300), vx: rand(-90, 190), vy: rand(-220, -40), life: rand(0.6, 1.4), w: randi(2, 5), h: randi(1, 3), c: pick(['#d08a76', '#eab79c', '#93a0aa', '#c3ced6']) });
    } else if (bt < 5.4) {                             // down the hold, men shouting above
      SC.run = clamp((bt - 3.1) / 2.3, 0, 1);
      A.you.x = 320; A.you.y = 214 + Math.sin(bt * 8) * 5;
      A.you.rot = -0.1 + Math.sin(bt * 8) * 0.07; A.you.beat = 11;
      SC.ot.x = 288; SC.ot.y = 190 + Math.sin(bt * 8) * 4; SC.ot.tool = false;
      SC.shout = 1;
      Intro.shake = Math.max(Intro.shake, 3);
      if (Math.random() < 30 * dt) FX.add({ k: 'd', x: rand(0, 640), y: 46, vx: rand(-10, 10), vy: rand(60, 160), life: rand(0.4, 0.9), c: '#6a5b3a' });
      if (typeof Audio_ !== 'undefined') { sndT -= dt; if (sndT <= 0) { sndT = 0.34; Audio_.noise(0.2, 0.09, 420, 60); } }
      if (bt > 5.1 && !SC.smash) {
        SC.smash = true; SC.flash = 1; Intro.shake = 20;
        if (typeof Audio_ !== 'undefined') { Audio_.explosion(1.1); Audio_.splash(3); }
      }
    } else if (bt < 7.6) {                             // out through the hull
      const k = clamp((bt - 5.4) / 2.2, 0, 1);
      SC.boatX = 214 - k * 26;
      A.you.x = lerp(330, 556, k); A.you.y = lerp(226, 300, k * k);
      A.you.rot = lerp(-0.34, 0.5, k); A.you.beat = 9;
      if (k < 0.3 && Math.random() < 40 * dt) FX.chunks(lerp(330, 556, k), lerp(226, 300, k * k), 2);
      if (Math.random() < 50 * dt) FX.drops(A.you.x + rand(-16, 16), A.you.y + rand(-10, 10), 1, 0.6);
      if (!SC.splash && A.you.y > 248) {
        SC.splash = true; Intro.shake = 10;
        FX.drops(A.you.x, 252, 90, 1.3); FX.foam(A.you.x, 252, 44, 1.6);
        if (typeof Audio_ !== 'undefined') Audio_.splash(3);
      }
    } else {                                           // clear water, and gone
      const k = clamp((bt - 7.6) / 4.4, 0, 1);
      Intro.scroll += lerp(120, 300, k) * dt;
      A.you.x = 300 + Math.sin(bt * 1.4) * 6; A.you.y = 216 + Math.sin(bt * 3.4) * 9;
      A.you.rot = Math.sin(bt * 3.4) * 0.10; A.you.beat = 7; A.you.exp = 'angry';
      if (Math.random() < 34 * dt) FX.bubble(A.you.x - 40, A.you.y + 6, 1, 2.4);
      if (bt > 10.6) Intro.fade = clamp((bt - 10.6) / 1.4, 0, 1);
    }
    if (SC.boardOff) {
      const b = SC.boardOff;
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 260 * dt; b.r += b.vr * dt;
    }
    if (SC.boards) for (const b of SC.boards) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 300 * dt; b.r += b.vr * dt; }
    if (bt < 5.4) looseUpdate(SC.loose, dt, SC.thin ? pileThinTop : pileFrontTop, Intro.t);
    if (bt > 1.7 && bt < 3.0 && Math.random() < 34 * dt) FX.catchSpray(A.you.x, A.you.y + 20, 2, 0.8);
  },
  render(ctx, bt) {
    if (bt < 5.4) {
      crateScene(ctx, Intro.t, { hatch: 0, boardOff: SC.boardOff, thin: SC.thin });
      if (SC.run > 0) {                                 // boots stamping on the boards above
        for (let i = 0; i < 4; i++) {
          const bx = R(60 + i * 150 - SC.run * 260);
          const st = Math.sin(Intro.t * 9 + i * 1.7) > 0 ? 0 : 3;
          P(ctx, IP.ink, bx, 26 + st, 22, 12); P(ctx, IP.ink, bx + 26, 30 - st, 20, 10);
        }
        speedLines(ctx, 520, 200, 16, 90, 1, 'rgba(230,220,190,0.25)', 5);
      }
      if (SC.boards) for (const b of SC.boards) {
        const H2 = holdArt();
        ctx.save(); ctx.translate(R(b.x), R(b.y + 170)); ctx.rotate(b.r);
        ctx.drawImage(H2.plank.c, -H2.plank.ax, -H2.plank.ay); ctx.restore();
      }
      drawManatee(ctx, A.you, Intro.t);
      const H = holdArt();
      ctx.save(); ctx.translate(R(A.you.x - 4), R(A.you.y - 9)); ctx.rotate(A.you.rot);
      ctx.drawImage(H.plate.c, -H.plate.ax, -H.plate.ay); ctx.restore();
      cratePileFront(ctx, SC.thin);
      looseRender(ctx, SC.loose);
      drawCapOtter(ctx, SC.ot, Intro.t);
      FX.render(ctx);
      holdLight(ctx);
      if (SC.shout && bt > 3.4) {
        pixelTextOutlined(ctx, 'IT IS LOOSE!', 150, 70, 9, '#ffe48f', '#14141c', 'center');
        if (bt > 4.2) pixelTextOutlined(ctx, 'GET THE GAFF!', 470, 84, 9, '#ffe48f', '#14141c', 'center');
      }
    } else {
      // outside: the boat with a hole in her side
      backdrop(ctx, { mood: 'dawn', grade: 'dawn', scroll: Intro.scroll, t: Intro.t, surfY: bt < 7.6 ? 252 : 40, bedY: 356, set: 'D', shafts: 0.5 });
      if (bt < 7.6) {
        drawAir(ctx, 252, Intro.scroll, Intro.t, 'dawnsky');
        ctx.save(); ctx.translate(R(SC.boatX), R(SC.boatY + 94)); ctx.rotate(0.04);
        ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay); ctx.restore();
        hullHole(ctx, R(SC.boatX + 108), R(SC.boatY + 88), 26, 31);
        drawManatee(ctx, A.you, Intro.t);
        const H = holdArt();
        ctx.save(); ctx.translate(R(A.you.x - 4), R(A.you.y - 9)); ctx.rotate(A.you.rot);
        ctx.drawImage(H.plate.c, -H.plate.ax, -H.plate.ay); ctx.restore();
        drawCapOtter(ctx, Object.assign({}, SC.ot, { x: A.you.x - 20, y: A.you.y - 20, rot: A.you.rot, flip: false, ride: true, tool: false, exp: 'angry' }), Intro.t);
      } else {
        const k = clamp((bt - 7.6) / 4.4, 0, 1);
        ctx.save(); ctx.translate(R(520 - k * 460), R(64)); ctx.scale(0.5 - k * 0.3, 0.5 - k * 0.3);
        ctx.globalAlpha = qa(0.9 - k * 0.7);
        ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay); ctx.restore();
        drawManatee(ctx, A.you, Intro.t);
        const H = holdArt();
        ctx.save(); ctx.translate(R(A.you.x - 4), R(A.you.y - 9)); ctx.rotate(A.you.rot);
        ctx.drawImage(H.plate.c, -H.plate.ax, -H.plate.ay); ctx.restore();
        drawCapOtter(ctx, Object.assign({}, SC.ot, { x: A.you.x - 12, y: A.you.y - 22, rot: A.you.rot, flip: false, ride: true, tool: false, exp: 'happy' }), Intro.t);
        speedLines(ctx, A.you.x - 90, A.you.y, 16, 64, -1, 'rgba(190,225,245,0.32)', 7);
      }
      FX.render(ctx);
      if (bt >= 7.6) foreground(ctx, { grade: 'dawn', scroll: Intro.scroll, t: Intro.t, bedY: 356, set: 'D' });
    }
    if (SC.flash > 0) { ctx.fillStyle = rgbaq('#ffffff', SC.flash * 0.8); ctx.fillRect(0, 0, 640, 360); }
  },
});

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
  // The cinematic can no longer be skipped; kept as a no-op so older
  // callers (and any saved bindings) do not throw.
  skip() { },
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
    // Nothing hurries the cinematic: no skip, no beat advance. It plays through.
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
      const n = BEATS.length, w = n > 10 ? 6 : 7, gap = n > 10 ? 11 : 13;
      const x0 = R(320 - (n * gap - (gap - w)) / 2);
      for (let i = 0; i < n; i++) {
        P(ctx, i < this.beat ? '#5f6a76' : i === this.beat ? '#e8eef4' : '#2a323c', x0 + i * gap, 11, i === this.beat ? w + 2 : w, 2);
      }
    }
    ctx.restore();
  },
};

try { if (typeof document !== 'undefined' && document.createElement) buildIntroArt(); } catch (e) { /* built lazily on reset */ }

global.Intro = Intro;
global.IntroBeats = BEATS;
global.__introDebug = { MAN: MAN, drawManatee: drawManatee, drawBiz: drawBiz, figure: figure, drawCrane: drawCrane, drawNet: drawNet, get HARP() { return HARP; }, get BOAT() { return BOAT; }, get YAC() { return YAC; }, get HOLD() { return HOLD; }, get CATCH() { return CATCH; }, drawCapOtter: drawCapOtter, holdArt: holdArt };
})(typeof window !== 'undefined' ? window : this);
