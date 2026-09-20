// ---- Pixel art: palette, sprite builder, hand-drawn sprites -------------
const PAL = {
  '.': null,
  k: '#14141c', K: '#000000', w: '#ffffff', W: '#e6f2ff',
  // manatee grays
  G: '#8a9599', g: '#6a757a', h: '#b4bfc0', d: '#4b5459', n: '#2c3236', j: '#9fabad',
  // otter browns
  B: '#8a5a33', b: '#6a3f22', c: '#d2ad78', D: '#43281a',
  // wood
  T: '#b57d3f', t: '#8f5c2c', u: '#5c3a1c', U: '#d9a25a',
  // metal
  M: '#aeb6c1', m: '#7d858f', x: '#4a515a', X: '#2e333a',
  // red / blood
  r: '#c8302e', R: '#ff6161', q: '#7c1414',
  // yellow / orange / flash
  y: '#f2c744', Y: '#ffe48f', o: '#e6802a', f: '#ffd27a',
  // green
  e: '#2f9e5b', E: '#6fd88e', v: '#1d6b3c',
  // blue
  l: '#3f7fd6', L: '#8ac6ff', i: '#1e3f7a',
  // skin
  s: '#e9b78c', S: '#c68a5c',
  // shark
  a: '#5b6f8c', A: '#8397b3', z: '#dde5ee', Z: '#3f5068',
  // misc
  p: '#ff9ecb', P: '#c0392b', O: '#ff9a3c',
};

const SP = {};
function makeSprite(rows, opts = {}) {
  const pal = Object.assign({}, PAL, opts.pal || {});
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const col = pal[rows[y][x]];
    if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
  }
  return { c, w, h, ax: opts.ax ?? w / 2, ay: opts.ay ?? h / 2 };
}
function flipSprite(s) {
  const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
  const ctx = c.getContext('2d'); ctx.translate(s.w, 0); ctx.scale(-1, 1); ctx.drawImage(s.c, 0, 0);
  return { c, w: s.w, h: s.h, ax: s.w - s.ax, ay: s.ay };
}
function tintSprite(s, color, alpha = 0.7) {
  const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
  const ctx = c.getContext('2d'); ctx.drawImage(s.c, 0, 0);
  ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(0, 0, s.w, s.h);
  return { c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}
// draw sprite at world->screen position with rotation/scale
function drawSprite(ctx, s, x, y, rot = 0, sx = 1, sy = 1) {
  // snap to the layer's pixel grid, not to whole world units, or half the
  // resolution of a DETAIL-scaled layer is thrown away on placement alone
  ctx.save(); ctx.translate(Math.round(x * DETAIL) / DETAIL, Math.round(y * DETAIL) / DETAIL);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.drawImage(s.c, -s.ax, -s.ay);
  ctx.restore();
}

// ============================ MANATEE ==================================
// Body (head right). Tail is a separate sprite so it can flick.
const MANATEE_BODY = [
  '.............kkkkkkkkkk......',
  '.........kkkkddGGGGGGGkkk....',
  '.......kkdGGGGGGGGGGGGGGGkk..',
  '.....kkdGGGGGGGGGGGGGGGGGGGk.',
  '...kkdGGGGGGGGGGGGGGGGGGGGGk.',
  '..kdGGGGGGGGGGGGGGGGGGGGkkGk.',
  '.kdGGGGGGGGGGGGGGGGGGGGGkwkk.',
  'kdGGGGGGGGGGGGGGGGGGGGGGGGGGk',
  'kGGGGGGGGGGGGGGGGGGGGGGGGGhhk',
  'kGGGGGGGGGGGGGGGGGGGGGGGGhnhk',
  'kGGGGGGGGGGGGGGGGGGGGGGGhhhhk',
  'kgGGGGGGGGGGGGGGGGGGGGGhhhkhk',
  'kggGGGGGGGGGGGGGGGGGGGhhhhhkk',
  'kgggGGGGGGGGGGGGGGGGGhhhhhhk.',
  'kggggGGGGGGGGGGGGGGGhhhhhhk..',
  'kgggggGGGGGGGGGGGGhhhhhhhk...',
  '.kgggggggggggggghhhhhhhhkk...',
  '..kkggggggggkkkkhhhhhhkkk....',
  '....kkkkkkkk....kkkkkk.......',
];
const MANATEE_TAIL = [
  '....kkkk.....',
  '..kkdGGGkk...',
  '.kdGGGGGGGkk.',
  'kdGGGGGGGGGkk',
  'kGGGGGGGGGGGk',
  'kgGGGGGGGGGGk',
  'kggGGGGGGGGGk',
  'kgggGGGGGGGkk',
  '.kgggggGGGkk.',
  '..kkgggggkk..',
  '....kkkkk....',
];
const MANATEE_FLIPPER = [
  'kkkk....',
  'kGGGkk..',
  'kgGGGGk.',
  '.kggGGGk',
  '..kkgggk',
  '....kkk.',
];
const BELLY_PAL = { G: '#b9c5c6', g: '#9aa7a9', h: '#e0e8e8', d: '#7d888c' };
SP.manateeBody = makeSprite(MANATEE_BODY, { ax: 12, ay: 10 });
SP.manateeTail = makeSprite(MANATEE_TAIL, { ax: 12, ay: 5 });
SP.manateeFlipper = makeSprite(MANATEE_FLIPPER, { ax: 1, ay: 1 });
SP.manateeBodyBelly = makeSprite(MANATEE_BODY, { ax: 12, ay: 10, pal: BELLY_PAL });
SP.manateeTailBelly = makeSprite(MANATEE_TAIL, { ax: 12, ay: 5, pal: BELLY_PAL });
SP.manateeBodyHurt = tintSprite(SP.manateeBody, '#ffffff', 0.85);
SP.manateeTailHurt = tintSprite(SP.manateeTail, '#ffffff', 0.85);

// ============================ OTTER ====================================
const OTTER = [
  '...kk..kk.....',
  '..kBBkkBBk....',
  '..kBBBBBBk....',
  '.kBBBkBkBBk...',
  '.kBBcccccBk...',
  '.kBccckcccBk..',
  '..kBcccccBk...',
  '..kkBBBBBkk...',
  '.kBBBBBBBBBk..',
  'kBBBBBBBBBBBkk',
  'kBBBBBBBBBBBBk',
  'kDBBBBBBBBBkk.',
  '.kDDBBBBBBk...',
  '..kDDDDDDk....',
  '...kkkkkk.....',
];
const OTTER_TAIL = ['kkk..', 'kDDk.', 'kDDDk', '.kDDk', '..kk.'];
SP.otter = makeSprite(OTTER, { ax: 7, ay: 8 });
SP.otterTail = makeSprite(OTTER_TAIL, { ax: 4, ay: 0 });
SP.otterRampage = tintSprite(SP.otter, '#ff5030', 0.35);

// ============================ GUNS =====================================
const GUNS = {
  revolver: ['kkkkkkkk.', 'kMMMMMMMk', 'kkkxxkkk.', '..kxk....', '..kkk....'],
  shotgun: ['kkkkkkkkkkkkkkk', 'kuuTTMMMMMMMMMk', 'kuuukkMMMMMMMk.', '.kukkkkkkkkkk..', '..kk...........'],
  rifle: ['......kkk.......', 'kkkkkkkXkkkkkkkk', 'kuuTTTxxxMMMMMMk', 'kuuukkkxkkkkkkk.', '.kuk..kxk.......', '..kk..kkk.......'],
  smg: ['kkkkkkkkkkk..', 'kXXXXXXXXXXk.', 'kkXXkkkkXXkk.', '..kXk..kXXk..', '..kkk..kXXk..', '.......kkk...'],
  harpoon: ['kkkkkkkkkkkkkkkkkk.', 'kuuTTxxxxxxxxMMMMMk', 'kuuukkkkxkkkkkkkkk.', '.kukk..kxk.........', '..kk...kkk.........'],
  grenade: ['kkkkkkkkkkkkk.', 'kuTTvvvvvvvvvk', 'kuTTveeeeeeevk', 'kuukkvvvvvvvvk', '.kukkkkxkkkkk.', '..kk..kxk.....', '......kkk.....'],
  flak: ['kkkkkkkkkkkkkkkkk', 'kuTTxxXXXXXXXXXXk', 'kuTTxxkkkkkkkkkkk', 'kuTTxxXXXXXXXXXXk', 'kuukkkkkxkkkkkkkk', '.kuk...kxk.......', '..kk...kkk.......'],
};
SP.guns = {};
for (const k in GUNS) SP.guns[k] = makeSprite(GUNS[k], { ax: 2, ay: 1 });
SP.muzzle = makeSprite(['..Yy..', '.YfffY', 'YfwwfY', '.YfffY', '..Yy..'], { ax: 0, ay: 2 });
SP.muzzleBig = makeSprite(['...YYy...', '..Yfffy..', '.YffwffY.', 'YfwwwwfyO', '.YffwffY.', '..Yfffy..', '...YYy...'], { ax: 0, ay: 3 });

// ============================ ENEMY BOATS ==============================
// All boats are top-down, bow pointing RIGHT.
const DINGHY = [
  '.....kkkkkkkkkkkkkkkkk......',
  '...kkuTTTTTTTTTTTTTTTTkkk...',
  '..kuTTtttttttttttttttttTTkk.',
  'kkkuTtttutttttkkkttttutttTTk',
  'kxkuTtttutttttkyyktttutttTTk',
  'kxkuTtttutttttkyyktttutttTTk',
  'kkkuTtttutttttkkkttttutttTTk',
  '..kuTTtttttttttttttttttTTkk.',
  '...kkuTTTTTTTTTTTTTTTTkkk...',
  '.....kkkkkkkkkkkkkkkkk......',
];
const NETTER = [
  '......kkkkkkkkkkkkkkkkkkk.....',
  '....kkuTTTTTTTTTTTTTTTTTTkk...',
  '..kkuTTtttteeeetttttttttttTkk.',
  'kkkuTttttteEeEettttkkktttttTTk',
  'kxkuTtttttEeEeEttttkyyktttttTk',
  'kxkuTtttttEeEeEttttkyyktttttTk',
  'kkkuTttttteEeEettttkkktttttTTk',
  '..kkuTTtttteeeetttttttttttTkk.',
  '....kkuTTTTTTTTTTTTTTTTTTkk...',
  '......kkkkkkkkkkkkkkkkkkk.....',
];
const HARPOONER = [
  '......kkkkkkkkkkkkkkkkkkkkk.....',
  '....kkxMMMMMMMMMMMMMMMMMMMkkk...',
  '..kkxMmmmmmmmmmmmmmmmmmmmmmMkk..',
  'kkkxMmmmmmmkkkmmmmmmmmmmmkkmmMkk',
  'kXkxMmmmmmkyykmmmmmmmmmmkXXkMMMk',
  'kXkxMmmmmmkyykmmmmmmmmmmkXXXkkkk',
  'kkkxMmmmmmmkkkmmmmmmmmmmmkkmmMkk',
  '..kkxMmmmmmmmmmmmmmmmmmmmmmMkk..',
  '....kkxMMMMMMMMMMMMMMMMMMMkkk...',
  '......kkkkkkkkkkkkkkkkkkkkk.....',
];
const SPEEDBOAT = [
  '.......kkkkkkkkkkkkkkkkkkkkkkk......',
  '.....kkWWWWWWWWWWWWWWWWWWWWWWWkkk...',
  '...kkWWrrrrrrrrrrrrrrrrrrrrrrrWWkkk.',
  'kkkkWWrrrrXXXXXrrrrkkkrrrrrrrrrWWWkk',
  'kXXkWWrrrrXLLLXrrrkyyykrrrrrrrrrWWWk',
  'kXXkWWrrrrXLLLXrrrkyyykrrrrrrrrrWWWk',
  'kkkkWWrrrrXXXXXrrrrkkkrrrrrrrrrWWWkk',
  '...kkWWrrrrrrrrrrrrrrrrrrrrrrrWWkkk.',
  '.....kkWWWWWWWWWWWWWWWWWWWWWWWkkk...',
  '.......kkkkkkkkkkkkkkkkkkkkkkk......',
];
const JETSKI = [
  '....kkkkkkkkkkkkk...',
  '..kkyyyyyyyyyyyyykk.',
  'kkkyyyyykkkyyyyyyyyk',
  'kXkyyyyykrrkyyyyyykk',
  'kXkyyyyykrrkyyyyyykk',
  'kkkyyyyykkkyyyyyyyyk',
  '..kkyyyyyyyyyyyyykk.',
  '....kkkkkkkkkkkkk...',
];
const DYNABOAT = [
  '.....kkkkkkkkkkkkkkkkkkkk.....',
  '...kkuTTTTTTTTTTTTTTTTTTTkk...',
  '..kuTTkkkkkkkttttttttttttTkk..',
  'kkkuTtkrrrrrktttttkkkttttTTTk.',
  'kxkuTtkrPrPrktttttkyyktttttTTk',
  'kxkuTtkrrrrrktttttkyyktttttTTk',
  'kkkuTtkrPrPrktttttkkkttttTTTk.',
  '..kuTTkkkkkkkttttttttttttTkk..',
  '...kkuTTTTTTTTTTTTTTTTTTTkk...',
  '.....kkkkkkkkkkkkkkkkkkkk.....',
];
const TRAWLER = [
  '........kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk........',
  '......kkuTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTkkk.....',
  '....kkuTTtttttttttttttttttttttttttttttttttTTkkk...',
  '..kkuTTttteeeeeeetttttkkkkkkkkkttttttttttttTTTkk..',
  'kkkuTtttteEeEeEeEtttttkxxxxxxxkttkkktttttttttTTTk.',
  'kxkuTttttEeEeEeEettttkxMMMMMxxkttkyyktttutttttTTTk',
  'kxkuTttttEeEeEeEettttkxMMMMMxxkttkyyktttutttttTTTk',
  'kxkuTtttteEeEeEeEtttttkxxxxxxxkttkkktttttttttTTTk.',
  'kkkuTTtttteeeeeeetttttkkkkkkkkkttttttttttttTTTkk..',
  '..kkuTTtttttttttttttttttttttttttttttttttttTTkkk...',
  '....kkuTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTkkk.....',
  '......kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.......',
];
const GUNBOAT = [
  '.......kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk........',
  '.....kkXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkkk.....',
  '...kkXxxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXxxxkkk...',
  'kkkXxxXXXXXXXXXkkkkkXXXXXXXXXXXXXXXXXXXxxxxkk.',
  'kXkXxxXXXXXXXXkmmmmmkXXXXXXXXXXkkkXXXXXXXxxxxk',
  'kXkXxxXXXXXXXXkmMMMmkkkkkkkkkkkyykXXXXXXXxxxxk',
  'kXkXxxXXXXXXXXkmmmmmkXXXXXXXXXXkkkXXXXXXXxxxxk',
  'kkkXxxXXXXXXXXXkkkkkXXXXXXXXXXXXXXXXXXXxxxxkk.',
  '...kkXxxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXxxxkkk...',
  '.....kkXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkkk.....',
  '.......kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk........',
];
SP.boats = {
  dinghy: makeSprite(DINGHY, { ax: 14, ay: 5 }),
  netter: makeSprite(NETTER, { ax: 15, ay: 5 }),
  harpooner: makeSprite(HARPOONER, { ax: 16, ay: 5 }),
  speedboat: makeSprite(SPEEDBOAT, { ax: 18, ay: 5 }),
  jetski: makeSprite(JETSKI, { ax: 10, ay: 4 }),
  dynaboat: makeSprite(DYNABOAT, { ax: 15, ay: 5 }),
  trawler: makeSprite(TRAWLER, { ax: 25, ay: 6 }),
  gunboat: makeSprite(GUNBOAT, { ax: 23, ay: 5 }),
};
SP.boatsHurt = {};
for (const k in SP.boats) SP.boatsHurt[k] = tintSprite(SP.boats[k], '#ffffff', 0.8);

// ============================ BOSS: CHIEF ON SHARK =====================
const SHARK = [
  '..................................kkkkkkkkkk........................',
  '......kk......................kkkkaaaaaaaaaakkkkkk..................',
  '.....kZak..................kkkaaaaaaaaaaaaaaaaaaakkkkk..............',
  '.....kZZak...............kkaaaaaaaaaaaaaaaaaaaaaaaaaakkkkk..........',
  '......kZZak............kkaaaaaaaaaaaaaaaakkkaaaaaaaaaaaaakkkk.......',
  '......kZZZak.........kkaaaaaaaaaaaaaaaakkTTTkkaaaaaaaaaaaaaaakkk....',
  '.......kZZZak......kkaaaaAAAAAAAAAAAAAkTTTTTTTkAAAAAAAAAaaaaaaaakk..',
  '.......kZZZZakkkkkkaaaaAAAAAAAAAAAAAAkTTTTTTTTTkAAAAAAAAAAAaaaaaaakk',
  'kkkkkkkkZZZZZZZZZZaaaAAAAAAAAAAAAAAAkTTTTTTTTTTkAAAAAAAAAAAAAaaaaaak',
  'kZZZZZZZZZZZZZZZZZaaAAAAAAAzzzAAAAAAkTTrrrrrTTkAAAAAAAAAAAAAAAkaaaak',
  'kZZZZZZZZZZZZZZZZZaaAAAAAzzzzzzzAAAAkTTrssssTTkAAAAAAAAAAAAAAkwkaaak',
  'kkkkkkkkZZZZZZZZZZaaaAAAAAAzzzAAAAAAAkTTssssTkAAAAAAAAAAAAAAAAkaaaak',
  '.......kZZZZakkkkkkaaaaAAAAAAAAAAAAAAAkkkkkkkAAAAAAAAAAAAAaaaaaaaakk',
  '.......kZZZak......kkaaaaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaaaaaaaaaaakk.',
  '......kZZZak.........kkaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaakkk.',
  '......kZZak............kkaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaakkk...',
  '.....kZZak...............kkaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaakkk.....',
  '.....kZak..................kkkaaaaaaaaaaaaaaaaaaaaaaaaaaakkkk.......',
  '......kk......................kkkkaaaaaaaaaaaaaaaaaaaakkkk..........',
  '..................................kkkkkkkkkkkkkkkkkkkkk.............',
];
SP.shark = makeSprite(SHARK, { ax: 40, ay: 10 });
SP.sharkHurt = tintSprite(SP.shark, '#ffffff', 0.8);
SP.sharkRage = tintSprite(SP.shark, '#ff3020', 0.3);
SP.sharkFin = makeSprite(['...k...', '..kak..', '.kZak..', 'kZZaak.', 'kkkkkkk'], { ax: 3, ay: 4 });
SP.spear = makeSprite(['kkkkkkkkkkkkMk', 'kuTTTTTTTTTkMMk', 'kkkkkkkkkkkkMk'], { ax: 7, ay: 1 });

// ============================ FISHERMAN (standing, for the pier) ========
const FISHERMAN = [
  '....kkkk....',
  '..kkyyyykk..',
  '.kyyyyyyyyk.',
  '.kkkkkkkkkk.',
  '...kssssk...',
  '...kskskk...',
  '...ksssSk...',
  '....kSSk....',
  '..kklllllkk.',
  '.ksklllllksk',
  '.kskllklllsk',
  '.kkkllklllkk',
  '...kllklllk.',
  '...kkkkkkkk.',
  '...kuukuuk..',
  '...kuukuuk..',
  '...kuukuuk..',
  '..kkkkkkkkk.',
  '..kDDDkDDDk.',
  '..kkkkkkkkk.',
];
SP.fisherman = makeSprite(FISHERMAN, { ax: 6, ay: 19 });
SP.fishermanDead = tintSprite(SP.fisherman, '#ff3030', 0.5);

// ============================ PROJECTILES ==============================
SP.bullet = makeSprite(['Yyyk', 'wwYk'], { ax: 2, ay: 1 });
SP.bulletBig = makeSprite(['.Yyyyk', 'Ywwwyk', '.Yyyyk'], { ax: 3, ay: 1 });
SP.pellet = makeSprite(['Yk', 'yk'], { ax: 1, ay: 1 });
SP.harpoonShot = makeSprite(['uTTTTTTTMMk', 'kkkkkkkkMk.'], { ax: 5, ay: 0 });
SP.grenadeShot = makeSprite(['.kkk.', 'kvEek', 'kveek', '.kkk.'], { ax: 2, ay: 2 });
SP.flakShot = makeSprite(['kkk', 'kOk', 'kkk'], { ax: 1, ay: 1 });
SP.enemyBullet = makeSprite([
  '.kkkk.',
  'kRRwwk',
  'kRwwrk',
  'kqrrrk',
  '.kkkk.',
], { ax: 3, ay: 2 });
SP.buckshotBig = makeSprite([
  '.kk.',
  'kRwk',
  'kqrk',
  '.kk.',
], { ax: 2, ay: 2 });
// a baited hook drifting on a longline
SP.hookShot = makeSprite([
  '.kkk.',
  'kMMMk',
  'kMwMk',
  'kMMMk',
  '.kMk.',
  '.kMk.',
  'kMMk.',
  '.kk..',
], { ax: 2, ay: 4 });
// a crab pot, dropped in your path
SP.potShot = makeSprite([
  '.kkkkk.',
  'kTUTUTk',
  'kUTkTUk',
  'kTUkUTk',
  'kUTUTUk',
  '.kkkkk.',
], { ax: 3, ay: 3 });
// a signal flare: the spotter calling the fleet onto you
SP.flareShot = makeSprite([
  '..kk..',
  '.kffk.',
  'kfwwfk',
  'kfwwfk',
  '.kOfk.',
  '..kk..',
], { ax: 3, ay: 3 });
SP.enemyHarpoon = makeSprite(['xxxxxxxxMMk', 'kkkkkkkkMk.'], { ax: 5, ay: 0 });
SP.net = makeSprite([
  '.k.k.k.k.k.k.',
  'kEkEkEkEkEkEk',
  '.k.k.k.k.k.k.',
  'kEkEkEkEkEkEk',
  '.k.k.k.k.k.k.',
  'kEkEkEkEkEkEk',
  '.k.k.k.k.k.k.',
  'kEkEkEkEkEkEk',
  '.k.k.k.k.k.k.',
], { ax: 6, ay: 4 });
SP.dynamite = makeSprite(['....Yk', '...kk.', '.kkkk.', 'krrrrk', 'kPrPrk', 'krrrrk', '.kkkk.'], { ax: 3, ay: 4 });
SP.buckshot = makeSprite(['Ok', 'kk'], { ax: 1, ay: 1 });

// ---- salvaged kit the boats leave behind ---------------------------------
// A boat fixer: the otter's patch kit, hull plate and a roll of tape.
SP.item = {};
SP.item.repair = makeSprite([
  '.kkkkkkk.',
  'kTUUUUUTk',
  'kUEEEEEUk',
  'kUEwwwEUk',
  'kUEwEwEUk',
  'kUEwwwEUk',
  'kUEEEEEUk',
  'kTUUUUUTk',
  '.kkkkkkk.',
], { ax: 4, ay: 4 });
// A plate of hull armour, still wet.
SP.item.plate = makeSprite([
  '.kkkkkk.',
  'kMMMMMMk',
  'kMzzzzMk',
  'kMzXXzMk',
  'kMzXXzMk',
  'kMzzzzMk',
  'kMMMMMMk',
  '.kkkkkk.',
], { ax: 4, ay: 4 });
// A jerry can of fuel: straight into the rampage meter.
SP.item.tonic = makeSprite([
  '..kkk..',
  '.kOOOk.',
  'kOffOOk',
  'kOfwfOk',
  'kOffOOk',
  'kOOOOOk',
  '.kkkkk.',
], { ax: 3, ay: 3 });
SP.shell = makeSprite(['yYk', 'ook'], { ax: 1, ay: 1 });

// ============================ PICKUPS ==================================
const SCRAP_ICONS = {
  metal: ['..kkkk..', '.kMmmMk.', 'kMmkkmMk', 'kmkMMkmk', 'kmkMMkmk', 'kMmkkmMk', '.kMmmMk.', '..kkkk..'],
  wood: ['.....kkk', '....kTTk', '...kTtuk', '..kTtuk.', '.kTtuk..', 'kTtuk...', 'kuuk....', 'kkk.....'],
  fuel: ['..kkk...', '..kyk...', 'kkkkkkkk', 'krrrrrrk', 'krRRrrrk', 'krrkkrrk', 'krrrrrrk', 'kkkkkkkk'],
  powder: ['.kkkkkk.', 'kXXXXXXk', 'kXkXXkXk', 'kXXkkXXk', 'kXXkkXXk', 'kXkXXkXk', 'kXXXXXXk', '.kkkkkk.'],
  tech: ['k.k.k.k.', 'kkkkkkkk', 'kveeeevk', 'keEeeEek', 'keeEEeek', 'kveeeevk', 'kkkkkkkk', 'k.k.k.k.'],
};
SP.scrap = {};
for (const k in SCRAP_ICONS) SP.scrap[k] = makeSprite(SCRAP_ICONS[k], { ax: 4, ay: 4 });
SP.heart = makeSprite(['.kk.kk.', 'kRrkRrk', 'kRrrrrk', '.krrrk.', '..krk..', '...k...'], { ax: 3, ay: 3 });
SP.buoy = makeSprite(['..kk..', '.kRrk.', 'kRrrrk', 'kwwwwk', 'krrrrk', '.kkkk.'], { ax: 3, ay: 3 });

// ============================ VILLAGE PROPS ============================
const HUT = [
  '..kkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
  '.kuTTTTTTTTTTTTTTTTTTTTTTTTTTuk.',
  'kuTTTTTTTTTTTTTTTTTTTTTTTTTTTTuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuTtttttttttttttttttttttttttttuk',
  'kuTTTTTTTTTTTTTTTTTTTTTTTTTTTTuk',
  '.kuTTTTTTTTTTTTTTTTTTTTTTTTTTuk.',
  '..kkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
];
SP.hut = makeSprite(HUT, { ax: 16, ay: 8 });
SP.hutRed = makeSprite(HUT, { ax: 16, ay: 8, pal: { T: '#b34a3a', t: '#8a3327', u: '#5a1f18' } });
SP.hutGreen = makeSprite(HUT, { ax: 16, ay: 8, pal: { T: '#4f8f5a', t: '#356b40', u: '#22452a' } });
SP.barrel = makeSprite(['.kkkk.', 'kuTTuk', 'kTttTk', 'kuTTuk', 'kTttTk', '.kkkk.'], { ax: 3, ay: 3 });
SP.crate = makeSprite(['kkkkkkk', 'kTtttTk', 'ktTtTtk', 'kttTttk', 'ktTtTtk', 'kTtttTk', 'kkkkkkk'], { ax: 3, ay: 3 });

// ============================ PROCEDURAL ROCKS =========================
function makeRock(seed, size) {
  const rng = new SeededRandom(seed);
  const kind = rng.next();
  const W = Math.round(size * 2.6) + 8, H = Math.round(size * 2.2) + 8;
  const cx = W / 2, cy = H / 2;

  // ---- silhouette: a few overlapping lobes, varied by type
  const lobes = [];
  if (kind < 0.34) {                       // squat boulder
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU), d = rng.range(0, size * 0.42);
      lobes.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.72,
                   rx: rng.range(size * 0.52, size * 0.88), ry: rng.range(size * 0.44, size * 0.74) });
    }
  } else if (kind < 0.67) {                // a stack of two or three
    let y = cy + size * 0.42, r = size * 0.95;
    for (let i = 0; i < 3; i++) {
      lobes.push({ x: cx + rng.range(-size * 0.2, size * 0.2), y, rx: r, ry: r * rng.range(0.5, 0.68) });
      y -= r * 0.52; r *= rng.range(0.6, 0.78);
      if (r < size * 0.28) break;
    }
  } else {                                 // long low reef shelf
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      lobes.push({ x: cx + (i / (n - 1) - 0.5) * size * 1.7, y: cy + rng.range(-size * 0.16, size * 0.16),
                   rx: rng.range(size * 0.45, size * 0.7), ry: rng.range(size * 0.4, size * 0.62) });
    }
  }
  const f = blobField(W, H, lobes);

  // ---- shade it like the rest of the art, then rough it up
  const ramp = ['#22262c', '#33373f', '#474d56', '#5f656f', '#787e88'];
  const { c, ctx } = shadeBlob(W, H, f, ramp, { outline: '#14141c', smooth: 2, lift: 0.14 });
  const ox = rng.range(0, 90), oy = rng.range(0, 90);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x; if (f[i] <= 0.03) continue;
    const n = vnoise(x * 0.34 + ox, y * 0.34 + oy);
    if (n > 0.84) { ctx.fillStyle = '#1b1f25'; ctx.fillRect(x, y, 1, 1); }           // cracks
    else if (n < 0.11) { ctx.fillStyle = '#8b919b'; ctx.fillRect(x, y, 1, 1); }      // chipped facets
    // algae only clings to the upper, lit faces
    if (f[i] > 0.12 && f[i - W] <= 0.03 && rng.next() < 0.55) {
      ctx.fillStyle = rng.next() < 0.5 ? '#4f8f5a' : '#3c7047'; ctx.fillRect(x, y, 1, 1);
      if (rng.next() < 0.4) ctx.fillRect(x, y + 1, 1, 1);
    }
    // a wet dark band low down where the water keeps it soaked
    if (f[i] > 0.05 && f[i + W * 2] <= 0.03) { ctx.fillStyle = '#23262c'; ctx.fillRect(x, y, 1, 1); }
  }
  // barnacles + a limpet or two
  const nb = Math.round(size / 5);
  for (let i = 0; i < nb; i++) {
    const a = rng.range(0, TAU), d = rng.range(0, size * 0.7);
    const bx = Math.round(cx + Math.cos(a) * d), by = Math.round(cy + Math.sin(a) * d * 0.8);
    if (bx < 2 || by < 2 || bx >= W - 2 || by >= H - 2 || f[by * W + bx] <= 0.15) continue;
    ctx.fillStyle = '#cfd4da'; ctx.fillRect(bx, by, 2, 2);
    ctx.fillStyle = '#7d838c'; ctx.fillRect(bx, by + 1, 2, 1);
    ctx.fillStyle = '#14141c'; ctx.fillRect(bx, by, 1, 1);
  }

  // ---- foam fringe: the real silhouette dilated by a few pixels, so the
  //      surf hugs the rock instead of sitting in a floating ellipse
  const FW = W + 10, FH = H + 10;
  const inside = (x, y) => { const xx = x - 5, yy = y - 5; return xx >= 0 && yy >= 0 && xx < W && yy < H && f[yy * W + xx] > 0.03; };
  // distance from the silhouette, 1..4
  const ring = new Uint8Array(FW * FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (inside(x, y)) continue;
    let best = 99;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (!inside(x + dx, y + dy)) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d < best) best = d;
    }
    if (best <= 4) ring[y * FW + x] = best;
  }
  // three dithered variants so the surf churns instead of sitting still
  const foams = [];
  for (let v = 0; v < 3; v++) {
    const fc = document.createElement('canvas'); fc.width = FW; fc.height = FH;
    const fx = fc.getContext('2d');
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const d = ring[y * FW + x]; if (!d) continue;
      const h = hash2(x * 3 + v * 131, y * 3 + v * 57);
      const keep = d === 1 ? h < 0.94 : d === 2 ? h < 0.62 : d === 3 ? h < 0.30 : h < 0.12;
      if (!keep) continue;
      fx.fillStyle = d <= 1 ? '#ffffff' : d === 2 ? '#e4f6ff' : '#bfe6f5';
      fx.fillRect(x, y, 1, 1);
    }
    foams.push({ c: fc, w: FW, h: FH, ax: cx + 5, ay: cy + 5 });
  }
  const spr = { c, w: W, h: H, ax: cx, ay: cy };
  spr.foams = foams; spr.foam = foams[0];
  return spr;
}

// ============================ UI ICONS ================================
SP.iconWeapon = makeSprite(['kkkkkkk', 'kMMMMMk', 'kkxxkkk', '.kxk...', '.kkk...'], { ax: 0, ay: 0 });
SP.iconUtil = makeSprite(['..kkk..', '.kLLLk.', 'kLlwlLk', 'kLwwwLk', 'kLlwlLk', '.kLLLk.', '..kkk..'], { ax: 0, ay: 0 });
SP.iconMob = makeSprite(['....kk.', '..kkGGk', 'kkGGGGk', 'kGGGGk.', 'kkGGkk.', '..kkk..', '.......'], { ax: 0, ay: 0 });
SP.iconStat = makeSprite(['.kk.kk.', 'kRrkRrk', 'kRrrrrk', '.krrrk.', '..krk..', '...k...', '.......'], { ax: 0, ay: 0 });
SP.skull = makeSprite(['.kkkkk.', 'kwwwwwk', 'kwkwkwk', 'kwwwwwk', '.kwkwk.', '.kkkkk.'], { ax: 3, ay: 3 });
SP.star = makeSprite(['..y..', '.yYy.', 'yYwYy', '.yYy.', '..y..'], { ax: 2, ay: 2 });
