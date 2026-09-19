// ===========================================================================
//  worldmap.js — THE BAY OF BROKEN NETS
//  A hand-drawn pixel-art nautical chart of the archipelago: islands with real
//  coastlines, reefs, soundings, wrecks, rhumb lines, a compass rose and the
//  ports the hunt will take the manatee through.  Everything is pre-rendered
//  once into an offscreen 640x360 canvas; only the route line, the markers,
//  the little chart-ships and the water shimmer move per frame.
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
    const xs = [0, 0, 0];
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
    void xs;
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
  // the font's display face, on demand (pixelText picks a face by size alone)
  function txt(ctx, s, x, y, size, opts) { return PixelFont.drawText(ctx, s, x, y, size, opts); }
  function mText(s, size) { return textWidth(s, size); }

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

  // ------------------------------------------------------- chart palette --
  // Aged paper, iron-gall ink, a little carmine for the ports and the track.
  const P = {
    sea: '#ded2a8', seaL: '#ece1be', seaD: '#cdc08e', seaX: '#bfae7a',
    stain: '#d5c391', stain2: '#c9b47f',
    land: '#d8b87e', landL: '#e8cf9c', landD: '#c09a5e',
    sand: '#f2e2b4',
    ink: '#463014', ink2: '#6a4e26', inkL: '#8f7040', faint: '#c0a674',
    forest: '#4f6b33', forestD: '#374f22',
    red: '#9b3620', redL: '#c1552d', redD: '#6e2312',
    gold: '#a87d2a', goldL: '#d9ab48',
    grey: '#7b6a52', greyL: '#a08c6c',
    table: '#241811', tableL: '#33241a', tableD: '#180f0a',
  };

  const MAP_W = 640, MAP_H = 272;          // the chart; the card sits below it
  const IN = { x0: 17, y0: 17, x1: 623, y1: 254 };   // interior (inside borders)

  // ------------------------------------------------------------- the land --
  // Each isle is a union of lobes; the coastline comes from a noise-perturbed
  // threshold of that field, so every shore has headlands, bays and points.
  const ISLES = [
    {
      name: "MOTHER'S REACH", x: 114, y: 202, rx: 82, ry: 46, seed: 1101, rough: 1.15,
      hills: 13, woods: 11, label: [106, 208], ls: 6,
      lobes: [
        { dx: 52, dy: -22, rx: 40, ry: 24 }, { dx: -54, dy: 4, rx: 30, ry: 26 },
        { dx: 10, dy: 30, rx: 46, ry: 18 }, { dx: -14, dy: -30, rx: 32, ry: 18 },
        { dx: 74, dy: 12, rx: 22, ry: 12, rot: 0.5 },
      ],
    },
    {
      name: 'SALT PIER', x: 246, y: 86, rx: 54, ry: 32, seed: 2207, rough: 1.05,
      hills: 7, woods: 6, label: [244, 74], ls: 5,
      lobes: [{ dx: -34, dy: 14, rx: 26, ry: 16 }, { dx: 30, dy: 16, rx: 26, ry: 14 }, { dx: 6, dy: -22, rx: 28, ry: 14 }],
    },
    { name: 'THE SISTERS', x: 298, y: 182, rx: 16, ry: 11, seed: 3301, rough: 1.2, hills: 1, woods: 1, label: [300, 170], ls: 4, lobes: [{ dx: 10, dy: 6, rx: 8, ry: 6 }] },
    { name: '', x: 332, y: 208, rx: 12, ry: 9, seed: 3307, rough: 1.2, hills: 1, woods: 0, lobes: [] },
    { name: '', x: 264, y: 220, rx: 14, ry: 10, seed: 3313, rough: 1.2, hills: 1, woods: 1, lobes: [{ dx: -9, dy: 4, rx: 7, ry: 5 }] },
    {
      name: 'MARROW ISLE', x: 408, y: 178, rx: 52, ry: 36, seed: 4409, rough: 1.1,
      hills: 9, woods: 8, label: [404, 176], ls: 5,
      lobes: [{ dx: -32, dy: -14, rx: 26, ry: 18 }, { dx: 30, dy: 14, rx: 26, ry: 16 }, { dx: -6, dy: 26, rx: 30, ry: 12 }],
    },
    {
      name: 'BLACKBONE', x: 494, y: 78, rx: 42, ry: 26, seed: 5501, rough: 1.15,
      hills: 7, woods: 3, label: [492, 66], ls: 5,
      lobes: [{ dx: 24, dy: 10, rx: 22, ry: 13 }, { dx: -26, dy: 6, rx: 20, ry: 14 }],
    },
    { name: 'THE FANGS', x: 562, y: 114, rx: 11, ry: 8, seed: 6607, rough: 1.3, hills: 1, woods: 0, label: [572, 126], ls: 4, lobes: [{ dx: 14, dy: 12, rx: 7, ry: 5 }] },
  ];

  // ------------------------------------------------------- destinations ---
  const HOME = { x: 34, y: 238 };
  const DEST = [
    {
      name: 'FISHER VILLAGE', chapter: 'I', x: 164, y: 230, lab: 'below', threat: 0.22,
      blurb: 'Where they took her. The nets still hang wet on the racks, and every hut on that pier keeps a gun behind the door.',
      foes: ['dinghy', 'netter', 'harpooner'], need: null,
    },
    {
      name: 'SALT PIER CANNERY', chapter: 'II', x: 254, y: 116, lab: 'below', threat: 0.42,
      blurb: 'The fleet larder: rendering vats, sheds up on stilts, and a jetty that tells you what they do here before you see it.',
      foes: ['netter', 'dynaboat', 'jetski'], need: 'FISHER VILLAGE',
    },
    {
      name: 'PORT MARROW', chapter: 'III', x: 398, y: 208, lab: 'below', threat: 0.58,
      blurb: 'Every hull in the bay gets patched at Marrow. Break the harbour and the fleet has nowhere left to limp home to.',
      foes: ['speedboat', 'harpooner', 'gunboat'], need: 'SALT PIER CANNERY',
    },
    {
      name: 'BLACKBONE STATION', chapter: 'IV', x: 508, y: 100, lab: 'below', threat: 0.74,
      blurb: 'A flensing deck, a winch built for whales, and the pens where they keep the big ones alive until the buyer comes.',
      foes: ['trawler', 'harpooner', 'gunboat'], need: 'PORT MARROW',
    },
    {
      name: 'THE GREY SHOALS', chapter: 'V', x: 548, y: 190, lab: 'below', threat: 0.87, open: true,
      blurb: 'Open water and drift nets out to the horizon. No rocks to hide in, no shore to run for, and the tide against you.',
      foes: ['trawler', 'speedboat', 'netter'], need: 'BLACKBONE STATION',
    },
    {
      name: 'THE DEEP ROADS', chapter: 'VI', x: 598, y: 38, lab: 'left', threat: 1, open: true,
      blurb: 'Past the last light on the chart. The Chief runs these roads, and the fleet that took her family runs with him.',
      foes: ['gunboat', 'dynaboat', 'chief'], need: 'THE GREY SHOALS',
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
    [[196, 250], [268, 248], [352, 240], [436, 232], [520, 226], [608, 220]],
    [[300, 30], [352, 56], [402, 96], [446, 126], [498, 158], [548, 178]],
    [[30, 176], [40, 154], [78, 136], [140, 130], [196, 120], [232, 116]],
  ];

  // decorative wrecks (chart symbol: masts standing out of the water)
  const WRECKS = [[238, 196], [216, 140], [332, 98], [462, 150], [556, 240], [86, 88]];

  // sea doodles: kind, x, y, facing
  const DOODLES = [
    { k: 'serpent', x: 44, y: 112, f: 1 },
    { k: 'whale', x: 146, y: 100, f: -1 },
    { k: 'kraken', x: 600, y: 96 },
    { k: 'ray', x: 472, y: 240 },
    { k: 'whale', x: 470, y: 60, f: 1 },
  ];

  // reef / shoal fields
  const REEFS = [
    { x: 546, y: 198, rx: 50, ry: 30, seed: 91, n: 46, label: 'THE GREY SHOALS' },
    { x: 216, y: 142, rx: 26, ry: 12, seed: 77, n: 16, label: '' },
    { x: 350, y: 206, rx: 22, ry: 13, seed: 61, n: 14, label: '' },
    { x: 30, y: 128, rx: 16, ry: 13, seed: 53, n: 11, label: '' },
    { x: 468, y: 206, rx: 20, ry: 11, seed: 41, n: 12, label: '' },
  ];

  // rhumb-line nodes (portolan style: every node throws 16 lines to the edges)
  const ROSE = { x: 378, y: 46, r: 27 };
  const RHUMB = [[ROSE.x, ROSE.y], [104, 128], [560, 170], [300, 240]];

  // =========================================================================
  //  LAND — mask, distance fields, and the paper the whole chart sits on
  // =========================================================================
  function buildMask() {
    const W = MAP_W, H = MAP_H, m = new Uint8Array(W * H);
    for (const is of ISLES) {
      const pad = 18;
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
        const n = vnoise((x + ox) * 0.072, (y + oy) * 0.072) * 0.62 +
                  vnoise((x + ox) * 0.185, (y + oy) * 0.185) * 0.38;
        if (v > 0.085 + (n - 0.5) * 0.30 * rough) m[(y + y0) * W + (x + x0)] = 1;
      }
    }
    // despeckle: drop lonely pixels, fill lonely holes
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
    const W = MAP_W, H = MAP_H, N = W * H, MAXD = 40, d = new Uint8Array(N);
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

  // ------------------------------------------------------------- the sea --
  // Foxed, stained, laid paper.  Four posterised tones, dithered by noise.
  function paintSea(ctx) {
    const W = MAP_W, H = MAP_H;
    const tone = [P.seaD, P.sea, P.sea, P.seaL].map(hexToRgb);
    const stain = hexToRgb(P.stain), stain2 = hexToRgb(P.stain2), spot = hexToRgb(P.seaX);
    const img = ctx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const n = vnoise(x * 0.017, y * 0.017) * 0.55 + vnoise(x * 0.068 + 30, y * 0.068 + 11) * 0.28 + hash2(x, y) * 0.17;
      let c = tone[n < 0.36 ? 0 : n < 0.52 ? 1 : n < 0.74 ? 2 : 3];
      // big tea stains, hard edged like a real blot
      const s = vnoise(x * 0.012 + 77, y * 0.012 + 21);
      if (s > 0.70) c = s > 0.775 ? stain2 : stain;
      // laid lines of the paper + foxing specks
      if (y % 9 === 0 && hash2(x * 3, y) > 0.55) c = stain2;
      if (hash2(x * 13 + 5, y * 7 + 3) > 0.9965) c = spot;
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ------------------------------------------------------------ the land --
  function paintLand(m, dIn, dOut) {
    const W = MAP_W, H = MAP_H, c = can(W, H), ctx = c.getContext('2d');
    const ink = hexToRgb(P.ink), ink2 = hexToRgb(P.ink2), inkL = hexToRgb(P.inkL);
    const L = [P.landD, P.land, P.land, P.landL].map(hexToRgb);
    const img = ctx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, p = i * 4;
      if (m[i]) {
        const din = dIn[i];
        let col;
        if (din <= 1) col = ink;                                   // inked coastline
        else {
          const n = vnoise(x * 0.055 + 41, y * 0.055 + 17) * 0.66 + hash2(x * 5, y * 3) * 0.34;
          col = L[n < 0.38 ? 0 : n < 0.58 ? 1 : n < 0.80 ? 2 : 3];
          if (din <= 6 && hash2(x * 7 + 1, y * 11 + 9) < (7 - din) * 0.135) col = ink2;   // shore shading
          else if (din > 9 && hash2(x * 3 + 7, y * 5 + 1) > 0.975) col = inkL;            // inland speckle
        }
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      } else {
        const dout = dOut[i];
        if (dout >= 1 && dout <= 7 && hash2(x * 5 + 3, y * 9 + 13) < (8 - dout) * 0.042) {
          d[p] = inkL[0]; d[p + 1] = inkL[1]; d[p + 2] = inkL[2]; d[p + 3] = 255;         // offshore stipple
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return { c, ctx };
  }

  // relief: little inked mounds with hachures down the shaded flank
  function hillGlyph(ctx, cx, by, hw, hh) {
    for (let i = -hw; i <= hw; i++) {
      const u = i / hw;
      const top = Math.round(by - hh * Math.cos(u * Math.PI * 0.5) * (1 - 0.12 * Math.abs(u)));
      D1(ctx, P.ink, cx + i, top);
      if (i > 0 && (i & 1) === 0) for (let y = top + 2; y < by; y++) D1(ctx, P.inkL, cx + i, y);
      if (i < 0 && i % 3 === 0) D1(ctx, P.landL, cx + i, top + 1);
    }
    R(ctx, P.ink2, cx - hw, by, hw * 2 + 1, 1);
  }
  function treeGlyph(ctx, x, y) {
    D1(ctx, P.forestD, x, y - 2);
    R(ctx, P.forest, x - 1, y - 1, 3, 1);
    D1(ctx, P.forestD, x - 1, y - 1); D1(ctx, P.forestD, x + 1, y - 1);
    D1(ctx, P.forest, x, y);
    D1(ctx, P.ink, x, y + 1);
  }

  function dressLand(ctx, m, dIn) {
    for (const is of ISLES) {
      const rng = new SeededRandom(is.seed * 7 + 13);
      // ---- hills / ridges
      const pts = [];
      let tries = 0;
      while (pts.length < (is.hills || 0) && tries++ < 500) {
        const a = rng.range(0, TAU), r = Math.sqrt(rng.next());
        const x = Math.round(is.x + Math.cos(a) * is.rx * r * 0.92);
        const y = Math.round(is.y + Math.sin(a) * is.ry * r * 0.92);
        if (x < 4 || y < 4 || x >= MAP_W - 4 || y >= MAP_H - 4) continue;
        const i = y * MAP_W + x;
        if (!m[i] || dIn[i] < 7) continue;
        let clash = false;
        for (const p of pts) if (dist(p.x, p.y, x, y) < 14) { clash = true; break; }
        if (clash) continue;
        pts.push({ x, y });
        const hw = rng.int(5, 10), hh = rng.int(4, 7);
        hillGlyph(ctx, x, y, hw, hh);
        if (rng.next() < 0.45) hillGlyph(ctx, x + rng.int(-9, 9), y + rng.int(-2, 2), Math.max(4, hw - 3), Math.max(3, hh - 2));
      }
      // ---- woods
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
        const n = rng.int(5, 13);
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
      if (hash2(x * 17 + 3, y * 13 + 7) > 0.34) continue;
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

  // classic wreck symbol: three masts standing out of the water
  function drawWreck(ctx, x, y) {
    R(ctx, P.ink, x - 5, y, 11, 1);
    for (const dx of [-3, 0, 3]) { R(ctx, P.ink, x + dx, y - 4, 1, 5); D1(ctx, P.ink, x + dx - 1, y - 4); }
    D1(ctx, P.ink2, x - 4, y + 1); D1(ctx, P.ink2, x + 4, y + 1);
    R(ctx, P.ink2, x - 3, y + 2, 7, 1);
    D1(ctx, P.ink2, x - 1, y + 3); D1(ctx, P.ink2, x + 1, y + 3);
  }

  // sea doodles ------------------------------------------------------------
  function drawSerpent(ctx, x, y, f) {
    // three coils breaking the surface, a head at one end, a fluked tail at the other
    for (const h of [0, 17, 34]) {
      for (let i = -7; i <= 7; i++) {
        const u = i / 7;
        const ty = Math.round(y - 8 * Math.cos(u * Math.PI * 0.5));
        const cx = x + f * (h + i);
        D1(ctx, P.ink, cx, ty);
        D1(ctx, P.ink, cx, ty + 4);                       // underside of the coil
        for (let k = ty + 1; k < ty + 4; k++) if (((cx + k) & 1) === 0) D1(ctx, P.inkL, cx, k);
        if (i % 4 === 0 && Math.abs(i) < 6) { D1(ctx, P.ink2, cx, ty - 1); D1(ctx, P.ink2, cx + f, ty - 2); }   // dorsal spines
      }
    }
    for (let i = -12; i < 50; i += 3) { D1(ctx, P.inkL, x + f * i, y + 6); D1(ctx, P.inkL, x + f * (i + 1), y + 6); }
    // head, reared up on a neck
    const hx = x + f * 47, hy = y - 16;
    for (let k = 0; k < 10; k++) { D1(ctx, P.ink, hx - f * 2, y - 5 - k); D1(ctx, P.ink, hx + f, y - 5 - k); }
    R(ctx, P.ink, hx - f * 2, hy - 5, 8 * f, 1);
    R(ctx, P.ink, hx - f * 2, hy + 1, 8 * f, 1);
    R(ctx, P.ink, hx + f * 6, hy - 5, 1, 7);
    for (let k = -4; k <= 0; k++) if ((k & 1) === 0) D1(ctx, P.inkL, hx + f * 3, hy + k);
    D1(ctx, P.sand, hx + f * 3, hy - 3); D1(ctx, P.ink, hx + f * 4, hy - 3);     // eye
    D1(ctx, P.ink, hx + f * 7, hy - 2); D1(ctx, P.ink, hx + f * 8, hy - 1);      // open jaw
    D1(ctx, P.ink, hx + f * 7, hy + 2); D1(ctx, P.ink, hx + f * 8, hy + 3);
    D1(ctx, P.ink, hx - f, hy - 8); D1(ctx, P.ink, hx, hy - 9); D1(ctx, P.ink, hx + f, hy - 8);   // horns
    // tail
    for (let k = 0; k < 6; k++) { D1(ctx, P.ink, x - f * (8 + k), y - 2 - k); D1(ctx, P.ink, x - f * (8 + k), y + 1 + k); }
    D1(ctx, P.ink, x - f * 14, y - 8); D1(ctx, P.ink, x - f * 14, y + 7);
  }
  function drawWhale(ctx, x, y, f) {
    const W = 34;
    for (let i = 0; i < W; i++) {
      const u = i / (W - 1);
      const th = 2 + 7.2 * Math.sin(Math.PI * Math.pow(u, 0.55)) * (1 - u * 0.25);
      const t0 = Math.round(th), b0 = Math.round(th * 0.82);
      const cx = x + f * Math.round(i - W * 0.62);
      D1(ctx, P.ink, cx, y - t0); D1(ctx, P.ink, cx, y + b0);
      if (i % 2 === 0) for (let k = -t0 + 2; k < b0 - 1; k += 3) D1(ctx, P.inkL, cx, y + k);
      if (i > W * 0.55 && i % 3 === 0) D1(ctx, P.ink2, cx, y + b0 - 1);   // belly pleats
    }
    // blunt head, jaw line and eye
    const hx = x + f * Math.round(W * 0.37);
    for (let k = -5; k <= 4; k++) D1(ctx, P.ink, hx + f * (k < 0 ? 1 : 0), y + k);
    R(ctx, P.ink, hx - f * 7, y + 1, 8, 1);
    D1(ctx, P.ink, hx - f * 5, y - 2); D1(ctx, P.ink, hx - f * 4, y - 2);
    // fluke
    const tx = x - f * Math.round(W * 0.64);
    for (let k = 0; k < 7; k++) {
      D1(ctx, P.ink, tx - f * k, y - 1 - k); D1(ctx, P.ink, tx - f * k, y + 1 + Math.round(k * 0.8));
      if (k > 2) { D1(ctx, P.inkL, tx - f * k, y - k); D1(ctx, P.inkL, tx - f * k, y + Math.round(k * 0.8)); }
    }
    D1(ctx, P.ink, tx - f * 7, y - 8); D1(ctx, P.ink, tx - f * 7, y + 7);
    // flipper
    for (let k = 0; k < 5; k++) D1(ctx, P.ink, hx - f * (5 + k), y + 5 + (k >> 1));
    // spout
    for (let i = 0; i < 9; i++) {
      D1(ctx, P.inkL, hx - f * (2 + (i >> 1)), y - 10 - i);
      if (i > 2) D1(ctx, P.inkL, hx + f * (2 + (i >> 2)), y - 10 - i);
      if (i > 5) D1(ctx, P.faint, hx - f * (6 + (i >> 1)), y - 9 - i);
    }
  }
  function drawKraken(ctx, x, y) {
    for (let a = 0; a < 3; a++) {
      const base = x - 8 + a * 8, dir = a === 1 ? 0 : a === 0 ? -1 : 1;
      let px2 = base, py = y + 8;
      for (let i = 0; i < 16; i++) {
        py -= 1;
        px2 += Math.round(Math.sin(i * 0.42 + a * 2) * 1.2) + dir * (i > 8 ? 1 : 0);
        D1(ctx, P.ink, px2, py);
        if (i % 3 === 0) D1(ctx, P.inkL, px2 + 1, py);
      }
    }
    for (let i = -8; i < 10; i += 3) { D1(ctx, P.inkL, x + i, y + 9); D1(ctx, P.inkL, x + i + 1, y + 9); }
  }
  function drawRay(ctx, x, y) {
    for (let i = -10; i <= 10; i++) {
      const u = Math.abs(i) / 10;
      const h = Math.round(5 * (1 - u * u));
      D1(ctx, P.ink, x + i, y - h); D1(ctx, P.ink, x + i, y + h);
      if ((i & 1) === 0) for (let k = -h + 1; k < h; k += 2) D1(ctx, P.inkL, x + i, y + k);
    }
    for (let i = 1; i < 12; i++) D1(ctx, P.ink, x + 10 + i, y + (i >> 2));
    D1(ctx, P.ink, x - 4, y - 3); D1(ctx, P.ink, x + 4, y - 3);
  }

  // ships on the lanes -----------------------------------------------------
  const SHIP_ROWS = [
    '....k......',
    '....kwk....',
    '....k......',
    '...kwk.....',
    '..kkwwk....',
    '.kkwwwwk...',
    '....k......',
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

  // rhumb lines, graticule and the border ----------------------------------
  function drawRhumbs(ctx) {
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    for (const n of RHUMB) {
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU + 0.0001;
        line(ctx, P.faint, n[0], n[1], n[0] + Math.cos(a) * 900, n[1] + Math.sin(a) * 900, 2, 3, 0);
      }
      D1(ctx, P.ink2, n[0], n[1]);
    }
    ctx.restore();
  }
  function degRing(ctx, col, x, y) { box(ctx, col, x, y, 3, 3); D1(ctx, P.sea, x + 1, y + 1); }
  function drawGraticule(ctx) {
    const MER = [84, 186, 288, 390, 492, 594], PAR = [46, 112, 178, 244];
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    for (const x of MER) line(ctx, P.faint, x, IN.y0, x, IN.y1, 1, 4, 0);
    for (const y of PAR) line(ctx, P.faint, IN.x0, y, IN.x1, y, 1, 4, 0);
    // crosses at every intersection, like a real graticule
    for (const x of MER) for (const y of PAR) {
      R(ctx, P.inkL, x - 2, y, 5, 1); R(ctx, P.inkL, x, y - 2, 1, 5);
    }
    ctx.restore();
    // labels hugging the inner border
    for (let i = 0; i < MER.length; i++) {
      const lab = String(64 - i * 1);
      const w = mText(lab, 5);
      txt(ctx, lab, MER[i] - w / 2 - 3, IN.y0 + 4, 5, { color: P.ink2, align: 'left' });
      degRing(ctx, P.ink2, MER[i] - w / 2 + w - 2, IN.y0 + 3);
      txt(ctx, 'W', MER[i] - w / 2 + w + 2, IN.y0 + 4, 5, { color: P.ink2 });
    }
    for (let i = 0; i < PAR.length; i++) {
      const lab = String(19 - i);
      txt(ctx, lab, IN.x0 + 4, PAR[i] - 3, 5, { color: P.ink2 });
      degRing(ctx, P.ink2, IN.x0 + 4 + mText(lab, 5) + 1, PAR[i] - 4);
      txt(ctx, 'N', IN.x0 + 4 + mText(lab, 5) + 6, PAR[i] - 3, 5, { color: P.ink2 });
    }
  }

  function drawBorder(ctx) {
    const x0 = 4, y0 = 4, x1 = 635, y1 = 265;
    // outer rule
    box(ctx, P.ink, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    box(ctx, P.ink, x0 + 1, y0 + 1, x1 - x0 - 1, y1 - y0 - 1);
    // the piano-key band with its minute ticks
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
    // inner rule
    box(ctx, P.ink, bx0 + 9, by0 + 9, bx1 - bx0 - 17, by1 - by0 - 17);
    box(ctx, P.ink2, bx0 + 11, by0 + 11, bx1 - bx0 - 21, by1 - by0 - 21);
    // corner knots
    for (const [cx, cy, sx, sy] of [[bx0 + 2, by0 + 2, 1, 1], [bx1 - 2, by0 + 2, -1, 1], [bx0 + 2, by1 - 2, 1, -1], [bx1 - 2, by1 - 2, -1, -1]]) {
      R(ctx, P.ink, cx, cy, 8 * sx, 8 * sy);
      R(ctx, P.seaL, cx + 2 * sx, cy + 2 * sy, 4 * sx, 4 * sy);
      R(ctx, P.ink, cx + 3 * sx, cy + 3 * sy, 2 * sx, 2 * sy);
      for (let i = 0; i < 5; i++) { D1(ctx, P.ink, cx + (9 + i) * sx, cy + (1 + (i & 1)) * sy); D1(ctx, P.ink, cx + (1 + (i & 1)) * sx, cy + (9 + i) * sy); }
    }
  }

  // compass rose -----------------------------------------------------------
  function drawRose(ctx, cx, cy, r) {
    // the paper under the rose is scrubbed a touch lighter
    disc(ctx, P.seaL, cx, cy, r + 5);
    ring(ctx, P.ink, cx, cy, r + 5, 0);
    ring(ctx, P.ink, cx, cy, r, 0);
    ring(ctx, P.ink2, cx, cy, r - 3, 0);
    // 32 ticks around the limb, every 4th long
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * TAU - Math.PI / 2;
      const r0 = (i % 4 === 0) ? r - 3 : r - 1;
      for (let s = r0; s <= r + 4; s++) D1(ctx, (i % 8 === 0) ? P.ink : P.ink2, Math.round(cx + Math.cos(a) * s), Math.round(cy + Math.sin(a) * s));
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
      }
    };
    star(8, r - 12, 3.4, -Math.PI / 2 + Math.PI / 8, P.landL, P.ink2);   // intercardinal
    star(4, r - 4, 5.0, -Math.PI / 2, P.seaL, P.ink);                    // cardinal
    star(4, r - 4, 4.4, 0, P.seaL, P.ink);
    disc(ctx, P.seaL, cx, cy, 4); ring(ctx, P.ink, cx, cy, 4, 0);
    R(ctx, P.ink, cx - 1, cy - 1, 3, 3); D1(ctx, P.seaL, cx, cy);
    // fleur-de-lys over north
    const ny = cy - r - 2;
    R(ctx, P.ink, cx, ny - 9, 1, 9);
    D1(ctx, P.ink, cx - 1, ny - 7); D1(ctx, P.ink, cx + 1, ny - 7);
    D1(ctx, P.ink, cx - 2, ny - 5); D1(ctx, P.ink, cx + 2, ny - 5);
    D1(ctx, P.ink, cx - 3, ny - 4); D1(ctx, P.ink, cx + 3, ny - 4);
    R(ctx, P.ink, cx - 3, ny - 3, 7, 1);
    D1(ctx, P.ink, cx - 2, ny - 2); D1(ctx, P.ink, cx + 2, ny - 2);
    D1(ctx, P.red, cx, ny - 6);
    // cardinal letters
    txt(ctx, 'N', cx, cy - r - 13, 5, { color: P.red, align: 'center' });
    txt(ctx, 'S', cx, cy + r + 8, 5, { color: P.ink, align: 'center' });
    txt(ctx, 'E', cx + r + 8, cy - 2, 5, { color: P.ink, align: 'center' });
    txt(ctx, 'W', cx - r - 8, cy - 2, 5, { color: P.ink, align: 'center' });
  }

  // scale bar --------------------------------------------------------------
  function drawScale(ctx, x, y) {
    const seg = 22, n = 6, w = seg * n;
    R(ctx, P.seaL, x - 4, y - 12, w + 8, 26);
    box(ctx, P.ink2, x - 4, y - 12, w + 8, 26);
    box(ctx, P.ink, x, y, w, 6);
    for (let i = 0; i < n; i++) R(ctx, (i & 1) ? P.seaL : P.ink, x + i * seg + 1, y + 1, seg - (i === n - 1 ? 2 : 0), 4);
    R(ctx, P.ink, x, y, w, 1); R(ctx, P.ink, x, y + 5, w, 1);
    for (let i = 0; i <= n; i++) {
      R(ctx, P.ink, x + i * seg - (i === n ? 1 : 0), y - 3, 1, 3);
      if (i % 2 === 0) txt(ctx, String(i * 2), x + i * seg, y - 10, 5, { color: P.ink, align: 'center' });
    }
    txt(ctx, 'SEA LEAGUES', x + w / 2, y + 8, 5, { color: P.ink2, align: 'center', tracking: 1 });
  }

  // title cartouche --------------------------------------------------------
  function drawCartouche(ctx, x, y, w, h) {
    // scrolled parchment plaque with curled ends
    R(ctx, P.sand, x + 4, y + 2, w - 8, h - 4);
    box(ctx, P.ink, x + 4, y + 2, w - 8, h - 4);
    box(ctx, P.ink2, x + 6, y + 4, w - 12, h - 8);
    for (let i = 0; i < 4; i++) {
      R(ctx, P.sand, x + 4 - i, y + 8 + i * 2, 2, h - 20 - i * 4);
      R(ctx, P.ink, x + 3 - i, y + 8 + i * 2, 1, h - 20 - i * 4);
      R(ctx, P.sand, x + w - 6 + i, y + 8 + i * 2, 2, h - 20 - i * 4);
      R(ctx, P.ink, x + w - 4 + i, y + 8 + i * 2, 1, h - 20 - i * 4);
    }
    // little corner scrolls
    for (const [sx, sy, fx, fy] of [[x + 7, y + 5, 1, 1], [x + w - 8, y + 5, -1, 1], [x + 7, y + h - 6, 1, -1], [x + w - 8, y + h - 6, -1, -1]]) {
      D1(ctx, P.ink, sx, sy); D1(ctx, P.ink, sx + fx, sy + fy); D1(ctx, P.ink, sx + fx * 2, sy);
      D1(ctx, P.ink, sx, sy + fy * 2); D1(ctx, P.ink2, sx + fx, sy);
    }
    let ty = y + 8;
    txt(ctx, 'THE BAY OF', x + w / 2, ty, 12, { color: P.ink, align: 'center', tracking: 2 }); ty += 11;
    txt(ctx, 'BROKEN NETS', x + w / 2, ty, 12, { color: P.ink, align: 'center', tracking: 2 }); ty += 12;
    // a hairline rule with a lozenge
    R(ctx, P.ink2, x + 16, ty, w - 32, 1);
    R(ctx, P.sand, x + w / 2 - 4, ty - 1, 9, 3);
    D1(ctx, P.ink, x + w / 2, ty - 1); D1(ctx, P.ink, x + w / 2 - 1, ty); D1(ctx, P.ink, x + w / 2 + 1, ty); D1(ctx, P.ink, x + w / 2, ty + 1);
    ty += 4;
    txt(ctx, 'SOUNDINGS IN FATHOMS', x + w / 2, ty, 5, { color: P.ink2, align: 'center', tracking: 1 }); ty += 8;
    txt(ctx, 'DRAWN BY THE OTTER, WHO', x + w / 2, ty, 5, { color: P.ink2, align: 'center' }); ty += 7;
    txt(ctx, 'HAS NEVER BEEN WRONG YET', x + w / 2, ty, 5, { color: P.ink2, align: 'center' });
  }

  // =========================================================================
  //  SPRITES — built once
  // =========================================================================
  const S = {};
  function buildSprites() {
    if (S.ready) return; S.ready = true;
    const pal = { k: P.ink, w: P.sand, r: P.red, g: P.gold, d: P.ink2, l: P.inkL };
    S.ship = makeSprite(SHIP_ROWS, { ax: 5, ay: 7, pal: pal });
    // the pair, as a chart token: manatee with the otter riding, facing right
    S.token = makeSprite([
      '.........p......',
      '.........p......',
      '........rrr.....',
      '.........p.BB...',
      '....kkkk.p.BBB..',
      '..kkGGGGkkBBBk..',
      '.kGGGGGGGGGGGkk.',
      'kGGGGGGGGGGGGGGk',
      'kgGGGGGGGGGGGGGk',
      '.kgggggggggggkk.',
      '..kkkgggggkkk...',
      '.....kkkkk......',
    ], { ax: 8, ay: 7, pal: { k: '#2b2118', G: '#8f8c86', g: '#6b6760', B: '#b06a2e', p: '#5c4526', r: '#b8402a' } });
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
  }

  // =========================================================================
  //  ROUTES — a sea road from the lagoon to every port, bent around the land
  // =========================================================================
  function seaAt(mask, x, y) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < IN.x0 || yi < IN.y0 || xi > IN.x1 || yi > IN.y1) return false;
    return !mask[yi * MAP_W + xi];
  }
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
    const GW = Math.ceil(MAP_W / CELL), GH = Math.ceil(MAP_H / CELL);
    const clear = new Uint8Array(GW * GH);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      let mn = 99;
      for (let y = gy * CELL; y < Math.min(MAP_H, gy * CELL + CELL); y++) {
        for (let x = gx * CELL; x < Math.min(MAP_W, gx * CELL + CELL); x++) {
          const i = y * MAP_W + x;
          if (m[i] || x < IN.x0 + 2 || y < IN.y0 + 2 || x > IN.x1 - 2 || y > IN.y1 - 2) { mn = 0; y = 1e9; break; }
          if (dOut[i] < mn) mn = dOut[i];
        }
      }
      clear[gy * GW + gx] = mn > 30 ? 30 : mn;
    }
    return { GW, GH, clear };
  }
  function astar(nav, sx, sy, tx, ty) {
    const GW = nav.GW, GH = nav.GH, N = GW * GH, clear = nav.clear;
    const g = new Float32Array(N).fill(Infinity), f = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], hpos = new Int32Array(N).fill(-1);
    const push = (i) => { heap.push(i); hpos[i] = heap.length - 1; up(heap.length - 1); };
    const up = (k) => {
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[heap[p]] <= f[heap[k]]) break;
        const t = heap[p]; heap[p] = heap[k]; heap[k] = t; hpos[heap[p]] = p; hpos[heap[k]] = k; k = p;
      }
    };
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
    const s = sy * GW + sx, t = ty * GW + tx;
    const h = (i) => { const x = i % GW, y = (i / GW) | 0; return Math.hypot(x - tx, y - ty); };
    g[s] = 0; f[s] = h(s); push(s);
    while (heap.length) {
      const cur = pop();
      if (cur === t) break;
      closed[cur] = 1;
      const cx = cur % GW, cy = (cur / GW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const ni = ny * GW + nx;
        if (closed[ni]) continue;
        const cl = clear[ni];
        if (cl < 2) continue;
        if (dx && dy && (clear[cy * GW + nx] < 2 || clear[ny * GW + cx] < 2)) continue;
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
    for (let i = t; i >= 0; i = from[i]) { out.push([(i % GW) * CELL + CELL / 2, ((i / GW) | 0) * CELL + CELL / 2]); if (i === s) break; }
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
    // resample so the line can be drawn progressively, then soften the corners
    const res = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = dist(a[0], a[1], b[0], b[1]);
      const n = Math.max(1, Math.round(L / 6));
      for (let k = 0; k < n; k++) res.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    res.push(pts[pts.length - 1]);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < res.length - 1; i++) {
        const a = res[i - 1], b = res[i + 1], p = res[i];
        const sxp = (a[0] + b[0] + p[0] * 2) / 4, syp = (a[1] + b[1] + p[1] * 2) / 4;
        const xi = Math.round(sxp), yi = Math.round(syp);
        if (xi < 2 || yi < 2 || xi >= MAP_W - 2 || yi >= MAP_H - 2) continue;
        const k = yi * MAP_W + xi;
        if (!m[k] && dOut[k] >= 2) res[i] = [sxp, syp];
      }
    }
    return res;
  }

  // =========================================================================
  //  THE CHART — one offscreen 640x360 canvas, painted once
  // =========================================================================
  function buildChart(self) {
    const c = can(640, 360), ctx = c.getContext('2d');
    // ---- the table the chart is pinned to (everything under the card)
    R(ctx, P.table, 0, 0, 640, 360);
    for (let y = MAP_H - 6; y < 360; y++) {
      for (let x = 0; x < 640; x++) {
        const n = hash2(x * 3 + 1, y * 7);
        if (n > 0.93) D1(ctx, P.tableL, x, y);
        else if (n < 0.07) D1(ctx, P.tableD, x, y);
      }
      if ((y - MAP_H) % 13 === 0) R(ctx, P.tableD, 0, y, 640, 1);
    }
    // ---- paper, land and everything inked on it
    const chart = can(MAP_W, MAP_H), cx = chart.getContext('2d');
    paintSea(cx);
    drawRhumbs(cx);
    drawGraticule(cx);

    const mask = buildMask();
    // put every port on a piece of coast the sea can actually reach
    let oc = oceanFill(mask);
    let dOut0 = distField(mask, 1);
    const snapHome = snapCoast(mask, dOut0, oc, HOME.x, HOME.y, 26);
    HOME.x = snapHome[0]; HOME.y = snapHome[1];
    for (const d of DEST) {
      if (d.open) continue;                       // shoals and open sea stay put
      const p = snapCoast(mask, dOut0, oc, d.x, d.y, 26);
      d.x = p[0]; d.y = p[1];
    }
    // then bite a small basin out of the shore behind each one
    carve(mask, HOME.x, HOME.y, 6, 3.1);
    for (const d of DEST) if (!d.open) carve(mask, d.x, d.y, 5, d.x * 0.01 + 1.7);
    const dIn = distField(mask, 0), dOut = distField(mask, 1);
    oc = oceanFill(mask);
    const land = paintLand(mask, dIn, dOut);
    dressLand(land.ctx, mask, dIn);
    cx.drawImage(land.c, 0, 0);

    // ---- reefs, soundings, wrecks, doodles
    for (const rf of REEFS) drawReef(cx, rf, mask);
    const rng = new SeededRandom(9137);
    let placed = 0;
    for (let i = 0; i < 900 && placed < 52; i++) {
      const x = Math.round(rng.range(IN.x0 + 6, IN.x1 - 10)), y = Math.round(rng.range(IN.y0 + 6, IN.y1 - 8));
      const cl = clearance(dOut, mask, x, y);
      if (cl < 5) continue;
      let clash = false;
      for (const d of DEST) if (dist(d.x, d.y, x, y) < 26) clash = true;
      if (dist(HOME.x, HOME.y, x, y) < 22) clash = true;
      if (dist(ROSE.x, ROSE.y, x, y) < ROSE.r + 14) clash = true;
      if (x > 16 && x < 186 && y > 16 && y < 86) clash = true;        // cartouche
      if (x > 292 && x < 452 && y > 224 && y < 256) clash = true;     // scale bar
      if (x > 556 && x < 624 && y > 224 && y < 250) clash = true;     // open-sea note
      if (clash) continue;
      const v = Math.max(2, Math.round(cl * 1.1 + rng.range(0, 14)));
      txt(cx, String(v), x, y, 5, { color: P.ink2, align: 'center' });
      placed++;
    }
    for (const w of WRECKS) drawWreck(cx, w[0], w[1]);
    for (const d of DOODLES) {
      if (d.k === 'serpent') drawSerpent(cx, d.x, d.y, d.f || 1);
      else if (d.k === 'whale') drawWhale(cx, d.x, d.y, d.f || 1);
      else if (d.k === 'kraken') drawKraken(cx, d.x, d.y);
      else if (d.k === 'ray') drawRay(cx, d.x, d.y);
    }
    // ---- shipping lanes (dotted), drawn under the ships that ride them
    for (const ln of LANES) {
      for (let i = 0; i < ln.length - 1; i++) line(cx, P.inkL, ln[i][0], ln[i][1], ln[i + 1][0], ln[i + 1][1], 1, 5, i * 3);
    }
    // ---- island names, letter-spaced like a real chart
    for (const is of ISLES) {
      if (!is.name || !is.label) continue;
      txt(cx, is.name, is.label[0], is.label[1], is.ls || 5, { color: P.ink, align: 'center', tracking: 2 });
    }
    txt(cx, 'OPEN SEA', 590, 232, 6, { color: P.ink2, align: 'center', tracking: 3 });
    txt(cx, 'HERE THE CHART ENDS', 590, 242, 5, { color: P.ink2, align: 'center' });
    txt(cx, 'THE NARROWS', 232, 166, 5, { color: P.ink2, align: 'center', tracking: 1 });
    txt(cx, 'MOTHER DEEP', 106, 130, 5, { color: P.ink2, align: 'center', tracking: 1 });

    // ---- furniture on top
    drawRose(cx, ROSE.x, ROSE.y, ROSE.r);
    drawScale(cx, 300, 240);
    drawCartouche(cx, 20, 20, 156, 62);
    drawBorder(cx);

    ctx.drawImage(chart, 0, 0);
    // a torn, shadowed edge where the chart lies on the table
    R(ctx, P.tableD, 0, MAP_H, 640, 2);
    for (let x = 0; x < 640; x++) {
      const n = Math.floor(hash2(x * 5, 3) * 3);
      R(ctx, P.ink, x, MAP_H - 1 - n, 1, 1 + n);
    }

    self.mask = mask; self.dOut = dOut; self.ocean = oc;
    self.nav = navGrid(mask, dOut);
    return c;
  }

  // =========================================================================
  //  PORT MARKERS
  // =========================================================================
  function plaqueRect(d) {
    const w = d.plaqW, h = 12;
    if (d.lab === 'right') return { x: d.x + 9, y: d.y - 6, w: w, h: h };
    if (d.lab === 'left') return { x: d.x - 9 - w, y: d.y - 6, w: w, h: h };
    if (d.lab === 'above') return { x: Math.round(d.x - w / 2), y: d.y - 10 - h, w: w, h: h };
    return { x: Math.round(d.x - w / 2), y: d.y + 9, w: w, h: h };
  }

  function drawPlaque(ctx, d, sel, hov) {
    const r = d.plaque, on = d.unlocked;
    const paper = sel ? P.goldL : on ? P.sand : P.seaD;
    const edge = sel ? P.red : P.ink;
    R(ctx, paper, r.x, r.y, r.w, r.h);
    box(ctx, edge, r.x, r.y, r.w, r.h);
    if (sel || hov) { box(ctx, P.sand, r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
    // chapter badge
    R(ctx, on ? P.red : P.grey, r.x + 1, r.y + 1, 11, r.h - 2);
    txt(ctx, d.chapter, r.x + 6, r.y + 3, 5, { color: on ? P.sand : '#ded3ab', align: 'center' });
    txt(ctx, d.name, r.x + 15, r.y + 3, 6, { color: on ? P.ink : P.grey });
    if (!on) drawSprite(ctx, S.lock, r.x + r.w - 5, r.y + 6);
  }

  function drawPort(ctx, d, T, sel, hov) {
    const x = Math.round(d.x), y = Math.round(d.y), on = d.unlocked;
    const ink = on ? P.ink : P.grey;
    disc(ctx, P.sand, x, y, 5);
    ring(ctx, ink, x, y, 5, 0);
    ring(ctx, ink, x, y, 4, 0);
    R(ctx, ink, x - 7, y, 4, 1); R(ctx, ink, x + 4, y, 4, 1);
    R(ctx, ink, x, y - 7, 1, 4); R(ctx, ink, x, y + 4, 1, 4);
    if (on) { disc(ctx, P.red, x, y, 2); D1(ctx, P.sand, x, y); }
    else { disc(ctx, P.grey, x, y, 2); D1(ctx, P.seaD, x, y); }
    if (on) {                                    // a little pennant over the port
      R(ctx, P.ink, x - 1, y - 14, 1, 7);
      R(ctx, P.red, x, y - 14, 5, 3);
      D1(ctx, P.ink, x + 5, y - 14); D1(ctx, P.ink, x + 5, y - 12);
      D1(ctx, P.redL, x + 1, y - 13);
    }
    // pulse / selection ring
    if (on) {
      const k = (Math.sin(T * 3.1) * 0.5 + 0.5);
      const rr = 8 + Math.round(k * 3);
      ring(ctx, sel ? P.red : P.ink2, x, y, rr, sel ? 2 : 3);
      if (sel) ring(ctx, P.redL, x, y, rr + 2, 3);
    } else if (sel) {
      ring(ctx, P.ink2, x, y, 9, 2);
    }
    if (sel) {                                   // corner ticks, straight out of UIKit's hover slot
      const o = 11 + Math.round(Math.sin(T * 4) * 1);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        R(ctx, P.red, x + sx * o - (sx < 0 ? 0 : 3), y + sy * o, 4, 1);
        R(ctx, P.red, x + sx * o, y + sy * o - (sy < 0 ? 0 : 3), 1, 4);
      }
    } else if (hov) ring(ctx, P.redL, x, y, 9, 2);
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
        d.plaqW = 20 + mText(d.name, 6);
        d.lines = wrapText(null, d.blurb, 286, 6).slice(0, 3);
      }
      this.chart = buildChart(this);          // this also snaps the ports to the coast
      for (const d of DEST) {
        const r = plaqueRect(d);
        r.x = clamp(r.x, IN.x0 + 3, IN.x1 - r.w - 3);
        r.y = clamp(r.y, IN.y0 + 3, IN.y1 - r.h - 3);
        d.plaque = r;
        const x0 = Math.min(d.x - 10, r.x), y0 = Math.min(d.y - 10, r.y);
        const x1 = Math.max(d.x + 10, r.x + r.w), y1 = Math.max(d.y + 10, r.y + r.h);
        d.hit = { x: x0, y: y0, w: Math.max(18, x1 - x0), h: Math.max(18, y1 - y0) };
      }
      // sea roads from the lagoon to every port
      for (const d of DEST) {
        d.route = buildRoute(this.mask, this.dOut, this.nav, HOME, d);
        d.routeLen = laneLen(d.route);
      }
      // water shimmer: fixed marks in open water that wink on and off
      const rng = new SeededRandom(5150);
      this.shimmer.length = 0;
      for (let i = 0; i < 900 && this.shimmer.length < 150; i++) {
        const x = Math.round(rng.range(IN.x0 + 4, IN.x1 - 6)), y = Math.round(rng.range(IN.y0 + 4, IN.y1 - 4));
        if (clearance(this.dOut, this.mask, x, y) < 7) continue;
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
      const T = this.T;
      ctx.drawImage(this.chart, 0, 0);
      this.drawShimmer(ctx, T);
      this.drawShips(ctx, T);
      this.drawHome(ctx, T);
      this.drawRoute(ctx, T);
      for (let i = 0; i < DEST.length; i++) {
        if (i === this.selected) continue;
        drawPlaque(ctx, DEST[i], false, this.hover === i);
        drawPort(ctx, DEST[i], T, false, this.hover === i);
      }
      drawPlaque(ctx, DEST[this.selected], true, false);
      drawPort(ctx, DEST[this.selected], T, true, false);
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
        const col = s.lit ? P.seaL : P.faint;
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
        // a short wake behind her
        const d = s.sp < 0 ? 1 : -1;
        R(ctx, P.inkL, Math.round(p.x) + d * 5, y + 3, 3, 1);
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
      const w = 7 + mText('THE LAGOON', 6);
      R(ctx, P.sand, x + 8, y - 5, w, 11);
      box(ctx, P.ink, x + 8, y - 5, w, 11);
      txt(ctx, 'THE LAGOON', x + 12, y - 2, 6, { color: P.ink });
      txt(ctx, 'YOU ARE HERE', x + 8, y - 14, 5, { color: P.red, tracking: 1 });
    },

    drawRoute(ctx, T) {
      const d = DEST[this.selected], pts = d.route, total = d.routeLen;
      const shown = total * this.routeT;
      // 1) a scrubbed light underlay so the track reads over stipple and rhumbs
      this.walk(pts, shown, 1, (x, y) => { D1(ctx, P.sand, x, y); });
      // 2) the dashed carmine track itself, crawling forward
      const ph = Math.floor(T * 14);
      this.walk(pts, shown, 1, (x, y, s) => {
        const k = ((Math.floor(s) - ph) % 7 + 7) % 7;
        if (k < 4) D1(ctx, d.unlocked ? P.red : P.grey, x, y);
      });
      // 3) course ticks every 30 leagues
      this.walk(pts, shown, 1, (x, y, s, dx, dy) => {
        if (Math.floor(s) % 34 !== 0 || s < 8) return;
        const nx = -dy, ny = dx;
        for (let k = -2; k <= 2; k++) D1(ctx, P.ink2, Math.round(x + nx * k), Math.round(y + ny * k));
      });
      void T;
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
      // wake
      for (let i = 1; i <= 4; i++) {
        const wx = Math.round(x - p.dx * (7 + i * 3)), wy = Math.round(y - p.dy * (7 + i * 3));
        D1(ctx, i < 3 ? P.sand : P.faint, wx, wy);
        D1(ctx, P.faint, wx, wy - 1);
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
      pixelTextOutlined(ctx, d.name, X, 278, 18, d.unlocked ? '#ffe48f' : '#b8c6d4', '#14141c');
      const st = d.unlocked
        ? 'CHAPTER ' + d.chapter + '   -   THE WAY IS OPEN'
        : 'CHAPTER ' + d.chapter + '   -   LOCKED';
      pixelText(ctx, st, X, 296, 6, d.unlocked ? '#6fd88e' : '#8ea6bc', 'left', false);
      UIKit.divider(ctx, X, 307, 288);
      let y = 313;
      for (const l of d.lines) { pixelText(ctx, l, X, y, 6, '#cfe6f2', 'left', false); y += 9; }
      if (!d.unlocked && d.need) pixelText(ctx, 'TAKE ' + d.need + ' FIRST.', X, y + 1, 6, '#ff9a3c', 'left', false);

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
        // a pair of chevrons chasing each other along the button while idle
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
