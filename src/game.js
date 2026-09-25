// ---- Game: state machine, world, render ---------------------------------
const WORLD_W = 6400, WORLD_H = 3000, SHORE_Y = 300;
// the village stands out over the water down to about SHORE_Y+150, so nothing
// that swims is allowed above this line
const WATER_TOP = SHORE_Y + 152;
// The hero is authored at one art pixel per world unit while everything else
// is at two, so at 1.0 each of her pixels lands on exactly a 2x2 block of
// screen pixels. Anything else and the chunk comes out uneven.
const RIG_SCALE = 1.0;
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
// how long the skip button has to be held down before a cinematic gives way
const SKIP_HOLD = 1.5;

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
    if (typeof StoryCut !== 'undefined' && StoryCut.init) StoryCut.init();
    if (typeof Upgrades !== 'undefined') Upgrades.init();
    if (typeof MainMenu !== 'undefined') MainMenu.init();
    this.tree = new SkillTree();
    this.state = (typeof MainMenu !== 'undefined') ? 'menu' : 'intro';
    this.showControls = false;
    if (typeof Intro !== 'undefined' && Intro.reset) Intro.reset();
    this.firstRun = true; this.muted = false; this.bossBeaten = false; this.seenIntro = false;
    this.t = 0; this.last = performance.now(); this.fps = 60;
    this.wipe = { t: 0, dur: 1.05, snap: null, sctx: null, buf: null, bctx: null, bubbles: [], cache: new Map() };
    this._lastState = undefined;
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
    this.boss = null; this.bossKey = null; this.buoy = null;
    this.cineReset(); this.holdFire = false; this.cutReturn = null; this.cutMod = null; this.cutWasWorld = false; this.cutsEnabled = false; this.lastKill = null; this.pendingVictory = false; this.pendingStory = null; this.miniBosses = [];
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
    if (!this.firstRun) { this.director.begin(); this.banner('BACK FOR MORE', '#ffe48f', 2); }
  }
  // ---------------------------------------------------------- skipping
  // A cutscene is never skipped by a stray tap. You hold the button down and
  // watch a ring fill; let go early and it drains back. The hold has to START
  // after the scene does, so a button already down when it begins counts for
  // nothing.
  skipArm() { this.skip = { t: 0, locked: true, fired: false }; }
  skipHeld() {
    // deliberately NOT space or the mouse: both are combat inputs, and a boss
    // cinematic interrupts combat. Skipping should never be something you do
    // by still having your hand on the controls.
    if (Input.down('Escape') || Input.down('Enter') || Input.down('NumpadEnter')) return true;
    if (typeof MobileUI !== 'undefined' && MobileUI.enabled && MobileUI.touches && MobileUI.touches.size > 0) return true;
    return false;
  }
  // returns true on the frame the hold completes
  updateSkip(dt) {
    if (!this.skip) this.skipArm();
    const k = this.skip;
    const held = this.skipHeld();
    if (k.locked) { if (!held) k.locked = false; k.t = 0; return false; }
    if (held) {
      k.t += dt;
      if (k.t >= SKIP_HOLD && !k.fired) { k.fired = true; k.t = SKIP_HOLD; Audio_.rampage(); return true; }
    } else {
      k.t = Math.max(0, k.t - dt * 2.2);   // drains faster than it fills
    }
    return false;
  }
  drawSkip(ctx) {
    const k = this.skip; if (!k || k.locked) return;
    const f = clamp(k.t / SKIP_HOLD, 0, 1);
    const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
    // clear of the caption line and of the letterbox bars the cinematics use
    const cx = 596, cy = 312, r = 11;
    // the prompt sits quiet until you start holding, then lights up
    const lit = f > 0.01;
    pixelTextOutlined(ctx, touch ? 'HOLD TO SKIP' : 'HOLD [ESC] TO SKIP', cx - r - 8, cy - 4, 5,
      lit ? '#ffe48f' : 'rgba(214,226,238,0.72)', 'rgba(8,12,20,0.85)', 'right');
    // the ring: a hard-edged pixel arc, filling clockwise from the top
    for (let i = 0; i < 24; i++) {
      const a = -Math.PI / 2 + (i / 24) * TAU;
      const on = (i / 24) < f;
      ctx.fillStyle = on ? '#ffe48f' : 'rgba(200,214,226,0.28)';
      ctx.fillRect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r) - 1, 2, 2);
    }
    if (f > 0) {
      ctx.fillStyle = f >= 1 ? '#ffffff' : '#ffe48f';
      const ir = Math.round(r * 0.45 * f);
      if (ir > 0) ctx.fillRect(cx - ir, cy - ir, ir * 2, ir * 2);
    }
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
  playCut(kind, opts) { return this.runCut(typeof BossCut !== 'undefined' ? BossCut : null, kind, opts); }
  // The brother thread. Chapter beats punctuate the map, so they use the same
  // path as a boss cinematic and the same hold-to-skip.
  playStory(id, opts) {
    if (typeof StoryCut === 'undefined' || !id) return false;
    if (this.storySeen && this.storySeen[id]) return false;
    if (!this.storySeen) this.storySeen = {};
    this.storySeen[id] = true;
    return this.runCut(StoryCut, id, opts);
  }
  storyForChapter(n) {
    if (typeof StoryCut === 'undefined' || !StoryCut.forChapter) return false;
    return this.playStory(StoryCut.forChapter(n));
  }
  runCut(mod, kind, opts) {
    // The intro is the only cinematic the game plays. Every other beat --
    // the boss arrivals and defeats, the chapter story beats -- is held here
    // rather than unpicked from its call sites, so all of it is one flag away
    // from coming back. Callers all cope with a refusal: onBossKilled has
    // already set victory_wait, which times out to the victory screen on its
    // own, and the intro falls through to the chart.
    if (!this.cutsEnabled) return false;
    if (!mod || !mod.start) return false;
    mod.start(kind, opts || {});
    if (mod.done || !mod.active) return false;
    this.cutMod = mod;
    this.cutWasWorld = !!(mod.world || mod.worldActive);
    this.cutReturn = this.state === 'cut' ? (this.cutReturn || 'play') : this.state;
    this.skipArm();
    this.state = 'cut';
    return true;
  }
  spawnBoss(key) {
    const p = this.player; let a = rand(0, TAU), x, y;
    for (let i = 0; i < 20; i++) { x = p.x + Math.cos(a) * 420; y = p.y + Math.sin(a) * 420; if (x > 60 && x < WORLD_W - 60 && y > SHORE_Y + 60 && y < WORLD_H - 60) break; a += 0.7; }
    const bx = clamp(x, 60, WORLD_W - 60), by = clamp(y, SHORE_Y + 60, WORLD_H - 60);
    const k = key || (this.director && this.director.currentWave().bossKey) || 'chief';
    this.bossKey = k;
    this.boss = (typeof makeBoss === 'function' ? makeBoss(k, bx, by, this.director.difficulty) : null) || new Boss(bx, by);
    Audio_.roar(); this.shake(10);
    for (let i = 0; i < 6; i++) this.particles.splash(this.boss.x + rand(-40, 40), this.boss.y + rand(-20, 20), 2);
    // These used to open a cinematic. With those gone the arrival would land
    // on nothing, so the pair call it instead -- which is what the user asked
    // the cutscenes be replaced with.
    if (typeof UI !== 'undefined' && UI.banterEvent) {
      UI.banterEvent('big', k === 'chief'
        ? { lines: [['o', "That's the Chief. Gut him."], ['m', 'Hold him under.']], pri: 9 }
        : { lines: [['o', 'Big one! Break its back!'], ['m', 'It bleeds.']], pri: 8 });
    }
    if (k === 'chief') this.playCut('chief_intro');
    else this.playCut('mini_intro', { name: this.boss.name || 'SOMETHING BIG' });
  }
  nearestEnemy(x, y, range, exclude = null, includeBoss = false) {
    let best = null, bd = range * range;
    for (const e of this.enemies) { if (e.dead || e === exclude) continue; const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } }
    if (includeBoss && this.boss && !this.boss.dead && this.boss !== exclude) { const dx = this.boss.x - x, dy = this.boss.y - y, d = dx * dx + dy * dy; if (d < bd * 1.3) { best = this.boss; } }
    return best;
  }
  banner(text, color, dur = 2, sub = null) { UI.banner = { text, color, dur, sub, t: 0 }; }
  shake(n) { this.shakeAmt = Math.min(20, Math.max(this.shakeAmt, n)); }
  // The one way into a run. The arrival hands straight here when the pair
  // have finished talking.
  startRun() {
    if (this.runActive && this.state === 'play') return;
    this.holdFire = false;
    if (typeof Village !== 'undefined') Village.panicAll();
    if (this.director && !this.director.started) this.director.begin();
    this.runActive = true;
    this.autoTree = 0;
    this.state = 'play';
  }
  // kept because entities.js still calls it if the lookout is ever shot in
  // ordinary play -- it is no longer how a run begins
  onFishermanShot() { this.startRun(); }
  // Setting out from the chart. The run to the place always plays; the first
  // time into Fisher Village the otter's walk down the pier plays after it,
  // and the old five-line arrival exchange is left out -- the scenes have
  // already said it. Without the cutscene module this is the old arrival.
  beginArrival() {
    this.holdFire = true; this.skipArm();
    const dests = (typeof WorldMap !== 'undefined' && WorldMap.destinations) || [];
    const d = dests[(typeof WorldMap !== 'undefined' && WorldMap.selected) | 0] || {};
    const S = typeof Save !== 'undefined' ? Save : null;
    const ids = ['travel'];
    if (d.kind === 'village' && !(S && S.hasSeen && S.hasSeen('village_arrival'))) ids.push('village');
    const ok = typeof Cine !== 'undefined' && Cine.play(ids, {
      dest: { name: d.name, chapter: d.chapter, kind: d.kind },
      // banked when the scene has gone by, watched or skipped
      onScene: (id) => { if (id === 'village' && S && S.markSeen) S.markSeen('village_arrival'); },
    });
    if (ok) { this.state = 'cine'; return; }
    this.state = 'dialogue'; Dialogue.reset();
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
    this.banner('ALL HANDS DEAD', '#6fd88e', 2.6);
    Audio_.rampage();
    this.pickups.forEach(p => { p.life = Math.max(p.life, 30); });
    // the tree comes up on its own once the banner has had its moment
    this.autoTree = 2.4;
    this.persist();
  }
  onEnemyKilled(e) { this.lastKill = { x: e.x, y: e.y }; const p = this.player; p.joyT = 1.2; if (p.rampage.active && p.stats.rampFrenzy) p.rampage.t = Math.max(0, p.rampage.t - 0.6); }
  onBossKilled() {
    const nm = (this.boss && this.boss.name) || 'THE CHIEF';
    this.banner(nm + ' IS DEAD', '#ffe48f', 3); this.endT = 0;
    this.bossBeaten = true;
    this.persist(true);
    this.state = 'victory_wait';
    // the chapter's payoff plays before the victory screen
    this.pendingVictory = true;
    const chapter = Math.max(1, (typeof Save !== 'undefined' && Save.data && Save.data.unlockedDests) || 1);
    this.pendingStory = (typeof StoryCut !== 'undefined' && StoryCut.forChapter) ? StoryCut.forChapter(chapter) : null;
    this.playCut(this.bossKey === 'chief' || !this.bossKey ? 'chief_defeat' : 'mini_defeat', { name: nm });
  }
  onMiniBossKilled(m) {
    this.banner((m && (m.displayName || m.name) || 'IT') + ' IS DEAD', '#ffe48f', 2);
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
    if (typeof DeathScene !== 'undefined') { DeathScene.start(this.player.x, this.player.y, this.player.facing); this.skipArm(); this.state = 'death'; }
    else this.state = 'dead_wait';
  }
  // ---------------------------------------------------------- loop
  frame(ts) {
    // rAF's timestamp is when the frame began, which can predate the
    // performance.now() taken in the constructor, so the first dt can be
    // negative. Anything integrating time then runs backwards.
    let dt = (ts - this.last) / 1000; this.last = ts;
    if (!(dt > 0)) dt = 0; else if (dt > 1 / 20) dt = 1 / 20;
    this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-3), 0.05);
    this.update(dt);
    this.updateCine(dt);
    if (this.state !== this._lastState) { this.beginWipe(this._lastState, this.state); this._lastState = this.state; }
    if (this.wipe.t > 0) this.wipe.t -= dt;
    this.render(); Input.endFrame();
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
          if (a === 'play') { this.firstRun = true; this.newRun(); this.runActive = false; Intro.reset(); this.skipArm(); this.state = 'intro'; }
          else if (a === 'continue' && this.runActive) this.state = 'play';
          else if (a === 'deep') this.openTree('menu');
          else if (a === 'controls') this.showControls = !this.showControls;
        }
        break;
      }
      case 'intro':
        Intro.update(dt);
        // the cinematic itself reads no input; this is the only way past it
        if (this.updateSkip(dt)) { if (Intro.skip) Intro.skip(); Intro.done = true; }
        if (Intro.done) {
          this.seenIntro = true;
          if (this.storyForChapter(0)) break;
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
        // bake the arrival scenes a slice at a time while the chart is up,
        // so the frame she sets out on never pays for them
        if (typeof Cine !== 'undefined' && Cine.prewarm) Cine.prewarm();
        const wa = WorldMap.action;
        if (wa) {
          WorldMap.consume();
          if (wa === 'launch') this.beginArrival();
          else if (wa === 'back') this.state = 'menu';
        }
        break;
      }
      case 'cine':
        // the swim out (and, the first time, the village) -- Cine is the
        // intro's own engine. Its clock is held while the bubble wipe still
        // covers the frame, so the scene starts when you can see it start.
        Cine.update(this.wipe.t > this.wipe.dur * 0.5 ? 0 : dt);
        // hold-to-skip ends the scene on screen; a following scene needs a
        // fresh hold, so one long press never eats both
        if (this.updateSkip(dt)) { Cine.skip(); if (!Cine.done) this.skipArm(); }
        if (Cine.done) this.startRun();
        break;
      case 'dialogue':
        Dialogue.update(dt); this.updateWorld(dt);
        if (Dialogue.cinematic && this.updateSkip(dt) && Dialogue.skip) Dialogue.skip();
        // The two of them say their piece and the fight starts. It used to
        // wait here for you to click and shoot the lookout dead; nothing is
        // gated on killing anyone now, and he lives.
        if (Dialogue.done) this.startRun();
        if (Input.hit('Tab')) this.openTree(this.state);
        break;
      case 'play':
        this.updateWorld(dt);
        if (Input.hit('Tab')) {
          if (this.upgradesOpen()) this.openTree('play');
          else { this.banner('KILL THEM FIRST', '#ff6161', 1.6); Audio_.deny(); }
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
      case 'cut': {
        const cm = this.cutMod;
        if (!cm) { this.state = this.cutReturn || 'play'; break; }
        if (cm.worldActive) this.updateWorld(dt * 0.6, true);
        cm.update(dt, this.time);
        if (this.updateSkip(dt)) cm.skip();
        if (cm.done) {
          const back = this.cutReturn || 'play'; this.cutReturn = null;
          this.state = back === 'cut' ? 'play' : back;
          // the defeat cinematic IS the pause after the kill, so the victory
          // screen comes up the moment it ends rather than after another wait
          this.cutMod = null;
          // the chapter's story beat plays out of the defeat cinematic
          if (this.pendingStory) { const id = this.pendingStory; this.pendingStory = null; if (this.playStory(id)) break; }
          if (this.pendingVictory) { this.pendingVictory = false; this.endT = 0; this.state = 'victory'; }
        }
        break;
      }
      case 'death':
        // the sinking half still plays out in the world; the shore half does not
        if (DeathScene.worldActive) this.updateWorld(dt * 0.35, true);
        DeathScene.update(dt, this.time);
        if (this.updateSkip(dt)) DeathScene.skip();
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
    const k = this.cine.freeze ? 0 : 1 - Math.pow(0.002, dt);
    // the visible window is cam + CROP .. cam + CROP + VIEW, so clamp to that
    this.cam.x = lerp(this.cam.x, clamp(tx, -CROP_X, WORLD_W - CROP_X - VIEW_W), k);
    this.cam.y = lerp(this.cam.y, clamp(ty, -CROP_Y, WORLD_H - CROP_Y - VIEW_H), k);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
    if (UI.banner) { UI.banner.t += dt; if (UI.banner.t > UI.banner.dur) UI.banner = null; }
  }
  // ---------------------------------------------------------- render
  // screen (640x360 HUD space) <-> world, across the 2x crop
  // where the zoom is centred, in 640x360 view units
  cineFocusScreen() {
    const c = this.cine;
    const wx = c.fx !== null ? c.fx : this.player.x, wy = c.fy !== null ? c.fy : this.player.y;
    return { x: clamp(wx - this.cam.x - CROP_X, 0, VIEW_W), y: clamp(wy - this.cam.y - CROP_Y, 0, VIEW_H) };
  }
  screenToWorld(sx, sy) {
    const c = this.cine;
    if (c.zoom > 1.001) {
      const f = this.cineFocusScreen();
      const vw = VIEW_W / c.zoom, vh = VIEW_H / c.zoom;
      const ox = clamp(f.x - vw / 2, 0, VIEW_W - vw), oy = clamp(f.y - vh / 2, 0, VIEW_H - vh);
      return { x: this.cam.x + CROP_X + ox + sx * (vw / HUD_W), y: this.cam.y + CROP_Y + oy + sy * (vh / HUD_H) };
    }
    return { x: this.cam.x + CROP_X + sx * (VIEW_W / HUD_W), y: this.cam.y + CROP_Y + sy * (VIEW_H / HUD_H) };
  }
  worldToScreen(wx, wy) {
    const c = this.cine;
    if (c.zoom > 1.001) {
      const f = this.cineFocusScreen();
      const vw = VIEW_W / c.zoom, vh = VIEW_H / c.zoom;
      const ox = clamp(f.x - vw / 2, 0, VIEW_W - vw), oy = clamp(f.y - vh / 2, 0, VIEW_H - vh);
      return { x: (wx - this.cam.x - CROP_X - ox) * (HUD_W / vw), y: (wy - this.cam.y - CROP_Y - oy) * (HUD_H / vh) };
    }
    return { x: (wx - this.cam.x - CROP_X) * (HUD_W / VIEW_W), y: (wy - this.cam.y - CROP_Y) * (HUD_H / VIEW_H) };
  }

  // ---------------------------------------------------------- cine camera
  // A cinematic camera the scene files drive. It rides on top of the ordinary
  // follow camera rather than replacing it, so gameplay keeps working
  // underneath and a scene that forgets to release it cannot strand the view.
  //   G.cineTo(x, y, zoom, secs)  ease toward a world point at a zoom
  //   G.cineHold(x, y, zoom)      snap there
  //   G.cineRelease(secs)         ease back to the player at zoom 1
  //   G.cineBars(k)               0..1 letterbox
  //   G.cineFreeze(on)            hold the follow camera still
  cineTo(x, y, zoom, secs) {
    const c = this.cine;
    c.tx = x === null ? null : x; c.ty = y === null ? null : y;
    c.tz = Math.max(1, zoom || 1);
    c.rate = secs > 0 ? 1 / secs : 999;
  }
  cineHold(x, y, zoom) {
    const c = this.cine;
    c.fx = c.tx = x; c.fy = c.ty = y; c.zoom = c.tz = Math.max(1, zoom || 1); c.rate = 999;
  }
  cineRelease(secs) { this.cineTo(null, null, 1, secs === undefined ? 0.8 : secs); }
  cineBars(k) { this.cine.bars = clamp(k, 0, 1); }
  cineFreeze(on) { this.cine.freeze = !!on; }
  cineReset() { this.cine = { zoom: 1, tz: 1, fx: null, fy: null, tx: null, ty: null, rate: 999, bars: 0, freeze: false }; }
  updateCine(dt) {
    const c = this.cine;
    const k = Math.min(1, c.rate * dt * 2.2);
    c.zoom += (c.tz - c.zoom) * k;
    if (Math.abs(c.zoom - c.tz) < 0.004) c.zoom = c.tz;
    const px = this.player ? this.player.x : 0, py = this.player ? this.player.y : 0;
    const gx = c.tx === null ? px : c.tx, gy = c.ty === null ? py : c.ty;
    if (c.fx === null) { c.fx = gx; c.fy = gy; }
    c.fx += (gx - c.fx) * k; c.fy += (gy - c.fy) * k;
    if (c.zoom === 1 && c.tx === null) { c.fx = null; c.fy = null; }
  }
  drawCineBars(ctx) {
    const k = this.cine.bars; if (k <= 0.001) return;
    const h = Math.round(46 * k);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 640, h); ctx.fillRect(0, 360 - h, 640, h);
  }

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
    if (this.state === 'intro') { Intro.render(ctx); this.drawSkip(ctx); this.blit(); return; }
    if (this.state === 'worldmap') { WorldMap.render(ctx, t); this.blit(); return; }
    // a cutscene frame is the whole frame: no world under it, no HUD over it
    if (this.state === 'cine') { Cine.render(ctx); this.drawSkip(ctx); this.blit(); return; }
    // the shore half of the death scene is its own side-on frame: the bay is
    // not in it at all, so nothing of the world is drawn under it
    if (this.state === 'death' && !DeathScene.worldActive) { DeathScene.renderScreen(ctx, t); this.drawSkip(ctx); this.blit(); return; }
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
    if (this.boss && !this.boss.dead) this.ocean.shadow(W, cam, this.boss.x, this.boss.y, this.boss.radius * 2.4, this.boss.radius * 1.1, t, 1.4);
    // with her down, player.x/y is the otter in the water: she casts her own
    if (!this.player.dead) { if (this.player.downed) this.player.renderShadows(W, cam, t); else this.ocean.shadow(W, cam, this.player.x, this.player.y, 48, 24, t, this.player.diving ? 1.7 : 1.25); }
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
    if (this.state === 'cut' && this.cutMod && this.cutMod.renderWorld) this.cutMod.renderWorld(W, cam, t);
    Toon.render(W, cam);
    this.ocean.renderRipples(W, cam);
    // sun sheen and swell ribbons pass OVER the entities so they read as submerged
    if (this.ocean.renderSurfaceOverlay) this.ocean.renderSurfaceOverlay(W, cam, t);

    // magnify the centred crop of the world onto the presentation canvas
    W.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.full(ctx);
    // The world layer is authored at DETAIL px per unit, so blitting a smaller
    // sub-rect of it magnified to the full canvas IS a zoom, with no resampling
    // at whole-number factors and no second render pass.
    const cz = this.cine.zoom;
    if (cz > 1.001) {
      const sw = (VIEW_W * DETAIL) / cz, sh = (VIEW_H * DETAIL) / cz;
      // the point the shot is built around, in layer pixels
      const f = this.cineFocusScreen();
      const sx = clamp(f.x * DETAIL - sw / 2, 0, VIEW_W * DETAIL - sw);
      const sy = clamp(f.y * DETAIL - sh / 2, 0, VIEW_H * DETAIL - sh);
      ctx.drawImage(this.world, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh), 0, 0, OUT_W, OUT_H);
    } else {
      ctx.drawImage(this.world, CROP_X * DETAIL, CROP_Y * DETAIL, VIEW_W * DETAIL, VIEW_H * DETAIL, 0, 0, OUT_W, OUT_H);
    }
    // Lighting and grade go on the world, after it is composed and before any
    // interface is drawn over it -- the HUD is not part of the scene.
    if (typeof Light !== 'undefined' && Light.render) Light.render(ctx, this, t);
    // every interface pass below draws in 640x360 logical units
    this.hud(ctx);
    this.drawCineBars(ctx);
    // overlays
    if (this.state === 'dialogue') Dialogue.renderHUD(ctx);
    // the arrival is a cinematic, letterbox and all, so the vitals panel and
    // the clock have no business sitting on the top black bar through it
    const staged = this.state === 'dialogue' && typeof Dialogue !== 'undefined' && Dialogue.cinematic;
    if (this.state !== 'gameover' && this.state !== 'victory' && this.state !== 'tree' && this.state !== 'death' && this.state !== 'cut' && !staged) UI.drawHUD(ctx, t);
    if (this.state === 'tree') { if (typeof Upgrades !== 'undefined') Upgrades.render(ctx, t); else UI.drawTree(ctx, t); }
    if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(2,8,18,0.78)'; ctx.fillRect(0, 0, 640, 360);
      UIKit.ribbon(ctx, 320, 54, 'PAUSED', 'gold');
      UIKit.panel(ctx, 120, 96, 400, 150, 'dark');
      pixelText(ctx, '[ESC] resume    [TAB] skill tree    [M] mute', 320, 106, 7, '#ffe48f', 'center');
      this.drawControls(ctx, 126);
    }
    if (this.state === 'gameover') this.drawEndScreen(ctx, t, false);
    if (this.state === 'victory') this.drawEndScreen(ctx, t, true);
    if (this.state === 'dead_wait') { ctx.fillStyle = `rgba(120,10,20,${Math.min(0.7, this.endT * 0.4).toFixed(2)})`; ctx.fillRect(0, 0, 640, 360); }
    if (this.state === 'death') DeathScene.renderScreen(ctx, this.time);
    if (this.state === 'cut' && this.cutMod) this.cutMod.renderScreen(ctx, this.time);
    if (this.state === 'death' || this.state === 'cut' || staged) this.drawSkip(ctx);
    if (this.state === 'dialogue' && !this.director.started) { /* controls hint in dialogue */ }
    if (typeof MobileUI !== 'undefined' && MobileUI.enabled && (this.state === 'play' || this.state === 'dialogue' || this.state === 'dead_wait' || this.state === 'victory_wait')) MobileUI.render(ctx, t);
    if (Audio_.muted) pixelText(ctx, 'MUTED [M]', 634, 350, 6, '#889', 'right');
    this.blit();
  }
  drawControls(ctx, y) {
    const lines = [
      'WASD or arrows       swim',
      'SPACE                Manatee Roll, invulnerable dash',
      'E / right-click      PARRY: catch a shot and turn it into rampage',
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
  // ---------------------------------------------------------- transitions
  // The cartoon underwater wipe: a crowd of bubbles boils up and covers the
  // whole frame, and once nothing of the old scene is left they drift off and
  // pop, leaving the new one. The swap happens while the screen is full, so
  // the cut itself is never seen.
  beginWipe(from, to) {
    if (from === undefined) return;               // the very first frame
    if (this.wipe.t > 0) return;                  // already mid-wipe
    const quiet = { paused: 1, tree: 1 };         // a pause stays a cut
    if (quiet[from] && quiet[to]) return;
    // A cinematic that plays inside the live world is the same scene carrying
    // on, not a new one: a screenful of soap over the hand-off from the shot
    // to the alarm throws away the continuity the beat is built on. Wipe only
    // when the scene underneath actually changes.
    const inWorld = { play: 1, dialogue: 1 };
    const wasWorld = s => inWorld[s] || (s === 'cut' && this.cutWasWorld);
    const nowWorld = s => inWorld[s] || (s === 'cut' && !!(this.cutMod && (this.cutMod.world || this.cutMod.worldActive)));
    if (wasWorld(from) && nowWorld(to)) return;
    if (!this.wipe.snap) {
      const c = document.createElement('canvas');
      c.width = OUT_W; c.height = OUT_H;
      this.wipe.snap = c; this.wipe.sctx = c.getContext('2d');
      this.wipe.sctx.imageSmoothingEnabled = false;
      // The foam is drawn once at 640x360 and blown up, not at full res: a
      // hundred and seventy overlapping discs is four times the fill the frame
      // can afford, and the chunkier pixels match the world layer anyway.
      const f = document.createElement('canvas');
      f.width = 640; f.height = 360;
      this.wipe.buf = f; this.wipe.bctx = f.getContext('2d');
      this.wipe.bctx.imageSmoothingEnabled = false;
    }
    this.wipe.sctx.setTransform(1, 0, 0, 1, 0, 0);
    this.wipe.sctx.clearRect(0, 0, OUT_W, OUT_H);
    this.wipe.sctx.drawImage(this.g, 0, 0);
    // The cover has to be airtight: at the midpoint the scene underneath
    // swaps, and any bald patch would show the cut. So the big bubbles are
    // seeded on a jittered grid and each is given a radius that reaches its
    // own cell's corners from the far end of its jitter -- coverage is then
    // geometric, not luck. A scatter of small ones on top breaks up the grid.
    const seed = (this.time * 977) | 0;
    const B = this.wipe.bubbles; B.length = 0;
    const COLS = 15, ROWS = 9, JIT = 9;
    const X0 = -70, X1 = 710, Y0 = -60, Y1 = 420;
    const cw = (X1 - X0) / (COLS - 1), ch = (Y1 - Y0) / ROWS;
    const rmin = Math.hypot(cw / 2, ch / 2) + JIT + 8;    // + room for the bob
    let i = 0;
    for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++, i++) {
      const h1 = hash2(seed + i * 3, i * 7 + 3), h2 = hash2(i * 13 + 5, seed - i * 2), h3 = hash2(seed - i * 5, i * 11 + 1);
      B.push({
        x: X0 + cw * (gx + 0.5) - (gy & 1) * cw * 0.5 + (h1 - 0.5) * 2 * JIT,
        y: Y0 + ch * (gy + 0.5) + (h2 - 0.5) * 2 * JIT,
        r: rmin * (1 + h3 * 0.75),
        tint: (i + (h2 * 3 | 0)) % 3,
        launch: 200 + h2 * 260,                 // how far below it boils up from
        inT: 0.06 + h1 * 0.24,                  // up and full by 0.46
        outT: 0.51 + h3 * 0.24,                 // and they leave in another order
        pop: h1 > 0.45,                         // about half burst, the rest shrink away
        rise: 300 + h1 * 340,
        drift: (h2 - 0.5) * 140,
        wob: h3 * TAU, spin: 0.6 + h2 * 1.6,
      });
    }
    for (let j = 0; j < 34; j++, i++) {
      const h1 = hash2(seed + i * 5, i * 9 + 7), h2 = hash2(i * 17 + 2, seed - i * 3), h3 = hash2(seed - i * 7, i * 23 + 4);
      B.push({
        x: -50 + h1 * 740, y: -40 + h2 * 440,
        r: 7 + h3 * 26,
        tint: (j + (h1 * 3 | 0)) % 3,
        launch: 180 + h1 * 300,
        inT: 0.02 + h2 * 0.30,
        outT: 0.51 + h1 * 0.26,
        pop: h2 > 0.4,
        rise: 320 + h3 * 420,
        drift: (h3 - 0.5) * 180,
        wob: h1 * TAU, spin: 0.8 + h3 * 2.2,
      });
    }
    // Shuffle so the overlaps do not all lean the same way -- drawn in grid
    // order every bubble is tucked under the row below it and the lot reads
    // as fish scales.
    for (let j = B.length - 1; j > 0; j--) {
      const m = (hash2(seed + j * 31, j * 17 + 9) * (j + 1)) | 0;
      const tmp = B[j]; B[j] = B[m]; B[m] = tmp;
    }
    this.wipe.dur = 1.05; this.wipe.t = this.wipe.dur;
    Audio_.tone(150, 0.20, 'sine', 0.05, 520);
    Audio_.tone(430, 0.30, 'sine', 0.035, 980);
  }
  // A hard-edged wobbling disc. ctx.arc + fill would antialias the edge, and a
  // soft rim in a game with none reads as a mistake.
  wipeBlob(ctx, cx, cy, r, wob, ph, step = 1) {
    if (r <= 0) return;
    for (let y = -r; y <= r; y += step) {
      const f = y / r; if (f < -1 || f > 1) continue;
      const a = Math.asin(clamp(f, -1, 1));
      const rr = r * (1 + Math.sin(a * 3 + ph) * wob * 0.5 + Math.sin(a * 5 - ph * 1.7) * wob * 0.3);
      const w = Math.sqrt(Math.max(0, rr * rr - y * y));
      if (w <= 0) continue;
      ctx.fillRect(Math.round(cx - w), Math.round(cy + y), Math.round(w * 2), step);
    }
  }
  // A bubble's face: dark rim, lit rim shifted up-left so the light lands on
  // one side, body, brighter core, then the specks that say "glass". Kept in a
  // map by size and tint -- there are only a few dozen distinct faces in a
  // wipe, and each one is drawn once.
  bubbleSprite(qr, tint) {
    const key = tint * 4096 + qr;
    let sp = this.wipe.cache.get(key);
    if (sp) return sp;
    const RIM_D = '#4f9ccd', RIM_L = '#f4feff';
    const BODY = ['#c2eaff', '#a5daf6', '#dff5ff'], CORE = ['#dcf5ff', '#bfe8fc', '#f0fcff'];
    const pad = 2, d = qr * 2 + pad * 2;
    sp = document.createElement('canvas'); sp.width = d; sp.height = d;
    const c = sp.getContext('2d'); c.imageSmoothingEnabled = false;
    const cx = qr + pad, cy = qr + pad, st = qr > 26 ? 2 : 1, ph = 0.8;
    c.fillStyle = RIM_D; this.wipeBlob(c, cx, cy, qr, 0.05, ph, st);
    c.globalAlpha = 0.8; c.fillStyle = RIM_L;
    this.wipeBlob(c, cx - qr * 0.02 - 1, cy - qr * 0.03 - 1, qr - 1.5, 0.05, ph, st);
    c.globalAlpha = 1; c.fillStyle = BODY[tint];
    this.wipeBlob(c, cx, cy, qr - (qr > 30 ? 4.5 : 2.5), 0.05, ph, st);
    if (qr > 22) {
      c.globalAlpha = 0.8; c.fillStyle = CORE[tint];
      this.wipeBlob(c, cx + qr * 0.06, cy + qr * 0.09, qr - 7, 0.05, ph, st);
    }
    if (qr > 10) {
      c.globalAlpha = 0.6; c.fillStyle = '#ffffff';
      this.wipeBlob(c, Math.round(cx - qr * 0.44), Math.round(cy - qr * 0.44), Math.max(2, qr * 0.15), 0.12, ph, 1);
      c.globalAlpha = 0.98;
      this.wipeBlob(c, Math.round(cx - qr * 0.3), Math.round(cy - qr * 0.58), Math.max(1, qr * 0.06), 0, 0, 1);
      c.globalAlpha = 0.5;
      this.wipeBlob(c, Math.round(cx + qr * 0.34), Math.round(cy + qr * 0.46), Math.max(1, qr * 0.05), 0, 0, 1);
    }
    this.wipe.cache.set(key, sp);
    return sp;
  }
  // Where a bubble is and how big, at a given point in the wipe. It boils up
  // from below into its slot, sits there holding the frame shut, then swells
  // away. While it holds, it stays put bar a small bob -- the coverage margin
  // in beginWipe is what that bob is allowed to spend.
  wipeAt(b, k) {
    let s, off;
    if (k < b.inT) { s = 0; off = b.launch; }
    else if (k < b.inT + 0.16) {
      const u = (k - b.inT) / 0.16;
      s = u * u * (3 - 2 * u);
      off = b.launch * (1 - u) * (1 - u);
    } else if (k < b.outT) { s = 1; off = 0; }
    else {
      const u = clamp((k - b.outT) / 0.26, 0, 1);
      // a burst goes almost at once; the rest thin out and drift off
      s = b.pop ? 1 - Math.pow(u, 0.35) : 1 - u * u * (3 - 2 * u);
      off = -u * b.rise;
    }
    return {
      s,
      x: b.x + Math.sin(b.wob + k * b.spin * 5) * 4 + b.drift * Math.max(0, k - b.outT),
      y: b.y + off + Math.sin(b.wob * 1.7 + k * b.spin * 4) * 3,
      r: b.r * s,
    };
  }
  drawWipe() {
    const w = this.wipe; if (w.t <= 0 || !w.snap) return;
    const k = clamp(1 - w.t / w.dur, 0, 1);
    const S = HUD_SCALE;
    // The scene underneath flips at the midpoint, when the bubbles have the
    // frame completely covered, so the cut itself is never on screen. Before
    // that the old scene is showing; after it, the new one already is.
    if (k < 0.5) { this.full(this.ctx); this.ctx.drawImage(w.snap, 0, 0); }

    const c = w.bctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 640, 360);
    // Coverage alone is not enough -- soap thin enough to see the old scene
    // through would show the swap as a ghost. So the foam thickens as it
    // closes over the frame and thins again once it is past.
    const dense = 1 - clamp(Math.abs(k - 0.5) / 0.22, 0, 1);
    // and a breath of soap under the lot, for the hairline where two bubble
    // rims meet exactly
    if (dense > 0) {
      c.globalAlpha = dense * dense * dense;
      c.fillStyle = '#cfeeff';
      c.fillRect(0, 0, 640, 360);
      c.globalAlpha = 1;
    }
    // Each bubble is four hard-edged discs: a dark rim, a lit rim shifted
    // up-left so the light lands on one side, the body, and a brighter core.
    // Drawn as discs rather than a sampled outline the rim comes out solid --
    // sampling a circumference this long left it dotted -- and the shading is
    // what lets one bubble read against the next once the screen is all soap.
    // One blit each. Drawn live this was fifty thousand fillRects a frame and
    // the transition ran at half speed, so a bubble's face is rasterised once
    // per size and tint and then stamped; the body is baked opaque and the
    // glass comes from the alpha it is stamped with, which is also what shuts
    // the frame at the midpoint.
    const alpha = 0.78 + 0.22 * dense;
    for (const b of w.bubbles) {
      const p = this.wipeAt(b, k); if (p.s <= 0.02 || p.r < 1.5) continue;
      const qr = p.r < 16 ? Math.ceil(p.r) : Math.ceil(p.r / 4) * 4;
      const sp = this.bubbleSprite(qr, b.tint);
      const d = sp.width * (p.r / qr);
      c.globalAlpha = alpha * Math.min(1, p.s * 1.6);
      c.drawImage(sp, Math.round(p.x - d / 2), Math.round(p.y - d / 2), Math.round(d), Math.round(d));
    }
    c.globalAlpha = 1;
    // the ones that have just gone throw a ring of droplets
    for (const b of w.bubbles) {
      const pk = (k - b.outT) / 0.26;
      if (pk <= (b.pop ? 0.06 : 0.5) || pk >= 1.2) continue;
      const p = this.wipeAt(b, b.outT);
      const u = clamp((pk - (b.pop ? 0.06 : 0.5)) / 0.7, 0, 1);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + b.wob;
        const d = b.r * (0.8 + u * 0.7);
        c.fillStyle = `rgba(236,252,255,${(0.75 * (1 - u)).toFixed(2)})`;
        c.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), 2, 2);
      }
    }
    this.hud(this.ctx);
    this.ctx.drawImage(w.buf, 0, 0);
    this.full(this.ctx);
  }

  // The end card. It lived in scenes.js and was deleted there in a refactor
  // without game.js being told, so winning or dying threw instead of drawing
  // anything. It lives here now, beside the two states that call it, and is
  // cut down to the three numbers actually worth reading.
  drawEndScreen(ctx, t, win) {
    ctx.fillStyle = win ? 'rgba(6,26,20,0.88)' : 'rgba(30,5,10,0.88)';
    ctx.fillRect(0, 0, 640, 360);
    const s = this.stats || {};
    UIKit.ribbon(ctx, 320, 30, win ? 'NO SURVIVORS' : 'DEAD IN THE WATER', win ? 'gold' : 'dark');
    const rows = [
      ['Hulls sunk', (s.kills | 0) + ''],
      ['Time', fmtTime((this.director && this.director.time) || 0)],
      ['Plunder', (s.scrapCollected | 0) + ''],
    ];
    UIKit.panel(ctx, 190, 96, 260, 106, 'dark');
    rows.forEach(([k, v], i) => {
      const y = 112 + i * 30;
      pixelText(ctx, k, 316, y + 1, 7, '#9ab0c0', 'right');
      pixelTextOutlined(ctx, v, 332, y, 9, '#ffffff', '#14141c', 'left');
    });
    const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
    pixelTextOutlined(ctx, touch ? 'TAP TO GO AGAIN' : '[R] AGAIN    [TAB] SKILL TREE    [ESC] TITLE',
      320, 288, 9, Math.floor(t * 2) % 2 ? '#ffffff' : '#ffe48f', '#14141c', 'center');
  }

  blit() {
    if (this.wipe.t > 0) this.drawWipe();
    this.dctx.imageSmoothingEnabled = false;
    this.dctx.setTransform(1, 0, 0, 1, 0, 0);
    this.dctx.drawImage(this.g, 0, 0, this.display.width, this.display.height);
  }
  // everything that is not the world draws in 640x360 logical units
  hud(ctx) { ctx.setTransform(HUD_SCALE, 0, 0, HUD_SCALE, 0, 0); }
  full(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); }
}
window.addEventListener('load', () => { window.game = new Game(); });
