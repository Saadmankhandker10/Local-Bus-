// Everything drawn with HTML on top of the 3D view: numbers, bars, route progress,
// stage cards, messages, and screens.
import { CFG } from "./config.js";
import { $, clamp } from "./utils.js";
import { game } from "./state.js";
import { on } from "./events.js";
import { stats, comboMult, totalScore, bestScore, bestTime } from "./score.js";
import { crowd } from "./crowd.js";
import { ROUTE, TOTAL } from "./route.js";
import { progress } from "./journey.js";
import { NAMES, bnNum } from "./i18n.js";

let msgT = 0;   // seconds left before the current message disappears
let cardT = 0;  // seconds left before the stage card hides

/** Show a short message in the middle of the screen. */
export function msg(text, ms = 1200) {
  $("msg").textContent = text;
  msgT = ms / 1000;
}

/** Seconds as m:ss in Bangla digits. */
export function clock(seconds) {
  const s = Math.round(seconds);
  return bnNum(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
}

// Restarting a CSS animation needs a reflow in between, or the browser skips it.
function pop(el) {
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

/* ====== Route progress bar (built once from route.js) ====== */
for (const st of ROUTE.stages) {
  const seg = document.createElement("div");
  seg.className = "seg";
  seg.style.flexGrow = st.length;
  seg.textContent = st.name;
  $("ptrack").appendChild(seg);
}

/* ====== Event reactions ====== */
on("crash", e => {
  $("dmgPop").textContent = `${NAMES[e.type]}! +${e.gained}` + (game.combo > 1 ? `  কম্বো x${comboMult()}` : "");
  pop($("dmgPop"));
});
on("chaseStart", () => msg("পাবলিক দৌড়াচ্ছে! পালান! 🏃", 1400));
on("crowdGaveUp", () => msg("পাবলিক হাল ছেড়ে দিল 😅", 1400));
on("refuel", () => msg("সিএনজি ভরা হচ্ছে… ⛽", 900));

on("stageArrive", t => {
  $("cardTitle").textContent = `ধাপ ${bnNum(t.index + 1)} — ${t.stage.card}`;
  $("cardBody").textContent =
    `নামলেন ${bnNum(t.off)} জন, উঠলেন ${bnNum(t.on)} জন · এই ধাপে ড্যামেজ +${t.damage} · ভাড়া +৳${t.fare}`;
  $("stagecard").hidden = false;
  pop($("stagecard"));
  cardT = CFG.journey.cardSeconds;
});

/**
 * Copy the current game numbers into the HUD. Called once per frame.
 * @param {number} boostFx 0..1 strength of the boost effect (for speed lines)
 */
export function updateHud(dt, boostFx) {
  $("fare").textContent = "৳" + Math.floor(game.fare);
  $("damage").textContent = Math.floor(game.damage);
  $("combo").textContent = game.combo > 1 ? `x${comboMult()}` : "";
  $("pass").textContent = game.pass;
  $("spd").textContent = Math.round(game.speed * CFG.hud.kmhPerSpeed);
  // The route is scaled so the whole trip reads as the real ~7 km.
  $("dist").textContent = (Math.min(game.dist, TOTAL) / TOTAL * ROUTE.realKm).toFixed(1);
  $("fuelbar").style.width = game.fuel + "%";
  $("fuelbox").classList.toggle("low", game.fuel < CFG.hud.lowFuel);
  $("speedlines").style.opacity = (boostFx * CFG.camera.speedLinesOpacity).toFixed(3);
  $("pbus").style.left = (progress(game.dist) * 100).toFixed(2) + "%";

  // Crowd: a bar that fills as they get closer, plus an orange glow at the bottom edge
  // (the crowd is behind the bus, so the cue is where they come from).
  const chasing = game.running && crowd.active;
  $("crowdbox").hidden = !chasing;
  const close = chasing ? clamp(1 - (crowd.gap - CFG.crowd.catchGap) / (CFG.crowd.cueGap - CFG.crowd.catchGap), 0, 1) : 0;
  $("crowdbar").style.width = (close * 100).toFixed(1) + "%";
  $("crowdcue").style.opacity = close.toFixed(3);

  // Red warning: text + icon (not colour alone) and a soft red glow at the screen edges.
  const warn = game.running && game.warn;
  $("warn").hidden = !warn;
  $("vignette").style.opacity = warn ? (.35 + .25 * Math.sin(game.time * Math.PI * 2 * CFG.warning.pulseHz)).toFixed(3) : "0";
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $("msg").textContent = ""; }
  if (cardT > 0) { cardT -= dt; if (cardT <= 0) $("stagecard").hidden = true; }
}

/** Call fns when the main button (start / from checkpoint) or the "from the start" button is pressed. */
export function onStartPressed(main, fromStart) {
  $("go").onclick = main;
  $("restart").onclick = fromStart;
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
  $("stagecard").hidden = true;
  cardT = 0;
  // Move focus off the start button, or Space (boost) would "click" it again.
  document.activeElement?.blur();
}

/** Show or hide the pause overlay. */
export function showPause(on) {
  $("pause").hidden = !on;
  if (!on) document.activeElement?.blur();
}

function showScreen(title, html) {
  $("screen").style.display = "flex";
  $("pausebtn").hidden = true;
  $("warn").hidden = true;
  $("crowdbox").hidden = true;
  $("stagecard").hidden = true;
  $("vignette").style.opacity = "0";
  $("crowdcue").style.opacity = "0";
  $("title").textContent = title;
  $("sub").innerHTML = html;
}

function crashList() {
  return Object.entries(stats.crashes).map(([k, n]) => `${NAMES[k]} ${bnNum(n)}`).join(", ") || "একটাও না";
}

/**
 * Show the game-over screen.
 * @param {string} why title text
 * @param {boolean} isRecord new best score
 * @param {string} checkpointName name of the last checkpoint stage, or "" if none
 */
export function showEndScreen(why, isRecord, checkpointName) {
  showScreen(why,
    `<b style="font-size:26px">স্কোর: ${totalScore()}</b>${isRecord ? " 🏆 নতুন রেকর্ড!" : ""}<br>` +
    `সেরা স্কোর: ${bestScore()}<br><br>` +
    `ড্যামেজ: ${Math.floor(game.damage)} &nbsp; ভাড়া: ৳${Math.floor(game.fare)}<br>` +
    `সেরা কম্বো: x${stats.bestCombo} &nbsp; জরিমানা দিয়েছেন: ৳${stats.fines}<br>` +
    `পথ: ${(Math.min(game.dist, TOTAL) / TOTAL * ROUTE.realKm).toFixed(1)} / ${ROUTE.realKm} কিমি<br>` +
    `ধাক্কা: ${crashList()}`);
  const pct = Math.round(CFG.journey.checkpointPenalty * 100);
  $("go").textContent = checkpointName ? `${checkpointName} থেকে আবার (স্কোর −${bnNum(pct)}%)` : "আবার চালান";
  $("restart").hidden = !checkpointName;
}

/** Show the journey-complete screen. */
export function showCompleteScreen(isRecord, isBestTime, message) {
  showScreen("পৌঁছে গেছি! ঢাকা বিশ্ববিদ্যালয় 🎓",
    `<i>"${message}"</i><br><br>` +
    `<b style="font-size:26px">স্কোর: ${totalScore()}</b>${isRecord ? " 🏆 নতুন রেকর্ড!" : ""}<br>` +
    `সময়: ${clock(game.journeyT)}${isBestTime ? " ⏱ সবচেয়ে দ্রুত!" : ""} &nbsp; সেরা সময়: ${clock(bestTime())}<br><br>` +
    `ড্যামেজ: ${Math.floor(game.damage)} &nbsp; ভাড়া: ৳${Math.floor(game.fare)} &nbsp; যাত্রী: ${bnNum(game.pass)}<br>` +
    `সেরা কম্বো: x${stats.bestCombo} &nbsp; জরিমানা: ৳${stats.fines}<br>` +
    `ধাক্কা: ${crashList()}`);
  $("go").textContent = "আবার যাত্রা";
  $("restart").hidden = true;
}
