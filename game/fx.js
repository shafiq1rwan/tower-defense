/* fx.js — particles, floating numbers and screen shake.
 *
 * This is the juice layer. The pack has no death or hurt animations, so the
 * dust puffs and hit sparks here are doing the work those frames would.
 */
(function (TS) {
  'use strict';

  var anims = [];   // one-shot sprite animations
  var nums = [];    // floating damage / heal / gold numbers
  var shakeAmp = 0;
  var shakeT = 0;

  var FX = {};
  TS.FX = FX;

  FX.reset = function () {
    anims.length = 0;
    nums.length = 0;
    coins.length = 0;
    FX.purseFlash = 0;
    shakeAmp = 0;
    shakeT = 0;
  };

  /* Play a sprite strip once. `back:true` draws it behind the units, which is
     right for ground dust; hit sparks and explosions read better in front. */
  FX.burst = function (spr, x, y, o) {
    o = o || {};
    anims.push({
      spr: spr,
      x: x,
      y: y,
      t: 0,
      fps: o.fps || 18,
      scale: o.scale == null ? 1 : o.scale,
      alpha: o.alpha == null ? 1 : o.alpha,
      flip: !!o.flip,
      back: !!o.back,
      fade: o.fade !== false
    });
  };

  FX.dust = function (x, y, o) {
    o = o || {};
    FX.burst(TS.SPR.fx.dust1, x, y, {
      fps: 20, scale: o.scale || 0.85, alpha: 0.8, back: true, flip: o.flip
    });
  };

  /* Bigger, slower puff used when a unit dies. */
  FX.poof = function (x, y) {
    FX.burst(TS.SPR.fx.dust2, x, y, { fps: 22, scale: 1.15, alpha: 0.95, back: true });
  };

  FX.hitSpark = function (x, y, flip) {
    FX.burst(TS.SPR.fx.dust1, x, y, { fps: 26, scale: 0.62, alpha: 0.95, flip: flip });
  };

  FX.explosion = function (x, y, big) {
    FX.burst(TS.SPR.fx.boom, x, y, {
      fps: big ? 15 : 19, scale: big ? 1.3 : 0.95
    });
    FX.shake(big ? 16 : 7);
  };

  /* The full pack's death effect: a bright flash, then a skull that settles and
     sinks away. Drawn behind the units, since it belongs on the ground — the
     opening flash is bright enough to read through a crowd regardless. */
  FX.death = function (x, y) {
    FX.burst(TS.SPR.dead, x, y, { fps: 12, back: true, fade: false });
  };

  /* Heal_Effect is a separate 11-frame overlay layer that sits on the healed
     unit, so it uses the unit anchor rather than a centred FX anchor. */
  FX.heal = function (x, y) {
    FX.burst(TS.SPR.healFx, x, y, { fps: 18, alpha: 0.95 });
  };

  /* Bounty text used to be #ffd257 at size 26 — the same gold as `big` castle-damage
     numbers, within a pixel of ordinary `damage`, rising from the same spot with the
     same arc. It read as another damage number because nothing about it said "money".
     Floating text was the wrong tool: it is now an actual COIN that drops off the
     kill and flies to the purse (see FX.coin), and `gold` is only the small "+N" that
     pops at the purse when the coin lands. Flat rise and short life, because by then
     the coin has already told the story. */
  var NUM_STYLE = {
    damage: { fill: '#fff3d6', stroke: '#5a2b1c', size: 27 },
    big: { fill: '#ffd257', stroke: '#5a2b1c', size: 34 },
    heal: { fill: '#a8ec8a', stroke: '#1f4a22', size: 26 },
    gold: { fill: '#ffe487', stroke: '#5a3a12', size: 22, rise: -30, grav: 30, life: 0.8 }
  };

  FX.number = function (x, y, text, kind) {
    var st = NUM_STYLE[kind] || NUM_STYLE.damage;
    nums.push({
      x: x + (Math.random() * 18 - 9),
      y: y,
      /* `drift` biases the sideways travel — currency leans toward the purse rather
         than scattering either way like a damage number. */
      vx: (st.drift || 0) + Math.random() * 22 - 11,
      vy: (st.rise || -78) - Math.random() * 26,
      grav: st.grav == null ? 150 : st.grav,
      t: 0,
      life: st.life || 0.85,
      text: text,
      st: st,
      pop: 0
    });
  };

  /* ------------------------------------------------------------- coins -- */

  /* A bounty is a coin, not a caption: it pops off the corpse, falls, then flies to
     the purse and pops a small "+N" on arrival. Two reasons that beats text —
     it cannot be mistaken for damage, and it shows you WHERE the gold went.
     The gold itself is credited immediately by Battle.bounty; this is pure
     feedback, so a coin still in flight never means gold you cannot spend yet. */
  var coins = [];
  FX.purseFlash = 0;

  var DROP = 0.30;   // seconds falling off the kill
  var FLY = 0.42;    // seconds travelling to the purse

  FX.coin = function (x, y, amount, tx, ty) {
    coins.push({
      x: x, y: y, amount: amount, tx: tx, ty: ty,
      /* Pops up and slightly toward the purse before gravity takes it. */
      vx: -20 - Math.random() * 30,
      vy: -150 - Math.random() * 60,
      t: 0, spin: Math.random() * 6.28, flying: false, sx: 0, sy: 0
    });
  };

  function updateCoins(dt) {
    if (FX.purseFlash > 0) FX.purseFlash = Math.max(0, FX.purseFlash - dt * 3.4);
    for (var i = coins.length - 1; i >= 0; i--) {
      var c = coins[i];
      c.t += dt;
      c.spin += 9 * dt;
      if (!c.flying) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vy += 620 * dt;
        if (c.t >= DROP) {
          /* Remember where the fall ended; the flight interpolates from there so
             there is no visible jump between the two phases. */
          c.flying = true;
          c.sx = c.x; c.sy = c.y; c.t = 0;
        }
        continue;
      }
      var k = Math.min(1, c.t / FLY);
      var e = TS.easeOutCubic(k);
      c.x = c.sx + (c.tx - c.sx) * e;
      /* Arcs rather than sliding: lifts above the straight line, most at mid-flight. */
      c.y = c.sy + (c.ty - c.sy) * e - Math.sin(k * Math.PI) * 90;
      if (k >= 1) {
        FX.number(c.tx, c.ty - 30, '+' + c.amount, 'gold');
        FX.purseFlash = 1;
        TS.Audio.play('coin');
        coins.splice(i, 1);
      }
    }
  }

  /* Drawn AFTER the HUD, unlike every other effect — the purse sits inside the wood
     panel, so a coin on the normal FX layer would slide under it and vanish exactly
     as it arrived. */
  FX.drawCoins = function (ctx) {
    for (var i = 0; i < coins.length; i++) {
      var c = coins[i];
      /* Shrinks slightly as it lands, which reads as dropping into the purse. */
      var k = c.flying ? Math.min(1, c.t / FLY) : 0;
      TS.drawFrame(ctx, TS.SPR.fxCoin, 0, c.x, c.y, {
        scale: 0.5 - 0.16 * k, rot: c.spin
      });
    }
  };

  FX.shake = function (amount) {
    /* Take the strongest request rather than summing, so a pile-up of hits
       cannot shake the screen into nonsense. */
    if (amount > shakeAmp) { shakeAmp = amount; shakeT = 0; }
  };

  FX.update = function (dt) {
    var i, a;
    for (i = anims.length - 1; i >= 0; i--) {
      a = anims[i];
      a.t += dt;
      if (a.t * a.fps >= a.spr.count) anims.splice(i, 1);
    }
    for (i = nums.length - 1; i >= 0; i--) {
      var n = nums[i];
      n.t += dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.vy += n.grav * dt;   // gentle arc; currency uses a much flatter one
      n.pop = Math.min(1, n.t / 0.12);
      if (n.t >= n.life) nums.splice(i, 1);
    }
    updateCoins(dt);

    if (shakeAmp > 0) {
      shakeT += dt;
      shakeAmp -= shakeAmp * 9 * dt + 12 * dt;
      if (shakeAmp < 0.15) shakeAmp = 0;
    }
  };

  /* Decaying oscillation reads as an impact; pure random noise reads as a bug. */
  FX.shakeOffset = function () {
    if (shakeAmp <= 0) return null;
    var d = Math.exp(-shakeT * 7);
    return {
      x: Math.sin(shakeT * 61) * shakeAmp * d,
      y: Math.cos(shakeT * 47) * shakeAmp * d * 0.6
    };
  };

  function drawAnims(ctx, back) {
    for (var i = 0; i < anims.length; i++) {
      var a = anims[i];
      if (!!a.back !== back) continue;
      var f = a.t * a.fps;
      if (f >= a.spr.count) continue;
      var k = f / a.spr.count;
      var alpha = a.fade ? a.alpha * (1 - k * k * 0.75) : a.alpha;
      TS.drawFrame(ctx, a.spr, f | 0, a.x, a.y, {
        alpha: alpha, scale: a.scale, flip: a.flip
      });
    }
  }

  FX.drawBack = function (ctx) { drawAnims(ctx, true); };
  FX.drawFront = function (ctx) { drawAnims(ctx, false); };

  FX.drawNumbers = function (ctx) {
    for (var i = 0; i < nums.length; i++) {
      var n = nums[i];
      var k = n.t / n.life;
      var alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      /* Overshoot scale-in makes small numbers feel snappy. */
      var s = TS.easeOutBack(n.pop);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(Math.round(n.x), Math.round(n.y));
      ctx.scale(s, s);
      TS.text(ctx, n.text, 0, 0, {
        size: n.st.size, fill: n.st.fill, stroke: n.st.stroke
      });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

})(window.TS);
