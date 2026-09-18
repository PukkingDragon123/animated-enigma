// ---- Ocean: waves, currents, blood & foam fields, wakes, ripples ---------
class Ocean {
  constructor(worldW, worldH, shoreY) {
    this.W = worldW; this.H = worldH; this.shoreY = shoreY;
    this.cell = 16;
    this.gw = Math.ceil(worldW / this.cell) + 1; this.gh = Math.ceil(worldH / this.cell) + 1;
    this.blood = new Float32Array(this.gw * this.gh);
    this.blood2 = new Float32Array(this.gw * this.gh);
    this.foam = new Float32Array(this.gw * this.gh);
    this.foam2 = new Float32Array(this.gw * this.gh);
    this.oil = new Float32Array(this.gw * this.gh);
    this.lw = 320; this.lh = 180;
    this.low = document.createElement('canvas'); this.low.width = this.lw; this.low.height = this.lh;
    this.lctx = this.low.getContext('2d');
    this.img = this.lctx.createImageData(this.lw, this.lh);
    this.ripples = [];
    this.wakes = [];   // {pts:[{x,y,t,w}], owner}
    this.streaks = [];
    this.fish = [];
    this.frame = 0;
    // colour palette (posterized water levels)
    this.pal = ['#113a6c', '#164a84', '#1b5898', '#2569ad', '#4a92cf', '#8ccbf0', '#e8f8ff'].map(hexToRgb);
    this.shallow = ['#1f7a95', '#268ea8', '#2f9fb8', '#3fb2c6', '#7ad3de', '#b4e9ee', '#ecfcff'].map(hexToRgb);
    this.sand = hexToRgb('#d9c27f'); this.sandDark = hexToRgb('#b99d5e'); this.grass = hexToRgb('#5f9a4a');
    this.bloodC = hexToRgb('#6e0a12'); this.bloodBright = hexToRgb('#c41c26'); this.foamC = hexToRgb('#eef9ff');
    this.oilC = hexToRgb('#1a1418');
    // currents: rotating eddies + a drift lane
    this.currents = [];
    const rng = new SeededRandom(1337);
    for (let i = 0; i < 7; i++) this.currents.push({
      x: rng.range(200, worldW - 200), y: rng.range(shoreY + 300, worldH - 200), r: rng.range(160, 320),
      s: rng.range(40, 90) * (rng.next() < 0.5 ? -1 : 1), type: 'eddy',
    });
    this.currents.push({ x: worldW / 2, y: worldH * 0.62, r: 9999, s: 18, type: 'drift', ang: rng.range(0, TAU) });
    for (let i = 0; i < 260; i++) this.streaks.push({ x: rng.range(0, worldW), y: rng.range(shoreY, worldH), life: rng.range(0, 3) });
    for (let i = 0; i < 40; i++) this.fish.push({ x: rng.range(0, worldW), y: rng.range(shoreY + 80, worldH), a: rng.range(0, TAU), s: rng.range(20, 45), ph: rng.range(0, TAU), size: rng.range(4, 9) });
  }
  idx(x, y) { const cx = clamp(Math.floor(x / this.cell), 0, this.gw - 1), cy = clamp(Math.floor(y / this.cell), 0, this.gh - 1); return cy * this.gw + cx; }
  addBlood(x, y, amt) { this.blood[this.idx(x, y)] += amt; }
  addFoam(x, y, amt) { this.foam[this.idx(x, y)] += amt; }
  addOil(x, y, amt) { this.oil[this.idx(x, y)] += amt; }
  splatBlood(x, y, amt, spread = 20) {
    for (let i = 0; i < 6; i++) this.addBlood(x + rand(-spread, spread), y + rand(-spread, spread), amt / 6);
  }
  ripple(x, y, maxR = 30, speed = 40, alpha = 0.7) { if (this.ripples.length < 400) this.ripples.push({ x, y, r: 2, maxR, speed, alpha }); }
  newWake(owner, width = 6) { const w = { pts: [], owner, width, dead: false }; this.wakes.push(w); return w; }
  // steady flow at a point (currents)
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
      // slight inward pull
      fx += -dx / d * c.s * 0.15 * k; fy += -dy / d * c.s * 0.15 * k;
    }
    return { x: fx, y: fy };
  }
  waveHeight(x, y, t) {
    // long, anisotropic swells rolling toward the shore, plus small chop
    return Math.sin(y * 0.075 + x * 0.02 + t * 1.3) * 0.45 + Math.sin(y * 0.031 - x * 0.012 - t * 0.6) * 0.3
      + Math.sin(x * 0.06 + y * 0.05 + t * 2.0) * 0.2 + Math.sin(x * 0.19 - y * 0.11 + t * 3) * 0.08 + Math.sin((x + y * 0.4) * 0.033 + t * 0.9) * 0.2;
  }
  waveLevel(w) { return w < -0.7 ? 0 : w < -0.35 ? 1 : w < 0.35 ? 2 : w < 0.68 ? 3 : w < 0.86 ? 4 : 5; }
  update(dt, t) {
    this.frame++;
    for (let i = this.currents.length - 1; i >= 0; i--) { const c = this.currents[i]; if (c.life !== undefined) { c.life -= dt; if (c.life <= 0) this.currents.splice(i, 1); } }
    // diffuse blood/foam/oil on alternating frames (cheap & smooth)
    if (this.frame % 2 === 0) this.diffuse(this.blood, this.blood2, 0.16, 0.9975);
    else { this.diffuse(this.foam, this.foam2, 0.22, 0.93); }
    if (this.frame % 3 === 0) this.diffuse(this.oil, this.blood2, 0.08, 0.996);
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
    for (const f of this.fish) {
      f.ph += dt * 6; f.a += Math.sin(f.ph * 0.3) * dt * 0.8;
      const fl = this.flow(f.x, f.y);
      f.x += (Math.cos(f.a) * f.s + fl.x * 0.5) * dt; f.y += (Math.sin(f.a) * f.s + fl.y * 0.5) * dt;
      if (f.x < 0 || f.x > this.W) f.a = Math.PI - f.a;
      if (f.y < this.shoreY + 60 || f.y > this.H) f.a = -f.a;
    }
  }
  diffuse(src, dst, k, decay) {
    const gw = this.gw, gh = this.gh;
    for (let y = 0; y < gh; y++) {
      const y0 = y * gw, ym = y > 0 ? y0 - gw : y0, yp = y < gh - 1 ? y0 + gw : y0;
      for (let x = 0; x < gw; x++) {
        const c = src[y0 + x];
        if (c < 0.001) { dst[y0 + x] = 0; continue; }
        const xm = x > 0 ? x - 1 : x, xp = x < gw - 1 ? x + 1 : x;
        const avg = (src[ym + x] + src[yp + x] + src[y0 + xm] + src[y0 + xp]) * 0.25;
        dst[y0 + x] = (c + (avg - c) * k) * decay;
      }
      // spread into empty neighbours
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
  }
  sample(field, wx, wy) {
    // bilinear sample of a grid field at world coords
    const fx = wx / this.cell - 0.5, fy = wy / this.cell - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 >= this.gw - 1 || y0 >= this.gh - 1) return 0;
    const tx = fx - x0, ty = fy - y0, i = y0 * this.gw + x0;
    const a = field[i], b = field[i + 1], c = field[i + this.gw], d = field[i + this.gw + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  // ---------- render background into ctx (640x360) --------------------
  render(ctx, cam, t) {
    const d = this.img.data, lw = this.lw, lh = this.lh;
    const camX = cam.x, camY = cam.y, shore = this.shoreY;
    const pal = this.pal, shl = this.shallow, blood = this.blood, foam = this.foam, oil = this.oil;
    const cell = this.cell, gw = this.gw, gh = this.gh;
    const sparkleT = Math.floor(t * 5);
    let p = 0;
    for (let py = 0; py < lh; py++) {
      const wy = camY + py * 2;
      for (let px = 0; px < lw; px++, p += 4) {
        const wx = camX + px * 2;
        let r, g, b;
        if (wy < shore - 10) {
          // beach & land
          const n = vnoise(wx * 0.05, wy * 0.05);
          const isGrass = wy < shore - 120 + n * 60;
          if (isGrass) { const v = 0.9 + hash2(wx >> 2, wy >> 2) * 0.2; r = this.grass[0] * v; g = this.grass[1] * v; b = this.grass[2] * v; }
          else { const c = hash2(wx >> 1, wy >> 1) > 0.85 ? this.sandDark : this.sand; r = c[0]; g = c[1]; b = c[2]; }
          d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255; continue;
        }
        const wave = this.waveHeight(wx, wy, t);
        let lvl = this.waveLevel(wave);
        // sparkle crests
        if (lvl >= 4 && hash2(wx >> 2, (wy >> 2) + sparkleT * 7) > 0.993) lvl = 6;
        // shallows near shore
        const depth = (wy - shore) / 220;
        let col;
        if (depth < 1) {
          const dd = clamp(depth, 0, 1);
          const sh = shl[lvl], dp = pal[lvl];
          // shoreline foam band
          const band = Math.sin(wx * 0.05 + t * 2) * 6 + Math.sin(wx * 0.013 - t * 0.7) * 10;
          if (wy < shore + 4 + band && wy > shore - 10) { r = 235; g = 245; b = 250; }
          else { r = sh[0] + (dp[0] - sh[0]) * dd; g = sh[1] + (dp[1] - sh[1]) * dd; b = sh[2] + (dp[2] - sh[2]) * dd; }
        } else { col = pal[lvl]; r = col[0]; g = col[1]; b = col[2]; }
        // fields (bilinear)
        const fx = wx / cell - 0.5, fy = wy / cell - 0.5;
        const x0 = fx | 0, y0 = fy | 0;
        if (x0 >= 0 && y0 >= 0 && x0 < gw - 1 && y0 < gh - 1) {
          const tx = fx - x0, ty = fy - y0, i = y0 * gw + x0;
          const bl = (blood[i] * (1 - tx) + blood[i + 1] * tx) * (1 - ty) + (blood[i + gw] * (1 - tx) + blood[i + gw + 1] * tx) * ty;
          if (bl > 0.015) {
            // blood thins at the edge, darker/denser in the middle, with a wavy edge for mixing
            let a = bl * 1.6 * (1 + wave * 0.15); if (a > 1) a = 1;
            const bc = a > 0.7 ? this.bloodC : this.bloodBright;
            const m = Math.min(0.95, a * 1.1);
            r += (bc[0] - r) * m; g += (bc[1] - g) * m; b += (bc[2] - b) * m;
          }
          const ol = (oil[i] * (1 - tx) + oil[i + 1] * tx) * (1 - ty) + (oil[i + gw] * (1 - tx) + oil[i + gw + 1] * tx) * ty;
          if (ol > 0.03) {
            const m = Math.min(0.55, ol * 0.6);
            // oily sheen: rainbow-ish bands
            const sheen = Math.sin(wx * 0.2 + wy * 0.13 + t) * 0.5 + 0.5;
            r += (this.oilC[0] + sheen * 40 - r) * m; g += (this.oilC[1] + sheen * 20 - g) * m; b += (this.oilC[2] + sheen * 60 - b) * m;
          }
          const fm = (foam[i] * (1 - tx) + foam[i + 1] * tx) * (1 - ty) + (foam[i + gw] * (1 - tx) + foam[i + gw + 1] * tx) * ty;
          if (fm > 0.12) {
            // dithered foam for a bubbly look
            const dith = hash2(wx >> 1, (wy >> 1) + sparkleT) < (fm - 0.1) * 1.1;
            if (dith) { const m = Math.min(1, fm * 0.8 + 0.15); r += (this.foamC[0] - r) * m; g += (this.foamC[1] - g) * m; b += (this.foamC[2] - b) * m; }
          }
        }
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    this.lctx.putImageData(this.img, 0, 0);
    ctx.drawImage(this.low, 0, 0, 640, 360);
    // fish shadows (underwater life)
    ctx.fillStyle = 'rgba(8,20,50,0.35)';
    for (const f of this.fish) {
      const sx = f.x - camX, sy = f.y - camY; if (sx < -20 || sy < -20 || sx > 660 || sy > 380) continue;
      ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(f.a);
      ctx.fillRect(-f.size, -Math.round(f.size / 3), f.size * 2, Math.round(f.size / 1.5));
      ctx.fillRect(-f.size - 3, -Math.round(f.size / 2), 3, f.size);
      ctx.restore();
    }
    // current streaks
    ctx.strokeStyle = 'rgba(200,235,255,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of this.streaks) {
      const sx = s.x - camX, sy = s.y - camY; if (sx < 0 || sy < 0 || sx > 640 || sy > 360) continue;
      const l = Math.hypot(s.vx || 0, s.vy || 0); if (l < 8) continue;
      const k = Math.min(14, l * 0.2) / l;
      ctx.moveTo(Math.round(sx), Math.round(sy)); ctx.lineTo(Math.round(sx - s.vx * k), Math.round(sy - s.vy * k));
    }
    ctx.stroke();
  }
  renderWakes(ctx, cam, t) {
    for (const w of this.wakes) {
      const n = w.pts.length; if (n < 2) continue;
      for (let i = 1; i < n; i++) {
        const a = w.pts[i - 1], b = w.pts[i];
        const age = t - b.t, k = 1 - age / 2.2; if (k <= 0) continue;
        const spread = w.width * 0.5 + age * 22;
        const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l * spread, ny = dx / l * spread;
        ctx.strokeStyle = `rgba(230,246,255,${(0.55 * k * k).toFixed(3)})`;
        ctx.lineWidth = age < 0.4 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(a.x + nx - cam.x), Math.round(a.y + ny - cam.y)); ctx.lineTo(Math.round(b.x + nx - cam.x), Math.round(b.y + ny - cam.y));
        ctx.moveTo(Math.round(a.x - nx - cam.x), Math.round(a.y - ny - cam.y)); ctx.lineTo(Math.round(b.x - nx - cam.x), Math.round(b.y - ny - cam.y));
        ctx.stroke();
        if (age < 0.5) { // churn directly behind the stern
          ctx.fillStyle = `rgba(240,250,255,${(0.4 * k).toFixed(2)})`;
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
        ctx.beginPath(); ctx.moveTo(Math.round(sx - Math.cos(c.ang) * (14 - ph * 14)), Math.round(sy - Math.sin(c.ang) * (14 - ph * 14))); ctx.lineTo(Math.round(sx + Math.cos(c.ang) * ph * 14), Math.round(sy + Math.sin(c.ang) * ph * 14)); ctx.stroke();
      } else if (c.type === 'whirl') {
        const sx = c.x - cam.x, sy = c.y - cam.y; if (sx < -150 || sy < -150 || sx > 800 || sy > 500) continue;
        const k = Math.min(1, c.life / 0.8);
        ctx.strokeStyle = `rgba(220,245,255,${(0.6 * k).toFixed(2)})`; ctx.lineWidth = 1;
        for (let arm = 0; arm < 3; arm++) {
          ctx.beginPath();
          for (let i = 0; i <= 24; i++) { const rr = c.r * (i / 24), ang = arm * TAU / 3 + i * 0.45 - t * 5; const px = sx + Math.cos(ang) * rr, py = sy + Math.sin(ang) * rr * 0.8; if (i === 0) ctx.moveTo(Math.round(px), Math.round(py)); else ctx.lineTo(Math.round(px), Math.round(py)); }
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(8,20,60,${(0.5 * k).toFixed(2)})`; ctx.beginPath(); ctx.ellipse(Math.round(sx), Math.round(sy), 12, 9, 0, 0, TAU); ctx.fill();
        if (Math.random() < 0.6) this.addFoam(c.x + rand(-c.r, c.r) * 0.6, c.y + rand(-c.r, c.r) * 0.5, 0.15);
      }
    }
  }
  renderRipples(ctx, cam) {
    ctx.lineWidth = 1;
    for (const r of this.ripples) {
      const k = 1 - r.r / r.maxR;
      ctx.strokeStyle = `rgba(225,245,255,${(r.alpha * k).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(Math.round(r.x - cam.x), Math.round(r.y - cam.y), Math.round(r.r), Math.round(r.r * 0.7), 0, 0, TAU); ctx.stroke();
    }
  }
  // dark refracted silhouette under an entity
  shadow(ctx, cam, x, y, w, h, t, depth = 1) {
    const wob = Math.sin(t * 3 + x * 0.05) * 1.5;
    ctx.fillStyle = `rgba(6,18,48,${0.35 * depth})`;
    ctx.beginPath(); ctx.ellipse(Math.round(x - cam.x + 4 + wob), Math.round(y - cam.y + 6), Math.round(w * 0.55), Math.round(h * 0.55), 0, 0, TAU); ctx.fill();
  }
}
