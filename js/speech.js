// Picks lines from the dialogue data and shows them: a subtitle strip at the bottom,
// and for people on the bus a speech bubble that follows the bus door on screen.
import * as THREE from "three";
import { CFG } from "./config.js";
import { pick, $ } from "./utils.js";
import { DIALOGUE } from "./data/dialogue.bn.js";
import { cam } from "./camera.js";
import { bus } from "./bus.js";

const S = CFG.speech;
let subT = 0;     // seconds left before the subtitle hides
let bubbleT = 0;  // seconds left before the bubble hides
const anchor = new THREE.Vector3(); // reused for projecting the bubble position

/** A random line for a situation, respecting the rudeness setting. */
export function line(situation) {
  const levels = DIALOGUE[situation];
  const pool = [];
  for (let lvl = 0; lvl <= S.rudeness; lvl++) pool.push(...(levels[lvl] || []));
  return pool.length ? pick(pool) : "";
}

/** A random line from a plain list, or from a list inside a group (e.g. helperStop.dhanmondi). */
export function lineFrom(situation, key) {
  const list = key ? DIALOGUE[situation]?.[key] : DIALOGUE[situation];
  return list && list.length ? pick(list) : "";
}

/**
 * Show who says what in the subtitle strip at the bottom.
 * @param {boolean} onBus true for the helper / driver: also show a bubble at the bus door
 */
export function say(who, text, seconds = S.subtitleSeconds, onBus = false) {
  if (!text) return;
  $("subtitle").textContent = `${who}: ${text}`;
  $("subtitle").hidden = false;
  subT = seconds;
  if (onBus) {
    $("bubble").textContent = text;
    $("bubble").hidden = false;
    bubbleT = seconds;
  }
}

/** Count down the subtitle and keep the bubble above the bus door. Call once per frame. */
export function updateSpeech(dt) {
  if (subT > 0) { subT -= dt; if (subT <= 0) $("subtitle").hidden = true; }
  if (bubbleT > 0) {
    bubbleT -= dt;
    if (bubbleT <= 0) { $("bubble").hidden = true; return; }
    // 3D point above the front door -> screen pixels.
    anchor.set(bus.position.x + S.bubbleX, S.bubbleY, S.bubbleZ).project(cam);
    $("bubble").style.left = ((anchor.x + 1) / 2 * innerWidth).toFixed(0) + "px";
    $("bubble").style.top = ((1 - anchor.y) / 2 * innerHeight).toFixed(0) + "px";
  }
}

/** Hide any subtitle and bubble right away (new run). */
export function clearSpeech() {
  subT = bubbleT = 0;
  $("subtitle").hidden = true;
  $("bubble").hidden = true;
}
