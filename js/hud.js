// Everything drawn with HTML on top of the 3D view: numbers, bars, messages, screens.
import { CFG } from "./config.js";
import { $ } from "./utils.js";
import { game } from "./state.js";
import { on } from "./events.js";
import { stats, comboMult, totalScore, bestScore } from "./score.js";
import { NAMES, bnNum } from "./i18n.js";

let msgT = 0; // seconds left before the current message disappears

/** Show a short message in the middle of the screen. */
export function msg(text, ms = 1200) {
  $("msg").textContent = text;
  msgT = ms / 1000;
}

// Restarting a CSS animation needs a reflow in between, or the browser skips it.
function pop(el) {
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

on("chipa", e => {
  const mult = comboMult();
  $("chipaPop").textContent = `চিপা! +${e.gained}` + (game.combo > 1 ? `  x${mult}` : "");
  pop($("chipaPop"));
});

on("crash", e => msg(`ধাক্কা! ${NAMES[e.type]} — ক্ষতিপূরণ ৳${e.fine}`, 1100));

/**
 * Copy the current game numbers into the HUD. Called once per frame.
 * @param {number} boostFx 0..1 strength of the boost effect (for speed lines)
 */
export function updateHud(dt, boostFx) {
  $("fare").textContent = "৳" + Math.floor(game.fare);
  $("points").textContent = Math.floor(game.points);
  $("combo").textContent = game.combo > 1 ? `x${comboMult()}` : "";
  $("pass").textContent = game.pass;
  $("spd").textContent = Math.round(game.speed * CFG.hud.kmhPerSpeed);
  $("dist").textContent = (game.dist / CFG.hud.unitsPerKm).toFixed(1);
  $("fuelbar").style.width = game.fuel + "%";
  $("hpbar").style.width = Math.max(0, game.hp) + "%";
  $("speedlines").style.opacity = (boostFx * CFG.camera.speedLinesOpacity).toFixed(3);
  // Red warning: text + icon (not colour alone) and a soft red glow at the screen edges.
  const warn = game.running && game.warn;
  $("warn").hidden = !warn;
  $("vignette").style.opacity = warn ? (.35 + .25 * Math.sin(game.time * Math.PI * 2 * CFG.warning.pulseHz)).toFixed(3) : "0";
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
  $("msg").textContent = "";
  // Move focus off the start button, or Space (boost) would "click" it again.
  document.activeElement?.blur();
}

/** Show or hide the pause overlay. */
export function showPause(on) {
  $("pause").hidden = !on;
  if (!on) document.activeElement?.blur();
}

/** Show the game-over screen with the reason and the run summary. */
export function showEndScreen(why, isRecord) {
  $("screen").style.display = "flex";
  $("pausebtn").hidden = true;
  $("warn").hidden = true;
  $("vignette").style.opacity = "0";
  $("title").textContent = why;
  const crashes = Object.entries(stats.crashes).map(([k, n]) => `${NAMES[k]} ${bnNum(n)}`).join(", ") || "একটাও না 👏";
  $("sub").innerHTML =
    `<b style="font-size:26px">স্কোর: ${totalScore()}</b>${isRecord ? " 🏆 নতুন রেকর্ড!" : ""}<br>` +
    `সেরা স্কোর: ${bestScore()}<br><br>` +
    `ভাড়া: ৳${Math.floor(game.fare)} &nbsp; চিপা পয়েন্ট: ${Math.floor(game.points)}<br>` +
    `চিপা: ${stats.chipas} বার &nbsp; সেরা কম্বো: x${stats.bestCombo}<br>` +
    `দূরত্ব: ${(game.dist / CFG.hud.unitsPerKm).toFixed(1)} কিমি<br>` +
    `ধাক্কা: ${crashes}`;
  $("go").textContent = "আবার চালান";
}
