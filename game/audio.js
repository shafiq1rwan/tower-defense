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
  /* Separate buses so music can sit under the effects at a fixed ratio. Mixing
     both into one gain meant any music level loud enough to hear also fought the
     impacts, which are the sounds that carry the gameplay. */
  var sfxBus = null;
  var musicBus = null;
  var enabled = true;
  var ready = false;

  var SFX_GAIN = 0.5;
  var MUSIC_GAIN = 0.16;   // deliberately well under the effects

  var Audio = {};
  TS.Audio = Audio;

  Audio.isEnabled = function () { return enabled; };

  /* The preference is PERSISTED. `muted` existed in the save defaults but nothing
     ever read or wrote it, so turning sound off and reloading turned it back on
     and the save field was dead weight. */
  Audio.toggle = function () {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 1 : 0;
    try {
      TS.Save.get().muted = !enabled;
      TS.Save.flush();
    } catch (e) { /* a failed write must not break the toggle */ }
    if (enabled) Music.resume(); else Music.suspend();
    return enabled;
  };

  /* Must be called from a real user gesture or the context stays suspended. */
  Audio.unlock = function () {
    if (ready) return;
    /* Honour the saved preference before the first sound can play. */
    try { enabled = !TS.Save.get().muted; } catch (e) { enabled = true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { ready = true; return; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 1 : 0;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = SFX_GAIN;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = MUSIC_GAIN;
      musicBus.connect(master);
      buildNoise();
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
    g.connect(o.bus || sfxBus);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
    /* Music notes are remembered so a theme switch or a pause can silence what
       is already committed to the graph; effects stay fire-and-forget. Without
       this nothing held a reference to a scheduled bar, so it was uncancellable. */
    if (o.bus && o.bus === musicBus) {
      mNotes.push({ o: osc, g: g, until: t0 + o.dur + 0.05 });
    }
  }

  /* ONE noise buffer, built at unlock and reused for every burst.
     It used to be generated per sound: 0.11s at 48kHz is 5,280 Math.random()
     calls, and impacts fire up to ~20 times a second, so this was ~100k draws and
     a fresh allocation every second. Worse, Audio.play is called from inside the
     simulation (applyHit, hurt, die), so those draws came out of the SAME global
     PRNG the sim uses for atkTimer jitter and the guard chance — meaning having
     sound on perturbed combat, exactly the coupling scene.js had to be freed from.
     Reusing one buffer removes both problems: no per-sound allocation, and the
     only Math.random left runs once, at unlock, outside any battle. */
  var noiseBuf = null;
  var noiseTurn = 0;
  var NOISE_SECONDS = 0.5;   // longer than the longest burst (castleHit, 0.22s)

  function buildNoise() {
    var len = Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS));
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /* Filtered noise burst — impacts, explosions, dust. */
  function noise(o) {
    if (!ctx || !noiseBuf) return;
    var t0 = now() + (o.delay || 0);
    var dur = o.dur || 0.15;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    /* Start at a rotating offset so repeated hits are not the identical waveform.
       A counter rather than Math.random, to keep this off the sim's stream. */
    noiseTurn = (noiseTurn + 7) % 23;
    var offset = (noiseTurn / 23) * Math.max(0, NOISE_SECONDS - dur);
    var filt = ctx.createBiquadFilter();
    filt.type = o.filter || 'bandpass';
    filt.frequency.setValueAtTime(o.f0 || 900, t0);
    if (o.f1) filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t0 + dur);
    filt.Q.value = o.q == null ? 1.1 : o.q;
    var g = ctx.createGain();
    var peak = o.gain == null ? 0.3 : o.gain;
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(sfxBus);
    src.start(t0, offset, dur);
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

  /* ------------------------------------------------------------------ music -- */

  /* Procedural background music. Like the effects it has to be synthesised, since
     the pack ships no audio at all.
     Scheduled AHEAD on the WebAudio clock rather than played per frame: the
     requestAnimationFrame loop jitters and drops to 0Hz in a background tab, which
     would make audible timing errors. A timer wakes up a few times a second and
     queues any bar starting inside the next lookahead window, so the music keeps
     perfect time regardless of frame rate — and, importantly, regardless of
     fast-forward. Battle music that sped up at 3x would be exhausting, and the sim
     clock must never reach the mixer.
     Deliberately sparse: a bass note, a slow pad chord and a few plucked notes per
     bar. Anything busier competes with the impacts. */
  var Music = {};
  Audio.Music = Music;

  var mTimer = null;
  var mNextBar = 0;      // ctx time of the next bar to schedule
  var mBar = 0;          // bar counter, drives the progression
  var mNotes = [];       // live music notes, so they CAN be cut (see tone())

  /* Cut everything the scheduler has committed. Bars are queued up to LOOKAHEAD
     ahead and each note rings for ~2.5s, so without this a theme switch on
     NEXT/RETRY played two songs at once for several seconds, and a pause let the
     old bars bleed into the menu. */
  function stopMusicNotes() {
    for (var i = 0; i < mNotes.length; i++) {
      var n = mNotes[i];
      try {
        n.g.gain.cancelScheduledValues(0);
        n.g.gain.value = 0;
        n.o.stop();
      } catch (e) { /* already stopped */ }
    }
    mNotes.length = 0;
  }
  var mMood = null;
  var LOOKAHEAD = 1.2;   // seconds of music kept queued
  var TICK = 320;        // ms between scheduler wakeups

  /* Semitone offsets. Minor for the grim themes, major for the pastoral ones. */
  var SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];
  var SCALE_MAJOR = [0, 2, 4, 5, 7, 9, 11];
  /* Chord roots as scale degrees, one per bar — i / VI / III / VII, the standard
     four-bar loop that does not resolve, so it can repeat without a seam. */
  var PROGRESSION = [0, 5, 2, 6];

  function hz(root, semi) { return root * Math.pow(2, semi / 12); }

  var DEFAULT_MOOD = { root: 220, minor: false, bpm: 88, pluck: true };

  function pump() {
    if (!ctx || !musicBus || !mMood) return;
    /* Drop notes that have already rung out, so the list never grows. */
    for (var i = mNotes.length - 1; i >= 0; i--) {
      if (mNotes[i].until < ctx.currentTime) mNotes.splice(i, 1);
    }
    /* Catch up if the tab was asleep, but never schedule a backlog of bars. */
    if (mNextBar < ctx.currentTime) mNextBar = ctx.currentTime + 0.05;
    var guard = 0;
    while (mNextBar < ctx.currentTime + LOOKAHEAD && guard++ < 4) {
      mNextBar += scheduleBarAt(mNextBar);
    }
  }

  /* tone() schedules relative to now(), so a future bar is expressed as a delay
     from the present rather than an absolute time. That keeps one note-shaping
     function shared with the effects instead of a second copy for music. */
  function scheduleBarAt(when) {
    var mood = mMood || DEFAULT_MOOD;
    var beat = 60 / (mood.bpm || 88);
    var bar = beat * 4;
    var base = Math.max(0, when - ctx.currentTime);
    var scale = mood.minor ? SCALE_MINOR : SCALE_MAJOR;
    var deg = PROGRESSION[mBar % PROGRESSION.length];
    var semi = scale[deg % scale.length];
    var root = mood.root || 220;

    tone({ type: 'triangle', f0: hz(root / 2, semi), dur: bar * 0.92,
      gain: 0.30, delay: base, bus: musicBus });

    [0, 2, 4].forEach(function (step, i) {
      tone({ type: 'sine', f0: hz(root, scale[(deg + step) % scale.length]),
        dur: bar * 0.88, gain: i === 0 ? 0.16 : 0.10,
        delay: base + 0.02 * i, bus: musicBus });
    });

    if (mood.pluck !== false) {
      [0, 2.5, 3.5].forEach(function (b, i) {
        var step = (deg + (i + mBar) * 2) % scale.length;
        tone({ type: 'square', f0: hz(root * 2, scale[step]),
          dur: beat * 0.42, gain: 0.05, delay: base + b * beat, bus: musicBus });
      });
    }

    mBar++;
    return bar;
  }

  /* `mood` is {root, minor, bpm, pluck} — supplied per level by themes.js, so the
     music darkens with the weather instead of one track playing over everything. */
  Music.play = function (mood) {
    if (!ready || !ctx) return;
    mMood = mood || DEFAULT_MOOD;
    mBar = 0;
    /* Remember the mood even when muted, so un-muting mid-battle can resume into
       the right key rather than needing the level restarted. */
    if (!enabled) return;
    /* Silence the outgoing theme before the new one starts scheduling. */
    stopMusicNotes();
    mNextBar = ctx.currentTime + 0.08;
    if (mTimer) return;              // already pumping
    mTimer = window.setInterval(pump, TICK);
    pump();
  };

  Music.stop = function () {
    mMood = null;
    if (mTimer) { window.clearInterval(mTimer); mTimer = null; }
    stopMusicNotes();
  };

  Music.suspend = function () {
    if (mTimer) { window.clearInterval(mTimer); mTimer = null; }
    stopMusicNotes();
  };
  Music.resume = function () {
    if (!mMood || mTimer || !ctx) return;
    mNextBar = ctx.currentTime + 0.08;
    mTimer = window.setInterval(pump, TICK);
    pump();
  };
  Music.isPlaying = function () { return !!mTimer; };

})(window.TS);
