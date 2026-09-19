// ---- Hazards: sea mines, boarders, swimming fishermen, cannon fire -------
//  A self-contained danger layer for the open ocean. Loads after
//  chars.js / village.js and before game.js. Nothing here reaches into the
//  rest of the game except through the guarded accessors below, so it is
//  safe to run inside a bare harness with a stubbed `G`.
//
//  Public surface (see the bottom of the file):
//    Hazards.init / reset / populate / update / render / renderOver
//    Hazards.spawnSwimmer / spawnMine / boardFrom / fireCannon
//    Hazards.mines / swimmers / shells / difficulty / tune
//
//  Pixel-art rules obeyed: every sprite is rasterised once in init() into an
//  offscreen canvas, everything else is integer fillRect. No gradients, no
//  blur, no images.
(function (global) {
  'use strict';

  // =======================================================================
  //  0.  GUARDS, VIEW CONSTANTS AND TINY HELPERS
  // =======================================================================
  // The world is drawn at 1:1 and a centred 320x180 crop of it is magnified x2,
  // so the VISIBLE view is only 320x180 world units. Nothing here hardcodes a
  // buffer size: the cull box is read off whatever canvas we are handed, which
  // is correct both for the 640x360 world layer and for a bare 320x180 target.
  const CULL = 88;
  let _vw = 640, _vh = 360;
  function setView(ctx) { const c = ctx && ctx.canvas; if (c) { _vw = c.width || 640; _vh = c.height || 360; } }

  function gg() { try { return (typeof G !== 'undefined' && G) ? G : null; } catch (e) { return null; } }
  function onScreen(sx, sy, m) { m = m || CULL; return sx > -m && sy > -m && sx < _vw + m && sy < _vh + m; }

  let TOON = null, GORE = null, AUD = null;
  function bindFx() {
    if (!TOON && typeof Toon !== 'undefined') TOON = Toon;
    if (!GORE && typeof Gore !== 'undefined') GORE = Gore;
    if (!AUD && typeof Audio_ !== 'undefined') AUD = Audio_;
  }
  function snd(fn, a, b, c, d) { if (AUD && AUD[fn]) { try { AUD[fn](a, b, c, d); } catch (e) { } } }

  function hcan(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return c;
  }
  function spr(c, ax, ay) { return { c: c, w: c.width, h: c.height, ax: ax === undefined ? c.width / 2 : ax, ay: ay === undefined ? c.height / 2 : ay }; }
  function pset(x, col, px, py, w, h) { x.fillStyle = col; x.fillRect(px | 0, py | 0, w || 1, h || 1); }

  const _shadeCache = Object.create(null);
  function shade(hex, f) {
    const key = hex + '|' + f; const hit = _shadeCache[key]; if (hit) return hit;
    const n = parseInt(hex.slice(1), 16);
    const cl = v => v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    const s = '#' + ((1 << 24) + (cl(((n >> 16) & 255) * f) << 16) + (cl(((n >> 8) & 255) * f) << 8) + cl((n & 255) * f)).toString(16).slice(1);
    _shadeCache[key] = s; return s;
  }

  const _mixCache = Object.create(null);
  function mix(a, b, f) {
    const key = a + '>' + b + '|' + f; const hit = _mixCache[key]; if (hit) return hit;
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const cl = v => v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    const r = cl(lerp((x >> 16) & 255, (y >> 16) & 255, f)), g2 = cl(lerp((x >> 8) & 255, (y >> 8) & 255, f)), bl = cl(lerp(x & 255, y & 255, f));
    const s2 = '#' + ((1 << 24) + (r << 16) + (g2 << 8) + bl).toString(16).slice(1);
    _mixCache[key] = s2; return s2;
  }
  // the colour anything below the surface fades toward
  const WATER_TINT = '#14606e';
  function sub(col, f) { return mix(shade(col, 0.62), WATER_TINT, f === undefined ? 0.5 : f); }

  // chunky pixel line (no antialiasing, ever)
  function pline(ctx, x0, y0, x1, y1, th, col) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
    const n = len < 1 ? 1 : Math.ceil(len / (th * 0.62 < 1 ? 1 : th * 0.62));
    const h = th >> 1;
    ctx.fillStyle = col;
    for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + dx * i / n) - h, Math.round(y0 + dy * i / n) - h, th, th);
  }

  // two-bone IK, result in _ikx/_iky
  let _ikx = 0, _iky = 0;
  function ik(ax, ay, bx, by, l1, l2, flip) {
    let dx = bx - ax, dy = by - ay;
    let d = Math.hypot(dx, dy) || 1e-4;
    const dmax = l1 + l2 - 0.01;
    if (d > dmax) { dx *= dmax / d; dy *= dmax / d; d = dmax; }
    const a = (d * d + l1 * l1 - l2 * l2) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a)) * flip;
    const ux = dx / d, uy = dy / d;
    _ikx = ax + ux * a - uy * h; _iky = ay + uy * a + ux * h;
  }

  // local(forward,side) -> screen transform for top-down rigs
  let _rc = 1, _rs = 0, _ox = 0, _oy = 0;
  function setXf(sx, sy, ang) { _ox = sx; _oy = sy; _rc = Math.cos(ang); _rs = Math.sin(ang); }
  function LX(x, y) { return _ox + x * _rc - y * _rs; }
  function LY(x, y) { return _oy + x * _rs + y * _rc; }
  function limb(ctx, x0, y0, x1, y1, th, col, ink) {
    const ax = LX(x0, y0), ay = LY(x0, y0), bx = LX(x1, y1), by = LY(x1, y1);
    if (ink) pline(ctx, ax, ay, bx, by, th + 2, ink);
    pline(ctx, ax, ay, bx, by, th, col);
  }
  function ldot(ctx, x, y, s, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(LX(x, y)) - (s >> 1), Math.round(LY(x, y)) - (s >> 1), s, s); }
  // a two-bone limb: outline the whole chain first so the elbow has no black seam
  function limb2(ctx, x0, y0, ex, ey, hx, hy, th1, th2, c1, c2, ink) {
    const ax = LX(x0, y0), ay = LY(x0, y0), bx = LX(ex, ey), by = LY(ex, ey), cx2 = LX(hx, hy), cy2 = LY(hx, hy);
    if (ink) { pline(ctx, ax, ay, bx, by, th1 + 2, ink); pline(ctx, bx, by, cx2, cy2, th2 + 2, ink); }
    pline(ctx, ax, ay, bx, by, th1, c1);
    pline(ctx, bx, by, cx2, cy2, th2, c2);
  }

  // =======================================================================
  //  1.  PALETTE
  // =======================================================================
  const HP = {
    ink: '#14141c', ink2: '#232030',
    iron: ['#1e232b', '#2b313b', '#3a414d', '#4c5462', '#616a79', '#798393', '#98a2b1'],
    ironL: '#c3cbd8',
    horn: '#b6312c', hornL: '#ff6161', hornD: '#6d1513',
    brass: '#c9982f', brassL: '#f4d675', brassD: '#7d5c18',
    lampOn: '#ffe48f', lampHot: '#ffffff', lampOff: '#4a4028',
    chain: '#2b3746', chainL: '#4a5a6d',
    rope: '#c8a86a', ropeD: '#8a6f3e',
    foam: '#eaf8ff', foam2: '#b9e3f7',
    deep: 'rgba(8,38,60,0.55)',
    warn: '#ff6161', warn2: '#ffe48f',
    wood: '#b57d3f', woodD: '#7a5227',
    steel: '#aeb6c1', steelD: '#5a626d',
    blood: '#c8302e', bloodD: '#7c1414',
  };

  // swimmer looks: a crowd should read as a crowd
  const LOOKS = [
    { skin: '#e9b78c', shirt: '#e4562f', hair: '#43302a', hat: 1 },
    { skin: '#c68a5c', shirt: '#f0a13a', hair: '#4a3020', hat: 0 },
    { skin: '#a96f45', shirt: '#e8dcbe', hair: '#3a2b24', hat: 2 },
    { skin: '#d8a172', shirt: '#d8763a', hair: '#7a2a1a', hat: 1 },
    { skin: '#8a5733', shirt: '#eac04a', hair: '#463228', hat: 3 },
    { skin: '#f0c9a4', shirt: '#c8302e', hair: '#8a7a60', hat: 2 },
    { skin: '#e9b78c', shirt: '#b4708f', hair: '#6b5030', hat: 0 },
    { skin: '#c68a5c', shirt: '#7fb2c8', hair: '#43302a', hat: 3 },
    ];

  // =======================================================================
  //  2.  TUNING  --  everything the run can dial up
  // =======================================================================
  const TUNE = {
    // ---- sea mines -----------------------------------------------------
    mineCount: 34,          // mines populate() scatters at difficulty 1
    mineClusters: 7,        // minefields (the rest are loners)
    mineProxShare: 0.42,    // fraction that are proximity mines
    mineHp: 14,             // shooting one from range is the safe play
    mineBlast: 58,          // explosion radius
    mineDmg: 32,
    mineChainR: 104,        // chain-detonation reach
    mineChainDelay: [0.05, 0.24],
    proxRadius: 40,         // proximity trigger radius (drawn on the water)
    proxFuse: 0.95,         // seconds of ticking before it goes off
    contactRadius: 11,
    warnRadius: 86,         // where the ticking starts
    mineTether: 36,         // how far a mine drifts from its anchor
    mineDrift: 0.34,        // share of the current it rides
    boatMineAvoid: 0.7,     // how hard boats steer around mines (0 = bait city)

    // ---- swimmers ------------------------------------------------------
    maxSwimmers: 16,
    swimHp: { knife: 26, gaff: 36, harpoon: 22 },
    swimSpeed: { knife: 64, gaff: 54, harpoon: 46 },
    clingRange: 15,
    clingDmg: { knife: 5, gaff: 9 },
    clingCd: { knife: 0.8, gaff: 1.25 },
    swimTread: 150,         // harpooner stand-off distance
    harpoonCd: 3.2,
    harpoonRange: 200,
    harpoonDmg: 13,
    harpoonSpeed: 250,
    harpoonPull: 190,       // rope drag on the player, px/s^2
    harpoonBite: 0.9,       // seconds between rope-burn ticks
    corpseLife: 7,

    // ---- boarding ------------------------------------------------------
    boarders: true,
    boardRange: 132,
    boardCd: 9.5,
    boardCrew: 2,
    boardTypes: { dinghy: 1, netter: 2, speedboat: 1, trawler: 3, gunboat: 2, dynaboat: 1, harpooner: 1 },

    // ---- cannons & mortars ---------------------------------------------
    gunners: { gunboat: 'cannon', trawler: 'mortar' },
    cannonRange: 310, cannonCd: 4.6, cannonAim: 1.2,
    cannonDmg: 30, cannonBlast: 56, cannonSpeed: 200,
    mortarRange: 360, mortarCd: 6.4, mortarAim: 1.5,
    mortarShells: 3, mortarSpread: 46, mortarDmg: 19, mortarBlast: 40, mortarSpeed: 150,
    shellPush: 280,         // shockwave shove
    shellLead: 0.8,         // how much of your velocity they lead by

    // ---- global difficulty spread --------------------------------------
    autoSpawn: true,        // swimmers arrive as ordinary wave enemies
    spawnInterval: 12,      // seconds between swimmer arrivals at difficulty 1
    spawnBurst: [1, 2],
    spawnKinds: { knife: 1, gaff: 0.55, harpoon: 0.7 },
    enemySpeed: 1,          // extra multiplier on every boat's speed
    enemyAtkRate: 1,        // extra multiplier on every boat's rate of fire
    aimAssist: 0.5,         // how much enemy shots are re-aimed as difficulty rises
    flank: 1,               // boats spread into a ring instead of beelining
    flankRing: 150,         // preferred stand-off when flanking
    waveMax: 1,             // multiplier on Director wave caps
    waveRate: 1,            // multiplier on Director spawn rate
  };

  // ---- difficulty curve (recomputed only when Hazards.difficulty moves) --
  const DF = { d: -1, atk: 1, spd: 1, hp: 1, dmg: 1, cnt: 1, acc: 0 };
  function difficulty() {
    const d = Math.max(0.2, +Hazards.difficulty || 1);
    if (DF.d === d) return DF;
    DF.d = d;
    DF.atk = Math.pow(d, 0.55);            // faster attacks
    DF.spd = 1 + (d - 1) * 0.15;           // faster movers
    DF.hp = 1 + (d - 1) * 0.34;            // tougher swimmers
    DF.dmg = 1 + (d - 1) * 0.26;           // harder hits
    DF.cnt = d;                            // more of everything at once
    DF.acc = clamp((d - 1) * 0.34, 0, 0.9); // better aim
    applyWaveScaling();
    return DF;
  }

  // Director waves get wider caps as difficulty rises. The originals are
  // snapshotted once so this stays idempotent across runs.
  let _waveBase = null;
  function applyWaveScaling() {
    if (typeof WAVES === 'undefined' || !WAVES || !WAVES.length) return;
    if (!_waveBase) { _waveBase = WAVES.map(w => ({ max: w.max, interval: w.interval })); }
    const d = DF.d, mx = TUNE.waveMax * (1 + (d - 1) * 0.55), rt = TUNE.waveRate * (1 + (d - 1) * 0.45);
    for (let i = 0; i < WAVES.length; i++) {
      WAVES[i].max = Math.round(_waveBase[i].max * mx);
      WAVES[i].interval = _waveBase[i].interval / rt;
    }
  }

  // =======================================================================
  //  3.  SPRITES  --  built once in init()
  // =======================================================================
  const S = {};
  let built = false;

  // ---- a lit sphere, the backbone of mines and cannonballs ---------------
  function sphere(ctx, ox, oy, R, ramp, opts) {
    opts = opts || {};
    const lx = opts.lx === undefined ? -0.52 : opts.lx;
    const ly = opts.ly === undefined ? -0.62 : opts.ly;
    const ink = opts.ink || HP.ink;
    const n = ramp.length;
    const r2 = R * R;
    for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
      const d2 = x * x + y * y;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2);
      if (d > R - 1) { pset(ctx, ink, ox + x, oy + y); continue; }
      const nx = x / R, ny = y / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const L = nx * lx + ny * ly + nz * 0.62;
      let b = Math.floor((L + 0.22) * n);
      if (b < 0) b = 0; else if (b >= n) b = n - 1;
      pset(ctx, ramp[b], ox + x, oy + y);
      if (L > 0.94 && opts.spec) pset(ctx, opts.spec, ox + x, oy + y);
    }
  }

  // ---- sea mine: spiked sphere, horns, warning lamp ----------------------
  function buildMine(kind, lit) {
    const R = 6, SPK = 4, o = R + SPK + 1, W = o * 2 + 1;
    const c = hcan(W, W), x = c.getContext('2d');
    const horn = kind === 'proximity' ? HP.brass : HP.horn;
    const hornL = kind === 'proximity' ? HP.brassL : HP.hornL;
    const hornD = kind === 'proximity' ? HP.brassD : HP.hornD;
    // --- spikes (drawn under the body so they root into it)
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + Math.PI / 8, cs = Math.cos(a), sn = Math.sin(a);
      for (let d = R - 2; d <= R + SPK; d++) {
        const px = o + cs * d, py = o + sn * d;
        const w = d < R + 1 ? 4 : d < R + SPK - 1 ? 3 : 2;
        pset(x, HP.ink, px - w / 2, py - w / 2, w, w);
      }
      for (let d = R - 2; d <= R + SPK - 1; d++) {
        const px = o + cs * d, py = o + sn * d;
        const w = d < R + 1 ? 2 : 1;
        const k = (d - R + 2) / (SPK + 2);
        pset(x, d >= R + SPK - 2 ? hornL : (k < 0.45 ? HP.iron[4] : HP.iron[5]), px - w / 2, py - w / 2, w, w);
      }
      // horn tip
      const tx = o + cs * (R + SPK - 0.5), ty = o + sn * (R + SPK - 0.5);
      pset(x, lit ? hornL : horn, tx - 0.5, ty - 0.5, 1, 1);
    }
    // --- body
    sphere(x, o, o, R, HP.iron, { spec: HP.ironL });
    // --- welded equator band
    for (let px = -R; px <= R; px++) {
      const yy = Math.round(Math.sqrt(Math.max(0, R * R - px * px)));
      if (yy < 2) continue;
      const sh = px < -1 ? 0.72 : px < 2 ? 1.12 : 0.9;
      pset(x, shade(horn, sh), o + px, o - 1, 1, 1);
      pset(x, shade(horn, sh * 0.78), o + px, o, 1, 1);
      if (((px + 32) & 3) === 0) pset(x, shade(hornD, 1.1), o + px, o - 1, 1, 1);
    }
    // --- rivets
    pset(x, HP.iron[1], o - 3, o - 4); pset(x, HP.iron[1], o + 2, o - 4);
    pset(x, HP.iron[1], o - 3, o + 3); pset(x, HP.iron[1], o + 2, o + 3);
    // --- warning lamp, top-right shoulder
    const lc = lit ? HP.lampHot : HP.lampOff;
    pset(x, HP.ink, o + 1, o - 6, 4, 4);
    pset(x, lc, o + 2, o - 5, 2, 2);
    if (lit) { pset(x, HP.lampOn, o + 1, o - 5, 1, 2); pset(x, HP.lampOn, o + 4, o - 5, 1, 2); pset(x, HP.lampOn, o + 2, o - 6, 2, 1); pset(x, HP.lampOn, o + 2, o - 3, 2, 1); }
    // --- mooring eye at the bottom
    pset(x, HP.ink, o - 1, o + R - 1, 3, 3);
    pset(x, HP.iron[5], o, o + R, 1, 1);
    return spr(c, o, o);
  }

  // ---- seabed anchor (drawn deep, so it is painted cold and dim) ---------
  function buildAnchor() {
    const c = hcan(13, 9), x = c.getContext('2d');
    const rows = [
      '..kkkkkkk..',
      '.kmMMMMMmk.',
      'kmMMmmmMMmk',
      'kmMmkkkmMmk',
      '.kmmkkkmmk.',
      '..kkkkkkk..',
    ];
    const map = { k: '#0d2436', m: '#1c465e', M: '#2a627e' };
    for (let r = 0; r < rows.length; r++) for (let q = 0; q < rows[r].length; q++) {
      const ch = rows[r][q]; if (ch === '.') continue;
      pset(x, map[ch], q + 1, r + 2);
    }
    // chain shackle
    pset(x, '#2a627e', 6, 0, 1, 3); pset(x, '#0d2436', 5, 0, 1, 2); pset(x, '#0d2436', 7, 0, 1, 2);
    return spr(c, 6, 5);
  }

  // ---- cannonballs at three sizes (height = scale, but stay pixel-pure) --
  function buildBall(R) {
    const W = R * 2 + 3, o = R + 1;
    const c = hcan(W, W), x = c.getContext('2d');
    sphere(x, o, o, R, ['#20262f', '#2c3441', '#3d4654', '#525d6d', '#6c7889', '#8e9aab'], { spec: '#c6d0dd' });
    return spr(c, o, o);
  }

  // ---- swimmer torso, seen from above, head end at +x --------------------
  function buildTorso(look) {
    const L = 12, H = 11, cy = 5;
    const c = hcan(L, H), x = c.getContext('2d');
    const sh = look.shirt, shL = shade(sh, 1.45), shD = shade(sh, 0.58);
    const halfW = px => {
      const u = px / (L - 1);
      if (u < 0.18) return 1.7 + u / 0.18 * 0.8;                 // hips
      if (u < 0.60) return 2.5 + (u - 0.18) / 0.42 * 1.9;        // back
      if (u < 0.80) return 4.4;                                   // shoulders
      return 4.4 - (u - 0.80) / 0.20 * 2.0;                       // neck
    };
    for (let px = 0; px < L; px++) {
      const hw = halfW(px);
      const y0 = Math.round(cy - hw), y1 = Math.round(cy + hw);
      for (let y = y0; y <= y1; y++) {
        const edge = y === y0 || y === y1 || px === 0 || px === L - 1;
        if (edge) { pset(x, HP.ink, px, y); continue; }
        const near = Math.min(y - y0, y1 - y);
        pset(x, y - y0 <= 1 ? shL : near <= 1 ? shD : sh, px, y);
      }
    }
    // spine seam + belt + a wet sheen along the shoulders
    for (let px = 2; px < L - 2; px++) if ((px & 1) === 0) pset(x, shade(sh, 0.78), px, cy + 1);
    pset(x, '#40291f', 2, cy - 2, 1, 5); pset(x, HP.steel, 2, cy, 1, 1);
    pset(x, shade(sh, 1.7), 8, cy - 3, 3, 1);
    pset(x, shade(sh, 1.7), 6, cy - 3, 1, 1);
    return spr(c, 4, cy);
  }

  // ---- swimmer head, seen from above (face at +x) ------------------------
  //  From above you mostly see wet hair, so the crown gets a hard highlight
  //  and the forehead/cheek stay skin: that is what separates it from the ink.
  function buildHead(look) {
    const W = 11, o = 5;
    const c = hcan(W, W), x = c.getContext('2d');
    const hairL = shade(look.hair, 1.55), hairD = shade(look.hair, 0.72);
    for (let y = -5; y <= 5; y++) for (let px = -5; px <= 5; px++) {
      const d = Math.hypot(px * 0.94, y);
      if (d > 4.4) continue;
      if (d > 3.7) { pset(x, HP.ink, o + px, o + y); continue; }
      let col;
      if (px >= 0.2) col = y < -1 ? shade(look.skin, 1.2) : (d > 2.8 ? shade(look.skin, 0.86) : look.skin);
      else if (y < -1.4) col = hairL;
      else if (y > 1.8) col = hairD;
      else col = shade(look.hair, 1.18);
      pset(x, col, o + px, o + y);
    }
    pset(x, shade(look.skin, 0.6), o + 4, o, 1, 1);            // nose, pointing the way he swims
    pset(x, HP.ink, o + 2, o - 1, 1, 1);                       // brow
    pset(x, shade(look.skin, 0.72), o + 1, o + 3, 1, 1);       // ear
    pset(x, hairL, o - 3, o - 1, 2, 2);                        // wet shine on the crown
    switch (look.hat) {
      case 1: // bandana
        for (let px = -3; px <= 1; px++) { pset(x, '#ff6161', o + px, o - 3, 1, 1); pset(x, '#c8302e', o + px, o - 2, 1, 1); }
        pset(x, '#8e2326', o - 4, o - 1, 2, 1); pset(x, HP.ink, o - 1, o - 4, 3, 1); break;
      case 2: // cap with a forward brim
        for (let y = -3; y <= 3; y++) for (let px = -3; px <= 1; px++) { if (Math.hypot(px, y) > 3.3) continue; pset(x, y < -1 ? '#5e93c4' : y < 1 ? '#3f6f9e' : '#2d5279', o + px, o + y); }
        pset(x, HP.ink, o + 2, o - 2, 1, 5); pset(x, '#243f5e', o + 2, o - 1, 1, 3); break;
      case 3: // knitted beanie
        for (let y = -3; y <= 3; y++) for (let px = -3; px <= 2; px++) { if (Math.hypot(px, y) > 3.4) continue; pset(x, ((px + y) & 1) ? '#b0a086' : '#6b5c46', o + px, o + y); }
        pset(x, HP.ink, o - 4, o - 3, 1, 1); pset(x, '#d8cbb0', o - 2, o - 3, 2, 1); break;
    }
    return spr(c, o, o);
  }

  // ---- held gear ---------------------------------------------------------
  //  Outlined, never solid black: a weapon must read as a shape at 1:1.
  const GEARPAL = { k: HP.ink, u: '#5c3a1c', U: '#8f5c2c', T: HP.wood, M: HP.steel, m: HP.steelD, W: '#e9f2fb', X: '#2e333a', y: HP.brassL };
  function rowsSprite(rows, ax, ay, pal) {
    const w = Math.max.apply(null, rows.map(r => r.length)), h = rows.length;
    const c = hcan(w, h), x = c.getContext('2d');
    const map = pal || GEARPAL;
    for (let r = 0; r < h; r++) for (let q = 0; q < rows[r].length; q++) {
      const ch = rows[r][q]; if (ch === '.' || ch === ' ') continue;
      const col = map[ch]; if (!col) continue;
      pset(x, col, q, r);
    }
    return spr(c, ax, ay);
  }
  function buildKnife() {
    return rowsSprite([
      '.kkkkkk.',
      'kuUMMMWk',
      '.kkkkkk.',
    ], 1, 1);
  }
  function buildGaff() {
    return rowsSprite([
      '..........kWk',
      '..........kMk',
      '.kkkkkkkkkkMk',
      'kuUTTTTTTUMMk',
      '.kkkkkkkkkkk.',
    ], 1, 3);
  }
  function buildHarpoonGun() {
    return rowsSprite([
      '....kkkkkkk.',
      '.kkkMMMMMMWk',
      'kuUUXXXXXXMk',
      'kuukkkkkkkk.',
      '.kk.........',
    ], 2, 2);
  }
  function buildHarpoonShot() {
    return rowsSprite([
      '........kM..',
      'kuuTTTTMMMMW',
      '........kM..',
    ], 11, 1);
  }
  function buildCorpse(look) {
    const c = hcan(15, 11), x = c.getContext('2d');
    const sh = shade(look.shirt, 0.6);
    // face-down, arms splayed
    for (let px = 1; px < 12; px++) {
      const hw = px < 4 ? 1.8 : px < 9 ? 3.2 : 2.2;
      const y0 = Math.round(5 - hw), y1 = Math.round(5 + hw);
      for (let y = y0; y <= y1; y++) pset(x, (y === y0 || y === y1) ? HP.ink : (y - y0 <= 1 ? shade(sh, 1.2) : sh), px, y);
    }
    pline(x, 8, 4, 13, 1, 2, shade(look.skin, 0.7));
    pline(x, 8, 6, 13, 9, 2, shade(look.skin, 0.7));
    for (let y = -2; y <= 2; y++) for (let px = -2; px <= 2; px++) { if (Math.hypot(px, y) > 2.4) continue; pset(x, shade(look.hair, 0.8), 11 + px, 5 + y); }
    return spr(c, 7, 5);
  }

  function buildSprites() {
    S.mine = {
      contact: [buildMine('contact', false), buildMine('contact', true)],
      proximity: [buildMine('proximity', false), buildMine('proximity', true)],
    };
    S.anchor = buildAnchor();
    S.ball = [buildBall(3), buildBall(4), buildBall(5), buildBall(6)];
    S.knife = buildKnife(); S.gaff = buildGaff(); S.hgun = buildHarpoonGun(); S.hshot = buildHarpoonShot();
    S.torso = []; S.head = []; S.corpse = [];
    for (let i = 0; i < LOOKS.length; i++) {
      S.torso.push(buildTorso(LOOKS[i]));
      S.head.push(buildHead(LOOKS[i]));
      S.corpse.push(buildCorpse(LOOKS[i]));
    }
    built = true;
  }

  // =======================================================================
  //  4.  SHARED EXPLOSION  --  mines and shells both go through here
  // =======================================================================
  function blast(x, y, r, dmg, opts) {
    opts = opts || {};
    const g = gg(); if (!g) return;
    const oc = g.ocean;
    if (oc) {
      if (oc.disturb) { oc.disturb(x, y, 8, 0, 0); oc.disturb(x + r * 0.5, y, 4, 0, 0); oc.disturb(x - r * 0.5, y, 4, 0, 0); }
      if (oc.ripple) { oc.ripple(x, y, r * 2.8, 260, 0.95); oc.ripple(x, y, r * 1.7, 170, 0.6); }
      if (oc.addFoam) for (let i = 0; i < 9; i++) oc.addFoam(x + rand(-r, r) * 0.6, y + rand(-r, r) * 0.6, 0.4);
    }
    if (g.particles) {
      g.particles.explode(x, y, r, { water: true, debris: opts.debris === undefined ? 12 : opts.debris, debrisColors: opts.debrisColors || ['#7d858f', '#4a515a', '#aeb6c1'] });
      g.particles.splash(x, y, Math.min(3.4, r / 20));
    }
    if (TOON) {
      TOON.burst(x, y, 0.85 + r / 90); TOON.shock(x, y, r * 1.7, 0.5);
      for (let i = 0; i < 3; i++) TOON.speed(x, y, rand(0, TAU), 1);
    }
    if (g.shake) g.shake(Math.min(18, 6 + r / 5));
    const push = TUNE.shellPush;

    // ---- player: damage inside the fireball, a hard shove outside it
    const p = g.player;
    if (p && !p.dead) {
      const dp = dist(x, y, p.x, p.y), a = angleTo(x, y, p.x, p.y);
      if (dp < r + 12) {
        const k = 1 - clamp((dp - 8) / (r + 12), 0, 1);
        if (typeof p.damage === 'function') p.damage(dmg * (0.4 + 0.6 * k), x, y);
        p.vx += Math.cos(a) * push * k; p.vy += Math.sin(a) * push * k;
      } else if (dp < r * 2.3) {
        const k = 1 - dp / (r * 2.3);
        p.vx += Math.cos(a) * push * 0.55 * k; p.vy += Math.sin(a) * push * 0.55 * k;
      }
    }
    // ---- boats: mines and shells do not care whose side you are on
    const list = g.enemies;
    if (list) for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (!e || e.dead) continue;
      const de = dist(x, y, e.x, e.y), a = angleTo(x, y, e.x, e.y);
      if (de < r + e.radius) {
        const k = 1 - clamp(de / (r + e.radius), 0, 1);
        if (e.hit) e.hit(dmg * (0.55 + 0.75 * k), Math.cos(a) * 300 * k, Math.sin(a) * 300 * k, null);
      } else if (de < r * 2.3) {
        const k = 1 - de / (r * 2.3);
        e.kx += Math.cos(a) * 220 * k; e.ky += Math.sin(a) * 220 * k;
      }
    }
    const b = g.boss;
    if (b && !b.dead && dist(x, y, b.x, b.y) < r + (b.radius || 40) && b.hit) b.hit(dmg * 0.8, 0, 0, null);

    // ---- swimmers in the water are simply gone
    for (let i = 0; i < swimmers.length; i++) {
      const s = swimmers[i]; if (s.dead) continue;
      const ds = dist(x, y, s.x, s.y);
      if (ds < r * 0.9) killSwimmer(s, angleTo(x, y, s.x, s.y), 1.8);
      else if (ds < r * 2.2) { const k = 1 - ds / (r * 2.2), a = angleTo(x, y, s.x, s.y); s.vx += Math.cos(a) * 260 * k; s.vy += Math.sin(a) * 260 * k; s.stun = Math.max(s.stun, 0.5 * k); }
    }
    // ---- chain reaction through the minefield
    if (!opts.noChain) for (let i = 0; i < mines.length; i++) {
      const m = mines[i]; if (m.dead || m.boom >= 0) continue;
      if (dist(x, y, m.x, m.y) < TUNE.mineChainR) m.boom = rand(TUNE.mineChainDelay[0], TUNE.mineChainDelay[1]);
    }
    // ---- shells in the air get knocked off course
    for (let i = 0; i < shells.length; i++) {
      const sh = shells[i]; if (sh.dead) continue;
      if (dist(x, y, sh.x, sh.y) < r * 1.6 && sh.z < 24) { sh.tLeft = Math.min(sh.tLeft, 0.02); }
    }
  }

  // =======================================================================
  //  5.  SEA MINES
  // =======================================================================
  const mines = [];
  let mineSeq = 0;

  function Mine(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind === 'proximity' ? 'proximity' : 'contact';
    this.ax = x; this.ay = y;                       // seabed anchor
    this.tether = TUNE.mineTether * rand(0.7, 1.35);
    this.ph = rand(0, TAU); this.spin = rand(-0.5, 0.5); this.rot = rand(0, TAU);
    this.vx = 0; this.vy = 0; this.fx = 0; this.fy = 0;
    this.hp = TUNE.mineHp; this.dead = false;
    this.alert = 0; this.fuse = -1; this.tick = 0; this.blink = 0; this.boom = -1;
    this.z = 0; this.armT = 0; this.warned = false;
    this.id = mineSeq++;
    this.slot = this.id & 7;
    this.trigger = this.kind === 'proximity' ? TUNE.proxRadius : TUNE.contactRadius;
  }

  function spawnMine(x, y, kind) {
    if (!built) buildSprites();
    const m = new Mine(x, y, kind);
    mines.push(m);
    return m;
  }

  function detonateMine(m) {
    if (m.dead) return;
    m.dead = true;
    const g = gg();
    if (g && g.particles) g.particles.debris(m.x, m.y, 10, ['#7d858f', '#4a515a', '#aeb6c1', '#c3cbd8']);
    snd('explosion', 1.4);
    blast(m.x, m.y, TUNE.mineBlast, TUNE.mineDmg * DF.dmg, { debris: 14 });
  }

  let mineFrame = 0;
  function stepMines(dt, t, g) {
    if (!mines.length) return;
    mineFrame++;
    const oc = g.ocean, p = g.player, pAlive = p && !p.dead;
    const px = pAlive ? p.x : 0, py = pAlive ? p.y : 0;
    const warnR2 = TUNE.warnRadius * TUNE.warnRadius;
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      if (m.dead) { mines[i] = mines[mines.length - 1]; mines.pop(); continue; }
      // ---- chain detonation timer
      if (m.boom >= 0) { m.boom -= dt; if (m.boom <= 0) { detonateMine(m); continue; } }
      // ---- drift: the current carries it, the chain holds it back
      if (oc && oc.flow && ((mineFrame + m.slot) & 7) === 0) { const f = oc.flow(m.x, m.y); m.fx = f.x * TUNE.mineDrift; m.fy = f.y * TUNE.mineDrift; }
      m.ph += dt * 0.5;
      m.x += (m.fx + m.vx + Math.cos(m.ph) * 3) * dt;
      m.y += (m.fy + m.vy + Math.sin(m.ph * 0.83) * 2.4) * dt;
      m.vx *= Math.pow(0.08, dt); m.vy *= Math.pow(0.08, dt);
      const dax = m.x - m.ax, day = m.y - m.ay, da = Math.hypot(dax, day);
      if (da > m.tether) { const k = m.tether / da; m.x = m.ax + dax * k; m.y = m.ay + day * k; m.vx *= 0.4; m.vy *= 0.4; }
      m.rot += m.spin * dt;
      // ---- bob on the real swell
      m.z = 2.2 + (oc && oc.waveHeight ? oc.waveHeight(m.x, m.y, t) * 1.9 : Math.sin(t * 2 + m.ph) * 1.2);
      if (oc && oc.disturb && ((mineFrame + m.slot) & 15) === 0) oc.disturb(m.x, m.y, 0.5, m.fx, m.fy);
      if (oc && oc.addFoam && ((mineFrame + m.slot) & 31) === 0) oc.addFoam(m.x, m.y, 0.05);

      // ---- warning: it ticks and blinks faster the closer you are
      let alert = 0;
      if (pAlive) {
        const dx = px - m.x, dy = py - m.y, d2 = dx * dx + dy * dy;
        if (d2 < warnR2) {
          const d = Math.sqrt(d2);
          alert = clamp(1 - (d - m.trigger) / (TUNE.warnRadius - m.trigger), 0, 1);
          // contact mines go off when touched; proximity mines start a fuse
          if (m.kind === 'contact') {
            if (d < m.trigger + 11 && !p.diving) { detonateMine(m); continue; }
          } else if (d < m.trigger) {
            if (m.fuse < 0) {
              m.fuse = TUNE.proxFuse / Math.pow(DF.d, 0.3);
              if (TOON) { TOON.emote(m.x + 8, m.y - 16, '!'); TOON.shock(m.x, m.y, m.trigger * 1.15, 0.3, '#ffe48f'); }
              snd('tone', 900, 0.08, 'square', 0.1, 200);
            }
          }
        }
      }
      m.alert = alert;
      if (m.fuse >= 0) {
        const inside = pAlive && dist(px, py, m.x, m.y) < m.trigger + 6;
        m.fuse -= inside ? dt : -dt * 0.55;        // back off and it settles down
        if (m.fuse > TUNE.proxFuse) m.fuse = -1;
        else if (m.fuse <= 0) { detonateMine(m); continue; }
        alert = 1;
      }
      // ---- ticking: blink rate and beeps scale with the alert
      const rate = 1.4 + alert * 16 + (m.fuse >= 0 ? 10 : 0);
      m.blink += dt * rate;
      m.tick -= dt;
      if (m.tick <= 0 && (alert > 0.08 || m.fuse >= 0)) {
        m.tick = Math.max(0.07, 0.62 - alert * 0.52);
        if (onScreenWorld(g, m.x, m.y)) snd('tone', 1500 + alert * 900, 0.035, 'square', 0.055 + alert * 0.07);
      }
      // ---- boats blunder into them too (bait a trawler into a minefield)
      const list = g.enemies;
      if (list) for (let j = 0; j < list.length; j++) {
        const e = list[j]; if (!e || e.dead) continue;
        if (dist(e.x, e.y, m.x, m.y) < e.radius + 7) { detonateMine(m); break; }
      }
    }
  }

  function onScreenWorld(g, x, y) {
    const cam = g.cam; if (!cam) return true;
    return onScreen(x - cam.x, y - cam.y, 40);
  }

  function renderMines(ctx, cam, t) {
    if (!mines.length) return;
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i]; if (m.dead) continue;
      const sx = Math.round(m.x - cam.x), sy = Math.round(m.y - cam.y);
      if (!onScreen(sx, sy)) continue;
      const bob = Math.round(m.z);
      // ---- mooring chain down to the anchor on the seabed
      const axs = Math.round(m.ax - cam.x), ays = Math.round(m.ay - cam.y + 16);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(S.anchor.c, axs - S.anchor.ax, ays - S.anchor.ay);
      ctx.globalAlpha = 1;
      const seg = 7;
      for (let k = 1; k < seg; k++) {
        const u = k / seg;
        const cxp = Math.round(sx + (axs - sx) * u);
        const cyp = Math.round(sy + 4 - bob + (ays - 3 - (sy + 4 - bob)) * u + Math.sin(u * 3 + t) * 0.8);
        ctx.fillStyle = u > 0.45 ? 'rgba(18,48,68,0.48)' : HP.chain;
        ctx.fillRect(cxp - 1, cyp, 2, 2);
        if (u < 0.45) { ctx.fillStyle = HP.chainL; ctx.fillRect(cxp - 1, cyp, 1, 1); }
      }
      // ---- underwater shadow
      ctx.fillStyle = 'rgba(6,18,48,0.34)';
      ctx.beginPath(); ctx.ellipse(sx + 3, sy + 6, 8, 5, 0, 0, TAU); ctx.fill();
      // ---- the mine itself, half out of the water
      const lit = (m.blink % 2) < 1 || m.fuse >= 0 && (m.blink % 1) < 0.55;
      const sprite = S.mine[m.kind][lit ? 1 : 0];
      const dy = sy - bob;
      ctx.save();
      ctx.translate(sx, dy); ctx.rotate(Math.sin(t * 1.1 + m.ph) * 0.11 + m.rot * 0.05);
      ctx.drawImage(sprite.c, -sprite.ax, -sprite.ay);
      ctx.restore();
      // waterline: the part of the sphere below it reads as submerged, and the
      // tint follows the silhouette instead of sitting in a giveaway rectangle
      ctx.fillStyle = 'rgba(10,54,78,0.45)';
      const MR = 6;
      for (let q = bob + 1; q <= MR; q++) {
        const hw = Math.round(Math.sqrt(Math.max(0, MR * MR - q * q)));
        if (hw < 1) continue;
        ctx.fillRect(sx - hw, dy + q, hw * 2 + 1, 1);
      }
      // foam collar: broken dashes around the waterline, never a flat wash
      const fw = Math.sin(t * 3.4 + m.ph);
      ctx.fillStyle = fw > -0.3 ? HP.foam : HP.foam2;
      ctx.fillRect(sx - 6, sy + 1, 3, 1); ctx.fillRect(sx - 1, sy + 1, 2, 1); ctx.fillRect(sx + 4, sy + 1, 3, 1);
      ctx.fillStyle = HP.foam2;
      ctx.fillRect(sx - 9, sy + 2, 3, 1); ctx.fillRect(sx + 6, sy + 2, 3, 1);
      ctx.fillRect(sx - 4 + Math.round(fw * 2), sy + 3, 3, 1); ctx.fillRect(sx + 2 - Math.round(fw * 2), sy + 3, 2, 1);
      ctx.fillStyle = 'rgba(200,236,255,0.45)';
      ctx.fillRect(sx - 8 - Math.round(fw), sy + 4, 4, 1); ctx.fillRect(sx + 5 + Math.round(fw), sy + 4, 4, 1);
      // lamp flare when it is about to go
      if (m.fuse >= 0 && lit) {
        ctx.fillStyle = '#fff6d5';
        ctx.fillRect(sx + 1, dy - 7, 4, 1); ctx.fillRect(sx + 2, dy - 8, 2, 1);
        ctx.fillRect(sx - 1, dy - 5, 1, 2); ctx.fillRect(sx + 6, dy - 5, 1, 2);
      }
    }
  }

  // proximity rings + the panic marker live on the over-layer
  function renderMinesOver(ctx, cam, t) {
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i]; if (m.dead) continue;
      const sx = Math.round(m.x - cam.x), sy = Math.round(m.y - cam.y);
      if (!onScreen(sx, sy, 60)) continue;
      const armed = m.fuse >= 0;
      if (m.kind === 'proximity' && (m.alert > 0.03 || armed)) {
        // dashed trigger ring, drawn as marching pixel dashes
        const r = m.trigger, n = 44;
        const a0 = armed ? t * 5 : t * 1.4;
        const bright = armed ? (Math.sin(t * 34) > 0 ? '#ffffff' : HP.warn) : (m.alert > 0.55 ? HP.warn : HP.warn2);
        ctx.fillStyle = bright;
        ctx.globalAlpha = armed ? 1 : clamp(0.3 + m.alert * 0.7, 0, 1);
        for (let k = 0; k < n; k++) {
          if ((k % 3) === 2) continue;
          const a = a0 + k / n * TAU;
          ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r * 0.72), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      if (armed) {
        // a tightening lock-on bracket so you know to roll NOW
        const k = clamp(m.fuse / TUNE.proxFuse, 0, 1);
        const r = Math.round(10 + k * 16);
        ctx.fillStyle = Math.sin(t * 30) > 0 ? '#ffffff' : HP.warn;
        for (let q = 0; q < 4; q++) {
          const cx = sx + (q & 1 ? r : -r), cy = sy - 3 + (q & 2 ? Math.round(r * 0.7) : -Math.round(r * 0.7));
          ctx.fillRect(cx - 1, cy - 1, 3, 1); ctx.fillRect(cx - 1, cy - 1, 1, 3);
        }
      }
    }
  }

  // =======================================================================
  //  6.  SWIMMERS  --  fishermen in the water: knife, gaff, harpoon
  // =======================================================================
  const swimmers = [], corpses = [], harpoons = [];

  function Swimmer(x, y, kind) {
    this.kind = (kind === 'gaff' || kind === 'harpoon') ? kind : 'knife';
    this.x = x; this.y = y; this.z = 0; this.vz = 0;
    this.vx = 0; this.vy = 0;
    this.ang = rand(0, TAU); this.ph = rand(0, TAU);
    this.hp = TUNE.swimHp[this.kind] * DF.hp;
    this.maxHp = this.hp;
    this.speed = TUNE.swimSpeed[this.kind] * DF.spd * rand(0.92, 1.08);
    this.look = randi(0, LOOKS.length - 1);
    this.state = 'swim'; this.stateT = 0;
    this.atk = rand(0.6, 1.8); this.stun = 0; this.flash = 0;
    this.cling = 0; this.clingA = rand(0, TAU); this.stab = 0;
    this.tethered = false; this.bite = 0;
    this.wobble = rand(0, TAU); this.side = Math.random() < 0.5 ? 1 : -1;
    this.dead = false; this.splashT = 0; this.foamT = 0;
    this.slot = swimmers.length & 7;
    this.fx = 0; this.fy = 0;
  }

  function spawnSwimmer(x, y, kind) {
    if (!built) buildSprites();
    difficulty();
    const s = new Swimmer(x, y, kind);
    swimmers.push(s);
    const g = gg();
    if (g && g.particles) g.particles.splash(x, y, 0.9);
    return s;
  }

  function killSwimmer(s, ang, power) {
    if (s.dead) return;
    s.dead = true;
    power = power || 1;
    if (ang === undefined || ang === null) ang = rand(0, TAU);
    const g = gg();
    if (GORE) {
      GORE.burst(s.x, s.y, 1.5 * power, ang, 4);
      GORE.spray(s.x, s.y, ang, 1.8 * power, 4);
      GORE.mist(s.x, s.y, 7, 4);
    }
    if (g) {
      if (g.particles) { g.particles.blood(s.x, s.y, 2.2 * power, ang); g.particles.splash(s.x, s.y, 1.3); g.particles.debris(s.x, s.y, 3, ['#c8302e', '#7c1414', '#e9b78c']); }
      if (g.ocean) { if (g.ocean.splatBlood) g.ocean.splatBlood(s.x, s.y, 3.4 * power, 20); if (g.ocean.addBlood) g.ocean.addBlood(s.x, s.y, 0.9); if (g.ocean.disturb) g.ocean.disturb(s.x, s.y, 3, 0, 0); if (g.ocean.ripple) g.ocean.ripple(s.x, s.y, 34, 90, 0.7); }
      if (g.shake) g.shake(3);
      if (g.stats) g.stats.kills = (g.stats.kills || 0) + 1;
      if (typeof Pickup !== 'undefined' && g.pickups && g.pickups.length < 220) {
        const n = Math.random() < 0.45 ? 2 : 1;
        for (let i = 0; i < n; i++) g.pickups.push(new Pickup(s.x, s.y, Math.random() < 0.5 ? 'metal' : 'wood'));
      }
    }
    if (TOON) { TOON.impact(s.x, s.y, 1.2, '#ff6161'); TOON.burst(s.x, s.y, 0.55, '#c8302e'); TOON.emote(s.x + 7, s.y - 16, 'skull'); }
    snd('hurt');
    corpses.push({ x: s.x, y: s.y, ang: s.ang, look: s.look, t: 0, life: TUNE.corpseLife, rot: rand(-0.3, 0.3), vx: Math.cos(ang) * 40, vy: Math.sin(ang) * 40 });
    if (s.tethered) snapTether(s, false);
  }

  function hurtSwimmer(s, dmg, kx, ky, ang) {
    if (s.dead) return;
    s.hp -= dmg; s.flash = 0.09;
    s.vx += kx || 0; s.vy += ky || 0;
    const g = gg();
    if (g && g.particles) { g.particles.blood(s.x, s.y, 0.6, ang); g.particles.text(s.x + rand(-4, 4), s.y - 14, Math.round(dmg) + '', '#fff', 7); }
    if (TOON) TOON.impact(s.x, s.y, 0.8, '#ffffff');
    if (g && g.stats) g.stats.damageDealt = (g.stats.damageDealt || 0) + dmg;
    snd('hit');
    if (s.hp <= 0) killSwimmer(s, ang === undefined ? rand(0, TAU) : ang, 1.15);
  }

  // ---- the rope tether from a swimming harpooner -------------------------
  function snapTether(s, fx) {
    s.tethered = false;
    if (!fx) return;
    const g = gg(); const p = g && g.player;
    if (p && TOON) TOON.impact(p.x, p.y, 1.1, '#ffe48f');
    if (p && g && g.particles) g.particles.spray(p.x, p.y, rand(0, TAU), 5, 90);
    if (g && g.particles) g.particles.sparks(p ? p.x : s.x, p ? p.y : s.y, 6);
    snd('tone', 320, 0.12, 'square', 0.1, -180);
  }

  function stepSwimmers(dt, t, g) {
    const p = g.player, pAlive = p && !p.dead;
    const oc = g.ocean;
    const rocks = g.rocks;
    for (let i = swimmers.length - 1; i >= 0; i--) {
      const s = swimmers[i];
      if (s.dead) { swimmers[i] = swimmers[swimmers.length - 1]; swimmers.pop(); continue; }
      s.stateT += dt; s.flash -= dt; s.stun -= dt; s.atk -= dt;
      const d = pAlive ? dist(s.x, s.y, p.x, p.y) : 1e9;
      const toP = pAlive ? angleTo(s.x, s.y, p.x, p.y) : s.ang;

      // ---------------------------------------------------- leaping aboard
      if (s.state === 'leap') {
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.z += s.vz * dt; s.vz -= 340 * dt;
        s.ph += dt * 6;
        if (TOON && Math.random() < 0.25) TOON.speed(s.x, s.y - s.z, Math.atan2(s.vy, s.vx), 1);
        if (s.z <= 0) {
          s.z = 0; s.state = 'swim'; s.stateT = 0;
          s.vx *= 0.35; s.vy *= 0.35;
          if (g.particles) { g.particles.splash(s.x, s.y, 1.7); g.particles.spray(s.x, s.y, s.ang + Math.PI, 5, 90); }
          if (oc) { if (oc.disturb) oc.disturb(s.x, s.y, 3.2, s.vx, s.vy); if (oc.ripple) oc.ripple(s.x, s.y, 30, 90, 0.7); if (oc.addFoam) oc.addFoam(s.x, s.y, 0.5); }
          snd('splash', 1.2);
        }
        continue;
      }

      // ---------------------------------------------------- clinging & stabbing
      if (s.state === 'cling') {
        if (!pAlive) { s.state = 'swim'; continue; }
        // shaken off by a roll
        const rolling = p.rolling || (p.roll && p.roll.active);
        if (rolling || p.diving) {
          s.state = 'stun'; s.stateT = 0; s.stun = 0.8; s.cling = 0;
          const a = angleTo(p.x, p.y, s.x, s.y);
          s.vx = Math.cos(a) * 240; s.vy = Math.sin(a) * 240;
          hurtSwimmer(s, 6 + (p.stats && p.stats.rollDmg ? p.stats.rollDmg : 0), 0, 0, a);
          if (g.particles) g.particles.splash(s.x, s.y, 1.2);
          if (TOON) { TOON.impact(s.x, s.y, 1.2, '#8ac6ff'); TOON.shock(s.x, s.y, 34, 0.3, '#8ac6ff'); }
          continue;
        }
        s.clingA += dt * 0.7 * s.side;
        const r = 15;
        s.x = p.x + Math.cos(s.clingA) * r; s.y = p.y + Math.sin(s.clingA) * r * 0.8;
        s.ang = s.clingA + Math.PI;
        s.cling += dt;
        const cd = TUNE.clingCd[s.kind] / DF.atk;
        s.stab = clamp(1 - s.atk / cd, 0, 1);
        if (s.atk <= 0) {
          s.atk = cd;
          const dmg = TUNE.clingDmg[s.kind] * DF.dmg;
          if (typeof p.damage === 'function') p.damage(dmg, s.x, s.y);
          if (g.particles) g.particles.blood(p.x + rand(-6, 6), p.y + rand(-5, 5), 0.8, s.ang);
          if (GORE) GORE.mist(p.x, p.y, 3, 4);
          if (TOON) TOON.impact(p.x + Math.cos(s.ang + Math.PI) * 6, p.y + Math.sin(s.ang + Math.PI) * 6, 1, '#ff6161');
          snd('hit');
        }
        continue;
      }

      // ---------------------------------------------------- stunned
      if (s.state === 'stun') {
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.vx *= Math.pow(0.05, dt); s.vy *= Math.pow(0.05, dt);
        s.ph += dt * 9;
        if (s.stun <= 0) { s.state = 'swim'; s.stateT = 0; }
        continue;
      }

      // ---------------------------------------------------- swim / tread
      let desired = toP, throttle = 1;
      const treadR = TUNE.swimTread;
      if (s.kind === 'harpoon') {
        if (d < treadR - 40) { desired = toP + Math.PI; throttle = 1; }
        else if (d > treadR + 45) { desired = toP; throttle = 1; }
        else { desired = toP + Math.PI / 2 * s.side; throttle = 0.28; if (s.stateT > 3 && Math.random() < 0.01) s.side *= -1; }
        // fire a harpoon on a rope
        if (pAlive && s.atk <= 0 && d < TUNE.harpoonRange && !s.tethered) {
          s.atk = TUNE.harpoonCd / DF.atk * rand(0.85, 1.15);
          fireHarpoon(s, p);
        }
      } else {
        s.wobble += dt * 2.2;
        desired = toP + Math.sin(s.wobble) * 0.5 * clamp(d / 90, 0, 1);
        if (d < TUNE.clingRange + 6 && pAlive && !p.diving) {
          s.state = 'cling'; s.stateT = 0; s.cling = 0;
          s.clingA = angleTo(p.x, p.y, s.x, s.y);
          s.atk = 0.25;
          if (g.particles) g.particles.splash((s.x + p.x) / 2, (s.y + p.y) / 2, 1.1);
          if (TOON) { TOON.impact(s.x, s.y, 1.2, '#ffffff'); TOON.emote(s.x + 7, s.y - 16, '!'); }
          snd('tone', 240, 0.12, 'square', 0.1, 120);
          continue;
        }
      }
      // rock avoidance
      if (rocks) for (let k = 0; k < rocks.length; k++) {
        const r = rocks[k], dr = dist(s.x, s.y, r.x, r.y);
        if (dr < r.r + 22) {
          const ar = angleTo(s.x, s.y, r.x, r.y), diff = angleDiff(desired, ar);
          if (Math.abs(diff) < 1.3) desired = desired - sign(diff) * 1.1;
          if (dr < r.r + 6) { const a = angleTo(r.x, r.y, s.x, s.y); s.x = r.x + Math.cos(a) * (r.r + 6); s.y = r.y + Math.sin(a) * (r.r + 6); }
        }
      }
      // keep the pack from stacking into one pixel
      for (let k = 0; k < swimmers.length; k++) {
        const o = swimmers[k]; if (o === s || o.dead) continue;
        const dx = s.x - o.x, dy = s.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 < 144 && d2 > 0.01) { const dd = Math.sqrt(d2), push = (12 - dd) * 3; s.vx += dx / dd * push * dt * 10; s.vy += dy / dd * push * dt * 10; }
      }
      s.ang = angleLerp(s.ang, desired, Math.min(1, 3.4 * dt));
      const sp = s.speed * throttle;
      s.vx = lerp(s.vx, Math.cos(s.ang) * sp, Math.min(1, dt * 3));
      s.vy = lerp(s.vy, Math.sin(s.ang) * sp, Math.min(1, dt * 3));
      if (oc && oc.flow && ((mineFrame + s.slot) & 7) === 0) { const f = oc.flow(s.x, s.y); s.fx = f.x * 0.35; s.fy = f.y * 0.35; }
      s.x += (s.vx + s.fx) * dt; s.y += (s.vy + s.fy) * dt;
      const speed = Math.hypot(s.vx, s.vy);
      s.ph += dt * (2.4 + speed * 0.07);
      // the water answers back
      if (oc) {
        if (oc.disturb && speed > 8 && ((mineFrame + s.slot) & 3) === 0) oc.disturb(s.x, s.y, Math.min(1.6, speed / 42), s.vx, s.vy);
        s.foamT -= dt;
        if (s.foamT <= 0 && oc.addFoam) { s.foamT = 0.12; oc.addFoam(s.x - Math.cos(s.ang) * 6, s.y - Math.sin(s.ang) * 6, 0.09); }
      }
      s.splashT -= dt;
      if (s.splashT <= 0 && g.particles && speed > 20) { s.splashT = 0.2; g.particles.spray(s.x + Math.cos(s.ang) * 5, s.y + Math.sin(s.ang) * 5, s.ang + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), 1, 45); }
      // rolled over by the manatee
      if (pAlive && (p.rolling || (p.roll && p.roll.active)) && d < 17) {
        const a = angleTo(p.x, p.y, s.x, s.y);
        hurtSwimmer(s, (p.stats && p.stats.rollDmg ? p.stats.rollDmg : 0) + 14, Math.cos(a) * 260, Math.sin(a) * 260, a);
        s.state = 'stun'; s.stun = 0.7;
        if (g.particles) g.particles.splash(s.x, s.y, 1.3);
        if (TOON) TOON.shock(s.x, s.y, 40, 0.3);
      }
      // ---- the rope drags you in
      if (s.tethered && pAlive) {
        const a = angleTo(p.x, p.y, s.x, s.y);
        const td = dist(s.x, s.y, p.x, p.y);
        p.vx += Math.cos(a) * TUNE.harpoonPull * dt; p.vy += Math.sin(a) * TUNE.harpoonPull * dt;
        s.bite -= dt;
        if (s.bite <= 0) {
          s.bite = TUNE.harpoonBite / DF.atk;
          if (typeof p.damage === 'function') p.damage(4 * DF.dmg, s.x, s.y);
          if (g.particles) g.particles.blood(p.x, p.y, 0.5, a + Math.PI);
        }
        if (p.rolling || (p.roll && p.roll.active) || td > 300) snapTether(s, true);
      }
      s.x = clamp(s.x, 8, (oc ? oc.W : 4000) - 8);
      s.y = clamp(s.y, (oc ? oc.shoreY : 0) + 12, (oc ? oc.H : 4000) - 8);
    }

    // ---- harpoon shots in flight
    for (let i = harpoons.length - 1; i >= 0; i--) {
      const h = harpoons[i];
      h.life -= dt;
      h.x += h.vx * dt; h.y += h.vy * dt;
      if (pAlive && !h.hit && dist(h.x, h.y, p.x, p.y) < 13) {
        h.hit = true;
        const rolling = p.rolling || (p.roll && p.roll.active);
        if (!rolling && !p.diving) {
          if (typeof p.damage === 'function') p.damage(TUNE.harpoonDmg * DF.dmg, h.x, h.y);
          if (h.owner && !h.owner.dead) { h.owner.tethered = true; h.owner.bite = TUNE.harpoonBite; }
          if (TOON) TOON.impact(p.x, p.y, 1.4, '#ff6161');
          snd('shot', 'harpoon');
        } else if (g.particles) g.particles.sparks(h.x, h.y, 4);
        h.life = 0;
      }
      if (h.life <= 0) {
        if (!h.hit && g.particles) g.particles.splash(h.x, h.y, 0.6);
        harpoons[i] = harpoons[harpoons.length - 1]; harpoons.pop();
      }
    }

    // ---- corpses drift, bleed, then sink
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i];
      c.t += dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= Math.pow(0.2, dt); c.vy *= Math.pow(0.2, dt);
      c.rot += dt * 0.25;
      if (oc && oc.addBlood && Math.random() < 0.3) oc.addBlood(c.x + rand(-4, 4), c.y + rand(-4, 4), 0.06);
      if (c.t > c.life) {
        if (g.particles) g.particles.bubbles(c.x, c.y, 4);
        corpses[i] = corpses[corpses.length - 1]; corpses.pop();
      }
    }
  }

  function fireHarpoon(s, p) {
    const lead = dist(s.x, s.y, p.x, p.y) / TUNE.harpoonSpeed;
    const acc = 0.45 + DF.acc * 0.55;
    const tx = p.x + (p.vx || 0) * lead * acc + rand(-16, 16) * (1 - DF.acc);
    const ty = p.y + (p.vy || 0) * lead * acc + rand(-16, 16) * (1 - DF.acc);
    const a = angleTo(s.x, s.y, tx, ty);
    s.ang = a; s.fireT = 0.28;
    harpoons.push({ x: s.x + Math.cos(a) * 9, y: s.y + Math.sin(a) * 9, vx: Math.cos(a) * TUNE.harpoonSpeed, vy: Math.sin(a) * TUNE.harpoonSpeed, life: 1.5, owner: s, hit: false });
    const g = gg();
    if (g && g.particles) { g.particles.sparks(s.x + Math.cos(a) * 9, s.y + Math.sin(a) * 9, 3, a, 0.5); g.particles.spray(s.x, s.y, a + Math.PI, 2, 50); }
    if (g && g.particles) g.particles.smoke(s.x + Math.cos(a) * 9, s.y + Math.sin(a) * 9, 1, 'rgba(210,225,235,', 2);
    snd('shot', 'harpoon');
  }

  // ---- swimmer rendering: a real front crawl, rigged every frame ---------
  let _hx = 0, _hy = 0, _above = 0;
  function armPose(u, sgn) {
    if (u < Math.PI) {                     // recovery: the arm is out of the water
      const q = u / Math.PI, e = q * q * (3 - 2 * q);
      _hx = -4.5 + 13.2 * e; _hy = sgn * (3.0 + Math.sin(q * Math.PI) * 2.9); _above = 1;
    } else {                                // catch and pull: under the surface
      const q = (u - Math.PI) / Math.PI, e = q * q * (3 - 2 * q);
      _hx = 8.7 - 13.2 * e; _hy = sgn * (2.0 + Math.sin(q * Math.PI) * 1.5); _above = 0;
    }
  }

  function drawSwimmer(ctx, cam, t, s) {
    const sx = Math.round(s.x - cam.x), sy = Math.round(s.y - cam.y);
    if (!onScreen(sx, sy, 56)) return;
    const L = LOOKS[s.look];
    const body = S.torso[s.look], head = S.head[s.look];
    const leap = s.state === 'leap', cling = s.state === 'cling';
    const tread = s.kind === 'harpoon' && !leap && !cling;
    const z = s.z, dy = sy - Math.round(z);
    const ink = HP.ink;
    const skin = L.skin, skinW = L.wetSkin, shirtW = L.wetShirt;

    // ---- shadow / submerged smudge
    if (leap) {
      ctx.fillStyle = 'rgba(6,18,48,0.42)';
      ctx.beginPath(); ctx.ellipse(sx + 2, sy + 4, Math.max(3, 8 - z * 0.07), Math.max(2, 4 - z * 0.035), 0, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(6,18,48,0.22)';
      ctx.beginPath(); ctx.ellipse(sx + 2, sy + 4, 8, 4, 0, 0, TAU); ctx.fill();
    }

    const ph = s.ph;
    setXf(sx, dy, s.ang);

    if (leap) {
      // ---- a fisherman in mid-air: legs trailing, arms flailing
      const f = Math.sin(ph * 2);
      for (let i = 0; i < 2; i++) {
        const sg = i ? 1 : -1;
        limb(ctx, -3.5, sg * 1.8, -10 + f * sg * 2, sg * (3 + f * 2), 3, i ? shade(L.pants, 0.7) : L.pants, ink);
      }
      ctx.save(); ctx.translate(sx, dy); ctx.rotate(s.ang);
      ctx.drawImage(body.c, -body.ax, -body.ay); ctx.restore();
      for (let i = 0; i < 2; i++) {
        const sg = i ? 1 : -1;
        const hx2 = 2 + Math.sin(ph * 3 + i * 2) * 4, hy2 = sg * (6 + Math.cos(ph * 3 + i * 2) * 2);
        ik(4.2, sg * 3, hx2, hy2, 3.6, 3.6, sg);
        limb2(ctx, 4.2, sg * 3, _ikx, _iky, hx2, hy2, 3, 2, L.shirt, skin, ink);
      }
      drawSprite(ctx, head, LX(6.6, 0), LY(6.6, 0), s.ang + Math.sin(ph * 2) * 0.3);
      drawGear(ctx, s, 8, 5, s.ang);
      return;
    }

    // ---- legs kicking below the surface
    if (!cling) {
      for (let i = 0; i < 2; i++) {
        const sg = i ? 1 : -1;
        const k = Math.sin(ph * 2 + (i ? Math.PI : 0));
        const fx2 = -10.5 + Math.abs(k) * 1.2, fy2 = sg * (1.8 + k * 2.6);
        ik(-3.4, sg * 1.7, fx2, fy2, 3.4, 3.4, sg);
        limb2(ctx, -3.4, sg * 1.7, _ikx, _iky, fx2, fy2, 3, 2, L.subPants, L.subPants, null);
        ldot(ctx, fx2, fy2, 2, L.subPantsL);
        // the churn the kick leaves behind
        if (k > 0.85) { ctx.fillStyle = 'rgba(234,248,255,0.5)'; ctx.fillRect(Math.round(LX(fx2 - 2, fy2)) - 1, Math.round(LY(fx2 - 2, fy2)) - 1, 2, 2); }
      }
    }

    if (cling) {
      // ---- latched onto the manatee, knife working
      const jab = s.atk < 0.2 ? 1 - s.atk / 0.2 : Math.max(0, 0.35 - s.stab) * 1.2;
      const reach = 6 + jab * 5.5;
      for (let i = 0; i < 2; i++) {
        const sg = i ? 1 : -1;
        const hx2 = (i ? reach : 6.5), hy2 = sg * 2.6;
        ik(4.2, sg * 3, hx2, hy2, 3.6, 3.6, sg);
        limb2(ctx, 4.2, sg * 3, _ikx, _iky, hx2, hy2, 3, 2, i ? L.shirt : shirtW, i ? skin : skinW, i ? ink : null);
      }
      ctx.save(); ctx.translate(sx, dy); ctx.rotate(s.ang);
      ctx.scale(0.92, 1); ctx.drawImage(body.c, -body.ax, -body.ay); ctx.restore();
      drawSprite(ctx, head, LX(6.4, 0), LY(6.4, 0), s.ang + Math.sin(t * 9) * 0.12);
      drawGear(ctx, s, reach + 1.5, 2.6, s.ang);
      if (jab > 0.6) { ctx.fillStyle = HP.blood; ctx.fillRect(Math.round(LX(reach + 3, 2.6)), Math.round(LY(reach + 3, 2.6)), 2, 1); }
      return;
    }

    if (tread) {
      // ---- treading water: sculling, gun up when the shot is coming
      const aiming = s.atk < 0.6 || (s.fireT || 0) > 0;
      for (let i = 0; i < 2; i++) {
        const sg = i ? 1 : -1;
        const hx2 = aiming ? 6.5 : 1.5 + Math.sin(ph * 3 + i) * 1.5;
        const hy2 = aiming ? sg * 2.2 : sg * (4.6 + Math.cos(ph * 3 + i) * 2.2);
        ik(4.2, sg * 3, hx2, hy2, 3.6, 3.6, sg);
        limb2(ctx, 4.2, sg * 3, _ikx, _iky, hx2, hy2, 3, 2, aiming ? L.shirt : shirtW, aiming ? skin : skinW, aiming ? ink : null);
      }
      ctx.save(); ctx.translate(sx, dy + Math.round(Math.sin(ph * 2) * 0.8)); ctx.rotate(s.ang);
      ctx.scale(0.78, 1); ctx.drawImage(body.c, -body.ax, -body.ay); ctx.restore();
      drawSprite(ctx, head, LX(5.4, 0), LY(5.4, 0) + Math.round(Math.sin(ph * 2) * 0.8), s.ang);
      if (aiming) drawGear(ctx, s, 8.5, 0, s.ang);
      // foam ring: he is holding station, churning hard
      const fa = 0.34 + Math.sin(t * 5 + ph) * 0.12;
      ctx.fillStyle = 'rgba(234,248,255,' + fa.toFixed(2) + ')';
      ctx.fillRect(sx - 7, sy + 3, 14, 1);
      ctx.fillRect(sx - 9 + Math.round(Math.sin(t * 6) * 2), sy + 4, 5, 1);
      ctx.fillRect(sx + 4, sy + 4, 5, 1);
      return;
    }

    // ---- front crawl -----------------------------------------------------
    const u1 = ph % TAU, u2 = (ph + Math.PI) % TAU;
    // the pulling (underwater) arm goes down first
    for (let pass = 0; pass < 2; pass++) {
      const u = pass ? u2 : u1, sg = pass ? -1 : 1;
      armPose(u, sg);
      if (_above) continue;
      ik(4.0, sg * 3.4, _hx, _hy, 4.3, 4.3, sg);
      limb2(ctx, 4.0, sg * 3.4, _ikx, _iky, _hx, _hy, 3, 2, shirtW, skinW, null);
      ldot(ctx, _hx, _hy, 2, mix(skinW, '#8fd4ff', 0.25));
    }
    // ---- the surface froth the body pushes up around itself
    {
      const fa = 0.30 + Math.sin(ph * 2) * 0.12;
      ctx.fillStyle = 'rgba(234,248,255,' + (fa + 0.22).toFixed(2) + ')';
      ctx.fillRect(Math.round(LX(4, -4.6)), Math.round(LY(4, -4.6)), 2, 1);
      ctx.fillRect(Math.round(LX(4, 4.6)), Math.round(LY(4, 4.6)), 2, 1);
      ctx.fillStyle = 'rgba(200,236,255,' + fa.toFixed(2) + ')';
      ctx.fillRect(Math.round(LX(-1, -5)), Math.round(LY(-1, -5)), 3, 1);
      ctx.fillRect(Math.round(LX(-1, 5)), Math.round(LY(-1, 5)), 3, 1);
      ctx.fillRect(Math.round(LX(-6, -4)), Math.round(LY(-6, -4)), 2, 1);
      ctx.fillRect(Math.round(LX(-6, 4)), Math.round(LY(-6, 4)), 2, 1);
    }
    // torso, rolling with the stroke
    const roll = 1 - Math.abs(Math.sin(ph)) * 0.16;
    ctx.save(); ctx.translate(sx, dy); ctx.rotate(s.ang); ctx.scale(1, roll);
    ctx.drawImage(s.flash > 0 ? (S.torsoHurt[s.look] || body).c : body.c, -body.ax, -body.ay);
    ctx.restore();
    // head, breathing to the side
    const yaw = Math.sin(ph) * 0.42;
    drawSprite(ctx, head, LX(6.6, Math.sin(ph) * 0.9), LY(6.6, Math.sin(ph) * 0.9), s.ang + yaw);
    // the recovering arm sweeps over the top
    for (let pass = 0; pass < 2; pass++) {
      const u = pass ? u2 : u1, sg = pass ? -1 : 1;
      armPose(u, sg);
      if (!_above) continue;
      const lift = Math.sin(u) * 1.6;
      ik(4.0, sg * 3.4, _hx, _hy - lift * sg * 0.2, 4.3, 4.3, sg);
      limb2(ctx, 4.0, sg * 3.4, _ikx, _iky - lift, _hx, _hy - lift, 3, 2, L.shirt, L.litSkin, ink);
      ldot(ctx, _hx, _hy - lift, 2, skin);
      if (sg > 0) drawGear(ctx, s, _hx + 1, _hy - lift, s.ang);
      // the splash where the hand knifes back in
      if (u > Math.PI * 0.78) {
        const px2 = Math.round(LX(_hx, _hy)), py2 = Math.round(LY(_hx, _hy));
        ctx.fillStyle = HP.foam;
        ctx.fillRect(px2 - 2, py2 - 1, 4, 2); ctx.fillRect(px2 - 1, py2 - 3, 2, 2); ctx.fillRect(px2 - 1, py2 + 1, 3, 1);
        ctx.fillStyle = 'rgba(200,236,255,0.8)';
        ctx.fillRect(px2 - 4, py2 - 2, 2, 1); ctx.fillRect(px2 + 2, py2 + 1, 3, 1); ctx.fillRect(px2 + 3, py2 - 2, 1, 1);
      }
    }
    // bow wave off the head and the trailing wake
    ctx.fillStyle = 'rgba(240,252,255,0.8)';
    ctx.fillRect(Math.round(LX(10, -2.2)), Math.round(LY(10, -2.2)), 2, 1);
    ctx.fillRect(Math.round(LX(10, 2.2)), Math.round(LY(10, 2.2)), 2, 1);
    ctx.fillStyle = 'rgba(234,248,255,0.5)';
    ctx.fillRect(Math.round(LX(12, -3.4)), Math.round(LY(12, -3.4)), 2, 1);
    ctx.fillRect(Math.round(LX(12, 3.4)), Math.round(LY(12, 3.4)), 2, 1);
    const wob = Math.sin(t * 7 + ph) * 1.6, kick = Math.abs(Math.sin(ph * 2));
    ctx.fillStyle = 'rgba(234,248,255,' + (0.35 + kick * 0.45).toFixed(2) + ')';
    ctx.fillRect(Math.round(LX(-11, wob)), Math.round(LY(-11, wob)), 4, 2);
    ctx.fillStyle = 'rgba(200,236,255,0.45)';
    ctx.fillRect(Math.round(LX(-14, -wob)), Math.round(LY(-14, -wob)), 3, 1);
    ctx.fillRect(Math.round(LX(-17, wob * 0.6)), Math.round(LY(-17, wob * 0.6)), 2, 1);
  }

  function drawGear(ctx, s, hx2, hy2, ang) {
    const gx = LX(hx2, hy2), gy = LY(hx2, hy2);
    if (s.kind === 'knife') drawSprite(ctx, S.knife, gx, gy, ang - 0.15);
    else if (s.kind === 'gaff') drawSprite(ctx, S.gaff, gx, gy, ang - 0.08);
    else drawSprite(ctx, S.hgun, gx, gy, ang);
  }

  function renderCorpses(ctx, cam, t) {
    for (let i = 0; i < corpses.length; i++) {
      const c = corpses[i];
      const sx = Math.round(c.x - cam.x), sy = Math.round(c.y - cam.y);
      if (!onScreen(sx, sy, 40)) continue;
      const k = c.t / c.life;
      ctx.globalAlpha = k > 0.75 ? clamp((1 - k) * 4, 0, 1) : 1;
      ctx.fillStyle = 'rgba(6,18,48,0.28)';
      ctx.beginPath(); ctx.ellipse(sx + 3, sy + 4, 8, 4, 0, 0, TAU); ctx.fill();
      drawSprite(ctx, S.corpse[c.look], sx, sy + Math.sin(t * 2 + c.x) * 0.6, c.ang + c.rot, 1, 1 - k * 0.35);
      ctx.globalAlpha = 1;
    }
  }

  function renderRopes(ctx, cam, t) {
    // harpoons in flight, and the rope back to the swimmer who threw them
    for (let i = 0; i < harpoons.length; i++) {
      const h = harpoons[i];
      const sx = h.x - cam.x, sy = h.y - cam.y;
      if (!onScreen(sx, sy, 60)) continue;
      const o = h.owner;
      if (o && !o.dead) ropeLine(ctx, o.x - cam.x, o.y - cam.y, sx, sy, t, 0.35);
      drawSprite(ctx, S.hshot, sx, sy, Math.atan2(h.vy, h.vx));
    }
    const g = gg(), p = g && g.player;
    if (!p || p.dead) return;
    for (let i = 0; i < swimmers.length; i++) {
      const s = swimmers[i];
      if (!s.tethered || s.dead) continue;
      ropeLine(ctx, s.x - cam.x, s.y - cam.y, p.x - cam.x, p.y - cam.y, t, 1);
      // the barb, buried in the hide
      const a = angleTo(p.x, p.y, s.x, s.y);
      drawSprite(ctx, S.hshot, p.x - cam.x + Math.cos(a) * 6, p.y - cam.y + Math.sin(a) * 6, a + Math.PI);
    }
  }

  function ropeLine(ctx, x0, y0, x1, y1, t, taut) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1 || len > 520) return;
    const n = Math.min(40, Math.max(4, Math.round(len / 5)));
    const nx = -dy / len, ny = dx / len;
    const sag = (1 - taut) * 6 + Math.sin(t * 6) * (1 - taut) * 2;
    for (let i = 0; i <= n; i++) {
      const u = i / n, bow = Math.sin(u * Math.PI) * sag;
      const px2 = Math.round(x0 + dx * u + nx * bow), py2 = Math.round(y0 + dy * u + ny * bow);
      ctx.fillStyle = (i & 1) ? HP.rope : HP.ropeD;
      ctx.fillRect(px2, py2, 1, 1);
    }
  }

  // =======================================================================
  //  7.  CANNON SHELLS  --  big, slow, arcing, and very dodgeable
  // =======================================================================
  const shells = [];
  const SHELL_G = 340;

  function fireCannon(x, y, tx, ty, opts) {
    if (!built) buildSprites();
    opts = opts || {};
    const d = dist(x, y, tx, ty);
    const speed = opts.speed || TUNE.cannonSpeed;
    const flight = clamp(d / speed, 0.6, 2.4);
    const sh = {
      x: x, y: y, z: opts.z0 || 4,
      vx: (tx - x) / flight, vy: (ty - y) / flight,
      vz: 0.5 * SHELL_G * flight,
      tx: tx, ty: ty,
      tTotal: flight, tLeft: flight,
      blast: opts.blast || TUNE.cannonBlast,
      dmg: (opts.dmg === undefined ? TUNE.cannonDmg : opts.dmg),
      kind: opts.kind || 'cannon',
      spin: rand(-6, 6), rot: rand(0, TAU),
      smokeT: 0, dead: false,
    };
    shells.push(sh);
    const g = gg();
    if (g) {
      if (g.particles) { g.particles.sparks(x, y, 12, Math.atan2(sh.vy, sh.vx), 0.6); g.particles.smoke(x, y, 5, 'rgba(60,58,66,', 4); g.particles.spray(x, y, Math.atan2(sh.vy, sh.vx), 3, 70); }
      if (g.ocean && g.ocean.disturb) g.ocean.disturb(x, y, 3, sh.vx, sh.vy);
      if (g.shake) g.shake(opts.kind === 'mortar' ? 2.5 : 4);
    }
    if (TOON) { TOON.burst(x, y, 0.75, '#ffe48f'); TOON.speed(x, y, Math.atan2(sh.vy, sh.vx), 2); }
    snd('explosion', opts.kind === 'mortar' ? 0.5 : 0.75);
    return sh;
  }

  function stepShells(dt, t, g) {
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      s.tLeft -= dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vz -= SHELL_G * dt; s.z += s.vz * dt;
      s.rot += s.spin * dt;
      s.smokeT -= dt;
      if (s.smokeT <= 0 && g.particles) { s.smokeT = 0.05; g.particles.smoke(s.x, s.y - s.z, 1, 'rgba(70,68,78,', 3); }
      if (s.tLeft <= 0 || (s.z <= 0 && s.vz < 0)) {
        shells[i] = shells[shells.length - 1]; shells.pop();
        // ---- impact: a tower of water, then the shove
        if (g.particles) { g.particles.splash(s.x, s.y, 3.2); g.particles.splash(s.x + rand(-10, 10), s.y + rand(-8, 8), 1.6); }
        if (g.ocean && g.ocean.ripple) { g.ocean.ripple(s.x, s.y, s.blast * 3.4, 300, 1); }
        blast(s.x, s.y, s.blast, s.dmg * DF.dmg, { debris: 8, debrisColors: ['#7d858f', '#4a515a', '#aeb6c1'] });
        if (TOON) { TOON.shock(s.x, s.y, s.blast * 2.4, 0.6, '#eaf8ff'); TOON.shock(s.x, s.y, s.blast * 1.4, 0.4); }
      }
    }
  }

  function renderShellShadows(ctx, cam, t) {
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i];
      const sx = Math.round(s.x - cam.x), sy = Math.round(s.y - cam.y);
      if (!onScreen(sx, sy, 60)) continue;
      const k = clamp(1 - s.z / 90, 0.25, 1);
      ctx.fillStyle = 'rgba(6,18,48,' + (0.42 * k).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(sx + 2, sy + 3, Math.round(3 + 4 * k), Math.round(2 + 2 * k), 0, 0, TAU); ctx.fill();
    }
  }

  function renderShells(ctx, cam, t) {
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i];
      const sx = Math.round(s.x - cam.x), sy = Math.round(s.y - cam.y - s.z);
      if (!onScreen(sx, sy, 70)) continue;
      const idx = clamp(Math.floor(s.z / 26), 0, S.ball.length - 1);
      // a dark halo so the ball never disappears into light water either
      ctx.fillStyle = 'rgba(8,20,34,0.38)';
      ctx.fillRect(sx - S.ball[idx].ax, sy - S.ball[idx].ay, S.ball[idx].w, S.ball[idx].h);
      drawSprite(ctx, S.ball[idx], sx, sy, s.rot);
      // a hot rim so it reads against dark water
      ctx.fillStyle = '#ffd27a';
      ctx.fillRect(sx - 1, sy - S.ball[idx].ay, 2, 1);
      ctx.fillStyle = 'rgba(255,214,122,0.4)';
      ctx.fillRect(sx - 2, sy + S.ball[idx].ay - 1, 4, 1);
    }
  }

  // the predicted splash-down, painted on the water so it is never a surprise
  function renderImpactMarkers(ctx, cam, t) {
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i];
      const sx = Math.round(s.tx - cam.x), sy = Math.round(s.ty - cam.y);
      if (!onScreen(sx, sy, 50)) continue;
      const k = clamp(1 - s.tLeft / s.tTotal, 0, 1);
      const r = Math.round(s.blast * 0.52);
      const hot = k > 0.72;
      const col = hot ? (Math.sin(t * 40) > 0 ? '#ffffff' : HP.warn) : HP.warn2;
      ctx.globalAlpha = 0.4 + k * 0.6;
      // outer ring: dense dashes, so it reads as a circle drawn on the water
      ctx.fillStyle = col;
      const n = 40;
      for (let q = 0; q < n; q++) {
        if ((q % 3) === 2) continue;
        const a = t * 1.6 + q / n * TAU;
        ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r * 0.72), 1, 1);
      }
      // inner ring closes in on the mark as the shell falls
      const ir = Math.round(3 + (1 - k) * (r - 4));
      ctx.fillStyle = hot ? '#ffffff' : HP.warn;
      for (let q = 0; q < 16; q++) {
        if (q & 1) continue;
        const a = -t * 3 + q / 16 * TAU;
        ctx.fillRect(Math.round(sx + Math.cos(a) * ir), Math.round(sy + Math.sin(a) * ir * 0.72), 1, 1);
      }
      // crosshair
      ctx.fillRect(sx - r - 3, sy, 4, 1); ctx.fillRect(sx + r, sy, 4, 1);
      ctx.fillRect(sx, sy - Math.round(r * 0.72) - 3, 1, 4); ctx.fillRect(sx, sy + Math.round(r * 0.72), 1, 4);
      ctx.fillStyle = hot ? '#ffffff' : col;
      ctx.fillRect(sx - 1, sy - 1, 3, 3);
      ctx.globalAlpha = 1;
    }
  }

  // =======================================================================
  //  8.  GUN CREWS  --  deck cannons, mortar barges and boarding parties
  // =======================================================================
  function crewOf(e) {
    let c = e.__hz;
    if (!c) {
      c = e.__hz = {
        cd: rand(1.5, 4), state: 'idle', aimT: 0, aimT0: 1, tx: 0, ty: 0,
        board: rand(2, 7), pend: 0, pendT: 0, px: 0, py: 0,
        jx: 0, jy: 0, slotA: undefined, ring: TUNE.flankRing * rand(0.78, 1.3),
        role: TUNE.gunners[e.type] || null, flash: 0,
      };
    }
    return c;
  }

  function armCannon(e, kind) { const c = crewOf(e); c.role = kind || 'cannon'; return c; }

  function boardFrom(e) {
    if (!e || e.dead) return 0;
    if (!built) buildSprites();
    const g = gg(); const p = g && g.player;
    if (!p || p.dead) return 0;
    const cap = Math.round(TUNE.maxSwimmers * DF.cnt);
    let n = TUNE.boardTypes[e.type] || TUNE.boardCrew;
    n = Math.min(n, Math.max(0, cap - swimmers.length));
    if (n <= 0) return 0;
    const base = angleTo(e.x, e.y, p.x, p.y);
    for (let i = 0; i < n; i++) {
      const side = (i & 1) ? 1 : -1;
      const off = base + side * rand(0.35, 1.0);
      const sx = e.x + Math.cos(off) * (e.radius + 3), sy = e.y + Math.sin(off) * (e.radius + 3);
      const kind = Math.random() < 0.18 ? 'harpoon' : (Math.random() < 0.34 ? 'gaff' : 'knife');
      const s = spawnSwimmer(sx, sy, kind);
      // the leap: a real arc off the gunwale toward the water near the player
      const land = e.radius + rand(22, 58);
      const la = base + rand(-0.5, 0.5);
      const lx2 = e.x + Math.cos(la) * land, ly2 = e.y + Math.sin(la) * land;
      const flight = rand(0.5, 0.72);
      s.state = 'leap'; s.stateT = 0;
      s.x = sx; s.y = sy; s.z = 5;
      s.vx = (lx2 - sx) / flight; s.vy = (ly2 - sy) / flight;
      s.vz = 0.5 * 340 * flight;
      s.ang = Math.atan2(s.vy, s.vx);
      if (TOON) TOON.emote(sx + 6, sy - 20, '!');
      if (g.particles) g.particles.spray(sx, sy, off, 3, 60);
    }
    if (g.particles) g.particles.spray(e.x, e.y, base, 5, 70);
    if (g.ocean && g.ocean.disturb) g.ocean.disturb(e.x, e.y, 2.4, 0, 0);
    e.kx -= Math.cos(base) * 60; e.ky -= Math.sin(base) * 60;
    snd('tone', 420, 0.12, 'square', 0.07, 160);
    return n;
  }

  function stepCrews(dt, t, g) {
    const list = g.enemies; if (!list || !list.length) return;
    const p = g.player; const pAlive = p && !p.dead;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (!e || e.dead) continue;
      const c = crewOf(e);
      c.cd -= dt; c.board -= dt; if (c.flash > 0) c.flash -= dt;
      const d = pAlive ? dist(e.x, e.y, p.x, p.y) : 1e9;

      // ---- cluster shells still queued up on a mortar barge
      if (c.pend > 0) {
        c.pendT -= dt;
        if (c.pendT <= 0) {
          c.pendT = 0.16; c.pend--;
          const sp = TUNE.mortarSpread * (0.6 + Math.random() * 0.8);
          const a = rand(0, TAU);
          const mx = c.px + Math.cos(a) * sp, my = c.py + Math.sin(a) * sp;
          const ea = angleTo(e.x, e.y, mx, my);
          fireCannon(e.x + Math.cos(ea) * e.radius * 0.5, e.y + Math.sin(ea) * e.radius * 0.5, mx, my,
            { dmg: TUNE.mortarDmg, blast: TUNE.mortarBlast, speed: TUNE.mortarSpeed, kind: 'mortar' });
          c.flash = 0.1;
          e.kx -= Math.cos(ea) * 40; e.ky -= Math.sin(ea) * 40;
        }
      }

      // ---- the deck gun
      if (c.role && pAlive) {
        const isMortar = c.role === 'mortar';
        const range = isMortar ? TUNE.mortarRange : TUNE.cannonRange;
        if (c.state === 'idle') {
          if (c.cd <= 0 && d < range && d > 55) {
            c.state = 'aim';
            c.aimT0 = c.aimT = (isMortar ? TUNE.mortarAim : TUNE.cannonAim) / DF.atk;
            const sloppy = (1 - DF.acc) * (isMortar ? 40 : 26);
            c.jx = rand(-sloppy, sloppy); c.jy = rand(-sloppy, sloppy);
            if (TOON) TOON.emote(e.x + 10, e.y - e.radius - 12, '!');
            snd('tone', 210, 0.16, 'sawtooth', 0.09, 90);
          }
        } else if (c.state === 'aim') {
          // the aim point keeps leading you, so a late juke still works
          const speed = isMortar ? TUNE.mortarSpeed : TUNE.cannonSpeed;
          const flight = clamp(d / speed, 0.6, 2.4);
          const lead = TUNE.shellLead * (0.35 + DF.acc * 0.65);
          c.tx = p.x + (p.vx || 0) * flight * lead + c.jx;
          c.ty = p.y + (p.vy || 0) * flight * lead + c.jy;
          c.aimT -= dt;
          if (c.aimT <= 0) {
            const a = angleTo(e.x, e.y, c.tx, c.ty);
            e.angle = angleLerp(e.angle, a, 0.5);
            if (isMortar) {
              c.px = c.tx; c.py = c.ty;
              c.pend = Math.max(1, Math.round(TUNE.mortarShells * (0.8 + (DF.d - 1) * 0.5)));
              c.pendT = 0;
              c.cd = TUNE.mortarCd / DF.atk * rand(0.85, 1.2);
            } else {
              fireCannon(e.x + Math.cos(a) * (e.radius + 2), e.y + Math.sin(a) * (e.radius + 2), c.tx, c.ty,
                { dmg: TUNE.cannonDmg, blast: TUNE.cannonBlast, speed: TUNE.cannonSpeed, kind: 'cannon' });
              e.kx -= Math.cos(a) * 240; e.ky -= Math.sin(a) * 240;
              c.cd = TUNE.cannonCd / DF.atk * rand(0.85, 1.2);
            }
            c.flash = 0.12;
            c.state = 'idle';
          }
        }
      }

      // ---- boarders: the crew goes over the side
      if (TUNE.boarders && pAlive && c.board <= 0 && TUNE.boardTypes[e.type] && d < TUNE.boardRange) {
        if (boardFrom(e) > 0) c.board = TUNE.boardCd / DF.atk * rand(0.8, 1.25);
        else c.board = 2;
      }
    }
  }

  function renderCrewsOver(ctx, cam, t) {
    const g = gg(); if (!g || !g.enemies) return;
    const list = g.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (!e || e.dead) continue;
      const c = e.__hz; if (!c) continue;
      if (c.flash > 0) {
        const fx2 = Math.round(e.x - cam.x), fy2 = Math.round(e.y - cam.y);
        if (onScreen(fx2, fy2, 40)) {
          ctx.fillStyle = c.flash > 0.06 ? '#fff6d5' : '#ffd27a';
          const a = e.angle || 0, r = e.radius + 3;
          const mx = Math.round(fx2 + Math.cos(a) * r), my = Math.round(fy2 + Math.sin(a) * r);
          ctx.fillRect(mx - 3, my - 3, 6, 6); ctx.fillRect(mx - 5, my - 1, 10, 2); ctx.fillRect(mx - 1, my - 5, 2, 10);
        }
      }
      if (c.state !== 'aim') continue;
      const ex = Math.round(e.x - cam.x), ey = Math.round(e.y - cam.y);
      const tx = Math.round(c.tx - cam.x), ty = Math.round(c.ty - cam.y);
      if (!onScreen(ex, ey, 140) && !onScreen(tx, ty, 140)) continue;
      const k = clamp(1 - c.aimT / c.aimT0, 0, 1);
      // ---- the aim line: dashes marching from the muzzle to the target
      const dx = tx - ex, dy = ty - ey, len = Math.hypot(dx, dy) || 1;
      const n = Math.min(46, Math.round(len / 7));
      ctx.globalAlpha = 0.25 + k * 0.6;
      for (let q = 1; q < n; q++) {
        const u = (q / n + (t * 0.7) % (1 / n));
        if (u > 1) continue;
        ctx.fillStyle = (q & 1) ? HP.warn : HP.warn2;
        ctx.fillRect(Math.round(ex + dx * u), Math.round(ey + dy * u), 2, 1);
      }
      ctx.globalAlpha = 1;
      // ---- wind-up reticle: three brackets closing on the mark
      const rr = Math.round(18 - k * 10);
      ctx.fillStyle = k > 0.8 ? '#ffffff' : HP.warn;
      for (let q = 0; q < 4; q++) {
        const cx2 = tx + (q & 1 ? rr : -rr), cy2 = ty + (q & 2 ? Math.round(rr * 0.7) : -Math.round(rr * 0.7));
        ctx.fillRect(cx2 - 1, cy2 - 1, 3, 1); ctx.fillRect(cx2 - 1, cy2 - 1, 1, 3);
      }
      ctx.fillRect(tx - 1, ty - 1, 2, 2);
      // ---- the charge building at the muzzle
      const ga = e.angle || 0;
      const mx = Math.round(ex + Math.cos(ga) * (e.radius + 2)), my = Math.round(ey + Math.sin(ga) * (e.radius + 2));
      const gs = 1 + Math.round(k * 3);
      ctx.fillStyle = k > 0.75 ? '#fff6d5' : k > 0.4 ? '#ffd27a' : '#e6802a';
      ctx.fillRect(mx - gs, my - gs, gs * 2, gs * 2);
    }
  }

  // =======================================================================
  //  9.  COORDINATION  --  boats flank and encircle instead of beelining
  // =======================================================================
  let coordT = 0, coordBase = 0;
  function stepCoordination(dt, g) {
    const list = g.enemies; if (!list || !list.length) return;
    const p = g.player; if (!p || p.dead) return;
    coordT -= dt;
    if (coordT <= 0) {
      coordT = 0.5;
      coordBase += 0.11;
      const n = list.length;
      for (let i = 0; i < n; i++) crewOf(list[i]).slotA = coordBase + (i / n) * TAU;
    }
    const flank = TUNE.flank * clamp(0.4 + (DF.d - 1) * 0.45, 0, 1.5);
    const avoid = TUNE.boatMineAvoid;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (!e || e.dead) continue;
      const c = e.__hz; if (!c) continue;
      // difficulty: faster hulls, faster guns
      if (e.cfg) e.speed = e.cfg.speed * TUNE.enemySpeed * DF.spd;
      const rate = TUNE.enemyAtkRate * DF.atk;
      if (rate !== 1 && e.attackT !== undefined) e.attackT -= dt * (rate - 1);
      // ---- take a station on the ring around the player
      if (flank > 0 && c.slotA !== undefined) {
        const d = dist(e.x, e.y, p.x, p.y);
        if (d > 42) {
          const gx = p.x + Math.cos(c.slotA) * c.ring, gy = p.y + Math.sin(c.slotA) * c.ring;
          const want = angleTo(e.x, e.y, gx, gy);
          e.angle = angleLerp(e.angle, want, Math.min(0.6, flank * 1.1 * dt));
        }
      }
      // ---- they know their own minefield (bait them anyway)
      if (avoid > 0) for (let m = 0; m < mines.length; m++) {
        const mn = mines[m]; if (mn.dead) continue;
        const dx = mn.x - e.x, dy = mn.y - e.y, d2 = dx * dx + dy * dy;
        if (d2 > 5200 || d2 < 1) continue;
        const ar = Math.atan2(dy, dx), diff = angleDiff(e.angle, ar);
        if (Math.abs(diff) < 1.1) e.angle -= sign(diff) * avoid * 2.2 * dt * (1 - Math.sqrt(d2) / 72);
      }
    }
  }

  // =======================================================================
  //  10. PROJECTILE BRIDGE
  //      Player shots hit swimmers and mines; enemy shots get sharper as the
  //      difficulty climbs. Both without touching entities.js.
  // =======================================================================
  function stepProjectiles(dt, g) {
    const list = g.projectiles; if (!list || !list.length) return;
    const p = g.player, pAlive = p && !p.dead;
    const assist = TUNE.aimAssist * DF.acc;
    for (let i = 0; i < list.length; i++) {
      const pr = list[i];
      if (!pr || pr.dead) continue;
      // ---- one-time pass over brand new enemy shots: lead the target
      if (!pr.__hz) {
        pr.__hz = 1;
        if (assist > 0 && pAlive && pr.owner === 'enemy' && !pr.arc) {
          const sp = Math.hypot(pr.vx, pr.vy) || 1;
          const flight = dist(pr.x, pr.y, p.x, p.y) / sp;
          const tx = p.x + (p.vx || 0) * flight * 0.9, ty = p.y + (p.vy || 0) * flight * 0.9;
          const na = angleLerp(Math.atan2(pr.vy, pr.vx), angleTo(pr.x, pr.y, tx, ty), clamp(assist, 0, 0.9));
          const nsp = sp * (1 + DF.acc * 0.22);
          pr.vx = Math.cos(na) * nsp; pr.vy = Math.sin(na) * nsp;
        }
      }
      if (pr.owner !== 'player') continue;
      if (pr.arc && pr.z > 0) continue;
      const r = (pr.size || 3) + 6;
      // ---- swimmers
      for (let k = 0; k < swimmers.length; k++) {
        const s = swimmers[k]; if (s.dead || s.z > 14) continue;
        const dx = s.x - pr.x, dy = s.y - pr.y;
        if (dx * dx + dy * dy > r * r) continue;
        if (pr.hits) { if (pr.hits.has(s)) continue; pr.hits.add(s); }
        let dmg = pr.dmg || 10;
        if (pr.crit && p && p.stats) dmg *= (p.stats.critMult || 1.5);
        hurtSwimmer(s, dmg, pr.vx * 0.12, pr.vy * 0.12, Math.atan2(pr.vy, pr.vx));
        if (pr.explode) { if (pr.detonate) pr.detonate(); pr.dead = true; break; }
        if (pr.pierce > 0) pr.pierce--; else { pr.dead = true; break; }
      }
      if (pr.dead) continue;
      // ---- mines: shooting one from range is the safe play
      for (let k = 0; k < mines.length; k++) {
        const m = mines[k]; if (m.dead) continue;
        const dx = m.x - pr.x, dy = m.y - pr.y;
        if (dx * dx + dy * dy > (r + 5) * (r + 5)) continue;
        if (pr.hits) { if (pr.hits.has(m)) continue; pr.hits.add(m); }
        m.hp -= (pr.dmg || 10);
        if (g.particles) g.particles.sparks(pr.x, pr.y, 5);
        if (TOON) TOON.impact(m.x, m.y, 0.9, '#ffffff');
        snd('hit');
        if (m.hp <= 0) detonateMine(m);
        if (pr.explode) { if (pr.detonate) pr.detonate(); pr.dead = true; break; }
        if (pr.pierce > 0) pr.pierce--; else { pr.dead = true; break; }
      }
    }
  }

  // =======================================================================
  //  11. SPAWNING  --  swimmers arrive as ordinary wave enemies too
  // =======================================================================
  let spawnT = 8;
  function pickKind() {
    const pool = TUNE.spawnKinds;
    let tot = 0; for (const k in pool) tot += pool[k];
    let r = Math.random() * tot;
    for (const k in pool) { r -= pool[k]; if (r <= 0) return k; }
    return 'knife';
  }
  function spawnWave(n, kind) {
    const g = gg(); const p = g && g.player; if (!p) return 0;
    const oc = g.ocean;
    const W = oc ? oc.W : (world.w || 3200), H = oc ? oc.H : (world.h || 2400), sy0 = (oc ? oc.shoreY : world.shoreY) + 30;
    const base = rand(0, TAU);
    let made = 0;
    for (let i = 0; i < n; i++) {
      const a = base + (i - n / 2) * 0.34 + rand(-0.2, 0.2), r = rand(210, 275);
      const x = clamp(p.x + Math.cos(a) * r, 20, W - 20);
      const y = clamp(p.y + Math.sin(a) * r, sy0, H - 20);
      spawnSwimmer(x, y, kind || pickKind());
      made++;
    }
    return made;
  }
  function stepSpawner(dt, g) {
    if (!TUNE.autoSpawn) return;
    const p = g.player; if (!p || p.dead) return;
    if (g.director && g.director.started === false) return;
    spawnT -= dt;
    if (spawnT > 0) return;
    spawnT = TUNE.spawnInterval / Math.pow(DF.d, 0.9) * rand(0.75, 1.3);
    const cap = Math.round(TUNE.maxSwimmers * DF.cnt);
    if (swimmers.length >= cap) return;
    let n = randi(TUNE.spawnBurst[0], TUNE.spawnBurst[1]);
    if (DF.d > 2) n++;
    if (DF.d > 3.5) n++;
    spawnWave(Math.min(n, cap - swimmers.length));
  }

  // =======================================================================
  //  12. POPULATE  --  scatter the minefields across the whole ocean
  // =======================================================================
  const world = { w: 3200, h: 2400, shoreY: 300 };
  function populate(worldW, worldH, shoreY) {
    if (!built) buildSprites();
    world.w = worldW || world.w; world.h = worldH || world.h; world.shoreY = shoreY === undefined ? world.shoreY : shoreY;
    mines.length = 0; mineSeq = 0;
    const g = gg();
    const rocks = (g && g.rocks) || [];
    const safeX = (g && g.pier) ? g.pier.x : world.w / 2;
    const safeY = world.shoreY + 230;
    const total = Math.round(TUNE.mineCount * (1 + (DF.d - 1) * 0.35));
    const y0 = world.shoreY + 170, y1 = world.h - 60;
    const free = (x, y, pad) => {
      if (x < 50 || x > world.w - 50 || y < y0 || y > y1) return false;
      if (dist(x, y, safeX, safeY) < 260) return false;
      for (let i = 0; i < rocks.length; i++) if (dist(x, y, rocks[i].x, rocks[i].y) < rocks[i].r + 26) return false;
      for (let i = 0; i < mines.length; i++) if (dist(x, y, mines[i].x, mines[i].y) < pad) return false;
      return true;
    };
    // ---- minefields: clusters that chain-detonate beautifully
    const clusters = Math.max(0, Math.round(TUNE.mineClusters * (1 + (DF.d - 1) * 0.25)));
    let made = 0, tries = 0;
    for (let c = 0; c < clusters && tries < 900; c++) {
      let cx = 0, cy = 0, ok = false;
      for (let q = 0; q < 40 && !ok; q++) { cx = rand(120, world.w - 120); cy = rand(y0, y1); ok = free(cx, cy, 150); tries++; }
      if (!ok) continue;
      const n = randi(3, 6);
      for (let i = 0; i < n && made < total; i++) {
        for (let q = 0; q < 24; q++) {
          const a = rand(0, TAU), r = rand(38, 118);
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8;
          if (!free(x, y, 46)) { tries++; continue; }
          const m = spawnMine(x, y, Math.random() < TUNE.mineProxShare ? 'proximity' : 'contact');
          m.ax = x + rand(-8, 8); m.ay = y + rand(-8, 8);
          made++; break;
        }
      }
    }
    // ---- loners, salted across the open water
    tries = 0;
    while (made < total && tries++ < 1800) {
      const x = rand(60, world.w - 60), y = rand(y0, y1);
      if (!free(x, y, 120)) continue;
      const m = spawnMine(x, y, Math.random() < TUNE.mineProxShare ? 'proximity' : 'contact');
      m.ax = x + rand(-8, 8); m.ay = y + rand(-8, 8);
      made++;
    }
    return made;
  }

  // =======================================================================
  //  13. PUBLIC API
  // =======================================================================
  const PANTS = ['#55637a', '#6b543a', '#455a6b', '#7a6244', '#4c6350', '#5f4a60', '#8a7a5e', '#6a4a3a'];

  const Hazards = {
    difficulty: 1,
    tune: TUNE,
    mines: mines, swimmers: swimmers, shells: shells,
    corpses: corpses, harpoons: harpoons,
    sprites: S,

    init() {
      if (built) return this;
      bindFx();
      for (let i = 0; i < LOOKS.length; i++) {
        const L = LOOKS[i];
        L.pants = PANTS[i % PANTS.length];
        L.pantsD = shade(L.pants, 0.52);
        L.wetSkin = mix(shade(L.skin, 0.7), WATER_TINT, 0.6);
        L.litSkin = shade(L.skin, 1.18);
        L.wetShirt = mix(shade(L.shirt, 0.68), WATER_TINT, 0.62);
        L.subPants = mix(shade(L.pants, 0.8), WATER_TINT, 0.58);
        L.subPantsL = mix(L.subPants, '#8fd4ff', 0.3);
        L.subInk = mix(HP.ink, WATER_TINT, 0.62);
      }
      buildSprites();
      S.torsoHurt = [];
      for (let i = 0; i < S.torso.length; i++) S.torsoHurt.push(tintSprite(S.torso[i], '#ffffff', 0.82));
      return this;
    },

    reset() {
      mines.length = 0; swimmers.length = 0; shells.length = 0;
      corpses.length = 0; harpoons.length = 0;
      mineSeq = 0; spawnT = TUNE.spawnInterval * 0.6; coordT = 0; coordBase = 0; mineFrame = 0;
      DF.d = -1;                       // force the difficulty curve to recompute
      difficulty();
      return this;
    },

    populate: populate,
    spawnMine: spawnMine,
    spawnSwimmer: spawnSwimmer,
    spawnWave: spawnWave,
    boardFrom: boardFrom,
    fireCannon: fireCannon,
    armCannon: armCannon,
    detonate(x, y, r, dmg) { blast(x, y, r || TUNE.mineBlast, dmg === undefined ? TUNE.mineDmg : dmg, {}); },
    killSwimmer: killSwimmer,
    applyWaveScaling: applyWaveScaling,

    update(dt, t) {
      if (!built) this.init();
      bindFx();
      const g = gg(); if (!g) return;
      if (!(dt > 0)) return;
      if (dt > 0.1) dt = 0.1;
      difficulty();
      stepMines(dt, t, g);
      stepSwimmers(dt, t, g);
      stepShells(dt, t, g);
      stepCrews(dt, t, g);
      stepCoordination(dt, g);
      stepProjectiles(dt, g);
      stepSpawner(dt, g);
      // small per-swimmer timers that do not belong in the movement pass
      for (let i = 0; i < swimmers.length; i++) { const s = swimmers[i]; if (s.fireT > 0) s.fireT -= dt; }
    },

    // everything that sits on or under the surface (call before the player)
    render(ctx, cam, t) {
      if (!built || !cam) return;
      setView(ctx);
      renderShellShadows(ctx, cam, t);
      renderCorpses(ctx, cam, t);
      renderMines(ctx, cam, t);
      for (let i = 0; i < swimmers.length; i++) if (swimmers[i].state !== 'leap') drawSwimmer(ctx, cam, t, swimmers[i]);
    },

    // anything that must sit ON TOP: leaps in mid-air, ropes, markers, shells
    renderOver(ctx, cam, t) {
      if (!built || !cam) return;
      setView(ctx);
      for (let i = 0; i < swimmers.length; i++) if (swimmers[i].state === 'leap') drawSwimmer(ctx, cam, t, swimmers[i]);
      renderMinesOver(ctx, cam, t);
      renderCrewsOver(ctx, cam, t);
      renderImpactMarkers(ctx, cam, t);
      renderRopes(ctx, cam, t);
      renderShells(ctx, cam, t);
    },

    // handy for HUD / debugging
    counts() { return { mines: mines.length, swimmers: swimmers.length, shells: shells.length, corpses: corpses.length }; },
  };

  global.Hazards = Hazards;
})(typeof window !== 'undefined' ? window : this);
