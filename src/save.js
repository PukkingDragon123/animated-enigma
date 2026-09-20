// ---- Persistence: progress that outlives the tab -------------------------
// Everything in here is defensive on purpose. localStorage throws in private
// mode, can be switched off entirely, and whatever is in the slot may have
// been written by an older build or edited by hand. A failed save is never a
// crash and never a visible error: the game just runs without progress.
//
//   Save.available         storage actually works
//   Save.load()            -> validated plain object, or null
//   Save.save(data)        -> bool, debounced, never throws
//   Save.flush()           force a pending write out now
//   Save.clear()           wipe the slot
//   Save.data              currently loaded object (or a fresh default)
//   Save.captureFrom(game) live game state -> saveable object
//   Save.applyTo(game)     loaded progress -> fresh game/tree
//   Save.summary()         { waves, kills, hasProgress, ... } for the menu
(function (global) {
  'use strict';

  const KEY = 'manatee.save.v1';
  const VERSION = 3;          // bump when the shape changes
  const DEBOUNCE_MS = 700;    // never serialise on a frame boundary
  const SCRAP_KEYS = ['metal', 'wood', 'fuel', 'powder', 'tech'];
  const MAX_BYTES = 256 * 1024;

  // ---------------------------------------------------------------- storage
  // Probed once. If the probe throws (Safari private mode, blocked cookies,
  // no storage at all) every later call becomes a silent no-op.
  let store = null;
  try {
    const ls = global.localStorage;
    const probe = '__mt_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    store = ls;
  } catch (e) { store = null; }

  function rawGet() {
    if (!store) return null;
    try { return store.getItem(KEY); } catch (e) { return null; }
  }
  function rawSet(str) {
    if (!store) return false;
    try { store.setItem(KEY, str); return true; } catch (e) { return false; }
  }
  function rawDel() {
    if (!store) return false;
    try { store.removeItem(KEY); return true; } catch (e) { return false; }
  }

  // ------------------------------------------------------------- validation
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, def, lo, hi) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return def;
    return Math.min(hi === undefined ? 1e12 : hi, Math.max(lo === undefined ? 0 : lo, n));
  };
  const int = (v, def, lo, hi) => Math.round(num(v, def, lo, hi));
  const bool = v => v === true;
  const str = (v, allowed, def) => (typeof v === 'string' && (!allowed || allowed.indexOf(v) >= 0)) ? v : def;

  function knownSkill(id) {
    return typeof SKILL_BY_ID !== 'undefined' && !!SKILL_BY_ID[id];
  }
  function knownWeapon(w) {
    return typeof WEAPONS !== 'undefined' ? !!WEAPONS[w] : false;
  }
  function destCount() {
    try {
      const d = global.WorldMap && global.WorldMap.destinations;
      if (d && d.length) return d.length;
    } catch (e) { /* worldmap may not be loaded yet */ }
    return 6;
  }
  function waveCount() {
    return (typeof WAVES !== 'undefined' && WAVES.length) ? WAVES.length : 15;
  }

  function defaults() {
    return {
      v: VERSION,
      savedAt: 0,
      skills: [],
      scrap: { metal: 0, wood: 0, fuel: 0, powder: 0, tech: 0 },
      primary: 'revolver',
      sidearm: null,
      bestWave: 0,          // 1-based highest wave reached; 0 = never played
      wavesCleared: 0,
      bossBeaten: false,
      unlockedDests: 1,
      seenIntro: false,
      muted: false,
      lifetime: { boatsSunk: 0, salvage: 0, deaths: 0, runs: 0, playtime: 0, bossKills: 0 },
    };
  }

  // Everything that comes off disk goes through here. Anything unrecognised
  // is dropped, anything out of range is clamped; the result is always a
  // well-formed object of the current shape or null.
  function sanitize(raw) {
    if (!isObj(raw)) return null;
    const d = defaults();

    // skills: keep only ids this build still knows about
    if (Array.isArray(raw.skills)) {
      const seen = Object.create(null);
      for (const id of raw.skills) {
        if (typeof id !== 'string' || seen[id] || !knownSkill(id)) continue;
        seen[id] = 1; d.skills.push(id);
      }
    }

    if (isObj(raw.scrap)) for (const k of SCRAP_KEYS) d.scrap[k] = int(raw.scrap[k], 0, 0, 1e9);

    // a weapon is only valid if it exists AND the saved skills actually grant
    // it, so a hand-edited payload cannot hand out the flak cannon for free
    const granted = { revolver: true };
    if (typeof SKILL_BY_ID !== 'undefined') {
      for (const id of d.skills) { const n = SKILL_BY_ID[id]; if (n && n.weapon) granted[n.weapon] = true; }
    }
    const okWeapon = w => knownWeapon(w) && granted[w];
    d.primary = okWeapon(raw.primary) ? raw.primary : 'revolver';
    d.sidearm = okWeapon(raw.sidearm) ? raw.sidearm : null;

    d.bestWave = int(raw.bestWave, 0, 0, waveCount());
    d.wavesCleared = int(raw.wavesCleared, 0, 0, 1e6);
    d.bossBeaten = bool(raw.bossBeaten);
    d.unlockedDests = int(raw.unlockedDests, 1, 1, destCount());
    d.seenIntro = bool(raw.seenIntro);
    d.muted = bool(raw.muted);

    if (isObj(raw.lifetime)) {
      const L = raw.lifetime;
      d.lifetime = {
        boatsSunk: int(L.boatsSunk, 0, 0, 1e9),
        salvage: int(L.salvage, 0, 0, 1e9),
        deaths: int(L.deaths, 0, 0, 1e9),
        runs: int(L.runs, 0, 0, 1e9),
        playtime: num(L.playtime, 0, 0, 1e9),
        bossKills: int(L.bossKills, 0, 0, 1e9),
      };
    }
    d.savedAt = int(raw.savedAt, 0, 0, 1e15);
    return d;
  }

  // Older payloads are lifted forward rather than thrown away where we can.
  // Anything from the future, or with no version at all, is refused.
  function migrate(raw) {
    if (!isObj(raw)) return null;
    let v = typeof raw.v === 'number' && isFinite(raw.v) ? raw.v : 0;
    if (v < 1 || v > VERSION) return null;
    const out = raw;
    if (v < 2) {
      // v1 stored a single `unlocked` count under a different name
      if (out.unlocked !== undefined && out.unlockedDests === undefined) out.unlockedDests = out.unlocked;
      v = 2;
    }
    if (v < 3) {
      // v2 kept lifetime counters at the top level
      if (!isObj(out.lifetime)) {
        out.lifetime = { boatsSunk: out.boatsSunk, salvage: out.salvage, deaths: out.deaths };
      }
      v = 3;
    }
    out.v = VERSION;
    return out;
  }

  // --------------------------------------------------------------- the API
  const Save = {
    available: !!store,
    data: defaults(),
    _timer: null,
    _pending: null,
    _lastError: null,

    load() {
      const s = rawGet();
      if (typeof s !== 'string' || !s || s.length > MAX_BYTES) return null;
      let parsed = null;
      try { parsed = JSON.parse(s); } catch (e) { this._lastError = 'parse'; return null; }
      let migrated = null;
      try { migrated = migrate(parsed); } catch (e) { migrated = null; }
      if (!migrated) { this._lastError = 'version'; return null; }
      let clean = null;
      try { clean = sanitize(migrated); } catch (e) { clean = null; }
      if (!clean) { this._lastError = 'shape'; return null; }
      this._lastError = null;
      this.data = clean;
      return clean;
    },

    // Debounced. Repeated calls in the same second collapse into one write,
    // so this is safe to call from any game event without touching the frame.
    save(data) {
      let clean;
      try { clean = sanitize(isObj(data) ? data : this.data) || defaults(); }
      catch (e) { return false; }
      clean.savedAt = Date.now();
      this.data = clean;
      if (!store) return false;
      this._pending = clean;
      if (this._timer === null) {
        try {
          this._timer = global.setTimeout(() => { this._timer = null; this._write(); }, DEBOUNCE_MS);
        } catch (e) { this._timer = null; return this._write(); }
      }
      return true;
    },

    _write() {
      const p = this._pending;
      this._pending = null;
      if (!p) return false;
      let s;
      try { s = JSON.stringify(p); } catch (e) { return false; }
      if (typeof s !== 'string' || s.length > MAX_BYTES) return false;
      return rawSet(s);
    },

    flush() {
      if (this._timer !== null) {
        try { global.clearTimeout(this._timer); } catch (e) { /* ignore */ }
        this._timer = null;
      }
      return this._write();
    },

    clear() {
      this._pending = null;
      if (this._timer !== null) {
        try { global.clearTimeout(this._timer); } catch (e) { /* ignore */ }
        this._timer = null;
      }
      this.data = defaults();
      return rawDel();
    },

    // ------------------------------------------------ game <-> save object
    // Reads whatever of the live game exists. Missing pieces keep whatever is
    // already in this.data, so a partially built Game never loses progress.
    captureFrom(game) {
      const d = defaults();
      const prev = isObj(this.data) ? this.data : d;
      // start from what we already hold, then overlay the live state
      const out = sanitize(prev) || d;
      if (!isObj(game)) return out;

      try {
        const tree = game.tree;
        if (tree) {
          if (tree.unlocked) {
            const ids = (typeof tree.unlocked.forEach === 'function' && !Array.isArray(tree.unlocked))
              ? Array.from(tree.unlocked) : [].concat(tree.unlocked);
            out.skills = ids.filter(id => typeof id === 'string' && knownSkill(id));
          }
          if (isObj(tree.scrap)) for (const k of SCRAP_KEYS) out.scrap[k] = int(tree.scrap[k], 0, 0, 1e9);
          if (typeof tree.primary === 'string') out.primary = tree.primary;
          out.sidearm = typeof tree.sidearm === 'string' ? tree.sidearm : null;
        }
      } catch (e) { /* tree half-built; keep what we had */ }

      try {
        const dir = game.director;
        if (dir) {
          // waveIdx is 0-based and -1 before the first wave
          const reached = int(dir.waveIdx, -1, -1, 1e4) + 1;
          out.bestWave = Math.max(out.bestWave, Math.max(0, reached));
          out.wavesCleared = Math.max(out.wavesCleared, int(dir.wavesCleared, 0, 0, 1e6));
        }
      } catch (e) { /* no director yet */ }

      try {
        if (game.boss && game.boss.dead) out.bossBeaten = true;
        if (game.bossBeaten === true) out.bossBeaten = true;
      } catch (e) { /* ignore */ }

      try {
        const wm = global.WorldMap;
        if (wm && typeof wm.unlockedCount === 'number') {
          out.unlockedDests = Math.max(out.unlockedDests, int(wm.unlockedCount, 1, 1, destCount()));
        }
      } catch (e) { /* ignore */ }

      try {
        if (global.Intro && global.Intro.done === true) out.seenIntro = true;
        if (game.seenIntro === true) out.seenIntro = true;
      } catch (e) { /* ignore */ }

      try { if (typeof Audio_ !== 'undefined') out.muted = Audio_.muted === true; } catch (e) { /* ignore */ }

      // Lifetime counters are cumulative across runs. game.stats is per-run
      // and is reset by newRun(), so we carry a baseline of what was already
      // banked and add the current run's contribution on top.
      try {
        const st = game.stats;
        if (isObj(st)) {
          const base = isObj(this._runBase) ? this._runBase : { boatsSunk: 0, salvage: 0 };
          out.lifetime.boatsSunk = int(base.boatsSunk + num(st.kills, 0), 0, 0, 1e9);
          out.lifetime.salvage = int(base.salvage + num(st.scrapCollected, 0), 0, 0, 1e9);
        }
      } catch (e) { /* ignore */ }

      return out;
    },

    // Call this right after `new Game()` (or after newRun()) on a Game whose
    // `tree` exists. Safe on a fresh tree; never throws.
    applyTo(game) {
      const d = isObj(this.data) ? (sanitize(this.data) || defaults()) : defaults();
      if (!isObj(game)) return false;
      let ok = true;

      try {
        const tree = game.tree;
        if (tree) {
          if (!(tree.unlocked && typeof tree.unlocked.add === 'function')) tree.unlocked = new Set();
          else tree.unlocked.clear();
          for (const id of d.skills) if (knownSkill(id)) tree.unlocked.add(id);

          if (!isObj(tree.scrap)) tree.scrap = { metal: 0, wood: 0, fuel: 0, powder: 0, tech: 0 };
          for (const k of SCRAP_KEYS) tree.scrap[k] = d.scrap[k];

          // only settle on a weapon the restored tree really unlocked
          let owned = ['revolver'];
          try { if (typeof tree.weaponsUnlocked === 'function') owned = tree.weaponsUnlocked() || owned; } catch (e) { /* ignore */ }
          tree.primary = owned.indexOf(d.primary) >= 0 ? d.primary : 'revolver';
          tree.sidearm = (d.sidearm && owned.indexOf(d.sidearm) >= 0) ? d.sidearm : null;
          tree.totalCollected = d.lifetime.salvage;

          // the player caches stats from the tree at construction time
          try {
            const p = game.player;
            if (p && typeof tree.stats === 'function') {
              const s = tree.stats();
              p.stats = s;
              if (typeof p.maxHp === 'number') {
                const frac = p.maxHp > 0 ? Math.min(1, (p.hp || p.maxHp) / p.maxHp) : 1;
                p.maxHp = s.maxHp; p.hp = Math.round(s.maxHp * frac);
              }
            }
          } catch (e) { /* player not built yet */ }
        }
      } catch (e) { ok = false; }

      try {
        const wm = global.WorldMap;
        if (wm) {
          wm.unlockedCount = d.unlockedDests;
          const list = wm.destinations;
          if (Array.isArray(list)) for (let i = 0; i < list.length; i++) if (isObj(list[i])) list[i].unlocked = i < d.unlockedDests;
        }
      } catch (e) { /* ignore */ }

      try {
        game.bossBeaten = d.bossBeaten;
        game.bestWave = d.bestWave;
        game.seenIntro = d.seenIntro;
        game.lifetime = d.lifetime;
      } catch (e) { /* ignore */ }

      try { if (typeof Audio_ !== 'undefined' && d.muted) Audio_.muted = true; } catch (e) { /* ignore */ }

      // baseline for the cumulative counters captureFrom() rebuilds
      this._runBase = { boatsSunk: d.lifetime.boatsSunk, salvage: d.lifetime.salvage };
      return ok;
    },

    // Progress marks the lifetime counters, so a death has to be recorded
    // explicitly; everything else rides along on the next save().
    noteDeath() {
      try {
        const d = sanitize(this.data) || defaults();
        d.lifetime.deaths++;
        this.data = d;
        this.save(d);
        return true;
      } catch (e) { return false; }
    },
    noteRunStart() {
      try {
        const d = sanitize(this.data) || defaults();
        d.lifetime.runs++;
        this.data = d;
        this.save(d);
        return true;
      } catch (e) { return false; }
    },

    // --------------------------------------------------------- menu readout
    summary() {
      const d = isObj(this.data) ? (sanitize(this.data) || defaults()) : defaults();
      const L = d.lifetime;
      const hasProgress = d.skills.length > 0 || d.bestWave > 0 || L.boatsSunk > 0 || d.bossBeaten;
      return {
        available: this.available,
        hasProgress,
        waves: d.bestWave,
        wavesCleared: d.wavesCleared,
        bestWaveName: d.bestWave > 0 && typeof WAVES !== 'undefined' && WAVES[d.bestWave - 1]
          ? WAVES[d.bestWave - 1].name : null,
        kills: L.boatsSunk,
        deaths: L.deaths,
        runs: L.runs,
        salvage: L.salvage,
        skills: d.skills.length,
        skillTotal: typeof SKILL_NODES !== 'undefined' ? SKILL_NODES.length : 0,
        banked: SCRAP_KEYS.reduce((a, k) => a + d.scrap[k], 0),
        bossBeaten: d.bossBeaten,
        chapters: d.unlockedDests,
        seenIntro: d.seenIntro,
        savedAt: d.savedAt,
      };
    },

    // exposed for tests / tooling
    _defaults: defaults,
    _sanitize: sanitize,
    KEY, VERSION,
  };

  // Last chance to get a debounced write out before the tab goes away.
  try {
    global.addEventListener('pagehide', () => { try { Save.flush(); } catch (e) { /* ignore */ } });
    global.addEventListener('visibilitychange', () => {
      try { if (global.document && global.document.visibilityState === 'hidden') Save.flush(); } catch (e) { /* ignore */ }
    });
  } catch (e) { /* no window */ }

  // load eagerly so Save.data is never a surprise
  try { Save.load(); } catch (e) { /* ignore */ }

  global.Save = Save;
})(typeof window !== 'undefined' ? window : this);
