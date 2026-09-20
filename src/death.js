// ===========================================================================
//  DEATH — "the otter puts her back together"
//
//  A two-part sequence that plays when the war manatee dies.
//
//   PART 1  'sinking'  — top-down, in WORLD space, at the spot she died.
//                        She goes limp, rolls belly-up, blood blooms, the
//                        otter is thrown clear, scrambles back, takes hold
//                        and tries to haul her.  They go under together.
//   PART 2  'shore'    — a SIDE-SCROLLING scene in 640x360 logical screen
//                        space, in the style of src/intro.js: a dark beach
//                        before dawn, surf, driftwood, a small fire.  The
//                        otter repairs her, piece by piece, until she coughs.
//
//  Public API
//    DeathScene.init()                  build every sprite once
//    DeathScene.start(x, y, facing)     begin at this world position
//    DeathScene.update(dt, t)           advance; sets .done at the very end
//    DeathScene.renderWorld(ctx,cam,t)  part 1, WORLD space (x - cam.x)
//    DeathScene.renderScreen(ctx, t)    part 2 + all full-screen overlay
//    DeathScene.phase                   'sinking' | 'shore' | 'done'
//    DeathScene.done / .worldActive     booleans
//    DeathScene.skip()                  jump to the end
//
//  Pure pixel art: integer coordinates, posterized colours, hard edges, no
//  gradients, no blur, no external images.  Every sprite is built once.
// ===========================================================================
(function (global) {
'use strict';

// ------------------------------------------------------------- tiny raster
const R = Math.round;
// the game's rig scale, read late (game.js loads after this file)
function rigScale() { try { return RIG_SCALE; } catch (e) { return 1; } }
function can(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
function cx2(c) { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; }
function spr(c, ax, ay) { return { c: c, w: c.width, h: c.height, ax: ax === undefined ? c.width / 2 : ax, ay: ay === undefined ? c.height / 2 : ay }; }
function P(ctx, col, x, y, w, h) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w === undefined ? 1 : w | 0, h === undefined ? 1 : h | 0); }
function LN(ctx, col, x0, y0, x1, y1) {
  x0 = x0 | 0; y0 = y0 | 0; x1 = x1 | 0; y1 = y1 | 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, n = 0;
  ctx.fillStyle = col;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if ((x0 === x1 && y0 === y1) || ++n > 1200) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bay(x, y) { return (BAYER[(((y | 0) & 3) << 2) | ((x | 0) & 3)] + 0.5) / 16; }
function qa(a) { return Math.max(0, Math.min(1, Math.round(a * 12) / 12)); }
function rgbaq(hex, a) { const c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + qa(a) + ')'; }
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const h = v => { const s = Math.max(0, Math.min(255, R(v))).toString(16); return s.length < 2 ? '0' + s : s; };
  return '#' + h(A[0] + (B[0] - A[0]) * t) + h(A[1] + (B[1] - A[1]) * t) + h(A[2] + (B[2] - A[2]) * t);
}
// hard-edged, dithered-rim disc — the workhorse for blood and light pools
function ditherDisc(ctx, cx, cy, r, ry, cols) {
  cx = R(cx); cy = R(cy); if (r < 1) return;
  const RY = ry === undefined ? r * 0.62 : ry;
  const y0 = Math.floor(-RY), y1 = Math.ceil(RY);
  for (let y = y0; y <= y1; y++) {
    const k = y / RY; if (k * k >= 1) continue;
    const hw = r * Math.sqrt(1 - k * k);
    const w = Math.floor(hw);
    if (w < 1) continue;
    for (let x = -w; x <= w; x++) {
      const d = Math.sqrt((x / r) * (x / r) + k * k);
      let bandF = d * cols.length;
      let bi = Math.floor(bandF);
      if (bandF - bi > bay(cx + x, cy + y)) bi++;
      if (bi >= cols.length) continue;
      ctx.fillStyle = cols[bi];
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}

// Bake a dithered disc into its own sprite so it can be blitted instead of
// rasterized every frame.
function bakeDisc(r, ry, cols) {
  const w = r * 2 + 1, h = Math.ceil(ry) * 2 + 1;
  const c = can(w, h), x = cx2(c);
  ditherDisc(x, r, Math.ceil(ry), r, ry, cols);
  return spr(c, r, Math.ceil(ry));
}

// ================================================================ palettes
const DP = {
  ink: '#0b0912', ink2: '#171423',
  blood: ['#2e050b', '#4b0a12', '#7a0d16', '#a8151f', '#c4202c', '#e8515a'],
  // night beach
  skyN: ['#05070f', '#080c18', '#0d1322', '#121b2e', '#18243c', '#1f2d49'],
  skyD: ['#0a0c18', '#141a30', '#26243f', '#442f4f', '#6e4152', '#a75b4e'],
  seaN: ['#040810', '#07101e', '#0b182c', '#102240', '#173056'],
  foam: ['#5d7d95', '#8fb0c4', '#c8dde9', '#f2fbff'],
  sand: ['#1a1520', '#26202c', '#342c39', '#443949', '#584a59'],
  sandW: ['#241a1c', '#35262a', '#493438', '#5d4446'],
  wood: ['#1c1520', '#2e2430', '#453546', '#5b4757'],
  fire: ['#5c1b10', '#9c3115', '#d4651c', '#ffab34', '#ffe6a2'],
  man: ['#201c26', '#2f2a35', '#403a47', '#524b59', '#665e6e'],
  belly: ['#3a4450', '#4c5763', '#606b78'],
  fur: ['#4b230f', '#6d3316', '#9c4d24', '#c8703c', '#e0975c'],
  cream: '#e8d3ae', creamD: '#c3a87f',
  met: ['#22293a', '#3a445c', '#5a6884', '#8a9ab5', '#c2d0e4'],
  gold: ['#7a5512', '#a87a1e', '#e0a838', '#ffe08a'],
  lea: ['#2c1a0d', '#472c17', '#6d4527', '#8f6038'],
  bone: '#e8e4d8', white: '#f2f6fa',
  bandage: ['#8e8875', '#b9b29a', '#ded7bd', '#f2ecd8'],
};

// ================================================================== state
let BUILT = false;
const A = {};          // the sprite bank

// =========================================================================
//  PART 1 ART — top-down.  Everything reuses CH / Rig so it matches the
//  game exactly; only the loose props below are new.
// =========================================================================
function buildTopArt() {
  // ---- blood pools, baked at a ladder of sizes
  A.bloodDisc = [];
  for (let i = 0; i < 15; i++) {
    const r = 4 + i * 4;
    A.bloodDisc.push(bakeDisc(r, r * 0.74, [DP.blood[0], DP.blood[1], DP.blood[2], DP.blood[3], DP.blood[1], DP.blood[0]]));
  }
  A.darkDisc = [];
  for (let i = 0; i < 10; i++) { const r = 8 + i * 8; A.darkDisc.push(bakeDisc(r, r * 0.60, ['#040a14', '#08121f', '#0d1c2c'])); }
  A.sinkDisc = [];
  for (let i = 0; i < 6; i++) { const r = 14 + i * 6; A.sinkDisc.push(bakeDisc(r, r * 0.50, ['#0a1420', '#0d1a28'])); }
  // ---- her underside, for the moment she rolls belly-up
  {
    const src = CH.manatee;
    const c = can(src.w, src.h), x = cx2(c);
    x.drawImage(src.c, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = 0.62; x.fillStyle = CPAL.belly; x.fillRect(0, 0, src.w, src.h);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    // a pale mid-line and two old boat scars across the belly
    for (let i = 8; i < src.w - 8; i += 2) P(x, '#c3d0dc', i, R(src.h / 2));
    for (let i = 0; i < 9; i++) { P(x, DP.blood[2], 30 + i * 2, 10 + i, 2, 1); P(x, DP.blood[1], 30 + i * 2, 11 + i, 2, 1); }
    for (let i = 0; i < 7; i++) { P(x, DP.blood[2], 44 + i * 2, 29 - i, 2, 1); }
    A.manBelly = spr(c, src.ax, src.ay);
  }
  // ---- a torn-off armour plate, tumbling free of her back
  {
    const c = can(14, 26), x = cx2(c);
    for (let y = 0; y < 26; y++) for (let xx = 0; xx < 14; xx++) {
      const edge = y === 0 || y === 25 || xx === 0 || xx === 13;
      const top = y < 3, bot = y > 21, lef = xx < 2;
      P(x, edge ? DP.ink : top ? DP.met[3] : bot ? DP.met[0] : lef ? DP.met[1] : DP.met[2], xx, y);
    }
    for (let y = 3; y < 24; y += 5) { P(x, DP.met[4], 2, y); P(x, DP.met[0], 2, y + 1); P(x, DP.met[4], 11, y); P(x, DP.met[0], 11, y + 1); }
    // torn edge along the top-right
    for (let i = 0; i < 6; i++) P(x, DP.ink, 13 - i, i, 1, 1 + (i & 1));
    A.plate = spr(c, 7, 13);
  }
  // ---- a snapped harness strap
  {
    const c = can(16, 6), x = cx2(c);
    for (let i = 0; i < 15; i++) { const y = 2 + R(Math.sin(i * 0.5) * 1.2); P(x, DP.ink, i, y - 1, 1, 4); P(x, DP.lea[2], i, y, 1, 2); P(x, DP.lea[3], i, y, 1, 1); }
    A.strap = spr(c, 8, 3);
  }
  // ---- a lost tricorn hat, floating (drawn small, top-down)
  {
    const c = can(16, 12), x = cx2(c);
    stamp(x, [
      '..kkkkkkkkkk..',
      '.kxxxxxxxxxxk.',
      'kxhhhhhhhhhhxk',
      'kxhhhHHHHhhhxk',
      'kXhhhhhhhhhhXk',
      '.kxxxxxxxxxxk.',
      '..kkkkkkkkkk..',
    ], 1, 2, { k: CPAL.out, h: CPAL.hat, x: CPAL.hatD, H: CPAL.hatL, X: CPAL.hatLL });
    A.hatTop = spr(c, 8, 6);
  }
}

// top-down manatee, drawn from the game's own sprites, with a real
// belly-up reveal at the halfway point of the roll
function drawManateeTop(ctx, x, y, st) {
  if (typeof CH === 'undefined' || !CH.manateeArmor) return;
  const ph = (st.roll || 0) * TAU;
  let sy = Math.cos(ph);
  const belly = sy < 0;
  if (Math.abs(sy) < 0.20) sy = 0.20 * (sy < 0 ? -1 : 1);
  const stretch = 1 + Math.abs(Math.sin(ph)) * 0.14;
  ctx.save();
  ctx.translate(R(x), R(y));
  ctx.scale(st.facing, 1);
  ctx.rotate((st.tilt || 0) * st.facing + Math.sin(ph) * 0.16);
  ctx.scale(stretch, sy);
  // flippers, gone slack
  const fa = 2.25 + (st.slack || 0);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(9, side * 12); ctx.scale(1, side); ctx.rotate(fa);
    ctx.drawImage(CH.flipper.c, -CH.flipper.ax, -CH.flipper.ay); ctx.restore();
  }
  const body = st.hurt ? CH.manateeHurt : (belly ? A.manBelly : CH.manateeArmor);
  ctx.drawImage(body.c, -body.ax, -body.ay);
  ctx.restore();
}

// draws the otter on his own, top-down, out of the saddle
// o: {x, y, ang, s, exp, arms:[a,b], tail, alpha}
function drawOtterTop(ctx, o, t) {
  if (typeof CH === 'undefined' || !CH.otterTorso) return;
  ctx.save();
  ctx.translate(R(o.x), R(o.y));
  ctx.rotate(o.ang || 0);
  const s = o.s === undefined ? rigScale() * 0.66 : o.s;
  ctx.scale(s, s);
  if (o.alpha !== undefined) ctx.globalAlpha = qa(o.alpha);
  // tail
  ctx.save(); ctx.translate(-9, 4); ctx.rotate(2.5 + (o.tail || 0));
  ctx.drawImage(CH.otterTail.c, -CH.otterTail.ax, -CH.otterTail.ay); ctx.restore();
  // far arm
  const arms = o.arms || [0.9, -0.9];
  ctx.save(); ctx.translate(2, 5); ctx.rotate(arms[1]);
  ctx.drawImage(CH.otterArm.c, -1, -CH.otterArm.ay); ctx.restore();
  // torso
  const torso = CH.otterTorso;
  ctx.drawImage(torso.c, -torso.ax, -torso.ay);
  // near arm
  ctx.save(); ctx.translate(2, -5); ctx.rotate(arms[0]);
  ctx.drawImage(CH.otterArm.c, -1, -CH.otterArm.ay); ctx.restore();
  // head
  ctx.save(); ctx.translate(2 + (o.headX || 0), -9 + (o.headY || 0)); ctx.rotate(o.headR || 0);
  const head = otterHeadWithFace(o.exp || 'pain', o.blink || false, t, false);
  ctx.drawImage(head, -CH.otterHead.ax, -CH.otterHead.ay);
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// =========================================================================
//  PART 2 ART — side view.
// =========================================================================

// ------------------------------------------------- the manatee, side view
const ML = 126;                                   // her length in pixels
// Feature anchors on her flank, in FINAL screen-local pixels relative to her
// centre.  She lies facing LEFT, back to the top of the frame.
const MA = {
  eye:    [-47, -9],
  mouth:  [-56,  7],
  wound:  [-14,-16],   // the gash he stitches, running down her shoulder
  plate:  [ 10,-25],   // where the torn steel plate goes back on
  strap:  [ 32,-17],   // the harness strap, bolted back down
  band:   [ 52, -6],   // the bandage, around the tail stock
  chest:  [-30,-14],   // where he presses to pump the water out
  tailX:  [ 30,  0],
  shoX:   [-30, 17],
};
function buildManateeSide() {
  const L = ML, W = R(L) + 10, H = R(L * 0.58) + 10, cy = H / 2;
  const U = u => 5 + u * L, V = v => cy + v * L;
  const lobes = [
    { x: U(0.030), y: V(0.004), rx: L * 0.075, ry: L * 0.058 },
    { x: U(0.120), y: V(0.006), rx: L * 0.090, ry: L * 0.095 },
    { x: U(0.225), y: V(0.010), rx: L * 0.105, ry: L * 0.150 },
    { x: U(0.345), y: V(0.014), rx: L * 0.126, ry: L * 0.194 },
    { x: U(0.470), y: V(0.016), rx: L * 0.136, ry: L * 0.212 },
    { x: U(0.590), y: V(0.012), rx: L * 0.131, ry: L * 0.206 },
    { x: U(0.700), y: V(0.004), rx: L * 0.119, ry: L * 0.182 },
    { x: U(0.795), y: V(-0.008), rx: L * 0.101, ry: L * 0.149 },
    { x: U(0.875), y: V(-0.018), rx: L * 0.083, ry: L * 0.119 },
    { x: U(0.938), y: V(-0.010), rx: L * 0.063, ry: L * 0.093 },
    { x: U(0.982), y: V(0.014), rx: L * 0.043, ry: L * 0.067 },
  ];
  const f = blobField(W, H, lobes);
  const o = shadeBlob(W, H, f, DP.man, { outline: DP.ink, lx: -0.30, ly: -0.90, contrast: 0.52, lift: 0.10, smooth: 3 });
  const ctx = o.ctx;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0;
  // pale belly
  for (let x = 0; x < W; x++) {
    let y0 = -1, y1 = -1;
    for (let y = 0; y < H; y++) if (f[y * W + x] > 0) { if (y0 < 0) y0 = y; y1 = y; }
    if (y0 < 0 || y1 - y0 < 4) continue;
    const hgt = y1 - y0;
    for (let y = y0 + 1; y < y1; y++) {
      const k = (y - y0) / hgt; if (k < 0.60) continue;
      const g = (k - 0.60) / 0.40 * 3;
      let gi = Math.floor(g); if (g - gi > bay(x, y)) gi++;
      if (gi <= 0) continue;
      P(ctx, DP.belly[Math.min(2, gi - 1)], x, y);
    }
  }
  // transverse folds
  for (const u of [0.30, 0.56, 0.79]) {
    const fx = R(U(u));
    for (let y = 0; y < H; y++) {
      const k = (y - cy) / (L * 0.21); if (k > 0.52) continue;
      const x = fx + R(Math.sin(k * 1.1) * L * 0.026);
      if (!inside(x, y) || !inside(x, y + 1) || !inside(x - 1, y) || !inside(x + 1, y)) continue;
      P(ctx, DP.man[1], x, y);
    }
  }
  // barnacles + algae on the back
  for (let y = 2; y < H - 2; y++) for (let x = 6; x < W - 6; x++) {
    if (!inside(x, y) || !inside(x, y - 1)) continue;
    const k = (y - cy) / (L * 0.2); if (k > -0.2) continue;
    if (hash2(x * 7, y * 13) > 0.977) P(ctx, '#3f5b4c', x, y, 1 + (x & 1), 1);
    else if (hash2(x * 11, y * 5) > 0.990) { P(ctx, DP.man[4], x, y); P(ctx, DP.man[0], x, y + 1); }
  }
  // old prop scars
  for (let i = 0; i < 4; i++) for (let j = 0; j < R(L * 0.08); j++) {
    const x = R(U(0.30 + i * 0.06)) + j, y = R(V(-0.12)) + j;
    if (inside(x, y)) P(ctx, i % 2 ? DP.man[4] : DP.belly[2], x, y);
  }
  // rivet sockets where the back plate belongs (bare, raw)
  for (let i = 0; i < 5; i++) {
    const x = R(U(0.46 + i * 0.022)), y = R(V(-0.185));
    if (inside(x, y)) { P(ctx, DP.ink, x, y, 2, 2); P(ctx, DP.blood[2], x, y + 1, 2, 1); }
  }
  // a heavy brow over the eye so her face reads at a distance
  for (let i = 0; i < 9; i++) P(ctx, DP.man[0], R(U(0.845)) + i, R(V(-0.100)) + R(Math.sin(i / 8 * 3.1) * -1));
  // snout: nostril, mouth crease, whiskers
  const nx = R(U(0.975)), ny = R(V(-0.050));
  P(ctx, DP.ink, nx, ny, Math.max(2, R(L * 0.022)), Math.max(2, R(L * 0.02)));
  const my = R(V(0.042)), wk = Math.max(1, R(L / 40));
  for (let i = 0; i < 4; i++) {
    P(ctx, DP.man[4], R(U(0.99)) - (i & 1), my - 3 - i * wk);
    P(ctx, DP.man[4], R(U(0.985)) - (i & 1), my + 3 + i * wk);
  }
  return { c: o.c, W: W, H: H, ax: 5 + L * 0.5, ay: cy, f: f };
}
function buildSideFluke(L) {
  const W = R(L * 0.30) + 4, H = R(L * 0.30) + 4, cy = H / 2;
  const f = blobField(W, H, [
    { x: W * 0.99, y: cy, rx: W * 0.10, ry: H * 0.13 },
    { x: W * 0.86, y: cy, rx: W * 0.12, ry: H * 0.15 },
    { x: W * 0.72, y: cy, rx: W * 0.13, ry: H * 0.19 },
    { x: W * 0.56, y: cy, rx: W * 0.15, ry: H * 0.27 },
    { x: W * 0.36, y: cy, rx: W * 0.19, ry: H * 0.39 },
    { x: W * 0.19, y: cy, rx: W * 0.17, ry: H * 0.45 },
    { x: W * 0.09, y: cy, rx: W * 0.10, ry: H * 0.36 },
  ]);
  const o = shadeBlob(W, H, f, DP.man, { outline: DP.ink, lx: -0.3, ly: -0.85, contrast: 0.5, lift: 0.08, smooth: 2 });
  for (let i = -2; i <= 2; i++) {
    if (!i) continue;
    for (let x = 3; x < W * 0.7; x++) {
      const y = R(cy + i * H * 0.10 + (W * 0.7 - x) * i * 0.035);
      if (y > 0 && y < H && f[y * W + x] > 0.06 && ((x + i) & 1) === 0) P(o.ctx, DP.man[1], x, y);
    }
  }
  return spr(o.c, W - 2, cy);
}
function buildSideFlipper(L, ramp) {
  const W = R(L * 0.30) + 3, H = R(L * 0.125) + 3, cy = H / 2;
  const f = blobField(W, H, [
    { x: W * 0.10, y: cy, rx: W * 0.16, ry: H * 0.44 },
    { x: W * 0.32, y: cy + H * 0.04, rx: W * 0.20, ry: H * 0.42 },
    { x: W * 0.55, y: cy + H * 0.08, rx: W * 0.20, ry: H * 0.36 },
    { x: W * 0.76, y: cy + H * 0.12, rx: W * 0.17, ry: H * 0.28 },
    { x: W * 0.90, y: cy + H * 0.14, rx: W * 0.10, ry: H * 0.20 },
  ]);
  const o = shadeBlob(W, H, f, ramp, { outline: DP.ink, contrast: 0.55, lift: 0.06, smooth: 1 });
  for (let i = 0; i < 3; i++) P(o.ctx, ramp[4], R(W * 0.84) + i, R(cy + H * 0.06) + i);
  return spr(o.c, 2, cy);
}

// --------------------------------------------------- the otter, side view
function buildOtterSide() {
  const F = DP.fur;
  // body: a sea otter up on his haunches, hunched over his work.
  // The body axis is near-vertical so he reads as sitting up, not sprawled.
  const W = 42, H = 42;
  const f = blobField(W, H, [
    { x: 24, y: 33, rx: 8.0, ry: 3.4 },     // hind foot, planted forward
    { x: 15, y: 29, rx: 7.2, ry: 6.8 },     // haunch
    { x: 17, y: 23, rx: 7.0, ry: 7.2 },     // belly
    { x: 19, y: 17, rx: 6.8, ry: 7.4 },     // chest
    { x: 21, y: 12, rx: 5.4, ry: 5.8 },     // shoulders
    { x: 23, y: 8,  rx: 3.6, ry: 4.0 },     // neck
  ]);
  const o = shadeBlob(W, H, f, F, { outline: DP.ink, contrast: 0.6, lift: 0.14, smooth: 2 });
  // pale throat and belly down the front (the right-hand side of the form)
  for (let y = 4; y < H - 3; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < W; x++) if (f[y * W + x] > 0) { if (x0 < 0) x0 = x; x1 = x; }
    if (x0 < 0 || x1 - x0 < 4) continue;
    for (let x = x0 + 1; x < x1; x++) { const k = (x - x0) / (x1 - x0); if (k > 0.72 && y < 31) P(o.ctx, k > 0.88 ? DP.cream : DP.creamD, x, y); }
  }
  // haunch crease, and toes on the hind foot
  for (let i = 0; i < 9; i++) P(o.ctx, F[0], 13 + R(i * 0.6), 24 + i);
  for (let i = 0; i < 4; i++) { P(o.ctx, DP.ink, 24 + i * 3, 32, 1, 4); P(o.ctx, F[1], 25 + i * 3, 33, 2, 2); }
  P(o.ctx, DP.ink, 17, 35, 15, 1);
  // bandolier across the chest
  for (let i = 0; i < 13; i++) { const x = 14 + R(i * 0.7), y = 24 - i; if (y > 2 && f[y * W + x] > 0.1) { P(o.ctx, DP.lea[1], x, y, 3, 1); P(o.ctx, DP.lea[3], x, y, 1, 1); } }
  P(o.ctx, DP.gold[1], 19, 17, 3, 3); P(o.ctx, DP.gold[3], 19, 17, 3, 1);
  A.oBody = spr(o.c, 19, 20);

  // head + tricorn
  const HW = 30, HH = 28;
  const hf = blobField(HW, HH, [
    { x: 12, y: 16, rx: 8.6, ry: 8.2 },
    { x: 18, y: 18, rx: 6.2, ry: 5.4 },
    { x: 23, y: 19, rx: 3.8, ry: 3.4 },
  ]);
  const ho = shadeBlob(HW, HH, hf, F, { outline: DP.ink, contrast: 0.6, lift: 0.18, smooth: 2 });
  const hx = ho.ctx;
  P(hx, DP.ink, 5, 8, 7, 7); P(hx, F[1], 6, 9, 5, 5); P(hx, F[0], 7, 10, 3, 3);   // ear
  P(hx, DP.ink, 16, 16, 9, 7); P(hx, DP.cream, 16, 17, 8, 5); P(hx, DP.creamD, 16, 21, 8, 1);  // muzzle pad
  for (let i = 0; i < 6; i++) P(hx, '#f0e0bd', 9 + i, 8 + i);
  A.oHeadBare = spr(ho.c, 12, 17);
  // hatted version
  const hc = can(HW, HH), hxc = cx2(hc); hxc.drawImage(ho.c, 0, 0);
  stamp(hxc, [
    '...kkkkkkkkk...',
    '.kkxxxxxxxxxkk.',
    'kxxhhhhhhhhhxxk',
    'kxhhhhHHHhhhhxk',
    'kxhhhhhhhhhhhxk',
    'kkxxhhhhhhhxxkk',
    '.kkxxxxxxxxxkk.',
    '..kkkkkkkkkkk..',
  ], 1, 0, { k: DP.ink, h: CPAL.hat, x: CPAL.hatD, H: CPAL.hatL, X: CPAL.hatLL });
  P(hxc, '#9aa4ab', 2, 6, 13, 1);
  P(hxc, DP.ink, 14, 0, 2, 3); P(hxc, CPAL.hatLL, 13, 1, 3, 2);
  P(hxc, '#c4202c', 4, 4, 4, 1);
  A.oHead = spr(hc, 12, 17);
  // hat on its own, for the moment he takes it off
  const tc = can(18, 10), tx = cx2(tc);
  stamp(tx, [
    '...kkkkkkkkk...',
    '.kkxxxxxxxxxkk.',
    'kxxhhhhhhhhhxxk',
    'kxhhhhHHHhhhhxk',
    'kxhhhhhhhhhhhxk',
    'kkxxhhhhhhhxxkk',
    '.kkxxxxxxxxxkk.',
    '..kkkkkkkkkkk..',
  ], 1, 1, { k: DP.ink, h: CPAL.hat, x: CPAL.hatD, H: CPAL.hatL, X: CPAL.hatLL });
  A.hatSide = spr(tc, 9, 5);

  // arm
  const AW = 16, AH = 8;
  const af = blobField(AW, AH, [{ x: 3, y: 4, rx: 3.4, ry: 3.4 }, { x: 8, y: 4.2, rx: 3.6, ry: 2.8 }, { x: 13, y: 4.6, rx: 2.8, ry: 2.5 }]);
  const ao = shadeBlob(AW, AH, af, F, { outline: DP.ink, lift: 0.14, smooth: 1 });
  P(ao.ctx, DP.cream, 12, 3, 3, 3);
  A.oArm = spr(ao.c, 2, 4);
  // darker far arm
  A.oArmFar = spr((function () { const c = can(AW, AH), x = cx2(c); x.drawImage(ao.c, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(10,8,16,0.42)'; x.fillRect(0, 0, AW, AH); return c; })(), 2, 4);

  // tail
  const TW = 24, TH = 12;
  const tf = blobField(TW, TH, [{ x: 4, y: 6, rx: 5.6, ry: 5.6 }, { x: 11, y: 6, rx: 5.4, ry: 4.4 }, { x: 17, y: 6, rx: 4.4, ry: 3.0 }, { x: 22, y: 6, rx: 2.8, ry: 1.8 }]);
  const to = shadeBlob(TW, TH, tf, F, { outline: DP.ink, lift: 0.14, smooth: 1 });
  A.oTail = spr(to.c, 2, 6);

  A.oEye = [-4, -6]; A.oNose = [9, -1];           // relative to the head anchor
}

function otterSideFace(ctx, exp, blink, t) {
  const ink = DP.ink, ex = A.oEye[0], ey = A.oEye[1], nx = A.oNose[0], ny = A.oNose[1];
  const shut = blink || exp === 'shut' || exp === 'grieve';
  if (shut) {
    P(ctx, ink, ex - 1, ey + 1, 5, 1); P(ctx, ink, ex + 7, ey + 1, 5, 1);
    if (exp === 'grieve') { P(ctx, DP.fur[0], ex - 2, ey - 2, 6, 1); P(ctx, DP.fur[0], ex + 6, ey - 2, 6, 1); }
  } else {
    for (const dx of [0, 8]) {
      P(ctx, ink, ex + dx - 1, ey - 1, 6, 6);
      P(ctx, '#e9f0f4', ex + dx, ey, 4, 4);
      P(ctx, '#0b0b10', ex + dx + (exp === 'focus' ? 2 : 1), ey + 1, 2, 3);
      P(ctx, '#ffffff', ex + dx + 1, ey + 1, 1, 1);
    }
  }
  if (exp === 'focus' || exp === 'strain') { P(ctx, DP.fur[0], ex - 2, ey - 3, 6, 2); P(ctx, DP.fur[0], ex + 7, ey - 3, 6, 2); P(ctx, ink, ex, ey - 2, 5, 1); P(ctx, ink, ex + 8, ey - 2, 4, 1); }
  if (exp === 'joy') { P(ctx, DP.fur[0], ex - 2, ey - 4, 6, 1); P(ctx, DP.fur[0], ex + 7, ey - 4, 6, 1); }
  P(ctx, ink, nx - 1, ny - 1, 4, 3); P(ctx, '#2a1a10', nx, ny - 1, 2, 1);
  const talk = exp === 'talk' && (Math.floor(t * 8) & 1);
  if (talk || exp === 'shout') { P(ctx, ink, nx - 4, ny + 3, 7, 5); P(ctx, '#4a1420', nx - 3, ny + 4, 5, 3); }
  else if (exp === 'joy') { P(ctx, ink, nx - 5, ny + 3, 8, 1); P(ctx, ink, nx + 3, ny + 2, 1, 1); P(ctx, '#e9f0f4', nx - 4, ny + 4, 6, 1); P(ctx, ink, nx - 4, ny + 5, 6, 1); }
  else if (exp === 'grieve') { P(ctx, ink, nx - 5, ny + 4, 7, 1); P(ctx, ink, nx - 6, ny + 3, 1, 1); }
  else P(ctx, ink, nx - 4, ny + 3, 6, 1);
  P(ctx, '#f0e0bd', nx + 2, ny - 2, 5, 1); P(ctx, '#f0e0bd', nx + 2, ny + 1, 5, 1);
}

// o: {x,y,flip,rot,s,armNear,armFar,headR,headX,headY,exp,blink,hat,crouch}
function drawOtterSide(ctx, o, t) {
  ctx.save();
  ctx.translate(R(o.x), R(o.y));
  if (o.flip) ctx.scale(-1, 1);
  ctx.rotate(o.rot || 0);
  const s = o.s || 1; ctx.scale(s, s);
  const ph = o.phase || 0;
  ctx.save(); ctx.translate(-8, 11); ctx.rotate(3.3 + Math.sin(ph) * 0.18);
  ctx.drawImage(A.oTail.c, -A.oTail.ax, -A.oTail.ay); ctx.restore();
  // far arm
  ctx.save(); ctx.translate(3, -1); ctx.rotate(o.armFar === undefined ? 0.7 : o.armFar);
  ctx.drawImage(A.oArmFar.c, -A.oArmFar.ax, -A.oArmFar.ay);
  if (o.toolFar) o.toolFar(ctx);
  ctx.restore();
  ctx.drawImage(A.oBody.c, -A.oBody.ax, -A.oBody.ay);
  // near arm (holds the tool)
  ctx.save(); ctx.translate(8, -2); ctx.rotate(o.armNear === undefined ? 0.35 : o.armNear);
  ctx.drawImage(A.oArm.c, -A.oArm.ax, -A.oArm.ay);
  if (o.tool) o.tool(ctx);
  ctx.restore();
  // head
  ctx.save(); ctx.translate(6 + (o.headX || 0), -18 + (o.headY || 0));
  ctx.rotate(o.headR || 0);
  const H = o.hat === false ? A.oHeadBare : A.oHead;
  ctx.drawImage(H.c, -H.ax, -H.ay);
  otterSideFace(ctx, o.exp || 'idle', o.blink, t);
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------------ tools
function buildTools() {
  { const c = can(15, 9), x = cx2(c);             // hammer
    P(x, DP.ink, 0, 3, 11, 3); P(x, DP.lea[2], 1, 4, 9, 1); P(x, DP.lea[3], 1, 4, 5, 1);
    P(x, DP.ink, 9, 0, 6, 9); P(x, DP.met[2], 10, 1, 4, 7); P(x, DP.met[3], 10, 1, 4, 2); P(x, DP.met[0], 10, 6, 4, 2);
    A.hammer = spr(c, 1, 4); }
  { const c = can(14, 8), x = cx2(c);             // wrench
    P(x, DP.ink, 0, 2, 11, 4); P(x, DP.met[2], 1, 3, 9, 2); P(x, DP.met[3], 1, 3, 9, 1);
    P(x, DP.ink, 9, 0, 5, 8); P(x, DP.met[2], 10, 1, 3, 6); P(x, DP.ink, 11, 2, 3, 3); P(x, DP.met[3], 10, 1, 3, 1);
    A.wrench = spr(c, 1, 4); }
  { const c = can(12, 6), x = cx2(c);             // curved needle
    for (let i = 0; i < 9; i++) P(x, DP.met[4], 1 + i, 3 - R(Math.sin(i / 8 * 3.14) * 2));
    P(x, DP.met[0], 9, 2); A.needle = spr(c, 1, 3); }
  { const c = can(10, 10), x = cx2(c);            // bandage roll
    ditherDisc(x, 5, 5, 4, 4, [DP.bandage[3], DP.bandage[2], DP.bandage[1], DP.ink]);
    for (let i = 0; i < 3; i++) P(x, DP.bandage[0], 2, 3 + i * 2, 6, 1);
    A.roll = spr(c, 5, 5); }
  { const c = can(22, 14), x = cx2(c);            // the steel back plate (part 2)
    for (let y = 0; y < 14; y++) for (let xx = 0; xx < 22; xx++) {
      const edge = y === 0 || y === 13 || xx === 0 || xx === 21;
      P(x, edge ? DP.ink : y < 3 ? DP.met[3] : y > 10 ? DP.met[0] : xx < 3 ? DP.met[1] : DP.met[2], xx, y);
    }
    for (let i = 0; i < 4; i++) { P(x, DP.met[4], 3 + i * 5, 2); P(x, DP.met[0], 3 + i * 5, 3); P(x, DP.met[4], 3 + i * 5, 10); P(x, DP.met[0], 3 + i * 5, 11); }
    A.platS = spr(c, 11, 7); }
  { const c = can(18, 26), x = cx2(c);            // a bucket, by the fire
    for (let i = 0; i < 11; i++) P(x, DP.ink, 3 + i, 7 - R(Math.sin(i / 10 * 3.14) * 6));   // handle
    P(x, DP.ink, 1, 7, 16, 19);
    for (let y = 8; y < 25; y++) {
      const inset = R((y - 8) * 0.16);
      P(x, DP.met[1], 2 + inset, y, 14 - inset * 2, 1);
      P(x, DP.met[2], 2 + inset, y, 4, 1);
      if (y > 20) P(x, DP.met[0], 2 + inset, y, 14 - inset * 2, 1);
    }
    P(x, DP.ink, 1, 7, 16, 2); P(x, DP.met[3], 2, 8, 14, 1);
    P(x, DP.met[0], 3, 13, 13, 1);
    P(x, '#1d2c33', 3, 9, 12, 3);                 // water in it
    A.bucket = spr(c, 9, 25); }
}

// -------------------------------------------------------- beach backdrop
const BG_N = 4;                                    // night -> dawn frames
function buildBeach() {
  A.bg = [];
  const HORIZON = 140, SANDY = 196;
  for (let fi = 0; fi < BG_N; fi++) {
    const k = fi / (BG_N - 1);
    const c = can(640, 360), x = cx2(c);
    // ---- sky: posterized bands, dithered at the seams
    const sky = DP.skyN.map((h, i) => mixHex(h, DP.skyD[i], k));
    for (let y = 0; y < HORIZON; y++) {
      const u = y / (HORIZON - 1);
      const fb = Math.pow(u, 0.72) * (sky.length - 1);
      let bi = Math.floor(fb); const fr = fb - bi;
      for (let px = 0; px < 640; px++) {
        // dawn light pools on the right-hand horizon
        const warm = Math.max(0, 1 - Math.hypot((px - 520) / 300, (y - HORIZON) / 150)) * k;
        let idx = bi + (fr > bay(px, y) ? 1 : 0);
        idx = Math.min(sky.length - 1, idx + (warm > 0.55 ? 1 : 0));
        let col = sky[idx];
        if (warm > 0.70) col = mixHex(col, '#e2a06a', qa((warm - 0.70) * 2.2));
        P(x, col, px, y);
      }
    }
    // ---- stars, fading as dawn comes
    const rng = new SeededRandom(9021);
    for (let i = 0; i < 150; i++) {
      const sx = R(rng.range(0, 640)), sy = R(rng.range(2, HORIZON - 26));
      const br = rng.next();
      if (br < k * 0.9) continue;
      const a = (1 - k) * (0.35 + br * 0.65);
      P(x, rgbaq('#dfe9f4', a), sx, sy);
      if (br > 0.95) { P(x, rgbaq('#ffffff', a * 0.7), sx - 1, sy); P(x, rgbaq('#ffffff', a * 0.7), sx + 1, sy); P(x, rgbaq('#ffffff', a * 0.7), sx, sy - 1); P(x, rgbaq('#ffffff', a * 0.7), sx, sy + 1); }
    }
    // ---- low moon, left
    if (k < 0.75) {
      const mx = 118, my = 52, ma = 1 - k / 0.75;
      ditherDisc(x, mx, my, 15, 15, [rgbaq('#f4f2e2', ma), rgbaq('#ded9c4', ma), rgbaq('#b9b39c', ma), rgbaq('#8b8674', ma * 0.7)]);
      for (const [cxp, cyp, cr] of [[-5, -4, 3], [4, 3, 4], [6, -6, 2], [-2, 6, 2]]) ditherDisc(x, mx + cxp, my + cyp, cr, cr, [rgbaq('#c9c4ae', ma * 0.8)]);
    }
    // ---- sea: horizontal bands with a dithered seam, brightest at the horizon
    const sea = DP.seaN.map((h, i) => mixHex(h, ['#0a0e1c', '#141b32', '#22263f', '#37304d', '#553c52'][i], k));
    for (let y = HORIZON; y < SANDY + 16; y++) {
      const u = (y - HORIZON) / (SANDY + 16 - HORIZON);
      const fb = (1 - Math.pow(u, 0.8)) * (sea.length - 1);
      let bi = Math.floor(fb); const fr = fb - bi;
      for (let px = 0; px < 640; px++) {
        const n = vnoise(px * 0.04, y * 0.12);
        const idx = Math.min(sea.length - 1, Math.max(0, bi + ((fr + (n - 0.5) * 0.5) > bay(px, y) ? 1 : 0)));
        P(x, sea[idx], px, y);
      }
    }
    // a glitter path under the moon / the dawn
    const gx = k < 0.5 ? 118 : 520;
    for (let i = 0; i < 260; i++) {
      const yy = R(HORIZON + Math.pow(hash2(i, 7), 1.6) * 54);
      const spread = 8 + (yy - HORIZON) * 2.6;
      const xx = R(gx + (hash2(i, 13) - 0.5) * spread * 2);
      if (xx < 0 || xx > 639) continue;
      P(x, rgbaq(k < 0.5 ? '#9fb6c8' : '#c08a6a', 0.25 + hash2(i, 19) * 0.45), xx, yy, 1 + (hash2(i, 23) > 0.7 ? 1 : 0), 1);
    }
    // distant headland, left
    const hl = mixHex('#080b14', '#141426', k);
    for (let px = 0; px < 232; px++) {
      const taper = clamp((232 - px) / 70, 0, 1);
      const h = R((10 + vnoise(px * 0.02, 3) * 18 + Math.max(0, 70 - px) * 0.30) * taper);
      if (h < 1) continue;
      P(x, hl, px, HORIZON - h, 1, h + 1);
      P(x, mixHex(hl, '#2a2c42', 0.5), px, HORIZON - h, 1, 1);
    }
    // a low dune and marram grass along the top of the beach, right
    for (let px = 430; px < 640; px++) {
      const h = R(6 + vnoise(px * 0.03, 8) * 12 + (px - 430) * 0.05);
      P(x, mixHex('#191423', '#2b2334', k), px, SANDY - h, 1, h);
      P(x, mixHex('#241d2e', '#3a2f3c', k), px, SANDY - h, 1, 1);
    }
    const grng = new SeededRandom(551);
    for (let i = 0; i < 90; i++) {
      const gx2 = R(grng.range(436, 638)), gh = R(grng.range(5, 13));
      const gy2 = SANDY - R(6 + vnoise(gx2 * 0.03, 8) * 12 + (gx2 - 430) * 0.05);
      for (let j = 0; j < gh; j++) P(x, j > gh - 3 ? '#3b4436' : '#232b24', gx2 + R(j * j * 0.05 * (grng.next() > 0.5 ? 1 : -1)), gy2 - j);
    }
    // ---- sand
    const sand = DP.sand.map((h, i) => mixHex(h, ['#221a1e', '#33272a', '#463539', '#5a4548', '#6e5652'][i] || h, k));
    for (let y = SANDY; y < 360; y++) {
      const u = (y - SANDY) / (360 - SANDY);
      for (let px = 0; px < 640; px++) {
        const n = vnoise(px * 0.05, y * 0.11) * 0.8 + vnoise(px * 0.2, y * 0.4) * 0.3;
        const fb = (2.6 - u * 2.0 + (n - 0.55) * 1.4);
        let bi = Math.floor(fb); if (fb - bi > bay(px, y)) bi++;
        P(x, sand[Math.max(0, Math.min(sand.length - 1, bi))], px, y);
      }
    }
    // wet sand band just below the surf
    for (let y = SANDY; y < SANDY + 26; y++) for (let px = 0; px < 640; px++) {
      const u = (y - SANDY) / 26;
      const n = vnoise(px * 0.03, 11);
      if (bay(px, y) < (1 - u) * 0.85 + (n - 0.5) * 0.3) P(x, mixHex(DP.sandW[Math.min(3, Math.floor(u * 4))], '#3a2b30', k * 0.5), px, y);
    }
    // pebbles, shells and weed
    const prng = new SeededRandom(3311);
    for (let i = 0; i < 260; i++) {
      const px = R(prng.range(0, 640)), py = R(prng.range(SANDY + 6, 360));
      const r = prng.range(0.8, 2.6);
      const dark = prng.next() > 0.5;
      ditherDisc(x, px, py, r, r * 0.7, dark ? ['#4b3f4c', '#332a36', '#1c1620'] : ['#6c5c63', '#4a3f49', '#2b2430']);
      P(x, rgbaq('#000000', 0.35), px + 1, py + 2, Math.max(1, R(r)), 1);
    }
    for (let i = 0; i < 26; i++) {
      const px = R(prng.range(0, 640)), py = R(prng.range(SANDY + 4, 356));
      for (let j = 0; j < 7; j++) P(x, prng.next() > 0.5 ? '#2c3a2c' : '#1d2a22', px + j, py + R(Math.sin(j * 0.9 + i) * 2));
    }
    A.bg.push(c);
  }
  A.HORIZON = HORIZON; A.SANDY = SANDY;

  // ---- driftwood log (drawn over the background)
  { const c = can(120, 34), x = cx2(c);
    for (let i = 0; i < 112; i++) {
      const h = 13 + R(Math.sin(i * 0.05 + 1.2) * 4 + vnoise(i * 0.08, 2) * 4);
      const y0 = 17 - R(h / 2);
      P(x, DP.ink, 4 + i, y0 - 1, 1, h + 2);
      for (let y = 0; y < h; y++) {
        const k = y / h;
        P(x, k < 0.22 ? DP.wood[3] : k < 0.6 ? DP.wood[2] : k < 0.85 ? DP.wood[1] : DP.wood[0], 4 + i, y0 + y);
      }
      if (hash2(i, 5) > 0.86) P(x, DP.wood[0], 4 + i, y0 + 3 + R(hash2(i, 9) * (h - 6)), 2, 1);
    }
    // broken ends and a stub branch
    P(x, DP.ink, 0, 10, 6, 14); P(x, '#3a2c33', 1, 11, 4, 12);
    P(x, DP.ink, 112, 9, 8, 15); P(x, '#3a2c33', 113, 10, 6, 13);
    for (let i = 0; i < 12; i++) P(x, i < 2 ? DP.ink : DP.wood[1], 62 + i, 8 - R(i * 0.7), 2, 2);
    A.log = spr(c, 60, 24); }

  // ---- fire: six posterized flame frames
  A.flame = [];
  for (let fr = 0; fr < 6; fr++) {
    const c = can(30, 40), x = cx2(c);
    const seed = 100 + fr * 37;
    for (let y = 0; y < 34; y++) {
      const u = 1 - y / 34;
      const wob = Math.sin(y * 0.30 + fr * 1.05) * (1 - u) * 4.2 + Math.sin(y * 0.12 + fr * 2.1) * 2;
      const w = Math.max(0, R((2 + Math.pow(u, 0.85) * 10) * (0.72 + vnoise(seed + y * 0.3, fr) * 0.55)));
      if (w < 1) continue;
      const cxp = 15 + R(wob * (1 - u) * 1.2);
      for (let dx = -w; dx <= w; dx++) {
        const q = Math.abs(dx) / w;
        let bi = 4 - Math.floor(q * 3.2 + (1 - u) * 0.6);
        if (q * 3.2 - Math.floor(q * 3.2) > bay(cxp + dx, y + fr)) bi--;
        bi = Math.max(0, Math.min(4, bi));
        P(x, DP.fire[bi], cxp + dx, 34 - y);
      }
    }
    // logs in the fire
    for (let i = 0; i < 22; i++) P(x, i % 5 === 0 ? '#1a1218' : '#30222a', 3 + i, 35 + R(Math.sin(i * 0.4) * 1), 2, 3);
    for (let i = 0; i < 16; i++) P(x, i % 4 === 0 ? '#2a1c20' : '#45313a', 7 + i, 33 + R(Math.cos(i * 0.5) * 1), 2, 3);
    for (let i = 0; i < 6; i++) P(x, DP.fire[(fr + i) % 2 ? 2 : 1], 6 + i * 3, 36, 2, 1);
    A.flame.push(spr(c, 15, 38));
  }
  // ---- firelight pool on the sand (three intensities)
  A.pool = [];
  for (let i = 0; i < 3; i++) {
    const c = can(260, 90), x = cx2(c);
    const a = 0.16 + i * 0.09;
    for (let y = 0; y < 90; y++) for (let px = 0; px < 260; px++) {
      const d = Math.hypot((px - 130) / 128, (y - 34) / 50);
      if (d >= 1) continue;
      const v = (1 - d) * (1 - d);
      if (v * 3.4 > bay(px, y) * 2.0) P(x, rgbaq(v > 0.55 ? '#ffb23c' : '#d4651c', qa(a + v * 0.30)), px, y);
    }
    A.pool.push(c);
  }
}

// ======================================================= scene particles
const FX = {
  l: [],
  clear() { this.l.length = 0; },
  add(o) { if (this.l.length < 420) this.l.push(o); },
  ember(x, y, n) { for (let i = 0; i < n; i++) this.add({ k: 'em', x: x + rand(-7, 7), y: y + rand(-4, 2), vx: rand(-9, 9), vy: rand(-46, -18), life: rand(0.7, 1.9), m: 1.9, s: rand() > 0.7 ? 2 : 1 }); },
  drop(x, y, n, col, up) { for (let i = 0; i < n; i++) { const a = rand(-2.6, -0.5); const sp = rand(30, 130) * (up || 1); this.add({ k: 'dr', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.35, 1.0), m: 1.0, col: col || DP.foam[2], s: randi(1, 2) }); } },
  spark(x, y, n) { for (let i = 0; i < n; i++) { const a = rand(0, TAU); const sp = rand(40, 180); this.add({ k: 'sp', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.12, 0.34), m: 0.34, col: pick([DP.fire[4], DP.fire[3], '#ffffff']) }); } },
  bub(x, y, n) { for (let i = 0; i < n; i++) this.add({ k: 'bu', x: x + rand(-6, 6), y: y + rand(-4, 4), vx: rand(-6, 6), vy: rand(-26, -9), life: rand(0.5, 1.3), m: 1.3, s: randi(1, 2) }); },
  gore(x, y, n) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), sp = rand(20, 110); this.add({ k: 'go', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, life: rand(0.6, 1.6), m: 1.6, col: DP.blood[randi(2, 5)], s: randi(1, 3) }); } },
  update(dt) {
    const l = this.l;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i]; p.life -= dt;
      if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'em') { p.vy += 6 * dt; p.vx += Math.sin(p.y * 0.14 + p.x * 0.05) * 26 * dt; }
      else if (p.k === 'dr' || p.k === 'go') { p.vy += 420 * dt; }
      else if (p.k === 'sp') { p.vx *= 0.9; p.vy *= 0.9; }
      else if (p.k === 'bu') { p.vy *= 0.97; }
    }
  },
  render(ctx, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    for (const p of this.l) {
      const a = p.life / p.m, sx = R(p.x + ox), sy = R(p.y + oy);
      switch (p.k) {
        case 'em': P(ctx, a > 0.6 ? DP.fire[4] : a > 0.3 ? DP.fire[3] : DP.fire[1], sx, sy, p.s, p.s); break;
        case 'dr': P(ctx, p.col, sx, sy, p.s, p.s); break;
        case 'go': P(ctx, p.col, sx, sy, p.s, p.s); break;
        case 'sp': P(ctx, p.col, sx, sy); break;
        case 'bu': ctx.fillStyle = rgbaq('#d6ecf8', qa(a * 0.8)); ctx.fillRect(sx, sy, p.s, p.s); ctx.fillStyle = rgbaq('#ffffff', qa(a * 0.5)); ctx.fillRect(sx, sy, 1, 1); break;
      }
    }
  },
};

// =========================================================================
//  TIMINGS
// =========================================================================
// part 1 — the sinking
const K1 = {
  impact: 0.00, limp: 0.35, roll: 1.05, swim: 1.90,
  grab: 3.35, haul: 3.85, sink: 5.30, under: 6.55, fade: 6.95, end: 7.70,
};
// part 2 — the shore
const K2 = {
  drag: 0.00, hammer: 1.25, stitch: 2.55, bolt: 3.75, band: 4.65,
  pump: 5.55, listen: 7.05, grieve: 7.95, cough: 9.00, rise: 9.80,
  surf: 10.80, fade: 11.85, end: 12.45,
};
const HER = { x: 342, y: 256, feet: 324 };
const SHORE_LINES = [
  [0.45, 2.7, 'he would not let go.'],
  [5.70, 1.6, 'breathe, you stubborn old cow.'],
  [8.15, 1.4, 'not like this. not tonight.'],
  [9.95, 1.8, '...aye. again, then.'],
];

// =========================================================================
//  THE SCENE
// =========================================================================
const DeathScene = {
  phase: 'done', done: true, worldActive: false,
  t: 0, x: 0, y: 0, facing: 1,
  // part 1 actors
  man: null, ott: null, stains: null, junk: null,
  zoom: 1, drain: 0, vign: 0, fade: 0, shake: 0,
  // part 2
  st: 0, stitches: 0, wraps: 0, plateOn: 0, bolted: 0, flare: 0, heart: 0,
  _sfx: 0,

  // ----------------------------------------------------------------- init
  init() {
    if (BUILT) return;
    if (typeof blobField !== 'function' || typeof shadeBlob !== 'function') return;
    buildTopArt();
    const mb = buildManateeSide();
    A.man = flipSprite(spr(mb.c, mb.ax, mb.ay));           // she faces LEFT
    A.fluke = flipSprite(buildSideFluke(ML));
    A.flip = flipSprite(buildSideFlipper(ML, DP.man));
    A.flipFar = flipSprite(buildSideFlipper(ML * 0.82, [DP.man[0], DP.man[0], DP.man[1], DP.man[1], DP.man[2]]));
    buildOtterSide();
    buildTools();
    buildBeach();
    BUILT = true;
  },

  // ---------------------------------------------------------------- start
  start(x, y, facing) {
    this.init();
    this.x = x || 0; this.y = y || 0; this.facing = facing || 1;
    this.t = 0; this.st = 0;
    this.phase = 'sinking'; this.done = false; this.worldActive = true;
    this.zoom = 1; this.drain = 0; this.vign = 0; this.fade = 0; this.shake = 8;
    this.stitches = 0; this.wraps = 0; this.plateOn = 0; this.bolted = 0; this.flare = 0; this.heart = 0;
    this._sfx = 0;
    FX.clear();
    this.stains = [];
    this.junk = [];
    const f = this.facing;
    this.man = { x: x, y: y, vx: -f * 26, vy: rand(-6, 6), tilt: 0, roll: 0, sink: 0, hurt: 1, alpha: 1 };
    this.ott = { x: x - f * 6, y: y - 4, vx: -f * 150 + rand(-40, 40), vy: rand(-120, 120), ang: 0, spin: rand(6, 11) * (Math.random() < 0.5 ? 1 : -1), s: rigScale() * 0.66, state: 'fly', exp: 'surprised', armA: 0.9, armB: -0.9, alpha: 1 };
    // the first, big gout
    for (let i = 0; i < 7; i++) this.stains.push({ x: x + rand(-14, 14), y: y + rand(-9, 9), r: rand(4, 8), max: rand(26, 52), vx: rand(-5, 5), vy: rand(-3, 3), a: 1 });
    for (let i = 0; i < 4; i++) this.junk.push({ s: i === 0 ? A.plate : i === 3 ? A.hatTop : A.strap, x: x + rand(-10, 10), y: y + rand(-8, 8), vx: rand(-90, 90), vy: rand(-70, 70), rot: rand(0, TAU), vr: rand(-5, 5), sink: 0 });
    try {
      if (typeof G !== 'undefined' && G && G.particles) { G.particles.blood(x, y, 6); G.particles.splash(x, y, 2.4); G.particles.bubbles(x, y, 10); }
      if (typeof Toon !== 'undefined') { Toon.impact(x, y, 2.2, '#ff8a8a'); Toon.burst(x, y, 1.7, '#c4202c'); Toon.shock(x, y, 110, 0.6, '#e8515a'); }
      if (typeof Gore !== 'undefined' && Gore.burst) Gore.burst(x, y, 2.2);
      if (typeof Audio_ !== 'undefined') { Audio_.hurt(); Audio_.splash(2); Audio_.tone(70, 1.4, 'sawtooth', 0.32, -40); }
    } catch (e) { /* the scene must never take the game down */ }
  },

  skip() {
    this.phase = 'done'; this.done = true; this.worldActive = false;
    this.fade = 1; this.drain = 0; FX.clear();
  },

  // --------------------------------------------------------------- update
  update(dt, t) {
    if (this.done) return;
    if (!BUILT) { this.init(); if (!BUILT) { this.done = true; this.phase = 'done'; this.worldActive = false; return; } }
    if (dt > 1 / 20) dt = 1 / 20;
    this._sfx -= dt;
    this.shake = Math.max(0, this.shake - dt * 22);
    if (this.phase === 'sinking') this.updateSink(dt, t);
    else if (this.phase === 'shore') this.updateShore(dt, t);
    FX.update(dt);
  },

  // ------------------------------------------------------- PART 1 : SINK
  updateSink(dt, t) {
    // the world slows to a crawl as she goes
    const slow = this.t < K1.limp ? 0.30 : this.t < K1.roll ? 0.55 : 1;
    const d = dt * slow;
    this.t += dt;
    const T = this.t, m = this.man, o = this.ott;

    // ---- the manatee
    m.x += m.vx * d; m.y += m.vy * d;
    m.vx *= (1 - 1.1 * d); m.vy *= (1 - 1.1 * d);
    m.hurt = Math.max(0, m.hurt - dt * 4);
    if (T > K1.limp) m.tilt = lerp(m.tilt, 0.42 * this.facing, Math.min(1, d * 1.4));
    if (T > K1.roll) m.roll = Math.min(0.5, m.roll + d * 0.34);                 // 0.5 -> fully belly-up
    if (T > K1.haul && T < K1.sink) {
      // he heaves: she lifts a hair, then sags back
      const q = (T - K1.haul) / (K1.sink - K1.haul);
      m.lift = Math.sin(q * 11) * (1 - q) * 2.6;
    } else m.lift = 0;
    if (T > K1.sink) {
      const q = (T - K1.sink) / (K1.under - K1.sink);
      m.sink = Math.min(1, q);
    }
    // blood keeps welling while she is above
    if (T < K1.sink + 0.6 && Math.random() < 0.6) {
      this.stains.push({ x: m.x + rand(-18, 18), y: m.y + rand(-11, 11), r: 2, max: rand(14, 38), vx: rand(-4, 4), vy: rand(-3, 3), a: 1 });
      try { if (typeof G !== 'undefined' && G && G.ocean) G.ocean.splatBlood(m.x, m.y, 0.5, 20); } catch (e) { }
    }
    for (const s of this.stains) {
      s.r = Math.min(s.max, s.r + d * 15);
      s.x += s.vx * d; s.y += s.vy * d; s.vx *= (1 - 0.7 * d); s.vy *= (1 - 0.7 * d);
      if (T > K1.sink) s.a = Math.max(0, s.a - dt * 0.4);
    }
    if (this.stains.length > 46) this.stains.splice(0, this.stains.length - 46);
    // loose gear settles and sinks
    for (const j of this.junk) {
      j.x += j.vx * d; j.y += j.vy * d; j.vx *= (1 - 2.4 * d); j.vy *= (1 - 2.4 * d);
      j.rot += j.vr * d; j.vr *= (1 - 2 * d);
      if (T > K1.sink + 0.4) j.sink = Math.min(1, j.sink + d * 0.55);
    }

    // ---- the otter
    if (o.state === 'fly') {
      o.x += o.vx * d; o.y += o.vy * d;
      o.vx *= (1 - 1.6 * d); o.vy *= (1 - 1.6 * d);
      o.ang += o.spin * d; o.spin *= (1 - 1.5 * d);
      if (T > K1.swim - 0.5) {
        o.state = 'daze';
        try { if (typeof G !== 'undefined' && G && G.particles) G.particles.splash(o.x, o.y, 1.1); } catch (e) { }
      }
    } else if (o.state === 'daze') {
      o.ang = angleLerp(o.ang, angleTo(o.x, o.y, m.x, m.y), Math.min(1, d * 5));
      if (T > K1.swim) {
        o.state = 'swim';
        try { if (typeof Toon !== 'undefined') Toon.emote(o.x + 8, o.y - 22, '!'); } catch (e) { }
      }
    } else if (o.state === 'swim') {
      const a = angleTo(o.x, o.y, m.x, m.y);
      o.ang = angleLerp(o.ang, a, Math.min(1, d * 8));
      const sp = 150;
      o.x += Math.cos(a) * sp * d; o.y += Math.sin(a) * sp * d;
      if (Math.random() < 0.55) { try { if (G && G.particles) G.particles.spray(o.x, o.y, o.ang + Math.PI, 1, 40); } catch (e) { } }
      if (T > K1.grab || dist(o.x, o.y, m.x, m.y) < 16) {
        o.state = 'hold';
        try {
          if (typeof Toon !== 'undefined') Toon.impact(o.x, o.y, 0.8, '#eaf8ff');
          if (typeof Audio_ !== 'undefined' && this._sfx <= 0) { this._sfx = 0.2; Audio_.splash(0.8); }
        } catch (e) { }
      }
    } else {
      // holding on: he clamps to her shoulder and strains
      const ang = angleTo(m.x, m.y, m.x - this.facing * 40, m.y - 8);
      const gx = m.x - this.facing * 38 * rigScale(), gy = m.y - 8 * rigScale();
      o.x = lerp(o.x, gx, Math.min(1, d * 9));
      o.y = lerp(o.y, gy, Math.min(1, d * 9)) + (T > K1.haul ? Math.sin(T * 11) * 1.4 : 0);
      o.ang = angleLerp(o.ang, ang + Math.PI, Math.min(1, d * 5));
      o.exp = T > K1.sink ? 'drown' : 'pain';
      const q = Math.sin(T * 11);
      o.armA = 2.1 + q * 0.30; o.armB = -2.1 - q * 0.30;
      if (T > K1.haul && this._sfx <= 0 && Math.random() < 0.05) { this._sfx = 0.5; try { Audio_.tone(150, 0.16, 'square', 0.1, -50); } catch (e) { } }
    }
    if (o.state !== 'hold') { o.exp = o.state === 'fly' ? 'surprised' : 'pain'; }
    if (T > K1.sink) {
      const q = (T - K1.sink) / (K1.under - K1.sink);
      o.sink = Math.min(1, q);
      if (Math.random() < 0.7) { try { if (G && G.particles) G.particles.bubbles(o.x + rand(-6, 6), o.y, 1); } catch (e) { } }
    } else o.sink = 0;

    // ---- camera push-in, colour drain, vignette, fade
    this.zoom = 1 + Math.pow(Math.min(1, T / K1.under), 0.8) * 0.85;
    this.drain = clamp((T - 0.35) / 3.6, 0, 1) * 0.52;
    this.vign = clamp((T - 0.5) / 3.2, 0, 1);
    if (T > K1.fade) this.fade = clamp((T - K1.fade) / (K1.end - K1.fade - 0.1), 0, 1);
    if (T >= K1.under) this.worldActive = this.fade < 0.995;

    if (T >= K1.end) {
      this.phase = 'shore'; this.st = 0; this.worldActive = false;
      this.fade = 1; this.drain = 0; this.vign = 0;
      FX.clear();
    }
  },

  // ------------------------------------------------------ PART 2 : SHORE
  updateShore(dt, t) {
    const T0 = this.st; this.st += dt; const T = this.st;
    // fire embers
    if (Math.random() < 0.55) FX.ember(120, 306, 1);
    this.flare = Math.max(0, this.flare - dt * 1.6);
    this.fade = T < 1.0 ? qa(1 - T / 1.0) : (T > K2.fade ? clamp((T - K2.fade) / (K2.end - K2.fade), 0, 1) : 0);

    const beat = (a, b) => T >= a && T < b;
    // hammering — one blow every 0.30s
    if (beat(K2.hammer, K2.stitch)) {
      const ph = (T - K2.hammer) % 0.30;
      if (ph < dt && T - K2.hammer > 0.12) {
        FX.spark(376, 250, 7);
        this.plateOn = Math.min(1, this.plateOn + 0.26);
        this.shake = 2.4;
        try { if (typeof Audio_ !== 'undefined') { Audio_.tone(900 + rand(-90, 90), 0.05, 'square', 0.12, -300); Audio_.noise(0.05, 0.1, 5000, 1200); } } catch (e) { }
      }
    }
    // stitching — a stitch every 0.19s
    if (beat(K2.stitch, K2.bolt)) {
      const n = Math.floor((T - K2.stitch) / 0.19);
      if (n > this.stitches) {
        this.stitches = Math.min(7, n);
        FX.gore(322, 246, 2);
        try { if (typeof Audio_ !== 'undefined') Audio_.tone(420, 0.04, 'triangle', 0.07, 180); } catch (e) { }
      }
    }
    // bolting the harness
    if (beat(K2.bolt, K2.band)) {
      this.bolted = clamp((T - K2.bolt) / 0.8, 0, 1);
      if (Math.floor(T * 7) !== Math.floor(T0 * 7)) { FX.spark(410, 252, 2); try { Audio_.tone(260, 0.07, 'square', 0.06, 60); } catch (e) { } }
    }
    // bandaging
    if (beat(K2.band, K2.pump)) this.wraps = clamp((T - K2.band) / 0.75, 0, 1);
    // pumping the water out — a press every 0.42s
    if (beat(K2.pump, K2.listen)) {
      const ph = (T - K2.pump) % 0.42;
      if (ph < dt && T - K2.pump > 0.1) {
        this.shake = 3.2;
        FX.drop(232, 268, 9, '#bfe0ea', 1);
        FX.drop(232, 268, 4, '#7ea6b4', 0.7);
        try { if (typeof Audio_ !== 'undefined') { Audio_.noise(0.14, 0.16, 900, 120); Audio_.tone(110, 0.1, 'sine', 0.12, -30); } } catch (e) { }
      }
    }
    // she comes back
    if (T >= K2.cough && T0 < K2.cough) {
      this.flare = 1; this.shake = 6;
      FX.drop(224, 264, 26, '#cfe8f2', 1.4);
      FX.spark(120, 300, 22);
      try {
        if (typeof Audio_ !== 'undefined') { Audio_.noise(0.5, 0.3, 700, 90); Audio_.tone(90, 0.5, 'sawtooth', 0.25, 70); }
      } catch (e) { }
    }
    if (T >= K2.cough && T < K2.rise) {
      this.heart = 1;
      if (Math.floor(T * 5) !== Math.floor(T0 * 5)) FX.drop(226, 266, 4, '#a8cddc', 0.8);
    }
    if (beat(K2.surf, K2.end) && Math.random() < 0.5) FX.drop(rand(300, 470), 214, 2, DP.foam[2], 0.6);
    if (T >= K2.end) { this.done = true; this.phase = 'done'; this.worldActive = false; }
  },

  // =======================================================================
  //  RENDER — part 1, in WORLD space
  // =======================================================================
  renderWorld(ctx, cam, t) {
    if (!BUILT || this.phase !== 'sinking' || !this.worldActive) return;
    if (!cam) cam = { x: 0, y: 0 };
    const m = this.man, o = this.ott, T = this.t;
    const cx = m.x - cam.x, cy = m.y - cam.y;
    const fx = (m.x + o.x) / 2 - cam.x, fy = (m.y + o.y) / 2 - cam.y;
    if (cx < -400 || cy < -400 || cx > 1040 || cy > 760) return;   // generous cull

    ctx.save();
    // camera push-in, centred on her
    const z = this.zoom;
    ctx.translate(R(fx), R(fy)); ctx.scale(z, z); ctx.translate(-R(fx), -R(fy));

    // ---- blood on the water, under everything
    for (const s of this.stains) {
      const sx = s.x - cam.x, sy = s.y - cam.y;
      if (sx < -120 || sy < -120 || sx > 760 || sy > 480) continue;
      ctx.globalAlpha = qa(s.a * 0.98);
      const bd = A.bloodDisc[clamp(Math.round((s.r - 4) / 4), 0, A.bloodDisc.length - 1)];
      ctx.drawImage(bd.c, R(sx) - bd.ax, R(sy) - bd.ay);
      ctx.globalAlpha = 1;
    }
    // a dark deep-water hole opening beneath her as she goes down
    if (m.sink > 0) {
      ctx.globalAlpha = qa(m.sink * 0.85);
      const dd = A.darkDisc[clamp(Math.round(((26 + m.sink * 40) - 8) / 8), 0, A.darkDisc.length - 1)];
      ctx.drawImage(dd.c, R(cx) - dd.ax, R(cy + 6) - dd.ay);
      ctx.globalAlpha = 1;
    }

    // ---- loose gear
    for (const j of this.junk) {
      const sx = j.x - cam.x, sy = j.y - cam.y;
      ctx.save(); ctx.globalAlpha = qa(1 - j.sink * 0.8);
      ctx.translate(R(sx), R(sy)); ctx.rotate(j.rot);
      const s = 1 - j.sink * 0.45; ctx.scale(s, s);
      ctx.drawImage(j.s.c, -j.s.ax, -j.s.ay);
      ctx.restore(); ctx.globalAlpha = 1;
    }

    // ---- her
    if (typeof CH !== 'undefined' && CH.manateeArmor) {
      ctx.save();
      const sk = 1 - m.sink * 0.30;
      ctx.globalAlpha = qa(1 - m.sink * 0.50);
      const RS = rigScale() * sk;
      ctx.translate(R(cx), R(cy - (m.lift || 0) + m.sink * 5));
      ctx.scale(RS, RS);
      drawManateeTop(ctx, 0, 0, {
        facing: this.facing, tilt: m.tilt, roll: m.roll,
        hurt: m.hurt > 0 && (Math.floor(t * 30) & 1) === 0,
        slack: Math.sin(t * 1.4) * 0.12,
      });
      ctx.restore();
      ctx.globalAlpha = 1;
      // as she goes under, silhouette her against the dark
      if (m.sink > 0.35) {
        ctx.globalAlpha = qa((m.sink - 0.35) * 0.9);
        const sd = A.sinkDisc[clamp(Math.round((42 * (1 - m.sink * 0.3) - 14) / 6), 0, A.sinkDisc.length - 1)];
        ctx.drawImage(sd.c, R(cx) - sd.ax, R(cy + m.sink * 5) - sd.ay);
        ctx.globalAlpha = 1;
      }
    }

    // ---- him
    const ox = o.x - cam.x, oy = o.y - cam.y;
    const osk = 1 - (o.sink || 0) * 0.3;
    drawOtterTop(ctx, {
      x: ox, y: oy + (o.sink || 0) * 4, ang: o.ang, s: rigScale() * 0.66 * osk,
      exp: o.exp, arms: [o.armA === undefined ? 0.9 : o.armA, o.armB === undefined ? -0.9 : o.armB],
      alpha: 1 - (o.sink || 0) * 0.5,
      headR: o.state === 'hold' ? Math.sin(T * 9) * 0.12 : 0,
    }, t);
    // the grip: two knuckle-white paws on her harness
    if (o.state === 'hold') {
      const gx = R(lerp(ox, cx, 0.42)), gy = R(lerp(oy, cy, 0.42));
      P(ctx, DP.ink, gx - 2, gy - 3, 5, 3); P(ctx, '#f0e0bd', gx - 1, gy - 2, 3, 1);
      P(ctx, DP.ink, gx - 2, gy + 1, 5, 3); P(ctx, '#f0e0bd', gx - 1, gy + 2, 3, 1);
      // strain lines
      if ((Math.floor(t * 12) & 1) === 0) for (let i = 0; i < 3; i++) {
        const a = -1.0 + i * 1.0;
        LN(ctx, 'rgba(255,255,255,0.5)', ox + Math.cos(a) * 12, oy + Math.sin(a) * 12, ox + Math.cos(a) * 18, oy + Math.sin(a) * 18);
      }
    }
    ctx.restore();
  },

  // =======================================================================
  //  RENDER — full-screen overlay (part 1) and the whole shore (part 2)
  // =======================================================================
  renderScreen(ctx, t) {
    if (this.done && this.fade <= 0) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (this.phase === 'sinking') this.renderSinkOverlay(ctx, t);
    else if (this.phase === 'shore') this.renderShore(ctx, t);
    else if (this.fade > 0) { P(ctx, rgbaq('#000000', this.fade), 0, 0, 640, 360); }
    ctx.restore();
  },

  // ---- part 1 overlay: colour drains out, the frame closes in
  renderSinkOverlay(ctx, t) {
    // drain the colour
    if (this.drain > 0.02) {
      let ok = false;
      try {
        ctx.globalCompositeOperation = 'saturation';
        ok = ctx.globalCompositeOperation === 'saturation';
        if (ok) { ctx.globalAlpha = qa(this.drain); ctx.fillStyle = 'hsl(0,0%,50%)'; ctx.fillRect(0, 0, 640, 360); }
      } catch (e) { ok = false; }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (!ok) {                                        // dithered fallback wash
        ctx.fillStyle = rgbaq('#2a2e36', this.drain * 0.55);
        for (let y = 0; y < 360; y += 2) for (let x = (y >> 1) & 1; x < 640; x += 2) ctx.fillRect(x, y, 1, 1);
      }
      // a cold blue cast over the drained image
      P(ctx, rgbaq('#0a1424', this.drain * 0.30), 0, 0, 640, 360);
    }
    // blood-red bloom at the edges early on, then black vignette
    if (this.vign > 0.02) {
      const red = clamp(1 - this.t / 2.6, 0, 1);
      for (let i = 0; i < 12; i++) {
        const inset = i * 7;
        const a = qa(this.vign * (0.055 + i * 0.012));
        const col = red > 0.2 ? mixHex('#000000', '#3a0810', red * 0.8) : '#000000';
        ctx.fillStyle = rgbaq(col, a);
        ctx.fillRect(0, inset, 640, 1); ctx.fillRect(0, 359 - inset, 640, 1);
        ctx.fillRect(inset, 0, 1, 360); ctx.fillRect(639 - inset, 0, 1, 360);
      }
    }
    this.letterbox(ctx, clamp(this.t / 0.8, 0, 1));
    if (this.fade > 0) P(ctx, rgbaq('#000000', this.fade), 0, 0, 640, 360);
  },

  letterbox(ctx, k) {
    const h = R(26 * (k === undefined ? 1 : k));
    if (h <= 0) return;
    P(ctx, '#000000', 0, 0, 640, h);
    P(ctx, '#000000', 0, 360 - h, 640, h);
  },

  // ---- part 2: the beach
  renderShore(ctx, t) {
    const T = this.st;
    const sh = this.shake;
    ctx.save();
    if (sh > 0.3) ctx.translate(R(rand(-sh, sh)), R(rand(-sh, sh)));

    // ---------------------------------------------------------- backdrop
    const dawn = clamp((T - K2.pump) / (K2.end - K2.pump), 0, 1);
    const bi = Math.min(BG_N - 1, Math.floor(dawn * BG_N * 0.999));
    ctx.drawImage(A.bg[bi], 0, 0);

    // ---------------------------------------------------------- the surf
    this.drawSurf(ctx, T);

    // -------------------------------------------------------- driftwood
    ctx.globalAlpha = 0.45; ctx.drawImage(A.logShadow.c, 522 - A.logShadow.ax, 258 - A.logShadow.ay); ctx.globalAlpha = 1;
    ctx.drawImage(A.log.c, 520 - A.log.ax, 252 - A.log.ay);
    ctx.drawImage(A.bucket.c, 188 - A.bucket.ax, 336 - A.bucket.ay);

    // ------------------------------------------------------------- fire
    const fireUp = 0.62 + (this.flare * 0.5) + (T > K2.listen && T < K2.cough ? -0.26 : 0) + Math.sin(T * 7.3) * 0.06;
    const pi = clamp(Math.floor(fireUp * 3), 0, 2);
    const pool = A.pool[pi];
    ctx.globalAlpha = qa(clamp(fireUp, 0.2, 1));
    ctx.drawImage(pool, 120 - 130, 312 - 34);
    ctx.globalAlpha = 1;
    const fl = A.flame[Math.floor(T * 14) % A.flame.length];
    ctx.save();
    const fs = clamp(fireUp * 1.25, 0.45, 1.45);
    ctx.translate(120, 314); ctx.scale(1, fs);
    ctx.drawImage(fl.c, -fl.ax, -fl.ay);
    ctx.restore();

    // ------------------------------------------- her, lying on the sand
    this.drawHer(ctx, T, t);

    // ------------------------------------------------------------- him
    this.drawHim(ctx, T, t);

    // ----------------------------------------------------------- sparks
    FX.render(ctx, 0, 0);

    // a night vignette so the fire is the only warm thing in the frame
    for (let i = 0; i < 14; i++) {
      const inset = i * 6, a = qa(0.10 - i * 0.006);
      if (a <= 0) break;
      ctx.fillStyle = rgbaq('#04060e', a);
      ctx.fillRect(0, inset, 640, 1); ctx.fillRect(0, 359 - inset, 640, 1);
      ctx.fillRect(inset, 0, 1, 360); ctx.fillRect(639 - inset, 0, 1, 360);
    }
    ctx.restore();

    // ------------------------------------------------------------- text
    this.letterbox(ctx, 1);
    for (const [at, dur, line] of SHORE_LINES) {
      if (T < at || T > at + dur + 1.4) continue;
      const prog = T - at;
      const n = Math.max(0, Math.min(line.length, Math.floor(prog * 34)));
      const shown = line.slice(0, n);
      const a = T > at + dur ? qa(1 - (T - at - dur) / 1.4) : 1;
      ctx.globalAlpha = a;
      pixelTextOutlined(ctx, shown, 320, 344, 8, '#e8eef4', '#000000', 'center');
      if (n < line.length && (Math.floor(prog * 8) & 1)) P(ctx, '#e8eef4', 320 + R(textWidth(shown, 8) / 2) + 2, 345, 4, 7);
      ctx.globalAlpha = 1;
    }
    if (T < 1.4) {
      ctx.globalAlpha = qa(clamp((T - 0.7) / 0.6, 0, 1) * clamp((1.4 - T) / 0.3, 0, 1));
      pixelTextOutlined(ctx, 'SOMEWHERE ON THE SHORE', 320, 20, 7, '#8ea4b8', '#000000', 'center');
      ctx.globalAlpha = 1;
    }
    if (this.fade > 0) P(ctx, rgbaq('#000000', this.fade), 0, 0, 640, 360);
  },

  // ---- rolling surf on the sand -----------------------------------------
  drawSurf(ctx, T) {
    const SY = A.SANDY, HZ = A.HORIZON;
    // swell lines out on the water, smaller and denser toward the horizon
    for (let i = 0; i < 7; i++) {
      const u = i / 6;
      const y = R(HZ + 3 + Math.pow(u, 1.6) * (SY - HZ - 16) + Math.sin(T * 0.6 + i * 1.7) * 1.4);
      for (let x = 0; x < 640; x++) {
        const n = vnoise(x * 0.022 + T * (0.18 + u * 0.3), i * 4.1);
        if (n > 0.70 - u * 0.10) P(ctx, rgbaq(DP.foam[u > 0.6 ? 2 : 1], 0.35 + u * 0.35), x, y, 1 + (n > 0.84 ? 2 : 0), 1);
      }
    }
    // three breakers rolling up the sand, each on its own cycle
    for (let w = 0; w < 3; w++) {
      const per = 4.1 + w * 0.9, ph = ((T + w * 1.5) % per) / per;
      const reach = Math.pow(Math.sin(ph * Math.PI), 0.7);
      const base = SY - 30 + w * 12;
      const y0 = base + reach * (20 + w * 7);
      const bright = 0.45 + reach * 0.55;
      for (let x = 0; x < 640; x++) {
        // the crest is broken up so it never reads as one straight stripe
        const n = vnoise(x * 0.015 + w * 5, T * 0.25 + w);
        const gap = vnoise(x * 0.008 + w * 11, T * 0.1);
        const wob = Math.sin(x * 0.031 + T * (1.2 + w * 0.35) + w * 2) * 3.0 + (n - 0.5) * 7;
        const y = R(y0 + wob);
        if (gap < 0.30) continue;                      // the crest goes flat here
        const thick = 1 + (n > 0.58 ? 1 : 0) + (n > 0.78 ? 1 : 0);
        ctx.fillStyle = rgbaq(DP.foam[3], qa(bright));
        ctx.fillRect(x, y, 1, thick);
        ctx.fillStyle = rgbaq(DP.foam[2], qa(bright * 0.8));
        ctx.fillRect(x, y + thick, 1, 1);
        // the thin wash running up the sand behind the crest
        const run = R(reach * (12 + w * 5));
        for (let q = 1; q < run; q++) {
          const a = (1 - q / run) * 0.55 * bright;
          if (bay(x, y + q) < a) { ctx.fillStyle = rgbaq(DP.foam[q > run * 0.6 ? 0 : 1], qa(a + 0.25)); ctx.fillRect(x, y + thick + q, 1, 1); }
        }
        // the dark, wet lip in front of it
        if (n > 0.45) { ctx.fillStyle = rgbaq('#0a1522', 0.45); ctx.fillRect(x, y - 1, 1, 1); }
      }
    }
  },

  // ---- the manatee on the sand ------------------------------------------
  drawHer(ctx, T, t) {
    // dragged the last few feet at the start, back into the surf at the end
    const dragK = clamp((T - K2.drag) / 1.25, 0, 1);
    const goK = T > K2.surf ? clamp((T - K2.surf) / 1.3, 0, 1) : 0;
    const mx = R(lerp(368, HER.x, dragK * dragK) + goK * goK * 150);
    const my = R(HER.y - goK * goK * 34);

    // she convulses under his hands, and later breathes
    let conv = 0, breathe = 0;
    if (T > K2.pump && T < K2.listen) conv = Math.sin((T - K2.pump) * 15) * 1.2;
    if (T > K2.cough && T < K2.cough + 0.6) conv = Math.sin((T - K2.cough) * 26) * 3.4 * (1 - (T - K2.cough) / 0.6);
    if (T > K2.cough) breathe = Math.sin((T - K2.cough) * 4.2) * clamp((T - K2.cough) / 0.8, 0, 1);
    if (goK > 0) conv += Math.sin(T * 9) * 1.6 * goK;

    ctx.save();
    ctx.translate(mx, my + R(conv));
    ctx.rotate(-0.03 - goK * 0.06);

    // cast shadow on the sand
    ctx.globalAlpha = qa(0.55 - goK * 0.45);
    ctx.drawImage(A.herShadow.c, 6 - A.herShadow.ax, 38 - A.herShadow.ay);
    ctx.globalAlpha = 1;

    // far flipper, under the body
    ctx.save(); ctx.translate(MA.shoX[0] + 12, MA.shoX[1] - 8); ctx.rotate(-0.30 + (T > K2.rise ? Math.sin(T * 9) * 0.25 : 0));
    ctx.drawImage(A.flipFar.c, -A.flipFar.ax, -A.flipFar.ay); ctx.restore();
    // fluke
    ctx.save(); ctx.translate(MA.tailX[0] + 18, 2);
    ctx.rotate(T > K2.rise ? Math.sin(T * 7) * 0.26 : -0.05);
    ctx.drawImage(A.fluke.c, -A.fluke.ax, -A.fluke.ay); ctx.restore();
    // body
    ctx.save();
    if (breathe) ctx.translate(0, R(breathe * -1));
    ctx.drawImage(A.man.c, -A.man.ax, -A.man.ay);
    ctx.restore();

    // ---- the wound, and the stitches closing it
    const wx = MA.wound[0], wy = MA.wound[1];
    const covered = Math.min(7, this.stitches);
    for (let i = 0; i < 18; i++) {
      const x = wx + R(i * 0.5), y = wy + i;
      const done = i < covered * 2.6;
      P(ctx, done ? DP.blood[0] : DP.blood[1], x - 1, y, 4, 1);
      if (!done) { P(ctx, DP.blood[3], x, y, 2, 1); if ((i & 2) === 0) P(ctx, DP.blood[4], x + 1, y, 1, 1); }
    }
    for (let i = 0; i < covered; i++) {
      const x = wx + R(i * 1.3), y = wy + R(i * 2.6);
      LN(ctx, DP.bone, x - 3, y - 1, x + 3, y + 2);
      LN(ctx, DP.bone, x + 3, y - 1, x - 3, y + 2);
      P(ctx, DP.ink, x, y, 1, 1);
    }

    // ---- the steel plate going back on
    {
      const px = MA.plate[0], py = MA.plate[1];
      const k = this.plateOn;
      // the bare, riveted socket underneath
      for (let i = 0; i < 4; i++) { P(ctx, DP.ink, px - 9 + i * 6, py - 6, 2, 2); P(ctx, DP.ink, px - 9 + i * 6, py + 5, 2, 2); }
      if (k > 0) {
        ctx.save();
        ctx.translate(px, R(py - (1 - k) * 12));
        ctx.rotate((1 - k) * 0.4);
        ctx.drawImage(A.platS.c, -A.platS.ax, -A.platS.ay);
        ctx.restore();
      }
    }
    // ---- the harness strap, bolted back down across her girth
    if (this.bolted > 0) {
      const sx = MA.strap[0], sy = 0;
      const hh = R(26 * Math.sqrt(Math.max(0, 1 - Math.pow(sx / 58, 2))));
      const h = R(this.bolted * hh * 2);
      for (let i = 0; i < h; i++) {
        const y = sy - hh + i;
        const xx = sx + R(Math.sin((y - sy) / 24) * 2);
        P(ctx, DP.ink, xx - 1, y, 7, 1);
        P(ctx, DP.lea[2], xx, y, 5, 1);
        if ((i & 3) === 1) P(ctx, DP.lea[3], xx, y, 5, 1);
      }
      if (this.bolted > 0.6) { P(ctx, DP.ink, sx - 1, sy - 3, 7, 8); P(ctx, DP.gold[2], sx, sy - 2, 5, 6); P(ctx, DP.gold[3], sx, sy - 2, 5, 1); P(ctx, DP.gold[0], sx, sy + 3, 5, 1); }
    }
    // ---- the bandage wound round the tail stock
    if (this.wraps > 0) {
      const bx = MA.band[0];
      const n = R(this.wraps * 5);
      for (let i = 0; i < n; i++) {
        const x = bx - 2 + i * 4;
        const hh = R(25 * Math.sqrt(Math.max(0, 1 - Math.pow(x / 58, 2))));
        for (let y = -hh; y <= hh; y++) {
          const k = Math.abs(y) / (hh + 1);
          const xx = x + R(Math.sin(k * 1.4) * 2);
          P(ctx, DP.ink, xx - 1, y, 1, 1);
          P(ctx, DP.bandage[2], xx, y, 3, 1);
          P(ctx, DP.bandage[3], xx, y, 1, 1);
          P(ctx, DP.bandage[0], xx + 3, y, 1, 1);
        }
      }
    }
    // ---- near flipper, over the body
    ctx.save(); ctx.translate(MA.shoX[0], MA.shoX[1]);
    ctx.rotate(-0.55 + (T > K2.cough ? Math.sin(T * 8) * 0.30 : -0.05));
    ctx.drawImage(A.flip.c, -A.flip.ax, -A.flip.ay); ctx.restore();

    // ---- her face
    const ex = MA.eye[0], ey = MA.eye[1], mox = MA.mouth[0], moy = MA.mouth[1];
    const awake = T > K2.cough;
    if (!awake) {
      P(ctx, DP.ink, ex - 3, ey + 1, 8, 1);
      P(ctx, DP.ink, ex - 4, ey, 1, 1); P(ctx, DP.ink, ex + 5, ey, 1, 1);
      P(ctx, '#2a2730', ex - 3, ey - 1, 8, 1);
    } else {
      const open = clamp((T - K2.cough) / 0.45, 0, 1);
      const h = Math.max(1, R(open * 5));
      P(ctx, DP.ink, ex - 3, ey - 1, 9, h + 2);
      P(ctx, '#e9f0f4', ex - 2, ey, 7, h);
      P(ctx, '#0b0b10', ex - 1, ey, 3, h);
      P(ctx, '#ffffff', ex - 1, ey, 1, 1);
    }
    const spitting = (T > K2.pump && T < K2.listen && Math.sin((T - K2.pump) * 15) > 0.3) || (T > K2.cough && T < K2.cough + 0.7);
    if (spitting) { P(ctx, DP.ink, mox - 5, moy - 3, 11, 9); P(ctx, '#2a1218', mox - 4, moy - 2, 9, 7); }
    else { P(ctx, DP.ink, mox - 5, moy, 10, 2); if (!awake) P(ctx, DP.ink, mox - 6, moy + 1, 2, 1); }
    ctx.restore();

    // water pouring out of her, in screen space
    if (spitting) {
      const wx2 = mx + mox - 10, wy2 = my + moy + 2;
      for (let i = 0; i < 12; i++) {
        const q = hash2(i, Math.floor(T * 30));
        P(ctx, q > 0.5 ? '#bfe0ea' : '#7ea6b4', R(wx2 - q * 14), R(wy2 + i * 1.7 + q * 5), 2, 1);
      }
      if (Math.random() < 0.5) FX.drop(wx2 - 6, wy2 + 6, 1, '#bfe0ea', 0.5);
    }
    this._herX = mx; this._herY = my;
  },

  // ---- the otter working -------------------------------------------------
  drawHim(ctx, T, t) {
    const hx = this._herX === undefined ? HER.x : this._herX;
    const hy = this._herY === undefined ? HER.y : this._herY;
    const FEET = HER.feet;
    // the curve of her back, so he can stand on her
    const backY = lx => { const k = clamp(lx / 58, -1, 1); return -R(25 * Math.sqrt(Math.max(0, 1 - k * k))); };
    const o = { s: 1, flip: true, phase: t * 2, exp: 'focus', hat: true };
    let x = hx, y = FEET - 16, rot = 0;
    // stand him on her back, a little behind the thing he is working on
    const onBack = (anchor, dx, dy) => {
      const lx = anchor[0] + dx;
      x = R(hx + lx); y = R(hy + backY(lx) - 15 + (dy || 0));
    };
    const RAISED = -1.45, STRUCK = 0.85;                // his arm, in his own frame

    if (T < K2.hammer) {
      // hauling her the last few feet, leaning into a rope over his shoulder
      const k = clamp(T / 1.25, 0, 1);
      x = R(lerp(HER.x - 98, HER.x - 132, k)); y = FEET - 16;
      rot = -0.34 + Math.sin(T * 6) * 0.05;
      o.armNear = -1.05 + Math.sin(T * 6) * 0.22; o.armFar = -0.85;
      o.exp = 'strain'; o.headR = -0.14;
      const rx0 = x - 14, ry0 = y - 14;
      for (let i = 0; i <= 44; i++) {
        const q = i / 44;
        const rx = R(lerp(rx0, hx - 40, q)), ry = R(lerp(ry0, hy + 6, q) + Math.sin(q * Math.PI) * 7);
        P(ctx, i % 4 === 0 ? DP.lea[1] : DP.lea[2], rx, ry, 2, 2);
      }
      if (Math.random() < 0.25) FX.drop(x + 10, FEET, 1, '#584a59', 0.35);
    } else if (T < K2.stitch) {
      // up on her back, hammering the torn plate home
      onBack(MA.plate, 15, 0);
      const ph = ((T - K2.hammer) % 0.30) / 0.30;
      o.armNear = ph < 0.55 ? RAISED + ph / 0.55 * (STRUCK - RAISED) : STRUCK + (ph - 0.55) / 0.45 * (RAISED - STRUCK);
      o.armFar = 0.45;
      o.exp = 'strain'; o.headR = 0.14; rot = 0.06;
      o.tool = c => { c.save(); c.translate(12, 0); c.rotate(-0.35); c.drawImage(A.hammer.c, -A.hammer.ax, -A.hammer.ay); c.restore(); };
    } else if (T < K2.bolt) {
      // stitching the gash shut, hunched right over it
      onBack(MA.wound, 15, 1);
      const ph = ((T - K2.stitch) % 0.19) / 0.19;
      o.armNear = 0.85 - ph * 1.05; o.armFar = 0.55;
      o.exp = 'focus'; o.headR = 0.26; rot = 0.14;
      o.tool = c => { c.save(); c.translate(12, 0); c.rotate(0.5); c.drawImage(A.needle.c, -A.needle.ax, -A.needle.ay); c.restore(); };
      const px2 = x - 16, py2 = y - 10 - R(ph * 13);
      LN(ctx, DP.bone, px2, py2, hx + MA.wound[0], hy + MA.wound[1] + 4);
    } else if (T < K2.band) {
      // bolting the harness back down
      onBack(MA.strap, 15, 0);
      o.armNear = 0.70 + Math.sin(T * 13) * 0.40; o.armFar = 0.5;
      o.exp = 'focus'; o.headR = 0.2; rot = 0.08;
      o.tool = c => { c.save(); c.translate(12, 0); c.rotate(Math.sin(T * 13) * 0.8); c.drawImage(A.wrench.c, -A.wrench.ax, -A.wrench.ay); c.restore(); };
    } else if (T < K2.pump) {
      // walking the bandage round her tail stock
      const k = (T - K2.band) / (K2.pump - K2.band);
      onBack(MA.band, 12 + k * 10, Math.sin(k * 9) * 2);
      o.armNear = 0.75 + Math.sin(T * 9) * 0.55; o.armFar = 0.55 + Math.sin(T * 9 + 1.6) * 0.45;
      o.exp = 'focus'; rot = 0.04;
      o.tool = c => { c.save(); c.translate(12, 0); c.drawImage(A.roll.c, -A.roll.ax, -A.roll.ay); c.restore(); };
      LN(ctx, DP.bandage[2], x - 13, y - 8, hx + MA.band[0] + 4, hy - 16);
    } else if (T < K2.listen) {
      // both paws on her chest, throwing his whole weight into it
      const ph = ((T - K2.pump) % 0.42) / 0.42;
      const push = ph < 0.35 ? ph / 0.35 : 1 - (ph - 0.35) / 0.65;
      onBack(MA.chest, 8, -R(push * 4));
      rot = 0.18 + push * 0.22;
      o.armNear = -0.30 + push * 1.20; o.armFar = -0.25 + push * 1.15;
      o.exp = push > 0.7 ? 'shout' : 'strain';
      o.headR = 0.24;
    } else if (T < K2.grieve) {
      // down at her muzzle, listening for a breath that does not come
      onBack(MA.eye, 4, 6);
      rot = 0.42; o.armNear = 0.70; o.armFar = 0.60;
      o.exp = 'shut'; o.headR = 0.66; o.headY = 5; o.headX = -3;
      if (T < K2.listen + 0.6 && (Math.floor(T * 6) & 1)) {
        pixelTextOutlined(ctx, '?', x - 18, y - 34, 8, '#8ea4b8', '#000000', 'center');
      }
    } else if (T < K2.cough) {
      // hat off, head down on her shoulder
      onBack(MA.chest, 10, 8);
      rot = 0.58; o.armNear = 1.05; o.armFar = 0.95;
      o.exp = 'grieve'; o.headR = 0.95; o.headY = 7; o.headX = -6;
      o.hat = false;
      ctx.drawImage(A.hatSide.c, R(x + 22) - A.hatSide.ax, R(y + 14) - A.hatSide.ay);
    } else if (T < K2.rise) {
      // she heaves; he is thrown clear, then scrambles back up
      const k = clamp((T - K2.cough) / 0.8, 0, 1);
      const arc = Math.sin(k * Math.PI);
      onBack(MA.chest, 10 + k * 26, 8 - arc * 26);
      rot = 0.58 - k * 0.58 + Math.sin(k * 12) * 0.14;
      o.armNear = 1.05 - k * 0.5; o.armFar = 0.95 - k * 0.45;
      o.exp = k < 0.4 ? 'shout' : 'joy'; o.headR = 0.5 - k * 0.5;
      o.hat = k > 0.55;
      if (k <= 0.55) ctx.drawImage(A.hatSide.c, R(x + 22 - k * 30) - A.hatSide.ax, R(y + 14 - Math.sin(k * 5.7) * 24) - A.hatSide.ay);
    } else {
      // the two of them drag back into the surf together
      const k = clamp((T - K2.surf) / 1.3, 0, 1);
      onBack(MA.chest, 12, 0);
      x = R(x + k * 30); y = R(y - k * 6);
      o.flip = false;
      rot = -0.12 + Math.sin(T * 9) * 0.08;
      o.armNear = 0.9 + Math.sin(T * 9) * 0.45; o.armFar = 0.6 + Math.sin(T * 9 + 2) * 0.45;
      o.exp = 'joy'; o.headR = -0.1;
      if (k > 0.1 && Math.random() < 0.35) FX.drop(x, y + 12, 1, DP.foam[2], 0.5);
    }
    o.x = x; o.y = y; o.rot = rot;
    o.blink = (t % 3.1) < 0.1;
    drawOtterSide(ctx, o, t);
  },
};

global.DeathScene = DeathScene;

})(typeof window !== 'undefined' ? window : this);
