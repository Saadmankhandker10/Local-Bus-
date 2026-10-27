// Turns keyboard and touch buttons into simple actions: up, down, left, right, boost.
// Game code only reads `keys.up` etc., so adding gamepad later won't touch anything else.
import { $ } from "./utils.js";

/** Current state of each action (true while held). */
export const keys = {};

const KEY_MAP = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ShiftLeft: "boost", ShiftRight: "boost", Space: "boost",
};

const TOUCH_MAP = [["tl", "left"], ["tr", "right"], ["tb", "down"], ["tg", "up"]];

/** Start listening to keyboard and on-screen buttons. */
export function initInput() {
  addEventListener("keydown", e => {
    if (KEY_MAP[e.code]) { keys[KEY_MAP[e.code]] = true; e.preventDefault(); }
  });
  addEventListener("keyup", e => {
    if (KEY_MAP[e.code]) keys[KEY_MAP[e.code]] = false;
  });

  for (const [id, action] of TOUCH_MAP) {
    const el = $(id);
    el.addEventListener("pointerdown", e => { keys[action] = true; e.preventDefault(); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, () => keys[action] = false);
  }
}
