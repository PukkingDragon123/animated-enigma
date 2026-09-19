// ---- HUD & Skill tree ("The Workshop") -----------------------------------
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
    // HP
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(4, 4, 150, 40);
    drawSprite(ctx, SP.heart, 12, 12);
    const hpk = clamp(p.hp / st.maxHp, 0, 1);
    ctx.fillStyle = '#14141c'; ctx.fillRect(20, 8, 128, 9);
    ctx.fillStyle = hpk > 0.5 ? '#6fd88e' : hpk > 0.25 ? '#ffe48f' : '#ff6161'; ctx.fillRect(21, 9, Math.round(126 * hpk), 7);
    if (p.hurt > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(21, 9, Math.round(126 * hpk), 7); }
    pixelText(ctx, `${Math.ceil(p.hp)}/${st.maxHp}`, 84, 9, 7, '#fff', 'center');
    // Rampage meter
    ctx.fillStyle = '#14141c'; ctx.fillRect(20, 20, 128, 7);
    const rk = p.rampage.active ? 1 - p.rampage.t / p.rampage.dur : p.rampage.meter / 100;
    const full = p.rampage.meter >= 100 && !p.rampage.active;
    ctx.fillStyle = p.rampage.active ? (Math.floor(t * 10) % 2 ? '#ff6161' : '#ffe48f') : full ? (Math.floor(t * 4) % 2 ? '#ff6161' : '#ff9a3c') : '#c8302e';
    ctx.fillRect(21, 21, Math.round(126 * clamp(rk, 0, 1)), 5);
    drawSprite(ctx, GLYPH_SP.rampage, 12, 24);
    pixelText(ctx, p.rampage.active ? 'RAMPAGE!!' : full ? 'RAMPAGE READY [Q]' : 'OTTER RAMPAGE', 84, 20, 6, '#fff', 'center');
    // roll charges + absorb cd
    drawSprite(ctx, GLYPH_SP.roll, 12, 36);
    for (let i = 0; i < st.rollCharges; i++) { ctx.fillStyle = i < p.roll.charges ? '#6fd88e' : '#3a3a48'; ctx.fillRect(20 + i * 8, 33, 6, 6); }
    if (p.roll.charges < st.rollCharges) { const k = 1 - p.roll.rechargeT / p.cd(2.4 * st.rollCd); ctx.fillStyle = '#6fd88e'; ctx.fillRect(20 + p.roll.charges * 8, 38, Math.round(6 * clamp(k, 0, 1)), 1); }
    pixelText(ctx, 'SPACE', 20 + st.rollCharges * 8 + 3, 33, 6, '#aab', 'left');
    drawSprite(ctx, GLYPH_SP.absorb, 82, 36);
    const acd = p.absorb.cd > 0 ? 1 - p.absorb.cd / p.cd(st.absorbCd) : 1;
    ctx.fillStyle = '#14141c'; ctx.fillRect(90, 33, 30, 6); ctx.fillStyle = acd >= 1 ? '#8ac6ff' : '#3f6f9f'; ctx.fillRect(91, 34, Math.round(28 * clamp(acd, 0, 1)), 4);
    pixelText(ctx, 'E/RMB', 122, 33, 6, '#aab');
    // extra abilities
    let ax = 4, ay = 46;
    const ab = [];
    if (st.dive) ab.push(['DIVE', 'SHIFT', p.dive.cd, p.cd(7), '#8ac6ff']);
    if (st.decoy) ab.push(['DECOY', 'F', p.decoyCd, p.cd(14), '#ffe48f']);
    if (st.tidal) ab.push(['TIDAL', 'R', p.tidalCd, p.cd(12), '#6fd88e']);
    for (const [name, key, cd, max, col] of ab) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(ax, ay, 48, 12);
      const k = cd > 0 ? 1 - cd / max : 1;
      ctx.fillStyle = k >= 1 ? col : '#3a3a48'; ctx.fillRect(ax + 1, ay + 9, Math.round(46 * clamp(k, 0, 1)), 2);
      pixelText(ctx, `${name} [${key}]`, ax + 2, ay + 1, 6, k >= 1 ? '#fff' : '#889');
      ax += 50;
    }
    // Timer / wave
    const w = G.director.currentWave();
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(272, 4, 96, 20);
    pixelText(ctx, fmtTime(G.director.time), 320, 6, 9, '#fff', 'center');
    pixelText(ctx, G.director.started ? (w.boss ? 'BOSS' : w.name) : 'FISHER VILLAGE', 320, 16, 6, '#ffe48f', 'center');
    // Boss bar
    const b = G.boss;
    if (b && !b.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(170, 28, 300, 14);
      ctx.fillStyle = '#14141c'; ctx.fillRect(174, 36, 292, 4);
      const k = clamp(b.hp / b.maxHp, 0, 1);
      ctx.fillStyle = b.phase === 2 ? '#ff6161' : '#c8302e'; ctx.fillRect(175, 37, Math.round(290 * k), 2);
      ctx.fillStyle = '#ffe48f'; ctx.fillRect(174 + 146, 35, 1, 6); // phase 2 marker
      pixelText(ctx, `${b.name}${b.phase === 2 ? ' - BLOOD FRENZY' : ''}${b.stunned ? '  [STUNNED]' : ''}`, 320, 29, 7, b.stunned ? '#ffe48f' : '#fff', 'center');
      // off-screen indicator
      const sx = b.x - G.cam.x, sy = b.y - G.cam.y;
      if (sx < 0 || sy < 0 || sx > 640 || sy > 360) {
        const a = angleTo(320, 180, sx, sy), ex = clamp(320 + Math.cos(a) * 400, 10, 630), ey = clamp(180 + Math.sin(a) * 400, 50, 350);
        ctx.fillStyle = '#ff6161'; ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * 7, ey + Math.sin(a) * 7); ctx.lineTo(ex + Math.cos(a + 2.4) * 6, ey + Math.sin(a + 2.4) * 6); ctx.lineTo(ex + Math.cos(a - 2.4) * 6, ey + Math.sin(a - 2.4) * 6); ctx.fill();
        drawSprite(ctx, SP.sharkFin, ex - Math.cos(a) * 10, ey - Math.sin(a) * 10);
      }
    }
    // Scrap (top right)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(462, 4, 174, 26);
    SCRAP_TYPES.forEach((k, i) => { const x = 468 + i * 34; drawSprite(ctx, SP.scrap[k], x + 4, 11); pixelText(ctx, G.tree.scrap[k] + '', x + 11, 7, 8, SCRAP_COLORS[k]); });
    const canBuy = SKILL_NODES.some(n => !G.tree.has(n.id) && G.tree.available(n) && G.tree.canAfford(n));
    pixelText(ctx, canBuy ? '[TAB] WORKSHOP - upgrades available!' : '[TAB] WORKSHOP', 634, 20, 6, canBuy && Math.floor(t * 2) % 2 ? '#6fd88e' : '#aab', 'right');
    // Weapon (bottom left)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(4, 330, 170, 26);
    const wp = WEAPONS[G.tree.primary];
    drawSprite(ctx, SP.guns[G.tree.primary], 10, 338);
    pixelText(ctx, wp.name, 34, 333, 7, '#fff');
    const wl = G.tree.weaponsUnlocked();
    pixelText(ctx, wl.length > 1 ? `[1-${wl.length}] switch  (${wl.indexOf(G.tree.primary) + 1}/${wl.length})` : 'unlock more in the Workshop', 34, 344, 6, '#aab');
    if (st.sidearm && G.tree.sidearm && G.tree.sidearm !== G.tree.primary) { drawSprite(ctx, SP.guns[G.tree.sidearm], 10, 350); pixelText(ctx, '+ ' + WEAPONS[G.tree.sidearm].name, 34, 351, 6, '#ffe48f'); }
    // kills (bottom right)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(560, 330, 76, 14);
    drawSprite(ctx, SP.skull, 568, 337); pixelText(ctx, `${G.stats.kills} sunk`, 578, 333, 7, '#fff');
    // banner
    if (this.banner) {
      const bn = this.banner; const k = bn.t / bn.dur;
      const alpha = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 60, 640, bn.sub ? 34 : 24);
      pixelText(ctx, bn.text, 320, 64, 14, bn.color, 'center');
      if (bn.sub) pixelText(ctx, bn.sub, 320, 82, 7, '#fff', 'center');
      ctx.globalAlpha = 1;
    }
    // low hp vignette
    if (hpk < 0.3) { ctx.fillStyle = `rgba(200,20,20,${(0.12 + Math.sin(t * 6) * 0.08).toFixed(2)})`; ctx.fillRect(0, 0, 640, 360); }
    // slowed indicator
    if (p.slowed > 0) pixelText(ctx, 'NETTED! (roll to break free faster)', 320, 300, 7, '#6fd88e', 'center');
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
      pixelText(ctx, b.blurb, px0 + 4, 43, 5.5, '#9dc3d8');
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
      const label = n.name.length > 13 ? n.name.slice(0, 12) + '.' : n.name;
      pixelText(ctx, label, x, y + 13, 5, owned ? '#ffe9b0' : avail ? '#cfe9f5' : '#6d8598', 'center', true);
    }

    TreeScene.renderFx(ctx, t);

    // ---- header
    ctx.fillStyle = 'rgba(4,14,26,0.72)'; ctx.fillRect(0, 0, 640, 28);
    pixelText(ctx, 'THE DEEP', 8, 4, 12, '#ffe48f');
    pixelText(ctx, 'He is out of air. Every upgrade is a bubble — reach out and take it.', 8, 18, 6, '#9fd8ee');
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
      const lines = wrapText(ctx, n.desc, 380, 6.5);
      lines.slice(0, 2).forEach((l, i) => pixelText(ctx, l, 8, 320 + i * 8, 6.5, '#dceef7'));
      let cx = 430;
      pixelText(ctx, 'COST', cx, 309, 6, '#9fd8ee'); cx += 26;
      for (const k in n.cost) {
        drawSprite(ctx, SP.scrap[k], cx + 4, 313);
        pixelText(ctx, n.cost[k] + '', cx + 10, 309, 8, owned ? '#7a8c98' : tree.scrap[k] >= n.cost[k] ? '#9ff0d8' : '#ff6161');
        cx += 30;
      }
      const status = owned ? (n.weapon ? 'TAKEN — click to equip, right-click for sidearm' : 'TAKEN')
        : !avail ? 'OUT OF REACH — needs ' + n.req.map(r => SKILL_BY_ID[r].name).join(n.reqAny ? ' or ' : ' + ')
        : tree.canAfford(n) ? 'CLICK TO GRAB IT' : 'NOT ENOUGH SCRAP';
      pixelText(ctx, status, 430, 328, 6, owned ? '#ffe48f' : !avail ? '#ff6161' : tree.canAfford(n) ? '#9ff0d8' : '#ff6161');
    } else {
      pixelText(ctx, 'Hover a bubble to inspect it. Boats drop different scrap: dinghies=wood, harpooners/gunboats=metal, speedboats/jetskis=fuel, skiffs=powder, netters/trawlers=electronics.', 8, 310, 6, '#9fd8ee');
      pixelText(ctx, `Sunk: ${G.stats.kills}   Absorbs: ${G.stats.absorbs}   Scrap: ${G.stats.scrapCollected}   Taken: ${tree.unlocked.size}/${SKILL_NODES.length}`, 8, 322, 6, '#dceef7');
      pixelText(ctx, 'The fight is paused while you plan.', 8, 332, 6, '#6f93a8');
    }
  },
};
