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
//  Every BOAT, shark, chief and shield canvas in this file is rasterized at
//  DETAIL art pixels per world unit, so one art pixel lands on (about) one
//  screen pixel instead of being blown up. The hero pair is the deliberate
//  exception: she is authored at 1 art pixel per world unit (see CHUNKY
//  CHARACTER ART below), is NOT registered here, and must never be. The sprite record still reports its size in WORLD units
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
// For the 2x art only — the boats, the shark, the chief. The chunky 1x hero
// pair below does its shading by hand, because a probabilistic grain at one
// art pixel per world unit is not texture, it is damage.
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
//  CHUNKY CHARACTER ART  (1x)
//  The hero pair is the one thing in this file that is NOT rasterized at
//  DETAIL art pixels per world unit. She is authored at ONE art pixel per
//  world unit and drawn through the rig at RIG_SCALE = 1, so a single art
//  pixel lands on a 2x2 block of screen pixels: half the resolution of the
//  machines around her and twice the size on screen. Nothing built here is
//  registered in HIRES — the 1/DETAIL bridge must not touch it — and the
//  sprite records are plain `spriteFrom` records whose w/h ARE the art size.
//
//  Authoring rules for this half of the file:
//    * bold blocking first. Four bands of hide, a hard black rim, one lit
//      top edge and one shadowed bottom edge. No grain, no speckle: a single
//      stray pixel is 2x2 on screen and reads as damage.
//    * every feature is at least 2px, except the deliberate 1px creases.
//    * her eye is a DOT — one bead and one glint. Never an anatomical eye.
// ===========================================================================
function tintFlat(s, color, alpha) {
  const c = newCan(s.c.width, s.c.height), ctx = c.getContext('2d');
  ctx.drawImage(s.c, 0, 0);
  ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = alpha;
  ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
  return { c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}
// ===========================================================================
//  WAR MANATEE  — top-down, facing RIGHT, one art pixel per world unit
// ===========================================================================
const MAN_W = 94, MAN_H = 42, MAN_CX = 47, MAN_CY = 21;

// Her own hide ramp, wider than the shared CPAL one: four bands is all this
// grid can hold, so they have to be far enough apart to read as a rounded
// back, and every detail pass below picks its colour from the SAME ramp or
// the detail simply disappears into the band underneath it.
const HD = { dd: '#211d27', d: '#3b3743', m: '#5b5765', l: '#837f91', ll: '#a9a6b6', pale: '#c6c4d2' };
// Her half-beam, in art pixels, keyed along her length. A hand-keyed curve
// beats a field of blobs at this resolution: the blobs smooth into a heap of
// lumps, where a curve gives a fluke that is plainly a fluke, a waist that is
// plainly a waist and a head that is plainly a head.
const MAN_KEYS = [
  [2, 10], [3, 12], [5, 13], [9, 12.8], [13, 11.6], [17, 9.4], [21, 7.4],
  [25, 7.0], [28, 8.6], [32, 11.2], [38, 14.0], [44, 15.8], [50, 16.0],
  [56, 15.4], [61, 14.0], [66, 12.2], [70, 10.6], [74, 9.6], [78, 8.8],
  [83, 8.0], [87, 6.6], [90, 4.6], [92, 2.4],
];
function manHalf(x) {
  if (x < MAN_KEYS[0][0] || x > MAN_KEYS[MAN_KEYS.length - 1][0]) return -1;
  for (let i = 1; i < MAN_KEYS.length; i++) {
    const [x1, h1] = MAN_KEYS[i];
    if (x > x1) continue;
    const [x0, h0] = MAN_KEYS[i - 1];
    return h0 + (h1 - h0) * (x - x0) / (x1 - x0);
  }
  return -1;
}
function buildManateeBody(armored) {
  const cyy = MAN_CY, c = newCan(MAN_W, MAN_H), ctx = c.getContext('2d');
  const span = new Int16Array(MAN_W * 2);
  // ---- the body, painted in five bands from a lit back to a dark keel.
  //      One pass, hard edges, no gradients: this is the whole animal.
  for (let x = 0; x < MAN_W; x++) {
    const hw = manHalf(x);
    span[x * 2] = 1; span[x * 2 + 1] = -1;
    if (hw < 0.8) continue;
    const y0 = Math.round(cyy - hw), y1 = Math.round(cyy + hw);
    span[x * 2] = y0; span[x * 2 + 1] = y1;
    const h = y1 - y0;
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1) { px(ctx, CPAL.out, x, y); continue; }
      const t = (y - y0) / h;
      px(ctx, t < 0.14 ? HD.ll : t < 0.32 ? HD.l : t < 0.60 ? HD.m : t < 0.82 ? HD.d : HD.dd, x, y);
    }
  }
  const solid = (x, y) => x >= 0 && x < MAN_W && y > span[x * 2] && y < span[x * 2 + 1];
  const edgeCol = (x, y) => { const y0 = span[x * 2], y1 = span[x * 2 + 1]; const t = (y - y0) / (y1 - y0); return t < 0.14 ? HD.ll : t < 0.32 ? HD.l : t < 0.60 ? HD.m : t < 0.82 ? HD.d : HD.dd; };
  // ---- the nose and tail caps: round the two ends off by hand
  for (let y = cyy - 2; y <= cyy + 2; y++) px(ctx, CPAL.out, 93, y);
  // ---- fluke: five ridges fanning out of the peduncle, and a pale trailing
  //      edge. This is what makes the paddle read as a paddle.
  for (const i of [-1, 1]) {
    for (let x = 8; x < 22; x++) {
      const y = Math.round(cyy + i * 5 + (22 - x) * i * 0.22);
      if (!solid(x, y)) continue;
      px(ctx, HD.dd, x, y);
    }
  }
  for (let y = 7; y < MAN_H - 7; y++) if (solid(3, y)) px(ctx, HD.pale, 3, y);
  // ---- two transverse skin folds across the barrel
  for (const fx of [40, 57]) for (let y = 3; y < MAN_H - 3; y++) {
    const x = fx + Math.round(Math.sin((y - cyy) / 16) * 3);
    if (!solid(x, y) || !solid(x, y + 1)) continue;
    px(ctx, HD.dd, x, y);
    if (solid(x - 1, y)) px(ctx, edgeCol(x - 1, y) === HD.dd ? HD.d : HD.ll, x - 1, y);
  }
  // ---- the step where her neck meets her shoulders, so the head is a head
  for (let y = 4; y < MAN_H - 4; y++) {
    if (!solid(69, y)) continue;
    px(ctx, HD.dd, 69, y);
    if (solid(70, y)) px(ctx, HD.ll, 70, y);
  }
  // ---- two old propeller gashes across the back
  for (let i = 0; i < 7; i++) { if (solid(44 + i, 8 + i)) { px(ctx, HD.pale, 44 + i, 8 + i); px(ctx, HD.dd, 44 + i, 9 + i); } }
  for (let i = 0; i < 5; i++) { if (solid(58 + i, 32 - i)) { px(ctx, HD.pale, 58 + i, 32 - i); px(ctx, HD.dd, 58 + i, 33 - i); } }
  // ---- three barnacles. A dozen would only read as noise at this size.
  for (const [bx, by] of [[38, 12], [54, 28], [33, 25]]) {
    if (!solid(bx, by)) continue;
    px(ctx, HD.dd, bx - 1, by - 1, 4, 4);
    px(ctx, CPAL.bone, bx, by, 2, 2);
    px(ctx, CPAL.white, bx, by);
  }

  // ---- head ---------------------------------------------------------------
  // The eye is a DOT: one black bead with one glint, ringed by a pale socket
  // so it survives against whichever band of hide it lands on.
  for (const ey of [11, 25]) {
    px(ctx, HD.pale, 72, ey, 6, 1);
    px(ctx, CPAL.out, 73, ey + 1, 4, 4);
    px(ctx, CPAL.eye, 73, ey + 1, 3, 3);
    px(ctx, CPAL.shine, 74, ey + 2);
  }
  // whisker pad: the brightest block on her, right at the front, so the
  // silhouette has a face end and a tail end at any distance
  stamp(ctx, [
    '.kkkkkkk.',
    'kPPPPPPPk',
    'kPPPPPPPk',
    'kPwPPwPPk',
    'kPPPPPPPk',
    'kPPPPPPPk',
    '.kkkkkkk.',
  ], 81, cyy - 3, { k: CPAL.out, P: HD.ll, w: HD.d });
  px(ctx, HD.pale, 82, cyy - 2, 7, 1);
  // nostrils, and a mouth crease under the pad
  px(ctx, CPAL.out, 88, cyy - 4, 2, 2); px(ctx, HD.pale, 88, cyy - 5, 2, 1);
  px(ctx, CPAL.out, 88, cyy + 3, 2, 2); px(ctx, HD.pale, 88, cyy + 2, 2, 1);
  for (const [wx, wy] of [[90, cyy - 6], [90, cyy + 5], [91, cyy - 2], [91, cyy + 1]]) px(ctx, CPAL.bone, wx, wy, 2, 1);

  if (armored) {
    // ---- ONE riveted back plate, aft of the saddle where it can be seen,
    //      and a collar over her neck. She is an animal wearing armour, not
    //      a tank: most of what you see has to stay hide.
    const plates = [[32, 11, 12, 21]];
    for (const [pxx, pyy, pw, ph] of plates) {
      for (let y = pyy; y < pyy + ph; y++) for (let x = pxx; x < pxx + pw; x++) {
        if (!solid(x, y, 0.10)) continue;
        const e = x === pxx || x === pxx + pw - 1 || y === pyy || y === pyy + ph - 1;
        let col = e ? CPAL.out : (y < pyy + 3 ? CPAL.metL : y > pyy + ph - 4 ? CPAL.metDD : CPAL.metD);
        if (!e && y >= pyy + 3 && y <= pyy + 5) col = CPAL.met;
        px(ctx, col, x, y);
      }
      for (const [rx, ry] of [[pxx + 2, pyy + 3], [pxx + pw - 4, pyy + 3], [pxx + 2, pyy + ph - 5], [pxx + pw - 4, pyy + ph - 5]]) {
        px(ctx, CPAL.out2, rx, ry, 2, 2); px(ctx, CPAL.metLL, rx, ry);
      }
      for (let i = 0; i < 4; i++) px(ctx, CPAL.metLL, pxx + 3 + i, pyy + 8 + i);
      px(ctx, '#8a4a22', pxx + pw - 3, pyy + ph - 9, 1, 6);   // a rust weep
    }
    // ---- steel collar round her neck, right behind the head
    for (let x = 64; x <= 72; x++) for (let y = 2; y < MAN_H - 2; y++) {
      if (!solid(x, y, 0.06)) continue;
      const top = !solid(x, y - 1, 0.06), bot = !solid(x, y + 1, 0.06);
      px(ctx, x === 64 || x === 72 ? CPAL.out : top ? CPAL.metLL : bot ? CPAL.metDD : (x < 67 ? CPAL.met : CPAL.metD), x, y);
    }
    for (const cy2 of [cyy - 8, cyy, cyy + 8]) { px(ctx, CPAL.out2, 66, cy2, 2, 2); px(ctx, CPAL.metLL, 66, cy2); }
    px(ctx, CPAL.goldD, 68, cyy - 3, 4, 7); px(ctx, CPAL.gold, 68, cyy - 3, 3, 6);
    px(ctx, CPAL.goldL, 68, cyy - 3, 2, 1);
    // ---- leather harness: one strap right round her, with a brass buckle
    for (const sx of [48]) {
      for (let y = 2; y < MAN_H - 2; y++) {
        if (!solid(sx, y, 0.04)) continue;
        px(ctx, CPAL.leaD, sx, y, 3, 1);
        px(ctx, CPAL.lea, sx, y, 2, 1);
        if ((y & 3) === 1) px(ctx, CPAL.creamD, sx + 1, y);
      }
      px(ctx, CPAL.out, sx - 1, cyy - 3, 5, 7);
      px(ctx, CPAL.gold, sx, cyy - 2, 3, 5);
      px(ctx, CPAL.goldL, sx, cyy - 2, 3, 1);
      px(ctx, CPAL.goldD, sx, cyy + 2, 3, 1);
      px(ctx, CPAL.out, sx + 1, cyy, 1, 2);
    }
    // ---- shoulder spikes: out at the widest point, where they break the
    //      silhouette instead of disappearing into the back
    stamp(ctx, ['..kk..', '.kLLk.', 'kLMMLk', 'kMMMMk', 'kkkkkk'], 43, 2, { k: CPAL.out, M: CPAL.met, L: CPAL.metLL });
    stamp(ctx, ['kkkkkk', 'kMMMMk', 'kLMMLk', '.kLLk.', '..kk..'], 43, MAN_H - 7, { k: CPAL.out, M: CPAL.met, L: CPAL.metLL });
    // ---- a brass ring through the snout: the fleet put it there
    px(ctx, CPAL.goldD, 89, cyy - 3, 2, 7);
    px(ctx, CPAL.goldL, 89, cyy - 3, 2, 1);
    px(ctx, CPAL.goldD, 91, cyy - 1, 2, 3);
  }
  return spriteFrom(c, MAN_CX, MAN_CY);
}

// ---- saddle (sits mid-back, the otter perches here) -----------------------
function buildSaddle() {
  const W = 19, H = 17, c = newCan(W, H), ctx = c.getContext('2d');
  stamp(ctx, [
    '..kkkkkkkkkkkkk..',
    '.kLLLLLLLLLLLLLk.',
    'kLlllllllllllllLk',
    'kLlddddddddddddlk',
    'kLldDDDDDDDDDDdlk',
    'kLldDDDDDDDDDDdlk',
    'kLldDDDDDDDDDDdlk',
    'kLlddddddddddddlk',
    'kLlllllllllllllLk',
    '.kLLLLLLLLLLLLLk.',
    '..kkkkkkkkkkkkk..',
  ], 1, 3, { k: CPAL.out, L: CPAL.leaL, l: CPAL.lea, d: CPAL.leaD, D: '#3a2412' });
  // stitched seam inside the rolled rim
  for (let x = 3; x < 16; x += 2) { px(ctx, CPAL.cream, x, 6); px(ctx, CPAL.cream, x, 11); }
  // brass studs down both flanks
  for (let i = 0; i < 3; i++) {
    const sx = 4 + i * 5;
    px(ctx, CPAL.goldD, sx, 5, 2, 2); px(ctx, CPAL.gold, sx, 5);
    px(ctx, CPAL.goldD, sx, 11, 2, 2); px(ctx, CPAL.gold, sx, 11);
  }
  return spriteFrom(c, 9, 8);
}

// ---- flipper --------------------------------------------------------------
function buildFlipper() {
  const W = 16, H = 11;
  const f = blobField(W, H, [{ x: 4, y: 5, rx: 4.6, ry: 4.8 }, { x: 9, y: 5, rx: 5.4, ry: 4.2 }, { x: 13, y: 5, rx: 3.4, ry: 2.8 }]);
  const { c, ctx } = shadeBlob(W, H, f, [CPAL.manDD, CPAL.manD, CPAL.man], { outline: CPAL.out, lift: 0.10, smooth: 1, contrast: 0.7 });
  px(ctx, CPAL.manL, 3, 2, 5, 1);
  for (let i = 0; i < 3; i++) px(ctx, CPAL.bone, 12 - i, 3 + i * 2);   // nails
  return spriteFrom(c, 3, 5);
}

// ---- pirate flag on a pole (flies behind the saddle) ----------------------
function buildFlag(frame) {
  const W = 20, H = 18, c = newCan(W, H), ctx = c.getContext('2d');
  const wav = [0, 1, 2, 1, 0, -1, -2, -1][frame & 7];
  for (let y = 0; y < 12; y++) {
    const ph = (y / 12) * 3.1 + frame * 0.8;
    const off = Math.round(Math.sin(ph) * 1.5 + wav * 0.4);
    const lit = Math.cos(ph);
    for (let x = 0; x < 15; x++) {
      const yy = 3 + y + off;
      let col = CPAL.hatD;
      if (lit > 0.45) col = CPAL.hat;
      if (lit < -0.55) col = CPAL.out2;
      if (y === 0 || y === 11 || x > 13) col = CPAL.out2;
      px(ctx, col, 3 + x, yy);
    }
  }
  // a skull, reduced to the two black sockets and a jaw that still reads
  const off0 = Math.round(Math.sin(0.45 * 3.1 + frame * 0.8) * 1.5 + wav * 0.4);
  stamp(ctx, [
    '.WWWW.',
    'WWWWWW',
    'WkWWkW',
    'WWWWWW',
    '.WkkW.',
    '.WWWW.',
  ], 7, 6 + off0, { k: CPAL.out, W: CPAL.white });
  return spriteFrom(c, 2, 9);
}

// ===========================================================================
//  CAPTAIN OTTER — rides the saddle, aims 360 degrees.
//  Authored at the size he is DRAWN at in the rig (scale 1), one art pixel
//  per world unit, so every part of the pair shares one pixel grid.
// ===========================================================================
function buildOtterTorso() {
  const W = 21, H = 19, c = newCan(W, H), ctx = c.getContext('2d');
  const M = { k: CPAL.out, C: CPAL.cape, c: CPAL.capeD, L: CPAL.capeL,
              f: CPAL.fur, d: CPAL.furD, l: CPAL.furL, r: CPAL.cream };
  // cape: a collar behind the shoulders that falls away aft, not a curtain
  stamp(ctx, [
    '...kkkkkkkkk...',
    '.kkcCCCCCCCckk.',
    'kcCCCCCCCCCCCck',
    'kCCCCCCCCCCCCCk',
    '.kcCCCCCCCCCck.',
    '..kcCCCCCCCck..',
    '...kkcCCCckk...',
    '.....kkkkk.....',
  ], 3, 9, M);
  // torso: shoulders at the top, a cream chest, hips at the bottom
  stamp(ctx, [
    '...kkkkkkk...',
    '.kkddfffddkk.',
    'kdffffffffdk.',
    'kdfflrrrlffdk',
    'kdflrrrrrlfdk',
    'kdflrrrrrlfdk',
    'kdfflrrrlffdk',
    'kddffffffddk.',
    '.kkddffddkk..',
    '...kkkkkk....',
  ], 4, 1, M);
  // bandolier across the chest, with two brass rounds in the loops
  for (let i = 0; i < 8; i++) {
    const x = 6 + i, y = 4 + i;
    px(ctx, CPAL.leaD, x, y, 1, 2); px(ctx, CPAL.lea, x, y);
    if (i === 2 || i === 5) px(ctx, CPAL.goldL, x, y + 1);
  }
  // the buckle over the heart
  px(ctx, CPAL.out, 10, 8, 3, 3); px(ctx, CPAL.gold, 11, 9); px(ctx, CPAL.goldL, 10, 8);
  // salvaged steel pauldrons, tucked in at the shoulders
  for (const sx of [4, 14]) {
    px(ctx, CPAL.out, sx, 2, 3, 4);
    px(ctx, CPAL.metL, sx, 3, 3, 2);
    px(ctx, CPAL.metD, sx, 5, 3, 1);
    px(ctx, CPAL.metLL, sx + 1, 3);
  }
  return spriteFrom(c, 10, 9);
}

// Head + tricorn hat. The face is NOT baked in — drawOtterFace paints it live
// onto CH.headBuf so the expression can change every frame.
function buildOtterHead() {
  const W = 19, H = 17, c = newCan(W, H), ctx = c.getContext('2d');
  const M = { k: CPAL.out, f: CPAL.fur, d: CPAL.furD, D: CPAL.furDD, l: CPAL.furL,
              h: CPAL.hat, H: CPAL.hatL, x: CPAL.hatD, X: CPAL.hatLL, W: CPAL.white };
  // ears first, so the skull overlaps them
  stamp(ctx, ['kkk', 'kDk', 'kfk', 'kkk'], 1, 5, M);
  stamp(ctx, ['kkk', 'kDk', 'kfk', 'kkk'], 15, 5, M);
  // skull: wide cheeks, narrow chin
  stamp(ctx, [
    '.kkkkkkkkkkk.',
    'kdffffffffdk.',
    'kffffffffffk',
    'kffffffffffk',
    'kffffffffffk',
    'kdffffffffdk',
    '.kdffffffdk.',
    '..kddffddk..',
    '...kkkkkk...',
  ], 3, 5, M);
  // tricorn: a wide brim over the brow, a low crown, a gold band
  stamp(ctx, [
    '....kkkkkkk....',
    '...kxhhhhhxk...',
    '.kkxhhhHHHhxkk.',
    'kxhhhhhhhhhhhxk',
    'kXxxxxxxxxxxxXk',
  ], 2, 0, M);
  for (let x = 2; x < 17; x++) { px(ctx, CPAL.goldD, x, 5); px(ctx, CPAL.goldL, x, 4); }
  px(ctx, CPAL.out, 2, 5); px(ctx, CPAL.out, 16, 5);
  // the skull badge on the crown
  stamp(ctx, ['WWW', 'WkW'], 8, 1, M);
  return spriteFrom(c, 9, 9);
}

// Muzzle + expression, drawn live over the head raster.
// exp: 'idle' | 'happy' | 'angry' | 'talk' | 'surprised' | 'hurt' | 'pain' | 'drown'
function drawOtterFace(ctx, exp, blink, t) {
  const O = CPAL.out, C = CPAL.cream, CD = CPAL.creamD, E = CPAL.eye, W = CPAL.shine;
  // muzzle pad and nose leather, always there
  stamp(ctx, [
    '.kkkkk.',
    'kCCCCCk',
    'kCCCCCk',
    '.kCCCk.',
  ], 6, 10, { k: O, C });
  px(ctx, CD, 7, 12, 5, 1);
  px(ctx, O, 8, 10, 3, 2); px(ctx, '#8a5b46', 8, 10, 2, 1);

  if (exp === 'drown' || exp === 'pain') {
    for (const ex of [4, 12]) { px(ctx, O, ex, 8, 3, 1); px(ctx, CPAL.furDD, ex, 7, 3, 1); }
    const g = Math.floor(t * 4) & 1;
    px(ctx, O, 7, 13, 5, 2 + g);
    px(ctx, CPAL.bloodD, 8, 14, 3, g);
    return;
  }
  const shut = blink || exp === 'happy';
  for (const ex of [4, 12]) {
    if (shut) { px(ctx, O, ex, 8, 3, 1); continue; }
    const big = exp === 'surprised' ? 1 : 0;
    px(ctx, O, ex - big, 6 - big, 3 + big * 2, 4 + big * 2);
    px(ctx, CPAL.white, ex, 7, 2, 2);
    px(ctx, E, ex + 1, 7);
    px(ctx, W, ex, 7);
  }
  // brows say the mood at this size more than the eyes do
  if (exp === 'angry') {
    px(ctx, CPAL.furDD, 3, 5, 4, 1); px(ctx, CPAL.furDD, 5, 6, 2, 1);
    px(ctx, CPAL.furDD, 12, 5, 4, 1); px(ctx, CPAL.furDD, 12, 6, 2, 1);
  } else if (exp === 'surprised') { px(ctx, CPAL.furDD, 3, 4, 4, 1); px(ctx, CPAL.furDD, 12, 4, 4, 1); }
  // mouth
  if (exp === 'happy') { px(ctx, O, 7, 14, 5, 1); px(ctx, O, 6, 13); px(ctx, O, 12, 13); px(ctx, CPAL.white, 8, 13, 3, 1); }
  else if (exp === 'angry') { px(ctx, O, 7, 14, 5, 2); px(ctx, CPAL.white, 8, 14); px(ctx, CPAL.white, 10, 14); }
  else if (exp === 'talk') { const o = Math.floor(t * 9) & 1; px(ctx, O, 8, 13, 4, 2 + o); px(ctx, CPAL.blood, 9, 14, 2, o); }
  else if (exp === 'surprised') { px(ctx, O, 8, 13, 3, 3); px(ctx, CPAL.bloodD, 9, 14); }
  else { px(ctx, O, 7, 14, 5, 1); }
  // two whiskers a side, short, so they do not read as a moustache
  px(ctx, CD, 4, 12, 2, 1); px(ctx, CD, 13, 12, 2, 1);
}

// ---- cigar (clamped in the muzzle, ember at the far end) ------------------
function buildCigar() {
  const c = newCan(9, 4), ctx = c.getContext('2d');
  stamp(ctx, [
    'kkkkkkk..',
    'kDDDDDek.',
    'kDdddDEe.',
    'kkkkkkk..',
  ], 0, 0, { k: CPAL.out, D: CPAL.woodDD, d: CPAL.woodD, e: CPAL.ember, E: CPAL.emberL });
  px(ctx, CPAL.goldD, 2, 2);
  return spriteFrom(c, 0, 2);
}

// ---- arm (shoulder at the anchor, paw at the far end) ---------------------
function buildOtterArm() {
  const c = newCan(11, 6), ctx = c.getContext('2d');
  stamp(ctx, [
    '.kkkkkkk..',
    'kdffffdDk.',
    'kfffffflDk',
    'kdffffdDk.',
    '.kkkkkkk..',
  ], 0, 0, { k: CPAL.out, f: CPAL.fur, d: CPAL.furD, D: CPAL.furDD, l: CPAL.furL });
  px(ctx, CPAL.furL, 2, 1, 4, 1);
  // leather cuff, then the paw
  px(ctx, CPAL.lea, 6, 1, 2, 3); px(ctx, CPAL.leaL, 6, 1, 2, 1);
  px(ctx, CPAL.out, 8, 1, 3, 4);
  px(ctx, CPAL.furD, 8, 2, 2, 2);
  px(ctx, CPAL.fur, 8, 2, 1, 1);
  return spriteFrom(c, 1, 3);
}

function buildOtterTail() {
  const W = 14, H = 8;
  const f = blobField(W, H, [{ x: 3, y: 4, rx: 4.0, ry: 3.6 }, { x: 7, y: 4, rx: 4.2, ry: 3.0 }, { x: 11, y: 4, rx: 3.2, ry: 2.2 }]);
  const { c, ctx } = shadeBlob(W, H, f, [CPAL.furDD, CPAL.furD, CPAL.fur], { outline: CPAL.out, lift: 0.22, smooth: 1, contrast: 0.7 });
  for (let x = 2; x < 12; x++) if (f[3 * W + x] > 0.2) px(ctx, CPAL.furL, x, 3);
  return spriteFrom(c, 2, 4);
}


// ===========================================================================
//  THE CANONICAL CAST  —  one set of character sprites, used everywhere
//  ---------------------------------------------------------------------
//  Every scene in the game draws the hero pair from the parts below. Nothing
//  outside this file should rasterize a manatee or an otter of its own: if a
//  pose is missing, add it here and it is instantly the same character in
//  every beat of the game.
//
//  ALL of it is 1 art pixel per world unit. Draw it at an INTEGER scale
//  (1, 2, 3) so the chunky grid stays square; the gameplay rig draws it at 1.
//
//  TOP-DOWN (bow/nose to the RIGHT, mirror with ctx.scale(-1,1)):
//    CH.manatee / CH.manateeArmor      whole body, unarmoured / armoured
//    CH.manateeHurtP / CH.manateeHurt  the same, white-hot for a hit frame
//    CH.manateeBelly / CH.manateeBellyA  belly-up (she has rolled over)
//    CH.manPFore/manPFluke (+manA...)  the body cut at the peduncle, for a
//                                      fluke that lags; MAN_PIV is the pivot
//    CH.flipper, CH.saddle, CH.flags[8]
//  OTTER (built at the size he rides at — draw him at scale 1 beside her):
//    CH.otterTorso, CH.otterHead, CH.otterArm, CH.otterTail, CH.cigar
//    CH.otterRage / CH.headRage        rampage tint
//    otterHeadWithFace(exp, blink, t, rage) -> a live head canvas
//    CH.drawOtter(ctx, o)              the whole otter, posed, in one call
//  SIDE-ON (facing RIGHT), the cinematic set:
//    CH.side.body / .bodyScar / .belly / .fluke / .flip / .flipFar
//    CH.side.eye / .mouth / .tailX / .shoX / .shoY   anchors, sprite-local
//    CH.drawManateeSide(ctx, m)        body + fluke + flippers + face
//    CH.sideFace(ctx, exp, blink, t)   just the face, at the anchors
//    CH.otterStand                     side-on, standing, facing right
//    CH.drawOtterStanding(ctx, o)      standing/working/holding, one call
// ===========================================================================

// ---- belly-up: the same body, drained of the back's colour ---------------
function buildManateeBelly(src) {
  const c = newCan(src.c.width, src.c.height), ctx = c.getContext('2d');
  ctx.drawImage(src.c, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.72; ctx.fillStyle = CPAL.belly;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // a pale keel line down the middle and two old boat scars across it
  for (let x = 10; x < src.c.width - 8; x += 2) px(ctx, '#c9d6e2', x, MAN_CY);
  for (let i = 0; i < 7; i++) { px(ctx, CPAL.blood, 34 + i, 11 + i); px(ctx, CPAL.bloodD, 34 + i, 12 + i); }
  for (let i = 0; i < 5; i++) px(ctx, CPAL.bloodD, 52 + i, 30 - i);
  return spriteFrom(c, src.ax, src.ay);
}

// ===========================================================================
//  SIDE-ON MANATEE — facing RIGHT. The cinematics' hero.
// ===========================================================================
const MSIDE_W = 98, MSIDE_H = 40, MSIDE_CX = 49, MSIDE_CY = 20;
function buildManateeSideBody(scarred) {
  const W = MSIDE_W, H = MSIDE_H, cy = MSIDE_CY;
  const lobes = [
    { x: 8,  y: cy,     rx: 4.5,  ry: 4.0 },
    { x: 16, y: cy,     rx: 6.5,  ry: 6.4 },
    { x: 26, y: cy,     rx: 8.5,  ry: 9.2 },
    { x: 38, y: cy,     rx: 11.0, ry: 12.0 },
    { x: 52, y: cy,     rx: 12.0, ry: 13.0 },
    { x: 64, y: cy - 1, rx: 11.0, ry: 12.0 },
    { x: 74, y: cy - 2, rx: 9.0,  ry: 10.2 },
    { x: 83, y: cy - 2, rx: 7.0,  ry: 8.2 },
    { x: 90, y: cy - 1, rx: 5.0,  ry: 6.2 },
  ];
  const f = blobField(W, H, lobes);
  const { c, ctx } = shadeBlob(W, H, f, [CPAL.manDD, CPAL.manD, CPAL.man, CPAL.manL],
    { outline: CPAL.out, lx: -0.25, ly: -0.92, contrast: 0.74, lift: 0.26, smooth: 2 });
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0;
  // ---- pale belly: the bottom third of every column, in two bands
  for (let x = 0; x < W; x++) {
    let y0 = -1, y1 = -1;
    for (let y = 0; y < H; y++) if (inside(x, y)) { if (y0 < 0) y0 = y; y1 = y; }
    if (y0 < 0 || y1 - y0 < 5) continue;
    const hgt = y1 - y0;
    for (let y = y0 + 1; y < y1; y++) {
      const k = (y - y0) / hgt;
      if (k < 0.66) continue;
      px(ctx, k > 0.82 ? '#b2c0cf' : CPAL.belly, x, y);
    }
    px(ctx, CPAL.manL, x, y0 + 1);          // lit back
    px(ctx, CPAL.out2, x, y1);              // dark keel
  }
  // ---- three transverse folds, bowed with the barrel
  for (const fx of [34, 48, 62]) for (let y = 2; y < H - 2; y++) {
    const x = fx + Math.round(Math.sin((y - cy) / 14) * 2);
    if (!inside(x, y) || !inside(x, y + 1) || !inside(x - 2, y)) continue;
    px(ctx, CPAL.manDD, x, y);
  }
  // ---- algae on the back, barnacles on the shoulder
  for (const [bx, by] of [[44, 10], [58, 9], [30, 13]]) {
    px(ctx, '#3f6b4c', bx, by, 3, 1); px(ctx, '#2d4f38', bx + 1, by + 1, 2, 1);
  }
  for (const [bx, by] of [[68, 12], [40, 14]]) { px(ctx, CPAL.manDD, bx, by, 3, 3); px(ctx, CPAL.bone, bx + 1, by + 1, 2, 2); }
  // ---- flipper socket crease
  for (let i = 0; i < 6; i++) px(ctx, CPAL.manDD, 72 + i, 24 + (i >> 1));
  // ---- head: the DOT eye, the nostril and the mouth crease
  px(ctx, CPAL.out, 81, 13, 4, 4); px(ctx, CPAL.eye, 81, 13, 3, 3); px(ctx, CPAL.shine, 82, 14);
  px(ctx, CPAL.manL, 81, 12, 4, 1);
  px(ctx, CPAL.out, 92, 15, 2, 2);                          // nostril
  px(ctx, CPAL.manL, 88, 20, 6, 1);                         // lit whisker pad
  px(ctx, CPAL.out2, 88, 23, 6, 1);                         // mouth crease
  for (const [wx, wy] of [[95, 19], [95, 22], [94, 17]]) px(ctx, CPAL.bone, wx, wy, 2, 1);
  if (scarred) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 7; j++) {
      const x = 44 + i * 7 + Math.round(j * 0.5), y = 9 + j;
      if (!inside(x, y)) continue;
      px(ctx, CPAL.blood, x, y, 2, 1); px(ctx, CPAL.bloodD, x, y + 1, 2, 1);
    }
  }
  return spriteFrom(c, MSIDE_CX, MSIDE_CY);
}
function buildSideFluke() {
  const W = 26, H = 18;
  const f = blobField(W, H, [
    { x: 23, y: 9, rx: 3.5, ry: 3.0 },
    { x: 18, y: 9, rx: 5.0, ry: 5.0 },
    { x: 12, y: 9, rx: 6.0, ry: 7.0 },
    { x: 6,  y: 9, rx: 6.0, ry: 8.4 },
    { x: 2,  y: 9, rx: 3.5, ry: 6.5 },
  ]);
  const { c, ctx } = shadeBlob(W, H, f, [CPAL.manDD, CPAL.manD, CPAL.man], { outline: CPAL.out, lift: 0.16, smooth: 2, contrast: 0.7 });
  for (let i = -1; i <= 1; i += 2) for (let x = 3; x < 20; x++) {
    const y = 9 + i * 3 + Math.round((20 - x) * i * 0.12);
    if (f[y * W + x] > 0.06) px(ctx, CPAL.manDD, x, y);
  }
  for (let y = 3; y < 15; y++) if (f[y * W + 1] > 0.02) px(ctx, CPAL.manL, 1, y);
  return spriteFrom(c, W - 2, 9);
}
function buildSideFlipper(dark) {
  const W = 16, H = 10;
  const f = blobField(W, H, [
    { x: 3,  y: 4, rx: 3.4, ry: 4.2 },
    { x: 7,  y: 5, rx: 4.0, ry: 4.0 },
    { x: 11, y: 6, rx: 3.6, ry: 3.2 },
    { x: 14, y: 6, rx: 2.2, ry: 2.2 },
  ]);
  const ramp = dark ? [CPAL.manDD, CPAL.manDD, CPAL.manD] : [CPAL.manDD, CPAL.manD, CPAL.man];
  const { c, ctx } = shadeBlob(W, H, f, ramp, { outline: CPAL.out, lift: 0.12, smooth: 1, contrast: 0.7 });
  if (!dark) for (let i = 0; i < 3; i++) px(ctx, CPAL.bone, 12 + (i & 1), 4 + i * 2);
  return spriteFrom(c, 2, 4);
}
function buildManateeSideSet() {
  const body = buildManateeSideBody(false);
  return {
    body, bodyScar: buildManateeSideBody(true),
    belly: buildManateeBelly(body),
    hurt: tintFlat(body, '#ffffff', 0.85),
    fluke: buildSideFluke(),
    flip: buildSideFlipper(false),
    flipFar: buildSideFlipper(true),
    // anchors, in sprite-local world units (0,0 = her centre)
    eye: [82 - MSIDE_CX, 14 - MSIDE_CY],
    mouth: [91 - MSIDE_CX, 23 - MSIDE_CY],
    tailX: 8 - MSIDE_CX, shoX: 74 - MSIDE_CX, shoY: 25 - MSIDE_CY,
    len: MSIDE_W,
  };
}
// Her face, live, at the side set's anchors. exp: calm|angry|sad|wide|pain|dead|talk
function manateeSideFace(ctx, exp, blink, t) {
  const S = CH.side; if (!S) return;
  const ex = S.eye[0], ey = S.eye[1], mx = S.mouth[0], my = S.mouth[1];
  const O = CPAL.out;
  const shut = blink && exp !== 'dead' && exp !== 'wide';
  if (exp === 'pain' || shut) {
    px(ctx, O, ex - 1, ey, 5, 1); px(ctx, CPAL.manDD, ex - 1, ey - 2, 5, 1);
  } else if (exp === 'dead') {
    px(ctx, O, ex - 1, ey - 1, 5, 5); px(ctx, '#5c5668', ex, ey, 3, 3);
  } else {
    const big = exp === 'wide' ? 1 : 0;
    px(ctx, O, ex - 1 - big, ey - 1 - big, 5 + big * 2, 5 + big * 2);
    px(ctx, CPAL.eye, ex - big, ey - big, 3 + big * 2, 3 + big * 2);
    px(ctx, CPAL.shine, ex + 1, ey);
    if (exp === 'angry') { px(ctx, CPAL.manDD, ex - 2, ey - 2, 6, 1); px(ctx, CPAL.manDD, ex + 1, ey - 3, 4, 1); }
    else if (exp === 'sad') { px(ctx, CPAL.manDD, ex - 3, ey - 3, 5, 1); }
  }
  const open = exp === 'wide' || exp === 'pain' || (exp === 'talk' && (Math.floor(t * 7) & 1));
  if (open) { px(ctx, O, mx - 2, my - 1, 6, 4); px(ctx, '#2a1218', mx - 1, my, 4, 2); }
  else px(ctx, O, mx - 2, my, 6, 1);
}
// One call for the whole side-on animal.
//  m: {x, y, rot, flip, sx, sy, phase, tailAmp, flipperA, exp, blink, belly,
//      scarred, hurt, alpha, scale}
function drawManateeSide(ctx, m, t) {
  const S = CH.side; if (!S) return;
  ctx.save();
  ctx.translate(Math.round(m.x || 0), Math.round(m.y || 0));
  if (m.rot) ctx.rotate(m.rot);
  const k = m.scale || 1;
  ctx.scale((m.flip ? -k : k) * (m.sx || 1), k * (m.sy || 1));
  if (m.alpha !== undefined) ctx.globalAlpha = m.alpha;
  const ph = m.phase || 0;
  const amp = m.tailAmp === undefined ? 0.26 : m.tailAmp;
  const fa = (m.flipperA === undefined ? 2.15 : m.flipperA) + Math.sin(ph + 0.9) * 0.24;
  // far flipper, then tail, then body, then near flipper, then the face
  ctx.save(); ctx.translate(S.shoX - 5, S.shoY - 4); ctx.rotate(fa - 0.22);
  ctx.drawImage(S.flipFar.c, -S.flipFar.ax, -S.flipFar.ay); ctx.restore();
  ctx.save(); ctx.translate(S.tailX, 0); ctx.rotate(Math.sin(ph) * amp);
  ctx.drawImage(S.fluke.c, -S.fluke.ax, -S.fluke.ay); ctx.restore();
  const b = m.hurt ? S.hurt : m.belly ? S.belly : m.scarred ? S.bodyScar : S.body;
  ctx.drawImage(b.c, -b.ax, -b.ay);
  ctx.save(); ctx.translate(S.shoX, S.shoY); ctx.rotate(fa);
  ctx.drawImage(S.flip.c, -S.flip.ax, -S.flip.ay); ctx.restore();
  if (!m.belly) manateeSideFace(ctx, m.exp || 'calm', m.blink, t || 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ===========================================================================
//  OTTER, STANDING — side-on, facing RIGHT. For every scene where he is on
//  his feet: working, talking, holding something out in front of him.
// ===========================================================================
function buildOtterStand() {
  const W = 16, H = 22, c = newCan(W, H), ctx = c.getContext('2d');
  const M = { k: CPAL.out, C: CPAL.cape, c: CPAL.capeD, f: CPAL.fur, d: CPAL.furD,
              l: CPAL.furL, r: CPAL.cream, e: CPAL.lea, E: CPAL.leaL };
  // cape hanging down his back
  stamp(ctx, [
    '.kkkk.',
    'kcCCck',
    'kCCCCk',
    'kCCCCk',
    'kcCCck',
    'kCCCCk',
    '.kcck.',
  ], 1, 4, M);
  // body: chest forward, belly, haunches
  stamp(ctx, [
    '..kkkkk..',
    '.kddfffk.',
    'kdffffrk.',
    'kdfffrrk.',
    'kdffrrrk.',
    'kdffrrrk.',
    'kddffrrk.',
    'kdddffkk.',
    '.kkkkk...',
  ], 4, 3, M);
  // hind legs and webbed feet
  stamp(ctx, ['kddk', 'kdfk', 'kddk', 'kkkk'], 5, 12, M);
  px(ctx, CPAL.out, 4, 16, 7, 3);
  px(ctx, CPAL.furD, 5, 17, 5, 1);
  px(ctx, CPAL.out, 7, 19, 7, 2); px(ctx, CPAL.furD, 8, 19, 5, 1);
  // belt and buckle
  px(ctx, CPAL.lea, 5, 11, 6, 2); px(ctx, CPAL.leaL, 5, 11, 6, 1);
  px(ctx, CPAL.gold, 8, 11, 2, 2); px(ctx, CPAL.goldL, 8, 11);
  return spriteFrom(c, 8, 12);
}
// o: {x, y, scale, facing, exp, blink, t, rage, arms:[near,far], hold, tail, alpha}
function drawOtterStanding(ctx, o, t) {
  if (!CH.otterStand) return;
  ctx.save();
  ctx.translate(Math.round(o.x || 0), Math.round(o.y || 0));
  const k = o.scale || 1, fx = (o.facing === -1 ? -1 : 1);
  ctx.scale(fx * k, k);
  if (o.rot) ctx.rotate(o.rot);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  const arms = o.arms || [-0.25, 0.35];
  // tail behind
  ctx.save(); ctx.translate(-6, 4); ctx.rotate(2.9 + (o.tail || 0));
  ctx.drawImage(CH.otterTail.c, -CH.otterTail.ax, -CH.otterTail.ay); ctx.restore();
  // far arm
  ctx.save(); ctx.translate(1, -1); ctx.rotate(arms[1]);
  ctx.drawImage(CH.otterArm.c, -CH.otterArm.ax, -CH.otterArm.ay); ctx.restore();
  ctx.drawImage(CH.otterStand.c, -CH.otterStand.ax, -CH.otterStand.ay);
  // near arm, and whatever is in his paw
  ctx.save(); ctx.translate(2, -2); ctx.rotate(arms[0]);
  ctx.drawImage(CH.otterArm.c, -CH.otterArm.ax, -CH.otterArm.ay);
  if (o.hold) ctx.drawImage(o.hold.c, 9 - o.hold.ax, -o.hold.ay);
  ctx.restore();
  // head
  ctx.save(); ctx.translate(1 + (o.headX || 0), -11 + (o.headY || 0)); ctx.rotate(o.headR || 0);
  const head = otterHeadWithFace(o.exp || 'idle', !!o.blink, t || 0, o.rage);
  ctx.drawImage(head, -CH.otterHead.ax, -CH.otterHead.ay);
  if (o.cigar) ctx.drawImage(CH.cigar.c, 2, 1);
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}
// The rider, top-down / high 3-4, composed the same way the rig composes him.
// o: {x, y, scale, ang, facing, exp, blink, rage, arms:[near,far], hold, tail, alpha}
function drawOtter(ctx, o, t) {
  if (!CH.otterTorso) return;
  ctx.save();
  ctx.translate(Math.round(o.x || 0), Math.round(o.y || 0));
  if (o.ang) ctx.rotate(o.ang);
  const k = o.scale === undefined ? 1 : o.scale, fx = (o.facing === -1 ? -1 : 1);
  ctx.scale(k, k);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  const arms = o.arms || [0.9, -0.9];
  ctx.save(); ctx.translate(-7, 3); ctx.rotate(2.5 + (o.tail || 0));
  ctx.drawImage(CH.otterTail.c, -CH.otterTail.ax, -CH.otterTail.ay); ctx.restore();
  ctx.save(); ctx.scale(fx, 1); ctx.translate(1, 4); ctx.rotate(arms[1]);
  ctx.drawImage(CH.otterArm.c, -CH.otterArm.ax, -CH.otterArm.ay); ctx.restore();
  const torso = o.rage ? CH.otterRage : CH.otterTorso;
  ctx.drawImage(torso.c, -torso.ax, -torso.ay);
  ctx.save(); ctx.scale(fx, 1); ctx.translate(1, -4); ctx.rotate(arms[0]);
  ctx.drawImage(CH.otterArm.c, -CH.otterArm.ax, -CH.otterArm.ay);
  if (o.hold) ctx.drawImage(o.hold.c, 9 - o.hold.ax, -o.hold.ay);
  ctx.restore();
  ctx.save(); ctx.translate((o.headX || 0), -7 + (o.headY || 0));
  ctx.scale(fx, 1); ctx.rotate(o.headR || 0);
  const head = otterHeadWithFace(o.exp || 'idle', !!o.blink, t || 0, o.rage);
  ctx.drawImage(head, -CH.otterHead.ax, -CH.otterHead.ay);
  if (o.cigar) ctx.drawImage(CH.cigar.c, 2, 1);
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ===========================================================================
//  BUILD ALL
// ===========================================================================
const CH = {};
function buildCharacters() {
  CH.manatee      = buildManateeBody(false);
  CH.manateeArmor = buildManateeBody(true);
  CH.manateeHurt  = tintFlat(CH.manateeArmor, '#ffffff', 0.85);
  CH.manateeHurtP = tintFlat(CH.manatee, '#ffffff', 0.85);
  // belly-up, for the moment she rolls over: the same body, drained of its
  // back and given a pale keel line, so no scene has to redraw her
  CH.manateeBelly = buildManateeBelly(CH.manatee);
  CH.manateeBellyA = buildManateeBelly(CH.manateeArmor);
  // the same bodies, cut at the peduncle so the rig can let the fluke lag
  CH.manPFluke = slice1(CH.manatee, 0, MAN_CUT_T);
  CH.manPFore  = slice1(CH.manatee, MAN_CUT_F, MAN_W);
  CH.manAFluke = slice1(CH.manateeArmor, 0, MAN_CUT_T);
  CH.manAFore  = slice1(CH.manateeArmor, MAN_CUT_F, MAN_W);
  CH.manPFlukeH = tintFlat(CH.manPFluke, '#ffffff', 0.85);
  CH.manPForeH  = tintFlat(CH.manPFore, '#ffffff', 0.85);
  CH.manAFlukeH = tintFlat(CH.manAFluke, '#ffffff', 0.85);
  CH.manAForeH  = tintFlat(CH.manAFore, '#ffffff', 0.85);
  CH.flipper      = buildFlipper();
  CH.saddle       = buildSaddle();
  CH.flags        = []; for (let i = 0; i < 8; i++) CH.flags.push(buildFlag(i));
  CH.otterTorso   = buildOtterTorso();
  CH.otterHead    = buildOtterHead();
  CH.otterArm     = buildOtterArm();
  CH.otterTail    = buildOtterTail();
  CH.cigar        = buildCigar();
  CH.otterRage    = tintFlat(CH.otterTorso, '#ff4a26', 0.4);
  CH.headRage     = tintFlat(CH.otterHead, '#ff4a26', 0.35);
  // head canvas we redraw the face onto each frame (1x, like its source)
  CH.headBuf = newCan(CH.otterHead.w, CH.otterHead.h);
  CH.headBufCtx = CH.headBuf.getContext('2d');
  // ---- the side-on set every cinematic shares ----------------------------
  CH.side = buildManateeSideSet();
  CH.otterStand = buildOtterStand();
  CH.drawManateeSide = drawManateeSide;
  CH.sideFace = manateeSideFace;
  CH.drawOtter = drawOtter;
  CH.drawOtterStanding = drawOtterStanding;
  CH.headWithFace = otterHeadWithFace;
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
//  MOTION PRIMITIVES
//  Everything the rig is posed from arrives raw each frame — a tilt that was
//  lerped once, an aim straight off the mouse, a facing that flips in a
//  single step. These turn those into something a body could have done:
//  springs that overshoot and settle, low-passes that make one part trail
//  another, and a stroke curve with a fast power beat and a slow recovery.
// ===========================================================================

// Damped spring on {x,v}. zeta < 1 overshoots and settles, which is what
// gives a limb its follow-through. Sub-stepped so a long frame cannot blow it
// up, and allocation-free — the state objects live on the Rig.
function _spr(o, target, freq, zeta, dt) {
  if (!(dt > 0)) return o.x;
  const w = TAU * freq;
  const n = dt > 1 / 120 ? Math.min(16, Math.ceil(dt * 120)) : 1;
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    o.v += (-w * w * (o.x - target) - 2 * zeta * w * o.v) * h;
    o.x += o.v * h;
  }
  return o.x;
}
// Exponential low-pass with a time constant in seconds (frame-rate independent).
function _lp(cur, target, tau, dt) {
  if (!(dt > 0)) return cur;
  return cur + (target - cur) * (1 - Math.exp(-dt / (tau > 1e-4 ? tau : 1e-4)));
}
// The same for an angle, taking the short way round.
function _lpA(cur, target, tau, dt) {
  if (!(dt > 0)) return cur;
  return cur + angleDiff(cur, target) * (1 - Math.exp(-dt / (tau > 1e-4 ? tau : 1e-4)));
}
// A manatee's fluke beat is not a sine. The down-stroke is quick and hard and
// the recovery is slow, so the phase is warped before the sine: k>0 spends
// less of the cycle in the power stroke and more of it in the glide.
function _stroke(ph, k) { return Math.sin(ph + k * Math.sin(ph)); }
// Ease-out, for the tail of a scripted beat (a facing flip, a roll exit).
function _eo(u) { const v = 1 - u; return 1 - v * v * v; }

// Place a point on the LAYER's pixel grid rather than on whole world units.
// The rig is drawn through a translate+scale, so the live transform says
// exactly where the origin lands in layer pixels; rounding there and solving
// back keeps every sub-unit of motion the maths produced and quantises it
// only at the resolution the screen actually has.
const _snapOut = [0, 0];
function _snapXY(ctx, x, y) {
  let m = null;
  if (ctx.getTransform) { try { m = ctx.getTransform(); } catch (e) { m = null; } }
  if (m && !m.b && !m.c && m.a && m.d) {
    _snapOut[0] = (Math.round(m.a * x + m.e) - m.e) / m.a;
    _snapOut[1] = (Math.round(m.d * y + m.f) - m.f) / m.d;
  } else {
    _snapOut[0] = Math.round(x * AS) / AS;
    _snapOut[1] = Math.round(y * AS) / AS;
  }
  return _snapOut;
}

// ---- body slices ----------------------------------------------------------
// The fluke is cut off the body at the peduncle so it can trail the shoulders
// instead of being welded to them. The two cuts overlap, and the forebody is
// drawn OVER the fluke, so the join stays closed at every angle the fluke
// reaches. No pixel is redrawn — these are the same rasters, split.
// She is authored at 1 art pixel per world unit, so these cuts are in world
// units too, re-derived for the coarse raster: the waist sits at x=26 and the
// two cuts straddle it with a three-pixel overlap, which at this resolution
// is six screen pixels of closed join at every angle the fluke reaches.
const MAN_PIVX = 27;                    // peduncle pivot, art pixels
const MAN_CUT_F = 24;                   // forebody keeps art x >= this
const MAN_CUT_T = 30;                   // fluke keeps art x < this
const MAN_PIV = MAN_PIVX - MAN_CX;      // pivot in world units, sprite-local
// The slice is cropped to its own ink, so the two halves together cost the
// same to blit as the one body they came from.
function slice1(src, x0, x1) {
  const W = src.c.width, H = src.c.height;
  const tmp = newCan(W, H), tg = tmp.getContext('2d');
  tg.drawImage(src.c, 0, 0);
  const d = tg.getImageData(0, 0, W, H).data;
  let bx0 = x1, bx1 = x0, by0 = H, by1 = 0;
  for (let y = 0; y < H; y++) for (let x = x0; x < Math.min(x1, W); x++) {
    if (!d[(y * W + x) * 4 + 3]) continue;
    if (x < bx0) bx0 = x; if (x >= bx1) bx1 = x + 1;
    if (y < by0) by0 = y; if (y >= by1) by1 = y + 1;
  }
  if (bx1 <= bx0) { bx0 = x0; bx1 = x0 + 1; by0 = 0; by1 = 1; }
  const c = newCan(bx1 - bx0, by1 - by0), g = c.getContext('2d');
  g.drawImage(tmp, -bx0, -by0);
  return spriteFrom(c, MAN_CX - bx0, MAN_CY - by0);
}

// ===========================================================================
//  RIG — draws the manatee + otter as one animated creature
//  state: {aim, facing, tilt, swimPhase, rollPhase|null, hurt, exp, rage,
//          recoil, flash, speed, armored, t}
//  Nothing in that state is used raw: `_advance` eases every channel first,
//  so a step input becomes a move with a beginning, a middle and an end.
// ===========================================================================
const Rig = {
  blinkT: 0, blink: false, cigarSmoke: 0,

  // ---- smoothed motion state ---------------------------------------------
  _t: -1,
  _tilt: { x: 0, v: 0 },      // body yaw, under-damped so a turn settles
  _tiltSlow: 0,               // heavy lag of the above — the fluke's reference
  _aim: { x: 0, v: 0 },       // the otter's aim
  _headAim: 0, _gunAim: 0,    // head leads it, gun trails it (overlap)
  _spd: 0, _acc: 0,
  _face: 1, _flip: 1,         // _flip: 0 at the instant of a facing change -> 1
  _oface: 1, _oflip: 1,       // the same for the otter's own left/right flip
  _rollPh: 0, _rolling: 0, _rollSeen: 0, _rollAge: 0,
  _lean: { x: 0, v: 0 },      // otter thrown fore/aft by her acceleration
  _sway: { x: 0, v: 0 },      // otter rolled into her turns
  _fluke: { x: 0, v: 0 },     // fluke angle about the peduncle
  _kick: { x: 0, v: 0 },      // whole-body impulse (a hit, a roll entry)
  _hurtHot: 0, _hurtCd: 0,
  _recoil: 0, _flagPh: 0, _init: 0,
  _tPrev: 0, _tRate: 0, _tRateSlow: 0,   // incoming yaw rate and its lag -> anticipation

  updateBlink(dt) {
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = !this.blink; this.blinkT = this.blink ? 0.09 : rand(1.8, 5.0); }
  },

  // Snap every channel onto its target. A clock that jumps is a scene change
  // seen from in here, and a scene change should not launch the springs.
  _reset(s) {
    this._tilt.x = s.tilt || 0; this._tilt.v = 0; this._tiltSlow = this._tilt.x;
    this._aim.x = s.aim || 0; this._aim.v = 0;
    this._headAim = this._gunAim = this._aim.x;
    this._spd = s.speed || 0; this._acc = 0;
    this._face = s.facing || 1; this._flip = 1; this._oface = 1; this._oflip = 1;
    this._lean.x = this._lean.v = 0; this._sway.x = this._sway.v = 0;
    this._fluke.x = this._fluke.v = 0; this._kick.x = this._kick.v = 0;
    this._hurtHot = 0; this._hurtCd = 0; this._recoil = s.recoil || 0;
    this._rollPh = 0; this._rolling = 0; this._rollSeen = 0; this._rollAge = 0;
    this._tPrev = this._tilt.x; this._tRate = 0; this._tRateSlow = 0;
  },

  // ---- one step of every damper --------------------------------------------
  _advance(s) {
    const t = s.t || 0;
    let dt = this._t >= 0 ? t - this._t : 0;
    const first = !this._init; this._init = 1; this._t = t;
    // the first frame has nowhere to ease from, so it starts already posed
    if (first) { this._reset(s); return 0; }
    // the same frame drawn twice must not advance anything
    if (!(dt > 0)) return 0;
    if (dt > 0.25) { this._reset(s); return 0; }
    if (dt > 1 / 20) dt = 1 / 20;
    const facing = s.facing || 1;

    // ---- speed, and the acceleration read off it -----------------------------
    const prev = this._spd;
    this._spd = _lp(this._spd, s.speed || 0, 0.075, dt);
    this._acc = _lp(this._acc, clamp((this._spd - prev) / dt, -2600, 2600), 0.055, dt);

    // ---- facing: eased, so the mirror is a pivot and not a teleport ----------
    if (facing !== this._face) { this._face = facing; this._flip = 0; this._kick.v += 7; }
    this._flip = Math.min(1, this._flip + dt / 0.17);

    // ---- anticipation. The incoming tilt leads the body, so the jerk in it —
    //      how fast the turn rate itself is changing — is a signal that a turn
    //      has just STARTED, and only then. Leaning a little the wrong way on
    //      that signal gives the counter-move before the swing, and it dies
    //      away on its own the moment the turn settles into a steady rate.
    const tIn = s.tilt || 0;
    this._tRate = _lp(this._tRate, clamp((tIn - this._tPrev) / dt, -14, 14), 0.030, dt);
    this._tPrev = tIn;
    this._tRateSlow = _lp(this._tRateSlow, this._tRate, 0.13, dt);

    // ---- body yaw: a spring, so a hard turn arrives with a little overshoot
    _spr(this._tilt, tIn, 3.1, 0.58, dt);
    this._tiltSlow = _lp(this._tiltSlow, this._tilt.x, 0.10, dt);

    // ---- the aim chain. Head first, torso next, gun last: they must not all
    //      reach the new angle on the same frame or the pose has no weight.
    _spr(this._aim, this._aim.x + angleDiff(this._aim.x, s.aim || 0), 4.6, 0.82, dt);
    this._headAim = _lpA(this._headAim, s.aim || 0, 0.022, dt);
    // firing snaps the muzzle onto the true line — the lag is a pose, not a lie
    this._gunAim = _lpA(this._gunAim, this._aim.x, s.flash > 0 ? 0.004 : 0.05, dt);
    // which way the otter faces, eased the same way she is
    const aimL = facing === 1 ? this._aim.x : Math.PI - this._aim.x;
    const wr = Math.cos(aimL) >= 0 ? 1 : -1;
    if (wr !== this._oface) { this._oface = wr; this._oflip = 0; }
    this._oflip = Math.min(1, this._oflip + dt / 0.13);

    // ---- roll: our own continuous phase, so a roll cut short by a rock still
    //      finishes its revolution instead of snapping upright mid-spin
    const rp = s.rollPhase;
    if (rp !== null && rp !== undefined) {
      this._rollPh = rp * TAU;
      this._rollAge = rp;
      if (!this._rollSeen) { this._rollSeen = 1; this._kick.v += 26; }   // the gather
      this._rolling = 1;
    } else {
      this._rollSeen = 0;
      if (this._rolling) {
        const rem = TAU - (this._rollPh % TAU);
        if (rem > 0.05 && rem < TAU - 0.05) { this._rollPh += Math.min(rem, dt * 15); this._rollAge = 1; }
        else { this._rolling = 0; this._rollPh = 0; this._kick.v += 11; }
      }
    }

    // ---- hurt: keep the strobe, but let it decay out instead of cutting ------
    if (s.hurt) {
      this._hurtHot = 1;
      if (this._hurtCd <= 0) { this._hurtCd = 0.45; this._kick.v += 40; }
    } else this._hurtHot = Math.max(0, this._hurtHot - dt * 5.5);
    this._hurtCd -= dt;

    // ---- recoil: instant attack, eased release -------------------------------
    this._recoil = Math.max(s.recoil || 0, this._recoil - dt * 7.5);

    // ---- the whole-body impulse settles back to nothing ----------------------
    _spr(this._kick, 0, 3.2, 0.40, dt);

    // ---- the otter is luggage. Her acceleration throws him fore and aft, her
    //      yaw rate rolls him into the turn, the gun shoves him back.
    _spr(this._lean, clamp(-this._acc / 1250, -0.42, 0.42) - this._recoil * 0.13, 2.5, 0.44, dt);
    _spr(this._sway, clamp(this._tilt.v * 0.06, -0.26, 0.26), 3.0, 0.50, dt);

    // ---- fluke: trails the body's yaw and catches up a beat later ------------
    const ph = s.swimPhase || 0;
    const beat = _stroke(ph - 0.8, 0.5) * (0.09 + Math.min(0.20, this._spd / 640));
    const trail = -clamp((this._tilt.x - this._tiltSlow) * 2.6, -0.32, 0.32);
    _spr(this._fluke, beat + trail, 3.8, 0.55, dt);

    // ---- the flag reads the water she is actually moving through ------------
    this._flagPh += dt * (6.5 + Math.min(11, this._spd / 17));
    return dt;
  },

  draw(ctx, x, y, s) {
    this._advance(s);
    const t = s.t, facing = s.facing || 1;
    const ph = s.swimPhase || 0;
    const spd = this._spd;

    // ---- the beat. She rises on the power stroke and sinks through the
    //      recovery, and every part hanging off her is offset in phase so
    //      nothing reaches its extreme on the same frame.
    const drive = 0.30 + Math.min(0.62, spd / 190);
    const heave = -Math.cos(ph + 0.55) * drive + this._kick.x * 0.30;
    const surge = _stroke(ph - 0.25, 0.5) * drive * 0.55 - this._kick.x * 0.45;

    ctx.save();
    const a0 = ctx.globalAlpha;
    const p = _snapXY(ctx, x, y + heave);
    ctx.translate(p[0], p[1]);

    // ---- barrel roll: spin about the long axis (squash Y, show the belly)
    let scaleY = 1, belly = false, rollRot = 0, stretch = 1, riderFade = 1;
    if (this._rolling) {
      const rph = this._rollPh;
      // the first beat is a gather, not a spin — the kick impulse does the
      // crouching, and the spin itself fades in behind it
      const ease = this._rollAge < 0.13 ? this._rollAge / 0.13 : 1;
      scaleY = Math.cos(rph);
      if (Math.abs(scaleY) < 0.14) scaleY = 0.14 * (scaleY < 0 ? -1 : 1);
      scaleY = 1 + (scaleY - 1) * ease;
      belly = Math.cos(rph) < 0;
      rollRot = Math.sin(rph) * 0.18 * ease;
      stretch = 1 + Math.abs(Math.sin(rph)) * 0.16 * ease;
      // edge-on is where the rider would pop in or out; fade him through it
      riderFade = clamp((Math.abs(Math.cos(rph)) - 0.04) / 0.15, 0, 1);
    }
    // squash & stretch from speed, from what the speed is doing, and from the
    // impulse — volume is roughly conserved, so a flatten is also a widen
    const sp = Math.min(1, spd / 240);
    stretch *= 1 + sp * 0.10 + clamp(this._acc / 2600, -0.05, 0.09) + this._kick.x * 0.05;
    const squash = (1 - sp * 0.06) * (1 - this._kick.x * 0.055);

    const wag = _stroke(ph, 0.45) * (0.032 + Math.min(0.05, spd / 3400));

    // The facing flip is the one place a 2D rig always snaps. Pinch her to a
    // sliver on the frame it happens and let her widen back out: the mirror
    // becomes a pivot through edge-on, with a yaw that unwinds behind it.
    const fu = this._flip;
    const pinch = 0.50 + 0.50 * _eo(fu);
    const flipYaw = Math.sin(Math.PI * fu) * 0.16 * facing;
    // the counter-move at the head of a turn (see _advance)
    const antic = -clamp((this._tRate - this._tRateSlow) * 0.050, -0.12, 0.12);

    ctx.scale(facing * pinch, 1);
    ctx.rotate((this._tilt.x + wag + antic) * facing + rollRot + flipYaw);
    ctx.scale(stretch, scaleY * squash);
    ctx.translate(surge, 0);

    // ---- flippers paddle. Near and far are half a beat apart and both lead
    //      the fluke, so the stroke travels down the body instead of snapping.
    const fAmp = 0.30 + Math.min(0.30, spd / 470);
    for (const side of [-1, 1]) {
      const a = _stroke(ph + 0.7 - (side > 0 ? 0.5 : 0), 0.42);
      ctx.save();
      ctx.translate(15, side * 13); ctx.scale(1, side);
      ctx.rotate(2.25 + a * fAmp - this._fluke.x * 0.35 * side);
      ctx.drawImage(CH.flipper.c, -CH.flipper.ax, -CH.flipper.ay);
      ctx.restore();
    }

    // ---- body, in two pieces so the fluke can lag behind the shoulders -----
    const arm = !!s.armored;
    const fluke = arm ? CH.manAFluke : CH.manPFluke;
    const fore = arm ? CH.manAFore : CH.manPFore;
    const hurtA = s.hurt ? 1 : Math.min(1, this._hurtHot) * 0.5;
    if (fluke && fore) {
      ctx.save();
      ctx.translate(MAN_PIV, 0); ctx.rotate(clamp(this._fluke.x, -0.40, 0.40)); ctx.translate(-MAN_PIV, 0);
      ctx.drawImage(fluke.c, -fluke.ax, -fluke.ay);
      if (hurtA > 0.01) {
        const hf = arm ? CH.manAFlukeH : CH.manPFlukeH;
        ctx.globalAlpha = a0 * hurtA; ctx.drawImage(hf.c, -hf.ax, -hf.ay); ctx.globalAlpha = a0;
      }
      ctx.restore();
      ctx.drawImage(fore.c, -fore.ax, -fore.ay);
      if (hurtA > 0.01) {
        const hb = arm ? CH.manAForeH : CH.manPForeH;
        ctx.globalAlpha = a0 * hurtA; ctx.drawImage(hb.c, -hb.ax, -hb.ay); ctx.globalAlpha = a0;
      }
    } else {
      // slices missing (an odd build order) — fall back to the whole body
      const body = s.hurt ? (arm ? CH.manateeHurt : CH.manateeHurtP) : (arm ? CH.manateeArmor : CH.manatee);
      ctx.drawImage(body.c, -body.ax, -body.ay);
    }

    // ---- rider (hidden while belly-up mid-roll, or before he boards)
    if (!belly && !s.riderHidden && riderFade > 0.01) {
      if (riderFade < 1) ctx.globalAlpha = a0 * riderFade;
      // saddle
      ctx.save(); ctx.translate(8, 0);
      ctx.drawImage(CH.saddle.c, -CH.saddle.ax, -CH.saddle.ay); ctx.restore();
      // flag whipping behind — the pole lags her yaw, so it cracks on a turn
      const flag = CH.flags[Math.floor(this._flagPh) & 7];
      const poleLag = clamp((this._tilt.x - this._tiltSlow) * 2.2, -0.34, 0.34);
      // The pole is tall enough to carry the flag clear of her back: over the
      // body it would only hide the armour it is flying above.
      ctx.save(); ctx.translate(-20, 3); ctx.rotate(-0.13 + poleLag + this._fluke.x * 0.18);
      px(ctx, CPAL.woodD, -1, -27, 2, 29); px(ctx, CPAL.wood, -1, -27, 1, 29);
      ctx.drawImage(flag.c, -flag.ax, -flag.ay - 19);
      ctx.restore();

      // The otter rides over the shoulders, sized like a passenger, and he is
      // always a beat behind her: his bob trails her heave and he pitches
      // fore and aft with whatever she just did to him.
      const bob = -Math.cos(ph + 0.55 - 0.85) * drive * 0.9;
      ctx.save();
      ctx.translate(8, -2 + bob + this._kick.x * 0.5);
      ctx.rotate(this._lean.x + this._sway.x * 0.5);

      // aim in the manatee's flipped local space, one flavour per body part
      const aimL = facing === 1 ? this._aim.x : Math.PI - this._aim.x;
      const aimH = facing === 1 ? this._headAim : Math.PI - this._headAim;
      const aimG = facing === 1 ? this._gunAim : Math.PI - this._gunAim;
      // the otter twists his whole upper body toward the aim
      const twist = clamp(angleDiff(0, aimL), -1.1, 1.1) * 0.30;
      const faceRight = this._oface;
      const oPinch = 0.45 + 0.55 * _eo(this._oflip);

      // tail curls out behind him, trailing the lean and the sway
      ctx.save(); ctx.translate(-7, 3);
      ctx.rotate(2.5 + _stroke(ph - 1.4, 0.4) * 0.16 - this._lean.x * 0.7 - this._sway.x);
      ctx.drawImage(CH.otterTail.c, -CH.otterTail.ax, -CH.otterTail.ay);
      ctx.restore();

      ctx.rotate(twist);
      // torso
      const torso = s.rage ? CH.otterRage : CH.otterTorso;
      ctx.save(); ctx.scale(oPinch, 1);
      ctx.drawImage(torso.c, -torso.ax, -torso.ay);
      ctx.restore();

      // ---- far arm (behind the torso) -> drawn before head
      const recoil = this._recoil;
      ctx.save();
      ctx.scale(faceRight * oPinch, 1);
      const localAim = faceRight === 1 ? aimG - twist : Math.PI - (aimG - twist);
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

      // ---- head (with live expression) on top. It leads the aim and counters
      //      the torso lean, so he keeps his eyes on the line he is shooting.
      const headBob = -Math.cos(ph + 0.55 - 1.35) * drive * 0.55;
      ctx.save();
      ctx.translate(0, -7 + headBob);
      ctx.scale(faceRight * oPinch, 1);
      ctx.rotate(clamp(angleDiff(0, faceRight === 1 ? aimH : Math.PI - aimH), -0.8, 0.8) * 0.22
                 - this._lean.x * 0.45 - this._sway.x * 0.30);
      const head = otterHeadWithFace(s.exp || 'idle', this.blink, t, s.rage);
      ctx.drawImage(head, -CH.otterHead.ax, -CH.otterHead.ay);
      // cigar clamped in the corner of the muzzle
      ctx.drawImage(CH.cigar.c, 2, 1);
      ctx.restore();
      ctx.restore();
      ctx.globalAlpha = a0;
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
//  BOATS — procedural top-down hulls, bow RIGHT, rasterized at DETAIL art
//  pixels per world unit (they are the fine-drawn machinery the chunky
//  animal is thrown against, so they keep every pixel they can get).
//
//  A hull is built in this order, and each step only ever draws over the one
//  before it: hull form -> topside bands -> strakes -> boot-top -> wear ->
//  deck well -> deck furniture -> role gear -> house -> fittings -> names.
//
//  The frame is FIXED, because src/entities.js paints ten more hulls of its
//  own straight onto the finished canvas in these coordinates: the canvas is
//  (len+4) x (2*beam+6) world units, the hull runs from X0 = 2*AS to X0+L,
//  and the centreline is at cy = round(H/2). Do not move any of those.
//
//  o: {len, beam, motor, cabin, gear, thwarts, hull*, deck*,  and optional
//      bow:'fine'|'spoon'|'bluff'|'ram', stern:0..1, stripe, trim, fenders,
//      mast, name} — everything optional is inferred from her proportions,
//  so the ten hulls registered from entities.js get the treatment too.
// ===========================================================================
// pseudo-lettering: the ticks of a name at this size, never real glyphs
function nameTicks(ctx, x, y, n, col) {
  for (let i = 0, cx = x; i < n; i++) {
    const w = 1 + (i & 1);
    px(ctx, col, cx, y, w, 2);
    cx += w + 1;
  }
}
function buildBoat(o) {
  // o.len / o.beam are WORLD units; the hull is rasterized at AS art px per unit
  const L = o.len * AS, B = o.beam * AS;       // length, half-beam at the widest
  const W = L + 4 * AS, H = B * 2 + 6 * AS, cy = Math.round(H / 2);
  const c = newCan(W, H), ctx = c.getContext('2d');
  const hullL = o.hullL || CPAL.woodL, hull = o.hull || CPAL.wood;
  const hullD = o.hullD || CPAL.woodD, hullDD = o.hullDD || CPAL.woodDD;
  const deck = o.deck || CPAL.wood, deckD = o.deckD || CPAL.woodD;
  const X0 = 2 * AS;
  const RUST = '#8a4526', RUSTL = '#b4653a', GRIME = '#2e3239';

  // ---- hull form. Which class of boat this is, read off her proportions
  //      unless the definition says otherwise.
  const ratio = o.beam / o.len;
  const bow = o.bow || (o.gear === 'turret' ? 'ram' : ratio > 0.26 ? 'bluff' : ratio < 0.20 ? 'fine' : 'spoon');
  const sternW = o.stern !== undefined ? o.stern : (ratio > 0.24 ? 0.94 : 0.64);
  const bmax = o.bmax || (bow === 'bluff' ? 0.46 : 0.38);
  const halfW = x => {
    const u = clamp((x - X0) / L, 0, 1);
    let w;
    if (u <= bmax) { const v = u / bmax; w = sternW + (1 - sternW) * (v * v * (3 - 2 * v)); }
    else {
      const v = (u - bmax) / (1 - bmax);
      if (bow === 'fine') w = 1 - Math.pow(v, 1.6);
      else if (bow === 'bluff') w = Math.pow(Math.max(0, 1 - v * v * v), 0.55);
      else if (bow === 'ram') w = Math.max(0.10, 1 - Math.pow(v, 2.6));
      else w = Math.sqrt(Math.max(0, 1 - v * v));               // spoon
    }
    return B * w;
  };
  const hwAt = [];
  for (let x = 0; x < W; x++) hwAt[x] = (x >= X0 && x <= X0 + L) ? halfW(x) : -1;
  const solid = (x, y) => x >= 0 && x < W && hwAt[x] > 1.2 && Math.abs(y - cy) < hwAt[x];

  // ---- topsides: a lit cap rail to port, a shadowed one to starboard, the
  //      boot-top down near the waterline and a dark garboard under that
  const stripe = o.stripe || null;
  for (let x = X0; x <= L + X0 - 1; x++) {
    const hw = hwAt[x]; if (hw < 1.2) continue;
    const y0 = Math.round(cy - hw), y1 = Math.round(cy + hw);
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1 || x === X0 || x > L + X0 - 2) { px(ctx, CPAL.out, x, y); continue; }
      const n = Math.min(y - y0, y1 - y);          // distance in from the sheer
      const port = y < cy;
      let col;
      if (n === 1) col = port ? hullL : hullDD;
      else if (n === 2) col = port ? hull : hullD;
      else if (n === 3) col = port ? hull : hullD;
      else col = hullD;
      if (stripe && n === 2) col = stripe;
      px(ctx, col, x, y);
    }
    // strakes: seams that follow the hull instead of running straight, so
    // they crowd together at the bow the way real planking does
    for (const k of [0.52, 0.78]) {
      const dy = Math.round(hw * k);
      if (dy > 2) { px(ctx, hullDD, x, cy - dy); px(ctx, hullDD, x, cy + dy); }
    }
  }
  // ---- wear: rust weeping aft from the fastenings, a patched plate, grime
  for (let x = X0 + 5; x < L + X0 - 5; x += 9) {
    const hw = hwAt[x]; if (hw < 4) continue;
    if (hash2(x * 3, 7) > 0.45) {
      const len = 2 + Math.floor(hash2(x, 11) * 4);
      for (let i = 0; i < len; i++) {
        px(ctx, i ? RUST : RUSTL, x, Math.round(cy - hw) + 1 + i);
        if (hash2(x, 19) > 0.6) px(ctx, i ? RUST : RUSTL, x + 1, Math.round(cy + hw) - 1 - i);
      }
    }
  }
  {
    const pxx = Math.round(X0 + L * (0.34 + hash2(L, B) * 0.3)), pw = 5 + ((L / 8) | 0) % 4;
    const hw = hwAt[pxx];
    if (hw > 5) {
      const py = Math.round(cy - hw) + 3;
      for (let y = py; y < py + 4; y++) for (let x = pxx; x < pxx + pw; x++) if (solid(x, y)) px(ctx, hullDD, x, y);
      for (let x = pxx; x < pxx + pw; x += 2) { px(ctx, hullL, x, py); px(ctx, GRIME, x, py + 3); }
    }
  }
  // ---- open deck well: fore-and-aft planking, a king plank, frames, and a
  //      dark margin where the deck meets the topsides
  const wellA = Math.round(X0 + L * 0.13), wellB = Math.round(X0 + L * (o.cabin ? 0.80 : 0.84));
  for (let x = wellA; x <= wellB; x++) {
    const hw = hwAt[x] - 3 * AS; if (hw < 1.5) continue;
    const y0 = Math.round(cy - hw), y1 = Math.round(cy + hw);
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1 || x === wellA || x === wellB) { px(ctx, CPAL.out2, x, y); continue; }
      let col = ((y - cy) % 4 === 0) ? deckD : deck;
      if (y === cy) col = deckD;                              // king plank
      if (((x - wellA) % 11) === 0) col = deckD;              // athwartship frame
      if (hash2(x * 5, y * 3) > 0.94) col = deckD;            // worn tread
      px(ctx, col, x, y);
    }
  }
  // ---- thwarts (bench seats) across the well, with a worn top edge
  for (const f of (o.thwarts || [0.34, 0.62])) {
    const x = Math.round(X0 + L * f), hw = halfW(x) - 2 * AS; if (hw < 1.5) continue;
    const ya = Math.round(cy - hw), yb = Math.round(cy + hw);
    for (let y = ya; y <= yb; y++) { px(ctx, hullL, x, y, 2, 1); px(ctx, hullD, x + 1, y); }
    px(ctx, CPAL.out2, x + 2, ya, 1, yb - ya + 1);
    px(ctx, CPAL.out2, x - 1, ya, 1, yb - ya + 1);
  }
  // ---- transom, outboard motor and skeg at the stern
  if (o.motor) {
    const mx = 1, my = cy;
    // the transom board itself, with a name plate screwed to it
    for (let y = Math.round(cy - hwAt[X0 + 1]) + 1; y < Math.round(cy + hwAt[X0 + 1]); y++) px(ctx, hullDD, X0 + 1, y);
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
    px(ctx, CPAL.metLL, mx + 2, my - 3, 2, 1);               // cowling highlight
    px(ctx, CPAL.out, mx + 8, my - 1, 3, 2);                 // leg into the well
    px(ctx, RUST, mx + 1, my + 2, 2, 1);                     // rust at the clamp
    // tiller arm, swung out to port
    px(ctx, CPAL.out, mx + 3, my - 7, 5, 2);
    px(ctx, CPAL.metL, mx + 3, my - 7, 4, 1);
  }
  // ---- deck furniture: the fittings a working boat cannot do without
  const fwdX = Math.round(X0 + L * 0.88), aftX = Math.round(X0 + L * 0.10);
  // bow and stern bitts
  for (const bx of [fwdX, aftX + 2]) {
    if (hwAt[bx] < 3) continue;
    px(ctx, CPAL.out, bx, cy - 2, 3, 5);
    px(ctx, CPAL.metL, bx, cy - 1, 2, 1);
    px(ctx, CPAL.metDD, bx, cy + 1, 2, 1);
  }
  // a hatch with a lifting handle, set a third of the way forward
  {
    const hx = Math.round(X0 + L * 0.68), hy = cy - 3;
    if (hwAt[hx] > 5) {
      for (let y = hy; y < hy + 7; y++) for (let x = hx; x < hx + 6; x++) {
        const e = y === hy || y === hy + 6 || x === hx || x === hx + 5;
        px(ctx, e ? CPAL.out2 : (y < hy + 3 ? hullL : hull), x, y);
      }
      px(ctx, CPAL.metL, hx + 2, hy + 3, 2, 1);
      px(ctx, GRIME, hx + 1, hy + 5, 4, 1);
    }
  }
  // a fuel drum lashed to the deck, and a bucket beside it
  {
    const dx = Math.round(X0 + L * 0.22), dy = cy - Math.round(B * 0.42);
    if (hwAt[dx] > 6) {
      for (let y = dy; y < dy + 6; y++) for (let x = dx; x < dx + 6; x++) {
        const d = Math.hypot(x - dx - 2.5, y - dy - 2.5);
        if (d > 3) continue;
        px(ctx, d > 2.3 ? CPAL.out : d > 1.4 ? CPAL.metD : CPAL.metL, x, y);
      }
      px(ctx, RUST, dx + 1, dy + 4, 2, 1);
      px(ctx, CPAL.out, dx + 7, dy + 2, 3, 3); px(ctx, CPAL.metL, dx + 8, dy + 3);
    }
  }
  // a life ring lashed to the rail, port side: white with two red quarters
  {
    const rx = Math.round(X0 + L * 0.40), ry = Math.round(cy - hwAt[Math.round(X0 + L * 0.40)]) + 2;
    if (hwAt[rx] > 6) {
      px(ctx, CPAL.white, rx + 1, ry, 2, 1); px(ctx, CPAL.white, rx + 1, ry + 3, 2, 1);
      px(ctx, CPAL.blood, rx, ry + 1, 1, 2); px(ctx, CPAL.blood, rx + 3, ry + 1, 1, 2);
    }
  }
  // fenders (old tyres) hung over the side on the beamy working boats
  if (o.fenders || ratio > 0.25) {
    for (let i = 0; i < 3; i++) {
      const fx = Math.round(X0 + L * (0.28 + i * 0.18));
      const hw = hwAt[fx]; if (hw < 4) continue;
      for (const sgn of [-1, 1]) {
        const fy = Math.round(cy + sgn * hw) - sgn;
        px(ctx, CPAL.out, fx, fy - 1, 4, 3);
        px(ctx, GRIME, fx + 1, fy, 2, 1);
      }
    }
  }
  // ---- wheelhouse / cabin -------------------------------------------------
  if (o.cabin) {
    // The wheelhouse is painted, not bare steel: weathered white unless the
    // definition says otherwise, which is what tells two grey boats apart.
    const hs = o.house || '#cfcabd', hsL = o.houseL || '#ece8dd', hsD = o.houseD || '#8e8a80', hsDD = o.houseDD || '#5d5a53';
    const cw = Math.round(L * 0.22), ch = Math.round(B * 1.15);
    const cx0 = Math.round(X0 + L * o.cabin), cy0 = Math.round(cy - ch / 2);
    for (let y = cy0; y < cy0 + ch; y++) for (let x = cx0; x < cx0 + cw; x++) {
      const e = y === cy0 || y === cy0 + ch - 1 || x === cx0 || x === cx0 + cw - 1;
      let col = e ? CPAL.out : (y < cy0 + 3 ? hsL : y > cy0 + ch - 4 ? hsDD : hs);
      if (!e && ((x - cx0) % 5) === 0) col = hsD;         // roof panel seams
      px(ctx, col, x, y);
    }
    px(ctx, hsL, cx0 + 1, cy0 + 1, cw - 2, 1);           // roof rail, port
    px(ctx, CPAL.out2, cx0 + 1, cy0 + ch - 2, cw - 2, 1);
    for (let x = cx0 + 2; x < cx0 + cw - 2; x += 6) px(ctx, RUST, x, cy0 + ch - 3, 1, 2);
    // the wheelhouse windows, lit from inside, with mullions between them
    for (let i = 0; i < 3; i++) {
      const wy = cy0 + 3 + i * Math.max(2, Math.floor((ch - 6) / 3));
      if (wy > cy0 + ch - 4) break;
      px(ctx, CPAL.out, cx0 + cw - 5, wy, 4, 2);
      px(ctx, CPAL.goldL, cx0 + cw - 4, wy, 2, 1);
      px(ctx, CPAL.gold, cx0 + cw - 4, wy + 1, 2, 1);
    }
    // the door in the aft face, and a scuttle beside it
    px(ctx, CPAL.out, cx0 + 1, cy0 + Math.round(ch / 2) - 2, 2, 4);
    px(ctx, hsD, cx0 + 1, cy0 + Math.round(ch / 2) - 1, 1, 2);
    // a stubby stack with soot on the lip, and a radar dome on the roof
    px(ctx, CPAL.out, cx0 + 2, cy0 + 1, 3, 3);
    px(ctx, CPAL.metD, cx0 + 3, cy0 + 2, 1, 1);
    px(ctx, GRIME, cx0 + 2, cy0 + 1, 3, 1);
    const rx = cx0 + cw - 4;
    px(ctx, CPAL.out, rx, cy0 + Math.round(ch / 2) - 1, 3, 3);
    px(ctx, CPAL.white, rx + 1, cy0 + Math.round(ch / 2));
    // an aerial whipping aft off the roof
    for (let i = 0; i < 5; i++) px(ctx, CPAL.metDD, cx0 - 1 - i, cy0 + 2 - (i >> 1));
  } else {
    // open boat: a helm console, a wheel and a seat for whoever is driving
    const sx = Math.round(X0 + L * 0.56);
    if (hwAt[sx] > 4) {
      px(ctx, CPAL.out, sx, cy - 3, 4, 7);
      px(ctx, CPAL.metD, sx + 1, cy - 2, 2, 5);
      px(ctx, CPAL.metL, sx + 1, cy - 2, 2, 1);
      px(ctx, CPAL.out, sx + 4, cy - 1, 1, 3);           // the wheel, edge-on
      px(ctx, hullL, sx - 4, cy - 2, 3, 5);               // the seat
      px(ctx, hullD, sx - 4, cy + 1, 3, 2);
    }
  }
  // ---- role-specific gear -------------------------------------------------
  if (o.gear === 'net') {
    const nx0 = wellA + 4, nx1 = wellA + Math.round(L * 0.3);
    for (let x = nx0; x < nx1; x++)
      for (let y = Math.round(cy - B * 0.5); y < Math.round(cy + B * 0.5); y++) {
        if (((x + y) & 3) === 0) px(ctx, CPAL.white, x, y);
        else if (((x - y + 64) & 3) === 0) px(ctx, CPAL.creamD, x, y);
      }
    px(ctx, CPAL.out2, nx0 - 2, Math.round(cy - B * 0.5), 2, Math.round(B));
    for (let y = Math.round(cy - B * 0.5); y < Math.round(cy + B * 0.5); y += 5) px(ctx, CPAL.ember, nx1, y, 2, 2);
    // the net drum it pays off, and the gallows frame over the stern
    const dx = nx0 - 5;
    for (let y = cy - Math.round(B * 0.55); y <= cy + Math.round(B * 0.55); y++) {
      px(ctx, CPAL.out, dx, y, 4, 1);
      px(ctx, ((y & 3) === 0) ? CPAL.metD : CPAL.met, dx + 1, y, 2, 1);
    }
    px(ctx, CPAL.metLL, dx + 1, cy - Math.round(B * 0.55), 2, 1);
  } else if (o.gear === 'harpoon') {
    const hx = Math.round(X0 + L * 0.62), len = Math.round(L * 0.3);
    px(ctx, CPAL.metDD, hx, cy - 2, len, 5);
    px(ctx, CPAL.metL, hx, cy - 1, len, 1);
    px(ctx, CPAL.metLL, hx + len - 6, cy - 1, 6, 1);
    px(ctx, CPAL.out, hx - 3, cy - 5, 6, 11);              // mount
    px(ctx, CPAL.met, hx - 2, cy - 4, 4, 9);
    px(ctx, CPAL.metL, hx - 2, cy - 4, 4, 2);
    for (let i = 0; i < 3; i++) px(ctx, CPAL.metDD, hx - 2, cy - 1 + i * 2, 4, 1);
    // the line tub and a rack of spare irons behind the gun
    px(ctx, CPAL.out, hx - 12, cy + 2, 7, 6);
    px(ctx, CPAL.woodL, hx - 11, cy + 3, 5, 4);
    for (let i = 0; i < 3; i++) px(ctx, CPAL.creamD, hx - 11, cy + 3 + i, 5, 1);
    for (let i = 0; i < 3; i++) px(ctx, CPAL.metL, hx - 14, cy - 6 + i * 2, 9, 1);
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
    // a second crate, open, with the sticks showing
    px(ctx, CPAL.out, bx + 12, cy - 4, 8, 7);
    px(ctx, CPAL.woodD, bx + 13, cy - 3, 6, 5);
    for (let i = 0; i < 3; i++) px(ctx, CPAL.blood, bx + 13, cy - 3 + i * 2, 6, 1);
  } else if (o.gear === 'turret') {
    const tx = Math.round(X0 + L * 0.55);
    for (let y = cy - 7; y <= cy + 7; y++)
      for (let x = tx - 7; x <= tx + 7; x++) {
        const d = Math.hypot(x - tx, y - cy); if (d > 7) continue;
        px(ctx, d > 5.6 ? CPAL.out : d > 4.4 ? CPAL.metD : d > 2 ? CPAL.met : CPAL.metL, x, y);
      }
    for (let i = 0; i < 8; i++) {
      const th = i / 8 * TAU;
      px(ctx, CPAL.metLL, Math.round(tx + Math.cos(th) * 5), Math.round(cy + Math.sin(th) * 5));
    }
    const bl = Math.round(L * 0.24);
    px(ctx, CPAL.metDD, tx + 4, cy - 2, bl, 4);
    px(ctx, CPAL.metL, tx + 4, cy - 2, bl, 1);
    px(ctx, CPAL.out, tx + 4 + bl, cy - 3, 2, 6);                 // muzzle brake
    // ready-use ammunition, boxed and strapped down beside the mount
    px(ctx, CPAL.out, tx - 12, cy + 3, 9, 5);
    px(ctx, CPAL.metD, tx - 11, cy + 4, 7, 3);
    px(ctx, CPAL.goldL, tx - 10, cy + 5, 5, 1);
  } else if (o.gear === 'crates') {
    // stacked clear of the wheelhouse, on whatever deck she has left
    const cb = o.cabin ? Math.min(0.62, o.cabin + 0.28) : 0.28;
    for (const [fx, fy] of [[cb, -0.4], [cb, 0.35], [cb + 0.16, 0]]) {
      const bx = Math.round(X0 + L * fx), by = Math.round(cy + B * fy) - 4;
      stamp(ctx, [
        'kkkkkkkkk',
        'kLLLLLLLk',
        'kLTTTTTLk',
        'kLTTTTTLk',
        'kLTTTTTLk',
        'kdddddddk',
        'kkkkkkkkk',
      ], bx, by, { k: CPAL.out, L: CPAL.woodL, T: CPAL.wood, d: CPAL.woodD });
      px(ctx, CPAL.metD, bx + 1, by + 3, 7, 1);                   // steel banding
      px(ctx, CPAL.metL, bx + 1, by + 3, 7, 1);
      px(ctx, CPAL.metD, bx + 4, by + 1, 1, 4);
      px(ctx, RUST, bx + 7, by + 4, 1, 2);
      px(ctx, CPAL.out2, bx + 1, by + 7, 8, 1);                   // its shadow
    }
  }
  // ---- a mast or A-frame, lying over the deck the way it looks from above
  if (o.mast || (o.cabin && o.beam >= 9)) {
    const mx = Math.round(X0 + L * 0.58), ml = Math.min(Math.round(L * 0.26), mx - X0 - 4);
    for (let i = 0; i < ml; i++) px(ctx, i & 1 ? CPAL.metD : CPAL.metL, mx - i, cy - 1, 1, 2);
    px(ctx, CPAL.out, mx, cy - 3, 2, 6);
    if (ml > 2) px(ctx, CPAL.emberL, mx - ml, cy - 1, 2, 2);         // masthead light
  }
  // ---- bow cleat, an anchor stowed on the foredeck, and a coil of rope
  const clx = Math.round(X0 + L * 0.88);
  px(ctx, CPAL.out, clx, cy - 2, 3, 4);
  px(ctx, CPAL.metL, clx, cy - 1, 2, 1); px(ctx, CPAL.metDD, clx, cy + 1, 2, 1);
  {
    const ax = Math.round(X0 + L * 0.78), ay = cy + Math.round(B * 0.34);
    if (hwAt[ax] > 5) {
      px(ctx, CPAL.metD, ax, ay, 6, 1);
      px(ctx, CPAL.metD, ax + 4, ay - 2, 1, 5);
      px(ctx, CPAL.metL, ax + 5, ay - 2, 1, 1); px(ctx, CPAL.metL, ax + 5, ay + 2, 1, 1);
    }
  }
  const rcx = Math.round(X0 + L * 0.72), rcy = Math.round(cy - B * 0.42);
  for (let r = 1; r <= 3; r++) for (let th = 0; th < 20; th++) {
    const ang = th / 20 * TAU;
    px(ctx, r === 2 ? CPAL.creamD : CPAL.woodD, Math.round(rcx + Math.cos(ang) * r), Math.round(rcy + Math.sin(ang) * r * 0.8));
  }
  // ---- her name on the transom and her number on the bow
  {
    const ny = cy - 3;
    px(ctx, GRIME, X0 + 2, ny, 7, 5);
    nameTicks(ctx, X0 + 3, ny + 1, 3, CPAL.bone);
    const bx = Math.round(X0 + L * 0.80);
    if (hwAt[bx] > 4) nameTicks(ctx, bx, Math.round(cy - hwAt[bx]) + 2, 2, o.trim || CPAL.white);
  }
  return spriteFromHi(c, W / 2, cy);
}

function buildBoats() {
  // Twelve hulls, each given the form its job would have given it: a fine
  // entry on the fast ones, a bluff working bow on the beamy ones, a ram on
  // the gunboat. Ten more are registered from src/entities.js through this
  // same builder; they inherit their form from their proportions.
  const defs = {
    dinghy:    { len: 28, beam: 6,  motor: 1, thwarts: [0.34, 0.62], bow: 'spoon', stern: 0.86 },
    netter:    { len: 30, beam: 7,  motor: 1, gear: 'net', thwarts: [0.6], bow: 'bluff', stern: 0.92,
                 stripe: '#5d6f3c' },
    harpooner: { len: 32, beam: 7,  motor: 1, gear: 'harpoon', thwarts: [0.36], bow: 'fine', stern: 0.62,
                 hull: '#7d858f', hullL: '#c3ccd8', hullD: '#575e68', hullDD: '#383e46', deck: '#6a717b', deckD: '#4c525b',
                 stripe: '#2b3a4a' },
    speedboat: { len: 36, beam: 7,  motor: 1, cabin: 0.30, thwarts: [0.66], bow: 'fine', stern: 0.70,
                 house: '#e8e8ee', houseL: '#ffffff', houseD: '#9ea2ae', houseDD: '#5c1518',
                 hull: '#c4383a', hullL: '#ff8f84', hullD: '#8e2326', hullDD: '#5c1518', deck: '#e8e8ee', deckD: '#b9bcc6',
                 stripe: '#f4f7fb', trim: '#ffe48f' },
    jetski:    { len: 20, beam: 5,  motor: 1, thwarts: [0.5], bow: 'fine', stern: 0.74,
                 hull: '#e0a838', hullL: '#ffe48f', hullD: '#a87a1e', hullDD: '#6d4d10', deck: '#3d4767', deckD: '#28314c',
                 stripe: '#3d4767' },
    dynaboat:  { len: 30, beam: 7,  motor: 1, gear: 'dyna', thwarts: [0.62], bow: 'spoon', stern: 0.88,
                 stripe: '#8e2326' },
    trawler:   { len: 52, beam: 12, motor: 1, cabin: 0.16, gear: 'crates', thwarts: [0.68], bow: 'bluff', mast: 1, fenders: 1,
                 hull: '#8f6a3a', hullL: '#d9a25a', hullD: '#6a4a24', hullDD: '#432d14', stripe: '#2f5f52' },
    gunboat:   { len: 46, beam: 10, motor: 1, cabin: 0.18, gear: 'turret', thwarts: [], bow: 'ram', stern: 0.80,
                 house: '#5b6472', houseL: '#98a2b0', houseD: '#3b424c', houseDD: '#22262d',
                 hull: '#4c535e', hullL: '#98a2b0', hullD: '#343a43', hullDD: '#20242b', deck: '#454b55', deckD: '#2e333a',
                 stripe: '#20242b', trim: '#cdd9ea' },
    // a squat pusher with a high wheelhouse and a fendered bow
    tug:       { len: 34, beam: 11, motor: 1, cabin: 0.22, gear: 'crates', thwarts: [0.72], bow: 'bluff', stern: 0.96, fenders: 1,
                 hull: '#7a3f22', hullL: '#c07a3e', hullD: '#542914', hullDD: '#32180b', deck: '#4a3a2a', deckD: '#31251a',
                 stripe: '#1f2833' },
    // a long low hull paying out line off a drum in the stern
    longliner: { len: 40, beam: 7,  motor: 1, cabin: 0.20, gear: 'net', thwarts: [0.5, 0.74], bow: 'fine', stern: 0.66, mast: 1,
                 house: '#c9d8cf', houseL: '#f0f7f2', houseD: '#7d9a8e', houseDD: '#3f5a50',
                 hull: '#2f5f52', hullL: '#66ab95', hullD: '#1f4138', hullDD: '#132924', deck: '#3d5a52', deckD: '#263a35',
                 stripe: '#f0b87e' },
    // pots stacked on the afterdeck
    crabber:   { len: 32, beam: 9,  motor: 1, cabin: 0.24, gear: 'crates', thwarts: [0.66], bow: 'bluff', fenders: 1,
                 hull: '#7a6a2a', hullL: '#c8b155', hullD: '#544819', hullDD: '#32290c', deck: '#5c5327', deckD: '#3c3617',
                 stripe: '#32290c' },
    // small, fast, and carrying nothing but a flare rack
    spotter:   { len: 24, beam: 5,  motor: 1, gear: 'dyna', thwarts: [0.55], bow: 'fine', stern: 0.68,
                 hull: '#d97a2a', hullL: '#ffc06a', hullD: '#954914', hullDD: '#5c2c08', deck: '#33384a', deckD: '#212532',
                 stripe: '#33384a' },
  };
  for (const k in defs) {
    defs[k].name = k;
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
