// Turns keyboard, touch buttons, and gamepads into one set of actions.
// The game only reads `input.throttle`, `input.steer` etc., so it never cares
// which device the player is using.
import { CFG } from "./config.js";
import { $, clamp } from "./utils.js";

/** The combined player input, refreshed once per frame by pollInput(). */
export const input = {
  throttle: 0, // 0..1
  brake: 0,    // 0..1
  steer: 0,    // -1 (left) .. 1 (right)
  boost: false,
};

const held = {}; // actions held on keyboard or touch buttons

const KEY_MAP = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  // Right Shift too: some keyboards can't register Up + Left + Space at the same time.
  ShiftLeft: "boost", ShiftRight: "boost", Space: "boost",
};
const PAUSE_KEYS = ["KeyP", "Escape"];
// One-shot actions: they fire once per press (not while held).
const TAP_KEYS = { KeyH: "horn", KeyG: "shout", KeyM: "mute" };
const TAP_TOUCH = [["thorn", "horn"], ["tshout", "shout"]];

const TOUCH_MAP = [["tl", "left"], ["tr", "right"], ["tb", "down"], ["tg", "up"], ["tboost", "boost"]];

// Standard gamepad button numbers (same on Xbox and PlayStation pads in the browser).
const PAD = { A: 0, X: 2, Y: 3, RB: 5, LT: 6, RT: 7, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

let onPause = () => {};
let padStartWasDown = false;
const padWasDown = { horn: false, shout: false };
const tapHandlers = {};   // action name -> function
const PAD_TAP = { horn: false, shout: false }; // reused every frame (no new objects)
let onFirstInput = () => {};

/**
 * Start listening to keyboard and on-screen buttons.
 * @param {(fromPad: boolean) => void} pauseHandler called when P / Esc / pad Start is pressed
 */
export function initInput(pauseHandler) {
  // Any first key or tap unlocks audio (browsers block sound until the player interacts).
  for (const ev of ["keydown", "pointerdown"]) addEventListener(ev, () => onFirstInput(), { capture: true });
  onPause = pauseHandler;

  addEventListener("keydown", e => {
    if (KEY_MAP[e.code]) { held[KEY_MAP[e.code]] = true; e.preventDefault(); }
    else if (PAUSE_KEYS.includes(e.code) && !e.repeat) onPause(false);
    else if (TAP_KEYS[e.code] && !e.repeat) tapHandlers[TAP_KEYS[e.code]]?.();
  });
  addEventListener("keyup", e => {
    if (KEY_MAP[e.code]) held[KEY_MAP[e.code]] = false;
  });
  // If the window loses focus, keyup never arrives, so let go of everything.
  addEventListener("blur", () => { for (const k in held) held[k] = false; });

  for (const [id, action] of TOUCH_MAP) {
    const el = $(id);
    el.addEventListener("pointerdown", e => { held[action] = true; e.preventDefault(); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, () => held[action] = false);
  }
  for (const [id, action] of TAP_TOUCH) {
    $(id).addEventListener("pointerdown", e => { e.preventDefault(); tapHandlers[action]?.(); });
  }
}

/** Read a gamepad stick axis, ignoring tiny movements near the centre. */
function axis(v) {
  const dead = CFG.input.stickDeadzone;
  if (Math.abs(v) < dead) return 0;
  return Math.sign(v) * (Math.abs(v) - dead) / (1 - dead);
}

/** Combine keyboard, touch, and gamepads into `input`. Call once per frame. */
export function pollInput() {
  let padSteer = 0, padThrottle = 0, padBrake = 0, padBoost = false, padStart = false;
  const padTap = PAD_TAP; padTap.horn = padTap.shout = false;
  // Gamepads can't send events for held buttons, so we ask for their state every frame.
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const btn = i => (p.buttons[i] ? p.buttons[i].value : 0);
    padSteer += axis(p.axes[0] || 0) + btn(PAD.RIGHT) - btn(PAD.LEFT);
    padThrottle = Math.max(padThrottle, btn(PAD.RT), btn(PAD.UP));
    padBrake = Math.max(padBrake, btn(PAD.LT), btn(PAD.DOWN));
    padBoost = padBoost || btn(PAD.A) > .5 || btn(PAD.RB) > .5;
    padStart = padStart || btn(PAD.START) > .5;
    padTap.horn = padTap.horn || btn(PAD.Y) > .5;
    padTap.shout = padTap.shout || btn(PAD.X) > .5;
  }

  input.steer = clamp((held.right ? 1 : 0) - (held.left ? 1 : 0) + padSteer, -1, 1);
  input.throttle = Math.max(held.up ? 1 : 0, padThrottle);
  input.brake = Math.max(held.down ? 1 : 0, padBrake);
  input.boost = !!held.boost || padBoost;

  // Fire pause only on the moment Start goes down, not every frame it is held.
  if (padStart && !padStartWasDown) onPause(true);
  padStartWasDown = padStart;
  for (const a in padTap) {
    if (padTap[a] && !padWasDown[a]) tapHandlers[a]?.();
    padWasDown[a] = padTap[a];
  }
}

/** Run fn when a one-shot action happens: "horn", "shout", or "mute". */
export function onTap(action, fn) {
  tapHandlers[action] = fn;
}

/** Run fn on every key press or tap (used to unlock audio). */
export function onAnyInput(fn) {
  onFirstInput = fn;
}
