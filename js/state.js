// The numbers that describe the current run. Every module reads and writes this one
// object, so there is a single place to look when you wonder "where is fuel stored?".
import { CFG } from "./config.js";

export const game = {
  running: false,
  paused: false,
  crashing: false, // true during the slow-motion moment after a heavy hit
  crashT: 0,       // simulation seconds left in that moment
  caught: false,   // true while the crowd surrounds the bus (just before game over)
  time: 0,    // seconds of simulation since the page loaded
  speed: 0,   // forward speed
  vx: 0,      // sideways speed (steering)
  lat: 0,     // how far right of the road centre the bus is
  yaw: 0,     // which way the bus points, compared with the road (radians, right = +)
  prog: 0,    // journey progress along the main route (0 .. route length)
  accel: 0,   // change in speed per second this step (used to tilt the body)
  boostT: 0,  // seconds of boost left; above 0 means boosting
  invulnT: 0, // seconds left in which heavy things can't end the run
  warn: false,// a heavy hazard is close ahead in our path
  fuel: CFG.fuel.max,
  hp: CFG.bus.maxHp,     // bus body & window health (0..100)
  comfort: CFG.comfort.max, // passenger comfort / patience (0..100)
  fare: 0,
  damage: 0,  // Damage score from crashes
  combo: 0,   // crashes in a row
  pass: 0,    // passengers on board
  dist: 0,
  journeyT: 0, // seconds since the journey started (kept across checkpoints)
  shake: 0,   // camera shake strength, fades over time
  onMark: "", // "cng" or "police" while the bus stands on that mark
  wrongWay: false, // true when driving on the right-hand (oncoming) side of the median island
  busY: 0,         // vertical height of the bus above the road (when jumping ramps / trenches)
  busVy: 0,        // vertical velocity of the bus
  autopilot: true, // true while the menu background autopilot demo is running
  startStage: -1,  // -1 = rotate automatically each run, or 0..3 for a specific Dhaka spot
  morName: "মোহাম্মদপুর বাসস্ট্যান্ড", // current Dhaka intersection / live TV location badge
};

/** Reset the numbers for a fresh run. (Score and crowd are reset in their own modules.) */
export function resetGame() {
  game.crashing = false;
  game.crashT = 0;
  game.caught = false;
  game.speed = CFG.bus.startSpeed;
  game.vx = 0;
  game.lat = -2.5; // start in the left (correct) lane of the two-way boulevard
  game.yaw = 0;
  game.prog = 0;
  game.accel = 0;
  game.boostT = 0;
  game.invulnT = 0;
  game.warn = false;
  game.fuel = CFG.fuel.max;
  game.hp = CFG.bus.maxHp;
  game.comfort = CFG.comfort.max;
  game.fare = 0;
  game.pass = 0;
  game.dist = 0;
  game.shake = 0;
  game.onMark = "";
  game.wrongWay = false;
  game.busY = 0;
  game.busVy = 0;
}
