// Everything on the road the bus can touch: traffic, roadside stalls, and flyover pillars.
// Handles spawning, simple driving AI, collisions, launches, and heavy-hazard warnings.
//
// Every object lives on a road piece: `seg` (which piece), `s` (how far along it) and
// `x` (how far right of the centre line). `z` is worked out each step: the distance
// from the bus along the road (negative = ahead), so the old collision rules still work.
import { CFG } from "./config.js";
import { rnd, pick, clamp } from "./utils.js";
import { scene, person } from "./world.js";
import { game } from "./state.js";
import { emit, on } from "./events.js";
import { sweptHit, sideGap } from "./physics.js";
import { makeVehicle, makeStall, makePillar, beaconMat } from "./vehicles.js";
import { currentStage } from "./journey.js";
import { SEGS, here, ahead, walk, place, lanesOf } from "./map.js";

const T = CFG.traffic, B = CFG.bus, I = CFG.impact, W = CFG.warning, J = CFG.jam, PED = CFG.pedestrians;
const LIGHT = T.types.filter(t => !t.heavy);
const jamSeg = SEGS.findIndex(s => s.id === J.segId);
let jamHornT = 0, demoWarnT = 0, pedWarnT = 0;

const objs = [];      // everything currently on the road
const peds = [];      // crossing pedestrians (never crashable; they dodge or jump back onto the pavement)
let spawnTimer = 0;   // seconds until the next vehicle tries to spawn
let nextStall = 0;    // odometer distance where the next stall appears
let nextPed = 0;      // odometer distance where the next crossing pedestrian appears
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
/**Remove everything and restart all spawn counters from this odometer distance. */
export function resetTraffic(fromDist = 0) {
  for (const o of objs) scene.remove(o.m);
  for (const p of peds) scene.remove(p.m);
  objs.length = 0;
  peds.length = 0;
  spawnTimer = T.firstSpawnDelay;
  nextStall = fromDist + rnd(CFG.stall.gapMin, CFG.stall.gapMax);
  nextPed = fromDist + rnd(PED.gapMin, PED.gapMax);
  jamHornT = demoWarnT = pedWarnT = 0;
  pillarsDone.clear();
}

/** Add an object to the road. `static` things (stalls, pillars) stay fixed to the ground. */
function add(t, m, seg, s, x, isStatic) {
  scene.add(m);
  const o = {
    t, m, seg, s, x, y: 0, z: 0,
    v: isStatic ? 0 : t.v * rnd(.9, 1.1), // own forward speed
    targetX: x, isStatic,
    hit: false,
    vx: 0, vy: 0, spin: 0, rot: 0,        // used after being launched
    ph: rnd(0, 6),                        // wobble phase, so they don't all sway together
  };
  o.z = -ahead(seg, s);
  objs.push(o);
  place(m, seg, s, x);
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
        scared: false, ph: rnd(0, 6),
      });
      place(m, spot.seg, spot.s, startX);
    }
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
  const t = o.t, lanes = lanesOf(o.seg, T.lanes);
  const lmin = lanes[0], lmax = lanes[lanes.length - 1];
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
  // Shahbagh student demonstration jam: traffic slows to a crawl and merges into the open left lane.
  if (o.seg === jamSeg) {
    const S = SEGS[jamSeg], f = o.s / S.len, barS = S.len * J.barricadeAt;
    if (f >= J.from && f <= J.to) {
      targetV = Math.min(targetV, J.maxTrafficSpeed);
      if (o.s < barS + J.barricadeHalfLen && o.targetX > J.barricadeMinX - t.w / 2 - .3) {
        o.targetX = lmin;
        if (o.s > barS - J.barricadeHalfLen - 4 && o.x > J.barricadeMinX - .4) targetV = 0;
      }
    }
  }
  o.targetX = clamp(o.targetX, lmin, lmax); // a narrower road ahead squeezes everyone in
  o.v += (targetV - o.v) * ease(T.speedResponse, dt);
  o.x += (o.targetX - o.x) * ease(T.laneResponse, dt);
  if (t.wobble) o.x += Math.sin(game.time * t.wobbleFreq + o.ph) * t.wobble * dt;
}

/** Launch a light object away from the bus. Lighter things fly further. */
function launch(o) {
  const closing = Math.max(0, game.speed - o.v);
  const share = I.busMass / (I.busMass + o.t.mass); // close to 1 for a rickshaw, smaller for a car
  const side = o.x >= game.lat ? 1 : -1;
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
  o.rot += o.spin * dt;
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

/** Move along the road; at the end of a piece, carry on to the next one. @returns false if it left the map */
function advance(o, dt) {
  o.s += o.v * dt;
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

  // Shahbagh student demonstration barricade: solid, non-crashable moving roadblock + traffic jam horns.
  if (here.seg === jamSeg && !game.crashing && !game.caught) {
    const S = SEGS[jamSeg], f = here.s / S.len, barS = S.len * J.barricadeAt;
    if (f >= J.from && f <= J.to && game.time > jamHornT) {
      jamHornT = game.time + J.hornInterval * rnd(.7, 1.3);
      emit("jamHorn");
    }
    const halfSpan = J.barricadeHalfLen + B.hitHalfLength;
    if (Math.abs(here.s - barS) < halfSpan && game.lat + B.hitHalfWidth > J.barricadeMinX) {
      if (here.s < barS - J.barricadeHalfLen + 1.5 && game.lat + B.hitHalfWidth > J.barricadeMinX + .35) {
        game.speed = 0;
        game.boostT = 0;
        here.s = Math.min(here.s, barS - halfSpan + .2);
        game.lat -= 2.2 * dt; // gently guide the nose towards the open left lane
      } else {
        game.lat = Math.min(game.lat, J.barricadeMinX - B.hitHalfWidth);
      }
      if (game.time > demoWarnT) {
        demoWarnT = game.time + 3.5;
        emit("demoBlocked");
      }
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
      scene.remove(o.m); objs.splice(i, 1);
      continue;
    }

    if (!o.hit && !game.crashing && !game.caught && onBusRoad(o.seg)) {
      if (sweptHit(bx, B.hitHalfWidth, o.x, t.w / 2, zPrev, o.z, B.hitHalfLength + t.l / 2)) {
        if (!t.heavy) {
          launch(o);
          game.invulnT = CFG.hit.invulnTime;
          emit("crash", { type: t.name, damage: t.damage });
        // Right after a light crash the bus may be shoved into something big: forgive that.
        } else if (game.invulnT <= 0) emit("heavyHit", { type: t.name });
      }

      // Heavy thing ahead and in our path? Light its beacon and warn the HUD.
      if (t.heavy) {
        const closing = game.speed - o.v;
        const warnDist = Math.max(W.minDist, closing * W.time);
        const aheadGap = -o.z - B.hitHalfLength - t.l / 2;
        const inPath = sideGap(bx, B.hitHalfWidth, o.x, t.w / 2) < W.sideMargin;
        const danger = aheadGap > -t.l && aheadGap < warnDist && inPath && closing > 0;
        o.m.userData.beacon.visible = danger;
        warn = warn || danger;
      }
    }

    place(o.m, o.seg, o.s, o.x, o.y, o.rot);
  }

  // Update crossing pedestrians: walk across, hesitate/jump back when the bus approaches, never crashable.
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i], S = SEGS[p.seg], a = ahead(p.seg, p.s);
    if (Number.isNaN(a) || a < -T.despawnBehind || a > -T.despawnAhead) {
      scene.remove(p.m); peds.splice(i, 1);
      continue;
    }
    if (!p.scared && onBusRoad(p.seg) && a > 0 && a < PED.scareDist && Math.abs(p.x - bx) < PED.scareWidth && game.speed > 4) {
      p.scared = true;
      // Scramble to whichever pavement side is safer away from the bus.
      const safeSide = (p.x >= bx ? 1 : -1);
      p.targetX = safeSide * (S.half + 1.2);
    }
    if (onBusRoad(p.seg) && a > -2 && a < 6 && Math.abs(p.x - bx) < B.hitHalfWidth + .75) {
      // Last-moment leap aside so a pedestrian is never hit, while the driver taps the brakes.
      const safeSide = (p.x >= bx ? 1 : -1);
      p.x = bx + safeSide * (B.hitHalfWidth + 1.35);
      p.targetX = safeSide * (S.half + 1.2);
      p.scared = true;
      game.speed *= 0.9;
      if (game.time > pedWarnT) {
        pedWarnT = game.time + 3.2;
        emit("pedScared");
      }
    }
    const spd = p.scared ? PED.dodgeSpeed : PED.walkSpeed;
    const dx = p.targetX - p.x;
    if (Math.abs(dx) > .08) p.x += Math.sign(dx) * Math.min(Math.abs(dx), spd * dt);
    const bob = Math.abs(dx) > .1 ? Math.abs(Math.sin(game.time * (p.scared ? 14 : 7) + p.ph)) * .16 : 0;
    const faceYaw = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
    place(p.m, p.seg, p.s, p.x, bob, faceYaw);
  }

  game.warn = warn;
  // Gentle pulse (2 Hz) instead of hard flashing.
  beaconMat.opacity = .55 + .45 * Math.sin(game.time * Math.PI * 2 * W.pulseHz);
}

// Horn: light vehicles just ahead in the bus's lane move one lane aside, and pedestrians jump back to the pavement.
export function eachTraffic(fn) {
  for (const o of objs) {
    if (!o.hit) fn(o.t.heavy ? "heavy" : o.t.name, o.m.position.x, o.m.position.y, o.m.position.z, o.m.rotation.y);
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
