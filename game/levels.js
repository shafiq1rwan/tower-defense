/* levels.js — the eight battles.
 *
 * Waves are a declarative timed script rather than a gold-budget AI, so the
 * difficulty curve is directly authorable and a battle plays the same way twice.
 * Each entry: { t: start seconds, cls, n: count, gap: seconds between spawns }.
 *
 * Every level also carries an `endless` tail. Without it a stalemate — say the
 * player turtling behind Warriors — could run forever with nothing happening.
 */
(function (TS) {
  'use strict';

  var P = 'Pawn', W = 'Warrior', A = 'Archer', M = 'Monk', L = 'Lancer';

  /* `buff` multiplies enemy HP and damage. It stays low deliberately: the enemy
     already gets free units, so a large multiplier on top makes late battles
     mathematically unwinnable rather than hard. `endless.cap` is the live-enemy
     ceiling for the post-script trickle — the lower it is, the more room the
     player has to mass up and push. */
  var LEVELS = [
    {
      name: 'First Blood',
      objective: 'Destroy the Red Camp',
      cards: [P, W],
      playerHp: 400, enemyHp: 300,
      startGold: 150, goldRate: 14, goldCap: 340,
      buff: 1,
      timeLimit: 170,
      waves: [
        { t: 4, cls: P, n: 2, gap: 0.6 },
        { t: 16, cls: P, n: 3, gap: 0.5 },
        { t: 30, cls: W, n: 1 },
        { t: 42, cls: P, n: 3, gap: 0.4 },
        { t: 56, cls: W, n: 2, gap: 0.8 }
      ],
      endless: { every: 12, cap: 4, classes: [P, P, W] }
    },
    {
      name: 'Archers on the Ridge',
      objective: 'Break the Red line',
      cards: [P, W, A],
      playerHp: 400, enemyHp: 370,
      startGold: 160, goldRate: 15, goldCap: 380,
      buff: 1,
      timeLimit: 180,
      waves: [
        { t: 3, cls: P, n: 3, gap: 0.5 },
        { t: 12, cls: A, n: 1 },
        { t: 22, cls: P, n: 3, gap: 0.4 },
        { t: 32, cls: A, n: 2, gap: 1.0 },
        { t: 44, cls: W, n: 2, gap: 0.7 },
        { t: 58, cls: A, n: 2, gap: 0.9 }
      ],
      endless: { every: 11, cap: 4, classes: [P, A, W, P] }
    },
    {
      name: 'Shield Wall',
      objective: 'Grind through the Warriors',
      cards: [P, W, A],
      playerHp: 420, enemyHp: 430,
      startGold: 170, goldRate: 16, goldCap: 420,
      buff: 1,
      timeLimit: 190,
      waves: [
        { t: 3, cls: W, n: 2, gap: 0.9 },
        { t: 14, cls: P, n: 4, gap: 0.35 },
        { t: 26, cls: W, n: 2, gap: 0.8 },
        { t: 38, cls: A, n: 2, gap: 0.9 },
        { t: 50, cls: W, n: 3, gap: 0.7 },
        { t: 64, cls: P, n: 5, gap: 0.3 }
      ],
      endless: { every: 10, cap: 5, classes: [W, P, P, A] }
    },
    {
      name: 'Field Medic',
      objective: 'Outlast the healers',
      cards: [P, W, A, M],
      playerHp: 440, enemyHp: 470,
      startGold: 190, goldRate: 17, goldCap: 460,
      buff: 1.04,
      timeLimit: 200,
      waves: [
        { t: 3, cls: P, n: 3, gap: 0.45 },
        { t: 12, cls: M, n: 1 },
        { t: 20, cls: W, n: 2, gap: 0.8 },
        { t: 32, cls: A, n: 2, gap: 0.8 },
        { t: 42, cls: M, n: 1 },
        { t: 52, cls: W, n: 3, gap: 0.6 },
        { t: 66, cls: P, n: 4, gap: 0.3 }
      ],
      endless: { every: 10, cap: 5, classes: [P, W, A, M, P] }
    },
    {
      name: 'The Long Reach',
      objective: 'Answer the Red Lancer',
      cards: [P, W, A, M, L],
      playerHp: 460, enemyHp: 520,
      startGold: 210, goldRate: 18, goldCap: 520,
      buff: 1.06,
      timeLimit: 215,
      waves: [
        { t: 3, cls: P, n: 4, gap: 0.4 },
        { t: 14, cls: L, n: 1 },
        { t: 26, cls: A, n: 2, gap: 0.8 },
        { t: 38, cls: W, n: 3, gap: 0.6 },
        { t: 50, cls: L, n: 1 },
        { t: 60, cls: M, n: 1 },
        { t: 72, cls: P, n: 4, gap: 0.3 }
      ],
      endless: { every: 9.5, cap: 5, classes: [W, A, P, L, M] }
    },
    {
      name: 'Two Fronts',
      objective: 'Hold, then push',
      cards: [P, W, A, M, L],
      playerHp: 480, enemyHp: 580,
      startGold: 230, goldRate: 20, goldCap: 560,
      buff: 1.08,
      timeLimit: 230,
      waves: [
        { t: 2, cls: P, n: 5, gap: 0.3 },
        { t: 14, cls: W, n: 3, gap: 0.6 },
        { t: 26, cls: A, n: 3, gap: 0.7 },
        { t: 36, cls: L, n: 1 },
        { t: 46, cls: M, n: 2, gap: 1.2 },
        { t: 58, cls: W, n: 3, gap: 0.5 },
        { t: 72, cls: L, n: 1 }
      ],
      endless: { every: 9, cap: 6, classes: [P, W, A, L, P, M] }
    },
    {
      name: 'Iron Tide',
      objective: 'Survive the assault and break through',
      cards: [P, W, A, M, L],
      playerHp: 500, enemyHp: 640,
      startGold: 250, goldRate: 22, goldCap: 620,
      buff: 1.11,
      timeLimit: 245,
      waves: [
        { t: 2, cls: W, n: 3, gap: 0.5 },
        { t: 12, cls: P, n: 5, gap: 0.25 },
        { t: 24, cls: A, n: 3, gap: 0.6 },
        { t: 34, cls: L, n: 1 },
        { t: 46, cls: M, n: 2, gap: 1.0 },
        { t: 56, cls: W, n: 3, gap: 0.45 },
        { t: 70, cls: A, n: 3, gap: 0.5 },
        { t: 84, cls: L, n: 1 }
      ],
      endless: { every: 8.5, cap: 6, classes: [W, P, A, L, M, W] }
    },
    {
      name: 'The Red Keep',
      objective: 'Take the Keep',
      cards: [P, W, A, M, L],
      playerHp: 520, enemyHp: 720,
      startGold: 280, goldRate: 24, goldCap: 700,
      buff: 1.15,
      timeLimit: 260,
      waves: [
        { t: 2, cls: P, n: 5, gap: 0.25 },
        { t: 12, cls: W, n: 4, gap: 0.5 },
        { t: 24, cls: A, n: 3, gap: 0.5 },
        { t: 34, cls: L, n: 2, gap: 1.2 },
        { t: 46, cls: M, n: 2, gap: 0.9 },
        { t: 58, cls: W, n: 4, gap: 0.4 },
        { t: 72, cls: L, n: 2, gap: 1.0 },
        { t: 86, cls: A, n: 3, gap: 0.4 }
      ],
      endless: { every: 8, cap: 6, classes: [W, A, P, L, M, W, A] }
    }
  ];

  var Levels = { list: LEVELS };
  TS.Levels = Levels;

  Levels.count = LEVELS.length;
  Levels.get = function (i) { return LEVELS[TS.clamp(i, 0, LEVELS.length - 1)]; };

  /* Flatten the waves into one sorted list of spawn events. */
  function compile(level) {
    var out = [];
    for (var i = 0; i < level.waves.length; i++) {
      var w = level.waves[i];
      var n = w.n || 1;
      var gap = w.gap || 0.5;
      for (var k = 0; k < n; k++) out.push({ t: w.t + k * gap, cls: w.cls });
    }
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  /* Called each sim step. Fires any due spawn events, then keeps the endless
     tail running once the scripted waves are exhausted. */
  Levels.pumpWaves = function (battle, dt) {
    var level = battle.level;
    if (!battle.script) {
      battle.script = compile(level);
      battle.scriptIndex = 0;
      battle.endlessT = 0;
      battle.endlessI = 0;
    }

    /* Due events queue rather than spawn directly, so a full field defers them
       instead of losing them — a wave's total pressure still arrives. */
    var s = battle.script;
    while (battle.scriptIndex < s.length && s[battle.scriptIndex].t <= battle.time) {
      battle.pending.push({ cls: s[battle.scriptIndex].cls, buff: level.buff });
      battle.scriptIndex++;
    }

    /* Once the script and its backlog are spent, the enemy drops to a thin
       trickle held well below the field cap. That is what creates the "hold,
       then break through" arc: the player can out-produce a trickle and push,
       but never gets a free run at an undefended castle. */
    if (battle.scriptIndex >= s.length && !battle.pending.length && level.endless) {
      battle.endlessT += dt;
      if (battle.endlessT >= level.endless.every) {
        battle.endlessT = 0;
        var softCap = level.endless.cap || 7;
        if (battle.liveCount(false) < softCap) {
          var pool = level.endless.classes;
          battle.pending.push({
            cls: pool[battle.endlessI % pool.length], buff: level.buff
          });
          battle.endlessI++;
        }
      }
    }
  };

  /* Gold awarded for a win, scaled by how intact your castle is. */
  Levels.reward = function (index, hpFrac) {
    return Math.round((60 + index * 25) * (0.6 + 0.6 * hpFrac));
  };

})(window.TS);
