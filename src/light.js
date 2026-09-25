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
// The passes, in order:
//   1. SHADE   (multiply)  a 320x180 light map: depth ambient that follows the
//                          ocean's own absorption (warm key light in the
//                          shallows, cool and dim in the deep), a baked banded
//                          vignette, and every point light punching a banded
//                          hole of warmth through it. Blown up 4x, nearest.
//   2. RAYS    (lighter)   baked slanted sun shafts, stepped in alpha bands,
//                          sliding with the swell; fade out with depth.
//   3. GLOW    (lighter)   point lights (muzzle flashes, explosions, fire,
//                          burning wrecks, tracers) as 3-band discs.
//   4. BLOOM   (lighter)   threshold of a 160x90 downsample of the frame,
//                          posterized to 2 levels + a dim 1-cell halo, blown
//                          up 8x. No blur anywhere.
//   5. GRADE   (soft-light) one flat fill: lifts the teal/gold split.
//
const Light = {
  enabled: true,
  bloom: true,
  rays: true,
  _built: false,
  _fail: 0,
  cost: { shade: 0, rays: 0, glow: 0, bloom: 0, grade: 0, total: 0 },
  profile: false,

  LW: 320, LH: 180,        // light map, 4 canvas px per cell
  BW: 160, BH: 90,         // bloom buffer, 8 canvas px per cell

  _mk(w, h, rf) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', rf ? { willReadFrequently: true } : undefined);
    x.imageSmoothingEnabled = false;
    return [c, x];
  },

  init() {
    if (this._built) return;
    const LW = this.LW, LH = this.LH;
    [this.shade, this.sx] = this._mk(LW, LH);
    // --- vignette: stepped rings, white in the middle, 4 bands to the corners
    [this.vig, this.vx] = this._mk(LW, LH);
    {
      const x = this.vx, id = x.createImageData(LW, LH), d = id.data;
      const steps = [255, 244, 230, 212, 192];
      for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
        const u = (i + 0.5) / LW * 2 - 1, v = (j + 0.5) / LH * 2 - 1;
        const r = Math.sqrt(u * u * 0.9 + v * v * 1.1);
        const b = Math.max(0, Math.min(4, Math.floor((r - 0.72) / 0.14) + 1));
        const k = r < 0.72 ? 255 : steps[b];
        const o = (j * LW + i) * 4;
        d[o] = k; d[o + 1] = k; d[o + 2] = Math.min(255, k + 6); d[o + 3] = 255;
      }
      x.putImageData(id, 0, 0);
    }
    // --- light discs: 3 hard bands, baked once per palette entry, 32x32 cells
    this.disc = {};
    const pal = {
      warm: [255, 196, 110], hot: [255, 236, 190], fire: [255, 140, 60],
      cool: [150, 220, 255], red: [255, 90, 70],
    };
    for (const k in pal) {
      const [c, x] = this._mk(32, 32), id = x.createImageData(32, 32), d = id.data, p = pal[k];
      for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
        const u = (i + 0.5 - 16) / 16, v = (j + 0.5 - 16) / 16, r = Math.sqrt(u * u + v * v);
        const a = r < 0.34 ? 1 : r < 0.64 ? 0.55 : r < 1 ? 0.24 : 0;
        const o = (j * 32 + i) * 4;
        d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = Math.round(a * 255);
      }
      x.putImageData(id, 0, 0);
      this.disc[k] = c;
    }
    // --- sun shafts: 1/8 res, twice the screen wide so they can slide.
    //     slanted, irregular widths, 3 alpha bands that fade with depth
    this.RW = 320; this.RH = 90;
    [this.ray, this.rx] = this._mk(this.RW, this.RH);
    {
      const x = this.rx, W = this.RW, H = this.RH;
      let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const shafts = [];
      for (let px = 0; px < W; ) { const w = 3 + (rnd() * 9 | 0); shafts.push([px, w, rnd()]); px += w + 6 + (rnd() * 18 | 0); }
      for (let j = 0; j < H; j++) {
        const band = j < H * 0.35 ? 0 : j < H * 0.65 ? 1 : j < H * 0.88 ? 2 : 3;
        if (band === 3) continue;
        const off = Math.floor(j * 0.5);       // the slant, in whole cells
        for (const [px, w, str] of shafts) {
          const a = [0.20, 0.12, 0.06][band] * (0.55 + str * 0.45);
          x.fillStyle = `rgba(255,244,205,${(Math.round(a * 50) / 50).toFixed(2)})`;
          const xx = ((px + off) % W + W) % W;
          x.fillRect(xx, j, w, 1);
          if (xx + w > W) x.fillRect(xx - W, j, w, 1);
        }
      }
    }
    // --- bloom buffers
    [this.bs, this.bsx] = this._mk(this.BW, this.BH, true);
    this.bsx.imageSmoothingEnabled = true;       // the downsample averages
    [this.bo, this.box] = this._mk(this.BW, this.BH);
    this.bid = this.box.createImageData(this.BW, this.BH);
    this._bloomT = 0;
    // depth ramp cache
    this._rowKey = '';
    this._built = true;
  },

  // ambient multiplier for a world y: follows water.js absorption bands
  _amb(wy, shoreY) {
    if (wy < shoreY - 6) return [255, 250, 238];          // land, full sun
    const d = Math.max(0, Math.min(1, (wy - shoreY) / 2500));
    const b = Math.min(5, Math.floor(d * 6));              // 6 posterized depth bands
    const k = b / 5;
    // warm key light at the surface -> cool, dimmer blue in the deep
    return [Math.round(255 - 70 * k), Math.round(252 - 46 * k), Math.round(242 - 14 * k)];
  },

  _lights(G) {
    const out = [];
    const cz = G.cine && G.cine.zoom > 1.001 ? G.cine.zoom : 1;
    const push = (wx, wy, r, col, a) => {
      const s = G.worldToScreen(wx, wy);
      const x = s.x * 2, y = s.y * 2, R = r * 2 * cz;
      if (x < -R || y < -R || x > 1280 + R || y > 720 + R) return;
      out.push(x, y, R, col, a);
    };
    const p = G.player;
    if (p && !p.dead && p.flash) {
      const f = Math.max(p.flash.primary || 0, p.flash.sidearm || 0);
      if (f > 0) push(p.x, p.y, 46, 'hot', Math.min(1, f * 16));
    }
    const P = G.particles;
    if (P) {
      for (const e of P.explosions) {
        const k = 1 - e.life / e.dur;
        if (k > 0) push(e.x, e.y, e.maxR * 2.2 + 20, k > 0.5 ? 'hot' : 'fire', Math.min(1, k * 1.6));
      }
      let n = 0;
      const L = P.list;
      for (let i = 0; i < L.length && n < 40; i += 2) {
        const q = L[i];
        if (q.type === 'fire') { n++; push(q.x, q.y, 16 + (q.size || 3) * 2, 'fire', 0.55 * q.life / q.maxLife + 0.2); }
      }
    }
    if (G.wrecks) for (const w of G.wrecks) if (w.fireT > 0) {
      const fl = 0.8 + 0.2 * Math.sin(w.t * 13 + w.x);
      push(w.x, w.y, (w.radius * 2.4 + 24) * fl, 'fire', Math.min(1, w.fireT) * 0.9);
    }
    if (G.projectiles) {
      let n = 0;
      for (const q of G.projectiles) {
        if (n > 30) break; n++;
        push(q.x, q.y - (q.z || 0), q.explode ? 22 : 12, q.owner === 'player' ? 'warm' : 'red', 0.6);
      }
    }
    return out;
  },

  render(ctx, G, t) {
    if (!this.enabled) return;
    try {
      this._render(ctx, G, t);
    } catch (e) {
      // fail safe: restore state, and give up after repeated failures
      try { ctx.restore(); } catch (_) {}
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      if (++this._fail > 5) { this.enabled = false; console.warn('Light disabled:', e); }
    }
  },

  _render(ctx, G, t) {
    if (!this._built) this.init();
    const prof = this.profile, now = prof ? () => performance.now() : null;
    let t0 = prof ? now() : 0, t1;
    const LW = this.LW, LH = this.LH, sx = this.sx;
    const ocean = G.ocean, shoreY = ocean ? ocean.shoreY : 300;
    const cz = G.cine && G.cine.zoom > 1.001 ? G.cine.zoom : 1;
    const top = G.screenToWorld(0, 0).y, bot = G.screenToWorld(0, 360).y;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // ---------------- 1. SHADE
    sx.globalCompositeOperation = 'source-over';
    sx.globalAlpha = 1;
    // depth ambient in bands of rows: only redraw the ramp as a few rects
    let run = 0, prev = '';
    for (let j = 0; j <= LH; j++) {
      let key = '';
      if (j < LH) {
        const c = this._amb(top + (bot - top) * (j + 0.5) / LH, shoreY);
        key = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      }
      if (key !== prev) {
        if (prev) { sx.fillStyle = prev; sx.fillRect(0, run, LW, j - run); }
        prev = key; run = j;
      }
    }
    sx.globalCompositeOperation = 'multiply';
    sx.drawImage(this.vig, 0, 0);
    const lights = this._lights(G);
    if (lights.length) {
      sx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < lights.length; i += 5) {
        const R = Math.round(lights[i + 2] / 4 * 1.3), d = R * 2;
        sx.globalAlpha = Math.round(lights[i + 4] * 4) / 4;
        sx.drawImage(this.disc[lights[i + 3]], Math.round(lights[i] / 4) - R, Math.round(lights[i + 1] / 4) - R, d, d);
      }
      sx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.shade, 0, 0, 1280, 720);
    if (prof) { t1 = now(); this.cost.shade = t1 - t0; t0 = t1; }

    // ---------------- 2. RAYS: only while the surface band is in view-ish
    const depth = (top + bot) / 2 - shoreY;
    const rayK = this.rays ? Math.max(0, Math.min(1, 1 - depth / 1400)) : 0;
    if (rayK > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.round(rayK * 4) / 4;
      const camX = G.cam ? G.cam.x : 0;
      // slide with the swell and a little parallax against the camera; whole 8px cells
      const cell = Math.round(t * 1.6 + Math.sin(t * 0.37) * 6 - camX * 0.05);
      const ox = ((cell % this.RW) + this.RW) % this.RW;
      // the shafts start at the surface line, or the top of the screen
      const sy0 = Math.max(0, Math.round(G.worldToScreen(0, shoreY).y * 2 / 8) * 8);
      const hh = 720 - sy0;
      if (hh > 0) {
        const srcH = Math.max(1, Math.round(hh / 8));
        for (let pass = 0; pass < 2; pass++) {
          const sxp = pass === 0 ? ox : 0, w = pass === 0 ? Math.min(160, this.RW - ox) : 160 - Math.min(160, this.RW - ox);
          if (w <= 0) continue;
          const dx = pass === 0 ? 0 : (this.RW - ox) * 8;
          ctx.drawImage(this.ray, sxp, 0, w, Math.min(this.RH, srcH), dx, sy0, w * 8, Math.min(this.RH, srcH) * 8);
        }
      }
      ctx.globalAlpha = 1;
    }
    if (prof) { t1 = now(); this.cost.rays = t1 - t0; t0 = t1; }

    // ---------------- 3. GLOW
    if (lights.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < lights.length; i += 5) {
        const R = Math.round(lights[i + 2] / 4) * 4, d = R * 2;
        ctx.globalAlpha = Math.round(lights[i + 4] * 0.45 * 4) / 4;
        if (ctx.globalAlpha <= 0) continue;
        ctx.drawImage(this.disc[lights[i + 3]], Math.round(lights[i] / 4) * 4 - R, Math.round(lights[i + 1] / 4) * 4 - R, d, d);
      }
      ctx.globalAlpha = 1;
    }
    if (prof) { t1 = now(); this.cost.glow = t1 - t0; t0 = t1; }

    // ---------------- 4. BLOOM (refreshed every other frame, drawn every frame)
    if (this.bloom) {
      if ((this._bloomT++ & 1) === 0) this._bloomBuild(ctx.canvas);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.bo, 0, 0, 1280, 720);
    }
    if (prof) { t1 = now(); this.cost.bloom = t1 - t0; t0 = t1; }

    // ---------------- 5. GRADE
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = depth > 900 ? '#3a7f9c' : '#c79a5a';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();
    if (prof) { t1 = now(); this.cost.grade = t1 - t0; }
  },

  _bloomBuild(src) {
    const BW = this.BW, BH = this.BH, x = this.bsx;
    x.globalCompositeOperation = 'copy';
    x.drawImage(src, 0, 0, BW, BH);
    const s = x.getImageData(0, 0, BW, BH).data;
    const o = this.bid.data;
    const lvl = new Uint8Array(BW * BH);
    for (let i = 0, p = 0; i < BW * BH; i++, p += 4) {
      const l = s[p] * 0.3 + s[p + 1] * 0.55 + s[p + 2] * 0.15;
      lvl[i] = l > 236 ? 2 : l > 210 ? 1 : 0;
    }
    for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
      const k = j * BW + i, p = k * 4;
      let v = lvl[k], a = 0;
      if (v === 2) a = 46; else if (v === 1) a = 26;
      else if ((i > 0 && lvl[k - 1] === 2) || (i < BW - 1 && lvl[k + 1] === 2) || (j > 0 && lvl[k - BW] === 2) || (j < BH - 1 && lvl[k + BW] === 2)) { a = 14; v = 2; }
      if (a) { o[p] = Math.min(255, s[p] * a >> 8); o[p + 1] = Math.min(255, s[p + 1] * a >> 8); o[p + 2] = Math.min(255, s[p + 2] * a >> 8); o[p + 3] = 255; }
      else { o[p] = 0; o[p + 1] = 0; o[p + 2] = 0; o[p + 3] = 255; }
    }
    this.box.putImageData(this.bid, 0, 0);
  },
};
if (typeof globalThis !== 'undefined') globalThis.Light = Light;
