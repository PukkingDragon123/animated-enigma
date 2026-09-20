// ---- Cinematic intro, dialogue, end screens -----------------------------
// The intro cinematic now lives in src/intro.js, which defines the global
// `Intro`. A top-level `const Intro` here would shadow it, so it is gone.

const Dialogue = {
  t: 0, text: 'Oh, a manatee! Free meat for tonight!', done: false, shotFired: false,
  reset() { this.t = 0; this.done = false; this.shotFired = false; },
  update(dt) { this.t += dt; if (this.t > 3) this.done = true; },
  renderWorld(ctx, cam) { /* the bubble is drawn in HUD space so the text stays crisp */ },
  renderHUD(ctx) {
    const f = G.fisherman; if (!f || !f.alive) return;
    // anchor the bubble to his screen position through the zoom
    if (this.t > 0.6) {
      const sp = G.worldToScreen(f.x, f.y - 34);
      const sx = Math.round(sp.x), sy = Math.round(sp.y);
      const n = Math.min(this.text.length, Math.floor((this.t - 0.6) * 30));
      const w = Math.max(70, textWidth(this.text, 7) + 20);
      const bx = clamp(sx - w / 2, 6, 634 - w), by = clamp(sy - 26, 44, 300);
      UIKit.panel(ctx, bx, by, w, 24, 'parchment');
      ctx.fillStyle = '#e8dcc0';
      ctx.beginPath(); ctx.moveTo(sx - 6, by + 23); ctx.lineTo(sx + 6, by + 23); ctx.lineTo(sx, by + 33); ctx.fill();
      ctx.fillStyle = '#2a2016';
      ctx.beginPath(); ctx.moveTo(sx - 7, by + 24); ctx.lineTo(sx - 5, by + 24); ctx.lineTo(sx, by + 34); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx + 7, by + 24); ctx.lineTo(sx + 5, by + 24); ctx.lineTo(sx, by + 34); ctx.fill();
      pixelText(ctx, this.text.slice(0, n), bx + 10, by + 8, 7, '#2a2016', 'left', false);
    }
    if (!this.done) return;
    const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
    UIKit.panel(ctx, 60, 298, 520, 40, 'dark');
    pixelTextOutlined(ctx, touch ? 'TAP FIRE. LET THE OTTER ANSWER.' : 'LEFT CLICK. LET THE OTTER ANSWER.',
      320, 304, 10, Math.floor(this.t * 2) % 2 ? '#ffe48f' : '#ffffff', '#14141c', 'center');
    pixelText(ctx, touch ? 'Helm to swim   SHIELD to parry   ROLL to dash'
                         : 'WASD swim   SPACE roll   E / right-click shield   TAB skill tree',
      320, 320, 6, '#9ab0c0', 'center');
  },
};

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
