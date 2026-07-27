/* terrain.js — the battlefield, pre-rendered once to an offscreen canvas.
 *
 * The full pack's Tilemap_Flat.png carries a grass AND a sand 4x4 autotile side
 * by side, so the battle lane is a genuine sand band cut through a grass field —
 * the same layout as reference.jpg. (The free pack had no sand tile at all, which
 * is why earlier versions faked the lane as a raised stone plateau.)
 *
 * Tilemap_Flat.png is 640x256, 10 cols x 4 rows of 64px:
 *   c0-c3 x r0-r3   grass autotile  (c0 left edge, c1/c2 interior, c3 1-wide)
 *   c4              loose grass tufts
 *   c5-c8 x r0-r3   sand autotile, same structure
 *   c9              loose sand specks
 * Rows are: r0 top fringe, r1/r2 interior, r3 bottom fringe.
 *
 * Columns are [left edge, INTERIOR, right edge, 1-wide] — so each material has
 * exactly ONE interior column: c1 for grass, c6 for sand. c2/c7 look like plain
 * fill but carry a near-black right-hand outline (measured #0b0e18), and tiling
 * one paints a dark vertical seam every 64px across the whole field.
 */
(function (TS) {
  'use strict';

  var T = TS.TILE; // 64

  /* Gameplay geometry is unchanged from the plateau version — only the art that
     fills these bands differs. */
  var LAY = {
    hudBottom: 192,
    bannerY: 214,

    laneTop: 640,      // sand top fringe row
    surfTop: 704,      // solid sand begins
    surfBot: 950,      // last row a unit may stand on
    laneBot: 1024,     // sand bottom fringe ends

    fieldBot: 1200,
    panelTop: 1200,

    /* Feet Y for the three depth rows. Units overlap between rows, which gives
       the reference's dense clustered brawl. */
    lanes: [765, 835, 905],

    /* Bases sit on the sand. Both buildings are ~113px of visible art inside a
       128px frame, so each sits fully on screen rather than cropped, and the lane
       between them is wide. */
    castleBaseY: 925,
    playerCastleX: 66,    // tower art spans 9..122
    enemyCastleX: 768,    // hut art spans 711..823

    playerFrontX: 136,
    enemyFrontX: 698,
    /* Spawns sit behind their own base art so units file out from behind it. */
    playerSpawnX: 104,
    enemySpawnX: 742,

    laneLeft: 60,
    laneRight: 800
  };
  TS.LAY = LAY;

  /* Measured averages of the interior cells — a file:// canvas is tainted, so
     pixels cannot be sampled at runtime. */
  var GRASS = '#98b358';
  var SAND = '#f0e07f';

  /* The single interior column of each material. Variation comes from random
     mirroring, not from a second column — see the header note. */
  var GRASS_COL = 1, GRASS_ROW = 1;
  var SAND_COL = 6;

  var Terrain = { canvas: null };
  TS.Terrain = Terrain;

  /* Blit one tileset cell, optionally mirrored. Bake-time only, so the transform
     cost is irrelevant. */
  function blitCell(g, img, col, row, dx, dy, flipX, flipY) {
    if (!flipX && !flipY) {
      g.drawImage(img, col * T, row * T, T, T, dx, dy, T, T);
      return;
    }
    g.save();
    g.translate(dx + (flipX ? T : 0), dy + (flipY ? T : 0));
    g.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    g.drawImage(img, col * T, row * T, T, T, 0, 0, T, T);
    g.restore();
  }

  Terrain.build = function (seed) {
    var W = TS.W, H = TS.H;
    var rnd = TS.rng(seed || 1337);
    var ground = TS.img('ground');

    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;

    /* --- grass field over the whole screen ------------------------------- */
    g.fillStyle = GRASS;
    g.fillRect(0, 0, W, H);
    for (var y = 0; y < H; y += T) {
      for (var x = 0; x < W; x += T) {
        /* Mirroring breaks up the repeat without introducing a seam: the interior
           cell carries only organic texture, no directional edge features. */
        blitCell(g, ground, GRASS_COL, GRASS_ROW, x, y, rnd() < 0.5, rnd() < 0.5);
      }
    }

    /* --- sand lane ------------------------------------------------------- */
    /* Solid sand behind the interior rows only. Extending it into the fringe
       rows would square off the very edges the fringe exists to soften. */
    g.fillStyle = SAND;
    g.fillRect(0, LAY.surfTop, W, 960 - LAY.surfTop);

    var px;
    for (px = 0; px < W; px += T) {
      /* Top fringe: sand body low in the cell, tufts reaching up into grass. */
      blitCell(g, ground, SAND_COL, 0, px, LAY.laneTop, rnd() < 0.5, false);
    }
    for (var row = LAY.surfTop; row < 960; row += T) {
      for (px = 0; px < W; px += T) {
        blitCell(g, ground, SAND_COL, 1, px, row, rnd() < 0.5, rnd() < 0.5);
      }
    }
    for (px = 0; px < W; px += T) {
      /* Bottom fringe, mirrored vertically nowhere — it is directional. */
      blitCell(g, ground, SAND_COL, 3, px, 960, rnd() < 0.5, false);
    }

    bakeStaticDecor(g, rnd);

    /* Very soft darkening at the top so HUD plates always have contrast. */
    var top = g.createLinearGradient(0, 0, 0, 240);
    top.addColorStop(0, 'rgba(20,40,30,0.26)');
    top.addColorStop(1, 'rgba(20,40,30,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, 240);

    Terrain.canvas = cv;
  };

  /* Anything that never animates belongs in the baked layer. */
  function bakeStaticDecor(g, rnd) {
    var D = TS.SPR.decor;
    var props = D.props || [];
    var i;

    var rockSpots = [[96, 470], [268, 392], [612, 452], [742, 386], [430, 336]];
    for (i = 0; i < rockSpots.length; i++) {
      TS.drawFrame(g, D.rock[(rnd() * 4) | 0], 0, rockSpots[i][0], rockSpots[i][1],
        { flip: rnd() < 0.5 });
    }
    TS.drawFrame(g, D.stump[(rnd() * 4) | 0], 0, 706, 560, {});
    TS.drawFrame(g, D.stump[(rnd() * 4) | 0], 0, 120, 606, { flip: true });

    var lowerRocks = [[70, 1160], [206, 1122], [636, 1150], [770, 1118], [396, 1170]];
    for (i = 0; i < lowerRocks.length; i++) {
      TS.drawFrame(g, D.rock[(rnd() * 4) | 0], 0, lowerRocks[i][0], lowerRocks[i][1],
        { flip: rnd() < 0.5 });
    }

    /* Scatter props (mushrooms, tufts, pebbles, a bone) across the grass, and a
       sparse few on the sand — the reference dresses its lane lightly too. */
    if (!props.length) return;
    var grassSpots = [
      [160, 330], [340, 380], [500, 300], [660, 340], [58, 420], [770, 480],
      [230, 520], [430, 560], [560, 600], [110, 540], [690, 600], [300, 630],
      [140, 1080], [340, 1105], [520, 1085], [700, 1075], [250, 1180],
      [600, 1195], [80, 1230], [450, 1250], [760, 1215]
    ];
    for (i = 0; i < grassSpots.length; i++) {
      TS.drawFrame(g, props[(rnd() * props.length) | 0], 0,
        grassSpots[i][0], grassSpots[i][1], { flip: rnd() < 0.5 });
    }
    /* On-sand props are kept to pebbles and the bone so nothing looks like it is
       growing out of the battle lane. */
    var sandProps = [props[3], props[4], props[5], props[13]].filter(Boolean);
    var sandSpots = [[300, 726], [520, 736], [420, 946], [640, 940], [210, 942]];
    for (i = 0; i < sandSpots.length; i++) {
      TS.drawFrame(g, sandProps[(rnd() * sandProps.length) | 0], 0,
        sandSpots[i][0], sandSpots[i][1], { flip: rnd() < 0.5, alpha: 0.9 });
    }
  }

  Terrain.draw = function (ctx) {
    ctx.drawImage(Terrain.canvas, 0, 0);
  };

})(window.TS);
