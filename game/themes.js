/* themes.js — one visual identity per battle.
 *
 * Every battle used to render the same field, because terrain.js and scene.js
 * hard-coded a single palette and prop mix and only the random SEED changed per
 * level. A different scatter of the same trees on the same green does not read as
 * a different place. A theme is the knob that actually varies: ground palette,
 * time-of-day wash, weather, whether there is water, and how much life there is.
 *
 * WHAT A THEME MAY NOT TOUCH: the sand lane and everything in TS.LAY. The lane is
 * gameplay — its geometry is tuned around contact/range/SPACING, and units must
 * stand on walkable sand in all three depth rows. Themes only dress the field
 * ABOVE and BELOW the lane, plus a wash over the top. Water is therefore always a
 * band in the upper field, never anything a unit could be asked to walk through.
 *
 * MEASURED VALUES, not guessed (a tainted file:// canvas cannot sample at run
 * time, so these come from an offline pass over the sheets):
 *
 *   Tilemap_colorN.png interior cell is (col 1, row 1), average colour:
 *     color1 #98b653   color2 #84ae57   color3 #61a963
 *     color4 #82985e   color5 #57998b
 *   Those cells are safe to tile: their leftmost/middle/rightmost pixel columns
 *   all agree to within a couple of values, unlike Tilemap_Flat's c2r1 whose right
 *   edge is #161c2e — a near-black outline that paints a seam every 64px.
 *
 *   Water.png and "Water Background color.png" are both a flat #47aba9 64px tile.
 *   color5 (#57998b) is the teal-green variant, which is why the marsh and camp
 *   themes pair it with water rather than using a yellow-green.
 */
(function (TS) {
  'use strict';

  /* Ground palettes. `img` is the asset key, `col`/`row` the measured interior
     cell, `fill` the backing colour painted under the tiles so a half-tile at the
     screen edge never shows through. */
  var GROUND = {
    flat:  { img: 'ground', col: 1, row: 1, fill: '#98b358' },
    lush:  { img: 'tint3',  col: 1, row: 1, fill: '#61a963' },
    mid:   { img: 'tint2',  col: 1, row: 1, fill: '#84ae57' },
    dry:   { img: 'tint4',  col: 1, row: 1, fill: '#82985e' },
    teal:  { img: 'tint5',  col: 1, row: 1, fill: '#57998b' },
    bright:{ img: 'tint1',  col: 1, row: 1, fill: '#98b653' }
  };
  TS.GROUND = GROUND;

  var WATER_FILL = '#47aba9';   // measured
  TS.WATER_FILL = WATER_FILL;

  /* How far the foam ring reaches past a shoreline. Foam.png's ink is x55-136 of
     a 192px frame — about 82px across — and it is drawn centred ON the shore, so
     it extends ~41px either side. Both terrain.js and scene.js must exclude decor
     from that margin as well as from the water itself: testing only the band put a
     sheep at y462 apparently standing in the froth below a shore at y452.
     It also sets the minimum sensible band height. Two shores each eat 41px
     inward, so a 152px band left only 70px of open water and read as more foam
     than river — the bands below are sized with that in mind. */
  var FOAM_REACH = 42;
  TS.FOAM_REACH = FOAM_REACH;
  TS.dryOf = function (theme) {
    var w = theme && theme.water;
    if (!w) return function () { return true; };
    return function (y) {
      return y < w.y0 - FOAM_REACH || y > w.y1 + FOAM_REACH;
    };
  };

  /* A water band lives entirely in the upper field. Trees, bushes, sheep and
     baked props whose base falls inside it are suppressed, so nothing appears to
     grow out of a lake. Keep y1 well above TS.LAY.laneTop (640). */
  var THEMES = {
    meadow: {
      label: 'Green Meadow',
      ground: 'flat',
      clouds: 3, cloudAlpha: 1, cloudSpeed: 1,
      trees: 6, bushes: 12, sheep: 2, stumps: 2
    },

    riverside: {
      label: 'Riverside',
      ground: 'lush',
      water: { y0: 286, y1: 512 },
      clouds: 3, cloudAlpha: 1, cloudSpeed: 1,
      trees: 5, bushes: 10, sheep: 1, stumps: 1,
      duck: true, waterRocks: 4
    },

    highland: {
      label: 'Windy Highland',
      ground: 'mid',
      /* Wind: clouds race and leaves blow across. No rain — this is the "weather
         is doing something" step before the storms later on. */
      clouds: 5, cloudAlpha: 0.95, cloudSpeed: 3.2,
      weather: { kind: 'leaves', count: 34, wind: 116 },
      trees: 7, bushes: 9, sheep: 2, stumps: 2
    },

    downpour: {
      label: 'Grey Downpour',
      ground: 'dry',
      tint: { color: '#22384a', alpha: 0.26 },
      clouds: 5, cloudAlpha: 0.6, cloudSpeed: 1.6,
      weather: { kind: 'rain', count: 190, wind: 74, speed: 900 },
      trees: 5, bushes: 8, sheep: 0, stumps: 3
    },

    marsh: {
      label: 'Still Marsh',
      ground: 'teal',
      water: { y0: 292, y1: 528 },
      tint: { color: '#20404a', alpha: 0.16 },
      clouds: 2, cloudAlpha: 0.5, cloudSpeed: 0.5,
      weather: { kind: 'mist', count: 7 },
      trees: 3, bushes: 7, sheep: 0, stumps: 4,
      duck: true, waterRocks: 6
    },

    dusk: {
      label: 'Last Light',
      ground: 'dry',
      /* Warm low sun, strongest at the horizon. 'overlay' rather than a flat wash —
         see Scene.drawFront for why a plain orange over green reads as mud. */
      tint: { color: '#ff9433', alpha: 0.5, blend: 'overlay', gradient: true },
      clouds: 4, cloudAlpha: 0.85, cloudSpeed: 0.8,
      weather: { kind: 'motes', count: 34 },
      trees: 6, bushes: 10, sheep: 1, stumps: 2
    },

    storm: {
      label: 'Thunderhead',
      ground: 'mid',
      tint: { color: '#141d33', alpha: 0.38 },
      clouds: 6, cloudAlpha: 0.45, cloudSpeed: 4.4,
      weather: { kind: 'rain', count: 300, wind: 150, speed: 1150, lightning: true },
      trees: 5, bushes: 8, sheep: 0, stumps: 3
    },

    camp: {
      label: 'Goblin Camp',
      ground: 'teal',
      /* Night, lit from the goblin side. Embers rise instead of anything falling,
         which is the one weather that moves UPWARD and so reads as heat. */
      tint: { color: '#101a34', alpha: 0.45 },
      clouds: 2, cloudAlpha: 0.3, cloudSpeed: 0.6,
      weather: { kind: 'embers', count: 40 },
      trees: 4, bushes: 6, sheep: 0, stumps: 5
    }
  };
  TS.THEMES = THEMES;

  /* Battle index -> theme. Ordered so the campaign darkens as it escalates:
     pastoral, water, wind, rain, marsh, dusk, storm, night. */
  var ORDER = ['meadow', 'riverside', 'highland', 'downpour',
    'marsh', 'dusk', 'storm', 'camp'];

  TS.themeFor = function (index) {
    var t = THEMES[ORDER[TS.clamp(index | 0, 0, ORDER.length - 1)]];
    return t || THEMES.meadow;
  };

  /* The title and battle-select backdrop. Deliberately the calm one. */
  TS.defaultTheme = function () { return THEMES.meadow; };

  TS.groundOf = function (theme) {
    return GROUND[(theme && theme.ground) || 'flat'] || GROUND.flat;
  };

})(window.TS);
