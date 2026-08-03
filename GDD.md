# Lane Siege — Game Design Document

A description of the game **as built**, not as hoped for. Every number here is the
one in the code, and where a number was derived rather than chosen, the derivation is
given. `README.md` is the player- and deploy-facing doc; `CLAUDE.md` is the working
notes for changing the code. This file is the design.

---

## 1. Overview

| | |
|---|---|
| **Genre** | Lane battler / lane defence, real time |
| **Platform** | Browser (HTML5), portrait, mobile-first. Also installs as a PWA |
| **Orientation** | Portrait, 832 × 1472 logical pixels |
| **Audience** | Casual strategy players; anyone who has played *The Battle Cats* |
| **Session** | One battle 30–90 seconds. A campaign run is a single sitting |
| **Price** | Free |
| **Art** | Pixel Frog's *Tiny Swords* pack (licensed, not generated) |
| **Audio** | Entirely synthesised in-browser — the pack ships none |

### High concept

Your knights and a goblin warband face each other across one sand lane. Gold accrues,
you spend it on summon cards, your units walk out and brawl wherever they meet. Win by
burning down the goblin camp before the clock runs out; lose if your tower falls first.

### What makes it not just a spawn-clicker

Only about **six units can physically reach the enemy** at once. Composition therefore
matters more than volume, and the game is built around teaching that.

---

## 2. Design pillars

1. **Reach is the real resource, not gold.** Two ranks fight across three depth rows.
   Everything else — the field cap, unit roles, the enemy roster — follows from that.
2. **Every number is derived or measured.** Combat values come from throughput
   arguments and sprite measurements, never from taste. A number nobody can justify is
   a number nobody can safely change.
3. **The lane is sacred.** Themes, weather and water dress the field but never touch
   lane geometry. Presentation may not alter play.
4. **Determinism where it counts.** The simulation advances only in fixed 1/60s steps.
   Fast-forward feeds it more steps; it cannot change an outcome.
5. **Readable over dense.** Three factions in three colours, damage over heads,
   currency at feet, one status line at a time.

---

## 3. Core loop

```
        ┌──────────────────────────────────────────────┐
        │                                              │
   choose battle ──> cutscene ──> BATTLE ──> result ───┤
        ▲                          │         (swords)  │
        │                          │            │      │
        │                    gold in ──────> gold out  │
        │                    (timer +          │       │
        │                     bounties)        ▼       │
        └──────────────────────── Barracks ────────────┘
                                 (permanent +12% per level)
```

**In-battle loop**, every few seconds: read the lane → decide what the line is short
of → check gold and card recharge → summon → watch it change the clash.

---

## 4. Mechanics

### 4.1 The lane

One horizontal lane with **three depth rows** (feet at y765 / y835 / y905). Rows are
cosmetic and for queueing — **all targeting is on X distance alone**, which is what
keeps a crowded brawl readable. Both bases stand on the middle row.

`TS.LAY` in `terrain.js` is the single source of truth for every band and position.

### 4.2 Two-rank combat — the central invariant

Each unit has two distances:

- **`contact`** — how close it closes before holding position
- **`range`** — how far it can strike from

The invariant:

```
contact + SPACING  <  range  <  contact + 2 × SPACING       (SPACING = 46)
```

The lower bound lets the **second** rank strike over the front rank's shoulders. The
upper bound stops the **third**. Measured participation: rank 0 attacks ~28% of frames,
rank 1 ~21%, rank 2 exactly 0%.

If units instead stopped at their own max range, the front gap would always equal the
range and only **one** unit per lane could ever fight — the battle deadlocks no matter
how many units either side has. That failure was observed before `contact` and `range`
were separated.

`contact` values come from **measured sprite widths** (Pawn 62px, Warrior 79px, Archer
70px, Monk 58px, Lancer 69px). Roughly one body width leaves opposing torsos clear with
only weapons overlapping; below that, front ranks stand inside one another.

**Against buildings** a separate, smaller distance applies — a wall has no body, so
reusing `contact` left a 52px strip of bare ground between a Warrior and the hut it was
hitting. Building contact is `max(24, range − 2 × SPACING + 4)`, deliberately above
`range − 2×SPACING` so the third rank still cannot reach and base DPS is unchanged.

### 4.3 Field caps

| | Value | Reason |
|---|---|---|
| Player | **8** | Only ~6 can reach. At the old cap of 14, a full army spent 76% of its time waiting and the Warrior line attacked 7% of frames — slots 7–14 read as a bug. Verified balance-neutral at 14 / 10 / 8 |
| Enemy | **18** | Deliberately higher. At equal caps the defence is unbreakable and every battle ends at full tower HP, making both tension and the star rating meaningless |

Scripted enemy spawns are **deferred, not dropped**, when the cap is hit — a wave's
total pressure still arrives, just spread out.

### 4.4 Economy

Two sources, roughly **90 / 10**:

- **Timer** — `goldRate × GOLD_RATE_MUL` per second, capped at `goldCap`
- **Bounty** — gold per goblin killed

Bounties exist because a pure timer means a flawless defence and a sloppy one bank
identical income. The timer was cut by roughly what bounties add, so **total income is
about the same and only its source changed**.

| Enemy | Bounty |
|---|---|
| Torch Goblin | 7 |
| TNT Goblin | 20 |
| Barrel Bomb | 7 |
| Renegade Archer | 16 |
| Renegade Monk | 18 |

**Sizing this is dangerous and must be re-swept.** A kill-funded economy compounds:
killing faster buys more units that kill faster still. Measured at Torch 15 / TNT 28 /
Barrel 10, kills reached 17% of income and **battle 8 began falling on a fresh save** —
2 wins in 15, at full tower HP, having never fallen without upgrades. The fix was to
damp the **Torch** specifically (~60% of all spawns, so it is the snowball's fuel) while
keeping TNT the largest single bounty, because reaching the artillery behind the screen
is the hardest thing the player is asked to do.

### 4.5 Summoning

Three independent gates, all of which must pass:

1. **Cost** — gold on hand
2. **Card recharge** — per class, independent of gold
3. **Field cap** — 8 live allies

| Class | Recharge |
|---|---|
| Pawn | 1.7s |
| Warrior | 2.2s |
| Archer | 3.0s |
| Monk | 5.0s |
| Lancer | 7.0s |

The Pawn's recharge is set so it **cannot absorb the whole income on its own**.
Without that, spamming the cheapest unit converts 100% of gold into front-line bodies
and dominates every other strategy, because only two ranks reach and cheap bodies
refresh the front fastest.

### 4.6 Victory, defeat, and the clock

- **Win** — destroy the enemy hut
- **Lose** — your tower is destroyed
- **Timeout** — whichever base is in better shape wins

Every level carries a `timeLimit` (170–260s) and an `endless` tail. Without the tail, a
player turtling behind Warriors could hold indefinitely and the battle would never
resolve. **No battle may ever end unresolved** — that is a tested condition.

---

## 5. Player roster

| Class | Cost | HP | DMG | Contact | Range | Speed | Cooldown | Role |
|---|---|---|---|---|---|---|---|---|
| **Pawn** | 30 | 70 | 6 | 66 | 118 | 62 | 0.9s | Tempo. Cheap and quick |
| **Warrior** | 60 | 185 | 21 | 78 | 130 | 46 | 1.0s | Backbone. Guards while waiting, alternates two swings |
| **Archer** | 90 | 78 | 21 | 205 | 260 | 44 | 1.3s | Damage from behind the screen |
| **Monk** | 120 | 110 | heals 32 | — | 175 | 42 | 2.2s | Heals the most wounded ally within range |
| **Lancer** | 200 | 350 | 42 | 104 | 160 | 34 | 1.5s | Slow and brutal, strikes over the front rank |

**The Pawn is deliberately poor value per gold.** It buys tempo, not power — its short
recharge plugs a collapsing front faster than anything else. Give it competitive damage
and Pawn-spam dominates.

**The Monk holds at `keepDistance` 215**, well behind the clash, and has no attack.
Upgrades scale its healing as well as HP — reading `def.heal` directly instead of the
buffed value was a bug.

---

## 6. Enemies

| Enemy | HP | DMG | Contact | Range | Speed | Cooldown | Behaviour |
|---|---|---|---|---|---|---|---|
| **Torch Goblin** | 105 | 13 | 76 | 124 | 54 | 0.95s | The horde staple |
| **TNT Goblin** | 85 | 34 | 200 | 250 | 44 | 2.1s | Artillery. AoE 58, lobs to 440 |
| **Barrel Bomb** | 65 | 32 | 48 | 48 | 96 | — | Suicide keg, AoE 70 |
| **Renegade Archer** | 78 | 18 | 120 | 176 | 44 | 1.5s | Outranges your melee |
| **Renegade Monk** | 110 | heals 26 | — | 175 | 42 | 2.4s | Heals the goblin line |

### 6.1 The TNT Goblin, and the problem it solves

Everything targets its **nearest** enemy, and the nearest enemy is always the melee
screen. So Archers (205 behind the clash) and Monks (215) were **structurally
invulnerable**: measured across a whole battle, the Archer took 60 damage to the
Warrior's 724. Massing a back line won by default, and upgrading it just won faster.

The TNT is the counter, and it works because of two separate things:

- **`findLobTarget` selects on role** (ranged or healer), not distance. "Aim at the
  deepest enemy" was the obvious rule and it is wrong — measured, it hit a Warrior on
  **11 of 11 shots**, because the farthest enemy unit is usually a fresh reinforcement
  still walking up from the tower.
- **`lob` is separate from the fire gate.** Firing is still gated on
  `findEnemy(range)`; if `lob` also gated it, every rank of artillery could shoot from
  the back. `range` is what keeps it to two ranks.

`lob` **440** is geometric: an Archer holds 205 behind the clash and the TNT 200 in
front of it, so a shot must carry 405 to reach one (415 for a Monk). 440 clears both
and stops short of the 451 a *second* TNT rank would need.

`dmg` **34** is derived against healing throughput. A Monk restores 32 every 2.2s =
14.5 hp/s, so at a 2.1s cooldown anything under ~30 is simply out-healed. Measured: at
20 and at 26 the campaign still ended at full tower HP. 34 is 16.2 hp/s — just past one
Monk, which is where keeping a healer alive becomes a decision.

The counter is deliberate: from 405px the player's Archers (range 260) **cannot shoot
back**. The answer is to kill the goblin screen and let melee walk onto the TNT.

### 6.2 The renegade knights, and reachability

Both hug their own front line, and that is forced, not stylistic. With the player's
front rank at **P**: the goblin line stands at P+78, the player's Archer stops 205 from
the goblins so it sits at **P−127**, and its 260 range reaches only to **P+133**.

Mirroring the player's own numbers onto an enemy puts it at P+205 (Archer contact) or
P+215 (Monk keepDistance) — 330–340px from the player's archers, **unreachable by
everything the player owns**. That is the exact bug `lob` had to be invented to fix.

So the Renegade Archer sits at contact 120 (range 176 keeps two ranks: 166 < 176 < 212)
and the Renegade Monk at keepDistance 110. Measured in play, the archer lands ~221px
from the player's archers — inside 260.

The Renegade Monk's heal is derived the same way as `TNT.dmg`: 26 every 2.4s = 10.8
hp/s against roughly 42 hp/s from two Warrior ranks. One visibly prolongs the goblin
line without stalling it; it takes three to blunt a proper front, at which point killing
them is obviously the play. It also queues *behind its own crowd*, so you kill through
the screen to reach it — the same counterplay shape as the TNT.

### 6.3 Chapter 2's blades

Two more renegades carry the second chapter, both MELEE so the reachability trap
above never applies to them:

- **Renegade Blade** (purple Warrior, 150hp / 17dmg, guards): the player Warrior's
  mirror, tuned one step below it so the mirror match rewards upgrades instead of
  stonewalling them. Its job is to make cheap-swarm pushes expensive — which is
  also why a pair of them at t22 is what seals battle 8's spawn-camp hole.
- **Renegade Captain** (purple Lancer, 420hp / 36dmg, guards, speed 30): the heavy.
  22.5 dps is under two player Warriors' answer, so it is a WALL that grinds, not
  an assassin — the counter is focus fire, and its slow walk telegraphs when.
  Biggest knight bounty (18); the TNT keeps the overall crown (20) because
  bounties reward reachability, not toughness.

---

## 7. Progression

### 7.1 Sword rating

Rated out of three on **tower HP remaining** (`Save.STAR_AT`):

| Tower remaining | Swords |
|---|---|
| 85%+ | 3 |
| 50%+ | 2 |
| below | 1 |

The rule is printed on the result panel directly under the tower percentage, and above
the battle list — it should never have to be guessed at.

### 7.2 Barracks

Victory gold scales with the same percentage. Spend it on permanent training:

- **3 levels per class**, each **+12% health and power** (`UPG_STEP` 0.12)
- Costs **120 / 260 / 520** — 900 to max one class, 4,500 to max all five
- A flawless run of all eight battles banks about **1,416**

So a first campaign buys a meaningful slice, not the lot, and *which* classes you invest
in is a real choice. Replaying pays out again — that is the reason to go back for three
swords.

### 7.3 Battle 8 is the gate

**No policy beats battle 8 on a fresh save** — verified 0 wins in 15 attempts across
three sane strategies. Upgrades are what open it. Since a flawless run of 1–7 banks
enough for a meaningful slice of training, a normal player arrives with roughly what
they need: the gate is a curve, not a brick wall.

If a fresh save ever starts clearing battle 8, the campaign has lost its only
difficulty ceiling.

---

## 8. Campaign

| # | Name | Objective | Cards | Tower | Hut | Gold start / rate / cap | Buff | Limit |
|---|---|---|---|---|---|---|---|---|
| 1 | First Blood | Drive off the goblin scouts | P W | 400 | 300 | 150 / 14 / 340 | 1.00 | 170s |
| 2 | Powder and Fuse | Silence the TNT throwers | P W A | 400 | 370 | 160 / 15 / 380 | 1.00 | 180s |
| 3 | The Green Tide | Hold against the horde | P W A | 420 | 430 | 170 / 16 / 420 | 1.00 | 190s |
| 4 | Rolling Thunder | Stop the barrel bombs | P W A M | 440 | 470 | 190 / 17 / 460 | 1.04 | 200s |
| 5 | Blast Radius | Mind the dynamite | all | 460 | 520 | 210 / 18 / 520 | 1.06 | 215s |
| 6 | Two Fronts | Hold, then push | all | 480 | 580 | 230 / 20 / 560 | 1.08 | 230s |
| 7 | Iron Tide | Survive, then break through | all | 500 | 640 | 250 / 22 / 620 | 1.11 | 245s |
| 8 | The Goblin Camp | Burn down the goblin hut | all | 520 | 720 | 280 / 24 / 700 | 1.15 | 260s |
| 9 | Broken Oaths | Rout the renegade vanguard | all | 540 | 760 | 240 / 22 / 700 | 1.12 | 270s |
| 10 | The Captain's Column | Bring down the Renegade Captain | all | 560 | 800 | 250 / 23 / 720 | 1.14 | 280s |
| 11 | Ashes on the Wind | Weather the combined assault | all | 580 | 850 | 260 / 23 / 740 | 1.17 | 290s |
| 12 | The Renegade King | End the march for good | all | 600 | 900 | 270 / 24 / 760 | 1.20 | 300s |

Battles 1–8 are **Chapter I: The Goblin War**; 9–12 are **Chapter II: The Renegade
March**, unlocked by beating battle 8 and tuned for the upgraded army a player has
by then. Chapter 2's player economy deliberately stays at battle-8 levels — a first
draft with 300–360 start gold was swept at full tower HP by FRESH bots, because a
richer player out-produces any wave that has not spawned yet. Its waves are also
front-loaded (shields on the field by t2–8): the measured failure mode of easy
battles is scripts whose pressure arrives after the battle is already decided.

**Teaching order.** One new idea per battle: 1 introduces melee, 2 the TNT (and the
Archer to answer it), 3 volume, 4 the Barrel and the Monk, 5 the Lancer and massed
dynamite, 6–8 the renegades as hirelings, 9 the shielded Blade line, 10 the Captain,
11 combined arms, 12 everything at once. The renegades arrive from 5 because a healer
only means something once the player has enough damage on the field for denying it
to matter.

**`buff` stays low** (max 1.20). The enemy already gets free units; a large multiplier
on top makes late battles mathematically unwinnable rather than hard.

**Waves are a declarative timed script** — `{ t, cls, n, gap }` — not a gold-budget AI,
so the difficulty curve is directly authorable and a battle plays the same way twice.

---

## 9. Presentation

### 9.1 Layout

832 × 1472 logical (13 × 23 tiles of 64px). All art drawn at 1:1 and the whole canvas
scaled **once** to the viewport — per-sprite fractional scaling would not stay crisp.
Filtering is chosen in **device** pixels, not CSS pixels: a phone at dpr 3 shows a 0.47
CSS scale but is really magnifying, so smoothing there would blur the art needlessly.

| Band | Content |
|---|---|
| 0–280 | HUD: purse, wins, battle number, pause, speed, timer, objective |
| ~300–640 | Upper field — scenery, weather, water |
| 640–1024 | **The lane** — three depth rows, both bases |
| 1024–1200 | Lower field — foreground scenery |
| 1200–1472 | Wood panel: gold meter, status line, five summon cards |

### 9.2 Themes

Each battle has its own visual identity (`themes.js`), and the campaign darkens as it
escalates: **Green Meadow → Riverside → Windy Highland → Grey Downpour → Still Marsh →
Last Light → Thunderhead → Goblin Camp.** Each sets ground palette, weather, water and
how much wildlife is about; scenery count falls from 20 items to 10 as it gets bleaker.

**A theme may dress the field but never change the lane.** Water is always a band in the
**upper** field; the sand always comes from `Tilemap_Flat` whatever the theme. Weather
and the day-tint draw in front of the units but inside the world transform, so they
colour the battle and never the HUD.

Weather is procedural — the pack ships none. Rain streaks are drawn along the actual
fall vector so the slant always matches the wind; embers are the one weather that moves
*upward*, which is what makes them read as heat rather than precipitation.

### 9.3 Feel

- **Fixed timestep, so impact is rendering, never time.** Hit-stop normally freezes
  time, which is unavailable here — stalling the sim would make 1× and 3× disagree about
  who won. Instead the *drawn* frame holds ~3 frames while animation time keeps
  advancing, so damage still lands on schedule.
- **Squash and stretch**: attacker stretches ~11% along the lane, target compresses ~9%,
  scaled by how much of its health the blow took. Draw-only — rank spacing is measured
  off `body`, never off what the sprite is doing this frame.
- **Real knockback happens in exactly one place**, `Battle.detonate`, because a blast is
  rare and discrete. Per-swing knockback would oscillate the front gap and drop the
  second rank in and out of range.
- **Currency is a coin, not a caption.** A bounty coin drops off the kill, falls, then
  arcs to the purse and pops a `+N` on arrival. Floating gold text read as a damage
  number; damage lives over heads, currency at feet.

### 9.4 Audio

All synthesised. Twelve effects (swing, hit, bow, die, heal, summon, coin, castleHit,
click, deny, win, lose) plus a background score whose key and tempo come from the
level's theme. Music sits on its own mixer bus at 0.16 against the effects' 0.5, and is
scheduled ahead on the audio clock — **verified 2.50s per bar at both 1× and 3×**,
because battle music that accelerated with fast-forward would be unbearable.

### 9.5 Narrative

Nine short cutscenes — one before each battle, one after the last is won — playing over
that level's own backdrop, so battle 4's conversation happens in the rain and the
epilogue is lit by embers. Three voices: **Captain Aldric** (terse), **Brother Fen**
(observant), **Grix** (a goblin).

The arc: sheep start vanishing; the goblins turn out to be carrying mining powder, which
scouts don't; you push them back and slowly work out they were never raiding you — they
were running, and you were in the way. Ends unresolved: the tunnels go deeper than the
camp did.

Skippable, and recorded in the save so they never replay — a cutscene you cannot escape
on the fourth attempt at battle 8 is how you make someone quit.

---

## 10. Controls

| Input | Action |
|---|---|
| Tap / click a card | Summon |
| `1`–`5` | Summon by slot |
| Arrow button / `V`, then tap the lane | Arrow volley (40g, 22s cd) |
| Speed button / `Space` | Cycle 1× / 2× / 3× |
| Gear / `P` / `Esc` | Pause |
| Swipe map / `←` `→` / edge chevrons | Turn between chapters |
| Tap anywhere (cutscene) | Advance — completes the typewriter first |

Leaving a battle mid-fight asks for confirmation; a mis-tap should not throw away a run.

### 10.1 The arrow volley — the second verb

The roster gives the player one decision (what to buy); the volley adds a second
(where and when to intervene). Arm it, tap the lane, and the tower looses eight
arrows in a fixed spread — 16 damage each in a 26px strike radius, enough to
gut a Torch clump or finish wounded attackers, deliberately not enough to
assassinate anything healthy at battle-8 buffs.

Its defining constraint is that it is **defensive**: the landing centre is capped
at a fixed line just past mid-lane (`VOLLEY.reach` = 460), shown by the aiming
ring turning red. Four offensive versions were tried and every one cracked the
battle-8 gate — a deep volley suppresses the TNT artillery (the sole counter to
a massed back line), and once the field cap pins the army at 8 with gold clipped
at the cap, any wallet-priced ability converts wasted income into free damage,
which is why pricing it at 40 gold made the problem worse rather than better.
A fixed defensive line is the only shape that cannot fund a push by
construction. The tuning post-mortem lives on `VOLLEY` in entities.js.

---

## 11. Technical constraints that shape design

These are design constraints, not just implementation details:

- **Fixed 1/60s timestep.** Nothing in sim logic may read wall-clock time, or 1× / 2× /
  3× stop agreeing. UI animation deliberately uses a separate real-time clock.
- **No build step, no dependencies, no framework.** Classic `<script>` tags and one
  global `TS` namespace so the game runs from `file://`. The folder is the artifact.
- **Presentation must not touch the simulation's RNG.** Scenery and effects each have
  their own seeded generator; audio builds its noise buffer once. Otherwise weather
  perturbs combat and *having sound on* changes a battle.
- **Measure the art, never infer it.** Every visual bug in this project came from
  assuming sheet geometry. Frame counts do not follow from image width.

---

## 12. Balance contract

After touching any combat number, unit stat or wave script, confirm all of this. A sweep
over 8 battles × 5 policies takes seconds with `TS.dev.fastSim`.

| Policy | Fresh save | Fully upgraded |
|---|---|---|
| Buy most expensive affordable | 5–7 of 8, **fails battle 8** | 8/8 |
| Sensible mixed composition | 7 of 8, **fails battle 8** | 8/8 |
| No healer | 7 of 8, **fails battle 8** | 8/8 |
| Archer + Pawn only | 3–5 of 8 | 7–8 of 8 |
| Pawn spam only | ~1 of 8 | 3–4 of 8 |
| Do nothing | loses all 8 | — |

Also: **no battle may end unresolved**, and battle 8 must stay unwinnable on a fresh
save (tested 0 / 15).

**Sweep twice** — once fresh, once with every class maxed. And treat single runs near a
boundary as noise: `Math.random` is live in the sim (first-swing jitter, the 55% guard
chance), so mid-battle snapshots differ every run while final outcomes are mostly
robust. A sweep of TNT damage at 11 / 20 / 26 / 34 came back **non-monotonic**.

**The bot policies are a floor, not a ceiling.** They never retreat, re-time a heal, or
react. A human plays strictly better, so tune the *shape* of the curve — never tune to
make a bot win.

---

## 13. Known gaps

Honest list, roughly by value:

1. **Nothing exists past battle 8.** Sword ratings are the only replay hook and they
   only ask you to redo what you have beaten. A survival mode or hard campaign is the
   biggest missing piece; the per-level `endless` trickle already generates escalating
   waves and could be promoted.
2. **Nothing teaches the central mechanic.** That only ~6 units can reach is the reason
   massing does nothing, and the game never says so.
3. **Player agency is thin.** ~~The only input is *which card, when*.~~ Largely
   addressed: the arrow volley (§10.1) adds a targeted intervention; the tower-tap
   mason converts gold into tower percentage (which the sword rating reads); war
   horns telegraph every scripted wave 4s out so preparation is a real skill; and
   each battle carries an optional cosmetic challenge (pennant on the map — kept
   deliberately reward-free, since every measured economy lever compounds). Still
   no retreat or rally — a positioning verb remains the one open agency gap.
3b. ~~Battle 8's wall is calibrated against four bot policies, not the composition
   space.~~ **Repaired.** The burn-bot exploit (4/15 fresh wins at full tower HP via
   a cheapened mix spawn-camping the hut) is closed by two shielded Renegade Blades
   guarding the camp's opening at t22. Burn, zero-damage-volley and plain bots all
   measure 0/15 fresh; maxed balanced still opens the gate at 9/10.
4. **Progress may not persist on itch.io.** The game runs in a third-party iframe, so
   `localStorage` is partitioned and Safari can clear it. Degrades gracefully (every
   access is guarded) but a save code would fix it.
5. **The simulation uses the global `Math.random`.** Six call sites. Until it has its
   own generator, the "presentation must not touch sim RNG" rule is a discipline rather
   than a guarantee — and sweep results keep run-to-run variance that makes single
   battles untrustworthy.
6. **Difficulty options.** Battle 8 is a deliberate wall; some players will bounce off
   rather than grind.
7. **Unit inspection.** Costs are visible, stats are not.

### Considered and rejected

- **Landscape orientation.** Requested once. The fixed furniture (HUD, 384px lane, card
  bar) does not shrink, so rotating to 1472×832 leaves ~98px for scenery bands that
  currently occupy ~516px — trees alone are 192–256px tall. It would multiply lane
  length and delete the background animations that prompted the request. *Battle Cats
  is itself portrait.* The real fix for the desktop experience is filling the letterbox
  with the themed backdrop.
- **A per-battle spawn budget.** Would cap how fast you win rather than change how you
  play; the field cap and card recharges already limit throughput.
