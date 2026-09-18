// ---- Spawn director: timed waves in Fisher Village -----------------------
const WAVES = [
  { t: 0, name: 'WAVE 1', sub: 'Fishing dinghies leave the pier', pool: { dinghy: 1 }, interval: 1.9, max: 6, burst: [['dinghy', 4]] },
  { t: 38, name: 'WAVE 2', sub: 'Net boats: absorb the nets! (E / Right-click)', pool: { dinghy: 2, netter: 1 }, interval: 1.7, max: 8, burst: [['netter', 3]] },
  { t: 78, name: 'WAVE 3', sub: 'Harpooners keep their distance', pool: { dinghy: 2, netter: 1, harpooner: 1.2 }, interval: 1.6, max: 9, burst: [['harpooner', 3]] },
  { t: 118, name: 'WAVE 4', sub: 'Speedboats on strafing runs', pool: { dinghy: 1.5, netter: 1, harpooner: 1, speedboat: 1.2 }, interval: 1.5, max: 10, burst: [['speedboat', 3]] },
  { t: 158, name: 'WAVE 5', sub: 'Jetski bombers! Roll away from them', pool: { dinghy: 1, netter: 1, harpooner: 1, speedboat: 1, jetski: 2 }, interval: 1.25, max: 12, burst: [['jetski', 5]] },
  { t: 198, name: 'WAVE 6', sub: 'Dynamite skiffs: absorb the dynamite', pool: { dinghy: 1, netter: 1, harpooner: 1, speedboat: 1, jetski: 1, dynaboat: 1.2 }, interval: 1.25, max: 12, burst: [['dynaboat', 3]] },
  { t: 238, name: 'WAVE 7', sub: 'The Trawler', pool: { dinghy: 1, netter: 1, harpooner: 1, speedboat: 1, jetski: 1, dynaboat: 1, trawler: 0.35 }, interval: 1.15, max: 13, burst: [['trawler', 1], ['dinghy', 4]] },
  { t: 280, name: 'WAVE 8', sub: 'Gunboats from the harbour', pool: { dinghy: 0.6, netter: 1, harpooner: 1, speedboat: 1, jetski: 1, dynaboat: 1, trawler: 0.4, gunboat: 0.5 }, interval: 1.05, max: 14, burst: [['gunboat', 2], ['speedboat', 2]] },
  { t: 322, boss: true, name: 'THE VILLAGE CHIEF', sub: 'He rides a shark. Bait his charge into the rocks!', pool: { dinghy: 1, jetski: 1 }, interval: 4.5, max: 4 },
];
class Director {
  constructor() { this.time = 0; this.waveIdx = -1; this.spawnT = 2; this.started = false; this.bossSpawned = false; }
  update(dt) {
    if (!this.started) return;
    this.time += dt;
    // advance wave
    while (this.waveIdx + 1 < WAVES.length && this.time >= WAVES[this.waveIdx + 1].t) {
      this.waveIdx++;
      const w = WAVES[this.waveIdx];
      G.banner(w.name, w.boss ? '#ff6161' : '#ffe48f', 2.4, w.sub);
      if (w.burst) for (const [type, n] of w.burst) this.spawnBurst(type, n);
      if (w.boss && !this.bossSpawned) { this.bossSpawned = true; G.spawnBoss(); }
    }
    const w = WAVES[Math.max(0, this.waveIdx)];
    if (!w) return;
    this.spawnT -= dt;
    const alive = G.enemies.filter(e => !e.dead).length;
    if (this.spawnT <= 0 && alive < w.max) {
      this.spawnT = w.interval * rand(0.7, 1.3);
      const type = this.pickType(w.pool);
      const pos = this.spawnPos();
      G.spawnEnemy(type, pos.x, pos.y);
    }
  }
  pickType(pool) { let tot = 0; for (const k in pool) tot += pool[k]; let r = Math.random() * tot; for (const k in pool) { r -= pool[k]; if (r <= 0) return k; } return Object.keys(pool)[0]; }
  spawnPos() {
    const p = G.player;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU), r = rand(400, 480);
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (x > 30 && x < G.ocean.W - 30 && y > G.ocean.shoreY + 10 && y < G.ocean.H - 30) return { x, y };
    }
    return { x: clamp(p.x + 450, 30, G.ocean.W - 30), y: clamp(p.y, G.ocean.shoreY + 40, G.ocean.H - 30) };
  }
  spawnBurst(type, n) {
    const base = rand(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = base + (i - n / 2) * 0.25, r = 440;
      const p = G.player;
      const x = clamp(p.x + Math.cos(a) * r, 30, G.ocean.W - 30), y = clamp(p.y + Math.sin(a) * r, G.ocean.shoreY + 20, G.ocean.H - 30);
      G.spawnEnemy(type, x, y);
    }
  }
  currentWave() { return WAVES[Math.max(0, this.waveIdx)]; }
}
