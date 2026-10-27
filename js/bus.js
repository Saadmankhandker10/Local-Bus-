// The player's bus: its 3D model, arcade driving physics, and fuel use.
import * as THREE from "three";
import { CFG } from "./config.js";
import { clamp } from "./utils.js";
import { scene, box, plate } from "./world.js";
import { input } from "./input.js";
import { game } from "./state.js";
import { SEGS, here, sample, place, fromProgress, progressOf } from "./map.js";

const B = CFG.bus;

// The bus is built in layers so the look can move without moving the physics:
//   bus   -> position on the road (physics) + turning of the nose (yaw)
//   body  -> lean in turns (roll) and dip on braking (pitch)
//   wheels stay under `bus`, so they never lean with the body.
export const bus = new THREE.Group();
const body = new THREE.Group();
bus.add(body);

const wheels = [];
const CRASHED = Object.freeze({ throttle: 0, brake: 1, steer: 0, boost: false });
// One shared tail-light material, so both lights glow together when braking.
const tailMat = new THREE.MeshLambertMaterial({ color: 0xff1111, emissive: 0xff0000, emissiveIntensity: 0.3 });

/** Build the green Dhaka local bus out of simple boxes. */
function buildBus() {
  body.add(box(2.6, 2.3, 7, 0x2e7d32, 0, 1.5, 0));       // body
  body.add(box(2.62, .45, 7.02, 0xfdd835, 0, .95, 0));   // yellow stripe
  body.add(box(2.64, .8, 5.8, 0x263238, 0, 2.2, .3));    // side windows
  body.add(box(2.2, .8, .05, 0x263238, 0, 2.2, -3.52));  // windscreen
  body.add(box(2.4, .15, 6.8, 0xeeeeee, 0, 2.72, 0));    // roof

  // Wheels share one geometry and material: the GPU stores them once.
  const tyreGeo = new THREE.CylinderGeometry(B.wheelRadius, B.wheelRadius, .4, 12);
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const s of [-1, 1]) {
    body.add(box(.4, .3, .1, 0xffffaa, s * .9, 1.0, -3.52)); // headlight
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.3, .25, .1), tailMat);
    tail.position.set(s * 1.0, 1.0, 3.52); body.add(tail);

    for (const z of [-2.3, 2.3]) {
      const w = new THREE.Group();               // spins around the axle (x axis)
      w.position.set(s * 1.3, B.wheelRadius, z);
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.rotation.z = Math.PI / 2;
      w.add(tyre);
      w.add(box(.42, .12, B.wheelRadius * 1.6, 0x9e9e9e)); // hub bar, so you can see it spin
      bus.add(w); wheels.push(w);
    }
  }
  const p = plate("ঢাকা লোকাল", 2.2, .6, "#ffeb3b", "#b71c1c"); // route sign on the back
  p.position.set(0, 1.75, 3.53); body.add(p);
}
buildBus();
scene.add(bus);

const pos = { x: 0, y: 0, z: 0, yaw: 0, k: 0 }; // reused road sample

/** Put the bus on the main road at a journey progress value, facing along the road. */
export function resetBus(progress = 0) {
  fromProgress(progress, here);
  here.prev = -1;
  game.lat = 0;
  game.yaw = 0;
  game.prog = progress;
  body.rotation.set(0, 0, 0);
  placeBus();
}

/** Move the 3D bus to its spot on the road. */
function placeBus() {
  place(bus, here.seg, here.s, game.lat, 0, -game.yaw);
}

/**
 * Smoothly move `current` towards `target`. Using 1 - e^(-rate*dt) makes the
 * smoothing feel the same at any frame rate.
 */
function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** At the end of a road piece, take the branch on the side the bus is driving. */
export function chooseNext(list) {
  for (const n of list) {
    const S = SEGS[n];
    if (S.side && Math.sign(game.lat) === S.side && Math.abs(game.lat) > CFG.map.forkLat) return n;
  }
  return list[0];
}

/**
 * One physics step for the bus: boost, speed, steering, road edge, fuel, moving along the road.
 * @returns {number} distance travelled this step
 */
export function updateBus(dt) {
  const F = CFG.fuel;
  // After a heavy crash (or when surrounded) the driver has lost control: no steering, full brake.
  const ctl = game.crashing || game.caught ? CRASHED : input;
  const hasFuel = game.fuel > 0;

  // Boost: holding the key keeps the timer full; after release it runs out by itself.
  if (ctl.boost && hasFuel) game.boostT = B.boostHold;
  else game.boostT = Math.max(0, game.boostT - dt);
  const boosting = game.boostT > 0 && hasFuel;

  // While boosting the bus drives itself, so the player only needs to steer.
  const throttle = boosting ? 1 : ctl.throttle;
  const top = boosting ? B.boostSpeed : B.maxSpeed;
  const v = game.speed;
  // Engine pull fades out near top speed, like a real heavy vehicle.
  const pull = hasFuel ? (B.accel + (boosting ? B.boostAccel : 0)) * throttle * Math.max(0, 1 - (v / top) ** 3) : 0;
  const drag = (hasFuel ? B.rollDrag : B.emptyTankDrag) + B.airDrag * v * v;
  let speed = Math.max(0, v + (pull - B.brake * ctl.brake - drag) * dt);
  // After a boost ends, ease back down to normal top speed instead of snapping.
  if (!boosting && speed > B.maxSpeed) speed = Math.max(B.maxSpeed, speed - B.overSpeedDecel * dt);
  game.accel = (speed - v) / dt;
  game.speed = speed;

  // Turning: the bus has a heading (game.yaw, measured from the road's direction).
  // Steering turns it, faster at speed but with a wider turning circle, like a heavy bus.
  // When the road bends, the road turns under the bus, so you must steer into the bend.
  sample(here.seg, here.s, pos);
  const radius = B.turnRadiusMin + speed * B.turnRadiusPerSpeed;
  const turnRate = ctl.steer * speed / radius;
  game.yaw += (turnRate - pos.k * speed * Math.cos(game.yaw)) * dt;
  // Arcade help: with no steering the bus slowly lines up with the road again.
  if (Math.abs(ctl.steer) < .1) game.yaw = approach(game.yaw, 0, B.alignRate, dt);
  game.yaw = clamp(game.yaw, -B.maxRelYaw, B.maxRelYaw);

  const S = SEGS[here.seg];
  game.vx = speed * Math.sin(game.yaw);
  let x = game.lat + game.vx * dt;
  // Road edge: past the edge the kerb pushes the nose back and scrapes off some speed.
  const edge = S.half - B.edgeInset, hard = S.half - B.edgeHardInset;
  const over = Math.abs(x) - edge;
  if (over > 0) {
    game.yaw -= Math.sign(x) * B.edgeYawPush * over * dt;
    game.speed = Math.max(0, game.speed - B.edgeScrapeDrag * dt);
    game.shake = Math.max(game.shake, B.edgeShake);
  }
  if (Math.abs(x) > hard) {
    x = Math.sign(x) * hard;
    if (Math.sign(game.yaw) === Math.sign(x)) game.yaw *= .5;
  }
  game.lat = x;

  // Move along the road; at the end of a piece, continue on the next one (or the branch we chose).
  const ds = game.speed * Math.cos(game.yaw) * dt;
  here.s += ds;
  while (here.s > SEGS[here.seg].len && SEGS[here.seg].next.length) {
    here.s -= SEGS[here.seg].len;
    here.prev = here.seg;
    here.seg = chooseNext(SEGS[here.seg].next);
  }
  here.s = Math.min(here.s, SEGS[here.seg].len);
  game.prog = progressOf(here.seg, here.s);

  game.fuel -= (F.baseDrain + game.speed / F.speedDrainRef * F.speedDrain + (boosting ? F.boostDrain : 0)) * dt;
  game.fuel = Math.max(0, game.fuel);
  placeBus();
  return ds;
}

/** Animate the look of the bus (lean, nose dip, wheels, brake lights). Call once per frame. */
export function updateBusVisual(dt) {
  const k = B.visualSmoothing;
  // Body leans outwards in a turn; nose dips when braking. (Only the body: physics is untouched.)
  body.rotation.z = approach(body.rotation.z, game.vx * B.rollPerSideSpeed, k, dt);
  body.rotation.x = approach(body.rotation.x, clamp(game.accel * B.pitchPerAccel, -B.maxPitch, B.maxPitch), k, dt);

  const spin = game.speed * dt / B.wheelRadius; // rolling without slipping: angle = distance / radius
  for (const w of wheels) w.rotation.x -= spin;

  tailMat.emissiveIntensity = input.brake > 0 && game.running ? B.brakeLightGlow : 0.3;
}
