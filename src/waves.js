// ---- Spawn director: discrete, clearable waves --------------------------
// You must FINISH a wave before the skill tree opens. Between waves the ocean
// goes quiet, you spend your salvage, then you call the next one in.
//
// Every wave carries an OBJECTIVE. Most of them are "sink the lot", but some
// ask for something else: hunt one boat down, hold the water for a count, or
// come back with salvage. The objective is what the wave is really about and
// it is on screen the whole time.
const WAVES = [
  { sub: 'Two dinghies leave the pier. Hold to shoot',
    obj: { kind: 'clear', text: 'Hold to shoot. Sink the two dinghies' },
    pool: { dinghy: 1 }, count: 4, interval: 3.0, max: 2, burst: [['dinghy', 2]] },

  { sub: 'A few more. Roll out of the way',
    obj: { kind: 'clear', text: 'Sink them. Roll to get clear' },
    pool: { dinghy: 1 }, count: 6, interval: 2.6, max: 3, burst: [['dinghy', 2]] },

  { sub: 'Net boats. Raise the parry to catch one',
    obj: { kind: 'clear', text: 'Parry the nets, then sink them' },
    pool: { dinghy: 1.6, netter: 1.2 }, count: 8, interval: 2.4, max: 4, burst: [['netter', 2]] },

  { sub: 'Harpooners keep their distance',
    obj: { kind: 'clear', text: 'Close on the harpooners and sink them' },
    pool: { dinghy: 1.6, netter: 1, harpooner: 1.2 }, count: 10, interval: 2.2, max: 5, burst: [['harpooner', 2]] },

  { sub: 'A spotter is painting you for the fleet',
    obj: { kind: 'hunt', target: 'spotter', text: 'Kill the Spotter before it calls the fleet in' },
    pool: { dinghy: 1.4, netter: 1, harpooner: 1, spotter: 0.9 }, count: 11, interval: 2.0, max: 5, burst: [['spotter', 1], ['dinghy', 2]] },

  { sub: 'Speedboats on strafing runs',
    obj: { kind: 'clear', text: 'Sink the strafing runs' },
    pool: { dinghy: 1.2, netter: 1, harpooner: 1, speedboat: 1.5, spotter: 0.4, stalker: 0.7 }, count: 13, interval: 1.8, max: 6, burst: [['speedboat', 3]] },

  { sub: 'Something big is coming out of the harbour',
    obj: { kind: 'hunt', mini: true, text: 'Put the harbour rig on the bottom' },
    mini: true,
    pool: { dinghy: 1, netter: 1, harpooner: 1, speedboat: 1, crabber: 1.1, tender: 0.7 }, count: 12, interval: 1.7, max: 7 },

  { sub: 'Jetski bombers. Roll away from them',
    obj: { kind: 'survive', seconds: 45, text: 'Hold this water for 45 seconds' },
    pool: { dinghy: 1, netter: 1, harpooner: 1, speedboat: 1, jetski: 2.0, longliner: 1, minelayer: 0.8 }, count: 16, interval: 1.5, max: 8, burst: [['jetski', 3]] },

  { sub: 'Longliners and crab pots. Watch the water',
    obj: { kind: 'clear', text: 'Clear the hooks and the pots out of the bay' },
    pool: { netter: 1, harpooner: 1, longliner: 1.6, crabber: 1.5, jetski: 0.8, twin: 0.9, sub: 0.7 }, count: 16, interval: 1.5, max: 8, burst: [['longliner', 2], ['crabber', 2]] },

  { sub: 'Dynamite skiffs. Parry the sticks',
    obj: { kind: 'salvage', amount: 30, text: 'Strip 30 pieces of salvage out of them' },
    pool: { netter: 1, harpooner: 1, speedboat: 1, jetski: 1, dynaboat: 1.8, tug: 0.7, grappler: 0.8, courier: 0.5 }, count: 17, interval: 1.45, max: 8, burst: [['dynaboat', 3]] },

  { sub: 'The Trawler',
    obj: { kind: 'hunt', target: 'trawler', text: 'Sink the Trawler' },
    pool: { dinghy: 1, netter: 1, harpooner: 1, speedboat: 1, jetski: 1, dynaboat: 1, tug: 0.8, trawler: 0.5, ironclad: 0.5, sub: 0.6 },
    count: 18, interval: 1.4, max: 9, burst: [['trawler', 1], ['dinghy', 3]] },

  { sub: 'The harbour sends its own',
    obj: { kind: 'hunt', mini: true, text: 'Break whatever they just let off the chain' },
    mini: true,
    pool: { harpooner: 1, speedboat: 1, jetski: 1, dynaboat: 1, crabber: 1, tug: 1, bulwark: 0.6, minelayer: 0.7 }, count: 15, interval: 1.5, max: 8 },

  { sub: 'Gunboats out of the harbour',
    obj: { kind: 'clear', text: 'Sink the gunboats' },
    pool: { netter: 1, harpooner: 1.2, speedboat: 1, jetski: 1, dynaboat: 1, trawler: 0.4, gunboat: 0.8, tug: 0.7, ironclad: 0.7, grappler: 0.7, bulwark: 0.5 },
    count: 19, interval: 1.35, max: 9, burst: [['gunboat', 2], ['speedboat', 2]] },

  { sub: 'The whole fleet is awake now',
    obj: { kind: 'clear', text: 'Sink all of it' },
    pool: { netter: 1, harpooner: 1.2, speedboat: 1.2, jetski: 1.4, dynaboat: 1.2, longliner: 1, crabber: 1, trawler: 0.5, gunboat: 0.9, sub: 0.8, twin: 0.8, dredger: 0.5, tender: 0.6, stalker: 0.6 },
    count: 21, interval: 1.3, max: 10, burst: [['jetski', 4], ['gunboat', 2]] },

  { sub: 'Everything they have left',
    obj: { kind: 'hunt', mini: true, text: 'Clear the way to the Chief' },
    mini: true,
    pool: { speedboat: 1.3, jetski: 1.5, dynaboat: 1.3, tug: 1, trawler: 0.8, gunboat: 1.1, dredger: 0.7, ironclad: 0.9, bulwark: 0.7, courier: 0.5, grappler: 0.6 },
    count: 20, interval: 1.3, max: 10, burst: [['gunboat', 2]] },

  { name: 'THE VILLAGE CHIEF', sub: 'He rides a shark. Bait his charge into the rocks',
    obj: { kind: 'boss', text: 'Bait the Chief into the rocks, then hit him while he is down' },
    boss: true, pool: { jetski: 1, dinghy: 1 }, count: 999, interval: 6.0, max: 3 },
];

class Director {
  constructor() {
    this.time = 0; this.waveIdx = -1; this.spawnT = 0;
    this.started = false; this.bossSpawned = false;
    this.state = 'idle';        // idle | fighting | cleared
    this.remaining = 0; this.clearedAt = 0; this.wavesCleared = 0;
    // objective bookkeeping, reset at the top of every wave
    this.objT = 0; this.objSalvage = 0; this.objTarget = null; this.objDone = false;
  }
  // enemies get tougher every wave; hazards read this too. The curve is gentler
  // than it was: the fleet gets more varied faster than it gets deadlier.
  get difficulty() { return 1 + Math.max(0, this.waveIdx) * 0.065; }
  currentWave() { return WAVES[clamp(this.waveIdx, 0, WAVES.length - 1)]; }
  // the list is numbered by position, so inserting a wave can never desync it
  waveName(i) { const w = WAVES[i]; return w && w.name ? w.name : 'WAVE ' + (i + 1); }
  get isBossWave() { return !!this.currentWave().boss; }
  get cleared() { return this.state === 'cleared'; }
  get lastWave() { return this.waveIdx >= WAVES.length - 1; }
  get objective() { return this.currentWave().obj || null; }

  begin() { this.started = true; this.startWave(0); }

  startWave(i) {
    this.waveIdx = i;
    const w = WAVES[i]; if (!w) return;
    this.state = 'fighting';
    this.remaining = w.count;
    this.spawnT = 1.2;
    this.objT = 0; this.objSalvage = 0; this.objTarget = null; this.objDone = false;
    G.banner(this.waveName(i), w.boss ? '#ff6161' : '#ffe48f', 2.4, w.sub);
    if (typeof Hazards !== 'undefined') {
      Hazards.difficulty = this.difficulty;
      if (Hazards.applyWaveScaling) Hazards.applyWaveScaling(this.waveIdx, this.difficulty);
    }
    if (w.burst) for (const [type, n] of w.burst) { this.spawnBurst(type, n); this.remaining -= n; }
    if (w.mini) this.spawnMini();
    if (w.boss && !this.bossSpawned) { this.bossSpawned = true; G.spawnBoss(); }
  }

  // a named encounter in the middle of an ordinary wave
  spawnMini() {
    if (typeof G.spawnMiniBoss !== 'function') return;
    const pos = this.spawnPos();
    const m = G.spawnMiniBoss(null, pos.x, pos.y, this.difficulty);
    if (m) this.objTarget = m;
  }

  next() {
    if (this.state !== 'cleared') return false;
    if (this.lastWave) return false;
    this.startWave(this.waveIdx + 1);
    return true;
  }

  // ---- objectives --------------------------------------------------------
  // What the player is being asked for, and how far along they are. Returns
  // null on a plain "sink everything" wave that has nothing extra to say.
  objectiveStatus() {
    const w = this.currentWave(), o = w && w.obj; if (!o) return null;
    switch (o.kind) {
      case 'survive': {
        const left = Math.max(0, o.seconds - this.objT);
        return { text: o.text, value: left > 0 ? Math.ceil(left) + 's left' : 'HELD', done: left <= 0, frac: 1 - left / o.seconds };
      }
      case 'salvage':
        return { text: o.text, value: Math.min(o.amount, this.objSalvage) + '/' + o.amount, done: this.objSalvage >= o.amount, frac: Math.min(1, this.objSalvage / o.amount) };
      case 'hunt': {
        const t = this.objTarget;
        const alive = t && !t.dead;
        const label = t && (t.displayName || t.name || (t.cfg && t.cfg.name)) || 'the target';
        return { text: o.text, value: alive ? label : 'DOWN', done: !alive && !!t, frac: alive && t.maxHp ? 1 - t.hp / t.maxHp : (t ? 1 : 0) };
      }
      case 'boss': {
        const b = G.boss;
        return { text: o.text, value: b && !b.dead ? (b.name || 'THE BOSS') : 'DOWN', done: !!(b && b.dead), frac: b && b.maxHp ? 1 - b.hp / b.maxHp : 0 };
      }
      default: {
        const total = this.currentWave().count;
        const left = this.remaining + G.enemies.length;
        return { text: o.text, value: left + ' left', done: left <= 0, frac: total ? 1 - left / total : 0 };
      }
    }
  }
  // the player collected scrap; a salvage objective counts it
  onSalvage(n) { this.objSalvage += n; }
  // a hunt wave latches onto the first of its named type to show up
  noteSpawn(type, e) {
    const o = this.objective;
    if (o && o.kind === 'hunt' && o.target === type && !this.objTarget) this.objTarget = e;
  }

  update(dt) {
    if (!this.started) return;
    this.time += dt;
    if (this.state !== 'fighting') return;
    const w = this.currentWave(); if (!w) return;
    this.objT += dt;
    const alive = G.enemies.length;

    if (w.boss) {
      // the boss wave ends with the Chief, not with a body count; once he is
      // down the escort stops arriving so the fight can actually finish
      if (G.boss && G.boss.dead) return;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && alive < w.max) { this.spawnT = w.interval * rand(0.7, 1.3); this.spawnOne(w); }
      return;
    }

    // a timed or collected objective ends the wave on its own terms: the boats
    // still out there scatter rather than having to be hunted down one by one
    const st = this.objectiveStatus();
    if (st && st.done && (w.obj.kind === 'survive' || w.obj.kind === 'salvage' || w.obj.kind === 'hunt')) {
      this.remaining = 0;
      if (alive === 0) { this.clear(); return; }
      if (!this.objDone) {
        this.objDone = true;
        G.banner('OBJECTIVE COMPLETE', '#6fd88e', 1.8, 'They are breaking off');
        for (const e of G.enemies) if (!e.dead) e.retreatT = 99;
      }
      return;
    }

    if (this.remaining > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && alive < w.max) {
        this.spawnT = w.interval * rand(0.75, 1.25);
        this.spawnOne(w); this.remaining--;
      }
    } else if (alive === 0) {
      this.clear();
    }
  }

  clear() {
    this.state = 'cleared'; this.clearedAt = this.time; this.wavesCleared++;
    G.onWaveCleared(this.waveIdx);
  }

  spawnOne(w) {
    const pos = this.spawnPos();
    const type = this.pickType(w.pool);
    const e = G.spawnEnemy(type, pos.x, pos.y);
    this.noteSpawn(type, e);
  }
  pickType(pool) { let tot = 0; for (const k in pool) tot += pool[k]; let r = Math.random() * tot; for (const k in pool) { r -= pool[k]; if (r <= 0) return k; } return Object.keys(pool)[0]; }
  spawnPos() {
    const p = G.player;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU), r = rand(300, 380);
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (x > 30 && x < G.ocean.W - 30 && y > WATER_TOP && y < G.ocean.H - 30) return { x, y };
    }
    return { x: clamp(p.x + 320, 30, G.ocean.W - 30), y: clamp(p.y, WATER_TOP + 20, G.ocean.H - 30) };
  }
  spawnBurst(type, n) {
    const base = rand(0, TAU), p = G.player;
    for (let i = 0; i < n; i++) {
      const a = base + (i - n / 2) * 0.25, r = 340;
      const x = clamp(p.x + Math.cos(a) * r, 30, G.ocean.W - 30);
      const y = clamp(p.y + Math.sin(a) * r, WATER_TOP + 20, G.ocean.H - 30);
      this.noteSpawn(type, G.spawnEnemy(type, x, y));
    }
  }
}
