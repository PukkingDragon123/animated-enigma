// ---- Particles, explosions, floating text ------------------------------
class Particles {
  constructor(ocean) { this.ocean = ocean; this.list = []; this.explosions = []; this.texts = []; this.max = 2600; }
  add(p) { if (this.list.length < this.max) this.list.push(p); }
  // water splash: droplets go up (z) and fall back, leaving foam
  splash(x, y, size = 1, color = null) {
    if (this.ocean.disturb) this.ocean.disturb(x, y, size * 1.6, 0, 0);
    const n = Math.round(8 * size + 4);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(20, 90) * size;
      this.add({ type: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, z: 0, vz: rand(60, 160) * Math.sqrt(size), life: 2, maxLife: 2, size: rand(1, 2.5) * Math.sqrt(size) | 0 || 1, color: color || (Math.random() < 0.3 ? '#8fd4ff' : '#eaf8ff') });
    }
    this.ocean.addFoam(x, y, 0.5 * size);
    for (let i = 0; i < 4 * size; i++) this.ocean.addFoam(x + rand(-12, 12) * size, y + rand(-12, 12) * size, 0.25);
    this.ocean.ripple(x, y, 20 + 18 * size, 40 + 20 * size);
    if (size > 1.5) this.ocean.ripple(x, y, 30 * size, 60, 0.4);
  }
  spray(x, y, ang, amount = 4, speed = 100) {
    for (let i = 0; i < amount; i++) {
      const a = ang + rand(-0.5, 0.5), sp = rand(0.4, 1) * speed;
      this.add({ type: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0, vz: rand(30, 90), life: 1.2, maxLife: 1.2, size: 1, color: '#eaf8ff' });
    }
  }
  blood(x, y, amount = 1, ang = null) {
    const n = Math.round(6 * amount);
    for (let i = 0; i < n; i++) {
      const a = ang === null ? rand(0, TAU) : ang + rand(-0.7, 0.7), sp = rand(30, 120) * Math.sqrt(amount);
      this.add({ type: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0, vz: rand(40, 130), life: 2, maxLife: 2, size: rand(1, 2) | 0 || 1, color: Math.random() < 0.5 ? '#c8302e' : '#7c1414', amt: 0.35 * amount / n });
    }
    this.ocean.splatBlood(x, y, amount * 2.4, 16);
  }
  debris(x, y, n = 8, colors = ['#b57d3f', '#8f5c2c', '#5c3a1c']) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(40, 170);
      this.add({ type: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0, vz: rand(80, 220), life: rand(2, 4), maxLife: 4, w: randi(2, 6), h: randi(1, 3), rot: rand(0, TAU), vr: rand(-8, 8), color: pick(colors) });
    }
  }
  smoke(x, y, n = 3, color = 'rgba(40,40,48,', size = 4) {
    for (let i = 0; i < n; i++) this.add({ type: 'smoke', x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-12, 12), vy: rand(-30, -10), life: rand(0.8, 1.6), maxLife: 1.6, size: rand(size * 0.6, size * 1.4), color });
  }
  fire(x, y, n = 4) {
    for (let i = 0; i < n; i++) this.add({ type: 'fire', x: x + rand(-5, 5), y: y + rand(-5, 5), vx: rand(-15, 15), vy: rand(-40, -15), life: rand(0.3, 0.7), maxLife: 0.7, size: rand(2, 5) });
  }
  sparks(x, y, n = 6, ang = null, spread = TAU) {
    for (let i = 0; i < n; i++) {
      const a = ang === null ? rand(0, TAU) : ang + rand(-spread / 2, spread / 2), sp = rand(80, 260);
      this.add({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.15, 0.4), maxLife: 0.4, color: pick(['#ffe48f', '#ffd27a', '#ffffff', '#ff9a3c']) });
    }
  }
  shell(x, y, ang) {
    this.add({ type: 'shell', x, y, vx: Math.cos(ang + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1)) * rand(20, 50), vy: rand(-10, 10), z: 0, vz: rand(40, 80), life: 1.2, maxLife: 1.2, rot: rand(0, TAU), vr: rand(-15, 15) });
  }
  bubbles(x, y, n = 3) {
    for (let i = 0; i < n; i++) this.add({ type: 'bubble', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-5, 5), vy: rand(-20, -8), life: rand(0.5, 1.2), maxLife: 1.2, size: randi(1, 2) });
  }
  explode(x, y, r = 30, opts = {}) {
    if (this.ocean.disturb) this.ocean.disturb(x, y, r / 8, 0, 0);
    this.explosions.push({ x, y, r: 2, maxR: r, life: 0, dur: 0.35 + r / 120, big: r > 40, water: opts.water !== false });
    this.fire(x, y, Math.round(r / 4));
    this.smoke(x, y, Math.round(r / 6), 'rgba(35,32,40,', r / 6);
    this.sparks(x, y, Math.round(r / 3));
    if (opts.debris) this.debris(x, y, opts.debris, opts.debrisColors);
    if (opts.water !== false) this.splash(x, y, Math.min(3, r / 25));
    if (opts.oil) this.ocean.addOil(x, y, opts.oil * 0.5);
    for (let i = 0; i < 5; i++) this.ocean.addFoam(x + rand(-r, r) * 0.5, y + rand(-r, r) * 0.5, 0.4);
    Audio_.explosion(Math.min(2, r / 30));
  }
  text(x, y, str, color = '#fff', size = 8) {
    if (this.texts.length < 60) this.texts.push({ x, y, str, color, size, life: 0.9, vy: -22 });
  }
  update(dt, flowFn) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); continue; }
      switch (p.type) {
        case 'drop': case 'blood': case 'debris': case 'shell':
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.z !== undefined) {
            p.z += p.vz * dt; p.vz -= 380 * dt;
            if (p.z <= 0 && p.vz < 0) {
              p.z = 0;
              if (p.type === 'drop') { this.ocean.addFoam(p.x, p.y, 0.08); p.life = 0; if (Math.random() < 0.25) this.ocean.ripple(p.x, p.y, 8, 30, 0.4); }
              else if (p.type === 'blood') { this.ocean.addBlood(p.x, p.y, p.amt); p.life = 0; }
              else if (p.type === 'debris') { p.vz = 0; p.vx *= 0.3; p.vy *= 0.3; p.vr *= 0.2; p.floating = true; if (!p.splashed) { p.splashed = true; this.ocean.addFoam(p.x, p.y, 0.2); } }
              else if (p.type === 'shell') { p.life = Math.min(p.life, 0.3); p.vx = 0; p.vy = 0; }
            }
          }
          if (p.floating && flowFn) { const f = flowFn(p.x, p.y); p.x += f.x * dt; p.y += f.y * dt; p.rot += p.vr * dt; }
          else if (p.rot !== undefined) p.rot += p.vr * dt;
          break;
        case 'smoke': p.x += p.vx * dt; p.y += p.vy * dt; p.size += 6 * dt; p.vx *= 0.98; break;
        case 'fire': p.x += p.vx * dt; p.y += p.vy * dt; p.size *= 0.97; break;
        case 'spark': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; break;
        case 'bubble': p.x += p.vx * dt; p.y += p.vy * dt; break;
      }
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i]; e.life += dt;
      e.r = e.maxR * Math.min(1, Math.pow(e.life / e.dur, 0.45));
      if (e.life > e.dur) this.explosions.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; t.y += t.vy * dt; if (t.life <= 0) this.texts.splice(i, 1); }
  }
  // draw particles that sit under sprites (floating debris, foam bits)
  renderUnder(ctx, cam) {
    for (const p of this.list) {
      if (p.type !== 'debris' || !p.floating) continue;
      const sx = p.x - cam.x, sy = p.y - cam.y; if (sx < -10 || sy < -10 || sx > 650 || sy > 370) continue;
      ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2 | 0, -p.h / 2 | 0, p.w, p.h); ctx.restore();
    }
  }
  render(ctx, cam) {
    ctx.globalAlpha = 1;
    for (const p of this.list) {
      const sx = p.x - cam.x, sy = p.y - cam.y; if (sx < -20 || sy < -20 || sx > 660 || sy > 380) continue;
      switch (p.type) {
        case 'drop': ctx.fillStyle = p.color; ctx.fillRect(Math.round(sx), Math.round(sy - p.z), p.size, p.size); break;
        case 'blood': ctx.fillStyle = p.color; ctx.fillRect(Math.round(sx), Math.round(sy - p.z), p.size, p.size); break;
        case 'debris': if (p.floating) break;
          ctx.save(); ctx.translate(Math.round(sx), Math.round(sy - p.z)); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2 | 0, -p.h / 2 | 0, p.w, p.h); ctx.restore(); break;
        case 'shell': ctx.save(); ctx.translate(Math.round(sx), Math.round(sy - p.z)); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life * 3); ctx.drawImage(SP.shell.c, -1, -1); ctx.restore(); ctx.globalAlpha = 1; break;
        case 'smoke': { const k = p.life / p.maxLife; ctx.fillStyle = p.color + (0.55 * k).toFixed(2) + ')'; const s = Math.round(p.size); ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s); break; }
        case 'fire': { const k = p.life / p.maxLife; ctx.fillStyle = k > 0.6 ? '#ffe48f' : k > 0.3 ? '#ff9a3c' : '#c8302e'; const s = Math.max(1, Math.round(p.size)); ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s); break; }
        case 'spark': ctx.fillStyle = p.color; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1); if (p.life > 0.2) ctx.fillRect(Math.round(sx - p.vx * 0.01), Math.round(sy - p.vy * 0.01), 1, 1); break;
        case 'bubble': ctx.strokeStyle = 'rgba(220,245,255,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(sx), Math.round(sy), p.size, p.size); break;
      }
    }
    // explosions: chunky posterized rings
    for (const e of this.explosions) {
      const sx = Math.round(e.x - cam.x), sy = Math.round(e.y - cam.y), k = e.life / e.dur;
      const r = Math.round(e.r);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fillStyle = k < 0.3 ? '#fff6d5' : k < 0.55 ? '#ffd27a' : k < 0.8 ? '#ff9a3c' : 'rgba(60,50,55,0.6)'; ctx.fill();
      if (k > 0.2) { ctx.beginPath(); ctx.arc(sx, sy, Math.round(r * 0.72), 0, TAU); ctx.fillStyle = k < 0.5 ? '#ffe48f' : k < 0.75 ? '#e6802a' : 'rgba(30,25,30,0.7)'; ctx.fill(); }
      if (k > 0.4) { ctx.beginPath(); ctx.arc(sx, sy, Math.round(r * 0.42), 0, TAU); ctx.fillStyle = k < 0.7 ? '#c8302e' : 'rgba(20,18,22,0.8)'; ctx.fill(); }
      if (k < 0.5 && e.water) { // shock ring on the water
        ctx.strokeStyle = `rgba(255,255,255,${(1 - k * 2).toFixed(2)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(sx, sy, Math.round(r * 1.5), Math.round(r * 1.1), 0, 0, TAU); ctx.stroke();
      }
    }
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      pixelText(ctx, t.str, Math.round(t.x - cam.x), Math.round(t.y - cam.y), t.size, t.color, 'center');
    }
    ctx.globalAlpha = 1;
  }
}
