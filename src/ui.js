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

// ---------------------------------------------------------------------------
//  Small pictures that used to be sentences.
//  The HUD says what the wave wants with an icon and a number instead of a
//  line of prose, so these are the vocabulary it speaks in.
// ---------------------------------------------------------------------------
const HUD_SP = {
  boat: makeSprite([
    '..k.....',
    '.kwk....',
    'kwwk....',
    'kwwwk...',
    'kkkkkkk.',
    'kUTTTTk.',
    '.kkkkk..',
    '........'], { ax: 4, ay: 4 }),
  // what is left of you, as a drop of blood. The cartoon heart that used to
  // sit here was the last soft thing on the HUD.
  vital: makeSprite([
    '..kk..',
    '..kk..',
    '.kRRk.',
    'kRrrRk',
    'kRrrqk',
    '.kqqk.'], { ax: 3, ay: 3 }),
  target: makeSprite([
    '...kk...',
    '.kkRRkk.',
    '.kR..Rk.',
    'kkR..Rkk',
    'kkR..Rkk',
    '.kR..Rk.',
    '.kkRRkk.',
    '...kk...'], { ax: 4, ay: 4 }),
};
// the two of them, eight pixels each, so a bubble can say who is talking
// without spending a word on it
const FACE_SP = {
  o: makeSprite([
    '.k....k.',
    'kBk..kBk',
    '.kBBBBk.',
    'kBBBBBBk',
    'kBwBBwBk',
    'kcccccck',
    '.kcKKck.',
    '..kkkk..'], { ax: 0, ay: 0 }),
  m: makeSprite([
    '..kkkk..',
    '.kGGGGk.',
    'kGGGGGGk',
    'kGwGGwGk',
    'kGGGGGGk',
    'kGhhhhGk',
    '.khkkhk.',
    '..kkkk..'], { ax: 0, ay: 0 }),
};
// hard little punctuation that jumps out of a bubble. There is nothing fond
// in here: a skull, a drop of blood, crossed cutlasses, and a bang.
const EMO_SP = {
  skull: makeSprite(['.kkkk.', 'kwwwwk', 'kKwwKk', 'kwwwwk', '.kwwk.', '.kKKk.'], { ax: 0, ay: 0 }),
  blood: makeSprite(['..k..', '..k..', '.kRk.', 'kRrqk', '.kqk.'], { ax: 0, ay: 0 }),
  cutlass: makeSprite(['Mk....kM', 'kMk..kMk', '.kMkkMk.', '..kMMk..', '..kMMk..', '.kMkkMk.', 'kTk..kTk', 'Tk....kT'], { ax: 0, ay: 0 }),
  bang: makeSprite(['.k.', 'kRk', 'kRk', 'kRk', '.k.', 'kRk', '.k.'], { ax: 0, ay: 0 }),
};
// waves.js still asks for the sweet old set by name. Nothing soft survives,
// so those names land on this art instead - a heart draws a skull now.
const EMO_ALIAS = { heart: 'skull', spark: 'cutlass', note: 'blood' };
function emoSprite(k) { return EMO_SP[k] || EMO_SP[EMO_ALIAS[k]] || null; }

// ---------------------------------------------------------------------------
//  BANTER
//  The wall of instructions is gone; the pair say the same things to each
//  other instead. The otter is a scrappy little killer and will not shut up,
//  the manatee answers in about three words and means every one of them.
//  One bubble at a time, short, over their heads, and never more often than
//  the fight can carry.
//
//  Lines are ['o'|'m', text, emote?]. A topic is a list of them.
// ---------------------------------------------------------------------------
const BANTER = {
  // a wave with nothing to say of its own falls back to these; the lines that
  // belong to a particular wave live next to that wave, in waves.js
  wave: [
    [['o', 'Fresh meat!'], ['m', 'Sink them.']],
    [['o', 'More boats.'], ['m', 'More bodies.']],
  ],
  cleared: [
    [['o', 'Water is ours!', 'cutlass'], ['m', 'And it is red.']],
    [['o', 'That is the lot.'], ['m', 'Let them sink.']],
    [['o', 'Butchered them!'], ['m', 'It was close.', 'blood']],
    [['o', 'Nice ramming.'], ['m', 'Nice butchery.', 'skull']],
  ],
  last: [[['o', 'Only the Chief left.'], ['m', 'He drowns next.']]],
  big: [
    [['o', 'Big one!', 'bang'], ['m', 'It bleeds too.']],
    [['o', 'Look at the size!'], ['m', 'Gut it anyway.']],
  ],
  objdone: [
    [['o', 'Done! Butchered!', 'cutlass'], ['m', 'Run them down.']],
  ],
  hurt: [
    [['o', 'You are bleeding!', 'blood'], ['m', 'So will they.']],
    [['o', 'Too close! Too close!'], ['m', 'Turn. Ram them.']],
  ],
  netted: [
    [['o', 'Net! Cut it! Roll!', 'bang']],
    [['o', 'Tangled! Tear it!', 'bang']],
  ],
  parry: [
    [['o', 'Back in your teeth!']],
    [['o', 'Ha! Choke on it.']],
    [['o', 'Eat your own steel!']],
  ],
  ready: [
    [['o', 'Let me off the chain.', 'skull']],
  ],
  rampage: [
    [['o', 'RAAAAH!', 'bang'], ['m', 'Kill.']],
  ],
  firstkill: [
    [['o', 'First blood!'], ['m', 'More.']],
  ],
  shop: [
    [['o', 'Plunder! New teeth!', 'cutlass'], ['m', 'After the killing.']],
  ],
  // she has gone belly-up and he is in the water on his own
  downed: [
    [['o', 'GET UP, you cow!', 'blood']],
    [['o', 'Nobody kills her but me!', 'cutlass']],
    [['o', 'Right. My turn.', 'skull']],
  ],
  revived: [
    [['m', 'Again.'], ['o', 'Never do that again.']],
    [['m', 'Who bleeds now.'], ['o', 'That is my girl!', 'skull']],
  ],
  idle: [
    [['o', 'My favourite warship.', 'skull'], ['m', 'Not a ship.']],
    [['o', 'Good day for killing.'], ['m', 'Mm.', 'blood']],
    [['o', 'You smell like blood.'], ['m', 'You too.', 'blood']],
    [['o', 'Any more of them?'], ['m', 'A whole village.']],
  ],
};
// How loudly each topic asks to be heard, and how long before it may repeat.
// The start of a wave and a net round the fluke are the two things allowed to
// cut somebody off mid-sentence.
const BANTER_PRI = { downed: 9, revived: 8, netted: 6, wave: 5, hurt: 4, rampage: 4, big: 4, cleared: 4, last: 4, objdone: 3, firstkill: 2, ready: 2, parry: 1, shop: 1, idle: 0 };
const BANTER_GAP = { downed: 0, revived: 0, netted: 12, hurt: 18, rampage: 20, big: 8, wave: 0, cleared: 0, last: 0, objdone: 0, firstkill: 999, parry: 22, ready: 45, shop: 90, idle: 34 };

const Banter = {
  cur: null, queue: [], pri: -1, cool: 0, last: {}, t: 0, idleT: 0, pick: {},
  // ---- driving it
  reset() { this.cur = null; this.queue = []; this.pri = -1; this.cool = 0; this.last = {}; this.idleT = 0; },
  // one exchange. kind picks the pool; opts.idx picks a fixed entry, opts.lines
  // hands the lines over directly. Returns true if it got the floor.
  say(kind, opts) {
    opts = opts || {};
    const pool = BANTER[kind];
    let topic = opts.lines;
    if (!topic && pool) topic = opts.idx != null ? pool[clamp(opts.idx, 0, pool.length - 1)] : this.rotate(kind, pool);
    if (!topic || !topic.length) return false;
    // she is face-down in the water: she has nothing to say until he gets her up
    if (typeof G !== 'undefined' && G && G.player && G.player.downed && topic.some(l => l[0] === 'm')) return false;
    const pri = opts.pri != null ? opts.pri : (BANTER_PRI[kind] || 0);
    const gap = BANTER_GAP[kind] != null ? BANTER_GAP[kind] : 20;
    // a topic that just ran keeps quiet; a quiet topic waits for the floor
    if (this.last[kind] != null && this.t - this.last[kind] < gap) return false;
    if (this.cur && pri <= this.pri) return false;
    if (!this.cur && this.cool > 0 && pri < 3) return false;
    this.last[kind] = this.t;
    this.pri = pri; this.kind = kind; this.topic = topic;
    this.queue = topic.slice(1);
    this.start(topic[0], opts.delay || 0);
    this.idleT = 0;
    return true;
  },
  // walk a pool instead of rolling dice, so you never hear the same joke twice
  rotate(kind, pool) {
    const i = (this.pick[kind] == null ? Math.floor(Math.random() * pool.length) : this.pick[kind] + 1) % pool.length;
    this.pick[kind] = i;
    return pool[i];
  },
  start(line, delay) {
    const text = line[1];
    this.cur = {
      who: line[0], text, emo: line[2] || null,
      t: -(delay || 0), chars: 0,
      dur: clamp(0.9 + text.length * 0.045, 1.25, 2.6),
      seed: Math.random() * 10,
    };
    this.layout(this.cur);
  },
  layout(b) {
    const lines = wrapText(null, b.text, 134, 6);
    b.lines = lines.slice(0, 2);
    b.full = b.lines.join(' ').length;
    let tw = 0; for (const l of b.lines) tw = Math.max(tw, textWidth(l, 6));
    b.w = clamp(tw + 22, 44, 158);
    b.h = b.lines.length * 9 + 9;
  },
  update(dt) {
    // Real time, not game time. The HUD stops being drawn in the skill tree,
    // in a cutscene and on pause, and half an exchange should not wake up a
    // minute later in the middle of something else.
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    if (this._rt && now - this._rt > 0.75) {
      // the beats worth hearing in full get said again on the other side of
      // whatever interrupted them; everything smaller is simply dropped
      const again = this.cur && (this.kind === 'wave' || this.kind === 'cleared' || this.kind === 'last') ? { kind: this.kind, topic: this.topic } : null;
      this.cur = null; this.queue.length = 0; this.pri = -1; this.cool = 0.6;
      if (again) { this.last[again.kind] = null; this.say(again.kind, { lines: again.topic, delay: 0.8 }); }
    }
    this._rt = now;
    this.t += dt;
    if (this.cool > 0) this.cool -= dt;
    const b = this.cur;
    if (!b) { this.idleT += dt; return; }
    b.t += dt;
    if (b.t > 0.16) b.chars = Math.min(b.full, b.chars + dt * 52);
    // a line holds for its duration once it has finished typing
    const typed = b.chars >= b.full;
    if (typed && b.t > b.dur) {
      if (this.queue.length) this.start(this.queue.shift(), 0.12);
      else { this.cur = null; this.pri = -1; this.cool = 2.2; this.idleT = 0; }
    }
  },
  // ---- the bubble itself
  // Not a bubble any more: a scrap torn off somebody's sail, nailed up over
  // their heads, with the blood still on it.
  draw(ctx, t) {
    const b = this.cur; if (!b || b.t < 0) return;
    const p = G.player; if (!p || p.dead) return;
    const sp = G.worldToScreen(p.x, p.y);
    // slams out, holds, drops away. A hair past full and then hard down -
    // no spring, nothing bounces here
    const fade = Math.max(0, b.dur + (b.full - b.chars) / 52 - b.t);
    let k = b.t < 0.13 ? slamIn(b.t / 0.13) : fade < 0.12 ? fade / 0.12 : 1;
    if (k <= 0.02) return;
    k = clamp(k, 0.02, 1.08);
    const W = Math.max(8, Math.round(b.w * k)), H = Math.max(6, Math.round(b.h * k));
    // the otter leans over her right shoulder, the manatee speaks from below.
    // A slow heavy sway, like something hung up to dry.
    const bob = Math.round(Math.sin(t * 1.7 + b.seed));
    const ax = Math.round(sp.x + (b.who === 'o' ? 14 : -14));
    let ay = Math.round(sp.y - 40 + bob);
    let x = clamp(Math.round(ax - W / 2), 4, 636 - W);
    let below = false;
    if (ay - H < 52) { ay = Math.round(sp.y + 46 + bob); below = true; }
    const y = below ? ay : ay - H;
    const o = b.who === 'o';
    // his is sun-bleached canvas off a hull, hers is wet grey tarpaulin.
    // Both have been used for something other than talking.
    const ink = o ? '#150d08' : '#0a0f14';
    const fill = o ? '#9c8261' : '#7f8a95';
    const hi = o ? '#b9a179' : '#9fabb4';
    const sh = o ? '#5e4c31' : '#4d5761';
    const txt = o ? '#1d1108' : '#101720';
    const gore = o ? '#7c1414' : '#5f1016';
    // spike first, so the scrap's ink covers its root
    ragTail(ctx, ink, sh, clamp(ax, x + 6, x + W - 7), below ? y : y + H - 1, below ? -1 : 1);
    scrapPanel(ctx, ink, fill, hi, sh, gore, x, y, W, H, b.seed);
    if (k < 0.995) return;                       // words only once it has settled
    // who is talking, as a face and not a name
    const f = FACE_SP[b.who];
    ctx.drawImage(f.c, x + 3, b.lines.length > 1 ? y + 4 : y + Math.round((H - 8) / 2));
    let shown = Math.floor(b.chars), tx = x + 14;
    for (let i = 0; i < b.lines.length; i++) {
      const l = b.lines[i];
      const cut = l.slice(0, Math.max(0, shown));
      if (cut) pixelText(ctx, cut, tx, y + 4 + i * 9, 6, txt, 'left', false);
      shown -= l.length + 1;
      if (shown <= 0) break;
    }
    // a skull, a drop of blood or a pair of cutlasses jumps out of the corner
    if (b.emo && b.chars >= b.full) {
      const e = emoSprite(b.emo);
      if (e) {
        const hop = Math.round(Math.abs(Math.sin(t * 4 + b.seed)) * 2);
        ctx.drawImage(e.c, x + W - 4, y - 3 - hop);
      }
    }
  },
};
// a slam: out fast, a pixel past full, then straight down onto it
function slamIn(x) {
  x = clamp(x, 0, 1);
  if (x < 0.75) { const u = x / 0.75; return (1 - (1 - u) * (1 - u)) * 1.08; }
  return 1.08 - (x - 0.75) / 0.25 * 0.08;
}
// a hand-rasterised rounded rectangle: hard edges, no arc(), no antialiasing
function roundFill(ctx, col, x, y, w, h, rad) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = col;
  const r = Math.min(rad, Math.floor(Math.min(w, h) / 2));
  for (let i = 0; i < h; i++) {
    const d = Math.min(i, h - 1 - i);
    const ins = d >= r ? 0 : r - d - 1;
    ctx.fillRect(x + ins, y + i, w - ins * 2, 1);
  }
}
// The scrap: chewed corners, a bite out of an edge here and there, a bleached
// top, a wet dark sill, two nails and the blood somebody wiped off on it.
// One fill per row, integers only, no arc(), nothing soft.
function scrapPanel(ctx, ink, fill, hi, sh, gore, x, y, w, h, seed) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 8 || h < 6) { ctx.fillStyle = ink; ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h)); return; }
  for (let i = 0; i < h; i++) {
    const edge = (i === 0 || i === h - 1) ? 2 : (i === 1 || i === h - 2) ? 1 : 0;
    const l = edge + bite(seed, i), r = edge + bite(seed + 7.3, i);
    const ww = w - l - r;
    if (ww < 3) continue;
    ctx.fillStyle = ink; ctx.fillRect(x + l, y + i, ww, 1);
    if (i === 0 || i === h - 1) continue;
    ctx.fillStyle = i <= 2 ? hi : i >= h - 3 ? sh : fill;
    ctx.fillRect(x + l + 1, y + i, ww - 2, 1);
  }
  // two nail heads holding it up
  ctx.fillStyle = '#2b2f36'; ctx.fillRect(x + 3, y + 2, 2, 2); ctx.fillRect(x + w - 5, y + 2, 2, 2);
  ctx.fillStyle = '#7a8492'; ctx.fillRect(x + 3, y + 2, 1, 1); ctx.fillRect(x + w - 5, y + 2, 1, 1);
  // worn through along the lip, filthy along the sill
  const n = seed * 1000 | 0;
  ctx.fillStyle = fill; ctx.fillRect(x + 8 + n % Math.max(1, w - 22), y + 1, 2, 1);
  ctx.fillStyle = ink; ctx.fillRect(x + 6 + (n >> 3) % Math.max(1, w - 16), y + h - 2, 3, 1);
  // and the blood: dried into the foot of it, and one drip still going
  ctx.fillStyle = gore;
  ctx.fillRect(x + 6, y + h - 3, 3, 1); ctx.fillRect(x + 7, y + h - 2, 1, 1);
  ctx.fillRect(x + w - 10, y + h - 4, 2, 1); ctx.fillRect(x + w - 9, y + h - 3, 4, 1);
  const dx = x + 5 + (n >> 6) % Math.max(1, (w >> 2));
  ctx.fillRect(dx, y + h, 1, 2); ctx.fillRect(dx, y + h + 3, 1, 1);
}
// how far this row has been torn back. Stable per scrap and per row, so it
// does not crawl about while it hangs there.
function bite(seed, i) {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  const f = v - Math.floor(v);
  return f > 0.88 ? 2 : f > 0.58 ? 1 : 0;
}
// the spike under a scrap, pointing at whoever said it. Torn, not curved.
function ragTail(ctx, ink, fill, px, py, dir) {
  px = Math.round(px); py = Math.round(py);
  const TW = [7, 5, 3, 1];
  for (let j = 0; j < TW.length; j++) {
    const w = TW[j], hx = px - (w >> 1);
    ctx.fillStyle = ink; ctx.fillRect(hx - 1, py + j * dir, w + 2, 1);
    if (w > 1) { ctx.fillStyle = fill; ctx.fillRect(hx, py + j * dir, w, 1); }
  }
}

const UI = {
  banner: null, hover: null, treeTab: 0, notify: 0,
  banter: Banter,
  hpGhost: 1, _lt: 0, _seen: {},
  // The one hook anything outside this file needs:
  //   UI.banterEvent(kind, opts)  ->  bool, true if the pair took the floor
  banterEvent(kind, opts) { return Banter.say(kind, opts); },
  // ------------------------------------------------------------- HUD
  drawHUD(ctx, t) {
    const p = G.player, st = p.stats;
    const touch = typeof MobileUI !== 'undefined' && MobileUI.enabled;
    // the HUD is the only thing running every frame in every play state, so it
    // keeps its own clock rather than asking game.js for one
    const dt = clamp(t - this._lt, 0, 0.1); this._lt = t;
    this.watch(dt, t);
    Banter.update(dt);

    // ---------- top-left: vitals ----------
    // A bar says how hurt you are better than a number does, so the number is
    // gone. So are the control reminders: the otter says those out loud now.
    const PW = 126, PH = touch ? 32 : 42;
    UIKit.panel(ctx, 2, 2, PW, PH, 'dark');
    const hpk = clamp(p.hp / st.maxHp, 0, 1);
    // the ghost trails the real value so a big hit reads as a wound, not a jump
    this.hpGhost = this.hpGhost > hpk ? Math.max(hpk, this.hpGhost - dt * 0.55) : lerp(this.hpGhost, hpk, 0.25);
    // with her down the panel is his: how long she has left, and his pips
    if (p.downed && p.body && p.ot) this.drawDownedPanel(ctx, t, p, touch);
    else {
    drawSprite(ctx, HUD_SP.vital, 13, 12);
    UIKit.bar(ctx, 20, 7, 100, 10, hpk, hpk > 0.5 ? '#6fd88e' : hpk > 0.25 ? '#ffe48f' : '#ff6161', '#1b2028');
    // the wound the bar has not caught up with yet, painted inside the frame
    const gx = 22 + Math.round(96 * hpk), gw = Math.round(96 * clamp(this.hpGhost, 0, 1)) - Math.round(96 * hpk);
    if (gw > 0) { ctx.fillStyle = '#8e2026'; ctx.fillRect(gx, 9, gw, 6); ctx.fillStyle = '#c8302e'; ctx.fillRect(gx, 9, gw, 2); }
    if (p.hurt > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(22, 9, Math.round(96 * hpk), 6); }

    drawSprite(ctx, GLYPH_SP.rampage, 13, 24);
    const full = p.rampage.meter >= 100 && !p.rampage.active;
    const rk = p.rampage.active ? 1 - p.rampage.t / p.rampage.dur : p.rampage.meter / 100;
    UIKit.bar(ctx, 20, 20, 100, 8, clamp(rk, 0, 1),
      p.rampage.active ? (Math.floor(t * 10) % 2 ? '#ff6161' : '#ffe48f') : full ? (Math.floor(t * 4) % 2 ? '#ff6161' : '#ff9a3c') : '#c8302e', '#1b2028');
    if (p.rampage.active || full) pixelTextOutlined(ctx, p.rampage.active ? 'RAMPAGE' : 'READY', 70, 21, 5, '#ffffff', '#14141c', 'center');

    if (!touch) {
      // roll charges as pips, parry as a bar. No words: the pips fill up and
      // that is the whole of it.
      for (let i = 0; i < st.rollCharges; i++) {
        const on = i < p.roll.charges;
        ctx.fillStyle = '#14141c'; ctx.fillRect(20 + i * 8, 31, 7, 7);
        ctx.fillStyle = on ? '#6fd88e' : '#2c3440'; ctx.fillRect(21 + i * 8, 32, 5, 5);
        if (on) { ctx.fillStyle = '#b6f5cd'; ctx.fillRect(21 + i * 8, 32, 5, 2); }
      }
      if (p.roll.charges < st.rollCharges) {
        const k = 1 - p.roll.rechargeT / p.cd(2.4 * st.rollCd);
        ctx.fillStyle = '#6fd88e'; ctx.fillRect(21 + p.roll.charges * 8, 37, Math.round(5 * clamp(k, 0, 1)), 1);
      }
      const shx = 24 + st.rollCharges * 8;
      drawSprite(ctx, GLYPH_SP.absorb, shx + 4, 34);
      const acd = p.absorb.cd > 0 ? 1 - p.absorb.cd / p.cd(st.absorbCd) : 1;
      UIKit.bar(ctx, shx + 10, 31, PW - shx - 10, 7, clamp(acd, 0, 1), p.absorb.active ? '#ffffff' : acd >= 1 ? '#8ac6ff' : '#3f6f9f', '#1b2028');

      // unlocked abilities: the key you press and how cold it is. You bought
      // the thing, you know what it is called.
      let ax = 2; const ay = PH + 5;
      const ab = [];
      if (st.dive) ab.push(['SHIFT', p.dive.cd, p.cd(7), '#8ac6ff']);
      if (st.decoy) ab.push(['F', p.decoyCd, p.cd(14), '#ffe48f']);
      if (st.tidal) ab.push(['R', p.tidalCd, p.cd(12), '#6fd88e']);
      for (const [key, cd, max, col] of ab) {
        const w = Math.max(16, textWidth(key, 5) + 8);
        const k = cd > 0 ? 1 - cd / max : 1;
        roundFill(ctx, '#14141c', ax, ay, w, 14, 3);
        roundFill(ctx, k >= 1 ? '#2b3a4a' : '#1b222c', ax + 1, ay + 1, w - 2, 12, 2);
        pixelText(ctx, key, ax + Math.round(w / 2), ay + 2, 5, k >= 1 ? col : '#5d6f80', 'center');
        ctx.fillStyle = '#0d1018'; ctx.fillRect(ax + 2, ay + 10, w - 4, 2);
        ctx.fillStyle = k >= 1 ? col : '#7d8fa0'; ctx.fillRect(ax + 2, ay + 10, Math.round((w - 4) * clamp(k, 0, 1)), 2);
        ax += w + 3;
      }
    }
    }

    // ---------- top-centre: where you are, and what the wave wants ----------
    // Sixteen pips for sixteen waves, and one chip with an icon and a number.
    // The sentence that used to live here is said out loud instead.
    const d0 = G.director;
    if (d0.started) this.drawWaveDots(ctx, t, d0);
    if (d0.started && d0.state === 'fighting' && d0.objectiveStatus) {
      const ob = d0.objectiveStatus();
      if (ob) this.drawObjective(ctx, t, ob);
    }

    // ---------- boss bar ----------
    const b = G.boss;
    if (b && !b.dead) {
      UIKit.panel(ctx, 150, 30, 340, 22, 'dark');
      UIKit.bar(ctx, 156, 42, 328, 7, clamp(b.hp / b.maxHp, 0, 1), b.phase === 2 ? '#ff6161' : '#c8302e', '#1b2028');
      ctx.fillStyle = '#ffe48f'; ctx.fillRect(156 + 164, 41, 1, 9);
      pixelTextOutlined(ctx, b.name + (b.stunned ? ' - DOWN' : ''), 320, 32, 7, b.stunned ? '#ffe48f' : '#ffffff', '#14141c', 'center');
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
    // Numbers you actually spend. The [TAB] nagging is gone; the panel just
    // glows when there is something you can afford.
    const canBuy = SKILL_NODES.some(n => !G.tree.has(n.id) && G.tree.available(n) && G.tree.canAfford(n));
    const SW = 158, SX = 640 - SW - 2;
    UIKit.panel(ctx, SX, 2, SW, 24, 'dark');
    SCRAP_TYPES.forEach((k, i) => {
      const x = SX + 10 + i * 29;
      const v = G.tree.scrap[k];
      if (this._seen[k] == null) this._seen[k] = v;
      // a count that changes hops rather than flicking over
      let pop = 0;
      if (v !== this._seen[k]) { this._pop = this._pop || {}; this._pop[k] = 1; this._seen[k] = v; }
      if (this._pop && this._pop[k] > 0) { pop = Math.round(this._pop[k] * 3); this._pop[k] = Math.max(0, this._pop[k] - dt * 3.5); }
      drawSprite(ctx, SP.scrap[k], x + 4, 14 - pop);
      pixelTextOutlined(ctx, v + '', x + 11, 10 - pop, 7, SCRAP_COLORS[k], '#14141c');
    });
    if (canBuy) {
      const s = Math.floor(t * 3) % 2;
      ctx.drawImage(SP.star.c, SX - 5, s ? 5 : 6);
      ctx.fillStyle = s ? '#ffe48f' : '#8a6f36'; ctx.fillRect(SX + 2, 24, SW - 4, 1);
    }

    // ---------- bottom-left: the belt ----------
    // The gun the otter is holding is already on screen, so this is only here
    // to say which number key swaps to what. (Not while she is down: the gun
    // went under with her.)
    if (!touch && !p.downed) {
      const wl = G.tree.weaponsUnlocked();
      const CW = 26, CH = 21, y0 = 336;
      wl.forEach((k, i) => {
        const x = 4 + i * (CW + 2);
        const sel = G.tree.primary === k, side = G.tree.sidearm === k;
        this.beltT = this.beltT || {};
        const want = sel ? 1 : 0;
        this.beltT[k] = lerp(this.beltT[k] == null ? want : this.beltT[k], want, 0.25);
        const lift = Math.round(this.beltT[k] * 3);
        const yy = y0 - lift;
        roundFill(ctx, '#14141c', x, yy, CW, CH, 3);
        roundFill(ctx, sel ? '#e0b45c' : '#3a4450', x + 1, yy + 1, CW - 2, CH - 2, 2);
        roundFill(ctx, sel ? '#2a2014' : '#161d26', x + 2, yy + 2, CW - 4, CH - 4, 2);
        const g = SP.guns[k];
        ctx.save(); ctx.beginPath(); ctx.rect(x + 2, yy + 2, CW - 4, CH - 4); ctx.clip();
        ctx.drawImage(g.c, x + Math.max(2, Math.round((CW - g.w) / 2)), yy + 8 - Math.round(g.h / 2));
        ctx.restore();
        pixelText(ctx, (i + 1) + '', x + Math.round(CW / 2), yy + 11, 6, sel ? '#ffe9b0' : '#7d8fa0', 'center', false);
        if (side) { ctx.fillStyle = '#ffe48f'; ctx.fillRect(x + CW - 5, yy + 3, 3, 3); }
      });
    }

    // ---------- bottom-right: tally ----------
    const tally = G.stats.kills + '';
    const tw = textWidth(tally, 7) + 22;
    roundFill(ctx, '#14141c', 638 - tw, 338, tw, 18, 3);
    roundFill(ctx, '#232c38', 639 - tw, 339, tw - 2, 16, 2);
    drawSprite(ctx, SP.skull, 648 - tw, 347);
    pixelText(ctx, tally, 654 - tw, 342, 7, '#ffffff');

    // ---------- banner ----------
    // Kept for the beats that earn it (a boss, a wave cleared). The second
    // line of prose it used to carry is gone - the pair say it instead.
    if (this.banner) {
      const bn = this.banner, k = bn.t / bn.dur;
      const alpha = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.globalAlpha = alpha;
      UIKit.ribbon(ctx, 320, 62, bn.text, 'gold');
      ctx.globalAlpha = 1;
    }

    // ---------- between waves ----------
    const d = G.director;
    if (d.cleared && !G.boss && !d.lastWave) {
      // the ribbon already said WAVE CLEARED; this only has to say how to go on
      const pulse = Math.floor(t * 2) % 2;
      const label = touch ? 'TAP FOR THE NEXT WAVE' : '[ENTER] NEXT WAVE';
      const cw = textWidth(label, 8) + 28, cx = Math.round(320 - cw / 2);
      // low enough to keep off the pair, who are usually sitting mid-screen
      roundFill(ctx, '#14141c', cx, 302, cw, 22, 4);
      roundFill(ctx, pulse ? '#ffe48f' : '#e0b45c', cx + 1, 303, cw - 2, 20, 3);
      roundFill(ctx, '#2a2014', cx + 3, 305, cw - 6, 16, 3);
      pixelTextOutlined(ctx, label, 320, 308, 8, pulse ? '#ffffff' : '#ffe48f', '#14141c', 'center');
    }

    if (hpk < 0.3 && !p.downed) { ctx.fillStyle = `rgba(200,20,20,${(0.12 + Math.sin(t * 6) * 0.08).toFixed(2)})`; ctx.fillRect(0, 0, 640, 360); }
    // ---------- her, down: the revive ring on her, or an arrow to her ----------
    if (p.downed && p.body) this.drawDownedWorld(ctx, t, p);

    // ---------- the pair, talking ----------
    Banter.draw(ctx, t);
  },

  // ---- OVERBOARD. No words anywhere: a drop of her blood and a bar that
  // drains, his face and his pips, and a pip for the dash.
  drawDownedPanel(ctx, t, p, touch) {
    const b = p.body, o = p.ot;
    const k = clamp(b.bleed / b.bleedMax, 0, 1);
    // the drop beats with her heart
    const pop = b.beat > 0.55 ? 2 : 1;
    drawSprite(ctx, HUD_SP.vital, 13, 12, 0, pop, pop);
    const low = k < 0.3, flash = Math.floor(t * (low ? 8 : 3)) % 2 === 0;
    UIKit.bar(ctx, 20, 7, 100, 10, k, low ? (flash ? '#ff6161' : '#7c1414') : '#c8302e', '#1b2028');
    if (b.beat > 0.6) { ctx.fillStyle = '#ffb0a8'; ctx.fillRect(22, 9, Math.max(1, Math.round(96 * k)), 1); }
    // the haul, filling gold along the bottom of the same bar
    if (b.revive > 0) { ctx.fillStyle = '#ffe48f'; ctx.fillRect(22, 15, Math.round(96 * clamp(b.revive, 0, 1)), 1); }
    // his face, then a pip for every hit he can still take
    ctx.drawImage(FACE_SP.o.c, 9, 20);
    for (let i = 0; i < o.maxHp; i++) {
      const x = 20 + i * 11, on = i < o.hp;
      const lost = !on && i < o.hp + 2 && o.hurtT > 0 && Math.floor(t * 20) % 2 === 0;
      ctx.fillStyle = '#14141c'; ctx.fillRect(x, 20, 9, 8);
      ctx.fillStyle = lost ? '#ffffff' : on ? '#c8302e' : '#2c3440'; ctx.fillRect(x + 1, 21, 7, 6);
      if (on) { ctx.fillStyle = '#ff6161'; ctx.fillRect(x + 1, 21, 7, 2); ctx.fillStyle = '#7c1414'; ctx.fillRect(x + 1, 26, 7, 1); }
    }
    if (!touch) {
      // the dash: one pip that refills
      const dk = o.dashCd > 0 ? 1 - o.dashCd / OVERBOARD.dashCd : 1;
      ctx.fillStyle = '#14141c'; ctx.fillRect(20, 31, 7, 7);
      ctx.fillStyle = dk >= 1 ? '#6fd88e' : '#2c3440'; ctx.fillRect(21, 32, 5, 5);
      if (dk >= 1) { ctx.fillStyle = '#b6f5cd'; ctx.fillRect(21, 32, 5, 2); }
      else { ctx.fillStyle = '#6fd88e'; ctx.fillRect(21, 37, Math.round(5 * clamp(dk, 0, 1)), 1); }
      // and the cutlass beside it, lit while it is ready to swing again
      const ready = o.sl.phase === 'idle' && o.sl.cd <= 0;
      ctx.globalAlpha = ready ? 1 : 0.45;
      ctx.drawImage(EMO_SP.cutlass.c, 31, 30);
      ctx.globalAlpha = 1;
    }
  },
  drawDownedWorld(ctx, t, p) {
    const b = p.body, o = p.ot;
    const k = clamp(b.bleed / b.bleedMax, 0, 1);
    // the heartbeat at the edges of the screen, harder as she empties
    if (b.beat > 0.01) {
      const a = b.beat * (0.10 + (1 - k) * 0.22);
      ctx.fillStyle = `rgba(160,10,18,${a.toFixed(3)})`;
      ctx.fillRect(0, 0, 640, 8); ctx.fillRect(0, 352, 640, 8); ctx.fillRect(0, 8, 8, 344); ctx.fillRect(632, 8, 8, 344);
      ctx.fillStyle = `rgba(160,10,18,${(a * 0.5).toFixed(3)})`;
      ctx.fillRect(8, 8, 624, 6); ctx.fillRect(8, 346, 624, 6); ctx.fillRect(8, 14, 6, 332); ctx.fillRect(626, 14, 6, 332);
    }
    const sp = G.worldToScreen(b.x, b.y);
    const on = sp.x > -10 && sp.x < 650 && sp.y > -10 && sp.y < 370;
    if (on) {
      // the ring on her: gold fills as he hauls, dark red where it has not
      const cx = Math.round(sp.x), cy = Math.round(sp.y), R = 30;
      const near = o && (o.hauling || p.touchingHer(40));
      for (let i = 0; i < 28; i++) {
        const a = -Math.PI / 2 + (i / 28) * TAU;
        const filled = (i / 28) < b.revive;
        ctx.fillStyle = filled ? (i & 1 ? '#ffe48f' : '#ffffff') : near ? '#e8515a' : 'rgba(150,24,32,0.85)';
        ctx.fillRect(Math.round(cx + Math.cos(a) * R) - 1, Math.round(cy + Math.sin(a) * R * 0.62) - 1, 2, 2);
      }
      // and her blood drop over her, beating, so you can find her in a fight
      const bob = Math.round(Math.sin(t * 3) * 1.5);
      const pop = b.beat > 0.55 ? 2 : 1;
      drawSprite(ctx, HUD_SP.vital, cx, cy - R * 0.62 - 8 + bob, 0, pop, pop);
      return;
    }
    // off-screen: a hard arrow at the edge pointing at her, with her face
    const a = angleTo(320, 180, sp.x, sp.y);
    const ex = Math.round(clamp(320 + Math.cos(a) * 400, 16, 624)), ey = Math.round(clamp(180 + Math.sin(a) * 400, 56, 344));
    const beat = b.beat > 0.55;
    const ca = Math.cos(a), sa = Math.sin(a);
    const inside = (lx, ly) => lx >= -5 && lx <= 8 && Math.abs(ly) <= (8 - lx) * 0.6;
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (inside(lx, ly)) { ctx.fillStyle = beat ? '#ff8a80' : '#e0282e'; ctx.fillRect(ex + dx, ey + dy, 1, 1); }
      else if (inside(lx + 1, ly) || inside(lx - 1, ly) || inside(lx, ly + 1) || inside(lx, ly - 1)) { ctx.fillStyle = '#14141c'; ctx.fillRect(ex + dx, ey + dy, 1, 1); }
    }
    const fx = Math.round(ex - ca * 17) - 4, fy = Math.round(ey - sa * 17) - 4;
    ctx.fillStyle = '#14141c'; ctx.fillRect(fx - 1, fy - 1, 10, 10);
    ctx.drawImage(FACE_SP.m.c, fx, fy);
    // a sliver of how long she has, under her face
    ctx.fillStyle = '#14141c'; ctx.fillRect(fx - 1, fy + 10, 10, 3);
    ctx.fillStyle = k < 0.3 ? '#ff6161' : '#c8302e'; ctx.fillRect(fx, fy + 11, Math.max(1, Math.round(8 * k)), 1);
  },

  // sixteen pips, one per wave: filled behind you, bright under you, dim ahead
  drawWaveDots(ctx, t, d) {
    const n = (typeof WAVES !== 'undefined' ? WAVES.length : 16);
    const sp = 6, x0 = Math.round(320 - (n * sp - 2) / 2), y = 5;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * sp, cur = i === d.waveIdx, done = i < d.waveIdx || (cur && d.cleared);
      const boss = typeof WAVES !== 'undefined' && WAVES[i] && WAVES[i].boss;
      ctx.fillStyle = '#0d1018'; ctx.fillRect(x - 1, y - 1, 6, 6);
      let col = done ? (boss ? '#ff6161' : '#ffe48f') : cur ? '#ffffff' : boss ? '#5a2a2a' : '#39424f';
      if (cur && !d.cleared) { const b = Math.floor(t * 3) % 2; col = b ? '#ffffff' : '#ffe48f'; }
      ctx.fillStyle = col; ctx.fillRect(x, y, 4, 4);
      if (done || cur) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 4, 1); }
    }
  },

  // what the wave wants, as one icon and one number
  drawObjective(ctx, t, ob) {
    const kind = ob.kind || 'clear';
    const val = ob.value || '';
    const w = Math.max(34, textWidth(val, 7) + (val ? 26 : 16));
    const x = Math.round(320 - w / 2), y = 13;
    roundFill(ctx, '#0d1018', x, y, w, 15, 3);
    roundFill(ctx, ob.done ? '#2f5236' : '#232c38', x + 1, y + 1, w - 2, 13, 2);
    const icon = kind === 'survive' ? GLYPH_SP.cd : kind === 'salvage' ? GLYPH_SP.scrap
      : kind === 'hunt' ? HUD_SP.target : kind === 'boss' ? SP.skull : HUD_SP.boat;
    drawSprite(ctx, icon, x + (val ? 9 : Math.round(w / 2)), y + 7);
    if (val) pixelTextOutlined(ctx, val, x + w - 5, y + 3, 7, ob.done ? '#8dffb0' : '#ffffff', '#14141c', 'right');
    const fr = clamp(ob.frac || 0, 0, 1);
    this.objFrac = lerp(this.objFrac == null ? fr : this.objFrac, fr, 0.18);
    ctx.fillStyle = '#0d1018'; ctx.fillRect(x + 3, y + 12, w - 6, 2);
    ctx.fillStyle = ob.done ? '#6fd88e' : '#ffe48f'; ctx.fillRect(x + 3, y + 12, Math.round((w - 6) * this.objFrac), 2);
  },

  // the things the pair notice on their own, without game.js having to tell
  // them: a wound, a good parry, a net, the meter coming up
  watch(dt, t) {
    const p = G.player; if (!p) return;
    const s = this._w || (this._w = { hp: 1, abs: 0, kills: 0, buy: false, ramp: false, ready: false });
    const hpk = clamp(p.hp / p.stats.maxHp, 0, 1);
    // before the fight there is nothing to talk about, and it is the natural
    // place to wipe the slate so a second run hears the same lines again
    if (!G.director.started) {
      s.hp = hpk; s.abs = G.stats.absorbs; s.kills = G.stats.kills; s.net = false; s.buy = false; s.ready = false; s.ramp = false;
      if (Banter.t > 0) Banter.reset();
      return;
    }
    if (hpk < 0.34 && s.hp >= 0.34) Banter.say('hurt');
    else if (s.hp - hpk > 0.16) Banter.say('hurt');
    s.hp = hpk;
    if (G.stats.absorbs > s.abs) { s.abs = G.stats.absorbs; Banter.say('parry'); }
    if (G.stats.kills > s.kills) { if (s.kills === 0 && G.stats.kills === 1) Banter.say('firstkill'); s.kills = G.stats.kills; }
    if (p.slowed > 0.1 && !s.net) { s.net = true; Banter.say('netted'); } else if (p.slowed <= 0) s.net = false;
    // the wave that spawns a big one already says so; this is for the moment
    // it actually reaches them, which is a different feeling entirely
    const mb = (G.miniBosses || []).find(m => !m.dead);
    if (mb !== s.mini) { s.mini = mb; s.miniSaid = false; }
    // keep asking until they actually get a word in, it is worth saying
    if (mb && !s.miniSaid && Math.abs(mb.x - p.x) < 260 && Math.abs(mb.y - p.y) < 200) s.miniSaid = Banter.say('big');
    const full = p.rampage.meter >= 100 && !p.rampage.active;
    if (full && !s.ready) Banter.say('ready');
    s.ready = full;
    if (p.rampage.active && !s.ramp) Banter.say('rampage');
    s.ramp = p.rampage.active;
    if (t % 1 < dt) {                                   // the shop check is not cheap; once a second is plenty
      const canBuy = SKILL_NODES.some(n => !G.tree.has(n.id) && G.tree.available(n) && G.tree.canAfford(n));
      if (canBuy && !s.buy) Banter.say('shop');
      s.buy = canBuy;
    }
    // nothing has happened for a while: let them talk about the killing
    if (Banter.idleT > 26 && G.director.state === 'fighting') Banter.say('idle');
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
      pixelText(ctx, `Sunk ${G.stats.kills}   Parries ${G.stats.absorbs}   Scrap ${G.stats.scrapCollected}   Taken ${tree.unlocked.size}/${SKILL_NODES.length}   (paused)`, 380, 328, 5, '#9fd8ee');
    }
  },
};
