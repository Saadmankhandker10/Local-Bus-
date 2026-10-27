// Chase camera: follows the bus with a little lag, widens the view with speed,
// shakes on impacts, and kicks out further while boosting.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd } from "./utils.js";
import { game } from "./state.js";
import { bus } from "./bus.js";

const C = CFG.camera;

export const cam = new THREE.PerspectiveCamera(C.fov, innerWidth / innerHeight, 0.1, C.far);
addEventListener("resize", () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
});

let camX = 0;     // smoothed sideways position
let fov = C.fov;  // smoothed field of view
let boostFx = 0;  // 0..1, how strong the boost effect is right now

/** Same smoothing as in bus.js: frame-rate independent ease towards a target. */
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Place the camera for this frame. @returns {number} boost effect strength 0..1 */
export function updateCamera(dt) {
  const boosting = game.running && game.boostT > 0;
  boostFx += ((boosting ? 1 : 0) - boostFx) * ease(C.boostFxSmoothing, dt);

  // Lagging behind sideways moves makes the heavy bus visibly swing in the frame.
  camX += (bus.position.x * C.followX - camX) * ease(C.followSmoothing, dt);

  const shake = game.shake * C.shakeScale;
  cam.position.set(
    camX + rnd(-1, 1) * shake,
    C.height + rnd(-1, 1) * shake,
    C.distance + boostFx * C.boostPullBack,
  );
  cam.lookAt(camX, C.lookY, C.lookZ);

  const targetFov = C.baseFov + game.speed * C.fovPerSpeed + boostFx * C.boostFovKick;
  fov += (targetFov - fov) * ease(C.fovSmoothing, dt);
  // Rebuilding the projection is not free, so only do it when the change is visible.
  if (Math.abs(cam.fov - fov) > .05) { cam.fov = fov; cam.updateProjectionMatrix(); }

  return boostFx;
}
