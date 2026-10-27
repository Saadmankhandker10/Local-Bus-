// Everything drawn with HTML on top of the 3D view: numbers, bars, messages, screens.
import { CFG } from "./config.js";
import { $ } from "./utils.js";
import { game } from "./state.js";

let msgT = 0; // seconds left before the current message disappears

/** Show a short message in the middle of the screen. */
export function msg(text, ms = 1200) {
  $("msg").textContent = text;
  msgT = ms / 1000;
}

/**
 * Copy the current game numbers into the HUD. Called once per frame.
 * @param {number} boostFx 0..1 strength of the boost effect (for speed lines)
 */
export function updateHud(dt, boostFx) {
  $("fare").textContent = "৳" + Math.floor(game.fare);
  $("pass").textContent = game.pass;
  $("spd").textContent = Math.round(game.speed * CFG.hud.kmhPerSpeed);
  $("dist").textContent = (game.dist / CFG.hud.unitsPerKm).toFixed(1);
  $("fuelbar").style.width = game.fuel + "%";
  $("hpbar").style.width = Math.max(0, game.hp) + "%";
  $("speedlines").style.opacity = (boostFx * CFG.camera.speedLinesOpacity).toFixed(3);
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $("msg").textContent = ""; }
}

/** Call fn when the start / play-again button is pressed. */
export function onStartPressed(fn) {
  $("go").onclick = fn;
}

/** Call fn when the on-screen pause or resume button is pressed. */
export function onPauseButton(fn) {
  $("pausebtn").onclick = fn;
  $("resume").onclick = fn;
}

export function hideScreen() {
  $("screen").style.display = "none";
  $("pausebtn").hidden = false;
  // Move focus off the start button, or Space (boost) would "click" it again.
  document.activeElement?.blur();
}

/** Show or hide the pause overlay. */
export function showPause(on) {
  $("pause").hidden = !on;
  if (!on) document.activeElement?.blur();
}

/** Show the game-over screen with the reason and the run summary. */
export function showEndScreen(why) {
  $("screen").style.display = "flex";
  $("pausebtn").hidden = true;
  $("title").textContent = why;
  $("sub").innerHTML = `মোট ভাড়া: ৳${Math.floor(game.fare)}<br>দূরত্ব: ${(game.dist / CFG.hud.unitsPerKm).toFixed(1)} কিমি`;
  $("go").textContent = "আবার চালান";
}
