// ===========================================================================
//  worldmap.js — THE BAY OF BROKEN NETS
//  A hand-drawn pixel-art nautical chart of the archipelago: engraved islands
//  with worked coastlines and hill shading, bathymetric tints and depth
//  contours, soundings, reefs, wrecks, sea monsters, rhumb lines, a compass
//  rose, a cartouche, and the six ports the hunt will take the manatee
//  through.  The whole chart is baked once into an offscreen canvas; only the
//  plotted course, the markers, the chart-ships and the water shimmer move.
//
//  API (exactly what game.js calls):
//    WorldMap.init()                 build sprites + chart once
//    WorldMap.open(unlockedCount)    screen opened; how many ports are free
//    WorldMap.update(dt, t)          mouse / wheel / keys
//    WorldMap.render(ctx, t)         draw the 640x360 screen
//    WorldMap.action                 null | 'launch' | 'back'
//    WorldMap.consume()              clear .action
//    WorldMap.selected               index of the highlighted destination
//    WorldMap.destinations           [{name, blurb, unlocked, x, y}, ...]
//
//  Pure pixel art: integer coordinates, posterised colours, hard edges, no
//  gradients, no blur, no external images.  All text goes through the bitmap
//  font (pixelText / PixelFont.drawText) and all chrome through UIKit.
// ===========================================================================
(function (global) {
  'use strict';

  // ------------------------------------------------------------- helpers --
  function can(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    return c;
  }
  function R(ctx, col, x, y, w, h) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function D1(ctx, col, x, y) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, 1, 1); }
  function box(ctx, col, x, y, w, h) {
    R(ctx, col, x, y, w, 1); R(ctx, col, x, y + h - 1, w, 1);
    R(ctx, col, x, y, 1, h); R(ctx, col, x + w - 1, y, 1, h);
  }
  function hitR(m, x, y, w, h) { return m.x >= x && m.x < x + w && m.y >= y && m.y < y + h; }
  // Bresenham line, optionally dashed (on/off pixel run lengths)
  function line(ctx, col, x0, y0, x1, y1, on, off, ph) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, i = ph || 0, period = (on || 1) + (off || 0);
    ctx.fillStyle = col;
    for (;;) {
      if (!off || (((i % period) + period) % period) < on) ctx.fillRect(x0, y0, 1, 1);
      i++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // hard-edged scanline triangle (no canvas path AA anywhere on this screen)
  function tri(ctx, col, ax, ay, bx, by, cx, cy) {
    const y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
    ctx.fillStyle = col;
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5; let n = 0, lo = 1e9, hi = -1e9;
      const ex = (px0, py0, px1, py1) => {
        if ((py0 <= yc && py1 > yc) || (py1 <= yc && py0 > yc)) {
          const x = px0 + (yc - py0) / (py1 - py0) * (px1 - px0);
          if (x < lo) lo = x; if (x > hi) hi = x; n++;
        }
      };
      ex(ax, ay, bx, by); ex(bx, by, cx, cy); ex(cx, cy, ax, ay);
      if (n < 2) continue;
      const i0 = Math.round(lo), i1 = Math.round(hi);
      if (i1 >= i0) ctx.fillRect(i0, y, i1 - i0 + 1, 1);
    }
  }
  // dotted / solid circle outline, pure integer pixels
  function ring(ctx, col, cx, cy, r, gap) {
    const n = Math.max(12, Math.round(r * 7));
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      if (gap && (i % gap)) continue;
      const a = i / n * TAU;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }
  function disc(ctx, col, cx, cy, r) {
    ctx.fillStyle = col;
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }
  // a short stroke at an angle — the nib strokes everything on this chart uses
  function stroke(ctx, col, x, y, ang, len) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i <= len; i++) D1(ctx, col, Math.round(x + ca * i), Math.round(y + sa * i));
  }
  // the font's display face, on demand (pixelText picks a face by size alone)
  function txt(ctx, s, x, y, size, opts) { return PixelFont.drawText(ctx, s, x, y, size, opts); }
  function mText(s, size) { return textWidth(s, size); }

  // ------------------------------------------------------- chart palette --
  // Aged laid paper, iron-gall ink, a little carmine for the ports and the
  // track.  The sea is tinted by depth so the isles read at a glance; the
  // land is a warm five-step ramp lit from the north-west.
  const P = {
    // water, shoal -> abyss
    sea0: '#eee2bb', sea1: '#ded0a6', sea2: '#cbbd91', sea3: '#b9a97e', sea4: '#a89870',
    seaL: '#f4ead0', seaX: '#9a8a63',
    stain: '#dacea4', stain2: '#ccbd92', foxing: '#a98d5c',
    // land ramp, lit / mid / shaded
    lit: ['#fbf0d3', '#f2e2b4', '#e6cf94', '#d6ba76', '#c4a35c'],
    mid: ['#f3e7c4', '#e8d5a2', '#d9c086', '#c7a868', '#b4904f'],
    shd: ['#e8dab6', '#dbc796', '#c9ae79', '#b4955e', '#a1804c'],
    sand: '#f7ecd0', beach: '#efdcac',
    ink: '#3d2a11', ink2: '#664a22', inkL: '#8d6d3c', faint: '#b59b6a', hair: '#c9b184',
    forest: '#4c6a31', forestD: '#33501f', forestL: '#6b8642',
    red: '#9b3620', redL: '#c1552d', redD: '#651f10', wax: '#8e2a18', waxL: '#bb4326',
    gold: '#a87d2a', goldL: '#d9ab48', goldD: '#6d4d15',
    grey: '#7b6a52', greyL: '#a08c6c', greyD: '#54462f',
    table: '#241811', tableL: '#3a2819', tableD: '#150d08', tableG: '#0d0705',
    brass: '#c79a3c', brassL: '#f2d383', brassD: '#6c4c12',
  };

  const MAP_W = 640, MAP_H = 272;                    // the chart; card sits below
  const PAPER = { x0: 3, y0: 2, x1: 636, y1: 268 };  // the sheet itself
  const IN = { x0: 20, y0: 19, x1: 620, y1: 250 };   // interior (inside the neat line)

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

  // ------------------------------------------------------------- the land --
  // Each isle is a union of lobes; the coastline comes from a three-octave
  // noise-perturbed threshold of that field, so every shore gets headlands,
  // bays, points and a few offshore crumbs.
  const ISLES = [
    {
      name: "MOTHER'S REACH", x: 114, y: 202, rx: 82, ry: 46, seed: 1101, rough: 1.30,
      hills: 13, woods: 11, label: [126, 212], ls: 6,
      spits: [[-0.18, 26, 4.5], [2.5, 18, 3.5], [1.15, 14, 3]],
      lobes: [
        { dx: 52, dy: -22, rx: 40, ry: 24 }, { dx: -54, dy: 4, rx: 30, ry: 26 },
        { dx: 10, dy: 30, rx: 46, ry: 18 }, { dx: -14, dy: -30, rx: 32, ry: 18 },
        { dx: 74, dy: 12, rx: 22, ry: 12, rot: 0.5 },
      ],
    },
    {
      name: 'SALT PIER', x: 246, y: 84, rx: 54, ry: 32, seed: 2207, rough: 1.20,
      hills: 7, woods: 6, label: [264, 62], ls: 5,
      spits: [[3.32, 22, 4], [0.35, 16, 3]],
      lobes: [{ dx: -34, dy: 14, rx: 26, ry: 16 }, { dx: 30, dy: 16, rx: 26, ry: 14 }, { dx: 6, dy: -22, rx: 28, ry: 14 }],
    },
    { name: 'THE SISTERS', x: 298, y: 182, rx: 16, ry: 11, seed: 3301, rough: 1.3, hills: 1, woods: 1, label: [300, 166], ls: 4, lobes: [{ dx: 10, dy: 6, rx: 8, ry: 6 }] },
    { name: '', x: 332, y: 208, rx: 12, ry: 9, seed: 3307, rough: 1.3, hills: 1, woods: 0, lobes: [] },
    { name: '', x: 264, y: 222, rx: 14, ry: 10, seed: 3313, rough: 1.3, hills: 1, woods: 1, lobes: [{ dx: -9, dy: 4, rx: 7, ry: 5 }] },
    {
      name: 'MARROW ISLE', x: 408, y: 176, rx: 52, ry: 36, seed: 4409, rough: 1.25,
      hills: 9, woods: 8, label: [410, 168], ls: 5,
      spits: [[2.62, 20, 4], [-0.55, 16, 3.2]],
      lobes: [{ dx: -32, dy: -14, rx: 26, ry: 18 }, { dx: 30, dy: 14, rx: 26, ry: 16 }, { dx: -6, dy: 26, rx: 30, ry: 12 }],
    },
    {
      name: 'BLACKBONE', x: 470, y: 78, rx: 42, ry: 26, seed: 5501, rough: 1.30,
      hills: 7, woods: 3, label: [462, 72], ls: 5,
      spits: [[0.12, 18, 3.5]],
      lobes: [{ dx: 24, dy: 10, rx: 22, ry: 13 }, { dx: -26, dy: 6, rx: 20, ry: 14 }],
    },
    { name: 'THE FANGS', x: 556, y: 126, rx: 11, ry: 8, seed: 6607, rough: 1.45, hills: 1, woods: 0, label: [562, 144], ls: 4, lobes: [{ dx: 14, dy: 12, rx: 7, ry: 5 }] },
  ];

  // ------------------------------------------------------- destinations ---
  const HOME = { x: 34, y: 240 };
  const DEST = [
    {
      name: 'FISHER VILLAGE', chapter: 'I', kind: 'village', x: 176, y: 218, lab: 'below', threat: 0.22,
      blurb: 'Where they took her. The nets still hang wet on the racks, and every hut on that pier keeps a gun behind the door.',
      foes: ['dinghy', 'netter', 'harpooner'], need: null, note: 'HUTS ON PILES. A SHINGLE BEACH.',
    },
    {
      name: 'SALT PIER CANNERY', chapter: 'II', kind: 'cannery', x: 256, y: 120, lab: 'below', threat: 0.42,
      blurb: 'The fleet larder: rendering vats, sheds up on stilts, and a jetty that tells you what they do here before you see it.',
      foes: ['netter', 'dynaboat', 'jetski'], need: 'FISHER VILLAGE', note: 'FOUL GROUND. THE WATER RUNS RED.',
    },
    {
      name: 'PORT MARROW', chapter: 'III', kind: 'marrow', x: 396, y: 214, lab: 'below', threat: 0.58,
      blurb: 'Every hull in the bay gets patched at Marrow. Break the harbour and the fleet has nowhere left to limp home to.',
      foes: ['speedboat', 'harpooner', 'gunboat'], need: 'SALT PIER CANNERY', note: 'SLIPWAYS. A BOOM ACROSS THE MOUTH.',
    },
    {
      name: 'BLACKBONE STATION', chapter: 'IV', kind: 'blackbone', x: 482, y: 108, lab: 'below', threat: 0.74,
      blurb: 'A flensing deck, a winch built for whales, and the pens where they keep the big ones alive until the buyer comes.',
      foes: ['trawler', 'harpooner', 'gunboat'], need: 'PORT MARROW', note: 'PENS AND A FLENSING DECK.',
    },
    {
      name: 'THE GREY SHOALS', chapter: 'V', kind: 'shoals', x: 548, y: 192, lab: 'below', threat: 0.87, open: true,
      blurb: 'Open water and drift nets out to the horizon. No rocks to hide in, no shore to run for, and the tide against you.',
      foes: ['trawler', 'speedboat', 'netter'], need: 'BLACKBONE STATION', note: 'DRIFT NETS. NO BOTTOM FOUND.',
    },
    {
      name: 'THE DEEP ROADS', chapter: 'VI', kind: 'deep', x: 588, y: 76, lab: 'below', threat: 1, open: true,
      blurb: 'Past the last light on the chart. The Chief runs these roads, and the fleet that took her family runs with him.',
      foes: ['gunboat', 'dynaboat', 'chief'], need: 'THE GREY SHOALS', note: 'UNSURVEYED. THE CHART ENDS HERE.',
    },
  ];

  const FOE_NAME = {
    dinghy: 'DINGHY SKIFFS', netter: 'NET BOATS', harpooner: 'HARPOONERS',
    speedboat: 'SPEEDBOATS', jetski: 'JETSKIS', dynaboat: 'DYNAMITE BOATS',
    trawler: 'TRAWLERS', gunboat: 'GUNBOATS', chief: 'THE CHIEF',
  };

  // shipping lanes: dotted tracks with little chart-ships crawling along them
  const LANES = [
    [[22, 128], [96, 112], [168, 122], [240, 136], [316, 150], [344, 146], [412, 128], [498, 132], [576, 156], [624, 168]],
    [[196, 250], [250, 242], [298, 224], [368, 224], [446, 230], [520, 228], [608, 222]],
    [[300, 28], [352, 54], [402, 94], [446, 124], [498, 156], [548, 176]],
    [[30, 178], [40, 156], [78, 138], [140, 132], [196, 122], [232, 118]],
  ];

  // decorative wrecks (chart symbol: masts standing out of the water)
  const WRECKS = [[262, 198], [150, 140], [336, 100], [448, 148], [516, 250], [74, 152]];

  // sea doodles: kind, x, y, facing
  const DOODLES = [
    { k: 'serpent', x: 40, y: 110, f: 1 },
    { k: 'lugger', x: 186, y: 150, f: -1 },
    { k: 'whale', x: 474, y: 236, f: -1 },
    { k: 'fish', x: 256, y: 166, f: -1 },
    { k: 'kraken', x: 602, y: 152 },
    { k: 'ray', x: 300, y: 242 },
    { k: 'fish', x: 96, y: 178, f: 1 },
    { k: 'fish', x: 520, y: 56, f: -1 },
  ];

  // reef / shoal fields
  const REEFS = [
    { x: 546, y: 202, rx: 52, ry: 32, seed: 91, n: 50, label: '' },
    { x: 216, y: 142, rx: 26, ry: 12, seed: 77, n: 16, label: '' },
    { x: 350, y: 204, rx: 22, ry: 13, seed: 61, n: 14, label: '' },
    { x: 30, y: 128, rx: 16, ry: 13, seed: 53, n: 11, label: '' },
    { x: 468, y: 206, rx: 20, ry: 11, seed: 41, n: 12, label: '' },
  ];

  // rhumb-line nodes (portolan style: every node throws 16 lines to the edges)
  const ROSE = { x: 376, y: 62, r: 28 };
  const RHUMB = [[ROSE.x, ROSE.y], [104, 128], [560, 170], [300, 238]];

  // names of the water itself, set wide the way a chart letters an open sea
  const SEA_NAMES = [
    ['MOTHER DEEP', 96, 136, 6, 3],
    ['THE NARROWS', 232, 196, 5, 2],
    ['BONE CHANNEL', 372, 132, 5, 2],
    ['OPEN SEA', 580, 228, 6, 3],
    ['NO SOUNDINGS', 580, 239, 5, 1],
  ];

  // =========================================================================
  //  LAND — mask, distance fields, relief, and the paper it all sits on
  // =========================================================================
  function buildMask() {
    const W = MAP_W, H = MAP_H, m = new Uint8Array(W * H);
    for (const is of ISLES) {
      const pad = 20;
      const x0 = Math.max(0, Math.floor(is.x - is.rx - pad)), y0 = Math.max(0, Math.floor(is.y - is.ry - pad));
      const x1 = Math.min(W - 1, Math.ceil(is.x + is.rx + pad)), y1 = Math.min(H - 1, Math.ceil(is.y + is.ry + pad));
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const lobes = [{ x: is.x - x0, y: is.y - y0, rx: is.rx, ry: is.ry }];
      for (const L of is.lobes || []) lobes.push({ x: is.x - x0 + L.dx, y: is.y - y0 + L.dy, rx: L.rx, ry: L.ry, rot: L.rot || 0 });
      const f = blobField(w, h, lobes);
      const ox = (is.seed % 89) * 4.3, oy = (is.seed % 47) * 6.1;
      const rough = is.rough === undefined ? 1 : is.rough;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = f[y * w + x]; if (v <= 0) continue;
        // three octaves: bays, headlands, then a fine crenellated edge
        const n = vnoise((x + ox) * 0.055, (y + oy) * 0.055) * 0.50 +
                  vnoise((x + ox) * 0.150, (y + oy) * 0.150) * 0.31 +
                  vnoise((x + ox) * 0.390, (y + oy) * 0.390) * 0.19;
        if (v > 0.085 + (n - 0.5) * 0.36 * rough) m[(y + y0) * W + (x + x0)] = 1;
      }
    }
    // despeckle: drop lonely pixels, fill lonely holes (keeps the nav grid sane)
    const c = m.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += c[i + dy * W + dx];
      if (c[i] && n <= 2) m[i] = 0; else if (!c[i] && n >= 7) m[i] = 1;
    }
    return m;
  }

  // every port gets a ragged little basin bitten out of the coast
  function carve(m, cx, cy, r, seed) {
    for (let y = Math.max(0, cy - r - 3); y <= Math.min(MAP_H - 1, cy + r + 3); y++) {
      for (let x = Math.max(0, cx - r - 3); x <= Math.min(MAP_W - 1, cx + r + 3); x++) {
        const dx = x - cx, dy = (y - cy) * 1.12;
        const rr = r * (0.72 + vnoise(x * 0.26 + seed, y * 0.26 - seed) * 0.62);
        if (dx * dx + dy * dy < rr * rr) m[y * MAP_W + x] = 0;
      }
    }
  }

  // chebyshev distance to the nearest cell equal to `target` (two chamfer passes)
  function distField(m, target) {
    const W = MAP_W, H = MAP_H, N = W * H, MAXD = 60, d = new Uint8Array(N);
    for (let i = 0; i < N; i++) d[i] = m[i] === target ? 0 : MAXD;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let v = d[i]; if (!v) continue;
      if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
      if (y > 0 && d[i - W] + 1 < v) v = d[i - W] + 1;
      if (x > 0 && y > 0 && d[i - W - 1] + 1 < v) v = d[i - W - 1] + 1;
      if (x < W - 1 && y > 0 && d[i - W + 1] + 1 < v) v = d[i - W + 1] + 1;
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let v = d[i]; if (!v) continue;
      if (x < W - 1 && d[i + 1] + 1 < v) v = d[i + 1] + 1;
      if (y < H - 1 && d[i + W] + 1 < v) v = d[i + W] + 1;
      if (x < W - 1 && y < H - 1 && d[i + W + 1] + 1 < v) v = d[i + W + 1] + 1;
      if (x > 0 && y < H - 1 && d[i + W - 1] + 1 < v) v = d[i + W - 1] + 1;
      d[i] = v;
    }
    return d;
  }

  // ---- relief: a real height field so the isles can be shaded, not stippled
  // base rises away from the coast; ridged noise cuts spines and valleys into
  // it, so every island gets a backbone with flanks that catch the light.
  function heightField(m, dIn) {
    const W = MAP_W, H = MAP_H, hg = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!m[i]) continue;
        const dn = Math.min(1, dIn[i] / 15);
        const base = dn * dn * (3 - 2 * dn);
        const r1 = 1 - Math.abs(vnoise(x * 0.030 + 11, y * 0.030 + 5) * 2 - 1);
        const r2 = 1 - Math.abs(vnoise(x * 0.078 + 53, y * 0.078 + 29) * 2 - 1);
        hg[i] = base * (0.30 + 0.74 * r1 * r1 + 0.26 * r2);
      }
    }
    return hg;
  }

  // ------------------------------------------------------------- the sea --
  // Foxed, stained, laid paper tinted by depth: a pale shoal band hugging
  // every coast, then shelf, open water and the abyss, all posterised into
  // four hard steps and dithered by noise so no edge is ever a clean curve.
  function paintSea(ctx, m, dOut) {
    const W = MAP_W, H = MAP_H;
    const band = [P.sea0, P.sea1, P.sea2, P.sea3, P.sea4].map(hexToRgb);
    const stain = hexToRgb(P.stain), stain2 = hexToRgb(P.stain2), spot = hexToRgb(P.foxing);
    const surf = hexToRgb(P.seaL);
    const img = ctx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, p = i * 4;
      const dep = m[i] ? 0 : dOut[i];
      // fine grain that wobbles the band edges by a step
      const n = vnoise(x * 0.055 + 30, y * 0.055 + 11) * 0.62 + hash2(x, y) * 0.38;
      const j = (n - 0.5) * 4.0;
      const dd = dep + j;
      let b = dd < 5 ? 0 : dd < 13 ? 1 : dd < 24 ? 2 : dd < 38 ? 3 : 4;
      let c = band[b];
      // broad tea stains and a wash across the whole sheet, hard edged
      const s = vnoise(x * 0.011 + 77, y * 0.011 + 21);
      if (s > 0.755) c = s > 0.825 ? stain2 : stain;
      // surf: the first fathom off every beach is scrubbed bright
      if (dep >= 1 && dep <= 2 && ((x * 2 + y) % 5) < 3) c = surf;
      // laid lines of the paper + foxing specks
      if (y % 9 === 0 && hash2(x * 3, y) > 0.58) c = stain2;
      if (hash2(x * 13 + 5, y * 7 + 3) > 0.9968) c = spot;
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // depth contours: the level sets of the distance-to-land field, drawn as
  // dotted isobaths the way a surveyor would ink them
  function drawContours(ctx, m, dOut, oc) {
    const W = MAP_W, H = MAP_H;
    const LV = [5, 13, 24, 38];
    for (let y = IN.y0; y <= IN.y1; y++) {
      for (let x = IN.x0; x <= IN.x1; x++) {
        const i = y * W + x;
        if (m[i] || !oc[i]) continue;
        const v = dOut[i];
        for (let k = 0; k < LV.length; k++) {
          if (v !== LV[k]) continue;
          const on = k === 0 ? 3 : 2, per = k === 0 ? 5 : 7;
          if (((x * 2 + y * 3 + k * 4) % per) < on) D1(ctx, k === 0 ? P.inkL : P.faint, x, y);
        }
      }
    }
  }

  // ------------------------------------------------------------ the land --
  function paintLand(m, dIn, dOut, hg) {
    const W = MAP_W, H = MAP_H, c = can(W, H), ctx = c.getContext('2d');
    const ink = hexToRgb(P.ink), ink2 = hexToRgb(P.ink2), inkL = hexToRgb(P.inkL);
    const beach = hexToRgb(P.beach);
    const LIT = P.lit.map(hexToRgb), MID = P.mid.map(hexToRgb), SHD = P.shd.map(hexToRgb);
    const img = ctx.createImageData(W, H), d = img.data;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, p = i * 4;
      if (m[i]) {
        const din = dIn[i];
        let col;
        if (din <= 1) col = ink;                                     // inked coastline
        else if (din === 2) col = beach;                             // a thread of beach
        else {
          const hv = hg[i];
          // slope from the height field; the light comes from the north-west
          const gx = hg[i + 1] - hg[i - 1], gy = hg[i + W] - hg[i - W];
          const lum = -(gx + gy);
          const jit = (hash2(x * 5, y * 3) - 0.5) * 0.045;
          let b = hv < 0.085 ? 0 : hv < 0.215 ? 1 : hv < 0.395 ? 2 : hv < 0.60 ? 3 : 4;
          const ramp = (lum + jit) > 0.012 ? LIT : (lum + jit) < -0.012 ? SHD : MID;
          col = ramp[b];
          // hachures down the shaded flanks: the steeper, the denser
          const steep = Math.max(0, -(lum + jit)) * 26;
          if (steep > 0.55 && hash2(x * 7 + 1, y * 11 + 9) < Math.min(0.40, steep * 0.20)) col = b > 2 ? ink2 : inkL;
          // shore shading, tucked against the coastline
          else if (din <= 5 && hash2(x * 3 + 7, y * 9 + 5) < (6 - din) * 0.075) col = ink2;
          else if (din > 8 && hash2(x * 3 + 7, y * 5 + 1) > 0.990) col = inkL;
        }
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      } else {
        // offshore stipple: a fading dot-screen hugging every shore
        const dout = dOut[i];
        if (dout >= 2 && dout <= 8 && hash2(x * 5 + 3, y * 9 + 13) < (9 - dout) * 0.035) {
          d[p] = inkL[0]; d[p + 1] = inkL[1]; d[p + 2] = inkL[2]; d[p + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return { c, ctx };
  }

  // relief: little inked mounds with hachures down the shaded flank, saved
  // for the true summits now that the land itself is shaded
  function hillGlyph(ctx, cx, by, hw, hh) {
    for (let i = -hw; i <= hw; i++) {
      const u = i / hw;
      const top = Math.round(by - hh * Math.cos(u * Math.PI * 0.5) * (1 - 0.12 * Math.abs(u)));
      D1(ctx, P.ink, cx + i, top);
      if (i > 0 && (i & 1) === 0) for (let y = top + 2; y < by; y++) D1(ctx, P.ink2, cx + i, y);
      if (i < 0 && i % 3 === 0) { D1(ctx, P.sand, cx + i, top + 1); D1(ctx, P.lit[1], cx + i, top + 2); }
    }
    R(ctx, P.ink2, cx - hw, by, hw * 2 + 1, 1);
  }
  function treeGlyph(ctx, x, y) {
    D1(ctx, P.forestD, x, y - 3);
    R(ctx, P.forest, x - 1, y - 2, 3, 1);
    D1(ctx, P.forestD, x - 1, y - 2); D1(ctx, P.forestL, x, y - 2);
    R(ctx, P.forest, x - 1, y - 1, 3, 1);
    D1(ctx, P.forestD, x + 1, y - 1);
    D1(ctx, P.forest, x, y);
    D1(ctx, P.ink, x, y + 1);
    D1(ctx, P.ink2, x + 1, y + 1);
  }

  // a tapering sand spit hanging off a headland, found by marching out from
  // the island's centre until the coast is crossed
  function sandSpit(ctx, m, is, ang, len, wide) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let r = 4, hit = -1;
    for (; r < Math.max(is.rx, is.ry) + 40; r += 1) {
      const x = Math.round(is.x + ca * r), y = Math.round(is.y + sa * r);
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) break;
      if (!m[y * MAP_W + x]) { hit = r; break; }
    }
    if (hit < 0) return;
    const bx = is.x + ca * (hit - 3), by = is.y + sa * (hit - 3);
    const nx = -sa, ny = ca;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const hw = wide * (1 - u) * (1 - u * 0.3);
      const cx = bx + ca * i, cy = by + sa * i;
      const drift = Math.sin(u * 2.6 + is.seed) * len * 0.09;
      for (let k = -Math.ceil(hw); k <= Math.ceil(hw); k++) {
        const x = Math.round(cx + nx * (k + drift)), y = Math.round(cy + ny * (k + drift));
        if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
        const edge = Math.abs(k) >= hw - 0.6;
        if (edge) { if (((x + y) & 1) === 0) D1(ctx, P.ink2, x, y); }
        else D1(ctx, hash2(x * 5, y * 7) > 0.82 ? P.mid[2] : P.sand, x, y);
      }
      if (hw < 0.6) break;
    }
  }

  function dressLand(ctx, m, dIn, hg) {
    // spits first, so hills and woods can still sit on top of the land proper
    for (const is of ISLES) {
      for (const sp of is.spits || []) sandSpit(ctx, m, is, sp[0], sp[1], sp[2]);
    }
    for (const is of ISLES) {
      const rng = new SeededRandom(is.seed * 7 + 13);
      // ---- summits: only where the relief is already high, so the glyph and
      // the shading agree with each other
      const pts = [];
      let tries = 0;
      while (pts.length < (is.hills || 0) && tries++ < 700) {
        const a = rng.range(0, TAU), r = Math.sqrt(rng.next());
        const x = Math.round(is.x + Math.cos(a) * is.rx * r * 0.92);
        const y = Math.round(is.y + Math.sin(a) * is.ry * r * 0.92);
        if (x < 4 || y < 4 || x >= MAP_W - 4 || y >= MAP_H - 4) continue;
        const i = y * MAP_W + x;
        if (!m[i] || dIn[i] < 7 || hg[i] < 0.30) continue;
        let clash = false;
        for (const p of pts) if (dist(p.x, p.y, x, y) < 13) { clash = true; break; }
        if (clash) continue;
        pts.push({ x, y });
        const hw = rng.int(5, 10), hh = rng.int(4, 7);
        hillGlyph(ctx, x, y, hw, hh);
        if (rng.next() < 0.45) hillGlyph(ctx, x + rng.int(-9, 9), y + rng.int(-2, 2), Math.max(4, hw - 3), Math.max(3, hh - 2));
      }
      // ---- woods, thickest in the low ground between the ridges
      for (let w = 0; w < (is.woods || 0); w++) {
        let cxp = 0, cyp = 0, ok = false;
        for (let k = 0; k < 90 && !ok; k++) {
          const a = rng.range(0, TAU), r = Math.sqrt(rng.next());
          cxp = Math.round(is.x + Math.cos(a) * is.rx * r * 0.9);
          cyp = Math.round(is.y + Math.sin(a) * is.ry * r * 0.9);
          const i = cyp * MAP_W + cxp;
          ok = cxp > 4 && cyp > 4 && cxp < MAP_W - 4 && cyp < MAP_H - 4 && m[i] && dIn[i] > 5;
        }
        if (!ok) continue;
        const n = rng.int(6, 14);
        for (let k = 0; k < n; k++) {
          const x = cxp + rng.int(-9, 9), y = cyp + rng.int(-6, 6);
          if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) continue;
          const i = y * MAP_W + x;
          if (!m[i] || dIn[i] < 4) continue;
          treeGlyph(ctx, x, y);
        }
      }
    }
    // ---- cliff hachures wherever the sea bites a north or west face
    for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
      const i = y * MAP_W + x;
      if (!m[i] || dIn[i] !== 1) continue;
      const seaN = !m[i - MAP_W], seaW = !m[i - 1];
      if (!seaN && !seaW) continue;
      if (hash2(x * 17 + 3, y * 13 + 7) > 0.36) continue;
      const len = 2 + (hash2(x, y) > 0.6 ? 1 : 0);
      for (let k = 1; k <= len; k++) {
        const nx = x + (seaW ? k : 0), ny = y + (seaN ? k : 0);
        if (m[ny * MAP_W + nx]) D1(ctx, P.ink2, nx, ny);
      }
    }
  }

  // =========================================================================
  //  CHART FURNITURE
  // =========================================================================
  // reef / shoal: a dotted limit with rock crosses and awash stars inside
  function drawReef(ctx, rf, m) {
    const rng = new SeededRandom(rf.seed * 31 + 7);
    const steps = Math.max(24, Math.round((rf.rx + rf.ry) * 1.6));
    for (let i = 0; i < steps; i++) {
      if (i % 3 === 2) continue;
      const a = i / steps * TAU;
      const w = 1 + vnoise(Math.cos(a) * 3 + rf.seed, Math.sin(a) * 3) * 0.22;
      const x = Math.round(rf.x + Math.cos(a) * rf.rx * w), y = Math.round(rf.y + Math.sin(a) * rf.ry * w);
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) continue;
      D1(ctx, P.ink2, x, y);
    }
    for (let i = 0; i < rf.n; i++) {
      const a = rng.range(0, TAU), r = Math.sqrt(rng.next()) * 0.86;
      const x = Math.round(rf.x + Math.cos(a) * rf.rx * r), y = Math.round(rf.y + Math.sin(a) * rf.ry * r);
      if (x < 3 || y < 3 || x >= MAP_W - 3 || y >= MAP_H - 3) continue;
      if (m[y * MAP_W + x]) continue;
      const k = rng.next();
      if (k < 0.42) { D1(ctx, P.ink, x, y); D1(ctx, P.ink, x - 1, y); D1(ctx, P.ink, x + 1, y); D1(ctx, P.ink, x, y - 1); D1(ctx, P.ink, x, y + 1); }
      else if (k < 0.72) { D1(ctx, P.ink, x - 1, y - 1); D1(ctx, P.ink, x + 1, y - 1); D1(ctx, P.ink, x, y); D1(ctx, P.ink, x - 1, y + 1); D1(ctx, P.ink, x + 1, y + 1); }
      else { D1(ctx, P.ink2, x, y); D1(ctx, P.ink2, x + 1, y + 1); }
    }
  }

  // classic wreck symbol: masts and yardarms standing out of a sunken hull
  function drawWreck(ctx, x, y) {
    for (const dx of [-4, 0, 4]) {
      R(ctx, P.ink, x + dx, y - 6, 1, 6);
      R(ctx, P.ink, x + dx - 1, y - 5, 3, 1);
      if (dx === 0) R(ctx, P.ink, x + dx - 2, y - 3, 5, 1);
    }
    R(ctx, P.ink, x - 6, y, 13, 1);
    R(ctx, P.ink2, x - 5, y + 1, 11, 1);
    R(ctx, P.ink2, x - 3, y + 2, 7, 1);
    D1(ctx, P.ink2, x - 1, y + 3); D1(ctx, P.ink2, x + 1, y + 3);
    D1(ctx, P.inkL, x - 7, y); D1(ctx, P.inkL, x + 7, y);
  }

  // a cut-out halo of clean paper, dilated from a drawing's own ink, so a
  // figure reads over water, stipple and rhumb lines alike.  The outermost
  // ring is checkered, which keeps the cut from looking like a sticker.
  function haloed(src, col, r, soft) {
    const w = src.width, h = src.height, rr = r + (soft ? 1 : 0);
    const c = can(w, h), cx = c.getContext('2d');
    const d = src.getContext('2d').getImageData(0, 0, w, h).data;
    const img = cx.createImageData(w, h), o = img.data;
    const rgb = hexToRgb(col);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3]) continue;
      let best = 99;
      for (let dy = -rr; dy <= rr; dy++) {
        const ny = y + dy; if (ny < 0 || ny >= h) continue;
        for (let dx = -rr; dx <= rr; dx++) {
          const nx = x + dx; if (nx < 0 || nx >= w) continue;
          if (!d[(ny * w + nx) * 4 + 3]) continue;
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          if (m < best) best = m;
        }
      }
      if (best > rr) continue;
      if (best > r && ((x + y) & 1)) continue;
      o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2]; o[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    cx.drawImage(src, 0, 0);
    return c;
  }
  // draw a figure into its own plate, cut it out, and lay it on the chart
  function vignette(dst, fn, x, y, bw, bh, f) {
    const c = can(bw, bh), cx = c.getContext('2d');
    fn(cx, bw >> 1, bh >> 1, f);
    dst.drawImage(haloed(c, P.sea0, 1, false), x - (bw >> 1), y - (bh >> 1));
  }

  // sea doodles ------------------------------------------------------------
  // a proper engraved sea serpent: three coils, a reared head, a fluked tail
  const SERP_HEAD = [
    '.....kkkkkk....',
    '...kkwwwwwwkkkk',
    '..kwwwwwwwwwwwk',
    '.kwwkkwwwwwkkkk',
    '.kwwwwwwwwkk...',
    '.kwwwwwwwkk....',
    '..kwwwwwkk.....',
    '...kkkkkk......',
  ];
  function arcOver(ctx, col, cx, cy, r, sag) {
    for (let a = Math.PI + 0.06; a <= TAU - 0.06; a += 0.03) {
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 0.9);
      D1(ctx, col, x, y);
      if (sag) D1(ctx, col, x, y + 1);
    }
  }
  function drawSerpent(ctx, x, y, f) {
    x -= f * 22; y += 8;
    for (let c = 0; c < 3; c++) {
      const cx = x + f * (c * 19), r = 9 - c;
      arcOver(ctx, P.ink, cx, y, r, true);
      for (let i = -r + 2; i <= r - 2; i += 2) {
        const h = Math.round(Math.sqrt(Math.max(0, r * r - i * i)) * 0.9);
        for (let k = -h + 2; k < 0; k += 3) D1(ctx, P.ink2, cx + i, y + k);
      }
      for (let i = -4; i <= 4; i += 4) {
        const h = Math.round(Math.sqrt(Math.max(0, r * r - i * i)) * 0.9);
        D1(ctx, P.ink, cx + i, y - h - 1); D1(ctx, P.ink, cx + i + f, y - h - 2);
      }
    }
    for (let i = -14; i < 56; i += 3) { D1(ctx, P.ink2, x + f * i, y + 2); D1(ctx, P.ink2, x + f * (i + 1), y + 2); }
    const nx = x + f * 48;
    for (let k = 0; k < 13; k++) {
      D1(ctx, P.ink, nx - f * 3, y - k); D1(ctx, P.ink, nx + f * 3, y - k);
      D1(ctx, P.sand, nx - f * 2, y - k); D1(ctx, P.sand, nx - f, y - k); D1(ctx, P.sand, nx, y - k);
      D1(ctx, P.sand, nx + f, y - k); D1(ctx, P.sand, nx + f * 2, y - k);
      if (k % 3 === 0) { D1(ctx, P.ink2, nx - f, y - k); D1(ctx, P.ink2, nx + f, y - k); }
    }
    const hx = nx - f * 7, hy = y - 21;
    stamp(ctx, f > 0 ? SERP_HEAD : SERP_HEAD.map(r2 => r2.split('').reverse().join('')), hx, hy, { k: P.ink, w: P.sand });
    const tipx = f > 0 ? hx + 15 : hx - 1;
    D1(ctx, P.ink, tipx, hy + 4); D1(ctx, P.red, tipx + f, hy + 3); D1(ctx, P.red, tipx + f, hy + 5);
    D1(ctx, P.ink, hx + (f > 0 ? 5 : 9), hy - 2); D1(ctx, P.ink, hx + (f > 0 ? 7 : 7), hy - 3);
    D1(ctx, P.ink, hx + (f > 0 ? 4 : 10), hy - 1);
    for (let k = 0; k < 7; k++) { D1(ctx, P.ink, x - f * (9 + k), y - 1 - k); D1(ctx, P.ink, x - f * (9 + k), y + 1 + Math.round(k * 0.7)); }
    D1(ctx, P.ink, x - f * 16, y - 8); D1(ctx, P.ink, x - f * 16, y + 6);
  }
  function drawWhale(ctx, x, y, f) {
    y += 6;
    const W = 32;
    const fat = u => u < 0.78 ? Math.pow(u / 0.78, 0.45) : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.78) / 0.23, 2)));
    let lastT = 0, lastB = 0;
    for (let i = 0; i < W; i++) {
      const u = i / (W - 1), k = fat(u);
      const t = Math.round(9 * k), b2 = Math.round(6.5 * k);
      const cx = x + f * Math.round(i - W * 0.55);
      for (let q = -t + 1; q < b2; q++) D1(ctx, P.sand, cx, y + q);
      D1(ctx, P.ink, cx, y - t); D1(ctx, P.ink, cx, y + b2);
      for (let q = Math.min(t, lastT); q < Math.max(t, lastT); q++) D1(ctx, P.ink, cx, y - q);
      for (let q = Math.min(b2, lastB); q < Math.max(b2, lastB); q++) D1(ctx, P.ink, cx, y + q);
      lastT = t; lastB = b2;
      if (i % 2 === 0) for (let q = -t + 2; q < b2 - 1; q += 3) D1(ctx, P.ink2, cx, y + q);
      if (u > 0.4 && u < 0.92 && i % 3 === 0) D1(ctx, P.ink2, cx, y + b2 - 1);
    }
    const hx = x + f * Math.round(W * 0.45);
    for (let i = 0; i < 12; i++) D1(ctx, P.ink, hx + f * i, y + 2 + Math.round(i * 0.18));
    D1(ctx, P.ink, hx + f * 7, y - 2); D1(ctx, P.ink, hx + f * 8, y - 2);
    for (let k = 0; k < 6; k++) { D1(ctx, P.ink, hx - f * (2 + k), y + 5 + (k >> 1)); D1(ctx, P.ink, hx - f * (2 + k), y + 7 + (k >> 1)); }
    const tx = x - f * Math.round(W * 0.56);
    tri(ctx, P.ink, tx, y, tx - f * 9, y - 9, tx - f * 5, y - 1);
    tri(ctx, P.ink, tx, y, tx - f * 9, y + 8, tx - f * 5, y + 1);
    for (let k = 2; k < 8; k++) { D1(ctx, P.sand, tx - f * k, y - k + 1); D1(ctx, P.sand, tx - f * k, y + k - 1); }
    for (let i = 0; i < 14; i++) {
      const sy = y - 11 - i, lean = Math.round(i * 0.5);
      D1(ctx, P.ink, hx - f * (2 + lean), sy); D1(ctx, P.ink, hx - f * (3 + lean), sy);
      if (i > 3) { D1(ctx, P.ink, hx + f * (lean - 2), sy); D1(ctx, P.ink, hx + f * (lean - 1), sy); }
      if (i > 8) { D1(ctx, P.ink2, hx - f * (5 + lean), sy + 1); D1(ctx, P.ink2, hx + f * (lean + 1), sy + 1); }
    }
    D1(ctx, P.ink, hx - f * 9, y - 24); D1(ctx, P.ink, hx - f * 11, y - 22); D1(ctx, P.ink, hx + f * 6, y - 23);
  }
  function drawKraken(ctx, x, y) {
    y += 4;
    for (let a = 0; a < 5; a++) {
      const dir = a - 2;
      let px2 = x + dir * 5, py = y + 7;
      const curl = 0.30 + a * 0.07;
      for (let i = 0; i < 18; i++) {
        py -= 1;
        px2 += Math.sin(i * curl + a * 1.7) * 1.15 + dir * 0.28;
        const ix = Math.round(px2), iy = Math.round(py);
        D1(ctx, P.ink, ix, iy);
        if (i < 11) D1(ctx, P.ink, ix + (dir >= 0 ? 1 : -1), iy);
        if (i % 4 === 1 && i < 13) D1(ctx, P.sand, ix + (dir >= 0 ? 1 : -1), iy);
      }
      D1(ctx, P.ink, Math.round(px2) + (dir >= 0 ? 1 : -1), Math.round(py) + 1);
    }
    for (let i = -13; i < 14; i += 3) { D1(ctx, P.ink2, x + i, y + 8); D1(ctx, P.ink2, x + i + 1, y + 8); }
    for (let i = -9; i < 10; i += 4) D1(ctx, P.inkL, x + i, y + 10);
  }
  function drawRay(ctx, x, y) {
    x -= 6;
    for (let i = -10; i <= 10; i++) {
      const u = Math.abs(i) / 10;
      const h = Math.round(5 * (1 - u * u));
      for (let k = -h + 1; k < h; k++) D1(ctx, P.sand, x + i, y + k);
      D1(ctx, P.ink, x + i, y - h); D1(ctx, P.ink, x + i, y + h);
      if ((i & 1) === 0) for (let k = -h + 1; k < h; k += 2) D1(ctx, P.ink2, x + i, y + k);
    }
    for (let i = 1; i < 12; i++) D1(ctx, P.ink, x + 10 + i, y + (i >> 2));
    D1(ctx, P.ink, x - 4, y - 3); D1(ctx, P.ink, x + 4, y - 3);
  }
  // a little shoal of fish, engraved side-on
  function drawFish(ctx, x, y, f) {
    x -= f * 4;
    for (let k = 0; k < 3; k++) {
      const fx = x + f * (k % 2 ? 9 : 0), fy = y + (k * 5) - 5;
      for (let i = -4; i <= 4; i++) {
        const h = Math.round(2.4 * Math.sqrt(Math.max(0, 1 - (i / 4.6) * (i / 4.6))));
        D1(ctx, P.ink, fx + f * i, fy - h); D1(ctx, P.ink, fx + f * i, fy + h);
      }
      D1(ctx, P.ink, fx - f * 5, fy - 2); D1(ctx, P.ink, fx - f * 6, fy - 3);
      D1(ctx, P.ink, fx - f * 5, fy + 2); D1(ctx, P.ink, fx - f * 6, fy + 3);
      D1(ctx, P.ink, fx - f * 5, fy); D1(ctx, P.ink, fx + f * 3, fy - 1);
    }
  }
  // a two-masted lugger heeled over under full sail — the chart's ship vignette
  function drawLugger(ctx, x, y, f) {
    y += 8;
    const H = P.ink, L = P.sand;
    // hull: a sheer curve with a transom and a bowsprit
    for (let i = -14; i <= 14; i++) {
      const u = i / 14;
      const top = Math.round(-2 - 2.2 * (1 - u * u) + (u > 0.4 ? (u - 0.4) * -6 : 0));
      const bot = Math.round(3.4 * Math.sqrt(Math.max(0, 1 - u * u * 0.94)));
      for (let k = top; k <= bot; k++) D1(ctx, k === top || k === bot ? H : L, x + f * i, y + k);
      if (i % 3 === 0) D1(ctx, P.ink2, x + f * i, y + Math.max(top + 1, bot - 1));
    }
    R(ctx, H, x - f * 14, y - 4, 1, 4);
    for (let i = 0; i < 7; i++) D1(ctx, H, x + f * (14 + i), y - 5 - Math.round(i * 0.5));   // bowsprit
    // two masts with square-ish lug sails, bellied to leeward
    const masts = [[-5, 26], [7, 21]];
    for (const [mx, mh] of masts) {
      R(ctx, H, x + f * mx, y - mh, 1, mh - 2);
      // yard
      R(ctx, H, x + f * (mx - 6), y - mh + 2, 13, 1);
      // sail: a bellied quadrilateral, drawn as scanlines so the edge is hard
      for (let k = 0; k < mh - 8; k++) {
        const u = k / (mh - 9);
        const belly = Math.round(Math.sin(u * Math.PI) * 3.2);
        const x0 = mx - 5 + Math.round(u * 1.5), x1 = mx + 5 + belly;
        for (let i = x0; i <= x1; i++) {
          const px = x + f * i, py = y - mh + 3 + k;
          D1(ctx, (i === x0 || i === x1) ? H : L, px, py);
        }
        if (k % 4 === 2) for (let i = x0 + 1; i < x1; i += 2) D1(ctx, P.ink2, x + f * i, y - mh + 3 + k);
      }
      D1(ctx, H, x + f * mx, y - mh - 1);
      D1(ctx, P.red, x + f * (mx + 1), y - mh - 1); D1(ctx, P.red, x + f * (mx + 2), y - mh - 1);
    }
    // a wake trailing astern
    for (let i = 2; i < 22; i += 3) {
      D1(ctx, P.ink2, x - f * (15 + i), y + 4); D1(ctx, P.ink2, x - f * (16 + i), y + 4);
      if (i > 8) D1(ctx, P.inkL, x - f * (15 + i), y + 6);
    }
    for (let i = -20; i < 20; i += 5) { D1(ctx, P.inkL, x + i, y + 7); D1(ctx, P.inkL, x + i + 1, y + 7); }
  }

  // =========================================================================
  //  PLACE GLYPHS — a little inked elevation of what is actually there, the
  //  way an engraver would put a town on a chart.  Each is baked twice: once
  //  in live ink, once faded for a port that is still shut to you.
  // =========================================================================
  const GW = 62, GH = 42, GAX = 31, GAY = 30;    // glyph canvas + anchor

  function bldg(ctx, C, x, y, w, h, pitch) {
    R(ctx, C.p, x, y - h, w, h);
    box(ctx, C.k, x, y - h, w, h);
    const rh = pitch === undefined ? Math.max(3, w >> 1) : pitch;
    for (let i = 0; i < rh; i++) {
      const hw = Math.round((w / 2 + 2) * (1 - i / rh));
      R(ctx, C.k, x + (w >> 1) - hw, y - h - 1 - i, hw * 2 + 1, 1);
    }
    for (let wx = x + 2; wx < x + w - 1; wx += 3) if (h > 4) D1(ctx, C.k2, wx, y - h + 2);
  }
  function piles(ctx, C, y, xs, depth) {
    for (const px of xs) { R(ctx, C.k, px, y, 1, depth); D1(ctx, C.k2, px + 1, y + depth - 1); }
  }
  function ripples(ctx, C, x0, x1, y, rows) {
    for (let r = 0; r < rows; r++) {
      for (let i = x0 + ((r & 1) ? 2 : 0); i < x1; i += 5) { D1(ctx, C.k2, i, y + r * 2); D1(ctx, C.k2, i + 1, y + r * 2); }
    }
  }
  function smoke(ctx, C, x, y, n, drift) {
    for (let i = 0; i < n; i++) {
      const sx = Math.round(x + drift * i + Math.sin(i * 0.8) * 1.6), sy = y - i;
      D1(ctx, i < n * 0.6 ? C.k : C.k2, sx, sy);
      if (i > 2 && (i & 1)) D1(ctx, C.kL, sx + 1, sy);
      if (i > 5) D1(ctx, C.kL, sx - 1, sy - 1);
    }
  }
  function mesh(ctx, col, x0, y0, x1, y1, step) {
    for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y++) if (((x + y) % step) === 0) D1(ctx, col, x, y);
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x++) if (((x - y) % step) === 0) D1(ctx, col, x, y);
  }

  // I. FISHER VILLAGE — huts on piles, drying racks, a beached skiff
  function gVillage(ctx, C) {
    const gy = GAY;
    ripples(ctx, C, 3, 59, gy + 2, 3);
    piles(ctx, C, gy - 1, [10, 15, 21, 27, 33, 39], 6);
    R(ctx, C.p, 8, gy - 3, 34, 2); R(ctx, C.k, 8, gy - 4, 34, 1); R(ctx, C.k, 8, gy - 1, 34, 1);
    bldg(ctx, C, 10, gy - 4, 10, 6);
    bldg(ctx, C, 22, gy - 4, 13, 8);
    bldg(ctx, C, 36, gy - 4, 8, 5);
    smoke(ctx, C, 28, gy - 20, 9, 0.45);
    // drying rack with a net slung across it
    R(ctx, C.k, 46, gy - 16, 1, 16); R(ctx, C.k, 57, gy - 14, 1, 14);
    for (let i = 46; i <= 57; i++) D1(ctx, C.k, i, gy - 16 + Math.round((i - 46) * 0.18));
    mesh(ctx, C.k2, 47, gy - 13, 56, gy - 3, 3);
    for (let i = 47; i < 57; i += 3) D1(ctx, C.k, i, gy - 2);
    // a skiff hauled up on the beach
    for (let i = -5; i <= 5; i++) {
      const b = Math.round(2.2 * Math.sqrt(Math.max(0, 1 - (i / 5.6) * (i / 5.6))));
      D1(ctx, C.k, 6 + i, gy + 4 + b); D1(ctx, C.k, 6 + i, gy + 2);
    }
    D1(ctx, C.k, 6, gy); D1(ctx, C.k, 6, gy + 1);
  }

  // II. SALT PIER CANNERY — stilt sheds, rendering vats, a smoking stack
  function gCannery(ctx, C) {
    const gy = GAY;
    ripples(ctx, C, 3, 59, gy + 2, 3);
    piles(ctx, C, gy - 1, [8, 14, 20, 26, 32, 38, 44], 6);
    R(ctx, C.p, 6, gy - 3, 42, 2); R(ctx, C.k, 6, gy - 4, 42, 1); R(ctx, C.k, 6, gy - 1, 42, 1);
    // the long rendering shed
    bldg(ctx, C, 16, gy - 4, 26, 9, 5);
    // the stack
    R(ctx, C.p, 9, gy - 26, 4, 22); box(ctx, C.k, 9, gy - 26, 4, 22);
    R(ctx, C.k, 8, gy - 27, 6, 2);
    for (let i = 0; i < 4; i++) R(ctx, C.k2, 10, gy - 22 + i * 5, 2, 1);
    smoke(ctx, C, 11, gy - 28, 12, 0.9);
    // rendering vats, two on the deck and one behind
    for (const [vx, vy, vr] of [[47, gy - 7, 4], [55, gy - 7, 4], [51, gy - 14, 4]]) {
      disc(ctx, C.p, vx, vy, vr); ring(ctx, C.k, vx, vy, vr, 0);
      R(ctx, C.k, vx - vr, vy - vr + 1, vr * 2 + 1, 1);
      D1(ctx, C.k2, vx - 1, vy); D1(ctx, C.k2, vx + 1, vy + 1);
    }
    // a crane arm over the water, with a hook
    R(ctx, C.k, 6, gy - 20, 1, 16);
    for (let i = 0; i < 9; i++) D1(ctx, C.k, 6 - i, gy - 20 - Math.round(i * 0.34));
    for (let k = 0; k < 6; k++) D1(ctx, C.k2, 0, gy - 22 + k);
    D1(ctx, C.k, 0, gy - 16); D1(ctx, C.k, 1, gy - 15);
  }

  // III. PORT MARROW — slipways, a hull in its cradle, a gantry
  function gMarrow(ctx, C) {
    const gy = GAY;
    ripples(ctx, C, 3, 59, gy + 3, 3);
    // the quay
    R(ctx, C.p, 4, gy - 2, 54, 3); R(ctx, C.k, 4, gy - 3, 54, 1); R(ctx, C.k, 4, gy + 1, 54, 1);
    for (let i = 6; i < 58; i += 6) D1(ctx, C.k2, i, gy - 1);
    // slipway rails running down into the water
    for (let i = 0; i < 14; i++) { D1(ctx, C.k2, 8 + i, gy + 2 + Math.round(i * 0.35)); D1(ctx, C.k2, 8 + i, gy + 5 + Math.round(i * 0.35)); }
    // a hull up in its cradle, ribs bare
    const hx = 26, hy = gy - 5;
    for (let i = -13; i <= 12; i++) {
      const u = i / 13;
      const b = Math.round(5 * Math.sqrt(Math.max(0, 1 - u * u * 0.92)));
      D1(ctx, C.k, hx + i, hy + b);
      if (i % 3 === 0) for (let k = 0; k < b; k++) D1(ctx, C.k2, hx + i, hy + k);
    }
    R(ctx, C.k, hx - 13, hy - 7, 1, 8); R(ctx, C.k, hx + 12, hy - 5, 1, 6);
    R(ctx, C.k, hx - 13, hy - 7, 26, 1);
    for (const cx of [hx - 8, hx, hx + 7]) { R(ctx, C.k2, cx, hy + 4, 1, 4); D1(ctx, C.k2, cx - 1, hy + 7); D1(ctx, C.k2, cx + 1, hy + 7); }
    // the gantry, hook swinging over the hull
    R(ctx, C.k, 48, gy - 26, 1, 23); R(ctx, C.k, 52, gy - 22, 1, 19);
    for (let i = 48; i <= 52; i++) D1(ctx, C.k, i, gy - 22 - Math.round((52 - i) * 0.9));
    for (let i = 0; i < 16; i++) D1(ctx, C.k, 48 - i, gy - 26 + Math.round(i * 0.18));
    for (let k = 0; k < 7; k++) D1(ctx, C.k2, 33, gy - 23 + k);
    D1(ctx, C.k, 33, gy - 16); D1(ctx, C.k, 32, gy - 15); D1(ctx, C.k, 34, gy - 15);
    // a warehouse behind the quay
    bldg(ctx, C, 4, gy - 3, 13, 8, 4);
  }

  // IV. BLACKBONE STATION — a flensing gantry with a carcass hung in it
  function gBlackbone(ctx, C) {
    const gy = GAY;
    ripples(ctx, C, 3, 59, gy + 3, 3);
    R(ctx, C.p, 4, gy - 2, 46, 3); R(ctx, C.k, 4, gy - 3, 46, 1); R(ctx, C.k, 4, gy + 1, 46, 1);
    // the flensing ramp, sloping into the water
    for (let i = 0; i < 16; i++) {
      const rx = 12 + i, ry = gy + 2 + Math.round(i * 0.45);
      D1(ctx, C.k, rx, ry); if (i % 3 === 0) D1(ctx, C.k2, rx, ry + 1);
    }
    // the A-frame
    for (let i = 0; i <= 22; i++) {
      D1(ctx, C.k, Math.round(14 + i * 0.52), gy - 3 - i);
      D1(ctx, C.k, Math.round(40 - i * 0.50), gy - 3 - i);
    }
    R(ctx, C.k, 24, gy - 25, 6, 1); R(ctx, C.k2, 24, gy - 21, 6, 1);
    disc(ctx, C.p, 27, gy - 22, 3); ring(ctx, C.k, 27, gy - 22, 3, 0);
    D1(ctx, C.k, 27, gy - 22);
    // the carcass: a spine slung from the winch, ribs hanging off it
    for (let k = 0; k < 5; k++) D1(ctx, C.k, 27, gy - 19 + k);
    for (let i = 0; i <= 22; i++) {
      const sx = 17 + i, sy = gy - 14 + Math.round(Math.sin(i * 0.14) * 2);
      D1(ctx, C.k, sx, sy);
      if (i % 4 === 2) {
        for (let r = 1; r <= 7; r++) D1(ctx, C.k, sx + Math.round(r * 0.34), sy + r);
        D1(ctx, C.k2, sx + 3, sy + 8);
      }
    }
    // the skull end of it
    R(ctx, C.k, 39, gy - 15, 5, 2); D1(ctx, C.k, 44, gy - 14); D1(ctx, C.k, 45, gy - 13);
    D1(ctx, C.p, 41, gy - 14);
    // the stack, black smoke
    R(ctx, C.p, 50, gy - 22, 4, 19); box(ctx, C.k, 50, gy - 22, 4, 19);
    R(ctx, C.k, 49, gy - 23, 6, 2);
    smoke(ctx, C, 52, gy - 24, 11, 0.55);
    // the holding pens: stakes and netting out in the water
    for (const sx of [6, 11, 16, 21]) { R(ctx, C.k, sx, gy + 4, 1, 7); D1(ctx, C.k2, sx, gy + 11); }
    mesh(ctx, C.k2, 6, gy + 5, 21, gy + 10, 3);
    R(ctx, C.k, 6, gy + 4, 16, 1);
  }

  // V. THE GREY SHOALS — nothing but stakes, floats and miles of drift net
  function gShoals(ctx, C) {
    const gy = GAY;
    ripples(ctx, C, 2, 60, gy + 4, 4);
    // two stakes with tattered flags
    for (const [sx, sh] of [[8, 22], [53, 19]]) {
      R(ctx, C.k, sx, gy - sh, 1, sh + 4);
      R(ctx, C.k, sx + 1, gy - sh, 5, 3); D1(ctx, C.p, sx + 3, gy - sh + 1);
      D1(ctx, C.k2, sx + 6, gy - sh + 1); D1(ctx, C.k2, sx + 7, gy - sh + 2);
    }
    // the head rope, sagging between them, floats strung along it
    const rope = [];
    for (let i = 8; i <= 53; i++) {
      const u = (i - 8) / 45;
      const y = Math.round(gy - 22 + Math.sin(u * Math.PI) * 5 + u * 3);
      rope.push(y); D1(ctx, C.k, i, y);
    }
    for (let i = 10; i < 53; i += 6) {
      const y = rope[i - 8];
      disc(ctx, C.p, i, y - 2, 2); ring(ctx, C.k, i, y - 2, 2, 0);
    }
    // the net hanging below it, thinning as it goes down
    for (let i = 9; i < 53; i++) {
      const y0 = rope[i - 8] + 1;
      for (let y = y0; y < gy + 6; y++) {
        const fade = (y - y0) / 20;
        if (hash2(i * 3, y * 5) < fade * 0.55) continue;
        if (((i + y) % 4) === 0 || ((i - y) % 4) === 0) D1(ctx, fade > 0.55 ? C.kL : C.k2, i, y);
      }
    }
    // something caught in it, and a gull that came too close
    for (let i = -4; i <= 4; i++) {
      const h = Math.round(2.2 * Math.sqrt(Math.max(0, 1 - (i / 4.6) * (i / 4.6))));
      D1(ctx, C.k, 24 + i, gy - 6 - h); D1(ctx, C.k, 24 + i, gy - 6 + h);
    }
    D1(ctx, C.k, 19, gy - 8); D1(ctx, C.k, 18, gy - 9); D1(ctx, C.k, 19, gy - 4); D1(ctx, C.k, 18, gy - 3);
    for (let i = 0; i < 5; i++) { D1(ctx, C.k, 36 + i, gy - 16 - i); D1(ctx, C.k, 42 + i, gy - 20 + i); }
    D1(ctx, C.k, 41, gy - 20); D1(ctx, C.k, 41, gy - 19);
  }

  // VI. THE DEEP ROADS — the survey simply stops, and something waits in it
  function gDeep(ctx, C) {
    const gy = GAY;
    // the void: the paper goes dark at the edge of the world, and the edge of
    // it frays instead of cutting
    for (let x = 18; x < GW; x++) {
      const n = vnoise(x * 0.17, 3.7) * 0.55 + vnoise(x * 0.52, 8.1) * 0.45;
      const edge = gy - 29 + n * 11 + (GW - x) * 0.40;
      for (let y = Math.round(edge) - 7; y < gy + 1; y++) {
        const t = (y - edge) / 7;
        if (t < 0 && hash2(x * 5 + 1, y * 7 + 3) > 0.30 + (t + 1) * 0.66) continue;
        if (t < 0 && hash2(x * 5 + 1, y * 7 + 3) < 0.04) continue;
        D1(ctx, t < -0.45 ? C.k : C.void, x, y);
      }
    }
    // ink running out of the bottom of it, down the sheet
    for (const dx of [23, 31, 42, 53]) {
      const len = 3 + Math.round(hash2(dx, 17) * 6);
      for (let k = 0; k < len; k++) D1(ctx, C.void, dx, gy + 1 + k);
      D1(ctx, C.void, dx - 1, gy + len); D1(ctx, C.void, dx + 1, gy + len);
    }
    // a bow coming out of the dark, harpoon gun on the forecastle
    const bx = 41, by = gy - 6;
    for (let i = 0; i <= 17; i++) {
      const w = Math.round(1 + i * 0.66);
      D1(ctx, C.pale, bx - w, by - i); D1(ctx, C.pale, bx + w, by - i);
      if (i > 12) R(ctx, C.pale, bx - w, by - i, w * 2 + 1, 1);
      if ((i & 3) === 1) { D1(ctx, C.pale, bx - w + 2, by - i); D1(ctx, C.pale, bx + w - 2, by - i); }
    }
    R(ctx, C.pale, bx - 12, by - 18, 25, 1);
    R(ctx, C.void, bx - 11, by - 17, 23, 1);
    // wheelhouse and the gun
    R(ctx, C.void, bx - 4, by - 24, 9, 6); box(ctx, C.pale, bx - 4, by - 24, 9, 6);
    D1(ctx, C.pale, bx - 2, by - 22); D1(ctx, C.pale, bx + 1, by - 22); D1(ctx, C.pale, bx + 3, by - 22);
    R(ctx, C.pale, bx - 1, by - 29, 2, 5);
    for (let i = 0; i < 10; i++) D1(ctx, C.pale, bx + 2 + i, by - 27 - Math.round(i * 0.42));
    D1(ctx, C.pale, bx + 11, by - 32); D1(ctx, C.pale, bx + 12, by - 31); D1(ctx, C.pale, bx + 12, by - 33);
    // her bow wave
    for (let i = -10; i < 12; i += 3) { D1(ctx, C.pale, bx + i, by + 2); D1(ctx, C.pale, bx + i + 1, by + 2); }
  }

  const PLACE_FN = { village: gVillage, cannery: gCannery, marrow: gMarrow, blackbone: gBlackbone, shoals: gShoals, deep: gDeep };
  const INK_ON = { k: P.ink, k2: P.ink2, kL: P.inkL, p: P.sand, r: P.red, void: '#2a1d0e', pale: P.faint };
  const INK_OFF = { k: '#4b4230', k2: '#6e6247', kL: '#8f8365', p: '#d3c8a8', r: '#6e6247', void: '#241c10', pale: '#8f8365' };

  function buildPlaceGlyphs() {
    const out = {};
    for (const key in PLACE_FN) {
      const on = can(GW, GH), off = can(GW, GH);
      PLACE_FN[key](on.getContext('2d'), INK_ON);
      PLACE_FN[key](off.getContext('2d'), INK_OFF);
      out[key] = { on: haloed(on, P.beach, 1, true), off: haloed(off, '#d9cfb2', 1, true), ax: GAX, ay: GAY };
    }
    return out;
  }

  // rhumb lines, graticule and the border ----------------------------------
  // how far a ray from (x,y) can run before it leaves the interior
  function rayLen(x, y, ca, sa) {
    let t = 1e9;
    if (ca > 1e-6) t = Math.min(t, (IN.x1 - x) / ca); else if (ca < -1e-6) t = Math.min(t, (IN.x0 - x) / ca);
    if (sa > 1e-6) t = Math.min(t, (IN.y1 - y) / sa); else if (sa < -1e-6) t = Math.min(t, (IN.y0 - y) / sa);
    return Math.max(0, Math.min(t, 900));
  }
  function drawRhumbs(ctx) {
    for (let n = 0; n < RHUMB.length; n++) {
      const node = RHUMB[n];
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU + 0.0001, ca = Math.cos(a), sa = Math.sin(a);
        const L = rayLen(node[0], node[1], ca, sa);
        const col = (i % 4 === 0) ? P.faint : P.hair;
        line(ctx, col, node[0], node[1], node[0] + ca * L, node[1] + sa * L, 2, 3, 0);
      }
      ring(ctx, P.faint, node[0], node[1], 4, 0);
      D1(ctx, P.ink2, node[0], node[1]);
    }
  }
  function degRing(ctx, col, x, y) { box(ctx, col, x, y, 3, 3); D1(ctx, P.sea0, x + 1, y + 1); }
  function drawGraticule(ctx) {
    const MER = [84, 186, 288, 390, 492, 594], PAR = [46, 112, 178, 244];
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    for (const x of MER) line(ctx, P.hair, x, IN.y0, x, IN.y1, 1, 5, 0);
    for (const y of PAR) line(ctx, P.hair, IN.x0, y, IN.x1, y, 1, 5, 0);
    for (const x of MER) for (const y of PAR) {
      R(ctx, P.faint, x - 2, y, 5, 1); R(ctx, P.faint, x, y - 2, 1, 5);
    }
    ctx.restore();
    for (let i = 0; i < MER.length; i++) {
      const lab = String(64 - i);
      const w = mText(lab, 5);
      txt(ctx, lab, MER[i] - w / 2 - 3, IN.y0 + 3, 5, { color: P.ink2, align: 'left' });
      degRing(ctx, P.ink2, MER[i] - w / 2 + w - 2, IN.y0 + 2);
      txt(ctx, 'W', MER[i] - w / 2 + w + 2, IN.y0 + 3, 5, { color: P.ink2 });
    }
    for (let i = 0; i < PAR.length; i++) {
      const lab = String(19 - i);
      txt(ctx, lab, IN.x0 + 3, PAR[i] - 3, 5, { color: P.ink2 });
      degRing(ctx, P.ink2, IN.x0 + 3 + mText(lab, 5) + 1, PAR[i] - 4);
      txt(ctx, 'N', IN.x0 + 3 + mText(lab, 5) + 6, PAR[i] - 3, 5, { color: P.ink2 });
    }
  }

  // the neat line: a double rule, a graduated piano-key band, corner knots
  function drawBorder(ctx) {
    const x0 = 7, y0 = 6, x1 = 632, y1 = 262;
    box(ctx, P.ink, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    box(ctx, P.ink, x0 + 1, y0 + 1, x1 - x0 - 1, y1 - y0 - 1);
    const bx0 = x0 + 2, by0 = y0 + 2, bx1 = x1 - 2, by1 = y1 - 2;
    R(ctx, P.seaL, bx0, by0, bx1 - bx0 + 1, 10); R(ctx, P.seaL, bx0, by1 - 9, bx1 - bx0 + 1, 10);
    R(ctx, P.seaL, bx0, by0, 10, by1 - by0 + 1); R(ctx, P.seaL, bx1 - 9, by0, 10, by1 - by0 + 1);
    for (let x = bx0; x <= bx1; x++) {
      const k = Math.floor((x - bx0) / 8) & 1;
      if (k) { R(ctx, P.ink, x, by0 + 3, 1, 5); R(ctx, P.ink, x, by1 - 7, 1, 5); }
      if ((x - bx0) % 4 === 0) { D1(ctx, P.ink2, x, by0 + 2); D1(ctx, P.ink2, x, by1 - 2); }
    }
    for (let y = by0; y <= by1; y++) {
      const k = Math.floor((y - by0) / 8) & 1;
      if (k) { R(ctx, P.ink, bx0 + 3, y, 5, 1); R(ctx, P.ink, bx1 - 7, y, 5, 1); }
      if ((y - by0) % 4 === 0) { D1(ctx, P.ink2, bx0 + 2, y); D1(ctx, P.ink2, bx1 - 2, y); }
    }
    box(ctx, P.ink, bx0 + 9, by0 + 9, bx1 - bx0 - 17, by1 - by0 - 17);
    box(ctx, P.ink2, bx0 + 11, by0 + 11, bx1 - bx0 - 21, by1 - by0 - 21);
    for (const [cx, cy, sx, sy] of [[bx0 + 2, by0 + 2, 1, 1], [bx1 - 2, by0 + 2, -1, 1], [bx0 + 2, by1 - 2, 1, -1], [bx1 - 2, by1 - 2, -1, -1]]) {
      R(ctx, P.ink, cx, cy, 8 * sx, 8 * sy);
      R(ctx, P.seaL, cx + 2 * sx, cy + 2 * sy, 4 * sx, 4 * sy);
      R(ctx, P.ink, cx + 3 * sx, cy + 3 * sy, 2 * sx, 2 * sy);
      for (let i = 0; i < 5; i++) { D1(ctx, P.ink, cx + (9 + i) * sx, cy + (1 + (i & 1)) * sy); D1(ctx, P.ink, cx + (1 + (i & 1)) * sx, cy + (9 + i) * sy); }
    }
  }

  // compass rose -----------------------------------------------------------
  function drawRose(ctx, cx, cy, r) {
    // the medallion the rose is struck on: a shade darker than the sea, so
    // the pale half of every point reads against it
    for (let y = -r - 8; y <= r + 8; y++) for (let x = -r - 8; x <= r + 8; x++) {
      const d2 = x * x + y * y, lim = (r + 7) * (r + 7);
      if (d2 > lim) continue;
      if (d2 > lim * 0.86 && hash2((cx + x) * 3 + 1, (cy + y) * 7 + 5) < 0.4) continue;
      D1(ctx, d2 > (r + 5) * (r + 5) ? P.stain2 : P.stain, cx + x, cy + y);
    }
    ring(ctx, P.ink, cx, cy, r + 6, 0);
    ring(ctx, P.ink, cx, cy, r + 5, 0);
    ring(ctx, P.ink, cx, cy, r, 0);
    ring(ctx, P.ink2, cx, cy, r - 4, 0);
    // 32 ticks around the limb, every 4th long, every 8th heavy
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * TAU - Math.PI / 2;
      const r0 = (i % 4 === 0) ? r - 4 : r - 1;
      for (let s = r0; s <= r + 4; s++) D1(ctx, (i % 8 === 0) ? P.ink : P.ink2, Math.round(cx + Math.cos(a) * s), Math.round(cy + Math.sin(a) * s));
    }
    // and 64 fine graduations on the outer limb
    for (let i = 0; i < 64; i++) {
      if (i % 2 === 0) continue;
      const a = i / 64 * TAU - Math.PI / 2;
      D1(ctx, P.ink2, Math.round(cx + Math.cos(a) * (r + 3)), Math.round(cy + Math.sin(a) * (r + 3)));
    }
    const star = (n, len, wide, rot, lit, drk) => {
      for (let i = 0; i < n; i++) {
        const a = rot + i / n * TAU;
        const tx = cx + Math.cos(a) * len, ty = cy + Math.sin(a) * len;
        const b = a + Math.PI / 2, c2 = a - Math.PI / 2;
        tri(ctx, lit, cx, cy, tx, ty, cx + Math.cos(b) * wide, cy + Math.sin(b) * wide);
        tri(ctx, drk, cx, cy, tx, ty, cx + Math.cos(c2) * wide, cy + Math.sin(c2) * wide);
        line(ctx, P.ink, cx + Math.cos(b) * wide, cy + Math.sin(b) * wide, tx, ty);
        line(ctx, P.ink, cx + Math.cos(c2) * wide, cy + Math.sin(c2) * wide, tx, ty);
        line(ctx, P.ink, cx + Math.cos(b) * wide, cy + Math.sin(b) * wide, cx, cy);
        line(ctx, P.ink, cx + Math.cos(c2) * wide, cy + Math.sin(c2) * wide, cx, cy);
      }
    };
    star(16, r - 11, 2.0, -Math.PI / 2 + Math.PI / 16, P.sand, P.ink2);   // by-points
    star(8, r - 6, 3.6, -Math.PI / 2 + Math.PI / 8, P.sand, P.ink);       // intercardinal
    star(4, r - 1, 5.4, -Math.PI / 2, P.sand, P.ink);                     // cardinal N/S
    star(4, r - 1, 4.8, 0, P.sand, P.ink);                                // cardinal E/W
    disc(ctx, P.sand, cx, cy, 5); ring(ctx, P.ink, cx, cy, 5, 0); ring(ctx, P.ink, cx, cy, 4, 0);
    R(ctx, P.red, cx - 1, cy - 1, 3, 3); D1(ctx, P.sand, cx, cy);
    // fleur-de-lys over north
    const ny = cy - r - 4;
    R(ctx, P.ink, cx, ny - 10, 1, 10);
    D1(ctx, P.ink, cx - 1, ny - 8); D1(ctx, P.ink, cx + 1, ny - 8);
    D1(ctx, P.ink, cx - 2, ny - 6); D1(ctx, P.ink, cx + 2, ny - 6);
    D1(ctx, P.ink, cx - 3, ny - 5); D1(ctx, P.ink, cx + 3, ny - 5);
    R(ctx, P.ink, cx - 4, ny - 4, 9, 1);
    D1(ctx, P.ink, cx - 3, ny - 3); D1(ctx, P.ink, cx + 3, ny - 3);
    D1(ctx, P.ink, cx - 2, ny - 2); D1(ctx, P.ink, cx + 2, ny - 2);
    R(ctx, P.red, cx, ny - 7, 1, 2);
    // an eastern cross, the way the old roses mark the Levant
    const ex = cx + r + 7;
    R(ctx, P.ink, ex, cy - 5, 1, 9); R(ctx, P.ink, ex - 2, cy - 2, 5, 1);
    // cardinal letters
    txt(ctx, 'S', cx, cy + r + 8, 6, { color: P.ink, align: 'center', outline: P.sea0 });
    txt(ctx, 'W', cx - r - 11, cy - 3, 6, { color: P.ink, align: 'center', outline: P.sea0 });
    txt(ctx, 'NE', cx + r - 2, cy - r + 2, 5, { color: P.ink2, align: 'center', outline: P.stain });
    txt(ctx, 'SW', cx - r + 2, cy + r - 6, 5, { color: P.ink2, align: 'center', outline: P.stain });
  }

  // scale bar --------------------------------------------------------------
  // drawn bare; the cartouche supplies the plate it is engraved on
  function drawScale(ctx, x, y) {
    const seg = 17, n = 5, w = seg * n;
    txt(ctx, 'SEA LEAGUES', x + w / 2, y, 5, { color: P.ink2, align: 'center', tracking: 1 });
    for (let i = 0; i <= n; i++) {
      if (i % 2 === 0) txt(ctx, String(i * 2), x + i * seg, y + 7, 5, { color: P.ink, align: 'center' });
    }
    const by = y + 14;
    box(ctx, P.ink, x, by, w, 6);
    for (let i = 0; i < n; i++) R(ctx, (i & 1) ? P.sand : P.ink, x + i * seg + 1, by + 1, seg - (i === n - 1 ? 2 : 0), 4);
    R(ctx, P.ink, x, by, w, 1); R(ctx, P.ink, x, by + 5, w, 1);
    for (let q = 1; q < 4; q++) R(ctx, P.ink, x + Math.round(seg * q / 4), by + 1, 1, 4);
    for (let i = 0; i <= n; i++) R(ctx, P.ink, x + i * seg - (i === n ? 1 : 0), by - 3, 1, 3);
    return w;
  }

  // title cartouche --------------------------------------------------------
  function drawCartouche(ctx, x, y, w, h) {
    // a shadow, so the plaque sits proud of the sheet
    for (let i = 0; i < 2; i++) R(ctx, P.stain2, x + 6 + i, y + h - 2 + i, w - 10, 1);
    R(ctx, P.stain2, x + w - 4, y + 8, 2, h - 12);
    // the curled ends of the scroll, behind the plaque
    for (let i = 0; i < 5; i++) {
      R(ctx, P.beach, x + 3 - i, y + 9 + i * 2, 3, h - 22 - i * 4);
      R(ctx, P.ink, x + 2 - i, y + 9 + i * 2, 1, h - 22 - i * 4);
      R(ctx, P.ink2, x + 3 - i, y + 9 + i * 2, 1, 1);
      R(ctx, P.beach, x + w - 6 + i, y + 9 + i * 2, 3, h - 22 - i * 4);
      R(ctx, P.ink, x + w - 3 + i, y + 9 + i * 2, 1, h - 22 - i * 4);
    }
    // the plaque
    R(ctx, P.sand, x + 4, y + 2, w - 8, h - 4);
    box(ctx, P.ink, x + 4, y + 2, w - 8, h - 4);
    box(ctx, P.ink2, x + 6, y + 4, w - 12, h - 8);
    R(ctx, P.beach, x + 5, y + h - 4, w - 10, 1);
    // corner volutes
    for (const [sx, sy, fx, fy] of [[x + 8, y + 6, 1, 1], [x + w - 9, y + 6, -1, 1], [x + 8, y + h - 7, 1, -1], [x + w - 9, y + h - 7, -1, -1]]) {
      D1(ctx, P.ink, sx, sy); D1(ctx, P.ink, sx + fx, sy + fy); D1(ctx, P.ink, sx + fx * 2, sy);
      D1(ctx, P.ink, sx, sy + fy * 2); D1(ctx, P.ink2, sx + fx, sy);
      D1(ctx, P.ink, sx + fx * 4, sy + fy); D1(ctx, P.ink2, sx + fx * 5, sy + fy * 2);
    }
    let ty = y + 8;
    txt(ctx, 'THE BAY OF', x + w / 2, ty, 13, { color: P.ink, align: 'center', tracking: 2 }); ty += 16;
    txt(ctx, 'BROKEN NETS', x + w / 2, ty, 13, { color: P.ink, align: 'center', tracking: 2 }); ty += 16;
    // a hairline rule with a lozenge
    R(ctx, P.ink2, x + 16, ty, w - 32, 1);
    R(ctx, P.sand, x + w / 2 - 5, ty - 2, 11, 5);
    for (let i = 0; i < 3; i++) {
      const hw = i === 1 ? 2 : i === 0 ? 1 : 1;
      R(ctx, P.ink, x + w / 2 - hw, ty - 1 + i, hw * 2 + 1, 1);
    }
    D1(ctx, P.sand, x + w / 2, ty);
    R(ctx, P.ink2, x + w / 2 - 8, ty, 2, 1); R(ctx, P.ink2, x + w / 2 + 7, ty, 2, 1);
    ty += 5;
    txt(ctx, 'SOUNDINGS IN FATHOMS', x + w / 2, ty, 5, { color: P.ink2, align: 'center', tracking: 1 }); ty += 8;
    txt(ctx, 'DRAWN BY THE OTTER, WHO', x + w / 2, ty, 5, { color: P.ink2, align: 'center' }); ty += 7;
    txt(ctx, 'HAS NEVER BEEN WRONG YET', x + w / 2, ty, 5, { color: P.ink2, align: 'center' }); ty += 10;
    // a second rule, then the scale engraved into the foot of the plaque
    R(ctx, P.ink2, x + 22, ty, w - 44, 1);
    for (const dx of [-1, 0, 1]) D1(ctx, P.ink, x + w / 2 + dx, ty);
    D1(ctx, P.ink, x + w / 2, ty - 1); D1(ctx, P.ink, x + w / 2, ty + 1);
    ty += 5;
    const sw = drawScale(ctx, Math.round(x + w / 2 - 43), ty);
    void sw;
  }

  // a little scrolled note pinned anywhere on the sheet
  function drawNote(ctx, cx, y, lines, sizes) {
    let w = 0;
    for (let i = 0; i < lines.length; i++) w = Math.max(w, mText(lines[i], sizes[i]));
    w += 16;
    const h = 8 + lines.reduce((a, _, i) => a + sizes[i] + 4, 0);
    const x = Math.round(cx - w / 2);
    R(ctx, P.sea0, x, y, w, h);
    box(ctx, P.ink2, x, y, w, h);
    R(ctx, P.ink2, x + 3, y + 1, w - 6, 1); R(ctx, P.ink2, x + 3, y + h - 2, w - 6, 1);
    for (const [cxx, cyy, fx, fy] of [[x + 2, y + 2, 1, 1], [x + w - 3, y + 2, -1, 1], [x + 2, y + h - 3, 1, -1], [x + w - 3, y + h - 3, -1, -1]]) {
      D1(ctx, P.ink, cxx, cyy); D1(ctx, P.ink, cxx + fx, cyy); D1(ctx, P.ink, cxx, cyy + fy);
    }
    let ty = y + 4;
    for (let i = 0; i < lines.length; i++) {
      txt(ctx, lines[i], cx, ty, sizes[i], { color: i === 0 ? P.ink : P.ink2, align: 'center', tracking: i === 0 ? 2 : 1 });
      ty += sizes[i] + 4;
    }
  }

  // ships on the lanes -----------------------------------------------------
  const SHIP_ROWS = [
    '.....k.....',
    '....kkk....',
    '...kwwwk...',
    '...kwwwk...',
    '..kwwwwwk..',
    '..kwwwwwk..',
    '.....k.....',
    'kkkkkkkkkkk',
    '.kkkkkkkkk.',
    '..kkkkkkk..',
  ];

  function laneLen(pts) {
    let L = 0;
    for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    return L;
  }
  function alongPath(pts, s) {
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = dist(a[0], a[1], b[0], b[1]);
      if (acc + L >= s || i === pts.length - 2) {
        const u = clamp((s - acc) / (L || 1), 0, 1);
        return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, dx: (b[0] - a[0]) / (L || 1), dy: (b[1] - a[1]) / (L || 1) };
      }
      acc += L;
    }
    return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 };
  }

  // =========================================================================
  //  SPRITES — built once
  // =========================================================================
  const S = {};
  function buildSprites() {
    if (S.ready) return; S.ready = true;
    const pal = { k: P.ink, w: P.sand };
    S.ship = makeSprite(SHIP_ROWS, { ax: 5, ay: 7, pal: pal });
    // the pair, as a chart token: manatee with the otter riding, facing right
    S.token = makeSprite([
      '.............k....',
      '.............krr..',
      '.............krr..',
      '...........kkk....',
      '..........kBBBk...',
      '..........kBwBk...',
      '..kk...kkkkBBkkkk.',
      '.kGGk.kGGGGGGGGGGk',
      'kGGGGkkGLLLLLLLGGk',
      'kGGGGGGGLLLLLLGGkk',
      '.kGGGGkGGGGGGGGGk.',
      '..kggkkgggggggkk..',
      '...kk..kkkkkkkk...',
    ], {
      ax: 9, ay: 8,
      pal: { k: '#2b2118', G: '#95918a', L: '#b3afa7', g: '#6b675f', B: '#c07434', w: '#f0d8b4', r: '#b8402a' },
    });
    // padlock for the locked ports
    S.lock = makeSprite([
      '.kkk.',
      'k...k',
      'k...k',
      'kkkkk',
      'kdgdk',
      'kdddk',
      'kkkkk',
    ], { ax: 2, ay: 3, pal: { k: P.ink, d: P.grey, g: P.greyL } });
    // anchor, marking where the player is now
    S.anchor = makeSprite([
      '.kkk.',
      '.k.k.',
      '.kkk.',
      'kkkkk',
      '..k..',
      '..k..',
      'k.k.k',
      'kkkkk',
      '.kkk.',
    ], { ax: 2, ay: 4, pal: { k: P.ink } });
    S.place = buildPlaceGlyphs();
  }

  // =========================================================================
  //  ROUTES — a sea road from the lagoon to every port, bent around the land
  // =========================================================================
  function clearance(dOut, mask, x, y) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 1 || yi < 1 || xi >= MAP_W - 1 || yi >= MAP_H - 1) return 0;
    if (mask[yi * MAP_W + xi]) return 0;
    return dOut[yi * MAP_W + xi];
  }
  // water connectivity: everything the open sea can actually reach
  function oceanFill(m) {
    const W = MAP_W, H = MAP_H, o = new Uint8Array(W * H);
    const st = new Int32Array(W * H); let sp = 0;
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = y * W + x; if (m[i] || o[i]) return;
      o[i] = 1; st[sp++] = i;
    };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    while (sp > 0) {
      const i = st[--sp], x = i % W, y = (i / W) | 0;
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    return o;
  }

  // pull a port onto a real piece of coast: open water, a few fathoms off the
  // shore, as close to where the chart wants the label as possible
  function snapCoast(m, dOut, oc, x0, y0, maxR) {
    let best = null, bs = 1e9;
    for (let dy = -maxR; dy <= maxR; dy++) for (let dx = -maxR; dx <= maxR; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < IN.x0 + 6 || y < IN.y0 + 6 || x > IN.x1 - 6 || y > IN.y1 - 6) continue;
      const i = y * MAP_W + x;
      if (m[i] || !oc[i]) continue;
      const c = dOut[i];
      if (c < 3) continue;
      const s = Math.abs(c - 5) * 1.7 + Math.hypot(dx, dy) * 0.55;
      if (s < bs) { bs = s; best = [x, y]; }
    }
    return best || [x0, y0];
  }

  // ---- sea roads: A* over a 4px water grid, then pulled straight and smoothed
  const CELL = 4;
  function navGrid(m, dOut) {
    const NGW = Math.ceil(MAP_W / CELL), NGH = Math.ceil(MAP_H / CELL);
    const clear = new Uint8Array(NGW * NGH);
    for (let gy = 0; gy < NGH; gy++) for (let gx = 0; gx < NGW; gx++) {
      let mn = 99;
      for (let y = gy * CELL; y < Math.min(MAP_H, gy * CELL + CELL); y++) {
        for (let x = gx * CELL; x < Math.min(MAP_W, gx * CELL + CELL); x++) {
          const i = y * MAP_W + x;
          if (m[i] || x < IN.x0 + 2 || y < IN.y0 + 2 || x > IN.x1 - 2 || y > IN.y1 - 2) { mn = 0; y = 1e9; break; }
          if (dOut[i] < mn) mn = dOut[i];
        }
      }
      clear[gy * NGW + gx] = mn > 30 ? 30 : mn;
    }
    return { GW: NGW, GH: NGH, clear };
  }
  function astar(nav, sx, sy, tx, ty) {
    const NGW = nav.GW, NGH = nav.GH, N = NGW * NGH, clear = nav.clear;
    const g = new Float32Array(N).fill(Infinity), f = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], hpos = new Int32Array(N).fill(-1);
    const up = (k) => {
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[heap[p]] <= f[heap[k]]) break;
        const t = heap[p]; heap[p] = heap[k]; heap[k] = t; hpos[heap[p]] = p; hpos[heap[k]] = k; k = p;
      }
    };
    const push = (i) => { heap.push(i); hpos[i] = heap.length - 1; up(heap.length - 1); };
    const down = (k) => {
      for (;;) {
        const l = k * 2 + 1, r = l + 1; let m2 = k;
        if (l < heap.length && f[heap[l]] < f[heap[m2]]) m2 = l;
        if (r < heap.length && f[heap[r]] < f[heap[m2]]) m2 = r;
        if (m2 === k) break;
        const t = heap[m2]; heap[m2] = heap[k]; heap[k] = t; hpos[heap[m2]] = m2; hpos[heap[k]] = k; k = m2;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop(); hpos[top] = -1;
      if (heap.length) { heap[0] = last; hpos[last] = 0; down(0); }
      return top;
    };
    const s = sy * NGW + sx, t = ty * NGW + tx;
    const h = (i) => { const x = i % NGW, y = (i / NGW) | 0; return Math.hypot(x - tx, y - ty); };
    g[s] = 0; f[s] = h(s); push(s);
    while (heap.length) {
      const cur = pop();
      if (cur === t) break;
      closed[cur] = 1;
      const cx = cur % NGW, cy = (cur / NGW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= NGW || ny >= NGH) continue;
        const ni = ny * NGW + nx;
        if (closed[ni]) continue;
        const cl = clear[ni];
        if (cl < 2) continue;
        if (dx && dy && (clear[cy * NGW + nx] < 2 || clear[ny * NGW + cx] < 2)) continue;
        const step = (dx && dy ? 1.414 : 1) * (1 + Math.max(0, 8 - cl) * 0.5);
        const ng = g[cur] + step;
        if (ng < g[ni]) {
          g[ni] = ng; f[ni] = ng + h(ni) * 1.02; from[ni] = cur;
          if (hpos[ni] < 0) push(ni); else up(hpos[ni]);
        }
      }
    }
    if (from[t] < 0 && t !== s) return null;
    const out = [];
    for (let i = t; i >= 0; i = from[i]) { out.push([(i % NGW) * CELL + CELL / 2, ((i / NGW) | 0) * CELL + CELL / 2]); if (i === s) break; }
    out.reverse();
    return out;
  }
  function seaLOS(m, dOut, ax, ay, bx, by, want) {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 1.5));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ax + (bx - ax) * i / n), y = Math.round(ay + (by - ay) * i / n);
      if (x < IN.x0 + 2 || y < IN.y0 + 2 || x > IN.x1 - 2 || y > IN.y1 - 2) return false;
      const k = y * MAP_W + x;
      if (m[k] || dOut[k] < want) return false;
    }
    return true;
  }
  // A plotted course, not a drawn line: straight legs between waypoints, each
  // one with its own bearing and distance, the way a navigator lays it off.
  function buildRoute(m, dOut, nav, from, to) {
    const sx = clamp(Math.round(from.x / CELL), 0, nav.GW - 1), sy = clamp(Math.round(from.y / CELL), 0, nav.GH - 1);
    const tx = clamp(Math.round(to.x / CELL), 0, nav.GW - 1), ty = clamp(Math.round(to.y / CELL), 0, nav.GH - 1);
    let pts = astar(nav, sx, sy, tx, ty);
    if (!pts || pts.length < 2) pts = [[from.x, from.y], [to.x, to.y]];
    pts[0] = [from.x, from.y]; pts[pts.length - 1] = [to.x, to.y];
    // string-pull: drop every point the track can see past
    for (let want = 4; want >= 2; want--) {
      const out = [pts[0]];
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        for (; j > i + 1; j--) if (seaLOS(m, dOut, pts[i][0], pts[i][1], pts[j][0], pts[j][1], want)) break;
        out.push(pts[j]); i = j;
      }
      pts = out;
      if (pts.length > 2) break;
    }
    // round every corner off with a short arc, so the track looks laid with a
    // ruler and then faired in, rather than snapped
    const legs = pts.map(p => [Math.round(p[0]), Math.round(p[1])]);
    const res = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = dist(a[0], a[1], b[0], b[1]);
      const n = Math.max(1, Math.round(L / 5));
      for (let k = 0; k < n; k++) res.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    res.push(pts[pts.length - 1]);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < res.length - 1; i++) {
        const a = res[i - 1], b = res[i + 1], p = res[i];
        const sxp = (a[0] + b[0] + p[0] * 2) / 4, syp = (a[1] + b[1] + p[1] * 2) / 4;
        const xi = Math.round(sxp), yi = Math.round(syp);
        if (xi < 2 || yi < 2 || xi >= MAP_W - 2 || yi >= MAP_H - 2) continue;
        const k = yi * MAP_W + xi;
        if (!m[k] && dOut[k] >= 2) res[i] = [sxp, syp];
      }
    }
    // leg book: where each waypoint falls along the smoothed track, and the
    // bearing and distance of the leg that leaves it
    const book = [];
    let acc = 0, li = 1;
    for (let i = 0; i < res.length - 1 && li < legs.length; i++) {
      const seg = dist(res[i][0], res[i][1], res[i + 1][0], res[i + 1][1]);
      if (dist(res[i][0], res[i][1], legs[li][0], legs[li][1]) < 4.5) { book.push({ s: acc, x: Math.round(res[i][0]), y: Math.round(res[i][1]) }); li++; }
      acc += seg;
    }
    const total = laneLen(res);
    for (let i = 0; i < book.length; i++) {
      const nxt = i + 1 < book.length ? book[i + 1] : { s: total, x: res[res.length - 1][0], y: res[res.length - 1][1] };
      const ang = Math.atan2(nxt.y - book[i].y, nxt.x - book[i].x);
      book[i].brg = ((Math.round(ang * 180 / Math.PI) + 90) % 360 + 360) % 360;
      book[i].len = nxt.s - book[i].s;
    }
    return { pts: res, len: total, book: book.filter(b => b.len > 26) };
  }

  // =========================================================================
  //  THE CHART — one offscreen canvas, painted once and blitted every frame
  // =========================================================================
  // the sheet is torn all round; these are the ragged margins, in pixels
  function tearTop(i) { return Math.round(vnoise(i * 0.24, 3.1) * 3.4 + vnoise(i * 0.9, 7.7) * 1.6); }
  function tearBot(i) { return Math.round(vnoise(i * 0.21, 41.3) * 3.6 + vnoise(i * 0.8, 17.2) * 1.4); }
  function tearLft(i) { return Math.round(vnoise(i * 0.26, 61.9) * 3.2 + vnoise(i * 1.1, 29.4) * 1.5); }
  function tearRgt(i) { return Math.round(vnoise(i * 0.23, 83.5) * 3.2 + vnoise(i * 1.0, 37.8) * 1.5); }

  function paintTable(ctx) {
    const base = hexToRgb(P.table), lo = hexToRgb(P.tableD), hi = hexToRgb(P.tableL), ink = hexToRgb(P.tableG);
    const img = ctx.createImageData(640, 360), d = img.data;
    for (let y = 0; y < 360; y++) {
      const plank = (y % 27), grainY = (y * 0.11) | 0;
      for (let x = 0; x < 640; x++) {
        const p = (y * 640 + x) * 4;
        const n = hash2(x * 3 + 1, y * 7);
        const g = vnoise(x * 0.10, grainY * 0.9);
        let c = base;
        if (n > 0.93 || g > 0.74) c = hi;
        else if (n < 0.07 || g < 0.26) c = lo;
        if (plank === 0) c = ink; else if (plank === 1) c = hi;
        d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // a brass tack, holding a corner of the sheet to the table
  function drawTack(ctx, x, y) {
    disc(ctx, P.tableG, x + 1, y + 1, 4);
    disc(ctx, P.brassD, x, y, 4);
    disc(ctx, P.brass, x, y, 3);
    disc(ctx, P.brassL, x - 1, y - 1, 1);
    D1(ctx, P.brassL, x, y - 2); D1(ctx, P.brassD, x + 1, y + 2);
    ring(ctx, P.tableG, x, y, 4, 0);
  }

  function buildChart(self) {
    const out = can(640, 360), octx = out.getContext('2d');
    paintTable(octx);
    // the shadow the sheet casts on the table: only the strip the sheet
    // itself will not cover once it is laid down
    for (let y = PAPER.y0 + 3; y <= PAPER.y1 + 4; y++) {
      const inner = y <= PAPER.y1 - 1;
      for (let x = PAPER.x0 + 3; x <= PAPER.x1 + 4; x++) {
        if (inner && x <= PAPER.x1 - 7) { x = PAPER.x1 - 7; continue; }
        if (hash2(x * 5, y * 3) < 0.12) continue;
        D1(octx, hash2(x, y) > 0.7 ? P.tableD : P.tableG, x, y);
      }
    }

    // ---- paper, land and everything inked on it
    const chart = can(MAP_W, MAP_H), cx = chart.getContext('2d');
    const mask = buildMask();
    let oc = oceanFill(mask);
    let dOut0 = distField(mask, 1);
    // put every port on a piece of coast the sea can actually reach
    const snapHome = snapCoast(mask, dOut0, oc, HOME.x, HOME.y, 26);
    HOME.x = snapHome[0]; HOME.y = snapHome[1];
    for (const d of DEST) {
      if (d.open) continue;                       // shoals and open sea stay put
      const p = snapCoast(mask, dOut0, oc, d.x, d.y, 24);
      d.x = p[0]; d.y = p[1];
    }
    // then bite a small basin out of the shore behind each one
    carve(mask, HOME.x, HOME.y, 6, 3.1);
    for (const d of DEST) if (!d.open) carve(mask, d.x, d.y, 5, d.x * 0.01 + 1.7);
    const dIn = distField(mask, 0), dOut = distField(mask, 1);
    oc = oceanFill(mask);
    const hgt = heightField(mask, dIn);

    paintSea(cx, mask, dOut);
    drawRhumbs(cx);
    drawGraticule(cx);
    drawContours(cx, mask, dOut, oc);

    const land = paintLand(mask, dIn, dOut, hgt);
    dressLand(land.ctx, mask, dIn, hgt);
    cx.drawImage(land.c, 0, 0);

    // ---- reefs and soundings
    for (const rf of REEFS) drawReef(cx, rf, mask);

    // the places, and the patch of paper scrubbed clear behind each drawing
    const keepOut = [];
    for (const d of DEST) keepOut.push({ x: d.x, y: d.y - 12, rx: 34, ry: 28 });
    keepOut.push({ x: HOME.x + 14, y: HOME.y, rx: 42, ry: 18 });
    keepOut.push({ x: ROSE.x, y: ROSE.y, rx: ROSE.r + 18, ry: ROSE.r + 20 });
    keepOut.push({ x: 109, y: 66, rx: 101, ry: 60 });      // cartouche
    for (const sn of SEA_NAMES) keepOut.push({ x: sn[1], y: sn[2] + 2, rx: mText(sn[0], sn[3]) / 2 + sn[4] * 3 + 6, ry: 8 });
    for (const is of ISLES) if (is.name && is.label) keepOut.push({ x: is.label[0], y: is.label[1] + 2, rx: mText(is.name, is.ls || 5) / 2 + (is.ls || 5) + 6, ry: 8 });
    keepOut.push({ x: 580, y: 234, rx: 44, ry: 14 });      // the open-sea note
    for (const w of WRECKS) keepOut.push({ x: w[0], y: w[1], rx: 13, ry: 11 });
    for (const dd of DOODLES) {
      const rx = dd.k === 'serpent' ? 62 : dd.k === 'whale' ? 28 : dd.k === 'lugger' ? 32 : 18;
      const ry = dd.k === 'serpent' ? 32 : dd.k === 'whale' ? 28 : dd.k === 'lugger' ? 26 : 16;
      const ox = dd.k === 'serpent' ? (dd.f || 1) * 22 : 0;
      keepOut.push({ x: dd.x + ox, y: dd.y, rx: rx, ry: ry });
    }

    // soundings, set out on a jittered lattice so they read as a survey
    // rather than as litter, and deepened as the bottom falls away
    const rng = new SeededRandom(9137);
    for (let gy = IN.y0 + 12; gy < IN.y1 - 8; gy += 24) {
      for (let gx = IN.x0 + 14; gx < IN.x1 - 12; gx += 30) {
        const x = Math.round(gx + rng.range(-8, 8)), y = Math.round(gy + rng.range(-7, 7));
        if (rng.next() < 0.09) continue;
        const cl = clearance(dOut, mask, x, y);
        if (cl < 4) continue;
        let clash = false;
        for (const k of keepOut) if (Math.abs(x - k.x) < k.rx && Math.abs(y - k.y) < k.ry) { clash = true; break; }
        if (clash) continue;
        const v = Math.max(2, Math.round(cl * 1.15 + vnoise(x * 0.04, y * 0.04) * 11));
        txt(cx, String(v), x, y, 5, { color: cl > 22 ? P.ink2 : P.inkL, align: 'center' });
      }
    }
    for (const w of WRECKS) drawWreck(cx, w[0], w[1]);
    for (const d of DOODLES) {
      const f = d.f || 1;
      if (d.k === 'serpent') vignette(cx, drawSerpent, d.x + f * 22, d.y - 8, 140, 76, f);
      else if (d.k === 'whale') vignette(cx, drawWhale, d.x, d.y - 6, 74, 76, f);
      else if (d.k === 'kraken') vignette(cx, drawKraken, d.x, d.y - 4, 44, 44, f);
      else if (d.k === 'ray') vignette(cx, drawRay, d.x + 6, d.y, 52, 26, f);
      else if (d.k === 'fish') vignette(cx, drawFish, d.x + f * 4, d.y, 40, 30, f);
      else if (d.k === 'lugger') vignette(cx, drawLugger, d.x, d.y - 8, 80, 58, f);
    }
    // ---- shipping lanes (dotted), drawn under the ships that ride them
    for (const ln of LANES) {
      for (let i = 0; i < ln.length - 1; i++) line(cx, P.faint, ln[i][0], ln[i][1], ln[i + 1][0], ln[i + 1][1], 1, 5, i * 3);
    }
    // ---- island names, letter-spaced like a real chart
    for (const is of ISLES) {
      if (!is.name || !is.label) continue;
      txt(cx, is.name, is.label[0], is.label[1], is.ls || 5, { color: P.ink, align: 'center', tracking: 2, outline: P.sand });
    }
    for (const [s, x, y, sz, tr] of SEA_NAMES) {
      txt(cx, s, x, y, sz, { color: P.ink2, align: 'center', tracking: tr, outline: P.sea0 });
    }

    // ---- the folds this sheet has lived in
    for (const fx of [214, 428]) {
      for (let y = IN.y0 - 8; y < IN.y1 + 8; y++) {
        if (hash2(fx, y * 3) < 0.30) continue;
        const onLand = mask[y * MAP_W + fx];
        D1(cx, onLand ? P.shd[2] : P.stain2, fx, y);
        if (hash2(fx + 1, y * 5) > 0.55) D1(cx, onLand ? P.lit[1] : P.seaL, fx + 1, y);
      }
    }

    // ---- furniture on top
    drawRose(cx, ROSE.x, ROSE.y, ROSE.r);
    drawCartouche(cx, 14, 12, 190, 108);
    drawBorder(cx);

    // ---- tear the sheet out of its rectangle
    for (let x = 0; x < MAP_W; x++) {
      const t = PAPER.y0 + tearTop(x), b = PAPER.y1 - tearBot(x);
      cx.clearRect(x, 0, 1, t);
      cx.clearRect(x, b + 1, 1, MAP_H - b);
      D1(cx, P.stain2, x, t); D1(cx, P.stain2, x, b);
      if (hash2(x * 7, 11) > 0.6) D1(cx, P.beach, x, t + 1);
      if (hash2(x * 7, 23) > 0.6) D1(cx, P.beach, x, b - 1);
    }
    for (let y = 0; y < MAP_H; y++) {
      const l = PAPER.x0 + tearLft(y), r = PAPER.x1 - tearRgt(y);
      if (y > PAPER.y0 + 4 && y < PAPER.y1 - 4) {
        cx.clearRect(0, y, l, 1);
        cx.clearRect(r + 1, y, MAP_W - r, 1);
        D1(cx, P.stain2, l, y); D1(cx, P.stain2, r, y);
        if (hash2(y * 5, 31) > 0.6) D1(cx, P.beach, l + 1, y);
      }
    }

    octx.drawImage(chart, 0, 0);
    // brass tacks, one to each corner
    drawTack(octx, PAPER.x0 + 9, PAPER.y0 + 8);
    drawTack(octx, PAPER.x1 - 9, PAPER.y0 + 8);
    drawTack(octx, PAPER.x0 + 9, PAPER.y1 - 8);
    drawTack(octx, PAPER.x1 - 9, PAPER.y1 - 8);

    self.mask = mask; self.dOut = dOut; self.ocean = oc;
    self.nav = navGrid(mask, dOut);
    return out;
  }

  // =========================================================================
  //  PORT MARKERS
  // =========================================================================
  function plaqueRect(d) {
    const w = d.plaqW, h = 13;
    if (d.lab === 'right') return { x: d.x + 12, y: d.y - 6, w: w, h: h };
    if (d.lab === 'left') return { x: d.x - 12 - w, y: d.y - 6, w: w, h: h };
    if (d.lab === 'above') return { x: Math.round(d.x - w / 2), y: d.y - 12 - h, w: w, h: h };
    return { x: Math.round(d.x - w / 2), y: d.y + 11, w: w, h: h };
  }

  // a parchment tab with a folded corner and a chapter roundel — a chart
  // label, not a menu item
  function drawPlaque(ctx, d, sel, hov) {
    const r = d.plaque, on = d.unlocked;
    const body = sel ? P.sand : on ? P.beach : P.stain2;
    const edge = sel ? P.red : P.ink;
    const tint = on ? P.ink : P.greyD;
    R(ctx, P.stain2, r.x + 1, r.y + r.h, r.w - 1, 1);
    R(ctx, P.stain2, r.x + r.w, r.y + 1, 1, r.h - 1);
    R(ctx, body, r.x, r.y, r.w, r.h);
    box(ctx, edge, r.x, r.y, r.w, r.h);
    if (sel) box(ctx, P.redD, r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    else if (hov) box(ctx, P.goldL, r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    // the dog-eared corner
    for (let i = 0; i < 4; i++) {
      R(ctx, P.stain, r.x + r.w - 1 - i, r.y + r.h - 4 + i, i + 1, 1);
      D1(ctx, edge, r.x + r.w - 1 - i, r.y + r.h - 5 + i);
    }
    // chapter roundel
    disc(ctx, on ? P.red : P.grey, r.x + 7, r.y + 6, 5);
    ring(ctx, P.ink, r.x + 7, r.y + 6, 5, 0);
    txt(ctx, d.chapter, r.x + 7, r.y + 3, 5, { color: on ? P.sand : '#ded3ab', align: 'center' });
    txt(ctx, d.name, r.x + 15, r.y + 4, 6, { color: tint });
    if (!on) {
      // a blob of red wax, pressed with a broken-net sigil
      const wx = r.x + r.w - 7, wy = r.y + 6;
      disc(ctx, P.wax, wx, wy, 4);
      D1(ctx, P.waxL, wx - 1, wy - 2); D1(ctx, P.waxL, wx, wy - 2);
      D1(ctx, P.redD, wx + 1, wy + 2); D1(ctx, P.redD, wx - 2, wy + 1);
      D1(ctx, P.redD, wx - 1, wy - 1); D1(ctx, P.redD, wx + 1, wy + 1);
      D1(ctx, P.redD, wx + 1, wy - 1); D1(ctx, P.redD, wx - 1, wy + 1);
    }
  }

  function drawPort(ctx, d, T, sel, hov) {
    const x = Math.round(d.x), y = Math.round(d.y), on = d.unlocked;
    const ink = on ? P.ink : P.greyD;
    // the place itself, drawn on the chart above the point
    const gl = S.place[d.kind];
    if (gl) ctx.drawImage(on ? gl.on : gl.off, x - gl.ax, y - gl.ay);
    // the surveyed position: a circled dot with its cross of ticks
    disc(ctx, P.sand, x, y, 4);
    ring(ctx, ink, x, y, 4, 0);
    ring(ctx, ink, x, y, 3, 0);
    R(ctx, ink, x - 7, y, 3, 1); R(ctx, ink, x + 5, y, 3, 1);
    R(ctx, ink, x, y - 7, 1, 3); R(ctx, ink, x, y + 5, 1, 3);
    if (on) { disc(ctx, P.red, x, y, 2); D1(ctx, P.redL, x, y - 1); }
    else { disc(ctx, P.grey, x, y, 2); D1(ctx, P.greyL, x, y - 1); }
    // pulse / selection ring
    if (on) {
      const k = (Math.sin(T * 3.1) * 0.5 + 0.5);
      const rr = 8 + Math.round(k * 3);
      ring(ctx, sel ? P.red : P.ink2, x, y, rr, sel ? 2 : 3);
      if (sel) ring(ctx, P.redL, x, y, rr + 2, 3);
    } else {
      const k = (Math.sin(T * 1.7 + x) * 0.5 + 0.5);
      ring(ctx, sel ? P.greyD : P.grey, x, y, 8 + Math.round(k * 2), sel ? 2 : 4);
    }
    if (sel) {                                   // the surveyor's corner ticks
      const o = 12 + Math.round(Math.sin(T * 4) * 1);
      const col = on ? P.red : P.greyD;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        R(ctx, col, x + sx * o - (sx < 0 ? 0 : 4), y + sy * o, 5, 1);
        R(ctx, col, x + sx * o, y + sy * o - (sy < 0 ? 0 : 4), 1, 5);
      }
    } else if (hov) ring(ctx, on ? P.redL : P.greyD, x, y, 10, 2);
  }

  // =========================================================================
  //  THE SCREEN
  // =========================================================================
  const CARD = { x: 4, y: 270, w: 632, h: 86 };
  const BTN_BACK = { x: 566, y: 10, w: 62, h: 20 };
  const BTN_SAIL = { x: 486, y: 296, w: 136, h: 38 };

  const WorldMap = {
    ready: false, action: null, selected: 0, destinations: DEST,
    T: 0, routeT: 0, travel: 0, hover: -1, denyT: 0, chart: null,
    mask: null, dOut: null, shimmer: [], ships: [], unlockedCount: 1,

    // ---------------------------------------------------------------- init
    init() {
      if (this.ready) return; this.ready = true;
      buildSprites();
      for (let i = 0; i < DEST.length; i++) {
        const d = DEST[i];
        if (d.unlocked === undefined) d.unlocked = i === 0;
        d.plaqW = 28 + mText(d.name, 6);
        d.lines = wrapText(null, d.blurb, 286, 6).slice(0, 3);
      }
      this.chart = buildChart(this);          // this also snaps the ports to the coast
      for (const d of DEST) {
        let r = plaqueRect(d);
        // if the sheet has no room left below the mark, hang the label off
        // the side instead of letting the clamp drop it onto the mark
        if (d.lab === 'below' && d.y + 11 > IN.y1 - r.h - 3) {
          d.lab = (d.x + 12 + r.w < IN.x1 - 3) ? 'right' : 'left';
          r = plaqueRect(d);
        }
        r.x = clamp(r.x, IN.x0 + 3, IN.x1 - r.w - 3);
        r.y = clamp(r.y, IN.y0 + 3, IN.y1 - r.h - 3);
        d.plaque = r;
        const x0 = Math.min(d.x - 12, r.x), y0 = Math.min(d.y - 14, r.y);
        const x1 = Math.max(d.x + 12, r.x + r.w), y1 = Math.max(d.y + 12, r.y + r.h);
        d.hit = { x: x0, y: y0, w: Math.max(18, x1 - x0), h: Math.max(18, y1 - y0) };
      }
      // sea roads from the lagoon to every port
      for (const d of DEST) {
        const rt = buildRoute(this.mask, this.dOut, this.nav, HOME, d);
        d.route = rt.pts; d.routeLen = rt.len; d.book = rt.book;
      }
      // water shimmer: fixed marks in open water that wink on and off
      const rng = new SeededRandom(5150);
      this.shimmer.length = 0;
      for (let i = 0; i < 1100 && this.shimmer.length < 160; i++) {
        const x = Math.round(rng.range(IN.x0 + 4, IN.x1 - 6)), y = Math.round(rng.range(IN.y0 + 4, IN.y1 - 4));
        if (clearance(this.dOut, this.mask, x, y) < 8) continue;
        this.shimmer.push({ x: x, y: y, ph: rng.range(0, TAU), len: rng.int(2, 4), sp: rng.range(0.8, 1.9), lit: rng.next() < 0.6 });
      }
      // chart-ships crawling the shipping lanes
      this.ships.length = 0;
      for (let i = 0; i < LANES.length; i++) {
        const L = laneLen(LANES[i]);
        const n = i === 0 ? 3 : 2;
        for (let k = 0; k < n; k++) {
          this.ships.push({ lane: i, len: L, s: L * (k / n) + rng.range(0, 20), sp: rng.range(5.5, 11) * (rng.next() < 0.5 ? -1 : 1), bob: rng.range(0, TAU) });
        }
      }
    },

    // ---------------------------------------------------------------- open
    open(unlockedCount) {
      this.init();
      const n = clamp(unlockedCount === undefined ? 1 : unlockedCount | 0, 1, DEST.length);
      this.unlockedCount = n;
      for (let i = 0; i < DEST.length; i++) DEST[i].unlocked = i < n;
      this.selected = clamp(n - 1, 0, DEST.length - 1);
      this.action = null; this.routeT = 0; this.travel = 0; this.hover = -1; this.denyT = 0;
      this.overSail = false; this.overBack = false;
    },
    consume() { this.action = null; },

    // -------------------------------------------------------------- update
    select(i) {
      if (i === this.selected || i < 0 || i >= DEST.length) return;
      this.selected = i; this.routeT = 0; this.travel = 0;
      if (typeof Audio_ !== 'undefined' && Audio_.tone) Audio_.tone(520, 0.05, 'square', 0.07);
    },
    step(dx, dy) {
      const cur = DEST[this.selected];
      let best = -1, bs = 1e9;
      for (let i = 0; i < DEST.length; i++) {
        if (i === this.selected) continue;
        const vx = DEST[i].x - cur.x, vy = DEST[i].y - cur.y;
        const proj = vx * dx + vy * dy;
        if (proj <= 8) continue;
        const perp = Math.abs(vx * dy - vy * dx);
        const s = perp * 2.4 + Math.hypot(vx, vy) * 0.5 - proj * 0.35;
        if (s < bs) { bs = s; best = i; }
      }
      if (best < 0) best = clamp(this.selected + (dx + dy > 0 ? 1 : -1), 0, DEST.length - 1);
      this.select(best);
    },
    launch() {
      const d = DEST[this.selected];
      if (d.unlocked) {
        this.action = 'launch';
        if (typeof Audio_ !== 'undefined' && Audio_.buy) Audio_.buy();
      } else {
        this.denyT = 0.5;
        if (typeof Audio_ !== 'undefined' && Audio_.deny) Audio_.deny();
      }
    },
    back() {
      this.action = 'back';
      if (typeof Audio_ !== 'undefined' && Audio_.tone) Audio_.tone(260, 0.07, 'square', 0.1);
    },

    update(dt, t) {
      this.init();
      this.selected = clamp(this.selected | 0, 0, DEST.length - 1);
      this.T += dt;
      this.denyT = Math.max(0, this.denyT - dt);
      const m = Input.mouse;

      // ---- markers
      this.hover = -1;
      for (let i = 0; i < DEST.length; i++) {
        const h = DEST[i].hit;
        if (hitR(m, h.x, h.y, h.w, h.h)) this.hover = i;
      }
      const overSail = hitR(m, BTN_SAIL.x, BTN_SAIL.y, BTN_SAIL.w, BTN_SAIL.h);
      const overBack = hitR(m, BTN_BACK.x, BTN_BACK.y, BTN_BACK.w, BTN_BACK.h);
      this.overSail = overSail; this.overBack = overBack;
      if (m.clicked) {
        if (overBack) this.back();
        else if (overSail) this.launch();
        else if (this.hover >= 0) {
          if (this.hover === this.selected && DEST[this.hover].unlocked && this.routeT >= 1) this.launch();
          else this.select(this.hover);
        }
      }
      // ---- wheel steps through the chapters
      if (Input.wheel) {
        const n = DEST.length;
        this.select((this.selected + (Input.wheel > 0 ? 1 : n - 1)) % n);
      }
      // ---- keys
      if (Input.hit) {
        if (Input.hit('ArrowRight') || Input.hit('KeyD')) this.step(1, 0);
        if (Input.hit('ArrowLeft') || Input.hit('KeyA')) this.step(-1, 0);
        if (Input.hit('ArrowDown') || Input.hit('KeyS')) this.step(0, 1);
        if (Input.hit('ArrowUp') || Input.hit('KeyW')) this.step(0, -1);
        if (Input.hit('Enter') || Input.hit('NumpadEnter') || Input.hit('Space')) this.launch();
        if (Input.hit('Escape') || Input.hit('Backspace')) this.back();
      }
      // ---- the track drawing itself, then the pair sailing it on a loop
      if (this.routeT < 1) { this.routeT = Math.min(1, this.routeT + dt * 1.15); this.travel = this.routeT; }
      else { this.travel += dt * 0.19; if (this.travel >= 1) this.travel -= 1; }
      // ---- ships
      for (const s of this.ships) {
        s.s += s.sp * dt;
        if (s.s > s.len) s.s -= s.len;
        if (s.s < 0) s.s += s.len;
      }
      void t;
    },

    // -------------------------------------------------------------- render
    render(ctx, t) {
      this.init();
      this.selected = clamp(this.selected | 0, 0, DEST.length - 1);
      const T = this.T;
      ctx.drawImage(this.chart, 0, 0);
      this.drawShimmer(ctx, T);
      this.drawShips(ctx, T);
      this.drawHome(ctx, T);
      this.drawRoute(ctx, T);
      for (let i = 0; i < DEST.length; i++) {
        if (i === this.selected) continue;
        drawPort(ctx, DEST[i], T, false, this.hover === i);
      }
      drawPort(ctx, DEST[this.selected], T, true, false);
      for (let i = 0; i < DEST.length; i++) {
        if (i === this.selected) continue;
        drawPlaque(ctx, DEST[i], false, this.hover === i);
      }
      drawPlaque(ctx, DEST[this.selected], true, false);
      this.drawToken(ctx, T);
      this.drawCard(ctx, T);
      // BACK, pinned over the chart's top-right corner
      UIKit.button(ctx, BTN_BACK.x, BTN_BACK.y, BTN_BACK.w, BTN_BACK.h, 'BACK',
        this.overBack ? (Input.mouse.down ? 'pressed' : 'hover') : 'normal');
      void t;
    },

    drawShimmer(ctx, T) {
      for (const s of this.shimmer) {
        const k = Math.sin(T * s.sp + s.ph);
        if (k < 0.45) continue;
        const col = s.lit ? P.seaL : P.stain;
        R(ctx, col, s.x, s.y, s.len, 1);
        if (k > 0.88) R(ctx, col, s.x + 1, s.y - 1, Math.max(1, s.len - 1), 1);
      }
    },

    drawShips(ctx, T) {
      for (const s of this.ships) {
        const p = alongPath(LANES[s.lane], s.s);
        const y = Math.round(p.y + Math.sin(T * 2.2 + s.bob) * 1);
        ctx.save();
        ctx.translate(Math.round(p.x), y);
        if (s.sp < 0) ctx.scale(-1, 1);
        ctx.drawImage(S.ship.c, -S.ship.ax, -S.ship.ay);
        ctx.restore();
        const d = s.sp < 0 ? 1 : -1;
        R(ctx, P.ink2, Math.round(p.x) + d * 5, y + 3, 3, 1);
        R(ctx, P.faint, Math.round(p.x) + d * 8, y + 3, 2, 1);
      }
    },

    drawHome(ctx, T) {
      const x = HOME.x, y = HOME.y;
      disc(ctx, P.sand, x, y, 4);
      ring(ctx, P.ink, x, y, 4, 0);
      drawSprite(ctx, S.anchor, x, y - 1);
      const k = (Math.sin(T * 2.4) * 0.5 + 0.5);
      ring(ctx, P.ink2, x, y, 7 + Math.round(k * 2), 3);
      const w = 8 + mText('THE LAGOON', 6);
      R(ctx, P.stain2, x + 9, y - 6, w, 12);
      R(ctx, P.sand, x + 8, y - 7, w, 12);
      box(ctx, P.ink, x + 8, y - 7, w, 12);
      txt(ctx, 'THE LAGOON', x + 12, y - 3, 6, { color: P.ink });
      txt(ctx, 'YOU ARE HERE', x + 9, y + 7, 5, { color: P.red, tracking: 1, outline: P.sand });
    },

    drawRoute(ctx, T) {
      const d = DEST[this.selected], pts = d.route, total = d.routeLen;
      const shown = total * this.routeT;
      const live = d.unlocked;
      // 1) a scrubbed light underlay so the track reads over stipple and rhumbs
      this.walk(pts, shown, 1, (x, y) => { D1(ctx, P.sand, x, y); D1(ctx, P.sand, x, y - 1); D1(ctx, P.beach, x, y + 1); });
      // 2) the dashed track itself, crawling forward
      const ph = Math.floor(T * 14), per = live ? 8 : 6, on = live ? 5 : 2;
      this.walk(pts, shown, 1, (x, y, s) => {
        const k = ((Math.floor(s) - ph) % per + per) % per;
        if (k < on) D1(ctx, live ? P.red : P.greyD, x, y);
        else if (k === on && live) D1(ctx, P.redD, x, y);
      });
      // 3) distance ticks along the course, every fifth one long
      this.walk(pts, shown, 1, (x, y, s, dx, dy) => {
        const si = Math.floor(s);
        if (si % 18 !== 0 || si < 10) return;
        const nx = -dy, ny = dx, len = (si % 90 === 0) ? 3 : 2;
        for (let k = -len; k <= len; k++) D1(ctx, live ? P.redD : P.greyD, Math.round(x + nx * k), Math.round(y + ny * k));
      });
      // 4) chevrons showing which way the course runs
      this.walk(pts, shown, 1, (x, y, s, dx, dy) => {
        if (Math.floor(s) % 46 !== 20) return;
        const nx = -dy, ny = dx;
        for (let k = 1; k <= 3; k++) {
          D1(ctx, live ? P.redD : P.greyD, Math.round(x - dx * k + nx * k), Math.round(y - dy * k + ny * k));
          D1(ctx, live ? P.redD : P.greyD, Math.round(x - dx * k - nx * k), Math.round(y - dy * k - ny * k));
        }
      });
      // 5) the waypoints themselves, with the bearing off each one
      let shownLab = 0;
      for (let i = 0; i < d.book.length; i++) {
        const b = d.book[i];
        if (b.s > shown) break;
        disc(ctx, P.sand, b.x, b.y, 3);
        ring(ctx, live ? P.redD : P.greyD, b.x, b.y, 3, 0);
        D1(ctx, live ? P.red : P.greyD, b.x, b.y);
        if (shownLab < 3 && b.len > 46) {
          shownLab++;
          const col = live ? P.redD : P.greyD;
          const lab = (b.brg < 100 ? (b.brg < 10 ? '00' : '0') : '') + b.brg;
          const tw = mText(lab, 5), w = tw + 12;
          const lx = clamp(b.x - (w >> 1), IN.x0 + 2, IN.x1 - w - 2);
          const ly = (i & 1) ? b.y - 13 : b.y + 7;
          R(ctx, P.stain2, lx + 1, ly + 9, w - 1, 1);
          R(ctx, P.sand, lx, ly, w, 9);
          box(ctx, col, lx, ly, w, 9);
          txt(ctx, lab, lx + 3, ly + 2, 5, { color: col });
          box(ctx, col, lx + 4 + tw, ly + 2, 3, 3);
        }
      }
    },
    // walk a polyline at 1px steps up to `upTo` length
    walk(pts, upTo, step, fn) {
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (L < 0.0001) continue;
        for (let u = 0; u < L; u += step) {
          if (acc + u > upTo) return;
          fn(Math.round(a[0] + dx * (u / L)), Math.round(a[1] + dy * (u / L)), acc + u, dx / L, dy / L);
        }
        acc += L;
      }
    },

    drawToken(ctx, T) {
      const d = DEST[this.selected];
      const p = alongPath(d.route, d.routeLen * this.travel);
      const x = Math.round(p.x), y = Math.round(p.y + Math.sin(T * 3.4) * 1);
      for (let i = 1; i <= 4; i++) {
        const wx = Math.round(x - p.dx * (7 + i * 3)), wy = Math.round(y - p.dy * (7 + i * 3));
        D1(ctx, i < 3 ? P.sand : P.beach, wx, wy);
        D1(ctx, P.beach, wx, wy - 1);
      }
      ctx.save();
      ctx.translate(x, y);
      if (p.dx < 0) ctx.scale(-1, 1);
      ctx.drawImage(S.token.c, -S.token.ax, -S.token.ay);
      ctx.restore();
    },

    // ---------------------------------------------------------- detail card
    drawCard(ctx, T) {
      const d = DEST[this.selected];
      UIKit.panel(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 'dark');
      const X = 18;
      // ---- name + standing
      pixelTextOutlined(ctx, d.name, X, 277, 18, d.unlocked ? '#ffe48f' : '#b8c6d4', '#14141c');
      const st = d.unlocked
        ? 'CHAPTER ' + d.chapter + '   -   THE WAY IS OPEN'
        : 'CHAPTER ' + d.chapter + '   -   LOCKED';
      pixelText(ctx, st, X, 295, 6, d.unlocked ? '#6fd88e' : '#8ea6bc', 'left', false);
      // the leg, read straight off the plotted course
      const brg = d.book.length ? d.book[0].brg : 0;
      const legs = Math.max(1, Math.round(d.routeLen / 10));
      const crs = 'CRS ' + ((brg < 100 ? (brg < 10 ? '00' : '0') : '') + brg) + '   ' + legs + ' LEAGUES';
      pixelText(ctx, crs, X + 178, 295, 6, '#c9a86a', 'left', false);
      UIKit.divider(ctx, X, 306, 288);
      let y = 312;
      for (const l of d.lines) { pixelText(ctx, l, X, y, 6, '#cfe6f2', 'left', false); y += 9; }
      if (!d.unlocked && d.need) pixelText(ctx, 'TAKE ' + d.need + ' FIRST.', X, y + 1, 6, '#ff9a3c', 'left', false);
      else if (d.note) pixelText(ctx, d.note, X, y + 1, 6, '#8ea6bc', 'left', false);

      // ---- what waits there
      const FX = 322;
      pixelText(ctx, 'WHAT WAITS THERE', FX, 278, 5, '#9ab4c6', 'left', false);
      R(ctx, '#2b3548', FX, 286, 150, 1);
      for (let i = 0; i < d.foes.length; i++) {
        const f = d.foes[i], ry = 291 + i * 15;
        if (f === 'chief') {
          drawSprite(ctx, SP.skull, FX + 8, ry + 6);
          pixelText(ctx, FOE_NAME[f], FX + 20, ry + 3, 6, '#ff6161', 'left', false);
        } else {
          const s = SP.boats[f];
          if (s) ctx.drawImage(s.c, FX, ry + 6 - Math.round(s.h / 2));
          pixelText(ctx, FOE_NAME[f] || f, FX + (s ? s.w : 0) + 5, ry + 3, 6, '#dfe9f2', 'left', false);
        }
      }

      // ---- threat + the big button
      pixelText(ctx, 'THREAT', BTN_SAIL.x, 277, 5, '#9ab4c6', 'left', false);
      UIKit.bar(ctx, BTN_SAIL.x + 34, 275, BTN_SAIL.w - 34, 9, d.threat, '#3f7fd6', '#c8302e');
      const press = this.overSail && Input.mouse.down;
      if (d.unlocked) {
        UIKit.button(ctx, BTN_SAIL.x, BTN_SAIL.y, BTN_SAIL.w, BTN_SAIL.h, 'SET SAIL',
          press ? 'pressed' : this.overSail ? 'hover' : 'normal');
        const o = Math.round((T * 26) % 18);
        for (let i = 0; i < 2; i++) {
          const cx2 = BTN_SAIL.x + 8 + o - i * 16;
          if (cx2 > BTN_SAIL.x + 4 && cx2 < BTN_SAIL.x + BTN_SAIL.w - 8) {
            R(ctx, '#ffeeb4', cx2, BTN_SAIL.y + 30, 2, 1);
            R(ctx, '#ffeeb4', cx2 + 2, BTN_SAIL.y + 31, 2, 1);
            R(ctx, '#ffeeb4', cx2, BTN_SAIL.y + 32, 2, 1);
          }
        }
      } else {
        const shake = this.denyT > 0 ? Math.round(Math.sin(this.denyT * 60) * 2) : 0;
        UIKit.button(ctx, BTN_SAIL.x + shake, BTN_SAIL.y, BTN_SAIL.w, BTN_SAIL.h, 'LOCKED', 'disabled');
        drawSprite(ctx, S.lock, BTN_SAIL.x + 18 + shake, BTN_SAIL.y + 19);
      }
      pixelText(ctx, 'ARROWS CHOOSE   -   ENTER SETS SAIL   -   ESC GOES BACK', 320, 343, 5, '#7f93a6', 'center', false);
    },
  };

  global.WorldMap = WorldMap;
  global.WorldMapChart = { P: P, DEST: DEST, ISLES: ISLES, HOME: HOME };   // harness / debug only
})(typeof window !== 'undefined' ? window : this);
