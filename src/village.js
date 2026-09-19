// ============================================================================
//  village.js -- the fishing village on the shore.
//
//  A composable pixel-art kit (support pillars, deck/pier segments, stilt
//  houses, props), procedurally animated villagers, destructible structures
//  that collapse into physics debris, and a self-contained gore system.
//
//  Loaded AFTER pixelart.js and BEFORE game.js.
//  Exposes (on window): Village, Villager, Destructible, Gore, VillageKit
// ============================================================================
(function (global) {
  'use strict';

  // ------------------------------------------------------------- tiny utils
  // G is a top-level `let` in entities.js; it may not exist yet when this file
  // is evaluated, so every access goes through here.
  function gg() { try { return G; } catch (e) { return null; } }

  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x;
  }
  // rect at integer coords
  function R(c, x, y, w, h, col) {
    if (w <= 0 || h <= 0) return;
    c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  // chunky pixel line: square stamps along the segment (never antialiased)
  function pline(c, x0, y0, x1, y1, th, col) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.max(Math.abs(dx), Math.abs(dy));
    const n = Math.max(1, Math.ceil(len / Math.max(1, th * 0.55)));
    const h = th >> 1;
    c.fillStyle = col;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + dx * i / n) - h, y = Math.round(y0 + dy * i / n) - h;
      c.fillRect(x, y, th, th);
    }
  }
  const _shadeCache = new Map();
  function shade(hex, f) {
    const key = hex + '|' + f;
    let v = _shadeCache.get(key); if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    const cl = q => Math.max(0, Math.min(255, Math.round(q)));
    v = '#' + [cl((n >> 16 & 255) * f), cl((n >> 8 & 255) * f), cl((n & 255) * f)]
      .map(q => q.toString(16).padStart(2, '0')).join('');
    _shadeCache.set(key, v); return v;
  }
  function mix(a, b, t) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const cl = q => Math.max(0, Math.min(255, Math.round(q)));
    const r = cl(lerp(x >> 16 & 255, y >> 16 & 255, t)), g = cl(lerp(x >> 8 & 255, y >> 8 & 255, t)), bl = cl(lerp(x & 255, y & 255, t));
    return '#' + [r, g, bl].map(q => q.toString(16).padStart(2, '0')).join('');
  }
  function sprite(c, ox, oy) { const k = c.canvas || c; return { c: k, w: k.width, h: k.height, ox: ox | 0, oy: oy | 0 }; }
  function blit(ctx, s, x, y) { ctx.drawImage(s.c, Math.round(x) + s.ox, Math.round(y) + s.oy); }
  // wash a baked canvas toward a colour (atmospheric depth, damage soot, ...)
  function wash(c, col, a) {
    c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = a;
    c.fillStyle = col; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
  }

  // ------------------------------------------------------------- palettes
  // weathered reddish-brown wood: posts are dark, decking is lighter
  const W = {
    ink: '#1a1015', shadow: '#2a1a13',
    post0: '#331e13', post1: '#4a2b1a', post2: '#5f3821', post3: '#7a4a2a',
    deck0: '#573320', deck1: '#7b4a29', deck2: '#9c6238', deck3: '#b9814a', deck4: '#d3a469',
    wet: '#25301f', alg: '#3c5730', alg2: '#59783d', barn: '#b3b0a0',
    rope0: '#6f5230', rope1: '#a4804a', rope2: '#cfb078',
    met0: '#282d34', met1: '#474f59', met2: '#737d89', met3: '#a3adb8',
    rust0: '#6b3a20', rust1: '#98532a', rust2: '#c07038',
    net0: '#5c6b4a', net1: '#8a9a6c', net2: '#c2cba0',
    tar: '#20191c', float0: '#d9622f', float1: '#f39a4a', float2: '#f2e3c0',
    glow: '#ffd27a', glowHot: '#fff3c4',
  };

  const HOUSE_COLS = [
    { wall: ['#8e4136', '#a8503f', '#c0654a'], dk: '#5e2a26', roof: ['#452a29', '#5a3831', '#71463a'], trim: '#dcb47c', name: 'red' },
    { wall: ['#3c5b63', '#4b727c', '#5f8b95'], dk: '#27414a', roof: ['#2c373f', '#3a4852', '#4b5b67'], trim: '#cbd6c6', name: 'teal' },
    { wall: ['#77602f', '#94783c', '#b0924c'], dk: '#4f3f1e', roof: ['#47391f', '#5a4728', '#6d5832'], trim: '#e2cd93', name: 'ochre' },
    { wall: ['#3b5738', '#4b6d45', '#5f8755'], dk: '#26391f', roof: ['#313c2a', '#414e36', '#536243'], trim: '#cde0a6', name: 'green' },
    { wall: ['#68432d', '#815538', '#9a6746'], dk: '#43291a', roof: ['#3b281c', '#4d3524', '#5d402d'], trim: '#d6b183', name: 'wood' },
    { wall: ['#5a4a63', '#6f5c78', '#87718f'], dk: '#3a2f42', roof: ['#332b3a', '#443a4b', '#554a5d'], trim: '#d8cbe0', name: 'plum' },
  ];

  const SKIN = ['#e9b78c', '#d8a172', '#c68a5c', '#a96f45', '#8a5733', '#f0c9a4'];
  const SHIRT = ['#4f8fe0', '#d24a3c', '#3fae68', '#ef8f34', '#a06a3e', '#66788a', '#c8904f', '#8069a4', '#dcb985', '#3f8b98',
    '#e0c060', '#b8556a', '#6fa8c8', '#9aae5a'];
  const PANTS = ['#55637a', '#6b543a', '#455a6b', '#7a6244', '#4c6350', '#5f4a60', '#8a7a5e', '#6a4a3a'];
  const HATCOL = ['#c8302e', '#e6802a', '#3f7fd6', '#2f9e5b', '#d9a25a', '#8a9599', '#7c1414', '#4e5f6b'];
  const BLOOD = ['#ff5a5a', '#e0322e', '#c8302e', '#9e1f22', '#7c1414', '#55090c', '#3b0508'];

  /* ======================================================================
     1.  PROP SPRITES  --  hand-drawn with makeSprite + the PAL palette
     ====================================================================== */
  const P = {}; // prop sprites (makeSprite objects with ax/ay)
  const XPAL = {
    // extra characters for props
    '1': W.ink, '2': W.post1, '3': W.post2, '4': W.deck1, '5': W.deck2, '6': W.deck3, '7': W.deck4,
    '8': W.rope1, '9': W.rope2, '0': W.rope0,
    'F': W.float0, 'H': W.float1, 'J': W.float2, 'N': W.net1, 'V': W.net2, 'Q': W.wet,
    'I': W.met1, 'C': W.met2, 'Z': W.met3, 'W': '#e6f2ff',
  };
  const ms = (rows, ax, ay, extra) => makeSprite(rows, { ax, ay, pal: Object.assign({}, XPAL, extra || {}) });

  P.barrel = ms([
    '.11111111.',
    '1466666641',
    '1222222221',
    '1566666651',
    '1466666641',
    '1222222221',
    '1566666651',
    '1466666641',
    '1222222221',
    '.11111111.',
  ], 5, 10);
  P.barrelOpen = ms([
    '.11111111.',
    '1QQQQQQQQ1',
    '1Q2222QQ21',
    '1566666651',
    '1466666641',
    '1222222221',
    '1566666651',
    '1466666641',
    '.11111111.',
  ], 5, 9);
  P.crate = ms([
    '1111111111',
    '1655555561',
    '1516665151',
    '1551665511',
    '1556666511',
    '1565665651',
    '1516665151',
    '1655555561',
    '1111111111',
  ], 5, 9);
  P.crateSm = ms([
    '1111111',
    '1655561',
    '1516151',
    '1556551',
    '1516151',
    '1655561',
    '1111111',
  ], 3, 7);
  P.ropeCoil = ms([
    '..11111...',
    '.19889981.',
    '180899081.',
    '1898009891',
    '1809889081',
    '.18999881.',
    '..111111..',
  ], 5, 7);
  P.buoyProp = ms([
    '...1..',
    '..181.',
    '.11111',
    '1FHHF1',
    '1HJJH1',
    '1FHHF1',
    '1FFFF1',
    '.1111.',
  ], 3, 8);
  P.buoyBall = ms([
    '.111.',
    '1HJH1',
    '1JHF1',
    '1FHF1',
    '.111.',
  ], 2, 5);
  P.fish = ms([
    '..111..1.',
    '.1WCC11C1',
    '1CZZCCCC1',
    '1CZCCCC1.',
    '.11111...',
  ], 4, 5);
  P.fishFat = ms([
    '..1111..1..',
    '.1CZZCC11C1',
    '1ZWZZZCCCC1',
    '1CZZZZCCC1.',
    '.111111....',
  ], 5, 5);
  P.anchor = ms([
    '..1C1..',
    '.1CIC1.',
    '..1C1..',
    '1CCCCC1',
    '..1C1..',
    '..1C1..',
    '1.1C1.1',
    'C11C11C',
    'IC1C1CI',
    '1CCCCC1',
    '.11111.',
  ], 3, 11);
  P.lantern = ms([
    '..1..',
    '.101.',
    '1111.',
    '1y1..',
    '11111',
    '1YfY1',
    '1fwf1',
    '1YfY1',
    '11Y11',
    '.111.',
  ], 2, 0);
  P.lanternOut = ms([
    '..1..',
    '.101.',
    '1111.',
    '1y1..',
    '11111',
    '13231',
    '12221',
    '13231',
    '11211',
    '.111.',
  ], 2, 0);
  P.tyre = ms([
    '.1111.',
    '111111',
    '11..11',
    '11..11',
    '111111',
    '.1111.',
  ], 3, 0, { '1': '#211b1e' });
  P.gull = ms([
    '.1..1.',
    '1W11W1',
    '.1WW1.',
    '..y1..',
  ], 3, 2);
  P.bucket = ms([
    '1111111',
    '1ICCCI1',
    '1ICCCI1',
    '.1ICI1.',
    '.11111.',
  ], 3, 5);
  P.pot = ms([
    '.1111.',
    '122221',
    '133331',
    '133331',
    '.1331.',
    '.1111.',
  ], 3, 6);
  P.sack = ms([
    '..101..',
    '.18881.',
    '1899981',
    '1899981',
    '1889881',
    '.11111.',
  ], 3, 6);

  /* ======================================================================
     2.  KIT  --  procedural wood/architecture pieces drawn into a bake ctx
     ====================================================================== */
  const Kit = {};

  // -- a weathered plank surface seen edge-on (the deck top) ---------------
  // x,y = top-left of the deck surface. thickness 6px, boards run across.
  Kit.deck = function (c, x, y, w, rng, o) {
    o = o || {};
    const th = o.th || 6;
    x = Math.round(x); y = Math.round(y); w = Math.round(w);
    // under-shadow first
    R(c, x, y + th, w, 1, W.shadow);
    // body
    R(c, x, y, w, th, W.deck1);
    // individual boards (vertical seams), each with its own tone
    let bx = x;
    while (bx < x + w) {
      const bw = Math.min(x + w - bx, 5 + Math.floor(rng.next() * 6));
      const t = rng.next();
      const top = t > 0.72 ? W.deck4 : t > 0.4 ? W.deck3 : W.deck2;
      const mid = t > 0.72 ? W.deck2 : t > 0.4 ? W.deck2 : W.deck1;
      R(c, bx, y, bw, 1, top);
      R(c, bx, y + 1, bw, 2, mid);
      R(c, bx, y + 3, bw, th - 4, W.deck0);
      R(c, bx, y + th - 1, bw, 1, W.ink);
      // grain / wear
      if (rng.next() < 0.5) R(c, bx + 1 + Math.floor(rng.next() * (bw - 2)), y + 1, 1, 1, W.deck4);
      if (rng.next() < 0.3) R(c, bx + 1, y + 2, Math.max(1, bw - 3), 1, W.deck0);
      // seam + nails
      R(c, bx, y, 1, th - 1, W.deck0);
      if (rng.next() < 0.55) R(c, bx + 1, y, 1, 1, W.met2);
      if (rng.next() < 0.35) R(c, bx + bw - 2, y, 1, 1, W.met1);
      bx += bw;
    }
    R(c, x, y, w, 1, W.deck3);           // catch the very top as a bright edge
    for (let i = 0; i < w; i += 1) if (rng.next() < 0.14) R(c, x + i, y, 1, 1, W.deck4);
    R(c, x, y + th - 1, w, 1, W.ink);    // hard bottom line
    return y + th;
  };

  // -- a support pillar ----------------------------------------------------
  // style: 0 plain, 1 rope-lashed, 2 braced (adds a diagonal), 3 doubled
  Kit.pillar = function (c, x, yTop, yBot, wdt, rng, style, waterY) {
    wdt = wdt || 5;
    x = Math.round(x); yTop = Math.round(yTop); yBot = Math.round(yBot);
    const h = yBot - yTop; if (h <= 0) return;
    const lean = style === 3 ? 0 : (rng.next() - 0.5) * 2;
    for (let i = 0; i < h; i++) {
      const yy = yTop + i;
      const off = Math.round(lean * (i / h));
      R(c, x + off, yy, wdt, 1, W.post1);
      R(c, x + off, yy, 1, 1, W.post2);                    // lit edge
      R(c, x + off + wdt - 1, yy, 1, 1, W.post0);          // shade edge
      if (wdt > 4 && ((i + (x * 3)) % 7 === 0)) R(c, x + off + 1, yy, 1, 1, W.post2);
      if (rng.next() < 0.10) R(c, x + off + 1 + Math.floor(rng.next() * (wdt - 2)), yy, 1, 1, W.post0);
      if (rng.next() < 0.05) R(c, x + off + 1 + Math.floor(rng.next() * (wdt - 2)), yy, 1, 1, W.post3);
    }
    // outline
    for (let i = 0; i < h; i++) {
      const off = Math.round(lean * (i / h));
      R(c, x + off - 1, yTop + i, 1, 1, W.ink);
      R(c, x + off + wdt, yTop + i, 1, 1, W.ink);
    }
    // knot
    if (rng.next() < 0.5 && h > 14) {
      const ky = yTop + 4 + Math.floor(rng.next() * (h - 10));
      R(c, x + 1, ky, 2, 2, W.post0); R(c, x + 1, ky, 1, 1, W.post2);
    }
    // wet / weedy base where it meets the water
    if (waterY !== undefined && yBot >= waterY - 2) {
      const wetTop = Math.max(yTop, waterY - 9 - Math.floor(rng.next() * 4));
      for (let yy = wetTop; yy < yBot; yy++) {
        const off = Math.round(lean * ((yy - yTop) / h));
        R(c, x + off, yy, wdt, 1, yy > waterY - 4 ? W.wet : mix(W.post1, W.wet, 0.55));
        if (rng.next() < 0.3) R(c, x + off + Math.floor(rng.next() * wdt), yy, 1, 1, W.alg);
        if (rng.next() < 0.12) R(c, x + off + Math.floor(rng.next() * wdt), yy, 1, 1, W.alg2);
        if (rng.next() < 0.07) R(c, x + off + Math.floor(rng.next() * wdt), yy, 1, 1, W.barn);
      }
    }
    // rope lashing
    if (style === 1 || style === 3 || rng.next() < 0.3) {
      const ly = yTop + 5 + Math.floor(rng.next() * Math.max(1, h - 16));
      Kit.lashing(c, x - 2, ly, wdt + 4, rng);
    }
    return { x, top: yTop, bot: yBot, w: wdt, lean };
  };

  Kit.lashing = function (c, x, y, w, rng) {
    R(c, x, y - 1, w, 1, W.ink);
    for (let i = 0; i < 4; i++) {
      R(c, x, y + i, w, 1, i % 2 ? W.rope0 : W.rope1);
      for (let k = 0; k < w; k += 2) if (rng.next() < 0.5) R(c, x + k, y + i, 1, 1, i % 2 ? W.rope1 : W.rope2);
    }
    R(c, x, y + 4, w, 1, W.ink);
    // trailing tail
    if (rng.next() < 0.5) { R(c, x + w - 1, y + 4, 1, 3, W.rope0); R(c, x + w - 1, y + 7, 1, 1, W.rope1); }
  };

  Kit.brace = function (c, x0, y0, x1, y1, th) {
    pline(c, x0, y0, x1, y1, (th || 3) + 2, W.ink);
    pline(c, x0, y0, x1, y1, th || 3, W.post1);
    pline(c, x0 + 0.5, y0, x1 + 0.5, y1, Math.max(1, (th || 3) - 2), W.post2);
  };

  // -- railing along a deck -------------------------------------------------
  Kit.railing = function (c, x, y, w, rng, o) {
    o = o || {};
    const h = o.h || 13, spacing = o.spacing || 12;
    x = Math.round(x); y = Math.round(y);
    for (let px = 0; px <= w - 2; px += spacing) {
      const broken = o.broken && rng.next() < 0.25;
      const ph = broken ? Math.floor(h * rng.range(0.3, 0.6)) : h;
      const tilt = broken ? Math.round(rng.range(-2, 2)) : 0;
      pline(c, x + px, y, x + px + tilt, y - ph, 4, W.ink);
      pline(c, x + px, y, x + px + tilt, y - ph, 2, W.post1);
      R(c, x + px, y - ph, 1, Math.max(1, ph - 2), W.post2);
      if (broken) { R(c, x + px + tilt, y - ph, 2, 1, W.deck4); R(c, x + px + tilt - 1, y - ph - 1, 1, 1, W.deck3); }
    }
    if (o.rope) {
      // sagging rope rail
      for (let px = 0; px < w; px++) {
        const seg = (px % spacing) / spacing;
        const sag = Math.sin(seg * Math.PI) * 3;
        R(c, x + px, y - h + 1 + Math.round(sag), 1, 1, px % 3 ? W.rope1 : W.rope2);
        R(c, x + px, y - h + 2 + Math.round(sag), 1, 1, W.rope0);
      }
    } else {
      R(c, x, y - h - 1, w, 1, W.ink);
      R(c, x, y - h, w, 2, W.deck2);
      R(c, x, y - h, w, 1, W.deck3);
      R(c, x, y - h + 2, w, 1, W.ink);
      R(c, x, y - Math.round(h * 0.45), w, 1, W.deck1);
      R(c, x, y - Math.round(h * 0.45) + 1, w, 1, W.ink);
      for (let px = 0; px < w; px += 3) if (rng.next() < 0.25) R(c, x + px, y - h, 1, 1, W.deck4);
    }
  };

  // -- hanging fishing net with float balls --------------------------------
  Kit.net = function (c, x, y, w, h, rng, o) {
    o = o || {};
    x = Math.round(x); y = Math.round(y);
    const sag = o.sag === undefined ? 3 : o.sag;
    for (let i = 0; i < w; i += 2) {
      const s = Math.round(Math.sin(i / w * Math.PI) * sag);
      const hh = h + s;
      for (let j = 0; j < hh; j += 2) {
        R(c, x + i, y + j, 1, 1, W.net1);
        if ((i + j) % 4 === 0) R(c, x + i + 1, y + j + 1, 1, 1, W.net0);
        if (rng.next() < 0.08) R(c, x + i, y + j, 1, 1, W.net2);
      }
      // bottom edge rope
      R(c, x + i, y + hh, 1, 1, W.rope0);
      R(c, x + i + 1, y + hh, 1, 1, W.rope1);
    }
    // top rope
    R(c, x, y - 1, w, 1, W.rope0);
    // float balls along the bottom
    for (let i = 2; i < w - 2; i += 7 + Math.floor(rng.next() * 4)) {
      const s = Math.round(Math.sin(i / w * Math.PI) * sag);
      const fy = y + h + s + 1;
      const hot = rng.next() < 0.6;
      R(c, x + i - 1, fy, 3, 3, W.ink);
      R(c, x + i - 1, fy, 3, 1, hot ? W.float1 : W.float2);
      R(c, x + i - 1, fy + 1, 3, 2, hot ? W.float0 : W.rope1);
      R(c, x + i - 1, fy, 1, 1, hot ? W.float2 : '#ffffff');
    }
  };

  // -- ladder ---------------------------------------------------------------
  Kit.ladder = function (c, x, y, h, rng) {
    x = Math.round(x); y = Math.round(y);
    R(c, x - 1, y, 1, h, W.ink); R(c, x + 6, y, 1, h, W.ink);
    R(c, x, y, 2, h, W.post1); R(c, x + 4, y, 2, h, W.post1);
    R(c, x, y, 1, h, W.post2); R(c, x + 4, y, 1, h, W.post2);
    for (let i = 3; i < h - 1; i += 5) {
      R(c, x, y + i, 6, 1, W.ink);
      R(c, x, y + i - 1, 6, 1, W.deck2);
      if (rng.next() < 0.3) R(c, x + 1 + Math.floor(rng.next() * 4), y + i - 1, 1, 1, W.deck4);
    }
  };

  // -- stairs (down to the left or right) ----------------------------------
  Kit.stairs = function (c, x, y, w, h, dir, rng) {
    const steps = Math.max(2, Math.round(h / 4));
    const sw = Math.max(4, Math.round(w / steps));
    for (let i = 0; i < steps; i++) {
      const sx = dir > 0 ? x + i * sw : x + w - (i + 1) * sw;
      const sy = y + i * 4;
      R(c, sx - 1, sy - 1, sw + 2, 1, W.ink);
      R(c, sx, sy, sw, 1, W.deck3);
      R(c, sx, sy + 1, sw, 2, W.deck1);
      R(c, sx, sy + 3, sw, 1, W.deck0);
      R(c, sx, sy + 4, sw, 1, W.ink);
      if (rng.next() < 0.4) R(c, sx + 1 + Math.floor(rng.next() * (sw - 2)), sy, 1, 1, W.deck4);
    }
    // stringer
    for (let i = 0; i < steps; i++) {
      const sx = dir > 0 ? x + i * sw : x + w - (i + 1) * sw;
      R(c, dir > 0 ? sx : sx + sw - 2, y + i * 4 + 4, 2, 4, W.post0);
    }
  };

  // -- drying rack with hanging fish ---------------------------------------
  Kit.fishRack = function (c, x, y, w, rng) {
    // y = base line
    const h = 22;
    R(c, x - 1, y - h, 1, h, W.ink); R(c, x + w, y - h, 1, h, W.ink);
    R(c, x, y - h, 2, h, W.post1); R(c, x + w - 2, y - h, 2, h, W.post1);
    R(c, x, y - h, 1, h, W.post2); R(c, x + w - 2, y - h, 1, h, W.post2);
    R(c, x - 2, y - h - 1, w + 4, 1, W.ink);
    R(c, x - 2, y - h, w + 4, 2, W.deck2);
    R(c, x - 2, y - h + 2, w + 4, 1, W.ink);
    // hanging line + fish
    for (let i = 3; i < w - 3; i += 6) {
      const ln = 3 + Math.floor(rng.next() * 3);
      R(c, x + i, y - h + 3, 1, ln, W.rope0);
      const f = rng.next() < 0.4 ? P.fishFat : P.fish;
      c.drawImage(f.c, x + i - Math.round(f.ax) + 1, y - h + 3 + ln);
    }
    // cross brace
    Kit.brace(c, x + 1, y - 3, x + w - 2, y - h + 6, 2);
  };

  // -- a moored rowboat, side view -----------------------------------------
  Kit.rowboat = function (c, x, y, len, rng) {
    const h = 9;
    // hull
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const bowRise = Math.round(Math.pow(Math.abs(k - 0.5) * 2, 2.2) * 5);
      const top = y - h + bowRise * -1 + (bowRise ? 0 : 0);
      const yy = y - h - bowRise;
      R(c, x + i, yy, 1, h + bowRise, W.deck1);
      R(c, x + i, yy, 1, 1, W.deck3);
      R(c, x + i, yy + 1, 1, 1, W.deck2);
      R(c, x + i, y - 3, 1, 3, W.deck0);
      R(c, x + i, y, 1, 1, W.ink);
      if (rng.next() < 0.12) R(c, x + i, yy + 2 + Math.floor(rng.next() * 4), 1, 1, W.deck0);
      if (i === 0 || i === len - 1) R(c, x + i, yy, 1, h + bowRise, W.ink);
      void top;
    }
    R(c, x, y - h - 5, len, 1, W.ink);
    // interior shadow + thwarts
    R(c, x + 2, y - h + 1, len - 4, 3, W.shadow);
    R(c, x + Math.round(len * 0.3), y - h + 1, 3, 3, W.deck2);
    R(c, x + Math.round(len * 0.65), y - h + 1, 3, 3, W.deck2);
    // oar
    pline(c, x + 3, y - h + 2, x + len - 5, y - h - 6, 3, W.ink);
    pline(c, x + 3, y - h + 2, x + len - 5, y - h - 6, 1, W.deck3);
    R(c, x + len - 7, y - h - 8, 3, 4, W.ink); R(c, x + len - 6, y - h - 7, 2, 3, W.deck2);
  };

  // -- a house on stilts ----------------------------------------------------
  // x,y = bottom-left of the walls (floor line). Returns {lights, smoke}
  Kit.house = function (c, x, y, w, wallH, col, rng, o) {
    o = o || {};
    const lights = [];
    let smoke = null;
    const roofH = Math.round(w * 0.36) + 4;
    const over = 5;
    const top = y - wallH;

    // --- floor joists under the walls
    R(c, x - 2, y, w + 4, 1, W.ink);
    R(c, x - 2, y - 2, w + 4, 2, W.post1);
    R(c, x - 1, y - 2, w + 2, 1, W.post2);

    // --- wall: vertical board siding
    R(c, x, top, w, wallH, col.wall[1]);
    let bx = x;
    while (bx < x + w) {
      const bw = 3 + Math.floor(rng.next() * 2);
      const t = rng.next();
      R(c, bx, top, Math.min(bw, x + w - bx), wallH, t > 0.66 ? col.wall[2] : t > 0.3 ? col.wall[1] : col.wall[0]);
      R(c, bx, top, 1, wallH, col.dk);
      // weathering streaks
      if (rng.next() < 0.22) R(c, bx + 1, top + Math.floor(rng.next() * wallH * 0.4), 1, Math.floor(rng.range(3, wallH * 0.5)), col.dk);
      bx += bw;
    }
    // battens top & bottom, corner posts
    R(c, x, top, w, 1, col.wall[2]);
    R(c, x, y - 3, w, 3, col.dk);
    R(c, x, y - 4, w, 1, mix(col.wall[0], W.ink, 0.3));
    R(c, x, top, 2, wallH, col.wall[0]); R(c, x + w - 2, top, 2, wallH, col.dk);
    R(c, x - 1, top, 1, wallH, W.ink); R(c, x + w, top, 1, wallH, W.ink);
    // damp stain along the bottom
    for (let i = 0; i < w; i++) if (rng.next() < 0.5) R(c, x + i, y - 5 - Math.floor(rng.next() * 3), 1, 2, mix(col.dk, W.wet, 0.4));

    // --- door
    const doorW = 9, doorH = Math.min(15, wallH - 8);
    const doorX = x + (o.doorLeft ? 3 : Math.round(w * (o.doorAt === undefined ? 0.62 : o.doorAt)));
    const doorY = y - doorH - 3;
    R(c, doorX - 1, doorY - 1, doorW + 2, doorH + 2, W.ink);
    R(c, doorX, doorY, doorW, doorH, W.deck1);
    for (let i = 0; i < doorW; i += 3) { R(c, doorX + i, doorY, 1, doorH, W.deck0); R(c, doorX + i + 1, doorY, 1, doorH, W.deck2); }
    R(c, doorX, doorY, doorW, 1, W.deck3);
    R(c, doorX + doorW - 3, doorY + Math.round(doorH / 2), 2, 1, W.met3);
    if (o.doorOpen) {
      R(c, doorX + 3, doorY + 1, doorW - 3, doorH - 1, '#160f14');
      lights.push({ x: doorX + 3, y: doorY + doorH - 6, w: doorW - 3, h: 5, ph: rng.range(0, TAU), k: 0.5 });
    }

    // --- windows (with shutters); the lit interior is drawn at runtime
    const winY = top + 5 + Math.floor(rng.next() * 3);
    const nWin = w > 44 ? 2 : 1;
    for (let i = 0; i < nWin; i++) {
      const wx = x + 5 + Math.round((w - 16) * (nWin === 1 ? (o.doorAt > 0.5 ? 0.12 : 0.7) : i * 0.62));
      const ww = 9, wh = 10;
      R(c, wx - 2, winY - 2, ww + 4, wh + 4, W.ink);
      R(c, wx - 1, winY - 1, ww + 2, wh + 2, col.trim);
      R(c, wx, winY, ww, wh, '#1a1218');
      // mullions drawn over the runtime glow -> keep them as a mask list
      lights.push({ x: wx, y: winY, w: ww, h: wh, ph: rng.range(0, TAU), k: 1, mull: true });
      // sill
      R(c, wx - 3, winY + wh + 1, ww + 6, 2, col.trim);
      R(c, wx - 3, winY + wh + 3, ww + 6, 1, W.ink);
      // shutters
      const sw = 4;
      for (const s of [-1, 1]) {
        if (rng.next() < 0.25) continue;
        const sx = s < 0 ? wx - 2 - sw : wx + ww + 2;
        R(c, sx - 1, winY - 2, sw + 2, wh + 4, W.ink);
        R(c, sx, winY - 1, sw, wh + 2, col.wall[0]);
        for (let k = 0; k < wh + 2; k += 2) R(c, sx, winY - 1 + k, sw, 1, col.dk);
        R(c, sx, winY - 1, 1, wh + 2, col.wall[2]);
      }
    }

    // --- roof: pitched shingles with an overhang
    for (let i = 0; i < roofH; i++) {
      const k = i / roofH;
      const rw = Math.round(lerp(3, w + over * 2, Math.pow(k, 0.92)));
      const rx = Math.round(x + w / 2 - rw / 2);
      const ry = top - roofH + i;
      const row = Math.floor(i / 3);
      const cl = row % 2 ? col.roof[1] : col.roof[2];
      R(c, rx, ry, rw, 1, cl);
      // shingle tabs
      if (i % 3 === 2) {
        R(c, rx, ry, rw, 1, col.roof[0]);
        for (let q = (row * 3) % 6; q < rw; q += 6) R(c, rx + q, ry - 1, 1, 1, col.roof[0]);
      }
      if (i % 3 === 0) for (let q = 0; q < rw; q += 2) if (rng.next() < 0.2) R(c, rx + q, ry, 1, 1, col.roof[2]);
      R(c, rx - 1, ry, 1, 1, W.ink); R(c, rx + rw, ry, 1, 1, W.ink);
      if (i === roofH - 1) { R(c, rx - 1, ry + 1, rw + 2, 1, W.ink); R(c, rx, ry, rw, 1, col.roof[0]); }
    }
    // ridge cap
    R(c, Math.round(x + w / 2 - 3), top - roofH - 1, 6, 2, W.ink);
    R(c, Math.round(x + w / 2 - 2), top - roofH - 1, 4, 1, col.roof[2]);
    // moss / patch on the roof
    if (rng.next() < 0.6) {
      const mx = Math.round(x + rng.range(4, w - 10)), my = top - Math.round(roofH * rng.range(0.25, 0.7));
      for (let i = 0; i < 9; i++) R(c, mx + Math.floor(rng.range(0, 7)), my + Math.floor(rng.range(0, 4)), 1, 1, rng.next() < 0.5 ? W.alg : W.alg2);
    }

    // --- gable vent
    const gy = top - Math.round(roofH * 0.45);
    R(c, Math.round(x + w / 2 - 4), gy, 8, 6, W.ink);
    R(c, Math.round(x + w / 2 - 3), gy + 1, 6, 4, '#221a1c');
    for (let i = 0; i < 4; i += 2) R(c, Math.round(x + w / 2 - 3), gy + 1 + i, 6, 1, col.trim);

    // --- chimney
    if (o.chimney !== false) {
      const cxp = Math.round(x + (o.chimneyLeft ? w * 0.22 : w * 0.76));
      const rowK = Math.abs(cxp - (x + w / 2)) / (w / 2 + over);
      const roofTopY = top - roofH + Math.round(rowK * roofH);
      const ch = 12;
      R(c, cxp - 4, roofTopY - ch, 9, ch + 3, W.ink);
      R(c, cxp - 3, roofTopY - ch + 1, 7, ch + 2, '#6b4a3c');
      for (let i = 0; i < ch; i += 3) {
        R(c, cxp - 3, roofTopY - ch + 1 + i, 7, 1, '#4a3128');
        R(c, cxp - 3 + ((i / 3) % 2 ? 2 : 5), roofTopY - ch + 2 + i, 1, 2, '#4a3128');
      }
      R(c, cxp - 5, roofTopY - ch - 2, 11, 3, W.ink);
      R(c, cxp - 4, roofTopY - ch - 1, 9, 1, '#8a6154');
      smoke = { x: cxp, y: roofTopY - ch - 3 };
    }

    // --- porch awning over the door
    if (o.awning !== false) {
      const ay = doorY - 4;
      R(c, doorX - 5, ay - 1, doorW + 10, 1, W.ink);
      R(c, doorX - 5, ay, doorW + 10, 3, col.roof[1]);
      R(c, doorX - 5, ay + 1, doorW + 10, 1, col.roof[0]);
      R(c, doorX - 5, ay + 3, doorW + 10, 1, W.ink);
      R(c, doorX - 4, ay + 4, 1, doorY - ay - 4, W.post1);
      R(c, doorX + doorW + 3, ay + 4, 1, doorY - ay - 4, W.post1);
      // hanging lantern
      R(c, doorX + doorW + 5, ay, 1, 3, W.ink);
      c.drawImage(P.lantern.c, doorX + doorW + 3, ay + 1);
      lights.push({ x: doorX + doorW + 3, y: ay + 6, w: 5, h: 5, ph: rng.range(0, TAU), k: 1.3, lantern: true });
    }

    // --- wall clutter: net, buoys, oar
    if (rng.next() < 0.6) Kit.net(c, x + 2, top + wallH - 16, Math.min(18, w - 6), 10, rng, { sag: 2 });
    if (rng.next() < 0.5) {
      const bx2 = x + w - 9;
      R(c, bx2 + 2, top + 3, 1, 4, W.rope0);
      c.drawImage(P.buoyProp.c, bx2, top + 6);
    }
    return { lights, smoke, roofH };
  };

  // -- a tree / palm for the land behind ------------------------------------
  Kit.tree = function (c, x, y, rng, kind) {
    if (kind === 'palm') {
      const h = Math.round(rng.range(22, 34));
      for (let i = 0; i < h; i++) {
        const bend = Math.round(Math.sin(i / h * 1.2) * 4);
        R(c, x + bend - 1, y - i, 3, 1, i % 4 === 0 ? '#5c3a1c' : '#7a4f28');
        R(c, x + bend - 2, y - i, 1, 1, W.ink); R(c, x + bend + 2, y - i, 1, 1, W.ink);
      }
      const tx = x + Math.round(Math.sin(1.2) * 4), ty = y - h;
      for (let a = 0; a < 7; a++) {
        const ang = -Math.PI / 2 + (a - 3) * 0.44 + rng.range(-0.08, 0.08);
        const L = rng.range(9, 15);
        const ex = tx + Math.cos(ang) * L, ey = ty + Math.sin(ang) * L * 0.8 + 4;
        pline(c, tx, ty, ex, ey, 4, W.ink);
        pline(c, tx, ty, ex, ey, 2, a % 2 ? '#2f7e4b' : '#3f9e5b');
        pline(c, tx, ty, (tx + ex) / 2, (ty + ey) / 2, 1, '#6fd88e');
      }
      R(c, tx - 2, ty, 4, 3, W.ink); R(c, tx - 1, ty + 1, 2, 1, '#8a5a33');
    } else {
      const h = Math.round(rng.range(16, 26)), r = Math.round(rng.range(8, 13));
      R(c, x - 2, y - h, 4, h, W.ink);
      R(c, x - 1, y - h, 2, h, '#43281a');
      R(c, x - 1, y - h, 1, h, '#5c3a1c');
      // blobby canopy out of chunky rows
      for (let i = -r; i <= r; i++) {
        const ww = Math.round(Math.sqrt(Math.max(0, r * r - i * i)) * 1.25);
        const yy = y - h - r + i + 2;
        R(c, x - ww - 1, yy, ww * 2 + 2, 1, W.ink);
        R(c, x - ww, yy, ww * 2, 1, i < -r * 0.2 ? '#4fb373' : i < r * 0.4 ? '#2f9e5b' : '#1d6b3c');
        for (let q = -ww; q < ww; q += 2) if (rng.next() < 0.2) R(c, x + q, yy, 1, 1, '#6fd88e');
      }
    }
  };

  // -- top-down pier decking (the jetty that runs out into the water) -------
  Kit.jetty = function (c, x, y, w, len, rng, o) {
    o = o || {};
    // boards run across the jetty
    for (let i = 0; i < len; i++) {
      const row = (i / 5) | 0, k = i % 5;
      // one board every 5px: bright top edge, body, dark seam
      let col = k === 0 ? W.deck3 : k === 4 ? W.deck0 : W.deck2;
      if (row % 3 === 1 && k > 0 && k < 4) col = W.deck1;
      R(c, x, y + i, w, 1, col);
      if (k === 1) for (let q = (row * 3) % 5; q < w; q += 5) { if (rng.next() < 0.5) R(c, x + q, y + i, 1, 1, W.deck3); }
      for (let q = 0; q < w; q += 1) if (rng.next() < 0.035) R(c, x + q, y + i, 1, 1, rng.next() < 0.5 ? W.deck4 : W.deck0);
    }
    // occasional plank butt-joint + nail heads
    for (let i = 0; i < len; i += 15) {
      const jx = x + 5 + Math.floor(rng.next() * (w - 10));
      R(c, jx, y + i, 1, 5, W.deck0);
    }
    for (let i = 1; i < len; i += 5) {
      if (rng.next() < 0.5) R(c, x + 3, y + i, 1, 1, W.met1);
      if (rng.next() < 0.5) R(c, x + w - 4, y + i, 1, 1, W.met1);
    }
    // the deck is raised: darker along both edges
    R(c, x + 2, y, 2, len, 'rgba(30,18,14,0.22)');
    R(c, x + w - 4, y, 3, len, 'rgba(30,18,14,0.30)');
    // stringers / kerb both sides
    R(c, x - 1, y, 1, len, W.ink); R(c, x + w, y, 1, len, W.ink);
    R(c, x, y, 2, len, W.deck1); R(c, x + w - 2, y, 2, len, W.deck0);
    // side rails (drawn as a dark band + posts poking out)
    if (o.rails !== false) {
      for (const s of [0, 1]) {
        const rx = s ? x + w - 3 : x;
        for (let i = 2; i < len - 2; i += 11) {
          R(c, rx - 2, y + i, 5, 3, W.ink);
          R(c, rx - 1, y + i, 3, 2, W.post2);
          R(c, rx - 1, y + i, 1, 1, W.post3);
        }
        R(c, rx - 2, y, 2, len, W.post1);
        R(c, rx - 2, y, 1, len, W.post2);
        R(c, rx - 3, y, 1, len, W.ink);
        R(c, rx, y, 1, len, W.ink);
      }
    }
    // pillars poking out along the sides, with wet bases
    for (let i = 3; i < len - 3; i += 14) {
      for (const s of [0, 1]) {
        const px = s ? x + w + 1 : x - 5;
        R(c, px - 1, y + i - 1, 6, 9, W.ink);
        R(c, px, y + i, 4, 7, W.post1);
        R(c, px, y + i, 1, 7, W.post2);
        R(c, px, y + i + 5, 4, 2, W.wet);
        if (rng.next() < 0.5) R(c, px + 1, y + i + 6, 2, 1, W.alg);
      }
    }
  };

  /* ======================================================================
     3.  DAMAGE  --  punch holes / crack / lean a baked structure canvas
     ====================================================================== */
  function damagePass(c, amount, seed, lean) {
    const rng = new SeededRandom(seed + 7717);
    const w = c.canvas.width, h = c.canvas.height;
    const holes = Math.round(amount * 7);
    for (let i = 0; i < holes; i++) {
      const hx = Math.round(rng.range(2, w - 6)), hy = Math.round(rng.range(2, h - 6));
      const hw = Math.round(rng.range(3, 4 + amount * 6)), hh = Math.round(rng.range(2, 3 + amount * 5));
      // jagged clear
      for (let q = 0; q < hh; q++) {
        const inset = Math.round(rng.range(0, 2));
        c.clearRect(hx + inset, hy + q, hw - inset * 2, 1);
      }
      // splinter rim
      for (let q = 0; q < 7; q++) {
        const sx = hx + Math.round(rng.range(-1, hw)), sy = hy + Math.round(rng.range(-1, hh));
        c.fillStyle = rng.next() < 0.5 ? W.deck4 : W.deck0;
        c.fillRect(sx, sy, 1, 1);
      }
    }
    // cracks
    const cracks = Math.round(amount * 4);
    for (let i = 0; i < cracks; i++) {
      let x = rng.range(4, w - 4), y = rng.range(4, h - 4);
      let a = rng.range(0, TAU);
      c.fillStyle = W.ink;
      for (let q = 0; q < 10 + amount * 12; q++) {
        c.fillRect(Math.round(x), Math.round(y), 1, 1);
        a += rng.range(-0.6, 0.6); x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6;
        if (x < 0 || y < 0 || x > w || y > h) break;
      }
    }
    // soot / scorch
    if (amount > 0.5) {
      c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.18 * amount;
      c.fillStyle = '#120c10'; c.fillRect(0, 0, w, h); c.restore();
    }
    if (lean) {
      // shear the whole canvas so the structure leans (row-by-row, still crisp)
      const src = cv(w, h); src.drawImage(c.canvas, 0, 0);
      c.clearRect(0, 0, w, h);
      for (let y = 0; y < h; y++) {
        const off = Math.round(lean * (1 - y / h) * (1 - y / h));
        c.drawImage(src.canvas, 0, y, w, 1, off, y, w, 1);
      }
    }
  }

  /* ======================================================================
     4.  GORE  --  self-contained chunky-pixel blood / organs / stains
     ====================================================================== */
  // --- organ & bone sprites (cartoony chunks) ---
  const GPAL = {
    '1': '#3b0508', '2': '#55090c', '3': '#7c1414', '4': '#9e1f22', '5': '#c8302e',
    '6': '#e0322e', '7': '#ff5a5a', '8': '#ffa0a0', '9': '#5a2a2e',
    'B': '#e8e2cf', 'C': '#c9c2ab', 'D': '#9a9483', 'E': '#f7f3e6',
    'P': '#d98fa0', 'Q': '#b06a7c',
  };
  const gs = rows => makeSprite(rows, { pal: Object.assign({}, PAL, GPAL) });
  const ORGANS = [
    gs(['.111.', '15651', '16751', '14541', '.131.']),                       // heart
    gs(['.1111.', '145541', '1565P1', '1455P1', '.1331.']),                  // liver
    gs(['11.11', '15115', '1P651', '15115', '.111.']),                       // lungs
    gs(['.1111..', '153451.', '1451351', '1534151', '.111151', '...111.']),  // guts
    gs(['.11.', '1PQ1', '1QP1', '.11.']),                                    // kidney
    gs(['.BB.', 'BEEB', 'BEEB', '.BB.']),                                    // bone knob
    gs(['.B1.', '1BB1', '1CB1', '1BC1', '.11.']),                            // bone shard
    gs(['.11.', '1EB1', '1BE1', '.11.']),                                    // tooth/skull bit
  ];
  const ORGAN_W = [1, 1, 1, 1, 1, 0, 0, 0]; // 0 = bone-ish (bounces, pale)

  // --- baked pools & splats ---
  const POOLS = [];
  function poolSprite(r) {
    if (POOLS[r]) return POOLS[r];
    const size = r * 2 + 4, c = cv(size, size), rng = new SeededRandom(900 + r * 13);
    const cxp = size / 2, cyp = size / 2;
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)) * 1.22);
      if (hw <= 0) continue;
      const wob = Math.round(rng.range(-1, 1.4));
      R(c, cxp - hw + wob, cyp + dy, hw * 2, 1, Math.abs(dy) > r * 0.62 ? '#7c1414' : '#9e1f22');
      if (Math.abs(dy) < r * 0.45) R(c, cxp - hw * 0.55 + wob, cyp + dy, hw * 1.1, 1, '#c8302e');
      // dithered edge
      R(c, cxp - hw + wob - 1, cyp + dy, 1, 1, '#55090c');
      R(c, cxp + hw + wob, cyp + dy, 1, 1, '#55090c');
    }
    // stray droplets
    for (let i = 0; i < r; i++) {
      const a = rng.range(0, TAU), d = rng.range(r, r + 3);
      R(c, cxp + Math.cos(a) * d, cyp + Math.sin(a) * d * 0.8, rng.next() < 0.4 ? 2 : 1, 1, '#7c1414');
    }
    return POOLS[r] = sprite(c, -Math.round(size / 2), -Math.round(size / 2));
  }
  const SPLATS = [];
  for (let i = 0; i < 8; i++) {
    const rng = new SeededRandom(311 + i * 97);
    const size = 18, c = cv(size, size);
    const n = 3 + Math.floor(rng.next() * 4);
    for (let k = 0; k < n; k++) {
      const bx = rng.range(4, size - 6), by = rng.range(4, size - 6), bw = rng.range(2, 6), bh = rng.range(2, 4);
      R(c, bx, by, bw, bh, k === 0 ? '#9e1f22' : '#7c1414');
      R(c, bx + 1, by, bw - 2, 1, '#c8302e');
    }
    for (let k = 0; k < 10; k++) R(c, rng.range(1, size - 2), rng.range(1, size - 2), 1, 1, rng.next() < 0.5 ? '#7c1414' : '#55090c');
    SPLATS.push(sprite(c, -9, -9));
  }

  let _goreSfx = 0;
  const Gore = {
    parts: [], decals: [], sprays: [], max: 420, maxDecals: 150,
    waterY: null, _decalsDrawn: false,
    reset() { this.parts.length = 0; this.decals.length = 0; this.sprays.length = 0; },
    waterLine() { if (this.waterY !== null) return this.waterY; const g = gg(); return (g && g.ocean ? g.ocean.shoreY : 300) + 6; },
    onDeck(x, y) { return Village.deckAt(x, y); },
    _add(p) { if (this.parts.length >= this.max) this.parts.shift(); this.parts.push(p); },

    // chunky blood gout burst. angle undefined -> omnidirectional
    burst(x, y, amount, angle, z0) {
      amount = amount === undefined ? 1 : amount;
      z0 = z0 === undefined ? 3 : z0;
      const spread = angle === undefined ? Math.PI : 0.85;
      const base = angle === undefined ? 0 : angle;
      const n = Math.round(7 * amount) + 4;
      for (let i = 0; i < n; i++) {
        const a = base + rand(-spread, spread), sp = rand(55, 210) * Math.sqrt(amount);
        this._add({ t: 0, x: x + rand(-3, 3), y: y + rand(-2, 2), z: z0 + rand(-2, 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.22, vz: rand(40, 180) - Math.sin(a) * sp * 0.55,
          life: rand(0.8, 2.2), s: randi(2, 3), col: BLOOD[randi(1, 4)], kind: 0, trail: Math.random() < 0.5 });
      }
      this.mist(x, y, Math.round(2 * amount) + 2, z0);
      const chunks = Math.round(1.6 * amount);
      for (let i = 0; i < chunks; i++) {
        const a = base + rand(-spread, spread), sp = rand(30, 130) * Math.sqrt(amount);
        const oi = randi(0, ORGANS.length - 1);
        this._add({ t: 0, x, y, z: z0 + rand(-1, 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.22, vz: rand(60, 200) - Math.sin(a) * sp * 0.5,
          life: rand(4, 8), kind: 1, o: oi, bone: !ORGAN_W[oi], rot: rand(0, TAU), vr: rand(-13, 13), drip: rand(0, 0.2) });
      }
      if (amount >= 1) this.splat(x, y, amount);
      if (amount > 0.8 && _goreSfx <= 0) { _goreSfx = 0.08; try { Audio_.noise(0.12, 0.13 * Math.min(2, amount), 1100, 180); } catch (e) { } }
    },

    // arterial spray: a pumping emitter that draws an arc
    spray(x, y, angle, amount, z0) {
      this.sprays.push({ x, y, z: z0 === undefined ? 4 : z0, a: angle === undefined ? -Math.PI / 2 : angle, t: 0, dur: 0.35 + 0.55 * (amount || 1), amt: amount || 1, pulse: 0, owner: null });
    },
    sprayFrom(owner, ox, oy, angle, amount) {
      this.sprays.push({ x: 0, y: 0, z: oy || 4, ox, oy, a: angle, t: 0, dur: 0.5 + 0.9 * (amount || 1), amt: amount || 1, pulse: 0, owner });
    },
    mist(x, y, n, z0) {
      z0 = z0 === undefined ? 4 : z0;
      for (let i = 0; i < n; i++) this._add({ t: 0, x: x + rand(-5, 5), y: y + rand(-3, 3), z: z0 + rand(-3, 4),
        vx: rand(-22, 22), vy: rand(-6, 6), vz: rand(4, 26), life: rand(0.22, 0.5), s: randi(2, 3), col: BLOOD[randi(1, 4)], kind: 3, seed: randi(0, 255) });
    },
    // a permanent-ish stain on decking
    splat(x, y, amount) {
      if (!this.onDeck(x, y) && y > this.waterLine()) {
        const g = gg(); if (g && g.ocean) g.ocean.splatBlood(x, y, amount * 2, 14);
        return;
      }
      this.decals.push({ x, y, kind: 0, s: SPLATS[randi(0, SPLATS.length - 1)], a: Math.min(0.95, 0.55 + amount * 0.3), life: 0 });
      if (amount > 0.7) this.decals.push({ x: x + rand(-4, 4), y: y + rand(-3, 3), kind: 1, r: 2, max: Math.min(15, 4 + amount * 4), a: 0.9, life: 0, drip: y > this.waterLine() - 3 ? 0.5 : 0 });
      this._trimDecals();
    },
    _trimDecals() { while (this.decals.length > this.maxDecals) this.decals.shift(); },

    _land(p) {
      const wy = this.waterLine();
      const g = gg();
      if (p.y > wy && !this.onDeck(p.x, p.y)) {
        if (g && g.ocean) {
          g.ocean.addBlood(p.x, p.y, p.kind === 1 ? 0.5 : 0.22);
          if (p.kind === 1) { g.ocean.splatBlood(p.x, p.y, 1.2, 10); g.ocean.addFoam(p.x, p.y, 0.25); g.ocean.ripple(p.x, p.y, 10, 30, 0.5); }
        }
        if (p.kind === 1 && g && g.particles && Math.random() < 0.6) g.particles.splash(p.x, p.y, 0.35);
        p.life = 0; return true;
      }
      return false;
    },

    update(dt) {
      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      if (now - (this._lastUpdate || 0) < 4) { this._lastUpdate = now; return; }  // already stepped this frame
      this._lastUpdate = now;
      if (_goreSfx > 0) _goreSfx -= dt;
      const wy = this.waterLine();
      const g = gg();
      const list = this.parts;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.t += dt; p.life -= dt;
        if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
        if (p.kind === 3) { // mist
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 26 * dt; p.vx *= 0.9; p.vy *= 0.9; p.s += 4 * dt;
          continue;
        }
        if (p.rest) { // settled chunk: just drips a little
          if (p.kind === 1 && p.drip !== undefined) {
            p.drip -= dt;
            if (p.drip <= 0) { p.drip = rand(0.6, 2.2); if (Math.random() < 0.6) this.splat(p.x + rand(-2, 2), p.y + rand(-1, 1), 0.25); }
          }
          continue;
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.z += p.vz * dt; p.vz -= 340 * dt;
        p.vx *= (1 - 1.0 * dt); p.vy *= (1 - 1.0 * dt);
        if (p.rot !== undefined) p.rot += p.vr * dt;
        if (p.trail && Math.random() < 0.13 * 60 * dt) this._add({ t: 0, x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: -10, life: rand(0.2, 0.5), s: 1, col: p.col, kind: 0 });
        if (p.z <= 0 && p.vz < 0) {
          p.z = 0;
          if (this._land(p)) continue;
          if (p.kind === 0) { this.splat(p.x, p.y, p.s > 2 ? 0.55 : 0.28); p.life = 0; continue; }
          if (p.kind === 2 && (p.bounce || 0) >= 1) { p.vz = 0; p.vx = 0; p.vy = 0; p.rest = true; this.splat(p.x, p.y, 0.5); continue; }
          // chunk / bone bounce
          if (Math.abs(p.vz) > 55 && (p.bounce || 0) < 2) {
            p.bounce = (p.bounce || 0) + 1;
            p.vz = -p.vz * (p.bone ? 0.45 : 0.24);
            p.vx *= 0.5; p.vy *= 0.5; p.vr *= 0.45;
            if (!p.bone) this.splat(p.x, p.y, 0.45);
          } else {
            p.vz = 0; p.vx = 0; p.vy = 0; p.rest = true; p.rot = Math.round(p.rot / (Math.PI / 4)) * (Math.PI / 4);
            if (!p.bone) this.splat(p.x, p.y, 0.5);
          }
        }
      }
      // arterial sprays
      for (let i = this.sprays.length - 1; i >= 0; i--) {
        const s = this.sprays[i];
        s.t += dt;
        if (s.owner) { s.x = s.owner.x + (s.ox || 0); s.y = s.owner.y; s.z = (s.oy || 4) + (s.owner.z || 0); }
        s.pulse -= dt;
        if (s.pulse <= 0) {
          s.pulse = 0.14 + Math.random() * 0.08;
          const power = (1 - s.t / s.dur);
          const n = 1 + Math.round(2.4 * s.amt * power);
          for (let k = 0; k < n; k++) {
            const a = s.a + rand(-0.16, 0.16);
            const sp = rand(90, 210) * (0.45 + power * 0.75);
            this._add({ t: 0, x: s.x, y: s.y, z: s.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.2, vz: rand(50, 130) * (0.4 + power) - Math.sin(a) * sp * 0.6,
              life: rand(0.8, 1.8), s: randi(1, 3), col: BLOOD[randi(0, 3)], kind: 0, trail: true });
          }
        }
        if (s.t > s.dur) this.sprays.splice(i, 1);
      }
      // decals: pools spread, drip off the pier edge
      for (let i = this.decals.length - 1; i >= 0; i--) {
        const d = this.decals[i];
        d.life += dt;
        if (d.kind === 1) {
          if (d.r < d.max) d.r = Math.min(d.max, d.r + dt * 4.5);
          if (d.drip > 0) {
            d.drip -= dt;
            if (Math.random() < dt * 2.2 && g && g.ocean) { g.ocean.addBlood(d.x + rand(-4, 4), wy + rand(2, 10), 0.10); }
          }
        }
        if (d.a > 0.42) d.a = Math.max(0.42, d.a - dt * 0.012);
      }
    },

    renderDecals(ctx, cam) {
      this._decalsDrawn = true;
      ctx.imageSmoothingEnabled = false;
      for (const d of this.decals) {
        const sx = d.x - cam.x, sy = d.y - cam.y;
        if (sx < -24 || sy < -24 || sx > 668 || sy > 388) continue;
        ctx.globalAlpha = d.a;
        if (d.kind === 0) blit(ctx, d.s, sx, sy);
        else blit(ctx, poolSprite(Math.max(2, Math.round(d.r))), sx, sy);
      }
      ctx.globalAlpha = 1;
    },

    render(ctx, cam) {
      this._lastRender = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      if (!this._decalsDrawn) this.renderDecals(ctx, cam);
      this._decalsDrawn = false;
      ctx.imageSmoothingEnabled = false;
      for (const p of this.parts) {
        const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y - p.z);
        if (sx < -22 || sy < -22 || sx > 662 || sy > 382) continue;
        if (p.kind === 3) {
          // dithered pixel puff: a few 2px cells, never a solid blob
          const k = Math.max(0, Math.min(1, p.life * 3));
          ctx.globalAlpha = 0.20 + 0.42 * k;
          ctx.fillStyle = p.col;
          const s = Math.max(2, Math.round(p.s)), h = s >> 1;
          for (let dy = -h; dy < h + 1; dy += 2) for (let dx = -h; dx < h + 1; dx += 2) {
            if (hash2(sx + dx + p.seed, sy + dy) > 0.42 + (1 - k) * 0.4) ctx.fillRect(sx + dx, sy + dy, 2, 2);
          }
          ctx.globalAlpha = 1;
          continue;
        }
        if (p.kind === 2) {
          const w2 = p.w, h2 = p.h, fl = Math.abs(Math.cos(p.rot));
          const hw = Math.max(1, Math.round(w2 * (0.35 + fl * 0.65))), hh = Math.max(1, h2);
          ctx.fillStyle = W.ink; ctx.fillRect(sx - (hw >> 1) - 1, sy - (hh >> 1) - 1, hw + 2, hh + 2);
          ctx.fillStyle = p.col; ctx.fillRect(sx - (hw >> 1), sy - (hh >> 1), hw, hh);
          ctx.fillStyle = '#9e1f22'; ctx.fillRect(sx - (hw >> 1), sy + (hh >> 1) - 1, hw, 1);
          if (p.z > 3) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#0a0610'; ctx.fillRect(sx - 2, Math.round(p.y - cam.y), 5, 2); ctx.globalAlpha = 1; }
          continue;
        }
        if (p.kind === 1) {
          const o = ORGANS[p.o];
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot);
          ctx.drawImage(o.c, -Math.round(o.ax), -Math.round(o.ay));
          ctx.restore();
          // shadow on the ground under an airborne chunk
          if (p.z > 3) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#0a0610'; ctx.fillRect(sx - 2, Math.round(p.y - cam.y), 5, 2); ctx.globalAlpha = 1; }
          continue;
        }
        ctx.fillStyle = p.col;
        ctx.fillRect(sx, sy, p.s, p.s);
        if (p.s > 1 && p.vz > 30) ctx.fillRect(sx, sy + p.s, p.s, 1); // stretched while flying up
      }
      ctx.globalAlpha = 1;
    },
  };

  /* ======================================================================
     5.  SMOKE / DUST PUFFS  (chunky, village-owned)
     ====================================================================== */
  const Puffs = {
    list: [], max: 260,
    add(x, y, o) {
      if (this.list.length >= this.max) return;
      o = o || {};
      this.list.push({
        x, y, vx: o.vx === undefined ? rand(-5, 5) : o.vx, vy: o.vy === undefined ? rand(-13, -6) : o.vy,
        s: o.s || rand(2, 4), grow: o.grow || rand(3, 7), life: o.life || rand(1.4, 2.8), t: 0,
        col: o.col || '#6d6a72', a: o.a === undefined ? 0.5 : o.a, seed: randi(0, 255),
      });
    },
    reset() { this.list.length = 0; },
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i]; p.t += dt;
        if (p.t > p.life) { this.list[i] = this.list[this.list.length - 1]; this.list.pop(); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx += Math.sin(p.t * 1.7 + p.y) * 4 * dt; p.vy *= 0.985; p.s += p.grow * dt;
      }
    },
    render(ctx, cam) {
      for (const p of this.list) {
        const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
        if (sx < -24 || sy < -24 || sx > 664 || sy > 384) continue;
        const k = 1 - p.t / p.life;
        const s = Math.max(2, Math.round(p.s)), h = s >> 1;
        ctx.fillStyle = p.col;
        ctx.globalAlpha = p.a * k;
        const h2 = Math.max(1, h * h);
        for (let dy = -h; dy <= h; dy += 2) for (let dx = -h; dx <= h; dx += 2) {
          const d2 = (dx * dx + dy * dy) / h2;
          if (d2 > 1) continue;
          if (hash2(sx + dx + p.seed, sy + dy + p.seed) < 0.12 + d2 * d2 * 0.8) continue;
          ctx.fillRect(sx + dx, sy + dy, 2, 2);
        }
      }
      ctx.globalAlpha = 1;
    },
  };

  // chunky, gradient-free glow (nested translucent diamonds)
  function drawGlow(ctx, x, y, r, col, a) {
    ctx.fillStyle = col;
    for (let i = 3; i >= 1; i--) {
      const rr = Math.round(r * i / 3);
      ctx.globalAlpha = a * (0.16 + (3 - i) * 0.14);
      for (let dy = -rr; dy <= rr; dy += 2) {
        const hw = rr - Math.abs(dy);
        if (hw <= 0) continue;
        ctx.fillRect(x - hw, y + dy, hw * 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ======================================================================
     6.  DESTRUCTIBLE  --  damage states + collapse into physics debris
     ====================================================================== */
  const WOODC = [W.deck3, W.deck2, W.deck1, W.post2, W.post1];

  class Destructible {
    constructor(o) {
      this.kind = o.kind || 'struct';
      this.x = o.x; this.y = o.y;
      this.seed = o.seed || 12345;
      this.draw = o.draw;                       // (ctx, rng, stage) drawing in canvas space
      this.cw = o.cw; this.ch = o.ch;           // canvas size
      this.ox = o.ox; this.oy = o.oy;           // canvas top-left relative to (x,y)
      this.bx = o.bx === undefined ? o.ox : o.bx;   // hit box, relative to (x,y)
      this.by = o.by === undefined ? o.oy : o.by;
      this.bw = o.bw === undefined ? o.cw : o.bw;
      this.bh = o.bh === undefined ? o.ch : o.bh;
      this.maxHp = o.hp || 100; this.hp = this.maxHp;
      this.stage = 0; this.stages = [];
      this.lights = []; this.smoke = null;
      this.debris = []; this.collapsed = false; this.dead = false; this.ruin = null;
      this.leaveRuin = o.leaveRuin !== false;
      this.ruinKeep = o.ruinKeep === undefined ? 14 : o.ruinKeep;
      this.flash = 0; this.shk = 0; this.shkA = 0; this.smokeT = rand(0, 1.5);
      this.waterY = o.waterY === undefined ? this.y : o.waterY;
      this.bobA = o.bob || 0; this.bobPh = rand(0, TAU);
      this.noDebrisFloat = !!o.noDebrisFloat;
      this.bake(0);
    }
    bake(stage) {
      const c = cv(this.cw, this.ch);
      const rng = new SeededRandom(this.seed);
      const res = this.draw(c, rng, stage) || {};
      if (stage === 0) { this.lights = res.lights || []; this.smoke = res.smoke || null; }
      if (stage > 0) damagePass(c, stage / 3, this.seed, stage >= 2 ? (stage - 1) * 2 * (this.seed % 2 ? 1 : -1) : 0);
      if (res.haze) wash(c, res.haze[0], res.haze[1]);
      this.stages[stage] = c.canvas;
      return c.canvas;
    }
    get canvas() { return this.stages[this.stage] || this.stages[0]; }
    contains(x, y, pad) {
      pad = pad || 0;
      return x > this.x + this.bx - pad && x < this.x + this.bx + this.bw + pad &&
        y > this.y + this.by - pad && y < this.y + this.by + this.bh + pad;
    }
    // ---------------------------------------------------------------- damage
    hit(dmg, kx, ky) {
      if (this.collapsed || this.dead) return false;
      this.hp -= dmg;
      this.flash = Math.min(0.2, 0.08 + dmg * 0.004);
      this.shk = 0.3; this.shkA = Math.atan2(ky || 0, kx || 1);
      const g = gg();
      // splinters fly off the struck face
      const hx = this.x + this.bx + this.bw * 0.5 + (kx ? sign(kx) * this.bw * 0.4 : rand(-this.bw * 0.3, this.bw * 0.3));
      const hy = this.y + this.by + this.bh * rand(0.25, 0.8);
      this.spawnSplinters(hx, hy, Math.min(7, 2 + dmg / 8), kx, ky);
      if (g && g.particles) g.particles.sparks(hx, hy, 2, Math.atan2(-(ky || 0), -(kx || 1)), 1.2);
      Puffs.add(hx, hy, { col: '#c9a982', a: 0.4, s: rand(2, 4), life: rand(0.4, 0.9), vy: rand(-18, -6) });
      try { Audio_.noise(0.09, 0.14, 2400, 500); } catch (e) { }
      const ns = clamp(Math.floor((1 - this.hp / this.maxHp) * 4), 0, 3);
      if (this.hp <= 0) { this.collapse(kx, ky); return true; }
      if (ns !== this.stage) { this.stage = ns; if (!this.stages[ns]) this.bake(ns); }
      return false;
    }
    spawnSplinters(x, y, n, kx, ky) {
      const a0 = Math.atan2(ky || -0.4, kx || 0);
      const base = this.y + this.by + this.bh - 2;
      for (let i = 0; i < n; i++) {
        const a = a0 + rand(-1, 1), sp = rand(30, 130);
        this.debris.push({
          x, y: base, z: Math.max(2, base - y), vx: Math.cos(a) * sp, vy: rand(-8, 10), vz: rand(40, 170) - Math.sin(a) * sp * 0.5,
          rot: rand(0, TAU), vr: rand(-12, 12), w: randi(2, 7), h: randi(1, 3), col: pick(WOODC),
          life: rand(5, 11), t: 0, plain: true,
        });
      }
    }
    // -------------------------------------------------------------- collapse
    collapse(kx, ky) {
      if (this.collapsed) return;
      this.collapsed = true;
      const src = this.stages[0];
      const cw = src.width, ch = src.height;
      let data = null;
      try { data = this.stages[0].getContext('2d').getImageData(0, 0, cw, ch).data; } catch (e) { }
      const rng = new SeededRandom(this.seed + 99);
      const ax = Math.atan2(ky || -0.5, kx || 0);
      let count = 0;
      for (let cy = 0; cy < ch; ) {
        const sh = Math.min(ch - cy, 3 + Math.floor(rng.next() * 7));
        for (let cx2 = 0; cx2 < cw; ) {
          const sw = Math.min(cw - cx2, 3 + Math.floor(rng.next() * 9));
          // skip empty cells
          let any = !data;
          if (data) {
            outer: for (let yy = cy; yy < cy + sh; yy += 2) for (let xx = cx2; xx < cx2 + sw; xx += 2) {
              if (data[((yy * cw) + xx) * 4 + 3] > 12) { any = true; break outer; }
            }
          }
          if (any && count < 90) {
            count++;
            // the canvas' vertical axis is HEIGHT here, so a piece from high up
            // is launched upward (z) and falls back down, it does not fly inland
            const wx = this.x + this.ox + cx2 + sw / 2;
            const baseY = this.y + this.by + this.bh;               // the structure's footing
            const hgt = (baseY - (this.y + this.oy + cy + sh / 2));  // how high this piece sat
            const relX = wx - (this.x + this.bx + this.bw * 0.5);
            const spd = rand(0.5, 1.8);
            this.debris.push({
              x: wx, y: baseY - 2 + rand(-3, 3), z: Math.max(0, hgt),
              vx: relX * spd + Math.cos(ax) * rand(10, 55) + rand(-18, 18),
              vy: rand(-10, 14) + Math.sin(ax) * rand(2, 10),
              vz: rand(20, 90) + hgt * rand(0.4, 1.3),
              rot: 0, vr: rand(-9, 9), sx: cx2, sy: cy, sw, sh, src,
              life: rand(14, 26), t: 0,
            });
          }
          cx2 += sw;
        }
        cy += sh;
      }
      Village.onCollapse(this);
      // dust & noise
      const bx = this.x + this.bx + this.bw / 2, by = this.y + this.by + this.bh / 2;
      for (let i = 0; i < 22; i++) Puffs.add(bx + rand(-this.bw / 2, this.bw / 2), by + rand(-this.bh / 2, this.bh / 2),
        { col: pick(['#b8a184', '#9d8a70', '#8d7d68', '#6d6a72']), a: 0.55, s: rand(4, 9), grow: rand(6, 14), life: rand(1.2, 2.6), vy: rand(-22, -4) });
      const g = gg();
      if (g) {
        if (g.shake) g.shake(6);
        if (g.particles) { g.particles.debris(bx, by, 10, WOODC); g.particles.smoke(bx, by, 4, 'rgba(60,50,44,', 7); }
      }
      try { Audio_.noise(0.55, 0.4, 900, 70); Audio_.tone(90, 0.35, 'square', 0.18, -50); } catch (e) { }
      // leave a ruin (stumps of the pillars / the floor)
      if (this.leaveRuin && this.ruinKeep > 0) {
        const c = cv(this.cw, this.ch);
        c.drawImage(src, 0, 0);
        const cut = this.by - this.oy + this.bh - this.ruinKeep;
        c.clearRect(0, 0, this.cw, Math.max(0, cut));
        // splintered top edge
        const r2 = new SeededRandom(this.seed + 5);
        for (let x = 0; x < this.cw; x++) {
          if (r2.next() < 0.5) R(c, x, cut - 1 - Math.floor(r2.next() * 3), 1, 3, r2.next() < 0.5 ? W.deck4 : W.deck0);
        }
        damagePass(c, 0.9, this.seed + 3, 0);
        wash(c, '#2a1a20', 0.25);
        this.ruin = c.canvas;
      } else if (!this.leaveRuin) this.ruin = null;
    }
    // ---------------------------------------------------------------- update
    update(dt, t) {
      if (this.flash > 0) this.flash -= dt * 1.6;
      if (this.shk > 0) this.shk -= dt * 3.2;
      const g = gg();
      const waterY = this.waterY;
      // damaged structures smoulder
      if (!this.collapsed && this.stage >= 2) {
        this.smokeT -= dt;
        if (this.smokeT <= 0) {
          this.smokeT = rand(0.18, 0.5);
          Puffs.add(this.x + this.bx + rand(0, this.bw), this.y + this.by + rand(0, this.bh * 0.5),
            { col: '#3a3036', a: 0.4, s: rand(2, 4), grow: 5, life: rand(1, 2) });
        }
      }
      // debris physics
      for (let i = this.debris.length - 1; i >= 0; i--) {
        const d = this.debris[i];
        d.t += dt;
        if (d.t > d.life) { this.debris.splice(i, 1); continue; }
        if (d.floating) {
          const f = (g && g.ocean) ? g.ocean.flow(d.x, d.y) : { x: 0, y: 0 };
          d.x += (f.x * 0.55 + d.vx) * dt; d.y += (f.y * 0.55 + d.vy) * dt;
          d.vx *= 0.985; d.vy *= 0.985;
          d.rot += d.vr * dt; d.vr *= 0.99;
          d.bob = Math.sin(d.t * 2.3 + d.x * 0.05) * 1.2;
          if (g && g.ocean && Math.random() < dt * 1.4) g.ocean.addFoam(d.x, d.y, 0.05);
          continue;
        }
        if (d.rest) { continue; }
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.z += d.vz * dt; d.vz -= 330 * dt;
        d.rot += d.vr * dt;
        if (d.z <= 0 && d.vz < 0) {
          d.z = 0;
          const inWater = d.y > waterY && !Village.deckAt(d.x, d.y);
          if (inWater && !this.noDebrisFloat) {
            d.floating = true; d.vz = 0; d.vx *= 0.25; d.vy *= 0.25; d.vr *= 0.25;
            d.life = Math.max(d.life, d.t + rand(10, 22));
            if (g && g.ocean) { g.ocean.addFoam(d.x, d.y, 0.3); g.ocean.ripple(d.x, d.y, 9, 26, 0.45); }
            if (g && g.particles && Math.random() < 0.5) g.particles.splash(d.x, d.y, 0.3);
          } else if (Math.abs(d.vz) > 45) {
            d.vz = -d.vz * 0.32; d.vx *= 0.55; d.vy *= 0.55; d.vr *= 0.5;
            Puffs.add(d.x, d.y, { col: '#b8a184', a: 0.3, s: 2, grow: 4, life: 0.5, vy: -6 });
          } else {
            d.vz = 0; d.vx = 0; d.vy = 0; d.rest = true;
            d.rot = Math.round(d.rot / (Math.PI / 8)) * (Math.PI / 8);
          }
        }
      }
      if (this.collapsed && !this.ruin && this.debris.length === 0) this.dead = true;
    }
    // ---------------------------------------------------------------- render
    render(ctx, cam, t, layer) {
      const both = layer === undefined;
      if (both || layer === 0) this.renderBody(ctx, cam, t);
      if (both || layer === 1) this.renderDebris(ctx, cam, t);
    }
    renderBody(ctx, cam, t) {
      const sx0 = this.x - cam.x + this.ox, sy0 = this.y - cam.y + this.oy;
      if (sx0 > 660 || sx0 + this.cw < -20 || sy0 > 400 || sy0 + this.ch < -40) return;
      let sx = Math.round(sx0), sy = Math.round(sy0);
      if (this.shk > 0) { sx += Math.round(Math.cos(this.shkA) * this.shk * 8 * Math.sin(t * 60)); sy += Math.round(this.shk * 3 * Math.sin(t * 47)); }
      if (this.bobA) sy += Math.round(Math.sin(t * 1.7 + this.bobPh) * this.bobA);
      const img = this.collapsed ? this.ruin : this.canvas;
      if (!img) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy);
      if (this.flash > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, this.flash * 3);
        ctx.drawImage(img, sx, sy); ctx.restore(); ctx.globalAlpha = 1;
      }
      if (this.collapsed) return;
      // warm interior light, flickering
      for (const l of this.lights) {
        const fl = 0.72 + 0.16 * Math.sin(t * 2.3 + l.ph) + 0.12 * Math.sin(t * 11.7 + l.ph * 3);
        const lx = sx + l.x, ly = sy + l.y;
        if (l.lantern) {
          drawGlow(ctx, lx + (l.w >> 1), ly + (l.h >> 1), Math.round(9 * fl * l.k), W.glow, 0.85);
          R(ctx, lx + 1, ly + 1, l.w - 2, l.h - 2, fl > 0.78 ? W.glowHot : W.glow);
          R(ctx, lx + 2, ly + 2, l.w - 4, l.h - 3, '#fff8de');
        } else {
          R(ctx, lx, ly, l.w, l.h, fl > 0.8 ? '#ffe6a8' : '#f2c85f');
          R(ctx, lx, ly + l.h - 2, l.w, 2, '#e0a23c');
          R(ctx, lx + 1, ly + 1, l.w - 2, 2, '#fff6d5');
          if (l.mull) {
            R(ctx, lx + ((l.w >> 1) - 1), ly, 1, l.h, '#3a2a20');
            R(ctx, lx, ly + ((l.h >> 1) - 1), l.w, 1, '#3a2a20');
            // somebody moving about inside
            const mv = Math.sin(t * 0.7 + l.ph * 2.1);
            if (mv > 0.72) R(ctx, lx + 1 + Math.round((l.w - 4) * (mv - 0.72) * 3), ly + 3, 3, l.h - 3, '#4a2f28');
          }
          drawGlow(ctx, lx + (l.w >> 1), ly + (l.h >> 1), Math.round(7 * fl * l.k), W.glow, 0.4);
        }
      }
    }
    renderDebris(ctx, cam, t) {
      void t;
      if (!this.debris.length) return;
      ctx.imageSmoothingEnabled = false;
      for (const d of this.debris) {
        const sx = Math.round(d.x - cam.x), sy = Math.round(d.y - cam.y - d.z + (d.bob || 0));
        if (sx < -24 || sy < -24 || sx > 664 || sy > 384) continue;
        const fade = d.life - d.t < 2 ? (d.life - d.t) / 2 : 1;
        ctx.globalAlpha = Math.max(0, fade);
        if (d.floating) { ctx.fillStyle = 'rgba(8,22,52,0.30)'; ctx.fillRect(sx - 4, sy + 2, 9, 3); }
        else if (d.z > 2) { ctx.globalAlpha = 0.22 * fade; ctx.fillStyle = '#0a0812'; ctx.fillRect(sx - 3, Math.round(d.y - cam.y), 7, 2); ctx.globalAlpha = Math.max(0, fade); }
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(d.rot);
        if (d.plain) { ctx.fillStyle = d.col; ctx.fillRect(-(d.w >> 1), -(d.h >> 1), d.w, d.h); }
        else ctx.drawImage(d.src, d.sx, d.sy, d.sw, d.sh, -(d.sw >> 1), -(d.sh >> 1), d.sw, d.sh);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ======================================================================
     7.  VILLAGER  --  procedural skeletal animation, no sprite sheets
     ====================================================================== */
  // two-bone IK: returns the middle joint for a limb from a->b
  let _ikx = 0, _iky = 0;
  function ik(ax, ay, bx, by, l1, l2, flip) {
    let dx = bx - ax, dy = by - ay;
    let d = Math.hypot(dx, dy) || 1e-4;
    const dmax = l1 + l2 - 0.01;
    if (d > dmax) { dx *= dmax / d; dy *= dmax / d; d = dmax; }
    const a = (d * d + l1 * l1 - l2 * l2) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a)) * flip;
    const ux = dx / d, uy = dy / d;
    _ikx = ax + ux * a - uy * h; _iky = ay + uy * a + ux * h;
  }
  // local(forward,up) -> screen, with body rotation (used for ragdolls)
  let _tx = 0, _ty = 0;
  function T(v, lx, ly) {
    const wx = lx * v._face, wy = -ly;
    _tx = v._sx + wx * v._c - wy * v._s;
    _ty = v._sy + wx * v._s + wy * v._c;
  }
  function seg(ctx, v, x0, y0, x1, y1, th, col, ink) {
    T(v, x0, y0); const ax = _tx, ay = _ty;
    T(v, x1, y1); const bx = _tx, by = _ty;
    if (ink) pline(ctx, ax, ay, bx, by, th + 2, ink);
    pline(ctx, ax, ay, bx, by, th, col);
  }
  function dot(ctx, v, x, y, s, col) {
    T(v, x, y);
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(_tx) - (s >> 1), Math.round(_ty) - (s >> 1), s, s);
  }

  const GLYPHS = {
    '!': ['.1.', '.1.', '.1.', '...', '.1.'],
    '?': ['111', '..1', '.11', '...', '.1.'],
    ':': ['...', '.1.', '...', '.1.', '...'],
    'o': ['.1.', '1.1', '1.1', '1.1', '.1.'],
    '~': ['...', '11.', '..1', '...', '...'],
    'x': ['1.1', '.1.', '1.1', '...', '...'],
    '-': ['...', '...', '111', '...', '...'],
  };
  function bubble(ctx, x, y, str, col, tailDir) {
    const gw = 4, w = str.length * gw + 3, h = 9;
    x = Math.round(x - w / 2); y = Math.round(y - h);
    R(ctx, x - 1, y - 1, w + 2, h + 2, W.ink);
    R(ctx, x, y, w, h, col || '#f4efe0');
    R(ctx, x + 1, y + 1, w - 2, 1, '#ffffff');
    R(ctx, x + (tailDir > 0 ? w - 4 : 2), y + h, 2, 2, col || '#f4efe0');
    R(ctx, x + (tailDir > 0 ? w - 4 : 2), y + h + 2, 1, 1, W.ink);
    for (let i = 0; i < str.length; i++) {
      const g = GLYPHS[str[i]]; if (!g) continue;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++)
        if (g[r][c] === '1') R(ctx, x + 2 + i * gw + c, y + 2 + r, 1, 1, '#241a22');
    }
  }

  let _shoutT = 0;

  class Villager {
    constructor(x, y, opts) {
      opts = opts || {};
      this.x = x; this.y = y; this.z = 0; this.vz = 0;
      this.home = { x, y };
      this.lane = opts.lane || null;                 // {x0,y0,x1,y1}
      this.role = opts.role || 'walk';
      this.face = opts.face || (Math.random() < 0.5 ? -1 : 1);
      this.dead = false; this.rest = false; this.gone = false;
      this.panicked = false; this.alerted = false; this.noticeDone = false;
      this.t = rand(0, 10); this.gait = rand(0, TAU); this.stateT = rand(0.3, 2.5);
      this.speed = rand(15, 24) * (opts.speed || 1);
      this.rot = 0; this.vr = 0;
      this.speech = null;
      this.partner = null;
      this.onJetty = !!opts.onJetty;
      this.waterY = opts.waterY === undefined ? y + 40 : opts.waterY;
      // ---- body build (variation so a crowd reads as a crowd)
      this.legL = rand(4, 5.4); this.legL2 = this.legL * rand(0.9, 1.1);
      this.torso = rand(7, 9.5);
      this.armL = rand(3.6, 4.6); this.armL2 = this.armL * rand(0.9, 1.05);
      this.head = randi(5, 6);
      this.bulk = Math.random() < 0.3 ? 8 : Math.random() < 0.55 ? 7 : 6;
      this.skin = opts.skin || pick(SKIN);
      this.shirt = opts.shirt || pick(SHIRT);
      this.shirt2 = Math.random() < 0.45 ? pick(SHIRT) : shade(this.shirt, 0.78);
      this.pants = pick(PANTS);
      this.shirtLt = shade(this.shirt, 1.32); this.pantsLt = shade(this.pants, 1.3);
      this.boots = pick(['#5a3c28', '#4a3a42', '#6b4a30', '#3e3a30']);
      this.hair = pick(['#2b1f1a', '#4a3020', '#6b5030', '#8a7a60', '#7a2a1a', '#1c1418']);
      this.hat = randi(0, 5); this.hatCol = pick(HATCOL);
      this.beard = Math.random() < 0.4 ? this.hair : null;
      this.apron = Math.random() < 0.35;
      this.item = opts.item || null;
      this.shirtDk = shade(this.shirt, 0.66); this.shirt2Dk = shade(this.shirt2, 0.66);
      this.pantsDk = shade(this.pants, 0.66); this.skinDk = shade(this.skin, 0.72);
      this.bootsDk = shade(this.boots, 0.7);
      this.state = 'idle';
      this.tx = x; this.ty = y;
      this.bob = 0; this.lean = 0; this.crouch = 0;
      this.workPh = rand(0, TAU);
      this.fishLine = 0; this.catchT = 0;
      this._sx = 0; this._sy = 0; this._c = 1; this._s = 0; this._face = this.face;
      if (this.role === 'fish' || this.role === 'hammer' || this.role === 'chat' || this.role === 'idle') this.setState(this.role === 'chat' ? 'idle' : this.role);
      else this.setState('idle');
    }
    // ------------------------------------------------------------ behaviour
    setState(s) {
      this.state = s; this.stateT = 0;
      if (s === 'walk') this.pickWalkTarget();
      if (s === 'fish') { this.face = this.onJetty ? this.face : 1; this.fishLine = 0; }
    }
    say(str, dur, col) { this.speech = { s: str, t: 0, dur: dur || 1.4, col: col }; }
    laneAt(u) {
      const L = this.lane;
      if (!L) return { x: this.home.x, y: this.home.y };
      return { x: lerp(L.x0, L.x1, u), y: lerp(L.y0, L.y1, u) };
    }
    pickWalkTarget() {
      const L = this.lane;
      if (!L) { this.tx = this.home.x + rand(-30, 30); this.ty = this.home.y; return; }
      const p = this.laneAt(Math.random());
      this.tx = p.x; this.ty = p.y;
    }
    panic() {
      if (this.dead || this.panicked) return;
      this.panicked = true; this.alerted = true;
      if (this.item) { this.dropItem(); }
      this.setState('panic');
      this.say('!', 1.1, '#ffd6d6');
      this.speed = rand(42, 62);
      const g = gg(), p = g && g.player;
      const away = p ? sign(this.x - p.x) : (Math.random() < 0.5 ? -1 : 1);
      if (this.lane) {
        const endU = away > 0 ? (this.lane.x1 > this.lane.x0 ? 1 : 0) : (this.lane.x1 > this.lane.x0 ? 0 : 1);
        const e = this.laneAt(endU);
        this.tx = e.x + away * rand(20, 120); this.ty = e.y;
      } else { this.tx = this.x + away * rand(80, 200); this.ty = this.y; }
      if (_shoutT <= 0) { _shoutT = 0.22; try { Audio_.tone(rand(360, 620), 0.1, 'square', 0.05, rand(-180, 220)); } catch (e) { } }
    }
    dropItem() {
      const it = this.item; this.item = null;
      if (it === 'crate') Puffs.add(this.x + this.face * 4, this.y - 2, { col: '#b8a184', a: 0.45, s: 3, grow: 4, life: 0.5, vy: -8 });
    }
    fall() {
      if (this.dead || this.gone || this.state === 'fall') return;
      this.panicked = true; this.alerted = true; this.item = null;
      this.lane = null; this.state = 'fall'; this.stateT = 0;
      this.vy = -rand(10, 40); this.vr = rand(-5, 5); this.z = Math.max(this.z, 2); this.vz = rand(10, 60);
      this.say('!', 1.2, '#ffd9d9');
      if (_shoutT <= 0) { _shoutT = 0.2; try { Audio_.tone(rand(400, 700), 0.2, 'square', 0.05, -320); } catch (e) { } }
    }
    notice() {
      if (this.dead || this.panicked || this.state === 'notice') return;
      this.alerted = true; this.setState('notice'); this.say('!', 1.3, '#fff0c0');
      if (_shoutT <= 0) { _shoutT = 0.3; try { Audio_.tone(rand(420, 700), 0.08, 'square', 0.045, 190); } catch (e) { } }
    }
    kill(dirAngle, power) {
      if (this.dead) return;
      power = power || 1;
      this.dead = true; this.rest = false; this.state = 'dead';
      this.speech = null; this.item = null;
      const a = dirAngle === undefined ? rand(-TAU / 2, 0) : dirAngle;
      const chestH = this.legL + this.legL2 + this.torso * 0.55;
      const sp = rand(45, 110) * power;
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp * 0.22;
      this.vz = rand(50, 130) * power - Math.sin(a) * sp * 0.5; this.z = Math.max(this.z, 1);
      this.vr = rand(-11, 11) * power;
      Gore.burst(this.x, this.y, 1.5 * power, a, chestH);
      Gore.mist(this.x, this.y, 3 + Math.round(power * 2), chestH);
      Gore.sprayFrom(this, 0, chestH, a + rand(-0.4, 0.4), 0.8 * power);
      if (power > 1.7) { // gibbed outright
        this.gibbed = true;
        Gore.gib(this.x, this.y, 6 * power, a, [this.shirt, this.pants, this.skin, this.shirt2], chestH);
        Gore.burst(this.x, this.y, 2.4 * power, undefined, chestH);
      }
      const g = gg();
      if (g) { if (g.shake) g.shake(power > 1.6 ? 5 : 2.5); }
      try { Audio_.tone(rand(220, 340), 0.16, 'sawtooth', 0.09, -200); Audio_.noise(0.16, 0.16, 900, 160); } catch (e) { }
      // everyone nearby loses it
      Village.panicNear(this.x, this.y, 170);
    }
    updateDead(dt) {
      this.t += dt;
      if (this.gibbed) { this.gone = true; return; }
      if (this.rest) {
        this.restT = (this.restT || 0) + dt;
        if (this.restT < 6 && Math.random() < dt * 1.1) Gore.splat(this.x + rand(-6, 6), this.y + rand(-2, 3), 0.3);
        return;
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.z += this.vz * dt; this.vz -= 300 * dt;
      this.vx *= (1 - dt * 0.9); this.vy *= (1 - dt * 0.9);
      this.rot += this.vr * dt;
      if (Math.random() < dt * 7) Gore.burst(this.x + rand(-2, 2), this.y, 0.14, undefined, this.z + rand(3, 10));
      if (this.z <= 0 && this.vz < 0) {
        this.z = 0;
        const g = gg();
        const inWater = this.y > this.waterY && !Village.deckAt(this.x, this.y);
        if (inWater) {
          if (g) {
            if (g.particles) { g.particles.splash(this.x, this.y, 1.6); }
            if (g.ocean) { g.ocean.splatBlood(this.x, this.y, 4, 22); g.ocean.addBlood(this.x, this.y, 1.2); }
          }
          try { Audio_.splash(1.2); } catch (e) { }
          this.gone = true; return;
        }
        if (Math.abs(this.vz) > 60) { this.vz = -this.vz * 0.3; this.vx *= 0.5; this.vy *= 0.5; this.vr *= 0.4; Gore.burst(this.x, this.y - 2, 0.7); }
        else {
          this.vz = 0; this.vx = 0; this.vy = 0; this.rest = true;
          this.rot = Math.round(this.rot / (Math.PI / 2)) * (Math.PI / 2) + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          Gore.splat(this.x, this.y, 1.4);
          Gore.burst(this.x, this.y - 3, 0.8);
        }
      }
    }
    update(dt, t) {
      if (_shoutT > 0) _shoutT -= dt;
      if (this.gone) return;
      if (this.dead) { this.updateDead(dt); return; }
      this.t += dt; this.stateT += dt;
      if (this.speech) { this.speech.t += dt; if (this.speech.t > this.speech.dur) this.speech = null; }
      const g = gg();
      const p = g && g.player && !g.player.dead ? g.player : null;
      // --- notice / panic logic
      if (p && !this.panicked) {
        const d = dist(this.x, this.y, p.x, p.y);
        if (!this.alerted && d < 210 && Math.random() < dt * 2.5) this.notice();
        else if (this.alerted && d < 110 && this.state !== 'notice') this.panic();
      }
      switch (this.state) {
        case 'idle': {
          this.moveStop(dt);
          if (this.stateT > 1.4 + (this.t % 3)) {
            const r = Math.random();
            if (this.role === 'fish') this.setState('fish');
            else if (this.role === 'hammer' && r < 0.6) this.setState('hammer');
            else if (this.role === 'haul' && r < 0.7) { this.item = 'crate'; this.setState('walk'); }
            else this.setState('walk');
          }
          break;
        }
        case 'walk': {
          const arrived = this.moveTo(this.tx, this.ty, dt, this.speed);
          this.gait += dt * this.speed * 0.42;
          if (arrived) {
            if (this.item === 'crate' && Math.random() < 0.6) { this.item = null; this.setState('idle'); this.say(':', 0.8); }
            else this.setState(Math.random() < 0.35 && this.role !== 'walk' ? this.role : 'idle');
          }
          break;
        }
        case 'fish': {
          this.moveStop(dt);
          this.item = 'rod';
          this.fishLine = Math.min(1, this.fishLine + dt * 1.6);
          if (this.catchT > 0) { this.catchT -= dt; if (this.catchT <= 0) this.say('o', 1, '#dff0ff'); }
          else if (Math.random() < dt * 0.06) { this.catchT = 0.9; }
          if (this.stateT > 16) { this.item = null; this.setState('walk'); }
          break;
        }
        case 'hammer': {
          this.moveStop(dt);
          this.item = 'hammer';
          this.workPh += dt * 6.2;
          if (Math.sin(this.workPh) > 0.985) {
            Puffs.add(this.x + this.face * 7, this.y - 3, { col: '#c9a982', a: 0.35, s: 2, grow: 3, life: 0.35, vy: -12 });
            if (Math.random() < 0.5) { const gp = gg(); if (gp && gp.particles) gp.particles.sparks(this.x + this.face * 7, this.y - 3, 1, -1.2, 1); }
          }
          if (this.stateT > 9) { this.item = null; this.setState('walk'); }
          break;
        }
        case 'chat': {
          this.moveStop(dt);
          const o = this.partner;
          if (!o || o.dead || o.panicked || o.state !== 'chat') { this.setState('idle'); break; }
          this.face = sign(o.x - this.x) || this.face;
          if (!this.speech && Math.random() < dt * 0.9 && (this.chatLead || !o.speech)) this.say(pick([':', '~', '-', 'o']), rand(0.7, 1.4));
          if (this.stateT > 7) this.setState('idle');
          break;
        }
        case 'notice': {
          this.moveStop(dt);
          if (p) this.face = sign(p.x - this.x) || this.face;
          if (this.stateT > 1.25) {
            this.noticeDone = true;
            if (Village.hostile || (p && dist(this.x, this.y, p.x, p.y) < 130)) this.panic();
            else this.setState('watch');
          }
          break;
        }
        case 'watch': {
          this.moveStop(dt);
          if (p) this.face = sign(p.x - this.x) || this.face;
          if (Village.hostile) this.panic();
          else if (this.stateT > rand(2, 4)) { this.alerted = false; this.setState('idle'); }
          break;
        }
        case 'panic': {
          this.gait += dt * this.speed * 0.36;
          const arrived = this.moveTo(this.tx, this.ty, dt, this.speed);
          if (!this.speech && Math.random() < dt * 0.7) this.say(pick(['!', '?', '!']), rand(0.6, 1.2), '#ffd9d9');
          if (arrived) {
            // off the deck: up the beach, or into the drink
            if (this.y > this.waterY - 4 || (this.onJetty && Math.random() < 0.45)) { this.setState('swim'); this.z = 0; }
            else if (Math.random() < 0.45) { this.tx = this.x + rand(-60, 60); this.ty = this.y - rand(40, 110); }
            else this.setState('cower');
          }
          break;
        }
        case 'cower': {
          this.moveStop(dt);
          this.crouch = Math.min(1, this.crouch + dt * 4);
          if (!this.speech && Math.random() < dt * 0.35) this.say('?', 1, '#e8e0e8');
          if (this.stateT > rand(3, 7)) { this.crouch = 0; this.setState('panic'); }
          break;
        }
        case 'fall': {
          this.vy = (this.vy || 0) + 260 * dt;
          this.y += this.vy * dt;
          this.x += (this.fvx || (this.fvx = rand(-14, 14))) * dt;
          this.rot += this.vr * dt;
          this.z = Math.max(0, this.z - 120 * dt);
          if (this.y >= this.waterY) {
            const g3 = gg();
            if (g3 && g3.particles) g3.particles.splash(this.x, this.y, 1.1);
            try { Audio_.splash(0.9); } catch (e) { }
            this.rot = 0; this.vy = 0; this.z = 0;
            this.setState('swim');
          }
          break;
        }
        case 'swim': {
          const g2 = gg();
          this.crouch = 0;
          const f = (g2 && g2.ocean) ? g2.ocean.flow(this.x, this.y) : { x: 0, y: 0 };
          this.x += (f.x * 0.25 + this.face * 5 + Math.sin(this.t * 3) * 3) * dt;
          this.y += (f.y * 0.25 - 15) * dt;          // strike out for the shore
          this.gait += dt * 7;
          if (g2 && g2.ocean && Math.random() < dt * 6) g2.ocean.addFoam(this.x + rand(-5, 5), this.y + rand(-3, 3), 0.18);
          if (!this.speech && Math.random() < dt * 0.5) this.say(pick(['!', 'x']), 1, '#d6e8ff');
          // out of the water once they reach the sand
          if (this.y < Village.shoreY - 12) { this.panicked = true; this.lane = null; this.setState('panic'); this.tx = this.x + rand(-40, 40); this.ty = this.y - rand(40, 90); }
          break;
        }
      }
      // gravity for anybody knocked into the air
      if (this.z > 0 || this.vz !== 0) {
        this.z += this.vz * dt; this.vz -= 300 * dt;
        if (this.z <= 0) { this.z = 0; this.vz = 0; }
      }
    }
    moveStop(dt) { this.gait = lerp(this.gait, Math.round(this.gait / Math.PI) * Math.PI, 1 - Math.pow(0.001, dt)); }
    moveTo(tx, ty, dt, sp) {
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      if (d < 2) return true;
      const st = Math.min(d, sp * dt);
      this.x += dx / d * st; this.y += dy / d * st;
      if (Math.abs(dx) > 1.2) this.face = sign(dx);
      return false;
    }
    // -------------------------------------------------------------- render
    render(ctx, cam, t) {
      if (this.gone) return;
      const sx = this.x - cam.x, sy = this.y - cam.y - this.z;
      if (sx < -36 || sx > 676 || sy < -48 || sy > 412) return;
      ctx.imageSmoothingEnabled = false;
      const swim = this.state === 'swim';
      this._sx = Math.round(sx); this._sy = Math.round(sy);
      if (swim) {
        // only the head and shoulders stay above the surface
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 640, Math.round(sy)); ctx.clip();
        this._sy = Math.round(sy) + 11;
      }
      this._face = this.face;
      this._c = Math.cos(this.rot); this._s = Math.sin(this.rot);
      const ink = W.ink;

      // ---- pose ------------------------------------------------------
      const walking = (this.state === 'walk' || this.state === 'panic');
      const run = this.state === 'panic';
      const g = this.gait;
      const crouch = this.crouch * 3;
      let bob = walking ? Math.abs(Math.sin(g)) * (run ? 1.7 : 1.1) : Math.sin(this.t * 1.7) * 0.35;
      if (swim) bob = Math.sin(this.t * 6) * 1.2;
      const hipY = this.legL + this.legL2 - crouch + bob - (swim ? 6 : 0);
      const torsoH = this.torso - crouch * 0.6;
      let lean = walking ? (run ? 3.2 : 1.2) : 0;
      if (this.item === 'crate') lean = -1.6;
      if (this.state === 'hammer') lean = 2.2 + Math.sin(this.workPh) * 1.4;
      if (this.crouch > 0) lean = 2.6;
      if (swim) lean = 4.5;
      const neckX = lean * 0.55, neckY = hipY + torsoH;
      const headY = neckY + this.head * 0.62;
      const headX = neckX * 1.25 + (this.state === 'notice' ? 1 : 0);

      // legs
      const stride = run ? 5.2 : 3.4, lift = run ? 3.4 : 2.2;
      let f1x, f1y, f2x, f2y;
      if (swim) {
        f1x = -2 + Math.sin(g) * 2.5; f1y = -1 + Math.cos(g) * 1.5;
        f2x = -3 + Math.sin(g + 2) * 2.5; f2y = -2 + Math.cos(g + 2) * 1.5;
      } else if (walking) {
        f1x = 1 + Math.sin(g) * stride; f1y = Math.max(0, Math.cos(g)) * lift;
        f2x = -1 + Math.sin(g + Math.PI) * stride; f2y = Math.max(0, Math.cos(g + Math.PI)) * lift;
      } else if (this.state === 'cower') { f1x = 0.4; f1y = 0; f2x = -2.2; f2y = 0; }
      else { f1x = 1.6; f1y = 0; f2x = -1.9; f2y = 0; }
      const legThick = this.bulk > 7 ? 4 : 3;
      ik(0, hipY, f1x, f1y, this.legL, this.legL2, 1);
      const k1x = _ikx, k1y = _iky;
      ik(0, hipY, f2x, f2y, this.legL, this.legL2, 1);
      const k2x = _ikx, k2y = _iky;

      // arms
      const shY = neckY - 1.2, shX = neckX + 0.8;
      let h1x, h1y, h2x, h2y;
      const arm = this.armL + this.armL2;
      if (this.item === 'crate') { h1x = 5; h1y = hipY + torsoH * 0.45; h2x = 4.6; h2y = hipY + torsoH * 0.5; }
      else if (this.item === 'rod') { h1x = 3.6; h1y = shY - 2.6; h2x = 1.6; h2y = shY - 4.2; }
      else if (this.state === 'hammer') {
        const sw = Math.sin(this.workPh);
        h1x = 5 + sw * 2.5; h1y = shY - 4 + (sw > 0 ? sw * 7 : sw * 2);
        h2x = 3.2; h2y = shY - 5.5;
      } else if (this.state === 'notice') {
        h1x = arm * 0.98; h1y = shY + 1.5 + Math.sin(this.t * 9) * 0.6; h2x = -1.5; h2y = shY - 5;
      } else if (this.state === 'panic' || swim) {
        h1x = Math.sin(this.t * 13) * 2.5 - 1; h1y = shY + 4.5 + Math.cos(this.t * 13) * 1.6;
        h2x = Math.sin(this.t * 13 + 2) * 2.5 - 1.5; h2y = shY + 4.2 + Math.cos(this.t * 13 + 2) * 1.6;
      } else if (this.state === 'cower') { h1x = 1.5; h1y = shY + 2.2; h2x = 0.5; h2y = shY + 2.6; }
      else if (this.state === 'chat') {
        const q = Math.sin(this.t * 3.4 + this.workPh);
        h1x = 3 + q * 1.6; h1y = shY - 3 + Math.cos(this.t * 3.4) * 1.8; h2x = -1.6; h2y = shY - 5.5;
      } else {
        const swA = walking ? Math.sin(g + Math.PI) * (run ? 3.6 : 2.4) : Math.sin(this.t * 1.5) * 0.5;
        const swB = walking ? Math.sin(g) * (run ? 3.6 : 2.4) : Math.sin(this.t * 1.5 + 1) * 0.5;
        h1x = swA + 1.6; h1y = shY - arm * 0.9;
        h2x = swB - 1.4; h2y = shY - arm * 0.9;
      }
      ik(shX - 1.8, shY, h2x, h2y, this.armL, this.armL2, -1);
      const e2x = _ikx, e2y = _iky;
      ik(shX, shY, h1x, h1y, this.armL, this.armL2, -1);
      const e1x = _ikx, e1y = _iky;

      // ---- draw: far side first --------------------------------------
      // contact shadow so they sit on the planks
      if (!this.dead && !swim && this.z < 6) {
        ctx.fillStyle = 'rgba(18,8,18,0.26)';
        ctx.fillRect(this._sx - 4, this._sy - 1, 9, 2);
        ctx.fillRect(this._sx - 2, this._sy - 2, 5, 1);
      }
      // far leg
      seg(ctx, this, -1.3, hipY, k2x, k2y, legThick, this.pantsDk, ink);
      seg(ctx, this, k2x, k2y, f2x, f2y, legThick - 1, this.pantsDk, ink);
      seg(ctx, this, f2x - 0.8, f2y + 0.6, f2x + 1.2, f2y + 0.6, 2, this.bootsDk, ink);
      // far arm
      seg(ctx, this, shX - 1.8, shY, e2x, e2y, 3, this.shirtDk, ink);
      seg(ctx, this, e2x, e2y, h2x, h2y, 2, this.skinDk, ink);
      // near leg
      seg(ctx, this, 1.1, hipY, k1x, k1y, legThick, this.pants, ink);
      seg(ctx, this, k1x, k1y, f1x, f1y, legThick - 1, this.pants, ink);
      seg(ctx, this, k1x + 0.9, k1y, f1x + 0.9, f1y, 1, this.pantsLt);
      seg(ctx, this, f1x - 0.8, f1y + 0.6, f1x + 1.5, f1y + 0.6, 2, this.boots, ink);
      dot(ctx, this, f1x + 1.3, f1y + 0.6, 1, shade(this.boots, 1.45));
      // torso
      seg(ctx, this, 0, hipY - 0.5, neckX, neckY, this.bulk, this.shirt, ink);
      const bh2 = this.bulk * 0.5 - 0.4;
      seg(ctx, this, bh2, hipY, neckX + bh2, neckY - 0.8, 1, this.shirtLt);     // lit front edge
      seg(ctx, this, -bh2, hipY, neckX - bh2, neckY - 0.8, 1, this.shirtDk);    // shaded back
      if (this.apron) {
        seg(ctx, this, 0.4, hipY + 0.4, neckX * 0.7, hipY + torsoH * 0.6, this.bulk - 2, '#cfc6ad');
        seg(ctx, this, 0.4, hipY + torsoH * 0.6, neckX * 0.7, hipY + torsoH * 0.62, this.bulk - 3, '#a89a80');
      } else if (this.bulk > 5) {
        seg(ctx, this, neckX * 0.6, hipY + torsoH * 0.62, neckX, neckY - 1, this.bulk - 3, this.shirt2);
      }
      // belt
      seg(ctx, this, -0.6, hipY + 0.7, 0.6, hipY + 0.7, this.bulk - 1, '#40291f');
      dot(ctx, this, 0.6, hipY + 0.7, 1, W.met3);
      // collar
      seg(ctx, this, neckX - 1, neckY - 0.6, neckX + 1, neckY - 0.6, 2, this.shirtLt);
      // neck
      seg(ctx, this, neckX, neckY - 1, headX, headY - this.head * 0.45, 2, this.skinDk, ink);
      // head
      seg(ctx, this, headX, headY, headX, headY, this.head + 2, ink);
      seg(ctx, this, headX, headY, headX, headY, this.head, this.skin);
      // hair / ear
      seg(ctx, this, headX - 1.4, headY + this.head * 0.34, headX + 0.8, headY + this.head * 0.34, this.head - 1, this.hair);
      dot(ctx, this, headX - this.head * 0.45, headY, 1, this.skinDk);
      // face
      const blink = (Math.sin(this.t * 1.3 + this.workPh) > 0.985) ? 0 : 1;
      if (blink) {
        dot(ctx, this, headX + this.head * 0.3, headY + 0.5, 1, '#241a22');
        if (this.head > 5) dot(ctx, this, headX - this.head * 0.08, headY + 0.5, 1, '#241a22');
      } else dot(ctx, this, headX + this.head * 0.22, headY + 0.5, 1, this.skinDk);
      dot(ctx, this, headX + this.head * 0.52, headY - 0.1, 1, this.skinDk);   // nose
      if (this.beard) seg(ctx, this, headX - 0.5, headY - this.head * 0.34, headX + this.head * 0.3, headY - this.head * 0.34, 3, this.beard);
      // open mouth when shouting
      if (this.speech || this.state === 'panic') dot(ctx, this, headX + this.head * 0.3, headY - this.head * 0.28, 2, '#5e2a2a');
      // hat
      this.drawHat(ctx, headX, headY, ink);
      // near arm (over the torso)
      seg(ctx, this, shX, shY, e1x, e1y, 3, this.shirt, ink);
      seg(ctx, this, shX, shY - 0.6, e1x, e1y - 0.4, 1, this.shirtLt);
      seg(ctx, this, e1x, e1y, h1x, h1y, 2, this.skin, ink);
      dot(ctx, this, h1x, h1y, 2, this.skin);
      // ---- item -------------------------------------------------------
      this.drawItem(ctx, cam, t, h1x, h1y, h2x, h2y, ink);
      // ---- speech -----------------------------------------------------
      if (this.speech && !this.dead) {
        T(this, headX, headY + this.head * 0.8 + 2);
        bubble(ctx, _tx, Math.min(_ty - 2, swim ? sy - 12 : 1e9), this.speech.s, this.speech.col, this.face);
      }
      // ---- water bits --------------------------------------------------
      if (swim) {
        ctx.restore();
        const wsx = Math.round(sx), wsy = Math.round(sy);
        ctx.fillStyle = 'rgba(235,250,255,0.8)';
        ctx.fillRect(wsx - 7, wsy, 15, 1);
        ctx.fillRect(wsx - 9 + Math.round(Math.sin(t * 6) * 2), wsy + 1, 5, 1);
        ctx.fillRect(wsx + 5, wsy + 1, 5, 1);
        ctx.fillStyle = 'rgba(200,236,255,0.5)';
        ctx.fillRect(wsx - 11 + Math.round(Math.sin(t * 4 + 1) * 3), wsy + 2, 7, 1);
      }
    }
    drawHat(ctx, hx, hy, ink) {
      const r = this.head * 0.5;          // head half-height; the crown sits at hy + r
      switch (this.hat) {
        case 1: // knitted beanie
          seg(ctx, this, hx - r * 0.7, hy + r * 1.05, hx + r * 0.7, hy + r * 1.05, 4, ink);
          seg(ctx, this, hx - r * 0.7, hy + r * 1.0, hx + r * 0.7, hy + r * 1.0, 2, this.hatCol);
          seg(ctx, this, hx - r, hy + r * 0.72, hx + r, hy + r * 0.72, 3, ink);
          seg(ctx, this, hx - r, hy + r * 0.7, hx + r, hy + r * 0.7, 1, shade(this.hatCol, 1.25));
          break;
        case 2: // wide straw brim
          seg(ctx, this, hx - r * 2, hy + r * 0.85, hx + r * 2, hy + r * 0.85, 3, ink);
          seg(ctx, this, hx - r * 1.9, hy + r * 0.8, hx + r * 1.9, hy + r * 0.8, 1, '#dcb872');
          seg(ctx, this, hx - r * 0.7, hy + r * 1.45, hx + r * 0.7, hy + r * 1.45, 4, ink);
          seg(ctx, this, hx - r * 0.7, hy + r * 1.4, hx + r * 0.7, hy + r * 1.4, 2, '#eccf90');
          seg(ctx, this, hx - r * 0.7, hy + r * 1.05, hx + r * 0.7, hy + r * 1.05, 1, '#a8813f');
          break;
        case 3: // cap with a peak
          seg(ctx, this, hx - r * 0.8, hy + r * 1.2, hx + r * 0.8, hy + r * 1.2, 4, ink);
          seg(ctx, this, hx - r * 0.8, hy + r * 1.15, hx + r * 0.8, hy + r * 1.15, 2, this.hatCol);
          seg(ctx, this, hx + r * 0.4, hy + r * 0.85, hx + r * 1.9, hy + r * 0.85, 2, ink);
          seg(ctx, this, hx + r * 0.4, hy + r * 0.8, hx + r * 1.8, hy + r * 0.8, 1, shade(this.hatCol, 0.75));
          break;
        case 4: // bandana with a knot tail
          seg(ctx, this, hx - r, hy + r * 0.95, hx + r, hy + r * 0.95, 3, ink);
          seg(ctx, this, hx - r, hy + r * 0.9, hx + r, hy + r * 0.9, 2, this.hatCol);
          seg(ctx, this, hx - r * 0.9, hy + r * 0.8, hx - r * 1.9, hy + r * 0.25, 2, ink);
          seg(ctx, this, hx - r * 0.9, hy + r * 0.75, hx - r * 1.8, hy + r * 0.25, 1, shade(this.hatCol, 1.2));
          break;
        case 5: // sou'wester
          seg(ctx, this, hx - r * 2.1, hy + r * 0.75, hx + r * 1.5, hy + r * 0.95, 3, ink);
          seg(ctx, this, hx - r * 2, hy + r * 0.7, hx + r * 1.4, hy + r * 0.9, 1, '#e0a02a');
          seg(ctx, this, hx - r * 0.6, hy + r * 1.45, hx + r * 0.5, hy + r * 1.45, 5, ink);
          seg(ctx, this, hx - r * 0.6, hy + r * 1.4, hx + r * 0.5, hy + r * 1.4, 3, '#f0b23a');
          seg(ctx, this, hx - r * 0.6, hy + r * 1.05, hx + r * 0.5, hy + r * 1.05, 1, '#b8791f');
          break;
        default: // bare head, a bit more hair
          seg(ctx, this, hx - r * 0.85, hy + r * 1.0, hx + r * 0.85, hy + r * 1.0, 3, this.hair);
          seg(ctx, this, hx - r * 0.85, hy + r * 0.82, hx + r * 0.3, hy + r * 0.82, 1, shade(this.hair, 1.35));
          break;
      }
    }
    drawItem(ctx, cam, t, h1x, h1y, h2x, h2y, ink) {
      void h2x; void h2y;
      if (!this.item) return;
      if (this.item === 'rod') {
        const bend = this.catchT > 0 ? 1 : 0;
        const tipX = h1x + 13 - bend * 3, tipY = h1y + 9 - bend * 5;
        seg(ctx, this, h1x - 3, h1y - 2, tipX, tipY, 3, ink);
        seg(ctx, this, h1x - 3, h1y - 2, tipX, tipY, 1, '#6b4a2a');
        dot(ctx, this, h1x + 1, h1y, 2, W.met2);
        // line down to the water, with a float
        T(this, tipX, tipY);
        const lx = Math.round(_tx), ly = Math.round(_ty);
        const wy = Math.round(this.waterY - cam.y);
        if (wy > ly) {
          ctx.fillStyle = 'rgba(232,244,255,0.30)';
          const drift = Math.sin(t * 1.3 + this.workPh) * 3;
          for (let y = ly; y < wy; y += 3) ctx.fillRect(Math.round(lx + drift * (y - ly) / Math.max(1, wy - ly)), y, 1, 1);
          const fx = Math.round(lx + drift), fy = wy + Math.round(Math.sin(t * 3 + this.workPh) * 1.5);
          if (this.catchT > 0) {
            R(ctx, fx - 1, fy - 3, 3, 3, W.ink); R(ctx, fx - 1, fy - 3, 3, 1, '#ffffff'); R(ctx, fx - 1, fy - 2, 3, 1, '#e0322e');
            ctx.fillStyle = 'rgba(235,250,255,0.8)'; ctx.fillRect(fx - 4, fy, 9, 1);
          } else {
            R(ctx, fx - 1, fy - 2, 3, 3, W.ink); R(ctx, fx - 1, fy - 2, 3, 1, '#ffffff'); R(ctx, fx - 1, fy - 1, 3, 1, '#e0322e');
          }
        }
      } else if (this.item === 'crate') {
        T(this, h1x + 2.5, h1y + 2);
        ctx.drawImage(P.crateSm.c, Math.round(_tx - P.crateSm.ax), Math.round(_ty - P.crateSm.ay));
      } else if (this.item === 'hammer') {
        const a = Math.sin(this.workPh);
        const ex = h1x + 5, ey = h1y + (a > 0 ? 3 : -2);
        seg(ctx, this, h1x, h1y, ex, ey, 3, ink);
        seg(ctx, this, h1x, h1y, ex, ey, 1, '#7a5230');
        seg(ctx, this, ex - 0.6, ey + 1.4, ex + 0.6, ey - 1.4, 4, ink);
        seg(ctx, this, ex - 0.4, ey + 1.2, ex + 0.4, ey - 1.2, 2, W.met2);
      } else if (this.item === 'fish') {
        T(this, h1x + 2, h1y - 1);
        ctx.drawImage(P.fish.c, Math.round(_tx - P.fish.ax), Math.round(_ty - P.fish.ay));
      } else if (this.item === 'net') {
        seg(ctx, this, h1x, h1y, h1x + 3, h1y - 6, 2, ink);
        T(this, h1x + 3, h1y - 7);
        ctx.fillStyle = W.net1;
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if ((i + j) % 2 === 0 && i * i + j * j < 10) ctx.fillRect(Math.round(_tx) + i, Math.round(_ty) + j, 1, 1);
      }
      void ink;
    }
  }

  // extra gore entry point used by Villager.kill (clothing / meat chunks)
  Gore.gib = function (x, y, amount, angle, cols, z0) {
    cols = cols || ['#c8302e', '#7c1414'];
    const spread = angle === undefined ? Math.PI : 1.0;
    const base = angle === undefined ? 0 : angle;
    for (let i = 0; i < amount; i++) {
      const a = base + rand(-spread, spread), sp = rand(40, 170);
      this._add({
        t: 0, x, y, z: (z0 || 4) + rand(-2, 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.22, vz: rand(70, 210) - Math.sin(a) * sp * 0.5,
        life: rand(4, 9), kind: 2, w: randi(3, 5), h: randi(2, 4), col: pick(cols), rot: rand(0, TAU), vr: rand(-14, 14), drip: rand(0, 0.3),
      });
    }
    for (let i = 0; i < amount * 0.7; i++) {
      const a = base + rand(-spread, spread), sp = rand(30, 130);
      const oi = randi(0, ORGANS.length - 1);
      this._add({ t: 0, x, y, z: (z0 || 4) + rand(-2, 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.22, vz: rand(60, 190) - Math.sin(a) * sp * 0.5,
        life: rand(5, 9), kind: 1, o: oi, bone: !ORGAN_W[oi], rot: rand(0, TAU), vr: rand(-13, 13), drip: rand(0, 0.2) });
    }
  };

  /* ======================================================================
     8.  VILLAGE  --  layout, ownership, update & render
     ====================================================================== */
  P.gull2 = ms([
    '......',
    '1WW11W',
    '.1WW1.',
    '..y1..',
  ], 3, 2);

  // ---- bake: a boardwalk platform on pillars -----------------------------
  function makePlatform(o) {
    const pad = 18, topPad = 44;
    const drop = o.waterY - o.deckY;
    const ch = topPad + drop + 22;
    const lights = [];
    const draw = (c, rng) => {
      const L = pad, D = topPad, wb = o.w, waterL = topPad + drop;
      // water shadow under the structure
      R(c, L - 6, waterL, wb + 12, 5, 'rgba(6,20,52,0.34)');
      R(c, L - 3, waterL + 5, wb + 6, 3, 'rgba(6,20,52,0.20)');
      // pillars
      const px = [];
      const step = 24 + Math.floor(rng.next() * 10);
      for (let x = 5; x < wb - 4; x += step) px.push(x);
      if (px.length < 2) px.push(wb - 7);
      for (let i = 0; i < px.length; i++) {
        const style = rng.next() < 0.3 ? 1 : rng.next() < 0.3 ? 2 : 0;
        Kit.pillar(c, L + px[i], D + 3, waterL + 6 + Math.floor(rng.next() * 4), rng.next() < 0.35 ? 6 : 5, rng, style, waterL);
      }
      // cross bracing between pillars
      for (let i = 0; i < px.length - 1; i++) {
        const a = L + px[i] + 2, b = L + px[i + 1] + 2;
        const y0 = D + 8, y1 = waterL - 6;
        const kind = rng.next();
        if (kind < 0.42) { Kit.brace(c, a, y1, b, y0 + 4, 3); }
        else if (kind < 0.72) { Kit.brace(c, a, y1, b, y0 + 4, 3); Kit.brace(c, b, y1, a, y0 + 4, 3); }
        else { Kit.brace(c, a, y0 + 6, b, y0 + 6, 3); Kit.brace(c, a + 2, y1 - 2, b - 2, y0 + 8, 2); }
        // rope lashing over the joint
        if (rng.next() < 0.5) Kit.lashing(c, a - 3, y0 + 4 + Math.floor(rng.range(0, 8)), 9, rng);
      }
      // a horizontal stringer beam under the deck
      R(c, L - 2, D + 6, wb + 4, 1, W.ink);
      R(c, L - 2, D + 7, wb + 4, 3, W.post1);
      R(c, L - 2, D + 7, wb + 4, 1, W.post2);
      R(c, L - 2, D + 10, wb + 4, 1, W.ink);
      // deck surface
      Kit.deck(c, L, D, wb, rng);
      // hanging nets / tyres off the edge
      let hx = 8;
      while (hx < wb - 24) {
        const r = rng.next();
        if (r < 0.28) { Kit.net(c, L + hx, D + 12, 18 + Math.floor(rng.next() * 12), 10 + Math.floor(rng.next() * 8), rng, { sag: 3 }); hx += 34; }
        else if (r < 0.42) { c.drawImage(P.tyre.c, L + hx, D + 10); R(c, L + hx + 2, D + 6, 1, 5, W.rope0); hx += 16; }
        else hx += 14 + Math.floor(rng.next() * 20);
      }
      // railing (with an opening where people step down / onto the jetty)
      if (o.rail !== false) {
        const gap0 = o.openX0 === undefined ? -1 : o.openX0, gap1 = o.openX1 === undefined ? -1 : o.openX1;
        let rx = 0;
        while (rx < wb) {
          let seg2 = Math.min(wb - rx, 40);
          if (gap0 >= 0 && rx + seg2 > gap0 && rx < gap1) { // skip the opening
            if (rx < gap0) seg2 = gap0 - rx;
            else { rx = gap1; continue; }
          }
          if (seg2 > 6) Kit.railing(c, L + rx, D, seg2, rng, { h: 13, spacing: 11, broken: rng.next() < 0.25, rope: rng.next() < 0.22 });
          rx += Math.max(seg2, 8);
        }
      }
      // deck clutter
      let cx2 = 4;
      while (cx2 < wb - 8) {
        const r = rng.next();
        if (r < 0.13) { c.drawImage(P.barrel.c, L + cx2, D - P.barrel.h); cx2 += 12; if (rng.next() < 0.5) { c.drawImage(P.barrelOpen.c, L + cx2, D - P.barrelOpen.h); cx2 += 12; } }
        else if (r < 0.24) { c.drawImage(P.crate.c, L + cx2, D - P.crate.h); cx2 += 12; if (rng.next() < 0.4) { c.drawImage(P.crateSm.c, L + cx2 - 10, D - P.crate.h - P.crateSm.h); } }
        else if (r < 0.31) { c.drawImage(P.ropeCoil.c, L + cx2, D - P.ropeCoil.h); cx2 += 12; }
        else if (r < 0.37) { c.drawImage(P.bucket.c, L + cx2, D - P.bucket.h); cx2 += 9; }
        else if (r < 0.42) { c.drawImage(P.sack.c, L + cx2, D - P.sack.h); cx2 += 9; }
        else if (r < 0.47) { c.drawImage(P.pot.c, L + cx2, D - P.pot.h); cx2 += 9; }
        else if (r < 0.53) { c.drawImage(P.anchor.c, L + cx2, D - P.anchor.h); cx2 += 12; }
        else if (r < 0.62 && cx2 < wb - 34) { Kit.fishRack(c, L + cx2, D, 28, rng); cx2 += 34; }
        else if (r < 0.70) { // lantern post
          const ph2 = L + cx2, top = D - 22;
          R(c, ph2 - 1, top, 1, 22, W.ink); R(c, ph2, top, 2, 22, W.post1); R(c, ph2, top, 1, 22, W.post2); R(c, ph2 + 2, top, 1, 22, W.ink);
          R(c, ph2 + 2, top, 5, 1, W.post1); R(c, ph2 + 2, top - 1, 5, 1, W.ink);
          c.drawImage(P.lantern.c, ph2 + 4, top + 1);
          lights.push({ x: ph2 + 5, y: top + 6, w: 5, h: 5, ph: rng.range(0, TAU), k: 1.25, lantern: true });
          cx2 += 16;
        } else cx2 += 10 + Math.floor(rng.next() * 22);
      }
      return { lights, haze: o.haze ? ['#bcd8ea', o.haze] : null };
    };
    const d = new Destructible({
      kind: 'deck', x: o.x, y: o.deckY, seed: o.seed,
      cw: o.w + pad * 2, ch, ox: -pad, oy: -topPad,
      bx: 0, by: -16, bw: o.w, bh: drop + 18,
      hp: o.hp || (90 + o.w * 0.5), waterY: o.waterY, ruinKeep: Math.min(26, drop + 8),
      draw,
    });
    d.foam = { x0: o.x - 4, x1: o.x + o.w + 4, y: o.waterY };
    return d;
  }

  // ---- bake: a stilt house -----------------------------------------------
  function makeHouse(o) {
    const pad = 16, wallH = o.wallH, w = o.w;
    const roofH = Math.round(w * 0.36) + 4;
    const topPad = wallH + roofH + 20;
    const drop = o.stilts ? (o.waterY - o.y) : 0;
    const ch = topPad + drop + 24;
    const cwid = w + pad * 2;
    const draw = (c, rng) => {
      const L = pad, base = topPad;
      let res;
      if (o.stilts) {
        const waterL = topPad + drop;
        R(c, L - 6, waterL, w + 12, 5, 'rgba(6,20,52,0.34)');
        const n = w > 44 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const px = Math.round(L + 3 + (w - 9) * i / (n - 1));
          Kit.pillar(c, px, base, waterL + 6, 6, rng, i % 2 ? 1 : 2, waterL);
        }
        for (let i = 0; i < n - 1; i++) {
          const a = Math.round(L + 5 + (w - 9) * i / (n - 1)), b = Math.round(L + 5 + (w - 9) * (i + 1) / (n - 1));
          Kit.brace(c, a, waterL - 6, b, base + 8, 3);
          Kit.brace(c, b, waterL - 6, a, base + 8, 3);
        }
        R(c, L - 3, base - 1, w + 6, 1, W.ink);
        R(c, L - 3, base, w + 6, 3, W.post1);
        R(c, L - 3, base + 3, w + 6, 1, W.ink);
        // ladder down to the water
        Kit.ladder(c, L + w - 10, base + 4, drop - 2, rng);
      }
      res = Kit.house(c, L, base, w, wallH, o.col, rng, o);
      return { lights: res.lights, smoke: res.smoke, haze: o.haze ? ['#bcd8ea', o.haze] : null };
    };
    const d = new Destructible({
      kind: 'house', x: o.x, y: o.y, seed: o.seed,
      cw: cwid, ch, ox: -pad, oy: -topPad,
      bx: -2, by: -(wallH + roofH), bw: w + 4, bh: wallH + roofH + drop,
      hp: o.hp || (150 + w * 2), waterY: o.waterY, ruinKeep: o.stilts ? Math.min(30, drop + 10) : 10,
      draw,
    });
    if (o.stilts) d.foam = { x0: o.x - 4, x1: o.x + w + 4, y: o.waterY };
    return d;
  }

  // ---- bake: a section of the jetty running out into the water -----------
  function makeJetty(o) {
    const pad = 14;
    const cwid = o.w + pad * 2, ch = o.len + 4;
    const lights = [];
    const draw = (c, rng) => {
      Kit.jetty(c, pad, 2, o.w, o.len, rng, { rails: o.rails !== false });
      // clutter along the deck
      let y = 6;
      while (y < o.len - 12) {
        const r = rng.next();
        const sideL = rng.next() < 0.5;
        const cx2 = sideL ? pad + 4 : pad + o.w - 12;
        if (r < 0.16) c.drawImage(P.crate.c, cx2, y);
        else if (r < 0.28) c.drawImage(P.barrel.c, cx2, y);
        else if (r < 0.36) c.drawImage(P.ropeCoil.c, cx2, y);
        else if (r < 0.44) c.drawImage(P.bucket.c, cx2 + 2, y);
        else if (r < 0.52 && o.rails !== false) { // lantern post at the rail
          const lx = sideL ? pad - 1 : pad + o.w - 3;
          R(c, lx, y - 14, 3, 16, W.ink); R(c, lx, y - 14, 2, 16, W.post1);
          c.drawImage(P.lantern.c, lx - 1, y - 20);
          lights.push({ x: lx, y: y - 15, w: 5, h: 5, ph: rng.range(0, TAU), k: 1.3, lantern: true });
        } else if (r < 0.6) { c.drawImage(P.fish.c, cx2 + 2, y + 2); }
        y += 14 + Math.floor(rng.next() * 22);
      }
      return { lights };
    };
    return new Destructible({
      kind: 'jetty', x: o.x, y: o.y, seed: o.seed,
      cw: cwid, ch, ox: -(pad + o.w / 2), oy: 0,
      bx: -o.w / 2, by: 0, bw: o.w, bh: o.len,
      hp: o.hp || 220, waterY: o.y - 999, ruinKeep: 0, leaveRuin: false,
      draw,
    });
  }

  // ---- bake: a moored rowboat ---------------------------------------------
  function makeBoat(o) {
    const len = o.len || 26, pad = 6;
    const draw = (c, rng) => { Kit.rowboat(c, pad, 20, len, rng); return {}; };
    const d = new Destructible({
      kind: 'boat', x: o.x, y: o.y, seed: o.seed,
      cw: len + pad * 2, ch: 24, ox: -pad, oy: -20,
      bx: 0, by: -14, bw: len, bh: 14,
      hp: 60, waterY: o.y - 4, ruinKeep: 0, leaveRuin: false, bob: 1.6,
      draw,
    });
    return d;
  }

  // ---- bake: trees & beach scatter ---------------------------------------
  const BEACH = [];
  function buildBeach() {
    if (BEACH.length) return;
    const mkb = (w, h, fn) => { const c = cv(w, h); const rng = new SeededRandom(1200 + BEACH.length * 131); fn(c, rng); BEACH.push(sprite(c, -Math.round(w / 2), -h)); };
    // beached rowboat, hauled up on its side
    mkb(40, 20, (c, rng) => { Kit.rowboat(c, 4, 18, 30, rng); R(c, 2, 18, 36, 2, 'rgba(90,70,40,0.35)'); });
    // drying rack
    mkb(40, 28, (c, rng) => { Kit.fishRack(c, 5, 26, 30, rng); });
    // crate + barrel stack
    mkb(30, 24, (c, rng) => {
      c.drawImage(P.crate.c, 2, 24 - P.crate.h);
      c.drawImage(P.barrel.c, 14, 24 - P.barrel.h);
      if (rng.next() < 0.7) c.drawImage(P.crateSm.c, 3, 24 - P.crate.h - P.crateSm.h);
    });
    // rock cluster (reuses the game's procedural rock)
    mkb(34, 20, (c, rng) => {
      const a = makeRock(rng.int(1, 9999), 9), b = makeRock(rng.int(1, 9999), 6);
      c.drawImage(a.c, 2, 20 - a.h); c.drawImage(b.c, 18, 20 - b.h);
    });
    // driftwood + weed
    mkb(30, 12, (c, rng) => {
      pline(c, 2, 10, 26, 7, 4, W.ink); pline(c, 2, 10, 26, 7, 2, W.deck1);
      pline(c, 8, 11, 20, 5, 2, W.deck2);
      for (let i = 0; i < 14; i++) R(c, rng.range(1, 28), rng.range(8, 12), rng.next() < 0.5 ? 2 : 1, 1, rng.next() < 0.5 ? W.alg : W.alg2);
    });
    // net pile with floats
    mkb(28, 14, (c, rng) => {
      Kit.net(c, 2, 2, 24, 7, rng, { sag: 1 });
      c.drawImage(P.ropeCoil.c, 14, 14 - P.ropeCoil.h);
    });
    // barrels + rope
    mkb(30, 14, (c, rng) => {
      c.drawImage(P.barrelOpen.c, 1, 14 - P.barrelOpen.h);
      c.drawImage(P.barrel.c, 11, 14 - P.barrel.h);
      c.drawImage(P.ropeCoil.c, 20, 14 - P.ropeCoil.h);
      void rng;
    });
    // anchor + bucket
    mkb(24, 14, (c, rng) => { c.drawImage(P.anchor.c, 2, 14 - P.anchor.h); c.drawImage(P.bucket.c, 14, 14 - P.bucket.h); void rng; });
    // a lone upturned hull
    mkb(34, 12, (c, rng) => {
      for (let i = 0; i < 30; i++) {
        const k = i / 30, hgt = Math.round(Math.sin(k * Math.PI) * 9) + 1;
        R(c, 2 + i, 11 - hgt, 1, hgt, i % 4 === 0 ? W.deck0 : W.deck1);
        R(c, 2 + i, 11 - hgt, 1, 1, W.ink);
        if (rng.next() < 0.2) R(c, 2 + i, 11 - hgt + 2, 1, 1, W.deck3);
      }
      R(c, 2, 11, 30, 1, W.ink);
    });
  }
  const TREES = [];
  function buildTrees() {
    if (TREES.length) return;
    for (let i = 0; i < 7; i++) {
      const rng = new SeededRandom(700 + i * 37);
      const c = cv(46, 52);
      Kit.tree(c, 23, 50, rng, i < 3 ? 'palm' : 'leafy');
      TREES.push(sprite(c, -23, -50));
    }
  }

  const Village = {
    built: false, hostile: false,
    structures: [], villagers: [], decks: [], trees: [], props: [], gulls: [],
    pierX: 1600, shoreY: 300, worldW: 3200, waterY: 312,
    signSprite: null, _t: 0, _order: [],

    reset() {
      this.built = false; this.hostile = false;
      this.structures.length = 0; this.villagers.length = 0; this.decks.length = 0;
      this.trees.length = 0; this.props.length = 0; this.gulls.length = 0; this._order.length = 0;
      this._panicStart = 0;
      Gore.reset(); Puffs.reset();
    },

    // ------------------------------------------------------------- build
    build(pierX, shoreY, worldW) {
      this.reset();
      buildTrees(); buildBeach();
      this.pierX = pierX === undefined ? 1600 : pierX;
      this.shoreY = shoreY === undefined ? 300 : shoreY;
      this.worldW = worldW === undefined ? 3200 : worldW;
      const S = this.shoreY, X = this.pierX;
      this.waterY = S + 12;
      Gore.waterY = this.waterY;
      const rng = new SeededRandom(97531);
      const rowB = { deckY: S - 54, waterY: S - 8, haze: 0.30 };
      const rowM = { deckY: S - 30, waterY: S + 12, haze: 0 };
      const rowF = { deckY: S + 8, waterY: S + 48, haze: 0 };
      let seed = 1000;

      // ---- back row: little huts on the sand, trees
      for (let i = 0; i < 6; i++) {
        const hx = X + rng.range(-1050, 1050);
        if (Math.abs(hx - X) < 120) continue;
        const w = rng.int(28, 40);
        this.add(makeHouse({
          x: hx, y: rowB.deckY + rng.range(-10, 4), w, wallH: rng.int(20, 26), col: pick(HOUSE_COLS),
          seed: seed++, waterY: rowB.waterY, haze: rowB.haze, stilts: false,
          doorAt: rng.range(0.25, 0.7), chimneyLeft: rng.next() < 0.5, awning: rng.next() < 0.5,
        }), -2);
      }
      for (let i = 0; i < 26; i++) {
        const tx = X + rng.range(-1500, 1500);
        this.trees.push({ s: TREES[rng.int(0, TREES.length - 1)], x: tx, y: S - rng.range(62, 155), ph: rng.range(0, TAU) });
      }
      // clutter strewn along the sand
      for (let i = 0; i < 30; i++) {
        const bx = X + rng.range(-1500, 1500);
        if (Math.abs(bx - X) < 60) continue;
        this.trees.push({ s: BEACH[rng.int(0, BEACH.length - 1)], x: bx, y: S - rng.range(42, 96), ph: 0, flat: true });
      }
      this.trees.sort((a, b) => a.y - b.y);

      // ---- main boardwalk: platforms from left to right
      const startX = X - 1020, endX = X + 1020;
      let x = startX;
      const platforms = [];
      while (x < endX) {
        let w = rng.int(110, 210);
        if (x + w > endX) w = endX - x;
        if (w < 60) break;
        const o = { x, w, deckY: rowM.deckY + Math.round(rng.range(-3, 3)), waterY: rowM.waterY, seed: seed++ };
        // opening where the jetty joins the shore
        if (x < X + 40 && x + w > X - 40) { o.openX0 = Math.max(0, X - 34 - x); o.openX1 = Math.min(w, X + 34 - x); }
        const p = makePlatform(o);
        this.add(p, 0);
        platforms.push({ x, w, deckY: o.deckY, str: p });
        this.decks.push({ x0: x, x1: x + w, y0: o.deckY - 8, y1: o.deckY + 10 });
        x += w + rng.int(0, 4);
      }
      // ---- houses along the boardwalk
      for (const pf of platforms) {
        if (pf.w < 100) continue;
        if (rng.next() < 0.32) continue;
        const hw = pf.w > 170 ? rng.int(46, 62) : rng.int(34, 48);
        const hx = pf.x + rng.range(6, Math.max(8, pf.w - hw - 6));
        if (Math.abs(hx + hw / 2 - X) < 70) continue;
        this.add(makeHouse({
          x: hx, y: pf.deckY, w: hw, wallH: rng.int(26, 38), col: pick(HOUSE_COLS),
          seed: seed++, waterY: rowM.waterY, stilts: false,
          doorAt: rng.range(0.2, 0.68), doorOpen: rng.next() < 0.3, chimneyLeft: rng.next() < 0.5,
        }), 1);
      }

      // ---- front row: two houses standing right out in the water
      for (const side of [-1, 1]) {
        const hx = X + side * rng.range(200, 430) - 30;
        const hw = rng.int(40, 56);
        this.add(makeHouse({
          x: hx, y: rowF.deckY, w: hw, wallH: rng.int(26, 34), col: pick(HOUSE_COLS),
          seed: seed++, waterY: rowF.waterY, stilts: true,
          doorAt: rng.range(0.25, 0.65), doorOpen: rng.next() < 0.5, chimneyLeft: side < 0,
        }), 3);
        this.decks.push({ x0: hx, x1: hx + hw, y0: rowF.deckY - 8, y1: rowF.deckY + 8 });
        // a small deck beside it
        const dx = hx + (side < 0 ? hw + 2 : -64);
        const pl = makePlatform({ x: dx, w: 62, deckY: rowF.deckY, waterY: rowF.waterY, seed: seed++, hp: 90 });
        this.add(pl, 3);
        this.decks.push({ x0: dx, x1: dx + 62, y0: rowF.deckY - 8, y1: rowF.deckY + 10 });
        this.add(makeBoat({ x: dx + 10, y: rowF.waterY + 10, len: rng.int(22, 30), seed: seed++ }), 4);
      }

      // ---- the jetty out into the water
      const jw = 44;
      let jy = S - 22;
      const jEnd = S + 140;
      while (jy < jEnd) {
        const len = Math.min(jEnd - jy, 58);
        this.add(makeJetty({ x: X, y: jy, w: jw, len, seed: seed++, rails: true }), 5);
        jy += len;
      }
      this.decks.push({ x0: X - jw / 2, x1: X + jw / 2, y0: S - 22, y1: jEnd });
      // moored boats at the jetty head
      this.add(makeBoat({ x: X - 46, y: S + 96, len: 28, seed: seed++ }), 5);
      this.add(makeBoat({ x: X + 26, y: S + 60, len: 24, seed: seed++ }), 5);
      // buoys bobbing around
      for (let i = 0; i < 7; i++) this.props.push({ s: P.buoyProp, x: X + rng.range(-520, 520), y: S + rng.range(30, 150), ph: rng.range(0, TAU), amp: 1.8 });
      for (let i = 0; i < 5; i++) this.props.push({ s: P.buoyBall, x: X + rng.range(-620, 620), y: S + rng.range(20, 120), ph: rng.range(0, TAU), amp: 1.4 });

      // ---- the sign
      const sc = cv(96, 26);
      R(sc, 0, 4, 96, 16, W.ink);
      R(sc, 1, 5, 94, 14, W.deck1);
      R(sc, 1, 5, 94, 2, W.deck3);
      R(sc, 1, 17, 94, 2, W.deck0);
      for (let i = 0; i < 94; i += 3) if ((i * 7 % 11) < 3) R(sc, 1 + i, 7, 2, 10, W.deck2);
      R(sc, 6, 19, 3, 7, W.post1); R(sc, 87, 19, 3, 7, W.post1);
      R(sc, 5, 19, 1, 7, W.ink); R(sc, 90, 19, 1, 7, W.ink);
      try {
        const tc = cv(96, 26);
        pixelText(tc, 'FISHER VILLAGE', 48, 8, 8, '#ffffff', 'center', false);
        // threshold the antialiased glyphs down to hard pixels
        const im = tc.getImageData(0, 0, 96, 26), d2 = im.data;
        for (let i = 0; i < d2.length; i += 4) {
          const on = d2[i + 3] > 120;
          d2[i] = 0xf6; d2[i + 1] = 0xe0; d2[i + 2] = 0xb0; d2[i + 3] = on ? 255 : 0;
        }
        tc.putImageData(im, 0, 0);
        sc.drawImage(tc.canvas, 0, 0);
        // a 1px dark shadow under the letters
      } catch (e) { }
      this.signSprite = sprite(sc, -48, -26);
      this.signX = X; this.signY = S - 52;

      // ---- gulls
      for (let i = 0; i < 6; i++) this.gulls.push({ x: X + rng.range(-600, 600), y: S - rng.range(70, 170), vx: rng.range(-16, 16), ph: rng.range(0, TAU), up: 0 });

      // ---- villagers
      this.populate(platforms, rng, rowF, S, X, jw, jEnd);

      this._order = this.structures.slice().sort((a, b) => (a._depth - b._depth) || (a.y - b.y));
      this.built = true;
      return this;
    },
    add(s, depth) { s._depth = depth || 0; this.structures.push(s); return s; },

    populate(platforms, rng, rowF, S, X, jw, jEnd) {
      const mk = (x, y, opts) => { const v = new Villager(x, y, opts); this.villagers.push(v); return v; };
      // boardwalk crowd
      const roles = ['walk', 'walk', 'fish', 'haul', 'hammer', 'chat', 'idle', 'fish', 'walk', 'chat'];
      let ri = 0;
      for (const pf of platforms) {
        const n = pf.w > 150 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          if (this.villagers.length > 17) break;
          const role = roles[(ri++) % roles.length];
          const lane = { x0: pf.x + 10, y0: pf.deckY, x1: pf.x + pf.w - 10, y1: pf.deckY };
          const vx = rng.range(lane.x0, lane.x1);
          mk(vx, pf.deckY, { lane, role, waterY: this.waterY });
        }
      }
      // pair up chatters
      for (let i = 0; i < this.villagers.length; i++) {
        const a = this.villagers[i];
        if (a.role !== 'chat' || a.partner) continue;
        for (let j = 0; j < this.villagers.length; j++) {
          const b = this.villagers[j];
          if (b === a || b.partner || b.dead) continue;
          if (Math.abs(b.y - a.y) < 3 && Math.abs(b.x - a.x) < 60) {
            a.partner = b; b.partner = a; a.chatLead = true;
            b.role = 'chat'; a.setState('chat'); b.setState('chat');
            b.x = a.x + (a.x < b.x ? 13 : -13);
            a.face = sign(b.x - a.x); b.face = -a.face;
            break;
          }
        }
      }
      // jetty crowd (the lane runs along the pier, into the water)
      const jl = { x0: X - jw / 2 + 9, y0: S - 10, x1: X + jw / 2 - 9, y1: jEnd - 14 };
      for (let i = 0; i < 3; i++) {
        const u = rng.range(0.15, 0.95);
        const lane = { x0: X - jw / 2 + 9, y0: lerp(jl.y0, jl.y1, Math.max(0, u - 0.3)), x1: X + jw / 2 - 9, y1: lerp(jl.y0, jl.y1, Math.min(1, u + 0.3)) };
        const v = mk(rng.range(lane.x0, lane.x1), lerp(lane.y0, lane.y1, 0.5), { lane, role: i === 0 ? 'fish' : pick(['walk', 'haul', 'fish']), onJetty: true });
        v.waterY = v.y + 10;
      }
      // front-row decks
      for (const d of this.decks) {
        if (d.y0 < rowF.deckY - 10 || d.y0 > rowF.deckY + 4) continue;
        if (this.villagers.length > 21) break;
        const lane = { x0: d.x0 + 8, y0: rowF.deckY, x1: d.x1 - 8, y1: rowF.deckY };
        if (lane.x1 - lane.x0 < 20) continue;
        const v = mk(rng.range(lane.x0, lane.x1), rowF.deckY, { lane, role: pick(['fish', 'idle', 'walk']) });
        v.waterY = rowF.waterY;
      }
    },

    // ---------------------------------------------------------------- query
    deckAt(x, y) {
      const d = this.decks;
      for (let i = 0; i < d.length; i++) {
        const k = d[i];
        if (x > k.x0 && x < k.x1 && y > k.y0 - 4 && y < k.y1 + 6) return true;
      }
      return false;
    },
    structureAt(x, y, pad) {
      for (const s of this.structures) if (!s.collapsed && s.contains(x, y, pad || 0)) return s;
      return null;
    },
    // ------------------------------------------------------------- gameplay
    damage(x, y, radius, dmg, kx, ky) {
      let hitAny = false;
      for (const s of this.structures) {
        if (s.collapsed || s.dead) continue;
        if (s.contains(x, y, radius)) { s.hit(dmg, kx === undefined ? x - (s.x + s.bx + s.bw / 2) : kx, ky === undefined ? -1 : ky); hitAny = true; }
      }
      this.panicNear(x, y, Math.max(200, radius * 3));
      return hitAny;
    },
    explode(x, y, radius, dmg) {
      dmg = dmg || 90;
      for (const s of this.structures) {
        if (s.collapsed || s.dead) continue;
        if (s.contains(x, y, radius)) s.hit(dmg * (s.kind === 'house' ? 0.9 : 1.2), x - (s.x + s.bx + s.bw / 2), -1);
      }
      for (const v of this.villagers) {
        if (v.dead || v.gone) continue;
        const d = dist(v.x, v.y - 8, x, y);
        if (d < radius) v.kill(angleTo(x, y, v.x, v.y - 8), d < radius * 0.45 ? 2.2 : 1.3);
        else if (d < radius * 3) v.panic();
      }
      Gore.mist(x, y, 6);
    },
    killNear(x, y, radius, angle, power) {
      let n = 0;
      for (const v of this.villagers) {
        if (v.dead || v.gone) continue;
        if (dist(v.x, v.y - 8, x, y) < radius) { v.kill(angle === undefined ? angleTo(x, y, v.x, v.y - 8) : angle, power || 1); n++; }
      }
      return n;
    },
    villagerAt(x, y, radius) {
      let best = null, bd = (radius || 12) * (radius || 12);
      for (const v of this.villagers) {
        if (v.dead || v.gone) continue;
        const dx = v.x - x, dy = (v.y - 9) - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    },
    panicNear(x, y, radius) {
      for (const v of this.villagers) if (!v.dead && !v.gone && dist(v.x, v.y, x, y) < radius) v.panic();
    },
    panicAll() { this.hostile = true; for (const v of this.villagers) if (!v.dead && !v.gone) { if (Math.random() < 0.55) v.panic(); else v.notice(); } },
    alert() { this.hostile = true; },

    // the deck somebody was standing on just went into the sea
    onCollapse(s) {
      if (!s) return;
      const x0 = s.x + s.bx - 10, x1 = s.x + s.bx + s.bw + 10;
      // the deck is gone: nobody can walk there any more
      for (let i = this.decks.length - 1; i >= 0; i--) {
        const d = this.decks[i];
        if (d.x0 >= x0 - 8 && d.x1 <= x1 + 8 && Math.abs(d.y0 - (s.y - 8)) < 16) this.decks.splice(i, 1);
      }
      for (const v of this.villagers) {
        if (v.dead || v.gone || v.state === 'fall' || v.state === 'swim') continue;
        if (v.x < x0 || v.x > x1) continue;
        if (Math.abs(v.y - s.y) > 18) continue;
        if (this.deckAt(v.x, v.y)) continue;   // some other deck still holds them up
        v.fall();
      }
      // a house loses the deck it was standing on -> it goes down with it
      if (s.kind === 'deck') {
        for (const h of this.structures) {
          if (h === s || h.collapsed || h.dead || h.kind !== 'house') continue;
          const hx = h.x + h.bx + h.bw * 0.5;
          if (hx < x0 || hx > x1 || Math.abs(h.y - s.y) > 10) continue;
          h.hit(h.hp + 1, sign(hx - (s.x + s.bx + s.bw * 0.5)), -1);
        }
      }
    },
    // ---------------------------------------------------------------- update
    update(dt, t) {
      if (!this.built) return;
      this._t = t === undefined ? this._t + dt : t;
      t = this._t;
      const g = gg();
      if (!this.hostile && g && ((g.director && g.director.started) || (g.state === 'play' && g.fisherman === null))) this.hostile = true;
      if (this.hostile && !this._panicStart) { this._panicStart = 0.01; }
      if (this._panicStart) {
        this._panicStart += dt;
        // the alarm spreads through the village instead of everyone bolting at once
        for (const v of this.villagers) {
          if (v.dead || v.gone || v.panicked) continue;
          if (Math.random() < dt * 0.9) { if (v.alerted || Math.random() < 0.5) v.panic(); else v.notice(); }
        }
      }
      const cam = g && g.cam ? g.cam : { x: this.pierX - 320, y: this.shoreY - 120 };
      for (const s of this.structures) {
        s.update(dt, t);
        // chimney smoke, only while roughly on screen
        if (s.smoke && !s.collapsed) {
          const sx = s.x + s.ox + s.smoke.x - cam.x;
          if (sx > -40 && sx < 690) {
            s.smokeEmit = (s.smokeEmit || rand(0, 0.4)) - dt;
            if (s.smokeEmit <= 0) {
              s.smokeEmit = rand(0.22, 0.5);
              Puffs.add(s.x + s.ox + s.smoke.x, s.y + s.oy + s.smoke.y,
                { col: pick(['#a49ea8', '#b3adb6', '#8d8790']), a: 0.30, s: rand(2, 3), grow: rand(2.5, 4.5), life: rand(1.6, 3.0), vy: rand(-16, -9), vx: rand(-3, 6) });
            }
          }
        }
      }
      for (const v of this.villagers) v.update(dt, t);
      // gulls
      for (const gl of this.gulls) {
        gl.x += gl.vx * dt; gl.ph += dt * (this.hostile ? 16 : 9);
        gl.y += Math.sin(gl.ph * 0.2) * 6 * dt;
        if (this.hostile) { gl.y -= 12 * dt; gl.vx = approach(gl.vx, sign(gl.vx) * 70, 30 * dt); }
        if (gl.x < this.pierX - 900) gl.vx = Math.abs(gl.vx);
        if (gl.x > this.pierX + 900) gl.vx = -Math.abs(gl.vx);
      }
      Puffs.update(dt);
      Gore.update(dt);
      // cull
      for (let i = this.villagers.length - 1; i >= 0; i--) if (this.villagers[i].gone) this.villagers.splice(i, 1);
      for (let i = this.structures.length - 1; i >= 0; i--) if (this.structures[i].dead) {
        const s = this.structures[i];
        this.structures.splice(i, 1);
        const j = this._order.indexOf(s); if (j >= 0) this._order.splice(j, 1);
      }
    },

    // ---------------------------------------------------------------- render
    render(ctx, cam, t) {
      if (!this.built) return;
      t = t === undefined ? this._t : t;
      if (cam.y > this.shoreY + 320) return;
      ctx.imageSmoothingEnabled = false;
      const ox = -cam.x, oy = -cam.y;
      // --- land backdrop: trees
      for (const tr of this.trees) {
        const sx = tr.x + ox;
        if (sx < -30 || sx > 680) continue;
        ctx.drawImage(tr.s.c, Math.round(sx) + tr.s.ox, Math.round(tr.y + oy) + tr.s.oy);
      }
      // --- sign
      if (this.signSprite) {
        const sx = this.signX + ox;
        if (sx > -60 && sx < 700) blit(ctx, this.signSprite, sx, this.signY + oy);
      }
      // --- structures (back to front)
      for (const s of this._order) s.renderBody(ctx, cam, t);
      // --- animated foam where pillars meet the water
      ctx.fillStyle = 'rgba(236,250,255,0.55)';
      for (const s of this._order) {
        if (!s.foam || s.collapsed) continue;
        const y = Math.round(s.foam.y + oy);
        if (y < -6 || y > 372) continue;
        const x0 = Math.max(-2, Math.round(s.foam.x0 + ox)), x1 = Math.min(642, Math.round(s.foam.x1 + ox));
        for (let x = x0; x < x1; x += 2) {
          const k = Math.sin(x * 0.28 + t * 3.4) + Math.sin(x * 0.11 - t * 1.7);
          if (k > 0.3) ctx.fillRect(x, y + (k > 1.2 ? -1 : 0), 2, 1);
        }
      }
      // --- floating props (buoys)
      for (const p of this.props) {
        const sx = p.x + ox, sy = p.y + oy + Math.sin(t * 1.9 + p.ph) * p.amp;
        if (sx < -12 || sx > 652 || sy < -12 || sy > 372) continue;
        ctx.fillStyle = 'rgba(8,22,52,0.25)'; ctx.fillRect(Math.round(sx) - 3, Math.round(sy) + 1, 7, 2);
        drawSprite(ctx, p.s, sx, sy);
      }
      // --- blood decals on the decking, under everybody
      Gore.renderDecals(ctx, cam);
      // --- villagers, sorted so the near ones overlap the far ones
      const vs = this.villagers;
      if (vs.length > 1) vs.sort((a, b) => a.y - b.y);
      for (const v of vs) v.render(ctx, cam, t);
      // --- debris on top
      for (const s of this._order) s.renderDebris(ctx, cam, t);
      // --- gulls
      for (const gl of this.gulls) {
        const sx = gl.x + ox, sy = gl.y + oy;
        if (sx < -10 || sx > 650 || sy < -10 || sy > 370) continue;
        drawSprite(ctx, Math.sin(gl.ph) > 0 ? P.gull : P.gull2, sx, sy);
      }
      // --- smoke & dust last
      Puffs.render(ctx, cam);
      // fallback: if nobody else is drawing the gore, draw it here
      if (performance.now() - (Gore._lastRender || 0) > 400) Gore.render(ctx, cam);
    },
    renderGore(ctx, cam) { Gore.render(ctx, cam); },
  };

  /* ======================================================================
     9.  EXPORTS
     ====================================================================== */
  global.Village = Village;
  global.Villager = Villager;
  global.Destructible = Destructible;
  global.Gore = Gore;
  global.VillageKit = { Kit, Props: P, Puffs, makePlatform, makeHouse, makeJetty, makeBoat, WOOD: W, HOUSE_COLS, pline, damagePass };
})(typeof window !== 'undefined' ? window : this);
