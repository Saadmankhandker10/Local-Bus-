// Things on the road for the player to use:
//   bus stops      (light blue, passengers wait)  -> slow down to pick them up
//   CNG stations   (yellow, striped, pump)        -> stop on the mark to refuel
//   police marks   (pink, dotted, sergeant)       -> stop and pay to clear the chasing crowd
// Each mark has its own colour AND pattern AND icon/text, so colour-blind players can tell them apart.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";
import { scene, box, plate, person } from "./world.js";

import { game } from "./state.js";
import { emit } from "./events.js";
import { crowd } from "./crowd.js";
import { msg } from "./hud.js";
import { line, say } from "./speech.js";
import { currentStage } from "./journey.js";
import { SEGS, here, ahead, walk, place } from "./map.js";

const S = CFG.stops, M = CFG.marks, AHEAD = CFG.traffic.spawnAhead;
const spot = { seg: 0, s: 0 }; // reused spawn position
/** Marks are painted on the main road (a side street or flyover gets none). */
const mainFirst = list => list[0];

const stops = [], marks = [];
let nextStop, nextCng, nextPolice; // distance where the next one appears
let boardT = 0;    // seconds until the next passenger can board
let hintT = 0;     // time when the next hint message may show

/* ====== Models (textures are drawn once and shared) ====== */

/** Draw a road-mark texture: background, a pattern along the edges, and big text in the middle. */
function markTexture(bg, pattern, text, icon) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 1024; // same shape as the mark (3.6 wide, 14 long)
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  pattern(g, c.width, c.height);
  g.fillStyle = "#111"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "bold 120px sans-serif"; g.fillText(icon, c.width / 2, c.height * .38);
  g.font = "bold 58px 'Noto Sans Bengali', sans-serif"; g.fillText(text, c.width / 2, c.height * .58);
  return new THREE.CanvasTexture(c);
}
const stripes = (g, w, h) => { // black hazard stripes down both edges
  g.fillStyle = "#111";
  for (let y = -40; y < h; y += 80) for (const x0 of [0, w - 40]) {
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 40, y + 40); g.lineTo(x0 + 40, y + 80); g.lineTo(x0, y + 40); g.fill();
  }
};
const dots = (g, w, h) => { // white circles down both edges
  g.fillStyle = "#fff";
  for (let y = 40; y < h; y += 80) for (const x of [28, w - 28]) { g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill(); }
};

const markGeo = new THREE.PlaneGeometry(M.width, M.length).rotateX(-Math.PI / 2);
const cngMat = new THREE.MeshLambertMaterial({ map: markTexture("#ffd600", stripes, "সিএনজি", "⛽") });
const policeMat = new THREE.MeshLambertMaterial({ map: markTexture("#ff6fb5", dots, "পুলিশ", "👮") });
const stopSign = plate("বাস স্টপ", 1.4, .5, "#1565c0", "#fff");
const cngSign = plate("সিএনজি", 1.4, .5, "#ffd600", "#111");


function makeCngMark(side) {
  const g = new THREE.Group();
  const decal = new THREE.Mesh(markGeo, cngMat); decal.position.y = .03; g.add(decal);
  const px = side * (M.width / 2 + .8);
  g.add(box(.9, 2, .7, 0xeeeeee, px, 1, 0));       // pump
  g.add(box(.95, .5, .75, 0x2e7d32, px, 1.6, 0));  // pump top band
  const s = cngSign.clone(); s.position.set(px, 2.6, .4); g.add(s);
  return g;
}

function makePoliceMark(side) {
  const g = new THREE.Group();
  const decal = new THREE.Mesh(markGeo, policeMat); decal.position.y = .03; g.add(decal);
  const px = side * (M.width / 2 + .8);
  const sergeant = person(0xf5f5f5, 0, 0x1a237e); sergeant.position.set(px, 0, 0); g.add(sergeant);
  g.add(box(.08, 1.6, .08, 0x555555, px + side * .5, .8, 0));   // stop-sign pole
  g.add(box(.6, .6, .06, 0xd32f2f, px + side * .5, 1.7, .05));  // stop sign
  return g;
}

function makeStop(side) {
  const g = new THREE.Group(), people = [];
  g.add(box(3.6, .04, 16, 0x90caf9, 0, .03, 0));               // light blue road mark
  g.add(box(.15, 3, .15, 0x555555, side * 2.3, 1.5, -7));       // sign pole
  const s = stopSign.clone(); s.position.set(side * 2.3, 3.1, -6.9); g.add(s);
  for (let i = 0; i < S.people; i++) {
    const p = person(pick([0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0xffffff]));
    p.position.set(side * 1.5, 0, rnd(-6, 6)); g.add(p); people.push(p);
  }
  return { g, people };
}

/* ====== Spawning ====== */

/** Remove all stops and marks and restart their distance counters from this distance. */
export function resetMarks(fromDist = 0) {
  for (const o of [...stops, ...marks]) scene.remove(o.m);
  stops.length = marks.length = 0;
  nextStop = fromDist + S.first;
  nextCng = fromDist + CFG.cng.first;
  nextPolice = fromDist + CFG.police.first;
}

/** Distance to the next stop / CNG / police mark: the stage can set its own range in route.js. */
function gap(kind, min, max) {
  const r = currentStage().marks?.[kind];
  return r ? rnd(r[0], r[1]) : rnd(min, max);
}

/** Find the spawn spot ahead on the road. @returns {boolean} false if it's not a good place now */
function findSpot() {
  walk(here.seg, here.s, AHEAD, mainFirst, spot);
  if (SEGS[spot.seg].kind === "flyover" || ahead(spot.seg, spot.s) < AHEAD * .5) return false;
  // Is another stop or mark already near that spot?
  return ![...stops, ...marks].some(o => o.seg === spot.seg && Math.abs(o.s - spot.s) < M.length + 6);
}

function spawnMark(kind) {
  const side = pick([-1, 1]);
  const m = kind === "cng" ? makeCngMark(side) : makePoliceMark(side);
  const x = side * (SEGS[spot.seg].half - M.edgeInset);
  scene.add(m);
  marks.push({ m, kind, seg: spot.seg, s: spot.s, x, z: 0, payT: 0, done: false });
}

function spawn() {
  if (game.dist >= nextStop) {
    if (!findSpot()) nextStop += 20;
    else {
      nextStop = game.dist + gap("stops", S.gapMin, S.gapMax);
      const side = pick([-1, 1]), { g, people } = makeStop(side);
      scene.add(g);
      stops.push({ m: g, seg: spot.seg, s: spot.s, x: side * (SEGS[spot.seg].half - S.edgeInset), z: 0, people });
    }
  }
  if (game.dist >= nextCng) {
    if (!findSpot()) nextCng += 20;
    else { nextCng = game.dist + gap("cng", CFG.cng.gapMin, CFG.cng.gapMax); spawnMark("cng"); }
  }
  if (game.dist >= nextPolice) {
    if (!findSpot()) nextPolice += 20;
    else { nextPolice = game.dist + gap("police", CFG.police.gapMin, CFG.police.gapMax); spawnMark("police"); }
  }
}

/** Work out where a stop/mark is relative to the bus and move its 3D model. @returns {boolean} still useful */
function track(o) {
  o.z = -ahead(o.seg, o.s);
  if (Number.isNaN(o.z) || o.z > M.despawnBehind) return false;
  place(o.m, o.seg, o.s, o.x);
  // Only marks on the bus's own road count (not the road next to a side street).
  o.onRoad = o.seg === here.seg || o.seg === here.prev || SEGS[here.seg].next.includes(o.seg);
  return true;
}

/** Call fn(kind, worldX, worldZ) for every stop and mark (for the minimap). */
export function eachMark(fn) {
  for (const o of stops) fn("stop", o.m.position.x, o.m.position.z);
  for (const o of marks) fn(o.kind, o.m.position.x, o.m.position.z);
}

/** Distance ahead (in world units) and side (-1 left, +1 right) of the nearest upcoming CNG mark, or null. */
export function nearestCng() {
  let best = null;
  for (const k of marks) {
    if (k.kind !== "cng" || !k.onRoad) continue;
    const d = -k.z;
    if (d > -4 && (!best || d < best.d)) best = { d: Math.max(0, d), side: Math.sign(k.x) };
  }
  return best;
}

/** Show a hint now and then (not every frame). */
function hint(text) {
  if (game.time < hintT) return;
  hintT = game.time + S.slowWarnCooldown;
  msg(text, 900);
}

/* ====== Update ====== */

/** Spawn, move, and handle the bus standing on stops and marks. */
export function updateMarks(dt) {
  spawn();
  const bx = game.lat;
  game.onMark = "";

  for (let i = stops.length - 1; i >= 0; i--) {
    const s = stops[i];
    if (!track(s)) { scene.remove(s.m); stops.splice(i, 1); continue; }
    const atStop = Math.hypot(game.x - s.m.position.x, game.z - s.m.position.z) < 5.2;
    if (atStop && s.people.length) {
      if (game.speed < S.boardMaxSpeed) {
        game.onMark = "stop";
        // Passengers board one by one while the bus waits at the stop.
        boardT -= dt;
        if (boardT <= 0) {
          boardT = S.boardInterval;
          s.m.remove(s.people.pop());
          game.pass = Math.min(CFG.fare.maxPassengers, game.pass + 1);
          game.fare += CFG.fare.perPassenger;
          msg(`যাত্রী উঠছে! +৳${CFG.fare.perPassenger}`, 500);
          emit("board");
        }
      } else hint("আস্তে! বাস থামান, যাত্রী উঠবে");
    }
  }

  for (let i = marks.length - 1; i >= 0; i--) {
    const k = marks[i];
    if (!track(k)) { scene.remove(k.m); marks.splice(i, 1); continue; }
    // "On the mark" means the bus centre is over it, with some room at both ends.
    const on = Math.hypot(game.x - k.m.position.x, game.z - k.m.position.z) < 4.8;
    const stopped = game.speed < M.stopSpeed;

    if (on && k.kind === "cng") {
      if (stopped) {
        if (game.onMark !== "cng" && game.fuel < CFG.fuel.max) emit("refuel");
        game.onMark = "cng";
        game.fuel = Math.min(CFG.fuel.max, game.fuel + CFG.cng.refuelRate * dt);
        hint(game.fuel < CFG.fuel.max ? "সিএনজি ভরা হচ্ছে… ⛽" : "ট্যাংক ফুল! চলেন ওস্তাদ");
      } else if (game.fuel < CFG.fuel.max * .9) hint("থামুন! সিএনজি নিন ⛽");
    }

    if (on && k.kind === "police" && !k.done) {
      if (stopped) {
        game.onMark = "police";
        k.payT += dt;
        if (k.payT >= CFG.police.payTime) {
          k.done = true;
          if (crowd.active) {
            const fine = CFG.police.fineBase + CFG.police.finePerPerson * crowd.size;
            game.fare = Math.max(0, game.fare - fine);
            say("সার্জেন্ট", line("sergeantClosed"));
            msg(`কেস ক্লোজ! জরিমানা ৳${fine} 👮`, 1500);
            emit("fineClosed", { fine });
          } else say("সার্জেন্ট", line("sergeantNothing"));
        }
      } else if (crowd.active) hint("থামুন! জরিমানা দিয়ে কেস ক্লোজ করুন 👮");
    }

  }
}
