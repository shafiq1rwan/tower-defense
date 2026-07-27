# Tiny Swords: Lane Siege

A portrait lane-battler built on the Pixel Frog *Tiny Swords* free art pack, in the
style of `reference.jpg`: two castles face each other across a single lane, your
units auto-advance and brawl where they meet, and you spend regenerating gold on
summon cards along the bottom of the screen.

Eight hand-tuned battles, five unit classes, progress saved locally.

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

## Hosting on GitHub Pages

Push the whole folder and enable Pages on the branch — there is no build step.
It installs as a PWA and plays offline.

Everything is already set up for a project subpath (`user.github.io/repo/`):
every path in the HTML, manifest and service worker is **relative**, so the same
files work at a domain root or in a subfolder without edits.

Two GitHub-Pages-specific files are included:

- **`.nojekyll`** — stops Jekyll from processing the site. Without it Jekyll can
  mangle or skip paths, and this project has folder names containing spaces.
- **`.gitignore`** — keeps the `.DS_Store` files scattered through the asset
  folders out of the repo, and skips the `.aseprite` sources (delete that line if
  you want the art originals versioned).

### After changing anything in `game/`

**Bump `VERSION` in `sw.js`.** The service worker caches aggressively, so
returning visitors keep running the old copy until that string changes.

### Case sensitivity

GitHub Pages serves from Linux, which is case-sensitive; Windows and macOS are
not. A path like `Units/blue Units/...` therefore works locally and 404s once
deployed. All 132 asset paths in this project have been checked segment by
segment against the real filenames, so they match exactly — but keep it in mind
if you add art.

### PWA pieces

| File | Purpose |
|---|---|
| `manifest.webmanifest` | Install metadata: portrait lock, standalone display, theme colours |
| `sw.js` | Offline caching — shell precached on install, art cached on first play |
| `icons/` | 192 and 512 icons, a maskable 512, and a 180 Apple touch icon |

The ~130 sprite sheets are deliberately **not** listed in `sw.js`. Duplicating the
manifest from `assets.js` would drift the first time either changed, so instead
the page posts the exact list it just loaded to the worker, which stores it. That
also covers the very first visit, where the images are fetched while the worker is
still installing and so never pass through its `fetch` handler at all — without
that step, someone who installed the game and immediately went offline would get
the code but no graphics.

Verified offline: with the network disabled and the page reloaded, the game
reaches the title screen and plays a full battle with zero failed requests.

## Playing

| Input | Action |
|---|---|
| Tap / click a card | Summon that unit (costs gold, then the card recharges) |
| `1`–`5` | Summon by card slot |
| Speed button / `Space` | Cycle 1× / 2× / 3× |
| Gear button / `P` / `Esc` | Pause |

Destroy the enemy castle before the clock runs out. If time expires, whoever's
castle is in better shape wins. Your army is capped at 14 on the field, so slots
are a resource — the bar reads `ARMY FULL` when you're at the limit.

### The roster

| Unit | Cost | Role |
|---|---|---|
| Pawn | 30 | Cheap and quick. Buys tempo, not damage — its short recharge plugs a collapsing line |
| Warrior | 60 | The backbone. Best value on the front line, and blocks while it waits |
| Archer | 90 | Kills from safety behind the melee. Useless if the line breaks |
| Monk | 120 | Heals the most wounded ally nearby |
| Lancer | 200 | Slow and brutal, striking from behind the front rank |

Spamming Pawns will carry you through the first two battles and then stop
working. Later battles need a real composition.

## How it's built

Vanilla JS and Canvas 2D — no build step, no dependencies. Classic `<script>`
tags sharing a single global `TS` namespace.

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
  terrain.js        autotiled field + raised plateau, pre-rendered once
  scene.js          animated scenery and cloud drift
  fx.js             particles, floating numbers, screen shake
  entities.js       unit stats, combat, castles, projectiles
  levels.js         the eight battle scripts
  ui.js             HUD, summon cards, panels, dialogs
  game.js           canvas scaling, fixed-step loop, screens, input
```

The simulation runs in fixed 1/60s steps and fast-forward just feeds it more
steps per frame, so 1× / 2× / 3× cannot change a battle's outcome. UI animation
uses a separate real-time clock so the interface stays calm while sped up.

### Notes on the art pack

Things that cost time to work out, recorded so they don't have to be rediscovered:

- **The tileset is a 3×3 autotile plus strip variants, not a 4×4 grid.** Only
  `c1r1` (flat grass) and `c6r1` (elevated) are pure interior cells. Tiling any
  other cell paints a visible lattice of seams across the whole field.
- **There is no dirt or sand tile** in any of the five palette variants, so the
  reference's tan lane is a *raised plateau* instead: olive grass over the
  blue-grey stone cliff, on a vivid green field.
- **The UI sheets have inset art.** A slice's art does not start at its cell
  origin — `RegularPaper`'s top-left corner begins at x12,y20 of its cell, and
  `BigBar_Base`'s end caps are 24px wide, not 64. `TS.SLICE` / `TS.THREE` in
  `gfx.js` hold the measured bounds; slicing on the cell grid leaves gaps.
- **The `*_Slots.png` files are not tileable fills.** Each has a ~12px
  transparent border, so tiling one produces a grid of see-through gutters.
  They are single decorative inset plates.
- **No death, hurt, or damaged-building frames exist.** Deaths are a flash, fade
  and dust puff; damaged castles get fire plumes and an explosion when they fall.
- **`Arrow.png` is one static frame**, rotated to its velocity.
- **Units only face right** — every sheet is mirrored once at load and cached.
- **The Lancer is the only class on 320×320 frames** and has its own anchor;
  everyone else is 192×192 anchored at (96, 135).
- Frame counts were verified against the sheets, not derived from image width.
  Several don't match the obvious guess: the Monk's `Heal` is 11 frames, and the
  `Clouds_*` files are single sprites rather than grids.

The art is the Tiny Swords free pack by Pixel Frog; only the code here is new.
