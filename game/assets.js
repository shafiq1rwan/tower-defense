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

  /* Two factions. The player fields blue Knights; the enemy fields red Goblins.
     Because each class belongs to exactly one faction, sprites are keyed by class
     alone — there is no team dimension to carry around. */
  TS.CLASSES = ['Pawn', 'Warrior', 'Archer', 'Monk', 'Lancer'];
  TS.ENEMY_CLASSES = ['Torch', 'TNT', 'Barrel', 'FoeArcher', 'FoeMonk',
    'FoeWarrior', 'FoeLancer'];

  /* Frame size and foot anchor per class, measured from the sheets. Feet land on
     the same ground line for every class so mixed ranks line up. */
  var CLASS_META = {
    Pawn: { frame: 192, anchor: [96, 135] },
    Warrior: { frame: 192, anchor: [96, 135] },
    Archer: { frame: 192, anchor: [96, 135] },
    Monk: { frame: 192, anchor: [96, 135] },
    /* The only class on 320px frames. */
    Lancer: { frame: 320, anchor: [160, 202] },
    /* Enemy knights share the blue set's geometry exactly. */
    FoeArcher: { frame: 192, anchor: [96, 135] },
    FoeMonk: { frame: 192, anchor: [96, 135] },
    FoeWarrior: { frame: 192, anchor: [96, 135] },
    /* 320px frames like the player's Lancer. */
    FoeLancer: { frame: 320, anchor: [160, 202] },
    Torch: { frame: 192, anchor: [96, 133] },
    TNT: { frame: 192, anchor: [96, 133] },
    /* A rolling barrel bomb — smaller frames than the humanoids. */
    Barrel: { frame: 128, anchor: [64, 99] }
  };
  TS.unitFrameSize = function (cls) { return CLASS_META[cls].frame; };
  TS.unitAnchor = function (cls) { return CLASS_META[cls].anchor; };

  /* Goblin troops ship as multi-row GRIDS rather than one file per animation:
     [row, frameCount]. Row lengths vary and are shorter than the sheet is wide,
     so both numbers matter. Verified by rendering each sheet as a labelled grid.
     The Barrel is on 128px frames and is a TNT keg, not a goblin — row 1 is its
     roll cycle and row 5 is the detonation. */
  var GOBLIN_SHEETS = {
    /* Rows 2, 3 and 4 are three DIRECTIONAL swings (level, low, overhead). Only
       row 2 reads correctly in a side-on fight — the others hunch the goblin over
       as though striking at the ground. */
    Torch: {
      file: 'Factions/Goblins/Troops/Torch/Red/Torch_Red.png',
      anims: { idle: [0, 7], run: [1, 6], attack: [2, 6] }
    },
    TNT: {
      file: 'Factions/Goblins/Troops/TNT/Red/TNT_Red.png',
      anims: { idle: [0, 6], run: [1, 6], attack: [2, 7] }
    },
    Barrel: {
      file: 'Factions/Goblins/Troops/Barrel/Red/Barrel_Red.png',
      anims: { idle: [0, 1], run: [1, 6], attack: [5, 3] }
    }
  };
  TS.GOBLIN_SHEETS = GOBLIN_SHEETS;

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

  /* Enemy knights, drawn from the pack's PURPLE colourway — distinct from the
     player's blue and from the goblins' red at a glance, which is the whole reason
     to use a third colour rather than recolouring red.
     Same files, same frame counts and same feet anchors as the blue set; only the
     directory differs. Registered as their own classes because sprites are keyed by
     class alone, so a class belongs to exactly one faction. */
  var FOE_DIR = 'Purple Units/';
  var FOE_SHEETS = {
    FoeArcher: {
      idle: ['Archer/Archer_Idle.png', 6],
      run: ['Archer/Archer_Run.png', 4],
      attack: ['Archer/Archer_Shoot.png', 8]
    },
    FoeMonk: {
      idle: ['Monk/Idle.png', 6],
      run: ['Monk/Run.png', 4],
      attack: ['Monk/Heal.png', 11]
    },
    /* Chapter-2 renegades. Measured: purple sheets match blue frame for frame
       (Warrior 1536/1152/768/768/1152 x192; Lancer 3840/1920/960/1920 x320). */
    FoeWarrior: {
      idle: ['Warrior/Warrior_Idle.png', 8],
      run: ['Warrior/Warrior_Run.png', 6],
      attack: ['Warrior/Warrior_Attack1.png', 4],
      attack2: ['Warrior/Warrior_Attack2.png', 4],
      guard: ['Warrior/Warrior_Guard.png', 6]
    },
    FoeLancer: {
      idle: ['Lancer/Lancer_Idle.png', 12],
      run: ['Lancer/Lancer_Run.png', 6],
      attack: ['Lancer/Lancer_Right_Attack.png', 3],
      guard: ['Lancer/Lancer_Right_Defence.png', 6]
    }
  };
  TS.FOE_SHEETS = FOE_SHEETS;

  /* Avatar sheets are grouped in blocks of 5 by team colour, in this class
     order. Verified by eye: plumed helm, bowl helm, conical helm, tonsure,
     long hair. Knights only — the Goblin faction ships no portraits. */
  var AVATAR_ORDER = ['Warrior', 'Pawn', 'Lancer', 'Monk', 'Archer'];
  var TEAM_AVATAR_BLOCK = { Blue: 0, Red: 5, Purple: 15 };
  TS.avatarKey = function (team, cls) {
    var i = TEAM_AVATAR_BLOCK[team] + AVATAR_ORDER.indexOf(cls) + 1;
    return 'avatar' + i;
  };

  /* ------------------------------------------------------------ manifest -- */

  function buildManifest() {
    var m = {};

    /* Player Knights, one file per animation (the pack's per-colour folders). */
    Object.keys(UNIT_SHEETS).forEach(function (cls) {
      var anims = UNIT_SHEETS[cls];
      Object.keys(anims).forEach(function (anim) {
        m['u:' + cls + ':' + anim] = UNIT_DIR + 'Blue Units/' + anims[anim][0];
      });
    });

    /* Enemy Knights, same layout as the player's from the purple folder. */
    Object.keys(FOE_SHEETS).forEach(function (cls) {
      var fa = FOE_SHEETS[cls];
      Object.keys(fa).forEach(function (anim) {
        m['u:' + cls + ':' + anim] = UNIT_DIR + FOE_DIR + fa[anim][0];
      });
    });
    /* A purple archer firing a blue arrow reads as a bug, and the pack ships the
       matching one. */
    m['arrowFoe'] = UNIT_DIR + FOE_DIR + 'Archer/Arrow.png';

    /* Enemy Goblins, one grid sheet per class. */
    Object.keys(GOBLIN_SHEETS).forEach(function (cls) {
      m['g:' + cls] = GOBLIN_SHEETS[cls].file;
    });
    m['dynamite'] = 'Factions/Goblins/Troops/TNT/Dynamite/Dynamite.png';

    /* Bases, each with the destroyed state the full pack provides. A stone tower
       against a goblin hut: both about 113px of visible art, so the two ends of
       the lane carry equal weight. */
    m['basePlayer'] = 'Factions/Knights/Buildings/Tower/Tower_Blue.png';
    m['basePlayerWreck'] = 'Factions/Knights/Buildings/Tower/Tower_Destroyed.png';
    m['baseEnemy'] = 'Factions/Goblins/Buildings/Wood_House/Goblin_House.png';
    m['baseEnemyWreck'] = 'Factions/Goblins/Buildings/Wood_House/Goblin_House_Destroyed.png';

    m['arrow'] = UNIT_DIR + 'Blue Units/Archer/Arrow.png';
    m['healFx'] = UNIT_DIR + 'Blue Units/Monk/Heal_Effect.png';
    /* Shared death effect: a flash, then a skull that settles and sinks. Faction
       neutral, so it serves knights and goblins alike. */
    m['dead'] = 'Factions/Knights/Troops/Dead/Dead.png';

    /* Ground. Tilemap_Flat carries a grass AND a sand 4x4 autotile side by side —
       the sand is what makes the battle lane match the reference. */
    m['ground'] = TER + 'Ground/Tilemap_Flat.png';
    /* No shadow sprite is loaded: BOTH the pack's shadow files are grey rounded
       squares, so unit shadows are drawn as flattened ellipses instead. */

    /* Alternate ground palettes, one per level theme. These are the OLDER tileset
       layout (576x384, a 4x4 autotile plus elevation and cliff strips) and carry
       no sand at all, so they are used only for the grass field — the sand lane
       always comes from Tilemap_Flat. Interior cell measured as (col 1, row 1);
       see themes.js for the colours and why that cell is the safe one. */
    for (var t = 1; t <= 5; t++) {
      m['tint' + t] = TER + 'Tileset/Tilemap_color' + t + '.png';
    }

    /* Water features for the themes that have a lake. Water.png is a flat 64px
       tile (the surface does not animate); the movement all comes from the foam
       ring and the water-rock sheets, which do. */
    m['water'] = TER + 'Water/Water.png';
    m['foam'] = TER + 'Water/Foam/Foam.png';
    m['duck'] = TER + 'Decorations/Rubber Duck/Rubber duck.png';
    for (var wr = 1; wr <= 4; wr++) {
      m['waterRock' + wr] =
        TER + 'Decorations/Rocks in the Water/Water Rocks_0' + wr + '.png';
    }

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

    /* Scatter props: mushrooms, pebbles, grass tufts, pumpkins and a bone —
       the small details the reference dresses its field with. */
    for (var d = 1; d <= 15; d++) {
      var dd = (d < 10 ? '0' : '') + d;
      m['deco' + dd] = 'Deco/' + dd + '.png';
    }

    /* Particle FX. Dust comes from the original Particle FX folder; the full
       pack's Effects/ explosion and fire sheets are better than its Fire_0N. */
    m['dust1'] = FX + 'Dust_01.png';
    m['dust2'] = FX + 'Dust_02.png';
    m['boom'] = 'Effects/Explosion/Explosions.png';
    m['fire'] = 'Effects/Fire/Fire.png';

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
    /* One purple portrait for chapter 2's renegade captain — block 16-20 is the
       purple colourway, and 16 is the Warrior pose (measured ink x22-218 y32-212,
       the same pose as the blue Warrior's). */
    m['avatar16'] = UI + 'Human Avatars/Avatars_16.png';
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

    /* Units, keyed [class][anim] — each class belongs to one faction. */
    SPR.unit = {};
    Object.keys(UNIT_SHEETS).forEach(function (cls) {
      var size = TS.unitFrameSize(cls);
      var a = TS.unitAnchor(cls);
      var out = {};
      Object.keys(UNIT_SHEETS[cls]).forEach(function (anim) {
        var img = images['u:' + cls + ':' + anim];
        if (!img) return;
        out[anim] = s(img, size, size, UNIT_SHEETS[cls][anim][1], a[0], a[1]);
      });
      SPR.unit[cls] = out;
    });
    /* Enemy knights: identical shape to the player loop above, purple files. */
    Object.keys(FOE_SHEETS).forEach(function (cls) {
      var fsize = TS.unitFrameSize(cls);
      var fa = TS.unitAnchor(cls);
      var fout = {};
      Object.keys(FOE_SHEETS[cls]).forEach(function (anim) {
        var fimg = images['u:' + cls + ':' + anim];
        if (!fimg) return;
        fout[anim] = s(fimg, fsize, fsize, FOE_SHEETS[cls][anim][1], fa[0], fa[1]);
      });
      SPR.unit[cls] = fout;
    });

    Object.keys(GOBLIN_SHEETS).forEach(function (cls) {
      var img = images['g:' + cls];
      if (!img) return;
      var size = TS.unitFrameSize(cls);
      var a = TS.unitAnchor(cls);
      var anims = GOBLIN_SHEETS[cls].anims;
      var out = {};
      Object.keys(anims).forEach(function (anim) {
        /* [row, count] — the row is what selects the animation in a grid sheet. */
        out[anim] = s(img, size, size, anims[anim][1], a[0], a[1], anims[anim][0]);
      });
      SPR.unit[cls] = out;
    });

    /* Heal_Effect overlays the healed unit, so it shares the unit anchor. */
    SPR.healFx = s(images['healFx'], 192, 192, 11, 96, 135);

    /* 14 frames laid out 7 wide across two rows, hence the trailing `cols`. */
    SPR.dead = s(images['dead'], 128, 128, 14, 64, 96, 0, 7);
    /* Dynamite spins as it flies; anchored centre so rotation looks right. */
    SPR.dynamite = s(images['dynamite'], 64, 64, 6, 32, 32);
    /* Arrow art spans x10-52, y26-37 and points right. Anchoring on the tip
       means the arrow's position IS its point, so impacts land where drawn. */
    SPR.arrow = s(images['arrow'], 64, 64, 1, 50, 32);
    SPR.arrowFoe = s(images['arrowFoe'], 64, 64, 1, 50, 32);
    /* The bounty coin. Anchored on Icon_03's measured ink centre (31,30) rather than
       the frame centre, so it spins about itself instead of wobbling. */
    SPR.fxCoin = s(images['icon03'], 64, 64, 1, 31, 30);

    /* FX are centre-anchored. */
    SPR.fx = {
      dust1: s(images['dust1'], 64, 64, 8, 32, 40),
      dust2: s(images['dust2'], 64, 64, 10, 32, 40),
      /* Full-pack sheets: 9 explosion frames of 192, 7 fire frames of 128. */
      boom: s(images['boom'], 192, 192, 9, 96, 118),
      fire: s(images['fire'], 128, 128, 7, 64, 104)
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
      /* Clouds are single sprites, NOT frame grids. Guarded because this is the
         one build path that DEREFERENCES the image (for its size): the loader
         survives a failed download by design, but an unguarded `ci.width` here
         threw and hung the loading screen at 100% if any cloud 404'd. */
      var ci = images['cloud' + c];
      if (ci) {
        SPR.decor.cloud.push(s(ci, ci.width, ci.height, 1, ci.width / 2, ci.height / 2));
      }
    }
    SPR.decor.sheepIdle = s(images['sheepIdle'], 128, 128, 6, 64, 108);
    SPR.decor.sheepGrass = s(images['sheepGrass'], 128, 128, 12, 64, 108);

    /* Water features. MEASURED, because none of these follow from image width:
         Foam.png            1536x192 = 8 frames of 192, but the ring itself only
                             occupies x55-136 y55-136 — about 82px inset in the
                             middle of the frame. Spacing foam by the 192px frame
                             width leaves visible gaps in a shoreline; space it by
                             the ~82px of actual ink instead.
         Rubber duck.png     96x32  = 3 frames of 32, ink y5-27 (it bobs).
         Water Rocks_0N.png  1024x64 = 16 frames of 64, ink x9-49 y25-53, so the
                             anchor sits low in the cell where the water laps. */
    SPR.decor.foam = s(images['foam'], 192, 192, 8, 96, 96);
    SPR.decor.duck = s(images['duck'], 32, 32, 3, 16, 26);
    SPR.decor.waterRock = [];
    for (var wr = 1; wr <= 4; wr++) {
      var wri = images['waterRock' + wr];
      if (wri) SPR.decor.waterRock.push(s(wri, 64, 64, 16, 32, 50));
    }

    /* Scatter props, base-anchored so they sit on the ground. */
    SPR.decor.props = [];
    for (var p = 1; p <= 15; p++) {
      var pp = (p < 10 ? '0' : '') + p;
      var pi = images['deco' + pp];
      if (pi) SPR.decor.props.push(s(pi, 64, 64, 1, 32, 52));
    }
  }

})(window.TS);
