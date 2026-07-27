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

  var Scene = { clouds: [], trees: [], bushes: [], sheep: [], layer: [] };
  TS.Scene = Scene;

  Scene.build = function (seed) {
    var LAY = TS.LAY;
    var rnd = TS.rng((seed || 1337) ^ 0x5bf03635);
    var i;

    /* --- clouds ---------------------------------------------------------- */
    /* The pack's clouds ship with their own grey shadow underlay, meaning they
       are meant to float above the terrain rather than sit behind it. Kept out
       of the lane band so they never obscure combat. */
    Scene.clouds = [];
    /* Upper field only. A cloud drifting across the lower field washes out the
       strip between the cliff and the card panel. */
    var cloudBands = [340, 470, 578];
    for (i = 0; i < cloudBands.length; i++) {
      Scene.clouds.push({
        spr: TS.SPR.decor.cloud[(rnd() * 8) | 0],
        x: rnd() * (TS.W + 600) - 300,
        y: cloudBands[i] + rnd() * 40 - 20,
        vx: 5 + rnd() * 9,
        /* High enough to read as a cloud; any lower and it looks like fog.
           The source sprites are 576px wide, so keep the scale modest or a
           single cloud spans most of the screen. */
        alpha: 0.8 + rnd() * 0.14,
        scale: 0.5 + rnd() * 0.28
      });
    }

    /* --- trees ----------------------------------------------------------- */
    Scene.trees = [];
    /* The last two stand on the lower field, canopies overlapping the cliff for
       depth. Any lower and the card panel hides them entirely. */
    var treeSpots = [
      [742, 470], [88, 392], [560, 344], [318, 300],
      [706, 1168], [128, 1156]
    ];
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
    var bushSpots = [
      /* upper field */
      [190, 520], [470, 430], [640, 560], [40, 500], [800, 590], [370, 610],
      /* lower field, overlapping the cliff face for depth */
      [96, 1120], [300, 1146], [520, 1112], [726, 1140], [430, 1240], [640, 1216]
    ];
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
    var sheepSpots = [[236, 462], [560, 500]];
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

    buildLayer();
  };

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
          s.timer = 1.5 + Math.random() * 3;
          if (Math.random() < 0.45) s.flip = !s.flip;
        } else {
          s.state = 'graze';
          s.timer = 3 + Math.random() * 5;
        }
        s.phase = 0;
      }
      /* Drift a few pixels while idling, then settle back home. */
      if (s.state === 'idle') {
        s.x += (s.flip ? -5 : 5) * dt;
        s.x = TS.clamp(s.x, s.homeX - 34, s.homeX + 34);
      }
    }
  };

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

  /* Everything behind the units: clouds, then depth-sorted scenery. */
  Scene.drawBack = function (ctx) {
    var i, o;

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

})(window.TS);
