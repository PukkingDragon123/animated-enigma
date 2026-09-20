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

// ------------------------------------------------- shared character art
// Everything in this scene that is HER or HIM comes out of chars.js: the
// canonical cast, one art pixel per world unit.  The scene draws it at an
// integer scale so the grid stays square.
function cpy(s) { const c = can(s.c.width, s.c.height), x = cx2(c); x.drawImage(s.c, 0, 0); return { c: c, x: x, W: c.width, H: c.height }; }
function tintS(s, col, a) {
  const o = cpy(s);
  o.x.globalCompositeOperation = 'source-atop'; o.x.globalAlpha = a; o.x.fillStyle = col;
  o.x.fillRect(0, 0, o.W, o.H); o.x.globalAlpha = 1; o.x.globalCompositeOperation = 'source-over';
  return spr(o.c, s.ax, s.ay);
}
const MSC = 2;                 // the cast, drawn two pixels per art pixel

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
  // the cold register of the sinking: deep sea, bruise, bioluminescence
  deep: ['#03060e', '#061224', '#0a1e3e', '#10305e', '#1a4a84'],
  bruise: ['#120b22', '#1e1038', '#2e1a4e', '#432663'],
  biolum: ['#0e5a66', '#1c9aa4', '#48d8cf', '#b4fff2'],
  // night beach — a blue-black night, not a grey one, with 10 sky bands so
  // the dawn can be a real posterised ramp instead of a three-step wash
  skyN: ['#03040c', '#050916', '#081024', '#0b1834', '#0e2146', '#122a58', '#17356a', '#1e4179', '#2a5088', '#3a6296'],
  skyD: ['#1a0a2c', '#2e0f3e', '#4a1547', '#6c1d46','#901f3f', '#b83a38', '#dc632c', '#f2903a', '#ffc25c', '#ffe9a6'],
  // the midpoint of the crossfade: a saturated violet twilight, so night
  // never mixes straight into gold and goes grey on the way
  skyM: ['#0a0618', '#140a24', '#1e0e32', '#2c1140', '#3e144a', '#54184e', '#701f4e', '#8e2a4a', '#ac3c48', '#c85446'],
  seaM: ['#050510', '#0b0a1c', '#12102a', '#1b1636', '#281c40', '#3a2448'],
  sandM: ['#181020', '#231628', '#312036', '#422c40', '#553a48'],
  seaN: ['#02050e', '#05101f', '#08192f', '#0d2444', '#12325e', '#1a4278'],
  seaD: ['#160a1e', '#2a1030', '#451a3c', '#6c2a40', '#a34a42', '#d98a58'],
  foam: ['#5d7d95', '#8fb0c4', '#c8dde9', '#f2fbff'],
  foamW: ['#96605e', '#c68a70', '#efc396', '#fff2d2'],
  sand: ['#100d1a', '#1a1626', '#272034', '#362c42', '#483a52'],
  sandD: ['#2a1522', '#43202c', '#603037', '#7d4842', '#9c6552'],
  sandW: ['#241a1c', '#35262a', '#493438', '#5d4446'],
  wood: ['#1c1520', '#2e2430', '#453546', '#5b4757'],
  fire: ['#4a0f12', '#8c2410', '#c44f12', '#ef8a1c', '#ffb83e', '#ffe08c', '#fff6dc'],
  // the colours firelight throws onto whatever it touches
  warm: ['#2e1208', '#5a2410', '#a4501c', '#e08c30', '#ffc866'],
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
// ---- the hat, and the head without it, both cut out of CH.otterHead so the
// scene never draws a second version of either.
function hatCut() { return Math.max(3, R(CH.otterHead.c.height * 0.36)); }
function cutHat() {
  const src = CH.otterHead, o = cpy(src), W = o.W, cut = hatCut();
  const d = o.x.getImageData(0, 0, W, cut).data;
  let x0 = W, x1 = -1, y0 = cut, y1 = -1;
  for (let y = 0; y < cut; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] < 24) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < x0) { x0 = 0; x1 = W - 1; y0 = 0; y1 = cut - 1; }
  const c = can(x1 - x0 + 1, y1 - y0 + 1), x = cx2(c);
  x.drawImage(o.c, -x0, -y0);
  return spr(c, (x1 - x0 + 1) / 2, (y1 - y0 + 1) / 2);
}
// The same head with the hat taken off it: the felt cleared away and the
// skull closed over with his own fur.
function cutBareHead() {
  const src = CH.otterHead, o = cpy(src), x = o.x, W = o.W, H = o.H, cut = hatCut();
  x.clearRect(0, 0, W, cut);
  const d = x.getImageData(0, 0, W, H).data;
  let lx = W, rx = -1;
  for (let q = cut; q < Math.min(H, cut + 3); q++) for (let px2 = 0; px2 < W; px2++) {
    if (d[(q * W + px2) * 4 + 3] < 24) continue;
    if (px2 < lx) lx = px2; if (px2 > rx) rx = px2;
  }
  if (rx <= lx) { lx = R(W * 0.18); rx = R(W * 0.82); }
  const cxp = (lx + rx) / 2, rw = (rx - lx) / 2, rh = Math.max(2, R(H * 0.20));
  for (let y = -rh; y <= 1; y++) {
    const k = 1 - (y / (rh + 0.6)) * (y / (rh + 0.6)); if (k <= 0) continue;
    const hw = R(rw * Math.sqrt(k));
    for (let px2 = -hw; px2 <= hw; px2++) {
      const u = Math.abs(px2) / (hw + 1), v = (-y) / rh;
      const col = (u > 0.84 || v > 0.92) ? CPAL.out : v > 0.55 ? CPAL.furL : u < 0.55 ? CPAL.fur : CPAL.furD;
      P(x, col, R(cxp + px2), cut + y);
    }
  }
  // his ears, back on a skull that has nothing on it
  P(x, CPAL.out, R(cxp - rw - 1), cut - rh + 1, 2, 3); P(x, CPAL.furDD, R(cxp - rw), cut - rh + 2, 1, 1);
  P(x, CPAL.out, R(cxp + rw), cut - rh + 1, 2, 3); P(x, CPAL.furDD, R(cxp + rw), cut - rh + 2, 1, 1);
  // and an outline all the way round, so a bare head still reads as a head
  {
    const d2 = x.getImageData(0, 0, W, H).data;
    const on = (px2, py) => px2 >= 0 && py >= 0 && px2 < W && py < H && d2[(py * W + px2) * 4 + 3] > 40;
    for (let y = 0; y < H; y++) for (let px2 = 0; px2 < W; px2++) {
      if (!on(px2, y)) continue;
      if (on(px2 - 1, y) && on(px2 + 1, y) && on(px2, y - 1) && on(px2, y + 1)) continue;
      P(x, CPAL.out, px2, y);
    }
  }
  return spr(o.c, src.ax, src.ay);
}

function buildTopArt() {
  // ---- blood pools, baked at a ladder of sizes
  A.bloodDisc = [];
  for (let i = 0; i < 15; i++) {
    const r = 4 + i * 4;
    A.bloodDisc.push(bakeDisc(r, r * 0.74, [DP.blood[2], DP.blood[1], DP.blood[1], DP.blood[0], DP.blood[0]]));
  }
  // blood on sand: flat, soaked in, not a puddle she is floating in
  A.soakDisc = [];
  for (let i = 0; i < 10; i++) {
    const r = 10 + i * 7;
    A.soakDisc.push(bakeDisc(r, Math.max(3, r * 0.26), ['#5a0a12', '#42070e', '#2c050a', '#1a0407']));
  }
  A.darkDisc = [];
  for (let i = 0; i < 10; i++) { const r = 8 + i * 8; A.darkDisc.push(bakeDisc(r, r * 0.60, [DP.deep[0], DP.bruise[0], DP.deep[1], DP.deep[2]])); }
  A.sinkDisc = [];
  for (let i = 0; i < 6; i++) { const r = 14 + i * 6; A.sinkDisc.push(bakeDisc(r, r * 0.50, [DP.deep[0], DP.bruise[1]])); }
  // a cold bloom of stirred-up bioluminescence
  A.bioDisc = [];
  for (let i = 0; i < 5; i++) { const r = 16 + i * 10; A.bioDisc.push(bakeDisc(r, r * 0.55, [DP.biolum[2], DP.biolum[1], DP.biolum[0], DP.deep[2]])); }
  // ---- where the gear went into her, in HER own units, so the blood comes
  //      out of the same place however she is turned
  {
    const m = CH.manatee;
    A.wnd = { x: m.c.width * 0.56 - m.ax, y: m.c.height * 0.30 - m.ay };
  }
  // ---- the thing that killed her: a trawl-gear harpoon, snapped off short,
  //      barbed head, frayed steel wire still on it.  Built at the cast's
  //      resolution, so it is the right size in her and in his paw.
  {
    const c = can(30, 7), x = cx2(c);
    P(x, DP.ink, 0, 2, 22, 3);
    for (let i = 0; i < 21; i++) { P(x, DP.met[2], i, 3); if ((i & 3) === 1) P(x, DP.met[4], i, 3); }
    for (let i = 0; i < 3; i++) { P(x, DP.ink, 1 + i * 2, 1 + (i & 1), 2, 5); P(x, DP.met[3], 2 + i * 2, 2, 1, 3); }
    P(x, DP.ink, 20, 1, 4, 5); P(x, DP.met[1], 21, 2, 2, 3); P(x, DP.met[4], 21, 2, 2, 1);
    for (let i = 0; i < 7; i++) { const y = 3 + R(Math.sin(i * 0.9) * 1.4); P(x, DP.ink, 23 + i, y, 1, 2); P(x, DP.met[1], 23 + i, y, 1, 1); }
    for (let i = 0; i < 12; i++) if (hash2(i, 3) > 0.45) P(x, i < 6 ? DP.blood[2] : DP.blood[1], i, 2 + R(hash2(i, 9) * 3), 1, 1);
    A.harp = spr(c, 1, 3);
  }
  // ---- a torn scrap of trawl netting, still wrapped round her
  {
    const c = can(24, 16), x = cx2(c);
    for (let i = -4; i < 7; i++) for (let q = 0; q < 24; q++) {
      const y = R(q * 0.62) + i * 4;
      if (y >= 0 && y < 16 && (q & 1) === 0) P(x, (q & 3) ? '#1b2a2e' : '#39575c', q, y);
      const y2 = R((23 - q) * 0.62) + i * 4;
      if (y2 >= 0 && y2 < 16 && (q & 1) === 1) P(x, (q & 3) === 1 ? '#16232a' : '#2e4a50', q, y2);
    }
    for (let i = 0; i < 6; i++) P(x, '#4a6a6e', 20 + R(hash2(i, 2) * 3), R(hash2(i, 7) * 15), 1, 2);
    A.net = spr(c, 12, 8);
  }
  // ---- a torn-off armour plate, tumbling free of her back
  {
    const c = can(8, 15), x = cx2(c);
    for (let y = 0; y < 15; y++) for (let xx = 0; xx < 8; xx++) {
      const edge = y === 0 || y === 14 || xx === 0 || xx === 7;
      P(x, edge ? DP.ink : y < 2 ? DP.met[3] : y > 12 ? DP.met[0] : xx < 2 ? DP.met[1] : DP.met[2], xx, y);
    }
    for (let y = 2; y < 13; y += 4) { P(x, DP.met[4], 1, y); P(x, DP.met[0], 1, y + 1); P(x, DP.met[4], 6, y); P(x, DP.met[0], 6, y + 1); }
    for (let i = 0; i < 4; i++) P(x, DP.ink, 7 - i, i, 1, 1 + (i & 1));
    A.plate = spr(c, 4, 7);
  }
  // ---- a snapped harness strap
  {
    const c = can(10, 4), x = cx2(c);
    for (let i = 0; i < 10; i++) { const y = 1 + R(Math.sin(i * 0.7)); P(x, DP.ink, i, y - 1, 1, 3); P(x, CPAL.lea, i, y, 1, 1); }
    A.strap = spr(c, 5, 2);
  }
  // ---- his hat, cut off the canonical head, so the thing that comes off
  //      in the grief beat is the same hat he has been wearing all game
  A.hatTop = cutHat();
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
  // flippers, gone slack, hung where the rig hangs them
  const fa = 2.25 + (st.slack || 0);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(15, side * 13); ctx.scale(1, side); ctx.rotate(fa);
    ctx.drawImage(CH.flipper.c, -CH.flipper.ax, -CH.flipper.ay); ctx.restore();
  }
  const body = st.hurt ? CH.manateeHurt
    : belly ? (CH.manateeBellyA || CH.manateeBelly || CH.manateeArmor)
      : CH.manateeArmor;
  ctx.drawImage(body.c, -body.ax, -body.ay);
  ctx.restore();
}

// the otter on his own, top-down, out of the saddle — the cast's own rider
// o: {x, y, ang, s, exp, arms:[a,b], alpha}
function drawOtterTop(ctx, o, t) {
  if (typeof CH === 'undefined' || !CH.drawOtter) return;
  CH.drawOtter(ctx, {
    x: o.x, y: o.y, ang: o.ang || 0, scale: o.s === undefined ? rigScale() : o.s,
    exp: o.exp === 'shut' ? 'idle' : o.exp === 'pain' || o.exp === 'drown' ? o.exp : o.exp || 'pain',
    blink: o.exp === 'shut', alpha: o.alpha,
    arms: o.arms, headR: o.headR, tail: o.tail,
  }, t);
}

// =========================================================================
//  PART 2 ART — side view.
// =========================================================================

// ------------------------------------------------- the pair, side view
//  Neither of them is redrawn in this file.  She is CH.side — the cast's
//  side-on manatee — and he is CH.otterStand with the cast's own head and
//  face on him.  Only the things that are done TO her are new, and the one
//  pose the cast does not carry: his head with the hat off it.
//
//  The scene needs a few anchors on her flank that the cast does not name.
//  They are in HER units, facing right, and turn into screen pixels below.
const MU = {
  wound: [13, -5],      // where the steel went in, high on the shoulder
  plate: [-2, -6],      // where the torn plate is hammered back on
  strap: [-13, 0],      // the harness strap, bolted back down
  band:  [-27, 0],      // the bandage, round the tail stock
  chest: [20, 2],       // where he puts his weight to pump her out
};
const MA = {};          // all of the above, in screen pixels, facing LEFT
function buildAnchors() {
  const S = CH.side;
  const put = (k, lx, ly) => { MA[k] = [-R(lx * MSC), R(ly * MSC)]; };
  for (const k in MU) put(k, MU[k][0], MU[k][1]);
  put('eye', S.eye[0], S.eye[1]);
  put('mouth', S.mouth[0], S.mouth[1]);
  put('tail', S.tailX, 0);
  put('sho', S.shoX, S.shoY);
  MA.len = S.len * MSC;
  MA.hgt = S.body.c.height * MSC;
  // Her actual profile, read off the cast's own sprite: the top of her back
  // and the line where she meets the sand, per column.  Everything that has
  // to sit ON her — him, the strap, the blood running off her — uses this,
  // so it still fits when she is rebuilt.
  const b = S.body, W = b.c.width, H = b.c.height;
  const d = cx2(can(W, H));
  d.drawImage(b.c, 0, 0);
  const px2 = d.getImageData(0, 0, W, H).data;
  A.topY = new Int16Array(W); A.botY = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    let ya = -1, yb = -1;
    for (let y = 0; y < H; y++) if (px2[(y * W + x) * 4 + 3] > 40) { if (ya < 0) ya = y; yb = y; }
    A.topY[x] = ya < 0 ? 0 : ya - b.ay;
    A.botY[x] = yb < 0 ? 0 : yb - b.ay;
  }
  A.colOf = dx => clamp(R(b.ax - dx / MSC), 0, W - 1);
}
// the top of her back, and the line where she meets the sand, in screen
// pixels from her centre, for a body drawn facing LEFT
function herTop(dx) { return A.topY[A.colOf(dx)] * MSC; }
function herBot(dx) { return A.botY[A.colOf(dx)] * MSC; }
function buildHim() {
  A.oHeadBare = cutBareHead();
  A.hatSide = cutHat();
  A.hatTop = A.hatTop || cutHat();
}

// the expressions this scene asks for, in the cast's own vocabulary
function expOf(e) {
  return e === 'strain' ? 'angry' : e === 'shout' ? 'talk' : e === 'joy' ? 'happy'
    : e === 'surprised' || e === 'pain' || e === 'drown' ? e : 'idle';
}

// blit a baked rim-light sprite over the part just drawn
function rimBlit(ctx, key, lit, mirror) {
  if (!lit || !A.rim || !A.rim[key]) return;
  const m = mirror ? 1 : 0;
  for (const which of ['fire', 'cold', 'dawn']) {
    const a = lit[which];
    if (!a || a < 0.03) continue;
    const idx = which === 'fire' ? m : 1 - m;
    const wsh = A.rim[key][which + 'W'][idx];
    ctx.globalAlpha = qa(a * 0.9);
    ctx.drawImage(wsh.c, -wsh.ax, -wsh.ay);
    const s = A.rim[key][which][idx];
    ctx.globalAlpha = qa(a);
    ctx.drawImage(s.c, -s.ax, -s.ay);
  }
  ctx.globalAlpha = 1;
}

// his own frame, exactly the one CH.drawOtterStanding builds, so anything
// drawn on him lands where it would if the cast had drawn it
function himFrame(ctx, o, fn) {
  ctx.save();
  ctx.translate(R(o.x), R(o.y));
  ctx.scale((o.flip ? -1 : 1) * MSC, MSC);
  if (o.rot) ctx.rotate(o.rot);
  fn(ctx);
  ctx.restore();
}
// o: {x,y,flip,rot,armNear,armFar,headR,headX,headY,exp,blink,hat,gore,grief,hold}
function drawOtterSide(ctx, o, t) {
  const arms = [o.armNear === undefined ? -0.25 : o.armNear, o.armFar === undefined ? 0.35 : o.armFar];
  if (o.hat === false) standBare(ctx, o, arms, t);
  else CH.drawOtterStanding(ctx, {
    x: o.x, y: o.y, scale: MSC, facing: o.flip ? -1 : 1, rot: o.rot,
    exp: expOf(o.exp), blink: o.blink || o.exp === 'shut', arms: arms, hold: o.hold,
    headR: o.headR, headX: o.headX, headY: o.headY, tail: o.tail,
  }, t);
  // what came off her, on him
  if (o.gore > 0.02 || o.grief > 0) himFrame(ctx, o, c => {
    const g = o.gore || 0;
    if (g > 0.02) {
      for (let i = 0; i < 10; i++) {
        if (hash2(i, 3) > g) continue;
        P(c, i & 1 ? DP.blood[1] : DP.blood[0], -3 + R(hash2(i, 7) * 7), -5 + R(hash2(i, 11) * 10), 1, 1);
      }
      // to the elbow, on the paw that has been inside her
      c.save(); c.translate(2, -2); c.rotate(arms[0]);
      for (let i = 0; i < R(g * 6); i++) P(c, i & 1 ? DP.blood[2] : DP.blood[1], 4 + R(hash2(i, 5) * 6), -2 + R(hash2(i, 9) * 4), 1, 1);
      if (g > 0.5) P(c, DP.blood[3], 8, -1, 2, 2);
      c.restore();
    }
    // grief is not in the rig's vocabulary: it is the brow, and his eyes wet
    if (o.grief > 0) {
      c.save(); c.translate(1 + (o.headX || 0), -11 + (o.headY || 0)); c.rotate(o.headR || 0);
      c.translate(-CH.otterHead.ax, -CH.otterHead.ay);
      P(c, CPAL.furDD, 3, 5, 4, 1); P(c, CPAL.furDD, 12, 5, 4, 1);
      if (o.grief > 0.45) {
        const dy = R((o.grief - 0.45) * 5);
        P(c, '#9fc4d8', 4, 9 + dy, 1, 1);
        if (o.grief > 0.75) P(c, '#cfe4f0', 13, 8 + dy, 1, 1);
      }
      c.restore();
    }
  });
}
// The one pose the cast does not carry: his head with the hat off it.  Same
// parts, same offsets as CH.drawOtterStanding — only the skull is different.
function standBare(ctx, o, arms, t) {
  himFrame(ctx, o, c => {
    c.save(); c.translate(-6, 4); c.rotate(2.9 + (o.tail || 0));
    c.drawImage(CH.otterTail.c, -CH.otterTail.ax, -CH.otterTail.ay); c.restore();
    c.save(); c.translate(1, -1); c.rotate(arms[1]);
    c.drawImage(CH.otterArm.c, -CH.otterArm.ax, -CH.otterArm.ay); c.restore();
    c.drawImage(CH.otterStand.c, -CH.otterStand.ax, -CH.otterStand.ay);
    c.save(); c.translate(2, -2); c.rotate(arms[0]);
    c.drawImage(CH.otterArm.c, -CH.otterArm.ax, -CH.otterArm.ay);
    if (o.hold) c.drawImage(o.hold.c, 9 - o.hold.ax, -o.hold.ay);
    c.restore();
    c.save(); c.translate(1 + (o.headX || 0), -11 + (o.headY || 0)); c.rotate(o.headR || 0);
    c.drawImage(A.oHeadBare.c, -A.oHeadBare.ax, -A.oHeadBare.ay);
    c.translate(-A.oHeadBare.ax, -A.oHeadBare.ay);
    drawOtterFace(c, expOf(o.exp), o.blink || o.exp === 'shut', t);
    c.restore();
  });
}

// ------------------------------------------------------------------ tools
function buildTools() {
  // his tools, built at the cast's resolution so they sit in his paw
  { const c = can(9, 6), x = cx2(c);              // hammer
    P(x, DP.ink, 0, 2, 7, 2); P(x, CPAL.lea, 1, 3, 5, 1); P(x, CPAL.leaL, 1, 2, 5, 1);
    P(x, DP.ink, 5, 0, 4, 6); P(x, DP.met[2], 6, 1, 2, 4); P(x, DP.met[3], 6, 1, 2, 1); P(x, DP.met[0], 6, 4, 2, 1);
    A.hammer = spr(c, 1, 3); }
  { const c = can(9, 5), x = cx2(c);              // wrench
    P(x, DP.ink, 0, 1, 7, 3); P(x, DP.met[2], 1, 2, 5, 1); P(x, DP.met[3], 1, 2, 5, 1);
    P(x, DP.ink, 6, 0, 3, 5); P(x, DP.met[2], 7, 1, 2, 3); P(x, DP.ink, 8, 2, 1, 1);
    A.wrench = spr(c, 1, 2); }
  { const c = can(7, 4), x = cx2(c);              // curved needle
    for (let i = 0; i < 6; i++) P(x, DP.met[4], 1 + i, 2 - R(Math.sin(i / 5 * 3.14) * 1.4));
    P(x, DP.met[0], 6, 1); A.needle = spr(c, 1, 2); }
  { const c = can(6, 6), x = cx2(c);              // bandage roll
    ditherDisc(x, 3, 3, 2.6, 2.6, [DP.bandage[3], DP.bandage[2], DP.bandage[1], DP.ink]);
    P(x, DP.bandage[0], 1, 2, 4, 1); P(x, DP.bandage[0], 1, 4, 4, 1);
    A.roll = spr(c, 3, 3); }
  { const c = can(13, 8), x = cx2(c);             // the steel back plate
    for (let y = 0; y < 8; y++) for (let xx = 0; xx < 13; xx++) {
      const edge = y === 0 || y === 7 || xx === 0 || xx === 12;
      P(x, edge ? DP.ink : y < 2 ? DP.met[3] : y > 5 ? DP.met[0] : xx < 2 ? DP.met[1] : DP.met[2], xx, y);
    }
    for (let i = 0; i < 3; i++) { P(x, DP.met[4], 2 + i * 4, 1); P(x, DP.met[0], 2 + i * 4, 2); P(x, DP.met[4], 2 + i * 4, 5); P(x, DP.met[0], 2 + i * 4, 6); }
    A.platS = spr(c, 6, 4); }
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
const BG_N = 13;                                   // night -> dawn frames
function buildBeach() {
  A.bg = [];
  const HORIZON = 140, SANDY = 196;
  for (let fi = 0; fi < BG_N; fi++) {
    const k = fi / (BG_N - 1);
    const c = can(640, 360), x = cx2(c);
    // ---- sky, sea and sand, written straight into one ImageData.  Doing
    //      this with fillRect cost a second of load time per frame.
    // Ten sky bands, ten sea bands: the dawn is a posterised ramp of many
    // discrete colours, not a wash.  Every band crossfades night -> dawn.
    const ramp = (a, m, b, kk) => kk < 0.5 ? mixHex(a, m, kk * 2) : mixHex(m, b, (kk - 0.5) * 2);
    const sky = DP.skyN.map((h, i) => hexToRgb(ramp(h, DP.skyM[i], DP.skyD[i], k)));
    const sea = DP.seaN.map((h, i) => hexToRgb(ramp(h, DP.seaM[i], DP.seaD[i], Math.min(1, k * 1.05))));
    const sand = DP.sand.map((h, i) => hexToRgb(ramp(h, DP.sandM[i], DP.sandD[i], k)));
    const wet = DP.sandW.map((h, i) => hexToRgb(mixHex(h, ['#3a1c26', '#582a2e', '#7a4238', '#9a6048'][i], k)));
    // how high the dawn has climbed, and where its heart sits
    const SUNX = 516, sunUp = clamp((k - 0.26) / 0.74, 0, 1);
    const SUNY = R(HORIZON + 26 - sunUp * 44), SUNR = 34;
    const img = x.createImageData(640, 360), d = img.data;
    for (let y = 0; y < 360; y++) for (let px = 0; px < 640; px++) {
      let col;
      if (y < HORIZON) {
        const u = y / (HORIZON - 1);
        const fb = Math.pow(u, 1.10) * (sky.length - 1);
        let bi2 = Math.floor(fb); const fr = fb - bi2;
        let idx = bi2 + (fr > bay(px, y) ? 1 : 0);
        // the glow around the sun lifts the band index by up to four steps,
        // so the ramp bulges into a real dawn instead of tinting flat
        const glow = Math.max(0, 1 - Math.hypot((px - SUNX) / 250, (y - SUNY) / 155)) * k;
        const lift = glow * 5.2;
        let li = Math.floor(lift); if (lift - li > bay(px + 2, y + 1)) li++;
        idx = Math.min(sky.length - 1, idx + li);
        col = sky[idx];
        // the sun itself: a hard disc in three posterised rings
        if (k > 0.30) {
          const dd = Math.hypot((px - SUNX) * 0.92, (y - SUNY));
          if (dd < SUNR) {
            const ring = dd / SUNR;
            const sc = ring < 0.52 ? '#fff6dc' : ring < 0.80 ? '#ffe09a' : '#ffb863';
            const sa = clamp((k - 0.30) / 0.30, 0, 1);
            const sr = hexToRgb(sc);
            col = [col[0] + (sr[0] - col[0]) * sa, col[1] + (sr[1] - col[1]) * sa, col[2] + (sr[2] - col[2]) * sa];
          } else if (dd < SUNR + 9 && bay(px, y) < (1 - (dd - SUNR) / 9) * 0.8 * clamp((k - 0.30) / 0.3, 0, 1)) {
            col = hexToRgb('#ffb863');
          }
        }
      } else if (y < SANDY) {
        const u = (y - HORIZON) / (SANDY + 16 - HORIZON);
        const fb = (1 - Math.pow(u, 0.8)) * (sea.length - 1);
        let bi2 = Math.floor(fb); const fr = fb - bi2;
        const n = vnoise(px * 0.04, y * 0.12);
        // the sea takes the sky's colour back: a broad band of reflected
        // dawn under the sun, dashed and dithered so it stays pixel art
        let idx = Math.min(sea.length - 1, Math.max(0, bi2 + ((fr + (n - 0.5) * 0.5) > bay(px, y) ? 1 : 0)));
        const refl = Math.max(0, 1 - Math.abs(px - SUNX) / 360) * k;
        if (refl > 0.04) {
          const dash = vnoise(px * 0.09, y * 0.55);
          const amt = (0.09 * k + refl * (0.5 + dash * 1.15)) * (1 - u * 0.40);
          let ri = Math.floor(amt * 4.2); if (amt * 4.2 - ri > bay(px, y + 2)) ri++;
          idx = Math.min(sea.length - 1, idx + ri);
        }
        col = sea[idx];
      } else {
        const u = (y - SANDY) / (360 - SANDY);
        const n = vnoise(px * 0.05, y * 0.11) * 0.8 + vnoise(px * 0.2, y * 0.4) * 0.3;
        const fb = (2.6 - u * 2.0 + (n - 0.55) * 1.4);
        let bi2 = Math.floor(fb); if (fb - bi2 > bay(px, y)) bi2++;
        col = sand[Math.max(0, Math.min(sand.length - 1, bi2))];
        // damp sand just below the surf
        if (y < SANDY + 26) {
          const uw = (y - SANDY) / 26;
          const n2 = vnoise(px * 0.03, 11);
          if (bay(px, y) < (1 - uw) * 0.85 + (n2 - 0.5) * 0.3) col = wet[Math.min(3, Math.floor(uw * 4))];
        }
      }
      const q = (y * 640 + px) * 4;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = 255;
    }
    x.putImageData(img, 0, 0);

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
        // a glitter path under the moon / the dawn
    for (const pass of [0, 1]) {
      const gx = pass ? 516 : 118;
      const ga = pass ? k : (1 - k * 1.15);
      if (ga <= 0.02) continue;
      const GC = pass ? ['#ffeec0', '#ffc774', '#e08a46'] : ['#cfe4f2', '#8fb0c4', '#5d7d95'];
      for (let i = 0; i < 300; i++) {
        const yy = R(HORIZON + Math.pow(hash2(i, 7 + pass * 3), 1.6) * 54);
        const spread = 8 + (yy - HORIZON) * 2.6;
        const xx = R(gx + (hash2(i, 13 + pass) - 0.5) * spread * 2);
        if (xx < 0 || xx > 639) continue;
        const b = hash2(i, 19 + pass);
        P(x, rgbaq(GC[b > 0.72 ? 0 : b > 0.36 ? 1 : 2], (0.25 + b * 0.55) * ga), xx, yy, 1 + (hash2(i, 23) > 0.7 ? 1 : 0), 1);
      }
    }
    // distant headland, left — a silhouette that picks up the dawn on its rim
    const hl = mixHex('#080b14', '#20132c', k);
    for (let px = 0; px < 232; px++) {
      const taper = clamp((232 - px) / 70, 0, 1);
      const h = R((10 + vnoise(px * 0.02, 3) * 18 + Math.max(0, 70 - px) * 0.30) * taper);
      if (h < 1) continue;
      P(x, hl, px, HORIZON - h, 1, h + 1);
      P(x, mixHex('#2a2c42', '#7a3a4a', k), px, HORIZON - h, 1, 1);
      if (k > 0.45) P(x, rgbaq('#e08a46', (k - 0.45) * 0.9), px, HORIZON - h, 1, 1);
    }
    // a low dune and marram grass along the top of the beach, right
    for (let px = 430; px < 640; px++) {
      const tp = clamp((px - 430) / 46, 0, 1);
      const h = R((6 + vnoise(px * 0.03, 8) * 12 + (px - 430) * 0.05) * tp);
      if (h < 1) continue;
      P(x, mixHex('#141024', '#3a2032', k), px, SANDY - h, 1, h);
      P(x, mixHex('#241d2e', '#8a5044', k), px, SANDY - h, 1, 1);
    }
    const grng = new SeededRandom(551);
    for (let i = 0; i < 90; i++) {
      const gx2 = R(grng.range(436, 638)), gh = R(grng.range(5, 13));
      const gy2 = SANDY - R((6 + vnoise(gx2 * 0.03, 8) * 12 + (gx2 - 430) * 0.05) * clamp((gx2 - 430) / 46, 0, 1));
      for (let j = 0; j < gh; j++) P(x, j > gh - 3 ? mixHex('#3b4436', '#c88a52', k) : mixHex('#1b2420', '#4a3030', k), gx2 + R(j * j * 0.05 * (grng.next() > 0.5 ? 1 : -1)), gy2 - j);
    }
        // pebbles, shells and weed
    const prng = new SeededRandom(3311);
    for (let i = 0; i < 260; i++) {
      const px = R(prng.range(0, 640)), py = R(prng.range(SANDY + 6, 360));
      const r = prng.range(0.8, 2.6);
      const dark = prng.next() > 0.5;
      const pc = dark ? ['#4b3f4c', '#332a36', '#1c1620'] : ['#6c5c63', '#4a3f49', '#2b2430'];
      ditherDisc(x, px, py, r, r * 0.7, pc.map(h => mixHex(h, mixHex(h, '#c07a52', 0.5), k)));
      P(x, rgbaq('#000000', 0.35), px + 1, py + 2, Math.max(1, R(r)), 1);
      // dawn catches the seaward edge of each stone
      if (k > 0.4 && r > 1.4) P(x, rgbaq('#ffc27a', (k - 0.4) * 0.8), px + R(r * 0.5), py - R(r * 0.4), 1, 1);
    }
    for (let i = 0; i < 26; i++) {
      const px = R(prng.range(0, 640)), py = R(prng.range(SANDY + 4, 356));
      for (let j = 0; j < 7; j++) P(x, prng.next() > 0.5 ? mixHex('#2c3a2c', '#6a4838', k) : mixHex('#161f1c', '#3a2424', k), px + j, py + R(Math.sin(j * 0.9 + i) * 2));
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
  const FH = 46, FW = 40, FC = 20;
  for (let fr = 0; fr < 6; fr++) {
    const c = can(FW, FH + 12), x = cx2(c);
    const seed = 100 + fr * 37;
    for (let y = 0; y < FH; y++) {
      const u = 1 - y / FH;
      const wob = Math.sin(y * 0.24 + fr * 1.05) * (1 - u) * 4.6 + Math.sin(y * 0.10 + fr * 2.1) * 2.4;
      const w = Math.max(0, R((2 + Math.pow(u, 0.85) * 13) * (0.72 + vnoise(seed + y * 0.26, fr) * 0.55)));
      if (w < 1) continue;
      const cxp = FC + R(wob * (1 - u) * 1.2);
      for (let dx = -w; dx <= w; dx++) {
        const q = Math.abs(dx) / w;
        // six bands across the flame: dull red skin, orange, amber, white core
        let bi = 6 - Math.floor(q * 5.0 + (1 - u) * 1.3);
        if (q * 5.0 - Math.floor(q * 5.0) > bay(cxp + dx, y + fr)) bi--;
        bi = Math.max(0, Math.min(6, bi));
        P(x, DP.fire[bi], cxp + dx, FH - y);
      }
    }
    // a few detached licks of flame above the crown
    for (let i = 0; i < 5; i++) {
      const lx = FC + R(Math.sin(i * 2.1 + fr) * 5), ly = R(4 + hash2(i, fr) * 8);
      P(x, DP.fire[3 + (i & 1)], lx, ly, 1, 2);
    }
    // logs in the fire, lit from within
    for (let i = 0; i < 28; i++) P(x, i % 5 === 0 ? '#1a1218' : '#332330', 3 + i, FH + 1 + R(Math.sin(i * 0.4)), 2, 4);
    for (let i = 0; i < 20; i++) P(x, i % 4 === 0 ? '#2a1c20' : '#4a3340', 8 + i, FH - 1 + R(Math.cos(i * 0.5)), 2, 4);
    // glowing coals between the logs
    for (let i = 0; i < 9; i++) {
      const gi = (fr + i) % 3;
      P(x, DP.fire[gi === 0 ? 1 : gi === 1 ? 3 : 5], 6 + i * 3, FH + 2, 2, 1);
      P(x, DP.fire[gi === 2 ? 2 : 0], 6 + i * 3, FH + 3, 2, 1);
    }
    A.flame.push(spr(c, FC, FH + 6));
  }
  // ---- shadows, baked once
  A.herShadow = bakeDisc(82, 13, ['#0e0a12', '#171120', '#211929']);
  A.logShadow = bakeDisc(58, 7, ['#0e0a12', '#171120']);

  // ---- the surf, baked as one looping cycle of frames.  Rasterizing this
  //      per frame cost more than everything else in the scene put together.
  const SURF_TOP = SANDY - 40, SURF_H = 86;
  A.surfTop = SURF_TOP; A.surfPer = 4.2;
  A.surf = []; A.surfW = [];
  const SN = 22;
  for (let pass = 0; pass < 2; pass++) {
  const FOAM = pass ? DP.foamW : DP.foam;
  for (let fr = 0; fr < SN; fr++) {
    const T = fr / SN * A.surfPer;
    const c = can(640, SURF_H), x = cx2(c);
    const img = x.createImageData(640, SURF_H), d = img.data;
    const put = (px, py, hex, a) => {
      if (px < 0 || px > 639 || py < 0 || py >= SURF_H) return;
      const col = hexToRgb(hex), i = (py * 640 + px) * 4;
      const al = Math.max(0, Math.min(1, a));
      d[i] = col[0] * al + d[i] * (1 - al);
      d[i + 1] = col[1] * al + d[i + 1] * (1 - al);
      d[i + 2] = col[2] * al + d[i + 2] * (1 - al);
      d[i + 3] = Math.min(255, d[i + 3] + 255 * al);
    };
    for (let w = 0; w < 3; w++) {
      const ph = ((T / A.surfPer) + w / 3) % 1;
      const reach = Math.pow(Math.sin(ph * Math.PI), 0.7);
      const y0 = (SANDY - 30 + w * 12) + reach * (20 + w * 7) - SURF_TOP;
      const bright = 0.45 + reach * 0.55;
      for (let px = 0; px < 640; px++) {
        const n = vnoise(px * 0.015 + w * 5, T * 0.25 + w);
        const gap = vnoise(px * 0.008 + w * 11, T * 0.1);
        if (gap < 0.30) continue;
        const wob = Math.sin(px * 0.031 + T * (1.2 + w * 0.35) + w * 2) * 3.0 + (n - 0.5) * 7;
        const y = R(y0 + wob);
        const thick = 1 + (n > 0.58 ? 1 : 0) + (n > 0.78 ? 1 : 0);
        for (let q = 0; q < thick; q++) put(px, y + q, FOAM[3], bright);
        put(px, y + thick, FOAM[2], bright * 0.8);
        const run = R(reach * (12 + w * 5));
        for (let q = 1; q < run; q++) {
          const a = (1 - q / run) * 0.55 * bright;
          if (bay(px, y + q) < a) put(px, y + thick + q, FOAM[q > run * 0.6 ? 0 : 1], a + 0.25);
        }
        if (n > 0.45) put(px, y - 1, pass ? '#2a1020' : '#0a1522', 0.45);
      }
    }
    x.putImageData(img, 0, 0);
    (pass ? A.surfW : A.surf).push(c);
  }
  }
  // ---- swell lines out on the water, as scrolling 640-wide strips
  A.swell = []; A.swellW = [];
  for (let pass = 0; pass < 2; pass++) {
    const FOAM = pass ? DP.foamW : DP.foam;
    for (let i = 0; i < 7; i++) {
      const c = can(640, 2), x = cx2(c);
      const u = i / 6;
      for (let px = 0; px < 640; px++) {
        const n = vnoise(px * 0.022, i * 4.1);
        // out under the dawn the swell lines run hotter still
        const hot = pass ? Math.max(0, 1 - Math.abs(px - 516) / 240) : 0;
        if (n > 0.70 - u * 0.10) P(x, rgbaq(FOAM[hot > 0.5 ? 3 : u > 0.6 ? 2 : 1], 0.35 + u * 0.35 + hot * 0.2), px, 0, 1 + (n > 0.84 ? 2 : 0), 1);
      }
      (pass ? A.swellW : A.swell).push(c);
    }
  }

  // ---- firelight pool on the sand: four posterised rings of warm colour,
  //      baked at four intensities and blitted
  A.pool = [];
  const PW = 330, PH = 120, PCX = 165, PCY = 46;
  for (let i = 0; i < 4; i++) {
    const c = can(PW, PH), x = cx2(c);
    const gain = 0.72 + i * 0.16;
    for (let y = 0; y < PH; y++) for (let px = 0; px < PW; px++) {
      const d = Math.hypot((px - PCX) / 162, (y - PCY) / 66);
      if (d >= 1) continue;
      const v = Math.pow(1 - d, 1.7) * gain;
      // four hard bands, dithered where they meet
      let b = v * 4.0;
      let bi2 = Math.floor(b); if (b - bi2 > bay(px, y)) bi2++;
      if (bi2 <= 0) continue;
      const col = ['#6a2a10', '#a8521a', '#e08a2c', '#ffc35a'][Math.min(3, bi2 - 1)];
      P(x, rgbaq(col, qa(0.16 + Math.min(3, bi2 - 1) * 0.13)), px, y);
    }
    A.pool.push(c);
  }
  A.poolAx = PCX; A.poolAy = PCY;
}

// ---------------------------------------------------- rim lighting
// A rim sprite is the lit edge of a form: every opaque pixel whose neighbour
// in the direction of the light is empty, painted in the light's colour.
// Baked once, then blitted over the sprite at whatever alpha the moment wants.
function rimOf(s, dx, dy, cols) {
  const w = s.c.width, h = s.c.height;
  const src = cx2(can(w, h)); src.drawImage(s.c, 0, 0);
  const sd = src.getImageData(0, 0, w, h).data;
  const c = can(w, h), x = cx2(c);
  const al = (px, py) => (px < 0 || py < 0 || px >= w || py >= h) ? 0 : sd[(py * w + px) * 4 + 3];
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (al(px, py) < 96) continue;
    const d1 = al(px + dx, py + dy) < 96, d2 = al(px + dx * 2, py + dy * 2) < 96;
    if (!d2) continue;
    P(x, d1 ? cols[1] : cols[0], px, py);
  }
  return spr(c, s.ax, s.ay);
}
// A wash is the light that falls on the whole form, not just its edge: the
// sprite's own silhouette filled with a posterised ramp of the light's colour
// running along the light's direction.  Baked once, blitted over the sprite.
function washOf(s, dx, dy, cols) {
  const w = s.c.width, h = s.c.height;
  const c = can(w, h), x = cx2(c);
  x.drawImage(s.c, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  // project every pixel onto the light direction and band it
  let lo = 1e9, up = -1e9;
  for (const [px, py] of [[0, 0], [w, 0], [0, h], [w, h]]) { const v = px * dx + py * dy; if (v < lo) lo = v; if (v > up) up = v; }
  const span = Math.max(1, up - lo);
  const N = cols.length;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const u = 1 - (px * dx + py * dy - lo) / span;      // 1 at the lit face
    let b = u * u * N;
    let bi = Math.floor(b); if (b - bi > bay(px, py)) bi++;
    if (bi <= 0) continue;
    x.fillStyle = cols[Math.min(N - 1, bi - 1)];
    x.fillRect(px, py, 1, 1);
  }
  x.globalCompositeOperation = 'source-over';
  return spr(c, s.ax, s.ay);
}

function buildRims() {
  // the fire is down-left of everything on the beach; the sky is up-right
  const FIRE = [-1, 1], SKY = [1, -1];
  const WARM = ['#8c4a1c', '#ffbe5c'];
  const COLD = ['#1c3458', '#5f8fc4'];
  const DAWN = ['#7a3450', '#ffab7a'];
  A.rim = {};
  // index 0 = the lit edge on the art's -x side, 1 = on its +x side, so a
  // mirrored draw can pick the variant that still faces the right way.
  const mk = (key, s) => {
    if (!s) return;
    const WW = ['rgba(120,52,16,0.16)', 'rgba(184,90,26,0.20)', 'rgba(255,164,70,0.24)'];
    const CW = ['rgba(24,44,86,0.18)', 'rgba(46,82,140,0.18)', 'rgba(108,158,214,0.18)'];
    const DW = ['rgba(96,36,64,0.18)', 'rgba(176,72,74,0.20)', 'rgba(255,152,104,0.22)'];
    A.rim[key] = {
      fire: [rimOf(s, FIRE[0], FIRE[1], WARM), rimOf(s, -FIRE[0], FIRE[1], WARM)],
      cold: [rimOf(s, -SKY[0], SKY[1], COLD), rimOf(s, SKY[0], SKY[1], COLD)],
      dawn: [rimOf(s, -SKY[0], SKY[1], DAWN), rimOf(s, SKY[0], SKY[1], DAWN)],
      fireW: [washOf(s, -0.70, 0.71, WW), washOf(s, 0.70, 0.71, WW)],
      coldW: [washOf(s, -0.71, -0.70, CW), washOf(s, 0.71, -0.70, CW)],
      dawnW: [washOf(s, -0.71, -0.70, DW), washOf(s, 0.71, -0.70, DW)],
    };
  };
  mk('man', CH.side.body); mk('body', CH.otterStand);
  mk('head', CH.otterHead); mk('headBare', A.oHeadBare); mk('log', A.log);
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
  // blood in water: a filament that uncoils, goes with the current, thickens
  // and fades into the cloud it came from
  thread(x, y, n, spd) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), sp = rand(14, 70) * (spd || 1); this.add({ k: 'th', x: x + rand(-3, 3), y: y + rand(-2, 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, life: rand(1.6, 3.6), m: 3.6, col: randi(1, 5), s: randi(1, 2) }); } },
  cur: [0, 0],
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
      else if (p.k === 'th') {
        p.vx += (this.cur[0] - p.vx) * Math.min(1, dt * 1.5);
        p.vy += (this.cur[1] - p.vy) * Math.min(1, dt * 1.5);
        if (p.life < 1.2 && p.s < 3 && Math.random() < dt * 2) p.s++;
      }
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
        case 'th': { const k = p.life / p.m; const ci = clamp(p.col - (k < 0.45 ? 2 : k < 0.75 ? 1 : 0), 0, 5); ctx.fillStyle = DP.blood[ci]; ctx.fillRect(sx, sy, p.s, p.s); break; }
        case 'bu': ctx.fillStyle = rgbaq('#d6ecf8', qa(a * 0.8)); ctx.fillRect(sx, sy, p.s, p.s); ctx.fillStyle = rgbaq('#ffffff', qa(a * 0.5)); ctx.fillRect(sx, sy, 1, 1); break;
      }
    }
  },
};

// =========================================================================
//  TIMINGS
// =========================================================================
// part 1 — the sinking.  The beats that matter are the ones where nothing
// happens: after he takes hold he shakes her, and then there is a long hold
// where the only thing moving in the frame is her blood.
const K1 = {
  impact: 0.00, limp: 0.40, roll: 1.05, swim: 1.95,
  grab: 3.20, shake: 3.60, still: 4.30, haul: 5.00, slip: 5.70,
  sink: 6.30, under: 7.30, fade: 7.60, end: 8.20,
};
// her heart, emptying her into the water.  Six beats, further and further
// apart, and then nothing — the scene does not say she has died, it stops.
const BEATS = [0.00, 0.62, 1.34, 2.20, 3.30, 4.55];
// part 2 — the shore.  He gets the steel out of her, holds the hole shut,
// sews it, plates it, and then fails to start her twice before she comes back.
const K2 = {
  drag: 0.00, pull: 1.15, press: 2.05, stitch: 2.95, hammer: 4.10,
  bolt: 5.05, band: 5.50, pump: 5.95, listen: 7.10, pump2: 7.45,
  listen2: 8.30, grieve: 8.65, cough: 10.10, rise: 10.90,
  surf: 11.70, fade: 12.40, end: 13.00,
};
const HER = { x: 356, y: 264, feet: 310 };
const SHORE_LINES = [
  [0.55, 1.9, 'he would not let go.'],
  [3.35, 1.5, 'stay in there. stay in there.'],
  [6.20, 1.3, 'breathe, you stubborn old cow.'],
  [7.45, 0.9, "don't you dare."],
  [9.25, 1.6, "i'm sorry. i'm sorry."],
  [11.05, 1.6, '...aye. again, then.'],
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
    // CH only exists after buildCharacters(); without it there is nothing to
    // build part 1 out of, so stay unbuilt and let start() no-op safely.
    if (typeof blobField !== 'function' || typeof shadeBlob !== 'function') return;
    if (typeof CH === 'undefined' || !CH.manatee || !CH.otterTorso || !CH.otterHead) return;
    if (typeof drawOtterFace !== 'function' || typeof CPAL === 'undefined') return;
    if (!CH.side || !CH.otterStand || !CH.drawManateeSide || !CH.drawOtterStanding) return;
    buildAnchors();
    buildHim();
    buildTopArt();
    buildTools();
    buildBeach();
    buildRims();
    // Warm every baked canvas by drawing it once now, at build time, so the
    // first frame of the shore does not pay for uploading them all at once.
    {
      const wc = cx2(can(8, 8));
      const warm = o => { if (!o) return; const c = o.c || o; if (c && c.width) wc.drawImage(c, 0, 0, c.width, c.height, 0, 0, 8, 8); };
      for (const k in A) {
        const v = A[k];
        if (Array.isArray(v)) v.forEach(warm);
        else if (k === 'rim') { for (const j in v) for (const q in v[j]) warm(v[j][q]); }
        else warm(v);
      }
      if (typeof CH !== 'undefined') {
        warm(CH.manateeArmor); warm(CH.manateeHurt); warm(CH.manateeBellyA); warm(CH.flipper);
        warm(CH.otterTorso); warm(CH.otterHead); warm(CH.otterArm); warm(CH.otterTail); warm(CH.otterStand);
        for (const k in CH.side) warm(CH.side[k]);
      }
    }
    BUILT = true;
  },

  // ---------------------------------------------------------------- start
  start(x, y, facing) {
    this.init();
    if (!BUILT) { this.phase = 'done'; this.done = true; this.worldActive = false; this.fade = 0; return; }
    this.x = x || 0; this.y = y || 0; this.facing = facing || 1;
    this.t = 0; this.st = 0;
    this.phase = 'sinking'; this.done = false; this.worldActive = true;
    this.zoom = 1; this.drain = 0; this.vign = 0; this.fade = 0; this.shake = 8;
    this.stitches = 0; this.wraps = 0; this.plateOn = 0; this.bolted = 0; this.flare = 0; this.heart = 0;
    this._sfx = 0;
    this.beat = 0; this.pulse = 1; this.gore = 0; this._slipped = 0;
    this.harpIn = 1; this.harpOut = 0; this.soak = 0; this.wopen = 1;
    FX.clear();
    // the water is going somewhere, and everything that comes out of her
    // goes with it
    FX.cur = [-(facing || 1) * rand(8, 16), rand(-7, 7)];
    this.stains = [];
    this.junk = [];
    const f = this.facing;
    this.man = { x: x, y: y, vx: -f * 26, vy: rand(-6, 6), tilt: 0, roll: 0, sink: 0, hurt: 1, alpha: 1 };
    this.ott = { x: x - f * 6, y: y - 4, vx: -f * 150 + rand(-40, 40), vy: rand(-120, 120), ang: 0, spin: rand(6, 11) * (Math.random() < 0.5 ? 1 : -1), s: rigScale() * 0.66, state: 'fly', exp: 'surprised', armA: 0.9, armB: -0.9, alpha: 1 };
    // the first, big gout
    for (let i = 0; i < 7; i++) this.stains.push({ x: x + rand(-16, 16), y: y + rand(-11, 11), r: rand(3, 6), max: rand(9, 19), vx: rand(-7, 7), vy: rand(-5, 5), a: 1 });
    for (let i = 0; i < 5; i++) this.junk.push({ s: i === 0 ? A.plate : i === 3 ? A.hatTop : i === 4 ? A.net : A.strap, x: x + rand(-10, 10), y: y + rand(-8, 8), vx: rand(-90, 90), vy: rand(-70, 70), rot: rand(0, TAU), vr: rand(-5, 5), sink: 0 });
    FX.thread(x, y, 26, 1.7);
    try {
      if (typeof G !== 'undefined' && G && G.particles) { G.particles.blood(x, y, 10); G.particles.splash(x, y, 2.4); G.particles.bubbles(x, y, 10); }
      if (typeof Toon !== 'undefined') { Toon.impact(x, y, 2.2, '#ff8a8a'); Toon.burst(x, y, 1.7, '#c4202c'); Toon.shock(x, y, 110, 0.6, '#e8515a'); }
      if (typeof Gore !== 'undefined' && Gore.burst) Gore.burst(x, y, 2.2);
      if (typeof Audio_ !== 'undefined') { Audio_.hurt(); Audio_.splash(2); Audio_.tone(70, 1.4, 'sawtooth', 0.32, -40); }
    } catch (e) { /* the scene must never take the game down */ }
  },

  // Jump to the very end.  Nothing is left on screen, so the caller can hand
  // straight over to whatever comes next without a frame of black.
  skip() {
    this.phase = 'done'; this.done = true; this.worldActive = false;
    this.fade = 0; this.drain = 0; this.vign = 0; FX.clear();
    this._stainScreen = null;
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
  // where the wound sits in the world this frame, whichever way she is turned
  woundAt(m) {
    const w = A.wnd || { x: 0, y: 0 }, rs = rigScale();
    const ph = (m.roll || 0) * TAU, sy = Math.cos(ph);
    const ang = (m.tilt || 0) * this.facing + Math.sin(ph) * 0.16;
    const lx = w.x * this.facing, ly = w.y * (sy < 0 ? -1 : 1) * Math.max(0.22, Math.abs(sy));
    const c = Math.cos(ang), s2 = Math.sin(ang);
    return [m.x + (lx * c - ly * s2) * rs, m.y + (lx * s2 + ly * c) * rs];
  },

  updateSink(dt, t) {
    // the world slows to a crawl as she goes
    const slow = this.t < K1.limp ? 0.26 : this.t < K1.roll ? 0.52 : 1;
    const d = dt * slow;
    this.t += dt;
    const T = this.t, m = this.man, o = this.ott;
    const [wx, wy] = this.woundAt(m);
    this.wx = wx; this.wy = wy;

    // ---- her heart, emptying her.  Each beat is a gout; the gaps get longer
    //      and then there are no more beats.  Nothing announces it.
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    if (this.beat < BEATS.length && T >= BEATS[this.beat]) {
      this.beat++;
      this.pulse = 1;
      const hard = 1 - (this.beat - 1) / BEATS.length;
      for (let i = 0; i < 3 + R(hard * 4); i++)
        this.stains.push({ x: wx + rand(-7, 7), y: wy + rand(-6, 6), r: 2, max: rand(7, 13 + hard * 12), vx: rand(-11, 11), vy: rand(-8, 8), a: 1 });
      FX.thread(wx, wy, 10 + R(hard * 14), 0.6 + hard);
      try {
        if (typeof G !== 'undefined' && G && G.ocean) G.ocean.splatBlood(wx, wy, 0.6 + hard * 0.5, 26);
        if (typeof Audio_ !== 'undefined') Audio_.tone(46 + hard * 10, 0.30, 'sine', 0.16 * (0.4 + hard), -12);
      } catch (e) { }
    }
    // and between beats it still runs out of her, a thread at a time
    if (T < K1.sink + 0.4 && Math.random() < 3.2 * dt) FX.thread(wx, wy, 1, 0.35);

    // ---- the manatee
    m.x += m.vx * d; m.y += m.vy * d;
    m.vx *= (1 - 1.1 * d); m.vy *= (1 - 1.1 * d);
    m.hurt = Math.max(0, m.hurt - dt * 4);
    if (T > K1.limp) m.tilt = lerp(m.tilt, 0.42 * this.facing, Math.min(1, d * 1.4));
    if (T > K1.roll) m.roll = Math.min(0.5, m.roll + d * 0.30);                 // 0.5 -> fully belly-up
    // he shakes her, twice, and she does not answer
    if (T > K1.shake && T < K1.still) {
      const q = (T - K1.shake) / (K1.still - K1.shake);
      m.lift = Math.sin(q * 15) * (1 - q) * 3.4;
      m.tilt += Math.sin(T * 24) * 0.02;
    } else if (T > K1.haul && T < K1.slip) {
      const q = (T - K1.haul) / (K1.slip - K1.haul);
      m.lift = Math.sin(q * 9) * (1 - q) * 3.0;
    } else m.lift = 0;
    if (T > K1.sink) m.sink = Math.min(1, (T - K1.sink) / (K1.under - K1.sink));
    for (const s of this.stains) {
      s.r = Math.min(s.max, s.r + d * 9);
      s.x += s.vx * d + FX.cur[0] * d * 0.5; s.y += s.vy * d + FX.cur[1] * d * 0.5;
      s.vx *= (1 - 0.8 * d); s.vy *= (1 - 0.8 * d);
      if (T > K1.sink) s.a = Math.max(0, s.a - dt * 0.4);
    }
    if (this.stains.length > 54) this.stains.splice(0, this.stains.length - 54);
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
      if (Math.random() < 0.55) { try { if (typeof G !== 'undefined' && G && G.particles) G.particles.spray(o.x, o.y, o.ang + Math.PI, 1, 40); } catch (e) { } }
      if (T > K1.grab || dist(o.x, o.y, m.x, m.y) < 16) {
        o.state = 'hold';
        try {
          if (typeof Toon !== 'undefined') Toon.impact(o.x, o.y, 0.8, '#eaf8ff');
          if (typeof Audio_ !== 'undefined' && this._sfx <= 0) { this._sfx = 0.2; Audio_.splash(0.8); }
        } catch (e) { }
      }
    } else {
      // holding on.  He has her by the harness at the shoulder, and from here
      // the beats are: shake her, wait, haul, lose her, take hold again.
      const slipping = T > K1.slip && T < K1.sink;
      const back = slipping ? 62 : 38;
      const gx = m.x - this.facing * back * rigScale(), gy = m.y - 8 * rigScale();
      const pull = Math.min(1, d * (T > K1.still && T < K1.haul ? 3 : 9));
      o.x = lerp(o.x, gx, pull);
      o.y = lerp(o.y, gy, pull) + (T > K1.haul && !slipping ? Math.sin(T * 11) * 1.4 : 0);
      o.ang = angleLerp(o.ang, angleTo(m.x, m.y, m.x - this.facing * 40, m.y - 8) + Math.PI, Math.min(1, d * 5));
      // his hands are in her: he is wearing her
      this.gore = Math.min(1, this.gore + dt * 0.55);
      if (T > K1.shake && T < K1.still) {          // shaking her
        const q = Math.sin(T * 24);
        o.armA = 2.4 + q * 0.55; o.armB = -2.4 - q * 0.55; o.exp = 'pain';
        if (this._sfx <= 0) { this._sfx = 0.34; try { Audio_.tone(190, 0.1, 'square', 0.08, -40); } catch (e) { } }
      } else if (T < K1.haul) {                     // and then not moving at all
        o.armA = 2.05; o.armB = -2.05; o.exp = 'shut';
      } else if (slipping) {                        // she is too heavy; she goes
        const q = (T - K1.slip) / (K1.sink - K1.slip);
        o.armA = 1.4 + q * 0.9; o.armB = -1.4 - q * 0.9; o.exp = 'pain';
      } else {
        const q = Math.sin(T * 11);
        o.armA = 2.1 + q * 0.30; o.armB = -2.1 - q * 0.30;
        o.exp = T > K1.sink ? 'drown' : 'pain';
        if (T > K1.haul && this._sfx <= 0 && Math.random() < 0.05) { this._sfx = 0.5; try { Audio_.tone(150, 0.16, 'square', 0.1, -50); } catch (e) { } }
      }
      if (T >= K1.slip && !this._slipped) {
        this._slipped = 1;
        try { if (typeof Audio_ !== 'undefined') { Audio_.splash(1.3); Audio_.tone(70, 0.5, 'sawtooth', 0.2, -30); } } catch (e) { }
      }
    }
    if (o.state !== 'hold') { o.exp = o.state === 'fly' ? 'surprised' : 'pain'; }
    if (T > K1.sink) {
      const q = (T - K1.sink) / (K1.under - K1.sink);
      o.sink = Math.min(1, q);
      if (Math.random() < 0.7) { try { if (typeof G !== 'undefined' && G && G.particles) G.particles.bubbles(o.x + rand(-6, 6), o.y, 1); } catch (e) { } }
    } else o.sink = 0;

    // ---- camera push-in, colour drain, vignette, fade
    this.zoom = 1 + Math.pow(Math.min(1, T / K1.under), 0.75) * 0.80;
    this.drain = clamp((T - 0.30) / 2.4, 0, 1) * 0.74;
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
    // fire embers.  It burns down through the grief and is banked back up
    // when she comes back.
    const dying = T > K2.listen && T < K2.cough;
    if (Math.random() < (dying ? 0.45 : 0.9)) FX.ember(120, 308, 1);
    if (Math.random() < (dying ? 0.04 : 0.10)) FX.spark(118 + rand(-8, 8), 300, 2);
    this.flare = Math.max(0, this.flare - dt * 1.6);
    this.fade = T < 1.0 ? qa(1 - T / 1.0) : (T > K2.fade ? clamp((T - K2.fade) / (K2.end - K2.fade), 0, 1) : 0);

    const beat = (a, b) => T >= a && T < b;
    const step = (per, from) => { const ph = (T - from) % per; return ph < dt && T - from > per * 0.4; };

    // ---- the steel comes out of her.  Twice it does not.
    if (beat(K2.pull, K2.press)) {
      const k = (T - K2.pull) / (K2.press - K2.pull);
      if (k < 0.62) {
        this.harpOut = (k < 0.30 ? k / 0.30 * 0.22 : k < 0.44 ? 0.10 : (k - 0.44) / 0.18 * 0.34);
        if (step(0.31, K2.pull)) {
          this.shake = 3.0;
          FX.gore(this.wsx || 300, this.wsy || 250, 4);
          try { if (typeof Audio_ !== 'undefined') { Audio_.noise(0.10, 0.12, 500, 140); Audio_.tone(120, 0.12, 'sawtooth', 0.10, -40); } } catch (e) { }
        }
      } else if (!this.harpFree) {
        // it comes.  All of it, and what it was holding in comes with it.
        this.harpFree = 1; this.harpOut = 1; this.shake = 7;
        FX.gore(this.wsx || 300, this.wsy || 250, 34);
        FX.drop(this.wsx || 300, this.wsy || 250, 16, DP.blood[3], 1.5);
        try { if (typeof Audio_ !== 'undefined') { Audio_.noise(0.34, 0.3, 380, 90); Audio_.tone(64, 0.4, 'sawtooth', 0.24, -30); } } catch (e) { }
      }
      this.soak = Math.min(1, this.soak + dt * (this.harpFree ? 1.4 : 0.25));
      this.gore = Math.min(1, this.gore + dt * 0.5);
    }
    // ---- his weight on the hole, to keep what is left of her inside her
    if (beat(K2.press, K2.stitch)) {
      this.gore = Math.min(1, this.gore + dt * 1.1);
      this.soak = Math.min(1, this.soak + dt * 0.45);
      if (Math.random() < 5 * dt) FX.gore(this.wsx || 300, this.wsy || 250, 1);
      if (step(0.55, K2.press)) { try { Audio_.tone(58, 0.26, 'sine', 0.12, -8); } catch (e) { } }
    }
    // ---- stitching — a stitch every 0.16s, and each one pulls
    if (beat(K2.stitch, K2.hammer)) {
      const n = Math.floor((T - K2.stitch) / 0.16);
      if (n > this.stitches) {
        this.stitches = Math.min(9, n);
        FX.gore(this.wsx || 300, this.wsy || 250, 3);
        this.shake = 1.2;
        try { if (typeof Audio_ !== 'undefined') { Audio_.tone(380, 0.05, 'triangle', 0.07, 200); Audio_.noise(0.04, 0.05, 2200, 700); } } catch (e) { }
      }
      this.soak = Math.min(1, this.soak + dt * 0.18);
    }
    // ---- hammering the plate back into her, one blow every 0.30s
    if (beat(K2.hammer, K2.bolt)) {
      if (step(0.30, K2.hammer)) {
        FX.spark((this.psx || 376), (this.psy || 250), 7);
        FX.gore((this.psx || 376), (this.psy || 250) + 4, 2);
        this.plateOn = Math.min(1, this.plateOn + 0.26);
        this.shake = 2.8;
        try { if (typeof Audio_ !== 'undefined') { Audio_.tone(900 + rand(-90, 90), 0.05, 'square', 0.12, -300); Audio_.noise(0.05, 0.1, 5000, 1200); } } catch (e) { }
      }
    }
    // bolting the harness
    if (beat(K2.bolt, K2.band)) {
      this.bolted = clamp((T - K2.bolt) / 0.45, 0, 1);
      if (Math.floor(T * 7) !== Math.floor(T0 * 7)) { FX.spark(410, 252, 2); try { Audio_.tone(260, 0.07, 'square', 0.06, 60); } catch (e) { } }
    }
    // bandaging
    if (beat(K2.band, K2.pump)) this.wraps = clamp((T - K2.band) / 0.45, 0, 1);
    // ---- pumping the water out of her.  Twice, and the first time is not
    //      enough, and neither is the second.
    const pumping = beat(K2.pump, K2.listen), pumping2 = beat(K2.pump2, K2.listen2);
    if (pumping || pumping2) {
      const per = pumping2 ? 0.34 : 0.42;
      if (step(per, pumping2 ? K2.pump2 : K2.pump)) {
        this.shake = pumping2 ? 4.6 : 3.2;
        const mx = this.mouthX === undefined ? 232 : this.mouthX, my = this.mouthY === undefined ? 268 : this.mouthY;
        FX.drop(mx, my, pumping2 ? 13 : 9, '#bfe0ea', 1);
        FX.drop(mx, my, 5, '#7ea6b4', 0.7);
        FX.drop(mx, my, pumping2 ? 6 : 3, DP.blood[2], 0.8);
        if (this.stitches) FX.gore(this.wsx || 300, this.wsy || 250, 2);
        try { if (typeof Audio_ !== 'undefined') { Audio_.noise(0.14, 0.16, 900, 120); Audio_.tone(110, 0.1, 'sine', 0.12, -30); } } catch (e) { }
      }
    }
    // she comes back
    if (T >= K2.cough && T0 < K2.cough) {
      this.flare = 1; this.shake = 6;
      const mx = this.mouthX === undefined ? 232 : this.mouthX, my = this.mouthY === undefined ? 268 : this.mouthY;
      FX.drop(mx, my, 26, '#cfe8f2', 1.4);
      FX.drop(mx, my, 8, DP.blood[2], 1.0);
      FX.spark(120, 300, 22);
      try {
        if (typeof Audio_ !== 'undefined') { Audio_.noise(0.5, 0.3, 700, 90); Audio_.tone(90, 0.5, 'sawtooth', 0.25, 70); }
      } catch (e) { }
    }
    if (T >= K2.cough && T < K2.rise) {
      this.heart = 1;
      if (Math.floor(T * 5) !== Math.floor(T0 * 5)) FX.drop(this.mouthX === undefined ? 226 : this.mouthX, this.mouthY === undefined ? 266 : this.mouthY, 4, '#a8cddc', 0.8);
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
    const rec = this._stainScreen = [];
    for (const s of this.stains) {
      const sx = s.x - cam.x, sy = s.y - cam.y;
      if (sx < -120 || sy < -120 || sx > 760 || sy > 480) continue;
      ctx.globalAlpha = qa(s.a * 0.80);
      const bi = clamp(Math.round((s.r - 4) / 4), 0, A.bloodDisc.length - 1);
      const bd = A.bloodDisc[bi];
      ctx.drawImage(bd.c, R(sx) - bd.ax, R(sy) - bd.ay);
      ctx.globalAlpha = 1;
      if (rec.length < 24 && s.r > 12) rec.push([R(fx + (sx - fx) * z), R(fy + (sy - fy) * z), bi, s.a]);
    }
    // a dark deep-water hole opening beneath her as she goes down
    if (m.sink > 0) {
      ctx.globalAlpha = qa(m.sink * 0.72);
      const dd = A.darkDisc[clamp(Math.round(((26 + m.sink * 40) - 8) / 8), 0, A.darkDisc.length - 1)];
      ctx.drawImage(dd.c, R(cx) - dd.ax, R(cy + 6) - dd.ay);
      ctx.globalAlpha = 1;
      // the water they disturb lights up cold around the hole they leave
      ctx.globalAlpha = qa(m.sink * (0.30 + Math.sin(t * 3.1) * 0.06));
      const bd2 = A.bioDisc[clamp(Math.round(m.sink * 4), 0, A.bioDisc.length - 1)];
      ctx.drawImage(bd2.c, R(cx) - bd2.ax, R(cy + 6) - bd2.ay);
      ctx.globalAlpha = 1;
    }

    this._bioC = [R(fx + (cx - fx) * z), R(fy + (cy - fy) * z)];

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
      ctx.globalAlpha = qa(1 - m.sink * 0.28);
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
        ctx.globalAlpha = qa((m.sink - 0.35) * 0.45);
        const sd = A.sinkDisc[clamp(Math.round((42 * (1 - m.sink * 0.3) - 14) / 6), 0, A.sinkDisc.length - 1)];
        ctx.drawImage(sd.c, R(cx) - sd.ax, R(cy + m.sink * 5) - sd.ay);
        ctx.globalAlpha = 1;
      }
    }

    // ---- the steel that killed her, still standing out of her shoulder, and
    //      the scrap of net it dragged across her
    if (A.harp && this.wx !== undefined) {
      const hxp = this.wx - cam.x, hyp = this.wy - cam.y;
      const rs = rigScale() * (1 - m.sink * 0.30);
      ctx.save();
      ctx.globalAlpha = qa(1 - m.sink * 0.35);
      ctx.translate(R(hxp), R(hyp + m.sink * 5));
      ctx.rotate((m.tilt || 0) * this.facing + Math.sin((m.roll || 0) * TAU) * 0.16 - this.facing * 0.55);
      ctx.scale(this.facing * rs, rs);
      ctx.drawImage(A.harp.c, -A.harp.ax, -A.harp.ay);
      ctx.restore(); ctx.globalAlpha = 1;
      // the blood coming out around it, one pumped gout at a time
      const pl = this.pulse;
      if (pl > 0.02) {
        const rr = R(4 + pl * 9);
        for (let a2 = 0; a2 < 10; a2++) {
          const an = a2 / 10 * TAU + t * 0.3;
          const px2 = R(hxp + Math.cos(an) * rr), py2 = R(hyp + Math.sin(an) * rr * 0.7);
          P(ctx, pl > 0.6 ? DP.blood[4] : DP.blood[3], px2, py2, 2, 1);
        }
      }
      P(ctx, DP.blood[0], R(hxp) - 3, R(hyp) - 2, 7, 5);
      P(ctx, DP.blood[2], R(hxp) - 2, R(hyp) - 1, 5, 3);
      P(ctx, DP.blood[4], R(hxp) - 1, R(hyp), 2, 1);
    }
    // ---- the blood in the water, between her and the surface
    FX.render(ctx, -cam.x, -cam.y);

    // ---- him
    const ox = o.x - cam.x, oy = o.y - cam.y;
    this._irisX = R(lerp(fx, ox, 0.6)); this._irisY = R(lerp(fy, oy, 0.6));
    const osk = 1 - (o.sink || 0) * 0.3;
    drawOtterTop(ctx, {
      x: ox, y: oy + (o.sink || 0) * 4, ang: o.ang, s: rigScale() * 0.66 * osk,
      exp: o.exp, arms: [o.armA === undefined ? 0.9 : o.armA, o.armB === undefined ? -0.9 : o.armB],
      alpha: 1 - (o.sink || 0) * 0.22,
      headR: o.state === 'hold' ? Math.sin(T * 9) * 0.12 : 0,
    }, t);
    // the grip: two knuckle-white paws on her harness
    if (o.state === 'hold') {
      const gx = R(lerp(ox, cx, 0.42)), gy = R(lerp(oy, cy, 0.42));
      const gr = this.gore || 0;
      P(ctx, DP.ink, gx - 2, gy - 3, 5, 3); P(ctx, gr > 0.35 ? DP.blood[2] : '#f0e0bd', gx - 1, gy - 2, 3, 1);
      P(ctx, DP.ink, gx - 2, gy + 1, 5, 3); P(ctx, gr > 0.55 ? DP.blood[3] : '#f0e0bd', gx - 1, gy + 2, 3, 1);
      if (gr > 0.2) for (let i = 0; i < R(gr * 5); i++) P(ctx, DP.blood[1 + (i & 2)], gx - 3 + R(hash2(i, 3) * 7), gy - 4 + R(hash2(i, 9) * 9), 1, 1);
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
      // The colour does not drain to grey — it drains DOWN, into cold deep
      // water.  Multiply pushes everything toward abyssal blue; screen then
      // lifts the shadows into a bruised violet, so the frame is still full
      // of colour, just a colour with no warmth left in it.
      const dr = this.drain;
      try {
        ctx.globalCompositeOperation = 'multiply';
        if (ctx.globalCompositeOperation === 'multiply') {
          ctx.globalAlpha = qa(dr * 0.95);
          ctx.fillStyle = '#25468e'; ctx.fillRect(0, 0, 640, 360);
        }
        ctx.globalCompositeOperation = 'screen';
        if (ctx.globalCompositeOperation === 'screen') {
          ctx.globalAlpha = qa(dr * 0.28);
          ctx.fillStyle = '#1e1038'; ctx.fillRect(0, 0, 640, 360);
        }
      } catch (e) { /* fall through to the flat cast below */ }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // and a last flat cast of deep-sea blue over the whole plate
      P(ctx, rgbaq(DP.deep[1], dr * 0.38), 0, 0, 640, 360);
      // ...but the blood stays red.  The world layer and this logical screen
      // share one 1:1 grid in this game, so the positions recorded by
      // renderWorld land in the right place; if it was never called we skip.
      const rec = this._stainScreen;
      if (rec && rec.length && this.worldActive) {
        // paint the hue straight back in, then add light to it, so the blood
        // is not merely un-drained but the one hot thing in a cold frame
        ctx.globalCompositeOperation = 'color';
        if (ctx.globalCompositeOperation === 'color') {
          for (const [bx, by, bi, ba] of rec) {
            const bd = A.bloodDisc[bi];
            ctx.globalAlpha = qa(ba * dr * 0.45);
            ctx.drawImage(bd.c, bx - bd.ax, by - bd.ay);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
    // ---- bioluminescence: cold motes stirred out of the water by the two
    //      of them.  Drawn after the grade, so with the blood they are the
    //      only two colours left alive in the frame.
    {
      const glow = clamp((this.t - 0.6) / 1.8, 0, 1) * (1 - this.fade);
      const C = this._bioC;
      if (glow > 0.02 && C) {
        for (let i = 0; i < 54; i++) {
          const a0 = hash2(i, 3) * TAU, rr = 30 + hash2(i, 11) * 110;
          const dr2 = Math.sin(t * (0.6 + hash2(i, 17) * 1.4) + i) * 8;
          const px = R(C[0] + Math.cos(a0 + t * 0.10) * (rr + dr2));
          const py = R(C[1] + Math.sin(a0 + t * 0.10) * (rr + dr2) * 0.62);
          if (px < 0 || py < 0 || px > 639 || py > 359) continue;
          const tw = 0.5 + 0.5 * Math.sin(t * (1.6 + hash2(i, 23) * 3.2) + i * 2.1);
          const a = glow * tw * (0.5 + hash2(i, 29) * 0.75);
          if (a < 0.12) continue;
          const bi2 = a > 0.70 ? 3 : a > 0.42 ? 2 : 1;
          ctx.fillStyle = rgbaq(DP.biolum[bi2], a);
          ctx.fillRect(px, py, hash2(i, 31) > 0.72 ? 2 : 1, 1);
        }
      }
    }

    // the frame closes down on the two of them: a hard-edged iris, drawn as
    // black rows either side of the opening, with a dithered rim
    const T = this.t;
    const k = clamp((T - K1.swim) / (K1.fade - K1.swim), 0, 1);
    const rad = lerp(330, 62, Math.pow(k, 1.15));
    const icx = R(lerp(320, this._irisX === undefined ? 320 : this._irisX, 0.88));
    const icy = R(lerp(180, this._irisY === undefined ? 180 : this._irisY, 0.88));
    const red = clamp(1 - T / 2.4, 0, 1);
    // the frame is never flat black: it starts as a blood bruise and settles
    // into the deep indigo of water with no light left in it
    const frame = mixHex(mixHex('#050716', DP.bruise[1], clamp((T - 2.0) / 3.0, 0, 1) * 0.46), '#40080f', red * 0.80);
    const soft = clamp(this.vign, 0, 1);
    ctx.fillStyle = frame;
    for (let y = 0; y < 360; y++) {
      const dy = (y - icy) / (rad * 0.62);
      const hw = Math.abs(dy) >= 1 ? -1 : rad * Math.sqrt(1 - dy * dy);
      if (hw < 0) { ctx.globalAlpha = qa(0.92 * soft + 0.08); ctx.fillRect(0, y, 640, 1); continue; }
      ctx.globalAlpha = qa(0.92 * soft + 0.08);
      const l = Math.floor(icx - hw), r = Math.ceil(icx + hw);
      if (l > 0) ctx.fillRect(0, y, l, 1);
      if (r < 640) ctx.fillRect(r, y, 640 - r, 1);
      // a dithered rim so the opening never reads as a clean vector circle
      ctx.globalAlpha = qa(0.5 * soft);
      for (let q = 0; q < 7; q++) {
        if (bay(l + q, y) < 0.6 - q * 0.09) ctx.fillRect(l + q, y, 1, 1);
        if (bay(r - q, y) < 0.6 - q * 0.09) ctx.fillRect(r - q - 1, y, 1, 1);
      }
    }
    // a cold rind of deep-water blue just inside the opening, dithered, so
    // the closing frame reads as water pressing in rather than as a mask
    ctx.fillStyle = DP.deep[3];
    ctx.globalAlpha = qa(0.30 * soft);
    for (let y = 0; y < 360; y += 1) {
      const dy = (y - icy) / (rad * 0.62);
      if (Math.abs(dy) >= 1) continue;
      const hw = rad * Math.sqrt(1 - dy * dy);
      const l = Math.floor(icx - hw), r = Math.ceil(icx + hw);
      for (let q = 0; q < 6; q++) {
        if (bay(l + q + 6, y) < 0.55 - q * 0.08) ctx.fillRect(l + q + 6, y, 1, 1);
        if (bay(r - q - 6, y) < 0.55 - q * 0.08) ctx.fillRect(r - q - 7, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    this.letterbox(ctx, clamp(this.t / 0.8, 0, 1));
    if (this.fade > 0) P(ctx, rgbaq('#000000', this.fade), 0, 0, 640, 360);
  },

  letterbox(ctx, k) {
    const h = R(26 * (k === undefined ? 1 : k));
    if (h <= 0) return;
    P(ctx, '#000000', 0, 0, 640, h);
    P(ctx, '#000000', 0, 360 - h, 640, h);
  },

  // How much coloured light falls on something standing at screen x: warm
  // from the fire on the left, cold night sky or hot dawn on the right.
  litAt(x) {
    const f = this._fire === undefined ? 0.7 : this._fire;
    const d = this._dawn === undefined ? 0 : this._dawn;
    const near = clamp(1 - Math.abs(x - 120) / 330, 0, 1);
    return {
      fire: clamp(f * (0.30 + near * 0.72), 0, 1),
      cold: 0.55 * (1 - d),
      dawn: 0.88 * d,
    };
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
    this._dawn = dawn;

    // The fire's strength for this frame: it is the only warm thing in the
    // first half of the scene, so everything warm is scaled from it.
    const fireUp = 0.62 + (this.flare * 0.5) + (T > K2.listen && T < K2.cough ? -0.26 : 0)
      + Math.sin(T * 7.3) * 0.06 + Math.sin(T * 19.7) * 0.035 + Math.sin(T * 3.1) * 0.05;
    this._fire = fireUp;

    // ---------------------------------------------------------- the surf
    this.drawSurf(ctx, T);

    // -------------------------------------------------------- driftwood
    ctx.globalAlpha = 0.45; ctx.drawImage(A.logShadow.c, 566 - A.logShadow.ax, 332 - A.logShadow.ay); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(564, 326);
    ctx.drawImage(A.log.c, -A.log.ax, -A.log.ay);
    rimBlit(ctx, 'log', this.litAt(564), false);
    ctx.restore();
    ctx.drawImage(A.bucket.c, 178 - A.bucket.ax, 326 - A.bucket.ay);

    // ------------------------------------------------------------- fire
    const pi = clamp(Math.floor(fireUp * 3.4), 0, 3);
    const pool = A.pool[pi];
    ctx.globalAlpha = qa(clamp(fireUp * 1.15, 0.25, 1));
    ctx.drawImage(pool, 120 - A.poolAx, 314 - A.poolAy);
    ctx.globalAlpha = 1;
    // a tight, hotter core of light right under the logs
    ctx.globalAlpha = qa(clamp(fireUp * 0.75, 0.2, 0.8));
    ctx.drawImage(A.pool[3], 120 - A.poolAx + 82, 316 - A.poolAy + 18, 166, 60);
    ctx.globalAlpha = 1;
    const fl = A.flame[Math.floor(T * 14) % A.flame.length];
    ctx.save();
    const fs = clamp(fireUp * 1.25, 0.45, 1.45);
    ctx.translate(120, 316); ctx.scale(1, fs);
    ctx.drawImage(fl.c, -fl.ax, -fl.ay);
    ctx.restore();

    // ------------------------------------------- her, lying on the sand
    this.drawHer(ctx, T, t);

    // ------------------------------------------------------------- him
    this.drawHim(ctx, T, t);

    // ----------------------------------------------------------- sparks
    FX.render(ctx, 0, 0);

    // a vignette that starts as blue-black night and warms to a plum dawn
    const vg = mixHex('#04060e', '#2a0c1c', dawn);
    for (let i = 0; i < 14; i++) {
      const inset = i * 6, a = qa(0.10 - i * 0.006);
      if (a <= 0) break;
      ctx.fillStyle = rgbaq(vg, a);
      ctx.fillRect(0, inset, 640, 1); ctx.fillRect(0, 359 - inset, 640, 1);
      ctx.fillRect(inset, 0, 1, 360); ctx.fillRect(639 - inset, 0, 1, 360);
    }
    ctx.restore();

    // ------------------------------------------------------------- text
    this.letterbox(ctx, 1);
    for (const [at, dur, line] of SHORE_LINES) {
      if (T < at || T > at + dur + 0.7) continue;
      const prog = T - at;
      const n = Math.max(0, Math.min(line.length, Math.floor(prog * 34)));
      const shown = line.slice(0, n);
      const a = T > at + dur ? qa(1 - (T - at - dur) / 0.7) : 1;
      ctx.globalAlpha = a;
      const tc = mixHex('#cfdcea', '#ffd9a6', dawn);
      pixelTextOutlined(ctx, shown, 320, 344, 8, tc, '#000000', 'center');
      if (n < line.length && (Math.floor(prog * 8) & 1)) P(ctx, tc, 320 + R(textWidth(shown, 8) / 2) + 2, 345, 4, 7);
      ctx.globalAlpha = 1;
    }
    if (T < 1.4) {
      ctx.globalAlpha = qa(clamp((T - 0.7) / 0.6, 0, 1) * clamp((1.4 - T) / 0.3, 0, 1));
      pixelTextOutlined(ctx, 'SOMEWHERE ON THE SHORE', 320, 20, 7, '#8ea4b8', '#000000', 'center');
      ctx.globalAlpha = 1;
    }
    if (this.fade > 0) P(ctx, rgbaq('#000000', this.fade), 0, 0, 640, 360);
  },

  // ---- rolling surf on the sand (baked frames, blitted) ------------------
  drawSurf(ctx, T) {
    const SY = A.SANDY, HZ = A.HORIZON;
    // the water picks up the sky: a cold foam set and a warm one, crossfaded
    const d = this._dawn === undefined ? 0 : this._dawn;
    const w = qa(clamp((d - 0.12) / 0.7, 0, 1));
    // swell out on the water: scrolling strips, wrapped
    for (let i = 0; i < 7; i++) {
      const u = i / 6;
      const y = R(HZ + 3 + Math.pow(u, 1.6) * (SY - HZ - 16) + Math.sin(T * 0.6 + i * 1.7) * 1.4);
      const off = R(T * (6 + u * 22)) % 640;
      if (w < 1) { const c = A.swell[i]; ctx.globalAlpha = qa(1 - w); ctx.drawImage(c, -off, y); ctx.drawImage(c, 640 - off, y); }
      if (w > 0) { const c = A.swellW[i]; ctx.globalAlpha = w; ctx.drawImage(c, -off, y); ctx.drawImage(c, 640 - off, y); }
      ctx.globalAlpha = 1;
    }
    // the shorebreak
    const fr = Math.floor(((T % A.surfPer) / A.surfPer) * A.surf.length) % A.surf.length;
    if (w < 1) { ctx.globalAlpha = qa(1 - w); ctx.drawImage(A.surf[fr], 0, A.surfTop); }
    if (w > 0) { ctx.globalAlpha = w; ctx.drawImage(A.surfW[fr], 0, A.surfTop); }
    ctx.globalAlpha = 1;
  },

  // ---- the manatee on the sand ------------------------------------------
  drawHer(ctx, T, t) {
    const dragK = clamp((T - K2.drag) / 1.15, 0, 1);
    const goK = T > K2.surf ? clamp((T - K2.surf) / 1.3, 0, 1) : 0;
    const de = dragK * dragK;
    const mx = R(lerp(HER.x + 92, HER.x, de) + goK * goK * 150);
    const my = R(lerp(HER.y - 20, HER.y, de) - goK * goK * 34);
    const HL = MA.len / 2, HH = MA.hgt / 2;
    const rib = dx => herBot(dx);
    const top = dx => herTop(dx);

    // ---- the track she has been dragged along: wet sand, and her blood
    //      down the middle of it
    if (dragK < 1 || T < K2.hammer) {
      const fade = T < K2.pull ? 1 : clamp(1 - (T - K2.pull) / 2.4, 0, 1);
      ctx.globalAlpha = qa(0.75 * fade);
      const y0 = my + 14, y1 = A.SANDY + 10;
      for (let i = 0; i < 120; i++) {
        const q = i / 120;
        const fyy = R(lerp(y0, y1, q)), fxx = R(mx + HL * 0.18 + q * 64);
        const hw = R(16 - q * 7);
        for (let w = -hw; w <= hw; w++) {
          if (bay(fxx + w, fyy) > (0.66 - Math.abs(w) / (hw * 2.1)) * (1 - q * 0.45)) continue;
          const mid = Math.abs(w) < 5 && hash2(fxx, w) > 0.40;
          P(ctx, mid ? (hash2(fxx, w + 3) > 0.6 ? DP.blood[1] : DP.blood[0]) : Math.abs(w) > hw - 4 ? '#6a5560' : '#171220', fxx + w, fyy);
        }
      }
      ctx.globalAlpha = 1;
    }

    // she jolts under his hands, and later breathes
    let conv = 0, breathe = 0;
    const pumping = (T > K2.pump && T < K2.listen) || (T > K2.pump2 && T < K2.listen2);
    if (pumping) conv = Math.sin((T - K2.pump) * 15) * 1.6;
    if (T > K2.pull && T < K2.stitch) conv = Math.sin(T * 7) * 0.8;
    if (T > K2.cough && T < K2.cough + 0.6) conv = Math.sin((T - K2.cough) * 26) * 3.6 * (1 - (T - K2.cough) / 0.6);
    if (T > K2.cough) breathe = Math.sin((T - K2.cough) * 4.2) * clamp((T - K2.cough) / 0.8, 0, 1);
    if (goK > 0) conv += Math.sin(T * 9) * 1.6 * goK;

    ctx.save();
    ctx.translate(mx, my + R(conv));
    ctx.rotate(-0.03 - goK * 0.06);

    // ---- what has come out of her, soaked into the sand under her
    if (this.soak > 0.01 && goK < 0.5) {
      const sk = this.soak;
      ctx.globalAlpha = qa(0.92 * (1 - goK * 2));
      const bd = A.soakDisc[clamp(Math.round((16 + sk * 30 - 10) / 7), 0, A.soakDisc.length - 1)];
      ctx.drawImage(bd.c, MA.wound[0] - bd.ax, rib(MA.wound[0]) + 2 - bd.ay);
      ctx.globalAlpha = qa(0.7 * sk);
      const bd2 = A.soakDisc[clamp(Math.round((10 + sk * 16 - 10) / 7), 0, A.soakDisc.length - 1)];
      ctx.drawImage(bd2.c, MA.wound[0] - 34 - bd2.ax, rib(MA.wound[0] - 34) + 6 - bd2.ay);
      ctx.globalAlpha = 1;
    }
    // cast shadow on the sand
    ctx.globalAlpha = qa(0.55 - goK * 0.45);
    ctx.drawImage(A.herShadow.c, 4 - A.herShadow.ax, rib(0) - 3 - A.herShadow.ay);
    ctx.globalAlpha = 1;

    const lit = this.litAt(mx);
    // ---- her: the cast's own side-on manatee, lying on the sand
    const face = T > K2.cough + 0.9 ? 'calm' : T > K2.cough ? 'wide'
      : pumping ? 'pain' : 'dead';
    CH.drawManateeSide(ctx, {
      x: 0, y: breathe ? R(breathe * -1) : 0, flip: true, scale: MSC,
      exp: face, blink: false,
      phase: T > K2.rise ? T * 5 : 0, tailAmp: T > K2.rise ? 0.20 : 0,
      flipperA: T > K2.cough ? 2.15 + Math.sin(T * 7) * 0.2 : 2.55,
    }, t);
    // the fire on one flank of her, the sky on the other
    ctx.save(); ctx.scale(-MSC, MSC);
    rimBlit(ctx, 'man', lit, true);
    ctx.restore();

    // =================================================== what was done to her
    const wx = MA.wound[0], wy = MA.wound[1] + (breathe ? R(breathe * -1) : 0);
    this.wsx = mx + wx; this.wsy = my + wy + R(conv);
    this.psx = mx + MA.plate[0]; this.psy = my + MA.plate[1];
    this.mouthX = mx + MA.mouth[0] - 6; this.mouthY = my + MA.mouth[1] + 2;

    const covered = Math.min(9, this.stitches);
    const closed = clamp(covered / 9, 0, 1);
    // ---- the cut the wire opened, running down off her shoulder
    for (let i = 0; i < 21; i++) {
      const x = wx + R(i * 0.5), y = wy + i;
      const done = i < closed * 21;
      const w = 3 + (hash2(i, 5) > 0.6 ? 1 : 0);
      P(ctx, DP.blood[0], x - 1, y, w + 2, 1);
      if (!done) {
        P(ctx, DP.blood[2], x, y, w, 1);
        if ((i & 2) === 0) P(ctx, DP.blood[4], x + 1, y, 1, 1);
        if (hash2(i, 13) > 0.72) P(ctx, '#d8c2ac', x - 1, y, 1, 1);   // opened fat
      }
    }
    // ---- the hole the steel was in
    if (T > K2.pull) {
      const open = clamp(1 - closed * 1.1, 0, 1);
      if (open > 0.02) {
        const rw = R(4 + open * 4), rh = R(3 + open * 3);
        for (let y = -rh; y <= rh; y++) {
          const k = 1 - (y / (rh + 0.5)) * (y / (rh + 0.5)); if (k <= 0) continue;
          const hw = R(rw * Math.sqrt(k) * (0.78 + hash2(y, 3) * 0.44));
          for (let x = -hw; x <= hw; x++) {
            const d2 = Math.hypot(x / (hw + 0.5), y / rh);
            P(ctx, d2 > 0.80 ? DP.blood[3] : d2 > 0.52 ? DP.blood[1] : '#140104', wx + x, wy - 3 + y);
          }
        }
        P(ctx, DP.blood[4], wx - 1, wy - 3 - rh, 3, 1);
        P(ctx, '#d8c2ac', wx - rw, wy - 3, 1, 1); P(ctx, '#d8c2ac', wx + rw, wy - 2, 1, 1);
      }
    }
    // ---- blood running down her flank and off her into the sand
    if (this.soak > 0.02 && closed < 0.98) {
      const run = rib(wx) - wy;
      for (let i = 0; i < 6; i++) {
        const len = R(run * (0.25 + hash2(i, 7) * 0.75) * (1 - closed * 0.7));
        let rx = wx - 5 + i * 3;
        for (let y = 0; y < len; y++) {
          if (hash2(i * 13, y) > 0.86) rx += hash2(i, y) > 0.5 ? 1 : -1;
          const w = y > len - 5 ? 2 : 1;
          P(ctx, y > len - 5 ? DP.blood[0] : hash2(i, y) > 0.78 ? DP.blood[3] : DP.blood[1], rx, wy + y, w, 1);
        }
      }
    }
    // ---- the stitches: heavy, spaced, pulled tight through the hide
    for (let i = 0; i < covered; i++) {
      const x = wx + R(i * 1.1), y = wy + R(i * 2.2);
      LN(ctx, DP.bone, x - 4, y - 2, x + 4, y + 2);
      LN(ctx, DP.bone, x + 4, y - 2, x - 4, y + 2);
      P(ctx, DP.ink, x, y, 1, 1);
      P(ctx, DP.blood[1], x - 4, y + 2, 1, 1); P(ctx, DP.blood[1], x + 4, y + 2, 1, 1);
    }
    // ---- the steel plate, hammered back down over the lot of it
    {
      const px = MA.plate[0], py = MA.plate[1], k = this.plateOn;
      for (let i = 0; i < 4; i++) { P(ctx, DP.ink, px - 11 + i * 7, py - 7, 3, 2); P(ctx, DP.ink, px - 11 + i * 7, py + 6, 3, 2); }
      if (k > 0) {
        ctx.save();
        ctx.translate(px, R(py - (1 - k) * 14));
        ctx.rotate((1 - k) * 0.4);
        ctx.scale(MSC, MSC);
        ctx.drawImage(A.platS.c, -A.platS.ax, -A.platS.ay);
        ctx.restore();
        if (k > 0.3) for (let i = 0; i < 6; i++) P(ctx, DP.blood[1], px - 13 + i * 5, py + R(9 + hash2(i, 3) * 4), 2, 1);
      }
    }
    // ---- the harness strap, bolted back down across her girth
    if (this.bolted > 0) {
      const sx = MA.strap[0], ya = top(sx), yb = rib(sx), h = R(this.bolted * (yb - ya));
      for (let i = 0; i < h; i++) {
        const y = ya + i, xx = sx + R(Math.sin(y / 30) * 3);
        P(ctx, DP.ink, xx - 1, y, 6, 1);
        P(ctx, CPAL.leaD, xx, y, 4, 1);
        if ((i & 3) === 1) P(ctx, CPAL.lea, xx, y, 4, 1);
      }
      if (this.bolted > 0.6) { const my2 = R((top(sx) + rib(sx)) / 2); P(ctx, DP.ink, sx - 1, my2 - 3, 6, 7); P(ctx, CPAL.goldD, sx, my2 - 2, 4, 5); P(ctx, CPAL.gold, sx, my2 - 2, 4, 1); }
    }
    // ---- the bandage round the tail stock, soaking through
    if (this.wraps > 0) {
      const bx = MA.band[0], n = R(this.wraps * 4);
      for (let i = 0; i < n; i++) {
        const x = bx - 2 + i * 6, ya = top(x), yb = rib(x), mid = (ya + yb) / 2, hh = (yb - ya) / 2;
        for (let y = ya; y <= yb; y++) {
          const k = Math.abs(y - mid) / (hh + 1), xx = x + R(Math.sin(k * 1.4) * 3);
          P(ctx, DP.ink, xx - 1, y, 1, 1);
          P(ctx, DP.bandage[1], xx, y, 3, 1);
          if ((y & 3) === 0) P(ctx, DP.bandage[2], xx, y, 2, 1);
          if (hash2(x, y | 0) > 0.72) P(ctx, DP.blood[0], xx + 1, y, 2, 1);
          if (hash2(x + 7, y | 0) > 0.93) P(ctx, DP.blood[2], xx + 1, y, 1, 1);
        }
      }
    }
    // ---- the net, still round her tail, until he cuts it away
    if (T < K2.band) {
      ctx.save(); ctx.translate(MA.band[0] + 10, 4); ctx.scale(MSC, MSC); ctx.rotate(0.18);
      ctx.drawImage(A.net.c, -A.net.ax, -A.net.ay);
      ctx.restore();
    }
    // ---- and the steel, until he gets it out of her
    if (this.harpOut < 1) {
      ctx.save();
      ctx.translate(wx + R(this.harpOut * 12), wy - 3 - R(this.harpOut * 8));
      ctx.rotate(-0.85); ctx.scale(MSC, MSC);
      ctx.drawImage(A.harp.c, -A.harp.ax, -A.harp.ay);
      ctx.restore();
    }
    ctx.restore();

    // water and blood coming out of her, in screen space
    const spitting = (pumping && Math.sin((T - K2.pump) * 15) > 0.3) || (T > K2.cough && T < K2.cough + 0.8);
    if (spitting) {
      const wx2 = this.mouthX, wy2 = this.mouthY;
      for (let i = 0; i < 16; i++) {
        const q = hash2(i, Math.floor(T * 30));
        P(ctx, q > 0.74 ? DP.blood[2] : q > 0.4 ? '#bfe0ea' : '#7ea6b4', R(wx2 - q * 18), R(wy2 + i * 1.8 + q * 6), 2, 1);
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
    const HL = MA.len / 2, HH = MA.hgt / 2;
    const backY = lx => herTop(lx);
    const o = { flip: true, exp: 'focus', hat: true, gore: this.gore || 0, tail: 0.30 };
    let x = hx, y = FEET, rot = 0;
    // kneeling on her back, a little behind whatever he is working on
    const onBack = (anchor, dx, dy) => {
      const lx = anchor[0] + dx;
      x = R(hx + lx); y = R(hy + backY(lx) - 8 + (dy || 0));
    };
    const RAISED = -1.15, STRUCK = 1.05;

    if (T < K2.pull) {
      // hauling her the last few feet, leaning into a rope over his shoulder
      const k = clamp(T / 1.15, 0, 1);
      x = R(lerp(HER.x - 118, HER.x - 152, k)); y = FEET;
      rot = -0.24 + Math.sin(T * 6) * 0.05;
      o.armNear = -1.05 + Math.sin(T * 6) * 0.20; o.armFar = -0.92;
      o.exp = 'strain'; o.headR = -0.14;
      const rx0 = x - 14, ry0 = y - 22;
      for (let i = 0; i <= 46; i++) {
        const q = i / 46;
        const rx = R(lerp(rx0, hx - HL * 0.55, q)), ry = R(lerp(ry0, hy + 6, q) + Math.sin(q * Math.PI) * 8);
        P(ctx, i % 4 === 0 ? CPAL.leaD : CPAL.lea, rx, ry, 2, 2);
      }
      if (Math.random() < 0.25) FX.drop(x + 10, FEET, 1, '#584a59', 0.35);
    } else if (T < K2.press) {
      // one foot braced on her, both paws on the shaft, hauling the steel
      // back out of her the way it went in
      const k = (T - K2.pull) / (K2.press - K2.pull);
      const yank = this.harpFree ? 1 : Math.abs(Math.sin(k * 10));
      x = R(hx + MA.wound[0] + 40 + yank * 10);
      y = R(hy + backY(MA.wound[0] + 40) - 10);
      rot = -0.26 - yank * 0.16;
      o.armNear = -0.95 + yank * 0.45; o.armFar = -0.80 + yank * 0.45;
      o.exp = 'strain'; o.headR = -0.18;
      if (!this.harpFree) {
        ctx.save(); ctx.translate(R(x - 14), R(y - 14)); ctx.rotate(-0.85); ctx.scale(MSC, MSC);
        ctx.drawImage(A.harp.c, -A.harp.ax, -A.harp.ay); ctx.restore();
      }
    } else if (T < K2.stitch) {
      // both paws in the hole, his whole weight on it, holding her in
      onBack(MA.wound, 18, 6);
      const push = 0.5 + Math.sin(T * 6) * 0.5;
      rot = 0.14 + push * 0.06;
      o.armNear = 1.30 + push * 0.12; o.armFar = 1.18 + push * 0.12;
      o.exp = push > 0.7 ? 'strain' : 'focus'; o.headR = 0.34; o.headY = 2;
    } else if (T < K2.hammer) {
      // sewing the hide shut, hunched right over it
      onBack(MA.wound, 18, 4);
      const ph = ((T - K2.stitch) % 0.16) / 0.16;
      o.armNear = 1.25 - ph * 0.85; o.armFar = 1.05;
      o.exp = 'focus'; o.headR = 0.34; rot = 0.12;
      o.hold = A.needle;
      const px2 = x - 14, py2 = y - 14 - R(ph * 14);
      LN(ctx, DP.bone, px2, py2, hx + MA.wound[0], hy + MA.wound[1] + 4);
    } else if (T < K2.bolt) {
      // hammering the torn plate back into her
      onBack(MA.plate, 16, 0);
      const ph = ((T - K2.hammer) % 0.30) / 0.30;
      o.armNear = ph < 0.55 ? RAISED + ph / 0.55 * (STRUCK - RAISED) : STRUCK + (ph - 0.55) / 0.45 * (RAISED - STRUCK);
      o.armFar = 0.95;
      o.exp = 'strain'; o.headR = 0.18; rot = 0.06;
      o.hold = A.hammer;
    } else if (T < K2.band) {
      onBack(MA.strap, 15, 0);
      o.armNear = 1.05 + Math.sin(T * 13) * 0.35; o.armFar = 1.00;
      o.exp = 'focus'; o.headR = 0.24; rot = 0.08;
      o.hold = A.wrench;
    } else if (T < K2.pump) {
      const k = (T - K2.band) / (K2.pump - K2.band);
      onBack(MA.band, 12 + k * 12, Math.sin(k * 9) * 2);
      o.armNear = 1.05 + Math.sin(T * 9) * 0.45; o.armFar = 0.95 + Math.sin(T * 9 + 1.6) * 0.40;
      o.exp = 'focus'; rot = 0.04; o.headR = 0.22; o.hold = A.roll;
      LN(ctx, DP.bandage[2], x - 12, y - 16, hx + MA.band[0] + 6, hy - 14);
    } else if (T < K2.listen || (T >= K2.pump2 && T < K2.listen2)) {
      // both paws on her chest, throwing his whole weight down through them
      const from = T < K2.listen ? K2.pump : K2.pump2;
      const per = T < K2.listen ? 0.42 : 0.34;
      const ph = ((T - from) % per) / per;
      const push = ph < 0.35 ? ph / 0.35 : 1 - (ph - 0.35) / 0.65;
      onBack(MA.chest, 10, 2 - R(push * 5));
      rot = 0.08 + push * 0.14;
      o.armNear = 0.95 + push * 0.45; o.armFar = 0.88 + push * 0.45;
      o.exp = push > 0.6 ? 'shout' : 'strain';
      o.headR = 0.30;
    } else if (T < K2.grieve) {
      // down at her muzzle, listening for a breath that does not come
      onBack(MA.eye, 22, 10);
      rot = 0.10; o.armNear = 1.20; o.armFar = 1.10;
      o.exp = 'shut'; o.blink = true; o.headR = 0.46; o.headY = 4; o.headX = -2;
      const from = T < K2.pump2 ? K2.listen : K2.listen2;
      if (T < from + 0.7 && (Math.floor(T * 5) & 1)) {
        pixelTextOutlined(ctx, '?', x - 24, y - 46, 8, '#8ea4b8', '#000000', 'center');
      }
    } else if (T < K2.cough) {
      // hat off, head down on her shoulder.  Nothing else happens here.
      const g = clamp((T - K2.grieve) / 0.9, 0, 1);
      onBack(MA.chest, 26, 8);
      rot = 0.06; o.armNear = 1.15; o.armFar = 1.05;
      o.exp = 'shut'; o.blink = true; o.headR = 0.40; o.headY = 4; o.headX = -3;
      o.hat = false; o.grief = g;
      // the hat, off, in the sand beside him
      const hk = clamp((T - K2.grieve) / 0.5, 0, 1);
      ctx.save();
      ctx.translate(R(lerp(x + 20, hx + MA.chest[0] + 118, hk)), R(lerp(y + 4, FEET + 14, hk)));
      ctx.rotate(hk * 0.6); ctx.scale(MSC, MSC);
      ctx.drawImage(A.hatSide.c, -A.hatSide.ax, -A.hatSide.ay);
      ctx.restore();
    } else if (T < K2.rise) {
      // she heaves; he is thrown clear, then scrambles back up
      const k = clamp((T - K2.cough) / 0.8, 0, 1);
      const arc = Math.sin(k * Math.PI);
      onBack(MA.chest, 10 + k * 30, 8 - arc * 30);
      rot = 0.06 - k * 0.26 + Math.sin(k * 12) * 0.20;
      o.armNear = 1.15 - k * 0.7; o.armFar = 1.05 - k * 0.65;
      o.exp = k < 0.4 ? 'surprised' : 'joy'; o.headR = 1.10 - k * 1.2;
      o.hat = k > 0.55;
      if (k <= 0.55) {
        ctx.save();
        ctx.translate(R(hx + MA.chest[0] + 118 - k * 24), R(FEET + 14 - Math.sin(k * 5.7) * 44));
        ctx.rotate(0.5 - k * 2.2); ctx.scale(MSC, MSC);
        ctx.drawImage(A.hatSide.c, -A.hatSide.ax, -A.hatSide.ay);
        ctx.restore();
      }
    } else {
      // the two of them go back into the water together
      const k = clamp((T - K2.surf) / 1.3, 0, 1);
      onBack(MA.chest, 12, 0);
      x = R(x + k * 30); y = R(y - k * 6);
      o.flip = false;
      rot = -0.12 + Math.sin(T * 9) * 0.08;
      o.armNear = 1.0 + Math.sin(T * 9) * 0.35; o.armFar = 0.85 + Math.sin(T * 9 + 2) * 0.35;
      o.exp = 'joy'; o.headR = -0.1;
      if (k > 0.1 && Math.random() < 0.35) FX.drop(x, y + 12, 1, DP.foam[2], 0.5);
    }
    o.x = x; o.y = y; o.rot = rot;
    o.lit = this.litAt(x);
    if (o.blink === undefined) o.blink = (t % 3.1) < 0.1;
    drawOtterSide(ctx, o, t);
    // the fire on him, and the sky behind him
    himFrame(ctx, o, c => {
      rimBlit(c, 'body', o.lit, !!o.flip);
      c.translate(1 + (o.headX || 0), -11 + (o.headY || 0));
      if (o.headR) c.rotate(o.headR);
      rimBlit(c, o.hat === false ? 'headBare' : 'head', o.lit, !!o.flip);
    });

    // the steel, thrown down the beach, where it stays
    if (this.harpFree) {
      ctx.save();
      ctx.translate(R(hx + HL + 22), R(HER.feet + 4));
      ctx.rotate(0.22); ctx.scale(MSC, MSC);
      ctx.drawImage(A.harp.c, -A.harp.ax, -A.harp.ay);
      ctx.restore();
    }
  },
};

global.DeathScene = DeathScene;

})(typeof window !== 'undefined' ? window : this);
