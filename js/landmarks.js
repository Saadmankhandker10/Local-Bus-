// Stylised Dhaka landmarks and roadside scenery, placed along the route from route.js.
// They are simple low-poly shapes "in the style of" the real places, not copies.
import * as THREE from "three";
import { CFG } from "./config.js";
import { ROUTE, STAGE_START } from "./route.js";
import { rnd, pick } from "./utils.js";
import { scene, box, plate } from "./world.js";
import { makeVehicle } from "./vehicles.js";
import { game } from "./state.js";
import { ahead, place, fromProgress } from "./map.js";

const R = CFG.world.roadHalfWidth, J = CFG.journey;

/* ====== Shared shapes ====== */
const leafMat = new THREE.MeshLambertMaterial({ color: 0x4f8f3a });
const darkLeafMat = new THREE.MeshLambertMaterial({ color: 0x3b6e2c });
const crownGeo = new THREE.IcosahedronGeometry(1, 0);    // low-poly ball for tree tops
const domeGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); // half sphere
const discGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
const waterMat = new THREE.MeshLambertMaterial({ color: 0x4f8fb8 });
const lakeGeo = new THREE.BoxGeometry(30, .1, 40);
const creamMat = new THREE.MeshLambertMaterial({ color: 0xf3e5c8 }), brickMat = new THREE.MeshLambertMaterial({ color: 0xb5543c });
const tscWallMat = new THREE.MeshLambertMaterial({ color: 0xe0d6c2 }), tscRoofMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
const statueMat = new THREE.MeshLambertMaterial({ color: 0x9e9e9e });
// Roadside signs turn partly towards the oncoming bus so they can be read while driving.
const FACE = Math.PI / 2 * .65;
const BRICK = 0xb5543c, CREAM = 0xf3e5c8, STONE = 0xd8cfc0, DARK = 0x37474f, POLE = 0x555555;

function mesh(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  return m;
}

// Signs are canvas textures, which are slow to make, so each text is drawn only once.
const signCache = new Map();
function sign(text, w, h, bg = "#fff8e1", fg = "#b71c1c") {
  const key = `${text}|${w}|${h}|${bg}|${fg}`;
  if (!signCache.has(key)) signCache.set(key, plate(text, w, h, bg, fg));
  return signCache.get(key).clone();
}

/** An overhead gantry across the whole road with a sign in the middle. */
function gantry(text, bg, fg, h = 7.5) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(box(.5, h, .5, POLE, s * (R + 1.2), h / 2, 0));
  g.add(box(2 * R + 3, .4, .4, POLE, 0, h, 0));
  const p = sign(text, 9, 1.4, bg, fg); p.position.set(0, h + .2, .25); g.add(p);
  return g;
}

/* ====== Prefabs: each returns a Group placed at the road position (x is set inside) ====== */
const PREFABS = {
  stageGate: ({ text }) => gantry(text, "#1b5e20", "#ffeb3b"),

  busStand: ({ side }) => {
    const g = new THREE.Group(), x = side * (R + 9);
    g.add(box(12, .3, 34, 0x8d6e63, x, 5.5, 0));                       // shed roof
    for (const z of [-15, -5, 5, 15]) for (const dx of [-5.5, 5.5]) g.add(box(.3, 5.5, .3, POLE, x + dx, 2.75, z));
    for (const z of [-9, 0, 9]) {                                       // parked buses
      const b = makeVehicle(pick(CFG.traffic.types.filter(t => t.name === "bus")));
      b.rotation.y = Math.PI / 2; b.position.set(x, 0, z); g.add(b);
    }
    const p = sign("মোহাম্মদপুর বাসস্ট্যান্ড", 10, 1.3, "#0d47a1", "#fff"); p.position.set(x - side * 6.1, 6.6, 0);
    p.rotation.y = -side * FACE; g.add(p);
    return g;
  },

  wires: () => {
    // Dhaka's famous tangle: a few sagging lines at slightly different heights.
    const g = new THREE.Group();
    for (const s of [-1, 1]) g.add(box(.25, 9, .25, 0x6d5c4b, s * (R + 1.5), 4.5, 0));
    for (let i = 0; i < 5; i++) {
      const w = box(2 * R + 3, .05, .05, 0x1a1a1a, 0, 7.6 + i * .25, rnd(-.3, .3));
      w.rotation.z = rnd(-.04, .04); g.add(w);
    }
    return g;
  },

  teaShop: ({ side }) => {
    const g = new THREE.Group(), x = side * (R + 3.5);
    g.add(box(3, 2.6, 4, 0xa1887f, x, 1.3, 0));
    g.add(box(3.6, .15, 4.6, pick([0xe53935, 0x1e88e5, 0x43a047]), x - side * .4, 2.7, 0)); // awning
    g.add(box(.6, .5, 3, 0x6d4c41, x - side * 2.2, .25, 0));                                 // bench
    const p = sign("চা-নাস্তা", 2.4, .6); p.position.set(x - side * 1.55, 2.2, 0); p.rotation.y = -side * FACE; g.add(p);
    return g;
  },

  gateArch: ({ text }) => {
    const g = new THREE.Group();
    for (const s of [-1, 1]) { g.add(box(1.6, 9, 1.6, CREAM, s * (R + 1.5), 4.5, 0)); g.add(box(2, .6, 2, BRICK, s * (R + 1.5), 9.2, 0)); }
    g.add(box(2 * R + 5, 1.2, 1.4, CREAM, 0, 9.4, 0));
    const p = sign(text, 6, 1, "#f3e5c8", "#4e342e"); p.position.set(0, 9.4, .72); g.add(p);
    return g;
  },

  lake: ({ side }) => {
    const g = new THREE.Group();
    g.add(mesh(lakeGeo, waterMat, side * (R + 17), -.04, 0));     // water
    g.add(box(.1, .9, 40, 0xeeeeee, side * (R + 2.2), .45, 0));                              // railing
    for (const z of [-15, 0, 15]) g.add(box(.15, 1, .15, 0xeeeeee, side * (R + 2.2), .5, z));
    return g;
  },

  tree: ({ side }) => {
    const g = new THREE.Group(), x = side * rnd(R + 2.5, R + 4);
    g.add(box(.35, 3, .35, 0x6d4c41, x, 1.5, 0));
    g.add(mesh(crownGeo, leafMat, x, 3.8, 0, rnd(1.3, 1.8), rnd(1.2, 1.6), rnd(1.3, 1.8)));
    return g;
  },

  coachingBanner: ({ side }) => {
    const g = new THREE.Group(), x = side * (R + 3);
    const text = pick(["মেধাবী কোচিং — ভর্তি চলছে!", "এ-প্লাস কোচিং সেন্টার", "সাফল্য একাডেমি", "স্বপ্ন কোচিং — ব্যাচ শুরু"]);
    for (const dz of [-2, 2]) g.add(box(.2, 5, .2, POLE, x, 2.5, dz));
    const p = sign(text, 5, 1.4, "#fff", "#1a237e"); p.position.set(x, 4.2, 0); p.rotation.y = -side * FACE; g.add(p);
    return g;
  },

  shopRow: ({ side }) => {
    const g = new THREE.Group(), x = side * (R + 6), h = rnd(5, 9), c = pick([0xffcc80, 0xef9a9a, 0xce93d8, 0x80cbc4, 0xfff59d, 0xbcaaa4]);
    g.add(box(7, h, 26, c, x, h / 2, 0));
    g.add(box(1.2, .15, 24, pick([0xe53935, 0x1e88e5, 0x43a047, 0xffb300]), x - side * 4, 3, 0)); // awning
    const text = pick(["বই ঘর", "জুতার দোকান", "কাপড় বিতান", "মোবাইল সার্ভিসিং", "ঈদ কালেকশন", "চশমা ঘর", "ইলেকট্রনিক্স"]);
    const p = sign(text, 8, 1.2, pick(["#fff59d", "#ffffff", "#ffe0b2"]), "#b71c1c");
    p.position.set(x - side * 3.55, 4, 0); p.rotation.y = -side * FACE; g.add(p);
    return g;
  },

  marketSign: ({ text }) => gantry(text, "#e65100", "#fff"),

  museum: ({ side }) => {
    const g = new THREE.Group(), x = side * (R + 14);
    g.add(box(14, 1.2, 34, STONE, x, .6, 0));                    // steps
    g.add(box(12, 9, 30, CREAM, x + side, 5, 0));                // hall
    for (let z = -13; z <= 13; z += 3.25) g.add(box(.9, 8, .9, 0xffffff, x - side * 5.5, 5, z)); // columns
    g.add(box(13, 1.2, 32, STONE, x, 9.8, 0));                   // roof
    const p = sign("জাদুঘর", 6, 1.2, "#f3e5c8", "#3e2723"); p.position.set(x - side * 6.6, 8.5, 0); p.rotation.y = -side * FACE; g.add(p);
    return g;
  },

  library: ({ side }) => {
    const g = new THREE.Group(), x = side * (R + 13);
    g.add(box(12, 12, 30, 0xbfae99, x, 6, 0));
    for (let y = 2.5; y < 11; y += 3) g.add(box(.1, 1.5, 26, 0x546e7a, x - side * 6.05, y, 0)); // window bands
    const p = sign("গ্রন্থাগার", 6, 1.2, "#f3e5c8", "#3e2723"); p.position.set(x - side * 6.1, 11, 0); p.rotation.y = -side * FACE; g.add(p);
    return g;
  },

  crossing: ({ text }) => {
    const g = gantry(text, "#1b5e20", "#fff", 8);
    for (const s of [-1, 1]) g.add(box(40, .1, 12, 0x3a3a3a, s * (R + 22), -.04, -8)); // side roads
    for (let x = -R + 1; x < R; x += 1.4) g.add(box(.7, .03, 4, 0xffffff, x, .03, -16));  // zebra crossing
    for (const s of [-1, 1]) {                                                           // signals
      g.add(box(.25, 4.5, .25, POLE, s * (R + .8), 2.25, -18));
      g.add(box(.6, 1.6, .4, 0x212121, s * (R + .8), 4.6, -18));
      for (const [y, c] of [[5.1, 0xff1744], [4.6, 0xffc400], [4.1, 0x00e676]]) g.add(box(.35, .35, .1, c, s * (R + .8), y, -17.78));
    }
    return g;
  },

  flowerStalls: ({ side }) => {
    const g = new THREE.Group(), x = side * (R + 3);
    g.add(box(1.4, .8, 3, 0x8d6e63, x, .4, 0));
    for (let i = 0; i < 6; i++) g.add(box(.35, .35, .35, pick([0xff1744, 0xffeb3b, 0xff80ab, 0xffffff, 0xff9100]), x + rnd(-.4, .4), .95, rnd(-1.2, 1.2)));
    return g;
  },

  banyan: ({ side }) => {
    // Wide, low banyan trees with a thick trunk and hanging roots.
    const g = new THREE.Group(), x = side * rnd(R + 4, R + 7);
    g.add(box(1, 4, 1, 0x5d4037, x, 2, 0));
    for (const dz of [-1.5, 1.5]) g.add(box(.12, 3, .12, 0x6d4c41, x + rnd(-1, 1), 2.2, dz));
    g.add(mesh(crownGeo, darkLeafMat, x, 5, 0, 4.5, 1.8, 4.5));
    return g;
  },

  curzonHall: ({ side }) => {
    // Red-brick hall with white arches and a dome on top.
    const g = new THREE.Group(), x = side * (R + 15);
    g.add(box(12, 10, 40, BRICK, x, 5, 0));
    for (let z = -17; z <= 17; z += 4.25) {
      g.add(box(.2, 3.4, 2.4, CREAM, x - side * 6.05, 2.4, z));  // arch frame
      g.add(box(.25, 2.8, 1.8, 0x3e2723, x - side * 6.1, 2.2, z)); // dark opening
      g.add(box(.2, 2.4, 1.4, CREAM, x - side * 6.05, 6.6, z));  // upper windows
    }
    g.add(box(13, .6, 41, CREAM, x, 10.2, 0));                     // white cornice
    g.add(mesh(domeGeo, creamMat, x, 10.5, 0, 4, 4, 4));
    for (const z of [-18, 18]) g.add(mesh(domeGeo, brickMat, x - side * 4, 10.5, z, 1.6, 2, 1.6));
    return g;
  },

  tsc: ({ side }) => {
    // A round, low hall with a wide roof and an open plaza in front.
    const g = new THREE.Group(), x = side * (R + 11);
    g.add(mesh(discGeo, tscWallMat, x, 2.5, 0, 6, 5, 6));
    g.add(box(4, .1, 14, STONE, x - side * 7.5, .02, 0)); // plaza
    g.add(mesh(discGeo, tscRoofMat, x, 5.3, 0, 7.5, .6, 7.5));
    const p = sign("টিএসসি", 5, 1.1, "#ffffff", "#1b5e20"); p.position.set(x - side * 6.2, 6.4, 0); p.rotation.y = -side * FACE; g.add(p);
    return g;
  },

  monument: ({ side }) => {
    // Students standing together on a pedestal, arms raised: in the spirit of campus monuments.
    const g = new THREE.Group(), x = side * (R + 5);
    g.add(box(4, 1.6, 4, STONE, x, .8, 0));
    const fig = statueMat;
    for (let i = 0; i < 4; i++) {
      const fz = -1.2 + i * .8, fx = x + (i % 2 ? .3 : -.3);
      g.add(mesh(discGeo, fig, fx, 3, fz, .3, 2.6, .3));
      g.add(mesh(crownGeo, fig, fx, 4.6, fz, .32, .32, .32));
      if (i === 1 || i === 2) g.add(box(.15, 1.4, .15, 0x9e9e9e, fx, 5.2, fz)); // raised arm
    }
    return g;
  },

  finishBanner: ({ text }) => gantry(text, "#b71c1c", "#ffeb3b", 8),
};

// These stretch across the road, so they get one placement and no side.
const ACROSS = new Set(["stageGate", "wires", "gateArch", "marketSign", "crossing", "finishBanner"]);

/* ====== Placements along the route ====== */
const placements = [];   // { at, prefab, side, text } sorted by distance
for (const [i, st] of ROUTE.stages.entries()) {
  const start = STAGE_START[i];
  if (i > 0) placements.push({ at: start, prefab: "stageGate", side: 0, text: `স্বাগতম — ${st.name}` });
  for (const lm of st.landmarks) {
    const sides = ACROSS.has(lm.prefab) ? [0] : lm.side ? [lm.side] : [-1, 1];
    const spots = lm.at !== undefined ? [lm.at]
      : Array.from({ length: Math.floor((lm.to - lm.from) * st.length / lm.every) + 1 }, (_, k) => lm.from + k * lm.every / st.length);
    for (const f of spots) for (const side of sides) {
      // Repeated things get a little jitter so they don't look like a fence.
      const jitter = lm.every ? rnd(-.3, .3) * lm.every : 0;
      placements.push({ at: start + f * st.length + jitter, prefab: lm.prefab, side, text: lm.text });
    }
  }
}
placements.sort((a, b) => a.at - b.at);
// Each landmark sits on the main road at its journey progress.
for (const p of placements) fromProgress(p.at, p);

const active = [];  // { m, p }
let next = 0;       // index of the next placement to spawn

/** Clear all landmarks and continue from this journey progress (start or checkpoint). */
export function resetLandmarks(fromProg) {
  for (const a of active) scene.remove(a.m);
  active.length = 0;
  next = placements.findIndex(p => p.at >= fromProg - J.despawnBehind);
  if (next < 0) next = placements.length;
}

/** Build landmarks coming into view and remove the ones left behind. */
export function updateLandmarks() {
  while (next < placements.length && placements[next].at <= game.prog + J.spawnAhead) {
    const p = placements[next++];
    const m = PREFABS[p.prefab](p);
    // Prefabs are built facing "forward = -z, right = +x", which place() turns to follow the road.
    place(m, p.seg, p.s, 0);
    scene.add(m);
    active.push({ m, p });
  }
  for (let i = active.length - 1; i >= 0; i--) {
    const a = ahead(active[i].p.seg, active[i].p.s);
    if (!(a > -J.despawnBehind)) { scene.remove(active[i].m); active.splice(i, 1); }
  }
}
