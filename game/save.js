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
    gold: 0,           // gold banked and not yet spent
    wins: 0,
    best: {},          // battleIndex -> best remaining castle HP %
    upg: {},           // class name -> upgrade level 0..MAX_UPG
    muted: false
  };

  /* Permanent upgrades: what victory gold is actually FOR.
     A flawless run of all eight battles banks about 1,416 gold, and maxing every
     class costs 4,500 — so a first campaign buys a meaningful slice, not the lot,
     and which classes you invest in is a real choice. Replaying a battle pays out
     again, which is the reason to go back for three swords. */
  var MAX_UPG = 3;
  var UPG_COST = [120, 260, 520];
  var UPG_STEP = 0.12;            // +12% HP and power per level

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
    if (typeof out.upg !== 'object' || !out.upg) out.upg = {};
    return out;
  }

  var Save = {};
  TS.Save = Save;
  Save.MAX_UPG = MAX_UPG;

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

  /* Rating thresholds live here alone, so the result screen and the battle-select
     list can never disagree about what a run was worth.
     Exposed as data rather than inlined into the comparison below because the UI
     now SHOWS the rule to the player — a hard-coded "85%" in a label would drift
     silently the first time these are retuned. Fraction of tower HP remaining
     needed for 3 swords, then for 2; anything less is 1. */
  var STAR_AT = [0.85, 0.5];
  Save.STAR_AT = STAR_AT;

  Save.starsForFrac = function (hpFrac) {
    if (!hpFrac) return 0;
    return hpFrac >= STAR_AT[0] ? 3 : hpFrac >= STAR_AT[1] ? 2 : 1;
  };

  Save.stars = function (battleIndex) {
    return Save.starsForFrac(Save.get().best[battleIndex]);
  };

  /* ------------------------------------------------------------- upgrades -- */

  Save.upgradeLevel = function (cls) {
    return TS.clamp(Save.get().upg[cls] | 0, 0, MAX_UPG);
  };

  /* Cost of the NEXT level, or 0 when already maxed. */
  Save.upgradeCost = function (cls) {
    var lv = Save.upgradeLevel(cls);
    return lv >= MAX_UPG ? 0 : UPG_COST[lv];
  };

  /* Multiplier applied to a player unit's HP and power when it is summoned. */
  Save.unitBuff = function (cls) {
    return 1 + UPG_STEP * Save.upgradeLevel(cls);
  };

  Save.canAfford = function (cls) {
    var cost = Save.upgradeCost(cls);
    return cost > 0 && Save.get().gold >= cost;
  };

  Save.buyUpgrade = function (cls) {
    if (!Save.canAfford(cls)) return false;
    var d = Save.get();
    d.gold -= Save.upgradeCost(cls);
    d.upg[cls] = Save.upgradeLevel(cls) + 1;
    Save.flush();
    return true;
  };

  Save.reset = function () {
    data = null;
    try { window.localStorage.removeItem(KEY); } catch (e) {}
  };

})(window.TS);
