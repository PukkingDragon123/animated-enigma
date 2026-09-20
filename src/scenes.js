// ---- Cinematic intro, dialogue, end screens -----------------------------
// The intro cinematic now lives in src/intro.js, which defines the global
// `Intro`. A top-level `const Intro` here would shadow it, so it is gone.

const Dialogue = {
  t: 0, text: 'Oh, a manatee! Free meat for tonight!', done: false, shotFired: false,
  reset() { this.t = 0; this.done = false; this.shotFired = false; },
  update(dt) { this.t += dt; if (this.t > 3) this.done = true; },
  renderWorld(ctx, cam) { /* the bubble is drawn in HUD space so the text stays crisp */ },
  renderHUD(ctx) {
    const f = G.fisherman; if (!f || !f.alive) return;
    // anchor the bubble to his screen position through the zoom
    if (this.t > 0.6) {
      const sp = G.worldToScreen(f.x, f.y - 34);
      const sx = Math.round(sp.x), sy = Math.round(sp.y);
      const n = Math.min(this.text.length, Math.floor((this.t - 0.6) * 30));
      const w = Math.max(70, textWidth(this.text, 7) + 20);
      const bx = clamp(sx - w / 2, 6, 634 - w), by = clamp(sy - 26, 44, 300);
      UIKit.panel(ctx, bx, by, w, 24, 'parchment');
      ctx.fillStyle = '#e8dcc0';
      ctx.beginPath(); ctx.moveTo(sx - 6, by + 23); ctx.lineTo(sx + 6, by + 23); ctx.lineTo(sx, by + 33); ctx.fill();
      ctx.fillStyle = '#2a2016';
      ctx.beginPath(); ctx.moveTo(sx - 7, by + 24); ctx.lineTo(sx - 5, by + 24); ctx.lineTo(sx, by + 34); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx + 7, by + 24); ctx.lineTo(sx + 5, by + 24); ctx.lineTo(sx, by + 34); ctx.fill();
      pixelText(ctx, this.text.slice(0, n), bx + 10, by + 8, 7, '#2a2016', 'left', false);
    }
    if (!this.done) return;
    const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
    UIKit.panel(ctx, 60, 298, 520, 40, 'dark');
    pixelTextOutlined(ctx, touch ? 'TAP FIRE. LET THE OTTER ANSWER.' : 'LEFT CLICK. LET THE OTTER ANSWER.',
      320, 304, 10, Math.floor(this.t * 2) % 2 ? '#ffe48f' : '#ffffff', '#14141c', 'center');
    pixelText(ctx, touch ? 'Helm to swim   SHIELD to parry   ROLL to dash'
                         : 'WASD swim   SPACE roll   E / right-click shield   TAB skill tree',
      320, 320, 6, '#9ab0c0', 'center');
  },
};

function drawEndScreen(ctx, t, win) {
  ctx.fillStyle = win ? 'rgba(6,26,20,0.88)' : 'rgba(30,5,10,0.88)';
  ctx.fillRect(0, 0, 640, 360);
  const s = G.stats;
  UIKit.ribbon(ctx, 320, 18, win ? 'VILLAGE LIBERATED' : 'THE SEA TAKES ANOTHER', win ? 'gold' : 'dark');
  if (win) {
    pixelTextOutlined(ctx, 'The Chief sank with his shark.', 320, 48, 7, '#ffffff', '#14141c', 'center');
    pixelTextOutlined(ctx, 'The boats will not fish here again.', 320, 58, 7, '#ffffff', '#14141c', 'center');
    pixelText(ctx, 'NEXT DESTINATION: THE CANNERY', 320, 72, 6, '#8ac6ff', 'center');
  } else {
    pixelTextOutlined(ctx, 'The otter drags you back to the reef.', 320, 48, 7, '#ffffff', '#14141c', 'center');
    pixelText(ctx, 'Your scrap and upgrades are kept. Spend them better.', 320, 60, 6, '#ffe48f', 'center');
    pixelText(ctx, 'Strategy, not luck.', 320, 72, 6, '#9ab0c0', 'center');
  }
  const rows = [
    ['Time survived', fmtTime(G.director.time)],
    ['Boats sunk', s.kills],
    ['Attacks absorbed', s.absorbs],
    ['Boss crashes into rock', s.bossCrashes],
    ['Damage dealt', Math.round(s.damageDealt)],
    ['Damage taken', Math.round(s.damageTaken)],
    ['Scrap collected', s.scrapCollected],
    ['Upgrades taken', G.tree.unlocked.size + '/' + SKILL_NODES.length],
  ];
  UIKit.panel(ctx, 150, 88, 340, 196, 'dark');
  rows.forEach(([k, v], i) => {
    const y = 102 + i * 21;
    pixelText(ctx, k, 300, y, 7, '#9ab0c0', 'right');
    pixelTextOutlined(ctx, v + '', 316, y, 8, '#ffffff', '#14141c', 'left');
    if (i < rows.length - 1) UIKit.divider(ctx, 166, y + 13, 308);
  });
  const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
  UIKit.panel(ctx, 100, 296, 440, 34, 'dark');
  pixelTextOutlined(ctx, touch ? 'TAP TO FIGHT AGAIN' : '[R] FIGHT AGAIN        [TAB] SKILL TREE',
    320, 302, 10, Math.floor(t * 2) % 2 ? '#ffffff' : '#ffe48f', '#14141c', 'center');
  pixelText(ctx, (win ? 'Your build carries over.' : 'Everything you unlocked carries over.') + '   [ESC] title screen', 320, 317, 6, '#9ab0c0', 'center');
}

// ===========================================================================
//  BOSS CUTSCENES — short cinematic punches around a boss arriving and dying
//
//    'chief_intro'   ~6.9s  the water goes wrong, the village screams, the
//                           shark breaches, and the Village Chief is seen
//                           properly for the first time.  Side-on.
//    'chief_defeat'  ~7.6s  the shark rolls, the man goes under, she comes up
//                           where he sank, the otter takes his hat off, and
//                           her mother drifts past beneath.  Side-on.
//    'mini_intro'    ~2.1s  a name card, a silhouette, a shock of water.
//    'mini_defeat'   ~1.7s  the silhouette comes apart, the card is stamped.
//
//  Everything is baked once in init() and blitted; only the moving layer is
//  drawn per frame.  Pixel art only: integer coordinates, posterized bands,
//  hard edges, no gradients, no blur, no external images.
//
//  Public API (see the contract in game.js):
//    BossCut.init()                     build every sprite once, idempotent
//    BossCut.start(kind, opts)          opts = { name, x, y } for the minis
//    BossCut.update(dt, t)
//    BossCut.renderWorld(ctx, cam, t)   WORLD space (minis, when given x/y)
//    BossCut.renderScreen(ctx, t)       640x360 logical screen space
//    BossCut.active / .worldActive / .done
//    BossCut.skip()
// ===========================================================================
(function (global) {
'use strict';

// ------------------------------------------------------------- tiny raster
const R = Math.round;
function can(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
function cx2(c) { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; }
function spr(c, ax, ay) { return { c: c, w: c.width, h: c.height, ax: ax === undefined ? c.width / 2 : ax, ay: ay === undefined ? c.height / 2 : ay }; }
function P(ctx, col, x, y, w, h) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w === undefined ? 1 : w | 0, h === undefined ? 1 : h | 0); }
// hard-edged 1px line — no strokes, no AA
function LN(ctx, col, x0, y0, x1, y1, w) {
  x0 = x0 | 0; y0 = y0 | 0; x1 = x1 | 0; y1 = y1 | 0; w = w || 1;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, n = 0;
  ctx.fillStyle = col;
  for (;;) {
    ctx.fillRect(x0 - (w >> 1), y0 - (w >> 1), w, w);
    if ((x0 === x1 && y0 === y1) || ++n > 700) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
// a thick limb: a run of squares, so every edge stays on the pixel grid
function cap(ctx, col, x0, y0, x1, y1, w) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1, h = w >> 1;
  ctx.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(R(x0 + (x1 - x0) * t) - h, R(y0 + (y1 - y0) * t) - h, w, w);
  }
}
function tri(ctx, col, ax, ay, bx, by, cx, cy) {
  ctx.fillStyle = col;
  const y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
  const pts = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
  for (let y = y0; y <= y1; y++) {
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 3; i++) {
      const p = pts[i];
      if ((p[1] <= y && p[3] > y) || (p[3] <= y && p[1] > y)) {
        const t = (y - p[1]) / (p[3] - p[1]), x = p[0] + (p[2] - p[0]) * t;
        if (x < lo) lo = x; if (x > hi) hi = x;
      }
    }
    if (hi >= lo) ctx.fillRect(Math.round(lo), y, Math.max(1, Math.round(hi - lo)), 1);
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bay(x, y) { return (BAYER[(((y | 0) & 3) << 2) | ((x | 0) & 3)] + 0.5) / 16; }
function qa(a) { return Math.max(0, Math.min(1, Math.round(a * 12) / 12)); }
function rgbaq(hex, a) { const c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + qa(a) + ')'; }
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return 'rgb(' + R(A[0] + (B[0] - A[0]) * t) + ',' + R(A[1] + (B[1] - A[1]) * t) + ',' + R(A[2] + (B[2] - A[2]) * t) + ')';
}
// stamp a clean 1px ink outline around whatever has been drawn on a canvas.
// Lets the hand-built figures below be sketched with plain rectangles and
// still come out with the hard black edge everything else in the game has.
function outlineIt(c, ink) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  const col = hexToRgb(ink);
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
    const i = y * w + px;
    if (src[i]) continue;
    if (!((px > 0 && src[i - 1]) || (px < w - 1 && src[i + 1]) ||
          (y > 0 && src[i - w]) || (y < h - 1 && src[i + w]))) continue;
    const p = i * 4;
    d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
// posterized, ordered-dithered ramp fill straight into pixels (bake only)
function paintRamp(ctx, x0, y0, w, h, ramp, fy) {
  const img = ctx.createImageData(w, h), d = img.data;
  const cols = ramp.map(hexToRgb), n = cols.length;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let u = fy((h < 2 ? 0 : y / (h - 1)), x + x0, y + y0);
    if (u < 0) u = 0; else if (u > 1) u = 1;
    const fi = u * (n - 1);
    let i = Math.floor(fi);
    if (bay(x + x0, y + y0) < fi - i) i++;
    if (i < 0) i = 0; else if (i > n - 1) i = n - 1;
    const c = cols[i], p = (y * w + x) * 4;
    d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
  }
  ctx.putImageData(img, x0, y0);
}
// a flat pixel disc (sun, moon) — scanline rows, never a canvas arc
function disc(ctx, cx, cy, r, col, rim) {
  for (let y = -r; y <= r; y++) {
    const q = r * r - y * y; if (q < 0) continue;
    const hw = Math.floor(Math.sqrt(q));
    P(ctx, col, cx - hw, cy + y, hw * 2 + 1, 1);
    if (rim && (y === -r || y === r)) P(ctx, rim, cx - hw, cy + y, hw * 2 + 1, 1);
  }
}

// ----------------------------------------------------------------- palette
const BP = {
  ink: '#07060d', ink2: '#12101c',
  skyDusk:  ['#150f26', '#231636', '#3c1e3c', '#602b40', '#914044', '#c66a48', '#e9a061'],
  skyNight: ['#04050c', '#080a14', '#0f1020', '#181a2c', '#23213a', '#2f2a44', '#3b3450'],
  skyDim:   ['#060812', '#0c101f', '#151a2e', '#20233c', '#2d2c4a', '#3e3554', '#553f5a'],
  skyDawn:  ['#0a0e20', '#141c34', '#242c46', '#3a3656', '#5c4462', '#8a5e64', '#c48c6c'],
  sea:      ['#03060d', '#061019', '#091827', '#0d2036', '#122a47', '#173459'],
  seaDusk:  ['#050810', '#0a121d', '#101c2c', '#16273e', '#1f3352', '#2b4168'],
  foam:     ['#33566b', '#5d8298', '#8fb4c8', '#c8e2ef', '#f2fbff'],
  vill:     '#090810', villR: '#1e1a28', villL: '#322b3e',
  fire:     ['#5c1b10', '#9c3115', '#d4661c', '#ffab34', '#ffe6a2'],
  gold: '#ffe48f', goldD: '#e0a838', red: '#c4202c', redL: '#e8515a',
  bone: '#e8e4d8', white: '#f2f6fa', steel: '#8a9ab5',
};

const HZ = 190;                     // horizon / waterline in the side-on shots
const BAR = 26;                     // letterbox height

// =========================================================================
//  BAKED ART
// =========================================================================
const A = {};
let BUILT = false;

// ---- the bay, seen from the shore --------------------------------------
// One 640x360 canvas per lighting state.  Nothing here is ever redrawn.
const TORCH = [];                   // torch anchors on the village, filled once
function drawHut(x, dx, dy, w, h, col, rim) {
  P(x, col, dx, dy - h, w, h);
  P(x, rim, dx, dy - h, 1, h);
  tri(x, col, dx - 4, dy - h, dx + w + 4, dy - h, dx + w / 2, dy - h - 9);
  tri(x, rim, dx - 4, dy - h, dx + w / 2, dy - h, dx + w / 2, dy - h - 9);
  P(x, rim, dx - 4, dy - h - 1, w + 8, 1);
}
function drawVillage(x, deckY, col, rim, wrecked) {
  // the long pier, walking out over the water on stilts
  P(x, col, -2, deckY, 214, 4);
  P(x, rim, -2, deckY, 214, 1);
  for (let sx = 4; sx < 212; sx += 11) {
    P(x, col, sx, deckY + 4, 3, 26 + ((sx * 7) % 9));
    P(x, col, sx - 3, deckY + 9, 9, 1);
  }
  // huts, back to front
  drawHut(x, 12, deckY, 30, 20, col, rim);
  drawHut(x, 54, deckY, 22, 15, col, rim);
  drawHut(x, 86, deckY, 34, 24, col, rim);
  drawHut(x, 132, deckY, 24, 17, col, rim);
  drawHut(x, 166, deckY, 30, 21, col, rim);
  // drying racks and a net between two poles
  P(x, col, 44, deckY - 14, 2, 14); P(x, col, 50, deckY - 10, 2, 10);
  for (let i = 0; i < 6; i++) P(x, col, 45, deckY - 13 + i * 2, 6, 1);
  // the chief's pole: a tall mast with a shark jaw lashed to the top
  P(x, col, 124, deckY - 56, 3, 56);
  P(x, col, 118, deckY - 56, 15, 2);
  for (let i = 0; i < 5; i++) { P(x, col, 119 + i * 3, deckY - 52, 2, 5); P(x, rim, 119 + i * 3, deckY - 52, 2, 1); }
  if (wrecked) {                                  // after the boss: half of it is ash
    P(x, BP.ink, 86, deckY - 24, 34, 24);
    P(x, BP.ink, 132, deckY - 17, 24, 8);
  }
  TORCH.length = 0;
  TORCH.push([10, deckY - 3], [62, deckY - 4], [104, deckY - 28], [128, deckY - 58], [172, deckY - 25], [202, deckY - 3]);
}
function drawFarBoat(x, bx, by, col, rim, broke) {
  P(x, col, bx, by, 24, 5);
  P(x, col, bx + 2, by - 3, 18, 3);
  P(x, rim, bx, by, 24, 1);
  if (broke) { LN(x, col, bx + 12, by - 2, bx + 22, by - 16); P(x, col, bx + 6, by - 8, 2, 8); }
  else { P(x, col, bx + 11, by - 17, 2, 17); P(x, rim, bx + 13, by - 16, 5, 6); }
}
function buildBay(skyRamp, seaRamp, opt) {
  const c = can(640, 360), x = cx2(c);
  // ---- sky: posterized bands with a little ordered break-up
  paintRamp(x, 0, 0, 640, HZ, skyRamp, (u, px, py) =>
    Math.pow(u, 0.72) + (hash2(px >> 3, py >> 1) - 0.5) * 0.09);
  // cloud slabs, flat and hard-edged
  for (let i = 0; i < 7; i++) {
    const cy = 34 + i * 19 + (i & 1) * 5, cw = 70 + ((i * 53) % 150);
    const cx0 = ((i * 137) % 700) - 40;
    const col = mixHex(skyRamp[Math.max(0, 1 + (i & 1))], skyRamp[skyRamp.length - 1], 0.18 + i * 0.06);
    for (let r = 0; r < 3 + (i & 2); r++) {
      const w = R(cw * (1 - r * 0.18)), sx = cx0 + R(r * 6 + (hash2(i, r) - 0.5) * 20);
      P(x, col, sx, cy - r * 2, w, 2);
    }
  }
  if (opt.sun) {
    disc(x, opt.sun[0], opt.sun[1], opt.sun[2], opt.sun[3]);
    disc(x, opt.sun[0], opt.sun[1], opt.sun[2] - 3, opt.sun[4]);
  }
  // ---- the sea: brightest where it meets the sky, darkest underfoot
  // (painted straight into pixels, so it has to land before anything that
  //  stands in the water)
  paintRamp(x, 0, HZ, 640, 360 - HZ, seaRamp, (u, px, py) =>
    1 - Math.pow(u, 0.62) + (hash2(px >> 2, py) - 0.5) * 0.12);
  // chop: flat dashes, longer and sparser as the water comes towards us
  const chop = opt.chop || BP.foam[0];
  for (let y = HZ + 2; y < 360; y++) {
    const u = (y - HZ) / (360 - HZ);
    const step = 4 + R(u * 14);
    for (let sx = (y * 13) % step; sx < 640; sx += step) {
      if (hash2(sx, y * 3) > 0.30 + u * 0.24) continue;
      P(x, chop, sx, y, 2 + R(u * 6), 1);
    }
  }
  // the light on the water under the sun, a hard dithered road
  if (opt.sun) {
    const sxp = opt.sun[0], road = opt.road || opt.sun[3];
    for (let y = HZ; y < 360; y++) {
      const u = (y - HZ) / (360 - HZ), sp = 6 + u * 62;
      for (let dx = -sp; dx <= sp; dx += 1) {
        const px = R(sxp + dx);
        if (px < 0 || px > 639) continue;
        const fall = 1 - Math.abs(dx) / sp;
        if (bay(px, y) > fall * (0.72 - u * 0.45)) continue;
        P(x, road, px, y, 1 + R(u * 2), 1);
      }
    }
  }
  // ---- the village on its pier, standing in the water
  drawVillage(x, HZ - 16, BP.vill, opt.rim || BP.villR, opt.wrecked);
  drawFarBoat(x, 300, HZ - 4, BP.vill, opt.rim || BP.villR, opt.wrecked);
  drawFarBoat(x, 470, HZ - 2, BP.vill, opt.rim || BP.villR, opt.wrecked);
  return c;
}
// scrolling swell: 640x1 strips of dashes, wrapped each frame
function buildSwellRow(seed, col) {
  const c = can(640, 1), x = cx2(c);
  for (let i = 0; i < 640; i++) if (hash2(i, seed * 31 + 7) < 0.13) P(x, col, i, 0, 2 + (i % 4), 1);
  return c;
}

// ---- the shark, seen from the side, mid-leap -----------------------------
function buildSharkSide() {
  const W = 140, H = 56;
  const f = blobField(W, H, [
    { x: 30, y: 28, rx: 8, ry: 5 },
    { x: 44, y: 27, rx: 13, ry: 10 },
    { x: 62, y: 26, rx: 16, ry: 13 },
    { x: 82, y: 26, rx: 15, ry: 12 },
    { x: 100, y: 27, rx: 12, ry: 10 },
    { x: 116, y: 29, rx: 9, ry: 7 },
    { x: 128, y: 31, rx: 5, ry: 4 },
  ]);
  const ramp = ['#0e131d', '#182232', '#253448', '#374a66', '#516787'];
  const body = shadeBlob(W, H, f, ramp, { outline: BP.ink, smooth: 3, lift: 0.15 });
  const c = can(W, H), x = cx2(c);
  // far side fins first, so the body sits over their roots
  triOutlined(x, ramp[1], BP.ink, [86, 34], [64, 50], [74, 34]);
  triOutlined(x, ramp[1], BP.ink, [30, 28], [11, 8], [24, 26]);      // upper caudal lobe
  triOutlined(x, ramp[0], BP.ink, [30, 31], [14, 48], [26, 33]);    // lower caudal lobe
  triOutlined(x, ramp[1], BP.ink, [52, 36], [40, 46], [46, 36]);    // pelvic
  x.drawImage(body.c, 0, 0);
  // dorsal, swept back over the spine
  triOutlined(x, ramp[2], BP.ink, [70, 15], [52, 18], [56, 3]);
  // near pectoral, broad, dropped low
  triOutlined(x, ramp[3], BP.ink, [94, 32], [78, 33], [66, 52]);
  // countershading: pale underneath, hard dithered edge
  for (let y = 30; y < H - 1; y++) for (let px = 16; px < 132; px++) {
    const i = y * W + px; if (f[i] <= 0.04) continue;
    if (f[i + W] <= 0.04 || bay(px, y) < (y - 30) / 22) P(x, '#93a8bd', px, y, 1, 1);
  }
  // gill slits
  for (let g = 0; g < 5; g++) {
    const gx = 110 - g * 4;
    for (let y = 20; y <= 32; y++) { const i = y * W + gx; if (f[i] > 0.22) P(x, '#101822', gx, y, 1, 1); }
  }
  // scars along the back
  for (let i = 0; i < 5; i++) P(x, '#93a8bd', 66 + i * 3, 15 + i, 1, 1);
  for (let i = 0; i < 4; i++) P(x, '#93a8bd', 44 + i * 2, 34 - i, 1, 1);
  // the jaws, open — this is the shot the whole beat is for
  tri(x, '#25080e', 112, 28, 136, 26, 120, 46);
  tri(x, '#25080e', 112, 26, 134, 22, 128, 30);
  for (let i = 0; i < 7; i++) {                       // upper teeth
    const tx = 116 + i * 3, ty = 27 - R(i * 0.5);
    tri(x, BP.bone, tx, ty, tx + 3, ty, tx + 1, ty + 4);
  }
  for (let i = 0; i < 6; i++) {                       // lower teeth
    const tx = 116 + i * 3, ty = 41 - i * 2;
    tri(x, BP.bone, tx, ty, tx + 3, ty, tx + 1, ty - 4);
  }
  P(x, BP.ink, 112, 24, 2, 22);
  // eye: small, black, with a wet red spark
  P(x, BP.ink, 112, 18, 5, 5); P(x, '#2a0d12', 113, 19, 3, 3); P(x, '#ff3a2a', 114, 20, 1, 1);
  P(x, BP.white, 113, 19, 1, 1);
  return spr(c, 70, 28);
}
// a short piece of the same animal — the back and dorsal, for the close-up
function buildSharkBack() {
  const c = can(76, 26), x = cx2(c);
  for (let px = 2; px < 74; px++) {
    const u = (px - 2) / 71;
    const top = 12 - R(Math.sin(u * Math.PI) * 5);
    P(x, '#253448', px, top, 1, 26 - top);
    P(x, '#516787', px, top, 1, 2);
    if (bay(px, top + 6) < 0.4) P(x, '#374a66', px, top + 3, 1, 3);
    P(x, '#93a8bd', px, 22, 1, 4);
  }
  triOutlined(x, '#374a66', BP.ink, [46, 9], [26, 11], [30, 2]);
  for (let i = 0; i < 4; i++) P(x, '#93a8bd', 40 + i * 4, 9 + i, 1, 1);
  return spr(outlineIt(c, BP.ink), 38, 20);
}

// ---- the Village Chief, side on ----------------------------------------
function buildChiefSide() {
  const c = can(26, 52), x = cx2(c);
  x.translate(0, 14);                 // leave room over his head for the crown
  const SK = '#d9a06a', SKD = '#a9713f', SKX = '#7a4a22';
  const LEA = '#6d4527', LEAD = '#472c17';
  // far leg, gripping the flank
  cap(x, SKX, 11, 25, 6, 34, 4);
  P(x, SKX, 4, 33, 5, 3);
  // loincloth with a bone fringe
  P(x, LEAD, 7, 22, 12, 7); P(x, LEA, 7, 22, 12, 2);
  for (let i = 0; i < 5; i++) P(x, BP.bone, 8 + i * 2, 28, 1, 3);
  // near leg
  cap(x, SK, 13, 25, 18, 34, 5);
  P(x, SKD, 16, 33, 6, 3);
  // torso
  P(x, SK, 8, 12, 11, 11);
  P(x, SKD, 8, 12, 2, 11);
  P(x, SKD, 8, 21, 11, 2);
  P(x, BP.red, 9, 15, 9, 1); P(x, BP.red, 10, 18, 7, 1);      // war paint
  for (let i = 0; i < 5; i++) P(x, BP.bone, 9 + i * 2, 12 + (i & 1), 1, 2);
  cap(x, LEAD, 9, 13, 18, 20, 2);                              // harness
  // far arm, holding the fin
  cap(x, SKX, 9, 14, 4, 21, 3);
  // near arm, up, the spear hand
  cap(x, SK, 16, 14, 22, 7, 3);
  P(x, BP.goldD, 21, 6, 3, 3);
  // head
  P(x, SK, 8, 4, 10, 9);
  P(x, SKX, 8, 4, 2, 9);
  P(x, SKD, 8, 11, 10, 2);
  P(x, BP.red, 8, 6, 10, 3);                                   // the red band over the eyes
  P(x, BP.ink, 12, 7, 2, 2); P(x, BP.ink, 15, 7, 2, 2);
  P(x, '#ff5a4a', 12, 7, 1, 1); P(x, '#ff5a4a', 15, 7, 1, 1);
  P(x, BP.bone, 12, 11, 6, 1);                                 // bared teeth
  // headdress: band + a fan of feathers
  P(x, LEAD, 7, 2, 12, 3); P(x, BP.goldD, 7, 3, 12, 1);
  const FE = ['#c4202c', '#e8d3ae', '#e8515a', '#e8d3ae', '#c4202c'];
  for (let i = 0; i < 5; i++) {
    const bx = 8 + i * 2, hgt = 9 + (i === 2 ? 5 : (i === 1 || i === 3) ? 2 : 0);
    LN(x, FE[i], bx, 3, bx + (i - 2) * 3, 3 - hgt, 2);
    P(x, BP.bone, bx + (i - 2) * 3, 2 - hgt, 1, 2);
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  return spr(outlineIt(c, BP.ink), 13, 50);
}
function buildSpear() {
  const c = can(40, 9), x = cx2(c);
  P(x, '#8f6038', 2, 4, 30, 2);
  P(x, '#6d4527', 2, 6, 30, 1);
  tri(x, BP.bone, 32, 1, 32, 8, 39, 4);
  P(x, '#c4202c', 26, 3, 2, 4);
  P(x, '#e8d3ae', 22, 2, 1, 5);
  return spr(outlineIt(c, BP.ink), 20, 4);
}

// ---- the war manatee, side on ------------------------------------------
function buildManateeSide(ghost) {
  const W = 152, H = 58;
  const f = blobField(W, H, [
    { x: 16, y: 30, rx: 14, ry: 7 },     // fluke
    { x: 30, y: 30, rx: 10, ry: 8 },
    { x: 50, y: 30, rx: 18, ry: 15 },
    { x: 76, y: 29, rx: 23, ry: 19 },    // thickest
    { x: 104, y: 29, rx: 20, ry: 17 },
    { x: 124, y: 30, rx: 15, ry: 13 },
    { x: 138, y: 32, rx: 8, ry: 8 },     // blunt snout
  ]);
  const ramp = ghost
    ? ['#2a3a4a', '#3d5164', '#55697e', '#6f8398', '#8fa3b6']
    : ['#2a2730', '#3d3947', '#585462', '#726e7c', '#8f8b98'];
  const body = shadeBlob(W, H, f, ramp, { outline: ghost ? '#17222e' : BP.ink, smooth: 3, lift: 0.18 });
  const c = can(W, H), x = cx2(c);
  x.drawImage(body.c, 0, 0);
  // pale belly
  for (let y = 34; y < H - 1; y++) for (let px = 20; px < 146; px++) {
    const i = y * W + px; if (f[i] <= 0.04) continue;
    if (f[i + W] <= 0.04 || bay(px, y) < (y - 34) / 18) P(x, ghost ? '#a9bccb' : '#9fadbd', px, y, 1, 1);
  }
  if (!ghost) {
    // the plate bolted over her shoulder, and the harness strap
    P(x, BP.ink, 84, 11, 34, 9); P(x, '#63728d', 85, 12, 32, 7);
    P(x, '#93a4c0', 85, 12, 32, 2); P(x, '#45526b', 85, 17, 32, 2);
    for (let i = 0; i < 5; i++) P(x, '#cdd9ea', 88 + i * 7, 15, 2, 2);
    cap(x, '#472c17', 74, 14, 72, 44, 3);
    P(x, BP.goldD, 71, 26, 5, 4);
    // propeller scars across her back
    for (let i = 0; i < 4; i++) LN(x, '#b8b3c0', 44 + i * 9, 14 + i, 52 + i * 9, 21 + i, 1);
  }
  // flipper, tucked under
  cap(x, ramp[1], 108, 40, 96, 52, 7);
  P(x, ramp[0], 94, 48, 8, 5);
  // face
  P(x, BP.ink, 132, 24, 4, 4); P(x, ghost ? '#0d1620' : '#241a12', 133, 25, 2, 2);
  if (!ghost) P(x, BP.white, 133, 25, 1, 1);
  P(x, ramp[0], 134, 34, 10, 2);                       // mouth line
  for (let i = 0; i < 4; i++) P(x, '#c9c4d0', 142 + (i & 1) * 2, 30 + i * 2, 2, 1);   // whiskers
  if (ghost) {
    // she is a memory, not a body: knock half the pixels out on a hard grid
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let px = 0; px < W; px++) {
      if (bay(px, y) > 0.42) d[(y * W + px) * 4 + 3] = 0;
    }
    x.putImageData(img, 0, 0);
  }
  return spr(c, 76, 30);
}

// ---- the otter, side on, standing --------------------------------------
function buildOtterSide() {
  const c = can(28, 34), x = cx2(c);
  const F = '#c8703c', FD = '#9c4d24', FDD = '#6d3316', CR = '#e8d3ae';
  cap(x, FD, 10, 26, 1, 22, 5);                       // tail
  P(x, FDD, 0, 20, 4, 4);
  cap(x, FDD, 11, 25, 9, 31, 4);                      // far leg
  P(x, FDD, 6, 30, 6, 3);
  P(x, F, 9, 13, 11, 13);                             // torso
  P(x, FD, 9, 13, 2, 13);
  P(x, CR, 12, 16, 7, 9);
  cap(x, F, 15, 25, 17, 31, 5);                       // near leg
  P(x, FDD, 15, 30, 7, 3);
  for (let i = 0; i < 10; i++) P(x, '#472c17', 10 + i, 24 - i, 2, 1);   // bandolier
  P(x, BP.goldD, 14, 20, 3, 3); P(x, BP.gold, 14, 20, 3, 1);
  cap(x, F, 18, 16, 21, 24, 3);                       // near arm
  P(x, F, 10, 4, 11, 10);                             // head
  P(x, FD, 10, 4, 2, 10);
  P(x, CR, 16, 9, 6, 4);                              // muzzle
  P(x, BP.ink, 9, 3, 4, 4); P(x, FDD, 10, 4, 2, 2);   // ear
  P(x, BP.ink, 17, 6, 2, 2); P(x, BP.white, 17, 6, 1, 1);
  P(x, '#2a1a10', 21, 10, 2, 2);
  P(x, BP.ink, 16, 13, 6, 1);
  return spr(outlineIt(c, BP.ink), 14, 32);
}
function buildOtterHat() {
  const c = can(18, 10), x = cx2(c);
  tri(x, '#3d4767', 0, 8, 17, 8, 9, 0);
  P(x, '#28314c', 0, 7, 18, 2);
  P(x, '#586590', 1, 6, 16, 1);
  P(x, BP.white, 5, 4, 3, 1);
  P(x, '#c4202c', 11, 5, 3, 1);
  return spr(outlineIt(c, BP.ink), 9, 9);
}
function buildRifle() {
  const c = can(24, 7), x = cx2(c);
  P(x, '#5d6675', 4, 2, 19, 2);
  P(x, '#9aa6b6', 4, 2, 19, 1);
  P(x, '#7d4a22', 0, 2, 6, 4);
  P(x, '#472c17', 6, 4, 4, 2);
  return spr(outlineIt(c, BP.ink), 12, 3);
}

// ---- water furniture ----------------------------------------------------
function ringSprite(rx, ry, th, col) {
  const w = rx * 2 + 5, h = ry * 2 + 5, c = can(w, h), x = cx2(c);
  const cx0 = rx + 2, cy0 = ry + 2, riy = Math.max(1, ry - th * 0.6), ri = Math.max(0, rx - th);
  for (let y = -ry; y <= ry; y++) {
    const q = 1 - (y / ry) * (y / ry); if (q <= 0) continue;
    const hw = Math.floor(rx * Math.sqrt(q));
    const q2 = 1 - (y / riy) * (y / riy);
    const lo = q2 > 0 ? Math.floor(ri * Math.sqrt(q2)) : 0;
    for (let s = -1; s <= 1; s += 2) for (let d = lo; d <= hw; d++) {
      const px = cx0 + s * d, py = cy0 + y;
      if (bay(px, py) > 0.78) continue;
      P(x, col, px, py, 1, 1);
    }
  }
  return spr(c, cx0, cy0);
}
function discSprite(rx, ry, col, dens) {
  const w = rx * 2 + 4, h = ry * 2 + 4, c = can(w, h), x = cx2(c);
  const cx0 = rx + 2, cy0 = ry + 2;
  for (let y = -ry; y <= ry; y++) {
    const q = 1 - (y / ry) * (y / ry); if (q <= 0) continue;
    const hw = Math.floor(rx * Math.sqrt(q));
    for (let d = -hw; d <= hw; d++) {
      const px = cx0 + d, py = cy0 + y;
      const fall = 1 - Math.sqrt((d / rx) * (d / rx) + (y / ry) * (y / ry));
      if (bay(px, py) > dens * (0.3 + fall)) continue;
      P(x, col, px, py, 1, 1);
    }
  }
  return spr(c, cx0, cy0);
}
function buildSpray(w, h, seed) {
  const c = can(w, h), x = cx2(c);
  for (let px = 0; px < w; px++) {
    const u = px / (w - 1);
    const top = h - Math.sin(u * Math.PI) * h * (0.62 + 0.38 * hash2(px >> 2, seed));
    for (let y = Math.floor(top); y < h; y++) {
      const dv = (y - top) / Math.max(1, h - top);
      if (hash2(px + seed * 131, y * 3) > 0.22 + dv * 0.72) continue;
      let ci = Math.floor((1 - dv) * BP.foam.length + (bay(px, y) - 0.5) * 1.6);
      if (ci < 0) ci = 0; else if (ci > BP.foam.length - 1) ci = BP.foam.length - 1;
      P(x, BP.foam[ci], px, y, 1, 1);
    }
  }
  return spr(c, w / 2, h);
}
function buildFlame(seed) {
  const c = can(26, 34), x = cx2(c);
  for (let y = 0; y < 34; y++) {
    const u = 1 - y / 33;
    const w = R((1 - u * u) * 11 + 1 + (hash2(y, seed) - 0.5) * 4);
    for (let d = -w; d <= w; d++) {
      const px = 13 + d;
      const fall = 1 - Math.abs(d) / (w + 1);
      let ci = Math.floor(fall * 3 + (1 - u) * 1.6);
      if (bay(px, y + seed) > 0.25 + fall * 0.7) continue;
      if (ci < 0) ci = 0; else if (ci > 4) ci = 4;
      P(x, BP.fire[ci], px, y, 1, 1);
    }
  }
  return spr(c, 13, 33);
}
// the dark, near-black frame the Chief is held in for his close-up
function buildCloseBg() {
  const c = can(640, 360), x = cx2(c);
  paintRamp(x, 0, 0, 640, 360, ['#05040a', '#0a070f', '#100a14', '#180d16', '#22101a'],
    (u, px, py) => {
      const dx = (px - 320) / 330, dy = (py - 175) / 210;
      return 1 - Math.sqrt(dx * dx + dy * dy) * 1.05;
    });
  return c;
}

// ---- the mini-boss: a shape under the water -----------------------------
function buildMiniShade() {
  const W = 176, H = 92;
  const f = blobField(W, H, [
    { x: 34, y: 46, rx: 13, ry: 8 },
    { x: 56, y: 46, rx: 21, ry: 15 },
    { x: 84, y: 46, rx: 28, ry: 23 },
    { x: 114, y: 46, rx: 25, ry: 20 },
    { x: 140, y: 46, rx: 17, ry: 13 },
    { x: 158, y: 46, rx: 8, ry: 6 },
  ]);
  const body = shadeBlob(W, H, f, ['#04060b', '#070a11', '#0b0f18', '#101622', '#151d2c'],
    { outline: '#020308', smooth: 3, lift: 0.10 });
  const c = can(W, H), x = cx2(c);
  triOutlined(x, '#080c14', '#020308', [36, 46], [8, 16], [28, 42]);
  triOutlined(x, '#080c14', '#020308', [36, 46], [10, 76], [28, 50]);
  triOutlined(x, '#070a11', '#020308', [104, 30], [74, 5], [90, 30]);
  triOutlined(x, '#070a11', '#020308', [104, 62], [74, 87], [90, 62]);
  x.drawImage(body.c, 0, 0);
  for (let i = 0; i < 6; i++) triOutlined(x, '#101622', '#020308', [70 + i * 11, 46], [80 + i * 11, 46], [74 + i * 11, 30 - (i === 2 ? 6 : 0)]);
  for (let i = 0; i < 8; i++) { P(x, BP.bone, 146 + (i & 3) * 4, 42 + (i >> 2) * 8, 2, 2); }
  P(x, '#020308', 144, 44, 22, 4);
  return spr(c, 88, 46);
}

// =========================================================================
//  A HANDFUL OF LIVE PARTICLES
// =========================================================================
const FX = {
  l: [],
  clear() { this.l.length = 0; },
  add(o) { if (this.l.length < 260) this.l.push(o); },
  drop(x, y, n, up, spread) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI + 0.4, -0.4), sp = rand(40, 210) * (up || 1);
      this.add({ k: 'd', x: x + rand(-(spread || 6), spread || 6), y: y, vx: Math.cos(a) * sp * 0.7, vy: Math.sin(a) * sp, life: rand(0.35, 1.05), m: 1.05, s: randi(1, 2), c: BP.foam[randi(2, 4)] });
    }
  },
  ember(x, y, n) {
    for (let i = 0; i < n; i++) this.add({ k: 'e', x: x + rand(-8, 8), y: y + rand(-4, 3), vx: rand(-11, 11), vy: rand(-46, -16), life: rand(0.7, 1.9), m: 1.9, s: rand() > 0.7 ? 2 : 1, c: BP.fire[randi(2, 4)] });
  },
  bub(x, y, n) {
    for (let i = 0; i < n; i++) this.add({ k: 'b', x: x + rand(-9, 9), y: y + rand(-5, 5), vx: rand(-7, 7), vy: rand(-30, -10), life: rand(0.5, 1.4), m: 1.4, s: randi(1, 2), c: BP.foam[2] });
  },
  shard(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(70, 260);
      this.add({ k: 's', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, life: rand(0.3, 0.8), m: 0.8, s: randi(2, 5), c: '#05070c' });
    }
  },
  update(dt) {
    for (let i = this.l.length - 1; i >= 0; i--) {
      const p = this.l[i];
      p.life -= dt; if (p.life <= 0) { this.l.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'd' || p.k === 's') { p.vy += 460 * dt; p.vx *= (1 - 1.1 * dt); }
      else if (p.k === 'e') { p.vy -= 22 * dt; p.vx += Math.sin(p.life * 7) * 12 * dt; }
      else { p.vx *= (1 - 2 * dt); }
    }
  },
  render(ctx, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    for (const p of this.l) {
      const k = p.life / p.m;
      if (k < 0.34 && (Math.floor(p.life * 26) & 1)) continue;
      P(ctx, p.c, R(p.x) + ox, R(p.y) + oy, p.s, p.s);
    }
  },
};

// =========================================================================
//  TIMING TABLES
// =========================================================================
// the Chief arrives
const KI = { calm: 0.00, alarm: 1.30, breach: 2.50, close: 3.45, line: 4.60, down: 6.05, end: 6.95 };
const LINES_I = [
  [0.35, 1.05, 'the bay went quiet.'],
  [1.40, 1.05, 'then the drums started.'],
];
// the Chief goes down
const KD = { roll: 0.00, slip: 1.25, rise: 2.60, hat: 4.05, mother: 5.25, ribbon: 6.35, end: 7.55 };
const LINES_D = [
  [0.30, 1.05, 'the shark went over.'],
  [1.55, 1.05, 'he did not come up.'],
  [2.95, 1.05, 'she surfaced where he sank.'],
  [4.15, 1.00, 'the otter took his hat off.'],
  [5.35, 1.60, 'for the one they took first.'],
];
// the minis
const KM = { rise: 0.00, card: 0.62, hold: 1.25, out: 1.68, end: 2.10 };
const KX = { hit: 0.00, crack: 0.22, card: 0.42, stamp: 0.78, out: 1.28, end: 1.68 };

// =========================================================================
//  THE SCENE
// =========================================================================
const BossCut = {
  kind: null, name: 'MINI-BOSS', active: false, worldActive: false, done: true,
  t: 0, shake: 0, flash: 0, fade: 0,
  ax: 0, ay: 0, anchored: false,
  _fired: null, _man: null, _ott: null, _shk: null, _chf: null,

  // ----------------------------------------------------------------- init
  init() {
    if (BUILT) return;
    // the rigs in chars.js own the palette and the rasterizers; without them
    // there is nothing to build out of, so stay unbuilt and let start() bail
    if (typeof blobField !== 'function' || typeof shadeBlob !== 'function') return;
    if (typeof triOutlined !== 'function' || typeof CPAL === 'undefined') return;
    if (typeof CH === 'undefined' || !CH.manatee) return;
    try {
      A.bayDusk = buildBay(BP.skyDusk, BP.seaDusk, { sun: [462, 168, 22, '#e9a061', '#ffd7a0'], road: '#c88257', chop: '#4a6272' });
      A.bayNight = [
        buildBay(BP.skyNight, BP.sea, { chop: '#26405a', wrecked: true, rim: '#1a1626' }),
        buildBay(BP.skyDim, BP.sea, { chop: '#2b4866', wrecked: true, rim: '#241f32' }),
        buildBay(BP.skyDawn, BP.seaDusk, { sun: [112, 182, 17, '#c48c6c', '#f0c39a'], road: '#8a6a60', chop: '#3a5a78', wrecked: true, rim: '#2c2438' }),
      ];
      A.closeBg = buildCloseBg();
      A.swell = []; for (let i = 0; i < 7; i++) A.swell.push(buildSwellRow(i, i < 4 ? BP.foam[0] : BP.foam[1]));
      A.shark = buildSharkSide();
      A.sharkWhite = tintSprite(A.shark, '#ffffff', 0.9);
      A.sharkBack = buildSharkBack();
      A.chief = buildChiefSide();
      A.chiefRim = tintSprite(A.chief, '#ff9a4a', 1);
      A.spear = buildSpear();
      A.man = buildManateeSide(false);
      A.manGhost = buildManateeSide(true);
      A.ott = buildOtterSide();
      A.hat = buildOtterHat();
      A.rifle = buildRifle();
      A.fin = (function () {
        const c = can(26, 22), x = cx2(c);
        triOutlined(x, '#253448', BP.ink, [24, 21], [2, 21], [8, 0]);
        P(x, '#516787', 8, 2, 2, 12);
        return spr(outlineIt(c, BP.ink), 13, 21);
      })();
      A.shadow = discSprite(78, 17, '#050b14', 1.15);
      A.ring = []; for (let i = 0; i < 8; i++) A.ring.push(ringSprite(22 + i * 15, 6 + i * 4, 3, BP.foam[Math.min(4, 4 - (i >> 1))]));
      A.mRing = []; for (let i = 0; i < 8; i++) A.mRing.push(ringSprite(26 + i * 18, 12 + i * 8, 4, BP.foam[Math.min(4, 4 - (i >> 1))]));
      A.spray = []; for (let i = 0; i < 4; i++) A.spray.push(buildSpray(300, 170, i + 1));
      A.sprayS = []; for (let i = 0; i < 4; i++) A.sprayS.push(buildSpray(120, 70, i + 5));
      A.flame = []; for (let i = 0; i < 4; i++) A.flame.push(buildFlame(i));
      A.mini = buildMiniShade();
      A.miniWhite = tintSprite(A.mini, '#ffffff', 1);
      A.buf = can(640, 360); A.bufCtx = cx2(A.buf);
      // warm every baked canvas once so the first frame never pays to upload
      const wc = cx2(can(8, 8));
      const warm = o => { if (!o) return; const c = o.c || o; if (c && c.width) wc.drawImage(c, 0, 0, c.width, c.height, 0, 0, 8, 8); };
      for (const k in A) { const v = A[k]; if (Array.isArray(v)) v.forEach(warm); else warm(v); }
      BUILT = true;
    } catch (e) { BUILT = false; }
  },

  // ---------------------------------------------------------------- start
  start(kind, opts) {
    opts = opts || {};
    this.init();
    this.kind = kind;
    this.name = String(opts.name || 'MINI-BOSS').toUpperCase();
    this.t = 0; this.shake = 0; this.flash = 0; this.fade = 0;
    this._fired = {};
    FX.clear();
    const known = kind === 'chief_intro' || kind === 'chief_defeat' || kind === 'mini_intro' || kind === 'mini_defeat';
    if (!BUILT || !known) {                       // never throw, never hang
      this.active = false; this.done = true; this.worldActive = true; this.kind = null; return;
    }
    this.active = true; this.done = false;
    const mini = kind === 'mini_intro' || kind === 'mini_defeat';
    // the minis play over live gameplay; the Chief's two get the frame to
    // themselves until the last half second, when the world fades back in
    this.worldActive = mini;
    this.anchored = mini && opts.x !== undefined && opts.y !== undefined;
    this.ax = opts.x || 0; this.ay = opts.y || 0;
    if (kind === 'chief_intro') {
      this._shk = { x: 300, y: 214, rot: 0, sc: 1 };
      this._chf = { x: 300, y: 214, rot: 0 };
      this.sfx(() => { Audio_.tone(46, 1.6, 'sine', 0.30, 8); Audio_.noise(1.4, 0.10, 240, 30); });
    } else if (kind === 'chief_defeat') {
      this._shk = { x: 372, y: 216, rot: 0.5 };
      this._chf = { x: 372, y: 204, rot: 0.4 };
      this._man = { x: 448, y: 360, rot: 0 };
      this._ott = { x: 462, y: 330, arm: 0, hat: 0 };
      this.sfx(() => { Audio_.tone(64, 1.1, 'sawtooth', 0.26, -30); Audio_.splash(2.2); });
    } else {
      this.shake = kind === 'mini_intro' ? 6 : 9;
      this.flash = kind === 'mini_intro' ? 0.5 : 0.9;
      this.sfx(() => { if (kind === 'mini_intro') { Audio_.stun(); Audio_.tone(58, 0.8, 'sawtooth', 0.28, 30); } else { Audio_.explosion(1.1); Audio_.tone(190, 0.3, 'square', 0.2, -140); } });
    }
  },

  // jump to the very end: nothing left on screen, the world back underneath
  skip() {
    this.active = false; this.done = true; this.worldActive = true;
    this.fade = 0; this.flash = 0; this.shake = 0; this.kind = null;
    FX.clear();
  },

  sfx(fn) { try { if (typeof Audio_ !== 'undefined') fn(); } catch (e) { } },
  cue(key, at, fn) {
    if (this.t < at || this._fired[key]) return false;
    this._fired[key] = true; this.sfx(fn); return true;
  },

  // --------------------------------------------------------------- update
  update(dt, t) {
    if (this.done || !this.kind) return;
    if (dt > 1 / 20) dt = 1 / 20;
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 6);
    FX.update(dt);
    const T = this.t;
    if (this.kind === 'chief_intro') this.updIntro(dt, T);
    else if (this.kind === 'chief_defeat') this.updDefeat(dt, T);
    else if (this.kind === 'mini_intro') { if (T > KM.end) this.finish(); }
    else if (this.kind === 'mini_defeat') {
      this.cue('burst', KX.crack, () => { Audio_.splash(2); Audio_.noise(0.5, 0.3, 900, 60); });
      if (T > KX.crack && T < KX.crack + 0.06) FX.shard(this.anchored ? this.ax : 320, this.anchored ? this.ay : 196, 16);
      this.cue('stamp', KX.stamp, () => { Audio_.tone(120, 0.22, 'square', 0.28, -60); Audio_.noise(0.2, 0.25, 1600, 200); });
      if (T > KX.stamp && T < KX.stamp + 0.05) this.shake = 5;
      if (T > KX.end) this.finish();
    }
  },

  finish() { this.active = false; this.done = true; this.worldActive = true; this.kind = null; FX.clear(); },

  // ---- the Chief arrives --------------------------------------------------
  updIntro(dt, T) {
    const s = this._shk, c = this._chf;
    if (T < KI.breach) {
      // he is still a shadow under the swell, coming in from the right
      const k = clamp(T / KI.breach, 0, 1);
      s.x = R(lerp(596, 306, k * k)); s.y = 212; s.rot = 0;
      if (T > KI.alarm && Math.random() < 14 * dt) FX.drop(s.x + rand(-40, 40), HZ + 24, 1, 0.5, 10);
      this.cue('gong', KI.alarm, () => { Audio_.tone(196, 1.1, 'triangle', 0.22, -70); Audio_.noise(0.7, 0.14, 1100, 120); });
      this.cue('gong2', KI.alarm + 0.55, () => { Audio_.tone(146, 1.2, 'triangle', 0.2, -50); });
    } else if (T < KI.close) {
      // the leap: a parabola out of the water, nose up on the way
      const k = clamp((T - KI.breach) / (KI.close - KI.breach), 0, 1);
      s.x = R(lerp(306, 396, k));
      s.y = R(214 - Math.sin(k * 2.2) * 150);
      s.rot = lerp(-0.85, -0.15, k);
      c.x = s.x + R(Math.cos(s.rot) * -6); c.y = s.y - R(Math.cos(s.rot) * 16); c.rot = s.rot;
      if (this.cue('breach', KI.breach, () => { Audio_.roar(); Audio_.splash(3); Audio_.explosion(0.8); })) {
        this.shake = 9; this.flash = 0.7;
        FX.drop(306, HZ + 24, 46, 1.6, 34);
      }
      if (Math.random() < 40 * dt) FX.drop(s.x + rand(-40, 30), s.y + rand(-8, 18), 1, 0.4, 6);
    } else if (T < KI.down) {
      // the close-up. he breathes, the spear comes up, then he speaks
      this.cue('card', KI.close, () => { Audio_.tone(74, 0.7, 'sawtooth', 0.26, -20); Audio_.noise(0.35, 0.2, 500, 60); });
      this.cue('card2', KI.close + 0.14, () => Audio_.tone(52, 0.9, 'square', 0.18, -14));
      this.cue('say', KI.line, () => Audio_.tone(104, 0.5, 'sawtooth', 0.16, -34));
      if (Math.random() < 16 * dt) FX.drop(rand(180, 460), rand(40, 150), 1, -0.25, 4);
    } else {
      // and down he comes
      const k = clamp((T - KI.down) / 0.42, 0, 1);
      s.x = 404; s.y = R(lerp(74, 226, k * k)); s.rot = lerp(0.55, 1.15, k);
      c.x = s.x - 8; c.y = s.y - 14; c.rot = s.rot;
      if (this.cue('crash', KI.down + 0.38, () => { Audio_.explosion(1.5); Audio_.splash(3); })) {
        this.shake = 12; this.flash = 0.85;
        FX.drop(404, HZ + 26, 60, 1.8, 46);
      }
      this.fade = clamp((T - (KI.end - 0.55)) / 0.55, 0, 1);
      if (this.fade > 0) this.worldActive = true;         // let the fight fade in under us
      if (T > KI.end) this.finish();
    }
  },

  // ---- the Chief goes down ------------------------------------------------
  updDefeat(dt, T) {
    const s = this._shk, c = this._chf, m = this._man, o = this._ott;
    if (T < KD.slip) {
      const k = clamp(T / KD.slip, 0, 1);
      s.rot = lerp(0.5, 1.45, k); s.y = 216 + R(k * 10);
      c.rot = lerp(0.4, 1.2, k); c.y = 204 + R(k * 12); c.x = 372 - R(k * 6);
      if (Math.random() < 10 * dt) FX.bub(s.x + rand(-40, 40), s.y + rand(-6, 10), 1);
    } else if (T < KD.rise) {
      const k = clamp((T - KD.slip) / (KD.rise - KD.slip), 0, 1);
      s.rot = 1.45 + k * 0.5; s.y = 226 + R(k * 52);
      c.rot = 1.2 + k * 1.4; c.y = 216 + R(k * 64); c.x = 366 - R(k * 14);
      if (this.cue('under', KD.slip, () => { Audio_.splash(1.6); Audio_.tone(58, 0.8, 'sine', 0.22, -20); })) FX.bub(360, 222, 14);
      if (Math.random() < 14 * dt) FX.bub(360 + rand(-22, 22), 226 + rand(0, 20), 1);
    } else {
      // they keep going down while she comes up
      s.y += 46 * dt; s.rot += 0.3 * dt;
      c.y += 40 * dt; c.rot += 0.9 * dt;
      const k = clamp((T - KD.rise) / 1.05, 0, 1);
      const e = k * k * (3 - 2 * k);
      m.y = R(lerp(368, 288, e)); m.x = 448;
      o.y = m.y - 30; o.x = 462;
      if (this.cue('rise', KD.rise, () => { Audio_.splash(2.6); Audio_.tone(150, 0.6, 'sine', 0.18, 90); })) {
        FX.drop(448, 316, 40, 1.5, 58);
      }
      if (k < 1 && Math.random() < 26 * dt) FX.drop(448 + rand(-64, 64), m.y + rand(-4, 16), 1, 0.7, 8);
      o.arm = clamp((T - KD.hat) / 0.5, 0, 1);
      o.hat = clamp((T - KD.hat - 0.15) / 0.4, 0, 1);
      this.cue('hat', KD.hat, () => Audio_.tone(330, 0.5, 'triangle', 0.10, 120));
      this.cue('mum', KD.mother, () => { Audio_.tone(262, 1.4, 'sine', 0.12, 40); Audio_.tone(392, 1.6, 'sine', 0.08, 30); });
      this.cue('rib', KD.ribbon, () => { Audio_.tone(196, 0.8, 'square', 0.16); Audio_.tone(294, 0.9, 'square', 0.12); });
      this.fade = clamp((T - (KD.end - 0.55)) / 0.55, 0, 1);
      if (this.fade > 0) this.worldActive = true;
      if (T > KD.end) this.finish();
    }
    if (Math.random() < 9 * dt) FX.ember(128, HZ - 6, 1);
  },

  // =======================================================================
  //  RENDER — world layer (minis, when the caller gave us a position)
  // =======================================================================
  renderWorld(ctx, cam, t) {
    if (this.done || !this.anchored || !BUILT) return;
    const ox = -cam.x, oy = -cam.y;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (this.kind === 'mini_intro') this.drawMini(ctx, this.ax + ox, this.ay + oy, this.t);
    else if (this.kind === 'mini_defeat') this.drawMiniBreak(ctx, this.ax + ox, this.ay + oy, this.t);
    FX.render(ctx, ox, oy);
    ctx.restore();
  },

  // =======================================================================
  //  RENDER — everything in 640x360 logical screen space
  // =======================================================================
  renderScreen(ctx, t) {
    if (this.done || !this.kind || !BUILT) return;
    // the Chief's two cuts own the whole frame, so they hand back to the game
    // by fading THEMSELVES out over the live world.  Only then do we pay for
    // the extra buffer, and only for the last half second.
    if (this.fade > 0.02) {
      const a = qa(1 - this.fade);
      if (a <= 0) return;
      const bx = A.bufCtx;
      bx.clearRect(0, 0, 640, 360);
      this.paint(bx, t);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = a;
      ctx.drawImage(A.buf, 0, 0);
      ctx.restore();
      return;
    }
    this.paint(ctx, t);
  },
  paint(ctx, t) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const sh = this.shake;
    if (sh > 0.4) ctx.translate(R(rand(-sh, sh)), R(rand(-sh, sh)));
    if (this.kind === 'chief_intro') this.drawIntro(ctx, this.t, t);
    else if (this.kind === 'chief_defeat') this.drawDefeat(ctx, this.t, t);
    else if (this.kind === 'mini_intro') this.drawMiniIntro(ctx, this.t);
    else this.drawMiniDefeat(ctx, this.t);
    ctx.restore();
    if (this.flash > 0.02) P(ctx, rgbaq('#ffffff', Math.min(0.85, this.flash)), 0, 0, 640, 360);
  },

  // ---- shared furniture ---------------------------------------------------
  letterbox(ctx, k) {
    const h = R(BAR * (k === undefined ? 1 : clamp(k, 0, 1)));
    if (h <= 0) return;
    P(ctx, '#000000', 0, 0, 640, h);
    P(ctx, '#000000', 0, 360 - h, 640, h);
  },
  caption(ctx, lines, T) {
    for (let i = 0; i < lines.length; i++) {
      const at = lines[i][0], dur = lines[i][1], s = lines[i][2];
      if (T < at || T > at + dur + 0.6) continue;
      const prog = T - at;
      const n = Math.max(0, Math.min(s.length, Math.floor(prog * 36)));
      const shown = s.slice(0, n);
      ctx.globalAlpha = T > at + dur ? qa(1 - (T - at - dur) / 0.6) : 1;
      pixelTextOutlined(ctx, shown, 320, 344, 8, '#e8eef4', '#000000', 'center');
      if (n < s.length && (Math.floor(prog * 8) & 1)) P(ctx, '#e8eef4', 320 + R(textWidth(shown, 8) / 2) + 2, 345, 4, 7);
      ctx.globalAlpha = 1;
    }
  },
  swell(ctx, T) {
    for (let i = 0; i < 7; i++) {
      const u = i / 6;
      const y = R(HZ + 4 + Math.pow(u, 1.7) * (360 - HZ - 22) + Math.sin(T * 0.7 + i * 1.6) * 1.5);
      const off = R(T * (7 + u * 26)) % 640;
      ctx.drawImage(A.swell[i], -off, y);
      ctx.drawImage(A.swell[i], 640 - off, y);
    }
  },
  vignette(ctx) {
    for (let i = 0; i < 12; i++) {
      const inset = i * 6, a = qa(0.10 - i * 0.007);
      if (a <= 0) break;
      ctx.fillStyle = rgbaq('#04060e', a);
      ctx.fillRect(0, inset, 640, 1); ctx.fillRect(0, 359 - inset, 640, 1);
      ctx.fillRect(inset, 0, 1, 360); ctx.fillRect(639 - inset, 0, 1, 360);
    }
  },
  // a hard black slab that slams in from one side (extra slides it back out)
  slab(ctx, y, h, k, dir, col, extra) {
    if (k <= 0) return 0;
    const e = k >= 1 ? 0 : (1 - k) * (1 - k) * 760;
    const ox = R(dir * e + (extra || 0));
    P(ctx, col || '#000000', ox, y, 640, h);
    return ox;
  },

  // ---- CHIEF: the arrival -------------------------------------------------
  drawIntro(ctx, T, t) {
    if (T >= KI.close && T < KI.down) { this.drawIntroClose(ctx, T, t); return; }
    ctx.drawImage(A.bayDusk, 0, 0);
    this.swell(ctx, T);
    const s = this._shk;
    if (T < KI.breach) {
      // the water goes wrong: a shadow, then the fin, then the hump
      const k = clamp(T / KI.breach, 0, 1);
      ctx.globalAlpha = qa(0.35 + k * 0.5);
      ctx.drawImage(A.shadow.c, s.x - A.shadow.ax, HZ + 26 - A.shadow.ay);
      ctx.globalAlpha = 1;
      if (T > KI.alarm) {
        const fk = clamp((T - KI.alarm) / (KI.breach - KI.alarm), 0, 1);
        const fy = R(HZ + 22 - fk * 6);
        ctx.drawImage(A.fin.c, s.x + 26 - A.fin.ax, fy - A.fin.ay);
        // the wake either side of it
        for (let i = 0; i < 16; i++) {
          const dx = 26 + i * 7, a = 1 - i / 16;
          P(ctx, BP.foam[a > 0.5 ? 3 : 1], s.x + dx, fy + R(i * 0.5), 3, 1);
          P(ctx, BP.foam[a > 0.5 ? 3 : 1], s.x + dx, fy - R(i * 0.5), 3, 1);
        }
        // the surface humps up over his back
        for (let dx = -56; dx <= 56; dx++) {
          const hgt = R(Math.cos(dx / 56 * 1.5) * 7 * fk);
          if (hgt <= 0) continue;
          P(ctx, BP.foam[1], s.x + dx, HZ + 20 - hgt, 1, hgt);
          if (bay(s.x + dx, HZ) < 0.5) P(ctx, BP.foam[3], s.x + dx, HZ + 19 - hgt, 1, 2);
        }
      }
      // the village lights up and empties onto the pier
      this.drawAlarm(ctx, T, t);
    } else {
      // the launch column of water he came through
      const bk = clamp((T - KI.breach) / 0.55, 0, 1);
      if (bk < 1) {
        const fr = A.spray[Math.min(3, Math.floor(bk * 4))];
        ctx.drawImage(fr.c, 306 - fr.ax, HZ + 30 - fr.h + R(bk * 26));
      }
      const rk = clamp((T - KI.breach) / 0.9, 0, 1);
      if (rk < 1) {
        const rg = A.ring[Math.min(7, Math.floor(rk * 8))];
        ctx.drawImage(rg.c, 306 - rg.ax, HZ + 30 - rg.ay);
      }
      this.drawAlarm(ctx, T, t);
      // the animal itself, and the man on its back
      this.drawRider(ctx, s, this._chf, 1);
      if (T >= KI.down) {
        const dk = clamp((T - KI.down - 0.32) / 0.5, 0, 1);
        if (dk > 0) {
          const fr = A.spray[Math.min(3, Math.floor(dk * 4))];
          ctx.drawImage(fr.c, 404 - fr.ax, HZ + 34 - fr.h);
          const fr2 = A.spray[Math.min(3, 3 - Math.floor(dk * 3))];
          ctx.save(); ctx.scale(-1, 1);
          ctx.drawImage(fr2.c, -(404 + fr2.ax), HZ + 36 - fr2.h);
          ctx.restore();
        }
      }
    }
    FX.render(ctx, 0, 0);
    this.vignette(ctx);
    this.letterbox(ctx, T / 0.5);
    this.caption(ctx, LINES_I, T);
    if (T < 1.5) {
      ctx.globalAlpha = qa(clamp((T - 0.55) / 0.5, 0, 1) * clamp((1.5 - T) / 0.35, 0, 1));
      pixelTextOutlined(ctx, 'FISHER VILLAGE', 320, 34, 7, '#9fb3c4', '#000000', 'center');
      ctx.globalAlpha = 1;
    }
  },
  // torches lighting one by one, and little figures running out to look
  drawAlarm(ctx, T, t) {
    if (T < KI.alarm) return;
    for (let i = 0; i < TORCH.length; i++) {
      if (T < KI.alarm + i * 0.11) continue;
      const tx = TORCH[i][0], ty = TORCH[i][1];
      const f = Math.floor(t * 12 + i) % 3;
      P(ctx, BP.fire[2], tx - 1, ty - 4, 3, 5);
      P(ctx, BP.fire[3], tx, ty - 5 - f, 1, 4);
      P(ctx, BP.fire[4], tx, ty - 4, 1, 2);
    }
    const run = clamp((T - KI.alarm - 0.2) / 0.9, 0, 1);
    for (let i = 0; i < 5; i++) {
      const fx = R(lerp(30 + i * 22, 118 + i * 17, run));
      const fy = HZ - 18 - (i & 1);
      const bob = (Math.floor(t * 9 + i * 2) & 1) && run < 1 ? 1 : 0;
      P(ctx, BP.ink, fx, fy - 7 - bob, 2, 5);
      P(ctx, BP.ink, fx, fy - 2 - bob, 1, 2 + bob);
      P(ctx, BP.ink, fx + 1, fy - 2, 1, 2);
      if (run >= 1 && (i & 1)) P(ctx, BP.ink, fx + 2, fy - 8, 2, 1);   // an arm, pointing
    }
  },
  drawRider(ctx, s, c, sc) {
    ctx.save();
    ctx.translate(R(s.x), R(s.y));
    ctx.rotate(s.rot);
    ctx.drawImage(A.shark.c, -A.shark.ax, -A.shark.ay);
    // the man sits forward of the dorsal, upright against the arc
    ctx.translate(-4, -12);
    ctx.rotate(-s.rot * 0.55);
    ctx.drawImage(A.chief.c, -A.chief.ax, -A.chief.ay);
    ctx.save();
    ctx.translate(9, -26); ctx.rotate(-0.85);
    ctx.drawImage(A.spear.c, -A.spear.ax, -A.spear.ay);
    ctx.restore();
    ctx.restore();
  },
  // ---- CHIEF: the close-up ------------------------------------------------
  drawIntroClose(ctx, T, t) {
    ctx.drawImage(A.closeBg, 0, 0);
    const k = clamp((T - KI.close) / 0.35, 0, 1);
    const bob = R(Math.sin(t * 2.4) * 2);
    // the animal's back under him, at 3x
    const sb = A.sharkBack;
    ctx.drawImage(sb.c, 0, 0, sb.w, sb.h, 320 - sb.ax * 3, 292 + bob - sb.ay * 3, sb.w * 3, sb.h * 3);
    // water still sheeting off them
    const sk = clamp((T - KI.close) / 0.6, 0, 1);
    if (sk < 1) {
      const fr = A.sprayS[Math.min(3, Math.floor(sk * 4))];
      ctx.drawImage(fr.c, 0, 0, fr.w, fr.h, 320 - fr.ax * 2, 300 + R(sk * 40) - fr.h * 2, fr.w * 2, fr.h * 2);
    }
    // him: a warm rim behind, then the man
    const ch = A.chief, cy = 268 + bob;
    ctx.globalAlpha = qa(0.55 + Math.sin(t * 3) * 0.08);
    ctx.drawImage(A.chiefRim.c, 0, 0, ch.w, ch.h, 320 - ch.ax * 3 - 3, cy - ch.ay * 3 - 3, ch.w * 3, ch.h * 3);
    ctx.globalAlpha = 1;
    ctx.drawImage(ch.c, 0, 0, ch.w, ch.h, 320 - ch.ax * 3, cy - ch.ay * 3, ch.w * 3, ch.h * 3);
    // the spear, raised
    const sp = A.spear, lift = clamp((T - KI.close - 0.2) / 0.5, 0, 1);
    ctx.save();
    ctx.translate(320 + 30, cy - 78 - R(lift * 10) + bob);
    ctx.rotate(lerp(-0.4, -1.15, lift));
    ctx.drawImage(sp.c, 0, 0, sp.w, sp.h, -sp.ax * 3, -sp.ay * 3, sp.w * 3, sp.h * 3);
    ctx.restore();
    FX.render(ctx, 0, 0);
    this.vignette(ctx);
    this.letterbox(ctx, 1);
    // the name card slams in under him
    const ck = clamp((T - KI.close) / 0.22, 0, 1);
    const fadeCard = T > KI.line + 0.5 ? clamp(1 - (T - KI.line - 0.5) / 0.4, 0, 1) : 1;
    if (ck > 0 && fadeCard > 0) {
      ctx.globalAlpha = qa(fadeCard);
      const ox = this.slab(ctx, 176, 26, ck, -1, '#000000');
      P(ctx, BP.red, ox, 176, 640, 2);
      P(ctx, BP.red, ox, 200, 640, 1);
      pixelTextOutlined(ctx, 'THE VILLAGE CHIEF', 320 + ox, 180, 16, BP.gold, '#14141c', 'center');
      if (ck >= 1) pixelText(ctx, 'HE RIDES THE THING THAT TOOK HER', 320, 206, 7, '#d8a0a0', 'center');
      ctx.globalAlpha = 1;
    }
    // and his line
    if (T >= KI.line) {
      const s = '"i put the iron in your mother."';
      const n = Math.min(s.length, Math.floor((T - KI.line) * 30));
      pixelText(ctx, 'THE CHIEF', 320, 328, 6, '#a06060', 'center');
      pixelTextOutlined(ctx, s.slice(0, n), 320, 340, 9, '#ffd7a0', '#000000', 'center');
      if (n < s.length && (Math.floor((T - KI.line) * 8) & 1)) P(ctx, '#ffd7a0', 320 + R(textWidth(s.slice(0, n), 9) / 2) + 2, 341, 4, 8);
    }
    if (k < 1) P(ctx, rgbaq('#000000', 1 - k), 0, 0, 640, 360);
  },

  // ---- CHIEF: the defeat --------------------------------------------------
  drawDefeat(ctx, T, t) {
    const bi = T < KD.mother ? 0 : T < KD.mother + 0.9 ? 1 : 2;
    ctx.drawImage(A.bayNight[bi], 0, 0);
    this.swell(ctx, T);
    // the wreck of his boat, burning down on the water
    const fl = A.flame[Math.floor(t * 12) % 4];
    ctx.drawImage(fl.c, 128 - fl.ax, HZ - 2 - fl.ay);
    const fl2 = A.flame[Math.floor(t * 9 + 2) % 4];
    ctx.drawImage(fl2.c, 0, 0, fl2.w, fl2.h, 150 - R(fl2.ax * 0.6), HZ - 2 - R(fl2.h * 0.6), R(fl2.w * 0.6), R(fl2.h * 0.6));
    // her mother, drifting past under the surface
    if (T >= KD.mother) {
      const mk = clamp((T - KD.mother) / 2.1, 0, 1);
      const g = A.manGhost;
      const gx = R(lerp(110, 400, mk)), gy = 244 + R(Math.sin(mk * 3.1) * 4);
      ctx.globalAlpha = qa(Math.sin(clamp(mk, 0, 1) * Math.PI) * 0.95);
      ctx.drawImage(g.c, gx - g.ax, gy - g.ay);
      ctx.globalAlpha = 1;
    }
    const s = this._shk, c = this._chf, m = this._man, o = this._ott;
    // the shark, over on its side and going down
    if (s.y < 306) {
      ctx.save();
      ctx.translate(R(s.x), R(s.y)); ctx.rotate(s.rot);
      ctx.globalAlpha = qa(clamp((306 - s.y) / 70, 0, 1));
      ctx.drawImage(A.shark.c, -A.shark.ax, -A.shark.ay);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // him, sliding off it
    if (c.y < 302) {
      ctx.save();
      ctx.translate(R(c.x), R(c.y)); ctx.rotate(c.rot);
      ctx.globalAlpha = qa(clamp((302 - c.y) / 56, 0, 1));
      ctx.drawImage(A.chief.c, -A.chief.ax, -A.chief.ay);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // the spear, turning over as it falls
    if (T > KD.slip && T < KD.rise + 0.6) {
      const k = (T - KD.slip);
      ctx.save();
      ctx.translate(R(352 + k * 16), R(196 + k * k * 76)); ctx.rotate(k * 3.4);
      ctx.drawImage(A.spear.c, -A.spear.ax, -A.spear.ay);
      ctx.restore();
    }
    if (T >= KD.rise) {
      const k = clamp((T - KD.rise) / 1.05, 0, 1);
      // the ring of foam she came up through
      if (k < 1) {
        const rg = A.ring[Math.min(7, Math.floor(k * 8))];
        ctx.drawImage(rg.c, 448 - rg.ax, 318 - rg.ay);
      }
      // her
      ctx.save();
      ctx.translate(R(m.x), R(m.y));
      ctx.scale(-1, 1);                                    // she faces the village
      ctx.drawImage(A.man.c, -A.man.ax, -A.man.ay);
      ctx.restore();
      // water still coming off her back
      if (k < 1) for (let i = 0; i < 14; i++) {
        const dx = -66 + i * 10, hgt = R((1 - k) * 14 * (0.4 + hash2(i, 3)));
        if (hgt <= 0) continue;
        P(ctx, BP.foam[3], m.x + dx, m.y - 20 - hgt, 1, hgt);
      }
      // him, standing on her
      const oy = R(o.y - Math.sin(t * 2) * 1);
      ctx.save();
      ctx.translate(R(o.x), oy);
      ctx.scale(-1, 1);
      ctx.drawImage(A.ott.c, -A.ott.ax, -A.ott.ay);
      // the rifle, held down at his side until the hat comes off
      const rf = A.rifle;
      ctx.save(); ctx.translate(-10, -6); ctx.rotate(lerp(0.9, 1.5, o.arm));
      ctx.drawImage(rf.c, -rf.ax, -rf.ay); ctx.restore();
      ctx.restore();
      // the hat: on his head, then in his hand, held against his chest
      const h = A.hat;
      if (o.hat <= 0) ctx.drawImage(h.c, o.x - h.ax, oy - 27 - h.ay);
      else {
        const hx = R(lerp(o.x, o.x - 9, o.hat)), hy = R(lerp(oy - 27, oy - 13, o.hat));
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(lerp(0, -0.9, o.hat));
        ctx.drawImage(h.c, -h.ax, -h.ay); ctx.restore();
        // his arm, up to hold it
        P(ctx, '#c8703c', o.x - 8, oy - 20, 3, 8);
        P(ctx, BP.ink, o.x - 9, oy - 20, 1, 8);
      }
    }
    FX.render(ctx, 0, 0);
    this.vignette(ctx);
    this.letterbox(ctx, 1);
    this.caption(ctx, LINES_D, T);
    // the card
    if (T >= KD.ribbon) {
      const ck = clamp((T - KD.ribbon) / 0.25, 0, 1);
      const ox = this.slab(ctx, 40, 28, ck, 1, '#000000');
      P(ctx, BP.goldD, ox, 40, 640, 1);
      P(ctx, BP.goldD, ox, 67, 640, 1);
      pixelTextOutlined(ctx, 'THE VILLAGE CHIEF IS DEAD', 320 + ox, 46, 14, BP.gold, '#14141c', 'center');
      if (ck >= 1) pixelText(ctx, 'THE BOATS WILL NOT FISH HERE AGAIN', 320, 74, 7, '#9fb3c4', 'center');
    }
  },

  // ---- MINI: the arrival --------------------------------------------------
  drawMiniIntro(ctx, T) {
    const dark = clamp(T / 0.18, 0, 1) * (T > KM.out ? clamp(1 - (T - KM.out) / 0.3, 0, 1) : 1);
    P(ctx, rgbaq('#03070e', dark * 0.62), 0, 0, 640, 360);
    if (!this.anchored) { this.drawMini(ctx, 320, 196, T); FX.render(ctx, 0, 0); }
    const lb = clamp(T / 0.12, 0, 1) * (T > KM.out ? clamp(1 - (T - KM.out) / 0.28, 0, 1) : 1);
    this.letterbox(ctx, lb * 0.55);
    // the card
    const ck = clamp((T - KM.card) / 0.16, 0, 1);
    const out = T > KM.out ? clamp((T - KM.out) / 0.34, 0, 1) : 0;
    if (ck <= 0) return;
    const fly = out * out * 700;
    const nameSize = this.fitSize(this.name, 560, 20);
    const topOx = this.slab(ctx, 120, 20, ck, -1, '#0a0910', -fly);
    P(ctx, BP.red, topOx, 138, 640, 2);
    pixelText(ctx, 'THE WATER MOVES WRONG', 320 + topOx, 125, 8, '#c86a6a', 'center');
    const botOx = this.slab(ctx, 140, 34, ck, 1, '#0a0910', fly);
    pixelTextOutlined(ctx, this.name, 320 + botOx, 148, nameSize, BP.gold, '#14141c', 'center');
    P(ctx, BP.red, botOx, 174, 640, 1);
  },
  fitSize(s, maxW, start) {
    for (let sz = start; sz > 8; sz -= 2) if (textWidth(s, sz) <= maxW) return sz;
    return 8;
  },
  // the shape itself, rising out of the dark
  drawMini(ctx, cx, cy, T) {
    const k = clamp((T - KM.rise) / 0.55, 0, 1);
    const e = 1 - (1 - k) * (1 - k);
    const y = R(cy + (1 - e) * 42);
    const ri = Math.min(7, Math.floor(clamp(T / 0.8, 0, 1) * 8));
    const rg = A.mRing[ri];
    ctx.globalAlpha = qa(clamp(1 - T / 1.1, 0.15, 1));
    ctx.drawImage(rg.c, R(cx) - rg.ax, R(cy) - rg.ay);
    ctx.globalAlpha = qa(0.35 + e * 0.65);
    ctx.drawImage(A.mini.c, R(cx) - A.mini.ax, y - A.mini.ay);
    ctx.globalAlpha = 1;
    // the eyes come on last
    if (T > 0.34) {
      const f = (Math.floor(T * 22) & 1) || T > 0.55;
      const ex = R(cx) + 48, ey = y - 12;
      for (let s = -1; s <= 1; s += 2) {
        P(ctx, f ? BP.red : '#5a0d12', ex, ey + s * 12 - 2, 5, 4);
        if (f) P(ctx, '#ffd0a0', ex + 1, ey + s * 12 - 1, 2, 2);
      }
    }
  },
  // ---- MINI: the sting ----------------------------------------------------
  drawMiniDefeat(ctx, T) {
    const dark = clamp(T / 0.1, 0, 1) * (T > KX.out ? clamp(1 - (T - KX.out) / 0.3, 0, 1) : 1);
    P(ctx, rgbaq('#03070e', dark * 0.55), 0, 0, 640, 360);
    if (!this.anchored) { this.drawMiniBreak(ctx, 320, 196, T); FX.render(ctx, 0, 0); }
    const lb = clamp(T / 0.1, 0, 1) * (T > KX.out ? clamp(1 - (T - KX.out) / 0.26, 0, 1) : 1);
    this.letterbox(ctx, lb * 0.5);
    const ck = clamp((T - KX.card) / 0.14, 0, 1);
    if (ck <= 0) return;
    const out = T > KX.out ? clamp((T - KX.out) / 0.34, 0, 1) : 0;
    const drop = R(out * out * 260);
    const nameSize = this.fitSize(this.name, 520, 18);
    const ox = R(this.slab(ctx, 148 + drop, 34, ck, -1, '#0a0910'));
    P(ctx, '#3a3040', ox, 148 + drop, 640, 1);
    P(ctx, '#3a3040', ox, 181 + drop, 640, 1);
    pixelTextOutlined(ctx, this.name, 320 + ox, 154 + drop, nameSize, '#8e9aa8', '#14141c', 'center');
    if (T >= KX.stamp) {
      // struck through, and stamped
      const w = Math.min(600, textWidth(this.name, nameSize) + 40);
      for (let i = 0; i < 5; i++) {
        const y = 163 + drop + i;
        P(ctx, i === 0 || i === 4 ? '#7a0d16' : BP.red, 320 - w / 2 + i * 2, y, w, 1);
      }
      const sk = clamp((T - KX.stamp) / 0.1, 0, 1);
      const sc = R(lerp(30, 22, sk));
      ctx.globalAlpha = qa(sk);
      pixelTextOutlined(ctx, 'DOWN', 320, 190 + drop - R((1 - sk) * 6), sc, '#ff6161', '#14141c', 'center');
      ctx.globalAlpha = 1;
    }
  },
  drawMiniBreak(ctx, cx, cy, T) {
    const k = clamp(T / KX.crack, 0, 1);
    if (T < KX.crack + 0.5) {
      const gone = clamp((T - KX.crack) / 0.5, 0, 1);
      ctx.globalAlpha = qa((1 - gone) * 0.95);
      const s = T < KX.crack ? A.miniWhite : A.mini;
      const jitter = T < KX.crack ? R(rand(-2, 2)) : 0;
      ctx.drawImage(s.c, R(cx) - s.ax + jitter, R(cy) - s.ay, s.w, s.h);
      ctx.globalAlpha = 1;
    }
    const ri = Math.min(7, Math.floor(clamp((T - KX.crack) / 0.7, 0, 1) * 8));
    if (T >= KX.crack) {
      const rg = A.mRing[ri];
      ctx.globalAlpha = qa(clamp(1 - (T - KX.crack) / 0.9, 0.1, 1));
      ctx.drawImage(rg.c, R(cx) - rg.ax, R(cy) - rg.ay);
      ctx.globalAlpha = 1;
    }
    if (k < 1) P(ctx, rgbaq('#ffffff', (1 - k) * 0.5), R(cx) - 90, R(cy) - 48, 180, 96);
  },
};

global.BossCut = BossCut;
})(typeof window !== 'undefined' ? window : this);
