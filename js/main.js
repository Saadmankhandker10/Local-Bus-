// Entry point: starts input, runs the game loop, and handles starting, pausing, and ending a run.
import { CFG } from "./config.js";
import { game, resetGame } from "./state.js";
import { on } from "./events.js";
import { renderer, scene, scrollWorld } from "./world.js";
import { initInput, pollInput } from "./input.js";
import { resetBus, updateBus, updateBusVisual } from "./bus.js";
import { cam, updateCamera } from "./camera.js";
import { resetTraffic, updateTraffic } from "./traffic.js";
import { resetMarks, updateMarks } from "./marks.js";
import { resetScore, saveBest } from "./score.js";
import { HEAVY_HIT } from "./i18n.js";
import { updateHud, onStartPressed, onPauseButton, hideScreen, showPause, showEndScreen } from "./hud.js";

let endReason = "";

function start() {
  resetTraffic();
  resetMarks();
  resetGame();
  resetScore();
  resetBus();
  game.running = true;
  setPaused(false);
  hideScreen();
}

function end(why) {
  game.running = false;
  game.crashing = false;
  showEndScreen(why, saveBest());
}

function setPaused(on) {
  game.paused = on && game.running;
  showPause(game.paused);
}

/** P / Esc / pause button toggles pause. A gamepad's Start button also starts a new run. */
function onPauseInput(fromPad) {
  if (game.running) setPaused(!game.paused);
  else if (fromPad) start();
}

// A light crash shakes the camera and buzzes the phone.
on("crash", () => {
  game.shake = CFG.hp.hitShake;
  if (navigator.vibrate) navigator.vibrate(CFG.hp.hitVibrateMs);
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

/** Advance the game by exactly one fixed step of dt seconds. */
function step(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * CFG.camera.shakeDecay);
  // Behind the title / game-over screen the road keeps rolling slowly.
  if (!game.running) { scrollWorld(CFG.world.idleScrollSpeed * dt); return; }

  const d = updateBus(dt);
  // Passengers on board keep paying while the bus moves.
  game.fare += game.pass * game.speed * CFG.fare.travelRate * dt;
  game.dist += d;
  scrollWorld(d);

  updateTraffic(dt);
  updateMarks(dt, d);

  if (game.crashing) {
    game.crashT -= dt;
    if (game.crashT <= 0) end(endReason);
  }
  else if (game.hp <= 0) end("বাস ভেঙে গেছে!");
  else if (game.fuel <= 0 && game.speed < .5) end("তেল শেষ!");
}

/** Draw one frame. dt is the real time since the last frame (0 while paused). */
function render(dt) {
  updateBusVisual(dt);
  const boostFx = updateCamera(dt);
  renderer.render(scene, cam);
  updateHud(dt, boostFx);
}

initInput(onPauseInput);
onStartPressed(start);
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
