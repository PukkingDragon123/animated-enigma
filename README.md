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
| TAB | **The Deep** - the skill tree (pauses the game) |
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

There are no random upgrade rolls. **The Deep** is an underwater scene where the otter is drowning and every
upgrade floats past as a bubble of air; buying one makes him lunge out, grab it and take a gasp. Behind the
theatre it is a strict skill tree with prerequisites and exact costs across four branches:

- **Weapons** - shotgun, SMG, rifle, harpoon gun, grenade launcher, flak cannon, ricochet/explosive/incendiary rounds, crits, a sidearm slot to fire two guns at once, extra barrels.
- **Utility** - Absorb window, cooldown, reflect, heal and shockwave; Rampage gain/duration/fury/frenzy; scrap magnet and salvage; Decoy Buoy and Tidal Slam abilities; Perfect Parry.
- **Mobility** - swim speed, roll cooldown/distance/charges, Ramming Roll, Cannonball splash, Slipstream currents, Current Rider, Deep Dive, Blubber Burst.
- **General** - max HP, regen, armor, damage, cooldown reduction, Rock Sense (longer boss stuns), Second Wind, Veteran.

Upgrades and unspent scrap persist between attempts.

## Ocean simulation

The water is **see-through**. A real seabed is baked once for the whole 3200x2400 world and read through a
transparent water column: sand with warped ripple dunes, boulders, seagrass meadows, brain / staghorn / fan /
plate corals clustered into reef zones, anemones, starfish, shells and sea urchins, with swaying kelp, turf
clumps and schooling fish drawn under the water film.

A bathymetry grid drives sixteen posterized colour bands, per-channel light absorption (red dies first) and a
seabed-visibility ramp, so the lagoon reads bright turquoise and the offshore channels fade to blue-black gloom.
Swells shoal as they reach the beach, caustics dance across the bottom, crests catch sun glitter, and a swash
line breaks along the shore.

**Jelly water.** A damped wave grid runs at a fixed timestep and refracts the seabed beneath it. Anything that
moves through the water dents that grid, so the manatee, the boats, the boss, splashes and explosions all shove
the surface and it wobbles back over a couple of seconds. Kelp leans away as you swim past.

On top of that sit the combat fields: a diffusing **blood field** that spreads and mixes after every hit, an
**oil field** from wrecks, a **foam field** fed by wakes and splashes, rotating current eddies and drift,
temporary slipstream lanes and boss whirlpools, expanding ripples, V-wakes behind every boat, refracted
underwater shadows and sinking wrecks.

## Art and animation

Everything is generated in code at load — no image files anywhere.

- **Captain Otter** is an articulated rig: tricorn hat with a skull badge, cape, cigar with embers, and five live
  facial expressions (idle, happy, angry, talking, surprised) plus a drowning face for the skill tree. He twists
  toward whatever he is aiming at, his arms track the gun, and he recoils with every shot.
- **The War Manatee** is built by a procedural rounded-form rasterizer: one continuous silhouette from spade
  fluke to blunt whiskered head, wrinkled scarred hide, riveted steel plates, leather harness, shoulder spikes
  and a saddle. It sculls, squashes and stretches with speed, and barrel-rolls belly-up on a dash.
- **Boats** are generated hulls: tapered planking, lit gunwales, thwarts, outboard motors, wheelhouses, turrets,
  net reels and crates. They take visible battle damage, scorch holes where you hit them, then smoke, then burn,
  then list, then break into tumbling planks.
- **The Village Chief's shark** has swept triangular pectoral, pelvic and caudal fins, countershading, gill
  slits and a toothed jaw, with the Chief leaning into the turns and raising his spear before a charge.
- A **cartoon layer** adds impact rings, comic starbursts, speed lines, shockwaves, smoke puffs and emotes on
  every hit, kill, roll, parry and rock crash.
- All text is a hand-defined **bitmap pixel font** (5x7 and 7x9 faces, proportional, integer scaling only), and
  the interface is built from an ornate 9-slice **UI kit** of gold, wood, parchment, dark and stone panels.

## Controls on a phone

On touch devices a control layer appears automatically: a procedurally drawn **ship's helm** with spring physics
and overshoot for steering, and seven ornate octagonal buttons for fire, shield, roll, rampage, dive, decoy and
tidal slam, each with a cooldown ring, charge pips and a rampage fill meter. It is multi-touch, so you can steer
and hold fire at once.

## Code layout

```
index.html        canvas shell
src/util.js       math helpers, noise, pixel text
src/audio.js      procedural WebAudio sound effects
src/input.js      keyboard / mouse
src/font.js       bitmap pixel font + ornate 9-slice UI kit
src/pixelart.js   palette, sprite builder, hand-drawn sprites, procedural rocks
src/chars.js      Captain Otter + War Manatee rigs, boats, shark boss, cartoon FX
src/water.js      see-through reef ocean, jelly water physics, blood/foam/oil fields
src/particles.js  splashes, blood, debris, smoke, fire, sparks, explosions, floating text
src/weapons.js    otter weapon definitions
src/skills.js     skill-tree data (54 nodes) and stat computation
src/entities.js   player (manatee + otter), 8 boat types, projectiles, pickups, rocks, wrecks, fisherman
src/boss.js       the Village Chief on his shark (two phases)
src/waves.js      timed spawn director
src/mobile.js     ship's-helm touch controls and ability buttons
src/village.js    fishing village, procedural villagers, destruction and gore
src/treescene.js  'The Deep' underwater skill-tree scene
src/ui.js         HUD and the skill tree overlay
src/scenes.js     cinematic intro, pier dialogue, end screens
src/game.js       game state machine, camera, render order
play.html         generated single-file build (run ./build.sh to refresh)
```
