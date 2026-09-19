// ---- Spawn director: discrete, clearable waves --------------------------
// You must WIPE OUT a wave before the upgrade screen opens. Between waves the
// ocean goes quiet, you spend your salvage, then you call the next one in.
const WAVES = [
  { name: 'WAVE 1',  sub: 'Fishing dinghies leave the pier',            pool: { dinghy: 1 },                                                        count: 8,  interval: 1.5, max: 5,  burst: [['dinghy', 3]] },
  { name: 'WAVE 2',  sub: 'Net boats. Absorb the nets [E / right-click]', pool: { dinghy: 2, netter: 1.4 },                                          count: 11, interval: 1.4, max: 6,  burst: [['netter', 3]] },
  { name: 'WAVE 3',  sub: 'Harpooners keep their distance',             pool: { dinghy: 1.6, netter: 1, harpooner: 1.4 },                           count: 13, interval: 1.3, max: 7,  burst: [['harpooner', 3]] },
  { name: 'WAVE 4',  sub: 'Speedboats on strafing runs',                pool: { dinghy: 1.2, netter: 1, harpooner: 1, speedboat: 1.5 },             count: 15, interval: 1.2, max: 8,  burst: [['speedboat', 4]] },
  { name: 'WAVE 5',  sub: 'Jetski bombers. Roll away from them',        pool: { dinghy: 1, netter: 1, harpooner: 1, speedboat: 1, jetski: 2.2 },    count: 17, interval: 1.1, max: 9,  burst: [['jetski', 5]] },
  { name: 'WAVE 6',  sub: 'Dynamite skiffs. Absorb the sticks',         pool: { netter: 1, harpooner: 1, speedboat: 1, jetski: 1, dynaboat: 1.8 },  count: 18, interval: 1.05, max: 9, burst: [['dynaboat', 4]] },
  { name: 'WAVE 7',  sub: 'The Trawler',                                pool: { dinghy: 1, netter: 1, harpooner: 1, speedboat: 1, jetski: 1, dynaboat: 1, trawler: 0.5 }, count: 20, interval: 1.0, max: 10, burst: [['trawler', 1], ['dinghy', 4]] },
  { name: 'WAVE 8',  sub: 'Gunboats out of the harbour',                pool: { netter: 1, harpooner: 1.2, speedboat: 1, jetski: 1, dynaboat: 1, trawler: 0.4, gunboat: 0.8 }, count: 22, interval: 0.95, max: 11, burst: [['gunboat', 2], ['speedboat', 3]] },
  { name: 'WAVE 9',  sub: 'The whole fleet is awake now',               pool: { netter: 1, harpooner: 1.2, speedboat: 1.2, jetski: 1.4, dynaboat: 1.2, trawler: 0.5, gunboat: 0.9 }, count: 25, interval: 0.9, max: 12, burst: [['jetski', 5], ['gunboat', 2]] },
  { name: 'WAVE 10', sub: 'They are not holding anything back',         pool: { harpooner: 1.2, speedboat: 1.3, jetski: 1.4, dynaboat: 1.3, trawler: 0.7, gunboat: 1.1 }, count: 28, interval: 0.85, max: 13, burst: [['trawler', 2], ['gunboat', 3]] },
  { name: 'WAVE 11', sub: 'Everything they have left',                  pool: { speedboat: 1.3, jetski: 1.5, dynaboat: 1.3, trawler: 0.8, gunboat: 1.3 }, count: 32, interval: 0.8, max: 14, burst: [['gunboat', 3], ['dynaboat', 4]] },
  { name: 'THE VILLAGE CHIEF', sub: 'He rides a shark. Bait his charge into the rocks', boss: true, pool: { jetski: 1, dinghy: 1 }, count: 999, interval: 5.0, max: 4 },
];

class Director {
  constructor() {
    this.time = 0; this.waveIdx = -1; this.spawnT = 0;
    this.started = false; this.bossSpawned = false;
    this.state = 'idle';        // idle | fighting | cleared
    this.remaining = 0; this.clearedAt = 0; this.wavesCleared = 0;
  }
  // enemies get tougher every wave; hazards read this too
  get difficulty() { return 1 + Math.max(0, this.waveIdx) * 0.09; }
  currentWave() { return WAVES[clamp(this.waveIdx, 0, WAVES.length - 1)]; }
  get isBossWave() { return !!this.currentWave().boss; }
  get cleared() { return this.state === 'cleared'; }
  get lastWave() { return this.waveIdx >= WAVES.length - 1; }

  begin() { this.started = true; this.startWave(0); }

  startWave(i) {
    this.waveIdx = i;
    const w = WAVES[i]; if (!w) return;
    this.state = 'fighting';
    this.remaining = w.count;
    this.spawnT = 0.8;
    G.banner(w.name, w.boss ? '#ff6161' : '#ffe48f', 2.4, w.sub);
    if (typeof Hazards !== 'undefined') {
      Hazards.difficulty = this.difficulty;
      if (Hazards.applyWaveScaling) Hazards.applyWaveScaling(this.waveIdx, this.difficulty);
    }
    if (w.burst) for (const [type, n] of w.burst) { this.spawnBurst(type, n); this.remaining -= n; }
    if (w.boss && !this.bossSpawned) { this.bossSpawned = true; G.spawnBoss(); }
  }

  next() {
    if (this.state !== 'cleared') return false;
    if (this.lastWave) return false;
    this.startWave(this.waveIdx + 1);
    return true;
  }

  update(dt) {
    if (!this.started) return;
    this.time += dt;
    if (this.state !== 'fighting') return;
    const w = this.currentWave(); if (!w) return;
    const alive = G.enemies.length;

    if (w.boss) {
      // the boss wave ends with the Chief, not with a body count; once he is
      // down the escort stops arriving so the fight can actually finish
      if (G.boss && G.boss.dead) return;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && alive < w.max) { this.spawnT = w.interval * rand(0.7, 1.3); this.spawnOne(w); }
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

  spawnOne(w) { const pos = this.spawnPos(); G.spawnEnemy(this.pickType(w.pool), pos.x, pos.y); }
  pickType(pool) { let tot = 0; for (const k in pool) tot += pool[k]; let r = Math.random() * tot; for (const k in pool) { r -= pool[k]; if (r <= 0) return k; } return Object.keys(pool)[0]; }
  spawnPos() {
    const p = G.player;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU), r = rand(270, 340);
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (x > 30 && x < G.ocean.W - 30 && y > G.ocean.shoreY + 10 && y < G.ocean.H - 30) return { x, y };
    }
    return { x: clamp(p.x + 300, 30, G.ocean.W - 30), y: clamp(p.y, G.ocean.shoreY + 40, G.ocean.H - 30) };
  }
  spawnBurst(type, n) {
    const base = rand(0, TAU), p = G.player;
    for (let i = 0; i < n; i++) {
      const a = base + (i - n / 2) * 0.25, r = 310;
      const x = clamp(p.x + Math.cos(a) * r, 30, G.ocean.W - 30);
      const y = clamp(p.y + Math.sin(a) * r, G.ocean.shoreY + 20, G.ocean.H - 30);
      G.spawnEnemy(type, x, y);
    }
  }
}
