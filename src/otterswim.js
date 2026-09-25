// ===========================================================================
//  CAPTAIN OTTER, OVERBOARD  --  the otter on his own in the water, top-down
//  -------------------------------------------------------------------------
//  When the manatee goes down he goes over the side, and this is him in the
//  sea: the same animal who rides her -- tricorn, eyepatch, cigar, burgundy
//  captain's coat with the gold lace, steel pauldrons, bandolier -- swimming
//  flat out with the cutlass in his fist.
//
//  Built from the canonical cast in src/chars.js (CPAL, px, stamp, newCanHi,
//  spriteFromHi, tintFlat, the live head from otterHeadWithFace, CH.otterTail,
//  CH.cigar) and rasterized at DETAIL art pixels per world unit like the rest
//  of the pair, so the patched 3-arg drawImage scales it and one art pixel
//  lands on one layer pixel. No arc, no ellipse, no gradients, no blur.
//
//  Top-down, body along +x (his heading). The body is a baked flipbook of
//  undulation frames (3 amplitudes x 8 phases), so the wave that runs down
//  his back is real pixels rather than a squash. The four limbs, the tail and
//  the head are separate so they paddle, scull and bob on their own phases.
//
//  API (all world units, drawn into the DETAIL-scaled world layer)
//    OtterSwim.build()                 idempotent; bakes ~50 small canvases
//    OtterSwim.draw(ctx, x, y, s)      the whole otter, posed. s = {
//        t, heading, flip (eased -1..1, sign = which flank is up),
//        phase, mode: 'tread'|'swim'|'dash'|'haul'|'leap',
//        z (height, for a leap), exp, blink, rage, hurt (white frame),
//        alpha, slash: {phase:'wind'|'strike'|'recover', k, side, arc} | null }
//    OtterSwim.drawSlash(ctx, x, y, sl)   the cutlass arc. sl = {
//        phase, k, dir (world), wside (+-1 sweep), arc, range, heavy }
//    OtterSwim.REACH                  world units from his centre to the tip
// ===========================================================================
const OtterSwim = (() => {
  const A = (typeof AS !== 'undefined') ? AS : 2;   // art px per world unit
  const BW = 28, BH = 22;                // body canvas, world units
  const OX = 32, OY = 22;                // body origin inside it, art px
  const NPH = 8;                          // frames per stroke
  const AMPS = [0.9, 2.0, 3.4];           // spine sway in art px: tread/swim/dash
  const X_TAIL = 10, X_NECK = 52;         // art x of the hips and the neck
  const X_WET = 26;                       // aft of this he is under the surface
  // half-width of him along the spine, art px: haunches, belly, chest, neck
  const HW = [[10, 3], [12, 6], [16, 8], [24, 9], [32, 10], [40, 10], [45, 9], [49, 7], [52, 4]];
  const WATER = '#17506b';
  // where things hang off the body, WORLD units in the body frame
  const FORE = { x: 3.5, y: 4.4 };        // shoulder sockets (+-y)
  const HIND = { x: -8.5, y: 3.6 };       // hip sockets
  const NECK = 11;                        // where the head sits
  const HEAD_LIFT = 3;                    // head held up out of the water
  const TAIL_X = -10.5;                   // tail root
  const LIMB_LEN = 6.2;                   // socket to paw, world units
  const REACH = 26;                       // centre to the cutlass tip, roughly

  let built = false;
  const S = { body: [], bodyH: [], fore: null, foreF: null, hind: null, hindF: null, sword: null };

  // ---------------------------------------------------------------- helpers
  const rgb = h => hexToRgb(h);
  function mixRgb(a, b, k) { return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)]; }
  function halfW(x) {
    if (x < HW[0][0] || x > HW[HW.length - 1][0]) return 0;
    for (let i = 1; i < HW.length; i++) {
      if (x > HW[i][0]) continue;
      const u = (x - HW[i - 1][0]) / (HW[i][0] - HW[i - 1][0]);
      return HW[i - 1][1] + (HW[i][1] - HW[i - 1][1]) * (u * u * (3 - 2 * u));
    }
    return 0;
  }
  // the travelling wave down his back: still at the neck, widest at the hips
  function spineOff(x, ph, amp) {
    const u = clamp((X_NECK - x) / (X_NECK - X_TAIL), 0, 1);
    return amp * Math.sin(ph - (X_NECK - x) * 0.13) * (0.22 + 0.78 * u);
  }
  // snap a world coordinate to the layer's pixel grid
  const snap = v => Math.round(v * A) / A;

  // ------------------------------------------------------------- the body
  // One frame of him from above. Everything is decided per art pixel into a
  // colour map first -- fur, coat, lace, strap, plate -- and the outline is
  // laid on last from the mask, so it is closed at every amplitude.
  function bodyFrame(ph, amp) {
    const W = BW * A, H = BH * A;
    const c = newCanHi(BW, BH), ctx = c.getContext('2d');
    const col = new Array(W * H).fill(null);
    const kind = new Int8Array(W * H).fill(0);        // 0 none, 1 fur, 2 coat, 3 gear
    const FUR = [CPAL.furDD, CPAL.furD, CPAL.fur, CPAL.furL].map(rgb);
    const WAT = rgb(WATER);
    const FURW = FUR.map(f => mixRgb(f, WAT, 0.30));
    const COAT = [CPAL.capeD, CPAL.cape, CPAL.capeL].map(rgb);
    const COATW = COAT.map(f => mixRgb(f, WAT, 0.30));
    const G = { goldD: rgb(CPAL.goldD), goldL: rgb(CPAL.goldL), lea: rgb(CPAL.lea), leaD: rgb(CPAL.leaD), leaL: rgb(CPAL.leaL),
      metL: rgb(CPAL.metL), metD: rgb(CPAL.metD), metLL: rgb(CPAL.metLL), out2: rgb(CPAL.out2), blood: rgb(CPAL.blood), bloodD: rgb(CPAL.bloodD) };
    const set = (x, y, v, k) => { if (x < 0 || y < 0 || x >= W || y >= H) return; col[y * W + x] = v; kind[y * W + x] = k; };
    const furBand = t => { let d = Math.abs(t - 0.40) * 2; if (t < 0.40) d -= 0.14; return d < 0.26 ? 3 : d < 0.60 ? 2 : d < 0.88 ? 1 : 0; };
    const coatBand = t => { let d = Math.abs(t - 0.40) * 2; if (t < 0.40) d -= 0.12; return d < 0.32 ? 2 : d < 0.74 ? 1 : 0; };
    const flutter = (x) => x < 26 ? Math.sin(ph * 2 + x * 0.45) * 0.9 * (26 - x) / 9 : 0;
    for (let x = X_TAIL; x <= X_NECK; x++) {
      const hw = halfW(x); if (hw < 1) continue;
      const yc = OY + spineOff(x, ph, amp);
      const y0 = Math.round(yc - hw), y1 = Math.round(yc + hw);
      for (let y = y0; y <= y1; y++) {
        const t = (y - (yc - hw)) / (2 * hw);
        const wet = x < X_WET + (hash2(y * 3, 7) > 0.5 ? 1 : 0);
        let b = furBand(t);
        // fur grain, so the back is hair and not a plastic moulding
        const g = hash2(x * 5 + 1, y * 3 + Math.round(ph));
        if (g > 0.955 && b > 0) b--; else if (g < 0.02 && b < 3) b++;
        set(x, y, (wet ? FURW : FUR)[b], 1);
        // ---- the coat. From above it is a cape over the shoulders that falls
        //      away aft to a torn point down his spine -- the same collar the
        //      rider wears -- so the back behind it is still brown otter
        let coat = false;
        if (x >= 36 && x <= 49) coat = t > 0.05 && t < 0.95;
        else if (x >= 23 && x < 36) {
          const fy = flutter(x) / (2 * hw);
          const w = (x - 23) / 13 * 0.47;
          coat = Math.abs(t - fy - 0.5) < w;
          // a torn hem: the last few columns are ragged
          if (x < 27 && hash2(x * 11, y * 5) > 0.5) coat = false;
        }
        if (coat) {
          const cb = coatBand(t);
          set(x, y, (wet ? COATW : COAT)[cb], 2);
        }
      }
    }
    // ---- centre-back seam down the mantle
    for (let x = 37; x <= 47; x++) {
      const y = Math.round(OY + spineOff(x, ph, amp) - 1.2);
      if (kind[y * W + x] === 2) set(x, y, COAT[0], 2);
    }
    // ---- gold lace wherever the coat meets fur
    const lace = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (kind[i] !== 2) continue;
      if (kind[i - 1] === 1 || kind[i - W] === 1 || kind[i + W] === 1) lace.push(i);
    }
    for (const i of lace) { const x = i % W, y = (i / W) | 0; col[i] = ((x + y) % 3) ? G.goldD : G.goldL; kind[i] = 3; }
    // ---- the bandolier, port shoulder to starboard hip, with brass rounds
    for (let x = 18; x <= 44; x++) {
      const hw = halfW(x), yc = OY + spineOff(x, ph, amp);
      const tc = 0.16 + (44 - x) / 26 * 0.66;
      const yy = Math.round(yc - hw + tc * 2 * hw);
      for (let d = -1; d <= 1; d++) {
        const i = (yy + d) * W + x; if (!kind[i]) continue;
        col[i] = d < 0 ? G.leaL : d > 0 ? G.leaD : G.lea; kind[i] = 3;
      }
      if (x % 4 === 1 && x > 24) { const i = yy * W + x; if (kind[i]) { col[i] = G.goldL; col[i + W] = G.goldD; } }
    }
    // ---- salvaged steel pauldrons on both shoulders, a rivet each
    for (const side of [-1, 1]) {
      for (let x = 42; x <= 47; x++) {
        const hw = halfW(x), yc = OY + spineOff(x, ph, amp);
        const yEdge = side < 0 ? Math.round(yc - hw) + 1 : Math.round(yc + hw) - 1;
        for (let k = 0; k < 4; k++) {
          const y = yEdge - side * k, i = y * W + x; if (!kind[i]) continue;
          col[i] = k === 3 ? G.metD : (x === 42 || k === 0) ? G.metD : (k === 2 && x < 46) ? G.metLL : G.metL;
          kind[i] = 3;
        }
        if (x === 45) { const y = yEdge - side * 2, i = y * W + x; if (kind[i]) col[i] = G.out2; }
      }
    }
    // ---- and what the last man who argued left on the coat
    for (let y = 0; y < H; y++) for (let x = 30; x < 48; x++) {
      const i = y * W + x; if (kind[i] !== 2) continue;
      const h = hash2(x * 13 + 5, y * 7 + 3);
      if (h > 0.972) { col[i] = G.blood; if (kind[i + 1] === 2) col[i + 1] = G.bloodD; }
    }
    // ---- outline: every inked pixel with an empty 4-neighbour
    const OUT = rgb(CPAL.out);
    const img = ctx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!kind[i]) continue;
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || !kind[i - 1] || !kind[i + 1] || !kind[i - W] || !kind[i + W];
      const v = edge ? OUT : col[i];
      const p = i * 4; d[p] = v[0]; d[p + 1] = v[1]; d[p + 2] = v[2]; d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return spriteFromHi(c, OX, OY);
  }

  // ------------------------------------------------------------- the limbs
  // Authored pointing along +x with the socket at the anchor. `spread` is the
  // power stroke (paw open, toes fanned), `feather` the recovery (edge-on).
  const LM = { k: CPAL.out, g: CPAL.goldD, G: CPAL.goldL, e: CPAL.lea, E: CPAL.leaL,
               f: CPAL.fur, d: CPAL.furD, D: CPAL.furDD, l: CPAL.furL, b: CPAL.bone, w: '#8a5b46', W: '#a97a63' };
  const FORE_SPREAD = [
    '.........kkkk..',
    'kkkkkkkkkkfflkk',
    'kllllldEgkffffb',
    'kffffffegkfffdk',
    'kddddddegkfddDb',
    'kkkkkkkkkkdDDkk',
    '.........kkkk..',
  ];
  const FORE_FEATHER = [
    'kkkkkkkkkkkkk..',
    'kllllldEgkfflkb',
    'kffffffegkffdkk',
    'kddddddegkdDDkb',
    'kkkkkkkkkkkkk..',
  ];
  const HIND_SPREAD = [
    '......kkkk..',
    '.....kDwWDk.',
    'kkkkkDdwwWDk',
    'kffddDdwwwwb',
    'kfffdDddwwwk',
    'kffddDdwwwwb',
    'kkkkkDdwwWDk',
    '.....kDwWDk.',
    '......kkkk..',
  ];
  const HIND_FEATHER = [
    'kkkkkkkkkk..',
    'kffddDDwDDkb',
    'kfffdDddDDDk',
    'kffddDDwDDkb',
    'kkkkkkkkkk..',
  ];
  function limb(rows, ay) {
    const w = rows[0].length, h = rows.length;
    const c = newCan(w, h), ctx = c.getContext('2d');
    stamp(ctx, rows, 0, 0, LM);
    return spriteFromHi(c, 0, ay);
  }

  // ------------------------------------------------------------ the cutlass
  // Grip at the anchor, blade out along +x with a slight upward sweep, the
  // edge bright along the bottom, the spine dark along the top, a gold
  // D-guard, and a length of it that has already been through somebody.
  function buildSword() {
    const c = newCan(30, 9), ctx = c.getContext('2d');
    // pommel and grip
    px(ctx, CPAL.out, 0, 2, 3, 5); px(ctx, CPAL.goldD, 1, 3, 1, 3); px(ctx, CPAL.goldL, 1, 3, 1, 1);
    px(ctx, CPAL.out, 3, 3, 4, 3); px(ctx, CPAL.leaD, 3, 4, 4, 1);
    for (let x = 3; x < 7; x += 2) px(ctx, CPAL.leaL, x, 4);
    // D-guard: a gold bar across the hand, the knuckle bow round the front
    px(ctx, CPAL.out, 7, 0, 3, 9);
    px(ctx, CPAL.goldD, 8, 1, 1, 7); px(ctx, CPAL.gold, 8, 1, 1, 4); px(ctx, CPAL.goldL, 8, 2, 1, 1);
    px(ctx, CPAL.out, 3, 7, 5, 2); px(ctx, CPAL.goldD, 4, 7, 4, 1);
    // blade: widens toward the tip, then clips to a point; rises one pixel
    // two thirds of the way out so it reads as curved
    for (let x = 10; x < 29; x++) {
      const u = (x - 10) / 18;
      const lift = u > 0.62 ? 1 : 0;
      const w = x < 26 ? (u < 0.4 ? 3 : 4) : (x === 26 ? 3 : x === 27 ? 2 : 1);
      const top = 3 - lift - (w > 3 ? 1 : 0) + (x >= 27 ? 1 : 0);
      px(ctx, CPAL.out, x, top - 1, 1, w + 2);
      px(ctx, CPAL.metD, x, top, 1, 1);                       // spine
      if (w > 2) px(ctx, CPAL.metL, x, top + 1, 1, w - 2);   // flat
      px(ctx, CPAL.metLL, x, top + w - 1, 1, 1);              // edge
      if (w > 3 && (x & 3) === 1) px(ctx, CPAL.met, x, top + 1, 1, 1);   // fuller
    }
    px(ctx, CPAL.out, 29, 4, 1, 1);
    // blood down the last third, and one drip off the edge
    for (const [bx, by] of [[21, 3], [22, 4], [24, 3], [25, 4], [23, 5], [26, 4], [19, 5]]) px(ctx, (bx + by) & 1 ? CPAL.blood : CPAL.bloodD, bx, by);
    px(ctx, CPAL.bloodD, 22, 7); px(ctx, CPAL.blood, 22, 6);
    return spriteFromHi(c, 5, 4);
  }

  function build() {
    if (built) return true;
    if (typeof CH === 'undefined' || !CH.otterTail || !CH.otterHeadHi) return false;
    for (let ai = 0; ai < AMPS.length; ai++) {
      const row = [], rowH = [];
      for (let p = 0; p < NPH; p++) {
        const s = bodyFrame(p / NPH * TAU, AMPS[ai]);
        row.push(s); rowH.push(tintFlat(s, '#ffffff', 0.85));
      }
      S.body.push(row); S.bodyH.push(rowH);
    }
    S.fore = limb(FORE_SPREAD, 3); S.foreF = limb(FORE_FEATHER, 2);
    S.hind = limb(HIND_SPREAD, 4); S.hindF = limb(HIND_FEATHER, 2);
    S.foreH = tintFlat(S.fore, '#ffffff', 0.85); S.hindH = tintFlat(S.hind, '#ffffff', 0.85);
    S.sword = buildSword();
    S.tailWet = tintFlat(CH.otterTail, WATER, 0.18);
    built = true;
    return true;
  }

  // -------------------------------------------------------------- posing
  // A stroke with a fast power beat and a slow recovery, 0..1 -> 0..1 and
  // back, and whether this instant is the power half.
  function stroke(ph, power) {
    const p = ((ph % TAU) + TAU) % TAU, pw = TAU * power;
    if (p < pw) { const u = p / pw; return { k: u * u * (3 - 2 * u), pow: true }; }
    const u = (p - pw) / (TAU - pw); return { k: 1 - u * u * (3 - 2 * u), pow: false };
  }
  // limb angles in the body frame (radians off +x; side is +-1)
  function poseLimbs(s, ph) {
    const m = s.mode, out = [];
    // [socketX, socketY, angle, spread?, isFore, side]
    for (const side of [-1, 1]) {
      let fa, fs, ha, hs;
      if (m === 'dash') {
        fa = side * 2.55; fs = false;                        // fore paws tucked along the flanks
        const st = stroke(ph * 1.0, 0.45);                   // hind feet kick together
        ha = side * (2.25 + 0.62 * st.k); hs = st.pow;
      } else if (m === 'haul') {
        const tug = Math.sin(ph * 1.4) * 0.12;
        fa = side * (0.38 + tug); fs = true;                 // both paws on her flank
        const st = stroke(ph * 1.6 + (side > 0 ? Math.PI : 0), 0.45);
        ha = side * (2.1 + 0.7 * st.k); hs = st.pow;
      } else if (m === 'leap') {
        fa = side * 0.55; fs = true; ha = side * 2.75; hs = true;
      } else if (m === 'tread') {
        // treading water: each paw draws a small circle, diagonals together
        const o = side > 0 ? 0 : Math.PI;
        const f = stroke(ph + o, 0.5), h = stroke(ph + o + Math.PI, 0.5);
        fa = side * (0.95 + 0.55 * f.k); fs = f.pow;
        ha = side * (1.95 + 0.45 * h.k); hs = h.pow;
      } else {
        // paddling: alternate fore strokes, the hind feet on the opposite beat
        const o = side > 0 ? 0 : Math.PI;
        const f = stroke(ph + o, 0.42), h = stroke(ph + o + Math.PI * 0.9, 0.42);
        fa = side * (0.45 + 1.55 * f.k); fs = f.pow;
        ha = side * (2.0 + 0.75 * h.k); hs = h.pow;
      }
      out.push({ x: FORE.x, y: side * FORE.y, a: fa, spread: fs, fore: true, side });
      out.push({ x: HIND.x, y: side * HIND.y, a: ha, spread: hs, fore: false, side });
    }
    return out;
  }
  // the sword arm is the starboard fore limb (+y in the body frame)
  function swordPose(s, ph, base) {
    const sl = s.slash;
    if (sl && sl.phase) {
      const arc = sl.arc || 2.3, side = sl.side || 1;
      const k = clamp(sl.k || 0, 0, 1);
      let a;
      if (sl.phase === 'wind') a = side * (-arc / 2 - 0.45 * k);
      else if (sl.phase === 'strike') { const e = k * k * (3 - 2 * k); a = side * (-arc / 2 - 0.45 + (arc + 0.45) * e); }
      else a = lerp(side * (arc / 2), base.a, k * k);
      return { a, blade: 0, spread: true, top: sl.phase !== 'recover' || k < 0.5 };
    }
    const m = s.mode;
    if (m === 'dash') return { a: 2.5, blade: 0.5, spread: false, top: false };
    if (m === 'haul') return { a: 0.55, blade: 2.5, spread: true, top: false };
    if (m === 'leap') return { a: -0.35, blade: -0.35, spread: true, top: true };
    if (m === 'tread') return { a: 0.95 + Math.sin(ph) * 0.12, blade: -0.75, spread: true, top: false };
    // swimming: it strokes with the rest, shallower, blade trailing
    return { a: 0.8 + (base.a - 0.8) * 0.4, blade: 0.95, spread: base.spread, top: false };
  }

  // body frame -> world
  function toWorld(o, lx, ly) {
    return { x: o.x + o.c * lx - o.s * ly * o.fy, y: o.y + o.s * lx + o.c * ly * o.fy };
  }

  function drawLimb(ctx, L, hurt) {
    const spr = L.fore ? (L.spread ? (hurt ? S.foreH : S.fore) : S.foreF) : (L.spread ? (hurt ? S.hindH : S.hind) : S.hindF);
    ctx.save();
    ctx.translate(L.x, L.y); ctx.rotate(L.a);
    // keep the lit side of the paw up whichever flank it is on
    if (L.side < 0) ctx.scale(1, -1);
    ctx.drawImage(spr.c, -spr.ax, -spr.ay);
    ctx.restore();
  }

  function drawSwordArm(ctx, sw, hurt) {
    const lim = sw.spread ? (hurt ? S.foreH : S.fore) : S.foreF;
    ctx.save();
    ctx.translate(FORE.x, FORE.y); ctx.rotate(sw.a);
    ctx.drawImage(lim.c, -lim.ax, -lim.ay);
    ctx.translate(LIMB_LEN, 0); ctx.rotate(sw.blade);
    ctx.drawImage(S.sword.c, -S.sword.ax, -S.sword.ay);
    ctx.restore();
  }

  // ------------------------------------------------------------------ draw
  function draw(ctx, x, y, s) {
    if (!build()) return;
    const t = s.t || 0, ph = s.phase || 0, m = s.mode || 'tread';
    const z = s.z || 0;
    const hd = s.heading || 0;
    let fy = s.flip === undefined ? (Math.cos(hd) < 0 ? -1 : 1) : s.flip;
    if (Math.abs(fy) < 0.3) fy = fy < 0 ? -0.3 : 0.3;
    const a0 = ctx.globalAlpha;
    const alpha = s.alpha === undefined ? 1 : s.alpha;
    // bob: he rides up on every stroke; treading water he rises and sinks
    const bob = m === 'tread' ? Math.sin(ph) * 0.8 : m === 'dash' ? 0 : Math.sin(ph * 2) * 0.35;
    const X = snap(x), Y = snap(y - z + bob);
    const o = { x: X, y: Y, c: Math.cos(hd), s: Math.sin(hd), fy };

    // ---- a leap throws a shadow on the water under him
    if (z > 0.5) {
      const sw = Math.max(3, Math.round(8 - z * 0.12)), sh = Math.max(2, Math.round(3 - z * 0.04));
      ctx.fillStyle = 'rgba(6,18,48,0.35)';
      ctx.fillRect(Math.round(x) - sw, Math.round(y) + 2, sw * 2, sh);
      ctx.fillRect(Math.round(x) - sw + 1, Math.round(y) + 1, sw * 2 - 2, sh + 2);
    }

    const ai = m === 'dash' || m === 'leap' ? 2 : (m === 'swim' || m === 'haul') ? 1 : 0;
    const fi = ((Math.floor(((ph % TAU) + TAU) % TAU / TAU * NPH) % NPH) + NPH) % NPH;
    const body = (s.hurt ? S.bodyH : S.body)[ai][fi];
    const amp = AMPS[ai], phq = fi / NPH * TAU;
    // where the hips actually are in this frame, so the tail stays on
    const hipOff = spineOff(X_TAIL + 2, phq, amp) / A;
    const neckOff = spineOff(X_NECK, phq, amp) / A;
    const slope = (spineOff(X_TAIL + 6, phq, amp) - spineOff(X_TAIL, phq, amp)) / 6;
    // a stretched dash throws the head forward and trails the legs
    const reachF = m === 'dash' ? 1.2 : m === 'haul' ? Math.sin(ph * 1.4) * 0.8 - 0.6 : 0;

    ctx.save();
    ctx.globalAlpha = a0 * alpha;
    ctx.translate(X, Y); ctx.rotate(hd); ctx.scale(1, fy);

    const limbs = poseLimbs(s, ph);
    const sw = swordPose(s, ph, limbs.find(L => L.fore && L.side > 0));
    // ---- under the surface: the hind feet and the tail, water-tinted
    ctx.globalAlpha = a0 * alpha * 0.78;
    for (const L of limbs) if (!L.fore) { L.x -= reachF * 0.6; drawLimb(ctx, L, s.hurt); }
    const scull = m === 'dash' ? Math.sin(ph * 1.0 - 0.9) * 0.55
      : m === 'haul' ? Math.sin(ph * 2.2) * 0.5
      : m === 'leap' ? 0.05
      : m === 'tread' ? Math.sin(ph * 0.5) * 0.28 : Math.sin(ph - 1.2) * 0.34;
    ctx.save();
    ctx.translate(TAIL_X - reachF * 0.6, hipOff);
    ctx.rotate(Math.PI - Math.atan(slope) + scull);
    ctx.drawImage(S.tailWet.c, -S.tailWet.ax, -S.tailWet.ay);
    ctx.restore();
    ctx.globalAlpha = a0 * alpha;
    // ---- fore paws (the port one and, unless it is swinging, the sword arm)
    for (const L of limbs) if (L.fore && L.side < 0) drawLimb(ctx, L, s.hurt);
    if (!sw.top) drawSwordArm(ctx, sw, s.hurt);
    // ---- the body
    ctx.drawImage(body.c, -body.ax, -body.ay);
    ctx.restore();

    // ---- the head: upright whatever way he is pointed, so the face reads.
    //      It is held up out of the water, so it sits a little up the frame.
    const hb = m === 'tread' ? Math.sin(ph - 0.9) * 0.6 : m === 'dash' ? Math.sin(ph * 2) * 0.3 : Math.sin(ph * 2 - 0.8) * 0.5;
    const hp = toWorld(o, NECK + reachF, neckOff);
    ctx.save();
    ctx.globalAlpha = a0 * alpha;
    ctx.translate(snap(hp.x), snap(hp.y - HEAD_LIFT + hb));
    const faceX = Math.cos(hd) < 0 ? -1 : 1;
    const turn = clamp(Math.abs(fy), 0.35, 1);
    ctx.scale(faceX * turn, 1);
    ctx.rotate(clamp(Math.sin(hd) * faceX * 0.16, -0.16, 0.16) + (m === 'haul' ? Math.sin(ph * 1.4) * 0.08 : 0));
    const head = otterHeadWithFace(s.exp || 'idle', !!s.blink, t, s.rage);
    ctx.drawImage(head, -CH.otterHead.ax, -CH.otterHead.ay);
    if (CH.cigar) ctx.drawImage(CH.cigar.c, 2, 1);
    ctx.restore();

    // ---- a swinging blade goes over everything
    if (sw.top) {
      ctx.save();
      ctx.globalAlpha = a0 * alpha;
      ctx.translate(X, Y); ctx.rotate(hd); ctx.scale(1, fy);
      drawSwordArm(ctx, sw, s.hurt);
      ctx.restore();
    }

    // ---- where he breaks the surface: a broken collar of foam across his
    //      back and, when he is going somewhere, a small bow wave off his chin
    if (z < 0.5) {
      ctx.save();
      ctx.globalAlpha = a0 * alpha;
      ctx.scale(1 / A, 1 / A);
      const blob = (p, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(p.x * A) - (w >> 1), Math.round(p.y * A) - (h >> 1), w, h); };
      // water lapping at both flanks where his back goes under
      const wl = (X_WET - OX) / A;
      const hw = halfW(X_WET) / A, so = spineOff(X_WET, phq, amp) / A;
      for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) {
        if (((j + Math.floor(t * 5) + (sd > 0 ? 1 : 0)) % 3) === 2) continue;
        const q = toWorld(o, wl + (j - 1) * 2.2 + Math.sin(t * 6 + j * 2.1 + sd) * 0.4, so + sd * (hw + 1.2 + (j === 1 ? 0.6 : 0)));
        blob(q, j === 1 ? 3 : 2, 2, j === 1 ? '#ffffff' : '#cdeaf6');
      }
      if (m === 'swim' || m === 'dash') {
        const L = m === 'dash' ? 4 : 3;
        for (let i = 0; i < L; i++) for (const sd of [-1, 1]) {
          const q = toWorld(o, NECK + 3.5 - i * 1.6, sd * (3 + i * 1.3));
          blob(q, i ? 2 : 3, 2, i < 2 ? '#ffffff' : '#cdeaf6');
        }
      } else if (m === 'tread') {
        // a slow ring of ripple spreading off him as he treads
        const k = (t * 0.9) % 1, r = 10 + k * 8;
        ctx.fillStyle = k < 0.6 ? '#d6f0fa' : '#8fc9e0';
        for (let i = 0; i < 14; i++) {
          if ((i + Math.floor(t * 3)) % 3 === 0) continue;
          const a = i / 14 * TAU;
          ctx.fillRect(Math.round((X + Math.cos(a) * r) * A), Math.round((Y + 2 + Math.sin(a) * r * 0.55) * A), 2, 1);
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = a0;
  }

  // --------------------------------------------------------------- the arc
  // Hard posterized bands on the swept path: a white leading edge, pale and
  // then dark steel behind it, and red flecks off the end of it. Laid down on
  // the ART grid, in two-pixel blocks, so it is as crisp as the sprites.
  const ARC_BANDS = ['#ffffff', '#dfe9f5', '#a9b8d0', '#6a7a96'];
  function drawSlash(ctx, x, y, sl) {
    if (!sl || !sl.phase || sl.phase === 'wind') return;
    const arc = sl.arc || 2.3, range = sl.range || 22, side = sl.wside || 1;
    const k = sl.phase === 'strike' ? clamp(sl.k, 0, 1) : 1;
    const ease = k * k * (3 - 2 * k);
    const fade = sl.phase === 'recover' ? clamp(1 - sl.k, 0, 1) : 1;
    // the cut is centred a little out in front of him, where the blade is
    const off = sl.off === undefined ? 5 : sl.off;
    const cx = Math.round((x + Math.cos(sl.dir) * off) * A), cy = Math.round((y + Math.sin(sl.dir) * off) * A);
    const R = range * A;
    const steps = Math.max(18, Math.round(arc * R / 2));
    ctx.save();
    ctx.scale(1 / A, 1 / A);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      if (u > ease) break;
      const age = (ease - u) / Math.max(0.001, ease);
      if (age > fade) continue;
      const ang = sl.dir + side * (-arc / 2 + arc * u);
      const band = age < 0.12 ? 0 : age < 0.32 ? 1 : age < 0.6 ? 2 : 3;
      // a crescent: full-bodied at the blade, thinning to a hairline behind it
      const rOut = R * (1 - age * 0.06), rIn = R * (0.60 + age * 0.34);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let r = rIn; r <= rOut; r += 2) {
        if (band === 3 && ((i + (r | 0)) & 1)) continue;        // the tail breaks up
        const rim = r > rOut - 2.5;
        ctx.fillStyle = rim && band < 2 ? (sl.heavy ? '#ffe48f' : '#ffffff') : ARC_BANDS[band];
        ctx.fillRect(cx + Math.round(ca * r) - 1, cy + Math.round(sa * r) - 1, 2, 2);
      }
      // blood thrown off the end of the blade
      if (band >= 1 && (i % 6) === 0) {
        ctx.fillStyle = (i & 4) ? CPAL.blood : CPAL.goreD;
        ctx.fillRect(cx + Math.round(ca * (rOut + 4 + (i % 3) * 2)), cy + Math.round(sa * (rOut + 4 + (i % 3) * 2)), 2, 2);
      }
    }
    // the blade's own gleam at the leading edge
    if (sl.phase === 'strike') {
      const ang = sl.dir + side * (-arc / 2 + arc * ease);
      const gx = cx + Math.round(Math.cos(ang) * R), gy = cy + Math.round(Math.sin(ang) * R);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(gx - 1, gy - 3, 2, 6); ctx.fillRect(gx - 3, gy - 1, 6, 2);
    }
    ctx.restore();
  }

  return { build, draw, drawSlash, REACH, get built() { return built; } };
})();
