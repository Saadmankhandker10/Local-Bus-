// 3D models for everything on the road except the player's bus.
// All models face -z (the way traffic drives), so the camera sees their backs.
import * as THREE from "three";
import { CFG } from "./config.js";
import { pick, rnd } from "./utils.js";
import { box, plate, person, lambert, UNIT } from "./world.js";
import {
  createTruckArtTex,
  createRickshawHoodTex,
  createRickshawFilmTex,
  createDangerRingTex
} from "./textures.js";
import { createLEDMaterial, createLEDRowGeometry } from "./shaders.js";
import { isBusModelReady, instantiateBusModel, BUS_OPERATORS } from "./busModel.js";

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
beaconGeo.userData = { isShared: true };
const vipBadge = plate("▲ ভিআইপি গাড়ি", 2.2, .48, "#4a148c", "#ffd54f");
vipBadge.userData = { isShared: true };
const policeSign = plate("পুলিশ · POLICE", 1.5, .34, "#1a237e", "#ffffff");
policeSign.userData = { isShared: true };
const rampSign = plate("🚀 ঠেলায় চড়ে উড়েন!", 2.6, .55, "#ffeb3b", "#b71c1c");
rampSign.userData = { isShared: true };
const trenchSign = plate("⚠ ওয়াসার কাজ চলছে", 2.4, .52, "#b71c1c", "#ffffff");
trenchSign.userData = { isShared: true };

const TRUCK_ART_TEXTS = ["দূর হতে ভালোবাসুন", "ধীরে চলুন", "মা-বাবার দোয়া", "আল্লাহ সর্বশক্তিমান"];
const TRUCK_ART_MATS = TRUCK_ART_TEXTS.map(txt => {
  const m = new THREE.MeshBasicMaterial({ map: createTruckArtTex(txt) });
  m.userData = { isShared: true };
  return m;
});
const rickshawHoodMat = new THREE.MeshLambertMaterial({ map: createRickshawHoodTex() });
rickshawHoodMat.userData = { isShared: true };
const rickshawFilmMat = new THREE.MeshBasicMaterial({
  map: createRickshawFilmTex(),
  transparent: true,
  opacity: 0.82,
  side: THREE.DoubleSide
});
rickshawFilmMat.userData = { isShared: true };

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
  if (isBusModelReady()) {
    const operator = pick(BUS_OPERATORS);
    const busInst = instantiateBusModel({ operator, scale: 0.85 });
    if (busInst) {
      const g = busInst.root;
      g.userData.busController = busInst;
      g.userData.operator = operator;
      addMirrorsAndHazards(g, t, operator.bodyTint);
      return g;
    }
  }
  const g = new THREE.Group();
  g.add(box(t.w, t.h * .8, t.l, c, 0, t.h * .55, 0));
  g.add(box(t.w + .02, .4, t.l + .02, 0xfafafa, 0, t.h * .35, 0));   // stripe
  g.add(box(t.w + .04, t.h * .28, t.l * .8, DARK, 0, t.h * .8, 0)); // windows
  for (const s of [-1, 1]) g.add(box(.3, .7, t.l * .8, TYRE, s * t.w * .5, .35, 0));
  addMirrorsAndHazards(g, t, c);
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
const STALL_SIGNS = [
  "চা-বিস্কুট", "ফলের দোকান", "ডাব", "ফুচকা",
  "তাজা ইলিশ", "পদ্মার মাছ", "ফলের ঠেলা", "টাটকা আম-কলা"
].map(text => plate(text, 1.4, .45, "#fff8e1", "#c62828"));

const thelaWheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.07, 10).rotateZ(Math.PI / 2);
thelaWheelGeo.userData = { isShared: true };
const thelaWheelMat = new THREE.MeshLambertMaterial({ color: 0x4e342e });
thelaWheelMat.userData = { isShared: true };

/** A 4-wheel wooden Dhaka pushcart (Thelagadi) piled with watermelons, bananas, and a lungi-wearing hawker. */
export function makeThela() {
  const g = new THREE.Group();
  g.userData.stallType = "thela";

  // 1. Wooden chassis bed & push handles
  const bed = box(1.3, 0.1, 2.2, 0x8d6e63, 0, 0.65, 0);
  const handleL = box(0.06, 0.06, 0.8, 0x5d4037, -0.5, 0.85, -1.3);
  const handleR = box(0.06, 0.06, 0.8, 0x5d4037, 0.5, 0.85, -1.3);
  const railFront = box(1.3, 0.22, 0.06, 0x5d4037, 0, 0.78, 1.07);
  const railL = box(0.06, 0.22, 2.1, 0x5d4037, -0.62, 0.78, 0);
  const railR = box(0.06, 0.22, 2.1, 0x5d4037, 0.62, 0.78, 0);
  g.add(bed, handleL, handleR, railFront, railL, railR);

  // 2. 4 Large Spoked Wooden Wheels
  const wheelPositions = [
    [-0.68, 0.32, 0.65],
    [0.68, 0.32, 0.65],
    [-0.68, 0.32, -0.65],
    [0.68, 0.32, -0.65]
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const w = new THREE.Mesh(thelaWheelGeo, thelaWheelMat);
    w.position.set(wx, wy, wz);
    w.castShadow = true;
    const hub = box(0.12, 0.12, 0.12, 0x212121, wx, wy, wz);
    g.add(w, hub);
  }

  // 3. Piled Fruits: Watermelons, Bananas, Papayas
  const melonMat = lambert(0x1b5e20);
  for (let i = 0; i < 4; i++) {
    const melon = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 8), melonMat);
    melon.position.set(rnd(-0.35, 0.35), 0.85, rnd(-0.5, 0.6));
    melon.scale.set(1.1, 1.0, 1.2);
    melon.castShadow = true;
    g.add(melon);
  }
  const bananaMat = lambert(0xffeb3b);
  for (let i = 0; i < 5; i++) {
    const ban = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.34, 6), bananaMat);
    ban.rotation.set(rnd(-0.4, 0.4), rnd(-1, 1), rnd(0.5, 1.2));
    ban.position.set(rnd(-0.4, 0.4), 0.88, rnd(-0.6, 0.7));
    ban.castShadow = true;
    g.add(ban);
  }
  const papayaMat = lambert(0xff9800);
  for (let i = 0; i < 3; i++) {
    const pap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), papayaMat);
    pap.position.set(rnd(-0.3, 0.3), 0.86, rnd(-0.4, 0.5));
    pap.castShadow = true;
    g.add(pap);
  }

  // 4. Thela-puller (Hawker) behind the cart
  const puller = person(0xffffff, 0, null, true, { outfit: "genji" });
  puller.position.set(0, 0, -1.6);
  puller.rotation.y = 0;
  if (puller.userData.torso) puller.userData.torso.rotation.x = 0.28;
  if (puller.userData.leftArm) puller.userData.leftArm.rotation.x = -Math.PI * 0.45;
  if (puller.userData.rightArm) puller.userData.rightArm.rotation.x = -Math.PI * 0.45;
  g.add(puller);

  // 5. Bengali Sign Plate
  const sign = pick(STALL_SIGNS).clone();
  sign.position.set(0, 0.85, 1.15);
  g.add(sign);

  return g;
}

/** A roadside fish vendor (মাছের দোকান) with bamboo crates, silver Hilsa fish, cutting boti knife, and fishmonger. */
export function makeFishStall() {
  const g = new THREE.Group();
  g.userData.stallType = "fish";

  // 1. Low wooden cutting platform (chowki)
  const platform = box(1.8, 0.42, 1.6, 0x6d4c41, 0, 0.21, 0);
  g.add(platform);

  // 2. Traditional iron boti knife upright on wooden base
  const botiBase = box(0.18, 0.08, 0.60, 0x3e2723, 0.35, 0.46, 0.1);
  const botiBlade = box(0.02, 0.38, 0.12, 0x37474f, 0.35, 0.65, 0.22);
  botiBlade.rotation.x = -0.25;
  g.add(botiBase, botiBlade);

  // 3. Bamboo fish baskets (ডালা)
  const basketGeo = new THREE.CylinderGeometry(0.38, 0.28, 0.18, 10);
  const basketMat = lambert(0x8d6e63);
  const fishMat = lambert(0xcfd8dc);

  for (const bPos of [[-0.45, 0.52, -0.2], [-0.42, 0.52, 0.45]]) {
    const basket = new THREE.Mesh(basketGeo, basketMat);
    basket.position.set(bPos[0], bPos[1], bPos[2]);
    basket.castShadow = true;
    g.add(basket);

    // Silver Hilsa fish inside basket
    for (let f = 0; f < 3; f++) {
      const fish = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 0.38, 7), fishMat);
      fish.rotation.set(Math.PI / 2 + rnd(-0.2, 0.2), rnd(-0.4, 0.4), rnd(-1, 1));
      fish.position.set(bPos[0] + rnd(-0.15, 0.15), bPos[1] + 0.12, bPos[2] + rnd(-0.15, 0.15));
      fish.scale.set(1, 0.4, 1);
      fish.castShadow = true;
      const gills = box(0.02, 0.03, 0.05, 0xd32f2f, fish.position.x, fish.position.y + 0.02, fish.position.z);
      g.add(fish, gills);
    }
  }

  // 4. Blue water bucket
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.32, 8), lambert(0x1976d2));
  bucket.position.set(0.55, 0.58, -0.4);
  bucket.castShadow = true;
  g.add(bucket);

  // 5. Fishmonger sitting in lungi beside the boti
  const monger = person(0x1565c0, 0, null, true, { outfit: "lungi" });
  monger.position.set(0.35, 0, -0.35);
  monger.rotation.y = 0;
  if (monger.userData.torso) monger.userData.torso.rotation.x = 0.15;
  if (monger.userData.leftArm) monger.userData.leftArm.rotation.x = -Math.PI * 0.35;
  if (monger.userData.rightArm) monger.userData.rightArm.rotation.x = -Math.PI * 0.40;
  g.add(monger);

  // 6. Sign plate
  const sign = pick(STALL_SIGNS).clone();
  sign.position.set(0, 0.75, 0.85);
  g.add(sign);

  return g;
}

/** A roadside stall made of loose parts (tea stall, thelagadi pushcart, or fish vendor), so it breaks apart when hit. */
export function makeStall() {
  const r = Math.random();
  if (r < 0.36) {
    return makeThela();
  } else if (r < 0.68) {
    return makeFishStall();
  }
  const S = CFG.stall, c = pick(S.colors);
  const g = new THREE.Group();
  g.userData.stallType = "tea";
  g.add(box(S.w, .8, S.l, 0x8d6e63, 0, .4, 0));                 // table
  g.add(box(S.w + .3, .1, S.l + .3, c, 0, S.h, 0));              // roof tarp
  for (const z of [-1, 1]) g.add(box(.08, S.h, .08, 0x5d4037, 0, S.h / 2, z * S.l * .45)); // poles
  for (let i = 0; i < 3; i++) g.add(box(.3, .3, .3, pick([0xffeb3b, 0x8bc34a, 0xff7043]), 0, .95, (i - 1) * .6)); // goods

  // Aluminum tea kettle
  const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.28, 8), lambert(0xb0bec5));
  kettle.position.set(0.2, 0.94, -0.4);
  g.add(kettle);

  // Stallkeeper in lungi
  const chaiwala = person(pick([0xe53935, 0x1e88e5, 0x43a047]), 0, null, true, { outfit: "lungi" });
  chaiwala.position.set(0, 0, -S.l * 0.5 - 0.3);
  g.add(chaiwala);

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
