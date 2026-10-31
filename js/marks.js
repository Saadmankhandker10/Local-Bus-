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
import { SEGS, here, ahead, walk, place, sample } from "./map.js";
import { PROCESSION_EVENTS } from "./data/events.js";

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
  g.font = "bold 120px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif"; g.fillText(icon, c.width / 2, c.height * .38);
  g.font = "bold 60px 'Kalpurush', 'Noto Sans Bengali', sans-serif"; g.fillText(text, c.width / 2, c.height * .58);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
const stopGeo = new THREE.PlaneGeometry(3.6, 16).rotateX(-Math.PI / 2);
const cngMat = new THREE.MeshLambertMaterial({ map: markTexture("#ffd600", stripes, "সিএনজি", "⛽") });
const policeMat = new THREE.MeshLambertMaterial({ map: markTexture("#ff6fb5", dots, "পুলিশ", "👮") });
const stopMat = new THREE.MeshLambertMaterial({ map: markTexture("#0288d1", dots, "যাত্রী স্টপ", "🚏") });

/** Double-sided floating 3D overhead billboard hovering at 4m above the street. */
function makeFloatingSign(icon, title, sub, bg, borderCol, fg = "#ffffff") {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  // Outer dark contrast backing
  g.fillStyle = "rgba(12, 16, 20, 0.95)";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = bg;
  g.fillRect(10, 10, c.width - 20, c.height - 20);
  g.lineWidth = 14;
  g.strokeStyle = borderCol;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);

  // Large Emoji Icon
  g.font = "bold 96px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(icon, c.width / 2, c.height * 0.38);

  // Bengali Title in Kalpurush font
  g.font = "bold 46px 'Kalpurush', 'Noto Sans Bengali', sans-serif";
  g.fillStyle = fg;
  g.fillText(title, c.width / 2, c.height * 0.73);

  if (sub) {
    g.font = "bold 22px 'Kalpurush', sans-serif";
    g.fillStyle = fg === "#111" ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.85)";
    g.fillText(sub, c.width / 2, c.height * 0.90);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4), mat);
}

function makeCngMark(side) {
  const g = new THREE.Group();
  const decal = new THREE.Mesh(markGeo, cngMat); decal.position.y = .03; g.add(decal);
  const px = side * (M.width / 2 + .8);
  g.add(box(.9, 2, .7, 0xeeeeee, px, 1, 0));       // pump
  g.add(box(.95, .5, .75, 0x2e7d32, px, 1.6, 0));  // pump top band

  // High-visibility floating overhead billboard + amber beacon
  const poleH = 4.2;
  g.add(box(.14, poleH, .14, 0x37474f, px, poleH / 2, -.4));
  const badge = makeFloatingSign("⛽", "সিএনজি / তেল", "CNG · FUEL PUMP", "#ffd600", "#111111", "#111111");
  badge.position.set(px, 4.1, -.4);
  g.add(badge);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.25, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffd600 }));
  beacon.position.set(px, 4.95, -.4);
  g.add(beacon);

  g.userData = { badge, baseY: 4.1 };
  return g;
}

function makePoliceMark(side) {
  const g = new THREE.Group();
  const decal = new THREE.Mesh(markGeo, policeMat); decal.position.y = .03; g.add(decal);
  const px = side * (M.width / 2 + .8);
  const sergeant = person(0xf5f5f5, 0, 0x1a237e); sergeant.position.set(px, 0, 0); g.add(sergeant);

  // High-visibility floating police shield billboard + dual flashing emergency strobes
  const poleH = 4.2;
  g.add(box(.14, poleH, .14, 0x37474f, px + side * .5, poleH / 2, 0));
  const badge = makeFloatingSign("👮", "পুলিশ চেকপোস্ট", "POLICE CHECKPOST", "#1a237e", "#ff1744", "#ffffff");
  badge.position.set(px + side * .5, 4.1, 0);
  g.add(badge);

  const redStrobe = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff1744 }));
  redStrobe.position.set(px + side * .5 - .28, 4.95, 0);
  g.add(redStrobe);
  const blueStrobe = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
  blueStrobe.position.set(px + side * .5 + .28, 4.95, 0);
  g.add(blueStrobe);

  g.userData = { badge, baseY: 4.1, strobes: { red: redStrobe, blue: blueStrobe } };
  return g;
}

function makeStop(side) {
  const g = new THREE.Group(), people = [];
  const decal = new THREE.Mesh(stopGeo, stopMat); decal.position.y = .03; g.add(decal);

  // High-visibility passenger stop billboard + cyan beacon
  const poleX = side * 2.3;
  const poleH = 4.2;
  g.add(box(.14, poleH, .14, 0x37474f, poleX, poleH / 2, -7));
  const badge = makeFloatingSign("🚏", "যাত্রী স্টপ", "PASSENGERS", "#0288d1", "#ffffff", "#ffffff");
  badge.position.set(poleX, 4.1, -7);
  g.add(badge);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.25, 10, 10), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
  beacon.position.set(poleX, 4.95, -7);
  g.add(beacon);

  for (let i = 0; i < S.people; i++) {
    const p = person(pick([0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0xffffff]));
    p.position.set(side * 1.5, 0, rnd(-6, 6)); g.add(p); people.push(p);
  }
  g.userData = { badge, baseY: 4.1 };
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

let publicRallies = null;
function getPublicRallies() {
  if (publicRallies) return publicRallies;
  publicRallies = [];
  const pt = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };
  for (const ev of PROCESSION_EVENTS) {
    const segIdx = SEGS.findIndex(s => s.id === ev.segId);
    if (segIdx >= 0) {
      const S = SEGS[segIdx];
      sample(segIdx, ev.barricadeAt * S.len, pt);
      publicRallies.push({ id: ev.id, name: ev.name, x: pt.x, z: pt.z, seg: segIdx, s: ev.barricadeAt * S.len });
    }
  }
  return publicRallies;
}

/** Call fn(kind, worldX, worldZ, label) for every stop, mark, and public rally (for minimap & bigmap). */
export function eachMark(fn) {
  for (const o of stops) fn("stop", o.m.position.x, o.m.position.z, "যাত্রী স্টপ");
  for (const o of marks) fn(o.kind, o.m.position.x, o.m.position.z, o.kind === "cng" ? "সিএনজি / তেল" : "পুলিশ চেকপোস্ট");
  const rallies = getPublicRallies();
  for (const r of rallies) fn("public", r.x, r.z, r.name);
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
    if (s.m.userData && s.m.userData.badge) {
      s.m.userData.badge.position.y = s.m.userData.baseY + Math.sin(game.time * 3.2 + (s.s || 0) * 0.1) * 0.22;
    }
    const atStop = s.onRoad && Math.abs(bx - s.x) < S.reachX && Math.abs(s.z) < S.reachZ;
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
    if (k.m.userData) {
      if (k.m.userData.badge) {
        k.m.userData.badge.position.y = k.m.userData.baseY + Math.sin(game.time * 3.2 + (k.s || 0) * 0.1) * 0.22;
      }
      if (k.m.userData.strobes) {
        const flash = Math.floor(game.time * 9) % 2 === 0;
        k.m.userData.strobes.red.material.color.setHex(flash ? 0xff1744 : 0x220000);
        k.m.userData.strobes.blue.material.color.setHex(flash ? 0x001122 : 0x00e5ff);
      }
    }
    // "On the mark" means the bus centre is over it, with some room at both ends.
    const on = k.onRoad && Math.abs(bx - k.x) < M.reachX && Math.abs(k.z) < M.length / 2 - 1;
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
