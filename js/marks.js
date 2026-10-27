// Things placed on the road for the player to use: yellow bus stops with
// waiting passengers, and blue fuel drums.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";
import { scene, box } from "./world.js";
import { bus } from "./bus.js";
import { game } from "./state.js";
import { msg } from "./hud.js";

const S = CFG.stops, D = CFG.drums;
const SPAWN_Z = CFG.traffic.spawnZ;

const stops = [], drums = [];
let nextStop = S.first, nextDrum = D.first; // distance where the next one appears
let boardT = 0;    // seconds until the next passenger can board
let slowWarn = 0;  // time when the "slow down" warning may show again

/** A simple waiting passenger: body cylinder plus head. */
function mkPerson() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: pick([0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0xffffff]) }));
  b.position.y = .55;
  const h = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 8), new THREE.MeshLambertMaterial({ color: 0xc68642 }));
  h.position.y = 1.3;
  g.add(b, h);
  return g;
}

/** Remove all stops and drums and restart their distance counters. */
export function resetMarks() {
  for (const o of [...stops, ...drums]) scene.remove(o.m);
  stops.length = drums.length = 0;
  nextStop = S.first;
  nextDrum = D.first;
}

function spawnStop() {
  nextStop = game.dist + rnd(S.gapMin, S.gapMax);
  const side = Math.random() < .5 ? -1 : 1, m = new THREE.Group(), people = [];
  m.add(box(3.6, .04, 16, 0xffd600, 0, .03, 0));                  // yellow road mark
  m.add(box(.15, 3, .15, 0x555555, side * 2.3, 1.5, -7));          // sign pole
  m.add(box(1.2, .8, .1, 0xd32f2f, side * 2.3, 3.1, -7));          // sign board
  for (let i = 0; i < S.people; i++) { const p = mkPerson(); p.position.set(side * 1.5, 0, rnd(-6, 6)); m.add(p); people.push(p); }
  m.position.set(side * S.sideX, 0, SPAWN_Z); scene.add(m);
  stops.push({ m, x: side * S.sideX, z: SPAWN_Z, people });
}

function spawnDrum() {
  nextDrum = game.dist + rnd(D.gapMin, D.gapMax);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 1.3, 12), new THREE.MeshLambertMaterial({ color: 0x1e88e5 }));
  const x = rnd(-D.rangeX, D.rangeX); m.position.set(x, .8, SPAWN_Z); scene.add(m);
  drums.push({ m, x, z: SPAWN_Z });
}

/** Spawn, scroll, and check pickups for stops and drums. d = distance the bus moved. */
export function updateMarks(dt, d) {
  if (game.dist >= nextStop) spawnStop();
  if (game.dist >= nextDrum) spawnDrum();

  for (let i = stops.length - 1; i >= 0; i--) {
    const s = stops[i];
    s.z += d; s.m.position.z = s.z;
    const atStop = Math.abs(bus.position.x - s.x) < S.reachX && Math.abs(s.z) < S.reachZ;
    if (atStop && s.people.length) {
      if (game.speed < S.boardMaxSpeed) {
        // Passengers board one by one while the bus waits at the stop.
        boardT -= dt;
        if (boardT <= 0) {
          boardT = S.boardInterval;
          s.m.remove(s.people.pop());
          game.pass = Math.min(CFG.fare.maxPassengers, game.pass + 1);
          game.fare += CFG.fare.perPassenger;
          msg(`যাত্রী উঠছে! +৳${CFG.fare.perPassenger}`, 500);
        }
      } else if (game.time > slowWarn) { slowWarn = game.time + S.slowWarnCooldown; msg("আস্তে! বাস থামান", 800); }
    }
    if (s.z > S.despawnBehind) { scene.remove(s.m); stops.splice(i, 1); }
  }

  for (let i = drums.length - 1; i >= 0; i--) {
    const f = drums[i];
    f.z += d; f.m.position.z = f.z; f.m.rotation.y += dt * D.spin;
    if (Math.abs(f.x - bus.position.x) < D.reachX && Math.abs(f.z) < D.reachZ) {
      game.fuel = Math.min(CFG.fuel.max, game.fuel + D.drumAmount);
      msg("তেল ভরা হলো! ⛽", 900);
      scene.remove(f.m); drums.splice(i, 1); continue;
    }
    if (f.z > D.despawnBehind) { scene.remove(f.m); drums.splice(i, 1); }
  }
}
