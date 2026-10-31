// Everything on the road the bus can touch: traffic, roadside stalls, and flyover pillars.
// Handles spawning, simple driving AI, collisions, launches, and heavy-hazard warnings.
//
// Every object lives on a road piece: `seg` (which piece), `s` (how far along it) and
// `x` (how far right of the centre line). `z` is worked out each step: the distance
// from the bus along the road (negative = ahead), so the old collision rules still work.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick, clamp } from "./utils.js";
import { scene, box, person, animatePerson } from "./world.js";
import { game } from "./state.js";
import { emit, on } from "./events.js";
import { sweptHit, sideGap } from "./physics.js";
import { makeVehicle, makeStall, makeThela, makeFishStall, makePillar, makeManhole, makeTrench, makeRamp, beaconMat, dangerRingMat } from "./vehicles.js";
import { disposeHierarchy, sparkMat } from "./shaders.js";
import {
  spawnCrashEffects,
  spawnScrapeSparks,
  spawnDizzyStars,
  spawnDustPuffs,
  spawnLooseItems,
  spawnComicWord,
  spawnGroundSplat
} from "./effects.js";
import { currentStage } from "./journey.js";
import { SEGS, here, ahead, walk, place, lanesOf } from "./map.js";
import { PROCESSION_EVENTS } from "./data/events.js";

const T = CFG.traffic, B = CFG.bus, I = CFG.impact, W = CFG.warning, J = CFG.jam, PED = CFG.pedestrians, HZ = CFG.hazards;
const LIGHT = T.types.filter(t => !t.heavy);
const TRENCH_DEF = { name: "trench", w: 2.6, l: 4.8, h: 1.2, mass: 0.8, damage: 25, hazard: true };
const MANHOLE_DEF = { name: "manhole", w: 1.35, l: 1.35, h: 0.3, mass: 0.2, damage: 15, hazard: true };
const RAMP_DEF = { name: "ramp", w: 3.2, l: 6.2, h: 1.35, mass: 0, damage: HZ.rampBonus, isRamp: true };
const jamSeg = SEGS.findIndex(s => s.id === J.segId);
const PROC_MAP = new Map();
for (const ev of PROCESSION_EVENTS) {
  const idx = SEGS.findIndex(s => s.id === ev.segId);
  if (idx >= 0) PROC_MAP.set(idx, { ...ev, segIdx: idx });
}
let jamHornT = 0, demoWarnT = 0, pedWarnT = 0;
const procPassedSet = new Set();

const objs = [];      // everything currently on the road
const peds = [];      // crossing pedestrians + ejected angry drivers
const chunks = [];    // pooled flying 3D vehicle parts (bumpers, doors, hoods, mirrors, wheels)
for (let i = 0; i < 24; i++) {
  const m = box(.65, .28, .45, pick([0xe53935, 0x1e88e5, 0xfdd835, 0x263238, 0x2e9e4f]));
  m.visible = false;
  scene.add(m);
  chunks.push({ m, active: false, seg: 0, s: 0, x: 0, y: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, t: 0 });
}

// Pooled additive sparks for metal scrapes, barrier hits, and high-energy collisions
const sparkGeo = new THREE.IcosahedronGeometry(0.12, 0);
sparkGeo.userData = { isShared: true };
const sparkPool = Array.from({ length: 16 }, () => {
  const m = new THREE.Mesh(sparkGeo, sparkMat);
  m.visible = false;
  scene.add(m);
  return { m, active: false, t: 0, maxT: 0.35, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
});

export function emitSparks(x, y, z, count = 5) {
  for (let i = 0; i < count; i++) {
    const sp = sparkPool.find(s => !s.active);
    if (!sp) break;
    sp.active = true; sp.t = 0; sp.maxT = rnd(0.2, 0.35);
    sp.x = x + rnd(-0.25, 0.25); sp.y = y + rnd(-0.15, 0.15); sp.z = z + rnd(-0.25, 0.25);
    sp.vx = rnd(-7, 7); sp.vy = rnd(3, 8); sp.vz = rnd(-7, 7);
    sp.m.position.set(sp.x, sp.y, sp.z);
    sp.m.visible = true;
  }
}

let spawnTimer = 0;   // seconds until the next vehicle tries to spawn
let nextStall = 0;    // odometer distance where the next stall appears
let nextPed = 0;      // odometer distance where the next crossing pedestrian appears
let nextTrench = 0;   // odometer distance where the next WASA trench appears
let nextManhole = 0;  // odometer distance where the next open manhole appears
let nextRamp = 0;     // odometer distance where the next jump ramp appears
const pillarsDone = new Set(); // pillars already placed this run ("seg:index")
const spot = { seg: 0, s: 0 }; // reused spawn position

const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
/** At a fork, most traffic keeps to the main road; some takes the side street or flyover. */
const pickBranch = list => (Math.random() < CFG.map.altShare ? list[list.length - 1] : list[0]);

/** Is (seg) part of the bus's own road right now (same piece, the next one, or the last one)? */
function onBusRoad(seg) {
  return seg === here.seg || seg === here.prev || SEGS[here.seg].next.includes(seg);
}

/** Remove everything and restart all spawn counters from this odometer distance. */
export function resetTraffic(fromDist = 0) {
  for (const o of objs) {
    scene.remove(o.m);
    if (o.hit) disposeHierarchy(o.m);
  }
  for (const p of peds) scene.remove(p.m);
  for (const c of chunks) { c.active = false; c.m.visible = false; }
  for (const sp of sparkPool) { sp.active = false; sp.m.visible = false; }
  objs.length = 0;
  peds.length = 0;
  spawnTimer = T.firstSpawnDelay;
  nextStall = fromDist + rnd(CFG.stall.gapMin, CFG.stall.gapMax);
  nextPed = fromDist + rnd(PED.gapMin, PED.gapMax);
  nextTrench = fromDist + rnd(110, HZ.trenchGapMax);
  nextManhole = fromDist + rnd(85, HZ.manholeGapMax);
  nextRamp = fromDist + rnd(140, HZ.rampGapMax);
  jamHornT = demoWarnT = pedWarnT = 0;
  procPassedSet.clear();
  pillarsDone.clear();
}

/** Add an object to the road. `static` things (stalls, pillars, trenches, ramps) stay fixed to the ground. */
function add(t, m, seg, s, x, isStatic) {
  scene.add(m);
  const S = SEGS[seg];
  // On two-way boulevards, right-hand lanes (x > 0.6) carry oncoming traffic facing the bus!
  const oncoming = !isStatic && S.half >= 6 && x > 0.6;
  const dir = oncoming ? -1 : 1;
  const o = {
    t, m, seg, s, x, y: 0, z: 0,
    dir,
    v: isStatic ? 0 : t.v * rnd(.9, 1.1) * (oncoming ? -0.58 : 1), // own forward speed (negative if oncoming)
    targetX: x, isStatic,
    hit: false, fallen: false, alarm: false,
    mirrorL: true, mirrorR: true,
    vx: 0, vy: 0, spin: 0, rot: oncoming ? Math.PI : 0, // oncoming vehicles face Math.PI
    ph: rnd(0, 6),                        // wobble phase, so they don't all sway together
  };
  o.z = -ahead(seg, s);
  objs.push(o);
  place(m, seg, s, x, 0, o.rot);
}

/** Spawn flying detachable 3D chunks (bumper, door, hood, wheel, or side mirror) at (seg, s, x). */
function spawnChunks(seg, s, x, count = 3, isMirror = false) {
  let spawned = 0;
  for (const c of chunks) {
    if (c.active) continue;
    c.active = true;
    c.seg = seg; c.s = s; c.x = x + rnd(-.4, .4); c.y = isMirror ? 1.1 : rnd(.5, 1.3);
    c.vx = rnd(-7, 7); c.vy = isMirror ? rnd(3.5, 6.5) : rnd(4.5, 9.5); c.vz = rnd(-8, 8);
    c.rx = rnd(-12, 12); c.rz = rnd(-12, 12);
    c.t = isMirror ? 0.9 : 1.35;
    c.m.scale.set(isMirror ? .26 : rnd(.45, .85), isMirror ? .18 : rnd(.2, .4), isMirror ? .22 : rnd(.35, .75));
    c.m.visible = true;
    place(c.m, c.seg, c.s, c.x, c.y);
    if (++spawned >= count) break;
  }
}

/** Eject an angry driver/puller from a crashed vehicle who shouts and runs to join the chasing mob! */
function ejectDriver(seg, s, x) {
  const m = person(pick([0xd32f2f, 0x1976d2, 0x388e3c, 0xfbc02d, 0x8e24aa]), 0);
  scene.add(m);
  const side = x >= 0 ? 1 : -1;
  peds.push({
    m, seg, s,
    x: x + side * 1.1,
    targetX: side * (SEGS[seg].half + 1.2),
    state: "impatient",
    animTime: rnd(0, 5),
    timer: 0,
    scared: true, angry: true, ph: rnd(0, 6),
    vx: 0, vy: 0, vz: 0,
    rotX: 0, rotZ: 0, spinVx: 0, spinVz: 0
  });
  place(m, seg, s, x + side * 1.1);
  spawnDizzyStars(m, 2.8);
}

/** Is anything near this spot already? Keeps new things from appearing inside others. */
function spawnBlocked(seg, s, x) {
  return objs.some(o => o.seg === seg && Math.abs(o.s - s) < T.clearZ && Math.abs(o.x - x) < T.clearX);
}

/** Pick a vehicle type by weight: the stage mix, the road kind, and heavy types growing with distance. */
function pickType(kind) {
  const heavyOk = kind !== "street" && game.dist >= T.heavyStartDist &&
    !objs.some(o => o.t.heavy && Math.abs(o.z + T.spawnAhead) < T.heavyGap);
  const tr = currentStage().traffic, km = CFG.roadKinds[kind] || {};
  const heavyScale = heavyOk ? clamp(1 + (game.dist - T.heavyStartDist) / T.heavyRampDist, 1, T.heavyMaxScale) * tr.heavy : 0;
  const weight = t => t.wt * (t.heavy ? heavyScale : 1) * (tr.mix[t.name] ?? 1) * (km[t.name] ?? 1);
  let r = Math.random() * T.types.reduce((a, t) => a + weight(t), 0);
  for (const t of T.types) { if ((r -= weight(t)) <= 0) return t; }
  return LIGHT[0];
}

/** Does the middle of this main road have flyover pillars at s? */
function underFlyover(seg, s) {
  const S = SEGS[seg];
  return S.pillarFrom !== undefined && s > S.pillarFrom - 20 && s < S.pillarTo + 20;
}

function spawn(dt) {
  // Traffic: vehicles come more often the further you drive, up to a limit.
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    // Busier stages (density > 1) send vehicles more often.
    spawnTimer = Math.max(T.minInterval, T.startInterval - game.dist / T.rampDistance) * rnd(T.intervalJitterMin, T.intervalJitterMax) / currentStage().traffic.density;
    walk(here.seg, here.s, T.spawnAhead, pickBranch, spot);
    const S = SEGS[spot.seg];
    const t = pickType(S.kind);
    // Under a flyover the middle lane belongs to the pillars.
    let lanes = lanesOf(spot.seg, T.lanes);
    if (underFlyover(spot.seg, spot.s)) lanes = lanes.filter(l => l !== 0);
    const proc = PROC_MAP.get(spot.seg);
    if (proc && proc.openCorridor === "wrong-way") {
      const pf = spot.s / S.len;
      if (pf >= proc.fromFrac && pf <= proc.toFrac) {
        // Keep inner bypass lane clear so oncoming vehicles do not spawn directly in front of bypassing bus
        lanes = lanes.filter(l => l <= 0 || l > 3.5);
      }
    }
    const x = pick(lanes) + rnd(-T.laneJitter, T.laneJitter);
    if (ahead(spot.seg, spot.s) > T.spawnAhead * .5 && !spawnBlocked(spot.seg, spot.s, x)) add(t, makeVehicle(t), spot.seg, spot.s, x, false);
  }

  // Stalls on a random side of ordinary roads (not on flyovers).
  if (game.dist >= nextStall) {
    nextStall = game.dist + rnd(CFG.stall.gapMin, CFG.stall.gapMax) / currentStage().stalls;
    walk(here.seg, here.s, T.spawnAhead, pickBranch, spot);
    const S = SEGS[spot.seg];
    const x = pick([-1, 1]) * (S.half + CFG.stall.edgeOffset);
    if (S.kind !== "flyover" && !spawnBlocked(spot.seg, spot.s, x)) add(CFG.stall, makeStall(), spot.seg, spot.s, x, true);
  }

  // Crossing pedestrians on ordinary roads (they walk from one pavement to the other and dodge the bus).
  if (game.dist >= nextPed) {
    nextPed = game.dist + rnd(PED.gapMin, PED.gapMax);
    walk(here.seg, here.s, T.spawnAhead * .75, pickBranch, spot);
    const S = SEGS[spot.seg];
    if (S.kind !== "flyover") {
      const side = pick([-1, 1]), startX = side * (S.half + .9);
      const m = person(pick([0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0x00897b, 0xfdd835]));
      scene.add(m);
      peds.push({
        m, seg: spot.seg, s: spot.s,
        x: startX, targetX: -startX,
        state: "walk",
        animTime: rnd(0, 10),
        timer: 0,
        scared: false, angry: false, ph: rnd(0, 6),
        vx: 0, vy: 0, vz: 0,
        rotX: 0, rotZ: 0, spinVx: 0, spinVz: 0
      });
      place(m, spot.seg, spot.s, startX);
    }
  }

  // WASA road digging trenches with bamboo barricades.
  if (game.dist >= nextTrench) {
    nextTrench = game.dist + rnd(HZ.trenchGapMin, HZ.trenchGapMax);
    walk(here.seg, here.s, T.spawnAhead, pickBranch, spot);
    const lanes = lanesOf(spot.seg, T.lanes).filter(l => Math.abs(l) >= 2);
    const x = pick(lanes);
    if (!spawnBlocked(spot.seg, spot.s, x)) add(TRENCH_DEF, makeTrench(), spot.seg, spot.s, x, true);
  }

  // Open manholes on the road.
  if (game.dist >= nextManhole) {
    nextManhole = game.dist + rnd(HZ.manholeGapMin, HZ.manholeGapMax);
    walk(here.seg, here.s, T.spawnAhead, pickBranch, spot);
    const lanes = lanesOf(spot.seg, T.lanes);
    const x = pick(lanes);
    if (!spawnBlocked(spot.seg, spot.s, x)) add(MANHOLE_DEF, makeManhole(), spot.seg, spot.s, x, true);
  }

  // Wooden stunt jump ramps ("🚀 ঠেলায় চড়ে উড়েন!").
  if (game.dist >= nextRamp) {
    nextRamp = game.dist + rnd(HZ.rampGapMin, HZ.rampGapMax);
    walk(here.seg, here.s, T.spawnAhead, pickBranch, spot);
    const x = pick([-2.5, 2.5]);
    if (!spawnBlocked(spot.seg, spot.s, x)) add(RAMP_DEF, makeRamp(), spot.seg, spot.s, x, true);
  }

  // Flyover pillars: fixed spots down the middle of the road below a flyover.
  const P = CFG.pillar;
  for (const seg of [here.seg, ...SEGS[here.seg].next]) {
    const S = SEGS[seg];
    if (S.pillarFrom === undefined || game.dist < P.startDist) continue;
    for (let k = 0, s = S.pillarFrom; s <= S.pillarTo; k++, s += P.spacing) {
      const key = seg + ":" + k, a = ahead(seg, s);
      if (pillarsDone.has(key) || !(a > 0 && a < T.spawnAhead)) continue;
      pillarsDone.add(key);
      add(P, makePillar(), seg, s, 0, true);
    }
  }
}

/** Simple driving AI: follow the car in front, wobble, change lanes, avoid pillars. */
function drive(o, dt) {
  if (o.dir < 0) {
    // Oncoming vehicles stay in the right-hand lanes and cruise steadily towards the bus.
    const proc = PROC_MAP.get(o.seg);
    if (proc && proc.openCorridor === "wrong-way") {
      const S = SEGS[proc.segIdx], f = o.s / S.len;
      if (f >= proc.fromFrac && f <= proc.toFrac) {
        o.targetX = 5.0; // Near Asad Gate procession, oncoming traffic hugs outer shoulder leaving inner lane open
      }
    }
    const rLanes = [2.5, 5];
    o.targetX = clamp(o.targetX, rLanes[0], rLanes[1]);
    o.x += (o.targetX - o.x) * ease(T.laneResponse, dt);
    if (o.t.wobble) o.x += Math.sin(game.time * o.t.wobbleFreq + o.ph) * o.t.wobble * 0.5 * dt;
    return;
  }
  const t = o.t, lanes = lanesOf(o.seg, T.lanes).filter(l => l <= 0);
  const lmin = lanes[0] ?? -5, lmax = lanes[lanes.length - 1] ?? 0;
  let targetV = t.v;
  for (const other of objs) {
    if (other === o || other.hit || other.seg !== o.seg) continue;
    const gap = other.s - o.s; // positive when `other` is in front
    if (other.t === CFG.pillar && gap > 0 && gap < T.avoidDist && Math.abs(o.targetX - other.x) < (t.w + other.t.w) / 2 + .3) {
      o.targetX = o.x >= 0 ? T.laneWidth : -T.laneWidth; // change lane early before a pillar
    }
    if (gap <= 0 || gap > T.followGap + (t.l + other.t.l) / 2) continue;
    if (sideGap(o.x, t.w / 2, other.x, other.t.w / 2) > 0.2) continue;
    if (other.isStatic) {
      // Something parked in our lane: move over instead of stopping.
      o.targetX = clamp(o.x >= other.x ? other.x + T.laneWidth : other.x - T.laneWidth, lmin, lmax);
    } else targetV = Math.min(targetV, other.v);
  }
  if (t.laneChange && Math.random() < t.laneChange * dt) {
    o.targetX = clamp(o.targetX + pick([-1, 1]) * T.laneWidth, lmin, lmax); // CNGs love cutting lanes
  }
  // Procession & demonstration jam: traffic slows to a crawl and merges into open lane / wrong lane.
  const proc = PROC_MAP.get(o.seg);
  if (proc) {
    const S = SEGS[proc.segIdx], f = o.s / S.len, barS = S.len * proc.barricadeAt;
    if (f >= proc.fromFrac && f <= proc.toFrac) {
      targetV = Math.min(targetV, proc.maxTrafficSpeed);
      if (proc.openCorridor === "left-lane" && o.s < barS + proc.barricadeHalfLen && o.targetX > proc.barricadeMinX - t.w / 2 - .3) {
        o.targetX = lmin;
        if (o.s > barS - proc.barricadeHalfLen - 4 && o.x > proc.barricadeMinX - .4) targetV = 0;
      } else if (proc.openCorridor === "wrong-way" && o.targetX < 0) {
        if (o.s > barS - proc.barricadeHalfLen - 6 && o.s < barS + proc.barricadeHalfLen) targetV = 0;
      }
    }
  }
  o.targetX = clamp(o.targetX, lmin, lmax); // a narrower road ahead squeezes everyone in
  o.v += (targetV - o.v) * ease(T.speedResponse, dt);
  o.x += (o.targetX - o.x) * ease(T.laneResponse, dt);
  if (t.wobble) o.x += Math.sin(game.time * t.wobbleFreq + o.ph) * t.wobble * dt;
}

/** Launch a light object away from the bus. Lighter things fly further, parts detach, rickshaws tip over! */
function launch(o) {
  const closing = Math.max(8, game.speed - o.v);
  const share = I.busMass / (I.busMass + (o.t.mass || 0.5)); // close to 1 for a rickshaw, smaller for a car
  const side = o.x >= game.lat ? 1 : -1;
  o.hit = true;
  o.v = Math.max(0, o.v) + closing * I.pushForward * share;
  o.vx = side * (I.flingSide + closing * I.flingPerSpeed) * share;
  o.vy = I.hop * share;
  o.spin = o.t === CFG.stall || o.t.hazard ? 0 : side * I.spin * share;
  game.speed *= 1 - I.slowFactor * ((o.t.mass || 0.5) / (I.busMass + (o.t.mass || 0.5)));

  // Detach flying 3D vehicle chunks (bumpers, doors, hoods, wheels).
  if (!o.t.hazard && o.t !== CFG.stall) {
    spawnChunks(o.seg, o.s, o.x, o.t.name === "vip" || o.t.name === "car" ? 4 : 2, false);
    if (Math.random() < 0.75) ejectDriver(o.seg, o.s, o.x);
  }

  // Section 2.4: Spawn explosive debris, sparks, dust, comic words, and loose items
  spawnCrashEffects({
    x: o.m.position.x,
    y: o.m.position.y + 0.9,
    z: o.m.position.z,
    type: o.t.name,
    severity: share > 0.7 ? 1.0 : 0.8,
    isPedestrian: o.t.name === "rickshaw" || o.t.name === "bike",
    vx: o.vx,
    vz: o.v,
  });
  // Rickshaws and bikes tip onto their side ("fallen" state).
  if (o.t.name === "rickshaw" || o.t.name === "bike") {
    o.fallen = true;
    o.fallDir = side;
  }
  // Cars, VIP SUVs, and Police cars set off hazard blinkers and car alarms!
  if (o.t.name === "car" || o.t.name === "vip" || o.t.name === "policeCar") {
    o.alarm = true;
    emit("carAlarm", o.m.position);
  }

  // Stalls come apart: every part gets its own little launch.
  if (o.t === CFG.stall || o.t.name === "trench") {
    const isThela = o.m.userData.stallType === "thela";
    const isFish = o.m.userData.stallType === "fish";
    if (isThela) {
      spawnLooseItems(o.m.position.x, 1.1, o.m.position.z, 6);
      spawnComicWord(o.m.position.x, 2.2, o.m.position.z);
    } else if (isFish) {
      spawnLooseItems(o.m.position.x, 0.9, o.m.position.z, 6);
      spawnComicWord(o.m.position.x, 2.2, o.m.position.z);
    }
    for (const part of o.m.children) {
      part.userData.vel = [side * rnd(2, 8), rnd(3, 8), -rnd(2, 10)];
      part.userData.spin = rnd(-8, 8);
    }
  }
}

/** Move a launched object: fly, fall, bounce, spin, tip over, flash hazards. */
function fly(o, dt) {
  o.v = Math.max(0, o.v - I.flyDrag * dt);
  o.vx -= o.vx * ease(I.sideDrag, dt);
  o.vy -= I.gravity * dt;
  o.y += o.vy * dt;
  if (o.y < 0) { o.y = 0; o.vy = -o.vy * .3; }
  o.rot += o.spin * dt;
  if (o.fallen) {
    o.m.rotation.z = approachAngle(o.m.rotation.z, (o.fallDir || 1) * 1.42, 10 * dt);
  }
  if (o.alarm && o.m.userData.hazards) {
    const blink = Math.floor(game.time * 9) % 2 === 0;
    for (const hz of o.m.userData.hazards) hz.visible = blink;
  }
  if (o.t === CFG.stall || o.t.name === "trench") {
    o.v = 0; o.vx = 0; o.y = 0; // the base stays; its parts fly instead
    for (const part of o.m.children) {
      if (!part.userData.vel) continue;
      const [vx, vy, vz] = part.userData.vel;
      part.userData.vel[1] = vy - I.gravity * dt;
      part.position.x += vx * dt; part.position.z += vz * dt;
      part.position.y = Math.max(.1, part.position.y + vy * dt);
      part.rotation.x += part.userData.spin * dt;
    }
  }
  o.x += o.vx * dt;
}

function approachAngle(cur, target, step) {
  return cur + (target - cur) * Math.min(1, step);
}

/** Move along the road; at the end of a piece, carry on to the next one. @returns false if it left the map */
function advance(o, dt) {
  o.s += o.v * dt;
  if (o.s < 0) return false;
  while (o.s > SEGS[o.seg].len) {
    const nx = SEGS[o.seg].next;
    if (!nx.length) return false;
    o.s -= SEGS[o.seg].len;
    o.seg = pickBranch(nx);
  }
  return true;
}

/** Spawn, move, and collide everything for one step. Also sets game.warn. */
export function updateTraffic(dt) {
  spawn(dt);
  game.invulnT = Math.max(0, game.invulnT - dt);

  // Shahbagh / Asad Gate procession barricades: solid, non-crashable moving roadblock + traffic jam horns.
  const activeProc = PROC_MAP.get(here.seg);
  if (activeProc && !game.crashing && !game.caught) {
    const S = SEGS[activeProc.segIdx], f = here.s / S.len, barS = S.len * activeProc.barricadeAt;
    if (f >= activeProc.fromFrac && f <= activeProc.toFrac && game.time > jamHornT) {
      jamHornT = game.time + activeProc.hornInterval * rnd(.7, 1.3);
      emit("jamHorn");
    }
    const halfSpan = activeProc.barricadeHalfLen + B.hitHalfLength;
    const minX = activeProc.barricadeMinX;
    const maxX = activeProc.barricadeMaxX !== null ? activeProc.barricadeMaxX : S.half;
    const busLeft = game.lat - B.hitHalfWidth;
    const busRight = game.lat + B.hitHalfWidth;
    const hitBlockade = busRight > minX && busLeft < maxX;

    if (Math.abs(here.s - barS) < halfSpan && hitBlockade) {
      if (here.s < barS - activeProc.barricadeHalfLen + 1.5) {
        game.speed = 0;
        game.boostT = 0;
        here.s = Math.min(here.s, barS - halfSpan + .2);
        if (activeProc.openCorridor === "wrong-way") {
          game.lat += 2.6 * dt; // gently guide right through median opening into opposite lane!
        } else {
          game.lat -= 2.2 * dt; // gently guide left towards open left lane (Shahbagh)
        }
      } else {
        if (activeProc.openCorridor === "wrong-way") {
          game.lat = Math.max(game.lat, maxX + B.hitHalfWidth);
        } else {
          game.lat = Math.min(game.lat, minX - B.hitHalfWidth);
        }
      }
      if (game.time > demoWarnT) {
        demoWarnT = game.time + 3.5;
        emit("processionBlocked", { event: activeProc });
        if (activeProc.id === "shahbag-demo") emit("demoBlocked");
      }
    }
    if (here.s > barS + activeProc.barricadeHalfLen + 1 && here.s < barS + activeProc.barricadeHalfLen + 30 && !procPassedSet.has(activeProc.id)) {
      procPassedSet.add(activeProc.id);
      emit("processionPassed", { event: activeProc });
    }
  }

  let warn = false;
  const bx = game.lat;

  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i], t = o.t;
    if (o.hit) fly(o, dt);
    else if (!o.isStatic) drive(o, dt);

    const zPrev = o.z;
    const alive = advance(o, dt);
    o.z = -ahead(o.seg, o.s);
    // Gone: off the end of the map, on a road the bus is not near, or too far ahead/behind.
    if (!alive || Number.isNaN(o.z) || o.z > T.despawnBehind || o.z < T.despawnAhead || Math.abs(o.x) > SEGS[o.seg].half + T.despawnSide) {
      scene.remove(o.m);
      if (o.hit) disposeHierarchy(o.m);
      objs.splice(i, 1);
      continue;
    }

    // Animate police siren lightbars on patrol police cars.
    if (o.m.userData.siren) {
      const redOn = Math.floor(game.time * 10) % 2 === 0;
      o.m.userData.siren.red.visible = redOn;
      o.m.userData.siren.blue.visible = !redOn;
    }

    // Animate wheels on 3D traffic buses
    if (o.m.userData.busController) {
      o.m.userData.busController.roll(o.v || t.v, dt);
    }

    if (!o.hit && !game.crashing && !game.caught && onBusRoad(o.seg)) {
      const hitNow = sweptHit(bx, B.hitHalfWidth, o.x, t.w / 2, zPrev, o.z, B.hitHalfLength + t.l / 2);
      if (hitNow && game.busY < 1.8) {
        if (t.isRamp) {
          // Wooden stunt ramp: launch the bus into the air!
          o.hit = true;
          game.busVy = 12.2;
          game.busY = 0.25;
          game.speed = Math.max(game.speed, 34);
          game.invulnT = 1.6;
          emit("rampJump", { type: "ramp", damage: t.damage, x: o.m.position.x, y: o.m.position.y + 1.5, z: o.m.position.z });
        } else if (t.hazard) {
          // WASA trench or open manhole: jolt the bus suspension!
          launch(o);
          game.busVy = t.name === "trench" ? 5.6 : 3.4;
          game.busY = 0.15;
          game.shake = Math.max(game.shake, 0.75);
          emitSparks(o.m.position.x, o.m.position.y + 1.0, o.m.position.z, 8);
          emit("crash", { type: t.name, damage: t.damage, x: o.m.position.x, y: o.m.position.y + 1.2, z: o.m.position.z });
        } else if (!t.heavy) {
          launch(o);
          game.invulnT = CFG.hit.invulnTime;
          emitSparks(o.m.position.x, o.m.position.y + 1.2, o.m.position.z, 8);
          emit("crash", {
            type: t.name,
            damage: t.damage,
            x: o.m.position.x,
            y: o.m.position.y + 1.4,
            z: o.m.position.z,
          });
        // Right after a light crash the bus may be shoved into something big: forgive that.
        } else if (game.invulnT <= 0) {
          emitSparks(o.m.position.x, o.m.position.y + 1.4, o.m.position.z, 12);
          spawnCrashEffects({
            x: o.m.position.x,
            y: o.m.position.y + 1.4,
            z: o.m.position.z,
            type: t.name,
            severity: 1.5,
            color: 0x263238,
          });
          emit("heavyHit", { type: t.name });
        }
      } else if (!t.heavy && !t.isRamp && !t.hazard && o.m.userData.mirrors) {
        // Side-mirror grazing: passing super close beside a car/VIP/policeCar snaps off its side mirror!
        const sGap = sideGap(bx, B.hitHalfWidth, o.x, t.w / 2);
        const zOverlap = Math.min(zPrev, o.z) < B.hitHalfLength + t.l / 2 && Math.max(zPrev, o.z) > -(B.hitHalfLength + t.l / 2);
        if (zOverlap && sGap >= 0 && sGap < 0.58) {
          const busOnLeft = bx < o.x;
          if (busOnLeft && o.mirrorL) {
            o.mirrorL = false;
            o.m.userData.mirrors.left.visible = false;
            spawnChunks(o.seg, o.s, o.x - t.w * .5, 1, true);
            emitSparks(o.m.position.x - t.w * .5, o.m.position.y + 1.2, o.m.position.z, 5);
            spawnCrashEffects({
              x: o.m.position.x - t.w * .5,
              y: o.m.position.y + 1.2,
              z: o.m.position.z,
              type: "mirror",
              severity: 0.5,
            });
            emit("mirrorHit", { type: "mirror", damage: HZ.mirrorBonus, x: o.m.position.x, y: o.m.position.y + 1.2, z: o.m.position.z });
          } else if (!busOnLeft && o.mirrorR) {
            o.mirrorR = false;
            o.m.userData.mirrors.right.visible = false;
            spawnChunks(o.seg, o.s, o.x + t.w * .5, 1, true);
            emitSparks(o.m.position.x + t.w * .5, o.m.position.y + 1.2, o.m.position.z, 5);
            spawnCrashEffects({
              x: o.m.position.x + t.w * .5,
              y: o.m.position.y + 1.2,
              z: o.m.position.z,
              type: "mirror",
              severity: 0.5,
            });
            emit("mirrorHit", { type: "mirror", damage: HZ.mirrorBonus, x: o.m.position.x, y: o.m.position.y + 1.2, z: o.m.position.z });
          }
        }
      }

      // Heavy thing ahead and in our path? Light its beacon and warn the HUD.
      if (t.heavy) {
        const closing = game.speed - o.v;
        const warnDist = Math.max(W.minDist, closing * W.time);
        const aheadGap = -o.z - B.hitHalfLength - t.l / 2;
        const inPath = sideGap(bx, B.hitHalfWidth, o.x, t.w / 2) < W.sideMargin;
        const danger = aheadGap > -t.l && aheadGap < warnDist && inPath && closing > 0;
        o.m.userData.beacon.visible = danger;
        if (o.m.userData.dangerRing) {
          o.m.userData.dangerRing.visible = danger;
        }
        warn = warn || danger;
      }
    }

    place(o.m, o.seg, o.s, o.x, o.y, o.rot);
    if (o.fallen) o.m.rotation.z = (o.fallDir || 1) * 1.42;
  }

  // Update flying detachable 3D vehicle chunks.
  for (const c of chunks) {
    if (!c.active) continue;
    c.t -= dt;
    if (c.t <= 0) { c.active = false; c.m.visible = false; continue; }
    c.vy -= I.gravity * dt;
    c.x += c.vx * dt;
    c.s += c.vz * dt;
    c.y += c.vy * dt;
    if (c.y < 0.15) { c.y = 0.15; c.vy = -c.vy * 0.45; c.vx *= 0.7; c.vz *= 0.7; }
    place(c.m, c.seg, clamp(c.s, 0, SEGS[c.seg].len), c.x, c.y);
    c.m.rotation.x += c.rx * dt;
    c.m.rotation.z += c.rz * dt;
  }

  // Update additive collision sparks.
  for (const sp of sparkPool) {
    if (!sp.active) continue;
    sp.t += dt;
    if (sp.t >= sp.maxT) { sp.active = false; sp.m.visible = false; continue; }
    sp.vy -= 16 * dt;
    sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.z += sp.vz * dt;
    sp.m.position.set(sp.x, sp.y, sp.z);
    sp.m.scale.setScalar(Math.max(0.1, (1.0 - sp.t / sp.maxT) * 1.5));
  }

  // Update pedestrians: authentic state machine, knockdown physics, getting up, and limb animation.
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i], S = SEGS[p.seg], a = ahead(p.seg, p.s);
    if (Number.isNaN(a) || a < -T.despawnBehind || a > -T.despawnAhead) {
      scene.remove(p.m); peds.splice(i, 1);
      continue;
    }

    p.animTime = (p.animTime || 0) + dt;

    // 1. Tumble State: Mid-air physical spin and trajectory upon being hit by bus
    if (p.state === "tumble") {
      p.vy -= 18.0 * dt;
      p.y = (p.y || 0) + p.vy * dt;
      p.x += p.vx * dt;
      p.s += p.vz * dt;
      p.rotX = (p.rotX || 0) + p.spinVx * dt;
      p.rotZ = (p.rotZ || 0) + p.spinVz * dt;

      animatePerson(p.m, "tumble", p.animTime, dt);
      place(p.m, p.seg, clamp(p.s, 0, S.len), p.x, Math.max(0.08, p.y));
      p.m.rotation.x = p.rotX;
      p.m.rotation.z = p.rotZ;

      // Road impact
      if (p.y <= 0.08 && p.vy < 0) {
        p.y = 0.08;
        p.vy = 0;
        p.vx *= 0.25;
        p.vz *= 0.25;
        p.state = "down";
        p.timer = 1.4; // lies flat on asphalt for 1.4 seconds
        spawnDustPuffs(p.m.position.x, 0.1, p.m.position.z, 5);
        spawnGroundSplat(p.m.position.x, p.m.position.z, "dust");
      }
      continue;
    }

    // 2. Down State: Lying flat on the road
    if (p.state === "down") {
      p.timer -= dt;
      animatePerson(p.m, "down", p.animTime, dt);
      place(p.m, p.seg, clamp(p.s, 0, S.len), p.x, 0.08, p.rotZ || 0);
      p.m.rotation.x = Math.PI / 2;

      if (p.timer <= 0) {
        p.state = "stunned";
        p.timer = 1.3;
        spawnDizzyStars(p.m, 1.3);
      }
      continue;
    }

    // 3. Stunned State: Sitting up dizzily holding head with rotating cartoon stars
    if (p.state === "stunned") {
      p.timer -= dt;
      animatePerson(p.m, "stunned", p.animTime, dt);
      place(p.m, p.seg, clamp(p.s, 0, S.len), p.x, 0.15);
      p.m.rotation.x = Math.PI / 4;

      if (p.timer <= 0) {
        p.state = "getUp";
        p.timer = 1.1;
      }
      continue;
    }

    // 4. Get Up State: Slowly standing back up from the road
    if (p.state === "getUp") {
      p.timer -= dt;
      const tProgress = Math.max(0, p.timer / 1.1);
      animatePerson(p.m, "getUp", p.animTime, dt);
      place(p.m, p.seg, clamp(p.s, 0, S.len), p.x, 0);
      p.m.rotation.x = tProgress * (Math.PI / 4);

      if (p.timer <= 0) {
        p.m.rotation.set(0, 0, 0);
        p.state = "impatient";
        p.scared = true;
        p.targetX = (p.x >= 0 ? 1 : -1) * (S.half + 1.2);
      }
      continue;
    }

    // 5. Collision with Bus: High-speed knock or low-speed leap
    if (onBusRoad(p.seg) && a > -2.2 && a < 5.4 && Math.abs(p.x - bx) < B.hitHalfWidth + 0.65) {
      if (game.speed > 7.5) {
        // High speed impact: Launches pedestrian into tumbling knockdown physics!
        p.state = "tumble";
        const side = p.x >= bx ? 1 : -1;
        p.vx = side * (rnd(5.5, 9.5) + game.speed * 0.16);
        p.vy = rnd(5.5, 9.2);
        p.vz = rnd(-2, 3) - game.speed * 0.22;
        p.spinVx = rnd(9, 15);
        p.spinVz = side * rnd(7, 12);
        p.rotX = 0;
        p.rotZ = 0;
        p.y = 0.2;

        spawnLooseItems(p.m.position.x, 0.6, p.m.position.z, 2);
        spawnComicWord(p.m.position.x, 2.0, p.m.position.z);
        game.speed *= 0.88;
        if (game.time > pedWarnT) {
          pedWarnT = game.time + 3.0;
          emit("pedScared");
        }
        continue;
      } else {
        // Slow-speed leap aside
        const safeSide = (p.x >= bx ? 1 : -1);
        p.x = bx + safeSide * (B.hitHalfWidth + 1.35);
        p.targetX = safeSide * (S.half + 1.2);
        p.scared = true;
        p.state = "impatient";
        game.speed *= 0.9;
        if (game.time > pedWarnT) {
          pedWarnT = game.time + 3.2;
          emit("pedScared");
        }
      }
    }

    // Oncoming bus scare detection
    if (!p.scared && onBusRoad(p.seg) && a > 0 && a < PED.scareDist && Math.abs(p.x - bx) < PED.scareWidth && game.speed > 4) {
      p.scared = true;
      const safeSide = (p.x >= bx ? 1 : -1);
      p.targetX = safeSide * (S.half + 1.2);
    }

    // Move towards targetX across road
    const dx = p.targetX - p.x;
    if (Math.abs(dx) > 0.12) {
      p.state = p.scared ? "chase" : "walk";
      const spd = p.scared ? PED.dodgeSpeed : PED.walkSpeed;
      p.x += Math.sign(dx) * Math.min(Math.abs(dx), spd * dt);
    } else {
      p.state = p.angry ? (Math.random() < 0.4 ? "punch" : "impatient") : "calm";
    }

    animatePerson(p.m, p.state, p.animTime, dt);
    const faceYaw = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
    place(p.m, p.seg, p.s, p.x, 0, faceYaw);
  }

  game.warn = warn;
  // Gentle pulse (2 Hz) instead of hard flashing.
  beaconMat.opacity = .55 + .45 * Math.sin(game.time * Math.PI * 2 * W.pulseHz);
  dangerRingMat.opacity = .45 + .35 * Math.sin(game.time * Math.PI * 2 * W.pulseHz);
}

// Horn: light vehicles just ahead in the bus's lane move one lane aside, and pedestrians jump back to the pavement.
export function eachTraffic(fn) {
  for (const o of objs) {
    if (!o.hit) {
      const kind = o.t.heavy ? "heavy" : o.t.isRamp ? "ramp" : o.t.hazard ? "trench" : o.t.name;
      fn(kind, o.m.position.x, o.m.position.y, o.m.position.z, o.m.rotation.y);
    }
  }
}

on("horn", () => {
  const bx = game.lat;
  for (const o of objs) {
    if (o.hit || o.isStatic || o.t.heavy || !onBusRoad(o.seg)) continue;
    const a = -o.z;
    if (a > 0 && a < CFG.horn.reach && Math.abs(o.x - bx) < B.hitHalfWidth + o.t.w / 2 + .5) {
      const lanes = lanesOf(o.seg, T.lanes);
      o.targetX = clamp(o.x >= bx ? o.x + T.laneWidth : o.x - T.laneWidth, lanes[0], lanes[lanes.length - 1]);
    }
  }
  for (const p of peds) {
    if (!onBusRoad(p.seg)) continue;
    const a = ahead(p.seg, p.s);
    if (a > 0 && a < CFG.horn.reach + 10) {
      p.scared = true;
      const safeSide = (p.x >= bx ? 1 : -1);
      p.targetX = safeSide * (SEGS[p.seg].half + 1.2);
    }
  }
});
