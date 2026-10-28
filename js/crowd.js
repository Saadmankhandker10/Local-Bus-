// The crowd that chases the bus after a crash. Cartoon only: they run, shout,
// and if they catch the bus they stand around it. Nobody gets hurt.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";
import { scene, box, person } from "./world.js";
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
let throwT = 0; // seconds until the next cartoon item is thrown by the crowd

// Object pooling: we build a small fixed set of 3D projectiles and glass shards once at startup
// and reuse them by toggling `.visible`, avoiding slow memory cleanup (garbage collection) mid-game.
const ITEM_DEFS = [
  { name: "ইট", geo: new THREE.BoxGeometry(.36, .18, .22), mat: new THREE.MeshLambertMaterial({ color: 0xb8322a }) },
  { name: "হেলমেট", geo: new THREE.SphereGeometry(.24, 8, 6, 0, Math.PI * 2, 0, Math.PI * .65), mat: new THREE.MeshLambertMaterial({ color: 0xffc21a }) },
  { name: "স্যান্ডেল", geo: new THREE.BoxGeometry(.22, .08, .42), mat: new THREE.MeshLambertMaterial({ color: 0x5d4037 }) },
  { name: "বোতল", geo: new THREE.CylinderGeometry(.1, .1, .38, 7), mat: new THREE.MeshLambertMaterial({ color: 0x29b6f6 }) },
  { name: "চায়ের কাপ", geo: new THREE.CylinderGeometry(.12, .09, .24, 7), mat: new THREE.MeshLambertMaterial({ color: 0xffe0b2 }) },
];

const projPool = Array.from({ length: K.projectilePool }, (_, i) => {
  const def = ITEM_DEFS[i % ITEM_DEFS.length];
  const m = new THREE.Mesh(def.geo, def.mat);
  m.visible = false;
  scene.add(m);
  return { m, itemName: def.name, active: false, u: 0, sx: 0, sz: 0, tx: 0, tz: 0 };
});

const shardGeo = new THREE.BoxGeometry(.14, .14, .04);
const shardMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff });
const shardPool = Array.from({ length: K.shardPool }, () => {
  const m = new THREE.Mesh(shardGeo, shardMat);
  m.visible = false;
  scene.add(m);
  return { m, active: false, t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
});

// Cutscene extras for the "গণধোলাই / ঘেরাও" sequence:
//   - 4 bystanders holding up smartphones with blinking camera flashes
//   - 1 traffic police officer who walks in and blows his whistle at 2.3 s
const flashGeo = new THREE.SphereGeometry(.18, 6, 6);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const filmers = Array.from({ length: 4 }, (_, i) => {
  const g = person([0x1565c0, 0x00897b, 0x6a1b9a, 0x4e342e][i], 0);
  // Raised arm + smartphone + camera flash sphere
  g.add(box(.12, .45, .12, 0xc68642, .24, 1.15, -.22));
  g.add(box(.14, .24, .04, 0x111111, .24, 1.38, -.32));
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(.24, 1.42, -.36);
  g.add(flash);
  g.userData.flash = flash;
  g.visible = false;
  scene.add(g);
  return g;
});

const cutsceneCop = person(0xf5f5f5, 0, 0x1a237e);
cutsceneCop.add(box(.12, .42, .12, 0xf5f5f5, -.25, 1.15, -.2)); // raised hand with whistle
cutsceneCop.visible = false;
scene.add(cutsceneCop);
let caughtElapsed = 0;
let whistleBlown = false;

function spawnShards(lat, back) {
  let spawned = 0;
  for (const s of shardPool) {
    if (s.active) continue;
    s.active = true; s.t = 0.55;
    s.x = lat + rnd(-.9, .9); s.y = 2.1 + rnd(-.3, .4); s.z = back + rnd(-.5, .5);
    s.vx = rnd(-3.5, 3.5); s.vy = rnd(2.2, 5.2); s.vz = rnd(-2.5, 2.5);
    s.m.visible = true;
    if (++spawned >= 6) break;
  }
}

/**
 * Put `dummy` at a spot relative to the bus:
 * lat = sideways offset, back = distance behind the bus, up = vertical height.
 */
function toWorld(lat, back, up) {
  const fwdX = Math.sin(game.yaw), fwdZ = -Math.cos(game.yaw);
  const rightX = Math.cos(game.yaw), rightZ = Math.sin(game.yaw);
  dummy.position.set(
    game.x + rightX * lat - fwdX * back,
    up,
    game.z + rightZ * lat - fwdZ * back
  );
  dummy.rotation.y = game.yaw;
}

/** Remove the crowd (new run). */
export function resetCrowd() {
  crowd.active = false;
  crowd.crashes = 0;
  throwT = 0;
  caughtElapsed = 0;
  whistleBlown = false;
  bodies.count = heads.count = 0;
  for (const p of projPool) { p.active = false; p.m.visible = false; }
  for (const s of shardPool) { s.active = false; s.m.visible = false; }
  for (const f of filmers) f.visible = false;
  cutsceneCop.visible = false;
}

function hide(reason) {
  crowd.active = false;
  crowd.crashes = 0;
  bodies.count = heads.count = 0;
  for (const p of projPool) { p.active = false; p.m.visible = false; }
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
on("rampJump", () => { if (crowd.active) crowd.gap += 18; });

/** Move the chase for one step: close the gap, throw cartoon items, catch the bus, or give up. */
export function updateCrowd(dt) {
  // Update active thrown projectiles and glass shards even if the crowd just caught the bus.
  for (const p of projPool) {
    if (!p.active) continue;
    p.u += dt / K.throwFlightTime;
    if (p.u >= 1) {
      p.active = false;
      p.m.visible = false;
      if (!game.caught && !game.crashing && Math.abs(game.lat - p.tx) <= CFG.bus.hitHalfWidth + .35) {
        spawnShards(p.tx, 2.2);
        emit("projectileHit", { item: p.itemName });
      }
      continue;
    }
    const x = p.sx + (p.tx - p.sx) * p.u;
    const z = p.sz + (p.tz - p.sz) * p.u;
    const y = 1.15 + 4 * p.u * (1 - p.u) * K.throwArcHeight;
    toWorld(x, z, y);
    p.m.position.copy(dummy.position);
    p.m.rotation.set(game.time * 9, dummy.rotation.y, game.time * 6);
  }

  for (const s of shardPool) {
    if (!s.active) continue;
    s.t -= dt;
    if (s.t <= 0) { s.active = false; s.m.visible = false; continue; }
    s.vy -= 14 * dt;
    s.x += s.vx * dt; s.y = Math.max(.1, s.y + s.vy * dt); s.z += s.vz * dt;
    toWorld(s.x, s.z, s.y);
    s.m.position.copy(dummy.position);
    s.m.rotation.x += 10 * dt; s.m.rotation.y += 8 * dt;
  }

  if (!crowd.active || game.caught) return;
  crowd.gap += (game.speed - crowd.speed) * dt;
  if (crowd.gap <= K.catchGap) { crowd.gap = K.catchGap; emit("caught"); return; }

  // Angry public retaliation: throw a cartoon brick / helmet / sandal / tea cup on a ballistic arc.
  if (!game.crashing && crowd.gap <= K.throwMaxGap && crowd.gap >= K.throwMinGap) {
    throwT -= dt;
    if (throwT <= 0) {
      throwT = K.throwInterval * rnd(.8, 1.25);
      const p = projPool.find(it => !it.active);
      if (p) {
        const idx = Math.floor(rnd(0, Math.max(1, crowd.size)));
        p.active = true; p.u = 0;
        p.sx = px[idx]; p.sz = Math.min(crowd.gap + 2.5, pz[idx]);
        p.tx = game.lat + rnd(-K.throwLeadJitter, K.throwLeadJitter);
        p.tz = 2.0; // aims at the rear/side windows of the bus
        p.m.visible = true;
      }
    }
  }

  // Far enough away for long enough: they stop running.
  crowd.escapeT = crowd.gap > K.escapeGap ? crowd.escapeT + dt : 0;
  if (crowd.escapeT >= K.escapeTime) hide("crowdGaveUp");
}

/** Place every person for this frame (running behind the bus, or in a ring around it + filmers + cop). */
export function updateCrowdVisual(dt) {
  if (!crowd.active) return;
  bodies.count = heads.count = crowd.size;
  const k = 1 - Math.exp(-K.ringSpeed * dt);
  for (let i = 0; i < crowd.size; i++) {
    let tx, tz, bob;
    if (game.caught) {
      // Inner beaters stand close around the bus shaking it; outer crowd forms a tight oval ring.
      const a = (i / crowd.size) * Math.PI * 2;
      const inner = i < 8;
      const r = inner ? 2.45 : K.ringRadius * (1 + .15 * (i % 3));
      tx = game.lat + Math.cos(a) * r * .72;
      tz = Math.sin(a) * r * (inner ? 1.25 : 1.4);
      bob = Math.abs(Math.sin(game.time * (inner ? 11 : 4.5) * Math.PI + ph[i])) * (inner ? .34 : .22);
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

  // Dramatic "গণধোলাই / ঘেরাও" cutscene: 4 bystanders filming with flashing phones + police officer arriving!
  if (game.caught) {
    caughtElapsed += dt;
    const angles = [-0.85, -0.3, 0.35, 0.9];
    for (let i = 0; i < filmers.length; i++) {
      const f = filmers[i];
      f.visible = true;
      const fx = game.lat + Math.sin(angles[i]) * 5.2;
      const fz = Math.cos(angles[i]) * 6.2;
      toWorld(fx, fz, 0);
      f.position.copy(dummy.position);
      f.rotation.y = dummy.rotation.y + Math.PI + angles[i];
      // Blink the white smartphone camera flash like paparazzi / Facebook Live!
      f.userData.flash.visible = Math.floor((game.time + i * 0.19) * 7) % 3 === 0;
    }
    if (caughtElapsed >= 1.4) {
      cutsceneCop.visible = true;
      const walkProgress = Math.min(1, (caughtElapsed - 1.4) / 1.0);
      const copLat = game.lat - 4.8 + walkProgress * 2.4;
      const copBack = -4.2 + walkProgress * 1.8;
      const copBob = walkProgress < 1 ? Math.abs(Math.sin(game.time * 12)) * 0.16 : 0;
      toWorld(copLat, copBack, copBob);
      cutsceneCop.position.copy(dummy.position);
      cutsceneCop.rotation.y = dummy.rotation.y - Math.PI / 2;
      if (caughtElapsed >= 2.2 && !whistleBlown) {
        whistleBlown = true;
        emit("copWhistle");
      }
    }
  } else {
    for (const f of filmers) if (f.visible) f.visible = false;
    if (cutsceneCop.visible) cutsceneCop.visible = false;
  }
}
