// The player's bus: its 3D model, arcade driving physics, and fuel use.
import * as THREE from "three";
import { CFG } from "./config.js";
import { clamp, pick, rnd } from "./utils.js";
import { scene, box, plate } from "./world.js";
import { input } from "./input.js";
import { game } from "./state.js";
import { emit } from "./events.js";
import { SEGS, here, sample, place, fromProgress, progressOf } from "./map.js";
import { SLOGANS, COMPANIES, PLATES } from "./data/slogans.bn.js";
import { playKhelaHobe } from "./audio.js";
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

const B = CFG.bus;

// The bus is built in layers so the look can move without moving the physics:
//   bus   -> position on the road (physics) + turning of the nose (yaw)
//   body  -> lean in turns (roll) and dip on braking (pitch)
//   wheels stay under `bus`, so they never lean with the body.
export const bus = new THREE.Group();
const body = new THREE.Group();
bus.add(body);

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

/** Build the green Dhaka local bus out of simple boxes. */
function buildBus() {
  body.add(box(2.6, 2.3, 7, 0x1f8a44, 0, 1.5, 0));       // vibrant emerald Dhaka bus body
  body.add(box(2.62, .45, 7.02, 0xffc21a, 0, .95, 0));   // vibrant golden yellow stripe
  body.add(box(2.62, .28, 7.04, 0xb71c1c, 0, .56, 0));   // lower red Dhaka bus skirt
  body.add(box(2.64, .8, 5.8, 0x263238, 0, 2.2, .3));    // side windows
  body.add(box(2.2, .8, .05, 0x263238, 0, 2.2, -3.52));  // windscreen
  body.add(box(2.0, .62, .05, 0x263238, 0, 2.3, 3.51));  // rear window
  body.add(box(2.4, .15, 6.8, 0xf5f5f5, 0, 2.72, 0));    // clean white roof

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
buildBus();
scene.add(bus);

const pos = { x: 0, y: 0, z: 0, yaw: 0, k: 0 }; // reused road sample
let lastMorKey = "";

/** Put the bus on the main road at a journey progress value, facing along the road. */
export function resetBus(progress = 0) {
  fromProgress(progress, here);
  here.prev = -1;
  game.lat = -2.5;
  game.yaw = 0;
  game.prog = progress;
  game.busY = 0;
  game.busVy = 0;
  game.wrongWay = false;
  lastMorKey = "";
  if (SEGS[here.seg]?.mor) game.morName = SEGS[here.seg].mor;
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
  place(bus, here.seg, here.s, game.lat, game.busY || 0, -game.yaw);
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

/** Autopilot demo mode while the title screen is shown behind the menu. */
export function updateAutopilot(dt) {
  game.speed = 16;
  game.boostT = 0;
  game.accel = 0;
  const targetLat = -2.6 + Math.sin(game.time * 0.55) * 1.4;
  game.vx = (targetLat - game.lat) * 2.2;
  game.lat += game.vx * dt;
  game.yaw = clamp(game.vx * 0.04, -0.25, 0.25);
  const ds = game.speed * dt;
  here.s += ds;
  while (here.s > SEGS[here.seg].len) {
    if (!SEGS[here.seg].next.length) {
      fromProgress(0, here);
      break;
    }
    here.s -= SEGS[here.seg].len;
    here.prev = here.seg;
    here.seg = SEGS[here.seg].next[0];
  }
  game.prog = progressOf(here.seg, here.s);
  game.dist += ds;
  placeBus();
}

/**
 * One physics step for the bus: boost, speed, steering, road edge, fuel, moving along the road.
 * @returns {number} distance travelled this step
 */
export function updateBus(dt) {
  const F = CFG.fuel;
  // After a heavy crash (or when surrounded) the driver has lost control: no steering, full brake.
  const ctl = game.crashing || game.caught ? CRASHED : input;
  const hasFuel = game.fuel > 0;

  // Boost: holding the key keeps the timer full; after release it runs out by itself.
  if (ctl.boost && hasFuel) { if (game.boostT <= 0 && Math.random() < 0.3) playKhelaHobe(); game.boostT = B.boostHold; }
  else game.boostT = Math.max(0, game.boostT - dt);
  const boosting = game.boostT > 0 && hasFuel;

  // While boosting the bus drives itself, so the player only needs to steer.
  const throttle = boosting ? 1 : ctl.throttle;
  const top = boosting ? B.boostSpeed : B.maxSpeed;
  const v = game.speed;
  // Engine pull fades out near top speed, like a real heavy vehicle.
  const pull = hasFuel ? (B.accel + (boosting ? B.boostAccel : 0)) * throttle * Math.max(0, 1 - (v / top) ** 3) : 0;
  const drag = (hasFuel ? B.rollDrag : B.emptyTankDrag) + B.airDrag * v * v;
  let speed = Math.max(0, v + (pull - B.brake * ctl.brake - drag) * dt);
  // After a boost ends, ease back down to normal top speed instead of snapping.
  if (!boosting && speed > B.maxSpeed) speed = Math.max(B.maxSpeed, speed - B.overSpeedDecel * dt);
  game.accel = (speed - v) / dt;
  game.speed = speed;

  // Turning: the bus has a heading (game.yaw, measured from the road's direction).
  // Steering turns it, faster at speed but with a wider turning circle, like a heavy bus.
  // When the road bends, the road turns under the bus, so you must steer into the bend.
  sample(here.seg, here.s, pos);
  const radius = B.turnRadiusMin + speed * B.turnRadiusPerSpeed;
  const turnRate = ctl.steer * speed / radius;
  game.yaw += (turnRate - pos.k * speed * Math.cos(game.yaw)) * dt;
  // Arcade help: with no steering the bus slowly lines up with the road again.
  if (Math.abs(ctl.steer) < .1) game.yaw = approach(game.yaw, 0, B.alignRate, dt);
  game.yaw = clamp(game.yaw, -B.maxRelYaw, B.maxRelYaw);

  const S = SEGS[here.seg];
  game.vx = speed * Math.sin(game.yaw);
  let x = game.lat + game.vx * dt;
  // Road edge: past the edge the kerb pushes the nose back and scrapes off some speed.
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

  // Move along the road; at the end of a piece, continue on the next one (or the branch we chose).
  const prevS = here.s;
  const ds = game.speed * Math.cos(game.yaw) * dt;
  here.s += ds;

  // Check if we crossed a named Dhaka crossroad (মোড়) along the current segment.
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

  // Wrong-way detection: driving on the right side of the median island (oncoming traffic lanes).
  game.wrongWay = SEGS[here.seg].half >= 6 && game.lat > 0.75;

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
    body.position.y = game.running && game.busY === 0 ? Math.sin(game.dist * 1.9) * .025 : 0;
  }

  const spin = game.speed * dt / B.wheelRadius; // rolling without slipping: angle = distance / radius
  for (const w of wheels) w.rotation.x -= spin;

  // Swinging rear tassels react to sideways steering and road vibration.
  const sway = clamp(-game.vx * .045, -.45, .45) + Math.sin(game.time * 7) * .06;
  for (const t of tassels) {
    t.rotation.z = sway;
    t.rotation.x = .08 + Math.min(.35, game.speed * .006);
  }

  // Front door opens at bus stops or while slow near the stand, and the helper slaps the side panel.
  const doorOpen = (game.onMark === "stop" || (game.running && game.speed < CFG.stops.boardMaxSpeed && game.dist < 18)) ? 1.15 : 0.15;
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

  // Exhaust smoke puffs from the rear right tailpipe (faster when boosting or accelerating).
  if (game.running && dt > 0) {
    const boosting = game.boostT > 0;
    const interval = boosting ? 0.045 : game.accel > 1 ? 0.09 : 0.18;
    smokeTimer -= dt;
    if (smokeTimer <= 0) {
      smokeTimer = interval;
      const p = exhaustPool.find(it => !it.active);
      if (p) {
        bus.updateMatrixWorld();
        tailWorld.set(0.95, 0.48, 3.65).applyMatrix4(bus.matrixWorld);
        p.active = true; p.t = 0; p.maxT = boosting ? 0.55 : 0.42;
        p.x = tailWorld.x + rnd(-.1, .1); p.y = tailWorld.y; p.z = tailWorld.z + rnd(-.1, .1);
        p.vy = boosting ? 2.1 : 1.3;
        p.m.position.set(p.x, p.y, p.z);
        p.m.scale.setScalar(boosting ? 1.2 : 0.75);
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

  // Reveal staged window cracks as Bus HP drops.
  const thresholds = [75, 45, 20];
  for (let i = 0; i < cracks.length; i++) {
    const show = game.hp < thresholds[i];
    for (const m of cracks[i]) if (m.visible !== show) m.visible = show;
  }
}
