/* gfx.js — rendering primitives.
 *
 * Everything else in the game draws through these helpers rather than calling
 * drawImage directly. Two rules matter:
 *   1. Sprites are positioned by their ANCHOR (feet for units), not top-left.
 *   2. The pack's UI sheets are 9-slice / 3-slice atlases with deliberate
 *      transparent gutters. Only cells 0, 2, 4 on each axis carry art.
 */
window.TS = window.TS || {};
(function (TS) {
  'use strict';

  /* Logical resolution: 13 x 23 tiles of 64px, ~9:16. All art draws at 1:1
     native scale and the whole canvas is upscaled once, which is what keeps
     the pixel art crisp. */
  TS.W = 832;
  TS.H = 1472;
  TS.TILE = 64;

  /* ---------------------------------------------------------------- math -- */

  TS.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  TS.lerp = function (a, b, t) { return a + (b - a) * t };
  TS.approach = function (v, target, rate) {
    return v < target ? Math.min(target, v + rate) : Math.max(target, v - rate);
  };
  /* Ease used for pops and overlay slides. */
  TS.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  TS.easeOutBack = function (t) {
    var c = 1.70158 + 1;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };

  /* Seeded RNG so scenery layout is identical every load — a battle should
     look the same each time you replay it. */
  TS.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------------------------------------- sprites -- */

  /* A sprite is one horizontal run of frames. ax/ay is the anchor inside a frame.
     `row` selects a row of a multi-row sheet — the Goblin troops and the Dead
     effect ship as grids rather than single strips, and a row may use fewer
     columns than the sheet is wide. */
  /* `cols` lets an animation WRAP across rows — the Dead effect is 14 frames laid
     out 7 wide over two rows. Defaults to `count`, i.e. a single row. */
  TS.sprite = function (img, fw, fh, count, ax, ay, row, cols) {
    return {
      img: img,
      fw: fw,
      fh: fh,
      count: count,
      row: row || 0,
      cols: cols || count,
      ax: ax == null ? fw / 2 : ax,
      ay: ay == null ? fh : ay
    };
  };

  /* Units in this pack only face right, so every sheet gets mirrored once at
     first use and cached. Cheaper and less error-prone than per-draw
     ctx.scale(-1, 1), and it keeps anchor math in one place. */
  var mirrorCache = new WeakMap();
  function mirrored(img) {
    var c = mirrorCache.get(img);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.translate(img.width, 0);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0);
    mirrorCache.set(img, c);
    return c;
  }
  TS.mirrored = mirrored;

  /* Scratch buffer for silhouette tinting (hit flashes). Sized to the largest
     frame in the pack (the Lancer's 320x320). */
  var scratch = document.createElement('canvas');
  scratch.width = 320;
  scratch.height = 320;
  var sctx = scratch.getContext('2d');
  sctx.imageSmoothingEnabled = false;

  /* Draw one frame. `x,y` is the anchor point.
     opts: flip, alpha, scale, scaleX, scaleY, rot, flash (0..1), flashColor */
  TS.drawFrame = function (ctx, spr, frame, x, y, opts) {
    var o = opts || {};
    var n = spr.count;
    var f = ((frame | 0) % n + n) % n;
    var fw = spr.fw, fh = spr.fh;
    var flip = !!o.flip;
    var img = flip ? mirrored(spr.img) : spr.img;
    /* Grid position, wrapping to the next row every `cols` frames. On the
       mirrored copy, source column c lives at (cols-1-c), which is what
       img.width - (col+1)*fw evaluates to — correct even when a row uses fewer
       columns than the sheet is wide. */
    var perRow = spr.cols || n;
    var col = f % perRow;
    var sx = flip ? img.width - (col + 1) * fw : col * fw;
    var sy = ((spr.row || 0) + Math.floor(f / perRow)) * fh;
    var ax = flip ? fw - spr.ax : spr.ax;
    var ay = spr.ay;

    var sc = o.scale == null ? 1 : o.scale;
    var sxScale = (o.scaleX == null ? 1 : o.scaleX) * sc;
    var syScale = (o.scaleY == null ? 1 : o.scaleY) * sc;
    var alpha = o.alpha == null ? 1 : o.alpha;
    if (alpha <= 0) return;

    var plain = sxScale === 1 && syScale === 1 && !o.rot;
    var dx, dy, dw = fw * sxScale, dh = fh * syScale;

    if (alpha !== 1) ctx.globalAlpha = alpha;

    if (plain) {
      /* Fast path: integer-aligned blit, no transform. */
      dx = Math.round(x - ax);
      dy = Math.round(y - ay);
      ctx.drawImage(img, sx, sy, fw, fh, dx, dy, fw, fh);
    } else {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (o.rot) ctx.rotate(o.rot);
      ctx.drawImage(img, sx, sy, fw, fh, -ax * sxScale, -ay * syScale, dw, dh);
      ctx.restore();
    }

    /* Silhouette overlay for hit flashes / heal glows. */
    if (o.flash > 0) {
      sctx.clearRect(0, 0, fw, fh);
      sctx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);
      sctx.globalCompositeOperation = 'source-atop';
      sctx.fillStyle = o.flashColor || '#ffffff';
      sctx.fillRect(0, 0, fw, fh);
      sctx.globalCompositeOperation = 'source-over';

      ctx.globalAlpha = alpha * TS.clamp(o.flash, 0, 1);
      if (plain) {
        ctx.drawImage(scratch, 0, 0, fw, fh, dx, dy, fw, fh);
      } else {
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        if (o.rot) ctx.rotate(o.rot);
        ctx.drawImage(scratch, 0, 0, fw, fh, -ax * sxScale, -ay * syScale, dw, dh);
        ctx.restore();
      }
    }

    if (ctx.globalAlpha !== 1) ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------------- tiling -- */

  /* Tile a source region across a destination rect, clipping partial tiles by
     shrinking the source read rather than scaling. */
  function tile(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;
    for (var y = 0; y < dh; y += sh) {
      var h = Math.min(sh, dh - y);
      for (var x = 0; x < dw; x += sw) {
        var w = Math.min(sw, dw - x);
        ctx.drawImage(img, sx, sy, w, h, dx + x, dy + y, w, h);
      }
    }
  }
  TS.tile = tile;

  /* MEASURED slice metrics.
   *
   * The pack's UI sheets place each slice's art INSET inside its 64/128 cell —
   * the top-left corner of RegularPaper, for example, only starts at x12,y20 of
   * its cell. Slicing on the cell grid therefore leaves transparent gaps right
   * through the middle of every panel. These numbers are the actual art bounds,
   * scanned from the sheets:
   *   x/w = source X and width of the [left, middle, right] columns
   *   y/h = source Y and height of the [top, middle, bottom] rows
   * The middle entries are the tileable ones. Minimum panel size is
   * (w[0]+w[2]) x (h[0]+h[2]).
   */
  TS.SLICE = {
    paper: { x: [12, 128, 256], w: [52, 64, 52], y: [20, 128, 256], h: [44, 64, 45] },
    paperSp: { x: [10, 128, 256], w: [54, 64, 54], y: [20, 128, 256], h: [44, 64, 43] },
    button: { x: [19, 128, 256], w: [45, 64, 45], y: [17, 128, 256], h: [47, 64, 47] },
    wood: { x: [44, 192, 320], w: [84, 64, 84], y: [43, 192, 320], h: [85, 64, 103] },
    banner: { x: [28, 192, 320], w: [100, 64, 84], y: [60, 192, 320], h: [68, 64, 111] }
  };

  /* Horizontal 3-slice metrics. `rowH` is the row pitch for the multi-colour
     Ribbons and Swords sheets; sy/sh are the art band inside one row. */
  /* `labelCy` is where the COLOURED BAND's centre falls in destination pixels —
     not the middle of the drawn height. Each ribbon carries a dark rim and a
     drop shadow along its lower edge, so the band a label should sit on is
     noticeably higher than the geometric centre (8px on the big ribbon).
     `capW` is the width of the forked end cap: icons must stay left of it or they
     hang off the tail. */
  TS.THREE = {
    barBig: { x: [40, 128, 256], w: [24, 64, 24], sy: 9, sh: 51, rowH: 0 },
    barSmall: { x: [49, 128, 256], w: [15, 64, 15], sy: 22, sh: 19, rowH: 0 },
    ribbonS: {
      x: [3, 128, 256], w: [61, 64, 61], sy: 4, sh: 54, rowH: 64,
      labelCy: 26, capW: 61
    },
    ribbonB: {
      x: [30, 192, 320], w: [98, 64, 97], sy: 20, sh: 103, rowH: 128,
      labelCy: 44, capW: 97
    },
    swords: { x: [23, 192, 320], w: [105, 64, 92], sy: 0, sh: 128, rowH: 128 }
  };

  /* Stretch a 9-slice panel. `fillImg`, when given, tiles that image through the
     interior instead of the sheet's centre cell. It must be genuinely tileable —
     the pack's own *_Slots.png textures are not (see ui.js). */
  TS.nineSlice = function (ctx, img, spec, dx, dy, dw, dh, fillImg) {
    var lw = spec.w[0], mw = spec.w[1], rw = spec.w[2];
    var th = spec.h[0], mh = spec.h[1], bh = spec.h[2];
    var X = spec.x, Y = spec.y;

    dx = Math.round(dx); dy = Math.round(dy);
    dw = Math.max(lw + rw, Math.round(dw));
    dh = Math.max(th + bh, Math.round(dh));
    var iw = dw - lw - rw, ih = dh - th - bh;
    var rx = dx + dw - rw, by = dy + dh - bh;

    if (fillImg) tile(ctx, fillImg, 0, 0, fillImg.width, fillImg.height, dx + lw, dy + th, iw, ih);
    else tile(ctx, img, X[1], Y[1], mw, mh, dx + lw, dy + th, iw, ih);

    tile(ctx, img, X[1], Y[0], mw, th, dx + lw, dy, iw, th);   // top
    tile(ctx, img, X[1], Y[2], mw, bh, dx + lw, by, iw, bh);   // bottom
    tile(ctx, img, X[0], Y[1], lw, mh, dx, dy + th, lw, ih);   // left
    tile(ctx, img, X[2], Y[1], rw, mh, rx, dy + th, rw, ih);   // right

    ctx.drawImage(img, X[0], Y[0], lw, th, dx, dy, lw, th);
    ctx.drawImage(img, X[2], Y[0], rw, th, rx, dy, rw, th);
    ctx.drawImage(img, X[0], Y[2], lw, bh, dx, by, lw, bh);
    ctx.drawImage(img, X[2], Y[2], rw, bh, rx, by, rw, bh);
  };

  /* Returns the drawn height so callers can centre labels without duplicating
     the metrics. */
  TS.threeSlice = function (ctx, img, spec, dx, dy, dw, row) {
    var lw = spec.w[0], mw = spec.w[1], rw = spec.w[2];
    var sy = (spec.rowH ? (row || 0) * spec.rowH : 0) + spec.sy;
    var sh = spec.sh;

    dx = Math.round(dx); dy = Math.round(dy);
    dw = Math.max(lw + rw, Math.round(dw));

    tile(ctx, img, spec.x[1], sy, mw, sh, dx + lw, dy, dw - lw - rw, sh);
    ctx.drawImage(img, spec.x[0], sy, lw, sh, dx, dy, lw, sh);
    ctx.drawImage(img, spec.x[2], sy, rw, sh, dx + dw - rw, dy, rw, sh);
    return sh;
  };

  /* ---------------------------------------------------------------- text -- */

  var FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

  /* Chunky outlined text. The pack ships no font, and a heavy dark stroke is
     what makes a vector-ish font sit convincingly on top of pixel art.
     Vertical centring measures the glyphs' real ink box rather than trusting
     textBaseline:'middle', which aligns the font's em box — that sits off-centre
     for all-caps and for digits, and left every button label looking slightly
     high or low. */
  TS.text = function (ctx, str, x, y, o) {
    o = o || {};
    var size = Math.round(o.size || 24);
    ctx.font = (o.weight || 700) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = o.align || 'center';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    str = String(str);

    if (o.baseline) {
      ctx.textBaseline = o.baseline;
    } else {
      ctx.textBaseline = 'alphabetic';
      var m = ctx.measureText(str);
      if (m.actualBoundingBoxAscent != null) {
        y += (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      } else {
        y += size * 0.35;   // fallback for engines without ink metrics
      }
      y = Math.round(y);
    }
    if (o.shadow) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#000';
      ctx.fillText(str, x, y + Math.max(2, size * 0.09));
      ctx.globalAlpha = 1;
    }
    if (o.stroke !== null) {
      ctx.lineWidth = o.strokeWidth || Math.max(3, Math.round(size * 0.24));
      ctx.strokeStyle = o.stroke || '#3a2418';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.fill || '#fff';
    ctx.fillText(str, x, y);
  };

  TS.textWidth = function (ctx, str, size, weight) {
    ctx.font = (weight || 700) + ' ' + Math.round(size || 24) + 'px ' + FONT;
    return ctx.measureText(String(str)).width;
  };

  /* --------------------------------------------------------------- shapes -- */

  TS.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  /* Soft elliptical shadow, used for buildings and anything without the
     pack's own Shadow.png. */
  TS.blobShadow = function (ctx, cx, cy, rx, ry, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.22 : alpha;
    ctx.fillStyle = '#1d2b26';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

})(window.TS);
