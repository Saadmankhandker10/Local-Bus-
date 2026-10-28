// Chase camera: follows the bus along the curving road with a little lag, turns with
// the road and partly with the bus, widens the view with speed, shakes on impacts,
// and kicks out further while boosting.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd } from "./utils.js";
import { game } from "./state.js";
import { SEGS, here, sample } from "./map.js";
import { followGround } from "./world.js";
import { input } from "./input.js";

const C = CFG.camera;

export const cam = new THREE.PerspectiveCamera(C.fov, innerWidth / innerHeight, 0.1, C.far);
addEventListener("resize", () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
});

let camLat = 0;     // smoothed sideways position on the road
let camYaw = null;  // smoothed direction the camera looks (null = snap on first frame)
let fov = C.fov;    // smoothed field of view
let boostFx = 0;    // 0..1, how strong the boost effect is right now
let introT = 0;     // seconds left in the skippable morning bus-stand camera sweep
let orbitAng = 0;   // angle for the "গণধোলাই" cutscene orbit camera
const p = { x: 0, y: 0, z: 0, yaw: 0, k: 0 }, q = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };

/** Same smoothing as in bus.js: frame-rate independent ease towards a target. */
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Snap the camera behind the bus (new run, checkpoint). */
export function resetCamera(withIntro = false) {
  camYaw = null;
  camLat = 0;
  introT = withIntro ? C.introSeconds : 0;
  orbitAng = 0;
}

/** Place the camera for this frame in open-world 2D space. @returns {number} boost effect strength 0..1 */
export function updateCamera(dt) {
  const boosting = game.running && game.boostT > 0;
  boostFx += ((boosting ? 1 : 0) - boostFx) * ease(C.boostFxSmoothing, dt);

  const targetYaw = game.yaw;
  if (camYaw === null) camYaw = targetYaw;
  let diff = targetYaw - camYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  camYaw += diff * ease(C.yawSmoothing, dt);

  // Position behind the bus
  const back = C.distance + boostFx * C.boostPullBack;
  const shake = game.shake * C.shakeScale;
  let cx = game.x - Math.sin(camYaw) * back;
  let cz = game.z + Math.cos(camYaw) * back;

  // Skippable 1.8 s morning camera sweep from the Mohammadpur Bus Stand side to behind the bus.
  if (introT > 0) {
    if (input.throttle > 0 || input.brake > 0 || Math.abs(input.steer) > .1 || input.boost) introT = 0;
    else introT = Math.max(0, introT - dt);
    const u = introT / C.introSeconds;
    const sweep = u * u * (3 - 2 * u);
    cx += Math.cos(camYaw) * 8.5 * sweep;
    cz += Math.sin(camYaw) * 8.5 * sweep;
  }

  // Dramatic "গণধোলাই / ঘেরাও" cutscene: orbit the camera around the surrounded bus!
  if (game.caught) {
    orbitAng += dt * 0.92;
    const rad = 10.2;
    const ox = game.x + Math.sin(camYaw + orbitAng) * rad;
    const oz = game.z + Math.cos(camYaw + orbitAng) * rad;
    cam.position.set(ox + rnd(-1, 1) * shake, 3.9 + rnd(-1, 1) * shake, oz);
    cam.lookAt(game.x, 1.55, game.z);
    followGround(cam.position.x, cam.position.z);
    return boostFx;
  }

  // Menu Autopilot demo camera: gentle cinematic sway behind the cruising bus.
  if (!game.running) {
    const sway = Math.sin(game.time * 0.45) * 3.2;
    cx += Math.cos(camYaw) * sway;
    cz += Math.sin(camYaw) * sway;
  }

  cam.position.set(cx + rnd(-1, 1) * shake, C.height + (game.busY || 0) * 0.45 + rnd(-1, 1) * shake, cz);
  cam.lookAt(game.x + Math.sin(camYaw) * C.lookAhead, C.lookY + (game.busY || 0) * 0.65, game.z - Math.cos(camYaw) * C.lookAhead);
  followGround(cam.position.x, cam.position.z);

  const targetFov = C.baseFov + Math.abs(game.speed) * C.fovPerSpeed + boostFx * C.boostFovKick;
  fov += (targetFov - fov) * ease(C.fovSmoothing, dt);
  if (Math.abs(cam.fov - fov) > .05) { cam.fov = fov; cam.updateProjectionMatrix(); }

  return boostFx;
}
