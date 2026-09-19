// ---- Game: state machine, world, render ---------------------------------
const WORLD_W = 3200, WORLD_H = 2400, SHORE_Y = 300;
const RIG_SCALE = 0.64;   // the rig is drawn large for detail, scaled to play size

class Game {
  constructor() {
    this.display = document.getElementById('screen'); this.dctx = this.display.getContext('2d');
    this.g = document.createElement('canvas'); this.g.width = 640; this.g.height = 360;
    this.ctx = this.g.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    Input.init(this.display);
    if (typeof MobileUI !== 'undefined') MobileUI.init(this.display);
    window.addEventListener('resize', () => this.resize()); this.resize();
    buildCharacters();
    this.tree = new SkillTree();
    this.state = 'intro'; Intro.reset();
    this.firstRun = true; this.muted = false;
    this.t = 0; this.last = performance.now(); this.fps = 60;
    this.newRun();
    requestAnimationFrame(ts => this.frame(ts));
  }
  resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    let scale = Math.min(ww / 640, wh / 360);
    if (scale > 1) scale = Math.max(1, Math.floor(scale * 2) / 2);
    this.display.style.width = Math.floor(640 * scale) + 'px'; this.display.style.height = Math.floor(360 * scale) + 'px';
  }
  newRun() {
    G = this;
    this.ocean = new Ocean(WORLD_W, WORLD_H, SHORE_Y);
    this.particles = new Particles(this.ocean);
    this.enemies = []; this.projectiles = []; this.pickups = []; this.wrecks = []; this.rocks = [];
    this.boss = null; this.buoy = null; this.holdFire = false;
    this.stats = { kills: 0, shots: 0, absorbs: 0, damageDealt: 0, damageTaken: 0, scrapCollected: 0, bossCrashes: 0 };
    this.cam = { x: 0, y: 0 }; this.shakeAmt = 0; this.time = 0; this.endT = 0;
    this.pier = { x: WORLD_W / 2, y0: SHORE_Y - 24, y1: SHORE_Y + 130, w: 44 };
    // rocks
    const rng = new SeededRandom(4242 + (this.firstRun ? 0 : Math.floor(Math.random() * 1000)));
    let tries = 0;
    while (this.rocks.length < 34 && tries++ < 600) {
      const r = rng.range(16, 40), x = rng.range(80, WORLD_W - 80), y = rng.range(SHORE_Y + 160, WORLD_H - 80);
      if (dist(x, y, this.pier.x, SHORE_Y + 230) < 200) continue;
      if (this.rocks.some(o => dist(o.x, o.y, x, y) < o.r + r + 110)) continue;
      this.rocks.push(new Rock(x, y, r, rng.int(1, 99999)));
    }
    if (typeof Village !== 'undefined') Village.build(this.pier.x, SHORE_Y, WORLD_W);
    this.player = new Player(this.pier.x, SHORE_Y + 230, this.tree);
    this.director = new Director();
    this.fisherman = this.firstRun ? new Fisherman(this.pier.x, this.pier.y1 - 6) : null;
    this.cam.x = this.player.x - 320; this.cam.y = this.player.y - 200;
    UI.banner = null;
    if (!this.firstRun) { this.director.started = true; this.banner('REMATCH', '#ffe48f', 2, 'The village heard you were coming.'); }
  }
  // ---------------------------------------------------------- helpers
  spawnEnemy(type, x, y) { const e = new Enemy(type, x, y); this.enemies.push(e); this.particles.splash(x, y, 0.6); return e; }
  spawnBoss() {
    const p = this.player; let a = rand(0, TAU), x, y;
    for (let i = 0; i < 20; i++) { x = p.x + Math.cos(a) * 420; y = p.y + Math.sin(a) * 420; if (x > 60 && x < WORLD_W - 60 && y > SHORE_Y + 60 && y < WORLD_H - 60) break; a += 0.7; }
    this.boss = new Boss(clamp(x, 60, WORLD_W - 60), clamp(y, SHORE_Y + 60, WORLD_H - 60));
    Audio_.roar(); this.shake(10);
    for (let i = 0; i < 6; i++) this.particles.splash(this.boss.x + rand(-40, 40), this.boss.y + rand(-20, 20), 2);
  }
  nearestEnemy(x, y, range, exclude = null, includeBoss = false) {
    let best = null, bd = range * range;
    for (const e of this.enemies) { if (e.dead || e === exclude) continue; const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } }
    if (includeBoss && this.boss && !this.boss.dead && this.boss !== exclude) { const dx = this.boss.x - x, dy = this.boss.y - y, d = dx * dx + dy * dy; if (d < bd * 1.3) { best = this.boss; } }
    return best;
  }
  banner(text, color, dur = 2, sub = null) { UI.banner = { text, color, dur, sub, t: 0 }; }
  shake(n) { this.shakeAmt = Math.min(20, Math.max(this.shakeAmt, n)); }
  onFishermanShot() { this.holdFire = false; if (typeof Village !== 'undefined') Village.panicAll(); this.banner('FISHER VILLAGE', '#ff6161', 2.6, 'The otter has spoken. FIGHT!'); setTimeout(() => { if (this.director) this.director.started = true; }, 1200); this.state = 'play'; }
  onEnemyKilled(e) { const p = this.player; p.joyT = 1.2; if (p.rampage.active && p.stats.rampFrenzy) p.rampage.t = Math.max(0, p.rampage.t - 0.6); }
  onBossKilled() { this.banner('THE CHIEF IS DOWN', '#ffe48f', 3); this.endT = 0; this.state = 'victory_wait'; }
  onPlayerDeath() { this.particles.blood(this.player.x, this.player.y, 4); this.particles.splash(this.player.x, this.player.y, 3); this.shake(16); this.endT = 0; this.state = 'dead_wait'; }
  // ---------------------------------------------------------- loop
  frame(ts) {
    let dt = (ts - this.last) / 1000; this.last = ts; if (dt > 1 / 20) dt = 1 / 20;
    this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-3), 0.05);
    this.update(dt); this.render(); Input.endFrame();
    requestAnimationFrame(t2 => this.frame(t2));
  }
  update(dt) {
    if (typeof MobileUI !== 'undefined' && MobileUI.enabled) MobileUI.update(dt, this.time);
    if (Input.hit('KeyM')) { Audio_.muted = !Audio_.muted; }
    switch (this.state) {
      case 'intro': Intro.update(dt); if (Intro.done) { this.state = 'dialogue'; Dialogue.reset(); this.holdFire = true; } break;
      case 'dialogue':
        Dialogue.update(dt); this.updateWorld(dt);
        const tapOk = !(typeof MobileUI !== 'undefined' && MobileUI.enabled && MobileUI.consumedTouch(Input.mouse.x, Input.mouse.y));
        if (Dialogue.done && (Input.mouse.clicked || (typeof MobileUI !== 'undefined' && MobileUI.enabled && MobileUI.pressed('fire'))) && tapOk && this.fisherman && this.fisherman.alive && !Dialogue.shotFired) {
          Dialogue.shotFired = true; const p = this.player, f = this.fisherman;
          const a = angleTo(p.x, p.y, f.x, f.y - 8), d = dist(p.x, p.y, f.x, f.y - 8);
          p.aim = a; p.recoil.primary = 0.12; p.flash.primary = 0.08; Audio_.shot('revolver'); this.shake(4);
          this.projectiles.push(new Projectile({ x: p.x + Math.cos(a) * 10, y: p.y - 5 + Math.sin(a) * 10, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: d / 520 + 0.5, dmg: 999, owner: 'player', sprite: SP.bulletBig, size: 4, trail: true }));
          this.particles.shell(p.x, p.y - 6, a);
        }
        if (Input.hit('Tab')) { this.prevState = this.state; this.state = 'tree'; }
        break;
      case 'play':
        this.updateWorld(dt);
        if (Input.hit('Tab')) { this.prevState = 'play'; this.state = 'tree'; }
        else if (Input.hit('Escape') || Input.hit('KeyP')) this.state = 'paused';
        this.weaponKeys();
        break;
      case 'tree':
        TreeScene.update(dt, this.time + dt);
        this.time += dt;
        UI.updateTree();
        if (Input.hit('Tab') || Input.hit('Escape')) this.state = this.prevState || 'play';
        break;
      case 'paused': if (Input.hit('Escape') || Input.hit('KeyP')) this.state = 'play'; if (Input.hit('Tab')) { this.prevState = 'play'; this.state = 'tree'; } break;
      case 'dead_wait': this.updateWorld(dt * 0.5, true); this.endT += dt; if (this.endT > 2) this.state = 'gameover'; break;
      case 'victory_wait': this.updateWorld(dt, false); this.endT += dt; if (this.endT > 3.5) this.state = 'victory'; break;
      case 'gameover': case 'victory':
        this.updateWorld(dt * 0.3, true);
        const tapRestart = typeof MobileUI !== 'undefined' && MobileUI.enabled && Input.mouse.clicked;
        if (Input.hit('KeyR') || tapRestart) { this.firstRun = false; this.newRun(); this.state = 'play'; }
        if (Input.hit('Tab')) { this.prevState = this.state; this.state = 'tree'; }
        break;
    }
  }
  weaponKeys() {
    const wl = this.tree.weaponsUnlocked();
    for (let i = 0; i < wl.length && i < 9; i++) if (Input.hit('Digit' + (i + 1))) { this.tree.primary = wl[i]; Audio_.tone(500, 0.05, 'square', 0.1); }
    if (Input.wheel) { const i = wl.indexOf(this.tree.primary); this.tree.primary = wl[(i + Input.wheel + wl.length * 10) % wl.length]; }
  }
  updateWorld(dt, frozenPlayer = false) {
    this.time += dt; const t = this.time;
    this.ocean.update(dt, t);
    if (!frozenPlayer) this.player.update(dt, t);
    if (this.fisherman) this.fisherman.update(dt);
    this.director.update(dt);
    for (const e of this.enemies) e.update(dt, t);
    if (this.boss) this.boss.update(dt, t);
    for (const p of this.projectiles) p.update(dt);
    for (const p of this.pickups) p.update(dt);
    for (const w of this.wrecks) w.update(dt);
    if (this.buoy) { this.buoy.update(dt); if (this.buoy.dead) this.buoy = null; }
    if (typeof Village !== 'undefined') Village.update(dt, t);
    if (typeof Gore !== 'undefined') Gore.update(dt);
    this.particles.update(dt, (x, y) => this.ocean.flow(x, y));
    Toon.update(dt);
    Rig.updateBlink(dt);
    // rocks make foam
    for (const r of this.rocks) { if (Math.random() < 0.15) { const a = rand(0, TAU); this.ocean.addFoam(r.x + Math.cos(a) * (r.r + 4), r.y + Math.sin(a) * (r.r + 4) * 0.8, 0.12); } r.glow = Math.max(0, r.glow - dt * 2); }
    // cleanup
    this.enemies = this.enemies.filter(e => !e.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.pickups = this.pickups.filter(p => !p.dead);
    this.wrecks = this.wrecks.filter(w => !w.dead);
    // camera
    const p = this.player;
    // bias the camera toward the shore when close to it, so the village stays in view
    const shoreBias = Math.max(0, (SHORE_Y + 420 - p.y)) * 0.8;
    const tx = p.x - 320 + p.vx * 0.22, ty = p.y - 180 + p.vy * 0.22 - shoreBias;
    const k = 1 - Math.pow(0.002, dt);
    this.cam.x = lerp(this.cam.x, clamp(tx, 0, WORLD_W - 640), k); this.cam.y = lerp(this.cam.y, clamp(ty, 0, WORLD_H - 360), k);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
    if (UI.banner) { UI.banner.t += dt; if (UI.banner.t > UI.banner.dur) UI.banner = null; }
  }
  // ---------------------------------------------------------- render
  render() {
    const ctx = this.ctx, t = this.time;
    if (this.state === 'intro') { Intro.render(ctx); this.blit(); return; }
    const cam = { x: Math.round(this.cam.x + (this.shakeAmt ? rand(-this.shakeAmt, this.shakeAmt) : 0)), y: Math.round(this.cam.y + (this.shakeAmt ? rand(-this.shakeAmt, this.shakeAmt) : 0)) };
    this.ocean.render(ctx, cam, t);
    if (typeof Village !== 'undefined') Village.render(ctx, cam, t); else this.renderVillage(ctx, cam, t);
    // underwater shadows
    for (const e of this.enemies) this.ocean.shadow(ctx, cam, e.x, e.y, e.radius * 2.6, e.radius * 1.5, t, 1.15);
    if (this.boss && !this.boss.dead) this.ocean.shadow(ctx, cam, this.boss.x, this.boss.y, 92, 40, t, 1.4);
    if (!this.player.dead) this.ocean.shadow(ctx, cam, this.player.x, this.player.y, 48, 24, t, this.player.diving ? 1.7 : 1.25);
    for (const w of this.wrecks) this.ocean.shadow(ctx, cam, w.x, w.y, w.radius * 2, w.radius, t, 0.6);
    this.ocean.renderTempCurrents(ctx, cam, t);
    for (const r of this.rocks) r.render(ctx, cam, t);
    this.ocean.renderWakes(ctx, cam, t);
    this.particles.renderUnder(ctx, cam);
    for (const w of this.wrecks) w.render(ctx, cam);
    for (const p of this.pickups) p.render(ctx, cam, t);
    if (this.buoy) this.buoy.render(ctx, cam, t);
    if (this.player.diving) this.player.render(ctx, cam, t);
    for (const e of this.enemies) e.render(ctx, cam, t);
    if (this.boss) this.boss.render(ctx, cam, t);
    if (this.fisherman) this.fisherman.render(ctx, cam, t);
    if (!this.player.diving) this.player.render(ctx, cam, t);
    for (const p of this.projectiles) p.render(ctx, cam);
    this.particles.render(ctx, cam);
    if (typeof Gore !== 'undefined') Gore.render(ctx, cam);
    Toon.render(ctx, cam);
    this.ocean.renderRipples(ctx, cam);
    // sun sheen and swell ribbons pass OVER the entities so they read as submerged
    if (this.ocean.renderSurfaceOverlay) this.ocean.renderSurfaceOverlay(ctx, cam, t);
    // overlays
    if (this.state === 'dialogue') Dialogue.render(ctx, cam);
    if (this.state !== 'gameover' && this.state !== 'victory' && this.state !== 'tree') UI.drawHUD(ctx, t);
    if (this.state === 'tree') UI.drawTree(ctx, t);
    if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(2,8,18,0.78)'; ctx.fillRect(0, 0, 640, 360);
      UIKit.ribbon(ctx, 320, 54, 'PAUSED', 'gold');
      UIKit.panel(ctx, 120, 96, 400, 150, 'dark');
      pixelText(ctx, '[ESC] resume    [TAB] the deep    [M] mute', 320, 106, 7, '#ffe48f', 'center');
      this.drawControls(ctx, 126);
    }
    if (this.state === 'gameover') drawEndScreen(ctx, t, false);
    if (this.state === 'victory') drawEndScreen(ctx, t, true);
    if (this.state === 'dead_wait') { ctx.fillStyle = `rgba(120,10,20,${Math.min(0.7, this.endT * 0.4).toFixed(2)})`; ctx.fillRect(0, 0, 640, 360); }
    if (this.state === 'dialogue' && !this.director.started) { /* controls hint in dialogue */ }
    if (typeof MobileUI !== 'undefined' && MobileUI.enabled && (this.state === 'play' || this.state === 'dialogue' || this.state === 'dead_wait' || this.state === 'victory_wait')) MobileUI.render(ctx, t);
    if (Audio_.muted) pixelText(ctx, 'MUTED [M]', 634, 350, 6, '#889', 'right');
    this.blit();
  }
  drawControls(ctx, y) {
    const lines = [
      'WASD or arrows       swim',
      'SPACE                Manatee Roll, invulnerable dash',
      'E / right-click      raise the SHIELD and absorb a hit',
      'Q                    unleash OTTER RAMPAGE when full',
      'Left mouse           aim by hand (the otter auto-aims)',
      '1-7 or wheel         switch weapon',
      'SHIFT / F / R        dive, decoy buoy, tidal slam',
      'TAB                  THE DEEP, spend your salvage',
    ];
    lines.forEach((l, i) => pixelText(ctx, l, 150, y + i * 13, 6, '#cfe0ec', 'left'));
  }
  renderVillage(ctx, cam, t) {
    if (cam.y > SHORE_Y + 200) return;
    const ox = -cam.x, oy = -cam.y;
    // huts, props along the shore
    const huts = [[-560, -110, SP.hut], [-420, -80, SP.hutRed], [-300, -130, SP.hut], [-160, -70, SP.hutGreen], [120, -90, SP.hut], [260, -120, SP.hutRed], [420, -75, SP.hut], [560, -115, SP.hutGreen], [-900, -100, SP.hut], [900, -95, SP.hutRed]];
    for (const [dx, dy, s] of huts) drawSprite(ctx, s, this.pier.x + dx + ox, SHORE_Y + dy + oy);
    const props = [[-500, -40, SP.barrel], [-490, -34, SP.barrel], [-80, -30, SP.crate], [-70, -30, SP.crate], [200, -40, SP.barrel], [340, -30, SP.crate], [60, -50, SP.barrel]];
    for (const [dx, dy, s] of props) drawSprite(ctx, s, this.pier.x + dx + ox, SHORE_Y + dy + oy);
    // trees on the grass
    for (let i = 0; i < 14; i++) { const x = (i * 263 + 100) % WORLD_W, y = SHORE_Y - 150 - (i * 37) % 60; const sx = x + ox, sy = y + oy; if (sx < -30 || sx > 670) continue; ctx.fillStyle = '#43281a'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 10); ctx.fillStyle = '#2f9e5b'; ctx.beginPath(); ctx.arc(Math.round(sx), Math.round(sy) - 3, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#6fd88e'; ctx.fillRect(Math.round(sx) - 4, Math.round(sy) - 8, 3, 2); }
    // piers
    for (const px of [this.pier.x, this.pier.x - 700, this.pier.x + 700]) {
      const y0 = this.pier.y0, y1 = px === this.pier.x ? this.pier.y1 : SHORE_Y + 70, w = px === this.pier.x ? this.pier.w : 28;
      const sx = Math.round(px - w / 2 + ox), sy = Math.round(y0 + oy);
      if (sx > 700 || sx + w < -20) continue;
      // posts + shadows on water
      ctx.fillStyle = 'rgba(6,18,48,0.35)'; ctx.fillRect(sx + 3, sy + 4, w, y1 - y0);
      ctx.fillStyle = '#8f5c2c'; ctx.fillRect(sx, sy, w, y1 - y0);
      ctx.fillStyle = '#5c3a1c'; for (let y = 0; y < y1 - y0; y += 6) ctx.fillRect(sx, sy + y, w, 1);
      ctx.fillStyle = '#b57d3f'; for (let y = 2; y < y1 - y0; y += 6) ctx.fillRect(sx + 2, sy + y, w - 4, 1);
      ctx.fillStyle = '#43281a'; for (let y = 4; y < y1 - y0; y += 24) { ctx.fillRect(sx - 2, sy + y, 4, 6); ctx.fillRect(sx + w - 2, sy + y, 4, 6); }
      ctx.fillStyle = '#14141c'; ctx.fillRect(sx - 1, sy, 1, y1 - y0); ctx.fillRect(sx + w, sy, 1, y1 - y0); ctx.fillRect(sx - 1, sy + (y1 - y0), w + 2, 1);
      // foam around posts
      ctx.fillStyle = `rgba(230,246,255,${(0.4 + Math.sin(t * 3 + px) * 0.2).toFixed(2)})`; ctx.fillRect(sx - 3, sy + (y1 - y0) + 1, w + 6, 2);
    }
    // sign
    pixelText(ctx, 'FISHER VILLAGE', Math.round(this.pier.x + ox), Math.round(SHORE_Y - 175 + oy), 8, '#ffe48f', 'center');
  }
  blit() {
    this.dctx.imageSmoothingEnabled = false;
    this.dctx.drawImage(this.g, 0, 0, this.display.width, this.display.height);
  }
}
window.addEventListener('load', () => { window.game = new Game(); });
