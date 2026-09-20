// ===========================================================================
//  CHARACTERS — Captain Otter (sea rascal) & the War Manatee (ocean tank)
//  Procedural rounded-form rasterizer + hand-drawn articulated parts, so the
//  pair can be animated (expressions, aiming, rolling, squash & stretch).
// ===========================================================================

// ---- character palette ----------------------------------------------------
const CPAL = {
  out:  '#1a1220',   // universal near-black outline
  out2: '#2c2436',
  // otter fur
  fur:  '#c8703c', furD: '#9c4d24', furDD: '#6d3316', furL: '#e0975c', furLL: '#f0b87e',
  cream:'#f2ddb8', creamD:'#d4b98d',
  // tricorn hat
  hat:  '#3d4767', hatD: '#28314c', hatL: '#586590', hatLL:'#7684ad',
  // cape
  cape: '#7c3049', capeD:'#572034', capeL:'#9d4260',
  // leather
  lea:  '#6d4527', leaD: '#472c17', leaL: '#8f6038',
  // metal
  met:  '#63728d', metD: '#45526b', metDD:'#2a3342', metL: '#93a4c0', metLL:'#cdd9ea',
  // brass / gold
  gold: '#e0a838', goldD:'#a87a1e', goldL:'#f8dc86',
  // wood
  wood: '#b57d3f', woodD:'#89592a', woodDD:'#5a3818', woodL:'#d6a05e',
  // manatee hide
  man:  '#67646d', manD: '#4b4851', manDD:'#332f39', manL: '#827e88', manLL:'#9d99a3',
  belly:'#9fadbd',
  // accents
  white:'#f4f7fb', bone: '#e8e4d8', blood:'#c4202c', bloodD:'#7a0d16',
  eye:  '#241a12', shine:'#ffffff',
  smoke:'#b9b3ad', ember:'#ff8b2e', emberL:'#ffd27a',
};

// ---- tiny raster helpers --------------------------------------------------
function newCan(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function spriteFrom(c, ax, ay) { return { c, w: c.width, h: c.height, ax: ax ?? c.width / 2, ay: ay ?? c.height / 2 }; }

// ===========================================================================
//  HI-RES ART  (DETAIL x)
//  Every character/boat canvas in this file is rasterized at DETAIL art pixels
//  per world unit, so one art pixel lands on (about) one screen pixel instead
//  of being blown up. The sprite record still reports its size in WORLD units
//  — w/h/ax/ay are unchanged from the old build — so every call site in the
//  rest of the codebase keeps working with the offsets it already has.
//
//  The bridge is here: a hi-res canvas remembers that it is hi-res, and the
//  3-argument `drawImage(img, dx, dy)` (the only form used for sprites) draws
//  it through a 1/DETAIL scale. Callers that bake a copy into `can(s.w, s.h)`
//  therefore still get a correctly-sized copy, and `drawImage(c, sx, sy, sw,
//  sh, dx, dy, dw, dh)` (the warm-up path) is left completely alone.
// ===========================================================================
const AS = DETAIL;                 // art pixels per world unit
const HIRES = new WeakSet();
function newCanHi(w, h) { const c = newCan(w * AS, h * AS); HIRES.add(c); return c; }
// ax/ay are given in ART pixels; the record exposes them in world units.
function spriteFromHi(c, ax, ay) {
  HIRES.add(c);
  return { c, w: c.width / AS, h: c.height / AS, ax: (ax ?? c.width / 2) / AS, ay: (ay ?? c.height / 2) / AS, hi: 1 };
}
let RAWDI = CanvasRenderingContext2D.prototype.drawImage;
(function patchDrawImage() {
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__hiresPatched) { RAWDI = proto.__hiresRawDraw; return; }
  const di = RAWDI;
  const inv = 1 / AS;
  proto.drawImage = function (img, a, b, c, d, e, f, g, h) {
    if (c === undefined) {
      if (HIRES.has(img)) {
        this.save(); this.scale(inv, inv); di.call(this, img, a * AS, b * AS); this.restore(); return;
      }
      return di.call(this, img, a, b);
    }
    if (e === undefined) return di.call(this, img, a, b, c, d);
    return di.call(this, img, a, b, c, d, e, f, g, h);
  };
  proto.__hiresPatched = 1; proto.__hiresRawDraw = di;
})();
// Draw a hi-res canvas 1:1 into another hi-res canvas (skips the bridge).
function drawRaw(ctx, img, x, y) { RAWDI.call(ctx, img, x, y); }
// A tint that keeps the hi-res canvas hi-res (the shared tintSprite would bake
// a world-resolution copy, because it sizes the copy from s.w/s.h).
function tintHi(s, color, alpha) {
  const c = newCan(s.c.width, s.c.height), ctx = c.getContext('2d');
  drawRaw(ctx, s.c, 0, 0);
  ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height); ctx.globalAlpha = 1;
  HIRES.add(c);
  return { c, w: s.w, h: s.h, ax: s.ax, ay: s.ay, hi: 1 };
}

// A soft "blob" field made of ellipses along a spine. Returns {field,w,h}.
// Each lobe: {x,y,rx,ry,rot?}  field value >0 inside, peaks at the core.
function blobField(w, h, lobes) {
  const f = new Float32Array(w * h);
  for (const L of lobes) {
    const cs = Math.cos(L.rot || 0), sn = Math.sin(L.rot || 0);
    const x0 = Math.max(0, Math.floor(L.x - L.rx - 2)), x1 = Math.min(w - 1, Math.ceil(L.x + L.rx + 2));
    const y0 = Math.max(0, Math.floor(L.y - L.ry - 2)), y1 = Math.min(h - 1, Math.ceil(L.y + L.ry + 2));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - L.x, dy = y - L.y;
      const u = (dx * cs + dy * sn) / L.rx, v = (-dx * sn + dy * cs) / L.ry;
      const r2 = u * u + v * v;
      if (r2 >= 1) continue;
      const val = 1 - r2;                 // smooth dome
      const i = y * w + x;
      if (val > f[i]) f[i] = val;
    }
  }
  return f;
}

// Shade a blob field into a rounded, posterized pixel form with an outline.
// ramp = array of colours from darkest to lightest.
// Box-blur the height field so the union of lobes reads as ONE smooth body
// instead of a chain of separate domes. The crisp mask still comes from `f`.
function smoothField(w, h, f, passes = 3) {
  let a = Float32Array.from(f), b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const y0 = y * w, ym = y > 0 ? y0 - w : y0, yp = y < h - 1 ? y0 + w : y0;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : x, xp = x < w - 1 ? x + 1 : x;
        b[y0 + x] = (a[ym + xm] + a[ym + x] + a[ym + xp] +
                     a[y0 + xm] + a[y0 + x] * 2 + a[y0 + xp] +
                     a[yp + xm] + a[yp + x] + a[yp + xp]) / 10;
      }
    }
    const t = a; a = b; b = t;
  }
  return a;
}

function shadeBlob(w, h, f, ramp, opts = {}) {
  const c = newCan(w, h), ctx = c.getContext('2d');
  const fs = smoothField(w, h, f, opts.smooth ?? 3);
  const img = ctx.createImageData(w, h), d = img.data;
  const lx = opts.lx ?? -0.55, ly = opts.ly ?? -0.72;   // light direction
  const outline = hexToRgb(opts.outline || CPAL.out);
  const rgb = ramp.map(hexToRgb);
  const bands = rgb.length;
  const inside = i => f[i] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, p = i * 4;
    if (!inside(i)) continue;
    // edge test -> outline
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
      !inside(i - 1) || !inside(i + 1) || !inside(i - w) || !inside(i + w);
    if (edge) { d[p] = outline[0]; d[p + 1] = outline[1]; d[p + 2] = outline[2]; d[p + 3] = 255; continue; }
    // one smooth dome over the whole form -> normal
    const hgt = Math.sqrt(Math.max(0, fs[i]));
    const gx = Math.sqrt(Math.max(0, fs[i + 1])) - Math.sqrt(Math.max(0, fs[i - 1]));
    const gy = Math.sqrt(Math.max(0, fs[i + w])) - Math.sqrt(Math.max(0, fs[i - w]));
    let nl = (-gx * lx - gy * ly) * 6.2 + hgt * 0.80;
    // gentle rim light on the lower-right to separate from the water
    const rim = (gx * 0.5 + gy * 0.5) * 2.4;
    if (rim > 0.10) nl += rim * 0.5;
    let b = Math.floor((nl * (opts.contrast ?? 0.80) + (opts.lift ?? 0.22)) * bands);
    if (b < 0) b = 0; else if (b >= bands) b = bands - 1;
    const col = rgb[b];
    d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { c, ctx, f };
}

// stamp a tiny string-row sprite onto a ctx at x,y using CPAL keys
function stamp(ctx, rows, x, y, map) {
  for (let r = 0; r < rows.length; r++) for (let q = 0; q < rows[r].length; q++) {
    const ch = rows[r][q]; if (ch === '.' || ch === ' ') continue;
    const col = map[ch]; if (!col) continue;
    ctx.fillStyle = col; ctx.fillRect(x + q, y + r, 1, 1);
  }
}
function px(ctx, col, x, y, w = 1, h = 1) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w, h); }
// ---- detail passes -------------------------------------------------------
// These add the sub-pixel information an upscaled silhouette cannot carry:
// a one-pixel lit rim along every top edge and a shadow along every bottom
// edge, and a sparse, colour-keyed texture grain. Both work on the raster, so
// they never change a silhouette and never introduce a seam.
function _rgbKey(hex) { const [r, g, b] = hexToRgb(hex); return (r << 16) | (g << 8) | b; }
function pixelPass(ctx, w, h, fn) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  fn(d, w, h);
  ctx.putImageData(img, 0, 0);
}
function edgeLight(ctx, w, h, litHex, shadeHex, opts = {}) {
  const lit = hexToRgb(litHex), sh = hexToRgb(shadeHex);
  const outKey = _rgbKey(opts.outline || CPAL.out), out2Key = _rgbKey(CPAL.out2);
  pixelPass(ctx, w, h, (d) => {
    const src = Uint8ClampedArray.from(d);
    const at = (x, y) => (y * w + x) * 4;
    const isVoid = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return true;
      const i = at(x, y); if (src[i + 3] < 30) return true;
      const k = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      return k === outKey || k === out2Key;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = at(x, y); if (src[i + 3] < 30) continue;
      const k = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      if (k === outKey || k === out2Key) continue;
      let c = null;
      if (isVoid(x, y - 1)) c = lit;
      else if (isVoid(x, y + 1)) c = sh;
      if (!c) continue;
      d[i] = (src[i] * 0.45 + c[0] * 0.55) | 0;
      d[i + 1] = (src[i + 1] * 0.45 + c[1] * 0.55) | 0;
      d[i + 2] = (src[i + 2] * 0.45 + c[2] * 0.55) | 0;
    }
  });
}
// rules: [fromHex, toHex, probability, salt]
function texture(ctx, w, h, rules) {
  const R = rules.map(r => ({ from: _rgbKey(r[0]), to: hexToRgb(r[1]), p: r[2], s: r[3] || 1 }));
  pixelPass(ctx, w, h, (d) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (d[i + 3] < 30) continue;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      for (const r of R) {
        if (k !== r.from) continue;
        if (hash2(x * 7 * r.s, y * 13 + r.s * 31) > 1 - r.p) { d[i] = r.to[0]; d[i + 1] = r.to[1]; d[i + 2] = r.to[2]; }
        break;
      }
    }
  });
}
// Stamp a 1x row-string at AS x, so a silhouette authored at the old size is
// reproduced exactly and the new pixels go into detail passes drawn over it.
function stampUp(ctx, rows, x, y, map) {
  for (let r = 0; r < rows.length; r++) for (let q = 0; q < rows[r].length; q++) {
    const ch = rows[r][q]; if (ch === '.' || ch === ' ') continue;
    const col = map[ch]; if (!col) continue;
    ctx.fillStyle = col; ctx.fillRect(x + q * AS, y + r * AS, AS, AS);
  }
}

// ===========================================================================
//  WAR MANATEE  — top-down, facing RIGHT
// ===========================================================================
const MAN_W = 156, MAN_H = 76, MAN_CX = 80, MAN_CY = 38;

function buildManateeBody(armored) {
  // classic manatee silhouette: fat rounded barrel, narrow peduncle, blunt head
  // authored at AS art pixels per world unit (see spriteFromHi)
  const lobes = [
    { x: 12,  y: 38, rx: 10.4, ry: 16.4 },  // fluke trailing edge
    { x: 22,  y: 38, rx: 12.8, ry: 18.4 },  // spade fluke
    { x: 32,  y: 38, rx: 13.2, ry: 16.0 },
    { x: 46,  y: 38, rx: 12.8, ry: 12.0 },  // peduncle waist
    { x: 58,  y: 38, rx: 20.0, ry: 20.0 },
    { x: 72,  y: 38, rx: 26.0, ry: 27.0 },  // widest belly
    { x: 88,  y: 38, rx: 26.0, ry: 26.0 },
    { x: 104, y: 38, rx: 22.0, ry: 22.0 },  // shoulders
    { x: 118, y: 38, rx: 17.2, ry: 18.0 },  // head
    { x: 128, y: 38, rx: 12.8, ry: 13.6 },  // muzzle
    { x: 134, y: 38, rx: 8.4,  ry: 9.2 },   // snout tip
  ];
  const f = blobField(MAN_W, MAN_H, lobes);
  const ramp = [CPAL.manDD, CPAL.manD, CPAL.man, CPAL.manL, CPAL.manLL];
  const { c, ctx } = shadeBlob(MAN_W, MAN_H, f, ramp, { outline: CPAL.out });
  const solid = (x, y, lim) => { const i = y * MAN_W + x; return i >= 0 && i < f.length && x >= 0 && x < MAN_W && f[i] > (lim === undefined ? 0.04 : lim); };

  // ---- hide: manatees have transverse skin folds, not granite speckle.
  // At 2x each fold is a shaded crease (dark core, lit upper lip) instead of
  // a single grey pixel.
  for (const fx of [52, 66, 98, 112]) {
    for (let y = 4; y < MAN_H - 4; y++) {
      const bend = Math.round(Math.sin((y - 38) / 38 * 1.2) * 4.4);
      const x = fx + bend;
      if (!solid(x, y, 0.10)) continue;
      px(ctx, CPAL.manD, x, y, 2, 1);
      px(ctx, CPAL.manDD, x + 1, y);
      if (solid(x, y, 0.4)) px(ctx, CPAL.manL, x - 1, y);
    }
  }
  // fine cross-hatch of wrinkles over the shoulders — only visible at 2x
  for (let y = 8; y < MAN_H - 8; y++) for (let x = 44; x < 124; x++) {
    if (!solid(x, y, 0.55)) continue;
    if (((x * 3 + y * 5) % 23) === 0 && hash2(x, y) > 0.55) px(ctx, CPAL.manD, x, y, 2, 1);
  }
  // barnacles: a rim, a lit crown and a shadow, instead of one stray pixel
  for (let y = 8; y < MAN_H - 8; y++) for (let x = 8; x < MAN_W - 8; x++) {
    if (!solid(x, y, 0.25)) continue;
    if (hash2(x * 7, y * 11) > 0.9965) {
      px(ctx, CPAL.manDD, x - 1, y - 1, 4, 4);
      px(ctx, CPAL.manLL, x, y, 2, 2);
      px(ctx, CPAL.bone, x, y);
      px(ctx, CPAL.manDD, x + 1, y + 2, 2, 1);
    }
  }
  // old propeller scars: paired pale gouges with a dark lower lip
  for (let i = 0; i < 11; i++) {
    px(ctx, CPAL.manLL, 64 + i * 3, 16 + i * 2, 2, 1); px(ctx, CPAL.manDD, 64 + i * 3, 17 + i * 2, 2, 1);
  }
  for (let i = 0; i < 9; i++) {
    px(ctx, CPAL.manLL, 80 + i * 3, 56 - i * 2, 2, 1); px(ctx, CPAL.manDD, 80 + i * 3, 57 - i * 2, 2, 1);
  }
  // fluke ridges fanning from the peduncle, with a lit edge on each
  for (let i = -6; i <= 6; i++) {
    if (!i) continue;
    for (let x = 6; x < 42; x++) {
      const y = Math.round(38 + i * 2.1 + (42 - x) * i * 0.09);
      if (!solid(x, y, 0.05)) continue;
      px(ctx, CPAL.manD, x, y);
      if ((x & 3) === 0) px(ctx, CPAL.manL, x, y - 1);
    }
  }
  for (let i = 0; i < 9; i++) px(ctx, CPAL.manLL, 9 + (i & 1), 26 + i * 3, 1, 2);

  // ---- head: eyes set wide, whisker pad, nostrils ------------------------
  // The original features, doubled, with the sub-pixels spent on an iris, a
  // lid and a lit brow rather than on making anything bigger.
  for (const ey of [20, 44]) {
    // heavy-lidded manatee eye: pale lid ring, amber iris, black pupil, glint
    stamp(ctx, [
      '..kkkkkkkk..',
      '.kLLLLLLLLk.',
      'kLLaaaaaaLLk',
      'kLaaaeeaaaLk',
      'kLaaeeeeaaLk',
      'kLaaeeeeaaLk',
      'kLaaaeeaaaLk',
      'kLLaaaaaaLLk',
      '.kLLLLLLLLk.',
      '..kkkkkkkk..',
    ], 117, ey, { k: CPAL.out, L: CPAL.manLL, a: '#5c4326', e: CPAL.eye });
    px(ctx, CPAL.shine, 121, ey + 3, 2, 2);
    px(ctx, CPAL.manL, 118, ey - 1, 10, 1);
    px(ctx, CPAL.manDD, 118, ey + 10, 10, 1);
  }
  stampUp(ctx, [
    '..kkkk..',
    '.kWWWWk.',
    'kWWwwWWk',
    'kWwwwwWk',
    'kWWwwWWk',
    '.kWWWWk.',
    '..kkkk..',
  ], 126, 32, { k: CPAL.out, W: CPAL.manL, w: CPAL.manD });
  // dimples in the pad, a lit upper lip and a shaded lower one
  for (let r = 0; r < 2; r++) for (let q = 0; q < 3; q++) px(ctx, CPAL.manDD, 132 + q * 3, 37 + r * 3);
  px(ctx, CPAL.manLL, 129, 33, 10, 1);
  px(ctx, CPAL.manDD, 129, 44, 10, 1);
  // nostrils: slits with a lit upper edge
  px(ctx, CPAL.out, 137, 34, 3, 3); px(ctx, CPAL.manLL, 137, 33, 3, 1);
  px(ctx, CPAL.out, 137, 43, 3, 3); px(ctx, CPAL.manLL, 137, 42, 3, 1);
  // whisker stubble, kept inside the muzzle where it belongs
  for (const [wx, wy] of [[138, 30], [141, 32], [138, 47], [141, 45], [141, 36], [141, 42]])
    px(ctx, CPAL.bone, wx, wy, 3, 1);

  if (armored) {
    // ---- two riveted steel back plates, leaving plenty of hide showing
    const plates = [[62, 16, 20, 46], [84, 18, 18, 42]];
    for (const [pxx, pyy, pw, ph] of plates) {
      for (let y = pyy; y < pyy + ph; y++) for (let x = pxx; x < pxx + pw; x++) {
        if (!solid(x, y)) continue;
        const top = y < pyy + 4, bot = y > pyy + ph - 6, lef = x < pxx + 4;
        let col = top ? CPAL.met : bot ? CPAL.metDD : lef ? CPAL.metD : CPAL.met;
        if (y < pyy + 2) col = CPAL.metL;
        // hammered-plate mottle, one pixel at a time
        if (!top && !bot && hash2(x * 5, y * 3) > 0.91) col = CPAL.metD;
        if (!top && !bot && hash2(x * 13, y * 7) > 0.975) col = CPAL.metL;
        px(ctx, col, x, y);
      }
      // rolled edges
      for (let y = pyy; y < pyy + ph; y++) {
        if (solid(pxx, y)) { px(ctx, CPAL.out2, pxx, y); px(ctx, CPAL.metD, pxx + 1, y); }
        if (solid(pxx + pw - 1, y)) { px(ctx, CPAL.out2, pxx + pw - 1, y); px(ctx, CPAL.metDD, pxx + pw - 2, y); }
      }
      // rivets: dome + highlight + drop shadow
      for (let y = pyy + 4; y < pyy + ph - 3; y += 8) {
        for (const rx of [pxx + 2, pxx + pw - 4]) {
          px(ctx, CPAL.metDD, rx - 1, y - 1, 4, 4);
          px(ctx, CPAL.metL, rx, y, 2, 2);
          px(ctx, CPAL.metLL, rx, y);
          px(ctx, CPAL.out2, rx + 1, y + 2, 2, 1);
        }
      }
      // battle scratches across the face of the plate
      for (let i = 0; i < 6; i++) px(ctx, CPAL.metLL, pxx + 5 + i, pyy + 12 + i * 2, 2, 1);
      for (let i = 0; i < 4; i++) px(ctx, CPAL.metDD, pxx + 7 + i * 2, pyy + ph - 12 - i, 2, 1);
    }
    // ---- leather harness straps with stitching down both edges
    for (const sx of [54, 108]) {
      for (let y = 4; y < MAN_H - 4; y++) {
        if (!solid(sx, y)) continue;
        px(ctx, CPAL.leaD, sx, y); px(ctx, CPAL.lea, sx + 1, y, 2, 1); px(ctx, CPAL.leaD, sx + 3, y);
        if ((y & 3) === 1) { px(ctx, CPAL.leaL, sx + 1, y); px(ctx, CPAL.creamD, sx, y); px(ctx, CPAL.creamD, sx + 3, y); }
      }
      // brass buckle with a tongue and two holes
      px(ctx, CPAL.goldD, sx - 1, 33, 6, 10);
      px(ctx, CPAL.gold, sx, 34, 4, 8);
      px(ctx, CPAL.goldL, sx, 34, 4, 2);
      px(ctx, CPAL.out, sx + 1, 36, 2, 4);
      px(ctx, CPAL.out, sx + 1, 30, 2, 2); px(ctx, CPAL.out, sx + 1, 44, 2, 2);
    }
    // ---- shoulder spikes, bevelled
    stamp(ctx, [
      '....kk....',
      '...kLLk...',
      '..kLMMLk..',
      '.kLMMMMLk.',
      'kLMMMMMMLk',
      'kMMmmmmMMk',
      'kkkkkkkkkk',
    ], 90, 6, { k: CPAL.out, M: CPAL.met, L: CPAL.metLL, m: CPAL.metD });
    stamp(ctx, [
      'kkkkkkkkkk',
      'kMMmmmmMMk',
      'kLMMMMMMLk',
      '.kLMMMMLk.',
      '..kLMMLk..',
      '...kLLk...',
      '....kk....',
    ], 90, 63, { k: CPAL.out, M: CPAL.met, L: CPAL.metLL, m: CPAL.metD });
    // ---- brow plate with a brass boss and four rivets
    stamp(ctx, [
      '..kkkkkkkkkkkk..',
      '.kLLLLLLLLLLLLk.',
      'kLMMMMMMMMMMMMLk',
      'kMMMMMMMMMMMMMMk',
      'kMMMMMMMMMMMMMMk',
      'kMMMMMMMMMMMMMMk',
      'kMMMMMMMMMMMMMMk',
      'kmMMMMMMMMMMMMmk',
      'kmmmmmmmmmmmmmmk',
      '.kkkkkkkkkkkkkk.',
    ], 104, 30, { k: CPAL.out, M: CPAL.metD, L: CPAL.met, m: CPAL.metDD });
    px(ctx, CPAL.goldD, 109, 35, 8, 10); px(ctx, CPAL.gold, 110, 36, 6, 8);
    px(ctx, CPAL.goldL, 110, 36, 6, 2); px(ctx, CPAL.goldL, 110, 36, 2, 6);
    for (const [rx, ry] of [[106, 33], [120, 33], [106, 44], [120, 44]]) {
      px(ctx, CPAL.metDD, rx, ry, 3, 3); px(ctx, CPAL.metL, rx, ry, 2, 2);
    }
  }
  return spriteFromHi(c, MAN_CX, MAN_CY);
}

// ---- saddle (sits mid-back, the otter perches here) -----------------------
function buildSaddle() {
  const W = 44, H = 40, c = newCan(W, H), ctx = c.getContext('2d');
  stampUp(ctx, [
    '...kkkkkkkkkkkk...',
    '..kLLLLLLLLLLLLk..',
    '.kLllllllllllllLk.',
    'kLllddddddddddllLk',
    'kLlddDDDDDDDDddlLk',
    'kLldDDDDDDDDDDdlLk',
    'kLldDDDDDDDDDDdlLk',
    'kLlddDDDDDDDDddlLk',
    'kLllddddddddddllLk',
    '.kLllllllllllllLk.',
    '..kLLLLLLLLLLLLk..',
    '...kkkkkkkkkkkk...',
  ], 4, 8, { k: CPAL.out, L: CPAL.leaL, l: CPAL.lea, d: CPAL.leaD, D: '#3a2412' });
  // a running stitched seam inside the rolled rim, both sides
  for (let x = 10; x < 34; x++) {
    if ((x & 1) === 0) { px(ctx, CPAL.cream, x, 13); px(ctx, CPAL.creamD, x, 14); px(ctx, CPAL.cream, x, 33); px(ctx, CPAL.creamD, x, 34); }
  }
  for (let y = 17; y < 31; y++) {
    if ((y & 1) === 0) { px(ctx, CPAL.creamD, 9, y); px(ctx, CPAL.creamD, 34, y); }
  }
  // brass studs down both flanks: dome, highlight, drop shadow
  for (let i = 0; i < 5; i++) {
    const sx = 11 + i * 5;
    for (const sy of [17, 29]) {
      px(ctx, '#2e1b0d', sx - 1, sy - 1, 4, 4);
      px(ctx, CPAL.gold, sx, sy, 2, 2);
      px(ctx, CPAL.goldL, sx, sy);
      px(ctx, CPAL.goldD, sx + 1, sy + 1);
    }
  }
  // cantle ridge across the back of the seat
  for (let x = 12; x < 32; x++) { px(ctx, CPAL.leaL, x, 21); px(ctx, '#2e1b0d', x, 22); }
  texture(ctx, W, H, [
    [CPAL.lea, CPAL.leaD, 0.16, 1], [CPAL.leaL, CPAL.lea, 0.14, 3],
    [CPAL.leaD, '#3a2412', 0.14, 5], ['#3a2412', CPAL.leaD, 0.10, 7],
  ]);
  edgeLight(ctx, W, H, CPAL.leaL, '#2e1b0d');
  return spriteFromHi(c, 22, 20);
}

// ---- flipper --------------------------------------------------------------
function buildFlipper() {
  const W = 26, H = 18;
  const f = blobField(W, H, [{ x: 6, y: 9, rx: 7.2, ry: 7.6 }, { x: 14, y: 9, rx: 8.8, ry: 6.4 }, { x: 21, y: 9, rx: 5.2, ry: 4.2 }]);
  const { c, ctx } = shadeBlob(W, H, f, [CPAL.manDD, CPAL.manDD, CPAL.manD, CPAL.man], { outline: CPAL.out, lift: 0.04, smooth: 1 });
  // finger bones under the skin — a manatee flipper has a real hand in it
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 9; i++) {
      const x = 12 + i, y = 6 + k * 3 + Math.round(i * 0.25 * (k - 1));
      if (f[y * W + x] > 0.06) px(ctx, CPAL.manDD, x, y);
    }
  }
  // three nails along the leading edge
  for (let i = 0; i < 3; i++) px(ctx, CPAL.bone, 20 + (i & 1), 5 + i * 4, 2, 1);
  px(ctx, CPAL.manL, 6, 4, 6, 1);
  return spriteFromHi(c, 5, 9);
}

// ---- pirate flag on a pole (flies behind the saddle) ----------------------
function buildFlag(frame) {
  const c = newCan(44, 36), ctx = c.getContext('2d');
  const wav = [0, 2, 4, 2, 0, -2, -4, -2][frame & 7];
  // cloth, with a shaded fold following the wave
  for (let y = 0; y < 24; y++) {
    const ph = (y / 24) * 3.1 + frame * 0.8;
    const off = Math.round(Math.sin(ph) * 2.8 + wav * 0.4);
    const lit = Math.cos(ph);
    for (let x = 0; x < 32; x++) {
      const yy = 4 + y + off;
      let col = CPAL.hatD;
      if (lit > 0.45) col = CPAL.hat;
      if (lit < -0.55) col = CPAL.out2;
      if (x > 29) col = CPAL.out;
      if (y < 2 || y > 21) col = CPAL.out2;
      px(ctx, col, 8 + x, yy);
    }
    // frayed trailing edge
    if ((y & 3) === 1) px(ctx, CPAL.hatD, 40, 4 + y + off, 2, 1);
  }
  // skull & crossbones, big enough to actually be a skull now
  const off0 = Math.round(Math.sin(0.45 * 3.1 + frame * 0.8) * 2.8 + wav * 0.4);
  stamp(ctx, [
    '..kkkkkkkk..',
    '.kWWWWWWWWk.',
    'kWWWWWWWWWWk',
    'kWWkkWWkkWWk',
    'kWkeekWkeekW',
    'kWkeekWkeekW',
    'kWWkkWWkkWWk',
    'kWWWWWWWWWWk',
    '.kWWWkkWWWk.',
    '..kWkWkWk...',
    '..kWWkkWWk..',
    '...kkkkkk...',
  ], 16, 9 + off0, { k: CPAL.out, W: CPAL.white, e: CPAL.out2 });
  // crossed bones under the jaw
  for (let i = 0; i < 10; i++) {
    px(ctx, CPAL.white, 15 + i, 22 + i + off0); px(ctx, CPAL.white, 24 - i, 22 + i + off0);
  }
  return spriteFromHi(c, 4, 18);
}

// ===========================================================================
//  CAPTAIN OTTER — high 3/4 view, sits on the saddle, aims 360°
// ===========================================================================
// torso + cape, drawn once; head and arms are separate so they animate.
// The silhouette is the original art, stamped at AS; everything after that is
// detail the old resolution had no room for.
function buildOtterTorso() {
  const W = 52, H = 48, c = newCan(W, H), ctx = c.getContext('2d');
  const M = { k: CPAL.out, C: CPAL.cape, c: CPAL.capeD, L: CPAL.capeL, f: CPAL.fur, d: CPAL.furD, l: CPAL.furL, r: CPAL.cream, e: CPAL.lea, E: CPAL.leaL, g: CPAL.gold, G: CPAL.goldL, m: CPAL.met, M: CPAL.metL };
  // cape spread behind the shoulders
  stampUp(ctx, [
    '.....kkkkkk.....',
    '....kcCCCCck....',
    '...kcCCCCCCck...',
    '..kcCCCCCCCCck..',
    '..kCCCCCCCCCCk..',
    '.kcCCCCCCCCCCck.',
    '.kCCCCCCCCCCCCk.',
    'kcCCCCCCCCCCCCck',
    'kCCCCCcccCCCCCCk',
    'kcCCCcCCCcCCCCck',
    '.kcCCcCCCcCCCck.',
    '..kkcckkkcckkk..',
  ], 10, 20, M);
  // cape folds: a lit crease and a shadow either side of it, every few pixels
  for (let y = 22; y < 44; y++) for (let x = 12; x < 40; x++) {
    const fold = Math.sin((x - 26) * 0.55);
    if (fold > 0.86) px(ctx, CPAL.capeL, x, y);
    else if (fold < -0.86) px(ctx, CPAL.capeD, x, y);
  }
  // redraw the cape outline the folds just walked over
  stampUp(ctx, [
    '.....kkkkkk.....',
    '....k......k....',
    '...k........k...',
    '..k..........k..',
    '..k..........k..',
    '.k............k.',
    '.k............k.',
    'k..............k',
    'k..............k',
    'k..............k',
    '.k............k.',
    '..kkkkkkkkkkkk..',
  ], 10, 20, M);
  // torso (fur) over the cape
  stampUp(ctx, [
    '..kkkkkkkk..',
    '.kddffffddk.',
    'kdffffffffdk',
    'kdfflllffldk',
    'kdflrrrrlfdk',
    'kdflrrrrlfdk',
    'kdfflrrlffdk',
    'kddffffffddk',
    '.kkddddddkk.',
    '...kkkkkk...',
  ], 14, 16, M);
  // bandolier strap: stitched edges and brass cartridges in the loops
  for (let i = 0; i < 12; i++) {
    const x = 18 + i * 2, y = 20 + i * 2;
    px(ctx, CPAL.leaD, x, y, 2, 3); px(ctx, CPAL.lea, x, y, 2, 2); px(ctx, CPAL.leaL, x, y, 2, 1);
    if (i % 3 === 1) { px(ctx, CPAL.gold, x, y + 1, 2, 2); px(ctx, CPAL.goldL, x, y + 1, 1, 1); }
    else if (i % 3 === 2) px(ctx, CPAL.creamD, x, y + 2, 2, 1);
  }
  // brass buckle over the heart
  px(ctx, CPAL.out, 28, 30, 6, 6);
  px(ctx, CPAL.goldD, 29, 31, 4, 4); px(ctx, CPAL.gold, 29, 31, 4, 2); px(ctx, CPAL.goldL, 29, 31, 2, 1);
  px(ctx, CPAL.out, 30, 32, 2, 2);
  // shoulder pauldrons (salvaged steel), bevelled and riveted
  for (const sx of [12, 34]) {
    stampUp(ctx, ['kkkk', 'kMMk', 'kmmk', '.kk.'], sx, 18, { k: CPAL.out, M: CPAL.metL, m: CPAL.met });
    px(ctx, CPAL.metLL, sx + 2, 20, 4, 1);
    px(ctx, CPAL.metDD, sx + 2, 25, 4, 1);
    px(ctx, CPAL.metLL, sx + 3, 22); px(ctx, CPAL.out2, sx + 3, 23);
  }
  // fine fur grain and cape weave, then a lit rim on every upper edge
  texture(ctx, W, H, [
    [CPAL.fur, CPAL.furD, 0.16, 1], [CPAL.fur, CPAL.furL, 0.08, 3],
    [CPAL.furD, CPAL.furDD, 0.14, 5], [CPAL.furL, CPAL.furLL, 0.12, 7],
    [CPAL.cream, CPAL.creamD, 0.14, 9], [CPAL.cape, CPAL.capeD, 0.10, 11],
    [CPAL.capeL, CPAL.cape, 0.12, 13],
  ]);
  edgeLight(ctx, W, H, CPAL.furLL, CPAL.furDD);
  return spriteFromHi(c, 26, 28);
}

// Head + tricorn hat.
function buildOtterHead() {
  const W = 48, H = 44, c = newCan(W, H), ctx = c.getContext('2d');
  const M = {
    k: CPAL.out, f: CPAL.fur, d: CPAL.furD, D: CPAL.furDD, l: CPAL.furL, L: CPAL.furLL,
    r: CPAL.cream, R: CPAL.creamD, h: CPAL.hat, H: CPAL.hatL, x: CPAL.hatD, X: CPAL.hatLL, W: CPAL.white,
  };
  // ---- head fur (round otter skull, ears)
  stampUp(ctx, [
    '.kk........kk.',
    'kddk......kddk',
    'kdfdk....kdfdk',
    'kdffdkkkkdffdk',
    '.kdffffffffdk.',
    '..kffffffffk..',
    '.kffffffffffk.',
    'kffffffffffffk',
    'kffffffffffffk',
    'kdffffffffffdk',
    '.kdffffffffdk.',
    '..kddffffddk..',
    '...kkddddkk...',
    '.....kkkk.....',
  ], 10, 12, M);
  // inner ears, and a soft crown highlight down the middle of the skull
  px(ctx, '#5a3040', 13, 16, 3, 4); px(ctx, '#7a4356', 13, 16, 3, 2);
  px(ctx, '#5a3040', 32, 16, 3, 4); px(ctx, '#7a4356', 32, 16, 3, 2);
  for (let y = 22; y < 30; y++) px(ctx, CPAL.furL, 22 - (y - 22 >> 2), y, 4, 1);
  px(ctx, CPAL.furLL, 22, 22, 3, 2);
  // cheek fluff at the jawline
  for (let i = 0; i < 4; i++) { px(ctx, CPAL.furL, 11 + i, 32 + i); px(ctx, CPAL.furL, 36 - i, 32 + i); }

  // ---- tricorn hat sits on top, brim upturned at three corners
  stampUp(ctx, [
    '...kkkkkkkkkkkk...',
    '..kxxxxxxxxxxxxk..',
    '.kxhhhhhhhhhhhhxk.',
    'kxhhhhhhhhhhhhhhxk',
    'kxhhhhhHHHHhhhhhxk',
    'kXhhhHHHHHHHHhhhXk',
    'kkxhhhhhhhhhhhhxkk',
    '.kkxxxxxxxxxxxxkk.',
    '..kkkkkkkkkkkkkk..',
  ], 6, 0, M);
  // crown crease and a felt nap on the brim
  for (let x = 14; x < 34; x++) { px(ctx, CPAL.hatLL, x, 7); px(ctx, CPAL.hatD, x, 9); }
  for (let x = 10; x < 38; x++) px(ctx, CPAL.hatL, x, 5);
  // hat band with a gold edge, and a skull badge
  for (let x = 10; x < 38; x++) { px(ctx, CPAL.goldD, x, 12, 1, 2); px(ctx, CPAL.goldL, x, 12); }
  stampUp(ctx, [
    '.kkkk.',
    'kWWWWk',
    'kWkWkW',
    'kWWWWk',
    '.kkkk.',
  ], 18, 2, M);
  // eye sockets + nose holes in the badge skull, now that they fit
  px(ctx, CPAL.out, 21, 5, 2, 2); px(ctx, CPAL.out, 25, 5, 2, 2); px(ctx, CPAL.out, 23, 8, 2, 1);
  texture(ctx, W, H, [
    [CPAL.fur, CPAL.furD, 0.16, 1], [CPAL.fur, CPAL.furL, 0.09, 3],
    [CPAL.furD, CPAL.furDD, 0.14, 5], [CPAL.furL, CPAL.furLL, 0.12, 7],
    [CPAL.hat, CPAL.hatD, 0.13, 9], [CPAL.hatL, CPAL.hat, 0.12, 11],
  ]);
  edgeLight(ctx, W, H, CPAL.furLL, CPAL.furDD);
  return spriteFromHi(c, 24, 24);
}

// Muzzle + expression are drawn live on top of the head so they can animate.
// exp: 'idle' | 'happy' | 'angry' | 'talk' | 'surprised' | 'hurt'
// All coordinates are the original face, doubled, so the expressions land in
// exactly the same place on the skull — with room now for iris, lash and tooth.
function drawOtterFace(ctx, exp, blink, t) {
  const O = CPAL.out, C = CPAL.cream, CD = CPAL.creamD, E = CPAL.eye, W = CPAL.shine;
  // muzzle pad
  stampUp(ctx, [
    '.kkkkkk.',
    'kCCCCCCk',
    'kCCCCCCk',
    'kCCCCCCk',
    '.kCCCCk.',
    '..kkkk..',
  ], 16, 26, { k: O, C });
  px(ctx, CD, 18, 32, 12, 2);                      // pad shadow
  px(ctx, CPAL.white, 19, 29, 8, 1);               // lit crown of the pad
  // nose leather with a lit bridge and two nostrils
  px(ctx, O, 21, 27, 8, 5);
  px(ctx, '#6a4436', 22, 28, 6, 3);
  px(ctx, '#8a5b46', 22, 28, 6, 1);
  px(ctx, CPAL.white, 23, 28, 2, 1);
  px(ctx, O, 22, 30, 2, 1); px(ctx, O, 26, 30, 2, 1);
  const brow = exp === 'angry' ? 1 : exp === 'surprised' ? -1 : 0;

  // drowning / agony: eyes screwed shut, cheeks puffed, mouth gasping
  if (exp === 'drown' || exp === 'pain') {
    for (const ex of [12, 26]) {
      px(ctx, O, ex, 20, 10, 2); px(ctx, O, ex + 2, 18, 6, 2); px(ctx, O, ex + 2, 22, 6, 2);
      px(ctx, CPAL.furDD, ex - 2, 16, 10, 2);
    }
    const g = Math.floor(t * 4) & 1;
    px(ctx, O, 20 - g * 2, 34, 10 + g * 4, 8 + g * 2);
    px(ctx, CPAL.bloodD, 22 - g * 2, 36, 6 + g * 4, 4 + g * 2);
    for (let i = 0; i < 2; i++) { px(ctx, CD, 8, 28 + i * 4, 6, 2); px(ctx, CD, 34, 28 + i * 4, 6, 2); }
    return;
  }
  const shut = blink || exp === 'happy';
  for (const ex of [14, 28]) {
    if (shut) { px(ctx, O, ex, 22, 6, 2); px(ctx, CPAL.furDD, ex + 1, 24, 4, 1); continue; }
    const big = exp === 'surprised' ? 1 : 0;
    const x0 = ex - big, y0 = 20 - big, w = 6 + big * 2, h = 6 + big * 2;
    // rounded socket, white, iris, pupil, catchlight — a real eye at last
    px(ctx, O, x0, y0 - 1, w, 1); px(ctx, O, x0, y0 + h, w, 1);
    px(ctx, O, x0 - 1, y0, 1, h); px(ctx, O, x0 + w, y0, 1, h);
    px(ctx, CPAL.white, x0, y0, w, h);
    px(ctx, O, x0, y0); px(ctx, O, x0 + w - 1, y0); px(ctx, O, x0, y0 + h - 1); px(ctx, O, x0 + w - 1, y0 + h - 1);
    px(ctx, '#b9c4d0', x0 + 1, y0 + h - 1, w - 2, 1);
    px(ctx, '#6a4d2a', ex + 1, 20, 4, 5);
    px(ctx, E, ex + 2, 21, 2, 3);
    px(ctx, W, ex + 1, 20, 1, 1);
  }
  // brows: angry ones slant in over the sockets, surprised ones lift clear
  if (brow > 0) {
    for (let i = 0; i < 9; i++) {
      px(ctx, CPAL.furDD, 12 + i, 17 + (i >> 2), 1, 2);
      px(ctx, CPAL.furDD, 35 - i, 17 + (i >> 2), 1, 2);
    }
  } else if (brow < 0) {
    px(ctx, CPAL.furDD, 13, 17, 8, 2); px(ctx, CPAL.furDD, 27, 17, 8, 2);
  }
  // mouth — with teeth, now that a tooth fits
  if (exp === 'happy') {
    px(ctx, O, 20, 36, 10, 2); px(ctx, O, 18, 34, 2, 2); px(ctx, O, 30, 34, 2, 2);
    px(ctx, CPAL.white, 22, 35, 3, 2); px(ctx, CPAL.white, 26, 35, 3, 2);
  } else if (exp === 'angry') {
    px(ctx, O, 20, 36, 10, 2); px(ctx, O, 18, 38, 2, 2); px(ctx, O, 30, 38, 2, 2);
    px(ctx, CPAL.white, 21, 34, 2, 3); px(ctx, CPAL.white, 27, 34, 2, 3);
  } else if (exp === 'talk') {
    const o = (Math.floor(t * 9) & 1);
    px(ctx, O, 20, 34, 10, 4 + o * 2); px(ctx, CPAL.blood, 22, 36, 6, 1 + o * 2);
    px(ctx, CPAL.white, 22, 35, 6, 1);
  } else if (exp === 'surprised') {
    px(ctx, O, 22, 34, 6, 6); px(ctx, CPAL.bloodD, 23, 36, 4, 3);
  } else { px(ctx, O, 20, 36, 10, 2); px(ctx, O, 19, 35); px(ctx, O, 30, 35); }
  // whiskers — individual, splayed, tapering to a fine tip
  for (let i = 0; i < 3; i++) {
    const wy = 28 + i * 4;
    px(ctx, CD, 10, wy, 4, 1); px(ctx, C, 12, wy, 2, 1);
    px(ctx, CD, 34, wy, 4, 1); px(ctx, C, 34, wy, 2, 1);
  }
}

// ---- cigar (clamped in the muzzle, embers + smoke) ------------------------
function buildCigar() {
  const c = newCan(24, 10), ctx = c.getContext('2d');
  stampUp(ctx, [
    'kkkkkkkkk..',
    'kDDDDDDDek.',
    'kDdddddDEek',
    'kDDDDDDDek.',
    'kkkkkkkkk..',
  ], 0, 0, { k: CPAL.out, D: CPAL.woodDD, d: CPAL.woodD, e: CPAL.ember, E: CPAL.emberL });
  // a rolled-leaf highlight, a paper band, and ash creeping back from the coal
  for (let x = 3; x < 15; x++) px(ctx, CPAL.woodD, x, 4);
  px(ctx, CPAL.woodDD, 4, 2, 2, 6); px(ctx, CPAL.goldD, 4, 4, 2, 2);
  px(ctx, CPAL.smoke, 15, 3, 2, 4); px(ctx, CPAL.emberL, 17, 4, 1, 2);
  return spriteFromHi(c, 0, 5);
}

// ---- arm (shoulder at the anchor, hand at the far end) --------------------
function buildOtterArm() {
  const c = newCan(24, 14), ctx = c.getContext('2d');
  stampUp(ctx, [
    '.kkkkkkkkk.',
    'kdffffffdDk',
    'kffffffffDk',
    'kdffffffdDk',
    '.kkkkkkkkk.',
  ], 0, 2, { k: CPAL.out, f: CPAL.fur, d: CPAL.furD, D: CPAL.furDD });
  // a lit ridge along the top of the forearm
  for (let x = 3; x < 17; x++) px(ctx, CPAL.furL, x, 5);
  // leather cuff with stitching
  for (let y = 5; y <= 11; y++) {
    px(ctx, CPAL.lea, 14, y, 3, 1); px(ctx, CPAL.leaD, 16, y);
    if ((y & 1) === 0) px(ctx, CPAL.creamD, 14, y);
  }
  px(ctx, CPAL.leaL, 14, 5, 3, 1);
  // the paw: a palm and three curled fingers with dark claws
  px(ctx, CPAL.out, 17, 4, 5, 7);
  px(ctx, CPAL.furD, 18, 5, 3, 5);
  px(ctx, CPAL.fur, 18, 5, 2, 4);
  px(ctx, CPAL.furL, 18, 5, 2, 1);
  for (let i = 0; i < 3; i++) { px(ctx, CPAL.furDD, 18, 6 + i * 2, 3, 1); px(ctx, CPAL.out, 21, 6 + i * 2); }
  texture(ctx, 24, 14, [
    [CPAL.fur, CPAL.furD, 0.16, 1], [CPAL.furD, CPAL.furDD, 0.12, 3], [CPAL.furL, CPAL.furLL, 0.12, 5],
  ]);
  return spriteFromHi(c, 2, 7);
}

function buildOtterTail() {
  const W = 36, H = 20;
  const f = blobField(W, H, [{ x: 8, y: 10, rx: 10, ry: 8.8 }, { x: 18, y: 10, rx: 10, ry: 7.2 }, { x: 28, y: 10, rx: 8, ry: 5.2 }]);
  const { c, ctx } = shadeBlob(W, H, f, [CPAL.furDD, CPAL.furD, CPAL.fur, CPAL.furL], { outline: CPAL.out, lift: 0.20, smooth: 1 });
  // a pale dorsal stripe down the rudder, and guard hairs along the underside
  for (let x = 5; x < 30; x++) if (f[7 * W + x] > 0.25) px(ctx, CPAL.furL, x, 7);
  for (let x = 6; x < 30; x += 3) { const y = 14 + Math.round(Math.sin(x * 0.4)); if (f[y * W + x] > 0.15) px(ctx, CPAL.furDD, x, y, 2, 1); }
  texture(ctx, W, H, [
    [CPAL.fur, CPAL.furD, 0.16, 1], [CPAL.furD, CPAL.furDD, 0.13, 3], [CPAL.furL, CPAL.furLL, 0.12, 5],
  ]);
  return spriteFromHi(c, 4, 10);
}

// ===========================================================================
//  BUILD ALL
// ===========================================================================
const CH = {};
function buildCharacters() {
  CH.manatee      = buildManateeBody(false);
  CH.manateeArmor = buildManateeBody(true);
  CH.manateeHurt  = tintHi(CH.manateeArmor, '#ffffff', 0.85);
  CH.manateeHurtP = tintHi(CH.manatee, '#ffffff', 0.85);
  CH.flipper      = buildFlipper();
  CH.saddle       = buildSaddle();
  CH.flags        = []; for (let i = 0; i < 8; i++) CH.flags.push(buildFlag(i));
  CH.otterTorso   = buildOtterTorso();
  CH.otterHead    = buildOtterHead();
  CH.otterArm     = buildOtterArm();
  CH.otterTail    = buildOtterTail();
  CH.cigar        = buildCigar();
  CH.otterRage    = tintHi(CH.otterTorso, '#ff4a26', 0.4);
  CH.headRage     = tintHi(CH.otterHead, '#ff4a26', 0.35);
  // head canvas we redraw the face onto each frame (hi-res, like its source)
  CH.headBuf = newCanHi(CH.otterHead.w, CH.otterHead.h);
  CH.headBufCtx = CH.headBuf.getContext('2d');
  buildBoats();
  buildShields();
  buildBossArt();
}

// ---- live head with expression --------------------------------------------
function otterHeadWithFace(exp, blink, t, rage) {
  const ctx = CH.headBufCtx;
  ctx.clearRect(0, 0, CH.headBuf.width, CH.headBuf.height);
  drawRaw(ctx, (rage ? CH.headRage : CH.otterHead).c, 0, 0);
  drawOtterFace(ctx, exp, blink, t);
  return CH.headBuf;
}

// ===========================================================================
//  RIG — draws the manatee + otter as one animated creature
//  state: {aim, facing, tilt, swimPhase, rollPhase|null, hurt, exp, rage,
//          recoil, flash, speed, armored, t}
// ===========================================================================
const Rig = {
  blinkT: 0, blink: false, cigarSmoke: 0,
  updateBlink(dt) {
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = !this.blink; this.blinkT = this.blink ? 0.09 : rand(1.8, 5.0); }
  },
  draw(ctx, x, y, s) {
    const t = s.t, facing = s.facing;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));

    // ---- barrel roll: spin about the long axis (squash Y, show the belly)
    let scaleY = 1, belly = false, rollRot = 0, stretch = 1;
    if (s.rollPhase !== null && s.rollPhase !== undefined) {
      const ph = s.rollPhase * TAU;
      scaleY = Math.cos(ph);
      if (Math.abs(scaleY) < 0.22) scaleY = 0.22 * (scaleY < 0 ? -1 : 1);
      belly = Math.cos(ph) < 0;
      rollRot = Math.sin(ph) * 0.18;
      stretch = 1 + Math.abs(Math.sin(ph)) * 0.16;   // stretch along travel
    }
    // squash & stretch from speed
    const sp = Math.min(1, (s.speed || 0) / 240);
    stretch *= 1 + sp * 0.10;
    const squash = 1 - sp * 0.06;

    const hurt = s.hurt;
    const swim = s.swimPhase || 0;
    // manatees scull with the whole body: a gentle yaw around the shoulders
    const wag = Math.sin(swim) * (0.05 + Math.min(0.08, (s.speed || 0) / 2600));

    ctx.scale(facing, 1);
    ctx.rotate((s.tilt || 0) * facing + rollRot + wag);
    ctx.scale(stretch, scaleY * squash);

    // ---- flippers paddle
    const fl = Math.sin(swim + 0.7) * 0.5;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(9, side * 12); ctx.scale(1, side);
      ctx.rotate(2.25 + fl * 0.45);
      ctx.drawImage(CH.flipper.c, -CH.flipper.ax, -CH.flipper.ay);
      ctx.restore();
    }

    // ---- body
    const body = hurt ? (s.armored ? CH.manateeHurt : CH.manateeHurtP)
                      : (s.armored ? CH.manateeArmor : CH.manatee);
    ctx.drawImage(body.c, -body.ax, -body.ay);

    // ---- rider (hidden while belly-up mid-roll, or before he boards)
    if (!belly && !s.riderHidden) {
      // saddle
      ctx.save(); ctx.translate(7, 0); ctx.scale(0.72, 0.72);
      ctx.drawImage(CH.saddle.c, -CH.saddle.ax, -CH.saddle.ay); ctx.restore();
      // flag whipping behind
      const fr = Math.floor(t * 9) & 7;
      const flag = CH.flags[fr];
      ctx.save(); ctx.translate(-16, 2); ctx.rotate(-0.13); ctx.scale(0.5, 0.5);
      px(ctx, CPAL.woodD, -1, -20, 2, 22); px(ctx, CPAL.wood, -1, -20, 1, 22);
      ctx.drawImage(flag.c, -flag.ax, -flag.ay - 12);
      ctx.restore();

      // the otter rides over the shoulders, sized like a passenger
      const bob = Math.sin(t * 4.5) * 0.7;
      ctx.save();
      ctx.translate(7, -2 + bob);
      ctx.scale(0.66, 0.66);

      // aim in the manatee's flipped local space
      const aimL = facing === 1 ? s.aim : Math.PI - s.aim;
      // the otter twists his whole upper body toward the aim
      const twist = clamp(angleDiff(0, aimL), -1.1, 1.1) * 0.30;
      const faceRight = Math.cos(aimL) >= 0 ? 1 : -1;

      // tail curls out behind him
      ctx.save(); ctx.translate(-9, 4); ctx.rotate(2.5 + Math.sin(t * 3) * 0.12);
      ctx.drawImage(CH.otterTail.c, -CH.otterTail.ax, -CH.otterTail.ay);
      ctx.restore();

      ctx.rotate(twist);
      // torso
      const torso = s.rage ? CH.otterRage : CH.otterTorso;
      ctx.drawImage(torso.c, -torso.ax, -torso.ay);

      // ---- far arm (behind the torso) -> drawn before head
      const recoil = s.recoil || 0;
      const armLen = 9 - recoil * 3;
      ctx.save();
      ctx.scale(faceRight, 1);
      const localAim = faceRight === 1 ? aimL - twist : Math.PI - (aimL - twist);
      ctx.rotate(localAim);
      ctx.translate(-recoil * 3, 0);
      // the gun, drawn from the game's weapon sprites
      const gun = s.gunSprite;
      if (gun) {
        ctx.save();
        const flipY = Math.cos(localAim) < 0 ? -1 : 1; ctx.scale(1, flipY);
        ctx.drawImage(gun.c, 4, -gun.ay);
        if (s.flash > 0) { const m = s.bigFlash ? SP.muzzleBig : SP.muzzle; ctx.drawImage(m.c, 4 + gun.w, -m.ay); }
        ctx.restore();
      }
      // both paws on the grip
      ctx.drawImage(CH.otterArm.c, -1, -CH.otterArm.ay - 2);
      ctx.drawImage(CH.otterArm.c, -1, -CH.otterArm.ay + 2);
      ctx.restore();

      // ---- head (with live expression) on top
      const headBob = Math.sin(t * 4.5 + 1) * 0.5;
      ctx.save();
      ctx.translate(0, -9 + headBob);
      ctx.scale(faceRight, 1);
      // head leans into the aim a little
      ctx.rotate(clamp(angleDiff(0, faceRight === 1 ? aimL : Math.PI - aimL), -0.8, 0.8) * 0.22);
      const head = otterHeadWithFace(s.exp || 'idle', this.blink, t, s.rage);
      ctx.drawImage(head, -CH.otterHead.ax, -CH.otterHead.ay);
      // cigar clamped in the corner of the muzzle
      ctx.drawImage(CH.cigar.c, 6, -1);
      ctx.restore();
      ctx.restore();
    }
    ctx.restore();
  },
};

// ===========================================================================
//  CARTOON FX — the chunky, expressive layer that makes hits feel alive
// ===========================================================================
const Toon = {
  list: [],
  add(o) { if (this.list.length < 240) this.list.push(o); },
  // white impact flash-ring with radiating spikes
  impact(x, y, size = 1, color = '#ffffff') {
    this.add({ k: 'impact', x, y, r: 3 * size, max: 22 * size, life: 0.22, max0: 0.22, color, spikes: randi(6, 9), rot: rand(0, TAU) });
  },
  // comic "POW" style burst behind a big hit
  burst(x, y, size = 1, color = '#ffe48f') {
    this.add({ k: 'burst', x, y, r: 4 * size, max: 30 * size, life: 0.3, max0: 0.3, color, rot: rand(0, TAU), pts: randi(8, 12) });
  },
  // speed lines trailing a fast mover
  speed(x, y, ang, n = 3) {
    for (let i = 0; i < n; i++) this.add({ k: 'speed', x: x + rand(-8, 8), y: y + rand(-8, 8), ang, len: rand(10, 26), life: 0.22, max0: 0.22 });
  },
  // expanding shock ellipse on the water
  shock(x, y, max = 60, life = 0.4, color = '#eaf8ff') {
    this.add({ k: 'shock', x, y, r: 6, max, life, max0: life, color });
  },
  // little floating emote above a character
  emote(x, y, kind) { this.add({ k: 'emote', x, y, kind, life: 0.9, max0: 0.9, vy: -26 }); },
  // a puff of cartoon smoke
  puff(x, y, n = 3, color = '#e8eef5') {
    for (let i = 0; i < n; i++) this.add({ k: 'puff', x: x + rand(-4, 4), y: y + rand(-4, 4), r: rand(2, 5), life: rand(0.4, 0.8), max0: 0.8, vx: rand(-14, 14), vy: rand(-26, -6), color });
  },
  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i]; p.life -= dt;
      if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); continue; }
      const k = 1 - p.life / p.max0;
      if (p.k === 'impact' || p.k === 'burst' || p.k === 'shock') p.r = p.max ? p.r + (p.max - p.r) * Math.min(1, dt * 14) : p.r;
      if (p.k === 'emote') { p.y += p.vy * dt; p.vy += 40 * dt; }
      if (p.k === 'puff') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.r += dt * 7; }
    }
  },
  render(ctx, cam) {
    for (const p of this.list) {
      const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
      if (sx < -60 || sy < -60 || sx > 700 || sy > 420) continue;
      const k = 1 - p.life / p.max0, a = p.life / p.max0;
      switch (p.k) {
        case 'impact': {
          ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, Math.round(3 * a));
          ctx.beginPath(); ctx.arc(sx, sy, Math.round(p.r), 0, TAU); ctx.stroke();
          for (let i = 0; i < p.spikes; i++) {
            const ang = p.rot + i / p.spikes * TAU, r0 = p.r, r1 = p.r + 7 * a;
            ctx.beginPath(); ctx.moveTo(sx + Math.cos(ang) * r0, sy + Math.sin(ang) * r0);
            ctx.lineTo(sx + Math.cos(ang) * r1, sy + Math.sin(ang) * r1); ctx.stroke();
          }
          break;
        }
        case 'burst': {
          ctx.fillStyle = p.color; ctx.beginPath();
          for (let i = 0; i <= p.pts * 2; i++) {
            const ang = p.rot + i / (p.pts * 2) * TAU, rr = (i & 1) ? p.r * 0.52 : p.r;
            const bx = sx + Math.cos(ang) * rr, by = sy + Math.sin(ang) * rr * 0.8;
            i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
          }
          ctx.closePath(); ctx.globalAlpha = a; ctx.fill(); ctx.globalAlpha = 1;
          break;
        }
        case 'shock':
          ctx.strokeStyle = p.color; ctx.globalAlpha = a; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(sx, sy, Math.round(p.r), Math.round(p.r * 0.7), 0, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1; break;
        case 'speed':
          ctx.strokeStyle = `rgba(255,255,255,${(a * 0.8).toFixed(2)})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(sx, sy);
          ctx.lineTo(sx - Math.cos(p.ang) * p.len * a, sy - Math.sin(p.ang) * p.len * a); ctx.stroke(); break;
        case 'puff': {
          ctx.globalAlpha = a * 0.85; ctx.fillStyle = p.color;
          const r = Math.max(1, Math.round(p.r));
          ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
          ctx.globalAlpha = 1; break;
        }
        case 'emote': {
          ctx.globalAlpha = Math.min(1, p.life * 3);
          if (p.kind === '!') { px(ctx, '#ffe48f', sx - 1, sy - 8, 3, 6); px(ctx, '#ffe48f', sx - 1, sy, 3, 2); px(ctx, CPAL.out, sx - 2, sy - 9, 5, 1); }
          else if (p.kind === '?') { px(ctx, '#8ac6ff', sx - 2, sy - 9, 5, 2); px(ctx, '#8ac6ff', sx + 1, sy - 7, 2, 3); px(ctx, '#8ac6ff', sx - 1, sy - 4, 3, 2); px(ctx, '#8ac6ff', sx - 1, sy, 3, 2); }
          else if (p.kind === 'skull') drawSprite(ctx, SP.skull, sx, sy);
          else if (p.kind === 'star') drawSprite(ctx, SP.star, sx, sy);
          ctx.globalAlpha = 1; break;
        }
      }
    }
  },
};

// ===========================================================================
//  BOATS — procedural top-down hulls so every variant reads as a real vessel
//  (bow right). Generated once at load, same sprite keys as before.
// ===========================================================================
function buildBoat(o) {
  // o.len / o.beam are WORLD units; the hull is rasterized at AS art px per unit
  const L = o.len * AS, B = o.beam * AS;       // length, half-beam at the widest
  const W = L + 4 * AS, H = B * 2 + 6 * AS, cy = Math.round(H / 2);
  const c = newCan(W, H), ctx = c.getContext('2d');
  const hullL = o.hullL || CPAL.woodL, hull = o.hull || CPAL.wood;
  const hullD = o.hullD || CPAL.woodD, hullDD = o.hullDD || CPAL.woodDD;
  const deck = o.deck || CPAL.wood, deckD = o.deckD || CPAL.woodD;
  const X0 = 2 * AS;

  const halfW = x => {
    const u = clamp((x - X0) / L, 0, 1);
    if (u < 0.33) return B * (0.70 + 0.30 * (u / 0.33));
    return B * Math.max(0, 1 - Math.pow((u - 0.33) / 0.67, 1.7));
  };
  // ---- hull: outline, topside shading, then the deck well
  for (let x = X0; x <= L + X0 - 1; x++) {
    const hw = halfW(x); if (hw < 1.2) continue;
    const y0 = Math.round(cy - hw), y1 = Math.round(cy + hw);
    for (let y = y0; y <= y1; y++) {
      const edge = y === y0 || y === y1 || x === X0 || x > L + X0 - 2;
      if (edge) { px(ctx, CPAL.out, x, y); continue; }
      const near = Math.min(y - y0, y1 - y);
      // gunwale: a lit cap rail over a shadowed topside, and a dark boot line
      let col;
      if (near <= 1) col = (y - y0 <= 1) ? hullL : hullDD;
      else if (near <= 3) col = (y - y0 <= 3) ? hull : hullD;
      else col = hullD;
      // hull planking runs fore-and-aft: a seam every 3px
      if (((y - cy) % 3) === 0 && near > 3) col = hullDD;
      px(ctx, col, x, y);
    }
  }
  // ---- open deck well with fore-and-aft planking and visible frames
  const wellA = Math.round(X0 + L * 0.14), wellB = Math.round(X0 + L * 0.82);
  for (let x = wellA; x <= wellB; x++) {
    const hw = halfW(x) - 3 * AS; if (hw < 1.5) continue;
    const y0 = Math.round(cy - hw), y1 = Math.round(cy + hw);
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1 || x === wellA || x === wellB) { px(ctx, CPAL.out2, x, y); continue; }
      let col = ((y - y0) % 5 === 0) ? deckD : deck;
      if (((x - wellA) % 9) === 0) col = deckD;              // athwartship frame
      if (hash2(x * 5, y * 3) > 0.93) col = deckD;           // wear
      px(ctx, col, x, y);
    }
  }
  // ---- thwarts (bench seats) across the well
  for (const f of (o.thwarts || [0.34, 0.62])) {
    const x = Math.round(X0 + L * f), hw = halfW(x) - 2 * AS; if (hw < 1.5) continue;
    for (let y = Math.round(cy - hw); y <= Math.round(cy + hw); y++) { px(ctx, hullL, x, y, 2, 1); px(ctx, hullD, x + 1, y); }
    px(ctx, CPAL.out2, x + 2, Math.round(cy - hw), 1, Math.round(hw * 2) + 1);
    px(ctx, CPAL.out2, x - 1, Math.round(cy - hw), 1, Math.round(hw * 2) + 1);
  }
  // ---- rivets / fastenings along the sheer, every boat
  for (let x = X0 + 4; x < L + X0 - 4; x += 7) {
    const hw = halfW(x); if (hw < 3) continue;
    px(ctx, hullL, x, Math.round(cy - hw) + 2); px(ctx, hullDD, x, Math.round(cy + hw) - 2);
  }
  // ---- transom + outboard motor at the stern
  if (o.motor) {
    const mx = 1, my = cy;
    stamp(ctx, [
      'kkkkkkkk',
      'kXXXXXXk',
      'kXmmmmXk',
      'kXmMMmXk',
      'kXmMMmXk',
      'kXmmmmXk',
      'kXXXXXXk',
      'kkkkkkkk',
    ], mx, my - 4, { k: CPAL.out, X: CPAL.metDD, m: CPAL.metD, M: CPAL.metL });
    px(ctx, CPAL.out, mx + 8, my - 1, 3, 2);        // shaft
    px(ctx, CPAL.metL, mx + 2, my - 3, 1, 2);
  }
  // ---- wheelhouse / cabin
  if (o.cabin) {
    const cw = Math.round(L * 0.22), ch = Math.round(B * 1.1);
    const cx0 = Math.round(X0 + L * o.cabin), cy0 = Math.round(cy - ch / 2);
    for (let y = cy0; y < cy0 + ch; y++) for (let x = cx0; x < cx0 + cw; x++) {
      const e = y === cy0 || y === cy0 + ch - 1 || x === cx0 || x === cx0 + cw - 1;
      let col = e ? CPAL.out : (y < cy0 + 4 ? CPAL.metL : y > cy0 + ch - 5 ? CPAL.metDD : CPAL.met);
      if (!e && ((x - cx0) % 5) === 0) col = CPAL.metD;   // panel seams
      px(ctx, col, x, y);
    }
    // lit windows with mullions, and a rail along the roof
    for (let i = 0; i < 3; i++) {
      const wy = cy0 + 3 + i * Math.max(2, Math.floor((ch - 6) / 3));
      if (wy > cy0 + ch - 4) break;
      px(ctx, CPAL.out, cx0 + cw - 5, wy, 4, 2);
      px(ctx, CPAL.goldL, cx0 + cw - 4, wy, 2, 1);
      px(ctx, CPAL.gold, cx0 + cw - 4, wy + 1, 2, 1);
    }
    px(ctx, CPAL.metLL, cx0 + 1, cy0 + 1, cw - 2, 1);
  }
  // ---- role-specific gear
  if (o.gear === 'net') {
    const nx0 = wellA + 4, nx1 = wellA + Math.round(L * 0.3);
    for (let x = nx0; x < nx1; x++)
      for (let y = Math.round(cy - B * 0.5); y < Math.round(cy + B * 0.5); y++) {
        // a real mesh: knots on a diagonal lattice
        if (((x + y) & 3) === 0) px(ctx, CPAL.white, x, y);
        else if (((x - y + 64) & 3) === 0) px(ctx, CPAL.creamD, x, y);
      }
    px(ctx, CPAL.out2, nx0 - 2, Math.round(cy - B * 0.5), 2, Math.round(B));
    // corks along the float line
    for (let y = Math.round(cy - B * 0.5); y < Math.round(cy + B * 0.5); y += 5) px(ctx, CPAL.ember, nx1, y, 2, 2);
  } else if (o.gear === 'harpoon') {
    const hx = Math.round(X0 + L * 0.62), len = Math.round(L * 0.3);
    px(ctx, CPAL.metDD, hx, cy - 2, len, 5);
    px(ctx, CPAL.metL, hx, cy - 1, len, 1);
    px(ctx, CPAL.metLL, hx + len - 6, cy - 1, 6, 1);
    px(ctx, CPAL.out, hx - 3, cy - 5, 6, 11);              // mount
    px(ctx, CPAL.met, hx - 2, cy - 4, 4, 9);
    px(ctx, CPAL.metL, hx - 2, cy - 4, 4, 2);
    for (let i = 0; i < 3; i++) px(ctx, CPAL.metDD, hx - 2, cy - 1 + i * 2, 4, 1);
  } else if (o.gear === 'dyna') {
    const bx = Math.round(X0 + L * 0.3);
    stamp(ctx, [
      'kkkkkkkkkk',
      'krrrrrrrrk',
      'krRrrRrrRk',
      'krRrrRrrRk',
      'krrrrrrrrk',
      'kfkkfkkfkk',
      'kkkkkkkkkk',
    ], bx, cy - 4, { k: CPAL.out, r: CPAL.blood, R: '#ff6161', f: CPAL.gold });
    for (let i = 0; i < 3; i++) px(ctx, CPAL.emberL, bx + 2 + i * 3, cy + 2, 1, 2);
  } else if (o.gear === 'turret') {
    const tx = Math.round(X0 + L * 0.55);
    for (let y = cy - 7; y <= cy + 7; y++)
      for (let x = tx - 7; x <= tx + 7; x++) {
        const d = Math.hypot(x - tx, y - cy); if (d > 7) continue;
        px(ctx, d > 5.6 ? CPAL.out : d > 4.4 ? CPAL.metD : d > 2 ? CPAL.met : CPAL.metL, x, y);
      }
    for (let i = 0; i < 8; i++) {                                 // ring bolts
      const th = i / 8 * TAU;
      px(ctx, CPAL.metLL, Math.round(tx + Math.cos(th) * 5), Math.round(cy + Math.sin(th) * 5));
    }
    const bl = Math.round(L * 0.24);
    px(ctx, CPAL.metDD, tx + 4, cy - 2, bl, 4);
    px(ctx, CPAL.metL, tx + 4, cy - 2, bl, 1);
    px(ctx, CPAL.out, tx + 4 + bl, cy - 3, 2, 6);                 // muzzle brake
  } else if (o.gear === 'crates') {
    for (const [fx, fy] of [[0.28, -0.4], [0.28, 0.35], [0.46, 0]]) {
      const bx = Math.round(X0 + L * fx), by = Math.round(cy + B * fy) - 4;
      stamp(ctx, [
        'kkkkkkkkk',
        'kTTTTTTTk',
        'kTttttTtk',
        'kTtTTTtTk',
        'kTttttTtk',
        'kTTTTTTTk',
        'kkkkkkkkk',
      ], bx, by, { k: CPAL.out, T: CPAL.woodL, t: CPAL.woodD });
      px(ctx, CPAL.metD, bx + 1, by + 3, 7, 1);                   // banding
    }
  }
  // ---- bow cleat + a coil of rope, every boat gets them
  const clx = Math.round(X0 + L * 0.88);
  px(ctx, CPAL.out, clx, cy - 2, 3, 4);
  px(ctx, CPAL.metL, clx, cy - 1, 2, 1); px(ctx, CPAL.metDD, clx, cy + 1, 2, 1);
  // a small coil of rope, stowed off the centreline so it reads as gear
  const rcx = Math.round(X0 + L * 0.72), rcy = Math.round(cy - B * 0.42);
  for (let r = 1; r <= 3; r++) for (let th = 0; th < 20; th++) {
    const ang = th / 20 * TAU;
    px(ctx, r === 2 ? CPAL.creamD : CPAL.woodD, Math.round(rcx + Math.cos(ang) * r), Math.round(rcy + Math.sin(ang) * r * 0.8));
  }
  return spriteFromHi(c, W / 2, cy);
}

function buildBoats() {
  const defs = {
    dinghy:    { len: 28, beam: 6,  motor: 1, thwarts: [0.34, 0.62] },
    netter:    { len: 30, beam: 7,  motor: 1, gear: 'net', thwarts: [0.6] },
    harpooner: { len: 32, beam: 7,  motor: 1, gear: 'harpoon', thwarts: [0.36],
                 hull: '#7d858f', hullL: '#c3ccd8', hullD: '#575e68', hullDD: '#383e46', deck: '#6a717b', deckD: '#4c525b' },
    speedboat: { len: 36, beam: 7,  motor: 1, cabin: 0.30, thwarts: [0.66],
                 hull: '#c4383a', hullL: '#ff8f84', hullD: '#8e2326', hullDD: '#5c1518', deck: '#e8e8ee', deckD: '#b9bcc6' },
    jetski:    { len: 20, beam: 5,  motor: 1, thwarts: [0.5],
                 hull: '#e0a838', hullL: '#ffe48f', hullD: '#a87a1e', hullDD: '#6d4d10', deck: '#3d4767', deckD: '#28314c' },
    dynaboat:  { len: 30, beam: 7,  motor: 1, gear: 'dyna', thwarts: [0.62] },
    trawler:   { len: 52, beam: 12, motor: 1, cabin: 0.16, gear: 'crates', thwarts: [0.68],
                 hull: '#8f6a3a', hullL: '#d9a25a', hullD: '#6a4a24', hullDD: '#432d14' },
    gunboat:   { len: 46, beam: 10, motor: 1, cabin: 0.18, gear: 'turret', thwarts: [],
                 hull: '#4c535e', hullL: '#98a2b0', hullD: '#343a43', hullDD: '#20242b', deck: '#454b55', deckD: '#2e333a' },
    // a squat pusher with a high wheelhouse and a fendered bow
    tug:       { len: 34, beam: 11, motor: 1, cabin: 0.22, gear: 'crates', thwarts: [0.72],
                 hull: '#7a3f22', hullL: '#c07a3e', hullD: '#542914', hullDD: '#32180b', deck: '#4a3a2a', deckD: '#31251a' },
    // a long low hull paying out line off a drum in the stern
    longliner: { len: 40, beam: 7,  motor: 1, cabin: 0.20, gear: 'net', thwarts: [0.5, 0.74],
                 hull: '#2f5f52', hullL: '#66ab95', hullD: '#1f4138', hullDD: '#132924', deck: '#3d5a52', deckD: '#263a35' },
    // pots stacked on the afterdeck
    crabber:   { len: 32, beam: 9,  motor: 1, cabin: 0.24, gear: 'crates', thwarts: [0.66],
                 hull: '#7a6a2a', hullL: '#c8b155', hullD: '#544819', hullDD: '#32290c', deck: '#5c5327', deckD: '#3c3617' },
    // small, fast, and carrying nothing but a flare rack
    spotter:   { len: 24, beam: 5,  motor: 1, gear: 'dyna', thwarts: [0.55],
                 hull: '#d97a2a', hullL: '#ffc06a', hullD: '#954914', hullDD: '#5c2c08', deck: '#33384a', deckD: '#212532' },
  };
  for (const k in defs) {
    SP.boats[k] = buildBoat(defs[k]);
    SP.boatsHurt[k] = tintHi(SP.boats[k], '#ffffff', 0.8);
  }
}

// ===========================================================================
//  PARRY SHIELD — the Absorb ability reads as a real shield, not a ring
// ===========================================================================
function buildShieldSprite(R, rim, face, glow) {
  // R is in WORLD units; the plate is rasterized at AS art px per unit
  const r = R * AS, D = r * 2 + 3 * AS, c = newCan(D, D), ctx = c.getContext('2d'), o = Math.round(D / 2);
  const SIDES = 8, step = TAU / SIDES;
  const rAt = ang => { // octagon radius at an angle
    const a = ((ang % step) + step) % step - step / 2;
    return r * Math.cos(step / 2) / Math.cos(a);
  };
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = x - o, dy = y - o, d = Math.hypot(dx, dy);
    if (d < 1) continue;
    const rr = rAt(Math.atan2(dy, dx));
    if (d > rr) continue;
    if (d > rr - 3) { px(ctx, rim, x, y); continue; }              // rim
    if (d > rr - 4.5) continue;                                     // dark groove
    if (d > rr - 7) { px(ctx, face, x, y); continue; }              // inner band
    // faceted interior: radial spokes + a hex weave, mostly transparent
    const ang = Math.atan2(dy, dx);
    const spoke = Math.abs(((ang % step) + step) % step - step / 2) < 0.045;
    if (spoke) px(ctx, face, x, y);
    else if ((((x + y) & 15) === 0) || (((x - y + 128) & 15) === 0)) px(ctx, glow, x, y);
    else if ((((x + y) & 15) === 1) || (((x - y + 128) & 15) === 1)) px(ctx, glow, x, y);
  }
  // shield emblem dead centre
  stamp(ctx, [
    '..kkkkkkkkkk..',
    '.kWWWWWWWWWWk.',
    'kWWWWWWWWWWWWk',
    'kWWwwwwwwwwWWk',
    'kWWwwwwwwwwWWk',
    'kWWwwwwwwwwWWk',
    'kWWWwwwwwwWWWk',
    '.kWWwwwwwwWWk.',
    '.kWWWwwwwWWWk.',
    '..kWWwwwwWWk..',
    '...kWWwwWWk...',
    '....kWWWWk....',
    '.....kWWk.....',
    '......kk......',
  ], o - 7, o - 7, { k: rim, W: face, w: glow });
  return spriteFromHi(c, o, o);
}
function buildShields() {
  CH.shield     = buildShieldSprite(30, 'rgba(150,215,255,0.95)', 'rgba(120,195,250,0.55)', 'rgba(200,238,255,0.30)');
  CH.shieldHot  = buildShieldSprite(30, 'rgba(255,255,255,0.98)', 'rgba(220,245,255,0.8)',  'rgba(255,255,255,0.5)');
  CH.shieldGold = buildShieldSprite(30, 'rgba(255,228,143,0.98)', 'rgba(255,200,90,0.7)',   'rgba(255,240,190,0.45)');
}


// hard-edged triangle fill — canvas fill() antialiases, which ruins pixel art
function triFill(ctx, col, ax, ay, bx, by, cx2, cy2) {
  const minY = Math.floor(Math.min(ay, by, cy2)), maxY = Math.ceil(Math.max(ay, by, cy2));
  const edges = [[ax, ay, bx, by], [bx, by, cx2, cy2], [cx2, cy2, ax, ay]];
  ctx.fillStyle = col;
  for (let y = minY; y <= maxY; y++) {
    let lo = Infinity, hi = -Infinity;
    for (const [x0, y0, x1, y1] of edges) {
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        const x = x0 + (x1 - x0) * (y - y0) / (y1 - y0);
        if (x < lo) lo = x; if (x > hi) hi = x;
      }
    }
    if (lo > hi) continue;
    const xs = Math.round(lo), xe = Math.round(hi);
    ctx.fillRect(xs, y, Math.max(1, xe - xs + 1), 1);
  }
}
function triOutlined(ctx, fill, outline, a, b, c2) {
  const mx = (a[0] + b[0] + c2[0]) / 3, my = (a[1] + b[1] + c2[1]) / 3;
  const grow = p => [mx + (p[0] - mx) * 1.14, my + (p[1] - my) * 1.14];
  const A = grow(a), B = grow(b), C = grow(c2);
  triFill(ctx, outline, A[0], A[1], B[0], B[1], C[0], C[1]);
  triFill(ctx, fill, a[0], a[1], b[0], b[1], c2[0], c2[1]);
}

// ===========================================================================
//  THE VILLAGE CHIEF'S SHARK — procedural, top-down, bow... er, snout right
// ===========================================================================
const SHK_W = 184, SHK_H = 88, SHK_CX = 92, SHK_CY = 44;
function buildShark(rage) {
  const lobes = [
    { x: 38,  y: 44, rx: 11.0, ry: 6.8 },             // peduncle (fins drawn separately)
    { x: 54,  y: 44, rx: 17.0, ry: 13.0 },
    { x: 78,  y: 44, rx: 25.0, ry: 20.0 },            // thickest
    { x: 104, y: 44, rx: 24.0, ry: 19.0 },
    { x: 128, y: 44, rx: 18.0, ry: 15.0 },            // head
    { x: 148, y: 44, rx: 12.8, ry: 10.0 },
    { x: 164, y: 44, rx: 7.2,  ry: 5.6 },             // snout
  ];
  const f = blobField(SHK_W, SHK_H, lobes);
  const ramp = rage
    ? ['#23161d', '#3e2029', '#5c3138', '#7d4c4c', '#9e6d66']
    : ['#1b2433', '#2b374d', '#42526d', '#5e7291', '#8093b0'];
  const body = shadeBlob(SHK_W, SHK_H, f, ramp, { outline: CPAL.out, smooth: 3, lift: 0.14 });
  // fins first, on their own layer, so the body overlaps their roots cleanly
  const c = newCan(SHK_W, SHK_H), ctx = c.getContext('2d');
  const finF = ramp[2], finD = ramp[1], finO = CPAL.out;
  // pectorals: broad deltas, swept back from just behind the gills
  triOutlined(ctx, finF, finO, [116, 36], [94, 24], [76, 12]);
  triOutlined(ctx, finF, finO, [116, 36], [76, 12], [92, 36]);
  triOutlined(ctx, finF, finO, [116, 52], [94, 64], [76, 76]);
  triOutlined(ctx, finF, finO, [116, 52], [76, 76], [92, 52]);
  // pelvic fins, small, further aft
  triOutlined(ctx, finD, finO, [68, 38], [54, 34], [46, 24]);
  triOutlined(ctx, finD, finO, [68, 50], [54, 54], [46, 64]);
  // caudal: a tall swept upper lobe over a shorter lower one
  triOutlined(ctx, finF, finO, [52, 36], [46, 52], [16, 10]);
  triOutlined(ctx, finF, finO, [52, 36], [16, 10], [34, 32]);
  triOutlined(ctx, finD, finO, [52, 52], [46, 40], [24, 76]);
  drawRaw(ctx, body.c, 0, 0);

  const pale = rage ? '#d8b2a8' : '#aebed6';
  const mid  = rage ? '#7d4c4c' : '#5e7291';
  const dark = rage ? '#3e2029' : '#2b374d';
  const solid = (x, y, l) => { const i = y * SHK_W + x; return i >= 0 && i < f.length && f[i] > l; };

  // countershading: sharks are pale underneath (lower half here), with a
  // dithered transition band instead of a hard line
  for (let y = 46; y < SHK_H - 4; y++) for (let x = 24; x < 172; x++) {
    if (!solid(x, y, 0.06)) continue;
    if (!solid(x, y + 1, 0.06)) { px(ctx, mid, x, y); continue; }
    // ordered dither, so the belly fades in cleanly instead of speckling
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const k = clamp((y - 46) / 24, 0, 1);
    if (BAYER[(y & 3) * 4 + (x & 3)] / 16 < k) px(ctx, mid, x, y);
  }
  // denticle texture over the back — the skin actually looks like sandpaper
  for (let y = 12; y < 46; y++) for (let x = 40; x < 160; x++) {
    if (!solid(x, y, 0.25)) continue;
    if (hash2(x * 7, y * 13) > 0.965) px(ctx, dark, x, y);
    else if (hash2(x * 5, y * 3) > 0.985) px(ctx, pale, x, y);
  }
  // dorsal ridge running down the spine
  for (let x = 48; x < 124; x++) {
    if (!solid(x, 44, 0.1)) continue;
    px(ctx, pale, x, 41, 1, 2); px(ctx, dark, x, 46, 1, 2);
  }
  // dorsal fin: a swept triangle standing proud of the back
  for (let i = 0; i < 32; i++) {
    const u = i / 31;
    const w = Math.round(2 + Math.sin(Math.pow(u, 0.7) * Math.PI) * 11);
    const x = 68 + i;
    px(ctx, CPAL.out, x, 44 - w - 2, 1, 2); px(ctx, CPAL.out, x, 44 + w, 1, 2);
    px(ctx, mid, x, 44 - w, 1, w * 2);
    px(ctx, pale, x, 44 - w, 1, Math.max(1, w));
    if (i > 23) px(ctx, dark, x, 44 - w, 1, w * 2);
    if ((i & 7) === 0 && w > 4) px(ctx, dark, x, 44 - w + 2, 1, 2);   // fin rays, just a hint
  }
  // gill slits, curved, five a side
  for (let g = 0; g < 5; g++) {
    const gx = 124 - g * 5;
    for (let y = 32; y <= 56; y++) {
      const bend = Math.round(Math.abs(y - 44) * 0.16);
      if (!solid(gx + bend, y, 0.45)) continue;
      px(ctx, dark, gx + bend, y);
    }
  }
  // eyes — small, black, mean, with a lid and a catchlight
  for (const ey of [27, 53]) {
    stamp(ctx, [
      '..kkkk..',
      '.kaaaak.',
      'kaaeeaak',
      'kaeeeeak',
      'kaeeeeak',
      'kaaeeaak',
      '.kaaaak.',
      '..kkkk..',
    ], 143, ey, { k: CPAL.out, a: rage ? '#6a1a12' : '#25313f', e: rage ? '#ff3a2a' : '#0b0f14' });
    px(ctx, CPAL.shine, 145, ey + 2, 2, 2);
    px(ctx, pale, 144, ey - 1, 6, 1);
  }
  // jaws under the snout, full of teeth
  for (let x = 152; x < 172; x++) {
    if (!solid(x, 44, 0.05)) continue;
    px(ctx, '#2a0d12', x, 39, 1, 10);
  }
  for (let i = 0; i < 6; i++) {
    const tx = 154 + i * 3;
    if (!solid(tx, 44, 0.05)) continue;
    px(ctx, CPAL.bone, tx, 39, 1, 2); px(ctx, CPAL.white, tx, 39);
    px(ctx, CPAL.bone, tx, 47, 1, 2); px(ctx, CPAL.white, tx, 48);
  }
  px(ctx, '#160508', 154, 42, 16, 3);     // gullet
  // battle scars
  for (let i = 0; i < 8; i++) { px(ctx, pale, 88 + i * 3, 24 + i * 2, 2, 1); px(ctx, dark, 88 + i * 3, 25 + i * 2, 2, 1); }
  for (let i = 0; i < 6; i++) { px(ctx, pale, 60 + i * 3, 62 - i * 2, 2, 1); px(ctx, dark, 60 + i * 3, 63 - i * 2, 2, 1); }
  return spriteFromHi(c, SHK_CX, SHK_CY);
}

// ---- the Chief himself, straddling the shark ------------------------------
function buildChief() {
  const c = newCan(52, 52), ctx = c.getContext('2d');
  const M = {
    k: CPAL.out, s: '#d9a06a', S: '#a9713f', d: '#7a4a22',
    r: CPAL.cape, R: CPAL.capeL, b: CPAL.leaD, B: CPAL.lea, L: CPAL.leaL,
    g: CPAL.gold, G: CPAL.goldL, w: CPAL.white, m: CPAL.met, M2: CPAL.metL,
  };
  // feathered headdress: each feather has a quill and a barb edge now
  const FCOL = [CPAL.cape, CPAL.gold, CPAL.capeL, CPAL.gold, CPAL.cape];
  for (let i = 0; i < 5; i++) {
    const fx = 11 + i * 7, h = 9 + (i === 2 ? 4 : (i === 1 || i === 3) ? 2 : 0);
    for (let y = 0; y < h; y++) {
      const barb = y > 1 ? 1 : 0;
      px(ctx, CPAL.out, fx - 1 - barb, 10 - h + y, 3 + barb * 2, 1);
      px(ctx, FCOL[i], fx - barb, 10 - h + y, 1 + barb * 2, 1);
      px(ctx, CPAL.woodDD, fx, 10 - h + y);              // quill
    }
    px(ctx, CPAL.bone, fx, 10 - h, 1, 2);
  }
  for (let x = 8; x < 44; x++) { px(ctx, CPAL.leaD, x, 10, 1, 3); px(ctx, CPAL.leaL, x, 10); }
  for (let x = 10; x < 42; x += 4) px(ctx, CPAL.gold, x, 11, 2, 1);
  // head + face paint
  const hcx = 26, hcy = 20;
  for (let y = hcy - 8; y <= hcy + 9; y++) {
    const hw = 9 * Math.sqrt(Math.max(0, 1 - Math.pow((y - hcy) / 9.6, 2)));
    if (hw < 1) continue;
    const x0 = Math.round(hcx - hw), x1 = Math.round(hcx + hw);
    for (let x = x0; x <= x1; x++) {
      const u = (x - hcx) / hw;
      px(ctx, u < -0.5 ? '#e8b782' : u > 0.55 ? '#7a4a22' : u > 0.2 ? '#a9713f' : '#d9a06a', x, y);
    }
    px(ctx, CPAL.out, x0, y); px(ctx, CPAL.out, x1, y);
  }
  // war paint: two bars across the eyes, a white jaw stripe
  px(ctx, CPAL.blood, 18, 17, 7, 2); px(ctx, CPAL.bloodD, 18, 19, 7, 1);
  px(ctx, CPAL.blood, 28, 17, 7, 2); px(ctx, CPAL.bloodD, 28, 19, 7, 1);
  for (const ex of [19, 29]) {
    px(ctx, CPAL.out, ex, 20, 5, 4); px(ctx, CPAL.white, ex + 1, 21, 3, 2);
    px(ctx, CPAL.out, ex + 2, 21, 2, 2);
  }
  px(ctx, CPAL.white, 20, 27, 12, 2); px(ctx, CPAL.out, 22, 28, 8, 1);
  // bare torso with a bone necklace and a leather harness
  for (let y = 30; y <= 44; y++) {
    const hw = 11 - Math.abs(y - 36) * 0.18;
    const x0 = Math.round(hcx - hw), x1 = Math.round(hcx + hw);
    for (let x = x0; x <= x1; x++) {
      const u = (x - hcx) / hw;
      let col = u < -0.45 ? '#e8b782' : u > 0.5 ? '#7a4a22' : u > 0.15 ? '#a9713f' : '#d9a06a';
      if (Math.abs(u) < 0.12 && y > 33) col = '#8a5527';                  // sternum
      if (y > 38 && Math.abs(u) < 0.6 && ((y - 38) % 3) === 0) col = '#8a5527';  // abs
      px(ctx, col, x, y);
    }
    px(ctx, CPAL.out, x0, y); px(ctx, CPAL.out, x1, y);
  }
  // bone necklace: individual teeth on a cord
  for (let i = 0; i < 7; i++) {
    const bx = 17 + i * 3, by = 31 + Math.abs(i - 3);
    px(ctx, CPAL.out, bx, by, 2, 4); px(ctx, CPAL.bone, bx, by, 1, 3); px(ctx, CPAL.white, bx, by);
  }
  // leather harness with stitching and a brass ring
  for (let x = 15; x < 38; x++) {
    px(ctx, CPAL.leaD, x, 36, 1, 4); px(ctx, CPAL.lea, x, 37, 1, 2); px(ctx, CPAL.leaL, x, 37);
    if ((x & 3) === 0) px(ctx, CPAL.creamD, x, 39);
  }
  px(ctx, CPAL.goldD, 24, 35, 6, 6); px(ctx, CPAL.gold, 25, 36, 4, 4); px(ctx, CPAL.out, 26, 37, 2, 2);
  return spriteFromHi(c, 26, 28);
}
function buildBossArt() {
  CH.shark     = buildShark(false);
  CH.sharkRage = buildShark(true);
  CH.sharkHurt = tintHi(CH.shark, '#ffffff', 0.82);
  CH.sharkRageHurt = tintHi(CH.sharkRage, '#ffffff', 0.82);
  CH.chief     = buildChief();
  CH.chiefHurt = tintHi(CH.chief, '#ffffff', 0.8);
  // keep the old sprite keys alive for the HUD's off-screen fin marker
  SP.shark = CH.shark; SP.sharkHurt = CH.sharkHurt; SP.sharkRage = CH.sharkRage;
}
