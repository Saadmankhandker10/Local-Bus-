// The player's bus: its 3D model, driving (speed and steering), and fuel use.
import * as THREE from "three";
import { CFG } from "./config.js";
import { clamp } from "./utils.js";
import { scene, box, plate } from "./world.js";
import { keys } from "./input.js";
import { game } from "./state.js";

/** Build the green Dhaka local bus out of simple boxes. */
function makeBus() {
  const g = new THREE.Group();
  g.add(box(2.6, 2.3, 7, 0x2e7d32, 0, 1.5, 0));       // body
  g.add(box(2.62, .45, 7.02, 0xfdd835, 0, .95, 0));   // yellow stripe
  g.add(box(2.64, .8, 5.8, 0x263238, 0, 2.2, .3));    // side windows
  g.add(box(2.2, .8, .05, 0x263238, 0, 2.2, -3.52));  // windscreen
  g.add(box(2.4, .15, 6.8, 0xeeeeee, 0, 2.72, 0));    // roof
  for (const s of [-1, 1]) {
    g.add(box(.4, .3, .1, 0xffffaa, s * .9, 1.0, -3.52)); // headlight
    g.add(box(.3, .25, .1, 0xff1111, s * 1.0, 1.0, 3.52)); // tail light
    for (const z of [-2.3, 2.3]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .4, 12), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      w.rotation.z = Math.PI / 2; w.position.set(s * 1.3, .55, z); g.add(w);
    }
  }
  const p = plate("ঢাকা লোকাল", 2.2, .6, "#ffeb3b", "#b71c1c"); // route sign on the back
  p.position.set(0, 1.75, 3.53); g.add(p);
  return g;
}

export const bus = makeBus();
scene.add(bus);

/** Put the bus back in the middle of the road. */
export function resetBus() {
  bus.position.x = 0;
}

/**
 * Apply driving input for one step: speed, steering, and fuel use.
 * @returns {number} distance travelled this step
 */
export function updateBus(dt) {
  const B = CFG.bus, F = CFG.fuel;
  const boost = keys.boost && game.fuel > 0;

  const acc = (keys.up ? B.accel : 0) + (boost ? B.boostAccel : 0) - (keys.down ? B.brake : 0)
    - (game.fuel <= 0 ? B.emptyTankDrag : B.drag);
  game.speed = clamp(game.speed + acc * dt, 0, B.boostSpeed);
  // After a boost ends, ease back down to normal top speed instead of snapping.
  if (!boost && game.speed > B.maxSpeed) game.speed = Math.max(B.maxSpeed, game.speed - B.overSpeedDecel * dt);

  // Steering gets stronger with speed, so the bus can still turn a little when slow.
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const steerFactor = Math.min(1, B.steerMinFactor + game.speed / B.steerFullAt);
  bus.position.x = clamp(bus.position.x + dir * B.steerSpeed * steerFactor * dt, -B.maxX, B.maxX);
  bus.rotation.y += (-dir * B.leanAngle - bus.rotation.y) * Math.min(1, dt * B.leanSmoothing);

  game.fuel -= (F.baseDrain + game.speed / F.speedDrainRef * F.speedDrain + (boost ? F.boostDrain : 0)) * dt;
  game.fuel = Math.max(0, game.fuel);

  return game.speed * dt;
}
