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
    const fms = this.sprite.foams;
    if (fms) {
      const fm = fms[Math.floor(t * 7 + this.x * 0.1) % fms.length];
      const pulse = 0.62 + Math.sin(t * 2.1 + this.x * 0.05) * 0.26;
      ctx.save();
      ctx.globalAlpha = clamp(pulse, 0.2, 0.95);
      ctx.drawImage(fm.c, sx - fm.ax, sy - fm.ay + Math.round(Math.sin(t * 1.7 + this.y * 0.04)));
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
// Salvage the boats leave behind that is not scrap: kit you use on the spot.
const ITEM_KINDS = {
  repair: { name: 'BOAT FIXER', color: '#6fd88e', sound: 4,
    take(p) { const h = Math.round(p.stats.maxHp * 0.30); p.hp = Math.min(p.stats.maxHp, p.hp + h); return '+' + h + ' HULL'; } },
  plate:  { name: 'HULL PLATE', color: '#dde5ee', sound: 0,
    take(p) { p.platingT = 12; return 'PLATED'; } },
  tonic:  { name: 'FUEL CAN', color: '#ff9a3c', sound: 2,
    take(p) { p.rampage.meter = Math.min(100, p.rampage.meter + 34); return 'RAMPAGE +34'; } },
};
const ITEM_TYPES = Object.keys(ITEM_KINDS);

class Pickup {
  constructor(x, y, type) { this.x = x; this.y = y; this.type = type; this.item = !!ITEM_KINDS[type]; const a = rand(0, TAU), s = rand(40, 120); this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s; this.z = 0; this.vz = rand(60, 140); this.life = 30; this.ph = rand(0, TAU); this.dead = false; this.magnetized = false; }
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
    if (d < 14) {
      this.dead = true;
      if (this.item) {
        const k = ITEM_KINDS[this.type];
        const label = k.take(p);
        G.particles.text(this.x, this.y - 8, label, k.color, 8);
        G.banner(k.name, k.color, 1.1);
        Audio_.pickup(k.sound);
        return;
      }
      const n = 1 + p.stats.scrapBonus;
      G.tree.addScrap(this.type, n);
      G.particles.text(this.x, this.y - 6, '+' + n, SCRAP_COLORS[this.type], 7);
      Audio_.pickup(SCRAP_TYPES.indexOf(this.type));
      G.stats.scrapCollected += n;
      if (G.director && G.director.onSalvage) G.director.onSalvage(n);
    }
  }
  render(ctx, cam, t) {
    const sx = this.x - cam.x, sy = this.y - cam.y - this.z; if (sx < -10 || sy < -10 || sx > 650 || sy > 370) return;
    const bob = this.z > 0 ? 0 : Math.sin(t * 4 + this.ph) * 1.5;
    if (this.z <= 0) { ctx.fillStyle = 'rgba(6,18,48,0.3)'; ctx.fillRect(Math.round(sx - 3), Math.round(sy + 3), 7, 3); }
    if (this.life < 5 && Math.floor(t * 8) % 2 === 0) return;
    if (this.item) {
      // kit is worth crossing the water for, so it announces itself
      const k = ITEM_KINDS[this.type], pu = (Math.sin(t * 4 + this.ph) * 0.5 + 0.5);
      ctx.fillStyle = k.color; ctx.globalAlpha = 0.14 + pu * 0.16;
      const r = 8 + pu * 3;
      ctx.fillRect(Math.round(sx - r), Math.round(sy + bob - r + 2), r * 2, r * 2 - 4);
      ctx.fillRect(Math.round(sx - r + 2), Math.round(sy + bob - r), r * 2 - 4, r * 2);
      ctx.globalAlpha = 1;
      drawSprite(ctx, SP.item[this.type], sx, sy + bob);
      return;
    }
    drawSprite(ctx, SP.scrap[this.type], sx, sy + bob);
    if (Math.sin(t * 5 + this.ph) > 0.85) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(sx - 3), Math.round(sy + bob - 4), 1, 1); }
  }
}

// ============================ PROJECTILE ==============================
class Projectile {
  constructor(o) {
    Object.assign(this, { x: 0, y: 0, vx: 0, vy: 0, life: 1, dmg: 10, owner: 'player', sprite: SP.bullet, pierce: 0, ricochet: 0, explode: 0, knock: 40, absorbable: true, size: 3, z: 0, vz: 0, arc: false, slow: 0, crit: false, burn: 0, hits: null, trail: false, dead: false, homing: 0, weapon: null, drag: 0, harmless: false, grapple: null }, o);
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
    // a drifting shot (a baited hook) bleeds off speed and hangs in the water
    if (this.drag) { const k = Math.max(0, 1 - this.drag * dt); this.vx *= k; this.vy *= k; }
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
        const touched = e.hitTest ? e.hitTest(this.x, this.y, this.size) : circleHit(this.x, this.y, this.size, e.x, e.y, e.radius);
        if (touched) { this.onHit(e); if (this.dead) return; }
      }
      if (G.boss && !G.boss.dead && !this.hits.has(G.boss) && circleHit(this.x, this.y, this.size, G.boss.x, G.boss.y, G.boss.radius)) this.onHit(G.boss);
      if (G.fisherman && G.fisherman.alive && circleHit(this.x, this.y, this.size + 4, G.fisherman.x, G.fisherman.y - 8, 10)) { G.fisherman.shot(this); this.dead = true; }
    } else {
      const p = G.player;
      if (p.dead) return;
      const d = dist(this.x, this.y, p.x, p.y);
      if (p.absorb.active && this.absorbable && d < 54) { p.absorbHit(this); this.dead = true; return; }
      if (d < 12 + this.size && !p.diving) {
        if (p.rolling) { this.dead = true; G.particles.sparks(this.x, this.y, 3); return; }
        // a winch hook does almost no damage: what it does is take the wheel
        if (this.grapple && !this.grapple.dead) { p.hooked(this.grapple, this); this.dead = true; return; }
        if (this.explode) { this.detonate(); this.dead = true; return; }
        if (this.harmless || this.dmg <= 0) { this.dead = true; G.particles.sparks(this.x, this.y, 4); return; }
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
    // floating wreckage is not scenery: the blast picks it up and throws it
    if (typeof Wreck !== 'undefined' && Wreck.shove) Wreck.shove(this.x, this.y, r * 1.8, 0.55 + r / 90);
    if (this.owner === 'player') {
      for (const e of G.enemies) if (!e.dead && (e.hitTest ? e.hitTest(this.x, this.y, r) : dist(this.x, this.y, e.x, e.y) < r + e.radius)) { const a = angleTo(this.x, this.y, e.x, e.y); e.hit(this.dmg * (this.hits.has(e) ? 0.5 : 1), Math.cos(a) * this.knock * 2, Math.sin(a) * this.knock * 2, this); }
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
    const px = Math.round(sx), py = Math.round(sy);
    if (this.z > 0) { ctx.fillStyle = 'rgba(6,18,48,0.35)'; ctx.fillRect(px - 2, Math.round(this.y - cam.y) - 1, 4, 2); }
    if (this.owner === 'enemy') {
      // a dark halo so the shot never disappears into bright foam or a wake
      ctx.fillStyle = 'rgba(8,10,20,0.42)';
      const h = this.size + 3;
      ctx.fillRect(px - h, py - h + 1, h * 2, h * 2 - 2);
      ctx.fillRect(px - h + 1, py - h, h * 2 - 2, h * 2);
      // a long tracer back along its path: you can read where it came from
      if (this.trail) {
        const L = 5, k = 0.016;
        for (let i = 1; i <= L; i++) {
          const f = i / L;
          ctx.fillStyle = `rgba(255,${(150 - f * 90) | 0},${(120 - f * 70) | 0},${(0.55 * (1 - f)).toFixed(2)})`;
          const w = Math.max(1, Math.round(this.size * (1 - f * 0.6)));
          ctx.fillRect(Math.round(sx - this.vx * k * i) - (w >> 1), Math.round(sy - this.vy * k * i) - (w >> 1), w, w);
        }
      }
    } else if (this.trail) {
      ctx.strokeStyle = 'rgba(255,230,150,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(Math.round(sx - this.vx * 0.02), Math.round(sy - this.vy * 0.02)); ctx.stroke();
    }
    const sc = this.crit ? 1.5 : 1;
    drawSprite(ctx, this.sprite, sx, sy, this.arc ? this.age * 8 : a, sc, sc);
    // a hot pulse on top of enemy fire, in time across every shot on screen
    if (this.owner === 'enemy' && ((this.age * 12) | 0) % 2 === 0) {
      ctx.fillStyle = '#fff6e0';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }
}

// ============================ MINE ====================================
// What a Mine Runner leaves behind it. It sits in the water winking slowly
// and does nothing at all until you swim into its circle: then the light
// goes hard red for three quarters of a second before it goes up. That
// beat is the whole point — every mine is escapable if you read it, and a
// roll clears the blast easily. A parry eats one outright.
class Mine extends Projectile {
  constructor(x, y, diff) {
    super({
      x, y, vx: rand(-8, 8), vy: rand(-8, 8), life: 16,
      dmg: 15 * (1 + ((diff || 1) - 1) * 0.8), owner: 'enemy', sprite: SP.buckshot,
      size: 5, explode: 36, knock: 0, absorbable: true,
    });
    this.arm = 0; this.ph = rand(0, TAU);
    this.under = true;          // it goes off beneath a hull, and lifts her
  }
  update(dt) {
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { this.detonate(); this.dead = true; return; }
    const k = Math.pow(0.12, dt);
    this.vx *= k; this.vy *= k;
    const f = G.ocean.flow(this.x, this.y);
    this.x += (this.vx + f.x * 0.25) * dt; this.y += (this.vy + f.y * 0.25) * dt;
    if (Math.random() < dt * 1.5) G.ocean.addFoam(this.x, this.y, 0.05);
    const p = G.player;
    if (p.dead) return;
    if (p.absorb.active && dist(this.x, this.y, p.x, p.y) < 58) {
      p.absorbHit(this); G.particles.explode(this.x, this.y, 24, { water: true }); this.dead = true; return;
    }
    if (this.arm > 0) {
      this.arm -= dt;
      if (Math.random() < 0.5) G.particles.sparks(this.x, this.y - 4, 1);
      if (this.arm <= 0) { this.detonate(); this.dead = true; }
      return;
    }
    if (!p.diving && dist(this.x, this.y, p.x, p.y) < 44) {
      this.arm = 0.75;
      Audio_.tone(940, 0.09, 'square', 0.1);
      Toon.shock(this.x, this.y, 48, 0.55, '#ff9a3c');
      G.particles.bubbles(this.x, this.y, 3);
    }
  }
  render(ctx, cam) {
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);
    if (sx < -24 || sy < -24 || sx > 664 || sy > 384) return;
    const bob = Math.round(Math.sin(this.age * 2.6 + this.ph));
    ctx.fillStyle = 'rgba(6,18,48,0.34)'; ctx.fillRect(sx - 5, sy + 4, 11, 3);
    // spikes first, so the drum caps them
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + 0.5;
      ctx.fillStyle = '#14141c';
      ctx.fillRect(sx + Math.round(Math.cos(a) * 7), sy + bob + Math.round(Math.sin(a) * 6), 2, 2);
    }
    ctx.fillStyle = '#14141c'; ctx.fillRect(sx - 5, sy + bob - 3, 10, 8); ctx.fillRect(sx - 4, sy + bob - 4, 8, 10);
    ctx.fillStyle = '#343b49'; ctx.fillRect(sx - 4, sy + bob - 3, 8, 6);
    ctx.fillStyle = '#5b6578'; ctx.fillRect(sx - 3, sy + bob - 3, 6, 2);
    ctx.fillStyle = '#20242e'; ctx.fillRect(sx - 4, sy + bob + 2, 8, 1);
    const fast = this.arm > 0;
    const on = fast ? (((this.age * 16) | 0) & 1) : (((this.age * 2) | 0) & 1);
    ctx.fillStyle = on ? (fast ? '#ff6161' : '#ff9a3c') : '#5c1518';
    ctx.fillRect(sx - 1, sy + bob - 6, 2, 2);
    if (fast) {
      // the arming ring: hard dots, no blur, so it reads at a glance
      const r = Math.round(12 + (1 - this.arm / 0.75) * 18);
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * TAU;
        const bx = sx + Math.round(Math.cos(a) * r), by = sy + Math.round(Math.sin(a) * r * 0.8);
        ctx.fillStyle = '#0c1018'; ctx.fillRect(bx - 1, by, 2, 2);
        ctx.fillStyle = on ? '#ff6161' : '#ff9a3c'; ctx.fillRect(bx - 1, by - 1, 2, 2);
      }
    }
  }
}

// ======================= HULL BREAKUP / WRECKAGE ========================
// A boat that dies does not fade out: it comes apart. The pieces are CUT OUT
// OF THAT BOAT'S OWN SPRITE -- the very canvas the hull was rasterised into
// -- so a broken trawler is unmistakably a broken trawler, down to the rust
// weeping off her fastenings. Every piece then goes into the water as a real
// object with its own mass, spin and buoyancy: it splashes, it shoves the
// jelly surface aside, it bobs on the swell, it takes water on until it
// swamps, and then it rolls over and slides under end-first. Warm timber
// floats for twenty seconds and can be shouldered around; cold steel is gone
// in three.
//
// WHAT DECIDES THE BREAK is the kill. A shell into her side folds her in
// half; one down the throat takes the bow off; one up the transom takes the
// stern off; a blast underneath opens her along the keel and throws her up
// out of the water; a magazine going up shatters her into six.
//
// WHAT IT COSTS: each (hull x break pattern) is cut ONCE into small canvases
// and cached on the sprite, so the twentieth trawler of the wave costs a
// handful of object allocations and no pixel work at all. Live pieces are
// capped globally -- past the cap the oldest floating wreckage is told to
// take water, so a screen full of dying boats cannot run the count away.
const BREAK = {
  cap: 80,         // live pieces across every wreck on the water
  maxWrecks: 12,   // breakup events kept at once
  floatLife: 19,   // seconds a buoyant piece drifts before it gives up
  minPix: 10,      // art pixels below which a piece is just particle debris
};
// Counted, never tallied: game.js is free to drop G.wrecks wholesale between
// runs and the budget still reads true on the next breakup.
function liveFrags() {
  const ws = (typeof G !== 'undefined' && G && G.wrecks) || null;
  if (!ws) return 0;
  let n = 0;
  for (let i = 0; i < ws.length; i++) n += ws[i].pieces ? ws[i].pieces.length : 0;
  return n;
}

// chars.js's un-bridged blitter, for drawing a hi-res canvas under a
// transform we have already scaled ourselves. Absent, we fall back to the
// ordinary path and nothing changes but the cost.
const RAWP = (typeof drawRaw === 'function') ? drawRaw : null;

// ---- the source pixels ---------------------------------------------------
// Read fresh for each cut and thrown away again: a hull is cut at most once
// per break pattern in the life of the page, and half a millisecond then is
// a far better trade than holding a megabyte of ImageData per hull for the
// rest of the run. What IS remembered is a hull we could not read at all --
// a tainted or absurdly large canvas -- so we never try that one twice.
const _unreadable = new WeakSet();
function hullPixels(spr) {
  if (!spr || !spr.c || _unreadable.has(spr)) return null;
  try {
    const c = spr.c, w = c.width | 0, h = c.height | 0;
    if (w > 1 && h > 1 && w * h <= 400000) {
      const d = c.getContext('2d').getImageData(0, 0, w, h);
      return { w, h, A: Math.max(1, Math.round(w / (spr.w || w))), data: d.data };
    }
  } catch (e) { /* fall through */ }
  _unreadable.add(spr);
  return null;
}

// ---- the cut plans -----------------------------------------------------
// u runs 0 (transom) .. 1 (stem) along the hull, v across it. `split` names
// the bands that are also opened down the centreline. Seams are jittered on
// a hash, one integer step per row, so every tear is ragged and none of them
// is a saw cut -- and the jitter is deterministic, so a hull always breaks
// along the same grain.
// A small boat breaks in two; a ship has frames enough to break into a bow,
// a midships and a stern, so `big` hulls get the extra seam.
const BREAK_PLANS = {
  half:     { seams: [0.47], big: [0.32, 0.58], split: [] },
  bowoff:   { seams: [0.67], big: [0.36, 0.70], split: [] },
  sternoff: { seams: [0.30], big: [0.29, 0.62], split: [] },
  // a blast under the keel: a ship opens along her centreline, a small boat
  // has no centreline worth opening and simply comes apart in three
  keel:     { seams: [0.40, 0.68], big: [0.50], split: [], bigSplit: [0, 1] },
  shatter:  { seams: [0.28, 0.54, 0.77], big: [0.24, 0.46, 0.68, 0.85], split: [1, 2] },
};

const _breakCache = new WeakMap();        // sprite -> Map(planKey -> pieces[])
function bakeBreak(spr, key, deckBox) {
  let m = _breakCache.get(spr);
  if (!m) { m = new Map(); _breakCache.set(spr, m); }
  const ck = key + (deckBox ? '+d' : '');
  if (m.has(ck)) return m.get(ck);
  let out = null;
  try {
    const base = BREAK_PLANS[key] || BREAK_PLANS.half;
    const useBig = !!(deckBox && base.big);
    const plan = { seams: useBig ? base.big : base.seams, split: (useBig && base.bigSplit) ? base.bigSplit : base.split };
    out = cutHull(spr, plan, deckBox);
  } catch (e) { out = null; }
  m.set(ck, out);
  return out;
}

function cutHull(spr, plan, deckBox) {
  const hp = hullPixels(spr);
  if (!hp) return null;
  const W = hp.w, H = hp.h, A = hp.A, data = hp.data, cy = H / 2;
  // the seams, one integer x per row and one integer y per column
  const seamX = [];
  for (let i = 0; i < plan.seams.length; i++) {
    const base = plan.seams[i] * W, a = new Int16Array(H);
    for (let y = 0; y < H; y++) a[y] = (base + ((hash2(y * 7 + i * 131, 17 + i * 5) * 7) | 0) - 3) | 0;
    seamX.push(a);
  }
  const splitY = new Int16Array(W);
  for (let x = 0; x < W; x++) splitY[x] = (cy + ((hash2(x * 5, 91) * 5) | 0) - 2) | 0;
  const nb = plan.seams.length + 1;
  // the deckhouse / gear box: a working boat's wheelhouse comes off whole
  const box = deckBox ? { x0: (W * 0.58) | 0, x1: (W * 0.80) | 0, y0: (cy - H * 0.19) | 0, y1: (cy + H * 0.19) | 0 } : null;
  const BOXID = nb * 2;

  const ids = new Int16Array(W * H); ids.fill(-1);
  const bk = new Map();
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const o = (row + x) << 2;
      if (data[o + 3] < 24) continue;
      let b = 0;
      for (let i = 0; i < seamX.length; i++) if (x >= seamX[i][y]) b = i + 1;
      let id = b;
      if (plan.split.indexOf(b) >= 0 && y >= splitY[x]) id = b + nb;
      if (box && x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1) id = BOXID;
      ids[row + x] = id;
      let e = bk.get(id);
      if (!e) { e = { x0: x, x1: x, y0: y, y1: y, n: 0, sx: 0, r: 0, g: 0, b: 0 }; bk.set(id, e); }
      if (x < e.x0) e.x0 = x; if (x > e.x1) e.x1 = x;
      if (y < e.y0) e.y0 = y; if (y > e.y1) e.y1 = y;
      e.n++; e.sx += x; e.r += data[o]; e.g += data[o + 1]; e.b += data[o + 2];
    }
  }

  const pieces = [];
  bk.forEach((e, id) => {
    if (e.n < BREAK.minPix) return;
    const fw = e.x1 - e.x0 + 1, fh = e.y1 - e.y0 + 1;
    const c = (typeof newCan === 'function') ? newCan(fw, fh) : null;
    if (!c) return;
    const fctx = c.getContext('2d');
    const img = fctx.createImageData(fw, fh), od = img.data;
    for (let y = e.y0; y <= e.y1; y++) for (let x = e.x0; x <= e.x1; x++) {
      if (ids[y * W + x] !== id) continue;
      const s = ((y * W + x) << 2), d2 = (((y - e.y0) * fw) + (x - e.x0)) << 2;
      od[d2] = data[s]; od[d2 + 1] = data[s + 1]; od[d2 + 2] = data[s + 2]; od[d2 + 3] = data[s + 3];
    }
    fctx.putImageData(img, 0, 0);
    const fs = (A > 1 && typeof spriteFromHi === 'function')
      ? spriteFromHi(c, fw / 2, fh / 2)
      : { c, w: fw, h: fh, ax: fw / 2, ay: fh / 2 };
    pieces.push({
      spr: fs,
      ox: (e.x0 + fw / 2) / A - spr.ax,      // where it sat on the hull, world units
      oy: (e.y0 + fh / 2) / A - spr.ay,
      n: e.n,                                 // art pixels -> mass
      u: (e.sx / e.n) / W,                    // where its weight lies along her
      // paint temperature: warm timber swims, cold steel does not
      warm: (e.r - e.b) / (e.n * 255),
      lum: (e.r + e.g + e.b) / (e.n * 765),
      box: id === BOXID,
    });
  });
  pieces.sort((a, b) => b.n - a.n);
  return pieces.length ? pieces : null;
}

// Is this a ship or a boat? Measured against the longest hull the fleet has,
// never against a number: a ship breaks into a bow, a midships and a stern
// and sheds her wheelhouse whole, where a small boat simply breaks in two.
// Rescale the whole fleet and the same boats stay on the same side of it.
let _maxHullA = 0;
function fleetMaxHull() {
  if (_maxHullA) return _maxHullA;
  if (typeof SP === 'undefined' || !SP.boats) return 1200;
  for (const k in SP.boats) { const q = SP.boats[k]; if (q) { const a = q.w * q.h; if (a > _maxHullA) _maxHullA = a; } }
  return _maxHullA || 1200;
}
// Deck area rather than length alone, so a beamy barge counts as a ship and
// a long thin runabout does not -- and so the mini-boss hulls, which nothing
// in this file sizes, land on the right side of it too.
function hullIsShip(spr) { return !!spr && spr.w * spr.h >= fleetMaxHull() * 0.42; }

// ---- the darkening ladder, posterized into two hard steps ---------------
// The ladder is hung on the fragment sprite itself, and the fragments are
// already cached per (hull x break), so a screen full of sinking wreckage
// bakes each step exactly once in the life of the page and never again.
function sinkTint(s, step) {
  if (step <= 0) return s;
  if (step > 2) step = 2;
  let lad = s._sink;
  if (!lad) lad = s._sink = [];
  let v = lad[step];
  if (v) return v;
  const col = '#0a1a30', a = 0.26 + step * 0.26;
  v = lad[step] = (s.hi && typeof tintHi === 'function') ? tintHi(s, col, a) : tintSprite(s, col, a);
  return v;
}

// oil does not arrive in a dot: it spreads off a hull that is losing it
function spillOil(x, y, amt, spread) {
  const o = G.ocean; if (!o || !o.addOil) return;
  o.addOil(x, y, amt * 0.5);
  for (let i = 0; i < 3; i++) o.addOil(x + rand(-spread, spread), y + rand(-spread, spread), amt * 0.17);
}

// ============================ WRECK ====================================
// Constructed as `new Wreck(sprite, x, y, angle, radius)` from boss.js and
// from Enemy.die -- the fifth argument is still the radius and the sixth is
// optional, so every existing call site keeps working untouched.
//
//   opts.rel    radians between her heading and the way the killing blow was
//               travelling: 0 = up the transom, +-PI = down the throat,
//               +-PI/2 = into her side
//   opts.blast  the kill was an explosion
//   opts.under  it went off beneath her
//   opts.power  impulse multiplier
//   opts.vx/vy  the way she was already going
//   opts.cargo / opts.mast / opts.crew / opts.fuel  what she had aboard
//   opts.steel  false to silence the boiler (it is otherwise measured off
//               the wreckage itself, not asked for)
class Wreck {
  constructor(sprite, x, y, angle, radius, opts) {
    const o = opts || {};
    this.sprite = sprite; this.x = x; this.y = y; this.angle = angle || 0;
    this.radius = Math.max(6, radius || 12);
    this.t = 0; this.dead = false; this.smokeT = 0; this.oilT = 0;
    this.pieces = []; this.events = [];
    this.fireT = o.fire === false ? 0 : 1.2 + this.radius / 9;
    this.build(o);
    // a sprite we cannot read pixels out of still sinks the old way rather
    // than popping out of existence
    this.whole = this.pieces.length ? null : { dur: 2.2 + this.radius / 20 };
  }

  planKey(o) {
    if (o.under) return 'keel';
    if (o.blast && hullIsShip(this.sprite)) return 'shatter';
    if (o.rel === undefined || o.rel === null) return 'half';
    const a = Math.abs(o.rel);
    if (a < 0.75) return 'sternoff';       // it came up her wake and took the stern
    if (a > 2.40) return 'bowoff';         // straight down the throat
    return 'half';                          // amidships: she folds
  }

  build(o) {
    const key = this.planKey(o);
    const cut = bakeBreak(this.sprite, key, hullIsShip(this.sprite));
    if (!cut) return;
    // ---- budget. Past the cap the oldest wreckage starts taking water and
    //      this break gets only its biggest pieces; the rest becomes the
    //      particle debris it would otherwise have been.
    let room = BREAK.cap - liveFrags();
    if (room < cut.length) { Wreck.makeRoom(cut.length - room); room = BREAK.cap - liveFrags(); }
    const take = clamp(room, 1, cut.length);
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    const power = o.power || 1, lift = o.under ? 1 : (o.blast ? 0.45 : 0.12);
    const bigN = cut[0].n;
    for (let i = 0; i < cut.length; i++) {
      const p = cut[i];
      if (i >= take) {   // over budget: it still leaves splinters on the water
        G.particles.debris(this.x + p.ox * ca - p.oy * sa, this.y + p.ox * sa + p.oy * ca, 2);
        continue;
      }
      const wx = this.x + p.ox * ca - p.oy * sa, wy = this.y + p.ox * sa + p.oy * ca;
      const away = (wx === this.x && wy === this.y) ? rand(0, TAU) : Math.atan2(wy - this.y, wx - this.x);
      const mass = Math.max(0.3, p.n / (bigN || 1));
      // the light stuff is thrown, the heavy stuff barely moves: real momentum.
      // A hull that folds in half opens SLOWLY -- two halves of a ship have
      // a ship's inertia -- and it is the blast kills that scatter her.
      const push = power * (13 + 30 * (1 - mass)) * (o.blast ? 2.2 : 1);
      const buoy = clamp(0.30 + p.warm * 2.5 + p.lum * 0.3, 0.07, 0.95);
      const frag = {
        spr: p.spr, x: wx, y: wy, z: 0,
        vx: (o.vx || 0) * 0.45 + Math.cos(away) * push + rand(-14, 14),
        vy: (o.vy || 0) * 0.45 + Math.sin(away) * push + rand(-14, 14),
        vz: lift * (26 + 66 * (1 - mass)) * power * rand(0.6, 1.25),
        ang: this.angle, spin: rand(-1, 1) * (0.5 + 2.4 * (1 - mass)),
        mass, buoy, swamp: 0, sink: 0, sinking: false,
        life: 0, ph: rand(0, TAU), down: p.u > 0.5 ? 1 : -1,
        r: Math.max(2.5, Math.max(p.spr.w, p.spr.h) * 0.36),   // how wide it is to bump into
        box: p.box,
      };
      if (frag.vz > 1) frag.z = 0.5;
      this.pieces.push(frag);
    }
    // ---- the water answers: a hole punched in the surface, a ring of foam,
    //      oil out of her tanks and a real splash where each piece lands
    const oc = G.ocean;
    if (oc) {
      if (oc.disturb) { oc.disturb(this.x, this.y, -7, 0, 0); oc.disturb(this.x, this.y, 5.5, o.vx || 0, o.vy || 0); }
      if (oc.ripple) { oc.ripple(this.x, this.y, this.radius * 4.2, 110, 0.75); oc.ripple(this.x, this.y, this.radius * 2.2, 70, 0.5); }
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; oc.addFoam(this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius, 0.5); }
      spillOil(this.x, this.y, 0.5 + this.radius / 26, this.radius * 0.8);
    }
    G.particles.splash(this.x, this.y, Math.min(2.6, 0.9 + this.radius / 16));

    // ---- what she was MADE of, measured off the pieces that just came out
    //      of her: if the wreckage barely floats she was plate, and a boat
    //      built of plate has a boiler in her to let go. One measurement,
    //      used for both, so the two can never disagree.
    let mb = 0;
    for (let i = 0; i < this.pieces.length; i++) mb += this.pieces[i].buoy;
    this.steel = this.pieces.length ? (mb / this.pieces.length) < 0.42 : false;
    const boiler = this.steel && o.steel !== false;

    // ---- what else was aboard ------------------------------------------
    // The order is the order it happens in. The first fireball has cleared by
    // about two thirds of a second, so anything that has to be SEEN -- the
    // derrick coming down, the crew going over the side -- waits for it.
    if (o.fuel) this.events.push({ t: 0.16 + rand(0, 0.12), k: 'fuel' });
    if (boiler) this.events.push({ t: 0.50 + rand(0, 0.25), k: 'boiler' });
    if (o.cargo) this.events.push({ t: 0.44 + rand(0, 0.15), k: 'cargo' });
    if (o.mast) this.events.push({ t: 0.66 + rand(0, 0.2), k: 'mast' });
    if (o.crew) this.events.push({ t: 0.80 + rand(0, 0.3), k: 'crew' });
    this.events.sort((a, b) => a.t - b.t);
  }

  // an event on the way down
  fireEvent(k) {
    const r = this.radius, P = G.particles, oc = G.ocean;
    switch (k) {
      case 'fuel': {          // the tanks go up: a column of flame, no water in it
        P.explode(this.x + rand(-r, r) * 0.4, this.y + rand(-r, r) * 0.4, r * 0.95, { water: false, oil: 0.8 + r / 18 });
        if (typeof Toon !== 'undefined') { Toon.burst(this.x, this.y, 1.6 + r / 20, '#ff9a3c'); Toon.shock(this.x, this.y, r * 3.6, 0.45, '#ffd27a'); }
        P.fire(this.x, this.y, 10); P.smoke(this.x, this.y, 3, 'rgba(24,20,24,', r / 5.5);
        this.shove(this.x, this.y, r * 2.4, 1.0);
        G.shake(Math.min(11, 4 + r / 5));
        spillOil(this.x, this.y, 1.1 + r / 20, r);
        break;
      }
      case 'boiler': {        // steam and plate: a hard white flash, then metal
        P.explode(this.x, this.y, r * 0.75, { water: false, debris: 6, debrisColors: ['#aeb6c1', '#7d858f', '#4a515a'] });
        P.sparks(this.x, this.y, 16);
        for (let i = 0; i < 3; i++) P.smoke(this.x + rand(-r, r) * 0.5, this.y + rand(-r, r) * 0.5, 1, 'rgba(198,206,214,', r / 6);
        if (typeof Toon !== 'undefined') Toon.shock(this.x, this.y, r * 2.8, 0.35, '#eaf8ff');
        this.shove(this.x, this.y, r * 2.0, 0.8);
        break;
      }
      case 'cargo': {         // the deck load goes over the side
        P.debris(this.x, this.y, 9, ['#c9a469', '#8f6a3a', '#5c3a1c', '#d8cfae']);
        for (let i = 0; i < 4; i++) {
          const a = rand(0, TAU), d = rand(r * 0.4, r * 1.2);
          P.splash(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, 0.55);
        }
        break;
      }
      case 'mast': this.dropMast(); break;
      case 'crew': {
        // the people aboard go into the water. Hazards owns swimmers; this
        // only ever asks it for one, and only when the water is not already
        // full of them, so a sinking fleet never turns into a mob.
        if (typeof Hazards === 'undefined' || !Hazards.spawnSwimmer) break;
        const sw = Hazards.swimmers;
        if (sw && sw.length > 5) break;
        const a = rand(0, TAU);
        Hazards.spawnSwimmer(this.x + Math.cos(a) * (r + 4), this.y + Math.sin(a) * (r + 4), Math.random() < 0.3 ? 'gaff' : 'knife');
        break;
      }
    }
  }

  // ---- the derrick. It does not drop: it swings, because it is hinged at
  //      the foot, and it hits the water at the end of the arc.
  dropMast() {
    const r = this.radius;
    const spr = mastSprite(Math.round(r * 1.5));
    if (!spr) return;
    if (liveFrags() >= BREAK.cap) return;
    const side = Math.random() < 0.5 ? 1 : -1;
    this.pieces.push({
      spr, x: this.x, y: this.y, z: 0, vx: (this.pieces[0] ? this.pieces[0].vx : 0) * 0.3, vy: 0, vz: 0,
      ang: this.angle, spin: 0, mass: 0.45, buoy: 0.9, swamp: 0, sink: 0, sinking: false,
      life: 0, ph: rand(0, TAU), down: -1, r: 3,
      // hinged at the foot, not spun about its middle: the head of it swings
      // through a real arc and lands a mast's length from where it stood
      pivot: { a: this.angle, to: this.angle + side * 1.45, t: 0, dur: 0.72,
               hx: this.x - Math.cos(this.angle) * spr.w * 0.34, hy: this.y - Math.sin(this.angle) * spr.w * 0.34,
               arm: spr.w * 0.5 },
    });
  }

  // an explosion nearby throws the wreckage about again
  shove(x, y, r, power) {
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
      if (d > r || p.pivot || p.sinking) continue;      // one already going under stays going under
      const k = (1 - d / r) * power / (0.5 + p.mass);
      const a = d < 0.5 ? rand(0, TAU) : Math.atan2(dy, dx);
      p.vx += Math.cos(a) * 130 * k; p.vy += Math.sin(a) * 130 * k;
      p.vz += 34 * k; if (p.z <= 0) p.z = 0.4;
      p.spin += rand(-1, 1) * 5 * k;
      p.swamp += 0.10 * k;              // and stoves her in a little more
    }
  }

  // The player shoulders through the floating stuff. She pushes it: she can
  // never throw it faster than she is going herself, which is what stops a
  // long contact from turning a hull half into a bullet, and a roll shoves
  // far harder than a swim because she is going far faster.
  bump(pl, pr, dt) {
    const hard = pl.roll && pl.roll.active;
    const plSp = Math.hypot(pl.vx, pl.vy);
    const cap = plSp * (hard ? 1 : 0.5);
    const rate = (hard ? 1500 : 520) * dt;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.sinking || p.z > 3 || p.pivot) continue;
      const dx = p.x - pl.x, dy = p.y - pl.y, rr = pr + p.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      const d = Math.hypot(dx, dy) || 0.01;
      const ca = dx / d, sa = dy / d;
      const along = p.vx * ca + p.vy * sa;              // what it is already doing
      const add = Math.min(Math.max(0, cap - along), rate / (0.3 + p.mass));
      if (add > 0) { p.vx += ca * add; p.vy += sa * add; }
      p.spin += (hard ? 2.6 : 0.8) * sign(angleDiff(Math.atan2(sa, ca), Math.atan2(pl.vy, pl.vx) || 0)) * dt;
      if (hard) { p.swamp += 0.04; if (Math.random() < 0.25) G.particles.splash(p.x, p.y, 0.4); }
      // she feels it too -- but only a nudge, and less from a piece that is
      // already half under. Wreckage is scenery she can shoulder through,
      // never a wall she can be pinned against.
      const back = 70 * p.mass * (1 - p.swamp * 0.7) * dt;
      pl.vx -= ca * back; pl.vy -= sa * back;
    }
  }

  update(dt) {
    this.t += dt;
    const P = G.particles, oc = G.ocean;
    // Wreckage that has drifted out of shot still floats, drifts, swamps and
    // sinks -- it simply stops paying for foam, bubbles and jelly it would
    // be making where nobody can see it. That is most of the cost of a bay
    // full of broken boats.
    const cm = G.cam || { x: this.x - 320, y: this.y - 180 };
    const seen = (x, y) => x > cm.x - 90 && x < cm.x + 730 && y > cm.y - 90 && y < cm.y + 450;
    // scheduled secondaries
    while (this.events.length && this.events[0].t <= this.t) this.fireEvent(this.events.shift().k);
    // she burns and bleeds oil while there is anything left of her
    if (this.fireT > 0) {
      this.fireT -= dt; this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.09;
        // the fire is ON the wreckage: it goes where the pieces go, so two
        // halves drifting apart drag two columns of smoke apart with them
        const q = this.pieces.length ? this.pieces[(Math.random() * this.pieces.length) | 0] : this;
        if (!q.sinking && seen(q.x, q.y)) {
          P.smoke(q.x + rand(-4, 4), q.y + rand(-3, 3), 1, 'rgba(30,28,34,', 3.4);
          if (Math.random() < 0.55) P.fire(q.x + rand(-3, 3), q.y, 1);
        }
        if (Math.random() < 0.3) P.bubbles(this.x + rand(-8, 8), this.y + rand(-4, 4), 1);
      }
    }
    this.oilT -= dt;
    if (this.oilT <= 0) { this.oilT = 0.25; if (oc) oc.addOil(this.x, this.y, 0.03); }

    if (this.whole) {                  // the fallback sink, unchanged in feel
      if (this.t > this.whole.dur) this.dead = true;
      return;
    }

    // ---- hard stops. However she is shoved about, floating wreckage has a
    //      last day: past this she takes water whatever she is made of, and
    //      past THIS she is gone, so nothing can ever accumulate on the bay.
    if (this.t > BREAK.floatLife + 20) { this.pieces.length = 0; this.dead = true; return; }
    if (this.t > BREAK.floatLife + 13) {
      for (let i = 0; i < this.pieces.length; i++) {
        const q = this.pieces[i];
        if (!q.sinking) { q.pivot = null; q.z = 0; q.vz = 0; q.swamp = 1; q.sinking = true; q.sinkDur = 0.7; }
      }
    }
    let cx = 0, cy = 0, n = 0, rad = 6;
    const forced = this.t > BREAK.floatLife;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life += dt;

      // ---- the derrick swinging down on its hinge
      if (p.pivot) {
        const pv = p.pivot;
        pv.t += dt;
        const k = Math.min(1, pv.t / pv.dur), e = k * k;         // it accelerates
        p.ang = pv.a + (pv.to - pv.a) * e;
        p.x = pv.hx + Math.cos(p.ang) * pv.arm;
        p.y = pv.hy + Math.sin(p.ang) * pv.arm;
        if (k >= 1) {
          p.pivot = null; p.spin = rand(-1.4, 1.4);
          if (seen(p.x, p.y)) {
            P.splash(p.x, p.y, 1.5);
            if (oc) { oc.disturb(p.x, p.y, 4.5, 0, 0); oc.ripple(p.x, p.y, 44, 90, 0.6); }
            Audio_.splash(0.9);
          }
        }
        cx += p.x; cy += p.y; n++;
        continue;
      }

      // ---- in the air, thrown clear
      if (p.z > 0 || p.vz > 0) {
        p.vz -= 460 * dt; p.z += p.vz * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.ang += p.spin * dt;
        if (p.z <= 0) {
          p.z = 0; p.vz = 0;
          if (seen(p.x, p.y)) {
            P.splash(p.x, p.y, clamp(0.4 + p.mass * 1.3, 0.35, 2));
            if (oc) { oc.disturb(p.x, p.y, 2 + p.mass * 4, p.vx, p.vy); oc.ripple(p.x, p.y, 20 + p.mass * 30, 70, 0.55); oc.addFoam(p.x, p.y, 0.5); }
            if (p.mass > 0.6) Audio_.splash(0.8);
          }
          p.vx *= 0.45; p.vy *= 0.45; p.spin *= 0.4;
        }
        cx += p.x; cy += p.y; n++;
        continue;
      }

      // ---- in the water
      const k = Math.pow(0.10 + p.buoy * 0.06, dt);
      p.vx *= k; p.vy *= k;
      // the set of the current is resampled a few times a second, not sixty:
      // it changes far more slowly than the wreckage drifting through it
      p.flowT = (p.flowT || 0) - dt;
      if (p.flowT <= 0 && oc) { p.flowT = 0.3; const f = oc.flow(p.x, p.y); p.fx = f.x; p.fy = f.y; }
      if (p.fx || p.fy) { const g = dt * (0.35 + p.buoy * 0.9); p.vx += p.fx * g; p.vy += p.fy * g; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.x = clamp(p.x, 6, G.ocean.W - 6); p.y = clamp(p.y, WATER_TOP - 10, G.ocean.H - 6);
      p.ang += p.spin * dt;
      p.spin *= Math.pow(0.18, dt);
      // a piece still moving pushes the surface about and leaves foam
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 26 && oc && seen(p.x, p.y)) {
        if (oc.disturb && p.mass > 0.45 && Math.random() < dt * 7) oc.disturb(p.x, p.y, Math.min(2.4, sp / 55), p.vx, p.vy);
        if (Math.random() < dt * 4) oc.addFoam(p.x, p.y, 0.09);
      }
      // ---- swamping: she fills, and what she is made of decides how fast
      if (!p.sinking) {
        const rate = Math.pow(1 - p.buoy, 1.6) * 0.55 + 0.012;
        p.swamp += dt * rate * (0.65 + p.mass * 0.7) + (forced ? dt * 0.55 : 0);
        if (p.swamp >= 1) {
          p.sinking = true; p.sinkDur = 0.9 + p.buoy * 2.4 + p.mass * 0.8;
          p.spin = (p.spin || rand(-0.4, 0.4)) + rand(-0.7, 0.7);
          if (seen(p.x, p.y)) { P.bubbles(p.x, p.y, 4); if (oc) { oc.ripple(p.x, p.y, 18 + p.mass * 26, 55, 0.5); oc.addFoam(p.x, p.y, 0.4); } }
        }
      } else {
        p.sink += dt / p.sinkDur;
        if (Math.random() < dt * 3.5 && seen(p.x, p.y)) P.bubbles(p.x + rand(-4, 4), p.y + rand(-4, 4), 1);
        if (p.sink >= 1) {
          if (oc) { oc.addFoam(p.x, p.y, 0.3); oc.addOil(p.x, p.y, 0.05); }
          if (seen(p.x, p.y)) P.bubbles(p.x, p.y, 3);
          this.pieces.splice(i, 1);
          continue;
        }
      }
      cx += p.x; cy += p.y; n++;
      const dd = Math.hypot(p.x - this.x, p.y - this.y) + p.r;
      if (dd > rad) rad = dd;
    }
    if (n) { this.x = cx / n; this.y = cy / n; this.radius = clamp(rad, 6, 90); }
    else this.dead = true;
  }

  render(ctx, cam) {
    if (this.whole) {
      const k = clamp(this.t / this.whole.dur, 0, 1);
      ctx.save(); ctx.globalAlpha = 1 - k * k;
      const tilt = Math.sin(k * 2) * 0.5;
      drawSprite(ctx, sinkTint(this.sprite, Math.min(2, (k * 3) | 0)), this.x - cam.x, this.y - cam.y, this.angle + tilt * 0.5, 1 - k * 0.3, 1 - k * 0.6);
      ctx.restore();
      return;
    }
    const T = G.time || this.t, oc = G.ocean;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      const bx = p.x - cam.x, by = p.y - cam.y;
      if (bx < -80 || by < -80 || bx > 720 || by > 440) continue;
      // she rides the swell, and rides it less the more water she has taken
      const float = (1 - p.swamp * 0.7);
      const bob = (Math.sin(p.life * 2.3 + p.ph) * (0.5 + p.buoy * 1.1)
        + (oc && oc.waveHeight ? oc.waveHeight(p.x, p.y, T) * 1.3 : 0)) * float;
      if (p.z > 1.5) {                    // its shadow on the water below it
        ctx.fillStyle = 'rgba(6,18,48,0.34)';
        const sw = Math.max(2, Math.round(p.spr.w * 0.55));
        ctx.fillRect(Math.round(bx - sw / 2), Math.round(by), sw, 2);
      }
      const k = p.sinking ? clamp(p.sink, 0, 1) : 0;
      // swamped reads darker even before she starts down: the paint is wet
      const spr = sinkTint(p.spr, Math.min(2, ((k * 2.6) | 0) + (p.swamp > 0.85 ? 1 : 0)));
      // going down end-first: she shortens toward the end that is under
      const sh = p.down * p.spr.w * 0.42 * k;
      // and she rocks on the swell she is riding, less the deeper she sits
      const ang = p.ang + (p.z > 0 ? 0 : Math.sin(p.life * 1.15 + p.ph * 1.7) * 0.055 * float);
      const dx = bx + Math.cos(ang) * sh, dy = by - p.z + bob + Math.sin(ang) * sh;
      const al = 1 - k * k * 0.92;
      // One transform per piece, set up by hand. drawSprite would take a save
      // for itself and the hi-res bridge another for the 1/DETAIL scale, and
      // with seventy pieces on the water that is seventy state saves a frame
      // paid twice over for nothing.
      ctx.save();
      if (al < 1) ctx.globalAlpha = al;
      ctx.translate(Math.round(dx * DETAIL) / DETAIL, Math.round(dy * DETAIL) / DETAIL);
      ctx.rotate(ang);
      if (RAWP && spr.hi) {
        const iv = 1 / DETAIL;
        ctx.scale((1 - k * 0.72) * iv, (1 - k * 0.34) * iv);
        RAWP(ctx, spr.c, -spr.ax * DETAIL, -spr.ay * DETAIL);
      } else {
        if (k) ctx.scale(1 - k * 0.72, 1 - k * 0.34);
        ctx.drawImage(spr.c, -spr.ax, -spr.ay);
      }
      ctx.restore();
    }
  }
}

// ---- global wreckage services ------------------------------------------
// Every explosion in this file routes through here, so a blast anywhere near
// floating wreckage throws it about instead of ignoring it.
Wreck.shove = function (x, y, r, power) {
  const ws = G && G.wrecks; if (!ws) return;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (w.shove && Math.abs(w.x - x) < r + w.radius + 40 && Math.abs(w.y - y) < r + w.radius + 40) w.shove(x, y, r + w.radius * 0.5, power);
  }
};
// Over budget: the oldest floating wreckage starts taking water, so the piece
// count comes down on its own instead of being snapped out of existence.
Wreck.makeRoom = function (need) {
  const ws = G && G.wrecks; if (!ws || !ws.length) return;
  const order = ws.slice().sort((a, b) => b.t - a.t);      // oldest first
  let freed = 0;
  for (const w of order) {
    if (!w.pieces) continue;
    for (const p of w.pieces) {
      if (p.sinking) continue;
      p.swamp = 1; p.sinking = true; p.sinkDur = 0.5; freed++;
      if (freed >= need) return;
    }
  }
};

// ---- a derrick, built once per size ------------------------------------
// Pixel art, integer coordinates, three posterized bands and a hard outline:
// the same rules the hulls are drawn to.
const _mastCache = new Map();
function mastSprite(len) {
  len = clamp(len | 0, 12, 100);   // a derrick grows with the fleet it stands on
  const key = len;
  if (_mastCache.has(key)) return _mastCache.get(key);
  let s = null;
  try {
    const A = (typeof AS === 'number') ? AS : 1;
    const W = len * A, H = 9 * A, c = newCan(W, H), x = c.getContext('2d');
    const cy = (H / 2) | 0;
    const put = (col, px0, py0, w, h) => { x.fillStyle = col; x.fillRect(px0 | 0, py0 | 0, w | 0, h | 0); };
    put('#14141c', 0, cy - 2, W, 5);                    // the spar, outlined
    put('#8f6a3a', 0, cy - 1, W, 3);
    put('#c9a469', 0, cy - 1, W, 1);
    put('#5c3a1c', 0, cy + 1, W, 1);
    for (let i = 1; i * 6 * A < W - 2; i++) put('#3a2413', i * 6 * A, cy - 1, 1, 3);   // bands
    // cross-tree two thirds up, and a block at the head
    const cxp = (W * 0.62) | 0;
    put('#14141c', cxp - 1, cy - 4 * A, 3, 8 * A);
    put('#aeb6c1', cxp, cy - 4 * A + 1, 1, 8 * A - 2);
    put('#14141c', W - 3 * A, cy - 3, 3 * A, 7);
    put('#cdd8e6', W - 3 * A + 1, cy - 2, 2 * A - 1, 2);
    s = (A > 1 && typeof spriteFromHi === 'function') ? spriteFromHi(c, W / 2, cy) : { c, w: W, h: H, ax: W / 2, ay: cy };
  } catch (e) { s = null; }
  _mastCache.set(key, s);
  return s;
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
    this.platingT = 0;
    this.rampage = { meter: 0, active: false, t: 0, aim: 0, fireT: 0 };
    this.dive = { active: false, t: 0, cd: 0 };
    this.decoyCd = 0; this.tidalCd = 0;
    // the manatee's own weapon: a two-tonne tail sweep, bought in the tree
    this.melee = { phase: 'idle', t: 0, cd: 0, dir: 0, side: 1, hits: null, arcT: 0 };
    this.tether = null;
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
    this.invuln -= dt; this.hurt -= dt; this.joyT -= dt; this.boost -= dt; this.slowed -= dt; this.platingT -= dt; this.absorb.cd -= dt; this.absorb.flash -= dt; this.dive.cd -= dt; this.decoyCd -= dt; this.tidalCd -= dt; this.melee.cd -= dt;
    for (const k of ['primary', 'sidearm']) { this.weaponCd[k] -= dt; this.recoil[k] = Math.max(0, this.recoil[k] - dt); this.flash[k] -= dt; }
    if (this.roll.charges < st.rollCharges) { this.roll.rechargeT -= dt; if (this.roll.rechargeT <= 0) { this.roll.charges++; this.roll.rechargeT = this.cd(2.4 * st.rollCd); } }
    if (st.regen > 0) { this.hp = Math.min(st.maxHp, this.hp + st.regen * dt); }
    // ---- abilities
    if (Input.actHit('roll') && !this.roll.active && this.roll.charges > 0 && !this.dive.active) this.startRoll(inp);
    if (Input.actHit('shield') && !this.absorb.active && this.absorb.cd <= 0 && !this.roll.active) { this.absorb.active = true; this.absorb.t = 0; G.ocean.ripple(this.x, this.y, 40, 120, 0.6); }
    // MELEE: does nothing whatsoever until the tree unlocks it
    if (st.melee && Input.actHit('melee') && this.melee.phase === 'idle' && this.melee.cd <= 0 && !this.roll.active && !this.dive.active) this.startMelee();
    if (this.melee.phase !== 'idle') this.updateMelee(dt);
    if (Input.actHit('rampage') && this.rampage.meter >= 100 && !this.rampage.active) this.startRampage();
    if (st.dive && Input.actHit('dive') && !this.dive.active && this.dive.cd <= 0 && !this.roll.active) { this.dive.active = true; this.dive.t = 0; G.particles.splash(this.x, this.y, 1.6); G.particles.bubbles(this.x, this.y, 8); Audio_.splash(1.2); }
    if (st.decoy && Input.actHit('decoy') && this.decoyCd <= 0) { this.decoyCd = this.cd(14); G.buoy = new Buoy(this.x - this.facing * 30, this.y); G.particles.splash(G.buoy.x, G.buoy.y, 0.8); G.particles.text(this.x, this.y - 20, 'DECOY!', '#8ac6ff'); }
    if (st.tidal && Input.actHit('tidal') && this.tidalCd <= 0) this.tidalSlam();
    // interact: mount a whale, crack a chest
    if (typeof Wildlife !== 'undefined' && Wildlife.onPlayerAction &&
        (Input.hit('KeyG') || Input.hit('KeyX') || Input.actHit('interact'))) Wildlife.onPlayerAction();
    if (this.absorb.active) { this.absorb.t += dt; if (this.absorb.t > st.absorbWindow) { this.absorb.active = false; this.absorb.cd = this.cd(st.absorbCd); } }
    if (this.dive.active) { this.dive.t += dt; if (Math.random() < 0.3) G.particles.bubbles(this.x + rand(-8, 8), this.y + rand(-6, 6), 1); if (this.dive.t > 1.5) { this.dive.active = false; this.dive.cd = this.cd(7); G.particles.splash(this.x, this.y, 1.8); Audio_.splash(1.3); } }
    // ---- movement
    const mPh = this.melee.phase;
    const meleeDrag = mPh === 'wind' ? 0.35 : mPh === 'strike' ? 0.6 : mPh === 'recover' ? 0.7 : 1;
    let speedMul = st.speed * (this.boost > 0 ? 1.6 : 1) * (this.slowed > 0 ? 0.45 : 1) * (this.dive.active ? 0.7 : 1) * (this.rampage.active ? 1.15 : 1) * meleeDrag;
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
    // a winch boat has a hook in her: it hauls her in until she rolls out of
    // it, the cable runs out, or the boat on the other end sinks
    if (this.tether) {
      const te = this.tether.e;
      if (!te || te.dead) this.freeTether('THE LINE GOES SLACK');
      else if (this.roll.active) this.freeTether('BROKE THE LINE!');
      else {
        this.tether.t -= dt;
        const a = angleTo(this.x, this.y, te.x, te.y);
        this.vx += Math.cos(a) * 330 * dt; this.vy += Math.sin(a) * 330 * dt;
        if (Math.random() < 0.5) G.particles.spray(this.x, this.y, a + Math.PI, 1, 50);
        G.ocean.addFoam(this.x, this.y, 0.08);
        if (this.tether.t <= 0) this.freeTether(null);
      }
    }
    // currents
    const f = G.ocean.flow(this.x, this.y);
    if (st.currentRider) { const l = Math.hypot(f.x, f.y); const hv = Math.hypot(this.vx, this.vy); if (hv > 5 && l > 1) { this.vx += this.vx / hv * l * dt * 0.8; this.vy += this.vy / hv * l * dt * 0.8; } }
    else { this.vx += f.x * dt * 0.6; this.vy += f.y * dt * 0.6; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    // bounds & rocks
    this.x = clamp(this.x, 16, G.ocean.W - 16); this.y = clamp(this.y, WATER_TOP, G.ocean.H - 16);
    for (const r of G.rocks) { const d = dist(this.x, this.y, r.x, r.y); if (d < r.r + 8) { const a = angleTo(r.x, r.y, this.x, this.y); this.x = r.x + Math.cos(a) * (r.r + 8); this.y = r.y + Math.sin(a) * (r.r + 8); if (this.roll.active) { this.endRoll(); G.particles.splash(this.x, this.y, 1.2); } this.vx *= 0.5; this.vy *= 0.5; } }
    // floating wreckage is real: she shoulders it aside, and a roll scatters
    // a raft of broken hull right across the water
    if (G.wrecks.length) {
      for (let i = 0; i < G.wrecks.length; i++) {
        const w = G.wrecks[i];
        if (!w.bump) continue;
        const reach = w.radius + 22;
        if (Math.abs(w.x - this.x) > reach || Math.abs(w.y - this.y) > reach) continue;
        w.bump(this, 12, dt);
      }
    }
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
  // ---- MELEE: the manatee's tail sweep -----------------------------------
  // Three beats, because a two-tonne animal does not flick. She hauls the
  // water in behind her (wind), the tail comes round through a real arc and
  // hits things in the order the arc reaches them (strike), then she is
  // committed to the follow-through and cannot steer out of it (recover).
  //
  // Every number it reads comes off the stats object, so the tree owns the
  // tuning entirely:
  //   stats.melee        bool   unlocked at all
  //   stats.meleeDmg     number damage per boat caught in the sweep
  //   stats.meleeCd      number seconds between swings (x stats.cdMult)
  //   stats.meleeArc     number radians of the sweep
  //   stats.meleeRange   number world units from her centre
  //   stats.meleeKnock   number knockback multiplier (1 = the base shove)
  //   stats.meleeBleed   number damage per second bled for 3s after a hit
  //   stats.meleeLifesteal number HP healed per boat hit
  //   stats.meleeStun    number seconds a hit boat is left wallowing
  //   stats.meleeWave    bool   the sweep throws a wall of water: longer
  //                             reach, and it swats enemy shots out of the air
  startMelee() {
    const st = this.stats, m = this.melee;
    m.phase = 'wind'; m.t = 0; m.hits = new Set(); m.arcT = 0;
    m.side = -m.side;                                   // alternate shoulders
    m.dir = (Input.mouse.moved || Input.mouse.down || this.target) ? this.aim : (this.facing === 1 ? 0 : Math.PI);
    m.cd = this.cd(st.meleeCd || 1.4);
    if (this.absorb.active) { this.absorb.active = false; this.absorb.cd = this.cd(st.absorbCd * 0.5); }
    // the wind-up: she rolls back and the water piles up behind the tail
    const bx = this.x - Math.cos(m.dir) * 16, by = this.y - Math.sin(m.dir) * 16;
    if (G.ocean.disturb) G.ocean.disturb(bx, by, -3.2, 0, 0);
    G.particles.bubbles(bx, by, 4);
    Toon.puff(bx, by, 2, '#cfe4f2');
    Audio_.tone(90, 0.22, 'sine', 0.16, 40);
  }
  get MELEE_WIND() { return 0.17; }
  get MELEE_SWING() { return 0.15; }
  updateMelee(dt) {
    const m = this.melee;
    m.t += dt;
    if (m.phase === 'wind') {
      const k = m.t / this.MELEE_WIND;
      const bx = this.x - Math.cos(m.dir) * 16, by = this.y - Math.sin(m.dir) * 16;
      if (Math.random() < 0.7) G.particles.spray(bx, by, m.dir + Math.PI, 1, 30 + k * 40);
      if (m.t >= this.MELEE_WIND) { m.phase = 'strike'; m.t = 0; this.meleeStrike(); }
    } else if (m.phase === 'strike') {
      this.meleeSweep(dt);
      if (m.t >= this.MELEE_SWING) { m.phase = 'recover'; m.t = 0; }
    } else if (m.t >= 0.20) { m.phase = 'idle'; m.t = 0; }
  }
  // the instant the tail starts moving: she lunges into it and the water goes
  meleeStrike() {
    const st = this.stats, m = this.melee;
    const range = this.meleeRange();
    this.vx += Math.cos(m.dir) * 190; this.vy += Math.sin(m.dir) * 190;
    if (Math.abs(Math.cos(m.dir)) > 0.25) this.facing = sign(Math.cos(m.dir));
    G.shake(st.meleeWave ? 5 : 3.5);
    Audio_.noise(0.26, 0.34, 1400, 180); Audio_.tone(130, 0.2, 'sine', 0.2, -60);
    G.ocean.ripple(this.x, this.y, range + 26, 200, 0.75);
    if (G.ocean.disturb) G.ocean.disturb(this.x + Math.cos(m.dir) * 14, this.y + Math.sin(m.dir) * 14, 6, Math.cos(m.dir) * 240, Math.sin(m.dir) * 240);
    G.particles.splash(this.x + Math.cos(m.dir) * 14, this.y + Math.sin(m.dir) * 14, 1.5);
    for (let i = 0; i < 4; i++) Toon.speed(this.x + Math.cos(m.dir) * 10, this.y + Math.sin(m.dir) * 10, m.dir, 2);
    if (st.meleeWave) { Toon.shock(this.x, this.y, range * 2.1, 0.32, '#cfe9ff'); G.ocean.ripple(this.x, this.y, range + 54, 260, 0.5); }
  }
  meleeRange() { const st = this.stats; return (st.meleeRange || 46) * (st.meleeWave ? 1.35 : 1); }
  // the arc really sweeps: a boat is hit when the leading edge reaches its
  // bearing, so a line of boats comes apart one after another
  meleeSweep(dt) {
    const st = this.stats, m = this.melee;
    const arc = st.meleeArc || 2.0, range = this.meleeRange();
    const k = clamp(m.t / this.MELEE_SWING, 0, 1);
    const ease = k * k * (3 - 2 * k);                   // heavy, then whipping
    m.arcT = ease;
    const edge = m.dir + m.side * (-arc / 2 + arc * ease);
    // the water the blade is passing through
    const ex = this.x + Math.cos(edge) * range * 0.8, ey = this.y + Math.sin(edge) * range * 0.8;
    G.ocean.addFoam(ex, ey, 0.5);
    if (G.ocean.disturb) G.ocean.disturb(ex, ey, 3.4, Math.cos(edge) * 200, Math.sin(edge) * 200);
    if (Math.random() < 0.9) G.particles.spray(ex, ey, edge + m.side * 1.4, 2, 130);
    const reached = tgt => {
      const b = angleTo(this.x, this.y, tgt.x, tgt.y);
      const rel = angleDiff(m.dir, b) * m.side;
      if (Math.abs(rel) > arc / 2) return false;
      return ease >= (rel + arc / 2) / arc;
    };
    for (const e of G.enemies) {
      if (e.dead || m.hits.has(e)) continue;
      if (dist(this.x, this.y, e.x, e.y) > range + e.radius) continue;
      if (!reached(e)) continue;
      m.hits.add(e); this.meleeHit(e);
    }
    const b = G.boss;
    if (b && !b.dead && !m.hits.has(b) && dist(this.x, this.y, b.x, b.y) <= range + b.radius && reached(b)) { m.hits.add(b); this.meleeHit(b); }
    // a wall of water swats shells out of the air as it goes
    if (st.meleeWave) for (const pr of G.projectiles) {
      if (pr.dead || pr.owner !== 'enemy') continue;
      if (dist(this.x, this.y, pr.x, pr.y) > range + 8) continue;
      if (!reached(pr)) continue;
      pr.dead = true; G.particles.sparks(pr.x, pr.y, 5); Toon.impact(pr.x, pr.y, 0.7, '#cfe9ff');
    }
  }
  meleeHit(e) {
    const st = this.stats, m = this.melee;
    const a = angleTo(this.x, this.y, e.x, e.y);
    const dmg = st.meleeDmg || 40;
    const knock = 330 * (st.meleeKnock || 1);
    e.hit(dmg, Math.cos(a) * knock, Math.sin(a) * knock, null);
    if (st.meleeBleed && !e.dead) { e.bleedT = 3; e.bleedDps = st.meleeBleed; }
    if (st.meleeStun && !e.dead) e.slowT = Math.max(e.slowT || 0, st.meleeStun);
    if (st.meleeLifesteal) this.hp = Math.min(st.maxHp, this.hp + st.meleeLifesteal);
    // the hit itself: a hard impact ring, a burst, and the sea moving
    Toon.impact(e.x, e.y, 1.6, '#eaf8ff');
    Toon.burst(e.x, e.y, 1.1, '#cfe9ff');
    G.particles.splash((this.x + e.x) / 2, (this.y + e.y) / 2, 1.5);
    G.particles.debris(e.x, e.y, 4);
    G.ocean.ripple(e.x, e.y, 46, 190, 0.7);
    if (G.ocean.disturb) G.ocean.disturb(e.x, e.y, 5, Math.cos(a) * 260, Math.sin(a) * 260);
    G.shake(5);
    Audio_.noise(0.16, 0.3, 900, 90); Audio_.tone(110, 0.14, 'square', 0.18, -50);
    if (m.hits.size === 1) G.particles.text(this.x + Math.cos(m.dir) * 20, this.y - 18, 'WHUMP!', '#cfe9ff', 9);
  }
  // ---- being winched in ---------------------------------------------------
  hooked(boat, proj) {
    if (this.dead || this.rolling || this.dive.active) return;
    this.tether = { e: boat, t: 2.2 };
    this.damage(proj.dmg, proj.x, proj.y);
    G.particles.text(this.x, this.y - 26, 'HOOKED!', '#ff9a3c', 9);
    Toon.emote(this.x + 12, this.y - 30, '!');
    Audio_.tone(200, 0.35, 'sawtooth', 0.18, -90);
  }
  freeTether(msg) {
    if (!this.tether) return;
    this.tether = null;
    G.particles.splash(this.x, this.y, 1.1);
    if (msg) G.particles.text(this.x, this.y - 24, msg, '#8ac6ff', 8);
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
    for (const e of G.enemies) if (!e.dead && (e.hitTest ? e.hitTest(this.x, this.y, 150) : dist(this.x, this.y, e.x, e.y) < 150 + e.radius)) { const a = angleTo(this.x, this.y, e.x, e.y); e.hit(40, Math.cos(a) * 420, Math.sin(a) * 420, null); }
    if (G.boss && !G.boss.dead && dist(this.x, this.y, G.boss.x, G.boss.y) < 160) G.boss.hit(40, 0, 0, null);
    for (const pr of G.projectiles) if (pr.owner === 'enemy' && dist(this.x, this.y, pr.x, pr.y) < 150) pr.dead = true;
    if (typeof Wreck !== 'undefined' && Wreck.shove) Wreck.shove(this.x, this.y, 150, 1.4);
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
    G.particles.sparks(proj.x, proj.y, 10); G.particles.text(this.x, this.y - 20, 'PARRY', '#8ac6ff', 8);
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
    if (this.platingT > 0) { amt *= 0.45; G.particles.sparks(this.x, this.y, 4); }
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
    this.target = G.nearestEnemy(this.x, this.y, 340, null, true);
    // The otter NEVER shoots on his own. He fires while you hold the button
    // and not one round otherwise.
    const wantFire = !G.holdFire && Input.act('fire');
    const touchAim = (typeof MobileUI !== 'undefined' && MobileUI.enabled) ? MobileUI.aimAt() : null;
    if (touchAim) { const w = G.screenToWorld(touchAim.x, touchAim.y); this.aim = this.assistAim(angleTo(this.x, this.y, w.x, w.y)); }
    else if (Input.mouse.moved || Input.mouse.down) { this.aim = this.assistAim(angleTo(this.x, this.y, mouseWorld.x, mouseWorld.y)); }
    else if (this.target) { const lead = 0.15; this.aim = angleTo(this.x, this.y, this.target.x + (this.target.vx || 0) * lead, this.target.y + (this.target.vy || 0) * lead); }
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
  // Point near a boat and the otter finishes the job: inside a generous cone
  // he leads the target himself. Aiming at open water still aims at open water.
  assistAim(raw) {
    let best = null, bestErr = 0.30;
    const list = G.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (e.dead) continue;
      const d = dist(this.x, this.y, e.x, e.y); if (d > 420) continue;
      const lead = d / 520;
      const a = angleTo(this.x, this.y, e.x + (e.vx || 0) * lead, e.y + (e.vy || 0) * lead);
      let err = Math.abs(angleDiff(a, raw));
      // a wider cone for anything close enough to be a real threat
      const tol = d < 140 ? 0.42 : 0.30;
      if (err < tol && err < bestErr) { bestErr = err; best = a; }
    }
    const b = G.boss;
    if (b && !b.dead) {
      const a = angleTo(this.x, this.y, b.x, b.y);
      if (Math.abs(angleDiff(a, raw)) < 0.34) best = a;
    }
    return best === null ? raw : best;
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
  // The sweep, drawn as hard posterized blocks on a squashed arc: a bright
  // leading edge, two bands of thrown water behind it and a dark trailing
  // trough. No curves, no alpha ramps -- it is water shoved into a shape.
  renderMelee(ctx, sx, sy) {
    const st = this.stats, m = this.melee;
    const arc = st.meleeArc || 2.0, range = this.meleeRange();
    const cx = Math.round(sx), cy = Math.round(sy);
    const BANDS = ['#f4fbff', '#8fd4ff', '#4f8fc4', '#24466e'];
    const blk = (ang, r, col, sz) => {
      ctx.fillStyle = col;
      ctx.fillRect(cx + Math.round(Math.cos(ang) * r) - (sz >> 1), cy + Math.round(Math.sin(ang) * r * 0.82) - (sz >> 1), sz, sz);
    };
    if (m.phase === 'wind') {
      // the tail cocked back, and the water piling up behind it: a dark
      // trough with a pale crest so it reads against any colour of sea
      const k = clamp(m.t / this.MELEE_WIND, 0, 1);
      const a0 = m.dir - m.side * arc / 2;
      for (let i = 0; i < 6; i++) {
        const ang = a0 - m.side * i * 0.12;
        const r = range * (0.40 + 0.36 * k);
        blk(ang, r + 3, '#0f2440', 4);
        blk(ang, r, '#3f7cb0', 3);
        blk(ang, r - 4, '#8fd4ff', 2);
      }
      blk(a0, range * (0.50 + 0.44 * k), '#f4fbff', 4);
      return;
    }
    const k = m.phase === 'strike' ? m.arcT : 1;
    const fade = m.phase === 'recover' ? clamp(1 - m.t / 0.20, 0, 1) : 1;
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      if (u > k) break;
      const ang = m.dir + m.side * (-arc / 2 + arc * u);
      const age = (k - u) / Math.max(0.001, k);
      if (age > fade) continue;
      const band = age < 0.12 ? 0 : age < 0.34 ? 1 : age < 0.62 ? 2 : 3;
      const rOut = range * (0.98 - age * 0.16), rIn = range * (0.50 + age * 0.24);
      for (let r = rIn; r <= rOut; r += 3) blk(ang, r, BANDS[band], band < 2 ? 3 : 2);
    }
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
    // snap to the layer's pixel grid, not to whole world units: rounding here
    // was quantising the bob into visible two-pixel steps
    ctx.translate(Math.round(sx * DETAIL) / DETAIL,
      Math.round((sy + bob + (this.dive.active ? 4 : 0)) * DETAIL) / DETAIL);
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
      // the rig leads and lags off these: a velocity vector so it can throw the
      // otter sideways, an unclamped heading so a facing flip is seen coming
      // rather than masked, the roll's direction so the barrel roll spins the
      // right way, and the dash so it can wind up for one
      vx: this.vx, vy: this.vy,
      heading: (this.vx || this.vy) ? Math.atan2(this.vy, this.vx) : null,
      rollDirX: this.roll.dirx, rollDirY: this.roll.diry,
      boost: this.boost,
      gunSprite: SP.guns[this.tree.primary] || SP.guns.revolver,
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    if (this.melee.phase !== 'idle') this.renderMelee(ctx, sx, sy);
    if (this.slowed > 0) { ctx.globalAlpha = 0.8; drawSprite(ctx, SP.net, sx, sy - 4, 0, 2, 2); ctx.globalAlpha = 1; }
    if (this.rampage.meter >= 100 && !this.rampage.active && Math.floor(t * 3) % 2 === 0)
      pixelText(ctx, 'Q: RAMPAGE', Math.round(sx), Math.round(sy - 38), 7, '#ff6161', 'center');
  }

}

// ============================ ENEMIES ====================================
// NOTE on `radius`, `wake` and `turn`: the numbers written here are the
// values this fleet was balanced at when every hull was half the size it is
// now. They are NOT what the game runs on. tuneFleet() (above) overwrites
// all three at load from the hull src/chars.js actually built, and keeps the
// authored value in baseRadius / baseWake / baseTurn. Change the hull in
// chars.js and the hitbox follows it on its own; editing the number here
// only moves the fallback for a boat whose sprite is missing.
const ENEMY_TYPES = {
  dinghy: { hp: 30, speed: 100, turn: 2.6, radius: 12, behavior: 'chase', ram: 12, drops: { wood: 2, metal: 1 }, name: 'Fishing Dinghy', wake: 6 },
  netter: { hp: 48, speed: 85, turn: 2.2, radius: 13, behavior: 'orbit', orbit: 150, attackCd: 3.0, attack: 'net', ram: 8, drops: { wood: 2, tech: 1 }, name: 'Net Boat', wake: 7 },
  harpooner: { hp: 58, speed: 88, turn: 2.2, radius: 14, behavior: 'kite', orbit: 260, attackCd: 2.4, attack: 'harpoon', ram: 8, drops: { metal: 3, wood: 1 }, name: 'Harpooner', wake: 7 },
  speedboat: { hp: 55, speed: 215, turn: 3.2, radius: 15, behavior: 'strafe', attackCd: 0.18, attack: 'pistol', ram: 15, drops: { fuel: 3, metal: 1 }, name: 'Speedboat', wake: 9 },
  jetski: { hp: 22, speed: 200, turn: 5, radius: 8, behavior: 'zigzag', ram: 0, kamikaze: 22, drops: { fuel: 2 }, name: 'Jetski Bomber', wake: 4 },
  dynaboat: { hp: 62, speed: 78, turn: 2.0, radius: 14, behavior: 'orbit', orbit: 210, attackCd: 2.8, attack: 'dynamite', ram: 8, drops: { powder: 3, wood: 1 }, name: 'Dynamite Skiff', wake: 7 },
  trawler: { hp: 280, speed: 58, turn: 1.1, radius: 25, behavior: 'chase', attackCd: 2.2, attack: 'buckshot', attackRange: 230, ram: 25, drops: { metal: 4, wood: 4, tech: 2 }, name: 'Trawler', wake: 14, big: true },
  gunboat: { hp: 220, speed: 92, turn: 1.7, radius: 22, behavior: 'kite', orbit: 230, attackCd: 2.1, attack: 'turret', ram: 15, drops: { metal: 5, powder: 3, tech: 3 }, name: 'Gunboat', wake: 12, big: true },
  // ---- the rest of the fleet -------------------------------------------
  // A pusher tug: no guns at all, just weight. Slow enough to walk away from,
  // punishing if you let it corner you against the pier.
  tug: { hp: 190, speed: 70, turn: 1.3, radius: 20, behavior: 'chase', ram: 20, drops: { metal: 4, fuel: 2 }, name: 'Harbour Tug', wake: 11, big: true },
  // Lays baited hooks that drift and linger. Area denial you can simply swim
  // around, or parry if you would rather not.
  longliner: { hp: 74, speed: 80, turn: 1.9, radius: 15, behavior: 'kite', orbit: 240, attackCd: 3.4, attack: 'hooks', ram: 8, drops: { wood: 3, tech: 2 }, name: 'Longliner', wake: 8 },
  // Drops crab pots in your path. They sink, sit, and burst.
  crabber: { hp: 86, speed: 74, turn: 1.8, radius: 15, behavior: 'orbit', orbit: 170, attackCd: 3.2, attack: 'pot', ram: 8, drops: { wood: 2, metal: 2, tech: 1 }, name: 'Crabber', wake: 8 },
  // Unarmed. Fires a flare that rallies everything near it. Kill it first.
  spotter: { hp: 40, speed: 170, turn: 3.6, radius: 11, behavior: 'kite', orbit: 300, attackCd: 5.0, attack: 'flare', ram: 6, drops: { fuel: 2, tech: 3 }, name: 'Spotter', wake: 6 },
  // ---- the wider fleet --------------------------------------------------
  // Everything below arrives in the middle and late waves. None of them is a
  // stat variation: each one asks the player to do something she was not
  // doing a moment ago, and every dangerous thing any of them does is on
  // screen for the best part of a second before it lands.

  // Runs on the surface, then goes under where nothing the otter fires can
  // touch it. A boil of bubbles marks where it is about to come up. Get off
  // that spot -- or hit it with the manatee, which reaches under the water.
  sub: { hp: 78, speed: 96, turn: 2.2, radius: 13, behavior: 'kite', orbit: 170, ram: 8,
    drops: { metal: 3, tech: 2 }, name: 'Submersible', wake: 7 },
  // No guns at all. Everything inside its ring takes 60% less damage, so it
  // is the thing you shoot first and the reason a pack suddenly reads as a
  // wall instead of a queue.
  bulwark: { hp: 170, speed: 68, turn: 1.3, radius: 20, behavior: 'chase', ram: 12,
    drops: { metal: 5, wood: 3 }, name: 'Bulwark Barge', wake: 11, big: true },
  // Runs a lane across your front and pays mines out over the stern. The
  // water it has already crossed is the danger, not the boat.
  minelayer: { hp: 82, speed: 122, turn: 2.4, radius: 14, behavior: 'runner', orbit: 210, ram: 8,
    drops: { powder: 3, metal: 2 }, name: 'Mine Runner', wake: 8 },
  // It will not fire at a moving target. Hold still to line up a shot of your
  // own and it lines one up on you, with a sight line you can watch grow.
  stalker: { hp: 70, speed: 92, turn: 2.2, radius: 13, behavior: 'orbit', orbit: 210, ram: 6,
    drops: { tech: 3, metal: 1 }, name: 'Stillwater Gunner', wake: 7 },
  // They fish in pairs on one warp. Sink one and its partner hauls a fresh
  // boat up in four seconds unless you put the partner down as well.
  twin: { hp: 64, speed: 92, turn: 2.0, radius: 13, behavior: 'chase', ram: 10,
    drops: { wood: 2, metal: 2 }, name: 'Trawl Pair', wake: 7 },
  // Keeps the width of the bay between you and it and whistles up more boats.
  // The only answer is to go and get it.
  courier: { hp: 46, speed: 178, turn: 3.4, radius: 11, behavior: 'flee', orbit: 300, ram: 4,
    drops: { fuel: 3, tech: 2 }, name: 'Signal Runner', wake: 6 },
  // Spins its winch up for a second, throws a hook, and reels you in. Roll
  // and the line parts.
  grappler: { hp: 96, speed: 84, turn: 1.9, radius: 15, behavior: 'kite', orbit: 190, ram: 8,
    drops: { metal: 3, tech: 2 }, name: 'Winch Boat', wake: 8 },
  // Plated across the bow and nowhere else. Shoot the front and it sparks
  // off; get behind it and it comes apart. Bait the charge into a rock.
  ironclad: { hp: 200, speed: 84, turn: 1.25, radius: 19, behavior: 'chase', ram: 20,
    drops: { metal: 6, powder: 2 }, name: 'Ironclad Ram', wake: 11, big: true },
  // Patches up whatever is most chewed up. Leave it alone and nothing you
  // shoot stays shot.
  tender: { hp: 88, speed: 86, turn: 2.0, radius: 14, behavior: 'kite', orbit: 240, ram: 6,
    drops: { tech: 3, wood: 2 }, name: 'Repair Tender', wake: 8 },
  // Opens its intake and drags the whole bay -- you included -- into the
  // grinder. Survive the pull and it jams, and a jammed dredge takes 60%
  // more damage for three seconds.
  dredger: { hp: 250, speed: 56, turn: 1.0, radius: 24, behavior: 'chase', ram: 16,
    drops: { metal: 5, wood: 3, tech: 2 }, name: 'Dredge Barge', wake: 13, big: true },
};

// ---- hulls for the wider fleet -----------------------------------------
// src/chars.js owns buildBoat and the twelve original hull definitions, and
// nothing here touches that file. These boats are keyed by their own names,
// so they get their own hulls: rasterized through the SAME builder (which
// means the same hi-res bridge, the same planking, the same palette rules)
// from definitions that live here, then registered into SP.boats the first
// time a boat is built. If buildBoat ever goes away the type falls back to
// an existing hull rather than throwing.
const EXTRA_BOAT_DEFS = {
  sub:       { fallback: 'gunboat', def: { len: 32, beam: 8, motor: 1, cabin: 0.44, thwarts: [],
               hull: '#2c4a46', hullL: '#6f9c93', hullD: '#1d3330', hullDD: '#0f1f1d', deck: '#31504a', deckD: '#1e332f' } },
  bulwark:   { fallback: 'trawler', def: { len: 38, beam: 13, motor: 1, cabin: 0.20, gear: 'crates', thwarts: [0.7],
               hull: '#57606e', hullL: '#a3b0c0', hullD: '#3b434e', hullDD: '#232830', deck: '#4b5462', deckD: '#333a45' } },
  minelayer: { fallback: 'dynaboat', def: { len: 34, beam: 8, motor: 1, cabin: 0.22, gear: 'crates', thwarts: [0.6],
               hull: '#4d5232', hullL: '#98a069', hullD: '#343822', hullDD: '#1e2114', deck: '#464b30', deckD: '#2e321f' } },
  stalker:   { fallback: 'harpooner', def: { len: 30, beam: 6, motor: 1, gear: 'harpoon', cabin: 0.18, thwarts: [0.7],
               hull: '#3b3550', hullL: '#8478ab', hullD: '#282438', hullDD: '#171422', deck: '#3d3a4e', deckD: '#282636' } },
  twin:      { fallback: 'netter', def: { len: 28, beam: 7, motor: 1, gear: 'net', thwarts: [0.62],
               hull: '#2f5a6a', hullL: '#71a7b8', hullD: '#1f3c47', hullDD: '#12242b', deck: '#3a5c66', deckD: '#243b43' } },
  courier:   { fallback: 'spotter', def: { len: 26, beam: 5, motor: 1, cabin: 0.30, thwarts: [0.6],
               hull: '#d6d9e2', hullL: '#ffffff', hullD: '#9aa1b0', hullDD: '#636b7a', deck: '#2f5f9e', deckD: '#1e3f6c' } },
  grappler:  { fallback: 'gunboat', def: { len: 34, beam: 9, motor: 1, cabin: 0.16, gear: 'turret', thwarts: [0.74],
               hull: '#8a4a1f', hullL: '#d68d47', hullD: '#5f3113', hullDD: '#3a1c09', deck: '#4d463a', deckD: '#332e26' } },
  ironclad:  { fallback: 'gunboat', def: { len: 40, beam: 11, motor: 1, cabin: 0.16, gear: 'turret', thwarts: [],
               hull: '#39404b', hullL: '#7d8998', hullD: '#262c34', hullDD: '#14181e', deck: '#333a44', deckD: '#22272e' } },
  tender:    { fallback: 'crabber', def: { len: 30, beam: 8, motor: 1, cabin: 0.30, gear: 'crates', thwarts: [0.64],
               hull: '#d8cfae', hullL: '#fdf6dc', hullD: '#a2986f', hullDD: '#6b6345', deck: '#3f6b4a', deckD: '#28452f' } },
  dredger:   { fallback: 'trawler', def: { len: 48, beam: 13, motor: 1, cabin: 0.14, gear: 'crates', thwarts: [0.78],
               hull: '#7a4433', hullL: '#c08054', hullD: '#542c20', hullDD: '#321810', deck: '#4a4038', deckD: '#302924' } },
};
// px() is chars.js's one-pixel plotter; keep a local twin so a rename there
// can never break the fleet.
const HPX = (typeof px === 'function') ? px : (ctx, col, x, y, w = 1, h = 1) => { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w, h); };
// Marks painted straight onto the finished hi-res hull, in ART pixels, so
// each new boat carries its role in its silhouette. A = art px per world
// unit, X0/L/B match buildBoat's own frame.
const EXTRA_BOAT_PAINT = {
  sub(ctx, A, X0, L, B, cy) {
    for (let x = X0 + 2; x < X0 + L - 2; x++) { HPX(ctx, '#0f1f1d', x, cy - 1, 1, 3); }   // pressure seam
    const px0 = Math.round(X0 + L * 0.52);
    HPX(ctx, '#14141c', px0, cy - B - 4, 2, B + 5);                                       // periscope
    HPX(ctx, '#9ad7c6', px0, cy - B - 4, 2, 2);
    for (let i = 0; i < 3; i++) HPX(ctx, '#0f1f1d', X0 + 6 + i * 9, cy - 3, 3, 7);        // ballast vents
  },
  bulwark(ctx, A, X0, L, B, cy) {
    for (const sgn of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = Math.round(X0 + L * (0.18 + i * 0.17)), y = Math.round(cy + sgn * (B - 2));
      HPX(ctx, '#14141c', x, y - 3, 9, 7);
      HPX(ctx, '#b9c6d6', x + 1, y - 2, 7, 3);
      HPX(ctx, '#6f7b8b', x + 1, y + 1, 7, 2);
      HPX(ctx, '#e6eef8', x + 2, y - 2, 2, 1);
    }
  },
  minelayer(ctx, A, X0, L, B, cy) {
    for (let i = 0; i < 4; i++) {                       // a rack of drums aft
      const x = Math.round(X0 + L * 0.16) + i * 7;
      HPX(ctx, '#14141c', x, cy - 3, 6, 7);
      HPX(ctx, '#2b3140', x + 1, cy - 2, 4, 5);
      HPX(ctx, '#4d586b', x + 1, cy - 2, 4, 1);
      HPX(ctx, '#ff6161', x + 2, cy - 4, 2, 1);
    }
    HPX(ctx, '#14141c', Math.round(X0 + L * 0.12), cy - 5, 2, 11);   // launch rail
  },
  stalker(ctx, A, X0, L, B, cy) {
    const x0 = Math.round(X0 + L * 0.34), len = Math.round(L * 0.5);
    HPX(ctx, '#14141c', x0, cy - 4, len, 2);                          // sight rail
    HPX(ctx, '#b09ede', x0 + len - 4, cy - 4, 4, 2);
    HPX(ctx, '#ff6161', x0 + len - 1, cy - 4, 1, 2);
  },
  twin(ctx, A, X0, L, B, cy) {
    HPX(ctx, '#14141c', X0 + 2, cy - 4, 4, 9);                        // towing bollard
    HPX(ctx, '#9ecbd8', X0 + 3, cy - 3, 2, 3);
    for (let i = 0; i < 4; i++) HPX(ctx, '#c9b98e', X0 - 1 - i * 2, cy - 1 + (i & 1), 2, 1);
  },
  courier(ctx, A, X0, L, B, cy) {
    const x = Math.round(X0 + L * 0.58);                              // klaxon horn
    HPX(ctx, '#14141c', x, cy - 5, 3, 11);
    HPX(ctx, '#ffd27a', x + 3, cy - 3, 4, 7);
    HPX(ctx, '#fff3cf', x + 3, cy - 2, 3, 2);
    HPX(ctx, '#2f5f9e', Math.round(X0 + L * 0.2), cy - B + 1, Math.round(L * 0.3), 2);
  },
  grappler(ctx, A, X0, L, B, cy) {
    const x = Math.round(X0 + L * 0.34);                              // cable drum
    HPX(ctx, '#14141c', x, cy - 7, 11, 15);
    HPX(ctx, '#7d858f', x + 1, cy - 6, 9, 13);
    for (let i = 0; i < 5; i++) HPX(ctx, '#3a3f47', x + 1, cy - 6 + i * 3, 9, 1);
    HPX(ctx, '#d6a05e', x + 11, cy - 1, Math.round(L * 0.22), 2);     // the cable itself
  },
  ironclad(ctx, A, X0, L, B, cy) {
    // the armoured bow: three bright bands of plate and a ram spike. The rest
    // of the hull is left dark, so which end is which is never in doubt.
    const x0 = Math.round(X0 + L * 0.60);
    for (let x = x0; x < X0 + L - 1; x++) {
      const u = (x - x0) / Math.max(1, (X0 + L - 1 - x0));
      const hw = Math.round(B * Math.max(0.2, 1 - Math.pow(u, 1.5)) - 1);
      for (let y = cy - hw; y <= cy + hw; y++) {
        const near = Math.min(y - (cy - hw), (cy + hw) - y);
        HPX(ctx, near <= 0 ? '#14141c' : near <= 1 ? '#cdd8e6' : ((x - x0) % 5 === 0 ? '#5d6875' : '#8e9aab'), x, y);
      }
    }
    for (let i = 0; i < 4; i++) HPX(ctx, '#e8f0fa', x0 + 2 + i * 5, cy - 1, 1, 2);   // rivets
    HPX(ctx, '#14141c', X0 + L - 1, cy - 2, 5, 4);                                   // ram
    HPX(ctx, '#cdd8e6', X0 + L - 1, cy - 1, 4, 1);
  },
  tender(ctx, A, X0, L, B, cy) {
    const x = Math.round(X0 + L * 0.46);
    HPX(ctx, '#14141c', x, cy - 2, Math.round(L * 0.3), 4);           // rivet boom
    HPX(ctx, '#6fd88e', x + 2, cy - 1, Math.round(L * 0.3) - 4, 2);
    HPX(ctx, '#f4fbff', Math.round(X0 + L * 0.22), cy - 3, 2, 7);
    HPX(ctx, '#f4fbff', Math.round(X0 + L * 0.22) - 2, cy - 1, 6, 2);
  },
  dredger(ctx, A, X0, L, B, cy) {
    // the intake: a black mouth in the bow with a row of teeth
    const x0 = Math.round(X0 + L * 0.80);
    for (let x = x0; x < X0 + L; x++) {
      const hw = Math.round(B * 0.62 * (1 - (x - x0) / Math.max(1, (X0 + L - x0)) * 0.4));
      HPX(ctx, '#0a0d12', x, cy - hw, 1, hw * 2 + 1);
    }
    for (let i = -3; i <= 3; i++) HPX(ctx, '#cdd8e6', X0 + L - 2, cy + i * 3, 2, 1);
    HPX(ctx, '#14141c', x0 - 1, cy - Math.round(B * 0.7), 2, Math.round(B * 1.4));
    for (let i = 0; i < 3; i++) HPX(ctx, '#c08054', Math.round(X0 + L * 0.3) + i * 6, cy - 5, 4, 11); // spoil chutes
  },
};
// ---- keeping step with the fleet ---------------------------------------
// src/chars.js owns the hull dimensions and is free to rescale the whole
// fleet; this file must never be the reason a hitbox is wrong afterwards.
// So: nothing here carries a hard-coded size. The ten extra hulls are scaled
// by whatever factor the twelve original ones have moved by (measured off
// the built sprites, not off a copy of their numbers), and every collision
// radius in ENEMY_TYPES is then derived from the hull it actually belongs to.
//
// buildBoat rasterises a hull of `len` x `beam` (world units, beam being the
// HALF-beam at her widest) into a canvas of (len + 4) x (beam * 2 + 6), and
// the sprite record reports that in world units -- so the dimensions read
// straight back out of any hull, whoever built it:
const HULL_PAD_L = 4, HULL_PAD_B = 6;
// the collision radius at which a boat handles exactly as her `turn` says
const TURN_REF = 17;
function hullSize(spr) {
  if (!spr || !spr.w) return null;
  return { len: Math.max(4, spr.w - HULL_PAD_L), beam: Math.max(1.5, (spr.h - HULL_PAD_B) / 2) };
}
// The lengths the twelve original hulls were drawn at when this fleet was
// tuned. They are reference marks only: what matters is the RATIO between
// them and whatever chars.js is building today.
const HULL_BASE_LEN = { dinghy: 28, netter: 30, harpooner: 32, speedboat: 36, jetski: 20, dynaboat: 30, trawler: 52, gunboat: 46, tug: 34, longliner: 40, crabber: 32, spotter: 24 };
function fleetGrowth() {
  let sum = 0, n = 0;
  for (const k in HULL_BASE_LEN) {
    const h = hullSize(SP.boats[k]);
    if (h) { sum += h.len / HULL_BASE_LEN[k]; n++; }
  }
  return n ? clamp(sum / n, 0.4, 6) : 1;
}
// A boat's collision circle, from her own hull. A quarter of her length plus
// most of her half-beam: the circle that best matched the twelve hand-tuned
// radii this fleet was balanced on, so nothing changes shape when the hulls
// are the size they were and everything follows when they are not.
function hullRadius(spr, fallback) {
  const h = hullSize(spr);
  if (!h) return fallback;
  return Math.max(5, Math.round(h.len * 0.25 + h.beam * 0.85));
}
let _fleetTuned = false;
function tuneFleet() {
  if (_fleetTuned) return;
  if (typeof SP === 'undefined' || !SP.boats || !SP.boats.dinghy) return;
  _fleetTuned = true;
  _maxHullA = 0;                 // the biggest hull is measured again
  for (const k in ENEMY_TYPES) {
    const c = ENEMY_TYPES[k], spr = SP.boats[k];
    if (!spr) continue;
    c.baseRadius = c.baseRadius === undefined ? c.radius : c.baseRadius;
    c.radius = hullRadius(spr, c.baseRadius);
    // her wake is as wide as she is, and she throws the surface about in
    // proportion to her displacement
    c.baseWake = c.baseWake === undefined ? c.wake : c.baseWake;
    c.wake = Math.max(c.baseWake, Math.round(c.radius * 0.62));
    // ---- and the shape she really is. One circle cannot be both a jetski
    // and a fifty-foot trawler: on a long hull it stops shots a boat's width
    // out in open water and lets them straight through the bow. So a boat
    // also carries her own length and beam, and a shot counts if it is
    // inside EITHER the circle or the hull. That only ever ADDS hits -- the
    // bow and the stern become hittable, nothing stops being hittable.
    const h = hullSize(spr);
    c.hitLong = h ? h.len * 0.5 : c.radius;
    c.hitWide = h ? h.beam : c.radius;
    // A hull turns inside a circle set by her own length, so the longer she
    // is the wider she swings. TURN_REF is the size at which a boat still
    // handles exactly as she was tuned to: anything bigger comes round more
    // slowly, and the clamp says nothing ever turns FASTER than it did and
    // nothing ever ends up a barge that cannot come about at all. Both ends
    // of that are deliberate -- this must not make anything harder to dodge.
    c.baseTurn = c.baseTurn === undefined ? c.turn : c.baseTurn;
    c.turn = c.baseTurn * clamp(TURN_REF / c.radius, 0.62, 1);
  }
}

let _extraBoatsBuilt = false;
function ensureExtraBoats() {
  if (_extraBoatsBuilt) return;
  if (typeof SP === 'undefined' || !SP.boats || !SP.boats.dinghy) return;  // chars.js has not run yet
  _extraBoatsBuilt = true;
  const A = (typeof DETAIL === 'number') ? DETAIL : 1;
  const grow = fleetGrowth();
  for (const k in EXTRA_BOAT_DEFS) {
    if (SP.boats[k]) continue;
    const rec = EXTRA_BOAT_DEFS[k];
    // these ten were drawn to sit alongside the other twelve, so they grow
    // with them rather than being left as rowing boats among ships
    if (!rec.scaled) {
      rec.scaled = true;
      rec.def.len = Math.max(8, Math.round(rec.def.len * grow));
      rec.def.beam = Math.max(2, Math.round(rec.def.beam * grow));
    }
    let spr = null;
    try { if (typeof buildBoat === 'function') spr = buildBoat(rec.def); } catch (e) { spr = null; }
    if (!spr || !spr.c) {   // the builder is gone: fly another boat's colours
      SP.boats[k] = SP.boats[rec.fallback] || SP.boats.dinghy;
      SP.boatsHurt[k] = SP.boatsHurt[rec.fallback] || SP.boatsHurt.dinghy;
      continue;
    }
    const paint = EXTRA_BOAT_PAINT[k];
    if (paint) {
      try {
        const ctx = spr.c.getContext('2d');
        paint(ctx, A, 2 * A, rec.def.len * A, rec.def.beam * A, Math.round(spr.c.height / 2));
      } catch (e) { /* a mark failing is never worth losing the hull over */ }
    }
    SP.boats[k] = spr;
    SP.boatsHurt[k] = (typeof tintHi === 'function' && spr.hi) ? tintHi(spr, '#ffffff', 0.8) : tintSprite(spr, '#ffffff', 0.8);
  }
  tuneFleet();
}


class Enemy {
  constructor(type, x, y) {
    ensureExtraBoats();
    const c = this.cfg = ENEMY_TYPES[type]; this.type = type;
    const diff = (G.director && G.director.difficulty) || 1;
    this.diff = diff;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hp = Math.round(c.hp * (1 + (diff - 1) * 1.15)); this.maxHp = this.hp; this.radius = c.radius;
    this.hitLong = c.hitLong || c.radius; this.hitWide = c.hitWide || c.radius;
    this.angle = angleTo(x, y, G.player.x, G.player.y); this.speed = c.speed * (1 + (diff - 1) * 0.30); this.throttle = 1; this.rallied = 0;
    this.attackT = rand(0.5, c.attackCd || 2) / (0.6 + diff * 0.4); this.state = 'approach'; this.stateT = rand(0, 2); this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.dead = false; this.flash = 0; this.burn = 0; this.burnT = 0; this.kx = 0; this.ky = 0; this.ramCd = 0; this.bob = rand(0, TAU);
    this.wake = G.ocean.newWake(this, c.wake); this.sprite = SP.boats[type]; this.hurtSprite = SP.boatsHurt[type];
    this.zig = rand(0, TAU); this.burstLeft = 0; this.burstT = 0; this.strafeDir = 1;
    this.slowT = 0; this.age = 0; this.dmgT = 0; this.list = 0; this.scars = [];
    this.slot = rand(0, TAU); this.retreatT = 0;
    // state for the wider fleet: a per-type bag, plus the flags the shared
    // code above reads (a warded hull, a submerged one, a jammed one)
    this.sp = { t: 0, phase: 'idle', pt: 0, n: 0 };
    this.ov = null; this.submerged = false; this.warded = 0; this.vulnT = 0;
    this.charging = false; this.stunned = false; this.bleedT = 0; this.bleedDps = 0;
    this.mate = null; this.noMate = false; this.haulT = 0; this.haulsLeft = 1;
    this.ward = null; this.whirl = null; this.grindCd = 0; this.spMul = 1;
    this.initSpecial();
  }
  initSpecial() {
    const s = this.sp;
    switch (this.type) {
      case 'sub': s.phase = 'up'; s.pt = rand(2.4, 3.8); break;
      case 'minelayer': s.pt = 1.4; break;
      case 'courier': s.pt = rand(4.5, 6.5); break;
      case 'grappler': s.pt = rand(3, 4.5); break;
      case 'ironclad': s.pt = rand(3, 4.5); break;
      case 'dredger': s.pt = rand(3.5, 5); break;
      case 'tender': s.pt = 0.9; break;
    }
  }
  // Is a shot of radius `r` touching this boat? The circle, plus the hull
  // itself as an oriented ellipse -- so the long ends of a big hull are hit
  // where they are drawn instead of being shot through.
  hitTest(x, y, r) {
    r = r || 0;
    const dx = x - this.x, dy = y - this.y, rr = this.radius + r;
    if (dx * dx + dy * dy < rr * rr) return true;
    const ca = Math.cos(-this.angle), sa = Math.sin(-this.angle);
    const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;   // into her own frame
    const a = this.hitLong + r, b = this.hitWide + r;
    return (lx * lx) / (a * a) + (ly * ly) / (b * b) < 1;
  }
  targetPos() { if (G.buoy && !G.buoy.dead) return G.buoy; return G.player; }
  update(dt, t) {
    const c = this.cfg, p = this.targetPos(); this.age += dt;
    this.flash -= dt; this.ramCd -= dt; this.stateT += dt;
    if (this.burn > 0) { this.burn -= dt; this.burnT -= dt; if (this.burnT <= 0) { this.burnT = 0.5; this.hit(G.player.stats.burn * 0.5, 0, 0, null, true); G.particles.fire(this.x, this.y, 2); G.particles.smoke(this.x, this.y, 1); } }
    if (this.warded > 0) this.warded -= dt;
    if (this.vulnT > 0) this.vulnT -= dt;
    if (this.bleedT > 0) {
      this.bleedT -= dt;
      this.hit(this.bleedDps * dt, 0, 0, null, true);
      if (Math.random() < dt * 9) G.particles.blood(this.x + rand(-6, 6), this.y + rand(-6, 6), 0.2);
      if (this.dead) return;
    }
    const d = dist(this.x, this.y, p.x, p.y);
    // approach the slot this boat has claimed around the target, not the target
    // itself, so a wave arrives as a ring instead of a conga line
    // the ring the fleet forms around her has to be wide enough to hold the
    // hulls that are in it, or big boats simply pile into one another
    const spread = Math.min(70 + this.radius * 1.5, d * 0.55);
    const ax0 = p.x + Math.cos(this.slot) * spread, ay0 = p.y + Math.sin(this.slot) * spread;
    const toP = angleTo(this.x, this.y, ax0, ay0);
    const toPDirect = angleTo(this.x, this.y, p.x, p.y);
    let desired = toP, throttle = 1;
    // badly hurt boats peel off, circle, and come back in
    if (this.hp / this.maxHp < 0.28 && this.retreatT <= 0 && Math.random() < 0.004) this.retreatT = rand(1.4, 2.6);
    if (this.retreatT > 0) {
      this.retreatT -= dt;
      this.angle = angleLerp(this.angle, toPDirect + Math.PI + 0.5 * this.orbitDir, Math.min(1, c.turn * dt));
      this.vx = lerp(this.vx, Math.cos(this.angle) * this.speed, Math.min(1, dt * 2.5));
      this.vy = lerp(this.vy, Math.sin(this.angle) * this.speed, Math.min(1, dt * 2.5));
    }
    this.ov = null;
    this.updateSpecial(dt, d, toPDirect, p);
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
      // keeps the width of the bay between it and you and never closes
      case 'flee': {
        const r = c.orbit || 300;
        if (d < r) { desired = toPDirect + Math.PI + 0.35 * this.orbitDir; throttle = 1; }
        else { desired = toP + Math.PI / 2 * this.orbitDir; throttle = 0.55; }
        break;
      }
      // runs a lane across your front rather than at you, and keeps running
      case 'runner': {
        const r = c.orbit || 210;
        if (d < r - 40) desired = toPDirect + Math.PI + 0.9 * this.orbitDir;
        else if (d > r + 90) desired = toP;
        else desired = toP + Math.PI / 2 * this.orbitDir;
        if (this.stateT > 3.5 && Math.random() < 0.02) { this.orbitDir *= -1; this.stateT = 0; }
        throttle = 1;
        break;
      }
    }
    // a special takes the wheel: it still goes through the same steering and
    // the same rock avoidance underneath, so nothing can drive into a cliff
    if (this.ov) {
      if (this.ov.desired !== undefined) desired = this.ov.desired;
      if (this.ov.throttle !== undefined) throttle = this.ov.throttle;
    }
    // rock avoidance -- except for a hull that is deliberately charging, which
    // is the whole point of baiting one into a rock
    if (!this.charging) for (const r of G.rocks) {
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
    const sp = this.speed * throttle * this.spMul * (this.slowT > 0 ? 0.5 : 1) * (this.rallied > 0 ? 1.28 : 1);
    this.vx = lerp(this.vx, Math.cos(this.angle) * sp, Math.min(1, dt * 2.5)); this.vy = lerp(this.vy, Math.sin(this.angle) * sp, Math.min(1, dt * 2.5));
    const f = G.ocean.flow(this.x, this.y);
    this.x += (this.vx + this.kx + f.x * 0.4) * dt; this.y += (this.vy + this.ky + f.y * 0.4) * dt;
    this.kx *= Math.pow(0.02, dt); this.ky *= Math.pow(0.02, dt);
    this.x = clamp(this.x, 10, G.ocean.W - 10); this.y = clamp(this.y, WATER_TOP - 6, G.ocean.H - 10);
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
    if (c.attack) this.updateAttack(dt, d, toPDirect, p);
    // ramming / kamikaze against the real player only
    const pl = G.player;
    const dp = dist(this.x, this.y, pl.x, pl.y);
    // A hull that is twice the size it was must not ram twice as often. Her
    // collision circle grew because she IS bigger, but only her bow can run
    // anyone down: brushing along the side of a trawler is now a shove, not a
    // ramming. That keeps the bigger fleet no more dangerous than the small
    // one was, which is the way it has to stay.
    const bowOn = Math.abs(angleDiff(this.angle, angleTo(this.x, this.y, pl.x, pl.y))) < 1.15;
    if (!pl.dead && !pl.diving && !this.submerged && dp < this.radius * 0.72 + 12) {
      if (c.kamikaze) {
        this.die(true); G.particles.explode(this.x, this.y, 44);
        if (!pl.absorb.active) pl.damage(c.kamikaze * (1 + (this.diff - 1) * 0.8), this.x, this.y);
        else pl.absorbHit({ x: this.x, y: this.y, dmg: c.kamikaze, explode: 0, absorbable: true });
        return;
      }
      if (c.ram && bowOn && this.ramCd <= 0 && spd > 30 && !pl.rolling && !pl.absorb.active) { this.ramCd = 1.8; pl.damage(c.ram * (1 + (this.diff - 1) * 0.8), this.x, this.y); this.kx -= Math.cos(this.angle) * 80; this.ky -= Math.sin(this.angle) * 80; G.particles.splash((this.x + pl.x) / 2, (this.y + pl.y) / 2, 1.2); }
      else if (pl.rolling && !pl.stats.rollDmg) { const a = angleTo(pl.x, pl.y, this.x, this.y); this.kx += Math.cos(a) * 120; this.ky += Math.sin(a) * 120; }
    }
    // crew bail out and swim at you when their boat closes in
    if (typeof Hazards !== 'undefined' && Hazards.boardFrom && !this.boarded && !c.kamikaze && !pl.dead && !this.submerged
        && dp < 150 && this.age > 2 && Math.random() < 0.5 * dt * (this.cfg.big ? 1.6 : 1)) {
      this.boarded = true; Hazards.boardFrom(this);
    }
    // decoy buoy ram
    if (G.buoy && !G.buoy.dead && dist(this.x, this.y, G.buoy.x, G.buoy.y) < this.radius + 8 && this.ramCd <= 0) { this.ramCd = 0.8; G.buoy.hp -= 15; G.particles.splash(G.buoy.x, G.buoy.y, 0.8); }
    this.slowT -= dt;
    if (this.rallied > 0) this.rallied -= dt;
  }
  // ---- the wider fleet: what each of the new boats actually does ---------
  // Every branch here drives its own timer and, where it needs to steer,
  // writes this.ov rather than moving the hull itself, so all of them still
  // go through the shared steering, separation and rock avoidance above.
  // Every branch that can hurt the player has a visible wind-up phase first.
  updateSpecial(dt, d, toP, p) {
    const s = this.sp;
    switch (this.type) {

      // ---- Submersible: on the surface it fights, under it cannot be shot
      case 'sub': {
        s.t += dt;
        if (s.phase === 'up') {
          this.submerged = false;
          if (s.t > s.pt) {
            s.phase = 'dive'; s.t = 0;
            G.particles.bubbles(this.x, this.y, 10); G.particles.splash(this.x, this.y, 1.2); Audio_.splash(1.1);
          }
        } else if (s.phase === 'dive') {
          this.submerged = true;
          this.ov = { throttle: 0.6 };
          if (s.t > 0.5) { s.phase = 'under'; s.t = 0; s.pt = rand(2.0, 2.8); }
        } else if (s.phase === 'under') {
          this.submerged = true;
          this.ov = { desired: toP, throttle: 1.2 };
          if (Math.random() < 0.6) G.particles.bubbles(this.x + rand(-7, 7), this.y + rand(-7, 7), 1);
          if (s.t > s.pt) { s.phase = 'rise'; s.t = 0; }
        } else if (s.phase === 'rise') {
          // the tell: the water boils where it is about to come up
          this.submerged = true;
          this.ov = { throttle: 0.12 };
          if (Math.random() < 0.8) G.particles.bubbles(this.x + rand(-14, 14), this.y + rand(-14, 14), 2);
          if (s.t > 0.85) {
            s.phase = 'up'; s.t = 0; s.pt = rand(3.2, 4.4); this.submerged = false;
            G.particles.splash(this.x, this.y, 2.4); G.ocean.ripple(this.x, this.y, 74, 210, 0.85);
            if (G.ocean.disturb) G.ocean.disturb(this.x, this.y, 5, 0, 0);
            Toon.shock(this.x, this.y, 64, 0.4); Audio_.splash(1.6);
            const a = angleTo(this.x, this.y, p.x, p.y);
            for (let i = -1; i <= 1; i++) this.shoot('buckshot', a + i * 0.19, 260, 6, 1.1);
            Audio_.shot('shotgun');
          }
        }
        break;
      }

      // ---- Bulwark Barge: everything inside the ring shrugs off damage
      case 'bulwark': {
        let n = 0, c = 0, wx = 0, wy = 0;
        for (const e of G.enemies) {
          if (e === this || e.dead || !e.cfg) continue;
          const dd = dist(this.x, this.y, e.x, e.y);
          if (dd < 112) { e.warded = 0.2; n++; }
          if (dd < 340) { wx += e.x; wy += e.y; c++; }
        }
        s.n = n;
        if (c > 0) {
          wx /= c; wy /= c;
          // it parks itself on the line between the pack and the player
          this.ov = { desired: angleTo(this.x, this.y, lerp(wx, p.x, 0.34), lerp(wy, p.y, 0.34)) };
        }
        break;
      }

      // ---- Mine Runner: the danger is the water it has already crossed
      case 'minelayer': {
        s.t += dt;
        if (s.t > s.pt && G.projectiles.length < 240 && this.age > 1.2) {
          s.t = 0; s.pt = 1.5;
          const bx = this.x - Math.cos(this.angle) * (this.radius + 7), by = this.y - Math.sin(this.angle) * (this.radius + 7);
          G.projectiles.push(new Mine(bx, by, this.diff));
          G.particles.splash(bx, by, 0.7); Audio_.tone(170, 0.14, 'square', 0.07, -60);
        }
        break;
      }

      // ---- Stillwater Gunner: it only shoots a target that has stopped
      case 'stalker': {
        const pv = Math.hypot(p.vx || 0, p.vy || 0);
        const still = pv < 42;
        if (s.phase === 'idle' || s.phase === '') {
          if (still && d < 270) {
            s.t += dt;
            if (s.t > 0.45) { s.phase = 'aim'; s.t = 0; Toon.emote(this.x + 8, this.y - this.radius - 10, '!'); Audio_.tone(880, 0.12, 'square', 0.07); }
          } else s.t = Math.max(0, s.t - dt * 2);
        } else if (s.phase === 'aim') {
          s.t += dt;
          this.ov = { throttle: 0.25 };
          if (!still || d > 330) {
            s.phase = 'idle'; s.t = 0;
            G.particles.text(this.x, this.y - this.radius - 8, 'LOST IT', '#8ac6ff', 7);
          } else if (s.t > 1.0) {
            s.phase = 'cool'; s.t = 0;
            const a = angleTo(this.x, this.y, p.x, p.y);
            this.shoot('harpoon', a, 430, 16, 1.5); Audio_.shot('rifle'); G.shake(2);
          }
        } else { s.t += dt; if (s.t > 1.6) { s.phase = 'idle'; s.t = 0; } }
        break;
      }

      // ---- Trawl Pair: one warp, two boats, and a four second window
      case 'twin': {
        if (!this.mate && !this.noMate) {
          this.noMate = true;
          const a = this.angle + Math.PI / 2;
          const m = G.spawnEnemy('twin',
            clamp(this.x + Math.cos(a) * 44, 20, G.ocean.W - 20),
            clamp(this.y + Math.sin(a) * 44, WATER_TOP + 8, G.ocean.H - 20));
          if (m) { m.noMate = true; m.mate = this; this.mate = m; m.haulsLeft = 1; this.haulsLeft = 1; }
        }
        if (this.haulT > 0) {
          this.haulT -= dt;
          this.ov = { throttle: 0.5 };
          const bx = this.x - Math.cos(this.angle) * this.radius, by = this.y - Math.sin(this.angle) * this.radius;
          if (Math.random() < 0.5) G.particles.spray(bx, by, this.angle + Math.PI, 1, 40);
          if (this.haulT <= 0) {
            const m = G.spawnEnemy('twin', this.x - Math.cos(this.angle) * 36, this.y - Math.sin(this.angle) * 36);
            if (m) { m.noMate = true; m.mate = this; this.mate = m; m.haulsLeft = 0; m.hp = Math.round(m.maxHp * 0.55); }
            this.haulsLeft = 0;
            G.particles.text(this.x, this.y - this.radius - 12, 'HAULED UP!', '#ffd27a', 9);
            G.particles.splash(this.x, this.y, 1.6); Audio_.tone(250, 0.3, 'sawtooth', 0.14, 140);
          }
        }
        break;
      }

      // ---- Signal Runner: runs, and whistles the rest of the fleet in
      case 'courier': {
        s.t += dt;
        if (s.phase === 'idle' || s.phase === '') {
          if (s.t > s.pt && s.n < 3 && G.enemies.length < 15) {
            s.phase = 'call'; s.t = 0;
            Toon.emote(this.x + 8, this.y - this.radius - 10, '!');
            Audio_.tone(430, 0.5, 'sawtooth', 0.12, -130);
          }
        } else {
          this.ov = { throttle: 0.35 };
          if (s.t > 1.2) {
            s.phase = 'idle'; s.t = 0; s.pt = rand(7, 9); s.n++;
            G.particles.text(this.x, this.y - this.radius - 12, 'REINFORCE!', '#ff9a3c', 9);
            Toon.shock(this.x, this.y, 130, 0.6, '#ffd27a');
            G.ocean.ripple(this.x, this.y, 110, 240, 0.7); Audio_.rampage();
            const kinds = ['dinghy', 'jetski', 'netter'];
            for (let i = 0; i < 2; i++) {
              const a = rand(0, TAU), r = rand(210, 270);
              G.spawnEnemy(kinds[(Math.random() * kinds.length) | 0],
                clamp(this.x + Math.cos(a) * r, 20, G.ocean.W - 20),
                clamp(this.y + Math.sin(a) * r, WATER_TOP + 10, G.ocean.H - 20));
            }
          }
        }
        break;
      }

      // ---- Winch Boat: a second of spin-up, then it has hold of you
      case 'grappler': {
        s.t += dt;
        if (s.phase === 'idle' || s.phase === '') {
          if (s.t > s.pt && d < 230 && !G.player.tether && !G.player.dead) {
            s.phase = 'spin'; s.t = 0;
            Audio_.tone(280, 0.7, 'square', 0.08, 520);
            Toon.emote(this.x + 8, this.y - this.radius - 10, '!');
          }
        } else {
          this.ov = { throttle: 0.3 };
          if (Math.random() < 0.5) G.particles.sparks(this.x + Math.cos(this.angle) * this.radius, this.y + Math.sin(this.angle) * this.radius, 1, this.angle, 0.9);
          if (s.t > 1.0) {
            s.phase = 'idle'; s.t = 0; s.pt = rand(5.5, 7);
            const a = angleTo(this.x, this.y, p.x, p.y);
            G.projectiles.push(new Projectile({
              x: this.x + Math.cos(a) * this.radius, y: this.y + Math.sin(a) * this.radius,
              vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 1.6,
              dmg: 5 * (1 + (this.diff - 1) * 0.8), owner: 'enemy', sprite: SP.hookShot,
              size: 5, knock: 0, trail: true, grapple: this,
            }));
            Audio_.shot('harpoon'); this.recoilFx(a, 'flash');
          }
        }
        break;
      }

      // ---- Ironclad Ram: plated bow, and a charge you are meant to bait
      case 'ironclad': {
        s.t += dt;
        if (s.phase === 'idle' || s.phase === '') {
          this.charging = false;
          if (s.t > s.pt && d < 300 && Math.abs(angleDiff(this.angle, toP)) < 0.7) {
            s.phase = 'rev'; s.t = 0;
            Audio_.tone(110, 0.5, 'sawtooth', 0.16, 70); G.shake(1.5);
            Toon.puff(this.x - Math.cos(this.angle) * this.radius, this.y - Math.sin(this.angle) * this.radius, 4, '#e8eef5');
          }
        } else if (s.phase === 'rev') {
          this.ov = { throttle: 0.1 };
          if (Math.random() < 0.6) Toon.puff(this.x - Math.cos(this.angle) * this.radius, this.y - Math.sin(this.angle) * this.radius, 1, '#e8eef5');
          if (s.t > 0.9) {
            s.phase = 'charge'; s.t = 0; s.ca = this.angle; this.charging = true;
            G.shake(3); Audio_.roll();
            for (let i = 0; i < 4; i++) Toon.speed(this.x, this.y, this.angle, 2);
          }
        } else if (s.phase === 'charge') {
          this.ov = { desired: s.ca, throttle: 2.5 };
          this.charging = true;
          G.ocean.addFoam(this.x, this.y, 0.3);
          if (Math.random() < 0.5) G.particles.spray(this.x + Math.cos(this.angle) * this.radius, this.y + Math.sin(this.angle) * this.radius, this.angle, 2, 90);
          for (const r of G.rocks) if (dist(this.x, this.y, r.x, r.y) < r.r + this.radius + 2) {
            s.phase = 'stun'; s.t = 0; this.charging = false; this.stunned = true;
            const a = angleTo(r.x, r.y, this.x, this.y);
            this.x = r.x + Math.cos(a) * (r.r + this.radius); this.y = r.y + Math.sin(a) * (r.r + this.radius);
            this.kx += Math.cos(a) * 160; this.ky += Math.sin(a) * 160;
            this.hit(34, 0, 0, null); G.particles.explode(this.x, this.y, 30, { water: true });
            G.shake(9); Audio_.stun(); Toon.emote(this.x + 8, this.y - this.radius - 10, 'star');
            G.particles.text(this.x, this.y - this.radius - 12, 'WRECKED!', '#ffe48f', 9);
            break;
          }
          if (this.dead) return;
          if (s.t > 1.3) { s.phase = 'cool'; s.t = 0; this.charging = false; }
        } else if (s.phase === 'stun') {
          this.ov = { throttle: 0 }; this.charging = false; this.stunned = true;
          if (Math.random() < 0.4) G.particles.smoke(this.x + rand(-8, 8), this.y + rand(-6, 6), 1, 'rgba(40,40,48,', 4);
          if (s.t > 2.2) { s.phase = 'cool'; s.t = 0; this.stunned = false; }
        } else {
          this.charging = false; this.stunned = false;
          if (s.t > 1.8) { s.phase = 'idle'; s.t = 0; s.pt = rand(3.5, 5); }
        }
        break;
      }

      // ---- Repair Tender: nothing you shoot stays shot
      case 'tender': {
        s.t += dt;
        let best = null, bk = 0.96;
        for (const e of G.enemies) {
          if (e === this || e.dead || !e.cfg) continue;
          const k = e.hp / e.maxHp;
          if (k < bk && dist(this.x, this.y, e.x, e.y) < 240) { bk = k; best = e; }
        }
        this.ward = best;
        if (best) {
          const dd = dist(this.x, this.y, best.x, best.y);
          this.ov = { desired: angleTo(this.x, this.y, best.x, best.y), throttle: dd < 70 ? 0.35 : 1 };
          if (s.t > 0.9 && dd < 130) {
            s.t = 0;
            const heal = 12 * (1 + (this.diff - 1) * 0.5);
            best.hp = Math.min(best.maxHp, best.hp + heal);
            G.particles.sparks((this.x + best.x) / 2, (this.y + best.y) / 2, 4);
            G.particles.text(best.x, best.y - best.radius - 6, '+' + Math.round(heal), '#6fd88e', 7);
            Audio_.tone(640, 0.1, 'triangle', 0.06, 200);
          }
        }
        break;
      }

      // ---- Dredge Barge: it pulls the whole bay in, then jams wide open
      case 'dredger': {
        s.t += dt; this.grindCd -= dt;
        const mouth = { x: this.x + Math.cos(this.angle) * this.radius, y: this.y + Math.sin(this.angle) * this.radius };
        if (s.phase === 'idle' || s.phase === '') {
          if (s.t > s.pt && d < 230) {
            s.phase = 'open'; s.t = 0;
            Audio_.tone(85, 0.7, 'sawtooth', 0.16, 40);
            G.particles.bubbles(mouth.x, mouth.y, 10);
          }
        } else if (s.phase === 'open') {
          this.ov = { throttle: 0.25 };
          if (Math.random() < 0.7) G.particles.bubbles(mouth.x + rand(-8, 8), mouth.y + rand(-8, 8), 1);
          if (s.t > 0.85) {
            s.phase = 'suck'; s.t = 0;
            this.whirl = { x: this.x, y: this.y, r: 150, s: 40, type: 'whirl', life: 2.6 };
            G.ocean.currents.push(this.whirl);
            Audio_.noise(2.2, 0.16, 700, 80);
          }
        } else if (s.phase === 'suck') {
          this.ov = { throttle: 0.35 };
          if (this.whirl) { this.whirl.x = this.x; this.whirl.y = this.y; this.whirl.life = Math.max(0.05, 2.6 - s.t); }
          const pl = G.player;
          if (!pl.dead && !pl.rolling && !pl.diving) {
            const dd = dist(this.x, this.y, pl.x, pl.y);
            if (dd < 175 && dd > 1) {
              const a = angleTo(pl.x, pl.y, this.x, this.y), f = (1 - dd / 175) * 240;
              pl.vx += Math.cos(a) * f * dt; pl.vy += Math.sin(a) * f * dt;
              if (Math.random() < 0.3) G.particles.spray(pl.x, pl.y, a, 1, 60);
            }
            if (dd < this.radius + 15 && this.grindCd <= 0) {
              this.grindCd = 0.9;
              pl.damage(11 * (1 + (this.diff - 1) * 0.8), this.x, this.y);
              const a2 = angleTo(this.x, this.y, pl.x, pl.y);
              pl.vx += Math.cos(a2) * 280; pl.vy += Math.sin(a2) * 280;
              G.particles.blood(pl.x, pl.y, 1.1); G.shake(6);
            }
          }
          for (const pk of G.pickups) {
            const dd = dist(this.x, this.y, pk.x, pk.y);
            if (dd < 150 && dd > 1 && !pk.magnetized) { const a = angleTo(pk.x, pk.y, this.x, this.y); pk.vx += Math.cos(a) * 110 * dt; pk.vy += Math.sin(a) * 110 * dt; }
          }
          if (s.t > 2.6) {
            s.phase = 'jam'; s.t = 0; this.vulnT = 3.2; this.clearWhirl();
            G.particles.smoke(this.x, this.y, 8, 'rgba(40,36,30,', 6);
            G.particles.text(this.x, this.y - this.radius - 12, 'JAMMED!', '#ffe48f', 10);
            Audio_.tone(70, 0.6, 'square', 0.16, -40); Toon.emote(this.x + 10, this.y - this.radius - 12, 'star');
          }
        } else {
          this.ov = { throttle: 0.2 };
          if (Math.random() < 0.3) G.particles.smoke(this.x + rand(-10, 10), this.y + rand(-8, 8), 1, 'rgba(46,42,36,', 5);
          if (s.t > 3.2) { s.phase = 'idle'; s.t = 0; s.pt = rand(3.5, 5); }
        }
        break;
      }
    }
  }
  clearWhirl() {
    if (!this.whirl) return;
    const i = G.ocean.currents.indexOf(this.whirl);
    if (i >= 0) G.ocean.currents.splice(i, 1);
    this.whirl = null;
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
        G.projectiles.push(new Projectile({ x: this.x, y: this.y, vx: Math.cos(a) * dd / flight, vy: Math.sin(a) * dd / flight, life: flight, dmg: 22 * (1 + (this.diff - 1) * 0.8), owner: 'enemy', sprite: SP.dynamite, size: 4, explode: 46, arc: true, vz: 150 * flight, knock: 0, absorbable: true }));
        Audio_.tone(300, 0.2, 'sine', 0.15, 200);
      } break;
      case 'buckshot': if (!inRange) return; this.attackT = c.attackCd; for (let i = -2; i <= 2; i++) this.shoot('buckshot', toP + i * 0.14 + rand(-0.03, 0.03), 300, 6, 0.8); Audio_.shot('shotgun'); this.recoilFx(toP, 'flash'); break;
      case 'turret': if (!inRange) return; this.attackT = c.attackCd; this.burstLeft = 4; this.burstT = 0; Audio_.shot('rifle'); this.recoilFx(toP, 'flash'); break;
      // a line of baited hooks paid out across your path: slow, obvious, and
      // they hang in the water long after the boat has moved on
      case 'hooks': if (!inRange) return; this.attackT = c.attackCd; {
        const spread = 0.5;
        for (let i = -2; i <= 2; i++) {
          const a = toP + i * (spread / 2);
          G.projectiles.push(new Projectile({
            x: this.x + Math.cos(a) * this.radius, y: this.y + Math.sin(a) * this.radius,
            vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 3.2, dmg: 7 * (1 + (this.diff - 1) * 0.8),
            owner: 'enemy', sprite: SP.hookShot, size: 4, trail: false, knock: 0, slow: 1.2, drag: 0.55,
          }));
        }
        Audio_.tone(220, 0.16, 'triangle', 0.12, 180); this.recoilFx(toP, 'flash');
      } break;
      // a crab pot lobbed ahead of you; it sinks, sits for a beat, then bursts
      case 'pot': if (!inRange) return; this.attackT = c.attackCd; {
        const tx = p.x + (p.vx || 0) * 0.7, ty = p.y + (p.vy || 0) * 0.7;
        const dd = dist(this.x, this.y, tx, ty), flight = clamp(dd / 200, 0.7, 1.8), a = angleTo(this.x, this.y, tx, ty);
        G.projectiles.push(new Projectile({
          x: this.x, y: this.y, vx: Math.cos(a) * dd / flight, vy: Math.sin(a) * dd / flight,
          life: flight, dmg: 14 * (1 + (this.diff - 1) * 0.8), owner: 'enemy', sprite: SP.potShot,
          size: 5, explode: 40, arc: true, vz: 140 * flight, knock: 0, absorbable: true,
        }));
        Audio_.tone(260, 0.2, 'square', 0.1, 170);
      } break;
      // no damage at all: it paints you for the rest of the fleet
      case 'flare': if (!inRange) return; this.attackT = c.attackCd; {
        const a = angleTo(this.x, this.y, p.x, p.y);
        G.projectiles.push(new Projectile({
          x: this.x, y: this.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 2.4, dmg: 0,
          owner: 'enemy', sprite: SP.flareShot, size: 4, trail: true, knock: 0, absorbable: true, harmless: true,
        }));
        for (const e of G.enemies) if (!e.dead && e !== this && dist(this.x, this.y, e.x, e.y) < 260) e.rallied = 3.5;
        G.particles.text(this.x, this.y - 18, 'SPOTTED!', '#ffd27a', 8);
        Audio_.tone(700, 0.3, 'sawtooth', 0.12, 1100);
      } break;
    }
  }
  shoot(kind, a, speed, dmg, life) {
    dmg *= (1 + (this.diff - 1) * 0.8);
    // enemy fire is deliberately slow: every shot is meant to be readable,
    // dodgeable and parryable rather than a hitscan surprise
    speed *= 0.72; life /= 0.72;
    const spr = kind === 'harpoon' ? SP.enemyHarpoon : kind === 'buckshot' ? SP.buckshotBig : SP.enemyBullet;
    G.projectiles.push(new Projectile({ x: this.x + Math.cos(a) * this.radius, y: this.y + Math.sin(a) * this.radius, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, dmg, owner: 'enemy', sprite: spr, size: kind === 'harpoon' ? 4 : 3, trail: true, knock: 0 }));
    if (kind !== 'buckshot') this.recoilFx(a, 'flash');
  }
  recoilFx(a, kind) { if (kind === 'flash') G.particles.sparks(this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius, 3, a, 0.6); this.kx -= Math.cos(a) * 30; this.ky -= Math.sin(a) * 30; }
  hit(dmg, kx, ky, proj, silent = false) {
    if (this.dead) return;
    // ---- the wider fleet's defences. Each one is legible on the water: a
    // hull under the surface, a ring of cover, a plated bow, a jammed dredge.
    if (this.submerged && proj) {
      // it is under the shooting. The manatee still reaches it -- melee, roll
      // and the tidal slam all come through with no projectile attached.
      if (!silent) { G.particles.bubbles(this.x, this.y, 2); Toon.impact(this.x, this.y, 0.5, '#8ac6ff'); }
      return;
    }
    if (this.warded > 0) {
      dmg *= 0.4;
      if (!silent) { G.particles.sparks(this.x, this.y, 3, 0, TAU); Toon.impact(this.x, this.y, 0.6, '#a3b0c0'); }
    }
    if (this.type === 'ironclad' && (kx || ky)) {
      // the bow is plated and the rest of her is not
      const rel = Math.abs(angleDiff(this.angle, Math.atan2(ky, kx)));
      if (rel > 2.0) {
        dmg *= 0.15;
        if (!silent) {
          G.particles.sparks(this.x + Math.cos(this.angle) * this.radius, this.y + Math.sin(this.angle) * this.radius, 5, this.angle, 1.2);
          if (Math.random() < 0.25) G.particles.text(this.x, this.y - this.radius - 6, 'CLANG', '#cdd8e6', 7);
        }
      } else if (rel < 1.1) dmg *= 1.4;
    }
    if (this.vulnT > 0 || this.stunned) dmg *= 1.6;
    this.hp -= dmg; this.flash = 0.08; this.kx += kx / (this.cfg.big ? 3 : 1); this.ky += ky / (this.cfg.big ? 3 : 1);
    // remember what the blow was and which way it was going: if this is the
    // one that kills her it decides how she comes apart
    if (kx || ky || proj) {
      this.lastHit = {
        a: (kx || ky) ? Math.atan2(ky, kx) : (proj ? Math.atan2(proj.vy, proj.vx) : this.angle),
        blast: !!(proj && proj.explode), under: !!(proj && proj.under),
        power: clamp(0.65 + dmg / 55, 0.6, 2.3),
      };
    }
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
    // loose ends the wider fleet leaves behind it
    if (this.whirl) this.clearWhirl();
    if (G.player && G.player.tether && G.player.tether.e === this) G.player.freeTether('THE LINE GOES SLACK');
    if (this.type === 'twin' && this.mate && !this.mate.dead && this.mate.haulsLeft > 0 && this.mate.haulT <= 0) {
      this.mate.haulT = 4.0;
      G.particles.text(this.mate.x, this.mate.y - this.mate.radius - 12, 'HAULING!', '#ff9a3c', 9);
      Audio_.tone(180, 0.3, 'sawtooth', 0.12, 90);
    }
    const c = this.cfg, r = this.radius;
    if (!silentBoom) {
      Toon.burst(this.x, this.y, 1 + r / 22); Toon.shock(this.x, this.y, r * 3.4, 0.5);
      // splinters off the break -- a handful now, because the hull itself is
      // coming apart into pieces you can see and the smoke used to bury them
      G.particles.debris(this.x, this.y, Math.round(r * 0.7), ['#b57d3f', '#8f5c2c', '#5c3a1c', '#d6a05e']);
      for (let i = 0; i < 3; i++) Toon.puff(this.x + rand(-r, r), this.y + rand(-r, r), 2, '#d8e4ee');
    }
    // the bang is smaller than it was and the BREAKUP is the spectacle: a
    // fireball the size of the old one hid the wreckage for a second and a
    // half, which is exactly the second and a half worth watching
    if (!silentBoom) G.particles.explode(this.x, this.y, 11 + r * 0.85, { debris: Math.round(r * 0.5), oil: 0.6 + r / 15, debrisColors: this.type === 'gunboat' || this.type === 'harpooner' ? ['#7d858f', '#4a515a', '#aeb6c1'] : undefined });
    G.particles.blood(this.x, this.y, 0.8 + r / 22);
    // the crew goes with the boat
    if (typeof Gore !== 'undefined') { Gore.burst(this.x, this.y, 1.1 + r / 14, rand(0, TAU)); if (r > 18) Gore.burst(this.x + rand(-r, r) * 0.5, this.y + rand(-r, r) * 0.5, 0.8, rand(0, TAU)); }
    G.shake(Math.min(14, 4 + r / 3));
    // ---- and she comes apart. What killed her decides how.
    const lh = this.lastHit;
    const drops = c.drops || {};
    const wreck = new Wreck(this.sprite, this.x, this.y, this.angle, r, {
      rel: lh ? angleDiff(this.angle, lh.a) : undefined,
      blast: !!(lh && lh.blast) || this.type === 'dynaboat',
      under: !!(lh && lh.under) || !!(silentBoom && c.kamikaze),
      power: (lh ? lh.power : 1) * (silentBoom ? 1.5 : 1),
      vx: this.vx, vy: this.vy,
      // what she had aboard, read off the boat rather than off a list of
      // names, so a new type in ENEMY_TYPES inherits all of it for free
      fuel: (drops.fuel || 0) >= 2 || (drops.powder || 0) >= 3,
      cargo: (drops.wood || 0) >= 3 || !!c.big,
      // a derrick is a working boat's gear: she has to be long enough to
      // have somewhere to step one, whatever the fleet has been rescaled to
      mast: (c.hitLong || r) >= ((ENEMY_TYPES.trawler && ENEMY_TYPES.trawler.hitLong) || 26) * 0.75,
      crew: !!c.big && (!G.director || G.director.waveIdx >= 3),
    });
    // the blast that killed her throws whatever was already floating nearby
    // (before she joins the list, or she would be thrown by her own death)
    if (!silentBoom) Wreck.shove(this.x, this.y, r * 3, 0.7);
    G.wrecks.push(wreck);
    // and nothing may pile up forever: the oldest breakup goes under first
    while (G.wrecks.length > BREAK.maxWrecks) G.wrecks.shift();
    if (this.type === 'dynaboat') { // chain reaction
      G.particles.explode(this.x, this.y, 70, { water: true });
      Wreck.shove(this.x, this.y, 90, 1.3);
      for (const e of G.enemies) if (!e.dead && e !== this && dist(this.x, this.y, e.x, e.y) < 70 + e.radius) e.hit(40, 0, 0, null);
      if (dist(this.x, this.y, G.player.x, G.player.y) < 70) G.player.damage(18, this.x, this.y);
    }
    // scrap drops
    const mult = G.player.stats.scrapMult;
    for (const k in c.drops) { let n = Math.round(c.drops[k] * mult * rand(0.8, 1.3)); if (Math.random() < (c.drops[k] * mult) % 1) n++; for (let i = 0; i < n; i++) G.pickups.push(new Pickup(this.x, this.y, k)); }
    // kit: a boat fixer when she is hurt, otherwise plating or fuel. Big boats
    // are far more likely to be carrying something useful.
    const p = G.player, hurt = p.hp < p.stats.maxHp * 0.6;
    const chance = (c.big ? 0.34 : 0.09) * (hurt ? 1.9 : 1);
    if (Math.random() < chance) {
      const kind = hurt && Math.random() < 0.72 ? 'repair'
        : ITEM_TYPES[(Math.random() * ITEM_TYPES.length) | 0];
      G.pickups.push(new Pickup(this.x, this.y, kind));
    }
    G.stats.kills++; G.onEnemyKilled(this);
  }
  // ---- the tells ---------------------------------------------------------
  // Nothing in the wider fleet hurts the player without first putting a hard
  // pixel shape on the water saying so. All of it is dots, blocks and
  // chevrons on integer coordinates -- no strokes, no alpha ramps.
  renderTell(ctx, cam, t, sx, sy) {
    const s = this.sp;
    // a tell is only a tell if it survives the foam, so every mark is a
    // bright block over a dark one -- the same trick the sprites use
    const mark = (x, y, col, sz) => {
      const z = sz || 1;
      ctx.fillStyle = '#0c1018'; ctx.fillRect(x - (z >> 1), y - (z >> 1) + 1, z, z);
      ctx.fillStyle = col; ctx.fillRect(x - (z >> 1), y - (z >> 1), z, z);
    };
    const dots = (x0, y0, x1, y1, col, step, ph, sz) => {
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / (step || 5)));
      for (let i = 0; i <= n; i++) {
        const u = (i + (ph || 0)) / n; if (u < 0 || u > 1) continue;
        mark(Math.round(x0 + (x1 - x0) * u), Math.round(y0 + (y1 - y0) * u), col, sz || 2);
      }
    };
    const ring = (r, col, n, ph, sz) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + (ph || 0);
        mark(sx + Math.round(Math.cos(a) * r), sy + Math.round(Math.sin(a) * r * 0.8), col, sz || 1);
      }
    };
    switch (this.type) {
      case 'sub':
        if (s.phase === 'rise') {
          // a ring closing on the spot it is about to come up through
          const k = clamp(s.t / 0.85, 0, 1);
          const r = Math.round(34 - k * 22);
          ring(r, ((t * 12) | 0) % 2 ? '#ffffff' : '#8fd4ff', 18, t * 2, 3);
          ring(r + 7, '#cfe9ff', 12, -t * 2, 2);
          // and the white water right over the hatch
          for (let i = 0; i < 5; i++) mark(sx + ((i * 7 + ((t * 30) | 0)) % 13) - 6, sy + ((i * 5 + ((t * 21) | 0)) % 11) - 5, '#f4fbff', 2);
        } else if (s.phase === 'under' || s.phase === 'dive') {
          ring(9 + ((t * 3) % 2), 'rgba(160,210,240,0.55)', 6, t, 1);
        }
        break;
      case 'bulwark': {
        // the ring of cover, and a tick over everything standing in it
        const R = 112, on = ((t * 4) | 0) % 2;
        ring(R, on ? '#a3b0c0' : '#6f7b8b', 44, t * 0.5, 1);
        ring(R - 3, '#39414c', 44, t * 0.5 + 0.06, 1);
        for (const e of G.enemies) {
          if (e === this || e.dead || !(e.warded > 0)) continue;
          const ex = Math.round(e.x - cam.x), ey = Math.round(e.y - cam.y - e.radius - 12);
          ctx.fillStyle = '#14141c'; ctx.fillRect(ex - 3, ey - 1, 7, 6);
          ctx.fillStyle = '#b9c6d6'; ctx.fillRect(ex - 2, ey, 5, 3);
          ctx.fillStyle = '#e6eef8'; ctx.fillRect(ex - 2, ey, 5, 1);
          ctx.fillStyle = '#6f7b8b'; ctx.fillRect(ex - 1, ey + 3, 3, 1);
        }
        break;
      }
      case 'stalker':
        if (s.phase === 'aim') {
          const p = G.player, k = clamp(s.t / 1.0, 0, 1);
          const px0 = Math.round(p.x - cam.x), py0 = Math.round(p.y - cam.y);
          dots(sx, sy, px0, py0, k > 0.7 ? '#ff6161' : '#ffd27a', 5, (t * 3) % 1);
          // brackets closing on her while she stays still
          const g = Math.round(32 - k * 10);
          ctx.fillStyle = k > 0.7 && ((t * 14) | 0) % 2 ? '#ffffff' : '#ff6161';
          for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            ctx.fillRect(px0 + ox * g - (ox < 0 ? 0 : 4), py0 + oy * g - (oy < 0 ? 0 : 1), 5, 1);
            ctx.fillRect(px0 + ox * g - (ox < 0 ? 0 : 1), py0 + oy * g - (oy < 0 ? 0 : 4), 1, 5);
          }
        }
        break;
      case 'twin': {
        const m = this.mate;
        if (m && !m.dead) {
          const mx = Math.round(m.x - cam.x), my = Math.round(m.y - cam.y);
          if (Math.hypot(mx - sx, my - sy) < 320) dots(sx, sy, mx, my, '#c9b98e', 6, (t * 0.7) % 1);
        }
        if (this.haulT > 0) {
          // the warp coming in, with the seconds left on it
          const n = Math.ceil(this.haulT);
          ctx.fillStyle = ((t * 8) | 0) % 2 ? '#ff9a3c' : '#ffd27a';
          for (let i = 0; i < n; i++) ctx.fillRect(sx - 6 + i * 4, sy - this.radius - 16, 3, 3);
          ring(Math.round(12 + (4 - this.haulT) * 5), '#ff9a3c', 12, -t * 3, 1);
        }
        break;
      }
      case 'courier':
        if (s.phase === 'call') {
          const k = clamp(s.t / 1.2, 0, 1);
          for (let w = 0; w < 3; w++) {
            const r = Math.round(((k + w * 0.33) % 1) * 70) + 10;
            ring(r, w === 0 ? '#ffe48f' : '#ffd27a', 20, 0, 3);
          }
          ctx.fillStyle = ((t * 12) | 0) % 2 ? '#ffe48f' : '#ff9a3c';
          ctx.fillRect(sx - 1, sy - this.radius - 16, 3, 7);
        }
        break;
      case 'grappler': {
        if (s.phase === 'spin') {
          const k = clamp(s.t / 1.0, 0, 1);
          // the drum coming up to speed, the line it is about to throw, and a
          // hoop closing on her so there is no doubt who it is aiming at
          ring(Math.round(13 + k * 5), '#ffd27a', 4, t * 16, 3);
          const p = G.player;
          const px0 = Math.round(p.x - cam.x), py0 = Math.round(p.y - cam.y);
          dots(sx, sy, px0, py0, k > 0.6 ? '#ff6161' : '#ffd27a', 6, (t * 4) % 1, 2);
          const hr = Math.round(36 - k * 12);
          for (let i = 0; i < 10; i++) {
            const a = i / 10 * TAU + t * 3;
            mark(px0 + Math.round(Math.cos(a) * hr), py0 + Math.round(Math.sin(a) * hr * 0.8), k > 0.6 && ((t * 14) | 0) % 2 ? '#ffffff' : '#ff9a3c', 2);
          }
        }
        const te = G.player.tether;
        if (te && te.e === this) {
          // the cable itself: hard links, dragging her in
          const p = G.player, px0 = Math.round(p.x - cam.x), py0 = Math.round(p.y - cam.y);
          const L = Math.hypot(px0 - sx, py0 - sy), n = Math.max(2, Math.round(L / 5));
          for (let i = 0; i <= n; i++) {
            const u = i / n;
            const wob = Math.sin(u * 9 + t * 22) * 2 * (1 - Math.abs(u - 0.5) * 2);
            const nx = -(py0 - sy) / (L || 1), ny = (px0 - sx) / (L || 1);
            ctx.fillStyle = (i & 1) ? '#d6a05e' : '#8a5c2c';
            ctx.fillRect(Math.round(sx + (px0 - sx) * u + nx * wob), Math.round(sy + (py0 - sy) * u + ny * wob), 2, 2);
          }
        }
        break;
      }
      case 'ironclad':
        if (s.phase === 'rev') {
          const k = clamp(s.t / 0.9, 0, 1);
          // the lane it is about to come down
          const ex = sx + Math.cos(this.angle) * 200, ey = sy + Math.sin(this.angle) * 200 * 0.85;
          dots(sx, sy, ex, ey, k > 0.6 ? '#ff6161' : '#ffd27a', 8, (t * 5) % 1);
          // and the plate lighting up
          ctx.fillStyle = ((t * 16) | 0) % 2 ? '#ffffff' : '#cdd8e6';
          for (let i = -2; i <= 2; i++) {
            ctx.fillRect(sx + Math.round(Math.cos(this.angle) * (this.radius + 2) - Math.sin(this.angle) * i * 3),
              sy + Math.round(Math.sin(this.angle) * (this.radius + 2) + Math.cos(this.angle) * i * 3), 2, 2);
          }
        } else if (s.phase === 'charge') {
          for (let i = 1; i <= 3; i++) {
            ctx.fillStyle = i === 1 ? '#ffffff' : '#8fd4ff';
            const r = this.radius + 4 + i * 4;
            ctx.fillRect(sx + Math.round(Math.cos(this.angle) * r), sy + Math.round(Math.sin(this.angle) * r * 0.85), 2, 2);
          }
        } else if (s.phase === 'stun') {
          ctx.fillStyle = ((t * 8) | 0) % 2 ? '#ffe48f' : '#ffd27a';
          for (let i = 0; i < 3; i++) {
            const a = t * 5 + i / 3 * TAU;
            ctx.fillRect(sx + Math.round(Math.cos(a) * 11), sy - this.radius - 8 + Math.round(Math.sin(a) * 4), 2, 2);
          }
        }
        break;
      case 'tender': {
        const w = this.ward;
        if (w && !w.dead && dist(this.x, this.y, w.x, w.y) < 130) {
          dots(sx, sy, Math.round(w.x - cam.x), Math.round(w.y - cam.y), ((t * 10) | 0) % 2 ? '#6fd88e' : '#2f7a4a', 4, (t * 6) % 1);
        }
        break;
      }
      case 'dredger': {
        const ax = Math.cos(this.angle), ay = Math.sin(this.angle);
        if (s.phase === 'open') {
          const k = clamp(s.t / 0.85, 0, 1);
          // the mouth opening: two jaws swinging apart
          for (let i = 0; i < 7; i++) {
            const o = (i - 3) * 3 * (0.4 + k);
            ctx.fillStyle = ((t * 12) | 0) % 2 ? '#ffe48f' : '#c08054';
            ctx.fillRect(sx + Math.round(ax * (this.radius + 3) - ay * o), sy + Math.round(ay * (this.radius + 3) + ax * o), 2, 2);
          }
        } else if (s.phase === 'suck') {
          // arrowheads running inward all round it, and a hard red line at the
          // radius where the grinder starts taking pieces out of her
          for (let i = 0; i < 12; i++) {
            const a = i / 12 * TAU;
            const r = 160 - ((t * 150 + i * 13) % 160);
            const col = r < 70 ? '#f4fbff' : '#8fd4ff';
            const bx = sx + Math.round(Math.cos(a) * r), by = sy + Math.round(Math.sin(a) * r * 0.8);
            mark(bx, by, col, 3);
            mark(bx + Math.round(Math.cos(a + 2.4) * 4), by + Math.round(Math.sin(a + 2.4) * 4 * 0.8), col, 2);
            mark(bx + Math.round(Math.cos(a - 2.4) * 4), by + Math.round(Math.sin(a - 2.4) * 4 * 0.8), col, 2);
          }
          ring(this.radius + 16, ((t * 14) | 0) % 2 ? '#ff6161' : '#ffe48f', 20, t, 2);
        } else if (s.phase === 'jam') {
          ctx.fillStyle = ((t * 6) | 0) % 2 ? '#ffe48f' : '#ff9a3c';
          ctx.fillRect(sx - 8, sy - this.radius - 14, 16, 2);
        }
        break;
      }
    }
  }

  render(ctx, cam, t) {
    const sx = this.x - cam.x, sy = this.y - cam.y; if (sx < -60 || sy < -60 || sx > 700 || sy > 420) return;
    const bob = Math.sin(t * 3 + this.bob) * 1;
    const spr = this.flash > 0 ? this.hurtSprite : this.sprite;
    // heel into turns, and list further as the hull fills with water
    ctx.save();
    if (this.submerged) ctx.globalAlpha = 0.34;      // down under the surface
    // same grid as the player: whole world units would step the bob
    ctx.translate(Math.round(sx * DETAIL) / DETAIL, Math.round((sy + bob) * DETAIL) / DETAIL);
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
    this.renderTell(ctx, cam, t, Math.round(sx), Math.round(sy + bob));
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
