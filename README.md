# MANATEE VS BOATS

A 2D top-down pixel-art ocean survival game. You are a manatee whose mother was killed by a fishing boat.
An otter with a gun rides on your back. Together you go after the boats responsible.

Everything is hand-built in vanilla JavaScript on an HTML5 canvas: no build step, no dependencies.

## Play

**In your browser, right now:**

- https://raw.githack.com/PukkingDragon123/animated-enigma/claude/friendly-cori-1x5fiu/play.html

`play.html` is a single self-contained file with every script and style inlined, so it also runs
straight off your disk with no server at all - just download it and double-click.

**From a checkout**, either open `play.html` directly, or serve the folder and open `index.html`
(the multi-file version, which is the one to edit):

```
python3 -m http.server 8000
# then open http://localhost:8000
```

Run `./build.sh` to regenerate `play.html` after changing anything under `src/`.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Swim (the manatee steers) |
| SPACE | **Manatee Roll** - fast invulnerable dash (charges shown in the HUD) |
| E / right mouse | **Absorb** - parry window. Absorbing an attack fills the Otter Rampage meter |
| Q | **Otter Rampage** when the meter is full - the otter sprays everything around you |
| Left mouse | Aim the otter manually (he auto-aims the nearest boat otherwise) |
| 1-7 / mouse wheel | Switch weapon |
| TAB | **The Workshop** - the skill tree (pauses the game) |
| SHIFT / F / R | Deep Dive / Decoy Buoy / Tidal Slam (once unlocked) |
| ESC / P | Pause |
| M | Mute |

## How it plays

1. **Intro**: the manatee and otter dive into the bay together.
2. **Fisher Village**: a fisherman on the pier spots you ("Oh, a manatee! Free meat for tonight!"). One click and the otter answers. The fight begins.
3. **Waves** of boats arrive over ~5 minutes, each type with its own movement and attack:
   dinghies (ram), net boats (slowing nets), harpooners (kiting), speedboats (strafing runs), jetski bombers (kamikaze),
   dynamite skiffs (arcing explosives, chain reactions), trawlers (buckshot tanks), gunboats (turret bursts).
4. **Boss - the Village Chief** rides a shark and charges at you. Bait his charge into a rock: he crashes, gets stunned, and takes 2.5x damage.
   At half health he enters **Blood Frenzy**: faster tracking double charges, spear volleys, whirlpools, tail-sweep shockwaves and backup boats.
5. Boats drop five kinds of scrap (metal, driftwood, fuel, gunpowder, electronics). Spend it in **The Workshop**.

## Progression is 100% strategy

There are no random upgrade rolls. The Workshop is a skill tree with prerequisites and exact costs across four branches:

- **Weapons** - shotgun, SMG, rifle, harpoon gun, grenade launcher, flak cannon, ricochet/explosive/incendiary rounds, crits, a sidearm slot to fire two guns at once, extra barrels.
- **Utility** - Absorb window, cooldown, reflect, heal and shockwave; Rampage gain/duration/fury/frenzy; scrap magnet and salvage; Decoy Buoy and Tidal Slam abilities; Perfect Parry.
- **Mobility** - swim speed, roll cooldown/distance/charges, Ramming Roll, Cannonball splash, Slipstream currents, Current Rider, Deep Dive, Blubber Burst.
- **General** - max HP, regen, armor, damage, cooldown reduction, Rock Sense (longer boss stuns), Second Wind, Veteran.

Upgrades and unspent scrap persist between attempts.

## Ocean simulation

The water is rendered per pixel every frame: layered swells posterized into a pixel palette, shoreline foam, sparkling crests,
a diffusing **blood field** that spreads and mixes into the water after hits, an **oil field** from wrecks, a **foam field** fed by wakes and splashes,
rotating current eddies and drift (with visible streaks), temporary slipstream lanes and boss whirlpools, expanding ripples,
V-shaped wakes behind every boat, refracted underwater shadows, fish silhouettes and sinking wrecks.

## Code layout

```
index.html        canvas shell
src/util.js       math helpers, noise, pixel text
src/audio.js      procedural WebAudio sound effects
src/input.js      keyboard / mouse
src/pixelart.js   palette, sprite builder, all hand-drawn sprites, procedural rocks
src/water.js      ocean renderer + blood/foam/oil fields, currents, wakes, ripples
src/particles.js  splashes, blood, debris, smoke, fire, sparks, explosions, floating text
src/weapons.js    otter weapon definitions
src/skills.js     skill-tree data (54 nodes) and stat computation
src/entities.js   player (manatee + otter), 8 boat types, projectiles, pickups, rocks, wrecks, fisherman
src/boss.js       the Village Chief on his shark (two phases)
src/waves.js      timed spawn director
src/ui.js         HUD and the Workshop overlay
src/scenes.js     cinematic intro, pier dialogue, end screens
src/game.js       game state machine, camera, render order
play.html         generated single-file build (run ./build.sh to refresh)
```
