// The player's bus: its 3D model, arcade driving physics, and fuel use.
import * as THREE from "three";
import { CFG } from "./config.js";
import { clamp, pick, rnd } from "./utils.js";
import { scene, box, plate } from "./world.js";
import { input } from "./input.js";
import { game } from "./state.js";
import { emit } from "./events.js";
import { SEGS, here, sample, place, fromProgress, progressOf, projectToRoad, findNearestRoad } from "./map.js";
import { SLOGANS, COMPANIES, PLATES } from "./data/slogans.bn.js";
import { playKhelaHobe, playReverseBeep, playKerbScrape, playBrakeFao, crashSound } from "./audio.js";
import { say } from "./speech.js";
import {
  boostFlameMat,
  boostCoreMat,
  sparkMat,
  headlightBeamMat,
  createHeadlightBeamGeo,
  createLEDMaterial,
  createLEDRowGeometry
} from "./shaders.js";
import { spawnScrapeSparks, spawnSkidPuff } from "./effects.js";
import { loadBusModel, instantiateBusModel, isBusModelReady } from "./busModel.js";

const B = CFG.bus;

// The bus is built in layers so the look can move without moving the physics:
//   bus   -> position on the road (physics) + turning of the nose (yaw)
//   body  -> lean in turns (roll) and dip on braking (pitch)
//   wheels stay under `bus`, so they never lean with the body.
export const bus = new THREE.Group();
const body = new THREE.Group();
bus.add(body);

const procBody = new THREE.Group();
body.add(procBody);

export let playerBusInstance = null;
const wheels = [];
const cracks = []; // staged window crack meshes [stage1, stage2, stage3]
const tassels = []; // hanging rear corner tassels that swing in turns
let doorPivot = null, helperGroup = null, helperArm = null;
let slapAnimT = 0;  // seconds left in the helper's door-slap animation
let companyBoard = null, sloganBoard = null, numPlateBoard = null;

// Object-pooled exhaust smoke puffs at the rear tailpipe (reused, zero allocations per frame).
const smokeGeo = new THREE.IcosahedronGeometry(.22, 0);
smokeGeo.userData = { isShared: true };
const smokeMat = new THREE.MeshLambertMaterial({ color: 0x9e9e9e, transparent: true, opacity: 0.55 });
smokeMat.userData = { isShared: true };
const exhaustPool = Array.from({ length: 12 }, () => {
  const m = new THREE.Mesh(smokeGeo, smokeMat);
  m.visible = false;
  scene.add(m);
  return { m, active: false, t: 0, maxT: 0.6, x: 0, y: 0, z: 0, vy: 0 };
});

// Additive nitro flame burst pool for turbo boost (spits blazing cyan/orange flames)
const nitroGeo = new THREE.IcosahedronGeometry(.28, 0);
nitroGeo.userData = { isShared: true };
const nitroCoreGeo = new THREE.IcosahedronGeometry(.16, 0);
nitroCoreGeo.userData = { isShared: true };
const nitroPool = Array.from({ length: 10 }, () => {
  const m = new THREE.Mesh(nitroGeo, boostFlameMat);
  const core = new THREE.Mesh(nitroCoreGeo, boostCoreMat);
  m.add(core);
  m.visible = false;
  scene.add(m);
  return { m, active: false, t: 0, maxT: 0.35, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
});
let smokeTimer = 0;
const tailWorld = new THREE.Vector3();

/** Trigger the 3D helper's arm-slap animation on the side of the bus. */
export function triggerHelperSlap() {
  slapAnimT = 0.45;
}
const CRASHED = Object.freeze({ throttle: 0, brake: 1, steer: 0, boost: false });
// One shared tail-light material, so both lights glow together when braking.
const tailMat = new THREE.MeshLambertMaterial({ color: 0xff1111, emissive: 0xff0000, emissiveIntensity: 0.3 });
// Shared reverse lights material: shines brilliant white when in reverse gear
const revLightMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.0 });

/** Procedural spiderweb crack texture drawn once and shared across window crack planes. */
function makeCrackMat() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.strokeStyle = "rgba(235, 248, 255, 0.9)";
  g.lineWidth = 2.2;
  const cx = 64, cy = 64;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * .25;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 28);
    g.lineTo(cx + Math.cos(a + .12) * 58, cy + Math.sin(a + .12) * 58);
    g.stroke();
  }
  for (const r of [18, 36]) {
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true });
}
const crackMat = makeCrackMat();
const crackGeo = new THREE.PlaneGeometry(.75, .75);

/** Build the green Dhaka local bus out of simple boxes (fallback & visual anchor). */
function buildBus() {
  procBody.add(box(2.6, 2.3, 7, 0x1f8a44, 0, 1.5, 0));       // vibrant emerald Dhaka bus body
  procBody.add(box(2.62, .45, 7.02, 0xffc21a, 0, .95, 0));   // vibrant golden yellow stripe
  procBody.add(box(2.62, .28, 7.04, 0xb71c1c, 0, .56, 0));   // lower red Dhaka bus skirt
  procBody.add(box(2.64, .8, 5.8, 0x263238, 0, 2.2, .3));    // side windows
  procBody.add(box(2.2, .8, .05, 0x263238, 0, 2.2, -3.52));  // windscreen
  procBody.add(box(2.0, .62, .05, 0x263238, 0, 2.3, 3.51));  // rear window
  procBody.add(box(2.4, .15, 6.8, 0xf5f5f5, 0, 2.72, 0));    // clean white roof

  // Staged window crack overlays (revealed as game.hp drops below 75, 45, 20).
  const addCrack = (x, y, z, ry) => {
    const m = new THREE.Mesh(crackGeo, crackMat);
    m.position.set(x, y, z); m.rotation.y = ry; m.visible = false;
    body.add(m);
    return m;
  };
  cracks.push(
    [addCrack(-.45, 2.3, 3.55, 0), addCrack(1.33, 2.2, 1.4, Math.PI / 2)],     // stage 1 (< 75 HP): rear & right side
    [addCrack(.5, 2.3, 3.55, 0), addCrack(-1.33, 2.2, -.6, -Math.PI / 2)],     // stage 2 (< 45 HP): rear & left side
    [addCrack(.45, 2.2, -3.56, Math.PI), addCrack(-.5, 2.2, -3.56, Math.PI)],  // stage 3 (< 20 HP): front windscreen
  );

  // Wheels share one geometry and material: the GPU stores them once.
  const tyreGeo = new THREE.CylinderGeometry(B.wheelRadius, B.wheelRadius, .4, 12);
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const beamGeo = createHeadlightBeamGeo(26, 0.22, 3.2);
  beamGeo.userData = { isShared: true };
  for (const s of [-1, 1]) {
    body.add(box(.4, .3, .1, 0xffffaa, s * .9, 1.0, -3.52)); // headlight
    // Forward-projecting volumetric additive headlight beam
    const beam = new THREE.Mesh(beamGeo, headlightBeamMat);
    beam.position.set(s * 0.9, 1.0, -3.55);
    body.add(beam);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(.3, .25, .1), tailMat);
    tail.position.set(s * 1.0, 1.0, 3.52); body.add(tail);

    const revLight = new THREE.Mesh(new THREE.BoxGeometry(.22, .22, .1), revLightMat);
    revLight.position.set(s * 0.72, 1.0, 3.52); body.add(revLight);

    for (const z of [-2.3, 2.3]) {
      const w = new THREE.Group();               // spins around the axle (x axis)
      w.position.set(s * 1.3, B.wheelRadius, z);
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.rotation.z = Math.PI / 2;
      w.add(tyre);
      w.add(box(.42, .12, B.wheelRadius * 1.6, 0x9e9e9e)); // hub bar, so you can see it spin
      bus.add(w); wheels.push(w);
    }
  }

  // Decorative Dhaka bus front LED strip ("ঢাকা মেট্রো" chasing RGB/amber visor lights)
  const visorLEDMat = createLEDMaterial({ speed: 8.5, gain: 2.4 });
  visorLEDMat.userData = { isShared: true };
  const visorLEDGeo = createLEDRowGeometry(12, 2.1, 0.09, [0xff1744, 0xffd600, 0x00e676, 0x2979ff]);
  visorLEDGeo.userData = { isShared: true };
  const visorMesh = new THREE.Mesh(visorLEDGeo, visorLEDMat);
  visorMesh.position.set(0, 2.62, -3.54);
  body.add(visorMesh);

  // Colourful rickshaw-art tassels hanging from the rear roof corners.
  for (const s of [-1, 1]) {
    const t = new THREE.Group();
    t.position.set(s * 1.28, 2.65, 3.48);
    t.add(box(.08, .45, .08, 0xe91e63, 0, -.22, 0));
    t.add(box(.14, .16, .14, 0xffd600, 0, -.48, 0));
    t.add(box(.1, .2, .1, 0x00e5ff, 0, -.64, 0));
    body.add(t);
    tassels.push(t);
  }

  // Front-left passenger doorway, hinged door leaf, and the 3D helper leaning out.
  body.add(box(.08, 1.75, .92, 0x142818, -1.31, 1.28, -2.15)); // dark doorway recess
  doorPivot = new THREE.Group();
  doorPivot.position.set(-1.32, 1.28, -2.58);
  doorPivot.add(box(.06, 1.7, .82, 0xfdd835, 0, 0, .41));      // yellow folding door leaf
  body.add(doorPivot);

  helperGroup = new THREE.Group();
  helperGroup.position.set(-1.42, 0.52, -2.12);
  helperGroup.rotation.z = 0.18;                               // leaning slightly out to call passengers
  helperGroup.add(box(.34, .48, .26, 0x37474f, 0, .24, 0));    // trousers
  helperGroup.add(box(.38, .62, .28, 0xe53935, 0, .78, 0));    // bright red shirt
  helperGroup.add(box(.28, .28, .28, 0xc68642, 0, 1.25, 0));   // head
  helperGroup.add(box(.32, .1, .3, 0xffeb3b, 0, 1.41, 0));     // headband / cap
  helperArm = new THREE.Group();
  helperArm.position.set(.16, 1.02, -.1);
  helperArm.add(box(.12, .46, .12, 0xc68642, 0, -.18, -.1));   // right arm that slaps the bus panel
  helperGroup.add(helperArm);
  body.add(helperGroup);

  refreshBusSigns();
}

/** Pick a fresh company name, rear truck-art slogan, and Bangla-digit licence plate for this run. */
function refreshBusSigns() {
  for (const old of [companyBoard, sloganBoard, numPlateBoard]) if (old) body.remove(old);
  companyBoard = plate(pick(COMPANIES), 2.35, .44, "#1b5e20", "#ffeb3b");
  companyBoard.position.set(0, 2.96, 3.35);
  body.add(companyBoard);

  sloganBoard = plate(pick(SLOGANS), 2.35, .58, "#ffeb3b", "#b71c1c");
  sloganBoard.position.set(0, 1.68, 3.53);
  body.add(sloganBoard);

  numPlateBoard = plate(pick(PLATES), 1.45, .32, "#ffffff", "#111111");
  numPlateBoard.position.set(0, 0.68, 3.54);
  body.add(numPlateBoard);
}

function apply3DModel(instance) {
  if (!instance) return;
  playerBusInstance = instance;
  procBody.visible = false;
  for (const w of wheels) w.visible = false;
  body.add(instance.root);
  // Re-align passenger door and helper to the 3D model entrance
  if (doorPivot) doorPivot.position.set(-1.08, 1.25, -2.62);
  if (helperGroup) helperGroup.position.set(-1.18, 0.48, -2.15);
}

// Preload and attach the authentic 3D Bangladeshi bus model
loadBusModel().then(() => {
  const inst = instantiateBusModel({ isPlayer: true, scale: 0.85 });
  apply3DModel(inst);
}).catch(err => {
  console.warn("Using procedural bus model fallback:", err);
});

buildBus();
scene.add(bus);

const pos = { x: 0, y: 0, z: 0, yaw: 0, k: 0 }; // reused road sample
const projOut = { seg: 0, s: 0, lat: 0, yaw: 0 }; // reused road projection
let lastMorKey = "";
let revBeepTimer = 0;
let kerbScrapeTimer = 0;
let mapEdgeVoiceTimer = 0;
const nearestRoad = { seg: 0, s: 0, lat: 0, yaw: 0, dist: 0 };

/** Put the bus on the main road at a journey progress value, facing along the road. */
export function resetBus(progress = 0) {
  fromProgress(progress, here);
  here.prev = -1;
  game.lat = -4.6;
  game.yaw = 0;
  game.prog = progress;
  game.busY = 0;
  game.busVy = 0;
  game.wrongWay = false;
  lastMorKey = "";
  if (SEGS[here.seg]?.mor) game.morName = SEGS[here.seg].mor;
  sample(here.seg, here.s, pos);
  const rx = Math.cos(pos.yaw), rz = -Math.sin(pos.yaw);
  game.wx = pos.x + rx * game.lat;
  game.wz = pos.z - rz * game.lat;
  game.heading = -pos.yaw; // world heading aligned with road direction
  game.steerAngle = 0;
  game.signedSpeed = CFG.bus.startSpeed;
  game.prevV = CFG.bus.startSpeed;
  game.gear = "D";

  body.rotation.set(0, 0, 0);
  body.position.set(0, 0, 0);
  if (companyBoard) { companyBoard.position.set(0, 2.96, 3.35); companyBoard.rotation.set(0, 0, 0); }
  if (sloganBoard) { sloganBoard.position.set(0, 1.68, 3.53); sloganBoard.rotation.set(0, 0, 0); }
  if (progress === 0) refreshBusSigns();
  for (const p of exhaustPool) { p.active = false; p.m.visible = false; }
  for (const np of nitroPool) { np.active = false; np.m.visible = false; }
  placeBus();
}

/** Move the 3D bus to its spot on the road (including airborne height game.busY). */
function placeBus() {
  if (game.freeRoam && CFG.freeRoam?.enabled) {
    bus.position.set(game.wx !== undefined ? game.wx : 0, game.busY || 0, game.wz !== undefined ? game.wz : 0);
    bus.rotation.y = -(game.heading || 0);
  } else {
    place(bus, here.seg, here.s, game.lat, game.busY || 0, -game.yaw);
  }
}

/**
 * Smoothly move `current` towards `target`. Using 1 - e^(-rate*dt) makes the
 * smoothing feel the same at any frame rate.
 */
function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** At an intersection (মোড়), take the left or right avenue if steering or positioned on that side. */
export function chooseNext(list) {
  const wantSide = Math.abs(input.steer) > 0.25 ? Math.sign(input.steer)
    : Math.abs(game.lat) > CFG.map.forkLat ? Math.sign(game.lat) : 0;
  if (wantSide !== 0) {
    for (const n of list) {
      const S = SEGS[n];
      if (S.side === wantSide) return n;
    }
  }
  return list[0];
}

let menuSlapLoopTimer = 6.0;

/** Menu backdrop mode: player's bus idling at the stand with diesel rumble & 6s helper door slaps. */
export function updateMenuBackdrop(dt) {
  game.speed = 0;
  game.boostT = 0;
  game.accel = 0;
  game.vx = 0;
  game.yaw = 0;
  // Positioned along the curb (left side of road in Bangladesh)
  game.lat = -3.8;
  placeBus();

  // 6-second helper door-slap loop
  menuSlapLoopTimer -= dt;
  if (menuSlapLoopTimer <= 0) {
    menuSlapLoopTimer = 6.0;
    triggerHelperSlap();
  }
}

/** Autopilot demo backward-compatibility alias. */
export const updateAutopilot = updateMenuBackdrop;

/**
 * One physics step for the bus: boost, speed, steering, road edge, fuel, moving along the road.
 * @returns {number} distance travelled this step
 */
export function updateBus(dt) {
  const F = CFG.fuel;
  const FR = CFG.freeRoam || {};
  const isFreeRoam = game.freeRoam && FR.enabled !== false;
  // After a heavy crash (or when surrounded) the driver has lost control: no steering, full brake.
  const ctl = game.crashing || game.caught ? CRASHED : input;
  const hasFuel = game.fuel > 0;

  // Boost: holding the key keeps the timer full; after release it runs out by itself.
  if (ctl.boost && hasFuel && game.gear !== "R") {
    if (game.boostT <= 0 && Math.random() < 0.3) playKhelaHobe();
    game.boostT = B.boostHold;
  } else {
    game.boostT = Math.max(0, game.boostT - dt);
  }
  const boosting = game.boostT > 0 && hasFuel && game.gear !== "R";

  // While boosting the bus drives itself, so the player only needs to steer.
  const throttle = boosting ? 1 : ctl.throttle;
  const top = boosting ? B.boostSpeed : B.maxSpeed;
  let ds = 0;

  if (isFreeRoam) {
    // ---- Arcade Free-Roam Vehicle Dynamics ----
    const topRev = -B.maxSpeed * (FR.reverseSpeedRatio || 0.25);
    let v = game.signedSpeed !== undefined ? game.signedSpeed : game.speed;

    if (v > 0.15) {
      game.gear = "D";
      const pull = hasFuel ? (B.accel + (boosting ? B.boostAccel : 0)) * throttle * Math.max(0, 1 - (v / top) ** 3) : 0;
      const drag = (hasFuel ? B.rollDrag : B.emptyTankDrag) + B.airDrag * v * v;
      v = v + (pull - B.brake * ctl.brake - drag) * dt;
      if (v < 0) v = 0;
      if (!boosting && v > B.maxSpeed) v = Math.max(B.maxSpeed, v - B.overSpeedDecel * dt);
    } else if (v < -0.15) {
      game.gear = "R";
      const revPull = hasFuel ? (FR.reverseAccel || 9.0) * ctl.brake * Math.max(0, 1 - (v / topRev) ** 2) : 0;
      const fwdBrake = (FR.reverseBrake || 32) * throttle;
      // In reverse, natural engine braking brings vehicle smoothly to rest when pedals are released
      const coastDrag = (ctl.brake === 0 && throttle === 0) ? 6.5 : B.rollDrag;
      const drag = (hasFuel ? coastDrag : B.emptyTankDrag) + B.airDrag * v * v;
      v = v + (-revPull + fwdBrake + drag) * dt;
      if (v > 0) v = 0;
      if (v < topRev) v = Math.min(topRev, v + 12 * dt);
    } else {
      // Stopped / Transition zone (|v| <= 0.15): holding brake activates Reverse gear
      if (ctl.brake > 0.1 && hasFuel) {
        if (game.gear !== "R") {
          game.gear = "R";
          say("হেল্পার", "পিছনে ওস্তাদ, পিছনে! ডানে কাটেন!", 1.8, true);
          playReverseBeep();
        }
        v -= (FR.reverseAccel || 9.0) * ctl.brake * dt * 0.8;
      } else if (throttle > 0.1 && hasFuel) {
        game.gear = "D";
        v += (B.accel + (boosting ? B.boostAccel : 0)) * throttle * dt * 0.8;
      } else {
        v = 0;
      }
    }

    // Dhaka bus reverse safety beeper loop
    if (game.gear === "R" || v < -0.15) {
      revBeepTimer -= dt;
      if (revBeepTimer <= 0) {
        revBeepTimer = FR.reverseBeeperInterval || 0.58;
        playReverseBeep(bus.position);
      }
    } else {
      revBeepTimer = 0;
    }

    game.signedSpeed = v;
    game.speed = Math.abs(v);
    game.accel = (v - (game.prevV ?? v)) / dt;
    game.prevV = v;

    // Steering with speed decay for high-speed stability
    const maxSteer = (FR.maxSteerAngle || 0.65) / (1 + Math.abs(v) * (FR.steerSpeedDecay || 0.038));
    const targetSteer = ctl.steer * maxSteer;
    const steerRate = Math.abs(ctl.steer) > 0.05 ? (FR.steerSpeed || 4.5) : (FR.steerReturn || 5.2);
    game.steerAngle = approach(game.steerAngle || 0, targetSteer, steerRate, dt);

    // Kinematic bicycle turning
    const L = FR.wheelbase || 4.8;
    const yawRate = (v / L) * Math.tan(game.steerAngle);
    game.heading = (game.heading || 0) + yawRate * dt;

    // Position integration in world space
    const dx = v * Math.sin(game.heading) * dt;
    const dz = -v * Math.cos(game.heading) * dt;
    game.wx = (game.wx !== undefined ? game.wx : bus.position.x) + dx;
    game.wz = (game.wz !== undefined ? game.wz : bus.position.z) + dz;

    // Project world coordinates onto road network
    projectToRoad(game.wx, game.wz, here.seg, projOut);
    here.seg = projOut.seg;
    here.s = projOut.s;
    game.lat = projOut.lat;
    game.yaw = clamp(game.heading + projOut.yaw, -Math.PI, Math.PI);
    game.vx = v * Math.sin(game.yaw);
    game.prog = progressOf(here.seg, here.s);
    ds = Math.abs(v) * dt;
    game.dist += ds;

    // Wrong-way detection on two-way boulevards
    game.wrongWay = SEGS[here.seg].half >= 6 && game.lat > 0.75;

    // Check if we crossed a named Dhaka crossroad (মোড়)
    const S = SEGS[here.seg];
    for (const [ji, j] of (S.junctions || []).entries()) {
      const js = j.at * S.len;
      const key = `${here.seg}:${ji}`;
      if (j.name && Math.abs(here.s - js) < 8 && lastMorKey !== key) {
        lastMorKey = key;
        game.morName = j.name;
        emit("morPass", { name: j.name });
      }
    }

    // Phase 2 Surface Rules: Road asphalt vs. Footpath / Dirt vs. Solid Buildings vs. Map Edge
    const roadHalf = S.half;
    const distFromRoad = Math.abs(game.lat) - roadHalf;
    const sidewalkW = FR.sidewalkWidth || 3.8;

    // 1. Off-Road Footpath & Dirt: grip reduced, bumpy vibration, kerb scrape sound
    if (distFromRoad > 0 && distFromRoad <= sidewalkW) {
      if (Math.abs(v) > (FR.offRoadMaxSpeed || 14.0) && !boosting) {
        v = Math.sign(v) * Math.max(0, Math.abs(v) - (FR.offRoadDrag || 16.0) * dt);
        game.signedSpeed = v;
        game.speed = Math.abs(v);
      }
      if (Math.abs(v) > 0.6) {
        game.busY = Math.max(game.busY, Math.abs(Math.sin(game.dist * 3.8)) * (FR.bumpyVibrationScale || 0.12));
        game.shake = Math.max(game.shake, 0.18);
      }
      kerbScrapeTimer -= dt;
      if (kerbScrapeTimer <= 0 && Math.abs(v) > 2.0) {
        playKerbScrape(bus.position);
        spawnScrapeSparks(bus.position.x + Math.sign(game.lat) * 1.3, 0.35, bus.position.z, 6, Math.sign(game.lat), 0);
        kerbScrapeTimer = FR.scrapeSoundInterval || 0.45;
      }
    } else {
      kerbScrapeTimer = Math.max(0, kerbScrapeTimer - dt);
    }

    // 2. Solid Building Facades & Perimeter Walls: solid elastic barrier with soft recovery
    if (distFromRoad > sidewalkW) {
      const penetration = distFromRoad - sidewalkW;
      const sideSign = Math.sign(game.lat);
      const rx = Math.cos(projOut.yaw), rz = -Math.sin(projOut.yaw);
      game.wx -= rx * sideSign * penetration * 1.05;
      game.wz -= rz * sideSign * penetration * 1.05;
      game.lat = sideSign * (roadHalf + sidewalkW);
      game.signedSpeed = -game.signedSpeed * (FR.buildingBounce || 0.22);
      v = game.signedSpeed;
      game.speed = Math.abs(v);
      game.shake = Math.max(game.shake, 0.45);
      game.hp = Math.max(5, (game.hp || 100) - 2);
      crashSound(false, bus.position);
      spawnScrapeSparks(bus.position.x, 1.1, bus.position.z, 10, -sideSign, 0);
    }

    // 3. Map Edge Invisible Boundary: stop vehicle with helper warning line
    findNearestRoad(game.wx, game.wz, nearestRoad);
    const maxExcursion = FR.mapEdgeMaxDist || 48.0;
    if (nearestRoad.dist > maxExcursion) {
      const overDist = nearestRoad.dist - maxExcursion;
      sample(nearestRoad.seg, nearestRoad.s, pos);
      const nx = (game.wx - pos.x) / nearestRoad.dist;
      const nz = (game.wz - pos.z) / nearestRoad.dist;
      game.wx -= nx * overDist * 1.1;
      game.wz -= nz * overDist * 1.1;
      game.signedSpeed = 0;
      game.speed = 0;
      v = 0;
      game.shake = Math.max(game.shake, 0.25);
      mapEdgeVoiceTimer -= dt;
      if (mapEdgeVoiceTimer <= 0) {
        say("হেল্পার", "এদিকে রাস্তা নেই ওস্তাদ!", 2.2, true);
        mapEdgeVoiceTimer = 4.0;
      }
    } else {
      mapEdgeVoiceTimer = Math.max(0, mapEdgeVoiceTimer - dt);
    }
  } else {
    // ---- Standard 1.5D Curvilinear Route Navigation ----
    const v = game.speed;
    const pull = hasFuel ? (B.accel + (boosting ? B.boostAccel : 0)) * throttle * Math.max(0, 1 - (v / top) ** 3) : 0;
    const drag = (hasFuel ? B.rollDrag : B.emptyTankDrag) + B.airDrag * v * v;
    let speed = Math.max(0, v + (pull - B.brake * ctl.brake - drag) * dt);
    if (!boosting && speed > B.maxSpeed) speed = Math.max(B.maxSpeed, speed - B.overSpeedDecel * dt);
    game.accel = (speed - v) / dt;
    game.speed = speed;
    game.signedSpeed = speed;

    sample(here.seg, here.s, pos);
    const radius = B.turnRadiusMin + speed * B.turnRadiusPerSpeed;
    const turnRate = ctl.steer * speed / radius;
    game.yaw += (turnRate - pos.k * speed * Math.cos(game.yaw)) * dt;
    if (Math.abs(ctl.steer) < .1) game.yaw = approach(game.yaw, 0, B.alignRate, dt);
    game.yaw = clamp(game.yaw, -B.maxRelYaw, B.maxRelYaw);

    const S = SEGS[here.seg];
    game.vx = speed * Math.sin(game.yaw);
    let x = game.lat + game.vx * dt;
    const edge = S.half - B.edgeInset, hard = S.half - B.edgeHardInset;
    const over = Math.abs(x) - edge;
    if (over > 0) {
      game.yaw -= Math.sign(x) * B.edgeYawPush * over * dt;
      game.speed = Math.max(0, game.speed - B.edgeScrapeDrag * dt);
      game.shake = Math.max(game.shake, B.edgeShake);
      if (speed > 8 && Math.random() < 0.45) {
        spawnScrapeSparks(bus.position.x + Math.sign(x) * 1.3, 0.35, bus.position.z, 6, Math.sign(x), 0);
      }
    }
    if (Math.abs(x) > hard) {
      x = Math.sign(x) * hard;
      if (Math.sign(game.yaw) === Math.sign(x)) game.yaw *= .5;
    }
    game.lat = x;

    const prevS = here.s;
    ds = game.speed * Math.cos(game.yaw) * dt;
    here.s += ds;

    for (const [ji, j] of (S.junctions || []).entries()) {
      const js = j.at * S.len;
      const key = `${here.seg}:${ji}`;
      if (j.name && prevS < js && here.s >= js && lastMorKey !== key) {
        lastMorKey = key;
        game.morName = j.name;
        emit("morPass", { name: j.name });
      }
    }

    while (here.s > SEGS[here.seg].len && SEGS[here.seg].next.length) {
      here.s -= SEGS[here.seg].len;
      here.prev = here.seg;
      here.seg = chooseNext(SEGS[here.seg].next);
      const nextSeg = SEGS[here.seg];
      if (nextSeg.mor) {
        game.morName = nextSeg.mor;
        emit("morPass", { name: nextSeg.mor, turned: nextSeg.side !== 0 });
      }
    }
    here.s = Math.min(here.s, SEGS[here.seg].len);
    game.prog = progressOf(here.seg, here.s);
    game.wrongWay = SEGS[here.seg].half >= 6 && game.lat > 0.75;
  }

  // Airborne ramp jump / WASA trench vertical physics.
  if (game.busY > 0 || game.busVy !== 0) {
    game.busVy -= 26 * dt;
    game.busY += game.busVy * dt;
    if (game.busY <= 0) {
      game.busY = 0;
      game.busVy = 0;
      game.shake = Math.max(game.shake, 0.45);
      emit("busLanded");
    }
  }

  game.fuel -= (F.baseDrain + game.speed / F.speedDrainRef * F.speedDrain + (boosting ? F.boostDrain : 0)) * dt;
  game.fuel = Math.max(0, game.fuel);
  placeBus();
  return ds;
}

/** Animate the look of the bus (lean, nose dip, wheels, brake lights, cutscene rocking). Call once per frame. */
export function updateBusVisual(dt) {
  const k = B.visualSmoothing;
  if (game.caught) {
    // Dramatic "গণধোলাই / ঘেরাও" cutscene: the crowd rocks the bus and knocks signboards loose!
    body.rotation.z = Math.sin(game.time * 19) * 0.11;
    body.rotation.x = Math.cos(game.time * 13) * 0.04;
    body.position.y = Math.abs(Math.sin(game.time * 15)) * 0.08;
    if (companyBoard) {
      companyBoard.rotation.z = 0.28;
      companyBoard.position.y = 2.75;
    }
    if (sloganBoard) {
      sloganBoard.rotation.z = -0.22;
    }
  } else {
    // Body leans outwards in a turn; nose dips when braking or pitches up during a ramp jump.
    const airPitch = game.busY > 0.05 ? clamp(-game.busVy * 0.022, -0.22, 0.22) : 0;
    const targetPitch = clamp(game.accel * B.pitchPerAccel, -B.maxPitch, B.maxPitch) + airPitch;
    body.rotation.z = approach(body.rotation.z, game.vx * B.rollPerSideSpeed, k, dt);
    body.rotation.x = approach(body.rotation.x, targetPitch, k, dt);
    if (!game.running) {
      body.position.y = Math.sin(game.time * 24) * 0.007;
      body.rotation.x += Math.sin(game.time * 18) * 0.002;
    } else {
      body.position.y = game.busY === 0 ? Math.sin(game.dist * 1.9) * .025 : 0;
    }
  }

  const rollSpeed = game.signedSpeed !== undefined ? game.signedSpeed : game.speed;
  const steerAng = game.steerAngle !== undefined ? game.steerAngle : game.yaw;

  if (playerBusInstance) {
    playerBusInstance.roll(rollSpeed, dt);
    playerBusInstance.steer(steerAng);
  } else {
    const spin = rollSpeed * dt / B.wheelRadius; // rolling without slipping: angle = distance / radius
    for (const w of wheels) w.rotation.x -= spin;
    // Steer front procedural wheels
    if (wheels[2]) wheels[2].rotation.y = steerAng;
    if (wheels[3]) wheels[3].rotation.y = steerAng;
  }

  // Swinging rear tassels react to sideways steering and road vibration.
  const sway = clamp(-game.vx * .045, -.45, .45) + Math.sin(game.time * (!game.running ? 3.5 : 7)) * .06;
  for (const t of tassels) {
    t.rotation.z = sway;
    t.rotation.x = .08 + Math.min(.35, game.speed * .006);
  }

  // Front door opens at bus stops, while slow near the stand, or while idling in title menu.
  const doorOpen = (!game.running || game.onMark === "stop" || (game.running && game.speed < CFG.stops.boardMaxSpeed && game.dist < 18)) ? 1.15 : 0.15;
  if (doorPivot) doorPivot.rotation.y = approach(doorPivot.rotation.y, doorOpen, 8, dt);
  if (helperGroup) {
    helperGroup.position.y = 0.52 + Math.abs(Math.sin(game.time * 5)) * .03;
    if (slapAnimT > 0) {
      slapAnimT = Math.max(0, slapAnimT - dt);
      helperArm.rotation.x = -Math.abs(Math.sin(slapAnimT * 28)) * 1.1;
      helperArm.rotation.z = -Math.abs(Math.sin(slapAnimT * 28)) * .45;
    } else {
      helperArm.rotation.x = approach(helperArm.rotation.x, -.25, 8, dt);
      helperArm.rotation.z = approach(helperArm.rotation.z, 0, 8, dt);
    }
  }

  // Exhaust smoke puffs from the rear right tailpipe (faster when boosting, soft diesel puffs when idling in menu).
  if (dt > 0) {
    const boosting = game.running && game.boostT > 0;
    const isIdling = !game.running || game.speed < 1;
    const interval = boosting ? 0.045 : game.accel > 1 ? 0.09 : isIdling ? 0.24 : 0.18;
    smokeTimer -= dt;
    if (smokeTimer <= 0) {
      smokeTimer = interval;
      const p = exhaustPool.find(it => !it.active);
      if (p) {
        bus.updateMatrixWorld();
        tailWorld.set(0.95, 0.48, 3.65).applyMatrix4(bus.matrixWorld);
        p.active = true; p.t = 0; p.maxT = boosting ? 0.55 : isIdling ? 0.65 : 0.42;
        p.x = tailWorld.x + rnd(-.08, .08); p.y = tailWorld.y; p.z = tailWorld.z + rnd(-.08, .08);
        p.vy = boosting ? 2.1 : isIdling ? 0.75 : 1.3;
        p.m.position.set(p.x, p.y, p.z);
        p.m.scale.setScalar(boosting ? 1.2 : isIdling ? 0.55 : 0.75);
        p.m.visible = true;
      }

      // Additive nitro flame burst during ⚡ Boost
      if (boosting) {
        const np = nitroPool.find(it => !it.active);
        if (np) {
          bus.updateMatrixWorld();
          tailWorld.set(0.95, 0.48, 3.65).applyMatrix4(bus.matrixWorld);
          np.active = true; np.t = 0; np.maxT = rnd(0.2, 0.32);
          np.x = tailWorld.x + rnd(-.08, .08);
          np.y = tailWorld.y + rnd(-.04, .04);
          np.z = tailWorld.z + rnd(-.08, .08);
          np.vx = rnd(-1.4, 1.4);
          np.vy = rnd(0.4, 1.8);
          np.vz = rnd(9.0, 18.0);
          np.m.position.set(np.x, np.y, np.z);
          np.m.visible = true;
        }
      }
    }
  }
  for (const p of exhaustPool) {
    if (!p.active) continue;
    p.t += dt;
    if (p.t >= p.maxT) { p.active = false; p.m.visible = false; continue; }
    p.y += p.vy * dt;
    p.m.position.y = p.y;
    const s = 0.75 + (p.t / p.maxT) * 1.6;
    p.m.scale.setScalar(s);
  }
  for (const np of nitroPool) {
    if (!np.active) continue;
    np.t += dt;
    if (np.t >= np.maxT) { np.active = false; np.m.visible = false; continue; }
    const prg = np.t / np.maxT;
    np.x += np.vx * dt; np.y += np.vy * dt; np.z += np.vz * dt;
    np.m.position.set(np.x, np.y, np.z);
    np.m.scale.setScalar(Math.max(0.1, (1.0 - prg) * rnd(1.1, 1.6)));
    np.m.material.opacity = (1.0 - prg) * 0.9;
  }

  tailMat.emissiveIntensity = input.brake > 0 && game.running ? B.brakeLightGlow : 0.3;
  if (revLightMat) {
    revLightMat.emissiveIntensity = (game.gear === "R" || (game.signedSpeed !== undefined && game.signedSpeed < -0.15)) ? 2.8 : 0.0;
  }

  // Reveal staged window cracks as Bus HP drops.
  const thresholds = [75, 45, 20];
  for (let i = 0; i < cracks.length; i++) {
    const show = game.hp < thresholds[i];
    for (const m of cracks[i]) if (m.visible !== show) m.visible = show;
  }
}

/**
 * Back-to-Road recovery action: re-aligns the bus to the nearest road segment
 * facing along the route with proper penalties and conductor dialogue.
 */
export function recoverToRoad() {
  if (!game.running) return;
  const nearest = { seg: 0, s: 0, lat: 0, yaw: 0, dist: 0 };
  findNearestRoad(game.wx !== undefined ? game.wx : bus.position.x, game.wz !== undefined ? game.wz : bus.position.z, nearest);
  sample(nearest.seg, nearest.s, pos);
  const targetLat = -3.4; // left lane (Dhaka drive side)
  const rx = Math.cos(pos.yaw), rz = -Math.sin(pos.yaw);
  game.wx = pos.x + rx * targetLat;
  game.wz = pos.z - rz * targetLat;
  game.heading = -pos.yaw;
  game.steerAngle = 0;
  game.signedSpeed = 0;
  game.speed = 0;
  game.gear = "D";
  game.busY = 0;
  game.busVy = 0;
  here.seg = nearest.seg;
  here.s = nearest.s;
  game.lat = targetLat;
  game.yaw = 0;
  game.prog = progressOf(here.seg, here.s);

  const fareCost = CFG.freeRoam?.recoveryFareCost || 20;
  const hpCost = CFG.freeRoam?.recoveryHpCost || 5;
  game.fare = Math.max(0, (game.fare || 0) - fareCost);
  game.hp = Math.max(10, (game.hp || 100) - hpCost);

  placeBus();
  say("হেল্পার", "রাস্তায় তুললাম ওস্তাদ, সাবধানে চালান!", 2.5, true);
  playBrakeFao();
  game.shake = 0.35;
}

