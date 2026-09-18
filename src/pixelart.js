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
  ctx.save(); ctx.translate(Math.round(x), Math.round(y));
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
SP.enemyBullet = makeSprite(['Rrk', 'rrk'], { ax: 1, ay: 1 });
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
  const w = size * 2 + 4, h = Math.round(size * 1.6) + 4;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const cx = w / 2, cy = h / 2;
  const ox = rng.range(0, 100), oy = rng.range(0, 100);
  const mask = [];
  for (let y = 0; y < h; y++) { mask.push([]); for (let x = 0; x < w; x++) {
    const nx = (x - cx) / (size), ny = (y - cy) / (size * 0.8);
    const ang = Math.atan2(ny, nx);
    const bump = Math.sin(ang * 3 + ox) * 0.08 + Math.sin(ang * 5 + oy) * 0.06 + Math.sin(ang * 7 + ox * 2) * 0.04;
    const r = Math.hypot(nx, ny) + bump + (vnoise(x * 0.09 + ox, y * 0.09 + oy) - 0.5) * 0.22;
    mask[y].push(r < 0.93);
  } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y][x]) continue;
    const edge = !(mask[y - 1]?.[x] && mask[y + 1]?.[x] && mask[y][x - 1] && mask[y][x + 1]);
    let col;
    if (edge) col = PAL.k;
    else {
      const shade = vnoise(x * 0.18 + ox, y * 0.18 + oy) * 0.7 + (cy - y) / h * 0.7 + (cx - x) / w * 0.35;
      col = shade > 0.78 ? '#9a9ea8' : shade > 0.55 ? '#7c818b' : shade > 0.32 ? '#5e636d' : '#454a53';
      // cracks & moss
      if (vnoise(x * 0.6 + oy, y * 0.6 + ox) > 0.78) col = '#3a3e46';
      if (shade > 0.6 && vnoise(x * 0.3 + ox * 3, y * 0.3 + oy * 3) > 0.72) col = '#4f8f5a';
      // wet dark base near the waterline (bottom edge)
      const below = mask[y + 2]?.[x] === false || mask[y + 1]?.[x] === false;
      if (below) col = '#33373f';
    }
    ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
  }
  return { c, w, h, ax: cx, ay: cy };
}

// ============================ UI ICONS ================================
SP.iconWeapon = makeSprite(['kkkkkkk', 'kMMMMMk', 'kkxxkkk', '.kxk...', '.kkk...'], { ax: 0, ay: 0 });
SP.iconUtil = makeSprite(['..kkk..', '.kLLLk.', 'kLlwlLk', 'kLwwwLk', 'kLlwlLk', '.kLLLk.', '..kkk..'], { ax: 0, ay: 0 });
SP.iconMob = makeSprite(['....kk.', '..kkGGk', 'kkGGGGk', 'kGGGGk.', 'kkGGkk.', '..kkk..', '.......'], { ax: 0, ay: 0 });
SP.iconStat = makeSprite(['.kk.kk.', 'kRrkRrk', 'kRrrrrk', '.krrrk.', '..krk..', '...k...', '.......'], { ax: 0, ay: 0 });
SP.skull = makeSprite(['.kkkkk.', 'kwwwwwk', 'kwkwkwk', 'kwwwwwk', '.kwkwk.', '.kkkkk.'], { ax: 3, ay: 3 });
SP.star = makeSprite(['..y..', '.yYy.', 'yYwYy', '.yYy.', '..y..'], { ax: 2, ay: 2 });
