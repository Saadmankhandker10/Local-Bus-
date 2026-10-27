// Everything on the road the bus can touch: traffic, roadside stalls, and flyover pillars.
// Handles spawning, simple driving AI, collisions, "chipa" near misses, and warnings.
import { CFG } from "./config.js";
import { rnd, pick, clamp } from "./utils.js";
import { scene } from "./world.js";
import { bus } from "./bus.js";
import { game } from "./state.js";
import { emit } from "./events.js";
import { sweptHit, sideGap } from "./physics.js";
import { makeVehicle, makeStall, makePillar, beaconMat } from "./vehicles.js";

const T = CFG.traffic, B = CFG.bus, I = CFG.impact, W = CFG.warning;
const LIGHT = T.types.filter(t => !t.heavy);
const LANE_MIN = Math.min(...T.lanes), LANE_MAX = Math.max(...T.lanes);

const objs = [];      // everything currently on the road
let spawnTimer = 0;   // seconds until the next vehicle tries to spawn
let nextStall = 0;    // distance where the next stall appears
let nextFlyover = 0;  // distance where the next flyover starts
let pillarsLeft = 0;  // pillars still to place in the current flyover
let nextPillar = 0;   // distance where the next pillar of this flyover appears

const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Remove everything and restart all spawn counters. */
export function resetTraffic() {
  for (const o of objs) scene.remove(o.m);
  objs.length = 0;
  spawnTimer = T.firstSpawnDelay;
  nextStall = rnd(CFG.stall.gapMin, CFG.stall.gapMax);
  nextFlyover = CFG.pillar.startDist;
  pillarsLeft = 0;
}

/** Add an object to the road. `static` things (stalls, pillars) stay fixed to the ground. */
function add(t, m, x, isStatic) {
  m.position.set(x, 0, T.spawnZ);
  scene.add(m);
  objs.push({
    t, m, x, z: T.spawnZ, y: 0,
    v: isStatic ? 0 : t.v * rnd(.9, 1.1), // own forward speed
    targetX: x, isStatic,
    hit: false, passed: false,
    vx: 0, vy: 0, spin: 0,                // used after being launched
    ph: rnd(0, 6),                        // wobble phase, so they don't all sway together
  });
}

/** Is there anything near the spawn point at this x? Keeps new things from appearing inside others. */
function spawnBlocked(x) {
  return objs.some(o => Math.abs(o.z - T.spawnZ) < T.clearZ && Math.abs(o.x - x) < T.clearX);
}

/** Pick a vehicle type by weight; heavy types grow more common with distance. */
function pickType() {
  const heavyOk = game.dist >= T.heavyStartDist &&
    !objs.some(o => o.t.heavy && Math.abs(o.z - T.spawnZ) < T.heavyGap);
  const heavyScale = heavyOk ? clamp(1 + (game.dist - T.heavyStartDist) / T.heavyRampDist, 1, T.heavyMaxScale) : 0;
  const weight = t => t.wt * (t.heavy ? heavyScale : 1);
  let r = Math.random() * T.types.reduce((a, t) => a + weight(t), 0);
  for (const t of T.types) { if ((r -= weight(t)) <= 0) return t; }
  return LIGHT[0];
}

function spawn(dt) {
  // Traffic: vehicles come more often the further you drive, up to a limit.
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = Math.max(T.minInterval, T.startInterval - game.dist / T.rampDistance) * rnd(T.intervalJitterMin, T.intervalJitterMax);
    const t = pickType();
    // Under a flyover the middle lane belongs to the pillars.
    const lanes = pillarsLeft > 0 ? T.lanes.filter(l => l !== 0) : T.lanes;
    const x = pick(lanes) + rnd(-T.laneJitter, T.laneJitter);
    if (!spawnBlocked(x)) add(t, makeVehicle(t), x, false);
  }

  // Stalls on a random side of the road.
  if (game.dist >= nextStall) {
    nextStall = game.dist + rnd(CFG.stall.gapMin, CFG.stall.gapMax);
    const x = pick([-1, 1]) * CFG.stall.x;
    if (!spawnBlocked(x)) add(CFG.stall, makeStall(), x, true);
  }

  // Flyovers: a row of pillars placed one by one as the bus moves forward.
  const P = CFG.pillar;
  if (pillarsLeft === 0 && game.dist >= nextFlyover) {
    pillarsLeft = Math.round(rnd(P.countMin, P.countMax));
    nextPillar = game.dist;
  }
  if (pillarsLeft > 0 && game.dist >= nextPillar) {
    add(P, makePillar(), 0, true);
    pillarsLeft--;
    nextPillar = game.dist + P.spacing;
    if (pillarsLeft === 0) nextFlyover = game.dist + rnd(P.gapMin, P.gapMax);
  }
}

/** Simple driving AI: follow the car in front, wobble, change lanes, avoid pillars. */
function drive(o, dt) {
  const t = o.t;
  let targetV = t.v;
  for (const other of objs) {
    if (other === o || other.hit) continue;
    const ahead = o.z - other.z; // positive when `other` is in front (further along -z)
    if (ahead <= 0 || ahead > T.followGap + (t.l + other.t.l) / 2) continue;
    if (sideGap(o.x, t.w / 2, other.x, other.t.w / 2) > 0.2) continue;
    if (other.isStatic) {
      // Something parked in our lane: move over instead of stopping.
      o.targetX = clamp(o.x >= other.x ? other.x + T.laneWidth : other.x - T.laneWidth, LANE_MIN, LANE_MAX);
    } else targetV = Math.min(targetV, other.v);
  }
  // Pillars further ahead: change lane early.
  for (const other of objs) {
    if (other.t !== CFG.pillar) continue;
    const ahead = o.z - other.z;
    if (ahead > 0 && ahead < T.avoidDist && Math.abs(o.targetX - other.x) < (t.w + other.t.w) / 2 + .3) {
      o.targetX = o.x >= 0 ? T.laneWidth : -T.laneWidth;
    }
  }
  if (t.laneChange && Math.random() < t.laneChange * dt) {
    o.targetX = clamp(o.targetX + pick([-1, 1]) * T.laneWidth, LANE_MIN, LANE_MAX); // CNGs love cutting lanes
  }
  o.v += (targetV - o.v) * ease(T.speedResponse, dt);
  o.x += (o.targetX - o.x) * ease(T.laneResponse, dt);
  if (t.wobble) o.x += Math.sin(game.time * t.wobbleFreq + o.ph) * t.wobble * dt;
}

/** Launch a light object away from the bus. Lighter things fly further. */
function launch(o) {
  const closing = Math.max(0, game.speed - o.v);
  const share = I.busMass / (I.busMass + o.t.mass); // close to 1 for a rickshaw, smaller for a car
  const side = o.x >= bus.position.x ? 1 : -1;
  o.hit = true;
  o.v = o.v + closing * I.pushForward * share;
  o.vx = side * (I.flingSide + closing * I.flingPerSpeed) * share;
  o.vy = I.hop * share;
  o.spin = o.t === CFG.stall ? 0 : side * I.spin * share;
  game.speed *= 1 - I.slowFactor * (o.t.mass / (I.busMass + o.t.mass));

  // Stalls come apart: every part gets its own little launch.
  if (o.t === CFG.stall) {
    for (const part of o.m.children) {
      part.userData.vel = [side * rnd(2, 8), rnd(3, 8), -rnd(2, 10)];
      part.userData.spin = rnd(-8, 8);
    }
  }
}

/** Move a launched object: fly, fall, bounce, spin. */
function fly(o, dt) {
  o.v = Math.max(0, o.v - I.flyDrag * dt);
  o.vx -= o.vx * ease(I.sideDrag, dt);
  o.vy -= I.gravity * dt;
  o.y += o.vy * dt;
  if (o.y < 0) { o.y = 0; o.vy = -o.vy * .3; }
  o.m.rotation.y += o.spin * dt;
  if (o.t === CFG.stall) {
    o.v = 0; o.vx = 0; o.y = 0; // the stall base stays; its parts fly instead
    for (const part of o.m.children) {
      const [vx, vy, vz] = part.userData.vel;
      part.userData.vel[1] = vy - I.gravity * dt;
      part.position.x += vx * dt; part.position.z += vz * dt;
      part.position.y = Math.max(.1, part.position.y + vy * dt);
      part.rotation.x += part.userData.spin * dt;
    }
  }
  o.x += o.vx * dt;
}

/** Spawn, move, and collide everything for one step. Also sets game.warn. */
export function updateTraffic(dt) {
  spawn(dt);
  game.invulnT = Math.max(0, game.invulnT - dt);
  let warn = false;
  const bx = bus.position.x;

  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i], t = o.t;
    if (o.hit) fly(o, dt);
    else if (!o.isStatic) drive(o, dt);

    // Each thing moves at its own speed, so relative to the bus it slides by the difference.
    const zPrev = o.z;
    o.z += (game.speed - o.v) * dt;

    if (!o.hit && !game.crashing) {
      if (game.invulnT <= 0 && sweptHit(bx, B.hitHalfWidth, o.x, t.w / 2, zPrev, o.z, B.hitHalfLength + t.l / 2)) {
        game.invulnT = CFG.hp.invulnTime;
        if (t.heavy) emit("heavyHit", { type: t.name });
        else { launch(o); emit("crash", { type: t.name, fine: t.fine, dmg: t.dmg }); }
      } else if (!o.passed && o.z > 0) {
        // It just passed the bus without touching: was it a tight squeeze?
        o.passed = true;
        const gap = sideGap(bx, B.hitHalfWidth, o.x, t.w / 2);
        if (t.chipa && gap > 0 && gap < CFG.chipa.gap && game.speed >= CFG.chipa.minSpeed) emit("chipa", { type: t.name, points: t.chipa });
      }

      // Heavy thing ahead and in our path? Light its beacon and warn the HUD.
      if (t.heavy) {
        const closing = game.speed - o.v;
        const warnDist = Math.max(W.minDist, closing * W.time);
        const ahead = -o.z - B.hitHalfLength - t.l / 2;
        const inPath = sideGap(bx, B.hitHalfWidth, o.x, t.w / 2) < W.sideMargin;
        const danger = ahead > -t.l && ahead < warnDist && inPath && closing > 0;
        o.m.userData.beacon.visible = danger;
        warn = warn || danger;
      }
    }

    o.m.position.set(o.x, o.y, o.z);
    if (o.z > T.despawnBehind || o.z < T.despawnAhead || Math.abs(o.x) > T.despawnSide) {
      scene.remove(o.m); objs.splice(i, 1);
    }
  }

  game.warn = warn;
  // Gentle pulse (2 Hz) instead of hard flashing.
  beaconMat.opacity = .55 + .45 * Math.sin(game.time * Math.PI * 2 * W.pulseHz);
}
