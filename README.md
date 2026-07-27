# Tiny Swords: Lane Siege

A portrait lane-battler built on the Pixel Frog *Tiny Swords* pack, in the style of
`reference.jpg`: your knights and a goblin warband face each other across a sand
lane, units auto-advance and brawl where they meet, and you spend regenerating
gold on summon cards along the bottom of the screen.

Eight hand-tuned battles, five playable classes, three goblin enemy types,
progress saved locally. Installs as a PWA and plays offline.

## Running it

```sh
node serve.js          # then open http://localhost:8000/
```

Any static server works — `serve.js` is a ~50-line zero-dependency script so
nothing needs installing.

Opening `index.html` directly also works (verified in Chromium: all assets load
from `file://`, which is why the code uses classic `<script>` tags rather than ES
modules). A server is still the safer bet if you switch browsers, and the service
worker only registers over `http`/`https`.

## Playing

| Input | Action |
|---|---|
| Tap / click a card | Summon that unit (costs gold, then the card recharges) |
| `1`–`5` | Summon by card slot |
| Speed button / `Space` | Cycle 1× / 2× / 3× |
| Gear button / `P` / `Esc` | Pause |

Burn down the goblin hut before the clock runs out. If time expires, whichever
base is in better shape wins. Your army is capped at 8 on the field, so slots are
a resource — the bar reads `ARMY FULL` when you're at the limit.

That cap is 8 rather than something larger because two ranks can strike across
three depth rows, so about six allies is all that can ever *reach* the enemy.
A larger cap only adds units that queue at the back doing nothing: measured at
the old cap of 14, a full army spent 76% of its time waiting and the Warrior
line attacked 7% of the time. Sweeping the campaign at caps 14 / 10 / 8 — fresh
save and fully upgraded — gives the same wins and clear times within a second,
so the smaller cap costs no difficulty and every unit you buy is one that fights.

### Your roster

| Unit | Cost | Role |
|---|---|---|
| Pawn | 30 | Cheap and quick. Buys tempo, not damage — its short recharge plugs a collapsing line |
| Warrior | 60 | The backbone. Best value on the front line, and blocks while it waits |
| Archer | 90 | Kills from behind the melee — but TNT dynamite is aimed at it, so it needs a screen and a healer |
| Monk | 120 | Heals the most wounded ally nearby |
| Lancer | 200 | Slow and brutal, striking from behind the front rank |

### The goblins

| Enemy | Threat |
|---|---|
| Torch Goblin | The horde staple — moderate melee, arrives constantly |
| TNT Goblin | Artillery. Lobs dynamite **over** your front line at the archers and monks hiding behind it. Your archers can't shoot back from that distance — kill its screen and let your melee reach it |
| Barrel Bomb | A fast rolling keg that detonates on contact. Kill it at range or it takes your front rank with it |

Spamming one card will not carry you. Pawns alone stop working almost immediately,
and massing Archers behind a wall — the strongest-looking play, since they kill from
safety — is exactly what the TNT goblins are built to punish. The later battles want a
screen, ranged damage *and* a healer keeping the back line alive.

### The Barracks

Winning a battle pays out gold, scaled by how intact your tower is. Spend it in the
**Barracks** (from the battle-select screen) on permanent training: three levels per
class, each worth **+12% health and power**, so a fully trained class is +36%.

Costs are 120 / 260 / 520 per level, or 900 to max one class and 4,500 to max all
five. A flawless run of all eight battles banks about **1,416** gold — enough for a
meaningful slice, not the lot, so which classes you invest in is a real choice.
Replaying a battle pays out again, which is the reason to go back for three swords.

Training is not optional decoration — **the final battle is built to need it.** On a
fresh save, battles 1-7 are winnable with a good composition and battle 8 is not; the
gold banked on the way there is what opens it. Spam does not substitute: with every
class maxed, Pawn-spam alone still stalls around battle 4.

## How it's built

Vanilla JS and Canvas 2D — no build step, no dependencies. Classic `<script>` tags
sharing a single global `TS` namespace.

```
index.html
manifest.webmanifest  PWA install metadata
sw.js                 service worker (offline caching)
icons/                app icons, generated from the castle art
serve.js              local static file server
.nojekyll             disable Jekyll on GitHub Pages
game/
  gfx.js            sprite/anim, measured 9-slice + 3-slice, outlined text
  assets.js         manifest, loader, sprite registry
  audio.js          procedural WebAudio SFX (the pack ships no audio)
  save.js           localStorage progress
  terrain.js        grass field + sand lane, pre-rendered once
  scene.js          animated scenery and cloud drift
  fx.js             particles, floating numbers, screen shake
  entities.js       unit stats, combat, bases, projectiles
  levels.js         the eight battle scripts
  ui.js             HUD, summon cards, panels, dialogs
  game.js           canvas scaling, fixed-step loop, screens, input
```

The simulation runs in fixed 1/60s steps and fast-forward just feeds it more steps
per frame, so 1× / 2× / 3× cannot change a battle's outcome. UI animation uses a
separate real-time clock so the interface stays calm while sped up.

Sprites are keyed by **class alone** — each class belongs to exactly one faction,
so there is no team dimension to thread through.

## Hosting on GitHub Pages

Push the whole folder and enable Pages on the branch — there is no build step.
Every path in the HTML, manifest and service worker is **relative**, so the same
files work at a domain root or under a project subpath (`user.github.io/repo/`).

- **`.nojekyll`** stops Jekyll from processing the site. Without it Jekyll can
  mangle or skip paths, and this project has folder names containing spaces.
- **`.gitignore`** keeps the `.DS_Store` files out of the repo and skips the
  `.aseprite` sources (delete that line to version the art originals).

### After changing anything in `game/`

**Bump `VERSION` in `sw.js`.** The worker caches aggressively, so returning
visitors keep running the old copy until that string changes. This is not
theoretical — during development the worker served a stale `levels.js` and the
enemy kept spawning the previous faction until the version was bumped.

### Case sensitivity

GitHub Pages serves from Linux, which is case-sensitive; Windows and macOS are
not. A path like `factions/goblins/...` therefore works locally and 404s once
deployed. All 134 asset paths are checked segment by segment against the real
filenames — worth re-checking if you add art, especially under `Factions/`.

### Offline caching

The ~130 sprite sheets are deliberately **not** listed in `sw.js`. Duplicating the
manifest from `assets.js` would drift the first time either changed, so the page
posts the exact list it just loaded to the worker, which stores it. That also
covers the very first visit, where the images are fetched while the worker is
still installing and so never pass through its `fetch` handler — without that
step, someone who installed the game and immediately went offline would get the
code but no graphics.

Verified: with the network disabled and the page reloaded, the game reaches the
title screen and plays a full battle with zero failed requests.

## Notes on the art pack

Things that cost real time to work out, recorded so they don't have to be
rediscovered. Several of these are traps that render *almost* correctly.

### Terrain

- **`Terrain/Ground/Tilemap_Flat.png` carries grass AND sand 4×4 autotiles side by
  side** (grass `c0-c3`, sand `c5-c8`). The sand is what lets the battle lane match
  the reference. Rows are `[top fringe, interior, interior, bottom fringe]`.
- **Columns are `[left edge, INTERIOR, right edge, 1-wide]`, so each material has
  exactly ONE interior column** — `c1` for grass, `c6` for sand. `c2`/`c7` look
  like plain fill but carry a near-black right-hand outline (measured `#0b0e18`);
  tiling one paints a dark vertical seam every 64px across the entire field.
  Variation comes from random mirroring, not a second column.
- **BOTH shadow files are grey rounded *squares***, about as tall as they are
  wide — `Terrain/Ground/Shadows.png` and `Terrain/Tileset/Shadow.png` alike. Used
  as a drop shadow either one puts a grey block behind a unit's legs, so no shadow
  sprite is loaded at all: unit shadows are drawn as flattened ellipses sized from
  the measured body width, which also scales correctly for the 57px Barrel against
  the 86px TNT goblin.
- The older `Terrain/Tileset/Tilemap_color*.png` sheets are a different, weaker
  layout (3×3 autotile plus strip variants) with **no sand at all**.

### Units

- **Goblin troops are multi-row GRIDS, not one file per animation**, and row
  lengths are shorter than the sheet is wide, so both the row index and its frame
  count matter. `Torch_Red.png` is 7×5 of 192px; `TNT_Red.png` is 7×3.
- **`Barrel_Red.png` is 128px frames, not 192** (6×6, not 4×4). It is a TNT keg
  rather than a goblin — row 1 is its roll cycle, row 5 the detonation.
- **The Torch's rows 2, 3 and 4 are three DIRECTIONAL swings** (level, low,
  overhead). Only row 2 reads correctly side-on; the others hunch the goblin over
  as though striking at the ground.
- **`Factions/Knights/Troops/Dead/Dead.png` is a real death effect** — a flash,
  then a skull that settles and sinks — laid out 14 frames, 7 wide, across two
  rows. Faction neutral, so it serves knights and goblins alike.
- Knights only face right; every sheet is mirrored once at load and cached.
- **The Lancer is the only class on 320×320 frames** and has its own anchor;
  the other knights are 192×192 anchored at (96, 135), goblins at (96, 133).
- Frame counts were verified against the sheets, not derived from image width.
  Several don't match the obvious guess — the Monk's `Heal` is 11 frames, and the
  `Clouds_*` files are single sprites rather than grids.

### Buildings and UI

- **Every building has `_Destroyed` art**, so a fallen base leaves a wreck rather
  than vanishing.
- **No building fills its frame**, and the frame width is the wrong thing to
  measure against — `Tower_Blue` and `Goblin_House` are both only ~113px of art
  inside a 128px frame, and the bases they replaced were wider still. Draw-order
  and gate tests use measured art bounds instead.
- **The UI sheets have inset art.** A slice's art does not start at its cell
  origin — `RegularPaper`'s top-left corner begins at x12,y20 of its cell, and
  `BigBar_Base`'s end caps are 24px wide, not 64. `TS.SLICE` / `TS.THREE` in
  `gfx.js` hold the measured bounds; slicing on the cell grid leaves gaps.
- **The `*_Slots.png` files are not tileable fills.** Each has a ~12px transparent
  border, so tiling one produces a grid of see-through gutters. They are single
  decorative inset plates.
- Several **icons sit 1–2px off-centre inside their 64px frames** (Icon_03's ink
  centre is at 31,30), which reads as a badly centred glyph once it is inside a
  button. `UI.icon` applies measured per-icon nudges.
- `Arrow.png` is one static frame, rotated to its velocity.

### Centring things on this kit

Three separate reasons a label can look off-centre here, all of which had to be
fixed independently:

- **Canvas `textBaseline: 'middle'` is not optically centred.** It aligns the
  font's em box, which sits off-centre for all-caps and for digits. `TS.text`
  measures the glyphs' real ink box via `actualBoundingBoxAscent`/`Descent` and
  centres on that instead.
- **A button's art box is not its face.** The small buttons' raised face is
  bracketed by light rim rows at art y19–21 and y97–100, centring it on **y59** —
  but the art box runs to y110 because of the 3D base lip below it, so the box's
  own centre (y64) is 5px too low. Square and round buttons share this
  construction; `UI` centres glyphs on the face, not the box.
- **A ribbon's coloured band is not its drawn height.** Each ribbon has a dark rim
  and a drop shadow along its lower edge, so the band a label belongs on sits
  above the geometric middle — by 8px on the big ribbon. `TS.THREE.*.labelCy`
  holds the measured band centre.

And horizontally: **the ribbon end caps are forked tails that narrow**, so icons
placed by offsetting from the ribbon's right edge hang off the fork rather than
sitting on the band. `TS.THREE.*.capW` gives the cap width to stay clear of.

The art is the Tiny Swords pack by Pixel Frog; only the code here is new.
