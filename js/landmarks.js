// Stylised Dhaka landmarks and roadside scenery, placed along the route from route.js.
// They are simple low-poly shapes "in the style of" the real places, not copies.
import * as THREE from "three";
import { CFG } from "./config.js";
import { ROUTE, STAGE_START } from "./route.js";
import { rnd, pick } from "./utils.js";
import { scene, box, plate } from "./world.js";
import { makeVehicle } from "./vehicles.js";
import { game } from "./state.js";
import { SEGS, ahead, sample, place, fromProgress, hitsAnyRoad } from "./map.js";
import { metroPass } from "./audio.js";
import { BANNERS, CIVIC_BANNERS } from "./data/banners.bn.js";

const R = CFG.world.roadHalfWidth, J = CFG.journey, M = CFG.metro;

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
const flyPillarMat = new THREE.MeshLambertMaterial({ color: 0x8a9296 });
const sunMat = new THREE.MeshLambertMaterial({ color: 0xc62828 });
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
    // Morning crows perched on the shed roof; they lift off when the bus starts moving.
    const crows = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      c.position.set(x - side * 5 + rnd(-2, 2), 5.75, -10 + i * 4);
      c.add(box(.22, .14, .34, 0x1a1a1a, 0, 0, 0));
      c.add(box(.56, .04, .18, 0x263238, 0, .04, 0)); // wings
      c.userData = { baseY: 5.75, vx: -side * rnd(2.5, 4.5), vy: rnd(2.2, 3.8), vz: rnd(-2, 2), ph: i };
      g.add(c);
      crows.push(c);
    }
    g.userData.crows = crows;
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
    const text = pick(["বই ঘর", "জুতার দোকান", "কাপড় বিতান", "মোবাইল সার্ভিসিং", "মবিলে ভাজা সিঙ্গারা", "বাবার দোয়া হার্ডওয়্যার", "মায়ের দোয়া স্টোর", "ভাই ভাই ট্রেডার্স", "বিসমিল্লাহ হোটেল", "বাকি চাহিয়া লজ্জা দিবেন না", "সাময়িক অসুবিধার জন্য দুঃখিত", "ঈদ কালেকশন", "চশমা ঘর"]);
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
    // Shahbagh roadside flower shops: canopy, flower buckets, and marigold garlands.
    const g = new THREE.Group(), x = side * (R + 3.2);
    g.add(box(1.8, .85, 3.4, 0x8d6e63, x, .42, 0));                                      // counter
    g.add(box(2.2, .12, 3.8, pick([0x1f6b3a, 0xb8322a, 0x1f5fae]), x, 2.5, 0));          // awning
    for (const dz of [-1.6, 1.6]) g.add(box(.1, 2.5, .1, POLE, x + side * .7, 1.25, dz));
    for (let i = 0; i < 8; i++) {
      const c = pick([0xff1744, 0xffc21a, 0xff80ab, 0xffffff, 0xff9100]);
      g.add(box(.38, .42, .38, c, x + rnd(-.5, .5), 1.05, rnd(-1.4, 1.4)));              // flower bunches
    }
    // Hanging marigold garlands along the front edge of the awning.
    for (let z = -1.3; z <= 1.3; z += .65) g.add(box(.12, .75, .12, 0xffc21a, x - side * .9, 2.05, z));
    return g;
  },

  footbridge: ({ text }) => {
    // Pedestrian footbridge spanning across the road with stairs on both pavements.
    const g = new THREE.Group(), h = 6.1, span = 2 * R + 5;
    g.add(box(span, .35, 2.2, STONE, 0, h, 0));                                          // walkway deck
    for (const dz of [-1, 1]) g.add(box(span, .85, .1, 0x1f6b3a, 0, h + .55, dz));       // green railings
    for (const s of [-1, 1]) {
      const sx = s * (R + 2.4);
      g.add(box(1.2, h, 1.2, STONE, sx, h / 2, 0));                                      // support tower
      // Stepped stair ramp descending along the pavement.
      for (let k = 0; k < 5; k++) {
        g.add(box(1.4, (k + 1) * (h / 5), 1.4, STONE, sx + s * 1.3, (k + 1) * (h / 10), (k - 2) * 1.35));
      }
    }
    if (text) {
      const p = sign(text, 8.5, 1.1, "#1f5fae", "#fff");
      p.position.set(0, h + 1.25, 1.15);
      g.add(p);
    }
    return g;
  },

  metroStation: ({ text }) => {
    // Elevated Dhaka Metro Rail station (Shahbagh & DU) sitting on the viaduct.
    const g = new THREE.Group(), y = M.deckY, w = M.deckWidth + 5.2, len = 34;
    g.add(box(w, .7, len, STONE, 0, y + .2, 0));                                         // concourse & platform slab
    // Curved green station canopy roof and side screens.
    for (const s of [-1, 1]) {
      g.add(box(1.8, 3.2, len - 2, 0xcfd8dc, s * (w / 2 - .9), y + 1.9, 0));             // outer platform wall
      for (let z = -14; z <= 14; z += 7) {
        g.add(box(.35, 4.2, .35, DARK, s * (w / 2 - .3), y + 2.4, z));                   // canopy ribs
      }
      // Entry stairs descending outside the road to the pavement.
      const sx = s * (R + 4.2);
      g.add(box(2.4, .5, 8, STONE, sx, y - 1.5, 0));
      for (let k = 0; k < 5; k++) {
        const sh = (k + 1) * ((y - 1.5) / 5);
        g.add(box(1.8, sh, 2.2, STONE, sx, sh / 2, -9 + k * 2.1));
      }
      const sideSign = sign(`${text} মেট্রো স্টেশন`, 6.5, 1.1, "#1f6b3a", "#ffc21a");
      sideSign.position.set(s * (w / 2 + .1), y + 2.4, 0);
      sideSign.rotation.y = s * Math.PI / 2;
      g.add(sideSign);
    }
    g.add(box(w + 1.2, .45, len + 1, 0x1f6b3a, 0, y + 4.4, 0));                          // green station roof
    const frontSign = sign(`🚇 ${text} মেট্রো স্টেশন`, 8, 1.2, "#1f6b3a", "#fff");
    frontSign.position.set(0, y + 4.65, len / 2 + .6);
    g.add(frontSign);
    return g;
  },

  junctionFlyover: () => {
    // Cross-road flyover overpass deck spanning perpendicular across the Shahbagh junction.
    const g = new THREE.Group(), y = 5.6, span = 2 * R + 56;
    g.add(box(span, .65, 8.5, 0xbdb5a6, 0, y, 0));                                       // cross deck
    for (const dz of [-4.1, 4.1]) g.add(box(span, .9, .3, 0xd8cfc0, 0, y + .75, dz));    // parapets
    for (const sx of [-R - 22, -R - 8, R + 8, R + 22]) {
      g.add(box(1.6, y, 1.6, 0x9e9e9e, sx, y / 2, 0));                                   // side piers
    }
    return g;
  },

  studentDemo: () => {
    // Shahbagh student demonstration: bamboo barricades, light-hearted campus banners, and chanting students.
    // Occupies the middle and right lanes (x = -2.2 .. +6.2), leaving the far-left lane open with cones.
    const g = new THREE.Group(), minX = CFG.jam.barricadeMinX, maxX = R - .6, cx = (minX + maxX) / 2, w = maxX - minX;
    const students = [];
    // Front and rear bamboo / painted barricade rails.
    for (const z of [-6, 6]) {
      g.add(box(w, .18, .18, 0xffc21a, cx, 1.05, z));
      g.add(box(w, .16, .16, 0xb8322a, cx, .6, z));
      for (let x = minX + .4; x <= maxX - .4; x += 2.6) {
        g.add(box(.16, 1.35, .16, 0x6d4c41, x, .68, z));
      }
    }
    // Main cloth banner stretched across the front of the gathering, facing the oncoming bus (+z).
    for (const dx of [-w / 2 + .6, w / 2 - .6]) g.add(box(.14, 3.6, .14, POLE, cx + dx, 1.8, 5.6));
    const mainBanner = sign(BANNERS[0], 6.8, 1.15, "#b8322a", "#fff8e1");
    mainBanner.position.set(cx, 2.75, 5.7);
    g.add(mainBanner);

    // Diversion arrow sign on the left edge guiding drivers into the narrow open left lane.
    const bypassSign = sign("◄ বাম লেন খোলা", 3.2, .85, "#ffc21a", "#1a1d1f");
    bypassSign.position.set(minX - .2, 1.8, 6.2);
    g.add(bypassSign);
    for (let z = -6.5; z <= 6.5; z += 2.6) {
      g.add(box(.45, .65, .45, 0xff6d00, minX - .35, .33, z)); // orange traffic cones along the open lane
    }

    // Group of students holding colourful placards with campus slogans.
    const shirts = [0x1e88e5, 0xe53935, 0x43a047, 0xfdd835, 0x8e24aa, 0x00897b, 0xff7043];
    for (let i = 0; i < 15; i++) {
      const st = new THREE.Group();
      const sx = minX + .8 + (i % 5) * ((w - 1.6) / 4) + rnd(-.3, .3);
      const sz = -4.2 + Math.floor(i / 5) * 3.8 + rnd(-.4, .4);
      st.position.set(sx, 0, sz);
      st.add(box(.48, .9, .32, shirts[i % shirts.length], 0, .95, 0)); // shirt / kurta
      st.add(box(.42, .55, .28, 0x37474f, 0, .28, 0));                 // trousers
      st.add(mesh(crownGeo, creamMat, 0, 1.62, 0, .24, .24, .24));     // head
      if (i % 2 === 0) {
        const slogan = BANNERS[(i + 1) % BANNERS.length];
        const bg = pick(["#fff8e1", "#ffc21a", "#e8f5e9", "#e3f2fd"]);
        const fg = bg === "#ffc21a" ? "#1a1d1f" : "#b71c1c";
        st.add(box(.08, 1.8, .08, 0x6d4c41, .24, 1.95, 0));            // placard stick
        const placard = sign(slogan, 3.1, .75, bg, fg);
        placard.position.set(.24, 2.75, .06);
        st.add(placard);
      }
      st.userData.phase = i * .7;
      g.add(st);
      students.push(st);
    }
    g.userData.students = students;
    return g;
  },

  civicMichil: () => {
    // Asad Gate civic resident & trader procession: completely blocks the left lane (x = -R .. -0.3).
    // Features red/white bamboo barricades, battery megaphone loudspeaker on tripod, tea stall on pavement,
    // overhead flyover pillar accent, and local residents & shopkeepers in lungis/kurtas holding civic placards.
    const g = new THREE.Group(), minX = -R + .6, maxX = -.3, cx = (minX + maxX) / 2, w = maxX - minX;
    const marchers = [];

    // Overhead Asad Gate flyover concrete pillar accent on the median divider.
    const flyPillar = new THREE.Mesh(discGeo, flyPillarMat);
    flyPillar.scale.set(1.1, 7.5, 1.1);
    flyPillar.position.set(0, 3.75, 0);
    g.add(flyPillar);
    // Overhead flyover horizontal deck spanning across the road high above the scene
    g.add(box(16, 1.3, 8.5, 0x78909c, 0, 8.1, 0));
    for (const s of [-8, 8]) g.add(box(.2, .9, 8.5, 0x37474f, s, 9.1, 0)); // parapet walls

    // Front and rear bamboo & painted barricade rails blocking the left lane.
    for (const z of [-6.2, 6.2]) {
      g.add(box(w, .18, .18, 0xb8322a, cx, 1.05, z)); // red rail
      g.add(box(w, .16, .16, 0xffffff, cx, .6, z));   // white rail
      for (let x = minX + .4; x <= maxX - .3; x += 2.2) {
        g.add(box(.16, 1.35, .16, 0x5d4037, x, .68, z)); // wooden post
      }
    }

    // Main front cloth banner: deep royal blue banner with gold/white civic slogan.
    for (const dx of [-w / 2 + .5, w / 2 - .5]) g.add(box(.14, 3.6, .14, POLE, cx + dx, 1.8, 5.8));
    const mainBanner = sign(CIVIC_BANNERS[0], 6.2, 1.15, "#1565c0", "#fff8e1");
    mainBanner.position.set(cx, 2.75, 5.9);
    g.add(mainBanner);

    // Glowing yellow diversion sign at the median opening guiding drivers to swerve into the opposite lane.
    const detourSign = sign("উল্টা লেনে কাটেন ►", 3.4, .88, "#ffc21a", "#1a1d1f");
    detourSign.position.set(0.6, 1.85, 6.4);
    g.add(detourSign);
    for (let z = -7; z <= 7; z += 2.8) {
      g.add(box(.45, .65, .45, 0xff6d00, 0.45, .33, z)); // orange traffic cones along the median gap
    }

    // Battery megaphone loudspeaker on high bamboo tripod stand.
    const spkX = minX + 0.6, spkZ = 5.2;
    g.add(box(.12, 3.2, .12, 0x6d4c41, spkX, 1.6, spkZ)); // tripod main pole
    g.add(box(.1, 2.4, .1, 0x6d4c41, spkX - .35, 1.2, spkZ - .3));
    g.add(box(.1, 2.4, .1, 0x6d4c41, spkX + .35, 1.2, spkZ - .3));
    g.add(box(.55, .55, .75, 0xd4e157, spkX, 3.3, spkZ)); // speaker horn body
    g.add(box(.75, .75, .15, 0x9e9d24, spkX, 3.3, spkZ + .4)); // flared horn mouth

    // Roadside tea stall ("টং দোকান") on left sidewalk with onlookers.
    const stallX = -R - 3.4, stallZ = 0.5;
    g.add(box(3.2, 1.1, 1.8, 0x6d4c41, stallX, .55, stallZ)); // wooden counter
    g.add(box(3.6, .08, 2.4, 0x546e7a, stallX, 2.4, stallZ));  // corrugated tin roof
    g.add(box(.1, 1.4, .1, 0x37474f, stallX - 1.5, 1.7, stallZ - .9)); // roof poles
    g.add(box(.1, 1.4, .1, 0x37474f, stallX + 1.5, 1.7, stallZ - .9));
    g.add(box(.6, .45, .4, 0xb0bec5, stallX, 1.3, stallZ));    // silver tea kettle
    for (const ox of [-0.9, 0.9]) {
      const onlooker = new THREE.Group();
      onlooker.position.set(stallX + ox, 0, stallZ + 1.4);
      onlooker.add(box(.45, .88, .3, 0x2e7d32, 0, .94, 0));
      onlooker.add(box(.4, .55, .26, 0x1565c0, 0, .28, 0));
      onlooker.add(mesh(crownGeo, creamMat, 0, 1.6, 0, .22, .22, .22));
      g.add(onlooker);
    }

    // 18 Marchers in lungis, kurtas, and polo shirts holding hand-painted civic placards.
    const clothes = [
      { shirt: 0x1565c0, pants: 0x2e7d32 }, // blue kurta, green lungi
      { shirt: 0xd32f2f, pants: 0x37474f }, // red shirt, dark trousers
      { shirt: 0xfff8e1, pants: 0x1a237e }, // white punjabi, blue lungi
      { shirt: 0xf57c00, pants: 0x4e342e }, // orange polo, brown pants
      { shirt: 0x388e3c, pants: 0x212121 }, // green kurta, black lungi
      { shirt: 0x7b1fa2, pants: 0x455a64 }, // purple shirt, grey trousers
    ];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Group();
      const col = i % 4, row = Math.floor(i / 4);
      const sx = minX + .7 + col * ((w - 1.4) / 3) + rnd(-.25, .25);
      const sz = -4.5 + row * 2.8 + rnd(-.3, .3);
      m.position.set(sx, 0, sz);
      const dress = clothes[i % clothes.length];
      m.add(box(.46, .88, .3, dress.shirt, 0, .94, 0));     // shirt / kurta
      m.add(box(.42, .58, .28, dress.pants, 0, .29, 0));     // lungi / trousers
      m.add(mesh(crownGeo, creamMat, 0, 1.6, 0, .23, .23, .23)); // head
      if (i % 2 === 0 || i === 5 || i === 11) {
        const slogan = CIVIC_BANNERS[(i + 1) % CIVIC_BANNERS.length];
        const bg = pick(["#fff8e1", "#ffc21a", "#e1f5fe", "#e8f5e9"]);
        const fg = bg === "#ffc21a" ? "#1a1d1f" : "#0d47a1";
        m.add(box(.08, 1.85, .08, 0x5d4037, .22, 1.95, 0)); // placard stick
        const placard = sign(slogan, 3.2, .75, bg, fg);
        placard.position.set(.22, 2.75, .06);
        m.add(placard);
      }
      m.userData.phase = i * .65;
      g.add(m);
      marchers.push(m);
    }
    g.userData.students = marchers;
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

  shaheedMinar: ({ side }) => {
    // Respectful stylised Shaheed Minar on a wide raised plaza, set well back from the road.
    const g = new THREE.Group(), x = side * (R + 15);
    g.add(box(14, .45, 26, STONE, x, .22, 0));                       // outer stepped plaza
    g.add(box(10, .45, 20, 0xeeeeee, x + side * .8, .65, 0));        // white marble dais
    // Crimson sun disc behind the columns, facing the road.
    const sunMat = new THREE.MeshLambertMaterial({ color: 0xc62828 });
    const sunDisc = mesh(discGeo, sunMat, x + side * 2.2, 4.4, 0, 3.4, .22, 3.4);
    sunDisc.rotation.z = Math.PI / 2;
    g.add(sunDisc);
    // Central tall frame with its iconic bowed upper half, flanked by two smaller frames on each side.
    const frame = (zOff, h, w, bow = false) => {
      for (const dz of [-w / 2, w / 2]) g.add(box(.28, h, .28, 0xffffff, x, .9 + h / 2, zOff + dz));
      g.add(box(.28, .28, w + .28, 0xffffff, x, .9 + h, zOff));
      if (bow) {
        const top = new THREE.Group();
        top.position.set(x, .9 + h, zOff);
        top.rotation.z = -side * 0.38; // gentle respectful bow towards the plaza
        for (const dz of [-w / 2, w / 2]) top.add(box(.26, 2.2, .26, 0xffffff, 0, 1.1, dz));
        top.add(box(.26, .26, w + .26, 0xffffff, 0, 2.2, 0));
        g.add(top);
      }
    };
    frame(0, 5.2, 3.2, true);
    for (const s of [-1, 1]) {
      frame(s * 3.8, 4.2, 2.1, false);
      frame(s * 6.8, 3.2, 1.7, false);
    }
    const p = sign("শহীদ মিনার", 5.5, 1.05, "#ffffff", "#b71c1c");
    p.position.set(x - side * 5.2, 2.2, 0);
    p.rotation.y = -side * FACE;
    g.add(p);
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
const ACROSS = new Set([
  "stageGate", "wires", "gateArch", "marketSign",
  "footbridge", "metroStation", "crossing", "junctionFlyover", "studentDemo", "civicMichil", "finishBanner",
]);

/* ====== Overhead Metro Train (4 carriages that bend along the viaduct spline) ====== */
const metroSegs = SEGS.filter(S => S.metro);
const METRO_START = metroSegs.length ? metroSegs[0].p0 + metroSegs[0].metro[0] * metroSegs[0].len : 0;
const METRO_END = metroSegs.length ? metroSegs[metroSegs.length - 1].p0 + metroSegs[metroSegs.length - 1].metro[1] * metroSegs[metroSegs.length - 1].len : 0;

function makeMetroCar(isLead) {
  const g = new THREE.Group(), L = M.carLength;
  g.add(box(2.5, 2.5, L, 0xf2f4f7, 0, 1.35, 0));                           // silver-white carriage body
  g.add(box(2.54, .32, L + .02, 0x1f6b3a, 0, 1.05, 0));                    // green stripe
  g.add(box(2.55, .14, L + .02, 0xb8322a, 0, .85, 0));                     // red stripe
  g.add(box(2.56, .68, L * .86, DARK, 0, 1.72, 0));                        // side windows
  if (isLead) {
    g.add(box(2.1, .72, .08, DARK, 0, 1.72, -L / 2 - .02));                // front windscreen
    for (const s of [-1, 1]) g.add(box(.32, .2, .08, 0xfff9c4, s * .8, .9, -L / 2 - .03)); // headlights
  }
  g.visible = false;
  scene.add(g);
  return g;
}
const metroCars = Array.from({ length: M.cars }, (_, i) => makeMetroCar(i === 0));
const mSpot = { seg: 0, s: 0 };
let lastPassCycle = -1;

/* ====== Placements along the route ====== */
const placements = [];   // { at, prefab, side, text } sorted by distance
const GATE_OFFSETS = [0, 28, 108, 198];
for (const [i, st] of ROUTE.stages.entries()) {
  const start = STAGE_START[i];
  if (i > 0) placements.push({ at: start + (GATE_OFFSETS[i] || 0), prefab: "stageGate", side: 0, text: `স্বাগতম — ${st.name}` });
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
// Each landmark sits on the main road at its journey progress; filter out any landmark that overlaps a road/junction.
const lmPt = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };
for (let i = placements.length - 1; i >= 0; i--) {
  const p = placements[i];
  fromProgress(p.at, p);
  sample(p.seg, p.s, lmPt);
  if (p.side !== 0) {
    const off = R + (p.prefab === "shopRow" ? 6 : p.prefab === "lake" ? 17 : 5);
    const wx = lmPt.x + Math.cos(lmPt.yaw) * p.side * off;
    const wz = lmPt.z - Math.sin(lmPt.yaw) * p.side * off;
    const rad = p.prefab === "shopRow" ? 11 : 4.5;
    if (hitsAnyRoad(wx, wz, rad, p.seg, p.s)) {
      placements.splice(i, 1);
    }
  } else if (p.prefab === "wires") {
    // Keep utility wire poles away from sharp curves and cross-road intersections.
    const lx = lmPt.x - Math.cos(lmPt.yaw) * (R + 2.2), lz = lmPt.z + Math.sin(lmPt.yaw) * (R + 2.2);
    const rx = lmPt.x + Math.cos(lmPt.yaw) * (R + 2.2), rz = lmPt.z - Math.sin(lmPt.yaw) * (R + 2.2);
    if (Math.abs(lmPt.k) > 0.008 || hitsAnyRoad(lx, lz, 2.0, p.seg, p.s) || hitsAnyRoad(rx, rz, 2.0, p.seg, p.s)) {
      placements.splice(i, 1);
    }
  }
}

const active = [];  // { m, p }
let next = 0;       // index of the next placement to spawn

/** Clear all landmarks and continue from this journey progress (start or checkpoint). */
export function eachMetroCar(fn) {
  for (const c of metroCars) {
    if (c.visible) fn(c.position.x, c.position.y, c.position.z, c.rotation.y);
  }
}

export function resetLandmarks(fromProg) {
  for (const a of active) scene.remove(a.m);
  active.length = 0;
  for (const c of metroCars) c.visible = false;
  lastPassCycle = -1;
  next = placements.findIndex(p => p.at >= fromProg - J.despawnBehind);
  if (next < 0) next = placements.length;
}

/** Build landmarks coming into view, remove old ones, and move the overhead metro train. */
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
    if (!(a > -J.despawnBehind)) { scene.remove(active[i].m); active.splice(i, 1); continue; }
    // Animate chanting students and placards in the Shahbagh demonstration.
    const students = active[i].m.userData.students;
    if (students) {
      for (const st of students) {
        const w = Math.sin(game.time * 5.2 + st.userData.phase);
        st.position.y = Math.max(0, w) * .16;
        st.rotation.z = w * .06;
      }
    }
    // Morning crows lift off from the Mohammadpur Bus Stand roof when the bus starts moving.
    const crows = active[i].m.userData.crows;
    if (crows && game.running && game.dist > 2 && game.dist < 140) {
      const flightT = Math.min(4, game.dist / 16);
      for (const c of crows) {
        const u = c.userData;
        c.position.y = u.baseY + flightT * u.vy;
        c.position.x += u.vx * 0.016;
        c.position.z += u.vz * 0.016;
        c.rotation.z = Math.sin(game.time * 18 + u.ph) * .28;
      }
    }
  }

  // Timetable overhead metro train along the Shahbagh -> Dhaka University viaduct.
  if (METRO_END > METRO_START && game.prog > METRO_START - J.spawnAhead && game.prog < METRO_END + J.spawnAhead) {
    const span = METRO_END - METRO_START + 120;
    const cycle = Math.floor((game.time * M.speed) / span);
    const headProg = METRO_END + 40 - ((game.time * M.speed) % span); // runs oncoming overhead so player sees it clearly
    for (let i = 0; i < metroCars.length; i++) {
      const carProg = headProg + i * (M.carLength + M.carGap);
      const onViaduct = carProg >= METRO_START && carProg <= METRO_END && Math.abs(carProg - game.prog) < J.spawnAhead;
      metroCars[i].visible = onViaduct;
      if (onViaduct) {
        fromProgress(carProg, mSpot);
        place(metroCars[i], mSpot.seg, mSpot.s, -1.4, M.deckY + .15, Math.PI);
      }
    }
    if (cycle !== lastPassCycle && Math.abs(headProg - game.prog) < M.soundDist) {
      lastPassCycle = cycle;
      metroPass();
    }
  } else {
    for (const c of metroCars) c.visible = false;
  }
}
