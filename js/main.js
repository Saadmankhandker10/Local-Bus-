// Entry point: starts input, runs the game loop, and handles starting, pausing, and ending a run.
import { CFG } from "./config.js";
import { game, resetGame } from "./state.js";
import { on, emit } from "./events.js";
import { renderer, scene, initWorld, resetWorld, updateWorld } from "./world.js";
import { initInput, pollInput, onTap, onAnyInput } from "./input.js";
import { resetBus, updateBus, updateBusVisual } from "./bus.js";
import { cam, updateCamera, resetCamera } from "./camera.js";
import { resetTraffic, updateTraffic } from "./traffic.js";
import { resetMarks, updateMarks } from "./marks.js";
import { crowd, resetCrowd, updateCrowd, updateCrowdVisual } from "./crowd.js";
import { line, lineFrom, say, updateSpeech, clearSpeech } from "./speech.js";
import { stats, resetScore, saveBest, saveBestTime, totalScore, bestScore } from "./score.js";
import { journey, resetJourney, updateJourney, currentStage, sceneryAt, progress } from "./journey.js";
import { resetLandmarks, updateLandmarks } from "./landmarks.js";
import { applyTimeOfDay } from "./lighting.js";
import { unlockAudio, toggleMute, isMuted, horn, slap } from "./audio.js";
import { ROUTE, TOTAL } from "./route.js";
import { SHOUTS } from "./data/shouts.bn.js";
import { HEAVY_HIT } from "./i18n.js";
import { pick, $ } from "./utils.js";
import { updateHud, onStartPressed, onPauseButton, hideScreen, showPause, showRunEnd, crashList } from "./hud.js";

let endReason = "";   // title of the ending, e.g. "ট্রাকে ধাক্কা!"
let endCause = "";    // what ended it: truck / bus / pillar / caught / fuel / complete
let caughtT = 0;      // seconds left in the "surrounded" moment
let shoutT = 0;       // time of the next crowd shout
let lastEnd = "";     // "fail" or "complete": decides what the main button does
let hornT = 0, shoutBtnT = 0; // earliest time the next horn / shout may play

/**
 * Start a run from the beginning, or from the last checkpoint after a failed run.
 * @param {boolean} fromCheckpoint
 */
function start(fromCheckpoint) {
  resetGame();
  resetScore();
  resetJourney(fromCheckpoint && !!journey.cp);
  resetTraffic(game.dist);
  resetMarks(game.dist);
  resetLandmarks(game.prog);
  resetWorld();
  resetCrowd();
  clearSpeech();
  resetBus(game.prog);
  resetCamera();
  updateWorld();
  updateLandmarks();
  game.running = true;
  setPaused(false);
  hideScreen();
  helperSays(lineFrom("helperStop", currentStage().id));
}

const startMain = () => start(lastEnd === "fail");
const startFresh = () => start(false);

/** The helper speaks from the door: bubble + subtitle + a slap on the bus side. */
function helperSays(text) {
  say("হেল্পার", text, CFG.shout.seconds, true);
  slap();
}

/** Draw one fresh frame and keep it as a JPEG for the newspaper photo. */
function snapshot() {
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL("image/jpeg", CFG.paper.photoQuality);
}

/** Everything the newspaper needs to know about the run. */
function runReport(isRecord, isBestTime) {
  const light = Object.entries(stats.crashes).filter(([k]) => !HEAVY_HIT[k]).reduce((a, [, n]) => a + n, 0);
  return {
    cause: endCause, why: endReason,
    stage: currentStage().name, stageIn: currentStage().nameIn, stageOf: currentStage().nameOf,
    damage: Math.floor(game.damage), fare: Math.floor(game.fare), combo: stats.bestCombo,
    fines: stats.fines, crashes: light, crashList: crashList(),
    km: (Math.min(game.prog, TOTAL) / TOTAL * ROUTE.realKm).toFixed(1), totalKm: ROUTE.realKm,
    time: game.journeyT, score: totalScore(), best: bestScore(), isRecord, isBestTime,
  };
}

function end(why, cause) {
  game.running = false;
  game.crashing = false;
  lastEnd = "fail";
  endReason = why; endCause = cause;
  const photo = snapshot();
  showRunEnd(runReport(saveBest(), false), photo, journey.cp ? ROUTE.stages[journey.cp.stage].name : "");
}

function setPaused(on) {
  game.paused = on && game.running;
  showPause(game.paused);
}

/** P / Esc / pause button toggles pause. A gamepad's Start button also starts a new run. */
function onPauseInput(fromPad) {
  if (game.running) setPaused(!game.paused);
  else if (fromPad) startMain();
}

/* ====== Horn, shout, sound ====== */
function doHorn() {
  if (game.time < hornT) return;
  hornT = game.time + CFG.horn.cooldown;
  horn();
  if (game.running) emit("horn");
}

function doShout() {
  if (!game.running || game.time < shoutBtnT) return;
  shoutBtnT = game.time + CFG.shout.cooldown;
  const s = pick(SHOUTS);
  say(s.who, s.text, CFG.shout.seconds, true);
  if (s.who === "হেল্পার") slap();
}

function doMute() {
  $("soundbtn").textContent = toggleMute() ? "🔇" : "🔊";
}

// A light crash shakes the camera and buzzes the phone.
on("crash", () => {
  game.shake = CFG.hit.shake;
  if (navigator.vibrate) navigator.vibrate(CFG.hit.vibrateMs);
});

// A heavy crash: big shake, then a short slow-motion moment before the game-over screen.
on("heavyHit", e => {
  const C = CFG.crash;
  game.crashing = true;
  game.crashT = C.realSeconds * C.slowMo; // counted in (slowed) simulation time
  game.speed *= C.speedKeep;
  game.boostT = 0;
  game.shake = C.shake;
  if (navigator.vibrate) navigator.vibrate(C.vibrateMs);
  endReason = HEAVY_HIT[e.type];
  endCause = e.type;
});

// The crowd reached the bus: it stops, they stand around it, then the game-over screen.
on("caught", () => {
  game.caught = true;
  game.boostT = 0;
  caughtT = CFG.crowd.caughtSeconds;
  say("পাবলিক", line("crowdCaught"));
});

on("crowdGaveUp", () => say("পাবলিক", line("crowdGaveUp")));

// New stage: the helper shouts the stop name (the HUD shows the stage card).
on("stageArrive", t => helperSays(lineFrom("helperStop", t.stage.id)));

// Reached Dhaka University.
on("journeyComplete", () => {
  game.running = false;
  lastEnd = "complete";
  endReason = "পৌঁছে গেছি! ঢাকা বিশ্ববিদ্যালয় 🎓";
  endCause = "complete";
  helperSays(lineFrom("journeyDone"));
  const photo = snapshot();
  const isBestTime = saveBestTime(game.journeyT);
  showRunEnd(runReport(saveBest(), isBestTime), photo, "");
});

/** Advance the game by exactly one fixed step of dt seconds. */
function step(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * CFG.camera.shakeDecay);
  if (!game.running) return;
  game.journeyT += dt;

  const d = updateBus(dt);
  // Passengers on board keep paying while the bus moves.
  game.fare += game.pass * game.speed * CFG.fare.travelRate * dt;
  game.dist += d;
  updateWorld();
  updateLandmarks();
  updateJourney();
  if (!game.running) return; // the journey just finished

  updateTraffic(dt);
  updateMarks(dt);
  updateCrowd(dt);

  // The crowd shouts while it is close behind the bus.
  if (crowd.active && !game.caught && crowd.gap < CFG.crowd.cueGap && game.time > shoutT) {
    shoutT = game.time + CFG.speech.crowdShoutEvery;
    say("পাবলিক", line("crowdChase"));
  }

  if (game.crashing) {
    game.crashT -= dt;
    if (game.crashT <= 0) end(endReason, endCause);
  }
  else if (game.caught) {
    caughtT -= dt;
    if (caughtT <= 0) end("পাবলিক ঘিরে ফেলেছে!", "caught");
  }
  // Out of fuel in the open: if a crowd is chasing, they will reach the bus; otherwise it is over.
  else if (game.fuel <= 0 && game.speed < .5 && game.onMark !== "cng" && !crowd.active) end("তেল শেষ!", "fuel");
}

/** Draw one frame. dt is the real time since the last frame (0 while paused). */
function render(dt) {
  applyTimeOfDay(progress(game.prog));
  updateBusVisual(dt);
  updateCrowdVisual(dt);
  updateSpeech(dt);
  const boostFx = updateCamera(dt);
  renderer.render(scene, cam);
  updateHud(dt, boostFx);
}

initWorld(sceneryAt);
// Behind the title screen: the bus stand at Mohammadpur, early morning.
resetBus(0);
resetCamera();
updateWorld();
resetLandmarks(0);
updateLandmarks();

initInput(onPauseInput);
onAnyInput(unlockAudio);
onTap("horn", doHorn);
onTap("shout", doShout);
onTap("mute", doMute);
$("soundbtn").textContent = isMuted() ? "🔇" : "🔊";
$("soundbtn").onclick = () => { unlockAudio(); doMute(); };
onStartPressed(startMain, startFresh);
onPauseButton(() => setPaused(!game.paused));
// Switching to another tab pauses the run, so nobody crashes while away.
document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });

// Fixed timestep: the game always simulates in equal 1/60 s steps, no matter how fast
// the screen draws, so the bus drives the same on a slow phone and a fast PC.
const STEP = 1 / CFG.loop.hz;
let acc = 0;
let last = performance.now();
(function loop(now) {
  requestAnimationFrame(loop);
  // Cap the frame time so a long freeze can't trigger hundreds of catch-up steps.
  const frameDt = Math.min(CFG.loop.maxFrameDt, Math.max(0, now - last) / 1000);
  last = now;
  pollInput();
  if (game.paused) acc = 0;
  else {
    // Slow motion simply feeds the simulation less time per real second.
    acc += frameDt * (game.crashing ? CFG.crash.slowMo : 1);
    while (acc >= STEP) { step(STEP); acc -= STEP; }
  }
  render(game.paused ? 0 : frameDt);
})(last);
