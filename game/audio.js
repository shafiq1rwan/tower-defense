/* audio.js — procedural sound.
 *
 * The pack ships no audio, so every sound here is synthesised with WebAudio.
 * Kept deliberately small and dry: short envelopes, no reverb, nothing that
 * needs a sample. The context starts suspended until the first user gesture,
 * which is what browsers require.
 */
(function (TS) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;
  var ready = false;

  var Audio = {};
  TS.Audio = Audio;

  Audio.isEnabled = function () { return enabled; };
  Audio.toggle = function () {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.5 : 0;
    return enabled;
  };

  /* Must be called from a real user gesture or the context stays suspended. */
  Audio.unlock = function () {
    if (ready) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { ready = true; return; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.5 : 0;
      master.connect(ctx.destination);
      ready = true;
    } catch (e) {
      ready = true;   // fail silent; the game must not depend on audio
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };

  function now() { return ctx.currentTime; }

  /* One shaped oscillator note. */
  function tone(o) {
    if (!ctx) return;
    var t0 = now() + (o.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 && o.f1 !== o.f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
    }
    var peak = (o.gain == null ? 0.25 : o.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, o.dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  /* Filtered noise burst — impacts, explosions, dust. */
  function noise(o) {
    if (!ctx) return;
    var t0 = now() + (o.delay || 0);
    var dur = o.dur || 0.15;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = o.filter || 'bandpass';
    filt.frequency.setValueAtTime(o.f0 || 900, t0);
    if (o.f1) filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t0 + dur);
    filt.Q.value = o.q == null ? 1.1 : o.q;
    var g = ctx.createGain();
    var peak = o.gain == null ? 0.3 : o.gain;
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* Voices are throttled: dozens of units can land hits on the same frame and
     without this the mix turns to mush and the gain stacks painfully. */
  var lastAt = {};
  function throttle(name, ms) {
    var t = performance.now();
    if (lastAt[name] && t - lastAt[name] < ms) return false;
    lastAt[name] = t;
    return true;
  }

  var VOICES = {
    swing: function () {
      noise({ f0: 2600, f1: 700, dur: 0.1, gain: 0.13, q: 0.8 });
    },
    hit: function () {
      noise({ f0: 1700, f1: 260, dur: 0.11, gain: 0.2, q: 1.4 });
      tone({ type: 'triangle', f0: 340, f1: 130, dur: 0.09, gain: 0.14 });
    },
    bow: function () {
      tone({ type: 'sawtooth', f0: 900, f1: 220, dur: 0.11, gain: 0.1 });
    },
    die: function () {
      noise({ f0: 700, f1: 150, dur: 0.2, gain: 0.16, filter: 'lowpass', q: 0.7 });
    },
    heal: function () {
      tone({ type: 'sine', f0: 620, f1: 940, dur: 0.16, gain: 0.13 });
      tone({ type: 'sine', f0: 930, f1: 1400, dur: 0.2, gain: 0.09, delay: 0.06 });
    },
    summon: function () {
      tone({ type: 'square', f0: 480, f1: 720, dur: 0.09, gain: 0.13 });
      tone({ type: 'square', f0: 720, f1: 960, dur: 0.1, gain: 0.1, delay: 0.07 });
    },
    coin: function () {
      tone({ type: 'square', f0: 1180, dur: 0.05, gain: 0.1 });
      tone({ type: 'square', f0: 1560, dur: 0.09, gain: 0.08, delay: 0.05 });
    },
    castleHit: function () {
      noise({ f0: 420, f1: 90, dur: 0.22, gain: 0.28, filter: 'lowpass', q: 0.6 });
      tone({ type: 'triangle', f0: 180, f1: 70, dur: 0.2, gain: 0.16 });
    },
    click: function () {
      tone({ type: 'square', f0: 820, f1: 620, dur: 0.05, gain: 0.12 });
    },
    deny: function () {
      tone({ type: 'square', f0: 300, f1: 190, dur: 0.12, gain: 0.13 });
    },
    win: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ type: 'square', f0: f, dur: 0.26, gain: 0.14, delay: i * 0.11 });
      });
    },
    lose: function () {
      [392, 330, 262, 196].forEach(function (f, i) {
        tone({ type: 'triangle', f0: f, dur: 0.32, gain: 0.15, delay: i * 0.14 });
      });
    }
  };

  /* Minimum gap per voice, in ms. */
  var THROTTLE = {
    swing: 55, hit: 45, bow: 70, die: 90, heal: 120,
    summon: 40, coin: 60, castleHit: 110, click: 30, deny: 160
  };

  Audio.play = function (name) {
    if (!enabled || !ready || !ctx) return;
    var v = VOICES[name];
    if (!v) return;
    var ms = THROTTLE[name];
    if (ms && !throttle(name, ms)) return;
    if (ctx.state === 'suspended') ctx.resume();
    try { v(); } catch (e) { /* never let audio break the frame */ }
  };

})(window.TS);
