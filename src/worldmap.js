// ===========================================================================
//  worldmap.js — THE BAY OF BROKEN NETS, seen from the air
//
//  Not a chart this time: a place.  The archipelago is a heightmap, extruded
//  into a three-quarter view — every island is a solid mass with a lit top
//  and a shaded cliff face, the sea is a surface with real thickness whose
//  cut-away front edge you can see down into, and the whole thing sits under
//  a banded dusk sky with the sun going down behind the Deep Roads.
//
//  The terrain, the sea, the sky and the port buildings are rasterised once
//  into offscreen canvases at load.  Everything that MOVES is drawn live on
//  top of those plates: swell rolling in, surf breathing on every shore, the
//  sun's glitter on the water, boats making way with wakes, the cannery
//  stack smoking, Marrow's light and Blackbone's searchlight sweeping,
//  gulls, flags, buoys, a whale gliding through the cut-away, and the
//  plotted course drawing itself out to whichever port she has chosen.
//
//  API (exactly what game.js calls):
//    WorldMap.init()                 build the plates once
//    WorldMap.open(unlockedCount)    screen opened; how many ports are free
//    WorldMap.update(dt, t)          mouse / touch / keys
//    WorldMap.render(ctx, t)         draw the 640x360 screen
//    WorldMap.action                 null | 'launch' | 'back'
//    WorldMap.consume()              clear .action
//    WorldMap.selected               index of the highlighted destination
//    WorldMap.destinations           [{name, blurb, unlocked, x, y}, ...]
//    WorldMap.unlockedCount          how many are open (save.js reads/writes)
//
//  Pixel art only: integer coordinates, posterised colour bands, hard edges.
//  No canvas gradients, no blur, no alpha washes, no external images.
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
  function txt(ctx, s, x, y, size, opts) { return PixelFont.drawText(ctx, s, x, y, size, opts); }
  function mText(s, size) { return textWidth(s, size); }

  // hard-edged scanline triangle, optionally dithered (a checkerboard is how
  // this screen does a half tone: never an alpha wash)
  function tri(ctx, col, ax, ay, bx, by, cx, cy, dither, clipY) {
    const y0 = Math.max(clipY ? clipY[0] : -9999, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(clipY ? clipY[1] : 9999, Math.ceil(Math.max(ay, by, cy)));
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
      if (i1 < i0) continue;
      if (!dither) { ctx.fillRect(i0, y, i1 - i0 + 1, 1); continue; }
      const step = dither, par = (y % step);
      for (let x = i0; x <= i1; x++) if (((x + par) % step) === 0) ctx.fillRect(x, y, 1, 1);
    }
  }
  function disc(ctx, col, cx, cy, r) {
    ctx.fillStyle = col;
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }
  function ring(ctx, col, cx, cy, r, gap) {
    const n = Math.max(12, Math.round(r * 7));
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      if (gap && (i % gap)) continue;
      const a = i / n * TAU;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }
  // colour maths.  Everything posterises to a band, so the mixes all happen
  // at bake time and are frozen into the plate.
  function mixC(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
  }
  function hexOf(c) {
    const h = v => ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2);
    return '#' + h(c[0]) + h(c[1]) + h(c[2]);
  }
  function pack(c) { return ((255 << 24) | ((c[2] | 0) << 16) | ((c[1] | 0) << 8) | (c[0] | 0)) | 0; }

  // =========================================================================
  //  PALETTE
  // =========================================================================
  const SKY = [
    '#140f26', '#181330', '#1e1739', '#261c42', '#31214a', '#3d2751',
    '#4b2d55', '#5c3457', '#6e3c57', '#824654', '#95504f', '#a75b4b',
    '#b96747', '#c97444', '#d78343', '#e29447', '#eaa752', '#f0ba63',
  ];
  const HORIZON = '#f3c97c';
  const HAZE = '#c58a72';
  const HAZE_T = [0, 0.09, 0.20, 0.33, 0.48, 0.64];

  // land ramps, dark -> light (the sun is low and to the right)
  const RAMP = {
    sand: ['#4a3b2c', '#6d573c', '#917455', '#b79470', '#d9b183'],
    grass: ['#1b2f26', '#27412e', '#375739', '#4d7247', '#7d8f4c'],
    scrub: ['#22302b', '#2f3f33', '#41513d', '#586a4a', '#8a7a4c'],
    rock: ['#2b2730', '#3e3740', '#564a4c', '#6f5f56', '#9a7a5c'],
    peak: ['#403a44', '#584f56', '#786a68', '#9a8779', '#c9a475'],
  };
  const CLIFF = ['#251e2b', '#2b232f', '#1e1824', '#2e2532', '#231d29', '#322734'];
  const CLIFF_LIP = '#4a3a42';
  const WETLINE = '#132132';
  // sea surface, shallow -> deep
  const SEA = ['#3f8a8c', '#2f7280', '#245c72', '#1b4763', '#153653', '#0f2843', '#0a1d33'];
  // the cut-away below the waterline, top -> bottom
  const CUT = ['#0d2438', '#0a1c2c', '#081522', '#06101b', '#040b14'];
  const FOAM = ['#bfe9e2', '#89c7c6', '#5ba0a8'];
  const GOLD = '#ffd88a', GOLD_D = '#c99a44', RED = '#e0453a', RED_D = '#8e2a26';

  // =========================================================================
  //  GEOMETRY — the map is a 640x240 top-down field, projected
  // =========================================================================
  const MW = 640, MH = 240;
  const Y0 = 96;            // screen row of the far edge (the horizon)
  const YK = 0.55;          // screen rows per map row (the three-quarter squash)
  const SEA_BOT = 258;      // where the sea's cut-away front face stops
  const NEAR_Y = Y0 + Math.round((MH - 1) * YK);   // screen row of the near edge
  function px(x) { return x | 0; }
  function py(y, h) { return Math.round(Y0 + y * YK - (h || 0)); }

  const ISLES = [
    { lobes: [[-26, 224, 104, 64], [44, 244, 84, 48], [-6, 158, 66, 46], [62, 198, 50, 30]], peak: 24, seed: 3 },
    { lobes: [[186, 192, 54, 27], [148, 183, 33, 18], [216, 198, 27, 15]], peak: 15, seed: 11 },
    { lobes: [[252, 114, 47, 25], [288, 126, 29, 16], [222, 105, 25, 14]], peak: 21, seed: 23 },
    { lobes: [[96, 58, 66, 27], [152, 46, 41, 18], [38, 68, 37, 19]], peak: 32, seed: 31 },
    { lobes: [[406, 184, 67, 33], [358, 197, 41, 20], [454, 173, 37, 20], [412, 151, 31, 17]], peak: 23, seed: 41 },
    { lobes: [[478, 74, 51, 25], [438, 63, 29, 15], [518, 85, 27, 15]], peak: 25, seed: 53 },
    { lobes: [[556, 34, 17, 9]], peak: 13, seed: 61 },
    { lobes: [[614, 22, 19, 10]], peak: 15, seed: 67 },
    { lobes: [[306, 50, 21, 10]], peak: 11, seed: 71 },
    { lobes: [[300, 227, 27, 12]], peak: 8, seed: 73 },
    { lobes: [[524, 218, 23, 10]], peak: 7, seed: 79 },
    { lobes: [[170, 116, 15, 8]], peak: 6, seed: 83 },
  ];

  const SUN = { x: 356, y: Y0, r: 17 };

  // ------------------------------------------------------- destinations ---
  const HOME = { x: 78, y: 220, bx: 78, by: 220 };
  const DEST = [
    {
      name: 'FISHER VILLAGE', chapter: 'I', kind: 'village', x: 178, y: 207, threat: 0.22,
      lx: 6, ly: -30,
      blurb: 'Where they loaded him out. The nets still hang wet on the racks, and every hut on that pier keeps a gun behind the door.',
      foes: ['dinghy', 'netter', 'harpooner'], need: null, note: 'HUTS ON PILES. A SHINGLE BEACH.',
      land: true,
    },
    {
      name: 'SALT PIER CANNERY', chapter: 'II', kind: 'cannery', x: 256, y: 134, threat: 0.42,
      lx: -4, ly: -44,
      blurb: 'The fleet larder: rendering vats, sheds up on stilts, and a jetty that tells you what they do here before you see it.',
      foes: ['netter', 'dynaboat', 'jetski'], need: 'FISHER VILLAGE', note: 'FOUL GROUND. THE WATER RUNS RED.',
      land: true,
    },
    {
      name: 'PORT MARROW', chapter: 'III', kind: 'marrow', x: 400, y: 204, threat: 0.58,
      lx: 8, ly: -40,
      blurb: 'Every hull in the bay gets patched at Marrow. Break the harbour and the fleet has nowhere left to limp home to.',
      foes: ['speedboat', 'harpooner', 'gunboat'], need: 'SALT PIER CANNERY', note: 'SLIPWAYS. A BOOM ACROSS THE MOUTH.',
      land: true,
    },
    {
      name: 'BLACKBONE STATION', chapter: 'IV', kind: 'blackbone', x: 476, y: 92, threat: 0.74,
      lx: 10, ly: -34,
      blurb: 'A flensing deck, a winch built for whales, and the pens where they keep the big ones alive until the buyer comes.',
      foes: ['trawler', 'harpooner', 'gunboat'], need: 'PORT MARROW', note: 'PENS AND A FLENSING DECK.',
      land: true,
    },
    {
      name: 'THE GREY SHOALS', chapter: 'V', kind: 'shoals', x: 560, y: 166, threat: 0.87,
      lx: 4, ly: -26,
      blurb: 'Open water and drift nets out to the horizon. No rocks to hide in, no shore to run for, and the tide against you.',
      foes: ['trawler', 'speedboat', 'netter'], need: 'BLACKBONE STATION', note: 'DRIFT NETS. NO BOTTOM FOUND.',
      land: false,
    },
    {
      name: 'THE DEEP ROADS', chapter: 'VI', kind: 'deep', x: 604, y: 46, threat: 1,
      lx: -6, ly: -30,
      blurb: 'Past the last light on the chart. The Chief runs these roads, and the fleet that took her brother runs with him.',
      foes: ['gunboat', 'dynaboat', 'chief'], need: 'THE GREY SHOALS', note: 'UNSURVEYED. THE CHART ENDS HERE.',
      land: false,
    },
  ];
  const FOE_NAME = {
    dinghy: 'DINGHY SKIFFS', netter: 'NET BOATS', harpooner: 'HARPOONERS',
    speedboat: 'SPEEDBOATS', jetski: 'JETSKIS', dynaboat: 'DYNAMITE BOATS',
    trawler: 'TRAWLERS', gunboat: 'GUNBOATS', chief: 'THE CHIEF',
  };

  // traffic lanes, in map coordinates
  const LANES = [
    [[10, 96], [90, 104], [170, 132], [244, 156], [320, 162], [392, 140], [468, 122], [548, 112], [636, 104]],
    [[130, 232], [206, 226], [278, 214], [352, 218], [430, 226], [512, 232], [630, 228]],
    [[300, 20], [348, 40], [400, 70], [442, 98], [486, 128], [534, 150], [592, 176]],
    [[40, 176], [70, 160], [120, 150], [188, 150], [240, 168], [284, 186]],
  ];

  const CARD = { x: 3, y: 258, w: 634, h: 99 };
  const BTN_SAIL = { x: 470, y: 288, w: 152, h: 30 };
  const BTN_BACK = { x: 566, y: 8, w: 64, h: 20 };

  // =========================================================================
  //  TERRAIN — heightfield, water depth, and the extruded plate
  // =========================================================================
  const HGT = new Float32Array(MW * MH);     // land height above the waterline
  const DEP = new Uint8Array(MW * MH);       // water: distance from land, 0 on land
  let WATER = null;                          // screen mask: 1 where sea surface shows
  let FRONT = null;                          // 1 where the near edge is open water
  let SHORE = null;                          // screen-space surf points

  function buildHeight() {
    const tmp = new Float32Array(MW * MH);
    for (const is of ISLES) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const L of is.lobes) {
        x0 = Math.min(x0, L[0] - L[2]); x1 = Math.max(x1, L[0] + L[2]);
        y0 = Math.min(y0, L[1] - L[3]); y1 = Math.max(y1, L[1] + L[3]);
      }
      x0 = Math.max(0, Math.floor(x0) - 6); y0 = Math.max(0, Math.floor(y0) - 6);
      x1 = Math.min(MW - 1, Math.ceil(x1) + 6); y1 = Math.min(MH - 1, Math.ceil(y1) + 6);
      const sx = (is.seed % 37) * 7.3, sy = (is.seed % 23) * 11.7;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          let f = 0;
          for (const L of is.lobes) {
            const dx = (x - L[0]) / L[2], dy = (y - L[1]) / L[3];
            const q = 1 - (dx * dx + dy * dy);
            if (q > 0) f += q * q;
          }
          if (f <= 0.02) continue;
          f += (vnoise((x + sx) * 0.055, (y + sy) * 0.055) - 0.5) * 0.62
             + (vnoise((x + sx) * 0.13, (y + sy) * 0.13) - 0.5) * 0.26;
          if (f <= 0.30) continue;
          const t = clamp((f - 0.30) / 0.80, 0, 1);
          const ridge = 0.72 + 0.62 * (1 - Math.abs(vnoise((x + sx) * 0.032, (y + sy) * 0.032) * 2 - 1));
          const h = is.peak * Math.pow(t, 0.78) * ridge;
          const i = y * MW + x;
          if (h > tmp[i]) tmp[i] = h;
        }
      }
    }
    // two gentle box blurs: the noise gives shape, the blur gives a surface
    let a = tmp, b = HGT;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < MH; y++) {
        const ym = y > 0 ? -MW : 0, yp = y < MH - 1 ? MW : 0;
        for (let x = 0; x < MW; x++) {
          const i = y * MW + x;
          const xm = x > 0 ? -1 : 0, xp = x < MW - 1 ? 1 : 0;
          b[i] = (a[i] * 2 + a[i + xm] + a[i + xp] + a[i + ym] + a[i + yp]) / 6;
        }
      }
      const t = a; a = b; b = t;
    }
    if (a !== HGT) HGT.set(a);
    for (let i = 0; i < HGT.length; i++) if (HGT[i] < 0.22) HGT[i] = 0;
  }

  // chamfer distance out from the coast, capped — drives the water banding
  function buildDepth() {
    const N = MW * MH, MAXD = 60;
    for (let i = 0; i < N; i++) DEP[i] = HGT[i] > 0 ? 0 : MAXD;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const i = y * MW + x; let v = DEP[i]; if (!v) continue;
        if (x > 0 && DEP[i - 1] + 1 < v) v = DEP[i - 1] + 1;
        if (y > 0 && DEP[i - MW] + 1 < v) v = DEP[i - MW] + 1;
        if (y > 0 && x > 0 && DEP[i - MW - 1] + 2 < v) v = DEP[i - MW - 1] + 2;
        if (y > 0 && x < MW - 1 && DEP[i - MW + 1] + 2 < v) v = DEP[i - MW + 1] + 2;
        DEP[i] = v;
      }
    }
    for (let y = MH - 1; y >= 0; y--) {
      for (let x = MW - 1; x >= 0; x--) {
        const i = y * MW + x; let v = DEP[i]; if (!v) continue;
        if (x < MW - 1 && DEP[i + 1] + 1 < v) v = DEP[i + 1] + 1;
        if (y < MH - 1 && DEP[i + MW] + 1 < v) v = DEP[i + MW] + 1;
        if (y < MH - 1 && x < MW - 1 && DEP[i + MW + 1] + 2 < v) v = DEP[i + MW + 1] + 2;
        if (y < MH - 1 && x > 0 && DEP[i + MW - 1] + 2 < v) v = DEP[i + MW - 1] + 2;
        DEP[i] = v;
      }
    }
  }

  // ---- colour lookup tables, hazed by distance, packed for the raster -----
  function hazed(list) {
    const out = [];
    for (let k = 0; k < HAZE_T.length; k++) {
      const row = [];
      for (let i = 0; i < list.length; i++) row.push(pack(mixC(list[i], HAZE, HAZE_T[k])));
      out.push(row);
    }
    return out;
  }
  let LUT = null;
  function buildLUT() {
    const shade = SEA.map(c => hexOf(mixC(c, '#101d3a', 0.42)));
    LUT = {
      sea: hazed(SEA), seaSh: hazed(shade), foam: hazed(FOAM), cliff: hazed(CLIFF),
      lip: hazed([CLIFF_LIP, WETLINE]), cut: hazed(CUT),
    };
    for (const k in RAMP) LUT[k] = hazed(RAMP[k]);
  }
  function hazeLevel(y) {
    const t = 1 - y / MH;
    return clamp(Math.floor(Math.pow(t, 1.35) * HAZE_T.length), 0, HAZE_T.length - 1);
  }

  // =========================================================================
  //  THE SKY PLATE — banded dusk, stars, the sun on the water's edge
  // =========================================================================
  function bakeSky() {
    const c = can(640, Y0 + 2), g = c.getContext('2d');
    const rows = Y0 + 2;
    for (let y = 0; y < rows; y++) {
      const t = y / rows;
      let bi = Math.floor(Math.pow(t, 1.45) * SKY.length);
      bi = clamp(bi, 0, SKY.length - 1);
      R(g, SKY[bi], 0, y, 640, 1);
    }
    // a couple of banded cloud decks, hard edged, lit from the sun's side
    const rng = new SeededRandom(9187);
    for (let i = 0; i < 26; i++) {
      const cy = rng.int(10, Y0 - 12), w = rng.int(28, 120), h = rng.int(2, 5);
      const cx = rng.int(-20, 640);
      const warm = cy > Y0 - 52;
      const base = warm ? '#8a4f52' : '#3a2c50';
      const lit = warm ? '#d08a5e' : '#4d3e62';
      for (let k = 0; k < h; k++) {
        const ww = Math.round(w * (1 - k / (h + 1)));
        R(g, k === 0 ? lit : base, cx + ((w - ww) >> 1), cy + k, ww, 1);
      }
      if (warm) R(g, '#d69a67', cx + 2, cy, Math.max(4, w >> 2), 1);
    }
    for (let i = 0; i < 90; i++) {
      const sx = rng.int(0, 639), sy = rng.int(0, Math.floor(Y0 * 0.62));
      if (rng.next() > 1 - sy / Y0) continue;
      R(g, rng.next() > 0.7 ? '#cfd4ee' : '#8e93bf', sx, sy, 1, 1);
    }
    // the sun: a hard disc with two posterised rims, half drowned by the sea
    const sr = SUN.r;
    for (let k = 3; k >= 1; k--) {
      const col = k === 3 ? '#b86a4e' : k === 2 ? '#e29a50' : '#f7c96e';
      for (let y = -sr - k * 3; y <= 0; y++) {
        const rr = sr + k * 3;
        const w = Math.floor(Math.sqrt(Math.max(0, rr * rr - y * y)));
        if (w <= 0) continue;
        if (k > 1 && (y & 1) && w > 2) { R(g, col, SUN.x - w, SUN.y + y, w * 2 + 1, 1); continue; }
        R(g, col, SUN.x - w, SUN.y + y, w * 2 + 1, 1);
      }
    }
    for (let y = -sr; y <= 0; y++) {
      const w = Math.floor(Math.sqrt(Math.max(0, sr * sr - y * y)));
      R(g, y < -sr * 0.55 ? '#ffe9a8' : '#ffd582', SUN.x - w, SUN.y + y, w * 2 + 1, 1);
    }
    // banded haze right on the horizon line
    R(g, HORIZON, 0, Y0 - 2, 640, 2);
    R(g, mixC ? hexOf(mixC(HORIZON, HAZE, 0.25)) : HORIZON, 0, Y0 - 4, 640, 2);
    return c;
  }

  // the sun sits on the horizon, so every island throws its shadow a long way
  // toward the viewer and away from the sun's column
  function shadowed(x, y, h0) {
    const dirx = clamp((SUN.x - x) / 150, -1, 1) * 1.15;
    for (let s = 2; s < 30; s += 2) {
      const mx = Math.round(x + dirx * s), my = y - s;
      if (my < 0 || mx < 0 || mx >= MW) return false;
      if (HGT[my * MW + mx] > h0 + s * 0.30) return true;
    }
    return false;
  }

  // =========================================================================
  //  THE SCENE PLATE — the heightfield extruded, near rows first so the
  //  nearer land and water occlude what lies behind them
  // =========================================================================
  function bakeScene() {
    const c = can(640, 362), g = c.getContext('2d');
    const img = g.createImageData(640, 362);
    const u32 = new Uint32Array(img.data.buffer);
    const yBuf = new Int16Array(640);
    WATER = new Uint8Array(640 * 362);
    FRONT = new Uint8Array(640);
    for (let x = 0; x < 640; x++) FRONT[x] = HGT[(MH - 1) * MW + x] > 0 ? 0 : 1;
    const shore = [];
    for (let i = 0; i < 640; i++) yBuf[i] = SEA_BOT;
    const CUTLUT = LUT.cut[0];

    for (let y = MH - 1; y >= 0; y--) {
      const rowY = Y0 + y * YK;
      const hz = hazeLevel(y);
      const SEAL = LUT.sea[hz], SEASH = LUT.seaSh[hz], CL = LUT.cliff[hz], LIP = LUT.lip[hz];
      const RSAND = LUT.sand[hz], RGRASS = LUT.grass[hz], RSCRUB = LUT.scrub[hz],
        RROCK = LUT.rock[hz], RPEAK = LUT.peak[hz];
      for (let x = 0; x < 640; x++) {
        const i = y * MW + x, h = HGT[i];
        const top = Math.round(rowY - h);
        const yb = yBuf[x];
        if (top >= yb) continue;
        let surf, land = h > 0;
        if (land) {
          // slope shading: the sun is low and off to the right of the bay
          const hl = x > 0 ? HGT[i - 1] : h, hr = x < MW - 1 ? HGT[i + 1] : h;
          const hu = y > 0 ? HGT[i - MW] : h, hd = y < MH - 1 ? HGT[i + MW] : h;
          const dx = (hr - hl) * 0.5, dy = (hd - hu) * 0.5;
          const lx = x < SUN.x ? 1 : -1;
          let lum = 0.50 - dx * 0.66 * lx + dy * 0.34
            + (vnoise(x * 0.31, y * 0.31) - 0.5) * 0.14;
          if (shadowed(x, y, h)) lum -= 0.30;
          const bi = lum > 1.02 ? 4 : clamp(Math.floor(lum * 4), 0, 3);
          const ramp = h < 1.6 ? RSAND : h < 7 ? RGRASS : h < 15 ? RSCRUB : h < 23 ? RROCK : RPEAK;
          surf = ramp[bi];
        } else {
          const d = DEP[i];
          const n = (vnoise(x * 0.09 + 13, y * 0.09 + 7) - 0.5) * 5.2;
          const dd = d + n;
          const bi = dd < 2 ? 0 : dd < 5 ? 1 : dd < 10 ? 2 : dd < 17 ? 3 : dd < 27 ? 4 : dd < 40 ? 5 : 6;
          // an island's shadow, thrown a long way by a sun sitting on the sea
          surf = shadowed(x, y, 0) ? SEASH[bi] : SEAL[bi];
          WATER[top * 640 + x] = 1;
          if (d >= 1 && d <= 2 && ((x + y) & 1) === 0) shore.push(x, top);
        }
        u32[top * 640 + x] = surf;
        // the column under the surface pixel: cliff strata on land, the sea's
        // own cut-away where the water's front edge is exposed
        if (land) {
          let yy = top + 1;
          if (yy < yb) { u32[yy * 640 + x] = LIP[0]; yy++; }
          for (; yy < yb; yy++) {
            const dep = yy - top;
            let cc;
            if (dep > 26) cc = CUTLUT[clamp((dep - 26) >> 2, 0, CUT.length - 1)];
            else cc = CL[((yy >> 1) + (x >> 3)) % CLIFF.length];
            u32[yy * 640 + x] = cc;
          }
        } else {
          let yy = top + 1;
          if (yy < yb) { u32[yy * 640 + x] = LIP[1]; yy++; }
          for (; yy < yb; yy++) {
            const dep = yy - top;
            const ci = clamp((dep - 1) >> 2, 0, CUT.length - 1);
            let cc = CUTLUT[ci];
            // faint strata in the deep so the slab reads as a solid body
            if (dep > 6 && ((yy + (x >> 2)) % 11) === 0) cc = CUTLUT[clamp(ci - 1, 0, CUT.length - 1)];
            u32[yy * 640 + x] = cc;
          }
        }
        yBuf[x] = top;
      }
    }
    g.putImageData(img, 0, 0);
    SHORE = new Int16Array(shore);
    return c;
  }

  // =========================================================================
  //  PORT BUILDINGS — little oblique boxes you can see two faces of
  // =========================================================================
  function spr(w, h, ax, ay, fn) {
    const c = can(w, h), g = c.getContext('2d');
    fn(g);
    return { c: c, w: w, h: h, ax: ax, ay: ay };
  }
  // an oblique box: front face, a top slab shifted up-right, and the right cheek
  function boxi(g, x, y, w, hh, d, top, front, side, ink) {
    R(g, front, x, y - hh, w, hh);
    for (let k = 1; k <= d; k++) R(g, top, x + k, y - hh - k, w, 1);
    for (let k = 1; k <= d; k++) R(g, side, x + w - 1 + k, y - hh - k, 1, hh);
    if (ink) {
      R(g, ink, x, y - hh, 1, hh);
      R(g, ink, x, y - 1, w, 1);
      for (let k = 1; k <= d; k++) { D1(g, ink, x + k, y - hh - k); D1(g, ink, x + w - 1 + k, y - hh - k); }
      R(g, ink, x + w + d - 1, y - hh - d, 1, hh);
    }
  }
  function roof(g, x, y, w, rh, d, a, b, ink) {
    for (let k = 0; k < rh; k++) {
      const ww = Math.max(1, w - k * 2);
      R(g, k === 0 ? b : a, x + k, y - k, ww, 1);
      for (let j = 1; j <= d; j++) R(g, k === 0 ? b : a, x + k + j, y - k - j, ww, 1);
    }
    if (ink) R(g, ink, x, y + 1, w + d, 1);
  }
  function piles(g, x, y, n, step, hh, col, ink) {
    for (let i = 0; i < n; i++) {
      const px2 = x + i * step;
      R(g, col, px2, y, 1, hh);
      R(g, ink, px2 + 1, y, 1, hh);
    }
  }

  const PORTS = {};
  function bakePorts() {
    const W = '#6b5744', W2 = '#8a7154', WD = '#3c3026', INK = '#1a141a';
    const RF = '#5a3a3e', RF2 = '#7b4f4a', ST = '#4b4753', ST2 = '#6a6472';

    PORTS.village = spr(54, 40, 27, 38, g => {
      piles(g, 6, 28, 9, 5, 10, '#4a3a2c', '#241c18');
      R(g, '#2a2b3a', 4, 36, 46, 2);                     // the shadow it throws on the water
      // three huts along a pier
      boxi(g, 6, 30, 12, 9, 4, W2, W, WD, INK); roof(g, 5, 21, 14, 4, 4, RF, RF2, INK);
      boxi(g, 22, 29, 14, 11, 5, W2, W, WD, INK); roof(g, 21, 18, 16, 5, 5, RF, RF2, INK);
      boxi(g, 39, 31, 10, 8, 3, W2, W, WD, INK); roof(g, 38, 23, 12, 3, 3, RF, RF2, INK);
      R(g, '#3a2e24', 2, 30, 48, 2);                     // the deck
      R(g, '#55442f', 2, 30, 48, 1);
      // net racks: the nets themselves are drawn live so they can sway
      R(g, '#2a2118', 44, 24, 1, 8); R(g, '#2a2118', 50, 24, 1, 8);
      R(g, '#2a2118', 44, 24, 7, 1);
      // lit windows
      D1(g, '#ffd27a', 26, 24); D1(g, '#ffd27a', 30, 25); D1(g, '#e0a552', 10, 26);
    });
    PORTS.village.flags = [[28, 13]];
    PORTS.village.nets = [[45, 25], [48, 25]];

    PORTS.cannery = spr(62, 56, 28, 54, g => {
      R(g, '#2a2b3a', 6, 50, 50, 3);
      piles(g, 8, 42, 10, 5, 9, '#463528', '#221a14');
      R(g, '#38302a', 4, 44, 54, 2); R(g, '#57483a', 4, 44, 54, 1);
      // the long shed
      boxi(g, 8, 44, 30, 14, 6, '#7d7266', '#5d5348', '#332e2a', INK);
      roof(g, 7, 30, 32, 5, 6, '#4a4a58', '#646476', INK);
      // vats
      boxi(g, 42, 44, 8, 7, 3, '#6d5a3a', '#4e412a', '#2c2418', INK);
      boxi(g, 51, 45, 6, 5, 2, '#6d5a3a', '#4e412a', '#2c2418', INK);
      // the stack
      boxi(g, 24, 30, 6, 22, 3, '#8a8078', '#5f574f', '#332e2c', INK);
      R(g, '#b4ada2', 25, 8, 5, 2);
      R(g, '#c8302e', 25, 14, 5, 2);
      for (let i = 0; i < 4; i++) D1(g, '#ffcf6e', 12 + i * 6, 38);
      R(g, '#7c2a24', 40, 50, 18, 2);                    // the water runs red
    });
    PORTS.cannery.smoke = [27, 6];
    PORTS.cannery.flags = [[45, 34]];

    PORTS.marrow = spr(76, 52, 36, 50, g => {
      R(g, '#2a2b3a', 4, 46, 68, 3);
      R(g, '#3b3540', 2, 40, 72, 7); R(g, '#57505c', 2, 40, 72, 1);   // the quay
      for (let i = 0; i < 9; i++) D1(g, '#241f28', 4 + i * 8, 44);
      // warehouses
      boxi(g, 8, 40, 20, 13, 5, ST2, ST, '#2c2934', INK);
      roof(g, 7, 27, 22, 4, 5, '#43333a', '#5e454a', INK);
      boxi(g, 32, 40, 14, 10, 4, ST2, ST, '#2c2934', INK);
      roof(g, 31, 30, 16, 3, 4, '#43333a', '#5e454a', INK);
      // slipway with a hull on it
      R(g, '#4a4230', 50, 40, 16, 6); R(g, '#665a42', 50, 40, 16, 1);
      R(g, '#3a2e28', 52, 36, 12, 4); R(g, '#53423a', 53, 35, 10, 1);
      // the lighthouse
      boxi(g, 64, 40, 7, 24, 3, '#c6bcae', '#9b9186', '#4e4842', INK);
      R(g, '#c8302e', 65, 22, 6, 3);
      R(g, '#2a2430', 64, 18, 9, 4);
      D1(g, '#1a141a', 63, 16); R(g, '#1a141a', 63, 15, 10, 1);
      for (let i = 0; i < 5; i++) D1(g, '#ffd27a', 11 + i * 5, 34);
    });
    PORTS.marrow.beam = [68, 20];
    PORTS.marrow.crane = [46, 40];
    PORTS.marrow.flags = [[18, 22]];

    PORTS.blackbone = spr(70, 50, 33, 48, g => {
      R(g, '#2a2b3a', 4, 44, 62, 3);
      R(g, '#332c34', 2, 38, 66, 7); R(g, '#4c4350', 2, 38, 66, 1);
      // the flensing deck, dark and stained
      R(g, '#3d2a2c', 6, 38, 34, 2);
      boxi(g, 6, 38, 22, 12, 5, '#584e58', '#3c353f', '#241f28', INK);
      roof(g, 5, 26, 24, 4, 5, '#332a34', '#4a3c46', INK);
      // the winch tower
      boxi(g, 32, 38, 8, 20, 3, '#6a6272', '#463f4e', '#272230', INK);
      R(g, '#1a141a', 31, 18, 12, 2);
      R(g, '#8a8290', 40, 19, 2, 2);
      // whale-rib arch
      for (let k = 0; k < 7; k++) {
        const a = k / 6 * Math.PI;
        D1(g, '#c9c2ae', Math.round(50 + Math.cos(Math.PI - a) * 9), Math.round(38 - Math.sin(a) * 11));
        D1(g, '#9a9484', Math.round(50 + Math.cos(Math.PI - a) * 9), Math.round(39 - Math.sin(a) * 11));
      }
      // the pens
      for (let i = 0; i < 5; i++) R(g, '#2a2430', 46 + i * 5, 40, 1, 6);
      R(g, '#2a2430', 46, 40, 21, 1);
      D1(g, '#ff6161', 36, 22);
    });
    PORTS.blackbone.beam = [36, 20];
    PORTS.blackbone.flags = [[14, 21]];

    PORTS.deep = spr(58, 46, 29, 44, g => {
      R(g, '#141a2a', 6, 40, 46, 3);
      // monoliths: no port here, only stone and the end of the survey
      const rocks = [[8, 42, 9, 18], [20, 44, 13, 27], [36, 42, 8, 15], [45, 43, 7, 11]];
      for (const r of rocks) {
        const [x, y, w, hh] = r;
        for (let k = 0; k < hh; k++) {
          const ww = Math.max(1, w - Math.round(k * w / (hh * 1.6)));
          R(g, k < 3 ? '#4a4452' : '#2b2734', x + ((w - ww) >> 1), y - k, ww, 1);
          R(g, '#1a1722', x + ((w - ww) >> 1), y - k, 1, 1);
        }
      }
      // a broken beacon on the tallest
      R(g, '#33303c', 25, 17, 3, 5); R(g, '#1a141a', 24, 15, 5, 2);
    });
    PORTS.deep.beam = [26, 16];
  }

  // =========================================================================
  //  ROUTE — A* across open water, then straightened
  // =========================================================================
  const CELL = 8, GW = MW / CELL | 0, GH = MH / CELL | 0;
  let GRID = null;                     // 255 = land, else clearance in cells
  function buildGrid() {
    GRID = new Uint8Array(GW * GH);
    for (let cy = 0; cy < GH; cy++) {
      for (let cx = 0; cx < GW; cx++) {
        let land = 0, dmin = 255;
        for (let y = cy * CELL; y < cy * CELL + CELL; y++) {
          for (let x = cx * CELL; x < cx * CELL + CELL; x++) {
            const i = y * MW + x;
            if (HGT[i] > 0) land = 1; else if (DEP[i] < dmin) dmin = DEP[i];
          }
        }
        GRID[cy * GW + cx] = land ? 255 : Math.min(60, dmin);
      }
    }
  }
  function nearestWater(mx, my) {
    let bx = clamp(Math.round(mx / CELL), 0, GW - 1), by = clamp(Math.round(my / CELL), 0, GH - 1);
    if (GRID[by * GW + bx] !== 255) return [bx, by];
    for (let r = 1; r < 14; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = bx + dx, y = by + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        if (GRID[y * GW + x] !== 255) return [x, y];
      }
    }
    return [bx, by];
  }
  function astar(sx, sy, gx, gy) {
    const N = GW * GH, gsc = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1);
    const open = [], inOpen = new Uint8Array(N);
    const hfn = (x, y) => Math.hypot(x - gx, y - gy);
    const si = sy * GW + sx;
    gsc[si] = 0; open.push([hfn(sx, sy), si]); inOpen[si] = 1;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let guard = 0;
    while (open.length && guard++ < 40000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const cur = open.splice(bi, 1)[0][1];
      inOpen[cur] = 0;
      const cx = cur % GW, cy = (cur / GW) | 0;
      if (cx === gx && cy === gy) break;
      for (const d of DIRS) {
        const nx = cx + d[0], ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const ni = ny * GW + nx, cl = GRID[ni];
        if (cl === 255) continue;
        const step = (d[0] && d[1]) ? 1.41 : 1;
        const shy = cl < 3 ? (3 - cl) * 1.6 : 0;       // keep off the rocks
        const ng = gsc[cur] + step + shy;
        if (ng < gsc[ni]) {
          gsc[ni] = ng; came[ni] = cur;
          if (!inOpen[ni]) { open.push([ng + hfn(nx, ny), ni]); inOpen[ni] = 1; }
        }
      }
    }
    let gi = gy * GW + gx;
    if (came[gi] < 0 && gi !== si) return null;
    const path = [];
    for (let i = gi; i >= 0; i = came[i]) { path.push([(i % GW) * CELL + CELL / 2, ((i / GW) | 0) * CELL + CELL / 2]); if (i === si) break; }
    path.reverse();
    return path;
  }
  function clearLine(ax, ay, bx, by) {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 2);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ax + (bx - ax) * i / n), y = Math.round(ay + (by - ay) * i / n);
      const cx = clamp((x / CELL) | 0, 0, GW - 1), cy = clamp((y / CELL) | 0, 0, GH - 1);
      if (GRID[cy * GW + cx] === 255 || GRID[cy * GW + cx] < 2) return false;
    }
    return true;
  }
  function simplify(path) {
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      for (; j > i + 1; j--) if (clearLine(path[i][0], path[i][1], path[j][0], path[j][1])) break;
      out.push(path[j]); i = j;
    }
    return out;
  }
  function buildRoutes() {
    const h = nearestWater(HOME.x, HOME.y + 6);
    for (const d of DEST) {
      const g2 = nearestWater(d.x, d.y + (d.land ? 8 : 0));
      let p = astar(h[0], h[1], g2[0], g2[1]);
      if (!p || p.length < 2) p = [[HOME.x, HOME.y], [d.x, d.y]];
      else p = simplify(p);
      p[0] = [HOME.x, HOME.y + 4];
      p[p.length - 1] = [d.x, d.y + (d.land ? 6 : 0)];
      d.route = p;
      let L = 0;
      const seg = [0];
      for (let i = 0; i < p.length - 1; i++) { L += Math.hypot(p[i + 1][0] - p[i][0], (p[i + 1][1] - p[i][1]) * YK); seg.push(L); }
      d.seg = seg; d.routeLen = L;
      const dx = d.x - HOME.x, dy = d.y - HOME.y;
      d.brg = (Math.round(Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    }
  }
  // walk the projected polyline in screen pixels
  function walkRoute(d, upTo, fn) {
    const p = d.route;
    let acc = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = px(p[i][0]), ay = py(p[i][1], 0), bx = px(p[i + 1][0]), by = py(p[i + 1][1], 0);
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      if (L < 0.001) continue;
      for (let u = 0; u < L; u++) {
        if (acc + u > upTo) return;
        fn(Math.round(ax + dx * (u / L)), Math.round(ay + dy * (u / L)), acc + u, dx / L, dy / L);
      }
      acc += L;
    }
  }
  function routePixLen(d) {
    const p = d.route; let L = 0;
    for (let i = 0; i < p.length - 1; i++) L += Math.hypot(px(p[i + 1][0]) - px(p[i][0]), py(p[i + 1][1], 0) - py(p[i][1], 0));
    return L;
  }
  function atRoute(d, s) {
    const p = d.route; let acc = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = px(p[i][0]), ay = py(p[i][1], 0), bx = px(p[i + 1][0]), by = py(p[i + 1][1], 0);
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      if (acc + L >= s || i === p.length - 2) {
        const u = clamp((s - acc) / L, 0, 1);
        return { x: ax + dx * u, y: ay + dy * u, dx: dx / L, dy: dy / L };
      }
      acc += L;
    }
    return { x: px(p[0][0]), y: py(p[0][1], 0), dx: 1, dy: 0 };
  }

  // =========================================================================
  //  LIVE ELEMENTS — everything below here is drawn fresh every frame
  // =========================================================================
  let CLOUDS = null;
  function bakeClouds() {
    const layers = [];
    for (let l = 0; l < 2; l++) {
      const c = can(640, 60), g = c.getContext('2d');
      const rng = new SeededRandom(3301 + l * 77);
      const n = l ? 4 : 5;
      for (let i = 0; i < n; i++) {
        const cx = rng.int(0, 620), cy = rng.int(6, 44), w = rng.int(40, 130), h = rng.int(3, 6);
        const base = l ? '#7a4a54' : '#453458', lit = l ? '#b4735e' : '#65496e';
        for (let k = 0; k < h; k++) {
          const ww = Math.round(w * (1 - k / (h + 1.2)));
          R(g, k === 0 ? lit : base, cx + ((w - ww) >> 1) + (k & 1), cy + k, ww, 1);
        }
        R(g, l ? '#d29a6a' : '#6e4f70', cx + 3, cy, Math.max(5, w >> 3), 1);
      }
      layers.push(c);
    }
    CLOUDS = layers;
  }

  function snapCoast(x, y) {
    let best = null, bd = 1e9;
    for (let r = 0; r < 26; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const mx = x + dx, my = y + dy;
        if (mx < 1 || my < 1 || mx >= MW - 1 || my >= MH - 1) continue;
        const i = my * MW + mx;
        if (HGT[i] <= 0 || HGT[i] > 5) continue;
        if (HGT[i + MW] > 0 && HGT[i + 1] > 0 && HGT[i - 1] > 0) continue;   // wants a shore
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = [mx, my]; }
      }
      if (best) break;
    }
    return best || [x, y];
  }

  // a sweeping light: three thin rays flattened into the three-quarter view,
  // stippled along their length so they read as a shaft and not a solid wedge
  function shaft(ctx, x, y, a, len, spread, hot, cold, drop) {
    for (let k = -1; k <= 1; k++) {
      const ang = a + k * spread;
      // the ray runs from the lamp out to where it strikes the sea
      const ex = x + Math.cos(ang) * len, ey = y + (drop || 26) + Math.sin(ang) * len * 0.5;
      const dx = ex - x, dy = ey - y, L = Math.hypot(dx, dy);
      const N = Math.round(k ? L * 0.72 : L);
      for (let i = 4; i < N; i++) {
        if (k && ((i + (k + 1) * 3) % 3)) continue;
        if (!k && (i % 2) && i > N * 0.4) continue;
        const ix = Math.round(x + dx * (i / L)), iy = Math.round(y + dy * (i / L));
        if (ix < 0 || ix > 639 || iy < Y0 - 26 || iy > SEA_BOT) continue;
        Q(ctx, i < N * 0.35 ? hot : cold, ix, iy, 1, 1);
      }
    }
  }

  const WorldMap = {
    ready: false, action: null, selected: 0, hover: -1, unlockedCount: 1,
    destinations: DEST, T: 0, routeT: 0, travel: 0, denyT: 0, sway: 0,
    overSail: false, overBack: false, bakeMs: 0,
    waves: [], boats: [], gulls: [], flock: [], smoke: [], buoys: [], glint: [],
    sky: null, scene: null, ptrOn: false, taps: [],

    // ------------------------------------------------------------- build --
    init() {
      if (this.ready) return;
      const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      buildLUT();
      buildHeight();
      buildDepth();
      buildGrid();
      bakePorts();
      bakeClouds();
      this.sky = bakeSky();
      this.scene = bakeScene();
      // ports land on their own shoreline, then get their screen anchor
      for (const d of DEST) {
        if (d.land) { const s = snapCoast(d.x, d.y); d.x = s[0]; d.y = s[1]; }
        const h = HGT[clamp(d.y, 0, MH - 1) * MW + clamp(d.x, 0, MW - 1)] || 0;
        d.scr = { x: px(d.x), y: py(d.y, h) };
        d.unlocked = false;
      }
      const hs = snapCoast(HOME.x, HOME.y);
      HOME.x = hs[0]; HOME.y = hs[1];
      HOME.scr = { x: px(HOME.x), y: py(HOME.y, HGT[HOME.y * MW + HOME.x] || 0) };
      buildRoutes();
      for (const d of DEST) d.pixLen = routePixLen(d);
      this.seedLife();
      this.bindPointer();
      this.ready = true;
      this.bakeMs = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0;
    },

    seedLife() {
      const rng = new SeededRandom(5153);
      // swell crests, scattered over open water
      this.waves.length = 0;
      for (let i = 0; i < 460; i++) {
        const x = rng.int(2, MW - 8), y = rng.int(2, MH - 2);
        const d = DEP[y * MW + x];
        if (d < 3) continue;
        this.waves.push({ x: x, y: y, ph: rng.range(0, TAU), len: d > 16 ? rng.int(3, 6) : rng.int(2, 4) });
      }
      // the sun's glitter, a widening column straight down the water from it
      this.glint.length = 0;
      for (let i = 0; i < 170; i++) {
        const y = rng.int(1, MH - 2);
        const spread = 6 + (y / MH) * 54;
        const x = Math.round(SUN.x + rng.range(-spread, spread));
        if (x < 1 || x > MW - 4) continue;
        this.glint.push({ x: x, y: y, ph: rng.range(0, TAU), sp: rng.range(2.4, 5.2), len: rng.int(1, 3) });
      }
      // traffic
      this.boats.length = 0;
      for (let l = 0; l < LANES.length; l++) {
        const n = l === 0 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          this.boats.push({ lane: l, s: rng.range(0, 1), sp: rng.range(0.010, 0.020) * (rng.next() > 0.5 ? 1 : -1), kind: rng.int(0, 2) });
        }
      }
      // the boat she is actually hunting
      this.holloway = { lane: 2, s: 0.30, sp: -0.0085 };
      // gulls over the bay, and a flock wheeling over Blackbone
      this.gulls.length = 0;
      for (let i = 0; i < 7; i++) {
        this.gulls.push({ x: rng.range(0, 640), y: rng.range(24, 92), sp: rng.range(9, 22) * (rng.next() > 0.4 ? 1 : -1), ph: rng.range(0, TAU), sc: rng.next() > 0.6 ? 2 : 1 });
      }
      this.flock.length = 0;
      for (let i = 0; i < 6; i++) this.flock.push({ a: rng.range(0, TAU), r: rng.range(7, 17), rr: rng.range(0.5, 0.8), sp: rng.range(0.7, 1.3), ph: rng.range(0, TAU) });
      // cannery smoke
      this.smoke.length = 0;
      for (let i = 0; i < 9; i++) this.smoke.push({ u: i / 9, w: rng.range(0.7, 1.4), dr: rng.range(0.7, 1.7) });
      // the shoals: buoys and drift-net floats
      this.buoys.length = 0;
      for (let i = 0; i < 5; i++) {
        this.buoys.push({ x: DEST[4].x - 28 + i * 14 + rng.int(-3, 3), y: DEST[4].y + rng.int(-9, 9), ph: rng.range(0, TAU), lit: i % 2 === 0 });
      }
    },

    // ----------------------------------------------------- open / select --
    open(n) {
      this.init();
      const k = clamp(n | 0, 1, DEST.length);
      this.unlockedCount = k;
      for (let i = 0; i < DEST.length; i++) DEST[i].unlocked = i < k;
      this.selected = clamp(k - 1, 0, DEST.length - 1);
      this.action = null; this.routeT = 0; this.travel = 0; this.T = 0;
      this.hover = -1; this.denyT = 0; this.taps.length = 0; this.tapGuard = 0;
      return this;
    },
    consume() { this.action = null; },
    select(i) {
      i = clamp(i | 0, 0, DEST.length - 1);
      if (i === this.selected) return;
      this.selected = i; this.routeT = 0; this.travel = 0;
      if (typeof Audio_ !== 'undefined' && Audio_.blip) Audio_.blip();
    },
    step(dx, dy) {
      const cur = DEST[this.selected].scr;
      let best = -1, bs = 1e9;
      for (let i = 0; i < DEST.length; i++) {
        if (i === this.selected) continue;
        const p = DEST[i].scr;
        const vx = p.x - cur.x, vy = p.y - cur.y;
        const along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
        if (along <= 2) continue;
        const s = along + side * 1.8;
        if (s < bs) { bs = s; best = i; }
      }
      if (best < 0) best = clamp(this.selected + (dx + dy > 0 ? 1 : -1), 0, DEST.length - 1);
      this.select(best);
    },
    launch() {
      const d = DEST[this.selected];
      if (!d.unlocked) { this.denyT = 0.35; return; }
      this.action = 'launch';
    },
    back() { this.action = 'back'; },

    // -------------------------------------------------- pointer / touch ---
    bindPointer() {
      if (this.ptrOn) return;
      const c = (typeof Input !== 'undefined' && Input.canvas) ? Input.canvas : document.getElementById('screen');
      if (!c || !c.addEventListener) return;
      this.ptrOn = true;
      const self = this;
      const at = (cx, cy) => {
        const r = c.getBoundingClientRect();
        return { x: (cx - r.left) / r.width * 640, y: (cy - r.top) / r.height * 360 };
      };
      const tap = (cx, cy) => { const p = at(cx, cy); self.taps.push(p); };
      if (window.PointerEvent) {
        c.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') tap(e.clientX, e.clientY); });
      } else {
        c.addEventListener('touchend', e => {
          const t = e.changedTouches && e.changedTouches[0];
          if (t) tap(t.clientX, t.clientY);
        });
      }
    },
    press(x, y) {
      const m = { x: x, y: y };
      if (hitR(m, BTN_BACK.x - 4, BTN_BACK.y - 4, BTN_BACK.w + 8, BTN_BACK.h + 8)) { this.back(); return; }
      if (hitR(m, BTN_SAIL.x, BTN_SAIL.y, BTN_SAIL.w, BTN_SAIL.h)) { this.launch(); return; }
      for (let i = 0; i < DEST.length; i++) {
        const h = DEST[i].hit;
        if (h && hitR(m, h.x, h.y, h.w, h.h)) {
          if (i === this.selected) this.launch(); else this.select(i);
          return;
        }
      }
    },

    // ------------------------------------------------------------ update --
    update(dt, t) {
      this.init();
      this.T += dt;
      this.denyT = Math.max(0, this.denyT - dt);
      this.sway = Math.round(Math.sin(this.T * 0.45) * 1.4);
      const m = Input.mouse;

      // hover
      this.hover = -1;
      for (let i = 0; i < DEST.length; i++) {
        const h = DEST[i].hit;
        if (h && hitR(m, h.x, h.y, h.w, h.h)) this.hover = i;
      }
      this.overSail = hitR(m, BTN_SAIL.x, BTN_SAIL.y, BTN_SAIL.w, BTN_SAIL.h);
      this.overBack = hitR(m, BTN_BACK.x, BTN_BACK.y, BTN_BACK.w, BTN_BACK.h);

      // a touch arrives as a tap AND, a frame or two later, as a synthesised
      // mouse click; the guard makes sure one finger is one press
      this.tapGuard = Math.max(0, (this.tapGuard || 0) - dt);
      let taps = [];
      if (this.taps.length) { taps = this.taps.splice(0, this.taps.length); this.tapGuard = 0.45; }
      else if (m.clicked && this.tapGuard <= 0) taps = [{ x: m.x, y: m.y }];
      for (const tp of taps) this.press(tp.x, tp.y);

      if (Input.hit) {
        if (Input.hit('ArrowRight') || Input.hit('KeyD')) this.step(1, 0);
        if (Input.hit('ArrowLeft') || Input.hit('KeyA')) this.step(-1, 0);
        if (Input.hit('ArrowDown') || Input.hit('KeyS')) this.step(0, 1);
        if (Input.hit('ArrowUp') || Input.hit('KeyW')) this.step(0, -1);
        if (Input.hit('Tab')) this.select((this.selected + 1) % DEST.length);
        if (Input.hit('Enter') || Input.hit('NumpadEnter') || Input.hit('Space')) this.launch();
        if (Input.hit('Escape') || Input.hit('Backspace')) this.back();
      }

      // the course drawing itself, then the boat sailing it on a loop
      if (this.routeT < 1) { this.routeT = Math.min(1, this.routeT + dt * 1.5); this.travel = this.routeT; }
      else { this.travel += dt * 0.12; if (this.travel > 1.16) this.travel = 0; }

      // traffic
      for (const b of this.boats) {
        b.s += b.sp * dt;
        if (b.s > 1) b.s -= 1; else if (b.s < 0) b.s += 1;
      }
      const H2 = this.holloway;
      H2.s += H2.sp * dt; if (H2.s < 0) H2.s += 1; else if (H2.s > 1) H2.s -= 1;
      for (const g of this.gulls) {
        g.x += g.sp * dt;
        if (g.x > 664) g.x = -24; else if (g.x < -24) g.x = 664;
      }
      void t;
    },

    // ============================================================ render ==
    render(ctx, t) {
      this.init();
      const T = this.T;
      _c = null;
      ctx.imageSmoothingEnabled = false;

      // 1) sky, its two drifting cloud decks and the gulls in front of them
      ctx.drawImage(this.sky, 0, 0);
      for (let l = 0; l < 2; l++) {
        const sp = l ? 5.5 : 2.4, cy = l ? 34 : 10;
        let ox = -((T * sp) % 640);
        ctx.drawImage(CLOUDS[l], Math.round(ox), cy);
        ctx.drawImage(CLOUDS[l], Math.round(ox) + 640, cy);
      }
      this.drawGulls(ctx, T);

      // 2) the bay itself, breathing a pixel on the swell
      ctx.save();
      ctx.translate(0, this.sway);
      ctx.drawImage(this.scene, 0, 0);
      this.drawGlitter(ctx, T);
      this.drawSwell(ctx, T);
      this.drawSurf(ctx, T);
      this.drawDeep(ctx, T);
      this.drawRoute(ctx, T);
      this.drawTraffic(ctx, T);
      this.drawHome(ctx, T);
      for (let i = 0; i < DEST.length; i++) this.drawPlace(ctx, DEST[i], i, T);
      this.drawToken(ctx, T);
      ctx.restore();

      // 3) chrome: the pins, the card, the buttons
      for (let i = 0; i < DEST.length; i++) if (i !== this.selected) this.drawPin(ctx, DEST[i], i, T);
      this.drawPin(ctx, DEST[this.selected], this.selected, T);
      this.drawCard(ctx, T);
      UIKit.button(ctx, BTN_BACK.x, BTN_BACK.y, BTN_BACK.w, BTN_BACK.h, 'BACK',
        this.overBack ? (Input.mouse.down ? 'pressed' : 'hover') : 'normal');
      void t;
    },

    // the sun's road on the water: dashes that flash on and off in place
    drawGlitter(ctx, T) {
      for (const g of this.glint) {
        const k = Math.sin(T * g.sp + g.ph);
        if (k < 0.45) continue;
        const sx = g.x, sy = py(g.y, 0);
        if (!WATER[sy * 640 + sx]) continue;
        const col = k > 0.88 ? '#ffe9a8' : k > 0.7 ? '#f5c273' : '#c98d5c';
        Q(ctx, col, sx, sy, g.len, 1);
      }
    },
    // swell rolling in toward the near edge, in travelling bands
    drawSwell(ctx, T) {
      for (const w of this.waves) {
        const k = Math.sin(T * 1.5 - w.y * 0.085 + w.ph * 0.35);
        if (k < 0.62) continue;
        const sx = w.x, sy = py(w.y, 0);
        const i = sy * 640 + sx;
        if (!WATER[i]) continue;
        const bright = k > 0.93;
        Q(ctx, bright ? FOAM[1] : FOAM[2], sx, sy, w.len, 1);
        if (bright && WATER[i - 640]) Q(ctx, FOAM[0], sx + 1, sy - 1, Math.max(1, w.len - 2), 1);
      }
    },
    // surf breathing along every shoreline in the bay
    drawSurf(ctx, T) {
      const S = SHORE;
      for (let i = 0; i < S.length; i += 2) {
        const x = S[i], y = S[i + 1];
        const k = Math.sin(T * 2.0 - y * 0.10 + x * 0.035);
        if (k < 0.30) continue;
        Q(ctx, k > 0.86 ? FOAM[0] : k > 0.6 ? FOAM[1] : FOAM[2], x, y, 1, 1);
      }
    },
    // something big moving through the cut-away under the near edge
    drawDeep(ctx, T) {
      const y0 = NEAR_Y + 8;
      // suspended motes, so the water under the near edge is never dead
      for (let i = 0; i < 40; i++) {
        const mx = (i * 149) % 640;
        if (!FRONT[mx]) continue;
        const my = NEAR_Y + 4 + ((i * 37) % (SEA_BOT - NEAR_Y - 6));
        const drift = Math.round(Math.sin(T * 0.4 + i) * 2);
        Q(ctx, i % 3 ? '#122a40' : '#18374f', mx + drift, my, 1, 1);
      }
      for (let f = 0; f < 5; f++) {
        const fx = Math.round(((T * 26 + f * 137) % 700) - 30);
        if (fx < 0 || fx > 636 || !FRONT[fx]) continue;
        const fy = NEAR_Y + 5 + ((f * 53) % (SEA_BOT - NEAR_Y - 10)) + Math.round(Math.sin(T * 1.3 + f) * 2);
        Q(ctx, '#1b3e58', fx, fy, 3, 1);
        Q(ctx, '#1b3e58', fx + 3, fy - 1, 1, 2);
      }
      const x = Math.round(((T * 34) % 820) - 100);
      const yy = y0 + Math.round(Math.sin(T * 0.6) * 3) + 6;
      if (yy > SEA_BOT - 4) return;
      const body = '#17314b', rim = '#27547a';
      for (let k = 0; k < 52; k++) {
        const px2 = x + k;
        if (px2 < 0 || px2 > 639 || !FRONT[px2]) continue;
        const u = k / 51;
        const hh = Math.max(1, Math.round(Math.sin(u * Math.PI) * 7));
        Q(ctx, body, px2, yy - (hh >> 1), 1, hh);
        if (k % 6 === 0) Q(ctx, rim, px2, yy - (hh >> 1), 1, 1);
      }
      if (x + 54 < 640 && FRONT[clamp(x + 54, 0, 639)]) {
        Q(ctx, body, x + 52, yy - 5, 3, 10);
        Q(ctx, rim, x + 53, yy - 5, 1, 4);
      }
      Q(ctx, '#2e628c', x + 7, yy - 3, 2, 1);
      for (let b = 0; b < 4; b++) {
        const bt = (T * 0.8 + b * 0.27) % 1;
        const bx2 = x + 8 + b * 3;
        if (bx2 > 0 && bx2 < 640 && FRONT[bx2]) Q(ctx, '#2e628c', bx2, Math.round(yy - 5 - bt * 8), 1, 1);
      }
    },

    // ------------------------------------------------------------ traffic
    laneAt(lane, s) {
      const p = LANES[lane];
      let L = 0; const seg = [0];
      for (let i = 0; i < p.length - 1; i++) { L += Math.hypot(p[i + 1][0] - p[i][0], (p[i + 1][1] - p[i][1]) * YK); seg.push(L); }
      const d = clamp(s, 0, 0.9999) * L;
      for (let i = 0; i < seg.length - 1; i++) {
        if (d <= seg[i + 1]) {
          const u = (d - seg[i]) / (seg[i + 1] - seg[i]);
          const ax = p[i][0], ay = p[i][1], bx = p[i + 1][0], by = p[i + 1][1];
          return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u, dx: Math.sign(bx - ax) || 1 };
        }
      }
      return { x: p[0][0], y: p[0][1], dx: 1 };
    },
    hull(ctx, x, y, dir, size, hullC, sailC, lampC, T, ph) {
      const bob = Math.round(Math.sin(T * 2.6 + ph) * 1);
      y += bob;
      const w = 4 + size * 2;
      Q(ctx, '#0b1a2a', x - (w >> 1) + dir, y + 1, w, 1);            // its own shadow on the water
      Q(ctx, hullC, x - (w >> 1), y, w, 1);
      Q(ctx, hullC, x - (w >> 1) + 1, y - 1, w - 2, 1);
      Q(ctx, sailC, x + (dir > 0 ? -1 : 0), y - 2 - size, 1, 2 + size);
      Q(ctx, sailC, x + (dir > 0 ? -1 : 0) - (dir > 0 ? 1 : -1), y - 2 - size, 2, 1);
      if (lampC) Q(ctx, lampC, x + (dir > 0 ? 2 : -3), y - 2, 1, 1);
      // wake
      for (let i = 1; i <= 3 + size; i++) {
        const wx = x - dir * (w / 2 + i * 2);
        const wy = y + 1;
        if (!WATER[wy * 640 + (wx | 0)]) continue;
        Q(ctx, i < 3 ? FOAM[1] : FOAM[2], wx, wy, i < 3 ? 2 : 1, 1);
      }
    },
    drawTraffic(ctx, T) {
      for (const b of this.boats) {
        const p = this.laneAt(b.lane, b.s);
        const dir = b.sp > 0 ? 1 : -1;
        const sy = py(p.y, 0);
        if (sy < Y0 - 2) continue;
        this.hull(ctx, Math.round(p.x), sy, dir, b.kind, '#3b3340', '#8e8676', null, T, b.s * 9);
      }
      // HOLLOWAY: the boat that took him, still working the bone channel
      const h = this.holloway, p = this.laneAt(h.lane, h.s);
      const sy = py(p.y, 0), sx = Math.round(p.x);
      const blink = (T % 1.4) < 0.7;
      this.hull(ctx, sx, sy, h.sp > 0 ? 1 : -1, 2, '#231b26', '#6e5a52', blink ? '#ff6161' : '#7a2c2c', T, 2.1);
      const w = mText('HOLLOWAY', 5) + 6;
      const lx = clamp(sx - (w >> 1), 4, 636 - w), ly = sy - 18;
      Q(ctx, '#160f16', lx, ly, w, 9);
      box(ctx, blink ? RED : RED_D, lx, ly, w, 9);
      txt(ctx, 'HOLLOWAY', lx + 3, ly + 2, 5, { color: blink ? '#ff9a92' : '#d8746c' });
      Q(ctx, RED_D, sx, ly + 9, 1, sy - 7 - (ly + 9));
    },

    drawGulls(ctx, T) {
      for (const g of this.gulls) {
        const up = Math.sin(T * 7 + g.ph) > 0;
        const x = Math.round(g.x), y = Math.round(g.y + Math.sin(T * 0.7 + g.ph) * 3);
        const c = '#e2dced';
        if (up) { Q(ctx, c, x - 2, y - 1, 2, 1); Q(ctx, c, x + 1, y - 1, 2, 1); Q(ctx, c, x, y, 1, 1); }
        else { Q(ctx, c, x - 2, y + 1, 2, 1); Q(ctx, c, x + 1, y + 1, 2, 1); Q(ctx, c, x - 1, y, 3, 1); }
        if (g.sc > 1) Q(ctx, '#b9b2c8', x - 3, y + (up ? -1 : 1), 1, 1);
      }
    },

    // -------------------------------------------------------- the places --
    drawPlace(ctx, d, i, T) {
      const s = d.scr, sel = i === this.selected;
      const spx = PORTS[d.kind];
      if (spx) ctx.drawImage(spx.c, s.x - spx.ax, s.y - spx.ay);
      const lit = d.unlocked;
      if (d.kind === 'village') {
        // nets swaying on the racks, and a lamp on the end hut
        for (let k = 0; k < 2; k++) {
          const bx = s.x - spx.ax + spx.nets[k][0], by = s.y - spx.ay + spx.nets[k][1];
          for (let j = 0; j < 6; j++) {
            const off = Math.round(Math.sin(T * 1.7 + k * 1.3 + j * 0.35) * (j * 0.28));
            Q(ctx, j & 1 ? '#6a5c44' : '#8a7a5a', bx + off, by + j, 1, 1);
          }
        }
        if ((T * 3 | 0) % 7) Q(ctx, '#ffd27a', s.x - spx.ax + 26, s.y - spx.ay + 24, 1, 1);
      } else if (d.kind === 'cannery') {
        const bx = s.x - spx.ax + spx.smoke[0], by = s.y - spx.ay + spx.smoke[1];
        for (const p of this.smoke) {
          const u = (p.u + T * 0.17 * (sel ? 1.5 : 1)) % 1;
          const yy = Math.round(by - u * 34);
          const xx = Math.round(bx + Math.sin(u * 3.1 + p.dr) * (2 + u * 9) + u * 5);
          const r = Math.max(1, Math.round((0.6 + u * 2.6) * p.w));
          const col = u < 0.22 ? '#6f6a72' : u < 0.5 ? '#585462' : u < 0.75 ? '#454251' : '#383544';
          Q(ctx, col, xx - (r >> 1), yy, r, Math.max(1, r - 1));
        }
      } else if (d.kind === 'marrow') {
        // the light sweeps, the crane swings, the lamp blinks
        const bx = s.x - spx.ax + spx.beam[0], by = s.y - spx.ay + spx.beam[1];
        const a = (T * 0.75) % TAU;
        shaft(ctx, bx, by, a, 62, 0.30, '#ffe9a8', '#d8a35e', 30);
        if ((T % 1.6) < 0.8) { Q(ctx, '#ffe9a8', bx, by, 2, 2); Q(ctx, '#f3d089', bx - 1, by - 1, 4, 1); }
        const cx = s.x - spx.ax + spx.crane[0], cy = s.y - spx.ay + spx.crane[1];
        const sw = Math.sin(T * 0.9) * 7;
        Q(ctx, '#38343e', cx, cy - 16, 2, 16);
        for (let k = 0; k < 10; k++) Q(ctx, '#4c4754', Math.round(cx + k * sw / 10), cy - 16 - Math.round(k * 0.5), 1, 1);
        const hx = Math.round(cx + sw), hy = cy - 21;
        Q(ctx, '#2a2630', hx, hy, 1, 8 + Math.round(Math.sin(T * 1.4) * 3));
      } else if (d.kind === 'blackbone') {
        const bx = s.x - spx.ax + spx.beam[0], by = s.y - spx.ay + spx.beam[1];
        shaft(ctx, bx, by, Math.sin(T * 0.4) * 0.85 - 0.1, 52, 0.26, '#dfe8f4', '#8ea4bd', 24);
        if ((T % 1.1) < 0.55) Q(ctx, '#ff6161', bx, by, 2, 2);
        // the winch, hauling
        const wx = s.x - spx.ax + 41, wy = s.y - spx.ay + 20;
        const hang = 6 + Math.round((Math.sin(T * 0.8) * 0.5 + 0.5) * 12);
        Q(ctx, '#8a8290', wx, wy, 1, hang);
        Q(ctx, '#b4aeb8', wx - 1, wy + hang, 3, 2);
        // gulls wheeling over the flensing deck
        for (const f of this.flock) {
          const aa = f.a + T * f.sp;
          const gx = Math.round(s.x + Math.cos(aa) * f.r * 1.6), gy = Math.round(s.y - 22 + Math.sin(aa) * f.r * f.rr);
          Q(ctx, Math.sin(T * 9 + f.ph) > 0 ? '#e2dced' : '#b9b2c8', gx, gy, 2, 1);
        }
      } else if (d.kind === 'shoals') {
        // open water: buoys nodding on the swell, drift-net floats between
        for (let k = 0; k < this.buoys.length; k++) {
          const b = this.buoys[k];
          const bx = px(b.x), by = py(b.y, 0) + Math.round(Math.sin(T * 1.8 + b.ph) * 1.5);
          Q(ctx, '#0d2034', bx - 1, by + 2, 4, 1);
          Q(ctx, '#b8452f', bx, by, 2, 3);
          Q(ctx, '#2a2430', bx, by - 2, 1, 2);
          if (b.lit && (T * 1.6 + k) % 2 < 0.6) Q(ctx, '#ffe9a8', bx, by - 3, 1, 1);
        }
        for (let k = 0; k < this.buoys.length - 1; k++) {
          const a = this.buoys[k], b = this.buoys[k + 1];
          const ax = px(a.x), ay = py(a.y, 0), bx2 = px(b.x), by2 = py(b.y, 0);
          for (let j = 1; j < 7; j += 2) {
            const u = j / 7;
            Q(ctx, '#5c6a72', Math.round(ax + (bx2 - ax) * u), Math.round(ay + (by2 - ay) * u + Math.sin(T * 2 + j + k)), 1, 1);
          }
        }
      } else if (d.kind === 'deep') {
        // the broken beacon guttering, and the fog that eats the survey
        const bx = s.x - spx.ax + spx.beam[0], by = s.y - spx.ay + spx.beam[1];
        if (Math.sin(T * 5.3) > 0.3) Q(ctx, '#ff6161', bx, by, 2, 1);
        const fy = py(d.y, 0);
        for (let k = 0; k < 7; k++) {
          const fx = Math.round(s.x - 40 + ((T * 6 + k * 21) % 90));
          const yy = fy - 10 + ((k * 5) % 22);
          for (let j = 0; j < 14; j += 2) Q(ctx, k & 1 ? '#3a3a52' : '#4a4a62', fx + j, yy, 1, 1);
        }
      }
      if (sel) {
        // the selected port is alive: a beacon ring and sparks off the deck
        const k = (Math.sin(T * 2.6) * 0.5 + 0.5);
        ring(ctx, d.unlocked ? GOLD : '#8e96a6', s.x, s.y + 1, 9 + Math.round(k * 3), 3);
        for (let i2 = 0; i2 < 5; i2++) {
          const u = ((T * 0.5 + i2 * 0.2) % 1);
          Q(ctx, u < 0.5 ? '#ffe9a8' : '#c99a44', s.x - 10 + i2 * 5, Math.round(s.y - 4 - u * 16), 1, 1);
        }
      }
    },

    drawHome(ctx, T) {
      const s = HOME.scr;
      const k = (Math.sin(T * 2.2) * 0.5 + 0.5);
      ring(ctx, '#7fd8b0', s.x, s.y, 6 + Math.round(k * 3), 3);
      Q(ctx, '#173a2c', s.x - 5, s.y + 2, 11, 2);
      Q(ctx, '#2f6a4e', s.x - 4, s.y, 9, 2);
      Q(ctx, '#7fd8b0', s.x - 1, s.y - 5, 2, 5);
      Q(ctx, '#7fd8b0', s.x - 3, s.y - 5, 6, 1);
      const w = mText('THE LAGOON', 5) + 6;
      const lx = clamp(s.x - (w >> 1), 3, 637 - w), ly = s.y + 8;
      Q(ctx, '#0f1a18', lx, ly, w, 9);
      box(ctx, '#3f7f66', lx, ly, w, 9);
      txt(ctx, 'THE LAGOON', lx + 3, ly + 2, 5, { color: '#9fe8c4' });
    },

    // ------------------------------------------------------- the course ---
    drawRoute(ctx, T) {
      const d = DEST[this.selected], live = d.unlocked;
      const shown = d.pixLen * this.routeT;
      const ph = Math.floor(T * 16), per = live ? 8 : 6, on = live ? 5 : 2;
      // 1) a dark scrub under the track so it reads over any water band
      walkRoute(d, shown, (x, y) => {
        if (!WATER[y * 640 + x]) return;
        Q(ctx, '#0a1522', x, y + 1, 1, 1);
      });
      // 2) the track itself, crawling forward
      walkRoute(d, shown, (x, y, s) => {
        if (!WATER[y * 640 + x]) return;
        const k = ((Math.floor(s) - ph) % per + per) % per;
        if (k < on) Q(ctx, live ? RED : '#7d8798', x, y, 1, 1);
      });
      // 3) league ticks and direction chevrons
      walkRoute(d, shown, (x, y, s, dx, dy) => {
        const si = Math.floor(s);
        if (si % 26 !== 0 || si < 12) return;
        const nx = -dy, ny = dx, len = (si % 104 === 0) ? 2 : 1;
        for (let k = -len; k <= len; k++) {
          const tx = Math.round(x + nx * k), ty = Math.round(y + ny * k);
          if (WATER[ty * 640 + tx]) Q(ctx, live ? RED_D : '#5d6676', tx, ty, 1, 1);
        }
      });
      // 4) the waypoints the course turns on
      const p = d.route;
      let acc = 0;
      for (let i = 1; i < p.length - 1; i++) {
        acc += Math.hypot(px(p[i][0]) - px(p[i - 1][0]), py(p[i][1], 0) - py(p[i - 1][1], 0));
        if (acc > shown) break;
        const x = px(p[i][0]), y = py(p[i][1], 0);
        ring(ctx, live ? RED_D : '#5d6676', x, y, 2, 0);
        Q(ctx, live ? '#ffd0c4' : '#98a0ae', x, y, 1, 1);
      }
    },
    // her own boat, running the plotted course with a wake behind it
    drawToken(ctx, T) {
      const d = DEST[this.selected];
      const s = clamp(this.travel, 0, 1) * d.pixLen;
      const p = atRoute(d, s);
      const x = Math.round(p.x), y = Math.round(p.y + Math.sin(T * 3.2) * 1);
      const dir = p.dx >= 0 ? 1 : -1;
      for (let i = 1; i <= 6; i++) {
        const wx = Math.round(x - p.dx * (4 + i * 3)), wy = Math.round(y - p.dy * (4 + i * 3)) + 1;
        if (!WATER[wy * 640 + wx]) continue;
        Q(ctx, i < 3 ? FOAM[0] : i < 5 ? FOAM[1] : FOAM[2], wx, wy, i < 4 ? 2 : 1, 1);
      }
      Q(ctx, '#0a1522', x - 3, y + 2, 7, 1);
      Q(ctx, '#2a2230', x - 3, y, 7, 2);
      Q(ctx, '#6d5a44', x - 2, y - 1, 5, 1);
      Q(ctx, '#e8dcc2', x + (dir > 0 ? 0 : -1), y - 6, 1, 5);
      Q(ctx, '#e8dcc2', x + (dir > 0 ? 1 : -3), y - 6, 3, 1);
      Q(ctx, GOLD, x + (dir > 0 ? 1 : -3), y - 5, 3, 1);
      // a lamp at the masthead, because she sails at dusk
      if ((T % 1.2) < 0.7) Q(ctx, '#ffe9a8', x + (dir > 0 ? 0 : -1), y - 7, 1, 1);
    },

    // ------------------------------------------------------------- pins ---
    drawPin(ctx, d, i, T) {
      const sel = i === this.selected, hov = this.hover === i;
      const s = d.scr;
      const bob = sel ? Math.round(Math.sin(T * 2.2) * 1) : 0;
      const name = d.name;
      const nw = mText(name, 6), w = nw + 14, h = 13;
      const cx = clamp(s.x + d.lx, 4 + (w >> 1), 636 - (w >> 1));
      const by = s.y + d.ly + bob;                 // plaque bottom
      const lx = cx - (w >> 1), ly = by - h;
      // the post down to the place itself
      const ink = d.unlocked ? (sel ? GOLD : '#c9a86a') : '#6e7686';
      for (let y = ly + h; y < s.y - 4; y++) if (((y - ly) % 3) !== 2) Q(ctx, ink, cx, y, 1, 1);
      Q(ctx, ink, cx - 2, s.y - 5, 5, 1);
      // the plaque
      Q(ctx, '#05080c', lx + 1, ly + h, w - 1, 1);
      Q(ctx, sel ? '#26202a' : '#191620', lx, ly, w, h);
      box(ctx, ink, lx, ly, w, h);
      if (sel || hov) { box(ctx, sel ? '#fff0bb' : '#e8dcc2', lx - 1, ly - 1, w + 2, h + 2); }
      const col = d.unlocked ? (sel ? '#fff0bb' : '#e6d6ae') : '#98a0ae';
      txt(ctx, name, lx + (d.unlocked ? 4 : 10), ly + 3, 6, { color: col });
      if (!d.unlocked) {
        Q(ctx, '#98a0ae', lx + 4, ly + 6, 4, 4);
        Q(ctx, '#98a0ae', lx + 5, ly + 4, 2, 2);
        Q(ctx, '#3a3f4c', lx + 5, ly + 7, 2, 1);
      }
      // chapter tab
      const ch = d.chapter, cw = mText(ch, 5) + 5;
      Q(ctx, ink, lx + w - cw, ly - 5, cw, 6);
      txt(ctx, ch, lx + w - cw + 2, ly - 4, 5, { color: '#191620' });
      // the whole pin is the touch target, never smaller than 20x20
      const hx = Math.min(lx - 2, s.x - 10), hy = ly - 6;
      const hw = Math.max(20, Math.max(lx + w + 2, s.x + 10) - hx);
      const hh = Math.max(20, (s.y + 4) - hy);
      d.hit = { x: hx, y: hy, w: hw, h: hh };
    },

    // ------------------------------------------------------------- card ---
    wrap(text, width, size) {
      const words = text.split(' '), out = []; let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (mText(test, size) > width && cur) { out.push(cur); cur = w; } else cur = test;
      }
      if (cur) out.push(cur);
      return out;
    },
    drawCard(ctx, T) {
      const d = DEST[this.selected];
      if (!d.lines) d.lines = this.wrap(d.blurb, 296, 6).slice(0, 3);
      UIKit.panel(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 'dark');
      const X = 18;
      pixelTextOutlined(ctx, d.name, X, 266, 15, d.unlocked ? '#ffe48f' : '#b8c6d4', '#14141c');
      const st = 'CHAPTER ' + d.chapter + (d.unlocked ? '   -   THE WAY IS OPEN' : '   -   LOCKED');
      pixelText(ctx, st, X, 284, 6, d.unlocked ? '#6fd88e' : '#8ea6bc', 'left', false);
      const brg = d.brg | 0;
      const legs = Math.max(1, Math.round(d.routeLen / 9));
      const crs = 'BRG ' + ((brg < 100 ? (brg < 10 ? '00' : '0') : '') + brg) + '   ' + legs + ' LEAGUES';
      pixelText(ctx, crs, X + 186, 284, 6, '#c9a86a', 'left', false);
      UIKit.divider(ctx, X - 2, 294, 300);
      let y = 300;
      for (const l of d.lines) { pixelText(ctx, l, X, y, 6, '#cfe6f2', 'left', false); y += 9; }
      if (!d.unlocked && d.need) pixelText(ctx, 'TAKE ' + d.need + ' FIRST.', X, y + 1, 6, '#ff9a3c', 'left', false);
      else if (d.note) pixelText(ctx, d.note, X, y + 1, 6, '#8ea6bc', 'left', false);

      const FX = 330;
      pixelText(ctx, 'WHAT WAITS THERE', FX, 266, 5, '#9ab4c6', 'left', false);
      R(ctx, '#2b3548', FX, 274, 128, 1);
      // the row pitch comes off the hull, because the fleet has been rescaled
      // twice now and a fixed 15 leaves the boats stacked on top of each other
      let ry = 279;
      const FW = 96;                 // width the thumbnails have to live in
      for (let i = 0; i < d.foes.length; i++) {
        const f = d.foes[i];
        if (f === 'chief') {
          drawSprite(ctx, SP.skull, FX + 8, ry + 6);
          pixelText(ctx, FOE_NAME[f], FX + 20, ry + 3, 6, '#ff6161', 'left', false);
          ry += 15;
        } else {
          const s = SP.boats[f];
          // and shrink anything too long to sit beside its own label
          const k = s ? Math.min(1, FW / Math.max(1, s.w)) : 1;
          const sw = s ? Math.round(s.w * k) : 0, sh = s ? Math.round(s.h * k) : 0;
          if (s) ctx.drawImage(s.c, 0, 0, s.c.width, s.c.height, FX, ry + 6 - Math.round(sh / 2), sw, sh);
          pixelText(ctx, FOE_NAME[f] || f, FX + sw + 5, ry + 3, 6, '#dfe9f2', 'left', false);
          ry += Math.max(15, sh + 3);
        }
      }

      pixelText(ctx, 'THREAT', BTN_SAIL.x, 266, 5, '#9ab4c6', 'left', false);
      UIKit.bar(ctx, BTN_SAIL.x + 36, 264, BTN_SAIL.w - 36, 9, d.threat, '#3f7fd6', '#c8302e');
      const press = this.overSail && Input.mouse.down;
      if (d.unlocked) {
        UIKit.button(ctx, BTN_SAIL.x, BTN_SAIL.y, BTN_SAIL.w, BTN_SAIL.h, 'SET SAIL',
          press ? 'pressed' : this.overSail ? 'hover' : 'normal');
        const o = Math.round((T * 26) % 18);
        for (let i = 0; i < 2; i++) {
          const cx2 = BTN_SAIL.x + 8 + o - i * 16;
          if (cx2 > BTN_SAIL.x + 4 && cx2 < BTN_SAIL.x + BTN_SAIL.w - 8) {
            R(ctx, '#ffeeb4', cx2, BTN_SAIL.y + 24, 2, 1);
            R(ctx, '#ffeeb4', cx2 + 2, BTN_SAIL.y + 25, 2, 1);
            R(ctx, '#ffeeb4', cx2, BTN_SAIL.y + 26, 2, 1);
          }
        }
      } else {
        const shake = this.denyT > 0 ? Math.round(Math.sin(this.denyT * 60) * 2) : 0;
        UIKit.button(ctx, BTN_SAIL.x + shake, BTN_SAIL.y, BTN_SAIL.w, BTN_SAIL.h, 'LOCKED', 'disabled');
      }
      pixelText(ctx, 'ARROWS CHOOSE   -   ENTER SETS SAIL   -   ESC GOES BACK', 320, 346, 5, '#7f93a6', 'center', false);
    },
  };

  // batched pixel fill: the live layers set a colour only when it changes
  let _c = null;
  function Q(ctx, col, x, y, w, h) {
    ctx.fillStyle = col;
    ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  global.WorldMap = WorldMap;
  global.WorldMapScene = { DEST: DEST, HOME: HOME, ISLES: ISLES, HGT: HGT };  // harness / debug only
})(typeof window !== 'undefined' ? window : this);
