// The numbers that describe the current run. Every module reads and writes this one
// object, so there is a single place to look when you wonder "where is fuel stored?".
import { CFG } from "./config.js";

export const game = {
  running: false,
  paused: false,
  crashing: false, // true during the slow-motion moment after a heavy hit
  crashT: 0,       // simulation seconds left in that moment
  time: 0,    // seconds of simulation since the page loaded
  speed: 0,   // forward speed
  vx: 0,      // sideways speed (steering)
  accel: 0,   // change in speed per second this step (used to tilt the body)
  boostT: 0,  // seconds of boost left; above 0 means boosting
  invulnT: 0, // seconds left in which the bus can't be hit again
  warn: false,// a heavy hazard is close ahead in our path
  fuel: CFG.fuel.max,
  hp: CFG.hp.max,
  fare: 0,
  points: 0,  // chipa points
  combo: 0,   // chipas in a row
  pass: 0,    // passengers on board
  dist: 0,
  shake: 0,   // camera shake strength, fades over time
};

/** Reset the numbers for a fresh run. (Score numbers are reset in score.js.) */
export function resetGame() {
  game.crashing = false;
  game.crashT = 0;
  game.speed = CFG.bus.startSpeed;
  game.vx = 0;
  game.accel = 0;
  game.boostT = 0;
  game.invulnT = 0;
  game.warn = false;
  game.fuel = CFG.fuel.max;
  game.hp = CFG.hp.max;
  game.fare = 0;
  game.pass = 0;
  game.dist = 0;
  game.shake = 0;
}
