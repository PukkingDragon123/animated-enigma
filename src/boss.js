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
    this.x = clamp(this.x, 30, G.ocean.W - 30); this.y = clamp(this.y, WATER_TOP + 10, G.ocean.H - 30);
    // rocks (non-charging): slide around
    if (this.state !== 'charge') for (const r of G.rocks) { const dr = dist(this.x, this.y, r.x, r.y); if (dr < r.r + this.radius) { const a = angleTo(r.x, r.y, this.x, this.y); this.x = r.x + Math.cos(a) * (r.r + this.radius); this.y = r.y + Math.sin(a) * (r.r + this.radius); } }
    // wake
    const spd = Math.hypot(this.vx, this.vy);
    if (G.ocean.disturb && spd > 20) G.ocean.disturb(this.x, this.y, Math.min(6, spd / 70), this.vx, this.vy);
    const stx = this.x - Math.cos(this.angle) * 30, sty = this.y - Math.sin(this.angle) * 30;
    const last = this.wake.pts[this.wake.pts.length - 1];
    if (spd > 30 && (!last || dist(last.x, last.y, stx, sty) > 5)) { this.wake.pts.push({ x: stx, y: sty, t }); G.ocean.addFoam(stx, sty, 0.1 + spd / 2000); }
    // fin cuts the water: ripples
    if (spd > 60 && Math.random() < 0.3) G.ocean.ripple(this.x, this.y, 30, 60, 0.4);
    // phase 2 bleeding trail
    if (p2) { this.bleedT -= dt; if (this.bleedT <= 0) { this.bleedT = 0.3; G.ocean.addBlood(this.x + rand(-8, 8), this.y + rand(-8, 8), 0.10); } }
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
    for (let i = 0; i < 3; i++) { const a = rand(0, TAU); G.spawnEnemy(i < 2 ? 'jetski' : 'dinghy', G.player.x + Math.cos(a) * 310, G.player.y + Math.sin(a) * 310); }
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
    G.particles.blood(this.x, this.y, 4); G.ocean.splatBlood(this.x, this.y, 5, 70); G.shake(24);
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

// ===========================================================================
//  MINI BOSSES — three named mid-run encounters that sit between the ordinary
//  boats (22-280 hp) and the Chief (1500 hp). Each one has ONE silhouette you
//  can name from overhead, ONE threat, and ONE counter you can learn:
//
//    IRONJAW      harpoon barge   anchors, spears you, reels you in   -> ROLL to snap the chain,
//                                                                        then gut it while it is rooted
//    THE DRAGNET  net hauler      swings a weighted net in a wide arc -> ROLL through / stand outside,
//                                                                        then punish the boom recovery
//    EMBER QUEEN  fuel barge      lays burning oil across the water   -> stay off the slick, and shoot
//                                                                        the tank while it is pressurised
// ===========================================================================
const MINIBOSS_TYPES = {
  harpoonBarge: {
    name: 'IRONJAW', sub: 'Harpoon barge. ROLL to snap the chain',
    hp: 520, radius: 24, speed: 62, turn: 1.0, wake: 14, color: '#ffb15c',
    drops: { metal: 12, wood: 7, tech: 5, powder: 4 },
  },
  netHauler: {
    name: 'THE DRAGNET', sub: 'Net hauler. ROLL through the sweep',
    hp: 460, radius: 26, speed: 78, turn: 1.5, wake: 15, color: '#8ac6ff',
    drops: { wood: 12, tech: 7, metal: 6, fuel: 3 },
  },
  fuelBarge: {
    name: 'EMBER QUEEN', sub: 'Fuel barge. Keep off the burning slick',
    hp: 400, radius: 22, speed: 104, turn: 2.0, wake: 13, color: '#ff9a3c',
    drops: { fuel: 12, powder: 9, metal: 5, tech: 4 },
  },
};

// ---------------------------------------------------------------------------
//  ART — hard-edged rasterizers only. Built once, on the first spawn (the
//  character atlas is assembled inside Game's constructor, so load time is too
//  early to touch it). No gradients, no fill() on a path, no antialiasing.
// ---------------------------------------------------------------------------
let MB_ART = null;

// a hull mask from a half-beam profile, shaded in hard bands: sunlit rail on
// the north gunwale, shadow on the south, plated deck between them
function mbHull(o) {
  const L = o.len, B = o.beam, pad = o.pad || 7;
  const W = L + pad * 2, H = B * 2 + pad * 2, cx = pad, cy = Math.round(H / 2);
  const c = newCan(W, H), ctx = c.getContext('2d');
  const col = o.col;
  const m = new Uint8Array(W * H), top = new Int16Array(W), bot = new Int16Array(W);
  for (let x = 0; x < W; x++) { top[x] = -1; bot[x] = -1; }
  for (let x = cx; x <= cx + L; x++) {
    const hw = B * o.prof(clamp((x - cx) / L, 0, 1));
    if (hw < 0.6) continue;
    const y0 = Math.round(cy - hw), y1 = Math.round(cy + hw);
    top[x] = y0; bot[x] = y1;
    for (let y = y0; y <= y1; y++) m[y * W + x] = 1;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!m[i]) continue;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
      !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W];
    if (edge) { px(ctx, col.out, x, y); continue; }
    const dT = y - top[x], dB = bot[x] - y;
    let k;
    if (dT <= 1) k = col.hullL;
    else if (dB <= 1) k = col.hullDD;
    else if (dT <= 2) k = col.hull;
    else if (dB <= 2) k = col.hullD;
    else k = ((x - cx) % 7 === 0) ? col.deckD : col.deck;
    px(ctx, k, x, y);
  }
  return { c, ctx, W, H, cx, cy, L, B, col, half: x => B * o.prof(clamp((x - cx) / L, 0, 1)) };
}

// a rivetted steel box (wheelhouse, winch housing, tank cradle)
function mbBox(ctx, x0, y0, w, h, col) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const e = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
    px(ctx, e ? col.out : (y < y0 + 2 ? col.lit : y > y0 + h - 3 ? col.dark : col.mid), x, y);
  }
}
// a drum / cylinder lying across the beam: hard hoops, no gradient
function mbDrum(ctx, x0, y0, w, h, col, hoop) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const e = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
    if (e) { px(ctx, col.out, x, y); continue; }
    const dT = y - y0;
    let k = dT < 2 ? col.lit : dT < h * 0.45 ? col.mid : dT < h - 2 ? col.dark : col.mid;
    if (hoop && ((x - x0) % hoop === 0)) k = col.out2 || col.dark;
    px(ctx, k, x, y);
  }
}
// dithered net / mesh patch
function mbMesh(ctx, x0, y0, w, h, col, step) {
  const s = step || 2;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
    if (((x + y) % s) === 0) px(ctx, col, x, y);
}
// rust weeping down the side of a hull
function mbRust(ctx, hull, cols, seed) {
  const rng = new SeededRandom(seed);
  for (let i = 0; i < 26; i++) {
    const x = Math.round(rng.range(hull.cx + 3, hull.cx + hull.L - 3));
    const hw = hull.half(x); if (hw < 2) continue;
    const side = rng.next() < 0.5 ? -1 : 1;
    const y = Math.round(hull.cy + side * (hw - rng.range(1.2, 2.6)));
    const len = rng.int(1, 3);
    for (let q = 0; q < len; q++) px(ctx, q === 0 ? cols[1] : cols[0], x, y + q * side);
  }
}

// ---- IRONJAW: a long flat harbour barge, blunt raked bow, a chain winch
// amidships and two harpoon tubes over the bow. Reads as a slab from above.
function mbBuildIronjaw() {
  const col = {
    out: '#1a1220',
    hullL: '#c09159', hull: '#96693a', hullD: '#653f1f', hullDD: '#3a2413',
    deck: '#5b6069', deckD: '#3e434c',
  };
  const h = mbHull({
    len: 60, beam: 14, pad: 8, col,
    prof: u => u < 0.08 ? 0.88 : u < 0.70 ? 0.88 + 0.12 * ((u - 0.08) / 0.62)
      : 1 - 0.62 * Math.pow((u - 0.70) / 0.30, 1.35),
  });
  const ctx = h.ctx, cx = h.cx, cy = h.cy, L = h.L;
  const steel = { out: '#1a1220', out2: '#2a2f38', lit: '#aab4c2', mid: '#6d7684', dark: '#414954' };
  const brass = { out: '#1a1220', lit: '#f8dc86', mid: '#e0a838', dark: '#a87a1e' };
  mbRust(h.ctx, h, ['#8c4520', '#c9793d'], 20260920);
  // ---- transom and wheelhouse, aft
  mbBox(ctx, cx + 3, cy - 7, 11, 15, steel);
  px(ctx, '#ffd27a', cx + 11, cy - 4, 2, 8);              // lit window strip
  px(ctx, '#1a1220', cx + 13, cy - 4, 1, 8);
  // ---- the chain winch: a fat drum across the beam, wound with chain
  const dx0 = cx + Math.round(L * 0.34);
  mbDrum(ctx, dx0, cy - 11, 14, 23, steel, 0);
  mbMesh(ctx, dx0 + 2, cy - 9, 10, 19, '#99a3b1', 3);
  for (const q of [3, 7, 11]) { px(ctx, '#2a2f38', dx0 + q, cy - 10, 1, 21); px(ctx, '#c3cedd', dx0 + q - 1, cy - 10, 1, 21); }
  px(ctx, '#2a2f38', dx0, cy - 11, 14, 1); px(ctx, '#2a2f38', dx0, cy + 11, 14, 1);
  // gantry rails running forward from the winch to the tubes
  px(ctx, steel.dark, dx0 + 14, cy - 6, Math.round(L * 0.34), 2);
  px(ctx, steel.dark, dx0 + 14, cy + 4, Math.round(L * 0.34), 2);
  px(ctx, steel.lit, dx0 + 14, cy - 6, Math.round(L * 0.34), 1);
  px(ctx, steel.lit, dx0 + 14, cy + 4, Math.round(L * 0.34), 1);
  // ---- twin harpoon tubes over the bow
  for (const s of [-1, 1]) {
    const ty = cy + s * 5, tx = cx + Math.round(L * 0.66), tl = Math.round(L * 0.30);
    px(ctx, '#1a1220', tx, ty - 3, tl + 2, 7);
    px(ctx, steel.lit, tx + 1, ty - 2, tl, 1);
    px(ctx, steel.mid, tx + 1, ty - 1, tl, 2);
    px(ctx, steel.dark, tx + 1, ty + 1, tl, 1);
    px(ctx, '#0d0a12', tx + tl, ty - 2, 2, 5);            // muzzle
    px(ctx, brass.mid, tx + 3, ty - 3, 2, 7);             // brass collar
  }
  // ---- anchor davits at the four corners
  for (const fx of [0.18, 0.56]) for (const s of [-1, 1]) {
    const ax = cx + Math.round(L * fx), hw = h.half(ax);
    const ay = Math.round(cy + s * (hw - 1));
    px(ctx, '#1a1220', ax - 2, ay - 1, 5, 3);
    px(ctx, steel.lit, ax - 1, ay, 3, 1);
    px(ctx, brass.mid, ax, ay + s, 1, 1);
  }
  // ---- bow ram plate
  {
    const bx0 = cx + L - 5;
    for (let x = bx0; x <= cx + L; x++) {
      const hw = h.half(x); if (hw < 1) continue;
      for (let y = Math.round(cy - hw) + 1; y <= Math.round(cy + hw) - 1; y++)
        px(ctx, (y < cy - hw * 0.35) ? '#c3cedd' : (y > cy + hw * 0.35) ? '#414954' : '#8a94a3', x, y);
    }
  }
  // ---- deck clutter: a coil of chain and two crates
  mbMesh(ctx, cx + 18, cy - 4, 8, 9, '#8c9099', 2);
  for (const [bx, by] of [[cx + Math.round(L * 0.52), cy - 9], [cx + Math.round(L * 0.52), cy + 4]])
    mbBox(ctx, bx, by, 6, 6, { out: '#1a1220', lit: '#d6a05e', mid: '#b57d3f', dark: '#5a3818' });
  const hull = spriteFrom(h.c, cx + L / 2, cy);
  // the harpoon head that rides the chain
  const hc = newCan(11, 7), hx = hc.getContext('2d');
  stamp(hx, [
    '....kk.....',
    '.kkkMMk....',
    'kMMMMMMkkk.',
    'kMMMMMMMMMk',
    'kMMMMMMkkk.',
    '.kkkMMk....',
    '....kk.....',
  ], 0, 0, { k: '#1a1220', M: '#aab4c2' });
  px(hx, '#e6eef8', 3, 3, 5, 1);
  return { hull, hurt: tintSprite(hull, '#ffffff', 0.8), head: spriteFrom(hc, 2, 3), r: 24 };
}

// ---- THE DRAGNET: a catamaran net hauler. Two narrow hulls, a bridging deck
// with net drums, an A-frame gantry aft and a swinging boom.
function mbBuildDragnet() {
  const col = {
    out: '#1a1220',
    hullL: '#63b0a1', hull: '#2f7a6d', hullD: '#1c5049', hullDD: '#0f302c',
    deck: '#4b525c', deckD: '#333941',
  };
  const L = 54, B = 5, off = 14, pad = 8;
  const W = L + pad * 2, H = (off + B) * 2 + pad * 2, cx = pad, cy = Math.round(H / 2);
  const c = newCan(W, H), ctx = c.getContext('2d');
  const prof = u => u < 0.10 ? 0.80 : u < 0.62 ? 0.80 + 0.20 * ((u - 0.10) / 0.52)
    : 1 - 0.70 * Math.pow((u - 0.62) / 0.38, 1.3);
  const steel = { out: '#1a1220', out2: '#2a2f38', lit: '#aab4c2', mid: '#6d7684', dark: '#414954' };
  const rustO = { out: '#1a1220', lit: '#ffb15c', mid: '#e6802a', dark: '#96450f' };
  // the bridging deck goes down FIRST so the hulls overlap it
  for (let y = cy - off + 1; y <= cy + off - 1; y++) for (let x = cx + 6; x <= cx + L - 12; x++) {
    const e = y === cy - off + 1 || y === cy + off - 1 || x === cx + 6 || x === cx + L - 12;
    px(ctx, e ? '#1a1220' : ((x % 7 === 0) ? col.deckD : col.deck), x, y);
  }
  // net drums across the deck, and a bundled net between them
  mbDrum(ctx, cx + 12, cy - off + 3, 9, off * 2 - 7, rustO, 3);
  mbDrum(ctx, cx + 26, cy - off + 3, 9, off * 2 - 7, rustO, 3);
  mbMesh(ctx, cx + 22, cy - off + 4, 4, off * 2 - 9, '#dfe8ef', 2);
  mbMesh(ctx, cx + 36, cy - 8, 6, 17, '#dfe8ef', 2);
  // A-frame gantry: two beams from the outer hulls converging aft
  for (const s of [-1, 1]) {
    for (let q = 0; q <= 16; q++) {
      const x = cx + 10 - Math.round(q * 0.42), y = Math.round(cy + s * (off - 1 - q * 0.62));
      px(ctx, '#1a1220', x, y - 1, 3, 4);
      px(ctx, steel.lit, x, y, 3, 1); px(ctx, steel.dark, x, y + 1, 3, 1);
    }
  }
  mbBox(ctx, cx + 1, cy - 4, 8, 9, steel);                 // the boom pivot block
  // the two hulls
  for (const s of [-1, 1]) {
    const hy = cy + s * off;
    for (let x = cx; x <= cx + L; x++) {
      const hw = B * prof(clamp((x - cx) / L, 0, 1)); if (hw < 0.6) continue;
      const y0 = Math.round(hy - hw), y1 = Math.round(hy + hw);
      for (let y = y0; y <= y1; y++) {
        const nx = B * prof(clamp((x + 1 - cx) / L, 0, 1));
        const edge = y === y0 || y === y1 || x === cx || x === cx + L || nx < 0.6;
        px(ctx, edge ? col.out : (y - y0 <= 1 ? col.hullL : y1 - y <= 1 ? col.hullDD : y - y0 <= 2 ? col.hull : col.hullD), x, y);
      }
    }
    // orange fender floats on each bow
    px(ctx, '#1a1220', cx + Math.round(L * 0.80), hy - 3, 6, 7);
    px(ctx, rustO.lit, cx + Math.round(L * 0.80) + 1, hy - 2, 4, 2);
    px(ctx, rustO.mid, cx + Math.round(L * 0.80) + 1, hy, 4, 2);
    px(ctx, rustO.dark, cx + Math.round(L * 0.80) + 1, hy + 2, 4, 1);
  }
  const hull = spriteFrom(c, cx + L / 2, cy);
  // ---- the boom: a steel arm with a weighted net bundle on the end
  const bl = 46, bc = newCan(bl + 6, 22), bx = bc.getContext('2d'), by = 11;
  px(bx, '#1a1220', 2, by - 3, bl, 7);
  px(bx, steel.lit, 3, by - 2, bl - 2, 1);
  px(bx, steel.mid, 3, by - 1, bl - 2, 2);
  px(bx, steel.dark, 3, by + 1, bl - 2, 1);
  for (let q = 8; q < bl - 4; q += 7) px(bx, '#2a2f38', q, by - 2, 1, 5);
  // the net mass, weighted with lead balls
  for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
    const d = Math.hypot(x * 0.82, y);
    if (d > 8) continue;
    const X = bl - 4 + x, Y = by + y;
    if (d > 6.6) { px(bx, '#1a1220', X, Y); continue; }
    px(bx, ((X + Y) & 1) ? '#b8c6cf' : (d > 4 ? '#5d6b72' : '#7f8f94'), X, Y);
  }
  for (const [lx, ly] of [[-4, -4], [3, -2], [-1, 4], [4, 3], [1, 0]]) {
    px(bx, '#1a1220', bl - 5 + lx, by - 1 + ly, 4, 4);
    px(bx, '#5c6168', bl - 4 + lx, by + ly, 2, 2);
    px(bx, '#8c9099', bl - 4 + lx, by + ly, 2, 1);
  }
  const boom = spriteFrom(bc, 3, by);
  return { hull, hurt: tintSprite(hull, '#ffffff', 0.8), boom, boomHot: tintSprite(boom, '#ffd27a', 0.34), r: 26 };
}

// ---- EMBER QUEEN: a squat fuel barge. One fat riveted tank amidships, pipes
// running to a bow nozzle, a flare stack aft. Wide and stubby from above.
function mbBuildEmber() {
  const col = {
    out: '#1a1220',
    hullL: '#8a8577', hull: '#5b5a50', hullD: '#3b3a33', hullDD: '#22221d',
    deck: '#5d5533', deckD: '#403a22',
  };
  const h = mbHull({
    len: 48, beam: 16, pad: 8, col,
    prof: u => u < 0.10 ? 0.92 : u < 0.60 ? 0.92 + 0.08 * ((u - 0.10) / 0.50)
      : 1 - 0.52 * Math.pow((u - 0.60) / 0.40, 1.5),
  });
  const ctx = h.ctx, cx = h.cx, cy = h.cy, L = h.L;
  const steel = { out: '#1a1220', out2: '#2a2f38', lit: '#aab4c2', mid: '#6d7684', dark: '#414954' };
  mbRust(ctx, h, ['#7a3a1a', '#b85f2a'], 770412);
  // hazard chevrons across the after deck
  for (let q = 0; q < 5; q++) {
    const x = cx + 4 + q * 3;
    for (let y = cy - 8; y <= cy + 8; y++) px(ctx, ((y + q * 3) % 6 < 3) ? '#e0a838' : '#1a1220', x, y);
  }
  // ---- the tank: a fat cylinder lying across the beam, hard banded
  const tcx = cx + Math.round(L * 0.48), trx = 13, try_ = 12;
  for (let y = -try_; y <= try_; y++) for (let x = -trx; x <= trx; x++) {
    const d = Math.hypot(x / trx, y / try_);
    if (d > 1) continue;
    const X = tcx + x, Y = cy + y;
    let k;
    if (d > 0.90) k = '#1a1220';
    else if (y < -try_ * 0.55) k = '#d4703f';
    else if (y < -try_ * 0.15) k = '#b8552c';
    else if (y < try_ * 0.35) k = '#96401f';
    else if (y < try_ * 0.72) k = '#6f2716';
    else k = '#4a1a0e';
    if (d <= 0.90 && (x === -5 || x === 5)) k = (y < 0 ? '#8c9099' : '#5c6168');   // hoop straps
    px(ctx, k, X, Y);
  }
  px(ctx, '#1a1220', tcx - 3, cy - 3, 7, 7);               // filler cap
  px(ctx, '#e0a838', tcx - 2, cy - 2, 5, 5);
  px(ctx, '#f8dc86', tcx - 2, cy - 2, 5, 2);
  px(ctx, '#a87a1e', tcx - 2, cy + 1, 5, 2);
  // ---- pipes running forward to a bow nozzle
  for (const s of [-1, 1]) {
    const py = cy + s * 7;
    px(ctx, '#1a1220', tcx + trx - 2, py - 2, Math.round(L * 0.34), 5);
    px(ctx, steel.lit, tcx + trx - 1, py - 1, Math.round(L * 0.34) - 2, 1);
    px(ctx, steel.mid, tcx + trx - 1, py, Math.round(L * 0.34) - 2, 1);
    px(ctx, steel.dark, tcx + trx - 1, py + 1, Math.round(L * 0.34) - 2, 1);
  }
  mbBox(ctx, cx + Math.round(L * 0.86), cy - 5, 6, 11, steel);
  px(ctx, '#0d0a12', cx + Math.round(L * 0.90), cy - 2, 4, 5);
  // ---- flare stack, aft-starboard: a squat tower, its tip drawn live
  const fx = cx + Math.round(L * 0.24), fy = cy - 11;
  px(ctx, '#1a1220', fx - 4, fy - 4, 9, 9);
  px(ctx, steel.mid, fx - 3, fy - 3, 7, 7);
  px(ctx, steel.lit, fx - 3, fy - 3, 7, 2);
  px(ctx, steel.dark, fx - 3, fy + 2, 7, 2);
  px(ctx, '#0d0a12', fx - 2, fy - 2, 5, 5);
  const hull = spriteFrom(h.c, cx + L / 2, cy);
  hull.flare = { x: fx - (cx + L / 2), y: fy - cy };
  hull.tank = { x: tcx - (cx + L / 2), y: 0, r: trx };
  return { hull, hurt: tintSprite(hull, '#ffffff', 0.8), r: 22 };
}

// ---- burning oil: three sizes, one cold frame and three ember frames ------
function mbBuildSlicks() {
  const out = [];
  for (const R of [13, 18, 23]) {
    const D = R * 2 + 3, o = R + 1;
    const rAt = a => R * (0.74 + 0.30 * vnoise(Math.cos(a) * 1.7 + R, Math.sin(a) * 1.7 - R));
    const mask = (x, y) => {
      const dx = x - o, dy = (y - o) / 0.82, d = Math.hypot(dx, dy);
      return d <= rAt(Math.atan2(dy, dx)) ? d / Math.max(0.01, rAt(Math.atan2(dy, dx))) : -1;
    };
    const cold = newCan(D, D), cc = cold.getContext('2d');
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const k = mask(x, y); if (k < 0) continue;
      if (k > 0.84) { if (((x + y) & 1) === 0) px(cc, '#0d141c', x, y); continue; }
      const sh = vnoise(x * 0.3 + R, y * 0.3 - R);
      let col = k > 0.60 ? '#131f2a' : k > 0.32 ? '#1c2b36' : '#24343e';
      if (sh > 0.70 && ((x + y) & 1) === 0) col = '#3d5a4a';        // green sheen
      else if (sh < 0.26 && ((x - y) & 3) === 0) col = '#4a3559';   // violet sheen
      px(cc, col, x, y);
    }
    const frames = [];
    for (let f = 0; f < 3; f++) {
      const hot = newCan(D, D), hc = hot.getContext('2d');
      for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
        const k = mask(x, y); if (k < 0) continue;
        const n = vnoise(x * 0.42 + f * 3.1, y * 0.42 - f * 2.3);
        if (k > 0.88) { if (((x + y + f) & 1) === 0) px(hc, '#8c2a08', x, y); continue; }
        const v = n * 0.75 + (1 - k) * 0.55;
        px(hc, v > 0.86 ? '#fff2c0' : v > 0.70 ? '#ffd27a' : v > 0.54 ? '#ff9a3c' : v > 0.38 ? '#e6802a' : v > 0.24 ? '#a8401a' : '#5b1c0c', x, y);
      }
      frames.push(spriteFrom(hot, o, o));
    }
    out.push({ r: R, cold: spriteFrom(cold, o, o), hot: frames });
  }
  return out;
}

function mbArt() {
  if (MB_ART) return MB_ART;
  MB_ART = {
    harpoonBarge: mbBuildIronjaw(),
    netHauler: mbBuildDragnet(),
    fuelBarge: mbBuildEmber(),
    slicks: mbBuildSlicks(),
  };
  return MB_ART;
}

// ---- hard-edged telegraph primitives (no strokes, no antialiasing) -------
function mbDashLine(ctx, x0, y0, x1, y1, t, c1, c2, w) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const n = Math.min(110, Math.max(2, Math.round(len / 6)));
  for (let q = 1; q < n; q++) {
    const u = q / n + (t * 0.6) % (1 / n);
    if (u > 1) continue;
    ctx.fillStyle = (q & 1) ? c1 : c2;
    ctx.fillRect(Math.round(x0 + dx * u), Math.round(y0 + dy * u), w || 2, 1);
  }
}
function mbRing(ctx, cx, cy, r, col, n, squash, rot, gap) {
  const sq = squash === undefined ? 0.76 : squash;
  ctx.fillStyle = col;
  for (let q = 0; q < n; q++) {
    if (gap && (q % gap) === gap - 1) continue;
    const a = (rot || 0) + q / n * TAU;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * sq), 1, 1);
  }
}
function mbArcDots(ctx, cx, cy, r, a0, a1, col, gap, w) {
  const span = a1 - a0, s = w || 2;
  const n = Math.max(2, Math.round(Math.abs(span) * r / 4));
  ctx.fillStyle = col;
  for (let q = 0; q <= n; q++) {
    if (gap && (q % gap) >= gap - 1) continue;
    const a = a0 + span * q / n;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r) - (s >> 1), Math.round(cy + Math.sin(a) * r) - (s >> 1), s, s);
  }
}
// a landing marker: a ring that closes on the mark, with corner brackets, sized
// to sit OUTSIDE the manatee (who is drawn over anything an enemy paints)
function mbMark(ctx, x, y, k, t, col, col2) {
  const r = Math.round(42 - k * 19), ry = Math.round(r * 0.76);
  ctx.fillStyle = col;
  for (let q = 0; q < 40; q++) {
    if ((q & 3) === 3) continue;
    const a = -t * 2 + q / 40 * TAU;
    ctx.fillRect(Math.round(x + Math.cos(a) * r) - 1, Math.round(y + Math.sin(a) * ry) - 1, 2, 2);
  }
  ctx.fillStyle = col2;
  for (let q = 0; q < 4; q++) {
    const dx = (q & 1) ? 1 : -1, dy = (q & 2) ? 1 : -1;
    const bx = x + dx * (r + 4), by = y + dy * (ry + 4);
    ctx.fillRect(bx - (dx > 0 ? 0 : 5), by - 1, 6, 2);
    ctx.fillRect(bx - 1, by - (dy > 0 ? 0 : 5), 2, 6);
  }
}

// a chunky chain / cable between two points
function mbChain(ctx, x0, y0, x1, y1, slack, c1, c2, w) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const n = Math.max(2, Math.round(len / 4));
  const nx = -dy / len, ny = dx / len, s = w || 2;
  for (let q = 0; q <= n; q++) {
    const u = q / n, sag = Math.sin(u * Math.PI) * (slack || 0);
    ctx.fillStyle = (q & 1) ? c1 : c2;
    ctx.fillRect(Math.round(x0 + dx * u + nx * sag) - (s >> 1), Math.round(y0 + dy * u + ny * sag) - (s >> 1), s, s);
  }
}

// ===========================================================================
//  MiniBoss — drop-in compatible with an entry in G.enemies
// ===========================================================================
class MiniBoss {
  constructor(type, x, y, difficulty = 1) {
    const keys = Object.keys(MINIBOSS_TYPES);
    if (!type || !MINIBOSS_TYPES[type]) type = keys[(Math.random() * keys.length) | 0];
    const c = MINIBOSS_TYPES[type];
    this.type = type; this.mb = c; this.isMiniBoss = true;
    this.art = mbArt(); this.gfx = this.art[type];
    this.diff = difficulty || 1;
    this.name = c.name; this.sub = c.sub; this.color = c.color;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.kx = 0; this.ky = 0;
    this.maxHp = Math.round(c.hp * (1 + (this.diff - 1) * 0.9)); this.hp = this.maxHp;
    this.radius = c.radius; this.speed = c.speed; this.turn = c.turn;
    this.ang = angleTo(x, y, G.player.x, G.player.y); this.angle = this.ang;
    this.dead = false; this.flash = 0; this.burn = 0; this.burnT = 0;
    this.age = 0; this.state = 'enter'; this.stateT = 0;
    this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.bob = rand(0, TAU); this.slot = rand(0, TAU); this.scars = [];
    this.dmgT = 0; this.ramCd = 0; this.slowT = 0; this.list = 0; this.taught = false;
    this.wake = G.ocean.newWake(this, c.wake || 12);
    this.sprite = this.gfx.hull; this.hurtSprite = this.gfx.hurt;
    // ---- per-type kit
    this.harp = null; this.tether = 0; this.anchors = []; this.armDraw = 0;
    this.boomA = this.ang + Math.PI; this.sweepFrom = 0; this.sweepTo = 0; this.sweepHit = false;
    this.castT = rand(3, 5); this.cast = null;
    this.slicks = []; this.slickT = 0; this.ventT = rand(4, 6); this.ventDmg = 0;
    this.can = null; this.canT = rand(3, 5); this.fireTick = 0;
    if (typeof G.particles !== 'undefined') G.particles.text(x, y - this.radius - 12, c.name, c.color, 10);
  }
  get displayName() { return this.name; }
  get hpFrac() { return clamp(this.hp / this.maxHp, 0, 1); }
  // the states in which the hull is wide open: this is the punish window
  get exposed() {
    return this.state === 'reload' || this.state === 'recover' || this.state === 'stagger' || this.state === 'cool';
  }
  setState(s) { this.state = s; this.stateT = 0; }
  say(msg, col) {
    G.particles.text(this.x, this.y - this.radius - 14, msg, col || this.color, 9);
  }
  teach() {
    if (this.taught) return; this.taught = true;
    if (G.banner) G.banner(this.name, this.color, 1.6, this.sub);
  }

  // ---------------------------------------------------------------- update
  update(dt, t) {
    if (this.dead) return;
    const p = G.player;
    this.age += dt; this.stateT += dt; this.flash -= dt; this.ramCd -= dt; this.slowT -= dt;
    // incendiary rounds
    if (this.burn > 0) {
      this.burn -= dt; this.burnT -= dt;
      if (this.burnT <= 0) { this.burnT = 0.5; this.hit((p.stats.burn || 4) * 0.5, 0, 0, null, true); G.particles.fire(this.x, this.y, 2); G.particles.smoke(this.x, this.y, 1); }
    }
    const d = dist(this.x, this.y, p.x, p.y);
    const toP = angleTo(this.x, this.y, p.x, p.y);
    let desired = this.ang, speed = 0;
    if (this.state === 'enter') {
      desired = toP; speed = this.speed * 1.35;
      if (this.stateT > 1.4 || d < 300) this.setState(this.type === 'fuelBarge' ? 'run' : 'cruise');
    } else {
      const r = this.type === 'harpoonBarge' ? this.stepIronjaw(dt, t, d, toP, p)
        : this.type === 'netHauler' ? this.stepDragnet(dt, t, d, toP, p)
          : this.stepEmber(dt, t, d, toP, p);
      desired = r[0]; speed = r[1];
    }
    // ---- steering. this.ang is authoritative; this.angle is the public mirror
    this.ang = angleLerp(this.ang, desired, Math.min(1, this.turn * dt * (this.slowT > 0 ? 0.5 : 1)));
    const sp = speed * (this.slowT > 0 ? 0.55 : 1);
    this.vx = lerp(this.vx, Math.cos(this.ang) * sp, Math.min(1, dt * 2.2));
    this.vy = lerp(this.vy, Math.sin(this.ang) * sp, Math.min(1, dt * 2.2));
    // separation from the ordinary fleet so it never buries a boat
    for (const e of G.enemies) {
      if (e === this || e.dead) continue;
      const de = dist(this.x, this.y, e.x, e.y), min = this.radius + e.radius + 4;
      if (de < min && de > 0.01) { const a = angleTo(e.x, e.y, this.x, this.y); const push = (min - de) * 2.2; this.kx += Math.cos(a) * push; this.ky += Math.sin(a) * push; }
    }
    const f = G.ocean.flow(this.x, this.y);
    this.x += (this.vx + this.kx + f.x * 0.25) * dt;
    this.y += (this.vy + this.ky + f.y * 0.25) * dt;
    this.kx *= Math.pow(0.02, dt); this.ky *= Math.pow(0.02, dt);
    this.x = clamp(this.x, 24, G.ocean.W - 24);
    this.y = clamp(this.y, WATER_TOP + 6, G.ocean.H - 24);
    // rocks: a hull this size shoulders them aside rather than crashing
    for (const r of G.rocks) {
      const dr = dist(this.x, this.y, r.x, r.y);
      if (dr < r.r + this.radius) {
        const a = angleTo(r.x, r.y, this.x, this.y);
        this.x = r.x + Math.cos(a) * (r.r + this.radius); this.y = r.y + Math.sin(a) * (r.r + this.radius);
        if (Math.random() < 0.3) G.particles.spray(this.x, this.y, a, 2, 70);
      }
    }
    // wake, foam, swell
    const spd = Math.hypot(this.vx, this.vy);
    if (G.ocean.disturb && spd > 18) G.ocean.disturb(this.x, this.y, Math.min(6, spd / 45), this.vx, this.vy);
    const stx = this.x - Math.cos(this.ang) * this.radius, sty = this.y - Math.sin(this.ang) * this.radius;
    const last = this.wake.pts[this.wake.pts.length - 1];
    if (spd > 14 && (!last || dist(last.x, last.y, stx, sty) > 5)) { this.wake.pts.push({ x: stx, y: sty, t }); G.ocean.addFoam(stx, sty, 0.08 + spd / 2200); }
    // battle damage
    const hk = this.hpFrac;
    if (hk < 0.6) {
      this.dmgT -= dt;
      if (this.dmgT <= 0) {
        this.dmgT = hk < 0.28 ? 0.08 : hk < 0.45 ? 0.15 : 0.26;
        const ox = rand(-this.radius, this.radius) * 0.7, oy = rand(-this.radius, this.radius) * 0.5;
        G.particles.smoke(this.x + ox, this.y + oy, 1, hk < 0.28 ? 'rgba(20,18,24,' : 'rgba(56,54,62,', this.radius / 3.4);
        if (hk < 0.32) G.particles.fire(this.x + ox, this.y + oy, 1);
        if (hk < 0.28 && Math.random() < 0.3) G.ocean.addOil(this.x, this.y, 0.06);
      }
      this.list = lerp(this.list, (1 - hk) * 0.18, Math.min(1, dt * 2));
    }
    // shouldering the player aside: light, on a cooldown, never a surprise kill
    if (!p.dead && !p.diving && !p.rolling && this.ramCd <= 0 && d < this.radius + 12 && spd > 40) {
      this.ramCd = 1.2; p.damage(10 * (1 + (this.diff - 1) * 0.6), this.x, this.y);
      G.particles.splash((this.x + p.x) / 2, (this.y + p.y) / 2, 1.2);
      this.kx -= Math.cos(this.ang) * 60; this.ky -= Math.sin(this.ang) * 60;
    }
    this.angle = this.ang;     // hand the public field back, whoever nudged it
  }

  // ======================= IRONJAW: anchor, spear, reel ===================
  stepIronjaw(dt, t, d, toP, p) {
    let desired = this.ang, speed = 0;
    switch (this.state) {
      case 'cruise': {
        // close to harpoon range and broadside slowly
        if (d > 250) desired = toP;
        else if (d < 150) desired = toP + Math.PI * 0.85 * this.orbitDir;
        else desired = toP + 0.5 * this.orbitDir;
        speed = this.speed * (d < 120 ? 1.3 : 1);
        // it only sets its anchors at a range where you can read the aim line
        if (this.stateT > 2.4 && d > 115 && d < 280) { this.setState('anchor'); this.dropAnchors(); }
        break;
      }
      case 'anchor': {                      // 0.9s: the anchors go over the side
        desired = toP; speed = this.speed * Math.max(0, 1 - this.stateT / 0.9) * 0.5;
        this.vx *= Math.pow(0.05, dt); this.vy *= Math.pow(0.05, dt);
        if (Math.random() < 0.5) G.particles.spray(this.x + rand(-20, 20), this.y + rand(-14, 14), rand(0, TAU), 1, 50);
        if (this.stateT >= 0.9) { this.setState('aim'); Audio_.tone(190, 0.22, 'sawtooth', 0.1, 70); }
        break;
      }
      case 'aim': {                          // 1.4s telegraph: line + reticle
        desired = toP; speed = 0;
        this.vx *= Math.pow(0.01, dt); this.vy *= Math.pow(0.01, dt);
        this.armDraw = Math.min(1, this.stateT / 1.4);
        if (Math.random() < 0.25) G.particles.sparks(this.x + Math.cos(this.ang) * 26, this.y + Math.sin(this.ang) * 26, 1, this.ang, 0.8);
        if (this.stateT >= 1.4) this.fireHarpoon(p);
        break;
      }
      case 'fire': {                          // the head is in the air
        desired = toP; speed = 0;
        this.vx *= Math.pow(0.01, dt); this.vy *= Math.pow(0.01, dt);
        this.stepHarpoon(dt, p);
        break;
      }
      case 'tether': {                        // reeling you in
        desired = toP; speed = 0;
        this.vx *= Math.pow(0.01, dt); this.vy *= Math.pow(0.01, dt);
        this.tether -= dt;
        if (p.dead) { this.snapChain(false); break; }
        if (p.rolling) { this.snapChain(true); break; }
        const a = angleTo(p.x, p.y, this.x, this.y);
        p.vx += Math.cos(a) * 470 * dt; p.vy += Math.sin(a) * 470 * dt;
        if (Math.random() < 0.5) G.particles.spray(p.x - Math.cos(a) * 10, p.y - Math.sin(a) * 10, a + Math.PI, 1, 70);
        G.ocean.addFoam(p.x, p.y, 0.12);
        if (dist(this.x, this.y, p.x, p.y) < this.radius + 14) {
          // dragged onto the bow rollers
          if (!p.diving) p.damage(20 * (1 + (this.diff - 1) * 0.6), this.x, this.y);
          this.snapChain(false); G.shake(8); G.particles.splash(p.x, p.y, 2);
          break;
        }
        if (this.tether <= 0) this.snapChain(false);
        break;
      }
      case 'reload': {                        // 2.4s rooted, armour plates open
        desired = toP; speed = 0;
        this.vx *= Math.pow(0.01, dt); this.vy *= Math.pow(0.01, dt);
        this.armDraw = Math.max(0, 1 - this.stateT / 0.8);
        if (Math.random() < 0.35) G.particles.sparks(this.x + rand(-16, 16), this.y + rand(-12, 12), 1);
        if (this.stateT >= 2.4) { this.setState('weigh'); this.say('ANCHORS UP', '#c8d0d8'); }
        break;
      }
      case 'weigh': {                         // 0.8s: anchors come up, it moves
        desired = toP; speed = this.speed * 0.35;
        if (this.stateT >= 0.8) { this.anchors.length = 0; this.setState('cruise'); this.orbitDir *= -1; }
        break;
      }
    }
    return [desired, speed];
  }
  dropAnchors() {
    this.anchors.length = 0;
    for (let i = 0; i < 4; i++) {
      const a = this.ang + Math.PI / 4 + i * Math.PI / 2;
      const r = this.radius + rand(26, 40);
      const ax = this.x + Math.cos(a) * r, ay = this.y + Math.sin(a) * r;
      this.anchors.push({ x: ax, y: ay, t: 0 });
      G.particles.splash(ax, ay, 1.3); G.ocean.ripple(ax, ay, 26, 70, 0.6);
    }
    this.say('ANCHORING', '#ffe48f');
    Audio_.splash(1.4); G.ocean.ripple(this.x, this.y, 70, 140, 0.5);
  }
  fireHarpoon(p) {
    const muzzleA = this.ang;
    const mx = this.x + Math.cos(muzzleA) * (this.radius + 6), my = this.y + Math.sin(muzzleA) * (this.radius + 6);
    const lead = dist(mx, my, p.x, p.y) / 430;
    const a = angleTo(mx, my, p.x + (p.vx || 0) * lead * 0.7, p.y + (p.vy || 0) * lead * 0.7);
    this.harp = { x: mx, y: my, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, life: 1.0, a };
    this.setState('fire');
    this.armDraw = 0;
    G.particles.sparks(mx, my, 8, a, 0.7); G.shake(4);
    Audio_.shot('harpoon');
  }
  stepHarpoon(dt, p) {
    const h = this.harp; if (!h) { this.setState('reload'); return; }
    h.life -= dt; h.x += h.vx * dt; h.y += h.vy * dt;
    if (Math.random() < 0.4) G.particles.spray(h.x, h.y, h.a + Math.PI, 1, 50);
    const dp = dist(h.x, h.y, p.x, p.y);
    if (!p.dead && !p.diving && dp < 16) {
      if (p.rolling) { G.particles.sparks(h.x, h.y, 6); this.harp = null; this.say('MISSED', '#8ac6ff'); this.setState('reload'); return; }
      p.damage(14 * (1 + (this.diff - 1) * 0.6), h.x, h.y);
      this.harp = null; this.tether = 2.6; this.setState('tether');
      this.teach();
      G.particles.text(p.x, p.y - 26, 'ROLL TO SNAP THE CHAIN!', '#ffe48f', 9);
      G.shake(6); Audio_.stun();
      return;
    }
    if (h.life <= 0 || h.x < 10 || h.y < 10 || h.x > G.ocean.W - 10 || h.y > G.ocean.H - 10) {
      G.particles.splash(h.x, h.y, 1); this.harp = null; this.say('MISSED', '#8ac6ff'); this.setState('reload');
    }
  }
  snapChain(byRoll) {
    this.harp = null; this.tether = 0;
    if (byRoll) {
      G.particles.text(G.player.x, G.player.y - 26, 'SNAPPED!', '#6fd88e', 10);
      G.particles.sparks(G.player.x, G.player.y, 12); G.particles.splash(G.player.x, G.player.y, 1.4);
      if (typeof Toon !== 'undefined') Toon.burst(G.player.x, G.player.y, 1.4, '#6fd88e');
      Audio_.tone(520, 0.12, 'square', 0.16, -300);
    }
    this.setState('reload');
  }

  // ======================= THE DRAGNET: the weighted sweep ================
  stepDragnet(dt, t, d, toP, p) {
    let desired = this.ang, speed = 0;
    // the lobbed net runs on its own clock while the hauler manoeuvres
    this.stepCast(dt, p, d, toP);
    switch (this.state) {
      case 'cruise': {
        const r = 78;
        if (d > r + 60) desired = toP;
        else if (d < r - 34) desired = toP + Math.PI;
        else desired = toP + Math.PI / 2 * this.orbitDir;
        speed = this.speed;
        this.boomA = angleLerp(this.boomA, this.ang + Math.PI, Math.min(1, dt * 2));
        if (this.stateT > 2.8 && d < 105) {
          this.setState('wind');
          this.sweepDir = this.orbitDir;
          this.sweepFrom = toP - this.sweepDir * 1.35;
          this.sweepTo = this.sweepFrom + this.sweepDir * 2.7;
          this.sweepHit = false;
          this.say('HAULING BACK', '#ffe48f');
          Audio_.tone(150, 0.3, 'sawtooth', 0.12, 60);
          if (typeof Toon !== 'undefined') Toon.emote(this.x + 10, this.y - this.radius - 12, '!');
        }
        break;
      }
      case 'wind': {                         // 1.3s telegraph: boom hauls back
        desired = toP; speed = d > 58 ? this.speed * 0.62 : 0;
        this.boomA = angleLerp(this.boomA, this.sweepFrom, Math.min(1, dt * 5));
        if (Math.random() < 0.4) G.particles.spray(this.x + Math.cos(this.boomA) * 44, this.y + Math.sin(this.boomA) * 44, this.boomA, 1, 60);
        if (Math.floor(this.stateT * 6) !== Math.floor((this.stateT - dt) * 6)) Audio_.tone(760, 0.05, 'square', 0.05);
        if (this.stateT >= 1.3) { this.setState('sweep'); Audio_.splash(2); G.shake(4); }
        break;
      }
      case 'sweep': {                        // 0.55s: the net comes round
        desired = toP; speed = this.speed * 0.15;
        const k = clamp(this.stateT / 0.62, 0, 1);
        this.boomA = this.sweepFrom + (this.sweepTo - this.sweepFrom) * (k * k * (3 - 2 * k));
        const tipX = this.x + Math.cos(this.boomA) * 44, tipY = this.y + Math.sin(this.boomA) * 44;
        G.particles.spray(tipX, tipY, this.boomA + Math.PI / 2 * this.sweepDir, 2, 150);
        G.ocean.addFoam(tipX, tipY, 0.4);
        if (G.ocean.disturb) G.ocean.disturb(tipX, tipY, 3, 0, 0);
        if (!this.sweepHit && !p.dead && !p.diving && !p.rolling) {
          const dp = dist(this.x, this.y, p.x, p.y);
          if (dp > 22 && dp < 60 && Math.abs(angleDiff(this.boomA, angleTo(this.x, this.y, p.x, p.y))) < 0.55) {
            this.sweepHit = true; this.teach();
            p.damage(20 * (1 + (this.diff - 1) * 0.6), this.x, this.y);
            p.slowed = Math.max(p.slowed, 2.4);
            const a = angleTo(this.x, this.y, p.x, p.y) + Math.PI / 2 * this.sweepDir;
            p.vx += Math.cos(a) * 340; p.vy += Math.sin(a) * 340;
            G.particles.splash(p.x, p.y, 2.2); G.particles.text(p.x, p.y - 26, 'NETTED!', '#6fd88e', 9);
            G.shake(9);
          }
        }
        if (this.stateT >= 0.62) { this.setState('recover'); this.say('BOOM JAMMED', '#ffe48f'); }
        break;
      }
      case 'recover': {                      // 1.6s: dead in the water, open
        desired = toP; speed = this.speed * 0.12;
        this.boomA = angleLerp(this.boomA, this.sweepTo + this.sweepDir * 0.3, Math.min(1, dt * 3));
        if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-20, 20), this.y + rand(-14, 14), 1);
        if (this.stateT >= 1.6) { this.setState('cruise'); this.orbitDir *= -1; }
        break;
      }
    }
    return [desired, speed];
  }
  stepCast(dt, p, d, toP) {
    if (this.cast) {
      this.cast.t += dt;
      if (this.cast.t >= 0.9 && !this.cast.thrown) {
        this.cast.thrown = true;
        const tx = this.cast.x, ty = this.cast.y;
        const dd = dist(this.x, this.y, tx, ty), flight = clamp(dd / 220, 0.55, 1.5), a = angleTo(this.x, this.y, tx, ty);
        G.projectiles.push(new Projectile({
          x: this.x, y: this.y, vx: Math.cos(a) * dd / flight, vy: Math.sin(a) * dd / flight,
          life: flight, dmg: 6 * (1 + (this.diff - 1) * 0.6), owner: 'enemy', sprite: SP.net,
          size: 9, slow: 2.4, knock: 0, arc: true, vz: 150 * flight, absorbable: true,
        }));
        Audio_.shot('grenade');
      }
      if (this.cast.t > 1.7) this.cast = null;
      return;
    }
    this.castT -= dt;
    if (this.castT <= 0 && d < 300 && this.state !== 'sweep' && this.state !== 'wind') {
      this.castT = 5.0;
      const lead = 0.55;
      this.cast = { x: p.x + (p.vx || 0) * lead, y: p.y + (p.vy || 0) * lead, t: 0, thrown: false };
      Audio_.tone(330, 0.12, 'square', 0.07);
    }
  }

  // ======================= EMBER QUEEN: the burning slick ================
  stepEmber(dt, t, d, toP, p) {
    let desired = this.ang, speed = 0;
    this.stepSlicks(dt, p);
    this.stepCanister(dt, p, d);
    switch (this.state) {
      case 'run': {
        const r = 128;
        if (d > r + 70) desired = toP;
        else if (d < r - 50) desired = toP + Math.PI * 0.8 * this.orbitDir;
        else desired = toP + Math.PI / 2 * this.orbitDir;
        speed = this.speed;
        // it bleeds oil the whole time it runs
        this.slickT -= dt;
        if (this.slickT <= 0 && this.slicks.length < 14) {
          this.slickT = 0.5;
          this.addSlick(this.x - Math.cos(this.ang) * (this.radius + 4) + rand(-5, 5),
            this.y - Math.sin(this.ang) * (this.radius + 4) + rand(-5, 5), randi(0, 2));
        }
        this.ventT -= dt;
        if (this.ventT <= 0 && this.slicks.length > 3) {
          this.setState('vent'); this.ventDmg = 0;
          this.say('PRESSURISING', '#ff9a3c');
          if (typeof Toon !== 'undefined') Toon.emote(this.x + 10, this.y - this.radius - 12, '!');
          Audio_.tone(120, 0.7, 'sawtooth', 0.13, 220);
        }
        if (this.stateT > 6) { this.stateT = 0; this.orbitDir *= -1; }
        break;
      }
      case 'vent': {                          // 1.2s telegraph: tank glows hot
        desired = toP; speed = this.speed * 0.45;
        if (Math.random() < 0.6) G.particles.smoke(this.x + rand(-10, 10), this.y + rand(-8, 8), 1, 'rgba(70,64,60,', 3);
        if (Math.random() < 0.4) G.particles.fire(this.x + this.gfx.hull.flare.x, this.y + this.gfx.hull.flare.y, 1);
        if (this.stateT >= 1.2) this.ignite();
        break;
      }
      case 'cool': {                          // 1.4s after the burn goes up
        desired = toP; speed = this.speed * 0.3;
        if (Math.random() < 0.5) G.particles.smoke(this.x + rand(-12, 12), this.y + rand(-9, 9), 1, 'rgba(110,104,98,', 4);
        if (this.stateT >= 1.4) { this.setState('run'); this.ventT = 6.5; }
        break;
      }
      case 'stagger': {                       // the tank was ruptured in time
        desired = toP; speed = 0;
        this.vx *= Math.pow(0.05, dt); this.vy *= Math.pow(0.05, dt);
        if (Math.random() < 0.6) G.particles.spray(this.x + rand(-14, 14), this.y + rand(-10, 10), rand(0, TAU), 1, 60);
        if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-16, 16), this.y + rand(-10, 10), 1);
        if (this.stateT >= 2.2) { this.setState('run'); this.ventT = 7; }
        break;
      }
    }
    return [desired, speed];
  }
  addSlick(x, y, size) {
    this.slicks.push({ x, y, s: clamp(size, 0, 2), life: 11, burn: 0, warn: 0, f: randi(0, 2) });
    G.ocean.addOil(x, y, 0.5);
  }
  stepSlicks(dt, p) {
    const warn = this.state === 'vent';
    const cx = G.cam.x + 320, cy = G.cam.y + 180;
    this.fireTick -= dt;
    let touching = false;
    for (let i = this.slicks.length - 1; i >= 0; i--) {
      const s = this.slicks[i];
      s.life -= dt; s.warn = warn ? clamp(this.stateT / 1.2, 0, 1) : 0;
      if (s.burn > 0) {
        s.burn -= dt;
        const r = this.art.slicks[s.s].r;
        const seen = Math.abs(s.x - cx) < 360 && Math.abs(s.y - cy) < 220;
        if (seen) {
          if (Math.random() < 0.24) G.particles.fire(s.x + rand(-r, r) * 0.7, s.y + rand(-r, r) * 0.6, 1);
          if (Math.random() < 0.10) G.particles.smoke(s.x + rand(-r, r) * 0.5, s.y + rand(-r, r) * 0.5, 1, 'rgba(30,26,24,', 4);
        }
        if (!p.dead && !p.rolling && !p.diving && dist(s.x, s.y, p.x, p.y) < r * 0.92) touching = true;
      }
      if (s.life <= 0) this.slicks.splice(i, 1);
    }
    if (touching && this.fireTick <= 0) {
      this.fireTick = 0.55;
      this.teach();
      p.damage(8 * (1 + (this.diff - 1) * 0.6), p.x + rand(-6, 6), p.y + rand(-6, 6));
      G.particles.fire(p.x, p.y, 4);
    }
  }
  stepCanister(dt, p, d) {
    if (this.can) {
      const c = this.can; c.t += dt;
      if (!c.thrown && c.t >= 0.9) {
        c.thrown = true; c.flight = clamp(dist(this.x, this.y, c.x, c.y) / 230, 0.5, 1.4);
        c.sx = this.x; c.sy = this.y; c.ft = 0;
        Audio_.shot('grenade');
      }
      if (c.thrown) {
        c.ft += dt;
        if (c.ft >= c.flight) {
          this.addSlick(c.x, c.y, 2);
          const s = this.slicks[this.slicks.length - 1];
          if (s) { s.burn = 4.5; s.life = Math.min(s.life, 5.0); }
          G.particles.explode(c.x, c.y, 26, { water: false });
          G.ocean.ripple(c.x, c.y, 40, 110, 0.6);
          this.can = null;
        }
      }
      if (this.can && this.can.t > 4) this.can = null;
      return;
    }
    this.canT -= dt;
    if (this.canT <= 0 && d < 320 && this.state === 'run') {
      this.canT = 4.2;
      this.can = { x: p.x + (p.vx || 0) * 0.5, y: p.y + (p.vy || 0) * 0.5, t: 0, thrown: false };
      Audio_.tone(280, 0.14, 'square', 0.08, 120);
    }
  }
  ignite() {
    let n = 0;
    for (const s of this.slicks) { if (s.burn <= 0) { s.burn = 5.0; s.life = Math.min(s.life, 5.6); n++; } }
    this.setState('cool');
    if (n) {
      G.banner('THE SLICK IS ALIGHT', '#ff9a3c', 1.2);
      G.shake(7); Audio_.explosion(1.1);
      if (typeof Toon !== 'undefined') Toon.shock(this.x, this.y, 150, 0.5, '#ffd27a');
    }
  }
  rupture() {
    this.setState('stagger');
    this.say('TANK RUPTURED!', '#ffe48f');
    G.banner('TANK RUPTURED  HIT HER NOW', '#ffe48f', 1.4);
    G.particles.explode(this.x, this.y, 60, { debris: 12, debrisColors: ['#7d858f', '#4a515a', '#a8442a'] });
    G.shake(13); Audio_.stun();
    if (typeof Toon !== 'undefined') { Toon.burst(this.x, this.y, 3); Toon.shock(this.x, this.y, 170, 0.6); }
    this.hp -= 30;
    if (this.hp <= 0) this.die();
  }

  // ---------------------------------------------------------------- damage
  hit(dmg, kx, ky, proj, silent = false) {
    if (this.dead) return;
    let mult = 1;
    if (this.exposed) mult = 1.7;
    else if (this.state === 'enter') mult = 0.8;
    else if (this.type === 'fuelBarge' && this.state === 'vent') mult = 2.2;
    const real = dmg * mult;
    this.hp -= real; this.flash = 0.08;
    this.kx += (kx || 0) * 0.35; this.ky += (ky || 0) * 0.35;
    if (!silent) {
      G.particles.sparks(this.x, this.y, 3); G.particles.debris(this.x, this.y, 2);
      if (typeof Toon !== 'undefined') Toon.impact(this.x, this.y, this.exposed || mult > 1.5 ? 1.6 : 0.8, mult > 1.5 ? '#ffe48f' : '#ffffff');
      if (this.scars.length < 14) { const a = rand(0, TAU), r = rand(0, this.radius * 0.8); this.scars.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, s: randi(1, 3) }); }
      if (Math.random() < 0.4) G.particles.blood(this.x, this.y, 0.3, proj ? Math.atan2(proj.vy, proj.vx) : null);
      G.particles.text(this.x + rand(-8, 8), this.y - this.radius - 5, Math.round(real) + (mult > 1.5 ? '!' : ''),
        mult > 1.5 ? '#ffe48f' : (proj && proj.crit ? '#ffe48f' : '#ffffff'), mult > 1.5 ? 9 : 7);
      Audio_.hit(); G.stats.damageDealt += real;
    }
    // the pressurised tank can be burst before she lights the water
    if (this.type === 'fuelBarge' && this.state === 'vent') {
      this.ventDmg += real;
      if (this.ventDmg >= 70 && this.hp > 0) { this.rupture(); return; }
    }
    if (this.hp <= 0) this.die();
  }

  die(silent = false) {
    if (this.dead) return;
    this.dead = true; this.wake.dead = true;
    const r = this.radius;
    if (this.slicks) for (const s of this.slicks) {
      G.particles.smoke(s.x, s.y, 3, 'rgba(120,114,108,', 6);
      if (s.burn > 0) G.particles.fire(s.x, s.y, 3);
    }
    if (this.slicks) this.slicks.length = 0;
    this.harp = null; this.tether = 0; this.can = null; this.cast = null;
    if (!silent) {
      if (typeof Toon !== 'undefined') { Toon.burst(this.x, this.y, 2.4 + r / 18); Toon.shock(this.x, this.y, r * 5, 0.7); }
      G.particles.explode(this.x, this.y, r * 2.8, {
        debris: Math.round(r * 1.8), oil: 1.6 + r / 12,
        debrisColors: this.type === 'netHauler' ? ['#2f7a6d', '#e6802a', '#dfe8ef', '#4a515a']
          : this.type === 'fuelBarge' ? ['#a8442a', '#e0a838', '#4a515a', '#1e1d1a']
            : ['#96693a', '#aab4c2', '#5b6069', '#3a2413'],
      });
      for (let i = 0; i < 4; i++) G.particles.debris(this.x + rand(-r, r), this.y + rand(-r, r), 6);
      G.shake(Math.min(20, 9 + r / 3));
      for (let i = 0; i < 3; i++) setTimeout(() => {
        if (!G || !G.particles) return;
        G.particles.explode(this.x + rand(-r, r), this.y + rand(-r, r), 34 + rand(0, 20));
      }, 220 + i * 260);
    }
    G.particles.blood(this.x, this.y, 1.4);
    if (typeof Gore !== 'undefined') { Gore.burst(this.x, this.y, 1.6, rand(0, TAU)); Gore.burst(this.x + rand(-r, r) * 0.6, this.y + rand(-r, r) * 0.6, 1.1, rand(0, TAU)); }
    G.wrecks.push(new Wreck(this.sprite, this.x, this.y, this.ang, r));
    // scrap, through the same pickup path every boat uses
    const mult = G.player.stats.scrapMult || 1;
    const drops = this.mb.drops || {};
    for (const k in drops) {
      let n = Math.round(drops[k] * mult * rand(0.85, 1.25));
      if (Math.random() < (drops[k] * mult) % 1) n++;
      for (let i = 0; i < n; i++) G.pickups.push(new Pickup(this.x, this.y, k));
    }
    G.stats.kills++;
    if (G.onMiniBossKilled) G.onMiniBossKilled(this);
    if (G.onEnemyKilled) G.onEnemyKilled(this);
  }
}

// ---------------------------------------------------------------- render
MiniBoss.prototype.renderSlicks = function (ctx, cam, t) {
  const A = this.art.slicks;
  for (const s of this.slicks) {
    const sx = Math.round(s.x - cam.x), sy = Math.round(s.y - cam.y);
    const g = A[s.s];
    if (sx < -60 || sy < -60 || sx > 700 || sy > 420) continue;
    const fade = clamp(s.life / 2.2, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.85 * fade;
    if (s.burn > 0) {
      const fr = g.hot[(Math.floor(t * 12) + s.f) % 3];
      ctx.globalAlpha = 0.92 * clamp(s.burn / 0.8, 0, 1);
      ctx.drawImage(fr.c, sx - fr.ax, sy - fr.ay);
    } else {
      ctx.drawImage(g.cold.c, sx - g.cold.ax, sy - g.cold.ay);
      // pressurising: every slick pulses before it goes up
      if (s.warn > 0) {
        ctx.globalAlpha = 1;
        const blink = Math.sin(t * 26) > -0.2;
        mbRing(ctx, sx, sy, Math.round(g.r * (0.6 + s.warn * 0.5)), blink ? '#ffd27a' : '#e6802a',
          26, 0.82, t * 1.6, 3);
      }
    }
    ctx.restore();
  }
};

MiniBoss.prototype.render = function (ctx, cam, t) {
  if (this.dead) return;
  if (this.slicks && this.slicks.length) this.renderSlicks(ctx, cam, t);
  const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);
  const near = !(sx < -140 || sy < -140 || sx > 780 || sy > 500);
  if (!near) return;
  const p = G.player, px2 = Math.round(p.x - cam.x), py2 = Math.round(p.y - cam.y);

  // ---------------- telegraphs on the water, UNDER the hull
  if (this.type === 'harpoonBarge') {
    // the anchor cables: it is rooted, and you can see it is rooted
    if (this.anchors.length) {
      for (const a of this.anchors) {
        const ax = Math.round(a.x - cam.x), ay = Math.round(a.y - cam.y);
        mbChain(ctx, sx, sy, ax, ay, 3, '#c3cedd', '#414954', 3);
        ctx.fillStyle = '#1a1220'; ctx.fillRect(ax - 4, ay - 2, 9, 4); ctx.fillRect(ax - 2, ay - 4, 4, 9);
        ctx.fillStyle = '#aab4c2'; ctx.fillRect(ax - 3, ay - 1, 7, 2); ctx.fillRect(ax - 1, ay - 3, 2, 7);
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(ax - 1, ay - 1, 2, 2);
      }
    }
    if (this.state === 'aim') {
      const k = clamp(this.stateT / 1.4, 0, 1), hot = k > 0.8;
      const mx = sx + Math.cos(this.ang) * (this.radius + 6), my = sy + Math.sin(this.ang) * (this.radius + 6);
      mbDashLine(ctx, mx, my, mx + Math.cos(this.ang) * 460, my + Math.sin(this.ang) * 460, t,
        hot && Math.sin(t * 40) > 0 ? '#ffffff' : '#ff6161', '#ffd27a', 2);
      // reticle closing on the mark
      const rr = Math.round(28 - k * 15);
      const reach = clamp(dist(this.x, this.y, p.x, p.y), 70, 330);
      const tx = Math.round(mx + Math.cos(this.ang) * reach), ty = Math.round(my + Math.sin(this.ang) * reach);
      mbRing(ctx, tx, ty, rr, hot ? '#ffffff' : '#ff6161', 34, 0.74, -t * 2.2, 4);
      ctx.fillStyle = hot ? '#ffffff' : '#ffd27a';
      ctx.fillRect(tx - 4, ty, 9, 1); ctx.fillRect(tx, ty - 4, 1, 9);
    }
    if (this.state === 'fire' && this.harp) {
      const hx = Math.round(this.harp.x - cam.x), hy = Math.round(this.harp.y - cam.y);
      const mx = sx + Math.cos(this.ang) * (this.radius + 4), my = sy + Math.sin(this.ang) * (this.radius + 4);
      mbChain(ctx, mx, my, hx, hy, 2, '#c3cedd', '#414954', 3);
      drawSprite(ctx, this.gfx.head, hx, hy, this.harp.a);
    }
    if (this.state === 'tether') {
      const mx = sx + Math.cos(this.ang) * (this.radius + 4), my = sy + Math.sin(this.ang) * (this.radius + 4);
      const bright = Math.sin(t * 24) > 0;
      mbChain(ctx, mx, my, px2, py2, 0, bright ? '#ffe48f' : '#c3cedd', '#2a2f38', 3);
      drawSprite(ctx, this.gfx.head, px2, py2, angleTo(this.x, this.y, p.x, p.y) + Math.PI);
      const rr2 = 36 + Math.round(Math.sin(t * 14) * 3), rc = bright ? '#ffe48f' : '#ff6161';
      for (let q = 0; q < 28; q++) {
        if ((q & 3) === 3) continue;
        const a = t * 3 + q / 28 * TAU;
        ctx.fillStyle = rc;
        ctx.fillRect(Math.round(px2 + Math.cos(a) * rr2) - 1, Math.round(py2 + Math.sin(a) * rr2 * 0.74) - 1, 2, 2);
      }
    }
  } else if (this.type === 'netHauler') {
    if (this.state === 'wind' || this.state === 'sweep') {
      const k = this.state === 'wind' ? clamp(this.stateT / 1.3, 0, 1) : 1;
      const a0 = Math.min(this.sweepFrom, this.sweepTo), a1 = Math.max(this.sweepFrom, this.sweepTo);
      const hot = this.state === 'sweep' || k > 0.82;
      const col = hot ? (Math.sin(t * 40) > 0 ? '#ffffff' : '#ffe48f') : '#ffd27a';
      for (const r of [28, 40, 52]) mbArcDots(ctx, sx, sy, r, a0, a1, col, hot ? 0 : 3, hot ? 3 : 2);
      // the leading edge of the swing, so you can see which way it is coming
      if (this.state === 'sweep') mbArcDots(ctx, sx, sy, 46, this.boomA - this.sweepDir * 0.22, this.boomA, '#ffffff', 0, 3);
      for (const ae of [a0, a1]) mbDashLine(ctx, sx + Math.cos(ae) * 26, sy + Math.sin(ae) * 26,
        sx + Math.cos(ae) * 58, sy + Math.sin(ae) * 58, t, col, '#e6802a', 1);
      if (this.state === 'wind') {
        // hatching fills the wedge as the boom hauls back
        const n = Math.round(10 * k);
        for (let q = 0; q < n; q++) {
          const a = a0 + (a1 - a0) * (q + 0.5) / 10, r = 30 + ((q * 7) % 24);
          ctx.fillStyle = '#e6802a';
          ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r), 2, 2);
        }
      }
    }
    if (this.cast && !this.cast.thrown) {
      const k = clamp(this.cast.t / 0.9, 0, 1);
      mbMark(ctx, Math.round(this.cast.x - cam.x), Math.round(this.cast.y - cam.y), k, t,
        k > 0.8 ? '#ffffff' : '#8ac6ff', '#dfe8ef');
    }
  } else {
    if (this.can && !this.can.thrown) {
      const k = clamp(this.can.t / 0.9, 0, 1);
      mbMark(ctx, Math.round(this.can.x - cam.x), Math.round(this.can.y - cam.y), k, t,
        k > 0.8 ? '#ffffff' : '#ff9a3c', '#ffd27a');
    }
    if (this.can && this.can.thrown) {
      const u = clamp(this.can.ft / this.can.flight, 0, 1);
      const bx = this.can.sx + (this.can.x - this.can.sx) * u, by = this.can.sy + (this.can.y - this.can.sy) * u;
      const z = Math.sin(u * Math.PI) * 26;
      const cx2 = Math.round(bx - cam.x), cy2 = Math.round(by - cam.y);
      ctx.fillStyle = 'rgba(6,18,48,0.35)'; ctx.fillRect(cx2 - 2, cy2 - 1, 5, 3);
      ctx.fillStyle = '#1a1220'; ctx.fillRect(cx2 - 3, cy2 - Math.round(z) - 3, 6, 6);
      ctx.fillStyle = '#e0a838'; ctx.fillRect(cx2 - 2, cy2 - Math.round(z) - 2, 4, 4);
      ctx.fillStyle = Math.floor(t * 14) % 2 ? '#ffe48f' : '#ff6161'; ctx.fillRect(cx2 - 1, cy2 - Math.round(z) - 4, 2, 2);
    }
    if (this.state === 'vent') {
      const k = clamp(this.stateT / 1.2, 0, 1), hot = k > 0.78;
      mbRing(ctx, sx, sy, Math.round(30 + k * 26), hot && Math.sin(t * 40) > 0 ? '#ffffff' : '#ff9a3c', 44, 0.8, t, 3);
      mbRing(ctx, sx, sy, Math.round(30 + k * 14), '#ffd27a', 36, 0.8, -t * 1.4, 4);
    }
  }

  // ---------------- the hull
  const bobY = Math.round(Math.sin(t * 2.2 + this.bob) * 1);
  const spr = this.flash > 0 ? this.hurtSprite : this.sprite;
  ctx.save();
  ctx.translate(sx, sy + bobY);
  ctx.rotate(this.ang);
  ctx.scale(1, 1 - (1 - this.hpFrac) * 0.10);
  ctx.drawImage(spr.c, -spr.ax, -spr.ay);
  if (this.flash <= 0) for (const sc of this.scars) {
    ctx.fillStyle = '#14141c'; ctx.fillRect(Math.round(sc.x), Math.round(sc.y), sc.s, sc.s);
    if (sc.s > 1) { ctx.fillStyle = '#3a3038'; ctx.fillRect(Math.round(sc.x), Math.round(sc.y) - 1, sc.s, 1); }
  }
  if (this.type === 'harpoonBarge') {
    // the launcher slides back as it is cranked, and slams forward on release
    const back = Math.round(this.armDraw * 7);
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#1a1220'; ctx.fillRect(18 - back, s * 5 - 3, 6, 7);
      ctx.fillStyle = this.state === 'aim' && Math.sin(t * 30) > 0 ? '#ffe48f' : '#cdd9ea';
      ctx.fillRect(19 - back, s * 5 - 2, 4, 5);
    }
    if (this.exposed) {           // plates hinged open while it reloads
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(-7, -13, 16, 2); ctx.fillRect(-7, 11, 16, 2);
      ctx.fillStyle = '#e6802a'; ctx.fillRect(-7, -13, 16, 1); ctx.fillRect(-7, 12, 16, 1);
      ctx.fillStyle = '#1a1220'; ctx.fillRect(-5, -11, 12, 22);
      ctx.fillStyle = '#7a1414'; ctx.fillRect(-4, -10, 10, 20);
      const fl = Math.floor(t * 10) % 2;
      ctx.fillStyle = fl ? '#ffe48f' : '#ff9a3c';
      for (let q = -9; q <= 7; q += 4) ctx.fillRect(-3, q, 8, 2);
      ctx.fillStyle = '#c8302e'; ctx.fillRect(-3, -9, 2, 18);
    }
  } else if (this.type === 'fuelBarge') {
    const f = this.gfx.hull.flare;
    // the flare tip: always lit, roaring while she pressurises
    const big = this.state === 'vent';
    const fl = Math.floor(t * 16) % 2;
    ctx.fillStyle = big ? (fl ? '#fff2c0' : '#ffd27a') : (fl ? '#ff9a3c' : '#e6802a');
    const fs = big ? 5 : 3;
    ctx.fillRect(f.x - (fs >> 1), f.y - (fs >> 1), fs, fs);
    if (big) { ctx.fillStyle = '#ff6161'; ctx.fillRect(f.x - 1, f.y - 5, 2, 3); }
    // the tank glows through its plates as the pressure comes up
    if (big) {
      const k = clamp(this.stateT / 1.2, 0, 1);
      ctx.fillStyle = (Math.sin(t * 30) > 0 || k > 0.8) ? '#ffe48f' : '#ff9a3c';
      const tk = this.gfx.hull.tank;
      for (let q = -3; q <= 3; q++) ctx.fillRect(tk.x - 9 + q * 3, -Math.round(4 + k * 5), 2, Math.round(8 + k * 10));
    }
  }
  ctx.restore();

  // ---------------- the boom rides over the hull
  if (this.type === 'netHauler') {
    const b = (this.state === 'sweep') ? this.gfx.boomHot : this.gfx.boom;
    drawSprite(ctx, b, sx, sy + bobY, this.boomA);
  }

  // ---------------- the health bar, same language as the big boats
  const w = Math.max(28, this.radius * 2 + 8), k2 = this.hpFrac;
  const by = sy - this.radius - 11;
  ctx.fillStyle = '#14141c'; ctx.fillRect(sx - (w >> 1) - 1, by - 1, w + 2, 6);
  ctx.fillStyle = '#2a2f38'; ctx.fillRect(sx - (w >> 1), by, w, 4);
  ctx.fillStyle = k2 > 0.5 ? '#6fd88e' : k2 > 0.25 ? '#ffe48f' : '#ff6161';
  ctx.fillRect(sx - (w >> 1), by, Math.round(w * k2), 3);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(sx - (w >> 1), by, Math.round(w * k2), 1);
  // a notch every quarter so you can read the chunk you just took off
  ctx.fillStyle = '#14141c';
  for (let q = 1; q < 4; q++) ctx.fillRect(sx - (w >> 1) + Math.round(w * q / 4), by, 1, 4);
};

globalThis.MINIBOSS_TYPES = MINIBOSS_TYPES;
globalThis.MiniBoss = MiniBoss;
