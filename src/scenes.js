// ---- Cinematic intro, dialogue, end screens -----------------------------
const Intro = {
  t: 0, done: false, drops: [], bubbles: [], shakeT: 0, splashed: false,
  lines: [
    'The boat never even slowed down.',
    'Mom was still singing when the propeller found her.',
    'Three days later an otter found me. He said he knew the village those boats came from.',
    'He also said he had a gun.',
  ],
  reset() { this.t = 0; this.done = false; this.drops = []; this.bubbles = []; this.splashed = false; },
  update(dt) {
    this.t += dt; this.shakeT -= dt;
    if (this.t > 0.8 && (Input.anyKey || Input.mouse.clicked)) { this.done = true; return; }
    if (this.t > 0.55 && this.t < 0.6) this.shakeT = 0.25;
    for (let i = this.drops.length - 1; i >= 0; i--) { const d = this.drops[i]; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 300 * dt; d.life -= dt; if (d.life <= 0) this.drops.splice(i, 1); }
    for (let i = this.bubbles.length - 1; i >= 0; i--) { const b = this.bubbles[i]; b.y -= b.s * dt; b.x += Math.sin(this.t * 3 + b.ph) * 10 * dt; if (b.y < -10) this.bubbles.splice(i, 1); }
    if (this.t > 10.2 && Math.random() < 0.6) this.bubbles.push({ x: rand(0, 640), y: 380, s: rand(30, 90), ph: rand(0, TAU), r: randi(1, 4) });
    if (this.t > 12.4) this.done = true;
  },
  jumpPos() {
    // leap from cliff edge (150,150) to water (330,262)
    const k = clamp((this.t - 9.0) / 1.15, 0, 1);
    const x = lerp(140, 330, k), y = lerp(150, 262, k) - Math.sin(k * Math.PI) * 70;
    return { x, y, k };
  },
  render(ctx) {
    const t = this.t;
    ctx.save();
    if (this.shakeT > 0) ctx.translate(rand(-4, 4), rand(-4, 4));
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, 200); sky.addColorStop(0, '#2a1a4a'); sky.addColorStop(0.55, '#c0503a'); sky.addColorStop(1, '#f2a05a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 640, 200);
    // sun
    ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(470, 178, 34, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2a05a'; for (let i = 0; i < 4; i++) ctx.fillRect(430, 160 + i * 10, 80, 3);
    // distant village silhouettes on the horizon
    ctx.fillStyle = '#3a1f30';
    const huts = [520, 548, 575, 600, 622]; huts.forEach((x, i) => { ctx.fillRect(x, 186, 20, 10); ctx.beginPath(); ctx.moveTo(x - 2, 186); ctx.lineTo(x + 10, 178); ctx.lineTo(x + 22, 186); ctx.fill(); if (Math.floor(t * 3 + i) % 4 !== 0) { ctx.fillStyle = '#ffe48f'; ctx.fillRect(x + 8, 190, 3, 3); ctx.fillStyle = '#3a1f30'; } });
    ctx.fillRect(500, 194, 140, 4); // dock line
    for (let i = 0; i < 5; i++) { ctx.fillRect(505 + i * 26, 190, 14, 5); }
    // sea with posterized wave bands
    for (let y = 196; y < 360; y += 2) {
      const depth = (y - 196) / 164;
      const wave = Math.sin(y * 0.3 + t * 2) + Math.sin(y * 0.11 - t * 1.3);
      const shade = Math.floor((wave + 2) / 4 * 3);
      const cols = depth < 0.15 ? ['#6f4a6a', '#8a5c78', '#c08a7a'] : depth < 0.5 ? ['#1d4a7a', '#245a90', '#3a7ab0'] : ['#123a66', '#174a7e', '#1d5a96'];
      ctx.fillStyle = cols[shade]; ctx.fillRect(0, y, 640, 2);
      if (shade === 2 && hash2(y, Math.floor(t * 4)) > 0.7) { ctx.fillStyle = '#ffd7a0'; const sx = (hash2(y, 7) * 640 + t * 20) % 640; ctx.fillRect(sx, y, 14, 1); }
    }
    // cliff (left)
    ctx.fillStyle = '#2a2430'; ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(120, 148); ctx.lineTo(170, 160); ctx.lineTo(190, 200); ctx.lineTo(200, 260); ctx.lineTo(175, 300); ctx.lineTo(160, 360); ctx.lineTo(0, 360); ctx.fill();
    ctx.fillStyle = '#3d3545'; ctx.beginPath(); ctx.moveTo(0, 152); ctx.lineTo(118, 150); ctx.lineTo(160, 165); ctx.lineTo(150, 200); ctx.lineTo(0, 210); ctx.fill();
    ctx.fillStyle = '#4f8f5a'; ctx.fillRect(0, 146, 122, 5); ctx.fillStyle = '#6fd88e'; for (let i = 0; i < 12; i++) ctx.fillRect(i * 11, 144 + (i % 2), 3, 3);
    // foam where waves hit the cliff
    ctx.fillStyle = `rgba(230,246,255,${(0.5 + Math.sin(t * 3) * 0.3).toFixed(2)})`; ctx.fillRect(170, 258 + Math.sin(t * 3) * 3, 40, 3); ctx.fillRect(185, 280 + Math.cos(t * 2.5) * 3, 30, 2);
    // characters
    const rigOpts = (aim, roll, exp) => ({
      t, aim, facing: 1, tilt: 0, swimPhase: t * 2.5, rollPhase: roll,
      hurt: false, exp, rage: false, recoil: 0, flash: 0,
      speed: 0, armored: true, gunSprite: SP.guns.revolver,
    });
    if (t < 9.0) {
      // the pair waiting on the cliff edge; the otter hops aboard at the end
      const mx = 120, my = 140;
      ctx.save(); ctx.translate(mx, my); ctx.scale(1.15, 1.15);
      Rig.draw(ctx, 0, 0, Object.assign(rigOpts(-0.25, null, t > 7.6 ? 'angry' : 'idle'), { riderHidden: t < 8.5 }));
      ctx.restore();
      if (t < 8.5) {
        // the otter is still standing beside him, pacing and checking the gun
        let ox = 62, oy = 128;
        if (t > 8.2) { const k = clamp((t - 8.2) / 0.3, 0, 1); ox = lerp(62, mx + 4, k); oy = lerp(128, my - 14, k) - Math.sin(k * Math.PI) * 26; }
        else if (t > 7.6) oy = 128 - Math.abs(Math.sin((t - 7.6) * 10)) * 7;
        ctx.save(); ctx.translate(ox, oy); ctx.scale(1.5, 1.5);
        ctx.drawImage(CH.otterTail.c, -16, 2);
        ctx.drawImage(CH.otterTorso.c, -CH.otterTorso.ax, -CH.otterTorso.ay);
        const hd = otterHeadWithFace(t > 7.6 ? 'angry' : 'idle', Rig.blink, t, false);
        ctx.drawImage(hd, -CH.otterHead.ax, -CH.otterHead.ay - 9);
        ctx.drawImage(SP.guns.revolver.c, 4, -2);
        ctx.restore();
      }
    } else if (t < 10.6) {
      const j = this.jumpPos();
      const rot = j.k * 1.25;
      const sink = Math.max(0, t - 10.1) * 90;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 640, 264); ctx.clip();
      ctx.save(); ctx.translate(j.x, j.y + sink); ctx.rotate(rot); ctx.scale(1.15, 1.15);
      Rig.draw(ctx, 0, 0, rigOpts(-0.3, null, 'angry'));
      ctx.restore(); ctx.restore();
      if (j.k >= 0.96 && !this.splashed) {
        this.splashed = true; Audio_.splash(3); this.shakeT = 0.3;
        for (let i = 0; i < 110; i++) {
          const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(60, 320);
          this.drops.push({ x: 330 + rand(-14, 14), y: 262, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.6, 1.5), c: Math.random() < 0.3 ? '#8ac6ff' : '#eaf8ff' });
        }
      }
    }
    // splash column
    if (this.splashed && t < 10.9) {
      const k = (t - 10.1) / 0.8, h = Math.sin(Math.min(1, k) * Math.PI) * 74;
      for (let i = 0; i < 6; i++) {
        const w = Math.round(30 - i * 4.5), hh = Math.round(h * (0.35 + i * 0.13));
        ctx.fillStyle = i % 2 ? 'rgba(138,198,255,0.85)' : 'rgba(234,248,255,0.92)';
        ctx.fillRect(330 - (w >> 1) + Math.round(Math.sin(t * 30 + i) * 1.5), 262 - hh, w, hh);
      }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(327, 262 - Math.round(h), 6, 3);
    }
    // splash droplets & foam
    for (const d of this.drops) { ctx.fillStyle = d.c; ctx.fillRect(Math.round(d.x), Math.round(d.y), 2, 2); }
    if (this.splashed && t < 11) { const k = Math.max(0, t - 10.1); ctx.strokeStyle = `rgba(230,246,255,${Math.max(0, 0.9 - k).toFixed(2)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(330, 264, 20 + k * 120, 6 + k * 30, 0, 0, TAU); ctx.stroke(); }
    // dive: water rises to fill the screen
    if (t > 10.0) {
      const k = clamp((t - 10.0) / 1.4, 0, 1);
      ctx.fillStyle = `rgba(14,60,120,${(k * 0.95).toFixed(2)})`; ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = `rgba(8,30,80,${(k * 0.6).toFixed(2)})`; ctx.fillRect(0, 360 - k * 360, 640, k * 360);
      for (const b of this.bubbles) { ctx.strokeStyle = 'rgba(220,245,255,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(b.x), Math.round(b.y), b.r, b.r); }
      if (t > 11.6) { const f = clamp((t - 11.6) / 0.8, 0, 1); ctx.fillStyle = `rgba(0,0,0,${f.toFixed(2)})`; ctx.fillRect(0, 0, 640, 360); }
    }
    // title
    if (t > 0.5) {
      const k = clamp((t - 0.5) / 0.15, 0, 1);
      const ty = lerp(-40, 14, k);
      pixelText(ctx, 'MANATEE', 320, ty, 30, '#e6f2ff', 'center');
      if (t > 0.9) pixelText(ctx, 'VS', 320, ty + 30, 14, '#ff6161', 'center');
      if (t > 1.2) { const k2 = clamp((t - 1.2) / 0.15, 0, 1); pixelText(ctx, 'BOATS', 320, lerp(-40, ty + 44, k2), 30, '#ffe48f', 'center'); }
    }
    // story lines typed out
    if (t > 3 && t < 9.8) {
      const idx = Math.min(this.lines.length - 1, Math.floor((t - 3) / 1.6));
      const line = this.lines[idx], lt = (t - 3 - idx * 1.6);
      const n = Math.min(line.length, Math.floor(lt * 45));
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 306, 640, 24);
      pixelText(ctx, line.slice(0, n), 320, 312, 9, '#fff', 'center');
    }
    if (t > 8.3 && t < 10) pixelText(ctx, '"Let\'s go get them."', 320, 290, 8, '#ffe48f', 'center');
    if (t > 0.8 && Math.floor(t * 2) % 2 === 0) pixelText(ctx, 'press any key to skip', 634, 350, 6, '#889', 'right');
    ctx.restore();
  },
};

const Dialogue = {
  t: 0, text: 'Oh, a manatee! Free meat for tonight!', done: false, shotFired: false,
  reset() { this.t = 0; this.done = false; this.shotFired = false; },
  update(dt) { this.t += dt; if (this.t > 3) this.done = true; },
  render(ctx, cam) {
    const f = G.fisherman; if (!f || !f.alive) return;
    const sx = Math.round(f.x - cam.x), sy = Math.round(f.y - cam.y);
    if (this.t > 0.6) {
      const n = Math.min(this.text.length, Math.floor((this.t - 0.6) * 30));
      ctx.font = 'bold 7px monospace'; const w = ctx.measureText(this.text).width + 10;
      const bx = clamp(sx - w / 2, 4, 636 - w), by = sy - 52;
      ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, w, 16); ctx.fillStyle = '#14141c'; ctx.fillRect(bx - 1, by + 1, w + 2, 14); ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, w, 16);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(sx - 4, by + 16); ctx.lineTo(sx + 4, by + 16); ctx.lineTo(sx, by + 22); ctx.fill();
      pixelText(ctx, this.text.slice(0, n), bx + 5, by + 4, 7, '#14141c', 'left', false);
    }
    if (this.done) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 300, 640, 30);
      pixelText(ctx, Math.floor(this.t * 2) % 2 ? '[LEFT CLICK]  Let the otter answer.' : '[LEFT CLICK]  Let the otter answer.', 320, 306, 10, '#ffe48f', 'center');
      pixelText(ctx, 'WASD move   SPACE roll   E / right-click absorb   TAB workshop', 320, 319, 6, '#aab', 'center');
    }
  },
};

function drawEndScreen(ctx, t, win) {
  ctx.fillStyle = win ? 'rgba(10,30,20,0.85)' : 'rgba(30,5,10,0.85)'; ctx.fillRect(0, 0, 640, 360);
  const s = G.stats;
  if (win) {
    pixelText(ctx, 'FISHER VILLAGE', 320, 40, 22, '#ffe48f', 'center');
    pixelText(ctx, 'LIBERATED', 320, 66, 26, '#6fd88e', 'center');
    pixelText(ctx, 'The Chief sank with his shark. The boats will not fish here again.', 320, 100, 8, '#fff', 'center');
    pixelText(ctx, 'Next destination: THE CANNERY  (the manatee is not done)', 320, 114, 7, '#8ac6ff', 'center');
  } else {
    pixelText(ctx, 'THE SEA TAKES ANOTHER', 320, 50, 22, '#ff6161', 'center');
    pixelText(ctx, 'The otter drags you back to the reef. Your scrap and upgrades are kept.', 320, 84, 8, '#fff', 'center');
    pixelText(ctx, 'Spend them wisely. Strategy, not luck.', 320, 98, 7, '#ffe48f', 'center');
  }
  const rows = [['Time survived', fmtTime(G.director.time)], ['Boats sunk', s.kills], ['Attacks absorbed', s.absorbs], ['Boss crashes into rocks', s.bossCrashes], ['Damage dealt', Math.round(s.damageDealt)], ['Damage taken', Math.round(s.damageTaken)], ['Scrap collected', s.scrapCollected], ['Upgrades owned', G.tree.unlocked.size + '/' + SKILL_NODES.length]];
  rows.forEach(([k, v], i) => { pixelText(ctx, k, 250, 140 + i * 13, 8, '#aab', 'right'); pixelText(ctx, v + '', 270, 140 + i * 13, 8, '#fff', 'left'); });
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 300, 640, 30);
  pixelText(ctx, '[R] ' + (win ? 'Play again with your build' : 'Rematch (keep upgrades)') + '        [TAB] Workshop', 320, 306, 10, Math.floor(t * 2) % 2 ? '#fff' : '#ffe48f', 'center');
  pixelText(ctx, 'Made in the bay. Manatee vs Boats.', 320, 320, 6, '#889', 'center');
}
