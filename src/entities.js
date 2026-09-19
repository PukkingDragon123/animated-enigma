// ---- Entities: player, enemies, projectiles, pickups, rocks --------------
let G = null; // the running Game (set in game.js)

function circleHit(ax, ay, ar, bx, by, br) { const dx = bx - ax, dy = by - ay; const r = ar + br; return dx * dx + dy * dy < r * r; }

// ============================ ROCK ====================================
class Rock {
  constructor(x, y, r, seed) { this.x = x; this.y = y; this.r = r; this.sprite = makeRock(seed, r); this.glow = 0; }
  render(ctx, cam, t) {
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);
    if (sx < -90 || sy < -90 || sy > 460 || sx > 740) return;
    // surf breaking on the rock: the dilated silhouette, dithered so it
    // shimmers, and pulsing with the swell instead of a drawn-on ellipse
    const fm = this.sprite.foam;
    if (fm) {
      const pulse = 0.34 + Math.sin(t * 2.1 + this.x * 0.05) * 0.2;
      ctx.save();
      ctx.globalAlpha = clamp(pulse, 0.08, 0.6);
      ctx.drawImage(fm.c, sx - fm.ax, sy - fm.ay);
      ctx.globalAlpha = clamp(pulse * 0.7, 0.05, 0.4);
      ctx.drawImage(fm.c, sx - fm.ax, sy - fm.ay + 1);
      ctx.restore();
    }
    if (this.glow > 0) {
      if (!this.glowSprite) this.glowSprite = tintSprite(this.sprite, '#ffe48f', 0.9);
      ctx.save();
      ctx.globalAlpha = clamp(this.glow * (0.5 + Math.sin(t * 12) * 0.3), 0, 1);
      ctx.drawImage(this.glowSprite.c, sx - this.glowSprite.ax, sy - this.glowSprite.ay);
      ctx.restore();
    }
    drawSprite(ctx, this.sprite, sx, sy);
  }
}

// ============================ PICKUP ==================================
class Pickup {
  constructor(x, y, type) { this.x = x; this.y = y; this.type = type; const a = rand(0, TAU), s = rand(40, 120); this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s; this.z = 0; this.vz = rand(60, 140); this.life = 30; this.ph = rand(0, TAU); this.dead = false; this.magnetized = false; }
  update(dt) {
    this.life -= dt; if (this.life <= 0) this.dead = true;
    const p = G.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const mr = 42 * p.stats.magnet;
    if (d < mr && this.z <= 0) {
      this.magnetized = true;
      const k = Math.min(1, (mr - d) / mr + 0.3);
      const sp = 260 + 600 * k;
      this.vx = lerp(this.vx, (p.x - this.x) / d * sp, 0.25); this.vy = lerp(this.vy, (p.y - this.y) / d * sp, 0.25);
    } else { this.vx *= 0.9; this.vy *= 0.9; const f = G.ocean.flow(this.x, this.y); this.vx += f.x * 0.05; this.vy += f.y * 0.05; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.z > 0 || this.vz > 0) { this.z += this.vz * dt; this.vz -= 320 * dt; if (this.z <= 0 && this.vz < 0) { this.z = 0; this.vz = 0; G.ocean.addFoam(this.x, this.y, 0.15); } }
    if (d < 12) {
      this.dead = true;
      const n = 1 + p.stats.scrapBonus;
      G.tree.addScrap(this.type, n);
      G.particles.text(this.x, this.y - 6, '+' + n, SCRAP_COLORS[this.type], 7);
      Audio_.pickup(SCRAP_TYPES.indexOf(this.type));
      G.stats.scrapCollected += n;
    }
  }
  render(ctx, cam, t) {
    const sx = this.x - cam.x, sy = this.y - cam.y - this.z; if (sx < -10 || sy < -10 || sx > 650 || sy > 370) return;
    const bob = this.z > 0 ? 0 : Math.sin(t * 4 + this.ph) * 1.5;
    if (this.z <= 0) { ctx.fillStyle = 'rgba(6,18,48,0.3)'; ctx.fillRect(Math.round(sx - 3), Math.round(sy + 3), 7, 3); }
    if (this.life < 5 && Math.floor(t * 8) % 2 === 0) return;
    drawSprite(ctx, SP.scrap[this.type], sx, sy + bob);
    if (Math.sin(t * 5 + this.ph) > 0.85) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(sx - 3), Math.round(sy + bob - 4), 1, 1); }
  }
}

// ============================ PROJECTILE ==============================
class Projectile {
  constructor(o) {
    Object.assign(this, { x: 0, y: 0, vx: 0, vy: 0, life: 1, dmg: 10, owner: 'player', sprite: SP.bullet, pierce: 0, ricochet: 0, explode: 0, knock: 40, absorbable: true, size: 3, z: 0, vz: 0, arc: false, slow: 0, crit: false, burn: 0, hits: null, trail: false, dead: false, homing: 0, weapon: null }, o);
    this.hits = new Set(); this.age = 0;
  }
  update(dt) {
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { if (this.explode) this.detonate(); this.dead = true; return; }
    if (this.arc) { this.z += this.vz * dt; this.vz -= 300 * dt; if (this.z <= 0 && this.age > 0.1) { this.detonate(); this.dead = true; return; } }
    if (this.homing && this.owner === 'player') {
      const tgt = G.nearestEnemy(this.x, this.y, 200);
      if (tgt) { const a = angleTo(this.x, this.y, tgt.x, tgt.y), cur = Math.atan2(this.vy, this.vx), sp = Math.hypot(this.vx, this.vy); const na = angleLerp(cur, a, this.homing * dt); this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp; }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.x < -50 || this.y < -50 || this.x > G.ocean.W + 50 || this.y > G.ocean.H + 50) { this.dead = true; return; }
    // rocks block bullets (not arcing ones)
    if (!this.arc && this.z <= 0) for (const r of G.rocks) if (circleHit(this.x, this.y, this.size, r.x, r.y, r.r - 2)) {
      G.particles.sparks(this.x, this.y, 4); if (this.explode) this.detonate(); this.dead = true; return;
    }
    if (this.arc && this.z > 0) return; // in the air
    if (this.owner === 'player') {
      for (const e of G.enemies) {
        if (e.dead || this.hits.has(e)) continue;
        if (circleHit(this.x, this.y, this.size, e.x, e.y, e.radius)) { this.onHit(e); if (this.dead) return; }
      }
      if (G.boss && !G.boss.dead && !this.hits.has(G.boss) && circleHit(this.x, this.y, this.size, G.boss.x, G.boss.y, G.boss.radius)) this.onHit(G.boss);
      if (G.fisherman && G.fisherman.alive && circleHit(this.x, this.y, this.size + 4, G.fisherman.x, G.fisherman.y - 8, 10)) { G.fisherman.shot(this); this.dead = true; }
    } else {
      const p = G.player;
      if (p.dead) return;
      const d = dist(this.x, this.y, p.x, p.y);
      if (p.absorb.active && this.absorbable && d < 34) { p.absorbHit(this); this.dead = true; return; }
      if (d < 12 + this.size && !p.diving) {
        if (p.rolling) { this.dead = true; G.particles.sparks(this.x, this.y, 3); return; }
        if (this.explode) { this.detonate(); this.dead = true; return; }
        p.damage(this.dmg, this.x, this.y);
        if (this.slow) p.slowed = Math.max(p.slowed, this.slow);
        this.dead = true; return;
      }
      // decoy buoy takes hits
      if (G.buoy && !G.buoy.dead && dist(this.x, this.y, G.buoy.x, G.buoy.y) < 10) { G.buoy.hp -= this.dmg; G.particles.sparks(this.x, this.y, 3); this.dead = true; }
    }
  }
  onHit(e) {
    this.hits.add(e);
    let dmg = this.dmg;
    if (this.crit) dmg *= G.player.stats.critMult;
    const l = Math.hypot(this.vx, this.vy) || 1;
    e.hit(dmg, this.vx / l * this.knock, this.vy / l * this.knock, this);
    if (this.burn) e.burn = Math.max(e.burn || 0, 4);
    if (this.explode) { this.detonate(); this.dead = true; return; }
    if (this.pierce > 0) { this.pierce--; return; }
    if (this.ricochet > 0) {
      const tgt = G.nearestEnemy(this.x, this.y, 170, e);
      if (tgt) { this.ricochet--; const a = angleTo(this.x, this.y, tgt.x, tgt.y); this.vx = Math.cos(a) * l; this.vy = Math.sin(a) * l; this.life = Math.max(this.life, 0.6); G.particles.sparks(this.x, this.y, 5); return; }
    }
    this.dead = true;
  }
  detonate() {
    if (!this.explode) return;
    const r = this.explode;
    G.particles.explode(this.x, this.y, r, { water: true });
    G.shake(r / 12);
    if (this.owner === 'player') {
      for (const e of G.enemies) if (!e.dead && dist(this.x, this.y, e.x, e.y) < r + e.radius) { const a = angleTo(this.x, this.y, e.x, e.y); e.hit(this.dmg * (this.hits.has(e) ? 0.5 : 1), Math.cos(a) * this.knock * 2, Math.sin(a) * this.knock * 2, this); }
      const b = G.boss; if (b && !b.dead && dist(this.x, this.y, b.x, b.y) < r + b.radius) b.hit(this.dmg * (this.hits.has(b) ? 0.5 : 1), 0, 0, this);
    } else {
      const p = G.player;
      if (!p.diving && dist(this.x, this.y, p.x, p.y) < r + 10) p.damage(this.dmg, this.x, this.y);
      // enemy explosions hurt other boats too (dynamite is indiscriminate)
      for (const e of G.enemies) if (!e.dead && dist(this.x, this.y, e.x, e.y) < r + e.radius) e.hit(this.dmg * 0.5, 0, 0, null);
    }
  }
  render(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y - this.z; if (sx < -20 || sy < -20 || sx > 660 || sy > 380) return;
    const a = Math.atan2(this.vy, this.vx);
    if (this.z > 0) { ctx.fillStyle = 'rgba(6,18,48,0.35)'; ctx.fillRect(Math.round(sx) - 2, Math.round(this.y - cam.y) - 1, 4, 2); }
    if (this.trail) { ctx.strokeStyle = this.owner === 'player' ? 'rgba(255,230,150,0.5)' : 'rgba(255,120,120,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(sx), Math.round(sy)); ctx.lineTo(Math.round(sx - this.vx * 0.02), Math.round(sy - this.vy * 0.02)); ctx.stroke(); }
    const sc = this.crit ? 1.5 : 1;
    drawSprite(ctx, this.sprite, sx, sy, this.arc ? this.age * 8 : a, sc, sc);
  }
}

// ============================ WRECK (sinking boat) ======================
class Wreck {
  constructor(sprite, x, y, angle, radius) { this.sprite = sprite; this.x = x; this.y = y; this.angle = angle; this.t = 0; this.dur = 2.2 + radius / 20; this.radius = radius; this.dead = false; this.smokeT = 0; }
  update(dt) {
    this.t += dt; this.smokeT -= dt;
    if (this.smokeT <= 0) { this.smokeT = 0.08; G.particles.smoke(this.x + rand(-this.radius, this.radius) * 0.5, this.y + rand(-4, 4), 1, 'rgba(30,28,34,', 5); if (Math.random() < 0.5) G.particles.fire(this.x + rand(-this.radius, this.radius) * 0.4, this.y, 1); if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-8, 8), this.y + rand(-4, 4), 1); }
    if (this.t > this.dur) this.dead = true;
    G.ocean.addOil(this.x, this.y, 0.02);
  }
  render(ctx, cam) {
    const k = this.t / this.dur, sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save(); ctx.globalAlpha = 1 - k * k;
    // it lists and sinks: squash on one axis, darken
    const tilt = Math.sin(k * 2) * 0.5;
    drawSprite(ctx, tintSpriteCached(this.sprite, k), sx, sy, this.angle + tilt * 0.5, 1 - k * 0.3, 1 - k * 0.6);
    ctx.restore();
  }
}
const _tintCache = new Map();
function tintSpriteCached(s, k) {
  const step = Math.min(3, Math.floor(k * 4));
  const key = s.c.width + 'x' + s.c.height + ':' + step + ':' + (s._id || (s._id = Math.random()));
  if (!_tintCache.has(key)) _tintCache.set(key, tintSprite(s, '#0a1a30', 0.2 + step * 0.2));
  return _tintCache.get(key);
}

// ============================ DECOY BUOY ==============================
class Buoy {
  constructor(x, y) { this.x = x; this.y = y; this.hp = 60; this.life = 6; this.dead = false; this.ph = 0; }
  update(dt) { this.life -= dt; this.ph += dt; if (this.life <= 0 || this.hp <= 0) { this.dead = true; G.particles.splash(this.x, this.y, 1); } }
  render(ctx, cam, t) { drawSprite(ctx, SP.buoy, this.x - cam.x, this.y - cam.y + Math.sin(t * 4) * 1.5); ctx.fillStyle = Math.floor(t * 4) % 2 ? '#ff6161' : '#fff'; ctx.fillRect(Math.round(this.x - cam.x), Math.round(this.y - cam.y - 4 + Math.sin(t * 4) * 1.5), 1, 1); }
}

// ============================ PLAYER (manatee + otter) ==================
class Player {
  constructor(x, y, tree) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.tree = tree;
    this.stats = tree.stats();
    this.hp = this.stats.maxHp; this.dead = false;
    this.facing = 1; this.tilt = 0; this.heading = 0;
    this.roll = { active: false, t: 0, dur: 0.38, dirx: 1, diry: 0, cd: 0, charges: this.stats.rollCharges, rechargeT: 0 };
    this.absorb = { active: false, t: 0, cd: 0, flash: 0 };
    this.rampage = { meter: 0, active: false, t: 0, aim: 0, fireT: 0 };
    this.dive = { active: false, t: 0, cd: 0 };
    this.decoyCd = 0; this.tidalCd = 0;
    this.weaponCd = { primary: 0, sidearm: 0 };
    this.recoil = { primary: 0, sidearm: 0 }; this.flash = { primary: 0, sidearm: 0 };
    this.aim = 0; this.target = null; this.invuln = 0; this.hurt = 0; this.boost = 0; this.slowed = 0; this.slipT = 0;
    this.swimPhase = 0; this.joyT = 0; this.regenAcc = 0; this.secondWindUsed = false; this.usedSecondWind = false;
    this.wake = G.ocean.newWake(this, 8);
    this.bob = 0;
  }
  get rolling() { return this.roll.active; }
  get diving() { return this.dive.active; }
  refreshStats() {
    const old = this.stats; this.stats = this.tree.stats();
    this.hp = Math.min(this.stats.maxHp, this.hp + Math.max(0, this.stats.maxHp - old.maxHp));
    this.roll.charges = Math.min(this.stats.rollCharges, this.roll.charges + (this.stats.rollCharges - old.rollCharges));
  }
  cd(v) { return v * this.stats.cdMult; }
  update(dt, t) {
    if (this.dead) return;
    const st = this.stats, inp = Input.axis();
    // ---- timers
    this.invuln -= dt; this.hurt -= dt; this.joyT -= dt; this.boost -= dt; this.slowed -= dt; this.absorb.cd -= dt; this.absorb.flash -= dt; this.dive.cd -= dt; this.decoyCd -= dt; this.tidalCd -= dt;
    for (const k of ['primary', 'sidearm']) { this.weaponCd[k] -= dt; this.recoil[k] = Math.max(0, this.recoil[k] - dt); this.flash[k] -= dt; }
    if (this.roll.charges < st.rollCharges) { this.roll.rechargeT -= dt; if (this.roll.rechargeT <= 0) { this.roll.charges++; this.roll.rechargeT = this.cd(2.4 * st.rollCd); } }
    if (st.regen > 0) { this.hp = Math.min(st.maxHp, this.hp + st.regen * dt); }
    // ---- abilities
    if (Input.actHit('roll') && !this.roll.active && this.roll.charges > 0 && !this.dive.active) this.startRoll(inp);
    if (Input.actHit('shield') && !this.absorb.active && this.absorb.cd <= 0 && !this.roll.active) { this.absorb.active = true; this.absorb.t = 0; G.ocean.ripple(this.x, this.y, 40, 120, 0.6); }
    if (Input.actHit('rampage') && this.rampage.meter >= 100 && !this.rampage.active) this.startRampage();
    if (st.dive && Input.actHit('dive') && !this.dive.active && this.dive.cd <= 0 && !this.roll.active) { this.dive.active = true; this.dive.t = 0; G.particles.splash(this.x, this.y, 1.6); G.particles.bubbles(this.x, this.y, 8); Audio_.splash(1.2); }
    if (st.decoy && Input.actHit('decoy') && this.decoyCd <= 0) { this.decoyCd = this.cd(14); G.buoy = new Buoy(this.x - this.facing * 30, this.y); G.particles.splash(G.buoy.x, G.buoy.y, 0.8); G.particles.text(this.x, this.y - 20, 'DECOY!', '#8ac6ff'); }
    if (st.tidal && Input.actHit('tidal') && this.tidalCd <= 0) this.tidalSlam();
    if (this.absorb.active) { this.absorb.t += dt; if (this.absorb.t > st.absorbWindow) { this.absorb.active = false; this.absorb.cd = this.cd(st.absorbCd); } }
    if (this.dive.active) { this.dive.t += dt; if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-8, 8), this.y + rand(-6, 6), 1); if (this.dive.t > 1.5) { this.dive.active = false; this.dive.cd = this.cd(7); G.particles.splash(this.x, this.y, 1.8); Audio_.splash(1.3); } }
    // ---- movement
    let speedMul = st.speed * (this.boost > 0 ? 1.6 : 1) * (this.slowed > 0 ? 0.45 : 1) * (this.dive.active ? 0.7 : 1) * (this.rampage.active ? 1.15 : 1);
    const maxSp = 150 * speedMul, acc = 520 * st.accel;
    if (this.roll.active) {
      this.roll.t += dt;
      const k = this.roll.t / this.roll.dur, sp = 560 * st.rollDist * (1 - k * 0.5);
      this.vx = this.roll.dirx * sp; this.vy = this.roll.diry * sp;
      if (Math.random() < 0.8) G.particles.spray(this.x - this.roll.dirx * 8, this.y - this.roll.diry * 8, Math.atan2(-this.roll.diry, -this.roll.dirx), 2, 120);
      G.ocean.addFoam(this.x, this.y, 0.35);
      if (st.slipstream) { this.slipT -= dt; if (this.slipT <= 0) { this.slipT = 0.05; G.ocean.currents.push({ type: 'lane', x: this.x, y: this.y, r: 28, ang: Math.atan2(this.roll.diry, this.roll.dirx), s: 90, life: 4 }); } }
      if (st.rollDmg) for (const e of G.enemies) if (!e.dead && !e.rollHit && circleHit(this.x, this.y, 14, e.x, e.y, e.radius)) { e.rollHit = true; e.hit(st.rollDmg, this.roll.dirx * 220, this.roll.diry * 220, null); G.shake(3); }
      if (this.roll.t >= this.roll.dur) this.endRoll();
    } else {
      let tx = inp.x * maxSp, ty = inp.y * maxSp;
      this.vx = approach(this.vx, tx, acc * dt); this.vy = approach(this.vy, ty, acc * dt);
      if (inp.x === 0 && inp.y === 0) { this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt); }
    }
    // currents
    const f = G.ocean.flow(this.x, this.y);
    if (st.currentRider) { const l = Math.hypot(f.x, f.y); const hv = Math.hypot(this.vx, this.vy); if (hv > 5 && l > 1) { this.vx += this.vx / hv * l * dt * 0.8; this.vy += this.vy / hv * l * dt * 0.8; } }
    else { this.vx += f.x * dt * 0.6; this.vy += f.y * dt * 0.6; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    // bounds & rocks
    this.x = clamp(this.x, 16, G.ocean.W - 16); this.y = clamp(this.y, G.ocean.shoreY + 14, G.ocean.H - 16);
    for (const r of G.rocks) { const d = dist(this.x, this.y, r.x, r.y); if (d < r.r + 8) { const a = angleTo(r.x, r.y, this.x, this.y); this.x = r.x + Math.cos(a) * (r.r + 8); this.y = r.y + Math.sin(a) * (r.r + 8); if (this.roll.active) { this.endRoll(); G.particles.splash(this.x, this.y, 1.2); } this.vx *= 0.5; this.vy *= 0.5; } }
    // facing & tilt
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 20) {
      const a = Math.atan2(this.vy, this.vx);
      if (Math.abs(this.vx) > 15) this.facing = sign(this.vx);
      const rel = this.facing === 1 ? a : Math.atan2(this.vy, -this.vx);
      this.tilt = lerp(this.tilt, clamp(rel, -0.7, 0.7), 1 - Math.pow(0.001, dt));
    } else this.tilt = lerp(this.tilt, 0, 1 - Math.pow(0.01, dt));
    this.swimPhase += dt * (3 + sp / 40);
    // shove the water aside as we swim — the jelly surface reacts
    if (G.ocean.disturb && sp > 12) G.ocean.disturb(this.x, this.y, Math.min(2.0, sp / 90) * (this.roll.active ? 2.6 : 1), this.vx, this.vy);
    // wake
    if (sp > 40 && !this.dive.active) { const last = this.wake.pts[this.wake.pts.length - 1]; if (!last || dist(last.x, last.y, this.x, this.y) > 6) this.wake.pts.push({ x: this.x - this.vx / sp * 10, y: this.y - this.vy / sp * 10, t }); if (Math.random() < sp / 500) G.ocean.addFoam(this.x - this.vx / sp * 12, this.y - this.vy / sp * 12, 0.06); }
    // ---- otter: aiming & shooting
    this.updateWeapons(dt, t);
  }
  startRoll(inp) {
    let dx = inp.x, dy = inp.y;
    if (dx === 0 && dy === 0) { dx = this.facing; dy = 0; }
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    this.roll.active = true; this.roll.t = 0; this.roll.dirx = dx; this.roll.diry = dy; this.roll.charges--; this.roll.rechargeT = this.cd(2.4 * this.stats.rollCd);
    this.roll.dur = 0.38;
    if (this.absorb.active) { this.absorb.active = false; this.absorb.cd = this.cd(this.stats.absorbCd * 0.5); }
    G.particles.splash(this.x, this.y, 1.3); Audio_.roll(); G.shake(2);
    Toon.shock(this.x, this.y, 46, 0.3);
    for (let i = 0; i < 4; i++) Toon.speed(this.x, this.y, Math.atan2(dy, dx), 2);
    for (const e of G.enemies) e.rollHit = false;
    if (Math.abs(dx) > 0.2) this.facing = sign(dx);
  }
  endRoll() {
    this.roll.active = false; this.vx *= 0.35; this.vy *= 0.35;
    G.particles.splash(this.x, this.y, 1.1);
    if (this.stats.rollSplash) {
      G.ocean.ripple(this.x, this.y, 70, 200, 0.9); G.shake(4);
      Toon.shock(this.x, this.y, 90, 0.45); Toon.puff(this.x, this.y, 5);
      for (const e of G.enemies) if (!e.dead && dist(this.x, this.y, e.x, e.y) < 70 + e.radius) { const a = angleTo(this.x, this.y, e.x, e.y); e.hit(this.stats.rollSplash, Math.cos(a) * 260, Math.sin(a) * 260, null); }
    }
  }
  tidalSlam() {
    this.tidalCd = this.cd(12);
    G.particles.splash(this.x, this.y, 3.5); G.ocean.ripple(this.x, this.y, 140, 260, 1); G.ocean.ripple(this.x, this.y, 110, 200, 0.7); G.shake(8); Audio_.splash(2.5); Audio_.explosion(0.8);
    G.particles.text(this.x, this.y - 24, 'TIDAL SLAM!', '#8ac6ff', 9);
    for (const e of G.enemies) if (!e.dead && dist(this.x, this.y, e.x, e.y) < 150 + e.radius) { const a = angleTo(this.x, this.y, e.x, e.y); e.hit(40, Math.cos(a) * 420, Math.sin(a) * 420, null); }
    if (G.boss && !G.boss.dead && dist(this.x, this.y, G.boss.x, G.boss.y) < 160) G.boss.hit(40, 0, 0, null);
    for (const pr of G.projectiles) if (pr.owner === 'enemy' && dist(this.x, this.y, pr.x, pr.y) < 150) pr.dead = true;
  }
  startRampage() {
    this.rampage.active = true; this.rampage.t = 0; this.rampage.meter = 0; this.rampage.dur = this.stats.rampDur;
    Audio_.rampage(); G.shake(6); G.particles.text(this.x, this.y - 26, 'OTTER RAMPAGE!', '#ff6161', 10); G.banner('OTTER RAMPAGE!', '#ff6161', 1.2);
    G.ocean.ripple(this.x, this.y, 90, 300, 1);
  }
  absorbHit(proj) {
    const st = this.stats;
    let gain = 25 * st.rampGain;
    const perfect = st.perfectParry && (st.absorbWindow - this.absorb.t) < 0.1;
    if (perfect) { gain *= 2; this.absorb.cd = 0; G.particles.text(this.x, this.y - 30, 'PERFECT!', '#ffe48f', 9); }
    if (!this.rampage.active) this.rampage.meter = Math.min(100, this.rampage.meter + gain);
    else if (st.rampFrenzy) this.rampage.t -= 0.5;
    this.absorb.flash = 0.25; G.stats.absorbs++;
    Audio_.absorb(); G.shake(2);
    Toon.impact(proj.x, proj.y, 1.4, '#8ac6ff'); Toon.shock(this.x, this.y, 70, 0.35, '#8ac6ff');
    Toon.emote(this.x + 14, this.y - 26, '!');
    G.particles.sparks(proj.x, proj.y, 10); G.particles.text(this.x, this.y - 20, 'ABSORB', '#8ac6ff', 8);
    for (let i = 0; i < 12; i++) G.particles.add({ type: 'spark', x: this.x, y: this.y, vx: Math.cos(i / 12 * TAU) * 160, vy: Math.sin(i / 12 * TAU) * 160, life: 0.3, maxLife: 0.3, color: '#8ac6ff' });
    if (st.absorbHeal) this.hp = Math.min(st.maxHp, this.hp + st.absorbHeal);
    if (st.absorbBoost) this.boost = 2;
    if (st.absorbReflect) {
      const tgt = G.nearestEnemy(this.x, this.y, 500) || G.boss;
      if (tgt) { const a = angleTo(this.x, this.y, tgt.x, tgt.y); G.projectiles.push(new Projectile({ x: this.x, y: this.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 1.5, dmg: proj.dmg * 3, owner: 'player', sprite: SP.bulletBig, knock: 120, size: 4, trail: true, explode: proj.explode })); }
    }
    if (st.absorbShock) {
      G.ocean.ripple(this.x, this.y, 80, 240, 0.9);
      for (const e of G.enemies) if (!e.dead && dist(this.x, this.y, e.x, e.y) < 80 + e.radius) { const a = angleTo(this.x, this.y, e.x, e.y); e.hit(st.absorbShock, Math.cos(a) * 240, Math.sin(a) * 240, null); }
    }
  }
  damage(amt, sx, sy) {
    if (this.dead || this.invuln > 0 || this.roll.active || this.dive.active) return;
    amt *= (1 - Math.min(0.7, this.stats.armor));
    this.hp -= amt; this.invuln = 0.5; this.hurt = 0.15;
    G.shake(Math.min(10, 3 + amt / 4)); Audio_.hurt();
    Toon.impact(this.x, this.y, 1.2, '#ff6161'); Toon.emote(this.x + 12, this.y - 28, '!');
    const a = sx !== undefined ? angleTo(sx, sy, this.x, this.y) : rand(0, TAU);
    this.vx += Math.cos(a) * 120; this.vy += Math.sin(a) * 120;
    G.particles.blood(this.x, this.y, 0.7, a); G.particles.splash(this.x, this.y, 0.8);
    G.particles.text(this.x, this.y - 18, '-' + Math.round(amt), '#ff6161', 8);
    G.stats.damageTaken += amt;
    if (this.hp <= 0) {
      if (this.stats.secondWind && !this.usedSecondWind) {
        this.usedSecondWind = true; this.hp = this.stats.maxHp * 0.5; this.invuln = 2;
        G.banner('SECOND WIND!', '#ffe48f', 1.5); G.particles.splash(this.x, this.y, 4); G.ocean.ripple(this.x, this.y, 200, 400, 1); G.shake(12); Audio_.rampage();
        for (const e of G.enemies) if (!e.dead && dist(this.x, this.y, e.x, e.y) < 220) { const an = angleTo(this.x, this.y, e.x, e.y); e.hit(60, Math.cos(an) * 500, Math.sin(an) * 500, null); }
        for (const pr of G.projectiles) if (pr.owner === 'enemy') pr.dead = true;
        return;
      }
      this.hp = 0; this.dead = true; G.onPlayerDeath();
    }
  }
  // ---- weapons ----------------------------------------------------------
  updateWeapons(dt, t) {
    const st = this.stats;
    const mouseWorld = G.screenToWorld(Input.mouse.x, Input.mouse.y);
    this.target = G.nearestEnemy(this.x, this.y, 300, null, true);
    let wantFire = false;
    const manualFire = Input.act('fire');
    const touchAim = (typeof MobileUI !== 'undefined' && MobileUI.enabled) ? MobileUI.aimAt() : null;
    if (touchAim) { const w = G.screenToWorld(touchAim.x, touchAim.y); this.aim = angleTo(this.x, this.y, w.x, w.y); wantFire = manualFire || !G.holdFire; }
    else if (Input.mouse.down) { this.aim = angleTo(this.x, this.y, mouseWorld.x, mouseWorld.y); wantFire = true; }
    else if (manualFire && this.target) { this.aim = angleTo(this.x, this.y, this.target.x, this.target.y); wantFire = true; }
    else if (this.target) { const lead = 0.15; this.aim = angleTo(this.x, this.y, this.target.x + (this.target.vx || 0) * lead, this.target.y + (this.target.vy || 0) * lead); wantFire = !G.holdFire; }
    else this.aim = angleLerp(this.aim, this.facing === 1 ? 0 : Math.PI, dt * 3);
    if (G.fisherman && G.fisherman.alive) { this.aim = angleTo(this.x, this.y, G.fisherman.x, G.fisherman.y - 8); this.target = null; return; }
    if (this.rampage.active) {
      this.rampage.t += dt; this.rampage.aim += dt * 14; this.rampage.fireT -= dt;
      if (this.rampage.fireT <= 0) {
        this.rampage.fireT = 0.045;
        const tgt = G.nearestEnemy(this.x, this.y, 500) || (G.boss && !G.boss.dead ? G.boss : null);
        const a = (Math.random() < 0.6 && tgt) ? angleTo(this.x, this.y, tgt.x, tgt.y) + rand(-0.15, 0.15) : this.rampage.aim;
        this.aim = a;
        this.spawnShot(WEAPONS[this.tree.primary], a, 'primary', { dmgMul: 0.8, explode: st.rampExplosive ? 22 : 0 });
        this.recoil.primary = 0.06; this.flash.primary = 0.05;
        if (Math.random() < 0.3) Audio_.shot('smg');
      }
      if (this.rampage.t >= this.rampage.dur) { this.rampage.active = false; }
      return;
    }
    if (this.dive.active) return;
    if (wantFire) {
      this.fire('primary', this.tree.primary);
      if (st.sidearm && this.tree.sidearm && this.tree.sidearm !== this.tree.primary) this.fire('sidearm', this.tree.sidearm);
    }
  }
  fire(slot, wid) {
    if (this.weaponCd[slot] > 0) return;
    const w = WEAPONS[wid]; if (!w) return;
    this.weaponCd[slot] = w.rate / this.stats.fireRate * (slot === 'sidearm' ? 1.3 : 1);
    const count = w.count + this.stats.projCount;
    for (let i = 0; i < count; i++) {
      const spread = w.spread * (count > 1 ? 1.15 : 1);
      const a = this.aim + (count > 1 ? (i / (count - 1) - 0.5) * spread * 2 : 0) + rand(-spread * 0.3, spread * 0.3);
      this.spawnShot(w, a, slot, {});
    }
    this.recoil[slot] = 0.12; this.flash[slot] = 0.07;
    Audio_.shot(w.sound); G.shake(w.kick * 0.25);
    G.particles.shell(this.x + Math.cos(this.aim) * 6, this.y - 6 + Math.sin(this.aim) * 6, this.aim);
    // muzzle blast disturbs the water
    G.particles.spray(this.x + Math.cos(this.aim) * 14, this.y + Math.sin(this.aim) * 14, this.aim, w.kick > 4 ? 3 : 1, 60);
    this.vx -= Math.cos(this.aim) * w.kick * 6; this.vy -= Math.sin(this.aim) * w.kick * 6;
    G.stats.shots++;
  }
  spawnShot(w, a, slot, o) {
    const st = this.stats;
    let dmg = w.dmg * st.dmg * (o.dmgMul || 1);
    if (w === WEAPONS.revolver && st.revolverDmg) dmg *= st.revolverDmg;
    const spd = w.speed * st.projSpeed * rand(0.95, 1.05);
    const crit = Math.random() < st.crit;
    const gx = this.x + Math.cos(a) * 10, gy = this.y - 5 + Math.sin(a) * 10;
    G.projectiles.push(new Projectile({
      x: gx, y: gy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: w.life, dmg, owner: 'player',
      sprite: st.bigIron && w.shot === 'bullet' ? SP.bulletBig : SP[w.shot], pierce: (w.pierce || 0) + st.pierce, ricochet: st.ricochet,
      explode: (w.explode || 0) + (o.explode || 0) + (st.explosive && !w.explode ? st.explosive : 0), knock: w.knock * st.knock, size: w.size + (st.bigIron ? 1 : 0),
      arc: !!(w.shot === 'grenadeShot'), vz: w.shot === 'grenadeShot' ? 110 : 0, crit, burn: st.burn, trail: w.shot !== 'pellet', weapon: w,
    }));
  }
  // ---- render ------------------------------------------------------------
  expression() {
    if (this.hurt > 0) return 'surprised';
    if (this.rampage.active) return 'angry';
    if (this.absorb.active) return 'surprised';
    if (this.joyT > 0) return 'happy';
    if (this.target || Input.mouse.down) return 'angry';
    return 'idle';
  }
  render(ctx, cam, t) {
    if (this.dead) return;
    const sx = this.x - cam.x, sy = this.y - cam.y;
    const st = this.stats;

    // ---- rampage aura
    if (this.rampage.active) {
      const k = 1 - this.rampage.t / this.rampage.dur;
      ctx.strokeStyle = `rgba(255,80,60,${(0.5 + Math.sin(t * 20) * 0.3).toFixed(2)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(Math.round(sx), Math.round(sy), 30 + Math.sin(t * 15) * 3, 22 + Math.sin(t * 15) * 2, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,60,0.4)';
      ctx.beginPath(); ctx.ellipse(Math.round(sx), Math.round(sy), 30 + 14 * (1 - k), 22 + 12 * (1 - k), 0, 0, TAU); ctx.stroke();
    }
    // ---- parry shield: an octagonal energy shield that snaps up and spins
    if (this.absorb.active) {
      const k = this.absorb.t / st.absorbWindow;
      const pop = k < 0.18 ? k / 0.18 : 1;                 // snap-in
      const sc = (0.55 + pop * 0.45) * (1 - k * 0.10);
      ctx.save();
      ctx.translate(Math.round(sx), Math.round(sy));
      ctx.rotate(this.absorb.t * 2.2);
      ctx.globalAlpha = 0.55 + (1 - k) * 0.45;
      ctx.scale(sc, sc * 0.8);
      const spr = st.perfectParry && (st.absorbWindow - this.absorb.t) < 0.1 ? CH.shieldGold : CH.shield;
      ctx.drawImage(spr.c, -spr.ax, -spr.ay);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (this.absorb.flash > 0) {
      const f = this.absorb.flash / 0.25;
      ctx.save();
      ctx.translate(Math.round(sx), Math.round(sy));
      ctx.globalAlpha = f;
      const sc = 1 + (1 - f) * 1.5;
      ctx.scale(sc, sc * 0.8);
      ctx.drawImage(CH.shieldHot.c, -CH.shieldHot.ax, -CH.shieldHot.ay);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    const bob = Math.sin(t * 2.5) * 1.2;
    const speed = Math.hypot(this.vx, this.vy);
    ctx.save();
    if (this.dive.active) ctx.globalAlpha = 0.45;
    ctx.translate(Math.round(sx), Math.round(sy + bob + (this.dive.active ? 4 : 0)));
    ctx.scale(RIG_SCALE, RIG_SCALE);
    Rig.draw(ctx, 0, 0, {
      t, aim: this.aim, facing: this.facing, tilt: this.tilt,
      swimPhase: this.swimPhase,
      rollPhase: this.roll.active ? this.roll.t / this.roll.dur : null,
      hurt: this.hurt > 0 && Math.floor(t * 30) % 2 === 0,
      exp: this.expression(), rage: this.rampage.active,
      recoil: Math.max(this.recoil.primary, this.recoil.sidearm) / 0.12,
      flash: Math.max(this.flash.primary, this.flash.sidearm),
      bigFlash: (WEAPONS[this.tree.primary].kick > 4),
      speed, armored: true,
      gunSprite: SP.guns[this.tree.primary] || SP.guns.revolver,
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    if (this.slowed > 0) { ctx.globalAlpha = 0.8; drawSprite(ctx, SP.net, sx, sy - 4, 0, 2, 2); ctx.globalAlpha = 1; }
    if (this.rampage.meter >= 100 && !this.rampage.active && Math.floor(t * 3) % 2 === 0)
      pixelText(ctx, 'Q: RAMPAGE', Math.round(sx), Math.round(sy - 38), 7, '#ff6161', 'center');
  }

}

// ============================ ENEMIES ====================================
const ENEMY_TYPES = {
  dinghy: { hp: 30, speed: 100, turn: 2.6, radius: 12, behavior: 'chase', ram: 12, drops: { wood: 2, metal: 1 }, name: 'Fishing Dinghy', wake: 6 },
  netter: { hp: 48, speed: 85, turn: 2.2, radius: 13, behavior: 'orbit', orbit: 150, attackCd: 3.0, attack: 'net', ram: 8, drops: { wood: 2, tech: 1 }, name: 'Net Boat', wake: 7 },
  harpooner: { hp: 58, speed: 88, turn: 2.2, radius: 14, behavior: 'kite', orbit: 260, attackCd: 2.4, attack: 'harpoon', ram: 8, drops: { metal: 3, wood: 1 }, name: 'Harpooner', wake: 7 },
  speedboat: { hp: 55, speed: 215, turn: 3.2, radius: 15, behavior: 'strafe', attackCd: 0.18, attack: 'pistol', ram: 15, drops: { fuel: 3, metal: 1 }, name: 'Speedboat', wake: 9 },
  jetski: { hp: 22, speed: 200, turn: 5, radius: 8, behavior: 'zigzag', ram: 0, kamikaze: 22, drops: { fuel: 2 }, name: 'Jetski Bomber', wake: 4 },
  dynaboat: { hp: 62, speed: 78, turn: 2.0, radius: 14, behavior: 'orbit', orbit: 210, attackCd: 2.8, attack: 'dynamite', ram: 8, drops: { powder: 3, wood: 1 }, name: 'Dynamite Skiff', wake: 7 },
  trawler: { hp: 280, speed: 58, turn: 1.1, radius: 25, behavior: 'chase', attackCd: 2.2, attack: 'buckshot', attackRange: 230, ram: 25, drops: { metal: 4, wood: 4, tech: 2 }, name: 'Trawler', wake: 14, big: true },
  gunboat: { hp: 220, speed: 92, turn: 1.7, radius: 22, behavior: 'kite', orbit: 230, attackCd: 2.1, attack: 'turret', ram: 15, drops: { metal: 5, powder: 3, tech: 3 }, name: 'Gunboat', wake: 12, big: true },
};

class Enemy {
  constructor(type, x, y) {
    const c = this.cfg = ENEMY_TYPES[type]; this.type = type;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.hp = c.hp; this.maxHp = c.hp; this.radius = c.radius;
    this.angle = angleTo(x, y, G.player.x, G.player.y); this.speed = c.speed; this.throttle = 1;
    this.attackT = rand(0.5, c.attackCd || 2); this.state = 'approach'; this.stateT = rand(0, 2); this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.dead = false; this.flash = 0; this.burn = 0; this.burnT = 0; this.kx = 0; this.ky = 0; this.ramCd = 0; this.bob = rand(0, TAU);
    this.wake = G.ocean.newWake(this, c.wake); this.sprite = SP.boats[type]; this.hurtSprite = SP.boatsHurt[type];
    this.zig = rand(0, TAU); this.burstLeft = 0; this.burstT = 0; this.strafeDir = 1;
    this.slowT = 0; this.age = 0; this.dmgT = 0; this.list = 0; this.scars = [];
  }
  targetPos() { if (G.buoy && !G.buoy.dead) return G.buoy; return G.player; }
  update(dt, t) {
    const c = this.cfg, p = this.targetPos(); this.age += dt;
    this.flash -= dt; this.ramCd -= dt; this.stateT += dt;
    if (this.burn > 0) { this.burn -= dt; this.burnT -= dt; if (this.burnT <= 0) { this.burnT = 0.5; this.hit(G.player.stats.burn * 0.5, 0, 0, null, true); G.particles.fire(this.x, this.y, 2); G.particles.smoke(this.x, this.y, 1); } }
    const d = dist(this.x, this.y, p.x, p.y), toP = angleTo(this.x, this.y, p.x, p.y);
    let desired = toP, throttle = 1;
    switch (c.behavior) {
      case 'chase': desired = toP; throttle = d < 20 ? 0.6 : 1; break;
      case 'orbit': {
        const r = c.orbit;
        if (d > r + 60) desired = toP; else if (d < r - 50) desired = toP + Math.PI; else desired = toP + Math.PI / 2 * this.orbitDir;
        if (this.stateT > 4 && Math.random() < 0.01) { this.orbitDir *= -1; this.stateT = 0; }
        throttle = Math.abs(d - r) > 40 ? 1 : 0.8; break;
      }
      case 'kite': {
        const r = c.orbit;
        if (d < r - 30) desired = toP + Math.PI + 0.4 * this.orbitDir; else if (d > r + 80) desired = toP; else { desired = toP + Math.PI / 2 * this.orbitDir; throttle = 0.6; }
        if (this.stateT > 5 && Math.random() < 0.01) { this.orbitDir *= -1; this.stateT = 0; }
        break;
      }
      case 'strafe': {
        // run past the player in a line, then loop back
        if (this.state === 'approach') { const off = Math.PI / 2 * this.strafeDir * Math.min(1, 60 / Math.max(1, d)); desired = toP + off * 0.6; if (d < 60) { this.state = 'pass'; this.stateT = 0; this.passAngle = this.angle; } }
        else if (this.state === 'pass') { desired = this.passAngle; if (this.stateT > 1.1) { this.state = 'turn'; this.stateT = 0; this.strafeDir *= -1; } }
        else { desired = toP; throttle = 0.9; if (this.stateT > 1.4) { this.state = 'approach'; this.stateT = 0; } }
        break;
      }
      case 'zigzag': { this.zig += dt * 7; desired = toP + Math.sin(this.zig) * 0.9 * Math.min(1, d / 120); break; }
    }
    // rock avoidance
    for (const r of G.rocks) {
      const dr = dist(this.x, this.y, r.x, r.y);
      if (dr < r.r + this.radius + 40) {
        const ar = angleTo(this.x, this.y, r.x, r.y), diff = angleDiff(this.angle, ar);
        if (Math.abs(diff) < 1.2) desired = this.angle - sign(diff) * 1.4 * (1 - (dr - r.r - this.radius) / 40);
        if (dr < r.r + this.radius) { const a = angleTo(r.x, r.y, this.x, this.y); this.x = r.x + Math.cos(a) * (r.r + this.radius); this.y = r.y + Math.sin(a) * (r.r + this.radius); if (Math.hypot(this.vx, this.vy) > 120) { this.hit(10, Math.cos(a) * 100, Math.sin(a) * 100, null); G.particles.splash(this.x, this.y, 1); } }
      }
    }
    // separation
    for (const e of G.enemies) { if (e === this || e.dead) continue; const de = dist(this.x, this.y, e.x, e.y), min = this.radius + e.radius + 4; if (de < min && de > 0.01) { const a = angleTo(e.x, e.y, this.x, this.y); const push = (min - de) * 4; this.kx += Math.cos(a) * push; this.ky += Math.sin(a) * push; } }
    // steering
    const turn = c.turn * (this.slowT > 0 ? 0.5 : 1);
    this.angle = angleLerp(this.angle, desired, Math.min(1, turn * dt));
    const sp = this.speed * throttle * (this.slowT > 0 ? 0.5 : 1);
    this.vx = lerp(this.vx, Math.cos(this.angle) * sp, Math.min(1, dt * 2.5)); this.vy = lerp(this.vy, Math.sin(this.angle) * sp, Math.min(1, dt * 2.5));
    const f = G.ocean.flow(this.x, this.y);
    this.x += (this.vx + this.kx + f.x * 0.4) * dt; this.y += (this.vy + this.ky + f.y * 0.4) * dt;
    this.kx *= Math.pow(0.02, dt); this.ky *= Math.pow(0.02, dt);
    this.x = clamp(this.x, 10, G.ocean.W - 10); this.y = clamp(this.y, G.ocean.shoreY - 4, G.ocean.H - 10);
    // wake & spray
    const spd = Math.hypot(this.vx, this.vy);
    if (G.ocean.disturb && spd > 20) G.ocean.disturb(this.x, this.y, Math.min(4.5, spd / 55) * (this.cfg.big ? 1.6 : 1), this.vx, this.vy);
    const last = this.wake.pts[this.wake.pts.length - 1];
    const stx = this.x - Math.cos(this.angle) * this.radius * 0.9, sty = this.y - Math.sin(this.angle) * this.radius * 0.9;
    if (!last || dist(last.x, last.y, stx, sty) > 5) { this.wake.pts.push({ x: stx, y: sty, t }); G.ocean.addFoam(stx, sty, 0.05 + spd / 3000); }
    if (spd > 150 && Math.random() < 0.5) G.particles.spray(this.x + Math.cos(this.angle) * this.radius, this.y + Math.sin(this.angle) * this.radius, this.angle + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), 1, 60);
    if (Math.abs(angleDiff(this.angle, desired)) > 0.8 && spd > 80 && Math.random() < 0.3) G.particles.spray(stx, sty, this.angle + Math.PI, 1, 50);
    // ---- battle damage: a chewed-up hull smokes, then burns, then lists
    const hk = this.hp / this.maxHp;
    if (hk < 0.65) {
      this.dmgT -= dt;
      if (this.dmgT <= 0) {
        this.dmgT = hk < 0.3 ? 0.07 : hk < 0.5 ? 0.14 : 0.24;
        const ox = rand(-this.radius, this.radius) * 0.7, oy = rand(-this.radius, this.radius) * 0.5;
        G.particles.smoke(this.x + ox, this.y + oy, 1, hk < 0.3 ? 'rgba(22,20,26,' : 'rgba(58,56,64,', this.radius / 4);
        if (hk < 0.35) G.particles.fire(this.x + ox, this.y + oy, 1);
        if (hk < 0.3 && Math.random() < 0.3) G.ocean.addOil(this.x, this.y, 0.05);
      }
      this.list = lerp(this.list, (1 - hk) * 0.22 * (this.orbitDir || 1), Math.min(1, dt * 2));
    }

    // attacks
    if (c.attack) this.updateAttack(dt, d, toP, p);
    // ramming / kamikaze against the real player only
    const pl = G.player;
    const dp = dist(this.x, this.y, pl.x, pl.y);
    if (!pl.dead && !pl.diving && dp < this.radius + 11) {
      if (c.kamikaze) { this.die(true); G.particles.explode(this.x, this.y, 44); pl.damage(c.kamikaze, this.x, this.y); return; }
      if (c.ram && this.ramCd <= 0 && spd > 30 && !pl.rolling) { this.ramCd = 1.0; pl.damage(c.ram, this.x, this.y); this.kx -= Math.cos(this.angle) * 80; this.ky -= Math.sin(this.angle) * 80; G.particles.splash((this.x + pl.x) / 2, (this.y + pl.y) / 2, 1.2); }
      else if (pl.rolling && !pl.stats.rollDmg) { const a = angleTo(pl.x, pl.y, this.x, this.y); this.kx += Math.cos(a) * 120; this.ky += Math.sin(a) * 120; }
    }
    // decoy buoy ram
    if (G.buoy && !G.buoy.dead && dist(this.x, this.y, G.buoy.x, G.buoy.y) < this.radius + 8 && this.ramCd <= 0) { this.ramCd = 0.8; G.buoy.hp -= 15; G.particles.splash(G.buoy.x, G.buoy.y, 0.8); }
    this.slowT -= dt;
  }
  updateAttack(dt, d, toP, p) {
    const c = this.cfg;
    this.attackT -= dt;
    if (this.burstLeft > 0) { this.burstT -= dt; if (this.burstT <= 0) { this.burstT = 0.12; this.burstLeft--; this.shoot('bullet', toP + rand(-0.08, 0.08), 340, 7, 1.4); } }
    if (this.attackT > 0) return;
    const inRange = d < (c.attackRange || c.orbit + 120 || 300);
    switch (c.attack) {
      case 'net': if (!inRange) return; this.attackT = c.attackCd; { const a = toP + rand(-0.1, 0.1); G.projectiles.push(new Projectile({ x: this.x, y: this.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, life: d / 190 + 0.2, dmg: 4, owner: 'enemy', sprite: SP.net, size: 8, slow: 2.2, knock: 0 })); this.recoilFx(a, 'net'); } break;
      case 'harpoon': if (!inRange) return; this.attackT = c.attackCd; { const lead = d / 400; const a = angleTo(this.x, this.y, p.x + (p.vx || 0) * lead, p.y + (p.vy || 0) * lead); this.shoot('harpoon', a, 400, 15, 1.6); Audio_.shot('harpoon'); } break;
      case 'pistol': if (this.state !== 'pass' || d > 170) return; this.attackT = c.attackCd; this.shoot('bullet', toP + rand(-0.15, 0.15), 320, 6, 1); if (Math.random() < 0.5) Audio_.shot('smg'); break;
      case 'dynamite': if (!inRange) return; this.attackT = c.attackCd; {
        const tx = p.x + (p.vx || 0) * 0.6 + rand(-20, 20), ty = p.y + (p.vy || 0) * 0.6 + rand(-20, 20);
        const dd = dist(this.x, this.y, tx, ty), flight = clamp(dd / 220, 0.6, 1.6), a = angleTo(this.x, this.y, tx, ty);
        G.projectiles.push(new Projectile({ x: this.x, y: this.y, vx: Math.cos(a) * dd / flight, vy: Math.sin(a) * dd / flight, life: flight, dmg: 22, owner: 'enemy', sprite: SP.dynamite, size: 4, explode: 46, arc: true, vz: 150 * flight, knock: 0, absorbable: true }));
        Audio_.tone(300, 0.2, 'sine', 0.15, 200);
      } break;
      case 'buckshot': if (!inRange) return; this.attackT = c.attackCd; for (let i = -2; i <= 2; i++) this.shoot('buckshot', toP + i * 0.14 + rand(-0.03, 0.03), 300, 6, 0.8); Audio_.shot('shotgun'); this.recoilFx(toP, 'flash'); break;
      case 'turret': if (!inRange) return; this.attackT = c.attackCd; this.burstLeft = 4; this.burstT = 0; Audio_.shot('rifle'); this.recoilFx(toP, 'flash'); break;
    }
  }
  shoot(kind, a, speed, dmg, life) {
    const spr = kind === 'harpoon' ? SP.enemyHarpoon : kind === 'buckshot' ? SP.buckshot : SP.enemyBullet;
    G.projectiles.push(new Projectile({ x: this.x + Math.cos(a) * this.radius, y: this.y + Math.sin(a) * this.radius, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, dmg, owner: 'enemy', sprite: spr, size: kind === 'harpoon' ? 4 : 2, trail: true, knock: 0 }));
    if (kind !== 'buckshot') this.recoilFx(a, 'flash');
  }
  recoilFx(a, kind) { if (kind === 'flash') G.particles.sparks(this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius, 3, a, 0.6); this.kx -= Math.cos(a) * 30; this.ky -= Math.sin(a) * 30; }
  hit(dmg, kx, ky, proj, silent = false) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 0.08; this.kx += kx / (this.cfg.big ? 3 : 1); this.ky += ky / (this.cfg.big ? 3 : 1);
    if (!silent) {
      G.particles.sparks(this.x, this.y, 3); G.particles.debris(this.x, this.y, 2);
      Toon.impact(this.x, this.y, proj && proj.crit ? 1.5 : 0.8, proj && proj.crit ? '#ffe48f' : '#ffffff');
      if (this.scars.length < 10) {
        const a = rand(0, TAU), r = rand(0, this.radius * 0.8);
        this.scars.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, s: randi(1, 3) });
      }
      // crew gets hurt: a little blood
      if (Math.random() < 0.6) G.particles.blood(this.x, this.y, 0.4, proj ? Math.atan2(proj.vy, proj.vx) : null);
      G.particles.text(this.x + rand(-6, 6), this.y - this.radius - 4, Math.round(dmg) + '', proj && proj.crit ? '#ffe48f' : '#fff', proj && proj.crit ? 9 : 7);
      Audio_.hit(); G.stats.damageDealt += dmg;
    }
    if (this.hp <= 0) this.die();
  }
  die(silentBoom = false) {
    if (this.dead) return; this.dead = true; this.wake.dead = true;
    const c = this.cfg, r = this.radius;
    if (!silentBoom) {
      Toon.burst(this.x, this.y, 1 + r / 22); Toon.shock(this.x, this.y, r * 3.4, 0.5);
      // the hull comes apart into planks that tumble and float
      G.particles.debris(this.x, this.y, Math.round(r * 1.6), ['#b57d3f', '#8f5c2c', '#5c3a1c', '#d6a05e']);
      for (let i = 0; i < 3; i++) Toon.puff(this.x + rand(-r, r), this.y + rand(-r, r), 2, '#d8e4ee');
    }
    if (!silentBoom) G.particles.explode(this.x, this.y, r * 2.2, { debris: Math.round(r * 1.2), oil: 0.6 + r / 15, debrisColors: this.type === 'gunboat' || this.type === 'harpooner' ? ['#7d858f', '#4a515a', '#aeb6c1'] : undefined });
    G.particles.blood(this.x, this.y, 0.8 + r / 22);
    // the crew goes with the boat
    if (typeof Gore !== 'undefined') { Gore.burst(this.x, this.y, 1.1 + r / 14, rand(0, TAU)); if (r > 18) Gore.burst(this.x + rand(-r, r) * 0.5, this.y + rand(-r, r) * 0.5, 0.8, rand(0, TAU)); }
    G.shake(Math.min(14, 4 + r / 3));
    G.wrecks.push(new Wreck(this.sprite, this.x, this.y, this.angle, r));
    if (this.type === 'dynaboat') { // chain reaction
      G.particles.explode(this.x, this.y, 70, { water: true });
      for (const e of G.enemies) if (!e.dead && e !== this && dist(this.x, this.y, e.x, e.y) < 70 + e.radius) e.hit(40, 0, 0, null);
      if (dist(this.x, this.y, G.player.x, G.player.y) < 70) G.player.damage(18, this.x, this.y);
    }
    // scrap drops
    const mult = G.player.stats.scrapMult;
    for (const k in c.drops) { let n = Math.round(c.drops[k] * mult * rand(0.8, 1.3)); if (Math.random() < (c.drops[k] * mult) % 1) n++; for (let i = 0; i < n; i++) G.pickups.push(new Pickup(this.x, this.y, k)); }
    G.stats.kills++; G.onEnemyKilled(this);
  }
  render(ctx, cam, t) {
    const sx = this.x - cam.x, sy = this.y - cam.y; if (sx < -60 || sy < -60 || sx > 700 || sy > 420) return;
    const bob = Math.sin(t * 3 + this.bob) * 1;
    const spr = this.flash > 0 ? this.hurtSprite : this.sprite;
    // heel into turns, and list further as the hull fills with water
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy + bob));
    ctx.rotate(this.angle);
    const hk2 = this.hp / this.maxHp;
    ctx.scale(1, 1 - (1 - hk2) * 0.14);
    ctx.drawImage(spr.c, -spr.ax, -spr.ay);
    // scorched holes where it has been hit
    if (this.flash <= 0) for (const sc of this.scars) {
      ctx.fillStyle = '#14141c'; ctx.fillRect(Math.round(sc.x), Math.round(sc.y), sc.s, sc.s);
      if (sc.s > 1) { ctx.fillStyle = '#3a3038'; ctx.fillRect(Math.round(sc.x), Math.round(sc.y) - 1, sc.s, 1); }
    }
    ctx.restore();
    if (this.burn > 0) { ctx.fillStyle = Math.floor(t * 10) % 2 ? '#ff9a3c' : '#ffe48f'; ctx.fillRect(Math.round(sx) - 2 + rand(-3, 3), Math.round(sy) - 6 + rand(-3, 3), 3, 3); }
    if (this.cfg.big || this.hp < this.maxHp) {
      const w = this.radius * 2, k = clamp(this.hp / this.maxHp, 0, 1);
      ctx.fillStyle = '#14141c'; ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - this.radius - 8), w, 3);
      ctx.fillStyle = k > 0.5 ? '#6fd88e' : k > 0.25 ? '#ffe48f' : '#ff6161'; ctx.fillRect(Math.round(sx - w / 2) + 1, Math.round(sy - this.radius - 8) + 1, Math.round((w - 2) * k), 1);
    }
  }
}

// ============================ FISHERMAN on the pier ======================
class Fisherman {
  constructor(x, y) { this.x = x; this.y = y; this.alive = true; this.t = 0; this.deadT = 0; this.fallVy = 0; this.fallX = x; this.fallY = y; this.rot = 0; this.sunk = false; }
  shot(proj) {
    if (!this.alive) return; this.alive = false; this.deadT = 0;
    G.particles.blood(this.x, this.y - 10, 2.5, Math.atan2(proj.vy, proj.vx));
    G.particles.sparks(this.x, this.y - 10, 8); G.shake(6); Audio_.hurt();
    // Gore takes a HEIGHT as its last argument, not a screen offset, so the
    // blood pools at his feet on the pier rather than behind him.
    if (typeof Gore !== 'undefined') { const a = Math.atan2(proj.vy, proj.vx); Gore.burst(this.x, this.y, 2.2, a, 12); Gore.spray(this.x, this.y, a, 2.4, 12); Gore.mist(this.x, this.y, 8, 12); }
    Toon.impact(this.x, this.y - 12, 1.8, '#ff6161');
    this.fallVx = Math.cos(Math.atan2(proj.vy, proj.vx)) * 40; this.fallVy = -60; this.fallZ = 0;
    G.onFishermanShot();
  }
  update(dt) {
    this.t += dt;
    if (!this.alive && !this.sunk) {
      this.deadT += dt; this.fallVy += 220 * dt; this.fallY += this.fallVy * dt; this.fallX += this.fallVx * dt; this.rot += dt * 4;
      if (this.fallY > G.ocean.shoreY + 26) { this.sunk = true; G.particles.splash(this.fallX, this.fallY, 2.2); G.particles.blood(this.fallX, this.fallY, 3); G.ocean.splatBlood(this.fallX, this.fallY, 4, 24); Audio_.splash(1.5); }
      if (Math.random() < 0.6) G.particles.blood(this.fallX, this.fallY - 10, 0.15);
    }
  }
  render(ctx, cam, t) {
    if (this.sunk) return;
    if (this.alive) {
      const sx = this.x - cam.x, sy = this.y - cam.y + Math.sin(t * 2) * 0.5;
      drawSprite(ctx, SP.fisherman, sx, sy);
      // fishing rod
      ctx.strokeStyle = '#5c3a1c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(sx + 5), Math.round(sy - 10)); ctx.lineTo(Math.round(sx + 16), Math.round(sy - 24)); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(Math.round(sx + 16), Math.round(sy - 24)); ctx.lineTo(Math.round(sx + 18), Math.round(sy + 12 + Math.sin(t * 3) * 2)); ctx.stroke();
    } else drawSprite(ctx, SP.fishermanDead, this.fallX - cam.x, this.fallY - cam.y, this.rot);
  }
}
