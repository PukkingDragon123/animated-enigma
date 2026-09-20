// ---- Ocean: see-through jelly water over a living coral seabed -----------
// Everything heavy is precomputed:
//   * the seabed (sand dunes, rocks, corals, shells, urchins, starfish) is
//     painted ONCE into a half-resolution RGB buffer and blitted per pixel,
//   * waves + caustics use an integer-phase sine LUT (no Math.sin in the loop),
//   * depth / blood / foam / oil / jelly grids are resolved one ROW at a time.
// The background is drawn into a 322x182 ImageData and upscaled x2 (the extra
// 2px let us snap the buffer to EVEN world coordinates so the seabed never
// shimmers when the camera moves by an odd pixel).
const _OS_N = 2048, _OS_M = 2047, _OS_K = 2048 / (Math.PI * 2);
const _OS = new Float32Array(_OS_N);
for (let _i = 0; _i < _OS_N; _i++) _OS[_i] = Math.sin(_i / _OS_N * Math.PI * 2);

class Ocean {
  constructor(worldW, worldH, shoreY) {
    this.W = worldW; this.H = worldH; this.shoreY = shoreY;
    this.cell = 16;
    this.gw = Math.ceil(worldW / this.cell) + 1;
    this.gh = Math.ceil(worldH / this.cell) + 1;
    const N = this.gw * this.gh;
    // --- drifting fields -------------------------------------------------
    this.blood = new Float32Array(N); this._blood2 = new Float32Array(N);
    this.foam = new Float32Array(N); this._foam2 = new Float32Array(N);
    this.oil = new Float32Array(N); this._oil2 = new Float32Array(N);
    this.bloodOn = false; this.foamOn = false; this.oilOn = false;
    // --- jelly / displacement field (spring-wave grid) --------------------
    this.jh = new Float32Array(N); this.jh2 = new Float32Array(N); this.jv = new Float32Array(N);
    this.jgx = new Float32Array(N); this.jgy = new Float32Array(N);
    this.jelOn = false; this.jelAcc = 0; this._jelClean = true;
    // --- lists ------------------------------------------------------------
    this.ripples = []; this.wakes = []; this.streaks = []; this.fish = [];
    this.frame = 0; this.cx2 = 0; this.cy2 = 0;
    // --- low-res target ---------------------------------------------------
    // world units per low-buffer pixel. 1 = the water is resolved at full
    // world resolution (every world pixel gets its own wave/caustic sample).
    this.ls = 2;
    this.lw = Math.ceil(642 / this.ls); this.lh = Math.ceil(362 / this.ls);
    this.low = document.createElement('canvas'); this.low.width = this.lw; this.low.height = this.lh;
    this.lctx = this.low.getContext('2d'); this.lctx.imageSmoothingEnabled = false;
    this.img = this.lctx.createImageData(this.lw, this.lh);
    this.data = this.img.data;
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255;
    const lw = this.lw;
    this.rD = new Float32Array(lw); this.rJ = new Float32Array(lw);
    this.rGX = new Float32Array(lw); this.rGY = new Float32Array(lw);
    this.rB = new Float32Array(lw); this.rF = new Float32Array(lw); this.rO = new Float32Array(lw);
    this.buildPalettes();
    this.buildWorld();
    this.buildCurrents();
  }

  // =====================================================================
  //  palettes
  // =====================================================================
  buildPalettes() {
    const hx = hexToRgb;
    // 16 depth bands: bright lagoon turquoise -> abyssal navy
    // The offshore water is where most of the fighting happens, so the deep end
    // settles into a readable navy instead of bottoming out at black.
    this.waterRamp = ['#3ad3b4', '#2cc6b2', '#20b8ae', '#1aaaa8', '#169ba1', '#148f99', '#138591', '#127a88',
      '#11707f', '#106676', '#0f5d6d', '#0e5465', '#0d4c5d', '#0d4556', '#0c3f4f', '#0c3a49'].map(hx);
    const mul = [0.70, 0.82, 0.92, 1.0, 1.09, 1.19, 1.36];
    this.waterLUT = new Uint8Array(16 * 7 * 3);
    for (let b = 0; b < 16; b++) for (let l = 0; l < 7; l++) {
      const c = this.waterRamp[b], m = mul[l], i = (b * 7 + l) * 3;
      // posterize hard so the bands read as pixel art
      this.waterLUT[i] = (Math.min(255, c[0] * m) / 5 | 0) * 5;
      this.waterLUT[i + 1] = (Math.min(255, c[1] * m) / 5 | 0) * 5;
      this.waterLUT[i + 2] = (Math.min(255, c[2] * m) / 5 | 0) * 5;
    }
    // how much of the seabed shows through, quantized into 6 steps.
    // It never reaches 1: there is always a film of water over the reef.
    this.visLUT = new Float32Array(16);
    this.shoalLUT = new Float32Array(16);
    for (let b = 0; b < 16; b++) {
      const d = b / 15;
      // a touch more water film over the reef: the detail is still there, but
      // the play field reads clearly against it at the zoomed-in camera
      this.visLUT[b] = Math.max(0.06, Math.round(clamp((0.92 - d) / 0.55, 0, 1) * 5) / 5 * 0.50);
      this.shoalLUT[b] = 1.38 - d * 0.55;
    }
    // light absorption: water eats red first, then green, so the reef turns
    // blue-green as it sinks.  absX[band] multiplies the seabed; cX[band*4+lvl]
    // is the caustic light ADDED on top (an add, not a multiply, so bright
    // sand steps up a shade instead of blowing out to white).
    const causAdd = [0, 24, 50, 86];
    this.absR = new Float32Array(16); this.absG = new Float32Array(16); this.absB = new Float32Array(16);
    this.cR = new Float32Array(64); this.cG = new Float32Array(64); this.cB = new Float32Array(64);
    for (let b = 0; b < 16; b++) {
      const d = b / 15;
      const ar = 0.82 - d * 0.38, ag = 0.98 - d * 0.28, ab = 1.06 - d * 0.12;
      this.absR[b] = ar; this.absG[b] = ag; this.absB[b] = ab;
      for (let c = 0; c < 4; c++) {
        this.cR[b * 4 + c] = causAdd[c] * ar * 0.85;
        this.cG[b * 4 + c] = causAdd[c] * ag;
        this.cB[b * 4 + c] = causAdd[c] * ab;
      }
    }
    // sand ramps: warm shallow sand -> olive shelf -> grey silt
    const A = ['#e4d49c', '#d2bf86', '#bfa972', '#a8925f', '#907c4c'].map(hx);
    const B = ['#c8bd8c', '#b4a97a', '#9d9268', '#867c58', '#70674a'].map(hx);
    const C = ['#8f9a92', '#7d8778', '#6a7469', '#58625a', '#48514b'].map(hx);
    this.sandPal = [];
    for (let b = 0; b < 16; b++) {
      const k = b / 15, ramp = [];
      for (let s = 0; s < 5; s++) {
        const c = k < 0.5 ? [lerp(A[s][0], B[s][0], k * 2), lerp(A[s][1], B[s][1], k * 2), lerp(A[s][2], B[s][2], k * 2)]
          : [lerp(B[s][0], C[s][0], (k - 0.5) * 2), lerp(B[s][1], C[s][1], (k - 0.5) * 2), lerp(B[s][2], C[s][2], (k - 0.5) * 2)];
        ramp.push([c[0] | 0, c[1] | 0, c[2] | 0]);
      }
      this.sandPal.push(ramp);
    }
    this.rockPal = [
      ['#96a2aa', '#7e8a92', '#66717a', '#4f5a62', '#3c454c'].map(hx),
      ['#a29579', '#8b7f68', '#736955', '#5c5345', '#484137'].map(hx),
      ['#737f8d', '#5f6a78', '#4d5660', '#3c444d', '#2e353c'].map(hx),
    ];
    this.coralPal = [
      ['#ffb8d4', '#f2739f', '#c74a79', '#8f2c52'].map(hx), // pink
      ['#ffd79a', '#ff9a3c', '#d9722a', '#a04c1a'].map(hx), // orange
      ['#fff0a8', '#f2c744', '#cfa22c', '#96711a'].map(hx), // yellow
      ['#a8f4e4', '#43cbb4', '#2b9c89', '#1a6a5e'].map(hx), // teal
      ['#e0bcff', '#a06cd6', '#7448a8', '#4e2d74'].map(hx), // violet
      ['#ffa599', '#e2574c', '#b33a33', '#7f2620'].map(hx), // red
      ['#c8f7a8', '#6fd88e', '#43a862', '#2a7340'].map(hx), // green
      ['#b4dfff', '#5fa8e8', '#3b79b8', '#254f80'].map(hx), // blue
    ];
    this.starPal = [['#ff9a3c', '#ffd79a'], ['#f2739f', '#ffb8d4'], ['#a06cd6', '#e0bcff'],
    ['#e2574c', '#ffa599'], ['#5fa8e8', '#b4dfff'], ['#f2c744', '#fff0a8']].map(p => p.map(hx));
    this.shellPal = [['#f6e6c8', '#d8bf96'], ['#fbd7cf', '#dda8a0'], ['#e8e2f0', '#bdb4cc']].map(p => p.map(hx));
    this.weedPal = ['#3f9a54', '#2f7d4a', '#56a84a', '#276b40', '#7ab84f', '#8f6f3a', '#a04e6e'].map(hx);
    this.foamC = hx('#eef9ff'); this.bloodC = hx('#6e0a12'); this.bloodBright = hx('#c41c26'); this.oilC = hx('#1a1418');
    this.grassC = hx('#5f9a4a'); this.grassC2 = hx('#4c7f3b'); this.grassC3 = hx('#79b558');
    this.sandL = hx('#e6d091'); this.sandD = hx('#c4a86a'); this.sandW = hx('#a98b58');
  }

  // =====================================================================
  //  world build (depth map + seabed art + plants) -- cached across runs
  // =====================================================================
  buildWorld() {
    const key = this.W + 'x' + this.H + 'x' + this.shoreY;
    const c = Ocean._cache;
    if (c && c.key === key) {
      this.depth = c.depth; this.sb = c.sb; this.kelp = c.kelp; this.turf = c.turf;
      this.sbw = c.sbw; this.sbh = c.sbh; this.reefs = c.reefs;
      this.spawnFish();
      return;
    }
    this.sbw = this.W >> 1; this.sbh = this.H >> 1;
    this.depth = new Float32Array(this.gw * this.gh);
    this._warp = new Float32Array(this.gw * this.gh);
    this._patch = new Float32Array(this.gw * this.gh);
    this.buildDepthGrid();
    this.sb = new Uint8ClampedArray(this.sbw * this.sbh * 4);
    this.paintSand();
    const rng = new SeededRandom(90210);
    this.scatterSeabed(rng);
    this.buildPlants(rng);
    this.spawnFish();
    Ocean._cache = { key, depth: this.depth, sb: this.sb, kelp: this.kelp, turf: this.turf, sbw: this.sbw, sbh: this.sbh, reefs: this.reefs };
    this._warp = this._patch = null;
  }

  buildDepthGrid() {
    const gw = this.gw, gh = this.gh, c = this.cell, sh = this.shoreY;
    const d = this.depth, w = this._warp, p = this._patch;
    for (let gy = 0; gy < gh; gy++) {
      const wy = gy * c;
      for (let gx = 0; gx < gw; gx++) {
        const wx = gx * c, i = gy * gw + gx;
        const n = vnoise(wx * 0.0021, wy * 0.0021) * 0.56 + vnoise(wx * 0.0058, wy * 0.0058) * 0.29 + vnoise(wx * 0.016, wy * 0.016) * 0.15;
        // the shelf drops away fast, then noise carves banks, channels & reefs
        let v = clamp((wy - sh) / 980, 0, 1.25) * 0.94 + (n - 0.47) * 0.46;
        const near = (wy - sh) / 170;
        if (near < 1) v = Math.min(v, Math.max(0, near) * 0.26);
        d[i] = clamp(v, 0, 1);
        w[i] = vnoise(wx * 0.0062, wy * 0.0062);
        p[i] = vnoise(wx * 0.0125 + 40, wy * 0.0125 - 17);
      }
    }
  }

  depthAt(x, y) { return this.sample(this.depth, x, y); }

  // ---- base sand, dunes, silt & seagrass meadows -----------------------
  paintSand() {
    const sw = this.sbw, sh2 = this.sbh, buf = this.sb;
    const y0 = Math.max(0, (this.shoreY - 60) >> 1);
    const rowD = new Float32Array(sw), rowW = new Float32Array(sw), rowP = new Float32Array(sw);
    const K = _OS_K;
    for (let y = y0; y < sh2; y++) {
      const wy = y * 2;
      this.fillRow(rowD, this.depth, wy, 0, sw, 2);
      this.fillRow(rowW, this._warp, wy, 0, sw, 2);
      this.fillRow(rowP, this._patch, wy, 0, sw, 2);
      let i = (y * sw) << 2;
      for (let x = 0; x < sw; x++, i += 4) {
        const wx = x * 2, dp = rowD[x];
        let band = (dp * 15.999) | 0; if (band > 15) band = 15;
        const ramp = this.sandPal[band];
        // wind-blown ripple dunes: a warped sine, posterized into 5 shades
        const ph = (wy * 0.086 + rowW[x] * 16 + _OS[((wx * 0.030 * K) | 0) & _OS_M] * 2.4) * K;
        const rp = _OS[(ph | 0) & _OS_M] + _OS[((wx * 0.052 * K + wy * 0.018 * K) | 0) & _OS_M] * 0.45;
        let s = rp > 0.75 ? 0 : rp > 0.22 ? 1 : rp > -0.28 ? 2 : rp > -0.85 ? 3 : 4;
        const h = hash2(x, y);
        if (h > 0.965) s = s > 0 ? s - 1 : 1;         // shell grit
        else if (h < 0.028) s = s < 4 ? s + 1 : 3;    // dark pebble
        let r = ramp[s][0], g = ramp[s][1], b = ramp[s][2];
        // seagrass meadows tint big soft patches olive-green
        const mw = rowP[x];
        if (mw > 0.60 && dp < 0.52) {
          const k = Math.min(1, (mw - 0.60) * 4.2) * (1 - dp / 0.52) * 0.72;
          const dith = ((x + (y & 1)) & 1) === 0 ? 1 : 0.7;
          r += (52 - r) * k * dith; g += (104 - g) * k * dith; b += (58 - b) * k * dith;
        }
        buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
      }
    }
  }

  // ---- seabed pixel helpers (build time only) --------------------------
  _px(x, y, r, g, b) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.sbw || y >= this.sbh) return;
    const i = (y * this.sbw + x) << 2, d = this.sb;
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  _pc(x, y, c) { this._px(x, y, c[0], c[1], c[2]); }
  _shade(x, y, k) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.sbw || y >= this.sbh) return;
    const i = (y * this.sbw + x) << 2, d = this.sb;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  _disc(cx, cy, r, c) { const r2 = r * r; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r2) this._pc(cx + x, cy + y, c); }
  _shadow(cx, cy, r) { const r2 = r * r; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const q = x * x + y * y; if (q <= r2) this._shade(cx + x + 1, cy + y + 2, q > r2 * 0.55 ? 0.86 : 0.72); } }
  _thick(x0, y0, x1, y1, w, c) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const h = (w - 1) / 2;
    for (let i = 0; i <= n; i++) {
      const x = x0 + dx * i / n, y = y0 + dy * i / n;
      for (let oy = -h; oy <= h; oy++) for (let ox = -h; ox <= h; ox++) this._pc(x + ox, y + oy, c);
    }
  }

  // ---- individual seabed props -----------------------------------------
  _rock(rng, cx, cy, r) {
    const pal = this.rockPal[rng.int(0, this.rockPal.length - 1)];
    this._shadow(cx, cy, r);
    const lobes = [{ x: 0, y: 0, r: r * 0.88 }];
    const nl = rng.int(3, 5);
    for (let i = 0; i < nl; i++) lobes.push({ x: rng.range(-r * 0.5, r * 0.5), y: rng.range(-r * 0.45, r * 0.45), r: rng.range(r * 0.42, r * 0.8) });
    const R = Math.ceil(r) + 2;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      let inside = false, edge = 9;
      for (let i = 0; i < lobes.length; i++) {
        const L = lobes[i], dx = x - L.x, dy = y - L.y;
        const dd = Math.sqrt(dx * dx + dy * dy) - L.r;
        if (dd < 0) inside = true;
        if (dd < edge) edge = dd;
      }
      if (!inside) continue;
      const tt = (-x * 0.8 - y * 1.1) / (r * 2) + 0.5;
      let s = tt > 0.70 ? 0 : tt > 0.52 ? 1 : tt > 0.34 ? 2 : 3;
      if (edge > -1.4) s = Math.min(4, s + 1);
      if (hash2(cx + x, cy + y) > 0.90) s = Math.max(0, s - 1);
      this._pc(cx + x, cy + y, pal[s]);
    }
    // algae crust on the sunlit top
    if (rng.next() < 0.7) {
      const moss = this.weedPal[rng.int(0, 3)];
      for (let i = 0; i < r * 2.4; i++) {
        const a = rng.range(0, TAU), d = rng.range(0, r * 0.7);
        this._pc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8 - r * 0.25, moss);
      }
    }
  }

  _brain(rng, cx, cy, r, pal) {
    this._shadow(cx, cy, r);
    const f = rng.range(1.5, 2.3), o = rng.range(0, 9), R = Math.ceil(r);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const q = x * x + y * y; if (q > r * r) continue;
      const d = Math.sqrt(q);
      const w = Math.sin(d * f + Math.sin(x * 0.8 + o) * 1.25 + Math.sin(y * 0.72 - o) * 1.25);
      let c = w > 0.3 ? pal[0] : w > -0.3 ? pal[1] : pal[2];
      if (d > r - 1.1) c = pal[3];
      this._pc(cx + x, cy + y, c);
    }
  }

  _branchArm(rng, x, y, a, len, w, depth, pal) {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len * 0.85;
    this._thick(x, y, x2, y2, w, depth === 0 ? pal[1] : pal[2]);
    if (depth > 0) {
      this._branchArm(rng, x2, y2, a + rng.range(0.35, 0.85), len * 0.62, Math.max(1, w - 1), depth - 1, pal);
      this._branchArm(rng, x2, y2, a - rng.range(0.35, 0.85), len * 0.62, Math.max(1, w - 1), depth - 1, pal);
    } else { this._pc(x2, y2, pal[0]); this._pc(x2 + 1, y2, pal[0]); }
  }
  _branchCoral(rng, cx, cy, r, pal) {
    this._shadow(cx, cy, Math.max(2, r * 0.6));
    const n = rng.int(4, 7), a0 = rng.range(0, TAU);
    for (let i = 0; i < n; i++) this._branchArm(rng, cx, cy, a0 + i / n * TAU + rng.range(-0.25, 0.25), r * rng.range(0.65, 1.0), Math.max(2, (r * 0.3) | 0), 2, pal);
    this._disc(cx, cy, Math.max(1, (r * 0.26) | 0), pal[2]);
  }

  _fanCoral(rng, cx, cy, r, pal) {
    this._shadow(cx, cy, Math.max(2, r * 0.45));
    const a0 = rng.range(0, TAU), spread = rng.range(1.1, 1.8), ribs = rng.int(7, 11);
    for (let i = 0; i < ribs; i++) {
      const f = ribs > 1 ? i / (ribs - 1) - 0.5 : 0;
      const a = a0 + f * spread, len = r * (1 - Math.abs(f) * 0.42);
      let x = cx, y = cy;
      for (let s = 0; s < len; s++) {
        const aa = a + Math.sin(s * 0.3 + i) * 0.06;
        x += Math.cos(aa); y += Math.sin(aa) * 0.9;
        this._pc(x, y, s > len - 2.5 ? pal[0] : pal[1]);
      }
    }
    for (let k = 0; k < 2; k++) {
      const rr = r * (0.45 + k * 0.3);
      for (let i = 0; i <= 20; i++) {
        const a = a0 + (i / 20 - 0.5) * spread * 0.92;
        this._pc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9, pal[2]);
      }
    }
    this._disc(cx, cy, 1, pal[3]);
  }

  _plateCoral(rng, cx, cy, r, pal) {
    this._shadow(cx, cy, r);
    const ry = Math.max(2, r * rng.range(0.58, 0.86)), R = Math.ceil(r), RY = Math.ceil(ry);
    for (let y = -RY; y <= RY; y++) for (let x = -R; x <= R; x++) {
      const q = (x * x) / (r * r) + (y * y) / (ry * ry); if (q > 1) continue;
      const ring = (q * 4.5) | 0;
      let c = q > 0.88 ? pal[3] : (ring & 1) ? pal[1] : pal[0];
      if (y > ry * 0.45) c = pal[2];
      this._pc(cx + x, cy + y, c);
    }
  }

  _anemone(rng, cx, cy, r, pal) {
    this._disc(cx, cy, Math.max(1, r * 0.55), pal[3]);
    const n = rng.int(10, 16), a0 = rng.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU, L = r * rng.range(0.8, 1.3);
      for (let s = 0; s <= L; s++) {
        const aa = a + Math.sin(s * 0.55 + i) * 0.28;
        this._pc(cx + Math.cos(aa) * s, cy + Math.sin(aa) * s * 0.85, s > L - 1.5 ? pal[0] : pal[1]);
      }
    }
  }

  _starfish(rng, cx, cy, r, pair) {
    const a0 = rng.range(0, TAU);
    for (let i = 0; i < 5; i++) {
      const a = a0 + i * TAU / 5;
      for (let s = 0; s <= r; s++) {
        const w = (1 - s / r) * 1.7;
        for (let o = -w; o <= w; o += 1) this._pc(cx + Math.cos(a) * s - Math.sin(a) * o, cy + Math.sin(a) * s + Math.cos(a) * o, pair[0]);
      }
    }
    this._disc(cx, cy, 1, pair[1]);
  }

  _shell(rng, cx, cy, pair) {
    if (rng.next() < 0.5) {
      const a0 = rng.range(0, TAU), r = rng.int(2, 4);
      for (let i = -2; i <= 2; i++) { const a = a0 + i * 0.32; for (let s = 0; s <= r; s++) this._pc(cx + Math.cos(a) * s, cy + Math.sin(a) * s, (i & 1) ? pair[1] : pair[0]); }
    } else {
      let a = rng.range(0, TAU);
      for (let s = 0; s < 13; s++) { const rr = s * 0.26; this._pc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, s > 8 ? pair[1] : pair[0]); a += 0.64; }
    }
  }

  _urchin(rng, cx, cy, r) {
    const body = rng.next() < 0.35 ? [58, 40, 92] : [36, 28, 48];
    const spike = rng.next() < 0.35 ? [110, 74, 168] : [24, 18, 34];
    this._shadow(cx, cy, r);
    const n = rng.int(10, 15), a0 = rng.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + rng.range(-0.12, 0.12), L = r + rng.range(1.6, 3.6);
      for (let s = r - 1; s <= L; s++) this._px(cx + Math.cos(a) * s, cy + Math.sin(a) * s * 0.9, spike[0], spike[1], spike[2]);
    }
    this._disc(cx, cy, r, body);
    this._px(cx - 1, cy - 1, body[0] + 34, body[1] + 28, body[2] + 44);
  }

  _turfPatch(rng, cx, cy, r) {
    const c0 = this.weedPal[rng.int(0, 3)], c1 = this.weedPal[rng.int(0, 4)];
    const n = (r * r * 0.5) | 0;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU), d = rng.range(0, r);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
      const h = rng.range(2, 5), lean = rng.range(-1.2, 1.2);
      for (let s = 0; s < h; s++) this._pc(x + lean * (s / h) * (s / h), y - s, s > h - 1.6 ? c1 : c0);
    }
  }

  // ---- scatter everything ---------------------------------------------
  scatterSeabed(rng) {
    const W = this.W, H = this.H, sh = this.shoreY;
    // reef zones: the only places corals get really dense, so the seabed
    // stays mostly open sand with reefs as landmarks
    const reefs = [];
    for (let i = 0; i < 30; i++) {
      for (let k = 0; k < 60; k++) {
        const x = rng.range(100, W - 100), y = rng.range(sh + 110, H - 100);
        if (this.depthAt(x, y) < 0.40) { reefs.push({ x, y, r: rng.range(70, 190) }); break; }
      }
    }
    this.reefs = reefs;
    const inReef = (x, y) => { for (let i = 0; i < reefs.length; i++) { const r = reefs[i]; if (dist(x, y, r.x, r.y) < r.r * 1.25) return true; } return false; };
    // boulders: sparse in the lagoon, common on the mid shelf
    for (let i = 0; i < 1600; i++) {
      const x = rng.range(20, W - 20), y = rng.range(sh + 36, H - 20), dp = this.depthAt(x, y);
      if (rng.next() > 0.10 + dp * 0.42) continue;
      this._rock(rng, x >> 1, y >> 1, rng.range(2.5, 8) * (0.7 + dp * 0.8));
    }
    // reef corals
    for (const rf of reefs) {
      const n = (rf.r * 0.34) | 0;
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, TAU), d = Math.sqrt(rng.range(0, 1));
        const x = rf.x + Math.cos(a) * rf.r * d, y = rf.y + Math.sin(a) * rf.r * d * 0.85;
        if (x < 10 || y < sh + 24 || x > W - 10 || y > H - 10) continue;
        if (this.depthAt(x, y) > 0.66) continue;
        this._coral(rng, x >> 1, y >> 1);
      }
      // coral rubble skirt
      for (let i = 0; i < rf.r * 0.35; i++) {
        const a = rng.range(0, TAU), d = rng.range(0.85, 1.3);
        const pal = this.coralPal[rng.int(0, 7)];
        this._pc((rf.x + Math.cos(a) * rf.r * d) >> 1, (rf.y + Math.sin(a) * rf.r * d * 0.85) >> 1, pal[3]);
      }
    }
    // a thin sprinkle of lone coral heads out on the open sand
    for (let i = 0; i < 2600; i++) {
      const x = rng.range(20, W - 20), y = rng.range(sh + 44, H - 20);
      const dp = this.depthAt(x, y);
      if (dp > 0.5 || rng.next() > 0.10 - dp * 0.12) continue;
      this._coral(rng, x >> 1, y >> 1);
    }
    // anemones & urchins hug the reefs
    for (let i = 0; i < 1400; i++) {
      const x = rng.range(20, W - 20), y = rng.range(sh + 40, H - 20);
      if (this.depthAt(x, y) > 0.55 || (!inReef(x, y) && rng.next() > 0.08)) continue;
      this._anemone(rng, x >> 1, y >> 1, rng.range(2, 4), this.coralPal[rng.int(0, 7)]);
    }
    for (let i = 0; i < 1600; i++) {
      const x = rng.range(20, W - 20), y = rng.range(sh + 40, H - 20);
      if (this.depthAt(x, y) > 0.62 || (!inReef(x, y) && rng.next() > 0.09)) continue;
      this._urchin(rng, x >> 1, y >> 1, rng.range(1.6, 2.8));
    }
    for (let i = 0; i < 420; i++) {
      const x = rng.range(20, W - 20), y = rng.range(sh + 30, H - 20);
      if (this.depthAt(x, y) > 0.62) continue;
      this._starfish(rng, x >> 1, y >> 1, rng.range(2.2, 4), this.starPal[rng.int(0, this.starPal.length - 1)]);
    }
    for (let i = 0; i < 1400; i++) {
      const x = rng.range(10, W - 10), y = rng.range(sh + 20, H - 10);
      if (this.depthAt(x, y) > 0.6) continue;
      this._shell(rng, x >> 1, y >> 1, this.shellPal[rng.int(0, this.shellPal.length - 1)]);
    }
    // seagrass meadows: clumped, following the big olive patches
    for (let i = 0; i < 3000; i++) {
      const x = rng.range(10, W - 10), y = rng.range(sh + 30, H - 10);
      const dp = this.depthAt(x, y);
      if (dp > 0.5 || this.sample(this._patch, x, y) < 0.58 || rng.next() > 0.5) continue;
      this._turfPatch(rng, x >> 1, y >> 1, rng.range(4, 11));
    }
  }
  _coral(rng, sx, sy) {
    const pal = this.coralPal[rng.int(0, 7)], k = rng.next();
    if (k < 0.30) this._brain(rng, sx, sy, rng.range(3, 8), pal);
    else if (k < 0.62) this._branchCoral(rng, sx, sy, rng.range(4, 11), pal);
    else if (k < 0.84) this._fanCoral(rng, sx, sy, rng.range(4, 10), pal);
    else this._plateCoral(rng, sx, sy, rng.range(4, 9), pal);
  }

  // ---- swaying plants (drawn as sprites over the seabed) ---------------
  // put a colour through the exact same water column the per-pixel pass uses,
  // so sprites drawn over the seabed sit in the same fog
  fogCss(c, dp, mulv) {
    let band = (dp * 15.999) | 0; band = clamp(band, 0, 15);
    const v = this.visLUT[band], w = this.waterRamp[band];
    const r = clamp(w[0] + (c[0] * mulv * this.absR[band] - w[0]) * v, 0, 255) | 0;
    const g = clamp(w[1] + (c[1] * mulv * this.absG[band] - w[1]) * v, 0, 255) | 0;
    const b = clamp(w[2] + (c[2] * mulv * this.absB[band] - w[2]) * v, 0, 255) | 0;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  buildPlants(rng) {
    const W = this.W, H = this.H, sh = this.shoreY;
    this.kelp = []; this.turf = [];
    for (let i = 0; i < 12000 && this.kelp.length < 1500; i++) {
      const x = rng.range(8, W - 8), y = rng.range(sh + 34, H - 8);
      const dp = this.depthAt(x, y);
      if (dp > 0.66 || rng.next() > 0.30 - dp * 0.22) continue;
      const base = this.weedPal[rng.int(0, this.weedPal.length - 1)];
      const hgt = rng.range(9, 34) * (1 - dp * 0.35);
      this.kelp.push({
        x, y, dp, sh: hgt, segs: Math.max(4, (hgt / 2.6) | 0), w: rng.next() < 0.3 ? 2 : 1,
        amp: rng.range(1.4, 4.2), lean: rng.range(-2, 2), sp: rng.range(0.7, 1.5), ph: rng.range(0, TAU),
        leaf: rng.next() < 0.45,
        c0: this.fogCss(base, dp, 1.32), c1: this.fogCss(base, dp, 1.0), c2: this.fogCss(base, dp, 0.68),
      });
    }
    for (let i = 0; i < 12000 && this.turf.length < 1100; i++) {
      const x = rng.range(8, W - 8), y = rng.range(sh + 26, H - 8);
      const dp = this.depthAt(x, y);
      if (dp > 0.56 || this.sample(this._patch, x, y) < 0.52 || rng.next() > 0.45) continue;
      const base = this.weedPal[rng.int(0, 4)];
      this.turf.push({
        x, y, dp, n: rng.int(5, 9), r: rng.range(3, 8), h: rng.range(5, 12),
        seed: rng.int(1, 99999), sp: rng.range(1.1, 2.0), ph: rng.range(0, TAU),
        c1: this.fogCss(base, dp, 1.0), c0: this.fogCss(base, dp, 1.3),
      });
    }
  }

  spawnFish() {
    const rng = new SeededRandom(5150);
    this.fish = [];
    const cols = ['#ffd27a', '#8ac6ff', '#ff9ecb', '#6fd88e', '#e6f2ff', '#ff9a3c'];
    for (let s = 0; s < 14; s++) {
      const cx = rng.range(120, this.W - 120), cy = rng.range(this.shoreY + 140, this.H - 120);
      const col = cols[rng.int(0, cols.length - 1)], n = rng.int(4, 11);
      for (let i = 0; i < n; i++) {
        this.fish.push({
          x: cx + rng.range(-60, 60), y: cy + rng.range(-40, 40), a: rng.range(0, TAU),
          s: rng.range(16, 42), ph: rng.range(0, TAU), size: rng.range(3, 8),
          school: s, col, hx: cx, hy: cy,
        });
      }
    }
    this.schools = [];
    for (let s = 0; s < 14; s++) this.schools.push({ x: rng.range(120, this.W - 120), y: rng.range(this.shoreY + 140, this.H - 120), a: rng.range(0, TAU) });
  }

  buildCurrents() {
    this.currents = [];
    const rng = new SeededRandom(1337);
    for (let i = 0; i < 7; i++) this.currents.push({
      x: rng.range(200, this.W - 200), y: rng.range(this.shoreY + 300, this.H - 200), r: rng.range(160, 320),
      s: rng.range(40, 90) * (rng.next() < 0.5 ? -1 : 1), type: 'eddy',
    });
    this.currents.push({ x: this.W / 2, y: this.H * 0.62, r: 9999, s: 18, type: 'drift', ang: rng.range(0, TAU) });
    this.streaks = [];
    for (let i = 0; i < 120; i++) this.streaks.push({ x: rng.range(0, this.W), y: rng.range(this.shoreY, this.H), life: rng.range(0, 3), vx: 0, vy: 0 });
  }

  // =====================================================================
  //  public field API (unchanged semantics)
  // =====================================================================
  idx(x, y) { const cx = clamp(Math.floor(x / this.cell), 0, this.gw - 1), cy = clamp(Math.floor(y / this.cell), 0, this.gh - 1); return cy * this.gw + cx; }
  addBlood(x, y, amt) { this.blood[this.idx(x, y)] += amt; this.bloodOn = true; }
  addFoam(x, y, amt) { this.foam[this.idx(x, y)] += amt; this.foamOn = true; }
  addOil(x, y, amt) { this.oil[this.idx(x, y)] += amt; this.oilOn = true; }
  splatBlood(x, y, amt, spread = 20) { for (let i = 0; i < 6; i++) this.addBlood(x + rand(-spread, spread), y + rand(-spread, spread), amt / 6); }
  ripple(x, y, maxR = 30, speed = 40, alpha = 0.7) { if (this.ripples.length < 400) this.ripples.push({ x, y, r: 2, maxR, speed, alpha }); }
  newWake(owner, width = 6) { const w = { pts: [], owner, width, dead: false }; this.wakes.push(w); return w; }

  flow(x, y) {
    let fx = 0, fy = 0;
    for (const c of this.currents) {
      if (c.type === 'drift') { fx += Math.cos(c.ang) * c.s; fy += Math.sin(c.ang) * c.s; continue; }
      const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
      if (d > c.r || d < 1) continue;
      if (c.type === 'lane') { const k = Math.min(1, c.life / 1.5); fx += Math.cos(c.ang) * c.s * k; fy += Math.sin(c.ang) * c.s * k; continue; }
      if (c.type === 'whirl') { const k = (1 - d / c.r) * Math.min(1, c.life / 0.8); fx += (-dy / d * c.s - dx / d * c.s * 0.7) * k; fy += (dx / d * c.s - dy / d * c.s * 0.7) * k; continue; }
      const k = (1 - d / c.r) * Math.min(1, d / 60);
      fx += -dy / d * c.s * k; fy += dx / d * c.s * k;
      fx += -dx / d * c.s * 0.15 * k; fy += -dy / d * c.s * 0.15 * k;
    }
    return { x: fx, y: fy };
  }

  waveHeight(x, y, t) {
    const w = Math.sin(y * 0.075 + x * 0.020 + t * 1.30) * 0.46
      + Math.sin(y * 0.031 - x * 0.012 - t * 0.62) * 0.30
      + Math.sin(x * 0.060 + y * 0.050 + t * 2.00) * 0.20
      + Math.sin(x * 0.033 + y * 0.0132 + t * 0.90) * 0.20;
    return w + (this.jelOn ? this.sample(this.jh, x, y) * 0.45 : 0);
  }
  waveLevel(w) { return w < -0.72 ? 0 : w < -0.36 ? 1 : w < 0 ? 2 : w < 0.36 ? 3 : w < 0.66 ? 4 : w < 0.88 ? 5 : 6; }

  // =====================================================================
  //  jelly water: a damped spring/wave grid the world can shove around
  // =====================================================================
  disturb(x, y, strength, vx = 0, vy = 0) {
    const c = this.cell, gw = this.gw, gh = this.gh, v = this.jv;
    const gx = Math.round(x / c), gy = Math.round(y / c);
    if (gx < 1 || gy < 1 || gx >= gw - 1 || gy >= gh - 1) return;
    const s = clamp(strength, -8, 8) * 0.22;
    const i = gy * gw + gx;
    v[i] -= s;
    v[i - 1] -= s * 0.5; v[i + 1] -= s * 0.5; v[i - gw] -= s * 0.5; v[i + gw] -= s * 0.5;
    v[i - gw - 1] -= s * 0.25; v[i - gw + 1] -= s * 0.25; v[i + gw - 1] -= s * 0.25; v[i + gw + 1] -= s * 0.25;
    const sp = Math.hypot(vx, vy);
    if (sp > 1) {
      const ax = Math.round((x + vx / sp * c * 1.7) / c), ay = Math.round((y + vy / sp * c * 1.7) / c);
      if (ax >= 1 && ay >= 1 && ax < gw - 1 && ay < gh - 1) {
        const j = ay * gw + ax, b = s * 0.8;
        v[j] += b; v[j - 1] += b * 0.4; v[j + 1] += b * 0.4; v[j - gw] += b * 0.4; v[j + gw] += b * 0.4;
      }
    }
    this.jelOn = true; this._jelClean = false;
  }
  // damped wave equation + numerical viscosity: the viscosity term kills the
  // single-cell checkerboard mode so the surface is gelatinous, never jittery
  jelStep() {
    const h = this.jh, n2 = this.jh2, v = this.jv, gw = this.gw, gh = this.gh;
    let maxa = 0;
    for (let y = 1; y < gh - 1; y++) {
      const r = y * gw;
      for (let x = 1; x < gw - 1; x++) {
        const i = r + x, hc = h[i];
        const lap = (h[i - 1] + h[i + 1] + h[i - gw] + h[i + gw]) * 0.25 - hc;
        let vv = (v[i] + lap * 0.50) * 0.968;
        if (vv > 2.5) vv = 2.5; else if (vv < -2.5) vv = -2.5;
        v[i] = vv;
        let nh = (hc + vv + lap * 0.22) * 0.990;
        if (nh > 2.5) nh = 2.5; else if (nh < -2.5) nh = -2.5;
        n2[i] = nh;
        const a = nh < 0 ? -nh : nh; if (a > maxa) maxa = a;
      }
    }
    // double buffered: reading a half-updated grid makes the solver blow up
    this.jh = n2; this.jh2 = h;
    return maxa;
  }
  jelGrad() {
    const h = this.jh, gx = this.jgx, gy = this.jgy, gw = this.gw, gh = this.gh;
    for (let y = 1; y < gh - 1; y++) {
      const r = y * gw;
      for (let x = 1; x < gw - 1; x++) {
        const i = r + x;
        gx[i] = (h[i + 1] - h[i - 1]) * 0.5;
        gy[i] = (h[i + gw] - h[i - gw]) * 0.5;
      }
    }
  }

  // =====================================================================
  //  update
  // =====================================================================
  update(dt, t) {
    this.frame++;
    for (let i = this.currents.length - 1; i >= 0; i--) { const c = this.currents[i]; if (c.life !== undefined) { c.life -= dt; if (c.life <= 0) this.currents.splice(i, 1); } }
    if (this.frame % 2 === 0) { if (this.bloodOn) this.bloodOn = this.diffuse(this.blood, this._blood2, 0.19, 0.9915) > 0.004; }
    else { if (this.foamOn) this.foamOn = this.diffuse(this.foam, this._foam2, 0.22, 0.93) > 0.01; }
    if (this.frame % 3 === 0 && this.oilOn) this.oilOn = this.diffuse(this.oil, this._oil2, 0.08, 0.996) > 0.01;
    // jelly: fixed timestep so it stays buttery regardless of framerate
    if (this.jelOn) {
      this.jelAcc += dt;
      let steps = 0, maxa = 0;
      while (this.jelAcc >= 1 / 60 && steps < 3) { maxa = this.jelStep(); this.jelAcc -= 1 / 60; steps++; }
      if (steps) {
        this.jelGrad();
        if (maxa < 0.004) {
          this.jh.fill(0); this.jh2.fill(0); this.jv.fill(0); this.jgx.fill(0); this.jgy.fill(0);
          this.jelOn = false; this._jelClean = true;
        }
      }
    } else this.jelAcc = 0;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]; r.r += r.speed * dt;
      if (r.r >= r.maxR) this.ripples.splice(i, 1);
    }
    for (let i = this.wakes.length - 1; i >= 0; i--) {
      const w = this.wakes[i];
      while (w.pts.length && t - w.pts[0].t > 2.2) w.pts.shift();
      if (w.dead && !w.pts.length) this.wakes.splice(i, 1);
    }
    for (const s of this.streaks) {
      const f = this.flow(s.x, s.y);
      s.x += f.x * dt * 1.5; s.y += f.y * dt * 1.5; s.life -= dt; s.vx = f.x; s.vy = f.y;
      if (s.life <= 0 || s.x < 0 || s.y < this.shoreY || s.x > this.W || s.y > this.H) {
        s.x = rand(0, this.W); s.y = rand(this.shoreY, this.H); s.life = rand(2, 5);
      }
    }
    // schools drift, fish steer toward their school centre
    for (let i = 0; i < this.schools.length; i++) {
      const sc = this.schools[i];
      sc.a += Math.sin(t * 0.3 + i * 1.7) * dt * 0.9;
      sc.x += Math.cos(sc.a) * 26 * dt; sc.y += Math.sin(sc.a) * 26 * dt;
      if (sc.x < 100 || sc.x > this.W - 100) { sc.a = Math.PI - sc.a; sc.x = clamp(sc.x, 100, this.W - 100); }
      if (sc.y < this.shoreY + 100 || sc.y > this.H - 100) { sc.a = -sc.a; sc.y = clamp(sc.y, this.shoreY + 100, this.H - 100); }
    }
    for (const f of this.fish) {
      f.ph += dt * 6;
      const sc = this.schools[f.school];
      const want = angleTo(f.x, f.y, sc.x, sc.y);
      const far = dist(f.x, f.y, sc.x, sc.y);
      f.a = angleLerp(f.a, want, clamp((far - 25) / 120, 0, 1) * dt * 2.4);
      f.a += Math.sin(f.ph * 0.3) * dt * 0.7;
      const fl = this.flow(f.x, f.y);
      f.x += (Math.cos(f.a) * f.s + fl.x * 0.5) * dt; f.y += (Math.sin(f.a) * f.s + fl.y * 0.5) * dt;
      if (f.x < 0 || f.x > this.W) f.a = Math.PI - f.a;
      if (f.y < this.shoreY + 60 || f.y > this.H) f.a = -f.a;
    }
  }

  diffuse(src, dst, k, decay) {
    const gw = this.gw, gh = this.gh;
    let maxv = 0;
    for (let y = 0; y < gh; y++) {
      const y0 = y * gw, ym = y > 0 ? y0 - gw : y0, yp = y < gh - 1 ? y0 + gw : y0;
      for (let x = 0; x < gw; x++) {
        const c = src[y0 + x];
        if (c < 0.001) { dst[y0 + x] = 0; continue; }
        const xm = x > 0 ? x - 1 : x, xp = x < gw - 1 ? x + 1 : x;
        const avg = (src[ym + x] + src[yp + x] + src[y0 + xm] + src[y0 + xp]) * 0.25;
        const v = (c + (avg - c) * k) * decay;
        dst[y0 + x] = v; if (v > maxv) maxv = v;
      }
      for (let x = 0; x < gw; x++) {
        const c = src[y0 + x]; if (c < 0.02) continue;
        const xm = x > 0 ? x - 1 : x, xp = x < gw - 1 ? x + 1 : x;
        const give = c * k * 0.25;
        if (src[ym + x] < 0.001) dst[ym + x] += give;
        if (src[yp + x] < 0.001) dst[yp + x] += give;
        if (src[y0 + xm] < 0.001) dst[y0 + xm] += give;
        if (src[y0 + xp] < 0.001) dst[y0 + xp] += give;
      }
    }
    src.set(dst);
    return maxv;
  }

  sample(field, wx, wy) {
    const fx = wx / this.cell - 0.5, fy = wy / this.cell - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 >= this.gw - 1 || y0 >= this.gh - 1) return 0;
    const tx = fx - x0, ty = fy - y0, i = y0 * this.gw + x0;
    const a = field[i], b = field[i + 1], c = field[i + this.gw], d = field[i + this.gw + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  // bilinear-resolve one horizontal strip of a grid field (no per-pixel div)
  fillRow(out, field, wy, wx0, n, step) {
    const c = this.cell, gw = this.gw, gh = this.gh;
    const fy = wy / c - 0.5;
    let y0 = Math.floor(fy), ty = fy - y0;
    if (y0 < 0) { y0 = 0; ty = 0; } else if (y0 > gh - 2) { y0 = gh - 2; ty = 1; }
    const r0 = y0 * gw, r1 = r0 + gw, sy = 1 - ty, dtx = step / c;
    let fx = wx0 / c - 0.5;
    let x0 = Math.floor(fx), tx = fx - x0;
    for (let i = 0; i < n; i++) {
      if (x0 < 0) out[i] = field[r0] * sy + field[r1] * ty;
      else if (x0 > gw - 2) { const j = gw - 1; out[i] = field[r0 + j] * sy + field[r1 + j] * ty; }
      else {
        const a = field[r0 + x0], b = field[r0 + x0 + 1], cc = field[r1 + x0], d = field[r1 + x0 + 1];
        out[i] = (a + (b - a) * tx) * sy + (cc + (d - cc) * tx) * ty;
      }
      tx += dtx;
      if (tx >= 1) { const k = tx | 0; x0 += k; tx -= k; }
    }
  }

  // =====================================================================
  //  render the background (640x360)
  // =====================================================================
  render(ctx, cam, t) {
    const camX = Math.round(cam.x), camY = Math.round(cam.y);
    const ox = camX & 1, oy = camY & 1;
    const cx2 = camX - ox, cy2 = camY - oy;
    this.cx2 = cx2; this.cy2 = cy2;
    const d = this.data, lw = this.lw, lh = this.lh, shore = this.shoreY;
    const wLUT = this.waterLUT, visLUT = this.visLUT, shoal = this.shoalLUT;
    const absR = this.absR, absG = this.absG, absB = this.absB;
    const cR = this.cR, cG = this.cG, cB = this.cB;
    const sb = this.sb, sbw = this.sbw, sbh = this.sbh, LS = this.ls;
    const rD = this.rD, rJ = this.rJ, rGX = this.rGX, rGY = this.rGY, rB = this.rB, rF = this.rF, rO = this.rO;
    const jelOn = this.jelOn, bloodOn = this.bloodOn, foamOn = this.foamOn, oilOn = this.oilOn;
    const bloodC = this.bloodC, bloodB = this.bloodBright, foamC = this.foamC, oilC = this.oilC;
    const K = _OS_K, M = _OS_M, S = _OS;
    const sparkT = Math.floor(t * 5) * 7;
    const REFR = 12.0, JW = 0.78;
    // wave term constants: [xFreq, yFreq, timeFreq, amp]
    const A1 = 0.46, A2 = 0.30, A3 = 0.20, A4 = 0.20;
    const d1 = 0.020 * LS * K, d2 = -0.012 * LS * K, d3 = 0.060 * LS * K, d4 = 0.033 * LS * K;
    // caustic term constants
    const e1 = 0.079 * LS * K, e2 = -0.061 * LS * K, e3 = 0.031 * LS * K;
    let p = 0;
    for (let py = 0; py < lh; py++) {
      const wy = cy2 + py * LS;
      // ------------------------------------------------ beach & village land
      if (wy < shore - 10) {
        let wx = cx2;
        for (let px = 0; px < lw; px++, p += 4, wx += LS) {
          const n = vnoise(wx * 0.05, wy * 0.05);
          const gl = shore - 120 + n * 60;
          let r, g, b;
          if (wy < gl - 6) {
            const v = 0.94 + hash2(wx >> 3, wy >> 3) * 0.12;
            const c = hash2(wx >> 1, (wy >> 1) + 31) > 0.955 ? this.grassC3 : hash2(wx >> 2, wy >> 2) > 0.5 ? this.grassC : this.grassC2;
            r = c[0] * v; g = c[1] * v; b = c[2] * v;
          } else if (wy < gl + 2 && hash2(wx >> 1, wy >> 1) > 0.45) {
            const c = this.grassC2; r = c[0]; g = c[1]; b = c[2];
          } else {
            const wet = wy > shore - 34 ? clamp((wy - (shore - 34)) / 24, 0, 1) : 0;
            const h = hash2(wx >> 1, wy >> 1);
            let c = h > 0.90 ? this.sandW : h > 0.62 ? this.sandD : this.sandL;
            // tide ribbons
            const tide = S[((wx * 0.03 * K + n * 900) | 0) & M];
            if (tide > 0.72 && wet > 0.05) c = this.sandW;
            r = c[0] * (1 - wet * 0.28); g = c[1] * (1 - wet * 0.26); b = c[2] * (1 - wet * 0.16);
            if (h > 0.995) { r = 240; g = 232; b = 214; }  // shells on the beach
          }
          d[p] = r; d[p + 1] = g; d[p + 2] = b;
        }
        continue;
      }
      // ------------------------------------------------------------- water
      this.fillRow(rD, this.depth, wy, cx2, lw, LS);
      if (jelOn) { this.fillRow(rJ, this.jh, wy, cx2, lw, LS); this.fillRow(rGX, this.jgx, wy, cx2, lw, LS); this.fillRow(rGY, this.jgy, wy, cx2, lw, LS); }
      if (bloodOn) this.fillRow(rB, this.blood, wy, cx2, lw, LS);
      if (foamOn) this.fillRow(rF, this.foam, wy, cx2, lw, LS);
      if (oilOn) this.fillRow(rO, this.oil, wy, cx2, lw, LS);
      let p1 = (wy * 0.075 + cx2 * 0.020 + t * 1.30) * K;
      let p2 = (wy * 0.031 - cx2 * 0.012 - t * 0.62) * K;
      let p3 = (cx2 * 0.060 + wy * 0.050 + t * 2.00) * K;
      let p4 = (cx2 * 0.033 + wy * 0.0132 + t * 0.90) * K;
      let q1 = (cx2 * 0.079 + wy * 0.048 + t * 1.15) * K;
      let q2 = (-cx2 * 0.061 + wy * 0.086 - t * 0.95) * K;
      let q3 = (cx2 * 0.031 - wy * 0.027 + t * 0.55) * K;
      const sbyBase = wy >> 1;   // the seabed buffer is half world resolution
      const nearShore = wy < shore + 70;
      let wx = cx2;
      for (let px = 0; px < lw; px++, p += 4, wx += LS) {
        let wv = A1 * S[(p1 | 0) & M] + A2 * S[(p2 | 0) & M] + A3 * S[(p3 | 0) & M] + A4 * S[(p4 | 0) & M];
        p1 += d1; p2 += d2; p3 += d3; p4 += d4;
        const dp = rD[px];
        let band = (dp * 15.999) | 0; if (band > 15) band = 15; else if (band < 0) band = 0;
        let jh = 0, gx = 0, gy = 0;
        if (jelOn) { jh = rJ[px]; gx = rGX[px]; gy = rGY[px]; }
        wv = wv * shoal[band] + jh * JW;
        const lvl = wv < -0.72 ? 0 : wv < -0.36 ? 1 : wv < 0 ? 2 : wv < 0.36 ? 3 : wv < 0.66 ? 4 : wv < 0.88 ? 5 : 6;
        const vis = visLUT[band];
        const wi = (band * 7 + lvl) * 3;
        const wr = wLUT[wi], wg = wLUT[wi + 1], wb = wLUT[wi + 2];
        let r, g, b;
        if (vis > 0) {
          // --- animated caustics: three warped sine fields, posterized -----
          const s3 = S[(q3 | 0) & M];
          const s1 = S[((q1 + s3 * 210) | 0) & M];
          const s2 = S[((q2 - s3 * 170) | 0) & M];
          const cv = s1 + s2 + s3 * 0.55;
          let cl = cv > 1.98 ? 3 : cv > 1.50 ? 2 : cv > 0.95 ? 1 : 0;
          if (band >= 10) cl = 0; else if (band >= 7 && cl > 0) cl--;
          // --- seabed, refracted by the swell + the jelly field ------------
          let ox2 = wv * 2.4 + gx * REFR; if (ox2 > 6) ox2 = 6; else if (ox2 < -6) ox2 = -6;
          let oy2 = wv * 1.6 + gy * REFR; if (oy2 > 6) oy2 = 6; else if (oy2 < -6) oy2 = -6;
          let sx = (wx >> 1) + (ox2 | 0);
          let sy = sbyBase + (oy2 | 0);
          if (sx < 0) sx = 0; else if (sx >= sbw) sx = sbw - 1;
          if (sy < 0) sy = 0; else if (sy >= sbh) sy = sbh - 1;
          const si = (sy * sbw + sx) << 2, ci = band * 4 + cl;
          const sr = sb[si] * absR[band] + cR[ci], sg = sb[si + 1] * absG[band] + cG[ci], sbb = sb[si + 2] * absB[band] + cB[ci];
          r = wr + (sr - wr) * vis; g = wg + (sg - wg) * vis; b = wb + (sbb - wb) * vis;
        } else {
          r = wr; g = wg; b = wb;
          // deep-water plankton glints keep the gloom alive
          if ((px & 3) === 0 && (py & 3) === 0 && hash2(wx >> 2, (wy >> 2) + sparkT) > 0.986) { r += 26; g += 44; b += 58; }
        }
        q1 += e1; q2 += e2; q3 += e3;
        // --- specular sun glitter on the crests --------------------------
        if (lvl >= 5) {
          const hs = hash2(wx >> 2, (wy >> 2) + sparkT);
          if (hs > (lvl === 6 ? 0.972 : 0.992)) { r = 226; g = 250; b = 255; }
          else if (hs > 0.93 && lvl === 6) { r = (r + 300) * 0.5; g = (g + 330) * 0.5; b = (b + 340) * 0.5; }
        }
        // --- drifting fields ---------------------------------------------
        if (bloodOn) {
          const bl = rB[px];
          if (bl > 0.03) {
            // a thinning, dithered cloud rather than a flat carpet of red: the
            // edges break up into speckle and it never fully hides the water
            let a = bl * 0.62; if (a > 0.78) a = 0.78;
            const dith = ((wx >> 1) + (wy >> 1)) & 1;
            if (a < 0.30 && dith) a *= 0.35;
            const bc = a > 0.52 ? bloodC : bloodB;
            const mm = a * (0.94 + wv * 0.10);
            r += (bc[0] - r) * mm; g += (bc[1] - g) * mm; b += (bc[2] - b) * mm;
          }
        }
        if (oilOn) {
          const ol = rO[px];
          if (ol > 0.03) {
            const mm = Math.min(0.55, ol * 0.6);
            const sheen = S[((wx * 0.2 * K + wy * 0.13 * K + t * K) | 0) & M] * 0.5 + 0.5;
            r += (oilC[0] + sheen * 40 - r) * mm; g += (oilC[1] + sheen * 20 - g) * mm; b += (oilC[2] + sheen * 60 - b) * mm;
          }
        }
        if (foamOn) {
          const fm = rF[px];
          if (fm > 0.12 && hash2(wx >> 1, (wy >> 1) + sparkT) < (fm - 0.1) * 1.1) {
            const mm = Math.min(1, fm * 0.8 + 0.15);
            r += (foamC[0] - r) * mm; g += (foamC[1] - g) * mm; b += (foamC[2] - b) * mm;
          }
        }
        // --- swash & breakers at the village shore -------------------------
        if (nearShore) {
          // stable per-world-cell speckle: the foam edge dissolves into bubbles
          // instead of showing a regular dither grid
          const hz = hash2(wx >> 1, wy >> 1);
          // running swash line: solid crest, bubbly trailing edge
          const sl = shore + 4 + S[((wx * 0.041 * K + t * 1.7 * K) | 0) & M] * 4 + S[((wx * 0.011 * K - t * 0.62 * K) | 0) & M] * 6;
          const dw = wy - sl;
          if (dw > -5 && dw < 0) { r = 238; g = 249; b = 253; }
          else if (dw <= -5) { if (hz < 0.34 + (dw + 5) * 0.06) { r = 238; g = 249; b = 253; } }
          else if (dw < 5 && hz < 0.42 - dw * 0.08) { r += (234 - r) * 0.72; g += (247 - g) * 0.72; b += (252 - b) * 0.72; }
          // a second breaker rolling in behind it
          const s2l = shore + 40 + S[((wx * 0.024 * K + t * 1.15 * K) | 0) & M] * 13;
          const dd = wy - s2l;
          if (dd > -3 && dd < 5 && wv > -0.1) {
            const cov = (dd < 1 ? 0.8 : 0.42 - dd * 0.09) * clamp(wv + 0.35, 0, 1);
            if (hz < cov) { r += (241 - r) * 0.85; g += (251 - g) * 0.85; b += (255 - b) * 0.85; }
          }
        }
        d[p] = r; d[p + 1] = g; d[p + 2] = b;
      }
    }
    this.lctx.putImageData(this.img, 0, 0);
    this.renderLife(t);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.low, -ox, -oy, lw * LS, lh * LS);
  }

  // ---- seaweed / kelp / fish / flow streaks, drawn chunky on the low buffer
  renderLife(t) {
    const g = this.lctx, lw = this.lw, lh = this.lh, cx2 = this.cx2, cy2 = this.cy2;
    const LS = this.ls;
    // seabed flora were authored against a half-resolution buffer; F keeps their
    // world size the same however finely the water is now resolved
    const F = 2 / LS;
    const K = _OS_K, M = _OS_M, S = _OS;
    // seagrass turf
    const turf = this.turf;
    for (let i = 0; i < turf.length; i++) {
      const c = turf[i];
      const lx = ((c.x - cx2) / LS) | 0, ly = ((c.y - cy2) / LS) | 0;
      if (lx < -10 * F || lx > lw + 10 * F || ly < -2 || ly - c.h * F > lh) continue;
      g.fillStyle = c.c1;
      const base = t * c.sp + c.ph;
      // the whole clump leans with the passing swell
      const swell = S[(((c.y * 0.075 + c.x * 0.020 + t * 1.30) * K) | 0) & M] * 1.5;
      for (let k = 0; k < c.n; k++) {
        const dx = (hash2(c.seed, k) * 2 - 1) * c.r * 0.5 * F;
        const hh = c.h * (0.55 + hash2(c.seed, k + 61) * 0.7) * F;
        const ph = hash2(c.seed, k + 131) * 6.283;
        const amp = 1 + hash2(c.seed, k + 211) * 2;
        const segs = Math.max(3, hh / 2 | 0);
        for (let s = 1; s <= segs; s++) {
          const f = s / segs;
          const off = (S[(((base + ph + f * 1.9)) * K | 0) & M] * amp * f * f + swell * f * f) * F;
          g.fillRect(Math.round(lx + dx + off), Math.round(ly - f * hh), F, 2 * F);
        }
      }
      g.fillStyle = c.c0;
      g.fillRect(lx - F, ly - F, 2 * F, F);
    }
    // kelp stalks
    const kelp = this.kelp;
    for (let i = 0; i < kelp.length; i++) {
      const k = kelp[i];
      const lx = ((k.x - cx2) / LS) | 0, ly = ((k.y - cy2) / LS) | 0;
      if (lx < -14 * F || lx > lw + 14 * F || ly < 0 || ly - k.sh * F > lh) continue;
      const segs = k.segs, hh = k.sh * F, base = t * k.sp + k.ph, kw = Math.max(1, k.w * F);
      // swell drag + whatever is currently shoving the jelly field around
      const swell = S[(((k.y * 0.075 + k.x * 0.020 + t * 1.30) * K) | 0) & M] * 2.6
        + S[(((k.y * 0.031 - k.x * 0.012 - t * 0.62) * K) | 0) & M] * 1.6
        + (this.jelOn ? this.sample(this.jgx, k.x, k.y) * 9 : 0);
      g.fillStyle = k.c1;
      let lastX = lx, lastY = ly;
      for (let s = 1; s <= segs; s++) {
        const f = s / segs, ff = f * f;
        const off = (S[(((base + f * 2.2)) * K | 0) & M] * k.amp * ff + (k.lean + swell) * ff) * F;
        const nx = Math.round(lx + off), ny = Math.round(ly - f * hh);
        g.fillRect(nx, ny, kw, 2 * F);
        if (k.leaf && (s % 3) === 0 && s < segs) {
          const dd = (s & 2) ? 1 : -1;
          g.fillRect(nx + dd * 2 * F, ny, 2 * F, F);
        }
        lastX = nx; lastY = ny;
      }
      g.fillStyle = k.c0;
      g.fillRect(lastX, lastY - 2 * F, kw, 2 * F);
      g.fillStyle = k.c2;
      g.fillRect(lx - F, ly, kw + 2 * F, F);
    }
    // fish schools
    const fish = this.fish;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const lx = ((f.x - cx2) / LS) | 0, ly = ((f.y - cy2) / LS) | 0;
      if (lx < -6 || ly < -6 || lx > lw + 6 || ly > lh + 6) continue;
      const dp = this.sample(this.depth, f.x, f.y);
      let band = (dp * 15.999) | 0; band = band > 15 ? 15 : band;
      const vis = this.visLUT[band];
      if (vis <= 0) continue;
      if (!f.css || f.cssB !== band) { f.css = this.fogCss(hexToRgb(f.col), dp, 1.0); f.cssD = this.fogCss(hexToRgb(f.col), dp, 0.55); f.cssB = band; }
      const cx = Math.cos(f.a), sy = Math.sin(f.a);
      const L = Math.max(2, f.size * 0.4 * F) | 0;
      // shadow on the seabed
      g.fillStyle = 'rgba(8,22,44,0.28)';
      g.fillRect(lx + F, ly + 2 * F, L + F, F);
      g.fillStyle = f.css;
      for (let s = 0; s <= L; s++) g.fillRect(Math.round(lx - cx * s), Math.round(ly - sy * s), F, s < L - 1 ? 2 * F : F);
      g.fillRect(Math.round(lx + cx * F), Math.round(ly + sy * F), F, F);
      g.fillStyle = f.cssD;
      const flick = Math.sin(f.ph) * 1.6 * F;
      g.fillRect(Math.round(lx - cx * (L + F) - sy * flick), Math.round(ly - sy * (L + F) + cx * flick), F, F);
    }
    // current streaks: crisp 1px dashes riding the flow
    g.fillStyle = 'rgba(206,238,255,0.17)';
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      const lx = ((s.x - cx2) / LS) | 0, ly = ((s.y - cy2) / LS) | 0;
      if (lx < 0 || ly < 0 || lx > lw || ly > lh) continue;
      const l = Math.hypot(s.vx || 0, s.vy || 0); if (l < 8) continue;
      const k = Math.min(7 * F, l * 0.1 * F) / l;
      const ex = Math.round(lx - s.vx * k), ey = Math.round(ly - s.vy * k);
      const dx = ex - lx, dy = ey - ly, n = Math.max(1, Math.max(Math.abs(dx), Math.abs(dy)));
      for (let j = 0; j <= n; j++) g.fillRect(lx + Math.round(dx * j / n), ly + Math.round(dy * j / n), F, F);
    }
  }

  // =====================================================================
  //  optional pass drawn AFTER the sprites so entities read as submerged
  // =====================================================================
  renderSurfaceOverlay(ctx, cam, t) {
    const camX = Math.round(cam.x), camY = Math.round(cam.y), shore = this.shoreY;
    const K = _OS_K, M = _OS_M, S = _OS;
    const sparkT = Math.floor(t * 8) * 13;
    // 1. broad drifting sun sheen -- two very faint slabs that slide across
    ctx.fillStyle = 'rgba(190,244,255,0.014)';
    for (let i = 0; i < 2; i++) {
      const w = 240 + i * 90;
      let bx = ((i * 430 + t * 17 + Math.sin(t * 0.21 + i * 2.1) * 90 - camX * 0.3) % 1100 + 1100) % 1100 - 240;
      const top = Math.max(0, shore + 10 - camY);
      if (top > 360) break;
      ctx.fillRect(Math.round(bx), top, w, 360 - top);
      ctx.fillRect(Math.round(bx) + (w >> 2), top, w >> 1, 360 - top);
    }
    // 2. sun glitter on the crests, sitting above everything
    const A1 = 0.46, A2 = 0.30, A3 = 0.20;
    ctx.fillStyle = 'rgba(244,253,255,0.85)';
    const d1 = 0.020 * 6 * K, d2 = -0.012 * 6 * K, d3 = 0.060 * 6 * K;
    for (let sy = 0; sy < 360; sy += 6) {
      const wy = camY + sy;
      if (wy < shore + 4) continue;
      let a = (wy * 0.075 + camX * 0.020 + t * 1.30) * K;
      let b = (wy * 0.031 - camX * 0.012 - t * 0.62) * K;
      let c = (camX * 0.060 + wy * 0.050 + t * 2.00) * K;
      for (let sx = 0; sx < 640; sx += 6) {
        const wv = A1 * S[(a | 0) & M] + A2 * S[(b | 0) & M] + A3 * S[(c | 0) & M];
        a += d1; b += d2; c += d3;
        if (wv < 0.70) continue;
        const wx = camX + sx;
        const h = hash2(wx >> 2, (wy >> 2) + sparkT);
        if (h > 0.88) ctx.fillRect(sx + ((h * 5) | 0), sy + ((h * 37) % 5 | 0), 2, 2);
        else if (h > 0.83 && wv > 0.92) ctx.fillRect(sx + 3, sy + 1, 1, 1);
      }
    }
  }

  // =====================================================================
  //  foreground water decals
  // =====================================================================
  renderWakes(ctx, cam, t) {
    for (const w of this.wakes) {
      const n = w.pts.length; if (n < 2) continue;
      for (let i = 1; i < n; i++) {
        const a = w.pts[i - 1], b = w.pts[i];
        const age = t - b.t, k = 1 - age / 2.2; if (k <= 0) continue;
        const spread = w.width * 0.5 + age * 22;
        const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l * spread, ny = dx / l * spread;
        const al = 0.58 * k * k;
        ctx.strokeStyle = `rgba(232,248,255,${al.toFixed(3)})`;
        ctx.lineWidth = age < 0.4 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(a.x + nx - cam.x), Math.round(a.y + ny - cam.y)); ctx.lineTo(Math.round(b.x + nx - cam.x), Math.round(b.y + ny - cam.y));
        ctx.moveTo(Math.round(a.x - nx - cam.x), Math.round(a.y - ny - cam.y)); ctx.lineTo(Math.round(b.x - nx - cam.x), Math.round(b.y - ny - cam.y));
        ctx.stroke();
        // bubbly churn scattered inside the V
        if (k > 0.25) {
          ctx.fillStyle = `rgba(240,252,255,${(0.45 * k * k).toFixed(3)})`;
          const h = hash2(i * 7 + (b.t * 60 | 0), i);
          const f = (h * 2 - 1) * spread * 0.8;
          ctx.fillRect(Math.round(b.x - dy / l * f - cam.x), Math.round(b.y + dx / l * f - cam.y), 1, 1);
        }
        if (age < 0.5) {
          ctx.fillStyle = `rgba(242,252,255,${(0.45 * k).toFixed(2)})`;
          ctx.fillRect(Math.round(b.x - cam.x) - 1, Math.round(b.y - cam.y) - 1, 2, 2);
        }
      }
    }
  }

  renderTempCurrents(ctx, cam, t) {
    for (const c of this.currents) {
      if (c.type === 'lane') {
        const a = Math.min(0.5, c.life / 4 * 0.5);
        ctx.strokeStyle = `rgba(200,240,255,${a.toFixed(2)})`; ctx.lineWidth = 1;
        const sx = c.x - cam.x, sy = c.y - cam.y; if (sx < -40 || sy < -40 || sx > 680 || sy > 400) continue;
        const ph = (t * 3) % 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(sx - Math.cos(c.ang) * (14 - ph * 14)), Math.round(sy - Math.sin(c.ang) * (14 - ph * 14)));
        ctx.lineTo(Math.round(sx + Math.cos(c.ang) * ph * 14), Math.round(sy + Math.sin(c.ang) * ph * 14));
        ctx.stroke();
      } else if (c.type === 'whirl') {
        const sx = c.x - cam.x, sy = c.y - cam.y; if (sx < -150 || sy < -150 || sx > 800 || sy > 500) continue;
        const k = Math.min(1, c.life / 0.8);
        ctx.fillStyle = `rgba(222,246,255,${(0.6 * k).toFixed(2)})`;
        for (let arm = 0; arm < 3; arm++) {
          for (let i = 2; i <= 26; i++) {
            const rr = c.r * (i / 26), ang = arm * TAU / 3 + i * 0.45 - t * 5;
            ctx.fillRect(Math.round(sx + Math.cos(ang) * rr), Math.round(sy + Math.sin(ang) * rr * 0.8), 1, 1);
          }
        }
        ctx.fillStyle = `rgba(8,20,60,${(0.5 * k).toFixed(2)})`;
        ctx.beginPath(); ctx.ellipse(Math.round(sx), Math.round(sy), 12, 9, 0, 0, TAU); ctx.fill();
        if (Math.random() < 0.6) this.addFoam(c.x + rand(-c.r, c.r) * 0.6, c.y + rand(-c.r, c.r) * 0.5, 0.15);
      }
    }
  }

  renderRipples(ctx, cam) {
    for (const r of this.ripples) {
      const sx = Math.round(r.x - cam.x), sy = Math.round(r.y - cam.y);
      if (sx < -r.maxR - 8 || sy < -r.maxR - 8 || sx > 640 + r.maxR + 8 || sy > 360 + r.maxR + 8) continue;
      const k = 1 - r.r / r.maxR;
      const a = r.alpha * k * k;
      if (a < 0.03) continue;
      ctx.fillStyle = `rgba(228,248,255,${a.toFixed(3)})`;
      const rr = Math.round(r.r), ry = Math.max(1, Math.round(r.r * 0.7));
      const n = clamp(Math.round(rr * 1.4), 10, 34);
      for (let i = 0; i < n; i++) {
        const ang = i / n * TAU;
        ctx.fillRect(sx + Math.round(Math.cos(ang) * rr), sy + Math.round(Math.sin(ang) * ry), 1, 1);
      }
    }
  }

  // dark refracted silhouette under an entity
  shadow(ctx, cam, x, y, w, h, t, depth = 1) {
    const wob = Math.sin(t * 3 + x * 0.05) * 1.5;
    const dp = this.sample(this.depth, x, y);
    const sx = Math.round(x - cam.x + 4 + wob), sy = Math.round(y - cam.y + 6);
    ctx.fillStyle = `rgba(6,18,48,${(0.34 * depth * (0.55 + dp * 0.55)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, Math.round(w * 0.55), Math.round(h * 0.55), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(4,14,38,${(0.22 * depth).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(sx + 1, sy + 1, Math.round(w * 0.33), Math.round(h * 0.33), 0, 0, TAU); ctx.fill();
  }
}
Ocean._cache = null;
