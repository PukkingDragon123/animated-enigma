// ===========================================================================
//  upgrades.js — the SKILL TREE (the upgrade screen) and the MAIN MENU
// ---------------------------------------------------------------------------
//  The otter is sinking. He is out of air. Every upgrade is a bubble of air
//  hanging in the water above him, and buying one is him lunging out, tearing
//  it open and gasping. This file draws that, and the whole ornate UI around
//  it, at 640x360, in hard-edged pixel art (integer coords, posterised
//  colours, no gradients, no blur, no external images).
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
  //  THE WATER — the living underwater backdrop, shared by both screens
  // ===========================================================================
  const KELP_Y = 160, KELP_H = 200;      // the band of water the kelp lives in
  const Deep = {
    built: false, t: 0,
    bg: null, rays: [], whale: null, whaleTail: null, wreck: null, bub: [], fgBub: [],
    motes: [], drift: [], kelp: [], rise: [], big: [],
    kelpCan: [null, null], kelpCtx: [null, null], kelpAt: [-99, -99],
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
      ctx.drawImage(this.kelpLayer(true, T), 0, KELP_Y);
      // the wreck on the seabed
      ctx.globalAlpha = 0.95;
      blit(ctx, this.wreck, (opt && opt.wreckX) || 232, 340);
      ctx.globalAlpha = 1;
      // near kelp
      ctx.drawImage(this.kelpLayer(false, T), 0, KELP_Y);

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

    // 550-odd kelp segments is too many little rects to lay down every frame,
    // and the fronds sway slowly, so each layer is rasterised to a strip about
    // 22 times a second and blitted in between. 'source-over' is associative,
    // so stacking the translucent segments in the strip looks the same as
    // stacking them straight onto the water.
    kelpLayer(far, T) {
      const i = far ? 0 : 1;
      if (!this.kelpCan[i]) {
        this.kelpCan[i] = can(640, KELP_H);
        this.kelpCtx[i] = this.kelpCan[i].getContext('2d');
        this.kelpAt[i] = -99;
      }
      if (T - this.kelpAt[i] >= 0.5) {
        this.kelpAt[i] = T;
        const q = this.kelpCtx[i];
        q.clearRect(0, 0, 640, KELP_H);
        q.save(); q.translate(0, -KELP_Y);
        this.drawKelp(q, T, far);
        q.restore();
      }
      return this.kelpCan[i];
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
  //  THE OTTER — sinking, clawing, out of air
  // ===========================================================================
  const Otter = {
    x: 76, y: 150, vy: 8, breath: 0.62, relief: 0, gasp: 0, lunge: null,
    buf: null, bufCtx: null, bubbles: [], t: 0, scale: 2.8,

    build() {
      if (this.buf) return;
      this.buf = can(140, 140);
      this.bufCtx = this.buf.getContext('2d');
    },
    reset(x, y) {
      this.build();
      this.x = x; this.y = y; this.vy = 6; this.relief = 0; this.gasp = 0; this.lunge = null;
      this.bubbles.length = 0;
    },
    feed(tx, ty) {
      this.lunge = { x: tx, y: ty, t: 0, dur: 0.95 };
      this.breath = Math.min(1, this.breath + 0.3);
      this.relief = 1.6; this.gasp = 0.5;
    },
    update(dt, bounds) {
      this.build();
      this.t += dt;
      const t = this.t;
      this.breath = Math.max(0, this.breath - dt * 0.028);
      this.relief = Math.max(0, this.relief - dt);
      this.gasp = Math.max(0, this.gasp - dt);
      // he sinks, and kicks weakly back up now and then
      const panic = 1 - this.breath;
      this.vy += (5 + panic * 9) * dt;
      if (Math.sin(t * (1.2 + panic)) > 0.97) this.vy -= 22;
      this.y += this.vy * dt;
      this.vy *= 0.985;
      if (this.relief > 0) this.y -= dt * 26 * this.relief;
      const b = bounds || { y0: 70, y1: 250 };
      if (this.y > b.y1) { this.y = b.y1; this.vy = -16; }
      if (this.y < b.y0) { this.y = b.y0; this.vy = 2; }
      if (this.lunge) { this.lunge.t += dt; if (this.lunge.t > this.lunge.dur) this.lunge = null; }
      // air escaping his lungs
      if (Math.random() < 0.22 + panic * 0.3) this.bubbles.push({
        x: this.x + rand(10, 18), y: this.y - 22, r: randi(0, 3),
        vx: rand(16, 44), vy: rand(-58, -30), life: rand(1.2, 2.4), max: 2.4,
      });
      if (this.gasp > 0.3) for (let i = 0; i < 2; i++) this.bubbles.push({
        x: this.x + rand(10, 20), y: this.y - 22, r: randi(2, 4), vx: rand(20, 60), vy: rand(-96, -46), life: rand(0.6, 1.4), max: 1.4,
      });
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const p = this.bubbles[i]; p.life -= dt;
        if (p.life <= 0) { this.bubbles.splice(i, 1); continue; }
        p.x += p.vx * dt + Math.sin(p.life * 6) * 10 * dt; p.y += p.vy * dt; p.vy *= 0.99;
      }
      if (this.bubbles.length > 90) this.bubbles.splice(0, this.bubbles.length - 90);
    },

    // a bent two-bone limb: upper arm, forearm, then a clutching paw
    limb(bx, sx, sy, a1, a2) {
      bx.save(); bx.translate(sx, sy); bx.rotate(a1);
      bx.drawImage(CH.otterArm.c, -CH.otterArm.ax, -CH.otterArm.ay);
      bx.translate(8, 0); bx.rotate(a2);
      bx.drawImage(CH.otterArm.c, -CH.otterArm.ax, -CH.otterArm.ay);
      bx.translate(10, 0);
      bx.fillStyle = '#1a1220'; bx.fillRect(-2, -3, 5, 6);
      bx.fillStyle = '#c8703c'; bx.fillRect(-1, -2, 3, 4);
      bx.fillStyle = '#f0b87e'; bx.fillRect(-1, -2, 2, 2);
      bx.fillStyle = '#1a1220'; bx.fillRect(3, -3, 1, 2); bx.fillRect(3, 0, 1, 2);
      bx.restore();
    },

    draw(ctx, sc) {
      this.build();
      if (typeof CH === 'undefined' || !CH.otterTorso) return;
      const t = this.t, panic = clamp(1 - this.breath, 0, 1);
      const S = sc || this.scale;
      const bx = this.bufCtx, BW = this.buf.width, BH = this.buf.height;
      bx.clearRect(0, 0, BW, BH);
      bx.save();
      bx.translate(BW / 2, BH / 2 + 4);
      bx.scale(S, S);

      // he hangs limp and tipped back; a lunge whips him toward the bubble
      let lean = -0.32 + Math.sin(t * 0.62) * 0.26;
      let reach = 0;
      if (this.lunge) {
        const k = this.lunge.t / this.lunge.dur;
        reach = k < 0.4 ? k / 0.4 : Math.max(0, 1 - (k - 0.4) / 0.6);
        lean = lerp(lean, 0.22, reach);
      }
      bx.rotate(lean);

      // chest heaving: a slow, desperate pump
      const heave = 1 + Math.sin(t * (2.4 + panic * 2.4)) * (0.06 + panic * 0.06);
      const fast = t * (3.4 + panic * 3.4);

      // tail hanging and thrashing below him
      bx.save(); bx.translate(-6, 8);
      bx.rotate(2.35 + Math.sin(fast * 0.75) * (0.3 + panic * 0.36));
      bx.drawImage(CH.otterTail.c, -CH.otterTail.ax, -CH.otterTail.ay);
      bx.restore();

      // far arm, clawing at water that will not hold him
      this.limb(bx, 8, -4, -0.42 + Math.sin(fast + 1.1) * (0.3 + panic * 0.24), -0.88 + Math.sin(fast * 1.3) * 0.36);

      // torso
      bx.save(); bx.scale(1, heave);
      bx.drawImage(CH.otterTorso.c, -CH.otterTorso.ax, -CH.otterTorso.ay);
      bx.restore();

      // near arm — the one that grabs (hidden while the real reach is drawn)
      if (reach < 0.15) this.limb(bx, -8, -4, -2.72 + Math.sin(fast * 0.9) * (0.3 + panic * 0.24), 0.9 + Math.sin(fast * 1.15) * 0.36);

      // head, screwed up in pain — or gasping with relief
      bx.save();
      bx.translate(1, -11 + Math.sin(t * 2.2) * 0.7);
      bx.rotate(Math.sin(t * 1.35) * 0.2 - 0.2 + reach * 0.3);
      const exp = this.gasp > 0 ? 'surprised' : this.relief > 0.5 ? 'happy' : 'drown';
      const head = otterHeadWithFace(exp, false, t, false);
      bx.drawImage(head, -CH.otterHead.ax, -CH.otterHead.ay);
      bx.restore();
      bx.restore();

      // the water leaches the colour out of him as he runs out of air
      const cold = clamp(panic * 0.55 - this.relief * 0.3, 0, 0.6);
      if (cold > 0.02) {
        bx.globalCompositeOperation = 'source-atop';
        bx.fillStyle = `rgba(40,96,150,${cold.toFixed(2)})`;
        bx.fillRect(0, 0, BW, BH);
        bx.globalCompositeOperation = 'source-over';
      }
      if (this.relief > 0.6) {
        bx.globalCompositeOperation = 'source-atop';
        bx.fillStyle = `rgba(255,232,170,${((this.relief - 0.6) * 0.4).toFixed(2)})`;
        bx.fillRect(0, 0, BW, BH);
        bx.globalCompositeOperation = 'source-over';
      }

      ctx.drawImage(this.buf, Math.round(this.x - BW / 2), Math.round(this.y - BH / 2));

      // escaping air
      for (const p of this.bubbles) {
        const a = Math.min(1, p.life / p.max * 1.7);
        ctx.globalAlpha = a;
        blit(ctx, Deep.bub[Math.min(Deep.bub.length - 1, p.r)], p.x, p.y);
        ctx.globalAlpha = 1;
      }
    },

    // the arm shooting out to seize a bubble, drawn over the board
    drawGrab(ctx) {
      if (!this.lunge) return;
      const g = this.lunge, k = g.t / g.dur;
      const out = k < 0.4 ? k / 0.4 : 1, back = k > 0.55 ? (k - 0.55) / 0.45 : 0;
      const ox = this.x - 4, oy = this.y - 14;
      const p = (1 - back) * out;
      const hx = Math.round(lerp(ox, g.x, p)), hy = Math.round(lerp(oy, g.y, p));
      const a = angleTo(ox, oy, g.x, g.y);
      const nx = -Math.sin(a), ny = Math.cos(a);
      const alpha = (1 - back * 0.7).toFixed(2);
      ctx.globalAlpha = alpha;
      const segs = Math.max(2, Math.round(dist(ox, oy, hx, hy) / 2));
      for (let i = 0; i <= segs; i++) {
        const f = i / segs;
        const wob = Math.sin(f * 3 + this.t * 8) * 1.4 * (1 - f);
        const px2 = Math.round(lerp(ox, hx, f) + nx * wob), py2 = Math.round(lerp(oy, hy, f) + ny * wob);
        const w = 5 - Math.round(f * 2);
        R(ctx, '#1a1220', px2 - Math.round(w / 2) - 1, py2 - Math.round(w / 2) - 1, w + 2, w + 2);
        R(ctx, '#9c4d24', px2 - Math.round(w / 2), py2 - Math.round(w / 2), w, w);
        R(ctx, '#e0975c', px2 - Math.round(w / 2), py2 - Math.round(w / 2), Math.max(1, w - 2), 1);
      }
      // the paw
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
      const grip = k > 0.4 ? 1 : 0;
      R(ctx, '#1a1220', -5, -6, 11, 12);
      R(ctx, '#c8703c', -4, -5, 9, 10);
      R(ctx, '#f0b87e', -4, -5, 4, 10);
      R(ctx, '#1a1220', 5, -5 + grip * 2, 3, 3);
      R(ctx, '#e0975c', 5, -4 + grip * 2, 3, 2);
      R(ctx, '#1a1220', 5, 2 - grip * 2, 3, 3);
      R(ctx, '#e0975c', 5, 3 - grip * 2, 3, 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  };

  // ===========================================================================
  //  NODE BUBBLES — prerendered, four states, four wobble frames each
  // ===========================================================================
  const NODE_R = 17;
  const BUB = { locked: [], avail: [], afford: [], owned: [], hover: null, chain: null };

  function buildNodeBubbles() {
    const wob = [[0, 0], [1, -1], [0, 0], [-1, 1]];
    const skin = {
      locked: { rim: '#2b4257', body: 'rgba(24,42,60,0.95)', core: 'rgba(11,23,36,0.9)', hi: 'rgba(90,125,155,0.5)', crest: 'rgba(40,64,86,0.9)', ref: 'rgba(96,136,168,0.45)' },
      avail: { rim: '#9fe0f5', body: 'rgba(52,122,160,0.72)', core: 'rgba(17,50,76,0.62)', hi: 'rgba(235,252,255,0.95)', crest: 'rgba(130,200,230,0.7)', ref: 'rgba(200,245,255,0.55)' },
      afford: { rim: '#c9fff0', body: 'rgba(70,168,175,0.78)', core: 'rgba(19,70,80,0.6)', hi: 'rgba(255,255,255,1)', crest: 'rgba(170,240,230,0.8)', ref: 'rgba(225,255,248,0.65)' },
      owned: { rim: '#ffe48f', body: 'rgba(186,134,38,0.9)', core: 'rgba(58,38,6,0.86)', hi: 'rgba(255,255,255,1)', crest: 'rgba(255,214,120,0.9)', ref: 'rgba(255,240,190,0.7)' },
    };
    BUB.mini = {};
    for (const key in skin) {
      for (let f = 0; f < 4; f++) {
        const rx = NODE_R + wob[f][0], ry = NODE_R + wob[f][1];
        BUB[key].push(bubbleSprite(rx, ry, skin[key], key === 'locked'));
      }
      BUB.mini[key] = bubbleSprite(5, 5, skin[key], false);
    }
    // hover halo
    const hr = NODE_R + 4, hc = can(hr * 2 + 3, hr * 2 + 3), hx = hc.getContext('2d');
    for (let a = 0; a < 200; a++) {
      const an = a / 200 * TAU;
      hx.fillStyle = a % 10 < 6 ? 'rgba(255,255,255,0.95)' : 'rgba(255,238,180,0.8)';
      hx.fillRect(Math.round(hr + 1 + Math.cos(an) * hr), Math.round(hr + 1 + Math.sin(an) * hr), 1, 1);
    }
    BUB.hover = spr(hc, hr + 1, hr + 1);
    // prerequisite-chain halo
    const cr = NODE_R + 2, cc = can(cr * 2 + 3, cr * 2 + 3), cx2 = cc.getContext('2d');
    for (let a = 0; a < 180; a++) {
      const an = a / 180 * TAU;
      if (a % 8 > 4) continue;
      cx2.fillStyle = 'rgba(255,214,120,0.9)';
      cx2.fillRect(Math.round(cr + 1 + Math.cos(an) * cr), Math.round(cr + 1 + Math.sin(an) * cr), 1, 1);
    }
    BUB.chain = spr(cc, cr + 1, cr + 1);
  }

  function bubbleSprite(rx, ry, sk, chained) {
    const D = Math.max(rx, ry) * 2 + 3, c = can(D, D), x = c.getContext('2d');
    const cx = (D >> 1), cy = (D >> 1);
    for (let yy = -ry - 1; yy <= ry + 1; yy++) for (let xx = -rx - 1; xx <= rx + 1; xx++) {
      const d = Math.sqrt((xx / rx) * (xx / rx) + (yy / ry) * (yy / ry));
      if (d > 1.02) continue;
      if (d > 0.94) x.fillStyle = sk.rim;
      else if (d > 0.80) x.fillStyle = (xx + yy > rx * 0.3) ? sk.crest : sk.body;
      else x.fillStyle = sk.core;
      x.fillRect(cx + xx, cy + yy, 1, 1);
    }
    // refractive highlights: big upper-left specular, small companion, lower crescent
    x.fillStyle = sk.hi;
    x.fillRect(cx - Math.round(rx * 0.58), cy - Math.round(ry * 0.56), 4, 3);
    x.fillRect(cx - Math.round(rx * 0.62), cy - Math.round(ry * 0.34), 2, 3);
    x.fillRect(cx - Math.round(rx * 0.26), cy - Math.round(ry * 0.72), 3, 2);
    x.fillStyle = sk.crest;
    for (let a = 30; a < 78; a++) {
      const an = a / 100 * TAU;
      x.fillRect(Math.round(cx + Math.cos(an) * rx * 0.86), Math.round(cy + Math.sin(an) * ry * 0.86), 1, 1);
    }
    // light refracting through the far wall: a bright arc low and right
    x.fillStyle = sk.ref;
    for (let a = 8; a < 34; a++) {
      const an = a / 100 * TAU;
      x.fillRect(Math.round(cx + Math.cos(an) * rx * 0.70), Math.round(cy + Math.sin(an) * ry * 0.70), 1, 1);
    }
    if (chained) {                                    // a locked bubble is chained shut
      x.fillStyle = '#4b5762';
      for (let i = -rx; i <= rx; i += 5) {
        const yy = Math.round(i * 0.72);
        if (Math.abs(i) > rx * 0.92) continue;
        x.fillRect(cx + i - 2, cy + yy - 1, 5, 3);
        x.fillStyle = '#2b333c'; x.fillRect(cx + i - 1, cy + yy, 3, 1); x.fillStyle = '#4b5762';
      }
      x.fillStyle = '#6b7883'; x.fillRect(cx - 4, cy - 2, 8, 2);
    }
    return spr(c, cx, cy);
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
  //  UPGRADES — the SKILL TREE
  // ===========================================================================
  const LAY = {
    headH: 32,
    stage: { x: 4, y: 34, w: 146, h: 264 },
    tabs: { x: 152, y: 34, w: 286, h: 20 },
    board: { x: 152, y: 54, w: 286, h: 244 },
    card: { x: 442, y: 34, w: 196, h: 264 },
    bottom: { y: 300, h: 60 },
  };
  const COL_X = [200, 295, 390];
  const ROW_Y0 = 32, ROW_PITCH = 48;

  const Upgrades = {
    ready: false, wantsClose: false, tab: 0, scroll: 0, scrollTo: 0, hover: null, hoverW: null, sel: null,
    T: 0, drag: null, affordOnly: false, chrome: null, labels: [], bursts: [], slotMode: 'primary',
    flash: {}, summary: null, effectCache: { id: null, rows: null }, lastCount: -1, glow: 0, titleSize: 0,

    init() {
      if (this.ready) return; this.ready = true;
      buildIcons();
      Deep.build();
      buildNodeBubbles();
      this.buildChrome();
      Otter.build();
    },

    buildChrome() {
      const c = can(640, 360), x = c.getContext('2d');
      UIKit.panel(x, -10, -12, 660, 44, 'dark');          // header bar
      UIKit.panel(x, LAY.card.x, LAY.card.y, LAY.card.w, LAY.card.h, 'gold');
      UIKit.panel(x, -10, LAY.bottom.y, 660, 72, 'dark'); // bottom bar
      UIKit.divider(x, 318, 330, 4);                       // (decorative, centre)
      this.chrome = c;
    },

    open() {
      this.init();
      this.wantsClose = false;
      this.scroll = this.scrollTo = 0;
      this.hover = null; this.hoverW = null; this.drag = null; this.sel = null;
      this.labels.length = 0; this.bursts.length = 0;
      this.flash = {};
      this.lastCount = -1;
      this.slotMode = 'primary';
      this._cardKey = null; this._botKey = null;
      Otter.reset(LAY.stage.x + LAY.stage.w / 2 + 2, LAY.stage.y + 116);
      Otter.breath = clamp(Otter.breath, 0.28, 1);
    },

    tree() { return (typeof G !== 'undefined' && G && G.tree) ? G.tree : null; },

    branchNodes(i) {
      const id = BRANCHES[i].id;
      return SKILL_NODES.filter(n => n.branch === id);
    },
    rowsIn(i) {
      let m = 0; for (const n of this.branchNodes(i)) m = Math.max(m, n.pos[1]);
      return m + 1;
    },
    contentH(i) { return ROW_Y0 + this.rowsIn(i) * ROW_PITCH + 6; },
    maxScroll(i) { return Math.max(0, this.contentH(i) - LAY.board.h); },

    nodePos(n, t) {
      const ph = n.pos[0] * 1.9 + n.pos[1] * 1.1 + n.branch.length * 0.7;
      const bx = COL_X[n.pos[0]] + Math.round(Math.sin(t * 0.8 + ph) * 2);
      const by = LAY.board.y + ROW_Y0 + n.pos[1] * ROW_PITCH - this.scroll + Math.round(Math.cos(t * 1.05 + ph) * 2);
      return { x: bx, y: by, ph: ph };
    },

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
      Deep.update(dt, T);
      Otter.update(dt, { y0: LAY.stage.y + 80, y1: LAY.stage.y + LAY.stage.h - 104 });
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

      // rising labels and bursts
      for (let i = this.labels.length - 1; i >= 0; i--) { const l = this.labels[i]; l.t += dt; if (l.t > 1.7) this.labels.splice(i, 1); }
      for (let i = this.bursts.length - 1; i >= 0; i--) {
        const b = this.bursts[i]; b.t += dt; if (b.t > b.dur) { this.bursts.splice(i, 1); continue; }
        for (const p of b.p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 26 * dt; p.vx *= 0.94; p.vy *= 0.94; }
      }

      const m = Input.mouse;
      const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;

      // ---- keyboard ----
      if (Input.hit && Input.hit('Escape')) this.wantsClose = true;
      if (Input.hit && Input.hit('KeyE')) this.setTab(this.tab + 1);
      if (Input.hit && Input.hit('KeyQ')) this.setTab(this.tab - 1);
      if (Input.hit) {
        // the arrows walk a cursor from bubble to bubble; off the side changes branch
        if (Input.hit('ArrowUp')) this.step(0, -1);
        else if (Input.hit('ArrowDown')) this.step(0, 1);
        else if (Input.hit('ArrowLeft')) this.step(-1, 0);
        else if (Input.hit('ArrowRight')) this.step(1, 0);
        if ((Input.hit('Enter') || Input.hit('NumpadEnter') || Input.hit('Space')) && this.sel) {
          const kn = SKILL_BY_ID[this.sel]; if (kn) this.click(kn, tree);
        }
      }
      if (Input.down && Input.down('PageDown')) this.scrollTo += 260 * dt;
      if (Input.down && Input.down('PageUp')) this.scrollTo -= 260 * dt;
      if (Input.wheel) this.scrollTo += Input.wheel * 34;

      // ---- header buttons ----
      const backX = 566, backW = 68;   // always on screen, so touch has a way out
      if (m.clicked && hit(m, backX, 3, backW, 22)) { this.wantsClose = true; Audio_.tone(420, 0.08, 'square', 0.12, -120); }
      if (m.clicked && hit(m, 480, 4, 74, 20)) { this.affordOnly = !this.affordOnly; Audio_.tone(this.affordOnly ? 700 : 400, 0.07, 'square', 0.12); }

      // ---- tabs ----
      for (let i = 0; i < 4; i++) {
        const tx = LAY.tabs.x + i * 71;
        if (m.clicked && hit(m, tx, LAY.tabs.y, 70, LAY.tabs.h)) this.setTab(i);
      }

      // ---- board: hover + click ----
      const inBoard = hit(m, LAY.board.x, LAY.board.y, LAY.board.w, LAY.board.h);
      this.hover = null;
      const nodes = this.branchNodes(this.tab);
      if (inBoard && !this.drag) {
        for (const n of nodes) {
          const p = this.nodePos(n, T);
          if (Math.abs(m.x - p.x) <= NODE_R + 1 && Math.abs(m.y - p.y) <= NODE_R + 1) { this.hover = n; break; }
        }
        if (this.hover) this.sel = null;
      }
      const shown = this.hoverNode();
      if (shown && this.effectCache.id !== shown.id) {
        this.effectCache.id = shown.id;
        this.effectCache.rows = shown.weapon ? null : nodeEffect(tree, shown);
      }
      if (!shown) this.effectCache.id = null;

      // drag-to-pan only when the press did not land on a bubble
      if (m.down && inBoard && !this.drag && !this.hover) this.drag = { y: m.y, s: this.scrollTo };
      if (this.drag) {
        if (!m.down) this.drag = null;
        else { this.scrollTo = this.drag.s + (this.drag.y - m.y); }
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

      // scrolling easing
      this.scrollTo = clamp(this.scrollTo, 0, this.maxScroll(this.tab));
      this.scroll = Math.round(lerp(this.scroll, this.scrollTo, 1 - Math.pow(0.0015, dt)));
    },

    setTab(i) {
      const n = (i + 4) % 4;
      if (n === this.tab) return;
      this.tab = n; this.scroll = this.scrollTo = 0; this.hover = null; this.sel = null;
      Audio_.tone(520 + n * 40, 0.06, 'square', 0.1);
    },

    // what the card and the header are talking about: the mouse if it is on a
    // bubble, otherwise wherever the keyboard cursor is parked
    hoverNode() {
      return this.hover || (this.sel ? (SKILL_BY_ID[this.sel] || null) : null);
    },

    // keyboard cursor: jump to the nearest bubble in a direction
    step(dx, dy) {
      const pool = this.branchNodes(this.tab);
      if (!pool.length) return;
      const cur = this.sel ? SKILL_BY_ID[this.sel] : null;
      let best = null, bd = 1e9;
      if (!cur || pool.indexOf(cur) < 0) best = pool[0];
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
        // nothing that way and we were going sideways: step into the next branch
        if (!best && dx) {
          const nt = this.tab + dx;
          if (nt < 0 || nt > 3) return;
          const row = cur.pos[1];
          this.setTab(nt);
          let pick = null;
          for (const n of this.branchNodes(nt)) {
            if (!pick || Math.abs(n.pos[1] - row) < Math.abs(pick.pos[1] - row)) pick = n;
          }
          if (pick) this.land(pick);
          return;
        }
      }
      if (best) this.land(best);
    },

    // park the keyboard cursor on a bubble, panning only if it is off-screen
    land(n) {
      this.sel = n.id; this.hover = null;
      const cy = ROW_Y0 + n.pos[1] * ROW_PITCH;          // board-relative centre
      const top = this.scrollTo + NODE_R + 4, bot = this.scrollTo + LAY.board.h - NODE_R - 12;
      if (cy < top || cy > bot) {
        this.scrollTo = clamp(Math.round(cy - LAY.board.h / 2), 0, this.maxScroll(this.tab));
      }
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
      Audio_.buy();
      if (typeof G !== 'undefined' && G && G.player && G.player.refreshStats) G.player.refreshStats();
      if (n.weapon) tree.primary = n.weapon;
      const p = this.nodePos(n, this.T);
      Otter.feed(p.x, p.y);
      this.burst(p.x, p.y, BRANCHES[this.tab].color);
      this.labels.push({ text: '+ ' + n.name, x: p.x, y: p.y - 18, t: 0, color: BRANCHES[this.tab].color });
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
    burst(x, y, col) {
      const p = [];
      for (let i = 0; i < 30; i++) {
        const a = rand(0, TAU), s = rand(35, 165);
        p.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: randi(0, 3) });
      }
      this.bursts.push({ t: 0, dur: 0.85, p: p, x: x, y: y, col: col });
    },

    // ------------------------------------------------------------- render
    render(ctx, t) {
      this.init();
      const T = this.T, tree = this.tree();
      Deep.render(ctx, { wreckX: 250 });

      // --- the otter, sinking in the open water on the left ---
      Otter.draw(ctx, 2.8);

      // --- board: strands, then bubbles ---
      const nodes = tree ? this.branchNodes(this.tab) : [];
      const pos = {};
      for (const n of nodes) pos[n.id] = this.nodePos(n, T);
      const shown = this.hoverNode();
      const chain = shown ? this.chainOf(shown) : null;

      ctx.save();
      ctx.beginPath(); ctx.rect(LAY.board.x, LAY.board.y, LAY.board.w, LAY.board.h); ctx.clip();

      for (const n of nodes) {
        const a = pos[n.id];
        for (const rid of n.req) {
          const b = pos[rid]; if (!b) continue;
          const owned = tree.has(rid), both = owned && tree.has(n.id);
          const lit = chain && (chain.has(rid) || shown === n);
          const col = lit ? 'rgba(255,224,150,0.95)' : both ? 'rgba(255,214,120,0.62)' : owned ? 'rgba(150,215,240,0.45)' : 'rgba(70,108,138,0.35)';
          this.strand(ctx, b.x, b.y + NODE_R, a.x, a.y - NODE_R, T, col, both || lit);
        }
      }

      for (const n of nodes) {
        const p = pos[n.id];
        if (p.y < LAY.board.y - 34 || p.y > LAY.board.y + LAY.board.h + 34) continue;
        this.drawNode(ctx, n, p, tree, T, chain);
      }
      ctx.restore();

      // --- foreground fx over the open water ---
      Otter.drawGrab(ctx);
      for (const b of this.bursts) {
        const k = b.t / b.dur, a = 1 - k;
        for (const p of b.p) { ctx.globalAlpha = a; blit(ctx, Deep.bub[Math.min(Deep.bub.length - 1, p.r)], p.x, p.y); }
        ctx.globalAlpha = 1;
        if (k < 0.55) {
          const rr = 6 + k * 62;
          ctx.globalAlpha = (1 - k / 0.55) * 0.9;
          ring(ctx, b.x, b.y, rr, '#ffffff');
          ring(ctx, b.x, b.y, rr * 0.62, b.col);
          ctx.globalAlpha = 1;
        }
      }
      for (const l of this.labels) {
        const k = l.t / 1.7;
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        pixelTextOutlined(ctx, l.text, l.x, Math.round(l.y - k * 26), 8, '#ffffff', '#14141c', 'center');
        ctx.globalAlpha = 1;
      }

      // --- ornate chrome ---
      ctx.drawImage(this.chrome, 0, 0);
      this.drawHeader(ctx, tree, T);
      this.drawTabs(ctx, tree, T);
      this.drawScrollbar(ctx);
      this.drawStage(ctx, T);
      this.drawCard(ctx, tree, T);
      this.drawBottom(ctx, tree, T);

      Deep.renderForeground(ctx);
      ctx.globalAlpha = 1;
    },

    strand(ctx, x0, y0, x1, y1, t, col, bead) {
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const segs = Math.max(6, Math.round(len / 4));
      ctx.fillStyle = col;
      for (let i = 0; i <= segs; i++) {
        const k = i / segs;
        const off = Math.sin(t * 1.5 + k * 3.6 + x0 * 0.05) * Math.sin(k * Math.PI) * 5;
        ctx.fillRect(Math.round(x0 + dx * k + nx * off), Math.round(y0 + dy * k + ny * off), 1, 1);
      }
      if (bead) {
        const k = ((t * 0.34 + (x0 * 0.013)) % 1);
        const off = Math.sin(t * 1.5 + k * 3.6 + x0 * 0.05) * Math.sin(k * Math.PI) * 5;
        const bx = Math.round(x0 + dx * k + nx * off), by = Math.round(y0 + dy * k + ny * off);
        R(ctx, 'rgba(255,245,200,0.95)', bx - 1, by - 1, 3, 3);
        R(ctx, '#ffffff', bx, by, 1, 1);
      }
    },

    drawNode(ctx, n, p, tree, T, chain) {
      const owned = tree.has(n.id), avail = tree.available(n), afford = tree.canAfford(n);
      const state = owned ? 'owned' : !avail ? 'locked' : afford ? 'afford' : 'avail';
      const hov = this.hover === n || this.sel === n.id;
      const frame = (Math.floor(T * 3.4 + p.ph * 2) & 3);
      const dim = this.affordOnly && !owned && !(avail && afford);
      if (dim) ctx.globalAlpha = 0.34;

      if (chain && chain.has(n.id)) {
        ctx.globalAlpha = (dim ? 0.34 : 1) * (0.6 + Math.sin(T * 5 + p.ph) * 0.4);
        blit(ctx, BUB.chain, p.x, p.y);
        ctx.globalAlpha = dim ? 0.34 : 1;
      }
      if (hov) blit(ctx, BUB.hover, p.x, p.y);
      blit(ctx, BUB[state][frame], p.x, p.y);

      // a bubble you can afford shimmers
      if (!owned && avail && afford) {
        const rr = NODE_R + 3 + Math.sin(T * 4 + p.ph) * 1.6;
        ctx.globalAlpha = (dim ? 0.34 : 1) * (0.32 + Math.sin(T * 4.4 + p.ph) * 0.26);
        ring(ctx, p.x, p.y, rr, '#d9fff2');
        ctx.globalAlpha = dim ? 0.34 : 1;
      }

      // the icon floats inside
      const art = nodeArt(n);
      const fy = Math.round(Math.sin(T * 1.4 + p.ph * 1.7) * 1.2);
      ctx.globalAlpha = (dim ? 0.34 : 1) * (avail || owned ? 1 : 0.55);
      ctx.drawImage(art.c, Math.round(p.x - art.w / 2), Math.round(p.y - art.h / 2 + fy));
      ctx.globalAlpha = dim ? 0.34 : 1;

      // owned tick / weapon role badges
      if (owned) {
        const bx = p.x + 7, by = p.y + 6;
        R(ctx, '#14141c', bx, by, 11, 11);
        R(ctx, '#ffe48f', bx + 1, by + 1, 9, 9);
        R(ctx, '#c8952f', bx + 1, by + 7, 9, 3);
        R(ctx, '#fff6d2', bx + 1, by + 1, 9, 1);
        R(ctx, '#3c2803', bx + 2, by + 5, 2, 3); R(ctx, '#3c2803', bx + 3, by + 6, 2, 2);
        R(ctx, '#3c2803', bx + 5, by + 4, 2, 2); R(ctx, '#3c2803', bx + 6, by + 2, 2, 3);
      }
      if (n.weapon && owned) {
        const prim = tree.primary === n.weapon, side = tree.sidearm === n.weapon;
        if (prim || side) {
          const lab = prim ? 'P' : 'S', col = prim ? '#ffffff' : '#ffe48f';
          R(ctx, '#14141c', p.x - 17, p.y - 16, 9, 9);
          R(ctx, prim ? '#2f9e5b' : '#3f7fd6', p.x - 16, p.y - 15, 7, 7);
          pixelText(ctx, lab, p.x - 13, p.y - 14, 5, col, 'center', false);
        }
      }
      if (!avail && !owned) {                        // little padlock
        R(ctx, '#14141c', p.x + 8, p.y + 7, 9, 9);
        R(ctx, '#7d858f', p.x + 9, p.y + 11, 7, 4);
        R(ctx, '#aeb6c1', p.x + 10, p.y + 8, 5, 3);
        R(ctx, '#14141c', p.x + 11, p.y + 9, 3, 2);
      }

      // label
      const col = owned ? '#ffe9b0' : avail ? (afford ? '#dcfff4' : '#bcd6e6') : '#7f97a8';
      pixelTextOutlined(ctx, fitLabel(n.name, 92, 5), p.x, p.y + NODE_R + 2, 5, col, '#06121d', 'center');
      if (dim) ctx.globalAlpha = 1;
    },

    // ------------------------------------------------------------- header
    drawHeader(ctx, tree, T) {
      if (!this.titleSize) this.titleSize = fitSize('SKILL TREE', 104, [18, 16, 14, 12, 10]);
      pixelTextOutlined(ctx, 'SKILL TREE', 8, 2, this.titleSize, '#ffe48f', '#2a1d08');
      pixelText(ctx, 'OUT OF AIR', 9, 3 + textHeight(this.titleSize) + 2, 5, '#7fb8cf');

      // scrap tray
      if (tree) {
        const hn = this.hoverNode();
        const need = hn && !tree.has(hn.id) ? hn.cost : null;
        SCRAP_TYPES.forEach((k, i) => {
          const x = 118 + i * 46, y = 2, w = 43, h = 22;
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
      }

      // overall progress
      if (tree) {
        const px0 = 352, pw = 120;
        pixelText(ctx, 'TAKEN', px0, 3, 6, '#7fb8cf');
        pixelText(ctx, tree.unlocked.size + '/' + SKILL_NODES.length, px0 + pw, 2, 8, '#ffffff', 'right');
        UIKit.bar(ctx, px0, 14, pw, 8, tree.unlocked.size / SKILL_NODES.length, '#3f7fd6', '#9ff0d8');
      }

      // affordable-only toggle
      const m = Input.mouse;
      const aHov = hit(m, 480, 4, 74, 20);
      UIKit.button(ctx, 480, 4, 74, 20, null, this.affordOnly || aHov ? 'hover' : 'normal');
      R(ctx, '#14141c', 485, 9, 9, 9);
      R(ctx, this.affordOnly ? '#6fd88e' : '#2c3440', 486, 10, 7, 7);
      if (this.affordOnly) { R(ctx, '#0d3a20', 488, 14, 1, 2); R(ctx, '#0d3a20', 489, 15, 1, 1); R(ctx, '#0d3a20', 490, 13, 1, 1); R(ctx, '#0d3a20', 491, 12, 1, 1); }
      pixelText(ctx, 'AFFORD', 497, 9, 6, this.affordOnly ? '#ffffff' : '#d8c9a0');

      // back
      const bHov = hit(m, 566, 3, 68, 22);
      UIKit.button(ctx, 566, 3, 68, 22, 'BACK', bHov ? 'hover' : 'normal');
    },

    // --------------------------------------------------------------- tabs
    drawTabs(ctx, tree, T) {
      const m = Input.mouse;
      for (let i = 0; i < 4; i++) {
        const b = BRANCHES[i], x = LAY.tabs.x + i * 71, y = LAY.tabs.y, w = 70, h = LAY.tabs.h;
        const on = this.tab === i, hv = hit(m, x, y, w, h);
        R(ctx, on ? '#16243a' : hv ? '#111c2e' : '#0a1220', x, y, w, h);
        R(ctx, on ? b.color : 'rgba(60,84,110,0.9)', x, y, w, 2);
        box(ctx, on ? b.color : '#22314a', x, y, w, h);
        if (on) { R(ctx, '#16243a', x + 1, y + h - 1, w - 2, 1); }
        const nodes = this.branchNodes(i), have = nodes.filter(n => tree && tree.has(n.id)).length;
        const ready = tree ? nodes.some(n => !tree.has(n.id) && tree.available(n) && tree.canAfford(n)) : false;
        drawSprite(ctx, SP[b.icon], x + 4, y + 3);
        pixelText(ctx, b.name, x + 13, y + 3, 6, on ? b.color : '#8ea6bc');
        // progress bar with the tally beside it
        const pw = w - 30;
        R(ctx, '#050a12', x + 4, y + 11, pw, 6);
        R(ctx, '#0b1522', x + 5, y + 12, pw - 2, 4);
        R(ctx, on ? b.color : '#3c556f', x + 5, y + 12, Math.round((pw - 2) * have / nodes.length), 4);
        if (have) R(ctx, '#ffffff', x + 5, y + 12, Math.round((pw - 2) * have / nodes.length), 1);
        pixelText(ctx, have + '/' + nodes.length, x + w - 4, y + 11, 5, on ? '#ffffff' : '#a7bed0', 'right');
        if (ready) {
          const f = Math.floor(T * 3) % 2;
          R(ctx, '#14141c', x + w - 8, y + 2, 6, 6);
          R(ctx, f ? '#b6f5cd' : '#6fd88e', x + w - 7, y + 3, 4, 4);
        }
      }
    },

    drawScrollbar(ctx) {
      const max = this.maxScroll(this.tab);
      if (max <= 0) return;
      const x = LAY.board.x + LAY.board.w - 4, y = LAY.board.y + 2, h = LAY.board.h - 4;
      R(ctx, 'rgba(6,14,24,0.7)', x, y, 3, h);
      const th = Math.max(16, Math.round(h * LAY.board.h / this.contentH(this.tab)));
      const ty = Math.round(y + (h - th) * (this.scroll / max));
      R(ctx, '#3f7fd6', x, ty, 3, th);
      R(ctx, '#8ac6ff', x, ty, 3, 1); R(ctx, '#8ac6ff', x, ty + th - 1, 3, 1);
    },

    // ----------------------------------------------------- the otter stage
    drawStage(ctx, T) {
      const s = LAY.stage;
      // air meter
      const y = s.y + s.h - 26, x = s.x + 6, w = s.w - 12;
      const k = clamp(Otter.breath, 0, 1);
      pixelTextOutlined(ctx, 'AIR', x, y - 11, 7, '#9fd8ee', '#06121d');
      pixelTextOutlined(ctx, Math.round(k * 100) + '%', x + w, y - 11, 7,
        k > 0.5 ? '#9ff0d8' : k > 0.25 ? '#ffe48f' : '#ff6161', '#06121d', 'right');
      UIKit.bar(ctx, x, y, w, 10, k, k > 0.5 ? '#3f7fd6' : k > 0.25 ? '#e6802a' : '#c8302e', k > 0.5 ? '#8ac6ff' : k > 0.25 ? '#ffe48f' : '#ff6161');
      const msg = Otter.gasp > 0 ? 'AIR! HE GOT AIR!' : k < 0.25 ? 'HE IS GOING UNDER' : k < 0.55 ? 'HIS LUNGS ARE BURNING' : 'HE IS SINKING';
      const flash = k < 0.25 && Math.floor(T * 3) % 2 === 0;
      pixelTextOutlined(ctx, msg, s.x + s.w / 2, y + 13, 6,
        Otter.gasp > 0 ? '#9ff0d8' : flash ? '#ff6161' : '#c9dbe8', '#06121d', 'center');
      pixelTextOutlined(ctx, 'FEED HIM A BUBBLE', s.x + s.w / 2, y + 22, 5, '#7fb8cf', '#06121d', 'center');
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
        key = (n ? n.id : '-') + '|' + tree.unlocked.size + '|' + tree.primary + '|' + tree.sidearm + '|' + this.tab
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
      const stat = owned ? 'TAKEN' : !avail ? 'OUT OF REACH' : afford ? 'READY TO GRAB' : 'NOT ENOUGH SCRAP';
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
        if (!n.req.length) { pixelText(ctx, 'nothing - the root of the branch', X, y, 5, '#8fa6b8'); y += 8; }
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
          afford ? 'CLICK TO GRAB IT' : 'NOT ENOUGH SALVAGE';
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
      for (const l of wrapText(ctx, 'He is sinking and he is out of air. Every upgrade is a bubble - hover one to weigh it up, click to let him tear it open. [Q]/[E] change limb, arrows walk the bubbles, [ENTER] grabs one.', Wd, 6)) {
        pixelText(ctx, l, X, y, 6, '#cfe6f2'); y += 9;
      }
      y += 3;
      UIKit.divider(ctx, X, y, Wd); y += 7;

      const leg = [['owned', 'TAKEN', '#ffe9b0'], ['afford', 'READY - you can pay', '#9ff0d8'], ['avail', 'NEEDS MORE SALVAGE', '#bcd6e6'], ['locked', 'CHAINED - unlock the chain', '#7f97a8']];
      for (const l of leg) {
        blit(ctx, BUB.mini[l[0]], X + 7, y + 4);
        pixelText(ctx, l[1], X + 16, y + 1, 6, l[2]);
        y += 12;
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
      buildNodeBubbles();
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
})(typeof window !== 'undefined' ? window : this);
