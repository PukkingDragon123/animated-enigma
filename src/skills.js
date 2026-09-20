// ---- Strategy skill tree: no RNG, you choose exactly what to buy --------
const SCRAP_TYPES = ['metal', 'wood', 'fuel', 'powder', 'tech'];
const SCRAP_NAMES = { metal: 'Scrap Metal', wood: 'Driftwood', fuel: 'Fuel', powder: 'Gunpowder', tech: 'Electronics' };
const SCRAP_COLORS = { metal: '#aeb6c1', wood: '#b57d3f', fuel: '#ff6161', powder: '#6d6d7a', tech: '#6fd88e' };

function baseStats() {
  return {
    maxHp: 130, regen: 0, armor: 0, dmg: 1, fireRate: 1, projSpeed: 1, projCount: 0, pierce: 0, ricochet: 0, explosive: 0,
    crit: 0, critMult: 2.5, knock: 1, burn: 0, bigIron: false,
    speed: 1, accel: 1, turn: 1, rollCd: 1, rollDist: 1, rollCharges: 1, rollDmg: 0, rollSplash: 0, slipstream: false, currentRider: false, dive: false, absorbBoost: false,
    absorbWindow: 0.55, absorbCd: 0.9, absorbReflect: false, absorbHeal: 0, absorbShock: 0, rampGain: 1, rampDur: 5, rampExplosive: false, rampFrenzy: false,
    magnet: 1, scrapBonus: 0, scrapMult: 1, decoy: false, tidal: false, cdMult: 1, rockSense: false, secondWind: false, sidearm: false,
    // the manatee's own attack: two tonnes of animal. Locked until bought.
    melee: false, meleeDmg: 40, meleeCd: 1.4, meleeArc: 2.0, meleeRange: 46,
    meleeKnock: 1, meleeBleed: 0, meleeLifesteal: 0, meleeStun: 0, meleeWave: false,
    weapons: ['revolver'],
  };
}

// Each node: id, branch, pos [col,row] within branch panel, name, desc, cost, req (ids), apply(stats)
const SKILL_NODES = [
  // ================= WEAPONS =================
  { id: 'w_tune', branch: 'weapons', pos: [0, 0], name: 'Revolver Tuning', desc: 'Otter oils the revolver. +30% revolver damage, +10% fire rate.', cost: { metal: 4 }, req: [], apply: s => { s.revolverDmg = (s.revolverDmg || 1) + 0.3; s.fireRate *= 1.1; } },
  { id: 'w_shotgun', branch: 'weapons', pos: [0, 1], name: 'Boomstick', desc: 'Unlock the SHOTGUN. 7 pellets, short range, huge knockback.', cost: { metal: 8, wood: 4 }, req: ['w_tune'], weapon: 'shotgun' },
  { id: 'w_smg', branch: 'weapons', pos: [1, 1], name: 'Chatter SMG', desc: 'Unlock the SMG. Sprays bullets nonstop.', cost: { metal: 10, powder: 4 }, req: ['w_tune'], weapon: 'smg' },
  { id: 'w_rifle', branch: 'weapons', pos: [2, 1], name: 'Long Rifle', desc: 'Unlock the RIFLE. Pierces through 3 enemies.', cost: { metal: 10, tech: 3 }, req: ['w_tune'], weapon: 'rifle' },
  { id: 'w_harpoon', branch: 'weapons', pos: [0, 2], name: 'Harpoon Gun', desc: 'Unlock the HARPOON GUN. Infinite pierce, massive knockback.', cost: { metal: 12, wood: 8 }, req: ['w_shotgun'], weapon: 'harpoon' },
  { id: 'w_grenade', branch: 'weapons', pos: [1, 2], name: 'Grenade Launcher', desc: 'Unlock the GRENADE LAUNCHER. Explosive area damage.', cost: { powder: 12, metal: 8 }, req: ['w_smg'], weapon: 'grenade' },
  { id: 'w_flak', branch: 'weapons', pos: [2, 2], name: 'Flak Cannon', desc: 'Unlock the FLAK CANNON. 3 bursting shells per shot.', cost: { metal: 14, powder: 8, tech: 5 }, req: ['w_rifle'], weapon: 'flak' },
  { id: 'w_hollow', branch: 'weapons', pos: [0, 3], name: 'Hollow Points', desc: '+30% damage with every weapon.', cost: { metal: 10, powder: 5 }, req: ['w_shotgun', 'w_smg', 'w_rifle'], reqAny: true, apply: s => s.dmg *= 1.3 },
  { id: 'w_rapid', branch: 'weapons', pos: [1, 3], name: 'Rapid Paws', desc: 'Otter reloads faster. +25% fire rate.', cost: { tech: 5, metal: 6 }, req: ['w_shotgun', 'w_smg', 'w_rifle'], reqAny: true, apply: s => s.fireRate *= 1.25 },
  { id: 'w_bigiron', branch: 'weapons', pos: [2, 3], name: 'Big Iron', desc: 'Bigger bullets: +1 projectile size, +60% knockback.', cost: { metal: 12 }, req: ['w_shotgun', 'w_smg', 'w_rifle'], reqAny: true, apply: s => { s.knock *= 1.6; s.bigIron = true; } },
  { id: 'w_ricochet', branch: 'weapons', pos: [0, 4], name: 'Ricochet Rounds', desc: 'Bullets bounce to a nearby enemy once after a hit.', cost: { metal: 10, tech: 7 }, req: ['w_hollow'], apply: s => s.ricochet += 1 },
  { id: 'w_explosive', branch: 'weapons', pos: [1, 4], name: 'Explosive Tips', desc: 'Every bullet bursts in a small explosion on hit.', cost: { powder: 14, tech: 5 }, req: ['w_rapid'], apply: s => s.explosive += 14 },
  { id: 'w_deadeye', branch: 'weapons', pos: [2, 4], name: 'Deadeye', desc: '20% critical chance for 2.5x damage.', cost: { tech: 12 }, req: ['w_bigiron'], apply: s => s.crit += 0.2 },
  { id: 'w_incend', branch: 'weapons', pos: [0, 5], name: 'Incendiary', desc: 'Hits set boats on fire: 4 dmg/s for 4s.', cost: { fuel: 12, powder: 6 }, req: ['w_ricochet', 'w_explosive'], reqAny: true, apply: s => s.burn += 4 },
  { id: 'w_sidearm', branch: 'weapons', pos: [1, 5], name: 'Sidearm Slot', desc: 'Otter fires a SECOND weapon at the same time. Right-click a weapon in the tree to set it.', cost: { tech: 10, metal: 16 }, req: ['w_explosive', 'w_deadeye'], reqAny: true, apply: s => s.sidearm = true },
  { id: 'w_barrel', branch: 'weapons', pos: [2, 5], name: 'Extra Barrel', desc: '+1 projectile on every shot, every weapon.', cost: { metal: 20, tech: 8 }, req: ['w_deadeye'], apply: s => s.projCount += 1 },
  { id: 'w_hollow2', branch: 'weapons', pos: [1, 6], name: 'Armor Piercing', desc: '+35% damage and +1 pierce for all weapons.', cost: { metal: 22, powder: 12, tech: 8 }, req: ['w_incend', 'w_sidearm', 'w_barrel'], reqAny: true, apply: s => { s.dmg *= 1.35; s.pierce += 1; } },

  // ================= UTILITY =================
  { id: 'u_window', branch: 'utility', pos: [0, 0], name: 'Wide Parry', desc: 'Parry window 0.55s -> 0.85s. Hold it almost twice as long.', cost: { tech: 3 }, req: [], apply: s => s.absorbWindow = 0.85 },
  { id: 'u_reflex', branch: 'utility', pos: [0, 1], name: 'Parry Reflex', desc: 'Parry cooldown -40%.', cost: { tech: 6 }, req: ['u_window'], apply: s => s.absorbCd *= 0.6 },
  { id: 'u_heal', branch: 'utility', pos: [1, 1], name: 'Parry & Mend', desc: 'Each parried attack heals 5 HP.', cost: { wood: 8, tech: 4 }, req: ['u_window'], apply: s => s.absorbHeal += 5 },
  { id: 'u_magnet', branch: 'utility', pos: [2, 1], name: 'Scrap Magnet', desc: 'Pickup radius +70%.', cost: { metal: 5 }, req: ['u_window'], apply: s => s.magnet *= 1.7 },
  { id: 'u_reflect', branch: 'utility', pos: [0, 2], name: 'Reflective Parry', desc: 'Parried projectiles are flung back at enemies for 3x damage.', cost: { tech: 10, metal: 6 }, req: ['u_reflex'], apply: s => s.absorbReflect = true },
  { id: 'u_shock', branch: 'utility', pos: [1, 2], name: 'Parry Shockwave', desc: 'A successful parry blasts nearby boats: 25 dmg + knockback.', cost: { powder: 8, tech: 8 }, req: ['u_heal'], apply: s => s.absorbShock += 25 },
  { id: 'u_salvage', branch: 'utility', pos: [2, 2], name: 'Salvager', desc: 'Every scrap drop gives +1 extra piece.', cost: { wood: 10, metal: 10 }, req: ['u_magnet'], apply: s => s.scrapBonus += 1 },
  { id: 'u_rgain', branch: 'utility', pos: [0, 3], name: 'Rampage Charge', desc: 'Otter Rampage meter fills 50% faster.', cost: { tech: 7 }, req: ['u_reflect', 'u_shock'], reqAny: true, apply: s => s.rampGain *= 1.5 },
  { id: 'u_rdur', branch: 'utility', pos: [1, 3], name: 'Longer Rampage', desc: 'Rampage lasts 5s -> 8s.', cost: { tech: 10, powder: 6 }, req: ['u_shock'], apply: s => s.rampDur += 3 },
  { id: 'u_magnet2', branch: 'utility', pos: [2, 3], name: 'Scrap Vortex', desc: 'Pickup radius doubled again. Scrap flies to you.', cost: { metal: 10, tech: 5 }, req: ['u_salvage'], apply: s => s.magnet *= 2 },
  { id: 'u_rfury', branch: 'utility', pos: [0, 4], name: 'Rampage Fury', desc: 'During Rampage the otter fires explosive rounds.', cost: { powder: 16, tech: 8 }, req: ['u_rgain'], apply: s => s.rampExplosive = true },
  { id: 'u_rfrenzy', branch: 'utility', pos: [1, 4], name: 'Rampage Frenzy', desc: 'Each kill during Rampage extends it by 0.6s.', cost: { tech: 14 }, req: ['u_rdur'], apply: s => s.rampFrenzy = true },
  { id: 'u_lucky', branch: 'utility', pos: [2, 4], name: 'Lucky Salvage', desc: 'Boats drop 40% more scrap.', cost: { wood: 14, tech: 8 }, req: ['u_magnet2'], apply: s => s.scrapMult *= 1.4 },
  { id: 'u_decoy', branch: 'utility', pos: [0, 5], name: 'Decoy Buoy', desc: 'NEW ABILITY [F]: drop a buoy that boats target for 6s. 14s cooldown.', cost: { wood: 16, tech: 8 }, req: ['u_rfury', 'u_rfrenzy'], reqAny: true, apply: s => s.decoy = true },
  { id: 'u_tidal', branch: 'utility', pos: [2, 5], name: 'Tidal Slam', desc: 'NEW ABILITY [R]: the manatee slaps the water, a wave shoves every nearby boat and deals 40 dmg. 12s cooldown.', cost: { tech: 16, powder: 8 }, req: ['u_lucky', 'u_rfrenzy'], reqAny: true, apply: s => s.tidal = true },
  { id: 'u_master', branch: 'utility', pos: [1, 6], name: 'Perfect Parry', desc: 'Parrying at the very last 0.1s counts double and refunds the cooldown.', cost: { tech: 20, metal: 10 }, req: ['u_decoy', 'u_tidal'], reqAny: true, apply: s => s.perfectParry = true },

  // ================= MOBILITY =================
  { id: 'm_fins', branch: 'mobility', pos: [0, 0], name: 'Swift Fins', desc: 'Manatee swim speed +15%.', cost: { wood: 4 }, req: [], apply: s => s.speed *= 1.15 },
  { id: 'm_rollcd', branch: 'mobility', pos: [0, 1], name: 'Quick Roll', desc: 'Manatee Roll cooldown -30%.', cost: { wood: 6 }, req: ['m_fins'], apply: s => s.rollCd *= 0.7 },
  { id: 'm_rolldist', branch: 'mobility', pos: [1, 1], name: 'Long Roll', desc: 'Manatee Roll travels 40% farther.', cost: { wood: 8 }, req: ['m_fins'], apply: s => s.rollDist *= 1.4 },
  { id: 'm_turn', branch: 'mobility', pos: [2, 1], name: 'Agile Body', desc: 'Acceleration +40%, turning +50%. Snappier steering.', cost: { wood: 6, fuel: 3 }, req: ['m_fins'], apply: s => { s.accel *= 1.4; s.turn *= 1.5; } },
  { id: 'm_ram', branch: 'mobility', pos: [0, 2], name: 'Ramming Roll', desc: 'Rolling through a boat deals 30 damage and knocks it away.', cost: { metal: 8, wood: 8 }, req: ['m_rollcd'], apply: s => s.rollDmg += 30 },
  { id: 'm_double', branch: 'mobility', pos: [1, 2], name: 'Double Roll', desc: 'Store 2 roll charges.', cost: { wood: 14, tech: 5 }, req: ['m_rolldist'], apply: s => s.rollCharges += 1 },
  { id: 'm_fins2', branch: 'mobility', pos: [2, 2], name: 'Swift Fins II', desc: 'Swim speed +15% more.', cost: { wood: 10, fuel: 4 }, req: ['m_turn'], apply: s => s.speed *= 1.15 },
  { id: 'm_splash', branch: 'mobility', pos: [0, 3], name: 'Cannonball', desc: 'Ending a roll makes a splash that damages (20) and shoves boats.', cost: { powder: 6, wood: 8 }, req: ['m_ram'], apply: s => s.rollSplash += 20 },
  { id: 'm_slip', branch: 'mobility', pos: [1, 3], name: 'Slipstream', desc: 'Rolling leaves a current behind you. Swimming in it is 60% faster.', cost: { fuel: 8, wood: 6 }, req: ['m_double', 'm_fins2'], reqAny: true, apply: s => s.slipstream = true },
  { id: 'm_current', branch: 'mobility', pos: [2, 3], name: 'Current Rider', desc: 'Ocean currents always push you forward instead of around.', cost: { tech: 6, wood: 6 }, req: ['m_fins2'], apply: s => s.currentRider = true },
  { id: 'm_dive', branch: 'mobility', pos: [0, 4], name: 'Deep Dive', desc: 'NEW ABILITY [SHIFT]: dive underwater for 1.5s. Immune to projectiles, boats pass over you. 7s cooldown.', cost: { tech: 12, wood: 12 }, req: ['m_splash', 'm_slip'], reqAny: true, apply: s => s.dive = true },
  { id: 'm_blubber', branch: 'mobility', pos: [1, 4], name: 'Blubber Burst', desc: 'After a successful Parry, +60% speed for 2s.', cost: { tech: 6, fuel: 5 }, req: ['m_slip'], apply: s => s.absorbBoost = true },
  { id: 'm_fins3', branch: 'mobility', pos: [2, 4], name: 'Swift Fins III', desc: 'Swim speed +20% more.', cost: { wood: 16, fuel: 8 }, req: ['m_current'], apply: s => s.speed *= 1.2 },
  { id: 'm_slam', branch: 'mobility', pos: [2, 0], name: 'Tail Slam', desc: 'The manatee fights back. [C] sweeps her tail through everything in front of her for 40 damage and a hard shove.', cost: { wood: 10, metal: 6 }, req: ['m_fins'], apply: s => s.melee = true },
  { id: 'm_slam2', branch: 'mobility', pos: [2, 5], name: 'Broad Sweep', desc: 'Tail Slam reaches 40% further through a wider arc, and the wake swats enemy shots out of the air.', cost: { wood: 14, tech: 6 }, req: ['m_slam'], apply: s => { s.meleeArc += 0.7; s.meleeRange += 14; s.meleeWave = true; } },
  { id: 'm_slam3', branch: 'mobility', pos: [2, 6], name: 'Bone Breaker', desc: 'Tail Slam hits for 90, shoves three times as hard and leaves the hull wallowing.', cost: { metal: 18, powder: 10 }, req: ['m_slam2'], apply: s => { s.meleeDmg = 90; s.meleeKnock = 3; s.meleeStun += 0.8; } },
  { id: 'm_slam4', branch: 'mobility', pos: [0, 6], name: 'Old Wounds', desc: 'Everything the tail hits bleeds 12 a second for 3s, and each hull she catches gives back 6 HP.', cost: { wood: 20, tech: 12 }, req: ['m_slam3'], apply: s => { s.meleeBleed += 12; s.meleeLifesteal += 6; s.meleeCd *= 0.75; } },
  { id: 'm_triple', branch: 'mobility', pos: [1, 5], name: 'Triple Roll', desc: 'Store 3 roll charges and rolls are 20% faster.', cost: { wood: 22, tech: 8 }, req: ['m_dive', 'm_blubber', 'm_fins3'], reqAny: true, apply: s => { s.rollCharges += 1; s.rollDist *= 1.2; } },

  // ================= GENERAL STATS =================
  { id: 'g_hide', branch: 'general', pos: [0, 0], name: 'Thick Hide', desc: '+25 max HP.', cost: { wood: 5 }, req: [], apply: s => s.maxHp += 25 },
  { id: 'g_hide2', branch: 'general', pos: [0, 1], name: 'Thick Hide II', desc: '+35 max HP.', cost: { wood: 10, metal: 4 }, req: ['g_hide'], apply: s => s.maxHp += 35 },
  { id: 'g_diet', branch: 'general', pos: [1, 1], name: 'Sea Grass Diet', desc: 'Regenerate 1.5 HP per second.', cost: { wood: 8 }, req: ['g_hide'], apply: s => s.regen += 1.5 },
  { id: 'g_eyes', branch: 'general', pos: [2, 1], name: 'Sharp Eyes', desc: '+15% damage.', cost: { tech: 4, metal: 4 }, req: ['g_hide'], apply: s => s.dmg *= 1.15 },
  { id: 'g_armor', branch: 'general', pos: [0, 2], name: 'Barnacle Armor', desc: 'Take 12% less damage.', cost: { metal: 10 }, req: ['g_hide2'], apply: s => s.armor += 0.12 },
  { id: 'g_cool', branch: 'general', pos: [1, 2], name: 'Cool Head', desc: 'All cooldowns -15%.', cost: { tech: 8 }, req: ['g_diet'], apply: s => s.cdMult *= 0.85 },
  { id: 'g_eyes2', branch: 'general', pos: [2, 2], name: 'Sharp Eyes II', desc: '+15% damage.', cost: { tech: 8, metal: 8 }, req: ['g_eyes'], apply: s => s.dmg *= 1.15 },
  { id: 'g_hide3', branch: 'general', pos: [0, 3], name: 'Thick Hide III', desc: '+50 max HP.', cost: { wood: 16, metal: 8 }, req: ['g_armor'], apply: s => s.maxHp += 50 },
  { id: 'g_rock', branch: 'general', pos: [1, 3], name: 'Rock Sense', desc: 'Rocks glow when the boss charges. Boss stun lasts +1.5s.', cost: { tech: 6, wood: 6 }, req: ['g_cool'], apply: s => s.rockSense = true },
  { id: 'g_speed', branch: 'general', pos: [2, 3], name: 'Fast Hands', desc: '+15% fire rate, +20% projectile speed.', cost: { tech: 8, powder: 4 }, req: ['g_eyes2'], apply: s => { s.fireRate *= 1.15; s.projSpeed *= 1.2; } },
  { id: 'g_armor2', branch: 'general', pos: [0, 4], name: 'Barnacle Armor II', desc: 'Take 12% less damage (stacks).', cost: { metal: 16, tech: 5 }, req: ['g_hide3'], apply: s => s.armor += 0.12 },
  { id: 'g_diet2', branch: 'general', pos: [1, 4], name: 'Kelp Feast', desc: 'Regenerate 2.5 more HP/s.', cost: { wood: 16, tech: 6 }, req: ['g_rock'], apply: s => s.regen += 2.5 },
  { id: 'g_cool2', branch: 'general', pos: [2, 4], name: 'Ice Cold', desc: 'All cooldowns -15% more.', cost: { tech: 14 }, req: ['g_speed'], apply: s => s.cdMult *= 0.85 },
  { id: 'g_second', branch: 'general', pos: [0, 5], name: 'Second Wind', desc: 'Once per run: survive death with 50% HP and a giant shockwave.', cost: { wood: 20, tech: 12, fuel: 8 }, req: ['g_armor2', 'g_diet2'], reqAny: true, apply: s => s.secondWind = true },
  { id: 'g_veteran', branch: 'general', pos: [2, 5], name: 'Veteran', desc: '+10% to damage, speed, HP and fire rate.', cost: { metal: 12, wood: 12, fuel: 12, powder: 12, tech: 12 }, req: ['g_cool2', 'g_diet2'], reqAny: true, apply: s => { s.dmg *= 1.1; s.speed *= 1.1; s.maxHp = Math.round(s.maxHp * 1.1); s.fireRate *= 1.1; } },
];
const SKILL_BY_ID = {}; for (const n of SKILL_NODES) SKILL_BY_ID[n.id] = n;
const BRANCHES = [
  { id: 'weapons', name: 'WEAPONS', color: '#ffb347', icon: 'iconWeapon', blurb: 'Guns, firing styles, ammo' },
  { id: 'utility', name: 'UTILITY', color: '#8ac6ff', icon: 'iconUtil', blurb: 'Parry, Rampage, abilities' },
  { id: 'mobility', name: 'MOBILITY', color: '#6fd88e', icon: 'iconMob', blurb: 'Roll, speed, movement' },
  { id: 'general', name: 'GENERAL', color: '#ff6161', icon: 'iconStat', blurb: 'HP, armor, damage, cooldowns' },
];

class SkillTree {
  constructor() { this.unlocked = new Set(); this.scrap = { metal: 0, wood: 0, fuel: 0, powder: 0, tech: 0 }; this.primary = 'revolver'; this.sidearm = null; this.totalCollected = 0; }
  has(id) { return this.unlocked.has(id); }
  available(node) {
    if (!node.req.length) return true;
    return node.reqAny ? node.req.some(r => this.unlocked.has(r)) : node.req.every(r => this.unlocked.has(r));
  }
  canAfford(node) { for (const k in node.cost) if ((this.scrap[k] || 0) < node.cost[k]) return false; return true; }
  buy(node) {
    if (this.unlocked.has(node.id) || !this.available(node) || !this.canAfford(node)) return false;
    for (const k in node.cost) this.scrap[k] -= node.cost[k];
    this.unlocked.add(node.id);
    return true;
  }
  addScrap(type, n) { this.scrap[type] = (this.scrap[type] || 0) + n; this.totalCollected += n; }
  stats() {
    const s = baseStats();
    for (const id of this.unlocked) {
      const n = SKILL_BY_ID[id]; if (!n) continue;
      if (n.apply) n.apply(s);
      if (n.weapon) s.weapons.push(n.weapon);
    }
    return s;
  }
  weaponsUnlocked() { return WEAPON_ORDER.filter(w => w === 'revolver' || [...this.unlocked].some(id => SKILL_BY_ID[id]?.weapon === w)); }
}
