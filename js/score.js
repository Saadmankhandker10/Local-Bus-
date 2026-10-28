// Score rules. Listens to events from traffic.js and changes the game numbers.
//   light crash -> Damage score, chained into combos
// The final score is Damage plus all fare collected.
import { CFG } from "./config.js";
import { pick } from "./utils.js";
import { game } from "./state.js";
import { on, emit } from "./events.js";

const C = CFG.combo;
const BEST_KEY = "localbus.best";
const WANTED_KEY = "localbus.wanted";

const HIT_WORDS = ["ধুম!", "ঠাস!", "গেল রে!", "চিৎপটাং!", "ওরে বাবা!", "খাইছে রে!", "উড়ে গেল!"];
const DEFAULT_WANTED = [
  { name: "ওস্তাদ কালাচাঁদ (মিরপুর এক্সপ্রেস)", stage: "মিরপুর ১০", score: 18450 },
  { name: "ওস্তাদ জব্বার (নিরাপদ পরিবহন)", stage: "শাহবাগ মোড়", score: 14200 },
  { name: "হেল্পার সুমন (তরঙ্গ প্লাস)", stage: "সায়েন্সল্যাব", score: 11800 },
  { name: "ওস্তাদ রফিক (বিহঙ্গ স্পেশাল)", stage: "ফার্মগেট", score: 9650 },
  { name: "ওস্তাদ বশির (ঠিকানা পরিবহন)", stage: "আসাদগেট", score: 7400 },
];

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

const TIME_KEY = "localbus.bestTime";

/** Best (fastest) full-journey time in seconds, or 0 if never finished. */
export function bestTime() {
  return Number(localStorage.getItem(TIME_KEY)) || 0;
}

/** Save the journey time if it is the fastest. @returns {boolean} true if it is a new record */
export function saveBestTime(seconds) {
  const best = bestTime();
  if (best && seconds >= best) return false;
  localStorage.setItem(TIME_KEY, String(Math.round(seconds)));
  return true;
}

/** Save the score if it beats the best. @returns {boolean} true if it is a new record */
export function saveBest() {
  const score = totalScore();
  if (score <= bestScore()) return false;
  localStorage.setItem(BEST_KEY, String(score));
  return true;
}

/** Return the top 5 "মোস্ট ওয়ান্টেড" drivers (combining stored player runs with default Dhaka legends). */
export function getWantedList() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(WANTED_KEY) || "[]"); } catch { saved = []; }
  const all = [...saved, ...DEFAULT_WANTED];
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, 5);
}

/** Record the player's run in the "মোস্ট ওয়ান্টেড" leaderboard if it makes the top 5. */
export function saveWantedEntry(stageName) {
  const moneyScore = Math.floor(game.damage * 10 + game.fare);
  if (moneyScore < 200) return;
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(WANTED_KEY) || "[]"); } catch { saved = []; }
  saved.push({ name: "আপনি (ওস্তাদ ড্রাইভার)", stage: stageName || "ঢাকা রুট", score: moneyScore, isYou: true });
  saved.sort((a, b) => b.score - a.score);
  try { localStorage.setItem(WANTED_KEY, JSON.stringify(saved.slice(0, 5))); } catch {}
}

function addDamageEvent(e, customWord) {
  game.combo = game.time - lastCrashTime <= C.window ? game.combo + 1 : 1;
  lastCrashTime = game.time;
  const wwMult = game.wrongWay ? CFG.hazards.wrongWayMult : 1;
  e.gained = Math.round(e.damage * comboMult() * wwMult);
  game.damage += e.gained;
  stats.bestCombo = Math.max(stats.bestCombo, game.combo);
  stats.crashes[e.type] = (stats.crashes[e.type] || 0) + 1;
  if (game.combo > 1) emit("combo", { combo: game.combo, mult: comboMult() });
  emit("floatDmg", {
    type: e.type,
    gained: e.gained * 10,
    x: e.x, y: e.y, z: e.z,
    word: customWord || pick(HIT_WORDS),
    wrongWay: game.wrongWay,
  });
}

on("crash", e => addDamageEvent(e));
on("mirrorHit", e => addDamageEvent(e, "🪞 সাইড মিরর!"));
on("rampJump", e => addDamageEvent(e, "🚀 উড়ন্ত বাস!"));

on("heavyHit", e => {
  stats.crashes[e.type] = (stats.crashes[e.type] || 0) + 1;
});

on("fineClosed", e => {
  stats.fines += e.fine;
});
