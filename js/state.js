// The numbers that describe the current run. Every module reads and writes this one
// object, so there is a single place to look when you wonder "where is fuel stored?".
import { CFG } from "./config.js";

export const game = {
  running: false,
  time: 0,    // seconds since the page loaded
  speed: 0,
  fuel: CFG.fuel.max,
  hp: CFG.hp.max,
  fare: 0,
  pass: 0,    // passengers on board
  dist: 0,
  shake: 0,   // camera shake strength, fades over time
};

/** Reset the numbers for a fresh run. */
export function resetGame() {
  game.speed = CFG.bus.startSpeed;
  game.fuel = CFG.fuel.max;
  game.hp = CFG.hp.max;
  game.fare = 0;
  game.pass = 0;
  game.dist = 0;
}
