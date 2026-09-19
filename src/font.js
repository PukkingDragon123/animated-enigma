// ---- font.js : hand-made bitmap pixel font + ornate pixel-art UI kit ------
// Loaded right after util.js. It overrides util.js's pixelText/wrapText with
// real hand-drawn bitmap glyphs (no browser font anywhere) and adds a 9-slice
// style UI kit (golden frames, parchment panels, slots, buttons, bars...).
//
// Everything in here is pure pixel art: integer coordinates, hard-edged
// posterised colours, chunky near-black outlines, no gradients / shadows /
// blur / external images. Safe to load standalone (it only needs util.js).
(function (global) {
  'use strict';

  // =========================================================== tiny helpers
  function newCan(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    return c;
  }
  function toRgb(h) {
    if (h[0] !== '#') h = '#' + h;
    if (h.length === 4) return [parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), parseInt(h[3] + h[3], 16)];
    const n = parseInt(h.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const cl255 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  function toHex(r, g, b) { return '#' + ((1 << 24) | (cl255(r) << 16) | (cl255(g) << 8) | cl255(b)).toString(16).slice(1); }
  function mixC(a, b, t) { const A = toRgb(a), B = toRgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  const lightC = (c, t) => mixC(c, '#ffffff', t);
  const darkC = (c, t) => mixC(c, '#000000', t);

  // ======================================================== the font itself
  // Glyphs are string-row bitmaps, '#' = ink, '.' = transparent.
  // Row 0 is the TOP of the cell, so a glyph's rows line up with the cell:
  //   body face  : cap rows 0-4 (cap height 5), baseline under row 4,
  //                x-height rows 1-4, descender rows 5-6  -> 5x7 cell
  //   display    : cap rows 0-6 (cap height 7), baseline under row 6,
  //                x-height rows 2-6, descender rows 7-8  -> 7x9 cell
  // The advance width of a glyph is its right-most lit column + 1, so the
  // face is proportional: 'i'/'l' are narrow, 'm'/'w' wide.

  // ---------------------------------------------------- 5x7 "body" face ---
  const G_BODY = {
    ' ': [],
    'A': ['.###.', '#...#', '#####', '#...#', '#...#'],
    'B': ['####.', '#...#', '####.', '#...#', '####.'],
    'C': ['.####', '#....', '#....', '#....', '.####'],
    'D': ['####.', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '####.', '#....', '#####'],
    'F': ['#####', '#....', '####.', '#....', '#....'],
    'G': ['.####', '#....', '#..##', '#...#', '.###.'],
    'H': ['#...#', '#...#', '#####', '#...#', '#...#'],
    'I': ['###', '.#.', '.#.', '.#.', '###'],
    'J': ['..##', '...#', '...#', '#..#', '.##.'],
    'K': ['#...#', '#..#.', '###..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
    'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '####.', '#....', '#....'],
    'Q': ['.###.', '#...#', '#...#', '#..#.', '.##.#'],
    'R': ['####.', '#...#', '####.', '#..#.', '#...#'],
    'S': ['.####', '#....', '.###.', '....#', '####.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '.###.'],
    'V': ['#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
    'X': ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    'Y': ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
    'Z': ['#####', '...#.', '..#..', '.#...', '#####'],

    'a': ['....', '.###', '#..#', '#..#', '.###'],
    'b': ['#...', '###.', '#..#', '#..#', '###.'],
    'c': ['....', '.###', '#...', '#...', '.###'],
    'd': ['...#', '.###', '#..#', '#..#', '.###'],
    'e': ['....', '.##.', '####', '#...', '.###'],
    'f': ['.##', '#..', '###', '#..', '#..'],
    'g': ['....', '.###', '#..#', '#..#', '.###', '...#', '###.'],
    'h': ['#...', '#...', '###.', '#..#', '#..#'],
    'i': ['#', '.', '#', '#', '#'],
    'j': ['.#', '..', '.#', '.#', '.#', '.#', '##'],
    'k': ['#...', '#.#.', '##..', '#.#.', '#..#'],
    'l': ['#.', '#.', '#.', '#.', '##'],
    'm': ['.....', '#####', '#.#.#', '#.#.#', '#.#.#'],
    'n': ['....', '###.', '#..#', '#..#', '#..#'],
    'o': ['....', '.##.', '#..#', '#..#', '.##.'],
    'p': ['....', '###.', '#..#', '#..#', '###.', '#...', '#...'],
    'q': ['....', '.###', '#..#', '#..#', '.###', '...#', '...#'],
    'r': ['...', '###', '#..', '#..', '#..'],
    's': ['....', '.###', '##..', '..##', '###.'],
    't': ['#..', '###', '#..', '#..', '.##'],
    'u': ['....', '#..#', '#..#', '#..#', '.###'],
    'v': ['...', '#.#', '#.#', '#.#', '.#.'],
    'w': ['.....', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    'x': ['...', '#.#', '.#.', '.#.', '#.#'],
    'y': ['....', '#..#', '#..#', '#..#', '.###', '...#', '###.'],
    'z': ['....', '####', '..#.', '.#..', '####'],

    '0': ['.###.', '#..##', '#.#.#', '##..#', '.###.'],
    '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['.###.', '#...#', '..##.', '.#...', '#####'],
    '3': ['####.', '....#', '.###.', '....#', '####.'],
    '4': ['#..#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '####.'],
    '6': ['.###.', '#....', '####.', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '..#..'],
    '8': ['.###.', '#...#', '.###.', '#...#', '.###.'],
    '9': ['.###.', '#...#', '.####', '....#', '.###.'],

    '.': ['.', '.', '.', '.', '#'],
    ',': ['..', '..', '..', '..', '.#', '#.'],
    ':': ['.', '.', '#', '.', '#'],
    ';': ['..', '..', '.#', '..', '.#', '#.'],
    '!': ['#', '#', '#', '.', '#'],
    '?': ['.##.', '#..#', '..#.', '....', '..#.'],
    "'": ['#', '#'],
    '"': ['#.#', '#.#'],
    '-': ['...', '...', '###'],
    '+': ['...', '.#.', '###', '.#.'],
    '/': ['..#', '..#', '.#.', '#..', '#..'],
    '\\': ['#..', '#..', '.#.', '..#', '..#'],
    '(': ['.#', '#.', '#.', '#.', '.#'],
    ')': ['#.', '.#', '.#', '.#', '#.'],
    '[': ['##', '#.', '#.', '#.', '##'],
    ']': ['##', '.#', '.#', '.#', '##'],
    '<': ['..#', '.#.', '#..', '.#.', '..#'],
    '>': ['#..', '.#.', '..#', '.#.', '#..'],
    '=': ['...', '###', '...', '###'],
    '%': ['##..#', '##.#.', '..#..', '.#.##', '#..##'],
    '*': ['...', '#.#', '.#.', '#.#'],
    '#': ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'],
    '&': ['.##..', '#..#.', '.##..', '#..#.', '.##.#'],
    '_': ['....', '....', '....', '....', '....', '####'],
    '|': ['#', '#', '#', '#', '#'],
    '@': ['.###.', '#...#', '#.###', '#....', '.###.'],
    '$': ['..#..', '.####', '.##..', '..##.', '####.', '..#..'],
  };

  // ------------------------------------------- 7x9 "display" / title face ---
  // Heavier stroke (2px stems) so headings and banners read as carved metal.
  const G_DISP = {
    ' ': [],
    'A': ['.####.', '##..##', '##..##', '######', '######', '##..##', '##..##'],
    'B': ['#####.', '##..##', '##..##', '#####.', '##..##', '##..##', '#####.'],
    'C': ['.####.', '##..##', '##....', '##....', '##....', '##..##', '.####.'],
    'D': ['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.'],
    'E': ['######', '##....', '##....', '#####.', '##....', '##....', '######'],
    'F': ['######', '##....', '##....', '#####.', '##....', '##....', '##....'],
    'G': ['.####.', '##..##', '##....', '##.###', '##..##', '##..##', '.####.'],
    'H': ['##..##', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
    'I': ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
    'J': ['..###', '...##', '...##', '...##', '...##', '##.##', '.###.'],
    'K': ['##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##'],
    'L': ['##....', '##....', '##....', '##....', '##....', '##....', '######'],
    'M': ['##...##', '###.###', '#######', '##.#.##', '##...##', '##...##', '##...##'],
    'N': ['##...##', '###..##', '####.##', '#######', '##.####', '##..###', '##...##'],
    'O': ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
    'P': ['#####.', '##..##', '##..##', '#####.', '##....', '##....', '##....'],
    'Q': ['.####.', '##..##', '##..##', '##..##', '##.###', '##.##.', '.####.', '....##'],
    'R': ['#####.', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##'],
    'S': ['.#####', '##....', '##....', '.####.', '....##', '....##', '#####.'],
    'T': ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
    'U': ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
    'V': ['##..##', '##..##', '##..##', '##..##', '##..##', '.####.', '..##..'],
    'W': ['##...##', '##...##', '##...##', '##.#.##', '#######', '###.###', '##...##'],
    'X': ['##..##', '##..##', '.####.', '..##..', '.####.', '##..##', '##..##'],
    'Y': ['##..##', '##..##', '.####.', '..##..', '..##..', '..##..', '..##..'],
    'Z': ['######', '....##', '...##.', '..##..', '.##...', '##....', '######'],

    'a': ['......', '......', '.####.', '....##', '.#####', '##..##', '.#####'],
    'b': ['##....', '##....', '#####.', '##..##', '##..##', '##..##', '#####.'],
    'c': ['......', '......', '.####.', '##..##', '##....', '##..##', '.####.'],
    'd': ['....##', '....##', '.#####', '##..##', '##..##', '##..##', '.#####'],
    'e': ['......', '......', '.####.', '##..##', '######', '##....', '.####.'],
    'f': ['..###', '.##..', '#####', '.##..', '.##..', '.##..', '.##..'],
    'g': ['......', '......', '.#####', '##..##', '##..##', '##..##', '.#####', '....##', '#####.'],
    'h': ['##....', '##....', '#####.', '##..##', '##..##', '##..##', '##..##'],
    'i': ['##', '..', '##', '##', '##', '##', '##'],
    'j': ['..##', '....', '..##', '..##', '..##', '..##', '..##', '..##', '###.'],
    'k': ['##....', '##....', '##..##', '##.##.', '####..', '##.##.', '##..##'],
    'l': ['##.', '##.', '##.', '##.', '##.', '##.', '###'],
    'm': ['........', '........', '########', '##.##.##', '##.##.##', '##.##.##', '##.##.##'],
    'n': ['......', '......', '#####.', '##..##', '##..##', '##..##', '##..##'],
    'o': ['......', '......', '.####.', '##..##', '##..##', '##..##', '.####.'],
    'p': ['......', '......', '#####.', '##..##', '##..##', '##..##', '#####.', '##....', '##....'],
    'q': ['......', '......', '.#####', '##..##', '##..##', '##..##', '.#####', '....##', '....##'],
    'r': ['.....', '.....', '#####', '##...', '##...', '##...', '##...'],
    's': ['......', '......', '.#####', '##....', '.####.', '....##', '#####.'],
    't': ['.##..', '.##..', '#####', '.##..', '.##..', '.##..', '..###'],
    'u': ['......', '......', '##..##', '##..##', '##..##', '##..##', '.#####'],
    'v': ['......', '......', '##..##', '##..##', '##..##', '.####.', '..##..'],
    'w': ['........', '........', '##....##', '##....##', '##.##.##', '########', '.##..##.'],
    'x': ['......', '......', '##..##', '.####.', '..##..', '.####.', '##..##'],
    'y': ['......', '......', '##..##', '##..##', '##..##', '.#####', '....##', '....##', '#####.'],
    'z': ['......', '......', '######', '...##.', '..##..', '.##...', '######'],

    '0': ['.####.', '##..##', '##.###', '###.##', '##..##', '##..##', '.####.'],
    '1': ['..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '#####'],
    '2': ['.####.', '##..##', '....##', '..###.', '.##...', '##....', '######'],
    '3': ['#####.', '....##', '....##', '.####.', '....##', '....##', '#####.'],
    '4': ['...##.', '..###.', '.####.', '##.##.', '######', '...##.', '...##.'],
    '5': ['######', '##....', '#####.', '....##', '....##', '##..##', '.####.'],
    '6': ['.####.', '##..##', '##....', '#####.', '##..##', '##..##', '.####.'],
    '7': ['######', '....##', '...##.', '..##..', '..##..', '..##..', '..##..'],
    '8': ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '.####.'],
    '9': ['.####.', '##..##', '##..##', '.#####', '....##', '##..##', '.####.'],

    '.': ['..', '..', '..', '..', '..', '##', '##'],
    ',': ['...', '...', '...', '...', '...', '.##', '.##', '##.'],
    ':': ['..', '..', '##', '##', '..', '##', '##'],
    ';': ['...', '...', '.##', '.##', '...', '.##', '.##', '##.'],
    '!': ['##', '##', '##', '##', '##', '..', '##'],
    '?': ['.####.', '##..##', '....##', '..###.', '..##..', '......', '..##..'],
    "'": ['##', '##'],
    '"': ['##.##', '##.##'],
    '-': ['.....', '.....', '.....', '#####', '#####'],
    '+': ['......', '......', '..##..', '######', '######', '..##..'],
    '/': ['....##', '....##', '...##.', '..##..', '.##...', '##....', '##....'],
    '\\': ['##....', '##....', '.##...', '..##..', '...##.', '....##', '....##'],
    '(': ['..##', '.##.', '##..', '##..', '##..', '.##.', '..##'],
    ')': ['##..', '.##.', '..##', '..##', '..##', '.##.', '##..'],
    '[': ['####', '##..', '##..', '##..', '##..', '##..', '####'],
    ']': ['####', '..##', '..##', '..##', '..##', '..##', '####'],
    '<': ['...##', '..##.', '.##..', '##...', '.##..', '..##.', '...##'],
    '>': ['##...', '.##..', '..##.', '...##', '..##.', '.##..', '##...'],
    '=': ['......', '......', '######', '######', '......', '######', '######'],
    '%': ['##...##', '##..##.', '...##..', '..##...', '.##....', '##...##', '.....##'],
    '*': ['.....', '##.##', '.###.', '##.##'],
    '#': ['.......', '.##.##.', '#######', '.##.##.', '#######', '.##.##.'],
    '&': ['.###...', '##.##..', '.###...', '###.##.', '##.###.', '##..##.', '.###.##'],
    '_': ['......', '......', '......', '......', '......', '......', '......', '######', '######'],
    '|': ['##', '##', '##', '##', '##', '##', '##'],
    '@': ['.#####.', '##...##', '##.####', '##.#.##', '##.####', '##.....', '.#####.'],
    '$': ['..##..', '.#####', '##....', '.####.', '....##', '#####.', '..##..'],
  };

  const FACES = {
    body: { name: 'body', rows: G_BODY, cellH: 7, capH: 5, xH: 4, space: 2, track: 1 },
    display: { name: 'display', rows: G_DISP, cellH: 9, capH: 7, xH: 5, space: 3, track: 1 },
  };

  // compile the string bitmaps into {px:[x,y,...], adv} once
  function compile(face) {
    if (face.glyphs) return face;
    const g = Object.create(null);
    for (const ch in face.rows) {
      const rows = face.rows[ch];
      const px = []; let adv = 0;
      for (let y = 0; y < rows.length; y++) {
        const r = rows[y];
        for (let x = 0; x < r.length; x++) {
          if (r.charCodeAt(x) === 35) { px.push(x, y); if (x + 1 > adv) adv = x + 1; }
        }
      }
      g[ch] = { px, adv: ch === ' ' ? face.space : Math.max(1, adv) };
    }
    // fallback box for anything we have no glyph for
    const n = face.capH, w = Math.max(3, n - 1), box = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < w; x++) {
      if (y === 0 || y === n - 1 || x === 0 || x === w - 1) box.push(x, y);
    }
    g['\u0000'] = { px: box, adv: w };
    face.glyphs = g;
    return face;
  }
  function glyphOf(face, ch) {
    const g = face.glyphs[ch];
    if (g) return g;
    if (ch === '\t') return face.glyphs[' '];
    const up = ch.toUpperCase();
    return face.glyphs[up] || face.glyphs['\u0000'];
  }

  // ---------------------------------------------------- face / size picker
  // `size` is a requested pixel height. We pick the face + INTEGER scale whose
  // cap height lands closest to it (fractional scaling is what makes pixel
  // fonts mushy, so it never happens).
  const SIZE_CACHE = new Map();
  function faceFor(size) {
    const key = size;
    let f = SIZE_CACHE.get(key);
    if (f) return f;
    const target = Math.max(3, size * 0.72); // browser cap-height ~= 0.72em
    let best = null;
    for (const name in FACES) {
      const face = FACES[name];
      const around = Math.max(1, Math.round(target / face.capH));
      for (let s = Math.max(1, around - 1); s <= around + 1; s++) {
        let err = Math.abs(face.capH * s - target);
        if (name === 'display') err *= 0.92;       // tiny bias: heavier face wins ties
        if (!best || err < best.err) best = { err, face: compile(face), scale: s };
      }
    }
    f = { face: best.face, scale: best.scale };
    SIZE_CACHE.set(key, f);
    return f;
  }

  // ------------------------------------------------------- glyph cache -----
  // One little canvas per (char, face, scale, colour[, outline]). The HUD
  // draws a lot of text every frame; nothing is ever re-rasterised.
  const GCACHE = new Map();          // "face|scale|colour|outline" -> Map(char -> canvas)
  const GCACHE_MAX = 192;
  function glyphSet(face, scale, color, outline) {
    const key = face.name + '|' + scale + '|' + color + '|' + (outline || '-');
    let m = GCACHE.get(key);
    if (!m) { if (GCACHE.size > GCACHE_MAX) GCACHE.clear(); m = new Map(); GCACHE.set(key, m); }
    return m;
  }
  function glyphCanvas(set, face, ch, scale, color, outline) {
    let e = set.get(ch);
    if (e !== undefined) return e;
    const g = glyphOf(face, ch);
    if (!g.px.length) { e = null; set.set(ch, e); return e; }
    const pad = outline ? 1 : 0;
    const w = g.adv + pad * 2, h = face.cellH + pad * 2;
    const c = newCan(w * scale, h * scale), x = c.getContext('2d');
    if (outline) {
      // 8-way 1px dilation of the glyph mask -> stays readable over bright water
      const lit = new Set();
      for (let i = 0; i < g.px.length; i += 2) lit.add(g.px[i] + ',' + g.px[i + 1]);
      x.fillStyle = outline;
      for (let i = 0; i < g.px.length; i += 2) {
        const gx = g.px[i], gy = g.px[i + 1];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = gx + dx, ny = gy + dy;
          if (lit.has(nx + ',' + ny)) continue;
          x.fillRect((nx + pad) * scale, (ny + pad) * scale, scale, scale);
        }
      }
    }
    x.fillStyle = color;
    for (let i = 0; i < g.px.length; i += 2) x.fillRect((g.px[i] + pad) * scale, (g.px[i + 1] + pad) * scale, scale, scale);
    e = { c: c, pad: pad * scale, adv: g.adv * scale };
    set.set(ch, e);
    return e;
  }

  // ------------------------------------------------------------ measuring --
  function lineWidth(face, scale, text, track) {
    let w = 0;
    for (let i = 0; i < text.length; i++) w += glyphOf(face, text[i]).adv * scale + track;
    return Math.max(0, w - track);
  }

  // ------------------------------------------------------------ rendering --
  function drawLine(ctx, text, x, y, face, scale, color, align, shadow, outline, track) {
    const w = lineWidth(face, scale, text, track);
    let px = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? Math.round(x - w) : Math.round(x);
    const py = Math.round(y);
    if (shadow && !outline) {                       // 1px (one font-pixel) drop shadow
      const sset = glyphSet(face, scale, shadow, null);
      let sx = px;
      for (let i = 0; i < text.length; i++) {
        const gc = glyphCanvas(sset, face, text[i], scale, shadow, null);
        if (gc) { ctx.drawImage(gc.c, sx + scale, py + scale); sx += gc.adv + track; }
        else sx += glyphOf(face, text[i]).adv * scale + track;
      }
    }
    const set = glyphSet(face, scale, color, outline);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], gc = glyphCanvas(set, face, ch, scale, color, outline);
      if (gc) { ctx.drawImage(gc.c, px - gc.pad, py - gc.pad); px += gc.adv + track; }
      else px += glyphOf(face, ch).adv * scale + track;
    }
    return w;
  }

  // Full-control entry point. opts: {face, scale, color, align, shadow,
  // outline, tracking, lineGap}
  function drawText(ctx, text, x, y, size, opts) {
    opts = opts || {};
    let face, scale;
    if (opts.face && FACES[opts.face]) { face = compile(FACES[opts.face]); scale = Math.max(1, opts.scale | 0 || 1); }
    else { const f = faceFor(size); face = f.face; scale = opts.scale ? Math.max(1, opts.scale | 0) : f.scale; }
    const track = (opts.tracking === undefined ? face.track : opts.tracking) * scale;
    const color = opts.color || '#fff';
    const shadow = opts.shadow === true ? '#000' : (opts.shadow || null);
    const outline = opts.outline || null;
    const lh = (face.cellH + (opts.lineGap === undefined ? 1 : opts.lineGap)) * scale;
    const str = String(text);
    if (str.indexOf('\n') < 0) return drawLine(ctx, str, x, y, face, scale, color, opts.align || 'left', shadow, outline, track);
    const lines = str.split('\n');
    let w = 0;
    for (let i = 0; i < lines.length; i++) w = Math.max(w, drawLine(ctx, lines[i], x, y + i * lh, face, scale, color, opts.align || 'left', shadow, outline, track));
    return w;
  }

  // ============================================================ public API =
  // Drop-in replacements for util.js (same signatures, same call sites).
  function pixelText(ctx, text, x, y, size, color, align = 'left', shadow = true) {
    return drawText(ctx, text, x, y, size, { color: color, align: align, shadow: shadow ? '#000' : null });
  }
  function pixelTextOutlined(ctx, text, x, y, size, color, outlineColor, align = 'left') {
    return drawText(ctx, text, x, y, size, { color: color, align: align, outline: outlineColor || '#14141c' });
  }
  function textWidth(text, size) {
    const f = faceFor(size), face = f.face, track = face.track * f.scale, str = String(text);
    if (str.indexOf('\n') < 0) return lineWidth(face, f.scale, str, track);
    let w = 0; for (const l of str.split('\n')) w = Math.max(w, lineWidth(face, f.scale, l, track));
    return w;
  }
  function textHeight(size) { const f = faceFor(size); return f.face.cellH * f.scale; }
  function lineHeight(size) { const f = faceFor(size); return (f.face.cellH + 1) * f.scale; }
  // ctx is unused (kept so existing call sites keep working)
  function wrapText(ctx, text, maxWidth, size) {
    const f = faceFor(size), face = f.face, track = face.track * f.scale;
    const out = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(' ');
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (cur && lineWidth(face, f.scale, test, track) > maxWidth) { out.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) out.push(cur);
    }
    return out;
  }

  // ========================================================================
  //  UIKit - ornate medieval / nautical pixel-art widgets
  // ========================================================================
  // Colour ramps: [ink, darkest .. lightest]
  const RAMPS = {
    gold: { ink: '#14100a', d: '#5a3c12', m: '#9a6c1e', h: '#e0b34e', l: '#ffeeb4' },
    wood: { ink: '#150c05', d: '#3d2411', m: '#6b4522', h: '#a97240', l: '#d9a25a' },
    stone: { ink: '#0d0f14', d: '#2e323b', m: '#4f5560', h: '#848b97', l: '#c3c9d3' },
    steel: { ink: '#070a10', d: '#1b2333', m: '#38455e', h: '#6d80a6', l: '#c0cfe8' },
    bone: { ink: '#2a2113', d: '#6b5836', m: '#a08a52', h: '#ddc999', l: '#fbf3d8' },
  };

  const B = 5;   // border thickness (outline + 3px bevel + inner outline)
  const C = 16;  // ornate corner size (bevel + filigree)

  // Corner filigree, drawn just inside the border: a scrolling gusset that
  // steps away from the corner and a little floating jewel.  l/h/m/d = ramp
  // steps (lightest -> darkest), k = near-black outline, . = transparent.
  const FILIGREE = [
    'llhhmdk....',
    'lhhmdk.....',
    'hhmdk......',
    'hmdk.......',
    'mdk........',
    'dk....k....',
    'k....khk...',
    '....khlhk..',
    '.....khk...',
    '......k....',
    '...........',
  ];

  // -------------------------------------------------------- texture tiles --
  function tileDeepBlue() {                       // gold panel interior: dark leather
    const c = newCan(16, 16), x = c.getContext('2d');
    x.fillStyle = '#161d30'; x.fillRect(0, 0, 16, 16);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const n = hash2(i * 7, j * 13);
      if ((i + j) % 8 === 0) { x.fillStyle = '#1d2740'; x.fillRect(i, j, 1, 1); }
      else if (n > 0.93) { x.fillStyle = '#212c48'; x.fillRect(i, j, 1, 1); }
      else if (n < 0.05) { x.fillStyle = '#111726'; x.fillRect(i, j, 1, 1); }
    }
    return c;
  }
  function tileParch() {                          // parchment / old paper
    const c = newCan(16, 16), x = c.getContext('2d');
    x.fillStyle = '#e9d9a8'; x.fillRect(0, 0, 16, 16);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const n = hash2(i * 17 + 3, j * 11 + 5);
      if (n > 0.90) { x.fillStyle = '#f4e9c4'; x.fillRect(i, j, 1, 1); }
      else if (n < 0.10) { x.fillStyle = '#d8c48d'; x.fillRect(i, j, 1, 1); }
      else if (n > 0.55 && n < 0.57) { x.fillStyle = '#cbb680'; x.fillRect(i, j, 1, 1); }
    }
    return c;
  }
  function tilePlank() {                          // deck planks
    const c = newCan(16, 16), x = c.getContext('2d');
    x.fillStyle = '#8a5a2c'; x.fillRect(0, 0, 16, 16);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const n = hash2(i * 3 + 11, j * 29);
      if (n > 0.86) { x.fillStyle = '#a97240'; x.fillRect(i, j, 1, 1); }
      else if (n < 0.14) { x.fillStyle = '#6b4522'; x.fillRect(i, j, 1, 1); }
    }
    x.fillStyle = '#4a2e16'; x.fillRect(0, 7, 16, 1); x.fillRect(0, 15, 16, 1);
    x.fillStyle = '#a97240'; x.fillRect(0, 8, 16, 1); x.fillRect(0, 0, 16, 1);
    x.fillStyle = '#4a2e16'; x.fillRect(4, 0, 1, 8); x.fillRect(11, 8, 1, 8);
    return c;
  }
  function tileDark() {                           // dark slate
    const c = newCan(16, 16), x = c.getContext('2d');
    x.fillStyle = '#0e131f'; x.fillRect(0, 0, 16, 16);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const n = hash2(i * 5 + 1, j * 23 + 7);
      if (n > 0.95) { x.fillStyle = '#182034'; x.fillRect(i, j, 1, 1); }
    }
    x.fillStyle = '#141b2c'; x.fillRect(0, 0, 16, 1); x.fillRect(0, 0, 1, 16);
    return c;
  }
  function tileStone() {                          // mottled granite
    const c = newCan(16, 16), x = c.getContext('2d');
    x.fillStyle = '#4f5560'; x.fillRect(0, 0, 16, 16);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const n = hash2(i * 13 + 2, j * 7 + 19);
      if (n > 0.82) { x.fillStyle = '#5f6672'; x.fillRect(i, j, 1, 1); }
      else if (n < 0.18) { x.fillStyle = '#3e434d'; x.fillRect(i, j, 1, 1); }
    }
    x.fillStyle = '#373c45'; x.fillRect(0, 5, 9, 1); x.fillRect(9, 12, 7, 1); x.fillRect(9, 5, 1, 7);
    x.fillStyle = '#5a616d'; x.fillRect(0, 6, 9, 1); x.fillRect(9, 13, 7, 1);
    return c;
  }

  // posterised colour ramp for bars, built once per colour pair
  const RAMP_CACHE = new Map();
  function barRamp(a, b, steps) {
    const key = a + '|' + b + '|' + steps;
    let r = RAMP_CACHE.get(key);
    if (r) return r;
    r = [];
    for (let i = 0; i < steps; i++) { const c = mixC(a, b, steps === 1 ? 1 : i / (steps - 1)); r.push([c, lightC(c, 0.35), darkC(c, 0.4)]); }
    if (RAMP_CACHE.size > 256) RAMP_CACHE.clear();
    RAMP_CACHE.set(key, r);
    return r;
  }
  // 4x4 diagonal hatch used by locked slots (one pattern fill, not 150 rects)
  let HATCH = null, HATCH_PAT = null, HATCH_CTX = null;
  function hatchPattern(ctx) {
    if (!HATCH) {
      HATCH = newCan(4, 4); const h = HATCH.getContext('2d');
      h.fillStyle = '#1a1e28'; for (let i = 0; i < 4; i++) h.fillRect(i, i, 1, 1);
    }
    if (!HATCH_PAT || HATCH_CTX !== ctx) { HATCH_PAT = ctx.createPattern(HATCH, 'repeat'); HATCH_CTX = ctx; }
    return HATCH_PAT;
  }

  const STYLES = {
    gold: { ramp: 'gold', tile: tileDeepBlue, glow: '#ffeeb4' },
    wood: { ramp: 'wood', tile: tilePlank, glow: '#d9a25a' },
    parchment: { ramp: 'gold', tile: tileParch, glow: '#fff3c4' },
    dark: { ramp: 'steel', tile: tileDark, glow: '#b6c6e4' },
    stone: { ramp: 'stone', tile: tileStone, glow: '#c3c9d3' },
  };
  const styleOf = s => STYLES[s] || STYLES.gold;

  // ------------------------------------------- pre-rendered 9-slice pieces --
  // Built once per style and blitted; drawing a panel is a handful of
  // drawImage calls whatever its size.
  const PARTS = new Map();
  function parts(styleName) {
    let p = PARTS.get(styleName);
    if (p) return p;
    const st = styleOf(styleName), r = RAMPS[st.ramp];
    // cross-section of each edge, outside -> inside
    const lit = [r.ink, r.l, r.h, r.m, r.ink];   // top / left  (light source: top-left)
    const shd = [r.ink, r.m, r.d, r.d, r.ink];   // bottom / right
    const TW = 16;                                // edge tile repeat length

    function edgeH(cols, flipV) {                 // horizontal edge tile, TW x B
      const c = newCan(TW, B), x = c.getContext('2d');
      for (let i = 0; i < B; i++) { x.fillStyle = cols[flipV ? B - 1 - i : i]; x.fillRect(0, i, TW, 1); }
      // little raised stud every tile
      const sy = flipV ? B - 4 : 1;
      x.fillStyle = r.l; x.fillRect(7, sy, 2, 2);
      x.fillStyle = r.h; x.fillRect(7, sy + 2, 2, 1);
      x.fillStyle = r.ink; x.fillRect(6, sy + 1, 1, 1); x.fillRect(9, sy + 1, 1, 1);
      return c;
    }
    function edgeV(cols, flipH) {                 // vertical edge tile, B x TW
      const c = newCan(B, TW), x = c.getContext('2d');
      for (let i = 0; i < B; i++) { x.fillStyle = cols[flipH ? B - 1 - i : i]; x.fillRect(i, 0, 1, TW); }
      const sx = flipH ? B - 4 : 1;
      x.fillStyle = r.l; x.fillRect(sx, 7, 2, 2);
      x.fillStyle = r.h; x.fillRect(sx + 2, 7, 1, 2);
      x.fillStyle = r.ink; x.fillRect(sx + 1, 6, 1, 1); x.fillRect(sx + 1, 9, 1, 1);
      return c;
    }
    // ornate corner: chamfered mitred bevel + a raised boss + filigree
    function corner(hCols, vCols, ramp) {
      const c = newCan(C, C), x = c.getContext('2d');
      for (let y = 0; y < C; y++) for (let i = 0; i < C; i++) {
        if (y >= B && i >= B) continue;
        x.fillStyle = (y <= i) ? hCols[Math.min(y, B - 1)] : vCols[Math.min(i, B - 1)];
        x.fillRect(i, y, 1, 1);
      }
      // 1px chamfer on the outer corner so the frame reads as beaten metal
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = r.ink; x.fillRect(1, 0, 1, 1); x.fillRect(0, 1, 1, 1);
      // raised boss on the bevel
      x.fillStyle = ramp[1]; x.fillRect(2, 1, 1, 1); x.fillRect(1, 2, 1, 1); x.fillRect(3, 2, 1, 1); x.fillRect(2, 3, 1, 1);
      x.fillStyle = ramp[0]; x.fillRect(2, 2, 1, 1);
      x.fillStyle = r.ink; x.fillRect(3, 1, 1, 1); x.fillRect(1, 3, 1, 1);
      // filigree inside
      const key = { l: ramp[0], h: ramp[1], m: ramp[2], d: ramp[3], k: r.ink };
      for (let j = 0; j < FILIGREE.length && B + j < C; j++) {
        const row = FILIGREE[j];
        for (let i = 0; i < row.length && B + i < C; i++) {
          const col = key[row[i]];
          if (col) { x.fillStyle = col; x.fillRect(B + i, B + j, 1, 1); }
        }
      }
      return c;
    }
    function mirror(src, fx, fy) {
      const c = newCan(src.width, src.height), x = c.getContext('2d');
      x.translate(fx ? src.width : 0, fy ? src.height : 0); x.scale(fx ? -1 : 1, fy ? -1 : 1);
      x.drawImage(src, 0, 0);
      return c;
    }
    const gus = [r.l, r.h, r.m, r.d];
    const tl = corner(lit, lit, gus);
    const tr0 = corner(lit, shd.slice().reverse(), gus);
    const bl0 = corner(shd.slice().reverse(), lit, gus);
    const br0 = corner(shd, shd, gus);
    p = {
      ramp: r, style: st, B: B, C: C, TW: TW,
      top: edgeH(lit, false), bottom: edgeH(shd, true),
      left: edgeV(lit, false), right: edgeV(shd, true),
      tl: tl, tr: mirror(tr0, true, false), bl: mirror(bl0, false, true), br: mirror(br0, true, true),
      tile: st.tile(), pattern: null, patternCtx: null,
    };
    PARTS.set(styleName, p);
    return p;
  }
  function patternOf(ctx, p) {
    if (!p.pattern || p.patternCtx !== ctx) { p.pattern = ctx.createPattern(p.tile, 'repeat'); p.patternCtx = ctx; }
    return p.pattern;
  }

  // ------------------------------------------------------------ primitives -
  function fillTiled(ctx, p, x, y, w, h) {
    ctx.save(); ctx.translate(x | 0, y | 0);
    ctx.fillStyle = patternOf(ctx, p); ctx.fillRect(0, 0, w | 0, h | 0);
    ctx.restore();
  }
  function blitRepeatH(ctx, img, x, y, w) {       // repeat a tile horizontally, clipped
    const tw = img.width; let dx = 0;
    while (dx < w) { const s = Math.min(tw, w - dx); ctx.drawImage(img, 0, 0, s, img.height, x + dx, y, s, img.height); dx += s; }
  }
  function blitRepeatV(ctx, img, x, y, h) {
    const th = img.height; let dy = 0;
    while (dy < h) { const s = Math.min(th, h - dy); ctx.drawImage(img, 0, 0, img.width, s, x, y + dy, img.width, s); dy += s; }
  }
  function rect(ctx, col, x, y, w, h) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function hollow(ctx, col, x, y, w, h) {
    ctx.fillStyle = col;
    ctx.fillRect(x | 0, y | 0, w | 0, 1); ctx.fillRect(x | 0, (y + h - 1) | 0, w | 0, 1);
    ctx.fillRect(x | 0, y | 0, 1, h | 0); ctx.fillRect((x + w - 1) | 0, y | 0, 1, h | 0);
  }

  const UIKit = {
    colors: RAMPS,
    // border thickness, ornate-corner size and the recommended content inset
    metrics: { border: B, corner: C, pad: B + 3 },
    // ------------------------------------------------- ornate border only --
    frame(ctx, x, y, w, h, style) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const p = parts(style || 'gold'), r = p.ramp;
      if (w < 2 * B + 2 || h < 2 * B + 2) { hollow(ctx, r.ink, x, y, w, h); if (w > 2 && h > 2) hollow(ctx, r.h, x + 1, y + 1, w - 2, h - 2); return; }
      const cs = Math.min(C, Math.floor((w - 2) / 2), Math.floor((h - 2) / 2));
      const ew = w - cs * 2, eh = h - cs * 2;
      if (ew > 0) { blitRepeatH(ctx, p.top, x + cs, y, ew); blitRepeatH(ctx, p.bottom, x + cs, y + h - B, ew); }
      if (eh > 0) { blitRepeatV(ctx, p.left, x, y + cs, eh); blitRepeatV(ctx, p.right, x + w - B, y + cs, eh); }
      ctx.drawImage(p.tl, 0, 0, cs, cs, x, y, cs, cs);
      ctx.drawImage(p.tr, C - cs, 0, cs, cs, x + w - cs, y, cs, cs);
      ctx.drawImage(p.bl, 0, C - cs, cs, cs, x, y + h - cs, cs, cs);
      ctx.drawImage(p.br, C - cs, C - cs, cs, cs, x + w - cs, y + h - cs, cs, cs);
    },
    // ------------------------------------------------- filled ornate panel --
    panel(ctx, x, y, w, h, style) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const p = parts(style || 'gold'), r = p.ramp;
      const i = Math.min(B, Math.floor(w / 2), Math.floor(h / 2));
      fillTiled(ctx, p, x + i, y + i, Math.max(0, w - i * 2), Math.max(0, h - i * 2));
      // embossed interior lip: light top-left, shadow bottom-right
      if (w > i * 2 + 2 && h > i * 2 + 2) {
        const ix = x + i, iy = y + i, iw = w - i * 2, ih = h - i * 2;
        rect(ctx, darkC(r.ink, 0.15), ix, iy, iw, 1); rect(ctx, darkC(r.ink, 0.15), ix, iy, 1, ih);
        rect(ctx, mixC(r.h, '#ffffff', 0.05), ix, iy + ih - 1, iw, 1); rect(ctx, r.h, ix + iw - 1, iy, 1, ih);
        rect(ctx, r.ink, ix + iw - 1, iy + ih - 1, 1, 1);
      }
      this.frame(ctx, x, y, w, h, style);
    },
    // ---------------------------------------------------------- item slot --
    slot(ctx, x, y, size, state) {
      x = Math.round(x); y = Math.round(y); const s = Math.max(8, Math.round(size));
      const gold = RAMPS.gold, stone = RAMPS.stone;
      const st = state || 'available';
      const band = st === 'locked' ? stone : gold;
      const bl = st === 'hover' ? '#fff8d8' : st === 'owned' ? band.l : st === 'locked' ? stone.m : band.h;
      const bm = st === 'hover' ? band.l : st === 'owned' ? band.h : st === 'locked' ? stone.d : band.m;
      const bd = st === 'locked' ? '#24272e' : band.d;
      const inner = st === 'owned' ? '#3a2a12' : st === 'hover' ? '#243354' : st === 'locked' ? '#0b0d12' : '#161d30';
      hollow(ctx, '#0a0a10', x, y, s, s);                       // outer ink
      rect(ctx, bm, x + 1, y + 1, s - 2, s - 2);                // band
      rect(ctx, bl, x + 1, y + 1, s - 2, 1); rect(ctx, bl, x + 1, y + 1, 1, s - 2);
      rect(ctx, bd, x + 1, y + s - 2, s - 2, 1); rect(ctx, bd, x + s - 2, y + 1, 1, s - 2);
      hollow(ctx, '#0a0a10', x + 3, y + 3, s - 6, s - 6);       // inner ink
      rect(ctx, inner, x + 4, y + 4, s - 8, s - 8);             // recessed interior
      rect(ctx, darkC(inner, 0.45), x + 4, y + 4, s - 8, 1); rect(ctx, darkC(inner, 0.45), x + 4, y + 4, 1, s - 8);
      rect(ctx, lightC(inner, 0.12), x + 4, y + s - 5, s - 8, 1); rect(ctx, lightC(inner, 0.12), x + s - 5, y + 4, 1, s - 8);
      if (st === 'locked') {                                     // hatched + dim
        ctx.save(); ctx.translate(x + 4, y + 4);
        ctx.fillStyle = hatchPattern(ctx); ctx.fillRect(0, 0, s - 8, s - 8);
        ctx.restore();
      }
      // corner studs
      const studs = [[x + 2, y + 2], [x + s - 4, y + 2], [x + 2, y + s - 4], [x + s - 4, y + s - 4]];
      for (const [sx, sy] of studs) { rect(ctx, bd, sx, sy, 2, 2); rect(ctx, bl, sx, sy, 1, 1); }
      if (st === 'hover') {                                      // bright corner ticks
        rect(ctx, '#fffbe0', x, y, 4, 1); rect(ctx, '#fffbe0', x, y, 1, 4);
        rect(ctx, '#fffbe0', x + s - 4, y, 4, 1); rect(ctx, '#fffbe0', x + s - 1, y, 1, 4);
        rect(ctx, '#fffbe0', x, y + s - 1, 4, 1); rect(ctx, '#fffbe0', x, y + s - 4, 1, 4);
        rect(ctx, '#fffbe0', x + s - 4, y + s - 1, 4, 1); rect(ctx, '#fffbe0', x + s - 1, y + s - 4, 1, 4);
      }
      if (st === 'owned') { rect(ctx, '#ffeeb4', x + 5, y + 5, 1, 1); rect(ctx, '#ffeeb4', x + 6, y + 4, 1, 1); rect(ctx, gold.h, x + 4, y + 6, 1, 1); }
    },
    // ------------------------------------------------------------- button --
    button(ctx, x, y, w, h, label, state) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const st = state || 'normal';
      const r = st === 'disabled' ? RAMPS.stone : RAMPS.gold;
      const down = st === 'pressed';
      const oy = down ? 1 : 0;
      if (!down) rect(ctx, '#0a0a10', x + 1, y + h - 1, w - 2, 1);   // seated shadow
      const top = st === 'hover' ? r.l : st === 'disabled' ? r.m : r.h;
      const mid = st === 'hover' ? r.h : st === 'disabled' ? r.d : r.m;
      const bot = st === 'hover' ? r.m : st === 'disabled' ? darkC(r.d, 0.3) : r.d;
      const bh = h - (down ? 1 : 2);
      hollow(ctx, '#0a0a10', x, y + oy, w, bh);
      rect(ctx, mid, x + 1, y + oy + 1, w - 2, bh - 2);
      rect(ctx, down ? bot : top, x + 1, y + oy + 1, w - 2, down ? 2 : 2);
      rect(ctx, down ? mid : bot, x + 1, y + oy + bh - 3, w - 2, 2);
      rect(ctx, down ? bot : top, x + 1, y + oy + 1, 1, bh - 2);
      rect(ctx, down ? top : bot, x + w - 2, y + oy + 1, 1, bh - 2);
      // chamfered corners + studs
      for (const [cx, cy] of [[x, y + oy], [x + w - 1, y + oy], [x, y + oy + bh - 1], [x + w - 1, y + oy + bh - 1]]) rect(ctx, '#0a0a10', cx, cy, 1, 1);
      if (w > 16 && h > 9) {
        for (const [sx, sy] of [[x + 2, y + oy + 2], [x + w - 4, y + oy + 2], [x + 2, y + oy + bh - 4], [x + w - 4, y + oy + bh - 4]]) { rect(ctx, r.d, sx, sy, 2, 2); rect(ctx, r.l, sx, sy, 1, 1); }
      }
      if (label) {
        const fs = h >= 22 ? 12 : h >= 15 ? 9 : 7;
        const f = faceFor(fs);
        const ty = y + oy + Math.round((bh - f.face.capH * f.scale) / 2);
        const col = st === 'disabled' ? '#8d939d' : '#fff6d2';
        drawText(ctx, label, x + Math.round(w / 2), ty, fs, { color: col, align: 'center', outline: '#2a1d08' });
      }
    },
    // --------------------------------------------------- progress / health --
    bar(ctx, x, y, w, h, fill01, colorA, colorB) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.max(6, Math.round(h));
      const g = RAMPS.gold;
      const k = clamp(fill01 === undefined ? 1 : fill01, 0, 1);
      const A = colorA || '#c8302e', Bc = colorB || colorA || '#ffe48f';
      const cap = w >= 24 ? 3 : 1;
      hollow(ctx, '#0a0a10', x, y, w, h);
      rect(ctx, '#0d1018', x + 1, y + 1, w - 2, h - 2);
      const ix = x + 1 + cap + 1, iw = w - 2 * (cap + 2), ih = h - 4, iy = y + 2;
      rect(ctx, '#05070c', ix - 1, y + 1, iw + 2, h - 2);
      for (let i = 8; i < iw; i += 8) rect(ctx, '#151b2b', ix + i, iy, 1, ih);   // segment ticks
      const fw = Math.round(iw * k), NS = 5, ramp = barRamp(A, Bc, NS);
      const bandOf = i => Math.min(NS - 1, Math.floor((iw <= 1 ? 1 : i / (iw - 1)) * NS));
      for (let i = 0; i < fw;) {
        const bIdx = bandOf(i); let j = i + 1;
        while (j < fw && bandOf(j) === bIdx) j++;
        const c = ramp[bIdx];
        rect(ctx, c[0], ix + i, iy, j - i, ih);
        rect(ctx, c[1], ix + i, iy, j - i, 1);
        rect(ctx, c[2], ix + i, iy + ih - 1, j - i, 1);
        i = j;
      }
      if (fw > 0 && fw < iw) rect(ctx, '#0a0a10', ix + fw, iy, 1, ih);
      // ornate end caps
      if (cap > 1) {
        for (const [cx, flip] of [[x + 1, false], [x + w - 1 - cap, true]]) {
          rect(ctx, g.m, cx, y + 1, cap, h - 2);
          rect(ctx, g.l, cx, y + 1, cap, 1);
          rect(ctx, g.d, cx, y + h - 2, cap, 1);
          rect(ctx, flip ? g.d : g.h, cx, y + 1, 1, h - 2);
          rect(ctx, flip ? g.h : g.d, cx + cap - 1, y + 1, 1, h - 2);
          rect(ctx, g.l, cx, y + (h >> 1) - 1, cap, 1);
          rect(ctx, '#0a0a10', cx, y + (h >> 1), cap, 1);
          rect(ctx, '#0a0a10', flip ? cx - 1 : cx + cap, y + 1, 1, h - 2);
        }
      }
    },
    // ------------------------------------------------------------- ribbon --
    ribbon(ctx, cx, y, text, style) {
      cx = Math.round(cx); y = Math.round(y);
      const st = style || 'gold', g = RAMPS.gold;
      const body = st === 'wood' ? '#6b4522' : st === 'parchment' ? '#c4ab74' : st === 'dark' ? '#1b2238' : st === 'stone' ? '#4f5560' : '#7a1f22';
      const size = 10;
      const tw = textWidth(String(text), size);
      const pw = Math.max(40, tw + 26), ph = 20;
      const x = cx - (pw >> 1), tail = 13;
      // swallowtails behind the plaque
      for (let i = 0; i < tail; i++) {
        const cut = Math.max(0, tail - 1 - i) >> 1;
        const ty = y + 4 + cut, th = ph - 8 - cut * 2;
        rect(ctx, '#0a0a10', x - tail + i, ty - 1, 1, th + 2);
        rect(ctx, darkC(body, 0.35), x - tail + i, ty, 1, th);
        rect(ctx, '#0a0a10', x + pw + tail - 1 - i, ty - 1, 1, th + 2);
        rect(ctx, darkC(body, 0.35), x + pw + tail - 1 - i, ty, 1, th);
      }
      rect(ctx, darkC(body, 0.6), x - 2, y + 4, 2, ph - 8);
      rect(ctx, darkC(body, 0.6), x + pw, y + 4, 2, ph - 8);
      // plaque
      hollow(ctx, '#0a0a10', x, y, pw, ph);
      rect(ctx, body, x + 1, y + 1, pw - 2, ph - 2);
      rect(ctx, lightC(body, 0.18), x + 1, y + 1, pw - 2, 1);
      rect(ctx, darkC(body, 0.3), x + 1, y + ph - 2, pw - 2, 1);
      // gold trim
      rect(ctx, g.m, x + 2, y + 2, pw - 4, 1); rect(ctx, g.h, x + 2, y + 3, pw - 4, 1);
      rect(ctx, g.m, x + 2, y + ph - 4, pw - 4, 1); rect(ctx, g.d, x + 2, y + ph - 3, pw - 4, 1);
      rect(ctx, g.h, x + 2, y + 2, 1, ph - 4); rect(ctx, g.d, x + pw - 3, y + 2, 1, ph - 4);
      for (const sx of [x + 3, x + pw - 6]) { rect(ctx, g.d, sx, y + (ph >> 1) - 1, 3, 3); rect(ctx, g.l, sx, y + (ph >> 1) - 1, 2, 1); rect(ctx, g.h, sx + 1, y + (ph >> 1), 1, 1); }
      drawText(ctx, text, cx, y + Math.round((ph - 7) / 2), size, { color: '#fff3c4', align: 'center', outline: '#2a0c0c' });
    },
    // ------------------------------------------------------------ divider --
    divider(ctx, x, y, w) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w);
      const g = RAMPS.gold;
      rect(ctx, '#0a0a10', x + 2, y, w - 4, 1);
      rect(ctx, g.m, x + 3, y + 1, w - 6, 1);
      rect(ctx, g.h, x + 5, y + 1, w - 10, 1);
      rect(ctx, '#0a0a10', x + 2, y + 2, w - 4, 1);
      // tapered ends
      for (const [ex, d] of [[x, 1], [x + w - 1, -1]]) {
        rect(ctx, '#0a0a10', ex, y + 1, 1, 1);
        rect(ctx, g.m, ex + d, y + 1, 1, 1);
        rect(ctx, g.h, ex + d * 2, y, 1, 3);
        rect(ctx, '#0a0a10', ex + d * 2, y - 1, 1, 1); rect(ctx, '#0a0a10', ex + d * 2, y + 3, 1, 1);
      }
      // centre lozenge
      const cx = x + (w >> 1);
      const shape = [1, 3, 5, 3, 1];
      for (let i = 0; i < shape.length; i++) {
        const hw = shape[i] >> 1;
        rect(ctx, '#0a0a10', cx - hw - 1, y - 2 + i, shape[i] + 2, 1);
      }
      for (let i = 0; i < shape.length; i++) {
        const hw = shape[i] >> 1;
        rect(ctx, i < 2 ? g.h : i === 2 ? g.m : g.d, cx - hw, y - 2 + i, shape[i], 1);
      }
      rect(ctx, g.l, cx - 1, y - 1, 2, 1); rect(ctx, g.l, cx, y - 2, 1, 1);
      // flanking dots
      for (const d of [-6, 6]) { rect(ctx, '#0a0a10', cx + d - 1, y, 3, 1); rect(ctx, g.h, cx + d, y, 1, 1); }
    },
    // ------------------------------------------------ parchment scroll page --
    scroll(ctx, x, y, w, h) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const p = parts('parchment');
      const rollH = 8, px = x + 3, pw = w - 6, py = y + rollH - 1, ph = h - rollH * 2 + 2;
      // page
      rect(ctx, '#0a0a10', px - 1, py, pw + 2, ph);
      fillTiled(ctx, p, px, py + 1, pw, ph - 2);
      rect(ctx, '#c9b47f', px, py + 1, pw, 1);
      rect(ctx, '#c9b47f', px, py + ph - 2, pw, 1);
      rect(ctx, '#d6c28d', px, py + 1, 1, ph - 2);
      rect(ctx, '#f6ecd0', px + pw - 1, py + 1, 1, ph - 2);
      // age stains
      for (let i = 0; i < 14; i++) {
        const sx = px + 2 + Math.floor(hash2(i * 13 + 5, 91) * Math.max(1, pw - 6));
        const sy = py + 3 + Math.floor(hash2(i * 7 + 3, 41) * Math.max(1, ph - 8));
        rect(ctx, hash2(i, 9) > 0.5 ? '#d8c48d' : '#e0cf9c', sx, sy, 1 + (i % 2), 1);
      }
      // rollers (top & bottom)
      const wr = RAMPS.wood;
      for (const [ry, flip] of [[y, false], [y + h - rollH, true]]) {
        const rows = flip ? [wr.ink, wr.m, wr.h, wr.l, wr.h, wr.m, wr.d, wr.ink] : [wr.ink, wr.m, wr.h, wr.l, wr.h, wr.m, wr.d, wr.ink];
        for (let i = 0; i < rollH; i++) rect(ctx, rows[i], x + 2, ry + i, w - 4, 1);
        rect(ctx, wr.ink, x + 2, ry, 1, rollH); rect(ctx, wr.ink, x + w - 3, ry, 1, rollH);
        // knob end caps
        for (const kx of [x, x + w - 2]) {
          rect(ctx, wr.ink, kx, ry + 1, 2, rollH - 2);
          rect(ctx, wr.h, kx, ry + 2, 2, rollH - 4);
          rect(ctx, wr.l, kx, ry + 2, 1, 1);
        }
        // grain
        for (let i = 4; i < w - 8; i += 9) rect(ctx, wr.m, x + 4 + i, ry + 3, 3, 1);
      }
      // curl shadow under/over the rollers
      rect(ctx, '#c9b47f', px, py + 2, pw, 1);
      rect(ctx, '#c9b47f', px, py + ph - 3, pw, 1);
    },
  };

  // ============================================================== exports ==
  const PixelFont = {
    faces: FACES, drawText: drawText, faceFor: faceFor, textWidth: textWidth,
    textHeight: textHeight, lineHeight: lineHeight, wrapText: wrapText,
    clearCache() { GCACHE.clear(); SIZE_CACHE.clear(); },
    cacheSize() { let n = 0; GCACHE.forEach(m => { n += m.size; }); return n; },
  };
  global.PixelFont = PixelFont;
  global.UIKit = UIKit;
  global.pixelText = pixelText;
  global.pixelTextOutlined = pixelTextOutlined;
  global.wrapText = wrapText;
  global.textWidth = textWidth;
  global.textHeight = textHeight;
  global.lineHeight = lineHeight;
})(typeof window !== 'undefined' ? window : this);
