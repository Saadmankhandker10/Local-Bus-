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
  camLat = game.lat * C.followX;
  introT = withIntro ? C.introSeconds : 0;
  orbitAng = 0;
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
  // Pull camera back slightly in portrait mode (aspect < 1) so mobile players see the full 3-lane road
  const portraitBack = cam.aspect < 1.0 ? Math.min(3.2, (1.0 - cam.aspect) * 4.5) : 0;
  const back = C.distance + portraitBack + boostFx * C.boostPullBack;
  const trauma = game.shake;
  const shake = Math.min(1.2, trauma * trauma * 1.1) * C.shakeScale;
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

  // Skippable 1.8 s morning camera sweep (gentle straight pull-back at other stages, wide sweep at Mohammadpur Stand).
  if (introT > 0) {
    if (input.throttle > 0 || input.brake > 0 || Math.abs(input.steer) > .1 || input.boost) introT = 0;
    else introT = Math.max(0, introT - dt);
    const u = introT / C.introSeconds;
    const sweep = u * u * (3 - 2 * u); // smoothstep 1 -> 0
    if (game.prog < 60) {
      // Mohammadpur Stand terminal: safe side sweep clamped within the road boundary
      const sideLimit = Math.min(5.5, SEGS[seg].half);
      cx += (-rx * sideLimit + fx * 4) * sweep;
      cz += (-rz * sideLimit + fz * 4) * sweep;
    } else {
      // Mid-city stages (Dhanmondi, Science Lab, DU): straight pull-back behind the bus (never sweeps into sidewalk buildings!)
      cx += fx * 5.5 * sweep;
      cz += fz * 5.5 * sweep;
    }
  }

  // Dramatic "গণধোলাই / ঘেরাও" cutscene: orbit the camera around the surrounded bus!
  if (game.caught) {
    orbitAng += dt * 0.92;
    const rad = 10.2;
    const ox = ax + Math.sin(camYaw + orbitAng) * rad;
    const oz = az + Math.cos(camYaw + orbitAng) * rad;
    cam.position.set(ox + rnd(-1, 1) * shake, p.y + 3.9 + rnd(-1, 1) * shake, oz);
    cam.lookAt(ax, p.y + 1.55, az);
    followGround(cam.position.x, cam.position.z);
    return boostFx;
  }

  // Menu Autopilot demo camera: gentle cinematic sway behind the cruising bus.
  if (!game.running) {
    const sway = Math.sin(game.time * 0.45) * 3.2;
    cx += rx * sway;
    cz += rz * sway;
  }

  cam.position.set(cx + rnd(-1, 1) * shake, p.y + C.height + (game.busY || 0) * 0.45 + rnd(-1, 1) * shake, cz);
  cam.lookAt(ax + fx * C.lookAhead, p.y + C.lookY + (game.busY || 0) * 0.65, az + fz * C.lookAhead);
  followGround(cam.position.x, cam.position.z);

  // Expand vertical FOV in portrait mode to keep the horizontal field of view wide on phones
  const portraitFovBoost = cam.aspect < 1.0 ? Math.min(20, (1.0 - cam.aspect) * 32) : 0;
  const targetFov = C.baseFov + portraitFovBoost + game.speed * C.fovPerSpeed + boostFx * C.boostFovKick;
  fov += (targetFov - fov) * ease(C.fovSmoothing, dt);
  // Rebuilding the projection is not free, so only do it when the change is visible.
  if (Math.abs(cam.fov - fov) > .05) { cam.fov = fov; cam.updateProjectionMatrix(); }

  return boostFx;
}
