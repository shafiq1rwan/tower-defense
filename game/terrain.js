/* terrain.js — the battlefield, pre-rendered once to an offscreen canvas.
 *
 * The pack has no dirt or sand tile, so the reference's tan lane becomes a
 * RAISED PLATEAU: olive grass (Tilemap_color1) with the blue-grey stone cliff
 * face beneath it, sitting on a vivid green field (Tilemap_color3). Same strong
 * horizontal band as the reference, entirely authentic art, and the cliff earns
 * a real drop shadow.
 *
 * Tileset layout (576x384, 9x6 cells of 64px, column 4 is an empty gutter).
 * Each half is a 3x3 AUTOTILE plus strip variants — NOT a 4x4 grid:
 *   c0-c2 x r0-r2   flat grass 3x3   (c0=left edge, c1=centre, c2=right edge)
 *   c3               1-tile-wide column variants
 *   r3               1-tile-tall row variants
 *   c0/c3 x r4-r5    diagonal grass slope corners
 *   c5-c7 x r0-r2   elevated grass 3x3; its r2 bottom edge has the stone lip
 *   c5-c8 x r4      cliff body
 *   c5-c8 x r5      cliff base (rounded bottoms)
 *
 * Only c1r1 and c6r1 are PURE interior cells with no edge decoration. Tiling
 * anything else produces a visible lattice of seams across the field.
 */
(function (TS) {
  'use strict';

  var T = TS.TILE; // 64

  /* Every band the rest of the game positions against. The plateau is 7 tile
     rows tall, from plateauTop to cliffBot. */
  var LAY = {
    hudBottom: 192,
    bannerY: 214,

    plateauTop: 640,   // tufted crown row begins
    surfTop: 704,      // walkable grass begins
    surfBot: 950,      // walkable grass ends
    cliffTop: 960,
    cliffBot: 1088,

    fieldBot: 1200,
    panelTop: 1200,

    /* Feet Y for the three depth rows. Units overlap between rows, which is
       what gives the reference's dense clustered brawl. */
    lanes: [765, 835, 905],

    /* Castles sit near the front of the plateau, cropped by the screen edges so
       only ~180px of each 320px building shows — as in the reference. */
    castleBaseY: 925,
    playerCastleX: 20,   // centre X; the building runs off the left edge
    enemyCastleX: 812,

    /* Where a unit stops to hit the opposing castle, and where it spawns.
       The gap between the two fronts is ~496px, which is what two full queues
       (14 and 18 units at 46px spacing, three lanes) plus the front standoff
       need. Narrow it and the rear ranks pile up on the spawn point. */
    playerFrontX: 168,
    enemyFrontX: 664,
    /* Spawns sit just inside the castle walls (which end at x=180 and x=652), so
       a new unit is partly visible the instant you pay for it and then strides
       clear of the gate. Deeper inside and it would be hidden for a second or
       more, which reads as the tap having done nothing. */
    playerSpawnX: 160,
    enemySpawnX: 672,

    /* Hard clamp on how far a unit may travel. */
    laneLeft: 88,
    laneRight: 744
  };
  TS.LAY = LAY;

  /* Backing colours measured from the sheets — needed because a file:// canvas
     is tainted, so pixels cannot be sampled at runtime. */
  var FIELD_GREEN = '#60a463';
  var PLATEAU_OLIVE = '#91b055';

  /* Blit one tileset cell, optionally mirrored. Only used during the one-time
     bake, so the transform cost is irrelevant. */
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

  var Terrain = {
    canvas: null,
    /* Foreground strip drawn AFTER entities so bushes overlap the cliff. */
    fgCanvas: null
  };
  TS.Terrain = Terrain;

  /* Pure interior cells — the only ones safe to tile. */
  var FIELD_CX = 1, FIELD_CY = 1;   // c1 r1, flat grass
  var LANE_CX = 6;                  // c6, elevated grass / cliff column

  /* Source row for each of the plateau's 7 rendered rows:
     tufted crown, three interior, grass-with-stone-lip, cliff body, cliff base. */
  var PLATEAU_ROWS = [0, 1, 1, 1, 2, 4, 5];

  Terrain.build = function (seed) {
    var W = TS.W, H = TS.H;
    var rnd = TS.rng(seed || 1337);

    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;

    var field = TS.img('tilesField');
    var lane = TS.img('tilesLane');

    /* --- flat grass field over the whole screen ------------------------- */
    g.fillStyle = FIELD_GREEN;
    g.fillRect(0, 0, W, H);

    /* One pure interior cell, mirrored at random on each axis. Mirroring is
       what breaks up the repeat without introducing a seam — the cell carries
       no directional edge features, only organic texture. */
    for (var y = 0; y < H; y += T) {
      for (var x = 0; x < W; x += T) {
        blitCell(g, field, FIELD_CX, FIELD_CY, x, y, rnd() < 0.5, rnd() < 0.5);
      }
    }

    /* --- the raised plateau -------------------------------------------- */
    /* Solid olive behind the walkable rows so the tufted crown row's
       transparency never shows field green through the surface. */
    g.fillStyle = PLATEAU_OLIVE;
    g.fillRect(0, LAY.plateauTop + T, W, LAY.cliffTop - LAY.plateauTop - T);

    /* The plateau runs off both screen edges, so it needs no left/right edge
       tiles — only the interior column. Mirrored horizontally at random; never
       vertically, because these rows are directional (tufts up, lip down). */
    for (var row = 0; row < PLATEAU_ROWS.length; row++) {
      var srcRow = PLATEAU_ROWS[row];
      var dy = LAY.plateauTop + row * T;
      for (var px = 0; px < W; px += T) {
        blitCell(g, lane, LANE_CX, srcRow, px, dy, rnd() < 0.5, false);
      }
    }

    /* Drop shadow cast by the cliff onto the field below it. */
    var grd = g.createLinearGradient(0, LAY.cliffBot, 0, LAY.cliffBot + 76);
    grd.addColorStop(0, 'rgba(29,43,38,0.42)');
    grd.addColorStop(1, 'rgba(29,43,38,0)');
    g.fillStyle = grd;
    g.fillRect(0, LAY.cliffBot, W, 76);

    /* --- static scenery baked into the background ----------------------- */
    bakeStaticDecor(g, rnd);

    /* Very soft darkening at the top so HUD plates always have contrast. */
    var top = g.createLinearGradient(0, 0, 0, 240);
    top.addColorStop(0, 'rgba(20,40,30,0.28)');
    top.addColorStop(1, 'rgba(20,40,30,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, 240);

    Terrain.canvas = cv;
    buildForeground(seed || 1337);
  };

  /* Rocks and stumps never animate, so they belong in the baked layer. */
  function bakeStaticDecor(g, rnd) {
    var D = TS.SPR.decor;
    var i, n;

    /* Upper field: a few rocks and one stump, kept clear of the HUD bands. */
    var upperSpots = [
      [96, 470], [268, 392], [612, 452], [742, 386], [430, 336]
    ];
    for (i = 0; i < upperSpots.length; i++) {
      var r = D.rock[(rnd() * 4) | 0];
      TS.drawFrame(g, r, 0, upperSpots[i][0], upperSpots[i][1], { flip: rnd() < 0.5 });
    }
    TS.drawFrame(g, D.stump[(rnd() * 4) | 0], 0, 706, 560, {});
    TS.drawFrame(g, D.stump[(rnd() * 4) | 0], 0, 120, 606, { flip: true });

    /* Lower field: rocks scattered below the cliff shadow. */
    var lowerSpots = [[70, 1160], [206, 1122], [636, 1150], [770, 1118], [396, 1170]];
    for (i = 0; i < lowerSpots.length; i++) {
      TS.drawFrame(g, D.rock[(rnd() * 4) | 0], 0, lowerSpots[i][0], lowerSpots[i][1],
        { flip: rnd() < 0.5 });
    }
  }

  /* Foreground: nothing baked yet, but the canvas exists so scene.js can
     composite animated bushes in front of the cliff. */
  function buildForeground() {
    Terrain.fgCanvas = null;
  }

  Terrain.draw = function (ctx) {
    ctx.drawImage(Terrain.canvas, 0, 0);
  };

})(window.TS);
