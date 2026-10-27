// Picks lines from the dialogue data and shows them in the subtitle strip.
// (Speech bubbles above characters and optional voice come in a later milestone.)
import { CFG } from "./config.js";
import { pick, $ } from "./utils.js";
import { DIALOGUE } from "./data/dialogue.bn.js";

let subT = 0; // seconds left before the subtitle hides

/** A random line for a situation, respecting the rudeness setting. */
export function line(situation) {
  const levels = DIALOGUE[situation];
  const pool = [];
  for (let lvl = 0; lvl <= CFG.speech.rudeness; lvl++) pool.push(...(levels[lvl] || []));
  return pool.length ? pick(pool) : "";
}

/** Show who says what in the subtitle strip at the bottom. */
export function say(who, text, seconds = CFG.speech.subtitleSeconds) {
  if (!text) return;
  $("subtitle").textContent = `${who}: ${text}`;
  $("subtitle").hidden = false;
  subT = seconds;
}

/** Count down the subtitle. Call once per frame. */
export function updateSpeech(dt) {
  if (subT > 0) { subT -= dt; if (subT <= 0) $("subtitle").hidden = true; }
}

/** Hide any subtitle right away (new run). */
export function clearSpeech() {
  subT = 0;
  $("subtitle").hidden = true;
}
