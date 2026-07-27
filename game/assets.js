/* assets.js — manifest, loader and sprite registry.
 *
 * Frame counts here were verified by scanning the sheets, not by dividing
 * image width by a guessed frame size. Several do not match the obvious guess
 * (Monk's Heal is 11 frames; the Clouds files are single sprites, not grids).
 * Do not "correct" them without re-checking the art.
 *
 * Every path goes through encodeURI() because the pack is full of spaces
 * ("Pawn_Idle Knife.png", "UI Elements/UI Elements/", "Human Avatars/").
 */
(function (TS) {
  'use strict';

  var UNIT_DIR = 'Units/';
  var UI = 'UI Elements/UI Elements/';
  var TER = 'Terrain/';
  var FX = 'Particle FX/';

  /* Player is Blue, enemy is Red. The pack ships real palette variants, so no
     runtime recolouring is needed. */
  TS.TEAMS = ['Blue', 'Red'];

  /* Per-class sheets: [file, frameCount]. The Pawn has no attack animation, so
     it uses the Knife carry variants throughout and stabs with Interact Knife.
     Note the Monk's files lack the "Monk_" prefix the other classes use. */
  var UNIT_SHEETS = {
    Pawn: {
      idle: ['Pawn/Pawn_Idle Knife.png', 8],
      run: ['Pawn/Pawn_Run Knife.png', 6],
      attack: ['Pawn/Pawn_Interact Knife.png', 4]
    },
    Warrior: {
      idle: ['Warrior/Warrior_Idle.png', 8],
      run: ['Warrior/Warrior_Run.png', 6],
      attack: ['Warrior/Warrior_Attack1.png', 4],
      attack2: ['Warrior/Warrior_Attack2.png', 4],
      guard: ['Warrior/Warrior_Guard.png', 6]
    },
    Archer: {
      idle: ['Archer/Archer_Idle.png', 6],
      run: ['Archer/Archer_Run.png', 4],
      attack: ['Archer/Archer_Shoot.png', 8]
    },
    Monk: {
      idle: ['Monk/Idle.png', 6],
      run: ['Monk/Run.png', 4],
      attack: ['Monk/Heal.png', 11]
    },
    Lancer: {
      idle: ['Lancer/Lancer_Idle.png', 12],
      run: ['Lancer/Lancer_Run.png', 6],
      attack: ['Lancer/Lancer_Right_Attack.png', 3],
      guard: ['Lancer/Lancer_Right_Defence.png', 6]
    }
  };
  TS.UNIT_SHEETS = UNIT_SHEETS;
  TS.CLASSES = ['Pawn', 'Warrior', 'Archer', 'Monk', 'Lancer'];

  /* The Lancer is the only class on 320px frames, and its anchor differs. */
  var FRAME = { Lancer: 320 };
  var ANCHOR = { Lancer: [160, 202] };
  var DEFAULT_FRAME = 192;
  var DEFAULT_ANCHOR = [96, 135];

  TS.unitFrameSize = function (cls) { return FRAME[cls] || DEFAULT_FRAME; };
  TS.unitAnchor = function (cls) { return ANCHOR[cls] || DEFAULT_ANCHOR; };

  /* Avatar sheets are grouped in blocks of 5 by team colour, in this class
     order. Verified by eye: plumed helm, bowl helm, conical helm, tonsure,
     long hair. */
  var AVATAR_ORDER = ['Warrior', 'Pawn', 'Lancer', 'Monk', 'Archer'];
  var TEAM_AVATAR_BLOCK = { Blue: 0, Red: 5 };
  TS.avatarKey = function (team, cls) {
    var i = TEAM_AVATAR_BLOCK[team] + AVATAR_ORDER.indexOf(cls) + 1;
    return 'avatar' + i;
  };

  /* ------------------------------------------------------------ manifest -- */

  function buildManifest() {
    var m = {};

    TS.TEAMS.forEach(function (team) {
      Object.keys(UNIT_SHEETS).forEach(function (cls) {
        var anims = UNIT_SHEETS[cls];
        Object.keys(anims).forEach(function (anim) {
          m['u:' + team + ':' + cls + ':' + anim] =
            UNIT_DIR + team + ' Units/' + anims[anim][0];
        });
      });
      m['castle:' + team] = 'Buildings/' + team + ' Buildings/Castle.png';
    });

    /* Arrow and Heal_Effect are byte-identical across teams — load once. */
    m['arrow'] = UNIT_DIR + 'Blue Units/Archer/Arrow.png';
    m['healFx'] = UNIT_DIR + 'Blue Units/Monk/Heal_Effect.png';

    /* Terrain. color3 is the vivid field, color1 the olive plateau. */
    m['tilesField'] = TER + 'Tileset/Tilemap_color3.png';
    m['tilesLane'] = TER + 'Tileset/Tilemap_color1.png';
    m['shadow'] = TER + 'Tileset/Shadow.png';

    /* Decor. */
    for (var i = 1; i <= 4; i++) {
      m['bush' + i] = TER + 'Decorations/Bushes/Bushe' + i + '.png';
      m['rock' + i] = TER + 'Decorations/Rocks/Rock' + i + '.png';
      m['tree' + i] = TER + 'Resources/Wood/Trees/Tree' + i + '.png';
      m['stump' + i] = TER + 'Resources/Wood/Trees/Stump ' + i + '.png';
    }
    for (var c = 1; c <= 8; c++) {
      m['cloud' + c] = TER + 'Decorations/Clouds/Clouds_0' + c + '.png';
    }
    m['sheepIdle'] = TER + 'Resources/Meat/Sheep/Sheep_Idle.png';
    m['sheepGrass'] = TER + 'Resources/Meat/Sheep/Sheep_Grass.png';

    /* Particle FX. */
    m['dust1'] = FX + 'Dust_01.png';
    m['dust2'] = FX + 'Dust_02.png';
    m['fire2'] = FX + 'Fire_02.png';
    m['explosion1'] = FX + 'Explosion_01.png';
    m['explosion2'] = FX + 'Explosion_02.png';

    /* UI kit. */
    m['btnBlue'] = UI + 'Buttons/BigBlueButton_Regular.png';
    m['btnBluePressed'] = UI + 'Buttons/BigBlueButton_Pressed.png';
    m['btnRed'] = UI + 'Buttons/BigRedButton_Regular.png';
    m['btnRedPressed'] = UI + 'Buttons/BigRedButton_Pressed.png';
    m['sqRed'] = UI + 'Buttons/SmallRedSquareButton_Regular.png';
    m['sqRedPressed'] = UI + 'Buttons/SmallRedSquareButton_Pressed.png';
    m['sqBlue'] = UI + 'Buttons/SmallBlueSquareButton_Regular.png';
    m['sqBluePressed'] = UI + 'Buttons/SmallBlueSquareButton_Pressed.png';
    m['rndBlue'] = UI + 'Buttons/SmallBlueRoundButton_Regular.png';
    m['rndBluePressed'] = UI + 'Buttons/SmallBlueRoundButton_Pressed.png';

    m['barBig'] = UI + 'Bars/BigBar_Base.png';
    m['barBigFill'] = UI + 'Bars/BigBar_Fill.png';
    m['barSmall'] = UI + 'Bars/SmallBar_Base.png';

    /* The matching *_Slots.png textures are deliberately NOT loaded: each has a
       ~12px transparent border, so they cannot be tiled as panel fills. See the
       note in ui.js. */
    m['banner'] = UI + 'Banners/Banner.png';
    m['wood'] = UI + 'Wood Table/WoodTable.png';
    m['paper'] = UI + 'Papers/RegularPaper.png';
    m['paperSpecial'] = UI + 'Papers/SpecialPaper.png';

    m['ribbonsBig'] = UI + 'Ribbons/BigRibbons.png';
    m['ribbonsSmall'] = UI + 'Ribbons/SmallRibbons.png';
    m['swords'] = UI + 'Swords/Swords.png';

    m['cursor'] = UI + 'Cursors/Cursor_01.png';
    m['cursorHand'] = UI + 'Cursors/Cursor_02.png';

    /* Keys are zero-padded to mirror the filenames: icon01 .. icon12. */
    for (var k = 1; k <= 12; k++) {
      var kk = (k < 10 ? '0' : '') + k;
      m['icon' + kk] = UI + 'Icons/Icon_' + kk + '.png';
    }
    for (var a = 1; a <= 10; a++) {
      m['avatar' + a] = UI + 'Human Avatars/Avatars_' + (a < 10 ? '0' : '') + a + '.png';
    }
    return m;
  }

  /* -------------------------------------------------------------- loader -- */

  var images = {};
  var failed = [];

  TS.img = function (key) {
    var i = images[key];
    if (!i) console.warn('[assets] missing image key:', key);
    return i;
  };
  TS.loadFailures = function () { return failed; };

  TS.loadAssets = function (onProgress, onDone) {
    var manifest = buildManifest();
    var keys = Object.keys(manifest);
    var total = keys.length;
    var done = 0;

    if (!total) { onDone(); return; }

    keys.forEach(function (key) {
      var img = new Image();
      /* decoding=async keeps the first frames from stalling on large sheets. */
      img.decoding = 'async';
      img.onload = function () {
        images[key] = img;
        step();
      };
      img.onerror = function () {
        failed.push(key + '  ->  ' + manifest[key]);
        console.error('[assets] FAILED to load', key, manifest[key]);
        step();
      };
      img.src = encodeURI(manifest[key]);
    });

    function step() {
      done++;
      if (onProgress) onProgress(done / total, done, total);
      if (done === total) {
        buildSprites();
        primeOfflineCache(keys.map(function (k) { return encodeURI(manifest[k]); }));
        onDone();
      }
    }
  };

  /* Hand the service worker the exact list of sheets we just loaded, so they are
     available offline.
     This is needed because on a FIRST visit the worker is still installing while
     these images are fetched, so those requests never pass through it — without
     this the art would only be cached from the second visit onward, and a player
     who installed and went straight offline would get code but no graphics.
     Passing the list from here also means it can never drift out of step with the
     manifest above. */
  function primeOfflineCache(paths) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg && reg.active) {
        reg.active.postMessage({ type: 'cache-assets', urls: paths });
      }
    }).catch(function () { /* no worker (file://) — nothing to prime */ });
  }

  /* ------------------------------------------------------ sprite registry -- */

  TS.SPR = {};

  function buildSprites() {
    var s = TS.sprite;
    var SPR = TS.SPR;

    /* Units, keyed [team][class][anim]. */
    SPR.unit = {};
    TS.TEAMS.forEach(function (team) {
      SPR.unit[team] = {};
      Object.keys(UNIT_SHEETS).forEach(function (cls) {
        var size = TS.unitFrameSize(cls);
        var a = TS.unitAnchor(cls);
        var out = {};
        Object.keys(UNIT_SHEETS[cls]).forEach(function (anim) {
          var img = images['u:' + team + ':' + cls + ':' + anim];
          if (!img) return;
          out[anim] = s(img, size, size, UNIT_SHEETS[cls][anim][1], a[0], a[1]);
        });
        SPR.unit[team][cls] = out;
      });
    });

    /* Shadow.png's bottom edge lines up with the 192px unit anchor exactly. */
    SPR.shadow = s(images['shadow'], 192, 192, 1, 96, 135);

    /* Heal_Effect overlays the healed unit, so it shares the unit anchor. */
    SPR.healFx = s(images['healFx'], 192, 192, 11, 96, 135);
    /* Arrow art spans x10-52, y26-37 and points right. Anchoring on the tip
       means the arrow's position IS its point, so impacts land where drawn. */
    SPR.arrow = s(images['arrow'], 64, 64, 1, 50, 32);

    /* FX are centre-anchored. */
    SPR.fx = {
      dust1: s(images['dust1'], 64, 64, 8, 32, 40),
      dust2: s(images['dust2'], 64, 64, 10, 32, 40),
      fire2: s(images['fire2'], 64, 64, 10, 32, 52),
      explosion1: s(images['explosion1'], 192, 192, 8, 96, 110),
      explosion2: s(images['explosion2'], 192, 192, 10, 96, 110)
    };

    /* Decor, anchored at the base so things sit on the ground. */
    SPR.decor = { tree: [], bush: [], rock: [], stump: [], cloud: [] };
    for (var i = 1; i <= 4; i++) {
      /* Tree1/2 are 192x256 with the base at y240; Tree3/4 are 192x192. */
      var tall = i <= 2;
      SPR.decor.tree.push(s(images['tree' + i], 192, tall ? 256 : 192, 8, 96, tall ? 240 : 178));
      SPR.decor.bush.push(s(images['bush' + i], 128, 128, 8, 64, 118));
      SPR.decor.rock.push(s(images['rock' + i], 64, 64, 1, 32, 58));
      SPR.decor.stump.push(s(images['stump' + i], 192, 256, 1, 96, 240));
    }
    for (var c = 1; c <= 8; c++) {
      /* Clouds are single sprites, NOT frame grids. */
      var ci = images['cloud' + c];
      SPR.decor.cloud.push(s(ci, ci.width, ci.height, 1, ci.width / 2, ci.height / 2));
    }
    SPR.decor.sheepIdle = s(images['sheepIdle'], 128, 128, 6, 64, 108);
    SPR.decor.sheepGrass = s(images['sheepGrass'], 128, 128, 12, 64, 108);
  }

})(window.TS);
