// Chase camera: follows the bus along the curving road with a little lag, turns with
// the road and partly with the bus, widens the view with speed, shakes on impacts,
// and kicks out further while boosting.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd } from "./utils.js";
import { game } from "./state.js";
import { SEGS, here, sample } from "./map.js";
import { followGround } from "./world.js";

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
const p = { x: 0, y: 0, z: 0, yaw: 0, k: 0 }, q = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };

/** Same smoothing as in bus.js: frame-rate independent ease towards a target. */
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Snap the camera behind the bus (new run, checkpoint). */
export function resetCamera() {
  camYaw = null;
  camLat = game.lat * C.followX;
}

/** Place the camera for this frame. @returns {number} boost effect strength 0..1 */
export function updateCamera(dt) {
  const boosting = game.running && game.boostT > 0;
  boostFx += ((boosting ? 1 : 0) - boostFx) * ease(C.boostFxSmoothing, dt);

  // Lagging behind sideways moves makes the heavy bus visibly swing in the frame.
  camLat += (game.lat * C.followX - camLat) * ease(C.followSmoothing, dt);
  sample(here.seg, here.s, p);
  const targetYaw = p.yaw - game.yaw * C.followYaw;
  if (camYaw === null) camYaw = targetYaw;
  camYaw += (targetYaw - camYaw) * ease(C.yawSmoothing, dt);

  // Anchor on the road at the bus, then step back and up along the camera's direction.
  const ax = p.x + Math.cos(p.yaw) * camLat, az = p.z - Math.sin(p.yaw) * camLat;
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw); // forward on the ground
  const back = C.distance + boostFx * C.boostPullBack;
  const shake = game.shake * C.shakeScale;
  let cx = ax - fx * back, cz = az - fz * back;

  // In a bend the camera can swing out over the pavement and into a building. Find the
  // road point behind the bus and keep the camera within the road's width there.
  let seg = here.seg, s = here.s - back;
  if (s < 0 && here.prev >= 0) { seg = here.prev; s += SEGS[seg].len; }
  sample(seg, s, q);
  const rx = Math.cos(q.yaw), rz = -Math.sin(q.yaw);
  const side = (cx - q.x) * rx + (cz - q.z) * rz, limit = SEGS[seg].half + C.roadMargin;
  if (Math.abs(side) > limit) {
    const push = side - Math.sign(side) * limit;
    cx -= rx * push; cz -= rz * push;
  }
  cam.position.set(cx + rnd(-1, 1) * shake, p.y + C.height + rnd(-1, 1) * shake, cz);
  cam.lookAt(ax + fx * C.lookAhead, p.y + C.lookY, az + fz * C.lookAhead);
  followGround(cam.position.x, cam.position.z);

  const targetFov = C.baseFov + game.speed * C.fovPerSpeed + boostFx * C.boostFovKick;
  fov += (targetFov - fov) * ease(C.fovSmoothing, dt);
  // Rebuilding the projection is not free, so only do it when the change is visible.
  if (Math.abs(cam.fov - fov) > .05) { cam.fov = fov; cam.updateProjectionMatrix(); }

  return boostFx;
}
