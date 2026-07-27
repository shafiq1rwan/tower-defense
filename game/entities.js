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

  /* Field caps. Only about two ranks per lane can reach the enemy, so units
     beyond this are dead weight that merely crowds the art. Scripted spawns are
     deferred rather than dropped when the cap is hit, so a wave's total pressure
     still arrives — just spread out. */
  /* The player is deliberately capped BELOW the enemy. With equal caps the
     defence is unbreakable and every battle ends at full castle HP, which makes
     both the tension and the star rating meaningless. Fewer slots also mean
     filling them with cheap bodies has a real cost. */
  var MAX_ALLY = 14;
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
      name: 'Pawn', cost: 30, hp: 70, dmg: 6, contact: 66, range: 118, speed: 62,
      cooldown: 0.9, height: 86,
      fps: { idle: 8, run: 12, attack: 11 }, hitFrame: 2,
      blurb: 'Cheap and quick. Buys you time, not damage.'
    },
    Warrior: {
      name: 'Warrior', cost: 60, hp: 185, dmg: 21, contact: 78, range: 130,
      speed: 46, cooldown: 1.0, height: 92, guard: true, twoSwings: true,
      fps: { idle: 8, run: 11, attack: 12, attack2: 12, guard: 12 }, hitFrame: 2,
      blurb: 'The backbone. Best value on the front line.'
    },
    /* Fragile, but its contact distance keeps it far behind the melee, so it
       rarely has to survive anything. */
    Archer: {
      name: 'Archer', cost: 90, hp: 78, dmg: 21, contact: 205, range: 260,
      speed: 44, cooldown: 1.3, height: 90, ranged: true,
      fps: { idle: 8, run: 10, attack: 13 }, hitFrame: 5,
      blurb: 'Kills from safety. Useless if the line breaks.'
    },
    Monk: {
      name: 'Monk', cost: 120, hp: 110, dmg: 0, heal: 32, contact: 999,
      range: 175, speed: 42, cooldown: 2.2, height: 90,
      healer: true, keepDistance: 215,
      fps: { idle: 8, run: 10, attack: 12 }, hitFrame: 6,
      blurb: 'Heals the most wounded ally nearby.'
    },
    /* Holds a full lance-length back — the whole point of the class. */
    Lancer: {
      name: 'Lancer', cost: 200, hp: 350, dmg: 42, contact: 104, range: 160,
      speed: 34, cooldown: 1.5, height: 96, guard: true,
      fps: { idle: 9, run: 10, attack: 9, guard: 11 }, hitFrame: 1,
      blurb: 'Slow, brutal, and strikes from behind the line.'
    }
  };
  TS.UNIT_DEFS = UNIT_DEFS;

  /* Per-card recharge, independent of gold. Stops the expensive units being
     spammed the instant you can afford them, and gives the cards' radial sweep
     something to show. */
  /* The Pawn's recharge is set so it cannot absorb the whole gold income on its
     own — otherwise spamming the cheapest unit converts 100% of income into
     front-line bodies and dominates every other strategy. */
  var CARD_CD = { Pawn: 1.7, Warrior: 2.2, Archer: 3.0, Monk: 5.0, Lancer: 7.0 };
  TS.cardCooldown = function (cls) { return CARD_CD[cls] || 1.5; };

  /* ---------------------------------------------------------------- castle -- */

  function Castle(team, isPlayer, hp) {
    var LAY = TS.LAY;
    this.team = team;
    this.isPlayer = isPlayer;
    this.hp = this.maxHp = hp;
    this.x = isPlayer ? LAY.playerCastleX : LAY.enemyCastleX;
    this.y = LAY.castleBaseY;
    this.frontX = isPlayer ? LAY.playerFrontX : LAY.enemyFrontX;
    this.img = TS.img('castle:' + team);
    this.flash = 0;
    this.dead = false;
    this.shake = 0;
    /* Smoothed bar value so the HP bar drains instead of snapping. */
    this.barHp = hp;
  }

  Castle.prototype.hurt = function (dmg) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    this.shake = 4;
    TS.FX.shake(4);
    if (this.hp <= 0) this.dead = true;
  };

  Castle.prototype.update = function (dt) {
    this.flash = Math.max(0, this.flash - dt * 5);
    this.shake = Math.max(0, this.shake - dt * 22);
    this.barHp = TS.approach(this.barHp, this.hp, Math.max(40, this.maxHp) * dt * 1.6);
    /* Fire plumes once badly damaged. */
    if (!this.dead && this.hp / this.maxHp < 0.35) {
      this.fireT = (this.fireT || 0) - dt;
      if (this.fireT <= 0) {
        this.fireT = 0.16 + Math.random() * 0.2;
        var fx = this.x + (Math.random() * 190 - 95);
        TS.FX.burst(TS.SPR.fx.fire2, fx, this.y - 150 - Math.random() * 50, {
          fps: 15, scale: 0.7 + Math.random() * 0.5, alpha: 0.85
        });
      }
    }
  };

  Castle.prototype.draw = function (ctx) {
    if (this.dead) return;
    var img = this.img;
    var jx = this.shake ? (Math.random() * 2 - 1) * this.shake : 0;
    var dx = Math.round(this.x - img.width / 2 + jx);
    var dy = Math.round(this.y - img.height);
    TS.blobShadow(ctx, this.x, this.y - 6, 140, 26, 0.2);
    ctx.drawImage(img, dx, dy);
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash * 0.55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(img, dx, dy);
      ctx.restore();
    }
  };

  /* ----------------------------------------------------------------- arrow -- */

  function Arrow(team, x, y, target, dmg) {
    this.team = team;
    this.x = x;
    this.y = y;
    this.dmg = dmg;
    this.target = target;
    this.dead = false;

    var tx = target.x;
    var ty = (target.feetY || target.y) - (target.def ? target.def.height * 0.55 : 90);
    var dx = tx - x, dy = ty - y;
    var dist = Math.max(40, Math.hypot(dx, dy));
    this.T = dist / ARROW_SPEED;
    this.t = 0;
    /* Ballistic solve so the arrow arcs and its rotation always matches its
       actual velocity. */
    this.vx = dx / this.T;
    this.vy = dy / this.T - 0.5 * GRAVITY * this.T;
  }

  Arrow.prototype.update = function (dt, battle) {
    this.t += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += GRAVITY * dt;
    this.rot = Math.atan2(this.vy, this.vx);

    if (this.t >= this.T) {
      this.dead = true;
      var t = this.target;
      if (t && !t.dead && t.hp > 0) {
        t.hurt(this.dmg, this);
      } else {
        /* Target died mid-flight: the arrow simply lands. */
        TS.FX.dust(this.x, this.y + 8, { scale: 0.5 });
      }
    }
    if (this.x < -60 || this.x > TS.W + 60 || this.y > TS.H) this.dead = true;
  };

  Arrow.prototype.draw = function (ctx) {
    TS.drawFrame(ctx, TS.SPR.arrow, 0, this.x, this.y, { rot: this.rot });
  };

  /* ------------------------------------------------------------------ unit -- */

  function Unit(battle, team, cls, isPlayer, lane, buff) {
    var LAY = TS.LAY;
    this.battle = battle;
    this.team = team;
    this.cls = cls;
    this.def = UNIT_DEFS[cls];
    this.isPlayer = isPlayer;
    this.dir = isPlayer ? 1 : -1;
    this.lane = lane;
    this.feetY = LAY.lanes[lane];
    this.x = isPlayer ? LAY.playerSpawnX : LAY.enemySpawnX;

    var mul = buff || 1;
    this.maxHp = Math.round(this.def.hp * mul);
    this.hp = this.maxHp;
    this.dmg = Math.round((this.def.dmg || 0) * mul);

    this.spr = TS.SPR.unit[team][cls];
    this.state = 'spawn';
    this.stateT = 0;
    this.animT = 0;
    this.anim = 'idle';
    this.atkTimer = 0.15 + Math.random() * 0.15;
    this.hitApplied = false;
    this.swing = 0;
    this.flash = 0;
    this.push = 0;
    this.dead = false;
    this.dieT = 0;
    this.target = null;
    this.stepT = 0;
    this.barShow = 0;
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
    /* Small shove away from the attacker, purely for feel. */
    if (from) this.push = -this.dir * 7;
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
    TS.FX.poof(this.x, this.feetY);
    TS.Audio.play('die');
    if (this.isPlayer) this.battle.stats.lost++;
    else this.battle.stats.killed++;
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
      if (dx > 0 && dx < SPACING) return true;
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

    if (def.healer) {
      var ally = this.healTarget;
      if (ally && !ally.dead) ally.heal(def.heal);
      return;
    }

    if (def.ranged) {
      var t = this.target;
      if (t && !t.dead) {
        this.battle.arrows.push(new Arrow(
          this.team,
          this.x + this.dir * 22,
          this.feetY - def.height * 0.62,
          t, this.dmg
        ));
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
    this.flash = Math.max(0, this.flash - dt * 6);
    this.push = TS.approach(this.push, 0, 34 * dt);
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
      if (this.healTarget && this.atkTimer <= 0) { this.startAttack(); return; }
      if (this.enemyAhead(def.keepDistance) || this.blockedByAlly()) {
        this.setAnim('idle');
        return;
      }
      this.advance(dt);
      return;
    }

    var castle = this.enemyCastle();
    var castleDist = castle.dead ? Infinity : (castle.frontX - this.x) * this.dir;

    /* 1. Strike anything within range — including from the second rank. */
    var target = this.findEnemy(def.range);
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
    if (this.findEnemy(def.contact) || castleDist <= def.contact ||
        this.blockedByAlly()) {
      this.setAnim('idle');
      return;
    }
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

  Unit.prototype.drawShadow = function (ctx) {
    if (this.dead) return;
    TS.drawFrame(ctx, TS.SPR.shadow, 0, this.x + this.push, this.feetY, { alpha: 0.5 });
  };

  Unit.prototype.draw = function (ctx) {
    var spr = this.animSpr();
    var frame;
    var o = { flip: !this.isPlayer, flash: this.flash * 0.8 };

    if (this.state === 'die') {
      /* No death frames exist in the pack, so a unit collapses: fade, shrink,
         and tip over slightly. */
      var k = Math.min(1, this.dieT / 0.36);
      o.alpha = 1 - k;
      o.scale = 1 - k * 0.25;
      o.rot = this.dir * k * 0.5;
      o.flash = (1 - k) * 0.35;
      frame = 0;
      TS.drawFrame(ctx, this.spr.idle, frame, this.x, this.feetY, o);
      return;
    }

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
    this.arrows = [];
    this.playerCastle = new Castle('Blue', true, level.playerHp || 400);
    this.enemyCastle = new Castle('Red', false, level.enemyHp || 400);
    this.gold = level.startGold == null ? 150 : level.startGold;
    this.goldCap = level.goldCap || 400;
    this.goldRate = level.goldRate || 12;
    this.time = 0;
    /* Every battle is on a clock, as in the reference. Without it a player who
       only trickles cheap units can hold a line forever and the battle never
       resolves either way. */
    this.timeLimit = level.timeLimit || 210;
    this.pending = [];        // scripted spawns waiting for room on the field
    this.over = null;         // 'win' | 'lose'
    this.overT = 0;
    this.byTimeout = false;
    this.stats = { killed: 0, lost: 0, spent: 0 };
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
    var team = isPlayer ? 'Blue' : 'Red';
    var u = new Unit(this, team, cls, isPlayer, this.laneFor(isPlayer), buff);
    this.units.push(u);
    TS.FX.dust(u.x, u.feetY, { scale: 0.7 });
    return u;
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
    this.spawn(true, cls, 1);
    TS.Audio.play('summon');
    return true;
  };

  Battle.prototype.update = function (dt) {
    var i;
    this.time += dt;

    if (!this.over) {
      this.gold = Math.min(this.goldCap, this.gold + this.goldRate * dt);
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
    for (i = 0; i < this.arrows.length; i++) this.arrows[i].update(dt, this);

    /* Reap: dying units linger for their fade, arrows vanish on impact. */
    for (i = this.units.length - 1; i >= 0; i--) {
      var u = this.units[i];
      if (u.state === 'die' && u.dieT > 0.45) this.units.splice(i, 1);
    }
    for (i = this.arrows.length - 1; i >= 0; i--) {
      if (this.arrows[i].dead) this.arrows.splice(i, 1);
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
    var pGate = pc.x + pc.img.width / 2 + GATE_MARGIN;
    var eGate = ec.x - ec.img.width / 2 - GATE_MARGIN;

    /* Units still inside a castle's footprint draw BEHIND it, so they walk out
       from behind the wall instead of standing on top of the masonry. The
       occlusion is per-pixel against the building sprite, which makes the reveal
       gradual rather than a hard cut. */
    var behindPlayer = [], behindEnemy = [], field = [];
    for (i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.x < pGate) behindPlayer.push(u);
      else if (u.x > eGate) behindEnemy.push(u);
      else field.push(u);
    }
    behindPlayer.sort(byDepth);
    behindEnemy.sort(byDepth);
    field.sort(byDepth);

    /* Ground dust sits behind the buildings too, or spawn puffs smear across
       the castle walls. */
    TS.FX.drawBack(ctx);

    drawGroup(ctx, behindPlayer);
    pc.draw(ctx);
    drawGroup(ctx, behindEnemy);
    ec.draw(ctx);

    drawGroup(ctx, field);

    for (i = 0; i < this.arrows.length; i++) this.arrows[i].draw(ctx);

    TS.FX.drawFront(ctx);
    /* Only units clear of the gates get bars — a bar floating over a castle for
       a unit you cannot see reads as a glitch. */
    for (i = 0; i < field.length; i++) field[i].drawBar(ctx);
  };

  TS.Unit = Unit;
  TS.Castle = Castle;

})(window.TS);
