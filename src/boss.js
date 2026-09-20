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
    // NOTE: the mini-boss death sting is fired by Game.updateWorld when it
    // sweeps G.miniBosses, so it is deliberately NOT called from here.
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

// ===========================================================================
//  THE BOSS ROSTER
//
//  Three full bosses now sit behind one contract. game.js and ui.js only ever
//  touch: name / hp / maxHp / phase / stunned / x / y / radius / dead, and
//  hit(dmg,kx,ky,proj) / update(dt,t) / render(ctx,cam,t) / die(). Everything
//  below keeps every one of those working.
//
//    THE VILLAGE CHIEF   shark rider      bait the charge into the rocks
//    THE GREATCLAW       giant crab       armoured in front: get round behind
//    THE DEEP LANTERN    anglerfish       a fight you cannot see
//
//  Both new bosses are animals, not boats, so they do what a hull cannot:
//  burrow under the seabed, submerge, and come up underneath her.
// ===========================================================================

// ---- shared hard-edged primitives (the mb* telegraph helpers above are
// reused as-is; these are the ones the animals need on top of them) --------

// a chunky tapering limb segment: squares along a line, outlined, lit on the
// north edge. No strokes, no antialiasing, integer coordinates only.
function bxLimb(ctx, x0, y0, x1, y1, w0, w1, col, lit, out) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(2, Math.round(Math.hypot(dx, dy) / 1.4));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = Math.round(x0 + dx * u), y = Math.round(y0 + dy * u);
      const w = Math.max(1, Math.round(w0 + (w1 - w0) * u));
      if (pass === 0) { ctx.fillStyle = out; ctx.fillRect(x - (w >> 1) - 1, y - (w >> 1) - 1, w + 2, w + 2); }
      else {
        ctx.fillStyle = col; ctx.fillRect(x - (w >> 1), y - (w >> 1), w, w);
        if (w > 2) { ctx.fillStyle = lit; ctx.fillRect(x - (w >> 1), y - (w >> 1), w, 1); }
      }
    }
  }
}
// a filled, posterized disc built from rows of rects: round but hard-edged
function bxDisc(ctx, cx, cy, r, col, squash) {
  const sq = squash === undefined ? 1 : squash;
  ctx.fillStyle = col;
  const ry = Math.max(1, Math.round(r * sq));
  for (let y = -ry; y <= ry; y++) {
    const k = 1 - (y / ry) * (y / ry);
    if (k <= 0) continue;
    const hw = Math.round(r * Math.sqrt(k));
    if (hw < 1) continue;
    ctx.fillRect(Math.round(cx) - hw, Math.round(cy) + y, hw * 2 + 1, 1);
  }
}
// a wedge of teeth along an arc: little hard triangles, tip inward
function bxTeeth(ctx, cx, cy, r, a0, a1, n, len, col, out) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * ((i + 0.5) / n);
    const bx = cx + Math.cos(a) * r, by = cy + Math.sin(a) * r;
    const tx = cx + Math.cos(a) * (r - len), ty = cy + Math.sin(a) * (r - len);
    triFill(ctx, out, bx + Math.cos(a + 1.57) * 3, by + Math.sin(a + 1.57) * 3,
      bx + Math.cos(a - 1.57) * 3, by + Math.sin(a - 1.57) * 3, tx, ty);
    triFill(ctx, col, bx + Math.cos(a + 1.57) * 2, by + Math.sin(a + 1.57) * 2,
      bx + Math.cos(a - 1.57) * 2, by + Math.sin(a - 1.57) * 2,
      tx + Math.cos(a) * 1, ty + Math.sin(a) * 1);
  }
}
// a small pip bar (shell integrity, claw condition) over a boss
function bxPips(ctx, x, y, w, k, on, off, out) {
  ctx.fillStyle = out; ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = off; ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = on; ctx.fillRect(x, y, Math.round(w * clamp(k, 0, 1)), 3);
  ctx.fillStyle = out;
  for (let q = 1; q < 4; q++) ctx.fillRect(x + Math.round(w * q / 4), y, 1, 3);
}

// ===========================================================================
//  BOSS 2 — THE GREATCLAW
//
//  A giant crab. It keeps its armoured front to you at all times, and the
//  front eats damage. The whole fight is one sentence: GET BEHIND IT.
//
//    phase 1  ARMOURED   claw slams with a shockwave, sideways scuttle
//                        charges, boulders lobbed from the seabed. Damage
//                        that lands goes into the SHELL, not the body.
//    phase 2  CRACKED    the shell splits. It burrows into the sand and
//                        erupts under her, doubles its slams and rains rock.
//
//  Both claws are separate targets with their own health. Shoot one off and
//  that side stops slamming; take both and it can only scuttle and spin.
// ===========================================================================

let CRAB_ART = null;
function crabArt() {
  if (CRAB_ART) return CRAB_ART;
  const SHELL = ['#2a0e0c', '#4d1712', '#72251a', '#9c3a21', '#c25c2c', '#e08a44', '#f3b268'];
  const OUT = '#180a10';

  // ---- carapace: wide across the beam, broadest at the armoured front ----
  const W = 136, H = 180, cx = 64, cy = 90;          // art px (68 x 90 world)
  const f = blobField(W, H, [
    { x: cx - 6, y: cy, rx: 50, ry: 76 },
    { x: cx + 20, y: cy, rx: 32, ry: 64 },
    { x: cx - 30, y: cy, rx: 30, ry: 56 },
    { x: cx + 30, y: cy - 42, rx: 22, ry: 24 },
    { x: cx + 30, y: cy + 42, rx: 22, ry: 24 },
  ]);
  const sh = shadeBlob(W, H, f, SHELL, { outline: OUT, lx: -0.5, ly: -0.8, contrast: 0.9, lift: 0.18, smooth: 4 });
  const c = sh.ctx;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0;

  // central groove and the two big shoulder ridges, as hard posterized lines
  for (let x = cx - 34; x < cx + 30; x++) {
    if (!inside(x, cy)) continue;
    px(c, '#5c1c15', x, cy - 1, 1, 3); px(c, '#d46c34', x, cy - 2, 1, 1);
  }
  for (const s of [-1, 1]) for (let x = cx - 26; x < cx + 26; x++) {
    const y = Math.round(cy + s * (26 + Math.cos((x - cx) / 30) * 8));
    if (!inside(x, y)) continue;
    px(c, '#6b2118', x, y, 1, 2); px(c, '#e8964c', x, y - 1, 1, 1);
  }
  // serrated armour rim along the leading edge
  for (let y = 4; y < H - 4; y++) {
    let ex = -1;
    for (let x = W - 1; x >= 0; x--) if (inside(x, y)) { ex = x; break; }
    if (ex < cx) continue;
    if ((y % 8) < 4) { px(c, '#f6c47e', ex - 1, y, 2, 1); px(c, OUT, ex, y, 1, 1); }
    else px(c, '#8e3220', ex - 1, y, 2, 1);
  }
  // plated bands across the shell
  for (const bx0 of [cx - 22, cx - 2, cx + 18]) for (let y = 6; y < H - 6; y++) {
    if (!inside(bx0, y) || !inside(bx0 + 1, y)) continue;
    px(c, '#5e1d15', bx0, y, 1, 1); px(c, '#d9743a', bx0 + 1, y, 1, 1);
  }
  // barnacles and pitting, seeded so it is the same crab every run
  {
    const rng = new SeededRandom(0xc2ab0920);
    for (let i = 0; i < 64; i++) {
      const x = Math.round(rng.range(10, W - 10)), y = Math.round(rng.range(10, H - 10));
      if (!inside(x, y) || !inside(x + 2, y + 2)) continue;
      const r = rng.int(1, 2);
      px(c, '#3d1410', x - r, y - r, r * 2 + 1, r * 2 + 1);
      px(c, '#e9b070', x - r, y - r, r * 2 + 1, 1);
      if (r > 1) px(c, '#fdf0d0', x, y, 1, 1);
    }
  }
  // eye sockets, front and centre
  for (const s of [-1, 1]) {
    const ex = cx + 38, ey = cy + s * 13;
    px(c, OUT, ex - 3, ey - 3, 7, 7); px(c, '#7a2a1c', ex - 2, ey - 2, 5, 5);
  }
  const shellSprite = spriteFromHi(sh.c, cx, cy);

  // ---- the cracked carapace: same shell, split open, meat showing ---------
  const cr = newCan(W, H), crc = cr.getContext('2d');
  drawRaw(crc, sh.c, 0, 0);
  {
    const rng = new SeededRandom(0x51ce11);
    for (let q = 0; q < 5; q++) {
      let x = cx - 8 + rng.range(-24, 24), y = cy + rng.range(-40, 40);
      let a = rng.range(0, TAU);
      for (let s = 0; s < 22; s++) {
        a += rng.range(-0.7, 0.7);
        x += Math.cos(a) * 3; y += Math.sin(a) * 3;
        const ix = Math.round(x), iy = Math.round(y);
        if (!inside(ix, iy)) break;
        px(crc, '#100508', ix - 1, iy - 1, 3, 3);
        px(crc, q % 2 ? '#c2545e' : '#a33c48', ix, iy, 2, 2);
        if ((s & 3) === 0) px(crc, '#ee9aa0', ix, iy, 1, 1);
      }
    }
    // a whole plate blown off the back quarter
    for (let y = cy - 26; y < cy + 26; y++) for (let x = cx - 40; x < cx - 14; x++) {
      if (!inside(x, y)) continue;
      const d = Math.hypot((x - (cx - 27)) / 13, (y - cy) / 26);
      if (d > 1) continue;
      px(crc, d > 0.86 ? '#100508' : ((x + y) & 3) === 0 ? '#e0808a' : d > 0.5 ? '#8f2f3a' : '#b84a54', x, y, 1, 1);
    }
  }
  const crackedSprite = spriteFromHi(cr, cx, cy);

  // ---- a claw: palm plus the fixed lower finger, hinged at the wrist ------
  function buildClaw() {
    const w = 104, h = 80, hx = 12, hy = 40;
    const cf = blobField(w, h, [
      { x: 14, y: hy, rx: 14, ry: 13 },
      { x: 44, y: hy - 4, rx: 30, ry: 27 },
      { x: 78, y: hy + 12, rx: 26, ry: 10, rot: 0.14 },
    ]);
    const s = shadeBlob(w, h, cf, SHELL, { outline: OUT, lx: -0.5, ly: -0.8, contrast: 0.92, lift: 0.2, smooth: 3 });
    const q = s.ctx;
    const ins = (x, y) => x >= 0 && y >= 0 && x < w && y < h && cf[y * w + x] > 0;
    // knuckle ridge and the serrated bite edge on the inside of the finger
    for (let x = 30; x < 62; x++) { const y = hy - 18 + Math.round(Math.sin((x - 30) / 16) * 4); if (ins(x, y)) { px(q, '#6b2118', x, y, 1, 2); px(q, '#f0a860', x, y - 1, 1, 1); } }
    for (let x = 56; x < 96; x += 4) { const y = hy + 4; if (ins(x, y)) { px(q, '#fdf0d0', x, y, 2, 2); px(q, OUT, x + 2, y, 1, 2); } }
    for (let i = 0; i < 26; i++) {
      const rng2 = new SeededRandom(0x9911 + i * 77);
      const x = Math.round(rng2.range(16, w - 14)), y = Math.round(rng2.range(8, h - 8));
      if (!ins(x, y) || !ins(x + 1, y + 1)) continue;
      px(q, '#3d1410', x, y, 2, 2); px(q, '#e9b070', x, y, 2, 1);
    }
    return spriteFromHi(s.c, hx, hy);
  }
  // the movable upper finger, hinged at its inner end
  function buildJaw() {
    const w = 72, h = 34, hx = 6, hy = 24;
    const jf = blobField(w, h, [
      { x: 10, y: hy, rx: 11, ry: 10 },
      { x: 34, y: hy - 3, rx: 24, ry: 9 },
      { x: 58, y: hy + 1, rx: 14, ry: 5 },
    ]);
    const s = shadeBlob(w, h, jf, SHELL, { outline: OUT, lx: -0.5, ly: -0.8, contrast: 0.92, lift: 0.24, smooth: 3 });
    const q = s.ctx;
    const ins = (x, y) => x >= 0 && y >= 0 && x < w && y < h && jf[y * w + x] > 0;
    for (let x = 22; x < 66; x += 4) { const y = hy + 4; if (ins(x, y)) { px(q, '#fdf0d0', x, y, 2, 2); px(q, OUT, x + 2, y, 1, 2); } }
    return spriteFromHi(s.c, hx, hy);
  }

  // ---- a boulder for the throwing ---------------------------------------
  function buildRock() {
    const w = 34, h = 30;
    const rf = blobField(w, h, [{ x: 17, y: 15, rx: 15, ry: 13 }, { x: 12, y: 11, rx: 9, ry: 8 }]);
    const s = shadeBlob(w, h, rf, ['#23262e', '#3a3f4a', '#545b68', '#6e7684', '#8b94a3', '#aab4c2'],
      { outline: '#14141c', contrast: 0.9, lift: 0.2, smooth: 2 });
    const rng = new SeededRandom(0x40c);
    for (let i = 0; i < 14; i++) {
      const x = Math.round(rng.range(6, w - 6)), y = Math.round(rng.range(5, h - 5));
      if (rf[y * w + x] <= 0) continue;
      px(s.ctx, '#2c3038', x, y, 2, 1); px(s.ctx, '#98a2b0', x, y - 1, 2, 1);
    }
    return spriteFromHi(s.c, 17, 15);
  }

  CRAB_ART = {
    shell: shellSprite, shellHurt: tintHi(shellSprite, '#ffffff', 0.8),
    cracked: crackedSprite, crackedHurt: tintHi(crackedSprite, '#ffffff', 0.8),
    claw: buildClaw(), jaw: buildJaw(), rock: buildRock(),
  };
  CRAB_ART.clawHurt = tintHi(CRAB_ART.claw, '#ffffff', 0.8);
  CRAB_ART.jawHurt = tintHi(CRAB_ART.jaw, '#ffffff', 0.8);
  return CRAB_ART;
}

class CrabBoss {
  constructor(x, y, difficulty = 1) {
    this.key = 'crab';
    this.art = crabArt();
    this.diff = difficulty || 1;
    this.name = 'THE GREATCLAW';
    this.sub = 'Armoured in front. Get behind it and crack the shell';
    this.color = '#e08a44';
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.maxHp = Math.round(1700 * (0.9 + 0.1 * this.diff)); this.hp = this.maxHp;
    this.shellMax = 560; this.shell = this.shellMax;
    this.radius = 46;
    this.angle = angleTo(x, y, G.player.x, G.player.y);
    this.moveAng = this.angle + Math.PI / 2;
    this.phase = 1; this.dead = false; this.flash = 0;
    this.state = 'enter'; this.stateT = 0; this.nextT = 2.2;
    this.gait = 0; this.bob = rand(0, TAU); this.sub_ = 0;   // sub_ = how far into the sand
    this.claws = [
      { side: -1, hp: 320, max: 320, dead: false, open: 0, lift: 0, ang: 0, x: x, y: y, flash: 0 },
      { side: 1, hp: 320, max: 320, dead: false, open: 0, lift: 0, ang: 0, x: x, y: y, flash: 0 },
    ];
    this.armIdx = 0; this.slamChain = 0; this.windDur = 0.9; this.target = { x, y }; this.waves = []; this.boulders = []; this.throwQ = 0; this.throwN = 0;
    this.mound = null; this.spinT = 0; this.scuttleDir = 1; this.hitOnce = false;
    this.wake = G.ocean.newWake(this, 18);
    this.intro = 2.0; this.cycle = 0;
    G.banner(this.name, this.color, 2.4, this.sub);
  }
  // ui.js flashes the bar and writes [STUNNED] off this
  get stunned() { return this.exposed; }
  get exposed() {
    return this.state === 'slamRec' || this.state === 'scuttleRec' || this.state === 'stagger' || this.state === 'eruptRec';
  }
  get burrowed() { return this.state === 'burrowDown' || this.state === 'burrow'; }
  get phaseName() { return this.phase === 2 ? 'SHELL CRACKED' : 'ARMOURED'; }
  get liveClaws() { return this.claws.filter(c => !c.dead); }
  setState(s) { this.state = s; this.stateT = 0; this.hitOnce = false; }
  say(msg, col, size) { G.particles.text(this.x, this.y - this.radius - 16, msg, col || this.color, size || 9); }

  // ------------------------------------------------------------- update
  update(dt, t) {
    if (this.dead) return;
    const p = G.player;
    this.stateT += dt; this.flash -= dt; this.intro -= dt;
    for (const c of this.claws) c.flash -= dt;
    const d = dist(this.x, this.y, p.x, p.y), toP = angleTo(this.x, this.y, p.x, p.y);
    const p2 = this.phase === 2;
    let turn = p2 ? 1.5 : 1.1, speed = 0, moveAng = this.moveAng;

    switch (this.state) {
      case 'enter': {
        moveAng = toP; speed = 150;
        if (Math.random() < 0.5) G.particles.spray(this.x - Math.cos(toP) * 40, this.y - Math.sin(toP) * 40, toP + Math.PI, 2, 70);
        if (this.stateT > 1.5 || d < 260) { this.setState('stalk'); this.nextT = 1.4; }
        break;
      }
      case 'stalk': {
        // it sidles, always keeping the armoured face pointed at her
        const ring = p2 ? 160 : 195;
        if (d > ring + 70) { moveAng = toP; speed = p2 ? 118 : 92; }
        else if (d < ring - 70) { moveAng = toP + Math.PI; speed = p2 ? 100 : 78; }
        else { moveAng = toP + Math.PI / 2 * this.scuttleDir; speed = p2 ? 104 : 80; }
        this.nextT -= dt;
        if (this.nextT <= 0) this.chooseAttack(d);
        break;
      }
      case 'slamWind': {
        speed = 0;
        const c = this.claws[this.armIdx];
        if (!c || c.dead) { this.setState('stalk'); this.nextT = 0.6; break; }
        const k = clamp(this.stateT / this.windDur, 0, 1);
        c.lift = k; c.open = k * 0.9;
        // the mark chases her a little, then locks for the last third
        if (k < 0.66) { this.target.x = p.x + p.vx * 0.12; this.target.y = p.y + p.vy * 0.12; }
        if (Math.random() < 0.5) G.particles.spray(this.x + rand(-30, 30), this.y + rand(-30, 30), rand(0, TAU), 1, 50);
        if (this.stateT >= this.windDur) {
          c.lift = 0; c.open = 0;
          this.slamLand(this.target.x, this.target.y);
          this.setState('slamRec');
        }
        break;
      }
      case 'slamRec': {
        speed = 0;
        const c = this.claws[this.armIdx];
        if (c) { c.lift = -0.35; c.open = 0.1; }
        if (Math.random() < 0.25) G.particles.bubbles(this.target.x + rand(-16, 16), this.target.y + rand(-12, 12), 1);
        if (this.stateT >= (p2 ? 0.95 : 1.25)) {
          if (c) { c.lift = 0; }
          // in phase two the other claw follows straight through
          const other = this.claws[1 - this.armIdx];
          if (p2 && other && !other.dead && this.slamChain < 1) {
            this.slamChain++; this.armIdx = 1 - this.armIdx; this.windDur = 0.45; this.setState('slamWind');
          } else { this.setState('stalk'); this.nextT = p2 ? rand(0.7, 1.3) : rand(1.1, 1.9); }
        }
        break;
      }
      case 'scuttleWind': {
        speed = 0; turn = 2.4;
        if (Math.random() < 0.8) G.particles.spray(this.x - Math.cos(this.moveAng) * 34, this.y - Math.sin(this.moveAng) * 34, this.moveAng + Math.PI, 2, 110);
        G.ocean.addFoam(this.x + rand(-26, 26), this.y + rand(-26, 26), 0.22);
        if (this.stateT >= (p2 ? 0.55 : 0.8)) {
          this.setState('scuttle'); Audio_.roar(); G.shake(6);
          G.particles.splash(this.x, this.y, 2.4); G.ocean.ripple(this.x, this.y, 130, 240, 0.8);
        }
        break;
      }
      case 'scuttle': {
        moveAng = this.moveAng; speed = p2 ? 520 : 440; turn = 3.2;
        for (let i = 0; i < 2; i++) G.particles.spray(this.x - Math.cos(moveAng) * 30 + rand(-20, 20), this.y - Math.sin(moveAng) * 30 + rand(-20, 20), moveAng + Math.PI, 1, 150);
        G.ocean.addFoam(this.x, this.y, 0.45);
        if (!p.dead && !p.diving && !p.rolling && p.invuln <= 0 && d < this.radius + 16) {
          p.damage((p2 ? 34 : 28) * (1 + (this.diff - 1) * 0.5), this.x, this.y);
          p.vx += Math.cos(moveAng) * 420; p.vy += Math.sin(moveAng) * 420;
          G.particles.splash(p.x, p.y, 2.5);
        }
        for (const r of G.rocks) if (dist(this.x, this.y, r.x, r.y) < r.r + this.radius - 6) { this.crash(r); break; }
        if (this.state !== 'scuttle') break;
        const nx = this.x + Math.cos(moveAng) * 50, ny = this.y + Math.sin(moveAng) * 50;
        if (this.stateT > 1.25 || nx < 40 || nx > G.ocean.W - 40 || ny < WATER_TOP + 30 || ny > G.ocean.H - 40) this.setState('scuttleRec');
        break;
      }
      case 'scuttleRec': {
        speed = 0;
        if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-30, 30), this.y + rand(-20, 20), 1);
        if (this.stateT >= (p2 ? 0.55 : 0.8)) { this.setState('stalk'); this.nextT = rand(0.6, 1.2); this.scuttleDir *= -1; }
        break;
      }
      case 'rockWind': {
        speed = 0;
        const c = this.liveClaws[0];
        if (c) { c.lift = clamp(this.stateT / 0.7, 0, 1); c.open = 0.5; }
        if (Math.random() < 0.6) G.particles.debris(this.x + rand(-30, 30), this.y + rand(-30, 30), 1, ['#6e7684', '#3a3f4a']);
        if (this.stateT >= 0.7) { this.setState('rockThrow'); this.throwQ = 0; this.throwN = p2 ? 5 : 3; }
        break;
      }
      case 'rockThrow': {
        speed = 0;
        const c = this.liveClaws[0]; if (c) { c.lift = Math.max(0, 1 - this.stateT * 3); c.open = 0.7; }
        this.throwQ -= dt;
        if (this.throwQ <= 0 && this.throwN > 0) { this.throwQ = 0.26; this.throwN--; this.throwRock(p); }
        if (this.throwN <= 0 && this.stateT > 0.8) { if (c) c.lift = 0; this.setState('stalk'); this.nextT = rand(0.8, 1.5); }
        break;
      }
      case 'burrowDown': {
        speed = 0;
        this.sub_ = clamp(this.stateT / 0.85, 0, 1);
        if (Math.random() < 0.9) G.particles.debris(this.x + rand(-40, 40), this.y + rand(-30, 30), 2, ['#c9a86a', '#a6884f', '#7d6538']);
        G.ocean.addFoam(this.x + rand(-30, 30), this.y + rand(-30, 30), 0.3);
        if (this.stateT >= 0.85) {
          this.sub_ = 1; this.setState('burrow');
          this.mound = { x: this.x, y: this.y };
          this.say('UNDER THE SAND', '#c9a86a', 9);
        }
        break;
      }
      case 'burrow': {
        // a mound of displaced seabed runs her down: the whole attack is on
        // screen the entire time, there is just no crab to shoot
        const a = angleTo(this.x, this.y, p.x, p.y);
        const sp = 235;
        this.x += Math.cos(a) * sp * dt; this.y += Math.sin(a) * sp * dt;
        this.angle = angleLerp(this.angle, a, dt * 3);
        if (Math.random() < 0.8) G.particles.debris(this.x + rand(-22, 22), this.y + rand(-16, 16), 1, ['#c9a86a', '#a6884f']);
        if (Math.random() < 0.4) G.ocean.ripple(this.x, this.y, 40, 90, 0.4);
        if (this.stateT > 0.7 && (d < 46 || this.stateT > 3.0)) { this.setState('erupt'); G.shake(5); }
        break;
      }
      case 'erupt': {
        speed = 0;
        // 0.45s of the seabed boiling before it comes through
        if (this.stateT < 0.45) {
          for (let i = 0; i < 3; i++) G.particles.debris(this.x + rand(-40, 40), this.y + rand(-34, 34), 1, ['#c9a86a', '#e0c78c']);
          this.sub_ = 1 - this.stateT / 0.45 * 0.2;
        } else {
          if (!this.hitOnce) { this.hitOnce = true; this.eruptBlow(); }
          this.sub_ = Math.max(0, 0.8 - (this.stateT - 0.45) * 3);
          if (this.stateT > 0.75) { this.sub_ = 0; this.setState('eruptRec'); }
        }
        break;
      }
      case 'eruptRec': {
        speed = 0;
        if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-30, 30), this.y + rand(-20, 20), 1);
        if (this.stateT >= 1.4) { this.setState('stalk'); this.nextT = rand(0.7, 1.3); }
        break;
      }
      case 'spin': {
        // both claws gone: it just turns into a rolling wall of shell
        speed = 210; moveAng = angleLerp(this.moveAng, toP, dt * 1.2); turn = 6;
        this.angle += dt * 5.5;
        G.ocean.addFoam(this.x, this.y, 0.35);
        if (Math.random() < 0.6) G.particles.spray(this.x + rand(-40, 40), this.y + rand(-40, 40), rand(0, TAU), 1, 90);
        if (!p.dead && !p.diving && !p.rolling && p.invuln <= 0 && d < this.radius + 14) { p.damage(24 * (1 + (this.diff - 1) * 0.5), this.x, this.y); p.vx += Math.cos(toP) * 340; p.vy += Math.sin(toP) * 340; }
        if (this.stateT > 2.6) { this.setState('scuttleRec'); }
        break;
      }
      case 'crack': {
        speed = 0;
        this.angle += Math.sin(this.stateT * 26) * dt * 1.4;
        if (Math.random() < 0.85) G.particles.debris(this.x + rand(-44, 44), this.y + rand(-38, 38), 2, ['#9c3a21', '#e08a44', '#c2545e']);
        G.ocean.addFoam(this.x + rand(-40, 40), this.y + rand(-40, 40), 0.3);
        if (this.stateT > 1.5) { this.setState('stalk'); this.nextT = 0.5; }
        break;
      }
      case 'stagger': {
        speed = 0;
        this.angle += Math.sin(this.stateT * 7) * dt * 0.8;
        if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-30, 30), this.y + rand(-20, 20), 1);
        if (this.stateT >= this.stunDur) { this.setState('stalk'); this.nextT = 0.5; this.scuttleDir *= -1; }
        break;
      }
    }

    // ---- watchdog: nothing here is allowed to hold the fight up
    if (this.state !== 'stalk' && this.stateT > 6) { this.sub_ = 0; this.mound = null; this.setState('stalk'); this.nextT = 0.6; }
    // ---- facing: everything but the burrow and the spin keeps its front on her
    if (this.state !== 'burrow' && this.state !== 'spin' && this.state !== 'crack' && this.state !== 'stagger')
      this.angle = angleLerp(this.angle, toP, Math.min(1, dt * turn));
    // ---- travel
    if (this.state !== 'burrow') {
      this.moveAng = this.state === 'scuttle' ? this.moveAng : angleLerp(this.moveAng, moveAng, Math.min(1, dt * 4));
      const k = Math.min(1, dt * (this.state === 'scuttle' ? 9 : 2.6));
      this.vx = lerp(this.vx, Math.cos(this.moveAng) * speed, k);
      this.vy = lerp(this.vy, Math.sin(this.moveAng) * speed, k);
      this.x += this.vx * dt; this.y += this.vy * dt;
    } else { this.vx = 0; this.vy = 0; }
    this.x = clamp(this.x, 40, G.ocean.W - 40);
    this.y = clamp(this.y, WATER_TOP + 20, G.ocean.H - 40);
    if (this.state !== 'scuttle' && !this.burrowed) for (const r of G.rocks) {
      const dr = dist(this.x, this.y, r.x, r.y);
      if (dr < r.r + this.radius) { const a = angleTo(r.x, r.y, this.x, this.y); this.x = r.x + Math.cos(a) * (r.r + this.radius); this.y = r.y + Math.sin(a) * (r.r + this.radius); }
    }

    // ---- claws ride in front, one to each shoulder
    for (let i = 0; i < 2; i++) {
      const c = this.claws[i];
      const spread = 0.66 + c.open * 0.10 + (c.lift > 0 ? c.lift * 0.18 : 0);
      const reach = 56 + c.lift * 14;
      c.ang = this.angle + c.side * spread;
      c.x = this.x + Math.cos(c.ang) * reach;
      c.y = this.y + Math.sin(c.ang) * reach;
    }

    // ---- the water knows how heavy this thing is
    const spd = Math.hypot(this.vx, this.vy);
    this.gait += dt * (1.2 + spd * 0.045);
    if (!this.burrowed) {
      if (G.ocean.disturb && spd > 15) G.ocean.disturb(this.x, this.y, Math.min(7, spd / 50), this.vx, this.vy);
      const stx = this.x - Math.cos(this.moveAng) * 34, sty = this.y - Math.sin(this.moveAng) * 34;
      const last = this.wake.pts[this.wake.pts.length - 1];
      if (spd > 26 && (!last || dist(last.x, last.y, stx, sty) > 5)) { this.wake.pts.push({ x: stx, y: sty, t }); G.ocean.addFoam(stx, sty, 0.12 + spd / 1800); }
    }

    this.stepWaves(dt, p);
    this.stepBoulders(dt, p);
  }

  chooseAttack(d) {
    const p2 = this.phase === 2;
    this.cycle++;
    const live = this.liveClaws;
    if (!live.length) {
      // nothing left to slam with
      if (d < 260 && Math.random() < 0.5) { this.setState('spin'); this.say('IT ROLLS', '#ff6161', 10); }
      else { this.scuttleDir = Math.random() < 0.5 ? -1 : 1; this.aimScuttle(); }
      return;
    }
    const roll = Math.random();
    if (p2 && this.cycle % 3 === 0) { this.setState('burrowDown'); Audio_.stun(); G.shake(7); return; }
    if (d < 150) { this.beginSlam(); return; }
    if (d > 320) { if (roll < 0.42) this.setState('rockWind'); else this.aimScuttle(); return; }
    if (roll < 0.40) this.beginSlam();
    else if (roll < 0.78) this.aimScuttle();
    else this.setState('rockWind');
  }
  beginSlam() {
    const live = this.liveClaws;
    const c = live[(Math.random() * live.length) | 0];
    this.armIdx = this.claws.indexOf(c);
    this.windDur = this.phase === 2 ? 0.62 : 0.9;
    this.slamChain = 0;
    const p = G.player;
    this.target.x = p.x; this.target.y = p.y;
    this.setState('slamWind');
    Audio_.tone(150, 0.2, 'sawtooth', 0.1, 60);
  }
  aimScuttle() {
    // it charges ACROSS, not forward: the armoured face never leaves her
    const p = G.player, toP = angleTo(this.x, this.y, p.x, p.y);
    let best = toP + Math.PI / 2 * this.scuttleDir;
    // if that runs it straight into the shore, go the other way
    const ny = this.y + Math.sin(best) * 180, nx = this.x + Math.cos(best) * 180;
    if (ny < WATER_TOP + 50 || ny > G.ocean.H - 50 || nx < 60 || nx > G.ocean.W - 60) { this.scuttleDir *= -1; best = toP + Math.PI / 2 * this.scuttleDir; }
    this.moveAng = best;
    this.setState('scuttleWind');
    this.say('SCUTTLE', '#ffe48f', 9);
  }
  slamLand(tx, ty) {
    const p = G.player, p2 = this.phase === 2;
    G.shake(15); Audio_.stun(); Audio_.splash(2.4);
    G.particles.splash(tx, ty, 4); G.ocean.ripple(tx, ty, 150, 300, 1);
    G.particles.debris(tx, ty, 16, ['#c9a86a', '#a6884f', '#7d6538']);
    Toon.burst(tx, ty, 3.4); Toon.shock(tx, ty, 150, 0.55);
    G.particles.text(tx, ty - 26, 'SLAM!', '#ffe48f', 11);
    if (!p.dead && !p.diving && !p.rolling && p.invuln <= 0 && dist(tx, ty, p.x, p.y) < 56) {
      p.damage((p2 ? 40 : 32) * (1 + (this.diff - 1) * 0.5), tx, ty);
    }
    this.waves.push({ x: tx, y: ty, r: 26, max: 230, life: 0.85, hit: false, dmg: 18 * (1 + (this.diff - 1) * 0.5) });
    if (p2) this.waves.push({ x: tx, y: ty, r: 6, max: 150, life: 1.0, hit: false, dmg: 14 * (1 + (this.diff - 1) * 0.5) });
  }
  eruptBlow() {
    const p = G.player;
    G.shake(20); Audio_.roar(); Audio_.splash(3);
    G.particles.splash(this.x, this.y, 5); G.ocean.ripple(this.x, this.y, 210, 340, 1);
    for (let i = 0; i < 4; i++) G.particles.debris(this.x + rand(-30, 30), this.y + rand(-24, 24), 8, ['#c9a86a', '#e0c78c', '#7d6538']);
    Toon.burst(this.x, this.y, 5); Toon.shock(this.x, this.y, 220, 0.7);
    G.particles.text(this.x, this.y - 40, 'ERUPTION!', '#e0c78c', 12);
    if (!p.dead && !p.diving && !p.rolling && p.invuln <= 0 && dist(this.x, this.y, p.x, p.y) < 78) {
      p.damage(38 * (1 + (this.diff - 1) * 0.5), this.x, this.y);
      const a = angleTo(this.x, this.y, p.x, p.y);
      p.vx += Math.cos(a) * 480; p.vy += Math.sin(a) * 480;
    }
    this.waves.push({ x: this.x, y: this.y, r: 30, max: 200, life: 0.8, hit: false, dmg: 14 * (1 + (this.diff - 1) * 0.5) });
  }
  throwRock(p) {
    const lead = 0.85;
    const tx = clamp(p.x + p.vx * lead + rand(-34, 34), 40, G.ocean.W - 40);
    const ty = clamp(p.y + p.vy * lead + rand(-30, 30), WATER_TOP + 20, G.ocean.H - 40);
    const c = this.liveClaws[0];
    const sx = c ? c.x : this.x, sy = c ? c.y : this.y;
    this.boulders.push({ sx, sy, x: tx, y: ty, t: 0, flight: 1.15, spin: rand(0, TAU), hit: false });
    Audio_.shot('grenade');
    G.particles.debris(sx, sy, 3, ['#6e7684', '#3a3f4a']);
  }
  stepWaves(dt, p) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += dt * (w.max / 0.85); w.life -= dt;
      const dw = dist(w.x, w.y, p.x, p.y);
      if (!w.hit && Math.abs(dw - w.r) < 18 && !p.rolling && !p.diving && !p.dead && p.invuln <= 0) { w.hit = true; p.damage(w.dmg, w.x, w.y); }
      if (w.life <= 0 || w.r > w.max) this.waves.splice(i, 1);
    }
  }
  stepBoulders(dt, p) {
    for (let i = this.boulders.length - 1; i >= 0; i--) {
      const b = this.boulders[i];
      b.t += dt; b.spin += dt * 4;
      if (b.t >= b.flight) {
        this.boulders.splice(i, 1);
        G.particles.splash(b.x, b.y, 3); G.ocean.ripple(b.x, b.y, 90, 190, 0.8);
        G.particles.debris(b.x, b.y, 12, ['#6e7684', '#3a3f4a', '#aab4c2']);
        G.shake(7); Audio_.explosion(0.7);
        Toon.shock(b.x, b.y, 70, 0.4);
        if (!p.dead && !p.diving && !p.rolling && p.invuln <= 0 && dist(b.x, b.y, p.x, p.y) < 46)
          p.damage(22 * (1 + (this.diff - 1) * 0.5), b.x, b.y);
      }
    }
  }
  crash(rock) {
    this.setState('stagger');
    this.stunDur = 2.6;
    this.vx *= -0.15; this.vy *= -0.15;
    const a = angleTo(rock.x, rock.y, this.x, this.y);
    this.x = rock.x + Math.cos(a) * (rock.r + this.radius); this.y = rock.y + Math.sin(a) * (rock.r + this.radius);
    G.particles.splash(this.x, this.y, 4); G.particles.debris(this.x, this.y, 16, ['#7c818b', '#5e636d', '#9a9ea8']);
    G.particles.sparks(this.x, this.y, 14); G.shake(16); Audio_.stun();
    G.ocean.ripple(this.x, this.y, 130, 280, 1);
    Toon.burst(this.x, this.y, 3.2); Toon.shock(this.x, this.y, 150, 0.6);
    for (let i = 0; i < 4; i++) Toon.emote(this.x + rand(-26, 26), this.y - 34, 'star');
    G.banner('SHELL FIRST! HIT IT NOW', '#ffe48f', 1.4);
    G.particles.text(this.x, this.y - 44, 'CRUNCH!', '#ffe48f', 12);
    this.shell -= 90; this.hp -= 30;
    if (G.stats) G.stats.bossCrashes++;
    if (this.shell <= 0 && this.phase === 1) this.crackShell();
  }

  // ------------------------------------------------------------- damage
  hit(dmg, kx, ky, proj) {
    if (this.dead || this.state === 'enter' || this.state === 'crack') return;
    // where did it come from? front armour is the whole fight
    let from;
    if (proj && typeof proj.x === 'number') from = angleTo(this.x, this.y, proj.x, proj.y);
    else if (kx || ky) from = Math.atan2(-ky, -kx);
    else from = angleTo(this.x, this.y, G.player.x, G.player.y);
    const off = Math.abs(angleDiff(this.angle, from));

    // a claw in the way takes the hit itself
    if (proj && typeof proj.x === 'number') {
      for (const c of this.claws) {
        if (c.dead) continue;
        if (dist(proj.x, proj.y, c.x, c.y) < 26) { this.hitClaw(c, dmg, proj); return; }
      }
    }

    const armour = off < 1.05 ? 0.12 : off < 2.1 ? 0.7 : 1.55;
    let mult = armour;
    if (this.exposed) mult *= 2.2;
    if (this.burrowed) mult *= 0.12;
    if (this.claws[0].dead && this.claws[1].dead) mult *= 1.2;
    let real = dmg * mult;

    if (armour < 0.2) {
      // it bounced off the face
      G.particles.sparks(this.x + Math.cos(from) * 40, this.y + Math.sin(from) * 40, 6, from, 0.9);
      G.particles.text(this.x + Math.cos(from) * 46, this.y + Math.sin(from) * 46 - 8, 'CLANG', '#c8d0d8', 7);
      Audio_.tone(420, 0.06, 'square', 0.08, -200);
    }

    if (this.shell > 0 && this.phase === 1) {
      this.shell -= real;
      real *= 0.35;                       // the body only feels a third of it
      if (this.shell <= 0) { this.hp -= real; this.crackShell(); return; }
    }
    this.hp -= real;
    this.flash = 0.08;
    if (G.stats) G.stats.damageDealt += real;
    G.particles.sparks(this.x, this.y, 3);
    if (armour > 1) G.particles.blood(this.x, this.y, 0.4);
    Toon.impact(this.x, this.y, this.exposed ? 1.6 : 0.7, this.exposed ? '#ffe48f' : '#ffffff');
    G.particles.text(this.x + rand(-12, 12), this.y - 34, Math.round(real) + (this.exposed ? '!' : ''),
      this.exposed ? '#ffe48f' : armour > 1 ? '#6fd88e' : '#c8d0d8', this.exposed ? 9 : 7);
    Audio_.hit();
    if (this.hp <= 0) this.die();
    else if (this.phase === 1 && this.hp <= this.maxHp * 0.5) this.crackShell();
  }
  hitClaw(c, dmg, proj) {
    c.hp -= dmg; c.flash = 0.08;
    this.hp -= dmg * 0.22;
    if (G.stats) G.stats.damageDealt += dmg;
    G.particles.sparks(c.x, c.y, 4);
    G.particles.text(c.x + rand(-8, 8), c.y - 20, Math.round(dmg), '#ffd27a', 7);
    Toon.impact(c.x, c.y, 0.8, '#ffd27a');
    Audio_.hit();
    if (c.hp <= 0) this.breakClaw(c);
    if (this.hp <= 0) this.die();
  }
  breakClaw(c) {
    c.dead = true; c.hp = 0;
    G.shake(12); Audio_.stun();
    G.particles.explode(c.x, c.y, 46, { debris: 16, debrisColors: ['#9c3a21', '#e08a44', '#c2545e'] });
    G.particles.blood(c.x, c.y, 2.2); G.ocean.splatBlood(c.x, c.y, 3, 30);
    Toon.burst(c.x, c.y, 3.4);
    G.particles.text(c.x, c.y - 30, 'CLAW OFF!', '#6fd88e', 12);
    G.banner(this.claws[0].dead && this.claws[1].dead ? 'BOTH CLAWS ARE OFF' : 'A CLAW COMES OFF', '#6fd88e', 1.6);
    this.shell -= 110;
    if (this.shell <= 0 && this.phase === 1) this.crackShell();
    if (this.state === 'slamWind' && this.claws[this.armIdx] === c) { this.setState('stagger'); this.stunDur = 1.6; }
  }
  crackShell() {
    if (this.phase === 2) return;
    this.phase = 2; this.shell = 0;
    this.setState('crack');
    Audio_.roar(); G.shake(18);
    G.banner('THE SHELL CRACKS', '#ff6161', 2.2, 'It stops hiding behind it');
    G.particles.explode(this.x, this.y, 70, { debris: 24, debrisColors: ['#9c3a21', '#e08a44', '#c2545e'] });
    G.particles.blood(this.x, this.y, 2.4); G.ocean.splatBlood(this.x, this.y, 4, 40);
    G.ocean.ripple(this.x, this.y, 200, 320, 1);
    Toon.burst(this.x, this.y, 5); Toon.shock(this.x, this.y, 240, 0.8);
    for (const pr of G.projectiles) if (pr.owner === 'player') pr.dead = true;
  }
  die() {
    if (this.dead) return;
    this.dead = true; this.wake.dead = true;
    this.waves.length = 0; this.boulders.length = 0;
    G.particles.explode(this.x, this.y, 100, { debris: 34, debrisColors: ['#9c3a21', '#e08a44', '#c2545e', '#f3b268'] });
    G.particles.blood(this.x, this.y, 4); G.ocean.splatBlood(this.x, this.y, 5, 80); G.shake(24);
    Toon.burst(this.x, this.y, 5); Toon.shock(this.x, this.y, 260, 0.9);
    for (let i = 0; i < 3; i++) setTimeout(() => {
      if (!G || !G.particles) return;
      G.particles.explode(this.x + rand(-46, 46), this.y + rand(-36, 36), 54, { debris: 10, debrisColors: ['#9c3a21', '#e08a44'] });
      G.particles.blood(this.x + rand(-30, 30), this.y + rand(-30, 30), 3);
    }, 250 + i * 300);
    const drops = { metal: 12, wood: 8, fuel: 8, powder: 12, tech: 12 };
    for (const k in drops) for (let i = 0; i < drops[k]; i++) G.pickups.push(new Pickup(this.x, this.y, k));
    if (G.stats) G.stats.kills++;
    if (G.onBossKilled) G.onBossKilled();
  }

  // ------------------------------------------------------------- render
  render(ctx, cam, t) {
    if (this.dead) return;
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);
    const p2 = this.phase === 2;
    const A = this.art;

    // ---------------- telegraphs on the water, under everything
    for (const w of this.waves) {
      const a = clamp(w.life, 0, 1);
      mbRing(ctx, Math.round(w.x - cam.x), Math.round(w.y - cam.y), Math.round(w.r), a > 0.5 ? '#eaf8ff' : '#8ac6ff', 46, 0.8, t * 0.6, 3);
      mbRing(ctx, Math.round(w.x - cam.x), Math.round(w.y - cam.y), Math.round(w.r) - 3, '#c9a86a', 40, 0.8, -t * 0.4, 4);
    }
    for (const b of this.boulders) {
      const u = clamp(b.t / b.flight, 0, 1);
      const mx = Math.round(b.x - cam.x), my = Math.round(b.y - cam.y);
      mbMark(ctx, mx, my, u, t, u > 0.8 ? '#ffffff' : '#c8d0d8', '#8b94a3');
      const bx = b.sx + (b.x - b.sx) * u, by = b.sy + (b.y - b.sy) * u;
      const z = Math.sin(u * Math.PI) * 46;
      const px2 = Math.round(bx - cam.x), py2 = Math.round(by - cam.y);
      ctx.fillStyle = 'rgba(6,18,48,0.34)'; ctx.fillRect(px2 - 5, py2 - 3, 11, 6);
      drawSprite(ctx, A.rock, px2, py2 - z, b.spin);
    }
    if (this.state === 'slamWind') {
      const k = clamp(this.stateT / this.windDur, 0, 1), hot = k > 0.72;
      const mx = Math.round(this.target.x - cam.x), my = Math.round(this.target.y - cam.y);
      mbMark(ctx, mx, my, k, t, hot && Math.sin(t * 40) > 0 ? '#ffffff' : '#ff6161', '#ffd27a');
      const rr = Math.round(56 * (0.4 + k * 0.6));
      mbRing(ctx, mx, my, rr, hot ? '#ffffff' : '#ffd27a', 44, 0.8, t * 1.4, 3);
      ctx.fillStyle = hot ? '#ffffff' : '#ffd27a';
      ctx.fillRect(mx - 6, my, 13, 1); ctx.fillRect(mx, my - 6, 1, 13);
    }
    if (this.state === 'scuttleWind') {
      const k = clamp(this.stateT / (p2 ? 0.55 : 0.8), 0, 1), hot = k > 0.7;
      const col = hot && Math.sin(t * 40) > 0 ? '#ffffff' : '#ff6161';
      for (const off of [-26, 0, 26]) {
        const ox = Math.cos(this.moveAng + Math.PI / 2) * off, oy = Math.sin(this.moveAng + Math.PI / 2) * off;
        mbDashLine(ctx, sx + ox, sy + oy, sx + ox + Math.cos(this.moveAng) * 300, sy + oy + Math.sin(this.moveAng) * 300, t, col, '#ffd27a', 2);
      }
      mbArcDots(ctx, sx, sy, 60, this.moveAng - 0.5, this.moveAng + 0.5, col, 0, 3);
    }
    if (this.state === 'burrow' || this.state === 'burrowDown' || (this.state === 'erupt' && this.stateT < 0.45)) {
      // the mound: the only thing on the water while it is under the sand
      const r = this.state === 'burrowDown' ? 30 + this.stateT * 24 : 46 + Math.sin(t * 9) * 4;
      bxDisc(ctx, sx, sy, Math.round(r), 'rgba(160,132,78,0.5)', 0.66);
      bxDisc(ctx, sx, sy, Math.round(r * 0.62), 'rgba(201,168,106,0.75)', 0.66);
      bxDisc(ctx, sx, sy, Math.round(r * 0.3), '#e0c78c', 0.66);
      mbRing(ctx, sx, sy, Math.round(r), '#e0c78c', 40, 0.66, t * 0.8, 3);
      if (this.state === 'erupt') {
        const k = clamp(this.stateT / 0.45, 0, 1);
        mbRing(ctx, sx, sy, Math.round(20 + k * 70), Math.sin(t * 40) > 0 ? '#ffffff' : '#ff6161', 48, 0.7, -t * 2, 2);
      }
      if (this.state === 'burrow') {
        for (let q = 0; q < 6; q++) {
          const a = t * 2 + q, rr = r + 10 + (q % 3) * 6;
          ctx.fillStyle = '#a6884f';
          ctx.fillRect(Math.round(sx + Math.cos(a) * rr), Math.round(sy + Math.sin(a) * rr * 0.66), 2, 2);
        }
      }
      if (this.sub_ > 0.9) { this.renderBars(ctx, sx, sy - 10); return; }
    }

    const bob = Math.round(Math.sin(t * 1.7 + this.bob) * 1);
    const sink = Math.round(this.sub_ * 16);
    const hurt = this.flash > 0 || (this.exposed && Math.floor(t * 8) % 2 === 0);

    // ---------------- legs: eight of them, and they carry the weight
    this.renderLegs(ctx, sx, sy + bob + sink, t);

    // ---------------- the arms reach out to the claws, under the shell
    for (const c of this.claws) {
      if (c.dead) continue;
      const cxp = Math.round(c.x - cam.x), cyp = Math.round(c.y - cam.y) + bob + sink;
      const shx = sx + Math.cos(this.angle + c.side * 0.95) * 34, shy = sy + bob + sink + Math.sin(this.angle + c.side * 0.95) * 34;
      const mx = (shx + cxp) / 2 + Math.cos(this.angle + c.side * 1.8) * 12;
      const my = (shy + cyp) / 2 + Math.sin(this.angle + c.side * 1.8) * 12;
      bxLimb(ctx, shx, shy, mx, my, 12, 10, '#9c3a21', '#e08a44', '#180a10');
      bxLimb(ctx, mx, my, cxp, cyp, 10, 9, '#c25c2c', '#f3b268', '#180a10');
    }

    // ---------------- the carapace
    const spr = p2 ? (hurt ? A.crackedHurt : A.cracked) : (hurt ? A.shellHurt : A.shell);
    ctx.save();
    ctx.translate(sx, sy + bob + sink);
    ctx.rotate(this.angle);
    const heave = this.state === 'scuttle' ? 1.06 : 1;
    ctx.scale(heave, 2 - heave);
    ctx.drawImage(spr.c, -spr.ax, -spr.ay);
    ctx.restore();

    // ---------------- eyes on stalks, front and centre, looking at her
    {
      const look = angleTo(this.x, this.y, G.player.x, G.player.y);
      for (const s of [-1, 1]) {
        const ba = this.angle + s * 0.30, br = 30;
        const bx0 = sx + Math.cos(ba) * br, by0 = sy + bob + sink + Math.sin(ba) * br;
        const ea = this.angle + s * 0.22 + Math.sin(t * 1.3 + s) * 0.06;
        const ex = bx0 + Math.cos(ea) * 13, ey = by0 + Math.sin(ea) * 13;
        bxLimb(ctx, bx0, by0, ex, ey, 5, 4, '#c25c2c', '#f3b268', '#180a10');
        ctx.fillStyle = '#180a10'; ctx.fillRect(Math.round(ex) - 3, Math.round(ey) - 3, 6, 6);
        ctx.fillStyle = this.exposed && Math.floor(t * 9) % 2 ? '#ff6161' : '#1a1a22';
        ctx.fillRect(Math.round(ex) - 2, Math.round(ey) - 2, 4, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(ex + Math.cos(look) * 1) - 1, Math.round(ey + Math.sin(look) * 1) - 1, 1, 1);
      }
    }

    // ---------------- the claws themselves, over the top
    for (const c of this.claws) {
      if (c.dead) {
        // a torn stump, so a missing claw reads instantly
        const shx = sx + Math.cos(this.angle + c.side * 0.95) * 34, shy = sy + bob + sink + Math.sin(this.angle + c.side * 0.95) * 34;
        const ex = shx + Math.cos(this.angle + c.side * 1.4) * 18, ey = shy + Math.sin(this.angle + c.side * 1.4) * 18;
        bxLimb(ctx, shx, shy, ex, ey, 11, 5, '#72251a', '#9c3a21', '#180a10');
        ctx.fillStyle = Math.floor(t * 6) % 2 ? '#c2545e' : '#8f2f3a';
        ctx.fillRect(Math.round(ex) - 3, Math.round(ey) - 3, 6, 6);
        continue;
      }
      const cxp = Math.round(c.x - cam.x), cyp = Math.round(c.y - cam.y) + bob + sink;
      const ch = c.flash > 0 ? A.clawHurt : A.claw;
      const jh = c.flash > 0 ? A.jawHurt : A.jaw;
      const raise = 1 + Math.max(0, c.lift) * 0.22;
      ctx.save();
      ctx.translate(cxp, cyp - Math.round(Math.max(0, c.lift) * 7));
      // the pair is mirrored, so both pincers face in at each other
      ctx.rotate(this.angle - c.side * (0.26 + c.open * 0.16));
      ctx.scale(raise, raise * c.side);
      ctx.drawImage(ch.c, -ch.ax, -ch.ay);
      ctx.save();
      ctx.translate(8, -5);
      ctx.rotate(-c.open * 0.9 - 0.06);
      ctx.drawImage(jh.c, -jh.ax, -jh.ay);
      ctx.restore();
      ctx.restore();
      // claw condition pip, only once it has been worked on
      if (c.hp < c.max) bxPips(ctx, cxp - 12, cyp - 26, 24, c.hp / c.max, '#ffd27a', '#2a2f38', '#14141c');
    }

    if (this.state === 'crack') {
      ctx.strokeStyle = `rgba(255,80,60,${(0.6 + Math.sin(t * 30) * 0.3).toFixed(2)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, sy, 50 + this.stateT * 80, 40 + this.stateT * 60, 0, 0, TAU); ctx.stroke();
    }
    if (this.exposed) for (let i = 0; i < 3; i++) { const a = t * 5 + i * TAU / 3; drawSprite(ctx, SP.star, sx + Math.cos(a) * 30, sy - 44 + Math.sin(a) * 7); }

    this.renderBars(ctx, sx, sy - 56);
  }
  renderBars(ctx, sx, sy) {
    // the shell is a second health bar and it is the one that matters first
    if (this.phase === 1) {
      bxPips(ctx, sx - 32, sy, 64, this.shell / this.shellMax, '#f3b268', '#3a2413', '#14141c');
      // a row of little plates over the bar: this is the SHELL, not the body
      ctx.fillStyle = '#f3b268';
      for (let q = 0; q < 5; q++) ctx.fillRect(sx - 32 + q * 14, sy - 5, 4, 2);
    } else {
      // cracked: the bar is gone and the split plates hang open
      ctx.fillStyle = '#14141c'; ctx.fillRect(sx - 33, sy - 1, 66, 5);
      ctx.fillStyle = '#8f2f3a'; ctx.fillRect(sx - 32, sy, 64, 3);
      ctx.fillStyle = Math.floor(sy + this.hp) % 2 ? '#c2545e' : '#e0808a';
      for (let q = 0; q < 8; q++) ctx.fillRect(sx - 30 + q * 8, sy, 3, 3);
    }
  }
  renderLegs(ctx, sx, sy, t) {
    const drive = Math.hypot(this.vx, this.vy) / 260;
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const phase = this.gait + i * 1.15 + (s > 0 ? Math.PI : 0);
      const swing = Math.sin(phase) * (0.16 + drive * 0.3);
      const lift = Math.cos(phase) > 0 ? 1 : 0;            // stepping vs planted
      const base = this.angle + s * (Math.PI / 2) + (1.5 - i) * 0.40;
      const hipA = this.angle + s * (Math.PI / 2 - 0.16) + (1.5 - i) * 0.36;
      const hipR = 32 - Math.abs(1.5 - i) * 3;
      const hx = sx + Math.cos(hipA) * hipR, hy = sy + Math.sin(hipA) * hipR;
      const a1 = base + swing;
      const kx = hx + Math.cos(a1) * (17 + lift * 2), ky = hy + Math.sin(a1) * (17 + lift * 2);
      const a2 = a1 + s * (1.15 - lift * 0.35) - swing * 0.6;
      const ex2 = kx + Math.cos(a2) * (18 - lift * 3), ey2 = ky + Math.sin(a2) * (18 - lift * 3);
      const a3 = a2 + s * (0.55 + lift * 0.2);
      const fx = ex2 + Math.cos(a3) * (15 - lift * 3), fy = ey2 + Math.sin(a3) * (15 - lift * 3);
      bxLimb(ctx, hx, hy, kx, ky, 9, 7, lift ? '#8e3220' : '#72251a', '#c25c2c', '#180a10');
      bxLimb(ctx, kx, ky, ex2, ey2, 7, 5, lift ? '#c25c2c' : '#9c3a21', '#e08a44', '#180a10');
      bxLimb(ctx, ex2, ey2, fx, fy, 5, 2, lift ? '#e08a44' : '#c25c2c', '#f3b268', '#180a10');
      ctx.fillStyle = '#180a10'; ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
    }
  }
}

// ===========================================================================
//  BOSS 3 — THE DEEP LANTERN
//
//  An anglerfish. It brings the deep up with it: the bay goes black and the
//  only thing you can see is its lure. The fight is about what you can and
//  cannot see, and about not swimming toward the light.
//
//    phase 1  THE DARK   near-total darkness. The lure drags her toward it.
//                        A vast telegraphed bite comes out of the black, a
//                        scatter of little lights turns out to be teeth, and
//                        it goes under her and comes up.
//    phase 2  SURFACED   it breaches. The dark lifts, you finally see the
//                        whole animal, and it fights in the open — until it
//                        snuffs the lure and puts the lights out again.
//
//  The lure itself is a weak point: shoot it for double, and the bay gets
//  darker for a second and a half while it relights.
// ===========================================================================

let ANG_ART = null;
function anglerArt() {
  if (ANG_ART) return ANG_ART;
  const DARK = ['#05070c', '#0b1018', '#131a26', '#1d2634', '#2a3648', '#3b4a60', '#51637d'];
  const LIT = ['#080d14', '#101a26', '#1b2938', '#28394c', '#3a5166', '#527087', '#7a9bb4'];
  const OUT = '#02040a';

  function buildBody(ramp) {
    const W = 196, H = 172, cx = 84, cy = 86;     // art px (98 x 86 world)
    const f = blobField(W, H, [
      { x: cx + 34, y: cy, rx: 52, ry: 62 },       // the head IS the animal
      { x: cx + 4, y: cy, rx: 42, ry: 50 },
      { x: cx - 34, y: cy, rx: 24, ry: 28 },
      { x: cx - 58, y: cy, rx: 14, ry: 18 },       // tail root
      { x: cx + 46, y: cy - 46, rx: 22, ry: 16 },  // gill shoulders
      { x: cx + 46, y: cy + 46, rx: 22, ry: 16 },
      { x: cx + 14, y: cy - 52, rx: 20, ry: 12 },  // pectorals
      { x: cx + 14, y: cy + 52, rx: 20, ry: 12 },
    ]);
    const s = shadeBlob(W, H, f, ramp, { outline: OUT, lx: -0.5, ly: -0.78, contrast: 0.84, lift: 0.2, smooth: 4 });
    const q = s.ctx;
    const ins = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0;
    // a spined dorsal ridge down the middle
    for (let x = cx - 56; x < cx + 44; x++) {
      if (!ins(x, cy)) continue;
      px(q, ramp[1], x, cy - 1, 1, 3);
      if ((x & 7) === 0) { px(q, ramp[5], x, cy - 4, 1, 4); px(q, OUT, x, cy - 5, 1, 1); }
    }
    // loose sagging skin: horizontal posterized folds
    for (const s2 of [-1, 1]) for (let i = 0; i < 4; i++) {
      const yy = Math.round(cy + s2 * (15 + i * 12));
      for (let x = cx - 46; x < cx + 56; x++) {
        if (!ins(x, yy)) continue;
        if (((x + i) % 5) < 3) { px(q, ramp[1], x, yy, 1, 1); px(q, ramp[4], x, yy - 1, 1, 1); }
      }
    }
    // pallid speckling, the only light thing on it
    const rng = new SeededRandom(0xdeadbee);
    for (let i = 0; i < 70; i++) {
      const x = Math.round(rng.range(8, W - 8)), y = Math.round(rng.range(8, H - 8));
      if (!ins(x, y)) continue;
      px(q, ramp[5], x, y, 1, 1);
      if (rng.next() < 0.3) px(q, ramp[6], x, y, 1, 1);
    }
    // the eye: small, dead, high on the head
    for (const s2 of [-1, 1]) {
      const ex = cx + 52, ey = cy + s2 * 26;
      px(q, OUT, ex - 4, ey - 4, 9, 9);
      px(q, '#b9c9d8', ex - 3, ey - 3, 7, 7);
      px(q, '#0a0d14', ex - 2, ey - 1, 4, 4);
      px(q, '#ffffff', ex - 1, ey - 1, 1, 1);
    }
    // tail fin, a ragged fan
    for (let i = -20; i <= 20; i++) {
      const len = 20 - Math.abs(i) * 0.4 + ((i & 3) === 0 ? 5 : 0);
      for (let q2 = 0; q2 < len; q2++) {
        const x = cx - 70 - q2, y = cy + Math.round(i * (1 + q2 * 0.07));
        if (x < 1 || y < 1 || y > H - 2) continue;
        px(q, (q2 & 1) ? ramp[1] : ramp[2], x, y, 1, 1);
      }
    }
    return spriteFromHi(s.c, cx, cy);
  }

  // one jaw wedge, hinged at the inner corner, teeth along its biting edge
  function buildJaw(ramp) {
    const W = 96, H = 54, hx = 8, hy = 46;
    const f = blobField(W, H, [
      { x: 16, y: hy - 8, rx: 16, ry: 14 },
      { x: 46, y: hy - 12, rx: 28, ry: 15 },
      { x: 78, y: hy - 8, rx: 18, ry: 9 },
    ]);
    const s = shadeBlob(W, H, f, ramp, { outline: OUT, lx: -0.5, ly: -0.8, contrast: 0.86, lift: 0.22, smooth: 3 });
    const q = s.ctx;
    const ins = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0;
    // find the lower edge of the wedge and hang teeth off it
    for (let x = 10; x < W - 6; x += 5) {
      let by = -1;
      for (let y = H - 1; y >= 0; y--) if (ins(x, y)) { by = y; break; }
      if (by < 0) continue;
      const len = 5 + ((x >> 2) % 3) * 3;
      for (let k = 0; k < len; k++) {
        const w = Math.max(1, 4 - Math.round(k * 4 / len));
        px(q, OUT, x - (w >> 1) - 1, by + k, w + 2, 1);
        px(q, k < 2 ? '#e8eef5' : '#f8fbff', x - (w >> 1), by + k, w, 1);
      }
    }
    return spriteFromHi(s.c, hx, hy);
  }

  function buildTooth() {
    const c = newCanHi(9, 5), q = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const w = Math.max(1, 5 - Math.round(i * 5 / 16));
      px(q, '#02040a', i, 5 - (w >> 1) - 1, 1, w + 2);
      px(q, i < 4 ? '#8ae6ff' : '#f8fbff', i, 5 - (w >> 1), 1, w);
    }
    return spriteFromHi(c, 2, 5);
  }

  const body = buildBody(DARK), bodyLit = buildBody(LIT);
  ANG_ART = {
    body, bodyLit,
    bodyHurt: tintHi(bodyLit, '#ffffff', 0.8),
    jaw: buildJaw(DARK), jawLit: buildJaw(LIT), tooth: buildTooth(),
  };
  return ANG_ART;
}

// ---- the darkness. A chunky posterized field, one cell per 10 world units,
// rasterized into a tiny canvas and blown up with nearest-neighbour so the
// bands stay hard. Lights punch holes in it; nothing here is a gradient.
const ANG_CELL = 10;
let ANG_DARKC = null;
function angDarkness(ctx, cam, lights, maxDark) {
  if (maxDark <= 0.01) return;
  const gx0 = Math.floor(cam.x / ANG_CELL) - 1, gy0 = Math.floor(cam.y / ANG_CELL) - 1;
  const gw = Math.ceil(VIEW_W / ANG_CELL) + 3, gh = Math.ceil(VIEW_H / ANG_CELL) + 3;
  if (!ANG_DARKC || ANG_DARKC.c.width !== gw || ANG_DARKC.c.height !== gh) {
    const c = newCan(gw, gh);
    ANG_DARKC = { c, ctx: c.getContext('2d'), img: c.getContext('2d').createImageData(gw, gh), lit: new Float32Array(gw * gh) };
  }
  const D = ANG_DARKC, lit = D.lit;
  lit.fill(0);
  for (const L of lights) {
    const r = L.r; if (r <= 0 || L.s <= 0) continue;
    const cx0 = Math.max(0, Math.floor((L.x - r) / ANG_CELL) - gx0), cx1 = Math.min(gw - 1, Math.ceil((L.x + r) / ANG_CELL) - gx0);
    const cy0 = Math.max(0, Math.floor((L.y - r) / ANG_CELL) - gy0), cy1 = Math.min(gh - 1, Math.ceil((L.y + r) / ANG_CELL) - gy0);
    const r2 = r * r;
    for (let gy = cy0; gy <= cy1; gy++) {
      const wy = (gy0 + gy + 0.5) * ANG_CELL;
      for (let gx = cx0; gx <= cx1; gx++) {
        const wx = (gx0 + gx + 0.5) * ANG_CELL;
        const dx = wx - L.x, dy = wy - L.y, q = dx * dx + dy * dy;
        if (q >= r2) continue;
        const v = (1 - Math.sqrt(q) / r) * L.s;
        const i = gy * gw + gx;
        if (v > lit[i]) lit[i] = v;
      }
    }
  }
  const d = D.img.data;
  for (let i = 0, n = gw * gh; i < n; i++) {
    let v = 1 - lit[i]; if (v < 0) v = 0;
    const band = Math.round(v * 5) / 5;                 // six hard steps
    d[i * 4] = 3; d[i * 4 + 1] = 7; d[i * 4 + 2] = 16;
    d[i * 4 + 3] = Math.round(band * maxDark * 255);
  }
  D.ctx.putImageData(D.img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(D.c, gx0 * ANG_CELL - cam.x, gy0 * ANG_CELL - cam.y, gw * ANG_CELL, gh * ANG_CELL);
  ctx.restore();
}

class AnglerBoss {
  constructor(x, y, difficulty = 1) {
    this.key = 'angler';
    this.art = anglerArt();
    this.diff = difficulty || 1;
    this.name = 'THE DEEP LANTERN';
    this.sub = 'Do not swim toward the light';
    this.color = '#8ae6ff';
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.maxHp = Math.round(1500 * (0.9 + 0.1 * this.diff)); this.hp = this.maxHp;
    this.radius = 48;
    this.angle = angleTo(x, y, G.player.x, G.player.y);
    this.phase = 1; this.dead = false; this.flash = 0;
    this.state = 'arrive'; this.stateT = 0; this.nextT = 2.4;
    this.dark = 0; this.darkWant = 0.94;
    this.mouth = 0; this.lureOut = 0; this.lureSway = rand(0, TAU);
    this.lure = { x, y, r: 0 };
    this.surf = 0; this.blackT = 0; this.cycle = 0;
    this.motes = []; this.snaps = []; this.drift = [];
    this.wake = G.ocean.newWake(this, 12);
    this.bob = rand(0, TAU); this.hitOnce = false;
    G.banner(this.name, this.color, 2.4, this.sub);
  }
  get stunned() { return this.exposed; }
  get exposed() { return this.state === 'biteRec' || this.state === 'beached'; }
  get submerged() { return this.state === 'dive' || this.state === 'under'; }
  get phaseName() { return this.phase === 2 ? 'SURFACED' : 'THE DARK'; }
  get lureLit() { return this.lureOut <= 0 && !this.submerged; }
  setState(s) { this.state = s; this.stateT = 0; this.hitOnce = false; }
  say(msg, col, size) { G.particles.text(this.x, this.y - 40, msg, col || this.color, size || 9); }

  // ------------------------------------------------------------- update
  update(dt, t) {
    if (this.dead) return;
    const p = G.player;
    this.stateT += dt; this.flash -= dt; this.lureOut -= dt; this.lureSway += dt * 1.3;
    const d = dist(this.x, this.y, p.x, p.y), toP = angleTo(this.x, this.y, p.x, p.y);
    const p2 = this.phase === 2;
    let speed = 0, desired = this.angle, turn = p2 ? 2.0 : 1.3;

    switch (this.state) {
      case 'arrive': {
        desired = toP; speed = 70;
        this.darkWant = 0.94;
        if (this.stateT > 2.0) { this.setState('lurk'); this.nextT = 2.0; }
        break;
      }
      case 'lurk': case 'lurk2': {
        // it holds off and lets the lure do the work
        const ring = p2 ? 150 : 215;
        if (d > ring + 70) { desired = toP; speed = p2 ? 110 : 74; }
        else if (d < ring - 60) { desired = toP + Math.PI; speed = p2 ? 96 : 62; }
        else { desired = toP + Math.PI / 2 * (Math.sin(t * 0.3) > 0 ? 1 : -1); speed = p2 ? 92 : 56; }
        this.pull(dt, p);
        this.nextT -= dt;
        if (this.nextT <= 0) this.chooseAttack(d);
        break;
      }
      case 'biteWind': {
        desired = toP; speed = 12;
        const k = clamp(this.stateT / this.windDur, 0, 1);
        this.mouth = k;
        if (k < 0.6) this.biteAng = toP;
        if (Math.random() < 0.5) G.particles.bubbles(this.x + Math.cos(this.angle) * 40 + rand(-20, 20), this.y + Math.sin(this.angle) * 40 + rand(-16, 16), 1);
        if (this.stateT >= this.windDur) {
          this.setState('bite'); this.angle = this.biteAng;
          Audio_.roar(); G.shake(7);
          G.particles.splash(this.x, this.y, 2.4);
        }
        break;
      }
      case 'bite': {
        desired = this.biteAng; speed = p2 ? 600 : 520; turn = 0.6;
        this.mouth = 1;
        G.ocean.addFoam(this.x, this.y, 0.5);
        for (let i = 0; i < 2; i++) G.particles.spray(this.x + Math.cos(this.angle) * 40, this.y + Math.sin(this.angle) * 40, this.angle + (i ? 1.3 : -1.3), 2, 170);
        const mx = this.x + Math.cos(this.angle) * 34, my = this.y + Math.sin(this.angle) * 34;
        if (!this.hitOnce && !p.dead && !p.diving && !p.rolling && p.invuln <= 0 && dist(mx, my, p.x, p.y) < 54) {
          this.hitOnce = true;
          p.damage((p2 ? 46 : 40) * (1 + (this.diff - 1) * 0.5), mx, my);
          p.vx += Math.cos(this.angle) * 430; p.vy += Math.sin(this.angle) * 430;
          G.particles.blood(p.x, p.y, 2); G.shake(14);
          G.particles.text(p.x, p.y - 30, 'BITTEN!', '#ff6161', 11);
        }
        if (this.stateT > 0.62) this.setState('biteRec');
        break;
      }
      case 'biteRec': {
        desired = this.angle; speed = 20;
        this.mouth = Math.max(0.35, 1 - this.stateT * 0.6);
        if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-30, 30), this.y + rand(-24, 24), 1);
        if (this.stateT >= (p2 ? 1.1 : 1.45)) { this.mouth = 0; this.setState(p2 ? 'lurk2' : 'lurk'); this.nextT = rand(1.0, 1.8); }
        break;
      }
      case 'cast': {
        desired = toP; speed = 30;
        if (this.stateT > 0.45 && !this.hitOnce) { this.hitOnce = true; this.castTeeth(p); }
        if (this.stateT > 0.9) { this.setState(p2 ? 'lurk2' : 'lurk'); this.nextT = rand(1.4, 2.4); }
        break;
      }
      case 'spit': {
        desired = toP; speed = 40;
        this.mouth = clamp(this.stateT / 0.5, 0, 1) * 0.7;
        if (this.stateT > 0.5 && !this.hitOnce) { this.hitOnce = true; this.spitTeeth(toP); }
        if (this.stateT > 0.9) { this.mouth = 0; this.setState('lurk2'); this.nextT = rand(1.2, 2.0); }
        break;
      }
      case 'dive': {
        desired = toP; speed = 60;
        this.surf = Math.max(0, this.surf - dt * 2);
        if (Math.random() < 0.6) G.particles.bubbles(this.x + rand(-26, 26), this.y + rand(-20, 20), 2);
        if (this.stateT > 0.75) { this.setState('under'); this.say('IT IS GONE', '#5e7f98', 8); }
        break;
      }
      case 'under': {
        // it is directly under her and there is nothing to shoot
        const a = angleTo(this.x, this.y, p.x, p.y);
        const sp = p2 ? 300 : 250;
        this.x += Math.cos(a) * sp * dt; this.y += Math.sin(a) * sp * dt;
        this.angle = angleLerp(this.angle, a, dt * 3);
        if (Math.random() < 0.7) G.particles.bubbles(this.x + rand(-24, 24), this.y + rand(-20, 20), 1);
        if (Math.random() < 0.3) G.ocean.ripple(this.x, this.y, 36, 80, 0.35);
        if (this.stateT > 0.6 && (d < 52 || this.stateT > 3.2)) { this.setState('surge'); G.shake(5); }
        break;
      }
      case 'surge': {
        speed = 0;
        if (this.stateT < 0.42) {
          this.surf = this.stateT / 0.42 * 0.5;
          if (Math.random() < 0.7) G.particles.bubbles(this.x + rand(-36, 36), this.y + rand(-30, 30), 2);
        } else {
          if (!this.hitOnce) { this.hitOnce = true; this.surgeBlow(); }
          this.surf = Math.min(1, 0.5 + (this.stateT - 0.42) * 2);
          if (this.stateT > 0.85) {
            if (!p2) this.surf = 0;
            this.setState(p2 ? 'lurk2' : 'lurk'); this.nextT = rand(1.2, 2.0);
          }
        }
        break;
      }
      case 'breach': {
        speed = 26; desired = toP;
        this.surf = clamp(this.stateT / 1.2, 0, 1);
        this.darkWant = 0.45;
        this.mouth = Math.sin(clamp(this.stateT / 1.8, 0, 1) * Math.PI) * 0.9;
        if (Math.random() < 0.9) G.particles.spray(this.x + rand(-44, 44), this.y + rand(-36, 36), rand(0, TAU), 2, 120);
        G.ocean.addFoam(this.x + rand(-40, 40), this.y + rand(-34, 34), 0.35);
        if (this.stateT > 1.8) { this.mouth = 0; this.setState('lurk2'); this.nextT = 0.7; }
        break;
      }
      case 'blackout': {
        // it snuffs the lure and takes the whole bay back into the dark
        desired = toP; speed = 90;
        this.darkWant = 0.97;
        this.lureOut = 0.2;
        if (this.stateT > 2.2) { this.darkWant = 0.45; this.lureOut = 0; this.windDur = 0.5; this.biteAng = toP; this.setState('biteWind'); }
        break;
      }
    }

    // ---- watchdog: nothing here is allowed to hold the fight up
    if (this.state !== 'lurk' && this.state !== 'lurk2' && this.stateT > 6) {
      this.mouth = 0; this.darkWant = p2 ? 0.45 : 0.94;
      if (p2) this.surf = 1;
      this.setState(p2 ? 'lurk2' : 'lurk'); this.nextT = 0.8;
    }
    // ---- darkness eases toward what the state wants, and never snaps
    this.dark = lerp(this.dark, this.darkWant + (this.lureOut > 0 ? 0.04 : 0), Math.min(1, dt * 3.4));

    // ---- steering
    if (this.state !== 'under') {
      this.angle = angleLerp(this.angle, desired, Math.min(1, dt * turn * (this.state === 'bite' ? 0.5 : 1)));
      const k = Math.min(1, dt * (this.state === 'bite' ? 9 : 2.4));
      this.vx = lerp(this.vx, Math.cos(this.angle) * speed, k);
      this.vy = lerp(this.vy, Math.sin(this.angle) * speed, k);
      this.x += this.vx * dt; this.y += this.vy * dt;
    } else { this.vx = 0; this.vy = 0; }
    this.x = clamp(this.x, 40, G.ocean.W - 40);
    this.y = clamp(this.y, WATER_TOP + 20, G.ocean.H - 40);

    // ---- the lure rides out in front on its stalk
    const sway = Math.sin(this.lureSway) * 0.34;
    const la = this.angle + sway;
    const reach = 62 + Math.sin(this.lureSway * 0.7) * 7;
    this.lure.x = this.x + Math.cos(la) * reach;
    this.lure.y = this.y + Math.sin(la) * reach;
    this.lure.r = this.lureLit ? (this.phase === 2 ? 250 : 205) + Math.sin(t * 2.2) * 14 : 0;

    // ---- surface presence
    const spd = Math.hypot(this.vx, this.vy);
    if (this.surf > 0.2 && !this.submerged) {
      if (G.ocean.disturb && spd > 20) G.ocean.disturb(this.x, this.y, Math.min(6, spd / 60), this.vx, this.vy);
      const stx = this.x - Math.cos(this.angle) * 40, sty = this.y - Math.sin(this.angle) * 40;
      const last = this.wake.pts[this.wake.pts.length - 1];
      if (spd > 28 && (!last || dist(last.x, last.y, stx, sty) > 5)) { this.wake.pts.push({ x: stx, y: sty, t }); G.ocean.addFoam(stx, sty, 0.1 + spd / 2000); }
    }

    this.stepMotes(dt, p);
    this.stepDrift(dt, p);
    for (let i = this.snaps.length - 1; i >= 0; i--) { this.snaps[i].t += dt; if (this.snaps[i].t > 0.3) this.snaps.splice(i, 1); }
  }

  chooseAttack(d) {
    const p2 = this.phase === 2;
    this.cycle++;
    const roll = Math.random();
    if (p2) {
      if (this.cycle % 5 === 0) { this.setState('blackout'); this.say('THE LIGHT GOES OUT', '#ff6161', 10); G.shake(6); return; }
      if (d < 190 || roll < 0.32) { this.beginBite(0.62); return; }
      if (roll < 0.58) { this.setState('cast'); this.say('LITTLE LIGHTS', '#8ae6ff', 9); return; }
      if (roll < 0.80) { this.setState('spit'); return; }
      this.setState('dive'); this.darkWant = 0.86;
      return;
    }
    if (d < 200 || roll < 0.34) { this.beginBite(0.95); return; }
    if (roll < 0.66) { this.setState('cast'); this.say('LITTLE LIGHTS', '#8ae6ff', 9); return; }
    this.setState('dive'); this.darkWant = 0.985;
  }
  beginBite(dur) {
    this.windDur = dur;
    this.biteAng = angleTo(this.x, this.y, G.player.x, G.player.y);
    this.setState('biteWind');
    Audio_.tone(90, 0.5, 'sawtooth', 0.14, 30);
    this.say('IT OPENS', '#ff6161', 10);
  }
  pull(dt, p) {
    if (!this.lureLit || p.dead) return;
    const d = dist(this.lure.x, this.lure.y, p.x, p.y);
    if (d > 340) return;
    const a = angleTo(p.x, p.y, this.lure.x, this.lure.y);
    const k = (1 - d / 340) * (this.phase === 2 ? 110 : 145);
    p.vx += Math.cos(a) * k * dt; p.vy += Math.sin(a) * k * dt;
    // the pull is drawn: motes of light streaming off her toward the lure
    if (Math.random() < dt * 14 && this.drift.length < 40)
      this.drift.push({ x: p.x + rand(-22, 22), y: p.y + rand(-18, 18), t: 0, dur: rand(0.7, 1.2) });
  }
  stepDrift(dt) {
    for (let i = this.drift.length - 1; i >= 0; i--) {
      const m = this.drift[i]; m.t += dt;
      const a = angleTo(m.x, m.y, this.lure.x, this.lure.y);
      m.x += Math.cos(a) * 130 * dt; m.y += Math.sin(a) * 130 * dt;
      if (m.t > m.dur) this.drift.splice(i, 1);
    }
  }
  castTeeth(p) {
    const n = this.phase === 2 ? randi(7, 9) : randi(5, 7);
    const base = rand(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = base + i / n * TAU + rand(-0.25, 0.25), r = rand(62, 190);
      const x = clamp(p.x + Math.cos(a) * r, 40, G.ocean.W - 40);
      const y = clamp(p.y + Math.sin(a) * r, WATER_TOP + 20, G.ocean.H - 40);
      this.motes.push({ x, y, t: 0, dur: this.phase === 2 ? 2.0 : 2.5, a: rand(0, TAU) });
    }
    Audio_.tone(760, 0.24, 'sine', 0.1, 260);
  }
  spitTeeth(toP) {
    const n = this.phase === 2 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = toP + (i - (n - 1) / 2) * 0.20;
      const pr = new Projectile({
        x: this.x + Math.cos(a) * 34, y: this.y + Math.sin(a) * 34,
        vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, life: 2.0,
        dmg: 13 * (1 + (this.diff - 1) * 0.5), owner: 'enemy',
        sprite: this.art.tooth, size: 4, trail: true, knock: 0,
      });
      pr.anglerTooth = 1;
      G.projectiles.push(pr);
    }
    G.particles.text(this.x, this.y - 40, 'IT SPITS TEETH', '#8ae6ff', 9);
    Audio_.shot('harpoon');
  }
  stepMotes(dt, p) {
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i]; m.t += dt;
      if (m.t >= m.dur) {
        this.motes.splice(i, 1);
        this.snaps.push({ x: m.x, y: m.y, t: 0, a: m.a });
        G.particles.sparks(m.x, m.y, 6); G.particles.splash(m.x, m.y, 0.9);
        Audio_.tone(240, 0.08, 'square', 0.1, -140);
        if (!p.dead && !p.diving && !p.rolling && p.invuln <= 0 && dist(m.x, m.y, p.x, p.y) < 30) {
          p.damage(17 * (1 + (this.diff - 1) * 0.5), m.x, m.y);
        }
      }
    }
  }
  surgeBlow() {
    const p = G.player;
    G.shake(20); Audio_.roar(); Audio_.splash(3);
    G.particles.splash(this.x, this.y, 5); G.ocean.ripple(this.x, this.y, 210, 340, 1);
    Toon.burst(this.x, this.y, 4.6); Toon.shock(this.x, this.y, 210, 0.7);
    G.particles.text(this.x, this.y - 46, 'FROM BELOW!', '#8ae6ff', 12);
    if (!p.dead && !p.diving && !p.rolling && p.invuln <= 0 && dist(this.x, this.y, p.x, p.y) < 74) {
      p.damage(36 * (1 + (this.diff - 1) * 0.5), this.x, this.y);
      const a = angleTo(this.x, this.y, p.x, p.y);
      p.vx += Math.cos(a) * 460; p.vy += Math.sin(a) * 460;
    }
  }

  // ------------------------------------------------------------- damage
  hit(dmg, kx, ky, proj) {
    if (this.dead || this.state === 'arrive' || this.state === 'breach') return;
    // the lure is the weak point, and knocking it out costs you the light
    if (this.lureLit && proj && typeof proj.x === 'number' && dist(proj.x, proj.y, this.lure.x, this.lure.y) < 22) {
      const real = dmg * 2.4;
      this.hp -= real; this.flash = 0.08; this.lureOut = 1.2;
      if (G.stats) G.stats.damageDealt += real;
      G.particles.sparks(this.lure.x, this.lure.y, 10);
      G.particles.text(this.lure.x, this.lure.y - 22, 'LURE! ' + Math.round(real), '#8ae6ff', 10);
      Toon.impact(this.lure.x, this.lure.y, 1.5, '#8ae6ff');
      Audio_.tone(900, 0.14, 'sine', 0.16, -600);
      if (this.hp <= 0) { this.die(); return; }
      if (this.phase === 1 && this.hp <= this.maxHp * 0.5) this.breach();
      return;
    }
    let mult = this.phase === 2 ? 1.0 : 0.8;
    if (this.exposed) mult *= 2.2;
    if (this.submerged) mult *= 0.18;
    const real = dmg * mult;
    this.hp -= real; this.flash = 0.08;
    if (G.stats) G.stats.damageDealt += real;
    G.particles.sparks(this.x, this.y, 3);
    if (Math.random() < 0.7) G.particles.blood(this.x, this.y, 0.4);
    Toon.impact(this.x, this.y, this.exposed ? 1.6 : 0.7, this.exposed ? '#ffe48f' : '#ffffff');
    G.particles.text(this.x + rand(-12, 12), this.y - 34, Math.round(real) + (this.exposed ? '!' : ''),
      this.exposed ? '#ffe48f' : this.submerged ? '#5e7f98' : '#c8d0d8', this.exposed ? 9 : 7);
    Audio_.hit();
    if (this.hp <= 0) { this.die(); return; }
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) this.breach();
  }
  breach() {
    if (this.phase === 2) return;
    this.phase = 2;
    this.setState('breach');
    this.motes.length = 0;
    Audio_.roar(); G.shake(20);
    G.banner('IT COMES UP', '#8ae6ff', 2.4, 'Now you can see it');
    G.particles.splash(this.x, this.y, 6); G.ocean.ripple(this.x, this.y, 240, 360, 1);
    Toon.burst(this.x, this.y, 5); Toon.shock(this.x, this.y, 280, 0.9);
    for (const pr of G.projectiles) if (pr.owner === 'player') pr.dead = true;
  }
  die() {
    if (this.dead) return;
    this.dead = true; this.wake.dead = true;
    this.motes.length = 0; this.snaps.length = 0; this.drift.length = 0;
    this.dark = 0;
    for (const pr of G.projectiles) if (pr.anglerTooth) pr.dead = true;
    G.particles.explode(this.x, this.y, 100, { debris: 28, debrisColors: ['#1d2634', '#3b4a60', '#86a9c0', '#e8eef5'] });
    G.particles.blood(this.x, this.y, 4); G.ocean.splatBlood(this.x, this.y, 5, 80); G.shake(24);
    Toon.burst(this.x, this.y, 5); Toon.shock(this.x, this.y, 260, 0.9);
    for (let i = 0; i < 3; i++) setTimeout(() => {
      if (!G || !G.particles) return;
      G.particles.explode(this.x + rand(-40, 40), this.y + rand(-34, 34), 50);
      G.particles.blood(this.x + rand(-30, 30), this.y + rand(-30, 30), 3);
    }, 250 + i * 300);
    const drops = { metal: 8, wood: 8, fuel: 12, powder: 10, tech: 16 };
    for (const k in drops) for (let i = 0; i < drops[k]; i++) G.pickups.push(new Pickup(this.x, this.y, k));
    if (G.stats) G.stats.kills++;
    if (G.onBossKilled) G.onBossKilled();
  }

  // ------------------------------------------------------------- render
  render(ctx, cam, t) {
    if (this.dead) return;
    const A = this.art, p = G.player;
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);
    const p2 = this.phase === 2;
    const bob = Math.round(Math.sin(t * 1.6 + this.bob) * 1);

    // ---------------- the animal itself, drawn UNDER the dark so the dark
    // is what decides how much of it you get to see
    if (!this.submerged) {
      const lit = p2 || this.surf > 0.3;
      const body = this.flash > 0 ? A.bodyHurt : (lit ? A.bodyLit : A.body);
      const jaw = lit ? A.jawLit : A.jaw;
      ctx.save();
      ctx.translate(sx, sy + bob);
      ctx.rotate(this.angle);
      const swim = 1 + Math.sin(t * 3 + this.bob) * 0.02;
      ctx.scale(this.state === 'bite' ? 1.08 : 1, swim * (0.86 + this.surf * 0.14));
      ctx.drawImage(body.c, -body.ax, -body.ay);
      if (this.mouth > 0.05) {
        // the gullet: a hard black wedge between the jaws, bounded by them,
        // so an open mouth reads as a hole rather than as water
        const oa = this.mouth * 0.85, L = 42;
        const tx = 26 + Math.cos(oa) * L, ty = 5 + Math.sin(oa) * L;
        triFill(ctx, '#02040a', 20, 0, tx, -ty, tx, ty);
        triFill(ctx, '#160c14', 24, 0, tx - 6, -ty * 0.62, tx - 6, ty * 0.62);
      }
      // the jaws hinge open at the front of the head
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(26, s * 5);
        ctx.scale(1, -s);                 // upper and lower jaw are one sprite
        ctx.rotate(-this.mouth * 0.85);
        ctx.drawImage(jaw.c, -jaw.ax, -jaw.ay);
        ctx.restore();
      }
      ctx.restore();
    } else {
      // submerged: a darker patch of water and a rising column of bubbles
      bxDisc(ctx, sx, sy, 44, 'rgba(2,6,14,0.55)', 0.6);
      bxDisc(ctx, sx, sy, 26, 'rgba(2,6,14,0.5)', 0.6);
    }

    // ---------------- the lure and its stalk, over the body, under the dark
    if (this.lureLit) this.renderLure(ctx, cam, t, false);

    // ---------------- THE DARK
    const lights = [];
    if (this.lureLit) lights.push({ x: this.lure.x, y: this.lure.y, r: this.lure.r, s: 1 });
    if (!p.dead) lights.push({ x: p.x, y: p.y, r: p2 ? 104 : 86, s: 0.66 });
    for (const m of this.motes) {
      const k = m.t / m.dur;
      lights.push({ x: m.x, y: m.y, r: 58 + (k > 0.6 ? 20 : 0), s: 0.55 });
    }
    for (const pr of G.projectiles) if (pr.anglerTooth || pr.owner === 'player') lights.push({ x: pr.x, y: pr.y, r: 30, s: 0.4 });
    if (this.state === 'biteWind' || this.state === 'bite') lights.push({ x: this.x + Math.cos(this.angle) * 30, y: this.y + Math.sin(this.angle) * 30, r: 110 * this.mouth, s: 0.85 });
    if (this.surf > 0.3) lights.push({ x: this.x, y: this.y, r: 70 * this.surf, s: 0.45 });
    angDarkness(ctx, cam, lights, this.dark);

    // ---------------- everything from here is drawn ON the dark: it is the
    // light, so it is the only thing you can see when the bay is black
    if (this.lureLit) this.renderLure(ctx, cam, t, true);

    // the drag: motes of her own light peeling off toward the lure
    for (const m of this.drift) {
      const k = 1 - m.t / m.dur;
      ctx.fillStyle = k > 0.6 ? '#dff6ff' : k > 0.3 ? '#8ae6ff' : '#3aa6d8';
      ctx.fillRect(Math.round(m.x - cam.x), Math.round(m.y - cam.y), 2, 2);
    }

    // the little lights that are teeth
    for (const m of this.motes) {
      const k = m.t / m.dur, arm = k > 0.6;
      const mx = Math.round(m.x - cam.x), my = Math.round(m.y - cam.y);
      const blink = Math.sin(t * 30) > 0;
      const col = arm ? (blink ? '#ffffff' : '#ff6161') : '#8ae6ff';
      const r = arm ? 5 + Math.round((k - 0.6) * 14) : 3;
      bxDisc(ctx, mx, my, r + 2, arm ? 'rgba(255,97,97,0.35)' : 'rgba(138,230,255,0.25)', 1);
      bxDisc(ctx, mx, my, r, col, 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(mx - 1, my - 1, 2, 2);
      if (arm) mbRing(ctx, mx, my, 16 + Math.round((1 - (k - 0.6) / 0.4) * 14), blink ? '#ffffff' : '#ff6161', 28, 1, t * 3, 3);
    }
    // a mote that has gone off: the teeth you never saw, closing
    for (const s of this.snaps) {
      const k = clamp(s.t / 0.3, 0, 1);
      const mx = Math.round(s.x - cam.x), my = Math.round(s.y - cam.y);
      const gap = Math.round(20 * (1 - k)) + 3;
      for (const side of [-1, 1]) {
        const a = s.a + (side > 0 ? 0 : Math.PI);
        bxTeeth(ctx, mx + Math.cos(a) * gap, my + Math.sin(a) * gap, 10, a + 2.0, a + 4.28, 5, 9, '#f8fbff', '#02040a');
      }
    }

    // the bite telegraph: the jaw lights up in the dark before it comes
    if (this.state === 'biteWind') {
      const k = clamp(this.stateT / this.windDur, 0, 1), hot = k > 0.7;
      const a = this.biteAng;
      const col = hot && Math.sin(t * 40) > 0 ? '#ffffff' : '#ff6161';
      mbDashLine(ctx, sx, sy, sx + Math.cos(a) * 520, sy + Math.sin(a) * 520, t, col, '#8ae6ff', 3);
      const jx = sx + Math.cos(a) * 30, jy = sy + Math.sin(a) * 30;
      for (const s of [-1, 1]) {
        const ja = a + s * (0.18 + k * 0.62);
        bxTeeth(ctx, jx, jy, 56, ja - s * 0.55, ja + s * 0.05, 7, 12, hot ? '#ffffff' : '#dff6ff', '#02040a');
        mbArcDots(ctx, jx, jy, 56, Math.min(ja - s * 0.55, ja + s * 0.05), Math.max(ja - s * 0.55, ja + s * 0.05), col, 0, 2);
      }
      mbRing(ctx, jx, jy, Math.round(62 - k * 18), col, 50, 1, -t * 2, 4);
    }
    // the tell that it is under her
    if (this.state === 'under' || this.state === 'surge') {
      const k = this.state === 'surge' ? clamp(this.stateT / 0.42, 0, 1) : clamp((this.stateT - 0.4) / 1.4, 0, 1);
      if (k > 0) {
        const blink = Math.sin(t * 34) > 0;
        mbRing(ctx, sx, sy, Math.round(24 + k * 58), blink ? '#ffffff' : '#8ae6ff', 46, 0.72, t * 1.6, 3);
        mbRing(ctx, sx, sy, Math.round(14 + k * 34), '#3aa6d8', 34, 0.72, -t * 1.2, 4);
        for (let q = 0; q < 8; q++) {
          const a = t * 1.5 + q / 8 * TAU;
          ctx.fillStyle = blink ? '#dff6ff' : '#3aa6d8';
          ctx.fillRect(Math.round(sx + Math.cos(a) * (30 + k * 40)), Math.round(sy + Math.sin(a) * (30 + k * 40) * 0.72), 2, 2);
        }
      }
    }
    if (this.state === 'breach') {
      const k = clamp(this.stateT / 1.8, 0, 1);
      mbRing(ctx, sx, sy, Math.round(40 + k * 150), '#dff6ff', 60, 0.76, t * 0.5, 3);
      mbRing(ctx, sx, sy, Math.round(20 + k * 90), '#8ae6ff', 44, 0.76, -t * 0.7, 4);
    }
    if (this.exposed) for (let i = 0; i < 3; i++) { const a = t * 5 + i * TAU / 3; drawSprite(ctx, SP.star, sx + Math.cos(a) * 30, sy - 44 + Math.sin(a) * 7); }
  }
  renderLure(ctx, cam, t, over) {
    const lx = Math.round(this.lure.x - cam.x), ly = Math.round(this.lure.y - cam.y);
    const hx = Math.round(this.x - cam.x + Math.cos(this.angle) * 18), hy = Math.round(this.y - cam.y + Math.sin(this.angle) * 18);
    if (!over) {
      // the stalk, under the dark: it is meat, not light
      const nx = -(ly - hy), ny = (lx - hx), nl = Math.hypot(nx, ny) || 1;
      const b1x = hx + (lx - hx) * 0.36 + nx / nl * 10, b1y = hy + (ly - hy) * 0.36 + ny / nl * 10;
      const b2x = hx + (lx - hx) * 0.74 + nx / nl * 7, b2y = hy + (ly - hy) * 0.74 + ny / nl * 7;
      bxLimb(ctx, hx, hy, b1x, b1y, 6, 5, '#1d2634', '#3b4a60', '#02040a');
      bxLimb(ctx, b1x, b1y, b2x, b2y, 5, 4, '#2a3648', '#51637d', '#02040a');
      this._stalk = [b2x, b2y];
      return;
    }
    // the last of the stalk is inside the lure's own light, so it is drawn
    // over the dark: a hard black stem with a lit edge, hanging into the glow
    if (this._stalk) {
      const red = this.state === 'biteWind' || this.state === 'bite';
      bxLimb(ctx, this._stalk[0], this._stalk[1], lx, ly, 5, 3, '#0b1018', red ? '#ff8a6a' : '#3aa6d8', '#02040a');
    }
    const pulse = 0.82 + Math.sin(t * 3.1) * 0.18;
    const red = this.state === 'biteWind' || this.state === 'bite';
    const r = Math.round((this.phase === 2 ? 9 : 7) * pulse);
    // posterized halo: hard bands, no gradient anywhere
    const bands = red
      ? ['rgba(255,97,97,0.16)', 'rgba(255,97,97,0.26)', 'rgba(255,160,120,0.42)', '#ff8a6a', '#ffd7c0', '#ffffff']
      : ['rgba(58,166,216,0.14)', 'rgba(58,166,216,0.24)', 'rgba(138,230,255,0.40)', '#3aa6d8', '#8ae6ff', '#ffffff'];
    for (let i = 0; i < bands.length; i++) {
      const rr = Math.round(r * (1 + (bands.length - 1 - i) * 0.85));
      bxDisc(ctx, lx, ly, rr, bands[i], 1);
    }
    // four hard spokes of light, in the game's own dashed idiom
    for (let q = 0; q < 4; q++) {
      const a = t * 0.8 + q / 4 * TAU;
      for (let s = 1; s < 5; s++) {
        const rr = r * 2 + s * 5;
        ctx.fillStyle = s < 3 ? (red ? '#ffd7c0' : '#8ae6ff') : (red ? 'rgba(255,138,106,0.5)' : 'rgba(58,166,216,0.5)');
        ctx.fillRect(Math.round(lx + Math.cos(a) * rr), Math.round(ly + Math.sin(a) * rr), 2, 2);
      }
    }
    mbRing(ctx, lx, ly, Math.round(r * 3.2), red ? '#ff8a6a' : '#3aa6d8', 30, 1, -t * 0.6, 3);
  }
}

// ===========================================================================
//  THE ROSTER  —  what game.js and waves.js pick a boss out of.
//  makeBoss('chief', x, y, d) returns exactly what `new Boss(x, y)` returns,
//  so the Chief fight is untouched.
// ===========================================================================
const BOSS_TYPES = {
  chief: {
    key: 'chief', name: 'THE VILLAGE CHIEF', sub: 'He rides a shark. Bait his charge into the rocks',
    hp: 1500, color: '#ff6161', radius: 26,
    obj: 'Bait the Chief into the rocks, then hit him while he is down',
    make: (x, y) => new Boss(x, y),
  },
  crab: {
    key: 'crab', name: 'THE GREATCLAW', sub: 'Armoured in front. Get behind it and crack the shell',
    hp: 1700, color: '#e08a44', radius: 46,
    obj: 'Crack the shell, then take the claws off it',
    make: (x, y, d) => new CrabBoss(x, y, d),
  },
  angler: {
    key: 'angler', name: 'THE DEEP LANTERN', sub: 'Do not swim toward the light',
    hp: 1500, color: '#8ae6ff', radius: 48,
    obj: 'Shoot the lure. Do not follow it',
    make: (x, y, d) => new AnglerBoss(x, y, d),
  },
};

function makeBoss(key, x, y, difficulty) {
  const c = BOSS_TYPES[key || 'chief'];
  if (!c) return null;
  return c.make(x, y, difficulty === undefined ? 1 : difficulty);
}

globalThis.Boss = Boss;
globalThis.CrabBoss = CrabBoss;
globalThis.AnglerBoss = AnglerBoss;
globalThis.BOSS_TYPES = BOSS_TYPES;
globalThis.makeBoss = makeBoss;
