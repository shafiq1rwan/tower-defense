/* story.js — the campaign's cutscenes.
 *
 * Nine short scenes: one before each battle, one after the last is won. They play
 * over the LEVEL'S OWN backdrop, because startBattle builds the terrain and scene
 * before handing control here — so the battle-4 scene is rained on and the
 * battle-8 scene is lit by embers, at no extra cost.
 *
 * Seen scenes are recorded in the save and never shown again. Replaying a battle
 * for a better sword rating has to stay fast, and a cutscene you cannot skip on
 * the fourth attempt is the surest way to make a player quit.
 *
 * The knights speak with the pack's Human Avatar portraits — ten of which were
 * being downloaded and drawn nowhere until now. The goblin has no portrait
 * because the Goblins faction ships none, so he appears as his own field sprite.
 */
(function (TS) {
  'use strict';

  /* `ink` is the MEASURED content box inside each 256x256 avatar frame, because
     the portraits are inset by different amounts and by different shapes: the
     Warrior's art is 197x182 at x22-218 y31-212, the Monk's only 144x155 at
     x57-200 y44-198. Placing them by frame centre would sit them at visibly
     different heights and off-centre horizontally, the same way the Barracks
     portraits did before they were anchored properly. Everything below is
     positioned from the ink's BOTTOM EDGE and horizontal middle. */
  var CAST = {
    aldric: { name: 'Captain Aldric', cls: 'Warrior', ink: [22, 218, 31, 212] },
    fen: { name: 'Brother Fen', cls: 'Monk', ink: [57, 200, 44, 198] },
    grix: { name: 'Grix', goblin: 'Torch' }
  };

  /* Avatars draw at NATIVE size, as the result panel does. Doubling them fills
     nearly half the screen and the Warrior's crest-and-shield stops reading as a
     portrait at all. The space left above is not wasted — it shows the field the
     battle is about to happen on, weather and all.
     The goblin gets 2x because his field sprite is only ~88px of ink, and at 2x he
     stands ~176 tall against the knights' ~182 — near enough to match. Integer
     scales only: smoothing is off globally, so a fractional one comes out chunky. */
  var AVATAR_SCALE = 1;
  var GOBLIN_SCALE = 2;
  var PORTRAIT_BASE = 892;   // where every portrait's chin/feet line up

  /* Keyed by battle index; 'end' plays after battle 8 is won. Lines are kept
     under ~70 characters so they wrap to at most two rows in the box. */
  var SCRIPT = {
    0: [
      ['fen', 'Three flocks in a week, Captain. Wolves don’t take the bells.'],
      ['aldric', 'No. Wolves don’t take the bells.'],
      ['aldric', 'Scouts, then — and someone sent them. Hold the meadow gate.']
    ],
    1: [
      ['fen', 'That one’s carrying a charge. A shaped charge.'],
      ['aldric', 'Goblins with mining powder.'],
      ['fen', 'Scouts don’t carry powder. Sappers do.']
    ],
    2: [
      ['aldric', 'How many?'],
      ['fen', 'I stopped counting at forty.'],
      ['aldric', 'That isn’t a raid. That’s a column.']
    ],
    3: [
      ['fen', 'They’re rolling kegs down the road now. In this weather.'],
      ['aldric', 'Kegs are for breaking rock, not men.'],
      ['fen', 'Then they brought the wrong tools to a war.'],
      ['aldric', 'Or they didn’t come here for a war.']
    ],
    4: [
      ['fen', 'No birds. No sheep. Nothing has grazed here in a season.'],
      ['aldric', 'Keep the line loose. Their powder likes a crowd.']
    ],
    5: [
      ['grix', 'You keep pushing us this way. Stop pushing.'],
      ['aldric', 'You emptied my pastures.'],
      ['grix', 'We were running. You were just in front.']
    ],
    6: [
      ['fen', 'They aren’t attacking us, Captain. They’re getting past us.'],
      ['aldric', 'Then what is behind them?'],
      ['grix', 'Not behind. Below.']
    ],
    7: [
      ['aldric', 'Burn the camp.'],
      ['fen', 'And the shafts beneath it?'],
      ['aldric', 'Especially the shafts.']
    ],
    end: [
      ['fen', 'It’s done. The camp is ash.'],
      ['aldric', 'The tunnels go deeper than the camp did.'],
      ['fen', 'How much deeper?'],
      ['aldric', 'Post a watch. Every night.']
    ]
  };

  var Story = {};
  TS.Story = Story;

  var lines = null;      // the scene being played
  var at = 0;            // current line
  var key = null;        // save key for the scene
  var done = null;       // called when the scene finishes or is skipped
  var lineT = 0;         // seconds the current line has been up, for the typewriter

  var CPS = 42;          // characters per second

  function seen() {
    var d = TS.Save.get();
    if (!d.story || typeof d.story !== 'object') d.story = {};
    return d.story;
  }

  Story.has = function (k) { return !!SCRIPT[k]; };

  Story.pending = function (k) {
    return !!SCRIPT[k] && !seen()[k];
  };

  /* `onDone` runs whether the scene played out or was skipped, so the caller can
     treat it as "carry on into the battle" without special-casing. */
  Story.begin = function (k, onDone) {
    lines = SCRIPT[k] || null;
    at = 0;
    lineT = 0;
    key = k;
    done = onDone || null;
    if (!lines) { Story.finish(); return false; }
    return true;
  };

  Story.finish = function () {
    if (key != null) {
      seen()[key] = 1;
      TS.Save.flush();
    }
    lines = null;
    key = null;
    var cb = done;
    done = null;
    if (cb) cb();
  };

  Story.skip = function () { Story.finish(); };

  Story.active = function () { return !!lines; };

  Story.update = function (dt) { if (lines) lineT += dt; };

  /* A tap completes the typewriter first, then advances. Otherwise a player who
     taps to hurry the text along loses the line they were reading. */
  Story.advance = function () {
    if (!lines) return;
    var full = lines[at][1].length / CPS;
    if (lineT < full) { lineT = full; return; }
    at++;
    lineT = 0;
    TS.Audio.play('click');
    if (at >= lines.length) Story.finish();
  };

  /* ------------------------------------------------------------- drawing -- */

  var BOX = { x: 40, y: 968, w: 752, h: 292 };
  var PAD = 40;
  var SIZE = 27;
  var LEAD = 38;

  /* Greedy wrap on measured widths — the font is not monospaced, so counting
     characters would break the box on the wide lines. */
  function wrap(ctx, text, maxW) {
    var words = text.split(' ');
    var rows = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var next = cur ? cur + ' ' + words[i] : words[i];
      if (cur && TS.textWidth(ctx, next, SIZE) > maxW) {
        rows.push(cur);
        cur = words[i];
      } else {
        cur = next;
      }
    }
    if (cur) rows.push(cur);
    return rows;
  }

  Story.draw = function (ctx, clock) {
    if (!lines) return;
    var who = lines[at][0], text = lines[at][1];
    var actor = CAST[who] || CAST.aldric;

    /* Darken the world so the portrait and box read against any theme, including
       the bright meadow. */
    ctx.fillStyle = 'rgba(10,16,24,0.62)';
    ctx.fillRect(0, 0, TS.W, TS.H);

    var px = TS.W / 2;
    if (actor.goblin) {
      /* The Goblins faction ships no portraits, so he shows up as himself. Feet
         land on the same baseline as the knights' chins. */
      var spr = TS.SPR.unit[actor.goblin].idle;
      TS.drawFrame(ctx, spr, (clock * 8) | 0, px, PORTRAIT_BASE,
        { scale: GOBLIN_SCALE, flip: true });
    } else {
      var img = TS.img(TS.avatarKey('Blue', actor.cls));
      if (img) {
        var k = AVATAR_SCALE, ink = actor.ink;
        /* Line the ink's bottom up with the baseline and its middle with centre. */
        var dx = px - ((ink[0] + ink[1]) / 2) * k;
        var dy = PORTRAIT_BASE - ink[3] * k;
        ctx.drawImage(img, Math.round(dx), Math.round(dy),
          img.width * k, img.height * k);
      }
    }

    /* Name on a ribbon, sitting on the box's top edge.
       Row comes from UI.RIB, not UI.PLATE: SmallRibbons.png is 10 rows of 64 —
       five colours times two tail styles — while BigRibbons is 5 rows of 128, so
       the two tables are NOT interchangeable. Using PLATE.red here silently drew
       teal, because index 1 is still the teal band on the small sheet. */
    var nameW = 360;
    TS.UI.labelRibbon(ctx, 'small', px - nameW / 2, BOX.y - 46, nameW,
      actor.goblin ? TS.UI.RIB.redR : TS.UI.RIB.tealR, actor.name,
      { size: 24, stroke: actor.goblin ? '#4a1f1f' : '#25404a' });

    TS.UI.panel(ctx, 'paper', BOX.x, BOX.y, BOX.w, BOX.h);

    /* Typewriter reveal, measured in characters per second so long and short
       lines feel equally paced. */
    var shown = Math.min(text.length, Math.floor(lineT * CPS));
    var rows = wrap(ctx, text.slice(0, shown), BOX.w - PAD * 2);
    for (var i = 0; i < rows.length; i++) {
      TS.text(ctx, rows[i], BOX.x + PAD, BOX.y + 74 + i * LEAD, {
        size: SIZE, fill: '#4a3728', stroke: null, align: 'left'
      });
    }

    /* Prompt, only once the line has finished revealing. */
    if (shown >= text.length) {
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(clock * 3.4);
      TS.text(ctx, at + 1 < lines.length ? 'tap to continue' : 'tap to begin',
        BOX.x + BOX.w - PAD, BOX.y + BOX.h - 42,
        { size: 19, fill: '#6b5238', stroke: null, align: 'right' });
      ctx.restore();
    }

    /* Line counter, so a player knows how much is left. */
    TS.text(ctx, (at + 1) + ' / ' + lines.length, BOX.x + PAD, BOX.y + BOX.h - 42,
      { size: 18, fill: '#8d775c', stroke: null, align: 'left' });
  };

})(window.TS);
