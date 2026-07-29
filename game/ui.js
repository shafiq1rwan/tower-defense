/* ui.js — widgets built from the pack's 9-slice kit, plus the battle HUD.
 *
 * HP bars are drawn rather than sliced from the pack's Bars sheet: the
 * reference's own bars are flat outlined rectangles, and hand-drawing them is
 * what allows the smooth drain and team colouring. The pack's BigBar, whose
 * wooden look actually earns its keep, carries the gold meter.
 */
(function (TS) {
  'use strict';

  var UI = {};
  TS.UI = UI;

  /* Buttons in the pack's 128px frames carry ~20px of transparent padding, so the
     visible art is about 88x94. Rects below are that art box; the sheet is drawn
     offset by the padding.
     FACE_CY is where a glyph belongs: the raised face is bracketed by light rim
     rows at art y19-21 and y97-100, centring it on art y59 — but the art box runs
     to y110 because of the 3D base lip below, so its own centre (y64) sits 5px too
     low and made every label look off. Both the square and round buttons share
     this construction. */
  var BTN_PAD_X = 20, BTN_PAD_Y = 17;
  UI.ICON_BTN = { w: 88, h: 94 };
  var FACE_CY = 59 - BTN_PAD_Y;      // 42px below the rect's top
  var FACE_CY_PRESSED = FACE_CY + 7; // pressed art is squashed and sits lower

  /* Ribbon rows: 5 colours x 2 tail styles (forked, rounded). */
  UI.RIB = { tealR: 1, redR: 3, yellowR: 5, purpleR: 7, greyR: 9 };
  /* Swords / BigRibbons rows: teal, red, yellow, purple, black. */
  UI.PLATE = { teal: 0, red: 1, yellow: 2, purple: 3, black: 4 };

  /* ------------------------------------------------------------- widgets -- */

  /* Panel kinds. `bg` backs the interior with a solid colour sampled from the
     sheet, so nothing can ever show through.
     NOTE: the pack's *_Slots.png files are NOT tileable fills — each has a ~12px
     transparent border, so tiling one leaves a grid of see-through gutters. They
     are single decorative inset plates. The interior is filled from the sheet's
     own centre cell, which is fully opaque. */
  var PANEL = {
    wood: { img: 'wood', spec: 'wood', bg: '#7e5752' },
    banner: { img: 'banner', spec: 'banner', bg: '#cbb28d' },
    paper: { img: 'paper', spec: 'paper', bg: '#eaddbd' },
    paperSpecial: { img: 'paperSpecial', spec: 'paperSp', bg: '#e8dcc0' }
  };

  UI.panel = function (ctx, kind, x, y, w, h) {
    var p = PANEL[kind] || PANEL.paper;
    var spec = TS.SLICE[p.spec];
    /* Back only the interior: the outer slices are opaque art, and the region
       outside them may be transparent by design (the banner's scroll shape). */
    var lw = spec.w[0], rw = spec.w[2], th = spec.h[0], bh = spec.h[2];
    var iw = Math.round(w) - lw - rw, ih = Math.round(h) - th - bh;
    if (iw > 0 && ih > 0) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(Math.round(x) + lw, Math.round(y) + th, iw, ih);
    }
    TS.nineSlice(ctx, TS.img(p.img), spec, x, y, w, h);
  };


  /* Each returns the drawn height, so callers centre labels off the real art
     rather than off an assumed cell size. */
  UI.smallRibbon = function (ctx, x, y, w, row) {
    return TS.threeSlice(ctx, TS.img('ribbonsSmall'), TS.THREE.ribbonS, x, y, w, row);
  };
  UI.bigRibbon = function (ctx, x, y, w, row) {
    return TS.threeSlice(ctx, TS.img('ribbonsBig'), TS.THREE.ribbonB, x, y, w, row);
  };
  UI.swordPlate = function (ctx, x, y, w, row) {
    return TS.threeSlice(ctx, TS.img('swords'), TS.THREE.swords, x, y, w, row);
  };

  /* Vertical centre of a ribbon's coloured band, in destination pixels from its
     top. Use this rather than half the drawn height — the dark rim and drop
     shadow along the lower edge push the band well above the geometric middle. */
  UI.ribbonMid = function (kind) {
    return (kind === 'big' ? TS.THREE.ribbonB : TS.THREE.ribbonS).labelCy;
  };
  /* Width of the forked end cap; keep icons left of it. */
  UI.ribbonCap = function (kind) {
    return (kind === 'big' ? TS.THREE.ribbonB : TS.THREE.ribbonS).capW;
  };

  /* Ribbon with a centred label — the common case, and it keeps the vertical
     centring in one place. */
  UI.labelRibbon = function (ctx, kind, x, y, w, row, label, o) {
    var h = kind === 'big' ? UI.bigRibbon(ctx, x, y, w, row)
      : UI.smallRibbon(ctx, x, y, w, row);
    if (label != null) {
      o = o || {};
      TS.text(ctx, label, o.tx == null ? x + w / 2 : o.tx, y + UI.ribbonMid(kind), {
        size: o.size || 26, fill: o.fill || '#fff8e6', stroke: o.stroke || '#2a2a2e',
        align: o.align
      });
    }
    return h;
  };

  /* Nudges that centre each icon on its ARTWORK rather than on its 64px frame.
     Measured ink centres, e.g. Icon_03's sits at 31,30 — small, but enough to
     read as off-centre inside a button. */
  var ICON_NUDGE = {
    icon03: [1, 2], icon05: [1, 0], icon06: [1, 0],
    icon09: [1, 0], icon12: [-1, 0]
  };

  /* Icon at native 64px, optionally scaled about its centre. */
  UI.icon = function (ctx, key, cx, cy, scale) {
    var img = TS.img(key);
    if (!img) return;
    var s = scale || 1;
    var n = ICON_NUDGE[key];
    if (n) { cx += n[0] * s; cy += n[1] * s; }
    var w = img.width * s, h = img.height * s;
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2),
      Math.round(w), Math.round(h));
  };

  /* An icon and a number as one group centred on (cx, cy). Used for every purse
     and price in the game: centring the pair keeps the icon clear of a ribbon's
     tail and stays balanced whether the value is 72 or 1416. */
  UI.coinAmount = function (ctx, value, cx, cy, o) {
    o = o || {};
    var size = o.size || 27;
    var scale = o.scale || 0.72;
    var key = o.icon || 'icon03';
    var txt = String(value);
    var iw = 64 * scale;
    var lw = TS.textWidth(ctx, txt, size);
    var half = (iw + lw) / 2;
    UI.icon(ctx, key, cx - half + iw / 2, cy, scale);
    TS.text(ctx, txt, cx - half + iw, cy, {
      size: size, fill: o.fill || '#fff8e6', stroke: o.stroke || '#3a2418',
      align: 'left'
    });
  };

  /* --------------------------------------------------------------- button -- */

  function Button(o) {
    this.x = o.x; this.y = o.y;
    this.w = o.w == null ? UI.ICON_BTN.w : o.w;
    this.h = o.h == null ? UI.ICON_BTN.h : o.h;
    this.kind = o.kind || 'sqBlue';   // sqBlue | sqRed | rndBlue | big | bigRed
    this.label = o.label;
    this.icon = o.icon;
    this.iconScale = o.iconScale || 1;
    this.labelSize = o.labelSize || 30;
    this.onTap = o.onTap;
    this.enabled = o.enabled !== false;
    this.pressed = false;
    this.id = o.id;
  }
  UI.Button = Button;

  Button.prototype.contains = function (px, py) {
    return this.enabled &&
      px >= this.x && px <= this.x + this.w &&
      py >= this.y && py <= this.y + this.h;
  };

  Button.prototype.draw = function (ctx) {
    var k = this.kind;
    var down = this.pressed;
    var cx = this.x + this.w / 2;
    var cy;

    if (k === 'big' || k === 'bigRed') {
      var img = TS.img(k === 'big'
        ? (down ? 'btnBluePressed' : 'btnBlue')
        : (down ? 'btnRedPressed' : 'btnRed'));
      /* Each state gets its OWN measured metrics. The pressed sheet is squashed
         with a thinner top rim, so it is also drawn a few pixels shorter and
         lower — that, not a blanket offset, is what reads as "pushed in". */
      if (down) {
        TS.nineSlice(ctx, img, TS.SLICE.buttonDown,
          this.x, this.y + 6, this.w, this.h - 6);
        cy = this.y + this.h / 2 + 4;
      } else {
        TS.nineSlice(ctx, img, TS.SLICE.button, this.x, this.y, this.w, this.h);
        /* Nudged up 2px because the bottom lip is the thicker slice. */
        cy = this.y + this.h / 2 - 2;
      }
    } else {
      var map = {
        sqBlue: ['sqBlue', 'sqBluePressed'],
        sqRed: ['sqRed', 'sqRedPressed'],
        rndBlue: ['rndBlue', 'rndBluePressed']
      }[k] || ['sqBlue', 'sqBluePressed'];
      var im = TS.img(down ? map[1] : map[0]);
      if (im) ctx.drawImage(im, Math.round(this.x - BTN_PAD_X), Math.round(this.y - BTN_PAD_Y));
      cy = this.y + (down ? FACE_CY_PRESSED : FACE_CY);
    }
    /* Icon and label together lay out side by side as one centred group, rather
       than both being drawn at the same point on top of each other. */
    if (this.icon && this.label != null) {
      var iw = 64 * this.iconScale;
      var lw = TS.textWidth(ctx, this.label, this.labelSize);
      var half = (iw + lw) / 2;
      UI.icon(ctx, this.icon, cx - half + iw / 2, cy, this.iconScale);
      TS.text(ctx, this.label, cx - half + iw, cy, {
        size: this.labelSize, fill: '#fff8e6', stroke: '#2f4b52', align: 'left'
      });
    } else if (this.icon) {
      UI.icon(ctx, this.icon, cx, cy, this.iconScale);
    } else if (this.label != null) {
      TS.text(ctx, this.label, cx, cy, {
        size: this.labelSize, fill: '#fff8e6', stroke: '#2f4b52'
      });
    }
    if (!this.enabled) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#20302b';
      TS.roundRect(ctx, this.x - 4, this.y - 4, this.w + 8, this.h + 8, 14);
      ctx.fill();
      ctx.restore();
    }
  };

  UI.hit = function (list, px, py) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].contains(px, py)) return list[i];
    }
    return null;
  };

  /* ----------------------------------------------------------------- bars -- */

  var BAR_OUTLINE = '#31211a';
  var BAR_TRACK = '#57402f';

  function bar(ctx, x, y, w, h, frac, fill, hi) {
    frac = TS.clamp(frac, 0, 1);
    ctx.fillStyle = BAR_OUTLINE;
    TS.roundRect(ctx, x - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
    ctx.fill();
    ctx.fillStyle = BAR_TRACK;
    TS.roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (frac <= 0) return;
    var fw = Math.max(h, w * frac);
    ctx.save();
    TS.roundRect(ctx, x, y, w, h, h / 2);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, fw, h);
    /* Highlight along the top third sells the bar as rounded. */
    ctx.fillStyle = hi;
    ctx.fillRect(x, y, fw, Math.max(1, h * 0.34));
    ctx.restore();
  }

  var ALLY = ['#4fc44f', '#8ff08f'];
  var FOE = ['#e0503f', '#f79180'];

  TS.drawUnitBar = function (ctx, x, y, w, h, frac, isPlayer) {
    var c = isPlayer ? ALLY : FOE;
    bar(ctx, x, y, w, h, frac, c[0], c[1]);
  };

  /* Base bar plus its numeric HP.
     Sized against the BUILDING, not the screen: both bases are only ~113px of
     visible art, so the original 160x20 bar and 34px number towered over them.
     Kept above the building rather than below it — the strip beneath is where the
     front depth row walks, and a bar there would sit among the units. */
  UI.castleBar = function (ctx, castle) {
    var w = 108, h = 14;
    /* Keep the bar on screen even when the building sits near the edge. */
    var cx = TS.clamp(castle.x, 16 + w / 2, TS.W - 16 - w / 2);
    var x = Math.round(cx - w / 2);
    /* Clear of the taller of the two: the tower reaches 182px above its foot
       line, which sits on the middle depth row at y835. */
    var y = 630;
    var frac = castle.barHp / castle.maxHp;
    var c = castle.isPlayer ? ALLY : FOE;
    TS.text(ctx, Math.ceil(castle.hp), cx, y - 18, {
      size: 25, fill: '#fff8e6', stroke: '#3a2418'
    });
    bar(ctx, x, y, w, h, frac, c[0], c[1]);
  };

  /* Gold meter: the pack's wooden BigBar frame with the fill painted on top of
     its recessed track. The pack's own BigBar_Fill is crimson — a health-bar
     fill — so gold is drawn rather than sliced. The frame's art band is 51px
     tall and the recess sits between its inner rules at offsets 12 and 35. */
  UI.goldBar = function (ctx, x, y, w, frac) {
    TS.threeSlice(ctx, TS.img('barBig'), TS.THREE.barBig, x, y, w);

    frac = TS.clamp(frac, 0, 1);
    var tx = x + 20, tw = w - 40, ty = y + 12, th = 23;
    var fw = Math.round(tw * frac);
    if (fw <= 0) return;
    ctx.save();
    TS.roundRect(ctx, tx, ty, tw, th, th / 2);
    ctx.clip();
    var g = ctx.createLinearGradient(0, ty, 0, ty + th);
    g.addColorStop(0, '#ffe487');
    g.addColorStop(0.45, '#ffc12e');
    g.addColorStop(1, '#e08a15');
    ctx.fillStyle = g;
    ctx.fillRect(tx, ty, fw, th);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(tx, ty, fw, 5);
    ctx.restore();
  };

  /* ---------------------------------------------------------------- cards -- */

  function Card(cls, cx, cy, w, h) {
    this.cls = cls;
    this.def = TS.UNIT_DEFS[cls];
    this.x = cx; this.y = cy; this.w = w; this.h = h;
    this.pressed = false;
    this.flashT = 0;      // brief glow after a successful summon
    this.denyT = 0;       // shake after a failed tap
    this.wasReady = false;
    this.readyT = 0;      // one-shot ring the instant the card becomes playable
  }
  UI.Card = Card;

  Card.prototype.contains = function (px, py) {
    return px >= this.x && px <= this.x + this.w &&
      py >= this.y && py <= this.y + this.h;
  };

  var READY_POP = 0.45;

  Card.prototype.update = function (dt) {
    if (this.flashT > 0) this.flashT -= dt;
    if (this.denyT > 0) this.denyT -= dt;
    if (this.readyT > 0) this.readyT -= dt;
  };

  /* The Lancer's 320px frame needs scaling down to fit a card; everyone else
     sits at native size. */
  var CARD_ART_SCALE = { Lancer: 0.66 };
  var CARD_R = 13;

  Card.prototype.draw = function (ctx, battle, clock, fieldFull) {
    var cd = battle.cooldowns[this.cls] || 0;
    var cdMax = TS.cardCooldown(this.cls);
    var affordable = battle.gold >= this.def.cost;
    var ready = cd <= 0 && affordable && !fieldFull;
    var w = this.w, h = this.h;

    /* Fire a one-shot ring on the RISING EDGE of readiness. The steady rim below
       says a card is playable; it does not catch the eye at the moment it becomes
       playable, which is exactly when there is a decision to make. Detected here
       because this is where `ready` is derived — the timer itself decays in
       update() on the real-time UI clock, so it stays calm at 2x and 3x. */
    if (ready && !this.wasReady) this.readyT = READY_POP;
    this.wasReady = ready;

    var ox = 0, oy = this.pressed ? 4 : 0;
    if (this.denyT > 0) ox = Math.sin(this.denyT * 58) * this.denyT * 22;
    var x = Math.round(this.x + ox), y = Math.round(this.y + oy);

    /* Everything inside the card is clipped to one rounded rect, so the paper,
       art, cost strip and cooldown all share the same silhouette. */
    ctx.save();
    TS.roundRect(ctx, x, y, w, h, CARD_R);
    ctx.clip();

    UI.panel(ctx, 'paper', x, y, w, h);

    /* Animated idle art, so the bar feels alive rather than a static row. */
    var spr = TS.SPR.unit[this.cls].idle;
    var fps = this.def.fps.idle;
    TS.drawFrame(ctx, spr, (clock * fps) | 0, x + w / 2, y + h - 50,
      { scale: CARD_ART_SCALE[this.cls] || 1 });

    /* Cost strip along the bottom, as in the reference.
       The coin and the number are centred as ONE GROUP via coinAmount. Placing
       them separately — an icon pinned at x+30 and the number centred on the card
       — put the pair's real centre 14px left of the card's, which is what a tester
       spotted as "the number used for spawn is not centred". Same bug, and same
       fix, as the HUD purse and the Barracks price plates. */
    var sh = 40;
    ctx.fillStyle = '#4a3324';
    ctx.fillRect(x, y + h - sh, w, sh);
    UI.coinAmount(ctx, this.def.cost, x + w / 2, y + h - sh / 2, {
      size: 26, scale: 0.44,
      fill: affordable ? '#ffd257' : '#ff8f7a', stroke: '#241812'
    });

    /* Recharge reads as the card filling from the bottom. A radial sweep looks
       wrong on a rectangle; a linear one tracks the card's shape. */
    if (cd > 0) {
      var oh = Math.round(h * (cd / cdMax));
      ctx.fillStyle = 'rgba(24,34,29,0.55)';
      ctx.fillRect(x, y, w, oh);
      ctx.fillStyle = 'rgba(255,232,150,0.45)';
      ctx.fillRect(x, y + oh - 2, w, 2);
    } else if (!affordable || fieldFull) {
      ctx.fillStyle = 'rgba(24,34,29,0.38)';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();

    /* Border outside the clip so it stays a crisp full-weight line. */
    ctx.strokeStyle = '#3b2a1c';
    ctx.lineWidth = 3;
    TS.roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, CARD_R - 1);
    ctx.stroke();

    if (cd > 0) {
      TS.text(ctx, Math.ceil(cd), x + w / 2, y + h / 2 - 14, {
        size: 42, fill: '#fff8e6', stroke: '#26332c'
      });
    }

    /* Warm rim on cards you can actually play right now. */
    if (ready) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.32 * Math.sin(clock * 4);
      ctx.strokeStyle = '#ffd257';
      ctx.lineWidth = 3;
      TS.roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, CARD_R - 1);
      ctx.stroke();
      ctx.restore();
    }
    if (this.flashT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.flashT * 2.6);
      ctx.fillStyle = '#fff8e6';
      TS.roundRect(ctx, x, y, w, h, CARD_R);
      ctx.fill();
      ctx.restore();
    }

    /* Ring expanding outward past the card's edge, so it reads even when five
       cards sit shoulder to shoulder. Drawn outside the rounded clip above. */
    if (this.readyT > 0) {
      var k = 1 - this.readyT / READY_POP;
      var grow = 15 * TS.easeOutCubic(k);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = 3.5;
      TS.roundRect(ctx, x + 1.5 - grow, y + 1.5 - grow,
        w - 3 + grow * 2, h - 3 + grow * 2, CARD_R - 1 + grow);
      ctx.stroke();
      ctx.restore();
    }
  };

  /* Lay out the available cards, centred, inside the wood panel. */
  UI.layoutCards = function (level) {
    var list = level.cards;
    var n = list.length;
    var cw = 150, ch = 174, gap = 12;
    var total = n * cw + (n - 1) * gap;
    var x0 = Math.round((TS.W - total) / 2);
    var y = 1284;
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(new Card(list[i], x0 + i * (cw + gap), y, cw, ch));
    }
    return out;
  };

  /* ------------------------------------------------------------ battle HUD -- */

  function fmtTime(t) {
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  UI.drawBattleHud = function (ctx, battle, ui, clock) {
    var save = TS.Save.get();

    /* --- bottom panel -------------------------------------------------- */
    /* Deliberately oversized so its corner brackets and bottom rail are cropped
       by the screen edges, reading as attached rather than floating. */
    UI.panel(ctx, 'wood', -30, 1190, TS.W + 60, 350);

    /* Bar art is 51px tall, so it occupies 1204-1255, leaving a clear band at
       1272 for the status line above the cards at 1284. */
    UI.goldBar(ctx, 96, 1204, 690, battle.gold / battle.goldCap);
    UI.icon(ctx, 'icon03', 54, 1236, 0.86);
    /* Sized and placed to sit INSIDE the bar's recessed channel, not on its frame.
       The BigBar art is 51px tall but the fill track is only 23 of that, starting
       12px down — so a size-28 label centred on 1237 was both taller than the
       channel and hanging ~12px out of its bottom. Centre on the track's middle
       and size to fit it. GOLD_TRACK mirrors the numbers in UI.goldBar; changing
       one without the other puts the label back outside the bar. */
    var trackMid = 1204 + 12 + 23 / 2;
    TS.text(ctx, Math.floor(battle.gold) + ' / ' + battle.goldCap, 441, trackMid, {
      size: 22, fill: '#fff8e6', stroke: '#3a2418'
    });

    var full = battle.isFull(true);
    for (var i = 0; i < ui.cards.length; i++) ui.cards[i].draw(ctx, battle, clock, full);

    /* One shared line above the cards. The army cap is a real constraint, so it
       takes priority; otherwise show what the unit you just played actually
       does, which is how the roster teaches itself. */
    if (full) {
      TS.text(ctx, 'ARMY FULL', TS.W / 2, 1272, {
        size: 21, fill: '#ffcf6b', stroke: '#3a2418'
      });
    } else if (ui.hintT > 0 && ui.hint) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, ui.hintT * 2);
      TS.text(ctx, ui.hint, TS.W / 2, 1272, {
        size: 20, fill: '#e9dcbb', stroke: '#3a2418'
      });
      ctx.restore();
    }

    /* --- top row ------------------------------------------------------- */
    /* Content sits on the ribbon's coloured band, not its geometric middle, and
       each icon+number pair is centred as a group so the icon never rides up on
       the ribbon's tail. */
    var ribMid = 40 + UI.ribbonMid('small');
    UI.smallRibbon(ctx, 18, 40, 210, UI.RIB.tealR);
    UI.coinAmount(ctx, save.gold, 123, ribMid, { size: 27, stroke: '#264448' });

    UI.smallRibbon(ctx, 240, 40, 176, UI.RIB.yellowR);
    UI.coinAmount(ctx, save.wins, 328, ribMid, {
      size: 27, stroke: '#5a4410', icon: 'icon05'
    });

    TS.text(ctx, 'Battle ' + (battle.level.index + 1), 676, 68, {
      size: 34, fill: '#fff8e6', stroke: '#3a2418', align: 'right'
    });
    ui.pauseBtn.draw(ctx);

    /* --- objective + speed -------------------------------------------- */
    ui.speedBtn.draw(ctx);
    /* Counts down, and goes red in the last 30 seconds. */
    var left = battle.timeLeft();
    TS.text(ctx, fmtTime(left), 78, 256, {
      size: 22, fill: left <= 30 ? '#ff9a86' : '#fff8e6', stroke: '#3a2418'
    });

    UI.labelRibbon(ctx, 'small', 178, 165, 636, UI.RIB.greyR, battle.level.objective);

    /* --- castle bars --------------------------------------------------- */
    UI.castleBar(ctx, battle.playerCastle);
    UI.castleBar(ctx, battle.enemyCastle);
  };

  /* --------------------------------------------------------------- cursor -- */

  UI.drawCursor = function (ctx, x, y, hand) {
    var img = TS.img(hand ? 'cursorHand' : 'cursor');
    if (img) ctx.drawImage(img, Math.round(x), Math.round(y));
  };

  /* --------------------------------------------------------------- dialog -- */

  /* Parchment dialog used by the victory, defeat and pause screens. */
  UI.dialog = function (ctx, o) {
    var w = o.w || 620, h = o.h || 520;
    var x = Math.round((TS.W - w) / 2);
    var y = Math.round(o.y == null ? (TS.H - h) / 2 : o.y);

    ctx.fillStyle = 'rgba(14,22,19,' + (o.dim == null ? 0.6 : o.dim) + ')';
    ctx.fillRect(0, 0, TS.W, TS.H);

    UI.panel(ctx, 'banner', x, y, w, h);
    if (o.title) {
      /* Big ribbon art is 103px tall; straddle it across the panel's top edge. */
      UI.labelRibbon(ctx, 'big', x + 30, y - 52, w - 60,
        o.titleRow == null ? UI.PLATE.teal : o.titleRow, o.title,
        { size: 44, stroke: '#2c2a3a' });
    }
    return { x: x, y: y, w: w, h: h };
  };

})(window.TS);
