// 3D models for everything on the road except the player's bus.
// All models face -z (the way traffic drives), so the camera sees their backs.
import * as THREE from "three";
import { CFG } from "./config.js";
import { pick } from "./utils.js";
import { box, plate, person, UNIT } from "./world.js";
import {
  createTruckArtTex,
  createRickshawHoodTex,
  createRickshawFilmTex,
  createDangerRingTex
} from "./textures.js";
import { createLEDMaterial, createLEDRowGeometry } from "./shaders.js";

// Shared materials: one copy on the GPU, used by many meshes.
const DARK = 0x263238, TYRE = 0x111111;
/** Red warning light on top of heavy things. Shared, so every beacon pulses together. */
export const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.9 });
/** Ground danger warning ring under heavy trucks & buses with Additive Blending and PolygonOffset. */
export const dangerRingMat = new THREE.MeshBasicMaterial({
  map: createDangerRingTex(),
  transparent: true,
  opacity: 0.75,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2.0,
  polygonOffsetUnits: -4.0,
});
dangerRingMat.userData = { isShared: true };
const beaconGeo = new THREE.SphereGeometry(.35, 10, 8);
const vipBadge = plate("▲ ভিআইপি গাড়ি", 2.2, .48, "#4a148c", "#ffd54f");
const policeSign = plate("পুলিশ · POLICE", 1.5, .34, "#1a237e", "#ffffff");
const rampSign = plate("🚀 ঠেলায় চড়ে উড়েন!", 2.6, .55, "#ffeb3b", "#b71c1c");
const trenchSign = plate("⚠ ওয়াসার কাজ চলছে", 2.4, .52, "#b71c1c", "#ffffff");

const TRUCK_ART_TEXTS = ["দূর হতে ভালোবাসুন", "ধীরে চলুন", "মা-বাবার দোয়া", "আল্লাহ সর্বশক্তিমান"];
const TRUCK_ART_MATS = TRUCK_ART_TEXTS.map(txt => new THREE.MeshBasicMaterial({ map: createTruckArtTex(txt) }));
const rickshawHoodMat = new THREE.MeshLambertMaterial({ map: createRickshawHoodTex() });
const rickshawFilmMat = new THREE.MeshBasicMaterial({
  map: createRickshawFilmTex(),
  transparent: true,
  opacity: 0.82,
  side: THREE.DoubleSide
});

const policeLightbarMat = createLEDMaterial({ police: true, speed: 11.0, gain: 2.8 });
policeLightbarMat.userData = { isShared: true };
const policeLightbarGeo = createLEDRowGeometry(8, 0.76, 0.14, [
  0xff1744, 0xff1744, 0xff1744, 0xff1744,
  0x00b0ff, 0x00b0ff, 0x00b0ff, 0x00b0ff
]);
policeLightbarGeo.userData = { isShared: true };

function addMirrorsAndHazards(g, t, color) {
  const left = box(.22, .14, .18, color, -t.w * .56, t.h * .58, -t.l * .18);
  const right = box(.22, .14, .18, color, t.w * .56, t.h * .58, -t.l * .18);
  const hzL = box(.22, .16, .08, 0xff9800, -t.w * .38, t.h * .36, t.l * .51);
  const hzR = box(.22, .16, .08, 0xff9800, t.w * .38, t.h * .36, t.l * .51);
  hzL.visible = hzR.visible = false;
  g.add(left, right, hzL, hzR);
  g.userData.mirrors = { left, right };
  g.userData.hazards = [hzL, hzR];
}

function car(t, c) {
  const g = new THREE.Group();
  g.add(box(t.w, t.h * .6, t.l, c, 0, t.h * .3 + .3, 0));
  g.add(box(t.w * .85, t.h * .45, t.l * .45, DARK, 0, t.h * .6 + .3 + t.h * .2, -t.l * .12));
  for (const s of [-1, 1]) g.add(box(.25, .5, t.l * .8, TYRE, s * t.w * .5, .3, 0));
  addMirrorsAndHazards(g, t, c);
  return g;
}

function vip(t, c) {
  const g = new THREE.Group();
  g.add(box(t.w, t.h * .62, t.l, c, 0, t.h * .32 + .3, 0));                  // sleek black SUV body
  g.add(box(t.w + .03, .12, t.l + .02, 0xffd54f, 0, .62, 0));                // gold luxury trim stripe
  g.add(box(t.w * .88, t.h * .46, t.l * .55, 0x0d1117, 0, t.h * .85, -.1));  // dark tinted VIP cabin
  for (const s of [-1, 1]) g.add(box(.28, .55, t.l * .82, TYRE, s * t.w * .5, .32, 0));
  // Front hood flagpole + miniature flag
  g.add(box(.05, .65, .05, 0xffd54f, -t.w * .38, t.h * .75, -t.l * .45));
  g.add(box(.28, .18, .04, 0x1f6b3a, -t.w * .38 + .14, t.h * .98, -t.l * .45));
  // Floating overhead VIP marker
  const badge = vipBadge.clone();
  badge.position.set(0, t.h + 1.15, 0);
  g.add(badge);
  g.userData.vipBadge = badge;
  addMirrorsAndHazards(g, t, 0xffd54f);
  return g;
}

function policeCar(t) {
  const g = new THREE.Group();
  g.add(box(t.w, t.h * .58, t.l, 0xffffff, 0, t.h * .3 + .3, 0));            // white body
  g.add(box(t.w + .02, .28, t.l + .02, 0x1a237e, 0, .58, 0));                // navy police stripe
  g.add(box(t.w * .86, t.h * .45, t.l * .48, DARK, 0, t.h * .82, -.1));      // cabin
  for (const s of [-1, 1]) g.add(box(.26, .52, t.l * .8, TYRE, s * t.w * .5, .3, 0));

  // Asynchronous GPU LED strobe lightbar (Red left 4 bulbs, Blue right 4 bulbs)
  const lightbar = new THREE.Mesh(policeLightbarGeo, policeLightbarMat);
  lightbar.position.set(0, t.h + .22, -.1);
  g.add(lightbar);

  const sign = policeSign.clone();
  sign.position.set(0, .82, t.l * .51);
  g.add(sign);
  addMirrorsAndHazards(g, t, 0x1a237e);
  return g;
}

function rickshaw(t, c) {
  const g = new THREE.Group();
  g.add(box(t.w, .25, t.l * .9, 0x5d4037, 0, .6, 0));             // frame
  g.add(box(t.w, .7, .9, c, 0, 1.1, t.l * .25));                  // painted seat back
  const hood = new THREE.Mesh(UNIT, rickshawHoodMat);
  hood.scale.set(t.w * 1.05, .9, 1.1);
  hood.position.set(0, 1.75, t.l * .2);
  hood.castShadow = true; hood.receiveShadow = true;
  g.add(hood);                                                     // floral folk art hood

  const film = new THREE.Mesh(new THREE.PlaneGeometry(t.w * 1.02, .75), rickshawFilmMat);
  film.position.set(0, 1.75, t.l * .2 - .56);
  g.add(film);                                                     // translucent rain vinyl cover

  for (const s of [-1, 1]) g.add(box(.08, .9, .9, TYRE, s * t.w * .5, .45, t.l * .25)); // back wheels
  g.add(box(.08, .7, .7, TYRE, 0, .35, -t.l * .4));               // front wheel
  g.add(person(pick([0xffffff, 0x8d6e63, 0x1e88e5]), .6, null, true).translateZ(-t.l * .3)); // puller with lungi/gamchha
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
  // Painted Folk Dhaka Truck Art plate on the rear tailgate
  const artMesh = new THREE.Mesh(new THREE.PlaneGeometry(t.w * .92, t.h * .55), pick(TRUCK_ART_MATS));
  artMesh.position.set(0, t.h * .55, t.l * .5 + 0.02);
  g.add(artMesh);
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

const BUILDERS = { car, vip, policeCar, rickshaw, bike, truck, bus: rivalBus };

/** Build a traffic vehicle. Heavy ones get a red warning beacon and ground danger ring. */
export function makeVehicle(t) {
  const g = BUILDERS[t.shape](t, pick(t.colors));
  if (t.heavy) {
    const b = new THREE.Mesh(beaconGeo, beaconMat);
    b.position.set(0, t.h + .5, t.l * .4);
    b.visible = false;
    g.add(b);
    g.userData.beacon = b;

    // Ground danger warning ring under heavy vehicle (truck/bus)
    const ringGeo = new THREE.PlaneGeometry(t.w * 2.2, t.l * 1.3);
    ringGeo.rotateX(-Math.PI / 2);
    const dangerRing = new THREE.Mesh(ringGeo, dangerRingMat);
    dangerRing.position.y = 0.04;
    dangerRing.visible = false;
    g.add(dangerRing);
    g.userData.dangerRing = dangerRing;
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

/** Painted folk / rickshaw-art mural textures for flyover and metro pillars (made once, shared). */
const PILLAR_ART_GEO = new THREE.BoxGeometry(CFG.pillar.w + .04, 3.2, CFG.pillar.l + .04);
const PILLAR_ART_MATS = [
  ["#1f6b3a", "#ffc21a", "#b8322a"],
  ["#1f5fae", "#ffc21a", "#f6efdd"],
  ["#b8322a", "#35e0c2", "#ffc21a"],
].map(([bg, c1, c2]) => {
  const c = document.createElement("canvas");
  c.width = 192; c.height = 320;
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 192, 320);
  // Top and bottom scalloped borders
  g.fillStyle = c1; g.fillRect(0, 0, 192, 22); g.fillRect(0, 298, 192, 22);
  g.strokeStyle = c2; g.lineWidth = 8; g.strokeRect(14, 32, 164, 256);
  // Folk arch and central diamond / lotus motif
  g.fillStyle = c2;
  g.beginPath(); g.arc(96, 115, 52, Math.PI, 0); g.fill();
  g.fillStyle = c1;
  g.beginPath();
  g.moveTo(96, 90); g.lineTo(148, 165); g.lineTo(96, 240); g.lineTo(44, 165);
  g.closePath(); g.fill();
  g.fillStyle = "#f6efdd";
  g.beginPath(); g.arc(96, 165, 22, 0, Math.PI * 2); g.fill();
  return new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) });
});

/** One flyover / metro pillar with rickshaw-art mural paint and its cap beam above. */
export function makePillar() {
  const P = CFG.pillar;
  const g = new THREE.Group();
  g.add(box(P.w, P.deckY, P.l, 0xb0a99f, 0, P.deckY / 2, 0));               // concrete shaft
  g.add(box(P.w + .06, .4, P.l + .06, 0xffc21a, 0, .2, 0));                  // yellow hazard base
  const art = new THREE.Mesh(PILLAR_ART_GEO, pick(PILLAR_ART_MATS));
  art.position.y = 2.05;
  g.add(art);                                                                // painted folk mural collar
  g.add(box(P.deckWidth * .8, .6, P.l * 1.6, 0xa1998f, 0, P.deckY - .3, 0)); // cap beam

  const b = new THREE.Mesh(beaconGeo, beaconMat);
  b.position.set(0, 2.2, P.l / 2 + .2);
  b.visible = false;
  g.add(b);
  g.userData.beacon = b;
  return g;
}

const manholeGeo = new THREE.CylinderGeometry(.68, .68, .06, 14);
const manholeMat = new THREE.MeshLambertMaterial({ color: 0x0d0d0d });
const lidMat = new THREE.MeshLambertMaterial({ color: 0x616161 });

/** Open manhole on the road with its concrete cover pushed aside and a red bamboo warning stick. */
export function makeManhole() {
  const g = new THREE.Group();
  const hole = new THREE.Mesh(manholeGeo, manholeMat);
  hole.position.y = .03;
  const lid = new THREE.Mesh(manholeGeo, lidMat);
  lid.position.set(.85, .06, .35);
  g.add(hole, lid);
  g.add(box(.08, 1.3, .08, 0x8d6e63, -.45, .65, 0)); // bamboo stick stuck in hole
  g.add(box(.38, .28, .05, 0xd32f2f, -.3, 1.2, 0));   // red cloth danger flag
  return g;
}

/** WASA / City Corporation road digging trench surrounded by bamboo barricades and dirt mounds. */
export function makeTrench() {
  const g = new THREE.Group();
  g.add(box(2.6, .08, 4.8, 0x14110f, 0, .03, 0));     // dark excavated pit
  g.add(box(2.2, .45, 1.4, 0x5d4037, 0, .22, -1.6));  // heaped earth mound
  // Bamboo barricade posts and rails around the pit
  for (const x of [-1.35, 1.35]) for (const z of [-2.4, 0, 2.4]) {
    g.add(box(.1, 1.2, .1, 0x8d6e63, x, .6, z));
  }
  for (const z of [-2.4, 2.4]) {
    g.add(box(2.8, .1, .1, 0xd4a359, 0, .95, z));
    g.add(box(2.8, .1, .1, 0xb71c1c, 0, .55, z));
  }
  const s = trenchSign.clone();
  s.position.set(0, 1.45, 2.45);
  g.add(s);
  return g;
}

/** Wooden stunt ramp ("ঠেলায় চড়ে উড়েন!") that launches the bus into the air! */
export function makeRamp() {
  const g = new THREE.Group();
  const deck = new THREE.Group();
  deck.rotation.x = 0.22; // inclined upward towards -z (forward)
  deck.add(box(3.2, .18, 6.2, 0x8d6e63, 0, .65, 0));          // wooden plank deck
  deck.add(box(3.26, .06, 6.22, 0xffc21a, 0, .75, 0));        // yellow chevron paint
  for (const s of [-1, 1]) {
    deck.add(box(.18, .32, 6.2, 0xb71c1c, s * 1.55, .82, 0)); // red side rails
  }
  g.add(deck);
  // Support trestles under the high(-z) end of the ramp
  for (const s of [-1.3, 0, 1.3]) {
    g.add(box(.22, 1.3, .22, 0x5d4037, s, .65, -2.5));
  }
  const sign = rampSign.clone();
  sign.position.set(0, 1.85, -2.7);
  g.add(sign);
  return g;
}
