// ===========================================================================
//  MENU ART — the title screen's own mascot pair.
//
//  The play field draws the war manatee top-down through the gameplay rig,
//  and every cutscene draws her side-on out of CH.side. The title screen is
//  neither: it gets its own pair, drawn here and used nowhere else — a
//  chunkier, rounder, cuter side-on manatee with the otter riding high on her
//  back waving his hat, at one art pixel per interface unit (2x2 device px:
//  deliberately chunkier than the one-device-pixel rig), with a face that
//  squints when she is happy and the one blush in the whole game.
//
//  Built out of chars.js's own helpers (px, stamp, blobField, shadeBlob,
//  newCan, spriteFrom) and its ink (CPAL.out). Pixel art only: integer
//  coordinates, posterized bands, hard edges, no arcs, no gradients. The
//  parts that swing — her flippers and her fluke — are baked as FRAMES at
//  their angles rather than rotated at draw time, so the paddle and the tail
//  wag stay crisp; his arms and tail are plotted pixel by pixel each frame
//  for the same reason.
//
//  API
//    MenuArt.build()              bake everything (idempotent, cheap)
//    MenuArt.ready                true once built
//    MenuArt.NOSE                 centre-to-snout along her heading
//    MenuArt.TAIL                 centre-to-fluke root
//    MenuArt.REACH                how far anything of the pair reaches from
//                                 her centre, at any angle
//    MenuArt.draw(ctx, st)        one frame of the pair. st:
//      x, y      centre, interface units (snapped to the device grid here)
//      F         +1 facing right, -1 facing left
//      pitch     her long axis, relative to her facing (radians)
//      roll      null, or {a, turn, flipped}: a = angle round her long axis
//                (0..2PI per turn); turn = this roll IS a facing change (its
//                edge-on frame is her face, not her belly); flipped = F has
//                already changed inside it
//      phase     stroke phase (fluke wag + paddle), thrust 0..1.3
//      exp       'happy' | 'idle' | 'surprised' | 'talk', blink
//      cheer     0..1, how hard he is waving; look (radians, relative)
//      t         time
//
//  FRAMES
//    side    body + wagging fluke + paddling flippers + live face, otter up
//    belly   the barrel roll's edge-on frame: her pale belly, flippers out
//    front   the turn's middle frame: both eyes, both blushes, and him
//            peeking over her head with the hat up
// ===========================================================================
(function (global) {
  'use strict';
  const O = CPAL.out;
  // Her menu hide: bluer and softer than the war manatee's grey-purple, with
  // a warm belly patch and a pale muzzle — a mascot, not a warship.
  const MP = {
    d0: '#2b2840', d1: '#433f5c', m: '#5d5a7b', mm: '#787597', l: '#9592b3', ll: '#b3b1cf', hi: '#d6d5ea',
    b0: '#a497b0', b1: '#c0b4c8', b2: '#dacfdc', b3: '#eee7ee',
    mz0: '#a194ab', mz1: '#c6b9c9', mz2: '#e3d9e4', mz3: '#f6f1f5',
    dot: '#6e6284',
    blush: '#f08db0', blushL: '#ffc2d6',
    eye: '#1c1428', shine: '#ffffff',
    mouth: '#5a1f36', tongue: '#e8708f',
  };

  // ---------------------------------------------------------------- her body
  //  72 x 48 art px, anchored at (36, 26): the snout's centre row, so her
  //  heading runs straight out through her nose and the menu's snout
  //  arithmetic (bubbles, fish boops) is a single length along it.
  const MB = { W: 72, H: 48, AX: 36, AY: 26 };
  //   x    top    bottom — one round bean, the head part of the body
  const MB_KEYS = [
    [ 0, 18.6, 31.4],
    [ 5, 14.6, 35.6],
    [11, 10.2, 40.0],
    [19,  6.2, 43.4],
    [28,  3.8, 45.4],
    [37,  3.0, 45.2],
    [45,  3.6, 43.8],
    [52,  5.0, 41.8],
    [58,  7.4, 39.8],
    [63, 11.0, 37.8],
    [67, 15.0, 35.8],
    [70, 19.4, 33.6],
    [71, 22.6, 30.6],
  ];
  function edgeAt(x) {
    const K = MB_KEYS;
    if (x <= K[0][0]) return [K[0][1], K[0][2]];
    for (let i = 1; i < K.length; i++) {
      if (x > K[i][0]) continue;
      const a = K[i - 1], b = K[i], u = (x - a[0]) / (b[0] - a[0]), s = u * u * (3 - 2 * u);
      return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
    }
    const L = K[K.length - 1]; return [L[1], L[2]];
  }
  function buildBody() {
    const { W, H } = MB, c = newCan(W, H), x = c.getContext('2d');
    const top = new Int16Array(W), bot = new Int16Array(W);
    for (let i = 0; i < W; i++) { const e = edgeAt(i); top[i] = Math.round(e[0]); bot[i] = Math.round(e[1]); }
    const band = t => t < 0.07 ? MP.hi : t < 0.17 ? MP.ll : t < 0.32 ? MP.l : t < 0.52 ? MP.mm
      : t < 0.76 ? MP.m : t < 0.93 ? MP.d1 : MP.d0;
    // band by band down each column, with the ink closed round every step.
    // The tail end is left open: the fluke's stock tucks in under it.
    for (let i = 0; i < W; i++) {
      const y0 = top[i], y1 = bot[i], h = Math.max(1, y1 - y0);
      for (let y = y0; y <= y1; y++) px(x, (y === y0 || y === y1) ? O : band((y - y0) / h), i, y);
      if (i > 0) {
        for (let y = Math.min(y0, top[i - 1]); y < Math.max(y0, top[i - 1]); y++) px(x, O, y0 < top[i - 1] ? i : i - 1, y);
        for (let y = Math.min(y1, bot[i - 1]) + 1; y <= Math.max(y1, bot[i - 1]); y++) px(x, O, y1 > bot[i - 1] ? i : i - 1, y);
      }
    }
    for (let y = top[W - 1]; y <= bot[W - 1]; y++) px(x, O, W - 1, y);
    const solid = (i, y) => i >= 0 && i < W - 1 && y > top[i] && y < bot[i];
    // ---- the belly patch: warm and pale, tapering off at both ends, with a
    //      soft seam where it meets the flank and a shaded underside
    for (let i = 7; i <= 66; i++) {
      const u = (i - 7) / 59, bulge = Math.sin(u * Math.PI);
      const bt = top[i] + (bot[i] - top[i]) * (0.60 + (1 - bulge) * 0.34);
      const y0 = Math.ceil(bt);
      for (let y = y0; y < bot[i]; y++) {
        if (!solid(i, y)) continue;
        const v = (y - bt) / Math.max(1, bot[i] - bt);
        px(x, y === y0 ? MP.b0 : v < 0.40 ? MP.b3 : v < 0.72 ? MP.b2 : v < 0.90 ? MP.b1 : MP.b0, i, y);
      }
    }
    // ---- a glossy shine on the top of her back, and a sparkle in it
    for (let i = 20; i <= 42; i++) {
      const y = top[i] + 2 + (i < 25 || i > 38 ? 1 : 0);
      if (solid(i, y)) px(x, MP.hi, i, y);
    }
    px(x, MP.shine, 26, top[26] + 2, 2, 1);
    // ---- pale dapples on her flank, the only markings she keeps
    for (const [dx, dy] of [[16, 17], [23, 12], [30, 19], [12, 24]]) {
      if (!solid(dx, dy) || !solid(dx + 1, dy + 1)) continue;
      px(x, MP.ll, dx, dy, 2, 1); px(x, MP.l, dx, dy + 1, 2, 1);
    }
    // ---- a soft skin crease behind the head, short, so she is one bean
    for (let y = 8; y < 26; y++) {
      const i = 50 + Math.round(Math.sin((y - 16) / 9) * 2);
      if (solid(i, y) && solid(i + 1, y)) { px(x, MP.m, i, y); px(x, MP.l, i + 1, y); }
    }
    // ---- the muzzle: a big round pale bulb at the front, lit from above,
    //      with a darker rim where it swells off her cheek
    const MX = 64, MY = 27, R = 7.6;
    for (let y = MY - 9; y <= MY + 9; y++) for (let i = MX - 9; i < W - 1; i++) {
      if (!solid(i, y)) continue;
      const d = Math.hypot((i - MX) / R, (y - MY) / R);
      if (d > 1) continue;
      const lit = Math.hypot((i - MX + 2) / R, (y - MY + 3) / R);
      px(x, d > 0.86 ? MP.mz0 : lit < 0.34 ? MP.mz3 : lit < 0.74 ? MP.mz2 : MP.mz1, i, y);
    }
    for (const [dx, dy] of [[62, 26], [65, 25], [64, 29], [67, 28]]) px(x, MP.dot, dx, dy);
    // the nostrils: two small slits on top of the bulb
    px(x, MP.d1, 66, 21, 2, 1); px(x, MP.mz3, 66, 20, 2, 1);
    // two whiskers standing off the snout
    px(x, MP.mz3, 71, 25); px(x, MP.mz3, 71, 29);
    return spriteFrom(c, MB.AX, MB.AY);
  }
  // her face anchors, in body ART pixels (the live face lands here)
  const EYE = [51, 14], BLUSH = [52, 22], MOUTH = [60, 35];
  // where the parts hang off her, body-LOCAL (art minus anchor)
  const SHO = [18, 10], SHO_FAR = [13, 7], ROOT = [-34, -1], SEAT = [3, -22];

  // ---------------------------------------------------------------- fluke
  //  A round paddle, baked at seven wag angles about its root.
  const FLUKE_N = 7, FLUKE_A = 0.36;
  function buildFlukeAt(a) {
    const W = 30, H = 36, rx0 = 27, ry0 = 18, ca = Math.cos(a), sa = Math.sin(a);
    const L = [[0, 3.4, 5.0], [-5, 5.2, 7.4], [-11, 6.6, 11.0], [-15.8, 4.4, 9.8], [-18.2, 1.8, 5.6]];
    const at = d => [rx0 + ca * d, ry0 + sa * d];
    const f = blobField(W, H, L.map(l => { const p = at(l[0]); return { x: p[0], y: p[1], rx: l[1], ry: l[2], rot: a }; }));
    const { c, ctx } = shadeBlob(W, H, f, [MP.d1, MP.m, MP.mm, MP.l], { outline: O, lift: 0.28, smooth: 3, contrast: 0.66 });
    const has = (i, y) => i >= 0 && y >= 0 && i < W && y < H && f[y * W + i] > 0.05;
    // two soft ridges fanning out of the stock
    for (const sg of [-1, 1]) for (let d = 4; d < 16; d++) {
      const off = sg * (d - 3) * 0.36;
      const i = Math.round(rx0 - ca * d - sa * off), y = Math.round(ry0 - sa * d + ca * off);
      if (has(i, y - 2) && has(i, y + 2) && has(i - 2, y) && has(i + 2, y)) px(ctx, MP.m, i, y);
    }
    // a lit rim along the trailing edge, inside the ink
    for (let y = 2; y < H - 2; y++) for (let i = 0; i < 16; i++) {
      if (has(i, y)) { if (has(i + 1, y) && has(i + 1, y - 1) && has(i + 1, y + 1)) px(ctx, MP.ll, i + 1, y); break; }
    }
    return spriteFrom(c, rx0, ry0);
  }
  // ---------------------------------------------------------------- flipper
  //  A stubby mitten, widening to a round paddle, with two little nails:
  //  baked at eight angles so the paddle stroke is a flipbook. `far` is one
  //  band back.
  const FLIP_A0 = 1.50, FLIP_DA = 0.2, FLIP_N = 8;
  function buildFlipperAt(a, far) {
    const W = 26, H = 26, rx0 = 13, ry0 = 13, ca = Math.cos(a), sa = Math.sin(a);
    const L = [[0, 2.6, 3.6], [2.6, 3.0, 4.2], [5.2, 3.0, 4.6], [7.4, 2.3, 3.6]];
    const f = blobField(W, H, L.map(l => ({ x: rx0 + ca * l[0], y: ry0 + sa * l[0], rx: l[1], ry: l[2], rot: a })));
    const ramp = far ? [MP.d0, MP.d1, MP.m] : [MP.m, MP.mm, MP.l];
    const { c, ctx } = shadeBlob(W, H, f, ramp, { outline: O, lift: 0.34, smooth: 2, contrast: 0.56 });
    const has = (i, y) => i >= 0 && y >= 0 && i < W && y < H && f[y * W + i] > 0.05;
    const inner = (i, y) => has(i, y) && has(i - 1, y) && has(i + 1, y) && has(i, y - 1) && has(i, y + 1);
    // a lit lip along whichever edge faces the light
    for (let i = 1; i < W - 1; i++) for (let y = 0; y < H; y++) if (has(i, y)) { if (inner(i, y + 1)) px(ctx, far ? MP.mm : MP.hi, i, y + 1); break; }
    if (!far) for (const s of [-1.3, 1.3]) {
      const i = Math.round(rx0 + ca * 10 - sa * s), y = Math.round(ry0 + sa * 10 + ca * s);
      if (inner(i, y)) px(ctx, MP.b3, i, y);
    }
    return spriteFrom(c, rx0, ry0);
  }
  const flipFrame = (set, a) => set[clamp(Math.round((a - FLIP_A0) / FLIP_DA), 0, FLIP_N - 1)];
  const flukeFrame = (set, a) => set[clamp(Math.round((a / FLUKE_A * 0.5 + 0.5) * (FLUKE_N - 1)), 0, FLUKE_N - 1)];

  // ================================================================ THE OTTER
  //  His own menu build: a big round head, a little red coat, and his hat in
  //  his paw instead of on his head, because he is waving it.
  function buildOtterTorso() {
    const W = 14, H = 14;
    const f = blobField(W, H, [
      { x: 6.5, y: 7.4, rx: 5.0, ry: 5.6 },
      { x: 7, y: 10.8, rx: 5.6, ry: 3.1 },
    ]);
    const { c, ctx } = shadeBlob(W, H, f, [CPAL.capeD, CPAL.cape, CPAL.capeL], { outline: O, lift: 0.30, smooth: 2, contrast: 0.6 });
    const has = (i, y) => i >= 0 && y >= 0 && i < W && y < H && f[y * W + i] > 0.05;
    // cream chest in the open front of the coat
    for (let y = 3; y < 10; y++) for (let i = 8; i < 12; i++) {
      if (!has(i, y) || !has(i + 1, y) || !has(i, y - 1)) continue;
      if (i - 8 > (y - 3) * 0.5 + 1) continue;
      px(ctx, y < 5 ? CPAL.cream : CPAL.creamD, i, y);
    }
    // a belt with a brass buckle, and two gold buttons
    for (let i = 1; i < W - 1; i++) if (has(i, 10) && has(i, 9)) px(ctx, CPAL.leaD, i, 10);
    px(ctx, CPAL.gold, 8, 10, 2, 1); px(ctx, CPAL.goldL, 8, 10);
    px(ctx, CPAL.gold, 7, 5); px(ctx, CPAL.gold, 7, 7);
    // a little foot, tucked forward against her
    px(ctx, O, 9, 11, 4, 3); px(ctx, CPAL.fur, 10, 12, 2, 1);
    return spriteFrom(c, 7, 13);
  }
  function buildOtterHead() {
    const W = 17, H = 15;
    const f = blobField(W, H, [
      { x: 7.5, y: 8, rx: 6.6, ry: 6.2 },
      { x: 12, y: 10, rx: 3.3, ry: 2.7 },     // cheeks and a short muzzle
      { x: 3, y: 2.8, rx: 2.1, ry: 2.1 },     // ears
      { x: 11, y: 2.4, rx: 2.1, ry: 2.1 },
    ]);
    const { c, ctx } = shadeBlob(W, H, f, [CPAL.furDD, CPAL.furD, CPAL.fur, CPAL.furL], { outline: O, lift: 0.30, smooth: 2, contrast: 0.62 });
    const has = (i, y) => i >= 0 && y >= 0 && i < W && y < H && f[y * W + i] > 0.05;
    const inner = (i, y) => has(i, y) && has(i - 1, y) && has(i + 1, y) && has(i, y - 1) && has(i, y + 1);
    px(ctx, CPAL.furDD, 3, 3); px(ctx, CPAL.furDD, 11, 2);   // inner ears
    // cream muzzle and cheeks
    for (let y = 7; y < 14; y++) for (let i = 7; i < 16; i++) {
      const d = Math.hypot((i - 11.6) / 3.9, (y - 10.4) / 2.7);
      if (d > 1 || !inner(i, y)) continue;
      px(ctx, d < 0.55 ? CPAL.cream : CPAL.creamD, i, y);
    }
    // the eye patch strap over his crown, to the far eye
    for (let i = 5; i <= 11; i++) px(ctx, O, i, 3 + Math.round((i - 5) * 0.17));
    px(ctx, O, 14, 8, 2, 2); px(ctx, '#6a4a58', 14, 8);       // nose
    return spriteFrom(c, 7, 14);
  }
  // his face, live: an open eye, a happy squint, a surprised one, a blink —
  // and the far eye is always under the patch
  function otterFace(ctx, exp, blink) {
    px(ctx, O, 11, 4, 3, 3); px(ctx, '#3a2a36', 12, 5);       // the patch
    if (blink) px(ctx, O, 7, 6, 3, 1);
    else if (exp === 'happy') { px(ctx, O, 7, 6); px(ctx, O, 8, 5); px(ctx, O, 9, 6); }
    else if (exp === 'surprised') { px(ctx, O, 7, 4, 3, 4); px(ctx, MP.shine, 7, 4); }
    else { px(ctx, O, 7, 4, 2, 3); px(ctx, MP.shine, 7, 4); }
    // the grin, wide, with one tooth; an O when surprised
    if (exp === 'surprised') px(ctx, O, 11, 11, 2, 2);
    else { px(ctx, O, 10, 11); px(ctx, O, 11, 12, 3, 1); px(ctx, O, 14, 11); px(ctx, CPAL.white, 12, 13); }
    px(ctx, MP.blush, 6, 9, 2, 1);
  }
  function buildHat() {
    const c = newCan(15, 7), x = c.getContext('2d');
    stamp(x, [
      '.....kkkkk.....',
      '...kkHHLLHkk...',
      'k.kHHHLLHHHHk.k',
      'kGkHHHHWHHHHkGk',
      'kGGkHHHHHHHkGGk',
      '.kGGGGGGGGGGGk.',
      '..kkkkkkkkkkk..',
    ], 0, 0, { k: O, H: CPAL.hat, L: CPAL.hatL, W: CPAL.white, G: CPAL.gold });
    return spriteFrom(c, 7, 6);
  }
  // A limb, plotted a pixel at a time along its angle: ink first, then the
  // colour down the middle, so an arm at any angle is still a crisp arm.
  function limb(ctx, x0, y0, ang, len, w, col) {
    const c = Math.cos(ang), s = Math.sin(ang), h = w >> 1;
    for (let i = 0; i <= len; i++) px(ctx, O, Math.round(x0 + c * i) - h - 1, Math.round(y0 + s * i) - h - 1, w + 2, w + 2);
    for (let i = 0; i <= len; i++) px(ctx, col(i / len), Math.round(x0 + c * i) - h, Math.round(y0 + s * i) - h, w, w);
    return [Math.round(x0 + c * len), Math.round(y0 + s * len)];
  }
  const sleeve = u => u < 0.42 ? CPAL.cape : u < 0.86 ? CPAL.fur : CPAL.cream;
  const furArm = u => u < 0.8 ? CPAL.fur : CPAL.cream;
  const ARM_L = 12;

  // ================================================================ FRONT
  //  The turn's middle frame: she looks straight out of the screen.
  const FR = { W: 48, H: 44, AX: 24, AY: 25 };
  function buildFront() {
    const { W, H } = FR;
    const f = blobField(W, H, [
      { x: 24, y: 24, rx: 20.5, ry: 18.6 },
      { x: 24, y: 30, rx: 18, ry: 13 },
    ]);
    const { c, ctx } = shadeBlob(W, H, f, [MP.d1, MP.m, MP.mm, MP.l, MP.ll], { outline: O, lift: 0.26, smooth: 3, contrast: 0.72 });
    const has = (i, y) => i >= 0 && y >= 0 && i < W && y < H && f[y * W + i] > 0.05;
    const inner = (i, y) => has(i, y) && has(i - 1, y) && has(i + 1, y) && has(i, y - 1) && has(i, y + 1);
    // belly patch, low and centred
    for (let y = 28; y < H; y++) for (let i = 8; i < 40; i++) {
      const d = Math.hypot((i - 24) / 14.5, (y - 38) / 8.5);
      if (d > 1 || !inner(i, y)) continue;
      px(ctx, d > 0.88 ? MP.b0 : y < 35 ? MP.b3 : y < 39 ? MP.b2 : MP.b1, i, y);
    }
    // the muzzle bulb in the middle of her face
    for (let y = 21; y < 38; y++) for (let i = 13; i < 36; i++) {
      const d = Math.hypot((i - 24) / 9.4, (y - 29) / 6.6);
      if (d > 1 || !inner(i, y)) continue;
      const lit = Math.hypot((i - 23) / 9.4, (y - 27) / 6.6);
      px(ctx, d > 0.86 ? MP.mz0 : lit < 0.36 ? MP.mz3 : lit < 0.74 ? MP.mz2 : MP.mz1, i, y);
    }
    for (const [dx, dy] of [[18, 29], [20, 31], [28, 31], [30, 29]]) px(ctx, MP.dot, dx, dy);
    px(ctx, MP.d1, 21, 25, 2, 1); px(ctx, MP.d1, 26, 25, 2, 1);
    // a shine on her crown
    for (let i = 17; i <= 30; i++) { const y = i < 20 || i > 27 ? 8 : 7; if (inner(i, y)) px(ctx, MP.hi, i, y); }
    px(ctx, MP.shine, 20, 8, 2, 1);
    return spriteFrom(c, FR.AX, FR.AY);
  }
  function buildOtterHeadFront() {
    const W = 18, H = 15;
    const f = blobField(W, H, [
      { x: 9, y: 9, rx: 7.2, ry: 5.8 },
      { x: 3, y: 3.6, rx: 2.3, ry: 2.3 },
      { x: 15, y: 3.6, rx: 2.3, ry: 2.3 },
    ]);
    const { c, ctx } = shadeBlob(W, H, f, [CPAL.furDD, CPAL.furD, CPAL.fur, CPAL.furL], { outline: O, lift: 0.30, smooth: 2, contrast: 0.62 });
    px(ctx, CPAL.furDD, 3, 3); px(ctx, CPAL.furDD, 15, 3);
    for (let y = 9; y < 14; y++) for (let i = 5; i < 14; i++) {
      const d = Math.hypot((i - 9) / 4, (y - 11.2) / 2.6);
      if (d <= 1) px(ctx, d < 0.6 ? CPAL.cream : CPAL.creamD, i, y);
    }
    px(ctx, O, 11, 5, 3, 3); px(ctx, '#3a2a36', 12, 6);       // patch
    for (let i = 3; i <= 11; i++) px(ctx, O, i, 5 - Math.round((11 - i) * 0.25));
    px(ctx, O, 5, 6, 2, 2); px(ctx, MP.shine, 5, 6);          // eye
    px(ctx, O, 8, 9, 2, 2);                                    // nose
    px(ctx, O, 6, 11); px(ctx, O, 7, 12, 4, 1); px(ctx, O, 11, 11); px(ctx, CPAL.white, 9, 13);
    px(ctx, MP.blush, 3, 9, 2, 1); px(ctx, MP.blush, 13, 9, 2, 1);
    return spriteFrom(c, 9, 13);
  }

  // ================================================================ BELLY
  //  The barrel roll's edge-on frame: her from underneath, pale all over,
  //  flippers out, a belly button.
  const BL = { W: 72, H: 28, AX: 36, AY: 14 };
  function buildBelly() {
    const { W, H } = BL;
    const f = blobField(W, H, [
      { x: 10, y: 14, rx: 10, ry: 5.5 },
      { x: 24, y: 14, rx: 14, ry: 9.0 },
      { x: 38, y: 14, rx: 14, ry: 10.0 },
      { x: 52, y: 14, rx: 12, ry: 9.0 },
      { x: 63, y: 14, rx: 8.5, ry: 6.6 },
    ]);
    const { c, ctx } = shadeBlob(W, H, f, [MP.b0, MP.b1, MP.b2, MP.b3], { outline: O, lift: 0.34, smooth: 3, contrast: 0.7 });
    const has = (i, y) => i >= 0 && y >= 0 && i < W && y < H && f[y * W + i] > 0.05;
    // her flanks show at the top and bottom edges as she rolls through
    for (let i = 1; i < W - 1; i++) {
      let y0 = -1, y1 = -1;
      for (let y = 0; y < H; y++) if (has(i, y)) { if (y0 < 0) y0 = y; y1 = y; }
      if (y0 < 0 || y1 - y0 < 6) continue;
      px(ctx, MP.mm, i, y0 + 1); px(ctx, MP.m, i, y1 - 1); px(ctx, MP.mm, i, y1 - 2);
    }
    px(ctx, MP.b0, 36, 14, 2, 1); px(ctx, MP.b1, 36, 13, 2, 1);   // belly button
    // folds across her throat
    for (let y = 9; y <= 19; y++) if (has(56, y) && has(56, y - 2) && has(56, y + 2)) px(ctx, MP.b1, 56, y);
    return spriteFrom(c, BL.AX, BL.AY);
  }

  // ================================================================ FACE BITS
  function eye(ctx, x, y, exp, blink) {
    if (blink) { px(ctx, O, x, y + 3); px(ctx, O, x + 1, y + 4, 3, 1); px(ctx, O, x + 4, y + 3); return; }
    if (exp === 'happy' || exp === 'talk') {
      // the happy squint: an upturned arc, two pixels thick at the crown
      px(ctx, O, x, y + 3); px(ctx, O, x + 1, y + 2); px(ctx, O, x + 2, y + 1, 2, 2); px(ctx, O, x + 4, y + 2); px(ctx, O, x + 5, y + 3);
      return;
    }
    if (exp === 'surprised') {
      // a bigger bead, two glints, and the brow jumped up off it
      stamp(ctx, ['.kkkk.', 'kwweek', 'kwweek', 'keeeek', 'keeeek', 'keeewk', '.kkkk.'], x, y - 1, { k: O, w: MP.shine, e: MP.eye });
      px(ctx, O, x + 1, y - 4, 4, 1);
      return;
    }
    stamp(ctx, ['.kkk.', 'kwwek', 'kwwek', 'keeek', 'keewk', '.kkk.'], x, y, { k: O, w: MP.shine, e: MP.eye });
  }
  function mouth(ctx, x, y, exp, t) {
    const open = exp === 'happy' || (exp === 'talk' && (Math.floor(t * 7) & 1));
    if (exp === 'surprised') { stamp(ctx, ['.k.', 'kmk', '.k.'], x + 2, y - 1, { k: O, m: MP.mouth }); return; }
    if (open) { stamp(ctx, ['kkkkkk', 'kmmmmk', '.kttk.', '..kk..'], x, y - 1, { k: O, m: MP.mouth, t: MP.tongue }); return; }
    stamp(ctx, ['k....k', '.kkkk.'], x, y, { k: O });
  }
  function sideFace(ctx, exp, blink, t) {
    const ox = -MB.AX, oy = -MB.AY;       // art pixel (i, j) is at (i + ox, j + oy)
    eye(ctx, EYE[0] + ox, EYE[1] + oy, exp, blink);
    if (exp !== 'surprised') { px(ctx, MP.blush, BLUSH[0] + ox, BLUSH[1] + oy, 4, 2); px(ctx, MP.blushL, BLUSH[0] + 1 + ox, BLUSH[1] + oy); }
    mouth(ctx, MOUTH[0] + ox, MOUTH[1] + oy, exp, t);
  }
  function frontFace(ctx, exp, blink, t) {
    for (const [ex, ey] of [[12, 16], [31, 16]]) eye(ctx, ex, ey, exp, blink);
    if (exp !== 'surprised') { px(ctx, MP.blush, 9, 24, 4, 2); px(ctx, MP.blushL, 10, 24); px(ctx, MP.blush, 35, 24, 4, 2); px(ctx, MP.blushL, 36, 24); }
    mouth(ctx, 21, 37, exp, t);
  }

  // ================================================================ BUILD
  const A = {};
  // the pose canvas holds her whole reach unrotated; the turn canvas holds
  // it at any angle
  const POSE_W = 132, POSE_H = 116, POSE_OX = 70, POSE_OY = 62, OFF_C = 92;
  const MenuArt = {
    ready: false,
    NOSE: MB.W - 1 - MB.AX,          // 35: centre to snout, along her heading
    TAIL: -ROOT[0],                   // 34: centre to the fluke root
    REACH: 56,
    parts: A,
    build() {
      if (this.ready) return;
      if (typeof CPAL === 'undefined' || typeof blobField !== 'function' || typeof shadeBlob !== 'function') return;
      A.body = buildBody();
      A.fluke = []; for (let i = 0; i < FLUKE_N; i++) A.fluke.push(buildFlukeAt(-FLUKE_A + 2 * FLUKE_A * i / (FLUKE_N - 1)));
      A.flip = []; A.flipFar = [];
      for (let i = 0; i < FLIP_N; i++) { A.flip.push(buildFlipperAt(FLIP_A0 + i * FLIP_DA, false)); A.flipFar.push(buildFlipperAt(FLIP_A0 + i * FLIP_DA, true)); }
      A.front = buildFront(); A.belly = buildBelly();
      A.oTorso = buildOtterTorso(); A.oHead = buildOtterHead(); A.oHeadF = buildOtterHeadFront();
      A.hat = buildHat();
      this._pose = newCan(POSE_W, POSE_H);
      this._off = newCan(OFF_C * 2, OFF_C * 2);
      this.ready = true;
    },
    // ---- one frame ------------------------------------------------------
    // ---- one frame ------------------------------------------------------
    //  Two passes, so every art pixel stays square and hard-edged at any
    //  angle: the pose is composed UNROTATED, one art pixel per unit, into
    //  POSE (every fillRect lands on the grid); POSE is then turned and
    //  squashed into OFF at that same resolution with nearest-neighbour
    //  sampling; OFF is blitted unrotated, so on screen each art pixel is a
    //  square 2x2 block of device pixels whatever she is doing.
    draw(ctx, st) {
      if (!this.ready) this.build();
      if (!this.ready) return;
      const t = st.t || 0, ph = st.phase || 0, F = st.F < 0 ? -1 : 1, cheer = st.cheer || 0;
      // ---- which frame, and how squashed
      let frame = 'side', sy = 1;
      const R0 = st.roll;
      if (R0) {
        const s = Math.cos(R0.a);
        if (Math.abs(s) < (R0.turn ? 0.42 : 0.38)) frame = R0.turn ? 'front' : 'belly';
        else sy = R0.flipped ? -s : s;
      }
      const P = this._pose, q = P.getContext('2d');
      q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, P.width, P.height);
      q.imageSmoothingEnabled = false;
      q.translate(POSE_OX, POSE_OY);
      if (frame === 'front') this.poseFront(q, st, t, cheer, ph);
      else if (frame === 'belly') this.poseBelly(q, st, ph);
      else this.poseSide(q, st, t, cheer, ph, sy < 0);
      const Q = this._off, o = Q.getContext('2d');
      o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, Q.width, Q.height);
      o.imageSmoothingEnabled = false;
      o.translate(OFF_C, OFF_C);
      if (frame !== 'front') {
        const rot = st.pitch || 0;
        if (Math.abs(rot) > 0.012) o.rotate(rot);
        o.scale(F, frame === 'belly' ? 1 : sy < 0 ? Math.min(-0.5, sy) : Math.max(0.5, sy));
      }
      o.drawImage(P, -POSE_OX, -POSE_OY);
      // snap to the device grid, the way the play field snaps the player
      const x = Math.round(st.x * DETAIL) / DETAIL, y = Math.round(st.y * DETAIL) / DETAIL;
      ctx.drawImage(Q, x - OFF_C, y - OFF_C);
    },
    poseSide(q, st, t, cheer, ph, flipped) {
      const thr = st.thrust || 0;
      const fk = flukeFrame(A.fluke, Math.sin(ph) * (0.2 + Math.min(0.16, thr * 0.12)));
      // far flipper, fluke, body, near flipper, face, otter
      const pad = thr > 0.25 ? 0.5 : 0.3;
      const fa = 2.2 + Math.sin(ph + 0.9) * pad;
      const ff = flipFrame(A.flipFar, fa - 0.2), fn = flipFrame(A.flip, fa);
      q.drawImage(ff.c, SHO_FAR[0] - ff.ax, SHO_FAR[1] - ff.ay);
      q.drawImage(fk.c, ROOT[0] - fk.ax, ROOT[1] - fk.ay);
      q.drawImage(A.body.c, -A.body.ax, -A.body.ay);
      q.drawImage(fn.c, SHO[0] - fn.ax, SHO[1] - fn.ay);
      sideFace(q, st.exp || 'happy', st.blink, t);
      this.drawOtter(q, st, t, cheer, flipped);
    },
    poseBelly(q, st, ph) {
      const fk = flukeFrame(A.fluke, Math.sin(ph) * 0.3);
      q.drawImage(fk.c, ROOT[0] - fk.ax, ROOT[1] - fk.ay);
      // flippers out either side of her chest, paddling
      const fl = flipFrame(A.flip, 2.0 + Math.sin(ph * 1.3) * 0.3);
      for (const sg of [-1, 1]) {
        q.save(); q.translate(16, sg * 7); q.scale(1, sg);
        q.drawImage(fl.c, -fl.ax, -fl.ay); q.restore();
      }
      q.drawImage(A.belly.c, -A.belly.ax, -A.belly.ay);
    },
    // him, sitting on her back
    drawOtter(ctx, st, t, cheer, flipped) {
      const exp = flipped || st.exp === 'surprised' ? 'surprised'
        : (cheer > 0 || st.exp === 'happy' || st.exp === 'talk') ? 'happy' : 'idle';
      const bob = Math.round(Math.sin(t * 3.1) * 0.6 + (cheer > 0 ? Math.abs(Math.sin(t * 12)) * 1.2 : 0));
      ctx.save(); ctx.translate(SEAT[0], SEAT[1] - bob);
      // his tail, cocked up behind him and swishing
      limb(ctx, -4, -2, Math.PI + 0.55 + Math.sin(t * 2.3) * 0.18, 7, 2, u => u < 0.5 ? CPAL.furD : CPAL.fur);
      // the far arm, right up, waving the hat — harder when he is cheering;
      // clutching it low while she is upside down
      const wv = cheer > 0 ? Math.sin(t * 15) * 0.5 : Math.sin(t * 5.2) * 0.32;
      const A0 = flipped ? -0.5 : -2.32 + wv;
      ctx.drawImage(A.oTorso.c, -A.oTorso.ax, -A.oTorso.ay);
      // his head, looking where she is looking
      const look = clamp(st.look || 0, -0.5, 0.5) * 0.35;
      ctx.save(); ctx.translate(1, -11); ctx.rotate(look + Math.sin(t * 1.7) * 0.05);
      ctx.drawImage(A.oHead.c, -A.oHead.ax, -A.oHead.ay);
      ctx.translate(-A.oHead.ax, -A.oHead.ay);
      otterFace(ctx, exp, !!st.blink && !flipped && cheer <= 0);
      ctx.restore();
      const paw = limb(ctx, -3, -8, A0, ARM_L, 2, sleeve);
      // the hat, in the paw at the end of that arm
      ctx.save(); ctx.translate(paw[0], paw[1]); ctx.rotate(wv * 0.8 + (flipped ? 0.5 : 0));
      ctx.drawImage(A.hat.c, -A.hat.ax, -A.hat.ay);
      ctx.restore();
      // the near arm, hanging on to her
      limb(ctx, 3, -7, 1.05, 6, 2, furArm);
      ctx.restore();
    },
    poseFront(ctx, st, t, cheer, ph) {
      // him, peeking over her head with the hat up
      const wv = Math.sin(t * (cheer > 0 ? 16 : 6)) * 0.35;
      ctx.save(); ctx.translate(0, -FR.AY + 3);
      const paw = limb(ctx, 7, -1, -0.95 + wv, ARM_L, 2, sleeve);
      ctx.drawImage(A.oHeadF.c, -A.oHeadF.ax, -A.oHeadF.ay);
      ctx.save(); ctx.translate(paw[0], paw[1]); ctx.rotate(wv * 0.8);
      ctx.drawImage(A.hat.c, -A.hat.ax, -A.hat.ay);
      ctx.restore();
      ctx.restore();
      ctx.drawImage(A.front.c, -A.front.ax, -A.front.ay);
      ctx.save(); ctx.translate(-A.front.ax, -A.front.ay);
      frontFace(ctx, st.exp || 'happy', st.blink, t);
      ctx.restore();
      // flippers out to both sides of her, paddling
      const fl = A.flip[0];
      for (const sg of [-1, 1]) {
        ctx.save(); ctx.translate(sg * 18, 9); ctx.scale(sg, 1); ctx.rotate(-0.6 + Math.sin(ph * 1.2 + sg) * 0.2);
        ctx.drawImage(fl.c, -fl.ax, -fl.ay); ctx.restore();
      }
    },
  };

  global.MenuArt = MenuArt;
})(typeof window !== 'undefined' ? window : this);
