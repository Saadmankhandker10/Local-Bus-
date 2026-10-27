// Entry point: starts input, runs the game loop, and handles starting and ending a run.
import { CFG } from "./config.js";
import { game, resetGame } from "./state.js";
import { scrollWorld, renderWorld } from "./world.js";
import { initInput } from "./input.js";
import { bus, resetBus, updateBus } from "./bus.js";
import { resetTraffic, updateTraffic } from "./traffic.js";
import { resetMarks, updateMarks } from "./marks.js";
import { updateHud, onStartPressed, hideScreen, showEndScreen } from "./hud.js";

function start() {
  resetTraffic();
  resetMarks();
  resetGame();
  resetBus();
  game.running = true;
  hideScreen();
}

function end(why) {
  game.running = false;
  showEndScreen(why);
}

/** Advance the game by dt seconds. */
function step(dt) {
  game.time += dt;
  // Behind the title / game-over screen the road keeps rolling slowly.
  if (!game.running) { scrollWorld(CFG.world.idleScrollSpeed * dt); return; }

  const d = updateBus(dt);
  // Passengers on board keep paying while the bus moves.
  game.fare += game.pass * game.speed * CFG.fare.travelRate * dt;
  game.dist += d;
  scrollWorld(d);

  updateTraffic(dt);
  updateMarks(dt, d);

  if (game.hp <= 0) end("বাস ভেঙে গেছে!");
  else if (game.fuel <= 0 && game.speed < .5) end("তেল শেষ!");
}

function render(dt) {
  game.shake = Math.max(0, game.shake - dt * CFG.camera.shakeDecay);
  renderWorld(dt, bus.position.x, game.speed, game.shake);
  updateHud(dt);
}

initInput();
onStartPressed(start);

let last = performance.now();
(function loop(now) {
  requestAnimationFrame(loop);
  // Cap dt so a lag spike (or a background tab) can't teleport the bus.
  const dt = Math.min(CFG.render.maxDt, (now - last) / 1000);
  last = now;
  step(dt);
  render(dt);
})(last);
