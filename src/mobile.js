// ---- MobileUI: full touch control layer ----------------------------------
// Left  : a pixel-art SHIP'S WHEEL (helm) you drag to steer the manatee.
// Right : ornate pixel-art action buttons with cooldown rings / charges / meters.
// Everything is generated procedurally as chunky pixel art -- no images,
// no gradients, integer coordinates only.
//
//   MobileUI.init(canvas)     attach pointer/touch listeners (canvas defaults to #screen)
//   MobileUI.enabled          bool - auto true on touch devices, or ?touch=1 / localStorage.mvb_touch
//   MobileUI.setEnabled(on)   manual toggle (on a desktop this also lets the mouse drive the pad)
//   MobileUI.update(dt, t)    advance the helm spring and the button animations, read live G state
//   MobileUI.render(ctx, t)   draw the whole layer into the 640x360 context
//   MobileUI.axis()           -> {x, y}   analog movement, magnitude <= 1
//   MobileUI.held(name)       name in 'fire','shield','roll','rampage','dive','decoy','tidal'
//   MobileUI.pressed(name)    true only on the frame the button was first pressed
//   MobileUI.endFrame()       clear the per-frame 'pressed' latches (call once per frame, last)
//   MobileUI.aimAt()          -> {x, y} in 640x360 CANVAS space (add G.cam for world), or null
//   MobileUI.consumedTouch(x, y) -> bool, a control owns that canvas point

// ============================ pixel helpers ================================
function mbHex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mbRamp(a) { return a.map(mbHex); }
function mbPick(ramp, v) { const i = Math.round(v * (ramp.length - 1)); return ramp[i >= ramp.length ? ramp.length - 1 : i >= 0 ? i : 0]; }
function mbBuf(w, h) { return { w, h, d: new Uint8ClampedArray(w * h * 4) }; }
function mbSet(b, x, y, c, a) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const i = (y * b.w + x) * 4;
  b.d[i] = c[0]; b.d[i + 1] = c[1]; b.d[i + 2] = c[2]; b.d[i + 3] = a === undefined ? 255 : a;
}
function mbOutline(b, col, a) {
  const src = b.d.slice(), w = b.w, h = b.h;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : src[(y * w + x) * 4 + 3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(x, y) > 0) continue;
    if (A(x - 1, y) > 0 || A(x + 1, y) > 0 || A(x, y - 1) > 0 || A(x, y + 1) > 0) mbSet(b, x, y, col, a);
  }
}
function mbBake(b, ax, ay) {
  const c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(b.w, b.h); img.data.set(b.d); ctx.putImageData(img, 0, 0);
  return { c, w: b.w, h: b.h, ax: ax === undefined ? b.w / 2 : ax, ay: ay === undefined ? b.h / 2 : ay };
}
function mbAngDiff(a, b) { return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; }

// ============================ palettes =====================================
const MB_OUTLINE = mbHex('#0b0c13');
const MB_WOOD = mbRamp(['#241408', '#3a2210', '#523017', '#6d4120', '#8a5528', '#a86a32', '#c4843f', '#dda45c', '#f0c68d']);
const MB_ROPE = mbRamp(['#33260f', '#4e3a1a', '#6d5427', '#8c7034', '#ab8c45', '#c9a95e', '#e6c98a']);
const MB_BRASS = mbRamp(['#2b1f07', '#4d380e', '#705118', '#946c20', '#b88b2c', '#d6aa42', '#eec96c', '#fff0b4']);
const MB_FACE_A = mbHex('#0a1220');
const MB_FACE_B = mbHex('#152238');
const MB_GROOVE = mbHex('#05080f');

const MB_R_BRASS = mbRamp(['#3a2408', '#6b4713', '#9a6a1d', '#c08c28', '#dcae3f', '#f2cd6b', '#fff0b8']);
const MB_R_STEEL = mbRamp(['#161d2b', '#2c3a52', '#455a7a', '#5f7aa0', '#7f9ec4', '#a7c3e4', '#dceaff']);
const MB_R_GREEN = mbRamp(['#0d2a19', '#164a2c', '#1f6b3e', '#2b8f53', '#43b06c', '#6fd88e', '#b6f3c8']);
const MB_R_RED = mbRamp(['#340a0a', '#5c1212', '#87201c', '#b23328', '#d45434', '#f08040', '#ffc07a']);
const MB_R_BLUE = mbRamp(['#0b1c3a', '#12305f', '#1b4a8c', '#2b6bb8', '#458fd8', '#77b9f0', '#c6e6ff']);
const MB_R_GOLD = mbRamp(['#3a2c07', '#5f4a0d', '#8a6c15', '#b59021', '#d6b234', '#f0d35e', '#fff2ac']);
const MB_R_TEAL = mbRamp(['#062626', '#0c4342', '#116260', '#198583', '#25a8a2', '#4fd0c6', '#a6f0e8']);

// ============================ ship's wheel geometry ========================
const MB_ROUT = 29;        // rim outer radius
const MB_RIN = 22;         // rim inner radius
const MB_HUB = 8;          // brass hub radius
const MB_HTIP = 36;        // handle tip distance from the hub
const MB_WS = 83, MB_WC = 41;   // wheel sprite size / centre
const MB_WFRAMES = 24;     // frames covering one 45 degree sector (8 spokes => 8-fold symmetry)

function mbSpokeW(along) {
  const k = (along - MB_HUB) / (MB_RIN - MB_HUB);
  return 3.3 - 1.3 * (k < 0 ? 0 : k > 1 ? 1 : k);
}

function mbWheelFrame(ang) {
  const S = MB_WS, C = MB_WC, step = TAU / 8;
  const b = mbBuf(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - C, dy = y - C;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > MB_HTIP + 4) continue;
    const th = Math.atan2(dy, dx) - ang;
    const n = Math.round(th / step);
    const da = th - n * step;
    const along = Math.cos(da) * r, lat = Math.abs(Math.sin(da) * r);
    const L = (-dx * 0.55 - dy * 0.83) / MB_ROUT;   // key light from the upper left
    let part = 0, arc = 0;
    if (r <= MB_HUB) part = 3;
    else if (r >= MB_RIN && r <= MB_ROUT) {
      part = 1;
      arc = (Math.abs(da) - step / 2) * r;          // distance along the rim from the mid-point between spokes
      if (Math.abs(arc) <= 3.4) part = 5;           // rope binding wrapped around the rim
    } else if (r < MB_RIN && along > MB_HUB - 3 && lat <= mbSpokeW(along)) part = 2;
    if (r > MB_ROUT - 4) {                           // handles stick out past the rim
      let isH = false;
      if (along >= MB_ROUT - 4 && along <= MB_HTIP && lat <= 2.5) isH = true;
      if (!isH) {
        const sa = n * step + ang;
        const tx = Math.cos(sa) * MB_HTIP, ty = Math.sin(sa) * MB_HTIP;
        if ((dx - tx) * (dx - tx) + (dy - ty) * (dy - ty) <= 10.2) isH = true;
        else {
          const bx = Math.cos(sa) * (MB_ROUT - 1), by = Math.sin(sa) * (MB_ROUT - 1);
          if ((dx - bx) * (dx - bx) + (dy - by) * (dy - by) <= 11.5) isH = true;
        }
      }
      if (isH) part = 4;
    }
    if (!part) continue;
    let col, v;
    switch (part) {
      case 1: {  // wooden rim, rounded cross-section + grain that turns with the wheel
        const u = (r - MB_RIN) / (MB_ROUT - MB_RIN);
        v = 0.53 + (0.34 - Math.abs(u - 0.40)) * 1.15 + L * 0.38;
        if (Math.sin(th * 40) > 0.55) v -= 0.11;
        if (u < 0.12 || u > 0.90) v -= 0.26;
        col = mbPick(MB_WOOD, v); break;
      }
      case 2: {  // spoke: cylindrical shading across its width
        const u = lat / mbSpokeW(along);
        v = 0.46 + (1 - u * u) * 0.38 + L * 0.26;
        if (along > MB_RIN - 3) v -= 0.12;
        if (along < MB_HUB + 2) v -= 0.08;
        col = mbPick(MB_WOOD, v); break;
      }
      case 3: {  // brass hub with turned rings and spoke bolts
        v = 0.52 + L * 0.34 + ((Math.floor(r * 1.15) & 1) ? 0.09 : -0.07);
        if (r > MB_HUB - 1.3) v -= 0.38;
        if (r < 2.3) v = 0.86;
        if (lat < 1.6 && Math.abs(along - 5.4) < 1.6) v = 0.95;
        col = mbPick(MB_BRASS, v); break;
      }
      case 4: {  // handle
        const u = lat / 2.9;
        v = 0.54 + (1 - u * u) * 0.30 + L * 0.28;
        if (along > MB_HTIP - 2.5) v -= 0.10;
        if (Math.abs(along - (MB_ROUT + 1.5)) < 1.2) v -= 0.26;   // collar where it meets the rim
        col = mbPick(MB_WOOD, v); break;
      }
      default: { // rope binding
        const u = (r - MB_RIN) / (MB_ROUT - MB_RIN);
        v = 0.46 + (0.32 - Math.abs(u - 0.40)) * 0.8 + L * 0.26;
        v += (Math.floor(Math.abs(arc) / 1.8) & 1) ? 0.24 : -0.14;
        col = mbPick(MB_ROPE, v); break;
      }
    }
    mbSet(b, x, y, col, 255);
  }
  mbOutline(b, MB_OUTLINE, 255);
  return mbBake(b, C, C);
}

function mbBasePlate(R) {
  const S = R * 2 + 5, C = R + 2, b = mbBuf(S, S);
  const dark = mbHex('#080e1a'), dith = mbHex('#132139');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - C, dy = y - C, r = Math.sqrt(dx * dx + dy * dy);
    if (r > R) continue;
    let col, a;
    if (r > R - 1.3) { col = MB_OUTLINE; a = 215; }
    else if (r > R - 5.5) {
      const th = Math.atan2(dy, dx);
      const da = Math.abs(mbAngDiff(th, Math.round(th / (TAU / 16)) * (TAU / 16))) * r;
      const big = Math.abs(mbAngDiff(th, Math.round(th / (TAU / 4)) * (TAU / 4))) * r < 2.0;
      col = (da < 1.6 || big) ? mbPick(MB_BRASS, big ? 1 : 0.9) : mbPick(MB_BRASS, 0.34 + (-dx - dy) / (R * 2.6));
      a = 235;
    } else if (r > R - 7) { col = MB_GROOVE; a = 210; }
    else { col = ((x + y) & 3) === 0 ? dith : dark; a = 140; }
    mbSet(b, x, y, col, a);
  }
  // four mounting bolts
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const rx = Math.round(C + Math.cos(a) * (R - 2.6)), ry = Math.round(C + Math.sin(a) * (R - 2.6));
    mbSet(b, rx, ry, mbPick(MB_BRASS, 1), 255); mbSet(b, rx + 1, ry, mbPick(MB_BRASS, 0.7), 255);
    mbSet(b, rx, ry + 1, mbPick(MB_BRASS, 0.35), 255); mbSet(b, rx + 1, ry + 1, MB_OUTLINE, 255);
  }
  mbOutline(b, MB_OUTLINE, 205);
  return mbBake(b, C, C);
}

// ============================ ornate button plate ==========================
function mbPlate(r, ramp, pressed) {
  const S = r * 2 + 5, C = r + 2, b = mbBuf(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - C, dy = y - C, ax = Math.abs(dx), ay = Math.abs(dy);
    let d = Math.max(ax, ay, (ax + ay) * 0.74);
    if (ay < 3.2 && ax <= r + 2) d = Math.min(d, ax - 2);   // ornate ears, N/S/E/W
    if (ax < 3.2 && ay <= r + 2) d = Math.min(d, ay - 2);
    if (d > r) continue;
    const L = (-dx - dy) / (r * 1.9);
    let col, a = 240;
    if (d > r - 1.3) { col = MB_OUTLINE; }
    else if (d > r - 4.0) { col = mbPick(ramp, 0.48 + (pressed ? -L : L) * 0.85); }
    else if (d > r - 5.4) { col = MB_GROOVE; a = 228; }
    else if (d > r - 6.6) { col = mbPick(ramp, pressed ? 0.12 : 0.30); a = 228; }   // inner ring ornament
    else {
      col = (((x + y) & 3) === 0 || ((x - y) & 7) === 0) ? MB_FACE_B : MB_FACE_A;
      a = pressed ? 220 : 192;
    }
    mbSet(b, x, y, col, a);
  }
  for (let i = 0; i < 4; i++) {            // corner rivets
    const an = Math.PI / 4 + i * Math.PI / 2;
    const rx = Math.round(C + Math.cos(an) * (r - 2.6)), ry = Math.round(C + Math.sin(an) * (r - 2.6));
    mbSet(b, rx, ry, mbPick(ramp, 1), 255); mbSet(b, rx + 1, ry, mbPick(ramp, 0.7), 255);
    mbSet(b, rx, ry + 1, mbPick(ramp, 0.3), 255); mbSet(b, rx + 1, ry + 1, MB_OUTLINE, 255);
  }
  mbOutline(b, MB_OUTLINE, 240);
  return mbBake(b, C, C);
}


// A circular "barrel roll" arrow, generated in pixel space so every angle stays crisp.
function mbRollIcon() {
  const S = 19, C = 9, b = mbBuf(S, S);
  const RAMP = mbRamp(['#0f3a22', '#1f6b3e', '#2b8f53', '#43b06c', '#6fd88e', '#b6f3c8']);
  const gapA = -1.48, gapB = -0.10;          // the arc is open across the upper right
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - C, dy = y - C, r = Math.sqrt(dx * dx + dy * dy);
    const th = Math.atan2(dy, dx);
    const L = (-dx * 0.6 - dy * 0.8) / 9;
    let v = -1;
    if (r >= 4.5 && r <= 8.3 && !(th > gapA && th < gapB)) {
      v = 0.46 + (1 - Math.abs(r - 6.4) / 1.9) * 0.34 + L * 0.26;
    }
    // arrowhead: sits at the top end of the arc and points clockwise (to the right)
    const hx = dx - (-2.0), hy = dy - (-6.4);
    if (hx >= 0 && hx <= 6.5 && Math.abs(hy) <= 4.6 * (1 - hx / 6.5)) v = Math.max(v, 0.74 + L * 0.2);
    if (v < 0) continue;
    mbSet(b, x, y, mbPick(RAMP, v), 255);
  }
  mbOutline(b, MB_OUTLINE, 255);
  return mbBake(b, C, C);
}

// ============================ button icons =================================
const MB_ICONS = {
  gun: [
    '..............................',
    '.........kkkkkkkkkkkkkkkk.....',
    '........kMMMMMMMMMMMMMMMMk.y..',
    '........kMwwwwwwwwwwwwwwMkYfY.',
    '........kMMMMMMMMMMMMMMMMkfwfY',
    '....kkkkkMMkkkkkkkkkkkkkkkYfY.',
    '..kkMMMMMMMkk.............y...',
    '.kMMMMMMMMMMMk................',
    'kMMMwwwwwwwMMMk...............',
    'kMMwwkkkkkwwMMk...............',
    'kMMwkkXXXkkwMMk...............',
    'kMMwwkkkkkwwMMk...............',
    'kMMMwwwwwwwMMMk...............',
    '.kMMMMMMMMMMMk................',
    '..kkMMMMMMMkk.................',
    '....kUTTTtuuk.................',
    '....kUTTtuuk..................',
    '.....kUTtuuk..................',
    '.....kUTtuk...................',
    '......kkkk....................',
  ],
  shield: [
    '..kkkkkkkkkkkk..',
    '.kMMMMMMMMMMMMk.',
    'kMMzzzzzzzzzzMMk',
    'kMzzLLLLLLLLzzMk',
    'kMzLLLlllllLLzMk',
    'kMzLLlkkkkklLzMk',
    'kMzLLlkwwwklLzMk',
    'kMzLLlkwkwklLzMk',
    'kMzLLlkkkkklLzMk',
    'kMzLLLlllllLLzMk',
    'kMzzLLLLLLLLzzMk',
    'kMMzzzzzzzzzzMMk',
    '.kMMzzzzzzzzMMk.',
    '..kMMzzzzzzMMk..',
    '...kMMzzzzMMk...',
    '....kMMzzMMk....',
    '.....kMMMMk.....',
    '......kkkk......',
  ],
  roll: [
    '.........kkkkkk.......',
    '.......kkGGGGGGkk.....',
    '..W...kGGGjjjjGGGk....',
    'W..W.kGGjjjhhhhjGGk...',
    '..W..kGjjhhhhhhhhjGk..',
    'W..W.kGjhhhhkhhhhhjGk.',
    '..W..kGjjhhhhhhhhhjGk.',
    'W..W.kGGjjhhhhhhhjGGk.',
    '..W...kGGjjjjjjjGGk...',
    '.......kkGGGGGGkk.....',
    '.........kkkkkk.......',
  ],
  rampage: [
    '.......kk.....kk..',
    '......kOyk...kOyk.',
    '.....kOYYOk.kOYOk.',
    '....kOYffYOkOYYOk.',
    '...kOYffffYOYffYOk',
    '..kOYff.kk.ffYffOk',
    '..kOYf.kBBk.fYYYOk',
    '.kOYff.BkBB.ffYYOk',
    '.kOYf.kBBBBk.fYOk.',
    '.kOYf.BBkkBB.fYOk.',
    '.kOYf.kBwwBk.fYOk.',
    '.kOYff.wkwk.ffYOk.',
    '..kOYff.kk.ffYOk..',
    '..kOYYffffffYYOk..',
    '...kOOYYffYYOOk...',
    '....kOOOYYOOOk....',
    '.....kOOOOOOk.....',
    '......kkkkkk......',
  ],
  dive: [
    'kLk.......kLk',
    'kLLk.....kLLk',
    'kLLLk...kLLLk',
    '.kLLLk.kLLLk.',
    '..kLLLkLLLk..',
    '...kLLLLLk...',
    '....kLLLk....',
    '.....kLk.....',
    'kLk.......kLk',
    'kLLk.....kLLk',
    'kLLLk...kLLLk',
    '.kLLLk.kLLLk.',
    '..kLLLkLLLk..',
    '...kLLLLLk...',
    '....kLLLk....',
    '.....kLk.....',
  ],
  decoy: [
    '......W......',
    '.....kwk.....',
    '.....kRk.....',
    '....kkkkk....',
    '...kRrqrRk...',
    '...kwwwwwk...',
    '...kRrqrRk...',
    '...kwwwwwk...',
    '...kRrqrRk...',
    '...kwwwwwk...',
    '....kkkkk....',
    'kLLk.....kLLk',
    '.kLLLkkkLLLk.',
    '..kkkkkkkkk..',
  ],
  tidal: [
    '........W.....W...',
    '......kkkkkk......',
    '....kkwwwwwwkk....',
    '...kwwwwwwwwwwk...',
    '..kwwWWWWWWWWwwk..',
    '.kwWLLLLLLLLLLWwk.',
    'kwLLLlllllllLLLLwk',
    'kLlllliiiiilllllLk',
    'kliiiiiiiiiiiiiilk',
    'kliiiiiiiiiiiiiilk',
    '.kliiiiiiiiiiiilk.',
    '..kkiiiiiiiiiikk..',
    '....kkkkkkkkkk....',
  ],
};

// ============================ the buttons ==================================
const MB_BUTTONS = [
  // no FIRE button any more: the gun is aimed and fired with the right stick,
  // so the ability buttons move left to clear its zone
  { name: 'shield', x: 470, y: 300, r: 23, label: 'PARRY', ramp: MB_R_STEEL, icon: 'shield', tint: '#8ac6ff' },
  { name: 'roll', x: 470, y: 240, r: 23, label: 'ROLL', ramp: MB_R_GREEN, icon: 'roll', tint: '#6fd88e' },
  { name: 'melee', x: 416, y: 276, r: 23, label: 'SLAM', ramp: MB_R_RED, icon: 'roll', tint: '#ff9a3c', req: 'melee' },
  { name: 'rampage', x: 422, y: 206, r: 25, label: 'RAMPAGE', ramp: MB_R_RED, icon: 'rampage', tint: '#ff9a3c' },
  { name: 'dive', x: 364, y: 306, r: 20, label: 'DIVE', ramp: MB_R_BLUE, icon: 'dive', tint: '#8ac6ff', req: 'dive' },
  { name: 'decoy', x: 358, y: 244, r: 20, label: 'DECOY', ramp: MB_R_GOLD, icon: 'decoy', tint: '#ffe48f', req: 'decoy' },
  { name: 'tidal', x: 370, y: 192, r: 20, label: 'TIDAL', ramp: MB_R_TEAL, icon: 'tidal', tint: '#6fd88e', req: 'tidal' },
];

const MB_WX = 58, MB_WY = 282;      // helm centre on the 640x360 canvas
const MB_WGRAB = 58;                // radius of the "grab the helm" zone
// the aiming stick: the right thumb aims the otter's gun and firing is simply
// holding it off centre, so aiming and shooting are one gesture
const MB_SX = 562, MB_SY = 270;     // stick centre: clear of the right edge and of the tally panel
const MB_SGRAB = 52;                // radius of the "grab the stick" zone
const MB_SMAX = 32;                 // how far the knob travels
const MB_SDEAD = 8;                 // below this it is a rest, not an aim
const MB_WMAX = 40;                 // drag distance that means full throttle
const MB_WDEAD = 5;                 // dead zone

const MobileUI = {
  enabled: false, forced: false, mouseOk: false, ready: false,
  canvas: null, art: null,
  touches: new Map(),
  wheel: { ang: 0, vel: 0, active: false, id: null, dx: 0, dy: 0, mag: 0, dragAng: 0, grabT: 0, kick: 0 },
  stick: { active: false, id: null, dx: 0, dy: 0, mag: 0, latch: false, wasLive: false, kick: 0 },
  buttons: {}, order: [],
  _axis: { x: 0, y: 0 },
  t: 0,

  // ---------------------------------------------------------------- setup
  init(canvas) {
    this.canvas = canvas || document.getElementById('screen');
    this.buttons = {}; this.order = [];          // safe to call init() more than once
    for (const def of MB_BUTTONS) {
      const b = Object.assign({}, def, {
        down: false, latch: false, id: null, press: 0, flash: 0, glow: 0,
        visible: true, dragX: 0, dragY: 0, dragLen: 0,
        frac: 1, ready: true, active: 0, charges: 0, maxCharges: 1, meter: 0,
      });
      this.buttons[def.name] = b; this.order.push(b);
    }
    const touch = (typeof window !== 'undefined') &&
      (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0));
    let force = false;
    try { force = /(\?|&)(touch|mobile)=1/.test(location.search) || localStorage.getItem('mvb_touch') === '1'; } catch (e) { }
    this.forced = force;
    this.attach();
    this.setEnabled(!!(touch || force));
    return this;
  },

  setEnabled(on) {
    on = !!on;
    if (on === this.enabled) { if (on) this.applyPageCss(true); return; }
    this.enabled = on;
    if (!on) { this.releaseAll(); this.applyPageCss(false); }
    else { this.mouseOk = !(('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0)); this.applyPageCss(true); this.ensureArt(); }
  },

  applyPageCss(on) {
    if (typeof document === 'undefined') return;
    let st = document.getElementById('mb-touch-css');
    if (!on) { if (st) st.remove(); if (this.canvas) this.canvas.style.touchAction = ''; return; }
    if (this.canvas) this.canvas.style.touchAction = 'none';
    if (st) return;
    st = document.createElement('style'); st.id = 'mb-touch-css';
    st.textContent = 'html,body{overscroll-behavior:none;touch-action:manipulation;' +
      '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}' +
      'canvas{touch-action:none}';
    (document.head || document.documentElement).appendChild(st);
  },

  // ------------------------------------------------------------- art bake
  ensureArt() {
    if (this.art) return this.art;
    const frames = [], shadows = [];
    for (let i = 0; i < MB_WFRAMES; i++) {
      const f = mbWheelFrame(i / MB_WFRAMES * (TAU / 8));
      frames.push(f); shadows.push(tintSprite(f, '#000000', 1));
    }
    const icons = {}, iconsOff = {};
    for (const k in MB_ICONS) icons[k] = makeSprite(MB_ICONS[k]);
    icons.roll = mbRollIcon();
    for (const k in icons) iconsOff[k] = tintSprite(icons[k], '#2a323e', 0.78);
    const plates = {};
    for (const b of this.order) {
      const p = mbPlate(b.r, b.ramp, false);
      plates[b.name] = {
        up: p, down: mbPlate(b.r, b.ramp, true),
        off: tintSprite(p, '#222a36', 0.66),
        hot: tintSprite(p, '#ffffff', 0.42),
        act: tintSprite(p, b.tint, 0.55),
      };
    }
    this.art = {
      frames, shadows, icons, iconsOff, plates,
      base: mbBasePlate(45),
      king: makeSprite([
        '..kkkkkkkkk..',
        '.kMqrrrrrqMk.',
        'kMYqrRRRrqYMk',
        'kMYqRRwwRRqYk',
        'kMYqrRRRrqYMk',
        '.kMqrrrrrqMk.',
        '..kkkkkkkkk..',
      ], { ax: 6, ay: 3 }),
      knob: makeSprite(['.kkk.', 'kYwYk', 'kYyYk', 'kyyyk', '.kkk.'], { ax: 2, ay: 2 }),
    };
    this.ready = true;
    return this.art;
  },

  // -------------------------------------------------------------- events
  attach() {
    if (this._attached || !this.canvas) return;
    this._attached = true;
    const c = this.canvas;
    const usePointer = typeof window !== 'undefined' && !!window.PointerEvent;
    if (usePointer) {
      c.addEventListener('pointerdown', e => this.onDown(e, e.pointerId, e.clientX, e.clientY, e), { passive: false });
      c.addEventListener('pointermove', e => this.onMove(e, e.pointerId, e.clientX, e.clientY), { passive: false });
      const up = e => this.onUp(e, e.pointerId);
      c.addEventListener('pointerup', up, { passive: false });
      c.addEventListener('pointercancel', up, { passive: false });
      window.addEventListener('pointerup', up, { passive: false });
    } else {
      c.addEventListener('touchstart', e => {
        for (let i = 0; i < e.changedTouches.length; i++) { const t = e.changedTouches[i]; this.onDown(e, t.identifier, t.clientX, t.clientY, null); }
      }, { passive: false });
      c.addEventListener('touchmove', e => {
        for (let i = 0; i < e.changedTouches.length; i++) { const t = e.changedTouches[i]; this.onMove(e, t.identifier, t.clientX, t.clientY); }
        if (this.enabled) e.preventDefault();
      }, { passive: false });
      const end = e => { for (let i = 0; i < e.changedTouches.length; i++) this.onUp(e, e.changedTouches[i].identifier); };
      c.addEventListener('touchend', end, { passive: false });
      c.addEventListener('touchcancel', end, { passive: false });
    }
    c.addEventListener('dblclick', e => { if (this.enabled) e.preventDefault(); });
    window.addEventListener('gesturestart', e => { if (this.enabled) e.preventDefault(); });
    window.addEventListener('gesturechange', e => { if (this.enabled) e.preventDefault(); });
    window.addEventListener('blur', () => this.releaseAll());
  },

  accepts(e) {
    if (!this.enabled) return false;
    if (e && e.pointerType === 'mouse' && !this.mouseOk && !this.forced) return false;
    return true;
  },

  toCanvas(cx, cy) {
    const c = this.canvas;
    if (!c) return { x: cx, y: cy };
    const r = c.getBoundingClientRect();
    // interface space is a fixed 640x360 regardless of the canvas resolution
    return { x: (cx - r.left) / (r.width || 1) * 640, y: (cy - r.top) / (r.height || 1) * 360 };
  },

  onDown(e, id, cx, cy, pe) {
    if (!this.accepts(e)) return;
    this.ensureArt();
    if (typeof Audio_ !== 'undefined') { Audio_.init(); Audio_.resume(); }
    const p = this.toCanvas(cx, cy);
    let owner = null;
    // the helm first: it owns the whole bottom-left corner
    const w = this.wheel;
    const inHelm = dist(p.x, p.y, MB_WX, MB_WY) <= MB_WGRAB;
    if (inHelm && w.id === null) {
      owner = 'wheel'; w.id = id; w.active = true; w.grabT = 0; w.kick = 1;
      this.dragWheel(p.x, p.y);
    } else if (inHelm) {
      owner = 'helm-busy';            // swallowed: the helm already has a finger on it
    } else if (dist(p.x, p.y, MB_SX, MB_SY) <= MB_SGRAB && this.stick.id === null) {
      owner = 'stick'; const k = this.stick;
      k.id = id; k.active = true; k.kick = 1;
      this.dragStick(p.x, p.y);
    } else if (dist(p.x, p.y, MB_SX, MB_SY) <= MB_SGRAB) {
      owner = 'stick-busy';
    } else {
      const b = this.pickButton(p.x, p.y);
      if (b && b.id === null) {
        owner = b.name; b.id = id; b.down = true; b.latch = true; b.press = 1;
        b.dragX = 0; b.dragY = 0; b.dragLen = 0;
        if (typeof Audio_ !== 'undefined') Audio_.tone(b.ready ? 520 : 200, 0.04, 'square', 0.08);
      }
    }
    this.touches.set(id, { x: p.x, y: p.y, owner });
    if (owner !== null) {
      if (e && e.cancelable) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      try { if (pe && this.canvas.setPointerCapture) this.canvas.setPointerCapture(id); } catch (err) { }
    }
  },

  onMove(e, id, cx, cy) {
    if (!this.enabled) return;
    const t = this.touches.get(id); if (!t) return;
    const p = this.toCanvas(cx, cy);
    t.x = p.x; t.y = p.y;
    if (t.owner === 'wheel') { this.dragWheel(p.x, p.y); if (e && e.cancelable) e.preventDefault(); }
    else if (t.owner === 'stick') { this.dragStick(p.x, p.y); if (e && e.cancelable) e.preventDefault(); }
    else if (t.owner) {
      const b = this.buttons[t.owner];
      if (b) {
        b.dragX = p.x - b.x; b.dragY = p.y - b.y; b.dragLen = Math.hypot(b.dragX, b.dragY);
        if (b.dragLen > b.r * 2.1) { b.down = false; b.id = null; t.owner = null; }   // slid off, let go
      }
      if (e && e.cancelable) e.preventDefault();
    }
  },

  onUp(e, id) {
    const t = this.touches.get(id); if (!t) return;
    this.touches.delete(id);
    if (t.owner === 'wheel') { const w = this.wheel; w.active = false; w.id = null; w.dx = 0; w.dy = 0; w.mag = 0; }
    else if (t.owner === 'stick') { const k = this.stick; k.active = false; k.id = null; k.dx = 0; k.dy = 0; k.mag = 0; }
    else if (t.owner) { const b = this.buttons[t.owner]; if (b) { b.down = false; b.id = null; b.dragLen = 0; } }
    try { if (this.canvas && this.canvas.releasePointerCapture) this.canvas.releasePointerCapture(id); } catch (err) { }
    if (t.owner !== null && e && e.cancelable) e.preventDefault();
  },

  releaseAll() {
    this.touches.clear();
    const w = this.wheel; w.active = false; w.id = null; w.dx = 0; w.dy = 0; w.mag = 0;
    const k = this.stick; k.active = false; k.id = null; k.dx = 0; k.dy = 0; k.mag = 0;
    for (const b of this.order) { b.down = false; b.id = null; b.dragLen = 0; }
  },

  dragStick(x, y) {
    const k = this.stick;
    let dx = x - MB_SX, dy = y - MB_SY;
    const m = Math.hypot(dx, dy);
    if (m > MB_SMAX) { dx = dx / m * MB_SMAX; dy = dy / m * MB_SMAX; }
    k.dx = dx; k.dy = dy; k.mag = Math.min(m, MB_SMAX);
    const live = k.mag > MB_SDEAD;
    if (live && !k.wasLive) k.latch = true;   // crossing the deadzone is a press
    k.wasLive = live;
  },
  // the gun is live whenever the stick is off centre
  stickLive() { return this.enabled && this.stick.active && this.stick.mag > MB_SDEAD; },

  pickButton(x, y) {
    let best = null, bd = 1e9;
    for (const b of this.order) {
      if (!b.visible) continue;
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r + 5 && d < bd) { bd = d; best = b; }
    }
    return best;
  },

  dragWheel(x, y) {
    const w = this.wheel;
    let dx = x - MB_WX, dy = y - MB_WY;
    const d = Math.hypot(dx, dy);
    if (d > MB_WMAX) { dx = dx / d * MB_WMAX; dy = dy / d * MB_WMAX; }
    w.dx = dx; w.dy = dy;
    const len = Math.hypot(dx, dy);
    if (len > MB_WDEAD) { w.dragAng = Math.atan2(dy, dx); w.mag = clamp((len - MB_WDEAD) / (MB_WMAX - MB_WDEAD), 0, 1); }
    else w.mag = 0;
  },

  // -------------------------------------------------------------- update
  update(dt, t) {
    if (!this.enabled) return;
    this.ensureArt();
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;
    this.t = t || (this.t + dt);
    this.updateWheel(dt);
    this.pollState();
    for (const b of this.order) {
      b.press = Math.max(0, b.press - dt * 6);
      b.flash = Math.max(0, b.flash - dt * 2.2);
      b.glow = lerp(b.glow, (b.ready && b.visible) ? 1 : 0, 1 - Math.pow(0.005, dt));
    }
  },

  updateWheel(dt) {
    const w = this.wheel;
    w.kick = Math.max(0, w.kick - dt * 3);
    let target = 0;
    if (w.active && w.mag > 0) {
      const want = mbAngDiff(0, w.dragAng + Math.PI / 2);   // "push up" = helm upright
      target = want * (0.30 + 0.70 * w.mag);
      w.grabT += dt;
    }
    const k = w.active ? 230 : 135, damp = w.active ? 18 : 6.2;
    w.vel += (target - w.ang) * k * dt;
    w.vel -= w.vel * Math.min(0.9, damp * dt);
    w.ang += w.vel * dt;
    if (w.ang > 4.4) { w.ang = 4.4; w.vel *= -0.3; }
    if (w.ang < -4.4) { w.ang = -4.4; w.vel *= -0.3; }
    if (w.vel > 26) w.vel = 26; if (w.vel < -26) w.vel = -26;
    if (!w.active) {
      this._axis.x = 0; this._axis.y = 0;
    } else {
      this._axis.x = Math.cos(w.dragAng) * w.mag;
      this._axis.y = Math.sin(w.dragAng) * w.mag;
      if (w.mag <= 0) { this._axis.x = 0; this._axis.y = 0; }
    }
  },

  // read everything the indicators need straight off the live game state
  pollState() {
    const g = (typeof G !== 'undefined') ? G : null;
    const p = g && g.player ? g.player : null;
    const st = p && p.stats ? p.stats : null;
    for (const b of this.order) {
      const wasReady = b.ready;
      b.visible = !b.req || !!(st && st[b.req]);
      b.frac = 1; b.ready = true; b.active = 0; b.charges = 0; b.maxCharges = 1; b.meter = 0;
      if (!p) { if (b.req) b.visible = false; continue; }
      const cdm = (x) => (p.cd ? p.cd(x) : x) || 1e-6;
      switch (b.name) {
        case 'fire': {
          const wid = (g && g.tree && g.tree.primary) || 'revolver';
          const wp = (typeof WEAPONS !== 'undefined' && WEAPONS[wid]) ? WEAPONS[wid] : null;
          const rate = wp ? wp.rate / ((st && st.fireRate) || 1) : 0.36;
          const cd = (p.weaponCd && p.weaponCd.primary) || 0;
          b.frac = rate > 0 ? clamp(1 - cd / rate, 0, 1) : 1;
          b.ready = cd <= 0;
          b.active = p.rampage && p.rampage.active ? 1 : 0;
          break;
        }
        case 'shield': {
          const max = cdm((st && st.absorbCd) || 1.3);
          const cd = (p.absorb && p.absorb.cd) || 0;
          b.frac = cd > 0 ? clamp(1 - cd / max, 0, 1) : 1;
          b.ready = cd <= 0 && !(p.absorb && p.absorb.active);
          if (p.absorb && p.absorb.active) {
            const win = (st && st.absorbWindow) || 0.3;
            b.active = clamp(1 - p.absorb.t / win, 0, 1);
            b.frac = b.active;
          }
          break;
        }
        case 'roll': {
          const maxC = (st && st.rollCharges) || 1;
          const ch = (p.roll && p.roll.charges !== undefined) ? p.roll.charges : maxC;
          b.charges = ch; b.maxCharges = maxC;
          const full = cdm(2.4 * ((st && st.rollCd) || 1));
          b.frac = ch >= maxC ? 1 : clamp(1 - ((p.roll && p.roll.rechargeT) || 0) / full, 0, 1);
          b.ready = ch > 0;
          b.active = (p.roll && p.roll.active) ? 1 : 0;
          break;
        }
        case 'rampage': {
          const r = p.rampage || {};
          b.meter = clamp((r.meter || 0) / 100, 0, 1);
          if (r.active) { b.active = clamp(1 - (r.t || 0) / (r.dur || 5), 0, 1); b.meter = b.active; b.frac = b.active; b.ready = false; }
          else { b.frac = b.meter; b.ready = b.meter >= 1; }
          break;
        }
        case 'dive': {
          const max = cdm(7), cd = (p.dive && p.dive.cd) || 0;
          b.frac = cd > 0 ? clamp(1 - cd / max, 0, 1) : 1;
          b.ready = cd <= 0; b.active = (p.dive && p.dive.active) ? 1 : 0;
          break;
        }
        case 'decoy': {
          const max = cdm(14), cd = p.decoyCd || 0;
          b.frac = cd > 0 ? clamp(1 - cd / max, 0, 1) : 1; b.ready = cd <= 0; break;
        }
        case 'tidal': {
          const max = cdm(12), cd = p.tidalCd || 0;
          b.frac = cd > 0 ? clamp(1 - cd / max, 0, 1) : 1; b.ready = cd <= 0; break;
        }
      }
      if (b.ready && !wasReady) b.flash = 1;
    }
  },

  // ----------------------------------------------------------------- API
  axis() { return { x: this._axis.x, y: this._axis.y }; },
  held(name) {
    if (name === 'fire') return this.stickLive();
    const b = this.buttons[name]; return !!(this.enabled && b && b.visible && (b.down || b.latch));
  },
  pressed(name) {
    if (name === 'fire') return !!(this.enabled && this.stick.latch);
    const b = this.buttons[name]; return !!(this.enabled && b && b.visible && b.latch);
  },
  endFrame() { for (const b of this.order) b.latch = false; this.stick.latch = false; },

  aimAt() {
    if (!this.enabled) return null;
    // the stick owns the aim: a point out along its deflection from the player
    const k = this.stick;
    if (k.active && k.mag > MB_SDEAD) {
      const m = Math.hypot(k.dx, k.dy) || 1;
      return { x: clamp(320 + k.dx / m * 240, 0, 640), y: clamp(180 + k.dy / m * 240, 0, 360) };
    }
    // a bare tap on open water still aims there
    for (const t of this.touches.values()) if (t.owner === null) return { x: t.x, y: t.y };
    return null;
  },

  consumedTouch(x, y) {
    if (!this.enabled) return false;
    if (dist(x, y, MB_WX, MB_WY) <= MB_WGRAB) return true;
    if (dist(x, y, MB_SX, MB_SY) <= MB_SGRAB) return true;
    for (const b of this.order) { if (!b.visible) continue; if (Math.hypot(x - b.x, y - b.y) <= b.r + 5) return true; }
    return false;
  },

  // -------------------------------------------------------------- render
  render(ctx, t) {
    if (!this.enabled) return;
    const art = this.ensureArt();
    if (t === undefined) t = this.t;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    this.drawWheel(ctx, art, t);
    this.drawStick(ctx, t);
    for (const b of this.order) if (b.visible) this.drawButton(ctx, art, b, t);
    ctx.restore();
    ctx.imageSmoothingEnabled = sm;
  },

  // The aiming stick. A brass gun ring with a knob you push toward whatever
  // you want shot; pushing it off centre IS the trigger.
  drawStick(ctx, t) {
    const k = this.stick;
    const live = k.mag > MB_SDEAD;
    const ring = MB_SMAX + 12;
    // base ring: a dashed brass collar, hard pixels, no strokes
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      if ((i & 3) === 3 && !live) continue;
      const cx = Math.round(MB_SX + Math.cos(a) * ring), cy = Math.round(MB_SY + Math.sin(a) * ring);
      ctx.fillStyle = live ? '#ffe48f' : 'rgba(210,178,110,0.55)';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      ctx.fillStyle = live ? '#7a5512' : 'rgba(60,46,20,0.5)';
      ctx.fillRect(cx - 1, cy + 2, 3, 1);
    }
    // the well the knob sits in
    ctx.fillStyle = 'rgba(12,18,28,0.42)';
    const w = MB_SMAX + 4;
    ctx.fillRect(MB_SX - w, MB_SY - w + 3, w * 2, w * 2 - 6);
    ctx.fillRect(MB_SX - w + 3, MB_SY - w, w * 2 - 6, w * 2);
    // the aim line, so it is obvious the stick points the gun
    if (live) {
      const m = Math.hypot(k.dx, k.dy) || 1, ux = k.dx / m, uy = k.dy / m;
      for (let d = ring + 4; d < ring + 26; d += 4) {
        ctx.fillStyle = 'rgba(255,228,143,0.55)';
        ctx.fillRect(Math.round(MB_SX + ux * d) - 1, Math.round(MB_SY + uy * d) - 1, 2, 2);
      }
    }
    // the knob
    const kx = Math.round(MB_SX + k.dx), ky = Math.round(MB_SY + k.dy), r = 15;
    ctx.fillStyle = '#14141c';
    ctx.fillRect(kx - r, ky - r + 3, r * 2, r * 2 - 6);
    ctx.fillRect(kx - r + 3, ky - r, r * 2 - 6, r * 2);
    const face = live ? '#ffe48f' : '#c2a45e', lip = live ? '#fff6d8' : '#e0c98e';
    ctx.fillStyle = face;
    ctx.fillRect(kx - r + 2, ky - r + 4, r * 2 - 4, r * 2 - 8);
    ctx.fillRect(kx - r + 4, ky - r + 2, r * 2 - 8, r * 2 - 4);
    ctx.fillStyle = lip;
    ctx.fillRect(kx - r + 4, ky - r + 3, r * 2 - 8, 2);
    ctx.fillStyle = '#7a5512';
    ctx.fillRect(kx - r + 4, ky + r - 5, r * 2 - 8, 2);
    // crosshair on the cap
    ctx.fillStyle = '#2a1d08';
    ctx.fillRect(kx - 6, ky - 1, 12, 2);
    ctx.fillRect(kx - 1, ky - 6, 2, 12);
    if (!live) pixelTextOutlined(ctx, 'AIM + FIRE', MB_SX, MB_SY + ring + 6, 5, 'rgba(226,214,180,0.8)', '#14141c', 'center');
  },

  drawWheel(ctx, art, t) {
    const w = this.wheel;
    const cx = MB_WX, cy = MB_WY;
    // mounting plate + compass ticks
    ctx.globalAlpha = w.active ? 0.82 : 0.62;
    drawSprite(ctx, art.base, cx, cy);
    // lit tick in the steered direction
    if (w.mag > 0) {
      const tx = Math.round(cx + Math.cos(w.dragAng) * 40), ty = Math.round(cy + Math.sin(w.dragAng) * 40);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffe48f'; ctx.fillRect(tx - 1, ty - 1, 3, 3);
      ctx.fillStyle = '#fff'; ctx.fillRect(tx, ty, 1, 1);
    }
    // frame index: the art repeats every 45 degrees (8 spokes)
    const sector = TAU / 8;
    let i = Math.round(w.ang / sector * MB_WFRAMES) % MB_WFRAMES;
    if (i < 0) i += MB_WFRAMES;
    const sp = art.frames[i], sh = art.shadows[i];
    ctx.globalAlpha = 0.34;
    drawSprite(ctx, sh, cx + 2, cy + 3);
    ctx.globalAlpha = w.active ? 0.97 : 0.86;
    drawSprite(ctx, sp, cx, cy);
    // king spoke: rope-wrapped grip, marks the true rotation of the helm
    const kd = w.ang - Math.PI / 2;
    ctx.globalAlpha = w.active ? 1 : 0.9;
    drawSprite(ctx, art.king, cx + Math.cos(kd) * (MB_ROUT + 4), cy + Math.sin(kd) * (MB_ROUT + 4), kd);
    // analog throttle: a chunky arc of pips on the rim, opening out with the push
    if (w.mag > 0.02) {
      ctx.globalAlpha = 1;
      const rr = 41, span = 0.26 + w.mag * 1.35, n = Math.max(2, Math.round(span * rr / 1.7));
      const pt = s => {
        const a = w.dragAng + (s / n - 0.5) * span;
        return [Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr)];
      };
      ctx.fillStyle = '#0b0c13';
      for (let s = 0; s <= n; s++) { const q = pt(s); ctx.fillRect(q[0] - 1, q[1] - 1, 4, 4); }
      for (let s = 0; s <= n; s++) { const q = pt(s); ctx.fillStyle = (s & 1) ? '#ffd27a' : '#ffe48f'; ctx.fillRect(q[0], q[1], 2, 2); }
      // thumb knob at the drag point
      drawSprite(ctx, art.knob, cx + w.dx, cy + w.dy);
    }
    ctx.globalAlpha = 1;
  },

  drawButton(ctx, art, b, t) {
    const P = art.plates[b.name];
    const x = Math.round(b.x), y = Math.round(b.y);
    const dn = b.down || b.press > 0.35;
    const oy = dn ? 1 : 0;
    const dim = !b.ready && b.active <= 0;
    const big = b.r >= 30;
    const ls = big ? 7 : (b.name === 'rampage' ? 5 : b.r >= 22 ? 6 : 5);
    const ly = y + oy + b.r - (big ? 19 : b.r >= 22 ? 16 : 15);
    const iy = y + oy - (big ? 7 : 5);

    // ---- plate
    ctx.globalAlpha = dim ? 0.80 : (b.down ? 1 : 0.94);
    drawSprite(ctx, dim ? P.off : (dn ? P.down : P.up), x, y + oy);
    // ---- ready pulse / flash
    if (b.flash > 0) {
      ctx.globalAlpha = Math.min(0.55, b.flash * 0.55);
      drawSprite(ctx, P.hot, x, y + oy);
      ctx.globalAlpha = Math.min(0.85, b.flash);
      this.ringPips(ctx, x, y + oy, Math.round(b.r + 1 + (1 - b.flash) * 11), 1, '#ffffff', null, 1, 3);
    } else if (b.ready && !b.down) {
      ctx.globalAlpha = (0.10 + 0.09 * Math.sin(t * 4 + b.x)) * b.glow;
      drawSprite(ctx, P.hot, x, y + oy);
    }
    ctx.globalAlpha = 1;
    // ---- rampage: liquid fill meter behind the icon
    if (b.name === 'rampage') this.fillMeter(ctx, b, x, y + oy, t);
    // ---- ability running: the whole plate blazes in its own colour
    if (b.active > 0 && b.name !== 'fire') {
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 26);
      drawSprite(ctx, P.act, x, y + oy);
      ctx.globalAlpha = 1;
    }
    // ---- cooldown / charge ring, sitting in the bezel
    const rr = b.r - 3;
    const frac = b.active > 0 ? b.active : b.frac;
    const on = dim ? '#5d6880' : (b.active > 0 ? '#ffffff' : b.tint);
    this.ringPips(ctx, x, y + oy, rr, frac, on, '#0e1626', big ? 2 : 1, 2);
    // ---- icon
    ctx.globalAlpha = dim ? 0.85 : 1;
    drawSprite(ctx, dim ? art.iconsOff[b.icon] : art.icons[b.icon], x, iy);
    ctx.globalAlpha = 1;
    // ---- roll charge pips
    if (b.name === 'roll' && b.maxCharges > 1) {
      const n = Math.min(4, b.maxCharges), w = n * 5 - 1, x0 = x - ((w / 2) | 0), py = ly - 7;
      for (let i = 0; i < n; i++) {
        const lit = i < b.charges;
        ctx.fillStyle = '#0b0c13'; ctx.fillRect(x0 + i * 5 - 1, py - 1, 5, 5);
        ctx.fillStyle = lit ? '#6fd88e' : '#39424f'; ctx.fillRect(x0 + i * 5, py, 3, 3);
        if (lit) { ctx.fillStyle = '#b6f3c8'; ctx.fillRect(x0 + i * 5, py, 1, 1); }
      }
    }
    // ---- label
    pixelText(ctx, b.label, x, ly, ls, dim ? '#7c869c' : b.tint, 'center');
  },

  // a ring of chunky pixel ticks: the cooldown sweep / charge meter
  ringPips(ctx, cx, cy, rr, frac, colOn, colOff, size, spacing) {
    if (rr < 4) return;
    const N = Math.max(16, Math.round(TAU * rr / (spacing || 2)));
    const lit = frac * N;
    const s = size + 1;
    for (let i = 0; i < N; i++) {
      const isOn = i < lit;
      if (!isOn && !colOff) continue;
      const a = -Math.PI / 2 + (i + 0.5) / N * TAU;
      const px = Math.round(cx + Math.cos(a) * rr), py = Math.round(cy + Math.sin(a) * rr);
      ctx.fillStyle = isOn ? colOn : colOff;
      ctx.fillRect(px - (s >> 1), py - (s >> 1), s, s);
    }
  },

  // Otter Rampage: a rising posterised "liquid" inside the plate face
  fillMeter(ctx, b, x, y, t) {
    const r = b.r - 8, h = r * 2;
    const k = clamp(b.meter, 0, 1);
    if (k <= 0 || r < 3) return;
    const fh = Math.round(h * k);
    const full = b.ready || b.active > 0;
    const surf = b.active > 0 ? '#ffe48f' : full ? '#ffd27a' : '#f08040';
    ctx.globalAlpha = 0.62;
    for (let row = 0; row < fh; row++) {
      const yy = y + r - row, dy = yy - y;
      const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      if (half <= 0) continue;
      if (row === fh - 1) continue;
      const band = ((row + Math.floor(t * 10)) % 5) === 0;
      ctx.fillStyle = b.active > 0 ? (Math.floor(t * 12) % 2 ? '#d45434' : '#b23328')
        : full ? (Math.floor(t * 5) % 2 ? '#d45434' : '#b23328')
          : band ? '#a12a20' : '#6e1a16';
      ctx.fillRect(x - half, yy, half * 2, 1);
    }
    // wobbling surface line + a dithered row above it
    const sy = y + r - fh + 1;
    const sdy = sy - y;
    const shalf = Math.round(Math.sqrt(Math.max(0, r * r - sdy * sdy)));
    if (shalf > 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = surf;
      const wob = Math.round(Math.sin(t * 6) * 1);
      ctx.fillRect(x - shalf, sy + wob, shalf * 2, 1);
      ctx.globalAlpha = 0.5;
      for (let i = -shalf; i < shalf; i += 2) ctx.fillRect(x + i, sy + wob - 1, 1, 1);
    }
    ctx.globalAlpha = 1;
  },
};
