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
let curCamDist = null;         // smoothed chase distance (glides in/out smoothly around obstacles)
let curLookAhead = C.lookAhead;// smoothed lookAt distance ahead of bus
let curRevBack = 0;            // smoothed extra distance pulled back in reverse
let curRevHeight = 0;          // smoothed extra camera elevation in reverse
let curHeightBoost = 0;        // smoothed camera lift when pulled in near walls
const p = { x: 0, y: 0, z: 0, yaw: 0, k: 0 }, q = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };

/** Same smoothing as in bus.js: frame-rate independent ease towards a target. */
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Smoothly move `current` towards `target`. */
function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Snap the camera behind the bus (new run, checkpoint). */
export function resetCamera(withIntro = false) {
  camYaw = null;
  camLat = game.lat * C.followX;
  introT = withIntro ? C.introSeconds : 0;
  orbitAng = 0;
  curCamDist = null;
  curLookAhead = C.lookAhead;
  curRevBack = 0;
  curRevHeight = 0;
  curHeightBoost = 0;
}

/**
 * Prevents chase camera from clipping inside building facades by raycasting
 * an oriented bounding box (OBB) in building-local space against active buildings.
 * 
 * @param {number} ax - bus world x
 * @param {number} az - bus world z
 * @param {number} camDirX - unit ray x pointing from bus towards camera
 * @param {number} camDirZ - unit ray z pointing from bus towards camera
 * @param {number} maxDist - ideal unoccluded camera chase distance
 * @returns {number} safe camera distance (>= minDist)
 */
function testBuildingCollision(ax, az, camDirX, camDirZ, maxDist) {
  let nearestHit = maxDist;
  const margin = CFG.freeRoam?.cameraCollisionMargin || 1.0;
  const minDist = CFG.freeRoam?.cameraMinDist || 7.2;

  for (const bldg of activeBuildings) {
    if (!bldg.mesh || !bldg.mesh.visible) continue;

    // Fast spherical distance reject: camera ray length is at most maxDist (~18 units)
    const dax = ax - bldg.wx;
    const daz = az - bldg.wz;
    const bldgRadius = Math.hypot(bldg.w, bldg.d) * 0.5 + margin;
    const distToCenter = Math.hypot(dax, daz);
    if (distToCenter > maxDist + bldgRadius) continue;

    // Transform bus origin and camera ray into building-local 2D space
    const yaw = bldg.mesh.rotation.y || 0;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    // Vector from building center to bus in local space
    const lax = dax * cosY - daz * sinY;
    const laz = dax * sinY + daz * cosY;

    // Ray direction in building-local space
    const lux = camDirX * cosY - camDirZ * sinY;
    const luz = camDirX * sinY + camDirZ * cosY;

    const hx = bldg.w * 0.5 + margin;
    const hz = bldg.d * 0.5 + margin;

    let tmin = -Infinity, tmax = Infinity;

    if (Math.abs(lux) > 1e-6) {
      let t1 = (-hx - lax) / lux;
      let t2 = (hx - lax) / lux;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    } else if (lax < -hx || lax > hx) {
      continue;
    }

    if (Math.abs(luz) > 1e-6) {
      let t1 = (-hz - laz) / luz;
      let t2 = (hz - laz) / luz;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    } else if (laz < -hz || laz > hz) {
      continue;
    }

    // Only real obstacle intersections outside the bus body perimeter (> 2.4m) trigger pull-in
    if (tmin <= tmax && tmax > 0 && tmin > 2.4 && tmin < nearestHit) {
      const safeDist = Math.max(minDist, tmin - 0.6);
      if (safeDist < nearestHit) {
        nearestHit = safeDist;
      }
    }
  }

  return nearestHit;
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

  const yawRate = isFreeRoam
    ? (Math.abs(game.steerAngle || 0) > 0.08 || Math.abs(game.signedSpeed || 0) < 6.0 ? 7.5 : 5.0)
    : C.yawSmoothing;
  camYaw += (targetYaw - camYaw) * ease(yawRate, dt);

  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw); // forward on the ground
  const camDirX = -fx, camDirZ = -fz;                   // ray from bus towards rear chase camera

  // Pull camera back slightly in portrait mode (aspect < 1) so mobile players see the full 3-lane road
  const portraitBack = cam.aspect < 1.0 ? Math.min(3.2, (1.0 - cam.aspect) * 4.5) : 0;
  const isReversing = game.gear === "R" || (game.signedSpeed !== undefined && game.signedSpeed < -0.15);

  // Smooth transitions into and out of reverse gear
  const targetRevBack = isReversing ? 2.5 : 0;
  const targetRevHeight = isReversing ? 1.2 : 0;
  const targetLookAhead = isReversing ? (C.lookAhead * 0.35) : C.lookAhead;

  curRevBack = approach(curRevBack, targetRevBack, 5.0, dt);
  curRevHeight = approach(curRevHeight, targetRevHeight, 5.0, dt);
  curLookAhead = approach(curLookAhead, targetLookAhead, 6.0, dt);

  const idealDist = C.distance + portraitBack + curRevBack + boostFx * C.boostPullBack;
  const trauma = game.shake;
  const shake = Math.min(1.2, trauma * trauma * 1.1) * C.shakeScale;

  let targetCamDist = idealDist;
  let cx = ax + camDirX * idealDist, cz = az + camDirZ * idealDist;

  let seg = here.seg, s = here.s - idealDist;
  if (s < 0 && here.prev >= 0) { seg = here.prev; s += SEGS[seg].len; }
  sample(seg, Math.max(0, s), q);
  const rx = Math.cos(q.yaw), rz = -Math.sin(q.yaw);

  if (isFreeRoam) {
    targetCamDist = testBuildingCollision(ax, az, camDirX, camDirZ, idealDist);
    if (curCamDist === null) curCamDist = targetCamDist;
    if (targetCamDist < curCamDist) {
      curCamDist = approach(curCamDist, targetCamDist, 14.0, dt);
    } else {
      curCamDist = approach(curCamDist, targetCamDist, 4.5, dt);
    }
    cx = ax + camDirX * curCamDist;
    cz = az + camDirZ * curCamDist;
    const lift = Math.max(0, (1 - curCamDist / idealDist) * 2.4);
    curHeightBoost = approach(curHeightBoost, lift, 6.0, dt);
  } else {
    // In a bend the camera can swing out over the pavement and into a building. Find the
    // road point behind the bus and keep the camera within the road's width there.
    const side = (cx - q.x) * rx + (cz - q.z) * rz, limit = SEGS[seg].half + C.roadMargin;
    if (Math.abs(side) > limit) {
      const push = side - Math.sign(side) * limit;
      cx -= rx * push; cz -= rz * push;
    }
    curHeightBoost = 0;
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

  const baseY = isFreeRoam ? (bus.position.y || 0) : p.y;
  const cy = baseY + C.height + curRevHeight + curHeightBoost + (isFreeRoam ? 0 : (game.busY || 0) * 0.45);
  const lookTargetY = baseY + C.lookY + (isFreeRoam ? 0 : (game.busY || 0) * 0.65);

  cam.position.set(cx + rnd(-1, 1) * shake, cy + rnd(-1, 1) * shake, cz);
  cam.lookAt(ax + fx * curLookAhead, lookTargetY, az + fz * curLookAhead);
  followGround(cam.position.x, cam.position.z);

  // Expand vertical FOV in portrait mode to keep the horizontal field of view wide on phones
  const portraitFovBoost = cam.aspect < 1.0 ? Math.min(20, (1.0 - cam.aspect) * 32) : 0;
  const targetFov = C.baseFov + portraitFovBoost + game.speed * C.fovPerSpeed + boostFx * C.boostFovKick;
  fov += (targetFov - fov) * ease(C.fovSmoothing, dt);
  // Rebuilding the projection is not free, so only do it when the change is visible.
  if (Math.abs(cam.fov - fov) > .05) { cam.fov = fov; cam.updateProjectionMatrix(); }

  return boostFx;
}
