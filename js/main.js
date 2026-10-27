// Entry point: starts input, runs the game loop, and handles starting, pausing, and ending a run.
import { CFG } from "./config.js";
import { game, resetGame } from "./state.js";
import { on } from "./events.js";
import { renderer, scene, scrollWorld, setScenery, dressAll } from "./world.js";
import { initInput, pollInput } from "./input.js";
import { resetBus, updateBus, updateBusVisual } from "./bus.js";
import { cam, updateCamera } from "./camera.js";
import { resetTraffic, updateTraffic } from "./traffic.js";
import { resetMarks, updateMarks } from "./marks.js";
import { crowd, resetCrowd, updateCrowd, updateCrowdVisual } from "./crowd.js";
import { line, lineFrom, say, updateSpeech, clearSpeech } from "./speech.js";
import { resetScore, saveBest, saveBestTime } from "./score.js";
import { journey, resetJourney, updateJourney, currentStage, sceneryAt, progress } from "./journey.js";
import { resetLandmarks, updateLandmarks } from "./landmarks.js";
import { applyTimeOfDay } from "./lighting.js";
import { ROUTE } from "./route.js";
import { HEAVY_HIT } from "./i18n.js";
import { updateHud, onStartPressed, onPauseButton, hideScreen, showPause, showEndScreen, showCompleteScreen } from "./hud.js";

let endReason = "";
let caughtT = 0;      // seconds left in the "surrounded" moment
let shoutT = 0;       // time of the next crowd shout
let lastEnd = "";     // "fail" or "complete": decides what the main button does

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
  resetLandmarks(game.dist);
  dressAll(game.dist);
  resetCrowd();
  clearSpeech();
  resetBus();
  game.running = true;
  setPaused(false);
  hideScreen();
  say("হেল্পার", lineFrom("helperStop", currentStage().id));
}

const startMain = () => start(lastEnd === "fail");
const startFresh = () => start(false);

function end(why) {
  game.running = false;
  game.crashing = false;
  lastEnd = "fail";
  showEndScreen(why, saveBest(), journey.cp ? ROUTE.stages[journey.cp.stage].name : "");
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
on("stageArrive", t => say("হেল্পার", lineFrom("helperStop", t.stage.id)));

// Reached Dhaka University.
on("journeyComplete", () => {
  game.running = false;
  lastEnd = "complete";
  const isBestTime = saveBestTime(game.journeyT);
  showCompleteScreen(saveBest(), isBestTime, lineFrom("journeyDone"));
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
  scrollWorld(d, game.dist);
  updateLandmarks(d);
  updateJourney();
  if (!game.running) return; // the journey just finished

  updateTraffic(dt);
  updateMarks(dt, d);
  updateCrowd(dt);

  // The crowd shouts while it is close behind the bus.
  if (crowd.active && !game.caught && crowd.gap < CFG.crowd.cueGap && game.time > shoutT) {
    shoutT = game.time + CFG.speech.crowdShoutEvery;
    say("পাবলিক", line("crowdChase"));
  }

  if (game.crashing) {
    game.crashT -= dt;
    if (game.crashT <= 0) end(endReason);
  }
  else if (game.caught) {
    caughtT -= dt;
    if (caughtT <= 0) end("পাবলিক ঘিরে ফেলেছে!");
  }
  // Out of fuel in the open: if a crowd is chasing, they will reach the bus; otherwise it is over.
  else if (game.fuel <= 0 && game.speed < .5 && game.onMark !== "cng" && !crowd.active) end("তেল শেষ!");
}

/** Draw one frame. dt is the real time since the last frame (0 while paused). */
function render(dt) {
  applyTimeOfDay(progress(game.dist));
  updateBusVisual(dt);
  updateCrowdVisual(dt);
  updateSpeech(dt);
  const boostFx = updateCamera(dt);
  renderer.render(scene, cam);
  updateHud(dt, boostFx);
}

setScenery(sceneryAt);
// Behind the title screen: the bus stand at Mohammadpur, early morning.
resetLandmarks(0);
updateLandmarks(0);
dressAll(0);

initInput(onPauseInput);
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
