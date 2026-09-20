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
     1.  PROPS  --  procedural, built at K art pixels per world unit
     ====================================================================== */
  // K art pixels per world unit. Everything baked in this file is drawn at
  // that resolution and blitted at 1/K, so one art pixel lands on one screen
  // pixel. World footprints are unchanged.
  const K = (typeof DETAIL === 'number' && DETAIL > 0) ? DETAIL : 2;
  const U = K;                                  // one world unit, in art px
  const uw = v => Math.max(1, Math.round(v * U));  // world -> art px

  const P = {};   // prop sprites: {c,w,h,ax,ay} in ART pixels
  let _propN = 0;
  function prop(wu, hu, fn, o) {
    o = o || {};
    const w = uw(wu), h = uw(hu);
    const c = cv(w, h);
    fn(c, new SeededRandom(4210 + (++_propN) * 613), w, h);
    return { c: c.canvas, w, h, ax: o.ax === undefined ? (w >> 1) : uw(o.ax), ay: o.ay === undefined ? h : uw(o.ay) };
  }
  // speckle helper: scatter n single pixels in a box
  function fleck(c, rng, x, y, w, h, n, cols) {
    for (let i = 0; i < n; i++) R(c, x + Math.floor(rng.next() * w), y + Math.floor(rng.next() * h), 1, 1, cols[Math.floor(rng.next() * cols.length)]);
  }

  // --- barrels ------------------------------------------------------------
  function barrelBody(c, rng, w, h, open) {
    R(c, 0, 1, w, h - 2, W.ink);
    for (let i = 1; i < w - 1; i++) {
      const k = Math.abs(i - (w - 1) / 2) / (w / 2);
      const col = k < 0.22 ? W.deck3 : k < 0.5 ? W.deck2 : k < 0.8 ? W.deck1 : W.deck0;
      R(c, i, 2, 1, h - 4, col);
      if ((i % 3) === 0) R(c, i, 2, 1, h - 4, shade(col, 0.82));
      if (rng.next() < 0.35) R(c, i, 3 + Math.floor(rng.next() * (h - 7)), 1, 1 + Math.floor(rng.next() * 3), W.deck0);
    }
    for (const hy of [3, Math.round(h * 0.45), h - 6]) {
      R(c, 1, hy, w - 2, 2, W.met1);
      R(c, 1, hy, w - 2, 1, W.met2);
      for (let i = 1; i < w - 1; i += 3) if (rng.next() < 0.3) R(c, i, hy, 1, 1, W.rust1);
    }
    if (open) {
      R(c, 1, 1, w - 2, 4, W.ink);
      R(c, 2, 2, w - 4, 3, W.wet);
      R(c, 3, 2, w - 6, 1, mix(W.wet, W.net2, 0.35));
      fleck(c, rng, 2, 2, w - 4, 3, 4, [W.alg, W.met3]);
    } else {
      R(c, 1, 1, w - 2, 3, W.deck4);
      R(c, 2, 1, w - 4, 1, mix(W.deck4, '#ffffff', 0.25));
      R(c, 1, 4, w - 2, 1, W.deck0);
    }
    R(c, 1, h - 2, w - 2, 1, W.ink);
  }
  P.barrel = prop(10, 10, (c, rng, w, h) => barrelBody(c, rng, w, h, false));
  P.barrelOpen = prop(10, 9, (c, rng, w, h) => barrelBody(c, rng, w, h, true));
  P.keg = prop(7, 6, (c, rng, w, h) => barrelBody(c, rng, w, h, false));

  // --- crates / fish boxes ------------------------------------------------
  function crateBody(c, rng, w, h, fishy) {
    R(c, 0, 0, w, h, W.ink);
    R(c, 1, 1, w - 2, h - 2, W.deck2);
    for (let y = 1; y < h - 1; y += 3) { R(c, 1, y, w - 2, 1, W.deck3); R(c, 1, y + 2, w - 2, 1, W.deck1); }
    // corner posts + diagonal batten
    R(c, 1, 1, 2, h - 2, W.deck1); R(c, w - 3, 1, 2, h - 2, W.deck0);
    pline(c, 2, h - 3, w - 3, 2, 2, W.deck1);
    pline(c, 2, h - 3, w - 3, 2, 1, W.deck3);
    fleck(c, rng, 1, 1, w - 2, h - 2, Math.round(w * 0.4), [W.deck0, W.deck4]);
    // nail heads
    for (const nx of [2, w - 3]) for (let y = 2; y < h - 2; y += 4) R(c, nx, y, 1, 1, W.met2);
    if (fishy) { // ice + a tail sticking out
      R(c, 2, 1, w - 4, 2, '#cfe4ee');
      fleck(c, rng, 2, 1, w - 4, 2, 4, ['#ffffff', '#a9c6d4']);
      R(c, Math.round(w * 0.55), 0, 3, 2, W.met3); R(c, Math.round(w * 0.55) + 1, 0, 1, 1, W.ink);
    }
  }
  P.crate = prop(10, 9, (c, rng, w, h) => crateBody(c, rng, w, h, false));
  P.crateSm = prop(7, 6, (c, rng, w, h) => crateBody(c, rng, w, h, false));
  P.fishBox = prop(11, 6, (c, rng, w, h) => crateBody(c, rng, w, h, true));

  // --- crab / lobster pot -------------------------------------------------
  P.crabPot = prop(11, 8, (c, rng, w, h) => {
    // domed wicker cage: ribs + mesh, a dark mouth in the side
    for (let i = 0; i < w; i++) {
      const k = i / (w - 1);
      const top = Math.round(h - 2 - Math.sin(k * Math.PI) * (h - 3));
      R(c, i, top, 1, h - 1 - top, W.ink);
      R(c, i, top + 1, 1, h - 2 - top, i % 3 === 0 ? W.rope0 : W.rope1);
      if (rng.next() < 0.3) R(c, i, top + 1 + Math.floor(rng.next() * Math.max(1, h - 3 - top)), 1, 1, W.rope2);
    }
    for (let y = 2; y < h - 1; y += 2) R(c, 1, y, w - 2, 1, 'rgba(26,16,21,0.45)');
    R(c, Math.round(w * 0.42), h - 5, 3, 3, W.ink);
    R(c, 0, h - 2, w, 2, W.ink);
    R(c, 1, h - 2, w - 2, 1, W.post1);
  });

  // --- rope coil ----------------------------------------------------------
  P.ropeCoil = prop(10, 7, (c, rng, w, h) => {
    const cx = w / 2, cy = h * 0.55;
    for (let r = Math.min(cx, cy) - 0.5; r > 0.8; r -= 1.6) {
      for (let a = 0; a < TAU; a += 0.22) {
        const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 0.66);
        R(c, x, y, 1, 1, ((x + y) & 1) ? W.rope1 : W.rope0);
        if (rng.next() < 0.18) R(c, x, y, 1, 1, W.rope2);
      }
    }
    for (let a = 0; a < TAU; a += 0.18) R(c, Math.round(cx + Math.cos(a) * (cx - 0.5)), Math.round(cy + Math.sin(a) * (cy * 0.88)), 1, 1, W.ink);
    // loose tail
    pline(c, cx, cy, w - 1, h - 1, 1, W.rope1);
  });

  // --- floats / buoys -----------------------------------------------------
  function roundFloat(c, w, h, r0, body, hi, band) {
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, (y - cy) * (w / h));
      if (d > r0) continue;
      R(c, x, y, 1, 1, d > r0 - 1 ? W.ink : (y < cy - r0 * 0.2 ? hi : body));
    }
    R(c, 1, Math.round(cy), w - 2, Math.max(1, Math.round(h * 0.16)), band);
  }
  P.buoyProp = prop(6, 8, (c, rng, w, h) => {
    // a marker float: ring body, a stave and a flag on top
    R(c, Math.round(w / 2) - 1, 0, uw(1), uw(2.5), W.ink);
    R(c, Math.round(w / 2) - 1, 0, 1, uw(2.5), W.met2);
    R(c, Math.round(w / 2), 0, uw(1.5), uw(1), W.float0);
    roundFloat(c, w, h - uw(2), Math.min(w, h - uw(2)) / 2 - 0.5, W.float0, W.float1, W.float2);
    c.drawImage(c.canvas, 0, 0, w, h - uw(2), 0, uw(2), w, h - uw(2));
    R(c, 0, 0, w, uw(2), 'rgba(0,0,0,0)');
    R(c, Math.round(w / 2) - 1, 0, uw(1), uw(2.5), W.ink);
    R(c, Math.round(w / 2) - 1, 0, 1, uw(2.5), W.met2);
    fleck(c, rng, 1, uw(3), w - 2, h - uw(4), 2, [W.barn, W.alg]);
  });
  P.buoyBall = prop(5, 5, (c, rng, w, h) => {
    roundFloat(c, w, h, Math.min(w, h) / 2 - 0.5, W.float0, W.float1, W.float2);
    void rng;
  });

  // --- fish ---------------------------------------------------------------
  function fishBody(c, rng, w, h, fat) {
    const cy = h / 2;
    for (let i = 0; i < w - uw(2); i++) {
      const k = i / (w - uw(2));
      const r = Math.max(1, Math.round(Math.sin(Math.pow(k, 0.7) * Math.PI) * (fat ? h * 0.5 : h * 0.4)));
      R(c, i, Math.round(cy - r), 1, r * 2, W.ink);
      R(c, i, Math.round(cy - r) + 1, 1, Math.max(1, r * 2 - 2), k < 0.45 ? W.met3 : W.met2);
      R(c, i, Math.round(cy - r) + 1, 1, 1, '#e8f4fb');
      if (rng.next() < 0.3) R(c, i, Math.round(cy) + (rng.next() < 0.5 ? 0 : 1), 1, 1, W.met1);
    }
    // tail
    const tx = w - uw(2);
    for (let i = 0; i < uw(2); i++) { const r = 1 + i; R(c, tx + i, Math.round(cy - r), 1, r * 2, W.ink); R(c, tx + i, Math.round(cy - r) + 1, 1, Math.max(1, r * 2 - 2), W.met2); }
    R(c, 1, Math.round(cy) - 1, 1, 1, '#ffffff'); R(c, 2, Math.round(cy) - 1, 1, 1, W.ink);  // eye
  }
  P.fish = prop(9, 5, (c, rng, w, h) => fishBody(c, rng, w, h, false), { ay: 2.5 });
  P.fishFat = prop(11, 6, (c, rng, w, h) => fishBody(c, rng, w, h, true), { ay: 3 });

  // --- anchor / bucket / pot / sack ---------------------------------------
  P.anchor = prop(7, 11, (c, rng, w, h) => {
    const cx = (w >> 1);
    R(c, cx - 1, 1, 3, h - 3, W.ink); R(c, cx, 2, 1, h - 5, W.met2);
    R(c, cx - 2, 1, 5, 2, W.ink); R(c, cx - 1, 1, 3, 1, W.met3);      // ring
    R(c, 1, uw(2), w - 2, 2, W.ink); R(c, 1, uw(2), w - 2, 1, W.met2); // stock
    for (let i = 0; i < w; i++) {   // flukes
      const k = Math.abs(i - cx) / cx;
      const y = h - 2 - Math.round((1 - k) * uw(1.5));
      R(c, i, y - 2, 1, 3, W.ink); R(c, i, y - 1, 1, 1, W.met1);
    }
    fleck(c, rng, 1, 2, w - 2, h - 3, 4, [W.rust1, W.rust0]);
  });
  P.bucket = prop(7, 6, (c, rng, w, h) => {
    R(c, 0, 0, w, h, W.ink);
    for (let y = 1; y < h - 1; y++) { const in0 = Math.round((y / h) * 1.2); R(c, 1 + in0, y, w - 2 - in0 * 2, 1, y < 2 ? W.met3 : W.met2); }
    R(c, 1, 1, w - 2, 1, W.met3); R(c, 2, h - 2, w - 4, 1, W.met1);
    R(c, 1, 0, 1, 2, W.met1); R(c, w - 2, 0, 1, 2, W.met1);
    fleck(c, rng, 1, 2, w - 2, h - 3, 3, [W.rust1]);
  });
  P.pot = prop(6, 6, (c, rng, w, h) => {
    R(c, 0, 1, w, h - 1, W.ink);
    R(c, 1, 2, w - 2, h - 3, W.met0); R(c, 1, 2, w - 2, 1, W.met1);
    R(c, 0, 0, w, 2, W.ink); R(c, 1, 0, w - 2, 1, W.met2);
    void rng;
  });
  P.sack = prop(7, 6, (c, rng, w, h) => {
    R(c, 1, 0, w - 2, h, W.ink); R(c, 0, 2, w, h - 2, W.ink);
    R(c, 1, 1, w - 2, h - 2, W.rope1);
    R(c, 1, 1, w - 2, 1, W.rope2);
    R(c, 2, 1, 1, h - 2, W.rope2); R(c, w - 3, 2, 1, h - 3, W.rope0);
    R(c, Math.round(w / 2) - 1, 0, 2, 2, W.rope0);
    fleck(c, rng, 1, 2, w - 2, h - 3, 4, [W.rope0, W.rope2]);
  });
  P.tyre = prop(6, 6, (c, rng, w, h) => {
    const cx = w / 2 - 0.5, cy = h / 2 - 0.5, r = Math.min(cx, cy) + 0.5;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      if (d < r * 0.45) continue;
      R(c, x, y, 1, 1, d > r * 0.85 ? '#100c0e' : ((x + y) & 1 ? '#2a2226' : '#211b1e'));
    }
    void rng;
  });

  // --- lanterns -----------------------------------------------------------
  function lanternBody(c, w, h, lit) {
    R(c, Math.round(w / 2) - 1, 0, 2, 2, W.ink);
    R(c, 1, 2, w - 2, 2, W.ink); R(c, 2, 2, w - 4, 1, W.met2);
    R(c, 0, 3, w, h - 3, W.ink);
    R(c, 1, 4, w - 2, h - 6, lit ? '#ffe9a6' : W.met0);
    if (lit) { R(c, 2, 5, w - 4, h - 8, '#fff6d5'); R(c, 1, 4, w - 2, 1, '#ffd27a'); }
    else { R(c, 2, 5, w - 4, h - 8, W.met1); }
    R(c, 1, h - 2, w - 2, 1, W.met1);
    for (let y = 4; y < h - 2; y += 3) R(c, 1, y, w - 2, 1, 'rgba(26,16,21,0.5)');
  }
  P.lantern = prop(5, 10, (c, rng, w, h) => lanternBody(c, w, h, true), { ay: 0 });
  P.lanternOut = prop(5, 10, (c, rng, w, h) => lanternBody(c, w, h, false), { ay: 0 });

  // --- gulls (small, drawn in world space at 1/K) --------------------------
  P.gull = prop(6, 4, (c) => {
    R(c, 0, 1, 2, 1, W.ink); R(c, uw(4), 1, 2, 1, W.ink);
    R(c, 1, 0, 1, 1, '#e6f2ff'); R(c, uw(4), 0, 1, 1, '#e6f2ff');
    R(c, 2, 1, uw(2), 2, '#ffffff'); R(c, 2, 2, uw(2), 1, '#c9d8e4');
    R(c, uw(2) + 2, 2, 1, 1, '#f2c744');
  }, { ax: 3, ay: 2 });
  P.gull2 = prop(6, 4, (c) => {
    R(c, 0, 2, 2, 1, W.ink); R(c, uw(4), 2, 2, 1, W.ink);
    R(c, 2, 1, uw(2), 2, '#ffffff'); R(c, 2, 2, uw(2), 1, '#c9d8e4');
    R(c, uw(2) + 2, 2, 1, 1, '#f2c744');
  }, { ax: 3, ay: 2 });

  /* ======================================================================
     2.  KIT  --  procedural architecture, all arguments in ART pixels
     ====================================================================== */
  const Kit = {};

  // -- side-on deck slab: the edge of a boardwalk seen from slightly above --
  Kit.deck = function (c, x, y, w, rng, o) {
    o = o || {};
    const th = o.th || uw(3);
    x = Math.round(x); y = Math.round(y); w = Math.round(w);
    R(c, x, y + th, w, 1, W.shadow);
    R(c, x, y, w, th, W.deck1);
    let bx = x;
    while (bx < x + w) {
      const bw = Math.min(x + w - bx, uw(2.5) + Math.floor(rng.next() * uw(3)));
      const t = rng.next();
      const top = t > 0.72 ? W.deck4 : t > 0.4 ? W.deck3 : W.deck2;
      R(c, bx, y, bw, 1, top);
      R(c, bx, y + 1, bw, Math.max(1, th - 4), t > 0.5 ? W.deck2 : W.deck1);
      R(c, bx, y + th - 3, bw, 2, W.deck0);
      R(c, bx, y + th - 1, bw, 1, W.ink);
      if (rng.next() < 0.5) R(c, bx + 1 + Math.floor(rng.next() * Math.max(1, bw - 2)), y + 1, 1, Math.max(1, th - 4), W.deck0);
      R(c, bx, y, 1, th - 1, W.deck0);
      if (rng.next() < 0.5) R(c, bx + 1, y, 1, 1, W.met2);
      bx += bw;
    }
    R(c, x, y, w, 1, W.deck3);
    for (let i = 0; i < w; i++) if (rng.next() < 0.12) R(c, x + i, y, 1, 1, W.deck4);
    R(c, x, y + th - 1, w, 1, W.ink);
    return y + th;
  };

  // -- a driven pile -------------------------------------------------------
  Kit.pile = function (c, x, yTop, yBot, wdt, rng, style, waterY) {
    wdt = wdt || uw(2.5);
    x = Math.round(x); yTop = Math.round(yTop); yBot = Math.round(yBot);
    const h = yBot - yTop; if (h <= 0) return null;
    const lean = style === 3 ? 0 : (rng.next() - 0.5) * U * 1.5;
    for (let i = 0; i < h; i++) {
      const yy = yTop + i, off = Math.round(lean * (i / h));
      R(c, x + off, yy, wdt, 1, W.post1);
      R(c, x + off, yy, 1, 1, W.post2);
      R(c, x + off + 1, yy, 1, 1, W.post3);
      R(c, x + off + wdt - 1, yy, 1, 1, W.post0);
      R(c, x + off + wdt - 2, yy, 1, 1, shade(W.post1, 0.8));
      if (rng.next() < 0.10) R(c, x + off + 1 + Math.floor(rng.next() * (wdt - 2)), yy, 1, 1, W.post0);
      if (rng.next() < 0.06) R(c, x + off + 1 + Math.floor(rng.next() * (wdt - 2)), yy, 1, 1, W.post3);
    }
    for (let i = 0; i < h; i++) {
      const off = Math.round(lean * (i / h));
      R(c, x + off - 1, yTop + i, 1, 1, W.ink);
      R(c, x + off + wdt, yTop + i, 1, 1, W.ink);
    }
    // iron bolt plates
    const bolts = Math.max(1, Math.floor(h / uw(14)));
    for (let b = 0; b < bolts; b++) {
      const by = yTop + uw(4) + Math.round(rng.next() * (h - uw(8))) - b * uw(9);
      if (by < yTop + 2 || by > yBot - 3) continue;
      const off = Math.round(lean * ((by - yTop) / h));
      R(c, x + off - 1, by, wdt + 2, 2, W.met0);
      R(c, x + off - 1, by, wdt + 2, 1, W.met2);
      R(c, x + off + 1, by, 1, 2, W.met3);
      if (rng.next() < 0.5) R(c, x + off + wdt - 2, by, 1, 2, W.rust1);
    }
    // wet, weedy, barnacled base
    if (waterY !== undefined && yBot >= waterY - U) {
      const wetTop = Math.max(yTop, waterY - uw(6) - Math.floor(rng.next() * uw(3)));
      for (let yy = wetTop; yy < yBot; yy++) {
        const off = Math.round(lean * ((yy - yTop) / h));
        R(c, x + off, yy, wdt, 1, yy > waterY - U * 2 ? W.wet : mix(W.post1, W.wet, 0.55));
        if (rng.next() < 0.3) R(c, x + off + Math.floor(rng.next() * wdt), yy, 1, 1, W.alg);
        if (rng.next() < 0.12) R(c, x + off + Math.floor(rng.next() * wdt), yy, 1, 1, W.alg2);
        if (rng.next() < 0.09) R(c, x + off + Math.floor(rng.next() * wdt), yy, 1, 1, W.barn);
      }
    }
    if (style === 1 || style === 3 || rng.next() < 0.25) {
      const ly = yTop + uw(3) + Math.floor(rng.next() * Math.max(1, h - uw(9)));
      Kit.lashing(c, x - 1, ly, wdt + 2, rng);
    }
    return { x, top: yTop, bot: yBot, w: wdt, lean };
  };
  Kit.pillar = Kit.pile;

  Kit.lashing = function (c, x, y, w, rng) {
    const th = uw(2);
    R(c, x, y - 1, w, 1, W.ink);
    for (let i = 0; i < th; i++) {
      R(c, x, y + i, w, 1, i % 2 ? W.rope0 : W.rope1);
      for (let k = 0; k < w; k += 2) if (rng.next() < 0.5) R(c, x + k, y + i, 1, 1, i % 2 ? W.rope1 : W.rope2);
    }
    R(c, x, y + th, w, 1, W.ink);
    if (rng.next() < 0.5) { R(c, x + w - 1, y + th, 1, uw(1.5), W.rope0); }
  };

  Kit.brace = function (c, x0, y0, x1, y1, th) {
    th = th || uw(1.5);
    pline(c, x0, y0, x1, y1, th + 2, W.ink);
    pline(c, x0, y0, x1, y1, th, W.post1);
    pline(c, x0, y0, x1, y1, Math.max(1, th - 2), W.post2);
    // bolt at each end
    R(c, Math.round(x0) - 1, Math.round(y0) - 1, 2, 2, W.met2);
    R(c, Math.round(x1) - 1, Math.round(y1) - 1, 2, 2, W.met2);
  };

  // -- railing along a deck -------------------------------------------------
  Kit.railing = function (c, x, y, w, rng, o) {
    o = o || {};
    const h = o.h || uw(7), spacing = o.spacing || uw(6);
    x = Math.round(x); y = Math.round(y);
    for (let px2 = 0; px2 <= w - 2; px2 += spacing) {
      const broken = o.broken && rng.next() < 0.25;
      const ph = broken ? Math.floor(h * rng.range(0.3, 0.6)) : h;
      const tilt = broken ? Math.round(rng.range(-U, U)) : 0;
      pline(c, x + px2, y, x + px2 + tilt, y - ph, uw(2), W.ink);
      pline(c, x + px2, y, x + px2 + tilt, y - ph, uw(1), W.post1);
      R(c, x + px2, y - ph, 1, Math.max(1, ph - 2), W.post2);
      if (broken) { R(c, x + px2 + tilt, y - ph, 2, 1, W.deck4); R(c, x + px2 + tilt - 1, y - ph - 1, 1, 1, W.deck3); }
    }
    if (o.rope) {
      for (let px2 = 0; px2 < w; px2++) {
        const s = (px2 % spacing) / spacing;
        const sag = Math.sin(s * Math.PI) * U * 1.5;
        R(c, x + px2, y - h + 1 + Math.round(sag), 1, 1, px2 % 3 ? W.rope1 : W.rope2);
        R(c, x + px2, y - h + 2 + Math.round(sag), 1, 1, W.rope0);
      }
    } else {
      R(c, x, y - h - 1, w, 1, W.ink);
      R(c, x, y - h, w, uw(1.5), W.deck2);
      R(c, x, y - h, w, 1, W.deck3);
      R(c, x, y - h + uw(1.5), w, 1, W.ink);
      R(c, x, y - Math.round(h * 0.45), w, uw(1), W.deck1);
      R(c, x, y - Math.round(h * 0.45) + uw(1), w, 1, W.ink);
      for (let px2 = 0; px2 < w; px2 += 3) if (rng.next() < 0.22) R(c, x + px2, y - h, 1, 1, W.deck4);
    }
  };

  // -- hanging net ---------------------------------------------------------
  Kit.net = function (c, x, y, w, h, rng, o) {
    o = o || {};
    x = Math.round(x); y = Math.round(y);
    const sag = o.sag === undefined ? uw(1.5) : o.sag;
    const g = uw(1);
    for (let i = 0; i < w; i += g + 1) {
      const s = Math.round(Math.sin(i / w * Math.PI) * sag);
      const hh = h + s;
      for (let j = 0; j < hh; j += g + 1) {
        R(c, x + i, y + j, 1, 1, W.net1);
        if ((i + j) % (2 * (g + 1)) === 0) R(c, x + i + 1, y + j + 1, 1, 1, W.net0);
        if (rng.next() < 0.08) R(c, x + i, y + j, 1, 1, W.net2);
      }
      R(c, x + i, y + hh, 1, 1, W.rope0);
      R(c, x + i + 1, y + hh, 1, 1, W.rope1);
    }
    R(c, x, y - 1, w, 1, W.rope0);
    for (let i = uw(1); i < w - uw(1); i += uw(4) + Math.floor(rng.next() * uw(2))) {
      const s = Math.round(Math.sin(i / w * Math.PI) * sag);
      const fy = y + h + s + 1, hot = rng.next() < 0.6;
      R(c, x + i - 1, fy, uw(1.5), uw(1.5), W.ink);
      R(c, x + i - 1, fy, uw(1.5), 1, hot ? W.float1 : W.float2);
      R(c, x + i - 1, fy + 1, uw(1.5), uw(1), hot ? W.float0 : W.rope1);
    }
  };

  // -- ladder ---------------------------------------------------------------
  Kit.ladder = function (c, x, y, h, rng) {
    x = Math.round(x); y = Math.round(y);
    const rail = uw(1), gap = uw(3);
    R(c, x - 1, y, 1, h, W.ink); R(c, x + gap + rail, y, 1, h, W.ink);
    R(c, x, y, rail, h, W.post1); R(c, x + gap, y, rail, h, W.post1);
    R(c, x, y, 1, h, W.post2); R(c, x + gap, y, 1, h, W.post2);
    for (let i = uw(1.5); i < h - 1; i += uw(2.5)) {
      R(c, x, y + i, gap + rail, 1, W.ink);
      R(c, x, y + i - 1, gap + rail, 1, W.deck2);
      if (rng.next() < 0.3) R(c, x + 1 + Math.floor(rng.next() * gap), y + i - 1, 1, 1, W.deck4);
    }
  };

  // -- stairs ---------------------------------------------------------------
  Kit.stairs = function (c, x, y, w, h, dir, rng) {
    const rise = uw(2);
    const steps = Math.max(2, Math.round(h / rise));
    const sw = Math.max(uw(2), Math.round(w / steps));
    for (let i = 0; i < steps; i++) {
      const sx = dir > 0 ? x + i * sw : x + w - (i + 1) * sw;
      const sy = y + i * rise;
      R(c, sx - 1, sy - 1, sw + 2, 1, W.ink);
      R(c, sx, sy, sw, 1, W.deck3);
      R(c, sx, sy + 1, sw, rise - 2, W.deck1);
      R(c, sx, sy + rise - 1, sw, 1, W.deck0);
      if (rng.next() < 0.4) R(c, sx + 1 + Math.floor(rng.next() * (sw - 2)), sy, 1, 1, W.deck4);
    }
    for (let i = 0; i < steps; i++) {
      const sx = dir > 0 ? x + i * sw : x + w - (i + 1) * sw;
      R(c, dir > 0 ? sx : sx + sw - uw(1), y + i * rise + rise, uw(1), rise, W.post0);
    }
  };

  // -- drying rack with hanging fish ---------------------------------------
  Kit.fishRack = function (c, x, y, w, rng, o) {
    o = o || {};
    const h = o.h || uw(11), leg = uw(1);
    R(c, x - 1, y - h, 1, h, W.ink); R(c, x + w, y - h, 1, h, W.ink);
    R(c, x, y - h, leg, h, W.post1); R(c, x + w - leg, y - h, leg, h, W.post1);
    R(c, x, y - h, 1, h, W.post2); R(c, x + w - leg, y - h, 1, h, W.post2);
    // two cross beams
    for (const by of [y - h, y - Math.round(h * 0.58)]) {
      R(c, x - uw(1), by - 1, w + uw(2), 1, W.ink);
      R(c, x - uw(1), by, w + uw(2), uw(1), W.deck2);
      R(c, x - uw(1), by + uw(1), w + uw(2), 1, W.ink);
    }
    for (let i = uw(1.5); i < w - uw(1.5); i += uw(3)) {
      const ln = uw(1.5) + Math.floor(rng.next() * uw(1.5));
      const top = rng.next() < 0.5 ? y - h : y - Math.round(h * 0.58);
      R(c, x + i, top + uw(1), 1, ln, W.rope0);
      const f = rng.next() < 0.4 ? P.fishFat : P.fish;
      // hung by the tail: rotate by drawing the sprite column-flipped-ish
      c.save(); c.translate(x + i + 1, top + uw(1) + ln); c.rotate(Math.PI / 2); c.drawImage(f.c, -Math.round(f.h / 2), -f.w); c.restore();
    }
    Kit.brace(c, x + 1, y - 2, x + w - 2, y - h + uw(3), uw(1));
  };

  // -- mooring bollard (post with a rope turn) ------------------------------
  Kit.bollard = function (c, x, y, rng, o) {
    o = o || {};
    const w = uw(3), h = o.h || uw(5);
    R(c, x - 1, y - h - 1, w + 2, h + 2, W.ink);
    R(c, x, y - h, w, h, W.post1);
    R(c, x, y - h, 1, h, W.post2);
    R(c, x + w - 1, y - h, 1, h, W.post0);
    R(c, x - 1, y - h - uw(1), w + 2, uw(1), W.ink);
    R(c, x, y - h - uw(1) + 1, w, uw(1) - 1 || 1, W.post3);   // mushroom cap
    Kit.lashing(c, x - 1, y - Math.round(h * 0.55), w + 2, rng);
  };

  // -- deck cleat -----------------------------------------------------------
  Kit.cleat = function (c, x, y) {
    R(c, x, y, uw(3), uw(1), W.ink);
    R(c, x, y, uw(3), 1, W.met2);
    R(c, x - 1, y - 1, 2, 2, W.met1); R(c, x + uw(3) - 1, y - 1, 2, 2, W.met1);
  };

  // -- hand winch / capstan on a deck ---------------------------------------
  Kit.winch = function (c, x, y, rng) {
    const w = uw(6), h = uw(5);
    R(c, x, y - uw(1), w, uw(1), W.ink);
    R(c, x + 1, y - h, w - 2, h - 1, W.ink);
    R(c, x + uw(1), y - h + 1, w - uw(2), h - uw(1.5), W.met1);
    for (let i = 0; i < w - uw(2); i += 2) R(c, x + uw(1) + i, y - h + 1, 1, h - uw(1.5), i % 4 ? W.met2 : W.rope1);
    R(c, x + uw(1), y - h + 1, w - uw(2), 1, W.met3);
    // crank handle
    R(c, x + w - 1, y - h + uw(1), uw(2), 1, W.ink);
    R(c, x + w + uw(1) - 1, y - h + uw(1), 1, uw(2), W.met2);
    fleck(c, rng, x + uw(1), y - h + 1, w - uw(2), h - uw(2), 4, [W.rust1, W.rust2]);
  };

  // -- davit / small crane over the water -----------------------------------
  Kit.davit = function (c, x, y, rng, dir) {
    dir = dir || 1;
    const h = uw(14), reach = uw(9);
    R(c, x - 1, y - h, uw(2) + 2, h, W.ink);
    R(c, x, y - h, uw(2), h, W.met1);
    R(c, x, y - h, 1, h, W.met2);
    // arm, curving out over the water
    let ax = x, ay = y - h;
    for (let i = 0; i < reach; i++) {
      const yy = ay + Math.round(Math.pow(i / reach, 2.2) * uw(2));
      R(c, ax + dir * i, yy - 1, 1, uw(1.5) + 1, W.ink);
      R(c, ax + dir * i, yy, 1, uw(1.5) - 1 || 1, W.met2);
    }
    // stay wire + hanging block and hook
    pline(c, x + uw(1), y - h + uw(3), x + dir * reach, ay + uw(1), 1, W.met0);
    const hx = x + dir * reach, hy = ay + uw(2);
    R(c, hx - 1, hy, uw(1.5), uw(2), W.ink); R(c, hx, hy + 1, 1, uw(1), W.met3);
    for (let i = 0; i < uw(4); i++) R(c, hx, hy + uw(2) + i, 1, 1, i % 2 ? W.met1 : W.met2);
    R(c, hx - 1, hy + uw(6), uw(2), 1, W.met2);
    void rng;
  };

  // -- stack of crab pots ---------------------------------------------------
  Kit.crabPots = function (c, x, y, n, rng) {
    for (let i = 0; i < n; i++) {
      const px2 = x + Math.round(rng.range(-uw(1), uw(1)));
      c.drawImage(P.crabPot.c, px2, y - P.crabPot.h * (i + 1) + i * uw(1));
    }
  };

  // -- slipway: timber rails running down into the water --------------------
  Kit.slipway = function (c, x, y, w, len, rng) {
    const dry = '#8e8578', mid = '#6e6a60', wetc = '#42513c';
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const base = t < 0.45 ? mix(dry, mid, t / 0.45) : mix(mid, wetc, (t - 0.45) / 0.55);
      R(c, x, y + i, w, 1, base);
    }
    // cobbled courses, weed creeping up from the waterline
    for (let i = 0; i < len; i += uw(2)) {
      const t = i / len;
      R(c, x, y + i, w, 1, shade(t < 0.5 ? mid : wetc, 0.85));
      for (let q = (i / uw(2)) % 2 ? 0 : uw(1.5); q < w; q += uw(3)) R(c, x + q, y + i, 1, uw(2), 'rgba(20,18,16,0.35)');
    }
    for (let i = 0; i < len; i++) {
      const t = i / len;
      for (let q = 0; q < w; q += 1) {
        const r = rng.next();
        if (r < 0.03) R(c, x + q, y + i, 1, 1, t > 0.5 ? W.alg : shade(dry, 1.12));
        else if (r < 0.05 && t > 0.35) R(c, x + q, y + i, 1, 1, W.alg2);
      }
    }
    R(c, x - 1, y, 1, len, W.ink); R(c, x + w, y, 1, len, W.ink);
    for (const rx of [x + uw(2), x + w - uw(3)]) {
      for (let i = 0; i < len; i++) {
        const t = i / len;
        R(c, rx - 1, y + i, uw(1.5) + 2, 1, W.ink);
        R(c, rx, y + i, uw(1.5), 1, t > 0.62 ? mix(W.post1, W.wet, 0.7) : W.post1);
        R(c, rx, y + i, 1, 1, t > 0.62 ? W.wet : W.post3);
        if (i % uw(4) === 0) R(c, rx, y + i, uw(1.5), 1, W.post2);
      }
    }
    // sleepers
    for (let i = uw(2); i < len; i += uw(5)) { R(c, x + 1, y + i, w - 2, uw(1), W.post0); R(c, x + 1, y + i, w - 2, 1, W.post1); }
  };

  // -- a hull up in a cradle, mid-repair ------------------------------------
  Kit.cradleHull = function (c, x, y, len, rng) {
    const h = uw(7);
    // cradle timbers
    for (const kx of [x + uw(3), x + len - uw(5)]) {
      R(c, kx - 1, y - uw(3), uw(1) + 2, uw(3), W.ink);
      R(c, kx, y - uw(3), uw(1), uw(3), W.post1);
      R(c, kx - uw(2), y - uw(3) - 1, uw(5), uw(1), W.post2);
    }
    // planked hull, some planks missing
    const top = y - uw(3) - h;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const rise = Math.round(Math.pow(Math.abs(k - 0.45) * 2, 2.1) * uw(3));
      const yy = top - rise;
      R(c, x + i, yy, 1, h + rise, W.deck1);
      R(c, x + i, yy, 1, 1, W.ink);
      R(c, x + i, yy + 1, 1, 1, W.deck3);
      if (i === 0 || i === len - 1) R(c, x + i, yy, 1, h + rise, W.ink);
      if ((i % uw(6)) === 0) R(c, x + i, yy + 1, 1, h + rise - 1, W.deck0);
    }
    // ribs showing through a hole in the planking
    const hx = x + Math.round(len * 0.45), hw = uw(5);
    R(c, hx, top + uw(1), hw, uw(4), W.tar);
    for (let i = 0; i < hw; i += uw(1.5)) R(c, hx + i, top + uw(1), 1, uw(4), W.deck2);
    R(c, hx - 1, top + uw(1) - 1, hw + 2, 1, W.deck4);
    // a ladder leaning on it and a bucket of tar
    Kit.ladder(c, x + len - uw(8), top + uw(1), uw(9), rng);
    c.drawImage(P.bucket.c, x + uw(1), y - P.bucket.h);
  };

  // -- a moored rowboat, side view -----------------------------------------
  Kit.rowboat = function (c, x, y, len, rng) {
    const h = uw(4.5);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const bowRise = Math.round(Math.pow(Math.abs(k - 0.5) * 2, 2.2) * uw(2.5));
      const yy = y - h - bowRise;
      R(c, x + i, yy, 1, h + bowRise, W.deck1);
      R(c, x + i, yy, 1, 1, W.deck3);
      R(c, x + i, yy + 1, 1, 1, W.deck2);
      R(c, x + i, y - uw(1.5), 1, uw(1.5), W.deck0);
      R(c, x + i, y, 1, 1, W.ink);
      if ((i % uw(5)) === 0) R(c, x + i, yy + 2, 1, h + bowRise - 3, W.deck0);
      if (rng.next() < 0.1) R(c, x + i, yy + 2 + Math.floor(rng.next() * uw(2)), 1, 1, W.deck0);
      if (i === 0 || i === len - 1) R(c, x + i, yy, 1, h + bowRise, W.ink);
    }
    R(c, x, y - h - uw(2.5), len, 1, W.ink);
    R(c, x + uw(1), y - h + 1, len - uw(2), uw(1.5), W.shadow);
    // thwarts
    for (const tk of [0.3, 0.65]) { R(c, x + Math.round(len * tk), y - h + 1, uw(1.5), uw(1.5), W.deck2); R(c, x + Math.round(len * tk), y - h + 1, uw(1.5), 1, W.deck3); }
    // oar across the gunwale
    pline(c, x + uw(1.5), y - h + 1, x + len - uw(2.5), y - h - uw(3), uw(1) + 1, W.ink);
    pline(c, x + uw(1.5), y - h + 1, x + len - uw(2.5), y - h - uw(3), 1, W.deck3);
    R(c, x + len - uw(3.5), y - h - uw(4), uw(1.5), uw(2), W.ink);
    R(c, x + len - uw(3), y - h - uw(4) + 1, uw(1), uw(1.5), W.deck2);
    // a coil of rope in the bow
    c.drawImage(P.ropeCoil.c, x + uw(1), y - h - uw(1));
  };

  // -- roofs ----------------------------------------------------------------
  // corrugated iron: hard vertical ribs, rust streaks, a ridge cap
  Kit.roofCorrugated = function (c, x, top, w, roofH, col, rng) {
    for (let i = 0; i < roofH; i++) {
      const k = i / roofH;
      const rw = Math.round(lerp(uw(2), w, Math.pow(k, 0.9)));
      const rx = Math.round(x + w / 2 - rw / 2);
      const ry = top - roofH + i;
      for (let q = 0; q < rw; q++) {
        const rib = q % uw(2);
        R(c, rx + q, ry, 1, 1, rib === 0 ? shade(col.roof[2], 1.12) : rib === 1 ? col.roof[1] : col.roof[0]);
      }
      if (i % uw(4) === 0) R(c, rx, ry, rw, 1, col.roof[0]);
      if (rng.next() < 0.35) R(c, rx + Math.floor(rng.next() * rw), ry, 1, uw(2), W.rust1);
      R(c, rx - 1, ry, 1, 1, W.ink); R(c, rx + rw, ry, 1, 1, W.ink);
    }
  };
  // shingles: overlapping courses with staggered tabs
  Kit.roofShingle = function (c, x, top, w, roofH, col, rng) {
    const course = uw(1.5);
    for (let i = 0; i < roofH; i++) {
      const k = i / roofH;
      const rw = Math.round(lerp(uw(2), w, Math.pow(k, 0.92)));
      const rx = Math.round(x + w / 2 - rw / 2);
      const ry = top - roofH + i;
      const row = Math.floor(i / course);
      R(c, rx, ry, rw, 1, row % 2 ? col.roof[1] : col.roof[2]);
      if (i % course === course - 1) {
        R(c, rx, ry, rw, 1, col.roof[0]);
        for (let q = (row * uw(1.5)) % uw(3); q < rw; q += uw(3)) R(c, rx + q, ry - 1, 1, 1, col.roof[0]);
      }
      if (i % course === 0) for (let q = 0; q < rw; q += 2) if (rng.next() < 0.18) R(c, rx + q, ry, 1, 1, col.roof[2]);
      R(c, rx - 1, ry, 1, 1, W.ink); R(c, rx + rw, ry, 1, 1, W.ink);
    }
  };

  // -- a building -----------------------------------------------------------
  // kinds: cottage | shed | loft (two storey, hoist beam) | boathouse (open end)
  //        | office (harbour master, balcony) | market (open front, awning)
  Kit.house = function (c, x, y, w, wallH, col, rng, o) {
    o = o || {};
    const kind = o.kind || 'cottage';
    const lights = [];
    let smoke = null;
    const roofH = o.roofH || (Math.round(w * 0.30) + uw(3));
    const over = uw(2.5);
    const top = y - wallH;
    const corr = kind === 'shed' || kind === 'boathouse' || kind === 'market';

    // floor joists
    R(c, x - uw(1), y, w + uw(2), 1, W.ink);
    R(c, x - uw(1), y - uw(1), w + uw(2), uw(1), W.post1);
    R(c, x - uw(1) + 1, y - uw(1), w + uw(2) - 2, 1, W.post2);

    // ---- wall: vertical board-and-batten siding
    R(c, x, top, w, wallH, col.wall[1]);
    let bx = x;
    while (bx < x + w) {
      const bw = uw(1.5) + Math.floor(rng.next() * uw(1));
      const t = rng.next();
      R(c, bx, top, Math.min(bw, x + w - bx), wallH, t > 0.66 ? col.wall[2] : t > 0.3 ? col.wall[1] : col.wall[0]);
      R(c, bx, top, 1, wallH, col.dk);
      if (rng.next() < 0.22) R(c, bx + 1, top + Math.floor(rng.next() * wallH * 0.4), 1, Math.floor(rng.range(uw(2), wallH * 0.5)), col.dk);
      bx += bw;
    }
    R(c, x, top, w, 1, col.wall[2]);
    R(c, x, y - uw(1.5), w, uw(1.5), col.dk);
    R(c, x, top, uw(1), wallH, col.wall[0]); R(c, x + w - uw(1), top, uw(1), wallH, col.dk);
    R(c, x - 1, top, 1, wallH, W.ink); R(c, x + w, top, 1, wallH, W.ink);
    // damp / salt stain along the bottom
    for (let i = 0; i < w; i++) if (rng.next() < 0.5) R(c, x + i, y - uw(2.5) - Math.floor(rng.next() * uw(1.5)), 1, uw(1), mix(col.dk, W.wet, 0.4));

    // ---- openings by kind -------------------------------------------------
    const doorW = uw(4.5), doorH = Math.min(uw(8), wallH - uw(4));
    const doorX = x + (o.doorLeft ? uw(1.5) : Math.round(w * (o.doorAt === undefined ? 0.62 : o.doorAt)));
    const doorY = y - doorH - uw(1.5);

    if (kind === 'boathouse' || kind === 'market') {
      // a big open mouth: dark interior, a boat or a counter inside
      const ow = Math.round(w * (kind === 'boathouse' ? 0.62 : 0.72));
      const ox2 = x + Math.round((w - ow) / 2);
      const oh = wallH - uw(3);
      R(c, ox2 - 1, y - oh - 1, ow + 2, oh + 1, W.ink);
      R(c, ox2, y - oh, ow, oh, '#150f14');
      // header beam
      R(c, ox2 - uw(1), y - oh - uw(1), ow + uw(2), uw(1), W.post1);
      R(c, ox2 - uw(1), y - oh - uw(1), ow + uw(2), 1, W.post2);
      if (kind === 'boathouse') {
        // hull nose in the shadow, and rails running out
        const bl = Math.round(ow * 0.7);
        for (let i = 0; i < bl; i++) {
          const k = i / bl, rise = Math.round(Math.pow(1 - k, 1.8) * uw(3));
          R(c, ox2 + Math.round((ow - bl) / 2) + i, y - uw(4) - rise, 1, uw(4) + rise, i % uw(4) === 0 ? W.deck0 : W.deck1);
          R(c, ox2 + Math.round((ow - bl) / 2) + i, y - uw(4) - rise, 1, 1, W.deck3);
        }
        for (const rx of [ox2 + uw(1), ox2 + ow - uw(2)]) R(c, rx, y - uw(1), uw(1), uw(1), W.post2);
        lights.push({ x: ox2 + uw(1), y: y - uw(3), w: ow - uw(2), h: uw(2), ph: rng.range(0, TAU), k: 0.35 });
      } else {
        // market counter with fish laid out
        R(c, ox2, y - uw(4), ow, uw(1.5), W.deck2);
        R(c, ox2, y - uw(4), ow, 1, W.deck4);
        R(c, ox2, y - uw(4) + uw(1.5), ow, 1, W.ink);
        for (let i = uw(1); i < ow - uw(3); i += uw(3)) c.drawImage(P.fish.c, ox2 + i, y - uw(5) - 1);
        lights.push({ x: ox2 + uw(1), y: y - oh + uw(1), w: ow - uw(2), h: uw(2), ph: rng.range(0, TAU), k: 0.5 });
      }
      // roller-door tracks either side
      R(c, ox2 - uw(1), y - oh, 1, oh, col.dk); R(c, ox2 + ow + 1, y - oh, 1, oh, col.dk);
    } else {
      // plain plank door
      R(c, doorX - 1, doorY - 1, doorW + 2, doorH + 2, W.ink);
      R(c, doorX, doorY, doorW, doorH, W.deck1);
      for (let i = 0; i < doorW; i += uw(1.5)) { R(c, doorX + i, doorY, 1, doorH, W.deck0); R(c, doorX + i + 1, doorY, 1, doorH, W.deck2); }
      R(c, doorX, doorY, doorW, 1, W.deck3);
      R(c, doorX, doorY + Math.round(doorH * 0.32), doorW, 1, W.deck0);   // ledge brace
      R(c, doorX + doorW - uw(1.5), doorY + Math.round(doorH / 2), uw(1), 1, W.met3);
      if (o.doorOpen) {
        R(c, doorX + uw(1.5), doorY + 1, doorW - uw(1.5), doorH - 1, '#160f14');
        lights.push({ x: doorX + uw(1.5), y: doorY + doorH - uw(3), w: doorW - uw(1.5), h: uw(2.5), ph: rng.range(0, TAU), k: 0.5 });
      }
      // a step / threshold stone
      R(c, doorX - uw(1), y - uw(1.5), doorW + uw(2), uw(1), W.met1);
      R(c, doorX - uw(1), y - uw(1.5), doorW + uw(2), 1, W.met2);
    }

    // ---- windows -----------------------------------------------------------
    const nWin = kind === 'shed' ? (rng.next() < 0.6 ? 1 : 0) : (w > uw(22) ? 2 : 1);
    const winY = top + uw(2.5) + Math.floor(rng.next() * uw(1.5));
    for (let i = 0; i < nWin; i++) {
      const wx = x + uw(2.5) + Math.round((w - uw(8)) * (nWin === 1 ? (o.doorAt > 0.5 ? 0.12 : 0.7) : i * 0.62));
      const ww = uw(4.5), wh = uw(5);
      R(c, wx - uw(1), winY - uw(1), ww + uw(2), wh + uw(2), W.ink);
      R(c, wx - 1, winY - 1, ww + 2, wh + 2, col.trim);
      R(c, wx, winY, ww, wh, '#1a1218');
      lights.push({ x: wx, y: winY, w: ww, h: wh, ph: rng.range(0, TAU), k: 1, mull: true });
      R(c, wx - uw(1.5), winY + wh + 1, ww + uw(3), uw(1), col.trim);
      R(c, wx - uw(1.5), winY + wh + 1 + uw(1), ww + uw(3), 1, W.ink);
      const sw = uw(2);
      for (const s of [-1, 1]) {
        if (rng.next() < 0.3) continue;
        const sx2 = s < 0 ? wx - uw(1) - sw : wx + ww + uw(1);
        R(c, sx2 - 1, winY - uw(1), sw + 2, wh + uw(2), W.ink);
        R(c, sx2, winY - 1, sw, wh + uw(1), col.wall[0]);
        for (let q = 0; q < wh + uw(1); q += uw(1)) R(c, sx2, winY - 1 + q, sw, 1, col.dk);
        R(c, sx2, winY - 1, 1, wh + uw(1), col.wall[2]);
      }
    }

    // ---- roof --------------------------------------------------------------
    if (corr) Kit.roofCorrugated(c, x - over, top, w + over * 2, roofH, col, rng);
    else Kit.roofShingle(c, x - over, top, w + over * 2, roofH, col, rng);
    // eaves line + gutter + a downpipe
    R(c, x - over - 1, top, w + over * 2 + 2, 1, W.ink);
    R(c, x - over, top - 1, w + over * 2, uw(1), shade(col.roof[0], 1.1));
    R(c, x - over, top, w + over * 2, 1, W.met0);
    R(c, x - over + 1, top - 1, w + over * 2 - 2, 1, W.met2);
    const dp = rng.next() < 0.5 ? x + uw(1) : x + w - uw(2);
    R(c, dp, top, uw(1), wallH - uw(2), W.met1);
    R(c, dp, top, 1, wallH - uw(2), W.met3);
    R(c, dp - 1, top + Math.round(wallH * 0.5), uw(1) + 2, 1, W.met0);
    // ridge cap
    R(c, Math.round(x + w / 2 - uw(1.5)), top - roofH - 1, uw(3), uw(1) + 1, W.ink);
    R(c, Math.round(x + w / 2 - uw(1)), top - roofH - 1, uw(2), 1, col.roof[2]);
    // moss patch
    if (rng.next() < 0.6) {
      const mx = Math.round(x + rng.range(uw(2), w - uw(5))), my = top - Math.round(roofH * rng.range(0.25, 0.7));
      for (let i = 0; i < uw(6); i++) R(c, mx + Math.floor(rng.range(0, uw(3.5))), my + Math.floor(rng.range(0, uw(2))), 1, 1, rng.next() < 0.5 ? W.alg : W.alg2);
    }

    // ---- gable vent / hoist beam ------------------------------------------
    const gy = top - Math.round(roofH * 0.5);
    if (kind === 'loft') {
      // loft door up in the gable with a hoist beam and a block & tackle
      const lw = uw(4), lh = uw(4);
      R(c, Math.round(x + w / 2 - lw / 2) - 1, gy - 1, lw + 2, lh + 2, W.ink);
      R(c, Math.round(x + w / 2 - lw / 2), gy, lw, lh, '#150f14');
      lights.push({ x: Math.round(x + w / 2 - lw / 2), y: gy, w: lw, h: lh, ph: rng.range(0, TAU), k: 0.6 });
      const bmY = gy - uw(2);
      R(c, Math.round(x + w / 2) - 1, bmY - 1, uw(5), uw(1) + 2, W.ink);
      R(c, Math.round(x + w / 2), bmY, uw(4), uw(1), W.post1);
      const bx2 = Math.round(x + w / 2) + uw(4);
      for (let i = 0; i < uw(5); i++) R(c, bx2, bmY + uw(1) + i, 1, 1, i % 2 ? W.rope0 : W.rope1);
      R(c, bx2 - 1, bmY + uw(6), uw(2), uw(2), W.ink);
      R(c, bx2 - 1, bmY + uw(6), uw(2), 1, W.met2);
    } else {
      R(c, Math.round(x + w / 2 - uw(2)), gy, uw(4), uw(3), W.ink);
      R(c, Math.round(x + w / 2 - uw(2)) + 1, gy + 1, uw(4) - 2, uw(3) - 2, '#221a1c');
      for (let i = 0; i < uw(3) - 2; i += 2) R(c, Math.round(x + w / 2 - uw(2)) + 1, gy + 1 + i, uw(4) - 2, 1, col.trim);
    }

    // ---- chimney -----------------------------------------------------------
    if (o.chimney !== false && kind !== 'boathouse' && kind !== 'market') {
      const cxp = Math.round(x + (o.chimneyLeft ? w * 0.22 : w * 0.76));
      const rowK = Math.abs(cxp - (x + w / 2)) / (w / 2 + over);
      const roofTopY = top - roofH + Math.round(rowK * roofH);
      const ch2 = uw(6);
      R(c, cxp - uw(2), roofTopY - ch2, uw(4) + 1, ch2 + uw(1.5), W.ink);
      R(c, cxp - uw(2) + 1, roofTopY - ch2 + 1, uw(4) - 1, ch2 + uw(1), '#6b4a3c');
      for (let i = 0; i < ch2; i += uw(1.5)) {
        R(c, cxp - uw(2) + 1, roofTopY - ch2 + 1 + i, uw(4) - 1, 1, '#4a3128');
        R(c, cxp - uw(2) + 1 + (((i / uw(1.5)) % 2) ? uw(1) : uw(2)), roofTopY - ch2 + 2 + i, 1, uw(1), '#4a3128');
      }
      R(c, cxp - uw(2.5), roofTopY - ch2 - uw(1), uw(5) + 1, uw(1.5), W.ink);
      R(c, cxp - uw(2), roofTopY - ch2 - uw(1) + 1, uw(4), 1, '#8a6154');
      smoke = { x: cxp / K, y: (roofTopY - ch2 - uw(1.5)) / K };
    }

    // ---- awning / porch ----------------------------------------------------
    if (o.awning !== false && kind !== 'boathouse') {
      const ay = (kind === 'market' ? y - wallH + uw(2) : doorY - uw(2));
      const aw = kind === 'market' ? w + uw(4) : doorW + uw(5);
      const ax2 = kind === 'market' ? x - uw(2) : doorX - uw(2.5);
      R(c, ax2, ay - 1, aw, 1, W.ink);
      for (let i = 0; i < aw; i++) R(c, ax2 + i, ay, 1, uw(1.5), (Math.floor(i / uw(2)) % 2) ? col.roof[1] : col.trim);
      R(c, ax2, ay + uw(1.5), aw, 1, W.ink);
      R(c, ax2 + 1, ay + uw(2), uw(1), (kind === 'market' ? wallH - uw(3) : doorY - ay - uw(2)), W.post1);
      R(c, ax2 + aw - uw(1) - 1, ay + uw(2), uw(1), (kind === 'market' ? wallH - uw(3) : doorY - ay - uw(2)), W.post1);
      // hanging lamp
      const lxp = ax2 + aw - uw(2);
      R(c, lxp, ay, 1, uw(1), W.ink);
      c.drawImage(P.lantern.c, lxp - uw(1), ay + uw(1));
      lights.push({ x: lxp - uw(1), y: ay + uw(3), w: uw(2.5), h: uw(2.5), ph: rng.range(0, TAU), k: 1.3, lantern: true });
    }

    // ---- working clutter on the wall ---------------------------------------
    if (kind === 'loft' || kind === 'shed') {
      Kit.net(c, x + uw(1), top + wallH - uw(8), Math.min(uw(9), w - uw(3)), uw(5), rng, { sag: uw(1) });
    }
    if (rng.next() < 0.55) {
      const bx2 = x + w - uw(4.5);
      R(c, bx2 + uw(1), top + uw(1.5), 1, uw(2), W.rope0);
      c.drawImage(P.buoyProp.c, bx2, top + uw(3));
    }
    if (rng.next() < 0.5) {
      // oars leaning on the wall
      const ox3 = x + uw(1);
      for (let i = 0; i < 2; i++) {
        pline(c, ox3 + i * uw(1.5), y - 1, ox3 + i * uw(1.5) + uw(1), y - wallH + uw(2), uw(1) + 1, W.ink);
        pline(c, ox3 + i * uw(1.5), y - 1, ox3 + i * uw(1.5) + uw(1), y - wallH + uw(2), 1, W.deck2);
      }
    }
    return { lights, smoke, roofH };
  };

  // -- a tree / palm for the land behind ------------------------------------
  Kit.tree = function (c, x, y, rng, kind) {
    if (kind === 'palm') {
      const h = Math.round(rng.range(uw(11), uw(17)));
      for (let i = 0; i < h; i++) {
        const bend = Math.round(Math.sin(i / h * 1.2) * uw(2));
        R(c, x + bend - uw(1), y - i, uw(1.5), 1, i % uw(2) === 0 ? '#5c3a1c' : '#7a4f28');
        R(c, x + bend - uw(1) - 1, y - i, 1, 1, W.ink); R(c, x + bend + uw(1), y - i, 1, 1, W.ink);
      }
      const tx = x + Math.round(Math.sin(1.2) * uw(2)), ty = y - h;
      for (let a = 0; a < 7; a++) {
        const ang = -Math.PI / 2 + (a - 3) * 0.44 + rng.range(-0.08, 0.08);
        const L = rng.range(uw(4.5), uw(7.5));
        const ex = tx + Math.cos(ang) * L, ey = ty + Math.sin(ang) * L * 0.8 + uw(2);
        pline(c, tx, ty, ex, ey, uw(2), W.ink);
        pline(c, tx, ty, ex, ey, uw(1), a % 2 ? '#2f7e4b' : '#3f9e5b');
        pline(c, tx, ty, (tx + ex) / 2, (ty + ey) / 2, 1, '#6fd88e');
      }
      R(c, tx - uw(1), ty, uw(2), uw(1.5), W.ink); R(c, tx, ty + 1, uw(1), 1, '#8a5a33');
    } else {
      const h = Math.round(rng.range(uw(8), uw(13))), r = Math.round(rng.range(uw(4), uw(6.5)));
      R(c, x - uw(1), y - h, uw(2), h, W.ink);
      R(c, x - uw(0.5), y - h, uw(1), h, '#43281a');
      R(c, x - uw(0.5), y - h, 1, h, '#5c3a1c');
      for (let i = -r; i <= r; i++) {
        const ww = Math.round(Math.sqrt(Math.max(0, r * r - i * i)) * 1.25);
        const yy = y - h - r + i + uw(1);
        R(c, x - ww - 1, yy, ww * 2 + 2, 1, W.ink);
        R(c, x - ww, yy, ww * 2, 1, i < -r * 0.2 ? '#4fb373' : i < r * 0.4 ? '#2f9e5b' : '#1d6b3c');
        for (let q = -ww; q < ww; q += 2) if (rng.next() < 0.2) R(c, x + q, yy, 1, 1, '#6fd88e');
      }
    }
  };

  // -- top-down pier decking, with real gaps you can see water through -----
  Kit.jetty = function (c, x, y, w, len, rng, o) {
    o = o || {};
    const board = uw(2.5) | 0;            // board pitch down the pier
    for (let i = 0; i < len; i++) {
      const k = i % board;
      const row = (i / board) | 0;
      let col;
      if (k === 0) col = W.deck3;
      else if (k === board - 1) col = W.deck0;
      else col = (row % 3 === 1) ? W.deck1 : W.deck2;
      R(c, x, y + i, w, 1, col);
      if (k === 1) for (let q = (row * uw(2)) % uw(3); q < w; q += uw(3)) if (rng.next() < 0.45) R(c, x + q, y + i, 1, 1, W.deck3);
      for (let q = 0; q < w; q++) if (rng.next() < 0.03) R(c, x + q, y + i, 1, 1, rng.next() < 0.5 ? W.deck4 : W.deck0);
    }
    // a worn walking path down the middle, greyed and scuffed by boots
    const pw = Math.round(w * 0.42), px0 = x + Math.round((w - pw) / 2);
    for (let i = 0; i < len; i++) {
      if ((i % board) === 0) continue;                 // keep the board edges clean
      for (let q = 0; q < pw; q++) {
        if (rng.next() < 0.10) R(c, px0 + q, y + i, 1, 1, mix(W.deck2, '#9a8a78', 0.5));
      }
    }
    R(c, px0 - 1, y, 1, len, 'rgba(30,18,14,0.12)');
    R(c, px0 + pw, y, 1, len, 'rgba(30,18,14,0.12)');
    // gaps between boards: every few courses a board is missing and the water
    // shows through, which is what makes a deck read as a deck from above
    for (let row = 1; row * board < len; row++) {
      if (rng.next() > 0.26) continue;
      const gy = y + row * board;
      const gx0 = x + Math.floor(rng.next() * (w - uw(6))), gw = uw(3) + Math.floor(rng.next() * uw(4));
      c.clearRect(gx0, gy, gw, 1);
      R(c, gx0, gy - 1, gw, 1, W.deck0);
      R(c, gx0, gy + 1, gw, 1, W.deck4);
    }
    // butt joints + nail heads
    for (let i = 0; i < len; i += uw(8)) {
      const jx = x + uw(2) + Math.floor(rng.next() * (w - uw(4)));
      R(c, jx, y + i, 1, uw(2.5), W.deck0);
    }
    for (let i = 1; i < len; i += board) {
      if (rng.next() < 0.5) R(c, x + uw(1.5), y + i, 1, 1, W.met1);
      if (rng.next() < 0.5) R(c, x + w - uw(2), y + i, 1, 1, W.met1);
    }
    // raised deck: shading down both edges
    R(c, x + 1, y, uw(1), len, 'rgba(30,18,14,0.22)');
    R(c, x + w - uw(1.5), y, uw(1.5), len, 'rgba(30,18,14,0.30)');
    // kerb stringers
    R(c, x - 1, y, 1, len, W.ink); R(c, x + w, y, 1, len, W.ink);
    R(c, x, y, uw(1), len, W.deck1); R(c, x + w - uw(1), y, uw(1), len, W.deck0);

    // head beams across the pier: every bent shows as a heavier timber
    const pitch = uw(14);
    for (let i = uw(2); i < len - uw(2); i += pitch) {
      R(c, x, y + i - 1, w, 1, W.ink);
      R(c, x, y + i, w, uw(2), W.deck1);
      R(c, x, y + i, w, 1, W.deck4);
      R(c, x, y + i + uw(2), w, 1, 'rgba(30,18,14,0.45)');
      for (let q = uw(2); q < w; q += uw(5)) R(c, x + q, y + i, 1, uw(2), W.deck0);
    }
    // piles + braces poking out along both sides, below the deck line
    for (let i = uw(2); i < len - uw(3); i += pitch) {
      for (const s of [0, 1]) {
        const px2 = s ? x + w + 1 : x - uw(2.5);
        R(c, px2 - 1, y + i - 1, uw(2.5) + 2, uw(5) + 2, W.ink);
        R(c, px2, y + i, uw(2.5), uw(5), W.post1);
        R(c, px2, y + i, 1, uw(5), W.post2);
        R(c, px2, y + i + uw(3), uw(2.5), uw(2), W.wet);
        if (rng.next() < 0.6) R(c, px2 + 1, y + i + uw(4), uw(1), 1, W.alg);
        if (rng.next() < 0.4) R(c, px2 + Math.floor(rng.next() * uw(2)), y + i + uw(3.5), 1, 1, W.barn);
        // diagonal brace back under the deck
        Kit.brace(c, px2 + uw(1), y + i + uw(4), s ? x + w - uw(2) : x + uw(2), y + i - uw(1), uw(1));
      }
    }
    // pile heads, bolted through the deck, sitting proud of the boards
    for (let i = uw(2); i < len - uw(2); i += pitch) {
      for (const s of [0, 1]) {
        const px2 = s ? x + w - uw(5) : x + uw(2);
        R(c, px2 - 1, y + i - 1, uw(3) + 2, uw(3) + 2, W.ink);
        R(c, px2, y + i, uw(3), uw(3), W.post2);
        R(c, px2, y + i, uw(3), 1, W.post3);
        R(c, px2, y + i + uw(2), uw(3), uw(1), W.post0);
        R(c, px2 + uw(1), y + i + uw(1), uw(1), uw(1), W.met2);
      }
    }
    if (o.rails !== false) {
      for (const s of [0, 1]) {
        const rx = s ? x + w - uw(1) : x;
        for (let i = uw(1); i < len - uw(1); i += uw(5.5)) {
          R(c, rx - uw(1), y + i, uw(2.5), uw(1.5), W.ink);
          R(c, rx - uw(1) + 1, y + i, uw(1.5), uw(1), W.post2);
          R(c, rx - uw(1) + 1, y + i, 1, 1, W.post3);
        }
        R(c, rx - uw(1), y, uw(1), len, W.post1);
        R(c, rx - uw(1), y, 1, len, W.post2);
        R(c, rx - uw(1) - 1, y, 1, len, W.ink);
        R(c, rx, y, 1, len, W.ink);
      }
    }
  };
  /* ======================================================================
     3.  DAMAGE  --  punch holes / crack / lean a baked structure canvas
     ====================================================================== */
  function damagePass(c, amount, seed, lean) {
    const rng = new SeededRandom(seed + 7717);
    const w = c.canvas.width, h = c.canvas.height;
    const holes = Math.round(amount * 7 * U);
    for (let i = 0; i < holes; i++) {
      const hx = Math.round(rng.range(2, w - 6)), hy = Math.round(rng.range(2, h - 6));
      const hw = Math.round(rng.range(uw(1.5), uw(2) + amount * uw(3))), hh = Math.round(rng.range(uw(1), uw(1.5) + amount * uw(2.5)));
      // jagged clear
      for (let q = 0; q < hh; q++) {
        const inset = Math.round(rng.range(0, U));
        c.clearRect(hx + inset, hy + q, hw - inset * 2, 1);
      }
      // splinter rim
      for (let q = 0; q < 7 * U; q++) {
        const sx = hx + Math.round(rng.range(-1, hw)), sy = hy + Math.round(rng.range(-1, hh));
        c.fillStyle = rng.next() < 0.5 ? W.deck4 : W.deck0;
        c.fillRect(sx, sy, 1, 1);
      }
    }
    // cracks
    const cracks = Math.round(amount * 4 * U);
    for (let i = 0; i < cracks; i++) {
      let x = rng.range(4, w - 4), y = rng.range(4, h - 4);
      let a = rng.range(0, TAU);
      c.fillStyle = W.ink;
      for (let q = 0; q < (10 + amount * 12) * U; q++) {
        c.fillRect(Math.round(x), Math.round(y), 1, 1);
        a += rng.range(-0.6, 0.6); x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6;
        if (U > 1) c.fillRect(Math.round(x), Math.round(y), 1, 1);
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
  function poolSprite(rw) {
    const r = Math.round(rw * U);
    if (POOLS[rw]) return POOLS[rw];
    const size = r * 2 + uw(4), c = cv(size, size), rng = new SeededRandom(900 + r * 13);
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
      const a = rng.range(0, TAU), d = rng.range(r, r + uw(1.5));
      R(c, cxp + Math.cos(a) * d, cyp + Math.sin(a) * d * 0.8, rng.next() < 0.4 ? U : 1, 1, '#7c1414');
    }
    return POOLS[rw] = { c: c.canvas, w: size, h: size, ox: -size / (2 * K), oy: -size / (2 * K), wu: size / K, hu: size / K };
  }
  const SPLATS = [];
  for (let i = 0; i < 8; i++) {
    const rng = new SeededRandom(311 + i * 97);
    const size = uw(18), c = cv(size, size);
    const n = 4 + Math.floor(rng.next() * 5);
    for (let k = 0; k < n; k++) {
      const bx = rng.range(uw(2), size - uw(3)), by = rng.range(uw(2), size - uw(3)), bw = rng.range(uw(1), uw(3)), bh = rng.range(uw(1), uw(2));
      R(c, bx, by, bw, bh, k === 0 ? '#9e1f22' : '#7c1414');
      R(c, bx + 1, by, bw - 2, 1, '#c8302e');
      R(c, bx, by + bh - 1, bw, 1, '#55090c');
    }
    for (let k = 0; k < 10 * U; k++) R(c, rng.range(1, size - 2), rng.range(1, size - 2), 1, 1, rng.next() < 0.5 ? '#7c1414' : '#55090c');
    SPLATS.push({ c: c.canvas, w: size, h: size, ox: -size / (2 * K), oy: -size / (2 * K), wu: size / K, hu: size / K });
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
        const dsp = d.kind === 0 ? d.s : poolSprite(Math.max(2, Math.round(d.r)));
        ctx.drawImage(dsp.c, Math.round(sx * K) / K + dsp.ox, Math.round(sy * K) / K + dsp.oy, dsp.wu, dsp.hu);
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
  // x,y in world units; r in ART pixels. Steps on the art grid so it stays hard-edged.
  function drawGlow(ctx, x, y, r, col, a) {
    ctx.fillStyle = col;
    const ax = Math.round(x * K), ay = Math.round(y * K);
    for (let i = 3; i >= 1; i--) {
      const rr = Math.round(r * i / 3);
      ctx.globalAlpha = a * (0.16 + (3 - i) * 0.14);
      for (let dy = -rr; dy <= rr; dy += 2) {
        const hw = rr - Math.abs(dy);
        if (hw <= 0) continue;
        ctx.fillRect((ax - hw) / K, (ay + dy) / K, (hw * 2) / K, 2 / K);
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
      this.cw = o.cw; this.ch = o.ch;           // canvas size, in WORLD units
      this.aw = Math.round(o.cw * K); this.ah = Math.round(o.ch * K);  // ...in art px
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
      const c = cv(this.aw, this.ah);
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
          rot: rand(0, TAU), vr: rand(-12, 12), w: randi(uw(1), uw(3.5)), h: randi(1, uw(1.5)), col: pick(WOODC),
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
        const sh = Math.min(ch - cy, uw(2) + Math.floor(rng.next() * uw(3.5)));
        for (let cx2 = 0; cx2 < cw; ) {
          const sw = Math.min(cw - cx2, uw(2) + Math.floor(rng.next() * uw(4.5)));
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
            const wx = this.x + this.ox + (cx2 + sw / 2) / K;
            const baseY = this.y + this.by + this.bh;               // the structure's footing
            const hgt = (baseY - (this.y + this.oy + (cy + sh / 2) / K));  // how high this piece sat
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
        const c = cv(this.aw, this.ah);
        c.drawImage(src, 0, 0);
        const cut = Math.round((this.by - this.oy + this.bh - this.ruinKeep) * K);
        c.clearRect(0, 0, this.aw, Math.max(0, cut));
        // splintered top edge
        const r2 = new SeededRandom(this.seed + 5);
        for (let x = 0; x < this.aw; x++) {
          if (r2.next() < 0.5) R(c, x, cut - 1 - Math.floor(r2.next() * uw(1.5)), 1, uw(1.5), r2.next() < 0.5 ? W.deck4 : W.deck0);
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
      let ax = Math.round(sx0 * K), ay = Math.round(sy0 * K);
      if (this.shk > 0) { ax += Math.round(Math.cos(this.shkA) * this.shk * 8 * Math.sin(t * 60) * K); ay += Math.round(this.shk * 3 * Math.sin(t * 47) * K); }
      if (this.bobA) ay += Math.round(Math.sin(t * 1.7 + this.bobPh) * this.bobA * K);
      const img = this.collapsed ? this.ruin : this.canvas;
      if (!img) return;
      const sx = ax / K, sy = ay / K;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, this.cw, this.ch);
      if (this.flash > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, this.flash * 3);
        ctx.drawImage(img, sx, sy, this.cw, this.ch); ctx.restore(); ctx.globalAlpha = 1;
      }
      if (this.collapsed) return;
      // warm interior light, flickering
      // lights are recorded in art pixels; A() fills an art-pixel rect
      const A = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect((ax + x) / K, (ay + y) / K, w / K, h / K); };
      for (const l of this.lights) {
        const fl = 0.72 + 0.16 * Math.sin(t * 2.3 + l.ph) + 0.12 * Math.sin(t * 11.7 + l.ph * 3);
        const gx = (ax + l.x + (l.w >> 1)) / K, gy = (ay + l.y + (l.h >> 1)) / K;
        if (l.lantern) {
          drawGlow(ctx, gx, gy, Math.round(uw(4.5) * fl * l.k), W.glow, 0.85);
          A(l.x + 1, l.y + 1, l.w - 2, l.h - 2, fl > 0.78 ? W.glowHot : W.glow);
          A(l.x + 2, l.y + 2, l.w - 4, l.h - 3, '#fff8de');
        } else {
          A(l.x, l.y, l.w, l.h, fl > 0.8 ? '#ffe6a8' : '#f2c85f');
          A(l.x, l.y + l.h - uw(1), l.w, uw(1), '#e0a23c');
          A(l.x + 1, l.y + 1, l.w - 2, uw(1), '#fff6d5');
          if (l.mull) {
            A(l.x + ((l.w >> 1) - 1), l.y, 1, l.h, '#3a2a20');
            A(l.x, l.y + ((l.h >> 1) - 1), l.w, 1, '#3a2a20');
            const mv = Math.sin(t * 0.7 + l.ph * 2.1);
            if (mv > 0.72) A(l.x + 1 + Math.round((l.w - uw(2)) * (mv - 0.72) * 3), l.y + uw(1.5), uw(1.5), l.h - uw(1.5), '#4a2f28');
          }
          drawGlow(ctx, gx, gy, Math.round(uw(3.5) * fl * l.k), W.glow, 0.4);
        }
      }
    }
    renderDebris(ctx, cam, t) {
      void t;
      if (!this.debris.length) return;
      ctx.imageSmoothingEnabled = false;
      for (const d of this.debris) {
        const sx = Math.round((d.x - cam.x) * K) / K, sy = Math.round((d.y - cam.y - d.z + (d.bob || 0)) * K) / K;
        if (sx < -24 || sy < -24 || sx > 664 || sy > 384) continue;
        const fade = d.life - d.t < 2 ? (d.life - d.t) / 2 : 1;
        ctx.globalAlpha = Math.max(0, fade);
        if (d.floating) { ctx.fillStyle = 'rgba(8,22,52,0.30)'; ctx.fillRect(sx - 4, sy + 2, 9, 3); }
        else if (d.z > 2) { ctx.globalAlpha = 0.22 * fade; ctx.fillStyle = '#0a0812'; ctx.fillRect(sx - 3, Math.round(d.y - cam.y), 7, 2); ctx.globalAlpha = Math.max(0, fade); }
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(d.rot);
        if (d.plain) { ctx.fillStyle = d.col; ctx.fillRect(-(d.w >> 1) / K, -(d.h >> 1) / K, d.w / K, d.h / K); }
        else ctx.drawImage(d.src, d.sx, d.sy, d.sw, d.sh, -(d.sw >> 1) / K, -(d.sh >> 1) / K, d.sw / K, d.sh / K);
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
  // local(forward,up) in WORLD units -> ART pixels on screen, with body
  // rotation. Everything about a villager is stamped on the art grid, which is
  // where the extra resolution in their limbs and faces comes from.
  let _tx = 0, _ty = 0;
  function T(v, lx, ly) {
    const wx = lx * v._face * K, wy = -ly * K;
    _tx = v._ax + wx * v._c - wy * v._s;
    _ty = v._ay + wx * v._s + wy * v._c;
  }
  // art-pixel chunky line: square stamps, drawn at 1/K so they land on the grid
  function plineA(c, x0, y0, x1, y1, th, col) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.max(Math.abs(dx), Math.abs(dy));
    const n = Math.max(1, Math.ceil(len / Math.max(1, th * 0.5)));
    const h = th >> 1;
    c.fillStyle = col;
    const s = th / K;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + dx * i / n) - h, y = Math.round(y0 + dy * i / n) - h;
      c.fillRect(x / K, y / K, s, s);
    }
  }
  // th is in ART pixels
  function seg(ctx, v, x0, y0, x1, y1, th, col, ink) {
    T(v, x0, y0); const ax = _tx, ay = _ty;
    T(v, x1, y1); const bx = _tx, by = _ty;
    if (ink) plineA(ctx, ax, ay, bx, by, th + 2, ink);
    plineA(ctx, ax, ay, bx, by, th, col);
  }
  function dot(ctx, v, x, y, s, col) {
    T(v, x, y);
    ctx.fillStyle = col;
    ctx.fillRect((Math.round(_tx) - (s >> 1)) / K, (Math.round(_ty) - (s >> 1)) / K, s / K, s / K);
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
  // x,y in ART pixels
  function bubble(ctx, x, y, str, col, tailDir) {
    const gs2 = Math.max(1, Math.round(K / 2));           // glyph pixel size
    const gw = 4 * gs2, w = str.length * gw + 3 * gs2, h = 9 * gs2;
    x = Math.round(x - w / 2); y = Math.round(y - h);
    const A = (px2, py, pw, ph, c2) => { ctx.fillStyle = c2; ctx.fillRect(px2 / K, py / K, pw / K, ph / K); };
    A(x - gs2, y - gs2, w + gs2 * 2, h + gs2 * 2, W.ink);
    A(x, y, w, h, col || '#f4efe0');
    A(x + gs2, y + gs2, w - gs2 * 2, gs2, '#ffffff');
    A(x + (tailDir > 0 ? w - 4 * gs2 : 2 * gs2), y + h, gs2 * 2, gs2 * 2, col || '#f4efe0');
    A(x + (tailDir > 0 ? w - 4 * gs2 : 2 * gs2), y + h + gs2 * 2, gs2, gs2, W.ink);
    for (let i = 0; i < str.length; i++) {
      const g = GLYPHS[str[i]]; if (!g) continue;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++)
        if (g[r][c] === '1') A(x + 2 * gs2 + i * gw + c * gs2, y + 2 * gs2 + r * gs2, gs2, gs2, '#241a22');
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
      // build: man | woman | child | boss (the harbour master) | old
      this.build = opts.build || (Math.random() < 0.1 ? 'child' : Math.random() < 0.42 ? 'woman' : Math.random() < 0.12 ? 'old' : 'man');
      const B = this.build;
      const tall = B === 'child' ? 0.68 : B === 'woman' ? rand(0.92, 1.0) : B === 'boss' ? 1.08 : B === 'old' ? 0.94 : rand(0.96, 1.08);
      this.scaleB = B === 'child' ? 0.75 : 1;
      this.legL = rand(4.6, 5.8) * tall; this.legL2 = this.legL * rand(0.92, 1.08);
      this.torso = rand(7, 9.5) * tall;
      this.armL = rand(3.6, 4.6) * tall; this.armL2 = this.armL * rand(0.9, 1.05);
      this.head = B === 'child' ? 5 : randi(5, 6);
      this.bulk = B === 'child' ? 4.5 : B === 'woman' ? rand(5.2, 6.4) : B === 'boss' ? 7.5 : (Math.random() < 0.3 ? 8 : Math.random() < 0.55 ? 7 : 6);
      this.skin = opts.skin || pick(SKIN);
      this.shirt = opts.shirt || pick(SHIRT);
      this.shirt2 = Math.random() < 0.45 ? pick(SHIRT) : shade(this.shirt, 0.78);
      this.pants = pick(PANTS);
      this.shirtLt = shade(this.shirt, 1.32); this.pantsLt = shade(this.pants, 1.3);
      this.boots = pick(['#5a3c28', '#4a3a42', '#6b4a30', '#3e3a30']);
      this.hair = pick(['#2b1f1a', '#4a3020', '#6b5030', '#8a7a60', '#7a2a1a', '#1c1418']);
      if (B === 'boss') { this.hat = 6; this.hatCol = '#25313f'; }
      else if (B === 'woman') { this.hat = Math.random() < 0.5 ? 7 : randi(0, 2); this.hatCol = pick(HATCOL); }
      else if (B === 'child') { this.hat = Math.random() < 0.5 ? 0 : randi(1, 4); this.hatCol = pick(HATCOL); }
      else { this.hat = randi(0, 5); this.hatCol = pick(HATCOL); }
      this.beard = (B === 'man' || B === 'old') && Math.random() < 0.5 ? (B === 'old' ? '#b9b4ac' : this.hair) : null;
      if (B === 'old') this.hair = '#b9b4ac';
      this.longHair = B === 'woman' && Math.random() < 0.7;
      this.skirt = B === 'woman' && Math.random() < 0.55;
      this.skirtCol = pick(['#4a5a74', '#6b4a5e', '#3f5b4a', '#7a6244', '#5b4a68']);
      this.apron = (this.role === 'gut' || this.role === 'market') ? true : Math.random() < (B === 'woman' ? 0.45 : 0.25);
      this.apronCol = Math.random() < 0.5 ? '#cfc6ad' : '#b7c3c8';
      this.apronStain = pick(['#9e3a34', '#8a5a33', '#7c4a4a']);
      this.coat = B === 'boss';
      this.coatCol = '#28384a';
      this.gloves = Math.random() < 0.2 ? '#7a5a3a' : null;
      this.vest = !this.apron && !this.coat && Math.random() < 0.4;
      this.item = opts.item || null;
      this.shirtDk = shade(this.shirt, 0.66); this.shirt2Dk = shade(this.shirt2, 0.66);
      this.pantsDk = shade(this.pants, 0.66); this.skinDk = shade(this.skin, 0.72);
      this.bootsDk = shade(this.boots, 0.7);
      this.state = 'idle';
      this.tx = x; this.ty = y;
      this.bob = 0; this.lean = 0; this.crouch = 0;
      this.workPh = rand(0, TAU);
      this.fishLine = 0; this.catchT = 0;
      this._ax = 0; this._ay = 0; this._c = 1; this._s = 0; this._face = this.face;
      if (this.role === 'watch_deck') this.setState('idle');
      else if (['fish', 'hammer', 'chat', 'idle', 'mend', 'gut'].indexOf(this.role) >= 0) this.setState(this.role === 'chat' ? 'idle' : this.role);
      else this.setState('idle');
    }
    // ------------------------------------------------------------ behaviour
    setState(s) {
      this.state = s; this.stateT = 0;
      if (s === 'walk') this.pickWalkTarget();
      if (s === 'fish') { this.face = this.onJetty ? this.face : 1; this.fishLine = 0; }
      if (s === 'mend') { this.item = 'net'; this.crouch = 0; }
      if (s === 'gut') { this.item = 'knife'; }
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
            else if (this.role === 'mend' && r < 0.75) this.setState('mend');
            else if (this.role === 'gut' && r < 0.75) this.setState('gut');
            else if (this.role === 'watch_deck' && r < 0.7) { this.face = -this.face; this.stateT = -2; }
            else if (this.role === 'haul' && r < 0.7) { this.item = Math.random() < 0.5 ? 'box' : 'crate'; this.setState('walk'); }
            else this.setState('walk');
          }
          break;
        }
        case 'walk': {
          const arrived = this.moveTo(this.tx, this.ty, dt, this.speed);
          this.gait += dt * this.speed * 0.42;
          if (arrived) {
            if ((this.item === 'crate' || this.item === 'box') && Math.random() < 0.6) { this.item = null; this.setState('idle'); this.say(':', 0.8); }
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
        case 'mend': {
          this.moveStop(dt);
          this.item = 'net';
          this.workPh += dt * 3.4;
          if (!this.speech && Math.random() < dt * 0.10) this.say('~', 1.1);
          if (this.stateT > 14) { this.item = null; this.setState('walk'); }
          break;
        }
        case 'gut': {
          this.moveStop(dt);
          this.item = 'knife';
          this.workPh += dt * 4.6;
          if (Math.sin(this.workPh * 2.4) > 0.97 && Math.random() < 0.3) Gore.splat(this.x + this.face * 5, this.y + rand(-1, 2), 0.16);
          if (this.stateT > 12) { this.item = null; this.setState('walk'); }
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
      this._ax = Math.round(sx * K); this._ay = Math.round(sy * K);
      if (swim) {
        // only the head and shoulders stay above the surface
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 640, Math.round(sy * K) / K); ctx.clip();
        this._ay = Math.round(sy * K) + uw(5.5);
      }
      this._face = this.face;
      this._c = Math.cos(this.rot); this._s = Math.sin(this.rot);
      const ink = W.ink;

      // ---- pose ------------------------------------------------------
      const walking = (this.state === 'walk' || this.state === 'panic');
      const run = this.state === 'panic';
      const g = this.gait;
      const crouch = this.crouch * 3;
      // a walk with weight in it: the body drops onto the planted foot and
      // rises over it, so the bob runs at twice the stride frequency
      let bob = walking ? (Math.abs(Math.sin(g)) * (run ? 1.5 : 0.9) - (run ? 0.7 : 0.45)) : Math.sin(this.t * 1.7) * 0.3;
      if (swim) bob = Math.sin(this.t * 6) * 1.2;
      if (this.state === 'mend' || this.state === 'gut') bob = Math.sin(this.workPh * 0.5) * 0.25;
      const hipY = this.legL + this.legL2 - crouch + bob - (swim ? 6 : 0) - (this.state === 'mend' ? this.legL * 0.75 : 0);
      const torsoH = this.torso - crouch * 0.6;
      let lean = walking ? (run ? 3.0 : 1.1) : 0;
      if (walking) lean += Math.sin(g * 2) * (run ? 0.5 : 0.25);
      if (this.item === 'crate') lean = -1.5;
      if (this.state === 'hammer') lean = 2.2 + Math.sin(this.workPh) * 1.4;
      if (this.state === 'gut') lean = 2.4 + Math.sin(this.workPh * 2) * 0.5;
      if (this.state === 'mend') lean = 2.8;
      if (this.crouch > 0) lean = 2.6;
      if (swim) lean = 4.5;
      const neckX = lean * 0.55, neckY = hipY + torsoH;
      const headY = neckY + this.head * 0.62;
      const headX = neckX * 1.25 + (this.state === 'notice' ? 1 : 0) + (this.state === 'gut' ? 1.2 : 0);

      // legs
      const stride = run ? 5.4 : 3.2, lift = run ? 3.4 : 1.9;
      let f1x, f1y, f2x, f2y;
      if (swim) {
        f1x = -2 + Math.sin(g) * 2.5; f1y = -1 + Math.cos(g) * 1.5;
        f2x = -3 + Math.sin(g + 2) * 2.5; f2y = -2 + Math.cos(g + 2) * 1.5;
      } else if (walking) {
        // the foot hangs in front on the swing and stays put on the plant
        const sw1 = Math.sin(g), sw2 = Math.sin(g + Math.PI);
        f1x = 0.8 + sw1 * stride; f1y = Math.max(0, Math.cos(g)) * lift;
        f2x = -0.8 + sw2 * stride; f2y = Math.max(0, Math.cos(g + Math.PI)) * lift;
      } else if (this.state === 'cower') { f1x = 0.4; f1y = 0; f2x = -2.2; f2y = 0; }
      else if (this.state === 'mend') { f1x = 3.2; f1y = 0.2; f2x = 1.4; f2y = -0.4; }
      else { f1x = 1.5; f1y = 0; f2x = -1.8; f2y = 0; }
      const legThick = Math.round((this.bulk > 7 ? 3.4 : 2.8) * U * this.scaleB);
      ik(0, hipY, f1x, f1y, this.legL, this.legL2, 1);
      const k1x = _ikx, k1y = _iky;
      ik(0, hipY, f2x, f2y, this.legL, this.legL2, 1);
      const k2x = _ikx, k2y = _iky;

      // arms
      const shY = neckY - 1.2, shX = neckX + 0.8;
      let h1x, h1y, h2x, h2y;
      const arm = this.armL + this.armL2;
      if (this.item === 'crate' || this.item === 'box') {
        // carried in both hands, out in front, which is why they lean back
        h1x = 5.2; h1y = hipY + torsoH * 0.5; h2x = 4.4; h2y = hipY + torsoH * 0.56;
      } else if (this.item === 'rod') { h1x = 3.6; h1y = shY - 2.6; h2x = 1.6; h2y = shY - 4.2; }
      else if (this.state === 'hammer') {
        const sw = Math.sin(this.workPh);
        h1x = 5 + sw * 2.5; h1y = shY - 4 + (sw > 0 ? sw * 7 : sw * 2);
        h2x = 3.2; h2y = shY - 5.5;
      } else if (this.state === 'mend') {
        const q = Math.sin(this.workPh * 1.6);
        h1x = 4.6 + q * 1.6; h1y = shY - 3.2 + Math.cos(this.workPh * 1.6) * 1.1;
        h2x = 3.4; h2y = shY - 4.4;
      } else if (this.state === 'gut') {
        const q = Math.sin(this.workPh * 2.4);
        h1x = 4.4 + q * 1.2; h1y = shY - 4.2 - q * 0.6;
        h2x = 3.4 - q * 0.5; h2y = shY - 4.0;
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
        const swA = walking ? Math.sin(g + Math.PI) * (run ? 3.4 : 2.2) : Math.sin(this.t * 1.5) * 0.5;
        const swB = walking ? Math.sin(g) * (run ? 3.4 : 2.2) : Math.sin(this.t * 1.5 + 1) * 0.5;
        h1x = swA + 1.5; h1y = shY - arm * 0.9 + (walking ? Math.abs(swA) * 0.25 : 0);
        h2x = swB - 1.3; h2y = shY - arm * 0.9 + (walking ? Math.abs(swB) * 0.25 : 0);
      }
      ik(shX - 1.8, shY, h2x, h2y, this.armL, this.armL2, -1);
      const e2x = _ikx, e2y = _iky;
      ik(shX, shY, h1x, h1y, this.armL, this.armL2, -1);
      const e1x = _ikx, e1y = _iky;

      // ---- draw: far side first --------------------------------------
      if (!this.dead && !swim && this.z < 6) {
        ctx.fillStyle = 'rgba(18,8,18,0.26)';
        const bw = 4 + this.bulk * 0.35;
        ctx.fillRect((this._ax - uw(bw * 0.5)) / K, (this._ay - 1) / K, uw(bw) / K, uw(1) / K);
        ctx.fillRect((this._ax - uw(bw * 0.3)) / K, (this._ay - uw(1)) / K, uw(bw * 0.6) / K, 1 / K);
      }
      const A1 = Math.round(U * this.scaleB);
      // far leg
      seg(ctx, this, -1.2, hipY, k2x, k2y, legThick, this.pantsDk);
      seg(ctx, this, k2x, k2y, f2x, f2y, legThick - A1, this.pantsDk, ink);
      seg(ctx, this, f2x - 0.8, f2y + 0.5, f2x + 1.3, f2y + 0.5, Math.round(1.4 * U), this.bootsDk, ink);
      // far arm
      seg(ctx, this, shX - 1.8, shY, e2x, e2y, Math.round(2.2 * U * this.scaleB), this.shirtDk);
      seg(ctx, this, e2x, e2y, h2x, h2y, Math.round(1.5 * U * this.scaleB), this.skinDk, ink);
      dot(ctx, this, h2x, h2y, Math.round(1.6 * U), this.skinDk);
      // near leg
      seg(ctx, this, 1.1, hipY, k1x, k1y, legThick, this.pants);
      seg(ctx, this, k1x, k1y, f1x, f1y, legThick - A1, this.pants, ink);
      seg(ctx, this, k1x + 0.7, k1y, f1x + 0.7, f1y, 1, this.pantsLt);
      seg(ctx, this, f1x - 0.9, f1y + 0.5, f1x + 1.5, f1y + 0.5, Math.round(1.4 * U), this.boots, ink);
      dot(ctx, this, f1x + 1.4, f1y + 0.5, 1, shade(this.boots, 1.45));
      // a skirt hides the legs from the knee up
      if (this.skirt) {
        seg(ctx, this, 0, hipY - 0.4, 0, hipY + 1.4, Math.round(this.bulk * U * 0.62), this.skirtCol, ink);
        seg(ctx, this, 0, hipY - 1.6, 0, hipY - 1.5, Math.round(this.bulk * U * 0.78), this.skirtCol, ink);
        seg(ctx, this, 0.8, hipY - 1.5, 0.8, hipY + 1, 1, shade(this.skirtCol, 1.25));
      }
      // torso
      const bulkA = Math.round(this.bulk * U * 0.52);
      seg(ctx, this, 0, hipY - 0.5, neckX, neckY, bulkA, this.shirt, ink);
      const bh2 = this.bulk * 0.26;
      seg(ctx, this, bh2, hipY, neckX + bh2, neckY - 0.8, 1, this.shirtLt);
      seg(ctx, this, -bh2, hipY, neckX - bh2, neckY - 0.8, 1, this.shirtDk);
      // seams across the chest
      seg(ctx, this, -bh2 * 0.6, hipY + torsoH * 0.55, bh2 * 0.6, hipY + torsoH * 0.55, 1, this.shirtDk);
      if (this.apron) {
        seg(ctx, this, 0.4, hipY + 0.3, neckX * 0.7, hipY + torsoH * 0.62, bulkA - A1, this.apronCol);
        seg(ctx, this, 0.4, hipY + torsoH * 0.62, neckX * 0.7, hipY + torsoH * 0.64, bulkA - A1 * 2, shade(this.apronCol, 0.8));
        // stains down the front
        dot(ctx, this, 0.8, hipY + torsoH * 0.3, Math.round(1.2 * U), this.apronStain);
        dot(ctx, this, -0.4, hipY + torsoH * 0.5, A1, this.apronStain);
      } else if (this.coat) {
        seg(ctx, this, neckX * 0.4, hipY + torsoH * 0.15, neckX, neckY - 1, bulkA + A1, this.coatCol, ink);
        seg(ctx, this, neckX * 0.4 + bh2 * 0.8, hipY + torsoH * 0.15, neckX + bh2 * 0.8, neckY - 1, 1, shade(this.coatCol, 1.3));
        for (let i = 0; i < 3; i++) dot(ctx, this, bh2 * 0.5, hipY + torsoH * (0.35 + i * 0.2), A1, W.met3);
      } else if (this.vest) {
        seg(ctx, this, neckX * 0.55, hipY + torsoH * 0.45, neckX, neckY - 1.2, bulkA - A1 * 2, this.shirt2);
        seg(ctx, this, neckX * 0.55 + 1, hipY + torsoH * 0.45, neckX + 1, neckY - 1.2, 1, shade(this.shirt2, 1.25));
      }
      // belt
      seg(ctx, this, -0.6, hipY + 0.7, 0.6, hipY + 0.7, bulkA - A1, '#40291f');
      dot(ctx, this, 0.6, hipY + 0.7, A1, W.met3);
      // collar
      seg(ctx, this, neckX - 1, neckY - 0.6, neckX + 1, neckY - 0.6, A1, this.shirtLt);
      // neck
      seg(ctx, this, neckX, neckY - 1, headX, headY - this.head * 0.45, Math.round(1.3 * U * this.scaleB), this.skinDk, ink);
      // head
      const headA = Math.round(this.head * U * 0.62);
      seg(ctx, this, headX, headY, headX, headY, headA + 2, ink);
      seg(ctx, this, headX, headY, headX, headY, headA, this.skin);
      seg(ctx, this, headX - this.head * 0.18, headY + this.head * 0.1, headX - this.head * 0.18, headY + this.head * 0.1, Math.round(headA * 0.7), this.skinDk);
      // hair
      seg(ctx, this, headX - this.head * 0.4, headY + this.head * 0.42, headX + this.head * 0.34, headY + this.head * 0.42, Math.round(1.3 * U), this.hair);
      seg(ctx, this, headX - this.head * 0.46, headY + this.head * 0.06, headX - this.head * 0.46, headY + this.head * 0.42, Math.round(1.3 * U), this.hair);
      if (this.longHair) seg(ctx, this, headX - this.head * 0.5, headY - this.head * 0.35, headX - this.head * 0.46, headY + this.head * 0.3, Math.round(1.8 * U), this.hair, ink);
      dot(ctx, this, headX - this.head * 0.44, headY - this.head * 0.05, A1, this.skinDk);
      // face
      const blink = (Math.sin(this.t * 1.3 + this.workPh) > 0.985) ? 0 : 1;
      if (blink) {
        dot(ctx, this, headX + this.head * 0.3, headY + 0.6, A1, '#241a22');
        dot(ctx, this, headX + this.head * 0.32, headY + 0.75, 1, '#e8f0ff');
        if (this.head > 5) dot(ctx, this, headX - this.head * 0.06, headY + 0.6, A1, '#241a22');
      } else dot(ctx, this, headX + this.head * 0.22, headY + 0.5, A1, this.skinDk);
      dot(ctx, this, headX + this.head * 0.54, headY - 0.1, A1, this.skinDk);   // nose
      dot(ctx, this, headX + this.head * 0.3, headY - this.head * 0.3, A1, shade(this.skin, 0.8)); // mouth line
      if (this.beard) {
        seg(ctx, this, headX - 0.4, headY - this.head * 0.3, headX + this.head * 0.34, headY - this.head * 0.34, Math.round(1.6 * U), this.beard);
        seg(ctx, this, headX + this.head * 0.1, headY - this.head * 0.5, headX + this.head * 0.2, headY - this.head * 0.5, A1, shade(this.beard, 0.8));
      }
      if (this.speech || this.state === 'panic') dot(ctx, this, headX + this.head * 0.3, headY - this.head * 0.28, Math.round(1.4 * U), '#5e2a2a');
      // hat
      this.drawHat(ctx, headX, headY, ink);
      // near arm (over the torso)
      seg(ctx, this, shX, shY, e1x, e1y, Math.round(2.2 * U * this.scaleB), this.shirt);
      seg(ctx, this, shX, shY - 0.6, e1x, e1y - 0.4, 1, this.shirtLt);
      seg(ctx, this, e1x, e1y, h1x, h1y, Math.round(1.5 * U * this.scaleB), this.skin, ink);
      dot(ctx, this, h1x, h1y, Math.round(1.7 * U), this.gloves || this.skin);
      // ---- item -------------------------------------------------------
      this.drawItem(ctx, cam, t, h1x, h1y, h2x, h2y, ink);
      // ---- speech -----------------------------------------------------
      if (this.speech && !this.dead) {
        T(this, headX, headY + this.head * 0.8 + 2);
        bubble(ctx, _tx, Math.min(_ty - 2, swim ? sy * K - uw(6) : 1e9), this.speech.s, this.speech.col, this.face);
      }
      // ---- water bits --------------------------------------------------
      if (swim) {
        ctx.restore();
        const wsx = Math.round(sx * K), wsy = Math.round(sy * K);
        const A = (px2, py, pw, ph, c2) => { ctx.fillStyle = c2; ctx.fillRect(px2 / K, py / K, pw / K, ph / K); };
        A(wsx - uw(3.5), wsy, uw(7), 1, 'rgba(235,250,255,0.8)');
        A(wsx - uw(4.5) + Math.round(Math.sin(t * 6) * U), wsy + 1, uw(2.5), 1, 'rgba(235,250,255,0.8)');
        A(wsx + uw(2.5), wsy + 1, uw(2.5), 1, 'rgba(235,250,255,0.8)');
        A(wsx - uw(5.5) + Math.round(Math.sin(t * 4 + 1) * U * 1.5), wsy + U, uw(3.5), 1, 'rgba(200,236,255,0.5)');
      }
    }
    drawHat(ctx, hx, hy, ink) {
      const r = this.head * 0.5;          // head half-height; the crown sits at hy + r
      const th = v => Math.max(1, Math.round(v * U));
      switch (this.hat) {
        case 1: // knitted beanie
          seg(ctx, this, hx - r * 0.7, hy + r * 1.05, hx + r * 0.7, hy + r * 1.05, th(2), ink);
          seg(ctx, this, hx - r * 0.7, hy + r * 1.0, hx + r * 0.7, hy + r * 1.0, th(1), this.hatCol);
          seg(ctx, this, hx - r, hy + r * 0.72, hx + r, hy + r * 0.72, th(1.5), ink);
          seg(ctx, this, hx - r, hy + r * 0.7, hx + r, hy + r * 0.7, 1, shade(this.hatCol, 1.25));
          for (let i = -2; i <= 2; i++) if (i % 2) dot(ctx, this, hx + r * 0.3 * i, hy + r * 1.0, 1, shade(this.hatCol, 0.7));
          break;
        case 2: // wide straw brim
          seg(ctx, this, hx - r * 2, hy + r * 0.85, hx + r * 2, hy + r * 0.85, th(1.5), ink);
          seg(ctx, this, hx - r * 1.9, hy + r * 0.8, hx + r * 1.9, hy + r * 0.8, 1, '#dcb872');
          seg(ctx, this, hx - r * 0.7, hy + r * 1.45, hx + r * 0.7, hy + r * 1.45, th(2), ink);
          seg(ctx, this, hx - r * 0.7, hy + r * 1.4, hx + r * 0.7, hy + r * 1.4, th(1), '#eccf90');
          seg(ctx, this, hx - r * 0.7, hy + r * 1.05, hx + r * 0.7, hy + r * 1.05, 1, '#a8813f');
          break;
        case 3: // cap with a peak
          seg(ctx, this, hx - r * 0.8, hy + r * 1.2, hx + r * 0.8, hy + r * 1.2, th(2), ink);
          seg(ctx, this, hx - r * 0.8, hy + r * 1.15, hx + r * 0.8, hy + r * 1.15, th(1), this.hatCol);
          seg(ctx, this, hx + r * 0.4, hy + r * 0.85, hx + r * 1.9, hy + r * 0.85, th(1), ink);
          seg(ctx, this, hx + r * 0.4, hy + r * 0.8, hx + r * 1.8, hy + r * 0.8, 1, shade(this.hatCol, 0.75));
          break;
        case 4: // bandana with a knot tail
          seg(ctx, this, hx - r, hy + r * 0.95, hx + r, hy + r * 0.95, th(1.5), ink);
          seg(ctx, this, hx - r, hy + r * 0.9, hx + r, hy + r * 0.9, th(1), this.hatCol);
          seg(ctx, this, hx - r * 0.9, hy + r * 0.8, hx - r * 1.9, hy + r * 0.25, th(1), ink);
          seg(ctx, this, hx - r * 0.9, hy + r * 0.75, hx - r * 1.8, hy + r * 0.25, 1, shade(this.hatCol, 1.2));
          break;
        case 5: // sou'wester
          seg(ctx, this, hx - r * 2.1, hy + r * 0.75, hx + r * 1.5, hy + r * 0.95, th(1.5), ink);
          seg(ctx, this, hx - r * 2, hy + r * 0.7, hx + r * 1.4, hy + r * 0.9, 1, '#e0a02a');
          seg(ctx, this, hx - r * 0.6, hy + r * 1.45, hx + r * 0.5, hy + r * 1.45, th(2.5), ink);
          seg(ctx, this, hx - r * 0.6, hy + r * 1.4, hx + r * 0.5, hy + r * 1.4, th(1.5), '#f0b23a');
          seg(ctx, this, hx - r * 0.6, hy + r * 1.05, hx + r * 0.5, hy + r * 1.05, 1, '#b8791f');
          break;
        case 6: // peaked officer's cap (the harbour master)
          seg(ctx, this, hx - r * 0.9, hy + r * 1.3, hx + r * 0.9, hy + r * 1.3, th(2.5), ink);
          seg(ctx, this, hx - r * 0.9, hy + r * 1.25, hx + r * 0.9, hy + r * 1.25, th(1.5), this.hatCol);
          seg(ctx, this, hx - r * 0.9, hy + r * 0.95, hx + r * 0.9, hy + r * 0.95, th(1), '#1b1a20');
          seg(ctx, this, hx + r * 0.5, hy + r * 0.85, hx + r * 2.1, hy + r * 0.8, th(1), ink);
          seg(ctx, this, hx + r * 0.5, hy + r * 0.8, hx + r * 2, hy + r * 0.75, 1, '#3b3a44');
          dot(ctx, this, hx + r * 0.2, hy + r * 1.35, Math.max(1, Math.round(U * 0.8)), '#f2c744');
          break;
        case 7: // headscarf
          seg(ctx, this, hx - r * 1.05, hy + r * 1.0, hx + r * 0.95, hy + r * 1.0, th(2), ink);
          seg(ctx, this, hx - r * 1.0, hy + r * 0.95, hx + r * 0.9, hy + r * 0.95, th(1.2), this.hatCol);
          seg(ctx, this, hx - r * 1.0, hy + r * 0.9, hx - r * 1.1, hy + r * 0.1, th(1.2), ink);
          seg(ctx, this, hx - r * 1.0, hy + r * 0.85, hx - r * 1.05, hy + r * 0.15, 1, shade(this.hatCol, 1.2));
          break;
        default: // bare head, a bit more hair
          seg(ctx, this, hx - r * 0.85, hy + r * 1.0, hx + r * 0.85, hy + r * 1.0, th(1.5), this.hair);
          seg(ctx, this, hx - r * 0.85, hy + r * 0.82, hx + r * 0.3, hy + r * 0.82, 1, shade(this.hair, 1.35));
          break;
      }
    }
    drawItem(ctx, cam, t, h1x, h1y, h2x, h2y, ink) {
      void h2x; void h2y;
      if (!this.item) return;
      const th = v => Math.max(1, Math.round(v * U));
      if (this.item === 'rod') {
        const bend = this.catchT > 0 ? 1 : 0;
        const tipX = h1x + 13 - bend * 3, tipY = h1y + 9 - bend * 5;
        seg(ctx, this, h1x - 3, h1y - 2, tipX, tipY, th(1.5), ink);
        seg(ctx, this, h1x - 3, h1y - 2, tipX, tipY, 1, '#6b4a2a');
        dot(ctx, this, h1x + 1, h1y, th(1), W.met2);
        T(this, tipX, tipY);
        const lx = Math.round(_tx), ly = Math.round(_ty);
        const wy = Math.round((this.waterY - cam.y) * K);
        if (wy > ly) {
          ctx.fillStyle = 'rgba(232,244,255,0.30)';
          const drift = Math.sin(t * 1.3 + this.workPh) * 3 * K;
          for (let y = ly; y < wy; y += 3) ctx.fillRect(Math.round(lx + drift * (y - ly) / Math.max(1, wy - ly)) / K, y / K, 1 / K, 1 / K);
          const fx = Math.round(lx + drift), fy = wy + Math.round(Math.sin(t * 3 + this.workPh) * 1.5 * K);
          const A = (px2, py, pw, ph, c2) => { ctx.fillStyle = c2; ctx.fillRect(px2 / K, py / K, pw / K, ph / K); };
          A(fx - th(0.8), fy - th(1.4), th(1.6), th(1.6), W.ink);
          A(fx - th(0.6), fy - th(1.2), th(1.2), th(0.6), '#ffffff');
          A(fx - th(0.6), fy - th(0.6), th(1.2), th(0.6), '#e0322e');
          if (this.catchT > 0) A(fx - th(2), fy + th(0.4), th(4), 1, 'rgba(235,250,255,0.8)');
        }
      } else if (this.item === 'crate' || this.item === 'box') {
        const spr = this.item === 'box' ? P.fishBox : P.crateSm;
        T(this, h1x + 2.2, h1y + 2.2);
        ctx.drawImage(spr.c, (Math.round(_tx) - (spr.w >> 1)) / K, (Math.round(_ty) - (spr.h >> 1)) / K, spr.w / K, spr.h / K);
      } else if (this.item === 'hammer') {
        const a = Math.sin(this.workPh);
        const ex = h1x + 5, ey = h1y + (a > 0 ? 3 : -2);
        seg(ctx, this, h1x, h1y, ex, ey, th(1.5), ink);
        seg(ctx, this, h1x, h1y, ex, ey, 1, '#7a5230');
        seg(ctx, this, ex - 0.6, ey + 1.4, ex + 0.6, ey - 1.4, th(2), ink);
        seg(ctx, this, ex - 0.4, ey + 1.2, ex + 0.4, ey - 1.2, th(1), W.met2);
      } else if (this.item === 'fish') {
        T(this, h1x + 2, h1y - 1);
        ctx.drawImage(P.fish.c, (Math.round(_tx) - (P.fish.w >> 1)) / K, (Math.round(_ty) - (P.fish.h >> 1)) / K, P.fish.w / K, P.fish.h / K);
      } else if (this.item === 'knife') {
        // gutting: a short blade and a fish held down on the board
        seg(ctx, this, h1x, h1y, h1x + 1.6, h1y - 1.4, th(1.4), ink);
        seg(ctx, this, h1x, h1y, h1x + 1.5, h1y - 1.3, 1, W.met3);
        T(this, h1x + 1.2, h1y - 3.4);
        ctx.drawImage(P.fish.c, (Math.round(_tx) - (P.fish.w >> 1)) / K, (Math.round(_ty) - (P.fish.h >> 1)) / K, P.fish.w / K, P.fish.h / K);
      } else if (this.item === 'net') {
        // a lap full of net, mended stitch by stitch
        seg(ctx, this, h1x - 1, h1y - 2.4, h1x + 3.4, h1y - 2.4, th(2.6), W.net0);
        ctx.fillStyle = W.net1;
        T(this, h1x + 1.4, h1y - 2.4);
        const cx2 = Math.round(_tx), cy2 = Math.round(_ty);
        for (let i = -uw(2.5); i <= uw(2.5); i++) for (let j = -uw(1.5); j <= uw(1.5); j++)
          if (((i + j) & 1) === 0) ctx.fillRect((cx2 + i) / K, (cy2 + j) / K, 1 / K, 1 / K);
        seg(ctx, this, h1x, h1y, h1x + 0.8, h1y - 1.2, 1, W.met3);
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
  // ---- bake: a working deck on driven piles -------------------------------
  // o.x,o.w,o.deckY,o.waterY in world units. o.job picks what stands on it.
  function makePlatform(o) {
    const pad = 20, topPad = 46;                 // world units of canvas margin
    const drop = o.waterY - o.deckY;
    const ch = topPad + drop + 24;
    const lights = [];
    const job = o.job || 'general';
    const draw = (c, rng) => {
      const L = uw(pad), D = uw(topPad), wb = uw(o.w), waterL = uw(topPad + drop);
      // water shadow under the structure
      R(c, L - uw(3), waterL, wb + uw(6), uw(2.5), 'rgba(6,20,52,0.34)');
      R(c, L - uw(1.5), waterL + uw(2.5), wb + uw(3), uw(1.5), 'rgba(6,20,52,0.20)');
      // ---- piles
      const px = [];
      const step = uw(12) + Math.floor(rng.next() * uw(5));
      for (let x = uw(2.5); x < wb - uw(2); x += step) px.push(x);
      if (px.length < 2) px.push(wb - uw(3.5));
      for (let i = 0; i < px.length; i++) {
        const style = rng.next() < 0.3 ? 1 : rng.next() < 0.3 ? 2 : 0;
        Kit.pile(c, L + px[i], D + uw(1.5), waterL + uw(3) + Math.floor(rng.next() * uw(2)), rng.next() < 0.35 ? uw(3) : uw(2.5), rng, style, waterL);
      }
      // ---- cross bracing between piles
      for (let i = 0; i < px.length - 1; i++) {
        const a = L + px[i] + uw(1), b = L + px[i + 1] + uw(1);
        const y0 = D + uw(4), y1 = waterL - uw(3);
        const kind = rng.next();
        if (kind < 0.36) { Kit.brace(c, a, y1, b, y0 + uw(2), uw(1.5)); }
        else if (kind < 0.74) { Kit.brace(c, a, y1, b, y0 + uw(2), uw(1.5)); Kit.brace(c, b, y1, a, y0 + uw(2), uw(1.5)); }
        else {
          Kit.brace(c, a, y0 + uw(3), b, y0 + uw(3), uw(1.5));
          Kit.brace(c, a + uw(1), y1 - uw(1), b - uw(1), y0 + uw(4), uw(1));
        }
        if (rng.next() < 0.45) Kit.lashing(c, a - uw(1.5), y0 + uw(2) + Math.floor(rng.range(0, uw(4))), uw(4.5), rng);
      }
      // ---- stringer beams under the deck
      R(c, L - uw(1), D + uw(3), wb + uw(2), 1, W.ink);
      R(c, L - uw(1), D + uw(3) + 1, wb + uw(2), uw(1.5), W.post1);
      R(c, L - uw(1), D + uw(3) + 1, wb + uw(2), 1, W.post2);
      R(c, L - uw(1), D + uw(4.5) + 1, wb + uw(2), 1, W.ink);
      // ---- deck surface
      Kit.deck(c, L, D, wb, rng);
      // ---- things hung off the edge
      let hx = uw(4);
      while (hx < wb - uw(12)) {
        const r = rng.next();
        if (r < 0.30) { Kit.net(c, L + hx, D + uw(6), uw(9) + Math.floor(rng.next() * uw(6)), uw(5) + Math.floor(rng.next() * uw(4)), rng, { sag: uw(1.5) }); hx += uw(17); }
        else if (r < 0.44) { c.drawImage(P.tyre.c, L + hx, D + uw(5)); R(c, L + hx + uw(1), D + uw(3), 1, uw(2.5), W.rope0); hx += uw(8); }
        else hx += uw(7) + Math.floor(rng.next() * uw(10));
      }
      // ---- railing, with an opening where people step down
      if (o.rail !== false) {
        const gap0 = o.openX0 === undefined ? -1 : uw(o.openX0), gap1 = o.openX1 === undefined ? -1 : uw(o.openX1);
        let rx = 0;
        while (rx < wb) {
          let seg2 = Math.min(wb - rx, uw(20));
          if (gap0 >= 0 && rx + seg2 > gap0 && rx < gap1) {
            if (rx < gap0) seg2 = gap0 - rx;
            else { rx = gap1; continue; }
          }
          if (seg2 > uw(3)) Kit.railing(c, L + rx, D, seg2, rng, { broken: rng.next() < 0.22, rope: rng.next() < 0.2 });
          rx += Math.max(seg2, uw(4));
        }
      }
      // ---- steps down to the water
      if (o.stair !== undefined) {
        const sxp = L + uw(o.stair);
        Kit.stairs(c, sxp, D + uw(1), uw(8), uw(8), o.stairDir === undefined ? 1 : o.stairDir, rng);
        R(c, sxp - 1, D, uw(9), 1, W.ink);
        for (let i = 0; i < uw(9); i += 2) R(c, sxp + i, D - uw(2.5) + Math.round(i * 0.9), 1, 1, i % 4 ? W.rope1 : W.rope0);
        R(c, sxp + uw(8.5), D - uw(3), uw(1), uw(4), W.ink); R(c, sxp + uw(8.5), D - uw(3), 1, uw(4), W.post2);
      }
      if (o.ladder !== undefined) Kit.ladder(c, L + uw(o.ladder), D + uw(1), uw(drop - 1), rng);
      // ---- what this deck is FOR ------------------------------------------
      const put = (spr, x, yOff) => c.drawImage(spr.c, L + x, D - spr.h + (yOff || 0));
      let cx2 = uw(2);
      const room = () => wb - uw(5) - cx2;
      const W8 = { general: 0, dry: 0, pots: 0, repair: 0, market: 0, store: 0 }; void W8;
      while (room() > uw(5)) {
        const r = rng.next();
        if (job === 'dry' && r < 0.55 && room() > uw(16)) { Kit.fishRack(c, L + cx2, D, uw(14), rng); cx2 += uw(17); continue; }
        if (job === 'pots' && r < 0.6 && room() > uw(7)) { Kit.crabPots(c, L + cx2, D, 2 + Math.floor(rng.next() * 3), rng); cx2 += uw(7); continue; }
        if (job === 'repair' && r < 0.4 && room() > uw(9)) { Kit.winch(c, L + cx2, D, rng); cx2 += uw(8); continue; }
        if (job === 'market' && r < 0.45 && room() > uw(8)) { put(P.fishBox, cx2); put(P.fishBox, cx2 + uw(1), -P.fishBox.h + uw(1)); cx2 += uw(7); continue; }
        if (job === 'store' && r < 0.5 && room() > uw(8)) { put(P.barrel, cx2); put(P.keg, cx2 + uw(5)); cx2 += uw(9); continue; }
        if (r < 0.10) { put(P.barrel, cx2); cx2 += uw(6); if (rng.next() < 0.5) { put(P.barrelOpen, cx2); cx2 += uw(6); } }
        else if (r < 0.20) { put(P.crate, cx2); if (rng.next() < 0.45) put(P.crateSm, cx2 + uw(1), -P.crate.h); cx2 += uw(6); }
        else if (r < 0.27) { put(P.ropeCoil, cx2); cx2 += uw(6); }
        else if (r < 0.33) { put(P.bucket, cx2); cx2 += uw(5); }
        else if (r < 0.38) { put(P.sack, cx2); cx2 += uw(5); }
        else if (r < 0.42) { put(P.pot, cx2); cx2 += uw(4); }
        else if (r < 0.47) { put(P.anchor, cx2); cx2 += uw(6); }
        else if (r < 0.53) { Kit.bollard(c, L + cx2, D, rng); cx2 += uw(5); }
        else if (r < 0.58 && room() > uw(16)) { Kit.fishRack(c, L + cx2, D, uw(14), rng); cx2 += uw(17); }
        else if (r < 0.63 && room() > uw(8)) { Kit.crabPots(c, L + cx2, D, 2 + Math.floor(rng.next() * 2), rng); cx2 += uw(7); }
        else if (r < 0.68 && room() > uw(9)) { Kit.winch(c, L + cx2, D, rng); cx2 += uw(8); }
        else if (r < 0.74) { // lamp post
          const ph2 = L + cx2, top = D - uw(11);
          R(c, ph2 - 1, top, 1, uw(11), W.ink); R(c, ph2, top, uw(1), uw(11), W.post1);
          R(c, ph2, top, 1, uw(11), W.post2); R(c, ph2 + uw(1), top, 1, uw(11), W.ink);
          R(c, ph2 + uw(1), top, uw(2.5), 1, W.post1); R(c, ph2 + uw(1), top - 1, uw(2.5), 1, W.ink);
          c.drawImage(P.lantern.c, ph2 + uw(2), top + 1);
          lights.push({ x: ph2 + uw(2.5), y: top + uw(3), w: uw(2.5), h: uw(2.5), ph: rng.range(0, TAU), k: 1.25, lantern: true });
          cx2 += uw(8);
        }
        else cx2 += uw(5) + Math.floor(rng.next() * uw(11));
      }
      if (o.davit) Kit.davit(c, L + uw(o.davit), D, rng, o.davitDir || 1);
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

  // ---- bake: a building, optionally on stilts over the water --------------
  function makeHouse(o) {
    const pad = 18, wallH = o.wallH, w = o.w;
    const kind = o.kind || 'cottage';
    const roofH = Math.round(w * 0.30) + 3;
    const topPad = wallH + roofH + 22;
    const drop = o.stilts ? (o.waterY - o.y) : 0;
    const ch = topPad + drop + 26;
    const draw = (c, rng) => {
      const L = uw(pad), base = uw(topPad), wa = uw(w);
      if (o.stilts) {
        const waterL = uw(topPad + drop);
        R(c, L - uw(3), waterL, wa + uw(6), uw(2.5), 'rgba(6,20,52,0.34)');
        const n = w > 44 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const px2 = Math.round(L + uw(1.5) + (wa - uw(4.5)) * i / (n - 1));
          Kit.pile(c, px2, base, waterL + uw(3), uw(3), rng, i % 2 ? 1 : 2, waterL);
        }
        for (let i = 0; i < n - 1; i++) {
          const a = Math.round(L + uw(2.5) + (wa - uw(4.5)) * i / (n - 1)), b = Math.round(L + uw(2.5) + (wa - uw(4.5)) * (i + 1) / (n - 1));
          Kit.brace(c, a, waterL - uw(3), b, base + uw(4), uw(1.5));
          Kit.brace(c, b, waterL - uw(3), a, base + uw(4), uw(1.5));
        }
        R(c, L - uw(1.5), base - 1, wa + uw(3), 1, W.ink);
        R(c, L - uw(1.5), base, wa + uw(3), uw(1.5), W.post1);
        R(c, L - uw(1.5), base + uw(1.5), wa + uw(3), 1, W.ink);
        Kit.ladder(c, L + wa - uw(5), base + uw(2), uw(drop - 1), rng);
      }
      const res = Kit.house(c, L, base, wa, uw(wallH), o.col, rng, Object.assign({ kind, roofH: uw(roofH) }, o));
      return { lights: res.lights, smoke: res.smoke, haze: o.haze ? ['#bcd8ea', o.haze] : null };
    };
    const d = new Destructible({
      kind: 'house', x: o.x, y: o.y, seed: o.seed,
      cw: w + pad * 2, ch, ox: -pad, oy: -topPad,
      bx: -2, by: -(wallH + roofH), bw: w + 4, bh: wallH + roofH + drop,
      hp: o.hp || (150 + w * 2), waterY: o.waterY, ruinKeep: o.stilts ? Math.min(30, drop + 10) : 10,
      draw,
    });
    if (o.stilts) d.foam = { x0: o.x - 4, x1: o.x + w + 4, y: o.waterY };
    return d;
  }

  // ---- bake: a section of the pier running out into the water -------------
  function makeJetty(o) {
    const pad = 16;
    const cwid = o.w + pad * 2, ch = o.len + 4;
    const lights = [];
    const draw = (c, rng) => {
      const L = uw(pad), wa = uw(o.w), la = uw(o.len);
      Kit.jetty(c, L, uw(1), wa, la, rng, { rails: o.rails !== false });
      // furniture along the pier: bollards with rope, cleats, pots, lamps
      let y = uw(3);
      while (y < la - uw(6)) {
        const r = rng.next();
        const sideL = rng.next() < 0.5;
        const cx2 = sideL ? L + uw(5) : L + wa - uw(11);
        if (r < 0.13) { Kit.bollard(c, cx2, y + uw(4), rng); if (rng.next() < 0.7) { // rope run to the rail
            for (let i = 0; i < uw(6); i++) R(c, cx2 + (sideL ? -i : uw(3) + i), y + uw(2) + Math.round(Math.sin(i / uw(6) * Math.PI) * uw(1)), 1, 1, i % 3 ? W.rope1 : W.rope0); } }
        else if (r < 0.22) c.drawImage(P.crate.c, cx2, y);
        else if (r < 0.30) c.drawImage(P.barrel.c, cx2, y);
        else if (r < 0.37) c.drawImage(P.ropeCoil.c, cx2, y);
        else if (r < 0.45) Kit.crabPots(c, cx2, y + uw(4), 2 + Math.floor(rng.next() * 2), rng);
        else if (r < 0.50) c.drawImage(P.bucket.c, cx2 + uw(1), y);
        else if (r < 0.55) Kit.cleat(c, cx2, y);
        else if (r < 0.62) c.drawImage(P.fishBox.c, cx2 - uw(1), y);
        else if (r < 0.70 && o.rails !== false) {
          const lx = sideL ? L - 1 : L + wa - uw(1.5);
          R(c, lx, y - uw(7), uw(1.5), uw(8), W.ink); R(c, lx, y - uw(7), uw(1), uw(8), W.post1);
          c.drawImage(P.lantern.c, lx - 1, y - uw(10));
          lights.push({ x: lx - 1, y: y - uw(8), w: uw(2.5), h: uw(2.5), ph: rng.range(0, TAU), k: 1.3, lantern: true });
        } else if (r < 0.76) c.drawImage(P.fish.c, cx2 + uw(1), y + uw(1));
        y += uw(4) + Math.floor(rng.next() * uw(7));
      }
      // a ladder down the side into the water
      if (o.sideLadder) {
        const lx = o.sideLadder > 0 ? L + wa + 1 : L - uw(4);
        const ly = uw(8);
        R(c, lx - 1, ly - 1, uw(4) + 2, uw(14) + 2, W.ink);
        Kit.ladder(c, lx, ly, uw(14), rng);
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
    const len = o.len || 26, pad = 7;
    const draw = (c, rng) => { Kit.rowboat(c, uw(pad), uw(20), uw(len), rng); return {}; };
    return new Destructible({
      kind: 'boat', x: o.x, y: o.y, seed: o.seed,
      cw: len + pad * 2, ch: 24, ox: -pad, oy: -20,
      bx: 0, by: -14, bw: len, bh: 14,
      hp: 60, waterY: o.y - 4, ruinKeep: 0, leaveRuin: false, bob: 1.6,
      draw,
    });
  }

  // ---- bake: a slipway with a hull in a cradle ----------------------------
  function makeSlip(o) {
    const pad = 10, topPad = 30;
    const len = o.len || 40;
    const draw = (c, rng) => {
      const L = uw(pad), D = uw(topPad), wa = uw(o.w);
      Kit.slipway(c, L, D, wa, uw(len), rng);
      // a hull hauled up the slip, propped in its cradle, half re-planked
      Kit.cradleHull(c, L + uw(4), D + uw(16), wa - uw(9), rng);
      Kit.winch(c, L + uw(2), D + uw(2), rng);
      c.drawImage(P.barrel.c, L + wa - uw(8), D + uw(2) - P.barrel.h);
      c.drawImage(P.ropeCoil.c, L + wa - uw(13), D + uw(3) - P.ropeCoil.h);
      // the hauling wire running from the winch down to the cradle
      for (let i = 0; i < uw(14); i++) R(c, L + uw(4) + i, D + uw(2) + Math.round(i * 0.75), 1, 1, i % 3 ? W.met1 : W.met2);
      return {};
    };
    return new Destructible({
      kind: 'deck', x: o.x, y: o.y, seed: o.seed,
      cw: o.w + pad * 2, ch: topPad + len + 10, ox: -pad, oy: -topPad,
      bx: 0, by: -20, bw: o.w, bh: 34,
      hp: 140, waterY: o.y + len * 0.5, ruinKeep: 12,
      draw,
    });
  }

  // ---- bake: beach scatter & trees ---------------------------------------
  const BEACH = [];
  function buildBeach() {
    if (BEACH.length) return;
    const mkb = (wu, hu, fn) => {
      const w = uw(wu), h = uw(hu);
      const c = cv(w, h); const rng = new SeededRandom(1200 + BEACH.length * 131);
      fn(c, rng, w, h);
      BEACH.push({ c: c.canvas, w, h, ox: -wu / 2, oy: -hu, wu, hu });
    };
    mkb(40, 20, (c, rng) => { Kit.rowboat(c, uw(2), uw(18), uw(30), rng); R(c, uw(1), uw(18), uw(18), uw(1), 'rgba(90,70,40,0.35)'); });
    mkb(40, 30, (c, rng) => { Kit.fishRack(c, uw(2.5), uw(28), uw(15), rng, { h: uw(13) }); });
    mkb(30, 24, (c, rng) => {
      c.drawImage(P.crate.c, uw(1), uw(24) - P.crate.h);
      c.drawImage(P.barrel.c, uw(7), uw(24) - P.barrel.h);
      if (rng.next() < 0.7) c.drawImage(P.crateSm.c, uw(1.5), uw(24) - P.crate.h - P.crateSm.h);
    });
    mkb(34, 20, (c, rng) => {
      const a = makeRock(rng.int(1, 9999), uw(4.5)), b = makeRock(rng.int(1, 9999), uw(3));
      c.drawImage(a.c, uw(1), uw(20) - a.h); c.drawImage(b.c, uw(9), uw(20) - b.h);
    });
    mkb(30, 12, (c, rng) => {
      pline(c, uw(1), uw(10), uw(13), uw(7), uw(2), W.ink); pline(c, uw(1), uw(10), uw(13), uw(7), uw(1), W.deck1);
      pline(c, uw(4), uw(11), uw(10), uw(5), uw(1), W.deck2);
      for (let i = 0; i < uw(14); i++) R(c, rng.range(1, uw(29)), rng.range(uw(8), uw(12)), rng.next() < 0.5 ? 2 : 1, 1, rng.next() < 0.5 ? W.alg : W.alg2);
    });
    mkb(28, 14, (c, rng) => {
      Kit.net(c, uw(1), uw(1), uw(12), uw(3.5), rng, { sag: uw(0.5) });
      c.drawImage(P.ropeCoil.c, uw(7), uw(14) - P.ropeCoil.h);
    });
    mkb(30, 14, (c, rng) => {
      c.drawImage(P.barrelOpen.c, 1, uw(14) - P.barrelOpen.h);
      c.drawImage(P.barrel.c, uw(5.5), uw(14) - P.barrel.h);
      c.drawImage(P.ropeCoil.c, uw(10), uw(14) - P.ropeCoil.h);
      void rng;
    });
    mkb(24, 14, (c, rng) => { c.drawImage(P.anchor.c, uw(1), uw(14) - P.anchor.h); c.drawImage(P.bucket.c, uw(7), uw(14) - P.bucket.h); void rng; });
    mkb(26, 16, (c, rng) => { Kit.crabPots(c, uw(2), uw(16), 3, rng); Kit.crabPots(c, uw(12), uw(16), 2, rng); });
    mkb(34, 12, (c, rng) => {   // upturned hull
      const la = uw(30);
      for (let i = 0; i < la; i++) {
        const k = i / la, hgt = Math.round(Math.sin(k * Math.PI) * uw(4.5)) + 1;
        R(c, uw(1) + i, uw(11) - hgt, 1, hgt, i % uw(2) === 0 ? W.deck0 : W.deck1);
        R(c, uw(1) + i, uw(11) - hgt, 1, 1, W.ink);
        if (rng.next() < 0.2) R(c, uw(1) + i, uw(11) - hgt + 2, 1, 1, W.deck3);
      }
      R(c, uw(1), uw(11), la, 1, W.ink);
    });
  }
  const TREES = [];
  function buildTrees() {
    if (TREES.length) return;
    for (let i = 0; i < 7; i++) {
      const rng = new SeededRandom(700 + i * 37);
      const wu = 46, hu = 52;
      const c = cv(uw(wu), uw(hu));
      Kit.tree(c, uw(23), uw(50), rng, i < 3 ? 'palm' : 'leafy');
      TREES.push({ c: c.canvas, w: uw(wu), h: uw(hu), ox: -23, oy: -50, wu, hu });
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
      // Zones: 0 = the working heart by the pier, 1 = the yards, 2 = the
      // drying ground and outbuildings at the ends.
      const zoneOf = dx => { const a = Math.abs(dx); return a < 320 ? 0 : a < 980 ? 1 : 2; };

      // ---- back row: outbuildings on the sand, trees
      for (let i = 0; i < 7; i++) {
        const hx = X + rng.range(-1250, 1250);
        if (Math.abs(hx - X) < 150) continue;
        const w = rng.int(26, 40);
        this.add(makeHouse({
          x: hx, y: rowB.deckY + rng.range(-10, 4), w, wallH: rng.int(18, 24), col: pick(HOUSE_COLS),
          kind: zoneOf(hx - X) === 2 ? 'shed' : pick(['shed', 'cottage']),
          seed: seed++, waterY: rowB.waterY, haze: rowB.haze, stilts: false,
          doorAt: rng.range(0.25, 0.7), chimneyLeft: rng.next() < 0.5, awning: rng.next() < 0.4,
        }), -2);
      }
      for (let i = 0; i < 26; i++) {
        const tx = X + rng.range(-1500, 1500);
        this.trees.push({ s: TREES[rng.int(0, TREES.length - 1)], x: tx, y: S - rng.range(62, 155), ph: rng.range(0, TAU) });
      }
      for (let i = 0; i < 34; i++) {
        const bx = X + rng.range(-1600, 1600);
        if (Math.abs(bx - X) < 70) continue;
        this.trees.push({ s: BEACH[rng.int(0, BEACH.length - 1)], x: bx, y: S - rng.range(40, 96), ph: 0, flat: true });
      }
      this.trees.sort((a, b) => a.y - b.y);

      // ---- the working boardwalk -------------------------------------------
      const startX = X - 2400, endX = X + 2400;
      let x = startX;
      const platforms = [];
      const JOBS = [['dry', 'store', 'general'], ['pots', 'repair', 'store', 'general'], ['dry', 'general', 'pots']];
      while (x < endX) {
        const z = zoneOf(x + 80 - X);
        let w = z === 0 ? rng.int(120, 170) : z === 1 ? rng.int(110, 200) : rng.int(90, 210);
        if (x + w > endX) w = endX - x;
        if (w < 60) break;
        const o = {
          x, w, deckY: rowM.deckY + Math.round(rng.range(-3, 3)), waterY: rowM.waterY, seed: seed++,
          job: pick(JOBS[z]),
        };
        // opening where the pier joins the shore
        if (x < X + 40 && x + w > X - 40) { o.openX0 = Math.max(0, X - 34 - x); o.openX1 = Math.min(w, X + 34 - x); o.job = 'market'; }
        if (o.openX0 === undefined && w > 130 && rng.next() < (z === 0 ? 0.6 : 0.35)) {
          o.stair = Math.round(rng.range(16, w - 40)); o.stairDir = rng.next() < 0.5 ? 1 : -1;
          o.openX0 = o.stair; o.openX1 = o.stair + 18;
        } else if (o.openX0 === undefined && rng.next() < 0.3) {
          o.ladder = Math.round(rng.range(10, w - 14));
        }
        if (z === 0 && rng.next() < 0.5) { o.davit = Math.round(rng.range(20, w - 20)); o.davitDir = rng.next() < 0.5 ? 1 : -1; }
        const p = makePlatform(o);
        this.add(p, 0);
        platforms.push({ x, w, deckY: o.deckY, str: p, zone: z, job: o.job });
        this.decks.push({ x0: x, x1: x + w, y0: o.deckY - 8, y1: o.deckY + 10 });
        x += w + rng.int(0, 4);
      }
      // ---- buildings along the boardwalk, by zone
      let heartLoft = false, heartMarket = false;
      for (const pf of platforms) {
        if (pf.w < 100) continue;
        const skip = pf.zone === 0 ? 0.05 : pf.zone === 1 ? 0.3 : 0.55;
        if (rng.next() < skip) continue;
        const hw = pf.w > 170 ? rng.int(48, 64) : rng.int(34, 48);
        const hx = pf.x + rng.range(6, Math.max(8, pf.w - hw - 6));
        if (Math.abs(hx + hw / 2 - X) < 78) continue;
        let kind;
        if (pf.zone === 0) {
          if (!heartLoft) { kind = 'loft'; heartLoft = true; }
          else if (!heartMarket) { kind = 'market'; heartMarket = true; }
          else kind = pick(['boathouse', 'shed', 'loft']);
        } else if (pf.zone === 1) kind = pick(['shed', 'cottage', 'loft', 'boathouse']);
        else kind = pick(['shed', 'cottage', 'shed']);
        this.add(makeHouse({
          x: hx, y: pf.deckY, w: hw, wallH: kind === 'loft' ? rng.int(38, 48) : rng.int(26, 36), col: pick(HOUSE_COLS),
          kind, seed: seed++, waterY: rowM.waterY, stilts: false,
          doorAt: rng.range(0.2, 0.68), doorOpen: rng.next() < 0.35, chimneyLeft: rng.next() < 0.5,
        }), 1);
      }

      // ---- the boatyard: a slipway with a hull in its cradle
      for (const side of [-1, 1]) {
        const sx2 = X + side * rng.range(420, 700);
        this.add(makeSlip({ x: sx2, y: rowM.deckY + 10, w: 54, len: 46, seed: seed++ }), 2);
      }

      // ---- front row: structures standing out in the water
      for (const side of [-1, 1]) {
        const hx = X + side * rng.range(200, 430) - 30;
        const hw = rng.int(42, 58);
        this.add(makeHouse({
          x: hx, y: rowF.deckY, w: hw, wallH: rng.int(26, 34), col: pick(HOUSE_COLS),
          kind: side < 0 ? 'boathouse' : 'loft',
          seed: seed++, waterY: rowF.waterY, stilts: true,
          doorAt: rng.range(0.25, 0.65), doorOpen: rng.next() < 0.5, chimneyLeft: side < 0,
        }), 3);
        this.decks.push({ x0: hx, x1: hx + hw, y0: rowF.deckY - 8, y1: rowF.deckY + 8 });
        const dx = hx + (side < 0 ? hw + 2 : -64);
        const pl = makePlatform({
          x: dx, w: 62, deckY: rowF.deckY, waterY: rowF.waterY, seed: seed++, hp: 90, job: side < 0 ? 'pots' : 'dry',
          stair: side < 0 ? 40 : 6, stairDir: side < 0 ? 1 : -1, openX0: side < 0 ? 40 : 6, openX1: side < 0 ? 58 : 24,
          davit: side < 0 ? undefined : 50, davitDir: 1,
        });
        this.add(pl, 3);
        this.decks.push({ x0: dx, x1: dx + 62, y0: rowF.deckY - 8, y1: rowF.deckY + 10 });
        this.add(makeBoat({ x: dx + 10, y: rowF.waterY + 10, len: rng.int(22, 30), seed: seed++ }), 4);
      }

      // ---- the pier out into the water
      const jw = 44;
      let jy = S - 22;
      const jEnd = S + 140;
      let first = true;
      while (jy < jEnd) {
        const len = Math.min(jEnd - jy, 58);
        this.add(makeJetty({ x: X, y: jy, w: jw, len, seed: seed++, rails: true, sideLadder: first ? 0 : (rng.next() < 0.5 ? 1 : -1) }), 5);
        jy += len; first = false;
      }
      this.decks.push({ x0: X - jw / 2, x1: X + jw / 2, y0: S - 22, y1: jEnd });
      this.add(makeBoat({ x: X - 46, y: S + 96, len: 28, seed: seed++ }), 5);
      this.add(makeBoat({ x: X + 26, y: S + 60, len: 24, seed: seed++ }), 5);
      for (let i = 0; i < 18; i++) this.props.push({ s: P.buoyProp, x: X + rng.range(-2200, 2200), y: S + rng.range(30, 150), ph: rng.range(0, TAU), amp: 1.8 });
      for (let i = 0; i < 14; i++) this.props.push({ s: P.buoyBall, x: X + rng.range(-2300, 2300), y: S + rng.range(20, 120), ph: rng.range(0, TAU), amp: 1.4 });

      // ---- the sign
      const sw = 96, sh = 26;
      const sc = cv(uw(sw), uw(sh));
      const A = v => uw(v);
      R(sc, 0, A(4), A(sw), A(8), W.ink);
      R(sc, 1, A(4) + 1, A(sw) - 2, A(8) - 2, W.deck1);
      R(sc, 1, A(4) + 1, A(sw) - 2, A(1), W.deck3);
      R(sc, 1, A(11), A(sw) - 2, A(1), W.deck0);
      for (let i = 0; i < A(sw) - 2; i += A(1.5)) if ((i * 7 % 11) < A(1.5)) R(sc, 1 + i, A(5), A(1), A(6), W.deck2);
      R(sc, A(6), A(12), A(1.5), A(7), W.post1); R(sc, A(87), A(12), A(1.5), A(7), W.post1);
      R(sc, A(6) - 1, A(12), 1, A(7), W.ink); R(sc, A(88.5), A(12), 1, A(7), W.ink);
      try {
        const tc = cv(uw(sw), uw(sh));
        pixelText(tc, 'FISHER VILLAGE', uw(48), uw(4.5), uw(4.5), '#ffffff', 'center', false);
        const im = tc.getImageData(0, 0, uw(sw), uw(sh)), d2 = im.data;
        for (let i = 0; i < d2.length; i += 4) {
          const on = d2[i + 3] > 120;
          d2[i] = 0xf6; d2[i + 1] = 0xe0; d2[i + 2] = 0xb0; d2[i + 3] = on ? 255 : 0;
        }
        tc.putImageData(im, 0, 0);
        sc.drawImage(tc.canvas, 0, 0);
      } catch (e) { }
      this.signSprite = { c: sc.canvas, w: uw(sw), h: uw(sh), ox: -sw / 2, oy: -sh, wu: sw, hu: sh };
      this.signX = X; this.signY = S - 52;

      // ---- gulls
      for (let i = 0; i < 16; i++) this.gulls.push({ x: X + rng.range(-2200, 2200), y: S - rng.range(70, 170), vx: rng.range(-16, 16), ph: rng.range(0, TAU), up: 0 });

      // ---- villagers
      this.populate(platforms, rng, rowF, S, X, jw, jEnd);

      this._order = this.structures.slice().sort((a, b) => (a._depth - b._depth) || (a.y - b.y));
      this.built = true;
      return this;
    },
    add(s, depth) { s._depth = depth || 0; this.structures.push(s); return s; },

    populate(platforms, rng, rowF, S, X, jw, jEnd) {
      const mk = (x, y, opts) => { const v = new Villager(x, y, opts); this.villagers.push(v); return v; };
      // the crowd is picked to suit what each stretch of deck is for
      const byJob = {
        dry: ['mend', 'haul', 'gut', 'walk'],
        pots: ['mend', 'hammer', 'haul', 'walk'],
        repair: ['hammer', 'hammer', 'haul', 'chat'],
        store: ['haul', 'walk', 'chat', 'idle'],
        market: ['gut', 'chat', 'walk', 'haul'],
        general: ['walk', 'fish', 'chat', 'idle', 'haul'],
      };
      let ri = 0;
      for (const pf of platforms) {
        const n = pf.zone === 0 ? 4 : pf.w > 150 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          if (this.villagers.length > 26) break;
          const list = byJob[pf.job] || byJob.general;
          const role = list[(ri++) % list.length];
          const lane = { x0: pf.x + 10, y0: pf.deckY, x1: pf.x + pf.w - 10, y1: pf.deckY };
          const vx = rng.range(lane.x0, lane.x1);
          const kid = rng.next() < 0.12;
          mk(vx, pf.deckY, { lane, role: kid ? 'walk' : role, waterY: this.waterY, build: kid ? 'child' : undefined });
        }
      }
      // the harbour master keeps to the head of the pier
      const hm = mk(X + 26, S - 16, { lane: { x0: X - 30, y0: S - 16, x1: X + 30, y1: S - 16 }, role: 'watch_deck', waterY: this.waterY, build: 'boss' });
      hm.onJetty = true;
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
      // pier crowd
      const jl = { x0: X - jw / 2 + 9, y0: S - 10, x1: X + jw / 2 - 9, y1: jEnd - 14 };
      for (let i = 0; i < 7; i++) {
        const u = rng.range(0.1, 0.95);
        const lane = { x0: X - jw / 2 + 9, y0: lerp(jl.y0, jl.y1, Math.max(0, u - 0.3)), x1: X + jw / 2 - 9, y1: lerp(jl.y0, jl.y1, Math.min(1, u + 0.3)) };
        const v = mk(rng.range(lane.x0, lane.x1), lerp(lane.y0, lane.y1, 0.5), { lane, role: i === 0 ? 'fish' : pick(['walk', 'haul', 'fish', 'gut', 'mend', 'chat', 'walk']), onJetty: true });
        v.waterY = v.y + 10;
      }
      // front-row decks
      for (const d of this.decks) {
        if (d.y0 < rowF.deckY - 10 || d.y0 > rowF.deckY + 4) continue;
        if (this.villagers.length > 40) break;
        const lane = { x0: d.x0 + 8, y0: rowF.deckY, x1: d.x1 - 8, y1: rowF.deckY };
        if (lane.x1 - lane.x0 < 20) continue;
        for (let q = 0; q < 2; q++) {
          const v = mk(rng.range(lane.x0, lane.x1), rowF.deckY, { lane, role: pick(['fish', 'mend', 'gut', 'walk', 'haul']) });
          v.waterY = rowF.waterY;
        }
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
        if (gl.x < this.pierX - 2200) gl.vx = Math.abs(gl.vx);
        if (gl.x > this.pierX + 2200) gl.vx = -Math.abs(gl.vx);
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
        const s2 = tr.s;
        ctx.drawImage(s2.c, Math.round(sx * K) / K + s2.ox, Math.round((tr.y + oy) * K) / K + s2.oy, s2.wu, s2.hu);
      }
      // --- sign
      if (this.signSprite) {
        const sx = this.signX + ox, s2 = this.signSprite;
        if (sx > -60 && sx < 700) ctx.drawImage(s2.c, Math.round(sx * K) / K + s2.ox, Math.round((this.signY + oy) * K) / K + s2.oy, s2.wu, s2.hu);
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
        for (let x = x0; x < x1; x += 1) {
          const k = Math.sin(x * 0.28 + t * 3.4) + Math.sin(x * 0.11 - t * 1.7);
          if (k > 0.3) ctx.fillRect(x, y + (k > 1.2 ? -0.5 : 0), 1, 1 / K);
        }
      }
      // --- floating props (buoys)
      for (const p of this.props) {
        const sx = p.x + ox, sy = p.y + oy + Math.sin(t * 1.9 + p.ph) * p.amp;
        if (sx < -12 || sx > 652 || sy < -12 || sy > 372) continue;
        ctx.fillStyle = 'rgba(8,22,52,0.25)'; ctx.fillRect(Math.round(sx) - 3, Math.round(sy) + 1, 7, 2);
        drawSprite(ctx, p.s, sx, sy, 0, 1 / K, 1 / K);
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
        drawSprite(ctx, Math.sin(gl.ph) > 0 ? P.gull : P.gull2, sx, sy, 0, 1 / K, 1 / K);
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
