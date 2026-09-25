// ===========================================================================
//  INTRO — "MANATEE VS BOATS" opening cinematic.
//  Twelve beats of side-scrolling 640x360 pixel art, near enough two
//  minutes of it, nearly all in daylight, all of it SPOKEN by the animals in
//  shot rather than narrated over them.  Every layer is generated
//  procedurally at load and scrolled; nothing is rebuilt per frame.
//  This is the only cutscene the game keeps, so it carries the whole setup,
//  in order:
//    1  home        a whole family, unmarked, in clean water
//    2  raid        the fleet takes her father and her mother, and opens her
//    3  yacht       the white boat, and the man who puts a price on calves
//    4  net         her brother is taken alive; she finds the tear
//    5  captured    the crane does not miss.  Out of the water, and out
//    6  crate       she wakes in a box in a fish hold, under the catch
//    7  junk        the heap moves -- and the otter digs himself out of it
//    8  plan        he has been chewing one bolt for nineteen days, and he
//                   knows which boat took her brother and where it went
//    9  breakout    his bolt, her shoulder, and out through the hull with
//                   him stood on her back shouting directions
//   10  reef        she takes him home, and home is still red
//   11  pact        they agree on the work, out loud
//   12  colours     black flag up, and they turn and run AT the fleet
//  THE OTTER IS FOUND, NOT SENT.  He is dug out of somebody else's catch in
//  the same box she is locked in, and the escape is his plan -- which is the
//  only thing that makes the pair of them read as a pair rather than as a
//  hero and a mascot who turned up.  Beats 7-9 are the talkiest in the
//  cinematic on purpose: he will not stop, she answers in four words.
//  NOTHING IS PRE-DAMAGED.  Every actor enters beat 1 with `scarred` false
//  and no wounds; the flag is set on the frame the steel goes in, in beat 2,
//  on whoever it went into.  The opening seven seconds have to read as safe
//  or the rest of it costs nothing.
//  It is played in bright sun on purpose.  A harpoon going into a mother in
//  full daylight, with the sky still blue over it, is worse than the same
//  thing in the dark, and the only thing that goes red in here is the water.
//  The one exception is the hold: beats 6-8 are inside a boat, and the
//  inside of a boat is one bulb and a lot of cold dark.
//  Public API:  Intro.reset() / Intro.update(dt) / Intro.render(ctx) /
//               Intro.done / Intro.skip()
// ===========================================================================
(function (global) {
'use strict';

// ------------------------------------------------------------- tiny raster
const R = Math.round;
function can(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
function cx2(c) { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; }
function spr(c, ax, ay) { return { c: c, w: c.width, h: c.height, ax: ax === undefined ? c.width / 2 : ax, ay: ay === undefined ? c.height / 2 : ay }; }
function P(ctx, col, x, y, w, h) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w === undefined ? 1 : w | 0, h === undefined ? 1 : h | 0); }
// hard-edged 1px line (no AA, no strokes)
function LN(ctx, col, x0, y0, x1, y1) {
  x0 = x0 | 0; y0 = y0 | 0; x1 = x1 | 0; y1 = y1 | 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, n = 0;
  ctx.fillStyle = col;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if ((x0 === x1 && y0 === y1) || ++n > 900) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
function tri(ctx, col, ax, ay, bx, by, cx, cy) {
  ctx.fillStyle = col;
  const y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
  for (let y = y0; y <= y1; y++) {
    let lo = 1e9, hi = -1e9;
    const pts = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
    for (const [px0, py0, px1, py1] of pts) {
      if ((py0 <= y && py1 > y) || (py1 <= y && py0 > y)) {
        const t = (y - py0) / (py1 - py0), x = px0 + (px1 - px0) * t;
        if (x < lo) lo = x; if (x > hi) hi = x;
      }
    }
    if (hi >= lo) ctx.fillRect(Math.round(lo), y, Math.max(1, Math.round(hi - lo)), 1);
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bay(x, y) { return (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16; }
function qa(a) { return Math.max(0, Math.min(1, Math.round(a * 12) / 12)); }   // quantized alpha
// Every alpha in this file is quantized to twelfths and every colour in it is
// one of a few dozen hex strings, so there are only ever a few hundred
// distinct fill strings in the whole cinematic.  Building them fresh meant
// three string allocations per particle per frame -- a few thousand a frame
// once the water is full of blood, which is pure garbage for the collector.
// They are built once and looked up after that.
const _RGBA = new Map();
function rgbaq(hex, a) {
  const q = a > 0.99999 ? 12 : a < 0 ? 0 : Math.round(a * 12);
  const key = hex + q;
  let out = _RGBA.get(key);
  if (out === undefined) {
    const c = hexToRgb(hex);
    out = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (q / 12) + ')';
    _RGBA.set(key, out);
  }
  return out;
}

// ----------------------------------------------------------------- palette
const IP = {
  // The one ink.  chars.js inks the whole cast with CPAL.out; the boats, the
  // crates and the reef in here are inked with the same value, so a hull and
  // a manatee are drawn with the same pen.
  ink: '#1a1220', ink2: '#2c2436',
  // one bright blue hour of sky, ramped zenith -> horizon
  sky:     ['#2c74b4', '#3d8bc8', '#5aa6dc', '#7ec2ea', '#a2d9f4', '#c4ecfc'],
  // vegetation
  kelp: ['#0d3f22', '#1a6b35', '#2d9a4a', '#4bc45f', '#7ee87f'],
  grass: ['#13472a', '#237038', '#3aa04a', '#5fca5e'],
  coralA: ['#8a1d3c', '#c22f53', '#f0546f', '#ff94a4'],
  coralB: ['#8a4a0e', '#cc7a14', '#f5a82a', '#ffd977'],
  coralC: ['#432a78', '#6a3fae', '#9160dc', '#c096f2'],
  sand: ['#4b4a38', '#6d6a4c', '#8f8a62', '#b2ab7d', '#d0c79a'],
  rock: ['#1b2230', '#2b3444', '#3d4859', '#535f72', '#6e7b8e'],
  // sun-warmed sandstone for the shallow reef, so the bed is not all blue-grey
  rockWarm: ['#2a2018', '#3f3324', '#5a4835', '#785f45', '#977a5a'],
  // Blood.  Five bands, bright arterial down to a near-black clot: the
  // dithered cloud picks off this ramp BY AGE, so a fresh spurt comes out
  // hot and a cloud that has hung in the water for four seconds is almost
  // black -- which is what old blood in seawater actually looks like.
  blood: ['#4b0a12', '#7a0d16', '#a8151f', '#c4202c', '#e8515a'],
  // torn meat, for the pieces that come away
  meat:  ['#2e070c', '#5e1018', '#94232a', '#c0555c', '#e89a92'],
  foam: ['#cfe8f2', '#e9f6fb', '#ffffff'],
  bone: '#e8e4d8', boneD: '#b8ae98', boneL: '#fff8e6',
  // ---- per-beat water ramps.  Three hours of ONE day: the ramps this file
  // used to carry for dusk, night, the fish tank and the harpooning went with
  // the beats that needed them.
  // home: sunlit lagoon, turquoise over warm gold-green sand light
  lagoon:  ['#86e6c0', '#46c6ab', '#25a293', '#177e7c', '#0e5f64', '#0a4750', '#07353c'],
  // the fleet overhead: the same sea, the sun off it, hulls in the way
  cold:    ['#63aec6', '#3f89a9', '#2b6a8e', '#1e5175', '#153c5c', '#0f2b46', '#0a1d32'],
  // the two of them, and the run for open water: bright, hopeful, sunlit blue
  dawn:    ['#7fe2ec', '#4cbcd8', '#3195bf', '#2375a4', '#195b88', '#124369', '#0c2f4d'],
  // ---- coloured light -----------------------------------------------------
  sunGold: '#ffdf96', sunAmber: '#ffb45a', sunCold: '#cfefff',
};

// ================================================================== WATER ==
function buildWater(ramp, w, h, opt) {
  opt = opt || {};
  const c = can(w, h), x = cx2(c), img = x.createImageData(w, h), d = img.data;
  const cols = ramp.map(hexToRgb), n = cols.length;
  const wob = opt.wob === undefined ? 0.7 : opt.wob;
  const pw = opt.pow === undefined ? 1 : opt.pow;
  for (let y = 0; y < h; y++) {
    const k = Math.pow(y / (h - 1), pw);
    for (let px = 0; px < w; px++) {
      let fi = k * (n - 1);
      fi += (vnoise(px * 0.010, y * 0.030) - 0.5) * wob;
      fi += Math.sin(px * 0.017 + y * 0.008) * 0.16;
      let i0 = Math.floor(fi), fr = fi - i0;
      if (i0 < 0) { i0 = 0; fr = 0; }
      if (i0 >= n - 1) { i0 = n - 1; fr = 0; }
      const idx = fr > bay(px, y) ? Math.min(n - 1, i0 + 1) : i0;
      const col = cols[idx], p = (y * w + px) * 4;
      d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

// ============================================================ CAUSTIC NET ==
//  The play field's ocean lights its water with three warped sine fields,
//  posterized into four steps and ADDED over the depth ramp, plus specular
//  glitter on the crests and plankton glints in the gloom (src/water.js does
//  all of it per pixel per frame).  Without it the cinematic's water is a
//  clean vertical ramp and reads like a painted backdrop next to the bay you
//  actually play in.  A wide shot cannot afford the shader, so the same three
//  fields are baked into a tile here at three phases and cycled -- two
//  drawImage calls a frame, and the beat's own grade recolours it, exactly
//  the way the sun shafts and the motes are already handled.
const CAUST_H = 300;
function buildCaustNet(seed, ph) {
  const c = can(LW, CAUST_H), x = cx2(c);
  const img = x.createImageData(LW, CAUST_H), d = img.data;
  for (let y = 0; y < CAUST_H; y++) {
    const dep = y / (CAUST_H - 1);
    const fade = Math.max(0, 1 - dep * 1.22);        // gone by four fifths down
    for (let px = 0; px < LW; px++) {
      // src/water.js's own three frequencies, taken down together by a bit so
      // the cells come out the size of a cinematic instead of the size of a
      // play field.  The ratios between them are what turns three gratings
      // into a net, so they are not touched.
      const q3 = Math.sin(px * 0.019 - y * 0.016 + ph * 0.55);
      const s1 = Math.sin(px * 0.047 + y * 0.029 + ph * 1.15 + q3 * 2.1);
      const s2 = Math.sin(-px * 0.037 + y * 0.052 - ph * 0.95 - q3 * 1.7);
      const cv = s1 + s2 + q3 * 0.55;
      // Two hard steps of light with an ordered dither between them -- the
      // same posterize-then-Bayer the water ramps and the colour grades in
      // this file are built with.  A smooth wash would read as blur, which is
      // the one thing the play field never does.
      const g = Math.max(0, (cv - 0.52) / 1.55) * 2.4 * fade;
      const gi = Math.floor(g), lv = Math.min(2, (g - gi) > bay(px, y) ? gi + 1 : gi);
      let a = [0, 0.26, 0.50][lv];
      if (y < 22 && hash2(px, y + seed * 97) > 0.972) a = 0.72 * fade;           // crest glitter
      else if (dep > 0.55 && (px & 3) === 0 && (y & 3) === 0 && hash2(px >> 2, (y >> 2) + seed * 31) > 0.980) a = 0.28;
      a = qa(a);
      if (a <= 0.02) continue;
      const q = (y * LW + px) * 4;
      d[q] = 226; d[q + 1] = 250; d[q + 2] = 255; d[q + 3] = R(a * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

// ============================================================== SUN SHAFTS ==
function buildShafts(w, h, tint) {
  const c = can(w, h), x = cx2(c);
  const rng = new SeededRandom(9137);
  for (let i = 0; i < 11; i++) {
    const bx = rng.range(0, w), bw = rng.range(9, 34), slope = rng.range(0.16, 0.40);
    const len = rng.range(h * 0.55, h);
    for (let y = 0; y < len; y++) {
      const k = 1 - y / len;
      const a0 = qa(k * k * 0.16);
      if (a0 <= 0) continue;
      const ww = Math.max(2, R(bw * (0.55 + k * 0.45)));
      const sx = R(bx + y * slope);
      x.fillStyle = rgbaq(tint, a0 * 0.45); x.fillRect(sx, y, ww, 1);
      x.fillStyle = rgbaq(tint, a0); x.fillRect(sx + R(ww * 0.3), y, Math.max(1, R(ww * 0.35)), 1);
    }
  }
  return c;
}

// ============================================================ COLOUR GRADE ==
// A baked, posterised, dithered wash.  `stops` are [yFraction, hex, alpha]
// read top to bottom; the vertical position is quantised into hard bands and
// bayer-dithered at the seams, and the alpha is quantised to 1/16ths, so the
// result stays pixel art rather than a canvas gradient.  Built once, blitted.
function buildGrade(stops, bands) {
  bands = bands || 22;
  const c = can(640, 360), x = cx2(c), img = x.createImageData(640, 360), d = img.data;
  const cols = stops.map(s => hexToRgb(s[1]));
  for (let y = 0; y < 360; y++) {
    const f = y / 359 * bands;
    const i0 = Math.floor(f), fr = f - i0;
    for (let px = 0; px < 640; px++) {
      const b = clamp((fr > bay(px, y) ? i0 + 1 : i0) / bands, 0, 1);
      // locate the segment this banded position falls in
      let s = 0;
      while (s < stops.length - 2 && b > stops[s + 1][0]) s++;
      const a0 = stops[s], a1 = stops[s + 1];
      const span = Math.max(1e-6, a1[0] - a0[0]);
      const k = clamp((b - a0[0]) / span, 0, 1);
      const c0 = cols[s], c1 = cols[s + 1];
      const r = a0[2] + (a1[2] - a0[2]) * k;
      if (r <= 0.002) continue;
      const aq = r * 16, ai = Math.floor(aq), af = aq - ai;
      const A = clamp((af > bay(px + 2, y + 1) ? ai + 1 : ai) / 16, 0, 1);
      if (A <= 0) continue;
      const p = (y * 640 + px) * 4;
      d[p] = R(c0[0] + (c1[0] - c0[0]) * k);
      d[p + 1] = R(c0[1] + (c1[1] - c0[1]) * k);
      d[p + 2] = R(c0[2] + (c1[2] - c0[2]) * k);
      d[p + 3] = R(A * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
// Each entry: [scenery grade (under the actors), light grade (over everything)]
// plus the colour of the sun shafts and the caustics for that beat.
const GRADE = {}, GLOW = {};
const GRADE_SPEC = {
  // warm sunlit lagoon: gold light pouring in on top, cool green-blue floor
  lagoon: {
    bg: [[0, '#ffe58e', 0.34], [0.18, '#ffcf72', 0.13], [0.46, '#4fd8a8', 0.03], [0.72, '#2f9e7e', 0.08], [1, '#ffc055', 0.20]],
    fg: [[0, '#ffe7a4', 0.20], [0.30, '#ffd27e', 0.09], [0.66, '#7fe0c0', 0.02], [1, '#0e5468', 0.10]],
    shaft: 'warm', caustic: '#ffeaa8', bedCaustic: '#ffe09a', mote: '#ffeec2',
  },
  // the boat: the warmth drains out, steel and cyan
  cold: {
    bg: [[0, '#cfeaff', 0.20], [0.26, '#8fc4e4', 0.11], [0.56, '#2f6f94', 0.10], [1, '#07243c', 0.32]],
    fg: [[0, '#dff1ff', 0.14], [0.34, '#9fcde8', 0.05], [1, '#062036', 0.14]],
    shaft: 'cold', caustic: '#d8f2ff', bedCaustic: '#bfe4ff', mote: '#cfe8f8',
  },
  // straight up noon, once she is on her own: the palest, brightest hour in
  // here, so the empty water reads as bright and empty rather than as gloom
  noon: {
    bg: [[0, '#ffffcc', 0.30], [0.20, '#c2f4e4', 0.12], [0.52, '#63d8c6', 0.04], [0.78, '#37b0a8', 0.07], [1, '#ffd77a', 0.14]],
    fg: [[0, '#ffffe0', 0.17], [0.34, '#c8f6ec', 0.05], [0.70, '#8fe8d8', 0.02], [1, '#1c7f92', 0.08]],
    shaft: 'warm', caustic: '#fffce0', bedCaustic: '#fff0bc', mote: '#fffce4',
  },
  // out, and into open sun
  dawn: {
    bg: [[0, '#fff0b4', 0.34], [0.18, '#ffe08a', 0.17], [0.44, '#9fe8ec', 0.07], [0.74, '#2f9fc8', 0.10], [1, '#0b3358', 0.26]],
    fg: [[0, '#fff4c8', 0.18], [0.30, '#a8ecef', 0.06], [1, '#0c3a60', 0.12]],
    shaft: 'warm', caustic: '#fff0c0', bedCaustic: '#ffe4a8', mote: '#e8fbff',
  },
  // ---- THE BLOOD WASH.  This one is not an hour of the day and no beat is
  // lit by it on its own: it is laid OVER whichever hour the beat is in, on
  // an alpha the beat drives frame by frame.  The user asked for daylight and
  // the daylight stays -- blue sky, whitecaps, sun shafts, all of it -- and
  // the water UNDER it fills with red as the family is opened up.  Bright
  // over dark is the whole point; a red frame with a red sky would just be a
  // mood, and this has to read as a clear afternoon that someone bled into.
  gore: {
    bg: [[0, '#ff8a5e', 0.18], [0.24, '#e02630', 0.40], [0.60, '#9c101a', 0.50], [1, '#4a0410', 0.60]],
    fg: [[0, '#ff9070', 0.14], [0.38, '#b81c26', 0.20], [1, '#2a0409', 0.30]],
    shaft: 'warm', caustic: '#ffb59a', bedCaustic: '#c9645c', mote: '#e8a89a',
  },
};

function drawChurn(ctx, px, py, t, inten) {
  for (let i = 0; i < 24; i++) {
    const d = i * 5.5, k = i / 24;
    const hgt = 7 + k * 40 + Math.sin(t * 9 + i * 0.7) * 4;
    const yy = py - hgt / 2 + Math.sin(t * 5 + i * 0.5) * 3;
    ctx.fillStyle = rgbaq('#bcdcea', qa((0.30 - k * 0.26) * inten));
    ctx.fillRect(R(px + d), R(yy), 6, R(hgt));
    ctx.fillStyle = rgbaq('#eaf8ff', qa((0.34 - k * 0.32) * inten));
    ctx.fillRect(R(px + d), R(yy + hgt * 0.22), 6, R(hgt * 0.46));
    if (hash2(i, Math.floor(t * 12)) > 0.55) { ctx.fillStyle = rgbaq('#ffffff', qa(0.5 - k * 0.45)); ctx.fillRect(R(px + d), R(yy + hash2(i, 3) * hgt), 4, 2); }
  }
}
// ============================================================== VEGETATION ==
function kelpStalk(x, rng, baseY, hgt, ramp, thick, lean) {
  // returns a draw function so the same stalk can be stamped on several layers
  const ph = rng.range(0, TAU), amp = rng.range(3, 9);
  return function (ctx) {
    let px = x;
    for (let i = 0; i < hgt; i++) {
      const y = baseY - i, k = i / hgt;
      px = x + Math.sin(k * 3.1 + ph) * amp * k + lean * k * k * 18;
      const tw = Math.max(1, R(thick * (1 - k * 0.55)));
      P(ctx, ramp[1], R(px), y, tw, 1);
      P(ctx, ramp[3], R(px), y, 1, 1);
      P(ctx, IP.ink, R(px) - 1, y, 1, 1);
      P(ctx, IP.ink, R(px) + tw, y, 1, 1);
      // blades
      if (i > 5 && i % 6 === (x | 0) % 6) {
        const side = (i % 18 < 9) ? 1 : -1;
        const bl = R(rng.range(7, 14));
        for (let b = 0; b < bl; b++) {
          const by = y + R(b * 0.55), bxx = R(px) + side * (b + tw);
          P(ctx, ramp[2], bxx, by, 1, 2);
          if (b < bl - 2) P(ctx, ramp[4], bxx, by, 1, 1);
          P(ctx, IP.ink, bxx, by + 2, 1, 1);
        }
      }
    }
    // holdfast
    P(ctx, ramp[0], R(px) - 2, baseY - 1, 5, 2);
  };
}
function drawCoralFan(ctx, x, y, s, ramp) {
  const rng = new SeededRandom((x * 77 + y * 13) | 1);
  for (let a = -1.25; a <= 1.25; a += 0.12) {
    const len = s * (0.65 + Math.cos(a) * 0.45) * rng.range(0.85, 1.15);
    const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
    LN(ctx, ramp[1], x, y, R(ex), R(ey));
    LN(ctx, ramp[2], x + 1, y, R(ex) + 1, R(ey));
  }
  for (let a = -1.2; a <= 1.2; a += 0.36) {
    const len = s * (0.62 + Math.cos(a) * 0.42);
    LN(ctx, ramp[3], x, y, R(x + Math.sin(a) * len), R(y - Math.cos(a) * len));
  }
  P(ctx, IP.ink, x - 2, y - 1, 5, 3);
  P(ctx, ramp[0], x - 1, y - 1, 3, 2);
}
function drawCoralBrain(ctx, x, y, s, ramp) {
  const W = s * 2 + 4, H = s + 4;
  const f = blobField(W, H, [
    { x: W * 0.32, y: H * 0.72, rx: s * 0.62, ry: s * 0.62 },
    { x: W * 0.55, y: H * 0.62, rx: s * 0.78, ry: s * 0.75 },
    { x: W * 0.76, y: H * 0.75, rx: s * 0.52, ry: s * 0.5 },
  ]);
  const o = shadeBlob(W, H, f, [ramp[0], ramp[1], ramp[2], ramp[3]], { outline: IP.ink, lift: 0.18, smooth: 2 });
  // squiggle grooves
  for (let i = 0; i < s * 1.5; i++) {
    const gx = R(2 + hash2(i * 3, s) * (W - 4)), gy = R(2 + hash2(i * 7, s * 3) * (H - 4));
    if (f[gy * W + gx] > 0.12) { P(o.ctx, ramp[0], gx, gy, 2, 1); P(o.ctx, ramp[3], gx, gy - 1, 2, 1); }
  }
  ctx.drawImage(o.c, x - (W >> 1), y - H);
}
function drawCoralTubes(ctx, x, y, s, ramp) {
  const rng = new SeededRandom((x * 31 + y * 17) | 1);
  for (let i = 0; i < 5; i++) {
    const tw = R(rng.range(3, 6)), th = R(rng.range(s * 0.5, s * 1.25));
    const tx = R(x + rng.range(-s, s)), ty = y - th;
    P(ctx, IP.ink, tx - 1, ty - 1, tw + 2, th + 2);
    P(ctx, ramp[1], tx, ty, tw, th);
    P(ctx, ramp[2], tx, ty, 1, th);
    P(ctx, ramp[3], tx, ty, tw, 1);
    P(ctx, IP.ink, tx + 1, ty, Math.max(1, tw - 2), 1);
  }
}
function drawStaghorn(ctx, x, y, s, ramp, ang, depth) {
  if (depth > 3 || s < 3) return;
  const ex = x + Math.cos(ang) * s, ey = y + Math.sin(ang) * s;
  LN(ctx, IP.ink, x, y - 1, R(ex), R(ey) - 1);
  LN(ctx, ramp[1], x, y, R(ex), R(ey));
  LN(ctx, ramp[2], x + 1, y, R(ex) + 1, R(ey));
  if (depth >= 2) P(ctx, ramp[3], R(ex), R(ey) - 1, 2, 2);
  drawStaghorn(ctx, R(ex), R(ey), s * 0.68, ramp, ang - 0.55 - hash2(x, y) * 0.3, depth + 1);
  drawStaghorn(ctx, R(ex), R(ey), s * 0.68, ramp, ang + 0.5 + hash2(y, x) * 0.3, depth + 1);
}
// ================================================================ CARRION ==
//  What the fleet leaves on the bottom.  All of it is stamped INTO the baked
//  reef layers, so every beat of the cinematic is played over somebody
//  else's bones and it costs nothing per frame.  Same discipline as the
//  coral: whole pixels, an ink line round everything, three bone tones.
function drawRibcage(ctx, x, y, len, hgt, flip) {
  const f = flip ? -1 : 1;
  // spine: a run of vertebrae, sagging where the body settled
  for (let i = 0; i < len; i++) {
    const sy = y - R(Math.sin(i / len * 2.3) * 3);
    P(ctx, IP.ink, x + f * i, sy - 1, 1, 4);
    P(ctx, IP.bone, x + f * i, sy, 1, 2);
    if ((i & 3) === 0) P(ctx, IP.boneL, x + f * i, sy, 1, 1);
  }
  // Ribs.  Uneven spacing, uneven length and one in four snapped off short:
  // evenly spaced ribs of equal length read as a garden rake, not a body.
  for (let i = 2; i < len - 2; i += 3 + ((hash2(x + i, y) * 2.4) | 0)) {
    const k = i / len;
    const broke = hash2(x + i * 3, y + 7) > 0.72;
    let h = R(hgt * Math.sin(k * Math.PI) * (0.75 + hash2(x + i, y + 3) * 0.45)) + 3;
    if (broke) h = Math.max(3, R(h * rand(0.28, 0.55)));
    const sy = y - R(Math.sin(k * 2.3) * 3);
    for (let j = 0; j < h; j++) {
      const bend = R(j * j / Math.max(5, h) * (0.55 + hash2(x + i, y + j) * 0.5));
      const bx = x + f * i - f * bend;
      P(ctx, IP.ink, bx - 1, sy + 2 + j, 3, 1);
      P(ctx, j > h - 3 ? IP.boneD : IP.bone, bx, sy + 2 + j, 1, 1);
      if (j === 1) P(ctx, IP.boneL, bx, sy + 3, 1, 1);
    }
    if (broke) P(ctx, IP.ink, x + f * i - f * R(h * 0.3) - 1, sy + 2 + h, 3, 1);
  }
}
function drawSkullBone(ctx, x, y, s) {
  // a manatee skull: a heavy blunt cranium, a squared snout, two black pits
  const h = R(s * 0.72);
  P(ctx, IP.ink, x - 1, y - 1, s + 2, h + 2);
  P(ctx, IP.bone, x, y, s, h);
  P(ctx, IP.boneL, x, y, s, 2);
  P(ctx, IP.boneD, x, y + h - 2, s, 2);
  const sw = R(s * 0.46), sh = R(s * 0.40);
  P(ctx, IP.ink, x + s - 1, y + R(s * 0.24) - 1, sw + 2, sh + 2);
  P(ctx, IP.bone, x + s, y + R(s * 0.24), sw, sh);
  P(ctx, IP.boneL, x + s, y + R(s * 0.24), sw, 1);
  const e = Math.max(2, R(s * 0.22));
  P(ctx, '#0b0508', x + R(s * 0.16), y + R(s * 0.24), e, e);
  P(ctx, '#0b0508', x + R(s * 0.58), y + R(s * 0.24), e, e);
  P(ctx, IP.boneD, x + R(s * 0.34), y + 2, 1, h - 4);         // a split down the plate
}
// A harpoon somebody else took, still in the reef, with the line frayed off
// it.  Three of these in the mid layer and the bay reads as a killing ground
// before a single shot is fired in the cinematic.
function drawSpentHarpoon(ctx, x, y, ang) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let i = 0; i < 24; i++) {
    const px2 = R(x - dx * i), py2 = R(y - dy * i);
    P(ctx, IP.ink, px2, py2 - 1, 1, 3);
    P(ctx, i > 18 ? '#7d4a22' : '#6b7382', px2, py2, 1, 1);
    if (i < 6) P(ctx, '#8d2a22', px2, py2 + 1, 1, 1);        // rust, or what is left of the last one
  }
  // the frayed line, still knotted to the butt
  const lx = x - dx * 24, ly = y - dy * 24;
  for (let i = 0; i < 26; i++) {
    const wx = R(lx - i * 1.4), wy = R(ly - Math.sin(i * 0.5) * 4 - i * 0.3);
    P(ctx, (i & 1) ? '#8a7548' : '#5e4f30', wx, wy, 2, 1);
  }
}
function drawRockForm(ctx, x, yBase, w, h, ramp, spiky) {
  const W = w + 4, H = h + 4;
  const lobes = [];
  const n = spiky ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    lobes.push({ x: W * (0.2 + k * 0.62), y: H - (spiky ? h * (0.28 + hash2(x, i) * 0.55) : h * 0.35), rx: w * (0.18 + hash2(i, x) * 0.16), ry: h * (0.32 + hash2(i * 3, x) * 0.5) });
  }
  lobes.push({ x: W * 0.5, y: H - h * 0.18, rx: w * 0.46, ry: h * 0.3 });
  const f = blobField(W, H, lobes);
  const o = shadeBlob(W, H, f, ramp, { outline: IP.ink, lift: 0.2, smooth: 2 });
  for (let i = 0; i < w; i++) {
    const gx = R(hash2(i * 5, x) * W), gy = R(hash2(i * 11, x * 3) * H);
    if (f[gy * W + gx] > 0.3 && hash2(gx, gy) > 0.6) P(o.ctx, ramp[0], gx, gy, 1, 2);
  }
  ctx.drawImage(o.c, x - (W >> 1), yBase - H + 2);
}

// ---- layer builders --------------------------------------------------------
const LW = 768;                                   // tile width of every layer
function buildBed() {
  const H = 86, c = can(LW, H), x = cx2(c);
  const rng = new SeededRandom(2255);
  // sand body, dithered bands, lighter toward the top
  const cols = IP.sand;
  for (let y = 0; y < H; y++) {
    for (let px = 0; px < LW; px++) {
      const k = 1 - y / H;
      let fi = k * 2.1 + (vnoise(px * 0.035, y * 0.08) - 0.5) * 1.5 + 1.1;
      let i0 = Math.floor(fi), fr = fi - i0;
      i0 = clamp(i0, 0, cols.length - 1);
      const idx = clamp(fr > bay(px, y) ? i0 + 1 : i0, 0, cols.length - 1);
      P(x, cols[idx], px, y);
    }
  }
  // dune crest line
  for (let px = 0; px < LW; px++) {
    const yy = R(2 + vnoise(px * 0.02, 5) * 7);
    P(x, IP.ink, px, yy + 2, 1, 1);
    P(x, cols[4], px, yy, 1, 2);
    for (let y = 0; y < yy; y++) P(x, 'rgba(0,0,0,0)', px, y);
  }
  // clear everything above the crest
  const img = x.getImageData(0, 0, LW, H), d = img.data;
  for (let px = 0; px < LW; px++) {
    const yy = R(2 + vnoise(px * 0.02, 5) * 7);
    for (let y = 0; y < yy; y++) { const p = (y * LW + px) * 4; d[p + 3] = 0; }
  }
  x.putImageData(img, 0, 0);
  // ripples, pebbles, shells
  for (let i = 0; i < 150; i++) {
    const rx = R(rng.range(0, LW)), ry = R(rng.range(10, H - 4)), rw = R(rng.range(5, 18));
    P(x, cols[Math.max(0, 2 - (ry / H * 2 | 0))], rx, ry, rw, 1);
    P(x, cols[4], rx + 1, ry - 1, Math.max(1, rw - 3), 1);
  }
  for (let i = 0; i < 70; i++) {
    const rx = R(rng.range(0, LW)), ry = R(rng.range(12, H - 6)), s = R(rng.range(1, 3));
    P(x, IP.ink, rx, ry, s + 1, s + 1); P(x, IP.rockWarm[3], rx, ry, s, s);
  }
  // bone shards and vertebrae, half buried, rather than pretty shells
  for (let i = 0; i < 26; i++) {
    const rx = R(rng.range(0, LW)), ry = R(rng.range(14, H - 8)), w = R(rng.range(3, 8));
    P(x, IP.ink, rx - 1, ry - 1, w + 2, 4); P(x, IP.bone, rx, ry, w, 2); P(x, IP.boneL, rx, ry, w, 1);
    if (hash2(rx, ry) > 0.55) { P(x, IP.ink, rx + R(w / 2) - 1, ry - 3, 3, 4); P(x, IP.boneD, rx + R(w / 2), ry - 2, 1, 2); }
  }
  return c;
}
function buildGrass(H, ramp, dens, tall, seed) {
  const c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let i = 0; i < dens; i++) {
    const gx = R(rng.range(0, LW)), h = R(rng.range(tall * 0.4, tall));
    const bend = rng.range(-0.5, 0.5), ph = rng.range(0, TAU);
    let px = gx;
    for (let j = 0; j < h; j++) {
      const k = j / h;
      px = gx + Math.sin(k * 2.2 + ph) * 3 * k + bend * k * k * 10;
      P(x, IP.ink, R(px) - 1, H - 1 - j, 3, 1);
      P(x, ramp[1 + ((j + gx) % 2)], R(px), H - 1 - j, 1, 1);
      if (k > 0.7) P(x, ramp[3], R(px), H - 1 - j, 1, 1);
    }
  }
  return c;
}
function buildShallowMid(seed, bones) {
  const H = 190, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let i = 0; i < 11; i++) drawRockForm(x, R(rng.range(0, LW)), H - R(rng.range(0, 7)), R(rng.range(20, 52)), R(rng.range(12, 30)), IP.rockWarm, false);
  for (let i = 0; i < 12; i++) {
    const kx = R(rng.range(0, LW));
    kelpStalk(kx, rng, H - R(rng.range(0, 6)), R(rng.range(50, 130)), IP.kelp, R(rng.range(2, 4)), rng.range(-0.5, 0.5))(x);
  }
  for (let i = 0; i < 8; i++) drawCoralFan(x, R(rng.range(0, LW)), H - R(rng.range(2, 12)), R(rng.range(12, 24)), pick([IP.coralA, IP.coralC, IP.coralB]));
  for (let i = 0; i < 8; i++) drawCoralBrain(x, R(rng.range(0, LW)), H - R(rng.range(0, 8)), R(rng.range(7, 14)), pick([IP.coralB, IP.coralA]));
  for (let i = 0; i < 6; i++) drawCoralTubes(x, R(rng.range(0, LW)), H - R(rng.range(0, 6)), R(rng.range(10, 20)), pick([IP.coralC, IP.coralA]));
  for (let i = 0; i < 6; i++) drawStaghorn(x, R(rng.range(0, LW)), H - 4, rng.range(9, 14), IP.coralB, -Math.PI / 2 + rng.range(-0.3, 0.3), 0);
  // ---- and the bones.  Three picked-over ribcages, four skulls and three
  // spent harpoons, laid along the reef where the fleet has already worked.
  // The opening beat asks for this reef WITHOUT them: nothing bad has
  // happened to this family yet and the set must not say otherwise.
  if (bones === false) return c;
  for (let i = 0; i < 3; i++) drawRibcage(x, R(rng.range(40, LW - 90)), H - R(rng.range(4, 14)), R(rng.range(26, 46)), R(rng.range(9, 15)), rng.next() > 0.5);
  for (let i = 0; i < 4; i++) drawSkullBone(x, R(rng.range(20, LW - 40)), H - R(rng.range(8, 18)), R(rng.range(9, 15)));
  for (let i = 0; i < 3; i++) drawSpentHarpoon(x, R(rng.range(60, LW - 60)), H - R(rng.range(2, 10)), rng.range(0.9, 1.5));
  return c;
}
function buildDeepMid(seed) {
  const H = 210, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  const dark = ['#0a1220', '#111b2c', '#1a263a', '#26354c', '#35465f'];
  for (let i = 0; i < 13; i++) drawRockForm(x, R(rng.range(0, LW)), H - R(rng.range(0, 6)), R(rng.range(16, 44)), R(rng.range(30, 130)), dark, true);
  const deadKelp = ['#101c20', '#1b2e2c', '#27403a', '#365349', '#496c5c'];
  for (let i = 0; i < 9; i++) {
    const kx = R(rng.range(0, LW));
    kelpStalk(kx, rng, H - R(rng.range(0, 4)), R(rng.range(40, 110)), deadKelp, 2, rng.range(-0.6, 0.6))(x);
  }
  for (let i = 0; i < 2; i++) drawRibcage(x, R(rng.range(40, LW - 90)), H - R(rng.range(2, 8)), R(rng.range(30, 52)), R(rng.range(10, 16)), rng.next() > 0.5);
  return c;
}
function tintLayer(src, col, a) {
  const c = can(src.width, src.height), x = cx2(c);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = rgbaq(col, a); x.fillRect(0, 0, c.width, c.height);
  return c;
}
function buildSurfaceUnder(seed, foamCol, waterCol) {
  const H = 34, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let px = 0; px < LW; px++) {
    const w = Math.sin(px * 0.055) * 3.2 + Math.sin(px * 0.021 + 1.7) * 2.4 + Math.sin(px * 0.11) * 1.1;
    const top = R(6 + w);
    for (let y = 0; y < top; y++) P(x, 'rgba(0,0,0,0)', px, y);
    P(x, foamCol[2], px, top, 1, 1);
    P(x, foamCol[1], px, top + 1, 1, 2);
    P(x, foamCol[0], px, top + 3, 1, 1);
    for (let y = top + 4; y < top + 16 && y < H; y++) {
      const k = (y - top) / 16;
      if (hash2(px, y) > 0.52 + k * 0.5) P(x, foamCol[0], px, y, 1, 1);
    }
  }
  for (let i = 0; i < 40; i++) {
    const bx = R(rng.range(0, LW)), by = R(rng.range(2, 12));
    P(x, foamCol[2], bx, by, R(rng.range(2, 6)), 1);
  }
  return c;
}

// ================================================================ MANATEES ==
//  Nobody in this cinematic is drawn here any more.  Every manatee in the
//  opening IS the cast's own side-on manatee — CH.side out of src/chars.js,
//  the same sprite set src/death.js and src/scenes.js compose — so when she
//  is rebuilt the whole opening moves with her.
//
//  The family are variations ON her, not four different animals: the same
//  raster, reduced to each body's length on the cast's own most-opaque-wins
//  filter, re-inked round the silhouette with her own outline, and put
//  through a hide shift that leaves the ink, the eye, the algae, the bone
//  and the blood exactly where she left them.
//
//  One grid.  The cast's side-on art is one art pixel per world unit, which
//  is what every baked layer in this file already is, and the game's 2x
//  presentation turns that into a square 2x2 block of screen pixels.
//  Nothing here is drawn at a fractional scale.
// Each family member is her hide put through a multiply and a lift.  Small
// numbers: they are her mother, her father and her brother.
const MAN_SHIFT = {
  you: null,                                        // the hero: the cast, as built
  dad: { m: [0.80, 0.81, 0.86], a: [2, 1, 6] },     // older, heavier, colder
  mom: { m: [1.00, 0.97, 0.95], a: [6, 3, 1] },     // a shade warmer
  bro: { m: [1.04, 1.05, 1.09], a: [5, 6, 10] },    // young: paler and bluer
};

// ---- one reduction, the cast's own ----------------------------------------
// The most opaque sample in each source block wins, so nothing thin falls out
// of a smaller body.  Same filter chars.js bakes CH.manatee with and
// src/scenes.js reduces the side set with.
function shrinkSpr(s, k) {
  const SW = s.c.width, SH = s.c.height;
  const W = Math.max(1, R(SW * k)), H = Math.max(1, R(SH * k));
  const src = cx2(can(SW, SH));
  src.drawImage(s.c, 0, 0, SW, SH, 0, 0, SW, SH);        // 8-arg: no hi-res bridge
  if (W === SW && H === SH) return spr(src.canvas, s.ax, s.ay);
  const d = src.getImageData(0, 0, SW, SH).data;
  const c = can(W, H), x = cx2(c), img = x.createImageData(W, H), o = img.data;
  const bw = SW / W, bh = SH / H;
  for (let y = 0; y < H; y++) for (let px = 0; px < W; px++) {
    let best = -1, bi = 0;
    const x0 = Math.floor(px * bw), x1 = Math.max(x0 + 1, Math.ceil((px + 1) * bw));
    const y0 = Math.floor(y * bh), y1 = Math.max(y0 + 1, Math.ceil((y + 1) * bh));
    for (let sy = y0; sy < y1 && sy < SH; sy++) for (let sx = x0; sx < x1 && sx < SW; sx++) {
      const q = (sy * SW + sx) * 4;
      if (d[q + 3] > best) { best = d[q + 3]; bi = q; }
    }
    const q = (y * W + px) * 4;
    o[q] = d[bi]; o[q + 1] = d[bi + 1]; o[q + 2] = d[bi + 2]; o[q + 3] = d[bi + 3];
  }
  x.putImageData(img, 0, 0);
  return spr(c, s.ax * k, s.ay * k);
}
// Re-ink the outermost opaque pixel all the way round.  A reduced body
// otherwise keeps a chewed edge where the filter dropped an outline pixel,
// and a manatee with no line round her is the one thing the play field never
// is.  Same pass src/scenes.js puts back after it darkens a part.  Her bone
// whites -- the barnacles and the whiskers standing off her snout -- are let
// through, because they are meant to sit outside the line.
function inkEdge(c, col) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  const C = hexToRgb(col);
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
    const i = y * w + px;
    if (!op[i]) continue;
    if (px > 0 && op[i - 1] && px < w - 1 && op[i + 1] && y > 0 && op[i - w] && y < h - 1 && op[i + w]) continue;
    const q = i * 4;
    if (d[q] > 200 && d[q + 1] > 190 && d[q + 2] > 165) continue;
    d[q] = C[0]; d[q + 1] = C[1]; d[q + 2] = C[2]; d[q + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
// Read the cast's own outline colour off her raster instead of naming it
// here: shadeBlob paints every silhouette pixel with it, so the first opaque
// pixel down any column of her body IS the ink.
let CAST_INK = null;
function castInk() {
  if (CAST_INK) return CAST_INK;
  CAST_INK = IP.ink;
  const b = CH && CH.side && CH.side.body;
  if (!b) return CAST_INK;
  const W = b.c.width, H = b.c.height, x = cx2(can(W, H));
  x.drawImage(b.c, 0, 0, W, H, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, mid = W >> 1;
  for (let y = 0; y < H; y++) {
    const q = (y * W + mid) * 4;
    if (d[q + 3] > 200) { CAST_INK = 'rgb(' + d[q] + ',' + d[q + 1] + ',' + d[q + 2] + ')'; break; }
  }
  return CAST_INK;
}
// The hide shift.  Every distinct colour on her goes through it EXCEPT the
// ink (which holds the silhouette), the greens (algae), the reds (what the
// propeller did) and the near-whites (barnacle, whisker, eye shine) — those
// are hers and read the same on all four of them.
function shiftHide(c, sh, inkRGB) {
  if (!sh) return c;
  const x = cx2(c), W = c.width, H = c.height;
  const img = x.getImageData(0, 0, W, H), d = img.data;
  const M = sh.m, A = sh.a;
  for (let i = 0, n = W * H; i < n; i++) {
    const q = i * 4;
    if (d[q + 3] < 8) continue;
    const r = d[q], g = d[q + 1], b = d[q + 2];
    if (r === inkRGB[0] && g === inkRGB[1] && b === inkRGB[2]) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 30) continue;                       // algae, blood: hers
    if (mn > 210) continue;                           // bone, shine: hers
    d[q] = Math.min(255, (r * M[0] + A[0]) | 0);
    d[q + 1] = Math.min(255, (g * M[1] + A[1]) | 0);
    d[q + 2] = Math.min(255, (b * M[2] + A[2]) | 0);
  }
  x.putImageData(img, 0, 0);
  return c;
}
// The one hide tone her face needs, read back off the finished body: the
// darkest grey on her that is not the ink, which is what chars.js draws her
// brows and her shut lids with.
function darkTone(c, inkRGB) {
  const W = c.width, H = c.height, x = cx2(can(W, H));
  x.drawImage(c, 0, 0, W, H, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  let dk = null, dkL = 1e9;
  for (let i = 0, n = W * H; i < n; i++) {
    const q = i * 4;
    if (d[q + 3] < 200) continue;
    const r = d[q], g = d[q + 1], b = d[q + 2];
    if (r === inkRGB[0] && g === inkRGB[1] && b === inkRGB[2]) continue;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 30) continue;
    const L = r + g + b;
    if (L < dkL) { dkL = L; dk = [r, g, b]; }
  }
  return dk ? 'rgb(' + dk[0] + ',' + dk[1] + ',' + dk[2] + ')' : '#332f39';
}
// Her own silhouette in white, for the frame a barb goes in.  Every opaque
// pixel of her, at her own alpha, painted flat: no tint pass, no compositing
// mode, nothing that can reach outside the sprite.
function whiteMask(sp) {
  const W = sp.c.width, H = sp.c.height, c = can(W, H), x = cx2(c);
  x.drawImage(sp.c, 0, 0, W, H, 0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0, n = W * H; i < n; i++) {
    const q = i * 4;
    if (d[q + 3] < 8) { d[q + 3] = 0; continue; }
    d[q] = 255; d[q + 1] = 255; d[q + 2] = 255;
  }
  x.putImageData(img, 0, 0);
  return spr(c, sp.ax, sp.ay);
}
// ---- one family member -----------------------------------------------------
function buildManatee(len, who) {
  const S = CH.side;
  const k = len / S.len;
  const ink = castInk(), inkRGB = hexToRgb(ink), sh = MAN_SHIFT[who] || null;
  // At her own length nothing is resampled, so nothing needs re-inking and
  // she comes out of here pixel for pixel the sprite the cast handed over.
  const part = (s) => {
    const r = shrinkSpr(s, k);
    shiftHide(r.c, sh, inkRGB);
    if (k < 0.999) inkEdge(r.c, ink);
    return r;
  };
  const body = part(S.body);
  return {
    L: len, k: k, who: who, ink: ink, dark: darkTone(body.c, inkRGB),
    // The eye box: the cast's own three art pixels of pupil on the adults,
    // two on the calves.  The eye is the one thing on her that must not be
    // resampled, so it is painted live at whichever size the body came out.
    ek: len > 74 ? 3 : len > 34 ? 2 : 1,
    body: body, bodyScar: part(S.bodyScar), flashS: whiteMask(body),
    fluke: part(S.fluke), flukeScar: part(S.flukeScar || S.fluke),
    flip: part(S.flip), flipFar: part(S.flipFar),
    eye: [S.eye[0] * k, S.eye[1] * k], mouth: [S.mouth[0] * k, S.mouth[1] * k],
    tailX: S.tailX * k, shoX: S.shoX * k, shoY: S.shoY * k,
  };
}
// ---- her face, live, at the member's own anchors ---------------------------
// The cast paints this in chars.js (CH.sideFace) at one size only; this is the
// same recipe — same boxes, same order, her ink and her hide tones — opened
// out so a calf can carry it too.
function manateeFace(ctx, M, exp, blink, t) {
  const e = M.ek, ex = R(M.eye[0]), ey = R(M.eye[1]);
  const mx = R(M.mouth[0]), my = R(M.mouth[1]);
  const O = M.ink, mw = Math.max(3, R(6 * M.k)), mh = Math.max(1, R(M.k));
  const shut = blink && exp !== 'dead' && exp !== 'wide';
  if (exp === 'pain' || shut) {
    P(ctx, O, ex - 1, ey, e + 2, mh); P(ctx, M.dark, ex - 1, ey - 2, e + 2, mh);
  } else if (exp === 'dead') {
    P(ctx, O, ex - 1, ey - 1, e + 2, e + 2); P(ctx, '#5c5668', ex, ey, e, e);
  } else {
    const big = exp === 'wide' ? 1 : 0;
    P(ctx, O, ex - 1 - big, ey - 1 - big, e + 2 + big * 2, e + 2 + big * 2);
    P(ctx, '#241a12', ex - big, ey - big, e + big * 2, e + big * 2);
    P(ctx, '#ffffff', ex + (e > 1 ? 1 : 0), ey, 1, 1);
    if (exp === 'angry') { P(ctx, M.dark, ex - 2, ey - 2, e + 3, mh); P(ctx, M.dark, ex + 1, ey - 3, e + 1, mh); }
    else if (exp === 'sad') { P(ctx, M.dark, ex - 3, ey - 3, e + 2, mh); }
  }
  // The flap runs off the speech clock while anybody is talking -- SAY.mouth
  // only advances while letters are landing -- so the mouth moves with the
  // words instead of beating against them at a fixed 7Hz.
  const open = exp === 'wide' || exp === 'pain' || (exp === 'talk' && (Math.floor((SAY.who ? SAY.mouth : t * 7)) & 1));
  if (open) { P(ctx, O, mx - 2, my - 1, mw, mh * 3 + 1); P(ctx, '#2a1218', mx - 1, my, mw - 2, mh * 2); }
  else P(ctx, O, mx - 2, my, mw, mh);
}
// ---- draw a manatee actor --------------------------------------------------
// Composed in chars.js's own order, at chars.js's own offsets, scaled to the
// member: far flipper, fluke, body, near flipper, face.
function drawManatee(ctx, m, t) {
  const M = m.set; if (!M) return;
  const k = M.k;
  ctx.save();
  ctx.translate(R(m.x), R(m.y));
  ctx.rotate(m.rot || 0);
  const fx = m.flip ? -1 : 1;
  ctx.scale(fx * (m.sx || 1), m.sy || 1);
  const ph = m.phase || 0;
  const amp = m.tailAmp === undefined ? 0.26 : m.tailAmp;
  const fa = (m.flipperA === undefined ? 2.15 : m.flipperA) + Math.sin(ph + 0.9) * 0.24;
  ctx.save(); ctx.translate(M.shoX - 5 * k, M.shoY - 4 * k); ctx.rotate(fa - 0.22);
  ctx.drawImage(M.flipFar.c, -M.flipFar.ax, -M.flipFar.ay); ctx.restore();
  ctx.save(); ctx.translate(M.tailX, 0); ctx.rotate(Math.sin(ph) * amp);
  // Clean or marked, body and fluke go together: an animal nothing has
  // happened to yet has a whole trailing edge on her tail as well as an
  // unbroken hide, which is the cast's own rule (CH.side.flukeScar).
  const fl = m.scarred ? M.flukeScar : M.fluke;
  ctx.drawImage(fl.c, -fl.ax, -fl.ay); ctx.restore();
  const b = m.scarred ? M.bodyScar : M.body;
  ctx.drawImage(b.c, -b.ax, -b.ay);
  // The hit flash.  This used to composite 'source-atop' straight onto the
  // frame, which is atop EVERYTHING already drawn, not atop the sprite -- so
  // a flashing manatee painted a white rectangle over the whole shot.  It is
  // a baked silhouette of her own body now: one blit, pixel for pixel hers.
  if (m.flash > 0 && M.flashS) {
    ctx.save(); ctx.globalAlpha = qa(m.flash * 0.92);
    ctx.drawImage(M.flashS.c, -M.flashS.ax, -M.flashS.ay);
    ctx.restore();
  }
  ctx.save(); ctx.translate(M.shoX, M.shoY); ctx.rotate(fa);
  ctx.drawImage(M.flip.c, -M.flip.ax, -M.flip.ay); ctx.restore();
  // ---- what the fleet did to her, drawn INSIDE her transform.  A hole that
  // was punched in her flank rolls when she rolls, and a harpoon planted in
  // her stays planted through every turn she makes on the end of the line --
  // which is the difference between a wound and a decal.
  if (m.wounds) for (let i = 0; i < m.wounds.length; i++) drawWound(ctx, m.wounds[i], i * 37 + 3);
  if (m.harps && HARP) {
    for (const h of m.harps) {
      ctx.save(); ctx.translate(R(h.x), R(h.y)); ctx.rotate(h.a);
      ctx.drawImage(HARP.c, -HARP.ax, -HARP.ay);
      ctx.restore();
      // the collar of blood where the shaft goes in
      P(ctx, IP.blood[1], R(h.x) - 3, R(h.y) - 2, 6, 4);
      P(ctx, IP.blood[3], R(h.x) - 2, R(h.y) - 1, 4, 2);
    }
  }
  manateeFace(ctx, M, m.exp || 'calm', m.blink, t);
  ctx.restore();
}
// Where a body-local point ends up on screen, so a wound can keep bleeding
// into the water while the body it is in rolls, flips and is dragged.
function bodyPoint(m, lx, ly) {
  const c = Math.cos(m.rot || 0), sn = Math.sin(m.rot || 0);
  const px2 = lx * (m.flip ? -1 : 1) * (m.sx === undefined ? 1 : m.sx);
  const py2 = ly * (m.sy === undefined ? 1 : m.sy);
  return [m.x + px2 * c - py2 * sn, m.y + px2 * sn + py2 * c];
}

// ================================================================== FISH ====
function buildFish(L, ramp, opt) {
  opt = opt || {};
  const W = R(L) + 4, H = R(L * 0.52) + 4, cy = H / 2;
  const f = blobField(W, H, [
    { x: W * 0.30, y: cy, rx: L * 0.14, ry: L * 0.13 },
    { x: W * 0.48, y: cy, rx: L * 0.20, ry: L * 0.21 },
    { x: W * 0.68, y: cy, rx: L * 0.17, ry: L * 0.16 },
    { x: W * 0.84, y: cy, rx: L * 0.10, ry: L * 0.08 },
  ]);
  const o = shadeBlob(W, H, f, ramp, { outline: IP.ink, lift: 0.22, smooth: 2 });
  const ctx = o.ctx;
  // tail fin + dorsal
  tri(ctx, IP.ink, 2, cy - L * 0.24, 2, cy + L * 0.24, W * 0.34, cy);
  tri(ctx, ramp[2], 4, cy - L * 0.18, 4, cy + L * 0.18, W * 0.32, cy);
  tri(ctx, IP.ink, W * 0.40, cy - L * 0.20, W * 0.62, cy - L * 0.20, W * 0.52, cy - L * 0.34);
  tri(ctx, ramp[3], W * 0.42, cy - L * 0.19, W * 0.60, cy - L * 0.19, W * 0.52, cy - L * 0.30);
  tri(ctx, ramp[1], W * 0.45, cy + L * 0.10, W * 0.62, cy + L * 0.12, W * 0.50, cy + L * 0.26);
  // stripe + eye
  for (let x = 5; x < W - 4; x++) { const y = R(cy - L * 0.03); if (f[y * W + x] > 0.1) P(ctx, ramp[4], x, y); }
  const ek = Math.max(1, R(L / 14));
  P(ctx, IP.ink, R(W * 0.78) - 1, R(cy) - 1, ek + 2, ek + 2);
  P(ctx, opt.dead ? '#cfd6c8' : '#0b0b10', R(W * 0.78), R(cy), ek, ek);
  if (opt.dead) { P(ctx, IP.ink, R(W * 0.78), R(cy), 1, 1); P(ctx, IP.ink, R(W * 0.78) + ek - 1, R(cy) + ek - 1, 1, 1); }
  else P(ctx, '#ffffff', R(W * 0.78), R(cy), 1, 1);
  return spr(o.c, W * 0.5, cy);
}

// ============================================================== STEEL =====
//  The harpoon.  Recovered from the version of this cinematic that had one,
//  and given the barbs it was missing: the head sweeps back into two hooks,
//  so when it goes into a manatee it reads as something that is NEVER coming
//  out again -- which is what the beat needs, because it stays in her.
function buildHarpoon() {
  const c = can(36, 11), x = cx2(c);
  P(x, IP.ink, 0, 4, 29, 3);
  P(x, '#9aa6b6', 1, 5, 27, 1);
  P(x, '#5d6675', 1, 6, 27, 1);
  // barbs, swept back off the shoulder of the head
  tri(x, IP.ink, 27, 1, 19, 0, 28, 5);
  tri(x, IP.ink, 27, 9, 19, 10, 28, 5);
  tri(x, '#7d8899', 26, 2, 21, 1, 27, 5);
  tri(x, '#7d8899', 26, 8, 21, 9, 27, 5);
  // the head itself
  tri(x, IP.ink, 27, 0, 27, 10, 36, 5);
  tri(x, '#cdd9ea', 28, 2, 28, 8, 34, 5);
  tri(x, '#ffffff', 28, 3, 28, 5, 32, 5);
  P(x, IP.ink, 23, 2, 2, 7);
  // wooden butt and the brass rope eye
  P(x, '#7d4a22', 2, 4, 6, 3);
  P(x, '#a8692e', 2, 4, 6, 1);
  P(x, IP.ink, 0, 3, 3, 5); P(x, '#e0a838', 1, 4, 1, 3);
  return spr(c, 3, 5);
}
// His cutlass.  chars.js dresses the otter -- tricorn, bandolier, coat, the
// skull on the crown -- and this is the one thing it does not hand over: a
// PROP, held in the paw the same way CH.cigar already is.  If the cast ever
// bakes a blade of its own, capOtter() takes that instead (see below).
function buildCutlass() {
  const c = can(30, 15), x = cx2(c);
  for (let i = 0; i < 21; i++) {
    const k = i / 20;
    const y = R(9 - Math.sin(k * 1.9) * 5.5);
    const h = Math.max(2, R(4.4 - k * 2.2));
    P(x, IP.ink, 9 + i, y - 1, 1, h + 2);
    P(x, '#8f9aab', 9 + i, y, 1, h);
    P(x, '#e4edf8', 9 + i, y, 1, 1);
  }
  P(x, IP.ink, 28, 2, 2, 3);                       // the point
  P(x, '#e4edf8', 28, 3, 1, 1);
  P(x, IP.ink, 1, 6, 9, 6);                        // grip
  P(x, '#5c3a1c', 2, 7, 6, 4);
  P(x, '#8a5a2c', 2, 7, 6, 1);
  P(x, IP.ink, 7, 3, 4, 11); P(x, '#c8a63a', 8, 4, 2, 9); P(x, '#ffe9a6', 8, 4, 1, 9);   // shell guard
  P(x, IP.ink, 0, 5, 3, 8); P(x, '#c8a63a', 1, 6, 1, 6);                                  // pommel
  return spr(c, 4, 9);
}
// A silhouetted deck hand, recovered with the harpoons.  p: {lean, armA,
// armB, foreA, foreB, legA, legB, kneeA, kneeB, head, facing}
function cap_(ctx, col, x0, y0, x1, y1, w) {
  const n = Math.max(1, R(Math.hypot(x1 - x0, y1 - y0)));
  ctx.fillStyle = col;
  const h = w / 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(R(x0 + (x1 - x0) * t - h), R(y0 + (y1 - y0) * t - h), w, w);
  }
}
function figure(ctx, x, y, s, p, col, rim) {
  const f = p.facing === undefined ? -1 : p.facing;
  const pass = (ox, oy, c) => {
    ctx.save(); ctx.translate(R(x + ox), R(y + oy - s * 0.47));
    const lean = p.lean || 0;
    const shX = Math.sin(lean) * -s * 0.40, shY = -s * 0.44;
    const limb = Math.max(3, R(s * 0.095));
    const leg = (a, b, side) => {
      const hx = side * Math.max(1, R(s * 0.035));
      const kx = hx + f * Math.sin(a) * s * 0.24, ky = Math.cos(a) * s * 0.24;
      cap_(ctx, c, hx, 0, kx, ky, limb);
      const ex = kx + f * Math.sin(b) * s * 0.24, ey = ky + Math.cos(b) * s * 0.24;
      cap_(ctx, c, kx, ky, ex, ey, Math.max(2, limb - 1));
      ctx.fillStyle = c; ctx.fillRect(R(ex) - (f > 0 ? 2 : R(s * 0.19) - 2), R(ey) - 1, R(s * 0.19), 4);
    };
    leg(p.legB === undefined ? -0.48 : p.legB, p.kneeB || 0.10, -1);
    cap_(ctx, c, 0, 0, shX * 0.45, shY * 0.45, Math.max(4, R(s * 0.25)));
    cap_(ctx, c, shX * 0.45, shY * 0.45, shX, shY, Math.max(4, R(s * 0.21)));
    cap_(ctx, c, shX - f * s * 0.09, shY + 1, shX + f * s * 0.09, shY + 1, Math.max(3, R(s * 0.11)));
    leg(p.legA === undefined ? 0.48 : p.legA, p.kneeA || -0.08, 1);
    const arm = (a, b, wm, off) => {
      const ax0 = shX + f * s * 0.075 * off, ay0 = shY + 1;
      const ex = ax0 + f * Math.sin(a) * s * 0.23, ey = ay0 + Math.cos(a) * s * 0.23;
      cap_(ctx, c, ax0, ay0, ex, ey, Math.max(2, R(s * 0.10 * wm)));
      const hx = ex + f * Math.sin(b) * s * 0.22, hy = ey + Math.cos(b) * s * 0.22;
      cap_(ctx, c, ex, ey, hx, hy, Math.max(2, R(s * 0.085 * wm)));
      return [hx, hy];
    };
    arm(p.armB === undefined ? 0.55 : p.armB, p.foreB === undefined ? 0.95 : p.foreB, 0.85, -1);
    const hr = Math.max(4, R(s * 0.125));
    const hx2 = shX + f * Math.sin(p.head || 0) * s * 0.14, hy2 = shY - Math.cos(p.head || 0) * s * 0.15;
    ctx.fillStyle = c;
    ctx.fillRect(R(hx2) - hr, R(hy2) - hr + 1, hr * 2, hr * 2 - 1);
    ctx.fillRect(R(hx2) - hr + 1, R(hy2) - hr, hr * 2 - 2, hr * 2 + 1);
    cap_(ctx, c, shX, shY, hx2, hy2 + hr, Math.max(3, R(s * 0.10)));
    ctx.fillRect(R(hx2) - hr - 1, R(hy2) - hr - 2, hr * 2 + 2, Math.max(2, R(s * 0.05)));
    ctx.fillRect(R(hx2) + (f > 0 ? hr : -hr - R(s * 0.13)), R(hy2) - hr, R(s * 0.13), 2);
    const ha = arm(p.armA === undefined ? 0.75 : p.armA, p.foreA === undefined ? 1.15 : p.foreA, 1, 1);
    ctx.restore();
    return ha;
  };
  pass(-1, -1, rim || '#50708c');
  return pass(0, 0, col || '#0c0f15');
}
function drawRope(ctx, x0, y0, x1, y1, sag, col, dark) {
  const n = 26;
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cxp = (x0 + x1) / 2, cyp = (y0 + y1) / 2 + sag;
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, cc = t * t;
    const nx2 = a * x0 + b * cxp + cc * x1, ny2 = a * y0 + b * cyp + cc * y1;
    LN(ctx, (i & 1) ? col : dark, R(px), R(py), R(nx2), R(ny2));
    px = nx2; py = ny2;
  }
}

// ============================================================ FISHING BOAT ==
function curveAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (x <= b[0]) { const t = (x - a[0]) / (b[0] - a[0]); const s = t * t * (3 - 2 * t); return a[1] + (b[1] - a[1]) * s; }
  }
  return pts[pts.length - 1][1];
}
const BOAT_WL = 54;   // waterline inside the boat sprite
function buildFishingBoat() {
  const W = 268, H = 132, c = can(W, H), x = cx2(c);
  const sheer = [[16, 20], [46, 31], [110, 36], [180, 34], [244, 26]];
  const keel = [[36, 66], [90, 88], [150, 96], [200, 94], [244, 82]];
  const topAt = xx => curveAt(sheer, xx);
  const botAt = xx => Math.min(20 + (xx - 16) * 2.35, curveAt(keel, xx));
  for (let xx = 16; xx <= 244; xx++) {
    const t0 = R(topAt(xx)), b0 = R(botAt(xx));
    if (b0 <= t0) continue;
    for (let y = t0; y <= b0; y++) {
      let col;
      const d0 = y - t0;
      if (y < BOAT_WL - 9) col = d0 < 2 ? '#d4dac9' : ((y % 6) === 0) ? '#8e968c' : '#b9c0b2';
      else if (y < BOAT_WL - 5) col = '#2c3a4e';
      else if (y < BOAT_WL - 1) col = '#e2e6d8';
      else if (y < BOAT_WL + 3) col = '#3a5a3e';
      else col = ((y % 7) === 0) ? '#42191a' : ((y % 7) === 3) ? '#54211f' : '#5f2724';
      if (y === t0 || y === b0) col = IP.ink;
      P(x, col, xx, y);
    }
    // rubbing strake + rust streaks
    P(x, '#2a2f26', xx, R(topAt(xx)) + 4, 1, 2);
    if (hash2(xx, 3) > 0.90) for (let y = R(topAt(xx)) + 6; y < BOAT_WL - 6; y++) P(x, '#7a5a3a', xx, y);
  }
  // stern transom
  for (let y = R(topAt(244)); y <= R(botAt(244)); y++) P(x, IP.ink, 245, y);
  // ---- deck gear above the sheer
  const deckY = xx => R(topAt(xx));
  // bulwark / gunwale rail
  for (let xx = 20; xx <= 243; xx++) {
    const dy = deckY(xx);
    P(x, IP.ink, xx, dy - 9, 1, 1);
    P(x, '#9aa292', xx, dy - 8, 1, 8);
    P(x, '#5e665a', xx, dy - 2, 1, 2);
    if (xx % 13 === 0) P(x, IP.ink, xx, dy - 9, 1, 9);
  }
  // wheelhouse (aft)
  const wh = { x: 176, y: 0, w: 56, h: 34 };
  const wy = deckY(200) - 8 - wh.h;
  P(x, IP.ink, wh.x - 1, wy - 1, wh.w + 2, wh.h + 2);
  P(x, '#a8b0a2', wh.x, wy, wh.w, wh.h);
  P(x, '#c6cdbc', wh.x, wy, wh.w, 3);
  P(x, '#6d7568', wh.x, wy + wh.h - 4, wh.w, 4);
  for (let i = 0; i < 3; i++) { P(x, IP.ink, wh.x + 5 + i * 17, wy + 7, 13, 11); P(x, '#2b3a4a', wh.x + 6 + i * 17, wy + 8, 11, 9); P(x, '#4f6a80', wh.x + 6 + i * 17, wy + 8, 11, 2); }
  P(x, IP.ink, wh.x + 4, wy - 7, 8, 7); P(x, '#3a4150', wh.x + 5, wy - 6, 6, 6);   // exhaust stack
  // mast + derrick
  P(x, IP.ink, 128, wy - 40, 4, 62); P(x, '#8a6a3a', 129, wy - 39, 2, 60);
  LN(x, IP.ink, 130, wy - 38, 70, wy - 6); LN(x, '#6d7568', 130, wy - 37, 70, wy - 5);
  for (let i = 0; i < 5; i++) P(x, '#d8d0b0', 126 + i * 2, wy - 44 + i, 2, 2);
  // net drum + floats on deck
  P(x, IP.ink, 88, deckY(100) - 22, 34, 16); P(x, '#3f4a3a', 89, deckY(100) - 21, 32, 14);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 7; j++) if (((i + j) & 1) === 0) P(x, '#8fa88a', 90 + i * 2, deckY(100) - 20 + j * 2);
  for (let i = 0; i < 4; i++) { P(x, IP.ink, 48 + i * 9, deckY(60) - 14, 8, 8); P(x, '#c4202c', 49 + i * 9, deckY(60) - 13, 6, 6); P(x, '#ff6161', 49 + i * 9, deckY(60) - 13, 6, 2); }
  // round tyre fenders slung over the side on short ropes
  for (const fx of [66, 100, 156]) {
    const fy = R(topAt(fx)) + 7;
    P(x, '#c9bda0', fx + 4, R(topAt(fx)) - 8, 1, 9);
    for (let yy = -6; yy <= 6; yy++) for (let xx2 = -5; xx2 <= 5; xx2++) {
      const d = Math.hypot(xx2, yy * 1.05);
      if (d > 6) continue;
      P(x, d > 5 ? IP.ink : d > 2.6 ? ((xx2 + yy) & 1 ? '#232833' : '#2e3440') : d > 2.0 ? IP.ink : '#7c8496', fx + 4 + xx2, fy + yy);
    }
    P(x, '#4a5260', fx + 1, fy - 4, 2, 2);
  }
  // hull planking seams + a name board
  for (let xx = 20; xx < 240; xx++) {
    if (xx % 24 === 0) for (let y = R(topAt(xx)) + 2; y < BOAT_WL - 10; y++) P(x, '#98a096', xx, y);
  }
  P(x, IP.ink, 188, BOAT_WL - 24, 46, 10); P(x, '#22303f', 189, BOAT_WL - 23, 44, 8);
  for (let i = 0; i < 6; i++) P(x, '#c8a63a', 193 + i * 7, BOAT_WL - 21, 4, 4);
  // ---- stern gear: shaft, A-bracket, rudder
  LN(x, IP.ink, 232, 74, 254, 92); LN(x, IP.ink, 233, 74, 255, 92);
  P(x, '#5d6675', 233, 75, 2, 2); P(x, '#5d6675', 240, 81, 2, 2); P(x, '#5d6675', 247, 87, 2, 2);
  LN(x, IP.ink, 244, 72, 252, 88); LN(x, '#6d7686', 245, 72, 253, 88);
  P(x, IP.ink, 240, 62, 5, 22); P(x, '#4a525e', 241, 63, 3, 20); P(x, '#767f8d', 241, 63, 1, 20);
  return { s: spr(c, W / 2, BOAT_WL), prop: [254 - W / 2, 92 - BOAT_WL], gun: [200 - W / 2, wy - 8 - BOAT_WL], W: W, H: H, deckY: deckY(180) - 8 - BOAT_WL };
}
function drawProp(ctx, x, y, r, ang, churn) {
  ctx.save(); ctx.translate(R(x), R(y));
  // motion arcs
  if (churn > 0) {
    for (let i = 0; i < 4; i++) {
      const a = qa(0.10 + i * 0.05) * churn;
      ctx.fillStyle = rgbaq('#dff0ff', a);
      const rr = r * (0.55 + i * 0.15);
      ctx.fillRect(-R(rr * 0.42), -R(rr), Math.max(1, R(rr * 0.84)), Math.max(1, R(rr * 2)));
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = ang + i * TAU / 3;
    const tipY = Math.sin(a) * r, tipX = Math.cos(a) * r * 0.36;
    const bl = Math.abs(Math.cos(a)) > 0.8 ? '#8d97a6' : '#c3ccd8';
    tri(ctx, IP.ink, -1, 0, tipX - 2, tipY, tipX + 3, tipY - 1);
    tri(ctx, bl, 0, 0, tipX - 1, tipY, tipX + 2, tipY - 1);
  }
  P(ctx, IP.ink, -3, -4, 7, 9); P(ctx, '#9aa6b6', -2, -3, 5, 7); P(ctx, '#d8e2ee', -2, -3, 2, 7);
  ctx.restore();
}
// =================================================================== YACHT ==
//  The white boat.  Recovered with the beats that needed it: the fishing
//  fleet does the killing, this one does the buying, and it is drawn in the
//  same ink and the same banded light as the trawler so the two read as the
//  same world rather than as two art passes.
const YACHT_WL = 70;
function buildYacht() {
  const W = 392, H = 156, c = can(W, H), x = cx2(c);
  // hull: bow at the RIGHT, transom at the LEFT
  const sheer = [[22, 36], [120, 30], [250, 22], [340, 10], [368, 4]];
  const keel = [[22, 72], [66, 94], [150, 106], [250, 100], [320, 82], [356, 62]];
  const stem = xx => 4 + (368 - xx) * 2.9;
  for (let xx = 22; xx <= 368; xx++) {
    const t0 = R(curveAt(sheer, xx)), b0 = R(Math.min(stem(xx), curveAt(keel, xx)));
    if (b0 <= t0) continue;
    for (let y = t0; y <= b0; y++) {
      let col;
      if (y < YACHT_WL - 10) col = '#e6ecf2';
      else if (y < YACHT_WL - 6) col = '#c0c9d4';
      else if (y < YACHT_WL - 2) col = '#1c2a44';
      else if (y < YACHT_WL + 2) col = '#c8a63a';
      else col = ((y % 8) === 0) ? '#101826' : '#1b2636';
      if (y === t0 || y === b0) col = IP.ink;
      P(x, col, xx, y);
    }
  }
  // bulbous bow
  for (let yy = -7; yy <= 7; yy++) for (let xx = -11; xx <= 11; xx++) {
    const d = Math.hypot(xx / 11, yy / 7);
    if (d > 1) continue;
    P(x, d > 0.86 ? IP.ink : yy < -2 ? '#2c3a52' : '#1b2636', 352 + xx, 66 + yy);
  }
  // skeg, shaft and rudder aft
  P(x, IP.ink, 92, 100, 40, 10); P(x, '#141c2a', 93, 101, 38, 8);
  LN(x, IP.ink, 60, 94, 96, 104); LN(x, '#4a5568', 61, 94, 97, 104);
  P(x, IP.ink, 50, 88, 6, 20); P(x, '#222c3e', 51, 89, 4, 18); P(x, '#4a5568', 51, 89, 1, 18);
  // long tinted window band
  for (let xx = 60; xx <= 300; xx++) {
    const t0 = R(curveAt(sheer, xx));
    P(x, IP.ink, xx, t0 + 9, 1, 9);
    P(x, '#16202f', xx, t0 + 10, 1, 7);
    if ((xx % 31) < 9) P(x, '#41546e', xx, t0 + 10, 1, 7);
    P(x, '#8e99a8', xx, t0 + 10, 1, 1);
  }
  // ---- superstructure
  const deck = xx => R(curveAt(sheer, xx));
  const c1 = { x: 74, w: 196, h: 36 }, cy1 = deck(170) - c1.h;
  P(x, IP.ink, c1.x - 1, cy1 - 1, c1.w + 2, c1.h + 2);
  P(x, '#f2f6fa', c1.x, cy1, c1.w, c1.h);
  P(x, '#cfd8e2', c1.x, cy1 + c1.h - 5, c1.w, 5);
  for (let i = 0; i < 9; i++) { P(x, IP.ink, c1.x + 8 + i * 21, cy1 + 8, 17, 15); P(x, '#1a2739', c1.x + 9 + i * 21, cy1 + 9, 15, 13); P(x, '#4e627c', c1.x + 9 + i * 21, cy1 + 9, 15, 3); }
  // flybridge
  const c2 = { x: 128, w: 108, h: 22 }, cy2 = cy1 - c2.h;
  P(x, IP.ink, c2.x - 1, cy2 - 1, c2.w + 2, c2.h + 2);
  P(x, '#f2f6fa', c2.x, cy2, c2.w, c2.h);
  P(x, '#1a2739', c2.x + 6, cy2 + 5, c2.w - 12, 10);
  P(x, '#4e627c', c2.x + 6, cy2 + 5, c2.w - 12, 2);
  // radar arch + antennae
  P(x, IP.ink, c2.x + 12, cy2 - 16, 5, 16); P(x, IP.ink, c2.x + c2.w - 18, cy2 - 16, 5, 16);
  P(x, '#dbe3ec', c2.x + 13, cy2 - 15, 3, 15); P(x, '#dbe3ec', c2.x + c2.w - 17, cy2 - 15, 3, 15);
  P(x, IP.ink, c2.x + 12, cy2 - 18, c2.w - 24, 4); P(x, '#dbe3ec', c2.x + 13, cy2 - 17, c2.w - 26, 2);
  P(x, IP.ink, c2.x + 44, cy2 - 26, 16, 8); P(x, '#b9c4d0', c2.x + 45, cy2 - 25, 14, 6);
  P(x, '#dbe3ec', c2.x + 70, cy2 - 34, 1, 18);
  // foredeck rails
  for (let xx = 276; xx < 356; xx += 12) { const d = deck(xx); P(x, '#c3ccd8', xx, d - 13, 1, 13); P(x, IP.ink, xx, d - 14, 1, 1); }
  for (let xx = 274; xx < 358; xx++) { const d = deck(xx); P(x, '#dfe6ee', xx, d - 13, 1, 1); P(x, '#9aa6b6', xx, d - 7, 1, 1); }
  // aft deck rails
  for (let xx = 26; xx < 72; xx += 11) { const d = deck(xx); P(x, '#c3ccd8', xx, d - 13, 1, 13); }
  for (let xx = 24; xx < 74; xx++) { const d = deck(xx); P(x, '#dfe6ee', xx, d - 13, 1, 1); P(x, '#9aa6b6', xx, d - 7, 1, 1); }
  return { s: spr(c, W / 2, YACHT_WL), W: W, H: H, deck: deck, cy1: cy1, c1: c1, rail: [300 - W / 2, deck(300) - 13 - YACHT_WL], aft: [48 - W / 2, deck(48) - 13 - YACHT_WL] };
}

// =========================================================== BUSINESSMAN ====
//  The buyer.  He never touches the water and he never stops smiling; the
//  only thing he does in the whole cinematic is point at two calves and put
//  a price on them.
function buildBiz() {
  const SUIT = ['#151928', '#20263c', '#2d3450', '#3c4568', '#4e588a'];
  const SKIN = ['#8a5a3a', '#b47a52', '#d79a6e', '#e9b78c', '#f6d0aa'];
  // ---- body: narrow shoulders, enormous belly
  const W = 34, H = 40;
  const f = blobField(W, H, [
    { x: 15, y: 8, rx: 8.5, ry: 6.5 },
    { x: 16, y: 16, rx: 11.5, ry: 8.5 },
    { x: 16, y: 24, rx: 13.0, ry: 9.5 },
    { x: 15, y: 31, rx: 10.5, ry: 7.0 },
  ]);
  const o = shadeBlob(W, H, f, SUIT, { outline: IP.ink, lift: 0.22, smooth: 3 });
  const b = o.ctx;
  // shirt + tie down the belly
  for (let y = 4; y < 30; y++) {
    const half = Math.max(1, R(4 - (y - 4) * 0.02));
    P(b, '#eef3f8', 15 - half, y, half * 2, 1);
  }
  P(b, IP.ink, 14, 4, 2, 26); P(b, IP.ink, 17, 4, 2, 26);
  for (let y = 7; y < 30; y++) { const w2 = Math.max(1, R(1.4 + (y - 7) * 0.12)); P(b, '#a8151f', 16 - (w2 >> 1), y, w2, 1); P(b, '#c4202c', 16 - (w2 >> 1), y, 1, 1); }
  P(b, '#e8515a', 15, 5, 3, 3); P(b, IP.ink, 15, 4, 3, 1);
  // lapels
  LN(b, SUIT[4], 12, 4, 8, 18); LN(b, SUIT[0], 13, 4, 9, 18);
  LN(b, SUIT[4], 20, 4, 25, 18); LN(b, SUIT[0], 19, 4, 24, 18);
  P(b, '#e0a838', 24, 20, 2, 2);          // pocket square / button
  // trousers + shoes
  P(b, IP.ink, 7, 36, 10, 5); P(b, '#1a1f30', 8, 36, 8, 4);
  P(b, IP.ink, 17, 36, 10, 5); P(b, '#252c44', 18, 36, 8, 4);
  const body = spr(o.c, 16, 20);
  // ---- head
  const HW = 22, HH = 20;
  const hf = blobField(HW, HH, [
    { x: 10, y: 9, rx: 7.2, ry: 7.0 },
    { x: 14, y: 12, rx: 5.4, ry: 4.6 },
    { x: 10, y: 15, rx: 6.6, ry: 4.4 },
  ]);
  function headWith(grin) {
    const ho = shadeBlob(HW, HH, hf, SKIN, { outline: IP.ink, lift: 0.24, smooth: 2 });
    const h = ho.ctx;
    // slicked-back hair
    stamp(h, [
      '..kkkkkkk..',
      '.kHHHHHHHk.',
      'kHHhhhhhHHk',
      'kHhhhhhhhhk',
      '.kHhhhhhhk.',
    ], 2, 0, { k: IP.ink, H: '#3a2c1e', h: '#251a12' });
    P(h, '#5a4630', 4, 2, 5, 1);
    // ear
    P(h, IP.ink, 4, 9, 3, 4); P(h, SKIN[1], 5, 10, 2, 2);
    // sunglasses
    P(h, IP.ink, 6, 7, 13, 5);
    P(h, '#0b0d13', 7, 8, 5, 3); P(h, '#0b0d13', 13, 8, 5, 3);
    P(h, '#3c4a5e', 7, 8, 5, 1); P(h, '#3c4a5e', 13, 8, 5, 1);
    P(h, '#cfe0ee', 10, 9, 1, 1); P(h, '#cfe0ee', 16, 9, 1, 1);
    P(h, IP.ink, 12, 9, 1, 1);
    // jowls
    P(h, SKIN[1], 6, 15, 9, 1); P(h, SKIN[1], 7, 17, 7, 1);
    if (grin) {
      P(h, IP.ink, 9, 14, 9, 5);
      P(h, '#f4f7fb', 10, 15, 7, 2);
      P(h, '#c4202c', 10, 17, 7, 1);
      for (let i = 0; i < 3; i++) P(h, IP.ink, 11 + i * 2, 15, 1, 2);
    } else {
      P(h, IP.ink, 10, 15, 6, 2); P(h, SKIN[1], 10, 17, 6, 1);
    }
    return spr(ho.c, 10, 11);
  }
  // ---- arm + hand
  const AW = 18, AH = 9;
  const af = blobField(AW, AH, [{ x: 4, y: 4.5, rx: 4.4, ry: 4.2 }, { x: 10, y: 4.5, rx: 4.0, ry: 3.4 }, { x: 15, y: 4.5, rx: 2.8, ry: 2.6 }]);
  const ao = shadeBlob(AW, AH, af, SUIT, { outline: IP.ink, lift: 0.18, smooth: 1 });
  P(ao.ctx, '#eef3f8', 13, 3, 2, 4);
  P(ao.ctx, IP.ink, 15, 2, 3, 6); P(ao.ctx, SKIN[3], 15, 3, 3, 4); P(ao.ctx, SKIN[4], 15, 3, 3, 1);
  const arm = spr(ao.c, 3, 4.5);
  // ---- binoculars
  const bc = can(16, 10), bx = cx2(bc);
  P(bx, IP.ink, 0, 0, 12, 10); P(bx, '#2a3040', 1, 1, 10, 8);
  P(bx, '#4c576e', 1, 1, 10, 2); P(bx, '#14181f', 1, 7, 10, 2);
  P(bx, IP.ink, 11, 1, 5, 3); P(bx, '#3a4356', 12, 2, 4, 1);
  P(bx, IP.ink, 11, 6, 5, 3); P(bx, '#3a4356', 12, 7, 4, 1);
  P(bx, '#8fa4bc', 2, 2, 2, 1);
  const binoc = spr(bc, 2, 5);
  // ---- cigar
  const cc = can(12, 5), cxx = cx2(cc);
  P(cxx, IP.ink, 0, 0, 11, 5); P(cxx, '#4a2c18', 1, 1, 8, 3); P(cxx, '#6d4327', 1, 1, 8, 1);
  P(cxx, '#ff8b2e', 9, 1, 2, 3); P(cxx, '#ffd27a', 9, 2, 2, 1);
  const cigar = spr(cc, 1, 2);
  return { body: body, head: headWith(false), headGrin: headWith(true), arm: arm, binoc: binoc, cigar: cigar };
}
function drawBiz(ctx, o, t) {
  const B = BIZ; if (!B) return;
  ctx.save(); ctx.translate(R(o.x), R(o.y));
  if (o.flip) ctx.scale(-1, 1);
  const s = o.s || 1; ctx.scale(s, s);
  const bob = R(Math.sin(t * 2.2) * 0.6);
  // far arm
  ctx.save(); ctx.translate(-2, -8 + bob); ctx.rotate(o.armFar === undefined ? 0.9 : o.armFar);
  ctx.drawImage(B.arm.c, -B.arm.ax, -B.arm.ay); ctx.restore();
  ctx.save(); ctx.translate(0, bob);
  ctx.drawImage(B.body.c, -B.body.ax, -B.body.ay);
  ctx.restore();
  // head
  const hd = o.grin ? B.headGrin : B.head;
  ctx.save(); ctx.translate(2 + (o.headX || 0), -26 + bob + (o.headY || 0)); ctx.rotate(o.headR || 0);
  ctx.drawImage(hd.c, -hd.ax, -hd.ay);
  if (o.cigar) { ctx.drawImage(B.cigar.c, 6, -1); }
  ctx.restore();
  // near arm (+ binoculars)
  const an = o.armNear === undefined ? 1.1 : o.armNear;
  ctx.save(); ctx.translate(2, -10 + bob); ctx.rotate(an);
  ctx.drawImage(B.arm.c, -B.arm.ax, -B.arm.ay);
  if (o.binoc) { ctx.translate(B.arm.w - 5, 1); ctx.rotate(-an); ctx.drawImage(B.binoc.c, -B.binoc.ax, -B.binoc.ay); }
  ctx.restore();
  ctx.restore();
}

// ================================================================= CRANE ====
//  Two trussed booms and a three-fingered grab, on a pivot bolted to the
//  yacht's aft deck.  Forward kinematics only: the beat drives two angles and
//  the claw ends up wherever the arm puts it, which is what makes it read as
//  machinery rather than as a sprite sliding down the frame.
function buildCrane() {
  function truss(L, T) {
    const c = can(L, T), x = cx2(c);
    P(x, IP.ink, 0, 0, L, T);
    P(x, '#e0a838', 1, 1, L - 2, 3); P(x, '#f8dc86', 1, 1, L - 2, 1);
    P(x, '#a87a1e', 1, T - 4, L - 2, 3); P(x, '#7a5612', 1, T - 2, L - 2, 1);
    for (let i = 2; i < L - 6; i += 12) {
      LN(x, '#c89a30', i, 4, i + 6, T - 5);
      LN(x, '#c89a30', i + 6, 4, i + 12, T - 5);
      LN(x, IP.ink, i + 1, 4, i + 7, T - 5);
    }
    for (let i = 3; i < L - 3; i += 16) { P(x, '#f8dc86', i, 2, 1, 1); P(x, '#f8dc86', i, T - 3, 1, 1); }
    return spr(c, 3, T / 2);
  }
  // pivot housing
  const pc = can(26, 24), px2 = cx2(pc);
  P(px2, IP.ink, 0, 0, 26, 24); P(px2, '#4a525e', 1, 1, 24, 22);
  P(px2, '#767f8d', 1, 1, 24, 4); P(px2, '#2a3038', 1, 18, 24, 5);
  for (let i = 0; i < 4; i++) { P(px2, '#aab3c0', 4 + i * 6, 6, 2, 2); P(px2, IP.ink, 4 + i * 6, 8, 2, 1); }
  P(px2, '#e0a838', 3, 12, 20, 3); P(px2, IP.ink, 3, 15, 20, 1);
  const pivot = spr(pc, 13, 12);
  // claw body + finger
  const cb = can(38, 24), bx = cx2(cb);
  P(bx, IP.ink, 0, 0, 38, 24); P(bx, '#5d6675', 1, 1, 36, 22);
  P(bx, '#8c97a8', 1, 1, 36, 4); P(bx, '#343b46', 1, 18, 36, 5);
  P(bx, IP.ink, 6, 5, 8, 14); P(bx, '#232935', 7, 6, 6, 12); P(bx, '#aab3c0', 7, 6, 6, 3);
  P(bx, IP.ink, 24, 5, 8, 14); P(bx, '#232935', 25, 6, 6, 12); P(bx, '#aab3c0', 25, 6, 6, 3);
  P(bx, '#e0a838', 16, 2, 6, 20); P(bx, IP.ink, 16, 2, 1, 20);
  for (let i = 0; i < 4; i++) { P(bx, '#c0cad6', 4 + i * 9, 20, 3, 2); P(bx, IP.ink, 4 + i * 9, 22, 3, 1); }
  const clawBody = spr(cb, 19, 6);
  const fc = can(34, 16), fx = cx2(fc);
  for (let i = 0; i < 28; i++) {
    const yy = R(3 + Math.pow(i / 28, 2.1) * 9);
    P(fx, IP.ink, i + 1, yy - 1, 1, 9);
    P(fx, '#6d7686', i + 1, yy, 1, 7);
    P(fx, '#aab3c0', i + 1, yy, 1, 2);
  }
  tri(fx, IP.ink, 28, 9, 34, 14, 28, 16);
  tri(fx, '#cdd9ea', 28, 10, 32, 14, 28, 15);
  const finger = spr(fc, 2, 6);
  return { boom1: truss(200, 20), boom2: truss(86, 14), pivot: pivot, clawBody: clawBody, finger: finger };
}
function drawCrane(ctx, o) {
  const C = CR; if (!C) return;
  ctx.save(); ctx.translate(R(o.x), R(o.y));
  ctx.drawImage(C.pivot.c, -C.pivot.ax, -C.pivot.ay);
  ctx.rotate(o.a1);
  ctx.drawImage(C.boom1.c, -C.boom1.ax, -C.boom1.ay);
  ctx.translate(C.boom1.w - 6, 0);
  if (o.hook) { P(ctx, IP.ink, -2, -6, 4, 12); P(ctx, '#aab3c0', -1, -5, 2, 10); }
  ctx.rotate(o.a2);
  ctx.drawImage(C.boom2.c, -C.boom2.ax, -C.boom2.ay);
  ctx.translate(C.boom2.w - 6, 0);
  ctx.rotate(o.a3 === undefined ? -o.a1 - o.a2 : o.a3);
  drawClaw(ctx, o.open === undefined ? 0.7 : o.open);
  ctx.restore();
}
// the grab on its own, so the deck shot can hang one off a cable without
// building the whole arm above it
function drawClaw(ctx, open) {
  const C = CR; if (!C) return;
  ctx.drawImage(C.clawBody.c, -C.clawBody.ax, -C.clawBody.ay);
  for (const [sx, dir] of [[-13, -1], [0, 0], [13, 1]]) {
    ctx.save(); ctx.translate(sx, 17); ctx.rotate(dir === 0 ? 1.57 : 1.57 + dir * open * 0.8); ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.drawImage(C.finger.c, -C.finger.ax, -C.finger.ay);
    ctx.restore();
  }
}

// =================================================================== NET ====
//  A purse seine, drawn as a lattice of hard 1px lines with lead weights on
//  the mouth rim.  `cinch` closes the top of it; `hole` leaves a block of the
//  mesh out, which is the tear she goes through and he does not.
function drawNet(ctx, o) {
  const N = 12, M = 18;
  const WS = [1.00, 1.05, 1.08, 1.08, 1.05, 1.00, 0.95, 0.88, 0.80, 0.71, 0.61, 0.50, 0.36];
  const cinch = o.cinch || 0, t = o.t || 0;
  const pts = [];
  for (let j = 0; j <= N; j++) {
    const row = [];
    let wj = o.w * 0.5 * WS[j];
    if (j < 5) wj *= (1 - 0.86 * cinch * (1 - j / 6));
    const cxj = o.x + Math.sin(t * 1.4 + j * 0.5) * (o.sway || 0) * (j / N);
    const yj = o.y + (j / N) * o.h + Math.sin(t * 1.9 + j) * (o.sway || 0) * 0.25;
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      row.push([cxj + (u - 0.5) * 2 * wj, yj + Math.sin(u * Math.PI) * o.h * 0.05 * (1 - j / N)]);
    }
    pts.push(row);
  }
  const hole = o.hole;
  const knot = '#7e948a', dk = '#1d2b26';
  for (let j = 0; j <= N; j++) for (let i = 0; i < M; i++) {
    if (hole && j >= hole.j && j < hole.j + hole.h && i >= hole.i && i < hole.i + hole.w) continue;
    LN(ctx, (i & 1) ? knot : dk, R(pts[j][i][0]), R(pts[j][i][1]), R(pts[j][i + 1][0]), R(pts[j][i + 1][1]));
  }
  for (let i = 0; i <= M; i++) for (let j = 0; j < N; j++) {
    if (hole && j >= hole.j && j < hole.j + hole.h && i > hole.i && i < hole.i + hole.w) continue;
    LN(ctx, (j & 1) ? knot : dk, R(pts[j][i][0]), R(pts[j][i][1]), R(pts[j + 1][i][0]), R(pts[j + 1][i][1]));
  }
  // lead weights on the mouth rim
  for (let i = 0; i <= M; i += 3) {
    const p = pts[0][i];
    P(ctx, IP.ink, R(p[0]) - 2, R(p[1]) - 2, 5, 5);
    P(ctx, '#3c424c', R(p[0]) - 1, R(p[1]) - 1, 3, 3);
    P(ctx, '#767f8d', R(p[0]) - 1, R(p[1]) - 1, 2, 1);
  }
  return pts;
}

// ============================================================ ASSET STORE ==
const WATER = {}, LAY = {}, MAN = {};
let BOAT = null, HARP = null, FISHDEAD = null;
// the capture half of the cinematic: the white boat, the man who buys, the
// arm that lifts her out of the water.
let YAC = null, BIZ = null, CR = null;
let FISHSPR = [], BUILT = false, BAKE_MS = 0;

function buildNearClutter(seed, kramp) {
  const H = 200, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let i = 0; i < 5; i++) drawRockForm(x, R(rng.range(0, LW)), H + 6, R(rng.range(60, 130)), R(rng.range(30, 66)), IP.rock, false);
  for (let i = 0; i < 6; i++) {
    const kx = R(rng.range(0, LW));
    kelpStalk(kx, rng, H - 1, R(rng.range(90, 180)), kramp, R(rng.range(4, 6)), rng.range(-0.5, 0.5))(x);
  }
  return c;
}
function buildFarRidge(seed, tint) {
  const H = 150, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  for (let i = 0; i < 16; i++) {
    const rx = R(rng.range(0, LW)), w = R(rng.range(40, 110)), h = R(rng.range(20, 74));
    drawRockForm(x, rx, H - R(rng.range(0, 5)), w, h, IP.rock, rng.next() > 0.6);
  }
  for (let i = 0; i < 10; i++) {
    const kx = R(rng.range(0, LW));
    kelpStalk(kx, rng, H - 2, R(rng.range(30, 74)), IP.kelp, 2, rng.range(-0.4, 0.4))(x);
  }
  return tintLayer(c, tint, 0.62);
}
// ============================================================== BUTCHERY ==
//  The cinematic's punctuation used to be hearts, sparkles and music notes.
//  It is blood now, and every mark of it is hand-rasterized on the cast's own
//  grid: whole pixels, four posterized bands off IP.blood, an ordered dither
//  at the edges and no canvas gradient, no arc(), no blur anywhere.

// One open wound, drawn INSIDE an actor's transform so it rolls when the body
// rolls.  A ragged ink bite, the meat inside it, and a wet rim that catches
// the sun.  `w` is {x, y, r} in body-local units.
function drawWound(ctx, w, seed) {
  const r = Math.max(2, w.r | 0), wx = R(w.x), wy = R(w.y);
  for (let dy = -r; dy <= r; dy++) {
    let ww = R(Math.sqrt(Math.max(0, r * r - dy * dy)));
    ww -= (hash2(wx + dy * 7, wy + seed) * 1.9) | 0;
    if (ww <= 0) continue;
    P(ctx, IP.ink, wx - ww, wy + dy, ww * 2, 1);
  }
  const r2 = r - 1;
  for (let dy = -r2; dy <= r2; dy++) {
    let ww = R(Math.sqrt(Math.max(0, r2 * r2 - dy * dy)));
    ww -= (hash2(wx + dy * 13, wy + seed * 3) * 1.4) | 0;
    if (ww <= 0) continue;
    P(ctx, IP.blood[dy < 0 ? 2 : 1], wx - ww, wy + dy, ww * 2, 1);
  }
  P(ctx, IP.blood[3], wx - 1, wy - 1, 2, 2);
  P(ctx, IP.blood[4], wx - 1, wy - r2, 2, 1);
  // the run of it, down whichever way is down for this body
  for (let i = 1; i < r + 5; i++) {
    if (hash2(wx + i, wy + seed) > 0.62) continue;
    P(ctx, IP.blood[i > r ? 0 : 1], wx + R(Math.sin(i * 0.7 + seed) * 1.6), wy + r - 1 + i, 1, 1);
  }
}
// A swept arc of steel: the flourish he makes with the cutlass.  Hard pixels
// laid round a circle, three bands wide, never a stroked path.
function bladeArc(ctx, x, y, r, a0, a1, k) {
  const n = 46;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const fade = qa(k * (0.20 + t * 0.80));
    if (fade <= 0.03) continue;
    const c = Math.cos(a), sn = Math.sin(a);
    // three radii, so the sweep has body: a cold outer edge, a white core
    ctx.fillStyle = rgbaq('#8fd2f0', fade * 0.55);
    ctx.fillRect(R(x + c * (r + 3)), R(y + sn * (r + 3)), 2, 2);
    ctx.fillStyle = rgbaq('#dff0ff', fade * 0.85);
    ctx.fillRect(R(x + c * r), R(y + sn * r), 2, 2);
    ctx.fillStyle = rgbaq('#ffffff', fade);
    ctx.fillRect(R(x + c * (r - 2)), R(y + sn * (r - 2)), 2, 2);
  }
}
// ---- squash and stretch ----------------------------------------------------
//  A critically-ish damped spring on one scalar.  Poses do not pop any more:
//  a kick goes in, the spring carries it out over a few frames and settles
//  back on exactly 1, so the actor is pixel-exact whenever it is at rest.
function bounce(m, dt) {
  if (m.flash > 0) m.flash = Math.max(0, m.flash - dt * 3.6);
  // her own eyelids.  A single global blink flag had the whole cast shut
  // their eyes on the same frame, which reads as a glitch rather than a
  // blink; each actor keeps its own clock now.
  if (m.blinkT === undefined) m.blinkT = rand(0.4, 3.4);
  m.blinkT -= dt;
  if (m.blinkT <= 0) { m.blink = !m.blink; m.blinkT = m.blink ? 0.09 : rand(1.8, 5.4); }
  m.sqv += (-m.sq * 260 - m.sqv * 21) * dt;
  m.sq += m.sqv * dt;
  if (Math.abs(m.sq) < 0.0035 && Math.abs(m.sqv) < 0.04) { m.sq = 0; m.sqv = 0; m.sx = 1; m.sy = 1; return; }
  const s = clamp(m.sq, -0.22, 0.22);
  m.sx = 1 + s * 0.5; m.sy = 1 - s * 0.5;
}
function kick(m, a) { m.sqv += a; }
// ---- easing ----------------------------------------------------------------
//  Every scripted move in the beats below runs through one of these instead
//  of a raw k*k, so nothing starts or stops with a corner on it.
function ss(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function ss2(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
function outCube(t) { t = clamp(t, 0, 1); const u = 1 - t; return 1 - u * u * u; }
function inCube(t) { t = clamp(t, 0, 1); return t * t * t; }
function outBack(t) { t = clamp(t, 0, 1); const c = 1.9, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
function outBounce(t) {
  t = clamp(t, 0, 1);
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
//  Frame-rate-correct exponential approach.  lerp(a, b, rate*dt) is only
//  right at one frame length and stutters whenever dt moves; this is the
//  same curve sampled properly, so the glide is the same at 30 and 144.
function smooth(cur, target, rate, dt) { return target + (cur - target) * Math.exp(-rate * dt); }
function buildIntroArt() {
  if (BUILT) return;
  const bake0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  if (typeof blobField !== 'function' || typeof shadeBlob !== 'function') return;
  // the whole cast comes out of chars.js now, so nothing is baked until it is
  // there; Intro.reset() comes back through here once buildCharacters() has run
  if (typeof CH === 'undefined' || !CH.side || !CH.otterStandHi || !CH.headWithFace) return;
  // Three hours of ONE bright day, and nothing else.  The night, tank, deep
  // and bruise ramps this file used to bake went with the beats that needed
  // them: the cinematic never leaves the sunlit shallows now.
  WATER.lagoon = buildWater(IP.lagoon, 640, 360, { pow: 1.15, wob: 0.85 });
  WATER.cold = buildWater(IP.cold, 640, 360, { pow: 1.0 });
  WATER.dawn = buildWater(IP.dawn, 640, 360, { pow: 1.05, wob: 0.8 });
  for (const k in GRADE_SPEC) { GRADE[k] = buildGrade(GRADE_SPEC[k].bg); GLOW[k] = buildGrade(GRADE_SPEC[k].fg, 16); }
  for (const k in SKYMODE) skyCan(k);      // every sky baked up front, never mid-cinematic
  LAY.caust = [buildCaustNet(0, 0), buildCaustNet(1, 2.09), buildCaustNet(2, 4.19)];
  LAY.shafts = buildShafts(LW, 300, '#d4f8ff');
  LAY.shaftsWarm = buildShafts(LW, 300, '#ffe2a0');
  LAY.bed = buildBed();
  LAY.grassNear = buildGrass(44, IP.grass, 150, 42, 771);
  LAY.grassFar = tintLayer(buildGrass(28, IP.grass, 120, 26, 991), '#2fa890', 0.40);
  LAY.mid = buildShallowMid(4242);
  LAY.midClean = buildShallowMid(4242, false);   // the same reef, before the fleet worked it
  // the near clutter used to be tinted almost black so it read as a silhouette
  // at dusk.  In daylight it is a reef in shadow, not a hole in the frame.
  LAY.near = tintLayer(buildNearClutter(313, IP.kelp), '#0e4a4c', 0.52);
  LAY.far = buildFarRidge(777, '#3f9fa0');
  LAY.surf = buildSurfaceUnder(11, IP.foam, '#48ad9e');
  // the family, off the cast's own side-on body: her father at her full
  // length, her mother six sevenths of it, and the two calves at four
  // sevenths and a clean half.  Same animal, four ages.
  MAN.dad = buildManatee(98, 'dad');
  MAN.mom = buildManatee(84, 'mom');
  MAN.you = buildManatee(56, 'you');
  MAN.bro = buildManatee(49, 'bro');
  MAN.youBig = buildManatee(98, 'you');
  capOtter();
  BOAT = buildFishingBoat();
  HARP = buildHarpoon();
  // the capture half's own cast of machinery
  YAC = buildYacht();
  BIZ = buildBiz();
  CR = buildCrane();
  const fr = [
    ['#7a5a18', '#a8801f', '#d2a52f', '#eec756', '#fdeb9f'],
    ['#1d4a6a', '#2a6a92', '#3b8db8', '#63b3d8', '#a3dcf0'],
    ['#6a2a30', '#933b44', '#bc5560', '#dd8188', '#f4b8bc'],
    ['#3d5a22', '#557a2f', '#74a040', '#9cc35f', '#c8e493'],
  ];
  FISHSPR = [];
  for (let i = 0; i < 4; i++) FISHSPR.push([buildFish(7, fr[i]), buildFish(11, fr[i]), buildFish(17, fr[i])]);
  // one gutted fish, for the carcass that drifts through the opening beat
  FISHDEAD = buildFish(18, ['#3a4038', '#50584a', '#6d7562', '#8b9480', '#b0b8a2'], { dead: true });
  // The hold: the crate, the heap and the one bulb in it.  This is the most
  // expensive thing the cinematic bakes, and it is baked HERE rather than at
  // the beat that needs it -- lazily it landed as a half-second stall on the
  // cut into the crate, which is exactly the frame that must not stutter.
  holdArt();
  BUILT = true;
  BAKE_MS = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - bake0;
}
// ==================================================================== FX ====
const FX = {
  list: [],
  clear() { this.list.length = 0; },
  add(o) { if (this.list.length < 380) this.list.push(o); return o; },
  bubble(x, y, n, spd) {
    for (let i = 0; i < n; i++) this.add({ k: 'b', x: x + rand(-8, 8), y: y + rand(-6, 6), vx: rand(-8, 8), vy: -rand(14, 40) * (spd || 1), r: randi(1, 3), life: rand(1.2, 3.4), ph: rand(0, TAU) });
  },
  // ---- BLOOD.  This is what the cinematic spends its particle budget on.
  // A cloud drifts, spreads, thins and darkens, and it does NOT clear: the
  // long ones outlive the beat they were spilled in, which is the point.
  blood(x, y, n, pw, hang) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(8, 54) * (pw || 1) * (hang ? 0.22 : 1);
      this.add({ k: 'r', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6,
                 r: rand(2, 7) * (pw || 1), g: rand(1.4, 3.6) * (hang ? 0.55 : 1),
                 rmax: hang ? rand(7, 14) : rand(6, 13),
                 // its own shape seed, fixed for life.  Keying the silhouette
                 // off the cloud's screen position instead made the edge boil
                 // as it drifted -- a cloud that re-rolls its own outline
                 // every time it moves a pixel is a strobe, not a drift.
                 sd: randi(1, 9000),
                 life: hang ? rand(5.5, 9.5) : rand(1.6, 4.2), hang: hang ? 1 : 0 });
    }
  },
  // Arterial.  Hard little slugs of it that come out FAST along one heading,
  // outrun the water for a moment, then lose and turn into cloud where they
  // stop -- so a severed artery reads as a jet and not as a puff.
  spurt(x, y, ang, n, pw) {
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-0.38, 0.38), sp = rand(120, 340) * (pw || 1);
      const L = rand(0.22, 0.52);
      this.add({ k: 'j', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: L, max: L, w: randi(1, 3) });
    }
  },
  // What comes away when a barb goes through.  Meat sinks; it does not float.
  gib(x, y, n, pw) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(30, 150) * (pw || 1);
      this.add({ k: 'c', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
                 life: rand(1.4, 3.2), w: randi(2, 5), h: randi(2, 4),
                 c: IP.meat[randi(0, 3)], vr: rand(-6, 6), trail: 1 });
    }
  },
  // splintered crate board.  Wood, not meat: it tumbles and it does not bleed.
  chunks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0), sp2 = rand(40, 190);
      this.add({ k: 'c', x: x, y: y, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, life: rand(0.8, 2.0), w: randi(2, 5), h: randi(1, 3), c: pick(['#b57d3f', '#8f5c2c', '#5c3a1c', '#d9a25a']) });
    }
  },
  // somebody else's catch, thrown through the air by whatever just gave way
  catchSpray(x, y, n, pw) {
    if (!CATCH.all.length) return;
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0.4), sp2 = rand(60, 320) * (pw || 1);
      this.add({ k: 'sh', x: x + rand(-40, 40), y: y + rand(-14, 14), vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, r: rand(0, TAU), vr: rand(-9, 9), life: rand(0.8, 2.0), s: randi(0, CATCH.all.length - 1) });
    }
  },
  foam(x, y, n, pw) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(20, 120) * (pw || 1);
      this.add({ k: 'f', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(1, 4), life: rand(0.3, 0.9) });
    }
  },
  drops(x, y, n, up) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.92, -Math.PI * 0.08), s = rand(40, 230) * (up || 1);
      this.add({ k: 'd', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.4), c: Math.random() < 0.35 ? '#8ac6ff' : '#eaf8ff' });
    }
  },
  ring(x, y, max, life, col) { this.add({ k: 'g', x: x, y: y, r: 2, max: max, life: life, t0: life, c: col || '#eaf8ff' }); },
  // Tow everything that is made of blood through the frame.  When she is
  // running, the world scrolls past a stationary actor -- so without this the
  // ribbon coming off her wound just sits on her flank in a heap.
  flow(dx, dt) {
    const d = dx * dt;
    for (const p of this.list) if (p.k === 'r' || p.k === 'j' || p.k === 'c') p.x += d;
  },
  update(dt, flowY) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L.splice(i, 1); continue; }
      switch (p.k) {
        case 'b': p.x += p.vx * dt + Math.sin(p.ph + p.life * 4) * 8 * dt; p.y += p.vy * dt; p.vy -= 12 * dt; break;
        case 'f': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; break;
        case 'd': p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; break;
        // A cloud spreads slowly and STOPS: unbounded, one of them swallows
        // the frame.  It creeps upward the way blood does in still water.
        case 'r':
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= 1 - dt * 1.6; p.vy = p.vy * (1 - dt * 1.6) - (p.hang ? 2 : 5) * dt;
          p.r += p.g * dt * 1.5; if (p.r > p.rmax) p.r = p.rmax;
          break;
        // a jet: it holds its heading, then the water takes it and it clots
        case 'j':
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= 1 - dt * 5.5; p.vy = p.vy * (1 - dt * 5.5) + 24 * dt;
          if (p.life <= dt * 1.5) {
            this.add({ k: 'r', x: p.x, y: p.y, vx: p.vx * 0.12, vy: p.vy * 0.12 - 4,
                       r: rand(2, 5), g: rand(1.2, 2.6), rmax: rand(7, 14), sd: randi(1, 9000),
                       life: rand(1.8, 4.0), hang: 0 });
          }
          break;
        // meat sinks, tumbles, and leaves a thread of itself behind
        case 'c':
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 46 * dt;
          p.vx *= 1 - dt * 1.1; p.vy *= 1 - dt * 0.5;
          if (p.trail && Math.random() < 5 * dt) {
            this.add({ k: 'r', x: p.x, y: p.y, vx: 0, vy: -3, r: rand(1.5, 3), g: 0.9,
                       rmax: rand(5, 10), sd: randi(1, 9000), life: rand(1.2, 2.6), hang: 0 });
          }
          break;
        case 'sh': p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 330 * dt; p.vx *= 1 - dt * 0.5; p.r += p.vr * dt; break;
        case 'g': p.r += (p.max / p.t0) * dt; break;
      }
    }
  },
  render(ctx) {
    for (const p of this.list) {
      switch (p.k) {
        case 'b': {
          const r = p.r;
          ctx.fillStyle = 'rgba(214,240,255,0.85)';
          ctx.fillRect(R(p.x), R(p.y), r + 1, 1); ctx.fillRect(R(p.x), R(p.y) + r, r + 1, 1);
          ctx.fillRect(R(p.x), R(p.y), 1, r + 1); ctx.fillRect(R(p.x) + r, R(p.y), 1, r + 1);
          break;
        }
        case 'f': ctx.fillStyle = rgbaq(IP.foam[p.life > 0.5 ? 2 : 1], Math.min(1, p.life * 2)); ctx.fillRect(R(p.x), R(p.y), R(p.r) + 1, R(p.r) + 1); break;
        case 'd': ctx.fillStyle = p.c; ctx.fillRect(R(p.x), R(p.y), 2, 2); break;
        case 'sh': { const sp2 = CATCH.all[p.s]; if (!sp2) break; ctx.save(); ctx.translate(R(p.x), R(p.y)); ctx.rotate(p.r); ctx.drawImage(sp2.c, -sp2.ax, -sp2.ay); ctx.restore(); break; }
        // A cloud of it.  Scanline rows with a bitten edge and a speckled
        // fringe that thins into the water: diffuse WITHOUT a gradient, which
        // is the only way to do diffuse and stay pixel art.  The band it is
        // drawn in comes off its age, so it darkens as it hangs.
        case 'r': {
          const k = Math.min(1, p.life / (p.hang ? 5.0 : 1.4));
          const c = IP.blood[k > 0.85 ? 3 : k > 0.55 ? 2 : k > 0.3 ? 1 : 0];
          const r = R(p.r), cx = R(p.x), cy = R(p.y), sd = p.sd;
          if (r <= 0) break;
          // The wider it spreads the thinner it gets -- but a cloud that is
          // MEANT to hang has a floor under it, or the big slow ones that
          // are supposed to still be there a beat later fade to nothing.
          const thin = 1 - Math.min(p.hang ? 0.40 : 0.78, r / 20);
          ctx.fillStyle = rgbaq(c, Math.min(0.66, (k * 0.66 + 0.09) * thin));
          // Every row is bitten in from BOTH sides by a different amount, off
          // the cloud's own seed, so the silhouette comes out lumpy and
          // lopsided.  A perfect disc is the one thing blood in water is not.
          // Rows are two pixels tall on anything bigger than a speck -- half
          // the fills, and still a hard two-pixel edge rather than a ramp.
          const st = r >= 5 ? 2 : 1;
          for (let dy = -r; dy <= r; dy += st) {
            const w = Math.sqrt(Math.max(0, r * r - dy * dy));
            if (w <= 0.5) continue;
            const l = R(w - hash2(sd + dy * 7, sd * 3) * r * 0.55);
            const rr = R(w - hash2(sd * 5 - dy * 3, sd + 11) * r * 0.55);
            if (l + rr <= 0) continue;
            ctx.fillRect(cx - l, cy + dy, l + rr, st);
          }
          // A denser heart to it, one band further down the ramp and off
          // centre.  Only on the big ones: on a four-pixel cloud it is
          // invisible and it is the second row loop that costs.
          const r2 = r >= 9 ? R(r * 0.58) : 0, ox = R(r * 0.14);
          ctx.fillStyle = rgbaq(IP.blood[k > 0.6 ? 2 : 0], Math.min(0.38, (k * 0.38 + 0.05) * thin));
          for (let dy = -r2; dy <= r2; dy += 2) {
            const w = Math.sqrt(Math.max(0, r2 * r2 - dy * dy));
            if (w <= 0.5) continue;
            const l = R(w - hash2(sd * 7 + dy, sd) * r2 * 0.7);
            const rr = R(w - hash2(sd - dy * 5, sd * 9) * r2 * 0.7);
            if (l + rr <= 0) continue;
            ctx.fillRect(cx - l + ox, cy + dy, l + rr, 2);
          }
          // and a speckled fringe that thins out into the water
          ctx.fillStyle = rgbaq(IP.blood[4], Math.min(0.30, k * 0.30 * thin));
          for (let i = 0; i < 7; i++) {
            const a = hash2(sd + i * 11, sd + i * 5) * TAU;
            const rr = r * (0.84 + hash2(sd + i * 3, sd + i) * 0.55);
            ctx.fillRect(cx + Math.round(Math.cos(a) * rr), cy + Math.round(Math.sin(a) * rr), 2, 2);
          }
          break;
        }
        // arterial: a hot head with a darker tail streaming off the back of it
        case 'j': {
          const k = clamp(p.life / p.max, 0, 1);
          const w = p.w + 1;
          ctx.fillStyle = IP.blood[k > 0.6 ? 4 : 3];
          ctx.fillRect(R(p.x), R(p.y), w, w);
          const m = Math.hypot(p.vx, p.vy) || 1;
          ctx.fillStyle = rgbaq(IP.blood[2], qa(0.55 * k));
          for (let i = 1; i < 4; i++) ctx.fillRect(R(p.x - p.vx / m * i * 2.2), R(p.y - p.vy / m * i * 2.2), w, 1);
          break;
        }
        case 'c': {
          ctx.fillStyle = IP.ink; ctx.fillRect(R(p.x) - 1, R(p.y) - 1, p.w + 2, p.h + 2);
          ctx.fillStyle = p.c; ctx.fillRect(R(p.x), R(p.y), p.w, p.h);
          ctx.fillStyle = IP.meat[4]; ctx.fillRect(R(p.x), R(p.y), p.w, 1);
          break;
        }
        case 'g': {
          const a = qa(p.life / p.t0 * 0.8);
          if (a <= 0) break;
          ctx.fillStyle = rgbaq(p.c, a);
          const r = R(p.r);
          for (let i = 0; i < 20; i++) {
            const an = i / 20 * TAU;
            ctx.fillRect(R(p.x + Math.cos(an) * r), R(p.y + Math.sin(an) * r * 0.62), 2, 2);
          }
          break;
        }
      }
    }
  },
};

// =============================================================== BACKDROP ==
function tile(ctx, c, scroll, y, alpha) {
  if (!c) return;
  if (alpha !== undefined && alpha < 1) { ctx.save(); ctx.globalAlpha = qa(alpha); }
  let x = -(((scroll % c.width) + c.width) % c.width);
  for (; x < 640; x += c.width) ctx.drawImage(c, R(x), R(y));
  if (alpha !== undefined && alpha < 1) ctx.restore();
}
function motes(ctx, scroll, t, n, col, a) {
  ctx.fillStyle = rgbaq(col || '#cfe8f0', a === undefined ? 0.30 : a);
  for (let i = 0; i < n; i++) {
    const sx = (hash2(i, 7) * 1400 - scroll * (0.6 + hash2(i, 3) * 0.7) + t * 5) % 660;
    const sy = (hash2(i, 11) * 400 + Math.sin(t * 0.5 + i) * 6 + t * 3) % 380;
    ctx.fillRect(R(sx < 0 ? sx + 660 : sx) - 10, R(sy) - 10, 1 + (i & 1), 1);
  }
}
function caustics(ctx, y0, t, rows, a, col) {
  for (let i = 0; i < rows; i++) {
    const yy = y0 + i * 6;
    ctx.fillStyle = rgbaq(col || '#cff6ff', a * (1 - i / rows));
    for (let x = 0; x < 640; x += 6) {
      const w = Math.sin(x * 0.05 + t * 1.3 + i * 1.1) > 0.25 ? 4 : 0;
      if (w) ctx.fillRect(x, R(yy + Math.sin(x * 0.03 + t) * 2), w, 1);
    }
  }
}
function backdrop(ctx, o) {
  const s = o.scroll || 0, t = o.t || 0;
  const G = GRADE_SPEC[o.grade] || null;
  ctx.drawImage(WATER[o.mood] || WATER.lagoon, 0, 0);
  if (o.shafts) {
    const sh = !G || G.shaft === 'cold' ? LAY.shafts : LAY.shaftsWarm;
    ctx.save(); ctx.globalAlpha = qa(o.shafts); tile(ctx, sh, s * 0.16, (o.surfY === undefined || o.surfY === null ? -40 : o.surfY)); ctx.restore();
  }
  // The lit water itself: the ocean's own caustics, boiling and drifting.
  // There are three baked nets and the beat used to cut between them six
  // times a second, which strobed.  They are cross-dissolved now -- two
  // blits on a quantized alpha -- so the light boils instead of flicking.
  const deepShot = o.surfY === undefined || o.surfY === null;
  const ca = o.caust === undefined ? (deepShot ? 0.26 : 0.60) : o.caust;
  if (ca > 0 && LAY.caust) {
    const top = (deepShot ? -34 : o.surfY) - 6;
    const f = t * 5.2, i0 = Math.floor(f), fr = f - i0, dx = s * 0.22 + t * 7;
    tile(ctx, LAY.caust[i0 % 3], dx, top, ca * (1 - fr));
    tile(ctx, LAY.caust[(i0 + 1) % 3], dx, top, ca * fr);
  }
  if (o.bedY !== undefined && o.bedY !== null) {
    tile(ctx, LAY.far, s * 0.26, o.bedY - LAY.far.height + 6);
    tile(ctx, LAY.grassFar, s * 0.40, o.bedY - LAY.grassFar.height + 10);
    const mid = LAY[o.mid || 'mid'] || LAY.mid;
    tile(ctx, mid, s * 0.58, o.bedY - mid.height + 4);
    tile(ctx, LAY.bed, s * 0.78, o.bedY);
    if (o.causticBed) caustics(ctx, o.bedY + 4, t, 4, 0.20, G ? G.bedCaustic : '#ffeec0');
  }
  if (o.surfY !== undefined && o.surfY !== null) {
    tile(ctx, LAY.surf, s * 0.34, o.surfY - 6);
    caustics(ctx, o.surfY + 14, t, 5, 0.22, G ? G.caustic : undefined);
  }
  // one baked, dithered wash gives the whole beat its hour of the day
  if (GRADE[o.grade]) ctx.drawImage(GRADE[o.grade], 0, 0);
  // and then, if anything has been opened up in it, the blood on top of the
  // hour.  One extra blit on a quantized alpha; nothing is rebuilt.
  if (o.gore > 0.01 && GRADE.gore) { ctx.save(); ctx.globalAlpha = qa(o.gore); ctx.drawImage(GRADE.gore, 0, 0); ctx.restore(); }
  motes(ctx, s, t, 60, G ? G.mote : '#bcdfe8', 0.26);
}
function foreground(ctx, o) {
  const s = o.scroll || 0, t = o.t || 0;
  const G = GRADE_SPEC[o.grade] || null;
  if (o.bedY !== undefined && o.bedY !== null) {
    tile(ctx, LAY.near, s * 1.35, o.bedY - LAY.near.height + 34);
    tile(ctx, LAY.grassNear, s * 1.7, o.bedY - 6);
  }
  // the coloured light itself, laid over the actors so they sit in the scene
  if (GLOW[o.grade]) ctx.drawImage(GLOW[o.grade], 0, 0);
  // The over-light only earns its full-frame blit while there is real blood
  // in the water; under that the scenery pass alone carries it.
  if (o.gore > 0.34 && GLOW.gore) { ctx.save(); ctx.globalAlpha = qa(o.gore * 0.75); ctx.drawImage(GLOW.gore, 0, 0); ctx.restore(); }
  motes(ctx, s * 2, t, 26, G ? G.mote : '#e6f6ff', 0.36);
}
// ---- drifting fish school --------------------------------------------------
function makeSchool(n, x, y, spread, sz, kind, spd) {
  const f = [];
  for (let i = 0; i < n; i++) f.push({ x: x + rand(-spread, spread), y: y + rand(-spread * 0.4, spread * 0.4), ph: rand(0, TAU), s: sz, kind: kind, spd: spd + rand(-6, 6) });
  return f;
}
function drawSchool(ctx, sch, t, dt, flip) {
  for (const f of sch) {
    f.x += f.spd * dt;
    if (f.x > 700) f.x -= 780; if (f.x < -80) f.x += 780;
    const sy = f.y + Math.sin(t * 2.4 + f.ph) * 4;
    const sp = FISHSPR[f.kind][f.s];
    ctx.save(); ctx.translate(R(f.x), R(sy));
    if ((f.spd < 0) !== !!flip) ctx.scale(-1, 1);
    ctx.rotate(Math.sin(t * 2.4 + f.ph) * 0.12);
    ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.restore();
  }
}

// ================================================================= TEXT ====
const BAR = 24;
function letterbox(ctx, k) {
  const h = R(BAR * (k === undefined ? 1 : k));
  P(ctx, '#000000', 0, 0, 640, h);
  P(ctx, '#000000', 0, 360 - h, 640, h);
}
// A speech bubble.  Warm cream for the otter, cool mint for her, and it
// grows in on a spring rather than appearing: `pop` is 0..1.2 and scales the
// BOX only, in whole pixels, so no glyph is ever drawn at a fraction.
function bubble(ctx, x, y, text, dir, style, prog, pop) {
  if (pop !== undefined && pop <= 0.02) return;
  const size = 7;
  const lines = wrapText(ctx, text, 150, size);
  let w = 0; for (const l of lines) w = Math.max(w, textWidth(l, size));
  const fullW = R(w) + 15, fullH = lines.length * 10 + 11;
  const k = pop === undefined ? 1 : clamp(pop, 0, 1.25);
  const bw = Math.max(8, R(fullW * k)), bh = Math.max(7, R(fullH * (0.55 + 0.45 * k)));
  let bx = R(x - bw / 2), by = R(dir > 0 ? y - bh - 8 : y + 8);
  bx = clamp(bx, 4, 636 - bw);
  const warm = style === 'otter';
  // a third hand for the humans (Cine's village): bleached sailcloth and a
  // dried-blood ink, so a fisher never reads as either of the two animals
  const man = style === 'man';
  const fill = man ? '#ece6da' : warm ? '#fff0c8' : '#dff4ec', fill2 = man ? '#bdb2a0' : warm ? '#e2c48c' : '#a8ccc4';
  const ink = man ? '#3a1a16' : warm ? '#4a2c18' : '#1b3a3c';
  // a rounded box: the four corner pixels are simply left out of every band
  const band = (yy, h, col, inset) => P(ctx, col, bx + inset, yy, bw - inset * 2, h);
  P(ctx, ink, bx + 1, by - 1, bw - 2, 1);
  P(ctx, ink, bx + 1, by + bh, bw - 2, 1);
  P(ctx, ink, bx - 1, by + 1, 1, bh - 2);
  P(ctx, ink, bx + bw, by + 1, 1, bh - 2);
  P(ctx, ink, bx, by, 1, 1); P(ctx, ink, bx + bw - 1, by, 1, 1);
  P(ctx, ink, bx, by + bh - 1, 1, 1); P(ctx, ink, bx + bw - 1, by + bh - 1, 1, 1);
  band(by + 1, bh - 2, fill, 0);
  band(by, 1, fill, 1); band(by + bh - 1, 1, fill, 1);
  band(by + bh - 3, 2, fill2, 1);
  P(ctx, man ? '#faf6ee' : warm ? '#fffaea' : '#f2fffb', bx + 2, by + 1, bw - 4, 1);
  // tail, only once the box is open
  if (k > 0.85) {
    const tx = clamp(R(x), bx + 6, bx + bw - 8);
    for (let i = 0; i < 7; i++) {
      const ty = dir > 0 ? by + bh + i : by - 1 - i;
      P(ctx, ink, tx - 4 + i, ty, 8 - i, 1);
      if (i < 6) P(ctx, i > 3 ? fill2 : fill, tx - 3 + i, ty, 6 - i, 1);
    }
  }
  if (k < 0.98) return;                       // no letters until it has landed
  let total = 0; for (const l of lines) total += l.length;
  let shown = Math.floor((prog === undefined ? 1 : prog) * total);
  for (let i = 0; i < lines.length; i++) {
    const take = Math.max(0, Math.min(lines[i].length, shown));
    shown -= lines[i].length;
    if (take > 0) pixelText(ctx, lines[i].slice(0, take), bx + 7, by + 6 + i * 10, size, ink, 'left', false);
  }
}
// The title, dropped in on a bounce and left bobbing.  It used to slide in on
// a smoothstep and stop dead; every word now overshoots and settles.
function titleCard(ctx, k, t) {
  if (k <= 0) return;
  const drop = outBounce(clamp(k * 3.4, 0, 1));
  const bob = Math.sin(t * 1.5) * 2;
  const y = R(lerp(-70, 84, drop) + bob);
  const a = clamp(k < 0.80 ? 1 : (1 - k) / 0.20, 0, 1);
  ctx.save(); ctx.globalAlpha = qa(a);
  pixelTextOutlined(ctx, 'MANATEE', 320, y, 34, '#fffaf0', '#173044', 'center');
  if (k > 0.16) {
    const vk = outBack(clamp((k - 0.16) * 7, 0, 1));
    pixelTextOutlined(ctx, 'VS', 320, R(y + 38 + (1 - vk) * 6), 15, IP.blood[3], '#2a0a10', 'center');
  }
  if (k > 0.24) {
    // in from the right, not down through the word above it
    const b = outBack(clamp((k - 0.24) * 3.0, 0, 1));
    pixelTextOutlined(ctx, 'BOATS', R(lerp(820, 320, b)), R(y + 58 + bob * 0.5), 34, '#ffe48f', '#173044', 'center');
  }
  ctx.restore();
}

// ================================================================== SKY =====
function buildSky(cols, cloudPal) {
  cols = cols || IP.sky; cloudPal = cloudPal || ['#f6f8ee', '#ffffff', '#cfd6d0'];
  const H = 96, c = can(LW, H), x = cx2(c);
  for (let y = 0; y < H; y++) {
    const k = Math.pow(y / (H - 1), 0.8) * (cols.length - 1);
    let i0 = Math.floor(k), fr = k - i0; i0 = clamp(i0, 0, cols.length - 1);
    for (let px = 0; px < LW; px++) P(x, cols[clamp(fr > bay(px, y) ? i0 + 1 : i0, 0, cols.length - 1)], px, y);
  }
  const rng = new SeededRandom(6161);
  // Each cloud is stamped three times, one tile width apart, so a cloud that
  // runs off the right of the layer comes back on at the left instead of
  // being cut in half at the seam the tiler wraps on.
  for (let i = 0; i < 9; i++) {
    const cxx = R(rng.range(0, LW)), cyy = R(rng.range(6, 52)), w = R(rng.range(30, 90)), h = R(rng.range(6, 14));
    for (let j = 0; j < 5; j++) {
      const ox = R(rng.range(-w * 0.4, w * 0.4)), oy = R(rng.range(-h * 0.3, h * 0.3));
      const w0 = R(w * rng.range(0.34, 0.62)), w1 = R(w * rng.range(0.22, 0.42)), w2 = R(w * rng.range(0.26, 0.5));
      for (const wrap of [-LW, 0, LW]) {
        const bx = cxx + ox + wrap, by = cyy + oy;
        // a puff, not a slab: the body, then two narrower shoulders, then a
        // flat base, so the silhouette comes out lumpy instead of square
        P(x, cloudPal[0], bx, by, w0, h);
        P(x, cloudPal[0], bx + 2, by - 2, Math.max(1, w0 - 5), 2);
        P(x, cloudPal[0], bx + R(w0 * 0.30), by - 4, Math.max(1, R(w0 * 0.44)), 2);
        P(x, cloudPal[1], bx + 1, by, w1, Math.max(1, h >> 1));
        P(x, cloudPal[1], bx + 3, by - 2, Math.max(1, R(w1 * 0.7)), 2);
        P(x, cloudPal[2], bx + 1, by + h - 1, w2, 1);
      }
    }
  }
  for (let i = 0; i < 7; i++) {
    const gx = R(rng.range(0, LW)), gy = R(rng.range(8, 44));
    P(x, '#20303c', gx, gy, 3, 1); P(x, '#20303c', gx + 2, gy - 1, 2, 1); P(x, '#20303c', gx + 4, gy, 3, 1);
  }
  return c;
}
// Each sky is its own hour: ramp, cloud palette, far-sea bands, whitecap and
// the colour of the waterline.  All four are baked once into LAY.
const SKYMODE = {
  day:    { zenith: '#1b4f86', key: 'sky',     sea: ['#2a6f9c', '#1d5580'], glint: '#bcdcec', chop: '#2d6f86', cap: '#eaf8ff', line: '#0d2a33', lip: '#cfeaf2' },
  gold:   { zenith: '#1a5a94', key: 'skyGold', sea: ['#3080a4', '#22607f'], glint: '#ffe3a2', chop: '#2b6478', cap: '#fff0c4', line: '#22303a', lip: '#ffdfa0' },
};
const SKY_RAMP = {
  sky: [['#2c74b4', '#3d8bc8', '#5aa6dc', '#7ec2ea', '#a2d9f4', '#c4ecfc'], ['#ffffff', '#ffffff', '#cfe2ea']],
  skyGold: [['#2c68a8', '#4a92c4', '#7fbad4', '#bcd3c6', '#f2d89a', '#ffc472'], ['#fff2d4', '#ffffff', '#dba980']],
};
function buildSkyTop(zenith, horizon) {
  const c = can(640, 240), x = cx2(c), A = hexToRgb(zenith), B = hexToRgb(horizon);
  const bands = 9;
  for (let y = 0; y < 240; y++) {
    const f = y / 239 * bands, i0 = Math.floor(f), fr = f - i0;
    for (let px = 0; px < 640; px++) {
      const k = clamp((fr > bay(px, y) ? i0 + 1 : i0) / bands, 0, 1);
      P(x, 'rgb(' + R(A[0] + (B[0] - A[0]) * k) + ',' + R(A[1] + (B[1] - A[1]) * k) + ',' + R(A[2] + (B[2] - A[2]) * k) + ')', px, y);
    }
  }
  return c;
}
function skyCan(mode) {
  const m = SKYMODE[mode] || SKYMODE.day;
  if (!LAY[m.key]) {
    LAY[m.key] = buildSky(SKY_RAMP[m.key][0], SKY_RAMP[m.key][1]);
    LAY[m.key + 'Top'] = buildSkyTop(m.zenith, SKY_RAMP[m.key][0][0]);
  }
  return LAY[m.key];
}
function drawAir(ctx, surfY, scroll, t, mode) {
  const m = SKYMODE[mode] || SKYMODE.day;
  const sc = skyCan(mode);
  const sy = R(surfY);
  if (sy <= 0) return;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 640, sy); ctx.clip();
  const topY = sy - sc.height - 10;
  P(ctx, m.zenith, 0, 0, 640, Math.max(0, topY - 240));
  ctx.drawImage(LAY[m.key + 'Top'], 0, R(topY - 240));
  tile(ctx, sc, scroll * 0.10, topY);
  // far sea, sitting on the horizon
  const hz = sy - 12;
  for (let x = 0; x < 640; x += 2) {
    const w2 = Math.sin(x * 0.035 + t * 0.4) * 1.4;
    P(ctx, m.sea[0], x, hz + R(w2), 2, 12);
    P(ctx, m.sea[1], x, hz + 4 + R(w2), 2, 8);
    if (hash2(x, 17) > 0.90) P(ctx, m.glint, x, hz + 1 + R(w2), 3, 1);
  }
  // Chop + whitecaps at the waterline.  The caps used to be reseeded three
  // times a second off floor(t*3), so they blinked on and off in place; the
  // pattern TRAVELS now -- same hash, sampled in a frame that slides along
  // the surface -- so a cap runs down the chop instead of strobing.
  for (let x = 0; x < 640; x += 2) {
    const w = Math.sin(x * 0.07 + t * 2.2) * 2 + Math.sin(x * 0.021 - t * 1.3) * 1.6;
    const yy = sy - 3 + R(w);
    P(ctx, m.chop, x, yy, 2, sy - yy);
    if (hash2(Math.floor((x + t * 26) / 6), 17) > 0.74) P(ctx, m.cap, x, yy - 1, 2, 2);
  }
  ctx.restore();
  P(ctx, m.line, 0, sy - 1, 640, 1);
  for (let x = 0; x < 640; x += 3) if (hash2(Math.floor((x + t * 34) / 3), 5) > 0.66) P(ctx, m.lip, x, sy + R(Math.sin(x * 0.07 + t * 2.2) * 2), 3, 1);
}
function speedLines(ctx, x, y, n, len, dir, col, seed) {
  ctx.fillStyle = col || 'rgba(225,244,255,0.5)';
  for (let i = 0; i < n; i++) {
    const oy = R(y + (hash2(i, seed | 0) - 0.5) * 42);
    const ox = R(x + (hash2(i * 3, seed | 0) - 0.5) * 40);
    ctx.fillRect(ox, oy, R(len * (0.5 + hash2(i * 7, seed | 0) * 0.8)) * (dir < 0 ? -1 : 1), 1);
  }
}
// ---------------------------------------------------------------- actors ---
function actor(set, x, y, o) {
  return Object.assign({
    set: set, x: x, y: y, rot: 0, phase: rand(0, TAU), exp: 'calm', flip: false,
    scarred: false, tailAmp: 0.30, flipperA: 0.45, sx: 1, sy: 1, flash: 0, blink: false,
    vx: 0, vy: 0, beat: 1.6,
    // squash-and-stretch state: bounce() carries it, kick() puts energy in
    sq: 0, sqv: 0,
    // and the damage: open wounds and the steel still in them, both in
    // body-local units so they travel with whatever the body does
    wounds: null, harps: null, dying: 0,
  }, o || {});
}
function swim(m, dt, rate) { m.phase += dt * (rate === undefined ? m.beat : rate); }
let sndT = 0, sndT2 = 0;
function engine(dt, inten) {
  if (typeof Audio_ === 'undefined') return;
  sndT -= dt;
  if (sndT <= 0) {
    sndT = 0.17;
    Audio_.noise(0.24, 0.045 * inten, 230, 40);
    Audio_.tone(42 + rand(0, 7), 0.20, 'sawtooth', 0.030 * inten);
  }
}
function churnSound(dt, inten) {
  if (typeof Audio_ === 'undefined') return;
  sndT2 -= dt;
  if (sndT2 <= 0) { sndT2 = 0.33; Audio_.noise(0.28, 0.035 * inten, 1400, 500); }
}

// ============================================================== SEA  OTTER ==
//  He is the cast's otter too: CH.otterStand on his feet, CH.otterTorso when
//  he is riding her, his own arm, his own tail and his live head, composed at
//  chars.js's own offsets.  Only the fortnight in a fish hold is new.
//
//  chars.js rasterizes him at DETAIL art pixels per world unit and scales
//  those canvases down on the way out; here every part is copied at its own
//  raster size and drawn 1:1, so one of HIS art pixels is one logical unit —
//  exactly like one of hers.  That is the whole point: before this, his head
//  and sleeves came out of the hi-res bridge twice as fine as the hide of the
//  animal he was standing on, and his torso was scaled by 1.7 on top of that.
const CAP = { ready: false };
// his raster, at its own resolution, with the world anchors brought with it
function rawSpr(s) {
  const W = s.c.width, H = s.c.height;
  const c = can(W, H);
  cx2(c).drawImage(s.c, 0, 0, W, H, 0, 0, W, H);       // 8-arg: no hi-res bridge
  const k = W / Math.max(1, R(s.w));
  return { c: c, w: W, h: H, ax: s.ax * k, ay: s.ay * k, k: k };
}
function capOtter() {
  if (CAP.ready) return CAP;
  if (typeof CH === 'undefined' || !CH.otterStandHi || !CH.otterHead || !CH.otterArm || !CH.otterTail) return null;
  CAP.stand = rawSpr(CH.otterStandHi);
  CAP.arm = rawSpr(CH.otterArm);
  CAP.tail = rawSpr(CH.otterTail);
  CAP.ride = rawSpr(CH.otterTorso);
  CAP.cigar = rawSpr(CH.cigar);
  // The pirate gear is the cast's job and the cast already does it: the
  // tricorn with the skull on the crown, the bandolier, the coat and the
  // jolly roger all come out of chars.js, at chars.js's own resolution, and
  // are drawn here 1:1 on her grid.  The only thing built in this file is
  // the cutlass, because nothing in the cast holds one -- and if the cast
  // ever bakes one, this picks that up instead without a further edit.
  CAP.blade = CH.cutlass ? rawSpr(CH.cutlass) : spr(buildCutlass().c, 4, 9);
  CAP.flags = (CH.flags && CH.flags.length) ? CH.flags.map(rawSpr) : null;
  CAP.hk = (CH.headBuf ? CH.headBuf.width : CH.otterHead.c.width) / Math.max(1, R(CH.otterHead.w));
  CAP.hax = CH.otterHead.ax * CAP.hk; CAP.hay = CH.otterHead.ay * CAP.hk;
  CAP.ready = true;
  return CAP;
}
// the cinematic's moods, said in the cast's own vocabulary
const OEXP = { plot: 'angry', sly: 'idle', grin: 'happy', shout: 'angry' };
function drawCapOtter(ctx, o, t) {
  const C = capOtter(); if (!C) return;
  const D = C.stand.k;                       // his art pixels per world unit
  ctx.save();
  ctx.translate(R(o.x), R(o.y));
  if (o.flip) ctx.scale(-1, 1);
  ctx.rotate(o.rot || 0);
  // the same squash the manatees get.  bounce() snaps it back to exactly 1,
  // so he is pixel-exact except in the few frames after a kick.
  if ((o.sx !== undefined && o.sx !== 1) || (o.sy !== undefined && o.sy !== 1)) {
    ctx.scale(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy);
  }
  // NOTE: no per-beat scale.  He is one size, on her grid, all the way
  // through, which is the only way his pixels stay the size of hers.
  const ph = o.phase || 0;
  const ride = !!o.ride;
  const arms = [o.armNear === undefined ? (ride ? 0.9 : -0.25) : o.armNear,
                o.armFar === undefined ? (ride ? -0.9 : 0.35) : o.armFar];
  const body = ride ? C.ride : C.stand;
  // tail, far arm, body, near arm + whatever is in his paw, head
  ctx.save();
  ctx.translate(ride ? -7 * D : -6 * D, (ride ? 3 : 4) * D);
  ctx.rotate((ride ? 2.5 : 2.9) + Math.sin(ph) * 0.10 + (o.tail || 0));
  ctx.drawImage(C.tail.c, -C.tail.ax, -C.tail.ay); ctx.restore();
  ctx.save(); ctx.translate(D, (ride ? 4 : -1) * D); ctx.rotate(arms[1]);
  ctx.drawImage(C.arm.c, -C.arm.ax, -C.arm.ay); ctx.restore();
  ctx.drawImage(body.c, -body.ax, -body.ay);
  ctx.save(); ctx.translate(2 * D, (ride ? -4 : -2) * D); ctx.rotate(arms[0] + Math.sin(ph * 1.3) * 0.08);
  ctx.drawImage(C.arm.c, -C.arm.ax, -C.arm.ay);
  // the cutlass, GRIPPED in the paw at the end of that arm, so it swings
  // with the arm rather than floating alongside him
  if (o.blade && C.blade) {
    ctx.save();
    ctx.translate(R(C.arm.w - C.arm.ax - 5), 0);
    ctx.rotate(o.bladeR === undefined ? -1.05 : o.bladeR);
    ctx.drawImage(C.blade.c, -C.blade.ax, -C.blade.ay);
    if (o.bladeWet > 0) {
      // still wet from the last thing it was in: it beads along the LOW edge
      // of the steel and lets go, rather than painting over the blade
      for (let i = 0; i < 5; i++) {
        const sx = 12 + i * 4, k2 = (sx - 9) / 20;
        const by = R(9 - Math.sin(k2 * 1.9) * 5.5 + Math.max(2, 4.4 - k2 * 2.2)) - 9;
        P(ctx, IP.blood[1], sx - 4, by, 2, 1);
        if (((i * 3 + Math.floor(t * 2.6)) % 5) === 0) P(ctx, IP.blood[2], sx - 4, by + 2 + (Math.floor(t * 6) % 3), 1, 2);
      }
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.save();
  ctx.translate((o.headX || 0) + (ride ? 0 : D), (ride ? -7 : -11) * D + (o.headY || 0) + R(Math.sin(ph * 0.8) * 0.8));
  ctx.rotate(o.headR || 0);
  const ex = OEXP[o.exp] || o.exp || 'idle';
  const hd = CH.headWithFace(ex, !!o.blink, t, false);
  ctx.drawImage(hd, 0, 0, hd.width, hd.height, -C.hax, -C.hay, hd.width, hd.height);
  if (o.rough) for (let i = 0; i < 4; i++) P(ctx, '#e8e4d8', -C.hax + 8 + i, -C.hay + 16 + i, 1, 1);
  if (o.cigar) {
    ctx.drawImage(C.cigar.c, 2 * D, D);
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.45 + i * 0.25) % 1;
      ctx.fillStyle = rgbaq('#b9b3ad', qa(0.30 * (1 - k)));
      ctx.fillRect(R((9 + Math.sin(k * 6 + i) * 2) * D), R((-1 - k * 11) * D), (1 + R(k * 2)) * D, (1 + R(k * 2)) * D);
    }
  }
  ctx.restore();
  ctx.restore();
}
// The colours.  CH.flags is the cast's own sixteen-frame jolly roger -- the
// same cloth the player will be flying behind the saddle all game -- drawn
// here on a spar at the intro's 1:1 art grid.  The flipbook carries the shape
// of the wave; a continuous sway on top of it carries the travel, so between
// two frames the cloth is still going somewhere instead of sitting still.
function drawJolly(ctx, x, y, t, k) {
  const C = capOtter(); if (!C || !C.flags) return;
  k = clamp(k, 0, 1);
  if (k <= 0.01) return;
  const h = R(58 * k);
  for (let i = 0; i < h; i++) {
    P(ctx, IP.ink, R(x) - 1, R(y) - i, 4, 1);
    P(ctx, '#3a2412', R(x), R(y) - i, 2, 1);
    P(ctx, '#8a5a2c', R(x), R(y) - i, 1, 1);
  }
  if (k < 0.34) return;
  const n = C.flags.length;
  const fi = Math.floor(t * 15) % n;
  const f = C.flags[fi];
  ctx.save();
  ctx.translate(R(x) + 1, R(y) - h + 3);
  ctx.rotate(-0.10 + Math.sin(t * 2.3) * 0.055);
  ctx.drawImage(f.c, -f.ax, -f.ay);
  ctx.restore();
}
// ===========================================================================
//  THE YACHT DECK, AND EVERYTHING BELOW IT
//  Recovered with the capture beats.  Three rooms: the deck she is swung
//  over, the hold she wakes up in, and the crate inside it.  All of it is
//  baked once into HOLD and blitted; nothing in here is rebuilt per frame.
// ===========================================================================
// ---- the yacht deck, seen from the side ------------------------------------
function drawDeck(ctx, t) {
  const sk = skyCan('day');
  P(ctx, IP.sky[0], 0, 0, 640, 360);
  tile(ctx, sk, t * 4, 152 - sk.height);
  // open sea behind the rail
  for (let y = 152; y < 190; y++) {
    const k = (y - 152) / 38;
    P(ctx, k < 0.3 ? '#2f86bc' : k < 0.62 ? '#1f679c' : '#154d7c', 0, y, 640, 1);
  }
  for (let x = 0; x < 640; x += 3) if (hash2(x, Math.floor(t * 2) + (x % 5)) > 0.84) P(ctx, '#bcdcec', x, 154 + R(hash2(x, 3) * 32), 4, 1);
  // guard rail
  for (let x = 6; x < 640; x += 44) { P(ctx, IP.ink, x, 150, 5, 44); P(ctx, '#c3ccd8', x + 1, 151, 3, 42); P(ctx, '#eef4fa', x + 1, 151, 1, 42); }
  P(ctx, IP.ink, 0, 146, 640, 5); P(ctx, '#dfe6ee', 0, 147, 640, 2); P(ctx, '#9aa6b6', 0, 149, 640, 1);
  P(ctx, IP.ink, 0, 168, 640, 3); P(ctx, '#b9c4d0', 0, 169, 640, 1);
  // bulwark cap + coaming
  P(ctx, IP.ink, 0, 190, 640, 4);
  P(ctx, '#eef2f7', 0, 194, 640, 12); P(ctx, '#ccd4de', 0, 203, 640, 3);
  P(ctx, IP.ink, 0, 206, 640, 2);
  // deck sole, darker where it meets the bulwark
  for (let y = 208; y < 360; y++) {
    const k = (y - 208) / 152;
    const base = k < 0.16 ? '#7b5c33' : k < 0.44 ? '#a07a44' : k < 0.74 ? '#bf9456' : '#d8b171';
    P(ctx, ((y % 11) === 0) ? '#54391d' : base, 0, y, 640, 1);
  }
  for (let x = 0; x < 640; x += 61) { P(ctx, '#54391d', x, 208, 1, 152); P(ctx, '#e8c78c', x + 1, 208, 1, 152); }
  for (let i = 0; i < 90; i++) { const gx = R(hash2(i, 5) * 640), gy = 210 + R(hash2(i, 9) * 148); P(ctx, hash2(gx, gy) > 0.5 ? '#7d5c31' : '#e3c28a', gx, gy, 2, 1); }
  for (let i = 0; i < 6; i++) { const gx = 40 + R(hash2(i, 21) * 520); P(ctx, '#3f7f72', gx, 300 + R(hash2(i, 3) * 44), R(20 + hash2(i, 7) * 40), 3); }
  // ---- crates, cooler and winch to port
  P(ctx, IP.ink, 36, 246, 78, 58); P(ctx, '#9a6526', 37, 247, 76, 56); P(ctx, '#e0a03c', 37, 247, 76, 5);
  for (let i = 0; i < 5; i++) P(ctx, '#5c3a1c', 37, 255 + i * 11, 76, 2);
  P(ctx, '#3f3324', 36, 304, 78, 4);
  P(ctx, IP.ink, 132, 262, 58, 42); P(ctx, '#d8dde4', 133, 263, 56, 40); P(ctx, '#9aa6b6', 133, 292, 56, 11);
  P(ctx, '#e8222e', 138, 268, 46, 5); P(ctx, '#3f3324', 132, 304, 58, 4);
  P(ctx, IP.ink, 206, 232, 54, 72); P(ctx, '#4a525e', 207, 233, 52, 70); P(ctx, '#767f8d', 207, 233, 52, 7);
  for (let i = 0; i < 5; i++) P(ctx, '#2a3038', 211 + i * 9, 246, 4, 46);
  P(ctx, '#b8541e', 207, 252, 52, 3); P(ctx, '#e07a2e', 207, 252, 52, 1);
  P(ctx, '#3f3324', 206, 304, 54, 4);
  // ---- the tank, standing on the deck
  const tx = 392, ty = 150, tw = 212, th = 176;
  P(ctx, IP.ink, tx - 6, ty - 6, tw + 12, th + 12);
  P(ctx, '#4b5460', tx - 5, ty - 5, tw + 10, th + 10);
  P(ctx, '#79838f', tx - 5, ty - 5, tw + 10, 3); P(ctx, '#2a303a', tx - 5, ty + th + 2, tw + 10, 3);
  for (let i = 0; i < tw; i += 17) { P(ctx, '#9aa4b0', tx + i + 4, ty - 4, 2, 2); P(ctx, '#9aa4b0', tx + i + 4, ty + th + 2, 2, 2); }
  P(ctx, '#3f5a2c', tx, ty, tw, th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (hash2(x + y * 7, y) > 0.87) P(ctx, hash2(x, y) > 0.5 ? '#4e6f36' : '#32491f', tx + x, ty + y);
  P(ctx, '#20301a', tx, ty + th - 24, tw, 24);
  P(ctx, '#6f8f4a', tx, ty + 4, tw, 6); P(ctx, '#d8f0a0', tx, ty + 4, tw, 2); P(ctx, IP.ink, tx, ty + 3, tw, 1);
  for (let i = 0; i < 26; i++) {
    const fx2 = tx + 8 + R(hash2(i * 7, 3) * (tw - 24)), fy = ty + 18 + R(hash2(i, 9) * (th - 46));
    const sp = FISHSPR[i % 4][i % 3];
    ctx.save(); ctx.translate(fx2, fy + R(Math.sin(t * 2 + i) * 3)); if (i & 1) ctx.scale(-1, 1); ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.restore();
  }
  // and the ones that did not make it, floating belly up along the top
  if (FISHDEAD) for (let i = 0; i < 6; i++) {
    ctx.save(); ctx.translate(tx + 22 + i * 32, ty + 13 + R(Math.sin(t * 0.6 + i) * 2)); ctx.scale(1, -1);
    ctx.drawImage(FISHDEAD.c, -FISHDEAD.ax, -FISHDEAD.ay); ctx.restore();
  }
  for (let i = 0; i < 5; i++) { ctx.fillStyle = rgbaq('#bff8ff', 0.09); ctx.fillRect(tx + 14 + i * 42, ty + 8, 10, th - 16); }
  P(ctx, '#d8f8ff', tx + 2, ty + 6, 3, th - 18); P(ctx, '#8fd8e8', tx + tw - 5, ty + 6, 3, th - 18);
  P(ctx, IP.ink, tx - 6, ty + th + 6, tw + 12, 8); P(ctx, '#2a3038', tx - 5, ty + th + 6, tw + 10, 7);
  // ---- deck hands watching the catch come aboard
  figure(ctx, 286, 322, 48, { facing: 1, lean: -0.05, armA: 0.25, foreA: 0.45, armB: 0.15, foreB: 0.30, legA: 0.46, legB: -0.44, kneeA: -0.1, kneeB: 0.1, head: 0.12 }, '#222c3e', '#ffc46a');
  figure(ctx, 338, 324, 45, { facing: 1, lean: 0.08, armA: -0.45, foreA: -0.9, armB: 0.30, foreB: 0.55, legA: -0.42, legB: 0.46, kneeA: 0.1, kneeB: -0.1, head: 0.18 }, '#4a2230', '#ffb45a');
}

// ---- the catch: hand-drawn shrimp, fish and crab bits -----------------------
const HOLD = {};
const CATCH_PAL = {
  k: '#170f07', o: '#0a0704', b: '#0b0b10', W: '#f2f7fa',
  s: '#8a3f33', S: '#b25c44', t: '#d68d68', T: '#f0bc96', u: '#ffe3c6',
  g: '#37424e', G: '#5b6a78', h: '#8b9aa7', H: '#c2d0da', w: '#eef5f8',
  e: '#3d4a2c', E: '#5d7040', f: '#889b60', F: '#bccb92',
  r: '#7d2a20', R: '#ab432c', q: '#d4775a',
  i: '#bcd8e0', I: '#eafaff', y: '#cfc9ad', d: '#6b6450',
};
const CATCH_ART = {
  // shrimp: segmented body, fan tail, antennae, black bead eye
  shrimpStraight: [
    '..kk..............',
    '.kbk.kkkkkkkkkkk..',
    'kTTkkTuTuTuTuTuTk.',
    'kTTTTtStStStStStk.',
    'kTTTtSsSsSsSsSsSTk',
    'kTTTTtStStStStStTk',
    'kTTkkTuTuTuTuTuTTk',
    '.kbk.kkkkkkkkkTTTk',
    '..kk...........kk.',
  ],
  shrimpCurl: [
    '....kkk.....',
    '...kTuTk....',
    '..kTuTtSk...',
    '.kbTuTtSk...',
    '.kkTuTtSk...',
    '...kTuTtSk..',
    '...kTuTtSk..',
    '....kTuTtSk.',
    '....kTuTtSk.',
    '.....kTTtSSk',
    '...kkTTkkkkk',
    '...kTTk.....',
    '...kkk......',
  ],
  shrimpSmall: [
    '..kkk...',
    '.kTuTk..',
    'kbTuTSk.',
    'kkTuTSk.',
    '..kTuTSk',
    '..kTTtSk',
    '..kkTTkk',
    '....kk..',
  ],
  // fish: forked tail left, head and eye right, pale belly
  fishSilver: [
    'kk.......kkkk.....',
    'kHkk...kkHHHHkk...',
    'kHHHk.kHHhhhhhHk..',
    'kHHHHkkHhhGGGGhHk.',
    'kHHHHHHhhGGGGGGhHk',
    'kHHHHkkHhhGGGbGhHk',
    'kHHHk.kHHhhGGGGhhk',
    'kHkk...kkHwwwwwhkk',
    'kk.......kkkkkkkk.',
  ],
  fishSilverSm: [
    'kk....kkk..',
    'kHk.kkHHHkk',
    'kHHkkHhhhHk',
    'kHHHHhGbGhk',
    'kHHkkHhhwhk',
    'kHk.kkHwwkk',
    'kk....kkkk.',
  ],
  fishOlive: [
    'kk......kkk.....',
    'kFkk..kkFFFkk...',
    'kFFFkkFFfffFFk..',
    'kFFFFFFffEEEfFk.',
    'kFFFFFffEEEbEfFk',
    'kFFFFFFffEEEEfFk',
    'kFFFkkFFffEEffk.',
    'kFkk..kkFwwwwfk.',
    'kk......kkkkkkk.',
  ],
  // a big one gone belly up: pale side up, dull clouded eye
  fishDeadBig: [
    'kk........kkkkkkkk......',
    'kwkk....kkwwwwwwwwkk....',
    'kwwwkkkkwwwwwwwwwwwwkk..',
    'kwwwwwwwwwwwwwwwwwwwwwk.',
    'kwwwwwwwwwwwwwwwwwwwwwwk',
    'kwwwwwwwwwwwwwwwyyywwwdk',
    'kwwwwwwwhhhhhhhhyWywhhdk',
    'kwwwkkkkhGGGGGGGyyyGGhdk',
    'kwkk....kGGGGGGGGGGGGgk.',
    'kk........kkGGGGGGGGkk..',
    '............kkkkkkkk....',
  ],
  crabClaw: [
    '..kkk.....',
    '.kqqRk....',
    'kqqRRrk...',
    'kqRRrrkk..',
    'kkRrrk.kk.',
    '.kRrrkkqRk',
    '.kRRrrqqRk',
    '..kRRRRRk.',
    '...kkRRk..',
    '.....kk...',
  ],
  crabShell: [
    '.kk....kk.',
    'kRRkkkkRRk',
    'kRqqqqqqRk',
    'kRqbqqbqRk',
    'kRqqqqqqRk',
    'kRRqqqqRRk',
    '.kRRRRRRk.',
    '..kkkkkk..',
  ],
  fleckA: ['kkk', 'kIk', 'kkk'],
  fleckB: ['kk.', 'kIk', '.kk'],
  fleckC: ['.kk.', 'kIIk', 'kiIk', '.kk.'],
};
const CATCH = { all: [], big: [], fleck: [], small: [] };
function buildCatchSprites() {
  if (CATCH.all.length) return CATCH;
  const mk = rows => makeSprite(rows, { pal: CATCH_PAL });
  const AR = CATCH_ART;
  CATCH.byName = {};
  for (const k in AR) CATCH.byName[k] = mk(AR[k]);
  // the mix that makes up the bulk of a heap: plenty of shrimp, fewer fish
  CATCH.all = [
    CATCH.byName.shrimpCurl, CATCH.byName.shrimpCurl, CATCH.byName.shrimpCurl,
    CATCH.byName.shrimpStraight, CATCH.byName.shrimpStraight,
    CATCH.byName.shrimpSmall, CATCH.byName.shrimpSmall, CATCH.byName.shrimpSmall,
    CATCH.byName.fishSilver, CATCH.byName.fishSilverSm, CATCH.byName.fishSilverSm,
    CATCH.byName.fishOlive, CATCH.byName.crabClaw, CATCH.byName.crabShell,
  ];
  CATCH.big = [CATCH.byName.fishDeadBig, CATCH.byName.fishSilver, CATCH.byName.fishOlive];
  CATCH.fleck = [CATCH.byName.fleckA, CATCH.byName.fleckB, CATCH.byName.fleckC];
  CATCH.small = [CATCH.byName.shrimpSmall, CATCH.byName.shrimpCurl, CATCH.byName.fishSilverSm, CATCH.byName.crabClaw];
  return CATCH;
}
// ---- the heap --------------------------------------------------------------
// Surfaces are in screen space: the back heap rises behind her, the front lip
// buries her to the shoulders.
function pileBackTop(x) {
  return 190 + 44 * Math.exp(-Math.pow((x - 300) / 215, 2)) + Math.sin(x * 0.047) * 5 + vnoise(x * 0.018, 3.5) * 10;
}
function pileFrontTop(x) {
  return 232 + 32 * Math.exp(-Math.pow((x - 300) / 210, 2))
    + 20 * Math.exp(-Math.pow((x - 322) / 86, 2))
    + Math.sin(x * 0.062 + 1.4) * 4 + vnoise(x * 0.022, 7.5) * 8;
}
function pileThinTop(x) {
  return 318 + 14 * Math.exp(-Math.pow((x - 300) / 230, 2)) + Math.sin(x * 0.05) * 3;
}
function buildPileLayer(topFn, yOff, H, seed, count, opts) {
  opts = opts || {};
  const c = can(640, H), x = cx2(c), rng = new SeededRandom(seed);
  // packed mass under the surface, so the heap reads as deep instead of hollow
  for (let px2 = 0; px2 < 640; px2++) {
    const t0 = R(topFn(px2) - yOff);
    for (let y = Math.max(0, t0 + 2); y < H; y++) {
      const dd = (y - t0) / Math.max(8, H - t0);
      const n = vnoise(px2 * 0.055, y * 0.075);
      P(x, n > 0.60 ? (dd > 0.55 ? '#3a2c1e' : '#55402b') : n > 0.38 ? (dd > 0.55 ? '#2b2016' : '#3f3021') : '#211809', px2, y);
    }
  }
  // the bulk: overlapping sprites, sorted back to front
  const list = [];
  for (let i = 0; i < count; i++) {
    const px2 = rng.range(-10, 650);
    const t0 = topFn(px2) - yOff;
    const d = Math.pow(rng.next(), 0.62) * Math.max(6, H - t0);
    list.push({ x: px2, y: t0 + d - 3, r: rng.range(-3.15, 3.15), f: rng.next() > 0.5, s: rng.int(0, CATCH.all.length - 1) });
  }
  // a handful of big dead fish lying across the heap
  for (let i = 0; i < (opts.big === undefined ? 7 : opts.big); i++) {
    const px2 = rng.range(0, 640), t0 = topFn(px2) - yOff;
    list.push({ x: px2, y: t0 + rng.range(2, 26), r: rng.range(-0.6, 0.6), f: rng.next() > 0.5, big: rng.int(0, CATCH.big.length - 1) });
  }
  list.sort((a, b) => a.y - b.y);
  for (const o of list) {
    const sp = o.big !== undefined ? CATCH.big[o.big] : CATCH.all[o.s];
    x.save(); x.translate(R(o.x), R(o.y)); x.rotate(o.r); if (o.f) x.scale(-1, 1);
    x.drawImage(sp.c, -sp.ax, -sp.ay); x.restore();
  }
  // ice and scale flecks caught in the heap
  for (let i = 0; i < count * 0.22; i++) {
    const px2 = rng.range(0, 640), t0 = topFn(px2) - yOff;
    const sp = CATCH.fleck[rng.int(0, CATCH.fleck.length - 1)];
    x.save(); x.translate(R(px2), R(t0 + Math.pow(rng.next(), 0.5) * Math.max(6, H - t0))); x.rotate(rng.range(0, 3.14));
    x.drawImage(sp.c, -sp.ax, -sp.ay); x.restore();
  }
  // wet sheen along the crest, slime pooling low down, a dark stain at the foot
  for (let px2 = 0; px2 < 640; px2++) {
    const t0 = R(topFn(px2) - yOff);
    for (let y = Math.max(0, t0); y < Math.min(H, t0 + 14); y++) if (hash2(px2 * 3, y * 5) > 0.93) P(x, '#dfeccb', px2, y, 1 + (px2 & 1), 1);
    for (let y = H - 26; y < H; y++) if (hash2(px2, y) > 0.88) P(x, '#2e3a1c', px2, y, 2, 1);
  }
  x.fillStyle = rgbaq('#0d0a06', 0.34); x.fillRect(0, H - 14, 640, 14);
  x.fillStyle = rgbaq('#0d0a06', 0.18); x.fillRect(0, H - 30, 640, 16);
  for (let i = 0; i < 26; i++) {
    const px2 = R(rng.range(0, 640)), t0 = R(topFn(px2) - yOff);
    x.fillStyle = rgbaq('#e8f4d0', 0.16);
    x.fillRect(px2, t0 + R(rng.range(0, 20)), 1, R(rng.range(6, 26)));
  }
  return c;
}
// ---- loose catch that slides, rains in and scatters ------------------------
function looseAdd(list, o) { if (list.length < 340) list.push(o); }
function looseSpawnRain(list) {
  looseAdd(list, {
    x: rand(252, 332), y: 38, vx: rand(-22, 22), vy: rand(70, 170),
    r: rand(0, TAU), vr: rand(-8, 8), s: randi(0, CATCH.all.length - 1),
    f: Math.random() > 0.5, rest: 0, hop: 0,
  });
}
function looseUpdate(list, dt, surfFn, t) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.dead) { list.splice(i, 1); continue; }
    if (p.rest < 1) {
      p.vy += 660 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      const sy = surfFn(p.x);
      if (p.y >= sy && p.vy > 0) {
        p.y = sy;
        p.hop++;
        p.vy = -p.vy * (p.hop > 2 ? 0.10 : 0.30);
        p.vx *= 0.52; p.vr *= 0.45;
        if (Math.abs(p.vy) < 34 || p.hop > 3) { p.rest = 1; p.vy = 0; p.slide = rand(0.6, 1.5); }
      }
      if (p.x < -30 || p.x > 670 || p.y > 400) p.dead = true;
    } else {
      // settle: creep down the slope until it is shallow enough to hold
      const sl = (surfFn(p.x + 5) - surfFn(p.x - 5)) / 10;
      if (p.slide > 0) {
        p.slide -= dt;
        p.x -= sl * 52 * dt;
        p.r += sl * 1.4 * dt;
      }
      p.y = surfFn(p.x);
      if (p.twitch === undefined && Math.random() < 0.12 * dt) p.twitch = 0.22;
      if (p.twitch > 0) { p.twitch -= dt; p.r += Math.sin(t * 40) * 2.2 * dt; if (p.twitch <= 0) p.twitch = undefined; }
    }
  }
  while (list.length > 320) list.shift();
}
function looseRender(ctx, list) {
  for (const p of list) {
    const sp = CATCH.all[p.s]; if (!sp) continue;
    ctx.save(); ctx.translate(R(p.x), R(p.y)); ctx.rotate(p.r); if (p.f) ctx.scale(-1, 1);
    ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.restore();
  }
}
function pileBurst(list, cx0, cy0, n) {
  for (let i = 0; i < n; i++) {
    const px2 = rand(20, 620);
    const py = lerp(pileFrontTop(px2), 356, Math.pow(Math.random(), 0.6));
    const a = angleTo(cx0, cy0, px2, py) + rand(-0.5, 0.5);
    const sp = rand(120, 470) * (1 - Math.min(0.7, dist(cx0, cy0, px2, py) / 620));
    looseAdd(list, {
      x: px2, y: py, vx: Math.cos(a) * sp + rand(40, 180), vy: Math.sin(a) * sp - rand(60, 260),
      r: rand(0, TAU), vr: rand(-13, 13), s: randi(0, CATCH.all.length - 1),
      f: Math.random() > 0.5, rest: 0, hop: 0,
    });
  }
}
function buildHoldBG() {
  const c = can(640, 360), x = cx2(c);
  const W = ['#0e0b08', '#16110c', '#1f1711', '#2b2018', '#3a2c20'];
  // back wall planking
  for (let y = 0; y < 360; y++) {
    const b = ((y % 13) === 0) ? 0 : ((y % 13) < 4 ? 2 : 1);
    for (let px2 = 0; px2 < 640; px2++) {
      const n = vnoise(px2 * 0.03, y * 0.05);
      P(x, W[clamp(b + (n > 0.62 ? 1 : n < 0.34 ? -1 : 0), 0, 4)], px2, y);
    }
  }
  // hull frames
  for (let fx = -20; fx < 660; fx += 96) {
    const lean = (fx - 320) * 0.035;
    for (let y = 0; y < 360; y++) {
      const px2 = R(fx + lean * (1 - y / 360) * 6);
      P(x, IP.ink, px2 - 1, y, 16, 1);
      P(x, W[3], px2, y, 13, 1);
      P(x, W[4], px2, y, 3, 1);
      P(x, W[0], px2 + 11, y, 2, 1);
    }
    for (let y = 26; y < 360; y += 58) {
      P(x, IP.ink, R(fx) - 3, y, 20, 7); P(x, '#4a525e', R(fx) - 2, y + 1, 18, 5);
      P(x, '#767f8d', R(fx) - 2, y + 1, 18, 2);
      for (let i = 0; i < 3; i++) { P(x, '#9aa4b0', R(fx) + 1 + i * 6, y + 3, 2, 2); P(x, IP.ink, R(fx) + 1 + i * 6, y + 5, 2, 1); }
    }
  }
  // overhead deck beams, with a hatch gap around x 250..332
  P(x, IP.ink, 0, 0, 640, 46);
  for (let px2 = 0; px2 < 640; px2++) {
    if (px2 > 250 && px2 < 332) continue;
    for (let y = 0; y < 44; y++) {
      const b = ((y % 9) === 0) ? 0 : ((y % 9) < 3 ? 2 : 1);
      P(x, W[b], px2, y);
    }
  }
  for (const bx of [40, 150, 360, 470, 580]) {
    P(x, IP.ink, bx - 2, 0, 26, 52); P(x, W[3], bx, 0, 22, 50); P(x, W[4], bx, 0, 22, 3);
    P(x, W[0], bx + 18, 0, 4, 50);
    P(x, IP.ink, bx + 2, 40, 18, 8); P(x, '#4a525e', bx + 3, 41, 16, 6); P(x, '#8c97a8', bx + 3, 41, 16, 2);
  }
  // stacked crates in the background
  const rng = new SeededRandom(8181);
  for (let i = 0; i < 7; i++) {
    const bx = R(rng.range(-20, 600)), by = R(rng.range(120, 250)), bw = R(rng.range(54, 96)), bh = R(rng.range(44, 70));
    P(x, IP.ink, bx, by, bw, bh);
    P(x, '#2e2418', bx + 1, by + 1, bw - 2, bh - 2);
    for (let j = 1; j < 5; j++) P(x, '#1c150d', bx + 1, by + R(j * bh / 5), bw - 2, 2);
    P(x, '#3d2f1e', bx + 1, by + 1, bw - 2, 2);
    P(x, '#191209', bx + 1, by + bh - 4, bw - 2, 3);
  }
  // hanging chain, hooks, coiled rope
  for (let y = 44; y < 150; y += 6) { P(x, IP.ink, 549, y, 7, 5); P(x, '#5d6675', 550, y + 1, 5, 3); P(x, '#9aa6b6', 550, y + 1, 5, 1); }
  P(x, IP.ink, 546, 150, 13, 16); P(x, '#767f8d', 547, 151, 11, 14); P(x, '#2a3038', 550, 158, 5, 7);
  for (let y = 44; y < 96; y += 5) { P(x, '#6a5330', 92, y, 3, 4); P(x, '#8a6a3a', 92, y, 1, 4); }
  for (let i = 0; i < 5; i++) { P(x, IP.ink, 76, 96 + i * 7, 36, 8); P(x, '#8a6a3a', 77, 97 + i * 7, 34, 6); P(x, '#b08a4c', 77, 97 + i * 7, 34, 2); }
  // barrels
  for (const [bx, by] of [[186, 216], [222, 226]]) {
    P(x, IP.ink, bx, by, 34, 56); P(x, '#4a3520', bx + 1, by + 1, 32, 54);
    P(x, '#6b4d2c', bx + 1, by + 1, 32, 4); P(x, '#2c1f10', bx + 1, by + 50, 32, 5);
    for (const ry of [10, 26, 42]) { P(x, '#5d6675', bx + 1, by + ry, 32, 4); P(x, '#9aa6b6', bx + 1, by + ry, 32, 1); }
  }
  // bilge water + drain
  for (let y = 330; y < 360; y++) for (let px2 = 0; px2 < 640; px2++) {
    const n = vnoise(px2 * 0.05, y * 0.2 + 3);
    P(x, n > 0.56 ? '#22301f' : n > 0.36 ? '#18220f' : '#10170a', px2, y);
  }
  P(x, IP.ink, 0, 328, 640, 2);
  P(x, IP.ink, 400, 336, 44, 20); P(x, '#2a3038', 401, 337, 42, 18);
  for (let i = 0; i < 5; i++) P(x, '#5d6675', 404 + i * 8, 338, 3, 16);
  // slime streaks down the wall
  for (let i = 0; i < 40; i++) {
    const sx = R(hash2(i * 7, 3) * 640), sy = R(hash2(i * 3, 11) * 300);
    x.fillStyle = rgbaq('#4b5c34', qa(0.10 + hash2(i, 5) * 0.12));
    x.fillRect(sx, sy, 1 + (i % 3), R(12 + hash2(i, 9) * 60));
  }
  return c;
}
function buildCrateWall() {
  const c = can(640, 360), x = cx2(c);
  const board = (bx, bw) => {
    for (let px2 = bx; px2 < bx + bw && px2 < 640; px2++) {
      if (px2 < 0) continue;
      const u = (px2 - bx) / bw;
      for (let y = 0; y < 360; y++) {
        const n = vnoise(px2 * 0.09, y * 0.02) * 0.6 + 0.2;
        const edge = px2 === bx || px2 === bx + bw - 1;
        const shade = u < 0.12 ? 1 : u > 0.86 ? -1 : 0;
        let col = edge ? '#130d06'
          : shade > 0 ? (n > 0.42 ? '#5a4429' : '#4c3922')
            : shade < 0 ? (n > 0.42 ? '#2a1f13' : '#221a0f')
              : (n > 0.5 ? '#44331f' : n > 0.34 ? '#3a2b1a' : '#312414');
        if ((y % 71) < 2 && !edge) col = '#1b1309';
        P(x, col, px2, y);
      }
      // grain
      for (let y = 0; y < 360; y += 13) if (hash2(px2, y) > 0.86) P(x, '#251b0f', px2, y + R(hash2(px2, 3) * 8), 1, 3);
    }
    // nails
    for (const ny of [30, 128, 232, 330]) { P(x, IP.ink, bx + 3, ny, 3, 3); P(x, '#8c97a8', bx + 4, ny + 1, 2, 2); P(x, IP.ink, bx + bw - 6, ny, 3, 3); P(x, '#8c97a8', bx + bw - 5, ny + 1, 2, 2); }
  };
  for (let bx = -12; bx < 660; bx += 42) {
    if (bx > 484 && bx < 520) continue;                 // the loose board lives here
    board(bx, 33);
  }
  // heavy corner posts, in front of everything
  for (const [bx, bw] of [[0, 30], [610, 30]]) {
    for (let px2 = bx; px2 < bx + bw; px2++) for (let y = 0; y < 360; y++) {
      const u = (px2 - bx) / bw, n = vnoise(px2 * 0.07, y * 0.03) * 0.5 + 0.25;
      P(x, (px2 === bx || px2 === bx + bw - 1) ? IP.ink : u < 0.18 ? '#3a2b1a' : u > 0.8 ? '#150f08' : n > 0.45 ? '#2a1f12' : '#211809', px2, y);
    }
    for (let y = 18; y < 360; y += 64) { P(x, IP.ink, bx + 2, y, bw - 4, 9); P(x, '#4a525e', bx + 3, y + 1, bw - 6, 7); P(x, '#8c97a8', bx + 3, y + 1, bw - 6, 2); }
  }
  // top rail band under the deck beams
  for (let px2 = 0; px2 < 640; px2++) for (let y = 45; y < 61; y++) {
    const n = vnoise(px2 * 0.05, y * 0.06) * 0.5 + 0.25;
    P(x, y < 48 ? '#503c24' : y > 57 ? '#241a0e' : (n > 0.45 ? '#3e2e1b' : '#342715'), px2, y);
  }
  P(x, IP.ink, 0, 44, 640, 2); P(x, IP.ink, 0, 60, 640, 2);
  return c;
}
function buildLooseBoard() {
  const c = can(36, 360), x = cx2(c);
  for (let px2 = 0; px2 < 33; px2++) {
    const u = px2 / 33;
    for (let y = 0; y < 360; y++) {
      const n = vnoise((px2 + 486) * 0.09, y * 0.02) * 0.6 + 0.2;
      const edge = px2 === 0 || px2 === 32;
      P(x, edge ? '#130d06' : u < 0.12 ? (n > 0.42 ? '#5a4429' : '#4c3922') : u > 0.86 ? (n > 0.42 ? '#2a1f13' : '#221a0f') : (n > 0.5 ? '#44331f' : n > 0.34 ? '#3a2b1a' : '#312414'), px2, y);
    }
  }
  for (const ny of [30, 128, 232, 330]) { P(x, IP.ink, 3, ny, 3, 3); P(x, '#8c97a8', 4, ny + 1, 2, 2); }
  return spr(c, 16, 180);
}
function buildBulb() {
  const c = can(13, 20), x = cx2(c);
  P(x, '#2a2018', 6, 0, 1, 7);
  P(x, IP.ink, 3, 6, 7, 6); P(x, '#767f8d', 4, 7, 5, 4); P(x, '#c0cad6', 4, 7, 5, 1);
  for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) {
    const d = Math.hypot(xx / 5, yy / 5.4);
    if (d > 1) continue;
    P(x, d > 0.86 ? IP.ink : d > 0.55 ? '#e8d27a' : '#fff6cc', 6 + xx, 14 + yy);
  }
  P(x, '#ff9a3c', 5, 13, 1, 3); P(x, '#ff9a3c', 7, 13, 1, 3); P(x, '#fff6cc', 6, 12, 1, 2);
  return spr(c, 6, 0);
}
// One baked lighting pass for the hold: a single warm lamp burning a pool out
// of a cold blue-steel dark.  Posterised into hard bands, dithered at the
// seams, blitted once per frame.  This is the only place in the cinematic
// that is not daylight, and it is meant to be: it is the inside of a boat.
function buildHoldLight() {
  const c = can(640, 360), x = cx2(c), img = x.createImageData(640, 360), d = img.data;
  const WARM = ['#fff4d2', '#ffe2a0', '#ffbe63', '#e8853a', '#b4552a'];
  const COLD = ['#5f97cc', '#4478ae', '#2d5c90', '#1b3f70', '#0d2448'];
  const W = WARM.map(hexToRgb), C = COLD.map(hexToRgb);
  const LX = 168, LY = 152, RX = 430, RY = 360;
  for (let y = 0; y < 360; y++) {
    for (let px = 0; px < 640; px++) {
      // distance from the lamp, banded into hard steps and dithered
      const raw = Math.sqrt(Math.pow((px - LX) / RX, 2) + Math.pow((y - LY) / RY, 2));
      const f = clamp(raw, 0, 1.6) * 9;
      const i0 = Math.floor(f), fr = f - i0;
      const band = clamp((fr > bay(px, y) ? i0 + 1 : i0) / 9, 0, 1.6);
      let col, a;
      if (band < 0.62) {                       // inside the lamp's reach
        const k = band / 0.62 * (W.length - 1);
        const j = clamp(Math.floor(k), 0, W.length - 2), kf = k - j;
        const c0 = W[j], c1 = W[j + 1];
        col = [R(c0[0] + (c1[0] - c0[0]) * kf), R(c0[1] + (c1[1] - c0[1]) * kf), R(c0[2] + (c1[2] - c0[2]) * kf)];
        a = 0.40 * Math.pow(1 - band / 0.62, 1.15);
      } else {                                  // the cold dark beyond it
        const k = clamp((band - 0.62) / 0.78, 0, 1) * (C.length - 1);
        const j = clamp(Math.floor(k), 0, C.length - 2), kf = k - j;
        const c0 = C[j], c1 = C[j + 1];
        col = [R(c0[0] + (c1[0] - c0[0]) * kf), R(c0[1] + (c1[1] - c0[1]) * kf), R(c0[2] + (c1[2] - c0[2]) * kf)];
        a = 0.14 + 0.54 * clamp((band - 0.62) / 0.78, 0, 1);
      }
      // the bilge at the bottom stays coldest of all
      if (y > 320) a += (y - 320) / 40 * 0.10;
      const aq = clamp(a, 0, 1) * 16, ai = Math.floor(aq), af = aq - ai;
      const A = clamp((af > bay(px + 1, y + 2) ? ai + 1 : ai) / 16, 0, 1);
      if (A <= 0) continue;
      const q = (y * 640 + px) * 4;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = R(A * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
function holdArt() {
  if (HOLD.bg) return HOLD;
  buildCatchSprites();
  HOLD.bg = buildHoldBG();
  HOLD.wall = buildCrateWall();
  HOLD.board = buildLooseBoard();
  {  // short broken plank used for flying debris
    const pc = can(34, 104), px3 = cx2(pc);
    px3.drawImage(HOLD.board.c, -1, -90);
    for (let i = 0; i < 6; i++) { const yy = i & 1 ? 0 : 103; P(px3, IP.ink, 4 + i * 5, yy, 4, 2); P(px3, '#8a6a3a', 4 + i * 5, yy === 0 ? 2 : 101, 4, 1); }
    HOLD.plank = spr(pc, 16, 52);
  }
  HOLD.pileBack = buildPileLayer(pileBackTop, 180, 184, 1717, 780, { big: 9 });
  HOLD.pileFront = buildPileLayer(pileFrontTop, 228, 136, 9292, 520, { big: 6 });
  HOLD.pileThin = buildPileLayer(pileThinTop, 310, 54, 3131, 180, { big: 3 });
  HOLD.bulb = buildBulb();
  HOLD.light = buildHoldLight();
  return HOLD;
}
// ---- the hole she goes out through, and the light in the hold --------------
function hullHole(ctx, x, y, r, seed) {
  for (let yy = -r; yy <= r; yy++) {
    const k = Math.sqrt(Math.max(0, 1 - (yy / r) * (yy / r)));
    const w = r * k * (0.80 + hash2(seed, yy + 128) * 0.32);
    if (w < 1) continue;
    P(ctx, '#0a0806', R(x - w), R(y + yy * 0.9), R(w * 2), 2);
  }
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * TAU;
    const r0 = r * (0.78 + hash2(seed + i, 3) * 0.16);
    const r1 = r * (0.98 + hash2(seed + i, 7) * 0.22);
    const ax0 = x + Math.cos(a) * r0, ay0 = y + Math.sin(a) * r0 * 0.9;
    const ax1 = x + Math.cos(a) * r1, ay1 = y + Math.sin(a) * r1 * 0.9;
    const bw = 2 + hash2(seed + i, 11) * 2;
    tri(ctx, IP.ink, ax0, ay0 - bw - 1, ax0, ay0 + bw + 1, ax1, ay1);
    tri(ctx, hash2(i, seed) > 0.5 ? '#8a5f2f' : '#6b4a2a', ax0, ay0 - bw, ax0, ay0 + bw, ax1 - Math.cos(a), ay1 - Math.sin(a));
  }
}
// a pool of light without a gradient in it: concentric hand-rasterized discs
// on quantized alphas, biggest and faintest first
function glowPatch(ctx, x, y, rx, ry, col, a0, steps) {
  for (let i = steps; i >= 1; i--) {
    const k = i / steps, a = qa(a0 * (1 - k) * (1 - k) + a0 * 0.08);
    if (a <= 0) continue;
    ctx.fillStyle = rgbaq(col, a);
    const RX = rx * k, RY = ry * k;
    for (let yy = -RY; yy <= RY; yy += 2) {
      const w = Math.sqrt(Math.max(0, 1 - (yy / RY) * (yy / RY))) * RX;
      if (w < 1) continue;
      ctx.fillRect(R(x - w), R(y + yy), R(w * 2), 2);
    }
  }
}
function slatShaft(ctx, x0, x1, y0, y1, lean, a0, col) {
  for (let y = y0; y < y1; y += 2) {
    const k = (y - y0) / (y1 - y0);
    const a = qa(a0 * (1 - k) * (1 - k));
    if (a <= 0) continue;
    ctx.fillStyle = rgbaq(col || '#ffe9b0', a);
    const off = R(lean * (y - y0));
    ctx.fillRect(R(x0 + off - k * 8), y, R((x1 - x0) + k * 16), 2);
  }
}
// vision closing down to nothing: a hard-edged iris, drawn in two steps so the
// rim reads as a band rather than a blur
function aperture(ctx, k) {
  if (k <= 0) return;
  const draw = (rx, ry, a) => {
    if (a <= 0) return;
    ctx.fillStyle = rgbaq('#000000', a);
    for (let y = 0; y < 360; y += 3) {
      const dy = (y - 176) / Math.max(1, ry);
      const w = Math.abs(dy) >= 1 ? 0 : Math.sqrt(1 - dy * dy) * rx;
      const x0 = R(324 - w), x1 = R(324 + w);
      if (x0 > 0) ctx.fillRect(0, y, x0, 3);
      if (x1 < 640) ctx.fillRect(x1, y, 640 - x1, 3);
    }
  };
  draw(430 * (1 - k) + 40, 260 * (1 - k) + 26, 0.5);
  draw(400 * (1 - k), 236 * (1 - k), 1);
  if (k > 0.94) { ctx.fillStyle = rgbaq('#000000', (k - 0.94) / 0.06); ctx.fillRect(0, 0, 640, 360); }
}
// her own lids, opening for the first time in the hold
function eyelids(ctx, open) {
  if (open >= 1) return;
  const o = clamp(open, 0, 1);
  for (let x = 0; x < 640; x += 4) {
    const u = (x - 320) / 348;
    const cv = Math.pow(Math.max(0, 1 - u * u), 0.55);
    const half = 180 * o * cv;
    const top = R(180 - half), bot = R(180 + half);
    P(ctx, '#000000', x, 0, 4, Math.max(0, top));
    P(ctx, '#000000', x, bot, 4, Math.max(0, 360 - bot));
    if (half > 2) { P(ctx, '#0d0a08', x, top, 4, 2); P(ctx, '#0d0a08', x, bot - 2, 4, 2); }
  }
}
// ---- the crate, from the inside --------------------------------------------
function crateScene(ctx, t, o) {
  const H = holdArt();
  ctx.drawImage(H.bg, 0, 0);
  // hatch light from the deck gap, plus the swinging bulb beyond the slats
  const sw = R(Math.sin(t * 1.1) * 16);
  slatShaft(ctx, 252, 330, 44, 320, 0.10, 0.20 + (o.hatch || 0) * 0.34);
  glowPatch(ctx, 150 + sw, 120, 150, 122, '#ffdf9a', 0.26, 5);
  // the crate itself
  ctx.drawImage(H.wall, 0, 0);
  if (!o.boardOff) ctx.drawImage(H.board.c, 486, 0);
  else {
    ctx.save(); ctx.translate(R(502 + (o.boardOff.x || 0)), R(190 + (o.boardOff.y || 0)));
    ctx.rotate(o.boardOff.r || 0); ctx.drawImage(H.plank.c, -H.plank.ax, -H.plank.ay); ctx.restore();
  }
  // light bleeding through the slat gaps
  for (let gx = -12; gx < 660; gx += 42) {
    if (gx > 484 && gx < 520 && !o.boardOff) continue;
    ctx.fillStyle = rgbaq('#ffe1a4', 0.10);
    ctx.fillRect(gx + 33, 62, 9, 298);
    ctx.fillStyle = rgbaq('#ffe1a4', 0.05);
    ctx.fillRect(gx + 31, 62, 2, 298); ctx.fillRect(gx + 42, 62, 2, 298);
  }
  // hatch mouth overhead, open when they are tipping more catch in
  if (o.hatch) {
    ctx.fillStyle = rgbaq('#ffeec2', qa(0.22 * o.hatch));
    ctx.fillRect(252, 0, 78, 46);
    P(ctx, '#ffe9b0', 252, 44, 78, 2);
    for (let i = 0; i < 3; i++) { const bx = 262 + i * 24; P(ctx, IP.ink, bx, 0, 14, R(16 + Math.sin(t * 6 + i) * 3)); }
  }
  // the bulb, swinging on its cord beyond the slats
  ctx.save(); ctx.translate(R(150 + sw), 44); ctx.rotate(Math.sin(t * 1.1) * 0.16);
  ctx.drawImage(H.bulb.c, -H.bulb.ax, -H.bulb.ay); ctx.restore();
  // the catch: the heap she is half buried in, inside the slats
  ctx.drawImage(o.thin ? H.pileThin : H.pileBack, 0, o.thin ? 310 : 180);
}
// the hold's lamp, laid over everything in the crate so she and the heap sit
// in the same pool of light
function holdLight(ctx) { ctx.drawImage(holdArt().light, 0, 0); }
function cratePileFront(ctx, thin) {
  if (thin) return;
  ctx.drawImage(holdArt().pileFront, 0, 228);
}

// ================================================================= BEATS ====
//  Five of them, in daylight, told in speech.  The old thirteen ran two
//  minutes through dusk, night and a red sunset and said everything in
//  narration captions; this says what the player needs -- she had a family,
//  the fleet took them, the otter turned up -- in about half a minute, out of
//  the mouths of the two animals the player is about to be handed.
const A = {};
const SC = {};
const BEATS = [];

// ---------------------------------------------------------------- DIALOGUE
//  One speech track for the whole cinematic.  A beat lists its lines as
//  [time, who, text] and says where that speaker's bubble hangs; everything
//  else -- the blip, the typing, the grow-in, the fade, the mouth flapping --
//  is driven from here, so a beat never repeats it.
const SAY = { i: -1, last: -2, who: null, typing: false, x: 320, y: 110, dir: 1, snap: true, mouth: 0 };
const CPS = 27;                                   // characters a second
function sayType(text) { return text.length / CPS; }
function sayLife(text) { return 0.42 + sayType(text) + 1.5; }
function sayReset() { SAY.i = -1; SAY.last = -2; SAY.who = null; SAY.typing = false; SAY.snap = true; SAY.mouth = 0; }
function sayUpdate(b, bt, dt) {
  const L = b.talk;
  let cur = -1;
  if (L) for (let i = 0; i < L.length; i++) if (bt >= L[i][0] && bt < L[i][0] + sayLife(L[i][2])) cur = i;
  if (cur !== SAY.i) { SAY.i = cur; SAY.snap = true; }
  if (cur < 0) { SAY.who = null; SAY.typing = false; return; }
  const line = L[cur], e = bt - line[0];
  SAY.who = line[1];
  SAY.typing = e > 0.08 && e < sayType(line[2]) + 0.08;
  SAY.mouth += dt * (SAY.typing ? 11 : 0);
  if (SAY.last !== cur) {
    SAY.last = cur;
    if (typeof Audio_ !== 'undefined') Audio_.tone(SAY.who === 'otter' ? 340 : SAY.who === 'man' ? 160 : 230, 0.05, 'square', 0.055);
  }
  if (SAY.typing && Math.random() < 11 * dt && typeof Audio_ !== 'undefined') {
    Audio_.tone((SAY.who === 'otter' ? 520 : SAY.who === 'man' ? 240 : 340) + rand(0, 70), 0.025, 'square', 0.035);
  }
  const a = b.anchor ? b.anchor(SAY.who) : [320, 110, 1];
  if (SAY.snap) { SAY.x = a[0]; SAY.y = a[1]; SAY.snap = false; }
  else { SAY.x = smooth(SAY.x, a[0], 9, dt); SAY.y = smooth(SAY.y, a[1], 9, dt); }
  SAY.dir = a[2];
}
function sayRender(ctx, b, bt) {
  if (SAY.i < 0 || !b.talk) return;
  const line = b.talk[SAY.i], e = bt - line[0];
  // in on a spring, out on a quantized alpha.  Scaling it back down left an
  // empty box on screen for three frames with the words already gone.
  const grow = outBack(clamp(e / 0.20, 0, 1));
  const gone = ss(clamp((line[0] + sayLife(line[2]) - bt) / 0.22, 0, 1));
  const prog = clamp((e - 0.09) / Math.max(0.12, sayType(line[2])), 0, 1);
  if (gone >= 0.999) { bubble(ctx, SAY.x, SAY.y, line[2], SAY.dir, line[1], prog, grow); return; }
  ctx.save(); ctx.globalAlpha = qa(gone);
  bubble(ctx, SAY.x, SAY.y, line[2], SAY.dir, line[1], prog, 1);
  ctx.restore();
}
// is this actor the one currently speaking?
function talking(who) { return SAY.who === who && SAY.typing; }

// ---- one boat on the surface, with its wash ---------------------------------
function drawBoat(ctx, x, y, rot, propA, churn, t) {
  ctx.save(); ctx.translate(R(x), R(y)); ctx.rotate(rot || 0);
  ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay);
  drawProp(ctx, BOAT.prop[0], BOAT.prop[1], 15, propA, churn);
  ctx.restore();
  if (churn > 0) drawChurn(ctx, x + BOAT.prop[0], y + BOAT.prop[1], t, churn);
}
// the shadow a hull throws down through sunlit water: flat posterized bands,
// widest and darkest right under the keel
function hullShade(ctx, x, y, w, h, a) {
  if (a <= 0) return;
  const rows = 15, rh = R(h / rows) + 1;
  for (let i = 0; i < rows; i++) {
    const k = i / rows;
    const al = a * (1 - k) * (1 - k) * 0.30;
    if (al <= 0.03) continue;
    ctx.fillStyle = rgbaq('#0b3a52', al);
    // thin bands with a bite out of either end, so the column of shade has a
    // broken edge instead of reading as a rectangle laid over the water
    const ww = w * (1 + k * 0.9);
    const l = R(x - ww / 2 + (hash2(i, 3) - 0.5) * 16);
    const r = R(x + ww / 2 + (hash2(i, 7) - 0.5) * 16);
    ctx.fillRect(l, R(y + k * h), Math.max(1, r - l), rh);
  }
}

// ------------------------------------------------------------------ 1. HOME
//  Bright, shallow, warm and SAFE.  This beat used to be played over a reef
//  baked full of ribcages and spent harpoons with a gutted fish bleeding
//  down through the sunlight, and her mother snapped at her in it.  None of
//  that is here now: the reef is the clean one, the family is whole, and not
//  one of the four carries a mark.  Everything that gets done to them is
//  done ON SCREEN, in the beats that follow, so the player watches it
//  arrive instead of finding it already there in frame one.  These are the
//  last seven seconds they get, and they have to be worth losing.
BEATS.push({
  name: 'home', dur: 7.0,
  talk: [
    [1.20, 'mom', 'Stay where I can see you, little one.'],
    [4.20, 'you', 'Watch me! Watch me roll!'],
  ],
  anchor(who) {
    if (who === 'mom') return [A.mom.x + 26, A.mom.y - 30, 1];
    return [A.you.x + 24, A.you.y - 26, 1];
  },
  enter() {
    // Not one `scarred` flag and not one wound in this beat.  All four of
    // them are clean; the fleet has not touched them yet.
    A.dad = actor(MAN.dad, 112, 158, { beat: 0.95, tailAmp: 0.20, exp: 'calm' });
    A.mom = actor(MAN.mom, 456, 218, { beat: 1.00, tailAmp: 0.18, exp: 'calm' });
    A.you = actor(MAN.you, 330, 240, { beat: 1.70 });
    A.bro = actor(MAN.bro, 244, 272, { beat: 2.20 });
    SC.sch1 = makeSchool(14, 520, 128, 62, 0, 1, -22);
    SC.sch2 = makeSchool(9, 110, 286, 44, 1, 3, 17);
    SC.nudge = false; SC.spun = false;
    FX.bubble(A.mom.x + 34, A.mom.y - 10, 4, 0.5);
  },
  update(dt, bt) {
    Intro.scroll += 11 * dt;
    for (const k of ['dad', 'mom', 'you', 'bro']) { swim(A[k], dt); bounce(A[k], dt); }
    // her father, cruising the far side of the meadow, chewed up already
    A.dad.x += 7 * dt;
    A.dad.y = 158 + Math.sin(bt * 0.46) * 7;
    A.dad.rot = Math.sin(bt * 0.38) * 0.05;
    // her mother, anchored, rocking
    A.mom.x = 456 + Math.sin(bt * 0.30) * 9;
    A.mom.y = 218 + Math.sin(bt * 0.56) * 5;
    A.mom.rot = 0.06 + Math.sin(bt * 0.46) * 0.06;
    A.mom.exp = talking('mom') ? 'talk' : 'calm';
    // the calf: in close, snapped at, driven back out, then one hard roll
    const up = ss2(clamp((bt - 1.70) / 1.30, 0, 1));
    const out = ss2(clamp((bt - 3.30) / 0.95, 0, 1));
    const hx = lerp(330, 386, up), hy = lerp(240, 250, up);
    A.you.x = lerp(hx, 296, out) + Math.sin(bt * 0.72) * 3;
    A.you.y = lerp(hy, 252, out) + Math.sin(bt * 1.05) * 4;
    const roll = clamp((bt - 4.55) / 1.10, 0, 1);
    A.you.rot = Math.sin(bt * 1.05 + 1) * 0.09 + TAU * ss2(roll);
    A.you.beat = lerp(1.7, 5.2, Math.sin(clamp(roll, 0, 1) * Math.PI));
    A.you.exp = talking('you') ? 'talk' : (roll > 0 && roll < 1) ? 'wide' : 'calm';
    // A NUZZLE, and nothing else.  This used to be a snap -- mouth open, a
    // hit sound and a screen shake -- which is the opposite of what the
    // opening is for.  Her mother comes in, touches her, and both of them
    // rock off it.  No shake, no hit, one soft note.
    if (!SC.nudge && bt >= 2.85) {
      SC.nudge = true;
      kick(A.you, 4); kick(A.mom, -3);
      FX.bubble(A.mom.x - 24, A.mom.y - 2, 5, 0.6);
      if (typeof Audio_ !== 'undefined') Audio_.tone(280, 0.14, 'sine', 0.05, 60);
    }
    if (!SC.spun && roll >= 1) {
      SC.spun = true;
      kick(A.you, 7); kick(A.bro, 5);
      FX.bubble(A.you.x, A.you.y, 10, 2.1);
      if (typeof Audio_ !== 'undefined') { Audio_.tone(190, 0.08, 'square', 0.05, -90); Audio_.noise(0.16, 0.05, 900, 200); }
    }
    if (roll > 0.12 && roll < 0.94 && Math.random() < 22 * dt) FX.bubble(A.you.x + rand(-18, 18), A.you.y + rand(-12, 12), 1, 1.4);
    // her brother, orbiting her, always a beat behind and chattering
    A.bro.x = A.you.x - 74 + Math.sin(bt * 0.82) * 15;
    A.bro.y = A.you.y + 42 + Math.sin(bt * 1.18) * 11;
    A.bro.rot = Math.sin(bt * 1.18) * 0.20;
    A.bro.exp = (bt % 3.4) > 2.9 ? 'talk' : 'calm';
    if (Math.random() < 0.7 * dt) FX.bubble(A.mom.x + 34, A.mom.y - 6, 1, 0.45);
    if (Math.random() < 0.5 * dt) FX.bubble(A.you.x + 18, A.you.y - 8, 1, 0.45);
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'lagoon', grade: 'lagoon', mid: 'midClean', scroll: Intro.scroll, t: Intro.t, surfY: 64, bedY: 302, shafts: 1, causticBed: true });
    drawAir(ctx, 64, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.dad, Intro.t);
    drawSchool(ctx, SC.sch2, Intro.t, Intro.dt);
    drawManatee(ctx, A.you, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'lagoon', scroll: Intro.scroll, t: Intro.t, bedY: 302 });
    titleCard(ctx, clamp((bt - 0.35) / 5.4, 0, 1), bt);
  },
});

// ------------------------------------------------------------------ 2. RAID
//  The killing, and the only place in the cinematic where any of them picks
//  up a mark.  Every actor walks into this beat CLEAN -- no scars, no wounds
//  -- and leaves it carrying exactly what the fleet put in them: her father
//  and her mother taken on the wire, and a fourth barb through her own flank
//  that goes straight on through.  The steel that stays in is parented to the
//  body it is buried in and rolls with it.
//  Her brother is NOT shot.  The third gun misses him and drives him out
//  into open water, which is where the white boat's net finds him two beats
//  from now: what happens to him is a capture, not a kill.
BEATS.push({
  name: 'raid', dur: 8.0,
  talk: [
    [0.50, 'mom', 'Under the reef! GO!'],
    [2.60, 'bro', 'It missed me! RUN!'],
    [4.35, 'you', 'MAMA!'],
  ],
  anchor(who) {
    if (who === 'mom') return [clamp(A.mom.x + 16, 70, 570), A.mom.y - 42, 1];
    if (who === 'bro') return [clamp(A.bro.x + 16, 70, 570), A.bro.y - 28, 1];
    return [A.you.x + 22, A.you.y - 28, 1];
  },
  enter() {
    SC.surfY = 96; SC.boatX = 470; SC.boatY = 96; SC.boatRot = 0; SC.propA = 0; SC.far = -170;
    SC.men = [-96, -62, -28];
    SC.harps = []; SC.gore = 0; SC.shot = 0; SC.cried = false;
    // all four still clean.  Nothing in this beat is scarred until the beat
    // itself does the scarring.
    A.dad = actor(MAN.dad, 300, 208, { beat: 1.3, exp: 'angry' });
    A.mom = actor(MAN.mom, 374, 246, { beat: 1.4 });
    A.bro = actor(MAN.bro, 258, 266, { beat: 2.0, exp: 'wide' });
    A.you = actor(MAN.you, 148, 294, { beat: 2.0, exp: 'wide' });
    SC.sch1 = makeSchool(9, 580, 176, 46, 0, 1, -46);
  },
  // the three men on the rail, and the derrick they wind the bodies up on
  gunPos(i) { return [SC.boatX + SC.men[i] - 9, SC.boatY + (BOAT ? BOAT.deckY : -28) - 15]; },
  derrick() { return [SC.boatX - 64, SC.boatY - 69]; },
  fire(gi, tgt, ox, oy, up, bt, miss) {
    const g = this.gunPos(gi);
    const a = angleTo(g[0], g[1], tgt.x + ox, tgt.y + oy);
    SC.harps.push({ x: g[0], y: g[1], a: a, sp: 450, gun: gi, tgt: tgt, t0: bt,
                    aimX: ox, aimY: oy, stuck: false, gone: false, hitT: 0,
                    lx: 0, ly: 0, up: up, miss: !!miss });
    if (typeof Audio_ !== 'undefined') { Audio_.shot('harpoon'); Audio_.tone(90, 0.2, 'square', 0.12, -40); }
  },
  update(dt, bt) {
    Intro.scroll += 13 * dt;
    SC.boatY = SC.surfY + Math.sin(bt * 2.1) * 2;
    SC.boatRot = Math.sin(bt * 1.7) * 0.018;
    SC.propA += dt * 30;
    SC.far += 22 * dt;
    engine(dt, clamp(bt * 0.8, 0, 1)); churnSound(dt, 0.6);
    for (const k of ['dad', 'mom', 'you', 'bro']) { swim(A[k], dt); bounce(A[k], dt); }
    // Four shots.  The first takes the one who would have fought.  The
    // second is aimed at her brother and goes WIDE -- it misses him by a
    // body's width, which is the only reason there is anybody left for the
    // white boat to take.  The third takes the one who told her to run.  The
    // fourth goes through the calf and keeps going.
    if (SC.shot === 0 && bt > 0.70) { this.fire(1, A.dad, 8, -6, [SC.boatX - 250, SC.surfY + 26], bt); SC.shot = 1; }
    if (SC.shot === 1 && bt > 2.00) { this.fire(0, A.bro, 2, 30, null, bt, true); SC.shot = 2; }
    if (SC.shot === 2 && bt > 3.30) { this.fire(2, A.mom, 6, -6, [SC.boatX - 132, SC.surfY - 34], bt); SC.shot = 3; }
    if (SC.shot === 3 && bt > 5.45) { this.fire(1, A.you, 12, 2, null, bt); SC.shot = 4; }
    for (const h of SC.harps) {
      if (h.gone) { h.x += Math.cos(h.a) * h.sp * dt; h.y += Math.sin(h.a) * h.sp * dt; continue; }
      if (!h.stuck) {
        h.x += Math.cos(h.a) * h.sp * dt; h.y += Math.sin(h.a) * h.sp * dt;
        if (Math.random() < 50 * dt) FX.bubble(h.x, h.y, 1, 1.8);
        if (h.miss) {
          // the near miss: it goes past him, he sees it go past, and he bolts
          if (!h.scared && dist(h.x, h.y, h.tgt.x, h.tgt.y) < 46) {
            h.scared = true;
            kick(h.tgt, -10);
            h.tgt.exp = 'wide'; h.tgt.beat = 5.4;
            FX.bubble(h.tgt.x, h.tgt.y, 9, 2.2);
            if (typeof Audio_ !== 'undefined') Audio_.noise(0.14, 0.06, 2600, 700);
          }
        } else if (dist(h.x, h.y, h.tgt.x + h.aimX, h.tgt.y + h.aimY) < 17) {
          const T = h.tgt;
          // where it went in, in HER units, so the hole and the shaft travel
          // with the body through everything that happens next
          const c = Math.cos(-(T.rot || 0)), sn = Math.sin(-(T.rot || 0));
          const dx = h.x - T.x, dy = h.y - T.y;
          h.lx = dx * c - dy * sn; h.ly = dx * sn + dy * c;
          T.wounds = (T.wounds || []).concat([{ x: h.lx, y: h.ly, r: h.up ? 5 : 4 }]);
          // THIS is where a body stops being clean.  Nothing in the
          // cinematic sets `scarred` up front any more: the flag is turned on
          // at the frame the steel goes in, on whoever it went into.
          T.scarred = true;
          T.flash = 1; T.exp = 'pain'; T.tailAmp = 0.55; T.dying = 1;
          FX.spurt(h.x, h.y, h.a + Math.PI + rand(-0.5, 0.5), 14, 1.0);
          FX.spurt(h.x, h.y, h.a + rand(-0.4, 0.4), 8, 0.7);
          FX.blood(h.x, h.y, 14, 1.7);
          FX.gib(h.x, h.y, 7, 1.0);
          Intro.shake = 9;
          if (typeof Audio_ !== 'undefined') { Audio_.hit(); Audio_.hurt(); }
          if (h.up) {
            h.stuck = true; h.hitT = bt;
            T.harps = (T.harps || []).concat([{ x: h.lx, y: h.ly, a: h.a - (T.rot || 0) }]);
          } else {
            // the calf: it rips her open along the flank and carries on past
            h.gone = true;
            T.exp = 'pain'; T.flash = 1;
            FX.spurt(h.x, h.y, h.a + Math.PI * 0.75, 10, 0.9);
          }
        }
        if (h.y > 380 || h.x < -60) h.gone = true;
      } else {
        const T = h.tgt, e = bt - h.hitT;
        const wp = bodyPoint(T, h.lx, h.ly);
        if (e < 1.20) {
          // on the line and fighting it, and losing
          T.rot = Math.sin(e * 17) * 0.42;
          T.x += Math.sin(e * 21) * 46 * dt;
          T.exp = 'pain';
          if (Math.random() < 15 * dt) FX.blood(wp[0], wp[1], 1, 1.15);
          if (Math.random() < 7 * dt) FX.spurt(wp[0], wp[1], rand(0, TAU), 3, 0.45);
          if (Math.random() < 16 * dt) FX.bubble(T.x, T.y, 1, 2.2);
        } else {
          // dead, and wound up on the wire, bleeding all the way
          const k = clamp((e - 1.20) / 3.2, 0, 1);
          T.x = smooth(T.x, h.up[0], 1.3 + k * 2.4, dt);
          T.y = smooth(T.y, h.up[1], 1.3 + k * 2.4, dt);
          T.rot = smooth(T.rot, -1.3, 2.0, dt);
          T.exp = 'dead';
          T.beat = lerp(T.beat, 0.20, dt * 2);
          T.tailAmp = lerp(T.tailAmp, 0.05, dt * 2);
          T.flipperA = lerp(T.flipperA, 2.4, dt * 2);
          if (Math.random() < 5 * dt) FX.blood(wp[0] + rand(-2, 10), wp[1] + rand(6, 20), 1, 0.9);
          if (Math.random() < 3 * dt) FX.blood(wp[0], wp[1] + rand(16, 46), 1, 0.7);
        }
      }
    }
    // the water fills up as they are opened, one step per body
    let stuck = 0; for (const h of SC.harps) if (h.stuck) stuck++;
    SC.gore = smooth(SC.gore, [0, 0.40, 0.68][Math.min(2, stuck)] + (A.you.scarred ? 0.06 : 0), 1.5, dt);
    // Her brother.  He hangs on the bottom with her until the shot that
    // misses him, and then he is gone -- straight out of the left of the
    // frame, alive, which is the whole reason the next three beats exist.
    const bolt = ss2(clamp((bt - 2.30) / 2.6, 0, 1));
    A.bro.x = lerp(258, -70, bolt) + Math.sin(bt * 1.1) * 4;
    A.bro.y = lerp(266, 318, bolt) + Math.sin(bt * 1.6) * 5;
    A.bro.rot = smooth(A.bro.rot, bolt > 0.02 ? 0.18 : 0.02, 4, dt);
    A.bro.beat = lerp(2.0, 6.2, bolt < 0.98 ? Math.sin(clamp(bolt, 0, 1) * Math.PI * 0.7) : 0.2);
    A.bro.exp = talking('bro') ? 'talk' : 'wide';
    if (bolt > 0.02 && bolt < 0.95 && Math.random() < 16 * dt) FX.bubble(A.bro.x + 16, A.bro.y - 4, 1, 1.8);
    // the calf, under all of it, pinned to the bottom
    const drift = ss(clamp((bt - 3.1) / 3.4, 0, 1));
    A.you.x = lerp(148, 214, drift) + Math.sin(bt * 0.8) * 4;
    A.you.y = lerp(294, 302, drift) + Math.sin(bt * 1.15) * 4;
    A.you.rot = smooth(A.you.rot, bt > 5.6 ? 0.22 : bt > 3.2 ? -0.16 : 0.02, 4, dt);
    A.you.beat = lerp(2.0, 0.9, drift);
    A.you.flipperA = 0.45 - smooth(A.you.reach || 0, bt > 3.3 && bt < 5.4 ? 1 : 0, 4.5, dt) * 2.1;
    A.you.reach = smooth(A.you.reach || 0, bt > 3.3 && bt < 5.4 ? 1 : 0, 4.5, dt);
    A.you.exp = talking('you') ? 'talk' : bt > 5.6 ? 'pain' : 'wide';
    if (bt > 5.7 && A.you.wounds && Math.random() < 6 * dt) {
      const wp = bodyPoint(A.you, A.you.wounds[0].x, A.you.wounds[0].y);
      FX.blood(wp[0], wp[1], 1, 0.5);
    }
    if (bt > 5.0 && Math.random() < 1.6 * dt) FX.bubble(A.you.x + 16, A.you.y - 6, 1, 0.5);
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'cold', grade: 'cold', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 330, shafts: 0.85, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    // the rest of the fleet, small, on the horizon: there is plenty more of it
    for (const ox of [0, 250, 520]) {
      ctx.save(); ctx.translate(R(SC.far + ox), R(SC.surfY + 2)); ctx.scale(0.5, 0.5);
      ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay); ctx.restore();
    }
    hullShade(ctx, SC.boatX - 20, SC.boatY + 26, 150, 150, 0.9);
    drawBoat(ctx, SC.boatX, SC.boatY, SC.boatRot, SC.propA, 1, Intro.t);
    // the gun crew, in silhouette on the rail
    const feet = SC.boatY + (BOAT ? BOAT.deckY : -28);
    const SCHED = [[1, 0.70], [0, 2.00], [2, 3.30], [1, 5.45]];
    for (let i = 0; i < SC.men.length; i++) {
      let rec = 0;
      for (const sh of SCHED) if (sh[0] === i && bt >= sh[1]) rec = Math.max(rec, clamp(1 - (bt - sh[1]) * 3, 0, 1));
      figure(ctx, SC.boatX + SC.men[i], feet, 26, {
        facing: -1, lean: 0.38 - rec * 0.22,
        armA: 1.20 - rec * 0.35, foreA: 1.32 - rec * 0.45,
        armB: 1.02 - rec * 0.25, foreB: 1.18 - rec * 0.35,
        legA: 0.52, legB: -0.48, kneeA: -0.12, kneeB: 0.1, head: -0.46,
      }, '#10141c', '#6d8fae');
      // the gun in their hands, aimed down the line it actually fires
      const g = this.gunPos(i);
      ctx.save(); ctx.translate(R(g[0]), R(g[1] + 2)); ctx.rotate(1.94 + rec * 0.34);
      P(ctx, IP.ink, -11, -3, 20, 6); P(ctx, '#4a525e', -10, -2, 18, 4); P(ctx, '#8c97a8', -10, -2, 18, 1);
      P(ctx, '#5c3a1c', -13, -2, 4, 5);
      ctx.restore();
    }
    // the lines: off the gun while it is still a shot, off the derrick once
    // it has become a haul
    for (const h of SC.harps) {
      if (h.gone) continue;
      const g = this.gunPos(h.gun), d = this.derrick();
      const hk = h.stuck ? ss(clamp((bt - h.hitT - 1.20) / 0.9, 0, 1)) : 0;
      const ax = lerp(g[0], d[0], hk), ay = lerp(g[1], d[1], hk);
      const tip = h.stuck ? bodyPoint(h.tgt, h.lx, h.ly) : [h.x, h.y];
      const taut = h.stuck ? clamp(1 - (bt - h.hitT) / 1.3, 0, 1) : 1;
      drawRope(ctx, ax, ay, tip[0], tip[1], 26 * taut + 5, '#d8cfae', '#7a6a44');
    }
    drawManatee(ctx, A.dad, Intro.t);
    drawManatee(ctx, A.bro, Intro.t);
    drawManatee(ctx, A.mom, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    // only the ones still in the air: a barb that has landed is drawn inside
    // the animal it landed in
    for (const h of SC.harps) {
      if (h.stuck) continue;
      ctx.save(); ctx.translate(R(h.x), R(h.y)); ctx.rotate(h.a);
      ctx.drawImage(HARP.c, -HARP.ax, -HARP.ay);
      if (h.gone && !h.miss) { P(ctx, IP.blood[2], -4, -1, 10, 3); P(ctx, IP.blood[4], 0, 0, 6, 1); }
      ctx.restore();
    }
    FX.render(ctx);
    foreground(ctx, { grade: 'cold', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, bedY: 330 });
  },
});

// ----------------------------------------------------------------- 3. YACHT
//  The second boat.  The fleet does the killing; this one does the buying.
//  It is white, it is quiet, it comes over in the same bright afternoon, and
//  the fat man at the rail puts his glasses down and points at the two calves
//  in the water the way you point at a price.
BEATS.push({
  name: 'yacht', dur: 7.0,
  talk: [
    [0.70, 'you', 'Under me. Don\'t move.'],
    [2.90, 'bro', 'It stopped.'],
    [4.30, 'you', 'It\'s looking at us.'],
  ],
  anchor(who) {
    if (who === 'bro') return [A.bro.x + 20, A.bro.y - 24, 1];
    return [A.you.x + 22, A.you.y - 26, 1];
  },
  enter() {
    SC.surfY = 142; SC.yX = -260; SC.yY = 142; SC.spot = 0; SC.gore = 0.44;
    // she came out of the reef opened along the flank; he did not get touched
    A.you = actor(MAN.you, 240, 244, { beat: 2.4, exp: 'wide', scarred: true, tailAmp: 0.18 });
    A.you.wounds = [{ x: 5, y: -2, r: 3 }];
    A.bro = actor(MAN.bro, 184, 268, { beat: 2.8, exp: 'wide' });
    SC.sch1 = makeSchool(7, 610, 190, 40, 0, 2, -20);
  },
  update(dt, bt) {
    Intro.scroll += 22 * dt;
    SC.gore = smooth(SC.gore, 0.20, 0.5, dt);
    SC.yX = lerp(-250, 340, ss(clamp(bt / 5.4, 0, 1)));
    SC.yY = SC.surfY + Math.sin(bt * 1.7) * 2;
    engine(dt, 0.42);
    for (const k of ['you', 'bro']) { swim(A[k], dt); bounce(A[k], dt); }
    A.you.x = 240 + Math.sin(bt * 0.6) * 8;
    A.you.y = 244 + Math.sin(bt * 1.3) * 6;
    A.you.rot = -0.16 + Math.sin(bt * 1.3) * 0.06;
    A.you.exp = talking('you') ? 'talk' : bt > 4.2 ? 'wide' : 'pain';
    A.bro.x = 184 + Math.sin(bt * 0.5 + 1) * 6;
    A.bro.y = 268 + Math.sin(bt * 1.6) * 6;
    A.bro.rot = -0.2 + Math.sin(bt * 1.6) * 0.07;
    A.bro.exp = talking('bro') ? 'talk' : 'wide';
    // she is still leaking from the reef, and the trail is what he follows
    if (Math.random() < 3.0 * dt) {
      const wp = bodyPoint(A.you, A.you.wounds[0].x, A.you.wounds[0].y);
      FX.blood(wp[0], wp[1], 1, 0.45);
    }
    SC.spot = clamp((bt - 3.10) / 0.45, 0, 1);
    if (!SC.seen && SC.spot >= 1) {
      SC.seen = true;
      kick(A.you, -6); kick(A.bro, -5);
      if (typeof Audio_ !== 'undefined') Audio_.tone(420, 0.10, 'square', 0.06, -180);
    }
    if (Math.random() < 3 * dt) { FX.bubble(A.you.x + 22, A.you.y - 6, 1, 0.8); FX.bubble(A.bro.x + 16, A.bro.y - 4, 1, 0.8); }
  },
  render(ctx) {
    backdrop(ctx, { mood: 'cold', grade: 'cold', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 344, shafts: 0.7, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    hullShade(ctx, SC.yX, SC.yY + 30, 190, 170, 0.8);
    ctx.save(); ctx.translate(R(SC.yX), R(SC.yY));
    ctx.drawImage(YAC.s.c, -YAC.s.ax, -YAC.s.ay); ctx.restore();
    // hull wake under the waterline, in hard bands
    for (let i = 0; i < 20; i++) {
      const a = qa(0.34 - i * 0.017); if (a <= 0) break;
      const hgt = R(5 + i * 1.6);
      ctx.fillStyle = rgbaq('#cfe8f5', a);
      ctx.fillRect(R(SC.yX - 190 - i * 8), R(SC.yY - 2 + Math.sin(Intro.t * 5 + i) * 3), 8, hgt);
      if (hash2(i, Math.floor(Intro.t * 10)) > 0.6) { ctx.fillStyle = rgbaq('#ffffff', qa(a * 1.4)); ctx.fillRect(R(SC.yX - 190 - i * 8), R(SC.yY - 4 + hash2(i, 3) * hgt), 4, 2); }
    }
    // the buyer at the foredeck rail
    const bx = SC.yX + 104, by = SC.yY - 76;
    const grin = SC.spot > 0.5;
    drawBiz(ctx, {
      x: bx, y: by, flip: false, grin: grin, cigar: true,
      binoc: SC.spot < 0.6,
      armNear: SC.spot < 0.6 ? -1.15 - Math.sin(Intro.t * 0.9) * 0.12 : lerp(-1.1, 1.05, clamp((SC.spot - 0.6) * 2.5, 0, 1)),
      armFar: SC.spot < 0.6 ? -1.0 : 1.5,
      headR: SC.spot < 0.6 ? Math.sin(Intro.t * 0.8) * 0.12 : 0.28,
      headY: SC.spot > 0.5 && SC.spot < 0.9 ? -2 : 0,
    }, Intro.t);
    // cigar smoke
    for (let i = 0; i < 5; i++) {
      const k = (Intro.t * 0.5 + i * 0.2) % 1;
      ctx.fillStyle = rgbaq('#b9b3ad', qa(0.28 * (1 - k)));
      ctx.fillRect(R(bx + 12 + Math.sin(k * 6 + i) * 4), R(by - 28 - k * 26), 2 + R(k * 3), 2 + R(k * 3));
    }
    if (SC.spot > 0.5 && (Math.floor(Intro.t * 6) & 1)) {
      P(ctx, '#ffe48f', R(bx + 22), R(by - 30), 2, 2);
      P(ctx, '#ffffff', R(bx + 26), R(by - 34), 2, 2);
    }
    drawManatee(ctx, A.bro, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'cold', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, bedY: 344 });
  },
});

// ------------------------------------------------------------------- 4. NET
//  The net comes down with weights sewn into the rim.  There is one tear in
//  the mesh and she is the smaller of the two through it.  He is not, and the
//  last thing the beat does is take him up out of the frame with his flipper
//  still out towards her.
BEATS.push({
  name: 'net', dur: 9.0,
  talk: [
    [0.45, 'you', 'NET! GO DEEP!'],
    [3.10, 'you', 'Here! A tear!'],
    [5.00, 'bro', 'I can\'t fit!'],
    [6.70, 'you', 'NO! HOLD ON!'],
  ],
  anchor(who) {
    if (who === 'bro') return [clamp(A.bro.x + 14, 70, 570), A.bro.y - 30, 1];
    return [clamp(A.you.x + 18, 70, 570), A.you.y - 28, 1];
  },
  enter() {
    SC.surfY = 116; SC.yX = 150; SC.yY = 116; SC.gore = 0.20;
    SC.netY = -200; SC.netX = 448; SC.cinch = 0; SC.free = false; SC.splashed = false;
    A.you = actor(MAN.you, 416, 232, { beat: 2.6, exp: 'wide', scarred: true, tailAmp: 0.22 });
    A.you.wounds = [{ x: 5, y: -2, r: 3 }];
    A.bro = actor(MAN.bro, 470, 254, { beat: 3.0, exp: 'wide' });
    SC.sch1 = makeSchool(6, 600, 196, 36, 0, 1, -26);
  },
  update(dt, bt) {
    Intro.scroll += 9 * dt;
    SC.gore = smooth(SC.gore, 0.12, 0.5, dt);
    SC.yY = SC.surfY + Math.sin(bt * 1.5) * 2;
    engine(dt, 0.5);
    for (const k of ['you', 'bro']) { swim(A[k], dt); bounce(A[k], dt); }
    A.you.exp = talking('you') ? 'talk' : bt > 5.4 ? 'sad' : 'wide';
    A.bro.exp = talking('bro') ? 'talk' : 'wide';
    if (bt < 0.7) {
      A.you.y = 232 + Math.sin(bt * 1.4) * 5; A.bro.y = 254 + Math.sin(bt * 1.7) * 5;
    } else if (bt < 2.6) {                       // the rim comes down
      const k = clamp((bt - 0.7) / 1.9, 0, 1);
      SC.netY = lerp(-200, 168, inCube(k));
      if (k > 0.2 && Math.random() < 10 * dt) FX.bubble(SC.netX + rand(-90, 90), SC.netY + rand(0, 40), 1, 1.6);
      A.you.beat = 5; A.bro.beat = 5.5;
      A.you.x = lerp(416, 412, k); A.you.y = lerp(232, 250, k);
      A.bro.x = lerp(470, 480, k); A.bro.y = lerp(254, 266, k);
      if (k >= 1 && !SC.splashed) { SC.splashed = true; Intro.shake = 8; if (typeof Audio_ !== 'undefined') { Audio_.splash(2); Audio_.noise(0.5, 0.18, 800, 120); } }
    } else if (bt < 4.2) {                       // cinched, and both of them in it
      const k = clamp((bt - 2.6) / 1.6, 0, 1);
      SC.cinch = k * 0.86; SC.netY = 168 - k * 14;
      A.you.beat = 9; A.bro.beat = 9;
      A.you.x = 412 + Math.sin(bt * 19) * 11; A.you.y = 250 + Math.sin(bt * 14) * 8;
      A.you.rot = Math.sin(bt * 17) * 0.5;
      A.bro.x = 482 + Math.sin(bt * 16 + 2) * 11; A.bro.y = 266 + Math.sin(bt * 13 + 1) * 8;
      A.bro.rot = Math.sin(bt * 15 + 1) * 0.5;
      if (Math.random() < 40 * dt) { FX.bubble(A.you.x, A.you.y, 1, 2.6); FX.bubble(A.bro.x, A.bro.y, 1, 2.6); }
      Intro.shake = Math.max(Intro.shake, 2);
    } else if (bt < 5.4) {                       // she goes through the tear
      const k = clamp((bt - 4.2) / 1.2, 0, 1);
      SC.cinch = 0.86; SC.netY = 154;
      A.you.x = lerp(412, 306, inCube(k)); A.you.y = lerp(250, 296, k);
      A.you.rot = lerp(0.4, -0.1, k); A.you.beat = 8;
      A.bro.x = 482 + Math.sin(bt * 16 + 2) * 9; A.bro.y = 266 + Math.sin(bt * 13) * 7;
      A.bro.rot = Math.sin(bt * 15) * 0.45;
      if (k > 0.25 && !SC.free) {
        SC.free = true;
        kick(A.you, 9);
        FX.bubble(A.you.x, A.you.y, 12, 2.4);
        if (typeof Audio_ !== 'undefined') Audio_.noise(0.2, 0.09, 1800, 400);
      }
      if (Math.random() < 25 * dt) FX.bubble(A.bro.x, A.bro.y, 1, 2.4);
    } else {                                     // and he goes up
      const k = clamp((bt - 5.4) / 3.5, 0, 1), e = inCube(k);
      SC.netY = lerp(154, -320, e);
      SC.cinch = 0.9;
      A.bro.x = SC.netX + 34; A.bro.y = SC.netY + 80;
      A.bro.rot = lerp(0.2, -0.5, clamp(k * 2, 0, 1));
      A.bro.flip = true;
      A.bro.beat = lerp(9, 2.2, clamp(k * 1.6, 0, 1));
      A.you.x = lerp(306, 336, k); A.you.y = lerp(296, 262, k);
      A.you.rot = -0.22; A.you.beat = lerp(8, 1.3, clamp(k * 2, 0, 1));
      if (Math.random() < 6 * dt) FX.bubble(A.bro.x, A.bro.y, 1, 1.6);
    }
    if (Math.random() < 2.6 * dt) {
      const wp = bodyPoint(A.you, A.you.wounds[0].x, A.you.wounds[0].y);
      FX.blood(wp[0], wp[1], 1, 0.4);
    }
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'cold', grade: 'cold', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 348, shafts: 0.7, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    hullShade(ctx, SC.yX, SC.yY + 30, 190, 170, 0.7);
    ctx.save(); ctx.translate(R(SC.yX), R(SC.yY)); ctx.drawImage(YAC.s.c, -YAC.s.ax, -YAC.s.ay); ctx.restore();
    // davit rope down to the net
    drawRope(ctx, SC.yX + 178, SC.yY - 78, SC.netX, SC.netY + 2, 14, '#d8cfae', '#7a6a44');
    drawManatee(ctx, A.bro, Intro.t);
    drawManatee(ctx, A.you, Intro.t);
    // his flipper, out towards her the whole way up
    if (bt > 5.4) {
      const M = A.bro.set, b = A.bro;
      const cs = Math.cos(b.rot), sn = Math.sin(b.rot), fxs = b.flip ? -1 : 1;
      const sx = b.x + (M.shoX * fxs) * cs - M.shoY * sn;
      const sy = b.y + (M.shoX * fxs) * sn + M.shoY * cs;
      const a = angleTo(sx, sy, A.you.x, A.you.y);
      ctx.save(); ctx.translate(R(sx), R(sy)); ctx.rotate(a); ctx.scale(1.5, 1.3);
      ctx.drawImage(M.flip.c, -M.flip.ax, -M.flip.ay);
      ctx.restore();
    }
    drawNet(ctx, { x: SC.netX, y: SC.netY, w: 206, h: 150, cinch: SC.cinch, t: Intro.t, sway: 7, hole: { j: 7, i: 0, w: 4, h: 4 } });
    FX.render(ctx);
    foreground(ctx, { grade: 'cold', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, bedY: 348 });
  },
});

// -------------------------------------------------- 5. CAPTURED / BLACKOUT
//  She slipped the net.  She does not slip the crane.  The arm comes down out
//  of the sun, the grab closes on her, and she is lifted out of the only
//  thing she has ever breathed in.  Then the light goes.
BEATS.push({
  name: 'captured', dur: 8.0,
  talk: [
    [0.30, 'you', 'What is THAT.'],
    [2.50, 'you', 'LET GO!'],
  ],
  anchor() { return [clamp(A.you.x + 16, 70, 570), A.you.y - 30, 1]; },
  enter() {
    SC.surfY = -40; SC.pvx = 700; SC.pvy = -260; SC.a1 = 1.90; SC.a2 = 0.25;
    SC.clamped = false; SC.broke = false; SC.black = 0; SC.beatT = 0; SC.ring = 0;
    SC.deckClawX = 130; SC.deckClawY = 74; SC.gore = 0.12;
    A.you = actor(MAN.you, 430, 216, { beat: 4.0, exp: 'wide', scarred: true });
    A.you.wounds = [{ x: 5, y: -2, r: 3 }];
  },
  claw() {                                  // forward kinematics for the boom tip
    const x1 = SC.pvx + Math.cos(SC.a1) * 194, y1 = SC.pvy + Math.sin(SC.a1) * 194;
    return [x1 + Math.cos(SC.a1 + SC.a2) * 80, y1 + Math.sin(SC.a1 + SC.a2) * 80];
  },
  update(dt, bt) {
    Intro.scroll += 6 * dt;
    swim(A.you, dt); bounce(A.you, dt);
    if (bt < 2.4) {                                   // the arm comes down
      const k = clamp(bt / 2.2, 0, 1), e = ss(k);
      SC.pvx = lerp(700, 537, e); SC.pvy = lerp(-260, -35, e);
      const c = this.claw();
      if (bt < 1.9) { A.you.x = 430 + Math.sin(bt * 2.2) * 22; A.you.y = 216 + Math.sin(bt * 3) * 12; A.you.rot = Math.sin(bt * 3) * 0.2; }
      else { A.you.x = smooth(A.you.x, c[0], 8, dt); A.you.y = smooth(A.you.y, c[1] + 22, 8, dt); }
      if (bt >= 2.15 && !SC.clamped) {
        SC.clamped = true; Intro.shake = 12;
        kick(A.you, -11);
        A.you.flash = 1;
        FX.bubble(A.you.x, A.you.y, 20, 2.6);
        if (typeof Audio_ !== 'undefined') { Audio_.tone(150, 0.22, 'square', 0.22, -70); Audio_.noise(0.3, 0.3, 1600, 200); Audio_.hurt(); }
      }
      if (Math.random() < 10 * dt) FX.bubble(A.you.x + rand(-14, 14), A.you.y, 1, 1.8);
    } else if (bt < 4.3) {                            // hauled out of the water
      const k = clamp((bt - 2.4) / 1.9, 0, 1);
      SC.pvx = lerp(537, 610, k); SC.pvy = lerp(-35, -330, inCube(k));
      SC.surfY = lerp(-60, 330, k);
      const c = this.claw();
      A.you.x = c[0]; A.you.y = c[1] + 22; A.you.rot = 0.15 + Math.sin(bt * 8) * 0.16 * (1 - k);
      A.you.beat = 7; A.you.exp = talking('you') ? 'talk' : 'pain';
      if (!SC.broke && A.you.y > SC.surfY) {
        SC.broke = true; FX.drops(A.you.x, SC.surfY, 70, 1.2); FX.foam(A.you.x, SC.surfY, 30, 1.4);
        if (typeof Audio_ !== 'undefined') Audio_.splash(3);
      }
      if (SC.broke && Math.random() < 30 * dt) FX.drops(A.you.x + rand(-20, 20), A.you.y + 10, 1, 0.4);
    } else if (bt < 6.3) {                            // swung over the deck, sight going
      const k = clamp((bt - 4.3) / 2.0, 0, 1);
      SC.deckClawX = lerp(130, 470, ss(k));
      SC.deckClawY = lerp(74, 108 + k * 26, k);
      A.you.rot = 0.2 + Math.sin(bt * 5) * 0.12 * (1 - k);
      A.you.beat = lerp(5, 1.2, k);
      A.you.exp = k > 0.5 ? 'dead' : 'pain';
      SC.black = clamp((bt - 4.9) / 1.4, 0, 1);
      if (Math.random() < 14 * dt * (1 - k)) FX.drops(SC.deckClawX + rand(-16, 16), SC.deckClawY + 30, 1, 0.3);
      if (typeof Audio_ !== 'undefined' && bt > 4.9) {
        SC.ring -= dt;
        if (SC.ring <= 0) { SC.ring = 0.9; Audio_.tone(760 - SC.black * 300, 1.1, 'sine', 0.05 * (1 - SC.black * 0.5)); }
      }
    } else {                                          // black: just a heartbeat
      SC.black = 1;
      SC.beatT -= dt;
      if (SC.beatT <= 0) {
        SC.beatT = 1.05;
        if (typeof Audio_ !== 'undefined') Audio_.tone(52, 0.16, 'sine', 0.22, -14);
      }
    }
  },
  render(ctx, bt) {
    if (bt < 4.3) {
      backdrop(ctx, { mood: 'cold', grade: 'cold', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY > 0 ? SC.surfY : null, bedY: 352, shafts: 0.6 });
      if (SC.surfY > 0) drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
      if (SC.surfY < 40) { ctx.save(); ctx.translate(180, R(SC.surfY - 4)); ctx.drawImage(YAC.s.c, -YAC.s.ax, -YAC.s.ay); ctx.restore(); }
      drawManatee(ctx, A.you, Intro.t);
      drawCrane(ctx, { x: SC.pvx, y: SC.pvy, a1: SC.a1, a2: SC.a2, a3: -SC.a1 - SC.a2, hook: 1, open: SC.clamped ? 0.12 : 0.85 });
      FX.render(ctx);
      if (SC.surfY > 0) foreground(ctx, { grade: 'cold', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, bedY: 352 });
    } else if (bt < 6.3) {
      drawDeck(ctx, Intro.t);
      // the cable, straight down out of the frame, with the grab on the end
      ctx.save(); ctx.translate(R(SC.deckClawX), R(SC.deckClawY));
      P(ctx, IP.ink, -3, -300, 6, 300); P(ctx, '#e0a838', -2, -300, 4, 300);
      ctx.restore();
      const yy = Object.assign({}, A.you, { x: SC.deckClawX, y: SC.deckClawY + 30 });
      drawManatee(ctx, yy, Intro.t);
      ctx.save(); ctx.translate(R(SC.deckClawX), R(SC.deckClawY));
      drawClaw(ctx, 0.12);
      ctx.restore();
      FX.render(ctx);
      // consciousness going: a hard-edged iris closing in, then black
      if (SC.black > 0) aperture(ctx, SC.black);
    } else {
      P(ctx, '#000000', 0, 0, 640, 360);
      // the heartbeat, as a dim red breath at the edges
      const ph = 1 - clamp(SC.beatT / 1.05, 0, 1);
      const pulse = Math.max(0, Math.sin(ph * 9) * Math.max(0, 1 - ph * 3));
      if (pulse > 0.02) {
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = rgbaq('#3a0a10', qa(pulse * (0.26 - i * 0.04)));
          const inset = i * 11;
          ctx.fillRect(0, inset, 640, 11); ctx.fillRect(0, 349 - inset, 640, 11);
          ctx.fillRect(inset, 0, 13, 360); ctx.fillRect(627 - inset, 0, 13, 360);
        }
      }
    }
  },
});

// ----------------------------------------------------------------- 6. CRATE
//  She wakes up in a box, in a hold, under somebody else's catch.  The only
//  light in the whole cinematic that is not the sun is the one bulb swinging
//  beyond the slats, and every so often the hatch opens and more shrimp come
//  down on top of her.
BEATS.push({
  name: 'crate', dur: 8.5,
  talk: [
    [2.60, 'you', '...Where.'],
    [4.40, 'you', 'Shrimp. Dead things.'],
    [6.30, 'you', 'And me.'],
  ],
  anchor() { return [A.you.x + 24, A.you.y - 34, 1]; },
  enter() {
    holdArt();
    SC.open = 0; SC.hatch = 0; SC.loose = []; SC.rainT = 0; SC.tipped = false;
    A.you = actor(MAN.youBig, 286, 254, { beat: 0.5, exp: 'pain', tailAmp: 0.05, rot: 0.06, scarred: true });
    A.you.wounds = [{ x: 8, y: -3, r: 5 }, { x: -16, y: 4, r: 3 }];
    for (let i = 0; i < 26; i++) looseAdd(SC.loose, { x: rand(30, 610), y: pileFrontTop(300) - 40, vx: rand(-20, 20), vy: rand(0, 60), r: rand(0, TAU), vr: rand(-4, 4), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
  },
  update(dt, bt) {
    swim(A.you, dt); bounce(A.you, dt);
    // waking: two flutters, then open
    SC.open = bt < 0.9 ? 0 : bt < 1.3 ? (bt - 0.9) / 0.4 * 0.30
      : bt < 1.7 ? 0.30 - (bt - 1.3) / 0.4 * 0.24
        : bt < 2.4 ? 0.06 + (bt - 1.7) / 0.7 * 0.62
          : bt < 2.8 ? 0.68 - (bt - 2.4) / 0.4 * 0.16
            : Math.min(1, 0.52 + (bt - 2.8) / 0.4 * 0.48);
    A.you.exp = talking('you') ? 'talk' : bt < 3.4 ? 'pain' : bt < 5.8 ? 'sad' : 'wide';
    A.you.y = 254 + Math.sin(bt * 0.7) * 2;
    A.you.rot = 0.06 + Math.sin(bt * 0.5) * 0.02;
    // the hatch opens and another load comes down on her
    SC.hatch = (bt > 3.8 && bt < 6.0) ? clamp(Math.min(bt - 3.8, 6.0 - bt) / 0.4, 0, 1) : 0;
    if (bt > 4.2 && bt < 5.7) {
      SC.rainT += dt;
      while (SC.rainT > 0.022) { SC.rainT -= 0.022; looseSpawnRain(SC.loose); }
      if (Math.random() < 5 * dt && typeof Audio_ !== 'undefined') Audio_.noise(0.14, 0.05, 2600, 700);
    }
    if (!SC.tipped && bt > 4.15) {
      SC.tipped = true;
      if (typeof Audio_ !== 'undefined') { Audio_.noise(0.5, 0.14, 900, 120); Audio_.tone(70, 0.3, 'square', 0.1, -20); }
    }
    looseUpdate(SC.loose, dt, pileFrontTop, Intro.t);
    if (bt > 4.4 && bt < 5.8) Intro.shake = Math.max(Intro.shake, 1.0);
    if (Math.random() < 1.2 * dt) {
      const wp = bodyPoint(A.you, A.you.wounds[0].x, A.you.wounds[0].y);
      FX.add({ k: 'd', x: wp[0], y: wp[1], vx: rand(-6, 6), vy: rand(10, 40), life: rand(0.5, 1.0), c: IP.blood[2] });
    }
  },
  render(ctx) {
    crateScene(ctx, Intro.t, { hatch: SC.hatch });
    drawManatee(ctx, A.you, Intro.t);
    cratePileFront(ctx);
    looseRender(ctx, SC.loose);
    FX.render(ctx);
    holdLight(ctx);
    motes(ctx, Intro.t * 6, Intro.t, 30, '#ffe0a0', 0.26);
    eyelids(ctx, SC.open);
  },
});

// ------------------------------------------------------- 7. SOMETHING ALIVE
//  The heap moves.  She has been lying in somebody else's catch for nineteen
//  days and one of the things in it is not dead: a paw comes up out of the
//  shrimp, and then a hat, and then the rest of him.  This is where the
//  player meets the otter -- not dropping out of the sun later on, but dug
//  out of the junk in the same box she is in, which is the only reason he is
//  worth anything to her.
//  It is the talkiest beat in the cinematic on purpose.  He will not stop;
//  she answers in four words or fewer.  That is the whole double act.
BEATS.push({
  name: 'junk', dur: 13.5,
  talk: [
    [0.50, 'you', 'Something moved.'],
    [1.95, 'otter', 'Don\'t. Squash. Me.'],
    [3.40, 'you', 'There\'s a rat in here.'],
    [5.00, 'otter', 'Otter. And a captain.'],
    [6.60, 'you', 'Captain of a shrimp pile.'],
    [8.20, 'otter', 'Nineteen days of it.'],
    [9.70, 'otter', 'They eat the big ones first.'],
    [11.40, 'you', 'I am the big one.'],
  ],
  anchor(who) {
    if (who === 'otter') return [clamp(SC.ot.x + 2, 80, 560), SC.ot.y - 40, 1];
    return [clamp(A.you.x + 26, 80, 540), A.you.y - 34, 1];
  },
  enter() {
    holdArt();
    SC.loose = []; SC.heave = 0; SC.up = 0; SC.shook = false;
    for (let i = 0; i < 30; i++) looseAdd(SC.loose, { x: rand(20, 620), y: pileFrontTop(300) - 30, vx: rand(-16, 16), vy: rand(0, 40), r: rand(0, TAU), vr: rand(-4, 4), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    A.you = actor(MAN.youBig, 270, 256, { beat: 0.6, exp: 'wide', tailAmp: 0.06, rot: 0.05, scarred: true });
    A.you.wounds = [{ x: 8, y: -3, r: 5 }, { x: -16, y: 4, r: 3 }];
    // he is buried to the ears in it and comes up out of the heap
    SC.ot = { x: 470, y: 300, phase: 0, rot: 0, exp: 'idle', flip: true, ride: false,
              sq: 0, sqv: 0, sx: 1, sy: 1, blink: false, blade: 0, headR: 0 };
  },
  update(dt, bt) {
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    A.you.x = smooth(A.you.x, 270, 2.4, dt);
    A.you.y = 256 + Math.sin(bt * 0.7) * 2 - ss(clamp((bt - 2.6) / 1.6, 0, 1)) * 8;
    A.you.rot = 0.05 + Math.sin(bt * 0.5) * 0.02;
    A.you.exp = talking('you') ? 'talk' : bt > 5.6 ? 'angry' : 'wide';
    // ---- the heap heaves twice, and then he digs himself out of it
    SC.heave = (bt < 2.0) ? Math.max(0, Math.sin(bt * 5.5)) : 0;
    if (SC.heave > 0.1 && Math.random() < 26 * dt) {
      looseAdd(SC.loose, { x: 470 + rand(-30, 30), y: pileFrontTop(470) - 6, vx: rand(-70, 70), vy: -rand(40, 170), r: rand(0, TAU), vr: rand(-9, 9), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    }
    if (!SC.shook && bt > 1.85) {
      SC.shook = true;
      Intro.shake = 6; kick(A.you, -6);
      FX.catchSpray(470, pileFrontTop(470) - 10, 26, 1.0);
      if (typeof Audio_ !== 'undefined') { Audio_.noise(0.22, 0.09, 1800, 400); Audio_.tone(140, 0.12, 'square', 0.08, -60); }
    }
    // up out of the shrimp, shake himself off, then stand
    SC.up = ss2(clamp((bt - 1.85) / 1.5, 0, 1));
    SC.ot.x = smooth(SC.ot.x, lerp(470, 424, ss(clamp((bt - 4.6) / 2.4, 0, 1))), 6, dt);
    SC.ot.y = smooth(SC.ot.y, lerp(pileFrontTop(470) + 26, pileFrontTop(440) - 16, SC.up), 7, dt);
    SC.ot.phase += dt * (SC.up < 1 ? 5.5 : 1.9);
    SC.ot.rot = (1 - SC.up) * 0.55 + Math.sin(bt * 1.7) * 0.05;
    SC.ot.exp = talking('otter') ? 'talk' : bt > 9.4 ? 'angry' : SC.up < 1 ? 'idle' : 'grin';
    // the arms sell the whole performance: he talks with them
    const gab = talking('otter') ? 1 : 0.25;
    SC.ot.armNear = 0.95 + Math.sin(SC.ot.phase * 2.3) * 0.60 * gab - (1 - SC.up) * 1.5;
    SC.ot.armFar = -0.95 - Math.sin(SC.ot.phase * 1.9) * 0.45 * gab;
    SC.ot.headR = Math.sin(SC.ot.phase * 1.4) * 0.10 * gab;
    if (SC.up > 0.2 && SC.up < 0.98 && Math.random() < 20 * dt) FX.catchSpray(SC.ot.x + rand(-10, 10), SC.ot.y + rand(0, 16), 1, 0.5);
    looseUpdate(SC.loose, dt, pileFrontTop, Intro.t);
    if (Math.random() < 1.0 * dt) looseAdd(SC.loose, { x: rand(40, 600), y: pileFrontTop(300) - 26, vx: rand(-16, 16), vy: rand(-16, 16), r: rand(0, TAU), vr: rand(-5, 5), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
  },
  render(ctx) {
    crateScene(ctx, Intro.t, { hatch: 0 });
    drawManatee(ctx, A.you, Intro.t);
    cratePileFront(ctx);
    looseRender(ctx, SC.loose);
    drawCapOtter(ctx, SC.ot, Intro.t);
    FX.render(ctx);
    holdLight(ctx);
    motes(ctx, Intro.t * 6, Intro.t, 30, '#ffe0a0', 0.26);
  },
});

// ---------------------------------------------------------------- 8. A PLAN
//  He has been working one bolt with the flat of a cutlass for nineteen days
//  and has twelve hours of it left.  While he works he talks, and while he
//  talks he tells her the only thing she actually wants to know: where her
//  brother went, and who took him.
BEATS.push({
  name: 'plan', dur: 15.0,
  talk: [
    [0.45, 'otter', 'See that bolt? That\'s ours.'],
    [2.20, 'you', 'It\'s iron.'],
    [3.40, 'otter', 'So is my cutlass. Watch.'],
    [5.10, 'otter', 'Nineteen days I\'ve worked it.'],
    [6.90, 'you', 'They took my brother.'],
    [8.50, 'otter', 'Grey. Small. Very loud?'],
    [9.90, 'you', 'Yes.'],
    [10.80, 'otter', 'Out last night. Other boat.'],
    [12.40, 'otter', 'Same buyer. Same village.'],
  ],
  anchor(who) {
    if (who === 'otter') return [clamp(SC.ot.x + 2, 80, 560), SC.ot.y - 40, 1];
    return [clamp(A.you.x + 26, 80, 520), A.you.y - 34, 1];
  },
  enter() {
    holdArt();
    SC.loose = []; SC.hit = 0; SC.next = 0.9; SC.step = 0; SC.spark = 0; SC.dim = 0;
    for (let i = 0; i < 34; i++) looseAdd(SC.loose, { x: rand(20, 620), y: pileFrontTop(300) - 30, vx: rand(-14, 14), vy: rand(0, 40), r: rand(0, TAU), vr: rand(-4, 4), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    A.you = actor(MAN.youBig, 252, 254, { beat: 0.5, exp: 'calm', tailAmp: 0.05, rot: 0.04, scarred: true });
    A.you.wounds = [{ x: 8, y: -3, r: 5 }, { x: -16, y: 4, r: 3 }];
    SC.ot = { x: 452, y: 236, phase: 0, rot: 0, exp: 'angry', flip: true, ride: false,
              sq: 0, sqv: 0, sx: 1, sy: 1, blade: 1, bladeR: -0.2, headR: 0 };
  },
  update(dt, bt) {
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    A.you.y = 254 + Math.sin(bt * 0.6) * 2 - (bt > 6.9 ? ss(clamp((bt - 6.9) / 2, 0, 1)) * 5 : 0);
    A.you.rot = 0.04 + Math.sin(bt * 0.45) * 0.02;
    A.you.exp = talking('you') ? 'talk' : bt > 12.2 ? 'angry' : bt > 6.8 ? 'sad' : 'calm';
    SC.ot.phase += dt * 1.6;
    // he works the bolt while he talks, and comes off it to say the big bits
    const atBolt = bt < 6.8 || bt > 10.4;
    SC.ot.flip = !atBolt;
    SC.ot.x = smooth(SC.ot.x, atBolt ? 474 : 396, 3.4, dt);
    SC.ot.y = smooth(SC.ot.y, atBolt ? 236 : 244, 3.4, dt);
    SC.ot.exp = talking('otter') ? 'talk' : bt > 12.2 ? 'angry' : 'idle';
    const work = atBolt ? 1 : 0;
    const gab = talking('otter') ? 1 : 0.3;
    SC.ot.armNear = 0.95 - work * 1.55 + Math.sin(bt * (work ? 9 : 2.4)) * (work ? 0.45 : 0.55 * gab);
    SC.ot.armFar = -0.95 - Math.sin(SC.ot.phase * 1.8) * 0.40 * gab;
    SC.ot.bladeR = work ? (0.92 + Math.sin(bt * 9) * 0.30) : -0.25;
    SC.ot.headR = Math.sin(SC.ot.phase * 1.3) * 0.10 * gab;
    SC.spark = Math.max(0, SC.spark - dt * 3);
    SC.next -= dt;
    if (SC.next <= 0 && work) {
      SC.step++;
      SC.next = rand(0.34, 0.62);
      SC.hit = 1; SC.spark = 1;
      Intro.shake = Math.max(Intro.shake, 2.2);
      if (typeof Audio_ !== 'undefined') {
        Audio_.tone(210 + (SC.step % 5) * 22, 0.09, 'square', 0.10, -90);
        Audio_.noise(0.11, 0.07, 3800, 900);
      }
      for (let i = 0; i < 8; i++) FX.add({ k: 'd', x: 503 + rand(-4, 4), y: 239 + rand(-9, 9), vx: rand(-150, -20), vy: rand(-110, 40), life: rand(0.2, 0.55), c: Math.random() < 0.5 ? '#ffd27a' : '#fff6cc' });
    }
    SC.hit = Math.max(0, SC.hit - dt * 5);
    // the news about her brother takes the light out of the hold for a moment
    SC.dim = (bt > 10.6 && bt < 12.6) ? clamp(Math.min(bt - 10.6, 12.6 - bt) / 0.6, 0, 1) : 0;
    looseUpdate(SC.loose, dt, pileFrontTop, Intro.t);
    if (Math.random() < 1.1 * dt) looseAdd(SC.loose, { x: rand(40, 600), y: pileFrontTop(300) - 26, vx: rand(-18, 18), vy: rand(-20, 20), r: rand(0, TAU), vr: rand(-5, 5), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    if (Math.random() < 1.4 * dt) FX.add({ k: 'd', x: rand(60, 580), y: 60, vx: rand(-4, 4), vy: rand(20, 50), life: rand(1.6, 3), c: '#8f9a6a' });
  },
  render(ctx) {
    crateScene(ctx, Intro.t, { hatch: 0 });
    drawManatee(ctx, A.you, Intro.t);
    cratePileFront(ctx);
    looseRender(ctx, SC.loose);
    drawCapOtter(ctx, SC.ot, Intro.t);
    // the bolt, and what he is doing to it
    P(ctx, IP.ink, 496, 232, 14, 14); P(ctx, '#5d6675', 497, 233, 12, 12);
    P(ctx, '#9aa6b6', 497, 233, 12, 4); P(ctx, IP.ink, 500, 237, 6, 6);
    if (SC.spark > 0) {
      glowPatch(ctx, 503, 239, 54, 40, '#ffd27a', 0.38 * SC.spark, 4);
      P(ctx, '#fff6cc', 500, 236, 5, 5);
    }
    FX.render(ctx);
    if (SC.hit > 0) { ctx.fillStyle = rgbaq('#ffe9b0', qa(SC.hit * 0.10)); ctx.fillRect(0, 0, 640, 360); }
    holdLight(ctx);
    motes(ctx, Intro.t * 6, Intro.t, 30, '#ffe0a0', 0.26);
    if (SC.dim > 0) { ctx.fillStyle = rgbaq('#05070c', qa(SC.dim * 0.55)); ctx.fillRect(0, 0, 640, 360); }
  },
});

// ------------------------------------------------------------- 9. BREAK OUT
//  His plan, her shoulder.  The bolt goes, the boards go, nineteen days of
//  somebody else's catch goes up in the air, and the two of them take the
//  shortest way out of a boat there is -- through the side of it, with him
//  stood on her back shouting directions the whole way.
//  This is the loudest thing in the cinematic and it is meant to be.
BEATS.push({
  name: 'breakout', dur: 12.0,
  talk: [
    [0.35, 'otter', 'NOW! Shoulder! GO!'],
    [2.00, 'you', 'Hold on to something.'],
    [3.40, 'otter', 'I AM holding you!'],
    [5.00, 'otter', 'Left! The hull\'s thin there!'],
    [7.00, 'you', 'Not the door, then.'],
    [8.60, 'otter', 'HA! Beautiful!'],
    [10.10, 'otter', 'Now do that to the rest.'],
  ],
  anchor(who) {
    if (who === 'otter') return [clamp(SC.ot.x + 2, 80, 560), SC.ot.y - 40, 1];
    return [clamp(A.you.x + 26, 80, 540), A.you.y - 34, 1];
  },
  enter() {
    holdArt();
    SC.popped = false; SC.smash = false; SC.splash = false;
    SC.boardOff = null; SC.boards = null; SC.run = 0; SC.flash = 0; SC.shout = 0;
    SC.loose = []; SC.thin = false; SC.boatX = 214; SC.boatY = 158; SC.arc = 0;
    for (let i = 0; i < 26; i++) looseAdd(SC.loose, { x: rand(20, 620), y: pileFrontTop(300) - 26, vx: rand(-14, 14), vy: rand(0, 30), r: rand(0, TAU), vr: rand(-4, 4), s: randi(0, CATCH.all.length - 1), f: Math.random() > 0.5, rest: 0, hop: 0 });
    A.you = actor(MAN.youBig, 250, 252, { beat: 1.0, exp: 'angry', tailAmp: 0.2, rot: 0.04, scarred: true });
    A.you.wounds = [{ x: 8, y: -3, r: 5 }, { x: -16, y: 4, r: 3 }];
    SC.ot = { x: 470, y: 232, phase: 0, rot: 0, exp: 'angry', flip: true, ride: false,
              sq: 0, sqv: 0, sx: 1, sy: 1, blade: 1, bladeR: -0.4, headR: 0 };
  },
  update(dt, bt) {
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    SC.flash = Math.max(0, SC.flash - dt * 4);
    SC.arc = Math.max(0, SC.arc - dt * 2.8);
    SC.ot.phase += dt * 2.4;
    A.you.exp = talking('you') ? 'talk' : 'angry';
    SC.ot.exp = talking('otter') ? 'talk' : bt > 8.4 ? 'grin' : 'angry';
    // ---- where he is.  On the bolt, then on her back for the rest of it.
    const aboard = ss2(clamp((bt - 1.35) / 0.7, 0, 1));
    if (bt < 1.6) {                                    // the last turns of the bolt
      SC.ot.flip = false;
      SC.ot.x = smooth(SC.ot.x, 474, 6, dt); SC.ot.y = smooth(SC.ot.y, 236, 6, dt);
      SC.ot.bladeR = 0.92 + Math.sin(bt * 15) * 0.45;
      SC.ot.armNear = -0.55 + Math.sin(bt * 15) * 0.5;
      if (Math.random() < 12 * dt) { Intro.shake = Math.max(Intro.shake, 2.4); if (typeof Audio_ !== 'undefined') Audio_.tone(224, 0.07, 'square', 0.12, -80); }
      A.you.beat = 1.4;
      A.you.y = 252 + Math.sin(bt * 1.4) * 3;
    } else if (bt < 3.2) {                             // POP, and the crate lets go
      if (!SC.popped) {
        SC.popped = true; SC.flash = 1; SC.arc = 1; Intro.shake = 18;
        kick(A.you, 11); kick(SC.ot, 9);
        SC.boardOff = { x: 0, y: 0, r: 0, vx: 230, vy: -70, vr: 5 };
        SC.boards = [];
        for (let i = 0; i < 4; i++) SC.boards.push({ x: 430 - i * 42, y: 0, r: 0, vx: 150 + i * 60, vy: -130 - i * 40, vr: rand(-6, 6) });
        FX.chunks(506, 176, 38);
        SC.thin = true;
        pileBurst(SC.loose, 470, 214, 210);
        FX.catchSpray(330, 270, 46, 1.2);
        if (typeof Audio_ !== 'undefined') { Audio_.explosion(0.8); Audio_.noise(0.4, 0.3, 2600, 300); }
        for (let i = 0; i < 44; i++) FX.add({ k: 'd', x: rand(440, 560), y: rand(120, 260), vx: rand(20, 260), vy: rand(-180, 120), life: rand(0.5, 1.4), c: '#ffd27a' });
      }
      const k = clamp((bt - 1.6) / 1.6, 0, 1);
      A.you.x = lerp(250, 320, k); A.you.y = lerp(252, 222, inCube(k));
      A.you.rot = lerp(0.04, -0.18, k); A.you.beat = 7;
      if (Math.random() < 40 * dt) FX.add({ k: 'c', x: rand(200, 520), y: rand(200, 300), vx: rand(-90, 190), vy: rand(-220, -40), life: rand(0.6, 1.4), w: randi(2, 5), h: randi(1, 3), c: pick(['#d08a76', '#eab79c', '#93a0aa', '#c3ced6']) });
      if (Math.random() < 34 * dt) FX.catchSpray(A.you.x, A.you.y + 20, 2, 0.8);
    } else if (bt < 5.4) {                             // down the hold, men above
      SC.run = clamp((bt - 3.2) / 2.2, 0, 1);
      A.you.x = 320; A.you.y = 212 + Math.sin(bt * 8) * 5;
      A.you.rot = -0.1 + Math.sin(bt * 8) * 0.07; A.you.beat = 11;
      SC.shout = 1;
      Intro.shake = Math.max(Intro.shake, 3);
      if (Math.random() < 30 * dt) FX.add({ k: 'd', x: rand(0, 640), y: 46, vx: rand(-10, 10), vy: rand(60, 160), life: rand(0.4, 0.9), c: '#6a5b3a' });
      if (typeof Audio_ !== 'undefined') { sndT -= dt; if (sndT <= 0) { sndT = 0.34; Audio_.noise(0.2, 0.09, 420, 60); } }
      if (bt > 5.1 && !SC.smash) {
        SC.smash = true; SC.flash = 1; SC.arc = 1; Intro.shake = 22;
        if (typeof Audio_ !== 'undefined') { Audio_.explosion(1.1); Audio_.splash(3); }
      }
    } else if (bt < 8.0) {                             // out through the hull
      const k = clamp((bt - 5.4) / 2.6, 0, 1);
      SC.boatX = 214 - k * 26;
      A.you.x = lerp(SC.boatX + 96, 580, k); A.you.y = lerp(272, 304, ss(k));
      A.you.rot = lerp(-0.22, 0.14, k); A.you.beat = 9;
      if (k < 0.3 && Math.random() < 40 * dt) FX.chunks(A.you.x, A.you.y, 2);
      if (Math.random() < 26 * dt) FX.bubble(A.you.x - 26, A.you.y + rand(-8, 8), 1, 2.4);
      if (!SC.splash && k > 0.06) {
        SC.splash = true; Intro.shake = 10;
        FX.drops(A.you.x, 260, 60, 1.3); FX.foam(A.you.x, 268, 40, 1.6);
        if (typeof Audio_ !== 'undefined') Audio_.splash(3);
      }
    } else {                                           // clear water, and gone
      const k = clamp((bt - 8.0) / 4.0, 0, 1);
      Intro.scroll += lerp(140, 320, k) * dt;
      A.you.x = smooth(A.you.x, 300, 3, dt) + Math.sin(bt * 1.4) * 5;
      A.you.y = 216 + Math.sin(bt * 3.4) * 9;
      A.you.rot = Math.sin(bt * 3.4) * 0.10; A.you.beat = 7;
      if (Math.random() < 34 * dt) FX.bubble(A.you.x - 40, A.you.y + 6, 1, 2.4);
      FX.flow(-240, dt);
      if (Math.random() < 5 * dt) {
        const wp = bodyPoint(A.you, A.you.wounds[0].x, A.you.wounds[0].y);
        FX.blood(wp[0] - rand(2, 12), wp[1], 1, 0.5);
      }
    }
    // once he is aboard he rides her, on his feet, for every frame of it
    if (bt >= 1.35) {
      SC.ot.flip = false;
      const rx = A.you.x + 4, ry = A.you.y - 27;
      SC.ot.x = smooth(SC.ot.x, lerp(SC.ot.x, rx, aboard), 16, dt);
      SC.ot.y = smooth(SC.ot.y, lerp(SC.ot.y, ry, aboard), 16, dt);
      SC.ot.rot = smooth(SC.ot.rot, A.you.rot, 9, dt);
      SC.ot.armNear = 0.95 + Math.sin(SC.ot.phase * 2.1) * 0.60 - (bt > 4.9 ? 1.9 : 0);
      SC.ot.armFar = -0.95 - Math.sin(SC.ot.phase * 1.7) * 0.45;
      SC.ot.bladeR = -0.9 - (bt > 4.9 ? 0.5 : 0);
    }
    if (SC.boardOff) {
      const b = SC.boardOff;
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 260 * dt; b.r += b.vr * dt;
    }
    if (SC.boards) for (const b of SC.boards) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 300 * dt; b.r += b.vr * dt; }
    if (bt < 5.4) looseUpdate(SC.loose, dt, SC.thin ? pileThinTop : pileFrontTop, Intro.t);
  },
  render(ctx, bt) {
    if (bt < 5.4) {
      crateScene(ctx, Intro.t, { hatch: 0, boardOff: SC.boardOff, thin: SC.thin });
      if (SC.run > 0) {                                 // boots stamping on the boards above
        for (let i = 0; i < 4; i++) {
          const bx = R(60 + i * 150 - SC.run * 260);
          const st = Math.sin(Intro.t * 9 + i * 1.7) > 0 ? 0 : 3;
          P(ctx, IP.ink, bx, 26 + st, 22, 12); P(ctx, IP.ink, bx + 26, 30 - st, 20, 10);
        }
        speedLines(ctx, 520, 200, 16, 90, 1, 'rgba(230,220,190,0.25)', 5);
      }
      if (SC.boards) for (const b of SC.boards) {
        const H2 = holdArt();
        ctx.save(); ctx.translate(R(b.x), R(b.y + 170)); ctx.rotate(b.r);
        ctx.drawImage(H2.plank.c, -H2.plank.ax, -H2.plank.ay); ctx.restore();
      }
      drawManatee(ctx, A.you, Intro.t);
      cratePileFront(ctx, SC.thin);
      looseRender(ctx, SC.loose);
      drawCapOtter(ctx, SC.ot, Intro.t);
      if (SC.arc > 0) bladeArc(ctx, SC.ot.x + 8, SC.ot.y, 30, -2.2, 0.9, SC.arc);
      FX.render(ctx);
      holdLight(ctx);
      if (SC.shout && bt > 3.5) {
        pixelTextOutlined(ctx, 'IT IS LOOSE!', 150, 70, 9, '#ffe48f', '#14141c', 'center');
        if (bt > 4.2) pixelTextOutlined(ctx, 'GET THE GAFF!', 470, 84, 9, '#ffe48f', '#14141c', 'center');
      }
    } else {
      // outside: the boat with a hole in her side
      backdrop(ctx, { mood: 'dawn', grade: 'dawn', scroll: Intro.scroll, t: Intro.t, surfY: bt < 8.0 ? 252 : 46, bedY: 352, shafts: 0.6, causticBed: true });
      if (bt < 8.0) {
        drawAir(ctx, 252, Intro.scroll, Intro.t, 'day');
        ctx.save(); ctx.translate(R(SC.boatX), R(SC.boatY + 94)); ctx.rotate(0.04);
        ctx.drawImage(YAC.s.c, -YAC.s.ax, -YAC.s.ay); ctx.restore();
        // the hole, in the part of the hull that is actually in the water
        hullHole(ctx, R(SC.boatX + 86), 274, 27, 31);
        drawManatee(ctx, A.you, Intro.t);
        drawCapOtter(ctx, SC.ot, Intro.t);
      } else {
        const k = clamp((bt - 8.0) / 4.0, 0, 1);
        drawAir(ctx, 46, Intro.scroll, Intro.t, 'day');
        ctx.save(); ctx.translate(R(520 - k * 460), 78); ctx.scale(0.42 - k * 0.24, 0.42 - k * 0.24);
        ctx.globalAlpha = qa(0.9 - k * 0.7);
        ctx.drawImage(YAC.s.c, -YAC.s.ax, -YAC.s.ay); ctx.restore();
        drawManatee(ctx, A.you, Intro.t);
        drawCapOtter(ctx, SC.ot, Intro.t);
        speedLines(ctx, A.you.x - 90, A.you.y, 16, 64, -1, 'rgba(190,225,245,0.32)', 7);
      }
      FX.render(ctx);
      foreground(ctx, { grade: 'dawn', scroll: Intro.scroll, t: Intro.t, bedY: 352 });
    }
    if (SC.flash > 0) { ctx.fillStyle = rgbaq('#ffffff', qa(SC.flash * 0.8)); ctx.fillRect(0, 0, 640, 360); }
  },
});

// ------------------------------------------------------------------ 10. REEF
//  She takes him home.  This used to be the beat the otter arrived in --
//  dropped through the surface blade first -- and he is already standing on
//  her back now, so what is left is the thing that beat was really for: the
//  water she grew up in, four days later, still full of her family.  Sixteen
//  clouds of them hang in it at the top of the beat and are still hanging at
//  the end.  A barb the fleet cut loose is buried in the sand with the line
//  still on it.  He does not have a joke for this one.
BEATS.push({
  name: 'reef', dur: 9.0,
  talk: [
    [0.70, 'otter', 'This your water?'],
    [2.30, 'you', 'It was.'],
    [3.60, 'otter', 'It\'s still red.'],
    [5.20, 'you', 'That\'s my mother.'],
    [6.90, 'otter', '...Aye. I know that red.'],
  ],
  anchor(who) {
    if (who === 'otter') return [clamp(SC.ot.x + 4, 80, 560), SC.ot.y - 40, 1];
    return [clamp(A.you.x + 34, 80, 540), A.you.y - 26, 1];
  },
  enter() {
    A.you = actor(MAN.youBig, 268, 206, { beat: 0.80, exp: 'pain', tailAmp: 0.12, scarred: true });
    A.you.wounds = [{ x: 8, y: -3, r: 5 }, { x: -16, y: 4, r: 3 }];
    SC.ot = { x: 272, y: 179, phase: 0, rot: 0, exp: 'idle', flip: false, ride: false,
              sq: 0, sqv: 0, sx: 1, sy: 1, blink: false, blade: 1, bladeR: -1.0, bladeWet: 1 };
    SC.sch1 = makeSchool(7, 600, 140, 40, 0, 2, -15);
    SC.surfY = 62; SC.gore = 0.58; SC.seen = false;
    // her family, still in the water, going nowhere
    for (let i = 0; i < 13; i++) FX.blood(rand(90, 560), rand(112, 268), 1, rand(1.2, 2.6), true);
    // a barb the fleet cut loose on its way out, buried in the sand with
    // the line still on it and somebody still on the line
    SC.line = { x: 412, y: 298, a: 1.22 };
  },
  update(dt, bt) {
    Intro.scroll += 7 * dt;
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    SC.gore = smooth(SC.gore, 0.46, 0.5, dt);
    // she slows down as she comes over it, and stops
    const slow = ss2(clamp(bt / 3.2, 0, 1));
    A.you.beat = lerp(2.6, 0.7, slow);
    A.you.x = smooth(A.you.x, 268, 2.2, dt) + Math.sin(bt * 0.34) * 4;
    A.you.y = lerp(206, 224, slow) + Math.sin(bt * 0.62) * 3;
    A.you.rot = smooth(A.you.rot, bt > 5.0 ? -0.05 : 0.06, 3, dt);
    A.you.exp = talking('you') ? 'talk' : bt > 5.0 ? 'sad' : 'pain';
    // he rides her, and for once he keeps still
    SC.ot.x = smooth(SC.ot.x, A.you.x + 4, 11, dt);
    SC.ot.y = smooth(SC.ot.y, A.you.y - 27, 11, dt);
    SC.ot.rot = smooth(SC.ot.rot, A.you.rot, 9, dt);
    SC.ot.phase += dt * 1.6;
    SC.ot.exp = talking('otter') ? 'talk' : bt > 6.8 ? 'angry' : 'idle';
    const gab = talking('otter') ? 1 : 0.2;
    SC.ot.armNear = 0.95 + Math.sin(SC.ot.phase * 2.0) * 0.45 * gab;
    SC.ot.armFar = -0.95 - Math.sin(SC.ot.phase * 1.6) * 0.34 * gab;
    SC.ot.headR = (bt > 3.4 && bt < 6.4 ? 0.18 : 0) + Math.sin(SC.ot.phase * 1.2) * 0.07 * gab;
    // she is still open, and it is still running
    if (Math.random() < 4.0 * dt) {
      const wp = bodyPoint(A.you, A.you.wounds[0].x, A.you.wounds[0].y);
      FX.blood(wp[0], wp[1], 1, 0.7);
    }
    if (!SC.seen && bt >= 5.2) { SC.seen = true; kick(A.you, -5); }
    if (Math.random() < 1.1 * dt) FX.bubble(A.you.x + 30, A.you.y - 10, 1, 0.35);
  },
  render(ctx) {
    backdrop(ctx, { mood: 'lagoon', grade: 'noon', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 306, shafts: 1, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    // the cut line, drifting off a barb that is buried in the sand
    const lx = SC.line.x, sw = Math.sin(Intro.t * 0.55) * 9;
    drawRope(ctx, lx - 8, SC.line.y - 14, lx - 86 + sw, SC.line.y - 62, 26, '#d8cfae', '#7a6a44');
    drawRope(ctx, lx - 86 + sw, SC.line.y - 62, lx - 150 + sw * 1.6, SC.line.y - 44, 20, '#d8cfae', '#7a6a44');
    ctx.save(); ctx.translate(R(lx), R(SC.line.y)); ctx.rotate(SC.line.a);
    ctx.drawImage(HARP.c, -HARP.ax, -HARP.ay);
    ctx.restore();
    P(ctx, IP.blood[1], R(lx) - 9, R(SC.line.y) - 16, 8, 4);
    P(ctx, IP.blood[3], R(lx) - 8, R(SC.line.y) - 15, 5, 2);
    drawManatee(ctx, A.you, Intro.t);
    drawCapOtter(ctx, SC.ot, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'noon', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, bedY: 306 });
  },
});

// ----------------------------------------------------------------- 11. PACT
//  Not a rescuer and not a friend yet: a pirate who has wanted that fleet on
//  the bottom for years, stood on the back of something that wants it more.
//  They agree on the work, out loud, and that is the deal the whole game is
//  played under.
BEATS.push({
  name: 'pact', dur: 10.5,
  talk: [
    [0.40, 'otter', 'I sink boats for plunder.'],
    [2.10, 'you', 'I sink them for this.'],
    [3.70, 'otter', 'Better reason. Same work.'],
    [5.50, 'otter', 'So. Partners, or passengers?'],
    [7.20, 'you', 'Every boat. Then my brother.'],
    [9.00, 'otter', 'Aye. Sharpen up. We hunt.'],
  ],
  anchor(who) {
    if (who === 'otter') return [clamp(SC.ot.x + 4, 80, 560), SC.ot.y - 40, 1];
    return [clamp(A.you.x + 36, 80, 540), A.you.y - 26, 1];
  },
  enter() {
    A.you = actor(MAN.youBig, 234, 226, { beat: 0.9, exp: 'pain', tailAmp: 0.14, scarred: true });
    A.you.wounds = [{ x: 8, y: -3, r: 5 }, { x: -16, y: 4, r: 3 }];
    // he steps off her back to say it to her face, and comes back for the end
    SC.ot = { x: 330, y: 200, phase: 0, rot: 0, exp: 'angry', flip: true, ride: true,
              sq: 0, sqv: 0, sx: 1, sy: 1, blade: 1, bladeR: -1.05, bladeWet: 1 };
    SC.sch1 = makeSchool(8, 590, 130, 44, 0, 3, -18);
    SC.offer = false; SC.flourish = false; SC.surfY = 72; SC.arc = 0; SC.gore = 0.44;
    for (let i = 0; i < 6; i++) FX.blood(rand(80, 580), rand(130, 258), 1, rand(1.0, 2.2), true);
  },
  update(dt, bt) {
    Intro.scroll += 9 * dt;
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    SC.gore = smooth(SC.gore, 0.28, 0.5, dt);
    A.you.x = smooth(A.you.x, 234, 3, dt) + Math.sin(bt * 0.5) * 0.4;
    A.you.y = 226 + Math.sin(bt * 0.66) * 4;
    A.you.rot = smooth(A.you.rot, bt > 7.4 ? -0.10 : 0.04, 3, dt);
    A.you.exp = talking('you') ? 'talk' : bt > 2.0 ? 'angry' : 'pain';
    if (Math.random() < 3.5 * dt) {
      const wp = bodyPoint(A.you, A.you.wounds[0].x, A.you.wounds[0].y);
      FX.blood(wp[0], wp[1], 1, 0.62);
    }
    // he never holds still: a slow figure of eight with two errands in it
    const offer = clamp((bt - 5.40) / 0.55, 0, 1);            // blade out to her
    const back = clamp((bt - 6.30) / 0.75, 0, 1);             // and away again
    const near = clamp((bt - 8.30) / 0.90, 0, 1);             // alongside, at the end
    const hover = [370 + Math.sin(bt * 0.95) * 34, 200 + Math.sin(bt * 1.42) * 15];
    const nose = [306, 212], side = [334, 234];
    let ox = hover[0], oy = hover[1];
    if (offer > 0 && back < 1) {
      const k = ss(offer) * (1 - ss(back));
      ox = lerp(ox, nose[0], k); oy = lerp(oy, nose[1], k);
    }
    if (near > 0) { const k = ss(near); ox = lerp(ox, side[0], k); oy = lerp(oy, side[1], k); }
    SC.ot.x = smooth(SC.ot.x, ox, 9, dt);
    SC.ot.y = smooth(SC.ot.y, oy, 9, dt);
    SC.ot.phase += dt * 2.2;
    // the flourish, between his two boasts: a whole turn with the blade out,
    // and a swept arc of steel where the sparkles used to be
    const spin = clamp((bt - 3.55) / 0.85, 0, 1);
    SC.ot.rot = TAU * ss2(spin) + Math.sin(bt * 1.8) * 0.07;
    SC.ot.exp = talking('otter') ? 'talk' : 'angry';
    SC.ot.bladeR = -1.05 - ss(offer) * 0.45 + (spin > 0 && spin < 1 ? Math.sin(spin * Math.PI) * 0.9 : 0);
    SC.ot.armNear = 0.85 + Math.sin(SC.ot.phase * 1.3) * 0.35 - ss(offer) * 0.9 * (1 - ss(back)) + (near > 0 ? -ss(near) * 1.4 : 0);
    SC.ot.armFar = -0.85 - Math.sin(SC.ot.phase * 1.1) * 0.28;
    if (spin > 0.04 && spin < 0.96) SC.arc = 1;
    SC.arc = Math.max(0, SC.arc - dt * 2.6);
    if (spin > 0.04 && spin < 0.96 && Math.random() < 12 * dt) {
      // flicking the last of somebody off it
      FX.spurt(SC.ot.x + rand(-14, 14), SC.ot.y + rand(-10, 10), rand(0, TAU), 1, 0.35);
    }
    if (!SC.offer && offer >= 1) {
      SC.offer = true;
      kick(A.you, 5); kick(SC.ot, 5);
      FX.bubble(A.you.x + 40, A.you.y - 6, 5, 1.2);
      if (typeof Audio_ !== 'undefined') Audio_.tone(300, 0.07, 'square', 0.05, -120);
    }
    if (!SC.flourish && spin >= 1) {
      SC.flourish = true;
      kick(SC.ot, 6);
      if (typeof Audio_ !== 'undefined') { Audio_.noise(0.12, 0.07, 3600, 900); Audio_.tone(880, 0.06, 'sawtooth', 0.05, -400); }
    }
    if (Math.random() < 1.1 * dt) FX.bubble(SC.ot.x + rand(-8, 8), SC.ot.y - 12, 1, 1.1);
    if (Math.random() < 0.5 * dt) FX.bubble(A.you.x + 34, A.you.y - 10, 1, 0.5);
  },
  render(ctx) {
    backdrop(ctx, { mood: 'dawn', grade: 'dawn', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 316, shafts: 1, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    drawManatee(ctx, A.you, Intro.t);
    drawCapOtter(ctx, SC.ot, Intro.t);
    if (SC.arc > 0) bladeArc(ctx, SC.ot.x, SC.ot.y, 30, -2.2, 1.4, SC.arc);
    FX.render(ctx);
    foreground(ctx, { grade: 'dawn', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, bedY: 316 });
  },
});

// -------------------------------------------------------------- 12. COLOURS
//  Not an escape.  The old ending ran them off into empty water; this one
//  turns them round and points them AT the fleet, with the black flag up and
//  her still bleeding out of the hole they put in her.
BEATS.push({
  name: 'colours', dur: 6.0,
  talk: [
    [0.75, 'you', 'Every last boat.'],
    [2.20, 'otter', 'COLOURS UP! NO QUARTER!'],
  ],
  anchor(who) {
    if (who === 'otter') return [SC.ot.x + 6, SC.ot.y - 44, 1];
    return [A.you.x + 40, A.you.y - 24, 1];
  },
  enter() {
    A.you = actor(MAN.youBig, 250, 214, { beat: 1.3, exp: 'angry', tailAmp: 0.30, scarred: true });
    A.you.wounds = [{ x: 8, y: -3, r: 5 }, { x: -16, y: 4, r: 3 }];
    // He is on his FEET for the charge, not folded into the riding torso:
    // this is the one beat where he is stood up on her back, and it is the
    // beat that has to show the legs the cast gives him.
    SC.ot = { x: 300, y: 152, phase: 0, rot: 0, exp: 'angry', flip: false, ride: false,
              sq: 0, sqv: 0, sx: 1, sy: 1, blade: 1, bladeR: -1.4, bladeWet: 1 };
    SC.sch1 = makeSchool(12, 560, 168, 64, 0, 1, -28);
    SC.sch2 = makeSchool(7, 660, 262, 42, 1, 0, -24);
    SC.on = false; SC.surfY = 82; SC.spd = 26; SC.flag = 0; SC.fleet = 760; SC.gore = 0.28;
  },
  update(dt, bt) {
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    SC.gore = smooth(SC.gore, 0.14, 0.6, dt);
    // he climbs aboard, gets the colours up, and then they go
    const land = ss2(clamp(bt / 1.20, 0, 1));
    const ride = [A.you.x + 4, A.you.y - 27];   // feet on her back, not sunk into it
    SC.ot.x = smooth(SC.ot.x, lerp(300, ride[0], land), 11, dt);
    SC.ot.y = smooth(SC.ot.y, lerp(152, ride[1], land), 11, dt);
    SC.ot.phase += dt * (2 + SC.spd * 0.012);
    SC.ot.rot = smooth(SC.ot.rot, A.you.rot, 9, dt);
    SC.ot.exp = talking('otter') ? 'talk' : 'angry';
    SC.ot.armNear = 0.95 + Math.sin(SC.ot.phase * 1.4) * 0.28 - (bt > 2.3 ? 1.7 : 0);
    SC.ot.armFar = -0.95 - Math.sin(SC.ot.phase * 1.2) * 0.22;
    SC.ot.bladeR = -1.4 - (bt > 2.3 ? 0.35 : 0);
    // the black flag goes up on the line, not on a cut
    SC.flag = smooth(SC.flag, bt > 1.55 ? 1 : 0, 3.4, dt);
    if (!SC.on && land >= 0.999) {
      SC.on = true;
      kick(A.you, 6); kick(SC.ot, 8);
      FX.foam(SC.ot.x, SC.ot.y + 10, 12, 0.8);
      if (typeof Audio_ !== 'undefined') Audio_.tone(190, 0.09, 'square', 0.06, -80);
    }
    // the run: it builds, it does not switch on
    SC.spd = smooth(SC.spd, bt > 2.35 ? 320 : 26, 1.35, dt);
    Intro.scroll += SC.spd * dt;
    SC.fleet -= (26 + SC.spd * 0.92) * dt;
    A.you.beat = lerp(1.3, 7.4, clamp(SC.spd / 320, 0, 1));
    A.you.x = smooth(A.you.x, 250, 3, dt);
    A.you.y = lerp(214, 196, ss(clamp((bt - 2.3) / 2.6, 0, 1))) + Math.sin(bt * 2.1) * 5 * clamp(SC.spd / 160, 0.3, 1);
    A.you.rot = smooth(A.you.rot, Math.sin(bt * 2.1) * 0.07 - clamp(SC.spd / 320, 0, 1) * 0.06, 8, dt);
    A.you.exp = talking('you') ? 'talk' : 'angry';
    if (SC.spd > 90 && Math.random() < 34 * dt) FX.bubble(A.you.x - 48, A.you.y + rand(-8, 10), 1, 2.4);
    // she is still open, and at this speed it comes off her in a ribbon
    FX.flow(-SC.spd * 0.85, dt);
    if (Math.random() < (3 + SC.spd * 0.018) * dt) {
      const wp = bodyPoint(A.you, A.you.wounds[0].x, A.you.wounds[0].y);
      FX.blood(wp[0] - rand(2, 14), wp[1] + rand(-3, 3), 1, 0.55);
    }
    // out on a red bloom, not a warm one: what they are riding into is a war
    if (bt > 4.85) { Intro.fadeCol = '#8d1420'; Intro.fade = ss(clamp((bt - 4.85) / 1.0, 0, 1)); }
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'dawn', grade: 'dawn', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, surfY: SC.surfY, bedY: 330, shafts: 1, causticBed: true });
    drawAir(ctx, SC.surfY, Intro.scroll, Intro.t, 'day');
    // the fleet they are running AT, closing
    const fk = clamp((760 - SC.fleet) / 600, 0, 1), fs = lerp(0.46, 0.92, fk);
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(R(SC.fleet + i * 210 * fs), R(SC.surfY + 2));
      ctx.scale(fs, fs);
      ctx.drawImage(BOAT.s.c, -BOAT.s.ax, -BOAT.s.ay);
      ctx.restore();
    }
    drawSchool(ctx, SC.sch1, Intro.t, Intro.dt);
    drawSchool(ctx, SC.sch2, Intro.t, Intro.dt);
    if (SC.spd > 70) {
      const a = clamp((SC.spd - 70) / 250, 0, 1);
      // speedLines lays its streaks out off a fixed hash, so anchoring them
      // to a stationary actor pinned them to the screen.  They are towed
      // backwards through a wrap now, and actually stream.
      const w1 = (Intro.t * 340) % 74, w2 = (Intro.t * 250) % 58;
      speedLines(ctx, A.you.x - 84 - w1, A.you.y, R(8 + a * 14), R(34 + a * 54), -1, rgbaq('#f2fdff', 0.24 + a * 0.36), 7);
      speedLines(ctx, A.you.x - 40 - w2, A.you.y, R(5 + a * 8), R(26 + a * 40), -1, rgbaq('#ffb0a2', 0.12 + a * 0.22), 21);
    }
    drawJolly(ctx, SC.ot.x - 23, SC.ot.y + 10, Intro.t, SC.flag);
    drawManatee(ctx, A.you, Intro.t);
    drawCapOtter(ctx, SC.ot, Intro.t);
    FX.render(ctx);
    foreground(ctx, { grade: 'dawn', gore: SC.gore, scroll: Intro.scroll, t: Intro.t, bedY: 330 });
  },
});

// ============================================================== THE  INTRO =
const Intro = {
  t: 0, bt: 0, dt: 1 / 60, beat: 0, done: false,
  scroll: 0, shake: 0, fade: 0, fadeCol: '#fff3d6', grace: 0.35,
  reset() {
    buildIntroArt();
    this.t = 0; this.bt = 0; this.dt = 1 / 60; this.beat = 0; this.done = false;
    this.scroll = 0; this.shake = 0; this.fade = 0; this.grace = 0.4;
    // the last beat washes out through blood; a replay starts in daylight
    this.fadeCol = '#fff3d6';
    sndT = 0; sndT2 = 0;
    FX.clear();
    sayReset();
    for (const k in SC) delete SC[k];
    if (BUILT && BEATS[0].enter) BEATS[0].enter();
  },
  // The cinematic can no longer be skipped; kept as a no-op so older
  // callers (and any saved bindings) do not throw.
  skip() { },
  next() {
    this.beat++; this.bt = 0; this.fade = 0; this.scroll = 0; this.shake = 0;
    this.fadeCol = '#fff3d6';
    FX.clear();
    sayReset();
    for (const k in SC) delete SC[k];
    if (this.beat >= BEATS.length) { this.done = true; return; }
    if (BEATS[this.beat].enter) BEATS[this.beat].enter();
  },
  update(dt) {
    if (this.done) return;
    if (!BUILT) { buildIntroArt(); if (!BUILT) { this.done = true; return; } if (BEATS[this.beat].enter) BEATS[this.beat].enter(); }
    if (dt > 1 / 20) dt = 1 / 20;
    this.dt = dt; this.t += dt; this.bt += dt; this.grace -= dt;
    // Nothing hurries the cinematic: no skip, no beat advance. It plays through.
    // It reads no input at all -- game.js holds the only way past it.
    this.shake = Math.max(0, this.shake - dt * 30);
    const b = BEATS[this.beat];
    if (!b) { this.done = true; return; }
    // speech first, so a beat can pose its actors off who is talking
    sayUpdate(b, this.bt, dt);
    b.update(dt, this.bt);
    FX.update(dt);
    if (this.bt >= b.dur) this.next();
  },
  render(ctx) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (!BUILT || this.done) {
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 640, 360);
      ctx.restore(); return;
    }
    const b = BEATS[this.beat];
    if (!b) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 640, 360); ctx.restore(); return; }
    ctx.save();
    if (this.shake > 0.2) ctx.translate(R(rand(-this.shake, this.shake)), R(rand(-this.shake, this.shake)));
    b.render(ctx, this.bt);
    ctx.restore();
    // Beat to beat, the picture dissolves through daylight instead of cutting.
    // A cut between two compositions is the harshest step a cinematic has and
    // this one has four of them; 0.22s of sun on either side hides them all.
    const edge = 0.18;
    const inK = this.beat === 0 ? 1 : clamp(this.bt / edge, 0, 1);
    const outK = clamp((b.dur - this.bt) / edge, 0, 1);
    const wash = Math.max(this.fade, 1 - ss(Math.min(inK, outK)));
    if (wash > 0) { ctx.fillStyle = rgbaq(this.fadeCol, wash); ctx.fillRect(0, 0, 640, 360); }
    if (this.t < 0.9) { ctx.fillStyle = rgbaq('#000000', 1 - ss(this.t / 0.9)); ctx.fillRect(0, 0, 640, 360); }
    letterbox(ctx);
    sayRender(ctx, b, this.bt);
    // beat pips
    if (this.t > 0.6) {
      const n = BEATS.length, w = n > 8 ? 5 : 7, gap = n > 8 ? 9 : 13;
      const x0 = R(320 - (n * gap - (gap - w)) / 2);
      for (let i = 0; i < n; i++) {
        P(ctx, i < this.beat ? '#5f6a76' : i === this.beat ? '#e8eef4' : '#2a323c', x0 + i * gap, 11, i === this.beat ? w + 2 : w, 2);
      }
    }
    ctx.restore();
  },
};

// ===========================================================================
//  CINE -- THE SAME ENGINE, PLAYED AGAIN
//  The intro's player above is wired to its own twelve beats and nothing
//  else.  Cine is a second player over the very same machinery -- backdrop(),
//  drawAir(), the cast composers, FX, the one speech track (SAY), the
//  letterbox and the daylight dissolve between beats -- driven by NAMED beat
//  lists instead, so every scene after the opening is shot in the opening's
//  hand without a line of it being copied.
//    Cine.play(ids, opts)   queue one or more scenes by name ('travel', 'village')
//    Cine.update(dt)        dt 0 is allowed: game.js holds the clock under a wipe
//    Cine.render(ctx)       640x360 logical units, like Intro.render
//    Cine.done              true once the queue is spent (tests may set it)
//    Cine.skip()            end the CURRENT scene and cut to the next one
//    Cine.prewarm()         bake one slice of scene art; call on idle frames
//  opts: { dest: {name, chapter, kind}, onScene(id, skipped) } -- onScene
//  fires as each scene ends, played out or skipped, so the caller can bank a
//  seen-flag for a scene only once it has actually gone by.
//  Beats are the intro's shape exactly: {name, dur, talk, anchor, enter,
//  update(dt, bt), render(ctx, bt)}; they read Cine.t / Cine.dt / Cine.scroll
//  where the intro's beats read Intro's.
// ===========================================================================
const CINE = {};                                   // scene id -> [beat, ...]

// ---- small shared pieces ----------------------------------------------------
// A hex shade that stays a HEX string: shadeBlob() reads its ramp through
// hexToRgb, so an rgb() string would come out black.
function shadeHex(hex, f) {
  const c = hexToRgb(hex);
  const h2 = v => ('0' + Math.max(0, Math.min(255, R(v))).toString(16)).slice(-2);
  return '#' + h2(c[0] * f) + h2(c[1] * f) + h2(c[2] * f);
}
function skinRamp(hex) { return [shadeHex(hex, 0.56), shadeHex(hex, 0.74), shadeHex(hex, 0.88), hex, shadeHex(hex, 1.10)]; }
// one pixel column laid down in runs of one colour, so a baked wall costs a
// handful of fills per column instead of one per pixel
function colRuns(ctx, px, y0, y1, fn) {
  let run = null, ry = y0;
  for (let y = y0; y <= y1; y++) {
    const c = y < y1 ? fn(y) : null;
    if (c !== run) { if (run) P(ctx, run, px, ry, 1, y - ry); run = c; ry = y; }
  }
}
// a hard disc, one fill per row -- the puffs, the bell mouth, the smoke
function disc(ctx, x, y, r, col) {
  r = Math.max(1, R(r)); x = R(x); y = R(y);
  ctx.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const w = R(Math.sqrt(Math.max(0, r * r - dy * dy)));
    if (w > 0) ctx.fillRect(x - w, y + dy, w * 2, 1);
  }
}
// a thick limb: ink first, one pixel fatter all round, then the colour
function limb(ctx, col, x0, y0, x1, y1, w) {
  cap_(ctx, IP.ink, x0, y0, x1, y1, w + 2);
  cap_(ctx, col, x0, y0, x1, y1, w);
}
// Where her back actually is, read off her raster at a body-local x.  The
// intro stands him at a fixed 27 up; this asks the sprite instead, so when
// the cast's side-on manatee changes shape he still lands ON her.
const _BACK = new Map();
function backTop(M, lx) {
  const key = M.L + ':' + lx;
  if (_BACK.has(key)) return _BACK.get(key);
  const s = M.bodyScar || M.body, W = s.c.width, H = s.c.height;
  const x = cx2(can(W, H));
  x.drawImage(s.c, 0, 0, W, H, 0, 0, W, H);
  const col = clamp(R(s.ax + lx), 0, W - 1);
  const d = x.getImageData(col, 0, 1, H).data;
  let top = -R(H * 0.4);
  for (let y = 0; y < H; y++) if (d[y * 4 + 3] > 128) { top = y - s.ay; break; }
  _BACK.set(key, top);
  return top;
}
// the otter's stand anchor sits 20 of his units above his soles
function riderY(m) { return backTop(m.set, 4) + 3 - 20; }
// Stand him on her back wherever she is and however she is turned: her
// body-local deck point, pushed through her transform.
function rideOn(ot, m, dt, rate) {
  const p = bodyPoint(m, 4, riderY(m));
  if (rate === undefined) { ot.x = p[0]; ot.y = p[1]; ot.rot = m.rot || 0; return; }
  ot.x = smooth(ot.x, p[0], rate, dt); ot.y = smooth(ot.y, p[1], rate, dt);
  ot.rot = smooth(ot.rot, m.rot || 0, rate * 0.7, dt);
}
// a speech anchor that can never push a one-row bubble into the bars
function anc(x, y) { return [clamp(R(x), 70, 570), Math.max(58, R(y)), 1]; }
// Hers, when he is stood on her back: the bubble hangs UNDER her, tail up to
// her mouth, so it never sits on top of him.
function ancUnder(m, cam) { return [clamp(R(m.x + 44), 70, 570), Math.min(300, R(m.y + 20 + (cam || 0))), -1]; }

// ---- the title card for a destination ---------------------------------------
// The intro's own card, reworded: the chapter numeral small and gold, the
// name dropped in on the same bounce and left bobbing.  No fade out -- the
// beat's dissolve (or the bubble wipe after it) carries it away.
function chapterCard(ctx, k, t, chap, name) {
  if (k <= 0) return;
  const drop = outBounce(clamp(k * 2.6, 0, 1));
  const bob = R(Math.sin(t * 1.6) * 1.5);
  const y = R(lerp(-40, 42, drop)) + bob;
  const a = clamp(k * 6, 0, 1);
  ctx.save(); ctx.globalAlpha = qa(a);
  const top = 'CHAPTER ' + (chap || '');
  const tw = R(textWidth(top, 9));
  P(ctx, '#14141c', 320 - tw / 2 - 34, y + 3, 26, 3); P(ctx, '#ffe48f', 320 - tw / 2 - 33, y + 4, 24, 1);
  P(ctx, '#14141c', 320 + tw / 2 + 8, y + 3, 26, 3); P(ctx, '#ffe48f', 320 + tw / 2 + 9, y + 4, 24, 1);
  pixelTextOutlined(ctx, top, 320, y, 9, '#ffe48f', '#14141c', 'center');
  if (k > 0.10) {
    const b = outBack(clamp((k - 0.10) * 3.2, 0, 1));
    pixelTextOutlined(ctx, name || '', R(lerp(840, 320, b)), y + 15, 24, '#fffaf0', '#173044', 'center');
  }
  ctx.restore();
}

// =========================================================== TRAVEL ART =====
//  Almost everything the run needs is already baked for the intro -- the
//  bright water, the reef, the kelp, the shafts, the fish, the trawler.  The
//  one new layer is a front rank of kelp in shadow that tears past faster
//  than anything else in frame, which is most of what reads as SPEED.
const TRV = { ready: false };
function buildKelpFront(seed) {
  const H = 250, c = can(LW, H), x = cx2(c), rng = new SeededRandom(seed);
  const xs = [96, 402, 640];
  for (let i = 0; i < xs.length; i++) {
    kelpStalk(xs[i] + R(rng.range(-24, 24)), rng, H - 1, R(rng.range(150, 236)), IP.kelp, R(rng.range(6, 8)), rng.range(-0.3, 0.3))(x);
  }
  return tintLayer(c, '#06282c', 0.55);
}
function travelArt() {
  if (TRV.ready) return TRV;
  TRV.kelpFront = buildKelpFront(5151);
  TRV.ready = true;
  return TRV;
}

// ========================================================== VILLAGE ART =====
//  Fisher Village, side on.  The play field's village (src/village.js) is
//  top-down; this is the same port from the water and from its own boards:
//  its tarred plank walls, its colour schemes a band lighter because the sun
//  is on them here, its fishers in their bandanas, tricorns and oilskins.
//  Two sets: the STREET (on the pier, level with the doors) and the
//  WATERLINE (from under the pier, looking up at it).  Everything static is
//  baked once, in slices, before the scene can start; the doors, shutters,
//  bell and people are drawn live on top.
const VIL = { ready: false, step: 0 };
const VHOUSE = {
  oxblood:  { wall: ['#4a2224', '#5e2c2c', '#733934'], dk: '#2c1418', roof: ['#2a1a1a', '#3a2622', '#4b332b'], trim: '#9a7a56', shut: '#4f6a5a' },
  pitch:    { wall: ['#2e2a32', '#3c3744', '#4e4857'], dk: '#1b181f', roof: ['#141016', '#201b22', '#2c262e'], trim: '#86765c', shut: '#6a3a2e' },
  bleached: { wall: ['#5e574a', '#70685b', '#837a6b'], dk: '#39342c', roof: ['#2e2a26', '#3b3630', '#48423a'], trim: '#aa9c7e', shut: '#3e566e' },
  indigo:   { wall: ['#282c3e', '#343a4e', '#434a60'], dk: '#181a28', roof: ['#1c1e28', '#282a36', '#353845'], trim: '#80849c', shut: '#6a5a2e' },
  rot:      { wall: ['#2f3b31', '#3d4b3f', '#4d5d4d'], dk: '#1c261e', roof: ['#232924', '#2f362f', '#3c443b'], trim: '#8a8c6e', shut: '#6a3a2e' },
};
const DECK = ['#3c2618', '#573820', '#734c2c', '#8e6639', '#a9854f'];
const WOOD = { d: '#3a2416', m: '#5c3a1c', l: '#8a5a2c', h: '#b57d3f' };

function vShutter(ctx, sx, sy, sw, sh, col) {
  sw = R(sw); if (sw < 1) return;
  const dk = shadeHex(col, 0.66), lt = shadeHex(col, 1.22);
  P(ctx, IP.ink, sx - 1, sy - 1, sw + 2, sh + 2);
  P(ctx, col, sx, sy, sw, sh);
  if (sw > 3) { P(ctx, lt, sx, sy, 1, sh); for (let i = 4; i < sw; i += 4) P(ctx, dk, sx + i, sy, 1, sh); }
  if (sw > 4) { P(ctx, dk, sx, sy + 3, sw, 2); P(ctx, dk, sx, sy + sh - 5, sw, 2); LN(ctx, dk, sx + 1, sy + sh - 5, sx + sw - 2, sy + 5); }
}
function vWindow(ctx, pal, wx, wy, ww, wh, shut) {
  P(ctx, IP.ink, wx - 2, wy - 2, ww + 4, wh + 4);
  P(ctx, pal.trim, wx - 1, wy - 1, ww + 2, wh + 2);
  P(ctx, '#140e12', wx, wy, ww, wh);
  P(ctx, '#211a1e', wx, wy + wh - 4, ww, 4);
  if (shut !== 'live') {
    P(ctx, pal.trim, wx + (ww >> 1), wy, 1, wh); P(ctx, pal.trim, wx, wy + (wh >> 1), ww, 1);
    P(ctx, '#6f8390', wx + 1, wy + 1, 2, 1); P(ctx, '#6f8390', wx + (ww >> 1) + 2, wy + (wh >> 1) + 2, 2, 1);
  }
  P(ctx, IP.ink, wx - 4, wy + wh + 1, ww + 8, 4); P(ctx, pal.trim, wx - 3, wy + wh + 1, ww + 6, 2);
  const sw = R(ww / 2);
  if (shut === 'open') { vShutter(ctx, wx - 3 - sw, wy, sw, wh, pal.shut); vShutter(ctx, wx + ww + 3, wy, sw, wh, pal.shut); }
  else if (shut === 'closed') { vShutter(ctx, wx, wy, sw, wh, pal.shut); vShutter(ctx, wx + sw, wy, ww - sw, wh, pal.shut); }
}
function vDoorPanel(ctx, dx, dy, dw, dh, col) {
  dw = R(dw); if (dw < 1) return;
  const dk = shadeHex(col, 0.62), lt = shadeHex(col, 1.2);
  P(ctx, IP.ink, dx, dy, dw, dh);
  if (dw < 3) return;
  P(ctx, col, dx + 1, dy + 1, dw - 2, dh - 1);
  P(ctx, lt, dx + 1, dy + 1, 1, dh - 1);
  for (let i = 5; i < dw - 1; i += 5) P(ctx, dk, dx + i, dy + 1, 1, dh - 1);
  if (dw > 6) {
    P(ctx, dk, dx + 1, dy + 7, dw - 2, 2); P(ctx, dk, dx + 1, dy + dh - 10, dw - 2, 2);
    P(ctx, '#1e2228', dx + 1, dy + 7, Math.min(8, dw - 2), 2); P(ctx, '#1e2228', dx + 1, dy + dh - 10, Math.min(8, dw - 2), 2);
    P(ctx, '#616a76', dx + 2, dy + 7, 2, 1); P(ctx, '#616a76', dx + 2, dy + dh - 10, 2, 1);
    P(ctx, IP.ink, dx + dw - 6, dy + (dh >> 1) - 1, 4, 4); P(ctx, '#c8a63a', dx + dw - 5, dy + (dh >> 1), 2, 2);
  }
}
function vDoor(ctx, pal, dx, dy, dw, dh, state, col) {
  P(ctx, IP.ink, dx - 3, dy - 3, dw + 6, dh + 3);
  P(ctx, pal.trim, dx - 2, dy - 2, dw + 4, dh + 2);
  P(ctx, shadeHex(pal.trim, 0.7), dx - 2, dy - 2, dw + 4, 1);
  P(ctx, '#0e0a0c', dx, dy, dw, dh);
  if (state === 'live') { P(ctx, '#1a1316', dx, dy, dw, 6); P(ctx, '#2a2024', dx + 2, dy + dh - 3, dw - 4, 3); return; }
  vDoorPanel(ctx, dx, dy, dw, dh, col || '#5a3a24');
}
// A house on the boards: board-and-batten walls, a gable or a pent roof,
// its windows and doors, and whatever the fishers hang off the front of it.
function vHouse(ctx, h) {
  const pal = h.pal, top = h.base - h.wallH, x0 = h.x, x1 = h.x + h.w, sd = h.x * 7 + 3;
  for (let px = x0; px < x1; px++) {
    const c = (px - x0) % 7;
    colRuns(ctx, px, top, h.base, y => {
      if (y < top + 3) return pal.dk;
      if (c === 0) return pal.dk;
      if (y > h.base - 7) return c === 1 ? pal.wall[1] : pal.wall[0];
      if (c === 1) return pal.wall[2];
      return vnoise(px * 0.23 + sd, y * 0.045) > 0.66 ? pal.wall[0] : pal.wall[1];
    });
  }
  P(ctx, IP.ink, x0 - 1, top, 1, h.wallH); P(ctx, IP.ink, x1, top, 1, h.wallH);
  // salt streaks and a tide of green where the spray reaches
  for (let i = 0; i < h.w / 9; i++) {
    const sx = x0 + R(hash2(i, sd) * h.w), sy = top + 6 + R(hash2(sd, i) * (h.wallH - 20));
    P(ctx, rgbaq('#d8d8c8', 0.16), sx, sy, 1, R(6 + hash2(i * 3, sd) * 16));
  }
  if (h.roof === 'gable') {
    const ov = 5, peak = top - h.roofH, cm = (x0 + x1) / 2, half = h.w / 2 + ov;
    for (let y = peak; y < top; y++) {
      const k = (y - peak + 1) / h.roofH, hw = Math.max(1, R(half * k));
      const band = (y - peak) >> 2;
      const col = ((y - peak) & 3) === 3 ? pal.roof[0] : (band & 1) ? pal.roof[1] : pal.roof[2];
      P(ctx, col, R(cm - hw), y, hw * 2, 1);
      for (let sx = R(cm - hw) + ((band & 1) ? 3 : 0); sx < cm + hw; sx += 6) P(ctx, pal.roof[0], sx, y, 1, 1);
      P(ctx, IP.ink, R(cm - hw) - 1, y, 2, 1); P(ctx, IP.ink, R(cm + hw) - 1, y, 2, 1);
    }
    LN(ctx, pal.trim, R(cm), peak + 2, R(cm - half) + 3, top - 1);
    LN(ctx, pal.trim, R(cm), peak + 2, R(cm + half) - 3, top - 1);
    P(ctx, IP.ink, R(cm - half) - 1, top, R(half * 2) + 2, 2);
    P(ctx, IP.ink, R(cm) - 1, peak - 2, 3, 3);
    // a gable vent, and the fish-head finial they nail over it
    P(ctx, IP.ink, R(cm) - 4, peak + R(h.roofH * 0.45), 8, 6); P(ctx, '#0e0a0c', R(cm) - 3, peak + R(h.roofH * 0.45) + 1, 6, 4);
  } else {
    const ov = 5, ry = top - h.roofH;
    for (let y = ry; y < top; y++) {
      const band = (y - ry) >> 2, sl = R((top - y) * 0.55);
      const col = ((y - ry) & 3) === 3 ? pal.roof[0] : (band & 1) ? pal.roof[1] : pal.roof[2];
      const l = x0 - ov + sl, w = Math.max(2, h.w + ov * 2 - sl * 2);
      P(ctx, col, l, y, w, 1);
      for (let sx = l + ((band & 1) ? 3 : 0); sx < l + w; sx += 6) P(ctx, pal.roof[0], sx, y, 1, 1);
      P(ctx, IP.ink, l - 1, y, 1, 1); P(ctx, IP.ink, l + w, y, 1, 1);
    }
    P(ctx, IP.ink, x0 - ov - 1, top, h.w + ov * 2 + 2, 2);
    P(ctx, IP.ink, x0 - ov + R(h.roofH * 0.55), ry - 1, h.w + ov * 2 - R(h.roofH * 1.1), 1);
  }
  if (h.wins) for (const w of h.wins) vWindow(ctx, pal, w[0], w[1], w[2], w[3], w[4]);
  if (h.door) vDoor(ctx, pal, h.door[0], h.door[1], h.door[2], h.door[3], h.door[4], h.door[5]);
}
// a hung net: a diamond lattice of hard 1px lines, sagging between two pegs
function vNet(ctx, x0, y0, w, h, col, dk) {
  for (let i = -h; i < w; i += 5) {
    LN(ctx, col, x0 + i, y0, x0 + i + h, y0 + h);
    LN(ctx, dk, x0 + i + h, y0, x0 + i, y0 + h);
  }
}
// the lamp-and-fish clutter the whole port hangs off its walls
function vFishLine(ctx, x0, x1, y) {
  LN(ctx, '#8a6b3e', x0, y, x1, y + 2);
  const cb = buildCatchSprites();
  for (let x = x0 + 5, i = 0; x < x1 - 4; x += 9, i++) {
    const sp = cb.byName[i % 3 === 0 ? 'fishOlive' : 'fishSilverSm'];
    if (!sp) continue;
    ctx.save(); ctx.translate(x, y + 1 + R((x - x0) / (x1 - x0) * 2)); ctx.rotate(1.57);
    ctx.drawImage(sp.c, -2, -sp.ay); ctx.restore();
  }
}
function vLantern(ctx, x, y) {
  P(ctx, IP.ink, x - 1, y - 6, 8, 2); P(ctx, '#3a414a', x, y - 5, 6, 1);
  P(ctx, IP.ink, x - 1, y - 4, 8, 10); P(ctx, '#ffd48a', x, y - 3, 6, 7); P(ctx, '#ff9c46', x + 1, y, 4, 3);
  P(ctx, '#3a414a', x + 2, y - 3, 1, 7);
}
function vBarrel(ctx, x, y, w, h) {
  P(ctx, IP.ink, x - 1, y - 1, w + 2, h + 2);
  P(ctx, WOOD.m, x, y, w, h); P(ctx, WOOD.l, x + 2, y, 3, h); P(ctx, WOOD.d, x + w - 3, y, 3, h);
  for (const ry of [3, h - 5]) { P(ctx, '#3a414a', x, y + ry, w, 2); P(ctx, '#8b94a0', x, y + ry, w, 1); }
}
function vCrate(ctx, x, y, w, h) {
  P(ctx, IP.ink, x - 1, y - 1, w + 2, h + 2);
  P(ctx, WOOD.l, x, y, w, h); P(ctx, WOOD.h, x, y, w, 2);
  for (let i = 4; i < h; i += 4) P(ctx, WOOD.m, x, y + i, w, 1);
  LN(ctx, WOOD.m, x + 1, y + h - 2, x + w - 2, y + 2);
  P(ctx, WOOD.d, x, y + h - 2, w, 2);
}
function vRidges(ctx, x0, x1, base, far, near, seed, lift, taper) {
  // lift raises the crests off a lower base; taper runs the headland down to
  // the sea over that many pixels at its left end instead of cutting it off
  lift = lift || 0; taper = taper || 0;
  // two ridges of the headland behind the port: a far one gone blue with
  // haze, a near green one with pines on it.  Hard bands, a dithered crest.
  for (let px = x0; px < x1; px++) {
    const tk = taper ? ss(clamp((px - x0) / taper, 0, 1)) : 1;
    const fh = base - R(tk * (92 + lift + Math.sin(px * 0.011 + seed) * 16 + Math.sin(px * 0.031) * 7 + vnoise(px * 0.02, seed) * 14));
    const nh = base - R(tk * (54 + lift + Math.sin(px * 0.017 + seed * 2) * 12 + vnoise(px * 0.035, seed + 3) * 18));
    if (base - fh < 2) continue;
    P(ctx, far[0], px, fh, 1, base - fh);
    if ((px + fh) & 1) P(ctx, far[1], px, fh, 1, 1);
    P(ctx, far[1], px, fh + 2, 1, 2);
    if (base - nh < 2) continue;
    P(ctx, near[1], px, nh, 1, base - nh);
    if (base - nh > 14) P(ctx, near[0], px, nh + 14, 1, base - nh - 14);
    P(ctx, near[2], px, nh, 1, 2);
    if (tk > 0.6 && hash2(px, seed) > 0.93) {
      const ph = R(8 + hash2(seed, px) * 10);
      tri(ctx, near[3], px - 4, nh + 2, px + 4, nh + 2, px, nh - ph);
      tri(ctx, near[3], px - 3, nh - R(ph * 0.4), px + 3, nh - R(ph * 0.4), px, nh - ph - 3);
    }
  }
}
const RIDGE_FAR = ['#7ea7b4', '#9cc3cc'], RIDGE_NEAR = ['#35604a', '#4a7c5a', '#6a9e6a', '#25452f'];

// ---- the street, from the boards --------------------------------------------
//  The otter walks in from the left along the pier: the net-mender on his
//  crate, the woman at the upstairs window, the man in his doorway, the
//  gutter at his table, the lad on a barrel by the bell.
const VS = {
  deck: 288,
  win: [304, 182, 40, 30],          // her window (x, y, w, h)
  door: [436, 222, 28, 66],         // his doorway
  table: [482, 262, 46],            // x, top, width
  bell: [604, 208],                 // the bell's pivot
};
function buildStreet() {
  const c = can(640, 360), x = cx2(c);
  vRidges(x, 0, 640, VS.deck - 2, RIDGE_FAR, RIDGE_NEAR, 1.7, 26);
  vHouse(x, { x: 104, w: 150, base: VS.deck, wallH: 100, roof: 'gable', roofH: 54, pal: VHOUSE.oxblood,
    wins: [[124, 206, 20, 16, 'open']], door: [212, 236, 24, 52, 'closed', '#4e3322'] });
  vHouse(x, { x: 266, w: 118, base: VS.deck, wallH: 128, roof: 'pent', roofH: 26, pal: VHOUSE.pitch,
    wins: [[VS.win[0], VS.win[1], VS.win[2], VS.win[3], 'live']], door: [338, 240, 22, 48, 'closed', '#3a2a22'] });
  vHouse(x, { x: 394, w: 140, base: VS.deck, wallH: 112, roof: 'gable', roofH: 58, pal: VHOUSE.bleached,
    wins: [[490, 192, 20, 18, 'closed']], door: [VS.door[0], VS.door[1], VS.door[2], VS.door[3], 'live'] });
  vHouse(x, { x: 546, w: 110, base: VS.deck, wallH: 118, roof: 'gable', roofH: 50, pal: VHOUSE.indigo,
    wins: [[566, 196, 18, 16, 'open']] });
  // a shark's jaw nailed over his door: nothing in this port is welcoming
  const jx = VS.door[0] + VS.door[2] / 2, jy = VS.door[1] - 12;
  for (let i = -10; i <= 10; i++) {
    const yy = jy + R((i * i) / 18);
    P(x, IP.ink, jx + i - 1, yy - 1, 3, 4); P(x, IP.bone, jx + i, yy, 1, 2);
    if ((i & 1) === 0) { P(x, IP.boneL, jx + i, yy + 2, 1, 2); P(x, IP.ink, jx + i, yy + 4, 1, 1); }
  }
  // a painted sign for the fish, with the fish crossed out in red
  P(x, IP.ink, 282, 226, 42, 16); P(x, '#c9b48e', 283, 227, 40, 14); P(x, '#8d3020', 283, 227, 40, 2);
  pixelText(x, 'FISH', 303, 231, 6, '#3a2416', 'center', false);
  // net racks in front of the first house, with the net hung wet
  for (const px of [170, 244]) { P(x, IP.ink, px - 1, 226, 5, VS.deck - 226); P(x, WOOD.m, px, 227, 3, VS.deck - 227); P(x, WOOD.l, px, 227, 1, VS.deck - 227); }
  P(x, IP.ink, 168, 224, 80, 4); P(x, WOOD.l, 169, 225, 78, 2);
  x.save(); x.beginPath(); x.rect(174, 228, 70, 48); x.clip();
  vNet(x, 174, 228, 70, 44, '#878872', '#3a3c30');
  x.restore();
  for (let i = 0; i < 6; i++) { P(x, IP.ink, 178 + i * 11, 270, 6, 6); P(x, '#b0512c', 179 + i * 11, 271, 4, 4); P(x, '#c9b48e', 179 + i * 11, 271, 4, 1); }
  // fish on a line under the window, and the lamps
  vFishLine(x, 272, 298, 200);
  vLantern(x, 258, 232); vLantern(x, 386, 222); vLantern(x, 538, 226);
  // barrels and a crate against the walls, not in anybody's way
  vBarrel(x, 356, 268, 14, 20); vBarrel(x, 372, 272, 12, 16);
  vCrate(x, 530, 272, 14, 16);
  // the bell post: two posts, a yoke, a rope cleat
  const bx = VS.bell[0];
  P(x, IP.ink, bx - 14, 190, 5, VS.deck - 190); P(x, WOOD.m, bx - 13, 191, 3, VS.deck - 191); P(x, WOOD.l, bx - 13, 191, 1, VS.deck - 191);
  P(x, IP.ink, bx + 11, 190, 5, VS.deck - 190); P(x, WOOD.m, bx + 12, 191, 3, VS.deck - 191); P(x, WOOD.l, bx + 12, 191, 1, VS.deck - 191);
  P(x, IP.ink, bx - 18, 196, 38, 7); P(x, WOOD.l, bx - 17, 197, 36, 4); P(x, WOOD.h, bx - 17, 197, 36, 1);
  P(x, IP.ink, bx - 20, 188, 42, 3); P(x, WOOD.d, bx - 19, 189, 40, 1);
  P(x, IP.ink, bx + 16, 250, 4, 6); P(x, '#616a76', bx + 17, 251, 2, 4);
  // ---- the boards: a strip of deck top, the fascia, and the dark under it
  for (let px = 0; px < 640; px++) {
    const seam = (px % 13) === 0;
    colRuns(x, px, VS.deck - 4, 360, y => {
      if (y < VS.deck + 6) return seam ? DECK[1] : y === VS.deck - 4 ? DECK[4] : (y < VS.deck ? DECK[3] : (hash2(px >> 3, 7) > 0.5 ? DECK[2] : DECK[3]));
      if (y === VS.deck + 6) return IP.ink;
      if (y < VS.deck + 14) return (px % 29 === 3 && y === VS.deck + 9) ? '#8b94a0' : DECK[1];
      if (y === VS.deck + 14) return IP.ink;
      return '#0c1418';
    });
  }
  // pilings under the boards, and the water between them
  for (let px = 12; px < 640; px += 58) {
    P(x, IP.ink, px - 1, VS.deck + 15, 12, 48); P(x, W_POST[1], px, VS.deck + 15, 10, 48); P(x, W_POST[2], px, VS.deck + 15, 2, 48);
    P(x, '#324a2a', px, VS.deck + 36, 10, 5);
  }
  for (let i = 0; i < 70; i++) {
    const gx = R(hash2(i, 41) * 640), gy = VS.deck + 30 + R(hash2(41, i) * 18);
    P(x, rgbaq('#6fb6d0', 0.42), gx, gy, R(3 + hash2(i, 9) * 8), 1);
  }
  return c;
}
const W_POST = ['#26170f', '#3a2416', '#5a3a22'];

// ---- the waterline, from under the pier -------------------------------------
const VW = { surf: 200, deck: 150, bed: 330 };
function buildShoreW() {
  const c = can(640, VW.surf + 4), x = cx2(c);
  vRidges(x, 150, 640, VW.surf - 4, RIDGE_FAR, RIDGE_NEAR, 4.1, 0, 170);
  // houses standing on the pier, on the right
  vHouse(x, { x: 348, w: 104, base: VW.deck, wallH: 58, roof: 'gable', roofH: 38, pal: VHOUSE.oxblood,
    wins: [[364, 108, 18, 14, 'open']], door: [414, 112, 20, 38, 'closed', '#4e3322'] });
  vHouse(x, { x: 466, w: 112, base: VW.deck, wallH: 66, roof: 'pent', roofH: 20, pal: VHOUSE.pitch,
    wins: [[484, 100, 18, 14, 'closed'], [528, 100, 18, 14, 'open']] });
  vHouse(x, { x: 592, w: 70, base: VW.deck, wallH: 60, roof: 'gable', roofH: 34, pal: VHOUSE.bleached });
  vFishLine(x, 470, 520, 124);
  vLantern(x, 454, 110);
  // the bell post at the end of the boards
  const bx = 572;
  P(x, IP.ink, bx - 12, 86, 4, VW.deck - 86); P(x, WOOD.m, bx - 11, 87, 2, VW.deck - 87);
  P(x, IP.ink, bx + 9, 86, 4, VW.deck - 86); P(x, WOOD.m, bx + 10, 87, 2, VW.deck - 87);
  P(x, IP.ink, bx - 15, 88, 32, 5); P(x, WOOD.l, bx - 14, 89, 30, 3);
  // the boards themselves, from x 244 out
  for (let px = 244; px < 640; px++) {
    const seam = (px % 13) === 0;
    colRuns(x, px, VW.deck - 3, VW.deck + 9, y => {
      if (y === VW.deck - 3) return DECK[4];
      if (y < VW.deck) return seam ? DECK[1] : DECK[3];
      if (y === VW.deck) return IP.ink;
      if (y < VW.deck + 8) return (px % 29 === 3 && y === VW.deck + 3) ? '#8b94a0' : DECK[1];
      return IP.ink;
    });
  }
  P(x, IP.ink, 243, VW.deck - 3, 1, 12);
  // a rail and a rope along the open end of the pier
  for (const px of [252, 290, 328]) { P(x, IP.ink, px - 1, VW.deck - 18, 4, 16); P(x, WOOD.m, px, VW.deck - 17, 2, 14); }
  for (let px = 252; px < 330; px++) { const sag = R(Math.sin(((px - 252) % 38) / 38 * Math.PI) * 3); P(x, '#8a6b3e', px, VW.deck - 15 + sag, 1, 1); }
  // pilings, above the water: dark, wet, green at the tide line
  for (let px = 250; px < 640; px += 56) {
    P(x, IP.ink, px - 1, VW.deck + 9, 12, VW.surf - VW.deck - 5); P(x, W_POST[1], px, VW.deck + 9, 10, VW.surf - VW.deck - 5);
    P(x, W_POST[2], px, VW.deck + 9, 2, VW.surf - VW.deck - 5);
    P(x, '#324a2a', px, VW.surf - 14, 10, 10); P(x, '#4a6634', px, VW.surf - 14, 10, 2);
  }
  // a ladder down off the open end
  for (const lx of [262, 274]) { P(x, IP.ink, lx - 1, VW.deck + 8, 4, VW.surf - VW.deck - 4); P(x, WOOD.l, lx, VW.deck + 8, 2, VW.surf - VW.deck - 4); }
  for (let ly = VW.deck + 14; ly < VW.surf; ly += 8) { P(x, IP.ink, 262, ly - 1, 14, 3); P(x, WOOD.h, 263, ly, 12, 1); }
  return c;
}
function buildUnderW() {
  const H = 360 - VW.surf, c = can(640, H), x = cx2(c), rng = new SeededRandom(7171);
  for (let px = 250; px < 640; px += 56) {
    P(x, IP.ink, px - 1, 0, 12, VW.bed - VW.surf + 8); P(x, W_POST[1], px, 0, 10, VW.bed - VW.surf + 8);
    P(x, W_POST[2], px, 0, 2, VW.bed - VW.surf + 8);
    for (let i = 0; i < 9; i++) {
      const by = R(rng.range(4, VW.bed - VW.surf));
      P(x, IP.ink, px + R(rng.range(-1, 8)), by, 3, 3); P(x, '#9b9a8c', px + R(rng.range(0, 8)), by + 1, 2, 1);
    }
    // weed streamers
    for (let s = 0; s < 3; s++) {
      const sx = px + R(rng.range(0, 10)), len = R(rng.range(14, 40)), sy = R(rng.range(10, 80));
      for (let i = 0; i < len; i++) P(x, i & 1 ? '#324a2a' : '#4a6634', sx + R(Math.sin(i * 0.4 + s) * 2), sy + i, 1, 1);
    }
  }
  // an old net snagged between two piles, and a chain gone to rust
  x.save(); x.beginPath(); x.rect(362, 18, 64, 72); x.clip();
  vNet(x, 362, 18, 64, 70, '#5a5c48', '#2a2c24');
  x.restore();
  for (let y = 0; y < 90; y += 4) { P(x, IP.ink, 520, y, 4, 4); P(x, '#84431f', 521, y + 1, 2, 2); }
  // the bottom's own junk: bottles, a boot, a crab pot
  for (let i = 0; i < 7; i++) {
    const bx = R(rng.range(240, 620)), by = VW.bed - VW.surf - R(rng.range(-2, 6));
    P(x, IP.ink, bx - 1, by - 6, 5, 8); P(x, i & 1 ? '#3f7f52' : '#6a4a22', bx, by - 5, 3, 6); P(x, '#cfe8d8', bx, by - 5, 1, 2);
  }
  // push it all into the water it is standing in: a banded tint, deeper = bluer
  for (let y = 0; y < H; y += 4) {
    const k = clamp(y / (VW.bed - VW.surf), 0, 1);
    x.save(); x.globalCompositeOperation = 'source-atop';
    x.fillStyle = rgbaq('#2b6a8e', 0.22 + k * 0.30); x.fillRect(0, y, 640, 4);
    x.restore();
  }
  return c;
}

// ---- the people -------------------------------------------------------------
//  Built the way the intro builds its buyer: a shaded body, a head with a
//  face, one arm sprite that swings from the shoulder, and legs laid down
//  live so they can walk, sit and turn their backs.  All right-facing; a
//  flip turns them round.
const FOLK_SPEC = {
  // the net-mender: old, grey-bearded, a watch cap and a drab oilskin smock
  mender: { skin: '#c89a72', coat: ['#2a2a1a', '#3f3f26', '#575734', '#707044', '#8a8a58'], pants: '#332f2a', boot: '#1d1a1c',
            hat: 'cap', hatCol: '#7c1414', beard: '#b8b4a8', leg: 24, tor: 22, bulk: 1.0 },
  // at the upstairs window: headscarf, a green shawl
  wife:   { skin: '#d3aa84', coat: ['#1d2a24', '#2a3c33', '#3a5145', '#4d6858', '#63806e'], pants: '#3a3540', boot: '#1d1a1c',
            hat: 'scarf', hatCol: '#8a2a26', leg: 23, tor: 21, bulk: 0.92 },
  // in the doorway: big, a tricorn, an oxblood waistcoat, three days of stubble
  door:   { skin: '#a5714a', coat: ['#3a1214', '#5a1c1e', '#7a2a28', '#9a3a32', '#b8563f'], pants: '#2a303c', boot: '#191519',
            hat: 'tricorn', hatCol: '#241f28', stubble: true, leg: 26, tor: 24, bulk: 1.15, belly: 1.0 },
  // the gutter: bald under a bandana, sleeves rolled, a leather apron with the day's work on it
  gutter: { skin: '#8b5d39', coat: ['#1e1c18', '#34302a', '#494334', '#5e5746', '#766e5a'], pants: '#262d2b', boot: '#191519',
            apron: ['#3a2414', '#5a3a20', '#7a5230', '#946a40'], hat: 'bandana', hatCol: '#2a2a32', rolled: true,
            leg: 25, tor: 24, bulk: 1.25, belly: 1.6 },
  // the lad who rings the bell
  lad:    { skin: '#d3aa84', coat: ['#3a2c18', '#54401f', '#6a5636', '#826c48', '#9c865c'], pants: '#2e2b28', boot: '#1d1a1c',
            hat: 'flat', hatCol: '#432f20', leg: 18, tor: 16, bulk: 0.8 },
};
function buildFolkHead(F, mode) {
  const W = 20, H = 20;
  const f = blobField(W, H, [
    { x: 9.0, y: 9.0, rx: 5.8, ry: 6.0 },
    { x: 10.5, y: 12.5, rx: 4.8, ry: 3.8 },
    { x: 14.2, y: 10.4, rx: 1.9, ry: 1.7 },
  ]);
  const sk = skinRamp(F.skin);
  const o = shadeBlob(W, H, f, sk, { outline: IP.ink, lift: 0.28, smooth: 2 });
  const h = o.ctx;
  const ins = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0;
  // ear, and the back of the skull in shadow
  P(h, IP.ink, 6, 9, 3, 4); P(h, sk[1], 7, 10, 1, 2);
  // the beard first, so the mouth can be cut into it
  if (F.beard) {
    for (let y = 11; y < H; y++) for (let x = 5; x < W; x++) {
      if (!ins(x, y) || y < 11 + (x < 9 ? 2 : 0)) continue;
      const edge = !ins(x, y + 1) || !ins(x + 1, y);
      P(h, edge ? IP.ink : ((x + y) & 3) === 0 ? shadeHex(F.beard, 0.78) : F.beard, x, y, 1, 1);
    }
    P(h, F.beard, 11, 16, 4, 2); P(h, IP.ink, 11, 18, 4, 1); P(h, IP.ink, 15, 16, 1, 2);
  }
  if (F.stubble) for (let y = 11; y < 16; y++) for (let x = 8; x < 15; x++) if (ins(x, y) && ((x * 3 + y * 5) % 4) === 0) P(h, sk[1], x, y, 1, 1);
  // eye and brow
  const ex = 11, ey = 8;
  if (mode === 'shut') { P(h, IP.ink, ex - 1, ey + 1, 3, 1); P(h, sk[1], ex - 1, ey - 1, 3, 1); }
  else { P(h, IP.ink, ex, ey, 2, 2); P(h, '#f2eee4', ex, ey, 1, 1); }
  if (mode === 'shout' || mode === 'scowl') { P(h, IP.ink, ex - 1, ey - 2, 2, 1); P(h, IP.ink, ex + 1, ey - 1, 2, 1); }
  else P(h, shadeHex(F.skin, 0.6), ex - 1, ey - 2, 3, 1);
  // the mouth
  const mx = 11, my = 13;
  if (mode === 'shout') { P(h, IP.ink, mx - 1, my - 1, 5, 4); P(h, '#5a1a1e', mx, my, 3, 2); P(h, '#e8e0d0', mx, my - 1, 3, 1); }
  else if (mode === 'spit') { P(h, IP.ink, mx + 2, my, 2, 2); P(h, sk[4], mx - 1, my - 1, 2, 2); }
  else if (mode === 'scowl') { P(h, IP.ink, mx, my, 4, 1); P(h, IP.ink, mx - 1, my + 1, 1, 1); }
  else P(h, shadeHex(F.skin, 0.58), mx, my, 3, 1);
  // hats
  const hc = F.hatCol, hd = shadeHex(hc, 0.64), hl = shadeHex(hc, 1.35);
  if (F.hat === 'cap') {
    for (let y = 1; y < 7; y++) for (let x = 2; x < 16; x++) if (ins(x, y) || (y > 1 && ins(x, y + 1) && x < 15)) P(h, y === 1 || !ins(x, y - 1) ? IP.ink : (x & 1) ? hc : hd, x, y, 1, 1);
    P(h, IP.ink, 2, 6, 14, 3); P(h, hl, 3, 7, 12, 1);
    P(h, IP.ink, 7, 0, 4, 2); P(h, hl, 8, 0, 2, 1);
  } else if (F.hat === 'scarf') {
    for (let y = 1; y < 12; y++) for (let x = 1; x < 16; x++) {
      const cover = (y < 6 && ins(x, y)) || (x < 9 && y < 12 && ins(x, y)) || (x < 8 && y > 2 && y < 11 && x > 1);
      if (cover) P(h, (x + y) % 5 === 0 ? hl : hc, x, y, 1, 1);
    }
    LN(h, IP.ink, 1, 11, 4, 2); LN(h, IP.ink, 4, 2, 13, 2); P(h, IP.ink, 13, 3, 2, 3); LN(h, IP.ink, 9, 6, 8, 11);
    P(h, hd, 2, 12, 4, 3); P(h, IP.ink, 1, 15, 6, 1);
  } else if (F.hat === 'tricorn') {
    P(h, IP.ink, 0, 4, 20, 4); P(h, hc, 1, 5, 18, 2); P(h, hl, 1, 5, 18, 1);
    P(h, IP.ink, 4, 0, 11, 5); P(h, hc, 5, 1, 9, 4); P(h, hl, 5, 1, 4, 1);
    P(h, IP.ink, 0, 1, 3, 4); P(h, hc, 1, 2, 1, 3); P(h, IP.ink, 17, 1, 3, 4); P(h, hc, 18, 2, 1, 3);
    P(h, '#9a7a56', 1, 7, 18, 1);
  } else if (F.hat === 'bandana') {
    for (let y = 2; y < 8; y++) for (let x = 2; x < 16; x++) if (ins(x, y)) P(h, !ins(x, y - 1) ? IP.ink : ((x * 2 + y * 3) % 7 === 0) ? '#e8e0d0' : hc, x, y, 1, 1);
    P(h, IP.ink, 3, 7, 13, 1);
    P(h, IP.ink, 1, 7, 4, 3); P(h, hc, 2, 8, 2, 1); LN(h, IP.ink, 2, 10, 0, 14); LN(h, hc, 3, 10, 1, 14);
  } else if (F.hat === 'flat') {
    for (let y = 2; y < 7; y++) for (let x = 3; x < 16; x++) if (ins(x, y) || y > 3) P(h, y === 2 || !ins(x, y - 1) && y < 4 ? IP.ink : (x & 1) ? hc : hd, x, y, 1, 1);
    P(h, IP.ink, 12, 6, 7, 2); P(h, hd, 13, 6, 5, 1);
    P(h, IP.ink, 3, 7, 12, 1);
  }
  return spr(o.c, 9, 17);
}
function buildFolkTorso(F) {
  const k = F.bulk || 1, T = F.tor, W = 30, H = T + 5, cx0 = 14;
  const f = blobField(W, H, [
    { x: cx0, y: 5.5, rx: 7.2 * k, ry: 4.8 },
    { x: cx0 + 0.5, y: T * 0.52, rx: 7.0 * k, ry: T * 0.30 },
    { x: cx0 + 0.5 + (F.belly || 0) * 0.8, y: T * 0.84, rx: (6.2 + (F.belly || 0)) * k, ry: T * 0.24 },
  ]);
  const o = shadeBlob(W, H, f, F.coat, { outline: IP.ink, lift: 0.22, smooth: 3 });
  const b = o.ctx, ins = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0;
  // collar / neckline
  P(b, shadeHex(F.coat[1], 0.8), cx0 - 1, 1, 6, 2);
  if (F.apron) {
    // a leather apron down the front, darker where the work dried on it
    for (let y = 7; y < H - 1; y++) for (let x = cx0 + 1; x < W; x++) {
      if (!ins(x, y) || !ins(x + 1, y)) continue;
      const blood = hash2(x * 5, y * 3) > (y > T * 0.55 ? 0.62 : 0.86);
      P(b, blood ? (hash2(x, y) > 0.5 ? '#6b1c18' : '#4a1014') : x === cx0 + 1 ? IP.ink : F.apron[y < 10 ? 3 : (x & 1) ? 1 : 2], x, y, 1, 1);
    }
    LN(b, F.apron[0], cx0 + 2, 7, cx0 - 3, 1);
  } else {
    // buttons down the front edge, a belt, the oilskin's one shine
    for (let y = 6; y < T - 2; y += 4) { const bx = cx0 + R(5.2 * k); if (ins(bx, y)) { P(b, IP.ink, bx, y, 2, 2); P(b, '#c8a63a', bx, y, 1, 1); } }
    P(b, IP.ink, 3, T * 0.72 | 0, W - 6, 2); P(b, '#3a2416', 4, (T * 0.72 | 0), W - 8, 1);
    for (let y = 6; y < T - 2; y++) if (ins(cx0 - 3, y) && (y & 3) !== 0) P(b, F.coat[4], cx0 - 3, y, 1, 1);
  }
  // and nothing below the hips: the legs are drawn live
  b.clearRect(0, T + 2, W, H);
  return spr(o.c, cx0, T + 1);
}
function buildFolkArm(F) {
  const AW = 18, AH = 8;
  const lobes = F.rolled ? [{ x: 4, y: 4, rx: 3.8, ry: 3.4 }] : [{ x: 4, y: 4, rx: 3.8, ry: 3.4 }, { x: 9.5, y: 4, rx: 3.6, ry: 3.0 }];
  const af = blobField(AW, AH, lobes);
  const ao = shadeBlob(AW, AH, af, F.coat, { outline: IP.ink, lift: 0.2, smooth: 1 });
  const sk = skinRamp(F.skin), a = ao.ctx;
  if (F.rolled) { P(a, IP.ink, 7, 2, 7, 5); P(a, sk[3], 7, 3, 7, 3); P(a, sk[4], 7, 3, 7, 1); P(a, sk[1], 7, 5, 7, 1); }
  P(a, IP.ink, 13, 2, 5, 5); P(a, sk[3], 14, 3, 3, 3); P(a, sk[4], 14, 3, 3, 1);
  return spr(ao.c, 3, 4);
}
function buildFolk(F) {
  return {
    F: F, leg: F.leg, tor: F.tor, torso: buildFolkTorso(F), arm: buildFolkArm(F),
    head: { calm: buildFolkHead(F, 'calm'), shout: buildFolkHead(F, 'shout'), scowl: buildFolkHead(F, 'scowl'), spit: buildFolkHead(F, 'spit'), shut: buildFolkHead(F, 'shut') },
  };
}
// the things in their hands, drawn in the frame of the arm that holds them
function drawProp(ctx, kind, t) {
  if (kind === 'gaff') {
    P(ctx, IP.ink, -12, -2, 44, 4); P(ctx, WOOD.l, -11, -1, 42, 2); P(ctx, WOOD.h, -11, -1, 42, 1);
    P(ctx, IP.ink, 30, -3, 4, 5); P(ctx, '#8b94a0', 31, -2, 2, 3);
    P(ctx, IP.ink, 33, -8, 3, 7); P(ctx, '#c3ccd8', 34, -7, 1, 5); P(ctx, IP.ink, 30, -9, 5, 2); P(ctx, '#c3ccd8', 31, -9, 3, 1);
  } else if (kind === 'musket') {
    P(ctx, IP.ink, -9, -3, 12, 6); P(ctx, '#5c3a1c', -8, -2, 10, 4); P(ctx, '#8a5a2c', -8, -2, 10, 1);
    P(ctx, IP.ink, 2, -2, 30, 4); P(ctx, '#3a414a', 3, -1, 28, 2); P(ctx, '#8b94a0', 3, -1, 28, 1);
    P(ctx, IP.ink, 4, 1, 4, 3); P(ctx, '#c8a63a', 5, 1, 2, 1);
  } else if (kind === 'cleaver') {
    P(ctx, IP.ink, -1, -2, 7, 4); P(ctx, '#5c3a1c', 0, -1, 5, 2);
    P(ctx, IP.ink, 5, -8, 11, 10); P(ctx, '#8b94a0', 6, -7, 9, 8); P(ctx, '#dfe6ee', 6, -7, 9, 1); P(ctx, '#7c1414', 11, -2, 4, 2);
  } else if (kind === 'lantern') {
    P(ctx, '#3a414a', 0, 0, 1, 6); vLantern(ctx, -3, 12);
  }
}
// o: {F (a built folk), x, y (feet), flip, sit (hip height when seated),
//     walk (0..1), phase, legA, legB, armNear, armFar, lean, headR, face,
//     hold, holdR, sx, sy, bob}
function drawFolk(ctx, o, t) {
  const B = o.F; if (!B) return;
  const F = B.F, L = B.leg, T = B.tor;
  ctx.save(); ctx.translate(R(o.x), R(o.y));
  if (o.flip) ctx.scale(-1, 1);
  if ((o.sx !== undefined && o.sx !== 1) || (o.sy !== undefined && o.sy !== 1)) ctx.scale(o.sx || 1, o.sy || 1);
  const ph = o.phase || 0, wk = o.walk || 0;
  const hipY = o.sit ? -o.sit : -L + R(Math.abs(Math.sin(ph)) * -1.5 * wk) + (o.bob || 0);
  const lw = Math.max(3, R(L * 0.2));
  const legDraw = (side, a, col) => {
    const hx = side * 2, hy = hipY;
    if (o.sit) {
      const kx = hx + 11, ky = hy + 1, fx = kx + R(Math.sin(o.dangle ? t * 3 + side : 0) * 2), fy = o.feet === undefined ? 0 : o.feet;
      limb(ctx, col, hx, hy, kx, ky, lw); limb(ctx, col, kx, ky, fx, fy - 2, lw);
      P(ctx, IP.ink, fx - 2, fy - 4, 8, 4); P(ctx, F.boot, fx - 1, fy - 3, 6, 2);
      return;
    }
    const kx = hx + Math.sin(a) * L * 0.5, ky = hy + Math.cos(a) * L * 0.5;
    const fx = kx + Math.sin(a * 0.5) * L * 0.5, fy = Math.min(0, ky + L * 0.5);
    limb(ctx, col, hx, hy, kx, ky, lw); limb(ctx, col, kx, ky, fx, fy - 2, lw);
    P(ctx, IP.ink, R(fx) - 2, R(fy) - 4, 8, 4); P(ctx, F.boot, R(fx) - 1, R(fy) - 3, 6, 2);
  };
  const la = o.legA !== undefined ? o.legA : Math.sin(ph) * 0.55 * wk;
  const lb = o.legB !== undefined ? o.legB : -Math.sin(ph) * 0.55 * wk;
  legDraw(-1, lb, shadeHex(F.pants, 0.75));
  // torso, leaning from the hips
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(o.lean || 0);
  // far arm
  ctx.save(); ctx.translate(-1, -T + 5); ctx.rotate(o.armFar === undefined ? 1.45 : o.armFar);
  ctx.drawImage(B.arm.c, -B.arm.ax, -B.arm.ay); ctx.restore();
  ctx.drawImage(B.torso.c, -B.torso.ax, -B.torso.ay);
  ctx.restore();
  legDraw(1, la, F.pants);
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(o.lean || 0);
  // head
  const hd = B.head[o.face || 'calm'] || B.head.calm;
  ctx.save(); ctx.translate(1, -T + 2); ctx.rotate(o.headR || 0);
  ctx.drawImage(hd.c, -hd.ax, -hd.ay); ctx.restore();
  // near arm and whatever is in the hand
  ctx.save(); ctx.translate(1, -T + 5); ctx.rotate(o.armNear === undefined ? 1.35 : o.armNear);
  if (o.hold) { ctx.save(); ctx.translate(12, 0); ctx.rotate(o.holdR || 0); drawProp(ctx, o.hold, t); ctx.restore(); }
  ctx.drawImage(B.arm.c, -B.arm.ax, -B.arm.ay);
  ctx.restore();
  ctx.restore();
  ctx.restore();
}
// the top of a figure's head, for a speech anchor
function folkTop(o) { return o.y - (o.sit ? o.sit : o.F.leg) - o.F.tor - 16; }

// ---- the disguise -------------------------------------------------------------
//  He has been a pirate for longer than she has been alive and he thinks this
//  will work.  A brand new sou'wester and a brand new yellow oilskin -- the
//  only clean things in the port -- a fake beard on a string, and a pair of
//  stilts under the coat to make up the height.  His tail sticks out of the
//  back of it the whole time.
const YEL = ['#6e4a0c', '#a8740e', '#dca21e', '#f5cc4a', '#ffe98a'];
function buildDisguise() {
  const D = {};
  // the coat, shoulders to hem, flared
  {
    const W = 32, H = 34;
    const f = blobField(W, H, [
      { x: 16, y: 6, rx: 9.5, ry: 5.5 },
      { x: 16, y: 14, rx: 10.5, ry: 8.0 },
      { x: 16, y: 23, rx: 12.5, ry: 8.5 },
      { x: 16, y: 29, rx: 14.0, ry: 4.6 },
    ]);
    const o = shadeBlob(W, H, f, YEL, { outline: IP.ink, lift: 0.26, smooth: 3 });
    const b = o.ctx, ins = (x, y) => x >= 0 && y >= 0 && x < W && y < H && f[y * W + x] > 0;
    // the fastening edge, toggles, a pocket with a fish in it, a hem stitch
    for (let y = 5; y < 31; y++) if (ins(21, y)) P(b, YEL[1], 21, y, 1, 1);
    for (const y of [9, 15, 21]) { P(b, IP.ink, 21, y, 3, 2); P(b, '#5c3a1c', 22, y, 2, 1); }
    P(b, IP.ink, 7, 18, 9, 7); P(b, YEL[2], 8, 19, 7, 5); P(b, YEL[3], 8, 19, 7, 1);
    P(b, IP.ink, 9, 14, 3, 5); P(b, '#8b9aa7', 10, 15, 1, 3); P(b, IP.ink, 12, 13, 3, 3); P(b, '#c2d0da', 13, 14, 1, 1);
    for (let x = 3; x < W - 3; x += 3) if (ins(x, 30)) P(b, YEL[1], x, 30, 2, 1);
    // collar turned up
    P(b, IP.ink, 9, 0, 15, 5); P(b, YEL[3], 10, 1, 13, 3); P(b, YEL[4], 10, 1, 13, 1);
    D.coat = spr(o.c, 16, 32);
  }
  // a sleeve, with his paw sticking out of the cuff
  {
    const AW = 18, AH = 9;
    const af = blobField(AW, AH, [{ x: 4.5, y: 4.5, rx: 4.2, ry: 3.8 }, { x: 10.5, y: 4.5, rx: 4.2, ry: 3.6 }]);
    const ao = shadeBlob(AW, AH, af, YEL, { outline: IP.ink, lift: 0.22, smooth: 1 });
    P(ao.ctx, IP.ink, 14, 2, 4, 6); P(ao.ctx, '#8a4a22', 15, 3, 2, 4); P(ao.ctx, '#c47a3a', 15, 3, 2, 1);
    P(ao.ctx, YEL[1], 13, 2, 1, 5);
    D.sleeve = spr(ao.c, 3, 4.5);
  }
  // the sou'wester: a crown, a brim, and a long flap down the back of the neck
  {
    const HW = 48, HH = 24;
    const hf = blobField(HW, HH, [{ x: 25, y: 10, rx: 14.5, ry: 9.5 }, { x: 25, y: 14, rx: 16.5, ry: 5 }]);
    const ho = shadeBlob(HW, HH, hf, YEL, { outline: IP.ink, lift: 0.28, smooth: 2 });
    const h = ho.ctx;
    for (let x = 1; x < HW - 1; x++) {
      const back = x < 18 ? (18 - x) * 0.42 : 0;
      const y0 = 15 + R(back), hgt = x < 18 ? 5 : 4;
      P(h, IP.ink, x, y0 - 1, 1, hgt + 2);
      P(h, x < 14 ? YEL[1] : YEL[2], x, y0, 1, hgt);
      P(h, YEL[3], x, y0, 1, 1);
    }
    P(h, IP.ink, 0, 15 + R(18 * 0.42) - 1, 1, 7); P(h, IP.ink, HW - 1, 14, 1, 6);
    // the seams, and the chin strap hanging loose
    for (let x = 14; x < 36; x += 2) P(h, YEL[1], x, 13, 1, 1);
    LN(h, YEL[1], 25, 2, 25, 12);
    D.hat = spr(ho.c, 25, 19);
  }
  // the beard: black, far too glossy, curled, on a string
  {
    const BW = 30, BH = 24;
    const bf = blobField(BW, BH, [
      { x: 15, y: 7, rx: 12.5, ry: 5.5 },
      { x: 15, y: 13, rx: 11.0, ry: 6.5 },
      { x: 15, y: 18, rx: 7.0, ry: 5.0 },
    ]);
    const bo = shadeBlob(BW, BH, bf, ['#120a08', '#24140e', '#3a2416', '#54361f'], { outline: IP.ink, lift: 0.3, smooth: 2 });
    const b = bo.ctx;
    for (let i = 0; i < 40; i++) {
      const x = R(hash2(i, 3) * BW), y = R(hash2(3, i) * BH);
      if (bf[y * BW + x] > 0.25) { P(b, '#6e4a2c', x, y, 2, 1); P(b, '#120a08', x, y + 1, 2, 1); }
    }
    // a hole cut for his nose to come through, which it does
    P(b, IP.ink, 12, 0, 8, 5); b.clearRect(13, 0, 6, 4);
    D.beard = spr(bo.c, 15, 3);
  }
  return D;
}
// o: {x, y (ground), phase, walk, rot, exp, blink, beard (bool), hat (bool),
//     armNear, armFar, sx, sy, tail}.  Returns nothing; folds the head top
//     into o.top for the speech anchor.
function drawDisguise(ctx, o, t) {
  const Dg = VIL.dis, C = capOtter(); if (!Dg || !C) return;
  const D = C.stand.k;
  ctx.save(); ctx.translate(R(o.x), R(o.y));
  if (o.flip) ctx.scale(-1, 1);
  ctx.rotate(o.rot || 0);
  if ((o.sx !== undefined && o.sx !== 1) || (o.sy !== undefined && o.sy !== 1)) ctx.scale(o.sx || 1, o.sy || 1);
  const ph = o.phase || 0, wk = o.walk || 0, st = Math.sin(ph) * wk;
  const hem = -12 - R(Math.abs(st) * 3);
  // stilts: rigid poles, one swinging forward while the other plants
  for (const s of [-1, 1]) {
    const hx = s * 4, hy = hem - 4;
    const fx = hx + R(st * 7 * s), fy = -R(Math.max(0, st * s) * 3);
    cap_(ctx, IP.ink, hx, hy, fx, fy - 1, 4);
    cap_(ctx, s < 0 ? WOOD.m : WOOD.l, hx, hy, fx, fy - 1, 2);
    P(ctx, IP.ink, fx - 3, fy - 2, 6, 3); P(ctx, WOOD.d, fx - 2, fy - 1, 4, 1);
  }
  // his tail, out of the back of the hem, giving the whole thing away
  ctx.save(); ctx.translate(-11, hem - 3); ctx.rotate(2.45 + Math.sin(t * 5.5) * 0.16 + (o.tail || 0));
  ctx.drawImage(C.tail.c, -C.tail.ax, -C.tail.ay); ctx.restore();
  const sh = hem - 28;                        // shoulder line
  ctx.save(); ctx.translate(-2, sh + 3); ctx.rotate(o.armFar === undefined ? 1.2 : o.armFar);
  ctx.drawImage(Dg.sleeve.c, -Dg.sleeve.ax, -Dg.sleeve.ay); ctx.restore();
  ctx.drawImage(Dg.coat.c, -Dg.coat.ax, hem - Dg.coat.ay);
  // his own head, on the cast's grid, on top of it all
  const hx = 2, hy = sh - 11 + R(Math.abs(st) * 1);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(o.headR || 0);
  const hd = CH.headWithFace(OEXP[o.exp] || o.exp || 'idle', !!o.blink, t, false);
  ctx.drawImage(hd, 0, 0, hd.width, hd.height, -C.hax, -C.hay, hd.width, hd.height);
  if (o.hat) ctx.drawImage(Dg.hat.c, R(1 - Dg.hat.ax), R(-5 - Dg.hat.ay));
  ctx.restore();
  ctx.save(); ctx.translate(3, sh + 3); ctx.rotate(o.armNear === undefined ? 1.3 : o.armNear);
  ctx.drawImage(Dg.sleeve.c, -Dg.sleeve.ax, -Dg.sleeve.ay); ctx.restore();
  // The beard last, over the muzzle and hanging on to the coat, so no
  // gesture ever hides the one thing everybody is looking at.  Its string
  // runs up to his ears on both sides.
  if (o.beard) {
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(o.headR || 0);
    LN(ctx, '#2a1810', -12, 4, -16, -5); LN(ctx, '#2a1810', 17, 4, 15, -6);
    ctx.drawImage(Dg.beard.c, R(3 - Dg.beard.ax), R(5 - Dg.beard.ay));
    ctx.restore();
  }
  ctx.restore();
  o.top = o.y + hy - 24;
}
// the bell, hung from its pivot and swinging
function buildBell() {
  const c = can(18, 18), x = cx2(c);
  P(x, IP.ink, 7, 0, 4, 3); P(x, '#8b94a0', 8, 1, 2, 1);
  for (let y = 2; y < 15; y++) {
    const hw = R(3 + (y - 2) * 0.42 + (y > 12 ? 1.5 : 0));
    P(x, IP.ink, 9 - hw - 1, y, hw * 2 + 2, 1);
    P(x, y > 12 ? '#7a5a16' : '#b58a26', 9 - hw, y, hw * 2, 1);
    P(x, '#dcb44c', 9 - hw + 1, y, 2, 1); P(x, '#ffe9a0', 9 - hw + 1, y, 1, 1);
  }
  P(x, IP.ink, 1, 15, 16, 2);
  P(x, IP.ink, 7, 15, 4, 3); P(x, '#3a414a', 8, 16, 2, 1);
  return spr(c, 9, 0);
}
function drawBell(ctx, x, y, a) {
  const b = VIL.bell; if (!b) return;
  ctx.save(); ctx.translate(R(x), R(y)); ctx.rotate(a || 0);
  ctx.drawImage(b.c, -b.ax, 0); ctx.restore();
}
// the cartoon scrap he changes inside: a boiling knot of dust, stepped at
// 12 frames a second, with an arm or a boot or a star flung out of it
function drawScuffle(ctx, x, y, t, k) {
  if (k <= 0 || k >= 1) return;
  const step = Math.floor(t * 12), C = capOtter();
  const grow = Math.min(1, k * 6) * Math.min(1, (1 - k) * 5);
  const puffs = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + hash2(i, step) * 0.7;
    const rr = (9 + hash2(i * 3, step) * 6) * grow;
    puffs.push([x + Math.cos(a) * 14 * (0.6 + hash2(step, i) * 0.5), y + Math.sin(a) * 9 - 2, rr]);
  }
  puffs.push([x, y - 4, 14 * grow]);
  for (const p of puffs) disc(ctx, p[0], p[1], p[2] + 1, IP.ink);
  for (const p of puffs) disc(ctx, p[0], p[1], p[2], '#e6e0d2');
  for (const p of puffs) disc(ctx, p[0] - 2, p[1] - 2, p[2] - 4, '#fbf8f0');
  if (grow < 0.6 || !C) return;
  // what sticks out of it this frame
  const pick2 = step % 5;
  ctx.save();
  if (pick2 === 0 || pick2 === 3) { ctx.translate(R(x + 16), R(y - 6)); ctx.rotate(-0.6 + hash2(step, 5)); ctx.drawImage(C.arm.c, -C.arm.ax, -C.arm.ay); }
  else if (pick2 === 1) { ctx.translate(R(x - 18), R(y + 2)); ctx.rotate(2.6 + hash2(step, 7) * 0.5); ctx.drawImage(C.tail.c, -C.tail.ax, -C.tail.ay); }
  else if (VIL.dis) { ctx.translate(R(x + 6), R(y - 18)); ctx.rotate(-0.8 + hash2(step, 2) * 1.6); ctx.drawImage(VIL.dis.sleeve.c, -VIL.dis.sleeve.ax, -VIL.dis.sleeve.ay); }
  ctx.restore();
  for (let i = 0; i < 3; i++) {
    const sx = R(x + (hash2(i, step) - 0.5) * 56), sy = R(y - 14 + (hash2(step, i) - 0.5) * 30);
    P(ctx, '#ffe48f', sx - 2, sy, 5, 1); P(ctx, '#ffe48f', sx, sy - 2, 1, 5);
  }
}
// a musket going off: a flash, then smoke that thickens and drifts
function drawShot(ctx, s, t) {
  const e = t - s.t0; if (e < 0 || e > 2.4) return;
  if (e < 0.10) {
    P(ctx, '#ffffff', R(s.x) - 3, R(s.y) - 3, 7, 7); P(ctx, '#ffe48f', R(s.x) + 3, R(s.y) - 1, 8, 3);
    P(ctx, '#ffe48f', R(s.x) - 1, R(s.y) - 8, 3, 16);
  }
  for (let i = 0; i < 5; i++) {
    const k = clamp((e - i * 0.05) / 2.2, 0, 1); if (k <= 0) continue;
    const a = qa(0.62 * (1 - k));
    if (a <= 0) continue;
    disc(ctx, s.x + s.dx * (6 + i * 5) * (0.4 + k) + Math.sin(i * 2.3) * 3, s.y - k * 18 - i * 2, 3 + k * 8, rgbaq('#d8d4cc', a));
  }
}
// the whole village art set, one slice per call
const VIL_STEPS = [
  () => { travelArt(); },
  () => { VIL.street = buildStreet(); },
  () => { VIL.shore = buildShoreW(); VIL.under = buildUnderW(); },
  () => { VIL.folk = {}; for (const k in FOLK_SPEC) VIL.folk[k] = buildFolk(FOLK_SPEC[k]); },
  () => { VIL.dis = buildDisguise(); VIL.bell = buildBell(); buildCatchSprites(); },
];
let CINE_BAKE_MS = 0;
function cineBakeStep() {
  if (VIL.ready) return false;
  const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
  VIL_STEPS[VIL.step++]();
  CINE_BAKE_MS += ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
  if (VIL.step >= VIL_STEPS.length) VIL.ready = true;
  return true;
}
function villageArt() { while (!VIL.ready) cineBakeStep(); return VIL; }

// ============================================================ THE TRAVEL ====
//  Whenever she sets out from the chart: open water at full speed, him on his
//  feet on her back with the blade out pointing the way, the reef tearing
//  past in four layers, a school blowing apart in front of her, a trawler's
//  hull going over that she ducks, a loop for the sheer joy of it, and a
//  breach -- clean out of the water, sky under both of them -- before the
//  name of the place comes down.
const TRAVEL_LINES = {
  village:   [['otter', 'Fisher village, dead ahead!'], ['you', 'That\'s where they loaded him.'], ['otter', 'Then somebody saw it.']],
  cannery:   [['otter', 'Smell that? The cannery.'], ['you', 'That\'s not just fish.'], ['otter', 'Then we shut it for good.']],
  marrow:    [['otter', 'Marrow. They patch the fleet.'], ['you', 'Not after today.'], ['otter', 'HA! Hard to port!']],
  blackbone: [['otter', 'Blackbone. They pen whales.'], ['you', 'Then we open the pens.'], ['otter', 'And gut the winch men.']],
  shoals:    [['otter', 'The Shoals. No cover out here.'], ['you', 'For them either.'], ['otter', 'Ha! Nowhere to run!']],
  deep:      [['otter', 'The Deep Roads. Chief\'s water.'], ['you', 'And my brother\'s.'], ['otter', 'Then we bring him home.']],
};
const TSURF = 86, TBED = 332;
// her line through the water, beat time -> world y before the camera tilt
function trvY(t) {
  let y = 160 + Math.sin(t * 2.3) * 5;
  const u = (t - 1.70) / 1.90;
  if (u > 0 && u < 1) y += 86 * Math.sin(Math.PI * ss(u));
  if (t >= 5.0) {
    const rise = 0.55, t0 = 5.0, y0 = 160 + Math.sin(t0 * 2.3) * 5;
    const v0 = 2 * (y0 - TSURF) / rise, g = v0 * v0 / 100, air = 2 * v0 / g;
    const ts = t0 + rise, te = ts + air;
    if (t < ts) { const k = (t - t0) / rise; y = lerp(y0, TSURF, k * k); }
    else if (t < te) { const s = t - ts; y = TSURF - v0 * s + 0.5 * g * s * s; }
    else { const k = clamp((t - te) / 0.9, 0, 1); y = lerp(TSURF, 172 + Math.sin(t * 2.3) * 4, 1 - (1 - k) * (1 - k)); }
  }
  return y;
}
function trvTimes() {
  const y0 = 160 + Math.sin(5.0 * 2.3) * 5, v0 = 2 * (y0 - TSURF) / 0.55, g = v0 * v0 / 100;
  return { up: 5.55, down: 5.55 + 2 * v0 / g };
}
function trvSchool(n, x, y, spread, kind, size) {
  for (let i = 0; i < n; i++) {
    SC.fish.push({ x: x + rand(-spread, spread), y: y + rand(-spread * 0.45, spread * 0.45), vx: -rand(18, 46), vy: rand(-6, 6),
                   kind: kind, s: size, ph: rand(0, TAU), flee: 0 });
  }
}
CINE.travel = [{
  name: 'travel', dur: 8.6,
  talk: null,
  anchor(who) {
    const cam = SC.cam || 0;
    if (who === 'otter') return anc(SC.ot.x + 4, SC.ot.y - 44 + cam);
    return ancUnder(A.you, cam);
  },
  enter() {
    travelArt();
    const d = Cine.opts.dest || {};
    const L = TRAVEL_LINES[d.kind] || TRAVEL_LINES.village;
    this.talk = [[0.35, L[0][0], L[0][1]], [1.85, L[1][0], L[1][1]], [3.40, L[2][0], L[2][1]]];
    A.you = actor(MAN.youBig, -110, 160, { beat: 8, exp: 'angry', tailAmp: 0.34, flipperA: 0.25, scarred: true });
    SC.ot = { x: -110, y: 130, phase: 0, rot: 0, exp: 'grin', flip: false, ride: false,
              sq: 0, sqv: 0, sx: 1, sy: 1, blade: 1, bladeR: -0.35, armNear: -0.25, armFar: -0.9 };
    rideOn(SC.ot, A.you);
    SC.cam = 0; SC.spd = 380; SC.fish = []; SC.hullX = 900; SC.propA = 0;
    SC.up = false; SC.down = false; SC.looped = false; SC.cheer = false;
    SC.T = trvTimes();
    trvSchool(16, 600, 150, 70, 1, 1);
    trvSchool(10, 700, 210, 50, 3, 0);
  },
  update(dt, bt) {
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    // pace: fast, a touch slower through the loop, fastest out of the breach
    const loopK = clamp((bt - 3.75) / 1.05, 0, 1);
    const target = (loopK > 0 && loopK < 1) ? 300 : bt > 5.0 && bt < 7.2 ? 460 : 400;
    SC.spd = smooth(SC.spd, target, 3, dt);
    Cine.scroll += SC.spd * dt;
    // the camera tilts up to keep the breach in frame, then settles
    const cam0 = SC.cam;
    SC.cam = R(96 * (ss((bt - 5.05) / 0.5) - ss((bt - 6.45) / 0.85)));
    const dc = SC.cam - cam0;
    if (dc) for (const p of FX.list) p.y += dc;
    // ---- her line
    const enterK = outCube(clamp(bt / 1.0, 0, 1));
    let x = lerp(-110, 236, enterK) + Math.sin(bt * 0.8) * 8 + ss(clamp((bt - 5.0) / 1.2, 0, 1)) * 44;
    let y = trvY(bt);
    const vy = (trvY(bt + 0.01) - trvY(bt - 0.01)) / 0.02;
    let rot = Math.atan2(vy, bt > 5.4 && bt < SC.T.down + 0.1 ? 250 : 330);
    rot = clamp(rot, -0.95, 0.95);
    if (loopK > 0 && loopK < 1) {
      // a loop: up, over on her back, down and out where she went in
      const a = TAU * ss(loopK), r = 36;
      x += r * Math.sin(a); y += -r * (1 - Math.cos(a));
      rot = -a;
      if (!SC.looped) { SC.looped = true; kick(SC.ot, 6); if (typeof Audio_ !== 'undefined') Audio_.tone(260, 0.3, 'sine', 0.05, 380); }
    }
    A.you.x = x; A.you.y = y;
    A.you.rot = (loopK > 0 && loopK < 1) ? rot : smooth(A.you.rot, rot, 10, dt);
    A.you.beat = lerp(6.5, 9.5, clamp((SC.spd - 300) / 160, 0, 1));
    A.you.exp = talking('you') ? 'talk' : 'angry';
    // ---- him, planted on her back through every bit of it
    rideOn(SC.ot, A.you);
    SC.ot.phase += dt * 3.2;
    SC.ot.exp = talking('otter') ? 'talk' : (loopK > 0 && loopK < 1) || (bt > SC.T.up - 0.2 && bt < SC.T.down) ? 'grin' : 'angry';
    const air = bt > SC.T.up - 0.1 && bt < SC.T.down + 0.2;
    // the blade out along his arm, pointing the way; straight up in the air
    SC.ot.armNear = air ? -2.35 + Math.sin(bt * 9) * 0.12 : -0.25 + Math.sin(SC.ot.phase * 1.4) * 0.10;
    SC.ot.bladeR = air ? -0.9 : -0.35;
    SC.ot.armFar = -0.9 - Math.sin(SC.ot.phase) * 0.2;
    SC.ot.headR = (bt > 1.9 && bt < 3.3) ? 0.16 : 0;      // ducks as the hull goes over
    // ---- the hull she goes under
    SC.hullX = lerp(900, -380, clamp((bt - 1.0) / 3.4, 0, 1));
    SC.propA += dt * 26;
    if (Math.abs(SC.hullX - 300) < 420) engine(dt, 0.8 - Math.abs(SC.hullX - 300) / 600);
    // ---- the school in front of her, and the ones after the breach
    if (!SC.sch2 && bt > 4.6) { SC.sch2 = true; trvSchool(14, 720, 130, 60, 0, 1); }
    if (!SC.sch3 && bt > 6.9) { SC.sch3 = true; trvSchool(18, 700, 190, 80, 2, 0); trvSchool(6, 760, 230, 30, 1, 2); }
    const nx = A.you.x + 50, ny = A.you.y;
    for (let i = SC.fish.length - 1; i >= 0; i--) {
      const f = SC.fish[i];
      if (!f.flee && Math.abs(f.x - nx) < 120 && Math.abs(f.y - ny) < 80) {
        f.flee = 1;
        const s = (f.y < ny ? -1 : 1) * (Math.abs(f.y - ny) < 6 ? (Math.random() < 0.5 ? -1 : 1) : 1);
        f.vy = s * rand(150, 260); f.vx = rand(-30, 90);
        if (Math.random() < 0.3) FX.bubble(f.x, f.y, 1, 1.2);
      }
      if (f.flee) { f.vy *= 1 - dt * 1.6; f.vx = smooth(f.vx, 60, 1.2, dt); }
      f.x += (f.vx - SC.spd * 0.9) * dt; f.y += f.vy * dt; f.ph += dt * (f.flee ? 16 : 7);
      if (f.x < -60 || f.y < TSURF - 10 || f.y > TBED + 10) SC.fish.splice(i, 1);
    }
    // ---- the breach
    const tail = bodyPoint(A.you, -52, 2);
    if (bt > SC.T.up && !SC.up) {
      SC.up = true; Cine.shake = 5; kick(A.you, 7); kick(SC.ot, 9);
      FX.drops(A.you.x + 30, TSURF + SC.cam, 60, 1.5); FX.foam(A.you.x + 20, TSURF + SC.cam + 2, 30, 1.4);
      FX.ring(A.you.x + 20, TSURF + SC.cam + 2, 60, 0.8);
      if (typeof Audio_ !== 'undefined') { Audio_.splash(2.4); Audio_.tone(330, 0.35, 'square', 0.05, 330); }
    }
    if (air && Math.random() < 30 * dt) FX.add({ k: 'd', x: tail[0], y: tail[1] + SC.cam, vx: rand(-60, 20), vy: rand(-40, 30), life: rand(0.4, 0.9), c: '#eaf8ff' });
    if (bt > SC.T.down && !SC.down) {
      SC.down = true; Cine.shake = 8; kick(A.you, -8); kick(SC.ot, -8);
      FX.drops(A.you.x + 40, TSURF + SC.cam, 70, 1.6); FX.foam(A.you.x + 40, TSURF + SC.cam + 2, 34, 1.6);
      FX.bubble(A.you.x + 20, TSURF + SC.cam + 20, 26, 2.2); FX.ring(A.you.x + 40, TSURF + SC.cam + 2, 70, 0.9);
      if (typeof Audio_ !== 'undefined') Audio_.splash(3.2);
    }
    if (!SC.cheer && bt > SC.T.up + 0.25) { SC.cheer = true; if (typeof Audio_ !== 'undefined') Audio_.rampage(); }
    // ---- wake: a stream of bubbles off her tail under water
    if (!air && Math.random() < 40 * dt) FX.bubble(tail[0], tail[1] + SC.cam, 1, 2.4);
    FX.flow(-SC.spd * 0.6, dt);
    for (const p of FX.list) if (p.k === 'b' || p.k === 'f') p.x -= SC.spd * 0.45 * dt;
    churnSound(dt, 0.5);
  },
  render(ctx, bt) {
    const cam = SC.cam, sY = TSURF + cam, bY = TBED + cam;
    backdrop(ctx, { mood: 'dawn', grade: 'dawn', mid: 'midClean', scroll: Cine.scroll, t: Cine.t, surfY: sY, bedY: bY, shafts: 1, causticBed: true });
    drawAir(ctx, sY, Cine.scroll, Cine.t, 'day');
    // the fish, turned to wherever they are going
    for (const f of SC.fish) {
      const sp = FISHSPR[f.kind] && FISHSPR[f.kind][f.s]; if (!sp) continue;
      const hx = f.vx, hy = f.vy, left = hx < 0;
      ctx.save(); ctx.translate(R(f.x), R(f.y + cam + Math.sin(f.ph) * 1.5));
      if (left) ctx.scale(-1, 1);
      ctx.rotate(clamp(Math.atan2(hy, Math.abs(hx) + 20), -1.2, 1.2) + Math.sin(f.ph) * 0.10);
      ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.restore();
    }
    // the hull overhead and the shadow it throws down through the light
    if (SC.hullX > -360 && SC.hullX < 900) {
      hullShade(ctx, SC.hullX - 20, sY + 26, 150, 150, 0.9);
      drawBoat(ctx, SC.hullX, sY + Math.sin(Cine.t * 2) * 1.5, Math.sin(Cine.t * 1.6) * 0.015, SC.propA, 0.9, Cine.t);
    }
    // speed, streaming off her
    const a = clamp((SC.spd - 250) / 200, 0, 1);
    const w1 = (Cine.t * 360) % 74, w2 = (Cine.t * 260) % 58;
    speedLines(ctx, A.you.x - 90 - w1, A.you.y + cam, R(10 + a * 12), R(40 + a * 50), -1, rgbaq('#f2fdff', 0.26 + a * 0.30), 7);
    speedLines(ctx, A.you.x - 44 - w2, A.you.y + cam - 30, R(6 + a * 6), R(30 + a * 36), -1, rgbaq('#dff6ff', 0.18 + a * 0.2), 19);
    ctx.save(); ctx.translate(0, cam);
    drawManatee(ctx, A.you, Cine.t);
    drawCapOtter(ctx, SC.ot, Cine.t);
    ctx.restore();
    FX.render(ctx);
    foreground(ctx, { grade: 'dawn', scroll: Cine.scroll, t: Cine.t, bedY: bY });
    tile(ctx, TRV.kelpFront, Cine.scroll * 2.3, bY - TRV.kelpFront.height + 26);
    const d = Cine.opts.dest || {};
    chapterCard(ctx, clamp((bt - 6.25) / 2.3, 0, 1), bt, d.chapter || 'I', d.name || 'FISHER VILLAGE');
  },
}];

// ========================================================= THE VILLAGE ======
//  The first time they come into Fisher Village.  He goes ashore to ASK --
//  in a disguise he is very proud of -- about a little grey calf, very loud,
//  and the whole port turns its back on him: a back, a shutter, a door, a
//  gob of spit.  Then the beard comes off, somebody rings the bell, and the
//  two of them stop asking.
//  Five beats: the pier from underneath, the street, the unmasking, and back
//  down into the water for the last two lines before the fight.
function folkO(key, x, y, o) {
  return Object.assign({ F: VIL.folk[key], x: x, y: y, flip: true, face: 'calm', armNear: 1.35, armFar: 1.45, headR: 0, lean: 0, phase: 0, walk: 0, sq: 0, sqv: 0, sx: 1, sy: 1 }, o || {});
}
// the villager a 'man' line belongs to is the fourth field of the line
function manAnchor(b) {
  const L = b.talk && b.talk[SAY.i];
  const f = L && SC.folk && SC.folk[L[3]];
  if (!f) return anc(320, 120);
  if (L[3] === 'wife') return anc(VS.win[0] + 14, VS.win[1] - 4);
  return anc(f.x, folkTop(f) - 4);
}
function streetBack(ctx) {
  // the game's display keeps whatever a transparent pixel leaves behind, so
  // the frame starts opaque
  P(ctx, RIDGE_NEAR[0], 0, 0, 640, 360);
  drawAir(ctx, 256, Cine.scroll, Cine.t, 'day');
  ctx.drawImage(VIL.street, 0, 0);
  // water glinting under the boards
  for (let i = 0; i < 12; i++) {
    const gx = R((hash2(i, 5) * 700 + Cine.t * 14) % 660) - 10, gy = VS.deck + 30 + R(hash2(5, i) * 16);
    if (((Cine.t * 3 + i) | 0) & 1) P(ctx, '#9ad6ea', gx, gy, 4, 1);
  }
}
// her window: the woman leaning on the sill, and the two shutters.  k is how
// far the shutters are closed (0 open .. 1 shut); lean is how far out she is.
function drawWindowScene(ctx, k, lean, face) {
  const [wx, wy, ww, wh] = VS.win, pal = VHOUSE.pitch, sw = R(ww / 2);
  const f = SC.folk.wife;
  if (k < 0.999) {
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    f.x = wx + 20 - R(lean * 6); f.y = wy + wh + 30 + R((1 - lean) * 10); f.face = face || f.face;
    drawFolk(ctx, f, Cine.t);
    ctx.restore();
    // the sill in front of her, and her near arm resting on it
    P(ctx, IP.ink, wx - 4, wy + wh + 1, ww + 8, 4); P(ctx, pal.trim, wx - 3, wy + wh + 1, ww + 6, 2);
  }
  // Each shutter swings on its outer hinge: flat on the wall, edge on, shut.
  const flip = (hx, dir) => {
    const a = k * Math.PI, w = R(sw * Math.abs(Math.cos(a)));
    const col = Math.cos(a) > 0 ? pal.shut : shadeHex(pal.shut, 0.72);
    if (a < Math.PI / 2) { if (dir < 0) vShutter(ctx, hx - 3 - w, wy, w, wh, col); else vShutter(ctx, hx + 3, wy, w, wh, col); }
    else { if (dir < 0) vShutter(ctx, hx, wy, w, wh, col); else vShutter(ctx, hx - w, wy, w, wh, col); }
  };
  flip(wx, -1); flip(wx + ww, 1);
}
// his doorway: the man in it, and the door swinging shut across it
function drawDoorScene(ctx, k, back, out) {
  const [dx, dy, dw, dh] = VS.door;
  const f = SC.folk.door;
  if (k < 0.999 && !out) {
    ctx.save(); ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
    drawFolk(ctx, f, Cine.t);
    if (back > 0) { ctx.fillStyle = rgbaq('#0e0a0c', qa(back * 0.75)); ctx.fillRect(dx, dy, dw, dh); }
    ctx.restore();
  }
  if (k > 0.001) vDoorPanel(ctx, dx, dy, R(dw * Math.min(1, k)), dh, '#4a3322');
}
function drawTable(ctx) {
  const [tx, ty, tw] = VS.table;
  P(ctx, IP.ink, tx - 1, ty - 1, tw + 2, 5); P(ctx, WOOD.l, tx, ty, tw, 3); P(ctx, WOOD.h, tx, ty, tw, 1);
  P(ctx, '#6b1c18', tx + 6, ty, 12, 1); P(ctx, '#4a1014', tx + 22, ty + 1, 8, 1);
  for (const lx of [tx + 2, tx + tw - 5]) { P(ctx, IP.ink, lx - 1, ty + 3, 5, VS.deck - ty - 3); P(ctx, WOOD.m, lx, ty + 3, 3, VS.deck - ty - 3); }
  // a fish on the board, half done
  const sp = CATCH.byName && CATCH.byName.fishSilver;
  if (sp) ctx.drawImage(sp.c, tx + 10, ty - sp.h + 2);
  P(ctx, '#7c1414', tx + 30, ty - 1, 6, 1);
}
function drawLadSeat(ctx) { vBarrel(ctx, 556, 268, 16, 20); }
function drawMenderSeat(ctx) { vCrate(ctx, 140, 274, 20, 14); }
function clang(ctx, bt, t0) {
  if (bt < t0) return;
  const e = bt - t0, n = Math.floor(e / 0.42), f = (e % 0.42) / 0.42;
  if (f > 0.7) return;
  const side = (n & 1) ? 1 : -1;
  pixelTextOutlined(ctx, 'CLANG!', VS.bell[0] - 30 + side * 8 - R(f * 6), VS.bell[1] - 26 - R(f * 8), 9, '#ffe48f', '#14141c', 'center');
}
function bellSound(dt) {
  SC.bellT = (SC.bellT || 0) - dt;
  if (SC.bellT <= 0) {
    SC.bellT = 0.42;
    if (typeof Audio_ !== 'undefined') { Audio_.tone(880, 0.7, 'triangle', 0.07, -20); Audio_.tone(1320, 0.4, 'sine', 0.035); }
  }
}
function slamSound() { if (typeof Audio_ !== 'undefined') { Audio_.noise(0.10, 0.32, 900, 80); Audio_.tone(95, 0.10, 'square', 0.12, -40); } }
// the shared set-up of the villagers for the street beats
function streetFolk() {
  SC.folk = {
    mender: folkO('mender', 150, VS.deck, { sit: 14, flip: true, armNear: 0.4, armFar: 0.9, face: 'calm', hold: null }),
    wife:   folkO('wife', VS.win[0] + 20, VS.win[1] + VS.win[3] + 30, { flip: true, armNear: 0.2, armFar: 0.5 }),
    door:   folkO('door', VS.door[0] + 14, VS.deck, { flip: true, armNear: 1.5, armFar: 1.3 }),
    gutter: folkO('gutter', 512, VS.deck, { flip: true, armNear: 0.6, armFar: 0.9, hold: 'cleaver', holdR: 0.9 }),
    lad:    folkO('lad', 562, 284, { sit: 16, flip: true, feet: -2, dangle: true, armNear: 1.2, armFar: 1.0 }),
  };
}

// ---------------------------------------------------------------- 1. PIER
//  From under the boards.  She noses in among the pilings with him on her
//  back; he has a plan.  He goes up out of the water onto the pier, there is
//  a cartoon scrap with nobody in it, and out of it steps a FISHERMAN.
CINE.village = [];
CINE.village.push({
  name: 'pier', dur: 11.4,
  talk: [
    [0.60, 'otter', 'Fisher village. Quiet lot.'],
    [2.20, 'you', 'Too quiet.'],
    [3.70, 'otter', 'Leave the talking to me.'],
    [5.30, 'you', 'They\'ll know you.'],
    [7.05, 'otter', 'Not in THIS they won\'t.'],
    [8.75, 'you', '...That\'s a beard.'],
    [10.05, 'otter', 'It\'s a FINE beard.'],
  ],
  anchor(who) {
    if (who === 'otter') {
      if (SC.stage >= 2) return anc(SC.dis.x + 2, (SC.dis.top || SC.dis.y - 80) - 4);
      if (SC.stage === 1) return anc(300, 96);
      return anc(SC.ot.x + 4, SC.ot.y - 44);
    }
    return ancUnder(A.you);
  },
  enter() {
    villageArt();
    A.you = actor(MAN.youBig, -120, 274, { beat: 3.0, exp: 'calm', tailAmp: 0.24, scarred: true });
    SC.ot = { x: -120, y: 230, phase: 0, rot: 0, exp: 'sly', flip: false, ride: false, sq: 0, sqv: 0, sx: 1, sy: 1, blade: 1, bladeR: -1.0 };
    rideOn(SC.ot, A.you);
    SC.dis = { x: 300, y: VW.deck, phase: 0, walk: 0, rot: 0, exp: 'grin', beard: true, hat: true, sq: 0, sqv: 0, sx: 1, sy: 1 };
    SC.stage = 0; SC.jumped = false; SC.splashed = false; SC.revealed = false; SC.sch1 = makeSchool(8, 520, 280, 40, 0, 2, -12);
  },
  update(dt, bt) {
    Cine.scroll += 4 * dt;
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt); bounce(SC.dis, dt);
    const k = outCube(clamp(bt / 2.4, 0, 1));
    A.you.x = lerp(-120, 176, k) + Math.sin(bt * 0.6) * 3;
    A.you.y = 274 + Math.sin(bt * 0.9) * 3;
    A.you.rot = smooth(A.you.rot, bt < 2.2 ? 0.04 : -0.04 + Math.sin(bt * 0.8) * 0.03, 3, dt);
    A.you.beat = lerp(3.0, 1.0, k);
    A.you.exp = talking('you') ? 'talk' : bt > 8.7 ? 'calm' : 'angry';
    SC.ot.phase += dt * 2;
    if (!SC.jumped) {
      rideOn(SC.ot, A.you);
      SC.ot.exp = talking('otter') ? 'talk' : 'sly';
      SC.ot.armNear = bt > 3.6 && bt < 5.2 ? -1.9 + Math.sin(bt * 6) * 0.2 : 0.9 + Math.sin(SC.ot.phase) * 0.3;   // a thumb at the pier
      SC.ot.headR = bt > 5.3 ? -0.2 : 0;
    }
    // up and out of the water onto the boards
    if (bt >= 6.15 && !SC.jumped) { SC.jumped = true; SC.j0 = [SC.ot.x, SC.ot.y]; kick(A.you, 6); if (typeof Audio_ !== 'undefined') Audio_.tone(420, 0.12, 'square', 0.06, 260); }
    if (SC.jumped && SC.stage === 0) {
      const u = clamp((bt - 6.15) / 0.65, 0, 1);
      SC.ot.x = lerp(SC.j0[0], 300, u);
      SC.ot.y = lerp(SC.j0[1], VW.deck - 20, u) - Math.sin(u * Math.PI) * 70;
      SC.ot.rot = -u * TAU;
      SC.ot.exp = 'grin';
      if (!SC.splashed && SC.ot.y < VW.surf) { SC.splashed = true; FX.drops(SC.ot.x, VW.surf, 40, 1.2); FX.foam(SC.ot.x, VW.surf + 2, 18, 1); if (typeof Audio_ !== 'undefined') Audio_.splash(1.4); }
      if (u < 0.4 && Math.random() < 30 * dt) FX.bubble(SC.ot.x, SC.ot.y, 1, 2);
      if (u >= 1) { SC.stage = 1; SC.ot.rot = 0; if (typeof Audio_ !== 'undefined') Audio_.noise(0.1, 0.2, 700, 90); }
    }
    // the scrap
    if (SC.stage === 1) {
      if (Math.random() < 9 * dt && typeof Audio_ !== 'undefined') Audio_.noise(0.06, 0.12, 2200 + rand(0, 1400), 300);
      if (Math.random() < 5 * dt) FX.add({ k: 'd', x: 300 + rand(-10, 10), y: 124, vx: rand(-120, 120), vy: rand(-160, -60), life: rand(0.4, 0.9), c: pick(['#ffe48f', '#f5cc4a', '#e6e0d2']) });
      if (bt >= 8.25) {
        SC.stage = 2; kick(SC.dis, 10);
        FX.foam(300, 120, 30, 1.2);
        if (typeof Audio_ !== 'undefined') { Audio_.tone(523, 0.12, 'square', 0.06); setTimeout(() => Audio_.tone(784, 0.2, 'square', 0.06), 110); }
      }
    }
    if (SC.stage >= 2) {
      SC.dis.phase += dt * 3;
      SC.dis.exp = talking('otter') ? 'talk' : 'grin';
      // ta-da, then a proud pat of the beard for the last line
      const pat = bt > 10.0;
      SC.dis.armNear = pat ? -0.5 + Math.sin(bt * 14) * 0.25 : bt < 9.0 ? 0.05 : 1.2;
      SC.dis.armFar = bt < 9.0 ? -2.3 : 1.3;
      SC.dis.rot = Math.sin(bt * 2.3) * 0.03;
    }
    if (Math.random() < 1.2 * dt) FX.bubble(A.you.x + 40, A.you.y - 12, 1, 0.5);
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'cold', grade: 'cold', scroll: Cine.scroll, t: Cine.t, surfY: VW.surf, bedY: VW.bed, shafts: 0.8, causticBed: true });
    drawAir(ctx, VW.surf, Cine.scroll, Cine.t, 'day');
    ctx.drawImage(VIL.shore, 0, 0);
    ctx.drawImage(VIL.under, 0, VW.surf);
    drawSchool(ctx, SC.sch1, Cine.t, Cine.dt);
    drawManatee(ctx, A.you, Cine.t);
    if (SC.stage === 0) drawCapOtter(ctx, SC.ot, Cine.t);
    if (SC.stage >= 2) drawDisguise(ctx, SC.dis, Cine.t);
    if (SC.stage === 1) drawScuffle(ctx, 300, 128, Cine.t, clamp((bt - 6.8) / 1.45, 0.001, 0.999));
    FX.render(ctx);
    foreground(ctx, { grade: 'cold', scroll: Cine.scroll, t: Cine.t, bedY: VW.bed });
  },
});

// ---------------------------------------------------------------- 2. ASK
//  Down the street on his stilts, asking.  Every one of them answers the
//  same way, which is not at all.
CINE.village.push({
  name: 'ask', dur: 11.8,
  talk: [
    [0.45, 'otter', 'Good day, fellow humans!'],
    [2.15, 'otter', 'Seen a little grey one?'],
    [3.95, 'otter', 'Very loud? Bit chubby?'],
    [6.00, 'otter', 'Ma\'am? Small? Whiskers?'],
    [7.95, 'otter', 'Sir, one question--'],
    [10.25, 'man', '...', 'gutter'],
  ],
  anchor(who) {
    if (who === 'man') return manAnchor(this);
    return anc(SC.dis.x + 2, (SC.dis.top || SC.dis.y - 80) - 4);
  },
  enter() {
    villageArt();
    streetFolk();
    SC.dis = { x: -40, y: VS.deck, phase: 0, walk: 1, rot: 0, exp: 'grin', beard: true, hat: true, sq: 0, sqv: 0, sx: 1, sy: 1 };
    SC.shut = 0; SC.door = 0; SC.doorBack = 0; SC.lean = 1;
    SC.turned = false; SC.slam1 = false; SC.slam2 = false; SC.spat = false; SC.spit = null; SC.splat = null;
  },
  update(dt, bt) {
    Cine.scroll += 3 * dt;
    bounce(SC.dis, dt);
    const F = SC.folk;
    for (const k in F) bounce(F[k], dt);
    // his walk: in, stop, on, stop, on, stop, on, stop
    const path = [[0, -40], [1.6, 104], [4.6, 104], [5.7, 242], [7.2, 242], [8.0, 404], [9.0, 404], [9.5, 462]];
    let x = path[path.length - 1][1], walking = false;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      if (bt >= a[0] && bt < b[0]) { const u = (bt - a[0]) / (b[0] - a[0]); x = lerp(a[1], b[1], a[1] === b[1] ? 0 : ss(u)); walking = a[1] !== b[1]; break; }
    }
    SC.dis.x = x;
    SC.dis.walk = smooth(SC.dis.walk, walking ? 1 : 0, 10, dt);
    SC.dis.phase += dt * 9 * SC.dis.walk;
    SC.dis.rot = Math.sin(SC.dis.phase * 0.5) * 0.06 * SC.dis.walk + Math.sin(bt * 2) * 0.015;
    if (walking && Math.sin(SC.dis.phase) * Math.sin(SC.dis.phase - dt * 9) <= 0 && typeof Audio_ !== 'undefined') Audio_.tone(150, 0.04, 'square', 0.04, -30);
    SC.dis.exp = talking('otter') ? 'talk' : bt > 8.4 ? 'idle' : 'grin';
    SC.dis.armNear = talking('otter') ? 0.45 + Math.sin(bt * 8) * 0.35 : 1.25;
    SC.dis.armFar = walking ? 1.1 + Math.sin(SC.dis.phase) * 0.3 : 1.25;
    SC.dis.headR = bt > 5.7 && bt < 7.2 ? -0.30 : 0;       // looking up at her window
    // ---- the mender: looks up at the stranger, then turns his back on him
    const m = F.mender;
    m.armNear = bt < 3.1 ? 0.4 + Math.sin(bt * 5) * 0.25 : 0.6;
    if (bt < 3.1) { m.flip = true; m.headR = bt > 0.8 ? -0.12 : 0.05; m.face = 'calm'; }
    else {
      if (!SC.turned) { SC.turned = true; kick(m, 5); if (typeof Audio_ !== 'undefined') Audio_.noise(0.08, 0.08, 600, 90); }
      m.flip = false; m.headR = -0.2; m.face = 'shut'; m.lean = 0.12;
    }
    // ---- the window
    const w = F.wife;
    w.face = bt > 6.2 ? 'scowl' : 'calm';
    w.headR = bt > 5.0 ? 0.25 : 0;
    SC.lean = bt < 6.55 ? 1 : smooth(SC.lean, 0, 14, dt);
    SC.shut = bt < 6.7 ? 0 : Math.min(1, (bt - 6.7) / 0.14);
    if (!SC.slam1 && SC.shut >= 1) { SC.slam1 = true; slamSound(); Cine.shake = 3; FX.foam(VS.win[0] + 20, VS.win[1] + 10, 10, 0.6); }
    // ---- the door
    const d = F.door;
    d.face = bt > 7.6 ? 'scowl' : 'calm';
    d.armNear = 1.5; d.headR = bt > 7.8 ? 0.1 : 0;
    SC.doorBack = bt < 8.55 ? 0 : clamp((bt - 8.55) / 0.2, 0, 1);
    d.x = VS.door[0] + 14 + R(SC.doorBack * 6);
    SC.door = bt < 8.75 ? 0 : Math.min(1, (bt - 8.75) / 0.1);
    if (!SC.slam2 && SC.door >= 1) {
      SC.slam2 = true; slamSound(); Cine.shake = 5; kick(SC.dis, -9);
      FX.foam(VS.door[0] + 14, VS.door[1] + 20, 14, 0.8);
      for (let i = 0; i < 10; i++) FX.add({ k: 'd', x: VS.door[0] + rand(0, VS.door[2]), y: VS.door[1] + rand(0, 10), vx: rand(-30, 30), vy: rand(10, 60), life: rand(0.4, 0.9), c: '#8a7a5a' });
    }
    // ---- the gutter: looks him up and down, and spits at his feet
    const g = F.gutter;
    g.armNear = bt < 9.4 ? 0.6 + Math.sin(bt * 7) * 0.5 : 0.9;       // still working the fish
    g.holdR = 0.9;
    g.face = bt > 9.55 && bt < 9.9 ? 'spit' : bt > 9.2 ? 'scowl' : 'calm';
    g.headR = bt > 9.4 && bt < 9.9 ? 0.25 : 0;
    if (!SC.spat && bt >= 9.8) {
      SC.spat = true;
      SC.spit = { x: g.x - 12, y: folkTop(g) + 13, vx: -52, vy: -40, t: 0 };
      if (typeof Audio_ !== 'undefined') Audio_.noise(0.06, 0.12, 3000, 800);
    }
    if (SC.spit) {
      const s = SC.spit; s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 420 * dt;
      if (s.y >= VS.deck - 1) { SC.splat = { x: R(s.x), t: bt }; SC.spit = null; if (typeof Audio_ !== 'undefined') Audio_.tone(700, 0.04, 'sine', 0.04, -300); }
    }
    // ---- the lad just watches, feet swinging
    F.lad.headR = Math.sin(bt * 0.7) * 0.06;
  },
  render(ctx, bt) {
    streetBack(ctx);
    const F = SC.folk;
    drawWindowScene(ctx, SC.shut, SC.lean, F.wife.face);
    drawDoorScene(ctx, SC.door, SC.doorBack);
    drawMenderSeat(ctx);
    drawFolk(ctx, F.mender, Cine.t);
    drawBell(ctx, VS.bell[0], VS.bell[1], Math.sin(Cine.t * 1.2) * 0.04);
    drawLadSeat(ctx);
    drawFolk(ctx, F.lad, Cine.t);
    drawFolk(ctx, F.gutter, Cine.t);
    drawTable(ctx);
    if (SC.splat) { P(ctx, IP.ink, SC.splat.x - 4, VS.deck - 3, 9, 3); P(ctx, '#d8e4d8', SC.splat.x - 3, VS.deck - 2, 7, 2); P(ctx, '#f4fff4', SC.splat.x - 1, VS.deck - 2, 3, 1); }
    drawDisguise(ctx, SC.dis, Cine.t);
    if (SC.spit) { P(ctx, IP.ink, R(SC.spit.x) - 2, R(SC.spit.y) - 2, 5, 5); P(ctx, '#eef8ee', R(SC.spit.x) - 1, R(SC.spit.y) - 1, 3, 3); P(ctx, rgbaq('#e8f4e8', 0.5), R(SC.spit.x) + 3, R(SC.spit.y) - 1, 4, 1); }
    FX.render(ctx);
  },
});

// -------------------------------------------------------------- 3. UNMASK
//  The beard goes first, then the hat -- and under the hat is the skull.
CINE.village.push({
  name: 'unmask', dur: 8.6,
  talk: [
    [0.30, 'otter', '...Tough crowd.'],
    [1.55, 'man', 'Wait. That\'s an OTTER.', 'gutter'],
    [3.05, 'man', 'The PIRATE! RING IT!', 'mender'],
    [4.55, 'man', 'PIRATES!', 'wife'],
    [5.95, 'otter', 'Wrong answer.'],
  ],
  anchor(who) {
    if (who === 'man') return manAnchor(this);
    if (SC.real) return anc(SC.ot.x + 4, SC.ot.y - 44);
    return anc(SC.dis.x + 2, (SC.dis.top || SC.dis.y - 80) - 4);
  },
  enter() {
    villageArt();
    streetFolk();
    const F = SC.folk;
    F.mender.flip = false; F.mender.face = 'shut'; F.mender.headR = -0.2; F.mender.lean = 0.12;
    F.gutter.face = 'scowl';
    SC.dis = { x: 462, y: VS.deck, phase: 0, walk: 0, rot: 0, exp: 'idle', beard: true, hat: true, sq: 0, sqv: 0, sx: 1, sy: 1 };
    SC.ot = { x: 462, y: VS.deck - 32, phase: 0, rot: 0, exp: 'angry', flip: false, ride: false, sq: 0, sqv: 0, sx: 1, sy: 1, blade: 1, bladeR: -1.0, vy: null };
    SC.shut = 1; SC.door = 1; SC.doorBack = 1; SC.lean = 0; SC.out = false;
    SC.beard = null; SC.hat = null; SC.real = false; SC.coat = null; SC.shot = null; SC.leap = null;
    SC.splat = { x: 450 };
    SC.bell = 0; SC.bellA = 0;
  },
  update(dt, bt) {
    Cine.scroll += 3 * dt;
    bounce(SC.dis, dt); bounce(SC.ot, dt);
    const F = SC.folk;
    for (const k in F) bounce(F[k], dt);
    SC.dis.exp = talking('otter') && !SC.real ? 'talk' : bt > 1.2 ? 'wide' : 'idle';
    // he backs off from the table on his stilts once the hat has gone
    const back = clamp((bt - 2.6) / 1.8, 0, 1);
    const wasX = SC.dis.x;
    SC.dis.x = lerp(462, 352, ss(back));
    const moving = Math.abs(SC.dis.x - wasX) > 0.05;
    SC.dis.walk = smooth(SC.dis.walk, moving ? 1 : 0, 10, dt);
    SC.dis.phase -= dt * 9 * SC.dis.walk;
    SC.dis.armNear = moving ? 0.3 + Math.sin(bt * 12) * 0.3 : 1.25;
    SC.dis.armFar = moving ? -0.6 + Math.sin(bt * 12 + 1) * 0.3 : 1.25;
    SC.dis.rot = Math.sin(SC.dis.phase * 0.5) * 0.07 * SC.dis.walk + Math.sin(bt * 2) * 0.02;
    // the beard lets go
    if (!SC.beard && bt >= 1.05) {
      SC.dis.beard = false;
      SC.beard = { x: SC.dis.x + 3, y: SC.dis.y - 46, vx: 14, vy: -30, r: 0, vr: 3.2, rest: false };
      SC.dis.headR = 0.25; kick(SC.dis, 4);
      if (typeof Audio_ !== 'undefined') Audio_.tone(300, 0.2, 'sine', 0.05, -200);
    }
    if (SC.beard && !SC.beard.rest) {
      const b = SC.beard; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 380 * dt; b.r += b.vr * dt;
      if (b.y >= VS.deck - 10) { b.y = VS.deck - 10; b.rest = true; b.r = 1.5; if (typeof Audio_ !== 'undefined') Audio_.noise(0.05, 0.1, 500, 80); }
    }
    // a gust, and the hat goes -- and there is the skull on his tricorn
    if (!SC.hat && bt >= 2.35) {
      SC.dis.hat = false;
      SC.hat = { x: SC.dis.x + 2, y: SC.dis.y - 70, vx: 150, vy: -120, r: 0, vr: 7 };
      kick(SC.dis, 6);
      if (typeof Audio_ !== 'undefined') Audio_.noise(0.5, 0.08, 1200, 400);
    }
    if (SC.hat) { const h = SC.hat; h.x += h.vx * dt; h.y += h.vy * dt; h.vy += 60 * dt; h.r += h.vr * dt; }
    if (bt > 2.2 && bt < 3.0 && Math.random() < 30 * dt) FX.add({ k: 'f', x: rand(380, 640), y: rand(150, 250), vx: rand(160, 320), vy: rand(-20, 20), r: 1, life: rand(0.3, 0.6) });
    if (bt > 1.0 && !SC.real) SC.dis.headR = smooth(SC.dis.headR || 0, bt > 2.4 ? -0.12 : 0.25, 5, dt);
    // ---- the port wakes up.  The gutter first, cleaver up.
    const g = F.gutter;
    g.face = talking('man') && SAY.i === 1 ? 'shout' : 'scowl';
    g.armNear = bt > 1.5 ? -0.5 + Math.sin(bt * 3) * 0.1 : 0.9;
    g.holdR = 0.3;
    // the mender off his crate with a gaff, and coming
    const m = F.mender;
    if (bt > 2.9) {
      const u = clamp((bt - 3.3) / 1.7, 0, 1);
      m.flip = false; m.sit = 0; m.lean = 0.06; m.headR = 0; m.hold = 'gaff';
      m.face = talking('man') && SAY.i === 2 ? 'shout' : 'scowl';
      m.x = lerp(150, 240, ss(u)); m.walk = u > 0 && u < 1 ? 1 : 0; m.phase += dt * 11 * m.walk;
      m.armNear = -0.25 + Math.sin(bt * 4) * 0.08; m.holdR = -0.05; m.armFar = 0.2;
      if (!SC.stood) { SC.stood = true; kick(m, 6); }
    }
    // the lad runs for the bell, and rings it
    const lad = F.lad;
    if (bt > 3.3) {
      const u = clamp((bt - 3.3) / 0.5, 0, 1);
      lad.sit = u < 0.2 ? 16 : 0; lad.flip = false; lad.walk = u < 1 ? 1 : 0; lad.phase += dt * 16 * (u < 1 ? 1 : 0);
      lad.x = lerp(562, VS.bell[0] - 8, ss(u)); lad.y = VS.deck;
      lad.face = 'shout';
      if (u >= 1) { lad.armNear = -2.4 + Math.sin(bt * 15) * 0.35; lad.armFar = -2.2 + Math.sin(bt * 15 + 1) * 0.3; }
    }
    if (bt > 3.85) { SC.bell = 1; bellSound(dt); }
    SC.bellA = SC.bell ? Math.sin((bt - 3.85) * TAU / 0.84) * 0.7 : Math.sin(Cine.t * 1.2) * 0.04;
    // the door bangs open again, and he comes out of it with a musket
    const d = F.door;
    if (bt > 4.0) {
      SC.door = Math.max(0, 1 - (bt - 4.0) / 0.1); SC.doorBack = 0; SC.out = true;
      d.face = 'shout'; d.hold = 'musket'; d.flip = true;
      d.x = lerp(VS.door[0] + 14, VS.door[0] - 2, ss(clamp((bt - 4.05) / 0.45, 0, 1)));
      d.walk = bt < 4.5 ? 1 : 0; d.phase += dt * 10 * d.walk;
      const aim = SC.real ? 0.32 : 0.12;                     // down at wherever he is
      d.armNear = aim + (SC.shot && Cine.t - SC.shot.t0 < 0.2 ? -0.35 : 0); d.holdR = 0.05; d.armFar = aim - 0.2;
      if (!SC.bang1) { SC.bang1 = true; slamSound(); Cine.shake = 4; }
    }
    // and the shutters fly open
    if (bt > 4.4) {
      SC.shut = Math.max(0, 1 - (bt - 4.4) / 0.12); SC.lean = smooth(SC.lean, 1, 10, dt);
      F.wife.face = 'shout';
      if (!SC.bang2) { SC.bang2 = true; slamSound(); }
    }
    // the coat comes off, the stilts go over, and there he is
    if (!SC.real && bt >= 5.15) {
      SC.real = true;
      SC.coat = { x: SC.dis.x, t: bt };
      SC.ot.x = SC.dis.x + 2; SC.ot.y = VS.deck - 20 - 14; SC.ot.vy = -60;
      FX.foam(SC.dis.x, VS.deck - 24, 20, 1);
      if (typeof Audio_ !== 'undefined') { Audio_.noise(0.18, 0.2, 900, 120); setTimeout(() => Audio_.tone(120, 0.08, 'square', 0.1), 180); setTimeout(() => Audio_.tone(100, 0.08, 'square', 0.1), 300); }
    }
    if (SC.real && !SC.leap) {
      SC.ot.phase += dt * 2.5;
      if (SC.ot.vy !== null) {
        SC.ot.y += SC.ot.vy * dt; SC.ot.vy += 500 * dt;
        if (SC.ot.y >= VS.deck - 20) { SC.ot.y = VS.deck - 20; SC.ot.vy = null; kick(SC.ot, 9); if (typeof Audio_ !== 'undefined') Audio_.tone(180, 0.08, 'square', 0.08, -60); }
      }
      SC.ot.exp = talking('otter') ? 'talk' : 'angry';
      const draw = clamp((bt - 5.5) / 0.3, 0, 1);
      SC.ot.armNear = lerp(0.9, -1.9, ss(draw)) + Math.sin(SC.ot.phase * 2) * 0.08;
      SC.ot.bladeR = lerp(-1.0, -0.6, ss(draw));
      SC.ot.armFar = -0.9;
      if (draw > 0 && !SC.drawn) { SC.drawn = true; if (typeof Audio_ !== 'undefined') { Audio_.noise(0.12, 0.07, 3600, 900); Audio_.tone(880, 0.06, 'sawtooth', 0.05, -400); } }
    }
    // over the side: a back flip up off the boards and down into the water in
    // front of them -- and the musket goes off where he was a moment ago
    if (bt >= 7.1) {
      if (!SC.leap) { SC.leap = [SC.ot.x, SC.ot.y]; kick(SC.ot, 6); if (typeof Audio_ !== 'undefined') Audio_.tone(420, 0.12, 'square', 0.06, 260); }
      const u = clamp((bt - 7.1) / 0.95, 0, 1);
      SC.ot.x = SC.leap[0] - 110 * u;
      SC.ot.y = SC.leap[1] - 250 * u + 520 * u * u;
      SC.ot.rot = -u * TAU * 1.1;
      SC.ot.exp = 'grin';
    }
    if (!SC.shot && bt >= 7.3) {
      const sy = VS.deck - F.door.F.leg - F.door.F.tor + 5;
      SC.shot = { x: F.door.x - 40, y: sy + 12, dx: -1, t0: Cine.t };
      Cine.shake = 7;
      if (typeof Audio_ !== 'undefined') { Audio_.shot('shotgun'); }
      FX.chunks(SC.leap ? SC.leap[0] : 352, VS.deck - 2, 12);
    }
  },
  render(ctx, bt) {
    streetBack(ctx);
    const F = SC.folk;
    drawWindowScene(ctx, SC.shut, SC.lean, F.wife.face);
    drawDoorScene(ctx, SC.door, SC.doorBack, SC.out);
    if (F.mender.sit) drawMenderSeat(ctx); else vCrate(ctx, 140, 274, 20, 14);
    drawBell(ctx, VS.bell[0], VS.bell[1], SC.bellA);
    drawLadSeat(ctx);
    drawFolk(ctx, F.lad, Cine.t);
    drawFolk(ctx, F.gutter, Cine.t);
    drawTable(ctx);
    if (SC.out) drawFolk(ctx, F.door, Cine.t);
    if (SC.splat) { P(ctx, '#d8e4d8', SC.splat.x - 3, VS.deck - 2, 7, 2); }
    if (SC.beard) { ctx.save(); ctx.translate(R(SC.beard.x), R(SC.beard.y)); ctx.rotate(SC.beard.r); ctx.drawImage(VIL.dis.beard.c, -VIL.dis.beard.ax, -VIL.dis.beard.ay); ctx.restore(); }
    // the disguise, or what is left of it on the boards
    if (!SC.real) drawDisguise(ctx, SC.dis, Cine.t);
    else {
      const e = clamp((bt - SC.coat.t) / 0.35, 0, 1), cx0 = SC.coat.x;
      // the stilts toppling one each way
      for (const s of [-1, 1]) {
        const a = s * ss(e) * 1.45;
        const ex = cx0 + s * 4 + Math.sin(a) * 30, ey = VS.deck - Math.cos(a) * 30;
        cap_(ctx, IP.ink, cx0 + s * 4, VS.deck - 1, ex, ey, 4); cap_(ctx, WOOD.l, cx0 + s * 4, VS.deck - 1, ex, ey, 2);
      }
      ctx.save(); ctx.translate(R(cx0), VS.deck); ctx.scale(1, lerp(1, 0.38, ss(e)));
      ctx.drawImage(VIL.dis.coat.c, -VIL.dis.coat.ax, -VIL.dis.coat.ay); ctx.restore();
      if (SC.ot.y < 380) drawCapOtter(ctx, SC.ot, Cine.t);
    }
    drawFolk(ctx, F.mender, Cine.t);
    if (SC.hat) { ctx.save(); ctx.translate(R(SC.hat.x), R(SC.hat.y)); ctx.rotate(SC.hat.r); ctx.drawImage(VIL.dis.hat.c, -VIL.dis.hat.ax, -VIL.dis.hat.ay); ctx.restore(); }
    if (SC.shot) drawShot(ctx, SC.shot, Cine.t);
    FX.render(ctx);
    clang(ctx, bt, 3.85);
  },
});

// ---------------------------------------------------------------- 4. TAKE
//  Back under the boards.  The whole port is on the pier now with whatever
//  it could grab, the bell going, and he comes down out of the sky onto her
//  back.  Two lines, and they go.
CINE.village.push({
  name: 'take', dur: 6.9,
  talk: [
    [1.05, 'otter', 'No answers.'],
    [2.55, 'you', 'Then we take them.'],
    [4.05, 'otter', 'NO QUARTER!'],
  ],
  anchor(who) {
    if (who === 'otter') return anc(SC.ot.x + 4, SC.ot.y - 44);
    return ancUnder(A.you);
  },
  enter() {
    villageArt();
    A.you = actor(MAN.youBig, 176, 274, { beat: 1.2, exp: 'angry', tailAmp: 0.24, scarred: true });
    SC.ot = { x: 200, y: 20, phase: 0, rot: -2, exp: 'angry', flip: false, ride: false, sq: 0, sqv: 0, sx: 1, sy: 1, blade: 1, bladeR: -0.8, armNear: -2.0 };
    SC.landed = false; SC.splashed = false; SC.go = false; SC.spd = 0; SC.bell = 1; SC.shots = [];
    SC.folk = {
      mender: folkO('mender', 300, VW.deck, { flip: true, face: 'shout', hold: 'gaff', armNear: 0.2, holdR: 0.2 }),
      door:   folkO('door', 376, VW.deck, { flip: true, face: 'scowl', hold: 'musket', armNear: 0.55, holdR: 0.05, armFar: 0.4 }),
      gutter: folkO('gutter', 440, VW.deck, { flip: true, face: 'shout', hold: 'cleaver', armNear: -1.0, holdR: 0.4 }),
      wife:   folkO('wife', 516, VW.deck, { flip: true, face: 'shout', hold: 'lantern', armNear: -0.3, holdR: 0.3 }),
      lad:    folkO('lad', 564, VW.deck, { flip: false, face: 'shout', armNear: -2.4, armFar: -2.2 }),
    };
  },
  update(dt, bt) {
    Cine.scroll += (4 + SC.spd * 0.4) * dt;
    swim(A.you, dt); bounce(A.you, dt); bounce(SC.ot, dt);
    const F = SC.folk;
    for (const k in F) bounce(F[k], dt);
    bellSound(dt);
    F.lad.armNear = -2.4 + Math.sin(bt * 15) * 0.35; F.lad.armFar = -2.2 + Math.sin(bt * 15 + 1) * 0.3;
    F.gutter.armNear = -1.0 + Math.sin(bt * 5) * 0.3;
    F.mender.armNear = 0.2 + Math.sin(bt * 3) * 0.15;
    // he comes down out of the sky, through the surface, onto her back
    if (!SC.landed) {
      const u = clamp(bt / 0.8, 0, 1);
      const deck = bodyPoint(A.you, 4, riderY(A.you));
      SC.ot.x = lerp(150, deck[0], u); SC.ot.y = lerp(10, deck[1], u * u);
      SC.ot.rot = lerp(-2.4, 0, ss(u));
      if (!SC.splashed && SC.ot.y > VW.surf) { SC.splashed = true; FX.drops(SC.ot.x, VW.surf, 50, 1.4); FX.foam(SC.ot.x, VW.surf + 2, 24, 1.2); FX.bubble(SC.ot.x, VW.surf + 20, 14, 1.8); if (typeof Audio_ !== 'undefined') Audio_.splash(2); }
      if (u >= 1) { SC.landed = true; kick(A.you, 8); kick(SC.ot, 10); Cine.shake = 5; if (typeof Audio_ !== 'undefined') Audio_.tone(160, 0.12, 'square', 0.08, -60); }
    } else rideOn(SC.ot, A.you, dt, 20);
    SC.ot.phase += dt * 3;
    SC.ot.exp = talking('otter') ? 'talk' : 'angry';
    if (SC.landed) {
      SC.ot.armNear = bt > 3.9 ? -2.3 + Math.sin(bt * 10) * 0.1 : 0.9 + Math.sin(SC.ot.phase) * 0.2;
      SC.ot.bladeR = bt > 3.9 ? -0.7 : -1.1;
      SC.ot.armFar = -0.9;
    }
    // the musket balls, plinking into the water round them
    if (bt > 1.6 && Math.random() < 1.1 * dt && SC.shots.length < 6) {
      SC.shots.push({ x: F.door.x - 30, y: folkTop(F.door) + 26, dx: -1, t0: Cine.t, tx: rand(90, 300), ty: rand(210, 300), k: 0 });
      Cine.shake = Math.max(Cine.shake, 2);
      if (typeof Audio_ !== 'undefined') Audio_.shot('revolver');
    }
    for (const s of SC.shots) {
      s.k += dt * 3;
      if (s.k >= 1 && !s.hit) { s.hit = true; FX.bubble(s.tx, s.ty, 6, 1.6); FX.foam(s.tx, VW.surf + 1, 6, 0.6); }
    }
    A.you.exp = talking('you') ? 'talk' : 'angry';
    // and they go, straight at the pier
    SC.go = bt > 4.55;
    SC.spd = smooth(SC.spd, SC.go ? 360 : 0, 2.2, dt);
    A.you.x = 176 + (SC.go ? ss(clamp((bt - 4.55) / 1.6, 0, 1)) * 190 : Math.sin(bt * 0.7) * 3);
    A.you.y = 274 + Math.sin(bt * 0.9) * 3 - (SC.go ? ss(clamp((bt - 4.55) / 1.6, 0, 1)) * 30 : 0);
    A.you.rot = smooth(A.you.rot, SC.go ? -0.18 : 0.0, 4, dt);
    A.you.beat = SC.go ? 9 : 1.4;
    if (SC.go && Math.random() < 30 * dt) FX.bubble(A.you.x - 46, A.you.y + rand(-6, 6), 1, 2.4);
    for (const k in F) if (F[k] !== F.lad) F[k].face = bt > 4.8 ? 'shout' : F[k].face;
    // out on the red, the way the intro goes out
    if (bt > 5.35) { Cine.fadeCol = '#8d1420'; Cine.fade = 0.84 * ss(clamp((bt - 5.35) / 1.3, 0, 1)); }
  },
  render(ctx, bt) {
    backdrop(ctx, { mood: 'cold', grade: 'cold', scroll: Cine.scroll, t: Cine.t, surfY: VW.surf, bedY: VW.bed, shafts: 0.8, causticBed: true });
    drawAir(ctx, VW.surf, Cine.scroll, Cine.t, 'day');
    ctx.drawImage(VIL.shore, 0, 0);
    const F = SC.folk;
    for (const k of ['mender', 'door', 'gutter', 'wife', 'lad']) drawFolk(ctx, F[k], Cine.t);
    drawBell(ctx, 572, 92, Math.sin(bt * TAU / 0.84) * 0.7);
    ctx.drawImage(VIL.under, 0, VW.surf);
    for (const s of SC.shots) {
      drawShot(ctx, s, Cine.t);
      if (s.k < 1) {
        const bx = lerp(s.x, s.tx, s.k), by = lerp(s.y, s.ty, s.k);
        P(ctx, '#ffe48f', R(bx) - 1, R(by) - 1, 2, 2); P(ctx, rgbaq('#ffe48f', 0.5), R(bx) + 2, R(by) - 2, 3, 1);
      }
    }
    drawManatee(ctx, A.you, Cine.t);
    drawCapOtter(ctx, SC.ot, Cine.t);
    if (SC.go) {
      const a = clamp(SC.spd / 360, 0, 1), w1 = (Cine.t * 340) % 74;
      speedLines(ctx, A.you.x - 90 - w1, A.you.y, R(6 + a * 10), R(30 + a * 40), -1, rgbaq('#f2fdff', 0.2 + a * 0.3), 7);
    }
    FX.render(ctx);
    foreground(ctx, { grade: 'cold', scroll: Cine.scroll, t: Cine.t, bedY: VW.bed });
    const sh = bt > 0.4 && bt < 3.6;
    if (sh) pixelTextOutlined(ctx, 'THERE! IN THE WATER!', 420, 40, 9, '#ffe48f', '#14141c', 'center');
    if (bt > 4.4) pixelTextOutlined(ctx, 'SHOOT IT!', 360, 48, 9, '#ffe48f', '#14141c', 'center');
    if (bt > 0.2) {
      const e = bt, n = Math.floor(e / 0.42), f = (e % 0.42) / 0.42;
      if (f < 0.7) pixelTextOutlined(ctx, 'CLANG!', 572 + ((n & 1) ? 10 : -10) - R(f * 6), 70 - R(f * 8), 9, '#ffe48f', '#14141c', 'center');
    }
  },
});

// ================================================================ PLAYER ====
const Cine = {
  t: 0, bt: 0, dt: 1 / 60, beat: 0, done: true, active: false,
  scroll: 0, shake: 0, fade: 0, fadeCol: '#fff3d6',
  list: [], segs: [], opts: {}, id: null,
  get bakeMs() { return CINE_BAKE_MS; },
  get ready() { return VIL.ready; },
  // one slice of scene art per call, for idle frames before a scene is asked for
  prewarm() { if (!BUILT) return false; return cineBakeStep(); },
  play(ids, opts) {
    buildIntroArt();
    this.opts = opts || {};
    this.list = []; this.segs = [];
    if (BUILT) {
      for (const id of [].concat(ids || [])) {
        const bl = CINE[id]; if (!bl || !bl.length) continue;
        this.segs.push({ id: id, start: this.list.length, n: bl.length });
        for (const b of bl) this.list.push({ b: b, seg: this.segs.length - 1 });
      }
    }
    this.t = 0; this.bt = 0; this.beat = -1; this.scroll = 0; this.shake = 0; this.fade = 0;
    this.fadeCol = '#fff3d6'; sndT = 0; sndT2 = 0;
    if (!this.list.length) { this.done = true; this.active = false; return false; }
    // whatever these scenes need, baked before the first frame of them
    villageArt();
    this.done = false; this.active = true;
    this.next();
    return !this.done;
  },
  _end(segIdx, skipped) {
    const s = this.segs[segIdx];
    if (!s || s.ended) return;
    s.ended = true;
    if (this.opts.onScene) { try { this.opts.onScene(s.id, !!skipped); } catch (e) { /* the caller's problem */ } }
  },
  next() {
    const prev = this.list[this.beat];
    this.beat++; this.bt = 0; this.fade = 0; this.shake = 0;
    this.fadeCol = '#fff3d6';
    const cur = this.list[this.beat];
    if (prev && (!cur || cur.seg !== prev.seg)) this._end(prev.seg, false);
    FX.clear(); sayReset();
    for (const k in SC) delete SC[k];
    for (const k in A) delete A[k];
    if (!cur) { this.done = true; this.active = false; return; }
    if (!prev || cur.seg !== prev.seg) this.scroll = 0;
    this.id = this.segs[cur.seg].id;
    if (cur.b.enter) cur.b.enter.call(cur.b);
  },
  // end the scene that is playing and cut to the next one in the queue
  skip() {
    const cur = this.list[this.beat];
    if (!cur || this.done) { this.done = true; this.active = false; return; }
    this._end(cur.seg, true);
    const nx = this.segs[cur.seg + 1];
    if (!nx) { FX.clear(); sayReset(); this.done = true; this.active = false; return; }
    // step onto the first beat of the next scene; next() will not end the
    // skipped one a second time, it is already marked
    this.beat = nx.start - 1;
    this.next();
  },
  // is the beat on screen the first / last of the whole queue?
  _edge() {
    return { first: this.beat === 0, last: this.beat === this.list.length - 1 };
  },
  update(dt) {
    if (this.done) return;
    if (!(dt > 0)) dt = 0;
    if (dt > 1 / 20) dt = 1 / 20;
    this.dt = dt; this.t += dt; this.bt += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    const cur = this.list[this.beat];
    if (!cur) { this.done = true; this.active = false; return; }
    const b = cur.b;
    sayUpdate(b, this.bt, dt);
    b.update.call(b, dt, this.bt);
    FX.update(dt);
    if (this.bt >= b.dur) this.next();
  },
  render(ctx) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const cur = !this.done && this.list[this.beat];
    if (!cur) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 640, 360); ctx.restore(); return; }
    const b = cur.b;
    ctx.save();
    if (this.shake > 0.2) ctx.translate(R(rand(-this.shake, this.shake)), R(rand(-this.shake, this.shake)));
    b.render.call(b, ctx, this.bt);
    ctx.restore();
    // the intro's daylight dissolve between beats -- but not in at the very
    // top (the bubble wipe is covering it) and not out at the very end (the
    // wipe out of here snapshots this frame, and should see the scene)
    const E = this._edge();
    const inK = E.first ? 1 : clamp(this.bt / 0.18, 0, 1);
    const outK = E.last ? 1 : clamp((b.dur - this.bt) / 0.18, 0, 1);
    const wash = Math.max(this.fade, 1 - ss(Math.min(inK, outK)));
    if (wash > 0) { ctx.fillStyle = rgbaq(this.fadeCol, wash); ctx.fillRect(0, 0, 640, 360); }
    letterbox(ctx);
    sayRender(ctx, b, this.bt);
    ctx.restore();
  },
};

try { if (typeof document !== 'undefined' && document.createElement) buildIntroArt(); } catch (e) { /* built lazily on reset */ }

global.Intro = Intro;
global.IntroBeats = BEATS;
global.Cine = Cine;
global.CineScenes = CINE;
global.__introDebug = {
  MAN: MAN, A: A, SC: SC, SAY: SAY, FX: FX,
  drawManatee: drawManatee, drawCapOtter: drawCapOtter, drawJolly: drawJolly,
  get BOAT() { return BOAT; }, get HARP() { return HARP; }, get bakeMs() { return BAKE_MS; },
};
})(typeof window !== 'undefined' ? window : this);
