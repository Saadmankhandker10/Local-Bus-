// The crowd that chases the bus after a crash. Cartoon only: they run, shout,
// and if they catch the bus they stand around it. Nobody gets hurt.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";
import { scene } from "./world.js";
import { SEGS, here, sample } from "./map.js";
import { game } from "./state.js";
import { on, emit } from "./events.js";

const K = CFG.crowd;

/** Chase state, read by the HUD and marks. gap = distance behind the bus. */
export const crowd = { active: false, gap: 0, speed: 0, size: 0, crashes: 0, escapeT: 0 };

// Instancing: one InstancedMesh draws all bodies (and one all heads) in a single draw
// call, instead of 40 separate meshes. Each person is just a position matrix.
const bodyGeo = new THREE.CylinderGeometry(.22, .28, .9, 6).translate(0, .45, 0);
const headGeo = new THREE.SphereGeometry(.2, 6, 6).translate(0, 1.12, 0);
const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), K.maxSize);
const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xc68642 }), K.maxSize);
// The default culling box sits at the origin; the crowd moves around, so draw it always.
bodies.frustumCulled = heads.frustumCulled = false;
scene.add(bodies, heads);

// Fixed random layout per person, made once (no new objects during play).
const ox = [], oz = [], ph = [], px = [], pz = [];
const SHIRTS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0xffffff, 0xfdd835, 0x6d4c41];
const tmpColor = new THREE.Color();
for (let i = 0; i < K.maxSize; i++) {
  ox.push(rnd(-5.5, 5.5)); oz.push(rnd(0, K.spread)); ph.push(rnd(0, 6)); px.push(0); pz.push(0);
  bodies.setColorAt(i, tmpColor.setHex(pick(SHIRTS)));
}
const dummy = new THREE.Object3D(); // reused to build each matrix
const rp = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };

/**
 * Put `dummy` at a spot given relative to the bus: lat = right of the road centre,
 * back = distance behind the bus along the road (it may be on the previous road piece).
 */
function toWorld(lat, back, up) {
  let seg = here.seg, s = here.s - back;
  if (s < 0 && here.prev >= 0) { seg = here.prev; s += SEGS[seg].len; }
  sample(seg, s, rp);
  dummy.position.set(rp.x + Math.cos(rp.yaw) * lat, rp.y + up, rp.z - Math.sin(rp.yaw) * lat);
  dummy.rotation.y = rp.yaw;
}

/** Remove the crowd (new run). */
export function resetCrowd() {
  crowd.active = false;
  crowd.crashes = 0;
  bodies.count = heads.count = 0;
}

function hide(reason) {
  crowd.active = false;
  crowd.crashes = 0;
  bodies.count = heads.count = 0;
  emit(reason);
}

on("crash", () => {
  crowd.crashes++;
  const n = crowd.crashes - 1;
  crowd.speed = Math.min(K.maxSpeed, K.baseSpeed + K.speedPerCrash * n);
  crowd.size = Math.min(K.maxSize, K.baseSize + K.sizePerCrash * n);
  crowd.escapeT = 0;
  if (!crowd.active) {
    crowd.active = true;
    crowd.gap = K.startGap;
    for (let i = 0; i < K.maxSize; i++) { px[i] = game.lat + ox[i]; pz[i] = crowd.gap + oz[i]; }
    emit("chaseStart");
  } else {
    // People from the new crash join in, closer than the ones who were far behind.
    crowd.gap = Math.max(Math.min(crowd.gap, K.startGap), crowd.gap - K.crashGapCut);
  }
});

on("fineClosed", () => { if (crowd.active) hide("crowdCleared"); });

/** Move the chase for one step: close the gap, catch the bus, or give up. */
export function updateCrowd(dt) {
  if (!crowd.active || game.caught) return;
  crowd.gap += (game.speed - crowd.speed) * dt;
  if (crowd.gap <= K.catchGap) { crowd.gap = K.catchGap; emit("caught"); return; }
  // Far enough away for long enough: they stop running.
  crowd.escapeT = crowd.gap > K.escapeGap ? crowd.escapeT + dt : 0;
  if (crowd.escapeT >= K.escapeTime) hide("crowdGaveUp");
}

/** Place every person for this frame (running behind the bus, or in a ring around it). */
export function updateCrowdVisual(dt) {
  if (!crowd.active) return;
  bodies.count = heads.count = crowd.size;
  const k = 1 - Math.exp(-K.ringSpeed * dt);
  for (let i = 0; i < crowd.size; i++) {
    let tx, tz, bob;
    if (game.caught) {
      // Stand in an oval around the bus (it is long, so the oval is stretched along z).
      const a = (i / crowd.size) * Math.PI * 2;
      const r = K.ringRadius * (1 + .15 * (i % 3));
      tx = game.lat + Math.cos(a) * r * .7;
      tz = Math.sin(a) * r * 1.4;
      bob = 0;
      px[i] += (tx - px[i]) * k; pz[i] += (tz - pz[i]) * k;
    } else {
      px[i] += (game.lat * .5 + ox[i] - px[i]) * k;
      pz[i] = crowd.gap + oz[i];
      bob = Math.abs(Math.sin(game.time * K.runBobHz * Math.PI + ph[i])) * K.runBob;
    }
    toWorld(px[i], pz[i], bob);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
  }
  bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
}
