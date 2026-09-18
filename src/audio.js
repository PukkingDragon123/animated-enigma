// ---- Tiny procedural synth so the ocean isn't silent ---------------------
const Audio_ = {
  ctx: null, master: null, enabled: true, muted: false,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  noiseBuf: null,
  getNoise() {
    if (this.noiseBuf) return this.noiseBuf;
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this.noiseBuf = buf;
  },
  tone(freq, dur, type = 'square', vol = 0.2, slide = 0) {
    if (!this.enabled || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, lp = 2000, hp = 100) {
    if (!this.enabled || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.getNoise();
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(f2); f2.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  },
  shot(kind) {
    switch (kind) {
      case 'revolver': this.noise(0.12, 0.35, 3000, 400); this.tone(180, 0.08, 'square', 0.15, -120); break;
      case 'shotgun': this.noise(0.25, 0.5, 1800, 150); this.tone(90, 0.15, 'sawtooth', 0.2, -60); break;
      case 'rifle': this.noise(0.18, 0.4, 5000, 800); this.tone(400, 0.1, 'square', 0.12, -300); break;
      case 'smg': this.noise(0.06, 0.2, 4000, 600); break;
      case 'harpoon': this.tone(600, 0.2, 'sawtooth', 0.15, -500); this.noise(0.1, 0.2, 2500, 300); break;
      case 'grenade': this.tone(120, 0.2, 'square', 0.2, 80); break;
      case 'flak': this.noise(0.2, 0.4, 2200, 200); this.tone(140, 0.12, 'square', 0.2, -80); break;
      default: this.noise(0.1, 0.3, 3000, 300);
    }
  },
  explosion(size = 1) { this.noise(0.5 * size, 0.6, 900, 40); this.tone(60, 0.4 * size, 'sine', 0.4, -40); },
  splash(size = 1) { this.noise(0.25 * size, 0.25 * size, 1500, 300); },
  hit() { this.tone(220, 0.08, 'square', 0.15, -100); },
  hurt() { this.tone(160, 0.25, 'sawtooth', 0.3, -100); this.noise(0.2, 0.3, 800, 100); },
  absorb() { this.tone(500, 0.15, 'sine', 0.3, 700); this.tone(800, 0.2, 'triangle', 0.2, 400); },
  pickup(i) { this.tone(500 + i * 120, 0.08, 'square', 0.12, 300); },
  roll() { this.noise(0.3, 0.3, 1200, 200); this.tone(200, 0.2, 'sine', 0.15, 150); },
  rampage() { for (let i = 0; i < 4; i++) setTimeout(() => this.tone(300 + i * 150, 0.2, 'square', 0.25, 200), i * 90); },
  buy() { this.tone(660, 0.1, 'square', 0.15); setTimeout(() => this.tone(990, 0.15, 'square', 0.15), 90); },
  deny() { this.tone(160, 0.15, 'square', 0.15, -60); },
  stun() { this.noise(0.4, 0.6, 700, 60); this.tone(80, 0.5, 'sawtooth', 0.3, -50); },
  roar() { this.tone(90, 0.8, 'sawtooth', 0.35, 40); this.noise(0.6, 0.3, 500, 60); },
};
