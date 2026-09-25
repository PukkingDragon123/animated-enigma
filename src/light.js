// ---- light.js : lighting and grade for the world layer --------------------
// Called once a frame from game.js, after the world has been composed onto
// the presentation canvas and BEFORE any interface is drawn on top of it --
// the HUD is not part of the world and must not be graded with it.
//
// Everything here is pixel-art discipline: integer coordinates, posterized
// bands, hard edges, no gradients, no blur, no antialiasing. Canvas 2D has no
// real shaders, so "shader" here means cheap screen-space passes built out of
// composite modes and baked masks, which is what gets the look without
// costing the frame.
//
//   Light.init()                 build whatever is baked, idempotent
//   Light.render(ctx, G, t)      the pass itself, in full 1280x720 canvas space
//   Light.enabled                false turns the whole thing off
//
// ===========================================================================
//  ONE PASS, AND WHY
// ===========================================================================
//
//  Measured on this machine, each over the whole 1280x720 frame:
//
//      source-over  0.55ms    multiply  1.65ms    lighter  1.45ms
//      overlay      2.12ms    getImageData(full)  12.6ms
//
//  A busy wave-8 fight already spends 14.7ms of a 16.7ms frame. There is about
//  two milliseconds going spare and room for exactly ONE full-screen blend.
//  The first cut of this file used five of them (multiply for a light map,
//  lighter for shafts, lighter for glows, lighter for a thresholded bloom,
//  soft-light for a grade) and measured 24.2ms a frame -- 38fps, a third of
//  the game's frame rate spent on a grade. That is the whole reason for the
//  shape of what follows.
//
//  So every pass here composes into a SINGLE 160x90 RGBA buffer which is
//  blitted up once with plain source-over. source-over is not a compromise,
//  it is the right operator:
//
//      out = dst*(1-a) + C*a
//
//  a lerp of the frame toward a colour -- which is what fog is, what a
//  coloured key light is, and what a vignette is. It also cannot blow out: it
//  saturates AT the light's colour rather than clipping to white, which is
//  exactly what went wrong the first time, when bloom plus additive glow
//  turned the manatee into a white blob you could not read. Two stacked lerps
//  compose exactly into one, so a single blit does the work of both a
//  darkening pass and a lighting pass.
//
// ===========================================================================
//  MATCH THE OCEAN, DO NOT FIGHT IT
// ===========================================================================
//
//  water.js already owns a real light model: visLUT (how much of the bottom
//  the water lets through, per depth band, topping out at 0.50), absR/absG/absB
//  (the water eating red first, then green), posterized caustics off three
//  warped sine fields, and a 16-step ramp from lagoon turquoise to abyssal
//  navy. Every ladder in this file is DERIVED from those tables, the way
//  wildlife.js derives its colour ladder from Ocean.visLUT, so when the water
//  changes the light changes with it and the two never drift apart.
//
//  The fog colour for a band IS that band's own water colour. That makes
//  fogging the water a no-op and fogging a boat a pull toward the water it is
//  sitting in: the grade can only move what is already out of the water's
//  range, which is precisely the pile-of-sprites problem it exists to fix.
//
//  DEPTH IS AMBIENT BOUNCE, NOT FOG ON THE CAMERA SIDE. A boat in deep water
//  floats ON the surface -- there is no water between it and the camera, so
//  literal depth fog over it would be a lie. What IS true is that a pale sand
//  shelf throws a great deal of warm light back up at everything floating over
//  it and the abyss throws back almost none. So the shallows get a warm bounce
//  added and the deep end gets a cool, dim push. Same arithmetic, honest
//  physics, and it applies correctly to things on the surface as well as under
//  it.
//
const Light = {
  enabled: true,

  // ---- tunables ---------------------------------------------------------
  // The field buffer. 160x90 puts one cell on 8 screen pixels, which is 4
  // world units: coarse enough to be nearly free, fine enough that a banded
  // light disc reads as chunky pixel art instead of a polygon.
  LW: 160, LH: 90,

  FOG: 0.30,      // how far the deep end pulls the frame toward its own water
  BOUNCE: 0.150,  // warm light the sand shelf throws back up at everything
  CAUST: 0.115,   // surface caustics playing over the top of everything
  SHAFT: 0.052,   // broad shafts coming down off the swell
  VIG: 0.28,      // corner falloff
  LAND: 0.105,    // direct sun on the village, above the waterline
  HERO: 0.45,     // how much of the depth push the hero is spared, so she reads

  _built: false, _ramp: null, _err: 0,

  // =========================================================================
  //  BAKED TABLES
  // =========================================================================
  init() {
    if (this._built) return;
    const N = 2048;
    this._S = new Float32Array(N);              // integer-phase sine, as water.js
    for (let i = 0; i < N; i++) this._S[i] = Math.sin(i / N * Math.PI * 2);
    this._SK = N / (Math.PI * 2);

    const LW = this.LW, LH = this.LH, n = LW * LH;
    this._buf = document.createElement('canvas');
    this._buf.width = LW; this._buf.height = LH;
    this._bctx = this._buf.getContext('2d');
    this._bctx.imageSmoothingEnabled = false;
    this._img = this._bctx.createImageData(LW, LH);
    this._d = this._img.data;

    // point-light accumulators: alpha, and colour premultiplied by it
    this._pA = new Float32Array(n);
    this._pR = new Float32Array(n); this._pG = new Float32Array(n); this._pB = new Float32Array(n);
    this._row = new Float32Array(LW);           // one row of ocean depth

    // 1/A for a quantized A, so the un-premultiply in the compose costs a
    // table read instead of a divide, fourteen thousand times a frame.
    this._RCP = new Float32Array(65); this._AB = new Uint8Array(65);
    for (let k = 1; k <= 64; k++) { this._RCP[k] = 64 / k; this._AB[k] = Math.min(255, (k * 255 / 64) | 0); }

    // ---- vignette, baked once in screen space ---------------------------
    // Quantized against a 4x4 Bayer so the falloff breaks into a chunky
    // ordered dither instead of showing as clean rings. A smooth gradient is
    // the one thing this art style cannot have.
    this._vig = new Float32Array(n);
    for (let y = 0; y < LH; y++) {
      const ny = (y + 0.5) / LH * 2 - 1;
      for (let x = 0; x < LW; x++) {
        const nx = ((x + 0.5) / LW * 2 - 1) * 0.94;
        const r = Math.sqrt(nx * nx + ny * ny);
        let v = (r - 0.58) / 0.62; v = v < 0 ? 0 : v > 1 ? 1 : v;
        v = v * v * (3 - 2 * v);
        const dth = (Light.BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
        let q = ((v * 6) + dth) | 0; if (q < 0) q = 0; else if (q > 6) q = 6;
        this._vig[y * LW + x] = q / 6;
      }
    }
    this._lights = [];
    this._fireBuckets = [];
    this._lamps = null; this._lampKey = -1;
    this._built = true;
  },

  BAYER: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],

  // ---- colour ladders, derived from whatever water.js currently is -------
  // Re-baked if the ocean's palette is ever rebuilt, the same way wildlife.js
  // rederives from Ocean.visLUT rather than carrying its own copy.
  _bake(oc) {
    if (this._ramp === oc.waterRamp) return;
    this._ramp = oc.waterRamp;
    const q = v => (Math.max(0, Math.min(255, v)) / 5 | 0) * 5;   // water.js posterizes in fives
    const ramp = oc.waterRamp, vis = oc.visLUT;

    // How much of its own colour the water lets through, normalized against
    // visLUT's ceiling of 0.50: 1 in the lagoon, about 0.12 in the abyss, and
    // already quantized into visLUT's six steps, so every ladder built on top
    // of it inherits those steps for free.
    const lit = new Float32Array(16);
    for (let b = 0; b < 16; b++) lit[b] = Math.max(0, Math.min(1, vis[b] / 0.50));

    this._fogA = new Float32Array(16);
    this._fogR = new Float32Array(16); this._fogG = new Float32Array(16); this._fogB = new Float32Array(16);
    this._bncA = new Float32Array(16);
    this._bncR = new Float32Array(16); this._bncG = new Float32Array(16); this._bncB = new Float32Array(16);
    this._cstA = new Float32Array(16);
    this._shfA = new Float32Array(16);

    for (let b = 0; b < 16; b++) {
      const c = ramp[b], k = lit[b], dd = b / 15;
      // --- the deep push: toward this band's OWN water colour, darkened. The
      // light that is not coming back up off a sand shelf is simply missing.
      this._fogA[b] = (1 - k) * this.FOG;
      const dk = 0.74 - dd * 0.16;
      this._fogR[b] = q(c[0] * dk * 0.80);      // red goes first, as absR does
      this._fogG[b] = q(c[1] * dk * 0.97);
      this._fogB[b] = q(c[2] * dk * 1.06);
      // --- the shallow bounce: warm sand light carrying the band's own cast,
      // so it never reads as a yellow filter laid over teal water.
      this._bncA[b] = k * k * this.BOUNCE;
      this._bncR[b] = q(171 + c[0] * 0.95);
      this._bncG[b] = q(167 + c[1] * 0.62);
      this._bncB[b] = q(141 + c[2] * 0.62);
      // --- caustics live where the surface can still focus light onto things
      this._cstA[b] = k * k * k * this.CAUST;
      // --- shafts read in the middle water: no room at the shore, no light
      // left in the gloom. A hump, not a ramp.
      const s = Math.sin(Math.max(0, Math.min(1, (b - 1) / 10)) * Math.PI);
      this._shfA[b] = s * s * this.SHAFT;
    }
    // caustic and shaft colour: sunlight cooling as it sinks, the same way
    // absR/absG/absB eat the warm end out of it on the way down
    this._sunR = new Float32Array(16); this._sunG = new Float32Array(16); this._sunB = new Float32Array(16);
    for (let b = 0; b < 16; b++) {
      const dd = b / 15;
      this._sunR[b] = q(255 - dd * 74); this._sunG[b] = q(250 - dd * 16); this._sunB[b] = q(219 + dd * 36);
    }
    // the corners fall off toward the bottom of the ramp, not toward black:
    // this sea never bottoms out at black and neither should the vignette
    const deep = ramp[15];
    this._vigR = q(deep[0] * 0.30); this._vigG = q(deep[1] * 0.34); this._vigB = q(deep[2] * 0.40);
  },

  // =========================================================================
  //  POINT LIGHTS
  // =========================================================================
  // Anything in the world actually emitting: explosions, the muzzle flashes on
  // both sides, burning wrecks, the manatee's parry flash, and the lanterns the
  // village keeps burning along the shore. Gathered in WORLD units and splatted
  // into the same field buffer as everything else, so they cost no extra
  // composite pass at all -- a light is a few hundred cell writes.
  _gather(G, t) {
    const L = this._lights; L.length = 0;
    const P = G.particles;

    // --- explosions: hottest at the instant they go off ------------------
    if (P && P.explosions) {
      const ex = P.explosions;
      for (let i = 0; i < ex.length && L.length < 10; i++) {
        const e = ex[i];
        const k = 1 - e.life / e.dur; if (k <= 0) continue;
        const kk = k * k;
        L.push({ x: e.x, y: e.y, r: e.maxR * (1.5 + (1 - k) * 2.2) + 40,
          R: 255, G: (210 + 40 * kk) | 0, B: (120 + 90 * kk) | 0, a: 0.62 * kk, w: 100 + e.maxR });
      }
    }

    // --- fire: every muzzle flash and every burning hull spawns fire
    // particles, so one sweep catches the lot. They are clustered on a coarse
    // grid first, or a wreck with twenty flames on it would ask for twenty
    // lights that all light the same water.
    if (P && P.list) {
      const B = this._fireBuckets; B.length = 0;
      const list = P.list;
      for (let i = 0; i < list.length; i++) {
        const p = list[i]; if (p.type !== 'fire') continue;
        const gx = (p.x / 110) | 0, gy = (p.y / 110) | 0;
        let f = null;
        for (let j = 0; j < B.length; j++) if (B[j].gx === gx && B[j].gy === gy) { f = B[j]; break; }
        if (!f) { if (B.length >= 8) continue; f = { gx, gy, x: 0, y: 0, w: 0 }; B.push(f); }
        const wgt = Math.max(0, p.life / (p.maxLife || 0.7));
        f.x += p.x * wgt; f.y += p.y * wgt; f.w += wgt;
      }
      for (let j = 0; j < B.length && L.length < 14; j++) {
        const f = B[j]; if (f.w < 0.05) continue;
        const s = Math.min(1, f.w / 3.2);
        L.push({ x: f.x / f.w, y: f.y / f.w, r: 60 + 92 * s,
          R: 255, G: 186, B: 96, a: 0.20 + 0.30 * s, w: 60 * s });
      }
    }

    // --- the manatee's own guns, and the flash when she catches a shot ----
    const pl = G.player;
    if (pl && !pl.dead) {
      const fl = pl.flash;
      const mf = fl ? Math.max(fl.primary || 0, fl.sidearm || 0) : 0;
      if (mf > 0) {
        const k = Math.min(1, mf / 0.07), a = pl.aim || 0;
        L.push({ x: pl.x + Math.cos(a) * 12, y: pl.y + Math.sin(a) * 12, r: 96,
          R: 255, G: 244, B: 196, a: 0.46 * k, w: 90 });
      }
      const af = pl.absorb ? pl.absorb.flash : 0;
      if (af > 0) {
        const k = Math.min(1, af / 0.25);
        L.push({ x: pl.x, y: pl.y, r: 150, R: 190, G: 236, B: 255, a: 0.40 * k, w: 90 });
      }
    }

    // --- the lanterns the village keeps burning along the shore -----------
    // Cached in world units: they never move, and walking every structure each
    // frame to find them would cost more than lighting them does.
    if (typeof Village !== 'undefined' && Village.structures) {
      const key = Village.built ? Village.structures.length : -1;
      if (key !== this._lampKey) {
        this._lampKey = key; this._lamps = [];
        const K = (typeof DETAIL === 'number' && DETAIL > 0) ? DETAIL : 2;
        for (const s of Village.structures) {
          if (!s.lights) continue;
          for (const l of s.lights) {
            if (!l.lantern) continue;
            this._lamps.push({ x: s.x + (s.ox || 0) + (l.x + (l.w >> 1)) / K,
              y: s.y + (s.oy || 0) + (l.y + (l.h >> 1)) / K, k: l.k || 1, ph: l.ph || 0 });
            if (this._lamps.length >= 48) break;
          }
          if (this._lamps.length >= 48) break;
        }
      }
      const lamps = this._lamps;
      if (lamps && lamps.length) {
        // only the ones actually in shot, and only while the shore is in shot
        const x0 = G.cam.x - 60, x1 = G.cam.x + (G.viewW || 640) + 60;
        const y0 = G.cam.y - 60, y1 = G.cam.y + (G.viewH || 360) + 60;
        for (let i = 0; i < lamps.length && L.length < 22; i++) {
          const m = lamps[i];
          if (m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
          const f = 0.74 + 0.15 * Math.sin(t * 2.3 + m.ph) + 0.11 * Math.sin(t * 11.7 + m.ph * 3);
          L.push({ x: m.x, y: m.y + 4, r: 34 * m.k, R: 255, G: 198, B: 118, a: 0.30 * f, w: 20 });
        }
      }
    }
    return L;
  },

  // Hand-rasterized into the field: three hard bands, no arc(), no gradient.
  // There is a cell budget, so a screen full of explosions costs about what two
  // cost -- the same bargain particles.js strikes with its gore.
  _splat(L, wx0, wy0, wpc) {
    if (!L.length) return false;
    const LW = this.LW, LH = this.LH;
    const pA = this._pA, pR = this._pR, pG = this._pG, pB = this._pB;
    const inv = 1 / wpc;                    // world units -> cells
    let budget = 26000, any = false;
    if (L.length > 1) L.sort((a, b) => b.a * b.w - a.a * a.w);
    for (let i = 0; i < L.length; i++) {
      const l = L[i]; if (l.a <= 0.004 || l.r <= 0) continue;
      const cx = (l.x - wx0) * inv, cy = (l.y - wy0) * inv, cr = l.r * inv;
      let x0 = Math.floor(cx - cr), x1 = Math.ceil(cx + cr);
      let y0 = Math.floor(cy - cr), y1 = Math.ceil(cy + cr);
      if (x1 < 0 || y1 < 0 || x0 >= LW || y0 >= LH) continue;
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 > LW) x1 = LW;
      if (y1 > LH) y1 = LH;
      const cells = (x1 - x0) * (y1 - y0); if (cells <= 0) continue;
      budget -= cells; if (budget < 0) break;
      any = true;
      const r2 = cr * cr, la = l.a, lr = l.R, lg = l.G, lb = l.B;
      for (let y = y0; y < y1; y++) {
        const dy = y + 0.5 - cy, dy2 = dy * dy;
        let idx = y * LW + x0;
        for (let x = x0; x < x1; x++, idx++) {
          const dx = x + 0.5 - cx;
          const qq = 1 - (dx * dx + dy2) / r2;
          if (qq <= 0.05) continue;
          // three hard steps, so the disc is banded pixel art and not a blur
          const s = qq > 0.60 ? 1 : qq > 0.28 ? 0.58 : 0.24;
          const a = la * s;
          pA[idx] += a; pR[idx] += lr * a; pG[idx] += lg * a; pB[idx] += lb * a;
        }
      }
    }
    return any;
  },

  // =========================================================================
  //  THE PASS
  // =========================================================================
  render(ctx, G, t) {
    if (!this.enabled) return;
    if (this._err > 3) return;
    try {
      if (!this._built) this.init();
      this._render(ctx, G, t);
    } catch (e) {
      // A lighting bug must never take the game down with it. Three strikes and
      // the whole pass stands itself down for the rest of the run.
      this._err++;
      if (this._err === 1 && typeof console !== 'undefined') console.warn('Light: pass disabled --', e && e.message);
    } finally {
      // whatever happened above, hand the context back exactly as it came in,
      // or the HUD gets drawn in whatever mode we died in
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
    }
  },

  _render(ctx, G, t) {
    const oc = G && G.ocean; if (!oc || !oc.waterRamp || !oc.visLUT || !oc.fillRow) return;
    this._bake(oc);

    const OW = ctx.canvas.width, OH = ctx.canvas.height;
    const D = (typeof DETAIL === 'number' && DETAIL > 0) ? DETAIL : 2;
    const vw = G.viewW || 640, vh = G.viewH || 360;

    // ---- screen -> world, matching game.js's own crop and cine zoom -------
    let sw = vw * D, sh = vh * D;
    let lx0 = (G.cropX || 0) * D, ly0 = (G.cropY || 0) * D;
    const cz = (G.cine && G.cine.zoom) || 1;
    if (cz > 1.001 && G.cineFocusScreen) {
      sw = (vw * D) / cz; sh = (vh * D) / cz;
      const f = G.cineFocusScreen();
      lx0 = Math.max(0, Math.min(vw * D - sw, f.x * D - sw / 2));
      ly0 = Math.max(0, Math.min(vh * D - sh, f.y * D - sh / 2));
    }
    const LW = this.LW, LH = this.LH;
    // world units per field cell, and the world position of cell (0,0)
    const wpcX = sw / (LW * D), wpcY = sh / (LH * D);
    const wx0 = G.cam.x + lx0 / D, wy0 = G.cam.y + ly0 / D;

    // ---- point lights ----------------------------------------------------
    const pA = this._pA, pR = this._pR, pG = this._pG, pB = this._pB;
    pA.fill(0); pR.fill(0); pG.fill(0); pB.fill(0);
    const lit = this._splat(this._gather(G, t), wx0, wy0, wpcX);

    // ---- the field -------------------------------------------------------
    const d = this._d, row = this._row, vig = this._vig;
    const S = this._S, SK = this._SK, M = 2047, BAY = this.BAYER;
    const RCP = this._RCP, AB = this._AB;
    const fogA = this._fogA, fogR = this._fogR, fogG = this._fogG, fogB = this._fogB;
    const bncA = this._bncA, bncR = this._bncR, bncG = this._bncG, bncB = this._bncB;
    const cstA = this._cstA, shfA = this._shfA;
    const sunR = this._sunR, sunG = this._sunG, sunB = this._sunB;
    const vigR = this._vigR, vigG = this._vigG, vigB = this._vigB;
    const VIG = this.VIG, LANDA = this.LAND;
    const shore = oc.shoreY;

    // The hero keeps a bubble of clearer water around her: less of the depth
    // push lands on the one thing in frame the player actually has to read. It
    // is also simply true -- there is less water between the camera and the
    // subject than between the camera and the far side of the bay.
    const pl = G.player;
    const hx = pl ? (pl.x - wx0) / wpcX : -9999, hy = pl ? (pl.y - wy0) / wpcY : -9999;
    const hr2 = 26 * 26, heroK = (pl && !pl.dead) ? this.HERO : 0;

    // caustic and shaft phase steps, built the way water.js builds its own so
    // the two fields drift together instead of beating against each other
    const e1 = 0.0182 * wpcX * SK, e2 = -0.0141 * wpcX * SK, e3 = 0.0071 * wpcX * SK;
    const g1 = 0.0112 * wpcX * SK, h1 = 0.0271 * wpcX * SK;
    const swell = Math.sin(t * 0.23) * 0.9;

    let p = 0;
    for (let cy = 0; cy < LH; cy++) {
      const wy = wy0 + cy * wpcY;
      const land = wy < shore - 10;
      if (!land) oc.fillRow(row, oc.depth, wy, wx0, LW, wpcX);
      // per-row phases: x is stepped inside the loop, y is folded in here
      let q1 = (wx0 * 0.0182 + wy * 0.0182 + t * 0.74) * SK;
      let q2 = (-wx0 * 0.0141 + wy * 0.0199 - t * 0.61) * SK;
      let q3 = (wx0 * 0.0071 - wy * 0.0062 + t * 0.35) * SK;
      let r1 = (wx0 * 0.0112 + (wy - shore) * 0.0047 + t * 0.085 + swell) * SK;
      let r2 = (wx0 * 0.0271 + (wy - shore) * 0.0101 - t * 0.052) * SK;
      const bry = (cy & 3) * 4;
      const rowBase = cy * LW;

      for (let cx = 0; cx < LW; cx++, p += 4) {
        const i = rowBase + cx;
        // the two lerps: one toward the water (darkening), one toward the light
        let af = 0, fr = 0, fg = 0, fb = 0;
        let al = 0, lr = 0, lg = 0, lb = 0;     // light is premultiplied

        if (land) {
          // above the waterline the village stands in direct sun, not in water
          al = LANDA; lr = 255 * LANDA; lg = 241 * LANDA; lb = 198 * LANDA;
        } else {
          let dp = row[cx]; if (dp < 0) dp = 0; else if (dp > 1) dp = 1;
          let b = (dp * 15.999) | 0; if (b > 15) b = 15;

          // --- the deep push, spared around the hero ---------------------
          af = fogA[b];
          if (heroK > 0 && af > 0) {
            const dx = cx - hx, dy = cy - hy, dd = dx * dx + dy * dy;
            if (dd < hr2) af *= 1 - heroK * (1 - dd / hr2);
          }
          fr = fogR[b]; fg = fogG[b]; fb = fogB[b];

          // --- the warm bounce off the shelf -----------------------------
          const ba = bncA[b];
          if (ba > 0) { al = ba; lr = bncR[b] * ba; lg = bncG[b] * ba; lb = bncB[b] * ba; }

          // --- surface caustics, playing over EVERYTHING, not just sand ---
          // Three warped sine fields posterized into four steps: the same
          // construction water.js uses on the seabed, one scale coarser, so
          // the two read as the same sun coming through the same swell.
          const ca = cstA[b];
          if (ca > 0) {
            const s3 = S[(q3 | 0) & M];
            const s1 = S[((q1 + s3 * 232) | 0) & M];
            const s2 = S[((q2 - s3 * 188) | 0) & M];
            const cv = s1 + s2 + s3 * 0.55;
            const cl = cv > 1.92 ? 1 : cv > 1.44 ? 0.55 : cv > 0.92 ? 0.22 : 0;
            if (cl > 0) {
              const a = ca * cl;
              al += a; lr += sunR[b] * a; lg += sunG[b] * a; lb += sunB[b] * a;
            }
          }

          // --- broad shafts coming down off the swell --------------------
          const sa = shfA[b];
          if (sa > 0) {
            const sv = S[(r1 | 0) & M] * 0.72 + S[(r2 | 0) & M] * 0.38;
            const sl = sv > 0.70 ? 1 : sv > 0.26 ? 0.46 : 0;
            if (sl > 0) {
              const a = sa * sl;
              al += a; lr += sunR[b] * a; lg += sunG[b] * a; lb += sunB[b] * a;
            }
          }
        }
        q1 += e1; q2 += e2; q3 += e3; r1 += g1; r2 += h1;

        // ---- point lights ---------------------------------------------
        if (lit) {
          let pa = pA[i];
          if (pa > 0.002) {
            let sr = pR[i], sg = pG[i], sb = pB[i];
            if (pa > 1) { const s = 1 / pa; sr *= s; sg *= s; sb *= s; pa = 1; }
            al += pa; lr += sr; lg += sg; lb += sb;
          }
        }

        // ---- vignette --------------------------------------------------
        const v = vig[i];
        if (v > 0) {
          const a = v * VIG;
          af = af + a - af * a;
          fr = fr + (vigR - fr) * a; fg = fg + (vigG - fg) * a; fb = fb + (vigB - fb) * a;
        }

        // ---- compose the two lerps into one ----------------------------
        //   out = (dst*(1-af) + Cf*af)*(1-al) + Cl*al
        //   A   = af + al - af*al
        //   C   = (Cf*af*(1-al) + Cl*al) / A
        if (al > 1) { const s = 1 / al; lr *= s; lg *= s; lb *= s; al = 1; }
        const A = af + al - af * al;
        if (A <= 0.004) { d[p + 3] = 0; continue; }
        const wf = af * (1 - al);
        // quantize A against the same 4x4 Bayer as the vignette, so every band
        // boundary in the whole pass breaks up the same way
        const dth = (BAY[bry + (cx & 3)] + 0.5) / 16 - 0.5;
        let k = ((A * 64) + dth) | 0; if (k < 1) k = 1; else if (k > 64) k = 64;
        const rc = RCP[k];
        // posterize the colour in fives, exactly as water.js posterizes its own
        let cr = ((lr + fr * wf) * rc) | 0, cg = ((lg + fg * wf) * rc) | 0, cb = ((lb + fb * wf) * rc) | 0;
        d[p] = cr > 255 ? 255 : (cr / 5 | 0) * 5;
        d[p + 1] = cg > 255 ? 255 : (cg / 5 | 0) * 5;
        d[p + 2] = cb > 255 ? 255 : (cb / 5 | 0) * 5;
        d[p + 3] = AB[k];
      }
    }

    // ---- one blit, and it is the only time the frame itself is touched ---
    this._bctx.putImageData(this._img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this._buf, 0, 0, LW, LH, 0, 0, OW, OH);
  },
};
if (typeof globalThis !== 'undefined') globalThis.Light = Light;
