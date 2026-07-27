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

  var NUM_STYLE = {
    damage: { fill: '#fff3d6', stroke: '#5a2b1c', size: 27 },
    big: { fill: '#ffd257', stroke: '#5a2b1c', size: 34 },
    heal: { fill: '#a8ec8a', stroke: '#1f4a22', size: 26 },
    gold: { fill: '#ffd257', stroke: '#5a3a12', size: 26 }
  };

  FX.number = function (x, y, text, kind) {
    var st = NUM_STYLE[kind] || NUM_STYLE.damage;
    nums.push({
      x: x + (Math.random() * 18 - 9),
      y: y,
      vx: Math.random() * 22 - 11,
      vy: -78 - Math.random() * 26,
      t: 0,
      life: 0.85,
      text: text,
      st: st,
      pop: 0
    });
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
      n.vy += 150 * dt;   // gentle arc
      n.pop = Math.min(1, n.t / 0.12);
      if (n.t >= n.life) nums.splice(i, 1);
    }
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
