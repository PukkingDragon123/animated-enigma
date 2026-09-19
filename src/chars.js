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

// ===========================================================================
//  WAR MANATEE  — top-down, facing RIGHT
// ===========================================================================
const MAN_W = 78, MAN_H = 38, MAN_CX = 40, MAN_CY = 19;

function buildManateeBody(armored) {
  // classic manatee silhouette: fat rounded barrel, narrow peduncle, blunt head
  const lobes = [
    { x: 6,  y: 19, rx: 5.2,  ry: 8.2 },   // fluke trailing edge
    { x: 11, y: 19, rx: 6.4,  ry: 9.2 },   // spade fluke
    { x: 16, y: 19, rx: 6.6,  ry: 8.0 },
    { x: 23, y: 19, rx: 6.4,  ry: 6.0 },   // peduncle waist
    { x: 29, y: 19, rx: 10.0, ry: 10.0 },
    { x: 36, y: 19, rx: 13.0, ry: 13.5 },  // widest belly
    { x: 44, y: 19, rx: 13.0, ry: 13.0 },
    { x: 52, y: 19, rx: 11.0, ry: 11.0 },  // shoulders
    { x: 59, y: 19, rx: 8.6,  ry: 9.0 },   // head
    { x: 64, y: 19, rx: 6.4,  ry: 6.8 },   // muzzle
    { x: 67, y: 19, rx: 4.2,  ry: 4.6 },   // snout tip
  ];
  const f = blobField(MAN_W, MAN_H, lobes);
  const ramp = [CPAL.manDD, CPAL.manD, CPAL.man, CPAL.manL, CPAL.manLL];
  const { c, ctx } = shadeBlob(MAN_W, MAN_H, f, ramp, { outline: CPAL.out });

  // ---- hide: manatees have transverse skin folds, not granite speckle
  for (const fx of [26, 33, 49, 56]) {
    for (let y = 2; y < MAN_H - 2; y++) {
      const bend = Math.round(Math.sin((y - 19) / 19 * 1.2) * 2.2);
      const x = fx + bend, i = y * MAN_W + x;
      if (i < 0 || i >= f.length || f[i] <= 0.10) continue;
      px(ctx, CPAL.manD, x, y);
      if (f[i] > 0.4 && (y & 1) === 0) px(ctx, CPAL.manL, x + 1, y);
    }
  }
  // a sparse dusting of barnacles and old nicks
  for (let y = 4; y < MAN_H - 4; y++) for (let x = 4; x < MAN_W - 4; x++) {
    const i = y * MAN_W + x; if (f[i] <= 0.25) continue;
    if (hash2(x * 7, y * 11) > 0.992) { px(ctx, CPAL.manLL, x, y); px(ctx, CPAL.manDD, x, y + 1); }
  }
  // a couple of old propeller scars across the back (this is a manatee, after all)
  for (let i = 0; i < 5; i++) px(ctx, CPAL.manLL, 32 + i * 2, 8 + i);
  for (let i = 0; i < 4; i++) px(ctx, CPAL.manLL, 40 + i * 2, 28 - i);
  // fluke ridges fanning from the peduncle
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    for (let x = 3; x < 20; x++) {
      const y = Math.round(19 + i * 2.1 + (20 - x) * i * 0.09);
      if (y > 0 && y < MAN_H && f[y * MAN_W + x] > 0.05 && ((x + i) & 1) === 0) px(ctx, CPAL.manD, x, y);
    }
  }
  for (let i = 0; i < 4; i++) px(ctx, CPAL.manLL, 5, 14 + i * 3);

  // ---- head: eyes set wide, whisker pad, nostrils
  px(ctx, CPAL.out, 60, 12, 4, 4); px(ctx, CPAL.eye, 61, 13, 2, 2); px(ctx, CPAL.shine, 61, 13);
  px(ctx, CPAL.out, 60, 23, 4, 4); px(ctx, CPAL.eye, 61, 24, 2, 2); px(ctx, CPAL.shine, 61, 24);
  stamp(ctx, [
    '..kkkk..',
    '.kWWWWk.',
    'kWWwwWWk',
    'kWwwwwWk',
    'kWWwwWWk',
    '.kWWWWk.',
    '..kkkk..',
  ], 63, 16, { k: CPAL.out, W: CPAL.manL, w: CPAL.manD });
  px(ctx, CPAL.out, 66, 17, 2, 2); px(ctx, CPAL.out, 66, 21, 2, 2);
  for (let i = 0; i < 5; i++) {
    px(ctx, CPAL.manLL, 69 - (i & 1), 15 - (i * 1.4 | 0));
    px(ctx, CPAL.manLL, 69 - (i & 1), 24 + (i * 1.4 | 0));
  }

  if (armored) {
    // ---- two riveted steel back plates, leaving plenty of hide showing
    const plates = [[31, 8, 10, 23], [42, 9, 9, 21]];
    for (const [pxx, pyy, pw, ph] of plates) {
      for (let y = pyy; y < pyy + ph; y++) for (let x = pxx; x < pxx + pw; x++) {
        const i = y * MAN_W + x; if (i < 0 || i >= f.length || f[i] <= 0.04) continue;
        const top = y < pyy + 3, bot = y > pyy + ph - 4, lef = x < pxx + 2;
        let col = top ? CPAL.metL : bot ? CPAL.metDD : lef ? CPAL.metD : CPAL.met;
        if (((x * 3 + y) % 7) === 0 && !top && !bot) col = CPAL.metD;
        px(ctx, col, x, y);
      }
      for (let y = pyy; y < pyy + ph; y++) {
        const a = y * MAN_W + pxx, b = y * MAN_W + pxx + pw - 1;
        if (f[a] > 0.04) px(ctx, CPAL.out2, pxx, y);
        if (f[b] > 0.04) px(ctx, CPAL.out2, pxx + pw - 1, y);
      }
      for (let y = pyy + 2; y < pyy + ph - 1; y += 5) {
        px(ctx, CPAL.metLL, pxx + 1, y); px(ctx, CPAL.metDD, pxx + 1, y + 1);
        px(ctx, CPAL.metLL, pxx + pw - 2, y); px(ctx, CPAL.metDD, pxx + pw - 2, y + 1);
      }
    }
    // ---- leather harness straps over the bare hide fore and aft
    for (const sx of [27, 54]) {
      for (let y = 2; y < MAN_H - 2; y++) {
        const i = y * MAN_W + sx; if (f[i] <= 0.04) continue;
        px(ctx, CPAL.lea, sx, y); px(ctx, CPAL.leaD, sx + 1, y);
        if ((y & 3) === 1) px(ctx, CPAL.leaL, sx, y);
      }
      px(ctx, CPAL.gold, sx, 18, 2, 3); px(ctx, CPAL.goldL, sx, 18, 2, 1);
    }
    // ---- shoulder spikes
    stamp(ctx, ['..k..', '.kMk.', 'kMMMk', 'kkkkk'], 45, 5, { k: CPAL.out, M: CPAL.metL });
    stamp(ctx, ['kkkkk', 'kMMMk', '.kMk.', '..k..'], 45, 30, { k: CPAL.out, M: CPAL.metL });
    // ---- brow plate with a brass boss
    stamp(ctx, [
      '.kkkkkk.',
      'kMMMMMMk',
      'kMLLLLMk',
      'kMMMMMMk',
      '.kkkkkk.',
    ], 55, 15, { k: CPAL.out, M: CPAL.met, L: CPAL.metL });
    px(ctx, CPAL.gold, 58, 17, 2, 3); px(ctx, CPAL.goldL, 58, 17, 2, 1);
  }
  return spriteFrom(c, MAN_CX, MAN_CY);
}

// ---- saddle (sits mid-back, the otter perches here) -----------------------
function buildSaddle() {
  const c = newCan(22, 20), ctx = c.getContext('2d');
  stamp(ctx, [
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
  ], 2, 4, { k: CPAL.out, L: CPAL.leaL, l: CPAL.lea, d: CPAL.leaD, D: CPAL.leaD });
  // stitching + brass studs
  for (let x = 5; x < 19; x += 3) { px(ctx, CPAL.goldL, x, 6); px(ctx, CPAL.goldD, x, 7); px(ctx, CPAL.goldL, x, 14); px(ctx, CPAL.goldD, x, 15); }
  return spriteFrom(c, 11, 10);
}

// ---- tail fluke (swings) --------------------------------------------------
// ---- flipper --------------------------------------------------------------
function buildFlipper() {
  const W = 13, H = 9;
  const f = blobField(W, H, [{ x: 3, y: 4.5, rx: 3.6, ry: 3.8 }, { x: 7, y: 4.5, rx: 4.4, ry: 3.2 }, { x: 10.5, y: 4.5, rx: 2.6, ry: 2.1 }]);
  const { c, ctx } = shadeBlob(W, H, f, [CPAL.manDD, CPAL.manDD, CPAL.manD, CPAL.man], { outline: CPAL.out, lift: 0.04, smooth: 1 });
  for (let i = 0; i < 3; i++) px(ctx, CPAL.manDD, 8 + i, 3 + i * 1.5 | 0);
  return spriteFrom(c, 2.5, 4.5);
}

// ---- pirate flag on a pole (flies behind the saddle) ----------------------
function buildFlag(frame) {
  const c = newCan(22, 18), ctx = c.getContext('2d');
  const wav = [0, 1, 2, 1, 0, -1, -2, -1][frame & 7];
  // cloth
  for (let y = 0; y < 12; y++) {
    const off = Math.round(Math.sin((y / 12) * 3.1 + frame * 0.8) * 1.4 + wav * 0.4);
    for (let x = 0; x < 16; x++) {
      const edge = x === 15 ? 1 : 0;
      px(ctx, edge ? CPAL.out : (y < 2 || x < 2 ? CPAL.out2 : CPAL.hatD), 4 + x, 2 + y + off);
    }
  }
  // skull & crossbones
  const off0 = Math.round(Math.sin(0.45 * 3.1 + frame * 0.8) * 1.4 + wav * 0.4);
  stamp(ctx, [
    '.kkkk.',
    'kWWWWk',
    'kWkWkW',
    'kWWWWk',
    '.kWkW.',
    '.kkkk.',
  ], 8, 5 + off0, { k: CPAL.out, W: CPAL.white });
  return spriteFrom(c, 2, 9);
}

// ===========================================================================
//  CAPTAIN OTTER — high 3/4 view, sits on the saddle, aims 360°
// ===========================================================================
// torso + cape, drawn once; head and arms are separate so they animate.
function buildOtterTorso() {
  const c = newCan(26, 24), ctx = c.getContext('2d');
  const M = { k: CPAL.out, C: CPAL.cape, c: CPAL.capeD, L: CPAL.capeL, f: CPAL.fur, d: CPAL.furD, l: CPAL.furL, r: CPAL.cream, e: CPAL.lea, E: CPAL.leaL, g: CPAL.gold, G: CPAL.goldL, m: CPAL.met, M: CPAL.metL };
  // cape spread behind the shoulders
  stamp(ctx, [
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
  ], 5, 10, M);
  // torso (fur) over the cape
  stamp(ctx, [
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
  ], 7, 8, M);
  // bandolier strap + brass buckle
  stamp(ctx, [
    'e.........',
    '.e........',
    '..E.......',
    '...e......',
    '....e.....',
    '.....E....',
  ], 9, 10, M);
  px(ctx, CPAL.gold, 14, 15, 3, 3); px(ctx, CPAL.goldL, 14, 15, 3, 1); px(ctx, CPAL.goldD, 14, 17, 3, 1);
  // shoulder pauldron (salvaged steel)
  stamp(ctx, ['kkkk', 'kMMk', 'kmmk', '.kk.'], 6, 9, M);
  stamp(ctx, ['kkkk', 'kMMk', 'kmmk', '.kk.'], 17, 9, M);
  return spriteFrom(c, 13, 14);
}

// Head + tricorn hat. `look` shifts the muzzle for a turned head.
function buildOtterHead() {
  const c = newCan(24, 22), ctx = c.getContext('2d');
  const M = {
    k: CPAL.out, f: CPAL.fur, d: CPAL.furD, D: CPAL.furDD, l: CPAL.furL, L: CPAL.furLL,
    r: CPAL.cream, R: CPAL.creamD, h: CPAL.hat, H: CPAL.hatL, x: CPAL.hatD, X: CPAL.hatLL, W: CPAL.white,
  };
  // ---- head fur (round otter skull, ears)
  stamp(ctx, [
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
  ], 5, 6, M);
  // ---- tricorn hat sits on top, brim upturned at three corners
  stamp(ctx, [
    '...kkkkkkkkkkkk...',
    '..kxxxxxxxxxxxxk..',
    '.kxhhhhhhhhhhhhxk.',
    'kxhhhhhhhhhhhhhhxk',
    'kxhhhhhHHHHhhhhhxk',
    'kXhhhHHHHHHHHhhhXk',
    'kkxhhhhhhhhhhhhxkk',
    '.kkxxxxxxxxxxxxkk.',
    '..kkkkkkkkkkkkkk..',
  ], 3, 0, M);
  // hat band + skull badge
  for (let x = 5; x < 19; x++) px(ctx, CPAL.goldD, x, 6);
  px(ctx, CPAL.goldL, 5, 6, 14, 1);
  stamp(ctx, [
    '.kkkk.',
    'kWWWWk',
    'kWkWkW',
    'kWWWWk',
    '.kkkk.',
  ], 9, 1, M);
  return spriteFrom(c, 12, 12);
}

// Muzzle + expression are drawn live on top of the head so they can animate.
// exp: 'idle' | 'happy' | 'angry' | 'talk' | 'surprised' | 'hurt'
function drawOtterFace(ctx, exp, blink, t) {
  const O = CPAL.out, C = CPAL.cream, CD = CPAL.creamD, E = CPAL.eye, W = CPAL.shine;
  void E; void W;
  // muzzle pad
  stamp(ctx, [
    '.kkkkkk.',
    'kCCCCCCk',
    'kCCCCCCk',
    'kCCCCCCk',
    '.kCCCCk.',
    '..kkkk..',
  ], 8, 13, { k: O, C });
  // nose
  px(ctx, O, 11, 14, 3, 2); px(ctx, CPAL.furDD, 11, 14, 3, 1);
  const brow = exp === 'angry' ? 1 : exp === 'surprised' ? -1 : 0;
  // eyes
  // drowning / agony: eyes screwed shut, cheeks puffed, mouth gasping
  if (exp === 'drown' || exp === 'pain') {
    px(ctx, O, 6, 10, 5, 1); px(ctx, O, 7, 9, 3, 1); px(ctx, O, 7, 11, 3, 1);
    px(ctx, O, 13, 10, 5, 1); px(ctx, O, 14, 9, 3, 1); px(ctx, O, 14, 11, 3, 1);
    px(ctx, CPAL.furDD, 5, 8, 5, 1); px(ctx, CPAL.furDD, 14, 8, 5, 1);
    const g = Math.floor(t * 4) & 1;
    px(ctx, O, 10 - g, 17, 5 + g * 2, 4 + g);
    px(ctx, CPAL.bloodD, 11 - g, 18, 3 + g * 2, 2 + g);
    px(ctx, CD, 4, 14, 3, 1); px(ctx, CD, 4, 16, 3, 1);
    px(ctx, CD, 17, 14, 3, 1); px(ctx, CD, 17, 16, 3, 1);
    return;
  }
  const shut = blink || exp === 'happy';
  for (const ex of [7, 14]) {
    if (shut) { px(ctx, O, ex, 11, 3, 1); continue; }
    const big = exp === 'surprised' ? 1 : 0;
    px(ctx, CPAL.white, ex - big, 10 - big, 3 + big * 2, 3 + big * 2);
    px(ctx, O, ex - big, 10 - big, 3 + big * 2, 1);
    px(ctx, E, ex + (exp === 'angry' ? 0 : 0), 11, 2, 2);
    px(ctx, W, ex, 11);
  }
  // brows
  if (brow !== 0) {
    px(ctx, CPAL.furDD, 6, 9 + (brow > 0 ? 1 : -1), 4, 1);
    px(ctx, CPAL.furDD, 13, 9 + (brow > 0 ? 1 : -1), 4, 1);
  }
  // mouth
  if (exp === 'happy') { px(ctx, O, 10, 18, 5, 1); px(ctx, O, 9, 17); px(ctx, O, 15, 17); }
  else if (exp === 'angry') { px(ctx, O, 10, 18, 5, 1); px(ctx, O, 9, 19); px(ctx, O, 15, 19); }
  else if (exp === 'talk') { const o = (Math.floor(t * 9) & 1); px(ctx, O, 10, 17, 5, 2 + o); px(ctx, CPAL.blood, 11, 18, 3, o); }
  else if (exp === 'surprised') { px(ctx, O, 11, 17, 3, 3); px(ctx, CPAL.bloodD, 11, 18, 3, 2); }
  else px(ctx, O, 10, 18, 5, 1);
  // whiskers
  px(ctx, CD, 4, 14, 3, 1); px(ctx, CD, 4, 16, 3, 1);
  px(ctx, CD, 17, 14, 3, 1); px(ctx, CD, 17, 16, 3, 1);
}

// ---- cigar (clamped in the muzzle, embers + smoke) ------------------------
function buildCigar() {
  const c = newCan(12, 5), ctx = c.getContext('2d');
  stamp(ctx, [
    'kkkkkkkkk..',
    'kDDDDDDDek.',
    'kDdddddDEek',
    'kDDDDDDDek.',
    'kkkkkkkkk..',
  ], 0, 0, { k: CPAL.out, D: CPAL.woodDD, d: CPAL.woodD, e: CPAL.ember, E: CPAL.emberL });
  return spriteFrom(c, 0, 2);
}

// ---- arm (shoulder at the anchor, hand at the far end) --------------------
function buildOtterArm() {
  const c = newCan(12, 7), ctx = c.getContext('2d');
  stamp(ctx, [
    '.kkkkkkkkk.',
    'kdffffffdDk',
    'kffffffffDk',
    'kdffffffdDk',
    '.kkkkkkkkk.',
  ], 0, 1, { k: CPAL.out, f: CPAL.fur, d: CPAL.furD, D: CPAL.furDD });
  // leather cuff
  px(ctx, CPAL.lea, 7, 2, 2, 3); px(ctx, CPAL.leaL, 7, 2, 2, 1);
  return spriteFrom(c, 1, 3.5);
}

function buildOtterTail() {
  const W = 18, H = 10;
  const f = blobField(W, H, [{ x: 4, y: 5, rx: 5, ry: 4.4 }, { x: 9, y: 5, rx: 5, ry: 3.6 }, { x: 14, y: 5, rx: 4, ry: 2.6 }]);
  const { c } = shadeBlob(W, H, f, [CPAL.furDD, CPAL.furD, CPAL.fur, CPAL.furL], { outline: CPAL.out, lift: 0.20, smooth: 1 });
  return spriteFrom(c, 2, 5);
}

// ===========================================================================
//  BUILD ALL
// ===========================================================================
const CH = {};
function buildCharacters() {
  CH.manatee      = buildManateeBody(false);
  CH.manateeArmor = buildManateeBody(true);
  CH.manateeHurt  = tintSprite(CH.manateeArmor, '#ffffff', 0.85);
  CH.manateeHurtP = tintSprite(CH.manatee, '#ffffff', 0.85);
  CH.flipper      = buildFlipper();
  CH.saddle       = buildSaddle();
  CH.flags        = []; for (let i = 0; i < 8; i++) CH.flags.push(buildFlag(i));
  CH.otterTorso   = buildOtterTorso();
  CH.otterHead    = buildOtterHead();
  CH.otterArm     = buildOtterArm();
  CH.otterTail    = buildOtterTail();
  CH.cigar        = buildCigar();
  CH.otterRage    = tintSprite(CH.otterTorso, '#ff4a26', 0.4);
  CH.headRage     = tintSprite(CH.otterHead, '#ff4a26', 0.35);
  // head canvas we redraw the face onto each frame
  CH.headBuf = newCan(CH.otterHead.w, CH.otterHead.h);
  CH.headBufCtx = CH.headBuf.getContext('2d');
  buildBoats();
}

// ---- live head with expression --------------------------------------------
function otterHeadWithFace(exp, blink, t, rage) {
  const ctx = CH.headBufCtx;
  ctx.clearRect(0, 0, CH.headBuf.width, CH.headBuf.height);
  ctx.drawImage((rage ? CH.headRage : CH.otterHead).c, 0, 0);
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
  const L = o.len, B = o.beam;                 // length, half-beam at the widest
  const W = L + 4, H = B * 2 + 6, cy = H / 2;
  const c = newCan(W, H), ctx = c.getContext('2d');
  const hullL = o.hullL || CPAL.woodL, hull = o.hull || CPAL.wood;
  const hullD = o.hullD || CPAL.woodD, hullDD = o.hullDD || CPAL.woodDD;
  const deck = o.deck || CPAL.wood, deckD = o.deckD || CPAL.woodD;

  const halfW = x => {
    const u = clamp((x - 2) / L, 0, 1);
    if (u < 0.33) return B * (0.70 + 0.30 * (u / 0.33));
    return B * Math.max(0, 1 - Math.pow((u - 0.33) / 0.67, 1.7));
  };
  // ---- hull: outline, topside shading, then the deck well
  for (let x = 2; x <= L + 1; x++) {
    const hw = halfW(x); if (hw < 0.6) continue;
    const y0 = Math.round(cy - hw), y1 = Math.round(cy + hw);
    for (let y = y0; y <= y1; y++) {
      const edge = y === y0 || y === y1 || x === 2 || x > L;
      if (edge) { px(ctx, CPAL.out, x, y); continue; }
      const near = Math.min(y - y0, y1 - y);
      // gunwale catches the light on the upper side, shadow on the lower
      px(ctx, near <= 1 ? (y - y0 <= 1 ? hullL : hullDD) : near <= 2 ? hull : hullD, x, y);
    }
  }
  // ---- open deck well with fore-and-aft planking
  const wellA = Math.round(2 + L * 0.14), wellB = Math.round(2 + L * 0.82);
  for (let x = wellA; x <= wellB; x++) {
    const hw = halfW(x) - 3; if (hw < 1) continue;
    const y0 = Math.round(cy - hw), y1 = Math.round(cy + hw);
    for (let y = y0; y <= y1; y++) {
      if (y === y0 || y === y1 || x === wellA || x === wellB) { px(ctx, CPAL.out2, x, y); continue; }
      px(ctx, ((y - y0) % 3 === 0) ? deckD : deck, x, y);
    }
  }
  // ---- thwarts (bench seats) across the well
  for (const f of (o.thwarts || [0.34, 0.62])) {
    const x = Math.round(2 + L * f), hw = halfW(x) - 2; if (hw < 1) continue;
    for (let y = Math.round(cy - hw); y <= Math.round(cy + hw); y++) px(ctx, hullL, x, y);
    px(ctx, CPAL.out2, x + 1, Math.round(cy - hw), 1, Math.round(hw * 2) + 1);
  }
  // ---- transom + outboard motor at the stern
  if (o.motor) {
    const mx = 0, my = Math.round(cy);
    stamp(ctx, [
      'kkkkk',
      'kXXXk',
      'kXmXk',
      'kXXXk',
      'kkkkk',
    ], mx, my - 2, { k: CPAL.out, X: CPAL.metDD, m: CPAL.metL });
  }
  // ---- wheelhouse / cabin
  if (o.cabin) {
    const cw = Math.round(L * 0.22), ch = Math.round(B * 1.1);
    const cx0 = Math.round(2 + L * o.cabin), cy0 = Math.round(cy - ch / 2);
    for (let y = cy0; y < cy0 + ch; y++) for (let x = cx0; x < cx0 + cw; x++) {
      const e = y === cy0 || y === cy0 + ch - 1 || x === cx0 || x === cx0 + cw - 1;
      px(ctx, e ? CPAL.out : (y < cy0 + 2 ? CPAL.metL : y > cy0 + ch - 3 ? CPAL.metDD : CPAL.met), x, y);
    }
    // lit window
    px(ctx, CPAL.goldL, cx0 + cw - 3, cy0 + 2, 2, Math.max(1, ch - 4));
  }
  // ---- role-specific gear
  if (o.gear === 'net') {
    for (let x = wellA + 2; x < wellA + Math.round(L * 0.3); x++)
      for (let y = Math.round(cy - B * 0.5); y < Math.round(cy + B * 0.5); y++)
        if (((x + y) & 1) === 0) px(ctx, CPAL.white, x, y);
    px(ctx, CPAL.out2, wellA + 1, Math.round(cy - B * 0.5), 1, Math.round(B));
  } else if (o.gear === 'harpoon') {
    const hx = Math.round(2 + L * 0.62);
    px(ctx, CPAL.metDD, hx, Math.round(cy) - 1, Math.round(L * 0.3), 3);
    px(ctx, CPAL.metL, hx, Math.round(cy), Math.round(L * 0.3), 1);
    px(ctx, CPAL.out, hx - 2, Math.round(cy) - 3, 4, 7);
  } else if (o.gear === 'dyna') {
    const bx = Math.round(2 + L * 0.3);
    stamp(ctx, ['kkkkkk', 'krrrrk', 'kRrRrk', 'krrrrk', 'kkkkkk'], bx, Math.round(cy) - 2,
      { k: CPAL.out, r: CPAL.blood, R: '#ff6161' });
  } else if (o.gear === 'turret') {
    const tx = Math.round(2 + L * 0.55);
    for (let y = Math.round(cy) - 3; y <= Math.round(cy) + 3; y++)
      for (let x = tx - 3; x <= tx + 3; x++) {
        const d = Math.hypot(x - tx, y - cy); if (d > 3.4) continue;
        px(ctx, d > 2.6 ? CPAL.out : d > 1.4 ? CPAL.metD : CPAL.met, x, y);
      }
    px(ctx, CPAL.metDD, tx + 2, Math.round(cy) - 1, Math.round(L * 0.24), 2);
    px(ctx, CPAL.metL, tx + 2, Math.round(cy) - 1, Math.round(L * 0.24), 1);
  } else if (o.gear === 'crates') {
    for (const [fx, fy] of [[0.28, -0.4], [0.28, 0.35], [0.46, 0]]) {
      const bx = Math.round(2 + L * fx), by = Math.round(cy + B * fy) - 2;
      stamp(ctx, ['kkkkk', 'kTtTk', 'ktTtk', 'kTtTk', 'kkkkk'], bx, by,
        { k: CPAL.out, T: CPAL.woodL, t: CPAL.woodD });
    }
  }
  // ---- bow cleat + a coil of rope, every boat gets them
  px(ctx, CPAL.metL, Math.round(2 + L * 0.9), Math.round(cy) - 1, 2, 2);
  return spriteFrom(c, W / 2, cy);
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
  };
  for (const k in defs) {
    SP.boats[k] = buildBoat(defs[k]);
    SP.boatsHurt[k] = tintSprite(SP.boats[k], '#ffffff', 0.8);
  }
}
