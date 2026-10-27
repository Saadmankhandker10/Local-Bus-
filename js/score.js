// Score rules. Listens to events from traffic.js and changes the game numbers.
//   light crash -> Damage score, chained into combos
// The final score is Damage plus all fare collected.
import { CFG } from "./config.js";
import { game } from "./state.js";
import { on, emit } from "./events.js";

const C = CFG.combo;
const BEST_KEY = "localbus.best";

/** Stats for the game-over screen. */
export const stats = { bestCombo: 0, crashes: {}, fines: 0 };
let lastCrashTime = -Infinity;

/** Clear the score for a new run. */
export function resetScore() {
  game.damage = 0;
  game.combo = 0;
  stats.bestCombo = 0;
  stats.crashes = {};
  stats.fines = 0;
  lastCrashTime = -Infinity;
}

/** Current combo multiplier: x1, x1.5, x2 ... up to the cap. */
export function comboMult() {
  return Math.min(C.maxMult, 1 + C.step * Math.max(0, game.combo - 1));
}

/** The final score: Damage plus all fare collected. */
export function totalScore() {
  return Math.floor(game.damage + game.fare);
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

on("crash", e => {
  // Chain: another crash soon after the last one grows the combo.
  game.combo = game.time - lastCrashTime <= C.window ? game.combo + 1 : 1;
  lastCrashTime = game.time;
  e.gained = Math.round(e.damage * comboMult()); // so the HUD can show "+30"
  game.damage += e.gained;
  stats.bestCombo = Math.max(stats.bestCombo, game.combo);
  stats.crashes[e.type] = (stats.crashes[e.type] || 0) + 1;
  if (game.combo > 1) emit("combo", { combo: game.combo, mult: comboMult() });
});

on("heavyHit", e => {
  stats.crashes[e.type] = (stats.crashes[e.type] || 0) + 1;
});

on("fineClosed", e => {
  stats.fines += e.fine;
});
