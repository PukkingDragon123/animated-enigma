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
  // a colour packed the way an ImageData word wants it, so a raster pass can
  // write one 32-bit word per pixel instead of four bytes
  // kept as a signed 32-bit int on purpose: it stays a small integer for the
  // engine, which is what makes a million-pixel pass cheap
  function packed(hex) { const c = hexToRgb(hex); return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) | 0; }
  // the font's display face, on demand (pixelText picks a face by size alone)
  function txt(ctx, s, x, y, size, opts) { return PixelFont.drawText(ctx, s, x, y, size, opts); }
  function mText(s, size) { return textWidth(s, size); }

  // ------------------------------------------------------- chart palette --
  // Aged laid paper, iron-gall ink, a little carmine for the ports and the
  // track.  The sea is tinted by depth so the isles read at a glance; the
  // land is a warm five-step ramp lit from the north-west.
  const P = {
    // water: a hand-laid watercolour wash over cream paper, shoal -> abyss
    sea0: '#d8e6c8', sea1: '#b3d4c6', sea2: '#8cbcbe', sea3: '#6a9fb2', sea4: '#53839e',
    seaL: '#ecf4dd', seaX: '#3f6482',
    stain: '#c6dcbb', stain2: '#b0ccba', foxing: '#b07a48',
    // paper itself (margins, torn edges, label stock)
    sand: '#f8eecb', beach: '#eedfa8', tear: '#c9b184', shade: '#bda87c',
    // land ramp: coastal green climbing to ochre upland, lit / mid / shaded
    lit: ['#e9eeb2', '#dce599', '#d8d07e', '#cdb766', '#c09c52'],
    mid: ['#cbdf9d', '#bfd385', '#b9bd6f', '#afa55c', '#a18a48'],
    shd: ['#9fc182', '#90b06d', '#88985b', '#82824c', '#756c3e'],
    ink: '#33260f', ink2: '#5d4720', inkL: '#8d6d3c', faint: '#a9a077', hair: '#c3bb93',
    forest: '#3f6b2c', forestD: '#27491b', forestL: '#63913d',
    red: '#ab3421', redL: '#d05730', redD: '#6d1d0f', wax: '#a3271a', waxL: '#cf4a2a',
    gold: '#b1822a', goldL: '#e5b74e', goldD: '#6d4d15',
    grey: '#7c8290', greyL: '#a3a9b4', greyD: '#4b5260',
    // second and third inks the survey was drawn in
    blue: '#2f5f8c', blueL: '#5b8fb6', blueD: '#1d3f63',
    green: '#2f6b46', greenL: '#5a9a68', violet: '#5d4a7c', violetL: '#8a76a8',
    table: '#241811', tableL: '#3a2819', tableD: '#150d08', tableG: '#0d0705',
    brass: '#c79a3c', brassL: '#f2d383', brassD: '#6c4c12',
    coffee: '#b98a52', coffeeD: '#9a6a36',
  };
  const MAP_W = 640, MAP_H = 272;                    // the chart; card sits below
  const SC = 2;                                      // bake pixels to the chart unit
  const SH_H = 277;                                  // sheet plate height (chart + its shadow)
  const PAPER = { x0: 3, y0: 2, x1: 636, y1: 268 };  // the sheet itself
  const IN = { x0: 20, y0: 19, x1: 620, y1: 250 };   // interior (inside the neat line)
  // the chart window on the 640x360 screen; the detail card sits under it
  const VIEW = { x: 0, y: 0, w: 640, h: 270 };
  const ZOOMS = [1, 2, 4];                           // screen px to the chart unit

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
    { name: 'THE SISTERS', x: 298, y: 182, rx: 16, ry: 11, seed: 3301, rough: 1.3, hills: 1, woods: 1, label: [312, 166], ls: 4, lobes: [{ dx: 10, dy: 6, rx: 8, ry: 6 }] },
    { name: '', x: 332, y: 208, rx: 12, ry: 9, seed: 3307, rough: 1.3, hills: 1, woods: 0, lobes: [] },
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
    { k: 'serpent', x: 222, y: 176, f: 1 },
    { k: 'lugger', x: 96, y: 138, f: -1 },
    { k: 'whale', x: 478, y: 234, f: -1 },
    { k: 'kraken', x: 490, y: 172 },
    { k: 'ray', x: 266, y: 216 },
    { k: 'fish', x: 530, y: 50, f: -1 },
    { k: 'fish', x: 322, y: 58, f: 1 },
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
    ['MOTHER DEEP', 166, 126, 6, 3],
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
  // Painted straight into the bake plate at SC pixels to the chart unit, so
  // the wash, the laid-paper grain and the surf stipple all come out twice as
  // fine as the survey inked over them.  Depth is sampled from the 1x field;
  // only the paint is at bake resolution.
  function paintSea(ctx, m, dOut) {
    const W = MAP_W * SC, H = MAP_H * SC;
    const band = [P.sea0, P.sea1, P.sea2, P.sea3, P.sea4].map(packed);
    const stain = packed(P.stain), stain2 = packed(P.stain2), spot = packed(P.foxing);
    const surf = packed(P.seaL), deep = packed(P.seaX), cof = hexToRgb(P.coffee);
    const img = ctx.createImageData(W, H), u32 = new Uint32Array(img.data.buffer);
    // rings the otter's mug left on the sheet, in chart units, each with the
    // box outside which it cannot possibly matter
    const RINGS = [[98, 62, 22], [505, 200, 18.5], [278, 237, 14.5]];
    for (const r of RINGS) { r[3] = r[0] - r[2] - 6; r[4] = r[0] + r[2] + 6; r[5] = r[1] - r[2] - 6; r[6] = r[1] + r[2] + 6; }
    const EDGE = [0, 0, 13, 24, 38];
    // The wash is decided once per chart unit — it is a brush, not a pen —
    // and only the grain, the dither and the foxing are per bake pixel.
    for (let sy = 0; sy < MAP_H; sy++) {
      for (let sx = 0; sx < MAP_W; sx++) {
        const i = sy * MAP_W + sx;
        const dep = m[i] ? 0 : dOut[i];
        const nlo = vnoise(sx * 0.055 + 30, sy * 0.055 + 11) * 0.62;
        const st = vnoise(sx * 0.011 + 77, sy * 0.011 + 21);
        const stc = st > 0.755 ? (st > 0.825 ? stain2 : stain) : 0;
        const surfy = dep >= 1 && dep <= 2;
        // the grain can only shift the band where the unit already straddles
        // a threshold, so most units settle their colour once and skip it
        const lo = dep + (nlo - 0.5) * 4.6, hi = lo + 1.748;
        const bLo = lo < 5 ? 0 : lo < 13 ? 1 : lo < 24 ? 2 : lo < 38 ? 3 : 4;
        const bHi = hi < 5 ? 0 : hi < 13 ? 1 : hi < 24 ? 2 : hi < 38 ? 3 : 4;
        const flat = (bLo === bHi);
        const rimmable = !flat || (bLo >= 2 && lo - EDGE[bLo] < 1.3);
        // is this unit anywhere near a coffee ring?
        let ring = -1;
        for (let k = 0; k < RINGS.length; k++) {
          const rr = RINGS[k];
          if (sx < rr[3] || sx > rr[4] || sy < rr[5] || sy > rr[6]) continue;
          const dx = sx - rr[0], dy = sy - rr[1];
          const dl = Math.sqrt(dx * dx + dy * dy * 1.32) - rr[2];
          if (dl > -6 && dl < 3) { ring = k; break; }
        }
        for (let oy = 0; oy < SC; oy++) {
          const y = sy * SC + oy, row = y * W, laid = (y % 18) < 2;
          for (let ox = 0; ox < SC; ox++) {
            const x = sx * SC + ox, p = row + x;
            let b = bLo, dd = lo;
            if (!flat) { dd = lo + hash2(x, y) * 1.748; b = dd < 5 ? 0 : dd < 13 ? 1 : dd < 24 ? 2 : dd < 38 ? 3 : 4; }
            let c = stc || band[b];                             // tea stains
            // where the brush stopped, the wash pooled: a darker rim
            if (rimmable && b >= 2 && dd - EDGE[b] < 1.3 && hash2(x * 5, y * 3) > 0.44) c = band[b + 1] || deep;
            if (surfy && ((x + y) % 7) < 4) c = surf;            // the first fathom
            if (laid && hash2(x * 3, y) > 0.66) c = stain2;      // laid lines
            if (ring >= 0) {
              const rr = RINGS[ring], dx = x - rr[0] * SC, dy = (y - rr[1] * SC) * 1.15;
              const dl = Math.sqrt(dx * dx + dy * dy) - rr[2] * SC - vnoise(x * 0.03 + ring * 9, y * 0.03) * 5;
              if (dl > -9 && dl < 2) {
                const edge = dl > -2.4;
                if (edge ? hash2(x * 7 + ring, y * 5) > 0.20 : hash2(x * 9 + ring, y * 11) > 0.82) {
                  const cr = c & 255, cg = (c >> 8) & 255, cb = (c >> 16) & 255;
                  const r2 = edge ? (cr + cof[0]) >> 1 : (cr * 3 + cof[0]) >> 2;
                  const g2 = edge ? (cg + cof[1]) >> 1 : (cg * 3 + cof[1]) >> 2;
                  const b2 = edge ? (cb + cof[2]) >> 1 : (cb * 3 + cof[2]) >> 2;
                  c = ((255 << 24) | (b2 << 16) | (g2 << 8) | r2) | 0;
                }
              }
            }
            u32[p] = c;
          }
        }
      }
    }
    // foxing: a few hundred rust specks, stamped rather than tested for
    const fx = new SeededRandom(7717);
    for (let i = 0; i < 900; i++) {
      const x = fx.int(0, W - 1), y = fx.int(0, H - 1);
      u32[y * W + x] = spot;
      if (fx.next() < 0.3) u32[y * W + Math.min(W - 1, x + 1)] = spot;
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
          // isobaths are inked in blue, the shoal line heavier than the rest
          if (((x * 2 + y * 3 + k * 4) % per) < on) D1(ctx, k === 0 ? P.blue : k === 3 ? P.blueD : P.blueL, x, y);
        }
      }
    }
  }

  // ------------------------------------------------------------ the land --
  function paintLand(m, dIn, dOut, hg) {
    const W = MAP_W * SC, H = MAP_H * SC, c = can(W, H), ctx = c.getContext('2d');
    const ink = packed(P.ink), ink2 = packed(P.ink2), inkL = packed(P.inkL);
    const beach = packed(P.beach), sand = packed(P.sand), marsh = packed(P.green);
    const LIT = P.lit.map(packed), MID = P.mid.map(packed), SHD = P.shd.map(packed);
    const img = ctx.createImageData(W, H), u32 = new Uint32Array(img.data.buffer);
    // only the land and the shore band it stipples are visited; the open sea
    // is already painted and is left alone
    for (let sy = 1; sy < MAP_H - 1; sy++) {
      for (let sx = 1; sx < MAP_W - 1; sx++) {
        const i = sy * MAP_W + sx;
        const isLand = m[i];
        const dout = dOut[i];
        if (!isLand && (dout < 2 || dout > 8)) continue;
        let din = 0, hv = 0, lum = 0, b = 0, steep0 = 0, flat = false, ramp0 = MID;
        if (isLand) {
          din = dIn[i];
          if (din > 2) {
            hv = hg[i];
            lum = -((hg[i + 1] - hg[i - 1]) + (hg[i + MAP_W] - hg[i - MAP_W]));
            b = hv < 0.085 ? 0 : hv < 0.215 ? 1 : hv < 0.395 ? 2 : hv < 0.60 ? 3 : 4;
            steep0 = Math.max(0, -lum) * 26;
            // the jitter only decides the ramp where the slope is ambiguous
            flat = Math.abs(lum) > 0.0346;
            ramp0 = lum > 0.012 ? LIT : lum < -0.012 ? SHD : MID;
          }
        }
        for (let oy = 0; oy < SC; oy++) {
          const y = sy * SC + oy;
          for (let ox = 0; ox < SC; ox++) {
            const x = sx * SC + ox, p = y * W + x;
            let col = 0;
            if (isLand) {
              if (din <= 1) col = ink;                                  // inked coastline
              else if (din === 2) col = ((x + y) & 1) ? beach : sand;   // a thread of beach
              else {
                const jit = flat ? 0 : (hash2(x * 5, y * 3) - 0.5) * 0.045;
                col = (flat ? ramp0 : ((lum + jit) > 0.012 ? LIT : (lum + jit) < -0.012 ? SHD : MID))[b];
                // salt marsh in the low flat ground behind the beaches
                if (b === 0 && din > 3 && din < 11 && (y % 4) < 1 && hash2(x * 3 + 2, y * 7) > 0.62) col = marsh;
                // hachures down the shaded flanks: the steeper, the denser
                const steep = steep0 - jit * 26;
                if (steep > 0.55 && hash2(x * 7 + 1, y * 11 + 9) < Math.min(0.40, steep * 0.20)) col = b > 2 ? ink2 : inkL;
                else if (din <= 5 && hash2(x * 3 + 7, y * 9 + 5) < (6 - din) * 0.075) col = ink2;
                else if (din > 8 && hash2(x * 3 + 7, y * 5 + 1) > 0.9975) col = inkL;
              }
            } else if (hash2(x * 5 + 3, y * 9 + 13) < (9 - dout) * 0.0135) {
              col = inkL;                                 // offshore dot-screen
            }
            if (col) u32[p] = col;
          }
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
  // a right whale, blowing: counter-shaded back, hatched flank, solid flukes
  function drawWhale(ctx, x, y, f) {
    y += 6;
    const W = 36, TL = 10, BL = 7.5;
    const g = u => u < 0.15 ? 0.20 + u / 0.15 * 0.30
      : u < 0.56 ? 0.50 + (u - 0.15) / 0.41 * 0.50
      : u < 0.88 ? 1
      : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.88) / 0.13, 2)));
    let pt = 0, pb = 0;
    for (let i = 0; i < W; i++) {
      const u = i / (W - 1), k = g(u);
      let t = Math.round(TL * k); const b = Math.round(BL * k);
      if (u > 0.28 && u < 0.46) t += 1;                       // the dorsal hump
      const cx = x + f * Math.round(i - W * 0.52);
      for (let q = -t + 1; q < b; q++) D1(ctx, P.sand, cx, y + q);
      for (let q = -t + 1; q < Math.min(b, -t + 3); q++) D1(ctx, P.ink2, cx, y + q);
      D1(ctx, P.ink, cx, y - t); D1(ctx, P.ink, cx, y + b);
      for (let q = Math.min(t, pt); q < Math.max(t, pt); q++) D1(ctx, P.ink, cx, y - q);
      for (let q = Math.min(b, pb); q < Math.max(b, pb); q++) D1(ctx, P.ink, cx, y + q);
      pt = t; pb = b;
      if (i % 2 === 0) for (let q = -t + 4; q < b - 1; q += 3) D1(ctx, P.inkL, cx, y + q);
      if (u > 0.58 && i % 2 === 0) for (let q = 2; q < b; q += 2) D1(ctx, P.ink2, cx, y + q);
    }
    const hx = x + f * Math.round(W * 0.45);
    for (let i = 0; i < 15; i++) D1(ctx, P.ink, hx + f * i - f * 8, y + 2 + Math.round(i * 0.16));
    D1(ctx, P.ink, hx + f * 5, y - 2); D1(ctx, P.ink, hx + f * 6, y - 2); D1(ctx, P.ink, hx + f * 5, y - 1);
    tri(ctx, P.ink, hx - f * 4, y + 5, hx - f * 12, y + 11, hx - f * 7, y + 4);
    const tx = x - f * Math.round(W * 0.54);
    tri(ctx, P.ink, tx, y, tx - f * 11, y - 10, tx - f * 5, y - 1);
    tri(ctx, P.ink, tx, y, tx - f * 11, y + 9, tx - f * 5, y + 1);
    for (let k = 4; k < 8; k++) { D1(ctx, P.sand, tx - f * k, y - k); D1(ctx, P.sand, tx - f * k, y + k - 2); }
    // the blow, rooted in her back so it never floats free of her
    const bhx = hx - f * 4;
    for (let k = 0; k < 4; k++) R(ctx, P.ink, bhx - 2, y - 8 - k, 5, 1);
    for (let i = 0; i < 15; i++) {
      const sy = y - 12 - i, lean = Math.round(i * 0.42);
      D1(ctx, P.ink, bhx - f * lean, sy); D1(ctx, P.ink, bhx - f * (lean + 1), sy);
      D1(ctx, P.ink, bhx + f * (lean + 1), sy); D1(ctx, P.ink, bhx + f * (lean + 2), sy);
      if (i > 7 && (i & 1)) { D1(ctx, P.ink2, bhx - f * (lean + 3), sy); D1(ctx, P.ink2, bhx + f * (lean + 4), sy); }
    }
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
      out[key] = { on: haloed(on, P.sand, 1, false), off: haloed(off, '#ded6bc', 1, false), ax: GAX, ay: GAY };
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
        // portolan convention: the eight principal winds in black, the half
        // winds in green, the quarter winds in red
        const col = (i % 4 === 0) ? P.inkL : (i % 2 === 0) ? '#7a9a7e' : '#c08a74';
        line(ctx, col, node[0], node[1], node[0] + ca * L, node[1] + sa * L, 1, 5, 0);
      }
      ring(ctx, P.green, node[0], node[1], 4, 0);
      D1(ctx, P.red, node[0], node[1]);
    }
  }
  function degRing(ctx, col, x, y) { box(ctx, col, x, y, 3, 3); D1(ctx, P.sea0, x + 1, y + 1); }
  function drawGraticule(ctx) {
    const MER = [84, 186, 288, 390, 492, 594], PAR = [46, 112, 178, 244];
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    for (const x of MER) line(ctx, P.blueL, x, IN.y0, x, IN.y1, 1, 5, 0);
    for (const y of PAR) line(ctx, P.blueL, IN.x0, y, IN.x1, y, 1, 5, 0);
    for (const x of MER) for (const y of PAR) {
      R(ctx, P.blue, x - 2, y, 5, 1); R(ctx, P.blue, x, y - 2, 1, 5);
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
      D1(ctx, d2 > (r + 5) * (r + 5) ? '#ddd5ae' : '#eae2bd', cx + x, cy + y);
    }
    ring(ctx, P.blueD, cx, cy, r + 6, 0);
    ring(ctx, P.blue, cx, cy, r + 5, 0);
    ring(ctx, P.ink, cx, cy, r, 0);
    ring(ctx, P.gold, cx, cy, r - 4, 0);
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
    // the four inks a rose is illuminated in: gold by-points, blue half
    // winds, and the cardinals struck in carmine
    star(16, r - 11, 2.0, -Math.PI / 2 + Math.PI / 16, '#f6e8c0', P.goldD);
    star(8, r - 6, 3.6, -Math.PI / 2 + Math.PI / 8, P.sand, P.blueD);
    star(4, r - 1, 5.4, -Math.PI / 2, '#fff3d2', P.redD);
    star(4, r - 1, 4.8, 0, P.sand, P.blueD);
    disc(ctx, P.goldL, cx, cy, 5); ring(ctx, P.ink, cx, cy, 5, 0); ring(ctx, P.goldD, cx, cy, 4, 0);
    R(ctx, P.red, cx - 1, cy - 1, 3, 3); D1(ctx, '#ffe9b4', cx, cy);
    // fleur-de-lys over north
    const ny = cy - r - 4, fl = P.goldD;
    R(ctx, fl, cx, ny - 10, 1, 10);
    D1(ctx, fl, cx - 1, ny - 8); D1(ctx, fl, cx + 1, ny - 8);
    D1(ctx, fl, cx - 2, ny - 6); D1(ctx, fl, cx + 2, ny - 6);
    D1(ctx, fl, cx - 3, ny - 5); D1(ctx, fl, cx + 3, ny - 5);
    R(ctx, P.gold, cx - 4, ny - 4, 9, 1);
    D1(ctx, fl, cx - 3, ny - 3); D1(ctx, fl, cx + 3, ny - 3);
    D1(ctx, fl, cx - 2, ny - 2); D1(ctx, fl, cx + 2, ny - 2);
    D1(ctx, P.goldL, cx - 1, ny - 4); D1(ctx, P.goldL, cx + 1, ny - 4);
    R(ctx, P.red, cx, ny - 7, 1, 2);
    // an eastern cross, the way the old roses mark the Levant
    const ex = cx + r + 7;
    R(ctx, P.red, ex, cy - 5, 1, 9); R(ctx, P.red, ex - 2, cy - 2, 5, 1);
    // cardinal letters
    txt(ctx, 'S', cx, cy + r + 8, 6, { color: P.redD, align: 'center', outline: P.sand });
    txt(ctx, 'W', cx - r - 11, cy - 3, 6, { color: P.blueD, align: 'center', outline: P.sand });
    txt(ctx, 'NE', cx + r - 2, cy - r + 2, 5, { color: P.goldD, align: 'center', outline: '#eae2bd' });
    txt(ctx, 'SW', cx - r + 2, cy + r - 6, 5, { color: P.goldD, align: 'center', outline: '#eae2bd' });
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
    // the bar is chequered red and black, the way a league scale is engraved
    for (let i = 0; i < n; i++) R(ctx, (i & 1) ? P.sand : (i === 0 ? P.red : P.ink), x + i * seg + 1, by + 1, seg - (i === n - 1 ? 2 : 0), 4);
    for (let i = 1; i < n; i += 2) R(ctx, P.redD, x + i * seg + 1, by + 4, seg - 1, 1);
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
      D1(ctx, P.goldD, sx, sy); D1(ctx, P.goldD, sx + fx, sy + fy); D1(ctx, P.goldD, sx + fx * 2, sy);
      D1(ctx, P.goldD, sx, sy + fy * 2); D1(ctx, P.gold, sx + fx, sy);
      D1(ctx, P.goldD, sx + fx * 4, sy + fy); D1(ctx, P.gold, sx + fx * 5, sy + fy * 2);
    }
    // the title, illuminated: the letters laid twice, gold under iron gall
    let ty = y + 8;
    for (const [str, dy] of [['THE BAY OF', 0], ['BROKEN NETS', 16]]) {
      txt(ctx, str, x + w / 2 + 1, ty + dy + 1, 13, { color: P.goldL, align: 'center', tracking: 2 });
      txt(ctx, str, x + w / 2, ty + dy, 13, { color: P.ink, align: 'center', tracking: 2 });
    }
    ty += 32;
    // a hairline rule with a lozenge
    R(ctx, P.blue, x + 16, ty, w - 32, 1);
    R(ctx, P.sand, x + w / 2 - 5, ty - 2, 11, 5);
    for (let i = 0; i < 3; i++) {
      const hw = i === 1 ? 2 : i === 0 ? 1 : 1;
      R(ctx, P.red, x + w / 2 - hw, ty - 1 + i, hw * 2 + 1, 1);
    }
    D1(ctx, P.goldL, x + w / 2, ty);
    R(ctx, P.blueD, x + w / 2 - 8, ty, 2, 1); R(ctx, P.blueD, x + w / 2 + 7, ty, 2, 1);
    ty += 5;
    txt(ctx, 'SOUNDINGS IN FATHOMS', x + w / 2, ty, 5, { color: P.blueD, align: 'center', tracking: 1 }); ty += 8;
    txt(ctx, 'DRAWN BY THE OTTER, WHO', x + w / 2, ty, 5, { color: P.ink2, align: 'center' }); ty += 7;
    txt(ctx, 'HAS NEVER BEEN WRONG YET', x + w / 2, ty, 5, { color: P.ink2, align: 'center' }); ty += 10;
    // a second rule, then the scale engraved into the foot of the plaque
    R(ctx, P.blue, x + 22, ty, w - 44, 1);
    for (const dx of [-1, 0, 1]) D1(ctx, P.red, x + w / 2 + dx, ty);
    D1(ctx, P.red, x + w / 2, ty - 1); D1(ctx, P.red, x + w / 2, ty + 1);
    ty += 5;
    const sw = drawScale(ctx, Math.round(x + w / 2 - 43), ty);
    void sw;
    // the surveyor's seal, pressed into the foot of the plaque
    const wx = x + w - 16, wy = y + h - 15;
    disc(ctx, P.redD, wx + 1, wy + 1, 7);
    disc(ctx, P.wax, wx, wy, 7);
    disc(ctx, P.waxL, wx - 1, wy - 2, 3);
    ring(ctx, P.redD, wx, wy, 7, 0);
    ring(ctx, P.redD, wx, wy, 4, 0);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      D1(ctx, P.redD, Math.round(wx + Math.cos(a) * 8), Math.round(wy + Math.sin(a) * 8));
    }
    for (let i = -3; i <= 3; i++) { D1(ctx, P.redD, wx + i, wy + i); D1(ctx, P.redD, wx + i, wy - i); }
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

  // =========================================================================
  //  CLOSE-UP DETAIL
  //  Everything in here is inked at bake resolution — one bake pixel is half
  //  a chart unit — so it stays fine print when the sheet is enlarged and
  //  simply drops out of legibility when it is not.  None of it is on the
  //  1x survey: it is the second pass the otter made once she had time.
  // =========================================================================
  // coves, rocks and grounds, given roughly and then snapped to real water
  const COVES = [
    ['OTTER COVE', 62, 164], ['NET ROCK', 162, 148], ['THE TEETH', 198, 234],
    ['GULL SPIT', 36, 216], ['LOW SOUND', 212, 120], ['TAR COVE', 294, 96],
    ['PILOT ROCK', 316, 158], ['BONE BAR', 352, 198], ['SLACK WATER', 452, 210],
    ['WINCH POINT', 510, 96], ['BLIND REEF', 534, 148], ['DRIFT GROUND', 568, 222],
    ['COLD MOUTH', 430, 120], ['THE KETTLE', 250, 158], ['WIDOW ROCK', 92, 130],
    ['SHINGLE END', 172, 250], ['DEAD MAN BAR', 388, 132], ['THE SPOUT', 486, 240],
  ];
  // set of the tide: chains of arrows in green ink, with their rate
  const CURRENTS = [
    { pts: [[92, 124], [140, 132], [192, 130], [238, 140]], lab: '2 KN', k: 1 },
    { pts: [[352, 118], [402, 112], [452, 118], [498, 132]], lab: '1 1/2 KN', k: 1 },
    { pts: [[496, 208], [548, 216], [596, 210]], lab: '3 KN', k: -1 },
    { pts: [[232, 232], [288, 236], [336, 228]], lab: '1 KN', k: 1 },
  ];
  // prevailing winds, drawn as feathered barbs
  const WINDS = [[124, 40, -0.55], [316, 246, -0.30], [598, 58, 2.40], [64, 258, 0.15]];
  // what the otter wrote in the margins, once she had been there herself
  const NOTES = [
    { l: ['SHALLOW - I SCRAPED', 'MY BELLY RIGHT HERE'], x: 146, y: 166, c: 'red' },
    { l: ['GOOD KELP.', 'HIDE IN IT.'], x: 306, y: 206, c: 'green' },
    { l: ['THEY WATCH FROM', 'THIS HEADLAND'], x: 420, y: 100, c: 'violet' },
    { l: ['NO BOTTOM FOUND', 'AT 90 FATHOM'], x: 542, y: 140, c: 'blue' },
    { l: ['TIDE TURNS AT DUSK'], x: 96, y: 240, c: 'green' },
    { l: ['COUNTED 9 HULLS'], x: 258, y: 108, c: 'red' },
    { l: ['DO NOT GO BY NIGHT'], x: 502, y: 128, c: 'red' },
  ];
  const NOTE_INK = { red: P.red, green: P.green, violet: P.violet, blue: P.blue };

  // handwriting: the same bitmap face, but with the baseline walking a pixel
  // either way so a line of it reads as a hand rather than as type
  function hand(ctx, s, x, y, size, col) {
    let cx = x;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const dy = (i % 5 === 1 || i % 5 === 4) ? 1 : (i % 5 === 2 ? -1 : 0);
      if (ch !== ' ') txt(ctx, ch, cx, y + dy, size, { color: col, outline: P.sand });
      cx += mText(ch, size) + 1;
    }
    return cx - x;
  }
  // the wavy rule she scores under anything she means
  function squiggle(ctx, col, x, y, w) {
    for (let i = 0; i < w; i++) D1(ctx, col, x + i, y + (((i >> 1) % 3 === 1) ? 1 : 0));
  }
  // a tiny gabled shed, three or four pixels of it
  function shed(ctx, x, y, w, h, wall, roof) {
    R(ctx, wall, x, y - h, w, h);
    R(ctx, roof, x - 1, y - h - 1, w + 2, 1);
    R(ctx, roof, x, y - h - 2, w, 1);
    D1(ctx, P.ink, x, y - 1); D1(ctx, P.ink, x + w - 1, y - 1);
  }
  // a moored boat seen from above: hull, thwart and a mast shadow
  function skiff(ctx, x, y, f, col) {
    R(ctx, col, x, y, 5, 1);
    R(ctx, col, x + 1, y - 1, 3, 1);
    R(ctx, col, x + 1, y + 1, 3, 1);
    D1(ctx, P.ink, x + 2 + f, y);
    D1(ctx, P.sand, x + 2, y);
  }
  // hatched foul ground: diagonal ruling with a dotted limit, the way a
  // surveyor marks a bottom he does not trust
  function hatchShoal(ctx, mask, rf) {
    const x0 = Math.round((rf.x - rf.rx) * SC), x1 = Math.round((rf.x + rf.rx) * SC);
    const y0 = Math.round((rf.y - rf.ry) * SC), y1 = Math.round((rf.y + rf.ry) * SC);
    const cx0 = rf.x * SC, cy0 = rf.y * SC, rx = rf.rx * SC, ry = rf.ry * SC;
    const ya = Math.max(2, y0), yb = Math.min(SH_H * SC - 3, y1);
    for (let y = ya; y <= yb; y++) {
      const v = (y - cy0) / ry, vv = v * v;
      if (vv >= 1.14) continue;
      const half = rx * Math.sqrt(1.14 - vv);
      const xa = Math.max(2, Math.ceil(cx0 - half)), xb = Math.min(MAP_W * SC - 3, Math.floor(cx0 + half));
      // step straight down each ruling rather than testing every pixel
      for (let pass = 0; pass < 2; pass++) {
        const base = pass ? (y - 210) : -y;
        let x = xa + ((((base - xa) % 7) + 7) % 7);
        for (; x <= xb; x += 7) {
          const u = (x - cx0) / rx, rr = u * u + vv;
          if (rr > 1.14 || (pass && rr >= 0.55)) continue;
          if (rr > 0.94 && rr > 0.94 + vnoise(x * 0.04 + rf.seed, y * 0.04) * 0.2) continue;
          if (mask[((y / SC) | 0) * MAP_W + ((x / SC) | 0)]) continue;
          D1(ctx, (pass || rr > 0.6) ? P.blueL : P.blue, x, y);
        }
      }
    }
  }
  // an arrow chain: barbs along a polyline, feathered head at the far end
  function currentChain(ctx, c, col) {
    const pts = c.pts.map(p => [p[0] * SC, p[1] * SC]);
    for (let i = 0; i < pts.length - 1; i++) {
      line(ctx, col, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 3, 4, i * 2);
    }
    const a = pts[pts.length - 1], b = pts[pts.length - 2];
    const dx = a[0] - b[0], dy = a[1] - b[1], L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    for (let k = 1; k <= 5; k++) {
      D1(ctx, col, Math.round(a[0] - ux * k + nx * k * 0.75), Math.round(a[1] - uy * k + ny * k * 0.75));
      D1(ctx, col, Math.round(a[0] - ux * k - nx * k * 0.75), Math.round(a[1] - uy * k - ny * k * 0.75));
    }
    const mid = pts[(pts.length / 2) | 0];
    txt(ctx, c.lab, mid[0], mid[1] + (c.k > 0 ? -9 : 5), 5, { color: col, align: 'center' });
  }
  // a wind barb: a shaft with feathers down one side
  function windBarb(ctx, x, y, a) {
    const ca = Math.cos(a), sa = Math.sin(a), L = 26;
    const col = P.violet;
    line(ctx, col, x, y, x + ca * L, y + sa * L, 1, 0, 0);
    const nx = -sa, ny = ca;
    for (let k = 0; k < 4; k++) {
      const px = x + ca * (L - 4 - k * 5), py = y + sa * (L - 4 - k * 5);
      for (let j = 1; j <= 4; j++) D1(ctx, P.violetL, Math.round(px - ca * j * 0.5 + nx * j), Math.round(py - sa * j * 0.5 + ny * j));
    }
    for (let k = 1; k <= 4; k++) {
      D1(ctx, col, Math.round(x + ca * k + nx * k * 0.6), Math.round(y + sa * k + ny * k * 0.6));
      D1(ctx, col, Math.round(x + ca * k - nx * k * 0.6), Math.round(y + sa * k - ny * k * 0.6));
    }
  }
  // a slip of paper pinned to the sheet, with its own shadow and a pin
  function pinnedNote(ctx, x, y, w, h, lines, tilt) {
    for (let i = 0; i < h; i++) {
      const o = Math.round(i * tilt);
      R(ctx, P.shade, x + o + 2, y + i + 2, w, 1);
    }
    for (let i = 0; i < h; i++) {
      const o = Math.round(i * tilt);
      R(ctx, i < 2 || i > h - 3 ? P.beach : P.sand, x + o, y + i, w, 1);
      D1(ctx, P.tear, x + o, y + i); D1(ctx, P.tear, x + o + w - 1, y + i);
    }
    R(ctx, P.tear, x, y, w, 1); R(ctx, P.tear, x + Math.round((h - 1) * tilt), y + h - 1, w, 1);
    for (let i = 0; i < lines.length; i++) {
      hand(ctx, lines[i], x + 4 + Math.round((5 + i * 8) * tilt), y + 5 + i * 8, 5, P.ink);
    }
    const px = x + Math.round(w / 2), py = y + 2;
    disc(ctx, P.redD, px + 1, py + 1, 2);
    disc(ctx, P.red, px, py, 2);
    D1(ctx, P.redL, px - 1, py - 1);
  }

  function nearDetail(ctx, mask, dOut, keepOut) {
    const rng = new SeededRandom(24601);
    const water = (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < IN.x0 + 1 || yi < IN.y0 + 1 || xi > IN.x1 - 1 || yi > IN.y1 - 1) return -1;
      return mask[yi * MAP_W + xi] ? -1 : dOut[yi * MAP_W + xi];
    };

    // ---- hatched foul ground over every reef
    for (const rf of REEFS) hatchShoal(ctx, mask, rf);

    // ---- the set of the tide and the prevailing wind
    for (const c of CURRENTS) currentChain(ctx, c, P.green);
    for (const w of WINDS) windBarb(ctx, w[0] * SC, w[1] * SC, w[2]);

    // ---- harbours: sheds, jetties, moorings and boats at every place, and
    //      the lagoon the pair set out from
    const spots = DEST.map(d => ({ x: d.x, y: d.y, n: d.foes.length + 3, seed: d.x * 7 + d.y }))
      .concat([{ x: HOME.x, y: HOME.y, n: 3, seed: 991 }]);
    for (const s of spots) {
      const r2 = new SeededRandom(s.seed | 0);
      // which way the land lies, so the sheds go ashore and the boats afloat
      let lx = 0, ly = 0;
      for (let a = 0; a < 16; a++) {
        const th = a / 16 * TAU;
        for (let r = 3; r < 16; r++) {
          const xi = Math.round(s.x + Math.cos(th) * r), yi = Math.round(s.y + Math.sin(th) * r);
          if (xi < 1 || yi < 1 || xi >= MAP_W - 1 || yi >= MAP_H - 1) break;
          if (mask[yi * MAP_W + xi]) { lx += Math.cos(th); ly += Math.sin(th); break; }
        }
      }
      const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
      const bx = s.x * SC, by = s.y * SC;
      // a jetty or two, reaching out over the water
      for (let j = 0; j < 2; j++) {
        const th = Math.atan2(-ly, -lx) + r2.range(-0.7, 0.7);
        const L = r2.int(9, 16);
        const ex = Math.round(bx + Math.cos(th) * L), ey = Math.round(by + Math.sin(th) * L);
        line(ctx, P.ink2, bx, by, ex, ey, 1, 0, 0);
        line(ctx, P.inkL, bx, by + 1, ex, ey + 1, 2, 2, 0);
        for (let k = 3; k < L; k += 3) {
          D1(ctx, P.ink, Math.round(bx + Math.cos(th) * k), Math.round(by + Math.sin(th) * k + 2));
        }
      }
      // sheds along the shore, roofs in ochre and rust
      for (let k = 0; k < s.n + 2; k++) {
        const ox = Math.round(bx + lx * r2.range(2, 13) + r2.range(-9, 9));
        const oy = Math.round(by + ly * r2.range(2, 13) + r2.range(-8, 8));
        if (!mask[Math.round(oy / SC) * MAP_W + Math.round(ox / SC)]) continue;
        const wq = r2.int(3, 6), hq = r2.int(2, 4);
        shed(ctx, ox, oy, wq, hq, r2.next() < 0.5 ? P.sand : P.beach, r2.next() < 0.45 ? P.red : P.ink2);
      }
      // boats at their moorings, and the buoys they are tied to
      for (let k = 0; k < s.n; k++) {
        const th = Math.atan2(-ly, -lx) + r2.range(-1.5, 1.5);
        const r = r2.range(6, 20);
        const ox = Math.round(bx + Math.cos(th) * r), oy = Math.round(by + Math.sin(th) * r);
        if (water(ox / SC, oy / SC) < 1) continue;
        skiff(ctx, ox, oy, r2.next() < 0.5 ? -1 : 1, r2.next() < 0.4 ? P.redD : P.ink2);
        if (r2.next() < 0.5) { D1(ctx, P.red, ox + 7, oy + 1); D1(ctx, P.ink, ox + 7, oy + 2); }
      }
    }

    // ---- coves, rocks and grounds, named in a small hand
    for (const [nm, cx0, cy0] of COVES) {
      let px = -1, py = -1;
      for (let r = 0; r < 12 && px < 0; r++) {
        for (let a = 0; a < 12; a++) {
          const x = Math.round(cx0 + Math.cos(a / 12 * TAU) * r), y = Math.round(cy0 + Math.sin(a / 12 * TAU) * r);
          const d = water(x, y);
          if (d >= 2 && d <= 11) { px = x; py = y; break; }
        }
      }
      if (px < 0) continue;
      const w = mText(nm, 5);
      const right = px < MAP_W - 90;
      const lx = right ? px + 5 : px - 5 - w;
      D1(ctx, P.ink, px * SC, py * SC);
      box(ctx, P.ink2, px * SC - 1, py * SC - 1, 3, 3);
      R(ctx, P.blueD, (right ? px * SC + 2 : px * SC - 3), py * SC, 2, 1);
      txt(ctx, nm, lx * SC + (right ? 0 : w - w), py * SC - 2, 5, { color: P.blueD, outline: P.sand });
    }

    // ---- a second, finer set of soundings in blue between the survey's own
    for (let gy = IN.y0 + 24; gy < IN.y1 - 10; gy += 24) {
      for (let gx = IN.x0 + 28; gx < IN.x1 - 14; gx += 30) {
        const x = Math.round(gx + rng.range(-9, 9)), y = Math.round(gy + rng.range(-8, 8));
        if (rng.next() < 0.22) continue;
        const cl = clearance(dOut, mask, x, y);
        if (cl < 3) continue;
        let clash = false;
        for (const k of keepOut) if (Math.abs(x - k.x) < k.rx && Math.abs(y - k.y) < k.ry) { clash = true; break; }
        if (clash) continue;
        const v = Math.max(2, Math.round(cl * 1.15 + vnoise(x * 0.04, y * 0.04) * 11));
        const frac = rng.int(1, 9);
        txt(ctx, v + '_' + frac, x * SC, y * SC, 4, { color: P.blueL, align: 'center' });
      }
    }

    // ---- the otter's own notes, shifted clear of the land she was writing
    //      about, and underscored where she meant it
    for (const n of NOTES) {
      let nx = n.x, ny = n.y, ok = false;
      const wide = Math.ceil(Math.max.apply(null, n.l.map(t => mText(t, 5) + t.length)) / SC);
      for (let k = 0; k < 26 && !ok; k++) {
        const ty = ny + (k >> 1) * (k & 1 ? -5 : 5) * 0.5;
        ok = true;
        for (let c = 0; c <= wide; c += 6) {
          for (let r = 0; r < n.l.length; r++) {
            const xi = Math.round(nx + c), yi = Math.round(ty + r * 4);
            if (xi < IN.x0 || xi > IN.x1 || yi < IN.y0 || yi > IN.y1 || mask[yi * MAP_W + xi]) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (ok) ny = ty;
      }
      if (!ok) continue;
      const col = NOTE_INK[n.c] || P.ink;
      for (let r = 0; r < n.l.length; r++) {
        const w = hand(ctx, n.l[r], nx * SC, (ny + r * 7) * SC, 5, col);
        if (n.c === 'red' && r === n.l.length - 1) squiggle(ctx, col, nx * SC, (ny + r * 7) * SC + 7, w - 2);
      }
    }

    // ---- two slips pinned to the sheet
    pinnedNote(ctx, 92 * SC, 234 * SC, 92, 30, ['SHE IS ALIVE.', 'THEY TOOK HER EAST.'], 0.06);
    pinnedNote(ctx, 494 * SC, 36 * SC, 86, 30, ['SIX PORTS.', 'THEN THE CHIEF.'], -0.05);

    // ---- ink blots and a thumbprint, because she was in a hurry
    for (const [bx, by, br] of [[300, 70, 5], [176, 196, 4], [560, 96, 3]]) {
      for (let y = -br * 2; y <= br * 2; y++) for (let x = -br * 2; x <= br * 2; x++) {
        const rr = Math.hypot(x, y) / SC - br * (0.6 + vnoise(x * 0.2 + bx, y * 0.2) * 0.5);
        if (rr > 0) continue;
        if (rr > -0.8 && hash2(x * 7 + bx, y * 5) > 0.5) continue;
        D1(ctx, hash2(x, y) > 0.8 ? P.ink2 : P.ink, bx * SC + x, by * SC + y);
      }
    }
  }

  function buildChart(self) {
    // the table is its own plate: it does not move when the sheet is dragged
    const out = can(640, 360), octx = out.getContext('2d');
    paintTable(octx);

    // ---- paper, land and everything inked on it, baked at SC px to the unit
    const chart = can(MAP_W * SC, SH_H * SC), cx = chart.getContext('2d');
    cx.imageSmoothingEnabled = false;
    // survey coordinates: everything the old chart drew is drawn at SC times
    // its size, which for integer fillRects is an exact, hard-edged blow-up
    const up = () => { cx.setTransform(SC, 0, 0, SC, 0, 0); };
    const nat = () => { cx.setTransform(1, 0, 0, 1, 0, 0); };
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

    paintSea(cx, mask, dOut);                 // native bake resolution
    up();
    drawRhumbs(cx);
    drawGraticule(cx);
    drawContours(cx, mask, dOut, oc);

    const land = paintLand(mask, dIn, dOut, hgt);
    land.ctx.setTransform(SC, 0, 0, SC, 0, 0);
    dressLand(land.ctx, mask, dIn, hgt);
    land.ctx.setTransform(1, 0, 0, 1, 0, 0);
    nat(); cx.drawImage(land.c, 0, 0); up();

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
      const rx = dd.k === 'serpent' ? 62 : dd.k === 'whale' ? 38 : dd.k === 'lugger' ? 34 : 20;
      const ry = dd.k === 'serpent' ? 34 : dd.k === 'whale' ? 30 : dd.k === 'lugger' ? 26 : 18;
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

    // ---- everything that only exists close up, inked at bake resolution so
    // it stays fine print however far the chart is enlarged
    nat();
    nearDetail(cx, mask, dOut, keepOut);
    up();

    // ---- tear the sheet out of its rectangle
    for (let x = 0; x < MAP_W; x++) {
      const t = PAPER.y0 + tearTop(x), b = PAPER.y1 - tearBot(x);
      cx.clearRect(x, 0, 1, t);
      cx.clearRect(x, b + 1, 1, SH_H - b);
      D1(cx, P.tear, x, t); D1(cx, P.tear, x, b);
      if (hash2(x * 7, 11) > 0.6) D1(cx, P.beach, x, t + 1);
      if (hash2(x * 7, 23) > 0.6) D1(cx, P.beach, x, b - 1);
    }
    for (let y = 0; y < MAP_H; y++) {
      const l = PAPER.x0 + tearLft(y), r = PAPER.x1 - tearRgt(y);
      if (y > PAPER.y0 + 4 && y < PAPER.y1 - 4) {
        cx.clearRect(0, y, l, 1);
        cx.clearRect(r + 1, y, MAP_W - r, 1);
        D1(cx, P.tear, l, y); D1(cx, P.tear, r, y);
        if (hash2(y * 5, 31) > 0.6) D1(cx, P.beach, l + 1, y);
      }
    }

    // ---- the shadow the sheet throws on the table, carried with the sheet
    for (let x = PAPER.x0 + 3; x < MAP_W; x++) {
      const b = PAPER.y1 - tearBot(x);
      for (let k = 1; k <= 4; k++) {
        if (hash2(x * 5, (b + k) * 3) < 0.12) continue;
        D1(cx, hash2(x, b + k) > 0.7 ? P.tableD : P.tableG, x, b + k);
      }
    }
    for (let y = PAPER.y0 + 3; y <= PAPER.y1; y++) {
      const r = PAPER.x1 - tearRgt(y);
      for (let k = 1; k <= 4; k++) {
        if (r + k >= MAP_W || hash2((r + k) * 5, y * 3) < 0.12) continue;
        D1(cx, hash2(r + k, y) > 0.7 ? P.tableD : P.tableG, r + k, y);
      }
    }

    // brass tacks, one to each corner, pinning the sheet down
    drawTack(cx, PAPER.x0 + 9, PAPER.y0 + 8);
    drawTack(cx, PAPER.x1 - 9, PAPER.y0 + 8);
    drawTack(cx, PAPER.x0 + 9, PAPER.y1 - 8);
    drawTack(cx, PAPER.x1 - 9, PAPER.y1 - 8);
    nat();

    self.mask = mask; self.dOut = dOut; self.ocean = oc;
    self.nav = navGrid(mask, dOut);
    self.table = out; self.sheet = chart; self.sheetFar = null; self.mini = null;
    return out;
  }

  // =========================================================================
  //  PORT MARKERS
  // =========================================================================
  // the label is chrome, not chart: it is laid out in screen pixels around
  // wherever the mark has landed, so it stays the same size at every zoom
  function plaqueRect(d, x, y) {
    const w = d.plaqW, h = 13;
    if (d.lab === 'right') return { x: x + 12, y: y - 6, w: w, h: h };
    if (d.lab === 'left') return { x: x - 12 - w, y: y - 6, w: w, h: h };
    if (d.lab === 'above') return { x: Math.round(x - w / 2), y: y - 12 - h, w: w, h: h };
    return { x: Math.round(x - w / 2), y: y + 11, w: w, h: h };
  }

  // a parchment tab with a folded corner and a chapter roundel — a chart
  // label, not a menu item
  function drawPlaque(ctx, d, sel, hov) {
    const r = d.prect, on = d.unlocked;
    if (!r) return;
    const body = sel ? P.sand : on ? P.beach : '#cfc6ac';
    const edge = sel ? P.red : on ? P.ink : P.greyD;
    const tint = on ? P.ink : P.greyD;
    R(ctx, P.shade, r.x + 1, r.y + r.h, r.w - 1, 1);
    R(ctx, P.shade, r.x + r.w, r.y + 1, 1, r.h - 1);
    R(ctx, body, r.x, r.y, r.w, r.h);
    box(ctx, edge, r.x, r.y, r.w, r.h);
    if (sel) box(ctx, P.redD, r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    else if (hov) box(ctx, P.goldL, r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    // the dog-eared corner
    for (let i = 0; i < 4; i++) {
      R(ctx, P.beach, r.x + r.w - 1 - i, r.y + r.h - 4 + i, i + 1, 1);
      D1(ctx, edge, r.x + r.w - 1 - i, r.y + r.h - 5 + i);
    }
    // chapter roundel, illuminated the way a capital would be
    disc(ctx, on ? P.red : P.grey, r.x + 7, r.y + 6, 5);
    ring(ctx, on ? P.goldL : P.greyL, r.x + 7, r.y + 6, 4, 0);
    ring(ctx, P.ink, r.x + 7, r.y + 6, 5, 0);
    txt(ctx, d.chapter, r.x + 7, r.y + 3, 5, { color: on ? '#ffe9b4' : '#e3e6ec', align: 'center' });
    txt(ctx, d.name, r.x + 15, r.y + 4, 6, { color: tint });
    if (!on) {
      // a blob of wax, pressed with a broken-net sigil
      const wx = r.x + r.w - 9, wy = r.y + 6;
      disc(ctx, P.redD, wx, wy, 4);
      disc(ctx, P.wax, wx, wy, 3);
      D1(ctx, P.wax, wx - 4, wy); D1(ctx, P.wax, wx + 4, wy);
      D1(ctx, P.wax, wx, wy - 4); D1(ctx, P.wax, wx, wy + 4);
      D1(ctx, P.waxL, wx - 1, wy - 2); D1(ctx, P.waxL, wx, wy - 2);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 2]]) D1(ctx, P.redD, wx + dx, wy + dy);
    }
  }

  function drawPort(ctx, d, T, sel, hov) {
    const x = d.sx, y = d.sy, on = d.unlocked;
    const ink = on ? P.ink : P.greyD;
    // the surveyed position: a circled dot with its cross of ticks
    disc(ctx, P.sand, x, y, 4);
    ring(ctx, ink, x, y, 4, 0);
    ring(ctx, ink, x, y, 3, 0);
    R(ctx, ink, x - 7, y, 3, 1); R(ctx, ink, x + 5, y, 3, 1);
    R(ctx, ink, x, y - 7, 1, 3); R(ctx, ink, x, y + 5, 1, 3);
    if (on) { disc(ctx, P.red, x, y, 2); D1(ctx, P.redL, x, y - 1); }
    else {
      for (let k = -6; k <= 6; k++) { D1(ctx, P.greyD, x + k, y - k); D1(ctx, P.sand, x + k, y - k + 1); }
      disc(ctx, P.grey, x, y, 2); D1(ctx, P.greyD, x, y);
    }
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
  // the brass instruments pinned over the chart: zoom in, zoom out, fit
  const BTN_ZOOM = [
    { x: 610, y: 38, w: 18, h: 18, k: 'in' },
    { x: 610, y: 60, w: 18, h: 18, k: 'out' },
    { x: 610, y: 82, w: 18, h: 18, k: 'fit' },
  ];
  const MINI = { x: 640 - (MAP_W >> 2) - 7, y: 194, w: MAP_W >> 2, h: SH_H >> 2 };

  const WorldMap = {
    ready: false, action: null, selected: 0, destinations: DEST,
    T: 0, routeT: 0, travel: 0, hover: -1, denyT: 0, chart: null,
    mask: null, dOut: null, shimmer: [], ships: [], unlockedCount: 1,
    // ---- the camera over the sheet
    zi: 1, ziLast: 1, cam: { x: 320, y: 138 }, camT: { x: 320, y: 138 }, ox: 0, oy: 0,
    dragging: false, overZoom: -1, overMini: false, lastUpdate: 0,
    ptrOn: false, taps: [], hintT: 0, labs: [], table: null, sheet: null, sheetFar: null, mini: null,

    // ---------------------------------------------------------------- init
    init() {
      if (this.ready) return; this.ready = true;
      buildSprites();
      for (let i = 0; i < DEST.length; i++) {
        const d = DEST[i];
        if (d.unlocked === undefined) d.unlocked = i === 0;
        d.plaqW = 30 + mText(d.name, 6);
        d.lines = wrapText(null, d.blurb, 286, 6).slice(0, 3);
      }
      this.chart = buildChart(this);          // this also snaps the ports to the coast
      for (const d of DEST) {
        // the label is laid out afresh each frame, in screen pixels; this is
        // only the standing chart-space hit box the old API promised
        d.prect = null; d.sx = Math.round(d.x); d.sy = Math.round(d.y);
        d.hit = { x: d.x - 16, y: d.y - 16, w: 32, h: 32 };
        d.shit = { x: 0, y: 0, w: 0, h: 0 };
      }
      this.attachPointer();
      // sea roads from the lagoon to every port
      for (const d of DEST) {
        const rt = buildRoute(this.mask, this.dOut, this.nav, HOME, d);
        d.route = rt.pts; d.routeLen = rt.len; d.book = rt.book;
        const ang = Math.atan2(d.y - HOME.y, d.x - HOME.x) * 180 / Math.PI;
        d.brg = ((Math.round(ang) + 90) % 360 + 360) % 360;
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
      // the sheet opens close in, over wherever the hunt has got to
      this.zi = 1; this.hintT = 5;
      this.lookAt(DEST[this.selected], true);
      this.taps.length = 0; this.dragging = false;
    },
    consume() { this.action = null; },

    // ----------------------------------------------------------- the camera
    // The fit and thumbnail plates are exact integer reductions of the bake,
    // resampled point for point; they are only cut when a zoom first asks.
    reduced(div) {
      const key = div === 2 ? 'sheetFar' : 'mini';
      if (this[key]) return this[key];
      const w = Math.round(MAP_W * SC / div), h = Math.round(SH_H * SC / div);
      const c = can(w, h), x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(this.sheet, 0, 0, MAP_W * SC, SH_H * SC, 0, 0, w, h);
      this[key] = c;
      return c;
    },
    zoom() { return ZOOMS[clamp(this.zi, 0, ZOOMS.length - 1)]; },
    // keep the visible rectangle on the sheet, or centre it if it will not fill
    clampCam(c) {
      const Z = this.zoom(), hw = VIEW.w / (2 * Z), hh = VIEW.h / (2 * Z);
      const x0 = PAPER.x0 - 3, x1 = PAPER.x1 + 4, y0 = PAPER.y0 - 3, y1 = PAPER.y1 + 5;
      c.x = (x1 - x0 <= hw * 2) ? (x0 + x1) / 2 : clamp(c.x, x0 + hw, x1 - hw);
      c.y = (y1 - y0 <= hh * 2) ? (y0 + y1) / 2 : clamp(c.y, y0 + hh, y1 - hh);
      return c;
    },
    // The target is kept as the place the chart WANTS centred, unclamped, so
    // that a port held off the edge at one zoom is still remembered at the
    // next: only the camera itself is ever pinned to the sheet.
    lookAt(d, now) {
      // the label hangs below the mark, so sit the mark a little high
      this.camT.x = d.x; this.camT.y = d.y + 3;
      if (now) { this.cam.x = this.camT.x; this.cam.y = this.camT.y; this.clampCam(this.cam); }
    },
    setZoom(zi, ax, ay) {
      const z0 = this.zoom();
      const nz = clamp(zi, 0, ZOOMS.length - 1);
      if (nz === this.zi) return;
      // hold whatever is under the given screen point still while zooming
      let cx = this.cam.x, cy = this.cam.y;
      if (ax !== undefined) {
        const wx = (ax - this.ox) / z0, wy = (ay - this.oy) / z0;
        const z1 = ZOOMS[nz];
        cx = wx - (ax - VIEW.x - VIEW.w / 2) / z1;
        cy = wy - (ay - VIEW.y - VIEW.h / 2) / z1;
      }
      this.zi = nz;
      if (ax !== undefined) {
        // wheel and pinch hold a point still, so the camera lands where it is
        this.cam.x = cx; this.cam.y = cy;
        this.clampCam(this.cam);
        this.camT.x = this.cam.x; this.camT.y = this.cam.y;
      } else {
        // a key or a button keeps whatever the camera was already making for
        this.clampCam(this.cam);
      }
      if (typeof Audio_ !== 'undefined' && Audio_.tone) Audio_.tone(nz > this.ziLast ? 700 : 480, 0.04, 'square', 0.05);
      this.ziLast = nz;
    },
    toScreen(x, y) { return { x: Math.round(x * this.zoom() + this.ox), y: Math.round(y * this.zoom() + this.oy) }; },
    toChart(x, y) { const Z = this.zoom(); return { x: (x - this.ox) / Z, y: (y - this.oy) / Z }; },

    // ------------------------------------------------------- pointer / touch
    // Drag to pan, pinch to zoom, tap to choose.  Input's own click fires on
    // press, which cannot tell a tap from the start of a drag, so the chart
    // keeps its own tap detector and ignores that one when this is running.
    attachPointer() {
      if (this.ptrOn) return;
      const c = (typeof Input !== 'undefined' && Input.canvas) || (typeof document !== 'undefined' && document.getElementById('screen'));
      if (!c || !c.addEventListener) return;
      this.ptrOn = true;
      const self = this;
      const live = () => self.ready && (typeof performance !== 'undefined') && (performance.now() - self.lastUpdate) < 300;
      const loc = (cx, cy) => {
        const r = c.getBoundingClientRect();
        return { x: (cx - r.left) / r.width * 640, y: (cy - r.top) / r.height * 360 };
      };
      const pts = new Map();
      let pinch = 0;
      const down = (id, cx, cy) => {
        if (!live()) return;
        const p = loc(cx, cy);
        pts.set(id, { x: p.x, y: p.y, x0: p.x, y0: p.y, t: performance.now(), moved: 0 });
        if (pts.size === 2) { const a = [...pts.values()]; pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
      };
      const move = (id, cx, cy) => {
        const t = pts.get(id); if (!t || !live()) return;
        const p = loc(cx, cy);
        const dx = p.x - t.x, dy = p.y - t.y;
        t.moved += Math.abs(dx) + Math.abs(dy);
        t.x = p.x; t.y = p.y;
        if (pts.size >= 2) {
          const a = [...pts.values()];
          const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
          if (pinch > 4 && d / pinch > 1.55) { self.setZoom(self.zi + 1, (a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2); pinch = d; }
          else if (pinch > 4 && d / pinch < 0.66) { self.setZoom(self.zi - 1, (a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2); pinch = d; }
          return;
        }
        if (t.moved < 4) return;
        if (self.overMini && t.y0 >= MINI.y - 4 && t.x0 >= MINI.x - 4) { self.miniDrag(p.x, p.y); return; }
        if (t.y0 > VIEW.y + VIEW.h) return;         // the card does not pan
        self.dragging = true;
        const Z = self.zoom();
        self.cam.x -= dx / Z; self.cam.y -= dy / Z;
        self.clampCam(self.cam);
        self.camT.x = self.cam.x; self.camT.y = self.cam.y;
      };
      const up = (id) => {
        const t = pts.get(id); if (!t) return;
        pts.delete(id);
        if (pts.size < 2) pinch = 0;
        if (pts.size === 0) self.dragging = false;
        if (!live()) return;
        if (t.moved < 5 && performance.now() - t.t < 700) self.taps.push({ x: t.x, y: t.y });
      };
      if (typeof window !== 'undefined' && window.PointerEvent) {
        c.addEventListener('pointerdown', e => down(e.pointerId, e.clientX, e.clientY));
        c.addEventListener('pointermove', e => move(e.pointerId, e.clientX, e.clientY));
        const u = e => up(e.pointerId);
        c.addEventListener('pointerup', u);
        c.addEventListener('pointercancel', u);
        window.addEventListener('pointerup', u);
      } else {
        c.addEventListener('mousedown', e => down('m', e.clientX, e.clientY));
        c.addEventListener('mousemove', e => move('m', e.clientX, e.clientY));
        window.addEventListener('mouseup', () => up('m'));
        const each = (e, fn) => { for (let i = 0; i < e.changedTouches.length; i++) { const t = e.changedTouches[i]; fn(t.identifier, t.clientX, t.clientY); } };
        c.addEventListener('touchstart', e => { each(e, down); e.preventDefault(); }, { passive: false });
        c.addEventListener('touchmove', e => { each(e, move); e.preventDefault(); }, { passive: false });
        c.addEventListener('touchend', e => each(e, (id) => up(id)));
        c.addEventListener('touchcancel', e => each(e, (id) => up(id)));
      }
    },
    // dragging inside the thumbnail flies the camera straight there
    miniDrag(sx, sy) {
      this.camT.x = clamp((sx - MINI.x) * 4, 0, MAP_W);
      this.camT.y = clamp((sy - MINI.y) * 4, 0, SH_H);
      this.clampCam(this.camT);
      this.cam.x = this.camT.x; this.cam.y = this.camT.y;
    },

    // -------------------------------------------------------------- update
    select(i) {
      if (i < 0 || i >= DEST.length) return;
      if (i === this.selected) { this.lookAt(DEST[i]); return; }
      this.selected = i; this.routeT = 0; this.travel = 0;
      this.lookAt(DEST[i]);                       // the view follows the choice
      if (typeof Audio_ !== 'undefined' && Audio_.tone) Audio_.tone(520, 0.05, 'square', 0.07);
    },
    // where a press landed, in 640x360 screen pixels
    press(mx, my) {
      if (hitR({ x: mx, y: my }, BTN_BACK.x, BTN_BACK.y, BTN_BACK.w, BTN_BACK.h)) { this.back(); return; }
      if (hitR({ x: mx, y: my }, BTN_SAIL.x, BTN_SAIL.y, BTN_SAIL.w, BTN_SAIL.h)) { this.launch(); return; }
      for (let i = 0; i < BTN_ZOOM.length; i++) {
        const b = BTN_ZOOM[i];
        if (!hitR({ x: mx, y: my }, b.x, b.y, b.w, b.h)) continue;
        if (b.k === 'in') this.setZoom(this.zi + 1, VIEW.w / 2, VIEW.h / 2);
        else if (b.k === 'out') this.setZoom(this.zi - 1, VIEW.w / 2, VIEW.h / 2);
        // the frame key throws the whole sheet up, and brings it back to the
        // port it was showing
        else if (this.zi === 0) { this.setZoom(1); this.lookAt(DEST[this.selected], true); }
        else this.setZoom(0);
        return;
      }
      if (hitR({ x: mx, y: my }, MINI.x, MINI.y, MINI.w, MINI.h)) { this.miniDrag(mx, my); return; }
      for (let i = 0; i < DEST.length; i++) {
        const h = DEST[i].shit;
        if (!h.w || !hitR({ x: mx, y: my }, h.x, h.y, h.w, h.h)) continue;
        if (i === this.selected && DEST[i].unlocked && this.routeT >= 1) this.launch();
        else this.select(i);
        return;
      }
    },
    // project every mark and lay its label out, in screen pixels
    layout() {
      const Z = this.zoom();
      this.ox = Math.round(VIEW.x + VIEW.w / 2 - this.cam.x * Z);
      this.oy = Math.round(VIEW.y + VIEW.h / 2 - this.cam.y * Z);
      for (const d of DEST) {
        d.sx = Math.round(d.x * Z) + this.ox;
        d.sy = Math.round(d.y * Z) + this.oy;
        const vis = d.sx > VIEW.x - 30 && d.sx < VIEW.x + VIEW.w + 30 && d.sy > VIEW.y - 24 && d.sy < VIEW.y + VIEW.h + 24;
        if (!vis) { d.prect = null; d.shit = { x: 0, y: 0, w: 0, h: 0 }; continue; }
        const r = plaqueRect(d, d.sx, d.sy);
        r.x = clamp(r.x, VIEW.x + 3, VIEW.x + VIEW.w - r.w - 3);
        r.y = clamp(r.y, VIEW.y + 3, VIEW.y + VIEW.h - r.h - 3);
        // nothing slides in under the brass keys or the thumbnail
        if (r.y + r.h > BTN_ZOOM[0].y - 4 && r.y < BTN_ZOOM[2].y + BTN_ZOOM[2].h + 4 && r.x + r.w > BTN_ZOOM[0].x - 4) {
          r.x = BTN_ZOOM[0].x - 4 - r.w;
        }
        if (this.zi > 0 && r.y + r.h > MINI.y - 14 && r.y < MINI.y + MINI.h + 3 &&
            r.x < MINI.x + MINI.w + 3 && r.x + r.w > MINI.x - 3) {
          if (MINI.x - 6 - r.w >= VIEW.x + 3) r.x = MINI.x - 6 - r.w;
          else r.y = MINI.y - 16 - r.h;
        }
        d.prect = r;
        const x0 = Math.min(d.sx - 12, r.x), y0 = Math.min(d.sy - 14, r.y);
        const x1 = Math.max(d.sx + 12, r.x + r.w), y1 = Math.max(d.sy + 12, r.y + r.h);
        d.shit = { x: x0, y: y0, w: Math.max(18, x1 - x0), h: Math.max(18, y1 - y0) };
      }
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
      this.lastUpdate = (typeof performance !== 'undefined') ? performance.now() : 0;
      this.selected = clamp(this.selected | 0, 0, DEST.length - 1);
      this.T += dt;
      this.denyT = Math.max(0, this.denyT - dt);
      this.hintT = Math.max(0, this.hintT - dt);
      const m = Input.mouse;

      // ---- camera eases on to whatever was chosen, then snaps to a pixel
      const k = Math.min(1, dt * 9);
      this.cam.x += (this.camT.x - this.cam.x) * k;
      this.cam.y += (this.camT.y - this.cam.y) * k;
      if (Math.abs(this.camT.x - this.cam.x) < 0.02) this.cam.x = this.camT.x;
      if (Math.abs(this.camT.y - this.cam.y) < 0.02) this.cam.y = this.camT.y;
      this.clampCam(this.cam);
      this.layout();

      // ---- markers
      this.hover = -1;
      for (let i = 0; i < DEST.length; i++) {
        const h = DEST[i].shit;
        if (h.w && hitR(m, h.x, h.y, h.w, h.h)) this.hover = i;
      }
      const overSail = hitR(m, BTN_SAIL.x, BTN_SAIL.y, BTN_SAIL.w, BTN_SAIL.h);
      const overBack = hitR(m, BTN_BACK.x, BTN_BACK.y, BTN_BACK.w, BTN_BACK.h);
      this.overSail = overSail; this.overBack = overBack;
      this.overZoom = -1;
      for (let i = 0; i < BTN_ZOOM.length; i++) {
        const b = BTN_ZOOM[i];
        if (hitR(m, b.x, b.y, b.w, b.h)) this.overZoom = i;
      }
      this.overMini = this.zi > 0 && hitR(m, MINI.x, MINI.y, MINI.w, MINI.h);

      // ---- presses.  The chart's own tap detector owns the click when it is
      //      running, because Input fires on press and cannot see a drag.
      const taps = this.taps.length ? this.taps.splice(0, this.taps.length)
        : (!this.ptrOn && m.clicked ? [{ x: m.x, y: m.y }] : []);
      for (const tp of taps) this.press(tp.x, tp.y);

      // ---- wheel zooms about the cursor
      if (Input.wheel) this.setZoom(this.zi - Input.wheel, m.x, m.y);

      // ---- keys
      if (Input.hit) {
        if (Input.hit('ArrowRight') || Input.hit('KeyD')) this.step(1, 0);
        if (Input.hit('ArrowLeft') || Input.hit('KeyA')) this.step(-1, 0);
        if (Input.hit('ArrowDown') || Input.hit('KeyS')) this.step(0, 1);
        if (Input.hit('ArrowUp') || Input.hit('KeyW')) this.step(0, -1);
        if (Input.hit('Equal') || Input.hit('NumpadAdd')) this.setZoom(this.zi + 1);
        if (Input.hit('Minus') || Input.hit('NumpadSubtract')) this.setZoom(this.zi - 1);
        if (Input.hit('KeyZ')) { this.setZoom(this.zi === 0 ? 1 : 0); if (this.zi) this.lookAt(DEST[this.selected]); }
        if (Input.hit('Home') || Input.hit('KeyC')) this.lookAt(DEST[this.selected]);
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
      this.layout();
      const T = this.T, Z = this.zoom();
      // ---- the table the sheet is lying on, which never moves
      ctx.drawImage(this.table, 0, 0);

      ctx.save();
      ctx.beginPath(); ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); ctx.clip();
      // ---- the sheet, blitted at a whole-number scale out of the bake so no
      //      edge is ever resampled: the fit view is the exact half plate, the
      //      close view the plate itself, the magnified view a doubled plate
      const img = (Z === 1) ? this.reduced(2) : this.sheet;
      const ippu = (Z === 1) ? 1 : SC;            // image pixels to the unit
      const k = Z / ippu;                         // 1 or 2, never a fraction
      let sx0 = Math.max(0, Math.floor((VIEW.x - this.ox) / k));
      let sy0 = Math.max(0, Math.floor((VIEW.y - this.oy) / k));
      const sx1 = Math.min(img.width, Math.ceil((VIEW.x + VIEW.w - this.ox) / k));
      const sy1 = Math.min(img.height, Math.ceil((VIEW.y + VIEW.h - this.oy) / k));
      if (sx1 > sx0 && sy1 > sy0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0,
          this.ox + sx0 * k, this.oy + sy0 * k, (sx1 - sx0) * k, (sy1 - sy0) * k);
      }

      // ---- everything that lives on the chart, in chart units
      ctx.save();
      ctx.translate(this.ox, this.oy); ctx.scale(Z, Z);
      this.drawShips(ctx, T);
      // the places themselves, inked above their marks
      for (const d of DEST) {
        const gl = S.place[d.kind];
        if (gl) ctx.drawImage(d.unlocked ? gl.on : gl.off, d.x - gl.ax, d.y - gl.ay);
      }
      this.drawHome(ctx, T);
      this.drawRoute(ctx, T);
      this.drawToken(ctx, T);
      ctx.restore();

      // ---- the marks and their labels, in screen pixels at every zoom
      this.drawShimmer(ctx, T);
      this.drawTags(ctx);
      for (let i = 0; i < DEST.length; i++) {
        if (i === this.selected || !DEST[i].prect) continue;
        drawPort(ctx, DEST[i], T, false, this.hover === i);
      }
      if (DEST[this.selected].prect) drawPort(ctx, DEST[this.selected], T, true, false);
      for (let i = 0; i < DEST.length; i++) {
        if (i === this.selected) continue;
        drawPlaque(ctx, DEST[i], false, this.hover === i);
      }
      drawPlaque(ctx, DEST[this.selected], true, false);
      ctx.restore();

      this.drawMini(ctx);
      this.drawZoomKeys(ctx);
      this.drawCard(ctx, T);
      // BACK, pinned over the chart's top-right corner
      UIKit.button(ctx, BTN_BACK.x, BTN_BACK.y, BTN_BACK.w, BTN_BACK.h, 'BACK',
        this.overBack ? (Input.mouse.down ? 'pressed' : 'hover') : 'normal');
      void t;
    },

    // a brass thumb-wheel for the zoom, and the thumbnail of the whole sheet
    drawZoomKeys(ctx) {
      for (let i = 0; i < BTN_ZOOM.length; i++) {
        const b = BTN_ZOOM[i], over = this.overZoom === i;
        const dead = (b.k === 'in' && this.zi >= ZOOMS.length - 1) || (b.k === 'out' && this.zi <= 0);
        R(ctx, P.tableG, b.x + 1, b.y + 1, b.w, b.h);
        R(ctx, dead ? P.brassD : over ? P.brassL : P.brass, b.x, b.y, b.w, b.h);
        box(ctx, P.tableD, b.x, b.y, b.w, b.h);
        box(ctx, dead ? P.brassD : P.brassL, b.x + 1, b.y + 1, b.w - 2, b.h - 2);
        const cx = b.x + 9, cy = b.y + 9, ink = dead ? '#8a6a20' : P.tableD;
        if (b.k === 'fit') {
          box(ctx, ink, cx - 5, cy - 4, 11, 9);
          R(ctx, ink, cx - 2, cy - 1, 5, 3);
        } else {
          ring(ctx, ink, cx - 1, cy - 1, 4, 0);
          R(ctx, ink, cx + 2, cy + 2, 4, 2);
          R(ctx, ink, cx - 3, cy - 1, 5, 1);
          if (b.k === 'in') R(ctx, ink, cx - 1, cy - 3, 1, 5);
        }
      }
    },
    drawMini(ctx) {
      if (this.zi === 0) return;
      const thumb = this.reduced(8);
      const M = MINI;
      R(ctx, P.tableG, M.x - 2, M.y - 2, M.w + 5, M.h + 5);
      R(ctx, P.tableL, M.x - 2, M.y - 2, M.w + 4, M.h + 4);
      box(ctx, P.brassD, M.x - 2, M.y - 2, M.w + 4, M.h + 4);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(thumb, M.x, M.y);
      // the window the chart is showing, and the ports inside it
      const Z = this.zoom();
      const vw = Math.max(6, Math.round(VIEW.w / Z / 4)), vh = Math.max(5, Math.round(VIEW.h / Z / 4));
      const vx = clamp(Math.round(this.cam.x / 4 - vw / 2) + M.x, M.x, M.x + M.w - vw);
      const vy = clamp(Math.round(this.cam.y / 4 - vh / 2) + M.y, M.y, M.y + M.h - vh);
      box(ctx, P.red, vx, vy, vw, vh);
      box(ctx, '#ffe9b4', vx - 1, vy - 1, vw + 2, vh + 2);
      for (let i = 0; i < DEST.length; i++) {
        const d = DEST[i];
        const px = M.x + Math.round(d.x / 4), py = M.y + Math.round(d.y / 4);
        D1(ctx, d.unlocked ? P.red : P.greyD, px, py);
        if (i === this.selected) { box(ctx, '#ffe9b4', px - 1, py - 1, 3, 3); }
      }
      if (this.hintT > 0) {
        R(ctx, P.tableG, M.x + M.w - 148, M.y - 12, 150, 9);
        pixelText(ctx, 'DRAG TO PAN  -  WHEEL TO ZOOM', M.x + M.w - 146, M.y - 11, 5, '#e6cd97', 'left', false);
      }
    },

    drawShimmer(ctx, T) {
      const Z = this.zoom(), ox = this.ox, oy = this.oy;
      for (const s of this.shimmer) {
        const k = Math.sin(T * s.sp + s.ph);
        if (k < 0.62) continue;
        const x = Math.round(s.x * Z) + ox, y = Math.round(s.y * Z) + oy;
        if (x < VIEW.x - 6 || x > VIEW.x + VIEW.w || y < VIEW.y || y > VIEW.y + VIEW.h) continue;
        R(ctx, s.lit ? P.seaL : P.stain, x, y, s.len, 1);
        if (k > 0.93) R(ctx, P.seaL, x + 1, y - 1, Math.max(1, s.len - 2), 1);
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
    },

    // the tags that ride over the chart but are not drawn on it: the bearing
    // roundels along the course and the lagoon's own label
    drawTags(ctx) {
      const h = this.toScreen(HOME.x, HOME.y);
      const w = 8 + mText('THE LAGOON', 6);
      if (h.x > -w && h.x < VIEW.w && h.y > -20 && h.y < VIEW.h + 20) {
        R(ctx, P.shade, h.x + 9, h.y - 6, w, 12);
        R(ctx, P.sand, h.x + 8, h.y - 7, w, 12);
        box(ctx, P.ink, h.x + 8, h.y - 7, w, 12);
        txt(ctx, 'THE LAGOON', h.x + 12, h.y - 3, 6, { color: P.ink });
        txt(ctx, 'YOU ARE HERE', h.x + 9, h.y + 7, 5, { color: P.red, tracking: 1, outline: P.sand });
      }
      for (const L of this.labs) {
        const col = L.live ? P.redD : P.greyD;
        const lab = (L.brg < 100 ? (L.brg < 10 ? '00' : '0') : '') + L.brg;
        const tw = mText(lab, 5), bw = tw + 12;
        const p = this.toScreen(L.x, L.y);
        // a bearing belongs to its waypoint: if that has panned off, so has it
        if (p.x < VIEW.x - 4 || p.x > VIEW.x + VIEW.w + 4 || p.y < VIEW.y - 4 || p.y > VIEW.y + VIEW.h + 4) continue;
        const lx = clamp(p.x - (bw >> 1), VIEW.x + 2, VIEW.x + VIEW.w - bw - 2);
        const ly = clamp(L.up ? p.y - 13 : p.y + 7, VIEW.y + 2, VIEW.y + VIEW.h - 11);
        R(ctx, P.shade, lx + 1, ly + 9, bw - 1, 1);
        R(ctx, P.sand, lx, ly, bw, 9);
        box(ctx, col, lx, ly, bw, 9);
        txt(ctx, lab, lx + 3, ly + 2, 5, { color: col });
        box(ctx, col, lx + 4 + tw, ly + 2, 3, 3);
      }
    },

    drawRoute(ctx, T) {
      const d = DEST[this.selected], pts = d.route, total = d.routeLen;
      this.labs.length = 0;
      const shown = total * this.routeT;
      const live = d.unlocked;
      // 1) a scrubbed light underlay so the track reads over stipple and rhumbs
      this.walk(pts, shown, 1, (x, y) => { D1(ctx, P.sand, x, y); D1(ctx, P.sand, x, y - 1); D1(ctx, P.beach, x, y + 1); });
      // 2) the dashed track itself, crawling forward
      const ph = Math.floor(T * 14), per = live ? 8 : 7, on = live ? 5 : 3;
      this.walk(pts, shown, 1, (x, y, s) => {
        const k = ((Math.floor(s) - ph) % per + per) % per;
        if (k < on) { D1(ctx, live ? P.red : P.greyD, x, y); D1(ctx, live ? P.redD : P.grey, x, y + 1); }
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
          // the bearing tag is chrome: it is queued here and inked in screen
          // pixels once the chart transform has been put back
          this.labs.push({ x: b.x, y: b.y, up: !!(i & 1), live: live, brg: b.brg });
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
      const brg = d.brg | 0;
      const legs = Math.max(1, Math.round(d.routeLen / 10));
      const crs = 'BRG ' + ((brg < 100 ? (brg < 10 ? '00' : '0') : '') + brg) + '   ' + legs + ' LEAGUES';
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
