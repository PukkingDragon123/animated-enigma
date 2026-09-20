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
function cloneSpr(o) {
  const src = o.c || o, c = can(src.width, src.height);
  cx2(c).drawImage(src, 0, 0);
  return c;
}
// posterized tint: pull every pixel a fixed fraction toward a colour and
// snap the result onto a coarse level set, so it stays a flat palette
function tintCanvas(c, col, amt) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data, C = hexToRgb(col);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4; if (d[p + 3] < 9) continue;
    for (let k = 0; k < 3; k++) {
      const v = d[p + k] + (C[k] - d[p + k]) * amt;
      d[p + k] = Math.round(v / 17) * 17;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Paint a lit edge onto a finished sprite: every outermost opaque pixel on
// the side the light comes from is recoloured, one band hot, one band warm.
// Colouring the light instead of the object is what stops these figures
// reading as flat cut-outs against a coloured sky.
function rimLight(c, lx, ly, hot, warm, depth) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  const HOT = hexToRgb(hot), WRM = warm ? hexToRgb(warm) : null;
  depth = depth || 1;
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
    const i = y * w + px;
    if (!op[i]) continue;
    const qx = px - lx, qy = y - ly;
    const out = qx < 0 || qy < 0 || qx >= w || qy >= h || !op[qy * w + qx];
    if (!out) continue;
    for (let k = 0; k < depth; k++) {
      const rx = px + lx * k, ry = y + ly * k;
      if (rx < 0 || ry < 0 || rx >= w || ry >= h) break;
      const j = ry * w + rx;
      if (!op[j]) break;
      const col = k === 0 ? HOT : WRM;
      if (!col) break;
      if (k > 0 && bay(rx, ry) > 0.55) break;
      const q = j * 4;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
// coloured bounce light on the underside: the water throws colour back up
function bounceLight(c, col, rows, bias) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  const C = hexToRgb(col);
  for (let px = 0; px < w; px++) {
    let hit = -1;
    for (let y = h - 1; y >= 0; y--) if (op[y * w + px]) { hit = y; break; }
    if (hit < 0) continue;
    for (let k = 0; k < rows; k++) {
      const y = hit - k; if (y < 0 || !op[y * w + px]) break;
      if (bay(px, y) > (1 - k / rows) * (bias || 0.8)) continue;
      const q = (y * w + px) * 4;
      d[q] = C[0]; d[q + 1] = C[1]; d[q + 2] = C[2]; d[q + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Bake-time pixel buffer.  Speckly sprites (foam rings, spray, flame) are
// tens of thousands of single pixels each; as fillRect calls the whole bake
// cost most of half a second, so they are written straight into bytes.
function pixBuf(w, h) { return { w: w, h: h, d: new Uint8ClampedArray(w * h * 4) }; }
function pixTo(b) { const c = can(b.w, b.h); cx2(c).putImageData(new ImageData(b.d, b.w, b.h), 0, 0); return c; }
function pset(b, c, x, y) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const p = (y * b.w + x) * 4;
  b.d[p] = c[0]; b.d[p + 1] = c[1]; b.d[p + 2] = c[2]; b.d[p + 3] = 255;
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
  // DUSK — indigo zenith, through violet and rose, into ember and gold at the
  // waterline.  Fifteen bands so the dither has something to ramp between.
  skyDusk:  ['#140b2e', '#1c1039', '#271345', '#37174c', '#4b1c4e', '#642349', '#802c44',
             '#9c3a3e', '#b84a37', '#ce5f31', '#df7a31', '#ed993c', '#f6b755', '#fbd27e', '#ffeab4'],
  // NIGHT — cold indigo above, with the fire in the village bleeding a dirty
  // ember bruise into the bottom bands.
  skyNight: ['#03040e', '#050816', '#080c20', '#0c112b', '#111636', '#171c41', '#1f224c',
             '#28264f', '#332851', '#3f2a4d', '#4c2a44', '#5c2b3a'],
  skyDim:   ['#05070f', '#080c1c', '#0d1329', '#131b36', '#1a2444', '#232c51', '#2f335e',
             '#3b3667', '#4a3868', '#5c3a62', '#703c58', '#833e4c'],
  // DAWN — the whole spectacle: night blue, violet, magenta, coral, amber, gold.
  skyDawn:  ['#080c24', '#0d1531', '#131e41', '#1a2951', '#243461', '#33396e', '#463c76',
             '#5c3f74', '#75416c', '#8d4762', '#a45259', '#b86153', '#ca7353', '#d98a57',
             '#e6a462', '#f0bf78', '#f8da9e'],
  // SEA — index 0 is the near water at our feet, the last is right at the
  // horizon, where it has to carry the sky's colour or nothing joins up.
  sea:      ['#02040c', '#040815', '#060b1e', '#090f28', '#0b1533', '#0e1b3f', '#12224b',
             '#172956', '#1d305f', '#243766'],
  seaDusk:  ['#060616', '#080a20', '#0b0f2a', '#0e1637', '#121e44', '#172852', '#1f3260',
             '#2c3b68', '#42406c', '#5c456a', '#794a63', '#94525a', '#a95d4e'],
  seaDawn:  ['#05081a', '#070c26', '#0a1233', '#0d1941', '#12224f', '#182c5d', '#22356a',
             '#333b73', '#4a3f75', '#65456f', '#824b66', '#9d545c', '#b56152', '#c87055'],
  // chop, from the near water out to the horizon — it is not one grey
  chopDusk: ['#2a3358', '#3c4470', '#5a5078', '#7d5a74', '#a06a6a', '#c07f62'],
  chopNight:['#16244a', '#1d2f58', '#263a64', '#35416b', '#48446a', '#5c4560'],
  chopDawn: ['#1d2c58', '#27396a', '#354578', '#4a4d7c', '#66507a', '#875672'],
  foam:     ['#33566b', '#5d8298', '#8fb4c8', '#c8e2ef', '#f2fbff'],
  foamWarm: ['#5c3a4a', '#95576a', '#c47d6e', '#e8c08a', '#fff0cf'],
  vill:     '#090810', villR: '#1e1a28', villL: '#322b3e',
  fire:     ['#5c1b10', '#9c3115', '#d4661c', '#ffab34', '#ffe6a2'],
  // the pools of light a torch throws, darkest ring out to the white core
  torchGlow:['#2a1410', '#4a2012', '#6e3315', '#9c4e1a', '#c87024', '#eda03e'],
  emberGlow:['#33110e', '#571a10', '#7f2a13', '#ab4317', '#d4661c', '#ffab34'],
  gold: '#ffe48f', goldD: '#e0a838', red: '#c4202c', redL: '#e8515a',
  bone: '#e8e4d8', white: '#f2f6fa', steel: '#8a9ab5',
  // signature colours for the two mini cards
  miniCyan: ['#071a20', '#0d2d38', '#145060', '#1d7d92', '#34b4c4', '#8ef0f6'],
  miniRed:  ['#1a0508', '#360a0e', '#5c1014', '#8c1a1c', '#c4202c', '#ff8a6a'],
};

const HZ = 190;                     // horizon / waterline in the side-on shots
const BAR = 26;                     // letterbox height
const WLY = 238;                    // where the wreck disappears under the sea

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
const SEA_CACHE = {};
function seaLayer(seaRamp, opt) {
  const chop = opt.chop || BP.foam[0], sun = opt.sun ? opt.sun[0] : -1;
  const chopR = Array.isArray(chop) ? chop : [chop];
  const glows = opt.glows || [];
  const key = seaRamp.join('') + chopR.join('') + sun + (opt.road || '') +
              glows.map(g => g[0] + g[1].join('') + g[2]).join('|');
  if (SEA_CACHE[key]) return SEA_CACHE[key];
  const H = 360 - HZ, b = pixBuf(640, H);
  const cols = seaRamp.map(hexToRgb), n = cols.length;
  for (let y = 0; y < H; y++) {
    const u = y / (H - 1);
    for (let px = 0; px < 640; px++) {
      let v = 1 - Math.pow(u, 0.62) + (hash2(px >> 2, y) - 0.5) * 0.12;
      if (v < 0) v = 0; else if (v > 1) v = 1;
      const fi = v * (n - 1);
      let i = Math.floor(fi);
      if (bay(px, y + HZ) < fi - i) i++;
      if (i < 0) i = 0; else if (i > n - 1) i = n - 1;
      pset(b, cols[i], px, y);
    }
  }
  // chop: flat dashes, longer and sparser as the water comes towards us, and
  // cooling as it does — the crests near the horizon still hold the sky.
  const CH_ = chopR.map(hexToRgb);
  for (let y = 2; y < H; y++) {
    const u = y / H, step = 3 + R(u * 5), len = 1 + R(u * 5);
    let ci = Math.round((1 - Math.pow(u, 0.5)) * (CH_.length - 1));
    if (ci < 0) ci = 0; else if (ci > CH_.length - 1) ci = CH_.length - 1;
    const C0 = CH_[ci], C1 = CH_[Math.max(0, ci - 1)];
    let sx = R(hash2(y, 91) * 40);
    while (sx < 640) {
      if (hash2(sx * 3 + y, y * 7 + 11) < 0.42) {
        const C = bay(sx, y + HZ) < 0.5 ? C0 : C1;
        for (let d = 0; d < len; d++) pset(b, C, sx + d, y);
      }
      sx += step + R(hash2(sx, y) * 9);
    }
  }
  // the light on the water under the sun, a hard dithered road
  if (sun >= 0) {
    const RD = hexToRgb(opt.road || opt.sun[3]);
    const RD2 = hexToRgb(opt.road2 || opt.sun[4] || opt.road || opt.sun[3]);
    for (let y = 0; y < H; y++) {
      const u = y / H, sp = 6 + u * 62, len = 1 + R(u * 2);
      for (let dx = -sp; dx <= sp; dx += 1) {
        const px = R(sun + dx);
        if (px < 0 || px > 639) continue;
        const fall = 1 - Math.abs(dx) / sp;
        if (bay(px, y + HZ) > fall * (0.72 - u * 0.45)) continue;
        const C = fall > 0.62 && u < 0.5 ? RD2 : RD;
        for (let d = 0; d < len; d++) pset(b, C, px + d, y);
      }
    }
  }
  // every other light on the shore also lands on the water: a torch line, a
  // burning hut.  Same posterized road, narrower and banded by its own ramp.
  for (const g of glows) {
    const gx = g[0], ramp = g[1].map(hexToRgb), reach = g[2] || 0.55, wid = g[3] || 26;
    for (let y = 0; y < H; y++) {
      const u = y / H;
      if (u > reach) break;
      const sp = 3 + u * wid, len = 1 + R(u * 2);
      const depth = 1 - u / reach;
      for (let dx = -sp; dx <= sp; dx += 1) {
        const px = R(gx + dx);
        if (px < 0 || px > 639) continue;
        const fall = (1 - Math.abs(dx) / sp) * depth;
        if (fall <= 0) continue;
        if (bay(px, y + HZ) > fall * 0.92) continue;
        let i = Math.floor(fall * ramp.length);
        if (i < 0) i = 0; else if (i > ramp.length - 1) i = ramp.length - 1;
        for (let d = 0; d < len; d++) pset(b, ramp[i], px + d, y);
      }
    }
  }
  return SEA_CACHE[key] = pixTo(b);
}
// a dithered pool of warm light thrown onto whatever is already there
function glowPool(x, cx0, cy0, rx, ry, ramp, bias) {
  bias = bias === undefined ? 0.9 : bias;
  for (let y = -ry; y <= ry; y++) for (let dx = -rx; dx <= rx; dx++) {
    const q = (dx / rx) * (dx / rx) + (y / ry) * (y / ry);
    if (q > 1) continue;
    const f = 1 - Math.sqrt(q);
    if (bay(cx0 + dx, cy0 + y) > f * bias) continue;
    let i = Math.floor(f * ramp.length);
    if (i < 0) i = 0; else if (i > ramp.length - 1) i = ramp.length - 1;
    P(x, ramp[i], cx0 + dx, cy0 + y, 1, 1);
  }
}
function buildBay(skyRamp, seaRamp, opt) {
  const c = can(640, 360), x = cx2(c);
  // ---- sky: posterized bands with a little ordered break-up.  the ramp
  // position only depends on the row, so it is computed once per row.
  {
    const b = pixBuf(640, HZ), cols = skyRamp.map(hexToRgb), n = cols.length;
    for (let y = 0; y < HZ; y++) {
      const base = Math.pow(y / (HZ - 1), opt.skyPow || 0.72) * (n - 1);
      for (let px = 0; px < 640; px++) {
        let fi = base + (hash2(px >> 3, y >> 1) - 0.5) * 0.09 * (n - 1);
        if (opt.ember) fi += opt.ember * (n - 1) * Math.pow(1 - px / 640, 1.4) * Math.pow(y / HZ, 2.0);
        if (fi < 0) fi = 0; else if (fi > n - 1) fi = n - 1;
        let i = Math.floor(fi);
        if (bay(px, y) < fi - i) i++;
        if (i > n - 1) i = n - 1;
        pset(b, cols[i], px, y);
      }
    }
    x.drawImage(pixTo(b), 0, 0);
  }
  // stars, punched in before the clouds so cloud slabs occlude them
  if (opt.stars) {
    for (let i = 0; i < opt.stars; i++) {
      const sx = R(hash2(i, 3) * 640), sy = R(hash2(i, 11) * (HZ - 64));
      const b = hash2(i, 19);
      P(x, b > 0.88 ? '#e8f0ff' : b > 0.62 ? '#9fb6e0' : '#6a7fb0', sx, sy, 1, 1);
      if (b > 0.94) { P(x, '#7a90c0', sx - 1, sy, 1, 1); P(x, '#7a90c0', sx + 1, sy, 1, 1); }
    }
  }
  // cloud slabs, flat and hard-edged.  Each one is lit underneath by whatever
  // is burning on the horizon and cold on top, in three posterized steps.
  const n_ = skyRamp.length;
  for (let i = 0; i < 8; i++) {
    const cy = 30 + i * 18 + (i & 1) * 6, cw = 46 + ((i * 53) % 110);
    const cx0 = ((i * 151) % 660) - 30;
    const deep = Math.min(n_ - 1, Math.round(Math.pow(cy / HZ, opt.skyPow || 0.72) * (n_ - 1)));
    const lit = mixHex(skyRamp[Math.min(n_ - 1, deep + 2)], opt.cloudLit || skyRamp[n_ - 1], 0.4);
    const mid = mixHex(skyRamp[Math.max(0, deep - 2)], BP.ink, 0.06);
    const dark = mixHex(skyRamp[Math.max(0, deep - 4)], BP.ink, 0.14);
    const rows = 3 + (i & 1);
    let w0 = 0, sx0 = 0;
    for (let r = 0; r < rows; r++) {
      const w = R(cw * (1 - r * 0.20)), sx = cx0 + R(r * 7 + (hash2(i, r) - 0.5) * 16);
      if (r === 0) { w0 = w; sx0 = sx; }
      P(x, r === 0 ? mid : r === rows - 1 ? dark : mixHex(mid, dark, 0.5), sx, cy - r * 2, w, 2);
    }
    // the hot lip underneath, where the low sun is still reaching it
    for (let px = 0; px < w0; px++) {
      const f = Math.sin((px / w0) * Math.PI);
      if (bay(sx0 + px, cy) > f * 0.7) continue;
      P(x, opt.cloudLip || lit, sx0 + px, cy + 2, 1, 1);
      if (bay(sx0 + px, cy + 1) < f * 0.3) P(x, lit, sx0 + px, cy + 1, 1, 1);
    }
  }
  if (opt.sun) {
    disc(x, opt.sun[0], opt.sun[1], opt.sun[2], opt.sun[3]);
    disc(x, opt.sun[0], opt.sun[1], opt.sun[2] - 3, opt.sun[4]);
  }
  // ---- the sea, in ONE pixel pass: ramp, chop and the road under the sun.
  // as fillRect-per-dash this alone was most of the bake budget.
  x.drawImage(seaLayer(seaRamp, opt), 0, HZ);
  // ---- the village on its pier, standing in the water
  drawVillage(x, HZ - 16, BP.vill, opt.rim || BP.villR, opt.wrecked);
  drawFarBoat(x, 300, HZ - 4, BP.vill, opt.rim || BP.villR, opt.wrecked);
  drawFarBoat(x, 470, HZ - 2, BP.vill, opt.rim || BP.villR, opt.wrecked);
  // ---- the light the village makes.  Baked: the flicker on top of it is a
  // handful of pixels per frame, this is the part that costs anything.
  if (opt.torchPools) {
    for (let i = 0; i < TORCH.length; i++) {
      const tx = TORCH[i][0], ty = TORCH[i][1] - 4;
      glowPool(x, tx, ty, 12, 9, BP.torchGlow, 0.55);
      glowPool(x, tx, ty, 5, 4, BP.fire, 0.95);
    }
    // the deck underside catches it, and the stilts stand in a warm haze
    for (let px = -2; px < 212; px++) {
      if (bay(px, HZ - 11) > 0.40) continue;
      P(x, BP.torchGlow[3], px, HZ - 12, 1, 1);
    }
  }
  if (opt.emberPools) {
    for (const g of opt.emberPools) glowPool(x, g[0], g[1], g[2], g[3], BP.emberGlow, 0.85);
  }
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
  const ramp = ['#0a0e16', '#131a26', '#1e2b3c', '#2d3f56', '#435a76'];
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
  // countershading: pale underneath, filling in rather than speckling
  for (let y = 33; y < H - 1; y++) for (let px = 16; px < 132; px++) {
    const i = y * W + px; if (f[i] <= 0.04) continue;
    if (f[i + W] <= 0.04 || bay(px, y) < (y - 33) / 11) P(x, '#6d8093', px, y, 1, 1);
  }
  for (let y = 38; y < H - 1; y++) for (let px = 20; px < 128; px++) {
    const i = y * W + px; if (f[i] <= 0.04) continue;
    if (bay(px, y) < (y - 38) / 5) P(x, '#8fa2b5', px, y, 1, 1);
  }
  // gill slits
  for (let g = 0; g < 5; g++) {
    const gx = 110 - g * 4;
    for (let y = 20; y <= 32; y++) { const i = y * W + gx; if (f[i] > 0.22) P(x, '#101822', gx, y, 1, 1); }
  }
  // scars along the back
  for (let i = 0; i < 5; i++) P(x, '#93a8bd', 66 + i * 3, 15 + i, 1, 1);
  for (let i = 0; i < 4; i++) P(x, '#93a8bd', 44 + i * 2, 34 - i, 1, 1);
  // the jaws, hanging open — this is the shot the whole beat is for.
  // the lower jaw drops clear of the body; the cavity stays inside it.
  triOutlined(x, ramp[1], BP.ink, [108, 33], [136, 29], [117, 48]);
  tri(x, '#25080e', 110, 31, 134, 28, 118, 44);
  for (let y = 24; y <= 34; y++) for (let px = 100; px < 136; px++) {
    const i = y * W + px; if (f[i] <= 0.02) continue;
    if (y > 27 + (px - 100) * 0.04 && y < 30 + (px - 100) * 0.30) P(x, '#25080e', px, y, 1, 1);
  }
  for (let i = 0; i < 8; i++) {                       // upper teeth, pointing down
    const tx = 110 + i * 3, ty = 28 + R(i * 0.12);
    tri(x, BP.bone, tx, ty, tx + 2, ty, tx + 1, ty + 4);
  }
  for (let i = 0; i < 7; i++) {                       // lower teeth, pointing up
    const tx = 112 + i * 3, ty = 41 - R(i * 1.7);
    tri(x, BP.bone, tx, ty, tx + 2, ty, tx + 1, ty - 4);
  }
  // eye: black, wet, with a red spark in it
  P(x, BP.ink, 108, 20, 6, 6); P(x, '#2a0d12', 109, 21, 4, 4); P(x, '#ff3a2a', 110, 22, 2, 2);
  P(x, BP.white, 110, 21, 2, 1);
  return spr(c, 70, 28);
}
// a short piece of the same animal — the back and dorsal, for the close-up
function buildSharkBack() {
  const W = 160, H = 54, c = can(W, H), x = cx2(c);
  const top = new Int16Array(W);
  for (let px = 0; px < W; px++) {
    const u = px / (W - 1);
    const ty = 46 - R(Math.sin(Math.pow(u, 0.75) * Math.PI) * 24);
    top[px] = ty;
    P(x, '#151e2b', px, ty, 1, H - ty);
    P(x, '#243347', px, ty, 1, 3);
    P(x, '#3a5070', px, ty, 1, 1);
    for (let y = H - 14; y < H; y++) if (bay(px, y) < (y - (H - 14)) / 11) P(x, '#33455a', px, y, 1, 1);
  }
  // the dorsal, swept back, standing well clear of the crest
  triOutlined(x, '#243347', BP.ink, [86, top[86] + 4], [44, top[44] + 4], [52, 0]);
  triOutlined(x, '#141d29', BP.ink, [86, top[86] + 4], [52, 0], [66, top[66] + 2]);
  for (let i = 0; i < 26; i++) P(x, '#3f5776', 53 + i * 1.3 | 0, 1 + i, 1, 1);
  // gill slits, forward
  for (let g = 0; g < 4; g++) {
    const gx = 138 - g * 6;
    for (let y = top[gx] + 3; y < top[gx] + 16 && y < H; y++) P(x, '#0b1119', gx, y, 1, 1);
  }
  for (let i = 0; i < 6; i++) P(x, '#5f738c', 96 + i * 5, top[96 + i * 5] + 4 + i, 2, 1);
  // foam breaking along the waterline at the bottom
  for (let px = 0; px < W; px++) for (let y = H - 10; y < H; y++) {
    if (hash2(px * 5 + y, y * 3) > 0.30 + (y - (H - 10)) / 13) continue;
    P(x, BP.foam[(px + y) & 1 ? 3 : 2], px, y, 1, 1);
  }
  // water sliding back off the crest
  for (let px = 20; px < W - 20; px += 3) {
    if (hash2(px, 17) > 0.4) continue;
    P(x, BP.foam[2], px, top[px] + 2, 1, 3 + R(hash2(px, 31) * 7));
  }
  return spr(c, W / 2, H);
}

// ---- the Village Chief, side on ----------------------------------------
function buildChiefSide() {
  const c = can(30, 54), x = cx2(c);
  x.translate(0, 14);                 // leave room over his head for the crown
  const SK = '#d9a06a', SKD = '#a9713f', SKX = '#7a4a22';
  const LEA = '#6d4527', LEAD = '#472c17';
  // far leg, gripping the flank
  cap(x, SKX, 12, 27, 6, 36, 4);
  P(x, SKX, 4, 35, 6, 3);
  // near leg
  cap(x, SK, 15, 27, 20, 36, 5);
  P(x, SKD, 17, 35, 7, 3);
  // loincloth with a bone fringe
  P(x, LEAD, 8, 22, 13, 7); P(x, LEA, 8, 22, 13, 2);
  for (let i = 0; i < 6; i++) P(x, BP.bone, 9 + i * 2, 28, 1, 4);
  // torso: long, bare, painted
  P(x, SK, 9, 12, 12, 11);
  P(x, SKD, 9, 12, 2, 11);
  P(x, SKD, 9, 21, 12, 2);
  P(x, BP.red, 10, 15, 10, 1); P(x, BP.red, 11, 18, 8, 1);
  for (let i = 0; i < 6; i++) P(x, BP.bone, 10 + i * 2, 12 + (i & 1), 1, 2);
  cap(x, LEAD, 10, 13, 20, 20, 2);                             // harness
  // far arm, down on the fin
  cap(x, SKX, 10, 15, 4, 23, 3);
  // near arm, out and up: the spear hand, clear of his chest
  cap(x, SK, 18, 14, 25, 4, 3);
  P(x, BP.goldD, 24, 3, 3, 3);
  // head
  P(x, SK, 9, 3, 11, 10);
  P(x, SKX, 9, 3, 2, 10);
  P(x, SKD, 9, 11, 11, 2);
  P(x, BP.red, 9, 5, 11, 3);                                   // the band over the eyes
  P(x, BP.bone, 12, 6, 3, 2); P(x, BP.bone, 16, 6, 3, 2);
  P(x, BP.ink, 13, 6, 2, 2); P(x, BP.ink, 17, 6, 2, 2);
  P(x, BP.bone, 13, 11, 6, 1);                                 // bared teeth
  // headdress: band + a fan of feathers
  P(x, LEAD, 8, 1, 13, 3); P(x, BP.goldD, 8, 2, 13, 1);
  const FE = ['#c4202c', '#e8d3ae', '#e8515a', '#e8d3ae', '#c4202c'];
  for (let i = 0; i < 5; i++) {
    const bx = 9 + i * 2, hgt = 9 + (i === 2 ? 5 : (i === 1 || i === 3) ? 2 : 0);
    LN(x, FE[i], bx, 2, bx + (i - 2) * 3, 2 - hgt, 2);
    P(x, BP.bone, bx + (i - 2) * 3, 1 - hgt, 1, 2);
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  return spr(outlineIt(c, BP.ink), 15, 52);
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
    ? ['#0b262e', '#13434e', '#1d6875', '#3390a0', '#5fbcc8']
    : ['#2a2730', '#3d3947', '#585462', '#726e7c', '#8f8b98'];
  const body = shadeBlob(W, H, f, ramp, { outline: ghost ? '#07202a' : BP.ink, smooth: 3, lift: 0.18 });
  const c = can(W, H), x = cx2(c);
  x.drawImage(body.c, 0, 0);
  // pale belly
  for (let y = 34; y < H - 1; y++) for (let px = 20; px < 146; px++) {
    const i = y * W + px; if (f[i] <= 0.04) continue;
    if (f[i + W] <= 0.04 || bay(px, y) < (y - 34) / 18) P(x, ghost ? '#8ed6dd' : '#9fadbd', px, y, 1, 1);
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
  P(x, ghost ? '#07202a' : BP.ink, 132, 24, 4, 4); P(x, ghost ? '#0d3038' : '#241a12', 133, 25, 2, 2);
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
  const w = rx * 2 + 5, h = ry * 2 + 5, b = pixBuf(w, h), C = hexToRgb(col);
  const cx0 = rx + 2, cy0 = ry + 2, riy = Math.max(1, ry - th * 0.6), ri = Math.max(0, rx - th);
  for (let y = -ry; y <= ry; y++) {
    const q = 1 - (y / ry) * (y / ry); if (q <= 0) continue;
    const hw = Math.floor(rx * Math.sqrt(q));
    const q2 = 1 - (y / riy) * (y / riy);
    const lo = q2 > 0 ? Math.floor(ri * Math.sqrt(q2)) : 0;
    for (let sg = -1; sg <= 1; sg += 2) for (let d = lo; d <= hw; d++) {
      const px = cx0 + sg * d, py = cy0 + y;
      if (bay(px, py) * 0.55 + hash2(px >> 1, py) * 0.7 > 0.66) continue;
      pset(b, C, px, py);
    }
  }
  return spr(pixTo(b), cx0, cy0);
}
function discSprite(rx, ry, col, dens) {
  const w = rx * 2 + 4, h = ry * 2 + 4, b = pixBuf(w, h), C = hexToRgb(col);
  const cx0 = rx + 2, cy0 = ry + 2;
  for (let y = -ry; y <= ry; y++) {
    const q = 1 - (y / ry) * (y / ry); if (q <= 0) continue;
    const hw = Math.floor(rx * Math.sqrt(q));
    for (let d = -hw; d <= hw; d++) {
      const px = cx0 + d, py = cy0 + y;
      const fall = 1 - Math.sqrt((d / rx) * (d / rx) + (y / ry) * (y / ry));
      if (bay(px, py) > dens * (0.3 + fall)) continue;
      pset(b, C, px, py);
    }
  }
  return spr(pixTo(b), cx0, cy0);
}
function buildSpray(w, h, seed) {
  const b = pixBuf(w, h), CO = BP.foam.map(hexToRgb);
  for (let px = 0; px < w; px++) {
    const u = px / (w - 1);
    const top = h - Math.sin(u * Math.PI) * h * (0.62 + 0.38 * hash2(px >> 2, seed));
    for (let y = Math.floor(top); y < h; y++) {
      const dv = (y - top) / Math.max(1, h - top);
      if (hash2(px + seed * 131, y * 3) > 0.22 + dv * 0.72) continue;
      let ci = Math.floor((1 - dv) * CO.length + (bay(px, y) - 0.5) * 1.6);
      if (ci < 0) ci = 0; else if (ci > CO.length - 1) ci = CO.length - 1;
      pset(b, CO[ci], px, y);
    }
  }
  return spr(pixTo(b), w / 2, h);
}
function buildFlame(seed) {
  const b = pixBuf(26, 34), CO = BP.fire.map(hexToRgb);
  for (let y = 0; y < 34; y++) {
    const u = 1 - y / 33;
    const w = R((1 - u * u) * 11 + 1 + (hash2(y, seed) - 0.5) * 4);
    for (let d = -w; d <= w; d++) {
      const px = 13 + d, fall = 1 - Math.abs(d) / (w + 1);
      if (bay(px, y + seed) > 0.25 + fall * 0.7) continue;
      let ci = Math.floor(fall * 3 + (1 - u) * 1.6);
      if (ci < 0) ci = 0; else if (ci > 4) ci = 4;
      pset(b, CO[ci], px, y);
    }
  }
  return spr(pixTo(b), 13, 33);
}
// the dark, near-black frame the Chief is held in for his close-up
function buildCloseBg() {
  const c = can(640, 360), x = cx2(c);
  // cold indigo at the top, the village fire coming up from under the frame
  paintRamp(x, 0, 0, 640, 360,
    ['#06081a', '#0b0c22', '#11102a', '#1a1130', '#271334', '#361634', '#481a30',
     '#5d2029', '#742820', '#8c331c'],
    (u, px, py) => {
      const dx = (px - 320) / 360, dy = (py - 300) / 300;
      return 1 - Math.sqrt(dx * dx * 0.7 + dy * dy) * 1.05;
    });
  // embers riding up out of the burning village behind him, baked flat
  for (let i = 0; i < 150; i++) {
    const ex = R(hash2(i, 7) * 640), ey = R(360 - Math.pow(hash2(i, 23), 2.3) * 300);
    const b = hash2(i, 41);
    P(x, b > 0.86 ? BP.fire[4] : b > 0.52 ? BP.fire[3] : BP.fire[2], ex, ey, 1, 1);
  }
  // a hot band low down, where the water is throwing the fire back at him
  for (let y = 300; y < 360; y++) for (let px = 0; px < 640; px++) {
    const f = (y - 300) / 60;
    if (bay(px, y) > f * 0.5) continue;
    P(x, f > 0.75 ? '#a5411d' : '#6d2a18', px, y, 1, 1);
  }
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
      this.add({ k: 's', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, life: rand(0.3, 0.8), m: 0.8, s: randi(2, 5), c: rand() > 0.55 ? '#05070c' : BP.fire[randi(1, 3)] });
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
      P(ctx, p.c, R(p.x) + ox, R(p.y) + oy, p.s, p.k === 'd' ? p.s + 2 : p.s);
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
      // the torch line, thrown onto the water under each anchor on the pier
      const TGL = [[10, BP.torchGlow, 0.5, 20], [62, BP.torchGlow, 0.5, 20],
                   [104, BP.torchGlow, 0.44, 18], [128, BP.torchGlow, 0.40, 16],
                   [172, BP.torchGlow, 0.44, 18], [202, BP.torchGlow, 0.5, 20]];
      A.bayDusk = buildBay(BP.skyDusk, BP.seaDusk, {
        skyPow: 1.55, sun: [462, 168, 22, '#ffb765', '#fff0c4'], road: '#c8704a', road2: '#f0a765',
        chop: BP.chopDusk, cloudLit: '#ffbe6e', cloudLip: '#ffd58c',
        rim: '#4a2418', torchPools: true, glows: TGL,
      });
      // the fire in the wreck is the only light in the first two, so it gets
      // its own pool on the huts and its own road on the water
      const EMB = [[128, HZ - 22, 30, 22], [150, HZ - 14, 20, 15], [104, HZ - 30, 18, 14]];
      const EGL = [[128, BP.emberGlow, 0.62, 30], [150, BP.emberGlow, 0.46, 18]];
      A.bayNight = [
        buildBay(BP.skyNight, BP.sea, { skyPow: 1.6, ember: 0.30, chop: BP.chopNight, wrecked: true, rim: '#5a1f14',
          stars: 170, cloudLit: '#5c2a30', cloudLip: '#8a3a2c', emberPools: EMB, glows: EGL }),
        buildBay(BP.skyDim, BP.sea, { skyPow: 1.5, ember: 0.26, chop: BP.chopNight, wrecked: true, rim: '#5a2418',
          stars: 120, cloudLit: '#7e4050', cloudLip: '#a8504a', emberPools: EMB, glows: EGL }),
        buildBay(BP.skyDawn, BP.seaDawn, {
          skyPow: 1.45, sun: [112, 182, 19, '#ffc07a', '#fff0cc'], road: '#a85a4e', road2: '#e09a6a',
          chop: BP.chopDawn, cloudLit: '#ffa878', cloudLip: '#ffcb94',
          wrecked: true, rim: '#7a3a28', stars: 40, emberPools: EMB, glows: EGL }),
      ];
      A.closeBg = buildCloseBg();
      A.swell = []; for (let i = 0; i < 7; i++) A.swell.push(buildSwellRow(i, i < 4 ? BP.foam[0] : BP.foam[1]));
      // the swell is lit by whatever is in the sky, so it gets a set each
      A.swellDusk = []; for (let i = 0; i < 7; i++) A.swellDusk.push(buildSwellRow(i, i < 3 ? '#6a4a6a' : i < 5 ? '#a06a66' : '#d08a5e'));
      A.swellNight = []; for (let i = 0; i < 7; i++) A.swellNight.push(buildSwellRow(i, i < 4 ? '#24365e' : '#3c4a74'));
      A.swellDawn = []; for (let i = 0; i < 7; i++) A.swellDawn.push(buildSwellRow(i, i < 3 ? '#3c4a7c' : i < 5 ? '#7a5278' : '#b86c60'));
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
      // ---- lit copies.  Every figure that stands in front of a coloured sky
      // gets that sky's colour on its edge, baked in, so nothing is a flat
      // black cut-out.  Two sets: the sun behind him at dusk, the burning
      // village off to the left at night.
      A.sharkDusk = spr(rimLight(bounceLight(cloneSpr(A.shark), '#7a4a3c', 3, 0.7),
                                 1, -1, '#ffbe72', '#c06a36', 2), A.shark.ax, A.shark.ay);
      A.chiefDusk = spr(rimLight(cloneSpr(A.chief), 1, -1, '#ffd08a', '#c4763a', 2), A.chief.ax, A.chief.ay);
      A.spearDusk = spr(rimLight(cloneSpr(A.spear), 1, -1, '#ffd08a', '#c4763a', 1), A.spear.ax, A.spear.ay);
      A.finDusk = null;                        // filled below, once A.fin exists
      A.sharkBackLit = spr(rimLight(cloneSpr(A.sharkBack), 0, -1, '#ff9a4a', '#a8471f', 2),
                           A.sharkBack.ax, A.sharkBack.ay);
      A.chiefClose = spr(rimLight(rimLight(cloneSpr(A.chief), -1, 0, '#ff8a3a', '#a84a1e', 2),
                                  1, 0, '#5d7bc4', '#2b3a6a', 1), A.chief.ax, A.chief.ay);
      A.spearClose = spr(rimLight(cloneSpr(A.spear), -1, 0, '#ff8a3a', '#a84a1e', 1), A.spear.ax, A.spear.ay);
      // night: the fire is off to the left, the dawn sky is cold on the right
      A.sharkNight = spr(rimLight(rimLight(cloneSpr(A.shark), -1, 0, '#e8622a', '#8c3316', 2),
                                  1, -1, '#4a6aa8', null, 1), A.shark.ax, A.shark.ay);
      A.chiefNight = spr(rimLight(cloneSpr(A.chief), -1, 0, '#e8622a', '#8c3316', 2), A.chief.ax, A.chief.ay);
      A.manNight = spr(rimLight(rimLight(rimLight(bounceLight(cloneSpr(A.man), '#3a5a7a', 3, 0.7),
                                                  1, 0, '#ff8a3a', '#a84a1e', 2),
                                         0, -1, '#8a6a9a', null, 1),
                                -1, -1, '#6a86c8', null, 1), A.man.ax, A.man.ay);
      A.ottNight = spr(rimLight(cloneSpr(A.ott), 1, 0, '#ffa84a', '#b05a20', 2), A.ott.ax, A.ott.ay);
      A.hatNight = spr(rimLight(cloneSpr(A.hat), -1, 0, '#ffa84a', null, 1), A.hat.ax, A.hat.ay);
      A.rifleNight = spr(rimLight(cloneSpr(A.rifle), 1, 0, '#ffa84a', null, 1), A.rifle.ax, A.rifle.ay);
      A.fin = (function () {
        const c = can(26, 22), x = cx2(c);
        triOutlined(x, '#253448', BP.ink, [24, 21], [2, 21], [8, 0]);
        P(x, '#516787', 8, 2, 2, 12);
        return spr(outlineIt(c, BP.ink), 13, 21);
      })();
      A.spearNight = spr(rimLight(cloneSpr(A.spear), -1, 0, '#e8622a', '#8c3316', 1), A.spear.ax, A.spear.ay);
      A.finDusk = spr(rimLight(cloneSpr(A.fin), 1, -1, '#ffbe72', '#c06a36', 2), A.fin.ax, A.fin.ay);
      A.shadow = discSprite(104, 22, '#020509', 1.5);
      A.ring = []; for (let i = 0; i < 8; i++) A.ring.push(ringSprite(26 + i * 20, 7 + i * 5, 3 + i, BP.foam[Math.min(3, 3 - (i >> 2))]));
      A.mRing = []; for (let i = 0; i < 8; i++) A.mRing.push(ringSprite(26 + i * 18, 12 + i * 8, 4 + i * 2, BP.foam[Math.min(4, 4 - (i >> 1))]));
      A.spray = []; for (let i = 0; i < 4; i++) A.spray.push(buildSpray(300, 170, i + 1));
      A.sprayS = []; for (let i = 0; i < 4; i++) A.sprayS.push(buildSpray(120, 70, i + 5));
      // water thrown up in front of a sunset is not white
      A.sprayDusk = A.spray.map(o => spr(tintCanvas(cloneSpr(o), '#ffb877', 0.30), o.ax, o.ay));
      A.spraySDusk = A.sprayS.map(o => spr(tintCanvas(cloneSpr(o), '#ffb877', 0.26), o.ax, o.ay));
      A.sprayNight = A.spray.map(o => spr(tintCanvas(cloneSpr(o), '#5d7bc4', 0.34), o.ax, o.ay));
      A.ringWarm = null;
      A.flame = []; for (let i = 0; i < 4; i++) A.flame.push(buildFlame(i));
      A.mini = buildMiniShade();
      A.miniWhite = tintSprite(A.mini, '#ffffff', 1);
      A.miniCyan = spr(rimLight(cloneSpr(A.mini), 1, -1, '#34b4c4', '#145060', 2), A.mini.ax, A.mini.ay);
      A.miniHot = spr(rimLight(cloneSpr(A.mini), 1, -1, '#ff8a6a', '#8c1a1c', 2), A.mini.ax, A.mini.ay);
      A.ringCyan = A.mRing.map(o => spr(tintCanvas(cloneSpr(o), '#34b4c4', 0.8), o.ax, o.ay));
      A.ringRed = A.mRing.map(o => spr(tintCanvas(cloneSpr(o), '#ff7a4a', 0.88), o.ax, o.ay));
      A.buf = can(640, 360); A.bufCtx = cx2(A.buf);
      // the half-tone the minis darken the bay with, baked once: doing this
      // as 57k fillRects per frame cost 30ms a frame before it was baked
      A.dither = can(640, 360);
      { const dx = cx2(A.dither);
        dx.fillStyle = '#04080f'; dx.fillRect(0, 0, 640, 360);
        dx.fillStyle = '#000205';
        for (let y = 0; y < 360; y += 2) for (let x = (y >> 1) & 1; x < 640; x += 2) dx.fillRect(x, y, 1, 1); }
      // the two minis each get their own colour of dark to sit in
      A.ditherCyan = can(640, 360);
      { const dx = cx2(A.ditherCyan);
        dx.fillStyle = '#04141a'; dx.fillRect(0, 0, 640, 360);
        dx.fillStyle = '#01080c';
        for (let y = 0; y < 360; y += 2) for (let x = (y >> 1) & 1; x < 640; x += 2) dx.fillRect(x, y, 1, 1);
        for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
          const f = 1 - Math.sqrt(Math.pow((x - 320) / 400, 2) + Math.pow((y - 200) / 260, 2));
          if (f > 0 && bay(x, y) < f * 0.30) dx.fillRect(x, y, 1, 1);
        } }
      { const dx = cx2(A.ditherCyan); dx.fillStyle = '#0a2e38';
        for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
          const f = 1 - Math.sqrt(Math.pow((x - 320) / 300, 2) + Math.pow((y - 210) / 190, 2));
          if (f > 0 && bay(x + 1, y + 2) < f * 0.42) dx.fillRect(x, y, 1, 1);
        } }
      A.ditherRed = can(640, 360);
      { const dx = cx2(A.ditherRed);
        dx.fillStyle = '#2a090c'; dx.fillRect(0, 0, 640, 360);
        dx.fillStyle = '#0d0205';
        for (let y = 0; y < 360; y += 2) for (let x = (y >> 1) & 1; x < 640; x += 2) dx.fillRect(x, y, 1, 1);
        dx.fillStyle = '#5c1014';
        for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
          const f = 1 - Math.sqrt(Math.pow((x - 320) / 320, 2) + Math.pow((y - 200) / 200, 2));
          if (f > 0 && bay(x + 2, y + 1) < f * 0.48) dx.fillRect(x, y, 1, 1);
        }
        dx.fillStyle = '#8c1a1c';
        for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
          const f = 1 - Math.sqrt(Math.pow((x - 320) / 190, 2) + Math.pow((y - 210) / 120, 2));
          if (f > 0 && bay(x + 3, y + 2) < f * 0.34) dx.fillRect(x, y, 1, 1);
        } }
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
      this._shk = { x: 356, y: 218, rot: -0.34 };
      this._chf = { x: 356, y: 206, rot: 0.2 };
      this._man = { x: 448, y: 372, rot: 0 };
      this._ott = { x: 462, y: 342, arm: 0, hat: 0 };
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
      if (T > KX.crack && T < KX.crack + 0.06) FX.shard(this.anchored ? this.ax : 320, this.anchored ? this.ay : 214, 16);
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
      // he is still a shadow under the swell, coming in from the right and
      // closing on the camera, so he grows all the way in
      const k = clamp(T / KI.breach, 0, 1);
      s.x = R(lerp(650, 300, k * k)); s.y = R(lerp(236, 316, k * k)); s.rot = 0;
      if (T > KI.alarm && Math.random() < 16 * dt) FX.drop(s.x + rand(-60, 60), s.y - 10, 1, 0.5, 14);
      this.cue('gong', KI.alarm, () => { Audio_.tone(196, 1.1, 'triangle', 0.22, -70); Audio_.noise(0.7, 0.14, 1100, 120); });
      this.cue('gong2', KI.alarm + 0.55, () => { Audio_.tone(146, 1.2, 'triangle', 0.2, -50); });
    } else if (T < KI.close) {
      // the leap: a parabola out of the near water, nose up on the way
      const k = clamp((T - KI.breach) / (KI.close - KI.breach), 0, 1);
      s.x = R(lerp(292, 392, k));
      s.y = R(330 - Math.sin(k * 2.15) * 196);
      s.rot = lerp(-0.92, -0.16, k);
      if (this.cue('breach', KI.breach, () => { Audio_.roar(); Audio_.splash(3); Audio_.explosion(0.8); })) {
        this.shake = 10; this.flash = 0.7;
        FX.drop(292, 326, 54, 1.9, 44);
      }
      if (Math.random() < 50 * dt) FX.drop(s.x + rand(-70, 50), s.y + rand(-16, 30), 1, 0.4, 8);
    } else if (T < KI.down) {
      // the close-up. he breathes, the spear comes up, then he speaks
      this.cue('card', KI.close, () => { Audio_.tone(74, 0.7, 'sawtooth', 0.26, -20); Audio_.noise(0.35, 0.2, 500, 60); });
      this.cue('card2', KI.close + 0.14, () => Audio_.tone(52, 0.9, 'square', 0.18, -14));
      this.cue('say', KI.line, () => Audio_.tone(104, 0.5, 'sawtooth', 0.16, -34));
      if (Math.random() < 16 * dt) FX.drop(rand(180, 460), rand(40, 150), 1, -0.25, 4);
    } else {
      // and down he comes
      const k = clamp((T - KI.down) / 0.42, 0, 1);
      s.x = 398; s.y = R(lerp(96, 330, k * k)); s.rot = lerp(0.5, 1.2, k);
      if (this.cue('crash', KI.down + 0.38, () => { Audio_.explosion(1.5); Audio_.splash(3); })) {
        this.shake = 13; this.flash = 0.85;
        FX.drop(398, 326, 70, 2.0, 60);
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
      // she rolled him over: the animal is belly-up and settling
      const k = clamp(T / KD.slip, 0, 1);
      s.rot = lerp(-0.34, 0.16, k); s.y = 218 + R(k * 8);
      c.rot = lerp(0.2, 0.9, k); c.y = 206 + R(k * 8); c.x = 356 + R(k * 8);
      if (Math.random() < 10 * dt) FX.bub(s.x + rand(-50, 50), s.y + rand(-6, 10), 1);
    } else if (T < KD.rise) {
      const k = clamp((T - KD.slip) / (KD.rise - KD.slip), 0, 1);
      s.rot = 0.16 + k * 0.26; s.y = 226 + R(k * 58);
      c.rot = 0.9 + k * 1.5; c.y = 214 + R(k * 66); c.x = 364 + R(k * 10);
      if (this.cue('under', KD.slip, () => { Audio_.splash(1.6); Audio_.tone(58, 0.8, 'sine', 0.22, -20); })) FX.bub(356, 230, 14);
      if (Math.random() < 14 * dt) FX.bub(356 + rand(-26, 26), 232 + rand(0, 14), 1);
    } else {
      // they keep going down while she comes up
      s.y += 46 * dt; s.rot += 0.2 * dt;
      c.y += 40 * dt; c.rot += 0.9 * dt;
      const k = clamp((T - KD.rise) / 1.05, 0, 1);
      const e = k * k * (3 - 2 * k);
      m.y = R(lerp(372, 292, e)); m.x = 448;
      o.y = m.y - 19; o.x = 462;
      if (this.cue('rise', KD.rise, () => { Audio_.splash(2.6); Audio_.tone(150, 0.6, 'sine', 0.18, 90); })) {
        FX.drop(448, 318, 40, 1.5, 58);
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
    // only ever the newest live line: two typed lines on one row is a mess
    let pick = -1;
    for (let i = 0; i < lines.length; i++) {
      if (T >= lines[i][0] && T <= lines[i][0] + lines[i][1] + 0.6) pick = i;
    }
    if (pick >= 0) {
      const at = lines[pick][0], dur = lines[pick][1], s = lines[pick][2];
      const prog = T - at;
      const n = Math.max(0, Math.min(s.length, Math.floor(prog * 36)));
      const shown = s.slice(0, n);
      ctx.globalAlpha = T > at + dur ? qa(1 - (T - at - dur) / 0.6) : 1;
      pixelTextOutlined(ctx, shown, 320, 344, 8, '#e8eef4', '#000000', 'center');
      if (n < s.length && (Math.floor(prog * 8) & 1)) P(ctx, '#e8eef4', 320 + R(textWidth(shown, 8) / 2) + 2, 345, 4, 7);
      ctx.globalAlpha = 1;
    }
  },
  swell(ctx, T, set) {
    set = set || A.swell;
    for (let i = 0; i < 7; i++) {
      const u = i / 6;
      const y = R(HZ + 4 + Math.pow(u, 1.7) * (360 - HZ - 22) + Math.sin(T * 0.7 + i * 1.6) * 1.5);
      const off = R(T * (7 + u * 26)) % 640;
      ctx.drawImage(set[i], -off, y);
      ctx.drawImage(set[i], 640 - off, y);
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
    this.swell(ctx, T, A.swellDusk);
    const s = this._shk;
    if (T < KI.breach) {
      // the water goes wrong: a shadow, then the fin, then the hump — all of
      // it in the near water, close enough to be a problem
      const k = clamp(T / KI.breach, 0, 1);
      ctx.globalAlpha = qa(0.45 + k * 0.5);
      ctx.drawImage(A.shadow.c, s.x - A.shadow.ax, s.y - A.shadow.ay);
      ctx.globalAlpha = 1;
      if (T > KI.alarm) {
        const fk = clamp((T - KI.alarm) / (KI.breach - KI.alarm), 0, 1);
        const fy = R(s.y - 14 - fk * 6), fn = A.finDusk;
        // the wake dragging behind it
        for (let i = 0; i < 24; i++) {
          if (hash2(i, 5) < 0.3) continue;
          const dx = 44 + i * 10, a = 1 - i / 24;
          P(ctx, a > 0.5 ? '#ffd7a0' : '#8a5a5e', s.x + dx, fy + 10 + R(i * 0.8), 4, 1);
          P(ctx, a > 0.5 ? '#e0a070' : '#5a4258', s.x + dx, fy + 10 - R(i * 0.8), 4, 1);
        }
        // the surface humps up over his back
        for (let dx = -86; dx <= 86; dx++) {
          const hgt = R(Math.cos(dx / 86 * 1.5) * 12 * fk);
          if (hgt <= 0) continue;
          P(ctx, '#33395e', s.x + dx, s.y - 6 - hgt, 1, hgt);
          if (bay(s.x + dx, s.y) < 0.34) P(ctx, '#a2707a', s.x + dx, s.y - 7 - hgt, 1, 2);
        }
        ctx.drawImage(fn.c, 0, 0, fn.w, fn.h, R(s.x + 18) - fn.ax * 2, fy - fn.ay * 2, fn.w * 2, fn.h * 2);
      }
      // the village lights up and empties onto the pier
      this.drawAlarm(ctx, T, t);
    } else {
      this.drawAlarm(ctx, T, t);
      // the launch column of water he came through
      const bk = clamp((T - KI.breach) / 0.6, 0, 1);
      const rk = clamp((T - KI.breach) / 0.9, 0, 1);
      if (rk < 1) {
        const rg = A.ring[Math.min(7, Math.floor(rk * 8))];
        ctx.drawImage(rg.c, 292 - rg.ax, 326 - rg.ay);
      }
      if (bk < 1) {
        const fr = A.sprayDusk[Math.min(3, Math.floor(bk * 4))];
        ctx.drawImage(fr.c, 292 - fr.ax, 332 - fr.h + R(bk * 40));
      }
      // the animal itself, and the man on its back, at twice the size
      this.drawRider(ctx, s, 2, true);
      if (T >= KI.down) {
        const dk = clamp((T - KI.down - 0.30) / 0.55, 0, 1);
        if (dk > 0) {
          const fr = A.sprayDusk[Math.min(3, Math.floor(dk * 4))];
          ctx.drawImage(fr.c, 398 - fr.ax, 336 - fr.h);
          const fr2 = A.sprayDusk[Math.min(3, 3 - Math.floor(dk * 3))];
          ctx.save(); ctx.scale(-1, 1);
          ctx.drawImage(fr2.c, -(398 + fr2.ax), 340 - fr2.h);
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
      pixelTextOutlined(ctx, 'FISHER VILLAGE', 320, 34, 7, '#ffc78c', '#2a0e12', 'center');
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
    // villagers turning out along the pier.  the huts behind them are the
    // same near-black, so they carry their own torchlight to read against it.
    const run = clamp((T - KI.alarm - 0.2) / 0.9, 0, 1);
    for (let i = 0; i < 5; i++) {
      const fx = R(lerp(48 + i * 15, 138 + i * 15, run));
      const fy = HZ - 17;
      const bob = (Math.floor(t * 9 + i * 2) & 1) && run < 1 ? 1 : 0;
      P(ctx, BP.ink, fx - 1, fy - 11 - bob, 5, 10);        // a dark gap around him
      P(ctx, '#47372c', fx, fy - 10 - bob, 3, 4);          // head + shoulders
      P(ctx, '#6b5136', fx, fy - 10 - bob, 3, 1);
      P(ctx, '#3a2c24', fx, fy - 6 - bob, 3, 4);           // body
      P(ctx, BP.ink, fx, fy - 2, 1, 2);
      P(ctx, BP.ink, fx + 2, fy - 2, 1, 2);
      if (i & 1) {                                         // a torch, held up
        const f = Math.floor(t * 13 + i) % 3;
        P(ctx, '#3a2c24', fx + 4, fy - 12, 1, 5);
        P(ctx, BP.fire[2], fx + 4, fy - 15, 1, 3);
        P(ctx, BP.fire[3], fx + 4, fy - 16 - f, 1, 2);
        P(ctx, BP.fire[4], fx + 4, fy - 15, 1, 1);
      } else if (run >= 1) P(ctx, '#47372c', fx + 3, fy - 12, 3, 1);   // an arm, pointing
    }
  },
  drawRider(ctx, s, sc, lit) {
    sc = sc || 1;
    const SH = lit ? A.sharkDusk : A.shark, CF = lit ? A.chiefDusk : A.chief, SP = lit ? A.spearDusk : A.spear;
    ctx.save();
    ctx.translate(R(s.x), R(s.y));
    ctx.rotate(s.rot);
    ctx.scale(sc, sc);                       // integer scale: still pixel-exact
    ctx.drawImage(SH.c, -SH.ax, -SH.ay);
    // he sits just behind the dorsal, standing up against the arc
    ctx.translate(-14, -14);
    ctx.rotate(-s.rot * 0.8);
    ctx.drawImage(CF.c, -CF.ax, -CF.ay);
    ctx.save();
    ctx.translate(11, -34); ctx.rotate(-1.0);
    ctx.drawImage(SP.c, -SP.ax, -SP.ay);
    ctx.restore();
    ctx.restore();
  },
  // ---- CHIEF: the close-up ------------------------------------------------
  drawIntroClose(ctx, T, t) {
    ctx.drawImage(A.closeBg, 0, 0);
    const k = clamp((T - KI.close) / 0.35, 0, 1);
    const bob = R(Math.sin(t * 2.2) * 2);
    // the animal's back under him, at 3x, running off both sides of the frame
    const sb = A.sharkBackLit;
    ctx.drawImage(sb.c, 0, 0, sb.w, sb.h, 320 - sb.ax * 3, 366 + bob - sb.ay * 3, sb.w * 3, sb.h * 3);
    // water still sheeting off them
    const sk = clamp((T - KI.close) / 0.7, 0, 1);
    if (sk < 1) {
      const fr = A.spraySDusk[Math.min(3, Math.floor(sk * 4))];
      ctx.drawImage(fr.c, 0, 0, fr.w, fr.h, 320 - fr.ax * 2, 340 + R(sk * 52) - fr.h * 2, fr.w * 2, fr.h * 2);
    }
    // him: a warm rim behind, then the man
    const ch = A.chiefClose, cy = 268 + bob;
    ctx.globalAlpha = qa(0.5 + Math.sin(t * 3) * 0.1);
    ctx.drawImage(A.chiefRim.c, 0, 0, ch.w, ch.h, 320 - ch.ax * 3 - 4, cy - ch.ay * 3 - 3, ch.w * 3, ch.h * 3);
    ctx.globalAlpha = 1;
    ctx.drawImage(ch.c, 0, 0, ch.w, ch.h, 320 - ch.ax * 3, cy - ch.ay * 3, ch.w * 3, ch.h * 3);
    // the spear, well clear of his face, coming up as he rises
    const sp = A.spearClose, lift = clamp((T - KI.close - 0.2) / 0.55, 0, 1);
    ctx.save();
    ctx.translate(320 + 33, cy - 141 - R(lift * 8) + bob);
    ctx.rotate(lerp(-0.5, -1.15, lift));
    ctx.drawImage(sp.c, 0, 0, sp.w, sp.h, -18, -sp.ay * 3, sp.w * 3, sp.h * 3);
    ctx.restore();
    FX.render(ctx, 0, 0);
    this.vignette(ctx);
    this.letterbox(ctx, 1);
    // the name card slams in over his head
    const ck = clamp((T - KI.close) / 0.22, 0, 1);
    const fadeCard = T > KI.line + 0.6 ? clamp(1 - (T - KI.line - 0.6) / 0.4, 0, 1) : 1;
    if (ck > 0 && fadeCard > 0) {
      ctx.globalAlpha = qa(fadeCard);
      const ox = this.slab(ctx, 34, 28, ck, -1, '#000000');
      P(ctx, BP.red, ox, 33, 640, 2);
      P(ctx, '#ff6a3a', ox, 35, 640, 1);
      P(ctx, BP.red, ox, 62, 640, 1);
      pixelTextOutlined(ctx, 'THE VILLAGE CHIEF', 320 + ox, 39, 17, BP.gold, '#14141c', 'center');
      if (ck >= 1) pixelText(ctx, 'HE RIDES THE THING THAT TOOK HER', 320, 68, 7, '#ff9a72', 'center');
      ctx.globalAlpha = 1;
    }
    // and his line
    if (T >= KI.line) {
      const s = '"i put the iron in your mother."';
      const n = Math.min(s.length, Math.floor((T - KI.line) * 30));
      pixelTextOutlined(ctx, s.slice(0, n), 320, 338, 9, '#ffd7a0', '#000000', 'center');
      if (n < s.length && (Math.floor((T - KI.line) * 8) & 1)) P(ctx, '#ffd7a0', 320 + R(textWidth(s.slice(0, n), 9) / 2) + 2, 339, 4, 8);
    }
    if (k < 1) P(ctx, rgbaq('#000000', 1 - k), 0, 0, 640, 360);
  },

  // ---- CHIEF: the defeat --------------------------------------------------
  drawDefeat(ctx, T, t) {
    const bi = T < KD.mother ? 0 : T < KD.mother + 0.9 ? 1 : 2;
    const bg = A.bayNight[bi];
    ctx.drawImage(bg, 0, 0);
    this.swell(ctx, T, bi === 2 ? A.swellDawn : A.swellNight);
    // the wreck of his village, burning down to the waterline
    const fl = A.flame[Math.floor(t * 12) % 4];
    ctx.drawImage(fl.c, 128 - fl.ax, HZ - 2 - fl.ay);
    const fl2 = A.flame[Math.floor(t * 9 + 2) % 4];
    ctx.drawImage(fl2.c, 0, 0, fl2.w, fl2.h, 150 - R(fl2.ax * 0.6), HZ - 2 - R(fl2.h * 0.6), R(fl2.w * 0.6), R(fl2.h * 0.6));

    const s = this._shk, c = this._chf, m = this._man, o = this._ott;
    // ---- what is sinking. drawn whole, then cut off at the waterline by
    //      re-blitting the baked sea over it: no alpha, no soft edges, and
    //      going under actually looks like going under.
    ctx.save();
    ctx.translate(R(s.x), R(s.y)); ctx.rotate(s.rot); ctx.scale(1, -1);
    ctx.drawImage(A.sharkNight.c, -A.sharkNight.ax, -A.sharkNight.ay);
    ctx.restore();
    ctx.save();
    ctx.translate(R(c.x), R(c.y)); ctx.rotate(c.rot);
    ctx.drawImage(A.chiefNight.c, -A.chiefNight.ax, -A.chiefNight.ay);
    ctx.restore();
    if (T > KD.slip && T < KD.rise + 0.8) {
      const k = (T - KD.slip);
      ctx.save();
      ctx.translate(R(344 + k * 18), R(196 + k * k * 78)); ctx.rotate(k * 3.4);
      ctx.drawImage(A.spearNight.c, -A.spearNight.ax, -A.spearNight.ay);
      ctx.restore();
    }
    ctx.drawImage(bg, 0, WLY, 640, 360 - WLY, 0, WLY, 640, 360 - WLY);
    this.swell(ctx, T, bi === 2 ? A.swellDawn : A.swellNight);
    // froth along the cut, so the waterline reads as water and not as a crop
    if (s.y < WLY + 40) {
      const half = R(78 * clamp((WLY + 40 - s.y) / 60, 0, 1));
      for (let dx = -half; dx <= half; dx++) {
        const px = R(s.x) + dx, wob = R(Math.sin((px + T * 26) * 0.3) * 1.5);
        if (bay(px, T * 8) < 0.62) P(ctx, '#4a6a92', px, WLY - 2 + wob, 1, 2);
        if (bay(px + 2, T * 8 + 1) < 0.34) P(ctx, bi === 2 ? '#e8a878' : '#9fc2dc', px, WLY - 3 + wob, 1, 1);
      }
    }
    // the foam still boiling where he went down
    if (T > KD.slip && T < KD.slip + 1.4) {
      const rk = clamp((T - KD.slip) / 1.4, 0, 1);
      const rg = A.ring[Math.min(7, Math.floor(rk * 8))];
      ctx.globalAlpha = qa(1 - rk);
      ctx.drawImage(rg.c, 356 - rg.ax, WLY + 6 - rg.ay);
      ctx.globalAlpha = 1;
    }

    // ---- her mother, drifting past under the surface
    if (T >= KD.mother) {
      const mk = clamp((T - KD.mother) / 2.2, 0, 1);
      const g = A.manGhost;
      const gx = R(lerp(96, 396, mk)), gy = 272 + R(Math.sin(mk * 3.1) * 4);
      ctx.globalAlpha = qa(Math.sin(clamp(mk, 0, 1) * Math.PI) * 0.95);
      ctx.drawImage(g.c, gx - g.ax, gy - g.ay);
      ctx.globalAlpha = 1;
    }

    // ---- her, up in the near water, with him standing on her back
    if (T >= KD.rise) {
      const k = clamp((T - KD.rise) / 1.05, 0, 1);
      if (k < 1) {
        const rg = A.ring[Math.min(7, Math.floor(k * 8))];
        ctx.drawImage(rg.c, 448 - rg.ax, 318 - rg.ay);
      }
      ctx.save();
      ctx.translate(R(m.x), R(m.y));
      ctx.scale(-1, 1);                                    // she faces the village
      ctx.drawImage(A.manNight.c, -A.manNight.ax, -A.manNight.ay);
      ctx.restore();
      if (k < 1) for (let i = 0; i < 14; i++) {
        const dx = -66 + i * 10, hgt = R((1 - k) * 14 * (0.4 + hash2(i, 3)));
        if (hgt <= 0) continue;
        P(ctx, i & 1 ? '#c8e2ef' : '#e8b088', m.x + dx, m.y - 20 - hgt, 1, hgt);
      }
      const oy = R(o.y - Math.sin(t * 2));
      ctx.save();
      ctx.translate(R(o.x), oy);
      ctx.scale(-1, 1);
      ctx.drawImage(A.ottNight.c, -A.ottNight.ax, -A.ottNight.ay);
      const rf = A.rifleNight;                                  // the rifle, at his side
      ctx.save(); ctx.translate(-11, -7); ctx.rotate(lerp(0.9, 1.5, o.arm));
      ctx.drawImage(rf.c, -rf.ax, -rf.ay); ctx.restore();
      ctx.restore();
      // the hat: on his head, then off it, held against his chest
      const h = A.hatNight;
      if (o.hat <= 0) ctx.drawImage(h.c, o.x - h.ax, oy - 26 - h.ay);
      else {
        P(ctx, '#e8904c', o.x - 9, oy - 21, 3, 9);
        P(ctx, BP.ink, o.x - 10, oy - 21, 1, 9);
        const hx = R(lerp(o.x, o.x - 10, o.hat)), hy = R(lerp(oy - 26, oy - 13, o.hat));
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(lerp(0, -1.0, o.hat));
        ctx.drawImage(h.c, -h.ax, -h.ay); ctx.restore();
      }
    }
    FX.render(ctx, 0, 0);
    this.vignette(ctx);
    this.letterbox(ctx, 1);
    this.caption(ctx, LINES_D, T);
    if (T >= KD.ribbon) {
      const ck = clamp((T - KD.ribbon) / 0.25, 0, 1);
      const ox = this.slab(ctx, 40, 28, ck, 1, '#000000');
      P(ctx, BP.goldD, ox, 40, 640, 1);
      P(ctx, BP.goldD, ox, 67, 640, 1);
      pixelTextOutlined(ctx, 'THE VILLAGE CHIEF IS DEAD', 320 + ox, 46, 14, BP.gold, '#14141c', 'center');
      if (ck >= 1) pixelText(ctx, 'THE BOATS WILL NOT FISH HERE AGAIN', 320, 74, 7, '#e8b078', 'center');
    }
  },

  // ---- MINI: the arrival --------------------------------------------------
  drawMiniIntro(ctx, T) {
    // one baked half-tone plate, blitted once: the bay goes properly black
    const dark = clamp(T / 0.16, 0, 1) * (T > KM.out ? clamp(1 - (T - KM.out) / 0.3, 0, 1) : 1);
    ctx.globalAlpha = qa(dark * 0.86); ctx.drawImage(A.ditherCyan, 0, 0); ctx.globalAlpha = 1;
    if (!this.anchored) { this.drawMini(ctx, 320, 214, T); FX.render(ctx, 0, 0); }
    const lb = clamp(T / 0.12, 0, 1) * (T > KM.out ? clamp(1 - (T - KM.out) / 0.28, 0, 1) : 1);
    this.letterbox(ctx, lb * 0.6);
    const ck = clamp((T - KM.card) / 0.16, 0, 1);
    if (ck <= 0) return;
    const out = T > KM.out ? clamp((T - KM.out) / 0.34, 0, 1) : 0;
    const fly = out * out * 760;
    const nameSize = this.fitSize(this.name, 560, 22);
    const topOx = this.slab(ctx, 54, 20, ck, -1, '#051820', -fly);
    P(ctx, BP.miniCyan[2], topOx, 53, 640, 1);
    P(ctx, BP.miniCyan[4], topOx, 72, 640, 2);
    P(ctx, BP.miniCyan[1], topOx, 74, 640, 1);
    pixelText(ctx, 'THE WATER MOVES WRONG', 320 + topOx, 59, 8, BP.miniCyan[5], 'center');
    const botOx = this.slab(ctx, 74, 36, ck, 1, '#071f28', fly);
    pixelTextOutlined(ctx, this.name, 320 + botOx, 82, nameSize, BP.gold, '#062028', 'center');
    P(ctx, BP.miniCyan[4], botOx, 109, 640, 1);
    P(ctx, BP.miniCyan[2], botOx, 110, 640, 1);
  },
  fitSize(s, maxW, start) {
    for (let sz = start; sz > 8; sz -= 2) if (textWidth(s, sz) <= maxW) return sz;
    return 8;
  },
  // the shape itself, rising out of the dark
  drawMini(ctx, cx, cy, T) {
    const k = clamp((T - KM.rise) / 0.55, 0, 1);
    const e = 1 - (1 - k) * (1 - k);
    const y = R(cy + (1 - e) * 44);
    // the shock the water takes when it comes up
    const sk = clamp(T / 0.42, 0, 1);
    if (sk < 1) {
      const fr = A.ringCyan[Math.min(7, Math.floor(sk * 8))];
      ctx.globalAlpha = qa(1 - sk * 0.7);
      ctx.drawImage(fr.c, R(cx) - fr.ax, R(cy) - fr.ay);
      ctx.globalAlpha = 1;
    }
    const ri = Math.min(7, Math.floor(clamp((T - 0.2) / 0.9, 0, 1) * 8));
    const rg = A.ringCyan[ri];
    ctx.globalAlpha = qa(clamp(1 - T / 1.2, 0.12, 1));
    ctx.drawImage(rg.c, R(cx) - rg.ax, R(cy) - rg.ay);
    ctx.globalAlpha = qa(0.4 + e * 0.6);
    ctx.drawImage(A.miniCyan.c, R(cx) - A.miniCyan.ax, y - A.miniCyan.ay);
    ctx.globalAlpha = 1;
    // the eyes come on last
    if (T > 0.34) {
      const f = (Math.floor(T * 22) & 1) || T > 0.55;
      const ex = R(cx) + 44, ey = y;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        P(ctx, f ? BP.red : '#5a0d12', ex, ey + sgn * 8 - 2, 5, 4);
        if (f) P(ctx, '#ffd0a0', ex + 1, ey + sgn * 8 - 1, 2, 2);
      }
    }
  },
  // ---- MINI: the sting ----------------------------------------------------
  drawMiniDefeat(ctx, T) {
    const dark = clamp(T / 0.1, 0, 1) * (T > KX.out ? clamp(1 - (T - KX.out) / 0.3, 0, 1) : 1);
    ctx.globalAlpha = qa(dark * 0.80); ctx.drawImage(A.ditherRed, 0, 0); ctx.globalAlpha = 1;
    if (!this.anchored) { this.drawMiniBreak(ctx, 320, 214, T); FX.render(ctx, 0, 0); }
    const lb = clamp(T / 0.1, 0, 1) * (T > KX.out ? clamp(1 - (T - KX.out) / 0.26, 0, 1) : 1);
    this.letterbox(ctx, lb * 0.55);
    const ck = clamp((T - KX.card) / 0.14, 0, 1);
    if (ck <= 0) return;
    const out = T > KX.out ? clamp((T - KX.out) / 0.34, 0, 1) : 0;
    const drop = R(out * out * 300);
    const nameSize = this.fitSize(this.name, 520, 18);
    const ox = this.slab(ctx, 58 + drop, 58, ck, -1, '#16070a');
    P(ctx, BP.miniRed[3], ox, 58 + drop, 640, 1);
    P(ctx, BP.miniRed[1], ox, 59 + drop, 640, 1);
    P(ctx, BP.miniRed[1], ox, 114 + drop, 640, 1);
    P(ctx, BP.miniRed[3], ox, 115 + drop, 640, 1);
    pixelTextOutlined(ctx, this.name, 320 + ox, 64 + drop, nameSize, '#d8b0a0', '#1a0508', 'center');
    if (T >= KX.stamp) {
      // struck through, and stamped
      const w = Math.min(600, textWidth(this.name, nameSize) + 40);
      for (let i = 0; i < 4; i++) {
        P(ctx, i === 0 || i === 3 ? '#7a0d16' : BP.red, 320 - w / 2 + i * 2, 74 + drop + i, w, 1);
      }
      const sk = clamp((T - KX.stamp) / 0.1, 0, 1);
      ctx.globalAlpha = qa(sk);
      pixelTextOutlined(ctx, 'DOWN', 320, 88 + drop - R((1 - sk) * 6), R(lerp(30, 24, sk)), '#ffb04a', '#5c1010', 'center');
      ctx.globalAlpha = 1;
    }
  },
  drawMiniBreak(ctx, cx, cy, T) {
    const k = clamp(T / KX.crack, 0, 1);
    if (T < KX.crack + 0.5) {
      const gone = clamp((T - KX.crack) / 0.5, 0, 1);
      ctx.globalAlpha = qa((1 - gone) * 0.95);
      const s = T < KX.crack ? A.miniWhite : A.miniHot;
      const jitter = T < KX.crack ? R(rand(-2, 2)) : 0;
      ctx.drawImage(s.c, R(cx) - s.ax + jitter, R(cy) - s.ay, s.w, s.h);
      ctx.globalAlpha = 1;
    }
    if (T >= KX.crack) {
      const rg = A.ringRed[Math.min(7, Math.floor(clamp((T - KX.crack) / 0.7, 0, 1) * 8))];
      ctx.globalAlpha = qa(clamp(1 - (T - KX.crack) / 0.9, 0.1, 1));
      ctx.drawImage(rg.c, R(cx) - rg.ax, R(cy) - rg.ay);
      ctx.globalAlpha = 1;
    }
    if (k < 1) P(ctx, rgbaq('#ffb04a', (1 - k) * 0.5), R(cx) - 90, R(cy) - 48, 180, 96);
  },
};

global.BossCut = BossCut;
})(typeof window !== 'undefined' ? window : this);
