// ===========================================================================
//  INTRO — "MANATEE VS BOATS" opening cinematic.
//  Five beats of side-scrolling 640x360 pixel art, about half a minute long,
//  all of it in daylight, all of it spoken by the two animals the player is
//  about to be handed.  Every layer is generated procedurally at load and
//  scrolled; nothing is rebuilt per frame.
//  This is the only cutscene the game keeps, so it carries the whole setup:
//  she had a family, the fleet took them, the otter turned up.
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
  // The one ink.  chars.js inks the whole cast with CPAL.out; the boats, the
  // crates and the reef in here are inked with the same value, so a hull and
  // a manatee are drawn with the same pen.
  ink: '#1a1220', ink2: '#2c2436',
  // one bright blue hour of sky, ramped zenith -> horizon
  sky:     ['#2c74b4', '#3d8bc8', '#5aa6dc', '#7ec2ea', '#a2d9f4', '#c4ecfc'],
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
  foam: ['#cfe8f2', '#e9f6fb', '#ffffff'],
  bone: '#e8e4d8',
  // ---- per-beat water ramps.  Three hours of ONE day: the ramps this file
  // used to carry for dusk, night, the fish tank and the harpooning went with
  // the beats that needed them.
  // home: sunlit lagoon, turquoise over warm gold-green sand light
  lagoon:  ['#86e6c0', '#46c6ab', '#25a293', '#177e7c', '#0e5f64', '#0a4750', '#07353c'],
  // the fleet overhead: the same sea, the sun off it, hulls in the way
  cold:    ['#63aec6', '#3f89a9', '#2b6a8e', '#1e5175', '#153c5c', '#0f2b46', '#0a1d32'],
  // the two of them, and the run for open water: bright, hopeful, sunlit blue
  dawn:    ['#7fe2ec', '#4cbcd8', '#3195bf', '#2375a4', '#195b88', '#124369', '#0c2f4d'],
  // ---- coloured light -----------------------------------------------------
  sunGold: '#ffdf96', sunAmber: '#ffb45a', sunCold: '#cfefff',
};

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
      // src/water.js's own three frequencies, taken down together by a bit so
      // the cells come out the size of a cinematic instead of the size of a
      // play field.  The ratios between them are what turns three gratings
      // into a net, so they are not touched.
      const q3 = Math.sin(px * 0.019 - y * 0.016 + ph * 0.55);
      const s1 = Math.sin(px * 0.047 + y * 0.029 + ph * 1.15 + q3 * 2.1);
      const s2 = Math.sin(-px * 0.037 + y * 0.052 - ph * 0.95 - q3 * 1.7);
      const cv = s1 + s2 + q3 * 0.55;
      // Two hard steps of light with an ordered dither between them -- the
      // same posterize-then-Bayer the water ramps and the colour grades in
      // this file are built with.  A smooth wash would read as blur, which is
      // the one thing the play field never does.
      const g = Math.max(0, (cv - 0.52) / 1.55) * 2.4 * fade;
      const gi = Math.floor(g), lv = Math.min(2, (g - gi) > bay(px, y) ? gi + 1 : gi);
      let a = [0, 0.26, 0.50][lv];
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
  // straight up noon, once she is on her own: the palest, brightest hour in
  // here, so the empty water reads as bright and empty rather than as gloom
  noon: {
    bg: [[0, '#ffffcc', 0.30], [0.20, '#c2f4e4', 0.12], [0.52, '#63d8c6', 0.04], [0.78, '#37b0a8', 0.07], [1, '#ffd77a', 0.14]],
    fg: [[0, '#ffffe0', 0.17], [0.34, '#c8f6ec', 0.05], [0.70, '#8fe8d8', 0.02], [1, '#1c7f92', 0.08]],
    shaft: 'warm', caustic: '#fffce0', bedCaustic: '#fff0bc', mote: '#fffce4',
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
function darkTone(c, inkRGB) {
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
  return dk ? 'rgb(' + dk[0] + ',' + dk[1] + ',' + dk[2] + ')' : '#332f39';
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
  return {
    L: len, k: k, who: who, ink: ink, dark: darkTone(body.c, inkRGB),
    // The eye box: the cast's own three art pixels of pupil on the adults,
    // two on the calves.  The eye is the one thing on her that must not be
    // resampled, so it is painted live at whichever size the body came out.
    ek: len > 74 ? 3 : len > 34 ? 2 : 1,
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
  // The flap runs off whatever clock the caller hands in.  During speech that
  // is the typing clock (sayT), so the mouth moves with the letters instead
  // of beating against them at a fixed 7Hz.
  const open = exp === 'wide' || exp === 'pain' || (exp === 'talk' && (Math.floor((SAY.who ? SAY.mouth : t * 7)) & 1));
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
  if (m.blush) blushMark(ctx, M);
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
let BOAT = null;
let FISHSPR = [], BUILT = false;

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
// ============================================================ CUTE  MARKS ==
//  The cinematic's punctuation.  Everything here is a hard-edged stamp on the
//  same grid as the cast: rows of characters, one character per art pixel, no
//  alpha ramps inside the mark itself.  They are what the intro says instead
//  of a caption: a heart when somebody is loved, a sparkle when something
//  lands, a note when the otter is pleased with himself.
const MARK = {
  heartS: ['.k.k.',
           'kRWRk',
           'kRRRk',
           '.kRk.',
           '..k..'],
  heart:  ['.kk.kk.',
           'kRWRRRk',
           'kRWRRRk',
           'kRRRRRk',
           '.kRRRk.',
           '..kRk..',
           '...k...'],
  sparkS: ['.Y.',
           'YWY',
           '.Y.'],
  spark:  ['..Y..',
           '.YWY.',
           'YWWWY',
           '.YWY.',
           '..Y..'],
  note:   ['..kk.',
           '..kWk',
           '..kk.',
           '..k..',
           '..k..',
           'kkk..',
           '.kk..'],
  bang:   ['kWk',
           'kWk',
           'kWk',
           '.k.',
           'kWk'],
};
const MPAL = { k: '#3a1c28', R: '#ff6f92', W: '#ffffff', Y: '#ffd76a' };
function stampRows(ctx, rows, x, y, pal) {
  pal = pal || MPAL;
  x = x | 0; y = y | 0;
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const c = pal[row[i]];
      if (c) { ctx.fillStyle = c; ctx.fillRect(x + i, y + j, 1, 1); }
    }
  }
}
// the width/height of a stamp, so callers can centre one without guessing
function markW(rows) { let w = 0; for (const r of rows) w = Math.max(w, r.length); return w; }
function stampC(ctx, rows, x, y, pal) { stampRows(ctx, rows, R(x) - (markW(rows) >> 1), R(y) - (rows.length >> 1), pal); }
// A cheek.  Two flat bands of one warm tone, placed off the cast's own eye
// anchor, so it lands on whatever face chars.js is currently drawing.
function blushMark(ctx, M) {
  const e = Math.max(1, M.ek);
  const w = Math.max(4, R(5 * M.k)), h = Math.max(2, R(1.7 * M.k));
  const x = R(M.eye[0]) - 1, y = R(M.eye[1]) + e + 2;
  P(ctx, '#e0758d', x, y, w, h);
  P(ctx, '#ff9db4', x + 1, y, w - 2, Math.max(1, h - 1));
}
// ---- squash and stretch ----------------------------------------------------
//  A critically-ish damped spring on one scalar.  Poses do not pop any more:
//  a kick goes in, the spring carries it out over a few frames and settles
//  back on exactly 1, so the actor is pixel-exact whenever it is at rest.
function bounce(m, dt) {
  m.sqv += (-m.sq * 260 - m.sqv * 21) * dt;
  m.sq += m.sqv * dt;
  if (Math.abs(m.sq) < 0.0035 && Math.abs(m.sqv) < 0.04) { m.sq = 0; m.sqv = 0; m.sx = 1; m.sy = 1; return; }
  const s = clamp(m.sq, -0.22, 0.22);
  m.sx = 1 + s * 0.5; m.sy = 1 - s * 0.5;
}
function kick(m, a) { m.sqv += a; }
// ---- easing ----------------------------------------------------------------
//  Every scripted move in the beats below runs through one of these instead
//  of a raw k*k, so nothing starts or stops with a corner on it.
function ss(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function ss2(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
function outCube(t) { t = clamp(t, 0, 1); const u = 1 - t; return 1 - u * u * u; }
function inCube(t) { t = clamp(t, 0, 1); return t * t * t; }
function outBack(t) { t = clamp(t, 0, 1); const c = 1.9, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
function outBounce(t) {
  t = clamp(t, 0, 1);
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
//  Frame-rate-correct exponential approach.  lerp(a, b, rate*dt) is only
//  right at one frame length and stutters whenever dt moves; this is the
//  same curve sampled properly, so the glide is the same at 30 and 144.
function smooth(cur, target, rate, dt) { return target + (cur - target) * Math.exp(-rate * dt); }
function buildIntroArt() {
  if (BUILT) return;
  if (typeof blobField !== 'function' || typeof shadeBlob !== 'function') return;
  // the whole cast comes out of chars.js now, so nothing is baked until it is
  // there; Intro.reset() comes back through here once buildCharacters() has run
  if (typeof CH === 'undefined' || !CH.side || !CH.otterStandHi || !CH.headWithFace) return;
  // Three hours of ONE bright day, and nothing else.  The night, tank, deep
  // and bruise ramps this file used to bake went with the beats that needed
  // them: the cinematic never leaves the sunlit shallows now.
  WATER.lagoon = buildWater(IP.lagoon, 640, 360, { pow: 1.15, wob: 0.85 });
  WATER.cold = buildWater(IP.cold, 640, 360, { pow: 1.0 });
  WATER.dawn = buildWater(IP.dawn, 640, 360, { pow: 1.05, wob: 0.8 });
  for (const k in GRADE_SPEC) { GRADE[k] = buildGrade(GRADE_SPEC[k].bg); GLOW[k] = buildGrade(GRADE_SPEC[k].fg, 16); }
  for (const k in SKYMODE) skyCan(k);      // every sky baked up front, never mid-cinematic
  LAY.caust = [buildCaustNet(0, 0), buildCaustNet(1, 2.09), buildCaustNet(2, 4.19)];
  LAY.shafts = buildShafts(LW, 300, '#d4f8ff');
  LAY.shaftsWarm = buildShafts(LW, 300, '#ffe2a0');
  LAY.bed = buildBed();
  LAY.grassNear = buildGrass(44, IP.grass, 150, 42, 771);
  LAY.grassFar = tintLayer(buildGrass(28, IP.grass, 120, 26, 991), '#2fa890', 0.40);
  LAY.mid = buildShallowMid(4242);
  // the near clutter used to be tinted almost black so it read as a silhouette
  // at dusk.  In daylight it is a reef in shadow, not a hole in the frame.
  LAY.near = tintLayer(buildNearClutter(313, IP.kelp), '#0e4a4c', 0.52);
  LAY.far = buildFarRidge(777, '#3f9fa0');
  LAY.surf = buildSurfaceUnder(11, IP.foam, '#48ad9e');
  // the family, off the cast's own side-on body: her father at her full
  // length, her mother six sevenths of it, and the two calves at four
  // sevenths and a clean half.  Same animal, four ages.
  MAN.dad = buildManatee(98, 'dad');
  MAN.mom = buildManatee(84, 'mom');
  MAN.you = buildManatee(56, 'you');
  MAN.bro = buildManatee(49, 'bro');
  MAN.youBig = buildManatee(98, 'you');
  capOtter();
  BOAT = buildFishingBoat();
  const fr = [
    ['#7a5a18', '#a8801f', '#d2a52f', '#eec756', '#fdeb9f'],
    ['#1d4a6a', '#2a6a92', '#3b8db8', '#63b3d8', '#a3dcf0'],
    ['#6a2a30', '#933b44', '#bc5560', '#dd8188', '#f4b8bc'],
    ['#3d5a22', '#557a2f', '#74a040', '#9cc35f', '#c8e493'],
  ];
  FISHSPR = [];
  for (let i = 0; i < 4; i++) FISHSPR.push([buildFish(7, fr[i]), buildFish(11, fr[i]), buildFish(17, fr[i])]);
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
  // ---- the cute marks.  These are the cinematic's punctuation and they are
  // what it spends its particle budget on now that nothing in it bleeds.
  hearts(x, y, n) {
    for (let i = 0; i < n; i++) {
      const L = rand(1.0, 1.7);
      this.add({ k: 'h', x: x + rand(-9, 9), y: y + rand(-6, 6), vx: rand(-10, 10), vy: -rand(12, 24), life: L, max: L, ph: rand(0, TAU) });
    }
  },
  sparkles(x, y, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(0.25, 1) * (sp === undefined ? 34 : sp), L = rand(0.34, 0.72);
      this.add({ k: 's', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: L, max: L });
    }
  },
  notes(x, y, n) {
    for (let i = 0; i < n; i++) {
      const L = rand(0.9, 1.4);
      this.add({ k: 'n', x: x + rand(-7, 7), y: y + rand(-4, 4), vx: rand(-14, 6), vy: -rand(14, 26), life: L, max: L, ph: rand(0, TAU) });
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
  ring(x, y, max, life, col) { this.add({ k: 'g', x: x, y: y, r: 2, max: max, life: life, t0: life, c: col || '#eaf8ff' }); },
  update(dt, flowY) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L.splice(i, 1); continue; }
      switch (p.k) {
        case 'b': p.x += p.vx * dt + Math.sin(p.ph + p.life * 4) * 8 * dt; p.y += p.vy * dt; p.vy -= 12 * dt; break;
        case 'f': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; break;
        case 'd': p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; break;
        // hearts and notes rise on a sine, easing as they go, never in a line
        case 'h': case 'n':
          p.x += p.vx * dt + Math.sin(p.ph + (p.max - p.life) * 4.4) * 13 * dt;
          p.y += p.vy * dt; p.vy += 7 * dt; p.vx *= 1 - dt * 1.3; break;
        case 's': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3.2; p.vy *= 1 - dt * 3.2; break;
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
        case 'f': ctx.fillStyle = rgbaq(IP.foam[p.life > 0.5 ? 2 : 1], Math.min(1, p.life * 2)); ctx.fillRect(R(p.x), R(p.y), R(p.r) + 1, R(p.r) + 1); break;
        case 'd': ctx.fillStyle = p.c; ctx.fillRect(R(p.x), R(p.y), 2, 2); break;
        // A mark pops on small, opens to full size and thins out.  Two stamps
        // and a quantized alpha: no scaling, so every pixel stays square.
        case 'h': {
          const k = p.life / p.max;
          ctx.globalAlpha = qa(k > 0.62 ? 1 : k / 0.62);
          stampC(ctx, k > 0.88 ? MARK.heartS : MARK.heart, p.x, p.y, MPAL);
          ctx.globalAlpha = 1; break;
        }
        case 'n': {
          const k = p.life / p.max;
          ctx.globalAlpha = qa(k > 0.62 ? 1 : k / 0.62);
          stampC(ctx, MARK.note, p.x, p.y, MPAL);
          ctx.globalAlpha = 1; break;
        }
        case 's': {
          const k = p.life / p.max;
          ctx.globalAlpha = qa(0.34 + k * 0.66);
          stampC(ctx, k > 0.28 && k < 0.86 ? MARK.spark : MARK.sparkS, p.x, p.y, MPAL);
          ctx.globalAlpha = 1; break;
        }
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
  ctx.drawImage(WATER[o.mood] || WATER.lagoon, 0, 0);
  if (o.shafts) {
    const sh = !G || G.shaft === 'cold' ? LAY.shafts : LAY.shaftsWarm;
    ctx.save(); ctx.globalAlpha = qa(o.shafts); tile(ctx, sh, s * 0.16, (o.surfY === undefined || o.surfY === null ? -40 : o.surfY)); ctx.restore();
  }
  // The lit water itself: the ocean's own caustics, boiling and drifting.
  // There are three baked nets and the beat used to cut between them six
  // times a second, which strobed.  They are cross-dissolved now -- two
  // blits on a quantized alpha -- so the light boils instead of flicking.
  const deepShot = o.surfY === undefined || o.surfY === null;
  const ca = o.caust === undefined ? (deepShot ? 0.26 : 0.60) : o.caust;
  if (ca > 0 && LAY.caust) {
    const top = (deepShot ? -34 : o.surfY) - 6;
    const f = t * 5.2, i0 = Math.floor(f), fr = f - i0, dx = s * 0.22 + t * 7;
    tile(ctx, LAY.caust[i0 % 3], dx, top, ca * (1 - fr));
    tile(ctx, LAY.caust[(i0 + 1) % 3], dx, top, ca * fr);
  }
  if (o.bedY !== undefined && o.bedY !== null) {
    tile(ctx, LAY.far, s * 0.26, o.bedY - LAY.far.height + 6);
    tile(ctx, LAY.grassFar, s * 0.40, o.bedY - LAY.grassFar.height + 10);
    tile(ctx, LAY.mid, s * 0.58, o.bedY - LAY.mid.height + 4);
    tile(ctx, LAY.bed, s * 0.78, o.bedY);
    if (o.causticBed) caustics(ctx, o.bedY + 4, t, 4, 0.20, G ? G.bedCaustic : '#ffeec0');
  }
  if (o.surfY !== undefined && o.surfY !== null) {
    tile(ctx, LAY.surf, s * 0.34, o.surfY - 6);
    caustics(ctx, o.surfY + 14, t, 5, 0.22, G ? G.caustic : undefined);
  }
  // one baked, dithered wash gives the whole beat its hour of the day
  if (GRADE[o.grade]) ctx.drawImage(GRADE[o.grade], 0, 0);
  motes(ctx, s, t, 60, G ? G.mote : '#bcdfe8', 0.26);
}
function foreground(ctx, o) {
  const s = o.scroll || 0, t = o.t || 0;
  const G = GRADE_SPEC[o.grade] || null;
  if (o.bedY !== undefined && o.bedY !== null) {
    tile(ctx, LAY.near, s * 1.35, o.bedY - LAY.near.height + 34);
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
// A speech bubble.  Warm cream for the otter, cool mint for her, and it
// grows in on a spring rather than appearing: `pop` is 0..1.2 and scales the
// BOX only, in whole pixels, so no glyph is ever drawn at a fraction.
function bubble(ctx, x, y, text, dir, style, prog, pop) {
  if (pop !== undefined && pop <= 0.02) return;
  const size = 7;
  const lines = wrapText(ctx, text, 150, size);
  let w = 0; for (const l of lines) w = Math.max(w, textWidth(l, size));
  const fullW = R(w) + 15, fullH = lines.length * 10 + 11;
  const k = pop === undefined ? 1 : clamp(pop, 0, 1.25);
  const bw = Math.max(8, R(fullW * k)), bh = Math.max(7, R(fullH * (0.55 + 0.45 * k)));
  let bx = R(x - bw / 2), by = R(dir > 0 ? y - bh - 8 : y + 8);
  bx = clamp(bx, 4, 636 - bw);
  const warm = style === 'otter';
  const fill = warm ? '#fff0c8' : '#dff4ec', fill2 = warm ? '#e2c48c' : '#a8ccc4';
  const ink = warm ? '#4a2c18' : '#1b3a3c';
  // a rounded box: the four corner pixels are simply left out of every band
  const band = (yy, h, col, inset) => P(ctx, col, bx + inset, yy, bw - inset * 2, h);
  P(ctx, ink, bx + 1, by - 1, bw - 2, 1);
  P(ctx, ink, bx + 1, by + bh, bw - 2, 1);
  P(ctx, ink, bx - 1, by + 1, 1, bh - 2);
  P(ctx, ink, bx + bw, by + 1, 1, bh - 2);
  P(ctx, ink, bx, by, 1, 1); P(ctx, ink, bx + bw - 1, by, 1, 1);
  P(ctx, ink, bx, by + bh - 1, 1, 1); P(ctx, ink, bx + bw - 1, by + bh - 1, 1, 1);
  band(by + 1, bh - 2, fill, 0);
  band(by, 1, fill, 1); band(by + bh - 1, 1, fill, 1);
  band(by + bh - 3, 2, fill2, 1);
  P(ctx, warm ? '#fffaea' : '#f2fffb', bx + 2, by + 1, bw - 4, 1);
  // tail, only once the box is open
  if (k > 0.85) {
    const tx = clamp(R(x), bx + 6, bx + bw - 8);
    for (let i = 0; i < 7; i++) {
      const ty = dir > 0 ? by + bh + i : by - 1 - i;
      P(ctx, ink, tx - 4 + i, ty, 8 - i, 1);
      if (i < 6) P(ctx, i > 3 ? fill2 : fill, tx - 3 + i, ty, 6 - i, 1);
    }
  }
  if (k < 0.98) return;                       // no letters until it has landed
  let total = 0; for (const l of lines) total += l.length;
  let shown = Math.floor((prog === undefined ? 1 : prog) * total);
  for (let i = 0; i < lines.length; i++) {
    const take = Math.max(0, Math.min(lines[i].length, shown));
    shown -= lines[i].length;
    if (take > 0) pixelText(ctx, lines[i].slice(0, take), bx + 7, by + 6 + i * 10, size, ink, 'left', false);
  }
}
// The title, dropped in on a bounce and left bobbing.  It used to slide in on
// a smoothstep and stop dead; every word now overshoots and settles.
function titleCard(ctx, k, t) {
  if (k <= 0) return;
  const drop = outBounce(clamp(k * 3.4, 0, 1));
  const bob = Math.sin(t * 1.5) * 2;
  const y = R(lerp(-70, 84, drop) + bob);
  const a = clamp(k < 0.80 ? 1 : (1 - k) / 0.20, 0, 1);
  ctx.save(); ctx.globalAlpha = qa(a);
  pixelTextOutlined(ctx, 'MANATEE', 320, y, 34, '#fffaf0', '#173044', 'center');
  if (k > 0.16) {
    const vk = outBack(clamp((k - 0.16) * 7, 0, 1));
    pixelTextOutlined(ctx, 'VS', 320, R(y + 38 + (1 - vk) * 6), 15, '#ff7e94', '#173044', 'center');
  }
  if (k > 0.24) {
    // in from the right, not down through the word above it
    const b = outBack(clamp((k - 0.24) * 3.0, 0, 1));
    pixelTextOutlined(ctx, 'BOATS', R(lerp(820, 320, b)), R(y + 58 + bob * 0.5), 34, '#ffe48f', '#173044', 'center');
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
  // Each cloud is stamped three times, one tile width apart, so a cloud that
  // runs off the right of the layer comes back on at the left instead of
  // being cut in half at the seam the tiler wraps on.
  for (let i = 0; i < 9; i++) {
    const cxx = R(rng.range(0, LW)), cyy = R(rng.range(6, 52)), w = R(rng.range(30, 90)), h = R(rng.range(6, 14));
    for (let j = 0; j < 5; j++) {
      const ox = R(rng.range(-w * 0.4, w * 0.4)), oy = R(rng.range(-h * 0.3, h * 0.3));
      const w0 = R(w * rng.range(0.34, 0.62)), w1 = R(w * rng.range(0.22, 0.42)), w2 = R(w * rng.range(0.26, 0.5));
      for (const wrap of [-LW, 0, LW]) {
        const bx = cxx + ox + wrap, by = cyy + oy;
        // a puff, not a slab: the body, then two narrower shoulders, then a
        // flat base, so the silhouette comes out lumpy instead of square
        P(x, cloudPal[0], bx, by, w0, h);
        P(x, cloudPal[0], bx + 2, by - 2, Math.max(1, w0 - 5), 2);
        P(x, cloudPal[0], bx + R(w0 * 0.30), by - 4, Math.max(1, R(w0 * 0.44)), 2);
        P(x, cloudPal[1], bx + 1, by, w1, Math.max(1, h >> 1));
        P(x, cloudPal[1], bx + 3, by - 2, Math.max(1, R(w1 * 0.7)), 2);
        P(x, cloudPal[2], bx + 1, by + h - 1, w2, 1);
      }
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
  day:    { zenith: '#1b4f86', key: 'sky',     sea: ['#2a6f9c', '#1d5580'], glint: '#bcdcec', chop: '#2d6f86', cap: '#eaf8ff', line: '#0d2a33', lip: '#cfeaf2' },
  gold:   { zenith: '#1a5a94', key: 'skyGold', sea: ['#3080a4', '#22607f'], glint: '#ffe3a2', chop: '#2b6478', cap: '#fff0c4', line: '#22303a', lip: '#ffdfa0' },
};
const SKY_RAMP = {
  sky: [['#2c74b4', '#3d8bc8', '#5aa6dc', '#7ec2ea', '#a2d9f4', '#c4ecfc'], ['#ffffff', '#ffffff', '#cfe2ea']],
  skyGold: [['#2c68a8', '#4a92c4', '#7fbad4', '#bcd3c6', '#f2d89a', '#ffc472'], ['#fff2d4', '#ffffff', '#dba980']],
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
  // Chop + whitecaps at the waterline.  The caps used to be reseeded three
  // times a second off floor(t*3), so they blinked on and off in place; the
  // pattern TRAVELS now -- same hash, sampled in a frame that slides along
  // the surface -- so a cap runs down the chop instead of strobing.
  for (let x = 0; x < 640; x += 2) {
    const w = Math.sin(x * 0.07 + t * 2.2) * 2 + Math.sin(x * 0.021 - t * 1.3) * 1.6;
    const yy = sy - 3 + R(w);
    P(ctx, m.chop, x, yy, 2, sy - yy);
    if (hash2(Math.floor((x + t * 26) / 6), 17) > 0.74) P(ctx, m.cap, x, yy - 1, 2, 2);
  }
  ctx.restore();
  P(ctx, m.line, 0, sy - 1, 640, 1);
  for (let x = 0; x < 640; x += 3) if (hash2(Math.floor((x + t * 34) / 3), 5) > 0.66) P(ctx, m.lip, x, sy + R(Math.sin(x * 0.07 + t * 2.2) * 2), 3, 1);
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
    // squash-and-stretch state: bounce() carries it, kick() puts energy in
    sq: 0, sqv: 0, blush: false,
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
function capOtter() {
  if (CAP.ready) return CAP;
  if (typeof CH === 'undefined' || !CH.otterStandHi || !CH.otterHead || !CH.otterArm || !CH.otterTail) return null;
  // clean, now.  The salt-and-grime pass this used to run over him belonged
  // to the fortnight in a fish hold, and that is not in the cinematic any more.
  CAP.stand = rawSpr(CH.otterStandHi);
  CAP.arm = rawSpr(CH.otterArm);
  CAP.tail = rawSpr(CH.otterTail);
  CAP.ride = rawSpr(CH.otterTorso);
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
  // the same squash the manatees get.  bounce() snaps it back to exactly 1,
  // so he is pixel-exact except in the few frames after a kick.
  if ((o.sx !== undefined && o.sx !== 1) || (o.sy !== undefined && o.sy !== 1)) {
    ctx.scale(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy);
  }
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
  ctx.restore();
  ctx.save();
  ctx.translate((o.headX || 0) + (ride ? 0 : D), (ride ? -7 : -11) * D + (o.headY || 0) + R(Math.sin(ph * 0.8) * 0.8));
  ctx.rotate(o.headR || 0);
  const ex = OEXP[o.exp] || o.exp || 'idle';
  const hd = CH.headWithFace(ex, !!o.blink, t, false);
  ctx.drawImage(hd, 0, 0, hd.width, hd.height, -C.hax, -C.hay, hd.width, hd.height);
  if (o.rough) for (let i = 0; i < 4; i++) P(ctx, '#e8e4d8', -C.hax + 8 + i, -C.hay + 16 + i, 1, 1);
  // Cheeks, the same two bands the manatees get, off his own head anchor.
  if (o.blush !== false) {
    for (const cx of [R(-C.hax) + 6, R(-C.hax) + hd.width - 11]) {
      P(ctx, '#e0758d', cx, R(-C.hay) + 24, 5, 2);
      P(ctx, '#ff9db4', cx + 1, R(-C.hay) + 24, 3, 1);
    }
  }
  if (o.cigar) {
    ctx.drawImage(C.cigar.c, 2 * D, D);
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.45 + i * 0.25) % 1;
      ctx.fillStyle = rgbaq('#b9b3ad', qa(0.30 * (1 - k)));
      ctx.fillRect(R((9 + Math.sin(k * 6 + i) * 2) * D), R((-1 - k * 11) * D), (1 + R(k * 2)) * D, (1 + R(k * 2)) * D);
    }
  }
  ctx.restore();
  ctx.restore();
}
// ================================================================= BEATS ====
//  Five of them, in daylight, told in speech.  The old thirteen ran two
//  minutes through dusk, night and a red sunset and said everything in
//  narration captions; this says what the player needs -- she had a family,
//  the fleet took them, the otter turned up -- in about half a minute, out of
//  the mouths of the two animals the player is about to be handed.
const A = {};
const SC = {};
const BEATS = [];

// ---------------------------------------------------------------- DIALOGUE
//  One speech track for the whole cinematic.  A beat lists its lines as
//  [time, who, text] and says where that speaker's bubble hangs; everything
//  else -- the blip, the typing, the grow-in, the fade, the mouth flapping --
//  is driven from here, so a beat never repeats it.
const SAY = { i: -1, last: -2, who: null, typing: false, x: 320, y: 110, dir: 1, snap: true, mouth: 0 };
const CPS = 27;                                   // characters a second
function sayType(text) { return text.length / CPS; }
function sayLife(text) { return 0.42 + sayType(text) + 1.5; }
function sayReset() { SAY.i = -1; SAY.last = -2; SAY.who = null; SAY.typing = false; SAY.snap = true; SAY.mouth = 0; }
function sayUpdate(b, bt, dt) {
  const L = b.talk;
  let cur = -1;
  if (L) for (let i = 0; i < L.length; i++) if (bt >= L[i][0] && bt < L[i][0] + sayLife(L[i][2])) cur = i;
  if (cur !== SAY.i) { SAY.i = cur; SAY.snap = true; }
  if (cur < 0) { SAY.who = null; SAY.typing = false; return; }
  const line = L[cur], e = bt - line[0];
  SAY.who = line[1];
  SAY.typing = e > 0.08 && e < sayType(line[2]) + 0.08;
  SAY.mouth += dt * (SAY.typing ? 11 : 0);
  if (SAY.last !== cur) {
    SAY.last = cur;
    if (typeof Audio_ !== 'undefined') Audio_.tone(SAY.who === 'otter' ? 340 : 230, 0.05, 'square', 0.055);
  }
  if (SAY.typing && Math.random() < 11 * dt && typeof Audio_ !== 'undefined') {
    Audio_.tone((SAY.who === 'otter' ? 520 : 340) + rand(0, 70), 0.025, 'square', 0.035);
  }
  const a = b.anchor ? b.anchor(SAY.who) : [320, 110, 1];
  if (SAY.snap) { SAY.x = a[0]; SAY.y = a[1]; SAY.snap = false; }
  else { SAY.x = smooth(SAY.x, a[0], 9, dt); SAY.y = smooth(SAY.y, a[1], 9, dt); }
  SAY.dir = a[2];
}
function sayRender(ctx, b, bt) {
  if (SAY.i < 0 || !b.talk) return;
  const line = b.talk[SAY.i], e = bt - line[0];
  // in on a spring, out on a quantized alpha.  Scaling it back down left an
  // empty box on screen for three frames with the words already gone.
  const grow = outBack(clamp(e / 0.20, 0, 1));
  const gone = ss(clamp((line[0] + sayLife(line[2]) - bt) / 0.22, 0, 1));
  const prog = clamp((e - 0.09) / Math.max(0.12, sayType(line[2])), 0, 1);
  if (gone >= 0.999) { bubble(ctx, SAY.x, SAY.y, line[2], SAY.dir, line[1], prog, grow); return; }
  ctx.save(); ctx.globalAlpha = qa(gone);
  bubble(ctx, SAY.x, SAY.y, line[2], SAY.dir, line[1], prog, 1);
  ctx.restore();
}
// is this actor the one currently speaking?
function talking(who) { return SAY.who === who && SAY.typing; }
// her mouth, driven off the speech clock rather than the wall clock, so the
// flap lines up with the letters instead of beating against them
function sayT() { return SAY.mouth / 7; }

// ---- one boat on the surface, with its wash ---------------------------------
function drawBoat(ctx, x, y, rot, propA, churn, t) {
  ctx.save(); ctx.translate(R(x), R(y)); ctx.rotate(rot || 0);
  ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay);
  drawProp(ctx, BOAT.prop[0], BOAT.prop[1], 15, propA, churn);
  ctx.restore();
  if (churn > 0) drawChurn(ctx, x + BOAT.prop[0], y + BOAT.prop[1], t, churn);
}
// the shadow a hull throws down through sunlit water: flat posterized bands,
// widest and darkest right under the keel
function hullShade(ctx, x, y, w, h, a) {
  if (a <= 0) return;
  for (let i = 0; i < 5; i++) {
    const k = i / 5;
    ctx.fillStyle = rgbaq('#0b3a52', qa(a * (1 - k) * 0.5));
    const ww = R(w * (1 + k * 0.7)), yy = R(y + k * h);
    ctx.fillRect(R(x - ww / 2), yy, ww, R(h / 5) + 1);
  }
}

// ------------------------------------------------------------------ 1. HOME
BEATS.push({
  name: 'home', dur: 7.0,
  talk: [
    [1.35, 'mom', 'Stay close, sweet pea.'],
    [3.95, 'you', 'Watch this!'],
  ],
  anchor(who) {
    if (who === 'mom') return [A.mom.x - 16, A.mom.y - 30, 1];
    return [A.you.x + 12, A.you.y - 26, 1];
  },
  enter() {
    A.dad = actor(MAN.dad, 112, 158, { beat: 0.95, tailAmp: 0.20 });
    A.mom = actor(MAN.mom, 456, 218, { beat: 1.00, tailAmp: 0.18, blush: true });
    A.you = actor(MAN.you, 330, 240, { beat: 1.70, blush: true });
    A.bro = actor(MAN.bro, 244, 272, { beat: 2.20, blush: true });
    SC.sch1 = makeSchool(14, 520, 128, 62, 0, 1, -22);
    SC.sch2 = makeSchool(9, 110, 286, 44, 1, 3, 17);
    SC.hug = false; SC.spun = false;
    FX.bubble(A.mom.x + 34, A.mom.y - 10, 4, 0.5);
  },
  update(dt, bt) {
    Intro.scroll += 11 * dt;
    for (const k of ['dad', 'mom', 'you', 'bro']) { swim(A[k], dt); bounce(A[k], dt); A[k].blink = Intro.blink; }
    // her father, cruising the far side of the meadow
    A.dad.x += 7 * dt;
    A.dad.y = 158 + Math.sin(bt * 0.46) * 7;
    A.dad.rot = Math.sin(bt * 0.38) * 0.05;
    // her mother, anchored, rocking
    A.mom.x = 456 + Math.sin(bt * 0.30) * 9;
    A.mom.y = 218 + Math.sin(bt * 0.56) * 5;
    A.mom.rot = 0.06 + Math.sin(bt * 0.46) * 0.06;
    A.mom.exp = talking('mom') ? 'talk' : 'calm';
    // the calf: up to be nuzzled, back out, then one barrel roll to show off
    const hug = ss2(clamp((bt - 1.70) / 1.45, 0, 1));
    const out = ss2(clamp((bt - 3.55) / 1.00, 0, 1));
    const hx = lerp(330, 380, hug), hy = lerp(240, 250, hug);
    A.you.x = lerp(hx, 296, out) + Math.sin(bt * 0.72) * 3;
    A.you.y = lerp(hy, 212, out) + Math.sin(bt * 1.05) * 4;
    const roll = clamp((bt - 4.35) / 1.15, 0, 1);
    A.you.rot = Math.sin(bt * 1.05 + 1) * 0.09 + TAU * ss2(roll);
    A.you.beat = lerp(1.7, 5.2, Math.sin(clamp(roll, 0, 1) * Math.PI));
    A.you.exp = talking('you') ? 'talk' : roll > 0 && roll < 1 ? 'wide' : 'calm';
    if (!SC.hug && bt >= 2.95) {
      SC.hug = true;
      kick(A.you, 6); kick(A.mom, 3);
      FX.hearts((A.you.x + A.mom.x) / 2, (A.you.y + A.mom.y) / 2 - 16, 3);
      if (typeof Audio_ !== 'undefined') Audio_.tone(660, 0.10, 'triangle', 0.06, 220);
    }
    if (!SC.spun && roll >= 1) {
      SC.spun = true;
      kick(A.you, 7);
      FX.sparkles(A.you.x, A.you.y, 7, 46);
      FX.notes(A.bro.x + 10, A.bro.y - 22, 2);
      kick(A.bro, 5);
      if (typeof Audio_ !== 'undefined') { Audio_.tone(520, 0.07, 'square', 0.05, 340); Audio_.tone(780, 0.09, 'triangle', 0.05, 200); }
    }
    if (roll > 0.15 && roll < 0.92 && Math.random() < 26 * dt) FX.sparkles(A.you.x + rand(-18, 18), A.you.y + rand(-12, 12), 1, 10);
    // her brother, orbiting her, always a beat behind
    A.bro.x = A.you.x - 74 + Math.sin(bt * 0.82) * 15;
    A.bro.y = A.you.y + 42 + Math.sin(bt * 1.18) * 11;
    A.bro.rot = Math.sin(bt * 1.18) * 0.20;
    A.bro.exp = (bt % 3.4) > 2.9 ? 'talk' : 'calm';
    if (Math.random() < 0.7 * dt) FX.bubble(A.mom.x + 34, A.mom.y - 6, 1, 0.45);
    if (Math.random() < 0.5 * dt) FX.bubble(A.you.x + 18, A.you.y - 8, 1, 0.45);
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'lagoon', grade: 'lagoon', scroll: Intro.scroll, t: Intro.t, surfY: 64, bedY: 302, shafts: 1, causticBed: true });
    drawAir(ctx, 64, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.dad, Intro.t);
    drawSchool(ctx, SC.sch2, Intro.t, Intro.dt);
    drawManatee(ctx, A.you, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'lagoon', scroll: Intro.scroll, t: Intro.t, bedY: 302 });
    titleCard(ctx, clamp((bt - 0.35) / 6.2, 0, 1), bt);
  },
});

// ----------------------------------------------------------------- 2. FLEET
BEATS.push({
  name: 'fleet', dur: 6.6,
  talk: [
    [0.70, 'mom', 'Sweet pea - swim!'],
    [3.35, 'you', 'Mama!'],
  ],
  anchor(who) {
    if (who === 'mom') return [A.mom.x - 62, A.mom.y - 26, 1];
    return [A.you.x + 10, A.you.y - 28, 1];
  },
  enter() {
    SC.surfY = 96; SC.boatX = 454; SC.boatY = 96; SC.propA = 0; SC.far = -140;
    SC.netY = 68; SC.netX = 388; SC.cinch = 0; SC.shut = false; SC.reach = 0;
    A.dad = actor(MAN.dad, 410, 224, { beat: 1.3 });
    A.mom = actor(MAN.mom, 352, 248, { beat: 1.4, blush: true });
    A.bro = actor(MAN.bro, 316, 272, { beat: 2.0, blush: true });
    A.you = actor(MAN.you, 190, 292, { beat: 2.0, blush: true });
    SC.sch1 = makeSchool(9, 570, 176, 46, 0, 1, -46);
  },
  update(dt, bt) {
    Intro.scroll += 15 * dt;
    SC.boatY = SC.surfY + Math.sin(bt * 2.1) * 2;
    SC.boatRot = Math.sin(bt * 1.7) * 0.018;
    SC.propA += dt * 30;
    SC.far += 26 * dt;
    engine(dt, clamp(bt * 0.8, 0, 1)); churnSound(dt, 0.7);
    for (const k of ['dad', 'mom', 'you', 'bro']) { swim(A[k], dt); bounce(A[k], dt); A[k].blink = Intro.blink; }
    const look = ss(clamp(bt / 0.9, 0, 1));
    A.dad.exp = bt > 0.5 ? 'wide' : 'calm';
    A.bro.exp = bt > 0.5 ? 'wide' : 'calm';
    A.mom.exp = talking('mom') ? 'talk' : bt > 0.5 ? 'wide' : 'calm';
    A.you.exp = talking('you') ? 'talk' : bt > 4.4 ? 'sad' : 'wide';
    // the net comes down, settles over the three of them, and draws shut
    const dn = ss2(clamp((bt - 0.55) / 2.35, 0, 1));
    const up = inCube(clamp((bt - 3.45) / 2.15, 0, 1));
    SC.netY = lerp(lerp(68, 152, dn), -300, up);
    SC.cinch = 0.88 * ss(clamp((bt - 2.85) / 0.85, 0, 1));
    if (dn > 0.1 && dn < 1 && Math.random() < 11 * dt) FX.bubble(SC.netX + rand(-86, 86), SC.netY + rand(0, 46), 1, 1.5);
    if (!SC.shut && bt >= 2.95) {
      SC.shut = true; Intro.shake = 6;
      FX.foam(SC.netX, SC.netY + 40, 22, 1.1);
      FX.bubble(SC.netX, SC.netY + 60, 14, 2.0);
      kick(A.dad, 7); kick(A.mom, 7); kick(A.bro, 7);
      if (typeof Audio_ !== 'undefined') { Audio_.splash(2); Audio_.noise(0.34, 0.14, 900, 180); }
    }
    // the three inside ride the bag; before it lands they drift into it
    const inBag = clamp((bt - 1.9) / 1.0, 0, 1), ib = ss(inBag);
    const bagY = SC.netY + 78;
    A.dad.x = smooth(A.dad.x, lerp(410, SC.netX + 30, ib), 4, dt);
    A.dad.y = ib < 1 ? lerp(224, 246, ib) : bagY - 18 + Math.sin(bt * 5.2) * 3;
    A.dad.rot = smooth(A.dad.rot, ib < 1 ? 0 : -0.22 + Math.sin(bt * 4.6) * 0.16, 7, dt);
    A.mom.x = smooth(A.mom.x, lerp(352, SC.netX - 16, ib), 4, dt);
    A.mom.y = ib < 1 ? lerp(248, 262, ib) : bagY + 4 + Math.sin(bt * 4.4 + 1) * 3;
    A.mom.rot = smooth(A.mom.rot, ib < 1 ? 0.06 : 0.20 + Math.sin(bt * 4.0 + 1) * 0.16, 7, dt);
    A.bro.x = smooth(A.bro.x, lerp(316, SC.netX - 44, ib), 4, dt);
    A.bro.y = ib < 1 ? lerp(272, 280, ib) : bagY + 22 + Math.sin(bt * 5.8 + 2) * 3;
    A.bro.rot = smooth(A.bro.rot, ib < 1 ? -0.05 : -0.34 + Math.sin(bt * 5.2 + 2) * 0.20, 7, dt);
    if (bt > 3.0 && Math.random() < 16 * dt) FX.bubble(SC.netX + rand(-40, 40), bagY + rand(-20, 20), 1, 2.0);
    // the calf, left under it all, one flipper up
    const drift = ss(clamp((bt - 3.2) / 3.0, 0, 1));
    A.you.x = lerp(190, 232, drift) + Math.sin(bt * 0.8) * 4;
    A.you.y = lerp(292, 300, drift) + Math.sin(bt * 1.15) * 4;
    A.you.rot = smooth(A.you.rot, bt > 3.2 ? -0.16 : 0.02, 4, dt);
    A.you.beat = lerp(2.0, 0.9, drift);
    SC.reach = smooth(SC.reach, bt > 3.25 && bt < 5.6 ? 1 : 0, 4.5, dt);
    A.you.flipperA = 0.45 - SC.reach * 2.1;
    if (bt > 5.0 && Math.random() < 1.6 * dt) FX.bubble(A.you.x + 16, A.you.y - 6, 1, 0.5);
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'cold', grade: 'cold', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 330, shafts: 0.85, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    // the rest of the fleet, small, on the horizon
    ctx.save(); ctx.translate(R(SC.far), R(SC.surfY + 2)); ctx.scale(0.5, 0.5);
    ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay); ctx.restore();
    ctx.save(); ctx.translate(R(SC.far + 250), R(SC.surfY + 1)); ctx.scale(0.5, 0.5);
    ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay); ctx.restore();
    hullShade(ctx, SC.boatX - 20, SC.boatY + 26, 150, 150, 0.9);
    drawBoat(ctx, SC.boatX, SC.boatY, SC.boatRot, SC.propA, 1, Intro.t);
    drawRope(ctx, SC.boatX - 120, SC.boatY - 56, SC.netX, SC.netY + 4, 12, '#e8dcb4', '#8a7548');
    // the bag and the three in it live under the waterline only: once the
    // winch has them above it they are simply gone, which is the whole point
    ctx.save();
    ctx.beginPath(); ctx.rect(0, R(SC.surfY) + 1, 640, 360); ctx.clip();
    drawManatee(ctx, A.dad, Intro.t);
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    drawNet(ctx, { x: SC.netX, y: SC.netY, w: 196, h: 146, cinch: SC.cinch, t: Intro.t, sway: 6 });
    ctx.restore();
    drawManatee(ctx, A.you, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'cold', scroll: Intro.scroll, t: Intro.t, bedY: 330 });
  },
});

// ----------------------------------------------------------------- 3. ALONE
BEATS.push({
  name: 'alone', dur: 5.5,
  talk: [
    [3.40, 'otter', 'Whoa! Don\'t sink!'],
  ],
  anchor() { return [SC.ot.x + 6, SC.ot.y - 38, 1]; },
  enter() {
    A.you = actor(MAN.youBig, 302, 198, { beat: 0.70, exp: 'sad', tailAmp: 0.10, blush: true });
    SC.ot = { x: 474, y: 30, phase: 0, rot: 0, exp: 'surprised', flip: true, ride: true, sq: 0, sqv: 0, sx: 1, sy: 1, blink: false };
    SC.sch1 = makeSchool(7, 600, 140, 40, 0, 2, -15);
    SC.splash = false; SC.landed = false; SC.surfY = 62;
  },
  update(dt, bt) {
    Intro.scroll += 7 * dt;
    swim(A.you, dt); bounce(A.you, dt);
    A.you.blink = Intro.blink;
    // she settles, slowly, the way something gives up settles
    const sink = ss(clamp(bt / 2.6, 0, 1));
    A.you.x = 302 + Math.sin(bt * 0.34) * 5;
    A.you.y = lerp(198, 222, sink) + Math.sin(bt * 0.62) * 3;
    A.you.rot = smooth(A.you.rot, 0.10 * (1 - sink) + 0.03, 3, dt);
    // one slow bubble off her cheek: the only tear this cinematic gets
    if (bt > 1.15 && bt < 2.5 && Math.random() < 1.3 * dt) FX.bubble(A.you.x + 30, A.you.y - 10, 1, 0.35);
    if (!SC.splash && bt >= 2.62) {
      SC.splash = true;
      FX.drops(474, SC.surfY, 26, 1.0);
      FX.foam(474, SC.surfY + 4, 14, 1.0);
      FX.ring(474, SC.surfY + 6, 44, 0.45, '#ffffff');
      if (typeof Audio_ !== 'undefined') Audio_.splash(2);
    }
    // he comes in off the surface on a long decelerating arc
    const dive = clamp((bt - 2.62) / 1.15, 0, 1), e = outCube(dive);
    SC.ot.x = lerp(474, 394, e);
    SC.ot.y = lerp(SC.surfY - 6, 190, e);
    SC.ot.rot = TAU * 1.5 * (1 - (1 - dive) * (1 - dive)) * (dive < 1 ? 1 : 0) + (dive >= 1 ? Math.sin(bt * 2.2) * 0.08 : 0);
    SC.ot.phase += dt * (dive < 1 ? 7 : 2.0);
    if (dive > 0 && dive < 1 && Math.random() < 40 * dt) FX.bubble(SC.ot.x + rand(-6, 6), SC.ot.y + rand(-6, 6), 1, 2.2);
    if (!SC.landed && dive >= 1) {
      SC.landed = true;
      kick(SC.ot, 8); kick(A.you, 4);
      FX.sparkles(SC.ot.x, SC.ot.y - 4, 8, 52);
      FX.bubble(SC.ot.x, SC.ot.y, 8, 1.8);
      if (typeof Audio_ !== 'undefined') Audio_.tone(700, 0.08, 'triangle', 0.06, 260);
    }
    bounce(SC.ot, dt);
    SC.ot.blink = Intro.blink;
    SC.ot.exp = talking('otter') ? 'talk' : dive < 1 ? 'surprised' : 'happy';
    SC.ot.armNear = 0.9 + Math.sin(SC.ot.phase * 1.2) * 0.30;
    SC.ot.armFar = -0.9 - Math.sin(SC.ot.phase * 1.1) * 0.24;
    // she looks up at him
    A.you.exp = bt > 2.7 ? (bt > 3.3 ? 'wide' : 'wide') : 'sad';
    if (bt > 3.2) A.you.rot = smooth(A.you.rot, -0.06, 3, dt);
  },
  render(ctx) {
    backdrop(ctx, { mood: 'lagoon', grade: 'noon', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 306, shafts: 1, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    drawManatee(ctx, A.you, Intro.t);
    drawCapOtter(ctx, SC.ot, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'noon', scroll: Intro.scroll, t: Intro.t, bedY: 306 });
  },
});

// ----------------------------------------------------------------- 4. OTTER
BEATS.push({
  name: 'otter', dur: 8.5,
  talk: [
    [0.45, 'otter', 'Hey. Deep breath. In, out.'],
    [2.55, 'you', 'They took my family.'],
    [4.30, 'otter', 'Boats? I rob boats for fun.'],
    [6.35, 'otter', 'Come on. We get them back.'],
  ],
  anchor(who) {
    if (who === 'otter') return [SC.ot.x + 4, SC.ot.y - 38, 1];
    return [A.you.x + 16, A.you.y - 30, 1];
  },
  enter() {
    A.you = actor(MAN.youBig, 234, 226, { beat: 0.9, exp: 'sad', tailAmp: 0.14, blush: true });
    SC.ot = { x: 390, y: 198, phase: 0, rot: 0, exp: 'talk', flip: true, ride: true, sq: 0, sqv: 0, sx: 1, sy: 1 };
    SC.sch1 = makeSchool(8, 590, 130, 44, 0, 3, -18);
    SC.tap = false; SC.bump = false; SC.surfY = 72;
  },
  update(dt, bt) {
    Intro.scroll += 9 * dt;
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    A.you.blink = Intro.blink; SC.ot.blink = Intro.blink;
    A.you.x = smooth(A.you.x, 234, 3, dt) + Math.sin(bt * 0.5) * 0.4;
    A.you.y = 226 + Math.sin(bt * 0.66) * 4;
    A.you.rot = smooth(A.you.rot, bt > 6.6 ? -0.10 : 0.04, 3, dt);
    A.you.exp = talking('you') ? 'talk' : bt > 6.5 ? 'wide' : bt > 2.4 ? 'sad' : 'calm';
    // he never holds still: a slow figure of eight, with two errands in it
    const tap = clamp((bt - 1.65) / 0.55, 0, 1);              // out to her nose
    const back = clamp((bt - 2.30) / 0.75, 0, 1);             // and away again
    const near = clamp((bt - 6.30) / 0.90, 0, 1);             // alongside, at the end
    const hover = [390 + Math.sin(bt * 0.95) * 34, 198 + Math.sin(bt * 1.42) * 15];
    const nose = [304, 210], side = [334, 234];
    let ox = hover[0], oy = hover[1];
    if (tap > 0 && back < 1) {
      const k = ss(tap) * (1 - ss(back));
      ox = lerp(ox, nose[0], k); oy = lerp(oy, nose[1], k);
    }
    if (near > 0) { const k = ss(near); ox = lerp(ox, side[0], k); oy = lerp(oy, side[1], k); }
    SC.ot.x = smooth(SC.ot.x, ox, 9, dt);
    SC.ot.y = smooth(SC.ot.y, oy, 9, dt);
    SC.ot.phase += dt * 2.2;
    // the show-off spin, between his two boasts
    const spin = clamp((bt - 4.95) / 0.85, 0, 1);
    SC.ot.rot = TAU * ss2(spin) + Math.sin(bt * 1.8) * 0.07;
    SC.ot.exp = talking('otter') ? 'talk' : spin > 0 && spin < 1 ? 'happy' : bt > 6.3 ? 'happy' : 'idle';
    SC.ot.armNear = 0.85 + Math.sin(SC.ot.phase * 1.3) * 0.35 + (near > 0 ? -ss(near) * 1.5 : 0);
    SC.ot.armFar = -0.85 - Math.sin(SC.ot.phase * 1.1) * 0.28;
    if (spin > 0.05 && spin < 0.95 && Math.random() < 14 * dt) FX.sparkles(SC.ot.x + rand(-12, 12), SC.ot.y + rand(-10, 10), 1, 12);
    if (!SC.tap && tap >= 1) {
      SC.tap = true;
      kick(A.you, 5); kick(SC.ot, 5);
      FX.sparkles(A.you.x + 40, A.you.y - 6, 4, 34);
      if (typeof Audio_ !== 'undefined') Audio_.tone(880, 0.06, 'triangle', 0.05, 160);
    }
    if (!SC.bump && spin >= 1) {
      SC.bump = true;
      FX.notes(SC.ot.x + 14, SC.ot.y - 24, 3);
      kick(SC.ot, 6);
      if (typeof Audio_ !== 'undefined') Audio_.tone(600, 0.08, 'square', 0.05, 300);
    }
    if (bt > 7.05 && bt < 7.15) FX.hearts((A.you.x + SC.ot.x) / 2 + 20, (A.you.y + SC.ot.y) / 2 - 20, 3);
    if (Math.random() < 1.1 * dt) FX.bubble(SC.ot.x + rand(-8, 8), SC.ot.y - 12, 1, 1.1);
    if (Math.random() < 0.5 * dt) FX.bubble(A.you.x + 34, A.you.y - 10, 1, 0.5);
  },
  render(ctx) {
    backdrop(ctx, { mood: 'dawn', grade: 'dawn', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 316, shafts: 1, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    drawManatee(ctx, A.you, Intro.t);
    drawCapOtter(ctx, SC.ot, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'dawn', scroll: Intro.scroll, t: Intro.t, bedY: 316 });
  },
});

// ------------------------------------------------------------- 5. TOGETHER
BEATS.push({
  name: 'together', dur: 7.0,
  talk: [
    [0.85, 'you', 'Okay.'],
    [2.30, 'otter', 'THAT is the spirit. Onwards!'],
  ],
  anchor(who) {
    if (who === 'otter') return [SC.ot.x + 8, SC.ot.y - 34, 1];
    return [A.you.x - 18, A.you.y - 32, 1];
  },
  enter() {
    A.you = actor(MAN.youBig, 250, 214, { beat: 1.3, exp: 'calm', tailAmp: 0.30, blush: true });
    SC.ot = { x: 300, y: 152, phase: 0, rot: 0, exp: 'happy', flip: false, ride: true, sq: 0, sqv: 0, sx: 1, sy: 1 };
    SC.sch1 = makeSchool(12, 560, 168, 64, 0, 1, -28);
    SC.sch2 = makeSchool(7, 660, 262, 42, 1, 0, -24);
    SC.on = false; SC.surfY = 82; SC.spd = 26;
  },
  update(dt, bt) {
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    A.you.blink = Intro.blink; SC.ot.blink = Intro.blink;
    // he climbs aboard, then they go
    const land = ss2(clamp(bt / 1.25, 0, 1));
    const ride = [A.you.x + 4, A.you.y - 21];
    SC.ot.x = smooth(SC.ot.x, lerp(300, ride[0], land), 11, dt);
    SC.ot.y = smooth(SC.ot.y, lerp(152, ride[1], land), 11, dt);
    SC.ot.phase += dt * (2 + SC.spd * 0.012);
    SC.ot.rot = smooth(SC.ot.rot, A.you.rot, 9, dt);
    SC.ot.exp = talking('otter') ? 'talk' : 'happy';
    SC.ot.armNear = 0.95 + Math.sin(SC.ot.phase * 1.4) * 0.28 - (bt > 2.4 ? 1.7 : 0);
    SC.ot.armFar = -0.95 - Math.sin(SC.ot.phase * 1.2) * 0.22;
    if (!SC.on && land >= 0.999) {
      SC.on = true;
      kick(A.you, 6); kick(SC.ot, 8);
      FX.foam(SC.ot.x, SC.ot.y + 10, 12, 0.8);
      FX.sparkles(SC.ot.x, SC.ot.y - 6, 6, 40);
      if (typeof Audio_ !== 'undefined') Audio_.tone(520, 0.08, 'triangle', 0.06, 280);
    }
    // the run: it builds, it does not switch on
    SC.spd = smooth(SC.spd, bt > 2.45 ? 320 : 26, 1.35, dt);
    Intro.scroll += SC.spd * dt;
    A.you.beat = lerp(1.3, 7.4, clamp(SC.spd / 320, 0, 1));
    A.you.x = smooth(A.you.x, 250, 3, dt);
    A.you.y = lerp(214, 196, ss(clamp((bt - 2.4) / 2.6, 0, 1))) + Math.sin(bt * 2.1) * 5 * clamp(SC.spd / 160, 0.3, 1);
    A.you.rot = smooth(A.you.rot, Math.sin(bt * 2.1) * 0.07 - clamp(SC.spd / 320, 0, 1) * 0.06, 8, dt);
    A.you.exp = talking('you') ? 'talk' : SC.spd > 140 ? 'wide' : 'calm';
    if (SC.spd > 90 && Math.random() < 34 * dt) FX.bubble(A.you.x - 48, A.you.y + rand(-8, 10), 1, 2.4);
    if (bt > 2.6 && Math.random() < 1.9 * dt) FX.sparkles(A.you.x - rand(30, 80), A.you.y + rand(-22, 22), 1, 16);
    if (bt > 3.2 && Math.random() < 0.8 * dt) FX.hearts(A.you.x - rand(20, 60), A.you.y - rand(14, 30), 1);
    // out into the open on a warm bloom, never a cut to black
    if (bt > 5.85) Intro.fade = ss(clamp((bt - 5.85) / 1.0, 0, 1));
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'dawn', grade: 'dawn', scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 330, shafts: 1, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    drawSchool(ctx, SC.sch2, Intro.t, Intro.dt);
    if (SC.spd > 70) {
      const a = clamp((SC.spd - 70) / 250, 0, 1);
      speedLines(ctx, A.you.x - 86, A.you.y, R(8 + a * 14), R(34 + a * 54), -1, rgbaq('#f2fdff', 0.24 + a * 0.36), 7);
      speedLines(ctx, A.you.x - 130, A.you.y, R(5 + a * 8), R(26 + a * 40), -1, rgbaq('#bfeeff', 0.14 + a * 0.24), 21);
    }
    drawManatee(ctx, A.you, Intro.t);
    drawCapOtter(ctx, SC.ot, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'dawn', scroll: Intro.scroll, t: Intro.t, bedY: 330 });
  },
});

// ============================================================== THE  INTRO =
const Intro = {
  t: 0, bt: 0, dt: 1 / 60, beat: 0, done: false,
  scroll: 0, shake: 0, fade: 0, fadeCol: '#fff3d6', grace: 0.35, blink: false, blinkT: 2,
  reset() {
    buildIntroArt();
    this.t = 0; this.bt = 0; this.dt = 1 / 60; this.beat = 0; this.done = false;
    this.scroll = 0; this.shake = 0; this.fade = 0; this.grace = 0.4;
    this.blink = false; this.blinkT = 2;
    sndT = 0; sndT2 = 0;
    FX.clear();
    sayReset();
    for (const k in SC) delete SC[k];
    if (BUILT && BEATS[0].enter) BEATS[0].enter();
  },
  // The cinematic can no longer be skipped; kept as a no-op so older
  // callers (and any saved bindings) do not throw.
  skip() { },
  next() {
    this.beat++; this.bt = 0; this.fade = 0; this.scroll = 0; this.shake = 0;
    FX.clear();
    sayReset();
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
    // It reads no input at all -- game.js holds the only way past it.
    this.shake = Math.max(0, this.shake - dt * 30);
    const b = BEATS[this.beat];
    if (!b) { this.done = true; return; }
    // speech first, so a beat can pose its actors off who is talking
    sayUpdate(b, this.bt, dt);
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
    // Beat to beat, the picture dissolves through daylight instead of cutting.
    // A cut between two compositions is the harshest step a cinematic has and
    // this one has four of them; 0.22s of sun on either side hides them all.
    const edge = 0.18;
    const inK = this.beat === 0 ? 1 : clamp(this.bt / edge, 0, 1);
    const outK = clamp((b.dur - this.bt) / edge, 0, 1);
    const wash = Math.max(this.fade, 1 - ss(Math.min(inK, outK)));
    if (wash > 0) { ctx.fillStyle = rgbaq(this.fadeCol, wash); ctx.fillRect(0, 0, 640, 360); }
    if (this.t < 0.9) { ctx.fillStyle = rgbaq('#000000', 1 - ss(this.t / 0.9)); ctx.fillRect(0, 0, 640, 360); }
    letterbox(ctx);
    sayRender(ctx, b, this.bt);
    // beat pips
    if (this.t > 0.6) {
      const n = BEATS.length, w = 7, gap = 13;
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
global.__introDebug = { MAN: MAN, A: A, SC: SC, SAY: SAY, MARK: MARK, drawManatee: drawManatee, drawNet: drawNet, drawCapOtter: drawCapOtter, get BOAT() { return BOAT; } };
})(typeof window !== 'undefined' ? window : this);
