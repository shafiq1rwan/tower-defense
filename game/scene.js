/* scene.js — animated scenery.
 *
 * Layout is seeded so a battle looks identical every time you replay it.
 * Every item carries its own animation phase and frame rate; without that the
 * trees and bushes sway in visible lockstep, which instantly reads as cheap.
 *
 * Scenery draws in one list sorted by base Y, so nearer items occlude further
 * ones. It all draws behind the units: every scenery base sits either above the
 * sand lane or below it, and sprites extend upward from their anchor, so nothing
 * here can reach a unit standing on the lane.
 */
(function (TS) {
  'use strict';

  var Scene = {
    clouds: [], trees: [], bushes: [], sheep: [], layer: [],
    water: [], weather: [], theme: null, flash: 0, flashT: 0
  };
  TS.Scene = Scene;

  /* Scene.update runs INSIDE simulate(), so any Math.random() in here would draw
     from the same global stream the simulation uses for atkTimer jitter and the
     guard chance — meaning a rainy level would perturb combat RNG, and denser
     weather would perturb it differently. Scenery therefore gets its own seeded
     generator and never touches Math.random. Keeps the sim's stream ours alone,
     and makes the weather and the sheep reproducible on a replay as a bonus. */
  var srnd = TS.rng(0x51f7a3);

  Scene.build = function (seed, theme) {
    var LAY = TS.LAY;
    var rnd = TS.rng((seed || 1337) ^ 0x5bf03635);
    var i;

    theme = theme || TS.defaultTheme();
    Scene.theme = theme;
    var water = theme.water || null;
    /* Re-seeded per level so scenery animation is stable across replays. */
    srnd = TS.rng(((seed || 1337) * 2654435761) ^ 0x51f7a3);

    /* Ground scenery inside a water band — or its foam margin — is suppressed. The
       spot lists below are shared by every theme; the theme decides how many are
       used and the water decides which are legal, so a lake never has a tree in it.
       Because take() walks each list IN ORDER, the ordering doubles as a priority:
       put the spots worth keeping first, and a thinned-out theme drops the filler. */
    var dry = TS.dryOf(theme);
    function take(spots, n) {
      var out = [];
      for (var k = 0; k < spots.length && out.length < n; k++) {
        if (dry(spots[k][1])) out.push(spots[k]);
      }
      return out;
    }

    /* --- clouds ---------------------------------------------------------- */
    /* The pack's clouds ship with their own grey shadow underlay, meaning they
       are meant to float above the terrain rather than sit behind it. Kept out
       of the lane band so they never obscure combat. */
    Scene.clouds = [];
    /* Upper field only. A cloud drifting across the lower field washes out the
       strip between the cliff and the card panel. */
    var cloudBands = [340, 470, 578, 396, 528, 300];
    /* The pool can be short of 8 if a cloud sheet failed to download — assets.js
       skips missing ones so the loader survives. No pool, no clouds. */
    var cloudPool = TS.SPR.decor.cloud;
    var nClouds = Math.min(theme.clouds == null ? 3 : theme.clouds, cloudBands.length);
    if (!cloudPool.length) nClouds = 0;
    var cloudA = theme.cloudAlpha == null ? 1 : theme.cloudAlpha;
    var cloudV = theme.cloudSpeed == null ? 1 : theme.cloudSpeed;
    for (i = 0; i < nClouds; i++) {
      Scene.clouds.push({
        spr: cloudPool[(rnd() * cloudPool.length) | 0],
        x: rnd() * (TS.W + 600) - 300,
        y: cloudBands[i] + rnd() * 40 - 20,
        vx: (5 + rnd() * 9) * cloudV,
        /* High enough to read as a cloud; any lower and it looks like fog.
           The source sprites are 576px wide, so keep the scale modest or a
           single cloud spans most of the screen. */
        alpha: (0.8 + rnd() * 0.14) * cloudA,
        scale: 0.5 + rnd() * 0.28
      });
    }

    /* --- trees ----------------------------------------------------------- */
    Scene.trees = [];
    /* The last two stand on the lower field, canopies overlapping the cliff for
       depth. Any lower and the card panel hides them entirely. */
    /* The last three are NEAR-BANK spots below any water band. They sit at the end
       so the non-water themes keep their original arrangement, while a water theme
       — which loses every upper-field spot to the lake — still gets trees on the
       bank instead of a bare horizon. */
    var treeSpots = take([
      [742, 470], [88, 392], [560, 344], [318, 300],
      [706, 1168], [128, 1156],
      [432, 618], [648, 596], [186, 608]
    ], theme.trees == null ? 6 : theme.trees);
    for (i = 0; i < treeSpots.length; i++) {
      Scene.trees.push({
        spr: TS.SPR.decor.tree[(rnd() * 4) | 0],
        x: treeSpots[i][0],
        y: treeSpots[i][1],
        phase: rnd() * 8,
        fps: 5.5 + rnd() * 2.5,
        flip: rnd() < 0.5
      });
    }

    /* --- bushes ---------------------------------------------------------- */
    Scene.bushes = [];
    /* Lower-field bushes come FIRST so a thinned-out theme keeps the foreground
       depth layer and drops the upper-field filler instead. take() walks the list
       in order, so ordering is what decides what survives a low count. */
    var bushSpots = take([
      /* lower field, overlapping the cliff face for depth */
      [96, 1120], [300, 1146], [520, 1112], [726, 1140], [430, 1240], [640, 1216],
      /* upper field */
      [190, 520], [470, 430], [640, 560], [40, 500], [800, 590], [370, 610],
      /* near-bank filler, legal even with a lake present */
      [268, 596], [516, 622], [88, 578]
    ], theme.bushes == null ? 12 : theme.bushes);
    for (i = 0; i < bushSpots.length; i++) {
      Scene.bushes.push({
        spr: TS.SPR.decor.bush[(rnd() * 4) | 0],
        x: bushSpots[i][0],
        y: bushSpots[i][1],
        phase: rnd() * 8,
        fps: 6 + rnd() * 3,
        flip: rnd() < 0.5
      });
    }

    /* --- sheep ----------------------------------------------------------- */
    /* Idle life in the upper field. They graze, look up, and wander a little. */
    Scene.sheep = [];
    var sheepSpots = take([[236, 462], [560, 500], [406, 592], [148, 604]],
      theme.sheep == null ? 2 : theme.sheep);
    for (i = 0; i < sheepSpots.length; i++) {
      Scene.sheep.push({
        kind: 'sheep',
        x: sheepSpots[i][0],
        y: sheepSpots[i][1],
        homeX: sheepSpots[i][0],
        flip: rnd() < 0.5,
        state: 'graze',
        timer: 1 + rnd() * 4,
        phase: rnd() * 12
      });
    }

    /* --- water surface --------------------------------------------------- */
    /* The lake itself is baked into the terrain (a flat tile — it does not
       animate). Everything that MOVES on it lives here: the foam ring along both
       shores, animated water rocks, and a duck.

       Foam spacing is measured, not the frame width. Foam.png is 8 frames of
       192px but the ring only occupies x55-136 — about 82px of ink centred in the
       cell. Stepping by 192 would leave a gap between every ring; stepping by ~66
       overlaps them into a continuous shoreline. */
    Scene.water = [];
    if (water) {
      var FOAM_INK = 82, step = 66;
      for (var fx = -20; fx < TS.W + 40; fx += step) {
        /* Both edges: a band with a soft top and a hard bottom reads as a
           painting mistake rather than a lake. */
        Scene.water.push({ kind: 'foam', x: fx, y: water.y0, phase: rnd() * 8,
          fps: 7 + rnd() * 2, flip: rnd() < 0.5 });
        Scene.water.push({ kind: 'foam', x: fx + step / 2, y: water.y1,
          phase: rnd() * 8, fps: 7 + rnd() * 2, flip: rnd() < 0.5 });
      }
      var rocks = TS.SPR.decor.waterRock || [];
      var nRocks = Math.min(theme.waterRocks || 0, 8);
      for (i = 0; i < nRocks && rocks.length; i++) {
        Scene.water.push({
          kind: 'rock',
          spr: rocks[(rnd() * rocks.length) | 0],
          x: 70 + rnd() * (TS.W - 140),
          y: water.y0 + 34 + rnd() * Math.max(10, (water.y1 - water.y0) - 68),
          phase: rnd() * 16, fps: 8 + rnd() * 3, flip: rnd() < 0.5
        });
      }
      if (theme.duck) {
        Scene.water.push({
          kind: 'duck',
          x: 120 + rnd() * (TS.W - 240),
          y: (water.y0 + water.y1) / 2 + rnd() * 20 - 10,
          phase: rnd() * 3, fps: 5, vx: 11 + rnd() * 9,
          bob: rnd() * 6.28, flip: false
        });
      }
      /* Foam last so it covers the rocks' outer edges where they meet the shore. */
      Scene.water.sort(function (a, b) {
        return (a.kind === 'foam' ? 1 : 0) - (b.kind === 'foam' ? 1 : 0);
      });
    }

    buildWeather(theme, rnd);
    buildLayer();
  };

  /* --- weather ----------------------------------------------------------- */

  /* All procedural: the pack ships no rain, snow or ember art, and drawing them
     as primitives costs nothing and scales to any density. Seeded from the level
     seed so a replay of the same battle starts from the same sky. */
  function buildWeather(theme, rnd) {
    Scene.weather = [];
    Scene.flash = 0;
    /* First strike waits a real gap. Starting at 0 fired the bolt on the very
       first update tick, so every storm battle opened with a full-screen flash
       at t=0 — deterministically, on every replay. */
    Scene.flashT = 2.6 + rnd() * 5.5;
    Scene.flashEcho = 0;
    var w = theme.weather;
    if (!w) return;
    var n = w.count || 0;
    for (var i = 0; i < n; i++) {
      var p = { x: rnd() * (TS.W + 240) - 120, y: rnd() * TS.H, t: rnd() * 6.28 };
      if (w.kind === 'rain') {
        p.len = 16 + rnd() * 22;
        p.vy = (w.speed || 900) * (0.82 + rnd() * 0.36);
        p.a = 0.20 + rnd() * 0.30;
      } else if (w.kind === 'leaves') {
        p.vy = 46 + rnd() * 60;
        p.size = 4 + rnd() * 4;
        p.sway = 20 + rnd() * 34;
        p.spin = (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 2.6);
        p.hue = ['#c8a03a', '#b8762c', '#9c5f28', '#d8b855'][(rnd() * 4) | 0];
        p.a = 0.65 + rnd() * 0.3;
      } else if (w.kind === 'embers') {
        p.vy = -(26 + rnd() * 46);        // rises: this is heat, not weather
        p.size = 1.5 + rnd() * 2.4;
        p.sway = 12 + rnd() * 22;
        p.a = 0.45 + rnd() * 0.45;
        p.hue = rnd() < 0.35 ? '#ffd257' : '#ff8a3c';
      } else if (w.kind === 'motes') {
        p.vy = -(4 + rnd() * 12);         // dust hanging in low sun
        p.size = 1.2 + rnd() * 2.0;
        p.sway = 16 + rnd() * 26;
        p.a = 0.25 + rnd() * 0.35;
        p.hue = '#ffe6a8';
      } else if (w.kind === 'mist') {
        /* Wide, slow, low-contrast bands. Confined to the upper field so mist
           never sits over the lane and hurts combat readability. */
        p.y = 300 + rnd() * 330;
        p.w = 260 + rnd() * 420;
        p.h = 26 + rnd() * 40;
        p.vx = 8 + rnd() * 16;
        p.a = 0.07 + rnd() * 0.10;
      }
      Scene.weather.push(p);
    }
  }

  Scene.update = function (dt) {
    var i, c;

    for (i = 0; i < Scene.clouds.length; i++) {
      c = Scene.clouds[i];
      c.x += c.vx * dt;
      var w = c.spr.fw * c.scale;
      if (c.x - w / 2 > TS.W + 40) c.x = -w / 2 - 40;
    }

    for (i = 0; i < Scene.trees.length; i++) {
      Scene.trees[i].phase += Scene.trees[i].fps * dt;
    }
    for (i = 0; i < Scene.bushes.length; i++) {
      Scene.bushes[i].phase += Scene.bushes[i].fps * dt;
    }

    for (i = 0; i < Scene.sheep.length; i++) {
      var s = Scene.sheep[i];
      s.phase += 7 * dt;
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.state === 'graze') {
          s.state = 'idle';
          s.timer = 1.5 + srnd() * 3;
          if (srnd() < 0.45) s.flip = !s.flip;
        } else {
          s.state = 'graze';
          s.timer = 3 + srnd() * 5;
        }
        s.phase = 0;
      }
      /* Drift a few pixels while idling, then settle back home. */
      if (s.state === 'idle') {
        s.x += (s.flip ? -5 : 5) * dt;
        s.x = TS.clamp(s.x, s.homeX - 34, s.homeX + 34);
      }
    }

    for (i = 0; i < Scene.water.length; i++) {
      var wo = Scene.water[i];
      wo.phase += (wo.fps || 8) * dt;
      if (wo.kind === 'duck') {
        wo.x += wo.vx * dt;
        wo.bob += 2.4 * dt;
        /* Turn around at the banks rather than wrapping — a duck popping from one
           edge to the other on a small pond reads as a glitch. */
        if (wo.x > TS.W - 70) { wo.vx = -Math.abs(wo.vx); wo.flip = true; }
        if (wo.x < 70) { wo.vx = Math.abs(wo.vx); wo.flip = false; }
      }
    }

    updateWeather(dt);
  };

  function updateWeather(dt) {
    var th = Scene.theme;
    var w = th && th.weather;
    if (!w) return;
    var wind = w.wind || 0;

    for (var i = 0; i < Scene.weather.length; i++) {
      var p = Scene.weather[i];
      p.t += dt;
      if (w.kind === 'mist') {
        p.x += p.vx * dt;
        if (p.x - p.w / 2 > TS.W + 40) p.x = -p.w / 2 - 40;
        continue;
      }
      p.y += p.vy * dt;
      p.x += wind * dt;
      if (p.spin) p.rot = (p.rot || 0) + p.spin * dt;
      /* Recycle off the bottom (or the top, for anything rising). */
      if (p.vy > 0 && p.y > TS.H + 30) { p.y = -30; p.x = srnd() * (TS.W + 240) - 120; }
      if (p.vy < 0 && p.y < -30) { p.y = TS.H + 30; p.x = srnd() * (TS.W + 240) - 120; }
      if (p.x > TS.W + 130) p.x -= TS.W + 260;
      if (p.x < -130) p.x += TS.W + 260;
    }

    /* Lightning. Long dark gaps then a double flash, because a single evenly
       timed blink reads as a rendering fault rather than a storm. The echo is
       the second strike: it re-lights the sky to 0.8 while the first pulse is
       mid-decay, which is the flicker real lightning has. */
    if (w.lightning) {
      Scene.flashT -= dt;
      if (Scene.flashT <= 0) {
        Scene.flashT = 3.4 + srnd() * 5.5;
        Scene.flash = 1;
        Scene.flashEcho = 0.16 + srnd() * 0.1;
      }
      if (Scene.flashEcho > 0) {
        Scene.flashEcho -= dt;
        if (Scene.flashEcho <= 0) Scene.flash = Math.max(Scene.flash, 0.8);
      }
      if (Scene.flash > 0) Scene.flash = Math.max(0, Scene.flash - dt * 3.4);
    }
  }

  /* One depth-sorted draw list, holding references to the arrays above so their
     animation updates still apply. Ground scenery has to be ordered by base Y
     exactly like the units are: drawing every tree and then every bush put all
     bushes in front of all trees regardless of which stood nearer, so a bush
     behind a tree floated on top of its canopy.
     Positions are fixed after build (sheep drift on X only), so sorting once
     here is both correct and free. */
  function buildLayer() {
    Scene.layer = Scene.sheep
      .concat(Scene.trees, Scene.bushes)
      .sort(function (a, b) { return a.y - b.y; });
  }

  /* Everything behind the units: water surface, clouds, then depth-sorted
     scenery. Water goes first — it is the ground, so a tree on the far bank must
     still draw over it. */
  Scene.drawBack = function (ctx) {
    var i, o;

    /* Everything on the water is CLIPPED TO THE WATER. Both foam sheets are rings
       (~82px of ink centred in a 192px cell), not shoreline strips, so a ring drawn
       across the shore spills half of itself onto the grass — which reads as splash
       sitting beside the ground tile rather than washing up under it. Clipping to
       the band keeps the land edge crisp and shows only the half of each ring that
       is genuinely in the water, so the shore overlaps the surf as it should. */
    var wb = Scene.theme && Scene.theme.water;
    if (wb && Scene.water.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, wb.y0, TS.W, wb.y1 - wb.y0);
      ctx.clip();
      for (i = 0; i < Scene.water.length; i++) {
        o = Scene.water[i];
        if (o.kind === 'foam') {
          /* Not opaque: at full alpha the overlapping rings merge into a solid pale
             band and the lake reads as more froth than water. Letting the teal show
             through keeps it as surf on a shoreline. */
          TS.drawFrame(ctx, TS.SPR.decor.foam, o.phase | 0, o.x, o.y,
            { flip: o.flip, alpha: 0.72 });
        } else if (o.kind === 'rock') {
          TS.drawFrame(ctx, o.spr, o.phase | 0, o.x, o.y, { flip: o.flip });
        } else if (o.kind === 'duck') {
          TS.drawFrame(ctx, TS.SPR.decor.duck, o.phase | 0,
            o.x, o.y + Math.sin(o.bob) * 2, { flip: o.flip, scale: 1.4 });
        }
      }
      ctx.restore();
    }

    for (i = 0; i < Scene.clouds.length; i++) {
      o = Scene.clouds[i];
      TS.drawFrame(ctx, o.spr, 0, o.x, o.y, { alpha: o.alpha, scale: o.scale });
    }

    for (i = 0; i < Scene.layer.length; i++) {
      o = Scene.layer[i];
      var spr = o.kind === 'sheep'
        ? (o.state === 'graze' ? TS.SPR.decor.sheepGrass : TS.SPR.decor.sheepIdle)
        : o.spr;
      TS.drawFrame(ctx, spr, o.phase | 0, o.x, o.y, { flip: o.flip });
    }
  };

  /* In FRONT of the units, and still inside the world transform so the HUD is
     never tinted or rained on. Order matters: the time-of-day wash unifies the
     units with the ground, so it goes under the precipitation rather than over
     it — tinted rain looks like it is behind the weather it belongs to. */
  Scene.drawFront = function (ctx) {
    var th = Scene.theme;
    if (!th) return;
    var i, p;

    if (th.tint) {
      var tn = th.tint;
      ctx.save();
      ctx.globalAlpha = tn.alpha;
      /* Blend mode matters more than colour here. A warm hue laid over green with
         plain source-over just DESATURATES it — "Last Light" came out muddy olive
         rather than golden. 'overlay' keeps the art's contrast and pushes the hue,
         which is what actually reads as low sun. Darkening themes are the opposite:
         flat source-over is exactly right for night and storm. */
      if (tn.blend) ctx.globalCompositeOperation = tn.blend;
      if (tn.gradient) {
        /* Light comes from the horizon, so the wash is strongest at the top of the
           field and thins toward the camera. */
        var gr = ctx.createLinearGradient(0, 0, 0, TS.H);
        gr.addColorStop(0, tn.color);
        gr.addColorStop(0.55, tn.color);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr;
      } else {
        ctx.fillStyle = tn.color;
      }
      ctx.fillRect(0, 0, TS.W, TS.H);
      ctx.restore();
    }

    var w = th.weather;
    if (w && Scene.weather.length) {
      ctx.save();
      if (w.kind === 'rain') {
        /* Slanted streaks, drawn along the actual fall vector so the slant always
           agrees with the wind rather than being a fixed cosmetic angle. */
        var vx = w.wind || 0, vy = w.speed || 900;
        var m = Math.sqrt(vx * vx + vy * vy) || 1;
        ctx.strokeStyle = '#dff0ff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (i = 0; i < Scene.weather.length; i++) {
          p = Scene.weather[i];
          ctx.globalAlpha = p.a;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (vx / m) * p.len, p.y - (vy / m) * p.len);
          /* Stroked per streak so each keeps its own alpha. */
          ctx.stroke();
          ctx.beginPath();
        }
      } else if (w.kind === 'mist') {
        for (i = 0; i < Scene.weather.length; i++) {
          p = Scene.weather[i];
          ctx.globalAlpha = p.a;
          ctx.fillStyle = '#eaf6ff';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, 6.2832);
          ctx.fill();
        }
      } else {
        /* Leaves, embers and motes: small quads. Leaves tumble, so they get a
           rotation; the others are round enough that spinning them is invisible. */
        for (i = 0; i < Scene.weather.length; i++) {
          p = Scene.weather[i];
          ctx.globalAlpha = p.a;
          ctx.fillStyle = p.hue;
          var sx = p.x + Math.sin(p.t * 1.7) * (p.sway || 0);
          if (p.spin) {
            ctx.save();
            ctx.translate(sx, p.y);
            ctx.rotate(p.rot || 0);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.arc(sx, p.y, p.size, 0, 6.2832);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    if (Scene.flash > 0) {
      ctx.save();
      /* Squared so the flash spikes and falls away instead of fading linearly. */
      ctx.globalAlpha = Scene.flash * Scene.flash * 0.5;
      ctx.fillStyle = '#dce8ff';
      ctx.fillRect(0, 0, TS.W, TS.H);
      ctx.restore();
    }
  };

})(window.TS);
