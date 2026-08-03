# CLAUDE.md

Portrait lane-battler built on the Pixel Frog *Tiny Swords* art pack. Vanilla JS +
Canvas 2D, no build step, no dependencies. Ships as an installable PWA.

`README.md` is the player/deploy-facing doc and holds the full catalogue of
art-pack measurements. This file is about **working in the repo**.

## Run it

```sh
node serve.js          # http://localhost:8000/  — Python is NOT installed here
node --check game/x.js # there is no linter or test runner; syntax-check like this
```

## Read this first: bump the service worker

**After changing anything under `game/`, increment `VERSION` in `sw.js`.**

`sw.js` is cache-first, so a stale build is served silently and you will debug
code that is not running. This is not hypothetical — it cost real time once when
the worker kept serving an old `levels.js` and the enemy went on spawning the
previous faction after it had been replaced.

When testing in a throwaway browser profile, delete the profile between runs
rather than trusting the bump.

**This has now bitten twice.** The second time cost three debugging passes: `VERSION`
was bumped once at the start of a feature, then the same file was edited several more
times, and a reused browser profile kept serving the copy the worker had precached at
the first bump. The symptom was maddening — a one-line colour fix was correct on
disk, correct in the served response, and still wrong on screen. **Make the harness
unregister service workers before the real page load**, every run, rather than relying
on remembering to bump. And when a change is provably present in the file yet absent
on screen, suspect the worker before you re-read your own logic.

**Three times now.** The third was on the human side: a "the gold animation is gone"
report that was really the PWA loading from the worker's cache — with `serve.js` not
even running. That is the trap's sharpest edge: the page coming up proves nothing,
because the app shell loads fine with no server at all. When a person (not the
harness) reports something missing right after code changes, have them hard-reload
twice before investigating the code.

The fastest way to settle "is the running code what I think it is" is to sample the
canvas: on `http://localhost` it is same-origin and **not** tainted, so
`getImageData` works and a colour can be read back directly. Only `file://` taints it.

## Measure the art; never infer it

Every single visual bug in this project came from assuming sheet geometry. The
pack is full of layouts that are *almost* what you would guess:

- `Tilemap_Flat` columns are `[left edge, INTERIOR, right edge, 1-wide]` — one
  interior column per material. The neighbouring column looks like plain fill but
  carries a near-black outline, and tiling it paints a seam every 64px.
- UI slice art is **inset** inside its cell. `BigBar_Base`'s end caps are 24px
  wide, not 64. A button's Pressed sheet has different bounds from its Regular one.
- A ribbon's coloured band is not its drawn height; a button's art box is not its
  face; `*_Slots.png` are not tileable; both "shadow" files are grey squares.
- Frame counts do not follow from image width. The Monk's `Heal` is 11 frames, the
  `Clouds_*` files are single sprites, `Barrel_Red` is 128px frames not 192.

So: **measure with a script, then hard-code the numbers with a comment saying they
were measured.** Content bounds via `System.Drawing` in PowerShell works well, and
rendering a sheet as a labelled grid is the fastest way to identify animation rows.
Canvas is tainted under `file://`, so nothing can be sampled at runtime — colours
like the terrain backing fills must be measured offline.

`TS.SLICE` / `TS.THREE` in `gfx.js` hold the measured UI metrics. Add to those
tables rather than passing ad-hoc offsets at call sites.

## Invariants that are easy to break

**Fixed timestep.** The sim advances only in 1/60s steps; fast-forward feeds it
more steps per frame. Never let sim logic read wall-clock time, or 1x/2x/3x stop
agreeing. UI animation deliberately uses a separate real-time clock (`uiClock`,
`resultT`) so the interface stays calm while the battle is sped up.

**Two ranks fight, and the balance depends on it.** Each unit closes to `contact`
but strikes from `range`. `range` must exceed `contact + SPACING` so the second
rank can reach over the front rank, and stay under `contact + 2*SPACING` so the
third cannot. Measured participation: rank 0 attacks ~28% of frames, rank 1 ~21%,
rank 2 exactly 0%. Touching `contact`, `range` or `SPACING` invalidates the tuned
curve — re-run the balance sweep below.

**The player's back line must stay reachable.** Everything targets its *nearest*
enemy, and the nearest enemy is always the melee screen — so Archers and Monks, which
hold 205 and 215 behind the clash, were structurally invulnerable. Measured: the
Archer took 60 damage to the Warrior's 724 across a whole battle, so massing a back
line won by default and upgrading it just won faster. The TNT goblin's `lob` is the
sole counter, and it works only because of two separate things:

- `findLobTarget` selects on **role** (ranged or healer), not distance. "Aim at the
  deepest enemy" was the obvious rule and it is wrong — measured, it hit a Warrior on
  11 of 11 shots, because the farthest player unit is usually a fresh reinforcement
  still walking up from the tower.
- `lob` is separate from the **fire gate**, which stays `findEnemy(def.range)`. If
  `lob` also gated firing, every rank of artillery could shoot from the back; `range`
  is what keeps it to two ranks.

If you retarget TNT to `findEnemy`, widen `Archer.contact`, or drop `TNT.dmg` below a
Monk's healing throughput, the exploit comes straight back and the sweep will still
look fine on battles 1-7.

**The arrow volley is DEFENSIVE, and its fixed reach line is load-bearing.** The
player's one active ability (V, or the button under the speed control: 40 gold,
22s cooldown, 8 arrows) lands only on the player's half of the lane —
`VOLLEY.reach` is a fixed 460, never relative to the front line. Four offensive
versions all cracked the battle-8 gate, each differently, and every "nerf" made it
worse (the full post-mortem is on `VOLLEY` in entities.js; the short version is
that a deep volley suppresses the TNT artillery, and at the field cap any
wallet-priced ability converts CLIPPED income into free damage). Structural rules:
the spread comes from fixed arrays, never `Math.random`; `volleyStrike` hits units
only, never a castle (safe siege would bypass the two-rank model); `volleyMark`
and the reticle are draw-only. After touching any `VOLLEY` number, sweep an abuse
bot that fires on cooldown at the deepest enemy — battle 8 fresh must stay 0/15.

**Field cap is 8 because only ~6 allies can reach.** Two ranks strike across three
depth rows. At the old cap of 14 a full army spent 76% of its time waiting and the
Warrior line attacked 7% of the time — slots 7-14 were decoration that read as a bug.
Verified balance-neutral at caps 14 / 10 / 8, fresh and maxed. Raising it does not
make the player stronger; it only lengthens the queue.

**`enforceSpacing` only ever pushes rearward.** Two consequences: knocking a unit
*backwards* is safe (it will not be yanked forward), and *overtaking within a depth
row is impossible* — which is why blocked units sidestep to another row instead.

**Positional vs cosmetic pushes.** `unit.push` is a draw-only flinch and must stay
that way; it cannot affect reach or spacing. Real knockback happens in exactly one
place, `Battle.detonate`, because a blast is rare and discrete. Per-swing knockback
would make the front gap oscillate and drop the second rank in and out of range.

**Impact feel is rendering, never time.** `punch`, `squash` and `holdT` join `push`
as draw-only fields. Hit-stop is normally done by *freezing time*, which is not
available here — the sim only advances in fixed 1/60 steps, so stalling it would make
1x and 3x disagree about the outcome. Instead `holdT` holds the **drawn** frame for
~3 frames while `animT` keeps advancing, so `applyHit` still fires on schedule and
the attack's real duration is untouched. The squash is `scaleX`/`scaleY` at draw time
only: rank spacing is measured off `def.body`, never off whatever the sprite is doing
this frame. All three decay on the **sim** clock so the impact does not last three
times as long at 3x. Verified draw-only by re-running the full sweep and reproducing
all ten policy rows exactly.

Note the sprite anchor sits at the **feet**, which is why a vertical stretch grows
upward instead of sinking the unit into the sand. And `ctx.imageSmoothingEnabled` is
false, so a fractional scale stays nearest-neighbour rather than blurring the art.

**A theme may dress the field but never change the lane.** `themes.js` varies ground
palette, weather, water and wildlife per battle. It must not touch `TS.LAY` or the
sand: the two-rank model is tuned around that geometry and units need walkable ground
in all three depth rows. So water is always a band in the **upper field**, and the
sand always comes from `Tilemap_Flat` whatever the theme — the alternate tilesets
carry no sand at all. Weather and the day-tint draw in front of the units but inside
the world transform, which is what keeps them off the HUD.

**Audio must never draw from `Math.random` either, and music runs on the wall
clock.** `Audio.play` is called from inside the sim (`applyHit`, `hurt`, `die`), so
the same rule as scenery applies. `noise()` used to build its buffer per sound —
5,280 `Math.random()` calls at 48kHz for one 0.11s impact, up to ~20 times a second
— which meant *having sound on perturbed combat*. One buffer is now built at
`unlock()` and replayed from a rotating offset chosen by a counter. Music is
scheduled ahead on `ctx.currentTime` via `setInterval`, never from the frame loop or
the sim: verified 2.50s per bar at both 1x and 3x, because battle music that
accelerated with fast-forward would be unbearable. Beware measuring this by counting
whole bars in a fixed window — phase alignment alone will show 4 bars or 5.

**Scenery, audio and effects must never draw from `Math.random`.** `Scene.update`,
`FX.update`, `FX.number` and `FX.coin` all run inside `simulate()`, so sharing the
global PRNG means presentation perturbs combat: unit `atkTimer` jitter and the `guard`
chance would land differently on a rainy level than a clear one, and differently again
if you changed the raindrop count or how many coins a kill drops. Each subsystem has
its own seeded generator — `srnd` in scene.js, `frnd` in fx.js — re-seeded per battle
so a replay throws identical dust, coins and weather. Decoupling scenery shifted the
sim's stream once (one already-won battle moved 100% → 92% tower HP); decoupling FX
changed no win or loss at all.

**The root cause is still there, though: the SIM itself uses global `Math.random`.**
Six calls remain in entities.js — first-swing `atkTimer` jitter, the 55% `guard`
chance, and four in the burning-base fire. (`detonate`'s knockback is now a
deterministic falloff, and the base-shake draw jitter was moved to a counter — it was
the one *render-path* consumer of the stream, which is strictly worse than a sim-side
one: draws-per-step vary with refresh rate and speed, so 1x/2x/3x interleaved the
stream differently while a base shook, and `fastSim` never drew at all, so sweeps
validated a stream live play never saw.) While the six remain, *any* `Math.random()`
anywhere in the process perturbs combat, so the rule above is a discipline rather
than a guarantee. Giving the simulation its own seeded generator would make it
airtight — and would remove the run-to-run sweep variance that makes single-battle
results untrustworthy. Not done yet; it is the single highest-value cleanup left in
the codebase.

**Two more measured traps, in the water art.** `Foam.png` is 8 frames of 192px but
the ring is only ~82px of ink (x55-136) inset in the middle of the cell, so spacing
foam by frame width leaves gaps in a shoreline; it is stepped by 66 instead, and
`TS.FOAM_REACH` (42) is how far it spills past a shore — decor must be excluded from
that margin too, or a sheep appears to stand in the froth. And the `Tilemap_colorN`
interior cell is **(col 1, row 1)**: its left/middle/right pixel columns agree, unlike
`Tilemap_Flat`'s c2r1 whose right edge is `#161c2e` and seams every 64px.

**`file://` must keep working.** Hence classic `<script>` tags and a single global
`TS` namespace — no ES modules. Keep it that way.

**Every asset path goes through `encodeURI`.** The pack is full of spaces
(`Pawn_Idle Knife.png`, `UI Elements/UI Elements/`).

**Sprites are keyed by class alone** — each class belongs to exactly one faction
(knights are the player, goblins the enemy), so there is no team dimension.

## Verifying changes

`TS.dev` exposes narrow hooks for driving and inspecting: `screen`, `battle`,
`cards`, `title()`, `select()`, `start(i)`, `pause()`, `setSpeed(n)`,
`summon(cls)`, `volley(x)`, `grantGold(n)`, `counts()`, and
`fastSim(seconds, policyFn)`.

`fastSim` runs the simulation with no rendering, so a whole battle resolves in a
fraction of a second. Use it for balance work rather than watching battles.

**Look at the pixels.** Most bugs here were visual and invisible to any assertion —
seams, croppings, wrong occlusion, mis-centred glyphs. Drive a headless Chromium
over CDP (Edge is installed), screenshot, and read the image. Crop and zoom;
full-frame shots hide 5px errors. Capturing console messages and failed requests
at the same time catches asset typos immediately.

### The balance contract

After touching any combat number, unit stat or wave script, confirm all four hold.
A sweep over 12 battles x 4 policies takes under a minute with `fastSim`.

Battles 1-8 are chapter 1; battles 9-12 (chapter 2, the renegade knights) sit
behind the battle-8 gate and are tuned for an UPGRADED army — fresh-save losses
there are correct, exactly as battle 8's are. Chapter-2 economy stays at
battle-8 levels deliberately: a first draft gave the player 300-360 start gold
and every fresh bot swept the chapter at full tower HP, because a richer player
out-produces any wave that has not spawned yet.

| Policy | Fresh save | Fully upgraded |
|---|---|---|
| Buy the most expensive affordable unit | 5-7 of 12, **fails battle 8** | 11-12 (battle 7 ~60%) |
| Sensible mixed composition | 7-9 of 12, **fails battle 8** | wins all 12 (battle 8 ~9/10, at ~78%) |
| Archer + Pawn only | ~4-5 of 12 | ~10 of 12 |
| Pawn spam only | ~1 of 12 | ~3-4 of 12 |
| Do nothing | **loses** all 12 |  |

(The greedy rows softened when the TNT-vs-castle hit-test was fixed — enemy
artillery used to deal literally zero structural damage, so a crumbling defence was
never punished. Greedy's slow expensive openings now genuinely lose battle 7
sometimes, measured 6/10 maxed. That is the bug fix working, not a regression.)

**Battle 8 is deliberately the wall that the Barracks exists for.** No policy beats
it on a fresh save; upgrades are what open it. Since a flawless run of battles 1-7
banks enough gold for a meaningful slice of training, a normal player arrives with
the upgrades they need — the gate is a curve, not a brick wall. If a fresh save ever
starts clearing battle 8, the campaign has lost its only difficulty ceiling.

**The wall is guarded against more than the four canonical policies — keep it
that way.** Measured while tuning the volley: a balanced bot that merely BURNED
40 gold every 22s (buying nothing with it) beat battle 8 fresh 4/15 at full tower
HP, and a zero-damage volley cast on cooldown managed 7/15. The burn skews the
priority list toward cheaper units, and that pawn-skewed mix spawn-camped the hut
before the heavy waves arrived. The repair is the two shielded Renegade Blades at
t22 in battle 8's script, guarding the camp's opening — plain, burn and
zero-damage-volley bots are all back to 0/15. (A second barrel wave at t38
overshot the other way: MAXED balanced fell to 6/10, and the gate is supposed to
open, not wobble. It was removed; maxed balanced is 9/10 at ~78% tower HP.)
After adding ANY ability or income lever, re-run the burn bot at battle 8, not
just the canonical four.

The bot policies are a **floor, not a ceiling**: they never retreat, re-time a heal,
or react, so a human plays strictly better than these numbers. Do not tune to make a
bot win; tune the shape of the curve.

Also check no battle ends `unresolved` — every battle must resolve, which is what the
per-level `timeLimit` guarantees.

Sweep **twice**: once on a fresh save, and once with every class maxed in the
Barracks (`d.upg[cls] = Save.MAX_UPG`). A fresh save must reproduce the baseline
exactly, since level 0 is a 1.00 multiplier — if it does not, something is reading
upgrade state it should not.

**A kill-funded economy compounds — re-sweep it, always.** Income is part timer
(`goldRate * GOLD_RATE_MUL`) and part bounty (`BOUNTY` per goblin killed), currently
about 90/10. Bounties are not free money: the timer was cut by roughly what they add,
so only the *source* of income changed. But bounties scale with kills, kills scale
with battle length, and more gold buys more units that kill faster still. Measured:
raising bounties until kills were 17% of income made battle 8 fall on a **fresh save**
2 times in 15 at full tower HP, having never fallen without upgrades. The fix was to
damp the **Torch** bounty specifically — Torches are ~60% of spawns, so they are the
snowball's fuel — while leaving TNT the biggest single bounty, since reaching the
artillery is the hardest thing the player is asked to do.

**`read()` must COPY the object defaults.** `out[k] = DEFAULTS[k]` aliased `best`,
`upg` and `story`, so the first write mutated `DEFAULTS` itself and every later fresh
save inherited it. Reset Progress silently failed to clear upgrades, stars or watched
cutscenes until the page reloaded, and a repeated balance sweep reported a fresh save
as fully upgraded — which is how it was caught. Any new object-valued default needs
the same treatment.

**Single runs near a win/lose boundary are not a signal.** A sweep of TNT damage at
11 / 20 / 26 / 34 produced a *non-monotonic* result — 26 lost two battles that 34 won
at full HP. Derive combat numbers from something structural (see the Monk-throughput
argument on `TNT.dmg`) and use the sweep to confirm the shape, never to pick the value.

Two things drive that noise. The policies are crude, so one unit dying a second
earlier cascades through everything it could afford next. **And the sim is not
reproducible run to run:** `Math.random` is live in two sim paths — every unit's first
swing is jittered by `atkTimer` (so a rank does not swing in lockstep) and `guard`
classes have a 55% chance to play their block animation. Consequence: a *mid-battle*
snapshot differs every run — the same battle sampled at t=40 gave enemy HP 118 then
151 — while *final* outcomes are mostly robust, because they are usually not close.
So compare completed battles, never intermediate state, and treat a one-battle swing
at the boundary as noise rather than a result.

### Deploying

Hosted on GitHub Pages, which serves from **Linux and is case-sensitive** while
this machine is not. A wrong-case path works locally and 404s live. Verify every
requested URL against the real filenames before deploying — the asset folders have
a lot of capitals (`Factions/Goblins/Troops/...`).

Keep all paths **relative** so the app works under a project subpath.

## Layout notes

Logical canvas is 832x1472 (13x23 tiles of 64px), all art drawn at 1:1 and the
whole canvas scaled once. `TS.LAY` in `terrain.js` is the single source of truth for
every band — sand lane, depth rows, base and spawn positions. Read it rather than
hard-coding y values.

Filtering is chosen in **device** pixels, not CSS pixels: a phone at dpr 3 shows a
0.47x CSS scale but is really magnifying, and picking smooth filtering there would
blur the art needlessly.

## Scope

Do not add build tooling, frameworks or a package manager. The whole point is that
this folder is the deployable artifact.
