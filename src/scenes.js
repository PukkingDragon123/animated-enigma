// ---- Cinematic intro, dialogue, end screens -----------------------------
// The intro cinematic now lives in src/intro.js, which defines the global
// `Intro`. A top-level `const Intro` here would shadow it, so it is gone.

// G is a top-level `let` in entities.js and may not be initialised while this
// file is being evaluated, so every access from out here goes through this.
function sceneG() { try { return G; } catch (e) { return null; } }

// =========================================================================
//  THE ARRIVAL — staged in the LIVE WORLD, not drawn as a plate.
//
//  The real village out of src/village.js, the real pier, the real player,
//  the real lookout.  Every beat below is the game itself with the cine
//  camera and the letterbox doing the work; the only thing drawn here is the
//  night that goes over the top of it, the lamps the village has lit, and
//  the marks and bubbles that hang off a world position.
//
//    0.0  IN THE DARK   she comes up the channel at night, low in the water,
//                       the village asleep across the top of the frame
//    3.0  SPOTTED       the camera pushes onto the lookout on the pier head
//    3.6  THE SHOUT     he yells, and the bay has half a second to hear it
//    5.4  THE ANSWER    the prompt comes up; the player fires; the camera
//                       snaps onto him on the bang and starts pulling out
//     ->  the alarm, the Chief's order and the fleet carry straight on in
//         BossCut's in-world 'village_alarm', queued from here
//
//  game.js owns the kill (Dialogue.done + a click -> a real projectile at
//  G.fisherman -> G.onFishermanShot), so all of this is staged AROUND that
//  handshake instead of replacing it.  If the arrival is cut short from
//  outside -- the test harnesses set Dialogue.done straight to true -- the
//  staging drops out, the camera goes back, and the plain bubble is what is
//  left.  Nothing here can strand the view: the snap onto the lookout sets
//  its own slow release on the same frame, so even a dropped timer recovers.
// =========================================================================
const Dialogue = {
  // ---- the handshake game.js drives.  Do not rename.
  t: 0, text: 'OI! SOMETHING IN THE WATER!', done: false, shotFired: false,
  // ---- the beats, in seconds
  K: { dive: 2.25, spot: 2.90, shout: 3.45, ready: 5.10 },
  _nat: false, _bail: false, _shot: -1, _queued: false, _timer: 0,
  _flash: 0, _cut: 1e9, _hit: null,

  reset() {
    this.t = 0; this.done = false; this.shotFired = false;
    this._nat = false; this._bail = false; this._shot = -1; this._queued = false;
    this._flash = 0; this._cut = 1e9; this._hit = {};
    if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
    if (typeof WorldCine !== 'undefined') WorldCine.begin();
  },
  wc() { return (typeof WorldCine !== 'undefined' && WorldCine.ok()) ? WorldCine : null; },
  // everything the staging needs to exist before it will take the camera
  staged() {
    const g = sceneG();
    return !!(!this._bail && this.wc() && g && g.player && g.fisherman && g.cineTo && g.pier);
  },
  once(k) { if (!this._hit) this._hit = {}; if (this._hit[k]) return false; return this._hit[k] = true; },
  sfx(fn) { try { if (typeof Audio_ !== 'undefined') fn(); } catch (e) { } },

  update(dt) {
    if (dt > 1 / 20) dt = 1 / 20;
    // somebody outside pushed us to the end (the boot harnesses do exactly
    // this): give the camera and the night straight back and fall through to
    // the plain bubble, so nothing that drives the game from outside changes
    if (this.done && !this._nat && !this._bail) this.bail();
    if (!this.staged()) { this.t += dt; if (this.t > 3) this.done = true; return; }

    const g = sceneG(), W = this.wc(), K = this.K;
    const f = g.fisherman, p = g.player;
    this.t += dt;
    const T = this.t;
    this._flash = Math.max(0, this._flash - dt * 8);
    W.night = Math.min(1, W.night + dt * 3.2);
    W.lamp = Math.min(1, W.lamp + dt * 0.8);
    g.cineBars(W.eo3(Math.min(1, T / 0.8)));

    // ---- she comes up the channel.  DRIVEN, not steered: the player's own
    // update runs immediately after this one, so the position is written
    // again every frame and whatever the sticks did is overwritten before it
    // can accumulate.  The velocity is handed over too, so the wake, the
    // swim cycle and the camera lead all read the move as a real one.
    if (this._shot < 0 && !p.dead) {
      const u = W.eo3(clamp(T / (K.spot + 0.55), 0, 1));
      const nx = lerp(f.x + 152, f.x + 6, u), ny = lerp(f.y + 268, f.y + 62, u);
      const iv = 1 / Math.max(dt, 1e-3);
      p.vx = clamp((nx - p.x) * iv, -170, 170); p.vy = clamp((ny - p.y) * iv, -170, 170);
      p.x = nx; p.y = ny;
      p.aim = angleTo(p.x, p.y, f.x, f.y - 8);
      p.facing = p.x > f.x ? -1 : 1;
      // she comes up the channel UNDER it.  The dive flag is the game's own,
      // so she is the same half-alpha shadow the ability makes her, and the
      // camera, the shadow and the wake all already know what it means.
      if (T < K.dive) { p.dive.active = true; p.dive.t = 0; p.dive.cd = 0; }
    }
    // and breaks the surface.  This is WHY he looks up.
    if (T >= K.dive && this.once('surface')) {
      p.dive.active = false; p.dive.t = 0; p.dive.cd = 0;
      if (g.particles) { g.particles.splash(p.x, p.y, 2.0); g.particles.bubbles(p.x, p.y, 10); }
      this.sfx(() => Audio_.splash(1.4));
    }

    // ---- he clocks them
    if (T >= K.spot && this.once('spot')) {
      g.cineTo(f.x, f.y - 6, 2.5, 0.85);
      this.sfx(() => { Audio_.tone(300, 0.10, 'square', 0.16, 150); Audio_.tone(450, 0.08, 'square', 0.10, 120); });
    }
    // ---- and yells.  The pier hears it before the village does.
    if (T >= K.shout && this.once('shout')) {
      this.sfx(() => { Audio_.tone(430, 0.18, 'square', 0.20, -170); Audio_.tone(300, 0.26, 'sawtooth', 0.13, -110); });
      if (typeof Village !== 'undefined' && Village.panicNear) Village.panicNear(f.x, f.y, 160);
    }
    // ---- the prompt.  Pull to a two-shot: the shot has to be legible.
    if (T >= K.ready && !this.done) {
      this.done = true; this._nat = true;
      g.cineTo((f.x + p.x) / 2, (f.y + p.y) / 2 - 2, 1.85, 0.7);
    }

    // ---- the otter answers.  game.js sets shotFired on the click; the frame
    // after, the camera snaps onto him and the rest of the raid is queued.
    if (this.shotFired && this._shot < 0) {
      this._shot = T; this._flash = 1;
      this._cut = Math.max(4, Math.floor((T - K.shout) * 44) - 3);   // the line is cut off mid-word
      g.cineHold(f.x, f.y - 6, 2.9);
      // and a slow release set on the SAME frame, so a dropped timer or a
      // lost cut can never leave the player parked in a close-up
      g.cineTo(null, null, 1, 2.4);
      g.shake(9);
      this.queueAlarm(f.x, f.y);
    }
  },

  // The alarm cannot be started from here directly: game.js flips to 'play'
  // the instant the projectile lands, which would clobber a cut started
  // before it.  So this waits for the body to actually drop and then hands
  // over, with a hard deadline that gives the camera back if it never does.
  queueAlarm(x, y) {
    if (this._queued) return;
    this._queued = true;
    const nat = this._nat, self = this;
    const step = (tries) => {
      self._timer = 0;
      const g = sceneG();
      if (!g) return;
      if (nat && g.fisherman && !g.fisherman.alive && g.state === 'play' && g.playCut) {
        if (g.playCut('village_alarm', { x: x, y: y })) return;
      }
      if (tries > 0) { self._timer = setTimeout(() => step(tries - 1), 45); return; }
      if (typeof WorldCine !== 'undefined') WorldCine.release(0.5);
    };
    this._timer = setTimeout(() => step(nat ? 28 : 0), 45);
  },

  // drop the staging and hand everything back, whatever state it was in
  bail() {
    this._bail = true; this._queued = true;
    if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
    if (typeof WorldCine !== 'undefined') WorldCine.release(0.25);
  },
  // game.js has no hold-to-skip wired into the dialogue state yet; if it ever
  // gets one, this is what it drives, and it leaves nothing behind.
  skip() { this.done = true; this._nat = false; this.bail(); },

  renderWorld(ctx, cam) { /* everything is anchored through the camera in HUD space */ },

  renderHUD(ctx) {
    const g = sceneG(); if (!g) return;
    const f = g.fisherman;
    const bars = g.cine ? g.cine.bars : 0;
    const barH = Math.round(46 * bars);
    const W = this.wc(), on = this.staged();

    // ---- the night, the lamps the village has lit, and the muzzle flash
    if (W && on) {
      W.veil(ctx, W.night, barH);
      W.lamps(ctx, W.night * W.lamp, barH, this.t);
      if (f && f.alive) W.pool(ctx, f.x - 9, f.y - 1, W.night, barH, 1.15, '#ffd67a');
      if (this._flash > 0.02) W.wash(ctx, '#ffffff', Math.min(0.78, this._flash), barH);
    }

    // ---- what he says, anchored to him through the zoom
    if (f && f.alive) {
      if (on) {
        const K = this.K;
        if (this.t > K.spot + 0.10 && this.t < K.shout + 0.55)
          W.mark(ctx, f.x, f.y - 21, clamp((this.t - K.spot - 0.10) / 0.20, 0, 1), '#ffe48f');
        const n = Math.min(this._cut, Math.floor((this.t - K.shout) * 44) + 1);
        if (this.t > K.shout && n > 0) W.bubble(ctx, f.x, f.y - 30, this.text, n, false);
      } else if (this.t > 0.6) {
        W2bubble(ctx, g, f, this.text, Math.floor((this.t - 0.6) * 30));
      }
    }

    if (!this.done || this.shotFired) return;
    const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
    const py = on ? 266 : 298;
    UIKit.panel(ctx, 150, py, 340, 34, 'dark');
    pixelTextOutlined(ctx, touch ? 'TAP FIRE. LET THE OTTER ANSWER.' : 'LEFT CLICK. LET THE OTTER ANSWER.',
      320, py + 6, 10, Math.floor(this.t * 2) % 2 ? '#ffe48f' : '#ffffff', '#14141c', 'center');
    pixelText(ctx, touch ? 'Helm to swim   SHIELD to parry   ROLL to dash'
                         : 'WASD swim   SPACE roll   E / right-click shield   TAB skill tree',
      320, py + 22, 6, on ? '#8fa6b8' : '#9ab0c0', 'center');
  },
};
// the plain, un-staged bubble: exactly the one that was here before, kept so
// anything that drives the game past the arrival still looks the way it did
function W2bubble(ctx, g, f, text, n) {
  const sp = g.worldToScreen(f.x, f.y - 34);
  const sx = Math.round(sp.x), sy = Math.round(sp.y);
  n = Math.min(text.length, n);
  const w = Math.max(70, textWidth(text, 7) + 20);
  const bx = clamp(sx - w / 2, 6, 634 - w), by = clamp(sy - 26, 44, 300);
  UIKit.panel(ctx, bx, by, w, 24, 'parchment');
  ctx.fillStyle = '#e8dcc0';
  ctx.beginPath(); ctx.moveTo(sx - 6, by + 23); ctx.lineTo(sx + 6, by + 23); ctx.lineTo(sx, by + 33); ctx.fill();
  ctx.fillStyle = '#2a2016';
  ctx.beginPath(); ctx.moveTo(sx - 7, by + 24); ctx.lineTo(sx - 5, by + 24); ctx.lineTo(sx, by + 34); ctx.fill();
  ctx.beginPath(); ctx.moveTo(sx + 7, by + 24); ctx.lineTo(sx + 5, by + 24); ctx.lineTo(sx, by + 34); ctx.fill();
  pixelText(ctx, text.slice(0, n), bx + 10, by + 8, 7, '#2a2016', 'left', false);
}

function drawEndScreen(ctx, t, win) {
  ctx.fillStyle = win ? 'rgba(6,26,20,0.88)' : 'rgba(30,5,10,0.88)';
  ctx.fillRect(0, 0, 640, 360);
  const s = G.stats;
  UIKit.ribbon(ctx, 320, 18, win ? 'VILLAGE LIBERATED' : 'THE SEA TAKES ANOTHER', win ? 'gold' : 'dark');
  if (win) {
    pixelTextOutlined(ctx, 'The Chief sank with his shark.', 320, 48, 7, '#ffffff', '#14141c', 'center');
    pixelTextOutlined(ctx, 'The boats will not fish here again.', 320, 58, 7, '#ffffff', '#14141c', 'center');
    pixelText(ctx, 'NEXT DESTINATION: THE CANNERY', 320, 72, 6, '#8ac6ff', 'center');
  } else {
    pixelTextOutlined(ctx, 'The otter drags you back to the reef.', 320, 48, 7, '#ffffff', '#14141c', 'center');
    pixelText(ctx, 'Your scrap and upgrades are kept. Spend them better.', 320, 60, 6, '#ffe48f', 'center');
    pixelText(ctx, 'Strategy, not luck.', 320, 72, 6, '#9ab0c0', 'center');
  }
  const rows = [
    ['Time survived', fmtTime(G.director.time)],
    ['Boats sunk', s.kills],
    ['Attacks absorbed', s.absorbs],
    ['Boss crashes into rock', s.bossCrashes],
    ['Damage dealt', Math.round(s.damageDealt)],
    ['Damage taken', Math.round(s.damageTaken)],
    ['Scrap collected', s.scrapCollected],
    ['Upgrades taken', G.tree.unlocked.size + '/' + SKILL_NODES.length],
  ];
  UIKit.panel(ctx, 150, 88, 340, 196, 'dark');
  rows.forEach(([k, v], i) => {
    const y = 102 + i * 21;
    pixelText(ctx, k, 300, y, 7, '#9ab0c0', 'right');
    pixelTextOutlined(ctx, v + '', 316, y, 8, '#ffffff', '#14141c', 'left');
    if (i < rows.length - 1) UIKit.divider(ctx, 166, y + 13, 308);
  });
  const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
  UIKit.panel(ctx, 100, 296, 440, 34, 'dark');
  pixelTextOutlined(ctx, touch ? 'TAP TO FIGHT AGAIN' : '[R] FIGHT AGAIN        [TAB] SKILL TREE',
    320, 302, 10, Math.floor(t * 2) % 2 ? '#ffffff' : '#ffe48f', '#14141c', 'center');
  pixelText(ctx, (win ? 'Your build carries over.' : 'Everything you unlocked carries over.') + '   [ESC] title screen', 320, 317, 6, '#9ab0c0', 'center');
}

// ===========================================================================
//  BOSS CUTSCENES — short cinematic punches around a boss arriving and dying
//
//    'chief_intro'   ~6.9s  the water goes wrong, the village screams, the
//                           shark breaches, and the Village Chief is seen
//                           properly for the first time.  Side-on.
//    'chief_defeat'  ~7.6s  the shark rolls, the man goes under, she comes up
//                           where he sank, the otter takes his hat off, and
//                           her mother drifts past beneath.  Side-on.
//    'mini_intro'    ~2.1s  a name card, a silhouette, a shock of water.
//    'mini_defeat'   ~1.7s  the silhouette comes apart, the card is stamped.
//
//  Everything is baked once in init() and blitted; only the moving layer is
//  drawn per frame.  Pixel art only: integer coordinates, posterized bands,
//  hard edges, no gradients, no blur, no external images.
//
//  Public API (see the contract in game.js):
//    BossCut.init()                     build every sprite once, idempotent
//    BossCut.start(kind, opts)          opts = { name, x, y } for the minis
//    BossCut.update(dt, t)
//    BossCut.renderWorld(ctx, cam, t)   WORLD space (minis, when given x/y)
//    BossCut.renderScreen(ctx, t)       640x360 logical screen space
//    BossCut.active / .worldActive / .done
//    BossCut.skip()
// ===========================================================================
(function (global) {
'use strict';

// ------------------------------------------------------------- tiny raster
const R = Math.round;
function can(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
function cx2(c) { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; }
function spr(c, ax, ay) { return { c: c, w: c.width, h: c.height, ax: ax === undefined ? c.width / 2 : ax, ay: ay === undefined ? c.height / 2 : ay }; }
function P(ctx, col, x, y, w, h) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w === undefined ? 1 : w | 0, h === undefined ? 1 : h | 0); }
// hard-edged 1px line — no strokes, no AA
function LN(ctx, col, x0, y0, x1, y1, w) {
  x0 = x0 | 0; y0 = y0 | 0; x1 = x1 | 0; y1 = y1 | 0; w = w || 1;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, n = 0;
  ctx.fillStyle = col;
  for (;;) {
    ctx.fillRect(x0 - (w >> 1), y0 - (w >> 1), w, w);
    if ((x0 === x1 && y0 === y1) || ++n > 700) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
// a thick limb: a run of squares, so every edge stays on the pixel grid
function cap(ctx, col, x0, y0, x1, y1, w) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1, h = w >> 1;
  ctx.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(R(x0 + (x1 - x0) * t) - h, R(y0 + (y1 - y0) * t) - h, w, w);
  }
}
function tri(ctx, col, ax, ay, bx, by, cx, cy) {
  ctx.fillStyle = col;
  const y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
  const pts = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
  for (let y = y0; y <= y1; y++) {
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 3; i++) {
      const p = pts[i];
      if ((p[1] <= y && p[3] > y) || (p[3] <= y && p[1] > y)) {
        const t = (y - p[1]) / (p[3] - p[1]), x = p[0] + (p[2] - p[0]) * t;
        if (x < lo) lo = x; if (x > hi) hi = x;
      }
    }
    if (hi >= lo) ctx.fillRect(Math.round(lo), y, Math.max(1, Math.round(hi - lo)), 1);
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bay(x, y) { return (BAYER[(((y | 0) & 3) << 2) | ((x | 0) & 3)] + 0.5) / 16; }
function qa(a) { return Math.max(0, Math.min(1, Math.round(a * 12) / 12)); }
function rgbaq(hex, a) { const c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + qa(a) + ')'; }
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return 'rgb(' + R(A[0] + (B[0] - A[0]) * t) + ',' + R(A[1] + (B[1] - A[1]) * t) + ',' + R(A[2] + (B[2] - A[2]) * t) + ')';
}
// stamp a clean 1px ink outline around whatever has been drawn on a canvas.
// Lets the hand-built figures below be sketched with plain rectangles and
// still come out with the hard black edge everything else in the game has.
function outlineIt(c, ink) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  const col = hexToRgb(ink);
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
    const i = y * w + px;
    if (src[i]) continue;
    if (!((px > 0 && src[i - 1]) || (px < w - 1 && src[i + 1]) ||
          (y > 0 && src[i - w]) || (y < h - 1 && src[i + w]))) continue;
    const p = i * 4;
    d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
function cloneSpr(o) {
  const src = o.c || o, c = can(src.width, src.height);
  cx2(c).drawImage(src, 0, 0);
  return c;
}
// posterized tint: pull every pixel a fixed fraction toward a colour and
// snap the result onto a coarse level set, so it stays a flat palette
function tintCanvas(c, col, amt) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data, C = hexToRgb(col);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4; if (d[p + 3] < 9) continue;
    for (let k = 0; k < 3; k++) {
      const v = d[p + k] + (C[k] - d[p + k]) * amt;
      d[p + k] = Math.round(v / 17) * 17;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Paint a lit edge onto a finished sprite: every outermost opaque pixel on
// the side the light comes from is recoloured, one band hot, one band warm.
// Colouring the light instead of the object is what stops these figures
// reading as flat cut-outs against a coloured sky.
//
// (lx, ly) POINTS AT THE LIGHT, in sprite space: (1,0) is a light off to the
// right and lights the right-hand edge, (0,-1) is a light overhead.  It used
// to test the neighbour at px - lx, which lit the edge AWAY from the light,
// so every figure here was lit on the wrong side; the callers below all point
// at their actual source now.
function rimLight(c, lx, ly, hot, warm, depth) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  const HOT = hexToRgb(hot), WRM = warm ? hexToRgb(warm) : null;
  depth = depth || 1;
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
    const i = y * w + px;
    if (!op[i]) continue;
    const qx = px + lx, qy = y + ly;          // the pixel between us and the light
    const out = qx < 0 || qy < 0 || qx >= w || qy >= h || !op[qy * w + qx];
    if (!out) continue;
    for (let k = 0; k < depth; k++) {         // and the band running away from it
      const rx = px - lx * k, ry = y - ly * k;
      if (rx < 0 || ry < 0 || rx >= w || ry >= h) break;
      const j = ry * w + rx;
      if (!op[j]) break;
      const col = k === 0 ? HOT : WRM;
      if (!col) break;
      if (k > 0 && bay(rx, ry) > 0.55) break;
      const q = j * 4;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
// coloured bounce light on the underside: the water throws colour back up
function bounceLight(c, col, rows, bias) {
  const x = cx2(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const op = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  const C = hexToRgb(col);
  for (let px = 0; px < w; px++) {
    let hit = -1;
    for (let y = h - 1; y >= 0; y--) if (op[y * w + px]) { hit = y; break; }
    if (hit < 0) continue;
    for (let k = 0; k < rows; k++) {
      const y = hit - k; if (y < 0 || !op[y * w + px]) break;
      if (bay(px, y) > (1 - k / rows) * (bias || 0.8)) continue;
      const q = (y * w + px) * 4;
      d[q] = C[0]; d[q + 1] = C[1]; d[q + 2] = C[2]; d[q + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Bake-time pixel buffer.  Speckly sprites (foam rings, spray, flame) are
// tens of thousands of single pixels each; as fillRect calls the whole bake
// cost most of half a second, so they are written straight into bytes.
function pixBuf(w, h) { return { w: w, h: h, d: new Uint8ClampedArray(w * h * 4) }; }
function pixTo(b) { const c = can(b.w, b.h); cx2(c).putImageData(new ImageData(b.d, b.w, b.h), 0, 0); return c; }
function pset(b, c, x, y) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const p = (y * b.w + x) * 4;
  b.d[p] = c[0]; b.d[p + 1] = c[1]; b.d[p + 2] = c[2]; b.d[p + 3] = 255;
}

// posterized, ordered-dithered ramp fill straight into pixels (bake only)
function paintRamp(ctx, x0, y0, w, h, ramp, fy) {
  const img = ctx.createImageData(w, h), d = img.data;
  const cols = ramp.map(hexToRgb), n = cols.length;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let u = fy((h < 2 ? 0 : y / (h - 1)), x + x0, y + y0);
    if (u < 0) u = 0; else if (u > 1) u = 1;
    const fi = u * (n - 1);
    let i = Math.floor(fi);
    if (bay(x + x0, y + y0) < fi - i) i++;
    if (i < 0) i = 0; else if (i > n - 1) i = n - 1;
    const c = cols[i], p = (y * w + x) * 4;
    d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
  }
  ctx.putImageData(img, x0, y0);
}
// ---- easing.  Nothing in a cut moves at a constant rate: a body accelerates
// into a fall and decelerates out of a rise, and a card that slams arrives
// hard and settles.  These are the only curves used below.
function eo2(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); }
function eo3(u) { u = clamp(u, 0, 1); const v = 1 - u; return 1 - v * v * v; }
function ei2(u) { u = clamp(u, 0, 1); return u * u; }
function sstep(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
// a slam that overshoots and settles back: a card that stops dead is a decal,
// a card that recoils a couple of pixels has weight
function slamK(u) {
  u = clamp(u, 0, 1);
  if (u >= 1) return 1;
  const v = u - 1;
  return 1 + 2.30158 * v * v * v + 1.30158 * v * v;
}
// a flat pixel disc (sun, moon) — scanline rows, never a canvas arc
function disc(ctx, cx, cy, r, col, rim) {
  for (let y = -r; y <= r; y++) {
    const q = r * r - y * y; if (q < 0) continue;
    const hw = Math.floor(Math.sqrt(q));
    P(ctx, col, cx - hw, cy + y, hw * 2 + 1, 1);
    if (rim && (y === -r || y === r)) P(ctx, rim, cx - hw, cy + y, hw * 2 + 1, 1);
  }
}

// ----------------------------------------------------------------- palette
const BP = {
  ink: '#07060d', ink2: '#12101c',
  // DUSK — indigo zenith, through violet and rose, into ember and gold at the
  // waterline.  Fifteen bands so the dither has something to ramp between.
  skyDusk:  ['#140b2e', '#1c1039', '#271345', '#37174c', '#4b1c4e', '#642349', '#802c44',
             '#9c3a3e', '#b84a37', '#ce5f31', '#df7a31', '#ed993c', '#f6b755', '#fbd27e', '#ffeab4'],
  // NIGHT — nothing is burning.  Cold indigo at the zenith going steel at the
  // waterline, so the only warm thing in the frame is a lamp somebody lit.
  skyNight: ['#02030b', '#040613', '#06091c', '#080d26', '#0a1130', '#0d163b', '#101c46',
             '#142251', '#19295c', '#1f3168', '#263a74', '#2f4482'],
  // the hour before dawn: the same sky with the black drained out of the top
  skyPale:  ['#05070f', '#080c1d', '#0b122b', '#0f1a3a', '#14234a', '#1b2d5a', '#24386a',
             '#2f457a', '#3d548a', '#4d649a', '#6076aa', '#7589ba'],
  // DAWN — the whole spectacle: night blue, violet, magenta, coral, amber, gold.
  skyDawn:  ['#080c24', '#0d1531', '#131e41', '#1a2951', '#243461', '#33396e', '#463c76',
             '#5c3f74', '#75416c', '#8d4762', '#a45259', '#b86153', '#ca7353', '#d98a57',
             '#e6a462', '#f0bf78', '#f8da9e'],
  // SEA — index 0 is the near water at our feet, the last is right at the
  // horizon, where it has to carry the sky's colour or nothing joins up.
  sea:      ['#02040c', '#040815', '#060b1e', '#090f28', '#0b1533', '#0e1b3f', '#12224b',
             '#172956', '#1d305f', '#243766'],
  seaDusk:  ['#060616', '#080a20', '#0b0f2a', '#0e1637', '#121e44', '#172852', '#1f3260',
             '#2c3b68', '#42406c', '#5c456a', '#794a63', '#94525a', '#a95d4e'],
  seaPale:  ['#03060f', '#050a19', '#071024', '#0a1730', '#0d1e3d', '#11274b', '#163159',
             '#1d3b66', '#264674', '#315282'],
  seaDawn:  ['#05081a', '#070c26', '#0a1233', '#0d1941', '#12224f', '#182c5d', '#22356a',
             '#333b73', '#4a3f75', '#65456f', '#824b66', '#9d545c', '#b56152', '#c87055'],
  // chop, from the near water out to the horizon — it is not one grey
  chopDusk: ['#2a3358', '#3c4470', '#5a5078', '#7d5a74', '#a06a6a', '#c07f62'],
  chopNight:['#16244a', '#1d2f58', '#263a64', '#35416b', '#48446a', '#5c4560'],
  chopDawn: ['#1d2c58', '#27396a', '#354578', '#4a4d7c', '#66507a', '#875672'],
  foam:     ['#33566b', '#5d8298', '#8fb4c8', '#c8e2ef', '#f2fbff'],
  foamWarm: ['#5c3a4a', '#95576a', '#c47d6e', '#e8c08a', '#fff0cf'],
  vill:     '#090810', villR: '#1e1a28', villL: '#322b3e',
  fire:     ['#5c1b10', '#9c3115', '#d4661c', '#ffab34', '#ffe6a2'],
  // the pools of light a torch throws, darkest ring out to the white core
  torchGlow:['#2a1410', '#4a2012', '#6e3315', '#9c4e1a', '#c87024', '#eda03e'],
  // and the one the moon lays down: the same shape in the cold register
  moonGlow: ['#0a1224', '#111e38', '#1a2d50', '#26406c', '#385a8e', '#6a90c0'],
  // stirred water at night lights itself up — the boil where he went under
  biolum:   ['#06232c', '#0b3d46', '#136068', '#1f8f92', '#43c8bc', '#a8f4e6'],
  gold: '#ffe48f', goldD: '#e0a838', red: '#c4202c', redL: '#e8515a',
  bone: '#e8e4d8', white: '#f2f6fa', steel: '#8a9ab5',
  // signature colours for the two mini cards
  miniCyan: ['#071a20', '#0d2d38', '#145060', '#1d7d92', '#34b4c4', '#8ef0f6'],
  miniRed:  ['#1a0508', '#360a0e', '#5c1014', '#8c1a1c', '#c4202c', '#ff8a6a'],
};

const HZ = 190;                     // horizon / waterline in the side-on shots
const BAR = 26;                     // letterbox height
const WLY = 238;                    // where the wreck disappears under the sea

// =========================================================================
//  BAKED ART
// =========================================================================
const A = {};
let BUILT = false;

// ---- the bay, seen from the shore --------------------------------------
// One 640x360 canvas per lighting state.  Nothing here is ever redrawn.
const TORCH = [];                   // torch anchors on the village, filled once
function drawHut(x, dx, dy, w, h, col, rim) {
  P(x, col, dx, dy - h, w, h);
  P(x, rim, dx, dy - h, 1, h);
  tri(x, col, dx - 4, dy - h, dx + w + 4, dy - h, dx + w / 2, dy - h - 9);
  tri(x, rim, dx - 4, dy - h, dx + w / 2, dy - h, dx + w / 2, dy - h - 9);
  P(x, rim, dx - 4, dy - h - 1, w + 8, 1);
}
function drawVillage(x, deckY, col, rim) {
  // the long pier, walking out over the water on stilts
  P(x, col, -2, deckY, 214, 4);
  P(x, rim, -2, deckY, 214, 1);
  for (let sx = 4; sx < 212; sx += 11) {
    P(x, col, sx, deckY + 4, 3, 26 + ((sx * 7) % 9));
    P(x, col, sx - 3, deckY + 9, 9, 1);
  }
  // huts, back to front
  drawHut(x, 12, deckY, 30, 20, col, rim);
  drawHut(x, 54, deckY, 22, 15, col, rim);
  drawHut(x, 86, deckY, 34, 24, col, rim);
  drawHut(x, 132, deckY, 24, 17, col, rim);
  drawHut(x, 166, deckY, 30, 21, col, rim);
  // drying racks and a net between two poles
  P(x, col, 44, deckY - 14, 2, 14); P(x, col, 50, deckY - 10, 2, 10);
  for (let i = 0; i < 6; i++) P(x, col, 45, deckY - 13 + i * 2, 6, 1);
  // the chief's pole: a tall mast with a shark jaw lashed to the top
  P(x, col, 124, deckY - 56, 3, 56);
  P(x, col, 118, deckY - 56, 15, 2);
  for (let i = 0; i < 5; i++) { P(x, col, 119 + i * 3, deckY - 52, 2, 5); P(x, rim, 119 + i * 3, deckY - 52, 2, 1); }
  TORCH.length = 0;
  TORCH.push([10, deckY - 3], [62, deckY - 4], [104, deckY - 28], [128, deckY - 58], [172, deckY - 25], [202, deckY - 3]);
}
function drawFarBoat(x, bx, by, col, rim, broke) {
  P(x, col, bx, by, 24, 5);
  P(x, col, bx + 2, by - 3, 18, 3);
  P(x, rim, bx, by, 24, 1);
  if (broke) { LN(x, col, bx + 12, by - 2, bx + 22, by - 16); P(x, col, bx + 6, by - 8, 2, 8); }
  else { P(x, col, bx + 11, by - 17, 2, 17); P(x, rim, bx + 13, by - 16, 5, 6); }
}
const SEA_CACHE = {};
function seaLayer(seaRamp, opt) {
  const chop = opt.chop || BP.foam[0];
  // the road under the key light.  A sun gives it its own x; a moon has to be
  // told, because its disc is drawn separately.
  const sun = opt.sun ? opt.sun[0] : (opt.roadX === undefined ? -1 : opt.roadX);
  const chopR = Array.isArray(chop) ? chop : [chop];
  const glows = opt.glows || [];
  const key = seaRamp.join('') + chopR.join('') + sun + (opt.road || '') + (opt.road2 || '') +
              (opt.roadW || 0) + (opt.roadD || 0) +
              glows.map(g => g[0] + g[1].join('') + g[2] + (g[3] || 0)).join('|');
  if (SEA_CACHE[key]) return SEA_CACHE[key];
  const H = 360 - HZ, b = pixBuf(640, H);
  const cols = seaRamp.map(hexToRgb), n = cols.length;
  for (let y = 0; y < H; y++) {
    const u = y / (H - 1);
    for (let px = 0; px < 640; px++) {
      let v = 1 - Math.pow(u, 0.62) + (hash2(px >> 2, y) - 0.5) * 0.12;
      if (v < 0) v = 0; else if (v > 1) v = 1;
      const fi = v * (n - 1);
      let i = Math.floor(fi);
      if (bay(px, y + HZ) < fi - i) i++;
      if (i < 0) i = 0; else if (i > n - 1) i = n - 1;
      pset(b, cols[i], px, y);
    }
  }
  // chop: flat dashes, longer and sparser as the water comes towards us, and
  // cooling as it does — the crests near the horizon still hold the sky.
  const CH_ = chopR.map(hexToRgb);
  for (let y = 2; y < H; y++) {
    const u = y / H, step = 3 + R(u * 5), len = 1 + R(u * 5);
    let ci = Math.round((1 - Math.pow(u, 0.5)) * (CH_.length - 1));
    if (ci < 0) ci = 0; else if (ci > CH_.length - 1) ci = CH_.length - 1;
    const C0 = CH_[ci], C1 = CH_[Math.max(0, ci - 1)];
    let sx = R(hash2(y, 91) * 40);
    while (sx < 640) {
      if (hash2(sx * 3 + y, y * 7 + 11) < 0.42) {
        const C = bay(sx, y + HZ) < 0.5 ? C0 : C1;
        for (let d = 0; d < len; d++) pset(b, C, sx + d, y);
      }
      sx += step + R(hash2(sx, y) * 9);
    }
  }
  // the light on the water under the sun, a hard dithered road
  if (sun >= 0) {
    const RD = hexToRgb(opt.road || (opt.sun ? opt.sun[3] : '#ffffff'));
    const RD2 = hexToRgb(opt.road2 || (opt.sun && opt.sun[4]) || opt.road || '#ffffff');
    const RW = opt.roadW || 62, RDN = opt.roadD === undefined ? 0.72 : opt.roadD;
    for (let y = 0; y < H; y++) {
      const u = y / H, sp = 6 + u * RW, len = 1 + R(u * 2);
      for (let dx = -sp; dx <= sp; dx += 1) {
        const px = R(sun + dx);
        if (px < 0 || px > 639) continue;
        const fall = 1 - Math.abs(dx) / sp;
        if (bay(px, y + HZ) > fall * (RDN - u * RDN * 0.62)) continue;
        const C = fall > 0.62 && u < 0.5 ? RD2 : RD;
        for (let d = 0; d < len; d++) pset(b, C, px + d, y);
      }
    }
  }
  // every other light on the shore also lands on the water: the lamps along
  // the pier.  Same posterized road, narrower and banded by its own ramp.
  for (const g of glows) {
    const gx = g[0], ramp = g[1].map(hexToRgb), reach = g[2] || 0.55, wid = g[3] || 26;
    const base = g[4] === undefined ? 3 : g[4], dens = g[5] === undefined ? 0.92 : g[5];
    const pw = g[6] === undefined ? 1 : g[6];
    for (let y = 0; y < H; y++) {
      const u = y / H;
      if (u > reach) break;
      const sp = base + u * wid, len = 1 + R(u * 2);
      const depth = Math.pow(1 - u / reach, pw);
      for (let dx = -sp; dx <= sp; dx += 1) {
        const px = R(gx + dx);
        if (px < 0 || px > 639) continue;
        const fall = (1 - Math.abs(dx) / sp) * depth;
        if (fall <= 0) continue;
        if (bay(px, y + HZ) > fall * dens) continue;
        let i = Math.floor(fall * ramp.length);
        if (i < 0) i = 0; else if (i > ramp.length - 1) i = ramp.length - 1;
        for (let d = 0; d < len; d++) pset(b, ramp[i], px + d, y);
      }
    }
  }
  return SEA_CACHE[key] = pixTo(b);
}
// a dithered pool of warm light thrown onto whatever is already there
function glowPool(x, cx0, cy0, rx, ry, ramp, bias) {
  bias = bias === undefined ? 0.9 : bias;
  for (let y = -ry; y <= ry; y++) for (let dx = -rx; dx <= rx; dx++) {
    const q = (dx / rx) * (dx / rx) + (y / ry) * (y / ry);
    if (q > 1) continue;
    const f = 1 - Math.sqrt(q);
    if (bay(cx0 + dx, cy0 + y) > f * bias) continue;
    let i = Math.floor(f * ramp.length);
    if (i < 0) i = 0; else if (i > ramp.length - 1) i = ramp.length - 1;
    P(x, ramp[i], cx0 + dx, cy0 + y, 1, 1);
  }
}
function buildBay(skyRamp, seaRamp, opt) {
  const c = can(640, 360), x = cx2(c);
  // ---- sky: posterized bands with a little ordered break-up.  the ramp
  // position only depends on the row, so it is computed once per row.
  {
    const b = pixBuf(640, HZ), cols = skyRamp.map(hexToRgb), n = cols.length;
    for (let y = 0; y < HZ; y++) {
      const base = Math.pow(y / (HZ - 1), opt.skyPow || 0.72) * (n - 1);
      for (let px = 0; px < 640; px++) {
        let fi = base + (hash2(px >> 3, y >> 1) - 0.5) * 0.09 * (n - 1);
        if (fi < 0) fi = 0; else if (fi > n - 1) fi = n - 1;
        let i = Math.floor(fi);
        if (bay(px, y) < fi - i) i++;
        if (i > n - 1) i = n - 1;
        pset(b, cols[i], px, y);
      }
    }
    x.drawImage(pixTo(b), 0, 0);
  }
  // stars, punched in before the clouds so cloud slabs occlude them
  if (opt.stars) {
    for (let i = 0; i < opt.stars; i++) {
      const sx = R(hash2(i, 3) * 640), sy = R(hash2(i, 11) * (HZ - 64));
      const b = hash2(i, 19);
      P(x, b > 0.88 ? '#e8f0ff' : b > 0.62 ? '#9fb6e0' : '#6a7fb0', sx, sy, 1, 1);
      if (b > 0.94) { P(x, '#7a90c0', sx - 1, sy, 1, 1); P(x, '#7a90c0', sx + 1, sy, 1, 1); }
    }
  }
  // cloud slabs, flat and hard-edged.  Each one is lit underneath by whatever
  // is burning on the horizon and cold on top, in three posterized steps.
  const n_ = skyRamp.length;
  for (let i = 0; i < 8; i++) {
    const cy = 30 + i * 18 + (i & 1) * 6, cw = 46 + ((i * 53) % 110);
    const cx0 = ((i * 151) % 660) - 30;
    const deep = Math.min(n_ - 1, Math.round(Math.pow(cy / HZ, opt.skyPow || 0.72) * (n_ - 1)));
    const lit = mixHex(skyRamp[Math.min(n_ - 1, deep + 2)], opt.cloudLit || skyRamp[n_ - 1], 0.4);
    const mid = mixHex(skyRamp[Math.max(0, deep - 2)], BP.ink, 0.06);
    const dark = mixHex(skyRamp[Math.max(0, deep - 4)], BP.ink, 0.14);
    const rows = 3 + (i & 1);
    let w0 = 0, sx0 = 0;
    for (let r = 0; r < rows; r++) {
      const w = R(cw * (1 - r * 0.20)), sx = cx0 + R(r * 7 + (hash2(i, r) - 0.5) * 16);
      if (r === 0) { w0 = w; sx0 = sx; }
      P(x, r === 0 ? mid : r === rows - 1 ? dark : mixHex(mid, dark, 0.5), sx, cy - r * 2, w, 2);
    }
    // the hot lip underneath, where the low sun is still reaching it
    for (let px = 0; px < w0; px++) {
      const f = Math.sin((px / w0) * Math.PI);
      if (bay(sx0 + px, cy) > f * 0.7) continue;
      P(x, opt.cloudLip || lit, sx0 + px, cy + 2, 1, 1);
      if (bay(sx0 + px, cy + 1) < f * 0.3) P(x, lit, sx0 + px, cy + 1, 1, 1);
    }
  }
  if (opt.sun) {
    disc(x, opt.sun[0], opt.sun[1], opt.sun[2], opt.sun[3]);
    disc(x, opt.sun[0], opt.sun[1], opt.sun[2] - 3, opt.sun[4]);
  }
  // the moon: a hard disc with two maria bitten out of it and a thin halo, so
  // it is a body in the sky and not a hole punched in the backdrop
  if (opt.moon) {
    const mx = opt.moon[0], my = opt.moon[1], mr = opt.moon[2];
    for (let r = mr + 4; r > mr; r--) {
      const a = (mr + 5 - r) / 5;
      for (let d = 0; d < 360; d += 3) {
        const px = mx + R(Math.cos(d * 0.01745) * r), py = my + R(Math.sin(d * 0.01745) * r);
        if (bay(px, py) > a * 0.35) continue;
        P(x, '#182448', px, py, 1, 1);
      }
    }
    disc(x, mx, my, mr, '#6b7ba6');
    disc(x, mx, my, mr - 1, '#b8c4e2');
    disc(x, mx, my, mr - 4, '#e6ecff');
    P(x, '#94a2c8', mx - R(mr * 0.35), my - R(mr * 0.2), 3, 3);
    P(x, '#94a2c8', mx + R(mr * 0.25), my + R(mr * 0.35), 4, 2);
    P(x, '#94a2c8', mx + R(mr * 0.1), my - R(mr * 0.55), 2, 2);
  }
  // ---- the sea, in ONE pixel pass: ramp, chop and the road under the sun.
  // as fillRect-per-dash this alone was most of the bake budget.
  x.drawImage(seaLayer(seaRamp, opt), 0, HZ);
  // ---- the village on its pier, standing in the water
  drawVillage(x, HZ - 16, BP.vill, opt.rim || BP.villR);
  drawFarBoat(x, 300, HZ - 4, BP.vill, opt.rim || BP.villR, opt.broke);
  drawFarBoat(x, 470, HZ - 2, BP.vill, opt.rim || BP.villR, opt.broke);
  // ---- the light the village makes.  Baked: the flicker on top of it is a
  // handful of pixels per frame, this is the part that costs anything.
  if (opt.torchPools) {
    for (let i = 0; i < TORCH.length; i++) {
      const tx = TORCH[i][0], ty = TORCH[i][1] - 4;
      glowPool(x, tx, ty, 12, 9, BP.torchGlow, 0.55);
      glowPool(x, tx, ty, 5, 4, BP.fire, 0.95);
    }
    // the deck underside catches it, and the stilts stand in a warm haze
    for (let px = -2; px < 212; px++) {
      if (bay(px, HZ - 11) > 0.40) continue;
      P(x, BP.torchGlow[3], px, HZ - 12, 1, 1);
    }
  }
  return c;
}
// The water closing over something floating in it: a band that starts sparse
// and goes solid, baked once so a scene can blit it instead of writing ten
// thousand pixels a frame.
function buildVeil(w, h, col, col2) {
  const c = can(w, h), x = cx2(c);
  for (let px = 0; px < w; px++) for (let y = 0; y < h; y++) {
    const f = y / (h - 1);
    if (bay(px, y) > 0.10 + f * 1.05) continue;
    P(x, f > 0.6 ? (col2 || col) : col, px, y, 1, 1);
  }
  return spr(c, w / 2, 0);
}

// the dark that closes the corners of a cut: baked once, blitted, instead of
// forty-eight fillRects a frame
function buildVignette() {
  const c = can(640, 360), x = cx2(c);
  for (let i = 0; i < 12; i++) {
    const inset = i * 6, a = 0.10 - i * 0.007;
    if (a <= 0) break;
    x.fillStyle = rgbaq('#04060e', a);
    x.fillRect(0, inset, 640, 1); x.fillRect(0, 359 - inset, 640, 1);
    x.fillRect(inset, 0, 1, 360); x.fillRect(639 - inset, 0, 1, 360);
  }
  return c;
}
// scrolling swell: 640x1 strips of dashes, wrapped each frame
function buildSwellRow(seed, col) {
  const c = can(640, 1), x = cx2(c);
  for (let i = 0; i < 640; i++) if (hash2(i, seed * 31 + 7) < 0.13) P(x, col, i, 0, 2 + (i % 4), 1);
  return c;
}

// ---- the shark, seen from the side, mid-leap -----------------------------
function buildSharkSide() {
  const W = 140, H = 56;
  const f = blobField(W, H, [
    { x: 30, y: 28, rx: 8, ry: 5 },
    { x: 44, y: 27, rx: 13, ry: 10 },
    { x: 62, y: 26, rx: 16, ry: 13 },
    { x: 82, y: 26, rx: 15, ry: 12 },
    { x: 100, y: 27, rx: 12, ry: 10 },
    { x: 116, y: 29, rx: 9, ry: 7 },
    { x: 128, y: 31, rx: 5, ry: 4 },
  ]);
  const ramp = ['#0a0e16', '#131a26', '#1e2b3c', '#2d3f56', '#435a76'];
  const body = shadeBlob(W, H, f, ramp, { outline: BP.ink, smooth: 3, lift: 0.15 });
  const c = can(W, H), x = cx2(c);
  // far side fins first, so the body sits over their roots
  triOutlined(x, ramp[1], BP.ink, [86, 34], [64, 50], [74, 34]);
  triOutlined(x, ramp[1], BP.ink, [30, 28], [11, 8], [24, 26]);      // upper caudal lobe
  triOutlined(x, ramp[0], BP.ink, [30, 31], [14, 48], [26, 33]);    // lower caudal lobe
  triOutlined(x, ramp[1], BP.ink, [52, 36], [40, 46], [46, 36]);    // pelvic
  x.drawImage(body.c, 0, 0);
  // dorsal, swept back over the spine
  triOutlined(x, ramp[2], BP.ink, [70, 15], [52, 18], [56, 3]);
  // near pectoral, broad, dropped low
  triOutlined(x, ramp[3], BP.ink, [94, 32], [78, 33], [66, 52]);
  // countershading: pale underneath, filling in rather than speckling
  for (let y = 33; y < H - 1; y++) for (let px = 16; px < 132; px++) {
    const i = y * W + px; if (f[i] <= 0.04) continue;
    if (f[i + W] <= 0.04 || bay(px, y) < (y - 33) / 11) P(x, '#6d8093', px, y, 1, 1);
  }
  for (let y = 38; y < H - 1; y++) for (let px = 20; px < 128; px++) {
    const i = y * W + px; if (f[i] <= 0.04) continue;
    if (bay(px, y) < (y - 38) / 5) P(x, '#8fa2b5', px, y, 1, 1);
  }
  // gill slits
  for (let g = 0; g < 5; g++) {
    const gx = 110 - g * 4;
    for (let y = 20; y <= 32; y++) { const i = y * W + gx; if (f[i] > 0.22) P(x, '#101822', gx, y, 1, 1); }
  }
  // scars along the back
  for (let i = 0; i < 5; i++) P(x, '#93a8bd', 66 + i * 3, 15 + i, 1, 1);
  for (let i = 0; i < 4; i++) P(x, '#93a8bd', 44 + i * 2, 34 - i, 1, 1);
  // the jaws, hanging open — this is the shot the whole beat is for.
  // the lower jaw drops clear of the body; the cavity stays inside it.
  triOutlined(x, ramp[1], BP.ink, [108, 33], [136, 29], [117, 48]);
  tri(x, '#25080e', 110, 31, 134, 28, 118, 44);
  for (let y = 24; y <= 34; y++) for (let px = 100; px < 136; px++) {
    const i = y * W + px; if (f[i] <= 0.02) continue;
    if (y > 27 + (px - 100) * 0.04 && y < 30 + (px - 100) * 0.30) P(x, '#25080e', px, y, 1, 1);
  }
  for (let i = 0; i < 8; i++) {                       // upper teeth, pointing down
    const tx = 110 + i * 3, ty = 28 + R(i * 0.12);
    tri(x, BP.bone, tx, ty, tx + 2, ty, tx + 1, ty + 4);
  }
  for (let i = 0; i < 7; i++) {                       // lower teeth, pointing up
    const tx = 112 + i * 3, ty = 41 - R(i * 1.7);
    tri(x, BP.bone, tx, ty, tx + 2, ty, tx + 1, ty - 4);
  }
  // eye: black, wet, with a red spark in it
  P(x, BP.ink, 108, 20, 6, 6); P(x, '#2a0d12', 109, 21, 4, 4); P(x, '#ff3a2a', 110, 22, 2, 2);
  P(x, BP.white, 110, 21, 2, 1);
  return spr(c, 70, 28);
}
// a short piece of the same animal — the back and dorsal, for the close-up
function buildSharkBack() {
  const W = 160, H = 54, c = can(W, H), x = cx2(c);
  const top = new Int16Array(W);
  for (let px = 0; px < W; px++) {
    const u = px / (W - 1);
    const ty = 46 - R(Math.sin(Math.pow(u, 0.75) * Math.PI) * 24);
    top[px] = ty;
    P(x, '#151e2b', px, ty, 1, H - ty);
    P(x, '#243347', px, ty, 1, 3);
    P(x, '#3a5070', px, ty, 1, 1);
    for (let y = H - 14; y < H; y++) if (bay(px, y) < (y - (H - 14)) / 11) P(x, '#33455a', px, y, 1, 1);
  }
  // the dorsal, swept back, standing well clear of the crest
  triOutlined(x, '#243347', BP.ink, [86, top[86] + 4], [44, top[44] + 4], [52, 0]);
  triOutlined(x, '#141d29', BP.ink, [86, top[86] + 4], [52, 0], [66, top[66] + 2]);
  for (let i = 0; i < 26; i++) P(x, '#3f5776', 53 + i * 1.3 | 0, 1 + i, 1, 1);
  // gill slits, forward
  for (let g = 0; g < 4; g++) {
    const gx = 138 - g * 6;
    for (let y = top[gx] + 3; y < top[gx] + 16 && y < H; y++) P(x, '#0b1119', gx, y, 1, 1);
  }
  for (let i = 0; i < 6; i++) P(x, '#5f738c', 96 + i * 5, top[96 + i * 5] + 4 + i, 2, 1);
  // foam breaking along the waterline at the bottom
  for (let px = 0; px < W; px++) for (let y = H - 10; y < H; y++) {
    if (hash2(px * 5 + y, y * 3) > 0.30 + (y - (H - 10)) / 13) continue;
    P(x, BP.foam[(px + y) & 1 ? 3 : 2], px, y, 1, 1);
  }
  // water sliding back off the crest
  for (let px = 20; px < W - 20; px += 3) {
    if (hash2(px, 17) > 0.4) continue;
    P(x, BP.foam[2], px, top[px] + 2, 1, 3 + R(hash2(px, 31) * 7));
  }
  return spr(c, W / 2, H);
}

// ---- the Village Chief, side on ----------------------------------------
function buildChiefSide() {
  const c = can(30, 54), x = cx2(c);
  x.translate(0, 14);                 // leave room over his head for the crown
  const SK = '#d9a06a', SKD = '#a9713f', SKX = '#7a4a22';
  const LEA = '#6d4527', LEAD = '#472c17';
  // far leg, gripping the flank
  cap(x, SKX, 12, 27, 6, 36, 4);
  P(x, SKX, 4, 35, 6, 3);
  // near leg
  cap(x, SK, 15, 27, 20, 36, 5);
  P(x, SKD, 17, 35, 7, 3);
  // loincloth with a bone fringe
  P(x, LEAD, 8, 22, 13, 7); P(x, LEA, 8, 22, 13, 2);
  for (let i = 0; i < 6; i++) P(x, BP.bone, 9 + i * 2, 28, 1, 4);
  // torso: long, bare, painted
  P(x, SK, 9, 12, 12, 11);
  P(x, SKD, 9, 12, 2, 11);
  P(x, SKD, 9, 21, 12, 2);
  P(x, BP.red, 10, 15, 10, 1); P(x, BP.red, 11, 18, 8, 1);
  for (let i = 0; i < 6; i++) P(x, BP.bone, 10 + i * 2, 12 + (i & 1), 1, 2);
  cap(x, LEAD, 10, 13, 20, 20, 2);                             // harness
  // far arm, down on the fin
  cap(x, SKX, 10, 15, 4, 23, 3);
  // near arm, out and up: the spear hand, clear of his chest
  cap(x, SK, 18, 14, 25, 4, 3);
  P(x, BP.goldD, 24, 3, 3, 3);
  // head
  P(x, SK, 9, 3, 11, 10);
  P(x, SKX, 9, 3, 2, 10);
  P(x, SKD, 9, 11, 11, 2);
  P(x, BP.red, 9, 5, 11, 3);                                   // the band over the eyes
  P(x, BP.bone, 12, 6, 3, 2); P(x, BP.bone, 16, 6, 3, 2);
  P(x, BP.ink, 13, 6, 2, 2); P(x, BP.ink, 17, 6, 2, 2);
  P(x, BP.bone, 13, 11, 6, 1);                                 // bared teeth
  // headdress: band + a fan of feathers
  P(x, LEAD, 8, 1, 13, 3); P(x, BP.goldD, 8, 2, 13, 1);
  const FE = ['#c4202c', '#e8d3ae', '#e8515a', '#e8d3ae', '#c4202c'];
  for (let i = 0; i < 5; i++) {
    const bx = 9 + i * 2, hgt = 9 + (i === 2 ? 5 : (i === 1 || i === 3) ? 2 : 0);
    LN(x, FE[i], bx, 2, bx + (i - 2) * 3, 2 - hgt, 2);
    P(x, BP.bone, bx + (i - 2) * 3, 1 - hgt, 1, 2);
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  return spr(outlineIt(c, BP.ink), 15, 52);
}
function buildSpear() {
  const c = can(40, 9), x = cx2(c);
  P(x, '#8f6038', 2, 4, 30, 2);
  P(x, '#6d4527', 2, 6, 30, 1);
  tri(x, BP.bone, 32, 1, 32, 8, 39, 4);
  P(x, '#c4202c', 26, 3, 2, 4);
  P(x, '#e8d3ae', 22, 2, 1, 5);
  return spr(outlineIt(c, BP.ink), 20, 4);
}

// =========================================================================
//  THE CAST — she and the otter are NOT drawn in this file.  They are
//  CH.side and CH.otterStand out of chars.js, composed here exactly the way
//  chars.js composes them, so every cinematic stays on model when the cast
//  is rebuilt.  What IS new is the light: each beat bakes its own copy of
//  every part, darkened to the ambient of that scene and then given the rim
//  of whatever is actually burning in it.
// =========================================================================
const MSC = 2;                      // the cast, two screen pixels per art pixel

// the hat comes off in the defeat, so it is cut out of the cast's own head
// rather than drawn again.  Same cut death.js uses.
function hatCut() { return Math.max(3, R(CH.otterHead.c.height * 0.36)); }
function cutHat() {
  const src = CH.otterHead, c0 = cloneSpr(src), W = src.c.width, cut = hatCut();
  const d = cx2(c0).getImageData(0, 0, W, cut).data;
  let x0 = W, x1 = -1, y0 = cut, y1 = -1;
  for (let y = 0; y < cut; y++) for (let px = 0; px < W; px++) {
    if (d[(y * W + px) * 4 + 3] < 24) continue;
    if (px < x0) x0 = px; if (px > x1) x1 = px;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < x0) { x0 = 0; x1 = W - 1; y0 = 0; y1 = cut - 1; }
  const c = can(x1 - x0 + 1, y1 - y0 + 1);
  cx2(c).drawImage(c0, -x0, -y0);
  return spr(c, (x1 - x0 + 1) / 2, (y1 - y0 + 1) / 2);
}
// his head with the hat taken off it: the felt cleared and the skull closed
// over with his own fur, so a bare head still reads as a head.
function cutBareHead(exp) {
  const src = CH.otterHead, c = headCan(exp), x = cx2(c);
  const W = c.width, H = c.height, cut = hatCut();
  x.clearRect(0, 0, W, cut);
  const d = x.getImageData(0, 0, W, H).data;
  let lx = W, rx = -1;
  for (let q = cut; q < Math.min(H, cut + 3); q++) for (let px = 0; px < W; px++) {
    if (d[(q * W + px) * 4 + 3] < 24) continue;
    if (px < lx) lx = px; if (px > rx) rx = px;
  }
  if (rx <= lx) { lx = R(W * 0.18); rx = R(W * 0.82); }
  const cxp = (lx + rx) / 2, rw = (rx - lx) / 2, rh = Math.max(2, R(H * 0.20));
  for (let y = -rh; y <= 1; y++) {
    const k = 1 - (y / (rh + 0.6)) * (y / (rh + 0.6)); if (k <= 0) continue;
    const hw = R(rw * Math.sqrt(k));
    for (let px = -hw; px <= hw; px++) {
      const u = Math.abs(px) / (hw + 1), v = (-y) / rh;
      const col = (u > 0.84 || v > 0.92) ? CPAL.out : v > 0.55 ? CPAL.furL : u < 0.55 ? CPAL.fur : CPAL.furD;
      P(x, col, R(cxp + px), cut + y, 1, 1);
    }
  }
  P(x, CPAL.out, R(cxp - rw - 1), cut - rh + 1, 2, 3); P(x, CPAL.furDD, R(cxp - rw), cut - rh + 2, 1, 1);
  P(x, CPAL.out, R(cxp + rw), cut - rh + 1, 2, 3); P(x, CPAL.furDD, R(cxp + rw), cut - rh + 2, 1, 1);
  return spr(outlineIt(c, CPAL.out), src.ax, src.ay);
}
// a snapshot of the cast's live head, with one expression baked onto it, at
// one art pixel per world unit like the rest of this file's cast
function headSpr(exp) {
  const buf = CH.headWithFace(exp || 'idle', false, 0, false);
  const raw = can(buf.width, buf.height);
  cx2(raw).drawImage(buf, 0, 0, buf.width, buf.height, 0, 0, buf.width, buf.height);
  const H = CH.otterHead;
  return cast1x({ c: raw, w: H.w, h: H.h, ax: H.ax, ay: H.ay });
}
function headCan(exp) { return cloneSpr(headSpr(exp)); }

// chars.js rasterizes most of the cast at DETAIL art pixels per world unit
// and patches drawImage to scale those canvases down on the way out.  The
// side-on set and his head and body are deliberate exceptions and stay at one
// art pixel per world unit; his arm and his tail are not.  Everything here
// bakes rim lights in canvas pixels and then places the result with world
// anchors, so every part has to be square with the world grid first — and the
// whole side-on cast has to be one resolution or his sleeve comes out finer
// than her hide.  Same 2x2 reduction chars.js uses: the most opaque sample in
// each block, so nothing thin drops out.
function cast1x(s) {
  const W = Math.max(1, R(s.w)), H = Math.max(1, R(s.h));
  if (s.c.width === W && s.c.height === H) return s;
  const SW = s.c.width, SH = s.c.height, k = SW / W;
  const src = cx2(can(SW, SH));
  src.drawImage(s.c, 0, 0, SW, SH, 0, 0, SW, SH);     // 8-arg: no hi-res bridge
  const d = src.getImageData(0, 0, SW, SH).data;
  const c = can(W, H), x = cx2(c);
  const img = x.createImageData(W, H), o = img.data;
  for (let y = 0; y < H; y++) for (let px = 0; px < W; px++) {
    let best = -1, bi = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const sx = R(px * k + dx), sy = R(y * k + dy);
      if (sx >= SW || sy >= SH) continue;
      const q = (sy * SW + sx) * 4;
      if (d[q + 3] > best) { best = d[q + 3]; bi = q; }
    }
    const q = (y * W + px) * 4;
    o[q] = d[bi]; o[q + 1] = d[bi + 1]; o[q + 2] = d[bi + 2]; o[q + 3] = d[bi + 3];
  }
  x.putImageData(img, 0, 0);
  return spr(c, s.ax, s.ay);
}

// darken a part to a scene's ambient, then paint its lights back onto the
// edges.  dirs entries are [lx, ly, hot, warm, depth] and POINT AT THE LIGHT
// in the sprite's own space — mirror them yourself for a mirrored draw.
function litPart(s, dark, dirs, edge) {
  let c = cloneSpr(s);
  if (dark) c = tintCanvas(c, dark[0], dark[1]);
  // A tint takes the outline down with everything else, and a figure with no
  // outline left has nothing holding its silhouette on the side the light
  // does not reach.  Put the edge back before the rims, so the rims overwrite
  // it only where the light actually lands.
  if (edge !== null) darkEdge(c, edge || '#05060f');
  if (dirs) for (const d of dirs) c = rimLight(c, d[0], d[1], d[2], d[3], d[4] === undefined ? 1 : d[4]);
  return spr(c, s.ax, s.ay);
}
// re-ink the outermost opaque pixel all the way round
function darkEdge(c, col) {
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
    d[q] = C[0]; d[q + 1] = C[1]; d[q + 2] = C[2]; d[q + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
// One lighting of her: the four parts chars.js builds her out of, so the
// fluke can still beat and the flippers can still swing.
//  opt = { dark, dirs, far, scarred }
function herLit(opt) {
  const S = CH.side, dk = opt.dark, dr = opt.dirs, eg = opt.edge;
  return {
    body: litPart(cast1x(opt.scarred ? S.bodyScar : S.body), dk, dr, eg),
    fluke: litPart(cast1x(S.fluke), dk, dr, eg),
    flip: litPart(cast1x(S.flip), dk, dr, eg),
    flipFar: litPart(cast1x(S.flipFar), dk, opt.far || null, eg),
    belly: opt.belly ? litPart(cast1x(S.belly), dk, dr, eg) : null,
  };
}
// and one of him: torso, arm, tail, and a head with a fixed expression
function himLit(opt) {
  const dk = opt.dark, dr = opt.dirs, eg = opt.edge;
  return {
    stand: litPart(cast1x(CH.otterStand), dk, dr, eg),
    arm: litPart(cast1x(CH.otterArm), dk, dr, eg),
    tail: litPart(cast1x(CH.otterTail), dk, opt.far || dr, eg),
    head: litPart(headSpr(opt.exp), dk, dr, eg),
    bare: opt.bare ? litPart(cutBareHead(opt.exp), dk, dr, eg) : null,
    hat: opt.bare ? litPart(cutHat(), dk, dr, eg) : null,
  };
}
// Compose her out of the lit parts, in chars.js's own order and at its own
// offsets.  m: {x,y,rot,flip,scale,phase,tailAmp,flipperA,exp,blink,belly}
function drawHer(ctx, L, m, t) {
  const S = CH.side;
  ctx.save();
  ctx.translate(R(m.x), R(m.y));
  if (m.rot) ctx.rotate(m.rot);
  const k = m.scale === undefined ? MSC : m.scale;
  ctx.scale(m.flip ? -k : k, k * (m.sy || 1));
  if (m.alpha !== undefined) ctx.globalAlpha = qa(m.alpha);
  const ph = m.phase || 0;
  const amp = m.tailAmp === undefined ? 0.22 : m.tailAmp;
  const fa = (m.flipperA === undefined ? 2.15 : m.flipperA) + Math.sin(ph + 0.9) * 0.24;
  ctx.save(); ctx.translate(S.shoX - 5, S.shoY - 4); ctx.rotate(fa - 0.22);
  ctx.drawImage(L.flipFar.c, -L.flipFar.ax, -L.flipFar.ay); ctx.restore();
  ctx.save(); ctx.translate(S.tailX, 0); ctx.rotate(Math.sin(ph) * amp);
  ctx.drawImage(L.fluke.c, -L.fluke.ax, -L.fluke.ay); ctx.restore();
  const b = m.belly && L.belly ? L.belly : L.body;
  ctx.drawImage(b.c, -b.ax, -b.ay);
  ctx.save(); ctx.translate(S.shoX, S.shoY); ctx.rotate(fa);
  ctx.drawImage(L.flip.c, -L.flip.ax, -L.flip.ay); ctx.restore();
  // the eye is the one thing the night does not get to take: drawn live, at
  // full strength, over the darkened body
  if (!m.belly && m.exp !== false) CH.sideFace(ctx, m.exp || 'calm', m.blink, t || 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}
// and him.  o: {x,y,flip,scale,rot,arms,hold,tail,headR,headX,headY,bare}
function drawHim(ctx, L, o) {
  ctx.save();
  ctx.translate(R(o.x), R(o.y));
  const k = o.scale === undefined ? MSC : o.scale;
  ctx.scale(o.flip ? -k : k, k);
  if (o.rot) ctx.rotate(o.rot);
  if (o.alpha !== undefined) ctx.globalAlpha = qa(o.alpha);
  const arms = o.arms || [-0.25, 0.35];
  ctx.save(); ctx.translate(-6, 4); ctx.rotate(2.9 + (o.tail || 0));
  ctx.drawImage(L.tail.c, -L.tail.ax, -L.tail.ay); ctx.restore();
  ctx.save(); ctx.translate(1, -1); ctx.rotate(arms[1]);
  ctx.drawImage(L.arm.c, -L.arm.ax, -L.arm.ay); ctx.restore();
  ctx.drawImage(L.stand.c, -L.stand.ax, -L.stand.ay);
  ctx.save(); ctx.translate(2, -2); ctx.rotate(arms[0]);
  ctx.drawImage(L.arm.c, -L.arm.ax, -L.arm.ay);
  if (o.hold) ctx.drawImage(o.hold.c, 9 - o.hold.ax, -o.hold.ay);
  ctx.restore();
  ctx.save(); ctx.translate(1 + (o.headX || 0), -11 + (o.headY || 0)); ctx.rotate(o.headR || 0);
  const hd = o.bare && L.bare ? L.bare : L.head;
  ctx.drawImage(hd.c, -hd.ax, -hd.ay);
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}
// The lamp she carries.  It turns up on her plate in four of these beats, so
// it is one sprite: a hurricane lamp in a brass cage, with its bail hook.
function buildLamp() {
  const c = can(13, 21), x = cx2(c);
  P(x, '#6d5a3a', 5, 0, 3, 2);                    // the hook
  P(x, '#8a7550', 5, 0, 1, 2);
  P(x, '#3a2a18', 2, 2, 9, 3);                    // the cap
  P(x, '#6d5a3a', 2, 2, 9, 1);
  P(x, '#241a10', 1, 5, 11, 12);                  // the cage
  P(x, '#ffe8a8', 2, 6, 9, 10);                   // the glass
  P(x, '#fff8dc', 4, 8, 4, 6);                    // the flame in it
  P(x, '#ffffff', 5, 9, 2, 3);
  for (let i = 0; i < 3; i++) P(x, '#3a2a18', 3 + i * 3, 5, 1, 12);   // cage bars
  P(x, '#3a2a18', 2, 17, 9, 3);                   // the base
  P(x, '#6d5a3a', 2, 17, 9, 1);
  return spr(outlineIt(c, BP.ink), 6, 18);
}

// She is also a memory once: the same body, knocked half out on a hard grid
// and drained into the cold.
function buildGhost() {
  const S = CH.side, B = cast1x(S.body);
  let c = cloneSpr(B);
  tintCanvas(c, '#0b3446', 0.82);
  darkEdge(c, '#04141e');
  // the rim goes on while she is still solid: knock the holes in her first
  // and every hole grows its own lit edge, which reads as a checkerboard
  c = rimLight(c, 0, -1, '#3f9cb0', '#175a6e', 2);
  const x = cx2(c), W = c.width, H = c.height;
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let px = 0; px < W; px++) {
    const i = (y * W + px) * 4; if (d[i + 3] < 9) continue;
    if (bay(px, y) > 0.90 - (y / (H - 1)) * 0.46) d[i + 3] = 0;
  }
  x.putImageData(img, 0, 0);
  return spr(c, B.ax, B.ay);
}

function buildRifle() {
  const c = can(26, 8), x = cx2(c);
  P(x, '#3f4756', 9, 2, 16, 2);                  // barrel
  P(x, '#6d7889', 9, 2, 16, 1);
  P(x, '#2a303c', 8, 1, 6, 4);                   // receiver
  P(x, '#5d6675', 8, 1, 6, 1);
  P(x, '#8f6038', 0, 2, 9, 4);                   // stock
  P(x, '#6d4527', 0, 4, 9, 2);
  P(x, '#b58a52', 1, 2, 7, 1);
  P(x, '#472c17', 7, 5, 4, 2);                   // trigger guard
  P(x, '#2a303c', 22, 1, 2, 2);                  // front sight
  return spr(outlineIt(c, BP.ink), 13, 4);
}

// ---- water furniture ----------------------------------------------------
function ringSprite(rx, ry, th, col) {
  const w = rx * 2 + 5, h = ry * 2 + 5, b = pixBuf(w, h), C = hexToRgb(col);
  const cx0 = rx + 2, cy0 = ry + 2, riy = Math.max(1, ry - th * 0.6), ri = Math.max(0, rx - th);
  for (let y = -ry; y <= ry; y++) {
    const q = 1 - (y / ry) * (y / ry); if (q <= 0) continue;
    const hw = Math.floor(rx * Math.sqrt(q));
    const q2 = 1 - (y / riy) * (y / riy);
    const lo = q2 > 0 ? Math.floor(ri * Math.sqrt(q2)) : 0;
    for (let sg = -1; sg <= 1; sg += 2) for (let d = lo; d <= hw; d++) {
      const px = cx0 + sg * d, py = cy0 + y;
      if (bay(px, py) * 0.55 + hash2(px >> 1, py) * 0.7 > 0.66) continue;
      pset(b, C, px, py);
    }
  }
  return spr(pixTo(b), cx0, cy0);
}
function discSprite(rx, ry, col, dens) {
  const w = rx * 2 + 4, h = ry * 2 + 4, b = pixBuf(w, h), C = hexToRgb(col);
  const cx0 = rx + 2, cy0 = ry + 2;
  for (let y = -ry; y <= ry; y++) {
    const q = 1 - (y / ry) * (y / ry); if (q <= 0) continue;
    const hw = Math.floor(rx * Math.sqrt(q));
    for (let d = -hw; d <= hw; d++) {
      const px = cx0 + d, py = cy0 + y;
      const fall = 1 - Math.sqrt((d / rx) * (d / rx) + (y / ry) * (y / ry));
      if (bay(px, py) > dens * (0.3 + fall)) continue;
      pset(b, C, px, py);
    }
  }
  return spr(pixTo(b), cx0, cy0);
}
function buildSpray(w, h, seed) {
  const b = pixBuf(w, h), CO = BP.foam.map(hexToRgb);
  for (let px = 0; px < w; px++) {
    const u = px / (w - 1);
    const top = h - Math.sin(u * Math.PI) * h * (0.62 + 0.38 * hash2(px >> 2, seed));
    for (let y = Math.floor(top); y < h; y++) {
      const dv = (y - top) / Math.max(1, h - top);
      if (hash2(px + seed * 131, y * 3) > 0.22 + dv * 0.72) continue;
      let ci = Math.floor((1 - dv) * CO.length + (bay(px, y) - 0.5) * 1.6);
      if (ci < 0) ci = 0; else if (ci > CO.length - 1) ci = CO.length - 1;
      pset(b, CO[ci], px, y);
    }
  }
  return spr(pixTo(b), w / 2, h);
}
// The frame the Chief is held in for his close-up.  Same bay, same hour, from
// down at the waterline: the sun sitting on the horizon just past his
// shoulder, his village a black ridge along it, and the sea running away
// under him.  Nothing in this shot is on fire.
function buildCloseBg() {
  const HZ2 = 244;
  const c = can(640, 360), x = cx2(c);
  // sky: the same dusk ramp, one stop down, so the card reads over it
  {
    const b = pixBuf(640, HZ2), cols = BP.skyDusk.map(hexToRgb), n = cols.length;
    for (let y = 0; y < HZ2; y++) {
      const base = Math.pow(y / (HZ2 - 1), 1.7) * (n - 1);
      for (let px = 0; px < 640; px++) {
        let fi = base + (hash2(px >> 3, y >> 1) - 0.5) * 0.09 * (n - 1);
        if (fi < 0) fi = 0; else if (fi > n - 1) fi = n - 1;
        let i = Math.floor(fi);
        if (bay(px, y) < fi - i) i++;
        if (i > n - 1) i = n - 1;
        pset(b, cols[i], px, y);
      }
    }
    x.drawImage(pixTo(b), 0, 0);
  }
  // hard cloud slabs, low and long, lit underneath
  for (let i = 0; i < 6; i++) {
    const cy = 40 + i * 30, cw = 92 + ((i * 97) % 150), cx0 = ((i * 211) % 720) - 70;
    P(x, '#3a1c3e', cx0, cy, cw, 3);
    P(x, '#2a1434', cx0 + 7, cy - 2, R(cw * 0.66), 2);
    for (let px = 0; px < cw; px++) {
      const f = Math.sin((px / cw) * Math.PI);
      if (bay(cx0 + px, cy) < f * 0.55) P(x, '#c4663e', cx0 + px, cy + 3, 1, 1);
      if (bay(cx0 + px, cy + 1) < f * 0.22) P(x, '#ffa860', cx0 + px, cy + 4, 1, 1);
    }
  }
  // the sun, sitting on the horizon, with a banded bloom round it
  for (let r = 74; r > 24; r--) {
    const f = 1 - (r - 24) / 50;
    for (let d = 0; d < 720; d += 2) {
      const px = 494 + R(Math.cos(d * 0.008727) * r), py = HZ2 - 10 + R(Math.sin(d * 0.008727) * r * 0.9);
      if (px < 0 || px > 639 || py < 0 || py >= HZ2) continue;
      if (bay(px, py) > f * f * 0.80) continue;
      P(x, f > 0.70 ? '#f0a95e' : f > 0.42 ? '#c4663e' : '#8a3a3c', px, py, 1, 1);
    }
  }
  disc(x, 494, HZ2 - 10, 24, '#ffbb6e');
  disc(x, 494, HZ2 - 10, 20, '#ffe0aa');
  disc(x, 494, HZ2 - 10, 12, '#fff4d8');
  // his village, a black ridge along the horizon with its lamps coming on
  P(x, '#08070f', 0, HZ2 - 6, 330, 6);
  const RIDGE = [[4, 16], [26, 11], [42, 19], [66, 9], [80, 14], [104, 22], [132, 12], [154, 17],
                 [180, 9], [200, 15], [228, 11], [252, 18], [280, 10], [302, 13]];
  for (const h of RIDGE) {
    const hx = h[0], hh = h[1], hw = 14 + (hh & 3);
    P(x, '#08070f', hx, HZ2 - 6 - hh, hw, hh);
    tri(x, '#08070f', hx - 4, HZ2 - 6 - hh, hx + hw + 4, HZ2 - 6 - hh, hx + hw / 2, HZ2 - 6 - hh - 6);
  }
  P(x, '#08070f', 116, HZ2 - 62, 3, 56); P(x, '#08070f', 108, HZ2 - 62, 18, 3);
  for (let i = 0; i < 7; i++) {
    const lx = 14 + i * 46;
    glowPool(x, lx, HZ2 - 9, 9, 6, BP.torchGlow, 0.44);
    P(x, BP.fire[3], lx, HZ2 - 11, 1, 2); P(x, BP.fire[4], lx, HZ2 - 10, 1, 1);
  }
  // the sea, running away under him, with the sun's road down the middle
  {
    const H = 360 - HZ2, b = pixBuf(640, H);
    const cols = BP.seaDusk.map(hexToRgb), n = cols.length;
    for (let y = 0; y < H; y++) {
      const u = y / (H - 1);
      for (let px = 0; px < 640; px++) {
        let v = 1 - Math.pow(u, 0.5) + (hash2(px >> 2, y) - 0.5) * 0.12;
        if (v < 0) v = 0; else if (v > 1) v = 1;
        const fi = v * (n - 1);
        let i = Math.floor(fi);
        if (bay(px, y + HZ2) < fi - i) i++;
        if (i < 0) i = 0; else if (i > n - 1) i = n - 1;
        pset(b, cols[i], px, y);
      }
    }
    const RD = hexToRgb('#b8603e'), RD2 = hexToRgb('#eb9a5e');
    for (let y = 0; y < H; y++) {
      const u = y / H, sp = 8 + u * 96, len = 1 + R(u * 3);
      for (let dx = -sp; dx <= sp; dx++) {
        const px = R(494 + dx); if (px < 0 || px > 639) continue;
        const fall = 1 - Math.abs(dx) / sp;
        if (bay(px, y + HZ2) > fall * (0.70 - u * 0.44)) continue;
        const C = fall > 0.62 && u < 0.5 ? RD2 : RD;
        for (let d = 0; d < len; d++) pset(b, C, px + d, y);
      }
    }
    const CH_ = BP.chopDusk.map(hexToRgb);
    for (let y = 2; y < H; y++) {
      const u = y / H, step = 3 + R(u * 6), len = 1 + R(u * 6);
      let ci = Math.round((1 - Math.pow(u, 0.5)) * (CH_.length - 1));
      if (ci < 0) ci = 0; else if (ci > CH_.length - 1) ci = CH_.length - 1;
      let sx = R(hash2(y, 91) * 40);
      while (sx < 640) {
        if (hash2(sx * 3 + y, y * 7 + 11) < 0.40) { const C = CH_[ci]; for (let d = 0; d < len; d++) pset(b, C, sx + d, y); }
        sx += step + R(hash2(sx, y) * 9);
      }
    }
    x.drawImage(pixTo(b), 0, HZ2);
  }
  // spindrift hanging in the low light
  for (let i = 0; i < 120; i++) {
    const ex = R(hash2(i, 7) * 640), ey = R(hash2(i, 23) * 320);
    const near = Math.abs(ex - 494) < 150 && Math.abs(ey - (HZ2 - 10)) < 120;
    P(x, near ? (hash2(i, 41) > 0.6 ? '#ffe6b8' : '#e8a35e') : '#5c4670', ex, ey, 1, 1);
  }
  // the corner darkening this plate wants, folded into it
  for (let i = 0; i < 18; i++) {
    const inset = i * 5, a = 0.14 - i * 0.008;
    if (a <= 0) break;
    x.fillStyle = rgbaq('#08051a', a);
    x.fillRect(0, inset, 640, 1); x.fillRect(0, 359 - inset, 640, 1);
    x.fillRect(inset, 0, 1, 360); x.fillRect(639 - inset, 0, 1, 360);
  }
  return c;
}

// ---- the mini-boss: a shape under the water -----------------------------
function buildMiniShade() {
  const W = 176, H = 92;
  const f = blobField(W, H, [
    { x: 34, y: 46, rx: 13, ry: 8 },
    { x: 56, y: 46, rx: 21, ry: 15 },
    { x: 84, y: 46, rx: 28, ry: 23 },
    { x: 114, y: 46, rx: 25, ry: 20 },
    { x: 140, y: 46, rx: 17, ry: 13 },
    { x: 158, y: 46, rx: 8, ry: 6 },
  ]);
  const body = shadeBlob(W, H, f, ['#04060b', '#070a11', '#0b0f18', '#101622', '#151d2c'],
    { outline: '#020308', smooth: 3, lift: 0.10 });
  const c = can(W, H), x = cx2(c);
  triOutlined(x, '#080c14', '#020308', [36, 46], [8, 16], [28, 42]);
  triOutlined(x, '#080c14', '#020308', [36, 46], [10, 76], [28, 50]);
  triOutlined(x, '#070a11', '#020308', [104, 30], [74, 5], [90, 30]);
  triOutlined(x, '#070a11', '#020308', [104, 62], [74, 87], [90, 62]);
  x.drawImage(body.c, 0, 0);
  for (let i = 0; i < 6; i++) triOutlined(x, '#101622', '#020308', [70 + i * 11, 46], [80 + i * 11, 46], [74 + i * 11, 30 - (i === 2 ? 6 : 0)]);
  for (let i = 0; i < 8; i++) { P(x, BP.bone, 146 + (i & 3) * 4, 42 + (i >> 2) * 8, 2, 2); }
  P(x, '#020308', 144, 44, 22, 4);
  return spr(c, 88, 46);
}

// =========================================================================
//  A HANDFUL OF LIVE PARTICLES
// =========================================================================
const FX = {
  l: [],
  clear() { this.l.length = 0; },
  add(o) { if (this.l.length < 260) this.l.push(o); },
  drop(x, y, n, up, spread) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI + 0.4, -0.4), sp = rand(40, 210) * (up || 1);
      this.add({ k: 'd', x: x + rand(-(spread || 6), spread || 6), y: y, vx: Math.cos(a) * sp * 0.7, vy: Math.sin(a) * sp, life: rand(0.35, 1.05), m: 1.05, s: randi(1, 2), c: BP.foam[randi(2, 4)] });
    }
  },
  ember(x, y, n) {
    for (let i = 0; i < n; i++) this.add({ k: 'e', x: x + rand(-8, 8), y: y + rand(-4, 3), vx: rand(-11, 11), vy: rand(-46, -16), life: rand(0.7, 1.9), m: 1.9, s: rand() > 0.7 ? 2 : 1, c: BP.fire[randi(2, 4)] });
  },
  bub(x, y, n) {
    for (let i = 0; i < n; i++) this.add({ k: 'b', x: x + rand(-9, 9), y: y + rand(-5, 5), vx: rand(-7, 7), vy: rand(-30, -10), life: rand(0.5, 1.4), m: 1.4, s: randi(1, 2), c: BP.foam[2] });
  },
  shard(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(70, 260);
      this.add({ k: 's', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, life: rand(0.3, 0.8), m: 0.8, s: randi(2, 5), c: rand() > 0.55 ? '#05070c' : BP.fire[randi(1, 3)] });
    }
  },
  update(dt) {
    for (let i = this.l.length - 1; i >= 0; i--) {
      const p = this.l[i];
      p.life -= dt; if (p.life <= 0) { this.l.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'd' || p.k === 's') { p.vy += 460 * dt; p.vx *= (1 - 1.1 * dt); }
      else if (p.k === 'e') { p.vy -= 22 * dt; p.vx += Math.sin(p.life * 7) * 12 * dt; }
      else { p.vx *= (1 - 2 * dt); }
    }
  },
  render(ctx, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    for (const p of this.l) {
      const k = p.life / p.m;
      if (k < 0.34 && (Math.floor(p.life * 26) & 1)) continue;
      P(ctx, p.c, R(p.x) + ox, R(p.y) + oy, p.s, p.k === 'd' ? p.s + 2 : p.s);
    }
  },
};

// =========================================================================
//  IN-WORLD CINEMATICS — the kit the arrival and the short beats share.
//
//  None of these scenes draws a plate.  They are staged in the live game
//  world with the real camera (G.cineTo / cineHold / cineBars), and this is
//  only what goes over the top of it: the night wash, the lamps the village
//  has lit, the alarm pulse, and the marks and bubbles that hang off a world
//  position and stay stuck to it through a zoom.
//
//  Per frame that costs: ONE baked 640x360 blit for the night, two small
//  baked discs per visible lamp anchor, and a handful of rectangles.  Nothing
//  in here is written a pixel at a time at run time.
// =========================================================================
function gg() { try { return G; } catch (e) { return null; } }

// a baked pool of light, centred, for blitting over the wash
function poolSpr(rx, ry, ramp, bias) {
  const c = can(rx * 2 + 1, ry * 2 + 1), x = cx2(c);
  glowPool(x, rx, ry, rx, ry, ramp, bias === undefined ? 0.9 : bias);
  return spr(c, rx, ry);
}
// The wash that turns the bay into the middle of the night.  Two blues on an
// ordered dither with the alpha snapped onto fifteen levels, so it stays a
// posterized filter and never becomes a gradient.  Heaviest at the top of the
// frame, where the land is and nothing is burning, thinning out over the open
// water the moon is on.
function buildNightVeil() {
  const c = can(640, 360), x = cx2(c);
  const img = x.createImageData(640, 360), d = img.data;
  const C1 = hexToRgb('#050c28'), C2 = hexToRgb('#02040f');
  for (let y = 0; y < 360; y++) {
    const u = 1 - y / 359;
    const base = 0.78 + u * u * 0.12;
    for (let px = 0; px < 640; px++) {
      let a = base + (bay(px, y) < 0.5 ? 0.05 : -0.03) + (hash2(px >> 2, y >> 1) - 0.5) * 0.04;
      if (a < 0) a = 0; else if (a > 1) a = 1;
      const col = bay(px + 2, y + 1) < 0.30 ? C2 : C1;
      const q = (y * 640 + px) * 4;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2];
      d[q + 3] = Math.round(a * 255 / 17) * 17;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

const WorldCine = {
  built: false, fail: false,
  night: 0, lamp: 0, red: 0,
  _spots: null, _key: '',
  eo3: eo3, eo2: eo2, slam: slamK,

  build() {
    if (this.built) return true;
    if (this.fail) return false;
    try {
      A.wcVeil = buildNightVeil();
      A.wcPool = poolSpr(26, 13, BP.torchGlow, 0.55);
      A.wcCore = poolSpr(9, 5, BP.fire, 0.95);
      const wc = cx2(can(8, 8));
      wc.drawImage(A.wcVeil, 0, 0, 640, 360, 0, 0, 8, 8);
      wc.drawImage(A.wcPool.c, 0, 0, A.wcPool.c.width, A.wcPool.c.height, 0, 0, 8, 8);
      this.built = true;
    } catch (e) { this.fail = true; if (typeof console !== 'undefined') console.error('WorldCine bake', e); }
    return this.built;
  },
  ok() { return this.build(); },
  begin() { this.night = 0; this.lamp = 0; this.red = 0; this._spots = null; this._key = ''; this.build(); },

  // These beats are a CONTINUATION of the shot already on screen, not a
  // change of scene, so the game's bubble transition has no business over
  // them.  game.js's own `quiet` list in beginWipe is the right home for
  // that; until it has them, the wipe is dropped from here, on the way in
  // (from the beat's own update, the frame after it starts) and on the way
  // out (on the tick after the state flips back).
  noWipe() {
    const g = gg(); if (!g || !g.wipe) return;
    g.wipe.t = 0;
    for (let i = 0; i < 3; i++) setTimeout(() => { const q = gg(); if (q && q.wipe) q.wipe.t = 0; }, i * 22);
  },

  // Hand the camera back, whatever happened.  Every scene ends here, and so
  // does every skip: zoom back to 1 on the player, no bars, no freeze.
  release(secs) {
    const g = gg();
    this.night = 0; this.lamp = 0; this.red = 0;
    if (!g) return;
    if (g.cineRelease) g.cineRelease(secs === undefined ? 0.8 : secs);
    if (g.cineBars) g.cineBars(0);
    if (g.cineFreeze) g.cineFreeze(false);
  },

  // ---- the lamp anchors, read off the village that is actually standing ---
  // Recomputed only when the village is rebuilt, never per frame.
  spots() {
    const V = typeof Village !== 'undefined' ? Village : null;
    if (!V || !V.built) return [];
    const key = V.pierX + ':' + V.structures.length + ':' + V.decks.length;
    if (this._spots && this._key === key) return this._spots;
    const X = V.pierX, out = [];
    for (let i = 0; i < V.decks.length; i++) {
      const d = V.decks[i], cx0 = (d.x0 + d.x1) * 0.5;
      if (Math.abs(cx0 - X) > 1100) continue;
      out.push([R(cx0), R((d.y0 + d.y1) * 0.5), 1, hash2(R(cx0), 7) * 6.28]);
      if (d.x1 - d.x0 > 140) out.push([R(d.x0 + 34), R(d.y0 + 5), 0.8, hash2(R(d.x0), 13) * 6.28]);
    }
    for (let i = 0; i < V.structures.length; i++) {
      const s = V.structures[i];
      if (s.kind !== 'house') continue;
      const cx0 = s.x + (s.bx || 0) + (s.bw || 0) * 0.5;
      if (Math.abs(cx0 - X) > 1100) continue;
      out.push([R(cx0), R(s.y - 7), 1.15, hash2(R(cx0), 19) * 6.28]);
    }
    out.push([R(X), R(V.shoreY - 3), 1.3, 0.7]);
    this._key = key;
    return this._spots = out;
  },

  // ---- the passes -------------------------------------------------------
  // everything clips to the frame BETWEEN the letterbox bars, so nothing the
  // night does ever spills onto them
  clip(ctx, barH) {
    ctx.save();
    if (barH > 0) { ctx.beginPath(); ctx.rect(0, barH, 640, Math.max(0, 360 - barH * 2)); ctx.clip(); }
  },
  veil(ctx, k, barH) {
    if (!this.built || k <= 0.015) return;
    this.clip(ctx, barH);
    ctx.globalAlpha = qa(k);
    ctx.drawImage(A.wcVeil, 0, 0);
    ctx.restore();
  },
  wash(ctx, col, a, barH) {
    if (a <= 0.01) return;
    ctx.fillStyle = rgbaq(col, Math.min(1, a));
    ctx.fillRect(0, barH, 640, Math.max(0, 360 - barH * 2));
  },
  // One lamp, at a world point, drawn over the wash so the light survives it.
  // The zoom is rounded to a whole number before it scales the disc, so a
  // baked pixel pool never lands on a fractional grid.
  pool(ctx, wx, wy, k, barH, mul, coreCol) {
    if (!this.built || k <= 0.02) return;
    const g = gg(); if (!g || !g.worldToScreen) return;
    this.clip(ctx, barH);
    this.blit(ctx, g, wx, wy, k, mul === undefined ? 1 : mul, coreCol);
    ctx.restore();
  },
  blit(ctx, g, wx, wy, k, mul, coreCol) {
    const sp = g.worldToScreen(wx, wy);
    const sx = R(sp.x), sy = R(sp.y);
    if (sx < -90 || sx > 730 || sy < -70 || sy > 430) return;
    const z = Math.max(1, Math.min(3, R(g.cine ? g.cine.zoom : 1)));
    const P0 = A.wcPool, P1 = A.wcCore;
    ctx.globalAlpha = qa(Math.min(1, k * 0.8 * mul));
    ctx.drawImage(P0.c, sx - P0.ax * z, sy - P0.ay * z, P0.c.width * z, P0.c.height * z);
    ctx.globalAlpha = qa(Math.min(1, k * mul));
    if (coreCol) { ctx.fillStyle = coreCol; ctx.fillRect(sx - z, sy - z, z * 2, z * 2); }
    ctx.drawImage(P1.c, sx - P1.ax * z, sy - P1.ay * z, P1.c.width * z, P1.c.height * z);
  },
  // every lamp the village has, with a slow flicker on each one
  lamps(ctx, k, barH, t) {
    if (!this.built || k <= 0.02) return;
    const g = gg(); if (!g || !g.worldToScreen) return;
    const list = this.spots(); if (!list.length) return;
    this.clip(ctx, barH);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const fl = 0.86 + Math.sin(t * 5.1 + s[3]) * 0.07 + Math.sin(t * 11.3 + s[3] * 2) * 0.05;
      this.blit(ctx, g, s[0], s[1], k, s[2] * fl, null);
    }
    ctx.restore();
  },

  // ---- marks that hang off a world position -----------------------------
  // a chunky exclamation that pops up over a head and settles
  mark(ctx, wx, wy, k, col) {
    if (k <= 0.01 || !this.built) return;
    const g = gg(); if (!g || !g.worldToScreen) return;
    const sp = g.worldToScreen(wx, wy);
    const e = slamK(clamp(k, 0, 1));
    const s = Math.max(1, Math.min(3, R(g.cine ? g.cine.zoom : 1)));
    const x0 = R(sp.x), y0 = R(sp.y) - R(e * 7);
    if (x0 < -20 || x0 > 660 || y0 < -20 || y0 > 380) return;
    const put = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x0 + dx * s, y0 + dy * s, w * s, h * s); };
    put(-2, -8, 4, 7, '#14141c'); put(-2, 0, 4, 4, '#14141c');
    put(-1, -7, 2, 5, col || '#ffe48f'); put(-1, 1, 2, 2, col || '#ffe48f');
  },
  // a speech bubble stuck to a world point, drawn in interface space so the
  // letters stay crisp no matter what the zoom is doing
  bubble(ctx, wx, wy, str, n, hot) {
    const g = gg(); if (!g || !g.worldToScreen || typeof UIKit === 'undefined') return;
    const sp = g.worldToScreen(wx, wy);
    const sx = clamp(R(sp.x), 44, 596), sy = clamp(R(sp.y), 58, 318);
    const w = Math.max(70, textWidth(str, 7) + 20);
    const bx = clamp(sx - w / 2, 8, 632 - w), by = clamp(sy - 26, 54, 296);
    UIKit.panel(ctx, bx, by, w, 24, 'parchment');
    const face = '#e8dcc0', ink = hot ? '#8c1a1c' : '#2a2016';
    // the tail: three hard steps, never a stroked triangle
    for (let i = 0; i < 9; i++) {
      const hw = 6 - R(i * 0.66);
      P(ctx, i < 8 ? face : ink, sx - hw, by + 23 + i, hw * 2, 1);
      P(ctx, ink, sx - hw - 1, by + 23 + i, 1, 1); P(ctx, ink, sx + hw, by + 23 + i, 1, 1);
    }
    pixelText(ctx, str.slice(0, Math.max(0, Math.min(str.length, n))), bx + 10, by + 8, 7, ink, 'left', false);
  },
  // the caption line, in the bottom bar where the letterbox already is
  cap(ctx, str, a, n) {
    if (!str || a <= 0.02) return;
    ctx.globalAlpha = qa(Math.min(1, a));
    const shown = n === undefined ? str : str.slice(0, Math.max(0, Math.min(str.length, n)));
    pixelTextOutlined(ctx, shown, 320, 336, 8, '#e8eef4', '#000000', 'center');
    ctx.globalAlpha = 1;
  },
};
global.WorldCine = WorldCine;

// ---- the in-world beats, and what happens when ---------------------------
// the raid going loud: the body, the bell, the Chief, and the fleet
const KV = { body: 0.00, bell: 0.60, spread: 1.75, chief: 2.60, order: 3.05, fleet: 4.15, end: 5.50 };
// a boat picks her out and comes for her
const KB = { snap: 0.00, creep: 0.50, whip: 1.10, out: 1.50, end: 2.05 };
// the last hull of a wave, burning
const KL = { push: 0.00, hold: 1.15, out: 1.70, end: 2.45 };
// somewhere new, seen from the water
const KC = { in: 0.00, card: 0.50, sub: 1.10, out: 2.30, end: 3.30 };
const WORLD_KINDS = { village_alarm: 1, bearing_down: 1, last_boat: 1, chapter_in: 1 };

// =========================================================================
//  TIMING TABLES
// =========================================================================
// the Chief arrives
const KI = { calm: 0.00, alarm: 1.30, breach: 2.50, close: 3.45, line: 4.60, down: 6.05, end: 6.95 };
const LINES_I = [
  [0.35, 1.05, 'the bay went quiet.'],
  [1.40, 1.05, 'then the drums started.'],
];
// the Chief goes down.  No fire in this one: the pier lamps are still lit
// behind her, the moon does the work, and the dawn arrives on the mother.
const KD = { roll: 0.00, slip: 1.25, rise: 2.60, hat: 4.05, mother: 5.25, ribbon: 6.35, end: 7.55 };
const LINES_D = [
  [0.30, 1.05, 'the shark went over.'],
  [1.55, 1.05, 'he did not come up.'],
  [2.95, 1.05, 'she surfaced where he sank.'],
  [4.15, 1.00, 'the otter took his hat off.'],
  [5.35, 1.60, 'for the one they took first.'],
];
const DX = 384;                     // where he sinks, and where she comes up
// the minis
const KM = { rise: 0.00, card: 0.62, hold: 1.25, out: 1.68, end: 2.10 };
const KX = { hit: 0.00, crack: 0.22, card: 0.42, stamp: 0.78, out: 1.28, end: 1.68 };

// =========================================================================
//  THE SCENE
// =========================================================================
const BossCut = {
  kind: null, name: 'MINI-BOSS', active: false, worldActive: false, done: true,
  t: 0, shake: 0, flash: 0, fade: 0,
  ax: 0, ay: 0, anchored: false,
  // the in-world beats: staged in the live game rather than on a baked plate
  world: false, wx: 0, wy: 0, wname: '', wsub: '', cap: null, capT: 0, _w: null,
  _fired: null, _man: null, _ott: null, _shk: null, _chf: null,

  // ----------------------------------------------------------------- init
  init() {
    if (BUILT) return;
    // the rigs in chars.js own the palette and the rasterizers; without them
    // there is nothing to build out of, so stay unbuilt and let start() bail
    if (typeof blobField !== 'function' || typeof shadeBlob !== 'function') return;
    if (typeof triOutlined !== 'function' || typeof CPAL === 'undefined') return;
    if (typeof CH === 'undefined' || !CH.manatee) return;
    try {
      // the torch line, thrown onto the water under each anchor on the pier
      const TGL = [[10, BP.torchGlow, 0.5, 20], [62, BP.torchGlow, 0.5, 20],
                   [104, BP.torchGlow, 0.44, 18], [128, BP.torchGlow, 0.40, 16],
                   [172, BP.torchGlow, 0.44, 18], [202, BP.torchGlow, 0.5, 20]];
      A.bayDusk = buildBay(BP.skyDusk, BP.seaDusk, {
        skyPow: 1.55, sun: [462, 168, 22, '#ffb765', '#fff0c4'], road: '#c8704a', road2: '#f0a765',
        chop: BP.chopDusk, cloudLit: '#ffbe6e', cloudLip: '#ffd58c',
        rim: '#4a2418', torchPools: true, glows: TGL,
      });
      // NIGHT — nothing is burning.  The village is still standing behind
      // her, dark, with the lamps along its pier the only warm thing in the
      // frame; the moon is the key, off to the right, and the dawn comes up
      // under it.  Three plates, cross-cut on the beat.
      A.bayNight = [
        buildBay(BP.skyNight, BP.sea, { skyPow: 1.6, chop: BP.chopNight,
          stars: 210, moon: [520, 72, 13], cloudLit: '#2f4482', cloudLip: '#4a6197',
          roadX: 520, road: '#22375f', road2: '#44669c', roadW: 74, roadD: 0.50,
          rim: '#1d2b4e', torchPools: true, glows: TGL }),
        buildBay(BP.skyPale, BP.seaPale, { skyPow: 1.5, chop: BP.chopNight,
          stars: 90, moon: [520, 72, 13], cloudLit: '#6076aa', cloudLip: '#8fa2cc',
          roadX: 520, road: '#2c4470', road2: '#5878ae', roadW: 74, roadD: 0.44,
          rim: '#2d3d62', torchPools: true, glows: TGL }),
        buildBay(BP.skyDawn, BP.seaDawn, {
          skyPow: 1.45, sun: [516, 178, 20, '#ffc07a', '#fff0cc'], road: '#a85a4e', road2: '#e09a6a',
          chop: BP.chopDawn, cloudLit: '#ffa878', cloudLip: '#ffcb94',
          rim: '#4a3a44', stars: 24, torchPools: true, glows: TGL }),
      ];
      A.closeBg = buildCloseBg();
      A.vig = buildVignette();
      A.veilNight = buildVeil(200, 22, '#0d1834');
      A.veilDawn = buildVeil(200, 22, '#2a2a52');
      A.swell = []; for (let i = 0; i < 7; i++) A.swell.push(buildSwellRow(i, i < 4 ? BP.foam[0] : BP.foam[1]));
      // the swell is lit by whatever is in the sky, so it gets a set each
      A.swellDusk = []; for (let i = 0; i < 7; i++) A.swellDusk.push(buildSwellRow(i, i < 3 ? '#6a4a6a' : i < 5 ? '#a06a66' : '#d08a5e'));
      A.swellNight = []; for (let i = 0; i < 7; i++) A.swellNight.push(buildSwellRow(i, i < 4 ? '#1a2c52' : '#2d4372'));
      A.swellPale = []; for (let i = 0; i < 7; i++) A.swellPale.push(buildSwellRow(i, i < 4 ? '#243c68' : '#41598e'));
      A.swellDawn = []; for (let i = 0; i < 7; i++) A.swellDawn.push(buildSwellRow(i, i < 3 ? '#3c4a7c' : i < 5 ? '#7a5278' : '#b86c60'));
      A.shark = buildSharkSide();
      A.sharkBack = buildSharkBack();
      A.chief = buildChiefSide();
      A.chiefRim = tintSprite(A.chief, '#ff9a4a', 1);
      A.spear = buildSpear();
      A.rifle = buildRifle();
      A.ghost = buildGhost();
      A.lamp = buildLamp();
      // ---- lit copies.  Every figure that stands in front of a coloured sky
      // gets that sky's colour on its edge, baked in, so nothing is a flat
      // black cut-out.  (lx, ly) always POINTS AT the light.
      //
      // DUSK: the sun is low and off to the RIGHT, behind the animal, and the
      // water under it throws warm light back up.
      A.sharkDusk = spr(rimLight(bounceLight(cloneSpr(A.shark), '#7a4a3c', 3, 0.7),
                                 1, 0, '#ffbe72', '#c06a36', 2), A.shark.ax, A.shark.ay);
      A.chiefDusk = spr(rimLight(cloneSpr(A.chief), 1, 0, '#ffd08a', '#c4763a', 2), A.chief.ax, A.chief.ay);
      A.spearDusk = spr(rimLight(cloneSpr(A.spear), 1, 0, '#ffd08a', '#c4763a', 1), A.spear.ax, A.spear.ay);
      A.sharkBackLit = spr(rimLight(cloneSpr(A.sharkBack), 1, -1, '#ffbe72', '#a8471f', 2),
                           A.sharkBack.ax, A.sharkBack.ay);
      // the close-up: the sun burns past his right shoulder, the sea throws a
      // cold fill onto the other side of his face
      A.chiefClose = spr(rimLight(rimLight(cloneSpr(A.chief), 1, 0, '#ffd08a', '#c4763a', 2),
                                  -1, 0, '#5d7bc4', '#2b3a6a', 1), A.chief.ax, A.chief.ay);
      A.spearClose = spr(rimLight(cloneSpr(A.spear), 1, 0, '#ffd08a', '#c4763a', 1), A.spear.ax, A.spear.ay);
      // NIGHT: the moon is high and off to the RIGHT, the pier lamps are a
      // weak warm wash from the LEFT, and the water is a cold bounce.
      const NDK = ['#0a1024', 0.62], SDK = ['#0c1428', 0.46];
      A.sharkNight = spr(rimLight(rimLight(darkEdge(tintCanvas(cloneSpr(A.shark), SDK[0], SDK[1]), '#04060f'),
                                           1, -1, '#b0c6f0', '#46639c', 2),
                                  -1, 0, '#6a4426', null, 1), A.shark.ax, A.shark.ay);
      A.chiefNight = spr(rimLight(rimLight(darkEdge(tintCanvas(cloneSpr(A.chief), NDK[0], NDK[1]), '#04060f'),
                                           1, -1, '#b0c6f0', '#46639c', 2),
                                  -1, 0, '#6a4426', null, 1), A.chief.ax, A.chief.ay);
      A.spearNight = spr(rimLight(tintCanvas(cloneSpr(A.spear), NDK[0], NDK[1]),
                                  1, -1, '#9fb8e8', '#3f5a90', 1), A.spear.ax, A.spear.ay);
      // Her and the otter in the defeat.  BOTH are drawn mirrored — she faces
      // the village, off to the left — so in their own space the moon, which
      // is high and off to the RIGHT of frame, is overhead and to the LEFT,
      // and the lantern hanging behind them is on their right.
      A.herMoon = herLit({ dark: NDK, edge: '#04060f',
                           dirs: [[0, -1, '#7d97cc', '#33507e'], [-1, 0, '#c9883c', null, 1]],
                           far: [[0, -1, '#2c4670', null, 1]] });
      A.himMoon = himLit({ dark: NDK, edge: '#04060f', exp: 'idle', bare: true,
                           dirs: [[0, -1, '#8aa4d8', '#3a5888'], [-1, 0, '#d8933c', null, 1]],
                           far: [[0, -1, '#2c4670', null, 1]] });
      // and the same two once the sun is up behind them
      const DDK = ['#241634', 0.42];
      A.herDawn = herLit({ dark: DDK, edge: '#0c0714',
                           dirs: [[0, -1, '#c9a0a8', '#6a4a62'], [-1, 0, '#ffb45a', '#a8601c', 2]],
                           far: [[0, -1, '#5c4460', null, 1]] });
      A.himDawn = himLit({ dark: DDK, edge: '#0c0714', exp: 'idle', bare: true,
                           dirs: [[0, -1, '#d4a8a8', '#7a5468'], [-1, 0, '#ffc470', '#a8601c', 2]],
                           far: [[0, -1, '#5c4460', null, 1]] });
      A.rifleNight = spr(rimLight(darkEdge(tintCanvas(cloneSpr(A.rifle), NDK[0], NDK[1]), '#04060f'), -1, -1, '#c08a3c', null, 1), A.rifle.ax, A.rifle.ay);
      // the boil of stirred-up light where he went under
      A.bio = []; for (let i = 0; i < 8; i++) A.bio.push(ringSprite(20 + i * 17, 6 + i * 5, 3 + i, BP.biolum[Math.min(5, 5 - (i >> 1))]));
      A.fin = (function () {
        const c = can(26, 22), x = cx2(c);
        triOutlined(x, '#253448', BP.ink, [24, 21], [2, 21], [8, 0]);
        P(x, '#516787', 8, 2, 2, 12);
        return spr(outlineIt(c, BP.ink), 13, 21);
      })();
      A.finDusk = spr(rimLight(cloneSpr(A.fin), 1, 0, '#ffbe72', '#c06a36', 2), A.fin.ax, A.fin.ay);
      A.shadow = discSprite(104, 22, '#020509', 1.5);
      A.ring = []; for (let i = 0; i < 8; i++) A.ring.push(ringSprite(26 + i * 20, 7 + i * 5, 3 + i, BP.foam[Math.min(3, 3 - (i >> 2))]));
      A.mRing = []; for (let i = 0; i < 8; i++) A.mRing.push(ringSprite(26 + i * 18, 12 + i * 8, 4 + i * 2, BP.foam[Math.min(4, 4 - (i >> 1))]));
      A.spray = []; for (let i = 0; i < 4; i++) A.spray.push(buildSpray(300, 170, i + 1));
      A.sprayS = []; for (let i = 0; i < 4; i++) A.sprayS.push(buildSpray(120, 70, i + 5));
      // water thrown up in front of a sunset is not white
      A.sprayDusk = A.spray.map(o => spr(tintCanvas(cloneSpr(o), '#ffb877', 0.30), o.ax, o.ay));
      A.spraySDusk = A.sprayS.map(o => spr(tintCanvas(cloneSpr(o), '#ffb877', 0.26), o.ax, o.ay));
      A.mini = buildMiniShade();
      A.miniWhite = tintSprite(A.mini, '#ffffff', 1);
      A.miniCyan = spr(rimLight(cloneSpr(A.mini), 0, -1, '#34b4c4', '#145060', 2), A.mini.ax, A.mini.ay);
      A.miniHot = spr(rimLight(cloneSpr(A.mini), 0, -1, '#ff8a6a', '#8c1a1c', 2), A.mini.ax, A.mini.ay);
      A.ringCyan = A.mRing.map(o => spr(tintCanvas(cloneSpr(o), '#34b4c4', 0.8), o.ax, o.ay));
      A.ringRed = A.mRing.map(o => spr(tintCanvas(cloneSpr(o), '#ff7a4a', 0.88), o.ax, o.ay));
      // the flash the mini comes apart in, at four strengths
      A.blow = [];
      for (let n = 0; n < 4; n++) {
        const f = (n + 1) / 4, c = can(218, 110), bx = cx2(c);
        for (let y = -54; y <= 54; y++) for (let dx = -108; dx <= 108; dx++) {
          const q = 1 - Math.sqrt((dx / 108) * (dx / 108) + (y / 54) * (y / 54));
          if (q <= 0 || bay(dx + 109, y + 55) > q * f * 1.15) continue;
          P(bx, q > 0.62 ? '#ffd88a' : q > 0.34 ? '#ffb04a' : '#c4542a', dx + 109, y + 55, 1, 1);
        }
        A.blow.push(spr(c, 109, 55));
      }
      A.buf = can(640, 360); A.bufCtx = cx2(A.buf);
      // the half-tone the minis darken the bay with, baked once: doing this
      // as 57k fillRects per frame cost 30ms a frame before it was baked
      // the two minis each get their own colour of dark to sit in
      A.ditherCyan = can(640, 360);
      { const dx = cx2(A.ditherCyan);
        dx.fillStyle = '#04141a'; dx.fillRect(0, 0, 640, 360);
        dx.fillStyle = '#01080c';
        for (let y = 0; y < 360; y += 2) for (let x = (y >> 1) & 1; x < 640; x += 2) dx.fillRect(x, y, 1, 1);
        for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
          const f = 1 - Math.sqrt(Math.pow((x - 320) / 400, 2) + Math.pow((y - 200) / 260, 2));
          if (f > 0 && bay(x, y) < f * 0.30) dx.fillRect(x, y, 1, 1);
        } }
      { const dx = cx2(A.ditherCyan); dx.fillStyle = '#0a2e38';
        for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
          const f = 1 - Math.sqrt(Math.pow((x - 320) / 300, 2) + Math.pow((y - 210) / 190, 2));
          if (f > 0 && bay(x + 1, y + 2) < f * 0.42) dx.fillRect(x, y, 1, 1);
        } }
      A.ditherRed = can(640, 360);
      { const dx = cx2(A.ditherRed);
        dx.fillStyle = '#2a090c'; dx.fillRect(0, 0, 640, 360);
        dx.fillStyle = '#0d0205';
        for (let y = 0; y < 360; y += 2) for (let x = (y >> 1) & 1; x < 640; x += 2) dx.fillRect(x, y, 1, 1);
        dx.fillStyle = '#5c1014';
        for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
          const f = 1 - Math.sqrt(Math.pow((x - 320) / 320, 2) + Math.pow((y - 200) / 200, 2));
          if (f > 0 && bay(x + 2, y + 1) < f * 0.48) dx.fillRect(x, y, 1, 1);
        }
        dx.fillStyle = '#8c1a1c';
        for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
          const f = 1 - Math.sqrt(Math.pow((x - 320) / 190, 2) + Math.pow((y - 210) / 120, 2));
          if (f > 0 && bay(x + 3, y + 2) < f * 0.34) dx.fillRect(x, y, 1, 1);
        } }
      // warm every baked canvas once so the first frame never pays to upload
      const wc = cx2(can(8, 8));
      const warm = o => { if (!o) return; const c = o.c || o; if (c && c.width) wc.drawImage(c, 0, 0, c.width, c.height, 0, 0, 8, 8); };
      for (const k in A) { const v = A[k]; if (Array.isArray(v)) v.forEach(warm); else warm(v); }
      BUILT = true;
    } catch (e) { BUILT = false; if (typeof console !== 'undefined') console.error('BossCut bake', e); }
  },

  // ---------------------------------------------------------------- start
  start(kind, opts) {
    opts = opts || {};
    this.init();
    this.kind = kind;
    this.name = String(opts.name || 'MINI-BOSS').toUpperCase();
    this.t = 0; this.shake = 0; this.flash = 0; this.fade = 0;
    this._fired = {};
    FX.clear();
    // the in-world beats need none of the baked plates, only the camera and
    // the night kit, so they are allowed to run even if the bake fell over
    this.world = !!WORLD_KINDS[kind];
    const known = this.world || kind === 'chief_intro' || kind === 'chief_defeat' || kind === 'mini_intro' || kind === 'mini_defeat';
    if (!known || (this.world ? !WorldCine.ok() : !BUILT)) {   // never throw, never hang
      this.active = false; this.done = true; this.worldActive = true; this.kind = null; this.world = false; return;
    }
    this.active = true; this.done = false;
    if (this.world) { this.startWorld(kind, opts); return; }
    const mini = kind === 'mini_intro' || kind === 'mini_defeat';
    // the minis play over live gameplay; the Chief's two get the frame to
    // themselves until the last half second, when the world fades back in
    this.worldActive = mini;
    this.anchored = mini && opts.x !== undefined && opts.y !== undefined;
    this.ax = opts.x || 0; this.ay = opts.y || 0;
    if (kind === 'chief_intro') {
      this._shk = { x: 300, y: 214, rot: 0, sc: 1 };
      this._chf = { x: 300, y: 214, rot: 0 };
      this.sfx(() => { Audio_.tone(46, 1.6, 'sine', 0.30, 8); Audio_.noise(1.4, 0.10, 240, 30); });
    } else if (kind === 'chief_defeat') {
      this._shk = { x: DX, y: 232, rot: -0.30 };
      this._chf = { x: DX - 10, y: 214, rot: 0.24 };
      this._man = { x: DX, y: 376, rot: 0, dip: 0 };
      this._ott = { x: DX + 14, y: 346, arm: 0, hat: 0 };
      this.sfx(() => { Audio_.tone(64, 1.1, 'sawtooth', 0.26, -30); Audio_.splash(2.2); });
    } else {
      this.shake = kind === 'mini_intro' ? 6 : 9;
      this.flash = kind === 'mini_intro' ? 0.5 : 0.9;
      this.sfx(() => { if (kind === 'mini_intro') { Audio_.stun(); Audio_.tone(58, 0.8, 'sawtooth', 0.28, 30); } else { Audio_.explosion(1.1); Audio_.tone(190, 0.3, 'square', 0.2, -140); } });
    }
  },

  // jump to the very end: nothing left on screen, the world back underneath,
  // and — for the in-world beats — the camera handed straight back
  skip() {
    const w = this.world;
    this.active = false; this.done = true; this.worldActive = true;
    this.fade = 0; this.flash = 0; this.shake = 0; this.kind = null; this.world = false;
    FX.clear();
    if (w) { WorldCine.release(0); WorldCine.noWipe(); }
  },

  sfx(fn) { try { if (typeof Audio_ !== 'undefined') fn(); } catch (e) { } },
  cue(key, at, fn) {
    if (this.t < at || this._fired[key]) return false;
    this._fired[key] = true; this.sfx(fn); return true;
  },

  // --------------------------------------------------------------- update
  update(dt, t) {
    if (this.done || !this.kind) return;
    if (dt > 1 / 20) dt = 1 / 20;
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 6);
    FX.update(dt);
    const T = this.t;
    if (this.world) this.updWorld(dt, T);
    else if (this.kind === 'chief_intro') this.updIntro(dt, T);
    else if (this.kind === 'chief_defeat') this.updDefeat(dt, T);
    else if (this.kind === 'mini_intro') { if (T > KM.end) this.finish(); }
    else if (this.kind === 'mini_defeat') {
      this.cue('burst', KX.crack, () => { Audio_.splash(2); Audio_.noise(0.5, 0.3, 900, 60); });
      if (T > KX.crack && T < KX.crack + 0.06) FX.shard(this.anchored ? this.ax : 320, this.anchored ? this.ay : 214, 16);
      this.cue('stamp', KX.stamp, () => { Audio_.tone(120, 0.22, 'square', 0.28, -60); Audio_.noise(0.2, 0.25, 1600, 200); });
      if (T > KX.stamp && T < KX.stamp + 0.05) this.shake = 5;
      if (T > KX.end) this.finish();
    }
  },

  finish() {
    const w = this.world;
    this.active = false; this.done = true; this.worldActive = true; this.kind = null; this.world = false;
    FX.clear();
    if (w) { WorldCine.release(0.7); WorldCine.noWipe(); }
  },

  // =======================================================================
  //  THE IN-WORLD BEATS
  //
  //  Staged in the live world: the camera is the game's camera, the village
  //  is the village, the boats are the boats.  All these methods do is drive
  //  G.cineTo / cineHold / cineBars on a clock and hang a caption or a
  //  bubble off something that is really there.
  //
  //    'village_alarm'  ~5.5s  the raid goes loud.  the body goes off the
  //                            pier, the bell starts, the village lights
  //                            every lamp it owns, the Chief gives the order
  //                            and the camera pulls back onto open water
  //                            with the fleet already coming out.
  //    'bearing_down'   ~2.1s  one hull picks her out and comes for her:
  //                            snap onto it, creep in, whip back to her.
  //    'last_boat'      ~2.5s  the last hull of a wave, burning.  push in,
  //                            hold on it, drift back out.
  //    'chapter_in'     ~3.3s  somewhere new, seen from the water: a slow
  //                            push toward the shore under a stamped card.
  // =======================================================================
  startWorld(kind, opts) {
    const g = gg();
    this.worldActive = true; this.anchored = false;
    this.shake = 0; this.flash = 0; this.fade = 0;
    this.cap = null; this.capT = 0;
    const w = this._w = { bell: 0, bn: 0, chief: null, X: 0, SY: 0 };
    if (!g || !g.cineTo) { this.finish(); return; }
    const p = g.player;
    this.wx = opts.x === undefined ? (p ? p.x : 0) : opts.x;
    this.wy = opts.y === undefined ? (p ? p.y : 0) : opts.y;
    this.wname = String(opts.name || '').toUpperCase();
    this.wsub = opts.sub || '';
    const V = (typeof Village !== 'undefined' && Village.built) ? Village : null;
    w.X = V ? V.pierX : (g.pier ? g.pier.x : this.wx);
    w.SY = V ? V.shoreY : (g.pier ? g.pier.y0 + 24 : this.wy);

    if (kind === 'village_alarm') {
      WorldCine.night = 1; WorldCine.lamp = 0.5; WorldCine.red = 0;
      g.cineBars(1);
      g.cineHold(this.wx, this.wy - 4, 2.8);
      // pin the man who is going to give the order before the panic that is
      // already running carries him off down the boardwalk
      if (V) {
        for (let i = 0; i < V.villagers.length; i++) {
          const v = V.villagers[i];
          if (v.build === 'boss' && !v.dead && !v.gone) { w.chief = v; break; }
        }
        // The cine camera can only look inside the follow camera's own
        // window, and the follow camera is pinned to a player who is sitting
        // still in the channel -- so anybody this beat wants to SHOW has to
        // be held where the shot can reach them.  The Chief comes out to the
        // head of his own pier and stays there; the crowd stays on the decks
        // instead of bolting up the beach, which is what the village's alarm
        // would otherwise have all of them doing by the second beat.
        if (w.chief) {
          w.cx = w.X; w.cy = w.SY - 8;
          w.chief.x = w.cx; w.chief.y = w.cy; w.chief.alerted = true; w.chief.panicked = true;
          w.chief.onJetty = true;
          if (w.chief.setState) w.chief.setState('notice');
        }
        w.crowd = [];
        for (let i = 0; i < V.villagers.length && w.crowd.length < 14; i++) {
          const v = V.villagers[i];
          if (v.dead || v.gone || v === w.chief) continue;
          if (Math.abs(v.x - w.X) > 440 || v.y > w.SY + 70) continue;
          w.crowd.push({ v: v, x: v.x, y: v.y });
          v.alerted = true; v.panicked = true;
          if (v.notice) v.notice();
        }
      }
      this.sfx(() => { Audio_.tone(70, 0.6, 'square', 0.22, -34); Audio_.noise(0.4, 0.12, 520, 60); });
    } else if (kind === 'bearing_down') {
      if (opts.x === undefined && g.enemies && g.enemies.length && p) {
        let best = null, bd = 1e9;
        for (const e of g.enemies) { if (e.dead) continue; const d = dist(e.x, e.y, p.x, p.y); if (d < bd) { bd = d; best = e; } }
        if (best) { this.wx = best.x; this.wy = best.y; w.tgt = best; }
      }
      g.cineBars(0); g.cineHold(this.wx, this.wy, 2.3);
      this.cap = 'they have seen her.'; this.capT = 0;
      this.sfx(() => { Audio_.tone(118, 0.5, 'sawtooth', 0.22, -60); Audio_.noise(0.42, 0.14, 700, 80); });
    } else if (kind === 'last_boat') {
      g.cineBars(0); g.cineHold(this.wx, this.wy, 1.5); g.cineTo(this.wx, this.wy, 2.7, 0.5);
      this.cap = opts.text || 'that was the last of them.'; this.capT = 0;
      this.sfx(() => { Audio_.explosion(0.9); Audio_.tone(150, 0.5, 'sine', 0.14, -60); });
    } else {                                     // chapter_in
      const ax = this.wx, ay = this.wy;
      g.cineBars(0); g.cineHold(ax, ay, 1.0); g.cineTo(ax, ay - 110, 1.6, 2.6);
      this.sfx(() => { Audio_.tone(150, 1.0, 'sine', 0.16, 40); Audio_.tone(225, 1.1, 'triangle', 0.08, 30); });
    }
  },

  updWorld(dt, T) {
    const g = gg(); if (!g || !g.cineTo) { this.finish(); return; }
    if (T < 0.3) WorldCine.noWipe();
    const k = this.kind;
    if (k === 'village_alarm') this.updAlarm(dt, T, g);
    else if (k === 'bearing_down') this.updBearing(dt, T, g);
    else if (k === 'last_boat') this.updLast(dt, T, g);
    else this.updChapter(dt, T, g);
  },

  // ---- the raid goes loud -------------------------------------------------
  updAlarm(dt, T, g) {
    const w = this._w, V = (typeof Village !== 'undefined' && Village.built) ? Village : null;
    // the bell, struck on a two-note alternation for as long as it matters
    if (T > KV.bell && T < KV.fleet + 0.7) {
      w.bell -= dt;
      if (w.bell <= 0) {
        w.bell = 0.44; w.bn++; w.hit = 1;
        const hi = (w.bn & 1) === 1;
        this.sfx(() => { Audio_.tone(hi ? 784 : 588, 0.45, 'triangle', 0.17, -50); Audio_.tone(hi ? 392 : 294, 0.55, 'sine', 0.10); });
      }
      w.hit = Math.max(0, (w.hit || 0) - dt * 3.4);
      WorldCine.red = w.hit * 0.21;
    } else WorldCine.red = 0;
    // the man who is about to give the order, and the crowd behind him, stay
    // exactly where the shot can see them
    if (w.chief && !w.chief.dead && !w.chief.gone) {
      const c = w.chief;
      c.x = w.cx; c.y = w.cy; c.tx = w.cx; c.ty = w.cy; c.panicked = true;
      c.face = g.player && g.player.x < c.x ? -1 : 1;
    }
    if (w.crowd) {
      for (let i = 0; i < w.crowd.length; i++) {
        const q = w.crowd[i], v = q.v;
        if (v.dead || v.gone) continue;
        v.x = q.x; v.y = q.y; v.tx = q.x; v.ty = q.y; v.panicked = true;
      }
      w.shout = (w.shout === undefined ? 0.5 : w.shout) - dt;
      if (w.shout <= 0 && w.crowd.length) {
        w.shout = 0.34;
        const q = w.crowd[(Math.random() * w.crowd.length) | 0];
        if (q && !q.v.dead && !q.v.speech && q.v.say) q.v.say('!', 1.0, '#ffd9d9');
      }
    }
    // the lamps come on across the village while the alarm runs
    WorldCine.lamp = Math.min(1, WorldCine.lamp + dt * (T > KV.bell ? 0.9 : 0.2));

    if (this.cue('pull', KV.bell, () => { })) {
      g.cineTo(w.X, w.SY + 40, 1.45, 0.8);
      this.cap = 'THE BELL.'; this.capT = T;
      if (V && V.panicNear) V.panicNear(w.X, w.SY, 460);
    }
    if (this.cue('pan', KV.spread, () => { Audio_.tone(196, 0.5, 'square', 0.10); })) {
      g.cineTo(w.X - 210, w.SY + 16, 1.28, 1.0);
      this.cap = 'every lamp in the bay, all at once.'; this.capT = T;
      if (V && V.panicAll) V.panicAll();
    }
    if (this.cue('chief', KV.chief, () => { Audio_.tone(92, 0.8, 'sawtooth', 0.24, -22); })) {
      const c = w.chief;
      if (c && !c.dead && !c.gone) { if (c.notice) c.notice(); c.panicked = true; g.cineTo(c.x, c.y - 6, 2.6, 0.55); }
      else g.cineTo(w.X, w.SY - 10, 2.6, 0.55);
      this.cap = null;
    }
    if (this.cue('order', KV.order, () => { Audio_.roar(); Audio_.tone(110, 0.7, 'square', 0.2, -30); })) g.shake(6);
    if (this.cue('fleet', KV.fleet, () => { Audio_.tone(196, 0.9, 'square', 0.13); Audio_.splash(2.2); })) {
      g.cineRelease(1.15);
      this.cap = 'the whole bay put out at once.'; this.capT = T;
      if (w.crowd) for (const q of w.crowd) { if (q.v.dead || q.v.gone) continue; q.v.panicked = false; if (q.v.panic) q.v.panic(); }
      if (w.chief && !w.chief.dead && !w.chief.gone) { w.chief.panicked = false; if (w.chief.panic) w.chief.panic(); }
      if (V) for (const v of V.villagers) if (!v.dead && !v.gone && Math.random() < 0.55) v.panic();
    }
    // and the night lifts as the harbour lights itself, so the fight starts
    // in the light it is played in rather than cutting back to it
    if (T > KV.fleet - 0.5) WorldCine.night = Math.max(0, 1 - (T - (KV.fleet - 0.5)) / 1.45);
    g.cineBars(T > KV.end - 0.8 ? eo3(clamp((KV.end - T) / 0.8, 0, 1)) : 1);
    if (T > KV.end) this.finish();
  },

  // ---- a hull picks her out ----------------------------------------------
  updBearing(dt, T, g) {
    const w = this._w, e = w.tgt;
    if (e && !e.dead) { this.wx = e.x; this.wy = e.y; }
    g.cineBars(T < KB.out ? eo3(T / 0.2) : eo3(clamp((KB.end - T) / 0.35, 0, 1)));
    if (this.cue('creep', KB.creep, () => { })) g.cineTo(this.wx, this.wy, 2.9, 0.62);
    else if (T > KB.creep && T < KB.whip) g.cineTo(this.wx, this.wy, 2.9, 0.62);
    if (this.cue('whip', KB.whip, () => { Audio_.tone(260, 0.2, 'square', 0.16, -160); })) {
      const p = g.player; g.cineTo(p.x, p.y, 1.9, 0.3);
      this.cap = null;
    }
    if (this.cue('out', KB.out, () => { })) g.cineRelease(0.55);
    if (T > KB.end) this.finish();
  },

  // ---- the last hull of a wave -------------------------------------------
  updLast(dt, T, g) {
    if (T > KL.push && T < KL.hold && Math.random() < 22 * dt && g.particles)
      g.particles.spray(this.wx + rand(-9, 9), this.wy + rand(-7, 7), -1.6 + rand(-0.4, 0.4), 1, 40);
    g.cineBars(T < KL.out ? eo3(T / 0.25) : eo3(clamp((KL.end - T) / 0.4, 0, 1)));
    if (this.cue('drift', KL.hold, () => { Audio_.tone(90, 0.7, 'sine', 0.14, -30); })) g.cineTo(this.wx, this.wy - 10, 2.3, 0.9);
    if (this.cue('out', KL.out, () => { })) g.cineRelease(0.8);
    if (T > KL.end) this.finish();
  },

  // ---- somewhere new, seen from the water --------------------------------
  updChapter(dt, T, g) {
    g.cineBars(T < KC.out ? eo3(T / 0.35) : eo3(clamp((KC.end - T) / 0.5, 0, 1)));
    this.cue('card', KC.card, () => { Audio_.tone(120, 0.3, 'square', 0.2, -50); Audio_.noise(0.2, 0.16, 900, 120); });
    this.cue('sub', KC.sub, () => Audio_.tone(330, 0.3, 'triangle', 0.10, 60));
    if (this.cue('out', KC.out, () => { })) g.cineRelease(1.0);
    if (T > KC.end) this.finish();
  },

  // ---- what goes over the top of the live frame --------------------------
  drawWorld(ctx, T, t) {
    const g = gg(); if (!g) return;
    const W = WorldCine, barH = R(46 * (g.cine ? g.cine.bars : 0));
    ctx.imageSmoothingEnabled = false;
    if (W.night > 0.015) { W.veil(ctx, W.night, barH); W.lamps(ctx, W.night * W.lamp, barH, t); }
    if (this.kind === 'village_alarm' && W.night > 0.015)
      W.pool(ctx, this.wx - 9, this.wy - 1, W.night, barH, 1.15, '#ffd67a');   // his lantern, still going
    if (W.red > 0.01) W.wash(ctx, '#b8202a', W.red, barH);
    if (this.kind === 'village_alarm') {
      const c = this._w.chief;
      if (T > KV.chief + 0.16 && T < KV.fleet + 0.15 && c && !c.dead && !c.gone) {
        W.mark(ctx, c.x, c.y - 19, clamp((T - KV.chief - 0.16) / 0.2, 0, 1), '#ff6161');
        if (T > KV.order) W.bubble(ctx, c.x, c.y - 28, 'EVERY BOAT IN THE WATER!', Math.floor((T - KV.order) * 38), true);
      }
    } else if (this.kind === 'chapter_in') {
      if (T > KC.card && this.wname) {
        const k = slamK(clamp((T - KC.card) / 0.26, 0, 1));
        ctx.globalAlpha = qa(Math.min(1, clamp((KC.end - T) / 0.5, 0, 1)));
        UIKit.ribbon(ctx, 320, 96 - R((1 - k) * 26), this.wname, 'gold');
        if (T > KC.sub && this.wsub)
          pixelTextOutlined(ctx, this.wsub, 320, 126, 7, '#cfe0ec', '#08101c', 'center');
        ctx.globalAlpha = 1;
      }
    }
    if (this.cap) {
      const a = clamp((T - this.capT) / 0.22, 0, 1) * clamp((this.capT + 2.6 - T) / 0.45, 0, 1);
      W.cap(ctx, this.cap, a, Math.floor((T - this.capT) * 40));
    }
  },

  // ---- the Chief arrives --------------------------------------------------
  updIntro(dt, T) {
    const s = this._shk, c = this._chf;
    if (T < KI.breach) {
      // he is still a shadow under the swell, coming in from the right and
      // closing on the camera, so he grows all the way in
      const k = clamp(T / KI.breach, 0, 1);
      s.x = R(lerp(650, 300, k * k)); s.y = R(lerp(236, 316, k * k)); s.rot = 0;
      if (T > KI.alarm && Math.random() < 16 * dt) FX.drop(s.x + rand(-60, 60), s.y - 10, 1, 0.5, 14);
      this.cue('gong', KI.alarm, () => { Audio_.tone(196, 1.1, 'triangle', 0.22, -70); Audio_.noise(0.7, 0.14, 1100, 120); });
      this.cue('gong2', KI.alarm + 0.55, () => { Audio_.tone(146, 1.2, 'triangle', 0.2, -50); });
    } else if (T < KI.close) {
      // the leap: a parabola out of the near water, nose up on the way
      const k = clamp((T - KI.breach) / (KI.close - KI.breach), 0, 1);
      s.x = R(lerp(292, 392, k));
      s.y = R(330 - Math.sin(k * 2.15) * 196);
      s.rot = lerp(-0.92, -0.16, k);
      if (this.cue('breach', KI.breach, () => { Audio_.roar(); Audio_.splash(3); Audio_.explosion(0.8); })) {
        this.shake = 10; this.flash = 0.7;
        FX.drop(292, 326, 54, 1.9, 44);
      }
      if (Math.random() < 50 * dt) FX.drop(s.x + rand(-70, 50), s.y + rand(-16, 30), 1, 0.4, 8);
    } else if (T < KI.down) {
      // the close-up. he breathes, the spear comes up, then he speaks
      this.cue('card', KI.close, () => { Audio_.tone(74, 0.7, 'sawtooth', 0.26, -20); Audio_.noise(0.35, 0.2, 500, 60); });
      this.cue('card2', KI.close + 0.14, () => Audio_.tone(52, 0.9, 'square', 0.18, -14));
      this.cue('say', KI.line, () => Audio_.tone(104, 0.5, 'sawtooth', 0.16, -34));
      if (Math.random() < 16 * dt) FX.drop(rand(180, 460), rand(40, 150), 1, -0.25, 4);
    } else {
      // and down he comes
      const k = clamp((T - KI.down) / 0.42, 0, 1);
      s.x = 398; s.y = R(lerp(96, 330, k * k)); s.rot = lerp(0.5, 1.2, k);
      if (this.cue('crash', KI.down + 0.38, () => { Audio_.explosion(1.5); Audio_.splash(3); })) {
        this.shake = 13; this.flash = 0.85;
        FX.drop(398, 326, 70, 2.0, 60);
      }
      this.fade = clamp((T - (KI.end - 0.55)) / 0.55, 0, 1);
      if (this.fade > 0) this.worldActive = true;         // let the fight fade in under us
      if (T > KI.end) this.finish();
    }
  },

  // ---- the Chief goes down ------------------------------------------------
  updDefeat(dt, T) {
    const s = this._shk, c = this._chf, m = this._man, o = this._ott;
    if (T < KD.slip) {
      // she rolled him over: the animal is belly-up and settling, and the
      // settle eases out rather than running at a constant rate
      const k = eo2(T / KD.slip);
      s.rot = lerp(-0.30, 0.14, k); s.y = 232 + R(k * 10);
      c.rot = lerp(0.24, 0.95, k); c.y = 214 + R(k * 14); c.x = DX - 10 + R(k * 14);
      if (Math.random() < 10 * dt) FX.bub(s.x + rand(-50, 50), s.y + rand(-6, 10), 1);
    } else if (T < KD.rise) {
      // he lets go and goes.  ease IN: gravity has him now
      const k = ei2(clamp((T - KD.slip) / (KD.rise - KD.slip), 0, 1));
      s.rot = 0.14 + k * 0.26; s.y = 242 + R(k * 76);
      c.rot = 0.95 + k * 1.5; c.y = 228 + R(k * 86); c.x = DX + 4 + R(k * 14);
      if (this.cue('under', KD.slip, () => { Audio_.splash(1.6); Audio_.tone(58, 0.8, 'sine', 0.22, -20); })) FX.bub(DX, 230, 16);
      if (Math.random() < 14 * dt) FX.bub(DX + rand(-26, 26), 232 + rand(0, 14), 1);
    } else {
      // they keep going down while she comes up in the same water
      s.y += 60 * dt; s.rot += 0.2 * dt;
      c.y += 52 * dt; c.rot += 0.9 * dt;
      const k = clamp((T - KD.rise) / 1.05, 0, 1);
      // out of the water hard, then the last of it slow: she is heavy
      const e = k < 0.42 ? ei2(k / 0.42) * 0.62 : 0.62 + eo3((k - 0.42) / 0.58) * 0.38;
      m.y = R(lerp(376, 284, e)); m.x = DX;
      o.y = m.y - 21; o.x = DX + 14;
      if (this.cue('rise', KD.rise, () => { Audio_.splash(2.6); Audio_.tone(150, 0.6, 'sine', 0.18, 90); })) {
        FX.drop(DX, 318, 40, 1.5, 58);
      }
      if (k < 1 && Math.random() < 26 * dt) FX.drop(DX + rand(-64, 64), m.y + rand(-4, 16), 1, 0.7, 8);
      o.arm = eo3(clamp((T - KD.hat) / 0.55, 0, 1));
      o.hat = eo2(clamp((T - KD.hat - 0.18) / 0.44, 0, 1));
      // she lowers her head when her mother comes past, and holds it there
      m.dip = sstep(clamp((T - KD.mother - 0.35) / 0.9, 0, 1)) * 0.10;
      this.cue('hat', KD.hat, () => Audio_.tone(330, 0.5, 'triangle', 0.10, 120));
      this.cue('mum', KD.mother, () => { Audio_.tone(262, 1.4, 'sine', 0.12, 40); Audio_.tone(392, 1.6, 'sine', 0.08, 30); });
      this.cue('rib', KD.ribbon, () => { Audio_.tone(196, 0.8, 'square', 0.16); Audio_.tone(294, 0.9, 'square', 0.12); });
      this.fade = clamp((T - (KD.end - 0.55)) / 0.55, 0, 1);
      if (this.fade > 0) this.worldActive = true;
      if (T > KD.end) this.finish();
    }
  },

  // =======================================================================
  //  RENDER — world layer (minis, when the caller gave us a position)
  // =======================================================================
  renderWorld(ctx, cam, t) {
    if (this.done || !this.anchored || !BUILT) return;
    const ox = -cam.x, oy = -cam.y;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (this.kind === 'mini_intro') this.drawMini(ctx, this.ax + ox, this.ay + oy, this.t);
    else if (this.kind === 'mini_defeat') this.drawMiniBreak(ctx, this.ax + ox, this.ay + oy, this.t);
    FX.render(ctx, ox, oy);
    ctx.restore();
  },

  // =======================================================================
  //  RENDER — everything in 640x360 logical screen space
  // =======================================================================
  renderScreen(ctx, t) {
    if (this.done || !this.kind) return;
    if (!BUILT && !this.world) return;
    // the Chief's two cuts own the whole frame, so they hand back to the game
    // by fading THEMSELVES out over the live world.  Only then do we pay for
    // the extra buffer, and only for the last half second.
    if (this.fade > 0.02) {
      const a = qa(1 - this.fade);
      if (a <= 0) return;
      const bx = A.bufCtx;
      bx.clearRect(0, 0, 640, 360);
      this.paint(bx, t);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = a;
      ctx.drawImage(A.buf, 0, 0);
      ctx.restore();
      return;
    }
    this.paint(ctx, t);
  },
  paint(ctx, t) {
    // the in-world beats never shake the interface layer: the world under it
    // is already being shaken by the game's own camera, and a wash that moves
    // off its own frame shows an edge
    if (this.world) { this.drawWorld(ctx, this.t, t); return; }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const sh = this.shake;
    if (sh > 0.4) ctx.translate(R(rand(-sh, sh)), R(rand(-sh, sh)));
    if (this.kind === 'chief_intro') this.drawIntro(ctx, this.t, t);
    else if (this.kind === 'chief_defeat') this.drawDefeat(ctx, this.t, t);
    else if (this.kind === 'mini_intro') this.drawMiniIntro(ctx, this.t);
    else this.drawMiniDefeat(ctx, this.t);
    ctx.restore();
    if (this.flash > 0.02) P(ctx, rgbaq('#ffffff', Math.min(0.85, this.flash)), 0, 0, 640, 360);
  },

  // ---- shared furniture ---------------------------------------------------
  letterbox(ctx, k) {
    const h = R(BAR * (k === undefined ? 1 : eo3(k)));
    if (h <= 0) return;
    P(ctx, '#000000', 0, 0, 640, h);
    P(ctx, '#000000', 0, 360 - h, 640, h);
  },
  caption(ctx, lines, T) {
    // only ever the newest live line: two typed lines on one row is a mess
    let pick = -1;
    for (let i = 0; i < lines.length; i++) {
      if (T >= lines[i][0] && T <= lines[i][0] + lines[i][1] + 0.6) pick = i;
    }
    if (pick >= 0) {
      const at = lines[pick][0], dur = lines[pick][1], s = lines[pick][2];
      const prog = T - at;
      const n = Math.max(0, Math.min(s.length, Math.floor(prog * 36)));
      const shown = s.slice(0, n);
      // a line does not snap on: it comes up two pixels and fades out again
      const inK = eo2(prog / 0.18);
      ctx.globalAlpha = T > at + dur ? qa((1 - (T - at - dur) / 0.6)) : qa(inK);
      const y = 344 + R((1 - inK) * 2);
      pixelTextOutlined(ctx, shown, 320, y, 8, '#e8eef4', '#000000', 'center');
      if (n < s.length && (Math.floor(prog * 8) & 1)) P(ctx, '#e8eef4', 320 + R(textWidth(shown, 8) / 2) + 2, y + 1, 4, 7);
      ctx.globalAlpha = 1;
    }
  },
  swell(ctx, T, set) {
    set = set || A.swell;
    for (let i = 0; i < 7; i++) {
      const u = i / 6;
      const y = R(HZ + 4 + Math.pow(u, 1.7) * (360 - HZ - 22) + Math.sin(T * 0.7 + i * 1.6) * 1.5);
      const off = R(T * (7 + u * 26)) % 640;
      ctx.drawImage(set[i], -off, y);
      ctx.drawImage(set[i], 640 - off, y);
    }
  },
  // baked once in init(): this used to be forty-eight fillRects a frame
  vignette(ctx) { if (A.vig) ctx.drawImage(A.vig, 0, 0); },
  // a hard black slab that slams in from one side (extra slides it back out)
  slab(ctx, y, h, k, dir, col, extra) {
    if (k <= 0) return 0;
    // signed, so an easing that overshoots past 1 actually slides past the
    // mark and comes back instead of snapping dead on it
    const d = 1 - k, e = d * Math.abs(d) * 760;
    const ox = R(dir * e + (extra || 0));
    P(ctx, col || '#000000', ox, y, 640, h);
    return ox;
  },

  // ---- CHIEF: the arrival -------------------------------------------------
  drawIntro(ctx, T, t) {
    if (T >= KI.close && T < KI.down) { this.drawIntroClose(ctx, T, t); return; }
    ctx.drawImage(A.bayDusk, 0, 0);
    this.swell(ctx, T, A.swellDusk);
    const s = this._shk;
    if (T < KI.breach) {
      // the water goes wrong: a shadow, then the fin, then the hump — all of
      // it in the near water, close enough to be a problem
      const k = clamp(T / KI.breach, 0, 1);
      ctx.globalAlpha = qa(0.45 + k * 0.5);
      ctx.drawImage(A.shadow.c, s.x - A.shadow.ax, s.y - A.shadow.ay);
      ctx.globalAlpha = 1;
      if (T > KI.alarm) {
        const fk = clamp((T - KI.alarm) / (KI.breach - KI.alarm), 0, 1);
        const fy = R(s.y - 14 - fk * 6), fn = A.finDusk;
        // the wake dragging behind it
        for (let i = 0; i < 24; i++) {
          if (hash2(i, 5) < 0.3) continue;
          const dx = 44 + i * 10, a = 1 - i / 24;
          P(ctx, a > 0.5 ? '#ffd7a0' : '#8a5a5e', s.x + dx, fy + 10 + R(i * 0.8), 4, 1);
          P(ctx, a > 0.5 ? '#e0a070' : '#5a4258', s.x + dx, fy + 10 - R(i * 0.8), 4, 1);
        }
        // the surface humps up over his back
        for (let dx = -86; dx <= 86; dx++) {
          const hgt = R(Math.cos(dx / 86 * 1.5) * 12 * fk);
          if (hgt <= 0) continue;
          P(ctx, '#33395e', s.x + dx, s.y - 6 - hgt, 1, hgt);
          if (bay(s.x + dx, s.y) < 0.34) P(ctx, '#a2707a', s.x + dx, s.y - 7 - hgt, 1, 2);
        }
        ctx.drawImage(fn.c, 0, 0, fn.w, fn.h, R(s.x + 18) - fn.ax * 2, fy - fn.ay * 2, fn.w * 2, fn.h * 2);
      }
      // the village lights up and empties onto the pier
      this.drawAlarm(ctx, T, t);
    } else {
      this.drawAlarm(ctx, T, t);
      // the launch column of water he came through
      const bk = clamp((T - KI.breach) / 0.6, 0, 1);
      const rk = clamp((T - KI.breach) / 0.9, 0, 1);
      if (rk < 1) {
        const rg = A.ring[Math.min(7, Math.floor(rk * 8))];
        ctx.drawImage(rg.c, 292 - rg.ax, 326 - rg.ay);
      }
      if (bk < 1) {
        const fr = A.sprayDusk[Math.min(3, Math.floor(bk * 4))];
        ctx.drawImage(fr.c, 292 - fr.ax, 332 - fr.h + R(bk * 40));
      }
      // the animal itself, and the man on its back, at twice the size
      this.drawRider(ctx, s, 2, true);
      if (T >= KI.down) {
        // the crash: two hard wings of water thrown out sideways and a short
        // column up the middle, not one white sheet across the frame
        const dk = clamp((T - KI.down - 0.30) / 0.55, 0, 1);
        if (dk > 0 && dk < 1) {
          const rk = A.ring[Math.min(7, Math.floor(dk * 8))];
          ctx.globalAlpha = qa(1 - dk * 0.8);
          ctx.drawImage(rk.c, 398 - rk.ax, 330 - rk.ay);
          ctx.globalAlpha = 1;
          const fr = A.spraySDusk[Math.min(3, Math.floor(dk * 4))];
          const rise = R(eo2(dk) * 26);
          for (let sg = -1; sg <= 1; sg += 2) {
            ctx.save();
            ctx.translate(398 + sg * 26, 336 - rise);
            ctx.scale(sg * 2, 2);
            ctx.globalAlpha = qa(1 - dk * 0.55);
            ctx.drawImage(fr.c, -fr.ax, -fr.h);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
          const up = A.spraySDusk[Math.min(3, Math.floor(dk * 3))];
          ctx.save(); ctx.translate(398, 338 - R(eo2(dk) * 44)); ctx.scale(1, 2);
          ctx.globalAlpha = qa(1 - dk * 0.7);
          ctx.drawImage(up.c, -up.ax, -up.h);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
    }
    FX.render(ctx, 0, 0);
    this.vignette(ctx);
    this.letterbox(ctx, T / 0.5);
    this.caption(ctx, LINES_I, T);
    if (T < 1.5) {
      ctx.globalAlpha = qa(clamp((T - 0.55) / 0.5, 0, 1) * clamp((1.5 - T) / 0.35, 0, 1));
      pixelTextOutlined(ctx, 'FISHER VILLAGE', 320, 34, 7, '#ffc78c', '#2a0e12', 'center');
      ctx.globalAlpha = 1;
    }
  },
  // torches lighting one by one, and little figures running out to look
  drawAlarm(ctx, T, t) {
    if (T < KI.alarm) return;
    for (let i = 0; i < TORCH.length; i++) {
      if (T < KI.alarm + i * 0.11) continue;
      const tx = TORCH[i][0], ty = TORCH[i][1];
      const f = Math.floor(t * 12 + i) % 3;
      P(ctx, BP.fire[2], tx - 1, ty - 4, 3, 5);
      P(ctx, BP.fire[3], tx, ty - 5 - f, 1, 4);
      P(ctx, BP.fire[4], tx, ty - 4, 1, 2);
    }
    // villagers turning out along the pier.  the huts behind them are the
    // same near-black, so they carry their own torchlight to read against it.
    const run = clamp((T - KI.alarm - 0.2) / 0.9, 0, 1);
    for (let i = 0; i < 5; i++) {
      const fx = R(lerp(48 + i * 15, 138 + i * 15, run));
      const fy = HZ - 17;
      const bob = (Math.floor(t * 9 + i * 2) & 1) && run < 1 ? 1 : 0;
      P(ctx, BP.ink, fx - 1, fy - 11 - bob, 5, 10);        // a dark gap around him
      P(ctx, '#47372c', fx, fy - 10 - bob, 3, 4);          // head + shoulders
      P(ctx, '#6b5136', fx, fy - 10 - bob, 3, 1);
      P(ctx, '#3a2c24', fx, fy - 6 - bob, 3, 4);           // body
      P(ctx, BP.ink, fx, fy - 2, 1, 2);
      P(ctx, BP.ink, fx + 2, fy - 2, 1, 2);
      if (i & 1) {                                         // a torch, held up
        const f = Math.floor(t * 13 + i) % 3;
        P(ctx, '#3a2c24', fx + 4, fy - 12, 1, 5);
        P(ctx, BP.fire[2], fx + 4, fy - 15, 1, 3);
        P(ctx, BP.fire[3], fx + 4, fy - 16 - f, 1, 2);
        P(ctx, BP.fire[4], fx + 4, fy - 15, 1, 1);
      } else if (run >= 1) P(ctx, '#47372c', fx + 3, fy - 12, 3, 1);   // an arm, pointing
    }
  },
  drawRider(ctx, s, sc, lit) {
    sc = sc || 1;
    const SH = lit ? A.sharkDusk : A.shark, CF = lit ? A.chiefDusk : A.chief, SP = lit ? A.spearDusk : A.spear;
    ctx.save();
    ctx.translate(R(s.x), R(s.y));
    ctx.rotate(s.rot);
    ctx.scale(sc, sc);                       // integer scale: still pixel-exact
    ctx.drawImage(SH.c, -SH.ax, -SH.ay);
    // he sits just behind the dorsal, standing up against the arc
    ctx.translate(-14, -14);
    ctx.rotate(-s.rot * 0.8);
    ctx.drawImage(CF.c, -CF.ax, -CF.ay);
    ctx.save();
    ctx.translate(11, -34); ctx.rotate(-1.0);
    ctx.drawImage(SP.c, -SP.ax, -SP.ay);
    ctx.restore();
    ctx.restore();
  },
  // ---- CHIEF: the close-up ------------------------------------------------
  drawIntroClose(ctx, T, t) {
    ctx.drawImage(A.closeBg, 0, 0);
    const k = clamp((T - KI.close) / 0.35, 0, 1);
    const bob = R(Math.sin(t * 2.2) * 2);
    // the animal's back under him, at 3x, running off both sides of the frame
    const sb = A.sharkBackLit;
    ctx.drawImage(sb.c, 0, 0, sb.w, sb.h, 320 - sb.ax * 3, 366 + bob - sb.ay * 3, sb.w * 3, sb.h * 3);
    // water still sheeting off them
    const sk = clamp((T - KI.close) / 0.7, 0, 1);
    if (sk < 1) {
      const fr = A.spraySDusk[Math.min(3, Math.floor(sk * 4))];
      ctx.drawImage(fr.c, 0, 0, fr.w, fr.h, 320 - fr.ax * 2, 340 + R(sk * 52) - fr.h * 2, fr.w * 2, fr.h * 2);
    }
    // him: a warm rim behind, then the man
    const ch = A.chiefClose, cy = 268 + bob;
    ctx.globalAlpha = qa(0.5 + Math.sin(t * 3) * 0.1);
    ctx.drawImage(A.chiefRim.c, 0, 0, ch.w, ch.h, 320 - ch.ax * 3 - 4, cy - ch.ay * 3 - 3, ch.w * 3, ch.h * 3);
    ctx.globalAlpha = 1;
    ctx.drawImage(ch.c, 0, 0, ch.w, ch.h, 320 - ch.ax * 3, cy - ch.ay * 3, ch.w * 3, ch.h * 3);
    // the spear, well clear of his face, coming up as he rises
    const sp = A.spearClose, lift = clamp((T - KI.close - 0.2) / 0.55, 0, 1);
    ctx.save();
    ctx.translate(320 + 33, cy - 141 - R(lift * 8) + bob);
    ctx.rotate(lerp(-0.5, -1.15, lift));
    ctx.drawImage(sp.c, 0, 0, sp.w, sp.h, -18, -sp.ay * 3, sp.w * 3, sp.h * 3);
    ctx.restore();
    FX.render(ctx, 0, 0);
    this.vignette(ctx);
    this.letterbox(ctx, 1);
    // the name card slams in over his head
    const ck = clamp((T - KI.close) / 0.22, 0, 1);
    const fadeCard = T > KI.line + 0.6 ? clamp(1 - (T - KI.line - 0.6) / 0.4, 0, 1) : 1;
    if (ck > 0 && fadeCard > 0) {
      ctx.globalAlpha = qa(fadeCard);
      const ox = this.slab(ctx, 34, 28, ck, -1, '#000000');
      P(ctx, BP.red, ox, 33, 640, 2);
      P(ctx, '#ff6a3a', ox, 35, 640, 1);
      P(ctx, BP.red, ox, 62, 640, 1);
      pixelTextOutlined(ctx, 'THE VILLAGE CHIEF', 320 + ox, 39, 17, BP.gold, '#14141c', 'center');
      if (ck >= 1) pixelText(ctx, 'HE RIDES THE THING THAT TOOK HER', 320, 68, 7, '#ff9a72', 'center');
      ctx.globalAlpha = 1;
    }
    // and his line
    if (T >= KI.line) {
      const s = '"i put the iron in your mother."';
      const n = Math.min(s.length, Math.floor((T - KI.line) * 30));
      pixelTextOutlined(ctx, s.slice(0, n), 320, 338, 9, '#ffd7a0', '#000000', 'center');
      if (n < s.length && (Math.floor((T - KI.line) * 8) & 1)) P(ctx, '#ffd7a0', 320 + R(textWidth(s.slice(0, n), 9) / 2) + 2, 339, 4, 8);
    }
    if (k < 1) P(ctx, rgbaq('#000000', 1 - k), 0, 0, 640, 360);
  },

  // ---- CHIEF: the defeat --------------------------------------------------
  //  Nothing is burning.  The village is still standing off to the left with
  //  the lamps along its pier alight; the moon is the key, high and right;
  //  the water he went under in lights itself up; and the sun comes up on
  //  the beat her mother drifts past.
  drawDefeat(ctx, T, t) {
    // the plate cross-fades rather than cutting: night, then the hour before,
    // then the dawn, each one arriving under the beat it belongs to
    const dk = clamp((T - (KD.mother - 1.1)) / 1.3, 0, 1);
    const bi = dk <= 0 ? 0 : dk >= 1 ? 2 : 1;
    const bg = A.bayNight[bi];
    ctx.drawImage(bg, 0, 0);
    if (bi === 1) {                        // dither the next plate in over it
      const nx = dk < 0.55 ? A.bayNight[0] : A.bayNight[2];
      ctx.globalAlpha = qa(dk < 0.55 ? 1 - dk / 0.55 : (dk - 0.55) / 0.45);
      ctx.drawImage(nx, 0, 0);
      ctx.globalAlpha = 1;
    }
    const swell = bi === 2 ? A.swellDawn : bi === 1 ? A.swellPale : A.swellNight;
    this.swell(ctx, T, swell);
    // the lamps along the pier, guttering.  the only fire in this cut, and
    // it belongs to people who are still alive.
    for (let i = 0; i < TORCH.length; i++) {
      const tx = TORCH[i][0], ty = TORCH[i][1];
      const f = Math.floor(t * 11 + i * 2) % 3;
      const dim = bi === 2 ? 0.5 : 1;
      if (bi === 2 && (i & 1)) continue;   // some of them have gone out by dawn
      P(ctx, BP.fire[2], tx - 1, ty - 4, 3, 5);
      P(ctx, BP.fire[dim < 1 ? 2 : 3], tx, ty - 5 - f, 1, 4);
      P(ctx, BP.fire[4], tx, ty - 4, 1, 2);
    }

    const s = this._shk, c = this._chf, m = this._man, o = this._ott;
    // ---- what is sinking. drawn whole, then cut off at the waterline by
    //      re-blitting the baked sea over it: no alpha, no soft edges, and
    //      going under actually looks like going under.
    ctx.save();
    ctx.translate(R(s.x), R(s.y)); ctx.rotate(s.rot); ctx.scale(2, -2);
    ctx.drawImage(A.sharkNight.c, -A.sharkNight.ax, -A.sharkNight.ay);
    ctx.restore();
    ctx.save();
    ctx.translate(R(c.x), R(c.y)); ctx.rotate(c.rot); ctx.scale(2, 2);
    ctx.drawImage(A.chiefNight.c, -A.chiefNight.ax, -A.chiefNight.ay);
    ctx.restore();
    if (T > KD.slip && T < KD.rise + 0.8) {
      const k = (T - KD.slip);
      ctx.save();
      ctx.translate(R(DX - 30 + k * 26), R(190 + k * k * 96)); ctx.rotate(k * 3.4); ctx.scale(2, 2);
      ctx.drawImage(A.spearNight.c, -A.spearNight.ax, -A.spearNight.ay);
      ctx.restore();
    }
    ctx.drawImage(bg, 0, WLY, 640, 360 - WLY, 0, WLY, 640, 360 - WLY);
    if (bi === 1) {
      const nx = dk < 0.55 ? A.bayNight[0] : A.bayNight[2];
      ctx.globalAlpha = qa(dk < 0.55 ? 1 - dk / 0.55 : (dk - 0.55) / 0.45);
      ctx.drawImage(nx, 0, WLY, 640, 360 - WLY, 0, WLY, 640, 360 - WLY);
      ctx.globalAlpha = 1;
    }
    this.swell(ctx, T, swell);
    // froth along the cut, so the waterline reads as water and not as a crop
    if (s.y < WLY + 40) {
      const half = R(78 * clamp((WLY + 40 - s.y) / 60, 0, 1));
      for (let dx = -half; dx <= half; dx++) {
        const px = R(s.x) + dx, wob = R(Math.sin((px + T * 26) * 0.3) * 1.5);
        if (bay(px, T * 8) < 0.62) P(ctx, '#3a5a86', px, WLY - 2 + wob, 1, 2);
        if (bay(px + 2, T * 8 + 1) < 0.34) P(ctx, bi === 2 ? '#e8a878' : '#9fc2dc', px, WLY - 3 + wob, 1, 1);
      }
    }
    // ---- the water he went under in lights itself up.  Stirred hard enough,
    //      at night, it does: a cold bloom that swells and dies while the
    //      bubbles are still coming up through it.
    if (T > KD.slip - 0.1 && T < KD.slip + 2.6) {
      const bk = clamp((T - KD.slip + 0.1) / 2.6, 0, 1);
      const rg = A.bio[Math.min(7, Math.floor(bk * 8))];
      ctx.globalAlpha = qa(Math.sin(clamp(bk * 1.25, 0, 1) * Math.PI) * 0.9);
      ctx.drawImage(rg.c, DX - rg.ax, WLY + 6 - rg.ay);
      ctx.globalAlpha = qa(Math.sin(clamp(bk * 1.6, 0, 1) * Math.PI) * 0.55);
      const rg2 = A.bio[Math.min(7, Math.floor(bk * 5))];
      ctx.drawImage(rg2.c, DX - rg2.ax, WLY + 2 - rg2.ay);
      ctx.globalAlpha = 1;
      // and the specks of it that come up with the bubbles
      for (let i = 0; i < 20; i++) {
        const a = hash2(i, 3) * TAU + T * 0.6, rr = 12 + hash2(i, 7) * 62;
        const px = DX + R(Math.cos(a) * rr), py = WLY + 6 + R(Math.sin(a) * rr * 0.30);
        if (hash2(i, R(T * 9)) > 0.5) continue;
        P(ctx, i & 1 ? BP.biolum[4] : BP.biolum[5], px, py, 1, 1);
      }
    }
    // the foam still boiling where he went down
    if (T > KD.slip && T < KD.slip + 1.4) {
      const rk = clamp((T - KD.slip) / 1.4, 0, 1);
      const rg = A.ring[Math.min(7, Math.floor(rk * 8))];
      ctx.globalAlpha = qa(1 - rk);
      ctx.drawImage(rg.c, DX - rg.ax, WLY + 6 - rg.ay);
      ctx.globalAlpha = 1;
    }

    // ---- her mother, drifting past under the surface, right to left: the
    //      way a body goes when nobody is swimming it
    if (T >= KD.mother) {
      const mk = clamp((T - KD.mother) / 2.3, 0, 1);
      const g = A.ghost;
      const gx = R(lerp(596, 92, sstep(mk))), gy = 314 + R(Math.sin(mk * 3.1) * 5);
      ctx.save();
      ctx.globalAlpha = qa(Math.sin(clamp(mk, 0, 1) * Math.PI) * 1.0);
      ctx.translate(gx, gy); ctx.rotate(0.06 - mk * 0.12); ctx.scale(-MSC, MSC);
      ctx.drawImage(g.c, -g.ax, -g.ay);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // ---- her, up in the near water, with him standing on her back
    if (T >= KD.rise) {
      const k = clamp((T - KD.rise) / 1.05, 0, 1);
      const L = bi === 2 ? A.herDawn : A.herMoon, LO = bi === 2 ? A.himDawn : A.himMoon;
      if (k < 1) {
        const rg = A.ring[Math.min(7, Math.floor(k * 8))];
        ctx.drawImage(rg.c, DX - rg.ax, 318 - rg.ay);
      }
      // the water still coming off her back, in hard falling columns
      if (k < 1) for (let i = 0; i < 16; i++) {
        const dx = -76 + i * 10, hgt = R((1 - k) * 18 * (0.4 + hash2(i, 3)));
        if (hgt <= 0) continue;
        P(ctx, i & 1 ? '#c8e2ef' : (bi === 2 ? '#e8b088' : '#7f9fd0'), m.x + dx, m.y - 24 - hgt, 1, hgt);
      }
      // she faces the village she has just taken back
      const mby = R(m.y + Math.sin(T * 1.2) * 2);
      drawHer(ctx, L, {
        x: m.x, y: mby, flip: true, rot: m.dip,
        phase: T * 1.5, tailAmp: 0.10, flipperA: 2.45,
        exp: T > KD.mother + 0.4 ? 'sad' : 'calm',
        blink: (Math.floor(T * 1.7) & 7) === 3,
      }, t);
      // the water closing over her flank, so she sits IN the sea rather than
      // on top of it, with a broken line of foam where she breaks the surface
      const wl = mby + 17, vl = bi === 2 ? A.veilDawn : A.veilNight;
      ctx.drawImage(vl.c, m.x - vl.ax, wl);
      for (let dx = -96; dx <= 96; dx++) {
        const px = m.x + dx;
        const wob = R(Math.sin((px + T * 22) * 0.22) * 1.4);
        if (bay(px, R(T * 7)) < 0.5) P(ctx, bi === 2 ? '#e8b088' : '#7f9fd0', px, wl + wob, 1, 1);
      }
      // the lantern hooked on her plate: the one warm thing on her, and it
      // swings a little on its hook because she is moving under it
      const lx = R(m.x + 40), ly = R(m.y - 20 + Math.sin(T * 1.2) * 2);
      ctx.save(); ctx.translate(lx, ly - 18); ctx.rotate(Math.sin(T * 1.7) * 0.06);
      ctx.drawImage(A.lamp.c, -A.lamp.ax, -A.lamp.ay + 18);
      ctx.restore();
      P(ctx, BP.ink, lx - 1, ly - 30, 2, 12);
      const oy = R(o.y + Math.sin(T * 1.2) * 2 - Math.sin(t * 2));
      drawHim(ctx, LO, {
        x: o.x, y: oy, flip: true, bare: o.hat > 0.55,
        arms: [lerp(-0.25, -1.15, o.arm), lerp(0.35, 0.1, o.arm)],
        hold: o.arm < 0.5 ? A.rifleNight : null,
        tail: Math.sin(t * 1.6) * 0.12,
        headR: lerp(0, -0.16, o.hat),
      });
      // the hat: on his head until he takes it off, then held at his chest
      const h = LO.hat;
      if (o.hat > 0 && h) {
        const hx = R(lerp(o.x - 2, o.x + 9, o.hat)), hy = R(lerp(oy - 24, oy - 6, o.hat));
        ctx.save(); ctx.translate(hx, hy); ctx.scale(-MSC, MSC); ctx.rotate(lerp(0, 1.15, o.hat));
        ctx.drawImage(h.c, -h.ax, -h.ay); ctx.restore();
      }
    }
    FX.render(ctx, 0, 0);
    ctx.drawImage(A.vig, 0, 0);
    this.letterbox(ctx, 1);
    this.caption(ctx, LINES_D, T);
    if (T >= KD.ribbon) {
      const ck = slamK((T - KD.ribbon) / 0.28);
      const ox = this.slab(ctx, 40, 28, ck, 1, '#000000');
      P(ctx, BP.goldD, ox, 40, 640, 1);
      P(ctx, BP.goldD, ox, 67, 640, 1);
      if (T < KD.ribbon + 0.10) P(ctx, '#fff0c0', ox, 40, 640, 28);
      pixelTextOutlined(ctx, 'THE VILLAGE CHIEF IS DEAD', 320 + ox, 46, 14, BP.gold, '#14141c', 'center');
      const sub = clamp((T - KD.ribbon - 0.26) / 0.3, 0, 1);
      if (sub > 0) {
        ctx.globalAlpha = qa(sub);
        pixelText(ctx, 'THE BOATS WILL NOT FISH HERE AGAIN', 320, 74 - R((1 - sub) * 3), 7, '#e8b078', 'center');
        ctx.globalAlpha = 1;
      }
    }
  },

  // ---- MINI: the arrival --------------------------------------------------
  drawMiniIntro(ctx, T) {
    // one baked half-tone plate, blitted once: the bay goes properly black
    const dark = clamp(T / 0.16, 0, 1) * (T > KM.out ? clamp(1 - (T - KM.out) / 0.3, 0, 1) : 1);
    ctx.globalAlpha = qa(dark * 0.86); ctx.drawImage(A.ditherCyan, 0, 0); ctx.globalAlpha = 1;
    if (!this.anchored) { this.drawMini(ctx, 320, 214, T); FX.render(ctx, 0, 0); }
    const lb = clamp(T / 0.12, 0, 1) * (T > KM.out ? clamp(1 - (T - KM.out) / 0.28, 0, 1) : 1);
    this.letterbox(ctx, lb * 0.6);
    const ck = slamK((T - KM.card) / 0.20);
    if (ck <= 0) return;
    const out = T > KM.out ? clamp((T - KM.out) / 0.34, 0, 1) : 0;
    const fly = out * out * 760;
    const nameSize = this.fitSize(this.name, 560, 22);
    const topOx = this.slab(ctx, 54, 20, ck, -1, '#051820', -fly);
    const botOx = this.slab(ctx, 74, 36, ck, 1, '#071f28', fly);
    // the frame it lands on: the bands go hot for two, under the lettering
    if (T > KM.card + 0.17 && T < KM.card + 0.22) {
      P(ctx, BP.miniCyan[3], topOx, 54, 640, 20); P(ctx, BP.miniCyan[2], botOx, 74, 640, 36);
    }
    P(ctx, BP.miniCyan[2], topOx, 53, 640, 1);
    P(ctx, BP.miniCyan[4], topOx, 72, 640, 2);
    P(ctx, BP.miniCyan[1], topOx, 74, 640, 1);
    pixelText(ctx, 'THE WATER MOVES WRONG', 320 + topOx, 59, 8, BP.miniCyan[5], 'center');
    pixelTextOutlined(ctx, this.name, 320 + botOx, 82, nameSize, BP.gold, '#062028', 'center');
    P(ctx, BP.miniCyan[4], botOx, 109, 640, 1);
    P(ctx, BP.miniCyan[2], botOx, 110, 640, 1);
  },
  fitSize(s, maxW, start) {
    for (let sz = start; sz > 8; sz -= 2) if (textWidth(s, sz) <= maxW) return sz;
    return 8;
  },
  // the shape itself, rising out of the dark
  drawMini(ctx, cx, cy, T) {
    const k = clamp((T - KM.rise) / 0.55, 0, 1);
    const e = 1 - (1 - k) * (1 - k);
    const y = R(cy + (1 - e) * 44);
    // the shock the water takes when it comes up
    const sk = clamp(T / 0.42, 0, 1);
    if (sk < 1) {
      const fr = A.ringCyan[Math.min(7, Math.floor(sk * 8))];
      ctx.globalAlpha = qa(1 - sk * 0.7);
      ctx.drawImage(fr.c, R(cx) - fr.ax, R(cy) - fr.ay);
      ctx.globalAlpha = 1;
    }
    const ri = Math.min(7, Math.floor(clamp((T - 0.2) / 0.9, 0, 1) * 8));
    const rg = A.ringCyan[ri];
    ctx.globalAlpha = qa(clamp(1 - T / 1.2, 0.12, 1));
    ctx.drawImage(rg.c, R(cx) - rg.ax, R(cy) - rg.ay);
    ctx.globalAlpha = qa(0.4 + e * 0.6);
    ctx.drawImage(A.miniCyan.c, R(cx) - A.miniCyan.ax, y - A.miniCyan.ay);
    ctx.globalAlpha = 1;
    // the eyes come on last
    if (T > 0.34) {
      const f = (Math.floor(T * 22) & 1) || T > 0.55;
      const ex = R(cx) + 44, ey = y;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        P(ctx, f ? BP.red : '#5a0d12', ex, ey + sgn * 8 - 2, 5, 4);
        if (f) P(ctx, '#ffd0a0', ex + 1, ey + sgn * 8 - 1, 2, 2);
      }
    }
  },
  // ---- MINI: the sting ----------------------------------------------------
  drawMiniDefeat(ctx, T) {
    const dark = clamp(T / 0.1, 0, 1) * (T > KX.out ? clamp(1 - (T - KX.out) / 0.3, 0, 1) : 1);
    ctx.globalAlpha = qa(dark * 0.80); ctx.drawImage(A.ditherRed, 0, 0); ctx.globalAlpha = 1;
    if (!this.anchored) { this.drawMiniBreak(ctx, 320, 214, T); FX.render(ctx, 0, 0); }
    const lb = clamp(T / 0.1, 0, 1) * (T > KX.out ? clamp(1 - (T - KX.out) / 0.26, 0, 1) : 1);
    this.letterbox(ctx, lb * 0.55);
    const ck = slamK((T - KX.card) / 0.18);
    if (ck <= 0) return;
    const out = T > KX.out ? clamp((T - KX.out) / 0.34, 0, 1) : 0;
    const drop = R(out * out * 300);
    const nameSize = this.fitSize(this.name, 520, 18);
    const ox = this.slab(ctx, 58 + drop, 58, ck, -1, '#16070a');
    if (T > KX.card + 0.15 && T < KX.card + 0.20) P(ctx, BP.miniRed[2], ox, 58 + drop, 640, 58);
    P(ctx, BP.miniRed[3], ox, 58 + drop, 640, 1);
    P(ctx, BP.miniRed[1], ox, 59 + drop, 640, 1);
    P(ctx, BP.miniRed[1], ox, 114 + drop, 640, 1);
    P(ctx, BP.miniRed[3], ox, 115 + drop, 640, 1);
    pixelTextOutlined(ctx, this.name, 320 + ox, 64 + drop, nameSize, '#d8b0a0', '#1a0508', 'center');
    if (T >= KX.stamp) {
      // struck through, and stamped
      const w = Math.min(600, textWidth(this.name, nameSize) + 40);
      for (let i = 0; i < 4; i++) {
        P(ctx, i === 0 || i === 3 ? '#7a0d16' : BP.red, 320 - w / 2 + i * 2, 74 + drop + i, w, 1);
      }
      const sk = clamp((T - KX.stamp) / 0.1, 0, 1);
      ctx.globalAlpha = qa(sk);
      pixelTextOutlined(ctx, 'DOWN', 320, 88 + drop - R((1 - sk) * 6), R(lerp(30, 24, sk)), '#ffb04a', '#5c1010', 'center');
      ctx.globalAlpha = 1;
    }
  },
  drawMiniBreak(ctx, cx, cy, T) {
    const k = clamp(T / KX.crack, 0, 1);
    if (T < KX.crack + 0.5) {
      const gone = clamp((T - KX.crack) / 0.5, 0, 1);
      ctx.globalAlpha = qa((1 - gone) * 0.95);
      const s = T < KX.crack ? A.miniWhite : A.miniHot;
      const jitter = T < KX.crack ? R(rand(-2, 2)) : 0;
      ctx.drawImage(s.c, R(cx) - s.ax + jitter, R(cy) - s.ay, s.w, s.h);
      ctx.globalAlpha = 1;
    }
    if (T >= KX.crack) {
      const rg = A.ringRed[Math.min(7, Math.floor(clamp((T - KX.crack) / 0.7, 0, 1) * 8))];
      ctx.globalAlpha = qa(clamp(1 - (T - KX.crack) / 0.9, 0.1, 1));
      ctx.drawImage(rg.c, R(cx) - rg.ax, R(cy) - rg.ay);
      ctx.globalAlpha = 1;
    }
    // the blow itself: a dithered bloom, not a rectangle of tint
    if (k < 1) {
      const bl = A.blow[Math.min(A.blow.length - 1, Math.floor((1 - k) * A.blow.length))];
      ctx.drawImage(bl.c, R(cx) - bl.ax, R(cy) - bl.ay);
    }
  },
};

global.BossCut = BossCut;

// =========================================================================
//  THE BROTHER — the thread that runs between chapters
//
//  The intro leaves her with one fact: he went out on a different boat.
//  These are the beats that keep that fact alive across the world map.  One
//  plays after each chapter is cleared, each one moves the trail forward by
//  exactly one object, and each one is a little further past the point where
//  a sensible animal would have turned back.
//
//    'bro_trail'     ~5.4s  leaving the village.  a name to chase.
//    'bro_manifest'  ~5.8s  a wet manifest off the wreck.  he is a line item.
//    'bro_crate'     ~5.8s  a crate in the cannery yard with air holes in it.
//    'bro_tank'      ~6.0s  a deck tank, lid off, water still warm.
//    'bro_witness'   ~7.0s  an old bull in the Blackbone pens watched it go.
//    'bro_chart'     ~7.0s  the otter runs the string.  it leaves the paper.
//    'bro_deep'      ~8.0s  the payoff, if the last chapter wants it.
//
//  Same rules as the boss cuts: every plate is baked once in init() and
//  blitted, only the moving layer is drawn per frame, integer coordinates,
//  posterized bands, hard edges, no gradients.
//
//  Public API (see the contract in game.js):
//    StoryCut.init() / .start(id, opts) / .update(dt, t)
//    StoryCut.renderWorld(ctx, cam, t) / .renderScreen(ctx, t)
//    StoryCut.active / .worldActive / .done / .skip()
//    StoryCut.beats                 ordered list of ids
//    StoryCut.forChapter(n)         which id plays after chapter n
// =========================================================================

const SPAL = {
  // paper, from the shadow inside a fold out to bleached rag
  page:  ['#241a0e', '#3d2d18', '#584121', '#75592f', '#93753f', '#b09155',
          '#c9ae74', '#ddc796', '#eedcb6', '#faf0d4'],
  ink: '#1d1408', inkL: '#4a3418', red: '#b81f26', redD: '#5e0d12',
  wood:  ['#130c08', '#211610', '#32231a', '#452f21', '#5a3f2c', '#71533b', '#8a6a4c'],
  steel: ['#0b0f16', '#141b26', '#1f2937', '#2c3949', '#3d4c5f', '#536479', '#6d8095'],
  // warm sources
  torch: ['#2a1207', '#4e230c', '#7a3c14', '#a85c1c', '#d2842c', '#f5b455', '#ffdb9a'],
  sodium:['#2a1a06', '#4c300a', '#724a10', '#9c6c18', '#c89428', '#efc04e', '#ffe89a'],
  lamp:  ['#2c1a0a', '#523114', '#7e4d1c', '#ab7026', '#d49a36', '#f5c462', '#fff0b4'],
  // cold sources
  merc:  ['#07161a', '#0c2830', '#134048', '#1d5f64', '#2d8a86', '#52bdae', '#9ceccf'],
  vat:   ['#04150f', '#082a1c', '#0e442c', '#166440', '#238a58', '#3cb878', '#78e8ac'],
  shaft: ['#061524', '#0c2439', '#164058', '#215e80', '#3182ac', '#4ea6d4', '#7ac8ea'],
  // water with nothing burning in it
  night: ['#03050e', '#050915', '#070d1f', '#0a1229', '#0d1834', '#101f41', '#14264d', '#1a2e5a'],
  deep:  ['#010208', '#02040e', '#040718', '#060b22', '#08102e', '#0b163a', '#0e1d48'],
  bone: '#ded4bc', cold: '#9fb6d8', hot: '#ffbe72',
};

// the boat that took him.  the one word she has to follow.
const BOAT = 'HOLLOWAY';

// ---- shared furniture ---------------------------------------------------
function lbox(ctx, k) {
  const h = R(BAR * clamp(k === undefined ? 1 : k, 0, 1));
  if (h <= 0) return;
  P(ctx, '#000000', 0, 0, 640, h);
  P(ctx, '#000000', 0, 360 - h, 640, h);
}
// 0 narration, 1 the otter, 2 whoever else is talking
const CAPCOL = [['#e8eef4', '#000000'], ['#ffd67a', '#2a1404'], ['#b9e2cc', '#061a10']];
function capLines(ctx, lines, T) {
  let pick = -1;
  for (let i = 0; i < lines.length; i++) {
    if (T >= lines[i][0] && T <= lines[i][0] + lines[i][1] + 0.6) pick = i;
  }
  if (pick < 0) return;
  const L = lines[pick], prog = T - L[0], s = L[2], col = CAPCOL[L[3] || 0];
  const n = Math.max(0, Math.min(s.length, Math.floor(prog * 34)));
  const shown = s.slice(0, n);
  ctx.globalAlpha = T > L[0] + L[1] ? qa(1 - (T - L[0] - L[1]) / 0.6) : 1;
  pixelTextOutlined(ctx, shown, 320, 344, 8, col[0], col[1], 'center');
  if (n < s.length && (Math.floor(prog * 8) & 1)) P(ctx, col[0], 320 + R(textWidth(shown, 8) / 2) + 2, 345, 4, 7);
  ctx.globalAlpha = 1;
}
// a pool of coloured light as its own sprite, so it can flicker and swing
function poolSprite(rx, ry, ramp, bias) {
  const c = can(rx * 2 + 3, ry * 2 + 3), x = cx2(c);
  glowPool(x, rx + 1, ry + 1, rx, ry, ramp, bias === undefined ? 0.9 : bias);
  return spr(c, rx + 1, ry + 1);
}
function grainBake(x, w, h, col, amt) {
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) if (hash2(px * 3 + y, y * 7 + 5) < amt) P(x, col, px, y, 1, 1);
}
function vigBake(x, w, h, col, strength) {
  const hw = w * 0.62, hh = h * 0.62, C = hexToRgb(col);
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const dy = (y - h / 2) / hh, dy2 = dy * dy;
    for (let px = 0; px < w; px++) {
      const dx = (px - w / 2) / hw;
      const f = Math.sqrt(dx * dx + dy2);
      if (f < 0.52) continue;
      if (bay(px, y) >= Math.min(1, (f - 0.52) / 0.62) * strength) continue;
      const i = (y * w + px) * 4;
      d[i] = C[0]; d[i + 1] = C[1]; d[i + 2] = C[2]; d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
}
// a band of sky: posterized, ordered-dithered, written straight into pixels
function skyBand(ctx, y0, h, ramp, opt) {
  opt = opt || {};
  const b = pixBuf(640, h), cols = ramp.map(hexToRgb), n = cols.length;
  for (let y = 0; y < h; y++) {
    const base = Math.pow(y / (h - 1), opt.pow || 0.8) * (n - 1);
    for (let px = 0; px < 640; px++) {
      let fi = base + (hash2(px >> 3, y >> 1) - 0.5) * 0.09 * (n - 1);
      if (fi < 0) fi = 0; else if (fi > n - 1) fi = n - 1;
      let i = Math.floor(fi);
      if (bay(px, y + y0) < fi - i) i++;
      if (i > n - 1) i = n - 1;
      pset(b, cols[i], px, y);
    }
  }
  ctx.drawImage(pixTo(b), 0, y0);
  if (opt.stars) for (let i = 0; i < opt.stars; i++) {
    const sx = R(hash2(i, 3) * 640), sy = y0 + R(hash2(i, 11) * (h - 30)), br = hash2(i, 19);
    P(ctx, br > 0.88 ? '#e8f0ff' : br > 0.62 ? '#9fb6e0' : '#6a7fb0', sx, sy, 1, 1);
  }
}
// a band of sea, at any waterline: ramp, chop, and any number of light roads
function seaBand(ctx, y0, h, ramp, chopRamp, opt) {
  opt = opt || {};
  const b = pixBuf(640, h), cols = ramp.map(hexToRgb), n = cols.length;
  for (let y = 0; y < h; y++) {
    const u = y / (h - 1);
    for (let px = 0; px < 640; px++) {
      let v = 1 - Math.pow(u, opt.pow || 0.62) + (hash2(px >> 2, y) - 0.5) * 0.12;
      if (v < 0) v = 0; else if (v > 1) v = 1;
      const fi = v * (n - 1);
      let i = Math.floor(fi);
      if (bay(px, y + y0) < fi - i) i++;
      if (i < 0) i = 0; else if (i > n - 1) i = n - 1;
      pset(b, cols[i], px, y);
    }
  }
  const CH_ = chopRamp.map(hexToRgb);
  for (let y = 1; y < h; y++) {
    const u = y / h, step = 3 + R(u * 5), len = 1 + R(u * 4);
    let ci = Math.round((1 - Math.pow(u, 0.5)) * (CH_.length - 1));
    if (ci < 0) ci = 0; else if (ci > CH_.length - 1) ci = CH_.length - 1;
    let sx = R(hash2(y, 91) * 40);
    while (sx < 640) {
      if (hash2(sx * 3 + y, y * 7 + 11) < 0.40) { const C = CH_[ci]; for (let d = 0; d < len; d++) pset(b, C, sx + d, y); }
      sx += step + R(hash2(sx, y) * 9);
    }
  }
  const glows = opt.glows || [];
  for (const g of glows) {
    const gx = g[0], rmp = g[1].map(hexToRgb), reach = g[2] || 0.6, wid = g[3] || 26;
    const base = g[4] === undefined ? 3 : g[4], dens = g[5] === undefined ? 0.92 : g[5];
    const pw = g[6] === undefined ? 1 : g[6];
    for (let y = 0; y < h; y++) {
      const u = y / h; if (u > reach) break;
      const sp = base + u * wid, len = 1 + R(u * 2), depth = Math.pow(1 - u / reach, pw);
      for (let dx = -sp; dx <= sp; dx++) {
        const px = R(gx + dx); if (px < 0 || px > 639) continue;
        const fall = (1 - Math.abs(dx) / sp) * depth;
        if (fall <= 0 || bay(px, y + y0) > fall * dens) continue;
        let i = Math.floor(fall * rmp.length);
        if (i < 0) i = 0; else if (i > rmp.length - 1) i = rmp.length - 1;
        for (let d = 0; d < len; d++) pset(b, rmp[i], px + d, y);
      }
    }
  }
  ctx.drawImage(pixTo(b), 0, y0);
}
// a sheet of paper: soft in the middle, dirty at the edges, torn at the foot
function paperSheet(w, h, seed, tear) {
  const c = can(w, h), x = cx2(c);
  paintRamp(x, 0, 0, w, h, SPAL.page, function (u, px, py) {
    const ex = Math.min(px, w - 1 - px) / (w * 0.42), ey = Math.min(py, h - 1 - py) / (h * 0.42);
    const e = Math.min(1, Math.min(ex, ey));
    return 0.26 + e * 0.50 + (vnoise((px + seed * 13) / 11, (py + seed * 7) / 11) - 0.5) * 0.30;
  });
  // damp patches, where the sea got at it
  for (let i = 0; i < 7; i++) {
    const bx = R(hash2(seed, i) * w), by = R(hash2(i, seed + 3) * h), br = 5 + R(hash2(i, 9) * 11);
    for (let y = -br; y <= br; y++) for (let dx = -br; dx <= br; dx++) {
      const q = (dx / br) * (dx / br) + (y / (br * 0.7)) * (y / (br * 0.7));
      if (q > 1) continue;
      const f = 1 - Math.sqrt(q);
      P(x, f > 0.55 ? SPAL.page[4] : SPAL.page[5], bx + dx, by + y, 1, 1);
      if (f < 0.30 && bay(bx + dx, by + y) > 0.62) P(x, SPAL.page[6], bx + dx, by + y, 1, 1);
    }
  }
  // one hard crease down the middle
  const fx = R(w * 0.47);
  for (let y = 0; y < h; y++) { P(x, SPAL.page[3], fx, y, 1, 1); P(x, SPAL.page[8], fx + 1, y, 1, 1); }
  if (tear) {
    const img = x.getImageData(0, 0, w, h), d = img.data;
    for (let px = 0; px < w; px++) {
      const cut = h - 1 - R(vnoise(px / 7, seed * 3) * 9 + hash2(px, seed) * 4);
      for (let y = cut; y < h; y++) d[(y * w + px) * 4 + 3] = 0;
    }
    x.putImageData(img, 0, 0);
  }
  return c;
}

// =========================================================================
//  BAKED ART FOR THE BEATS
// =========================================================================
const S = {};
let SBUILT = false;

// ---- 1. open water, the night they left ---------------------------------
//  Nothing is burning.  The village is astern, standing, dark, with a couple
//  of lamps still going on its pier; the moon is ahead of them and lays a
//  road down the water they are swimming out along.
function buildOpenNight() {
  const c = can(640, 360), x = cx2(c);
  skyBand(x, 0, 190, BP.skyNight, { pow: 1.6, stars: 200 });
  for (let i = 0; i < 6; i++) {
    const cy = 46 + i * 21, cw = 64 + ((i * 71) % 118), cx0 = ((i * 173) % 700) - 50;
    P(x, '#070b1a', cx0, cy, cw, 3);
    P(x, '#0f1630', cx0 + 5, cy - 2, R(cw * 0.7), 2);
    for (let px = 0; px < cw; px++) {
      const f = Math.sin((px / cw) * Math.PI);
      if (bay(cx0 + px, cy) < f * 0.40) P(x, '#2b3f74', cx0 + px, cy + 3, 1, 1);
    }
  }
  // the village they just took back, a long way astern and still standing.
  // Drawn as a ridge line rather than a bar: the huts step down to the water
  // at the near end and thin out to a couple of stilts at the far one.
  const VIL = '#04050b';
  P(x, VIL, 0, 183, 150, 7);
  for (let sx = 4; sx < 150; sx += 13) P(x, VIL, sx, 190, 2, 7 + ((sx * 5) % 6));
  const HUTS = [[0, 15], [16, 11], [30, 17], [48, 9], [60, 14], [78, 20], [100, 12], [116, 16], [134, 8]];
  for (const h of HUTS) {
    const hx = h[0], hh = h[1], hw = 11 + (hh & 3);
    P(x, VIL, hx, 183 - hh, hw, hh);
    tri(x, VIL, hx - 3, 183 - hh, hx + hw + 3, 183 - hh, hx + hw / 2, 183 - hh - 5);
  }
  P(x, VIL, 82, 132, 2, 51);                        // the chief's pole, empty now
  P(x, VIL, 76, 132, 14, 2);
  // a last outrigger drawn up beyond the end of it, so the village stops
  // being a village instead of being cut off
  P(x, VIL, 160, 186, 16, 3); P(x, VIL, 166, 176, 2, 10);
  P(x, VIL, 186, 188, 10, 2);
  // three lamps still lit along it, and their short reach on the water
  for (const lx of [22, 96, 158]) {
    glowPool(x, lx, 178, 8, 6, BP.torchGlow, 0.42);
    P(x, BP.fire[3], lx, 177, 1, 2); P(x, BP.fire[4], lx, 178, 1, 1);
  }
  // the moon: their heading, and the only real light out here
  seaBand(x, 190, 170, BP.sea, BP.chopNight, {
    glows: [[22, BP.torchGlow, 0.12, 14, 2, 0.5], [96, BP.torchGlow, 0.12, 14, 2, 0.5], [158, BP.torchGlow, 0.12, 14, 2, 0.5],
            [508, BP.moonGlow, 1.0, 88, 10, 0.50, 0.34]],
  });
  vigBake(x, 640, 360, '#02030a', 0.44);
  // after the vignette: it is the one thing in the frame that should not be
  // dithered into the dark
  for (let r = 22; r > 17; r--) {
    for (let d = 0; d < 360; d += 3) {
      const px = 508 + R(Math.cos(d * 0.01745) * r), py = 58 + R(Math.sin(d * 0.01745) * r);
      if (bay(px, py) > (22 - r) / 5 * 0.4) continue;
      P(x, '#1b2a52', px, py, 1, 1);
    }
  }
  disc(x, 508, 58, 17, '#6b7ba6'); disc(x, 508, 58, 16, '#b8c4e2'); disc(x, 508, 58, 12, '#e6ecff');
  P(x, '#94a2c8', 502, 53, 4, 4); P(x, '#94a2c8', 512, 63, 5, 3); P(x, '#94a2c8', 510, 49, 3, 2);
  return c;
}

// ---- 2. the manifest ----------------------------------------------------
function buildManifestBg() {
  const c = can(640, 360), x = cx2(c);
  paintRamp(x, 0, 0, 640, 360, SPAL.night, function (u, px, py) {
    return 0.44 - u * 0.30 + (hash2(px >> 2, py >> 1) - 0.5) * 0.12;
  });
  // broken boat, still burning down to the waterline, off to the left
  P(x, '#05070f', 14, 196, 120, 66);
  LN(x, '#05070f', 56, 196, 34, 108, 5);
  LN(x, '#05070f', 92, 198, 116, 132, 3);
  for (let i = 0; i < 5; i++) LN(x, '#05070f', 40 + i * 20, 196, 46 + i * 20, 170 - (i % 3) * 14, 2);
  glowPool(x, 74, 210, 132, 54, SPAL.torch, 0.34);
  glowPool(x, 74, 206, 62, 24, SPAL.torch, 0.62);
  glowPool(x, 74, 204, 24, 11, BP.fire, 0.88);
  glowPool(x, 74, 203, 9, 5, ['#f5b455', '#ffe8b8', '#fffaec'], 0.98);
  seaBand(x, 262, 98, SPAL.deep, ['#0c1526', '#142038', '#1d2d4c', '#283c62'], {
    pow: 0.50, glows: [[74, SPAL.torch, 0.95, 120]],
  });
  // flotsam on the swell
  for (let i = 0; i < 9; i++) {
    const fx = R(hash2(i, 21) * 620), fy = 276 + R(hash2(i, 7) * 72), fw = 8 + R(hash2(i, 13) * 22);
    P(x, '#06070e', fx, fy, fw, 2 + (i & 1));
    if (fx < 260) P(x, mixHex('#06070e', '#a85c1c', 0.5), fx, fy, fw, 1);
  }
  vigBake(x, 640, 360, '#010208', 0.78);
  return c;
}
function buildManifest() {
  const W = 306, H = 200, c = can(W, H), x = cx2(c);
  x.drawImage(paperSheet(W, H, 5, true), 0, 0);
  const I = SPAL.ink, L = SPAL.inkL;
  pixelText(x, BOAT, 18, 14, 18, I, 'left', false);
  pixelText(x, 'LIVE CARGO / MANIFEST', 18, 36, 7, L, 'left', false);
  P(x, I, 16, 47, 272, 1); P(x, L, 16, 49, 272, 1);
  const ROWS = [
    ['12', 'CRUSHED ICE', 'SALT PIER'],
    ['40', 'ROCK SALT', 'SALT PIER'],
    ['01', 'JUV. MANATEE', 'LIVE'],
    ['06', 'DRUM, OIL', 'MARROW'],
    ['02', 'NETTING, BALE', 'MARROW'],
  ];
  for (let i = 0; i < ROWS.length; i++) {
    const y = 58 + i * 17, key = i === 2;
    pixelText(x, ROWS[i][0], 22, y, 8, key ? I : L, 'left', false);
    pixelText(x, ROWS[i][1], 48, y, 8, key ? I : L, 'left', false);
    pixelText(x, ROWS[i][2], 286, y, 8, key ? I : L, 'right', false);
    if (i < ROWS.length - 1) for (let px = 16; px < 288; px += 2) P(x, SPAL.page[4], px, y + 12, 1, 1);
  }
  pixelText(x, 'CONSIGNED OUT. NOT FOR THE SHEDS.', 18, 146, 7, L, 'left', false);
  pixelText(x, 'BEARER PAID IN FULL', 18, 158, 7, L, 'left', false);
  // a stamp, half off the edge, half worn away
  for (let i = 0; i < 3; i++) P(x, SPAL.redD, 198 + i, 128 + i, 88 - i * 2, 1);
  P(x, SPAL.redD, 198, 128, 2, 34); P(x, SPAL.redD, 284, 128, 2, 34);
  P(x, SPAL.redD, 198, 160, 88, 2);
  pixelText(x, 'SOLD', 242, 136, 14, SPAL.red, 'center', false);
  const img = x.getImageData(190, 120, 110, 50), d = img.data;      // wear the stamp
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % 110, py = ((i / 4) / 110) | 0;
    if (d[i + 3] > 8 && hash2(px + 190, py + 120) > 0.72 && d[i] > 90 && d[i + 1] < 90) {
      d[i] = 147; d[i + 1] = 118; d[i + 2] = 74;
    }
  }
  x.putImageData(img, 190, 120);
  // the torch is off to the left, so the far side of the page falls away
  {
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4; if (d[i + 3] < 9) continue;
      const f = Math.pow(px / (W - 1), 1.3) * 0.62 + Math.pow(py / (H - 1), 1.6) * 0.22;
      const q = bay(px, py) < 0.5 ? f : f * 0.8;
      d[i] = R(d[i] * (1 - q) + 18 * q);
      d[i + 1] = R(d[i + 1] * (1 - q) + 16 * q);
      d[i + 2] = R(d[i + 2] * (1 - q) + 34 * q);
    }
    x.putImageData(img, 0, 0);
  }
  outlineIt(c, '#150e05');
  // the torch is off to the left, so that is the edge that takes the light
  return spr(rimLight(c, -1, 0, '#ffe0a8', '#c08a44', 2), W / 2, H / 2);
}

// ---- 3. the cannery yard ------------------------------------------------
function buildYardNight() {
  const c = can(640, 360), x = cx2(c);
  skyBand(x, 0, 166, ['#04080f', '#06101a', '#081824', '#0b2130', '#0e2b3a', '#123545', '#164050'],
    { pow: 1.15, stars: 60 });
  // the stack, and the sheds up on the quay
  P(x, '#04070c', 470, 22, 26, 144); P(x, '#0b141c', 470, 22, 4, 144);
  P(x, '#04070c', 464, 18, 38, 6);
  for (let i = 0; i < 5; i++) {
    const bx = 30 + i * 86, bw = 62 + ((i * 29) % 26), bh = 40 + ((i * 17) % 24);
    P(x, '#04070c', bx, 166 - bh, bw, bh);
    tri(x, '#04070c', bx - 5, 166 - bh, bx + bw + 5, 166 - bh, bx + bw / 2, 166 - bh - 12);
    P(x, '#101c26', bx, 166 - bh, 2, bh);
    if (i !== 2) { P(x, '#c89428', bx + 12, 166 - bh + 11, 5, 5); P(x, '#724a10', bx + bw - 18, 166 - bh + 15, 4, 4); }
  }
  // the vats: cold green coming up out of them, right of frame
  for (let i = 0; i < 3; i++) {
    const vx = 512 + i * 40;
    P(x, '#07130f', vx, 150, 32, 16);
    glowPool(x, vx + 16, 150, 26, 12, SPAL.vat, 0.55);
    glowPool(x, vx + 16, 150, 13, 6, ['#238a58', '#3cb878', '#9cf0c0'], 0.9);
  }
  // the quay face, standing in the water: concrete, wet, going green at the foot
  paintRamp(x, 0, 166, 640, 84, ['#05070b', '#080c11', '#0c1219', '#111922', '#17222c', '#1e2c38'],
    function (u, px, py) { return 0.86 - Math.pow(u, 0.8) * 0.60 + (vnoise(px / 19, py / 11) - 0.5) * 0.28; });
  for (let px = 0; px < 640; px += 53) P(x, '#03050a', px, 166, 2, 84);
  for (let i = 0; i < 40; i++) {
    const wx = R(hash2(i, 5) * 640), wl = 6 + R(hash2(i, 11) * 22);
    P(x, i & 1 ? '#12291d' : '#2e2216', wx, 250 - wl, 1 + (i & 1), wl);
  }
  // the deck lip: planks out over the edge, and the piles under them
  P(x, '#03050a', 0, 244, 640, 3);
  paintRamp(x, 0, 247, 640, 17, SPAL.wood, function (u, px, py) {
    return 0.50 - u * 0.30 + (hash2(px >> 3, py) - 0.5) * 0.20 - (px > 470 ? 0.14 : 0);
  });
  for (let px = 0; px < 640; px += 17) P(x, '#0d0906', px, 247, 1, 17);
  for (let sx = 16; sx < 640; sx += 58) { P(x, '#05070c', sx, 264, 7, 30); P(x, '#05070c', sx - 4, 272, 15, 2); }
  // the sodium lamp on its pole.  everything warm in this shot comes off it.
  P(x, '#05070c', 130, 62, 5, 182);
  P(x, '#05070c', 122, 58, 28, 5);
  P(x, '#c89428', 128, 63, 10, 5);
  glowPool(x, 133, 72, 132, 104, SPAL.sodium, 0.30);
  glowPool(x, 133, 70, 46, 30, SPAL.sodium, 0.66);
  glowPool(x, 133, 67, 13, 9, ['#efc04e', '#ffe89a', '#fff8dc'], 0.98);
  // the cone it throws down onto the quay and the deck
  {
    const img = x.getImageData(0, 70, 640, 194), d = img.data;
    const CO = SPAL.sodium.map(hexToRgb);
    for (let y = 0; y < 194; y++) {
      const u = y / 194, half = 30 + u * 160;
      for (let dx = -half; dx <= half; dx++) {
        const px = R(133 + dx); if (px < 0 || px > 639) continue;
        const f = Math.pow(1 - Math.abs(dx) / half, 1.8) * (1 - u * 0.86) * 0.26;
        if (f <= 0 || bay(px, y + 70) > f) continue;
        const i = Math.min(5, Math.floor(f * 8) + 1), C = CO[i], q = (y * 640 + px) * 4;
        d[q] = C[0]; d[q + 1] = C[1]; d[q + 2] = C[2]; d[q + 3] = 255;
      }
    }
    x.putImageData(img, 0, 70);
  }
  seaBand(x, 264, 96, SPAL.night, ['#0e1c28', '#152736', '#1f3a42', '#2c5450'], {
    pow: 0.55,
    glows: [[133, SPAL.sodium, 0.96, 110], [560, SPAL.vat, 0.66, 76]],
  });
  vigBake(x, 640, 360, '#01030a', 0.68);
  return c;
}
function buildCrate() {
  const W = 126, H = 88, c = can(W, H), x = cx2(c);
  paintRamp(x, 0, 0, W, H, SPAL.wood, function (u, px, py) {
    return 0.60 - u * 0.22 + (vnoise(px / 11, py / 4) - 0.5) * 0.30;
  });
  for (let px = 0; px < W; px += 18) { P(x, '#0d0906', px, 0, 1, H); P(x, SPAL.wood[6], px + 1, 0, 1, H); }
  for (const by of [7, 68]) {
    P(x, '#171b22', 0, by, W, 8); P(x, '#323b47', 0, by, W, 2); P(x, '#0f1218', 0, by + 6, W, 2);
    for (let i = 0; i < 7; i++) P(x, '#63758a', 7 + i * 18, by + 3, 2, 2);
  }
  // air holes, drilled in a row.  somebody meant to land it alive.
  for (let i = 0; i < 6; i++) {
    const hx = 12 + i * 20, hy = 54;
    P(x, '#0a0805', hx, hy, 6, 6);
    P(x, '#000000', hx + 1, hy + 1, 4, 4);
    P(x, SPAL.wood[6], hx, hy + 6, 6, 1);
  }
  pixelText(x, BOAT, 57, 20, 17, '#c8bda0', 'center', false);
  pixelText(x, 'LOT 9 - LIVE - 1', 57, 40, 7, '#9c9179', 'center', false);
  {
    const img = x.getImageData(0, 16, W, 32), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % W, py = ((i / 4) / W) | 0;
      if (d[i] > 130 && bay(px, py + 16) > 0.60 && hash2(px, py) > 0.42) { d[i] = 86; d[i + 1] = 100; d[i + 2] = 74; }
    }
    x.putImageData(img, 0, 16);
  }
  // the lid is off and one corner is stoved in
  {
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let px = W - 40; px < W; px++) {
      const cut = R(Math.pow((px - (W - 40)) / 40, 1.5) * 44);
      for (let y = 0; y < cut; y++) d[(y * W + px) * 4 + 3] = 0;
    }
    x.putImageData(img, 0, 0);
  }
  for (let i = 0; i < 7; i++) {
    const sx = W - 38 + i * 5;
    P(x, SPAL.wood[2], sx, R(Math.pow(i / 7, 1.5) * 44) - 3, 2, 4 + (i & 3) * 3);
  }
  // claw marks, on the inside of the break
  for (let i = 0; i < 4; i++) LN(x, '#2d1d13', 90 + i * 5, 44, 97 + i * 5, 64, 1);
  outlineIt(c, '#08060a');
  // the sodium lamp is up and away to the left, the vats are cold and green
  // away to the right
  return spr(rimLight(rimLight(bounceLight(tintCanvas(c, '#0d1520', 0.30), '#2c4a44', 3, 0.7),
                               -1, -1, '#ffd884', '#b8762a', 2),
                      1, 0, '#1f7a52', null, 1), W / 2, H);
}

// ---- 4. the deck tank ---------------------------------------------------
function buildDeckDawn() {
  const c = can(640, 360), x = cx2(c);
  skyBand(x, 0, 172, BP.skyDawn, { pow: 1.4 });
  disc(x, 556, 150, 21, '#ffb972'); disc(x, 556, 150, 17, '#ffe6b8');
  for (let i = 0; i < 5; i++) {
    const cy = 40 + i * 25, cw = 78 + ((i * 83) % 130), cx0 = ((i * 197) % 700) - 60;
    P(x, '#3a2a4e', cx0, cy, cw, 3);
    P(x, '#2a2040', cx0 + 6, cy - 2, R(cw * 0.66), 2);
    for (let px = 0; px < cw; px++) {
      const f = Math.sin((px / cw) * Math.PI);
      if (bay(cx0 + px, cy) < f * 0.62) P(x, '#c4704e', cx0 + px, cy + 3, 1, 1);
    }
  }
  seaBand(x, 172, 188, BP.seaDawn, BP.chopDawn, { pow: 0.55, glows: [[556, ['#4a3050', '#7a4258', '#b0604c', '#e08a52', '#ffc07a'], 0.95, 60]] });
  // a far shore, in pieces, under the sun
  for (let i = 0; i < 14; i++) {
    const bx = 236 + i * 30 + ((i * 13) % 9), bw = 12 + ((i * 17) % 22), bh = 4 + ((i * 7) % 9);
    P(x, '#2a1c34', bx, 172 - bh, bw, bh + 2);
    if (i & 1) P(x, '#3c2844', bx + 2, 172 - bh - 3, 3, 4);
  }
  P(x, '#241730', 236, 171, 404, 2);
  vigBake(x, 640, 360, '#140a1c', 0.52);
  return c;
}
// the boat she found it on: side on, low in the water, nobody aboard
function buildHulk() {
  const W = 400, H = 104, c = can(W, H), x = cx2(c);
  // hull, 52px of it, sitting low
  paintRamp(x, 0, 52, W, 52, SPAL.steel, function (u, px, py) {
    return 0.26 + u * 0.26 + (hash2(px >> 2, py >> 1) - 0.5) * 0.16;
  });
  {
    const img = x.getImageData(0, 52, W, 52), d = img.data;
    for (let px = 0; px < W; px++) {
      const u = px / (W - 1);
      const top = R(Math.pow(Math.abs(u - 0.46) * 2, 3.0) * 12);
      const bot = 52 - R(Math.pow(Math.abs(u - 0.44) * 2, 4.0) * 20);
      for (let y = 0; y < 52; y++) if (y < top || y > bot) d[(y * W + px) * 4 + 3] = 0;
    }
    x.putImageData(img, 0, 52);
  }
  P(x, '#7a2a1e', 0, 80, W, 4);
  for (let px = 0; px < W; px++) if (bay(px, 84) < 0.5) P(x, '#5a1f16', px, 84, 1, 2);
  for (let i = 0; i < 24; i++) P(x, '#1b2431', 18 + i * 15, 68 + ((i * 7) % 5), 2, 2);
  // deck line and gunwale
  P(x, '#0b0f16', 6, 48, W - 18, 7);
  P(x, '#4c5d72', 6, 48, W - 18, 2);
  for (let i = 0; i < 10; i++) { P(x, '#1f2937', 26 + i * 36, 40, 4, 9); P(x, '#3d4c5f', 26 + i * 36, 40, 1, 9); }
  // wheelhouse, aft, and a mast forward with a boom swung out
  P(x, '#141b26', 292, 10, 82, 40); P(x, '#2c3949', 292, 10, 82, 4);
  P(x, '#0b0f16', 298, 19, 70, 15); P(x, '#3d6480', 300, 21, 66, 11);
  for (let i = 0; i < 4; i++) P(x, '#0b0f16', 316 + i * 17, 19, 2, 15);
  P(x, '#1f2937', 214, 0, 4, 50); P(x, '#3d4c5f', 214, 0, 1, 50);
  LN(x, '#1f2937', 216, 10, 138, 34, 2);
  for (let i = 0; i < 4; i++) P(x, '#141b26', 150 + i * 20, 34 + i * 2, 2, 7 + i * 3);
  outlineIt(c, BP.ink);
  return spr(rimLight(c, 1, 0, '#ffc888', '#b8623a', 2), 0, H);
}
function buildTank() {
  const W = 108, H = 74, c = can(W, H), x = cx2(c);
  // the far rim, across the top
  P(x, '#1f2937', 4, 0, W - 8, 7); P(x, '#8195ab', 4, 0, W - 8, 2); P(x, '#0b0f16', 4, 5, W - 8, 2);
  // the inside: the far wall with the dawn on the top of it, then the drop
  paintRamp(x, 6, 6, W - 12, 12, ['#26323f', '#3c4b5c', '#566878', '#728496', '#94a6b8'],
    function (u, px, py) { return 0.94 - Math.pow(u, 0.7) * 0.90 + (hash2(px >> 1, py) - 0.5) * 0.18; });
  paintRamp(x, 6, 18, W - 12, 18, ['#02050a', '#04070e', '#070c14', '#0b121c'],
    function (u, px, py) { return 0.96 - u * 0.90 + (hash2(px >> 1, py) - 0.5) * 0.16; });
  // the near rim, standing proud of it, catching the sun along its top edge
  P(x, '#1f2937', 0, 34, W, 9); P(x, '#a8bcd0', 0, 34, W, 2); P(x, '#4c5d72', 0, 36, W, 2);
  P(x, '#0b0f16', 0, 41, W, 2);
  P(x, '#2c3949', 0, 0, 6, 43); P(x, '#2c3949', W - 6, 0, 6, 43);
  P(x, '#6d8095', 0, 0, 2, 43); P(x, '#6d8095', W - 2, 0, 2, 43);
  // the near wall
  paintRamp(x, 0, 43, W, H - 43, SPAL.steel, function (u, px, py) {
    return 0.34 + u * 0.24 + (hash2(px >> 2, py >> 1) - 0.5) * 0.14;
  });
  for (const rx of [18, 52, 86]) { P(x, '#141b26', rx, 43, 4, H - 43); P(x, '#3d4c5f', rx, 43, 1, H - 43); }
  for (let i = 0; i < 10; i++) P(x, '#536479', 8 + (i % 5) * 20, 48 + ((i / 5) | 0) * 20, 2, 2);
  for (let i = 0; i < 30; i++) {
    const rx = R(hash2(i, 31) * W), ry = 44 + R(hash2(i, 17) * (H - 46));
    P(x, '#6d3a1e', rx, ry, 1 + (i & 1), 1 + (i & 2));
  }
  pixelText(x, BOAT + ' 4', 54, 52, 10, '#9fb0c0', 'center', false);
  {
    const img = x.getImageData(0, 48, W, 20), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % W, py = ((i / 4) / W) | 0;
      if (d[i] > 120 && hash2(px, py + 48) > 0.52) { d[i] = 61; d[i + 1] = 76; d[i + 2] = 95; }
    }
    x.putImageData(img, 0, 48);
  }
  outlineIt(c, BP.ink);
  return spr(rimLight(c, 1, 0, '#ffc888', '#a8562e', 2), W / 2, H);
}
// the lid, thrown off and left where it landed
function buildTankLid() {
  const c = can(104, 30), x = cx2(c);
  P(x, '#1f2937', 0, 6, 104, 18); P(x, '#8195ab', 0, 6, 104, 3); P(x, '#0b0f16', 0, 20, 104, 4);
  for (let i = 0; i < 6; i++) { P(x, '#141b26', 7 + i * 17, 6, 3, 18); P(x, '#4c5d72', 7 + i * 17, 6, 1, 18); }
  for (let i = 0; i < 5; i++) P(x, '#63758a', 14 + i * 19, 13, 3, 3);
  P(x, '#2c3949', 38, 0, 28, 7); P(x, '#6d8095', 38, 0, 28, 2);
  for (let i = 0; i < 26; i++) P(x, '#6d3a1e', R(hash2(i, 5) * 104), 8 + R(hash2(i, 9) * 14), 2, 1);
  outlineIt(c, BP.ink);
  return spr(rimLight(c, 1, -1, '#ffc888', '#a8562e', 2), 52, 28);
}

// ---- 5. the pens at Blackbone -------------------------------------------
function buildPens() {
  const c = can(640, 360), x = cx2(c);
  paintRamp(x, 0, 0, 640, 240, ['#04060a', '#070b12', '#0a111a', '#0e1822', '#12202c', '#172938'],
    function (u, px, py) { return 0.20 + u * 0.55 + (hash2(px >> 3, py >> 1) - 0.5) * 0.14; });
  // the gantry overhead, and the chain hanging off it
  P(x, '#04060a', 0, 26, 640, 16);
  for (let i = 0; i < 22; i++) { LN(x, '#0c121a', i * 30, 42, i * 30 + 30, 26, 2); LN(x, '#0c121a', i * 30, 26, i * 30 + 30, 42, 2); }
  P(x, '#04060a', 0, 20, 640, 7);
  for (let i = 0; i < 9; i++) { P(x, '#161f2a', 392, 42 + i * 11, 6, 7); P(x, '#2c3949', 393, 43 + i * 11, 2, 5); }
  P(x, '#161f2a', 386, 142, 18, 12);
  // the mercury lamp, right of centre: hard, cold, and pointed at the water
  P(x, '#04060a', 470, 40, 6, 34);
  P(x, '#0c141c', 456, 72, 34, 12);
  glowPool(x, 473, 82, 118, 132, SPAL.merc, 0.30);
  glowPool(x, 473, 80, 34, 22, SPAL.merc, 0.72);
  glowPool(x, 473, 78, 12, 8, ['#52bdae', '#9ceccf', '#e4fff4'], 0.98);
  // a bulb on a flex at the left, the only warm thing in the building
  P(x, '#04060a', 104, 26, 2, 42);
  glowPool(x, 105, 74, 74, 64, SPAL.lamp, 0.34);
  glowPool(x, 105, 72, 22, 16, SPAL.lamp, 0.80);
  // the back wall: concrete, wet, with the tide line still on it
  paintRamp(x, 0, 150, 640, 74, ['#06080c', '#0a0e13', '#0f151c', '#151d26', '#1c2732'],
    function (u, px, py) { return 0.24 + u * 0.46 + (vnoise(px / 17, py / 9) - 0.5) * 0.34; });
  for (let px = 0; px < 640; px++) if (bay(px, 206) < 0.62) P(x, '#2a3a3e', px, 206, 1, 2);
  for (let i = 0; i < 44; i++) {                       // weed and rust running down it
    const wx = R(hash2(i, 5) * 640), wl = 8 + R(hash2(i, 11) * 26);
    P(x, i & 1 ? '#13291f' : '#3a2416', wx, 208 - wl, 1 + (i & 1), wl);
  }
  // the pen water
  seaBand(x, 224, 136, SPAL.deep, ['#0e2028', '#153038', '#1d4a48', '#2a6a5e'], {
    pow: 0.5, glows: [[473, SPAL.merc, 0.95, 96], [105, SPAL.lamp, 0.60, 62]],
  });
  vigBake(x, 640, 360, '#01030a', 0.72);
  return c;
}
// the bars between her pen and his
function buildPenBars() {
  const c = can(96, 300), x = cx2(c);
  for (let i = 0; i < 5; i++) {
    const bx = i * 20 + 4;
    P(x, '#0a0e14', bx, 0, 8, 300);
    P(x, '#2c3949', bx, 0, 2, 300);
    P(x, '#050709', bx + 6, 0, 2, 300);
    for (let y = 40; y < 300; y += 60) P(x, '#1b2431', bx - 2, y, 12, 5);
  }
  P(x, '#0a0e14', 0, 44, 96, 11); P(x, '#2c3949', 0, 44, 96, 2);
  P(x, '#0a0e14', 0, 190, 96, 11); P(x, '#2c3949', 0, 190, 96, 2);
  return spr(rimLight(c, 1, 0, '#6ad0bc', '#1d5f64', 1), 48, 0);
}
// Bake the cast's side-on animal into one sprite at an integer scale, so a
// beat that only needs her shape can blit it instead of composing her.
function bakeSide(scale, opt) {
  opt = opt || {};
  const S = CH.side;
  const W = R(S.body.w * scale) + 48, H = R(S.body.h * scale) + 56;
  const c = can(W, H), x = cx2(c);
  drawHer(x, {
    body: cast1x(opt.scarred ? S.bodyScar : S.body), fluke: cast1x(S.fluke),
    flip: cast1x(S.flip), flipFar: cast1x(S.flipFar), belly: cast1x(S.belly),
  }, { x: W / 2, y: H / 2, scale: scale, phase: opt.phase || 0,
       tailAmp: opt.tailAmp === undefined ? 0.18 : opt.tailAmp,
       flipperA: opt.flipperA, exp: opt.exp || 'calm', belly: opt.belly }, 0);
  return { c: c, W: W, H: H, x: x };
}
// the old bull in the next pen: the same animal she is, three times over and
// forty years further into it.  Same cast body, then everything the years did
// to it painted on at the scale he is drawn — and clipped back to his own
// silhouette, so nothing hangs off him.
function buildBull() {
  const k = 3, b = bakeSide(k, { exp: 'angry', tailAmp: 0.05, flipperA: 2.62 });
  const x = b.x, W = b.W, H = b.H, cx0 = W / 2, cy0 = H / 2;
  const mask = x.getImageData(0, 0, W, H).data.slice();
  // propeller scars nobody stitched, running across the barrel
  for (let i = 0; i < 6; i++) {
    const sx = cx0 - 66 + i * 25;
    LN(x, '#8d8896', sx, cy0 - 30 + (i & 3) * 7, sx + 20, cy0 - 14 + (i & 3) * 7, 1);
    LN(x, '#4c4856', sx, cy0 - 29 + (i & 3) * 7, sx + 20, cy0 - 13 + (i & 3) * 7, 1);
  }
  // a length of old harpoon line, still through the flipper
  for (let i = 0; i < 3; i++) LN(x, '#5a4630', cx0 + 20 + i, cy0 + 14, cx0 - 26 + i, cy0 + 34, 1);
  // clip everything back inside him
  {
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let i = 3; i < d.length; i += 4) if (mask[i] < 9) d[i] = 0;
    x.putImageData(img, 0, 0);
  }
  // the one thing that is allowed to hang off him: the end of that line,
  // trailing in the water behind his flipper
  for (let i = 0; i < 4; i++) LN(x, '#4a3a26', cx0 - 26 - i * 2, cy0 + 34, cx0 - 44 - i * 2, cy0 + 40, 1);
  P(x, '#7a6848', cx0 - 52, cy0 + 38, 8, 3);
  return spr(x.canvas, cx0, cy0);
}

// ---- 6. the chart -------------------------------------------------------
function buildChartBg() {
  const c = can(640, 360), x = cx2(c);
  skyBand(x, 0, 116, SPAL.night, { pow: 1.5, stars: 130 });
  seaBand(x, 116, 244, SPAL.night, BP.chopNight, { pow: 0.7 });
  // her back, filling the bottom of the frame: she is the table.  tail off
  // to the left, the broad of her back under the chart, her head at the right.
  const top = new Int16Array(640);
  for (let px = 0; px < 640; px++) {
    const u = px / 639;
    let y;
    if (u < 0.70) y = 318 - Math.pow(Math.sin(Math.pow(clamp(u / 0.78, 0, 1), 0.55) * Math.PI), 0.45) * 132;
    else if (u < 0.79) y = 190 + (u - 0.70) / 0.09 * 34;                  // the neck
    else y = 224 - Math.sin(clamp((u - 0.79) / 0.21, 0, 1) * Math.PI) * 40;  // the head
    top[px] = R(y + Math.sin(px * 0.09) * 0.9);
  }
  {
    const ramp = ['#08080c', '#0f0e14', '#18171f', '#22202a', '#2d2b36', '#3a3743'].map(hexToRgb);
    const img = x.getImageData(0, 150, 640, 210), d = img.data;
    for (let px = 0; px < 640; px++) {
      const ty = top[px];
      for (let y = ty; y < 360; y++) {
        const dv = (y - ty) / (360 - ty);
        const v = 0.74 - dv * 0.64 + (hash2(px >> 2, y >> 1) - 0.5) * 0.18;
        let i = Math.floor(clamp(v, 0, 0.999) * ramp.length);
        if (bay(px, y) < 0.4) i = Math.max(0, i - 1);
        const C = y === ty ? [134, 128, 148] : y === ty + 1 ? [96, 92, 108] : ramp[i], q = ((y - 150) * 640 + px) * 4;
        d[q] = C[0]; d[q + 1] = C[1]; d[q + 2] = C[2]; d[q + 3] = 255;
      }
    }
    x.putImageData(img, 0, 150);
  }
  // her tail, off to the left, where the back runs out
  tri(x, '#14131a', 0, 262, 58, 314, 0, 348);
  P(x, '#3a3743', 0, 262, 4, 86);
  for (let i = 0; i < 26; i++) P(x, '#2d2b36', 4 + i, 264 + i * 2, 1, 2);
  // propeller scars, on the part of her the chart does not cover
  for (let i = 0; i < 5; i++) LN(x, '#7d7788', 26 + i * 15, top[26 + i * 15] + 12 + i * 5, 64 + i * 15, top[64 + i * 15] + 32 + i * 5, 2);
  // her eye, and the whiskers on her: she is watching him work
  P(x, '#04040a', 592, 200, 9, 9); P(x, '#251f2c', 593, 201, 7, 7);
  P(x, '#e4dfec', 594, 202, 3, 3);
  P(x, '#04040a', 606, 226, 30, 4); P(x, '#4c4954', 606, 224, 30, 2);
  for (let i = 0; i < 5; i++) P(x, '#c9c4d0', 618 + (i & 1) * 4, 210 + i * 4, 4, 1);
  // the plate bolted across her shoulder
  P(x, BP.ink, 438, 218, 110, 26); P(x, '#2e374a', 440, 220, 106, 22);
  P(x, '#55627c', 440, 220, 106, 5); P(x, '#1e2634', 440, 236, 106, 6);
  for (let i = 0; i < 5; i++) { P(x, BP.ink, 450 + i * 22, 226, 6, 6); P(x, '#8b9ab2', 451 + i * 22, 227, 4, 4); }
  // the lamp, hooked on the plate, is the only warm thing in the frame
  glowPool(x, 512, 202, 104, 72, SPAL.lamp, 0.17);
  glowPool(x, 512, 200, 34, 24, SPAL.lamp, 0.40);
  vigBake(x, 640, 360, '#01030a', 0.66);
  return c;
}
function buildChart() {
  const W = 288, H = 176, c = can(W, H), x = cx2(c);
  x.drawImage(paperSheet(W, H, 11, false), 0, 0);
  const I = SPAL.ink, L = SPAL.inkL;
  P(x, I, 0, 0, W, 1); P(x, I, 0, H - 1, W, 1); P(x, I, 0, 0, 1, H); P(x, I, W - 1, 0, 1, H);
  P(x, L, 3, 3, W - 6, 1); P(x, L, 3, H - 4, W - 6, 1); P(x, L, 3, 3, 1, H - 6); P(x, L, W - 4, 3, 1, H - 6);
  for (let px = 8; px < W - 8; px += 8) P(x, L, px, 4, 1, 3);       // ticks
  for (let py = 8; py < H - 8; py += 8) P(x, L, 4, py, 3, 1);
  // the coast: a hard ink line down the left, hatched on the land side
  const cst = [];
  for (let y = 8; y < H - 8; y++) {
    const cx0 = 38 + R(Math.sin(y * 0.09) * 13 + Math.sin(y * 0.031) * 18 + vnoise(y / 6, 3) * 7);
    cst.push(cx0);
    P(x, I, cx0, y, 2, 1);
    for (let px = 6; px < cx0; px++) if (bay(px, y) < 0.16) P(x, L, px, y, 1, 1);
  }
  // soundings, scattered out in the open water
  for (let i = 0; i < 44; i++) {
    const sx = 70 + R(hash2(i, 41) * 200), sy = 14 + R(hash2(i, 23) * (H - 30));
    pixelText(x, String(9 + R(hash2(i, 7) * 80)), sx, sy, 6, L, 'left', false);
  }
  // the six places, in the order the chart gets them
  const MARK = [
    [52, 148, 'VILLAGE'], [96, 116, 'SALT PIER'], [140, 138, 'MARROW'],
    [186, 96, 'BLACKBONE'], [226, 130, 'SHOALS'], [276, 66, ''],
  ];
  for (let i = 0; i < MARK.length - 1; i++) {
    const m = MARK[i];
    P(x, I, m[0] - 3, m[1] - 3, 7, 7); P(x, SPAL.page[8], m[0] - 1, m[1] - 1, 3, 3);
    pixelText(x, m[2], m[0] + (i === 4 ? -6 : 6), m[1] - 3, 6, I, i === 4 ? 'right' : 'left', false);
  }
  // and the edge of what anybody surveyed
  for (let y = 10; y < H - 10; y += 4) P(x, L, 258, y, 1, 2);
  pixelText(x, 'CHART ENDS', 254, 14, 6, L, 'right', false);
  pixelText(x, BOAT + ' RUNS', 12, H - 14, 7, I, 'left', false);
  // the lamp is hooked on her plate away to the right, so the paper falls off
  // hard towards the far corner.  Without this the chart is the brightest
  // thing in a night shot and reads as a light source.
  {
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4; if (d[i + 3] < 9) continue;
      const f = Math.pow(1 - px / (W - 1), 1.25) * 0.66 + Math.pow(1 - py / (H - 1), 1.5) * 0.20 + 0.10;
      const q = bay(px, py) < 0.5 ? f : f * 0.86;
      d[i] = R(d[i] * (1 - q) + 12 * q);
      d[i + 1] = R(d[i + 1] * (1 - q) + 14 * q);
      d[i + 2] = R(d[i + 2] * (1 - q) + 30 * q);
    }
    x.putImageData(img, 0, 0);
  }
  outlineIt(c, '#150e05');
  return { spr: spr(rimLight(c, 1, -1, '#ffe0a0', '#c08a44', 2), W / 2, H / 2), mark: MARK };
}
function buildPin() {
  const c = can(7, 7), x = cx2(c);
  P(x, SPAL.redD, 1, 1, 5, 5); P(x, SPAL.red, 2, 1, 3, 3); P(x, '#ff8a76', 2, 1, 2, 1);
  return spr(outlineIt(c, '#1a0508'), 3, 3);
}

// ---- 7. the deep roads --------------------------------------------------
function buildDeepBg() {
  const c = can(640, 360), x = cx2(c);
  paintRamp(x, 0, 0, 640, 360, ['#000106', '#01030c', '#020615', '#030a1f', '#050f2a', '#071536', '#091c44', '#0c2454'],
    function (u, px, py) {
      return 0.98 - Math.pow(u, 0.58) * 0.94 + (hash2(px >> 2, py >> 1) - 0.5) * 0.10;
    });
  // one shaft of cold light, coming down past the hull
  {
    const img = x.getImageData(0, 0, 640, 340), d = img.data;
    const CO = SPAL.shaft.map(hexToRgb), n = CO.length;
    for (let y = 0; y < 340; y++) {
      const u = y / 340, half = 34 + u * 104, cx0 = 252 + u * 44;
      for (let dx = -half; dx <= half; dx++) {
        const px = R(cx0 + dx); if (px < 0 || px > 639) continue;
        const fall = Math.pow(1 - Math.abs(dx) / half, 0.75) * (1 - Math.pow(u, 0.7) * 0.86);
        if (fall <= 0 || bay(px, y) > fall * 1.55) continue;
        let i = Math.floor(fall * (n + 2)); if (i > n - 1) i = n - 1;
        const C = CO[i], q = (y * 640 + px) * 4;
        d[q] = C[0]; d[q + 1] = C[1]; d[q + 2] = C[2]; d[q + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }
  // the underside of a hull, black against it, right across the top
  for (let px = 0; px < 640; px++) {
    const k = 46 + R(Math.sin(px * 0.011 + 1.2) * 9 + Math.sin(px * 0.043) * 4);
    P(x, '#000106', px, 0, 1, k);
    if (bay(px, k) < 0.42) P(x, '#0e2140', px, k, 1, 1);
    if (bay(px, k - 1) < 0.2) P(x, '#1d4060', px, k - 1, 1, 1);
  }
  P(x, '#000106', 470, 40, 11, 40);
  for (let i = 0; i < 3; i++) triOutlined(x, '#000106', '#0a1830',
    [476, 78], [476 + Math.cos(i * 2.1) * 34, 78 + Math.sin(i * 2.1) * 22], [476 + Math.cos(i * 2.1 + 0.6) * 29, 78 + Math.sin(i * 2.1 + 0.6) * 19]);
  // the chain the cage hangs on, going up into the hull
  for (let i = 0; i < 8; i++) { P(x, '#000106', 296, 44 + i * 10, 8, 8); P(x, '#1d4060', 297, 45 + i * 10, 2, 6); }
  // marine snow, most of it baked
  for (let i = 0; i < 1100; i++) {
    const sx = R(hash2(i, 77) * 640), sy = R(hash2(i, 13) * 360);
    const nr = sy < 330 && Math.abs(sx - (250 + (sy / 330) * 46)) < 30 + (sy / 330) * 96;
    P(x, nr ? '#4d76a8' : '#0e1a30', sx, sy, 1, 1);
  }
  vigBake(x, 640, 360, '#000105', 0.72);
  return c;
}
function buildCage() {
  const W = 196, H = 168;
  // the frame is the only part that takes the light.  rim-lighting the net
  // would put a highlight on every knot and the whole thing reads as brick.
  const fr = can(W, H), fx = cx2(fr);
  for (let i = 0; i < 6; i++) { P(fx, '#111b2a', 8 + i * 36, 12, 6, H - 26); P(fx, '#2a3c56', 8 + i * 36, 12, 2, H - 26); }
  for (const by of [12, 88, H - 18]) { P(fx, '#111b2a', 4, by, W - 8, 7); P(fx, '#2a3c56', 4, by, W - 8, 2); }
  LN(fx, '#111b2a', 36, 14, 94, 0, 4); LN(fx, '#111b2a', 160, 14, 102, 0, 4);
  outlineIt(fr, '#000208');
  rimLight(fr, 0, -1, '#4a86c0', '#132a44', 2);
  const c = can(W, H), x = cx2(c);
  for (let y = 20; y < H - 20; y += 6) for (let px = 8; px < W - 8; px += 6) {
    P(x, '#071122', px, y, 5, 1); P(x, '#071122', px, y, 1, 5);
    if (bay(px, y) < 0.3) P(x, '#132440', px, y, 1, 1);
  }
  x.drawImage(fr, 0, 0);
  return spr(c, W / 2, 0);
}

// him: the same animal, half her size, and roped.  He is a juvenile, so he
// is the cast's own body drawn at one pixel per unit beside her two.
function buildBrother() {
  const b = bakeSide(1, { exp: 'sad', tailAmp: 0.04, flipperA: 2.45 });
  const x = b.x, cx0 = b.W / 2, cy0 = b.H / 2;
  // rope round the tail stock, and a lot tag hanging off it
  for (let i = 0; i < 3; i++) P(x, '#5a4630', cx0 - 30 + i * 4, cy0 - 9, 2, 19);
  P(x, '#8a7550', cx0 - 33, cy0 - 3, 16, 2);
  P(x, BP.ink, cx0 - 42, cy0 + 4, 10, 7);
  P(x, '#c8bda0', cx0 - 41, cy0 + 5, 8, 5);
  P(x, '#5a4630', cx0 - 37, cy0 + 6, 3, 1);
  return spr(x.canvas, cx0, cy0);
}

// =========================================================================
//  TIMING AND WORDS
// =========================================================================
// [at, hold, text, voice]   voice: 0 narration, 1 otter, 2 somebody else
const BEATS_DEF = [
  {
    id: 'bro_trail', dur: 5.6, chapter: 0,
    lines: [
      [0.30, 1.35, 'they left the village standing.', 0],
      [2.00, 1.30, 'he was not in it.', 0],
      [3.55, 1.50, 'so we find the boat.', 1],
    ],
  },
  {
    id: 'bro_manifest', dur: 5.9, chapter: 1,
    lines: [
      [0.35, 1.30, 'the wreck gave up its paperwork.', 0],
      [2.05, 1.50, 'one live juvenile. crated north.', 1],
      [3.95, 1.30, 'somebody had written him down.', 0],
    ],
  },
  {
    id: 'bro_crate', dur: 5.9, chapter: 2,
    lines: [
      [0.35, 1.20, 'the cannery yard, afterwards.', 0],
      [1.90, 1.50, 'one crate had air holes in it.', 0],
      [3.75, 1.40, 'two weeks cold. he is ahead of us.', 1],
    ],
  },
  {
    id: 'bro_tank', dur: 6.1, chapter: 3,
    lines: [
      [0.35, 1.30, 'they keep the live ones on deck.', 0],
      [2.05, 1.30, 'the lid was already off.', 0],
      [3.70, 1.60, 'still warm. we missed him by a tide.', 1],
    ],
  },
  {
    id: 'bro_witness', dur: 7.0, chapter: 4,
    lines: [
      [0.35, 1.30, 'the pens were not empty.', 0],
      [1.95, 1.40, 'white boat. quiet engine.', 2],
      [3.55, 1.50, 'grey. small. would not stop calling.', 2],
      [5.25, 1.30, 'they took him out past the shoals.', 2],
    ],
  },
  {
    id: 'bro_chart', dur: 7.0, chapter: 5,
    lines: [
      [0.35, 1.40, 'the otter worked on her back all night.', 0],
      [2.15, 1.60, 'every boat we sank was running one line.', 1],
      [4.05, 1.30, 'it goes off the paper.', 1],
      [5.55, 1.20, 'she did not sleep either.', 0],
    ],
  },
  {
    id: 'bro_deep', dur: 8.0, chapter: 6,
    lines: [
      [0.35, 1.30, 'past the last mark on the chart.', 0],
      [2.00, 1.50, 'down there the bottom is made of hulls.', 0],
      [3.85, 1.30, 'and one of them is hung with cages.', 0],
      [5.45, 1.00, "that's him.", 1],
      [6.70, 1.10, "that's him.", 1],
    ],
  },
];

// =========================================================================
//  THE SCENE
// =========================================================================
const StoryCut = {
  id: null, active: false, worldActive: true, done: true,
  t: 0, dur: 0, lines: null, shake: 0, flash: 0, fade: 0,
  _fired: null, _o: null,

  beats: BEATS_DEF.map(function (b) { return b.id; }),
  forChapter(n) {
    for (const b of BEATS_DEF) if (b.chapter === (n | 0)) return b.id;
    return null;
  },

  // ----------------------------------------------------------------- init
  init() {
    if (SBUILT) return;
    BossCut.init();                                  // her, the otter, the swell
    if (!BUILT) return;                              // CH is not up yet: stay unbuilt
    try {
      S.open = buildOpenNight();
      S.manBg = buildManifestBg();
      S.manifest = buildManifest();
      S.yard = buildYardNight();
      S.crate = buildCrate();
      S.deck = buildDeckDawn();
      S.hulk = buildHulk();
      S.tank = buildTank();
      S.lid = buildTankLid();
      S.pens = buildPens();
      S.bars = buildPenBars();
      S.bull = buildBull();
      S.chartBg = buildChartBg();
      const ch = buildChart();
      S.chart = ch.spr; S.chartMark = ch.mark;
      S.pin = buildPin();
      S.penVeil = buildVeil(300, 44, '#0b1c26', '#050d16');
      S.deepBg = buildDeepBg();
      S.cage = buildCage();
      S.kid = buildBrother();
      // the moving pools of light
      S.torchPool = poolSprite(46, 34, SPAL.torch, 0.55);
      S.lampPool = poolSprite(34, 26, SPAL.lamp, 0.62);
      S.sodPool = poolSprite(40, 30, SPAL.sodium, 0.58);
      // lit copies of the two of them, one set per beat's key light.  Darken
      // first, then paint the light back on: a figure at night is not a
      // daytime figure with a coloured edge.  Directions POINT AT the light,
      // in the sprite's own space — mirrored where the beat draws them
      // mirrored, which is noted at each one.
      const NIGHT = ['#0b1226', 0.58], DIM = ['#101828', 0.40], WET = ['#08131c', 0.52];
      // 1. open water: the moon is high and right, her own lantern is above
      //    her back.  She swims to the right, unmirrored.
      S.herNight = herLit({ dark: NIGHT, edge: '#03050e',
                            dirs: [[1, -1, '#7d97cc', '#33507e'], [-1, 0, '#c9883c', null, 1]],
                            far: [[1, -1, '#2c4670', null, 1]] });
      S.himNight = himLit({ dark: NIGHT, edge: '#03050e',  exp: 'idle',
                            dirs: [[1, -1, '#8aa4d8', '#3a5888'], [-1, 0, '#d8933c', null, 1]],
                            far: [[1, -1, '#2c4670', null, 1]] });
      // 3. the cannery: one sodium lamp up and to the left, the vats cold and
      //    green away to the right.  She is unmirrored, he is mirrored.
      S.herSod = herLit({ dark: NIGHT, edge: '#04060e',
                          dirs: [[1, 0, '#1f7a52', null, 1], [-1, -1, '#c89a4c', '#7a4c10', 1]],
                          far: [[-1, -1, '#7a4c10', null, 1]] });
      S.himSod = himLit({ dark: NIGHT, edge: '#04060e', exp: 'idle',
                          dirs: [[-1, 0, '#1f7a52', null, 1], [1, -1, '#e8b85c', '#8c5a14', 2]],
                          far: [[1, -1, '#8c5a14', null, 1]] });
      // 4. the deck at dawn: the sun is low and right of frame, and both of
      //    them are mirrored, so in their own space it is off to the left.
      S.herDawnS = herLit({ dark: DIM, edge: '#0b0916', dirs: [[-1, -1, '#ffc888', '#b8623a'], [1, 1, '#5a4e86', null, 1]],
                            far: [[-1, -1, '#7a5a80', null, 1]] });
      S.himDawnS = himLit({ dark: DIM, edge: '#0b0916', exp: 'idle', dirs: [[-1, -1, '#ffc888', '#b8623a']],
                            far: [[-1, -1, '#7a5a80', null, 1]] });
      // 5. the pens: a mercury lamp straight overhead, one warm bulb a long
      //    way off to the left.  Both mirrored.
      S.herMerc = herLit({ dark: WET, edge: '#03080d', dirs: [[0, -1, '#7ce4cc', '#1d5f64'], [1, 0, '#c07a2e', null, 1]],
                           far: [[0, -1, '#1d5f64', null, 1]] });
      S.himMerc = himLit({ dark: WET, edge: '#03080d', exp: 'idle', dirs: [[0, -1, '#7ce4cc', '#1d5f64'], [1, 0, '#c07a2e', null, 1]],
                           far: [[0, -1, '#1d5f64', null, 1]] });
      // 6. the chart: one hooded lamp, hooked on her plate to his right.
      //    He is mirrored, so it is on his left.
      S.himLamp = himLit({ dark: NIGHT, edge: '#04060e', exp: 'idle', dirs: [[-1, 0, '#ffd67a', '#a8701c']],
                           far: [[-1, 0, '#a8701c', null, 1]] });
      // 7. the deep: one shaft of cold coming down past them, her lantern
      //    warm beside her.  Both mirrored.
      const DEEP = ['#061020', 0.62];
      S.herDeep = herLit({ dark: DEEP, edge: '#02040c', dirs: [[1, -1, '#5c9ad0', '#1d4868'], [-1, 0, '#ffb44a', '#8c5418', 2]],
                           far: [[1, -1, '#1d4868', null, 1]] });
      S.himDeep = himLit({ dark: ['#061020', 0.55], edge: '#02040c', exp: 'idle',
                           dirs: [[1, -1, '#5c9ad0', '#1d4868'], [-1, 0, '#ffc060', '#a86c20', 2]],
                           far: [[1, -1, '#1d4868', null, 1]] });
      // the old bull: the mercury lamp is up and to his right, the far bulb
      // is a scrap of warmth off to his left
      S.bullLit = spr(rimLight(rimLight(darkEdge(tintCanvas(cloneSpr(S.bull), '#04101a', 0.80), '#02080e'),
                                        1, -1, '#59c0b0', '#17505c', 2),
                               -1, 0, '#8a5a24', null, 1), S.bull.ax, S.bull.ay);
      // her brother, hanging in the shaft: lit from straight above, cold
      S.kidLit = spr(rimLight(rimLight(tintCanvas(cloneSpr(S.kid), '#071628', 0.50), 0, -1, '#9cd4ff', '#2d6490', 2),
                              1, 0, '#5c9ad0', null, 1), S.kid.ax, S.kid.ay);
      S.buf = can(640, 360); S.bufCtx = cx2(S.buf);
      const wc = cx2(can(8, 8));
      const warm = function (o) { if (!o) return; const c = o.c || o; if (c && c.width) wc.drawImage(c, 0, 0, c.width, c.height, 0, 0, 8, 8); };
      for (const k in S) { const v = S[k]; if (Array.isArray(v)) v.forEach(warm); else warm(v); }
      SBUILT = true;
    } catch (e) { SBUILT = false; if (typeof console !== 'undefined') console.error('StoryCut bake', e); }
  },

  // ---------------------------------------------------------------- start
  start(id, opts) {
    opts = opts || {};
    this.init();
    let def = null;
    for (const b of BEATS_DEF) if (b.id === id) def = b;
    this.t = 0; this.shake = 0; this.flash = 0; this.fade = 0;
    this._fired = {};
    FX.clear();
    if (!SBUILT || !def) {                           // never throw, never hang
      this.id = null; this.active = false; this.done = true; this.worldActive = true; return;
    }
    this.id = def.id; this.dur = def.dur; this.lines = def.lines;
    this.active = true; this.done = false; this.worldActive = false;
    this._o = { a: 0, b: 0, c: 0 };
    const A_ = typeof Audio_ !== 'undefined' ? Audio_ : null;
    this.sfx(function () {
      if (id === 'bro_deep') { A_.tone(38, 2.4, 'sine', 0.24, 6); A_.noise(2.0, 0.06, 180, 24); }
      else if (id === 'bro_trail') { A_.tone(58, 1.8, 'sine', 0.18, -6); A_.noise(1.4, 0.06, 300, 40); }
      else A_.tone(72, 1.2, 'sine', 0.16, -10);
    });
  },

  skip() {
    this.active = false; this.done = true; this.worldActive = true;
    this.id = null; this.t = 0; this.fade = 0; this.flash = 0; this.shake = 0;
    FX.clear();
  },
  finish() {
    this.active = false; this.done = true; this.worldActive = true;
    this.id = null; FX.clear();
  },
  sfx(fn) { try { if (typeof Audio_ !== 'undefined') fn(); } catch (e) { } },
  cue(key, at, fn) {
    if (this.t < at || this._fired[key]) return false;
    this._fired[key] = true; this.sfx(fn); return true;
  },

  // --------------------------------------------------------------- update
  update(dt, t) {
    if (this.done || !this.id) return;
    if (dt > 1 / 20) dt = 1 / 20;
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 6);
    FX.update(dt);
    const T = this.t, o = this._o;
    switch (this.id) {
      case 'bro_trail':
        o.a = sstep(clamp((T - 0.2) / 5.0, 0, 1));       // the long pull out
        if (Math.random() < 11 * dt) FX.drop(rand(120, 560), rand(276, 300), 1, 0.35, 12);
        this.cue('go', 3.45, function () { Audio_.tone(108, 0.6, 'sawtooth', 0.14, -26); });
        break;
      case 'bro_manifest':
        o.a = clamp((T - 1.9) / 1.5, 0, 1);              // the ring goes round
        if (Math.random() < 16 * dt) FX.ember(rand(40, 120), rand(190, 220), 1);
        this.cue('ring', 1.9, function () { Audio_.noise(0.5, 0.06, 2600, 500); });
        this.cue('tap', 3.9, function () { Audio_.tone(150, 0.2, 'square', 0.16, -60); });
        break;
      case 'bro_crate':
        o.a = clamp((T - 0.9) / 1.2, 0, 1);              // she noses it round
        o.b = T > 2.6 ? clamp((T - 2.6) / 0.9, 0, 1) : 0;
        if (this.cue('shove', 0.9, function () { Audio_.splash(1.2); Audio_.tone(90, 0.4, 'square', 0.14, -40); })) FX.drop(268, 292, 18, 1.1, 22);
        if (Math.random() < 5 * dt) FX.drop(rand(200, 340), 292, 1, 0.5, 8);
        break;
      case 'bro_tank':
        o.a = clamp((T - 0.5) / 2.0, 0, 1);              // the push in
        if (Math.random() < 14 * dt) FX.drop(rand(196, 300), 188, 1, 0.5, 10);
        this.cue('slop', 2.0, function () { Audio_.splash(0.8); });
        this.cue('gull', 3.6, function () { Audio_.tone(880, 0.16, 'triangle', 0.05, -200); });
        break;
      case 'bro_witness':
        // he talks in bubbles, because he is mostly under
        o.a = (T > 1.9 && T < 3.5) || (T > 3.5 && T < 5.2) || (T > 5.2 && T < 6.7) ? 1 : 0;
        if (o.a && Math.random() < 26 * dt) FX.bub(228 + rand(-4, 8), 292 + rand(-3, 3), 1);
        if (Math.random() < 5 * dt) FX.bub(rand(60, 210), rand(300, 330), 1);
        this.cue('bull', 1.9, function () { Audio_.tone(74, 1.2, 'sine', 0.16, -8); });
        this.cue('bull2', 3.5, function () { Audio_.tone(66, 1.4, 'sine', 0.14, -6); });
        this.cue('bull3', 5.2, function () { Audio_.tone(58, 1.6, 'sine', 0.13, -5); });
        break;
      case 'bro_chart':
        o.a = clamp((T - 1.3) / 3.0, 0, 1);              // the string, pin to pin
        this.cue('p1', 1.5, function () { Audio_.tone(420, 0.07, 'square', 0.10, -120); });
        this.cue('p2', 2.3, function () { Audio_.tone(400, 0.07, 'square', 0.10, -120); });
        this.cue('p3', 3.1, function () { Audio_.tone(380, 0.07, 'square', 0.10, -120); });
        this.cue('p4', 3.9, function () { Audio_.tone(360, 0.07, 'square', 0.10, -120); });
        this.cue('off', 4.6, function () { Audio_.tone(200, 0.4, 'sawtooth', 0.14, -50); });
        break;
      case 'bro_deep':
        o.a = clamp((T - 0.4) / 3.4, 0, 1);              // she comes up out of it
        o.b = T > 5.0 ? clamp((T - 5.0) / 0.7, 0, 1) : 0;  // he opens his eye
        if (Math.random() < 10 * dt) FX.bub(rand(140, 500), rand(300, 356), 1);
        if (this.cue('eye', 5.1, function () { Audio_.tone(196, 0.5, 'sine', 0.14, 60); Audio_.tone(294, 0.6, 'sine', 0.09, 40); })) this.flash = 0.22;
        this.cue('eye2', 6.6, function () { Audio_.tone(262, 0.9, 'sine', 0.13, 30); Audio_.tone(392, 1.0, 'sine', 0.08, 24); });
        break;
    }
    // hand back: fade ourselves out over whatever the game puts underneath
    this.fade = clamp((T - (this.dur - 0.5)) / 0.5, 0, 1);
    if (this.fade > 0) this.worldActive = true;
    if (T > this.dur) this.finish();
  },

  // =======================================================================
  //  RENDER
  // =======================================================================
  // nothing here lives in world space; the hook is kept so game.js can call it
  renderWorld(ctx, cam, t) { },

  renderScreen(ctx, t) {
    if (this.done || !this.id || !SBUILT) return;
    if (this.fade > 0.02) {
      const a = qa(1 - this.fade);
      if (a <= 0) return;
      const bx = S.bufCtx;
      bx.clearRect(0, 0, 640, 360);
      this.paint(bx, t);
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = a;
      ctx.drawImage(S.buf, 0, 0);
      ctx.restore();
      return;
    }
    this.paint(ctx, t);
  },
  paint(ctx, t) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const sh = this.shake;
    if (sh > 0.4) ctx.translate(R(rand(-sh, sh)), R(rand(-sh, sh)));
    const T = this.t;
    switch (this.id) {
      case 'bro_trail': this.drawTrail(ctx, T, t); break;
      case 'bro_manifest': this.drawManifest(ctx, T, t); break;
      case 'bro_crate': this.drawCrate(ctx, T, t); break;
      case 'bro_tank': this.drawTank(ctx, T, t); break;
      case 'bro_witness': this.drawWitness(ctx, T, t); break;
      case 'bro_chart': this.drawChart(ctx, T, t); break;
      case 'bro_deep': this.drawDeep(ctx, T, t); break;
    }
    ctx.restore();
    // the fade up off black at the head of every beat
    const up = clamp(this.t / 0.40, 0, 1);
    if (up < 1) P(ctx, rgbaq('#000000', 1 - up), 0, 0, 640, 360);
    lbox(ctx, clamp(this.t / 0.18, 0, 1));
    capLines(ctx, this.lines, this.t);
    if (this.flash > 0.02) P(ctx, rgbaq('#ffffff', Math.min(0.7, this.flash)), 0, 0, 640, 360);
  },
  // a flickering pool of light, blitted, not rebuilt
  pool(ctx, s, x, y, t, amp, base) {
    ctx.globalAlpha = qa((base || 0.62) + Math.sin(t * 13.7) * (amp || 0.10) + Math.sin(t * 31.1) * (amp || 0.10) * 0.5);
    ctx.drawImage(s.c, R(x) - s.ax, R(y) - s.ay);
    ctx.globalAlpha = 1;
  },
  // the two of them, together: she out of the cast's own parts so her fluke
  // still beats, him standing on her back.  o carries whatever the beat wants
  // to say about the pose.
  pair(ctx, x, y, her, him, t, flip, ride, o) {
    o = o || {};
    drawHer(ctx, her, {
      x: x, y: y, flip: flip, rot: o.rot,
      phase: (o.phase === undefined ? t * 1.4 : o.phase),
      tailAmp: o.tailAmp === undefined ? 0.13 : o.tailAmp,
      flipperA: o.flipperA, exp: o.exp || 'calm',
      blink: (Math.floor(t * 1.9 + (o.seed || 0)) & 7) === 3,
    }, t);
    if (!him) return;
    const oy = R(y - (ride === undefined ? 22 : ride) - Math.sin(t * 2));
    drawHim(ctx, him, {
      x: R(x + (flip ? -14 : 14)), y: oy, flip: flip,
      arms: o.arms, hold: o.hold, headR: o.headR,
      tail: Math.sin(t * 1.7 + (o.seed || 0)) * 0.12,
    });
  },

  // ---- 1. leaving ---------------------------------------------------------
  //  She swims out of the village's last light and into the moon's.  The
  //  travel is the shot: she starts small against the pier and ends up on
  //  the moon road with nothing behind her.
  drawTrail(ctx, T, t) {
    ctx.drawImage(S.open, 0, 0);
    BossCut.swell(ctx, T, A.swellNight);
    const k = this._o.a;
    const y = 286 + R(Math.sin(T * 1.05) * 3);
    const x = R(lerp(158, 452, k));
    // the wake she is pulling behind her, longer the further she has come
    const wake = 12 + R(k * 22);
    for (let i = 0; i < wake; i++) {
      const wx = x - 88 - i * 8, f = 1 - i / wake;
      if (wx < -8) break;
      if (bay(wx, y + 18) > f * 0.72) continue;
      P(ctx, i < 6 ? BP.foam[3] : i < 14 ? BP.foam[2] : BP.foam[1], wx, y + 18 + R(Math.sin(T * 3 + i * 0.7) * 2), 3 + (i < 8 ? 1 : 0), 1);
    }
    // the moon road broken where she is standing in it
    this.pair(ctx, x, y, S.herNight, S.himNight, t, false, 24,
      { phase: T * 2.1, tailAmp: 0.20, exp: 'calm' });
    // her lantern, hooked on the plate, and the little pool it throws
    const lx = R(x - 34), ly = R(y - 20 + Math.sin(T * 1.05) * 3);
    this.pool(ctx, S.lampPool, lx, ly - 10, t, 0.05, 0.34);
    ctx.save(); ctx.translate(lx, ly - 18); ctx.rotate(Math.sin(T * 1.9) * 0.07);
    ctx.drawImage(A.lamp.c, -A.lamp.ax, -A.lamp.ay + 18);
    ctx.restore();
    P(ctx, BP.ink, lx - 1, ly - 30, 2, 12);
    FX.render(ctx, 0, 0);
  },

  // ---- 2. the manifest ----------------------------------------------------
  drawManifest(ctx, T, t) {
    ctx.drawImage(S.manBg, 0, 0);
    this.pool(ctx, S.torchPool, 74, 206, t, 0.08, 0.66);
    const s = S.manifest;
    const px = 352, py = 172 + R(Math.sin(T * 1.7) * 2);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.045 + Math.sin(T * 0.9) * 0.012);
    ctx.drawImage(s.c, -s.ax, -s.ay);
    // the ring he puts round the line, drawn as it is drawn
    const k = this._o.a;
    if (k > 0) {
      // row index 2 of the manifest: the one that is a live animal
      const cx0 = 150 - s.ax, cy0 = 95 - s.ay, rx = 132, ry = 9;
      const n = Math.floor(k * 80);
      for (let i = 0; i < n; i++) {
        const a = -1.25 + (i / 80) * TAU * 1.08;
        const rr = rx * (1 + Math.sin(i * 0.4) * 0.012);
        const qx = R(cx0 + Math.cos(a) * rr), qy = R(cy0 + Math.sin(a) * ry);
        P(ctx, SPAL.red, qx, qy, 2, 2);
        if (i % 3 === 0) P(ctx, SPAL.redD, qx, qy + 2, 2, 1);
      }
    }
    ctx.restore();
    // his paws, curled over the side edges: somebody is holding this up
    const hy = py + 12;
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      const hx = px + sgn * 152;
      const warm = sgn < 0;                            // the torch is off to the left
      const PAD = warm ? '#9c4d24' : '#4e250f', LIP = warm ? '#c8703c' : '#68320f';
      const FIN = warm ? '#c8703c' : '#5e2c13', FTP = warm ? '#e89050' : '#783a18';
      // the back of the paw, behind the page edge
      P(ctx, BP.ink, hx - 17, hy - 26, 34, 54);
      P(ctx, PAD, hx - 16, hy - 25, 32, 52);
      P(ctx, LIP, hx - 16, hy - 25, 32, 8);
      if (warm) P(ctx, '#ffb45a', hx - 16, hy - 25, 3, 52);
      // four fingers, over the front of the paper, longest in the middle
      for (let i = 0; i < 4; i++) {
        const len = 16 + [4, 12, 11, 2][i], fy = hy - 20 + i * 13;
        const x0 = sgn < 0 ? hx - 4 : hx + 4 - len;
        P(ctx, BP.ink, x0 - 1, fy - 1, len + 2, 11);
        P(ctx, FIN, x0, fy, len, 9);
        P(ctx, FTP, x0, fy, len, 3);
        P(ctx, BP.ink, sgn < 0 ? x0 + len - 1 : x0, fy, 1, 9);          // the rounded tip
        P(ctx, FIN, sgn < 0 ? x0 + len : x0 - 1, fy + 3, 1, 3);
        P(ctx, '#e8d3ae', sgn < 0 ? x0 + len : x0 - 2, fy + 3, 2, 3);   // a claw on it
        P(ctx, BP.ink, sgn < 0 ? x0 + len + 2 : x0 - 3, fy + 3, 1, 3);
      }
    }
    FX.render(ctx, 0, 0);
  },

  // ---- 3. the crate -------------------------------------------------------
  drawCrate(ctx, T, t) {
    ctx.drawImage(S.yard, 0, 0);
    this.pool(ctx, S.sodPool, 133, 70, t, 0.06, 0.70);
    const k = this._o.a;
    const cx0 = R(lerp(296, 312, k)), cy0 = 306 + R(Math.sin(T * 1.3) * 2);
    ctx.save();
    ctx.translate(cx0, cy0);
    ctx.rotate(lerp(0.38, 0.09, k * k));
    ctx.drawImage(S.crate.c, -S.crate.ax, -S.crate.ay);
    // two of the air holes still have a little warm light behind them
    if (this._o.b > 0) {
      ctx.globalAlpha = qa(this._o.b * 0.55);
      P(ctx, '#7a4a18', -51, -34, 6, 6); P(ctx, '#7a4a18', -11, -34, 6, 6);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // the water breaking round the corner of it
    for (let px = 0; px < 108; px++) {
      const wy = 300 + R(Math.sin((px + T * 34) * 0.10) * 2);
      if (bay(cx0 - 62 + px, wy) > 0.55) continue;
      P(ctx, px < 30 ? '#c8a060' : '#2c5450', cx0 - 62 + px, wy, 2, 1);
    }
    // her, in the water, nose against the wood
    const my = 322 + R(Math.sin(T * 1.1) * 2);
    this.pair(ctx, R(lerp(150, 176, k)), my, S.herSod, null, t, false, 22,
      { phase: T * 1.2, tailAmp: 0.09, exp: 'angry' });
    // the otter up on the deck lip, looking down into it
    const oy = 244 + R(Math.sin(t * 2));
    drawHim(ctx, S.himSod, { x: 398, y: oy, flip: true,
      arms: [-0.9 + Math.sin(t * 1.3) * 0.06, 0.55], headR: 0.22,
      tail: Math.sin(t * 1.5) * 0.10 });
    FX.render(ctx, 0, 0);
  },

  // ---- 4. the tank --------------------------------------------------------
  drawTank(ctx, T, t) {
    ctx.drawImage(S.deck, 0, 0);
    const k = this._o.a, e = k * k * (3 - 2 * k);
    const ox = R(lerp(6, -16, e)), oy = R(lerp(-4, 5, e));
    const rock = R(Math.sin(T * 0.8) * 2);
    ctx.save();
    ctx.translate(ox, oy + rock);
    ctx.drawImage(S.hulk.c, 104, 306 - S.hulk.h);
    // the lid, off, flat on the deck where somebody dropped it
    ctx.drawImage(S.lid.c, 346 - S.lid.ax, 258 - S.lid.ay);
    const tk = S.tank, ty = 258;
    ctx.drawImage(tk.c, 232 - tk.ax, ty - tk.h);
    // the film of water left in the bottom of it, still moving
    const iy = ty - tk.h + 33;
    for (let px = 0; px < 94; px++) {
      const h = 1 + R(Math.abs(Math.sin((px + T * 44) * 0.10)) * 2 + Math.sin(T * 5 + px * 0.2) * 1.2);
      P(ctx, px & 1 ? '#3a5878' : '#22384f', 185 + px, iy - h, 1, h + 2);
      if (h > 2) P(ctx, bay(px, iy) < 0.5 ? '#d8a878' : '#8fb0cc', 185 + px, iy - h, 1, 1);
    }
    // and some of it going over the side, because nothing is holding it in
    if (T > 1.9) for (let i = 0; i < 4; i++) {
      const dx = 194 + i * 24, ln = R(clamp((T - 1.9) * 26 - i * 5, 0, 30));
      if (ln <= 0) continue;
      P(ctx, '#2d6490', dx, iy + 8, 1, ln);
      P(ctx, '#5c96c0', dx + 1, iy + 8, 1, R(ln * 0.6));
    }
    // the hull, standing in the water
    for (let px = 0; px < 396; px++) {
      const wx = 106 + px, wy = 300 + R(Math.sin((wx + T * 24) * 0.08) * 2);
      if (bay(wx, wy) > 0.6) continue;
      P(ctx, bay(wx, wy) < 0.22 ? '#ffd0a0' : '#4a4066', wx, wy, 2, 1);
    }
    ctx.restore();
    // her, alongside, up out of the water as far as she goes
    const my = 302 + R(Math.sin(T * 1.05) * 2);
    this.pair(ctx, 548 + ox, my, S.herDawnS, S.himDawnS, t, true, 22,
      { phase: T * 1.1, tailAmp: 0.09, exp: 'sad', seed: 2 });
    FX.render(ctx, ox, oy);
  },

  // ---- 5. the witness -----------------------------------------------------
  drawWitness(ctx, T, t) {
    ctx.drawImage(S.pens, 0, 0);
    this.pool(ctx, S.lampPool, 105, 74, t, 0.14, 0.58);
    // the old bull, in the next pen, most of him under: only his back and
    // the top of his head are out of the water
    const bx0 = 120, by = 312 + R(Math.sin(T * 0.7) * 3);
    ctx.drawImage(S.bullLit.c, bx0 - S.bullLit.ax, by - S.bullLit.ay);
    // the water closing over his back
    for (let px = 0; px < 230; px++) {
      const gx = 32 + px, wy = 292 + R(Math.sin((gx + T * 22) * 0.07) * 2);
      if (bay(gx, wy) > 0.62) continue;
      P(ctx, bay(gx, wy) < 0.26 ? '#5aa89a' : '#1d4a48', gx, wy, 2, 1);
    }
    // and the pen water closing over the rest of him: he is a shape under it,
    // not an animal lying on top of it
    ctx.drawImage(S.penVeil.c, 8, 294);
    // his eye comes up a little every time he says something
    {
      const ex = bx0 + CH.side.eye[0] * 3, ey = by + CH.side.eye[1] * 3 - (this._o.a ? 3 : 0);
      P(ctx, '#04101a', ex - 3, ey - 3, 9, 9);
      P(ctx, this._o.a ? '#9ceccf' : '#2c5a5e', ex - 1, ey - 1, 5, 5);
      if (this._o.a) P(ctx, '#e4fff4', ex, ey, 2, 2);
    }
    ctx.drawImage(S.bars.c, 268 - S.bars.ax, 40);
    // her, on the far side of the bars
    const my = 296 + R(Math.sin(T * 1.0) * 2);
    this.pair(ctx, 474, my, S.herMerc, S.himMerc, t, true, 22,
      { phase: T * 0.9, tailAmp: 0.07, exp: 'wide', seed: 5 });
    FX.render(ctx, 0, 0);
  },

  // ---- 6. the chart -------------------------------------------------------
  drawChart(ctx, T, t) {
    ctx.drawImage(S.chartBg, 0, 0);
    const s = S.chart, cx0 = 222, cy0 = 244;
    ctx.save();
    ctx.translate(cx0, cy0);
    ctx.rotate(-0.03);
    ctx.drawImage(s.c, -s.ax, -s.ay);
    // the pins, and the string he runs between them
    const M = S.chartMark, k = this._o.a;
    const seg = k * (M.length - 1);
    for (let i = 0; i < M.length; i++) {
      if (i > 0 && seg < i - 1) break;
      const mx = M[i][0] - s.ax, my = M[i][1] - s.ay;
      if (i > 0) {
        const pv = M[i - 1], qx = pv[0] - s.ax, qy = pv[1] - s.ay;
        const f = clamp(seg - (i - 1), 0, 1);
        const ex = R(qx + (mx - qx) * f), ey = R(qy + (my - qy) * f);
        const n = Math.max(1, Math.floor(Math.hypot(ex - qx, ey - qy) / 2));
        for (let j = 0; j <= n; j++) {
          P(ctx, j & 1 ? '#e8d3ae' : '#b8262c', R(qx + (ex - qx) * j / n), R(qy + (ey - qy) * j / n), 2, 2);
        }
      }
      if (i > 0 && seg < i - 0.02) continue;          // a pin goes in when the string gets there
      ctx.drawImage(S.pin.c, R(mx) - S.pin.ax, R(my) - S.pin.ay);
    }
    ctx.restore();
    // and once it reaches the edge it keeps going, off the paper
    if (k >= 1) {
      const g = clamp((T - 4.5) / 0.9, 0, 1);
      const x0 = cx0 + S.chartMark[5][0] - s.ax, y0 = cy0 + S.chartMark[5][1] - s.ay - 2;
      const n = R(g * 40);
      for (let j = 0; j < n; j++) {
        P(ctx, j & 1 ? '#e8d3ae' : '#b8262c', R(x0 + j * 3), R(y0 - j * 1.7), 2, 2);
      }
      if (g > 0.55) pixelTextOutlined(ctx, '?', R(x0 + n * 3) + 6, R(y0 - n * 1.7) - 4, 12, '#ffd67a', '#2a1404', 'left');
    }
    // him, hunched over it, with the lamp hooked on her plate beside him
    const oy = 220 + R(Math.sin(t * 1.7));
    drawHim(ctx, S.himLamp, { x: 416, y: oy, flip: true,
      arms: [-1.15 + Math.sin(t * 5.2) * 0.13, 0.62], headR: 0.30,
      tail: Math.sin(t * 1.4) * 0.09 });
    // the same lamp she carries everywhere, hooked on the plate beside him
    ctx.save(); ctx.translate(509, 178); ctx.rotate(Math.sin(t * 1.1) * 0.04); ctx.scale(2, 2);
    ctx.drawImage(A.lamp.c, -A.lamp.ax, -A.lamp.ay + 18);
    ctx.restore();
    P(ctx, BP.ink, 508, 172, 2, 8);
    this.pool(ctx, S.lampPool, 509, 200, t, 0.05, 0.38);
    FX.render(ctx, 0, 0);
  },

  // ---- 7. the deep roads --------------------------------------------------
  drawDeep(ctx, T, t) {
    ctx.drawImage(S.deepBg, 0, 0);
    // the cage, swinging a little on its bridle
    const sw = Math.sin(T * 0.8) * 3;
    ctx.save();
    ctx.translate(R(300 + sw), 52);
    ctx.rotate(Math.sin(T * 0.8) * 0.02);
    ctx.drawImage(S.cage.c, -S.cage.ax, 0);
    // him, inside it, hanging in the light
    const ky = 122 + R(Math.sin(T * 0.9 + 1) * 2);
    ctx.drawImage(S.kidLit.c, -S.kidLit.ax + 10, ky - S.kidLit.ay);
    if (this._o.b > 0) {                              // the eye comes on
      ctx.globalAlpha = qa(this._o.b);
      P(ctx, '#7cc0f0', 60, ky - 6, 5, 5);
      P(ctx, '#e8f8ff', 61, ky - 5, 2, 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // her, coming up into the light with the lamp still lit on her back
    const k = this._o.a, e = k * k * (3 - 2 * k);
    const my = R(lerp(444, 292, e)), mx = 372;
    this.pool(ctx, S.lampPool, mx + 26, my - 28, t, 0.05, 0.40);
    this.pair(ctx, mx, my, S.herDeep, S.himDeep, t, true, 22,
      { phase: T * 1.5, tailAmp: 0.17, exp: 'wide', seed: 3 });
    ctx.save(); ctx.translate(mx + 26, my - 20); ctx.rotate(Math.sin(T * 1.4) * 0.07);
    ctx.drawImage(A.lamp.c, -A.lamp.ax, -A.lamp.ay + 18);
    ctx.restore();
    P(ctx, BP.ink, mx + 25, my - 32, 2, 12);
    // marine snow drifting through the shaft
    for (let i = 0; i < 44; i++) {
      const sx = R(hash2(i, 9) * 460) + 90;
      const sy = R((hash2(i, 5) * 360 + T * (9 + hash2(i, 3) * 22)) % 360);
      const nr = sy < 330 && Math.abs(sx - (250 + (sy / 330) * 46)) < 30 + (sy / 330) * 96;
      P(ctx, nr ? '#8cb4dc' : '#12203a', sx, sy, 1, 1);
    }
    FX.render(ctx, 0, 0);
  },
};

global.StoryCut = StoryCut;
})(typeof window !== 'undefined' ? window : this);
