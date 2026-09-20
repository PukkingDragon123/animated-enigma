// ---- Game: state machine, world, render ---------------------------------
const WORLD_W = 6400, WORLD_H = 3000, SHORE_Y = 300;
// the village stands out over the water down to about SHORE_Y+150, so nothing
// that swims is allowed above this line
const WATER_TOP = SHORE_Y + 152;
const RIG_SCALE = 0.80;   // drawn larger than at the old tighter zoom so the hero still reads
// The presentation canvas is 1280x720. The world is authored at one pixel per
// world unit into an offscreen 640x360 layer and the WHOLE layer is magnified
// by exactly 2 onto the canvas, so every world pixel lands on a square 2x2
// block -- no resampling, no uneven pixel widths, and the ocean underneath is
// now resolved at one sample per world unit instead of one per two.
// Every interface coordinate stays in the same 640x360 logical space, drawn
// through the same 2x transform, so world and interface share one grid.
const OUT_W = 1280, OUT_H = 720;      // presentation resolution
const HUD_W = 640, HUD_H = 360;       // logical interface space
const HUD_SCALE = OUT_W / HUD_W;      // 2
const VIEW_W = 640, VIEW_H = 360;     // world units visible
const CROP_X = 0, CROP_Y = 0;
const ZOOM = HUD_W / VIEW_W;          // world units -> logical interface units (1)
const WORLD_LAYER_W = VIEW_W * DETAIL, WORLD_LAYER_H = VIEW_H * DETAIL;

class Game {
  constructor() {
    this.display = document.getElementById('screen'); this.dctx = this.display.getContext('2d');
    this.g = document.createElement('canvas'); this.g.width = OUT_W; this.g.height = OUT_H;
    this.ctx = this.g.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    // the world layer, drawn at 1:1 and then cropped + magnified
    this.world = document.createElement('canvas'); this.world.width = WORLD_LAYER_W; this.world.height = WORLD_LAYER_H;
    this.wctx = this.world.getContext('2d'); this.wctx.imageSmoothingEnabled = false;
    Input.init(this.display);
    if (typeof MobileUI !== 'undefined') MobileUI.init(this.display);
    window.addEventListener('resize', () => this.resize()); this.resize();
    buildCharacters();
    if (typeof Hazards !== 'undefined') Hazards.init();
    // hand the modules the real crop window so their culling matches
    this.viewW = VIEW_W; this.viewH = VIEW_H; this.cropX = CROP_X; this.cropY = CROP_Y;
    if (typeof Wildlife !== 'undefined') { Wildlife.init(); Wildlife.keyLabel = 'G'; }
    if (typeof DeathScene !== 'undefined') DeathScene.init();
    if (typeof BossCut !== 'undefined' && BossCut.init) BossCut.init();
    if (typeof Upgrades !== 'undefined') Upgrades.init();
    if (typeof MainMenu !== 'undefined') MainMenu.init();
    this.tree = new SkillTree();
    this.state = (typeof MainMenu !== 'undefined') ? 'menu' : 'intro';
    this.showControls = false;
    if (typeof Intro !== 'undefined' && Intro.reset) Intro.reset();
    this.firstRun = true; this.muted = false; this.bossBeaten = false; this.seenIntro = false;
    this.t = 0; this.last = performance.now(); this.fps = 60;
    this.newRun();
    // progress from a previous session, if there is any and storage works
    if (typeof Save !== 'undefined') { Save.applyTo(this); Save.noteRunStart(); }
    requestAnimationFrame(ts => this.frame(ts));
  }
  resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const scale = Math.min(ww / OUT_W, wh / OUT_H);
    this.display.style.width = Math.floor(OUT_W * scale) + 'px'; this.display.style.height = Math.floor(OUT_H * scale) + 'px';
  }
  newRun() {
    G = this;
    this.viewW = VIEW_W; this.viewH = VIEW_H; this.cropX = CROP_X; this.cropY = CROP_Y;
    this.ocean = new Ocean(WORLD_W, WORLD_H, SHORE_Y);
    this.particles = new Particles(this.ocean);
    this.enemies = []; this.projectiles = []; this.pickups = []; this.wrecks = []; this.rocks = [];
    this.boss = null; this.buoy = null; this.holdFire = false; this.cutReturn = null; this.pendingVictory = false; this.miniBosses = [];
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
    if (typeof Hazards !== 'undefined') {
      Hazards.reset(); Hazards.difficulty = 1;
      // the boats already encircle via their own slot logic in entities.js, and
      // the wave director owns the spawn budget, so switch those off here
      if (Hazards.tune) { Hazards.tune.flank = 0; Hazards.tune.waveMax = 1; Hazards.tune.waveRate = 1; Hazards.tune.autoSpawn = false; }
      Hazards.populate(WORLD_W, WORLD_H, SHORE_Y);
    }
    if (typeof Wildlife !== 'undefined') { Wildlife.reset(); Wildlife.populate(WORLD_W, WORLD_H, SHORE_Y); }
    this.player = new Player(this.pier.x, WATER_TOP + 34, this.tree);
    this.director = new Director();
    this.fisherman = this.firstRun ? new Fisherman(this.pier.x, this.pier.y1 - 6) : null;
    this.cam.x = this.player.x - (CROP_X + VIEW_W / 2); this.cam.y = this.player.y - (CROP_Y + VIEW_H / 2);
    UI.banner = null;
    if (!this.firstRun) { this.director.begin(); this.banner('REMATCH', '#ffe48f', 2, 'The village heard you were coming.'); }
  }
  // ---------------------------------------------------------- progress
  // Called at the moments worth remembering rather than on a timer. Save.save
  // debounces, so calling it freely costs nothing.
  persist(now = false) {
    if (typeof Save === 'undefined' || !Save.available) return;
    Save.save(Save.captureFrom(this));
    if (now) Save.flush();
  }
  // ---------------------------------------------------------- helpers
  spawnEnemy(type, x, y) { const e = new Enemy(type, x, y); this.enemies.push(e); this.particles.splash(x, y, 0.6); return e; }
  // A named mid-run encounter. Lives in this.enemies like any other boat, so
  // every system that already knows about enemies handles it for free.
  spawnMiniBoss(type, x, y, difficulty) {
    if (typeof MiniBoss === 'undefined' || typeof MINIBOSS_TYPES === 'undefined') return null;
    const keys = Object.keys(MINIBOSS_TYPES); if (!keys.length) return null;
    const key = (type && MINIBOSS_TYPES[type]) ? type : keys[(Math.random() * keys.length) | 0];
    const m = new MiniBoss(key, x, y, difficulty || this.director.difficulty);
    this.enemies.push(m); this.miniBosses.push(m);
    this.particles.splash(x, y, 3); this.shake(7); Audio_.roar();
    this.playCut('mini_intro', { name: m.displayName || m.name || MINIBOSS_TYPES[key].name });
    return m;
  }
  // Boss and mini-boss cinematics. They are short, so the world keeps running
  // underneath unless the cutscene says otherwise.
  playCut(kind, opts) {
    if (typeof BossCut === 'undefined' || !BossCut.start) return false;
    BossCut.start(kind, opts || {});
    if (BossCut.done || !BossCut.active) return false;
    this.cutReturn = this.state === 'cut' ? (this.cutReturn || 'play') : this.state;
    this.state = 'cut';
    return true;
  }
  spawnBoss() {
    const p = this.player; let a = rand(0, TAU), x, y;
    for (let i = 0; i < 20; i++) { x = p.x + Math.cos(a) * 420; y = p.y + Math.sin(a) * 420; if (x > 60 && x < WORLD_W - 60 && y > SHORE_Y + 60 && y < WORLD_H - 60) break; a += 0.7; }
    this.boss = new Boss(clamp(x, 60, WORLD_W - 60), clamp(y, SHORE_Y + 60, WORLD_H - 60));
    Audio_.roar(); this.shake(10);
    for (let i = 0; i < 6; i++) this.particles.splash(this.boss.x + rand(-40, 40), this.boss.y + rand(-20, 20), 2);
    this.playCut('chief_intro');
  }
  nearestEnemy(x, y, range, exclude = null, includeBoss = false) {
    let best = null, bd = range * range;
    for (const e of this.enemies) { if (e.dead || e === exclude) continue; const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } }
    if (includeBoss && this.boss && !this.boss.dead && this.boss !== exclude) { const dx = this.boss.x - x, dy = this.boss.y - y, d = dx * dx + dy * dy; if (d < bd * 1.3) { best = this.boss; } }
    return best;
  }
  banner(text, color, dur = 2, sub = null) { UI.banner = { text, color, dur, sub, t: 0 }; }
  shake(n) { this.shakeAmt = Math.min(20, Math.max(this.shakeAmt, n)); }
  onFishermanShot() {
    this.holdFire = false;
    if (typeof Village !== 'undefined') Village.panicAll();
    this.banner('FISHER VILLAGE', '#ff6161', 2.6, 'The otter has spoken. FIGHT!');
    setTimeout(() => { if (this.director && !this.director.started) this.director.begin(); }, 1200);
    this.runActive = true;
    this.autoTree = 0;
    this.state = 'play';
  }
  // one way in to the skill tree, so every caller gets the same setup
  openTree(prev) {
    this.persist();
    this.autoTree = 0;
    this.prevState = prev || 'play';
    this.state = 'tree';
    if (typeof Upgrades !== 'undefined') Upgrades.open();
  }
  // a wave is only over when every last boat is on the bottom
  onWaveCleared(idx) {
    const d = this.director;
    this.banner('WAVE CLEARED', '#6fd88e', 2.6, d.lastWave ? 'Nothing left but the Chief.' : 'Spend your salvage, then call the next one in.');
    Audio_.rampage();
    this.pickups.forEach(p => { p.life = Math.max(p.life, 30); });
    // the tree comes up on its own once the banner has had its moment
    this.autoTree = 2.4;
    this.persist();
  }
  onEnemyKilled(e) { const p = this.player; p.joyT = 1.2; if (p.rampage.active && p.stats.rampFrenzy) p.rampage.t = Math.max(0, p.rampage.t - 0.6); }
  onBossKilled() {
    this.banner('THE CHIEF IS DOWN', '#ffe48f', 3); this.endT = 0;
    this.bossBeaten = true;
    this.persist(true);
    this.state = 'victory_wait';
    // the chapter's payoff plays before the victory screen
    this.pendingVictory = true;
    this.playCut('chief_defeat');
  }
  onMiniBossKilled(m) {
    this.banner((m && (m.displayName || m.name) || 'IT') + ' IS DOWN', '#ffe48f', 2);
    this.playCut('mini_defeat', { name: m && (m.displayName || m.name) || '' });
  }
  onPlayerDeath() {
    this.runActive = false;
    if (typeof Save !== 'undefined') Save.noteDeath();
    this.persist(true);
    this.particles.blood(this.player.x, this.player.y, 4); this.particles.splash(this.player.x, this.player.y, 3);
    this.shake(16); this.endT = 0;
    // she sinks, the otter hauls her out and puts her back together on the
    // shore; the short red fade is only the fallback when that scene is absent
    if (typeof DeathScene !== 'undefined') { DeathScene.start(this.player.x, this.player.y, this.player.facing); this.state = 'death'; }
    else this.state = 'dead_wait';
  }
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
      case 'menu': {
        MainMenu.hasRun = this.runActive === true;
        MainMenu.update(dt, this.time); this.time += dt;
        if (this.showControls && (Input.hit('Escape') || Input.mouse.clicked)) { this.showControls = false; MainMenu.consume(); break; }
        const a = MainMenu.action;
        if (a) {
          MainMenu.consume();
          if (a === 'play') { this.firstRun = true; this.newRun(); this.runActive = false; Intro.reset(); this.state = 'intro'; }
          else if (a === 'continue' && this.runActive) this.state = 'play';
          else if (a === 'deep') this.openTree('menu');
          else if (a === 'controls') this.showControls = !this.showControls;
        }
        break;
      }
      case 'intro':
        Intro.update(dt);
        if (Intro.done) {
          this.seenIntro = true;
          if (typeof WorldMap !== 'undefined') {
            WorldMap.init();
            WorldMap.open(Math.max(1, (typeof Save !== 'undefined' && Save.data && Save.data.unlockedDests) || 1));
            this.state = 'worldmap';
          }
          else { this.state = 'dialogue'; Dialogue.reset(); this.holdFire = true; }
        }
        break;
      case 'worldmap': {
        WorldMap.update(dt, this.time); this.time += dt;
        const wa = WorldMap.action;
        if (wa) {
          WorldMap.consume();
          if (wa === 'launch') { this.state = 'dialogue'; Dialogue.reset(); this.holdFire = true; }
          else if (wa === 'back') this.state = 'menu';
        }
        break;
      }
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
        if (Input.hit('Tab')) this.openTree(this.state);
        break;
      case 'play':
        this.updateWorld(dt);
        if (Input.hit('Tab')) {
          if (this.upgradesOpen()) this.openTree('play');
          else { this.banner('FINISH THE WAVE FIRST', '#ff6161', 1.6, 'The skill tree only opens between waves.'); Audio_.deny(); }
        }
        else if (Input.hit('Escape') || Input.hit('KeyP')) this.state = 'paused';
        if (this.director.cleared && !this.director.lastWave) {
          const tap = Input.mouse.clicked && Input.mouse.x > 128 && Input.mouse.x < 512 && Input.mouse.y > 250 && Input.mouse.y < 296;
          if (Input.hit('Enter') || Input.hit('NumpadEnter') || Input.hit('KeyN') || tap) this.director.next();
        }
        this.weaponKeys();
        if (this.autoTree > 0) {
          this.autoTree -= dt;
          if (this.autoTree <= 0 && this.upgradesOpen()) this.openTree('play');
        }
        break;
      case 'tree':
        this.time += dt;
        if (typeof Upgrades !== 'undefined') {
          Upgrades.update(dt, this.time);
          if (Upgrades.wantsClose || Input.hit('Tab') || Input.hit('Escape')) {
            Upgrades.wantsClose = false; this.state = this.prevState || 'play';
            this.persist(true);   // whatever was just bought is banked
          }
        } else {
          TreeScene.update(dt, this.time); UI.updateTree();
          if (Input.hit('Tab') || Input.hit('Escape')) this.state = this.prevState || 'play';
        }
        break;
      case 'paused':
        if (typeof MainMenu !== 'undefined' && Input.hit('Backspace')) { this.runActive = true; this.state = 'menu'; break; }
        if (Input.hit('Escape') || Input.hit('KeyP')) this.state = 'play'; if (Input.hit('Tab') && this.upgradesOpen()) this.openTree('play'); break;
      case 'cut':
        if (typeof BossCut === 'undefined') { this.state = this.cutReturn || 'play'; break; }
        if (BossCut.worldActive) this.updateWorld(dt * 0.6, true);
        BossCut.update(dt, this.time);
        if (Input.actHit('fire') || Input.hit('Escape') || Input.hit('Enter')) BossCut.skip();
        if (BossCut.done) {
          const back = this.cutReturn || 'play'; this.cutReturn = null;
          this.state = back === 'cut' ? 'play' : back;
          // the defeat cinematic IS the pause after the kill, so the victory
          // screen comes up the moment it ends rather than after another wait
          if (this.pendingVictory) { this.pendingVictory = false; this.endT = 0; this.state = 'victory'; }
        }
        break;
      case 'death':
        // the sinking half still plays out in the world; the shore half does not
        if (DeathScene.worldActive) this.updateWorld(dt * 0.35, true);
        DeathScene.update(dt, this.time);
        if (DeathScene.done) this.openTree('gameover');
        break;
      case 'dead_wait':
        this.updateWorld(dt * 0.5, true); this.endT += dt;
        // the otter patches her up on the shore, then the tree opens so the
        // salvage she died with is not wasted
        if (this.endT > 2) this.openTree('gameover');
        break;
      case 'victory_wait': this.updateWorld(dt, false); this.endT += dt; if (this.endT > 3.5) this.state = 'victory'; break;
      case 'gameover': case 'victory':
        this.updateWorld(dt * 0.3, true);
        if (typeof MainMenu !== 'undefined' && (Input.hit('Escape') || Input.hit('Backspace'))) { this.state = 'menu'; break; }
        const tapRestart = typeof MobileUI !== 'undefined' && MobileUI.enabled && Input.mouse.clicked;
        if (Input.hit('KeyR') || tapRestart) { this.firstRun = false; this.newRun(); this.runActive = true; this.state = 'play'; }
        if (Input.hit('Tab')) this.openTree(this.state);
        break;
    }
  }
  // the upgrade screen is available between waves, before the fight starts,
  // and on the end screens
  upgradesOpen() {
    if (this.state === 'gameover' || this.state === 'victory' || this.state === 'dialogue') return true;
    const d = this.director;
    return !d.started || d.state === 'cleared';
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
    // a mini-boss going down is a moment, so it gets its own sting
    for (let i = this.miniBosses.length - 1; i >= 0; i--) {
      const m = this.miniBosses[i];
      if (m.dead) { this.miniBosses.splice(i, 1); this.onMiniBossKilled(m); }
    }
    if (this.boss) this.boss.update(dt, t);
    for (const p of this.projectiles) p.update(dt);
    for (const p of this.pickups) p.update(dt);
    for (const w of this.wrecks) w.update(dt);
    if (this.buoy) { this.buoy.update(dt); if (this.buoy.dead) this.buoy = null; }
    if (typeof Village !== 'undefined') Village.update(dt, t);
    if (typeof Hazards !== 'undefined') {
      // the opening waves teach one thing at a time, so mines, cannon and
      // boarders stay out of the water until the basics have been used
      if (Hazards.tune) Hazards.tune.autoSpawn = this.director.state === 'fighting' && this.director.waveIdx >= 3;
      Hazards.update(dt, t);
    }
    if (typeof Wildlife !== 'undefined') Wildlife.update(dt, t);
    if (typeof Gore !== 'undefined') Gore.update(dt);
    this.particles.update(dt, (x, y) => this.ocean.flow(x, y));
    Toon.update(dt);
    Rig.updateBlink(dt);
    // rocks make foam
    for (const r of this.rocks) { if (Math.random() < 0.15) { const a = rand(0, TAU); this.ocean.addFoam(r.x + Math.cos(a) * (r.r + 4), r.y + Math.sin(a) * (r.r + 4) * 0.8, 0.12); } r.glow = Math.max(0, r.glow - dt * 2); }
    // cleanup
    this.enemies = this.enemies.filter(e => !e.dead);
    // spread the surviving boats evenly around the player
    this.slotT = (this.slotT || 0) - dt;
    if (this.slotT <= 0) {
      this.slotT = 1.2;
      const n = this.enemies.length;
      if (n) {
        const base = Math.atan2(this.player.vy, this.player.vx) || 0;
        this.enemies.forEach((e, i) => { e.slot = base + (i / n) * TAU + rand(-0.18, 0.18); });
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.pickups = this.pickups.filter(p => !p.dead);
    this.wrecks = this.wrecks.filter(w => !w.dead);
    // camera
    const p = this.player;
    // bias the camera toward the shore when close to it, so the village stays in view
    // Pulling the camera up near the shore pushes the village DOWN the frame,
    // out from behind the top interface panels. The village is the most
    // detailed art in the game and it was sitting under the HUD.
    const shoreBias = Math.max(0, (SHORE_Y + 260 - p.y)) * 0.95;
    const tx = p.x - (CROP_X + VIEW_W / 2) + p.vx * 0.12, ty = p.y - (CROP_Y + VIEW_H / 2) + p.vy * 0.12 - shoreBias;
    const k = 1 - Math.pow(0.002, dt);
    // the visible window is cam + CROP .. cam + CROP + VIEW, so clamp to that
    this.cam.x = lerp(this.cam.x, clamp(tx, -CROP_X, WORLD_W - CROP_X - VIEW_W), k);
    this.cam.y = lerp(this.cam.y, clamp(ty, -CROP_Y, WORLD_H - CROP_Y - VIEW_H), k);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
    if (UI.banner) { UI.banner.t += dt; if (UI.banner.t > UI.banner.dur) UI.banner = null; }
  }
  // ---------------------------------------------------------- render
  // screen (640x360 HUD space) <-> world, across the 2x crop
  screenToWorld(sx, sy) { return { x: this.cam.x + CROP_X + sx * (VIEW_W / HUD_W), y: this.cam.y + CROP_Y + sy * (VIEW_H / HUD_H) }; }
  worldToScreen(wx, wy) { return { x: (wx - this.cam.x - CROP_X) * (HUD_W / VIEW_W), y: (wy - this.cam.y - CROP_Y) * (HUD_H / VIEW_H) }; }

  render() {
    const ctx = this.ctx, t = this.time;
    this.full(ctx);
    ctx.clearRect(0, 0, OUT_W, OUT_H);
    this.hud(ctx);
    if (this.state === 'menu') {
      MainMenu.render(ctx, t);
      if (this.showControls) {
        ctx.fillStyle = 'rgba(2,8,18,0.86)'; ctx.fillRect(0, 0, 640, 360);
        UIKit.ribbon(ctx, 320, 32, 'CONTROLS', 'gold');
        UIKit.panel(ctx, 96, 70, 448, 216, 'dark');
        this.drawControls(ctx, 84);
        pixelText(ctx, 'G or X    interact: ride a whale, open treasure', 150, 84 + 8 * 13, 6, '#cfe0ec');
        pixelText(ctx, 'ENTER     call in the next wave once one is cleared', 150, 84 + 9 * 13, 6, '#cfe0ec');
        pixelTextOutlined(ctx, 'click or [ESC] to go back', 320, 296, 7, '#ffe48f', '#14141c', 'center');
      }
      this.blit(); return;
    }
    if (this.state === 'intro') { Intro.render(ctx); this.blit(); return; }
    if (this.state === 'worldmap') { WorldMap.render(ctx, t); this.blit(); return; }
    // the shore half of the death scene is its own side-on frame: the bay is
    // not in it at all, so nothing of the world is drawn under it
    if (this.state === 'death' && !DeathScene.worldActive) { DeathScene.renderScreen(ctx, t); this.blit(); return; }
    this.full(ctx);
    const cam = { x: Math.round(this.cam.x + (this.shakeAmt ? rand(-this.shakeAmt, this.shakeAmt) : 0)), y: Math.round(this.cam.y + (this.shakeAmt ? rand(-this.shakeAmt, this.shakeAmt) : 0)) };
    const W = this.wctx;
    W.setTransform(1, 0, 0, 1, 0, 0);
    W.clearRect(0, 0, WORLD_LAYER_W, WORLD_LAYER_H);
    // from here on the world layer is in world units at DETAIL pixels each
    W.setTransform(DETAIL, 0, 0, DETAIL, 0, 0);
    this.ocean.render(W, cam, t);
    if (this.state === 'dialogue') Dialogue.renderWorld(W, cam);
    if (typeof Village !== 'undefined') Village.render(W, cam, t); else this.renderVillage(W, cam, t);
    // underwater shadows
    for (const e of this.enemies) this.ocean.shadow(W, cam, e.x, e.y, e.radius * 2.6, e.radius * 1.5, t, 1.15);
    if (this.boss && !this.boss.dead) this.ocean.shadow(W, cam, this.boss.x, this.boss.y, 92, 40, t, 1.4);
    if (!this.player.dead) this.ocean.shadow(W, cam, this.player.x, this.player.y, 48, 24, t, this.player.diving ? 1.7 : 1.25);
    for (const w of this.wrecks) this.ocean.shadow(W, cam, w.x, w.y, w.radius * 2, w.radius, t, 0.6);
    if (typeof Wildlife !== 'undefined') Wildlife.renderUnder(W, cam, t);
    this.ocean.renderTempCurrents(W, cam, t);
    for (const r of this.rocks) r.render(W, cam, t);
    this.ocean.renderWakes(W, cam, t);
    this.particles.renderUnder(W, cam);
    for (const w of this.wrecks) w.render(W, cam);
    for (const p of this.pickups) p.render(W, cam, t);
    if (typeof Hazards !== 'undefined') Hazards.render(W, cam, t);
    if (typeof Wildlife !== 'undefined') Wildlife.renderOver(W, cam, t);
    if (this.buoy) this.buoy.render(W, cam, t);
    if (this.player.diving) this.player.render(W, cam, t);
    for (const e of this.enemies) e.render(W, cam, t);
    if (this.boss) this.boss.render(W, cam, t);
    if (this.fisherman) this.fisherman.render(W, cam, t);
    if (!this.player.diving) this.player.render(W, cam, t);
    for (const p of this.projectiles) p.render(W, cam);
    this.particles.render(W, cam);
    if (typeof Gore !== 'undefined') Gore.render(W, cam);
    if (typeof Hazards !== 'undefined') Hazards.renderOver(W, cam, t);
    if (typeof Wildlife !== 'undefined') Wildlife.renderHint(W, cam, t);
    if (this.state === 'death' && DeathScene.renderWorld) DeathScene.renderWorld(W, cam, t);
    if (this.state === 'cut' && typeof BossCut !== 'undefined' && BossCut.renderWorld) BossCut.renderWorld(W, cam, t);
    Toon.render(W, cam);
    this.ocean.renderRipples(W, cam);
    // sun sheen and swell ribbons pass OVER the entities so they read as submerged
    if (this.ocean.renderSurfaceOverlay) this.ocean.renderSurfaceOverlay(W, cam, t);

    // magnify the centred crop of the world onto the presentation canvas
    W.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.full(ctx);
    ctx.drawImage(this.world, CROP_X * DETAIL, CROP_Y * DETAIL, VIEW_W * DETAIL, VIEW_H * DETAIL, 0, 0, OUT_W, OUT_H);
    // every interface pass below draws in 640x360 logical units
    this.hud(ctx);
    // overlays
    if (this.state === 'dialogue') Dialogue.renderHUD(ctx);
    if (this.state !== 'gameover' && this.state !== 'victory' && this.state !== 'tree' && this.state !== 'death' && this.state !== 'cut') UI.drawHUD(ctx, t);
    if (this.state === 'tree') { if (typeof Upgrades !== 'undefined') Upgrades.render(ctx, t); else UI.drawTree(ctx, t); }
    if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(2,8,18,0.78)'; ctx.fillRect(0, 0, 640, 360);
      UIKit.ribbon(ctx, 320, 54, 'PAUSED', 'gold');
      UIKit.panel(ctx, 120, 96, 400, 150, 'dark');
      pixelText(ctx, '[ESC] resume    [TAB] skill tree    [M] mute', 320, 106, 7, '#ffe48f', 'center');
      this.drawControls(ctx, 126);
    }
    if (this.state === 'gameover') drawEndScreen(ctx, t, false);
    if (this.state === 'victory') drawEndScreen(ctx, t, true);
    if (this.state === 'dead_wait') { ctx.fillStyle = `rgba(120,10,20,${Math.min(0.7, this.endT * 0.4).toFixed(2)})`; ctx.fillRect(0, 0, 640, 360); }
    if (this.state === 'death') DeathScene.renderScreen(ctx, this.time);
    if (this.state === 'cut' && typeof BossCut !== 'undefined') BossCut.renderScreen(ctx, this.time);
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
      'TAB                  SKILL TREE, spend your salvage',
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
    this.dctx.setTransform(1, 0, 0, 1, 0, 0);
    this.dctx.drawImage(this.g, 0, 0, this.display.width, this.display.height);
  }
  // everything that is not the world draws in 640x360 logical units
  hud(ctx) { ctx.setTransform(HUD_SCALE, 0, 0, HUD_SCALE, 0, 0); }
  full(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); }
}
window.addEventListener('load', () => { window.game = new Game(); });
