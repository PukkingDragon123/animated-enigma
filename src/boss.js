// ---- BOSS: The Village Chief, riding a shark -----------------------------
class Boss {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.angle = 0; this.radius = 26;
    this.maxHp = 1500; this.hp = this.maxHp; this.phase = 1; this.dead = false; this.name = 'VILLAGE CHIEF';
    this.state = 'enter'; this.stateT = 0; this.spearT = 1.5; this.flash = 0; this.orbitDir = 1; this.circleDur = 3;
    this.chargeDir = 0; this.chargeT = 0; this.chargeCount = 0; this.stunDur = 3; this.whirlT = 0; this.summonT = 0; this.volleyT = 0; this.bleedT = 0;
    this.wake = G.ocean.newWake(this, 16); this.sweep = null; this.bob = 0; this.roarT = 0; this.intro = 2.5; this.wasStunnedHits = 0;
  }
  get stunned() { return this.state === 'stunned'; }
  get charging() { return this.state === 'charge'; }
  setState(s) { this.state = s; this.stateT = 0; }
  update(dt, t) {
    if (this.dead) return;
    const p = G.player; this.stateT += dt; this.flash -= dt; this.intro -= dt;
    const d = dist(this.x, this.y, p.x, p.y), toP = angleTo(this.x, this.y, p.x, p.y);
    const p2 = this.phase === 2;
    let desired = this.angle, speed = 0;
    switch (this.state) {
      case 'enter': desired = toP; speed = 200; if (this.stateT > 1.6 || d < 260) this.setState('circle'); break;
      case 'circle': {
        const r = 240;
        if (d > r + 60) desired = toP; else if (d < r - 60) desired = toP + Math.PI; else desired = toP + Math.PI / 2 * this.orbitDir;
        speed = p2 ? 190 : 150;
        this.spearT -= dt;
        if (this.spearT <= 0) { this.spearT = p2 ? 1.1 : 1.6; this.throwSpear(toP, p); }
        if (p2) {
          this.whirlT -= dt; if (this.whirlT <= 0) { this.whirlT = 7; this.spawnWhirlpool(p); }
          this.volleyT -= dt; if (this.volleyT <= 0) { this.volleyT = 5.5; this.volley(toP); }
        }
        if (this.stateT > this.circleDur) { this.setState('windup'); this.circleDur = rand(2.2, 3.6); this.chargeCount = 0; }
        break;
      }
      case 'windup': {
        speed = 0; desired = toP; this.vx *= Math.pow(0.05, dt); this.vy *= Math.pow(0.05, dt);
        this.angle = angleLerp(this.angle, toP + Math.sin(this.stateT * 40) * 0.08, Math.min(1, dt * 6));
        if (Math.random() < 0.7) G.particles.spray(this.x - Math.cos(this.angle) * 30, this.y - Math.sin(this.angle) * 30, this.angle + Math.PI, 2, 90);
        G.ocean.addFoam(this.x - Math.cos(this.angle) * 28, this.y - Math.sin(this.angle) * 28, 0.3);
        if (p.stats.rockSense) for (const r of G.rocks) r.glow = 1;
        const wind = this.chargeCount > 0 ? 0.45 : (p2 ? 0.7 : 1.0);
        if (this.stateT >= wind) { this.chargeDir = toP; this.angle = toP; this.setState('charge'); this.chargeT = 0; Audio_.roar(); G.shake(5); G.particles.splash(this.x, this.y, 2); }
        break;
      }
      case 'charge': {
        this.chargeT += dt;
        if (p2 && this.chargeT < 0.35) this.chargeDir = angleLerp(this.chargeDir, toP, dt * 2.5); // phase 2 tracks briefly
        desired = this.chargeDir; this.angle = this.chargeDir;
        speed = p2 ? 640 : 560;
        // heavy spray & foam
        G.particles.spray(this.x + Math.cos(this.angle) * 30, this.y + Math.sin(this.angle) * 30, this.angle + 1.2, 2, 160);
        G.particles.spray(this.x + Math.cos(this.angle) * 30, this.y + Math.sin(this.angle) * 30, this.angle - 1.2, 2, 160);
        G.ocean.addFoam(this.x, this.y, 0.5);
        if (p2 && Math.random() < 0.5) G.particles.blood(this.x - Math.cos(this.angle) * 20, this.y - Math.sin(this.angle) * 20, 0.2);
        // hit player
        if (!p.dead && !p.diving && dist(this.x, this.y, p.x, p.y) < this.radius + 10) {
          if (p.rolling) { /* rolled through */ }
          else if (p.invuln <= 0) { p.damage(p2 ? 38 : 30, this.x, this.y); p.vx += Math.cos(this.angle) * 400; p.vy += Math.sin(this.angle) * 400; G.particles.splash(p.x, p.y, 2.5); }
        }
        // crash into rocks?
        for (const r of G.rocks) if (dist(this.x, this.y, r.x, r.y) < r.r + this.radius - 4) { this.crash(r); break; }
        if (this.state !== 'charge') break;
        // bounds
        const nx = this.x + Math.cos(this.angle) * 40, ny = this.y + Math.sin(this.angle) * 40;
        if (nx < 20 || nx > G.ocean.W - 20 || ny < G.ocean.shoreY + 20 || ny > G.ocean.H - 20 || this.chargeT > 1.6) {
          if (p2 && this.chargeCount === 0) { this.chargeCount = 1; this.setState('windup'); }
          else this.setState('circle');
        }
        break;
      }
      case 'stunned': {
        speed = 0; this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
        this.angle += Math.sin(this.stateT * 6) * dt * 0.5;
        if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-20, 20), this.y + rand(-10, 10), 1);
        if (p.stats.rockSense) for (const r of G.rocks) r.glow = 0;
        if (this.stateT >= this.stunDur) { if (p2) this.tailSweep(); this.setState('circle'); this.orbitDir *= -1; }
        break;
      }
      case 'enrage': {
        speed = 0; this.vx *= Math.pow(0.05, dt); this.vy *= Math.pow(0.05, dt);
        this.angle += dt * 6;
        if (Math.random() < 0.8) G.particles.blood(this.x + rand(-20, 20), this.y + rand(-10, 10), 0.4);
        G.ocean.addFoam(this.x + rand(-30, 30), this.y + rand(-20, 20), 0.3);
        if (this.stateT > 1.6) { this.setState('circle'); this.summon(); this.whirlT = 2; this.volleyT = 3; }
        break;
      }
    }
    // steering
    if (this.state !== 'charge' && this.state !== 'windup' && this.state !== 'stunned' && this.state !== 'enrage') this.angle = angleLerp(this.angle, desired, Math.min(1, dt * (p2 ? 2.6 : 2)));
    if (speed > 0) { this.vx = lerp(this.vx, Math.cos(this.angle) * speed, Math.min(1, dt * (this.state === 'charge' ? 12 : 3))); this.vy = lerp(this.vy, Math.sin(this.angle) * speed, Math.min(1, dt * (this.state === 'charge' ? 12 : 3))); }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, 30, G.ocean.W - 30); this.y = clamp(this.y, G.ocean.shoreY + 20, G.ocean.H - 30);
    // rocks (non-charging): slide around
    if (this.state !== 'charge') for (const r of G.rocks) { const dr = dist(this.x, this.y, r.x, r.y); if (dr < r.r + this.radius) { const a = angleTo(r.x, r.y, this.x, this.y); this.x = r.x + Math.cos(a) * (r.r + this.radius); this.y = r.y + Math.sin(a) * (r.r + this.radius); } }
    // wake
    const spd = Math.hypot(this.vx, this.vy);
    const stx = this.x - Math.cos(this.angle) * 30, sty = this.y - Math.sin(this.angle) * 30;
    const last = this.wake.pts[this.wake.pts.length - 1];
    if (spd > 30 && (!last || dist(last.x, last.y, stx, sty) > 5)) { this.wake.pts.push({ x: stx, y: sty, t }); G.ocean.addFoam(stx, sty, 0.1 + spd / 2000); }
    // fin cuts the water: ripples
    if (spd > 60 && Math.random() < 0.3) G.ocean.ripple(this.x, this.y, 30, 60, 0.4);
    // phase 2 bleeding trail
    if (p2) { this.bleedT -= dt; if (this.bleedT <= 0) { this.bleedT = 0.25; G.ocean.addBlood(this.x + rand(-8, 8), this.y + rand(-8, 8), 0.25); } }
    // sweep shockwave
    if (this.sweep) {
      this.sweep.r += dt * 260; this.sweep.life -= dt;
      const dsw = dist(this.sweep.x, this.sweep.y, p.x, p.y);
      if (!this.sweep.hit && Math.abs(dsw - this.sweep.r) < 14 && !p.rolling && !p.diving) { this.sweep.hit = true; p.damage(20, this.sweep.x, this.sweep.y); }
      if (this.sweep.life <= 0) this.sweep = null;
    }
    // ram the player while circling (weaker)
    if (!p.dead && !p.diving && !p.rolling && this.state === 'circle' && dist(this.x, this.y, p.x, p.y) < this.radius + 10 && p.invuln <= 0) p.damage(12, this.x, this.y);
  }
  throwSpear(toP, p) {
    const lead = dist(this.x, this.y, p.x, p.y) / 380;
    const a = angleTo(this.x, this.y, p.x + p.vx * lead, p.y + p.vy * lead) + rand(-0.05, 0.05);
    G.projectiles.push(new Projectile({ x: this.x + Math.cos(a) * 10, y: this.y + Math.sin(a) * 10, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, life: 1.6, dmg: 14, owner: 'enemy', sprite: SP.spear, size: 4, trail: true, knock: 0 }));
    Audio_.shot('harpoon');
  }
  volley(toP) {
    for (let i = -2; i <= 2; i++) { const a = toP + i * 0.22; G.projectiles.push(new Projectile({ x: this.x, y: this.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, life: 1.8, dmg: 12, owner: 'enemy', sprite: SP.spear, size: 4, trail: true, knock: 0 })); }
    G.particles.text(this.x, this.y - 40, 'SPEAR VOLLEY', '#ff6161', 8); Audio_.shot('harpoon');
  }
  spawnWhirlpool(p) {
    const x = clamp(p.x + rand(-40, 40), 100, G.ocean.W - 100), y = clamp(p.y + rand(-40, 40), G.ocean.shoreY + 100, G.ocean.H - 100);
    G.ocean.currents.push({ type: 'whirl', x, y, r: 110, s: 150, life: 6 });
    G.particles.splash(x, y, 2); G.ocean.ripple(x, y, 110, 200, 0.8); Audio_.splash(2);
    G.particles.text(x, y - 30, 'WHIRLPOOL!', '#8ac6ff', 8);
  }
  summon() {
    G.banner('THE CHIEF CALLS FOR BACKUP', '#ff6161', 1.5);
    for (let i = 0; i < 3; i++) { const a = rand(0, TAU); G.spawnEnemy(i < 2 ? 'jetski' : 'dinghy', G.player.x + Math.cos(a) * 420, G.player.y + Math.sin(a) * 420); }
  }
  tailSweep() {
    this.sweep = { x: this.x, y: this.y, r: 20, life: 0.7, hit: false };
    G.particles.splash(this.x, this.y, 3); G.ocean.ripple(this.x, this.y, 180, 300, 1); G.shake(8); Audio_.splash(2.5);
    G.particles.text(this.x, this.y - 40, 'TAIL SWEEP!', '#ffe48f', 9);
  }
  crash(rock) {
    this.setState('stunned');
    this.stunDur = (this.phase === 2 ? 2.4 : 3.2) + (G.player.stats.rockSense ? 1.5 : 0);
    this.vx *= -0.2; this.vy *= -0.2;
    const a = angleTo(rock.x, rock.y, this.x, this.y); this.x = rock.x + Math.cos(a) * (rock.r + this.radius); this.y = rock.y + Math.sin(a) * (rock.r + this.radius);
    G.particles.splash(this.x, this.y, 4); G.particles.debris(this.x, this.y, 14, ['#7c818b', '#5e636d', '#9a9ea8']); G.particles.sparks(this.x, this.y, 14);
    G.particles.blood(this.x, this.y, 2); G.shake(16); Audio_.stun(); G.ocean.ripple(this.x, this.y, 120, 280, 1);
    Toon.burst(this.x, this.y, 3.2); Toon.shock(this.x, this.y, 150, 0.6);
    for (let i = 0; i < 5; i++) Toon.emote(this.x + rand(-24, 24), this.y - 30, 'star');
    G.banner('STUNNED! HIT HIM NOW!', '#ffe48f', 1.4); G.particles.text(this.x, this.y - 40, 'CRASH!', '#ffe48f', 12);
    G.stats.bossCrashes++;
    this.hp -= 40; // the rock itself hurts
  }
  hit(dmg, kx, ky, proj) {
    if (this.dead || this.state === 'enter' || this.state === 'enrage') return;
    let mult = this.stunned ? 2.5 : this.charging ? 0.35 : 0.5;
    const real = dmg * mult;
    this.hp -= real; this.flash = 0.08; G.stats.damageDealt += real;
    G.particles.sparks(this.x, this.y, 3); if (Math.random() < 0.7) G.particles.blood(this.x, this.y, 0.4);
    Toon.impact(this.x, this.y, this.stunned ? 1.6 : 0.7, this.stunned ? '#ffe48f' : '#ffffff');
    G.particles.text(this.x + rand(-10, 10), this.y - 30, Math.round(real) + (this.stunned ? '!' : ''), this.stunned ? '#ffe48f' : proj && proj.crit ? '#ffe48f' : '#c8d0d8', this.stunned ? 9 : 7);
    Audio_.hit();
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2; this.setState('enrage'); Audio_.roar(); G.shake(14);
      G.banner('PHASE 2: BLOOD FRENZY', '#ff6161', 2.2);
      G.particles.splash(this.x, this.y, 4); G.ocean.ripple(this.x, this.y, 220, 320, 1); G.ocean.splatBlood(this.x, this.y, 6, 40);
      for (const pr of G.projectiles) if (pr.owner === 'player') pr.dead = true;
      const p = G.player, a = angleTo(this.x, this.y, p.x, p.y); p.vx += Math.cos(a) * 350; p.vy += Math.sin(a) * 350;
    }
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true; this.wake.dead = true;
    G.particles.explode(this.x, this.y, 90, { debris: 30, oil: 2, debrisColors: ['#b57d3f', '#5b6f8c', '#f2c744'] });
    G.particles.blood(this.x, this.y, 8); G.ocean.splatBlood(this.x, this.y, 14, 60); G.shake(24);
    Toon.burst(this.x, this.y, 5); Toon.shock(this.x, this.y, 260, 0.9);
    for (let i = 0; i < 3; i++) setTimeout(() => { if (G) { G.particles.explode(this.x + rand(-40, 40), this.y + rand(-30, 30), 50); G.particles.blood(this.x + rand(-30, 30), this.y + rand(-30, 30), 3); } }, 250 + i * 300);
    const drops = { metal: 14, wood: 12, fuel: 10, powder: 10, tech: 12 };
    for (const k in drops) for (let i = 0; i < drops[k]; i++) G.pickups.push(new Pickup(this.x, this.y, k));
    G.stats.kills++; G.onBossKilled();
  }
  render(ctx, cam, t) {
    if (this.dead) return;
    const sx = this.x - cam.x, sy = this.y - cam.y;
    const p2 = this.phase === 2;
    // telegraph line during windup
    if (this.state === 'windup') {
      const p = G.player, a = angleTo(this.x, this.y, p.x, p.y);
      ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 60;
      ctx.strokeStyle = `rgba(255,${p2 ? 80 : 200},60,${(0.4 + Math.sin(t * 20) * 0.2).toFixed(2)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(Math.round(sx), Math.round(sy)); ctx.lineTo(Math.round(sx + Math.cos(a) * 900), Math.round(sy + Math.sin(a) * 900)); ctx.stroke();
      ctx.setLineDash([]);
    }
    const bob = Math.sin(t * 2 + 1) * 1.5;
    const hurtF = this.flash > 0 || (this.stunned && Math.floor(t * 8) % 2 === 0);
    const spr = hurtF ? (p2 ? CH.sharkRageHurt : CH.sharkHurt) : (p2 ? CH.sharkRage : CH.shark);
    const thrash = this.state === 'windup' ? Math.sin(t * 40) * 0.06 : 0;
    const spd = Math.hypot(this.vx, this.vy);
    const wig = Math.sin(t * (8 + spd / 40)) * Math.min(0.12, spd / 3000);
    const ang = this.angle + thrash + wig;
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy + bob));
    ctx.rotate(ang);
    // the shark lengthens as it lunges
    const lunge = this.state === 'charge' ? 1.10 : 1;
    ctx.scale(lunge, 2 - lunge);
    ctx.drawImage(spr.c, -spr.ax, -spr.ay);
    // the Chief rides just behind the dorsal, leaning with the turn
    const chief = hurtF ? CH.chiefHurt : CH.chief;
    ctx.save();
    ctx.translate(6, 0);
    ctx.rotate(this.stunned ? Math.sin(t * 7) * 0.5 : -wig * 2.2);
    if (this.stunned) ctx.translate(0, Math.sin(t * 9) * 2);
    ctx.drawImage(chief.c, -chief.ax, -chief.ay);
    // his spear, raised in windup and levelled in the charge
    const raise = this.state === 'windup' ? Math.sin(t * 26) * 0.35 - 0.9 : this.charging ? 0.05 : -0.35;
    ctx.save(); ctx.translate(2, -2); ctx.rotate(raise);
    ctx.drawImage(SP.spear.c, -4, -SP.spear.ay);
    ctx.restore();
    ctx.restore();
    ctx.restore();
    if (this.stunned) {
      for (let i = 0; i < 3; i++) { const a = t * 5 + i * TAU / 3; drawSprite(ctx, SP.star, sx + Math.cos(a) * 22, sy - 26 + Math.sin(a) * 6); }
    }
    if (this.state === 'enrage') { ctx.strokeStyle = `rgba(255,60,40,${(0.6 + Math.sin(t * 30) * 0.3).toFixed(2)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(Math.round(sx), Math.round(sy), 40 + this.stateT * 60, 30 + this.stateT * 45, 0, 0, TAU); ctx.stroke(); }
    if (this.sweep) { ctx.strokeStyle = `rgba(230,246,255,${Math.min(1, this.sweep.life * 2).toFixed(2)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(Math.round(this.sweep.x - cam.x), Math.round(this.sweep.y - cam.y), Math.round(this.sweep.r), Math.round(this.sweep.r * 0.8), 0, 0, TAU); ctx.stroke(); }
  }
}
