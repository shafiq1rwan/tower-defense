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
  var confirmingReset = false;

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
    TS.Terrain.build(1337);
    TS.Scene.build(1337);
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

  function goTitle() {
    screen = 'title';
    paused = false;
    confirmingReset = false;
    battle = null;
    buttons = [
      new TS.UI.Button({
        x: 256, y: 980, w: 320, h: 140, kind: 'big', label: 'PLAY', labelSize: 44,
        onTap: goSelect
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

  function askResetConfirm() {
    confirmingReset = true;
    buttons = [
      new TS.UI.Button({
        x: 130, y: 806, w: 260, h: 126, kind: 'bigRed', label: 'RESET', labelSize: 32,
        onTap: function () {
          TS.Save.reset();
          TS.Save.get();
          goTitle();
        }
      }),
      new TS.UI.Button({
        x: 442, y: 806, w: 260, h: 126, kind: 'big', label: 'CANCEL', labelSize: 30,
        onTap: goTitle
      })
    ];
  }

  function drawResetConfirm() {
    var save = TS.Save.get();
    var d = TS.UI.dialog(ctx, {
      w: 620, h: 480, y: 470, title: 'ARE YOU SURE?', titleRow: TS.UI.PLATE.red
    });
    TS.text(ctx, 'This erases all progress:', TS.W / 2, d.y + 116, {
      size: 26, fill: '#5c4632', stroke: null
    });
    TS.text(ctx, save.cleared + ' of ' + TS.Levels.count + ' battles cleared',
      TS.W / 2, d.y + 166, { size: 24, fill: '#7a6248', stroke: null });
    TS.text(ctx, save.gold + ' gold earned', TS.W / 2, d.y + 206, {
      size: 24, fill: '#7a6248', stroke: null
    });
    TS.text(ctx, 'It cannot be undone.', TS.W / 2, d.y + 262, {
      size: 22, fill: '#9a7a5a', stroke: null
    });
  }

  function goSelect() {
    screen = 'select';
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
      x: 256, y: 1216, w: 320, h: 130, kind: 'bigRed', label: 'BACK', labelSize: 38,
      onTap: goTitle
    }));
  }

  function startBattle(index) {
    battleIndex = index;
    var level = TS.Levels.get(index);
    level.index = index;

    TS.FX.reset();
    battle = new TS.Battle(level);
    /* Fresh scenery seed per battle so the eight levels do not look identical,
       while still being stable across replays of the same one. */
    TS.Terrain.build(1000 + index * 37);
    TS.Scene.build(1000 + index * 37);

    speed = 1;
    paused = false;
    resultShown = false;
    screen = 'battle';

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
    buttons = [hud.pauseBtn, hud.speedBtn];
  }

  function cycleSpeed() {
    speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
    hud.speedBtn.label = speed + 'x';
  }

  function togglePause() {
    paused = !paused;
    if (paused) {
      /* Two rows of two, kept above the banner's 111px rolled bottom edge. */
      buttons = [
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
          onTap: goSelect
        }),
        new TS.UI.Button({
          x: 432, y: 756, w: 250, h: 120, kind: 'big',
          icon: 'icon12', onTap: function () { TS.Audio.toggle(); }
        })
      ];
    } else {
      buttons = [hud.pauseBtn, hud.speedBtn];
    }
  }

  function showResult() {
    resultShown = true;
    var won = battle.over === 'win';
    var hpFrac = battle.playerCastle.hp / battle.playerCastle.maxHp;
    var reward = won ? TS.Levels.reward(battleIndex, hpFrac) : 0;
    battle.reward = reward;
    if (won) TS.Save.recordWin(battleIndex, hpFrac, reward);

    var hasNext = battleIndex + 1 < TS.Levels.count;
    buttons = [];
    if (won && hasNext) {
      buttons.push(new TS.UI.Button({
        x: 146, y: 812, w: 250, h: 120, kind: 'big', label: 'NEXT', labelSize: 32,
        onTap: function () { startBattle(battleIndex + 1); }
      }));
    } else {
      buttons.push(new TS.UI.Button({
        x: 146, y: 812, w: 250, h: 120, kind: 'bigRed', label: 'RETRY', labelSize: 32,
        onTap: function () { startBattle(battleIndex); }
      }));
    }
    buttons.push(new TS.UI.Button({
      x: 436, y: 812, w: 250, h: 120, kind: 'big', label: 'MAP', labelSize: 32,
      onTap: goSelect
    }));
  }

  /* ------------------------------------------------------------------ loop -- */

  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    uiClock += dt;
    lastDt = dt;

    if (screen === 'battle' && !paused) {
      acc += dt * speed;
      var steps = 0;
      while (acc >= STEP && steps < 12) { simulate(STEP); acc -= STEP; steps++; }
      if (acc > STEP * 12) acc = 0;
    } else {
      acc = 0;
      if (screen === 'title' || screen === 'select') TS.Scene.update(dt);
    }

    if (hud) {
      for (var i = 0; i < hud.cards.length; i++) hud.cards[i].update(dt);
      if (hud.hintT > 0) hud.hintT -= dt;
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
    ctx.restore();

    if (screen === 'battle') {
      TS.UI.drawBattleHud(ctx, battle, hud, uiClock);
      if (paused) drawPause();
      else if (resultShown) drawResult();
    } else if (screen === 'title') {
      drawTitle();
      if (confirmingReset) drawResetConfirm();
    } else if (screen === 'select') {
      drawSelect();
    }

    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].kind !== 'none') buttons[i].draw(ctx);
    }

    if (screen === 'select') drawSelectRows();

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
  }

  /* Rows are drawn after the buttons so the labels sit on top of the ribbon. */
  function drawSelectRows() {
    var UI = TS.UI;
    for (var i = 0; i < TS.Levels.count; i++) {
      var lv = TS.Levels.get(i);
      var unlocked = TS.Save.isUnlocked(i);
      var b = buttons[i];
      var pressed = b.pressed ? 3 : 0;
      var top = b.y + pressed;
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

  function drawResult() {
    var UI = TS.UI;
    var won = battle.over === 'win';
    var d = UI.dialog(ctx, {
      w: 640, h: 700, y: 360,
      title: won ? 'VICTORY!' : 'DEFEAT',
      titleRow: won ? UI.PLATE.teal : UI.PLATE.red
    });

    if (won) {
      /* Drawn at native 256 rather than scaled down: the portrait only occupies
         about 196x182 of its frame, so shrinking it makes the face unreadable. */
      var avatar = TS.img(TS.avatarKey('Blue', 'Warrior'));
      if (avatar) ctx.drawImage(avatar, Math.round(TS.W / 2 - 128), Math.round(d.y + 34));
    } else {
      /* The Goblin faction ships no portraits, so the victor takes the stage in
         person — a Torch goblin, idling and pleased with itself. */
      var gob = TS.SPR.unit.Torch.idle;
      TS.drawFrame(ctx, gob, (uiClock * 8) | 0, TS.W / 2, d.y + 250,
        { scale: 1.6, flip: true });
    }

    var rows = [
      ['Enemies felled', battle.stats.killed],
      ['Units lost', battle.stats.lost],
      ['Castle remaining',
        Math.round(100 * battle.playerCastle.hp / battle.playerCastle.maxHp) + '%']
    ];
    var ry = d.y + 280;
    for (var i = 0; i < rows.length; i++) {
      TS.text(ctx, rows[i][0], d.x + 74, ry + i * 38, {
        size: 23, fill: '#6b5238', stroke: null, align: 'left'
      });
      TS.text(ctx, rows[i][1], d.x + d.w - 74, ry + i * 38, {
        size: 23, fill: '#3f3020', stroke: null, align: 'right'
      });
    }

    if (won) {
      UI.icon(ctx, 'icon03', d.x + d.w / 2 - 62, ry + 132, 0.6);
      TS.text(ctx, '+' + battle.reward, d.x + d.w / 2 + 26, ry + 133, {
        size: 32, fill: '#ffd257', stroke: '#5a3a12'
      });
    } else {
      TS.text(ctx, battle.byTimeout ? 'Time ran out.' : 'The castle has fallen.',
        TS.W / 2, ry + 130, { size: 24, fill: '#7a6248', stroke: null });
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
