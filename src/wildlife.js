// ===========================================================================
//  WILDLIFE — a living reef, rideable whales, dolphin guides, sunken treasure
//  Self-contained.  Loads after chars.js, before game.js.
//
//  Public API (see the bottom of the file):
//    Wildlife.init() reset() populate(w,h,shoreY) update(dt,t)
//    Wildlife.renderUnder/renderOver/renderHint(ctx, cam, t)
//    Wildlife.scare(x,y,r,power)  spawnWhale(x,y)  spawnDolphins(x,y)
//    Wildlife.spawnTreasure(x,y,tier)  onPlayerAction()  splashHit(x,y,r,dmg)
//    Wildlife.riding  .whales  .treasures  .schools
//
//  Everything is pure pixel art: sprites are rasterized ONCE at init() into
//  offscreen canvases (procedural rounded forms via chars.js blobField /
//  shadeBlob, plus hand-authored rows through pixelart.js makeSprite), and
//  drawn with integer blits.  No gradients, no blur, no external images.
//
//  The world scene renders into a 320x180 buffer upscaled x2, so all culling
//  is done against a 320x180 viewport with a generous margin.
// ===========================================================================
const Wildlife = (function () {
  'use strict';

  const VIEW_W = 320, VIEW_H = 180;     // visible world units (camera is 2x)
  const CULL = 110;                     // generous off-screen margin

  // ------------------------------------------------------------------ world
  let W = 3200, H = 2400, SH = 300;
  let rng = null;
  let camX = 0, camY = 0;
  let _G = null;
  let inited = false;
  let sp = null;                         // the sprite bank

  // Lists are created ONCE and truncated on reset so external references
  // (Wildlife.schools etc.) stay valid forever.
  const S = {
    schools: [], reefs: [], rays: [], turtles: [], jellies: [], squids: [],
    crabs: [], sharks: [], whales: [], pods: [], treasures: [],
    ink: [], marks: [], fx: [],
  };

  // ======================================================================
  //  tiny helpers
  // ======================================================================
  function syncG() { try { _G = (typeof G !== 'undefined') ? G : null; } catch (e) { _G = null; } }
  function P() { const g = _G; return (g && g.player && !g.player.dead) ? g.player : null; }
  function OC() { const g = _G; return (g && g.ocean) ? g.ocean : null; }
  function PT() { const g = _G; return (g && g.particles) ? g.particles : null; }
  function TN() { return (typeof Toon !== 'undefined' && Toon) ? Toon : null; }
  function AU() { try { return (typeof Audio_ !== 'undefined') ? Audio_ : null; } catch (e) { return null; } }

  const ZF = { x: 0, y: 0 };
  function flow(x, y) { const o = OC(); if (o && o.flow) return o.flow(x, y); return ZF; }
  function depthAt(x, y) { const o = OC(); return (o && o.depthAt) ? o.depthAt(x, y) : 0.4; }
  function disturb(x, y, s, vx, vy) { const o = OC(); if (o && o.disturb) o.disturb(x, y, s, vx || 0, vy || 0); }
  function foam(x, y, a) { const o = OC(); if (o && o.addFoam) o.addFoam(x, y, a); }
  function ripple(x, y, r, s, a) { const o = OC(); if (o && o.ripple) o.ripple(x, y, r, s, a); }
  function shakeCam(n) { const g = _G; if (g && typeof g.shake === 'function') g.shake(n); }
  function floatText(x, y, str, col, size) { const p = PT(); if (p && p.text) p.text(x, y, str, col || '#fff', size || 7); }

  function can(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    return c;
  }
  function spr(c, ax, ay) { return { c: c, w: c.width, h: c.height, ax: ax === undefined ? c.width / 2 : ax, ay: ay === undefined ? c.height / 2 : ay }; }
  function blit(ctx, s, x, y) { ctx.drawImage(s.c, Math.round(x - s.ax), Math.round(y - s.ay)); }
  function blitRot(ctx, s, x, y, rot, sx, sy) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (rot) ctx.rotate(rot);
    if ((sx !== undefined && sx !== 1) || (sy !== undefined && sy !== 1)) ctx.scale(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy);
    ctx.drawImage(s.c, -s.ax, -s.ay);
    ctx.restore();
  }
  function onScreen(x, y, cam, m) {
    const sx = x - cam.x, sy = y - cam.y, mm = m === undefined ? CULL : m;
    return sx > -mm && sy > -mm && sx < VIEW_W + mm && sy < VIEW_H + mm;
  }

  // --- hard-edged raster primitives (no antialiasing anywhere) -------------
  function pxr(ctx, col, x, y, w, h) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w || 1, h || 1); }
  function ellipsePx(ctx, cx, cy, rx, ry, col) {
    if (rx < 0.4 || ry < 0.4) return;
    ctx.fillStyle = col;
    const R = Math.ceil(ry);
    for (let y = -R; y <= R; y++) {
      const k = 1 - (y * y) / (ry * ry); if (k <= 0) continue;
      const w = Math.sqrt(k) * rx;
      const x0 = Math.round(cx - w), x1 = Math.round(cx + w);
      if (x1 < x0) continue;
      ctx.fillRect(x0, Math.round(cy) + y, x1 - x0 + 1, 1);
    }
  }
  function ringPx(ctx, cx, cy, rx, ry, col) {
    if (rx < 0.5) return;
    ctx.fillStyle = col;
    const n = Math.max(8, Math.round((rx + ry) * 1.7));
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
    }
  }
  function linePx(ctx, x0, y0, x1, y1, col, w) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const ww = w || 1, o = (ww - 1) >> 1;
    ctx.fillStyle = col;
    for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + dx * i / n) - o, Math.round(y0 + dy * i / n) - o, ww, ww);
  }
  function triPx(ctx, col, ax, ay, bx, by, cx, cy) {
    const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
    const E = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
    ctx.fillStyle = col;
    for (let y = minY; y <= maxY; y++) {
      let lo = Infinity, hi = -Infinity;
      for (let e = 0; e < 3; e++) {
        const x0 = E[e][0], y0 = E[e][1], x1 = E[e][2], y1 = E[e][3];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          const x = x0 + (x1 - x0) * (y - y0) / (y1 - y0);
          if (x < lo) lo = x; if (x > hi) hi = x;
        }
      }
      if (lo > hi) continue;
      const xs = Math.round(lo), xe = Math.round(hi);
      ctx.fillRect(xs, y, Math.max(1, xe - xs + 1), 1);
    }
  }
  function triOut(ctx, fill, out, ax, ay, bx, by, cx, cy, grow) {
    const g = grow === undefined ? 1.22 : grow;
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3;
    triPx(ctx, out, mx + (ax - mx) * g, my + (ay - my) * g, mx + (bx - mx) * g, my + (by - my) * g, mx + (cx - mx) * g, my + (cy - my) * g);
    triPx(ctx, fill, ax, ay, bx, by, cx, cy);
  }

  // Build an arbitrary implicit-shape field for shadeBlob (>0 = inside).
  function shapeField(w, h, fn) {
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fn(x + 0.5, y + 0.5);
      if (v > 0) f[y * w + x] = v > 1 ? 1 : v;
    }
    return f;
  }
  // paint only where the field is solid, so decoration never leaks outside
  function maskPx(ctx, f, w, h, x, y, col) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h || f[y * w + x] <= 0) return;
    ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
  }
  function maskLine(ctx, f, w, h, x0, y0, x1, y1, col) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let i = 0; i <= n; i++) maskPx(ctx, f, w, h, x0 + dx * i / n, y0 + dy * i / n, col);
  }

  // Pre-rotate a sprite into N crisp nearest-neighbour copies.  Rotating tiny
  // fish at draw time would cost a transform per fish; this is one blit.
  function rotSet(s, n) {
    const out = [];
    let d = Math.ceil(Math.sqrt(s.w * s.w + s.h * s.h)) + 2; if (d & 1) d++;
    for (let i = 0; i < n; i++) {
      const c = can(d, d), x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.translate(d / 2, d / 2);
      x.rotate(i / n * TAU);
      x.drawImage(s.c, -s.ax, -s.ay);
      out.push(spr(c, d / 2, d / 2));
    }
    return out;
  }
  const A16 = 16 / TAU;
  function angIdx(a) { return ((((a * A16 + 0.5) | 0) + 160) & 15); }

  return buildModule();

  // ======================================================================
  // ======================================================================
  function buildModule() {

    // ====================================================================
    //  SPECIES ART — small reef fish, drawn top-down (you see their backs)
    // ====================================================================
    const FISH = {
      sardine: {
        L: 7, B: 4, pal: { out: '#0c1a28', dark: '#24465f', mid: '#3f7595', light: '#8fc4dc', dorsal: '#1a3349', fin: '#31607c', eye: '#050a10' },
        lat: '#cfe9f6',
      },
      anchovy: {
        L: 6, B: 3, pal: { out: '#0c1a1a', dark: '#245046', mid: '#3d8271', light: '#8ecfb4', dorsal: '#173a35', fin: '#2f6a5c', eye: '#050a10' },
        lat: '#dcf4e4',
      },
      fusilier: {
        L: 8, B: 4, pal: { out: '#0d1526', dark: '#25366b', mid: '#3d5aa2', light: '#7fa4dd', dorsal: '#1a2550', fin: '#3b4f8f', eye: '#050a10' },
        lat: '#ffd98a',
      },
      clown: {
        L: 9, B: 6, pal: { out: '#25100a', dark: '#a8460f', mid: '#dd6f16', light: '#ffa445', dorsal: '#8e380c', fin: '#c25a12', eye: '#0d0606' },
        bars: [[0.32, '#ffefdd'], [0.60, '#ffefdd'], [0.86, '#ffefdd']], barOut: '#25100a',
      },
      angel: {
        L: 10, B: 7, pal: { out: '#0c1020', dark: '#1e2a5c', mid: '#35479a', light: '#6f87d8', dorsal: '#151c44', fin: '#d9ae37', eye: '#050a10' },
        bars: [[0.36, '#e8c650'], [0.64, '#e8c650']], barOut: '#0c1020',
      },
      tang: {
        L: 10, B: 5, pal: { out: '#0a1028', dark: '#1b3185', mid: '#2a4bb8', light: '#6084e0', dorsal: '#131f56', fin: '#e0b23a', eye: '#050a10' },
        lat: '#0a1028',
      },
      butterfly: {
        L: 9, B: 6, pal: { out: '#221c0c', dark: '#b08f1e', mid: '#dcb93c', light: '#ffe796', dorsal: '#8d6f16', fin: '#e8cf72', eye: '#100e08' },
        bars: [[0.88, '#1b1a14'], [0.44, '#1b1a14']], barOut: '#6f5c14',
      },
      parrot: {
        L: 11, B: 7, pal: { out: '#0a2224', dark: '#175a56', mid: '#238d82', light: '#5cc5b1', dorsal: '#104341', fin: '#b85a8e', eye: '#050a10' },
        lat: '#ffc3e0',
      },
    };

    // one fish frame, nose facing RIGHT, with a tail flex in [-1,1]
    function fishFrame(o, flex) {
      const L = o.L, B = o.B;
      const tailL = Math.max(3, Math.round(L * 0.34));
      const tailB = Math.max(2, Math.round(B * 0.72));
      const W2 = L + tailL + 4, H2 = Math.max(B + 2, tailB * 2 + 3) + 2;
      const c = can(W2, H2), x = c.getContext('2d');
      const cy = H2 >> 1, bx0 = tailL + 2;
      const pal = o.pal;
      const bend = u => flex * Math.pow(1 - u, 1.8) * (B * 0.42 + 0.6);
      const beam = u => (u < 0.62 ? Math.pow(u / 0.62, 0.5) : Math.pow(Math.max(0, (1 - u) / 0.38), 0.52));

      // --- caudal fin (behind the peduncle), swinging with the flex -------
      const ty = cy + bend(0), tipX = bx0 - tailL, tipO = flex * tailB * 1.05;
      triOut(x, pal.fin, pal.out, bx0 + 0.5, ty, tipX, ty - tailB + tipO, tipX, ty + tailB + tipO, 1.12);
      // notch the fin so it reads as a fork
      triPx(x, pal.out, tipX + 0.2, ty + tipO, tipX + tailL * 0.55, ty + tipO - 0.5, tipX + tailL * 0.55, ty + tipO + 0.5);

      // --- body -----------------------------------------------------------
      const colH = new Float32Array(L), colY = new Float32Array(L);
      for (let i = 0; i < L; i++) {
        const u = (i + 0.5) / L;
        const h = beam(u) * B * 0.5;
        colH[i] = h; colY[i] = cy + bend(u);
        if (h < 0.35) continue;
        const px0 = bx0 + i, yy = colY[i], R = Math.ceil(h);
        for (let dy = -R; dy <= R; dy++) {
          if (Math.abs(dy) > h + 0.001) continue;
          const a = Math.abs(dy) / Math.max(0.6, h);
          let col;
          if (a > 0.78) col = pal.out;
          else if (a < 0.24) col = pal.dorsal;
          else col = dy < 0 ? pal.light : pal.mid;
          x.fillStyle = col; x.fillRect(px0, Math.round(yy + dy), 1, 1);
        }
      }
      // --- lateral shimmer line -------------------------------------------
      if (o.lat) {
        x.fillStyle = o.lat;
        for (let i = 1; i < L - 1; i++) {
          const h = colH[i]; if (h < 1.1 || (i & 1)) continue;
          x.fillRect(bx0 + i, Math.round(colY[i] - h * 0.48), 1, 1);
        }
      }
      // --- vertical bars ---------------------------------------------------
      if (o.bars) for (let b = 0; b < o.bars.length; b++) {
        const at = o.bars[b][0], col = o.bars[b][1];
        const i = clamp(Math.round(at * L), 0, L - 1), h = colH[i];
        if (h < 0.8) continue;
        const R = Math.ceil(h);
        for (let dy = -R; dy <= R; dy++) {
          if (Math.abs(dy) > h - 0.45) continue;
          x.fillStyle = col; x.fillRect(bx0 + i, Math.round(colY[i] + dy), 1, 1);
        }
        if (o.barOut && L > 7) {
          x.fillStyle = o.barOut;
          x.fillRect(bx0 + i + 1, Math.round(colY[i] - h + 1), 1, Math.max(1, Math.round(h * 2 - 1)));
        }
      }
      // --- pectoral fins ----------------------------------------------------
      const pi = clamp(Math.round(L * 0.58), 1, L - 2), ph = colH[pi];
      if (ph > 1.2) {
        x.fillStyle = pal.fin;
        x.fillRect(bx0 + pi - 1, Math.round(colY[pi] - ph - 1), 2, 1);
        x.fillRect(bx0 + pi - 1, Math.round(colY[pi] + ph + 0), 2, 1);
      }
      // --- eyes -------------------------------------------------------------
      const ei = clamp(Math.round(L * 0.88), 1, L - 1), eh = colH[ei];
      if (eh > 0.9) {
        x.fillStyle = pal.eye;
        x.fillRect(bx0 + ei, Math.round(colY[ei] - eh * 0.5), 1, 1);
        x.fillRect(bx0 + ei, Math.round(colY[ei] + eh * 0.5), 1, 1);
      }
      return { c: c, ax: bx0 + L * 0.46, ay: cy };
    }

    function makeFishSet(o) {
      const flexes = [0, 0.95, -0.95];
      const out = [];
      for (let i = 0; i < 3; i++) {
        const fr = fishFrame(o, flexes[i]);
        out.push(rotSet(spr(fr.c, fr.ax, fr.ay), 16));
      }
      return out;
    }
    const FLEX_CYCLE = [0, 1, 0, 2];

    // ====================================================================
    //  BIG CREATURES — procedural rounded forms (chars.js rasterizer)
    // ====================================================================
    function blobOf(w, h, f, ramp, opts) {
      if (typeof shadeBlob === 'function') return shadeBlob(w, h, f, ramp, opts || {});
      // extremely defensive fallback: flat posterized mask
      const c = can(w, h), x = c.getContext('2d');
      for (let y = 0; y < h; y++) for (let q = 0; q < w; q++) if (f[y * w + q] > 0) { x.fillStyle = ramp[2]; x.fillRect(q, y, 1, 1); }
      return { c: c, ctx: x, f: f };
    }

    // ---------------------------------------------------------------- RAY --
    function buildRay() {
      const W2 = 42, H2 = 56, CX = 20, CY = 28;
      const frames = [];
      const ramp = ['#0d161f', '#16242f', '#20343f', '#2d4a57', '#456c7c'];
      for (let fr = 0; fr < 4; fr++) {
        const curl = [0, 0.9, 0, -0.9][fr];
        const f = shapeField(W2, H2, (x, y) => {
          const u = (x - CX) / 17;                       // nose-to-tail
          const v = (y - CY) / 26;                       // wing span
          // superellipse with a low span exponent -> pointed wingtips
          const wing = 1 - Math.pow(Math.abs(u + 0.10), 1.85) - Math.pow(Math.abs(v), 1.12);
          if (wing <= 0) return 0;
          return wing * (0.5 + 0.5 * Math.exp(-(v * v) * 7));
        });
        const b = blobOf(W2, H2, f, ramp, { outline: '#070b10', smooth: 3, lift: 0.2, contrast: 0.58 });
        const x = b.ctx;
        // spots + spine ridge
        for (let i = 0; i < 90; i++) {
          const hx = hash2(i * 3 + fr, 7), hy = hash2(i * 5 + 11, fr + 3);
          const px0 = 4 + hx * (W2 - 8), py0 = 4 + hy * (H2 - 8);
          if (hash2(i, fr * 13) > 0.62) maskPx(x, f, W2, H2, px0, py0, '#87b0c4');
          else maskPx(x, f, W2, H2, px0, py0, '#0f1b24');
        }
        // spine ridge runs nose-to-tail
        maskLine(x, f, W2, H2, CX - 14, CY, CX + 14, CY, '#5d8496');
        maskLine(x, f, W2, H2, CX - 14, CY + 1, CX + 14, CY + 1, '#101c26');
        // shoulder shading either side of the ridge
        for (let i = -11; i <= 11; i++) {
          maskLine(x, f, W2, H2, CX + i * 0.5, CY - 5, CX + i * 0.5, CY - 5, '#2b4654');
        }
        // cephalic horns at the front (facing +x)
        for (const s of [-1, 1]) {
          triOut(x, '#2d4a57', '#070b10', CX + 12, CY + s * 3, CX + 20, CY + s * 7, CX + 13, CY + s * 8, 1.1);
        }
        // eyes, bulging on top of the head
        for (const s of [-1, 1]) {
          pxr(x, '#070b10', CX + 10, CY + s * 5 - (s < 0 ? 2 : 0), 3, 3);
          pxr(x, '#cfe6f4', CX + 11, CY + s * 5 - (s < 0 ? 2 : 0), 1, 1);
        }
        // wing-tip highlight rim, flipped by the flap
        for (const s of [-1, 1]) {
          const ty = CY + s * (20 - Math.abs(curl) * 4);
          maskLine(x, f, W2, H2, CX - 7, ty, CX + 6, ty - s * 2, curl * s > 0 ? '#7ba4b8' : '#0f1b24');
        }
        frames.push(spr(b.c, CX, CY));
      }
      return { fr: frames };
    }

    // ------------------------------------------------------------- TURTLE --
    function buildTurtle() {
      const W2 = 30, H2 = 26, CX = 15, CY = 13;
      const f = shapeField(W2, H2, (x, y) => {
        const u = (x - CX) / 13.5, v = (y - CY) / 11.5;
        const k = 1 - (Math.pow(Math.abs(u), 2.0) + Math.pow(Math.abs(v), 2.1));
        return k > 0 ? k : 0;
      });
      const ramp = ['#20180f', '#3b2d18', '#5c4622', '#84662f', '#ab8a45'];
      const b = blobOf(W2, H2, f, ramp, { outline: '#120d08', smooth: 3, lift: 0.2, contrast: 0.85 });
      const x = b.ctx;
      // carapace scutes: a central row of five plus flanking plates
      const dk = '#2a2011', lt = '#c4a05a';
      for (let i = -2; i <= 2; i++) {
        const sx = CX + i * 4.6;
        maskLine(x, f, W2, H2, sx - 2.3, CY - 4, sx - 2.3, CY + 4, dk);
        maskPx(x, f, W2, H2, sx, CY - 2, lt);
      }
      maskLine(x, f, W2, H2, CX - 12, CY - 4.2, CX + 12, CY - 4.2, dk);
      maskLine(x, f, W2, H2, CX - 12, CY + 4.2, CX + 12, CY + 4.2, dk);
      for (let i = -3; i <= 3; i++) {
        maskLine(x, f, W2, H2, CX + i * 3.6, CY - 10, CX + i * 3.6, CY - 4.5, dk);
        maskLine(x, f, W2, H2, CX + i * 3.6, CY + 4.5, CX + i * 3.6, CY + 10, dk);
      }
      // marginal rim
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * TAU;
        maskPx(x, f, W2, H2, CX + Math.cos(a) * 12.6, CY + Math.sin(a) * 10.6, '#6b5328');
      }
      const shell = spr(b.c, CX, CY);

      // head
      const hc = can(9, 7), hx = hc.getContext('2d');
      ellipsePx(hx, 4, 3.5, 4, 3, '#0f1a12');
      ellipsePx(hx, 4, 3.5, 3.2, 2.2, '#4d7a4c');
      ellipsePx(hx, 3.2, 2.8, 2.2, 1.4, '#6ba066');
      pxr(hx, '#e6f0d8', 5, 2, 1, 1); pxr(hx, '#e6f0d8', 5, 5, 1, 1);
      pxr(hx, '#0b1118', 6, 2, 1, 1); pxr(hx, '#0b1118', 6, 5, 1, 1);
      const head = spr(hc, 2, 3.5);

      // flipper (front paddle, root at the left edge)
      const fc = can(14, 8), fx = fc.getContext('2d');
      triOut(fx, '#3f6640', '#0f1a12', 1, 4, 13, 1.6, 12, 7, 1.18);
      linePx(fx, 2, 4, 11, 2.6, '#7aa96e', 1);
      const flip = spr(fc, 1, 4);
      const fc2 = can(10, 6), fx2 = fc2.getContext('2d');
      triOut(fx2, '#35583a', '#0f1a12', 1, 3, 9, 1.4, 8, 5.4, 1.18);
      const flipB = spr(fc2, 1, 3);
      return { shell: shell, head: head, flip: flip, flipB: flipB };
    }

    // ----------------------------------------------------------- JELLYFISH --
    function buildJelly() {
      const kinds = [
        { ramp: ['#3a2a63', '#54408c', '#7059b8', '#9a7fdc', '#c7b2f5'], gon: '#ffd2f2', out: '#221a3c' },
        { ramp: ['#1d4f60', '#2a7285', '#3f9aa8', '#63c4cb', '#a6eef0'], gon: '#e8ffff', out: '#10323f' },
        { ramp: ['#5e2b3b', '#87405a', '#b25a78', '#dd849e', '#ffc0d2'], gon: '#fff0f6', out: '#3a1824' },
      ];
      const out = [];
      for (const k of kinds) {
        const fr = [];
        for (let p = 0; p < 4; p++) {
          const sq = [1.0, 0.82, 0.68, 0.86][p];       // bell contraction
          const W2 = 24, H2 = 22, CX = 12, CY = 11;
          const rx = 10.5 / sq * 0.86, ry = 7.6 * sq;
          const f = shapeField(W2, H2, (x, y) => {
            const u = (x - CX) / rx, v = (y - CY + ry * 0.18) / ry;
            if (v > 0.75) return 0;
            const q = 1 - (u * u + v * v);
            return q > 0 ? q : 0;
          });
          const b = blobOf(W2, H2, f, k.ramp, { outline: k.out, smooth: 3, lift: 0.3, contrast: 0.7 });
          const x = b.ctx;
          // four horseshoe gonads showing through the bell
          for (let i = 0; i < 4; i++) {
            const a = i / 4 * TAU + 0.78;
            const gx = CX + Math.cos(a) * rx * 0.42, gy = CY - ry * 0.1 + Math.sin(a) * ry * 0.42;
            for (let s = 0; s < 9; s++) {
              const aa = a + (s / 8 - 0.5) * 2.4;
              maskPx(x, f, W2, H2, gx + Math.cos(aa) * 2.2, gy + Math.sin(aa) * 1.9, k.gon);
            }
          }
          // rim band
          for (let i = 0; i < 40; i++) {
            const a = Math.PI * (i / 39) * 1.22 + Math.PI * 0.89;
            maskPx(x, f, W2, H2, CX + Math.cos(a) * rx * 0.98, CY - ry * 0.18 + Math.sin(a) * ry * 0.98, k.ramp[4]);
          }
          fr.push(spr(b.c, CX, CY));
        }
        out.push({ fr: fr, tent: k.ramp[3], arm: k.gon, out: k.out });
      }
      return out;
    }

    // --------------------------------------------------------------- SQUID --
    function buildSquid() {
      const W2 = 30, H2 = 16, CX = 15, CY = 8;
      const f = shapeField(W2, H2, (x, y) => {
        const u = (x - 10) / 13, v = (y - CY) / 4.6;
        if (u > 1 || u < -0.85) return 0;
        const taper = u > 0 ? Math.pow(1 - u, 0.62) : 1 + u * 0.15;
        const k = taper * taper - v * v;
        return k > 0 ? k : 0;
      });
      const ramp = ['#48182c', '#6d2740', '#9a3c56', '#c55f74', '#eda0a8'];
      const b = blobOf(W2, H2, f, ramp, { outline: '#280c18', smooth: 3, lift: 0.22, contrast: 0.85 });
      const x = b.ctx;
      // chromatophore speckle
      for (let i = 0; i < 70; i++) {
        const hx = hash2(i, 91), hy = hash2(i * 7, 13);
        maskPx(x, f, W2, H2, 1 + hx * (W2 - 2), 1 + hy * (H2 - 2), hash2(i, 3) > 0.5 ? '#f6c9c6' : '#3b1222');
      }
      // lateral fins at the pointed end
      for (const s of [-1, 1]) {
        triOut(x, '#b1526a', '#280c18', 20, CY + s * 2, 28, CY + s * 6.5, 28.5, CY + s * 0.6, 1.12);
      }
      // big eye
      pxr(x, '#280c18', 4, CY - 3, 4, 5);
      pxr(x, '#f6e6c8', 5, CY - 2, 3, 3);
      pxr(x, '#0b1118', 5, CY - 1, 2, 2);
      return { body: spr(b.c, 10, CY), arm: '#c55f74', armD: '#7a2c44', out: '#280c18' };
    }

    // ---------------------------------------------------------------- CRAB --
    function buildCrab() {
      const pal = {
        '.': null, k: '#2a0f0c', r: '#b8372a', R: '#e2593c', o: '#ff8a5c',
        d: '#7c2018', y: '#ffd27a', w: '#fff3dd',
      };
      const A = [
        '..k.......k..',
        '.kRk.....kRk.',
        'kRok.....koRk',
        'kRRk..k..kRRk',
        '.kkkkkkkkkkk.',
        'kdRRRRRRRRRdk',
        'kRRoRwkwRoRRk',
        'kdRRRRRRRRRdk',
        '.kkkkkkkkkkk.',
        'k.k.k...k.k.k',
      ];
      const B = [
        'k..........k.',
        'kRk.......kRk',
        'kRok.....koRk',
        '.kRk..k..kRk.',
        '.kkkkkkkkkkk.',
        'kdRRRRRRRRRdk',
        'kRRoRwkwRoRRk',
        'kdRRRRRRRRRdk',
        '.kkkkkkkkkkk.',
        '.k.k.k.k.k.k.',
      ];
      const C = [
        '.k.........k.',
        '.kRk.....kRk.',
        'kRRok...koRRk',
        '.kkk..k..kkk.',
        '.kkkkkkkkkkk.',
        'kdRRRRRRRRRdk',
        'kRRoRwkwRoRRk',
        'kdRRRRRRRRRdk',
        '.kkkkkkkkkkk.',
        'k..k.k.k.k..k',
      ];
      const mk = rows => makeSprite(rows, { pal: pal, ax: 6, ay: 5 });
      return [mk(A), mk(B), mk(C)];
    }

    // ---------------------------------------------------------- REEF SHARK --
    function buildReefShark() {
      const W2 = 62, H2 = 26, CY = 13;
      const lobes = [
        { x: 9, y: CY, rx: 4, ry: 2.4 },
        { x: 16, y: CY, rx: 6.5, ry: 4.4 },
        { x: 25, y: CY, rx: 9, ry: 7.2 },
        { x: 34, y: CY, rx: 9.6, ry: 7.6 },
        { x: 43, y: CY, rx: 8.4, ry: 6.4 },
        { x: 51, y: CY, rx: 6, ry: 4.4 },
        { x: 57, y: CY, rx: 3.2, ry: 2.2 },
      ];
      const f = (typeof blobField === 'function') ? blobField(W2, H2, lobes) : shapeField(W2, H2, () => 0);
      const ramp = ['#1a2230', '#283446', '#3b4c62', '#566a83', '#7b8ea6'];
      const b = blobOf(W2, H2, f, ramp, { outline: '#0a0e15', smooth: 3, lift: 0.14 });
      const x = b.ctx;
      // pectorals + dorsal + caudal, hard triangles
      for (const s of [-1, 1]) {
        triOut(x, '#38485d', '#0a0e15', 33, CY + s * 5, 24, CY + s * 14, 33, CY + s * 8, 1.1);
        triOut(x, '#2f3e51', '#0a0e15', 20, CY + s * 3.6, 14, CY + s * 8.6, 20, CY + s * 5.6, 1.1);
      }
      triOut(x, '#44566d', '#0a0e15', 31, CY - 2, 25, CY - 2, 29, CY - 3, 1.0);
      // dorsal fin reads as a raised wedge down the spine
      for (let i = 0; i < 14; i++) {
        const px0 = 23 + i, q = i / 13, hgt = Math.sin(q * Math.PI) * 4.2;
        for (let dy = -hgt; dy <= hgt; dy++) {
          const a = Math.abs(dy) / Math.max(0.7, hgt);
          maskPx(x, f, W2, H2, px0, CY + dy, a > 0.84 ? '#0a0e15' : a < 0.32 ? '#7b8ea6' : dy < 0 ? '#566a83' : '#22303f');
        }
      }
      // white belly edge hint + gills + eye
      for (let g = 0; g < 5; g++) { const gx = 46 - g * 2; linePx(x, gx, CY - 6.5, gx, CY - 3.5, '#1b2733', 1); linePx(x, gx, CY + 3.5, gx, CY + 6.5, '#1b2733', 1); }
      for (const s of [-1, 1]) { pxr(x, '#0a0e15', 52, CY + s * 3 - (s < 0 ? 1 : 0), 2, 2); pxr(x, '#e8f2ff', 52, CY + s * 3 - (s < 0 ? 1 : 0), 1, 1); }
      // caudal fin
      triOut(x, '#3b4c62', '#0a0e15', 10, CY, 1, CY - 9, 4, CY + 1, 1.12);
      triOut(x, '#314154', '#0a0e15', 10, CY, 3, CY + 7, 5, CY - 1, 1.12);
      return spr(b.c, 36, CY);
    }

    // ------------------------------------------------------------- DOLPHIN --
    function buildDolphin() {
      const W2 = 52, H2 = 22, CY = 11;
      const lobes = [
        { x: 10, y: CY, rx: 4, ry: 2.2 },
        { x: 16, y: CY, rx: 5.6, ry: 3.6 },
        { x: 24, y: CY, rx: 8, ry: 5.8 },
        { x: 32, y: CY, rx: 8.4, ry: 6.2 },
        { x: 39, y: CY, rx: 7, ry: 5.2 },
        { x: 44, y: CY, rx: 4.6, ry: 3.4 },
        { x: 48, y: CY, rx: 2.4, ry: 1.6 },
      ];
      const f = (typeof blobField === 'function') ? blobField(W2, H2, lobes) : shapeField(W2, H2, () => 0);
      const ramp = ['#1b2733', '#28394b', '#3b5266', '#597287', '#8ba3b8'];
      const b = blobOf(W2, H2, f, ramp, { outline: '#0b1118', smooth: 3, lift: 0.18 });
      const x = b.ctx;
      // the classic dark cape over a clean paler flank
      for (let px0 = 8; px0 < 50; px0++) {
        const capeTop = CY + 1.2 + Math.sin((px0 - 8) * 0.11) * 2.2;
        for (let py0 = Math.ceil(capeTop); py0 < H2; py0++) {
          const d = py0 - capeTop;
          maskPx(x, f, W2, H2, px0, py0, d < 1.2 ? '#728ea6' : d < 3 ? '#9cb5c8' : '#bed0dd');
        }
        maskPx(x, f, W2, H2, px0, capeTop - 0.6, '#1d2b39');
      }
      // beak
      linePx(x, 46, CY, 51, CY, '#0b1118', 3);
      linePx(x, 46, CY, 50.5, CY, '#4a6076', 1);
      pxr(x, '#c8d8e6', 49, CY - 1, 2, 1);
      // melon highlight, blowhole, eyes
      ellipsePx(x, 41, CY - 1.6, 3.4, 1.6, '#7a94aa');
      pxr(x, '#0b1118', 38, CY - 1, 2, 1);
      for (const s of [-1, 1]) { pxr(x, '#0b1118', 43, CY + s * 3 - (s < 0 ? 1 : 0), 2, 2); pxr(x, '#e8f2ff', 43, CY + s * 3 - (s < 0 ? 1 : 0), 1, 1); }
      // pectorals + the hooked dorsal fin
      for (const s of [-1, 1]) triOut(x, '#31465a', '#0b1118', 33, CY + s * 4.6, 25, CY + s * 10.5, 32, CY + s * 7, 1.1);
      // dorsal fin: a raised ridge along the spine, not a pasted triangle
      for (let i = 0; i < 12; i++) {
        const px0 = 23 + i, q = i / 11, hgt = Math.sin(q * Math.PI) * 3.4;
        for (let dy = -hgt; dy <= hgt; dy++) {
          const a = Math.abs(dy) / Math.max(0.7, hgt);
          maskPx(x, f, W2, H2, px0, CY + dy - 0.5, a > 0.82 ? '#0b1118' : a < 0.35 ? '#8aa3b8' : dy < 0 ? '#5d7690' : '#27394b');
        }
      }
      const body = spr(b.c, 34, CY);

      // flukes (separate so they can pump)
      const fc = can(18, 14), fx = fc.getContext('2d');
      triOut(fx, '#33485c', '#0b1118', 16, 7, 2, 1, 9, 6, 1.14);
      triOut(fx, '#2a3c4e', '#0b1118', 16, 7, 2, 13, 9, 8, 1.14);
      linePx(fx, 15, 7, 8, 7, '#7d94a9', 1);
      return { body: body, fluke: spr(fc, 16, 7) };
    }

    // --------------------------------------------------------------- WHALE --
    // Enormous: ~200 world units long against a ~50-unit manatee.
    function buildWhale() {
      const W2 = 218, H2 = 108, CY = 54;
      const lobes = [
        { x: 12, y: CY, rx: 6, ry: 4 },
        { x: 22, y: CY, rx: 10, ry: 7 },
        { x: 34, y: CY, rx: 15, ry: 11 },
        { x: 52, y: CY, rx: 21, ry: 17 },
        { x: 74, y: CY, rx: 25, ry: 21 },
        { x: 98, y: CY, rx: 27, ry: 23.5 },
        { x: 122, y: CY, rx: 27, ry: 23.5 },
        { x: 146, y: CY, rx: 24, ry: 21 },
        { x: 166, y: CY, rx: 21, ry: 17.5 },
        { x: 184, y: CY, rx: 15, ry: 12 },
        { x: 197, y: CY, rx: 9, ry: 7 },
        { x: 205, y: CY, rx: 4.5, ry: 3.4 },
      ];
      const f = (typeof blobField === 'function') ? blobField(W2, H2, lobes) : shapeField(W2, H2, () => 0);
      const ramp = ['#0f1a24', '#182735', '#233848', '#33505f', '#4a6c7c'];
      const b = blobOf(W2, H2, f, ramp, { outline: '#070c12', smooth: 4, lift: 0.16, contrast: 0.88 });
      const x = b.ctx;

      // pectoral flippers: long humpback blades, baked in with their own shading
      for (const s of [-1, 1]) {
        // a long tapered blade swept back and outward, built as a quad
        const rx0 = 162, ry0 = CY + s * 16;          // root, on the shoulder
        const tx1 = 112, ty1 = CY + s * 47;          // tip
        const nx = 15, ny = s * 13;                   // blade width vector
        const ax0 = rx0, ay0 = ry0;
        const bx1 = rx0 - nx, by1 = ry0 + ny;
        const cx1 = tx1, cy1 = ty1;
        const dx1 = tx1 + 7, dy1 = ty1 - s * 5;
        // outline first, grown a touch
        triOut(x, '#1b2d3c', '#070c12', ax0, ay0, bx1, by1, cx1, cy1, 1.05);
        triOut(x, '#1b2d3c', '#070c12', ax0, ay0, cx1, cy1, dx1, dy1, 1.05);
        triPx(x, '#26445c', ax0 - 2, ay0 + s * 2, bx1 + 3, by1 - s * 2, cx1 + 4, cy1 - s * 4);
        // knobbly white leading edge
        for (let i = 0; i <= 18; i++) {
          const q = i / 18;
          const px0 = lerp(rx0 + 5, tx1 + 5, q), py0 = lerp(ry0, ty1 - s * 3, q);
          pxr(x, i % 3 === 0 ? '#dceaf4' : '#7fa0b4', px0, py0, 1, 1);
        }
      }
      // mottled hide
      for (let i = 0; i < 1400; i++) {
        const hx = hash2(i, 41), hy = hash2(i * 7, 23);
        const px0 = 4 + hx * (W2 - 8), py0 = 4 + hy * (H2 - 8);
        const r = hash2(i * 13, 5);
        if (r > 0.86) maskPx(x, f, W2, H2, px0, py0, '#5c7f90');
        else if (r < 0.14) maskPx(x, f, W2, H2, px0, py0, '#0d1a24');
      }
      // dorsal ridge with tail knuckles
      for (let i = 0; i < 180; i++) {
        const px0 = 16 + i, k = i / 180;
        maskPx(x, f, W2, H2, px0, CY - 1 + Math.sin(k * 3) * 0.3, '#5b7f92');
        maskPx(x, f, W2, H2, px0, CY + 1, '#101d28');
      }
      for (let i = 0; i < 6; i++) maskPx(x, f, W2, H2, 20 + i * 5, CY - 2, '#7b9dae');
      // small humpback dorsal hump: a raised ridge, shaded inside the mask
      for (let i = 0; i < 20; i++) {
        const px0 = 56 + i, q = i / 19;
        const hgt = Math.sin(q * Math.PI) * 6;
        for (let dy = -hgt; dy <= hgt; dy++) {
          const a = Math.abs(dy) / Math.max(0.8, hgt);
          maskPx(x, f, W2, H2, px0, CY + dy, a > 0.86 ? '#0d1a24' : a < 0.3 ? '#56798c' : dy < 0 ? '#3f6274' : '#1c303e');
        }
      }
      // rostrum ridges + tubercles
      for (let r = -1; r <= 1; r++) maskLine(x, f, W2, H2, 176, CY + r * 6, 204, CY + r * 2.4, '#0c1822');
      for (let i = 0; i < 26; i++) {
        const q = i / 25, px0 = 176 + q * 30, py0 = CY + (hash2(i, 9) - 0.5) * 14 * (1 - q * 0.6);
        maskPx(x, f, W2, H2, px0, py0, '#9db9c8');
        maskPx(x, f, W2, H2, px0, py0 + 1, '#0d1a24');
      }
      // the long jaw line either side of the rostrum
      for (const s2 of [-1, 1]) {
        for (let i = 0; i < 34; i++) {
          const q = i / 33;
          maskPx(x, f, W2, H2, 174 + q * 32, CY + s2 * lerp(13, 2.5, q * q), '#050a10');
        }
      }
      // blowhole (paired slits) and the eyes
      pxr(x, '#070c12', 172, CY - 3, 3, 2); pxr(x, '#070c12', 172, CY + 1, 3, 2);
      pxr(x, '#2b4453', 173, CY - 3, 1, 1); pxr(x, '#2b4453', 173, CY + 2, 1, 1);
      for (const s of [-1, 1]) {
        pxr(x, '#070c12', 182, CY + s * 12 - (s < 0 ? 2 : 0), 3, 3);
        pxr(x, '#dff0fb', 183, CY + s * 12 - (s < 0 ? 2 : 0), 1, 1);
      }
      // old scars
      for (let i = 0; i < 9; i++) {
        const sx0 = 40 + hash2(i, 71) * 110, sy0 = CY + (hash2(i * 5, 3) - 0.5) * 36;
        maskLine(x, f, W2, H2, sx0, sy0, sx0 + 6 + hash2(i, 17) * 8, sy0 + (hash2(i, 29) - 0.5) * 5, '#6d8fa0');
      }
      // barnacle clusters
      for (let c2 = 0; c2 < 7; c2++) {
        const bx = 150 + hash2(c2, 55) * 56, by = CY + (hash2(c2 * 3, 13) - 0.5) * 30;
        for (let i = 0; i < 9; i++) {
          maskPx(x, f, W2, H2, bx + (hash2(i, c2) - 0.5) * 7, by + (hash2(i * 3, c2 + 9) - 0.5) * 6, hash2(i, c2 * 7) > 0.5 ? '#c9dbe6' : '#7e98a6');
        }
      }
      const body = spr(b.c, 122, CY);

      // flukes: a wide spade, anchored at the peduncle
      const FW = 54, FH = 44;
      const fc = can(FW, FH), fx = fc.getContext('2d');
      triOut(fx, '#1a2a38', '#070c12', 52, 22, 6, 1, 26, 19, 1.08);
      triOut(fx, '#1a2a38', '#070c12', 52, 22, 6, 43, 26, 25, 1.08);
      triPx(fx, '#2e4c5c', 50, 22, 12, 5, 27, 20);
      triPx(fx, '#25404f', 50, 22, 12, 39, 27, 24);
      linePx(fx, 50, 22, 16, 22, '#6d8fa0', 1);
      for (let i = 0; i < 12; i++) { const q = i / 11; pxr(fx, '#0b1722', 50 - q * 34, 22 - q * 14, 1, 1); pxr(fx, '#0b1722', 50 - q * 34, 22 + q * 14, 1, 1); }
      const fluke = spr(fc, 52, 22);

      let deep = body, deepF = fluke;
      if (typeof tintSprite === 'function') {
        deep = tintSprite(body, '#0a2a3e', 0.52);
        deepF = tintSprite(fluke, '#0a2a3e', 0.52);
      }
      return { body: body, fluke: fluke, deep: deep, deepFluke: deepF, len: 200, half: 26 };
    }

    // ====================================================================
    //  TREASURE ART — hand-authored rows, pure pixels
    // ====================================================================
    const TPAL = {
      '.': null,
      k: '#150d08', K: '#2a1a0e',
      w: '#6b4522', W: '#8a5a2c', t: '#a9743c', T: '#c89152',
      m: '#5b4a32', M: '#8a7346', g: '#a87a1e', G: '#e0b34e', y: '#ffeeb4',
      s: '#7d858f', S: '#aeb6c1', z: '#e6eef6',
      r: '#c8302e', R: '#ff6161', b: '#2d5d86', B: '#59a0d0',
      p: '#d8c6f0', P: '#f6f0ff', e: '#2f9e5b', E: '#6fd88e',
      c: '#8e6a3f', o: '#ff9a3c', q: '#463020', n: '#0b1118',
    };
    function mks(rows, ax, ay) { return makeSprite(rows, { pal: TPAL, ax: ax, ay: ay }); }

    function buildTreasureArt() {
      // ---- sunken chest, three states ------------------------------------
      const chestClosed = [
        '..kkkkkkkkkkkkkkkk..',
        '.kgGGgkkkkkkkkgGGgk.',
        'kwTTTTTTTTTTTTTTTTwk',
        'kwTtTTtTTTtTTtTTTtwk',
        'kgGGGGGGGGGGGGGGGGgk',
        'kwTTTTTTTTTTTTTTTTwk',
        'kkkkkkkkkkkkkkkkkkkk',
        'kwTTTTTTgGGgTTTTTTwk',
        'kwTtTTTTgyygTTTTTtwk',
        'kwTTTTTTgGGgTTTTTTwk',
        'kgGGgTTTTTTTTTTgGGgk',
        'kwTTTTTTTTTTTTTTTTwk',
        'kwTtTTtTTTtTTtTTTtwk',
        'kqwwwwwwwwwwwwwwwwqk',
        '.kkkkkkkkkkkkkkkkkk.',
      ];
      const chestAjar = [
        '....kkkkkkkkkkkk....',
        '..kkgGGgkkkkgGGgkk..',
        '.kwTTTTTTTTTTTTTTwk.',
        'kwTtTTtTTTtTTtTTTtwk',
        'kgGGGGGGGGGGGGGGGGgk',
        'kwTTTTTTTTTTTTTTTTwk',
        '.kkkkkkkkkkkkkkkkkk.',
        'kyyyyyyyyyyyyyyyyyyk',
        'kwTTTTTTgGGgTTTTTTwk',
        'kwTtTTTTgyygTTTTTtwk',
        'kwTTTTTTgGGgTTTTTTwk',
        'kgGGgTTTTTTTTTTgGGgk',
        'kwTTTTTTTTTTTTTTTTwk',
        'kqwwwwwwwwwwwwwwwwqk',
        '.kkkkkkkkkkkkkkkkkk.',
      ];
      const chestOpen = [
        'kwTTTTTTTTTTTTTTTTwk',
        'kwTtTTtTTTtTTtTTTtwk',
        'kgGGGGGGGGGGGGGGGGgk',
        '.kkkkkkkkkkkkkkkkkk.',
        'kyGyGyGyGyGyGyGyGyGk',
        'kGyzGyPGyzGySGyzGyGk',
        'kyGyGySGyGyzGyGyGyyk',
        'kwTTTTTTgGGgTTTTTTwk',
        'kwTtTTTTgyygTTTTTtwk',
        'kwTTTTTTgGGgTTTTTTwk',
        'kgGGgTTTTTTTTTTgGGgk',
        'kwTTTTTTTTTTTTTTTTwk',
        'kqwwwwwwwwwwwwwwwwqk',
        '.kkkkkkkkkkkkkkkkkk.',
      ];
      // ---- giant clam ------------------------------------------------------
      const clamClosed = [
        '.....kkkkkkkk.....',
        '..kkkSSSSSSSSkkk..',
        '.kSzSSzSSzSSzSSzk.',
        'kSzSSzSSzSSzSSzSSk',
        'kSSzSSzSSzSSzSSzSk',
        'kkkkkkkkkkkkkkkkkk',
        'kSSzSSzSSzSSzSSzSk',
        'kSzSSzSSzSSzSSzSSk',
        '.kSSzSSzSSzSSzSSk.',
        '..kkkSSSSSSSSkkk..',
        '.....kkkkkkkk.....',
      ];
      const clamOpen = [
        '.....kkkkkkkk.....',
        '..kkkSSSSSSSSkkk..',
        '.kSzSSzSSzSSzSSzk.',
        'kSzSSzSSzSSzSSzSSk',
        'kkkkkkkkkkkkkkkkkk',
        'kppppPPPPPPppppppk',
        'kpPPzzwwzzPPPPPppk',
        'kkkkkkkkkkkkkkkkkk',
        'kSzSSzSSzSSzSSzSSk',
        '.kSSzSSzSSzSSzSSk.',
        '..kkkSSSSSSSSkkk..',
        '.....kkkkkkkk.....',
      ];
      // ---- wrecked-ship cache ---------------------------------------------
      const wreck = [
        '...kkk..........kkk...',
        '..kwWk..kkkk....kwWk..',
        '..kwWkkkwWWwkkkkkwWk..',
        '.kwWWwwwWttWwwwwwWWwk.',
        'kwWttWWWttttWWWWWttWwk',
        'kwttTTttTTTTttTTTTttwk',
        'kwTTTTTTTTTTTTTTTTTTwk',
        'kkkkkkkkkkkkkkkkkkkkkk',
        '.kwTTsSSsTTTTsSSsTTwk.',
        '.kwTTsSzSTTTTsSzSTTwk.',
        '..kwTTsSsTTTTsSsTTwk..',
        '...kkwwTTTTTTTTwwkk...',
        '.....kkkkkkkkkkkk.....',
      ];
      return {
        chest: [mks(chestClosed, 10, 12), mks(chestAjar, 10, 12), mks(chestOpen, 10, 11)],
        clam: [mks(clamClosed, 9, 5), mks(clamOpen, 9, 6)],
        wreck: mks(wreck, 11, 10),
      };
    }

    // ---- rare finds --------------------------------------------------------
    const RARE = {
      doubloon: { name: 'GOLD DOUBLOON', col: '#ffd464', type: 'metal', n: [5, 8], tier: 1 },
      pearl: { name: 'BLACK PEARL', col: '#e8e0ff', type: 'tech', n: [5, 9], tier: 1 },
      ruby: { name: 'SEA RUBY', col: '#ff6b7e', type: 'powder', n: [6, 10], tier: 1 },
      ingot: { name: 'SILVER INGOT', col: '#dce6f2', type: 'metal', n: [9, 14], tier: 2 },
      core: { name: 'ANCIENT CORE', col: '#6fd88e', type: 'tech', n: [9, 14], tier: 2 },
      amber: { name: 'SEA AMBER', col: '#ffb04a', type: 'fuel', n: [8, 12], tier: 2 },
      crown: { name: "DROWNED CROWN", col: '#ffe9a8', type: 'metal', n: [16, 22], tier: 3, all: 4 },
    };
    function buildRareIcons() {
      const R = {};
      R.doubloon = mks([
        '..kkkk..', '.kgGGgk.', 'kgGyyGgk', 'kGyGGyGk',
        'kGyGGyGk', 'kgGyyGgk', '.kgGGgk.', '..kkkk..',
      ], 4, 4);
      R.pearl = mks([
        '..kkkk..', '.kpPPpk.', 'kpPPPPpk', 'kPPzzPPk',
        'kpPPPPpk', 'kkpPPpkk', '..kkkk..', '........',
      ], 4, 4);
      R.ruby = mks([
        '..kkkk..', '.kRRRRk.', 'kRrrrrRk', 'kRrRRrRk',
        '.kRrrRk.', '..kRRk..', '...kk...', '........',
      ], 4, 4);
      R.ingot = mks([
        '........', '..kkkkk.', '.kzSSSzk', 'kzSSSSSk',
        'kSSSSSsk', 'kkkkkkkk', '........', '........',
      ], 4, 4);
      R.core = mks([
        '..kkkk..', '.kEeeEk.', 'kEezzeEk', 'kezyyzek',
        'kezyyzek', 'kEezzeEk', '.kEeeEk.', '..kkkk..',
      ], 4, 4);
      R.amber = mks([
        '..kkk...', '.koogk..', 'kooGyok.', 'koGyyGok',
        'koogGok.', '.koook..', '..kkk...', '........',
      ], 4, 4);
      R.crown = mks([
        'k.kk.kk.k', 'kykykykyk', 'kGyGyGyGk', 'kGGGGGGGk',
        'kgGRGBGgk', 'kgGGGGGgk', 'kkkkkkkkk', '.........',
      ], 4, 4);
      return R;
    }

    // ------------------------------------------------------------- BUILD ---
    function buildSprites() {
      sp = {};
      sp.fish = {};
      for (const k in FISH) sp.fish[k] = makeFishSet(FISH[k]);
      sp.ray = buildRay();
      sp.turtle = buildTurtle();
      sp.jelly = buildJelly();
      sp.squid = buildSquid();
      sp.crab = buildCrab();
      sp.shark = buildReefShark();
      sp.dolphin = buildDolphin();
      sp.whale = buildWhale();
      const T = buildTreasureArt();
      sp.chest = T.chest; sp.clam = T.clam; sp.wreck = T.wreck;
      sp.rare = buildRareIcons();
    }

    // ====================================================================
    //  RARE PICKUP — same interface as entities.js Pickup, richer payoff
    // ====================================================================
    function RareDrop(x, y, kind) {
      this.x = x; this.y = y; this.kind = kind;
      const K = RARE[kind];
      this.type = K.type;
      this.amount = randi(K.n[0], K.n[1]);
      const a = rand(0, TAU), s = rand(26, 66);
      this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s * 0.7;
      this.z = 0; this.vz = rand(120, 200);
      this.life = 60; this.ph = rand(0, TAU); this.dead = false; this.rare = true;
      this.magnetized = false;
    }
    RareDrop.prototype.update = function (dt) {
      this.life -= dt; if (this.life <= 0) { this.dead = true; return; }
      if (this.z > 0 || this.vz > 0) {
        this.z += this.vz * dt; this.vz -= 320 * dt;
        if (this.z <= 0 && this.vz < 0) { this.z = 0; this.vz = 0; foam(this.x, this.y, 0.2); ripple(this.x, this.y, 10, 40, 0.5); }
      }
      const p = P();
      if (!p) { this.vx *= 0.92; this.vy *= 0.92; this.x += this.vx * dt; this.y += this.vy * dt; return; }
      const d = dist(this.x, this.y, p.x, p.y);
      const mr = 60 * (p.stats ? p.stats.magnet : 1);
      if (d < mr && this.z <= 0) {
        this.magnetized = true;
        const k = Math.min(1, (mr - d) / mr + 0.3), s2 = 240 + 620 * k;
        this.vx = lerp(this.vx, (p.x - this.x) / (d || 1) * s2, 0.22);
        this.vy = lerp(this.vy, (p.y - this.y) / (d || 1) * s2, 0.22);
      } else {
        this.vx *= 0.9; this.vy *= 0.9;
        const f = flow(this.x, this.y); this.vx += f.x * 0.05; this.vy += f.y * 0.05;
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (d < 13) this.collect(p);
    };
    RareDrop.prototype.collect = function (p) {
      this.dead = true;
      const K = RARE[this.kind], g = _G;
      let n = this.amount + (p && p.stats ? p.stats.scrapBonus : 0);
      if (g && g.tree && g.tree.addScrap) {
        if (K.all) { const list = scrapTypes(); for (const t of list) g.tree.addScrap(t, K.all); }
        g.tree.addScrap(this.type, n);
      }
      if (g && g.stats) g.stats.scrapCollected = (g.stats.scrapCollected || 0) + n;
      floatText(this.x, this.y - 10, K.name, K.col, 8);
      floatText(this.x, this.y - 2, '+' + n + ' ' + this.type.toUpperCase(), K.col, 6);
      const T = TN();
      if (T) { T.burst(this.x, this.y, 1.1, K.col); T.impact(this.x, this.y, 1.2, '#ffffff'); T.puff(this.x, this.y, 4, K.col); }
      const P2 = PT(); if (P2) { P2.sparks(this.x, this.y, 10); }
      const A = AU(); if (A) { A.pickup(4); if (A.buy) A.buy(); }
      addCombo(this.x, this.y, 2);
    };
    RareDrop.prototype.render = function (ctx, cam, t) {
      const sx = this.x - cam.x, sy = this.y - cam.y - this.z;
      if (sx < -20 || sy < -20 || sx > VIEW_W + 20 || sy > VIEW_H + 20) return;
      const K = RARE[this.kind];
      const bob = this.z > 0 ? 0 : Math.sin(t * 3.4 + this.ph) * 1.4;
      if (this.z <= 0) { ctx.fillStyle = 'rgba(6,18,48,0.34)'; ctx.fillRect(Math.round(sx - 4), Math.round(sy + 4), 9, 2); }
      // halo: four hard pixels that spin, so it reads as precious
      const sp2 = t * 2.6 + this.ph;
      ctx.fillStyle = K.col;
      for (let i = 0; i < 4; i++) {
        const a = sp2 + i * (TAU / 4), r = 7 + Math.sin(t * 5 + i) * 1.4;
        ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + bob + Math.sin(a) * r * 0.7), 1, 1);
      }
      const ic = sp.rare[this.kind];
      if (ic) blit(ctx, ic, sx, sy + bob);
      if (Math.sin(t * 6 + this.ph) > 0.7) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(sx - 2), Math.round(sy + bob - 5), 1, 1); }
    };

    function scrapTypes() { try { return (typeof SCRAP_TYPES !== 'undefined') ? SCRAP_TYPES : ['metal', 'wood', 'fuel', 'powder', 'tech']; } catch (e) { return ['metal', 'wood', 'fuel', 'powder', 'tech']; } }
    function scrapColor(t) { try { if (typeof SCRAP_COLORS !== 'undefined' && SCRAP_COLORS[t]) return SCRAP_COLORS[t]; } catch (e) { } return '#cfe6ff'; }
    function makePickup(x, y, type) { try { return new Pickup(x, y, type); } catch (e) { return null; } }

    // ====================================================================
    //  MAGNET ARC, TRAILS AND THE SWEEP COMBO
    // ====================================================================
    const track = new Map();          // pickup -> {trail:[], lx, ly, sw, taken}
    const combo = { n: 0, t: -9, x: 0, y: 0, best: 0, flash: 0 };

    function addCombo(x, y, weight) {
      const now = clockT;
      if (now - combo.t > 1.15) combo.n = 0;
      combo.n += (weight || 1);
      combo.t = now; combo.x = x; combo.y = y;
      combo.flash = 0.32;
      if (combo.n > combo.best) combo.best = combo.n;
      if (combo.n >= 5 && combo.n % 5 === 0) {
        const g = _G, list = scrapTypes(), ty = list[randi(0, list.length - 1)];
        if (g && g.tree && g.tree.addScrap) g.tree.addScrap(ty, 2);
        floatText(x, y - 20, 'STREAK BONUS +2', '#ffe48f', 8);
        const T = TN(); if (T) T.burst(x, y - 8, 1.3, '#ffe48f');
      }
    }

    function updateMagnet(dt) {
      const g = _G; if (!g || !g.pickups) return;
      const p = P();
      const list = g.pickups;
      const seen = new Set();
      const R = p ? (58 * (p.stats ? p.stats.magnet : 1) + 34) : 0;
      for (let i = 0; i < list.length; i++) {
        const pk = list[i]; if (!pk) continue;
        seen.add(pk);
        let st = track.get(pk);
        if (!st) { st = { trail: [], lx: pk.x, ly: pk.y, sw: Math.random() < 0.5 ? -1 : 1, ang: 0, rad: 0, hooked: false, tt: 0 }; track.set(pk, st); }
        st.lx = pk.x; st.ly = pk.y;
        if (!p || pk.dead) continue;
        const dx = pk.x - p.x, dy = pk.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (d < R && (pk.z === undefined || pk.z <= 0)) {
          // take the pickup over and fly it home on a spiral
          if (!st.hooked) { st.hooked = true; st.ang = Math.atan2(dy, dx); st.rad = d; st.vel = 40; }
          const k = clamp(1 - st.rad / R, 0, 1);
          st.vel = Math.min(430, st.vel + (260 + 520 * k) * dt);
          st.rad = Math.max(0, st.rad - st.vel * dt);
          st.ang += st.sw * (2.9 * (0.25 + k * 0.9)) * dt;
          pk.x = p.x + Math.cos(st.ang) * st.rad;
          pk.y = p.y + Math.sin(st.ang) * st.rad;
          pk.vx = 0; pk.vy = 0;
          pk.magnetized = true;
          st.tt -= dt;
          if (st.tt <= 0) {
            st.tt = 0.022;
            st.trail.push(pk.x, pk.y, 0.34);
            if (st.trail.length > 30) st.trail.splice(0, 3);
          }
        } else st.hooked = false;
        // age the trail
        for (let q = 2; q < st.trail.length; q += 3) st.trail[q] -= dt;
        while (st.trail.length && st.trail[2] <= 0) st.trail.splice(0, 3);
      }
      // anything that vanished this frame near the player counts toward a sweep
      track.forEach((st, pk) => {
        if (seen.has(pk) && !pk.dead) return;
        if (p && dist(st.lx, st.ly, p.x, p.y) < 26) addCombo(st.lx, st.ly, 1);
        track.delete(pk);
      });
      if (track.size > 400) track.clear();
    }

    function renderTrails(ctx, cam) {
      track.forEach((st, pk) => {
        if (!st.trail.length) return;
        const col = pk.rare ? RARE[pk.kind].col : scrapColor(pk.type);
        ctx.fillStyle = col;
        for (let q = 0; q < st.trail.length; q += 3) {
          const a = st.trail[q + 2];
          if (a <= 0) continue;
          const sx = st.trail[q] - cam.x, sy = st.trail[q + 1] - cam.y;
          if (sx < -4 || sy < -4 || sx > VIEW_W + 4 || sy > VIEW_H + 4) continue;
          ctx.globalAlpha = Math.min(1, a * 2.4);
          ctx.fillRect(Math.round(sx), Math.round(sy), a > 0.2 ? 2 : 1, a > 0.2 ? 2 : 1);
        }
        ctx.globalAlpha = 1;
      });
    }

    // ====================================================================
    //  THREATS — everything the wildlife is afraid of, refreshed per frame
    // ====================================================================
    const TH = [];
    for (let i = 0; i < 14; i++) TH.push({ x: 0, y: 0, r: 0, w: 0 });
    let thN = 0;
    function gatherThreats() {
      thN = 0;
      const g = _G;
      const p = P();
      if (p) { const t = TH[thN++]; t.x = p.x; t.y = p.y; t.r = 46; t.w = (p.rolling ? 1.1 : 0.5); }
      if (g && g.enemies) {
        for (let i = 0; i < g.enemies.length && thN < 11; i++) {
          const e = g.enemies[i]; if (!e || e.dead) continue;
          if (Math.abs(e.x - camX) > 420 || Math.abs(e.y - camY) > 320) continue;
          const t = TH[thN++]; t.x = e.x; t.y = e.y; t.r = 78; t.w = 1.15;
        }
      }
      if (g && g.boss && !g.boss.dead && thN < 12) { const t = TH[thN++]; t.x = g.boss.x; t.y = g.boss.y; t.r = 140; t.w = 1.9; }
      for (let i = 0; i < S.sharks.length && thN < 14; i++) {
        const s = S.sharks[i]; const t = TH[thN++]; t.x = s.x; t.y = s.y; t.r = 92; t.w = 1.5;
      }
    }
    // returns fear 0..n and writes the flee direction into `outv`
    const outv = { x: 0, y: 0 };
    function threatAt(x, y, extra) {
      let fx = 0, fy = 0, tot = 0;
      for (let i = 0; i < thN; i++) {
        const t = TH[i];
        const dx = x - t.x, dy = y - t.y, R = t.r + (extra || 0);
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const d = Math.sqrt(d2) || 0.001;
        const k = (1 - d / R) * t.w;
        fx += dx / d * k; fy += dy / d * k; tot += k;
      }
      outv.x = fx; outv.y = fy;
      return tot;
    }

    // ====================================================================
    //  SCHOOLS
    // ====================================================================
    const SCHOOL_SPECIES = ['sardine', 'anchovy', 'fusilier'];
    function makeSchool(x, y, species, n) {
      const sc = {
        x: x, y: y, a: rng.range(0, TAU), wa: rng.range(0, TAU), waT: rng.range(0, 5),
        sp: rng.range(20, 32), base: rng.range(20, 32), r: 0, fear: 0, split: 0, spread: 1,
        swirl: rng.range(0.5, 1.15), swSp: rng.range(0.7, 1.5), species: species, m: [],
        seed: rng.int(1, 9999), tone: rng.range(0.8, 1.2),
      };
      const rad = Math.sqrt(n) * rng.range(3.4, 5.0);
      sc.r = rad;
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, TAU), d = Math.sqrt(rng.next()) * rad;
        const ox = Math.cos(a) * d * 1.45, oy = Math.sin(a) * d;
        const l = Math.hypot(ox, oy) || 1;
        sc.m.push({
          ox: ox, oy: oy, tx: -oy / l, ty: ox / l,
          ph: rng.range(0, TAU), bf: rng.range(7, 13), side: (i & 1) ? 1 : -1,
          turn: rng.range(0.6, 1.5),
        });
      }
      return sc;
    }
    function updSchool(sc, dt, t) {
      const tot = threatAt(sc.x, sc.y, sc.r * 1.4);
      sc.fear -= dt * 0.55;
      if (tot > 0) sc.fear = Math.max(sc.fear, Math.min(1.8, tot * 1.5));
      sc.fear = clamp(sc.fear, 0, 2);
      let ta;
      if (sc.fear > 0.12 && (outv.x || outv.y)) ta = Math.atan2(outv.y, outv.x);
      else {
        sc.waT -= dt;
        if (sc.waT <= 0) { sc.waT = rand(3, 7); sc.wa = rand(0, TAU); }
        ta = sc.wa + Math.sin(t * 0.33 + sc.seed) * 0.5;
      }
      // steer away from the edges of the world
      if (sc.x < 140) ta = angleLerp(ta, 0, 0.7);
      else if (sc.x > W - 140) ta = angleLerp(ta, Math.PI, 0.7);
      if (sc.y < SH + 150) ta = angleLerp(ta, Math.PI / 2, 0.7);
      else if (sc.y > H - 140) ta = angleLerp(ta, -Math.PI / 2, 0.7);
      sc.a = angleLerp(sc.a, ta, Math.min(1, dt * (1.5 + sc.fear * 4.5)));
      sc.a = ((sc.a % TAU) + TAU) % TAU;
      sc.sp = lerp(sc.sp, sc.base * (1 + sc.fear * 2.3), Math.min(1, dt * 3));
      const f = flow(sc.x, sc.y);
      sc.x += (Math.cos(sc.a) * sc.sp + f.x * 0.4) * dt;
      sc.y += (Math.sin(sc.a) * sc.sp + f.y * 0.4) * dt;
      sc.x = clamp(sc.x, 60, W - 60); sc.y = clamp(sc.y, SH + 90, H - 60);
      // bait-ball: the school tightens and splits around whatever is chasing it
      const wantSplit = (sc.fear > 0.8 && tot > 0.75) ? 1 : 0;
      sc.split = approach(sc.split, wantSplit, dt * (wantSplit ? 3.4 : 1.1));
      sc.spread = lerp(sc.spread, 1 - clamp(sc.fear, 0, 1) * 0.42, Math.min(1, dt * 4));
      sc.swirl = lerp(sc.swirl, 0.6 + sc.fear * 1.5, Math.min(1, dt * 2));
    }
    function drawSchool(ctx, cam, t, sc) {
      const set = sp.fish[sc.species]; if (!set) return;
      const ca = Math.cos(sc.a), sa = Math.sin(sc.a);
      const bx = sc.x - cam.x, by = sc.y - cam.y;
      const swirl = sc.swirl, spread = sc.spread, split = sc.split * sc.r * 0.95;
      const beat = 1 + sc.fear * 1.4;
      const m = sc.m;
      for (let i = 0; i < m.length; i++) {
        const q = m[i];
        const s1 = Math.sin(t * sc.swSp * (1 + sc.fear) + q.ph);
        const lx = (q.ox + q.tx * s1 * swirl * 3.4) * spread;
        const ly = (q.oy + q.ty * s1 * swirl * 3.4 + q.side * split) * spread;
        const px0 = bx + ca * lx - sa * ly;
        const py0 = by + sa * lx + ca * ly + Math.sin(t * 2.7 + q.ph * 1.7) * 0.7;
        if (px0 < -10 || py0 < -10 || px0 > VIEW_W + 10 || py0 > VIEW_H + 10) continue;
        const ang = sc.a + Math.cos(t * sc.swSp + q.ph) * swirl * 0.22 * q.turn;
        const fi = FLEX_CYCLE[((t * q.bf * beat + q.ph) | 0) & 3];
        const s2 = set[fi][angIdx(ang)];
        ctx.drawImage(s2.c, Math.round(px0 - s2.ax), Math.round(py0 - s2.ay));
      }
    }

    // ====================================================================
    //  REEF PICKERS — small mixed groups that peck at the coral
    // ====================================================================
    const REEF_SPECIES = ['clown', 'angel', 'tang', 'butterfly', 'parrot'];
    function makeReefGroup(x, y) {
      const species = REEF_SPECIES[rng.int(0, REEF_SPECIES.length - 1)];
      const g = { x: x, y: y, r: rng.range(18, 34), species: species, m: [], fear: 0 };
      const n = rng.int(4, 8);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, TAU), d = rng.range(0, g.r);
        g.m.push({
          x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, a: rng.range(0, TAU),
          tx: x, ty: y, tT: rng.range(0, 2), sp: rng.range(14, 26), ph: rng.range(0, TAU),
          bf: rng.range(6, 11), peck: 0,
        });
      }
      return g;
    }
    function updReefGroup(g, dt, t) {
      const tot = threatAt(g.x, g.y, g.r + 26);
      g.fear -= dt * 0.7;
      if (tot > 0) g.fear = Math.max(g.fear, Math.min(1.6, tot * 1.5));
      g.fear = clamp(g.fear, 0, 1.6);
      const flee = g.fear > 0.2;
      const fa = Math.atan2(outv.y, outv.x);
      for (let i = 0; i < g.m.length; i++) {
        const f = g.m[i];
        f.tT -= dt;
        if (flee) {
          f.tx = g.x + Math.cos(fa) * g.r * 1.4 + rand(-10, 10);
          f.ty = g.y + Math.sin(fa) * g.r * 1.4 + rand(-10, 10);
          f.peck = 0;
        } else if (f.tT <= 0) {
          f.tT = rand(0.7, 2.4);
          const a = rand(0, TAU), d = rand(0, g.r);
          f.tx = g.x + Math.cos(a) * d; f.ty = g.y + Math.sin(a) * d;
          if (Math.random() < 0.4) f.peck = rand(0.3, 0.8);
        }
        if (f.peck > 0) { f.peck -= dt; continue; }
        const d = dist(f.x, f.y, f.tx, f.ty);
        if (d > 1.5) {
          const want = angleTo(f.x, f.y, f.tx, f.ty);
          f.a = angleLerp(f.a, want, Math.min(1, dt * (5 + g.fear * 8)));
          const sp2 = f.sp * (1 + g.fear * 2.4);
          f.x += Math.cos(f.a) * sp2 * dt; f.y += Math.sin(f.a) * sp2 * dt;
        }
        f.a = ((f.a % TAU) + TAU) % TAU;
      }
    }
    function drawReefGroup(ctx, cam, t, g) {
      const set = sp.fish[g.species]; if (!set) return;
      for (let i = 0; i < g.m.length; i++) {
        const f = g.m[i];
        const px0 = f.x - cam.x, py0 = f.y - cam.y + Math.sin(t * 2.2 + f.ph) * 0.8;
        if (px0 < -12 || py0 < -12 || px0 > VIEW_W + 12 || py0 > VIEW_H + 12) continue;
        const fi = f.peck > 0 ? 0 : FLEX_CYCLE[((t * f.bf * (1 + g.fear) + f.ph) | 0) & 3];
        const s2 = set[fi][angIdx(f.a)];
        ctx.fillStyle = 'rgba(6,18,48,0.20)';
        ctx.fillRect(Math.round(px0 - 2), Math.round(py0 + 4), 5, 1);
        ctx.drawImage(s2.c, Math.round(px0 - s2.ax), Math.round(py0 - s2.ay));
      }
    }

    // ====================================================================
    //  RAYS — glide along the seabed, drawn at seabed level
    // ====================================================================
    function makeRay(x, y) {
      return {
        x: x, y: y, a: rng.range(0, TAU), wa: rng.range(0, TAU), waT: rng.range(0, 6),
        sp: rng.range(10, 17), base: rng.range(10, 17), ph: rng.range(0, TAU),
        flap: rng.range(0.8, 1.25), fear: 0, tail: [],
      };
    }
    function updRay(r, dt, t) {
      const tot = threatAt(r.x, r.y, 40);
      r.fear -= dt * 0.5;
      if (tot > 0) r.fear = Math.max(r.fear, Math.min(1.5, tot * 1.3));
      r.fear = clamp(r.fear, 0, 1.5);
      let ta;
      if (r.fear > 0.15) ta = Math.atan2(outv.y, outv.x);
      else {
        r.waT -= dt;
        if (r.waT <= 0) { r.waT = rand(4, 9); r.wa = rand(0, TAU); }
        ta = r.wa + Math.sin(t * 0.21 + r.ph) * 0.45;
      }
      if (r.x < 120) ta = angleLerp(ta, 0, 0.6); else if (r.x > W - 120) ta = angleLerp(ta, Math.PI, 0.6);
      if (r.y < SH + 160) ta = angleLerp(ta, Math.PI / 2, 0.6); else if (r.y > H - 120) ta = angleLerp(ta, -Math.PI / 2, 0.6);
      r.a = angleLerp(r.a, ta, Math.min(1, dt * (1.1 + r.fear * 4)));
      r.a = ((r.a % TAU) + TAU) % TAU;
      r.sp = lerp(r.sp, r.base * (1 + r.fear * 2.6), Math.min(1, dt * 2.2));
      const f = flow(r.x, r.y);
      r.x += (Math.cos(r.a) * r.sp + f.x * 0.25) * dt;
      r.y += (Math.sin(r.a) * r.sp + f.y * 0.25) * dt;
      r.x = clamp(r.x, 40, W - 40); r.y = clamp(r.y, SH + 110, H - 40);
    }
    function drawRay(ctx, cam, t, r) {
      const sx = r.x - cam.x, sy = r.y - cam.y;
      const beat = t * (1.1 + r.fear * 2.6) * r.flap + r.ph;
      const fi = [0, 1, 2, 3][(beat | 0) & 3];
      // whip tail trailing behind
      const back = r.a + Math.PI;
      ctx.fillStyle = 'rgba(12,22,34,0.85)';
      for (let i = 2; i < 24; i++) {
        const q = i / 23;
        const wob = Math.sin(beat * 1.4 - q * 3.4) * 3.6 * q;
        const ax2 = sx + Math.cos(back) * (14 + i * 1.3) - Math.sin(back) * wob;
        const ay2 = sy + Math.sin(back) * (14 + i * 1.3) + Math.cos(back) * wob;
        ctx.fillRect(Math.round(ax2), Math.round(ay2), q > 0.6 ? 1 : 2, q > 0.6 ? 1 : 2);
      }
      // soft contact shadow on the sand
      ctx.fillStyle = 'rgba(6,18,40,0.22)';
      ellipsePx(ctx, sx + 2, sy + 4, 24, 19, 'rgba(6,18,40,0.20)');
      const squash = 1 - Math.abs(Math.sin(beat * Math.PI * 0.5)) * 0.10;
      blitRot(ctx, sp.ray.fr[fi], sx, sy, r.a, 1, squash);
    }

    // ====================================================================
    //  SEA TURTLES
    // ====================================================================
    function makeTurtle(x, y) {
      return {
        x: x, y: y, a: rng.range(0, TAU), wa: rng.range(0, TAU), waT: rng.range(0, 5),
        sp: rng.range(13, 20), base: rng.range(13, 20), ph: rng.range(0, TAU), fear: 0,
        surf: 0, surfT: rng.range(6, 24),
      };
    }
    function updTurtle(tu, dt, t) {
      const tot = threatAt(tu.x, tu.y, 34);
      tu.fear -= dt * 0.6;
      if (tot > 0) tu.fear = Math.max(tu.fear, Math.min(1.4, tot * 1.2));
      tu.fear = clamp(tu.fear, 0, 1.4);
      let ta;
      if (tu.fear > 0.2) ta = Math.atan2(outv.y, outv.x);
      else {
        tu.waT -= dt;
        if (tu.waT <= 0) { tu.waT = rand(3, 8); tu.wa = rand(0, TAU); }
        ta = tu.wa + Math.sin(t * 0.3 + tu.ph) * 0.4;
      }
      if (tu.x < 110) ta = angleLerp(ta, 0, 0.6); else if (tu.x > W - 110) ta = angleLerp(ta, Math.PI, 0.6);
      if (tu.y < SH + 130) ta = angleLerp(ta, Math.PI / 2, 0.6); else if (tu.y > H - 110) ta = angleLerp(ta, -Math.PI / 2, 0.6);
      tu.a = angleLerp(tu.a, ta, Math.min(1, dt * (1.6 + tu.fear * 4)));
      tu.a = ((tu.a % TAU) + TAU) % TAU;
      tu.sp = lerp(tu.sp, tu.base * (1 + tu.fear * 2.2), Math.min(1, dt * 2.6));
      const f = flow(tu.x, tu.y);
      tu.x += (Math.cos(tu.a) * tu.sp + f.x * 0.3) * dt;
      tu.y += (Math.sin(tu.a) * tu.sp + f.y * 0.3) * dt;
      tu.x = clamp(tu.x, 40, W - 40); tu.y = clamp(tu.y, SH + 80, H - 40);
      // periodic trip to the surface for a breath
      tu.surfT -= dt;
      if (tu.surfT <= 0) { tu.surf = 2.2; tu.surfT = rand(14, 32); }
      if (tu.surf > 0) {
        tu.surf -= dt;
        if (Math.random() < 0.5) { disturb(tu.x, tu.y, 0.8, 0, 0); foam(tu.x, tu.y, 0.1); }
        const p = PT(); if (p && Math.random() < 0.2) p.bubbles(tu.x, tu.y, 1);
      }
    }
    function drawTurtle(ctx, cam, t, tu) {
      const sx = tu.x - cam.x, sy = tu.y - cam.y;
      const beat = t * (1.6 + tu.fear * 2.4) + tu.ph;
      const sw = Math.sin(beat), sw2 = Math.sin(beat - 0.9);
      const ca = Math.cos(tu.a), sa = Math.sin(tu.a);
      const L = (ox, oy) => [sx + ca * ox - sa * oy, sy + sa * ox + ca * oy];
      // rear flippers
      for (const s of [-1, 1]) {
        const pt = L(-8, s * 7);
        blitRot(ctx, sp.turtle.flipB, pt[0], pt[1], tu.a + s * (2.3 + sw2 * 0.35));
      }
      // front paddles
      for (const s of [-1, 1]) {
        const pt = L(5, s * 8);
        blitRot(ctx, sp.turtle.flip, pt[0], pt[1], tu.a + s * (1.15 + sw * 0.5));
      }
      // head, stretching forward with the stroke
      const hp = L(13 + sw * 0.8, 0);
      blitRot(ctx, sp.turtle.head, hp[0], hp[1], tu.a);
      blitRot(ctx, sp.turtle.shell, sx, sy, tu.a);
      if (tu.surf > 0 && ((t * 8) | 0) % 2 === 0) {
        ctx.fillStyle = 'rgba(238,250,255,0.55)';
        ringPx(ctx, sx, sy, 15, 11, 'rgba(238,250,255,0.55)');
      }
    }

    // ====================================================================
    //  JELLYFISH — pulse, drift with the current
    // ====================================================================
    function makeJelly(x, y) {
      return {
        x: x, y: y, ph: rng.range(0, TAU), rate: rng.range(0.55, 0.95),
        kind: rng.int(0, 2), sz: rng.range(0.55, 1.15), a: rng.range(0, TAU),
        vx: 0, vy: 0, fear: 0, nT: rng.range(0, 5),
      };
    }
    function updJelly(j, dt, t) {
      const tot = threatAt(j.x, j.y, 22);
      j.fear -= dt * 0.6;
      if (tot > 0) { j.fear = Math.max(j.fear, Math.min(1.5, tot * 1.4)); j.a = Math.atan2(outv.y, outv.x); }
      j.fear = clamp(j.fear, 0, 1.5);
      const prev = j.ph;
      j.ph += dt * (j.rate + j.fear * 2.4) * 2.2;
      // a kick of thrust on each bell contraction
      if (Math.floor(j.ph / (Math.PI * 2) * 4) !== Math.floor(prev / (Math.PI * 2) * 4)) {
        const idx = ((j.ph / (Math.PI * 2) * 4) | 0) & 3;
        if (idx === 2) {
          const push = (10 + j.fear * 44) * j.sz;
          j.vx += Math.cos(j.a) * push; j.vy += Math.sin(j.a) * push;
        }
      }
      j.nT -= dt;
      if (j.nT <= 0) { j.nT = rand(3, 7); if (j.fear < 0.2) j.a += rand(-1, 1); }
      j.vx *= Math.pow(0.16, dt); j.vy *= Math.pow(0.16, dt);
      const f = flow(j.x, j.y);
      j.x += (j.vx + f.x * 0.75) * dt;
      j.y += (j.vy + f.y * 0.75) * dt;
      if (j.x < 30 || j.x > W - 30) { j.a = Math.PI - j.a; j.x = clamp(j.x, 30, W - 30); }
      if (j.y < SH + 70 || j.y > H - 30) { j.a = -j.a; j.y = clamp(j.y, SH + 70, H - 30); }
    }
    function drawJelly(ctx, cam, t, j) {
      const sx = j.x - cam.x, sy = j.y - cam.y;
      const K = sp.jelly[j.kind];
      const fi = ((j.ph / (Math.PI * 2) * 4) | 0) & 3;
      const squeeze = [1, 0.86, 0.74, 0.9][fi];
      // tentacles: they lag behind the bell
      const n = 7;
      ctx.fillStyle = K.tent;
      for (let i = 0; i < n; i++) {
        const off = (i / (n - 1) - 0.5) * 8 * j.sz;
        const len = (11 + (i % 3) * 5) * j.sz * (0.7 + squeeze * 0.5);
        let px0 = sx + off, py0 = sy + 4 * j.sz;
        for (let s = 0; s < len; s++) {
          const q = s / len;
          const wob = Math.sin(t * 2.4 + j.ph * 0.5 + i * 1.3 - q * 3.6) * 2.4 * q;
          ctx.globalAlpha = 0.75 - q * 0.4;
          ctx.fillRect(Math.round(px0 + wob - j.vx * q * 0.02), Math.round(py0 + s - j.vy * q * 0.02), 1, 1);
        }
      }
      // four frilly oral arms
      ctx.fillStyle = K.arm;
      for (let i = 0; i < 4; i++) {
        const off = (i - 1.5) * 2.4 * j.sz;
        for (let s = 0; s < 8 * j.sz; s++) {
          const q = s / (8 * j.sz);
          ctx.globalAlpha = 0.85 - q * 0.5;
          ctx.fillRect(Math.round(sx + off + Math.sin(t * 3 + i + q * 3) * 1.6 * q), Math.round(sy + 3 + s), 1, 1);
        }
      }
      ctx.globalAlpha = 0.86;
      blitRot(ctx, K.fr[fi], sx, sy, 0, j.sz, j.sz);
      ctx.globalAlpha = 1;
    }

    // ====================================================================
    //  SQUID — hover, then jet away and ink when startled
    // ====================================================================
    function makeSquid(x, y) {
      return {
        x: x, y: y, a: rng.range(0, TAU), sp: 0, ph: rng.range(0, TAU),
        fear: 0, jet: 0, inkCd: 0, wa: rng.range(0, TAU), waT: rng.range(0, 4),
      };
    }
    function updSquid(q, dt, t) {
      const tot = threatAt(q.x, q.y, 40);
      q.inkCd -= dt;
      q.fear -= dt * 0.7;
      if (tot > 0) {
        if (q.fear < 0.35 && tot > 0.35 && q.inkCd <= 0) {
          q.inkCd = 6;
          S.ink.push({ x: q.x, y: q.y, r: 3, max: rand(26, 40), life: 5.5, max0: 5.5, ph: rand(0, TAU) });
          const p = PT(); if (p) p.bubbles(q.x, q.y, 5);
        }
        q.fear = Math.max(q.fear, Math.min(1.8, tot * 1.6));
        q.a = Math.atan2(outv.y, outv.x);
        q.jet = Math.max(q.jet, 1);
      }
      q.fear = clamp(q.fear, 0, 1.8);
      if (q.jet > 0) {
        q.jet -= dt * 1.6;
        q.sp = lerp(q.sp, 150, Math.min(1, dt * 7));
      } else {
        q.waT -= dt;
        if (q.waT <= 0) { q.waT = rand(2, 5); q.wa = rand(0, TAU); q.sp = rand(6, 14); }
        q.a = angleLerp(q.a, q.wa, Math.min(1, dt * 0.9));
        q.sp = lerp(q.sp, 9, Math.min(1, dt * 1.5));
      }
      q.a = ((q.a % TAU) + TAU) % TAU;
      const f = flow(q.x, q.y);
      q.x += (Math.cos(q.a) * q.sp + f.x * 0.4) * dt;
      q.y += (Math.sin(q.a) * q.sp + f.y * 0.4) * dt;
      if (q.x < 40 || q.x > W - 40) { q.a = Math.PI - q.a; q.x = clamp(q.x, 40, W - 40); }
      if (q.y < SH + 100 || q.y > H - 40) { q.a = -q.a; q.y = clamp(q.y, SH + 100, H - 40); }
    }
    function drawSquid(ctx, cam, t, q) {
      const sx = q.x - cam.x, sy = q.y - cam.y;
      // the squid swims mantle-first when jetting, arms-first when cruising
      const rot = q.jet > 0 ? q.a + Math.PI : q.a;
      const ca = Math.cos(rot), sa = Math.sin(rot);
      const spread = q.jet > 0 ? 0.25 : 1;
      const beat = t * (2 + q.jet * 3) + q.ph;
      // arms stream out of the head end
      for (let i = 0; i < 8; i++) {
        const s = (i / 7 - 0.5);
        const base = rot + Math.PI + s * 1.5 * spread;
        const len = 11 + (i % 3) * 3;
        const col = (i & 1) ? sp.squid.arm : sp.squid.armD;
        ctx.fillStyle = col;
        let px0 = sx - ca * 9, py0 = sy - sa * 9;
        for (let k = 0; k < len; k++) {
          const qq = k / len;
          const aa = base + Math.sin(beat + i * 0.8 - qq * 3) * 0.5 * spread * (1 - q.jet * 0.6);
          px0 += Math.cos(aa); py0 += Math.sin(aa);
          ctx.fillRect(Math.round(px0), Math.round(py0), qq > 0.6 ? 1 : 2, qq > 0.6 ? 1 : 2);
        }
      }
      blitRot(ctx, sp.squid.body, sx, sy, rot);
      if (q.jet > 0.4) { const T = TN(); if (T && Math.random() < 0.3) T.speed(q.x, q.y, q.a, 1); }
    }

    // ====================================================================
    //  CRABS — scuttle on the bottom
    // ====================================================================
    function makeCrab(x, y) {
      return {
        x: x, y: y, dir: rng.next() < 0.5 ? -1 : 1, ph: rng.range(0, TAU),
        state: 'idle', t: rng.range(0, 2), sp: 0, fear: 0, wave: 0,
      };
    }
    function updCrab(c, dt, t) {
      const tot = threatAt(c.x, c.y, 16);
      c.fear -= dt * 0.8;
      if (tot > 0) { c.fear = Math.max(c.fear, Math.min(1.6, tot * 1.6)); c.dir = outv.x >= 0 ? 1 : -1; c.state = 'run'; c.t = rand(0.6, 1.3); }
      c.fear = clamp(c.fear, 0, 1.6);
      c.t -= dt;
      if (c.t <= 0) {
        if (c.state === 'run') { c.state = 'idle'; c.t = rand(0.5, 1.8); c.wave = Math.random() < 0.45 ? rand(0.5, 1.1) : 0; }
        else { c.state = 'run'; c.t = rand(0.4, 1.2); c.dir = Math.random() < 0.5 ? -1 : 1; }
      }
      if (c.wave > 0) c.wave -= dt;
      const want = c.state === 'run' ? (26 + c.fear * 58) : 0;
      c.sp = lerp(c.sp, want, Math.min(1, dt * 8));
      c.x += c.dir * c.sp * dt;
      c.y += Math.sin(t * 1.3 + c.ph) * 4 * dt;
      c.x = clamp(c.x, 30, W - 30); c.y = clamp(c.y, SH + 60, H - 30);
      if (c.x <= 31 || c.x >= W - 31) c.dir = -c.dir;
    }
    function drawCrab(ctx, cam, t, c) {
      const sx = c.x - cam.x, sy = c.y - cam.y;
      const fi = c.sp > 4 ? (((t * (7 + c.fear * 8) + c.ph) | 0) % 3) : (c.wave > 0 ? (((t * 6) | 0) & 1) + 1 : 0);
      ctx.fillStyle = 'rgba(6,18,40,0.30)';
      ctx.fillRect(Math.round(sx - 5), Math.round(sy + 4), 11, 2);
      const s2 = sp.crab[fi];
      if (c.dir < 0) { ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.scale(-1, 1); ctx.drawImage(s2.c, -s2.ax, -s2.ay); ctx.restore(); }
      else ctx.drawImage(s2.c, Math.round(sx - s2.ax), Math.round(sy - s2.ay));
      if (c.sp > 6 && Math.random() < 0.12) { const p = PT(); if (p) p.smoke(c.x, c.y + 2, 1, 'rgba(180,160,120,', 2); }
    }

    // ====================================================================
    //  REEF SHARK — patrols a beat, everything else keeps its distance
    // ====================================================================
    function makeShark(x, y) {
      return {
        x: x, y: y, a: rng.range(0, TAU), sp: rng.range(26, 36), ph: rng.range(0, TAU),
        cx: x, cy: y, rad: rng.range(120, 260), orb: rng.range(0, TAU),
        dir: rng.next() < 0.5 ? -1 : 1, curious: 0, curT: rng.range(6, 20),
      };
    }
    function updShark(s, dt, t) {
      s.curT -= dt;
      const p = P();
      if (s.curT <= 0 && p && dist(s.x, s.y, p.x, p.y) < 330) { s.curious = rand(3, 6); s.curT = rand(14, 34); }
      let tx, ty;
      if (s.curious > 0 && p) {
        s.curious -= dt;
        const ang = angleTo(p.x, p.y, s.x, s.y);
        tx = p.x + Math.cos(ang) * 60; ty = p.y + Math.sin(ang) * 60;
      } else {
        s.orb += s.dir * dt * 0.28;
        tx = s.cx + Math.cos(s.orb) * s.rad;
        ty = s.cy + Math.sin(s.orb) * s.rad * 0.7;
      }
      const want = angleTo(s.x, s.y, tx, ty);
      s.a = angleLerp(s.a, want, Math.min(1, dt * 1.5));
      s.a = ((s.a % TAU) + TAU) % TAU;
      s.x += Math.cos(s.a) * s.sp * dt;
      s.y += Math.sin(s.a) * s.sp * dt;
      s.x = clamp(s.x, 50, W - 50); s.y = clamp(s.y, SH + 140, H - 50);
      if (Math.random() < dt * 4) disturb(s.x, s.y, 0.5, Math.cos(s.a) * s.sp, Math.sin(s.a) * s.sp);
    }
    function drawShark(ctx, cam, t, s) {
      const sx = s.x - cam.x, sy = s.y - cam.y;
      const sway = Math.sin(t * 3.1 + s.ph) * 0.13;
      ellipsePx(ctx, sx + 3, sy + 5, 26, 10, 'rgba(6,18,40,0.24)');
      blitRot(ctx, sp.shark, sx, sy, s.a + sway);
    }

    // ====================================================================
    //  INK CLOUDS
    // ====================================================================
    function updInk(dt) {
      for (let i = S.ink.length - 1; i >= 0; i--) {
        const k = S.ink[i];
        k.life -= dt;
        if (k.life <= 0) { S.ink.splice(i, 1); continue; }
        k.r = lerp(k.r, k.max, Math.min(1, dt * 1.5));
        const f = flow(k.x, k.y);
        k.x += f.x * dt * 0.5; k.y += f.y * dt * 0.5;
      }
    }
    function drawInk(ctx, cam, t) {
      for (let i = 0; i < S.ink.length; i++) {
        const k = S.ink[i];
        const sx = k.x - cam.x, sy = k.y - cam.y;
        if (sx < -70 || sy < -70 || sx > VIEW_W + 70 || sy > VIEW_H + 70) continue;
        const a = clamp(k.life / k.max0, 0, 1);
        ctx.globalAlpha = a * 0.85;
        ellipsePx(ctx, sx, sy, k.r, k.r * 0.82, '#0a0a14');
        ctx.globalAlpha = a * 0.7;
        for (let b = 0; b < 5; b++) {
          const ang = k.ph + b * 1.257 + t * 0.25;
          ellipsePx(ctx, sx + Math.cos(ang) * k.r * 0.72, sy + Math.sin(ang) * k.r * 0.6, k.r * 0.46, k.r * 0.38, '#12101c');
        }
        ctx.globalAlpha = a * 0.5;
        ellipsePx(ctx, sx - k.r * 0.2, sy - k.r * 0.2, k.r * 0.5, k.r * 0.4, '#1d1a2c');
        ctx.globalAlpha = 1;
      }
    }

    // ====================================================================
    //  WHALE — enormous, friendly, and rideable
    // ====================================================================
    const SADDLE = -18;        // local offset of the rider's seat, from the anchor
    const WIND_DUR = 1.9;      // wind-up before the breach
    const BREACH_DUR = 0.95;

    function makeWhale(x, y) {
      return {
        x: x, y: y, a: rng.range(0, TAU), sp: 15, base: 15, z: 0,
        state: 'deep', t: 0, ph: rng.range(0, TAU), wa: rng.range(0, TAU), waT: 0,
        sub: 1,                 // 1 = fully submerged silhouette, 0 = at the surface
        blowT: rand(4, 9), windT: 0, breachT: 0, launched: false,
        stateT: rand(8, 16), distT: 0, cool: 0, dead: false,
      };
    }
    function saddleOf(w) { return { x: w.x + Math.cos(w.a) * SADDLE, y: w.y + Math.sin(w.a) * SADDLE }; }
    function headOf(w) { return { x: w.x + Math.cos(w.a) * 86, y: w.y + Math.sin(w.a) * 86 }; }

    function updWhale(w, dt, t) {
      w.t += dt; w.stateT -= dt; w.cool -= dt;
      const riding = API.riding === w;

      // ---- surfacing cycle ------------------------------------------------
      if (!riding && w.state !== 'wind' && w.state !== 'breach' && w.state !== 'crash') {
        if (w.stateT <= 0) {
          if (w.state === 'deep') { w.state = 'surface'; w.stateT = rand(26, 40); }
          else { w.state = 'deep'; w.stateT = rand(10, 18); }
        }
      }
      const wantSub = (w.state === 'deep') ? 1 : 0;
      w.sub = approach(w.sub, wantSub, dt * 0.45);

      // ---- heading --------------------------------------------------------
      let ta;
      w.waT -= dt;
      if (w.waT <= 0) { w.waT = rand(7, 14); w.wa = rand(0, TAU); }
      ta = w.wa + Math.sin(t * 0.13 + w.ph) * 0.3;
      if (w.x < 280) ta = angleLerp(ta, 0, 0.8); else if (w.x > W - 280) ta = angleLerp(ta, Math.PI, 0.8);
      if (w.y < SH + 300) ta = angleLerp(ta, Math.PI / 2, 0.8); else if (w.y > H - 260) ta = angleLerp(ta, -Math.PI / 2, 0.8);
      const turnK = (w.state === 'breach') ? 0.25 : (riding ? 0.5 : 1);
      w.a = angleLerp(w.a, ta, Math.min(1, dt * 0.36 * turnK));
      w.a = ((w.a % TAU) + TAU) % TAU;

      // ---- states ---------------------------------------------------------
      let targetSp = w.base * (w.state === 'deep' ? 1.15 : 1);
      if (w.state === 'wind') {
        w.windT += dt;
        // slow dip, then the surge
        const k = w.windT / WIND_DUR;
        targetSp = k < 0.45 ? w.base * 0.25 : w.base * (1 + (k - 0.45) * 5.5);
        w.sub = approach(w.sub, 0.18, dt * 2);
        const p = PT();
        if (p && Math.random() < dt * 30) p.bubbles(w.x + rand(-70, 70), w.y + rand(-26, 26), 2);
        const T = TN();
        if (T && Math.random() < dt * 14) T.speed(w.x + rand(-80, 80), w.y + rand(-26, 26), w.a, 1);
        shakeCam(k * 3);
        if (w.windT >= WIND_DUR) { w.state = 'breach'; w.breachT = 0; w.launched = false; const A = AU(); if (A && A.roar) A.roar(); }
      } else if (w.state === 'breach') {
        w.breachT += dt;
        const k = Math.min(1, w.breachT / BREACH_DUR);
        w.z = Math.sin(k * Math.PI) * 34;
        w.sub = 0;
        targetSp = w.base * 3.4;
        const p = PT();
        if (p) {
          if (Math.random() < dt * 40) p.splash(w.x + rand(-90, 90), w.y + rand(-30, 30), 1.4);
          if (Math.random() < dt * 24) p.spray(w.x + rand(-80, 80), w.y + rand(-30, 30), w.a, 3, 150);
        }
        disturb(w.x, w.y, 6, Math.cos(w.a) * 200, Math.sin(w.a) * 200);
        foam(w.x, w.y, 0.9);
        shakeCam(5);
        if (!w.launched && k > 0.36) {
          w.launched = true;
          launchRider(w);
        }
        if (k >= 1) { w.state = 'crash'; w.breachT = 0; }
      } else if (w.state === 'crash') {
        w.breachT += dt;
        w.z = Math.max(0, w.z - dt * 90);
        targetSp = w.base * 1.4;
        if (w.breachT > 0.35 && !w.crashed) {
          w.crashed = true;
          const p = PT();
          if (p) { for (let i = 0; i < 9; i++) p.splash(w.x + rand(-90, 90), w.y + rand(-30, 30), 2.6); }
          const T = TN(); if (T) { T.shock(w.x, w.y, 190, 0.55); T.burst(w.x, w.y, 3, '#eaf8ff'); }
          disturb(w.x, w.y, 8, 0, 0); ripple(w.x, w.y, 190, 200, 0.7);
          shakeCam(10);
          splashHit(w.x, w.y, 120, 26);
          const A = AU(); if (A) A.splash(2.4);
          scare(w.x, w.y, 260, 1.5);
        }
        if (w.breachT > 1.6) { w.state = 'deep'; w.stateT = rand(16, 26); w.cool = 22; w.crashed = false; w.launched = false; }
      }
      w.sp = lerp(w.sp, targetSp, Math.min(1, dt * 1.6));

      // ---- move -----------------------------------------------------------
      const f = flow(w.x, w.y);
      w.x += (Math.cos(w.a) * w.sp + f.x * 0.2) * dt;
      w.y += (Math.sin(w.a) * w.sp + f.y * 0.2) * dt;
      w.x = clamp(w.x, 150, W - 150); w.y = clamp(w.y, SH + 200, H - 150);

      // ---- the surface knows a whale went past ----------------------------
      w.distT -= dt;
      if (w.distT <= 0) {
        w.distT = 0.09;
        const st = (1 - w.sub) * 2.6 + 0.5;
        for (let i = -2; i <= 2; i++) {
          const ox = Math.cos(w.a) * i * 42, oy = Math.sin(w.a) * i * 42;
          disturb(w.x + ox, w.y + oy, st, Math.cos(w.a) * w.sp * 2, Math.sin(w.a) * w.sp * 2);
        }
        if (w.sub < 0.4) { foam(w.x, w.y, 0.14); ripple(w.x + Math.cos(w.a) * 60, w.y + Math.sin(w.a) * 60, 40, 55, 0.3); }
      }
      // ---- blow ------------------------------------------------------------
      if (w.sub < 0.5) {
        w.blowT -= dt;
        if (w.blowT <= 0) {
          w.blowT = rand(7, 14);
          const h = headOf(w), p = PT(), T = TN();
          if (p) { p.spray(h.x, h.y, -Math.PI / 2, 26, 200); p.splash(h.x, h.y, 1.6); }
          if (T) { T.puff(h.x, h.y - 6, 7, '#f0fbff'); T.shock(h.x, h.y, 46, 0.5); }
          ripple(h.x, h.y, 60, 90, 0.6);
          const A = AU(); if (A) A.splash(1.5);
        }
      }
      // ---- carry the rider --------------------------------------------------
      if (riding) {
        const p = P(), s = saddleOf(w);
        if (!p) { API.riding = null; w.state = 'surface'; w.stateT = rand(10, 20); }
        else {
          p.x = s.x; p.y = s.y - w.z;
          p.vx = Math.cos(w.a) * w.sp; p.vy = Math.sin(w.a) * w.sp;
          if (p.invuln !== undefined) p.invuln = Math.max(p.invuln, 0.2);
          if (p.roll) { p.roll.active = false; }
        }
      }
    }
    function canRide(w) {
      return !w.launched && w.cool <= 0 && w.sub < 0.55 &&
        (w.state === 'surface' || w.state === 'deep');
    }
    function mountWhale(w) {
      API.riding = w;
      w.state = 'wind'; w.windT = 0; w.launched = false;
      const T = TN(); if (T) { T.impact(w.x, w.y, 2.4, '#eaf8ff'); T.emote(w.x, w.y - 30, '!'); }
      floatText(w.x, w.y - 40, 'HOLD ON!', '#eaf8ff', 9);
      const A = AU(); if (A && A.roar) A.roar();
      const p = PT(); if (p) p.bubbles(w.x, w.y, 12);
      scare(w.x, w.y, 180, 0.8);
    }

    // ---- the rider's flight -------------------------------------------------
    const fly = { on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, trail: 0 };
    function launchRider(w) {
      if (API.riding !== w) return;
      const s = saddleOf(w);
      API.riding = null;
      fly.on = true; fly.t = 0;
      fly.x = s.x; fly.y = s.y; fly.z = w.z + 8;
      fly.vx = Math.cos(w.a) * 120; fly.vy = Math.sin(w.a) * 120; fly.vz = 175;
      const T = TN();
      if (T) { T.burst(s.x, s.y, 2.6, '#ffe48f'); T.impact(s.x, s.y, 2.2, '#ffffff'); T.shock(s.x, s.y, 120, 0.5); }
      floatText(s.x, s.y - 26, 'LAUNCH!', '#ffe48f', 10);
      const p = PT(); if (p) p.splash(s.x, s.y, 3);
      shakeCam(9);
      const A = AU(); if (A) A.splash(2);
    }
    function updFly(dt) {
      if (!fly.on) return;
      fly.t += dt;
      // a little air steering so the player picks where the wave lands
      try {
        if (typeof Input !== 'undefined' && Input.axis) {
          const ax = Input.axis();
          fly.vx += ax.x * 110 * dt; fly.vy += ax.y * 110 * dt;
        }
      } catch (e) { }
      fly.x += fly.vx * dt; fly.y += fly.vy * dt;
      fly.z += fly.vz * dt; fly.vz -= 300 * dt;
      fly.x = clamp(fly.x, 30, W - 30); fly.y = clamp(fly.y, SH + 40, H - 30);
      const p = P();
      if (p) { p.x = fly.x; p.y = fly.y - fly.z; p.vx = fly.vx * 0.2; p.vy = fly.vy * 0.2; if (p.invuln !== undefined) p.invuln = Math.max(p.invuln, 0.2); }
      fly.trail -= dt;
      if (fly.trail <= 0) {
        fly.trail = 0.05;
        const T = TN(); if (T) T.speed(fly.x, fly.y - fly.z, Math.atan2(fly.vy, fly.vx), 1);
        const pp = PT(); if (pp && Math.random() < 0.5) pp.spray(fly.x, fly.y - fly.z, Math.atan2(-fly.vy, -fly.vx), 1, 40);
      }
      if (fly.z <= 0 && fly.vz < 0) {
        fly.on = false;
        if (p) { p.x = fly.x; p.y = fly.y; }
        const T = TN();
        if (T) { T.shock(fly.x, fly.y, 200, 0.6); T.shock(fly.x, fly.y, 130, 0.42); T.burst(fly.x, fly.y, 3.4, '#eaf8ff'); T.impact(fly.x, fly.y, 3, '#ffffff'); }
        const pp = PT();
        if (pp) { for (let i = 0; i < 10; i++) pp.splash(fly.x + rand(-40, 40), fly.y + rand(-26, 26), 2.6); }
        disturb(fly.x, fly.y, 8, 0, 0);
        ripple(fly.x, fly.y, 180, 220, 0.85); ripple(fly.x, fly.y, 110, 150, 0.7);
        for (let i = 0; i < 16; i++) foam(fly.x + rand(-80, 80), fly.y + rand(-60, 60), 0.5);
        shakeCam(14);
        floatText(fly.x, fly.y - 26, 'WAVE SLAM!', '#eaf8ff', 11);
        const A = AU(); if (A) { A.splash(3); if (A.explosion) A.explosion(1.4); }
        splashHit(fly.x, fly.y, 108, 70);
        scare(fly.x, fly.y, 260, 1.8);
      }
    }
    function drawWhale(ctx, cam, t, w) {
      const sx = w.x - cam.x, sy = w.y - cam.y - w.z;
      const art = sp.whale;
      const deep = w.sub > 0.55;
      const body = deep ? art.deep : art.body;
      const flukeS = deep ? art.deepFluke : art.fluke;
      const pump = Math.sin(t * (1.05 + (w.state === 'breach' ? 2.4 : w.state === 'wind' ? 1.8 : 0)) * 2 + w.ph);
      const ca = Math.cos(w.a), sa = Math.sin(w.a);
      // the whale's own shadow, much darker and wider than anything else
      if (w.z > 0.5) {
        ctx.globalAlpha = 0.34;
        blitRot(ctx, art.deep, w.x - cam.x + 6, w.y - cam.y + 8, w.a, 1, 1);
        ctx.globalAlpha = 1;
      }
      // flukes hinge at the peduncle
      const fx0 = sx + ca * -102, fy0 = sy + sa * -102;
      blitRot(ctx, flukeS, fx0, fy0, w.a + pump * 0.3);
      blitRot(ctx, body, sx, sy, w.a);
      // waterline foam when it is up at the surface
      if (w.sub < 0.45) {
        ctx.fillStyle = 'rgba(238,250,255,' + (0.5 * (1 - w.sub / 0.45)).toFixed(2) + ')';
        for (let i = -5; i <= 5; i++) {
          const q = i / 5;
          const ox = ca * q * 96, oy = sa * q * 96;
          const beam = 26 * Math.sqrt(Math.max(0, 1 - q * q * 0.85));
          const nx = -sa, ny = ca;
          if (((t * 7 + i * 2) | 0) % 3 !== 0) continue;
          ctx.fillRect(Math.round(sx + ox + nx * beam), Math.round(sy + oy + ny * beam), 2, 1);
          ctx.fillRect(Math.round(sx + ox - nx * beam), Math.round(sy + oy - ny * beam), 2, 1);
        }
      }
    }

    // ====================================================================
    //  DOLPHIN POD — chirps, leads, waits, loops back, points at the goal
    // ====================================================================
    function makePod(x, y, goal) {
      const pod = {
        d: [], state: 'appear', t: 0, goal: goal, chirp: 0, life: 0,
        lead: { x: x, y: y }, markT: 0, jumpT: 1.2, arrow: 0,
      };
      const n = randi(3, 5);
      for (let i = 0; i < n; i++) {
        pod.d.push({
          x: x + rand(-30, 30), y: y + rand(-24, 24), a: rand(0, TAU), sp: 60,
          z: 0, vz: 0, ph: rand(0, TAU), off: { x: rand(-22, 22), y: rand(-18, 18) },
          jumpCd: rand(1, 5), lead: i === 0,
        });
      }
      return pod;
    }
    function updPod(pod, dt, t) {
      pod.t += dt; pod.life += dt;
      const p = P();
      const goal = pod.goal;
      const gx = goal ? goal.x : pod.lead.x, gy = goal ? goal.y : pod.lead.y;
      pod.chirp -= dt;
      if (pod.chirp <= 0) {
        pod.chirp = rand(2.2, 4.5);
        const A = AU();
        if (A && A.tone) { A.tone(1500, 0.06, 'sine', 0.09, 900); setTimeout(() => { try { A.tone(2100, 0.05, 'sine', 0.07, -700); } catch (e) { } }, 70); }
        const T = TN();
        if (T && pod.d.length) T.emote(pod.d[0].x, pod.d[0].y - 16, '!');
      }

      switch (pod.state) {
        case 'appear': {
          if (p) { pod.lead.x = lerp(pod.lead.x, p.x, Math.min(1, dt * 1.6)); pod.lead.y = lerp(pod.lead.y, p.y, Math.min(1, dt * 1.6)); }
          if (pod.t > 2.4) {
            pod.state = 'lead'; pod.t = 0;
            floatText(pod.lead.x, pod.lead.y - 26, 'FOLLOW US!', '#8ff0ff', 8);
          }
          break;
        }
        case 'lead': {
          if (!goal || goal.state === 'open' || goal.state === 'spent') { pod.state = 'leave'; pod.t = 0; break; }
          const toGoal = dist(pod.lead.x, pod.lead.y, gx, gy);
          const behind = p ? dist(p.x, p.y, pod.lead.x, pod.lead.y) : 0;
          if (p && behind > 220) { pod.state = 'back'; pod.t = 0; break; }
          if (p && behind > 120) { pod.state = 'wait'; pod.t = 0; break; }
          if (toGoal < 26) { pod.state = 'arrive'; pod.t = 0; if (goal) goal.revealed = true; break; }
          const ang = angleTo(pod.lead.x, pod.lead.y, gx, gy);
          const weave = Math.sin(pod.life * 1.1) * 0.35;
          const spd = 66;
          pod.lead.x += Math.cos(ang + weave) * spd * dt;
          pod.lead.y += Math.sin(ang + weave) * spd * dt;
          // bubble breadcrumbs
          pod.markT -= dt;
          if (pod.markT <= 0) {
            pod.markT = 0.2;
            S.marks.push({ x: pod.lead.x + rand(-4, 4), y: pod.lead.y + rand(-4, 4), life: 6, max0: 6, r: rand(1.4, 3.2), ph: rand(0, TAU) });
            if (S.marks.length > 260) S.marks.shift();
          }
          break;
        }
        case 'wait': {
          const behind = p ? dist(p.x, p.y, pod.lead.x, pod.lead.y) : 0;
          if (p && behind > 240) { pod.state = 'back'; pod.t = 0; break; }
          if (p && behind < 86) { pod.state = 'lead'; pod.t = 0; break; }
          pod.arrow += dt;
          // one of them leaps and points its body at the treasure
          pod.jumpT -= dt;
          if (pod.jumpT <= 0) {
            pod.jumpT = 1.7;
            const d0 = pod.d[0];
            if (d0 && d0.z <= 0) { d0.z = 0.01; d0.vz = 78; d0.point = angleTo(d0.x, d0.y, gx, gy); }
          }
          break;
        }
        case 'back': {
          if (!p) { pod.state = 'leave'; pod.t = 0; break; }
          const ang = angleTo(pod.lead.x, pod.lead.y, p.x, p.y);
          pod.lead.x += Math.cos(ang) * 110 * dt;
          pod.lead.y += Math.sin(ang) * 110 * dt;
          if (dist(pod.lead.x, pod.lead.y, p.x, p.y) < 50) { pod.state = 'lead'; pod.t = 0; }
          break;
        }
        case 'arrive': {
          pod.lead.x = lerp(pod.lead.x, gx, Math.min(1, dt * 2));
          pod.lead.y = lerp(pod.lead.y, gy, Math.min(1, dt * 2));
          if (goal) goal.revealed = true;
          if (pod.t > 1 && !pod.hurrah) {
            pod.hurrah = true;
            floatText(gx, gy - 30, 'HERE!', '#8ff0ff', 9);
            const T = TN(); if (T) T.burst(gx, gy, 1.6, '#8ff0ff');
            for (const d of pod.d) { d.z = 0.01; d.vz = rand(60, 95); d.point = angleTo(d.x, d.y, gx, gy); }
          }
          if (pod.t > 11 || (goal && (goal.state === 'open' || goal.state === 'spent'))) { pod.state = 'leave'; pod.t = 0; }
          break;
        }
        case 'leave': {
          const ang = Math.atan2(pod.lead.y - (H * 0.5), pod.lead.x - (W * 0.5));
          pod.lead.x += Math.cos(ang) * 150 * dt;
          pod.lead.y += Math.sin(ang) * 150 * dt;
          if (pod.t > 9) pod.gone = true;
          break;
        }
      }

      // ---- individual dolphins chase the lead point in formation -----------
      for (let i = 0; i < pod.d.length; i++) {
        const d = pod.d[i];
        const spin = pod.state === 'wait' || pod.state === 'arrive';
        let tx, ty;
        if (spin) {
          const a = pod.life * 1.5 + i * (TAU / pod.d.length);
          tx = pod.lead.x + Math.cos(a) * 34; ty = pod.lead.y + Math.sin(a) * 26;
        } else {
          const ca = Math.cos(d.a), sa = Math.sin(d.a);
          tx = pod.lead.x + d.off.x * 0.6 - ca * 8 * (i ? 1 : 0);
          ty = pod.lead.y + d.off.y * 0.6 - sa * 8 * (i ? 1 : 0);
        }
        const want = angleTo(d.x, d.y, tx, ty);
        const far = dist(d.x, d.y, tx, ty);
        d.a = angleLerp(d.a, d.z > 0 && d.point !== undefined ? d.point : want, Math.min(1, dt * 5));
        d.a = ((d.a % TAU) + TAU) % TAU;
        const spd = clamp(far * 2.4, 20, 165);
        d.sp = lerp(d.sp, spd, Math.min(1, dt * 4));
        d.x += Math.cos(d.a) * d.sp * dt;
        d.y += Math.sin(d.a) * d.sp * dt;
        // leaps
        if (d.z > 0) {
          d.z += d.vz * dt; d.vz -= 220 * dt;
          if (d.z <= 0) {
            d.z = 0; d.vz = 0; d.point = undefined;
            const pp = PT(); if (pp) pp.splash(d.x, d.y, 1.1);
            disturb(d.x, d.y, 2.2, 0, 0);
          }
        } else {
          d.jumpCd -= dt;
          if (d.jumpCd <= 0 && (pod.state === 'lead' || pod.state === 'back')) {
            d.jumpCd = rand(2.5, 6);
            d.z = 0.01; d.vz = rand(55, 85);
            d.point = goal ? angleTo(d.x, d.y, gx, gy) : d.a;
            const pp = PT(); if (pp) pp.splash(d.x, d.y, 0.9);
          }
          if (Math.random() < dt * 3) disturb(d.x, d.y, 1.1, Math.cos(d.a) * d.sp, Math.sin(d.a) * d.sp);
        }
      }
    }
    function drawPod(ctx, cam, t, pod) {
      for (let i = 0; i < pod.d.length; i++) {
        const d = pod.d[i];
        const sx = d.x - cam.x, sy = d.y - cam.y - d.z;
        if (sx < -60 || sy < -60 || sx > VIEW_W + 60 || sy > VIEW_H + 60) continue;
        if (d.z > 0.5) ellipsePx(ctx, d.x - cam.x + 2, d.y - cam.y + 3, 15, 6, 'rgba(6,18,40,0.28)');
        else ellipsePx(ctx, sx + 2, sy + 4, 15, 6, 'rgba(6,18,40,0.20)');
        const pump = Math.sin(t * 6.4 + d.ph);
        const ca = Math.cos(d.a), sa = Math.sin(d.a);
        blitRot(ctx, sp.dolphin.fluke, sx + ca * -32, sy + sa * -32, d.a + pump * 0.38);
        blitRot(ctx, sp.dolphin.body, sx, sy, d.a);
        if (d.z > 4) { const spdw = ((t * 12) | 0) % 2; if (spdw) { ctx.fillStyle = 'rgba(240,252,255,0.6)'; ctx.fillRect(Math.round(sx - ca * 26), Math.round(sy - sa * 26), 2, 2); } }
      }
    }
    function drawMarks(ctx, cam, t) {
      for (let i = 0; i < S.marks.length; i++) {
        const m = S.marks[i];
        const sx = m.x - cam.x, sy = m.y - cam.y - (m.max0 - m.life) * 2.2;
        if (sx < -8 || sy < -8 || sx > VIEW_W + 8 || sy > VIEW_H + 8) continue;
        const a = clamp(m.life / m.max0, 0, 1);
        ctx.globalAlpha = a * 0.8;
        ringPx(ctx, sx, sy + Math.sin(t * 3 + m.ph) * 1.2, m.r, m.r * 0.85, '#bfeeff');
        ctx.globalAlpha = 1;
      }
    }
    function updMarks(dt) {
      for (let i = S.marks.length - 1; i >= 0; i--) {
        const m = S.marks[i]; m.life -= dt;
        if (m.life <= 0) S.marks.splice(i, 1);
      }
    }

    // ====================================================================
    //  TREASURE
    // ====================================================================
    const TKIND = ['clam', 'chest', 'hoard', 'wreck'];
    function rollLoot(tier) {
      const types = scrapTypes(), out = [];
      const pickT = () => types[randi(0, types.length - 1)];
      if (tier === 0) {
        out.push({ rare: 'pearl' });
        out.push({ type: pickT(), n: randi(3, 5) });
      } else if (tier === 1) {
        const a = pickT(), b = pickT();
        out.push({ type: a, n: randi(4, 7) });
        out.push({ type: b, n: randi(3, 6) });
        if (Math.random() < 0.7) out.push({ rare: pick(['doubloon', 'ruby', 'pearl']) });
      } else if (tier === 2) {
        for (let i = 0; i < 3; i++) out.push({ type: pickT(), n: randi(4, 8) });
        out.push({ rare: pick(['doubloon', 'ruby', 'pearl', 'amber']) });
        if (Math.random() < 0.5) out.push({ rare: pick(['ingot', 'core']) });
      } else {
        for (const ty of types) out.push({ type: ty, n: randi(4, 9) });
        out.push({ rare: pick(['ingot', 'core', 'amber']) });
        out.push({ rare: pick(['doubloon', 'ruby', 'pearl']) });
        if (Math.random() < 0.3) out.push({ rare: 'crown' });
      }
      // merge duplicate scrap types so the readout never repeats a line
      const merged = [], byType = {};
      for (const L of out) {
        if (L.rare) { merged.push(L); continue; }
        if (byType[L.type]) { byType[L.type].n += L.n; continue; }
        byType[L.type] = L; merged.push(L);
      }
      return merged;
    }
    function makeTreasure(x, y, tier) {
      tier = clamp(tier | 0, 0, 3);
      return {
        x: x, y: y, tier: tier, kind: TKIND[tier], state: 'idle', t: 0,
        dig: 0, digMax: tier === 2 ? 3 : 1, loot: rollLoot(tier), spill: null,
        revealed: tier !== 2, readout: null, readT: 0, ph: rand(0, TAU),
        r: tier === 3 ? 26 : tier === 2 ? 22 : 18, seed: randi(1, 99999),
        glow: 0, shake: 0,
      };
    }
    function openTreasure(tr) {
      if (tr.state !== 'idle') return false;
      const A = AU();
      if (tr.kind === 'hoard' && tr.dig < tr.digMax) {
        tr.dig++;
        tr.shake = 0.3;
        const p = PT();
        if (p) { p.debris(tr.x + rand(-8, 8), tr.y + rand(-6, 6), 7, ['#d2bf86', '#bfa972', '#a8925f']); p.smoke(tr.x, tr.y, 3, 'rgba(190,172,128,', 4); }
        const T = TN(); if (T) T.puff(tr.x, tr.y, 4, '#e4d49c');
        if (A) A.hit();
        floatText(tr.x, tr.y - 16, 'DIG ' + tr.dig + '/' + tr.digMax, '#e4d49c', 7);
        if (tr.dig < tr.digMax) return true;
      }
      tr.state = 'opening'; tr.t = 0; tr.revealed = true;
      tr.shake = 0.5;
      if (A) { A.hit(); if (A.buy) A.buy(); }
      const T = TN(); if (T) { T.impact(tr.x, tr.y, 1.4, '#ffe48f'); T.puff(tr.x, tr.y, 5, '#e6d7b0'); }
      return true;
    }
    function burstTreasure(tr) {
      tr.state = 'open'; tr.t = 0; tr.glow = 1;
      const g = _G;
      const A = AU(); if (A) { A.explosion(0.5); if (A.rampage) A.rampage(); }
      const T = TN();
      if (T) { T.burst(tr.x, tr.y, 3.2, '#ffe48f'); T.impact(tr.x, tr.y, 2.4, '#ffffff'); T.shock(tr.x, tr.y, 90, 0.55); }
      const p = PT();
      if (p) { p.sparks(tr.x, tr.y, 26); p.splash(tr.x, tr.y, 1.4); p.bubbles(tr.x, tr.y, 14); }
      disturb(tr.x, tr.y, 3.4, 0, 0); ripple(tr.x, tr.y, 70, 120, 0.7);
      shakeCam(5);
      // stagger the fountain so it reads as a spill, not a dump
      tr.spill = [];
      let delay = 0;
      const readout = [];
      for (const L of tr.loot) {
        if (L.rare) {
          tr.spill.push({ t: delay + 0.12, rare: L.rare });
          delay += 0.16;
          readout.push({ s: RARE[L.rare].name, c: RARE[L.rare].col });
        } else {
          for (let i = 0; i < L.n; i++) { tr.spill.push({ t: delay, type: L.type }); delay += 0.045; }
          readout.push({ s: L.n + ' x ' + L.type.toUpperCase(), c: scrapColor(L.type) });
        }
      }
      tr.readout = readout; tr.readT = 4.2;
    }
    function updTreasure(tr, dt, t) {
      tr.t += dt;
      if (tr.shake > 0) tr.shake -= dt;
      if (tr.glow > 0) tr.glow -= dt * 0.7;
      if (tr.readT > 0) tr.readT -= dt;
      if (tr.state === 'opening') {
        const dur = tr.kind === 'clam' ? 1.15 : 0.55;
        if (Math.random() < dt * 22) { const p = PT(); if (p) p.bubbles(tr.x + rand(-8, 8), tr.y + rand(-6, 6), 1); }
        if (tr.t >= dur) burstTreasure(tr);
      } else if (tr.state === 'open') {
        const g = _G;
        if (tr.spill && g && g.pickups) {
          for (let i = tr.spill.length - 1; i >= 0; i--) {
            const s = tr.spill[i];
            if (tr.t < s.t) continue;
            tr.spill.splice(i, 1);
            if (s.rare) {
              g.pickups.push(new RareDrop(tr.x + rand(-4, 4), tr.y + rand(-3, 3), s.rare));
            } else {
              const pk = makePickup(tr.x + rand(-3, 3), tr.y + rand(-3, 3), s.type);
              if (pk) {
                const a = rand(0, TAU), sp2 = rand(26, 74);
                pk.vx = Math.cos(a) * sp2; pk.vy = Math.sin(a) * sp2 * 0.7; pk.vz = rand(120, 215);
                g.pickups.push(pk);
              }
            }
            const p = PT(); if (p) p.sparks(tr.x, tr.y, 2);
          }
          if (!tr.spill.length) tr.spill = null;
        }
        if (!tr.spill && tr.readT <= 0) tr.state = 'spent';
      }
    }
    // the seabed part: chest bodies, coral X, clam
    function drawTreasureUnder(ctx, cam, t, tr) {
      const jit = tr.shake > 0 ? Math.round(rand(-1, 1)) : 0;
      const sx = Math.round(tr.x - cam.x) + jit, sy = Math.round(tr.y - cam.y);
      // contact shadow
      ellipsePx(ctx, sx + 2, sy + 5, tr.r * 0.6, tr.r * 0.32, 'rgba(6,18,40,0.32)');
      if (tr.kind === 'hoard') {
        // an X of coral scrawled on the sand, plus the dug pit
        const dug = tr.dig / tr.digMax;
        if (dug > 0) ellipsePx(ctx, sx, sy, 9 + dug * 5, 6 + dug * 4, '#6e5f3c');
        if (dug > 0.6) ellipsePx(ctx, sx, sy + 1, 6, 4, '#4a3f26');
        const arms = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
        for (let i = 0; i < 4; i++) {
          const a = arms[i];
          for (let s = 3; s < 15; s++) {
            const q = s / 15;
            const px0 = sx + a[0] * s, py0 = sy + a[1] * s * 0.72;
            ctx.fillStyle = (s & 1) ? '#e2574c' : '#ffa599';
            ctx.fillRect(px0, py0, 2, 2);
            if (s % 4 === 0) { ctx.fillStyle = '#ffd79a'; ctx.fillRect(px0 + a[0], py0, 1, 1); }
          }
        }
        if (tr.state === 'open' || tr.state === 'spent') {
          ellipsePx(ctx, sx, sy, 11, 7, '#3a3122');
          for (let i = 0; i < 7; i++) {
            const a = hash2(tr.seed, i) * TAU;
            ctx.fillStyle = '#c89152';
            ctx.fillRect(Math.round(sx + Math.cos(a) * 7), Math.round(sy + Math.sin(a) * 4.6), 2, 1);
          }
        }
        return;
      }
      if (tr.kind === 'clam') {
        const s2 = (tr.state === 'idle' || tr.state === 'opening') && tr.t < 0.5 ? sp.clam[0] : sp.clam[1];
        // a bed of weed around it
        ctx.fillStyle = '#2f7d4a';
        for (let i = 0; i < 10; i++) {
          const a = hash2(tr.seed, i) * TAU, d = 9 + hash2(i, tr.seed) * 5;
          ctx.fillRect(Math.round(sx + Math.cos(a) * d), Math.round(sy + Math.sin(a) * d * 0.6), 1, 3);
        }
        blit(ctx, s2, sx, sy);
        if (tr.state === 'idle') {
          // the pearl glimmers between the shells
          if (((t * 3 + tr.ph) | 0) % 3 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 1, sy, 2, 1); }
        }
        return;
      }
      if (tr.kind === 'wreck') {
        blit(ctx, sp.wreck, sx, sy);
        if (tr.state === 'open' || tr.state === 'spent') {
          ctx.fillStyle = '#ffeeb4';
          for (let i = 0; i < 9; i++) {
            const a = hash2(tr.seed, i) * TAU, d = hash2(i, 3) * 9;
            ctx.fillRect(Math.round(sx + Math.cos(a) * d), Math.round(sy + 2 + Math.sin(a) * d * 0.5), 1, 1);
          }
        }
        return;
      }
      // chest
      const fi = tr.state === 'idle' ? 0 : (tr.state === 'opening' ? 1 : 2);
      blit(ctx, sp.chest[fi], sx, sy);
      // barnacles and weed so it looks sunk, not placed
      ctx.fillStyle = '#4c7f3b';
      for (let i = 0; i < 6; i++) {
        const a = hash2(tr.seed, i + 20) * TAU;
        ctx.fillRect(Math.round(sx + Math.cos(a) * 9), Math.round(sy + 5 + Math.sin(a) * 2), 1, 2);
      }
    }
    // the mid-water part: light beam and the glitter fountain
    function drawTreasureOver(ctx, cam, t, tr) {
      const sx = Math.round(tr.x - cam.x), sy = Math.round(tr.y - cam.y);
      if (tr.state === 'open' && tr.glow > 0) {
        // a hard-edged shaft of light, stepped in three bands
        const a = clamp(tr.glow, 0, 1);
        const bands = [[0.26, 13, 40, '#fff3c4'], [0.17, 9, 54, '#ffe9a8'], [0.11, 5, 66, '#fffbe8']];
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = bands[i][0] * a;
          ctx.fillStyle = bands[i][3];
          const halfTop = bands[i][1], hgt = bands[i][2];
          for (let y = 0; y < hgt; y += 3) {
            const q = y / hgt;
            const hw = Math.max(1, Math.round(lerp(3, halfTop, q)));
            ctx.fillRect(sx - hw, sy - y, hw * 2, 2);
          }
        }
        ctx.globalAlpha = 1;
        // rising glints
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 12; i++) {
          const q = ((t * 0.7 + i * 0.13 + tr.ph) % 1);
          const a2 = hash2(tr.seed, i) * TAU;
          ctx.globalAlpha = (1 - q) * a;
          ctx.fillRect(Math.round(sx + Math.cos(a2) * (4 + q * 22)), Math.round(sy - q * 56), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      if (tr.revealed && tr.state === 'idle') {
        // a soft marker halo so a revealed site is findable
        const a = 0.35 + Math.sin(t * 3 + tr.ph) * 0.18;
        ctx.globalAlpha = a;
        ringPx(ctx, sx, sy, tr.r, tr.r * 0.6, '#ffe48f');
        ctx.globalAlpha = 1;
      }
    }

    // ====================================================================
    //  AREA EFFECTS
    // ====================================================================
    function splashHit(x, y, radius, damage) {
      const g = _G;
      const T = TN();
      if (T) { T.shock(x, y, radius * 1.9, 0.5); T.impact(x, y, radius / 48, '#eaf8ff'); }
      const p = PT();
      if (p) { p.splash(x, y, Math.min(3, radius / 40)); for (let i = 0; i < 6; i++) p.spray(x, y, i / 6 * TAU, 3, 190); }
      disturb(x, y, Math.min(8, radius / 14), 0, 0);
      ripple(x, y, radius * 1.7, 240, 0.8);
      for (let i = 0; i < 12; i++) foam(x + rand(-radius, radius) * 0.8, y + rand(-radius, radius) * 0.8, 0.45);
      if (!g) return;
      const hitList = [];
      if (g.enemies) for (let i = 0; i < g.enemies.length; i++) { const e = g.enemies[i]; if (e && !e.dead) hitList.push(e); }
      if (g.boss && !g.boss.dead) hitList.push(g.boss);
      for (let i = 0; i < hitList.length; i++) {
        const e = hitList[i];
        const d = dist(x, y, e.x, e.y);
        if (d > radius) continue;
        const k = 1 - d / radius;
        const ang = (d < 0.01) ? rand(0, TAU) : angleTo(x, y, e.x, e.y);
        const kick = (300 + 520 * k);
        if (typeof e.hit === 'function') e.hit(damage * (0.45 + k * 0.55), Math.cos(ang) * kick, Math.sin(ang) * kick, null);
        else { e.kx = (e.kx || 0) + Math.cos(ang) * kick; e.ky = (e.ky || 0) + Math.sin(ang) * kick; }
        if (T) T.impact(e.x, e.y, 1.1, '#eaf8ff');
      }
      if (hitList.length) { const A = AU(); if (A) A.splash(2); }
    }

    function scare(x, y, radius, power) {
      syncG();
      const pw = power === undefined ? 1 : power;
      const r2 = radius * radius;
      const bump = (o, mul, fleeAim) => {
        const dx = o.x - x, dy = o.y - y, d2 = dx * dx + dy * dy;
        if (d2 > r2) return 0;
        const d = Math.sqrt(d2) || 0.001;
        const k = (1 - d / radius) * pw * (mul || 1);
        o.fear = Math.min(2.2, (o.fear || 0) + k);
        if (fleeAim) o.a = Math.atan2(dy / d, dx / d);
        return k;
      };
      for (const sc of S.schools) { const k = bump(sc, 1.3); if (k > 0.3) { sc.a = Math.atan2(sc.y - y, sc.x - x); sc.split = Math.min(1, sc.split + k); } }
      for (const g of S.reefs) bump(g, 1.2);
      for (const r of S.rays) bump(r, 1, true);
      for (const tu of S.turtles) bump(tu, 1, true);
      for (const j of S.jellies) bump(j, 1.2, true);
      for (const q of S.squids) {
        const k = bump(q, 1.4, true);
        if (k > 0.25) {
          q.jet = 1;
          if (q.inkCd <= 0) {
            q.inkCd = 5;
            S.ink.push({ x: q.x, y: q.y, r: 3, max: rand(28, 46), life: 6, max0: 6, ph: rand(0, TAU) });
          }
        }
      }
      for (const c of S.crabs) { const k = bump(c, 1.2); if (k > 0.2) { c.state = 'run'; c.t = rand(0.6, 1.4); c.dir = c.x >= x ? 1 : -1; } }
      for (const s of S.sharks) {
        const dx = s.x - x, dy = s.y - y, d2 = dx * dx + dy * dy;
        if (d2 < r2 * 1.4) { s.curious = 0; s.a = Math.atan2(dy, dx); s.sp = Math.min(90, s.sp + 40 * pw); }
      }
      for (const w of S.whales) {
        if (API.riding === w || w.state === 'wind' || w.state === 'breach') continue;
        const dx = w.x - x, dy = w.y - y;
        if (dx * dx + dy * dy < r2 * 2) { w.state = 'deep'; w.stateT = Math.max(w.stateT, 6); }
      }
      for (const pod of S.pods) for (const d of pod.d) {
        const dx = d.x - x, dy = d.y - y;
        if (dx * dx + dy * dy < r2) { d.sp = Math.min(200, d.sp + 60 * pw); }
      }
    }

    // ====================================================================
    //  PROMPTS
    // ====================================================================
    let prompt = null;             // {kind, obj, x, y, label, key}
    function pickPrompt() {
      prompt = null;
      const p = P(); if (!p) return;
      if (API.riding) {
        const w = API.riding;
        const s = saddleOf(w);
        prompt = { kind: 'hold', obj: w, x: s.x, y: s.y - w.z - 30, label: 'HOLD ON', key: null };
        return;
      }
      if (fly.on) return;
      let best = null, bestD = 1e9;
      for (let i = 0; i < S.whales.length; i++) {
        const w = S.whales[i];
        if (!canRide(w)) continue;
        const s = saddleOf(w);
        const d = dist(p.x, p.y, s.x, s.y);
        if (d < 44 && d < bestD) { bestD = d; best = { kind: 'whale', obj: w, x: s.x, y: s.y - 26, label: 'RIDE THE WHALE', key: API.keyLabel }; }
      }
      for (let i = 0; i < S.treasures.length; i++) {
        const tr = S.treasures[i];
        if (tr.state !== 'idle') continue;
        const d = dist(p.x, p.y, tr.x, tr.y);
        if (d < tr.r + 14 && d < bestD) {
          bestD = d;
          const lab = tr.kind === 'hoard' ? ('DIG  ' + tr.dig + '/' + tr.digMax) : (tr.kind === 'clam' ? 'PRY OPEN' : 'OPEN');
          best = { kind: 'treasure', obj: tr, x: tr.x, y: tr.y - tr.r - 6, label: lab, key: API.keyLabel };
        }
      }
      prompt = best;
    }

    function txt(ctx, s, x, y, size, col, align, outline) {
      if (typeof drawText === 'function') { drawText(ctx, s, x, y, size, { color: col, align: align || 'left', outline: outline || '#0a0f18' }); return; }
      if (typeof pixelText === 'function') { pixelText(ctx, s, x, y, size, col, align || 'left'); return; }
      ctx.fillStyle = col; ctx.font = 'bold ' + size + 'px monospace'; ctx.textAlign = align || 'left'; ctx.fillText(s, x, y);
    }
    function measure(s, size) { if (typeof textWidth === 'function') return textWidth(s, size); return s.length * (size * 0.6); }

    function drawPlaque(ctx, cx, cy, key, label, col, pulse) {
      const size = 6;
      const kw = key ? 11 : 0;
      const tw = Math.ceil(measure(label, size));
      const pw = tw + kw + 10, ph = 13;
      const x = Math.round(cx - pw / 2), y = Math.round(cy - ph);
      pxr(ctx, '#080d14', x - 1, y - 1, pw + 2, ph + 2);
      pxr(ctx, '#16202c', x, y, pw, ph);
      pxr(ctx, col, x, y, pw, 1);
      pxr(ctx, '#0d1520', x, y + ph - 1, pw, 1);
      let tx0 = x + 4;
      if (key) {
        pxr(ctx, '#0a0f18', tx0 - 1, y + 1, 10, 11);
        pxr(ctx, col, tx0, y + 2, 8, 9);
        txt(ctx, key, tx0 + 4, y + 3, 6, '#10161f', 'center', null);
        tx0 += 12;
      }
      txt(ctx, label, tx0, y + 4, size, '#f2f8ff', 'left');
      // a bobbing chevron pointing at the thing
      const bob = Math.round(Math.sin(pulse * 6) * 1.5);
      pxr(ctx, col, Math.round(cx) - 2, y + ph + 2 + bob, 5, 1);
      pxr(ctx, col, Math.round(cx) - 1, y + ph + 3 + bob, 3, 1);
      pxr(ctx, col, Math.round(cx), y + ph + 4 + bob, 1, 1);
    }

    // ====================================================================
    //  SPAWNING / POPULATION
    // ====================================================================
    function spotIn(minD, maxD, ymin, ymax) {
      for (let i = 0; i < 40; i++) {
        const x = rng.range(90, W - 90);
        const y = rng.range(ymin, ymax);
        const d = depthAt(x, y);
        if (d >= minD && d <= maxD) return { x: x, y: y };
      }
      return { x: rng.range(120, W - 120), y: rng.range(ymin, ymax) };
    }
    function reefSpot() {
      const o = OC();
      if (o && o.reefs && o.reefs.length) {
        const r = o.reefs[rng.int(0, o.reefs.length - 1)];
        const a = rng.range(0, TAU), d = rng.range(0, r.r * 0.8);
        return { x: clamp(r.x + Math.cos(a) * d, 60, W - 60), y: clamp(r.y + Math.sin(a) * d, SH + 100, H - 60) };
      }
      return spotIn(0, 0.5, SH + 140, H - 120);
    }

    let podTimer = 30;
    function populate(worldW, worldH, shoreY) {
      syncG();
      API.init();
      API.reset();
      W = worldW || 3200; H = worldH || 2400; SH = shoreY === undefined ? 300 : shoreY;
      rng = new SeededRandom(9137 + ((Math.random() * 100000) | 0));

      for (let i = 0; i < 15; i++) {
        const s = spotIn(0.05, 0.85, SH + 180, H - 140);
        S.schools.push(makeSchool(s.x, s.y, SCHOOL_SPECIES[rng.int(0, 2)], rng.int(16, 34)));
      }
      for (let i = 0; i < 16; i++) { const s = reefSpot(); S.reefs.push(makeReefGroup(s.x, s.y)); }
      for (let i = 0; i < 9; i++) { const s = spotIn(0.15, 0.8, SH + 220, H - 120); S.rays.push(makeRay(s.x, s.y)); }
      for (let i = 0; i < 7; i++) { const s = spotIn(0.05, 0.7, SH + 160, H - 120); S.turtles.push(makeTurtle(s.x, s.y)); }
      for (let i = 0; i < 34; i++) { const s = spotIn(0.1, 1, SH + 140, H - 80); S.jellies.push(makeJelly(s.x, s.y)); }
      for (let i = 0; i < 8; i++) { const s = spotIn(0.2, 1, SH + 260, H - 120); S.squids.push(makeSquid(s.x, s.y)); }
      for (let i = 0; i < 38; i++) { const s = reefSpot(); S.crabs.push(makeCrab(s.x, s.y)); }
      for (let i = 0; i < 3; i++) { const s = spotIn(0.25, 1, SH + 400, H - 200); S.sharks.push(makeShark(s.x, s.y)); }

      const wsp = spotIn(0.55, 1, SH + 600, H - 300);
      S.whales.push(makeWhale(wsp.x, wsp.y));

      // treasure: a mix of tiers, biased deep for the good stuff
      const tiers = [0, 0, 1, 1, 1, 2, 2, 3];
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const s = tier >= 2 ? spotIn(0.3, 1, SH + 420, H - 160) : reefSpot();
        S.treasures.push(makeTreasure(s.x, s.y, tier));
      }
      podTimer = 26;
    }

    // ====================================================================
    //  UPDATE
    // ====================================================================
    let clockT = 0;
    function update(dt, t) {
      syncG();
      if (!inited) return;
      if (dt > 0.1) dt = 0.1;
      clockT = t === undefined ? clockT + dt : t;
      const tt = clockT;
      const g = _G;
      if (g && g.cam) { camX = g.cam.x + VIEW_W / 2; camY = g.cam.y + VIEW_H / 2; }
      else { const p = P(); if (p) { camX = p.x; camY = p.y; } }

      gatherThreats();

      for (let i = 0; i < S.schools.length; i++) updSchool(S.schools[i], dt, tt);
      for (let i = 0; i < S.reefs.length; i++) {
        const gr = S.reefs[i];
        if (Math.abs(gr.x - camX) > 420 || Math.abs(gr.y - camY) > 330) continue;
        updReefGroup(gr, dt, tt);
      }
      for (let i = 0; i < S.rays.length; i++) updRay(S.rays[i], dt, tt);
      for (let i = 0; i < S.turtles.length; i++) updTurtle(S.turtles[i], dt, tt);
      for (let i = 0; i < S.jellies.length; i++) {
        const j = S.jellies[i];
        if (Math.abs(j.x - camX) > 400 || Math.abs(j.y - camY) > 320) continue;
        updJelly(j, dt, tt);
      }
      for (let i = 0; i < S.squids.length; i++) updSquid(S.squids[i], dt, tt);
      for (let i = 0; i < S.crabs.length; i++) {
        const c = S.crabs[i];
        if (Math.abs(c.x - camX) > 380 || Math.abs(c.y - camY) > 300) continue;
        updCrab(c, dt, tt);
      }
      for (let i = 0; i < S.sharks.length; i++) updShark(S.sharks[i], dt, tt);
      for (let i = 0; i < S.whales.length; i++) updWhale(S.whales[i], dt, tt);
      updFly(dt);
      for (let i = 0; i < S.treasures.length; i++) updTreasure(S.treasures[i], dt, tt);
      for (let i = S.pods.length - 1; i >= 0; i--) {
        const pod = S.pods[i];
        updPod(pod, dt, tt);
        if (pod.gone) S.pods.splice(i, 1);
      }
      updInk(dt);
      updMarks(dt);
      updateMagnet(dt);
      if (combo.flash > 0) combo.flash -= dt;

      // a pod turns up now and then to show off a site the player hasn't opened
      podTimer -= dt;
      if (podTimer <= 0) {
        podTimer = 75;
        if (!S.pods.length) {
          const p = P();
          const cand = [];
          for (const tr of S.treasures) if (tr.state === 'idle' && p && dist(p.x, p.y, tr.x, tr.y) > 320) cand.push(tr);
          if (p && cand.length) {
            cand.sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
            const goal = cand[Math.min(cand.length - 1, randi(0, 2))];
            const a = angleTo(goal.x, goal.y, p.x, p.y);
            S.pods.push(makePod(p.x + Math.cos(a) * 70, p.y + Math.sin(a) * 70, goal));
          }
        }
      }
      pickPrompt();
    }

    // ====================================================================
    //  RENDER
    // ====================================================================
    function renderUnder(ctx, cam, t) {
      syncG();
      if (!inited || !cam) return;
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < S.treasures.length; i++) { const tr = S.treasures[i]; if (onScreen(tr.x, tr.y, cam, 60)) drawTreasureUnder(ctx, cam, t, tr); }
      for (let i = 0; i < S.crabs.length; i++) { const c = S.crabs[i]; if (onScreen(c.x, c.y, cam, 24)) drawCrab(ctx, cam, t, c); }
      for (let i = 0; i < S.rays.length; i++) { const r = S.rays[i]; if (onScreen(r.x, r.y, cam, 70)) drawRay(ctx, cam, t, r); }
      drawInk(ctx, cam, t);
      // big movers cast their shadow on the seabed
      for (let i = 0; i < S.whales.length; i++) {
        const w = S.whales[i];
        if (!onScreen(w.x, w.y, cam, 170)) continue;
        ctx.globalAlpha = 0.30 + w.sub * 0.16;
        blitRot(ctx, sp.whale.deep, w.x - cam.x + 7, w.y - cam.y + 10, w.a);
        ctx.globalAlpha = 1;
      }
      for (let i = 0; i < S.sharks.length; i++) { const s = S.sharks[i]; if (!onScreen(s.x, s.y, cam, 60)) continue; ellipsePx(ctx, s.x - cam.x + 4, s.y - cam.y + 7, 24, 9, 'rgba(6,18,40,0.20)'); }
    }

    function renderOver(ctx, cam, t) {
      syncG();
      if (!inited || !cam) return;
      ctx.imageSmoothingEnabled = false;
      drawMarks(ctx, cam, t);
      renderTrails(ctx, cam);
      for (let i = 0; i < S.schools.length; i++) {
        const sc = S.schools[i];
        if (!onScreen(sc.x, sc.y, cam, sc.r * 2 + CULL)) continue;
        drawSchool(ctx, cam, t, sc);
      }
      for (let i = 0; i < S.reefs.length; i++) { const gr = S.reefs[i]; if (onScreen(gr.x, gr.y, cam, gr.r + 40)) drawReefGroup(ctx, cam, t, gr); }
      for (let i = 0; i < S.turtles.length; i++) { const tu = S.turtles[i]; if (onScreen(tu.x, tu.y, cam, 46)) drawTurtle(ctx, cam, t, tu); }
      for (let i = 0; i < S.squids.length; i++) { const q = S.squids[i]; if (onScreen(q.x, q.y, cam, 50)) drawSquid(ctx, cam, t, q); }
      for (let i = 0; i < S.jellies.length; i++) { const j = S.jellies[i]; if (onScreen(j.x, j.y, cam, 40)) drawJelly(ctx, cam, t, j); }
      for (let i = 0; i < S.sharks.length; i++) { const s = S.sharks[i]; if (onScreen(s.x, s.y, cam, 60)) drawShark(ctx, cam, t, s); }
      for (let i = 0; i < S.pods.length; i++) drawPod(ctx, cam, t, S.pods[i]);
      for (let i = 0; i < S.whales.length; i++) { const w = S.whales[i]; if (onScreen(w.x, w.y, cam, 190)) drawWhale(ctx, cam, t, w); }
      for (let i = 0; i < S.treasures.length; i++) { const tr = S.treasures[i]; if (onScreen(tr.x, tr.y, cam, 80)) drawTreasureOver(ctx, cam, t, tr); }
      // the rider's shadow while airborne
      if (fly.on) {
        ellipsePx(ctx, fly.x - cam.x + 2, fly.y - cam.y + 4, 20 - fly.z * 0.12, 10 - fly.z * 0.06, 'rgba(6,18,40,0.34)');
      }
    }

    function renderHint(ctx, cam, t) {
      syncG();
      if (!inited || !cam) return;
      ctx.imageSmoothingEnabled = false;
      // ---- interaction prompt ------------------------------------------
      if (prompt) {
        const sx = prompt.x - cam.x, sy = prompt.y - cam.y;
        if (sx > -60 && sy > -40 && sx < VIEW_W + 60 && sy < VIEW_H + 40) {
          const col = prompt.kind === 'whale' ? '#8ff0ff' : prompt.kind === 'hold' ? '#ffe48f' : '#ffd464';
          drawPlaque(ctx, sx, sy + Math.round(Math.sin(t * 3) * 1.5), prompt.key, prompt.label, col, t);
        }
      }
      // ---- wind-up charge bar while riding ------------------------------
      if (API.riding) {
        const w = API.riding, s = saddleOf(w);
        const sx = Math.round(s.x - cam.x), sy = Math.round(s.y - cam.y - w.z - 44);
        const k = clamp(w.windT / WIND_DUR, 0, 1);
        const bw = 46;
        pxr(ctx, '#080d14', sx - bw / 2 - 1, sy - 1, bw + 2, 7);
        pxr(ctx, '#16202c', sx - bw / 2, sy, bw, 5);
        const fw = Math.round(bw * k);
        for (let i = 0; i < fw; i++) {
          const q = i / bw;
          pxr(ctx, q > 0.82 ? '#fff3c4' : q > 0.5 ? '#ffd27a' : '#8ff0ff', sx - bw / 2 + i, sy, 1, 5);
        }
        if (k > 0.85 && ((t * 12) | 0) % 2 === 0) txt(ctx, 'BREACH!', sx, sy - 10, 7, '#fff3c4', 'center');
      }
      // ---- treasure readout ----------------------------------------------
      for (let i = 0; i < S.treasures.length; i++) {
        const tr = S.treasures[i];
        if (!tr.readout || tr.readT <= 0) continue;
        const sx = Math.round(tr.x - cam.x), sy = Math.round(tr.y - cam.y) - 34;
        if (sx < -80 || sy < -60 || sx > VIEW_W + 80 || sy > VIEW_H + 60) continue;
        const rise = Math.min(1, (4.2 - tr.readT) * 3);
        const n = tr.readout.length;
        let wmax = 40;
        for (let q = 0; q < n; q++) wmax = Math.max(wmax, Math.ceil(measure(tr.readout[q].s, 6)) + 10);
        const ph = n * 8 + 12, y0 = sy - ph + Math.round((1 - rise) * 8);
        ctx.globalAlpha = Math.min(1, tr.readT * 1.6);
        pxr(ctx, '#080d14', sx - wmax / 2 - 1, y0 - 1, wmax + 2, ph + 2);
        pxr(ctx, '#131d29', sx - wmax / 2, y0, wmax, ph);
        pxr(ctx, '#ffd464', sx - wmax / 2, y0, wmax, 1);
        txt(ctx, 'SALVAGE', sx, y0 + 3, 6, '#ffd464', 'center');
        for (let q = 0; q < n; q++) {
          const shown = Math.floor((4.2 - tr.readT) * 9);
          if (q > shown) break;
          const row = tr.readout[q];
          pxr(ctx, row.c, sx - wmax / 2 + 3, y0 + 13 + q * 8, 3, 3);
          txt(ctx, row.s, sx - wmax / 2 + 8, y0 + 11 + q * 8, 6, '#eef6ff', 'left');
        }
        ctx.globalAlpha = 1;
      }
      // ---- sweep combo ----------------------------------------------------
      if (combo.n >= 2 && clockT - combo.t < 1.15) {
        const p = P();
        const bx = (p ? p.x : combo.x) - cam.x, by = (p ? p.y : combo.y) - cam.y - 30;
        const age = clockT - combo.t;
        const pop = combo.flash > 0 ? 1 + combo.flash * 2.4 : 1;
        const col = combo.n >= 8 ? '#ff9ecb' : combo.n >= 5 ? '#ffe48f' : '#8ff0ff';
        ctx.globalAlpha = clamp(1.6 - age, 0, 1);
        const s = 'x' + combo.n + ' SWEEP';
        const wd = Math.ceil(measure(s, 7)) + 8;
        pxr(ctx, '#080d14', Math.round(bx - wd / 2 - 1), Math.round(by - 1), wd + 2, 11);
        pxr(ctx, '#16202c', Math.round(bx - wd / 2), Math.round(by), wd, 9);
        pxr(ctx, col, Math.round(bx - wd / 2), Math.round(by), wd, 1);
        txt(ctx, s, Math.round(bx), Math.round(by + 2), 7, col, 'center');
        if (pop > 1) { ctx.globalAlpha *= 0.6; ringPx(ctx, bx, by + 4, 16 * pop, 8 * pop, col); }
        ctx.globalAlpha = 1;
      }
    }

    // ====================================================================
    //  PUBLIC API
    // ====================================================================
    const API = {
      keyLabel: 'E',
      riding: null,
      whales: S.whales,
      treasures: S.treasures,
      schools: S.schools,
      pods: S.pods,
      lists: S,

      init() {
        if (inited) return;
        buildSprites();
        inited = true;
      },
      reset() {
        for (const k in S) S[k].length = 0;
        API.riding = null;
        fly.on = false;
        track.clear();
        combo.n = 0; combo.t = -9; combo.flash = 0;
        prompt = null;
        podTimer = 30;
        if (!rng) rng = new SeededRandom(9137);
      },
      populate: populate,
      update: update,
      renderUnder: renderUnder,
      renderOver: renderOver,
      renderHint: renderHint,
      scare: scare,
      splashHit: splashHit,

      spawnWhale(x, y) {
        syncG();
        if (!inited) API.init();
        if (!rng) rng = new SeededRandom(9137);
        const w = makeWhale(x === undefined ? W * 0.5 : x, y === undefined ? H * 0.7 : y);
        w.state = 'surface'; w.stateT = 34; w.sub = 0.2;
        S.whales.push(w);
        const p = PT(); if (p) { p.splash(w.x, w.y, 3); }
        disturb(w.x, w.y, 6, 0, 0); ripple(w.x, w.y, 140, 140, 0.7);
        return w;
      },
      spawnDolphins(x, y, goal) {
        syncG();
        if (!inited) API.init();
        if (!rng) rng = new SeededRandom(9137);
        let g = goal;
        if (!g) {
          let bd = 1e9;
          for (const tr of S.treasures) {
            if (tr.state !== 'idle') continue;
            const d = dist(x, y, tr.x, tr.y);
            if (d < bd) { bd = d; g = tr; }
          }
        }
        if (!g) g = API.spawnTreasure(x + rand(-500, 500), y + rand(-500, 500), randi(1, 3));
        const pod = makePod(x, y, g);
        S.pods.push(pod);
        return pod;
      },
      spawnTreasure(x, y, tier) {
        syncG();
        if (!inited) API.init();
        const tr = makeTreasure(clamp(x, 40, W - 40), clamp(y, SH + 60, H - 40), tier === undefined ? 1 : tier);
        S.treasures.push(tr);
        return tr;
      },
      onPlayerAction() {
        syncG();
        if (API.riding) {
          const w = API.riding;
          if (w.state === 'wind' && w.windT < WIND_DUR - 0.3) { w.windT = WIND_DUR - 0.3; }
          return true;
        }
        if (!prompt) return false;
        if (prompt.kind === 'whale') { mountWhale(prompt.obj); prompt = null; return true; }
        if (prompt.kind === 'treasure') { const ok = openTreasure(prompt.obj); prompt = null; return ok; }
        return false;
      },
      // handy extras the caller may or may not use
      get flying() { return fly.on; },
      get prompt() { return prompt; },
      get combo() { return combo.n; },
      RareDrop: RareDrop,
      RARE: RARE,
    };
    return API;
  }
})();

