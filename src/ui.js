// ---- HUD & Skill tree -----------------------------------------------------
const GLYPHS = {
  dmg: ['........', '..kkkk..', '.kYyyyk.', 'kYwwyyyk', 'kyyyyyyk', '.kyyyyk.', '..kkkk..', '........'],
  rate: ['...kk...', '..kYk...', '.kYyk...', 'kYyyykk.', '.kkkYyk.', '...kYk..', '...kk...', '........'],
  hp: ['.kk.kk..', 'kRrkRrk.', 'kRrrrrk.', '.krrrk..', '..krk...', '...k....', '........', '........'],
  shield: ['kkkkkkk.', 'kMmmmMk.', 'kmMMMmk.', 'kmMmMmk.', '.kmMmk..', '..kmk...', '...k....', '........'],
  speed: ['....kk..', '..kkGGk.', 'kkGGGGk.', 'kGGGGk..', 'kkGGkk..', '..kkk...', '........', '........'],
  roll: ['..kkkk..', '.kGGGGk.', 'kGk..kGk', 'kG....Gk', 'kGk..kGk', '.kGGGGk.', '..kkkk..', '........'],
  absorb: ['..kkkk..', '.kLLLLk.', 'kLk..kLk', 'kL.ww.Lk', 'kLk..kLk', '.kLLLLk.', '..kkkk..', '........'],
  rampage: ['...k....', '..kOk...', '..kOOk..', '.kOYOOk.', 'kOYwYOOk', 'kOYYYOOk', '.kOOOOk.', '..kkkk..'],
  magnet: ['kkk..kkk', 'kRk..kRk', 'kRk..kRk', 'kRkkkkRk', 'kRRRRRRk', '.kRRRRk.', '..kkkk..', '........'],
  ability: ['...k....', '..kYk...', '.kYwYk..', 'kYwwwYk.', '.kYwYk..', '..kYk...', '...k....', '........'],
  cd: ['..kkkk..', '.kWWWWk.', 'kWWkWWWk', 'kWWkkWWk', 'kWWWWWWk', '.kWWWWk.', '..kkkk..', '........'],
  scrap: ['..kkkk..', '.kMmmMk.', 'kMmkkmMk', 'kmkMMkmk', 'kMmkkmMk', '.kMmmMk.', '..kkkk..', '........'],
  pierce: ['kkkkkkk.', 'kMMMMMMk', 'kkkkkkk.', '........', '.kkkkkkk', 'kMMMMMMk', '.kkkkkkk', '........'],
  boom: ['..k.k...', '.kOkOk..', 'kOYYYOk.', '.kYwYk..', 'kOYYYOk.', '.kOkOk..', '..k.k...', '........'],
  fire: ['...k....', '..kRk...', '.kROk...', '.kOYOk..', 'kOYwYOk.', 'kOYYYOk.', '.kOOOk..', '..kkk...'],
  regen: ['...kk...', '..kEek..', '.kEeeEk.', 'kEeEEeEk', '.kkEEkk.', '...kk...', '...kk...', '........'],
};
const GLYPH_SP = {}; for (const k in GLYPHS) GLYPH_SP[k] = makeSprite(GLYPHS[k], { ax: 4, ay: 4 });
const NODE_ICON = {
  w_tune: 'dmg', w_hollow: 'dmg', w_hollow2: 'pierce', w_rapid: 'rate', w_bigiron: 'dmg', w_ricochet: 'pierce', w_explosive: 'boom', w_deadeye: 'dmg', w_incend: 'fire', w_sidearm: 'ability', w_barrel: 'dmg',
  u_window: 'absorb', u_reflex: 'cd', u_heal: 'hp', u_magnet: 'magnet', u_reflect: 'absorb', u_shock: 'boom', u_salvage: 'scrap', u_rgain: 'rampage', u_rdur: 'rampage', u_magnet2: 'magnet', u_rfury: 'rampage', u_rfrenzy: 'rampage', u_lucky: 'scrap', u_decoy: 'ability', u_tidal: 'ability', u_master: 'absorb',
  m_fins: 'speed', m_rollcd: 'cd', m_rolldist: 'roll', m_turn: 'speed', m_ram: 'roll', m_double: 'roll', m_fins2: 'speed', m_splash: 'boom', m_slip: 'speed', m_current: 'speed', m_dive: 'ability', m_blubber: 'speed', m_fins3: 'speed', m_triple: 'roll',
  g_hide: 'hp', g_hide2: 'hp', g_diet: 'regen', g_eyes: 'dmg', g_armor: 'shield', g_cool: 'cd', g_eyes2: 'dmg', g_hide3: 'hp', g_rock: 'ability', g_speed: 'rate', g_armor2: 'shield', g_diet2: 'regen', g_cool2: 'cd', g_second: 'hp', g_veteran: 'ability',
};

const UI = {
  banner: null, hover: null, treeTab: 0, notify: 0,
  // ------------------------------------------------------------- HUD
  drawHUD(ctx, t) {
    const p = G.player, st = p.stats;
    const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;

    // ---------- top-left: vitals ----------
    const PW = 186, PH = touch ? 44 : 60;
    UIKit.panel(ctx, 2, 2, PW, PH, 'dark');
    drawSprite(ctx, SP.heart, 16, 15);
    const hpk = clamp(p.hp / st.maxHp, 0, 1);
    UIKit.bar(ctx, 26, 10, 150, 10, hpk, hpk > 0.5 ? '#6fd88e' : hpk > 0.25 ? '#ffe48f' : '#ff6161', '#1b2028');
    if (p.hurt > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(28, 12, Math.round(146 * hpk), 6); }
    pixelTextOutlined(ctx, `${Math.ceil(p.hp)}/${st.maxHp}`, 101, 11, 6, '#ffffff', '#14141c', 'center');

    drawSprite(ctx, GLYPH_SP.rampage, 16, 28);
    const full = p.rampage.meter >= 100 && !p.rampage.active;
    const rk = p.rampage.active ? 1 - p.rampage.t / p.rampage.dur : p.rampage.meter / 100;
    UIKit.bar(ctx, 26, 23, 150, 9, clamp(rk, 0, 1),
      p.rampage.active ? (Math.floor(t * 10) % 2 ? '#ff6161' : '#ffe48f') : full ? (Math.floor(t * 4) % 2 ? '#ff6161' : '#ff9a3c') : '#c8302e', '#1b2028');
    pixelTextOutlined(ctx, p.rampage.active ? 'RAMPAGE!' : full ? 'RAMPAGE READY' : 'OTTER RAMPAGE', 101, 24, 5, '#ffffff', '#14141c', 'center');

    // roll charges + shield, keyboard prompts only on desktop
    drawSprite(ctx, GLYPH_SP.roll, 16, 41);
    for (let i = 0; i < st.rollCharges; i++) {
      const on = i < p.roll.charges;
      ctx.fillStyle = '#14141c'; ctx.fillRect(25 + i * 9, 37, 8, 8);
      ctx.fillStyle = on ? '#6fd88e' : '#2c3440'; ctx.fillRect(26 + i * 9, 38, 6, 6);
      if (on) { ctx.fillStyle = '#b6f5cd'; ctx.fillRect(26 + i * 9, 38, 6, 2); }
    }
    if (p.roll.charges < st.rollCharges) {
      const k = 1 - p.roll.rechargeT / p.cd(2.4 * st.rollCd);
      ctx.fillStyle = '#6fd88e'; ctx.fillRect(26 + p.roll.charges * 9, 44, Math.round(6 * clamp(k, 0, 1)), 1);
    }
    const shx = 30 + st.rollCharges * 9;
    drawSprite(ctx, GLYPH_SP.absorb, shx + 5, 41);
    const acd = p.absorb.cd > 0 ? 1 - p.absorb.cd / p.cd(st.absorbCd) : 1;
    UIKit.bar(ctx, shx + 12, 37, 48, 8, clamp(acd, 0, 1), p.absorb.active ? '#ffffff' : acd >= 1 ? '#8ac6ff' : '#3f6f9f', '#1b2028');

    if (!touch) {
      pixelText(ctx, 'SPACE', 26, 49, 5, '#8fa6b8');
      pixelText(ctx, 'E / RMB', shx + 12, 49, 5, '#8fa6b8');
      let ax = 2, ay = PH + 6;
      const ab = [];
      if (st.dive) ab.push(['DIVE', 'SHIFT', p.dive.cd, p.cd(7), '#8ac6ff']);
      if (st.decoy) ab.push(['DECOY', 'F', p.decoyCd, p.cd(14), '#ffe48f']);
      if (st.tidal) ab.push(['TIDAL', 'R', p.tidalCd, p.cd(12), '#6fd88e']);
      for (const [name, key, cd, max, col] of ab) {
        const label = `${name} [${key}]`;
        const w = Math.max(50, textWidth(label, 5) + 8);
        UIKit.panel(ctx, ax, ay, w, 14, 'dark');
        const k = cd > 0 ? 1 - cd / max : 1;
        ctx.fillStyle = k >= 1 ? col : '#2c3440'; ctx.fillRect(ax + 3, ay + 10, Math.round((w - 6) * clamp(k, 0, 1)), 2);
        pixelText(ctx, label, ax + 4, ay + 3, 5, k >= 1 ? '#fff' : '#7d8fa0');
        ax += w + 3;
      }
    }

    // ---------- top-centre: clock & wave ----------
    const w0 = G.director.currentWave();
    // before the fight the village's own sign is on screen, so don't repeat it
    const waveLabel = G.director.started ? (w0.boss ? 'BOSS' : G.director.waveName(G.director.waveIdx)) : null;
    void waveLabel;
    const cw = Math.max(88, waveLabel ? textWidth(waveLabel, 6) + 20 : 0);
    UIKit.panel(ctx, 320 - cw / 2, 2, cw, waveLabel ? 24 : 18, 'dark');
    pixelTextOutlined(ctx, fmtTime(G.director.time), 320, waveLabel ? 5 : 4, 9, '#ffffff', '#14141c', 'center');
    if (waveLabel) pixelTextOutlined(ctx, waveLabel, 320, 16, 6, '#ffe48f', '#14141c', 'center');

    // ---------- objective ----------
    // What this wave is actually asking for, on screen the whole time it lasts.
    const d0 = G.director;
    if (d0.started && d0.state === 'fighting' && d0.objectiveStatus) {
      const ob = d0.objectiveStatus();
      if (ob) {
        const ow = Math.max(240, textWidth(ob.text, 6) + 30);
        const oy = (G.boss && !G.boss.dead) ? 52 : 28;
        UIKit.panel(ctx, 320 - ow / 2, oy, ow, 26, 'dark');
        pixelTextOutlined(ctx, 'OBJECTIVE', 320 - ow / 2 + 8, oy + 4, 5, '#9ab0c0', '#14141c');
        const vc = ob.done ? '#6fd88e' : '#ffe48f';
        pixelTextOutlined(ctx, ob.value, 320 + ow / 2 - 8, oy + 4, 5, vc, '#14141c', 'right');
        pixelTextOutlined(ctx, ob.text, 320, oy + 13, 6, ob.done ? '#6fd88e' : '#ffffff', '#14141c', 'center');
        ctx.fillStyle = '#1b2028'; ctx.fillRect(320 - ow / 2 + 6, oy + 22, ow - 12, 2);
        ctx.fillStyle = vc; ctx.fillRect(320 - ow / 2 + 6, oy + 22, Math.round((ow - 12) * clamp(ob.frac || 0, 0, 1)), 2);
      }
    }

    // ---------- boss bar ----------
    const b = G.boss;
    if (b && !b.dead) {
      UIKit.panel(ctx, 150, 28, 340, 22, 'dark');
      UIKit.bar(ctx, 156, 40, 328, 7, clamp(b.hp / b.maxHp, 0, 1), b.phase === 2 ? '#ff6161' : '#c8302e', '#1b2028');
      ctx.fillStyle = '#ffe48f'; ctx.fillRect(156 + 164, 39, 1, 9);
      const nm = `${b.name}${b.phase === 2 ? ' - BLOOD FRENZY' : ''}${b.stunned ? '  [STUNNED]' : ''}`;
      pixelTextOutlined(ctx, nm, 320, 30, 7, b.stunned ? '#ffe48f' : '#ffffff', '#14141c', 'center');
      const bp = G.worldToScreen(b.x, b.y), sx = bp.x, sy = bp.y;
      if (sx < 0 || sy < 0 || sx > 640 || sy > 360) {
        const a = angleTo(320, 180, sx, sy), ex = clamp(320 + Math.cos(a) * 400, 12, 628), ey = clamp(180 + Math.sin(a) * 400, 56, 348);
        ctx.fillStyle = '#ff6161'; ctx.beginPath();
        ctx.moveTo(ex + Math.cos(a) * 8, ey + Math.sin(a) * 8);
        ctx.lineTo(ex + Math.cos(a + 2.4) * 7, ey + Math.sin(a + 2.4) * 7);
        ctx.lineTo(ex + Math.cos(a - 2.4) * 7, ey + Math.sin(a - 2.4) * 7); ctx.fill();
      }
    }

    // ---------- mini-boss bar ----------
    const mb = (G.miniBosses || []).find(m => !m.dead);
    if (mb && !(G.boss && !G.boss.dead)) {
      const mname = mb.displayName || mb.name || 'SOMETHING BIG';
      UIKit.panel(ctx, 190, 80, 260, 18, 'dark');
      UIKit.bar(ctx, 195, 89, 250, 5, clamp(mb.hp / mb.maxHp, 0, 1), '#e6802a', '#1b2028');
      pixelTextOutlined(ctx, mname, 320, 81, 6, '#ffd27a', '#14141c', 'center');
      const mp = G.worldToScreen(mb.x, mb.y);
      if (mp.x < 0 || mp.y < 0 || mp.x > 640 || mp.y > 360) {
        const a = angleTo(320, 180, mp.x, mp.y), ex = clamp(320 + Math.cos(a) * 400, 12, 628), ey = clamp(180 + Math.sin(a) * 400, 56, 348);
        ctx.fillStyle = '#e6802a';
        ctx.fillRect(Math.round(ex) - 3, Math.round(ey) - 3, 6, 6);
        ctx.fillRect(Math.round(ex + Math.cos(a) * 5) - 2, Math.round(ey + Math.sin(a) * 5) - 2, 4, 4);
      }
    }

    // ---------- top-right: salvage ----------
    const SW = 210, SX = 640 - SW - 2;
    UIKit.panel(ctx, SX, 2, SW, 28, 'dark');
    SCRAP_TYPES.forEach((k, i) => {
      const x = SX + 12 + i * 38;
      drawSprite(ctx, SP.scrap[k], x + 4, 15);
      pixelTextOutlined(ctx, G.tree.scrap[k] + '', x + 12, 11, 7, SCRAP_COLORS[k], '#14141c');
    });
    const canBuy = SKILL_NODES.some(n => !G.tree.has(n.id) && G.tree.available(n) && G.tree.canAfford(n));
    if (!touch) {
      // the prompt is short enough to clear the panel; the nudge goes under it
      pixelTextOutlined(ctx, '[TAB] SKILL TREE', 630, 33, 5,
        canBuy && Math.floor(t * 2) % 2 ? '#6fd88e' : '#9ab0c0', '#14141c', 'right');
      if (canBuy) pixelTextOutlined(ctx, 'points ready', 630, 42, 5,
        Math.floor(t * 2) % 2 ? '#6fd88e' : '#4f8a63', '#14141c', 'right');
    }

    // ---------- bottom-left: weapon ----------
    if (!touch) {
      const wp = WEAPONS[G.tree.primary];
      const side = st.sidearm && G.tree.sidearm && G.tree.sidearm !== G.tree.primary;
      UIKit.panel(ctx, 2, 318, 210, 40, 'dark');
      drawSprite(ctx, SP.guns[G.tree.primary], 16, 332);
      pixelText(ctx, wp.name, 42, 324, 6, '#ffffff');
      const wl = G.tree.weaponsUnlocked();
      // the otter fires when you tell him to and not before, so say it plainly
      pixelText(ctx, 'HOLD LEFT MOUSE TO FIRE', 42, 333, 5, Input.mouse.down ? '#ffe48f' : '#8fa6b8');
      pixelText(ctx, wl.length > 1 ? `[1-${wl.length}] switch  (${wl.indexOf(G.tree.primary) + 1}/${wl.length})` : 'unlock more in the skill tree', 42, 341, 5, '#8fa6b8');
      if (side) { drawSprite(ctx, SP.guns[G.tree.sidearm], 16, 351); pixelText(ctx, '+ ' + WEAPONS[G.tree.sidearm].name, 42, 349, 5, '#ffe48f'); }
    }

    // ---------- bottom-right: tally ----------
    const tally = `${G.stats.kills} SUNK`;
    const tw = textWidth(tally, 6) + 40;
    UIKit.panel(ctx, 638 - tw, 328, tw, 20, 'dark');
    drawSprite(ctx, SP.skull, 652 - tw, 338);
    pixelText(ctx, tally, 659 - tw, 335, 6, '#ffffff');

    // ---------- banner ----------
    if (this.banner) {
      const bn = this.banner, k = bn.t / bn.dur;
      const alpha = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.globalAlpha = alpha;
      UIKit.ribbon(ctx, 320, 62, bn.text, 'gold');
      if (bn.sub) {
        ctx.fillStyle = 'rgba(6,14,26,0.72)';
        const sw = textWidth(bn.sub, 6) + 16;
        ctx.fillRect(320 - sw / 2, 84, sw, 12);
        pixelTextOutlined(ctx, bn.sub, 320, 86, 6, '#ffffff', '#14141c', 'center');
      }
      ctx.globalAlpha = 1;
    }

    // ---------- between waves ----------
    const d = G.director;
    if (d.cleared && !G.boss) {
      const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
      const pulse = Math.floor(t * 2) % 2;
      UIKit.panel(ctx, 128, 250, 384, 46, 'gold');
      pixelTextOutlined(ctx, d.lastWave ? 'THE FLEET IS BROKEN' : 'WAVE CLEARED', 320, 257, 11,
        pulse ? '#ffffff' : '#ffe48f', '#14141c', 'center');
      if (d.lastWave) {
        pixelTextOutlined(ctx, 'Only the Chief is left. Take a breath.', 320, 273, 7, '#e8d9b4', '#14141c', 'center');
        pixelTextOutlined(ctx, touch ? 'SKILL TREE to spend salvage' : '[TAB] SKILL TREE to spend salvage', 320, 283, 6, '#c9b890', '#14141c', 'center');
      } else {
        pixelTextOutlined(ctx, touch ? 'Open the SKILL TREE to spend your salvage' : '[TAB] open the SKILL TREE and spend your salvage', 320, 272, 7, '#e8d9b4', '#14141c', 'center');
        pixelTextOutlined(ctx, touch ? 'TAP HERE FOR THE NEXT WAVE' : '[ENTER] CALL IN THE NEXT WAVE', 320, 282, 8,
          pulse ? '#ffe48f' : '#ffffff', '#14141c', 'center');
      }
    }

    if (hpk < 0.3) { ctx.fillStyle = `rgba(200,20,20,${(0.12 + Math.sin(t * 6) * 0.08).toFixed(2)})`; ctx.fillRect(0, 0, 640, 360); }
    if (p.slowed > 0) pixelTextOutlined(ctx, 'NETTED! ROLL TO BREAK FREE', 320, 296, 7, '#6fd88e', '#14141c', 'center');
  },

  // ------------------------------------------------------------- Skill tree
  nodeXY(node) {
    const bi = BRANCHES.findIndex(b => b.id === node.branch);
    const px = 4 + bi * 158;
    return { x: px + 31 + node.pos[0] * 46, y: 68 + node.pos[1] * 33 };
  },
  updateTree() {
    const m = Input.mouse; this.hover = null;
    for (const n of SKILL_NODES) { const { x, y } = this.nodeXY(n); if (Math.abs(m.x - x) <= 12 && Math.abs(m.y - y) <= 10) { this.hover = n; break; } }
    const tree = G.tree;
    if (this.hover) {
      const n = this.hover;
      if (m.clicked) {
        if (tree.has(n.id)) { if (n.weapon) { tree.primary = n.weapon; Audio_.buy(); } }
        else if (tree.buy(n)) { Audio_.buy(); G.player.refreshStats(); const q = this.nodeXY(n); TreeScene.grab(n, q.x, q.y); G.particles.text(G.player.x, G.player.y - 24, n.name + '!', '#6fd88e', 8); if (n.weapon) { tree.primary = n.weapon; } }
        else Audio_.deny();
      }
      if (m.rclicked && n.weapon && tree.has(n.id) && G.player.stats.sidearm) { tree.sidearm = tree.sidearm === n.weapon ? null : n.weapon; Audio_.buy(); }
    }
    // revolver is always available as a weapon: clicking the branch header equips it
    if (m.clicked && m.x > 4 && m.x < 158 && m.y > 300 && m.y < 316) { tree.primary = 'revolver'; Audio_.buy(); }
    if (m.rclicked && m.x > 4 && m.x < 158 && m.y > 300 && m.y < 316 && G.player.stats.sidearm) { tree.sidearm = tree.sidearm === 'revolver' ? null : 'revolver'; Audio_.buy(); }
  },
  drawTree(ctx, t) {
    TreeScene.build();
    const tree = G.tree;
    // ---- the deep: he is drowning, and every upgrade is a gulp of air
    TreeScene.renderBackdrop(ctx, t);
    TreeScene.drawDrowningOtter(ctx, t);

    // ---- connective strands between bubbles
    for (const n of SKILL_NODES) {
      const a = this.nodeXY(n);
      for (const rid of n.req) {
        const r = SKILL_BY_ID[rid]; if (!r || r.branch !== n.branch) continue;
        const b = this.nodeXY(r);
        const on = tree.has(rid), both = on && tree.has(n.id);
        ctx.strokeStyle = both ? 'rgba(255,228,143,0.55)' : on ? 'rgba(150,215,240,0.35)' : 'rgba(60,90,120,0.28)';
        ctx.lineWidth = 1;
        const mid = (b.y + a.y) / 2;
        const wob = Math.sin(t * 1.4 + a.x * 0.05) * 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + 11); ctx.lineTo(b.x + wob, mid); ctx.lineTo(a.x - wob, mid); ctx.lineTo(a.x, a.y - 11);
        ctx.stroke();
      }
    }

    // ---- branch headers, floating like signage in the current
    BRANCHES.forEach((b, bi) => {
      const px0 = 4 + bi * 158;
      ctx.fillStyle = 'rgba(8,24,42,0.45)'; ctx.fillRect(px0, 30, 154, 22);
      ctx.fillStyle = b.color; ctx.fillRect(px0, 30, 154, 1); ctx.fillRect(px0, 51, 154, 1);
      drawSprite(ctx, SP[b.icon], px0 + 4, 34);
      pixelText(ctx, b.name, px0 + 14, 33, 8, b.color);
      pixelText(ctx, fitLabel(b.blurb, 146, 5), px0 + 6, 43, 5, '#9dc3d8');
    });

    // ---- nodes as air bubbles
    for (const n of SKILL_NODES) {
      const base = this.nodeXY(n);
      const owned = tree.has(n.id), avail = tree.available(n), afford = tree.canAfford(n);
      const hover = this.hover === n;
      // bubbles drift
      const ph = n.pos[0] * 1.7 + n.pos[1] * 0.9 + n.branch.length;
      const x = Math.round(base.x + Math.sin(t * 0.9 + ph) * 1.6);
      const y = Math.round(base.y + Math.cos(t * 1.15 + ph) * 1.8);
      const spr = owned ? TreeScene.sprOwned : !avail ? TreeScene.sprLocked : afford ? TreeScene.sprAfford : TreeScene.sprAvailable;
      if (hover) ctx.drawImage(TreeScene.sprHover.c, x - TreeScene.sprHover.ax, y - TreeScene.sprHover.ay);
      ctx.drawImage(spr.c, x - spr.ax, y - spr.ay);
      // a ready bubble shimmers
      if (avail && afford && !owned) {
        ctx.strokeStyle = `rgba(190,255,235,${(0.35 + Math.sin(t * 5 + ph) * 0.3).toFixed(2)})`;
        ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 15 + Math.sin(t * 5 + ph), 0, TAU); ctx.stroke();
      }
      // icon inside the bubble
      ctx.globalAlpha = avail || owned ? 1 : 0.4;
      if (n.weapon) { const g = SP.guns[n.weapon]; ctx.drawImage(g.c, Math.round(x - g.w / 2), Math.round(y - g.h / 2)); }
      else { const gl = GLYPH_SP[NODE_ICON[n.id] || 'ability']; drawSprite(ctx, gl, x, y); }
      ctx.globalAlpha = 1;
      if (n.weapon && owned) {
        if (tree.primary === n.weapon) pixelText(ctx, 'P', x + 9, y - 12, 6, '#fff');
        if (tree.sidearm === n.weapon) pixelText(ctx, 'S', x + 9, y - 12, 6, '#ffe48f');
      }
      pixelTextOutlined(ctx, fitLabel(n.name, 42, 5), x, y + 13, 5,
        owned ? '#ffe9b0' : avail ? '#cfe9f5' : '#6d8598', '#08131f', 'center');
    }

    TreeScene.renderFx(ctx, t);

    // ---- header
    ctx.fillStyle = 'rgba(4,14,26,0.72)'; ctx.fillRect(0, 0, 640, 28);
    pixelText(ctx, 'SKILL TREE', 8, 4, 12, '#ffe48f');
    pixelText(ctx, 'He is out of air. Every upgrade is a bubble of air. Reach out and take it.', 8, 18, 6, '#9fd8ee');
    SCRAP_TYPES.forEach((k, i) => {
      const x = 390 + i * 46;
      drawSprite(ctx, SP.scrap[k], x + 4, 11); pixelText(ctx, tree.scrap[k] + '', x + 11, 6, 9, SCRAP_COLORS[k]);
    });
    pixelText(ctx, '[TAB] / [ESC] surface', 634, 18, 6, '#9fd8ee', 'right');

    TreeScene.renderBreath(ctx);

    // ---- tooltip
    const n = this.hover;
    ctx.fillStyle = 'rgba(2,10,20,0.85)'; ctx.fillRect(0, 306, 640, 34);
    ctx.fillStyle = 'rgba(127,212,238,0.5)'; ctx.fillRect(0, 306, 640, 1);
    if (n) {
      const owned = tree.has(n.id), avail = tree.available(n);
      pixelText(ctx, n.name, 8, 309, 9, BRANCHES.find(b => b.id === n.branch).color);
      const lines = wrapText(ctx, n.desc, 400, 6);
      lines.slice(0, 2).forEach((l, i) => pixelText(ctx, l, 8, 320 + i * 9, 6, '#dceef7'));
      let cx = 430;
      pixelText(ctx, 'COST', cx, 309, 6, '#9fd8ee'); cx += 26;
      for (const k in n.cost) {
        drawSprite(ctx, SP.scrap[k], cx + 4, 313);
        pixelText(ctx, n.cost[k] + '', cx + 10, 309, 8, owned ? '#7a8c98' : tree.scrap[k] >= n.cost[k] ? '#9ff0d8' : '#ff6161');
        cx += 30;
      }
      const status = owned ? (n.weapon ? 'TAKEN - click to equip, right-click for sidearm' : 'TAKEN')
        : !avail ? 'OUT OF REACH - needs ' + n.req.map(r => SKILL_BY_ID[r].name).join(n.reqAny ? ' or ' : ' + ')
        : tree.canAfford(n) ? 'CLICK TO GRAB IT' : 'NOT ENOUGH SCRAP';
      pixelText(ctx, status, 430, 328, 6, owned ? '#ffe48f' : !avail ? '#ff6161' : tree.canAfford(n) ? '#9ff0d8' : '#ff6161');
    } else {
      pixelText(ctx, 'Hover a bubble to inspect it.', 8, 310, 6, '#9fd8ee');
      pixelText(ctx, 'Scrap: dinghies=wood  harpooners/gunboats=metal  speedboats/jetskis=fuel', 8, 320, 5, '#7fb8cf');
      pixelText(ctx, 'skiffs=powder  netters/trawlers=electronics', 8, 328, 5, '#7fb8cf');
      pixelText(ctx, `Sunk ${G.stats.kills}   Absorbs ${G.stats.absorbs}   Scrap ${G.stats.scrapCollected}   Taken ${tree.unlocked.size}/${SKILL_NODES.length}   (paused)`, 380, 328, 5, '#9fd8ee');
    }
  },
};
