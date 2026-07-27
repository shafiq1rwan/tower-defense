/* save.js — campaign progress in localStorage.
 *
 * Deliberately tolerant: a corrupt or absent record just means a fresh save,
 * never a crash. localStorage can also throw outright (Safari private mode,
 * file:// in some builds), so every access is guarded.
 */
(function (TS) {
  'use strict';

  var KEY = 'tinySwordsLaneSiege.v1';

  var DEFAULTS = {
    cleared: 0,        // highest battle index completed
    gold: 0,           // lifetime gold earned
    wins: 0,
    best: {},          // battleIndex -> best remaining castle HP %
    muted: false
  };

  var data = null;

  function read() {
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { raw = null; }
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (var j in DEFAULTS) {
            if (parsed[j] !== undefined && parsed[j] !== null) out[j] = parsed[j];
          }
        }
      } catch (e) { /* keep defaults */ }
    }
    if (typeof out.best !== 'object' || !out.best) out.best = {};
    return out;
  }

  var Save = {};
  TS.Save = Save;

  Save.get = function () {
    if (!data) data = read();
    return data;
  };

  Save.flush = function () {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(Save.get()));
    } catch (e) { /* progress simply will not persist */ }
  };

  Save.recordWin = function (battleIndex, hpFrac, goldEarned) {
    var d = Save.get();
    if (battleIndex + 1 > d.cleared) d.cleared = battleIndex + 1;
    d.wins++;
    d.gold += goldEarned;
    var prev = d.best[battleIndex] || 0;
    if (hpFrac > prev) d.best[battleIndex] = hpFrac;
    Save.flush();
  };

  Save.isUnlocked = function (battleIndex) {
    return battleIndex <= Save.get().cleared;
  };

  Save.stars = function (battleIndex) {
    var f = Save.get().best[battleIndex];
    if (!f) return 0;
    return f >= 0.85 ? 3 : f >= 0.5 ? 2 : 1;
  };

  Save.reset = function () {
    data = null;
    try { window.localStorage.removeItem(KEY); } catch (e) {}
  };

})(window.TS);
