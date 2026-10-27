// 3D models for everything on the road except the player's bus.
// All models face -z (the way traffic drives), so the camera sees their backs.
import * as THREE from "three";
import { CFG } from "./config.js";
import { pick } from "./utils.js";
import { box, plate, person } from "./world.js";

// Shared materials: one copy on the GPU, used by many meshes.
const DARK = 0x263238, TYRE = 0x111111;
/** Red warning light on top of heavy things. Shared, so every beacon pulses together. */
export const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.9 });
const beaconGeo = new THREE.SphereGeometry(.35, 10, 8);


function car(t, c) {
  const g = new THREE.Group();
  g.add(box(t.w, t.h * .6, t.l, c, 0, t.h * .3 + .3, 0));
  g.add(box(t.w * .85, t.h * .45, t.l * .45, DARK, 0, t.h * .6 + .3 + t.h * .2, -t.l * .12));
  for (const s of [-1, 1]) g.add(box(.25, .5, t.l * .8, TYRE, s * t.w * .5, .3, 0));
  return g;
}

function rickshaw(t, c) {
  const g = new THREE.Group();
  g.add(box(t.w, .25, t.l * .9, 0x5d4037, 0, .6, 0));             // frame
  g.add(box(t.w, .7, .9, c, 0, 1.1, t.l * .25));                  // painted seat back
  g.add(box(t.w * 1.05, .9, 1.1, c, 0, 1.75, t.l * .2));          // folding hood
  for (const s of [-1, 1]) g.add(box(.08, .9, .9, TYRE, s * t.w * .5, .45, t.l * .25)); // back wheels
  g.add(box(.08, .7, .7, TYRE, 0, .35, -t.l * .4));               // front wheel
  g.add(person(pick([0xffffff, 0x8d6e63, 0x1e88e5]), .6).translateZ(-t.l * .3)); // puller
  return g;
}

function bike(t, c) {
  const g = new THREE.Group();
  g.add(box(.35, .5, t.l * .8, c, 0, .6, 0));
  for (const z of [-1, 1]) g.add(box(.12, .6, .6, TYRE, 0, .3, z * t.l * .38));
  g.add(person(pick([0x37474f, 0x1565c0, 0x6d4c41]), .7));
  g.add(box(.5, .3, .5, 0xffeb3b, 0, 1.95, 0)); // helmet
  return g;
}

function truck(t, c) {
  const g = new THREE.Group();
  g.add(box(t.w, t.h * .9, t.l * .7, c, 0, t.h * .55, t.l * .15));          // cargo
  g.add(box(t.w * .95, t.h * .7, t.l * .25, 0xfdd835, 0, t.h * .45, -t.l * .37)); // cab
  for (const s of [-1, 1]) g.add(box(.3, .7, t.l * .85, TYRE, s * t.w * .5, .35, 0));
  return g;
}

function rivalBus(t, c) {
  const g = new THREE.Group();
  g.add(box(t.w, t.h * .8, t.l, c, 0, t.h * .55, 0));
  g.add(box(t.w + .02, .4, t.l + .02, 0xfafafa, 0, t.h * .35, 0));   // stripe
  g.add(box(t.w + .04, t.h * .28, t.l * .8, DARK, 0, t.h * .8, 0)); // windows
  for (const s of [-1, 1]) g.add(box(.3, .7, t.l * .8, TYRE, s * t.w * .5, .35, 0));
  return g;
}

const BUILDERS = { car, rickshaw, bike, truck, bus: rivalBus };

/** Build a traffic vehicle. Heavy ones get a (hidden) red warning beacon on top. */
export function makeVehicle(t) {
  const g = BUILDERS[t.shape](t, pick(t.colors));
  if (t.heavy) {
    const b = new THREE.Mesh(beaconGeo, beaconMat);
    b.position.set(0, t.h + .5, t.l * .4);
    b.visible = false;
    g.add(b);
    g.userData.beacon = b;
  }
  return g;
}

// Stall signs are drawn once and shared, because canvas textures are expensive to make.
const STALL_SIGNS = ["চা-বিস্কুট", "ফলের দোকান", "ডাব", "ফুচকা"].map(text => plate(text, 1.4, .45, "#fff8e1", "#c62828"));

/** A roadside stall made of loose parts, so it can break apart when hit. */
export function makeStall() {
  const S = CFG.stall, c = pick(S.colors);
  const g = new THREE.Group();
  g.add(box(S.w, .8, S.l, 0x8d6e63, 0, .4, 0));                 // table
  g.add(box(S.w + .3, .1, S.l + .3, c, 0, S.h, 0));              // roof tarp
  for (const z of [-1, 1]) g.add(box(.08, S.h, .08, 0x5d4037, 0, S.h / 2, z * S.l * .45)); // poles
  for (let i = 0; i < 3; i++) g.add(box(.3, .3, .3, pick([0xffeb3b, 0x8bc34a, 0xff7043]), 0, .95, (i - 1) * .6)); // goods
  const sign = pick(STALL_SIGNS).clone();
  sign.position.set(0, S.h - .3, S.l / 2 + .16);
  g.add(sign);
  return g;
}

/** One flyover pillar with its piece of the deck above. */
export function makePillar() {
  const P = CFG.pillar;
  const g = new THREE.Group();
  g.add(box(P.w, P.deckY, P.l, 0xb0a99f, 0, P.deckY / 2, 0));               // pillar
  g.add(box(P.deckWidth * .8, .6, P.l * 1.6, 0xa1998f, 0, P.deckY - .3, 0)); // cap beam

  const b = new THREE.Mesh(beaconGeo, beaconMat);
  b.position.set(0, 2.2, P.l / 2 + .2);
  b.visible = false;
  g.add(b);
  g.userData.beacon = b;
  return g;
}
