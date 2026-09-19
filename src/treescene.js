// ===========================================================================
//  THE DEEP — the skill tree as an underwater scene.
//  The otter is sinking, drowning, out of air. Every upgrade is a bubble of
//  air. When you buy one he lunges out, grabs it, and gets a gasp of life.
// ===========================================================================
const TreeScene = {
  bubbles: [], motes: [], kelp: [], grabs: [], pops: [],
  t: 0, built: false, breath: 1, lastGrab: 0, shake: 0,

  build() {
    if (this.built) return; this.built = true;
    const rng = new SeededRandom(9001);
    for (let i = 0; i < 90; i++) this.bubbles.push({
      x: rng.range(0, 640), y: rng.range(0, 360), r: rng.int(1, 4),
      s: rng.range(10, 34), ph: rng.range(0, TAU), w: rng.range(4, 14),
    });
    for (let i = 0; i < 130; i++) this.motes.push({
      x: rng.range(0, 640), y: rng.range(0, 360), s: rng.range(2, 9),
      ph: rng.range(0, TAU), b: rng.range(0.15, 0.5),
    });
    for (let i = 0; i < 22; i++) this.kelp.push({
      x: rng.range(-20, 660), h: rng.range(40, 130), w: rng.int(2, 5),
      ph: rng.range(0, TAU), sp: rng.range(0.5, 1.2), shade: rng.range(0, 1),
    });
    this.buildBubbleSprites();
  },

  // pre-rendered node bubbles: cheap to blit, crisp pixels
  buildBubbleSprites() {
    const mk = (R, body, rim, hi, inner) => {
      const D = R * 2 + 1, c = document.createElement('canvas');
      c.width = D; c.height = D; const x = c.getContext('2d');
      for (let yy = 0; yy < D; yy++) for (let xx = 0; xx < D; xx++) {
        const dx = xx - R, dy = yy - R, d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        if (d > R - 1.25) { x.fillStyle = rim; x.fillRect(xx, yy, 1, 1); continue; }
        if (d > R - 2.6) { x.fillStyle = body; x.fillRect(xx, yy, 1, 1); continue; }
        x.fillStyle = inner; x.fillRect(xx, yy, 1, 1);
      }
      // specular highlight, upper-left, like a real bubble
      x.fillStyle = hi;
      x.fillRect(R - Math.round(R * 0.55), R - Math.round(R * 0.62), 2, 2);
      x.fillRect(R - Math.round(R * 0.30), R - Math.round(R * 0.74), 2, 1);
      x.fillRect(R - Math.round(R * 0.72), R - Math.round(R * 0.32), 1, 2);
      return { c, w: D, h: D, ax: R, ay: R };
    };
    const R = 13;
    this.sprLocked    = mk(R, '#1b2a3c', '#24384f', '#33506e', '#122033');
    this.sprAvailable = mk(R, '#2f6f96', '#7fd4ee', '#dffaff', '#1d4a68');
    this.sprAfford    = mk(R, '#37879f', '#9ff0d8', '#ffffff', '#1f5a5f');
    this.sprOwned     = mk(R, '#c9962c', '#ffe48f', '#ffffff', '#8a6314');
    this.sprHover     = mk(R + 2, '#4ea3c6', '#ffffff', '#ffffff', '#2a6a8c');
  },

  // ---- the drowning otter ------------------------------------------------
  drawDrowningOtter(ctx, t) {
    const cx = 322, cy = 214;
    const sway = Math.sin(t * 0.8) * 7, rise = Math.sin(t * 0.55) * 5;
    const panic = clamp(1 - this.breath, 0, 1);            // more frantic as air runs out
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.translate(Math.round(cx + sway), Math.round(cy + rise));
    ctx.scale(3.1, 3.1);
    ctx.rotate(Math.sin(t * 0.7) * 0.10 + 0.12);

    // flailing legs / tail
    ctx.save(); ctx.translate(-8, 5);
    ctx.rotate(2.3 + Math.sin(t * (3 + panic * 5)) * (0.35 + panic * 0.4));
    ctx.drawImage(CH.otterTail.c, -CH.otterTail.ax, -CH.otterTail.ay);
    ctx.restore();

    // torso
    ctx.drawImage(CH.otterTorso.c, -CH.otterTorso.ax, -CH.otterTorso.ay);

    // arms clawing at the water, out of phase so it looks like panic
    for (let i = 0; i < 2; i++) {
      const ph = t * (3.4 + panic * 4.5) + i * 2.1;
      ctx.save();
      ctx.translate(i ? 5 : -5, -2);
      ctx.rotate((i ? -1 : 1) * (1.1 + Math.sin(ph) * (0.6 + panic * 0.5)) + (i ? 0.4 : -0.4));
      ctx.drawImage(CH.otterArm.c, -CH.otterArm.ax, -CH.otterArm.ay);
      ctx.restore();
    }

    // head, screwed up in pain, lolling back
    ctx.save();
    ctx.translate(0, -9);
    ctx.rotate(Math.sin(t * 1.3) * 0.16 - 0.1);
    const head = otterHeadWithFace('drown', false, t, false);
    ctx.drawImage(head, -CH.otterHead.ax, -CH.otterHead.ay);
    ctx.restore();
    ctx.restore();

    // air escaping his mouth — the thing you are racing
    if (Math.random() < 0.35 + panic * 0.4) {
      this.pops.push({
        x: cx + sway + rand(4, 14), y: cy + rise - 28, r: rand(1, 3),
        vy: rand(-34, -16), vx: rand(-8, 8), life: rand(1.4, 2.6), max: 2.6, kind: 'breath',
      });
    }
  },

  // ---- a node has been bought: the otter lunges and grabs the bubble -----
  grab(node, x, y) {
    this.grabs.push({ x, y, t: 0, dur: 0.85, node });
    this.lastGrab = 0.9;
    this.breath = Math.min(1, this.breath + 0.34);
    this.shake = 6;
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU), sp = rand(30, 150);
      this.pops.push({ x, y, r: randi(1, 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.8), max: 0.8, kind: 'pop' });
    }
  },

  update(dt, t) {
    this.build();
    this.t += dt;
    this.breath = Math.max(0, this.breath - dt * 0.035);
    this.lastGrab -= dt; this.shake = Math.max(0, this.shake - dt * 22);
    for (const b of this.bubbles) {
      b.y -= b.s * dt; b.ph += dt;
      if (b.y < -6) { b.y = 366; b.x = rand(0, 640); }
    }
    for (const m of this.motes) { m.y -= m.s * dt * 0.25; m.ph += dt * 0.7; if (m.y < -4) { m.y = 364; m.x = rand(0, 640); } }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.life -= dt;
      if (p.life <= 0) { this.pops.splice(i, 1); continue; }
      p.x += (p.vx || 0) * dt; p.y += p.vy * dt;
      if (p.kind === 'pop') { p.vx *= 0.93; p.vy *= 0.93; p.vy -= 22 * dt; }
      else p.x += Math.sin(p.life * 5) * 9 * dt;
    }
    for (let i = this.grabs.length - 1; i >= 0; i--) {
      const g = this.grabs[i]; g.t += dt; if (g.t > g.dur) this.grabs.splice(i, 1);
    }
  },

  // ---- background --------------------------------------------------------
  renderBackdrop(ctx, t) {
    // depth gradient, posterized into bands so it stays pixel art
    const bands = ['#0a1c30', '#0c2238', '#0e2842', '#11304e', '#143859', '#174065', '#1a4872'];
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[bands.length - 1 - i];
      ctx.fillRect(0, Math.round(i * 360 / bands.length), 640, Math.ceil(360 / bands.length) + 1);
    }
    // god rays slanting down from the surface far above
    for (let i = 0; i < 7; i++) {
      const bx = ((i * 113 + Math.sin(t * 0.18 + i) * 26) % 760) - 60;
      const w = 16 + Math.sin(t * 0.3 + i * 2) * 7;
      ctx.fillStyle = `rgba(150,220,255,${(0.035 + Math.sin(t * 0.4 + i) * 0.018).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(bx, -10); ctx.lineTo(bx + w, -10);
      ctx.lineTo(bx + w * 3.2 + 40, 370); ctx.lineTo(bx + w * 2.2 + 10, 370);
      ctx.closePath(); ctx.fill();
    }
    // kelp silhouettes swaying on the seabed
    for (const k of this.kelp) {
      const segs = Math.round(k.h / 7);
      ctx.fillStyle = k.shade > 0.5 ? 'rgba(8,30,34,0.55)' : 'rgba(6,22,28,0.7)';
      for (let i = 0; i < segs; i++) {
        const f = i / segs;
        const off = Math.sin(t * k.sp + k.ph + f * 2.4) * (3 + f * 9);
        ctx.fillRect(Math.round(k.x + off), Math.round(360 - i * 7), k.w, 8);
      }
    }
    // drifting plankton
    for (const m of this.motes) {
      ctx.fillStyle = `rgba(190,230,255,${(m.b * (0.6 + Math.sin(m.ph) * 0.4)).toFixed(2)})`;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }
    // ambient bubbles rising
    for (const b of this.bubbles) {
      const x = Math.round(b.x + Math.sin(b.ph) * b.w), y = Math.round(b.y);
      ctx.strokeStyle = 'rgba(190,235,255,0.45)'; ctx.lineWidth = 1;
      if (b.r <= 1) ctx.fillStyle = 'rgba(190,235,255,0.5)', ctx.fillRect(x, y, 1, 1);
      else { ctx.beginPath(); ctx.arc(x, y, b.r, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x - Math.round(b.r * 0.4), y - Math.round(b.r * 0.5), 1, 1); }
    }
  },

  // ---- foreground effects over the node layer ---------------------------
  renderFx(ctx, t) {
    // the grab: a paw shoots from the otter to the bubble, then it bursts
    for (const g of this.grabs) {
      const k = g.t / g.dur;
      const ox = 320, oy = 186;
      const reach = k < 0.42 ? k / 0.42 : 1;
      const back = k > 0.55 ? (k - 0.55) / 0.45 : 0;
      const hx = lerp(ox, g.x, reach * (1 - back));
      const hy = lerp(oy, g.y, reach * (1 - back));
      ctx.strokeStyle = `rgba(200,112,60,${(1 - back).toFixed(2)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(Math.round(hx), Math.round(hy)); ctx.stroke();
      ctx.strokeStyle = `rgba(240,184,126,${(1 - back).toFixed(2)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox, oy - 1); ctx.lineTo(Math.round(hx), Math.round(hy) - 1); ctx.stroke();
      // the paw
      ctx.save(); ctx.translate(Math.round(hx), Math.round(hy));
      ctx.rotate(angleTo(ox, oy, g.x, g.y));
      const grip = k > 0.42 ? 1 : 0;
      ctx.fillStyle = '#c8703c'; ctx.fillRect(-3, -4, 7, 8);
      ctx.fillStyle = '#1a1220'; ctx.fillRect(-3, -4, 7, 1); ctx.fillRect(-3, 3, 7, 1);
      ctx.fillStyle = grip ? '#f0b87e' : '#e0975c';
      ctx.fillRect(3, -4 + grip, 3, 3); ctx.fillRect(3, 1 - grip, 3, 3);
      ctx.restore();
      // burst at the moment of contact
      if (k > 0.40 && k < 0.62) {
        const bk = (k - 0.40) / 0.22;
        ctx.strokeStyle = `rgba(255,255,255,${(1 - bk).toFixed(2)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.x, g.y, 8 + bk * 34, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(255,228,143,${(1 - bk).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(g.x, g.y, 4 + bk * 20, 0, TAU); ctx.stroke();
      }
    }
    // popped-air and breath particles
    for (const p of this.pops) {
      const a = Math.min(1, p.life / p.max * 1.6);
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.r <= 1) { ctx.fillStyle = `rgba(220,245,255,${a.toFixed(2)})`; ctx.fillRect(x, y, 1, 1); }
      else { ctx.strokeStyle = `rgba(220,245,255,${a.toFixed(2)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, p.r, 0, TAU); ctx.stroke(); }
    }
    // he gasps when you feed him air
    if (this.lastGrab > 0) {
      const a = Math.min(1, this.lastGrab * 1.4);
      ctx.fillStyle = `rgba(160,240,255,${(a * 0.13).toFixed(2)})`;
      ctx.fillRect(0, 0, 640, 360);
    }
  },

  // how much air he has left — pure flavour, drives the panic animation
  renderBreath(ctx) {
    const w = 120, x = 320 - w / 2, y = 344;
    ctx.fillStyle = 'rgba(4,12,24,0.75)'; ctx.fillRect(x - 2, y - 2, w + 4, 8);
    ctx.fillStyle = '#0d2a3e'; ctx.fillRect(x, y, w, 4);
    const k = clamp(this.breath, 0, 1);
    ctx.fillStyle = k > 0.5 ? '#7fd4ee' : k > 0.25 ? '#ffe48f' : '#ff6161';
    ctx.fillRect(x, y, Math.round(w * k), 4);
    pixelText(ctx, 'AIR', x - 6, y - 1, 6, '#9fd8ee', 'right');
  },
};
