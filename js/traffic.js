// Other vehicles on the road: spawning, movement, and crashing into the bus.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";
import { scene, box } from "./world.js";
import { bus } from "./bus.js";
import { game } from "./state.js";
import { msg } from "./hud.js";

const T = CFG.traffic;
const veh = [];        // vehicles currently on the road
let spawnTimer = 0;    // seconds until the next vehicle tries to spawn

/** Pick a vehicle type, using each type's weight `wt` as its chance. */
function pickType() {
  let r = Math.random() * T.types.reduce((a, t) => a + t.wt, 0);
  for (const t of T.types) { if ((r -= t.wt) <= 0) return t; }
  return T.types[0];
}

/** Build a simple vehicle model: body, cabin, two wheel strips. */
function mkVeh(t) {
  const g = new THREE.Group(), c = pick(t.colors);
  g.add(box(t.w, t.h * .6, t.l, c, 0, t.h * .3 + .3, 0));
  g.add(box(t.w * .85, t.h * .45, t.l * .45, 0x37474f, 0, t.h * .6 + .3 + t.h * .2, -t.l * .12));
  for (const s of [-1, 1]) g.add(box(.25, .5, t.l * .8, 0x111111, s * t.w * .5, .3, 0));
  return g;
}

/** Remove all vehicles and restart the spawn timer. */
export function resetTraffic() {
  for (const v of veh) scene.remove(v.m);
  veh.length = 0;
  spawnTimer = T.firstSpawnDelay;
}

function spawn(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0) return;
  // Vehicles come more often the further you drive, up to a limit.
  spawnTimer = Math.max(T.minInterval, T.startInterval - game.dist / T.rampDistance) * rnd(T.intervalJitterMin, T.intervalJitterMax);
  const t = pickType(), x = pick(T.lanes) + rnd(-T.laneJitter, T.laneJitter);
  const blocked = veh.some(v => Math.abs(v.z - T.spawnZ) < T.clearZ && Math.abs(v.x - x) < T.clearX);
  if (blocked) return;
  const m = mkVeh(t); m.position.set(x, 0, T.spawnZ); scene.add(m);
  veh.push({ m, t, x, z: T.spawnZ, hit: false, fx: 0, ph: rnd(0, 6) });
}

/** Spawn, move, and collide all vehicles for one step. */
export function updateTraffic(dt) {
  spawn(dt);
  const B = CFG.bus, H = CFG.hp;
  for (let i = veh.length - 1; i >= 0; i--) {
    const v = veh[i];
    // Each vehicle moves at its own speed, so relative to the bus it slides by the difference.
    v.z += (game.speed - v.t.v) * dt;
    if (v.hit) { v.x += v.fx * dt; v.m.rotation.y += dt * T.flingSpin; }
    else {
      if (v.t.v < T.wobbleBelow) v.x += Math.sin(game.time * T.wobbleFreq + v.ph) * T.wobbleAmount * dt;
      const touching = Math.abs(v.x - bus.position.x) < v.t.w / 2 + B.hitHalfWidth && Math.abs(v.z) < v.t.l / 2 + B.hitHalfLength;
      if (touching) {
        v.hit = true; v.fx = (v.x >= bus.position.x ? 1 : -1) * T.flingSpeed;
        game.hp -= v.t.dmg * H.hitDamageScale * (H.hitBase + game.speed / H.hitSpeedRef);
        game.speed *= H.hitSpeedKeep; game.shake = H.hitShake;
        if (game.pass > 0) game.pass = Math.max(0, game.pass - CFG.fare.lostOnHit);
        msg("ধাক্কা! 💥", 900);
      }
    }
    v.m.position.set(v.x, 0, v.z);
    if (v.z > T.despawnBehind || v.z < T.despawnAhead || Math.abs(v.x) > T.despawnSide) { scene.remove(v.m); veh.splice(i, 1); }
  }
}
