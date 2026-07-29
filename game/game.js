/* game.js — canvas setup, the fixed-step loop, input and the screen flow.
 *
 * The simulation always advances in fixed 1/60s steps and fast-forward simply
 * feeds it more steps per frame, so 1x / 2x / 3x cannot drift the balance.
 * UI animation runs off a separate real-time clock so the interface stays calm
 * while the battle is sped up.
 */
(function (TS) {
  'use strict';

  var STEP = 1 / 60;
  var canvas, ctx;
  var last = 0, acc = 0;
  var uiClock = 0;
  var lastDt = 0;
  var speed = 1;
  var paused = false;

  var screen = 'loading';
  var loadProgress = 0;

  var battle = null;
  var battleIndex = 0;
  var resultShown = false;

  var buttons = [];        // active clickables for the current screen
  var hud = null;          // battle-screen widgets
  var titleUnits = [];
  var titleBases = [];
  var confirming = null;      // shared confirmation dialog, or null

  /* Result-screen award animation. Driven by real time, not sim time, so the
     swords land at the same pace whatever speed the battle was running at. */
  var resultT = 0, resultStars = 0, starsRung = 0;
  var STAR_DELAY = 0.3, STAR_GAP = 0.34, STAR_POP = 0.34;

  /* Level rows use the 103px big ribbon, not the 54px small one: at the CSS scale
     a phone renders this canvas at, 54 logical px is only ~25 device-independent
     pixels — far under a comfortable touch target. */
  var SELECT_TOP = 284, SELECT_PITCH = 114;

  var pointer = { x: -999, y: -999, down: false, target: null, hand: false, touch: false };

  /* ----------------------------------------------------------------- boot -- */

  function boot() {
    canvas = document.getElementById('game');
    canvas.width = TS.W;
    canvas.height = TS.H;
    ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    resize();

    bindInput();
    requestAnimationFrame(frame);

    TS.loadAssets(function (p) { loadProgress = p; }, onLoaded);
  }

  /* Backing store stays at logical size and CSS fits it, so all drawing is 1:1.
     The filtering choice must be made in DEVICE pixels, not CSS pixels: a phone
     at dpr 3 shows a 0.47x CSS scale but is really magnifying ~1.4x on the
     panel, and picking smooth filtering there would blur the art needlessly.
     Genuine minification (a short low-DPI desktop window) does want smoothing,
     because nearest-neighbour downscaling of pixel art aliases badly. */
  function resize() {
    /* Measured from the stage's CONTENT box rather than the window, so the
       safe-area padding applied for installed/notched devices is respected.
       clientWidth includes padding, hence subtracting it back out. */
    var vw = window.innerWidth, vh = window.innerHeight;
    var stage = document.getElementById('stage');
    if (stage) {
      var cs = window.getComputedStyle(stage);
      var px = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      var py = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      vw = Math.max(64, stage.clientWidth - (px || 0));
      vh = Math.max(64, stage.clientHeight - (py || 0));
    }
    var scale = Math.min(vw / TS.W, vh / TS.H);
    var devScale = scale * (window.devicePixelRatio || 1);
    canvas.style.width = Math.floor(TS.W * scale) + 'px';
    canvas.style.height = Math.floor(TS.H * scale) + 'px';
    canvas.style.imageRendering = devScale >= 1 ? 'pixelated' : 'auto';
  }

  function onLoaded() {
    if (TS.loadFailures().length) {
      screen = 'error';
      return;
    }
    TS.Terrain.build(1337, TS.defaultTheme());
    TS.Scene.build(1337, TS.defaultTheme());
    buildTitleUnits();
    goTitle();
  }

  /* ---------------------------------------------------------------- input -- */

  function toLogical(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (cx - r.left) / r.width * TS.W,
      y: (cy - r.top) / r.height * TS.H
    };
  }

  function bindInput() {
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' && !pointer.touch) {
        pointer.touch = true;
        document.body.classList.add('touch');
      }
      TS.Audio.unlock();
      var p = toLogical(e.clientX, e.clientY);
      pointer.x = p.x; pointer.y = p.y; pointer.down = true;
      pointer.target = pick(p.x, p.y);
      if (pointer.target) pointer.target.pressed = true;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', function (e) {
      var p = toLogical(e.clientX, e.clientY);
      pointer.x = p.x; pointer.y = p.y;
      if (pointer.down && pointer.target) {
        pointer.target.pressed = pointer.target.contains(p.x, p.y);
      }
      pointer.hand = !!pick(p.x, p.y);
    });

    function release(e) {
      var p = pointer.target;
      pointer.down = false;
      if (p) {
        var still = p.pressed;
        p.pressed = false;
        pointer.target = null;
        if (still) activate(p);
      } else if (screen === 'cutscene') {
        /* Anywhere that is not the SKIP button advances the dialogue. Buttons are
           hit-tested at pointerdown, so reaching here means empty space. */
        TS.Story.advance();
      }
      if (e) e.preventDefault();
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', function () {
      pointer.hand = false;
      if (!pointer.down) { pointer.x = -999; pointer.y = -999; }
    });

    /* Keyboard shortcuts: 1-5 summon, space toggles speed, P pauses. */
    window.addEventListener('keydown', function (e) {
      TS.Audio.unlock();
      if (screen === 'cutscene') {
        if (e.code === 'Space' || e.key === 'Enter') { TS.Story.advance(); e.preventDefault(); }
        else if (e.key === 'Escape') { TS.Story.skip(); e.preventDefault(); }
        return;
      }
      if (screen !== 'battle' || paused || !battle) {
        if (e.key === 'Escape' && paused) togglePause();
        return;
      }
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= hud.cards.length) {
        tapCard(hud.cards[n - 1]);
        e.preventDefault();
      } else if (e.code === 'Space') {
        cycleSpeed();
        e.preventDefault();
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        togglePause();
        e.preventDefault();
      }
    });
  }

  /* Cards are hit-tested before buttons: they are the busiest target. */
  function pick(x, y) {
    /* Nothing is tappable mid-transition. The outgoing screen's buttons are still
       in `buttons` during the fade out, and its rows are drawn offset from where
       they really are — so a tap would either hit the wrong thing or fire a second
       navigation on top of the one already running. */
    if (trans) return null;
    if (screen === 'battle' && !paused && hud && battle && !battle.over) {
      for (var i = 0; i < hud.cards.length; i++) {
        if (hud.cards[i].contains(x, y)) return hud.cards[i];
      }
    }
    return TS.UI.hit(buttons, x, y);
  }

  function activate(target) {
    if (target instanceof TS.UI.Card) { tapCard(target); return; }
    if (target.onTap) { TS.Audio.play('click'); target.onTap(); }
  }

  function tapCard(card) {
    if (!battle || battle.over || paused) return;
    if (battle.trySummon(card.cls)) {
      card.flashT = 0.28;
      hud.hint = card.def.blurb;
      hud.hintT = 2.6;
    } else {
      card.denyT = 0.3;
      TS.Audio.play('deny');
    }
  }

  /* --------------------------------------------------------------- screens -- */

  /* The menus share the battlefield as a backdrop, so after a stormy battle they
     would still be dark and raining. Put the calm theme back — but only when it is
     not already current, since this re-tiles the whole 832x1472 terrain canvas. */
  /* Music belongs to battles. On the menus it would loop under a static screen for
     as long as someone browses, which wears out a four-bar phrase fast. */
  function stopMusic() { TS.Audio.Music.stop(); }

  /* ---------------------------------------------------- menu transitions -- */

  /* The menus all share one terrain backdrop, so sliding the whole SCREEN would
     look broken — the background would sit still while its contents moved. Only
     the UI layer animates: the outgoing panel lifts and fades, then the incoming
     one rises into place, with the battle rows staggered so the list assembles
     rather than appearing whole.
     Runs on the real-time clock, like every other piece of interface animation. */
  /* Kept deliberately brief. Input is blocked for the whole transition — see
     pick() — so every millisecond here is a millisecond the menu ignores taps.
     0.10 + 0.20 + eight rows at 0.018 lands a shade under half a second, which
     reads as responsive; the first draft ran to 0.61s and felt sticky. */
  var trans = null;
  var TR_OUT = 0.10, TR_IN = 0.20, TR_STAGGER = 0.018;

  /* Wrap a screen change so it animates. `go` is the ordinary goX function; it
     fires at the midpoint, which is why the incoming screen never flashes up
     before the outgoing one has left. */
  function goAnimated(go) {
    if (trans) return;          // already moving; ignore the second tap
    trans = { t: 0, phase: 'out', go: go };
  }

  function updateTransition(dt) {
    if (!trans) return;
    trans.t += dt;
    if (trans.phase === 'out') {
      if (trans.t < TR_OUT) return;
      trans.go();
      trans.phase = 'in';
      trans.t = 0;
    } else if (trans.t >= TR_IN + TS.Levels.count * TR_STAGGER) {
      trans = null;
    }
  }

  /* Alpha and vertical offset for the UI layer this frame, or null when idle. */
  function transStyle() {
    if (!trans) return null;
    if (trans.phase === 'out') {
      var k = TS.clamp(trans.t / TR_OUT, 0, 1);
      return { alpha: 1 - k, dy: -30 * k };
    }
    var e = TS.easeOutCubic(TS.clamp(trans.t / TR_IN, 0, 1));
    return { alpha: e, dy: 46 * (1 - e) };
  }

  /* Extra offset for row `i` of the battle list, so the list cascades in. */
  function rowStagger(i) {
    if (!trans || trans.phase !== 'in' || screen !== 'select') return 0;
    var e = TS.easeOutCubic(TS.clamp((trans.t - i * TR_STAGGER) / TR_IN, 0, 1));
    return 54 * (1 - e);
  }

  function useDefaultBackdrop() {
    var theme = TS.defaultTheme();
    if (TS.Terrain.theme === theme) return;
    TS.Terrain.build(1337, theme);
    TS.Scene.build(1337, theme);
  }

  function goTitle() {
    screen = 'title';
    paused = false;
    confirming = null;
    battle = null;
    stopMusic();
    useDefaultBackdrop();
    buttons = [
      new TS.UI.Button({
        x: 256, y: 980, w: 320, h: 140, kind: 'big', label: 'PLAY', labelSize: 44,
        onTap: function () { goAnimated(goSelect); }
      }),
      new TS.UI.Button({
        x: 30, y: 1300, kind: 'sqBlue', icon: 'icon12',
        onTap: function () { TS.Audio.toggle(); }
      }),
      new TS.UI.Button({
        x: TS.W - 118, y: 1300, kind: 'sqRed', icon: 'icon09',
        /* Wiping every battle you have cleared is not something a stray tap
           should be able to do. */
        onTap: askResetConfirm
      })
    ];
  }

  /* One confirmation dialog, shared. It draws over whatever screen is beneath it,
     which is what lets the same code guard both wiping the save from the title and
     abandoning a battle from the pause menu. */
  function askConfirm(o) {
    confirming = o;
    buttons = [
      new TS.UI.Button({
        x: 130, y: 806, w: 260, h: 126, kind: 'bigRed',
        label: o.okLabel || 'YES', labelSize: 32,
        onTap: function () { var f = o.onOk; confirming = null; if (f) f(); }
      }),
      new TS.UI.Button({
        x: 442, y: 806, w: 260, h: 126, kind: 'big', label: 'CANCEL', labelSize: 30,
        onTap: function () { var f = o.onCancel; confirming = null; if (f) f(); }
      })
    ];
  }

  function drawConfirm() {
    var c = confirming;
    var d = TS.UI.dialog(ctx, {
      w: 620, h: 480, y: 470, title: c.title, titleRow: TS.UI.PLATE.red
    });
    var y = d.y + 116;
    for (var i = 0; i < c.lines.length; i++) {
      var ln = c.lines[i];
      TS.text(ctx, ln.text, TS.W / 2, y, {
        size: ln.size || 24, fill: ln.fill || '#7a6248', stroke: null
      });
      y += (ln.size || 24) + 26;
    }
  }

  function askResetConfirm() {
    var save = TS.Save.get();
    var levels = TS.CLASSES.reduce(function (n, c) {
      return n + TS.Save.upgradeLevel(c);
    }, 0);
    askConfirm({
      title: 'ARE YOU SURE?',
      lines: [
        { text: 'This erases all progress:', size: 26, fill: '#5c4632' },
        { text: save.cleared + ' of ' + TS.Levels.count + ' battles cleared' },
        { text: save.gold + ' gold and ' + levels + ' upgrades' },
        { text: 'It cannot be undone.', size: 22, fill: '#9a7a5a' }
      ],
      okLabel: 'RESET',
      onOk: function () { TS.Save.reset(); TS.Save.get(); goTitle(); },
      onCancel: goTitle
    });
  }

  function goSelect() {
    screen = 'select';
    stopMusic();
    useDefaultBackdrop();
    buttons = [];
    var n = TS.Levels.count;
    for (var i = 0; i < n; i++) {
      (function (idx) {
        var unlocked = TS.Save.isUnlocked(idx);
        buttons.push(new TS.UI.Button({
          x: 84, y: SELECT_TOP + idx * SELECT_PITCH, w: 664, h: 103,
          kind: 'none', id: 'lvl' + idx, enabled: unlocked,
          onTap: function () { startBattle(idx); }
        }));
      })(i);
    }
    buttons.push(new TS.UI.Button({
      x: 52, y: 1216, w: 340, h: 130, kind: 'big', label: 'BARRACKS', labelSize: 30,
      onTap: function () { goAnimated(goShop); }
    }));
    buttons.push(new TS.UI.Button({
      x: 440, y: 1216, w: 340, h: 130, kind: 'bigRed', label: 'BACK', labelSize: 34,
      onTap: function () { goAnimated(goTitle); }
    }));
  }

  /* ---------------------------------------------------------------- shop -- */

  var SHOP_TOP = 330, SHOP_PITCH = 150, SHOP_X = 40, SHOP_W = 752;

  /* Measured ink height above each class's foot anchor, used to centre the shop
     portraits. Sprites differ a lot: a Monk's art is 70px tall over its anchor
     while a Lancer's raised pike reaches 154px. */
  var SHOP_ART_H = { Pawn: 71, Warrior: 87, Archer: 87, Monk: 70, Lancer: 154 };

  function goShop() {
    screen = 'shop';
    buttons = [];
    TS.CLASSES.forEach(function (cls, i) {
      if (TS.Save.upgradeCost(cls) <= 0) return;   // maxed: row shows MAX, no button
      var rowY = SHOP_TOP + i * SHOP_PITCH;
      buttons.push(new TS.UI.Button({
        /* Height must be at least SLICE.button's 94px minimum. Declaring it
           smaller made nineSlice clamp the ART to 94 while the label centred on
           the shorter rect, putting the text 11px above the real centre. */
        x: SHOP_X + SHOP_W - 170, y: rowY + 19, w: 150, h: 94,
        kind: 'big', id: 'buy:' + cls,
        icon: 'icon03', iconScale: 0.5,
        label: String(TS.Save.upgradeCost(cls)),
        labelSize: 27,
        enabled: TS.Save.canAfford(cls),
        onTap: function () {
          if (TS.Save.buyUpgrade(cls)) {
            TS.Audio.play('coin');
            goShop();          // rebuild: costs, levels and affordability all move
          } else {
            TS.Audio.play('deny');
          }
        }
      }));
    });
    buttons.push(new TS.UI.Button({
      x: 256, y: 1216, w: 320, h: 130, kind: 'bigRed', label: 'BACK', labelSize: 38,
      onTap: function () { goAnimated(goSelect); }
    }));
  }

  function drawShop() {
    var UI = TS.UI;
    var save = TS.Save.get();

    ctx.fillStyle = 'rgba(14,22,19,0.58)';
    ctx.fillRect(0, 0, TS.W, TS.H);
    UI.labelRibbon(ctx, 'big', 66, 130, TS.W - 132, UI.PLATE.teal, 'BARRACKS',
      { size: 42, stroke: '#25404a' });

    /* Purse, so the cost on every row can be judged against it. Coin and number
       are laid out as one group centred on the ribbon, which keeps the coin clear
       of the left tail and stays balanced whatever the digit count. */
    var pw = 260, px = (TS.W - pw) / 2;
    UI.smallRibbon(ctx, px, 244, pw, UI.RIB.yellowR);
    UI.coinAmount(ctx, save.gold, px + pw / 2, 244 + UI.ribbonMid('small'), {
      size: 27, stroke: '#5a4410'
    });

    TS.CLASSES.forEach(function (cls, i) {
      var def = TS.UNIT_DEFS[cls];
      var rowY = SHOP_TOP + i * SHOP_PITCH;
      var lv = TS.Save.upgradeLevel(cls);
      var maxed = lv >= TS.Save.MAX_UPG;

      UI.panel(ctx, 'paper', SHOP_X, rowY, SHOP_W, 132);

      /* Live idle frame — the same art the card uses, so the row is identifiable
         at a glance rather than by name alone.
         Centred on the row by its MEASURED ink height above the foot anchor;
         parking the feet near the row's bottom edge instead leaves every portrait
         sitting low, and by a different amount per class. */
      var spr = TS.SPR.unit[cls].idle;
      var artScale = cls === 'Lancer' ? 0.62 : 0.9;
      var feetY = rowY + 66 + (SHOP_ART_H[cls] * artScale) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(SHOP_X + 8, rowY + 4, 130, 124);
      ctx.clip();
      TS.drawFrame(ctx, spr, (uiClock * def.fps.idle) | 0,
        SHOP_X + 74, feetY, { scale: artScale });
      ctx.restore();

      /* Two text lines centred as a pair on the row's middle. */
      var textX = SHOP_X + 152;
      TS.text(ctx, def.name, textX, rowY + 48, {
        size: 27, fill: '#4a3628', stroke: null, align: 'left'
      });

      /* Level pips sit beside the name, on the same line, so the row reads as one
         sentence rather than three stacked fragments. */
      var pipX = textX + TS.textWidth(ctx, def.name, 27) + 20;
      for (var p = 0; p < TS.Save.MAX_UPG; p++) {
        ctx.save();
        ctx.globalAlpha = p < lv ? 1 : 0.2;
        UI.icon(ctx, 'icon05', pipX + p * 30, rowY + 47, 0.42);
        ctx.restore();
      }

      /* Phrased as what the purchase BUYS, not the bonus already held — "+0%
         health and power" on an untrained class tells the player nothing. */
      var pct = Math.round((maxed ? lv : lv + 1) * 12);
      TS.text(ctx, (maxed ? 'Fully trained — +' : 'Train to +') +
        pct + '% health and power',
        textX, rowY + 86, {
          size: 19, fill: '#7a6248', stroke: null, align: 'left'
        });

      if (maxed) {
        TS.text(ctx, 'MAX', SHOP_X + SHOP_W - 95, rowY + 66, {
          size: 28, fill: '#8a7250', stroke: null
        });
      }
    });
  }

  function startBattle(index) {
    battleIndex = index;
    var level = TS.Levels.get(index);
    level.index = index;

    TS.FX.reset();
    battle = new TS.Battle(level);
    /* Each battle gets its own THEME — palette, weather, water, how much life is
       about — plus a per-level seed so the scatter differs too. The seed alone was
       not enough: a different arrangement of the same props on the same green
       still read as the same place eight times over. */
    var theme = TS.themeFor(index);
    TS.Terrain.build(1000 + index * 37, theme);
    TS.Scene.build(1000 + index * 37, theme);
    /* The score takes its key and tempo from the same theme, so the music darkens
       with the weather rather than one track playing over all eight battles. */
    TS.Audio.Music.play(theme.music);

    speed = 1;
    paused = false;
    resultShown = false;

    hud = {
      cards: TS.UI.layoutCards(level),
      hint: null,
      hintT: 0,
      pauseBtn: new TS.UI.Button({
        x: 714, y: 39, kind: 'sqRed', icon: 'icon10', onTap: togglePause
      }),
      speedBtn: new TS.UI.Button({
        x: 34, y: 145, kind: 'rndBlue', label: '1x', labelSize: 30, onTap: cycleSpeed
      })
    };

    /* The battle is fully built — hud included — before its cutscene runs, which
       is what lets the scene play over this level's own terrain, weather and
       music. Nothing ticks while `screen` is 'cutscene': simulate() only runs on
       'battle', so the battle waits at t=0 until the dialogue ends or is skipped. */
    if (TS.Story.pending(index)) {
      playCutscene(index, function () { enterBattle(); });
      return;
    }
    enterBattle();
  }

  function enterBattle() {
    screen = 'battle';
    buttons = [hud.pauseBtn, hud.speedBtn];
  }

  /* Shared by the pre-battle scenes and the epilogue. The only button is SKIP —
     everything else advances on a tap anywhere, handled in the pointer release. */
  function playCutscene(key, onDone) {
    TS.Story.begin(key, onDone);
    screen = 'cutscene';
    buttons = [new TS.UI.Button({
      x: 600, y: 1290, w: 184, h: 96, kind: 'big', label: 'SKIP', labelSize: 26,
      onTap: function () { TS.Story.skip(); }
    })];
  }

  function cycleSpeed() {
    speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
    hud.speedBtn.label = speed + 'x';
  }

  /* Extracted so the quit confirmation can put the pause menu back on Cancel. */
  function pauseButtons() {
    /* Two rows of two, kept above the banner's 111px rolled bottom edge. */
    return [
      new TS.UI.Button({
        x: 150, y: 620, w: 250, h: 120, kind: 'big', label: 'RESUME', labelSize: 28,
        onTap: togglePause
      }),
      new TS.UI.Button({
        x: 432, y: 620, w: 250, h: 120, kind: 'bigRed', label: 'RETRY', labelSize: 28,
        onTap: function () { startBattle(battleIndex); }
      }),
      new TS.UI.Button({
        x: 150, y: 756, w: 250, h: 120, kind: 'big', label: 'MAP', labelSize: 28,
        onTap: askQuitConfirm
      }),
      new TS.UI.Button({
        x: 432, y: 756, w: 250, h: 120, kind: 'big',
        icon: 'icon12', onTap: function () { TS.Audio.toggle(); }
      })
    ];
  }

  function togglePause() {
    paused = !paused;
    /* Suspend rather than stop, so resuming picks the phrase back up instead of
       restarting the loop from bar one every time the player checks the menu. */
    if (paused) TS.Audio.Music.suspend(); else TS.Audio.Music.resume();
    confirming = null;
    buttons = paused ? pauseButtons() : [hud.pauseBtn, hud.speedBtn];
  }

  /* Leaving mid-battle used to be a single unguarded tap on MAP, which threw away
     a run in progress with no way back — easy to hit by accident reaching for
     RESUME right above it. */
  function askQuitConfirm() {
    var pct = Math.round(100 * battle.playerCastle.hp / battle.playerCastle.maxHp);
    askConfirm({
      title: 'LEAVE THE BATTLE?',
      lines: [
        { text: 'This battle will not be saved.', size: 26, fill: '#5c4632' },
        { text: 'Tower at ' + pct + '% · ' + battle.stats.killed + ' felled',
          size: 24, fill: '#7a6248' },
        { text: 'You can replay it from the map.', size: 22, fill: '#9a7a5a' }
      ],
      okLabel: 'LEAVE',
      onOk: goSelect,
      onCancel: function () { buttons = pauseButtons(); }
    });
  }

  function showResult() {
    resultShown = true;
    var won = battle.over === 'win';
    var hpFrac = battle.playerCastle.hp / battle.playerCastle.maxHp;
    var reward = won ? TS.Levels.reward(battleIndex, hpFrac) : 0;
    battle.reward = reward;
    /* Rated on THIS run, not the saved best, so the award reflects what just
       happened rather than a better attempt from earlier. */
    resultStars = won ? TS.Save.starsForFrac(hpFrac) : 0;
    resultT = 0;
    starsRung = 0;
    if (won) TS.Save.recordWin(battleIndex, hpFrac, reward);

    var hasNext = battleIndex + 1 < TS.Levels.count;
    buttons = [];
    if (won && hasNext) {
      buttons.push(new TS.UI.Button({
        x: 146, y: 906, w: 250, h: 120, kind: 'big', label: 'NEXT', labelSize: 32,
        onTap: function () { startBattle(battleIndex + 1); }
      }));
    } else {
      buttons.push(new TS.UI.Button({
        x: 146, y: 906, w: 250, h: 120, kind: 'bigRed', label: 'RETRY', labelSize: 32,
        onTap: function () { startBattle(battleIndex); }
      }));
    }
    /* Winning the last battle earns the epilogue, played on the way back to the
       map rather than on top of the result panel — the swords and the reward get
       their moment first. */
    var toMap = (won && !hasNext && TS.Story.pending('end'))
      ? function () { resultShown = false; playCutscene('end', goSelect); }
      : goSelect;
    buttons.push(new TS.UI.Button({
      x: 436, y: 906, w: 250, h: 120, kind: 'big', label: 'MAP', labelSize: 32,
      onTap: toMap
    }));
  }

  /* ------------------------------------------------------------------ loop -- */

  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    uiClock += dt;
    lastDt = dt;
    updateTransition(dt);

    if (screen === 'battle' && !paused) {
      acc += dt * speed;
      var steps = 0;
      while (acc >= STEP && steps < 12) { simulate(STEP); acc -= STEP; steps++; }
      if (acc > STEP * 12) acc = 0;
    } else {
      acc = 0;
      /* Scenery keeps moving behind a cutscene — the weather is half the point of
         setting the scene in the level it belongs to. Real dt, like the menus. */
      if (screen === 'title' || screen === 'select' || screen === 'cutscene') {
        TS.Scene.update(dt);
      }
      if (screen === 'cutscene') TS.Story.update(dt);
    }

    if (hud) {
      for (var i = 0; i < hud.cards.length; i++) hud.cards[i].update(dt);
      if (hud.hintT > 0) hud.hintT -= dt;
    }

    if (resultShown) {
      resultT += dt;
      var landed = Math.floor((resultT - STAR_DELAY) / STAR_GAP) + 1;
      while (starsRung < Math.min(landed, resultStars)) {
        starsRung++;
        TS.Audio.play('coin');
      }
    }

    render();
    requestAnimationFrame(frame);
  }

  function simulate(dt) {
    battle.update(dt);
    TS.Scene.update(dt);
    TS.FX.update(dt);
    if (battle.over && battle.overT > 1.5 && !resultShown) showResult();
  }

  /* ---------------------------------------------------------------- render -- */

  function render() {
    if (screen === 'loading') { drawLoading(); return; }
    if (screen === 'error') { drawError(); return; }

    var shake = screen === 'battle' ? TS.FX.shakeOffset() : null;

    ctx.save();
    if (shake) ctx.translate(Math.round(shake.x), Math.round(shake.y));
    TS.Terrain.draw(ctx);
    TS.Scene.drawBack(ctx);

    if (screen === 'battle') {
      battle.draw(ctx);
      TS.FX.drawNumbers(ctx);
    } else if (screen === 'title') {
      drawTitleUnits(lastDt);
    }
    /* Weather and the time-of-day wash sit in FRONT of the units but still inside
       the world transform, so they colour the battle without ever touching the
       HUD, cards or dialogs drawn after the restore below. */
    TS.Scene.drawFront(ctx);
    ctx.restore();

    /* The whole UI layer — panels, buttons and the battle list — animates as one
       during a menu transition. The world behind it is untouched, and the cursor is
       drawn after the restore so it never fades with the interface. */
    var ts = transStyle();
    if (ts) {
      ctx.save();
      ctx.globalAlpha = TS.clamp(ts.alpha, 0, 1);
      ctx.translate(0, Math.round(ts.dy));
    }

    if (screen === 'cutscene') {
      /* The SKIP button is drawn by the shared loop below, so it lands on top of
         the dim overlay and the dialogue box. */
      TS.Story.draw(ctx, uiClock);
    } else if (screen === 'battle') {
      TS.UI.drawBattleHud(ctx, battle, hud, uiClock);
      /* The confirmation replaces the pause panel rather than stacking on it —
         two overlapping dialogs read as a rendering fault. */
      if (paused) { if (!confirming) drawPause(); }
      else if (resultShown) drawResult();
    } else if (screen === 'title') {
      drawTitle();
    } else if (screen === 'select') {
      drawSelect();
    } else if (screen === 'shop') {
      drawShop();
    }

    /* Over the screen beneath, under the buttons drawn next. */
    if (confirming) drawConfirm();

    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].kind !== 'none') buttons[i].draw(ctx);
    }

    if (screen === 'select') drawSelectRows();

    if (ts) ctx.restore();

    if (!pointer.touch && pointer.x > -900) {
      TS.UI.drawCursor(ctx, pointer.x, pointer.y, pointer.hand);
    }
  }

  /* Drawn before any asset exists, so it is entirely procedural. */
  function drawLoading() {
    ctx.fillStyle = '#2d4a3c';
    ctx.fillRect(0, 0, TS.W, TS.H);
    TS.text(ctx, 'TINY SWORDS', TS.W / 2, TS.H / 2 - 120, {
      size: 62, fill: '#f4e4c1', stroke: '#22332b'
    });
    TS.text(ctx, 'LANE SIEGE', TS.W / 2, TS.H / 2 - 56, {
      size: 34, fill: '#9fd4a8', stroke: '#22332b'
    });
    var w = 460, h = 26, x = (TS.W - w) / 2, y = TS.H / 2 + 30;
    ctx.fillStyle = '#22332b';
    TS.roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 15);
    ctx.fill();
    ctx.fillStyle = '#4a6b56';
    TS.roundRect(ctx, x, y, w, h, 13);
    ctx.fill();
    ctx.save();
    TS.roundRect(ctx, x, y, w, h, 13);
    ctx.clip();
    ctx.fillStyle = '#ffd257';
    ctx.fillRect(x, y, w * loadProgress, h);
    ctx.restore();
    TS.text(ctx, Math.round(loadProgress * 100) + '%', TS.W / 2, y + h + 40, {
      size: 24, fill: '#f4e4c1', stroke: '#22332b'
    });
  }

  function drawError() {
    ctx.fillStyle = '#3a1f1f';
    ctx.fillRect(0, 0, TS.W, TS.H);
    TS.text(ctx, 'Assets failed to load', TS.W / 2, 200, {
      size: 40, fill: '#ffd0c0', stroke: '#2a1010'
    });
    TS.text(ctx, 'Serve the folder over http:// and check these paths:',
      TS.W / 2, 260, { size: 20, fill: '#ffd0c0', stroke: '#2a1010' });
    var list = TS.loadFailures();
    for (var i = 0; i < Math.min(list.length, 22); i++) {
      TS.text(ctx, list[i], 24, 330 + i * 30, {
        size: 17, fill: '#ffe9e0', stroke: null, align: 'left'
      });
    }
  }

  /* Knights and goblins squared up on the sand behind the title. */
  function buildTitleUnits() {
    var rnd = TS.rng(77);
    titleUnits = [];
    /* Clear of both bases: the castle art ends at x=175, the goblin tower's
       begins at x=701. */
    var picks = [
      ['Warrior', true, 258, 0], ['Pawn', true, 312, 1], ['Archer', true, 366, 2],
      ['Torch', false, 588, 0], ['TNT', false, 534, 1], ['Barrel', false, 480, 2]
    ];
    for (var i = 0; i < picks.length; i++) {
      titleUnits.push({
        cls: picks[i][0],
        flip: !picks[i][1],
        x: picks[i][2],
        y: TS.LAY.lanes[picks[i][3]],
        phase: rnd() * 8
      });
    }
    titleUnits.sort(function (a, b) { return a.y - b.y; });
    /* Built once — allocating bases every frame was pure waste. */
    titleBases = [new TS.Base(true, 1), new TS.Base(false, 1)];
  }

  function drawTitleUnits(dt) {
    var i;
    for (i = 0; i < titleBases.length; i++) {
      titleBases[i].anim += 6 * dt;
      titleBases[i].draw(ctx);
    }
    for (i = 0; i < titleUnits.length; i++) {
      var sr = TS.UNIT_DEFS[titleUnits[i].cls].body * 0.40;
      TS.blobShadow(ctx, titleUnits[i].x, titleUnits[i].y - 3, sr, sr * 0.32, 0.27);
    }
    for (i = 0; i < titleUnits.length; i++) {
      var t = titleUnits[i];
      var spr = TS.SPR.unit[t.cls].idle;
      var fps = TS.UNIT_DEFS[t.cls].fps.idle;
      TS.drawFrame(ctx, spr, ((uiClock + t.phase) * fps) | 0, t.x, t.y, { flip: t.flip });
    }
  }

  function drawTitle() {
    var UI = TS.UI;
    UI.labelRibbon(ctx, 'big', 46, 244, TS.W - 92, UI.PLATE.teal, 'TINY SWORDS',
      { size: 62, stroke: '#25404a' });
    UI.labelRibbon(ctx, 'small', 216, 384, 400, UI.RIB.yellowR, 'LANE SIEGE',
      { size: 32, stroke: '#5a4410' });

    var save = TS.Save.get();
    UI.labelRibbon(ctx, 'small', 196, 1178, 440, UI.RIB.greyR,
      save.cleared + ' / ' + TS.Levels.count + ' battles cleared', { size: 24 });

    TS.text(ctx, TS.Audio.isEnabled() ? 'sound on' : 'sound off', 74, 1414, {
      size: 17, fill: '#e8f0d8', stroke: '#22332b'
    });
    TS.text(ctx, 'reset', TS.W - 74, 1414, {
      size: 17, fill: '#f8d8d0', stroke: '#3a1f1f'
    });
  }

  function drawSelect() {
    var UI = TS.UI;
    ctx.fillStyle = 'rgba(14,22,19,0.52)';
    ctx.fillRect(0, 0, TS.W, TS.H);
    UI.labelRibbon(ctx, 'big', 66, 130, TS.W - 132, UI.PLATE.teal, 'CHOOSE A BATTLE',
      { size: 42, stroke: '#25404a' });
    /* Legend for the sword columns below. Sits in the gap between the ribbon and
       the first row, so it explains the swords before you scan them rather than
       after. The big ribbon art is 103px tall from y130, so it ends at 233 and the
       first row starts at SELECT_TOP (284) — y256 is the clear air between. */
    TS.text(ctx, starRuleText(), TS.W / 2, 256, {
      size: 19, fill: '#e2d6bd', stroke: '#26332c'
    });
  }

  /* Rows are drawn after the buttons so the labels sit on top of the ribbon. */
  function drawSelectRows() {
    var UI = TS.UI;
    for (var i = 0; i < TS.Levels.count; i++) {
      var lv = TS.Levels.get(i);
      var unlocked = TS.Save.isUnlocked(i);
      var b = buttons[i];
      var pressed = b.pressed ? 3 : 0;
      /* Offsetting `top` alone cascades the whole row: the ribbon, both text lines
         and the swords all derive their position from it. */
      var top = b.y + pressed + rowStagger(i);
      /* Big ribbon art is 103px tall, matching the button rect exactly. */
      UI.bigRibbon(ctx, b.x, top, b.w, unlocked ? UI.PLATE.teal : UI.PLATE.black);
      /* Centre of the coloured band, which sits above the geometric middle. */
      var mid = top + UI.ribbonMid('big');
      /* Right limit for content: the end cap is a forked tail that narrows, so
         anything past here hangs off the ribbon rather than sitting on it. */
      var inner = b.x + b.w - UI.ribbonCap('big') - 16;

      ctx.save();
      if (!unlocked) ctx.globalAlpha = 0.72;
      TS.text(ctx, (i + 1) + '.  ' + lv.name, b.x + 118, mid - 13, {
        size: 28, fill: unlocked ? '#fff8e6' : '#c9c9c9',
        stroke: unlocked ? '#264448' : '#2a2a2e', align: 'left'
      });
      TS.text(ctx, lv.objective, b.x + 120, mid + 17, {
        size: 18, fill: unlocked ? '#cfe6dd' : '#a8a8a8',
        stroke: unlocked ? '#223c42' : '#2a2a2e', align: 'left'
      });
      ctx.restore();

      if (unlocked) {
        var stars = TS.Save.stars(i);
        for (var s = 0; s < 3; s++) {
          ctx.save();
          ctx.globalAlpha = s < stars ? 1 : 0.26;
          UI.icon(ctx, 'icon05', inner - 76 + s * 38, mid, 0.5);
          ctx.restore();
        }
      } else {
        UI.icon(ctx, 'icon06', inner - 20, mid, 0.62);
      }
    }
  }

  function drawPause() {
    var d = TS.UI.dialog(ctx, {
      w: 620, h: 600, y: 420, title: 'PAUSED', titleRow: TS.UI.PLATE.teal
    });
    TS.text(ctx, battle.level.name, TS.W / 2, d.y + 112, {
      size: 30, fill: '#5c4632', stroke: null
    });
    TS.text(ctx, TS.Audio.isEnabled() ? 'Sound: on' : 'Sound: off',
      TS.W / 2, d.y + 158, { size: 22, fill: '#7a6248', stroke: null });
  }

  /* Three sword slots that land one at a time, so the rating is something the
     player watches being awarded rather than a number that was already there.
     Empty slots stay visible and dim, which is what makes 2-of-3 read as "one
     more to earn" instead of just "two swords". */
  /* What earns three swords was never stated anywhere: the result panel showed the
     swords and the tower percentage as two unrelated facts, and battle-select showed
     a row of swords with no legend. Built from Save.STAR_AT so the sentence cannot
     drift away from the thresholds it describes, and used by BOTH screens so they
     cannot word it differently. */
  function starRuleText() {
    var at = TS.Save.STAR_AT;
    /* "%+" rather than "above 85%": the test is >=, so 85% exactly earns three and
       "above" would be a lie about the boundary. It is shorter too. */
    return 'Tower ' + Math.round(at[0] * 100) + '%+ = 3 swords   ·   ' +
      Math.round(at[1] * 100) + '%+ = 2';
  }

  /* The swords are the reward, so they are the biggest thing on the panel after
     the title. Everything else here is derived from this one number: the spacing
     has to grow with it or the three collide, and the landing burst and the label
     below have to follow it or they detach from the art.
     Vertical room is the real limit — the stats rows start at d.y+344 and the
     sword row is centred at d.y+256, so the label has to fit in between. */
  var SWORD_SCALE = 0.9;          // icon05 is 64px, so ~58px drawn
  var SWORD_GAP = 104;            // centre to centre; ~46px of air between swords

  function drawAward(d) {
    var UI = TS.UI;
    var cx = d.x + d.w / 2;
    var y = d.y + 256;

    for (var i = 0; i < 3; i++) {
      var x = cx + (i - 1) * SWORD_GAP;
      var earned = i < resultStars;
      /* Progress of this slot's pop, 0 before its turn and 1 once settled. */
      var t = TS.clamp((resultT - STAR_DELAY - i * STAR_GAP) / STAR_POP, 0, 1);

      /* Empty socket, always drawn so the total is legible. */
      ctx.save();
      ctx.globalAlpha = 0.18;
      UI.icon(ctx, 'icon05', x, y, SWORD_SCALE);
      ctx.restore();

      if (!earned || t <= 0) continue;

      /* Overshoot, plus a flash of scale on the first frames, so each sword
         arrives with a bit of weight. Scaled through UI.icon rather than a canvas
         transform: icon05's ink sits 1-2px off-centre in its frame and UI.icon
         corrects for that PROPORTIONALLY to the scale, so wrapping it in a
         transform applied that correction twice and the sword drifted as it grew. */
      var pop = (1.35 - 0.35 * TS.easeOutCubic(t)) * TS.easeOutBack(t);
      UI.icon(ctx, 'icon05', x, y, SWORD_SCALE * pop);

      if (t < 0.5) {
        /* Flash OVER the sword as it lands — drawn after it, despite what this
           comment used to claim. It works because the two are anti-phased: the
           flash is brightest at t=0 when the sword's own scale is still 0, so the
           sword reads as emerging out of it. Sized off SWORD_SCALE so the two stay
           related if the scale is retuned again. */
        ctx.save();
        ctx.globalAlpha = (1 - t * 2) * 0.55;
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(x, y, (26 + t * 34) * (SWORD_SCALE / 0.62), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    var label = resultStars >= 3 ? 'Flawless!'
      : resultStars === 2 ? 'Well fought' : 'Held the line';
    ctx.save();
    ctx.globalAlpha = TS.clamp((resultT - STAR_DELAY - 3 * STAR_GAP) / 0.3, 0, 1);
    TS.text(ctx, label, cx, y + 68, { size: 24, fill: '#6b5238', stroke: null });
    ctx.restore();
  }

  function drawResult() {
    var UI = TS.UI;
    var won = battle.over === 'win';
    var d = UI.dialog(ctx, {
      w: 640, h: 780, y: 336,
      title: won ? 'VICTORY!' : 'DEFEAT',
      titleRow: won ? UI.PLATE.teal : UI.PLATE.red
    });

    if (won) {
      /* Drawn at native 256 rather than scaled down: the portrait only occupies
         about 196x182 of its frame, so shrinking it makes the face unreadable. */
      var avatar = TS.img(TS.avatarKey('Blue', 'Warrior'));
      if (avatar) ctx.drawImage(avatar, Math.round(TS.W / 2 - 128), Math.round(d.y + 16));
      drawAward(d);
    } else {
      /* The Goblin faction ships no portraits, so the victor takes the stage in
         person — a Torch goblin, idling and pleased with itself. */
      var gob = TS.SPR.unit.Torch.idle;
      TS.drawFrame(ctx, gob, (uiClock * 8) | 0, TS.W / 2, d.y + 280,
        { scale: 1.6, flip: true });
    }

    var rows = [
      ['Enemies felled', battle.stats.killed],
      ['Units lost', battle.stats.lost],
      ['Castle remaining',
        Math.round(100 * battle.playerCastle.hp / battle.playerCastle.maxHp) + '%']
    ];
    var ry = d.y + 344;
    for (var i = 0; i < rows.length; i++) {
      TS.text(ctx, rows[i][0], d.x + 74, ry + i * 38, {
        size: 23, fill: '#6b5238', stroke: null, align: 'left'
      });
      TS.text(ctx, rows[i][1], d.x + d.w - 74, ry + i * 38, {
        size: 23, fill: '#3f3020', stroke: null, align: 'right'
      });
    }

    /* The rule, immediately under the "Castle remaining" figure it applies to —
       that adjacency is the whole point, since those two numbers were previously
       shown near each other with nothing to say they were connected. */
    if (won) {
      /* Evenly spaced between the stats block above and the reward below. It used
         to sit 11px under "Castle remaining" but 23px above the coin, which read as
         belonging to the stats rather than standing on its own. There was no room
         to fix by nudging: the block was wedged into a 43px band. The RESULT BUTTONS
         sat at y862 with 134px of panel empty beneath them, so they moved down to
         906 and everything above got real air — about 28px under 'Castle remaining'
         and 21px above the coin. */
      TS.text(ctx, starRuleText(), d.x + d.w / 2, d.y + 462, {
        size: 17, fill: '#8d775c', stroke: null
      });
    }

    if (won) {
      /* Pushed down from 470 to make room for the sword rule above: the coin is
         38px tall around its centre, so at 470 its top edge reached back up into
         the legend's last line.
         Centred as a group, not as an icon at a fixed offset plus centred text —
         that arrangement put the pair 15px left of the panel's middle, the same
         defect a tester found on the summon cards. */
      UI.coinAmount(ctx, '+' + battle.reward, d.x + d.w / 2, d.y + 508, {
        size: 32, scale: 0.6, fill: '#ffd257', stroke: '#5a3a12'
      });
    } else {
      TS.text(ctx, battle.byTimeout ? 'Time ran out.' : 'The castle has fallen.',
        TS.W / 2, d.y + 470, { size: 24, fill: '#7a6248', stroke: null });
    }
  }

  /* Small inspection/driving hook. Kept deliberately narrow — it exposes the
     same operations the UI already performs, so it cannot get the game into a
     state real input could not. */
  TS.dev = {
    get screen() { return screen; },
    get battle() { return battle; },
    get speed() { return speed; },
    get paused() { return paused; },
    get cards() { return hud ? hud.cards.map(function (c) { return c.cls; }) : []; },
    title: goTitle,
    select: goSelect,
    start: startBattle,
    pause: togglePause,
    setSpeed: function (n) { speed = TS.clamp(n | 0, 1, 3); if (hud) hud.speedBtn.label = speed + 'x'; },
    summon: function (cls) { return battle ? battle.trySummon(cls) : false; },
    /* Gold cheat used only to exercise every card in verification. */
    grantGold: function (n) { if (battle) battle.gold = Math.min(battle.goldCap, battle.gold + n); },
    /* Run the simulation as fast as the CPU allows, with no rendering, so a
       whole battle can be balance-tested in a fraction of a second. `policy` is
       invoked about ten times per simulated second to stand in for the player. */
    fastSim: function (seconds, policy) {
      if (!battle) return null;
      var steps = Math.round(seconds / STEP);
      for (var i = 0; i < steps && !battle.over; i++) {
        if (policy && i % 6 === 0) policy();
        battle.update(STEP);
        TS.FX.update(STEP);
      }
      if (battle.over && !resultShown) showResult();
      return TS.dev.counts();
    },
    counts: function () {
      if (!battle) return null;
      var out = { ally: 0, foe: 0, byClass: {} };
      battle.units.forEach(function (u) {
        if (u.dead) return;
        u.isPlayer ? out.ally++ : out.foe++;
        out.byClass[(u.isPlayer ? 'B:' : 'R:') + u.cls] =
          (out.byClass[(u.isPlayer ? 'B:' : 'R:') + u.cls] || 0) + 1;
      });
      out.arrows = battle.projectiles.length;
      out.playerHp = Math.round(battle.playerCastle.hp);
      out.enemyHp = Math.round(battle.enemyCastle.hp);
      out.over = battle.over;
      return out;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.TS);
