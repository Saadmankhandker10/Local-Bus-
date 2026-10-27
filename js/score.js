// Score rules. Listens to events from traffic.js and changes the game numbers.
//   চিপা (near miss)  -> points, chained into combos
//   light crash       -> bus damage, taka lost, passengers leave, combo broken
import { CFG } from "./config.js";
import { game } from "./state.js";
import { on } from "./events.js";

const C = CFG.chipa, H = CFG.hp;
const BEST_KEY = "localbus.best";

/** Stats for the game-over screen. */
export const stats = { chipas: 0, bestCombo: 0, crashes: {} };
let lastChipaTime = -Infinity;

/** Clear the score for a new run. */
export function resetScore() {
  game.points = 0;
  game.combo = 0;
  stats.chipas = 0;
  stats.bestCombo = 0;
  stats.crashes = {};
  lastChipaTime = -Infinity;
}

/** Current combo multiplier: x1, x1.5, x2 ... up to the cap. */
export function comboMult() {
  return Math.min(C.comboMaxMult, 1 + C.comboStep * Math.max(0, game.combo - 1));
}

/** The final score: points plus all fare collected. */
export function totalScore() {
  return Math.floor(game.points + game.fare);
}

/** Read the best score saved in this browser (0 if none yet). */
export function bestScore() {
  return Number(localStorage.getItem(BEST_KEY)) || 0;
}

/** Save the score if it beats the best. @returns {boolean} true if it is a new record */
export function saveBest() {
  const score = totalScore();
  if (score <= bestScore()) return false;
  localStorage.setItem(BEST_KEY, String(score));
  return true;
}

on("chipa", e => {
  // Chain: another chipa soon after the last one grows the combo.
  game.combo = game.time - lastChipaTime <= C.comboWindow ? game.combo + 1 : 1;
  lastChipaTime = game.time;
  const gained = Math.round(e.points * comboMult());
  game.points += gained;
  stats.chipas++;
  stats.bestCombo = Math.max(stats.bestCombo, game.combo);
  e.gained = gained; // so the HUD can show "+30"
});

on("crash", e => {
  game.hp -= e.dmg * H.hitDamageScale * (H.hitBase + game.speed / H.hitSpeedRef);
  game.fare = Math.max(0, game.fare - e.fine);
  if (game.pass > 0) game.pass = Math.max(0, game.pass - CFG.fare.lostOnHit);
  game.combo = 0;
  stats.crashes[e.type] = (stats.crashes[e.type] || 0) + 1;
});

on("heavyHit", e => {
  stats.crashes[e.type] = (stats.crashes[e.type] || 0) + 1;
});
