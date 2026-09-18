// ---- Otter's weapons ----------------------------------------------------
const WEAPONS = {
  revolver: { name: 'Otter Revolver', dmg: 12, rate: 0.36, speed: 430, count: 1, spread: 0.05, life: 1.1, shot: 'bullet', sound: 'revolver', kick: 2, knock: 40, size: 3,
    desc: 'Reliable six-shooter. Otter never misses... much.' },
  shotgun: { name: 'Boomstick', dmg: 7, rate: 0.95, speed: 380, count: 7, spread: 0.34, life: 0.42, shot: 'pellet', sound: 'shotgun', kick: 6, knock: 140, size: 2,
    desc: 'Wide cone of pellets. Shreds anything up close.' },
  rifle: { name: 'Long Rifle', dmg: 36, rate: 0.82, speed: 650, count: 1, spread: 0.01, life: 1.7, pierce: 3, shot: 'bulletBig', sound: 'rifle', kick: 4, knock: 90, size: 3,
    desc: 'Heavy round that punches through 3 boats in a line.' },
  smg: { name: 'Chatter SMG', dmg: 5, rate: 0.07, speed: 470, count: 1, spread: 0.17, life: 0.9, shot: 'bullet', sound: 'smg', kick: 1, knock: 25, size: 2,
    desc: 'Sprays lead. Inaccurate but relentless.' },
  harpoon: { name: 'Harpoon Gun', dmg: 48, rate: 1.15, speed: 560, count: 1, spread: 0.02, life: 1.5, pierce: 99, shot: 'harpoonShot', sound: 'harpoon', kick: 5, knock: 260, size: 4,
    desc: 'Skewers everything along its path and shoves boats back.' },
  grenade: { name: 'Grenade Launcher', dmg: 40, rate: 1.25, speed: 270, count: 1, spread: 0.05, life: 0.85, explode: 48, shot: 'grenadeShot', sound: 'grenade', kick: 4, knock: 100, size: 4,
    desc: 'Lobbed grenade. Explodes on impact or after a short flight.' },
  flak: { name: 'Flak Cannon', dmg: 15, rate: 1.05, speed: 420, count: 3, spread: 0.22, life: 0.6, explode: 28, shot: 'flakShot', sound: 'flak', kick: 7, knock: 80, size: 3,
    desc: 'Three bursting shells per shot. Area denial on the waves.' },
};
const WEAPON_ORDER = ['revolver', 'shotgun', 'rifle', 'smg', 'harpoon', 'grenade', 'flak'];
