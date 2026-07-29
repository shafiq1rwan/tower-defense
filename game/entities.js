/* entities.js — units, castles, projectiles and the battle simulation.
 *
 * The lane is one-dimensional: the three "lanes" are depth rows for looks and
 * for queueing, but targeting works on X distance alone. That is what keeps a
 * clustered brawl readable.
 *
 * Damage lands on a named hit FRAME of the attack animation, never on animation
 * end. That single detail is most of why hits feel connected.
 */
(function (TS) {
  'use strict';

  /* Same-lane allies stop this far apart. Measured body widths are 58-79px, so
     46 leaves ranks overlapping by roughly a quarter — dense, but each unit is
     still individually readable. */
  var SPACING = 46;
  var ARROW_SPEED = 560;
  var GRAVITY = 620;

  /* Field caps. Two ranks can strike and there are three depth rows, so only
     about SIX allies can ever reach the enemy. The cap was 14, which meant slots
     7-14 were pure decoration: they queued at the back, contributed nothing, and
     read as a bug. Measured at the old cap, a full army spent 76% of its time
     waiting and the Warrior line attacked just 7% of the time.

     Dropping it to 8 is balance-neutral, not a nerf — verified by sweeping the
     whole campaign at caps 14 / 10 / 8 on both a fresh save and fully upgraded:
     same wins, clear times within a second or two. It only removes the dead
     weight, so every unit bought is a unit fighting.

     The player is capped BELOW the enemy on purpose: at equal caps the defence
     is unbreakable and every battle ends at full castle HP. Scripted spawns are
     deferred rather than dropped when a cap is hit, so a wave's total pressure
     still arrives — just spread out. */
  var MAX_ALLY = 8;
  var MAX_FOE = 18;

  /* -------------------------------------------------------------- unit defs -- */

  /* contact : how close this unit CLOSES to an enemy before holding position
     range   : how far it can strike from
     hitFrame: frame index of the attack strip where damage is applied
     height  : body height, used to place the HP bar above the head
   *
   * `contact` is set from MEASURED sprite widths (Pawn 62px, Warrior 79px,
   * Archer 70px, Monk 58px, Lancer 69px, all at their idle frame). It is roughly
   * one body width, which leaves opposing torsos clear with only their weapons
   * overlapping. Setting it below the body width makes the two front ranks stand
   * inside one another.
   *
   * `range` must exceed contact + SPACING so the SECOND rank can strike over the
   * front rank's shoulders, but stay under contact + 2*SPACING so the third
   * cannot — that keeps two ranks fighting per lane, which the battle balance is
   * tuned around. If units stopped at their own max range instead, the front gap
   * would always equal the range and only one unit per lane could ever fight,
   * deadlocking the battle no matter how many units each side has. */
  var UNIT_DEFS = {
    /* The Pawn is deliberately poor value per gold — it buys TEMPO, not power.
       Its short card recharge lets you plug a collapsing front faster than any
       other unit. Give it competitive damage and spamming it dominates, because
       only about two ranks can reach and cheap bodies refresh the front fastest. */
    Pawn: {
      name: 'Pawn', body: 62, cost: 30, hp: 70, dmg: 6, contact: 66, range: 118, speed: 62,
      cooldown: 0.9, height: 86,
      fps: { idle: 8, run: 12, attack: 11 }, hitFrame: 2,
      blurb: 'Cheap and quick. Buys you time, not damage.'
    },
    Warrior: {
      name: 'Warrior', body: 79, cost: 60, hp: 185, dmg: 21, contact: 78, range: 130,
      speed: 46, cooldown: 1.0, height: 92, guard: true, twoSwings: true,
      fps: { idle: 8, run: 11, attack: 12, attack2: 12, guard: 12 }, hitFrame: 2,
      blurb: 'The backbone. Best value on the front line.'
    },
    /* Fragile, but its contact distance keeps it far behind the melee, so it
       rarely has to survive anything. */
    Archer: {
      name: 'Archer', body: 70, cost: 90, hp: 78, dmg: 21, contact: 205, range: 260,
      speed: 44, cooldown: 1.3, height: 90, ranged: true,
      fps: { idle: 8, run: 10, attack: 13 }, hitFrame: 5,
      blurb: 'Kills from safety. Useless if the line breaks.'
    },
    Monk: {
      name: 'Monk', body: 58, cost: 120, hp: 110, dmg: 0, heal: 32, contact: 999,
      range: 175, speed: 42, cooldown: 2.2, height: 90,
      healer: true, keepDistance: 215,
      fps: { idle: 8, run: 10, attack: 12 }, hitFrame: 6,
      blurb: 'Heals the most wounded ally nearby.'
    },
    /* Holds a full lance-length back — the whole point of the class. */
    Lancer: {
      name: 'Lancer', body: 69, cost: 200, hp: 350, dmg: 42, contact: 104, range: 160,
      speed: 34, cooldown: 1.5, height: 96, guard: true,
      fps: { idle: 9, run: 10, attack: 9, guard: 11 }, hitFrame: 1,
      blurb: 'Slow, brutal, and strikes from behind the line.'
    },

    /* ---- Goblins: enemy only, never on a card ------------------------- */

    /* The horde staple. Measured body 74px wide, hence contact 76. */
    Torch: {
      name: 'Torch Goblin', body: 74, enemy: true,
      hp: 105, dmg: 13, contact: 76, range: 124, speed: 54,
      cooldown: 0.95, height: 88,
      /* Damage lands as the flame arc sweeps across, on frame 3 of 6. */
      fps: { idle: 8, run: 11, attack: 13 }, hitFrame: 3
    },
    /* Artillery: lobs dynamite OVER the melee at whatever is sheltering behind
       it. This is the only thing in the game that threatens a player back line —
       see findLobTarget for the measurements that made it necessary.

       `lob` 440 is geometric, not taste. An Archer holds 205 behind the clash and
       this goblin holds 200 in front of it, so a shot must carry 405 to reach one
       (415 for a Monk at keepDistance 215). 440 clears both with a little slack
       and stops short of the 451 a SECOND rank of TNT would need, so only the
       front artillery rank can hit the back line.

       `dmg` 34 is likewise derived. A Monk restores 32 every 2.2s — 14.5 hp/s —
       so at this 2.1s cooldown anything under 30 dmg is simply out-healed and the
       back line stays safe no matter how good the targeting is. Measured: at 20
       and at 26 the campaign still ended at full tower HP. 34 is 16.2 hp/s, just
       past one Monk, which is the point where keeping a healer alive becomes a
       real decision rather than a formality.

       The counter is deliberate: from 405px away the player's Archers (range 260)
       cannot shoot back, so the answer is to kill the goblin screen and let melee
       walk onto the TNT, which is fragile at 85hp. */
    TNT: {
      name: 'TNT Goblin', body: 86, enemy: true,
      hp: 85, dmg: 34, contact: 200, range: 250, speed: 44,
      cooldown: 2.1, height: 88, ranged: true, aoe: 58, lob: 440,
      fps: { idle: 8, run: 11, attack: 12 }, hitFrame: 5
    },
    /* ---- Enemy knights: the goblins' hired blades ---------------------- */

    /* Both of these hug their own front line, and that is NOT a stylistic choice —
       it is forced by reachability. Take the player's front rank as P. The goblin
       line stands at P+78 (Warrior contact), and the player's Archer stops 205 from
       the goblins, so it sits at P-127 and its 260 range reaches only to P+133.
       Mirror the player's own numbers onto an enemy and you get a unit at P+205
       (Archer contact) or P+215 (Monk keepDistance) — 330-340px from the player's
       archers, unreachable by everything the player owns. That is exactly the bug
       the TNT's `lob` had to be invented to fix, and repeating it would hand the
       goblins a back line with no counter.
       So both sit inside P+133. Spacing pushes them to roughly P+124 in practice,
       about 251 from the player's Archers — inside 260, with a little margin. */

    /* Outranges the player's melee (Warrior range 130) so it plinks the front rank
       from where swords cannot answer, but stands close enough that the player's own
       Archers can shoot back. That duel is the point of the unit.
       contact 120 / range 176 keeps the two-rank invariant: 120+46=166 < 176 <
       120+92=212. */
    FoeArcher: {
      name: 'Renegade Archer', body: 70, enemy: true,
      hp: 78, dmg: 18, contact: 120, range: 176, speed: 44,
      cooldown: 1.5, height: 90, ranged: true, arrow: 'arrowFoe',
      fps: { idle: 8, run: 10, attack: 13 }, hitFrame: 5
    },

    /* Heals the goblin line, which is the first thing in the game that asks the
       player to pick a target rather than just the nearest one.
       `heal` is derived against the player's throughput, the same way TNT.dmg was
       derived against the Monk's: 26 every 2.4s is 10.8 hp/s, while two ranks of
       Warriors put out about 42 hp/s. So one of these visibly prolongs the goblin
       line without ever stalling it, and it takes three of them to blunt a proper
       front — at which point killing them is obviously the play.
       keepDistance 110 is the reachability figure above; anything near the player
       Monk's 215 would make it invulnerable. */
    FoeMonk: {
      name: 'Renegade Monk', body: 58, enemy: true,
      hp: 110, dmg: 0, heal: 26, contact: 999, range: 175, speed: 42,
      cooldown: 2.4, height: 90, healer: true, keepDistance: 110,
      fps: { idle: 8, run: 10, attack: 12 }, hitFrame: 6
    },

    /* A rolling keg: quick, fragile, and detonates on contact instead of
       attacking. Kill it at range or it takes the front rank with it. */
    Barrel: {
      name: 'Barrel Bomb', body: 57, enemy: true,
      hp: 65, dmg: 32, contact: 48, range: 48, speed: 96,
      cooldown: 99, height: 64, suicide: true, aoe: 70,
      fps: { idle: 6, run: 13, attack: 14 }, hitFrame: 1
    }
  };
  TS.UNIT_DEFS = UNIT_DEFS;

  /* Per-card recharge, independent of gold. Stops the expensive units being
     spammed the instant you can afford them, and gives the cards' radial sweep
     something to show. */
  /* The Pawn's recharge is set so it cannot absorb the whole gold income on its
     own — otherwise spamming the cheapest unit converts 100% of income into
     front-line bodies and dominates every other strategy. */
  /* How close a unit closes to a BUILDING, as opposed to another unit.
     `contact` is body-to-body clearance — roughly one body width, so two opposing
     ranks stand chest to chest with only their weapons overlapping. A wall has no
     body, so reusing that number left a strip of bare ground between the sprite and
     the stonework: measured, a Warrior stopped 52px short of the hut's art edge and
     appeared to be swinging at nothing.
     Derived rather than picked, and deliberately kept ABOVE range - 2*SPACING so the
     third rank still cannot reach the wall. That keeps two ranks hitting a building
     exactly as before, which is what makes this a cosmetic fix rather than a stealth
     buff to how fast bases fall. The Lancer lands at 72 and stays visibly back —
     correct, since striking from a lance length is the whole point of the class. */
  function castleContact(def) {
    return Math.max(24, def.range - 2 * SPACING + 4);
  }

  var CARD_CD = { Pawn: 1.7, Warrior: 2.2, Archer: 3.0, Monk: 5.0, Lancer: 7.0 };
  TS.cardCooldown = function (cls) { return CARD_CD[cls] || 1.5; };

  /* ------------------------------------------------------------------ base -- */

  /* Per-faction base art. `ay` is the foot line inside the frame and artL/artR
     are how far the visible art reaches either side of the anchor — measured,
     because neither building fills its frame, and the frame width would be the
     wrong thing for the gate test (both buildings are ~113px of art inside a
     128px frame, and the base each replaced was wider still). */
  var BASE_META = {
    /* Tower_Blue: 128x256, art x7-120, base y234. Wreck base y229. */
    player: {
      img: 'basePlayer', wreck: 'basePlayerWreck',
      ax: 64, ay: 234, wreckAy: 229, artL: 57, artR: 56, frames: 1, fps: 1,
      firePlume: 42, shadowR: 58
    },
    /* Goblin_House: 128x192, art x7-119, base y170. Wreck base y173. */
    enemy: {
      img: 'baseEnemy', wreck: 'baseEnemyWreck',
      ax: 64, ay: 170, wreckAy: 173, artL: 57, artR: 55, frames: 1, fps: 1,
      firePlume: 42, shadowR: 56
    }
  };

  function Base(isPlayer, hp) {
    var LAY = TS.LAY;
    var meta = BASE_META[isPlayer ? 'player' : 'enemy'];
    this.meta = meta;
    this.isPlayer = isPlayer;
    this.hp = this.maxHp = hp;
    this.x = isPlayer ? LAY.playerCastleX : LAY.enemyCastleX;
    this.y = LAY.castleBaseY;
    this.frontX = isPlayer ? LAY.playerFrontX : LAY.enemyFrontX;
    this.img = TS.img(meta.img);
    this.wreckImg = TS.img(meta.wreck);
    this.fw = this.img.width / meta.frames;
    this.fh = this.img.height;
    this.anim = 0;
    this.flash = 0;
    this.dead = false;
    this.shake = 0;
    /* Smoothed bar value so the HP bar drains instead of snapping. */
    this.barHp = hp;
  }

  /* Outer edge of the VISIBLE art, used for gate occlusion. */
  Base.prototype.artEdge = function () {
    return this.isPlayer ? this.x + this.meta.artR : this.x - this.meta.artL;
  };

  Base.prototype.hurt = function (dmg) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    this.shake = 4;
    TS.FX.shake(4);
    if (this.hp <= 0) this.dead = true;
  };

  Base.prototype.update = function (dt) {
    this.flash = Math.max(0, this.flash - dt * 5);
    this.shake = Math.max(0, this.shake - dt * 22);
    this.anim += this.meta.fps * dt;
    this.barHp = TS.approach(this.barHp, this.hp, Math.max(40, this.maxHp) * dt * 1.6);
    /* Fire plumes once badly damaged, and on the wreck afterwards. */
    var burning = this.dead || this.hp / this.maxHp < 0.35;
    if (burning) {
      this.fireT = (this.fireT || 0) - dt;
      if (this.fireT <= 0) {
        this.fireT = 0.18 + Math.random() * 0.22;
        var spread = this.meta.firePlume;
        TS.FX.burst(TS.SPR.fx.fire, this.x + (Math.random() * 2 - 1) * spread,
          this.y - (this.dead ? 10 : 90) - Math.random() * 50, {
            fps: 14, scale: 0.6 + Math.random() * 0.5, alpha: 0.9
          });
      }
    }
  };

  Base.prototype.draw = function (ctx) {
    var meta = this.meta;
    var jx = this.shake ? (Math.random() * 2 - 1) * this.shake : 0;
    TS.blobShadow(ctx, this.x, this.y - 6, meta.shadowR, 24, 0.2);

    if (this.dead) {
      /* The full pack ships a rubble sprite for every building, so a fallen base
         leaves a wreck instead of vanishing. */
      var w = this.wreckImg;
      if (!w) return;
      ctx.drawImage(w, Math.round(this.x - meta.ax), Math.round(this.y - meta.wreckAy));
      return;
    }

    var f = this.anim | 0;
    var sx = (f % meta.frames) * this.fw;
    var dx = Math.round(this.x - meta.ax + jx);
    var dy = Math.round(this.y - meta.ay);
    ctx.drawImage(this.img, sx, 0, this.fw, this.fh, dx, dy, this.fw, this.fh);
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash * 0.55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.img, sx, 0, this.fw, this.fh, dx, dy, this.fw, this.fh);
      ctx.restore();
    }
  };

  /* ------------------------------------------------------------ projectile -- */

  /* One ballistic projectile, used for both the Archer's arrow and the TNT
     goblin's dynamite. `aoe` makes it detonate in a radius rather than striking
     a single target; `spin` tumbles the sprite instead of pointing it along the
     velocity, which is what dynamite should do. */
  function Projectile(o) {
    this.fromPlayer = o.fromPlayer;
    this.x = o.x;
    this.y = o.y;
    this.dmg = o.dmg;
    this.target = o.target;
    this.spr = o.spr;
    this.aoe = o.aoe || 0;
    this.spin = !!o.spin;
    this.speed = o.speed || ARROW_SPEED;
    this.dead = false;
    this.anim = 0;
    this.rot = 0;

    var t = o.target;
    var tx = t.x;
    var ty = (t.feetY || t.y) - (t.def ? t.def.height * 0.55 : 90);
    var dx = tx - o.x, dy = ty - o.y;
    var dist = Math.max(40, Math.hypot(dx, dy));
    this.T = dist / this.speed;
    this.t = 0;
    /* Ballistic solve, so the arc and the sprite's rotation always agree with
       the actual velocity. */
    this.vx = dx / this.T;
    this.vy = dy / this.T - 0.5 * GRAVITY * this.T;
  }

  Projectile.prototype.update = function (dt, battle) {
    this.t += dt;
    this.anim += 14 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += GRAVITY * dt;
    this.rot = this.spin ? this.anim * 0.9 : Math.atan2(this.vy, this.vx);

    if (this.t >= this.T) {
      this.dead = true;
      if (this.aoe) {
        battle.detonate(this.x, this.y, this.aoe, this.dmg, this.fromPlayer, false);
      } else {
        var t = this.target;
        if (t && !t.dead && t.hp > 0) t.hurt(this.dmg, this);
        /* Target died mid-flight: the arrow simply lands. */
        else TS.FX.dust(this.x, this.y + 8, { scale: 0.5 });
      }
    }
    if (this.x < -60 || this.x > TS.W + 60 || this.y > TS.H) this.dead = true;
  };

  Projectile.prototype.draw = function (ctx) {
    TS.drawFrame(ctx, this.spr, this.anim | 0, this.x, this.y, { rot: this.rot });
  };

  /* ------------------------------------------------------------------ unit -- */

  function Unit(battle, cls, isPlayer, lane, buff) {
    var LAY = TS.LAY;
    this.battle = battle;
    this.cls = cls;
    this.def = UNIT_DEFS[cls];
    this.isPlayer = isPlayer;
    this.dir = isPlayer ? 1 : -1;
    this.lane = lane;
    this.feetY = LAY.lanes[lane];
    /* Stagger the spawn along the march direction by depth row, so a burst of
       summons leaves the gate as a diagonal column instead of stacking into one
       vertical line at a single point. */
    this.x = (isPlayer ? LAY.playerSpawnX : LAY.enemySpawnX) +
      this.dir * (lane - 1) * 10;

    var mul = buff || 1;
    this.maxHp = Math.round(this.def.hp * mul);
    this.hp = this.maxHp;
    this.dmg = Math.round((this.def.dmg || 0) * mul);
    /* Scaled too, or the Monk would ignore upgrades entirely. */
    this.healAmount = Math.round((this.def.heal || 0) * mul);

    /* Sprites are keyed by class alone — each class belongs to one faction. */
    this.spr = TS.SPR.unit[cls];
    this.state = 'spawn';
    this.stateT = 0;
    this.animT = 0;
    this.anim = 'idle';
    this.atkTimer = 0.15 + Math.random() * 0.15;
    this.hitApplied = false;
    this.swing = 0;
    this.flash = 0;
    this.push = 0;
    /* Impact feel, all three DRAW-ONLY like `push` — see draw(). */
    this.punch = 0;       // attacker leaning into its own blow
    this.squash = 0;      // target compressing under one
    this.holdT = 0;       // hit-stop: frames left holding the drawn frame
    this.holdFrame = 0;
    this.dead = false;
    this.dieT = 0;
    this.target = null;
    this.stepT = 0;
    this.barShow = 0;
    this.blockT = 0;
    this.sideCd = 0;
    this.lastX = this.x;
    this.moved = 0;
  }

  Unit.prototype.animSpr = function () {
    return this.spr[this.anim] || this.spr.idle;
  };
  Unit.prototype.animFps = function () {
    return this.def.fps[this.anim] || 10;
  };

  Unit.prototype.setAnim = function (name) {
    if (this.anim === name) return;
    if (!this.spr[name]) name = 'idle';
    if (this.anim === name) return;
    this.anim = name;
    this.animT = 0;
  };

  Unit.prototype.hurt = function (dmg, from) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 1;
    this.barShow = 3.2;
    TS.FX.number(this.x, this.feetY - this.def.height - 6, dmg, 'damage');
    TS.FX.hitSpark(this.x + this.dir * -10, this.feetY - this.def.height * 0.5,
      this.dir > 0);
    /* Flinch away from the hit, scaled by how much of this unit's health the blow
       took. A Pawn's 6 damage and a barrel bomb's 32 used to flinch identically.
       This is a DRAW offset only — it never moves the unit, so it cannot affect
       reach or the tuned rank spacing. */
    var bite = TS.clamp(dmg / Math.max(1, this.maxHp), 0, 1);
    this.push = -this.dir * (5 + bite * 22);
    /* The same bite curve drives a draw-only squash, so a heavy blow visibly
       compresses the body while a chip hit barely registers. */
    this.squash = 0.45 + 0.55 * bite;
    TS.Audio.play('hit');

    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }
    /* Show off the Guard / Defence animations: only while already waiting, so
       a unit under heavy fire can still fight back. */
    if (this.def.guard && this.state === 'walk' && this.atkTimer > 0.2 &&
        Math.random() < 0.55) {
      this.state = 'guard';
      this.stateT = 0;
      this.setAnim('guard');
      this.animT = 0;
    }
  };

  Unit.prototype.heal = function (amount) {
    if (this.dead || this.hp >= this.maxHp) return false;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.barShow = 3.2;
    TS.FX.number(this.x, this.feetY - this.def.height - 6, '+' + amount, 'heal');
    TS.FX.heal(this.x, this.feetY);
    return true;
  };

  Unit.prototype.die = function () {
    if (this.dead) return;
    this.dead = true;
    this.state = 'die';
    this.dieT = 0;
    /* The full pack ships a proper death effect — a flash, then a skull that
       settles and sinks — so the sprite is removed at once and the effect stands
       in for it. Earlier versions faded the idle frame out instead, because the
       free pack had no death frames at all. A barrel bomb leaves no corpse. */
    if (this.def.suicide) {
      TS.FX.poof(this.x, this.feetY);
    } else {
      TS.FX.death(this.x, this.feetY);
    }
    TS.Audio.play('die');
    if (this.isPlayer) {
      this.battle.stats.lost++;
    } else {
      this.battle.stats.killed++;
      this.battle.bounty(this);
    }
  };

  /* Nearest enemy within reach, by absolute X distance. Absolute rather than
     "ahead only" so two units can never deadlock back-to-back. */
  Unit.prototype.findEnemy = function (maxRange) {
    var list = this.battle.units;
    var best = null, bestD = Infinity;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.dead || o.isPlayer === this.isPlayer) continue;
      var d = Math.abs(o.x - this.x);
      if (d <= maxRange && d < bestD) { bestD = d; best = o; }
    }
    return best;
  };

  /* The artillery target for a unit with `lob`: the nearest enemy that is
     SHELTERING behind the screen — a ranged unit or a healer.

     Without this the back line is untouchable. Measured over a full battle with
     a normal composition, the Archer took 60 damage to the Warrior's 724, because
     everything aims at the nearest enemy and the nearest enemy is always the
     melee screen. A back line therefore won by default, and upgrades to it just
     won faster.

     "Deepest enemy" was the obvious first rule and it is wrong: measured, it
     aimed at a Warrior on 11 of 11 shots, because the farthest player unit is
     usually a fresh reinforcement still walking up from the tower, not the
     archer line. Selecting on ROLE rather than distance is what actually lobs
     the dynamite over the wall. Nearest-of-those, so the shot is one it can
     reach; falls back to the ordinary target when nothing is hiding.

     Deliberately separate from the FIRE GATE, which stays `findEnemy(def.range)`.
     If `lob` also gated firing, every rank of artillery could shoot from far
     back — `range` keeps that to two ranks (see the contact/range invariant
     above) while `lob` only decides who the shot is aimed at. */
  Unit.prototype.findLobTarget = function (maxRange) {
    var list = this.battle.units;
    var best = null, bestD = Infinity;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.dead || o.isPlayer === this.isPlayer) continue;
      if (!o.def.ranged && !o.def.healer) continue;
      var d = Math.abs(o.x - this.x);
      if (d <= maxRange && d < bestD) { bestD = d; best = o; }
    }
    return best;
  };

  /* Any enemy at all ahead of us within `dist` — used by the Monk to hold back
     and by everyone to avoid walking through the front line. */
  Unit.prototype.enemyAhead = function (dist) {
    var list = this.battle.units;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.dead || o.isPlayer === this.isPlayer) continue;
      var dx = (o.x - this.x) * this.dir;
      if (dx > -20 && dx <= dist) return o;
    }
    return null;
  };

  Unit.prototype.blockedByAlly = function () {
    var list = this.battle.units;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === this || o.dead || o.isPlayer !== this.isPlayer) continue;
      if (o.lane !== this.lane) continue;
      var dx = (o.x - this.x) * this.dir;
      if (dx > 0 && dx < SPACING + 0.5) return true;
    }
    return false;
  };

  /* Is there space for me in `lane` at my current x? Checks both directions,
     since I would be dropping in alongside whoever is already there. */
  Unit.prototype.laneHasRoom = function (lane) {
    var list = this.battle.units;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === this || o.dead || o.isPlayer !== this.isPlayer) continue;
      if (o.lane !== lane) continue;
      if (Math.abs(o.x - this.x) < SPACING) return false;
    }
    return true;
  };

  /* Move to whichever other depth row is emptiest and has space here.
     Needed because rear-line units park a long way from the fight — an Archer
     holds at 205px and a Monk stops to heal wherever it happens to be — and
     enforceSpacing makes it impossible to overtake within a row. Without this, a
     melee unit spawned into an Archer's row queues up behind it and never
     reaches the enemy at all. */
  Unit.prototype.trySidestep = function () {
    var counts = [0, 0, 0], i;
    for (i = 0; i < this.battle.units.length; i++) {
      var o = this.battle.units[i];
      if (o.dead || o.isPlayer !== this.isPlayer) continue;
      counts[o.lane]++;
    }
    var order = [0, 1, 2]
      .filter(function (l) { return l !== this.lane; }, this)
      .sort(function (a, b) { return counts[a] - counts[b]; });
    for (i = 0; i < order.length; i++) {
      if (this.laneHasRoom(order[i])) {
        this.lane = order[i];
        this.sideCd = 1.4;   // no immediate second hop
        this.blockT = 0;
        return true;
      }
    }
    return false;
  };

  /* The wounded ally most in need, for the Monk. */
  Unit.prototype.findHealTarget = function () {
    var list = this.battle.units;
    var best = null, bestFrac = 1;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.dead || o.isPlayer !== this.isPlayer || o === this) continue;
      if (Math.abs(o.x - this.x) > this.def.range) continue;
      var frac = o.hp / o.maxHp;
      if (frac < 0.97 && frac < bestFrac) { bestFrac = frac; best = o; }
    }
    return best;
  };

  Unit.prototype.enemyCastle = function () {
    return this.isPlayer ? this.battle.enemyCastle : this.battle.playerCastle;
  };

  Unit.prototype.startAttack = function () {
    this.state = 'attack';
    this.stateT = 0;
    this.animT = 0;
    this.hitApplied = false;
    if (this.def.twoSwings && this.spr.attack2) {
      this.swing ^= 1;
      this.setAnim(this.swing ? 'attack2' : 'attack');
    } else {
      this.setAnim('attack');
    }
    if (this.def.healer) TS.Audio.play('heal');
    else if (this.def.ranged) TS.Audio.play('bow');
    else TS.Audio.play('swing');
  };

  Unit.prototype.applyHit = function () {
    this.hitApplied = true;
    var def = this.def;

    /* Hit-stop, for melee only — a bow release has no impact to sell. Proper
       hit-stop freezes time, which is not available here: the sim advances in
       fixed 1/60 steps and stalling it would make 1x and 3x disagree about the
       outcome. Holding the DRAWN frame for ~3 frames reads the same way and the
       simulation never knows it happened. */
    if (!def.ranged && !def.healer && !def.suicide) {
      this.punch = 1;
      this.holdFrame = this.animT | 0;
      this.holdT = 0.055;
    }

    if (def.healer) {
      var ally = this.healTarget;
      if (ally && !ally.dead) ally.heal(this.healAmount);
      return;
    }

    /* A suicide unit's "attack" is its own detonation. */
    if (def.suicide) {
      this.battle.detonate(this.x, this.feetY - 20, def.aoe, this.dmg,
        this.isPlayer, true);
      this.hp = 0;
      this.die();
      return;
    }

    if (def.ranged) {
      var t = this.target;
      if (t && !t.dead) {
        this.battle.projectiles.push(new Projectile({
          fromPlayer: this.isPlayer,
          x: this.x + this.dir * 22,
          y: this.feetY - def.height * 0.62,
          target: t,
          dmg: this.dmg,
          /* def.arrow lets a faction fire its own colour of arrow. */
          spr: def.aoe ? TS.SPR.dynamite
            : (def.arrow && TS.SPR[def.arrow]) || TS.SPR.arrow,
          aoe: def.aoe || 0,
          spin: !!def.aoe,
          speed: def.aoe ? 430 : ARROW_SPEED
        }));
      }
      return;
    }

    /* Melee: re-validate the target at the moment of impact, so a swing at a
       unit that already died naturally whiffs. */
    var tgt = this.target;
    if (tgt === this.enemyCastle()) {
      var c = tgt;
      if (!c.dead) {
        c.hurt(this.dmg);
        TS.FX.number(this.x + this.dir * 30, this.feetY - 120, this.dmg, 'big');
        TS.FX.hitSpark(this.x + this.dir * 34, this.feetY - 60, this.dir > 0);
        TS.Audio.play('castleHit');
      }
      return;
    }
    if (tgt && !tgt.dead && Math.abs(tgt.x - this.x) <= def.range + 16) {
      tgt.hurt(this.dmg, this);
    }
  };

  Unit.prototype.update = function (dt) {
    var def = this.def;
    var LAY = TS.LAY;
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.sideCd > 0) this.sideCd -= dt;
    /* Net displacement since the last step, AFTER enforceSpacing had its say —
       a unit being towed along behind a moving line still counts as moving. */
    this.moved = (this.x - this.lastX) * this.dir;
    this.lastX = this.x;
    /* Ease between depth rows so a sidestep reads as filing across, not a jump. */
    var rowY = LAY.lanes[this.lane];
    if (this.feetY !== rowY) this.feetY = TS.approach(this.feetY, rowY, 120 * dt);
    this.push = TS.approach(this.push, 0, 62 * dt);
    /* Decayed on the SIM clock, like `push`, so the impact reads identically at
       1x, 2x and 3x instead of lasting three times as long when sped up. */
    if (this.punch > 0) this.punch = Math.max(0, this.punch - dt * 5.5);
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 4.6);
    if (this.holdT > 0) this.holdT = Math.max(0, this.holdT - dt);
    if (this.barShow > 0) this.barShow -= dt;

    if (this.state === 'die') {
      this.dieT += dt;
      return;
    }

    this.atkTimer -= dt;
    this.animT += this.animFps() * dt;

    if (this.state === 'spawn') {
      this.stateT += dt;
      this.setAnim('idle');
      /* Walk out of the gate while the pop plays. */
      this.x += this.dir * def.speed * 0.6 * dt;
      if (this.stateT >= 0.3) { this.state = 'walk'; this.stateT = 0; }
      return;
    }

    if (this.state === 'guard') {
      this.stateT += dt;
      var gdur = this.spr.guard ? this.spr.guard.count / def.fps.guard : 0.4;
      if (this.stateT >= gdur) { this.state = 'walk'; this.stateT = 0; }
      return;
    }

    if (this.state === 'attack') {
      var spr = this.animSpr();
      if (!this.hitApplied && this.animT >= def.hitFrame) this.applyHit();
      if (this.animT >= spr.count) {
        this.state = 'walk';
        this.atkTimer = def.cooldown;
        this.setAnim('idle');
      }
      return;
    }

    /* ---- walk ---------------------------------------------------------- */

    if (def.healer) {
      /* Monks hold behind the line and heal rather than engage. */
      this.healTarget = this.findHealTarget();
      if (this.healTarget) {
        /* Someone in reach needs healing: plant and wait out the recharge rather
           than wandering forward between casts. Advancing here made the Monk
           break into a run the instant a heal finished, which read as though the
           animation had glitched. */
        if (this.atkTimer <= 0) { this.startAttack(); return; }
        this.setAnim('idle');
        return;
      }
      if (this.enemyAhead(def.keepDistance)) {
        this.blockT = 0;
        this.setAnim('idle');
        return;
      }
      if (this.blockedByAlly()) {
        this.setAnim(this.moved > 0.15 ? 'run' : 'idle');
        if (this.moved > 0.15) this.blockT = 0; else this.blockT += dt;
        if (this.blockT > 0.7 && this.sideCd <= 0) this.trySidestep();
        return;
      }
      this.blockT = 0;
      this.advance(dt);
      return;
    }

    var castle = this.enemyCastle();
    var castleDist = castle.dead ? Infinity : (castle.frontX - this.x) * this.dir;

    /* 1. Strike anything within range — including from the second rank. */
    var target = this.findEnemy(def.range);
    /* Artillery keeps the same fire gate but re-aims over the screen at whatever
       is sheltering behind it, falling back to the normal target if nothing is. */
    if (target && def.lob) target = this.findLobTarget(def.lob) || target;
    if (!target && castleDist <= def.range) target = castle;
    if (target && this.atkTimer <= 0) {
      this.target = target;
      this.startAttack();
      return;
    }

    /* 2. Hold once we are at contact distance, or an ally fills the space
          ahead. Otherwise keep closing — units creep forward between swings,
          which is what makes the front line push toward whoever is losing
          instead of locking in place. */
    if (this.findEnemy(def.contact) || castleDist <= castleContact(def)) {
      this.blockT = 0;
      this.setAnim('idle');
      return;
    }
    if (this.blockedByAlly()) {
      this.setAnim(this.moved > 0.15 ? 'run' : 'idle');
      if (this.moved > 0.15) this.blockT = 0; else this.blockT += dt;
      if (this.blockT > 0.7 && this.sideCd <= 0) this.trySidestep();
      return;
    }
    this.blockT = 0;
    this.advance(dt);
  };

  Unit.prototype.advance = function (dt) {
    var LAY = TS.LAY;
    this.setAnim('run');
    this.x += this.dir * this.def.speed * dt;
    this.x = TS.clamp(this.x, LAY.laneLeft, LAY.laneRight);

    /* Footstep dust, timed off the run cycle rather than a wall clock. */
    this.stepT += dt * this.def.fps.run;
    if (this.stepT >= 3) {
      this.stepT = 0;
      TS.FX.dust(this.x - this.dir * 12, this.feetY + 2, { scale: 0.42, flip: this.dir < 0 });
    }
  };

  /* Drawn rather than blitted. BOTH shadow sprites the pack ships
     (Terrain/Tileset/Shadow.png and Terrain/Ground/Shadows.png) are grey rounded
     SQUARES about as tall as they are wide, so used as a drop shadow they put a
     grey block behind every unit's legs. A flattened ellipse sized from the
     measured body width reads correctly and scales to each class — the Barrel is
     57px across where the TNT goblin is 86. */
  Unit.prototype.drawShadow = function (ctx) {
    if (this.dead) return;
    var rx = this.def.body * 0.40;
    TS.blobShadow(ctx, this.x + this.push, this.feetY - 3, rx, rx * 0.32, 0.27);
  };

  Unit.prototype.draw = function (ctx) {
    var spr = this.animSpr();
    var frame;
    var o = { flip: !this.isPlayer, flash: this.flash * 0.8 };

    /* Dead units draw nothing: the Dead effect spawned in die() stands in for the
       body, opening on a flash bright enough to cover the sprite disappearing. */
    if (this.state === 'die') return;

    if (this.state === 'spawn') {
      /* Overshooting pop as the unit emerges. */
      var p = TS.easeOutBack(Math.min(1, this.stateT / 0.3));
      o.scale = 0.55 + 0.45 * p;
      o.alpha = Math.min(1, this.stateT / 0.14);
    }

    frame = this.animT | 0;
    if (this.state === 'attack' || this.state === 'guard') {
      frame = Math.min(spr.count - 1, frame);
    }
    /* Hit-stop. Rendering only: applyHit fires off animT, so damage timing and
       the attack's real duration are untouched by the hold. */
    if (this.holdT > 0) frame = this.holdFrame;

    /* Squash and stretch. A side-on blow compresses the body along the lane and
       bulges it upward; an attacker does the reverse as it commits to the swing.
       Both are draw-only and must stay that way — the tuned rank spacing is
       measured off `body`, not off whatever the sprite is doing this frame. */
    if (this.punch > 0 || this.squash > 0) {
      var p = this.punch * 0.11, q = this.squash * 0.13;
      o.scaleX = (1 + p) * (1 - q);
      o.scaleY = (1 - p * 0.55) * (1 + q * 0.7);
    }
    TS.drawFrame(ctx, spr, frame, this.x + this.push, this.feetY, o);
  };

  Unit.prototype.drawBar = function (ctx) {
    if (this.dead) return;
    if (this.hp >= this.maxHp && this.barShow <= 0) return;
    var w = 46, h = 8;
    var x = Math.round(this.x + this.push - w / 2);
    var y = Math.round(this.feetY - this.def.height - 20);
    var frac = TS.clamp(this.hp / this.maxHp, 0, 1);
    TS.drawUnitBar(ctx, x, y, w, h, frac, this.isPlayer);
  };

  /* --------------------------------------------------------------- battle -- */

  function Battle(level) {
    this.level = level;
    this.units = [];
    this.projectiles = [];
    this.playerCastle = new Base(true, level.playerHp || 400);
    this.enemyCastle = new Base(false, level.enemyHp || 400);
    this.gold = level.startGold == null ? 150 : level.startGold;
    this.goldCap = level.goldCap || 400;
    /* Scaled down because kills now supply the rest — see BOUNTY. */
    this.goldRate = (level.goldRate || 12) * GOLD_RATE_MUL;
    this.time = 0;
    /* Every battle is on a clock, as in the reference. Without it a player who
       only trickles cheap units can hold a line forever and the battle never
       resolves either way. */
    this.timeLimit = level.timeLimit || 210;
    this.pending = [];        // scripted spawns waiting for room on the field
    this.over = null;         // 'win' | 'lose'
    this.overT = 0;
    this.byTimeout = false;
    this.stats = { killed: 0, lost: 0, spent: 0, earned: 0 };
    /* Draw-only, decayed on the SIM clock like unit.push so it reads the same at
       1x and 3x: brief flare on the purse when a bounty lands. */
    this.goldPulse = 0;
    /* Round-robin fallback so spawns spread across rows even when counts tie. */
    this.nextLane = 0;
    this.cooldowns = {};
    TS.CLASSES.forEach(function (c) { this.cooldowns[c] = 0; }, this);
  }
  TS.Battle = Battle;

  Battle.prototype.laneFor = function (isPlayer) {
    var counts = [0, 0, 0];
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.dead || u.isPlayer !== isPlayer) continue;
      counts[u.lane]++;
    }
    var best = 0;
    for (var l = 1; l < 3; l++) if (counts[l] < counts[best]) best = l;
    if (counts[0] === counts[1] && counts[1] === counts[2]) {
      best = this.nextLane;
      this.nextLane = (this.nextLane + 1) % 3;
    }
    return best;
  };

  Battle.prototype.liveCount = function (isPlayer) {
    var n = 0;
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.dead && u.isPlayer === isPlayer) n++;
    }
    return n;
  };
  Battle.prototype.isFull = function (isPlayer) {
    return this.liveCount(isPlayer) >= (isPlayer ? MAX_ALLY : MAX_FOE);
  };

  /* Push rear ranks back so no two same-lane allies ever occupy the same spot.
     blockedByAlly() alone is not enough: it only stops a unit when an ally is
     strictly AHEAD, so two units spawned into a full lane both stop dead at the
     spawn point and render exactly on top of each other. This resolves each
     lane into a clean queue every step. */
  Battle.prototype.enforceSpacing = function () {
    var groups = {}, i, k;
    for (i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.dead) continue;
      k = (u.isPlayer ? 'a' : 'b') + u.lane;
      (groups[k] || (groups[k] = [])).push(u);
    }
    for (k in groups) {
      var g = groups[k];
      var dir = g[0].dir;
      /* Front-most first, along this team's marching direction. */
      g.sort(function (p, q) { return (q.x - p.x) * dir; });
      for (var j = 1; j < g.length; j++) {
        var gap = (g[j - 1].x - g[j].x) * dir;
        if (gap < SPACING) {
          /* Queue backwards, allowing the tail to sit inside its own castle —
             it reads as units still filing out of the gate. */
          g[j].x = TS.clamp(g[j - 1].x - dir * SPACING, 40, TS.W - 40);
        }
      }
    }
  };

  /* Release queued scripted spawns as room frees up. */
  Battle.prototype.drainPending = function () {
    while (this.pending.length && !this.isFull(false)) {
      var e = this.pending.shift();
      this.spawn(false, e.cls, e.buff);
    }
  };

  Battle.prototype.spawn = function (isPlayer, cls, buff) {
    var u = new Unit(this, cls, isPlayer, this.laneFor(isPlayer), buff);
    this.units.push(u);
    TS.FX.dust(u.x, u.feetY, { scale: 0.7 });
    return u;
  };

  /* Area damage: everything on the opposing side within `radius` of (x,y) takes
     the full hit. Used by the TNT goblin's dynamite and the Barrel bomb, and it
     can strike a base as well as units. */
  Battle.prototype.detonate = function (x, y, radius, dmg, fromPlayer, big) {
    var i;
    for (i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.dead || u.isPlayer === fromPlayer) continue;
      /* Horizontal distance only: the three depth rows are a drawing device, not
         real space, so a blast should catch a whole column of the front line. */
      var d = Math.abs(u.x - x);
      if (d > radius) continue;
      u.hurt(dmg, null);
      /* Real positional knockback, and the ONLY place it happens. A blast is a
         rare, discrete event, so shoving survivors back reads well and its cost in
         lost attack time is bounded. Per-swing knockback would instead make the
         front gap oscillate, dropping the second rank in and out of reach and
         turning the tuned two-rank damage model to mush.
         Always backwards, never away from the blast centre — being pushed deeper
         into the enemy line would be a nonsense outcome. enforceSpacing only ever
         pushes units rearward, so it will not undo this. */
      if (!u.dead) {
        var falloff = 1 - d / radius;
        u.x = TS.clamp(u.x - u.dir * (10 + 26 * falloff),
          TS.LAY.laneLeft, TS.LAY.laneRight);
      }
    }
    var base = fromPlayer ? this.enemyCastle : this.playerCastle;
    if (!base.dead && Math.abs(base.frontX - x) <= radius) {
      base.hurt(dmg);
      TS.FX.number(x, y - 90, dmg, 'big');
    }
    TS.FX.explosion(x, y, !!big);
  };

  /* Gold for a kill. Income used to be a pure timer, which meant a flawless
     defence and a sloppy one banked exactly the same — nothing you did with the
     units you bought fed back into buying more.
     Values are proportional to what each goblin costs you to remove, not to its
     nuisance: the TNT is the highest bounty because reaching the artillery behind
     the screen is the hardest thing the player is asked to do. Rounded to whole
     gold so the HUD never shows a fraction.

     Deliberately NOT a `Math.random` roll. die() runs inside the simulation, so a
     random bounty would draw from the same PRNG as attack jitter — the coupling
     that scenery and audio both had to be freed from.

     Sizing is a TRADE, not free money: the timer rate is cut by GOLD_RATE_MUL by
     roughly as much as bounties are expected to add, so total income per battle
     stays close to the tuned figure and only its SOURCE changes. These values put
     kills at 10% of campaign income, measured; the timer supplies the rest.

     Getting the size wrong is not cosmetic, because a kill-funded economy
     COMPOUNDS: killing faster buys more units, which kill faster still. Measured
     at Torch 15 / TNT 28 / Barrel 10, kills reached 17% of income and battle 8
     started falling on a FRESH save — 2 wins in 15, at full tower HP, where it had
     never fallen without upgrades before. Battle 8 is the campaign's only
     difficulty ceiling, so that is a regression, not a nicety.

     The fix was to damp the TORCH specifically rather than the timer. Torches are
     around 60% of all spawns, so they are the snowball's fuel, while the TNT stays
     the biggest single bounty because reaching the artillery behind the screen is
     the hardest thing the player is asked to do. At these values battle 8 is back
     to 0 wins in 8 fresh attempts. Re-sweep after ANY change here. */
  /* The renegade knights are worth more than a Torch: the archer has to be shot
     off its perch and the monk has to be picked out of a line. */
  var BOUNTY = { Torch: 7, TNT: 20, Barrel: 7, FoeArcher: 16, FoeMonk: 18 };
  var GOLD_RATE_MUL = 0.90;

  Battle.prototype.bounty = function (unit) {
    var amount = BOUNTY[unit.cls] || 0;
    if (!amount) return;
    this.gold = Math.min(this.goldCap, this.gold + amount);
    this.stats.earned = (this.stats.earned || 0) + amount;
    /* An actual coin off the corpse, flying to the purse — see FX.coin. Text over
       the kill was the problem: that airspace belongs to damage numbers. */
    var purse = TS.UI.PURSE;
    TS.FX.coin(unit.x, unit.feetY - 30, amount, purse.x, purse.y);
    this.goldPulse = 1;
  };

  /* Player summon: checks affordability, per-card cooldown and the field cap. */
  Battle.prototype.trySummon = function (cls) {
    var def = UNIT_DEFS[cls];
    if (this.over) return false;
    if (this.gold < def.cost) return false;
    if (this.cooldowns[cls] > 0) return false;
    if (this.isFull(true)) return false;
    this.gold -= def.cost;
    this.stats.spent += def.cost;
    this.cooldowns[cls] = TS.cardCooldown(cls);
    /* Permanent upgrades bought with victory gold ride in as the spawn buff. */
    this.spawn(true, cls, TS.Save.unitBuff(cls));
    TS.Audio.play('summon');
    return true;
  };

  Battle.prototype.update = function (dt) {
    var i;
    this.time += dt;

    if (!this.over) {
      this.gold = Math.min(this.goldCap, this.gold + this.goldRate * dt);
      if (this.goldPulse > 0) this.goldPulse = Math.max(0, this.goldPulse - dt * 3.2);
      for (var c in this.cooldowns) {
        if (this.cooldowns[c] > 0) this.cooldowns[c] = Math.max(0, this.cooldowns[c] - dt);
      }
      TS.Levels.pumpWaves(this, dt);
      this.drainPending();
    }

    this.playerCastle.update(dt);
    this.enemyCastle.update(dt);

    for (i = 0; i < this.units.length; i++) this.units[i].update(dt);
    this.enforceSpacing();
    for (i = 0; i < this.projectiles.length; i++) this.projectiles[i].update(dt, this);

    /* Reap: dying units linger for their fade, arrows vanish on impact. */
    for (i = this.units.length - 1; i >= 0; i--) {
      var u = this.units[i];
      /* The corpse effect is independent of the unit, so dead units can go almost
         at once — one beat of grace keeps stat bookkeeping tidy. */
      if (u.state === 'die' && u.dieT > 0.05) this.units.splice(i, 1);
    }
    for (i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
    }

    if (!this.over) {
      if (this.enemyCastle.dead) this.finish('win');
      else if (this.playerCastle.dead) this.finish('lose');
      else if (this.time >= this.timeLimit) {
        /* On the bell, the side that held up better takes it. */
        var pf = this.playerCastle.hp / this.playerCastle.maxHp;
        var ef = this.enemyCastle.hp / this.enemyCastle.maxHp;
        this.finish(pf > ef ? 'win' : 'lose', true);
      }
    } else {
      this.overT += dt;
    }
  };

  Battle.prototype.timeLeft = function () {
    return Math.max(0, this.timeLimit - this.time);
  };

  Battle.prototype.finish = function (result, byTimeout) {
    this.over = result;
    this.overT = 0;
    this.byTimeout = !!byTimeout;
    /* No castle actually fell on a timeout, so skip the demolition. */
    if (!byTimeout) {
      var c = result === 'win' ? this.enemyCastle : this.playerCastle;
      TS.FX.explosion(c.x, c.y - 110, true);
      TS.FX.explosion(c.x - 60, c.y - 60, false);
      TS.FX.explosion(c.x + 70, c.y - 150, false);
    }
    TS.Audio.play(result === 'win' ? 'win' : 'lose');
  };

  /* Widest half-body in the pack (the Lancer's 45px). A unit is treated as still
     inside the gate until its whole sprite has cleared the building, so the
     handover to the front layer never pops any pixels into view. */
  var GATE_MARGIN = 46;

  function byDepth(a, b) {
    return (a.feetY - b.feetY) || (a.x - b.x);
  }

  function drawGroup(ctx, list) {
    var i;
    for (i = 0; i < list.length; i++) list[i].drawShadow(ctx);
    for (i = 0; i < list.length; i++) list[i].draw(ctx);
  }

  Battle.prototype.draw = function (ctx) {
    var i;
    var pc = this.playerCastle, ec = this.enemyCastle;
    /* Measured from the VISIBLE art, not the frame: the goblin tower fills only
       129px of its 256px frame, and using the frame width here would mark units
       as "behind the base" while standing in open ground — costing them their HP
       bars for no reason. */
    var pGate = pc.artEdge() + GATE_MARGIN;
    var eGate = ec.artEdge() - GATE_MARGIN;

    /* Units still inside a castle's footprint draw BEHIND it, so they walk out
       from behind the wall instead of standing on top of the masonry. The
       occlusion is per-pixel against the building sprite, which makes the reveal
       gradual rather than a hard cut. */
    /* Within a gate group, a unit NEARER than the building still has to draw in
       front of it — the bases stand on the middle depth row, so front-row units
       pass in front of them while the back two rows pass behind. */
    var behindPlayer = [], frontPlayer = [], behindEnemy = [], frontEnemy = [];
    var field = [];
    for (i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.x < pGate) (u.feetY > pc.y ? frontPlayer : behindPlayer).push(u);
      else if (u.x > eGate) (u.feetY > ec.y ? frontEnemy : behindEnemy).push(u);
      else field.push(u);
    }
    behindPlayer.sort(byDepth);
    frontPlayer.sort(byDepth);
    behindEnemy.sort(byDepth);
    frontEnemy.sort(byDepth);
    field.sort(byDepth);

    /* Ground dust sits behind the buildings too, or spawn puffs smear across
       the castle walls. */
    TS.FX.drawBack(ctx);

    drawGroup(ctx, behindPlayer);
    pc.draw(ctx);
    drawGroup(ctx, frontPlayer);
    drawGroup(ctx, behindEnemy);
    ec.draw(ctx);
    drawGroup(ctx, frontEnemy);

    drawGroup(ctx, field);

    for (i = 0; i < this.projectiles.length; i++) this.projectiles[i].draw(ctx);

    TS.FX.drawFront(ctx);
    /* Bars for everything not hidden behind a building. Units in the gate groups
       that draw IN FRONT of their base are fully visible, so they keep theirs. */
    for (i = 0; i < field.length; i++) field[i].drawBar(ctx);
    for (i = 0; i < frontPlayer.length; i++) frontPlayer[i].drawBar(ctx);
    for (i = 0; i < frontEnemy.length; i++) frontEnemy[i].drawBar(ctx);
  };

  TS.Unit = Unit;
  TS.Base = Base;

})(window.TS);
