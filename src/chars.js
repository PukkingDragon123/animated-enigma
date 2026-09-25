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
  // ---- gore. Five bands, because a wound needs as much posterising as a
  // hull does: the wet crown of it, the body of the blood, the dark it runs
  // into, the meat under the hide, and the dried smear the water drags aft.
  goreL:'#e03a40', gore: '#a0161f', goreD:'#4c0a11',
  meat: '#c26a67', meatD:'#8d4344',
  stain:'#5b262c', stainD:'#3a181e',
  eye:  '#241a12', shine:'#ffffff',
  smoke:'#b9b3ad', ember:'#ff8b2e', emberL:'#ffd27a',
};

// ---- tiny raster helpers --------------------------------------------------
function newCan(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function spriteFrom(c, ax, ay) { return { c, w: c.width, h: c.height, ax: ax ?? c.width / 2, ay: ay ?? c.height / 2 }; }

// ===========================================================================
//  HI-RES ART  (DETAIL x)
//  Almost everything in this file — the hero pair, every boat, the shark,
//  the chief and the shields — is rasterized at DETAIL art pixels per world
//  unit, so one art pixel lands on (about) one screen pixel instead of being
//  blown up. The sprite record still reports its size in WORLD units, so
//  every call site in the rest of the codebase keeps working with the
//  offsets it already has.
//
//  The two deliberate exceptions are named where they are built: the SIDE-ON
//  cinematic set (CH.side) and the two silhouette records CH.otterHead /
//  CH.otterStand stay at one art pixel per world unit, because src/death.js
//  reads their rasters directly — it maps her flank column by column and
//  bakes rim lights the size of the canvas — and that arithmetic only closes
//  when a sprite's canvas width IS its world width.
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
// stamp(), but one fillRect per RUN of like characters instead of one per
// character. Same output; a quarter of the calls on the shapes that are laid
// down every frame (the live face).
function stampRuns(ctx, rows, x, y, map) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let q = 0;
    while (q < row.length) {
      const ch = row[q]; let e = q + 1;
      while (e < row.length && row[e] === ch) e++;
      const col = map[ch];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + q, y + r, e - q, 1); }
      q = e;
    }
  }
}
// ---- detail passes -------------------------------------------------------
// For the machinery — the boats, the shark, the chief. The hero pair below
// does its shading by hand: a probabilistic grain reads as texture on a
// welded steel hull and as damage on an animal.
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
//  HERO ART  (DETAIL x)  — fine grid, small animal
//  The pair is rasterized at DETAIL art pixels per world unit, like every
//  machine in the game, and registered in HIRES so the 1/DETAIL bridge
//  scales it: one art pixel lands on one screen pixel. She is SMALLER in
//  world units than she was and carries more than twice the art pixels,
//  which is where the hide texture, the scarring, the stitching in the
//  harness and the rivets in the plate come from.
//
//  Authoring rules for this half of the file:
//    * silhouette first: the beam is a hand-keyed curve, not a heap of
//      blobs, so the fluke reads as a fluke and the head as a head.
//    * shade in hard bands off that curve — lit back, dark keel — then put
//      every mark back into the SAME ramp or it vanishes into its band.
//    * her eye is a DOT — one bead and one glint. Never an anatomical eye.
//    * anything an outside file anchors to is quoted in WORLD units: the
//      flipper socket at (15, +-13) is src/death.js's too.
// ===========================================================================
function tintFlat(s, color, alpha) {
  const c = newCan(s.c.width, s.c.height), ctx = c.getContext('2d');
  drawRaw(ctx, s.c, 0, 0);
  ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = alpha;
  ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
  if (s.hi) { HIRES.add(c); return { c, w: s.w, h: s.h, ax: s.ax, ay: s.ay, hi: 1 }; }
  return { c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}
// Bake a hi-res raster down to one art pixel per world unit, silhouette
// intact. src/death.js cuts the otter's hat off his head, builds his bare
// skull and bakes his rim lights straight off the canvas of CH.otterHead /
// CH.otterStand, in canvas pixels, and then places the result with the
// record's WORLD anchors — so those two records have to stay square with
// the world grid. The hi-res twin is what actually gets drawn.
function bake1x(s) {
  const W = Math.round(s.c.width / AS), H = Math.round(s.c.height / AS);
  const src = newCan(s.c.width, s.c.height), sg = src.getContext('2d');
  drawRaw(sg, s.c, 0, 0);
  const d = sg.getImageData(0, 0, s.c.width, s.c.height).data;
  const c = newCan(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), o = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // the most opaque sample of the 2x2 block, so nothing thin drops out
    let bi = -1, ba = -1;
    for (let q = 0; q < AS * AS; q++) {
      const sx = x * AS + (q % AS), sy = y * AS + ((q / AS) | 0);
      if (sx >= s.c.width || sy >= s.c.height) continue;
      const i = (sy * s.c.width + sx) * 4;
      if (d[i + 3] > ba) { ba = d[i + 3]; bi = i; }
    }
    if (bi < 0 || ba < 40) continue;
    const p = (y * W + x) * 4;
    o[p] = d[bi]; o[p + 1] = d[bi + 1]; o[p + 2] = d[bi + 2]; o[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { c, w: W, h: H, ax: s.ax, ay: s.ay };
}

// ===========================================================================
//  WAR MANATEE  — top-down, facing RIGHT, DETAIL art pixels per world unit
//  140 x 64 art px = 70 x 32 WORLD units.  (She was 94 x 42 world units.)
// ===========================================================================
const MAN_W = 140, MAN_H = 64, MAN_CX = 70, MAN_CY = 32;

// Her hide ramp: six bands, far enough apart to read as a rounded back at a
// glance and close enough that a crease drawn one band darker still reads as
// a crease and not a hole.
const HD = {
  dd: '#211d27', d: '#37333f', m: '#4d4a56', mm: '#635f6c',
  l: '#807c8a', ll: '#9c98a7', pale: '#bdbac9', top: '#d6d4de',
};
const HALG = ['#3c5f48', '#2c4936', '#4a7355'];      // algae on her back
// Her half-beam, in ART pixels, keyed along her length. A hand-keyed curve
// beats a field of blobs: blobs smooth into a heap of lumps, a curve gives a
// spade fluke, a real peduncle waist and a blunt head. The flipper socket
// the rig (and src/death.js) uses is world (15, +-13) = art (100, +-26), so
// the curve has to still be 26 art px deep there.
const MAN_KEYS = [
  [2, 14], [5, 20], [9, 24], [14, 25], [19, 23], [24, 19], [29, 14],
  [34, 11], [40, 11.5], [46, 14], [52, 18], [58, 22], [66, 26], [74, 28.5],
  [82, 29], [90, 28.5], [98, 27], [106, 25], [112, 22], [117, 19.5],
  [122, 18], [127, 16.5], [132, 14.5], [136, 12], [138, 10.5], [139, 9],
];
function manHalf(x) {
  if (x < MAN_KEYS[0][0] || x > MAN_KEYS[MAN_KEYS.length - 1][0]) return -1;
  for (let i = 1; i < MAN_KEYS.length; i++) {
    const [x1, h1] = MAN_KEYS[i];
    if (x > x1) continue;
    const [x0, h0] = MAN_KEYS[i - 1];
    const u = (x - x0) / (x1 - x0);
    return h0 + (h1 - h0) * (u * u * (3 - 2 * u));     // smooth, no corners
  }
  return -1;
}
function buildManateeBody(armored) {
  const cyy = MAN_CY, c = newCan(MAN_W, MAN_H), ctx = c.getContext('2d');
  HIRES.add(c);
  const span = new Int16Array(MAN_W * 2);
  // ---- the body, painted in eight bands from a lit back to a dark keel.
  //      One pass, hard edges, no gradients: this is the whole animal.
  const bandOf = t => t < 0.05 ? HD.top : t < 0.13 ? HD.pale : t < 0.24 ? HD.ll
    : t < 0.40 ? HD.l : t < 0.58 ? HD.mm : t < 0.74 ? HD.m : t < 0.89 ? HD.d : HD.dd;
  for (let x = 0; x < MAN_W; x++) {
    const hw = manHalf(x);
    span[x * 2] = 1; span[x * 2 + 1] = -1;
    if (hw < 1.0) continue;
    const y0 = Math.round(cyy - hw), y1 = Math.round(cyy + hw);
    span[x * 2] = y0; span[x * 2 + 1] = y1;
    const h = Math.max(1, y1 - y0);
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1) { px(ctx, CPAL.out, x, y); continue; }
      px(ctx, bandOf((y - y0) / h), x, y);
    }
  }
  const solid = (x, y) => x >= 0 && x < MAN_W && y > span[x * 2] && y < span[x * 2 + 1];
  const deep = (x, y, k) => {            // k art px in from either sheer
    if (!solid(x, y)) return false;
    return (y - span[x * 2]) >= k && (span[x * 2 + 1] - y) >= k;
  };
  const tOf = (x, y) => (y - span[x * 2]) / Math.max(1, span[x * 2 + 1] - span[x * 2]);
  // ---- blunt muzzle: a manatee's snout ends in a wall, not a point, so the
  //      front column is all outline with the two corners knocked off
  for (let y = cyy - 9; y <= cyy + 9; y++) px(ctx, CPAL.out, MAN_W - 1, y);
  ctx.clearRect(MAN_W - 1, cyy - 9, 1, 1); ctx.clearRect(MAN_W - 1, cyy + 9, 1, 1);
  px(ctx, CPAL.out, MAN_W - 2, cyy - 9); px(ctx, CPAL.out, MAN_W - 2, cyy + 9);

  // ---- hide grain. Very sparse single art pixels one band off their own, in
  //      the mid-tones only, so she reads leathery rather than speckled.
  for (let x = 4; x < MAN_W - 4; x++) for (let y = 2; y < MAN_H - 2; y++) {
    if (!deep(x, y, 4)) continue;
    const t = tOf(x, y);
    if (t < 0.22 || t > 0.84) continue;
    const r = hash2(x * 7 + 3, y * 13 + 5);
    if (r > 0.988) px(ctx, t < 0.5 ? HD.l : HD.d, x, y);
    else if (r < 0.010) px(ctx, t < 0.5 ? HD.ll : HD.m, x, y);
  }
  // ---- transverse skin folds across the barrel: a dark core with a lit
  //      upper lip, bowed the way a fold sits on a round back, and stopping
  //      short of the sheer so they crease her instead of banding her
  for (const fx of [60, 80, 100]) for (let y = 2; y < MAN_H - 2; y++) {
    const x = fx + Math.round(Math.sin((y - cyy) / 30) * 5);
    if (!deep(x, y, 7)) continue;
    px(ctx, HD.m, x, y); px(ctx, HD.d, x + 1, y);
    if (deep(x - 1, y, 8)) px(ctx, tOf(x, y) < 0.5 ? HD.pale : HD.l, x - 1, y);
  }
  // ---- the crease where her neck meets her shoulders, so the head is a head
  for (let y = 3; y < MAN_H - 3; y++) {
    const x = 116 + Math.round(Math.sin((y - cyy) / 26) * 3);
    if (!deep(x, y, 3)) continue;
    px(ctx, HD.d, x, y); px(ctx, HD.dd, x + 1, y);
    if (deep(x + 2, y, 4)) px(ctx, HD.pale, x + 2, y);
  }
  // ---- fluke: ridges fanning out of the peduncle and a pale trailing edge
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    for (let x = 5; x < 36; x++) {
      const y = Math.round(cyy + i * 6 + (36 - x) * i * 0.12);
      if (!deep(x, y, 2)) continue;
      px(ctx, HD.d, x, y);
      if ((x & 3) === 0 && deep(x, y - 1, 2)) px(ctx, HD.l, x, y - 1);
    }
  }
  for (let y = 4; y < MAN_H - 4; y++) { if (solid(3, y)) px(ctx, HD.pale, 3, y); if (solid(4, y)) px(ctx, HD.ll, 4, y); }
  // ---- CHUNKS out of the trailing edge. Not notches: bites, taken in one
  //      go and never grown back. `solid()` reads the span table the body was
  //      painted from, so it cannot see a hole punched afterwards — the bite
  //      keeps its own record of what it removed and everything downstream of
  //      it asks that instead. The raw rim is re-inked so she still has a line
  //      round her, and the meat behind the rim is left showing.
  const gone = new Uint8Array(MAN_W * MAN_H);
  const inBody = (x, y) => x >= 0 && x < MAN_W && y >= 0 && y < MAN_H &&
    span[x * 2 + 1] > span[x * 2] && y >= span[x * 2] && y <= span[x * 2 + 1];
  const hide = (x, y) => inBody(x, y) && !gone[y * MAN_W + x];
  const bite = (bx, byc, r) => {
    for (let y = byc - r - 2; y <= byc + r + 2; y++) for (let x = 0; x < 40; x++) {
      const dx = (x - bx) / (r * 1.25), dy = (y - byc) / r;
      // a torn rim, not a compass arc: the radius wobbles along it
      if (dx * dx + dy * dy > 1 + (hash2(x * 3, y * 5) - 0.5) * 0.40) continue;
      if (!inBody(x, y)) continue;
      gone[y * MAN_W + x] = 1;
      ctx.clearRect(x, y, 1, 1);
    }
  };
  bite(1, cyy - 12, 8);
  bite(4, cyy + 15, 4);
  // re-ink the rim and pack the wound in behind it
  for (let y = 0; y < MAN_H; y++) for (let x = 0; x < 40; x++) {
    if (!hide(x, y)) continue;
    if (hide(x - 1, y) && hide(x + 1, y) && hide(x, y - 1) && hide(x, y + 1)) continue;
    if (!(gone[y * MAN_W + Math.max(0, x - 1)] || gone[y * MAN_W + Math.min(MAN_W - 1, x + 1)] ||
          (y > 0 && gone[(y - 1) * MAN_W + x]) || (y < MAN_H - 1 && gone[(y + 1) * MAN_W + x]))) continue;
    px(ctx, CPAL.out, x, y);
    // run the wound INBOARD from the rim: raw meat, then blood, then the
    // stain it has dried into. One pixel of red round a hole reads as a red
    // outline; five reads as a hole with the inside of her showing.
    for (let k = 1; k <= 5; k++) {
      if (!hide(x + k, y)) break;
      const c2 = k === 1 ? CPAL.meat : k === 2 ? (hash2(x, y * 7) > 0.4 ? CPAL.goreL : CPAL.gore)
        : k === 3 ? CPAL.gore : k === 4 ? CPAL.goreD : CPAL.stain;
      if (k >= 4 && hash2(x * 3, y * 5) < 0.45) break;
      px(ctx, c2, x + k, y);
    }
  }
  // ---- propeller wounds. These used to be two pale pixels and a shadow —
  //      scars, healed, decorative. They are wounds now: the hide is cut, the
  //      lip of it stands up torn and pale, there is meat under the lip and
  //      wet blood in the deepest part of the run, and everything downstream
  //      of it is stained where the water has dragged it aft. `open` says how
  //      fresh it is; a closed one is an old rake with only the dried smear.
  const gash = (x0, y0, dx, dy, n, open) => {
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + i * dx), y = Math.round(y0 + i * dy);
      if (!deep(x, y, 3)) continue;
      const mid = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 || 1);   // deepest mid-run
      px(ctx, HD.top, x, y - 1, 2, 1);                   // torn hide, standing up lit
      px(ctx, CPAL.meatD, x, y, 2, 1);
      if (open) {
        px(ctx, mid > 0.45 ? CPAL.gore : CPAL.goreD, x, y, 2, 1);
        if (mid > 0.78) px(ctx, CPAL.goreL, x, y);
      }
      px(ctx, CPAL.goreD, x, y + 1, 2, 1);               // the dark it runs into
      // the smear the water drags aft (aft is -x: she swims nose-first)
      for (let k = 1; k <= 7; k++) {
        const sx = x - k * 2, sy = y + ((k >> 1) & 1);
        if (!deep(sx, sy, 2)) continue;
        if (hash2(sx * 5 + i, sy * 7) < 0.26 + k * 0.09) continue;
        px(ctx, k < 3 ? CPAL.stain : CPAL.stainD, sx, sy, 2, 1);
      }
    }
  };
  gash(64, 12, 1.6, 1.0, 11, 1);
  gash(86, 50, 1.5, -0.9, 9, 1);
  gash(52, 40, 1.2, 0.7, 7, 0);
  gash(104, 20, 1.0, -0.5, 5, 0);
  gash(96, 40, 1.4, 0.8, 8, 1);
  // ---- a stitched wound. Somebody sewed her back together with whatever
  //      was on the boat, and it held: a long closed seam with cross-ticks
  //      of wire either side of it. The one mark on her that says she was
  //      meant to die and did not.
  for (let i = 0; i < 30; i++) {
    const x = 46 + i, y = Math.round(cyy + 6 + Math.sin(i * 0.16) * 4 + i * 0.22);
    if (!deep(x, y, 4)) continue;
    px(ctx, CPAL.meatD, x, y, 1, 2);
    px(ctx, HD.pale, x, y - 1);
    if (i % 4 === 1 && deep(x, y + 3, 3)) {
      px(ctx, CPAL.bone, x, y - 3, 1, 3); px(ctx, CPAL.bone, x + 1, y + 1, 1, 3);
      px(ctx, HD.dd, x + 1, y - 3, 1, 3); px(ctx, HD.dd, x + 2, y + 1, 1, 3);
    }
  }
  // ---- a barbed harpoon head, snapped off in her shoulder. It is still in
  //      there; the shaft broke and the fleet kept the rest of it.
  {
    const hx = 66, hy = 48;                 // where it went in, art px
    // the wound it is sitting in, first, so the steel lies over it
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 5; x++) {
      if (x * x * 0.7 + y * y > 14) continue;
      if (!deep(hx + x, hy + y, 2)) continue;
      const r2 = x * x * 0.7 + y * y;
      px(ctx, r2 > 9 ? CPAL.stain : r2 > 4 ? CPAL.goreD : CPAL.gore, hx + x, hy + y);
    }
    px(ctx, CPAL.goreL, hx - 1, hy, 2, 1);
    // a snapped shaft standing out of her, barbs and all
    for (let i = 0; i < 15; i++) {
      const x = hx + 1 + i, y = hy - 1 - (i >> 1);
      if (!inBody(x, y)) continue;
      px(ctx, CPAL.out, x, y - 1, 1, 4);
      px(ctx, CPAL.met, x, y, 1, 2); px(ctx, CPAL.metLL, x, y);
      if (i === 4 || i === 9) {
        px(ctx, CPAL.out, x, y - 3, 2, 3); px(ctx, CPAL.metL, x, y - 3, 1, 2);
        px(ctx, CPAL.out, x + 1, y + 2, 2, 3); px(ctx, CPAL.metL, x + 1, y + 2, 1, 2);
      }
    }
    px(ctx, CPAL.out, hx + 16, hy - 9, 3, 3);   // the snapped-off butt
    px(ctx, CPAL.metDD, hx + 16, hy - 9, 2, 2);
  }
  // ---- algae on the back, where the light hits and nothing rubs it off
  for (const [ax, ay, w2, h2] of [[68, 14, 9, 5], [92, 44, 8, 4], [54, 24, 7, 4], [40, 34, 6, 3]]) {
    for (let y = ay; y < ay + h2; y++) for (let x = ax; x < ax + w2; x++) {
      if (!deep(x, y, 3)) continue;
      const r = hash2(x * 3, y * 5);
      if (r > 0.55) px(ctx, HALG[r > 0.86 ? 2 : r > 0.7 ? 0 : 1], x, y);
    }
  }
  // ---- barnacles: a dark rim, a dull shell and a shadow, three art px wide
  for (const [bx, by] of [[58, 20], [82, 46], [48, 34], [74, 52], [66, 26]]) {
    if (!deep(bx, by, 5)) continue;
    px(ctx, HD.dd, bx - 1, by - 1, 5, 5);
    px(ctx, '#9a9382', bx, by, 3, 3);
    px(ctx, '#c2bba6', bx, by, 2, 1);
    px(ctx, HD.dd, bx + 1, by + 1, 2, 2);
  }

  // ---- head ---------------------------------------------------------------
  // The eye is a DOT: one black bead with one glint, ringed by a pale socket
  // so it survives against whichever band of hide it lands on.
  for (const ey of [cyy - 12, cyy + 8]) {
    px(ctx, HD.pale, 118, ey - 1, 5, 1);          // lit brow over the socket
    stamp(ctx, [
      '.kkk.',
      'keeek',
      'keeek',
      'keeek',
      '.kkk.',
    ], 118, ey, { k: CPAL.out, e: CPAL.eye });
    px(ctx, CPAL.shine, 119, ey + 1);             // the one glint
    px(ctx, HD.dd, 118, ey + 5, 5, 1);            // the socket's own shadow
  }
  // whisker pad: the brightest block on her, right at the front, so the
  // silhouette has a face end and a tail end at any distance. Clipped to the
  // muzzle, so it never spills off the outline.
  for (let y = cyy - 10; y <= cyy + 10; y++) for (let x = 127; x < MAN_W - 1; x++) {
    if (!deep(x, y, 1)) continue;
    const t = Math.abs(y - cyy) / 10.5, u = (x - 127) / 13;
    if (t * t + u * u * 0.30 > 1) continue;
    px(ctx, t > 0.88 ? HD.l : t > 0.66 ? HD.ll : t > 0.34 ? HD.pale : HD.top, x, y);
  }
  for (let y = cyy - 8; y <= cyy + 8; y++) if (deep(126, y, 2)) px(ctx, HD.m, 126, y);
  // dimples in the pad, a lit row and a shaded one, so it reads as stippled
  for (const [dx, dy] of [[130, -6], [133, -6], [136, -5], [130, 5], [133, 5], [136, 4]]) {
    if (!deep(dx, cyy + dy, 1)) continue;
    px(ctx, HD.l, dx, cyy + dy); px(ctx, HD.top, dx, cyy + dy - 1);
  }
  // nostrils: two short slits high on the muzzle with a lit upper lip
  for (const ny of [cyy - 7, cyy + 5]) {
    px(ctx, HD.top, 135, ny - 1, 2, 1);
    px(ctx, CPAL.out, 135, ny, 2, 3);
    px(ctx, HD.dd, 135, ny + 3, 2, 1);
  }
  // the mouth, a crease across the front of the pad
  px(ctx, HD.m, 132, cyy - 1, 6, 1); px(ctx, HD.d, 133, cyy, 5, 1); px(ctx, HD.dd, 134, cyy + 1, 3, 1);
  for (const [wx, wy] of [[137, cyy - 4], [137, cyy + 3], [136, cyy - 9], [136, cyy + 8]])
    if (solid(wx, wy)) px(ctx, CPAL.bone, wx, wy, 2, 1);

  if (armored) {
    // ---- ONE riveted back plate, aft of the saddle where it can be seen,
    //      and a collar over her neck. She is an animal wearing armour, not
    //      a tank: most of what you see has to stay hide. The plate is inset
    //      from the sheer by a fifth of the local beam, so hide shows all
    //      the way round it and her back still reads as a back.
    const ST = { k: '#1b1c22', dd: '#2b2f38', d: '#3e444f', m: '#535a67', l: '#6d7686', ll: '#939daf', w: '#c3cbd8' };
    const pxx = 52, pw = 24;
    for (let x = pxx; x < pxx + pw; x++) {
      const hw = manHalf(x); if (hw < 6) continue;
      const inset = Math.round(hw * 0.34) + 2;
      const y0 = Math.round(cyy - hw) + inset, y1 = Math.round(cyy + hw) - inset;
      for (let y = y0; y <= y1; y++) {
        const e = x === pxx || x === pxx + pw - 1 || y === y0 || y === y1;
        let col = e ? CPAL.out : (y < y0 + 5 ? ST.l : y > y1 - 6 ? ST.dd : ST.m);
        if (!e && y >= y0 + 5 && y <= y0 + 9) col = ST.ll;
        if (!e && hash2(x * 5, y * 3) > 0.93) col = ST.d;
        if (!e && hash2(x * 13, y * 7) > 0.988) col = ST.ll;
        px(ctx, col, x, y);
      }
      // rolled edges, lit to port and shadowed to starboard
      if (x > pxx && x < pxx + pw - 1) { px(ctx, ST.w, x, y0 + 1); px(ctx, ST.k, x, y1 - 1); }
      // the welded seam down the middle of the plate: a bead, not a dotted
      // line — a gap every other pixel reads as perforation at this size
      if (y0 + 2 < cyy && cyy < y1 - 2) { px(ctx, ST.dd, x, cyy); px(ctx, ST.l, x, cyy - 1); }
    }
    // rivets: dome, highlight, drop shadow
    for (let i = 0; i < 4; i++) {
      const x = pxx + 3 + i * 6, hw = manHalf(x); if (hw < 6) continue;
      const inset = Math.round(hw * 0.34) + 2;
      for (const y of [Math.round(cyy - hw) + inset + 3, Math.round(cyy + hw) - inset - 4]) {
        px(ctx, ST.k, x - 1, y - 1, 4, 4);
        px(ctx, ST.ll, x, y, 2, 2);
        px(ctx, ST.w, x, y);
        px(ctx, ST.k, x + 1, y + 2, 2, 1);
      }
    }
    // shot scars in the plate, and a rust weep off one of the fastenings
    for (const [gx, gy, n] of [[pxx + 5, cyy - 8, 5], [pxx + 14, cyy + 5, 4]])
      for (let i = 0; i < n; i++) { px(ctx, ST.w, gx + i, gy + (i >> 1), 1, 1); px(ctx, ST.k, gx + i, gy + 1 + (i >> 1), 1, 1); }
    for (let i = 0; i < 7; i++) px(ctx, i < 2 ? '#b4653a' : '#8a4526', pxx + pw - 5, cyy + 4 + i);
    // ---- and what has run down the plate since. The armour is where the
    //      fleet aims, so it is where most of it ends up: blood in the seams,
    //      dried into the rivet lines and gone black at the bottom of the run.
    for (const [bx, by, n] of [[pxx + 3, cyy - 16, 13], [pxx + 11, cyy + 3, 11], [pxx + 18, cyy - 11, 9]]) {
      for (let i = 0; i < n; i++) {
        const x = bx - (i >> 2), y = by + i;
        const hw = manHalf(x); if (hw < 6) continue;
        const inset = Math.round(hw * 0.34) + 2;
        if (y < Math.round(cyy - hw) + inset || y > Math.round(cyy + hw) - inset) continue;
        px(ctx, i < 3 ? CPAL.blood : i < 7 ? CPAL.bloodD : CPAL.stainD, x, y, 2, 1);
        if (hash2(x * 3, y * 7) > 0.72) px(ctx, CPAL.stainD, x + 2, y);
      }
    }
    // ---- three doubloons hammered flat onto the plate. It is not decoration:
    //      soft gold over a shot hole is the cheapest patch there is.
    for (const [gx, gy] of [[pxx + 6, cyy - 5], [pxx + 16, cyy - 9], [pxx + 12, cyy + 8]]) {
      px(ctx, CPAL.out, gx - 1, gy - 1, 5, 5);
      px(ctx, CPAL.goldD, gx - 1, gy, 5, 3); px(ctx, CPAL.goldD, gx, gy - 1, 3, 5);
      px(ctx, CPAL.gold, gx, gy, 3, 3); px(ctx, CPAL.goldL, gx, gy, 2, 1);
      px(ctx, CPAL.goldD, gx + 1, gy + 1);
    }
    // ---- steel collar round her neck, right behind the head
    for (let x = 106; x <= 115; x++) for (let y = 2; y < MAN_H - 2; y++) {
      if (!solid(x, y)) continue;
      const top = !solid(x, y - 1), bot = !solid(x, y + 1);
      px(ctx, x === 106 || x === 115 ? CPAL.out : top ? CPAL.metLL : bot ? CPAL.metDD : (x < 110 ? CPAL.met : CPAL.metD), x, y);
    }
    for (const cy2 of [cyy - 13, cyy - 4, cyy + 4, cyy + 13]) {
      if (!solid(110, cy2)) continue;
      px(ctx, CPAL.out2, 109, cy2 - 1, 4, 4); px(ctx, CPAL.metL, 110, cy2, 2, 2); px(ctx, CPAL.metLL, 110, cy2);
    }
    px(ctx, CPAL.goldD, 112, cyy - 5, 5, 11); px(ctx, CPAL.gold, 112, cyy - 4, 4, 9);
    px(ctx, CPAL.goldL, 112, cyy - 4, 4, 2); px(ctx, CPAL.goldL, 112, cyy - 4, 2, 8);
    px(ctx, CPAL.out2, 114, cyy - 1, 2, 2);
    // ---- leather harness: one strap right round her, stitched down both
    //      edges, with a brass buckle over her spine
    const sx = 84;
    for (let y = 2; y < MAN_H - 2; y++) {
      if (!solid(sx, y)) continue;
      px(ctx, CPAL.leaD, sx, y, 6, 1);
      px(ctx, CPAL.lea, sx + 1, y, 4, 1);
      if ((y & 3) === 1) { px(ctx, CPAL.leaL, sx + 2, y, 2, 1); px(ctx, CPAL.creamD, sx, y); px(ctx, CPAL.creamD, sx + 5, y); }
      if ((y & 7) === 4) px(ctx, CPAL.leaD, sx + 2, y, 2, 1);
    }
    px(ctx, CPAL.out, sx - 2, cyy - 7, 10, 15);
    px(ctx, CPAL.goldD, sx - 1, cyy - 6, 8, 13);
    px(ctx, CPAL.gold, sx, cyy - 5, 6, 11);
    px(ctx, CPAL.goldL, sx, cyy - 5, 6, 2);
    px(ctx, CPAL.out, sx + 2, cyy - 2, 2, 5);                 // the tongue
    px(ctx, CPAL.out, sx + 2, cyy - 9, 2, 2); px(ctx, CPAL.out, sx + 2, cyy + 8, 2, 2);
    // ---- shoulder spikes: out at the widest point, where they break the
    //      silhouette instead of disappearing into the back
    stamp(ctx, [
      '....kk....',
      '...kLLk...',
      '..kLMMLk..',
      '.kLMMMMLk.',
      'kLMMMMMMLk',
      'kMMmmmmMMk',
      'kkkkkkkkkk',
    ], 78, 1, { k: CPAL.out, M: CPAL.met, L: CPAL.metLL, m: CPAL.metD });
    stamp(ctx, [
      'kkkkkkkkkk',
      'kMMmmmmMMk',
      'kLMMMMMMLk',
      '.kLMMMMLk.',
      '..kLMMLk..',
      '...kLLk...',
      '....kk....',
    ], 78, MAN_H - 8, { k: CPAL.out, M: CPAL.met, L: CPAL.metLL, m: CPAL.metD });
    // ---- a brass ring through the snout: the fleet put it there
    px(ctx, CPAL.goldD, 133, cyy - 5, 3, 11);
    px(ctx, CPAL.goldL, 133, cyy - 5, 3, 2);
    px(ctx, CPAL.goldD, 136, cyy - 2, 3, 5);
    px(ctx, CPAL.gold, 136, cyy - 2, 3, 2);
  }
  return spriteFromHi(c, MAN_CX, MAN_CY);
}

// ---- saddle (sits mid-back, the otter perches here) -----------------------
//  19 x 17 world units, anchored at world (9, 8) — unchanged, so the rig and
//  every scene that places the rider keep the offsets they had.
function buildSaddle() {
  const c = newCanHi(19, 17), ctx = c.getContext('2d');   // 38 x 34 art px
  stampUp(ctx, [
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
  ], 2, 6, { k: CPAL.out, L: CPAL.leaL, l: CPAL.lea, d: CPAL.leaD, D: '#3a2412' });
  // the rolled rim, and a stitched seam running inside it all the way round
  for (let x = 8; x < 32; x++) {
    if ((x & 1) === 0) { px(ctx, CPAL.cream, x, 11); px(ctx, CPAL.creamD, x, 12); px(ctx, CPAL.cream, x, 27); px(ctx, CPAL.creamD, x, 28); }
  }
  for (let y = 13; y < 27; y++) if ((y & 1) === 0) { px(ctx, CPAL.creamD, 7, y); px(ctx, CPAL.creamD, 32, y); }
  // grain: a few worn streaks along the seat
  for (let i = 0; i < 14; i++) {
    const x = 10 + ((i * 7) % 20), y = 15 + ((i * 5) % 10);
    px(ctx, hash2(i, 3) > 0.5 ? '#4a2c16' : CPAL.leaL, x, y, 2, 1);
  }
  // brass studs down both flanks: dome, highlight, drop shadow
  for (let i = 0; i < 4; i++) {
    const sx = 10 + i * 6;
    for (const sy of [10, 26]) {
      px(ctx, CPAL.out2, sx - 1, sy - 1, 4, 4);
      px(ctx, CPAL.goldD, sx, sy, 3, 3);
      px(ctx, CPAL.gold, sx, sy, 2, 2);
      px(ctx, CPAL.goldL, sx, sy);
    }
  }
  return spriteFromHi(c, 18, 16);
}

// ---- flipper --------------------------------------------------------------
//  16 x 11 world units, anchored at world (3, 5) — unchanged.
function buildFlipper() {
  const W = 32, c = newCanHi(16, 11), ctx = c.getContext('2d');   // 32 x 22 art px
  // a hand-keyed paddle, not a blob: wide at the shoulder, rounded at the tip
  const key = [[1, 3], [4, 7], [8, 9], [13, 9.5], [18, 9], [23, 7.5], [27, 5.5], [30, 3]];
  const halfAt = x => {
    if (x < key[0][0] || x > key[key.length - 1][0]) return -1;
    for (let i = 1; i < key.length; i++) {
      if (x > key[i][0]) continue;
      const u = (x - key[i - 1][0]) / (key[i][0] - key[i - 1][0]);
      return key[i - 1][1] + (key[i][1] - key[i - 1][1]) * (u * u * (3 - 2 * u));
    }
    return -1;
  };
  for (let x = 0; x < W; x++) {
    const hw = halfAt(x); if (hw < 0.8) continue;
    const y0 = Math.round(11 - hw), y1 = Math.round(11 + hw);
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1) { px(ctx, CPAL.out, x, y); continue; }
      const t = (y - y0) / (y1 - y0);
      px(ctx, t < 0.14 ? HD.ll : t < 0.34 ? HD.l : t < 0.62 ? HD.mm : t < 0.84 ? HD.d : HD.dd, x, y);
    }
  }
  // a lit leading edge, two creases and three nails at the tip
  for (let x = 4; x < 27; x++) px(ctx, HD.pale, x, Math.round(11 - halfAt(x)) + 1);
  for (const k of [-0.35, 0.3]) for (let x = 8; x < 27; x++) {
    const hw = halfAt(x); if (hw < 2) continue;
    px(ctx, HD.d, x, Math.round(11 + hw * k));
  }
  for (let i = 0; i < 3; i++) { px(ctx, CPAL.bone, 26 - i, 8 + i * 4, 2, 2); px(ctx, HD.dd, 26 - i, 10 + i * 4, 2, 1); }
  return spriteFromHi(c, 6, 10);
}

// ---- pirate flag on a pole (flies behind the saddle) ----------------------
//  20 x 18 world units, anchored at world (2, 9) — unchanged.
//  SIXTEEN frames, and the travelling wave is keyed off frame/FLAG_N * TAU so
//  the set WRAPS: the old eight frames advanced the phase by 0.8 rad each,
//  which is 6.4 over a lap where a lap is 6.283, so every eighth frame the
//  cloth jumped back 0.117 rad — a cycle that reset instead of wrapping. At
//  twice the frames and an exact lap the cloth now travels instead of
//  flickering, and the rig fills the gaps between frames with a continuous
//  sway of the same phase (see Rig.draw).
const FLAG_N = 16;
function buildFlag(frame) {
  const c = newCanHi(20, 18), ctx = c.getContext('2d');
  const u = ((frame % FLAG_N) / FLAG_N) * TAU;      // exact lap over the set
  const wav = Math.sin(u) * 2;
  for (let y = 0; y < 24; y++) {
    const ph = (y / 24) * 3.1 + u;
    const off = Math.round(Math.sin(ph) * 3 + wav * 0.8);
    const lit = Math.cos(ph);
    for (let x = 0; x < 30; x++) {
      const yy = 6 + y + off;
      let col = CPAL.hatD;
      if (lit > 0.45) col = CPAL.hat;
      if (lit > 0.86) col = CPAL.hatL;
      if (lit < -0.55) col = CPAL.out2;
      // the fly end frays, and the whole field is hemmed
      if (y === 0 || y === 23 || x > 27) col = CPAL.out2;
      if (x > 25 && ((x + y) & 3) === 0) continue;
      px(ctx, col, 6 + x, yy);
    }
  }
  // ---- the blood that has been on this flag since the second boat. It rides
  //      the same wave offset as the cloth, so it stays ON the cloth however
  //      the frame ripples instead of swimming across it.
  for (let i = 0; i < 22; i++) {
    const y = 15 + (i % 7), sx = 8 + i;
    const ph2 = (y / 24) * 3.1 + u;
    const off2 = Math.round(Math.sin(ph2) * 3 + wav * 0.8);
    if (hash2(sx * 5, y * 3) < 0.42) continue;
    px(ctx, hash2(sx, y) > 0.6 ? CPAL.bloodD : '#3a0a10', 6 + sx - 8, 6 + y + off2, 2, 1);
  }
  // a skull, reduced to two black sockets and a jaw that still reads
  const off0 = Math.round(Math.sin(0.45 * 3.1 + u) * 3 + wav * 0.8);
  stamp(ctx, [
    '..WWWWWW..',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWkkWWkkWW',
    'WWkkWWkkWW',
    'WWWWWWWWWW',
    'WWWWkkWWWW',
    '.WWWWWWWW.',
    '..WkWkWkW.',
    '..WWWWWWW.',
  ], 14, 12 + off0, { k: CPAL.out, W: CPAL.white });
  return spriteFromHi(c, 4, 18);
}

// ===========================================================================
//  CAPTAIN OTTER — rides the saddle, aims 360 degrees.
//  Every part keeps the WORLD size and the joint offsets it already had, so
//  the standing pose, the skill tree's drowning otter, the cinematics' rough
//  copy of him and the shore scene all stay put — only the resolution moved.
// ===========================================================================
function buildOtterTorso() {
  const c = newCanHi(21, 19), ctx = c.getContext('2d');
  const M = { k: CPAL.out, C: CPAL.cape, c: CPAL.capeD, L: CPAL.capeL,
              f: CPAL.fur, d: CPAL.furD, D: CPAL.furDD, l: CPAL.furL, r: CPAL.cream, R: CPAL.creamD };
  // cape: a collar behind the shoulders that falls away aft, not a curtain
  stampUp(ctx, [
    '...kkkkkkkkk...',
    '.kkcCCCCCCCckk.',
    'kcCCCCCCCCCCCck',
    'kCCCCCCCCCCCCCk',
    '.kcCCCCCCCCCck.',
    '..kcCCCCCCCck..',
    '...kkcCCCckk...',
    '.....kkkkk.....',
  ], 6, 18, M);
  // cape folds, and a torn hem
  for (let i = 0; i < 4; i++) { const x = 10 + i * 6; for (let y = 22; y < 34; y++) if (hash2(x, y) > 0.25) px(ctx, CPAL.capeD, x, y); }
  for (let x = 12; x < 30; x += 3) px(ctx, CPAL.capeL, x, 21, 2, 1);
  // ---- it is a CAPTAIN'S coat, so it gets gold lace down both front edges.
  //      Read the edge off the raster rather than naming coordinates: at this
  //      point the canvas holds nothing but the coat, so the outermost opaque
  //      pixel in each row IS the edge, whatever shape the stamp came out.
  {
    const d = ctx.getImageData(0, 0, c.width, c.height).data, W2 = c.width;
    for (let y = 18; y < c.height; y++) {
      let l = -1, r = -1;
      for (let x = 0; x < W2; x++) if (d[(y * W2 + x) * 4 + 3] > 8) { if (l < 0) l = x; r = x; }
      if (l < 0 || r - l < 7) continue;
      px(ctx, CPAL.goldD, l + 1, y, 2, 1); px(ctx, CPAL.goldD, r - 2, y, 2, 1);
      if ((y & 1) === 0) { px(ctx, CPAL.goldL, l + 1, y); px(ctx, CPAL.goldL, r - 1, y); }
    }
  }
  // torso: shoulders at the top, a cream chest, hips at the bottom
  stampUp(ctx, [
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
  ], 8, 2, M);
  // fur: a lit crown over the shoulders and a shaded flank, then a grain pass
  for (let x = 12; x < 32; x++) px(ctx, CPAL.furL, x, 7);
  for (let y = 8; y < 32; y++) for (let x = 10; x < 34; x++) {
    if (hash2(x * 5 + 1, y * 3) > 0.945) px(ctx, CPAL.furD, x, y);
    else if (hash2(x * 11, y * 7) > 0.975) px(ctx, CPAL.furLL || CPAL.furL, x, y);
  }
  // bandolier across the chest, with brass rounds in the loops
  for (let i = 0; i < 17; i++) {
    const x = 11 + i, y = 7 + i;
    px(ctx, CPAL.leaD, x, y, 2, 4); px(ctx, CPAL.lea, x, y, 2, 2); px(ctx, CPAL.leaL, x, y, 2, 1);
    if (i % 4 === 1) { px(ctx, CPAL.goldD, x, y + 2, 2, 3); px(ctx, CPAL.goldL, x, y + 2, 2, 1); }
  }
  // the buckle over the heart
  px(ctx, CPAL.out, 19, 16, 6, 6); px(ctx, CPAL.goldD, 20, 17, 4, 4);
  px(ctx, CPAL.gold, 20, 17, 3, 3); px(ctx, CPAL.goldL, 20, 17, 2, 1);
  // ---- the cutlass across his back: a basket hilt over one shoulder and the
  //      scabbard running down behind him, so the blade reads even side-on
  px(ctx, CPAL.out, 4, 12, 4, 20); px(ctx, CPAL.leaD, 5, 13, 2, 18);
  px(ctx, CPAL.lea, 5, 13, 1, 18); px(ctx, CPAL.metLL, 5, 30, 2, 2);
  px(ctx, CPAL.out, 3, 8, 7, 6);
  px(ctx, CPAL.goldD, 4, 9, 5, 4); px(ctx, CPAL.gold, 4, 9, 4, 2); px(ctx, CPAL.goldL, 4, 9, 3, 1);
  px(ctx, CPAL.out, 6, 10, 2, 2);
  // ---- and what the last man who argued left on his chest
  for (const [bx, by] of [[18, 10], [24, 13], [21, 19], [16, 15], [26, 20]]) {
    px(ctx, CPAL.bloodD, bx, by, 2, 1); px(ctx, CPAL.blood, bx, by);
    if (hash2(bx, by) > 0.5) px(ctx, CPAL.bloodD, bx + 2, by + 1);
  }
  // salvaged steel pauldrons, tucked in at the shoulders, with a rivet each
  for (const sx of [8, 28]) {
    px(ctx, CPAL.out, sx, 4, 6, 9);
    px(ctx, CPAL.metL, sx + 1, 5, 4, 4);
    px(ctx, CPAL.metD, sx + 1, 9, 4, 3);
    px(ctx, CPAL.metLL, sx + 1, 5, 3, 1);
    px(ctx, CPAL.out2, sx + 2, 7, 2, 2); px(ctx, CPAL.metLL, sx + 2, 7);
    px(ctx, '#8a4526', sx + 4, 10, 1, 2);
  }
  return spriteFromHi(c, 20, 18);
}

// Head + tricorn hat. The face is NOT baked in — drawOtterFace paints it live
// onto CH.headBuf so the expression can change every frame.
function buildOtterHeadHi() {
  const c = newCanHi(19, 17), ctx = c.getContext('2d');
  const M = { k: CPAL.out, f: CPAL.fur, d: CPAL.furD, D: CPAL.furDD, l: CPAL.furL,
              h: CPAL.hat, H: CPAL.hatL, x: CPAL.hatD, X: CPAL.hatLL, W: CPAL.white };
  // ears first, so the skull overlaps them
  for (const ex of [2, 30]) {
    px(ctx, CPAL.out, ex, 10, 6, 8);
    px(ctx, CPAL.furDD, ex + 1, 11, 4, 6);
    px(ctx, '#7a4356', ex + 2, 12, 2, 3);
  }
  // ---- somebody took a piece out of the starboard ear and he kept the rest.
  //      Cut the notch out of the silhouette, re-ink the raw edge, leave it
  //      scabbed: an ear that has been bitten does not grow back tidy.
  ctx.clearRect(33, 9, 4, 5);
  px(ctx, CPAL.out, 32, 9, 1, 6); px(ctx, CPAL.out, 33, 14, 4, 1);
  px(ctx, CPAL.bloodD, 32, 10, 1, 4); px(ctx, CPAL.blood, 32, 11, 1, 2);
  ctx.clearRect(34, 16, 2, 2);
  px(ctx, CPAL.out, 33, 16, 1, 3); px(ctx, CPAL.bloodD, 33, 17);
  // ---- and a gold hoop through the port one. Hand-rasterized: a ring drawn
  //      with ctx.arc would come back with soft edges on it.
  px(ctx, CPAL.goldD, 2, 18, 5, 1); px(ctx, CPAL.goldD, 2, 22, 5, 1);
  px(ctx, CPAL.goldD, 1, 19, 1, 3); px(ctx, CPAL.goldD, 6, 19, 1, 3);
  px(ctx, CPAL.goldL, 2, 18, 3, 1); px(ctx, CPAL.goldL, 1, 19, 1, 2);
  px(ctx, CPAL.out, 3, 19, 3, 3);
  // skull: wide cheeks, narrow chin
  stampUp(ctx, [
    '.kkkkkkkkkkk.',
    'kdffffffffdk.',
    'kffffffffffk',
    'kffffffffffk',
    'kffffffffffk',
    'kdffffffffdk',
    '.kdffffffdk.',
    '..kddffddk..',
    '...kkkkkk...',
  ], 6, 10, M);
  // fur: a lit crown down the middle, shaded jowls, then a grain pass
  for (let y = 13; y < 22; y++) px(ctx, CPAL.furL, 17 - ((y - 13) >> 2), y, 5, 1);
  for (let i = 0; i < 5; i++) { px(ctx, CPAL.furL, 8 + i, 22 + i, 2, 1); px(ctx, CPAL.furL, 29 - i, 22 + i, 2, 1); }
  for (let y = 12; y < 30; y++) for (let x = 7; x < 32; x++) {
    if (hash2(x * 7, y * 5 + 2) > 0.955) px(ctx, CPAL.furD, x, y);
    else if (hash2(x * 3, y * 11) > 0.978) px(ctx, CPAL.furL, x, y);
  }
  // tricorn: a wide brim over the brow, a low crown, a gold band
  stampUp(ctx, [
    '....kkkkkkk....',
    '...kxhhhhhxk...',
    '.kkxhhhHHHhxkk.',
    'kxhhhhhhhhhhhxk',
    'kXxxxxxxxxxxxXk',
  ], 4, 0, M);
  // felt nap on the brim, a crown crease and the three cocked corners
  for (let x = 8; x < 30; x++) { px(ctx, CPAL.hatLL, x, 3); px(ctx, CPAL.hatL, x, 5); }
  for (let x = 6; x < 32; x++) if ((x & 3) === 0) px(ctx, CPAL.hatD, x, 7);
  px(ctx, CPAL.out, 4, 8, 3, 2); px(ctx, CPAL.out, 31, 8, 3, 2);
  // hat band with a gold edge
  for (let x = 4; x < 34; x++) { px(ctx, CPAL.goldD, x, 10, 1, 2); px(ctx, CPAL.goldL, x, 10); }
  px(ctx, CPAL.out, 4, 10, 1, 2); px(ctx, CPAL.out, 33, 10, 1, 2);
  // the skull badge on the crown
  stamp(ctx, ['.WWWW.', 'WWWWWW', 'WkWWkW', 'WWWWWW', '.WkkW.'], 16, 2, M);
  return spriteFromHi(c, 18, 18);
}

// The patch, its strap and the ruined socket under it. `p` is black leather,
// `P` its one lit edge, `s` the strap where it leaves the patch for the hat.
// The leather is a dark BROWN, not black: CPAL.out is near-black, so a black
// patch inside a black outline next to a black ear reads as one hole in his
// head rather than as a thing strapped to it.
const PATCH = [
  '.kkkkk.',
  'kPPPPPk',
  'kPpppPk',
  'kppppPk',
  'kpppppk',
  'kkpppkk',
  '.kkkkk.',
];
const PATCHMAP = { k: CPAL.out, p: '#33222b', P: '#6e5a63' };
function drawEyePatch(ctx) {
  // strap stubs leaving the patch and going up under the brim, one each side.
  // A full band across the skull competes with the hat; two stubs read.
  px(ctx, CPAL.out, 21, 14, 2, 1); px(ctx, CPAL.out, 20, 13, 2, 1); px(ctx, CPAL.out, 19, 12, 2, 1);
  px(ctx, CPAL.out, 30, 14, 2, 1); px(ctx, CPAL.out, 31, 13, 2, 1); px(ctx, CPAL.out, 32, 12, 2, 1);
  stampRuns(ctx, PATCH, 23, 13, PATCHMAP);
  px(ctx, '#9a8590', 24, 14, 2, 1);          // the one glint off the leather
  px(ctx, CPAL.metL, 22, 14, 1, 1);          // the buckle stud on the strap
}

// Muzzle + expression, drawn live over the head raster, in ART pixels.
// When it is called on anything but CH.headBuf the destination is in WORLD
// units (src/death.js paints the face onto his bare skull inside a frame
// scaled by 2), so the whole pass goes through a 1/AS scale there and lands
// back on whole screen pixels.
// exp: 'idle' | 'happy' | 'angry' | 'talk' | 'surprised' | 'hurt' | 'pain' | 'drown'
function drawOtterFace(ctx, exp, blink, t) {
  const world = !CH.headBuf || ctx.canvas !== CH.headBuf;
  if (world) { ctx.save(); ctx.scale(1 / AS, 1 / AS); }
  const O = CPAL.out, C = CPAL.cream, CD = CPAL.creamD, E = CPAL.eye, W = CPAL.shine;
  // muzzle pad and nose leather, always there
  stamp(ctx, [
    '..kkkkkkkkkk..',
    '.kCCCCCCCCCCk.',
    'kCCCCCCCCCCCCk',
    'kCCCCCCCCCCCCk',
    'kRCCCCCCCCCCRk',
    '.kRCCCCCCCCRk.',
    '..kkRRRRRRkk..',
  ], 11, 20, { k: O, C, R: CD });
  px(ctx, CD, 14, 25, 8, 1);
  px(ctx, O, 16, 20, 6, 4); px(ctx, '#8a5b46', 16, 20, 4, 2); px(ctx, '#a97a63', 16, 20, 2, 1);

  if (exp === 'drown' || exp === 'pain') {
    px(ctx, O, 8, 16, 6, 2); px(ctx, CPAL.furDD, 8, 14, 6, 2);
    drawEyePatch(ctx);
    const g = Math.floor(t * 4) & 1;
    px(ctx, O, 14, 27, 10, 4 + g * 2);
    px(ctx, CPAL.bloodD, 16, 29, 6, g * 2);
    if (world) ctx.restore();
    return;
  }
  // ---- ONE eye. The other socket is under a patch and has been for years.
  //      The patch is drawn here rather than baked into the head so it rides
  //      every expression, and so it is still on him in the beats where
  //      src/death.js takes his hat off and paints the face onto a bare skull.
  const shut = blink || exp === 'happy';
  {
    const ex = 8;
    if (shut) { px(ctx, O, ex, 16, 6, 2); px(ctx, CPAL.furDD, ex, 15, 6, 1); }
    else {
      const big = exp === 'surprised' ? 2 : 0;
      px(ctx, O, ex - big, 12 - big, 6 + big * 2, 8 + big * 2);
      px(ctx, CPAL.white, ex, 14, 4, 4);
      px(ctx, E, ex + 1, 14, 3, 3);
      px(ctx, W, ex, 14, 2, 2);
    }
  }
  drawEyePatch(ctx);
  // the scar the patch is there because of: it did not stop at the socket
  px(ctx, CPAL.furDD, 25, 20, 2, 1); px(ctx, CPAL.furLL || CPAL.furL, 25, 21, 2, 1);
  px(ctx, CPAL.furDD, 27, 22, 2, 1); px(ctx, CPAL.furLL || CPAL.furL, 27, 23, 2, 1);
  px(ctx, CPAL.furDD, 29, 24, 2, 1);
  // brows say the mood at this size more than the eyes do
  if (exp === 'angry') {
    px(ctx, CPAL.furDD, 6, 10, 8, 2); px(ctx, CPAL.furDD, 10, 12, 5, 2);
    px(ctx, CPAL.furDD, 24, 10, 8, 2); px(ctx, CPAL.furDD, 23, 12, 5, 2);
  } else if (exp === 'surprised') { px(ctx, CPAL.furDD, 6, 8, 8, 2); px(ctx, CPAL.furDD, 24, 8, 8, 2); }
  // mouth
  if (exp === 'happy') {
    px(ctx, O, 14, 28, 10, 2); px(ctx, O, 12, 26, 2, 2); px(ctx, O, 24, 26, 2, 2);
    px(ctx, CPAL.white, 16, 26, 6, 2);
    px(ctx, CPAL.gold, 16, 26, 2, 2); px(ctx, CPAL.goldL, 16, 26, 2, 1);
  } else if (exp === 'angry') {
    px(ctx, O, 14, 28, 10, 4); px(ctx, CPAL.gold, 16, 28, 2, 2); px(ctx, CPAL.white, 20, 28, 2, 2);
    px(ctx, CPAL.goldL, 16, 28, 2, 1);
  } else if (exp === 'talk') {
    const o = Math.floor(t * 9) & 1; px(ctx, O, 16, 26, 8, 4 + o * 2); px(ctx, CPAL.blood, 18, 28, 4, o * 2);
  } else if (exp === 'surprised') { px(ctx, O, 16, 26, 6, 6); px(ctx, CPAL.bloodD, 18, 28, 2, 2); }
  else { px(ctx, O, 14, 28, 10, 2); }
  // two whiskers a side, short, so they do not read as a moustache
  px(ctx, CD, 7, 24, 5, 1); px(ctx, CD, 7, 26, 4, 1);
  px(ctx, CD, 26, 24, 5, 1); px(ctx, CD, 27, 26, 4, 1);
  if (world) ctx.restore();
}

// ---- cigar (clamped in the muzzle, ember at the far end) ------------------
//  9 x 4 world units, anchored at world (0, 2) — unchanged.
function buildCigar() {
  const c = newCanHi(9, 4), ctx = c.getContext('2d');
  for (let x = 0; x < 15; x++) {
    px(ctx, CPAL.out, x, 1, 1, 6);
    px(ctx, x & 1 ? CPAL.woodDD : CPAL.woodD, x, 2, 1, 4);
    px(ctx, CPAL.woodD, x, 2);
  }
  px(ctx, CPAL.goldD, 4, 2, 2, 4); px(ctx, CPAL.goldL, 4, 2, 2, 1);
  px(ctx, CPAL.out, 15, 2, 1, 4);
  px(ctx, CPAL.ember, 15, 3, 2, 2); px(ctx, CPAL.emberL, 16, 3, 1, 1);
  px(ctx, '#3a3a3a', 13, 2, 2, 1);
  return spriteFromHi(c, 0, 4);
}

// ---- arm (shoulder at the anchor, paw at the far end) ---------------------
//  11 x 6 world units, anchored at world (1, 3) — unchanged.
function buildOtterArm() {
  const c = newCanHi(11, 6), ctx = c.getContext('2d');
  // the sleeve of his coat, the cuff, then the paw
  for (let x = 0; x < 15; x++) {
    const hw = x < 2 ? 3 : x < 10 ? 4 : 3;
    px(ctx, CPAL.out, x, 6 - hw, 1, hw * 2);
    px(ctx, CPAL.furD, x, 7 - hw, 1, hw * 2 - 2);
    px(ctx, CPAL.fur, x, 8 - hw, 1, hw * 2 - 4);
    px(ctx, CPAL.furL, x, 8 - hw, 1, 1);
  }
  for (let x = 2; x < 12; x++) if (hash2(x * 5, 9) > 0.6) px(ctx, CPAL.furDD, x, 8 + (x & 1));
  // leather cuff with two stitches
  px(ctx, CPAL.out, 13, 2, 3, 8); px(ctx, CPAL.lea, 13, 3, 3, 6);
  px(ctx, CPAL.leaL, 13, 3, 3, 2); px(ctx, CPAL.creamD, 14, 5, 1, 4);
  // the gold lace on the cuff, to match the coat
  px(ctx, CPAL.goldD, 12, 2, 1, 8); px(ctx, CPAL.goldL, 12, 3, 1, 3);
  // the paw: three fingers curled round a grip, with claws
  px(ctx, CPAL.out, 16, 2, 6, 8);
  px(ctx, CPAL.furD, 17, 3, 4, 6);
  px(ctx, CPAL.fur, 17, 3, 3, 3);
  px(ctx, CPAL.furL, 17, 3, 2, 1);
  px(ctx, CPAL.out, 17, 5, 4, 1); px(ctx, CPAL.out, 17, 7, 4, 1);
  px(ctx, CPAL.bone, 21, 3, 1, 1); px(ctx, CPAL.bone, 21, 6, 1, 1);
  return spriteFromHi(c, 2, 6);
}

function buildOtterTail() {
  const c = newCanHi(14, 8), ctx = c.getContext('2d');
  // flat, rudder-like, thick at the root and tapering: a real otter tail
  const key = [[1, 2], [5, 4.6], [11, 5.2], [17, 4.6], [22, 3.4], [26, 1.6]];
  const halfAt = x => {
    if (x < key[0][0] || x > key[key.length - 1][0]) return -1;
    for (let i = 1; i < key.length; i++) {
      if (x > key[i][0]) continue;
      const u = (x - key[i - 1][0]) / (key[i][0] - key[i - 1][0]);
      return key[i - 1][1] + (key[i][1] - key[i - 1][1]) * (u * u * (3 - 2 * u));
    }
    return -1;
  };
  for (let x = 0; x < 28; x++) {
    const hw = halfAt(x); if (hw < 0.8) continue;
    const y0 = Math.round(8 - hw), y1 = Math.round(8 + hw);
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1) { px(ctx, CPAL.out, x, y); continue; }
      const t = (y - y0) / (y1 - y0);
      px(ctx, t < 0.20 ? CPAL.furL : t < 0.55 ? CPAL.fur : t < 0.80 ? CPAL.furD : CPAL.furDD, x, y);
    }
  }
  for (let x = 3; x < 25; x++) if (halfAt(x) > 2) px(ctx, CPAL.furLL || CPAL.furL, x, Math.round(8 - halfAt(x)) + 1);
  for (let x = 2; x < 26; x++) for (let y = 3; y < 14; y++) {
    if (halfAt(x) < 2 || Math.abs(y - 8) > halfAt(x) - 2) continue;
    if (hash2(x * 7 + 2, y * 3) > 0.94) px(ctx, CPAL.furDD, x, y);
  }
  return spriteFromHi(c, 4, 8);
}

// ===========================================================================
//  THE CANONICAL CAST  —  one set of character sprites, used everywhere
//  ---------------------------------------------------------------------
//  Every scene in the game draws the hero pair from the parts below. Nothing
//  outside this file should rasterize a manatee or an otter of its own: if a
//  pose is missing, add it here and it is instantly the same character in
//  every beat of the game.
//
//  It is all rasterized at DETAIL art pixels per world unit and reports its
//  size in WORLD units, so draw it at an INTEGER scale (1, 2, 3) and every
//  art pixel stays square; the gameplay rig draws it at 1. The exceptions
//  are named above: CH.side, CH.manatee, CH.otterHead and CH.otterStand are
//  one art pixel per world unit because src/death.js measures their rasters.
//
//  TOP-DOWN (bow/nose to the RIGHT, mirror with ctx.scale(-1,1)):
//    CH.manateeHi / CH.manateeArmor    whole body, unarmoured / armoured
//    CH.manatee                        the same body, baked to 1 art pixel
//                                      per world unit, for the scenes that
//                                      measure her raster rather than draw it
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
//  SIDE-ON (facing RIGHT), the cinematic set. TWO BODIES -- she is not hurt
//  yet at the start of the cutscenes, and the caller says which she is:
//    CH.side.body / .fluke / .bellyClean      CLEAN: no propeller runs, no
//                                      wire seam, no blood, no scarred brow,
//                                      fluke with its trailing edge whole
//    CH.side.bodyScar / .flukeScar / .belly   WOUNDED: everything the fleet
//                                      did to her, and a bitten fluke
//    CH.side.hurt                      white-hot silhouette for a hit frame
//    CH.side.flip / .flipFar           pectoral flippers, near and far
//    CH.side.eye / .mouth / .tailX / .shoX / .shoY   anchors, sprite-local
//    CH.drawManateeSide(ctx, m)        body + fluke + flippers + face.
//                                      `m.scarred === false` is the ONLY
//                                      thing that asks for the clean animal;
//                                      leaving the flag off keeps the
//                                      wounded one, so every call site that
//                                      predates the split is unchanged.
//    CH.sideFace(ctx, exp, blink, t)   just the face, at the anchors
//    CH.otterStand                     side-on, standing on a PAIR of hind
//                                      legs, facing right
//    CH.otterStandPeg / ...PegHi       the same pose with the peg leg, opt-in
//    CH.drawOtterStanding(ctx, o)      standing/working/holding, one call;
//                                      `o.peg` draws the peg-leg variant
// ===========================================================================

// ---- belly-up: the same body, drained of the back's colour ---------------
//  Works for both halves of the cast: the top-down hero is hi-res, the
//  side-on cinematic body is not, so the marks are keyed off the raster it
//  is actually given rather than off one set of constants.
function buildManateeBelly(src) {
  const W = src.c.width, H = src.c.height;
  const c = newCan(W, H), ctx = c.getContext('2d');
  drawRaw(ctx, src.c, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.72; ctx.fillStyle = CPAL.belly;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const k = src.hi ? AS : 1, cy = Math.round(H / 2);
  // a pale keel line down the middle and two old boat scars across it
  for (let x = 10 * k; x < W - 8 * k; x += 2) px(ctx, '#c9d6e2', x, cy);
  for (let i = 0; i < 7 * k; i++) { px(ctx, CPAL.blood, 34 * k + i, 11 * k + i); px(ctx, CPAL.bloodD, 34 * k + i, 12 * k + i); }
  for (let i = 0; i < 5 * k; i++) px(ctx, CPAL.bloodD, 52 * k + i, 30 * k - i);
  if (src.hi) { HIRES.add(c); return { c, w: src.w, h: src.h, ax: src.ax, ay: src.ay, hi: 1 }; }
  return spriteFrom(c, src.ax, src.ay);
}

// ===========================================================================
//  SIDE-ON MANATEE — facing RIGHT. The cinematics' hero.
// ===========================================================================
// She is authored on a 98 x 56 grid. The gameplay animal is a BARREL seen
// from above -- 58 art px of beam on 140 of length -- and the old side-on
// profile (98 x 46, 37 rows of body) read as a sausage next to her. This
// one carries 48 rows of body on the same 98 of length: a deep round barrel
// with the weight slung underneath it in a belly, a tail stock that keeps
// most of its depth into the paddle, and a head that sits INTO the body
// with no more neck than a crease.
//
// The extra depth is all BELOW her: the line of her back is where it was,
// row for row, across the middle of her (cols 44-64, where the otter stands
// in the intro at a fixed offset from her anchor), and the anchor is still
// row 23. Everything outside this file reads her size and anchors off the
// record (S.body.w/h, S.eye, S.shoX/shoY, S.len, and death.js maps her back
// and belly column by column off the raster), so the fatter body lands
// correctly everywhere without an offset being retyped. S.len stays 98,
// which is what the intro scales the family by.
const MSIDE_W = 98, MSIDE_H = 56, MSIDE_CX = 49, MSIDE_CY = 23;
// ---- her profile, as a hand-keyed curve -------------------------------------
//  The same rule the top-down body follows: silhouette first, and the
//  silhouette is a keyed curve, not a heap of blobs -- blobs smooth into a
//  row of domes, a curve gives a real belly, a real tail stock and a blunt
//  head. Written as (x, top row, bottom row), eased between keys.
//   x    top    bottom
const MSIDE_KEYS = [
  [ 0,  15.6,  31.4],   // tail stock: thick, not a whip -- the waist before
  [ 4,  14.6,  33.0],   //   the paddle is still a third of her depth
  [10,  12.4,  38.0],
  [18,   9.8,  43.6],
  [27,   7.8,  48.4],
  [36,   6.6,  51.6],
  [45,   6.0,  53.4],
  [53,   5.8,  54.0],   // deepest: the belly, slung just aft of her middle
  [61,   6.0,  53.2],
  [68,   6.9,  50.6],
  [74,   8.4,  46.6],   // the neck: a soft dip over it, a crease under it
  [79,   9.0,  43.0],
  [85,   9.6,  40.2],   // the head: smaller than the body, a round muzzle
  [90,  11.2,  38.2],
  [94,  13.6,  36.2],
  [97,  17.0,  34.0],   // and it ends in a WALL, not a point: cut square
];
function msideEdge(x) {
  const K = MSIDE_KEYS;
  if (x <= K[0][0]) return [K[0][1], K[0][2]];
  for (let i = 1; i < K.length; i++) {
    if (x > K[i][0]) continue;
    const a = K[i - 1], b = K[i], u = (x - a[0]) / (b[0] - a[0]), s = u * u * (3 - 2 * u);
    return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
  }
  const L = K[K.length - 1]; return [L[1], L[2]];
}
// She is painted out of the SAME eight-band hide palette (`HD`) and the same
// marking vocabulary as the top-down animal the game is played with: the same
// lit back falling through the same mid-tones, the same bowed skin folds with
// a dark core and a lit lip, the same speckled algae, the same rimmed
// barnacles, the same bright whisker pad at the front, and literally the same
// five-pixel dot eye stamp. Someone who has just been fighting in her should
// recognise her the moment a cutscene opens. `hurt` adds what the fleet did.
//
// The body is painted BAND BY BAND down each column, the way the top-down
// body is, so her surface is posterized in exactly the steps the gameplay
// sprite is posterized in.
function buildManateeSideBody(hurt) {
  const W = MSIDE_W, H = MSIDE_H, cy = MSIDE_CY;
  const c = newCan(W, H), ctx = c.getContext('2d');
  const top = new Int16Array(W), bot = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const e = msideEdge(x);
    top[x] = Math.round(e[0]); bot[x] = Math.round(e[1]);
  }
  // ---- the hide, in eight bands from a lit back through the flank and back
  //      up into a pale countershaded belly, which then turns UNDER: the last
  //      rows go back down the ramp into a dark keel, so the belly reads as a
  //      round weight hanging off her rather than a flat pale edge.
  const RAMP = [HD.dd, HD.d, HD.m, HD.mm, HD.l, HD.ll, HD.pale, HD.top];
  const bandIx = t => t < 0.05 ? 6 : t < 0.12 ? 5 : t < 0.25 ? 4 : t < 0.42 ? 3
    : t < 0.64 ? 2 : t < 0.76 ? 3 : t < 0.91 ? 4 : t < 0.96 ? 3 : 1;
  const bandOf = t => RAMP[bandIx(t)];
  // A crease is painted RELATIVE to the band it crosses -- two steps down for
  // its core, one step up for the lit lip over it -- so it creases her at the
  // same strength everywhere instead of drawing a black bar down a pale back.
  const dn = (t, n) => RAMP[Math.max(0, bandIx(t) - n)];
  const up = (t, n) => RAMP[Math.min(7, bandIx(t) + n)];
  for (let x = 0; x < W; x++) {
    const y0 = top[x], y1 = bot[x];
    const h = Math.max(1, y1 - y0);
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1) { px(ctx, CPAL.out, x, y); continue; }
      px(ctx, bandOf((y - y0) / h), x, y);
    }
    // close the steps in the outline where the profile moves more than a row
    // between columns, so the line round her never breaks
    if (x > 0) {
      for (let y = Math.min(y0, top[x - 1]); y < Math.max(y0, top[x - 1]); y++) px(ctx, CPAL.out, y0 < top[x - 1] ? x : x - 1, y);
      for (let y = Math.min(y1, bot[x - 1]) + 1; y <= Math.max(y1, bot[x - 1]); y++) px(ctx, CPAL.out, y1 > bot[x - 1] ? x : x - 1, y);
    }
  }
  const solid = (x, y) => x >= 0 && x < W && y > top[x] && y < bot[x];
  const deep = (x, y, k) => solid(x, y) && (y - top[x]) >= k && (bot[x] - y) >= k;
  const tOf = (x, y) => (y - top[x]) / Math.max(1, bot[x] - top[x]);
  // ---- blunt muzzle: a manatee's snout ends in a WALL, not a point, so the
  //      front column is all outline with the two corners knocked off. Same
  //      trick, same reason, as the top-down body.
  {
    const fx = W - 1, y0 = top[fx], y1 = bot[fx];
    for (let y = y0; y <= y1; y++) px(ctx, CPAL.out, fx, y);
    ctx.clearRect(fx, y0, 1, 1); ctx.clearRect(fx, y1, 1, 1);
    px(ctx, CPAL.out, fx - 1, y0); px(ctx, CPAL.out, fx - 1, y1);
  }
  // ---- hide grain. Very sparse single pixels one band off their own, in the
  //      mid-tones only, so she reads leathery rather than speckled.
  for (let x = 3; x < W - 3; x++) for (let y = 2; y < H - 2; y++) {
    if (!deep(x, y, 3)) continue;
    const t = tOf(x, y);
    if (t < 0.22 || t > 0.84) continue;
    const r = hash2(x * 7 + 3, y * 13 + 5);
    if (r > 0.984) px(ctx, t < 0.5 ? HD.l : HD.d, x, y);
    else if (r < 0.014) px(ctx, t < 0.5 ? HD.ll : HD.m, x, y);
  }
  // ---- transverse skin folds across the barrel: a dark core with a lit
  //      upper lip, bowed the way a fold sits on a round back, and stopping
  //      short of the sheer so they crease her instead of banding her.
  for (const fx of [40, 52, 63]) for (let y = 2; y < H - 2; y++) {
    const x = fx + Math.round(Math.sin((y - 29) / 26) * 3);
    if (!deep(x, y, 5)) continue;
    const t = tOf(x, y);
    if (t < 0.12 || t > 0.50) continue;
    px(ctx, dn(t, 1), x, y);
    if (deep(x - 1, y, 6)) px(ctx, up(t, 1), x - 1, y);
  }
  // ---- the crease where her neck meets her shoulders, so the head is a head
  //      without her having a neck: it sits into the body.
  for (let y = 3; y < H - 3; y++) {
    const x = 74 + Math.round(Math.sin((y - 26) / 14) * 3);
    if (!deep(x, y, 4)) continue;
    const t = tOf(x, y);
    if (t > 0.78) continue;
    px(ctx, dn(t, 2), x, y); px(ctx, dn(t, 1), x + 1, y);
    if (deep(x + 2, y, 7)) px(ctx, up(t, 1), x + 2, y);
  }
  // ---- the belly fold. The weight she carries sags, and where it sags the
  //      hide folds: one long crease following the curve of her underside a
  //      few rows up from it, dark core and a lit lip OVER it, and a short
  //      second roll under her chin. This is most of what makes her read as
  //      fat rather than merely big.
  const fold = (x0, x1, off, k) => {
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0);
      const y = bot[x] - off - Math.round(Math.sin(u * Math.PI) * k);
      if (!deep(x, y, 2)) continue;
      const t = tOf(x, y);
      px(ctx, dn(t, 2), x, y);
      if (deep(x, y - 1, 2)) px(ctx, up(t, 1), x, y - 1);
      if (deep(x, y + 1, 2)) px(ctx, dn(t, 1), x, y + 1);
    }
  };
  fold(28, 68, 5, 1);
  fold(70, 84, 4, 1);
  // ---- algae on the back, where the light hits and nothing rubs it off.
  //      Speckled inside a patch, the way it grows; the greens are far enough
  //      off grey that the intro's family recolour leaves them alone.
  for (const [ax, ay, w2, h2] of [[32, 10, 9, 5], [50, 9, 8, 4], [20, 13, 7, 4], [62, 10, 6, 3]]) {
    for (let y = ay; y < ay + h2; y++) for (let x = ax; x < ax + w2; x++) {
      if (!deep(x, y, 2)) continue;
      const r = hash2(x * 3, y * 5);
      if (r > 0.55) px(ctx, HALG[r > 0.86 ? 2 : r > 0.7 ? 0 : 1], x, y);
    }
  }
  // ---- barnacles: a dark rim, a dull shell and a shadow, three art px wide
  //      (half the art pixels the top-down ones get, because the side-on set
  //      is authored at one art pixel per world unit and the top-down at two)
  for (const [bx, by] of [[31, 22], [47, 17], [60, 26], [24, 30], [40, 33]]) {
    if (!deep(bx, by, 4)) continue;
    px(ctx, HD.d, bx - 1, by - 1, 3, 3);
    px(ctx, '#9a9382', bx, by, 2, 2);
    px(ctx, '#c2bba6', bx, by, 1, 1);
  }
  // ---- head ---------------------------------------------------------------
  // The whisker pad: the brightest block on her, right at the front, so the
  // silhouette has a face end and a tail end at any distance. Clipped to the
  // muzzle so it never spills off the outline. Same ellipse, same bands --
  // just a bigger, heavier upper lip on a bigger head.
  const PY = 27;                         // the pad's centre row
  for (let y = PY - 9; y <= PY + 9; y++) for (let x = 86; x < W - 1; x++) {
    if (!deep(x, y, 1)) continue;
    const t = Math.abs(y - PY) / 7.6, u = (x - 97) / 11;
    // lit from above like the rest of her: the dome's centre sits high on it
    const r = Math.sqrt((y - PY + 2) * (y - PY + 2) / 57.8 + u * u * 1.2);
    if (t * t + u * u > 1) continue;
    px(ctx, r > 0.92 ? HD.mm : r > 0.70 ? HD.l : r > 0.46 ? HD.ll : r > 0.24 ? HD.pale : HD.top, x, y);
  }
  // the pad's back edge, so the lip stands off the cheek
  for (let y = PY - 7; y <= PY + 7; y++) {
    const t = Math.abs(y - PY) / 7.6, x = Math.round(97 - 11 * Math.sqrt(Math.max(0, 1 - t * t))) - 1;
    if (deep(x, y, 2)) px(ctx, dn(tOf(x, y), 1), x, y);
  }
  // dimples in the pad, a lit row and a shaded one, so it reads as stippled
  for (const [dx, dy] of [[90, -3], [93, -4], [90, 3], [93, 3]]) {
    if (!deep(dx, PY + dy, 1)) continue;
    px(ctx, HD.l, dx, PY + dy); px(ctx, HD.top, dx, PY + dy - 1);
  }
  // the nostril: one short slit high on the muzzle with a lit upper lip --
  //  a slit in the hide, not a hole: in the ink it read as a second eye
  px(ctx, HD.top, 93, 17, 3, 1); px(ctx, HD.dd, 93, 18, 3, 1); px(ctx, HD.d, 94, 19, 2, 1);
  // the mouth, a crease across the bottom of the pad, at S.mouth
  px(ctx, HD.m, 89, 31, 7, 1); px(ctx, HD.d, 90, 32, 6, 1); px(ctx, HD.dd, 91, 33, 4, 1);
  for (const [wx, wy] of [[96, 22], [96, 30], [95, 19], [95, 33]]) if (solid(wx, wy)) px(ctx, CPAL.bone, wx, wy, 2, 1);
  // ---- the DOT eye. One black bead with one glint, ringed by a pale socket
  //      so it survives against whichever band of hide it lands on: the same
  //      five pixels, the same stamp, as the pair of them on the top-down her.
  {
    const ex = 82, ey = 16;
    px(ctx, HD.pale, ex, ey - 1, 5, 1);
    stamp(ctx, ['.kkk.', 'keeek', 'keeek', 'keeek', '.kkk.'], ex, ey, { k: CPAL.out, e: CPAL.eye });
    px(ctx, CPAL.shine, ex + 1, ey + 1);
    px(ctx, HD.dd, ex, ey + 5, 5, 1);
  }
  // =======================================================================
  //  WOUNDED ONLY, from here down. `hurt` false leaves her completely clean:
  //  no propeller runs, no wire seam, no blood, no scarred brow.
  // =======================================================================
  if (!hurt) return spriteFrom(c, MSIDE_CX, MSIDE_CY);
  // Propeller rakes, in the top-down body's own recipe: the hide is cut, the
  // lip of it stands up torn and pale, meat under the lip, wet blood in the
  // deepest part of the run, and the smear the water dragged aft.
  const gash = (x0, y0, dx, dy, n, open) => {
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + i * dx), y = Math.round(y0 + i * dy);
      if (!deep(x, y, 3)) continue;
      const mid = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 || 1);
      px(ctx, HD.top, x, y - 1);
      px(ctx, CPAL.meatD, x, y);
      if (open) {
        px(ctx, mid > 0.45 ? CPAL.gore : CPAL.goreD, x, y);
        if (mid > 0.78) px(ctx, CPAL.goreL, x, y);
      }
      px(ctx, CPAL.goreD, x, y + 1);
      for (let k = 1; k <= 6; k++) {
        const sx = x - k * 2, sy = y + ((k >> 1) & 1);
        if (!deep(sx, sy, 2)) continue;
        if (hash2(sx * 5 + i, sy * 7) < 0.26 + k * 0.10) continue;
        px(ctx, k < 3 ? CPAL.stain : CPAL.stainD, sx, sy);
      }
    }
  };
  gash(40, 14, 1.1, 0.8, 14, 1);
  gash(57, 37, 1.0, -0.7, 11, 1);
  gash(27, 27, 1.0, 0.5, 9, 0);
  gash(66, 19, 0.9, -0.4, 6, 0);
  gash(34, 42, 1.2, 0.3, 7, 0);
  // ---- the stitched wound. Somebody sewed her back together with whatever
  //      was on the boat, and it held: a long closed seam with cross-ticks of
  //      wire either side of it.
  for (let i = 0; i < 22; i++) {
    const x = 46 + i, y = Math.round(cy + 8 + Math.sin(i * 0.22) * 3 + i * 0.16);
    if (!deep(x, y, 3)) continue;
    px(ctx, CPAL.meatD, x, y, 1, 2);
    px(ctx, HD.pale, x, y - 1);
    if (i % 4 === 1 && deep(x, y + 3, 2)) {
      px(ctx, CPAL.bone, x, y - 2, 1, 2); px(ctx, CPAL.bone, x + 1, y + 1, 1, 2);
      px(ctx, HD.dd, x + 1, y - 2, 1, 2); px(ctx, HD.dd, x + 2, y + 1, 1, 2);
    }
  }
  // a scar through the brow, so the dot eye reads as a hard one
  for (let y = 10; y < 16; y++) if (deep(78, y, 3)) { px(ctx, HD.dd, 78, y); px(ctx, HD.pale, 79, y); }
  if (deep(87, 19, 1)) { px(ctx, HD.dd, 87, 19, 3, 1); px(ctx, CPAL.bloodD, 88, 20, 2, 1); }
  return spriteFrom(c, MSIDE_CX, MSIDE_CY);
}
// ---- the fluke -------------------------------------------------------------
//  A manatee's tail is a broad ROUND paddle -- a spade, not a shark's fork
//  and not a leaf -- and on a fat animal it is a big one, on a stock nearly
//  as deep as the end of her body. `bitten` cuts a chunk out of the trailing
//  edge and packs meat behind the raw rim; without it the trailing edge is
//  whole, because the natural edge of a fluke is not a wound and must not be
//  inked like one.
const MFLUKE_W = 32, MFLUKE_H = 32;
function buildSideFluke(bitten) {
  const W = MFLUKE_W, H = MFLUKE_H, cy = 16;
  const f = blobField(W, H, [
    { x: 29,   y: cy, rx: 4.0, ry: 6.2 },   // the stock, where it meets her
    { x: 23,   y: cy, rx: 5.6, ry: 7.6 },
    { x: 16.5, y: cy, rx: 7.2, ry: 10.6 },
    { x: 10.5, y: cy, rx: 7.8, ry: 13.6 },  // the paddle: widest a third in
    { x: 5.5,  y: cy, rx: 5.2, ry: 10.6 },
    { x: 2,    y: cy, rx: 2.4, ry: 6.5 },   // and a ROUND trailing edge
  ]);
  const { c, ctx } = shadeBlob(W, H, f, [HD.d, HD.m, HD.mm, HD.l], { outline: CPAL.out, lift: 0.22, smooth: 3, contrast: 0.66 });
  const has = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0.05;
  // ridges fanning out of the peduncle, dark with a lit pixel over them:
  // the same treatment the top-down fluke gets, so it is the same tail
  for (const sl of [-0.34, 0.34]) for (let x = 5; x < 25; x++) {
    const y = cy + Math.round((25 - x) * sl);
    if (!has(x, y) || !has(x, y + 3) || !has(x, y - 3)) continue;
    px(ctx, HD.m, x, y);
    if ((x & 3) === 0 && has(x, y - 1)) px(ctx, HD.l, x, y - 1);
  }
  // and one lit pixel along the trailing edge, just inside the ink, so it
  // turns instead of ending (on the ink itself it dissolved into the water)
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < 9; x++) {
    if (has(x, y)) { if (has(x + 1, y) && has(x + 1, y - 1) && has(x + 1, y + 1)) px(ctx, HD.l, x + 1, y); break; }
  }
  if (!bitten) return spriteFrom(c, W - 3, cy);
  // ---- a chunk out of the trailing edge. The field `f` is what says where
  //      she is, so the bite is cut out of the raster and the raw rim is
  //      re-inked off the same field.
  const cut = new Uint8Array(W * H);
  const bit = (bx, byc, r) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - bx) / (r * 1.2), dy = (y - byc) / r;
      if (dx * dx + dy * dy > 1 + (hash2(x * 7, y * 3) - 0.5) * 0.5) continue;
      if (f[y * W + x] > 0) cut[y * W + x] = 1;
      f[y * W + x] = 0; ctx.clearRect(x, y, 1, 1);
    }
  };
  bit(2, 6, 4.6);                       // one clean bite, not a serrated edge
  for (let y = 0; y < H; y++) for (let x = 0; x < 16; x++) {
    if (f[y * W + x] <= 0) continue;
    const wasCut = (qx, qy) => qx >= 0 && qy >= 0 && qx < W && qy < H && cut[qy * W + qx];
    if (!(wasCut(x - 1, y) || wasCut(x + 1, y) || wasCut(x, y - 1) || wasCut(x, y + 1))) continue;
    px(ctx, CPAL.out, x, y);
    for (let k = 1; k <= 3; k++) {
      if (f[y * W + x + k] <= 0) break;
      px(ctx, k === 1 ? CPAL.meat : k === 2 ? CPAL.gore : CPAL.goreD, x + k, y);
    }
  }
  return spriteFrom(c, W - 3, cy);
}
// ---- the pectoral flipper ---------------------------------------------------
//  A short, fat, rounded paddle, held in HIDE tones and outlined in her own
//  darkest hide rather than the universal near-black: in near-blacks, across
//  her pale belly, the old one read as a gun barrel strapped under her chin.
//  Stubby -- a mitten, not an arm. `dark` is the far one, one band back.
//  It is authored cocked 0.4 rad UP from the canvas axis, so at the rest
//  angle every caller hands it (about 2.15) it HANGS from her chest, tip a
//  little aft, instead of lying flat along her belly like a strapped-on part.
//  The root is at (4,10) -- the shoulder.
function buildSideFlipper(dark) {
  const W = 20, H = 17, A = -0.4, ca = Math.cos(A), sa = Math.sin(A), RX = 4, RY = 10;
  // narrow at the wrist, widening into a round paddle: a mitten, not a pill
  const L = [[0, 2.8, 3.4], [3, 3.4, 4.3], [6, 3.8, 5.2], [9, 3.6, 5.2], [11.4, 2.6, 4.0]];
  const f = blobField(W, H, L.map(l => ({ x: RX + ca * l[0], y: RY + sa * l[0], rx: l[1], ry: l[2], rot: A })));
  const ramp = dark ? [HD.d, HD.m, HD.mm] : [HD.m, HD.mm, HD.l];
  const { c, ctx } = shadeBlob(W, H, f, ramp, { outline: dark ? HD.dd : HD.d, lift: 0.34, smooth: 2, contrast: 0.56 });
  const has = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0.04;
  const inner = (x, y) => has(x, y) && has(x - 1, y) && has(x + 1, y) && has(x, y - 1) && has(x, y + 1);
  // the leading edge keeps a lit lip all the way to the tip (it faces
  // forward once the flipper hangs)
  for (let x = 1; x < W - 1; x++) for (let y = 0; y < H; y++) if (has(x, y)) { if (inner(x, y + 1)) px(ctx, dark ? HD.mm : HD.ll, x, y + 1); break; }
  // one hint of the nails on the tip. Three bone-white pixels was all it
  // took to make a flipper read as a machined part at her actual screen size.
  const nx = Math.round(RX + ca * 12.6), ny = Math.round(RY + sa * 12.6);
  if (!dark && inner(nx, ny)) px(ctx, HD.ll, nx, ny);
  return spriteFrom(c, RX, RY);
}
// ---- the side-on set -------------------------------------------------------
//  TWO BODIES, and the caller picks:
//    S.body      CLEAN -- no propeller runs, no wire seam, no blood, no
//                scarred brow, and a fluke with its trailing edge whole.
//                This is "not hurt yet": the opening beats, the family.
//    S.bodyScar  WOUNDED -- the same animal with everything the fleet did to
//                her, and S.flukeScar is the tail with a bite out of it.
//  Every part is the same size and the same anchors in both, so a beat can
//  cut from one to the other on a single frame without anything moving.
function buildManateeSideSet() {
  const body = buildManateeSideBody(false);
  const scar = buildManateeSideBody(true);
  return {
    body, bodyScar: scar,
    // belly-up is a late beat, so it is the hurt body drained of its back
    belly: buildManateeBelly(scar),
    bellyClean: buildManateeBelly(body),
    hurt: tintFlat(body, '#ffffff', 0.85),
    fluke: buildSideFluke(false),          // whole trailing edge
    flukeScar: buildSideFluke(true),       // a chunk bitten out of it
    flip: buildSideFlipper(false),
    flipFar: buildSideFlipper(true),
    // anchors, in sprite-local world units (0,0 = her centre)
    eye: [83 - MSIDE_CX, 17 - MSIDE_CY],
    mouth: [91 - MSIDE_CX, 32 - MSIDE_CY],
    tailX: 3 - MSIDE_CX, shoX: 72 - MSIDE_CX, shoY: 38 - MSIDE_CY,
    len: MSIDE_W,
  };
}
// Her face, live, at the side set's anchors. exp: calm|angry|sad|wide|pain|dead|talk
function manateeSideFace(ctx, exp, blink, t) {
  const S = CH.side; if (!S) return;
  const ex = S.eye[0], ey = S.eye[1], mx = S.mouth[0], my = S.mouth[1];
  const O = CPAL.out;
  const shut = blink && exp !== 'dead' && exp !== 'wide';
  // Painted in the hide palette the body is painted in, over the socket the
  // body already baked: the same bead, the same glint, the same pale brow and
  // shadow the top-down animal's pair of eyes carry.
  if (exp === 'pain' || shut) {
    px(ctx, O, ex - 1, ey + 1, 5, 1); px(ctx, HD.dd, ex - 1, ey - 1, 5, 1);
  } else if (exp === 'dead') {
    px(ctx, O, ex - 1, ey - 1, 5, 5); px(ctx, HD.m, ex, ey, 3, 3);
  } else {
    const big = exp === 'wide' ? 1 : 0;
    px(ctx, HD.pale, ex - 1, ey - 2, 5, 1);
    px(ctx, O, ex - 1 - big, ey - 1 - big, 5 + big * 2, 5 + big * 2);
    px(ctx, CPAL.eye, ex - big, ey - big, 3 + big * 2, 3 + big * 2);
    px(ctx, CPAL.shine, ex, ey);
    px(ctx, HD.dd, ex - 1, ey + 4, 5, 1);
    if (exp === 'angry') { px(ctx, HD.dd, ex - 2, ey - 2, 6, 1); px(ctx, HD.dd, ex + 1, ey - 3, 4, 1); }
    else if (exp === 'sad') { px(ctx, HD.dd, ex - 3, ey - 3, 5, 1); }
  }
  // the mouth, on the whisker pad: a soft crease closed, a small round O open
  const open = exp === 'wide' || exp === 'pain' || (exp === 'talk' && (Math.floor(t * 7) & 1));
  if (open) { px(ctx, O, mx - 2, my - 1, 6, 4); px(ctx, '#2a1218', mx - 1, my, 4, 2); }
  else { px(ctx, HD.m, mx - 2, my - 1, 7, 1); px(ctx, HD.d, mx - 1, my, 6, 1); px(ctx, HD.dd, mx, my + 1, 4, 1); }
}
// One call for the whole side-on animal.
//  m: {x, y, rot, flip, sx, sy, phase, tailAmp, flipperA, exp, blink, belly,
//      scarred, hurt, alpha, scale}
function drawManateeSide(ctx, m, t) {
  const S = CH.side; if (!S) return;
  ctx.save();
  // Rounding to a whole WORLD unit put the cinematics' hero on a two-screen-
  // pixel grid: every drift, every rise, every slow push across a shot was a
  // staircase with a tread twice as coarse as the screen she was drawn on.
  // _snapXY solves the same rounding through the live transform instead, so
  // she lands on the pixel grid the screen actually has — half the tread, and
  // the same crisp edge. (She is rotated on the next line in most shots
  // anyway, which is the other half of why the coarse grid bought nothing.)
  { const p = _snapXY(ctx, m.x || 0, m.y || 0); ctx.translate(p[0], p[1]); }
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
  // Clean or wounded, body and fluke together. `scarred: false` is the only
  // thing that asks for the CLEAN animal -- leaving the flag off keeps the
  // wounded one, so every call site that predates the split (src/death.js's
  // shore scene) draws exactly what it drew before.
  const wounded = m.scarred !== false;
  const fl = wounded ? (S.flukeScar || S.fluke) : S.fluke;
  ctx.save(); ctx.translate(S.tailX, 0); ctx.rotate(Math.sin(ph) * amp);
  ctx.drawImage(fl.c, -fl.ax, -fl.ay); ctx.restore();
  const b = m.hurt ? S.hurt : m.belly ? (wounded ? S.belly : S.bellyClean) : wounded ? S.bodyScar : S.body;
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
//  16 x 22 world units, anchored at world (8, 12) — unchanged, so the shore
//  scene's joints still land. CH.otterStand is the 1x bake of this (see
//  bake1x); CH.otterStandHi is what actually gets drawn.
//
//  LEGS. He stands on a PAIR of hind legs: a haunch, a shank and a webbed
//  foot each, the far one a band darker and set back so the two read as two.
//  `peg` builds the old variant instead — far leg plus the wooden peg — and
//  it is kept as CH.otterStandPeg/CH.otterStandPegHi and reached with
//  `{ peg: true }` on CH.drawOtterStanding. Both variants put both soles on
//  the same canvas row the peg's brass ferrule used to sit on, and both are
//  drawn inside the same 32 x 44 canvas, so his record — 16 x 22 world units,
//  anchored (8, 12) — is byte-identical either way and nothing that stands
//  him on anything moved.
function buildOtterStand(peg) {
  const c = newCanHi(16, 22), ctx = c.getContext('2d');
  const M = { k: CPAL.out, C: CPAL.cape, c: CPAL.capeD, L: CPAL.capeL, f: CPAL.fur, d: CPAL.furD,
              D: CPAL.furDD, l: CPAL.furL, r: CPAL.cream, R: CPAL.creamD, e: CPAL.lea, E: CPAL.leaL };
  // cape hanging down his back
  stampUp(ctx, [
    '.kkkk.',
    'kcCCck',
    'kCCCCk',
    'kCCCCk',
    'kcCCck',
    'kCCCCk',
    '.kcck.',
  ], 2, 8, M);
  for (let y = 11, i = 0; y < 34; y += 3, i++) px(ctx, CPAL.capeD, 5 + (i & 1) * 4, y, 1, 3);
  for (let x = 4; x < 12; x += 3) px(ctx, CPAL.capeL, x, 10, 2, 1);
  // body: chest forward, belly, haunches
  stampUp(ctx, [
    '..kkkkk..',
    '.kddfffk.',
    'kdffffrk.',
    'kdfffrrk.',
    'kdffrrrk.',
    'kdffrrrk.',
    'kddffrrk.',
    'kdddffkk.',
    '.kkkkk...',
  ], 8, 6, M);
  // fur grain over the back, a lit chest edge and a shaded belly fold
  for (let y = 9; y < 26; y++) for (let x = 9; x < 24; x++) {
    if (hash2(x * 5, y * 7 + 1) > 0.94) px(ctx, CPAL.furD, x, y);
    else if (hash2(x * 13, y * 3) > 0.975) px(ctx, CPAL.furL, x, y);
  }
  for (let i = 0; i < 9; i++) px(ctx, CPAL.creamD, 20 - (i >> 2), 12 + i);
  // ---- a hind leg: haunch into shank into a webbed foot, sole on row 43.
  //      Written as a row loop rather than a stamp so the shank can actually
  //      taper into the ankle instead of being a rectangle with a foot on it.
  const hindLeg = (hx, far) => {
    const mid = far ? '#57270f'  : CPAL.furD;    // the far leg is a band and a
    const lit = far ? CPAL.furDD : CPAL.fur;     // half darker than the near
    const hi  = far ? CPAL.furD  : CPAL.furL;    // one, or the pair reads as
    const toe = far ? '#57270f'  : CPAL.creamD;  // one leg and its own shadow
    for (let y = 26; y <= 37; y++) {
      const k = (y - 26) / 11;
      const hw = Math.round(4 - k * 1.9);             // haunch 4 -> ankle 2
      const cxl = hx + 3 + Math.round(k * 1.2);       // and it drifts forward
      const x0 = cxl - hw, w = hw * 2;
      px(ctx, CPAL.out, x0, y, w, 1);
      px(ctx, mid, x0 + 1, y, w - 2, 1);
      if (w > 4) px(ctx, lit, x0 + 2, y, w - 4, 1);
      if (y < 31 && w > 5) px(ctx, hi, x0 + 2, y, 2, 1);
    }
    px(ctx, CPAL.furDD, hx + 1, 31, 5, 1);            // the knee
    // the webbed foot, flat on the ground with the toes forward. The far one
    // is shorter and set back, so the two do not merge into one wide slab.
    const fy = 38, fx = far ? hx - 4 : hx - 2, fw = far ? 11 : 13;
    px(ctx, CPAL.out, fx, fy, fw, 6);
    px(ctx, mid, fx + 1, fy + 1, fw - 2, 4);
    px(ctx, lit, fx + 1, fy + 1, fw - 4, 2);
    px(ctx, CPAL.furDD, fx + 1, fy + 4, fw - 2, 1);   // the sole, in its own shadow
    for (let i = 0; i < 4; i++) px(ctx, CPAL.out, fx + 4 + i * 2, fy + 1, 1, 3);
    for (let i = 0; i < 4; i++) px(ctx, toe, fx + 5 + i * 2, fy + 1, 1, 1);
  };
  hindLeg(11, true);                                  // the far one, a band back
  if (peg) {
    // ---- the PEG variant. The stump is strapped into a socket, the shank is
    //      a turned bit of somebody's boat and there is a brass ferrule on the
    //      end where it takes the deck.
    px(ctx, CPAL.out, 15, 29, 10, 5);
    px(ctx, CPAL.leaD, 16, 30, 8, 3); px(ctx, CPAL.lea, 16, 30, 8, 1);
    px(ctx, CPAL.creamD, 17, 32, 1, 1); px(ctx, CPAL.creamD, 22, 32, 1, 1);
    for (let i = 0; i < 9; i++) {
      const w = 6 - ((i * 4) / 9 | 0), x = 17 + (((i * 4) / 9 | 0) >> 1);
      px(ctx, CPAL.out, x, 33 + i, w, 1);
      px(ctx, CPAL.woodDD, x + 1, 33 + i, Math.max(1, w - 2), 1);
      px(ctx, CPAL.woodD, x + 1, 33 + i, Math.max(1, w - 3), 1);
      if (i < 4) px(ctx, CPAL.wood, x + 1, 33 + i, 1, 1);
    }
    px(ctx, CPAL.out, 17, 41, 5, 3);
    px(ctx, CPAL.goldD, 18, 42, 3, 1); px(ctx, CPAL.gold, 18, 42, 2, 1);
  } else {
    hindLeg(17, false);                               // the near one, in the light
  }
  // belt, buckle and the cutlass on his hip
  px(ctx, CPAL.leaD, 10, 22, 12, 5); px(ctx, CPAL.lea, 10, 22, 12, 3); px(ctx, CPAL.leaL, 10, 22, 12, 1);
  for (let x = 11; x < 22; x += 3) px(ctx, CPAL.creamD, x, 25);
  px(ctx, CPAL.out, 16, 21, 5, 7); px(ctx, CPAL.goldD, 17, 22, 3, 5);
  px(ctx, CPAL.gold, 17, 22, 2, 4); px(ctx, CPAL.goldL, 17, 22, 2, 1);
  // ---- the cutlass: a basket hilt at the belt and a curved blade behind his
  //      heel. It was a knife; a captain carries a sword.
  px(ctx, CPAL.out, 5, 20, 7, 6);
  px(ctx, CPAL.goldD, 6, 21, 5, 4); px(ctx, CPAL.gold, 6, 21, 4, 2); px(ctx, CPAL.goldL, 6, 21, 3, 1);
  px(ctx, CPAL.out, 8, 22, 2, 2);
  //      (Two art pixels further aft than it used to hang, so it clears the
  //      far leg instead of being drawn across it.)
  for (let i = 0; i < 14; i++) {
    const x = 5 - (i >> 3), y = 26 + i;
    px(ctx, CPAL.out, x, y, 4, 1);
    px(ctx, CPAL.metL, x + 1, y, 2, 1); px(ctx, CPAL.metLL, x + 1, y, 1, 1);
  }
  px(ctx, CPAL.out, 3, 40, 4, 2); px(ctx, CPAL.bloodD, 4, 40, 2, 1);
  return spriteFromHi(c, 16, 24);
}
// o: {x, y, scale, facing, exp, blink, t, rage, arms:[near,far], hold, tail, alpha}
function drawOtterStanding(ctx, o, t) {
  if (!CH.otterStand) return;
  ctx.save();
  { const p = _snapXY(ctx, o.x || 0, o.y || 0); ctx.translate(p[0], p[1]); }
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
  const stand = o.peg ? (CH.otterStandPegHi || CH.otterStandPeg || CH.otterStandHi)
                      : (CH.otterStandHi || CH.otterStand);
  ctx.drawImage(stand.c, -stand.ax, -stand.ay);
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
  { const p = _snapXY(ctx, o.x || 0, o.y || 0); ctx.translate(p[0], p[1]); }
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
  // Her unarmoured body is kept in two records for the same reason his head
  // is (see below): CH.manateeHi is the hi-res raster everything draws, and
  // CH.manatee is its one-art-pixel-per-world-unit bake. src/death.js reads
  // CH.manatee's canvas SIZE to work out where the gear went into her —
  // m.c.width * 0.56 - m.ax, in world units — and that only comes out on her
  // shoulder if the canvas it measures is square with the world grid.
  CH.manateeHi    = buildManateeBody(false);
  CH.manatee      = bake1x(CH.manateeHi);
  CH.manateeArmor = buildManateeBody(true);
  CH.manateeHurt  = tintFlat(CH.manateeArmor, '#ffffff', 0.85);
  CH.manateeHurtP = tintFlat(CH.manateeHi, '#ffffff', 0.85);
  // belly-up, for the moment she rolls over: the same body, drained of its
  // back and given a pale keel line, so no scene has to redraw her
  CH.manateeBelly = buildManateeBelly(CH.manateeHi);
  CH.manateeBellyA = buildManateeBelly(CH.manateeArmor);
  // the same bodies, cut at the peduncle so the rig can let the fluke lag
  CH.manPFluke = slice1(CH.manateeHi, 0, MAN_CUT_T);
  CH.manPFore  = slice1(CH.manateeHi, MAN_CUT_F, MAN_W);
  CH.manAFluke = slice1(CH.manateeArmor, 0, MAN_CUT_T);
  CH.manAFore  = slice1(CH.manateeArmor, MAN_CUT_F, MAN_W);
  CH.manPFlukeH = tintFlat(CH.manPFluke, '#ffffff', 0.85);
  CH.manPForeH  = tintFlat(CH.manPFore, '#ffffff', 0.85);
  CH.manAFlukeH = tintFlat(CH.manAFluke, '#ffffff', 0.85);
  CH.manAForeH  = tintFlat(CH.manAFore, '#ffffff', 0.85);
  CH.flipper      = buildFlipper();
  CH.saddle       = buildSaddle();
  CH.flags        = []; for (let i = 0; i < FLAG_N; i++) CH.flags.push(buildFlag(i));
  CH.otterTorso   = buildOtterTorso();
  // His head and his standing body are built hi-res and kept in TWO records:
  // the `...Hi` one is what gets drawn, and CH.otterHead / CH.otterStand are
  // one-art-pixel-per-world-unit bakes of exactly the same silhouette.
  // src/death.js cuts his hat off, builds his bare skull and bakes his rim
  // lights straight off those canvases in canvas pixels, and then places the
  // results with the record's WORLD anchors — which only closes if the
  // canvas it read is square with the world grid. Nothing else changes: the
  // two records carry the same w/h/ax/ay they always did.
  CH.otterHeadHi  = buildOtterHeadHi();
  CH.otterHead    = bake1x(CH.otterHeadHi);
  CH.otterArm     = buildOtterArm();
  CH.otterTail    = buildOtterTail();
  CH.cigar        = buildCigar();
  CH.otterRage    = tintFlat(CH.otterTorso, '#ff4a26', 0.4);
  CH.headRage     = tintFlat(CH.otterHeadHi, '#ff4a26', 0.35);
  // head canvas we redraw the face onto each frame (hi-res, like its source)
  CH.headBuf = newCanHi(CH.otterHead.w, CH.otterHead.h);
  CH.headBufCtx = CH.headBuf.getContext('2d');
  _headKey = '';
  // ---- the side-on set every cinematic shares ----------------------------
  CH.side = buildManateeSideSet();
  CH.otterStandHi = buildOtterStand(false);
  CH.otterStand = bake1x(CH.otterStandHi);
  // the peg-leg variant is still here, opt-in: CH.drawOtterStanding(ctx,
  // { peg: true }) draws it, and it carries the same record as the pair.
  CH.otterStandPegHi = buildOtterStand(true);
  CH.otterStandPeg = bake1x(CH.otterStandPegHi);
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
// The face is a few hundred fillRects, and it was being laid down again on
// every single frame even though it only has five things that can change:
// the expression, the blink, the rage tint, and — for the three expressions
// that flap — which half of the flap it is on. Key the buffer on exactly
// those and the head is free on the frames where none of them moved, which
// is most of them. (The buffer is copied out immediately by every caller
// that keeps one, so handing the same canvas back twice is safe.)
let _headKey = '';
function otterHeadWithFace(exp, blink, t, rage) {
  const e = exp || 'idle';
  const flap = e === 'talk' ? (Math.floor(t * 9) & 1)
    : (e === 'drown' || e === 'pain') ? (Math.floor(t * 4) & 1) : 0;
  const key = e + (blink ? 'B' : '') + (rage ? 'R' : '') + flap;
  if (key === _headKey) return CH.headBuf;
  _headKey = key;
  const ctx = CH.headBufCtx;
  ctx.clearRect(0, 0, CH.headBuf.width, CH.headBuf.height);
  drawRaw(ctx, (rage ? CH.headRage : CH.otterHeadHi).c, 0, 0);
  drawOtterFace(ctx, e, blink, t);
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
//
// WHERE THIS IS AND IS NOT USED (it was costing more than it bought):
// every call site already snaps its OWN position to this grid before it
// hands the rig an origin of (0,0) — src/entities.js and src/upgrades.js
// both do — so snapping again inside the rig could only ever quantise the
// part the rig adds on top, which is the swim heave. At rest that heave is
// 0.30 world units, six tenths of a screen pixel, and rounding a six-tenths
// sine gives a three-level staircase held for eight or ten frames at a time:
// the bob stopped being a bob and became a tick. The rig now adds its heave
// straight through, in the units the maths produced it in, and leaves the
// whole-pixel discipline to the caller that owns the position. Nothing is
// lost: the very next thing the rig does is rotate the body by the swim wag,
// which is never zero, so not one pixel of her was ever landing square on
// the grid anyway.
//
// It is still exactly right for the cinematic entry points further up, which
// are handed a raw world position and have to put it somewhere.
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
// Re-derived for the fine raster: the peduncle waist of the new keyed body
// sits at art x = 40 (world -15), so the pivot goes there and the two cuts
// straddle it with a TWELVE art pixel overlap — six world units, twelve
// screen pixels of closed join at every angle the fluke reaches.
const MAN_PIVX = 40;                    // peduncle pivot, art pixels
const MAN_CUT_F = 34;                   // forebody keeps art x >= this
const MAN_CUT_T = 46;                   // fluke keeps art x < this
const MAN_PIV = (MAN_PIVX - MAN_CX) / AS;   // pivot in world units, sprite-local
// The slice is cropped to its own ink, so the two halves together cost the
// same to blit as the one body they came from.
function slice1(src, x0, x1) {
  const W = src.c.width, H = src.c.height;
  const tmp = newCan(W, H), tg = tmp.getContext('2d');
  drawRaw(tg, src.c, 0, 0);
  const d = tg.getImageData(0, 0, W, H).data;
  let bx0 = x1, bx1 = x0, by0 = H, by1 = 0;
  for (let y = 0; y < H; y++) for (let x = x0; x < Math.min(x1, W); x++) {
    if (!d[(y * W + x) * 4 + 3]) continue;
    if (x < bx0) bx0 = x; if (x >= bx1) bx1 = x + 1;
    if (y < by0) by0 = y; if (y >= by1) by1 = y + 1;
  }
  if (bx1 <= bx0) { bx0 = x0; bx1 = x0 + 1; by0 = 0; by1 = 1; }
  const c = newCan(bx1 - bx0, by1 - by0), g = c.getContext('2d');
  drawRaw(g, tmp, -bx0, -by0);
  return spriteFromHi(c, MAN_CX - bx0, MAN_CY - by0);
}

// ===========================================================================
//  RIG — draws the manatee + otter as one animated creature
//  state: {aim, facing, tilt, swimPhase, rollPhase|null, hurt, exp, rage,
//          recoil, flash, speed, armored, t}
//  Nothing in that state is used raw: `_advance` eases every channel first,
//  so a step input becomes a move with a beginning, a middle and an end.
// ===========================================================================
// The rider group's scale on her back. Everything he is made of is authored
// at the size he STANDS at (src/death.js and the cinematics place his joints
// in those units, and they are not ours to move), so the one place he is a
// passenger is the one place he is scaled.
const RIDER = 0.78;
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
  _warn: 0,                   // how near a mirror is, read off the heading
  _pinch: 1, _oPinch: 1,      // the widths those flips are drawn at, eased
  _gunRoll: 1,                // the gun rolling over as the aim crosses vertical
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
    this._warn = 0; this._pinch = 1; this._oPinch = 1; this._gunRoll = 1;
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
    // The pinch that sells the mirror as a pivot used to be applied RAW, and
    // `_flip` is zero on the very frame the facing changes: she went from her
    // full width to half of it between two frames and then eased back out.
    // Measured, that was a 37% drop in her rendered width in one frame — the
    // single hardest pop in the rig. Two things fix it. First, entities.js
    // already hands us an unclamped `heading`, and the facing is flipped off
    // the SIGN of its cosine, so |cos(heading)| falling toward zero is the
    // warning that a mirror is coming: lean into the pinch BEFORE the swap,
    // which is what turning through edge-on actually looks like. Second, the
    // pinch itself is low-passed, so even with no heading to read (the menu,
    // the skill tree) it can never step more than a frame's worth.
    const hd = s.heading;
    const warn = (hd === null || hd === undefined) ? 0 : clamp(1 - Math.abs(Math.cos(hd)) / 0.50, 0, 1);
    this._warn = _lp(this._warn, warn, 0.06, dt);
    this._pinch = _lp(this._pinch, Math.min(0.50 + 0.50 * _eo(this._flip), 1 - 0.34 * this._warn), 0.042, dt);

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
    // 22ms is one and a third frames: the head was, in practice, wearing the
    // raw input. That is fine while the mouse is sliding and awful the frame
    // the auto-target picks a different boat, which moves `s.aim` by up to a
    // whole turn in one step. 48ms still leads the torso spring below it —
    // the chain the comment promises is intact — and a target switch now
    // takes about eight frames to travel instead of one.
    this._headAim = _lpA(this._headAim, s.aim || 0, 0.048, dt);
    // firing snaps the muzzle onto the true line — the lag is a pose, not a lie
    this._gunAim = _lpA(this._gunAim, this._aim.x, s.flash > 0 ? 0.004 : 0.05, dt);
    // which way the otter faces, eased the same way she is
    const aimL = facing === 1 ? this._aim.x : Math.PI - this._aim.x;
    const wr = Math.cos(aimL) >= 0 ? 1 : -1;
    if (wr !== this._oface) { this._oface = wr; this._oflip = 0; }
    this._oflip = Math.min(1, this._oflip + dt / 0.13);
    this._oPinch = _lp(this._oPinch, 0.45 + 0.55 * _eo(this._oflip), 0.038, dt);

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
    //      0.40 overshoots by a quarter and rings for three cycles, and this
    //      one channel drives the heave, the surge, the squash AND the rider,
    //      so the ring was showing up in five places at once. 0.55 keeps the
    //      recoil and loses the wobble after it.
    _spr(this._kick, 0, 3.2, 0.55, dt);

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
    //      Twice the frames, so twice the rate for the same flutter, and the
    //      phase is kept inside one lap instead of growing without bound (a
    //      float that has been running for an hour resolves worse than one
    //      that has not, and the modulo is where the cycle WRAPS).
    this._flagPh = (this._flagPh + dt * (13 + Math.min(22, this._spd / 8.5))) % FLAG_N;
    return dt;
  },

  draw(ctx, x, y, s) {
    const dt = this._advance(s);
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
    ctx.translate(x, y + heave);

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

    // The facing flip is the one place a 2D rig always snaps. She is pinched
    // toward edge-on across it and widens back out, so the mirror reads as a
    // pivot with a yaw unwinding behind it. The pinch itself is eased and
    // anticipated up in _advance — read the note there before changing it.
    const fu = this._flip;
    const pinch = this._pinch;
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
      const body = s.hurt ? (arm ? CH.manateeHurt : CH.manateeHurtP) : (arm ? CH.manateeArmor : CH.manateeHi);
      ctx.drawImage(body.c, -body.ax, -body.ay);
    }

    // ---- rider (hidden while belly-up mid-roll, or before he boards)
    if (!belly && !s.riderHidden && riderFade > 0.01) {
      if (riderFade < 1) ctx.globalAlpha = a0 * riderFade;
      // saddle. The rider group is drawn a little under her own scale: an
      // otter riding a manatee is about a quarter of her length, and at 1:1
      // he covers the back she is wearing armour on.
      ctx.save(); ctx.translate(9, 0); ctx.scale(RIDER, RIDER);
      ctx.drawImage(CH.saddle.c, -CH.saddle.ax, -CH.saddle.ay); ctx.restore();
      // flag whipping behind — the pole lags her yaw, so it cracks on a turn
      const flag = CH.flags[Math.floor(this._flagPh) % CH.flags.length];
      // A flipbook is a staircase: at rest the cloth used to be the ONLY thing
      // on her that moved, and it moved 6.5 times a second while the screen
      // moved 60. The frames carry the shape of the wave; this carries the
      // travel, continuously, off the same phase — so between two frames the
      // flag is still going somewhere.
      const fsw = (this._flagPh / FLAG_N) * TAU;
      const poleLag = clamp((this._tilt.x - this._tiltSlow) * 2.2, -0.34, 0.34);
      // The pole is tall enough to carry the flag clear of her back: over the
      // body it would only hide the armour it is flying above.
      ctx.save(); ctx.translate(-16, 4);
      ctx.rotate(-0.13 + poleLag + this._fluke.x * 0.18 + Math.sin(fsw * 0.5) * 0.022);
      // the pole itself is drawn on the ART grid, so it is a crisp two-art-
      // pixel spar with a lit side rather than a slab two world units wide
      ctx.save(); ctx.scale(1 / AS, 1 / AS);
      px(ctx, CPAL.out, -2, -50, 4, 54);
      px(ctx, CPAL.woodDD, -1, -49, 2, 52); px(ctx, CPAL.woodD, -1, -49, 1, 52);
      px(ctx, CPAL.wood, -1, -49, 1, 8);
      ctx.restore();
      // pivot at the foot of the hoist, so the fly end is what sweeps: a
      // rotation about the middle of the cloth moves the top corner by almost
      // nothing, which is exactly the corner the eye is watching
      ctx.save();
      ctx.translate(0, -11); ctx.rotate(Math.sin(fsw) * 0.075);
      ctx.drawImage(flag.c, -flag.ax, -flag.ay - 9);
      ctx.restore();
      ctx.restore();

      // The otter rides over the shoulders, sized like a passenger, and he is
      // always a beat behind her: his bob trails her heave and he pitches
      // fore and aft with whatever she just did to him.
      const bob = -Math.cos(ph + 0.55 - 0.85) * drive * 0.9;
      ctx.save();
      ctx.translate(9, -2 + bob + this._kick.x * 0.5);
      ctx.scale(RIDER, RIDER);
      ctx.rotate(this._lean.x + this._sway.x * 0.5);

      // aim in the manatee's flipped local space, one flavour per body part
      const aimL = facing === 1 ? this._aim.x : Math.PI - this._aim.x;
      const aimH = facing === 1 ? this._headAim : Math.PI - this._headAim;
      const aimG = facing === 1 ? this._gunAim : Math.PI - this._gunAim;
      // the otter twists his whole upper body toward the aim
      const twist = clamp(angleDiff(0, aimL), -1.1, 1.1) * 0.30;
      const faceRight = this._oface;
      const oPinch = this._oPinch;

      // tail curls out behind him, trailing the lean and the sway
      ctx.save(); ctx.translate(-9, 5);
      ctx.rotate(2.95 + _stroke(ph - 1.4, 0.4) * 0.16 - this._lean.x * 0.7 - this._sway.x);
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
        // The gun is kept grip-down by mirroring it in Y once the aim passes
        // vertical, and that mirror used to happen between two frames: sight,
        // grip and hammer all jumped to the other side at once. Roll it over
        // instead — ease the sign through zero and hold it just off the
        // degenerate scale, so the weapon turns over in his paws the way a
        // real one would. Scoped to the gun and its flash; the paws stay put.
        this._gunRoll = _lp(this._gunRoll, Math.cos(localAim) < 0 ? -1 : 1, 0.05, dt);
        const r0 = this._gunRoll;
        ctx.scale(1, Math.abs(r0) < 0.04 ? (r0 < 0 ? -0.04 : 0.04) : r0);
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
//  pixels per world unit (they are the machinery the animal is thrown
//  against, and at this size they can carry real naval architecture).
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
// ---------------------------------------------------------------------------
//  HOW BIG THE FLEET IS.  The twelve hulls in `defs` below carry len/beam in
//  WORLD units and every one of them has been DOUBLED from what it was, so
//  the fleet towers over the animal instead of being outgrown by her. The
//  frame derivation is untouched — the canvas is still (len + 4) x
//  (beam * 2 + 6) world units with the hull from X0 = 2*AS — so everything
//  that paints into a finished hull keeps its coordinates.
//
//  The ten hulls registered from src/entities.js scale themselves: that file
//  measures the growth of these twelve off the BUILT sprites and applies the
//  same factor to its own definitions before calling in here, and derives
//  every collision radius from the hull it belongs to. So the multiplier
//  must live in this table and NOT inside buildBoat, or it would be applied
//  twice to those ten.
// ---------------------------------------------------------------------------
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
  const BOOT = o.boot || '#5b2a2c';            // boot-top, at the waterline
  const ANTI = o.anti || '#261519';            // antifouling below it
  const R = Math.round;

  // ---- hull form. Which class of boat this is, read off her proportions
  //      unless the definition says otherwise.
  const ratio = o.beam / o.len;
  const bow = o.bow || (o.gear === 'turret' ? 'ram' : ratio > 0.26 ? 'bluff' : ratio < 0.20 ? 'fine' : 'spoon');
  const sternW = o.stern !== undefined ? o.stern : (ratio > 0.24 ? 0.94 : 0.64);
  const bmax = o.bmax || (bow === 'bluff' ? 0.46 : 0.38);
  // steel or wood decides the topside treatment: plating and welds, or planks
  const steel = o.steel !== undefined ? o.steel : !!(o.gear === 'turret' || o.cabin && o.beam >= 16);
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
  // the deck edge, inboard of the sheer by however far the topsides flare
  const flare = Math.max(2, R(B * 0.13));
  const freeb = Math.max(1, R(B * 0.07));         // freeboard: cap rail width
  const deckHalf = x => hwAt[x] - flare - freeb;

  // ---- topsides, painted as rings in from the sheer: antifouling at the
  //      waterline, the boot-top over it, the painted topside above that and
  //      the cap rail along the deck edge. The flare is what makes a hull
  //      read as a hull from above instead of a flat lozenge.
  const stripe = o.stripe || null;
  for (let x = X0; x <= L + X0 - 1; x++) {
    const hw = hwAt[x]; if (hw < 1.2) continue;
    const y0 = R(cy - hw), y1 = R(cy + hw);
    for (let y = y0; y <= y1; y++) {
      const n = Math.min(y - y0, y1 - y);          // distance in from the sheer
      const port = y < cy;
      let col;
      if (y === y0 || y === y1 || x === X0 || x > L + X0 - 2) col = CPAL.out;
      else if (n === 1) col = ANTI;
      else if (n === 2 && flare >= 4) col = BOOT;
      else if (n < flare) col = port ? hull : hullD;
      else if (n === flare) col = stripe || (port ? hullL : hullDD);
      else if (n < flare + freeb) col = port ? hullL : hullD;
      else if (n === flare + freeb) col = port ? CPAL.out2 : CPAL.out;   // cap rail shadow
      else col = hullD;
      px(ctx, col, x, y);
    }
    // plating seams on the steel boats, planking on the wooden ones: both
    // follow the hull, so they crowd together toward the bow the way the
    // real thing does
    if (steel) {
      if (((x - X0) % Math.max(7, R(L / 14))) === 0) {
        for (let n = 1; n < flare; n++) { px(ctx, hullDD, x, R(cy - hw) + n); px(ctx, hullDD, x, R(cy + hw) - n); }
        px(ctx, hullL, x + 1, R(cy - hw) + 1, 1, Math.max(1, flare - 1));
      }
    } else {
      for (const k of [0.46, 0.68, 0.86]) {
        const dy = R(hw * k);
        if (dy > 2) { px(ctx, hullDD, x, cy - dy); px(ctx, hullDD, x, cy + dy); }
      }
    }
  }
  // ---- draught marks at the bow and the stern, on the boot-top
  for (const mx of [X0 + R(L * 0.06), X0 + R(L * 0.93)]) {
    const hw = hwAt[mx]; if (hw < 5) continue;
    for (let i = 0; i < 4; i++) {
      const y = R(cy - hw) + 1 + i * 2;
      if (!solid(mx, y)) continue;
      px(ctx, CPAL.white, mx, y, 1 + (i & 1), 1);
    }
  }
  // ---- wear: rust weeping aft from the fastenings, a patched plate, grime
  for (let x = X0 + 6; x < L + X0 - 6; x += Math.max(7, R(L / 12))) {
    const hw = hwAt[x]; if (hw < 6) continue;
    if (hash2(x * 3, 7) > 0.40) {
      const len = 2 + Math.floor(hash2(x, 11) * (flare + 2));
      for (let i = 0; i < len; i++) {
        px(ctx, i ? RUST : RUSTL, x, R(cy - hw) + 2 + i);
        if (hash2(x, 19) > 0.55) px(ctx, i ? RUST : RUSTL, x + 1, R(cy + hw) - 2 - i);
      }
    }
  }
  {
    const pxx = R(X0 + L * (0.34 + hash2(L, B) * 0.3)), pw = Math.max(6, R(L * 0.07));
    const hw = hwAt[pxx];
    if (hw > 7) {
      const py = R(cy - hw) + 3;
      for (let y = py; y < py + Math.max(3, flare - 1); y++) for (let x = pxx; x < pxx + pw; x++) if (solid(x, y)) px(ctx, hullDD, x, y);
      for (let x = pxx; x < pxx + pw; x += 2) { px(ctx, hullL, x, py); px(ctx, GRIME, x, py + Math.max(2, flare - 2)); }
    }
  }

  // ---- open deck well: fore-and-aft planking, a king plank, deck beams and
  //      a dark margin where the deck meets the bulwark
  const wellA = R(X0 + L * 0.11), wellB = R(X0 + L * (o.cabin ? 0.80 : 0.86));
  const beamSp = Math.max(6, R(L / 16));
  for (let x = wellA; x <= wellB; x++) {
    const hw = deckHalf(x) - 1; if (hw < 1.5) continue;
    const y0 = R(cy - hw), y1 = R(cy + hw);
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1 || x === wellA || x === wellB) { px(ctx, CPAL.out2, x, y); continue; }
      const k = Math.abs(y - cy) / Math.max(1, hw);
      // deck camber: the crown of the deck catches the light, the waterways
      // at the margins sit in shadow
      let col = k < 0.30 ? deck : k < 0.72 ? deckD : GRIME;
      if (((y - cy) % 4) === 0) col = deckD;                    // seams
      if (y === cy) col = k < 0.3 ? deck : deckD;               // king plank
      if (y === cy - 1) col = deck;
      if (((x - wellA) % beamSp) === 0) col = deckD;            // deck beam
      if (hash2(x * 5, y * 3) > 0.955) col = deckD;             // worn tread
      px(ctx, col, x, y);
    }
    // the bulwark's inner face, lit to port and dark to starboard
    px(ctx, hullL, x, y0 - 1); px(ctx, hullDD, x, y1 + 1);
  }
  // ---- thwarts (bench seats) across the well, with a worn top edge
  for (const f of (o.thwarts || [0.34, 0.62])) {
    const x = R(X0 + L * f), hw = deckHalf(x); if (hw < 1.5) continue;
    const ya = R(cy - hw), yb = R(cy + hw), tw = Math.max(2, R(L * 0.016));
    for (let y = ya; y <= yb; y++) { px(ctx, hullL, x, y, tw, 1); px(ctx, hullD, x + tw, y, 1, 1); }
    px(ctx, CPAL.out2, x + tw + 1, ya, 1, yb - ya + 1);
    px(ctx, CPAL.out2, x - 1, ya, 1, yb - ya + 1);
  }

  // ---- transom, outboard motor and skeg at the stern
  if (o.motor && !o.cabin) {
    const mx = X0 - 2, my = cy;
    // the transom board itself, with a name plate screwed to it
    for (let y = R(cy - hwAt[X0 + 1]) + 1; y < R(cy + hwAt[X0 + 1]); y++) { px(ctx, hullDD, X0 + 1, y); px(ctx, hullD, X0 + 2, y); }
    const mw = Math.max(8, R(B * 0.42)), mh = Math.max(8, R(B * 0.5));
    for (let y = my - (mh >> 1); y <= my + (mh >> 1); y++) for (let x = mx; x < mx + mw; x++) {
      const e = y === my - (mh >> 1) || y === my + (mh >> 1) || x === mx || x === mx + mw - 1;
      px(ctx, e ? CPAL.out : (y < my - mh * 0.15 ? CPAL.metD : y > my + mh * 0.15 ? CPAL.metDD : CPAL.met), x, y);
    }
    px(ctx, CPAL.metLL, mx + 2, my - (mh >> 1) + 1, Math.max(2, mw - 5), 1);   // cowling highlight
    px(ctx, CPAL.out, mx + mw, my - 1, 4, 3);                                  // leg into the well
    px(ctx, CPAL.metD, mx + mw, my, 3, 1);
    px(ctx, RUST, mx + 1, my + (mh >> 1) - 2, 3, 1);                           // rust at the clamp
    // tiller arm, swung out to port
    px(ctx, CPAL.out, mx + 3, my - (mh >> 1) - 4, Math.max(6, mw - 2), 3);
    px(ctx, CPAL.metL, mx + 3, my - (mh >> 1) - 4, Math.max(5, mw - 3), 1);
  } else {
    // a ship's stern: a transom board, the rudder stock and a quadrant, and
    // an exhaust riser with soot on the lip. An outboard clamped to a hull
    // this size would only read as a toy.
    for (let y = R(cy - hwAt[X0 + 1]) + 1; y < R(cy + hwAt[X0 + 1]); y++) { px(ctx, hullDD, X0 + 1, y); px(ctx, hullD, X0 + 2, y); }
    px(ctx, CPAL.out, X0 - 2, cy - 4, 5, 9);
    px(ctx, CPAL.metD, X0 - 1, cy - 3, 3, 7);
    px(ctx, CPAL.metL, X0 - 1, cy - 3, 3, 2);
    px(ctx, CPAL.metDD, X0 - 1, cy + 2, 3, 2);
    const qy = cy - R(B * 0.34);
    px(ctx, CPAL.out, X0 + 4, qy, 7, 6);
    px(ctx, CPAL.met, X0 + 5, qy + 1, 5, 4);
    px(ctx, CPAL.metL, X0 + 5, qy + 1, 5, 1);
    px(ctx, GRIME, X0 + 5, qy + R(B * 0.68), 6, 4);
    px(ctx, '#0d0f12', X0 + 6, qy + R(B * 0.68) + 1, 4, 2);
  }

  // ---- deck furniture: the fittings a working boat cannot do without ------
  const fwdX = R(X0 + L * 0.90), aftX = R(X0 + L * 0.08);
  const bollard = (bx, by) => {
    px(ctx, CPAL.out, bx - 1, by - 3, 5, 7);
    px(ctx, CPAL.metD, bx, by - 2, 3, 5);
    px(ctx, CPAL.metL, bx, by - 2, 3, 2);
    px(ctx, CPAL.metDD, bx, by + 2, 3, 1);
    px(ctx, CPAL.metLL, bx, by - 2, 1, 1);
  };
  for (const bx of [fwdX, aftX + 3]) if (hwAt[bx] > 4) bollard(bx, cy);
  // side bitts, on the beamy ones where there is a bulwark to put them on
  if (B > 12) for (const f of [0.3, 0.55, 0.74]) {
    const bx = R(X0 + L * f), hw = deckHalf(bx); if (hw < 5) continue;
    for (const sgn of [-1, 1]) {
      const by = R(cy + sgn * hw);
      px(ctx, CPAL.out, bx, by - 1, 3, 3); px(ctx, CPAL.metL, bx, by, 2, 1);
    }
  }
  // a hatch with a raised coaming and a lifting handle
  {
    const hx = R(X0 + L * 0.66), hh = Math.max(6, R(B * 0.52)), hwid = Math.max(6, R(L * 0.075));
    const hy = cy - (hh >> 1);
    if (deckHalf(hx) > hh * 0.6) {
      for (let y = hy; y < hy + hh; y++) for (let x = hx; x < hx + hwid; x++) {
        const e = y === hy || y === hy + hh - 1 || x === hx || x === hx + hwid - 1;
        px(ctx, e ? CPAL.out2 : (y < hy + hh * 0.4 ? hullL : hull), x, y);
      }
      for (let x = hx + 1; x < hx + hwid - 1; x += 3) px(ctx, hullDD, x, hy + 1);
      px(ctx, CPAL.metL, hx + (hwid >> 1) - 1, hy + (hh >> 1), 3, 1);
      px(ctx, GRIME, hx + 1, hy + hh - 2, hwid - 2, 1);
    }
  }
  // a fish hold with its boards off, forward of the house
  if (o.beam >= 14) {
    const hx = R(X0 + L * 0.5), hh = Math.max(7, R(B * 0.7)), hwid = Math.max(7, R(L * 0.09));
    const hy = cy - (hh >> 1);
    if (deckHalf(hx) > hh * 0.62) {
      px(ctx, CPAL.out2, hx - 1, hy - 1, hwid + 2, hh + 2);
      for (let y = hy; y < hy + hh; y++) for (let x = hx; x < hx + hwid; x++)
        px(ctx, ((x - hx) % 4 === 0) ? '#101820' : (y < hy + 2 ? '#25313c' : '#16202a'), x, y);
      for (let i = 0; i < 3; i++) px(ctx, '#7d8b96', hx + 1 + i * 3, hy + hh - 3, 2, 2);   // ice
    }
  }
  // fuel drums lashed to the deck, and a bucket beside them
  {
    const dx = R(X0 + L * 0.20), dy = cy - R(B * 0.46), dr = Math.max(3, R(B * 0.17));
    if (deckHalf(dx) > dr * 2) {
      for (let i = 0; i < 2; i++) {
        const ox = dx + i * (dr * 2 + 2);
        for (let y = dy; y < dy + dr * 2; y++) for (let x = ox; x < ox + dr * 2; x++) {
          const d = Math.hypot(x - ox - dr + 0.5, y - dy - dr + 0.5);
          if (d > dr) continue;
          px(ctx, d > dr - 1 ? CPAL.out : d > dr - 2.2 ? CPAL.metD : d > dr * 0.45 ? CPAL.met : CPAL.metL, x, y);
        }
        px(ctx, RUST, ox + 1, dy + dr, 2, 1);
        px(ctx, CPAL.metLL, ox + dr - 1, dy + 1, 1, 1);
      }
      px(ctx, CPAL.out, dx + dr * 4 + 4, dy + 1, 4, 4); px(ctx, CPAL.metL, dx + dr * 4 + 5, dy + 2, 2, 2);
    }
  }
  // a liferaft canister, and a life ring lashed to the rail
  {
    const rx = R(X0 + L * 0.42), ry = R(cy - deckHalf(rx)) + 1;
    if (deckHalf(rx) > 6) {
      px(ctx, CPAL.out, rx, ry, 7, 4); px(ctx, CPAL.white, rx + 1, ry + 1, 5, 2); px(ctx, '#d8763a', rx + 1, ry + 1, 5, 1);
      const lx = R(X0 + L * 0.34), ly = R(cy + deckHalf(lx)) - 4;
      px(ctx, CPAL.white, lx + 1, ly, 3, 1); px(ctx, CPAL.white, lx + 1, ly + 4, 3, 1);
      px(ctx, CPAL.blood, lx, ly + 1, 1, 3); px(ctx, CPAL.blood, lx + 4, ly + 1, 1, 3);
      px(ctx, CPAL.out2, lx, ly, 1, 1); px(ctx, CPAL.out2, lx + 4, ly, 1, 1);
    }
  }
  // fenders (old tyres) hung over the side on the beamy working boats
  if (o.fenders || ratio > 0.25) {
    for (let i = 0; i < 4; i++) {
      const fx = R(X0 + L * (0.24 + i * 0.15));
      const hw = hwAt[fx]; if (hw < 5) continue;
      for (const sgn of [-1, 1]) {
        const fy = R(cy + sgn * hw) - sgn * 2;
        px(ctx, CPAL.out, fx, fy - 2, 6, 5);
        px(ctx, GRIME, fx + 1, fy - 1, 4, 3);
        px(ctx, '#494f58', fx + 2, fy, 2, 1);
      }
    }
  }

  // ---- wheelhouse / cabin -------------------------------------------------
  if (o.cabin) {
    // The wheelhouse is painted, not bare steel: weathered white unless the
    // definition says otherwise, which is what tells two grey boats apart.
    const hs = o.house || '#cfcabd', hsL = o.houseL || '#ece8dd', hsD = o.houseD || '#8e8a80', hsDD = o.houseDD || '#5d5a53';
    const cw = R(L * 0.20), ch = R(B * 1.2);
    const cx0 = R(X0 + L * o.cabin), cy0 = R(cy - ch / 2);
    // the shadow the house throws aft across the deck
    for (let y = cy0 + 2; y < cy0 + ch + 2; y++) for (let x = cx0 - 3; x < cx0; x++) if (solid(x, y)) px(ctx, GRIME, x, y);
    for (let y = cy0; y < cy0 + ch; y++) for (let x = cx0; x < cx0 + cw; x++) {
      const e = y === cy0 || y === cy0 + ch - 1 || x === cx0 || x === cx0 + cw - 1;
      let col = e ? CPAL.out : (y < cy0 + 4 ? hsL : y > cy0 + ch - 5 ? hsDD : hs);
      if (!e && ((x - cx0) % 6) === 0) col = hsD;         // roof panel seams
      if (!e && hash2(x * 7, y * 5) > 0.965) col = hsD;   // weathering
      px(ctx, col, x, y);
    }
    px(ctx, hsL, cx0 + 1, cy0 + 1, cw - 2, 1);           // roof rail, port
    px(ctx, CPAL.out2, cx0 + 1, cy0 + ch - 2, cw - 2, 1);
    // handrails round the roof, and a monkey island abaft the mast
    for (let x = cx0 + 2; x < cx0 + cw - 2; x += 3) { px(ctx, CPAL.out2, x, cy0 + 3); px(ctx, CPAL.out2, x, cy0 + ch - 4); }
    for (let y = cy0 + 4; y < cy0 + ch - 4; y += 3) px(ctx, CPAL.out2, cx0 + 3, y);
    px(ctx, CPAL.out, cx0 + R(cw * 0.34), cy0 + R(ch * 0.30), R(cw * 0.34), R(ch * 0.40));
    px(ctx, hsD, cx0 + R(cw * 0.34) + 1, cy0 + R(ch * 0.30) + 1, R(cw * 0.34) - 2, R(ch * 0.40) - 2);
    px(ctx, hs, cx0 + R(cw * 0.34) + 1, cy0 + R(ch * 0.30) + 1, R(cw * 0.34) - 2, 2);
    for (let x = cx0 + 2; x < cx0 + cw - 2; x += 7) px(ctx, RUST, x, cy0 + ch - 3, 1, 2);
    // the wheelhouse windows, lit from inside, with mullions between them
    const nwin = Math.max(3, Math.floor(ch / 6));
    for (let i = 0; i < nwin; i++) {
      const wy = cy0 + 3 + R(i * (ch - 6) / nwin);
      if (wy > cy0 + ch - 5) break;
      px(ctx, CPAL.out, cx0 + cw - 7, wy, 6, 3);
      px(ctx, CPAL.goldL, cx0 + cw - 6, wy, 4, 1);
      px(ctx, CPAL.gold, cx0 + cw - 6, wy + 1, 4, 1);
      px(ctx, '#7a5a1e', cx0 + cw - 6, wy + 2, 4, 1);
    }
    // the door in the aft face, and a ladder to the roof beside it
    px(ctx, CPAL.out, cx0 + 1, cy0 + R(ch / 2) - 3, 3, 6);
    px(ctx, hsD, cx0 + 1, cy0 + R(ch / 2) - 2, 2, 4);
    for (let i = 0; i < 3; i++) px(ctx, CPAL.metL, cx0 + 2, cy0 + 3 + i * 2, 3, 1);
    // a stack with soot on the lip, a radar dome and a searchlight
    px(ctx, CPAL.out, cx0 + 3, cy0 + 2, 5, 5);
    px(ctx, CPAL.metD, cx0 + 4, cy0 + 3, 3, 3);
    px(ctx, GRIME, cx0 + 4, cy0 + 3, 3, 1);
    px(ctx, '#0d0f12', cx0 + 5, cy0 + 4, 1, 1);
    const rx = cx0 + cw - 6;
    px(ctx, CPAL.out, rx, cy0 + R(ch / 2) - 2, 5, 5);
    px(ctx, CPAL.metL, rx + 1, cy0 + R(ch / 2) - 1, 3, 3);
    px(ctx, CPAL.white, rx + 2, cy0 + R(ch / 2));
    px(ctx, CPAL.out, cx0 + cw - 4, cy0 + 2, 3, 3); px(ctx, '#ffe9b0', cx0 + cw - 3, cy0 + 3);
    // aerials whipping aft off the roof
    for (let i = 0; i < Math.max(6, R(L * 0.09)); i++) px(ctx, CPAL.metDD, cx0 - 1 - i, cy0 + 3 - (i >> 1));
    for (let i = 0; i < Math.max(5, R(L * 0.07)); i++) px(ctx, CPAL.metDD, cx0 - 1 - i, cy0 + ch - 4 + (i >> 1));
  } else {
    // open boat: a helm console, a wheel and a seat for whoever is driving
    const sx = R(X0 + L * 0.56), sw = Math.max(4, R(L * 0.05)), sh = Math.max(6, R(B * 0.55));
    if (deckHalf(sx) > sh * 0.55) {
      px(ctx, CPAL.out, sx, cy - (sh >> 1), sw, sh);
      px(ctx, CPAL.metD, sx + 1, cy - (sh >> 1) + 1, sw - 2, sh - 2);
      px(ctx, CPAL.metL, sx + 1, cy - (sh >> 1) + 1, sw - 2, 2);
      px(ctx, '#1d2733', sx + 2, cy - 2, sw - 3, 4);        // the instrument face
      px(ctx, CPAL.out, sx + sw, cy - 2, 2, 5);             // the wheel, edge-on
      px(ctx, hullL, sx - 6, cy - 3, 5, 7);                 // the seat
      px(ctx, hullD, sx - 6, cy + 1, 5, 3);
      px(ctx, CPAL.out2, sx - 7, cy - 3, 1, 7);
    }
  }

  // ---- crew: two or three of them, seen from straight above — a head, a
  //      pair of shoulders and a shadow. Nothing in a boat this size reads
  //      as crewed without them.
  {
    const spots = [[0.30, -0.45], [0.46, 0.5], [0.70, 0.1]];
    const skin = ['#c98d5e', '#8e5c37', '#e0b07c'];
    for (let i = 0; i < (o.beam >= 14 ? 3 : o.beam >= 9 ? 2 : 1); i++) {
      const [f, k] = spots[i];
      const hx = R(X0 + L * f), hy = R(cy + deckHalf(hx) * k);
      if (deckHalf(hx) < 5 || !solid(hx, hy)) continue;
      px(ctx, CPAL.out2, hx - 1, hy + 2, 5, 2);                      // his shadow
      px(ctx, CPAL.out, hx - 2, hy - 1, 6, 4);                       // shoulders
      px(ctx, i === 1 ? '#c4c0b2' : i === 2 ? '#3f5a72' : '#6b6f4a', hx - 1, hy, 4, 2);
      px(ctx, CPAL.out, hx, hy - 2, 3, 4);                           // the head
      px(ctx, skin[i], hx, hy - 1, 2, 2);
      px(ctx, i === 0 ? '#b8562c' : '#2a2f38', hx, hy - 2, 3, 1);    // his cap
    }
  }

  // ---- role-specific gear -------------------------------------------------
  if (o.gear === 'net') {
    const nx0 = wellA + Math.max(4, R(L * 0.03)), nx1 = wellA + R(L * 0.30);
    const nh = R(B * 0.55);
    for (let x = nx0; x < nx1; x++)
      for (let y = cy - nh; y < cy + nh; y++) {
        if (!solid(x, y)) continue;
        if (((x + y) & 3) === 0) px(ctx, CPAL.creamD, x, y);
        else if (((x - y + 64) & 3) === 0) px(ctx, '#8e8a72', x, y);
        else if (((x + y) & 7) === 4) px(ctx, '#5d5b4c', x, y);
      }
    px(ctx, CPAL.out2, nx0 - 2, cy - nh, 2, nh * 2);
    for (let y = cy - nh; y < cy + nh; y += 7) px(ctx, CPAL.ember, nx1, y, 2, 3);       // floats
    // the net drum it pays off, and the gallows frame over the stern
    const dx = nx0 - Math.max(6, R(L * 0.05));
    for (let y = cy - R(B * 0.62); y <= cy + R(B * 0.62); y++) {
      if (!solid(dx, y)) continue;
      px(ctx, CPAL.out, dx, y, Math.max(5, R(L * 0.04)), 1);
      px(ctx, ((y & 3) === 0) ? CPAL.metD : CPAL.met, dx + 1, y, Math.max(3, R(L * 0.04) - 2), 1);
    }
    px(ctx, CPAL.metLL, dx + 1, cy - R(B * 0.62), Math.max(3, R(L * 0.04) - 2), 1);
    // gallows: two posts and a head beam, right aft
    for (const sgn of [-1, 1]) px(ctx, CPAL.out, dx - 4, cy + sgn * R(B * 0.55) - 2, 4, 5);
    px(ctx, CPAL.metD, dx - 3, cy - R(B * 0.55), 2, R(B * 1.1));
  } else if (o.gear === 'harpoon') {
    const hx = R(X0 + L * 0.60), len = R(L * 0.34), gh = Math.max(9, R(B * 0.8));
    px(ctx, CPAL.metDD, hx, cy - 3, len, 7);
    px(ctx, CPAL.metL, hx, cy - 2, len, 2);
    px(ctx, CPAL.metLL, hx + len - 9, cy - 2, 9, 1);
    px(ctx, CPAL.out, hx + len, cy - 2, 3, 5);
    px(ctx, CPAL.out, hx - 5, cy - (gh >> 1), 9, gh);              // mount
    px(ctx, CPAL.met, hx - 4, cy - (gh >> 1) + 1, 7, gh - 2);
    px(ctx, CPAL.metL, hx - 4, cy - (gh >> 1) + 1, 7, 3);
    for (let i = 0; i < 4; i++) px(ctx, CPAL.metDD, hx - 4, cy - 3 + i * 3, 7, 1);
    // the line tub and a rack of spare irons behind the gun
    const tw = Math.max(9, R(L * 0.08));
    px(ctx, CPAL.out, hx - tw - 8, cy + 3, tw, Math.max(7, R(B * 0.4)));
    px(ctx, CPAL.woodL, hx - tw - 7, cy + 4, tw - 2, Math.max(5, R(B * 0.4) - 2));
    for (let i = 0; i < 4; i++) px(ctx, CPAL.creamD, hx - tw - 7, cy + 4 + i * 2, tw - 2, 1);
    for (let i = 0; i < 4; i++) px(ctx, CPAL.metL, hx - tw - 12, cy - 8 + i * 3, R(L * 0.12), 1);
  } else if (o.gear === 'dyna') {
    const bx = R(X0 + L * 0.28), bw = Math.max(12, R(L * 0.12)), bh = Math.max(9, R(B * 0.6));
    for (let y = cy - (bh >> 1); y < cy + (bh >> 1); y++) for (let x = bx; x < bx + bw; x++) {
      const e = y === cy - (bh >> 1) || y === cy + (bh >> 1) - 1 || x === bx || x === bx + bw - 1;
      px(ctx, e ? CPAL.out : (((x - bx) % 4 === 1) ? '#ff6161' : CPAL.blood), x, y);
    }
    for (let i = 0; i < 4; i++) px(ctx, CPAL.gold, bx + 2 + i * 3, cy + (bh >> 1) - 2, 1, 2);
    for (let i = 0; i < 4; i++) px(ctx, CPAL.emberL, bx + 2 + i * 3, cy + (bh >> 1), 1, 3);
    // a second crate, open, with the sticks showing
    px(ctx, CPAL.out, bx + bw + 3, cy - (bh >> 1), Math.max(9, R(L * 0.08)), bh);
    px(ctx, CPAL.woodD, bx + bw + 4, cy - (bh >> 1) + 1, Math.max(7, R(L * 0.08) - 2), bh - 2);
    for (let i = 0; i < 4; i++) px(ctx, CPAL.blood, bx + bw + 4, cy - (bh >> 1) + 2 + i * 2, Math.max(7, R(L * 0.08) - 2), 1);
  } else if (o.gear === 'turret') {
    const tx = R(X0 + L * 0.52), tr = Math.max(7, R(B * 0.40));
    for (let y = cy - tr; y <= cy + tr; y++)
      for (let x = tx - tr; x <= tx + tr; x++) {
        const d = Math.hypot(x - tx, y - cy); if (d > tr) continue;
        px(ctx, d > tr - 1.4 ? CPAL.out : d > tr - 3 ? CPAL.metD : d > tr * 0.3 ? CPAL.met : CPAL.metL, x, y);
      }
    for (let i = 0; i < 10; i++) {
      const th = i / 10 * TAU;
      px(ctx, CPAL.metLL, R(tx + Math.cos(th) * (tr - 2)), R(cy + Math.sin(th) * (tr - 2)));
    }
    const bl = R(L * 0.26);
    px(ctx, CPAL.metDD, tx + tr - 2, cy - 3, bl, 7);
    px(ctx, CPAL.metL, tx + tr - 2, cy - 2, bl, 2);
    px(ctx, CPAL.out, tx + tr - 2 + bl, cy - 4, 3, 9);                 // muzzle brake
    px(ctx, CPAL.metLL, tx + tr - 2 + bl, cy - 3, 3, 1);
    // ready-use ammunition, boxed and strapped down beside the mount
    px(ctx, CPAL.out, tx - tr - 12, cy + 4, 13, 8);
    px(ctx, CPAL.metD, tx - tr - 11, cy + 5, 11, 6);
    px(ctx, CPAL.goldL, tx - tr - 10, cy + 7, 9, 2);
    px(ctx, CPAL.metDD, tx - tr - 8, cy + 5, 1, 6);
  } else if (o.gear === 'crates') {
    // stacked clear of the wheelhouse, on whatever deck she has left
    const cb = o.cabin ? Math.min(0.62, o.cabin + 0.26) : 0.26;
    const bw = Math.max(11, R(L * 0.09)), bh = Math.max(9, R(B * 0.34));
    for (const [fx, fy] of [[cb, -0.42], [cb, 0.36], [cb + 0.14, -0.04], [cb + 0.13, 0.62]]) {
      const bx = R(X0 + L * fx), by = R(cy + B * fy) - (bh >> 1);
      if (deckHalf(bx) < 4 || !solid(bx + (bw >> 1), by + (bh >> 1))) continue;
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
        const e = y === by || y === by + bh - 1 || x === bx || x === bx + bw - 1;
        px(ctx, e ? CPAL.out : (y < by + 2 ? CPAL.woodL : y > by + bh - 3 ? CPAL.woodD : CPAL.wood), x, y);
      }
      for (let i = 1; i < bw - 1; i += 3) px(ctx, CPAL.woodDD, bx + i, by + 1, 1, bh - 2);   // lid boards
      for (const sy2 of [by + 2, by + bh - 4]) {                        // steel banding
        px(ctx, CPAL.metD, bx + 1, sy2, bw - 2, 2);
        px(ctx, CPAL.metL, bx + 1, sy2, bw - 2, 1);
      }
      px(ctx, RUST, bx + bw - 3, by + bh - 4, 1, 3);
      px(ctx, CPAL.out2, bx + 1, by + bh, bw, 2);                      // its shadow
    }
  }

  // ---- a mast or A-frame, lying over the deck the way it looks from above,
  //      with its stays running out to the rail
  if (o.mast || (o.cabin && o.beam >= 18)) {
    const mx = R(X0 + L * 0.58), ml = Math.min(R(L * 0.28), mx - X0 - 6);
    px(ctx, CPAL.out, mx - ml, cy - 3, ml + 3, 6);
    for (let i = 0; i < ml; i++) px(ctx, i & 1 ? CPAL.metD : CPAL.metL, mx - i, cy - 2, 1, 4);
    px(ctx, CPAL.out, mx, cy - 5, 3, 11);                               // the tabernacle
    px(ctx, CPAL.metL, mx, cy - 4, 2, 9);
    for (const sgn of [-1, 1]) {                                        // stays
      const run = Math.min(ml, R(L * 0.12));
      for (let i = 0; i < run; i += 2) {
        const y = R(cy + sgn * (3 + i * (deckHalf(mx - run) - 3) / Math.max(1, run)));
        px(ctx, '#6d6551', mx - i, y);
      }
    }
    if (ml > 4) { px(ctx, CPAL.out, mx - ml - 2, cy - 2, 4, 5); px(ctx, CPAL.emberL, mx - ml - 1, cy - 1, 2, 3); }
  }

  // ---- bow gear: a cleat, the anchor in its hawse, a windlass and a coil
  const clx = R(X0 + L * 0.86);
  if (hwAt[clx] > 3) bollard(clx, cy);
  {
    const ax = R(X0 + L * 0.76), ay = cy + R(B * 0.40);
    if (deckHalf(ax) > 4) {
      px(ctx, CPAL.metDD, ax, ay, 10, 2);
      px(ctx, CPAL.metD, ax + 7, ay - 4, 2, 10);
      px(ctx, CPAL.metL, ax + 9, ay - 4, 2, 2); px(ctx, CPAL.metL, ax + 9, ay + 4, 2, 2);
      px(ctx, CPAL.metL, ax, ay, 4, 1);
      px(ctx, CPAL.out, ax - 3, ay - 1, 3, 4);                           // the hawse pipe
    }
    const wx = R(X0 + L * 0.81);
    if (deckHalf(wx) > 5) {
      px(ctx, CPAL.out, wx, cy - 4, 6, 9);
      px(ctx, CPAL.metD, wx + 1, cy - 3, 4, 7);
      px(ctx, CPAL.metL, wx + 1, cy - 3, 4, 2);
      px(ctx, CPAL.metDD, wx + 1, cy, 4, 1);
    }
  }
  {
    const rcx = R(X0 + L * 0.70), rcy = R(cy - B * 0.44), rr = Math.max(3, R(B * 0.15));
    if (deckHalf(rcx) > rr * 2) for (let r = 1; r <= rr; r++) for (let th = 0; th < 28; th++) {
      const ang = th / 28 * TAU;
      px(ctx, r === rr - 1 ? CPAL.creamD : CPAL.woodD, R(rcx + Math.cos(ang) * r), R(rcy + Math.sin(ang) * r * 0.8));
    }
  }
  // ---- nav lights: red to port, green to starboard, right up at the bow
  {
    const nx = R(X0 + L * 0.93);
    const hw = hwAt[nx];
    if (hw > 3) { px(ctx, '#ff4a4a', nx, R(cy - hw) + 1, 2, 2); px(ctx, '#3cd97a', nx, R(cy + hw) - 2, 2, 2); }
  }
  // ---- her name on the transom and her number on the bow
  {
    // clear of the outboard, when she is carrying one
    const ny = cy - 4, nx0 = X0 + 3 + ((o.motor && !o.cabin) ? Math.max(9, R(B * 0.42)) : 0);
    px(ctx, GRIME, nx0, ny, 13, 8);
    nameTicks(ctx, nx0 + 1, ny + 2, 4, CPAL.bone);
    nameTicks(ctx, nx0 + 1, ny + 5, 3, CPAL.bone);
    const bx = R(X0 + L * 0.80);
    if (hwAt[bx] > 5) {
      nameTicks(ctx, bx, R(cy - hwAt[bx]) + 3, 3, o.trim || CPAL.white);
      nameTicks(ctx, bx, R(cy + hwAt[bx]) - 4, 3, o.trim || CPAL.white);
    }
  }
  return spriteFromHi(c, W / 2, cy);
}

function buildBoats() {
  // Twelve hulls, each given the form its job would have given it: a fine
  // entry on the fast ones, a bluff working bow on the beamy ones, a ram on
  // the gunboat. Ten more are registered from src/entities.js through this
  // same builder; they inherit their form from their proportions.
  const defs = {
    dinghy:    { len: 56, beam: 12,  motor: 1, thwarts: [0.34, 0.62], bow: 'spoon', stern: 0.86 },
    netter:    { len: 60, beam: 14,  motor: 1, gear: 'net', thwarts: [0.6], bow: 'bluff', stern: 0.92,
                 stripe: '#5d6f3c' },
    harpooner: { len: 64, beam: 14,  motor: 1, gear: 'harpoon', thwarts: [0.36], bow: 'fine', stern: 0.62,
                 hull: '#7d858f', hullL: '#c3ccd8', hullD: '#575e68', hullDD: '#383e46', deck: '#6a717b', deckD: '#4c525b',
                 stripe: '#2b3a4a' },
    speedboat: { len: 72, beam: 14,  motor: 1, cabin: 0.30, thwarts: [0.66], bow: 'fine', stern: 0.70,
                 house: '#e8e8ee', houseL: '#ffffff', houseD: '#9ea2ae', houseDD: '#5c1518',
                 hull: '#c4383a', hullL: '#ff8f84', hullD: '#8e2326', hullDD: '#5c1518', deck: '#e8e8ee', deckD: '#b9bcc6',
                 stripe: '#f4f7fb', trim: '#ffe48f' },
    jetski:    { len: 40, beam: 10,  motor: 1, thwarts: [0.5], bow: 'fine', stern: 0.74,
                 hull: '#e0a838', hullL: '#ffe48f', hullD: '#a87a1e', hullDD: '#6d4d10', deck: '#3d4767', deckD: '#28314c',
                 stripe: '#3d4767' },
    dynaboat:  { len: 60, beam: 14,  motor: 1, gear: 'dyna', thwarts: [0.62], bow: 'spoon', stern: 0.88,
                 stripe: '#8e2326' },
    trawler:   { len: 104, beam: 24, motor: 1, cabin: 0.16, gear: 'crates', thwarts: [0.68], bow: 'bluff', mast: 1, fenders: 1,
                 hull: '#8f6a3a', hullL: '#d9a25a', hullD: '#6a4a24', hullDD: '#432d14', stripe: '#2f5f52' },
    gunboat:   { len: 92, beam: 20, motor: 1, cabin: 0.18, gear: 'turret', thwarts: [], bow: 'ram', stern: 0.80,
                 house: '#5b6472', houseL: '#98a2b0', houseD: '#3b424c', houseDD: '#22262d',
                 hull: '#4c535e', hullL: '#98a2b0', hullD: '#343a43', hullDD: '#20242b', deck: '#454b55', deckD: '#2e333a',
                 stripe: '#20242b', trim: '#cdd9ea' },
    // a squat pusher with a high wheelhouse and a fendered bow
    tug:       { len: 68, beam: 22, motor: 1, cabin: 0.22, gear: 'crates', thwarts: [0.72], bow: 'bluff', stern: 0.96, fenders: 1,
                 hull: '#7a3f22', hullL: '#c07a3e', hullD: '#542914', hullDD: '#32180b', deck: '#4a3a2a', deckD: '#31251a',
                 stripe: '#1f2833' },
    // a long low hull paying out line off a drum in the stern
    longliner: { len: 80, beam: 14,  motor: 1, cabin: 0.20, gear: 'net', thwarts: [0.5, 0.74], bow: 'fine', stern: 0.66, mast: 1,
                 house: '#c9d8cf', houseL: '#f0f7f2', houseD: '#7d9a8e', houseDD: '#3f5a50',
                 hull: '#2f5f52', hullL: '#66ab95', hullD: '#1f4138', hullDD: '#132924', deck: '#3d5a52', deckD: '#263a35',
                 stripe: '#f0b87e' },
    // pots stacked on the afterdeck
    crabber:   { len: 64, beam: 18,  motor: 1, cabin: 0.24, gear: 'crates', thwarts: [0.66], bow: 'bluff', fenders: 1,
                 hull: '#7a6a2a', hullL: '#c8b155', hullD: '#544819', hullDD: '#32290c', deck: '#5c5327', deckD: '#3c3617',
                 stripe: '#32290c' },
    // small, fast, and carrying nothing but a flare rack
    spotter:   { len: 48, beam: 10,  motor: 1, gear: 'dyna', thwarts: [0.55], bow: 'fine', stern: 0.68,
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
