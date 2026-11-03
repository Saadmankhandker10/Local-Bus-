// Chase camera: follows the bus along the curving road with a little lag, turns with
// the road and partly with the bus, widens the view with speed, shakes on impacts,
// and kicks out further while boosting.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd } from "./utils.js";
import { game } from "./state.js";
import { SEGS, here, sample } from "./map.js";
import { followGround, active as activeBuildings } from "./world.js";
import { bus } from "./bus.js";
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

/** Prevents chase camera from clipping inside building facades by raycasting against active buildings. */
function testBuildingCollision(ax, az, cx, cz) {
  let bestDist = Math.hypot(cx - ax, cz - az);
  if (bestDist < 0.001) return { cx, cz, dist: bestDist };
  const ux = (cx - ax) / bestDist;
  const uz = (cz - az) / bestDist;
  const margin = CFG.freeRoam?.cameraCollisionMargin || 1.2;
  const minDist = CFG.freeRoam?.cameraMinDist || 4.2;

  for (const p of activeBuildings) {
    if (!p.mesh || !p.mesh.visible) continue;
    // Fast spatial distance reject: camera ray length is at most bestDist (~15 units)
    if (Math.abs(p.wx - ax) > (bestDist + p.w / 2 + margin) ||
        Math.abs(p.wz - az) > (bestDist + p.d / 2 + margin)) continue;

    const minX = p.wx - p.w / 2 - margin;
    const maxX = p.wx + p.w / 2 + margin;
    const minZ = p.wz - p.d / 2 - margin;
    const maxZ = p.wz + p.d / 2 + margin;

    // Fast reject if bus and camera are both on one side
    if ((ax < minX && cx < minX) || (ax > maxX && cx > maxX) ||
        (az < minZ && cz < minZ) || (az > maxZ && cz > maxZ)) continue;

    // Ray clipping against AABB
    let tminX = (minX - ax) / ux;
    let tmaxX = (maxX - ax) / ux;
    if (tminX > tmaxX) { const temp = tminX; tminX = tmaxX; tmaxX = temp; }

    let tminZ = (minZ - az) / uz;
    let tmaxZ = (maxZ - az) / uz;
    if (tminZ > tmaxZ) { const temp = tminZ; tminZ = tmaxZ; tmaxZ = temp; }

    const tEnter = Math.max(tminX, tminZ);
    const tExit = Math.min(tmaxX, tmaxZ);

    if (tEnter <= tExit && tExit >= 0 && tEnter < bestDist) {
      // Ray penetrates building facade
      const hitDist = Math.max(minDist, tEnter - 0.4);
      if (hitDist < bestDist) {
        bestDist = hitDist;
      }
    }
  }

  return {
    cx: ax + ux * bestDist,
    cz: az + uz * bestDist,
    dist: bestDist,
  };
}

/** Place the camera for this frame. @returns {number} boost effect strength 0..1 */
export function updateCamera(dt) {
  const boosting = game.running && game.boostT > 0;
  boostFx += ((boosting ? 1 : 0) - boostFx) * ease(C.boostFxSmoothing, dt);

  const isFreeRoam = game.freeRoam && CFG.freeRoam?.enabled !== false;
  let ax, az, targetYaw;
  sample(here.seg, here.s, p);

  if (isFreeRoam) {
    ax = bus.position.x;
    az = bus.position.z;
    const heading = game.heading !== undefined ? game.heading : -bus.rotation.y;
    targetYaw = -heading;
  } else {
    // Lagging behind sideways moves makes the heavy bus visibly swing in the frame.
    camLat += (game.lat * C.followX - camLat) * ease(C.followSmoothing, dt);
    targetYaw = p.yaw - game.yaw * C.followYaw;
    ax = p.x + Math.cos(p.yaw) * camLat;
    az = p.z - Math.sin(p.yaw) * camLat;
  }

  if (camYaw === null) camYaw = targetYaw;
  // Seamless 360-degree angle unwrapping for U-turns and 3-point turns
  while (targetYaw - camYaw > Math.PI) camYaw += 2 * Math.PI;
  while (targetYaw - camYaw < -Math.PI) camYaw -= 2 * Math.PI;
  camYaw += (targetYaw - camYaw) * ease(C.yawSmoothing, dt);

  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw); // forward on the ground
  // Pull camera back slightly in portrait mode (aspect < 1) so mobile players see the full 3-lane road
  const portraitBack = cam.aspect < 1.0 ? Math.min(3.2, (1.0 - cam.aspect) * 4.5) : 0;
  const isReversing = game.gear === "R" || (game.signedSpeed !== undefined && game.signedSpeed < -0.15);
  const revBack = isReversing ? 2.5 : 0;
  const revHeight = isReversing ? 0.8 : 0;
  const back = C.distance + portraitBack + revBack + boostFx * C.boostPullBack;
  const trauma = game.shake;
  const shake = Math.min(1.2, trauma * trauma * 1.1) * C.shakeScale;
  let cx = ax - fx * back, cz = az - fz * back;

  let seg = here.seg, s = here.s - back;
  if (s < 0 && here.prev >= 0) { seg = here.prev; s += SEGS[seg].len; }
  sample(seg, Math.max(0, s), q);
  const rx = Math.cos(q.yaw), rz = -Math.sin(q.yaw);

  let heightBoost = 0;
  if (isFreeRoam) {
    const safeCam = testBuildingCollision(ax, az, cx, cz);
    cx = safeCam.cx;
    cz = safeCam.cz;
    heightBoost = Math.max(0, (1 - safeCam.dist / back) * 2.2);
  } else {
    // In a bend the camera can swing out over the pavement and into a building. Find the
    // road point behind the bus and keep the camera within the road's width there.
    const side = (cx - q.x) * rx + (cz - q.z) * rz, limit = SEGS[seg].half + C.roadMargin;
    if (Math.abs(side) > limit) {
      const push = side - Math.sign(side) * limit;
      cx -= rx * push; cz -= rz * push;
    }
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

  // Menu backdrop camera: gentle cinematic slow drift around the idling bus
  if (!game.running) {
    const t = game.time * 0.18;
    const isPortrait = cam.aspect < 1.0;
    // Drift gently around the left-rear and side profile of the bus
    const driftSide = -4.2 + Math.sin(t) * 1.6;
    const driftBack = (isPortrait ? 8.6 : 7.0) + Math.cos(t * 0.8) * 1.1;
    const driftHeight = C.height * 0.88 + Math.sin(t * 1.1) * 0.32;

    const menuCx = ax + rx * driftSide - fx * driftBack;
    const menuCz = az + rz * driftSide - fz * driftBack;

    cam.position.set(menuCx, p.y + driftHeight, menuCz);
    cam.lookAt(ax - rx * 0.35 + fx * 1.2, p.y + 1.45, az - rz * 0.35 + fz * 1.2);
    followGround(cam.position.x, cam.position.z);

    const targetFov = C.baseFov + (isPortrait ? Math.min(18, (1.0 - cam.aspect) * 28) : 0);
    fov += (targetFov - fov) * ease(C.fovSmoothing, dt);
    if (Math.abs(cam.fov - fov) > .05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    return 0;
  }

  cam.position.set(cx + rnd(-1, 1) * shake, p.y + C.height + revHeight + heightBoost + (game.busY || 0) * 0.45 + rnd(-1, 1) * shake, cz);
  cam.lookAt(ax + fx * (isReversing ? -C.lookAhead * 0.4 : C.lookAhead), p.y + C.lookY + (game.busY || 0) * 0.65, az + fz * (isReversing ? -C.lookAhead * 0.4 : C.lookAhead));
  followGround(cam.position.x, cam.position.z);

  // Expand vertical FOV in portrait mode to keep the horizontal field of view wide on phones
  const portraitFovBoost = cam.aspect < 1.0 ? Math.min(20, (1.0 - cam.aspect) * 32) : 0;
  const targetFov = C.baseFov + portraitFovBoost + game.speed * C.fovPerSpeed + boostFx * C.boostFovKick;
  fov += (targetFov - fov) * ease(C.fovSmoothing, dt);
  // Rebuilding the projection is not free, so only do it when the change is visible.
  if (Math.abs(cam.fov - fov) > .05) { cam.fov = fov; cam.updateProjectionMatrix(); }

  return boostFx;
}
