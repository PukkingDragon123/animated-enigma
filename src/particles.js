// ---- Particles, explosions, floating text ------------------------------

// ======================================================================
//  GORE
//  The fleet is crewed, and this is what comes out of it: chunks, bone,
//  bodies, a red mist and water that stays fouled long after the boat has
//  gone down.
//
//  EVERYTHING HERE IS ON ONE BUDGET. A bucket refills at a fixed rate and
//  every burst spends from it, so the first boat to go up in a wave gets
//  the full treatment and the fifth one in the same second gets a shorter
//  one. That is what keeps a screen full of dying pirates costing about
//  what a single kill costs -- the alternative is a particle system that
//  looks magnificent for four frames and then drops the game to 30fps.
//
//  Drawing rules are the rest of the file's rules: integer coordinates,
//  posterized bands, hard edges. A chunk TUMBLES BY CHANGING SHAPE rather
//  than by rotating, because ctx.rotate on a three-pixel block is a smear.
// ======================================================================
const GORE_RED = ['#ff5a5a', '#e0322e', '#c8302e', '#9e1f22'];
const GORE_DARK = ['#7c1414', '#55090c', '#9e1f22'];
const GORE_BONE = ['#e8e4d8', '#c9c2ae'];
const GORE_COAT = ['#2a2f38', '#4a2f45', '#5a3a2a', '#3f4a58', '#6b6f4a'];
const GORE_SKIN = ['#e9b78c', '#c98d5e', '#8e5c37'];
const GOREC = {
  parts: 260,     // live chunks, bone and bodies. Hard cap.
  slicks: 16,     // lingering bleeds fouling the surface
  refill: 10,     // budget units a second
  cap: 24,        // and how much of it can be banked
  mist: 44,       // red haze particles alive at once
};
// a chunk's silhouette through one tumble, so it flips end over end on the
// pixel grid instead of being rotated into mush
const GIB_TUMBLE = [[2, 1], [1, 2], [2, 2], [1, 1]];

class Particles {
  constructor(ocean) {
    this.ocean = ocean; this.list = []; this.explosions = []; this.texts = []; this.max = 2600;
    // ---- the gore layer: its own arrays, its own caps, its own budget
    this.gibs = [];        // chunks, bone and bodies (they arc, land, float, sink)
    this.slicks = [];      // points that go on bleeding into the water
    this.gb = GOREC.cap;   // the bucket
    this.biteT = 0;        // how often we ask whether a shark has reached a body
    this.mistN = 0;        // red haze, counted so it cannot run away
    this.goreSfx = 0;
  }
  add(p) { if (this.list.length < this.max) this.list.push(p); }
  // water splash: droplets go up (z) and fall back, leaving foam
  splash(x, y, size = 1, color = null) {
    if (this.ocean.disturb) this.ocean.disturb(x, y, size * 1.6, 0, 0);
    const n = Math.round(8 * size + 4);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(20, 90) * size;
      this.add({ type: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, z: 0, vz: rand(60, 160) * Math.sqrt(size), life: 2, maxLife: 2, size: rand(1, 2.5) * Math.sqrt(size) | 0 || 1, color: color || (Math.random() < 0.3 ? '#8fd4ff' : '#eaf8ff') });
    }
    this.ocean.addFoam(x, y, 0.5 * size);
    for (let i = 0; i < 4 * size; i++) this.ocean.addFoam(x + rand(-12, 12) * size, y + rand(-12, 12) * size, 0.25);
    this.ocean.ripple(x, y, 20 + 18 * size, 40 + 20 * size);
    if (size > 1.5) this.ocean.ripple(x, y, 30 * size, 60, 0.4);
  }
  spray(x, y, ang, amount = 4, speed = 100) {
    for (let i = 0; i < amount; i++) {
      const a = ang + rand(-0.5, 0.5), sp = rand(0.4, 1) * speed;
      this.add({ type: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0, vz: rand(30, 90), life: 1.2, maxLife: 1.2, size: 1, color: '#eaf8ff' });
    }
  }
  // A gout, not a puff. The drops carry their own load of blood down with
  // them and each one stains the water where it lands, so a burst leaves a
  // scatter of hits the surface can spread outward instead of one dot.
  blood(x, y, amount = 1, ang = null) {
    const n = Math.round(7 * amount) + 1;
    for (let i = 0; i < n; i++) {
      const a = ang === null ? rand(0, TAU) : ang + rand(-0.7, 0.7), sp = rand(30, 145) * Math.sqrt(amount);
      this.add({ type: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0, vz: rand(40, 130), life: 2, maxLife: 2, size: (rand(1, 2) | 0 || 1) + (amount > 1 && i < 3 ? 1 : 0), color: pick(GORE_RED), amt: 0.42 * amount / n });
    }
    this.ocean.splatBlood(x, y, amount * 0.95, 14 + 16 * Math.min(2, amount));
  }
  debris(x, y, n = 8, colors = ['#b57d3f', '#8f5c2c', '#5c3a1c']) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(40, 170);
      this.add({ type: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0, vz: rand(80, 220), life: rand(2, 4), maxLife: 4, w: randi(2, 6), h: randi(1, 3), rot: rand(0, TAU), vr: rand(-8, 8), color: pick(colors) });
    }
  }
  smoke(x, y, n = 3, color = 'rgba(40,40,48,', size = 4) {
    for (let i = 0; i < n; i++) this.add({ type: 'smoke', x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-12, 12), vy: rand(-30, -10), life: rand(0.8, 1.6), maxLife: 1.6, size: rand(size * 0.6, size * 1.4), color });
  }
  fire(x, y, n = 4) {
    for (let i = 0; i < n; i++) this.add({ type: 'fire', x: x + rand(-5, 5), y: y + rand(-5, 5), vx: rand(-15, 15), vy: rand(-40, -15), life: rand(0.3, 0.7), maxLife: 0.7, size: rand(2, 5) });
  }
  sparks(x, y, n = 6, ang = null, spread = TAU) {
    for (let i = 0; i < n; i++) {
      const a = ang === null ? rand(0, TAU) : ang + rand(-spread / 2, spread / 2), sp = rand(80, 260);
      this.add({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.15, 0.4), maxLife: 0.4, color: pick(['#ffe48f', '#ffd27a', '#ffffff', '#ff9a3c']) });
    }
  }
  shell(x, y, ang) {
    this.add({ type: 'shell', x, y, vx: Math.cos(ang + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1)) * rand(20, 50), vy: rand(-10, 10), z: 0, vz: rand(40, 80), life: 1.2, maxLife: 1.2, rot: rand(0, TAU), vr: rand(-15, 15) });
  }
  bubbles(x, y, n = 3) {
    for (let i = 0; i < n; i++) this.add({ type: 'bubble', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-5, 5), vy: rand(-20, -8), life: rand(0.5, 1.2), maxLife: 1.2, size: randi(1, 2) });
  }
  explode(x, y, r = 30, opts = {}) {
    if (this.ocean.disturb) this.ocean.disturb(x, y, r / 8, 0, 0);
    this.explosions.push({ x, y, r: 2, maxR: r, life: 0, dur: 0.35 + r / 120, big: r > 40, water: opts.water !== false });
    this.fire(x, y, Math.round(r / 4));
    this.smoke(x, y, Math.round(r / 6), 'rgba(35,32,40,', r / 6);
    this.sparks(x, y, Math.round(r / 3));
    if (opts.debris) this.debris(x, y, opts.debris, opts.debrisColors);
    if (opts.water !== false) this.splash(x, y, Math.min(3, r / 25));
    if (opts.oil) this.ocean.addOil(x, y, opts.oil * 0.5);
    if (typeof Village !== 'undefined' && Village.built) Village.explode(x, y, r * 1.2, r * 0.9);
    if (typeof Wildlife !== 'undefined' && Wildlife.scare) Wildlife.scare(x, y, r * 3.2, 1);
    for (let i = 0; i < 5; i++) this.ocean.addFoam(x + rand(-r, r) * 0.5, y + rand(-r, r) * 0.5, 0.4);
    Audio_.explosion(Math.min(2, r / 30));
  }
  text(x, y, str, color = '#fff', size = 8) {
    if (this.texts.length < 60) this.texts.push({ x, y, str, color, size, life: 0.9, vy: -22 });
  }

  // ====================================================================
  //  GORE: the public calls
  // ====================================================================
  // The bucket. `cost` is roughly "one crewman's worth". Returns how much of
  // the burst the budget will actually pay for, never less than a quarter --
  // something always comes out, it is only ever a smaller something.
  goreScale(cost) {
    const s = this.gb / (cost > 0.001 ? cost : 0.001);
    this.gb = this.gb - cost; if (this.gb < 0) this.gb = 0;
    return s > 1 ? 1 : s < 0.22 ? 0.22 : s;
  }
  addGib(p) {
    const g = this.gibs;
    if (g.length >= GOREC.parts) {
      // the oldest thing already in the water makes way; anything still in
      // the air is mid-arc and is the part you are actually watching
      let i = 0; while (i < g.length && !g[i].rest) i++;
      g.splice(i < g.length ? i : 0, 1);
    }
    g.push(p);
  }
  goreSound(v) {
    if (this.goreSfx > 0) return;
    this.goreSfx = 0.07;
    try { Audio_.noise(0.13, 0.15 * v, 900, 140); Audio_.tone(70, 0.1, 'sawtooth', 0.09 * v, -30); } catch (e) { }
  }
  // A stain that arrives already spreading: a dense core and a scatter of
  // cells around it, so the water field has something to diffuse outward
  // instead of one hot dot that just fades.
  plume(x, y, amt, r) {
    const oc = this.ocean; if (!oc || !oc.addBlood) return;
    if (y < oc.shoreY + 4) {                    // it went over the rail onto land
      if (typeof Gore !== 'undefined' && Gore.splat) Gore.splat(x, y, Math.min(2, amt));
      return;
    }
    // Laid down cell by cell across the surface field rather than as one hot
    // dot, because the field diffuses what it is given: a dot fades, a disc
    // SPREADS. Dense in the middle, thin and dithered at the rim, and the
    // whole thing is a couple of dozen array writes.
    const c = oc.cell || 16;
    let R = Math.round(r / c); if (R < 1) R = 1; if (R > 5) R = 5;
    for (let gy = -R; gy <= R; gy++) for (let gx = -R; gx <= R; gx++) {
      const d2 = gx * gx + gy * gy;
      if (d2 > (R + 0.35) * (R + 0.35)) continue;
      const k = 1 - Math.sqrt(d2) / (R + 1);
      oc.addBlood(x + gx * c + rand(-4, 4), y + gy * c + rand(-4, 4), amt * (0.3 + 0.7 * k * k));
    }
  }
  // ...and it goes on bleeding. A body, or a hull with the crew still in it,
  // keeps fouling the water it drifts through, which is what makes the bay
  // read as a place where something happened rather than a place where
  // something flashed.
  bleed(x, y, amt, dur, spread) {
    const s = this.slicks;
    if (s.length >= GOREC.slicks) s.shift();
    s.push({ x, y, amt: amt, t: 0, dur: dur || 4, sp: spread || 16, next: 0 });
  }
  // the red haze off an opened body: hard dithered cells, never a soft blob
  mist(x, y, n, col) {
    if (this.mistN >= GOREC.mist) return;
    if (n > 10) n = 10;
    for (let i = 0; i < n; i++) {
      if (this.mistN >= GOREC.mist) break;
      this.mistN++;
      this.add({ type: 'mist', x: x + rand(-6, 6), y: y + rand(-4, 4), vx: rand(-18, 18), vy: rand(-14, 5),
        life: rand(0.25, 0.55), maxLife: 0.55, size: rand(3, 7), color: col || pick(GORE_RED) });
    }
  }
  // meat and bone, thrown
  gib(x, y, n, ang, opts) {
    opts = opts || {};
    const spread = opts.spread !== undefined ? opts.spread : 1.6;
    const speed = opts.speed || 110;
    if (n > 18) n = 18;
    for (let i = 0; i < n; i++) {
      const bone = Math.random() < 0.22;
      const a = (ang === undefined || ang === null) ? rand(0, TAU) : ang + rand(-spread / 2, spread / 2);
      const sp = rand(0.35, 1) * speed;
      this.addGib({
        kind: bone ? 1 : 0, x: x + rand(-3, 3), y: y + rand(-2, 2), z: rand(1, 6),
        vx: Math.cos(a) * sp + (opts.vx || 0), vy: Math.sin(a) * sp * 0.8 + (opts.vy || 0), vz: rand(50, 170),
        ph: rand(0, TAU), vr: rand(-12, 12), life: rand(1.6, 3.2),
        col: bone ? pick(GORE_BONE) : pick(GORE_RED), col2: bone ? '#8a8474' : pick(GORE_DARK),
        s: bone ? 1 : randi(2, 3), trail: !bone && Math.random() < 0.55, trailT: 0, rest: false,
      });
    }
  }
  // one of them, off the deck and over the side
  crew(x, y, ang, power, opts) {
    opts = opts || {};
    power = power || 1;
    const sp = rand(55, 145) * power;
    this.addGib({
      kind: 2, x, y, z: opts.z !== undefined ? opts.z : rand(2, 7),
      vx: Math.cos(ang) * sp + (opts.vx || 0) * 0.4, vy: Math.sin(ang) * sp * 0.75 + (opts.vy || 0) * 0.4,
      vz: rand(70, 180) * power,
      ph: rand(0, TAU), vr: rand(-8, 8), life: rand(7, 12),
      col: opts.coat || pick(GORE_COAT), col2: pick(GORE_SKIN),
      s: 3, trail: true, trailT: 0, rest: false,
    });
  }
  // A boat's crew going with her. `r` is the hull's collision radius: it is
  // what decides how many of them there were.
  slaughter(x, y, r, ang, opts) {
    opts = opts || {};
    let want = 1 + Math.round(r / 13); if (want < 2) want = 2; if (want > 5) want = 5;
    const k = this.goreScale(want * 1.1);
    const n = Math.max(1, Math.round(want * k));
    for (let i = 0; i < n; i++) {
      const a = (ang === undefined || ang === null) ? rand(0, TAU) : ang + rand(-1.2, 1.2);
      this.crew(x + rand(-r, r) * 0.5, y + rand(-r, r) * 0.5, a, 0.8 + rand(0, 0.7) * (opts.power || 1), { vx: opts.vx, vy: opts.vy });
    }
    this.gib(x, y, Math.round(4 + 8 * k), ang, { spread: TAU, speed: 120, vx: (opts.vx || 0) * 0.3, vy: (opts.vy || 0) * 0.3 });
    this.mist(x, y, 3 + ((4 * k) | 0));
    this.blood(x, y, 1.1 + r / 30, ang);                  // and what sprays
    this.plume(x, y, 0.5 + r / 90, r * 1.6);
    this.bleed(x, y, 2.2 + r / 20, 8 + r / 8, r * 0.7);
    this.chum(x, y);
    this.goreSound(1);
  }
  // A wound rather than a death: what a bullet or a tail through the deck
  // takes out of whoever was standing there.
  gore(x, y, amount, ang) {
    amount = amount === undefined ? 1 : amount;
    const k = this.goreScale(amount * 0.5);
    this.blood(x, y, amount * 0.7, ang);
    this.mist(x, y, 1 + ((2 * amount * k) | 0));
    if (amount > 0.6) this.gib(x, y, Math.max(1, Math.round(2 * amount * k)), ang, { spread: 1.5, speed: 90 });
    this.plume(x, y, amount * 0.30, 10 + amount * 10);
    if (amount > 0.8) this.goreSound(0.6);
  }
  // ---- and what the blood brings ------------------------------------
  // The bay already has sharks in it -- src/wildlife.js swims three of them
  // round the reef on their own business. Rather than drawing a second,
  // worse shark, this hands them somewhere new to be: enough blood in the
  // water and the nearest of them stop patrolling and come and circle it.
  // Nothing here owns them, nothing here draws them, and if wildlife is not
  // running the whole thing quietly does not happen.
  chum(x, y) {
    const oc = this.ocean;
    if (!oc || y < oc.shoreY + 90) return;
    const sh = (typeof Wildlife !== 'undefined' && Wildlife.lists && Wildlife.lists.sharks) || null;
    if (!sh || !sh.length) return;
    let called = 0;
    for (let i = 0; i < sh.length && called < 2; i++) {
      const s = sh[i];
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > 1100) continue;
      s.cx = x + rand(-20, 20); s.cy = y + rand(-20, 20);
      s.rad = rand(46, 92);
      s.sp = Math.min(96, s.sp + rand(26, 46));     // it has somewhere to be
      s.curious = 0; s.curT = rand(22, 40);         // and no interest in her
      called++;
    }
  }

  update(dt, flowFn) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { if (p.type === 'mist') this.mistN--; l[i] = l[l.length - 1]; l.pop(); continue; }
      switch (p.type) {
        case 'drop': case 'blood': case 'debris': case 'shell':
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.z !== undefined) {
            p.z += p.vz * dt; p.vz -= 380 * dt;
            if (p.z <= 0 && p.vz < 0) {
              p.z = 0;
              if (p.type === 'drop') { this.ocean.addFoam(p.x, p.y, 0.08); p.life = 0; if (Math.random() < 0.25) this.ocean.ripple(p.x, p.y, 8, 30, 0.4); }
              else if (p.type === 'blood') { this.ocean.addBlood(p.x, p.y, p.amt); p.life = 0; }
              else if (p.type === 'debris') { p.vz = 0; p.vx *= 0.3; p.vy *= 0.3; p.vr *= 0.2; p.floating = true; if (!p.splashed) { p.splashed = true; this.ocean.addFoam(p.x, p.y, 0.2); } }
              else if (p.type === 'shell') { p.life = Math.min(p.life, 0.3); p.vx = 0; p.vy = 0; }
            }
          }
          if (p.floating && flowFn) { const f = flowFn(p.x, p.y); p.x += f.x * dt; p.y += f.y * dt; p.rot += p.vr * dt; }
          else if (p.rot !== undefined) p.rot += p.vr * dt;
          break;
        case 'mist': p.x += p.vx * dt; p.y += p.vy * dt; p.size += 5 * dt; p.vx *= 0.9; p.vy *= 0.9; break;
        case 'smoke': p.x += p.vx * dt; p.y += p.vy * dt; p.size += 6 * dt; p.vx *= 0.98; break;
        case 'fire': p.x += p.vx * dt; p.y += p.vy * dt; p.size *= 0.97; break;
        case 'spark': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; break;
        case 'bubble': p.x += p.vx * dt; p.y += p.vy * dt; break;
      }
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i]; e.life += dt;
      e.r = e.maxR * Math.min(1, Math.pow(e.life / e.dur, 0.45));
      if (e.life > e.dur) this.explosions.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; t.y += t.vy * dt; if (t.life <= 0) this.texts.splice(i, 1); }
    this.updateGore(dt, flowFn);
  }

  // ====================================================================
  //  GORE: one pass over three small arrays
  // ====================================================================
  updateGore(dt, flowFn) {
    this.gb += GOREC.refill * dt; if (this.gb > GOREC.cap) this.gb = GOREC.cap;
    if (this.goreSfx > 0) this.goreSfx -= dt;
    const oc = this.ocean, wl = oc ? oc.shoreY + 4 : -1e9;
    const cm = (typeof G !== 'undefined' && G && G.cam) || null;
    // out of shot, a chunk still falls, floats, bleeds and sinks -- it simply
    // stops paying for splashes and bubbles nobody is there to see
    const seen = (x, y) => !cm || (x > cm.x - 80 && x < cm.x + 720 && y > cm.y - 80 && y < cm.y + 440);

    // ---- slicks: a bleed that drifts with the set of the current
    const sl = this.slicks;
    for (let i = sl.length - 1; i >= 0; i--) {
      const s = sl[i];
      s.t += dt;
      if (s.t >= s.dur) { sl[i] = sl[sl.length - 1]; sl.pop(); continue; }
      if (flowFn) { const f = flowFn(s.x, s.y); s.x += f.x * dt * 0.8; s.y += f.y * dt * 0.8; }
      s.next -= dt;
      if (s.next <= 0 && oc) {
        s.next = 0.12;
        const a = s.amt * (1 - s.t / s.dur) * 0.13;
        oc.addBlood(s.x, s.y, a);
        oc.addBlood(s.x + rand(-s.sp, s.sp), s.y + rand(-s.sp, s.sp), a * 0.7);
      }
    }

    // ---- chunks, bone and bodies
    const g = this.gibs;
    for (let i = g.length - 1; i >= 0; i--) {
      const p = g[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.rest && oc && p.y > wl) { oc.addBlood(p.x, p.y, p.kind === 2 ? 0.30 : 0.12); if (seen(p.x, p.y)) this.bubbles(p.x, p.y, p.kind === 2 ? 3 : 1); }
        g[i] = g[g.length - 1]; g.pop(); continue;
      }
      if (p.rest) {                                    // floating, face down
        if (flowFn) { const f = flowFn(p.x, p.y); p.x += f.x * dt * 0.7; p.y += f.y * dt * 0.7; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= Math.pow(0.2, dt); p.vy *= Math.pow(0.2, dt);
        p.ph += dt * 1.6;
        if (p.kind === 2) {
          p.bleedT -= dt;
          if (p.bleedT <= 0) { p.bleedT = 0.4; if (oc) oc.addBlood(p.x, p.y, 0.05); }
        }
        continue;
      }
      // ---- in the air
      p.vz -= 420 * dt; p.z += p.vz * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.55, dt); p.vy *= Math.pow(0.55, dt);
      p.ph += p.vr * dt;
      if (p.trail) {
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.055;
          // it bleeds all the way down, and every drop lands in the water
          this.add({ type: 'blood', x: p.x, y: p.y, vx: p.vx * 0.12, vy: p.vy * 0.12, z: p.z, vz: -10,
            life: 1.4, maxLife: 1.4, size: 1, color: p.kind === 2 ? '#c8302e' : '#7c1414', amt: 0.05 });
        }
      }
      if (p.z <= 0 && p.vz < 0) {
        p.z = 0;
        if (p.y < wl) {                                // it came down on land
          if (typeof Gore !== 'undefined' && Gore.splat) Gore.splat(p.x, p.y, p.kind === 2 ? 1.1 : 0.45);
          p.life = 0; continue;
        }
        const hard = Math.abs(p.vz) + Math.hypot(p.vx, p.vy);
        if (oc) {
          oc.addBlood(p.x, p.y, p.kind === 2 ? 0.5 : 0.2);
          oc.addFoam(p.x, p.y, 0.16);
          if (p.kind === 2 && oc.ripple) oc.ripple(p.x, p.y, 16, 40, 0.5);
        }
        if (seen(p.x, p.y)) {
          const n = p.kind === 2 ? 5 : 2;
          for (let k = 0; k < n; k++) {
            const a = rand(0, TAU), sp = rand(15, 55);
            this.add({ type: 'drop', x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, z: 0, vz: rand(40, 90),
              life: 1, maxLife: 1, size: 1, color: '#eaf8ff' });
          }
        }
        // he came down hard enough to come apart
        if (p.kind === 2 && hard > 270) {
          this.gib(p.x, p.y, 3, rand(0, TAU), { speed: 65, spread: TAU });
          this.plume(p.x, p.y, 0.9, 15);
          p.life = 0; continue;
        }
        if (p.kind === 0) { this.plume(p.x, p.y, 0.3, 9); p.life = 0; continue; }   // meat sinks
        p.rest = true; p.vz = 0; p.vx *= 0.25; p.vy *= 0.25;
        p.life = Math.min(p.life, p.kind === 2 ? rand(5, 9) : rand(2.2, 4));
        if (p.kind === 2) { p.bleedT = 0.2; this.bleed(p.x, p.y, 1.5, 6, 13); this.plume(p.x, p.y, 0.5, 22); }
      }
    }

    // ---- what is circling takes what is floating
    this.biteT -= dt;
    if (this.biteT <= 0) {
      this.biteT = 0.25;
      const sh = (typeof Wildlife !== 'undefined' && Wildlife.lists && Wildlife.lists.sharks) || null;
      if (sh) for (let i = 0; i < sh.length; i++) {
        const h = sh[i];
        for (let k = 0; k < g.length; k++) {
          const q = g[k];
          if (!q.rest || q.kind !== 2) continue;
          if (Math.abs(q.x - h.x) > 22 || Math.abs(q.y - h.y) > 18) continue;
          // it takes him under. A boil of red, and he is simply not there.
          this.gib(q.x, q.y, 3, rand(0, TAU), { speed: 70, spread: TAU });
          this.plume(q.x, q.y, 1.5, 22);
          this.bleed(q.x, q.y, 1.1, 4, 15);
          if (seen(q.x, q.y)) { this.splash(q.x, q.y, 0.8); this.goreSound(0.8); if (oc && oc.ripple) oc.ripple(q.x, q.y, 34, 70, 0.6); }
          q.life = 0;
          h.sp = Math.min(110, h.sp + 30);
          break;
        }
      }
    }
  }

  // Everything above the water: chunks and bodies still in the air. They
  // tumble by SWAPPING SILHOUETTE on the pixel grid rather than rotating,
  // because ctx.rotate on a three-pixel block is a smear.
  renderGore(ctx, cam) {
    const g = this.gibs;
    for (let i = 0; i < g.length; i++) {
      const p = g[i];
      if (p.rest) continue;
      const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y - p.z);
      if (sx < -14 || sy < -14 || sx > 654 || sy > 374) continue;
      if (p.z > 3) {                                   // its shadow on the water
        ctx.fillStyle = 'rgba(6,18,48,0.30)';
        ctx.fillRect(sx - 1, Math.round(p.y - cam.y), p.kind === 2 ? 4 : 2, 1);
      }
      if (p.kind === 2) {
        // A man end over end: the long axis swaps as he turns. Solid colour
        // with one dark edge under it -- an outline all the way round a
        // five-pixel shape is all outline and no man.
        const flip = ((p.ph * 0.9) | 0) & 1;
        const w = flip ? 3 : 5, h = flip ? 5 : 3;
        const x0 = sx - (w >> 1), y0 = sy - (h >> 1);
        ctx.fillStyle = '#0c1018'; ctx.fillRect(x0, y0 + 1, w, h);
        ctx.fillStyle = p.col; ctx.fillRect(x0, y0, w, h);
        ctx.fillStyle = '#0c1018'; ctx.fillRect(x0, y0 + h - 1, w, 1);
        ctx.fillStyle = p.col2;
        if (flip) ctx.fillRect(x0 + 1, y0, 1, 2); else ctx.fillRect(x0 + w - 2, y0, 2, 1);
        ctx.fillStyle = GORE_RED[0]; ctx.fillRect(flip ? x0 : x0 + 1, flip ? y0 + h - 2 : y0 + h - 1, 1, 1);
      } else if (p.kind === 1) {
        ctx.fillStyle = '#0c1018'; ctx.fillRect(sx, sy + 1, 1, 3);
        ctx.fillStyle = p.col; ctx.fillRect(sx, sy, 1, 3);
        ctx.fillStyle = p.col2; ctx.fillRect(sx, sy + 2, 1, 1);
      } else {
        const t = GIB_TUMBLE[((p.ph * 1.6) | 0) & 3];
        const w = t[0] + (p.s > 2 ? 1 : 0), h = t[1] + (p.s > 2 ? 1 : 0);
        ctx.fillStyle = '#0c1018'; ctx.fillRect(sx, sy + 1, w, h);
        ctx.fillStyle = p.col; ctx.fillRect(sx, sy, w, h);
        ctx.fillStyle = p.col2; ctx.fillRect(sx, sy + h - 1, w, 1);
      }
    }
  }

  // draw particles that sit under sprites (floating debris, foam bits)
  renderUnder(ctx, cam) {
    for (const p of this.list) {
      if (p.type !== 'debris' || !p.floating) continue;
      const sx = p.x - cam.x, sy = p.y - cam.y; if (sx < -10 || sy < -10 || sx > 650 || sy > 370) continue;
      ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2 | 0, -p.h / 2 | 0, p.w, p.h); ctx.restore();
    }
    // what is in the water goes UNDER the boats: a man face down is scenery
    // the fleet drives over, not something drawn on top of it
    for (let i = 0; i < this.gibs.length; i++) {
      const p = this.gibs[i];
      if (!p.rest) continue;
      const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
      if (sx < -14 || sy < -14 || sx > 654 || sy > 374) continue;
      const bob = Math.sin(p.ph) | 0;
      if (p.kind === 2) {
        // Face down, arms out, awash. Three hard bands and the back of a
        // head: at this size that is a drowned man, and anything more is mud.
        const y0 = sy - 1 + bob;
        ctx.fillStyle = '#0c1018'; ctx.fillRect(sx - 3, y0, 7, 4);        // him, in the water
        ctx.fillStyle = p.col; ctx.fillRect(sx - 2, y0, 5, 2);            // his back
        ctx.fillStyle = '#1b2029'; ctx.fillRect(sx - 2, y0 + 2, 5, 1);    // and what is under
        ctx.fillStyle = p.col2; ctx.fillRect(sx + 2, y0, 2, 2);           // the back of his head
        ctx.fillStyle = GORE_DARK[0]; ctx.fillRect(sx - 3, y0 + 1, 1, 1);
        ctx.fillStyle = GORE_RED[2]; ctx.fillRect(sx + 1, y0 + 2, 1, 1);
      } else {
        ctx.fillStyle = '#0c1018'; ctx.fillRect(sx, sy + bob, 2, 2);
        ctx.fillStyle = p.col; ctx.fillRect(sx, sy + bob, 1, 1);
      }
    }
  }
  render(ctx, cam) {
    ctx.globalAlpha = 1;
    for (const p of this.list) {
      const sx = p.x - cam.x, sy = p.y - cam.y; if (sx < -20 || sy < -20 || sx > 660 || sy > 380) continue;
      switch (p.type) {
        case 'drop': ctx.fillStyle = p.color; ctx.fillRect(Math.round(sx), Math.round(sy - p.z), p.size, p.size); break;
        case 'blood': ctx.fillStyle = p.color; ctx.fillRect(Math.round(sx), Math.round(sy - p.z), p.size, p.size); break;
        case 'debris': if (p.floating) break;
          ctx.save(); ctx.translate(Math.round(sx), Math.round(sy - p.z)); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2 | 0, -p.h / 2 | 0, p.w, p.h); ctx.restore(); break;
        case 'shell': ctx.save(); ctx.translate(Math.round(sx), Math.round(sy - p.z)); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life * 3); ctx.drawImage(SP.shell.c, -1, -1); ctx.restore(); ctx.globalAlpha = 1; break;
        case 'smoke': { const k = p.life / p.maxLife; ctx.fillStyle = p.color + (0.55 * k).toFixed(2) + ')'; const s = Math.round(p.size); ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s); break; }
        case 'fire': { const k = p.life / p.maxLife; ctx.fillStyle = k > 0.6 ? '#ffe48f' : k > 0.3 ? '#ff9a3c' : '#c8302e'; const s = Math.max(1, Math.round(p.size)); ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s); break; }
        case 'spark': ctx.fillStyle = p.color; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1); if (p.life > 0.2) ctx.fillRect(Math.round(sx - p.vx * 0.01), Math.round(sy - p.vy * 0.01), 1, 1); break;
        case 'bubble': ctx.strokeStyle = 'rgba(220,245,255,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(sx), Math.round(sy), p.size, p.size); break;
        case 'mist': {
          // a hanging red haze, drawn as separate hard cells on the grid --
          // three posterized alphas, no gradient, nothing soft in it
          const k = p.life / p.maxLife;
          ctx.globalAlpha = k > 0.66 ? 0.5 : k > 0.33 ? 0.34 : 0.17;
          ctx.fillStyle = p.color;
          const s2 = Math.max(2, Math.round(p.size)), h2 = s2 >> 1;
          const bx = Math.round(sx) - h2, by = Math.round(sy) - h2;
          ctx.fillRect(bx, by, 2, 2);
          ctx.fillRect(bx + s2 - 2, by + 1, 2, 2);
          ctx.fillRect(bx + 1, by + s2 - 2, 2, 2);
          if (k > 0.4) { ctx.fillRect(bx + h2, by - 1, 2, 2); ctx.fillRect(bx - 1, by + h2, 2, 2); }
          ctx.globalAlpha = 1;
          break;
        }
      }
    }
    // explosions: chunky posterized rings
    for (const e of this.explosions) {
      const sx = Math.round(e.x - cam.x), sy = Math.round(e.y - cam.y), k = e.life / e.dur;
      const r = Math.round(e.r);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fillStyle = k < 0.3 ? '#fff6d5' : k < 0.55 ? '#ffd27a' : k < 0.8 ? '#ff9a3c' : 'rgba(60,50,55,0.6)'; ctx.fill();
      if (k > 0.2) { ctx.beginPath(); ctx.arc(sx, sy, Math.round(r * 0.72), 0, TAU); ctx.fillStyle = k < 0.5 ? '#ffe48f' : k < 0.75 ? '#e6802a' : 'rgba(30,25,30,0.7)'; ctx.fill(); }
      if (k > 0.4) { ctx.beginPath(); ctx.arc(sx, sy, Math.round(r * 0.42), 0, TAU); ctx.fillStyle = k < 0.7 ? '#c8302e' : 'rgba(20,18,22,0.8)'; ctx.fill(); }
      if (k < 0.5 && e.water) { // shock ring on the water
        ctx.strokeStyle = `rgba(255,255,255,${(1 - k * 2).toFixed(2)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(sx, sy, Math.round(r * 1.5), Math.round(r * 1.1), 0, 0, TAU); ctx.stroke();
      }
    }
    // the gore goes ON TOP of the fireball: what comes out of a boat is the
    // part worth watching, and a third of a second of orange used to bury it
    this.renderGore(ctx, cam);
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      pixelText(ctx, t.str, Math.round(t.x - cam.x), Math.round(t.y - cam.y), t.size, t.color, 'center');
    }
    ctx.globalAlpha = 1;
  }
}
