// ===========================================================================
//  upgrades.js — the SKILL TREE (upgrade screen) and the MAIN MENU
// ---------------------------------------------------------------------------
//  A driftwood tree planted in a salvage tub, nailed to the wall of the
//  otter's workshop. One trunk, four boughs - Weapons, Utility, Mobility,
//  General - and 62 riveted brass sockets bolted along them. Buying a node
//  slams it home and the limb below it lights up along its grain. All of it
//  at 640x360 in hard-edged pixel art: integer coords, posterised colours, no
//  gradients, no blur, no external images.
//
//  Public API (nothing else is touched):
//    Upgrades.init() / open() / update(dt,t) / render(ctx,t) / wantsClose
//    MainMenu.init() / update(dt,t) / render(ctx,t) / action / consume()
//
//  Loads after ui.js, before game.js.
// ===========================================================================
(function (global) {
  'use strict';

  // ======================================================== tiny primitives
  function can(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    c.getContext('2d').imageSmoothingEnabled = false;
    return c;
  }
  function R(ctx, col, x, y, w, h) {
    ctx.fillStyle = col;
    ctx.fillRect(x | 0, y | 0, (w === undefined ? 1 : w) | 0, (h === undefined ? 1 : h) | 0);
  }
  function box(ctx, col, x, y, w, h) {
    R(ctx, col, x, y, w, 1); R(ctx, col, x, y + h - 1, w, 1);
    R(ctx, col, x, y, 1, h); R(ctx, col, x + w - 1, y, 1, h);
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)] / 16;
  function spr(c, ax, ay) { return { c: c, w: c.width, h: c.height, ax: ax === undefined ? c.width / 2 : ax, ay: ay === undefined ? c.height / 2 : ay }; }
  function blit(ctx, s, x, y) { ctx.drawImage(s.c, Math.round(x - s.ax), Math.round(y - s.ay)); }
  function fitSize(text, maxW, sizes) { for (let i = 0; i < sizes.length; i++) if (textWidth(text, sizes[i]) <= maxW) return sizes[i]; return sizes[sizes.length - 1]; }
  function hit(m, x, y, w, h) { return m.x >= x && m.x < x + w && m.y >= y && m.y < y + h; }
  // cubic bezier sample, rounded to whole pixels
  function bez(s, u) {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    return { x: Math.round(a * s.x0 + b * s.x1 + c * s.x2 + d * s.x3),
             y: Math.round(a * s.y0 + b * s.y1 + c * s.y2 + d * s.y3) };
  }

  // 1px near-black outline around everything already drawn on a canvas
  function autoOutline(c, col) {
    const x = c.getContext('2d'), w = c.width, h = c.height;
    const img = x.getImageData(0, 0, w, h), d = img.data;
    const src = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 8 ? 1 : 0;
    const o = hexToRgb(col || '#14141c');
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      const p = y * w + i; if (src[p]) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = i + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (src[ny * w + nx]) { near = true; break; }
        }
        if (near) break;
      }
      if (!near) continue;
      const q = p * 4; d[q] = o[0]; d[q + 1] = o[1]; d[q + 2] = o[2]; d[q + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  // ========================================================= upgrade icons
  // Small hand-placed shapes, auto-outlined so they all read the same way.
  const ICON = {};
  function buildIcons() {
    function make(name, fn) {
      const c = can(16, 16), x = c.getContext('2d');
      const g = {
        P: (col, a, b, w, h) => R(x, col, a, b, w === undefined ? 1 : w, h === undefined ? 1 : h),
        disc: (col, cx, cy, r) => { x.fillStyle = col; for (let yy = -r; yy <= r; yy++) { const ww = Math.floor(Math.sqrt(Math.max(0, r * r - yy * yy))); x.fillRect(cx - ww, cy + yy, ww * 2 + 1, 1); } },
        ring: (col, cx, cy, r) => { x.fillStyle = col; for (let a = 0; a < 72; a++) { const an = a / 72 * TAU; x.fillRect(Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r), 1, 1); } },
        tri: (col, cx, cy, r, dir) => { x.fillStyle = col; for (let i = 0; i < r; i++) { const w = r - i; if (dir === 'up') x.fillRect(cx - w, cy + i, w * 2 + 1, 1); else if (dir === 'down') x.fillRect(cx - w, cy - i, w * 2 + 1, 1); else if (dir === 'right') x.fillRect(cx - i, cy - w, 1, w * 2 + 1); else x.fillRect(cx + i, cy - w, 1, w * 2 + 1); } },
      };
      fn(g);
      autoOutline(c, '#14141c');
      ICON[name] = spr(c, 8, 8);
    }

    make('dmg', g => {                               // rifle round
      g.P('#cfd6e0', 8, 3, 1, 1); g.P('#cfd6e0', 7, 4, 3, 2); g.P('#cfd6e0', 6, 6, 5, 1);
      g.P('#eef3f8', 7, 4, 1, 2); g.P('#eef3f8', 6, 6, 2, 1);
      g.P('#c8952f', 6, 7, 5, 6); g.P('#ffd97a', 6, 7, 1, 6); g.P('#7d5a12', 10, 7, 1, 6);
      g.P('#8a6314', 6, 13, 5, 1);
      g.P('#ffe48f', 2, 3, 3, 1); g.P('#ffe48f', 3, 2, 1, 3);
    });
    make('rate', g => {                              // stopwatch + bolt
      g.disc('#8f9aa8', 8, 9, 5); g.disc('#2b3442', 8, 9, 4);
      g.P('#8f9aa8', 7, 2, 3, 2); g.P('#c3ccd8', 7, 2, 3, 1);
      g.P('#ffe48f', 9, 5, 2, 4); g.P('#ffe48f', 6, 9, 4, 1); g.P('#ffe48f', 6, 10, 3, 3);
      g.P('#fff6d2', 9, 5, 1, 4); g.P('#fff6d2', 6, 10, 1, 2);
    });
    make('hp', g => {                                // heart
      g.P('#ff6161', 4, 4, 3, 1); g.P('#ff6161', 9, 4, 3, 1);
      g.P('#ff6161', 3, 5, 10, 3); g.P('#ff6161', 4, 8, 8, 1);
      g.P('#ff6161', 5, 9, 6, 1); g.P('#ff6161', 6, 10, 4, 1); g.P('#ff6161', 7, 11, 2, 1);
      g.P('#c8302e', 9, 6, 3, 3); g.P('#c8302e', 8, 9, 3, 1); g.P('#c8302e', 8, 10, 2, 1);
      g.P('#ffb0b0', 4, 5, 2, 2); g.P('#ffdede', 4, 5, 1, 1);
    });
    make('armor', g => {                             // riveted shield
      g.P('#aeb6c1', 4, 3, 8, 6); g.P('#aeb6c1', 5, 9, 6, 1); g.P('#aeb6c1', 6, 10, 4, 1); g.P('#aeb6c1', 7, 11, 2, 1);
      g.P('#dde5ee', 4, 3, 3, 6); g.P('#7d858f', 10, 3, 2, 6); g.P('#7d858f', 9, 9, 2, 1);
      g.P('#ffe48f', 7, 5, 2, 5); g.P('#ffe48f', 5, 6, 6, 2); g.P('#fff6d2', 7, 5, 1, 4);
    });
    make('absorb', g => {                            // hex barrier deflecting a shot
      const hex = [[5, 3, 6, 1], [4, 4, 8, 1], [3, 5, 10, 4], [4, 9, 8, 1], [5, 10, 6, 1], [6, 11, 4, 1]];
      for (const h of hex) g.P('#3f7fd6', h[0], h[1], h[2], h[3]);
      g.P('#8ac6ff', 3, 5, 2, 4); g.P('#8ac6ff', 4, 4, 2, 1); g.P('#8ac6ff', 5, 3, 3, 1);
      g.P('#1e3f7a', 10, 5, 3, 4); g.P('#1e3f7a', 9, 9, 3, 1);
      g.P('#e6f2ff', 6, 6, 4, 2); g.P('#ffffff', 6, 6, 2, 1);
      g.P('#ffe48f', 12, 2, 2, 2); g.P('#ffffff', 13, 1, 1, 1);
    });
    make('fin', g => {                               // fin + wake lines
      g.P('#6fd88e', 9, 3, 2, 1); g.P('#6fd88e', 8, 4, 4, 2); g.P('#6fd88e', 7, 6, 6, 2);
      g.P('#6fd88e', 6, 8, 7, 2); g.P('#6fd88e', 5, 10, 8, 2);
      g.P('#b6f5cd', 9, 3, 1, 9); g.P('#1d6b3c', 11, 6, 2, 6);
      g.P('#8ac6ff', 1, 5, 4, 1); g.P('#8ac6ff', 2, 8, 3, 1); g.P('#8ac6ff', 1, 11, 4, 1);
    });
    make('roll', g => {                              // circular arrow
      g.ring('#6fd88e', 8, 8, 5); g.ring('#b6f5cd', 8, 8, 4);
      g.P('#0e131f', 9, 2, 5, 4);
      g.P('#6fd88e', 9, 2, 2, 4); g.P('#6fd88e', 11, 3, 2, 2);
      g.P('#b6f5cd', 9, 2, 1, 3);
    });
    make('cd', g => {                                // clock face
      g.disc('#dde5ee', 8, 8, 6); g.ring('#4a515a', 8, 8, 6);
      g.P('#4a515a', 8, 4, 1, 5); g.P('#4a515a', 8, 8, 4, 1);
      g.P('#8ac6ff', 3, 3, 2, 2);
      g.P('#aeb6c1', 3, 8, 1, 1); g.P('#aeb6c1', 13, 8, 1, 1); g.P('#aeb6c1', 8, 13, 1, 1);
    });
    make('magnet', g => {                            // horseshoe magnet
      g.P('#c8302e', 3, 4, 3, 7); g.P('#c8302e', 10, 4, 3, 7);
      g.P('#c8302e', 3, 3, 10, 2); g.P('#ff6161', 3, 3, 10, 1); g.P('#ff6161', 3, 4, 1, 7);
      g.P('#aeb6c1', 3, 11, 3, 2); g.P('#aeb6c1', 10, 11, 3, 2);
      g.P('#dde5ee', 3, 11, 3, 1); g.P('#dde5ee', 10, 11, 3, 1);
      g.P('#7c1414', 5, 5, 6, 5);
    });
    make('scrap', g => {                             // cog
      g.disc('#aeb6c1', 8, 8, 6);
      for (let a = 0; a < 8; a++) { const an = a / 8 * TAU; g.P('#aeb6c1', Math.round(8 + Math.cos(an) * 6) - 1, Math.round(8 + Math.sin(an) * 6) - 1, 3, 3); }
      g.disc('#4a515a', 8, 8, 2);
      g.P('#dde5ee', 4, 4, 4, 2); g.P('#7d858f', 9, 10, 4, 2);
    });
    make('pierce', g => {                            // bolt through plate
      g.P('#7d858f', 9, 1, 3, 14); g.P('#aeb6c1', 9, 1, 1, 14);
      g.P('#0e131f', 9, 7, 3, 2);
      g.P('#dde5ee', 1, 7, 9, 2); g.P('#ffffff', 1, 7, 6, 1);
      g.P('#dde5ee', 12, 7, 3, 2); g.P('#e6f2ff', 13, 6, 2, 4);
    });
    make('boom', g => {                              // burst star
      g.disc('#ff9a3c', 8, 8, 5);
      for (let a = 0; a < 8; a++) { const an = a / 8 * TAU + 0.2; g.P('#e6802a', Math.round(8 + Math.cos(an) * 6), Math.round(8 + Math.sin(an) * 6), 2, 2); }
      g.disc('#ffe48f', 8, 8, 3); g.disc('#ffffff', 8, 7, 1);
    });
    make('fire', g => {                              // flame
      g.P('#e6802a', 6, 10, 5, 4); g.P('#e6802a', 5, 8, 7, 3); g.P('#e6802a', 6, 6, 4, 2); g.P('#e6802a', 7, 3, 2, 3);
      g.P('#ffe48f', 7, 9, 3, 4); g.P('#ffe48f', 7, 7, 2, 2);
      g.P('#ffffff', 8, 11, 1, 2);
      g.P('#ff9a3c', 10, 5, 2, 3);
    });
    make('crit', g => {                              // crosshair + crit dot
      g.ring('#dde5ee', 8, 8, 6); g.ring('#7d858f', 8, 8, 5);
      g.P('#dde5ee', 8, 0, 1, 4); g.P('#dde5ee', 8, 12, 1, 4);
      g.P('#dde5ee', 0, 8, 4, 1); g.P('#dde5ee', 12, 8, 4, 1);
      g.P('#ff6161', 7, 7, 3, 3); g.P('#ffb0b0', 7, 7, 1, 1);
    });
    make('rampage', g => {                           // burning paw
      g.P('#e6802a', 3, 2, 2, 5); g.P('#e6802a', 11, 2, 2, 5); g.P('#ffe48f', 3, 2, 1, 4);
      g.P('#c8703c', 4, 6, 8, 7); g.P('#e0975c', 4, 6, 3, 7); g.P('#9c4d24', 10, 6, 2, 7);
      g.P('#f2ddb8', 5, 4, 2, 3); g.P('#f2ddb8', 7, 3, 2, 4); g.P('#f2ddb8', 9, 4, 2, 3);
      g.P('#1a1220', 6, 9, 4, 1);
    });
    make('wave', g => {                              // rolling wave
      g.P('#3f7fd6', 1, 6, 14, 3); g.P('#8ac6ff', 1, 6, 14, 1);
      g.P('#3f7fd6', 2, 9, 5, 2); g.P('#3f7fd6', 9, 9, 5, 2);
      g.P('#8ac6ff', 4, 3, 7, 2); g.P('#e6f2ff', 5, 2, 4, 1);
      g.P('#e6f2ff', 2, 11, 3, 1); g.P('#e6f2ff', 10, 11, 3, 1);
    });
    make('regen', g => {                             // healing leaf + cross
      g.P('#2f9e5b', 3, 8, 9, 5); g.P('#2f9e5b', 5, 5, 7, 4); g.P('#6fd88e', 5, 5, 4, 5);
      g.P('#1d6b3c', 9, 9, 3, 4);
      g.P('#b6f5cd', 6, 7, 1, 5); g.P('#b6f5cd', 4, 9, 5, 1);
      g.P('#ffffff', 11, 2, 2, 2);
    });
    make('eye', g => {                               // sharp eye
      g.P('#e6f2ff', 2, 6, 12, 4); g.P('#e6f2ff', 4, 5, 8, 1); g.P('#e6f2ff', 4, 10, 8, 1);
      g.disc('#3f7fd6', 8, 8, 3); g.disc('#14141c', 8, 8, 1);
      g.P('#ffffff', 6, 6, 2, 1);
      g.P('#6a3f22', 3, 2, 10, 2); g.P('#8a5a33', 3, 2, 6, 1);
    });
    make('shock', g => {                             // shockwave rings
      g.ring('#8ac6ff', 8, 8, 6); g.ring('#3f7fd6', 8, 8, 4);
      g.disc('#e6f2ff', 8, 8, 2);
      g.P('#ffe48f', 8, 1, 1, 3); g.P('#ffe48f', 1, 8, 3, 1); g.P('#ffe48f', 12, 8, 3, 1); g.P('#ffe48f', 8, 12, 1, 3);
    });
    make('dual', g => {                              // two barrels
      g.P('#aeb6c1', 1, 3, 10, 3); g.P('#dde5ee', 1, 3, 10, 1); g.P('#4a515a', 2, 6, 3, 3);
      g.P('#aeb6c1', 5, 9, 10, 3); g.P('#dde5ee', 5, 9, 10, 1); g.P('#4a515a', 11, 12, 3, 2);
      g.P('#ffe48f', 12, 3, 3, 1); g.P('#ffe48f', 13, 2, 1, 3);
    });
    make('multi', g => {                             // extra projectiles
      for (let i = 0; i < 3; i++) {
        const y = 2 + i * 5;
        g.P('#ffd97a', 4, y, 6, 3); g.P('#cfd6e0', 10, y, 3, 3); g.P('#eef3f8', 10, y, 3, 1);
        g.P('#8a6314', 4, y + 2, 6, 1);
      }
    });
    make('dive', g => {                              // dive arrow under waves
      g.P('#8ac6ff', 1, 2, 14, 2); g.P('#e6f2ff', 1, 2, 14, 1);
      g.P('#3f7fd6', 2, 5, 12, 1);
      g.P('#6fd88e', 6, 5, 4, 5); g.P('#b6f5cd', 6, 5, 1, 5);
      g.tri('#6fd88e', 8, 14, 4, 'down'); g.P('#b6f5cd', 5, 10, 2, 1);
    });
    make('buoy', g => {                              // decoy buoy
      g.P('#c8302e', 5, 5, 6, 8); g.P('#ff6161', 5, 5, 2, 8);
      g.P('#e6f2ff', 5, 8, 6, 2);
      g.P('#7d858f', 7, 2, 2, 3); g.P('#ffe48f', 6, 1, 4, 2); g.P('#ffffff', 7, 1, 1, 1);
      g.P('#7c1414', 5, 12, 6, 1);
    });
    make('star', g => {                              // veteran star
      g.P('#ffe48f', 7, 1, 2, 5); g.P('#ffe48f', 1, 6, 14, 2);
      g.P('#ffe48f', 3, 8, 10, 2); g.P('#ffe48f', 4, 10, 3, 4); g.P('#ffe48f', 9, 10, 3, 4);
      g.P('#fff6d2', 7, 1, 1, 5); g.P('#fff6d2', 1, 6, 7, 1);
      g.P('#c8952f', 9, 8, 4, 2); g.P('#c8952f', 9, 10, 3, 4);
    });
    make('current', g => {                           // swirling current
      g.P('#8ac6ff', 2, 3, 10, 2); g.P('#8ac6ff', 10, 4, 2, 3); g.P('#8ac6ff', 4, 6, 8, 2);
      g.P('#8ac6ff', 4, 8, 2, 3); g.P('#8ac6ff', 4, 11, 10, 2);
      g.P('#e6f2ff', 2, 3, 8, 1); g.P('#e6f2ff', 4, 11, 8, 1);
      g.P('#ffe48f', 12, 10, 3, 1); g.P('#ffe48f', 12, 9, 1, 4);
    });
    make('wind', g => {                              // second wind: heart with wings
      g.P('#ff6161', 6, 6, 2, 1); g.P('#ff6161', 9, 6, 2, 1); g.P('#ff6161', 5, 7, 7, 3);
      g.P('#ff6161', 6, 10, 5, 1); g.P('#ff6161', 7, 11, 3, 1); g.P('#ff6161', 8, 12, 1, 1);
      g.P('#ffb0b0', 6, 7, 2, 2);
      g.P('#e6f2ff', 1, 5, 4, 2); g.P('#e6f2ff', 2, 8, 3, 1);
      g.P('#e6f2ff', 12, 5, 4, 2); g.P('#e6f2ff', 12, 8, 3, 1);
    });
    make('rock', g => {                              // rock sense
      g.P('#4f5560', 3, 6, 10, 7); g.P('#848b97', 3, 6, 4, 7); g.P('#4f5560', 5, 4, 6, 3);
      g.P('#c3c9d3', 5, 4, 3, 2); g.P('#2e323b', 10, 8, 3, 5);
      g.P('#ffe48f', 12, 2, 3, 1); g.P('#ffe48f', 13, 1, 1, 3);
      g.P('#ffe48f', 1, 2, 3, 1); g.P('#ffe48f', 2, 1, 1, 3);
    });
  }

  const SHORT_SCRAP = { metal: 'METAL', wood: 'WOOD', fuel: 'FUEL', powder: 'PWDR', tech: 'TECH' };

  // node id -> icon name (weapon nodes draw their gun sprite instead)
  const NICON = {
    w_tune: 'dmg', w_hollow: 'dmg', w_hollow2: 'pierce', w_rapid: 'rate', w_bigiron: 'multi',
    w_ricochet: 'shock', w_explosive: 'boom', w_deadeye: 'crit', w_incend: 'fire',
    w_sidearm: 'dual', w_barrel: 'multi',
    u_window: 'absorb', u_reflex: 'cd', u_heal: 'hp', u_magnet: 'magnet', u_reflect: 'absorb',
    u_shock: 'shock', u_salvage: 'scrap', u_rgain: 'rampage', u_rdur: 'rampage', u_magnet2: 'magnet',
    u_rfury: 'rampage', u_rfrenzy: 'rampage', u_lucky: 'scrap', u_decoy: 'buoy', u_tidal: 'wave', u_master: 'absorb',
    m_fins: 'fin', m_rollcd: 'cd', m_rolldist: 'roll', m_turn: 'current', m_ram: 'roll', m_double: 'roll',
    m_fins2: 'fin', m_splash: 'wave', m_slip: 'current', m_current: 'current', m_dive: 'dive',
    m_blubber: 'fin', m_fins3: 'fin', m_triple: 'roll',
    g_hide: 'hp', g_hide2: 'hp', g_diet: 'regen', g_eyes: 'eye', g_armor: 'armor', g_cool: 'cd',
    g_eyes2: 'eye', g_hide3: 'hp', g_rock: 'rock', g_speed: 'rate', g_armor2: 'armor', g_diet2: 'regen',
    g_cool2: 'cd', g_second: 'wind', g_veteran: 'star',
  };
  function nodeArt(n) {
    if (n.weapon && typeof SP !== 'undefined' && SP.guns && SP.guns[n.weapon]) return SP.guns[n.weapon];
    return ICON[NICON[n.id] || 'star'] || ICON.star;
  }

  // ===========================================================================
  //  THE DEEP — the underwater backdrop. Used by the main menu only.
  // ===========================================================================
  const Deep = {
    built: false, t: 0,
    bg: null, rays: [], whale: null, whaleTail: null, wreck: null, bub: [], fgBub: [],
    motes: [], drift: [], kelp: [], rise: [], big: [],
    whaleX: 700, whaleY: 96,

    build() {
      if (this.built) return; this.built = true;
      const rng = new SeededRandom(20260919);

      // ---- posterised depth gradient, ordered-dithered between bands -----
      const ramp = ['#357aa0', '#2d6d92', '#266182', '#205673', '#1a4b66', '#154158', '#11384c', '#0d2f40', '#0a2634', '#081e2a', '#061820', '#041218'];
      const c = can(640, 360), x = c.getContext('2d');
      const rgbs = ramp.map(hexToRgb), N = ramp.length;
      const img = x.createImageData(640, 360), d = img.data;
      for (let y = 0; y < 360; y++) {
        const f = Math.pow(y / 359, 0.82) * (N - 1);
        const i0 = Math.floor(f), fr = f - i0;
        for (let i = 0; i < 640; i++) {
          let idx = i0 + (fr > bay(i, y) ? 1 : 0);
          if (idx > N - 1) idx = N - 1;
          const col = rgbs[idx], p = (y * 640 + i) * 4;
          d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
        }
      }
      x.putImageData(img, 0, 0);
      // distant gloom: vague darker masses far off in the water
      for (let i = 0; i < 5; i++) {
        const gx = rng.range(-40, 640), gy = rng.range(120, 300), gw = rng.range(80, 220), gh = rng.range(30, 70);
        x.fillStyle = 'rgba(3,10,16,0.30)';
        for (let yy = 0; yy < gh; yy++) {
          const k = yy / gh, hw = Math.round(gw / 2 * Math.sin(Math.PI * Math.max(0.08, k)));
          x.fillRect(Math.round(gx - hw), Math.round(gy + yy), hw * 2, 1);
        }
      }
      // seabed
      const bedY = 332;
      for (let i = 0; i < 640; i++) {
        const h = Math.round(bedY + Math.sin(i * 0.035) * 3 + Math.sin(i * 0.11) * 2);
        x.fillStyle = '#0c2029'; x.fillRect(i, h, 1, 360 - h);
        x.fillStyle = '#16323c'; x.fillRect(i, h, 1, 1);
        x.fillStyle = '#1d4250'; if ((i & 7) === 0) x.fillRect(i, h, 2, 1);
      }
      for (let i = 0; i < 90; i++) {                    // pebbles + shells
        const px2 = Math.round(rng.range(0, 640)), py2 = Math.round(rng.range(bedY + 4, 358));
        x.fillStyle = rng.next() > 0.6 ? '#173540' : '#0a1a22';
        x.fillRect(px2, py2, rng.int(1, 3), 1);
      }
      this.bg = c;

      // ---- god rays: three prerendered beams -----------------------------
      for (let r = 0; r < 3; r++) this.rays.push(this.buildRay(70 + r * 34, 360, 0.55 + r * 0.22));

      // ---- whale silhouette ---------------------------------------------
      this.whale = this.buildWhale();
      this.whaleTail = this.buildWhaleTail();

      // ---- wreck ---------------------------------------------------------
      this.wreck = this.buildWreck();

      // ---- bubble sprites (ambient) --------------------------------------
      for (let r = 1; r <= 6; r++) this.bub.push(this.buildBubble(r, 0.55));
      for (let r = 6; r <= 13; r += 1) this.fgBub.push(this.buildBubble(r, 0.30));

      // ---- particulate ----------------------------------------------------
      for (let i = 0; i < 170; i++) this.motes.push({
        x: rng.range(0, 640), y: rng.range(0, 360), s: rng.range(1.5, 10),
        ph: rng.range(0, TAU), b: rng.range(0.12, 0.55), z: rng.int(0, 2),
      });
      for (let i = 0; i < 46; i++) this.drift.push({          // slow silt flakes
        x: rng.range(0, 640), y: rng.range(0, 360), s: rng.range(3, 12),
        ph: rng.range(0, TAU), w: rng.range(6, 20), len: rng.int(2, 4),
      });
      // ---- kelp forest (two depth layers) ---------------------------------
      for (let i = 0; i < 26; i++) this.kelp.push({
        x: rng.range(-20, 660), h: rng.range(60, 190), w: rng.int(2, 4),
        ph: rng.range(0, TAU), sp: rng.range(0.4, 0.9), far: i < 15,
      });
      // ---- rising bubble columns ------------------------------------------
      for (let i = 0; i < 80; i++) this.rise.push({
        x: rng.range(0, 640), y: rng.range(0, 380), r: rng.int(0, 5),
        s: rng.range(12, 40), ph: rng.range(0, TAU), w: rng.range(3, 13),
      });
      for (let i = 0; i < 9; i++) this.big.push({
        x: rng.range(0, 640), y: rng.range(0, 420), r: rng.int(0, this.fgBub.length - 1),
        s: rng.range(34, 74), ph: rng.range(0, TAU), w: rng.range(6, 18),
      });
    },

    buildRay(w, h, slant) {
      const c = can(w + Math.round(h * slant * 0.34) + 6, h), x = c.getContext('2d');
      const cols = ['rgba(150,205,240,0.055)', 'rgba(175,222,250,0.085)', 'rgba(205,238,255,0.115)'];
      for (let y = 0; y < h; y++) {
        const k = y / h;
        const half = Math.max(1, Math.round(w * 0.22 + w * 0.30 * k));
        const cx = Math.round(w * 0.5 + k * h * slant * 0.34);
        for (let i = -half; i <= half; i++) {
          const dd = Math.abs(i) / half;
          const a = (1 - dd * dd) * (1 - k * 0.72);
          const lv = Math.floor(a * 3 + bay(cx + i, y) * 0.95);
          if (lv <= 0) continue;
          x.fillStyle = cols[Math.min(2, lv - 1)];
          x.fillRect(cx + i, y, 1, 1);
        }
      }
      return spr(c, w * 0.5, 0);
    },

    buildWhale() {
      const W = 152, H = 50, c = can(W, H), x = c.getContext('2d');
      for (let i = 0; i < W - 22; i++) {
        const u = i / (W - 23);
        const bulge = Math.sin(Math.PI * Math.pow(u, 0.72));
        let top = Math.round(26 - 15 * bulge - (u < 0.2 ? 2 * (0.2 - u) * 10 : 0));
        let bot = Math.round(26 + 13 * Math.sin(Math.PI * Math.pow(u, 0.9)));
        if (u > 0.8) { const k = (u - 0.8) / 0.2; top = Math.round(top + k * 8); bot = Math.round(bot - k * 7); }
        if (bot <= top) bot = top + 1;
        x.fillStyle = '#081a26'; x.fillRect(i, top, 1, bot - top);
        x.fillStyle = '#123244'; x.fillRect(i, top, 1, 1);
        if (u > 0.12 && u < 0.86) { x.fillStyle = '#0d2534'; x.fillRect(i, bot - 2, 1, 2); }
      }
      // throat pleats
      x.fillStyle = '#0b2130';
      for (let i = 6; i < 60; i += 4) x.fillRect(i, 30 + Math.round(Math.sin(i * 0.2) * 2), 1, 7);
      // pectoral fin
      x.fillStyle = '#061520';
      for (let i = 0; i < 26; i++) x.fillRect(42 + i, 34 + Math.round(i * 0.35), 1, Math.max(1, 9 - Math.round(i * 0.3)));
      // dorsal
      x.fillStyle = '#0d2534'; x.fillRect(96, 15, 9, 3); x.fillRect(99, 13, 5, 2);
      // eye
      x.fillStyle = '#20455c'; x.fillRect(11, 26, 2, 2);
      return spr(c, 0, 26);
    },
    buildWhaleTail() {
      const c = can(30, 42), x = c.getContext('2d');
      x.fillStyle = '#081a26';
      for (let i = 0; i < 26; i++) {
        const k = i / 25, h = Math.round(4 + k * 34);
        x.fillRect(i, Math.round(21 - h / 2), 1, h);
      }
      x.fillStyle = '#0d2534';
      for (let i = 12; i < 26; i++) { const k = (i - 12) / 14; x.fillRect(i, Math.round(21 - (4 + k * 34) / 2), 1, 1); }
      return spr(c, 1, 21);
    },

    buildWreck() {
      const W = 250, H = 120, base = can(W, H), x = base.getContext('2d');
      const hullTop = 46, hullBot = 96;
      // hull body
      for (let i = 20; i < 226; i++) {
        const u = (i - 20) / 206;
        const top = Math.round(hullTop + Math.sin(Math.PI * u) * -8 + 8);
        const bot = Math.round(hullBot - Math.pow(Math.abs(u - 0.5) * 2, 3) * 22);
        if (bot <= top) continue;
        x.fillStyle = '#071a24'; x.fillRect(i, top, 1, bot - top);
        x.fillStyle = '#0f2e3c'; x.fillRect(i, top, 1, 2);
        if ((i % 11) === 0) { x.fillStyle = '#0b2430'; x.fillRect(i, top + 2, 1, bot - top - 2); }
      }
      // gunwale rail
      x.fillStyle = '#13384a'; x.fillRect(20, hullTop + 6, 206, 2);
      // broken ribs sticking up out of the deck
      for (let i = 0; i < 7; i++) {
        const rx = 44 + i * 25, rh = 14 + ((i * 7) % 18);
        x.fillStyle = '#0c2836';
        for (let j = 0; j < rh; j++) x.fillRect(rx + Math.round(Math.sin(j * 0.22 + i) * 2), hullTop + 6 - j, 3, 1);
        x.fillStyle = '#143f52'; x.fillRect(rx, hullTop + 6 - rh, 3, 1);
      }
      // a hole torn in the side
      x.fillStyle = '#03101a';
      for (let j = 0; j < 20; j++) { const hw = Math.round(11 * Math.sin(Math.PI * (j / 19))); x.fillRect(150 - hw, hullTop + 20 + j, hw * 2, 1); }
      // snapped mast lying across
      x.save(); x.translate(90, hullTop + 4); x.rotate(-0.62);
      x.fillStyle = '#0c2836'; x.fillRect(0, -3, 120, 6);
      x.fillStyle = '#143f52'; x.fillRect(0, -3, 120, 1);
      x.restore();
      // bowsprit
      x.fillStyle = '#0c2836'; x.fillRect(4, hullTop + 2, 24, 4);
      // kelp growing on the wreck
      for (let i = 0; i < 10; i++) {
        const kx = 30 + i * 20, kh = 10 + ((i * 13) % 22);
        x.fillStyle = 'rgba(8,40,40,0.8)';
        for (let j = 0; j < kh; j++) x.fillRect(kx + Math.round(Math.sin(j * 0.4 + i) * 3), hullTop + 6 - j, 2, 1);
      }
      // tilt it
      const c2 = can(W + 30, H + 30), x2 = c2.getContext('2d');
      x2.save(); x2.translate(15, 15); x2.translate(W / 2, H / 2); x2.rotate(-0.13); x2.translate(-W / 2, -H / 2);
      x2.drawImage(base, 0, 0); x2.restore();
      return spr(c2, (W + 30) / 2, hullBot + 15);
    },

    // a crisp little bubble: rim, refractive highlight, translucent core
    buildBubble(r, alpha) {
      const D = r * 2 + 3, c = can(D, D), x = c.getContext('2d'), cx = r + 1, cy = r + 1;
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        const d = Math.sqrt(xx * xx + yy * yy);
        if (d > r + 0.35) continue;
        if (d > r - 0.9) { x.fillStyle = `rgba(206,240,255,${(alpha + 0.3).toFixed(2)})`; }
        else if (d > r - 1.9 && (xx + yy > r * 0.4)) { x.fillStyle = `rgba(160,215,245,${(alpha * 0.7).toFixed(2)})`; }
        else if (r > 2) { x.fillStyle = `rgba(120,180,215,${(alpha * 0.22).toFixed(2)})`; }
        else continue;
        x.fillRect(cx + xx, cy + yy, 1, 1);
      }
      if (r >= 2) {
        x.fillStyle = `rgba(255,255,255,${Math.min(0.9, alpha + 0.4).toFixed(2)})`;
        x.fillRect(cx - Math.round(r * 0.55), cy - Math.round(r * 0.55), Math.max(1, r >> 1), Math.max(1, r >> 1));
      }
      return spr(c, cx, cy);
    },

    update(dt, t) {
      this.build();
      this.t += dt;
      const T = this.t;
      for (const m of this.motes) { m.y -= m.s * dt * 0.22; m.x += Math.sin(T * 0.3 + m.ph) * 3 * dt; m.ph += dt * 0.8; if (m.y < -3) { m.y = 363; m.x = rand(0, 640); } }
      for (const s of this.drift) { s.y -= s.s * dt * 0.16; s.x += Math.sin(T * 0.4 + s.ph) * 7 * dt; if (s.y < -4) { s.y = 364; s.x = rand(0, 640); } }
      for (const b of this.rise) { b.y -= b.s * dt; b.ph += dt * 1.3; if (b.y < -8) { b.y = rand(365, 400); b.x = rand(0, 640); } }
      for (const b of this.big) { b.y -= b.s * dt; b.ph += dt; if (b.y < -20) { b.y = rand(378, 440); b.x = rand(0, 640); } }
      this.whaleX -= dt * 11;
      if (this.whaleX < -220) { this.whaleX = 900; this.whaleY = rand(70, 140); }
    },

    // layers behind the UI
    render(ctx, opt) {
      this.build();
      const T = this.t;
      ctx.drawImage(this.bg, 0, 0);

      // god rays from the surface far above
      for (let i = 0; i < 7; i++) {
        const s = this.rays[i % 3];
        const bx = ((i * 121 + Math.sin(T * 0.11 + i * 1.7) * 30) % 800) - 80;
        ctx.globalAlpha = 0.55 + Math.sin(T * 0.45 + i * 1.3) * 0.32;
        ctx.drawImage(s.c, Math.round(bx), -20);
      }
      ctx.globalAlpha = 1;

      // the whale, very far off
      const wx = Math.round(this.whaleX), wy = Math.round(this.whaleY + Math.sin(T * 0.3) * 5);
      if (wx < 660 && wx > -230) {
        ctx.globalAlpha = 0.72;
        ctx.drawImage(this.whale.c, wx, wy - this.whale.ay);
        ctx.save();
        ctx.translate(wx + this.whale.w - 22, wy + 1);
        ctx.rotate(Math.sin(T * 0.9) * 0.34);
        ctx.drawImage(this.whaleTail.c, -this.whaleTail.ax, -this.whaleTail.ay);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // far silt
      for (const m of this.motes) {
        if (m.z !== 0) continue;
        ctx.fillStyle = `rgba(150,195,225,${(m.b * 0.5).toFixed(2)})`;
        ctx.fillRect(m.x | 0, m.y | 0, 1, 1);
      }

      // far kelp
      this.drawKelp(ctx, T, true);
      // the wreck on the seabed
      ctx.globalAlpha = 0.95;
      blit(ctx, this.wreck, (opt && opt.wreckX) || 232, 340);
      ctx.globalAlpha = 1;
      // near kelp
      this.drawKelp(ctx, T, false);

      // mid silt + drifting flakes
      for (const m of this.motes) {
        if (m.z === 0) continue;
        ctx.fillStyle = `rgba(196,232,255,${(m.b * (0.55 + Math.sin(m.ph) * 0.45)).toFixed(2)})`;
        ctx.fillRect(m.x | 0, m.y | 0, 1, 1);
      }
      for (const s of this.drift) {
        ctx.fillStyle = 'rgba(180,220,245,0.20)';
        ctx.fillRect(Math.round(s.x + Math.sin(T * 0.7 + s.ph) * s.w), s.y | 0, s.len, 1);
      }

      // ambient rising bubbles
      for (const b of this.rise) blit(ctx, this.bub[b.r], b.x + Math.sin(b.ph) * b.w, b.y);
    },

    drawKelp(ctx, T, far) {
      for (const k of this.kelp) {
        if (k.far !== far) continue;
        const segs = Math.round(k.h / 6);
        const col = far ? 'rgba(8,38,42,0.55)' : 'rgba(4,24,28,0.82)';
        const lit = far ? 'rgba(20,70,66,0.5)' : 'rgba(12,52,50,0.7)';
        for (let i = 0; i < segs; i++) {
          const f = i / segs;
          const off = Math.sin(T * k.sp + k.ph + f * 2.6) * (2 + f * 11);
          const x = Math.round(k.x + off), y = 352 - i * 6;
          ctx.fillStyle = col; ctx.fillRect(x, y, k.w, 7);
          ctx.fillStyle = lit; ctx.fillRect(x, y, 1, 7);
          if (i % 4 === 2) { ctx.fillStyle = col; ctx.fillRect(x - 4, y + 1, 4, 2); ctx.fillRect(x + k.w, y + 3, 4, 2); }
        }
      }
    },

    // big foreground bubbles, drawn last, over the whole UI
    renderForeground(ctx) {
      ctx.globalAlpha = 0.5;
      for (const b of this.big) blit(ctx, this.fgBub[b.r], b.x + Math.sin(b.ph) * b.w, b.y);
      ctx.globalAlpha = 1;
    },
  };

  // ===========================================================================
  //  THE WORKSHOP — the plank wall the skill tree is nailed to.
  //  Three layers: the wall (slow parallax), the bolted pegboard the tree
  //  grows out of (scrolls with the tree), and the lantern light, dust and
  //  forge embers that drift over everything.
  // ===========================================================================
  const Shop = {
    built: false, t: 0, wall: null, pegs: null, glow: null,
    motes: [], embers: [],

    build() {
      if (this.built) return; this.built = true;
      const rng = new SeededRandom(31337);

      // ---------------------------------------------------- the plank wall
      const c = can(640, 400), x = c.getContext('2d');
      const shades = ['#4a3423', '#443020', '#503a27', '#3e2b1d', '#4d3625'];
      let y = -8;
      while (y < 400) {
        const h = rng.int(21, 31), base = shades[rng.int(0, shades.length - 1)];
        R(x, base, 0, y, 640, h);
        for (let i = 0; i < 110; i++) {
          const gx = rng.int(0, 639), gy = y + rng.int(1, Math.max(2, h - 2));
          R(x, rng.next() > 0.5 ? '#573d29' : '#372617', gx, gy, rng.int(5, 26), 1);
        }
        if (rng.next() > 0.4) {                               // knot
          const kx = rng.int(24, 616), ky = y + (h >> 1);
          for (let r = 5; r >= 1; r--) ring(x, kx, ky, r, r === 5 ? '#2b1d12' : (r & 1) ? '#5d4229' : '#392617');
          R(x, '#221609', kx - 1, ky - 1, 3, 2);
        }
        R(x, '#5e4430', 0, y, 640, 1);                        // lit top edge
        R(x, '#241810', 0, y + h - 1, 640, 1);                // seam
        R(x, '#170f09', 0, y + h, 640, 1);
        for (let i = 0; i < 8; i++) {                         // nail heads
          const nx = 14 + i * 87 + rng.int(-7, 7), ny = y + 4;
          R(x, '#1a140e', nx, ny, 4, 4); R(x, '#767e8a', nx, ny, 3, 3);
          R(x, '#aeb6c1', nx, ny, 2, 1); R(x, '#d5dbe4', nx, ny, 1, 1);
        }
        y += h + 1;
      }
      // dithered vignette so the middle reads brightest
      for (let yy = 0; yy < 400; yy++) for (let xx = 0; xx < 640; xx++) {
        const dx = (xx - 320) / 330, dy = (yy - 200) / 230;
        const v = Math.min(1, dx * dx + dy * dy);
        const lv = Math.floor(v * 3.2 + bay(xx, yy) * 0.9);
        if (lv <= 0) continue;
        x.fillStyle = lv >= 3 ? 'rgba(6,4,2,0.55)' : lv === 2 ? 'rgba(8,5,3,0.34)' : 'rgba(10,6,4,0.16)';
        x.fillRect(xx, yy, 1, 1);
      }
      this.wall = c;

      // ------------------------------------- the pegboard, bolted to the wall
      const PW = TREE.w, PH = TREE.h;
      const b = can(PW, PH), q = b.getContext('2d');
      R(q, '#20170f', 4, 4, PW - 8, PH - 8);
      for (let i = 0; i < 700; i++) {                          // board grain
        const gx = rng.int(6, PW - 8), gy = rng.int(6, PH - 8);
        R(q, rng.next() > 0.5 ? '#231a10' : '#150e08', gx, gy, rng.int(3, 14), 1);
      }
      for (let gy = 12; gy < PH - 10; gy += 11) for (let gx = 12; gx < PW - 10; gx += 11) {
        R(q, '#100b06', gx, gy, 2, 2); R(q, '#2b2013', gx, gy, 2, 1);   // peg holes
      }
      R(q, '#2e2114', 4, 4, PW - 8, 1); R(q, '#372716', 4, 4, 1, PH - 8);
      R(q, '#15100a', 4, PH - 5, PW - 8, 1); R(q, '#15100a', PW - 5, 4, 1, PH - 8);
      box(q, '#100b06', 3, 3, PW - 6, PH - 6);
      // a pinned salvage schematic behind the tree
      const sx0 = 92, sy0 = 84, sw = 250, sh = 150;
      R(q, 'rgba(188,168,120,0.07)', sx0, sy0, sw, sh);
      box(q, 'rgba(120,102,66,0.16)', sx0, sy0, sw, sh);
      for (let i = 0; i < 18; i++) { const e = rng.int(0, 3); R(q, '#20170f', e < 2 ? sx0 + rng.int(0, sw) : (e === 2 ? sx0 : sx0 + sw - 1), e < 2 ? (e ? sy0 + sh - 1 : sy0) : sy0 + rng.int(0, sh), e < 2 ? rng.int(2, 9) : 1, e < 2 ? 1 : rng.int(2, 9)); }
      R(q, 'rgba(232,214,168,0.10)', sx0, sy0, sw, 2);
      for (let i = 0; i < 9; i++) R(q, 'rgba(150,180,190,0.08)', sx0 + 10, sy0 + 16 + i * 15, rng.int(60, sw - 24), 1);
      for (let i = 0; i < 4; i++) ring(q, sx0 + 60 + i * 44, sy0 + 76, 16 + i * 5, 'rgba(150,180,190,0.08)');
      for (const pin of [[sx0 + 4, sy0 + 4], [sx0 + sw - 6, sy0 + 4], [sx0 + 4, sy0 + sh - 6], [sx0 + sw - 6, sy0 + sh - 6]]) {
        R(q, '#1a140e', pin[0] - 1, pin[1] - 1, 4, 4); R(q, '#c8302e', pin[0], pin[1], 3, 3); R(q, '#ff9a9a', pin[0], pin[1], 1, 1);
      }
      // corner bolts holding the board to the wall
      for (const bo of [[12, 12], [PW - 14, 12], [12, PH - 14], [PW - 14, PH - 14]]) {
        R(q, '#100b06', bo[0] - 1, bo[1] - 1, 8, 8);
        R(q, '#6d747f', bo[0], bo[1], 6, 6); R(q, '#aeb6c1', bo[0], bo[1], 5, 2);
        R(q, '#3c424b', bo[0] + 1, bo[1] + 4, 4, 1); R(q, '#22262c', bo[0] + 2, bo[1] + 2, 2, 2);
      }
      // tools hanging in the gaps between the limbs
      this.tool(q, 100, 60, 'wrench'); this.tool(q, 328, 64, 'saw');
      this.tool(q, 214, 52, 'coil');
      this.pegs = b;

      // ------------------------------------------- the lantern's light pool
      const GR = 92, g = can(GR * 2, GR * 2), gx2 = g.getContext('2d');
      for (let yy = -GR; yy < GR; yy++) for (let xx = -GR; xx < GR; xx++) {
        const d = Math.sqrt(xx * xx + yy * yy) / GR;
        if (d >= 1) continue;
        const a = (1 - d) * (1 - d);
        const lv = Math.floor(a * 3.4 + bay(xx + GR, yy + GR) * 0.95);
        if (lv <= 0) continue;
        gx2.fillStyle = lv >= 3 ? 'rgba(255,196,112,0.16)' : lv === 2 ? 'rgba(255,186,104,0.10)' : 'rgba(255,176,98,0.055)';
        gx2.fillRect(xx + GR, yy + GR, 1, 1);
      }
      this.glow = spr(g, GR, GR);

      for (let i = 0; i < 90; i++) this.motes.push({
        x: rng.range(0, 640), y: rng.range(0, 360), vy: rng.range(-5, -1.2),
        vx: rng.range(-3, 5), ph: rng.range(0, TAU), b: rng.range(0.18, 0.7),
      });
      for (let i = 0; i < 16; i++) this.embers.push({
        x: rng.range(0, 640), y: rng.range(200, 380), vy: rng.range(-24, -9),
        ph: rng.range(0, TAU), life: rng.range(0, 3), max: 3,
      });
    },

    // little hand-drawn tool silhouettes for the pegboard
    tool(q, x, y, kind) {
      const D = 'rgba(12,9,5,0.8)', M = 'rgba(76,64,50,0.8)', H = 'rgba(112,95,74,0.7)';
      if (kind === 'wrench') {
        R(q, D, x - 2, y, 5, 46); R(q, M, x - 1, y + 2, 3, 42);
        R(q, D, x - 6, y - 8, 13, 10); R(q, M, x - 5, y - 7, 11, 8); R(q, D, x - 2, y - 8, 5, 5);
        R(q, D, x - 5, y + 44, 11, 9); R(q, M, x - 4, y + 45, 9, 7); R(q, D, x - 1, y + 48, 3, 5);
        R(q, H, x - 1, y + 4, 1, 38);
      } else if (kind === 'saw') {
        R(q, D, x - 3, y, 6, 12); R(q, M, x - 2, y + 1, 4, 10);
        R(q, D, x - 2, y + 12, 5, 40); R(q, M, x - 1, y + 13, 3, 38);
        for (let i = 0; i < 14; i++) R(q, D, x + 3, y + 14 + i * 3, 3, 2);
      } else {
        for (let r = 12; r >= 6; r -= 3) ring(q, x, y + 14, r, r === 12 ? D : M);
        R(q, D, x - 2, y - 4, 4, 10); R(q, M, x - 1, y - 3, 2, 8);
      }
    },

    update(dt) {
      this.build();
      this.t += dt;
      const t = this.t;
      for (const m of this.motes) {
        m.y += m.vy * dt; m.x += (m.vx + Math.sin(t * 0.5 + m.ph) * 4) * dt; m.ph += dt * 0.7;
        if (m.y < -4) { m.y = 364; m.x = rand(0, 640); }
        if (m.x < -4) m.x = 644; if (m.x > 644) m.x = -4;
      }
      for (const e of this.embers) {
        e.life -= dt;
        if (e.life <= 0) { e.life = e.max = rand(1.6, 3.4); e.x = rand(0, 640); e.y = rand(300, 380); e.vy = rand(-26, -10); }
        e.y += e.vy * dt; e.x += Math.sin(t * 2 + e.ph) * 9 * dt;
      }
    },

    // lantern position: it swings slowly above the board
    lampX() { return 96 + Math.sin(this.t * 0.31) * 62; },
    lampY() { return 96 + Math.sin(this.t * 0.47) * 16; },

    renderWall(ctx, scroll) {
      ctx.drawImage(this.wall, 0, Math.round(-20 - scroll * 0.22));
    },
    renderBoard(ctx, scroll) {
      ctx.drawImage(this.pegs, TREE.x, Math.round(TREE.y - scroll));
    },
    renderLight(ctx) {
      blit(ctx, this.glow, Math.round(this.lampX()), Math.round(this.lampY()));
      blit(ctx, this.glow, Math.round(this.lampX() + 150), Math.round(this.lampY() + 120));
    },
    renderDust(ctx, scroll) {
      const lx = this.lampX(), ly = this.lampY();
      for (const m of this.motes) {
        const d = dist(m.x, m.y, lx, ly);
        const a = m.b * (0.45 + Math.sin(m.ph) * 0.35) * (d < 110 ? 1 : 0.35);
        ctx.fillStyle = d < 110 ? `rgba(255,228,168,${a.toFixed(2)})` : `rgba(190,176,152,${(a * 0.7).toFixed(2)})`;
        ctx.fillRect(m.x | 0, m.y | 0, 1, 1);
      }
      for (const e of this.embers) {
        const a = Math.min(1, e.life / e.max * 1.5) * 0.8;
        ctx.fillStyle = `rgba(255,154,60,${a.toFixed(2)})`;
        ctx.fillRect(e.x | 0, e.y | 0, 1, 1);
        if (a > 0.6) { ctx.fillStyle = `rgba(255,228,143,${((a - 0.6) * 2).toFixed(2)})`; ctx.fillRect(e.x | 0, (e.y | 0) - 1, 1, 1); }
      }
    },
  };

  // ===========================================================================
  //  SOCKET PLATES — the nodes. Octagonal brass sockets riveted to the limb.
  // ===========================================================================
  const PLATE_W = 22;
  const PLATE = { locked: null, avail: null, afford: null, owned: null, hover: null, chain: null, mini: {} };
  const PSKIN = {
    locked: { out: '#0a0d12', hi: '#5b6570', mid: '#39414d', lo: '#20262e', rec: '#10151c', gem: '#2b3744', dead: true },
    avail:  { out: '#150e05', hi: '#a4813d', mid: '#7a5a28', lo: '#452d10', rec: '#241a0c', gem: '#8a7038' },
    afford: { out: '#150e05', hi: '#efcb66', mid: '#bd9531', lo: '#6b5016', rec: '#31260f', gem: '#ffe48f' },
    owned:  { out: '#150e05', hi: '#fff0bc', mid: '#e3b752', lo: '#8a6314', rec: '#4e3811', gem: '#fffbe6' },
  };

  function plateSprite(S, sk) {
    const c = can(S, S), x = c.getContext('2d');
    const h = (S - 1) / 2, oct = h * 1.42;
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const dx = xx - h, dy = yy - h;
      const d1 = Math.max(Math.abs(dx), Math.abs(dy)), d2 = Math.abs(dx) + Math.abs(dy);
      if (d1 > h + 0.5 || d2 > oct + 1.2) continue;
      let col;
      if (d1 > h - 0.6 || d2 > oct - 0.2) col = sk.out;
      else if (d1 > h - 2.4 || d2 > oct - 2.6) col = (dx + dy < 0) ? sk.hi : sk.lo;
      else if (d1 > h - 3.4 || d2 > oct - 4.2) col = sk.mid;
      else col = sk.rec;
      x.fillStyle = col; x.fillRect(xx, yy, 1, 1);
    }
    // recess lip: dark at the top-left, catching light at the bottom-right
    const r0 = Math.round(h - 3.4);
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.fillRect(Math.round(h - r0), Math.round(h - r0), r0 * 2, 1);
    x.fillRect(Math.round(h - r0), Math.round(h - r0), 1, r0 * 2);
    x.fillStyle = sk.dead ? 'rgba(120,136,152,0.22)' : 'rgba(255,220,150,0.20)';
    x.fillRect(Math.round(h - r0), Math.round(h + r0 - 1), r0 * 2, 1);
    x.fillRect(Math.round(h + r0 - 1), Math.round(h - r0), 1, r0 * 2);
    if (S >= 18) {
      // four rivets on the flats
      const rv = Math.round(h - 2.5);
      for (const p of [[0, -rv], [0, rv], [-rv, 0], [rv, 0]]) {
        const rx = Math.round(h + p[0]) - 1, ry = Math.round(h + p[1]) - 1;
        x.fillStyle = sk.out; x.fillRect(rx, ry, 3, 3);
        x.fillStyle = sk.hi; x.fillRect(rx, ry, 2, 2);
        x.fillStyle = sk.lo; x.fillRect(rx + 1, ry + 1, 2, 2);
      }
      if (sk.dead) {                                  // locked: a bolted-over cover
        x.fillStyle = 'rgba(16,20,26,0.55)';
        for (let i = -S; i < S; i += 4) for (let k = 0; k < S; k++) {
          const px2 = i + k, py2 = k;
          if (px2 < 4 || px2 >= S - 4 || py2 < 4 || py2 >= S - 4) continue;
          x.fillRect(px2, py2, 1, 1);
        }
        x.fillStyle = '#4b5762'; x.fillRect(4, Math.round(h) - 1, S - 8, 3);
        x.fillStyle = '#6d7883'; x.fillRect(4, Math.round(h) - 1, S - 8, 1);
        x.fillStyle = '#2b333c'; x.fillRect(Math.round(h) - 2, Math.round(h) - 1, 4, 3);
      }
    }
    return spr(c, h, h);
  }

  function octRing(S, col, dash) {
    const c = can(S, S), x = c.getContext('2d');
    const h = (S - 1) / 2, oct = h * 1.42;
    let n = 0;
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const dx = xx - h, dy = yy - h;
      const d1 = Math.max(Math.abs(dx), Math.abs(dy)), d2 = Math.abs(dx) + Math.abs(dy);
      if (d1 > h + 0.5 || d2 > oct + 1.2) continue;
      if (d1 < h - 1.1 && d2 < oct - 1.4) continue;
      if (dash && (((xx + yy) >> 1) & 1)) continue;
      x.fillStyle = col; x.fillRect(xx, yy, 1, 1);
      n++;
    }
    return spr(c, h, h);
  }

  function buildPlates() {
    for (const k in PSKIN) {
      PLATE[k] = plateSprite(PLATE_W, PSKIN[k]);
      PLATE.mini[k] = plateSprite(12, PSKIN[k]);
    }
    PLATE.hover = octRing(PLATE_W + 6, '#fff6d2', false);
    PLATE.chain = octRing(PLATE_W + 4, '#ffd97a', true);
  }

  // ===========================================================================
  //  STAT PREVIEW TABLES
  // ===========================================================================
  const STAT_ROWS = [
    ['maxHp', 'MAX HP', 'int', 0], ['regen', 'HP REGEN', 'hps', 0], ['armor', 'ARMOUR', 'pct', 0],
    ['dmg', 'DAMAGE', 'mult', 1], ['revolverDmg', 'REVOLVER DMG', 'mult', 1], ['fireRate', 'FIRE RATE', 'mult', 1],
    ['projSpeed', 'SHOT SPEED', 'mult', 1], ['projCount', 'EXTRA SHOTS', 'int', 0], ['pierce', 'PIERCE', 'int', 0],
    ['ricochet', 'RICOCHET', 'int', 0], ['explosive', 'BLAST RADIUS', 'int', 0], ['crit', 'CRIT CHANCE', 'pct', 0],
    ['knock', 'KNOCKBACK', 'mult', 1], ['burn', 'BURN', 'dps', 0],
    ['speed', 'SWIM SPEED', 'mult', 1], ['accel', 'ACCELERATION', 'mult', 1], ['turn', 'TURNING', 'mult', 1],
    ['rollCd', 'ROLL COOLDOWN', 'multLow', 1], ['rollDist', 'ROLL RANGE', 'mult', 1], ['rollCharges', 'ROLL CHARGES', 'int', 0],
    ['rollDmg', 'ROLL DAMAGE', 'int', 0], ['rollSplash', 'ROLL SPLASH', 'int', 0],
    ['absorbWindow', 'PARRY WINDOW', 'sec', 0], ['absorbCd', 'PARRY COOLDOWN', 'multLow', 1],
    ['absorbHeal', 'PARRY HEAL', 'int', 0], ['absorbShock', 'PARRY BLAST', 'int', 0],
    ['rampGain', 'RAMPAGE GAIN', 'mult', 1], ['rampDur', 'RAMPAGE TIME', 'sec', 0],
    ['magnet', 'PICKUP RANGE', 'mult', 1], ['scrapBonus', 'BONUS SCRAP', 'int', 0], ['scrapMult', 'SCRAP FOUND', 'mult', 1],
    ['cdMult', 'ALL COOLDOWNS', 'multLow', 1],
  ];
  const FLAG_ROWS = {
    bigIron: 'BIG IRON ROUNDS', slipstream: 'SLIPSTREAM', currentRider: 'CURRENT RIDER',
    dive: 'ABILITY: DEEP DIVE', absorbBoost: 'BLUBBER BURST', absorbReflect: 'REFLECTED SHOTS',
    rampExplosive: 'EXPLOSIVE RAMPAGE', rampFrenzy: 'RAMPAGE FRENZY', decoy: 'ABILITY: DECOY BUOY',
    tidal: 'ABILITY: TIDAL SLAM', rockSense: 'ROCK SENSE', secondWind: 'SECOND WIND',
    sidearm: 'SIDEARM SLOT', perfectParry: 'PERFECT PARRY',
  };
  function fmtStat(v, kind) {
    switch (kind) {
      case 'int': return String(Math.round(v));
      case 'mult': case 'multLow': return 'x' + v.toFixed(2);
      case 'pct': return Math.round(v * 100) + '%';
      case 'sec': return v.toFixed(2) + 's';
      case 'hps': return v.toFixed(1) + '/s';
      case 'dps': return Math.round(v) + '/s';
    }
    return String(v);
  }
  function statsWithNode(tree, node) {
    const had = tree.unlocked.has(node.id);
    if (!had) tree.unlocked.add(node.id);
    let s; try { s = tree.stats(); } finally { if (!had) tree.unlocked.delete(node.id); }
    return s;
  }
  function nodeEffect(tree, node) {
    const cur = tree.stats(), nxt = statsWithNode(tree, node), out = [];
    for (const row of STAT_ROWS) {
      const k = row[0];
      let a = cur[k], b = nxt[k];
      if (a === undefined && b === undefined) continue;
      if (a === undefined) a = row[3];
      if (b === undefined) b = row[3];
      if (Math.abs(a - b) < 1e-6) continue;
      const better = row[2] === 'multLow' ? b < a : b > a;
      out.push({ label: row[1], from: fmtStat(a, row[2]), to: fmtStat(b, row[2]), better: better });
    }
    for (const k in FLAG_ROWS) if (!cur[k] && nxt[k]) out.push({ label: FLAG_ROWS[k], from: null, to: null, better: true });
    return out;
  }

  // ===========================================================================
  //  SKILL TREE — the screen
  // ===========================================================================
  const LAY = {
    headH: 32,
    board: { x: 2, y: 34, w: 432, h: 264 },
    card: { x: 442, y: 34, w: 196, h: 264 },
    bottom: { y: 300, h: 60 },
  };
  // The tree lives on a virtual board taller than the window: the trunk runs
  // off the bottom into the workbench, and panning follows it down.
  const TREE = { x: LAY.board.x, y: LAY.board.y, w: 432, h: 312 };
  const SCROLL_HOME = 14, SCROLL_MAX = TREE.h - LAY.board.h;   // 48
  const LIMB_CX = [46, 158, 270, 382];      // centre of each limb, board-relative
  const LIMB_DY = [0, -6, -6, 0];           // the inner pair forks a little higher
  const COL_PITCH = 28, ROW_PITCH = 26, ROW0_Y = 208;
  const COL_ARC = [3, -2, 3];               // rows bow slightly, like real branches
  const BANNER_W = 84, BANNER_H = 16;
  const TRUNK_X = 214, FORK_Y = 262, TRUNK_FOOT = 318;
  const BR_TOP = [6, 6, 5, 5];              // deepest row in each branch
  const nodeTY = (n, bi) => ROW0_Y - n.pos[1] * ROW_PITCH + LIMB_DY[bi] + COL_ARC[n.pos[0]];
  const bannerTY = bi => ROW0_Y - BR_TOP[bi] * ROW_PITCH + LIMB_DY[bi] - 13 - BANNER_H - 2;
  const limbThick = r => Math.max(3, 9 - r);

  const Upgrades = {
    ready: false, wantsClose: false, focus: -1, sel: null, scroll: SCROLL_HOME, scrollTo: SCROLL_HOME,
    hover: null, hoverW: null,
    T: 0, drag: null, affordOnly: false, chrome: null, labels: [], sparks: [], grow: {},
    flash: {}, summary: null, effectCache: { id: null, rows: null }, lastCount: -1, glow: 0,

    init() {
      if (this.ready) return; this.ready = true;
      buildIcons();
      Deep.build();          // still used by the main menu
      buildPlates();
      Shop.build();
      this.buildChrome();
    },

    buildChrome() {
      const c = can(640, 360), x = c.getContext('2d');
      UIKit.panel(x, -10, -12, 660, 44, 'dark');          // header bar
      UIKit.panel(x, LAY.card.x, LAY.card.y, LAY.card.w, LAY.card.h, 'gold');
      UIKit.panel(x, -10, LAY.bottom.y, 660, 72, 'dark'); // bottom bar
      this.chrome = c;
    },

    open() {
      this.init();
      this.wantsClose = false;
      this.scroll = this.scrollTo = SCROLL_HOME;
      this.hover = null; this.hoverW = null; this.drag = null; this.sel = null; this.focus = -1;
      this.labels.length = 0; this.sparks.length = 0;
      this.grow = {};
      this.flash = {};
      this.lastCount = -1;
      this.slotMode = 'primary';
      this._cardKey = null; this._botKey = null; this._limbKey = null;
    },

    tree() { return (typeof G !== 'undefined' && G && G.tree) ? G.tree : null; },

    branchNodes(i) {
      const id = BRANCHES[i].id;
      return SKILL_NODES.filter(n => n.branch === id);
    },
    branchIndex(n) { return BRANCHES.findIndex(b => b.id === n.branch); },

    // where a node's socket sits on screen
    nodePos(n, t) {
      const bi = Math.max(0, this.branchIndex(n));
      const x = TREE.x + LIMB_CX[bi] + (n.pos[0] - 1) * COL_PITCH;
      const y = TREE.y + nodeTY(n, bi) - this.scroll;
      return { x: Math.round(x), y: Math.round(y), ph: n.pos[0] * 1.9 + n.pos[1] * 1.1 + (bi + 1) * 0.8 };
    },
    // the node the card is describing: the mouse wins, else the keyboard cursor
    hoverNode() { return this.hover || (this.sel ? SKILL_BY_ID[this.sel] : null); },

    // every prerequisite, transitively
    chainOf(node, out) {
      out = out || new Set();
      for (const r of node.req) {
        if (out.has(r)) continue;
        out.add(r);
        const p = SKILL_BY_ID[r];
        if (p) this.chainOf(p, out);
      }
      return out;
    },
    childrenOf(node) { return SKILL_NODES.filter(n => n.req.indexOf(node.id) >= 0); },

    buildSummary(tree) {
      const s = tree.stats();
      return {
        maxHp: s.maxHp, dmg: s.dmg, fireRate: s.fireRate, speed: s.speed,
        rollCharges: s.rollCharges, armor: s.armor,
        per: BRANCHES.map(b => SKILL_NODES.filter(n => n.branch === b.id && tree.has(n.id)).length),
      };
    },

    // ------------------------------------------------------------- update
    update(dt, t) {
      this.init();
      this.T += dt;
      const T = this.T;
      Shop.update(dt);
      this.glow = (this.glow + dt) % 100;

      const tree = this.tree();
      if (!tree) return;
      if (!this.summary || this.lastCount !== tree.unlocked.size) {
        const prev = this.summary;
        this.summary = this.buildSummary(tree);
        if (prev) for (const k in this.summary) {
          if (k === 'per') continue;
          if (Math.abs(prev[k] - this.summary[k]) > 1e-6) this.flash[k] = 1;
        }
        this.lastCount = tree.unlocked.size;
      }
      for (const k in this.flash) { this.flash[k] -= dt * 1.1; if (this.flash[k] <= 0) delete this.flash[k]; }

      // sockets bedding in, sparks and rising labels
      for (const id in this.grow) { this.grow[id] += dt * 1.9; if (this.grow[id] >= 1) delete this.grow[id]; }
      for (let i = this.labels.length - 1; i >= 0; i--) { const l = this.labels[i]; l.t += dt; if (l.t > 1.7) this.labels.splice(i, 1); }
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s2 = this.sparks[i]; s2.life -= dt;
        if (s2.life <= 0) { this.sparks.splice(i, 1); continue; }
        s2.x += s2.vx * dt; s2.y += s2.vy * dt; s2.vy += 330 * dt; s2.vx *= 0.985;
      }

      const m = Input.mouse;
      const B = LAY.board;

      // ---- keyboard ----
      if (Input.hit && Input.hit('Escape')) this.wantsClose = true;
      if (Input.hit && Input.hit('KeyE')) this.setFocus(this.focus + 1);
      if (Input.hit && Input.hit('KeyQ')) this.setFocus(this.focus - 1);
      if (Input.hit) {
        if (Input.hit('ArrowUp')) this.step(0, -1);
        else if (Input.hit('ArrowDown')) this.step(0, 1);
        else if (Input.hit('ArrowLeft')) this.step(-1, 0);
        else if (Input.hit('ArrowRight')) this.step(1, 0);
        if ((Input.hit('Enter') || Input.hit('NumpadEnter') || Input.hit('Space')) && this.sel) {
          const n = SKILL_BY_ID[this.sel]; if (n) this.click(n, tree);
        }
      }
      if (Input.wheel) this.scrollTo += Input.wheel * 16;

      // ---- header buttons ----
      const backX = 566, backW = 68;   // always on screen, so touch has a way out
      if (m.clicked && hit(m, backX, 3, backW, 22)) { this.wantsClose = true; Audio_.tone(420, 0.08, 'square', 0.12, -120); }
      if (m.clicked && hit(m, 480, 4, 74, 20)) { this.affordOnly = !this.affordOnly; Audio_.tone(this.affordOnly ? 700 : 400, 0.07, 'square', 0.12); }

      // ---- branch banners: click one to focus that limb ----
      for (let i = 0; i < 4; i++) {
        const bx = B.x + LIMB_CX[i] - BANNER_W / 2, by = B.y + bannerTY(i) - this.scroll;
        if (m.clicked && hit(m, bx, by, BANNER_W, BANNER_H)) this.setFocus(this.focus === i ? -1 : i);
      }

      // ---- the tree: hover + click ----
      const inBoard = hit(m, B.x, B.y, B.w, B.h);
      this.hover = null;
      if (inBoard && !this.drag) {
        for (const n of SKILL_NODES) {
          if (this.focus >= 0 && this.branchIndex(n) !== this.focus) continue;
          const p = this.nodePos(n, T);
          if (Math.abs(m.x - p.x) <= 13 && Math.abs(m.y - p.y) <= 13) { this.hover = n; break; }
        }
        if (this.hover) this.sel = null;
      }
      const shown = this.hoverNode();
      if (shown && this.effectCache.id !== shown.id) {
        this.effectCache.id = shown.id;
        this.effectCache.rows = shown.weapon ? null : nodeEffect(tree, shown);
      }
      if (!shown) this.effectCache.id = null;

      // drag-to-pan only when the press did not land on a socket
      if (m.down && inBoard && !this.drag && !this.hover) this.drag = { y: m.y, s: this.scrollTo };
      if (this.drag) {
        if (!m.down) this.drag = null;
        else this.scrollTo = this.drag.s + (this.drag.y - m.y);
      }

      if (this.hover && m.clicked) this.click(this.hover, tree);
      if (this.hover && m.rclicked) this.rclick(this.hover, tree);

      // ---- loadout strip ----
      const canSide = tree.stats().sidearm;
      if (!canSide) this.slotMode = 'primary';
      if (canSide && m.clicked && hit(m, 226, 314, 72, 26)) {
        this.slotMode = this.slotMode === 'sidearm' ? 'primary' : 'sidearm';
        Audio_.tone(this.slotMode === 'sidearm' ? 680 : 420, 0.07, 'square', 0.12);
      }
      this.hoverW = null;
      for (let i = 0; i < WEAPON_ORDER.length; i++) {
        const sx = 8 + i * 31, sy = 314;
        if (hit(m, sx, sy, 26, 26)) {
          this.hoverW = WEAPON_ORDER[i];
          const unlocked = tree.weaponsUnlocked().indexOf(this.hoverW) >= 0;
          if (m.clicked) {
            if (!unlocked) Audio_.deny();
            else this.equip(tree, this.hoverW, this.slotMode === 'sidearm');
          }
          if (m.rclicked) {
            if (unlocked) this.equip(tree, this.hoverW, true); else Audio_.deny();
          }
        }
      }

      this.scrollTo = clamp(this.scrollTo, 0, SCROLL_MAX);
      this.scroll = Math.round(lerp(this.scroll, this.scrollTo, 1 - Math.pow(0.0015, dt)));
    },

    setFocus(i) {
      const n = i < -1 ? 3 : i > 3 ? -1 : i;
      if (n === this.focus) return;
      this.focus = n; this.hover = null;
      Audio_.tone(n < 0 ? 380 : 520 + n * 40, 0.06, 'square', 0.1);
    },

    // keyboard cursor: jump to the nearest socket in a direction
    step(dx, dy) {
      const pool = SKILL_NODES.filter(n => this.focus < 0 || this.branchIndex(n) === this.focus);
      if (!pool.length) return;
      const cur = this.sel ? SKILL_BY_ID[this.sel] : null;
      let best = null, bd = 1e9;
      if (!cur) { best = pool[0]; }
      else {
        const a = this.nodePos(cur, this.T);
        for (const n of pool) {
          if (n === cur) continue;
          const b = this.nodePos(n, this.T);
          const ox = b.x - a.x, oy = b.y - a.y;
          const along = ox * dx + oy * dy, side = Math.abs(ox * dy) + Math.abs(oy * dx);
          if (along <= 2) continue;
          const d = along + side * 2.6;
          if (d < bd) { bd = d; best = n; }
        }
      }
      if (!best) return;
      this.sel = best.id; this.hover = null;
      const p = this.nodePos(best, this.T);
      if (p.y < LAY.board.y + 24) this.scrollTo -= 40;
      if (p.y > LAY.board.y + LAY.board.h - 24) this.scrollTo += 40;
      Audio_.tone(600, 0.03, 'square', 0.06);
    },

    click(n, tree) {
      if (tree.has(n.id)) {
        if (n.weapon) this.equip(tree, n.weapon, this.slotMode === 'sidearm');
        else Audio_.tone(300, 0.05, 'square', 0.08);
        return;
      }
      if (!tree.available(n) || !tree.canAfford(n)) { Audio_.deny(); return; }
      if (!tree.buy(n)) { Audio_.deny(); return; }
      // a bolt driven home
      Audio_.buy();
      Audio_.tone(170, 0.09, 'square', 0.18, -80);
      Audio_.noise(0.09, 0.22, 3400, 700);
      if (typeof G !== 'undefined' && G && G.player && G.player.refreshStats) G.player.refreshStats();
      if (n.weapon) tree.primary = n.weapon;
      const p = this.nodePos(n, this.T);
      const col = BRANCHES[this.branchIndex(n)].color;
      this.grow[n.id] = 0;
      this.socketSparks(p.x, p.y);
      this.labels.push({ text: '+ ' + n.name, x: p.x, y: p.y - 16, t: 0, color: col });
      this._limbKey = null;
      if (typeof G !== 'undefined' && G && G.particles && G.player && G.particles.text) {
        try { G.particles.text(G.player.x, G.player.y - 24, n.name + '!', '#6fd88e', 8); } catch (e) { /* cosmetic only */ }
      }
    },
    rclick(n, tree) {
      if (!n.weapon || !tree.has(n.id)) return;
      this.equip(tree, n.weapon, true);
    },
    // one place decides what a click on a weapon means
    equip(tree, w, asSide) {
      if (asSide) {
        if (!tree.stats().sidearm) { Audio_.deny(); return; }
        if (tree.sidearm === w) tree.sidearm = null;
        else {
          if (tree.primary === w) {                       // free the primary slot first
            const other = tree.weaponsUnlocked().filter(x => x !== w);
            if (!other.length) { Audio_.deny(); return; }
            tree.primary = other[0];
          }
          tree.sidearm = w;
        }
        Audio_.buy(); return;
      }
      if (tree.primary === w) { Audio_.tone(300, 0.05, 'square', 0.08); return; }
      tree.primary = w;
      if (tree.sidearm === w) tree.sidearm = null;
      Audio_.buy();
    },
    // hot metal thrown off as the socket seats
    socketSparks(x, y) {
      for (let i = 0; i < 34; i++) {
        const a = rand(-Math.PI, 0) + rand(-0.5, 0.5), sp = rand(40, 230);
        this.sparks.push({
          x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8,
          life: rand(0.22, 0.62), max: 0.62, hot: Math.random() < 0.45,
        });
      }
    },

    // ------------------------------------------------------------- render
    render(ctx, t) {
      this.init();
      const T = this.T, tree = this.tree();
      const B = LAY.board;

      ctx.save();
      ctx.beginPath(); ctx.rect(B.x, B.y, B.w, B.h); ctx.clip();
      Shop.renderWall(ctx, this.scroll);
      Shop.renderBoard(ctx, this.scroll);
      Shop.renderLight(ctx);

      if (tree) {
        const shown = this.hoverNode();
        const chain = shown ? this.chainOf(shown) : null;
        this.drawLimbs(ctx, tree, T, chain, shown);
        for (const n of SKILL_NODES) {
          const p = this.nodePos(n, T);
          if (p.y < B.y - 20 || p.y > B.y + B.h + 20) continue;
          this.drawNode(ctx, n, p, tree, T, chain, shown);
        }
        this.drawBanners(ctx, tree, T);
        if (shown) this.drawNameTag(ctx, shown, this.nodePos(shown, T));
      }

      // --- purchase feedback ---
      for (const s2 of this.sparks) {
        const a = Math.min(1, s2.life / s2.max * 1.8);
        ctx.fillStyle = s2.hot ? `rgba(255,248,214,${a.toFixed(2)})` : `rgba(255,154,60,${a.toFixed(2)})`;
        ctx.fillRect(s2.x | 0, s2.y | 0, 1, 1);
        if (a > 0.7) ctx.fillRect(s2.x | 0, (s2.y | 0) - 1, 1, 1);
      }
      for (const l of this.labels) {
        const k = l.t / 1.7;
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        pixelTextOutlined(ctx, l.text, l.x, Math.round(l.y - k * 24), 8, '#ffffff', '#2a1d08', 'center');
        ctx.globalAlpha = 1;
      }
      Shop.renderDust(ctx, this.scroll);
      ctx.restore();

      // --- ornate chrome ---
      ctx.drawImage(this.chrome, 0, 0);
      this.drawHeader(ctx, tree, T);
      this.drawPanBar(ctx);
      this.drawCard(ctx, tree, T);
      this.drawBottom(ctx, tree, T);
      ctx.globalAlpha = 1;
    },

    // ---------------------------------------------------- the wooden limbs
    // Everything that does not move frame to frame is baked into one canvas;
    // only the travelling sap-light beads are drawn live on top.
    drawLimbs(ctx, tree, T, chain, shown) {
      const key = tree.unlocked.size + '|' + this.focus + '|' + (shown ? shown.id : '-') + '|' + this.scroll
        + '|' + Object.keys(this.grow).map(k => k + ((this.grow[k] * 8) | 0)).join(',');
      if (!this._limbCan) { this._limbCan = can(LAY.board.w, LAY.board.h); this._limbCtx = this._limbCan.getContext('2d'); }
      if (key !== this._limbKey) {
        this._limbKey = key;
        const q = this._limbCtx;
        q.clearRect(0, 0, LAY.board.w, LAY.board.h);
        q.save(); q.translate(-LAY.board.x, -LAY.board.y);
        this.paintLimbs(q, tree, T, chain);
        q.restore();
      }
      ctx.drawImage(this._limbCan, LAY.board.x, LAY.board.y);
      // live sap beads running up the limbs you own
      for (const n of SKILL_NODES) {
        if (!tree.has(n.id)) continue;
        if (this.focus >= 0 && this.branchIndex(n) !== this.focus) continue;
        for (const rid of n.req) {
          if (!tree.has(rid)) continue;
          const par = SKILL_BY_ID[rid]; if (!par) continue;
          const seg = this.twig(this.nodePos(par, T), this.nodePos(n, T));
          const u = ((T * 0.45 + n.pos[0] * 0.21 + n.pos[1] * 0.13) % 1);
          const q = bez(seg, u);
          R(ctx, '#fff4c4', q.x - 1, q.y - 1, 3, 3);
          R(ctx, '#ffffff', q.x, q.y, 1, 1);
        }
      }
    },

    twig(a, b) {
      const dy = Math.max(10, a.y - b.y);
      return { x0: a.x, y0: a.y - 9, x1: a.x, y1: a.y - 9 - dy * 0.48,
               x2: b.x, y2: b.y + 9 + dy * 0.48, x3: b.x, y3: b.y + 9 };
    },

    paintLimbs(ctx, tree, T, chain) {
      const live = { out: '#0e0904', body: '#6b4522', hi: '#b07c46', lo: '#3a2210' };
      const dead = { out: '#0b0805', body: '#4c4236', hi: '#6a5b48', lo: '#2b241b' };
      const tx = TREE.x + TRUNK_X, fy = TREE.y + FORK_Y - this.scroll;

      // ---- the trunk, running down off the board into the workbench ----
      const foot = TREE.y + TRUNK_FOOT - this.scroll;
      this.woodSeg(ctx, { x0: tx, y0: foot, x1: tx + 3, y1: foot - 16, x2: tx - 2, y2: fy + 10, x3: tx, y3: fy }, 20, 15, live, 1, T);
      // a riveted salvage band around the trunk
      R(ctx, '#0b0805', tx - 11, fy + 26, 22, 9);
      R(ctx, '#5b626d', tx - 10, fy + 27, 20, 7);
      R(ctx, '#8d95a2', tx - 10, fy + 27, 20, 2);
      R(ctx, '#333942', tx - 10, fy + 32, 20, 2);
      for (let i = -8; i < 9; i += 5) { R(ctx, '#aeb6c1', tx + i, fy + 29, 2, 2); R(ctx, '#2a2f36', tx + i + 1, fy + 30, 1, 1); }

      // ---- four boughs forking out of the trunk into the limbs ----
      for (let i = 0; i < 4; i++) {
        const dim = this.focus >= 0 && this.focus !== i;
        const root = this.branchNodes(i).find(n => !n.req.length);
        if (!root) continue;
        const rp = this.nodePos(root, T);
        const owned = tree.has(root.id);
        const end = rp.y + 10, span = Math.max(24, fy - end);
        const seg = {
          x0: tx, y0: fy + 4,
          x1: tx + (rp.x - tx) * 0.10, y1: fy - span * 0.48,
          x2: rp.x + (tx - rp.x) * 0.10, y2: end + span * 0.52,
          x3: rp.x, y3: end,
        };
        ctx.globalAlpha = dim ? 0.28 : 1;
        this.woodSeg(ctx, seg, 13, 9, owned ? live : dead, owned ? 1 : 0, T);
        ctx.globalAlpha = 1;
      }

      // ---- every prerequisite is a twig ----
      for (const n of SKILL_NODES) {
        const bi = this.branchIndex(n);
        const dim = this.focus >= 0 && this.focus !== bi;
        const a = this.nodePos(n, T);
        for (const rid of n.req) {
          const par = SKILL_BY_ID[rid]; if (!par) continue;
          const b = this.nodePos(par, T);
          const grown = tree.has(rid);
          const full = grown && tree.has(n.id);
          let litK = full ? 1 : 0;
          if (full && this.grow[n.id] !== undefined) litK = this.grow[n.id];
          const highlight = chain && (chain.has(rid) && (chain.has(n.id) || n === this.hoverNode()));
          ctx.globalAlpha = dim ? 0.3 : 1;
          this.woodSeg(ctx, this.twig(b, a), limbThick(par.pos[1]), limbThick(n.pos[1]),
            grown ? live : dead, litK, T, highlight);
          ctx.globalAlpha = 1;
        }
      }
    },

    // One tapered length of branch. Bars are stamped across the tangent, so a
    // limb reads as solid timber instead of a string of beads.
    woodSeg(ctx, seg, w0, w1, pal, litK, T, highlight) {
      const span = Math.abs(seg.x3 - seg.x0) + Math.abs(seg.y3 - seg.y0);
      const n = Math.max(12, Math.round(span / 1.4));
      const pts = [], vert = [];
      for (let i = 0; i <= n; i++) pts.push(bez(seg, i / n));
      for (let i = 0; i <= n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
        vert.push(Math.abs(b.x - a.x) <= Math.abs(b.y - a.y));
      }
      const bar = (i, col, grow, thick) => {
        const w = Math.round(lerp(w0, w1, i / n)) + grow;
        if (w < 1) return;
        const p = pts[i], h = w >> 1;
        if (vert[i]) R(ctx, col, p.x - h, p.y - (thick >> 1), w, thick);
        else R(ctx, col, p.x - (thick >> 1), p.y - h, thick, w);
      };
      for (let i = 0; i <= n; i++) bar(i, pal.out, 2, 3);     // bark outline
      for (let i = 0; i <= n; i++) bar(i, pal.body, 0, 3);    // heartwood
      // light catches one side, shadow pools on the other
      for (let i = 0; i <= n; i++) {
        const w = Math.round(lerp(w0, w1, i / n)), h = w >> 1, p = pts[i];
        if (w < 4) continue;
        if (vert[i]) { R(ctx, pal.hi, p.x - h, p.y - 1, 1, 3); R(ctx, pal.lo, p.x + h - 1, p.y - 1, 1, 3); }
        else { R(ctx, pal.hi, p.x - 1, p.y - h, 3, 1); R(ctx, pal.lo, p.x - 1, p.y + h - 1, 3, 1); }
      }
      // knots and grain flecks on the heavier limbs
      for (let i = 4; i <= n - 4; i += 9) {
        const w = Math.round(lerp(w0, w1, i / n));
        if (w < 6) continue;
        R(ctx, pal.lo, pts[i].x - 1, pts[i].y - 1, 2, 2);
      }
      // the grain lights up once the socket above is bolted in
      if (litK > 0) {
        const lim = Math.round(n * clamp(litK, 0, 1));
        for (let i = 0; i <= lim; i++) {
          const w = Math.round(lerp(w0, w1, i / n));
          if (w < 3) continue;
          const pulse = Math.sin(T * 3 - i * 0.22) > 0.1;
          R(ctx, pulse ? '#ffd97a' : '#d29a3a', pts[i].x, pts[i].y, 1, 1);
          if ((i & 7) === 0) R(ctx, '#fff4c4', pts[i].x, pts[i].y, 1, 1);
        }
        if (litK < 1) {                                       // the light racing up
          const p = pts[lim];
          R(ctx, '#fff8dc', p.x - 2, p.y - 2, 5, 5);
          R(ctx, '#ffffff', p.x - 1, p.y - 1, 3, 3);
        }
      }
      if (highlight) {
        for (let i = 0; i <= n; i++) {
          const w = Math.round(lerp(w0, w1, i / n)) + 3, h = w >> 1, p = pts[i];
          if (vert[i]) { R(ctx, 'rgba(255,246,210,0.35)', p.x - h, p.y, 1, 2); R(ctx, 'rgba(255,246,210,0.35)', p.x + h - 1, p.y, 1, 2); }
          else { R(ctx, 'rgba(255,246,210,0.35)', p.x, p.y - h, 2, 1); R(ctx, 'rgba(255,246,210,0.35)', p.x, p.y + h - 1, 2, 1); }
        }
      }
    },

    // -------------------------------------------------------- one socket
    drawNode(ctx, n, p, tree, T, chain, shown) {
      const owned = tree.has(n.id), avail = tree.available(n), afford = tree.canAfford(n);
      const state = owned ? 'owned' : !avail ? 'locked' : afford ? 'afford' : 'avail';
      const bi = this.branchIndex(n);
      const isShown = shown === n;
      const dimFocus = this.focus >= 0 && this.focus !== bi;
      const dimAfford = this.affordOnly && !owned && !(avail && afford);
      const alpha = dimFocus ? 0.3 : dimAfford ? 0.35 : 1;
      ctx.globalAlpha = alpha;

      if (chain && chain.has(n.id)) {
        ctx.globalAlpha = alpha * (0.55 + Math.sin(T * 5 + p.ph) * 0.45);
        blit(ctx, PLATE.chain, p.x, p.y);
        ctx.globalAlpha = alpha;
      }
      if (isShown) blit(ctx, PLATE.hover, p.x, p.y);

      // a socket you can pay for glints
      if (!owned && avail && afford) {
        ctx.globalAlpha = alpha * (0.3 + Math.sin(T * 4.4 + p.ph) * 0.26);
        blit(ctx, PLATE.hover, p.x, p.y);
        ctx.globalAlpha = alpha;
      }

      const g = this.grow[n.id];
      if (g !== undefined) {                       // slamming home
        const sc = 1 + (1 - g) * (1 - g) * 0.7;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc);
        ctx.drawImage(PLATE[state].c, -PLATE[state].ax, -PLATE[state].ay);
        ctx.restore();
      } else {
        blit(ctx, PLATE[state], p.x, p.y);
      }

      // the icon in the recess
      const art = nodeArt(n);
      ctx.globalAlpha = alpha * (avail || owned ? 1 : 0.5);
      ctx.drawImage(art.c, Math.round(p.x - art.w / 2), Math.round(p.y - art.h / 2));
      ctx.globalAlpha = alpha;
      if (g !== undefined) {                       // the flash of a fresh weld
        ctx.globalAlpha = alpha * (1 - g);
        R(ctx, '#fff8dc', p.x - 11, p.y - 11, 22, 22);
        ctx.globalAlpha = alpha;
      }

      // corner stamps
      if (owned) {
        R(ctx, '#140e05', p.x + 2, p.y + 2, 9, 9);
        R(ctx, '#ffe48f', p.x + 3, p.y + 3, 7, 7);
        R(ctx, '#c8952f', p.x + 3, p.y + 7, 7, 3);
        R(ctx, '#3c2803', p.x + 4, p.y + 6, 2, 2); R(ctx, '#3c2803', p.x + 5, p.y + 7, 2, 1);
        R(ctx, '#3c2803', p.x + 6, p.y + 5, 2, 2); R(ctx, '#3c2803', p.x + 7, p.y + 4, 2, 1);
      } else if (!avail) {
        R(ctx, '#0a0d12', p.x + 2, p.y + 2, 9, 9);
        R(ctx, '#6d7883', p.x + 3, p.y + 6, 7, 4);
        R(ctx, '#aeb6c1', p.x + 4, p.y + 3, 5, 3);
        R(ctx, '#0a0d12', p.x + 5, p.y + 4, 3, 2);
      }
      if (n.weapon && owned) {
        const prim = tree.primary === n.weapon, side = tree.sidearm === n.weapon;
        if (prim || side) {
          R(ctx, '#14141c', p.x - 11, p.y - 11, 9, 9);
          R(ctx, prim ? '#2f9e5b' : '#3f7fd6', p.x - 10, p.y - 10, 7, 7);
          pixelText(ctx, prim ? 'P' : 'S', p.x - 7, p.y - 9, 5, '#ffffff', 'center', false);
        }
      }
      ctx.globalAlpha = 1;
    },

    // a little nailed-on name tag for whatever socket you are pointing at
    drawNameTag(ctx, n, p) {
      const bi = Math.max(0, this.branchIndex(n));
      const w = textWidth(n.name, 7) + 14, h = 15;
      const lx = Math.round(clamp(p.x - w / 2, LAY.board.x + 3, LAY.board.x + LAY.board.w - w - 3));
      const ly = Math.round(p.y - 30 < LAY.board.y + 4 ? p.y + 16 : p.y - 30);
      R(ctx, '#05070b', lx + 1, ly + h, w - 2, 1);
      R(ctx, '#0a0a10', lx, ly, w, h);
      R(ctx, '#2d2414', lx + 1, ly + 1, w - 2, h - 2);
      R(ctx, '#4a3a20', lx + 1, ly + 1, w - 2, 1);
      R(ctx, '#171008', lx + 1, ly + h - 2, w - 2, 1);
      R(ctx, BRANCHES[bi].color, lx + 1, ly + 1, 2, h - 2);
      for (const sx of [lx + w - 5, lx + 4]) { R(ctx, '#14100a', sx, ly + 5, 3, 3); R(ctx, '#aeb6c1', sx, ly + 5, 2, 2); }
      pixelText(ctx, n.name, lx + w / 2 + 1, ly + 4, 7, '#fff6d2', 'center', false);
      // a thread of light back to the socket it belongs to
      const ay = ly > p.y ? ly : ly + h;
      for (let i = 0; i < Math.abs(ay - p.y); i += 3) R(ctx, 'rgba(255,228,143,0.45)', p.x, ay + (ly > p.y ? -i : i), 1, 1);
    },

    // ------------------------------------------------------ limb nameplates
    drawBanners(ctx, tree, T) {
      const m = Input.mouse, B = LAY.board;
      for (let i = 0; i < 4; i++) {
        const b = BRANCHES[i];
        const x = B.x + LIMB_CX[i] - BANNER_W / 2, y = B.y + bannerTY(i) - this.scroll;
        const on = this.focus === i, hv = hit(m, x, y, BANNER_W, BANNER_H);
        const nodes = this.branchNodes(i), have = nodes.filter(n => tree.has(n.id)).length;
        const ready = nodes.some(n => !tree.has(n.id) && tree.available(n) && tree.canAfford(n));
        ctx.globalAlpha = this.focus >= 0 && !on ? 0.45 : 1;
        // a brass nameplate screwed to the top of the limb
        R(ctx, '#0a0a10', x, y, BANNER_W, BANNER_H);
        R(ctx, on || hv ? '#7a5a28' : '#4a3a20', x + 1, y + 1, BANNER_W - 2, BANNER_H - 2);
        R(ctx, on || hv ? '#a4813d' : '#66512c', x + 1, y + 1, BANNER_W - 2, 1);
        R(ctx, '#2a2011', x + 1, y + BANNER_H - 2, BANNER_W - 2, 1);
        R(ctx, b.color, x + 1, y + 1, 2, BANNER_H - 2);
        for (const sx of [x + BANNER_W - 4, x + 2]) { R(ctx, '#1a140a', sx, y + 2, 3, 3); R(ctx, '#c3c9d3', sx, y + 2, 2, 2); }
        drawSprite(ctx, SP[b.icon], x + 6, y + 2);
        pixelText(ctx, b.name, x + 15, y + 1, 6, on || hv ? '#fff6d2' : b.color, 'left', false);
        const pw = BANNER_W - 44;
        R(ctx, '#140f08', x + 15, y + 9, pw, 5);
        R(ctx, '#241a0e', x + 16, y + 10, pw - 2, 3);
        R(ctx, b.color, x + 16, y + 10, Math.round((pw - 2) * have / nodes.length), 3);
        pixelText(ctx, have + '/' + nodes.length, x + BANNER_W - 5, y + 8, 5, '#e8d6ac', 'right', false);
        if (ready) {
          const f = Math.floor(T * 3) % 2;
          R(ctx, '#14141c', x + BANNER_W - 10, y + 8, 6, 6);
          R(ctx, f ? '#b6f5cd' : '#6fd88e', x + BANNER_W - 9, y + 9, 4, 4);
        }
        ctx.globalAlpha = 1;
      }
    },

    // ------------------------------------------------------------- header
    drawHeader(ctx, tree, T) {
      pixelTextOutlined(ctx, 'SKILL TREE', 8, 2, 18, '#ffe48f', '#2a1d08');
      pixelText(ctx, 'THE OTTER\'S WORKSHOP', 9, 18, 5, '#c39a5e');

      if (tree) {
        const shown = this.hoverNode();
        const need = shown && !tree.has(shown.id) ? shown.cost : null;
        SCRAP_TYPES.forEach((k, i) => {
          const x = 152 + i * 46, y = 2, w = 43, h = 22;
          const want = need && need[k] ? need[k] : 0;
          const ok = !want || tree.scrap[k] >= want;
          R(ctx, '#080c16', x, y, w, h);
          R(ctx, '#050810', x, y, w, 1); R(ctx, '#151e30', x, y + h - 1, w, 1);
          box(ctx, want ? (ok ? '#6fd88e' : '#ff6161') : '#2b3548', x, y, w, h);
          drawSprite(ctx, SP.scrap[k], x + 10, y + 11);
          pixelText(ctx, String(tree.scrap[k]), x + 19, y + 3, 8, SCRAP_COLORS[k]);
          if (want) pixelText(ctx, 'OF ' + want, x + 19, y + 14, 5, ok ? '#9ff0d8' : '#ff6161');
          else pixelText(ctx, SHORT_SCRAP[k], x + 19, y + 14, 5, '#5d7488');
        });
        const px0 = 386, pw = 86;
        pixelText(ctx, 'TAKEN', px0, 3, 6, '#c39a5e');
        pixelText(ctx, tree.unlocked.size + '/' + SKILL_NODES.length, px0 + pw, 2, 8, '#ffffff', 'right');
        UIKit.bar(ctx, px0, 14, pw, 8, tree.unlocked.size / SKILL_NODES.length, '#9a6c1e', '#ffe48f');
      }

      const m = Input.mouse;
      const aHov = hit(m, 480, 4, 74, 20);
      UIKit.button(ctx, 480, 4, 74, 20, null, this.affordOnly || aHov ? 'hover' : 'normal');
      R(ctx, '#14141c', 485, 9, 9, 9);
      R(ctx, this.affordOnly ? '#6fd88e' : '#2c3440', 486, 10, 7, 7);
      if (this.affordOnly) { R(ctx, '#0d3a20', 488, 14, 1, 2); R(ctx, '#0d3a20', 489, 15, 1, 1); R(ctx, '#0d3a20', 490, 13, 1, 1); R(ctx, '#0d3a20', 491, 12, 1, 1); }
      pixelText(ctx, 'AFFORD', 497, 9, 6, this.affordOnly ? '#ffffff' : '#d8c9a0');

      const bHov = hit(m, 566, 3, 68, 22);
      UIKit.button(ctx, 566, 3, 68, 22, 'BACK', bHov ? 'hover' : 'normal');
    },

    // a slim pan indicator down the right edge of the board
    drawPanBar(ctx) {
      const B = LAY.board, x = B.x + B.w + 1, h = B.h - 8, y = B.y + 4;
      R(ctx, '#0a0a10', x, y, 4, h);
      R(ctx, '#1d1810', x, y, 4, 1); R(ctx, '#1d1810', x, y + h - 1, 4, 1);
      const th = Math.max(24, Math.round(h * B.h / TREE.h));
      const ty = Math.round(y + (h - th) * (this.scroll / SCROLL_MAX));
      R(ctx, '#7a5a28', x, ty, 4, th);
      R(ctx, '#a4813d', x, ty, 4, 1);
      R(ctx, '#452d10', x, ty + th - 1, 4, 1);
      R(ctx, '#e0b34e', x + 1, ty + (th >> 1) - 2, 2, 5);
    },

    // --------------------------------------------------------------- card
    // The card is ~40 lines of text; it only changes when the hover, the
    // purse or the pulse phase changes, so it is painted to an offscreen and
    // re-blitted the rest of the time.
    drawCard(ctx, tree, T) {
      const c = LAY.card;
      if (!this._cardCan) { this._cardCan = can(c.w, c.h); this._cardCtx = this._cardCan.getContext('2d'); }
      let key = 'x';
      if (tree) {
        const n = this.hoverNode();
        key = (n ? n.id : '-') + '|' + tree.unlocked.size + '|' + tree.primary + '|' + tree.sidearm + '|' + this.focus
          + '|' + SCRAP_TYPES.map(k => tree.scrap[k] | 0).join(',')
          + '|' + (Math.floor(T * 3) % 2)
          + (typeof G !== 'undefined' && G && G.stats ? '|' + G.stats.kills + ',' + G.stats.absorbs + ',' + G.stats.scrapCollected : '');
      }
      if (key !== this._cardKey) {
        this._cardKey = key;
        const q = this._cardCtx;
        q.clearRect(0, 0, c.w, c.h);
        q.save(); q.translate(-c.x, -c.y);
        this.paintCard(q, tree, T);
        q.restore();
      }
      ctx.drawImage(this._cardCan, c.x, c.y);
    },

    paintCard(ctx, tree, T) {
      const c = LAY.card, X = c.x + 8, Wd = c.w - 16;
      let y = c.y + 8;
      if (!tree) return;
      const n = this.hoverNode();

      if (!n) { this.drawCardIdle(ctx, tree, X, y, Wd, T); return; }

      const owned = tree.has(n.id), avail = tree.available(n), afford = tree.canAfford(n);
      const bcol = (BRANCHES.find(b => b.id === n.branch) || BRANCHES[0]).color;

      // title
      const ts = fitSize(n.name, Wd, [12, 9, 7]);
      const lines = wrapText(ctx, n.name, Wd, ts).slice(0, 2);
      for (const l of lines) { pixelTextOutlined(ctx, l, X, y, ts, bcol, '#14141c'); y += ts === 12 ? 12 : 10; }
      y += 2;

      // big icon plate + status
      const state = owned ? 'owned' : !avail ? 'locked' : 'available';
      let px0 = X + 36;
      if (n.weapon && SP.guns[n.weapon]) {
        const pw = 50, ph = 30, g = SP.guns[n.weapon];
        R(ctx, '#0a0a10', X, y, pw, ph);
        R(ctx, owned ? '#9a6c1e' : '#4f5560', X + 1, y + 1, pw - 2, ph - 2);
        R(ctx, owned ? '#e0b34e' : '#848b97', X + 1, y + 1, pw - 2, 1);
        R(ctx, owned ? '#5a3c12' : '#2e323b', X + 1, y + ph - 2, pw - 2, 1);
        R(ctx, '#0a0a10', X + 3, y + 3, pw - 6, ph - 6);
        R(ctx, owned ? '#3a2a12' : '#161d30', X + 4, y + 4, pw - 8, ph - 8);
        ctx.save();
        ctx.beginPath(); ctx.rect(X + 4, y + 4, pw - 8, ph - 8); ctx.clip();
        ctx.drawImage(g.c, 0, 0, g.w, g.h, Math.round(X + pw / 2 - g.w), Math.round(y + ph / 2 - g.h), g.w * 2, g.h * 2);
        ctx.restore();
        px0 = X + pw + 6;
      } else {
        UIKit.slot(ctx, X, y, 30, state);
        const art = nodeArt(n);
        ctx.drawImage(art.c, Math.round(X + 15 - art.w / 2), Math.round(y + 15 - art.h / 2));
      }
      const bn = (BRANCHES.find(b => b.id === n.branch) || BRANCHES[0]).name;
      pixelText(ctx, n.weapon ? bn + ' - WEAPON' : bn, px0, y + 2, 6, bcol);
      const stat = owned ? 'BOLTED IN' : !avail ? 'SEALED' : afford ? 'READY TO FIT' : 'NOT ENOUGH SALVAGE';
      const scol = owned ? '#ffe48f' : !avail ? '#ff6161' : afford ? '#9ff0d8' : '#ff9a3c';
      R(ctx, '#0a0e18', px0, y + 11, X + Wd - px0, 11);
      box(ctx, scol, px0, y + 11, X + Wd - px0, 11);
      pixelText(ctx, stat, px0 + 3, y + 14, 6, scol);
      y += 34;

      UIKit.divider(ctx, X, y + 2, Wd); y += 7;

      // description
      for (const l of wrapText(ctx, n.desc, Wd, 6).slice(0, 5)) { pixelText(ctx, l, X, y, 6, '#dceef7'); y += 9; }
      y += 3;

      const bottomLimit = c.y + c.h - 26;

      // weapon comparison, or the stat effect
      if (n.weapon && WEAPONS[n.weapon]) {
        y = this.drawWeaponTable(ctx, n.weapon, tree, X, y, Wd, bottomLimit);
      } else if (this.effectCache.rows && this.effectCache.rows.length) {
        pixelText(ctx, owned ? 'IT GAVE YOU' : 'IF YOU TAKE IT', X, y, 6, '#ffe48f'); y += 10;
        for (const r of this.effectCache.rows) {
          if (y > bottomLimit - 10) break;
          if (r.from === null) { pixelText(ctx, '* ' + r.label, X, y, 6, '#9ff0d8'); y += 9; continue; }
          pixelText(ctx, r.label, X, y, 5, '#a9c4d6');
          pixelText(ctx, r.to, X + Wd, y, 6, r.better ? '#9ff0d8' : '#ff9a3c', 'right');
          pixelText(ctx, r.from + ' >', X + Wd - textWidth(r.to, 6) - 4, y, 5, '#6f8698', 'right');
          y += 9;
        }
        y += 2;
      }

      // what it opens up
      const kids = this.childrenOf(n);
      if (kids.length && y < bottomLimit - 18) {
        pixelText(ctx, 'UNLOCKS NEXT', X, y, 6, '#8ac6ff'); y += 10;
        for (let i = 0; i < kids.length && y < bottomLimit - 8; i++) {
          const k = kids[i];
          pixelText(ctx, '> ' + fitLabel(k.name, Wd - 8, 5), X, y, 5, tree.has(k.id) ? '#ffe9b0' : '#b9d2e2'); y += 8;
        }
        y += 3;
      }

      // what it needed
      if (y < bottomLimit - 18) {
        pixelText(ctx, 'REQUIRES', X, y, 6, '#8ac6ff'); y += 10;
        if (!n.req.length) { pixelText(ctx, 'nothing - it is the root of a limb', X, y, 5, '#8fa6b8'); y += 8; }
        else for (let i = 0; i < n.req.length && y < bottomLimit - 8; i++) {
          const r = SKILL_BY_ID[n.req[i]]; if (!r) continue;
          const got = tree.has(r.id);
          R(ctx, '#14141c', X, y, 7, 7);
          R(ctx, got ? '#6fd88e' : '#4a515a', X + 1, y + 1, 5, 5);
          if (got) { R(ctx, '#0d3a20', X + 2, y + 3, 1, 2); R(ctx, '#0d3a20', X + 3, y + 4, 1, 1); R(ctx, '#0d3a20', X + 4, y + 2, 1, 2); }
          pixelText(ctx, fitLabel(r.name, Wd - 12, 5) + (i < n.req.length - 1 ? (n.reqAny ? '  (or)' : '  (and)') : ''), X + 10, y, 5, got ? '#cfe6f2' : '#8fa6b8');
          y += 9;
        }
      }

      // fill dead space with a dim emblem of the upgrade itself
      const fy = c.y + c.h - 24;
      const gap = (fy - 18) - y;
      if (gap > 42) {
        const art2 = nodeArt(n), sc2 = n.weapon ? 3 : 4;
        ctx.globalAlpha = 0.13;
        ctx.drawImage(art2.c, 0, 0, art2.w, art2.h,
          Math.round(X + Wd / 2 - art2.w * sc2 / 2), Math.round(y + gap / 2 - art2.h * sc2 / 2),
          art2.w * sc2, art2.h * sc2);
        ctx.globalAlpha = 1;
      }

      // cost + action footer, pinned to the bottom of the card
      R(ctx, '#0a0e18', X, fy - 15, Wd, 14);
      box(ctx, '#2b3548', X, fy - 15, Wd, 14);
      const costKeys = Object.keys(n.cost);
      const cs = costKeys.length > 3 ? 5 : 6;
      pixelText(ctx, 'COST', X + 3, fy - 12, 6, '#9fd8ee');
      let cx = X + 27;
      for (const k of costKeys) {
        drawSprite(ctx, SP.scrap[k], cx + 4, fy - 8);
        const have = tree.scrap[k] || 0, need = n.cost[k], ok = have >= need;
        const txt = (have > 99 ? 99 : have) + '/' + need;
        pixelText(ctx, txt, cx + 9, fy - 12, cs, owned ? '#7a8c98' : ok ? '#9ff0d8' : '#ff6161');
        cx += 12 + textWidth(txt, cs) + 3;
      }
      const act = owned ? (n.weapon ? 'CLICK EQUIP - RMB SIDEARM' : 'ALREADY YOURS') :
        !avail ? 'NEEDS ' + n.req.map(r => (SKILL_BY_ID[r] || { name: '?' }).name).join(n.reqAny ? ' OR ' : ' + ') :
          afford ? 'CLICK TO BOLT IT IN' : 'NOT ENOUGH SALVAGE';
      const acol = owned ? '#ffe48f' : !avail ? '#ff6161' : afford ? '#9ff0d8' : '#ff9a3c';
      const pulse = !owned && avail && afford && Math.floor(T * 3) % 2 === 0;
      R(ctx, pulse ? '#123a30' : '#0a0e18', X, fy, Wd, 12);
      box(ctx, acol, X, fy, Wd, 12);
      pixelText(ctx, fitLabel(act, Wd - 6, 6), X + Wd / 2, fy + 2, 6, acol, 'center');
    },

    drawWeaponTable(ctx, wid, tree, X, y, Wd, limit) {
      const nw = WEAPONS[wid], cw = WEAPONS[tree.primary] || WEAPONS.revolver;
      pixelText(ctx, 'VS ' + fitLabel(cw.name.toUpperCase(), Wd - 22, 5), X, y, 6, '#ffe48f'); y += 10;
      const rows = [
        ['DPS', (cw.dmg * cw.count) / cw.rate, (nw.dmg * nw.count) / nw.rate, 0],
        ['DAMAGE', cw.dmg, nw.dmg, 0],
        ['SHOTS/S', 1 / cw.rate, 1 / nw.rate, 1],
        ['PELLETS', cw.count, nw.count, 0],
        ['PIERCE', cw.pierce || 0, nw.pierce || 0, 0],
        ['KNOCK', cw.knock, nw.knock, 0],
      ];
      for (const r of rows) {
        if (y > limit - 10) break;
        const a = r[1], b = r[2], dec = r[3];
        const fa = dec ? a.toFixed(1) : String(Math.round(a)), fb = dec ? b.toFixed(1) : String(Math.round(b));
        const col = Math.abs(a - b) < 0.05 ? '#a9c4d6' : b > a ? '#9ff0d8' : '#ff9a3c';
        pixelText(ctx, r[0], X, y, 5, '#8fa6b8');
        pixelText(ctx, fb, X + Wd, y, 6, col, 'right');
        pixelText(ctx, fa + ' >', X + Wd - textWidth(fb, 6) - 4, y, 5, '#6f8698', 'right');
        y += 9;
      }
      return y + 2;
    },

    drawCardIdle(ctx, tree, X, y, Wd, T) {
      pixelTextOutlined(ctx, 'SKILL TREE', X, y, 12, '#ffe48f', '#2a1d08'); y += 14;
      for (const l of wrapText(ctx, 'Driftwood, salvage and stubbornness. Pick a socket on a limb, hover it to weigh it up, and bolt it in. Each one you take grows the branch above it.', Wd, 6)) {
        pixelText(ctx, l, X, y, 6, '#cfe6f2'); y += 9;
      }
      y += 3;
      UIKit.divider(ctx, X, y, Wd); y += 7;

      const leg = [['owned', 'BOLTED IN', '#ffe9b0'], ['afford', 'READY - you can pay', '#9ff0d8'], ['avail', 'NEEDS MORE SALVAGE', '#d8c9a0'], ['locked', 'SEALED - grow the limb', '#8b96a2']];
      for (const l of leg) {
        blit(ctx, PLATE.mini[l[0]], X + 7, y + 5);
        pixelText(ctx, l[1], X + 16, y + 1, 6, l[2]);
        y += 13;
      }
      y += 1;
      UIKit.divider(ctx, X, y, Wd); y += 7;
      pixelText(ctx, 'WHERE SALVAGE COMES FROM', X, y, 6, '#8ac6ff'); y += 9;
      const src = { metal: 'harpooners, gunboats', wood: 'dinghies, trawlers', fuel: 'speedboats, jetskis', powder: 'skiffs, dynaboats', tech: 'netters, trawlers' };
      for (const k of SCRAP_TYPES) {
        drawSprite(ctx, SP.scrap[k], X + 4, y + 5);
        pixelText(ctx, SCRAP_NAMES[k], X + 11, y, 5, SCRAP_COLORS[k]);
        pixelText(ctx, src[k], X + 11, y + 6, 5, '#7fa0b4');
        pixelText(ctx, String(tree.scrap[k] || 0), X + Wd, y + 2, 7, SCRAP_COLORS[k], 'right');
        y += 14;
      }
      y += 1;
      UIKit.divider(ctx, X, y, Wd); y += 7;
      const st = (typeof G !== 'undefined' && G && G.stats) ? G.stats : { kills: 0, absorbs: 0, scrapCollected: 0 };
      const line = (a, b, c) => { pixelText(ctx, a, X, y, 6, '#8fa6b8'); pixelText(ctx, b, X + Wd, y - 1, 7, c || '#ffffff', 'right'); y += 10; };
      line('BOATS SUNK', String(st.kills || 0), '#ff9a3c');
      line('ABSORBS', String(st.absorbs || 0), '#8ac6ff');
      line('SALVAGE FOUND', String(st.scrapCollected || 0), '#6fd88e');
      line('UPGRADES TAKEN', tree.unlocked.size + '/' + SKILL_NODES.length, '#ffe48f');
    },

    // ------------------------------------------------------------- bottom
    drawBottom(ctx, tree, T) {
      if (!tree) return;
      if (!this._botCan) { this._botCan = can(640, 60); this._botCtx = this._botCan.getContext('2d'); }
      const m = Input.mouse;
      let hovSlot = -1;
      for (let i = 0; i < WEAPON_ORDER.length; i++) if (hit(m, 8 + i * 31, 314, 26, 26)) hovSlot = i;
      const fl = Object.keys(this.flash).sort().map(k => k + (this.flash[k] > 0.5 ? 1 : 0)).join(',');
      const key = tree.primary + '|' + tree.sidearm + '|' + tree.unlocked.size + '|' + hovSlot + '|' + this.slotMode
        + '|' + (hit(m, 226, 314, 72, 26) ? 1 : 0) + '|' + fl + '|' + (this.hoverW || '-');
      if (key !== this._botKey) {
        this._botKey = key;
        const q = this._botCtx;
        q.clearRect(0, 0, 640, 60);
        q.save(); q.translate(0, -300);
        this.paintBottom(q, tree, T);
        q.restore();
      }
      ctx.drawImage(this._botCan, 0, 300);
    },

    paintBottom(ctx, tree, T) {
      const m = Input.mouse;
      // ---- loadout ----
      pixelText(ctx, 'LOADOUT', 8, 305, 7, '#ffe48f');
      const unlocked = tree.weaponsUnlocked();
      for (let i = 0; i < WEAPON_ORDER.length; i++) {
        const w = WEAPON_ORDER[i], sx = 8 + i * 31, sy = 314;
        const has = unlocked.indexOf(w) >= 0;
        const hv = hit(m, sx, sy, 26, 26);
        const prim = tree.primary === w, side = tree.sidearm === w;
        UIKit.slot(ctx, sx, sy, 26, !has ? 'locked' : hv ? 'hover' : (prim || side) ? 'owned' : 'available');
        const g = SP.guns[w];
        ctx.globalAlpha = has ? 1 : 0.35;
        ctx.drawImage(g.c, Math.round(sx + 13 - g.w / 2), Math.round(sy + 13 - g.h / 2));
        ctx.globalAlpha = 1;
        if (prim || side) {
          R(ctx, '#14141c', sx + 17, sy + 17, 9, 9);
          R(ctx, prim ? '#2f9e5b' : '#3f7fd6', sx + 18, sy + 18, 7, 7);
          pixelText(ctx, prim ? 'P' : 'S', sx + 21, sy + 19, 5, '#ffffff', 'center', false);
        }
      }
      const shown = this.hoverW || tree.primary;
      pixelText(ctx, WEAPONS[shown].name.toUpperCase(), 8, 343, 6, this.hoverW ? '#ffffff' : '#9fd8ee');
      const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
      const canSide = tree.stats().sidearm;
      const sub = this.hoverW && unlocked.indexOf(this.hoverW) < 0 ? 'locked - unlock it in the tree'
        : !canSide ? (touch ? 'tap to carry it' : 'click to carry it - Sidearm Slot lets you hold two')
          : this.slotMode === 'sidearm' ? 'tap a gun to make it the SIDEARM'
            : (touch ? 'tap a gun to carry it' : 'click to carry   right-click for sidearm');
      pixelText(ctx, fitLabel(sub, 214, 5), 8, 351, 5, this.slotMode === 'sidearm' ? '#8ac6ff' : '#7fa0b4');
      if (canSide) {
        const side = this.slotMode === 'sidearm';
        const hv = hit(m, 226, 314, 72, 26);
        UIKit.button(ctx, 226, 314, 72, 26, null, side || hv ? 'hover' : 'normal');
        pixelText(ctx, 'ASSIGN', 262, 318, 5, side ? '#fff6d2' : '#d8c9a0', 'center');
        pixelText(ctx, side ? 'SIDEARM' : 'PRIMARY', 262, 326, 6, side ? '#8ac6ff' : '#6fd88e', 'center');
      }

      // divider
      R(ctx, '#0a0e18', 306, 306, 1, 48); R(ctx, '#2b3548', 307, 306, 1, 48);

      // ---- build summary ----
      const s = this.summary || this.buildSummary(tree);
      pixelText(ctx, 'BUILD', 316, 305, 7, '#ffe48f');
      const chips = [
        ['maxHp', 'MAX HP', String(Math.round(s.maxHp)), 'hp'],
        ['dmg', 'DAMAGE', 'x' + s.dmg.toFixed(2), 'dmg'],
        ['fireRate', 'FIRE RATE', 'x' + s.fireRate.toFixed(2), 'rate'],
        ['speed', 'SWIM', 'x' + s.speed.toFixed(2), 'fin'],
        ['rollCharges', 'ROLLS', String(s.rollCharges), 'roll'],
        ['armor', 'ARMOUR', Math.round(s.armor * 100) + '%', 'armor'],
      ];
      for (let i = 0; i < chips.length; i++) {
        const c = chips[i], cx = 316 + (i % 3) * 106, cy = 314 + Math.floor(i / 3) * 16;
        const fl = this.flash[c[0]] || 0;
        R(ctx, fl > 0 ? '#3b3214' : '#0a0e18', cx, cy, 102, 14);
        box(ctx, fl > 0 ? '#ffe48f' : '#22314a', cx, cy, 102, 14);
        const ic = ICON[c[3]];
        if (ic) { ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(ic.c, cx + 1, cy - 1); ctx.restore(); }
        pixelText(ctx, c[1], cx + 18, cy + 2, 5, '#8fa6b8');
        pixelText(ctx, c[2], cx + 99, cy + 3, 7, fl > 0 ? '#ffffff' : '#e6f2ff', 'right');
      }
      // per-branch tally
      for (let i = 0; i < 4; i++) {
        const b = BRANCHES[i], nodes = this.branchNodes(i);
        const have = nodes.filter(n => tree.has(n.id)).length;
        const bx = 316 + i * 80, by = 347;
        R(ctx, b.color, bx, by + 1, 4, 4); box(ctx, '#14141c', bx, by + 1, 4, 4);
        pixelText(ctx, b.name, bx + 7, by, 5, b.color);
        pixelText(ctx, have + '/' + nodes.length, bx + 7 + textWidth(b.name, 5) + 4, by, 5, '#c2d6e4');
      }
    },
  };

  function ring(ctx, cx, cy, r, col) {
    ctx.fillStyle = col;
    const steps = Math.max(12, Math.round(r * 4));
    for (let i = 0; i < steps; i++) {
      const a = i / steps * TAU;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }

  // ===========================================================================
  //  MAIN MENU
  // ===========================================================================
  const MainMenu = {
    ready: false, action: null, sel: 0, T: 0, hasRun: null, hero: { x: 320, y: 214 },
    buttons: [], fish: [],

    init() {
      if (this.ready) return; this.ready = true;
      buildIcons();
      Deep.build();
      buildPlates();
      const rng = new SeededRandom(7788);
      for (let i = 0; i < 14; i++) this.fish.push({
        x: rng.range(0, 640), y: rng.range(120, 300), s: rng.range(10, 26) * (rng.next() > 0.5 ? 1 : -1),
        ph: rng.range(0, TAU), len: rng.int(3, 6), col: rng.next() > 0.6 ? '#7fb8cf' : '#4f8fa8',
      });
    },
    consume() { this.action = null; },

    runInProgress() {
      if (this.hasRun !== null && this.hasRun !== undefined) return !!this.hasRun;
      if (typeof G === 'undefined' || !G) return false;
      if (!G.player || G.player.dead) return false;
      if (G.director && G.director.started) return true;
      return (G.stats && G.stats.kills > 0) || (G.time || 0) > 3;
    },

    items() {
      const list = [{ id: 'play', label: this.runInProgress() ? 'NEW RUN' : 'PLAY' }];
      if (this.runInProgress()) list.splice(0, 0, { id: 'continue', label: 'CONTINUE' });
      list.push({ id: 'deep', label: 'SKILL TREE' });
      list.push({ id: 'controls', label: 'CONTROLS' });
      list.push({ id: 'mute', label: (typeof Audio_ !== 'undefined' && Audio_.muted) ? 'SOUND: OFF' : 'SOUND: ON' });
      return list;
    },

    update(dt, t) {
      this.init();
      this.T += dt;
      Deep.update(dt, this.T);
      for (const f of this.fish) { f.x += f.s * dt; f.ph += dt * 3; if (f.x < -20) f.x = 660; if (f.x > 660) f.x = -20; }

      const items = this.items(), m = Input.mouse;
      const BX = 46, BW = 190, BH = 26, GAP = 6;
      const BY = 186 - Math.round(items.length * (BH + GAP) / 2);
      this.buttons = items.map((it, i) => ({ id: it.id, label: it.label, x: BX, y: BY + i * (BH + GAP), w: BW, h: BH }));

      if (Input.hit && (Input.hit('ArrowDown') || Input.hit('KeyS'))) { this.sel = (this.sel + 1) % items.length; Audio_.tone(480, 0.05, 'square', 0.08); }
      if (Input.hit && (Input.hit('ArrowUp') || Input.hit('KeyW'))) { this.sel = (this.sel + items.length - 1) % items.length; Audio_.tone(480, 0.05, 'square', 0.08); }
      this.sel = clamp(this.sel, 0, items.length - 1);

      let hovered = -1;
      for (let i = 0; i < this.buttons.length; i++) {
        const b = this.buttons[i];
        if (hit(m, b.x, b.y, b.w, b.h)) { hovered = i; }
      }
      if (hovered >= 0) this.sel = hovered;
      if (hovered >= 0 && m.clicked) this.fire(this.buttons[hovered].id);
      if (Input.hit && (Input.hit('Enter') || Input.hit('NumpadEnter') || Input.hit('Space'))) this.fire(this.buttons[this.sel].id);
    },

    fire(id) {
      this.action = id;
      if (id === 'mute') { Audio_.muted = !Audio_.muted; Audio_.tone(300, 0.07, 'square', 0.12); }
      else Audio_.buy();
    },

    render(ctx, t) {
      this.init();
      const T = this.T;
      Deep.render(ctx, { wreckX: 430 });

      // little fish schooling past
      for (const f of this.fish) {
        const d = f.s > 0 ? 1 : -1;
        const y = Math.round(f.y + Math.sin(f.ph) * 2);
        R(ctx, f.col, Math.round(f.x), y, f.len, 2);
        R(ctx, f.col, Math.round(f.x - d * 2), y - 1 + (Math.floor(f.ph * 2) & 1), 2, 1);
        R(ctx, '#14141c', Math.round(f.x + d * (f.len - 1)), y, 1, 1);
      }

      // ---- the hero: war manatee + armed otter, bobbing in the current ----
      if (typeof CH !== 'undefined' && CH.manatee && typeof Rig !== 'undefined') {
        const hx = 312 + Math.sin(T * 0.4) * 9, hy = 238 + Math.sin(T * 0.8) * 4;
        ctx.save();
        ctx.translate(Math.round(hx), Math.round(hy));
        ctx.scale(2, 2);
        Rig.draw(ctx, 0, 0, {
          t: T, aim: -0.35 + Math.sin(T * 0.5) * 0.25, facing: 1, tilt: Math.sin(T * 0.6) * 0.06,
          swimPhase: T * 2.2, rollPhase: null, hurt: false, exp: 'angry', rage: false,
          recoil: 0, flash: 0, speed: 40, armored: true, gunSprite: SP.guns[(typeof G !== 'undefined' && G && G.tree) ? G.tree.primary : 'revolver'],
        });
        ctx.restore();
        // wake bubbles behind him
        if (Math.random() < 0.4) Deep.rise.push({ x: hx - 74, y: hy + 6, r: randi(0, 3), s: rand(20, 46), ph: rand(0, TAU), w: rand(3, 8) });
        if (Deep.rise.length > 110) Deep.rise.splice(0, Deep.rise.length - 110);
      }

      // ---- title ----
      R(ctx, 'rgba(4,12,22,0.55)', 0, 18, 640, 66);
      R(ctx, 'rgba(127,212,238,0.35)', 0, 18, 640, 1);
      R(ctx, 'rgba(127,212,238,0.35)', 0, 83, 640, 1);
      const title = 'MANATEE VS BOATS';
      const ts = fitSize(title, 600, [30, 24, 20, 18]);
      pixelTextOutlined(ctx, title, 321, 28, ts, '#6b4a06', '#14141c', 'center');
      pixelTextOutlined(ctx, title, 320, 26, ts, '#ffe48f', '#2a1d08', 'center');
      UIKit.divider(ctx, 150, 60, 340);
      pixelTextOutlined(ctx, 'A DROWNED MOTHER. AN ARMED OTTER. ONE VERY BAD DAY FOR THE FISHING FLEET.',
        320, 68, 6, '#cfe6f2', '#06121d', 'center');

      // ---- buttons ----
      const m = Input.mouse;
      for (let i = 0; i < this.buttons.length; i++) {
        const b = this.buttons[i];
        const hv = hit(m, b.x, b.y, b.w, b.h) || this.sel === i;
        UIKit.button(ctx, b.x, b.y, b.w, b.h, b.label, hv ? 'hover' : 'normal');
        if (this.sel === i) {
          const o = Math.round(Math.sin(T * 6) * 1);
          R(ctx, '#ffe48f', b.x - 9 + o, b.y + 9, 5, 2);
          R(ctx, '#ffe48f', b.x - 6 + o, b.y + 7, 2, 6);
          R(ctx, '#fff6d2', b.x - 5 + o, b.y + 9, 2, 2);
        }
        if (b.id === 'mute') {
          const on = !(typeof Audio_ !== 'undefined' && Audio_.muted);
          R(ctx, '#14141c', b.x + b.w - 18, b.y + 8, 10, 10);
          R(ctx, on ? '#6fd88e' : '#c8302e', b.x + b.w - 17, b.y + 9, 8, 8);
        }
      }
      pixelTextOutlined(ctx, 'ARROWS + ENTER, OR JUST CLICK', 141, 320, 6, '#9fd8ee', '#06121d', 'center');

      // ---- run panel ----
      this.drawRunPanel(ctx, T);

      Deep.renderForeground(ctx);

      if (typeof Audio_ !== 'undefined' && Audio_.muted) pixelTextOutlined(ctx, 'MUTED', 634, 348, 6, '#8ea6bc', '#06121d', 'right');
    },

    drawRunPanel(ctx, T) {
      const x = 408, y = 106, w = 218, h = 156;
      UIKit.panel(ctx, x, y, w, h, 'gold');
      const X = x + 10; let Y = y + 10;
      const running = this.runInProgress();
      pixelTextOutlined(ctx, running ? 'THE RUN SO FAR' : 'THE HUNT', X, Y, 9, '#ffe48f', '#2a1d08'); Y += 13;
      UIKit.divider(ctx, X, Y, w - 20); Y += 8;

      const tree = (typeof G !== 'undefined' && G && G.tree) ? G.tree : null;
      const st = (typeof G !== 'undefined' && G && G.stats) ? G.stats : null;
      const line = (a, b, col) => { pixelText(ctx, a, X, Y, 6, '#9ab4c6'); pixelText(ctx, b, X + w - 20, Y, 7, col || '#ffffff', 'right'); Y += 10; };
      if (running && st) {
        line('TIME', typeof fmtTime === 'function' && G.director ? fmtTime(G.director.time) : '-');
        line('BOATS SUNK', String(st.kills || 0), '#ff9a3c');
        line('ABSORBS', String(st.absorbs || 0), '#8ac6ff');
        line('SALVAGE', String(st.scrapCollected || 0), '#6fd88e');
      } else {
        for (const l of wrapText(ctx, 'A manatee with a gun-toting otter on her back against an entire fishing village. Salvage the wrecks, spend it in the SKILL TREE.', w - 20, 6)) {
          pixelText(ctx, l, X, Y, 6, '#cfe6f2'); Y += 9;
        }
        Y += 2;
      }
      if (tree) {
        line('UPGRADES', tree.unlocked.size + '/' + SKILL_NODES.length, '#ffe48f');
        Y += 1;
        UIKit.divider(ctx, X, Y, w - 20); Y += 7;
        pixelText(ctx, 'SALVAGE', X, Y, 5, '#9ab4c6'); Y += 8;
        SCRAP_TYPES.forEach((k, i) => {
          const sx = X + i * 39;
          R(ctx, '#0a0e18', sx, Y, 36, 16); box(ctx, '#2b3548', sx, Y, 36, 16);
          drawSprite(ctx, SP.scrap[k], sx + 8, Y + 8);
          pixelText(ctx, String(tree.scrap[k] || 0), sx + 33, Y + 4, 6, SCRAP_COLORS[k], 'right');
        });
        Y += 20;
        const wp = WEAPONS[tree.primary] || WEAPONS.revolver, gs = SP.guns[tree.primary];
        pixelText(ctx, 'WEAPON', X, Y + 2, 5, '#9ab4c6');
        ctx.drawImage(gs.c, X + 34, Y + 1);
        pixelText(ctx, fitLabel(wp.name, w - 56 - gs.w, 6), X + 38 + gs.w, Y + 1, 6, '#ffffff');
        if (tree.sidearm) {
          const ss = SP.guns[tree.sidearm];
          pixelText(ctx, '+', X + 26, Y + 11, 5, '#ffe48f');
          ctx.drawImage(ss.c, X + 34, Y + 11);
          pixelText(ctx, fitLabel(WEAPONS[tree.sidearm].name, w - 56 - ss.w, 5), X + 38 + ss.w, Y + 11, 5, '#ffe48f');
        }
      }
    },
  };

  global.Upgrades = Upgrades;
  global.MainMenu = MainMenu;
  global.DeepScene2 = Deep;   // exposed for debugging / harnesses only
  global.WorkshopScene = Shop;
})(typeof window !== 'undefined' ? window : this);
