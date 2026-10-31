// Section 2.4: Comprehensive Particle & Hit Effects System
// 1. Debris fragments (InstancedMesh, 280 shards tumbling & bouncing)
// 2. Additive glowing sparks (160 Points with fiery radial gradient)
// 3. Dramatic vehicle chunks (doors, wheels with rims, side mirrors, chrome bumpers)
// 4. Cartoon dizzy stars (dizzies orbiting stunned pedestrians/drivers)
// 5. 3D comic action words ("ধপাস!", "ঠাস!", "দুম!", "ব্যাং!", "ক্র্যাশ!", "আউচ!")
// 6. Impact flashes & expanding dust puffs
// 7. Flying loose items & flip-flops (tea cups, smartphones, sandals, umbrellas, veggie baskets)
// 8. Ground splat decals (oil slicks, tire skid scrapes, red paan juice splashes)
import * as THREE from "three";
import { rnd, pick, clamp } from "./utils.js";
import { applyPolygonOffset } from "./shaders.js";

let effectScene = null;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

/* ====== 1. Debris Particle System (InstancedMesh - 280 fragments) ====== */
const MAX_DEBRIS = 280;
const debrisGeo = new THREE.DodecahedronGeometry(0.16, 0);
debrisGeo.userData = { isShared: true };
const debrisMat = new THREE.MeshLambertMaterial({ vertexColors: true });
debrisMat.userData = { isShared: true };
let debrisMesh = null;

const debrisPool = Array.from({ length: MAX_DEBRIS }, () => ({
  active: false,
  x: 0, y: 0, z: 0,
  vx: 0, vy: 0, vz: 0,
  rx: 0, ry: 0, rz: 0,
  vrx: 0, vry: 0, vrz: 0,
  scale: 1.0,
  baseScale: 1.0,
  life: 0,
  maxLife: 1.0,
}));

const DEBRIS_PALETTE = [
  0xfdd835, 0x2e7d32, 0xe53935, 0x1e88e5, 0x263238,
  0xffffff, 0xff9800, 0x8d6e63, 0x80deea, 0x4a148c
];

/* ====== 2. Glowing Spark Particles (160 Points) ====== */
const MAX_SPARKS = 160;
const sparkPositions = new Float32Array(MAX_SPARKS * 3);
const sparkColors = new Float32Array(MAX_SPARKS * 3);
let sparkGeo = null;
let sparkPoints = null;

const sparkPool = Array.from({ length: MAX_SPARKS }, () => ({
  active: false,
  x: 0, y: 0, z: 0,
  vx: 0, vy: 0, vz: 0,
  r: 1, g: 1, b: 0.5,
  life: 0,
  maxLife: 0.35,
  size: 0.8,
}));

function createSparkTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255, 255, 240, 1.0)");
  g.addColorStop(0.25, "rgba(255, 215, 0, 0.95)");
  g.addColorStop(0.6, "rgba(255, 87, 34, 0.55)");
  g.addColorStop(1, "rgba(255, 0, 0, 0.0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.userData = { isShared: true };
  return tex;
}

/* ====== 3. Dramatic Vehicle Chunks (Doors, Wheels, Mirrors, Bumpers) ====== */
const chunkPool = [];
const CHUNK_TYPES = ["door", "wheel", "mirror", "bumper", "rickshawWheel"];

function buildChunkModel(type) {
  const g = new THREE.Group();
  if (type === "door") {
    // Car door panel with window cutout and handle
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 0.08), new THREE.MeshLambertMaterial({ color: 0x1e88e5 }));
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.38, 0.09), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    win.position.set(0, 0.22, 0);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.12), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    handle.position.set(0.24, -0.06, 0);
    g.add(panel, win, handle);
    g.userData.tintMesh = panel;
  } else if (type === "wheel") {
    // Car tyre + silver rim
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12), new THREE.MeshLambertMaterial({ color: 0x151515 }));
    tyre.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.25, 8), new THREE.MeshLambertMaterial({ color: 0xd0d0d0 }));
    rim.rotation.z = Math.PI / 2;
    g.add(tyre, rim);
  } else if (type === "mirror") {
    // Snapped side-mirror
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.18), new THREE.MeshLambertMaterial({ color: 0x1a237e }));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), new THREE.MeshBasicMaterial({ color: 0xe0f7fa }));
    glass.position.set(0, 0, 0.095);
    g.add(shell, glass);
    g.userData.tintMesh = shell;
  } else if (type === "bumper") {
    // Long steel bumper bar with yellow-black hazard stripes
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.16), new THREE.MeshLambertMaterial({ color: 0xb0bec5 }));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 0.17), new THREE.MeshLambertMaterial({ color: 0xfbc02d }));
    g.add(bar, stripe);
  } else if (type === "rickshawWheel") {
    // Large spoke cycle wheel
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.06, 14), new THREE.MeshLambertMaterial({ color: 0x212121 }));
    rim.rotation.z = Math.PI / 2;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), new THREE.MeshLambertMaterial({ color: 0xbdbdbd }));
    axle.rotation.z = Math.PI / 2;
    g.add(rim, axle);
  }
  g.visible = false;
  return g;
}

/* ====== 4. Cartoon Dizzy Stars (dizzies) ====== */
const dizzyPool = [];
const starGeo = new THREE.ConeGeometry(0.08, 0.22, 5);
starGeo.userData = { isShared: true };
const starMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b });
starMat.userData = { isShared: true };

function buildDizzyRig() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(starGeo, starMat);
    s.rotation.x = Math.PI / 2;
    g.add(s);
  }
  g.visible = false;
  return g;
}

/* ====== 5. 3D Comic Sound Words (3D Sprites) ====== */
const COMIC_WORDS = [
  { text: "ধপাস!", bg: "#ffd600", textCol: "#d50000" },
  { text: "ঠাস!", bg: "#ff6d00", textCol: "#ffffff" },
  { text: "দুম!", bg: "#d50000", textCol: "#ffff00" },
  { text: "ব্যাং!", bg: "#00e676", textCol: "#000000" },
  { text: "ক্র্যাশ!", bg: "#2979ff", textCol: "#ffffff" },
  { text: "আউচ!", bg: "#aa00ff", textCol: "#ffe57f" },
  { text: "ওরে বাবা!", bg: "#ff1744", textCol: "#ffffff" },
  { text: "আমার ফল!", bg: "#ff9100", textCol: "#ffffff" },
  { text: "আমার ইলিশ!", bg: "#00b0ff", textCol: "#000000" },
  { text: "ঐ মিয়া!", bg: "#e91e63", textCol: "#ffffff" },
];

const wordMats = [];
function createWordMaterials() {
  if (wordMats.length > 0) return;
  for (const item of COMIC_WORDS) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    const ctx = c.getContext("2d");

    // Jagged comic starburst background
    ctx.save();
    ctx.translate(128, 64);
    ctx.fillStyle = item.bg;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 6;
    ctx.beginPath();
    const spikes = 12;
    for (let i = 0; i < spikes * 2; i++) {
      const rad = (i % 2 === 0) ? 60 : 36;
      const ang = (i / (spikes * 2)) * Math.PI * 2;
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * (rad * 0.58);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Bold Bengali comic text with black 3D drop shadow
    ctx.font = "bold 38px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#000000";
    ctx.fillText(item.text, 131, 67);
    ctx.fillText(item.text, 130, 66);

    ctx.fillStyle = item.textCol;
    ctx.fillText(item.text, 128, 64);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { isShared: true };
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    mat.userData = { isShared: true };
    wordMats.push(mat);
  }
}

const wordPool = [];

/* ====== 6. Flashes & Dust Puffs ====== */
const flashGeo = new THREE.SphereGeometry(1.6, 8, 8);
flashGeo.userData = { isShared: true };
const flashMat = new THREE.MeshBasicMaterial({
  color: 0xffffee,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
flashMat.userData = { isShared: true };
let flashMesh = null;
let flashTimer = 0;

const dustGeo = new THREE.IcosahedronGeometry(0.3, 0);
dustGeo.userData = { isShared: true };
const dustMat = new THREE.MeshLambertMaterial({
  color: 0x9e8b74,
  transparent: true,
  opacity: 0.55,
});
dustMat.userData = { isShared: true };
const dustPool = [];

/* ====== 7. Flying Loose Items & Flip-Flops ====== */
const LOOSE_TYPES = ["teacup", "phone", "sandal", "umbrella", "veggieBasket", "banana", "fish"];
const loosePool = [];

function buildLooseModel(type) {
  const g = new THREE.Group();
  if (type === "teacup") {
    // Terracotta clay cup
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0xd7ccc8 }));
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 8), new THREE.MeshLambertMaterial({ color: 0x5d4037 }));
    tea.position.y = 0.09;
    g.add(cup, tea);
  } else if (type === "phone") {
    // Smartphone
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.02), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.022), new THREE.MeshBasicMaterial({ color: 0x64b5f6 }));
    g.add(body, screen);
  } else if (type === "sandal") {
    // Classic blue Bata rubber flip-flop
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.38), new THREE.MeshLambertMaterial({ color: 0x1565c0 }));
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    strap.position.set(0, 0.05, 0.06);
    g.add(sole, strap);
  } else if (type === "umbrella") {
    // Black folding umbrella with curved handle
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.45, 8), new THREE.MeshLambertMaterial({ color: 0x212121 }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 6), new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
    pole.position.y = -0.15;
    g.add(canopy, pole);
  } else if (type === "veggieBasket") {
    // Round bamboo basket with flying red tomatoes and green cabbages
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.24, 10), new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
    for (let i = 0; i < 4; i++) {
      const veg = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0xe53935 : 0x43a047 }));
      veg.position.set(rnd(-0.15, 0.15), 0.14, rnd(-0.15, 0.15));
      g.add(veg);
    }
    g.add(basket);
  } else if (type === "banana") {
    // Yellow ripe banana
    const ban = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.36, 6), new THREE.MeshLambertMaterial({ color: 0xffeb3b }));
    ban.rotation.z = 0.35;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshLambertMaterial({ color: 0x4e342e }));
    tip.position.y = 0.18;
    g.add(ban, tip);
  } else if (type === "fish") {
    // Silver Hilsa fish (রূপালী ইলিশ)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.44, 7), new THREE.MeshLambertMaterial({ color: 0xcfd8dc }));
    body.rotation.z = Math.PI / 2;
    body.scale.set(1, 0.35, 1);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.14), new THREE.MeshLambertMaterial({ color: 0xb0bec5 }));
    tail.position.x = 0.24;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(-0.16, 0.03, 0.03);
    g.add(body, tail, eye);
  }
  g.visible = false;
  return g;
}

/* ====== 8. Ground Splat Decals ====== */
const splatPool = [];
const splatGeo = new THREE.PlaneGeometry(1.4, 1.4);
splatGeo.userData = { isShared: true };

function createSplatTexture(type) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const cx = 64, cy = 64;

  if (type === "oil") {
    // Dark bitumen oil puddle with droplets
    ctx.fillStyle = "rgba(18, 16, 14, 0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(cx + rnd(-50, 50), cy + rnd(-50, 50), rnd(6, 16), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === "skid") {
    // Black linear rubber tyre skid streak
    ctx.fillStyle = "rgba(15, 15, 15, 0.82)";
    ctx.fillRect(20, 48, 88, 32);
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(10 + i * 16, 42, 12, 44);
    }
  } else if (type === "paan") {
    // Dramatic red betel-leaf paan juice splash
    ctx.fillStyle = "rgba(163, 0, 0, 0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(cx + rnd(-48, 48), cy + rnd(-48, 48), rnd(4, 12), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.userData = { isShared: true };
  return tex;
}

const SPLAT_MATS = {
  oil: applyPolygonOffset(new THREE.MeshBasicMaterial({ map: createSplatTexture("oil"), transparent: true, depthWrite: false }), -2.0, -4.0),
  skid: applyPolygonOffset(new THREE.MeshBasicMaterial({ map: createSplatTexture("skid"), transparent: true, depthWrite: false }), -2.0, -4.0),
  paan: applyPolygonOffset(new THREE.MeshBasicMaterial({ map: createSplatTexture("paan"), transparent: true, depthWrite: false }), -2.0, -4.0),
};
for (const k in SPLAT_MATS) SPLAT_MATS[k].userData = { isShared: true };

/* ====== System Initialization & Reset ====== */

export function initEffects(scene) {
  effectScene = scene;

  // 1. Debris InstancedMesh
  debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, MAX_DEBRIS);
  debrisMesh.frustumCulled = false;
  debrisMesh.userData = { isShared: true };
  for (let i = 0; i < MAX_DEBRIS; i++) {
    dummy.position.set(0, -999, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    debrisMesh.setMatrixAt(i, dummy.matrix);
    debrisMesh.setColorAt(i, tmpColor.setHex(0xffffff));
  }
  debrisMesh.instanceMatrix.needsUpdate = true;
  if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;
  scene.add(debrisMesh);

  // 2. Sparks Points
  sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkColors, 3));
  const sparkMat = new THREE.PointsMaterial({
    map: createSparkTexture(),
    size: 0.75,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });
  sparkMat.userData = { isShared: true };
  sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);

  // 3. Vehicle Chunks Pool (24 meshes)
  for (let i = 0; i < 24; i++) {
    const type = CHUNK_TYPES[i % CHUNK_TYPES.length];
    const m = buildChunkModel(type);
    scene.add(m);
    chunkPool.push({ m, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, t: 0, maxT: 1.5 });
  }

  // 4. Dizzy Stars Pool (6 rigs)
  for (let i = 0; i < 6; i++) {
    const rig = buildDizzyRig();
    scene.add(rig);
    dizzyPool.push({ rig, active: false, target: null, x: 0, y: 0, z: 0, ang: 0, timer: 0 });
  }

  // 5. 3D Comic Words Pool (12 sprites)
  createWordMaterials();
  for (let i = 0; i < 12; i++) {
    const mat = wordMats[i % wordMats.length];
    const sp = new THREE.Sprite(mat);
    sp.scale.set(2.4, 1.2, 1);
    sp.visible = false;
    scene.add(sp);
    wordPool.push({ sp, active: false, x: 0, y: 0, z: 0, vy: 0, timer: 0, maxT: 0.85 });
  }

  // 6. Flash mesh & Dust Pool (24 meshes)
  flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.visible = false;
  scene.add(flashMesh);

  for (let i = 0; i < 24; i++) {
    const dm = new THREE.Mesh(dustGeo, dustMat);
    dm.visible = false;
    scene.add(dm);
    dustPool.push({ dm, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, scale: 0.5, t: 0, maxT: 0.7 });
  }

  // 7. Loose Items Pool (20 meshes)
  for (let i = 0; i < 20; i++) {
    const type = LOOSE_TYPES[i % LOOSE_TYPES.length];
    const lm = buildLooseModel(type);
    scene.add(lm);
    loosePool.push({ lm, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, t: 0, maxT: 2.2 });
  }

  // 8. Ground Splats Pool (30 meshes)
  const splatTypes = ["oil", "skid", "paan"];
  for (let i = 0; i < 30; i++) {
    const stype = splatTypes[i % splatTypes.length];
    const sm = new THREE.Mesh(splatGeo, SPLAT_MATS[stype]);
    sm.rotation.x = -Math.PI / 2;
    sm.visible = false;
    scene.add(sm);
    splatPool.push({ sm, active: false, x: 0, z: 0, timer: 0 });
  }
}

export function resetEffects() {
  // Clear debris
  for (let i = 0; i < MAX_DEBRIS; i++) {
    debrisPool[i].active = false;
    dummy.position.set(0, -999, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    if (debrisMesh) debrisMesh.setMatrixAt(i, dummy.matrix);
  }
  if (debrisMesh) {
    debrisMesh.instanceMatrix.needsUpdate = true;
  }

  // Clear sparks
  for (let i = 0; i < MAX_SPARKS; i++) {
    sparkPool[i].active = false;
    sparkPositions[i * 3 + 1] = -999;
  }
  if (sparkGeo) sparkGeo.attributes.position.needsUpdate = true;

  // Clear chunks, words, dizzies, dust, loose, splats
  for (const c of chunkPool) { c.active = false; c.m.visible = false; }
  for (const w of wordPool) { w.active = false; w.sp.visible = false; }
  for (const d of dizzyPool) { d.active = false; d.rig.visible = false; d.target = null; }
  for (const du of dustPool) { du.active = false; du.dm.visible = false; }
  for (const l of loosePool) { l.active = false; l.lm.visible = false; }
  for (const s of splatPool) { s.active = false; s.sm.visible = false; }
  if (flashMesh) flashMesh.visible = false;
  flashTimer = 0;
}

/* ====== Spawn Triggers ====== */

/** Spawns explosive debris fragments scattering from collision coordinates. */
export function spawnDebris(x, y, z, count = 20, hexColor = null) {
  let spawned = 0;
  for (let i = 0; i < MAX_DEBRIS; i++) {
    const d = debrisPool[i];
    if (d.active) continue;
    d.active = true;
    d.x = x + rnd(-0.25, 0.25);
    d.y = y + rnd(-0.15, 0.35);
    d.z = z + rnd(-0.25, 0.25);
    d.vx = rnd(-7.5, 7.5);
    d.vy = rnd(4.2, 9.5);
    d.vz = rnd(-7.5, 7.5);
    d.rx = rnd(0, 6.28); d.ry = rnd(0, 6.28); d.rz = rnd(0, 6.28);
    d.vrx = rnd(-14, 14); d.vry = rnd(-14, 14); d.vrz = rnd(-14, 14);
    d.baseScale = rnd(0.7, 1.35);
    d.scale = d.baseScale;
    d.maxLife = rnd(1.2, 2.2);
    d.life = d.maxLife;

    const col = hexColor || pick(DEBRIS_PALETTE);
    tmpColor.setHex(col);
    if (debrisMesh && debrisMesh.instanceColor) debrisMesh.setColorAt(i, tmpColor);

    if (++spawned >= count) break;
  }
  if (debrisMesh && debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;
}

/** Spawns glowing high-velocity sparks with additive blending. */
export function spawnSparks(x, y, z, count = 25, dirX = 0, dirZ = 0) {
  let spawned = 0;
  for (let i = 0; i < MAX_SPARKS; i++) {
    const s = sparkPool[i];
    if (s.active) continue;
    s.active = true;
    s.x = x + rnd(-0.18, 0.18);
    s.y = y + rnd(-0.1, 0.2);
    s.z = z + rnd(-0.18, 0.18);
    s.vx = dirX * 5.0 + rnd(-8.5, 8.5);
    s.vy = rnd(3.5, 11.0);
    s.vz = dirZ * 5.0 + rnd(-8.5, 8.5);
    s.r = 1.0; s.g = rnd(0.7, 1.0); s.b = rnd(0.2, 0.6);
    s.maxLife = rnd(0.25, 0.45);
    s.life = s.maxLife;

    if (++spawned >= count) break;
  }
}

/** Spawns detached vehicle parts (door, wheel, mirror, bumper). */
export function spawnVehicleChunks(x, y, z, count = 2, tintHex = null) {
  let spawned = 0;
  for (const c of chunkPool) {
    if (c.active) continue;
    c.active = true;
    c.x = x + rnd(-0.35, 0.35);
    c.y = y + rnd(0.3, 0.8);
    c.z = z + rnd(-0.35, 0.35);
    c.vx = rnd(-6.5, 6.5);
    c.vy = rnd(5.0, 9.8);
    c.vz = rnd(-6.5, 6.5);
    c.rx = rnd(-10, 10);
    c.ry = rnd(-10, 10);
    c.rz = rnd(-10, 10);
    c.maxT = rnd(1.4, 2.2);
    c.t = 0;
    c.m.position.set(c.x, c.y, c.z);
    c.m.visible = true;

    if (tintHex && c.m.userData.tintMesh) {
      c.m.userData.tintMesh.material.color.setHex(tintHex);
    }

    if (++spawned >= count) break;
  }
}

/** Spawns 3D comic sound word sprite ("ধপাস!", "ঠাস!", "দুম!", etc.). */
export function spawnComicWord(x, y, z, preferredIndex = -1) {
  const w = wordPool.find(it => !it.active);
  if (!w) return;
  const idx = preferredIndex >= 0 ? (preferredIndex % wordMats.length) : Math.floor(Math.random() * wordMats.length);
  w.sp.material = wordMats[idx];
  w.active = true;
  w.x = x + rnd(-0.3, 0.3);
  w.y = y + 1.25;
  w.z = z + rnd(-0.3, 0.3);
  w.vy = 2.1;
  w.t = 0;
  w.maxT = 0.85;
  w.sp.position.set(w.x, w.y, w.z);
  w.sp.scale.set(0.1, 0.1, 1);
  w.sp.material.opacity = 1.0;
  w.sp.visible = true;
}

/** Attaches rotating dizzy stars over a knocked pedestrian / driver. */
export function spawnDizzyStars(targetPosOrMesh, duration = 2.5) {
  const d = dizzyPool.find(it => !it.active);
  if (!d) return;
  d.active = true;
  d.target = targetPosOrMesh;
  if (targetPosOrMesh.x !== undefined) {
    d.x = targetPosOrMesh.x; d.y = (targetPosOrMesh.y || 1.0) + 1.25; d.z = targetPosOrMesh.z;
  } else if (targetPosOrMesh.position) {
    d.x = targetPosOrMesh.position.x; d.y = targetPosOrMesh.position.y + 1.25; d.z = targetPosOrMesh.position.z;
  }
  d.ang = 0;
  d.timer = duration;
  d.rig.position.set(d.x, d.y, d.z);
  d.rig.visible = true;
}

/** Spawns expanding ground dust puffs. */
export function spawnDustPuffs(x, y, z, count = 6) {
  let spawned = 0;
  for (const du of dustPool) {
    if (du.active) continue;
    du.active = true;
    du.x = x + rnd(-0.4, 0.4);
    du.y = Math.max(0.12, y + rnd(0.05, 0.25));
    du.z = z + rnd(-0.4, 0.4);
    du.vx = rnd(-3.5, 3.5);
    du.vy = rnd(0.8, 2.2);
    du.vz = rnd(-3.5, 3.5);
    du.scale = rnd(0.4, 0.7);
    du.maxT = rnd(0.5, 0.8);
    du.t = 0;
    du.dm.position.set(du.x, du.y, du.z);
    du.dm.scale.setScalar(du.scale);
    du.dm.visible = true;
    if (++spawned >= count) break;
  }
}

/** Spawns flying authentic loose items (tea cups, phones, sandals, umbrellas, veggie baskets). */
export function spawnLooseItems(x, y, z, count = 3) {
  let spawned = 0;
  for (const l of loosePool) {
    if (l.active) continue;
    l.active = true;
    l.x = x + rnd(-0.35, 0.35);
    l.y = y + rnd(0.4, 1.1);
    l.z = z + rnd(-0.35, 0.35);
    l.vx = rnd(-5.5, 5.5);
    l.vy = rnd(4.5, 8.8);
    l.vz = rnd(-5.5, 5.5);
    l.rx = rnd(-12, 12);
    l.ry = rnd(-12, 12);
    l.rz = rnd(-12, 12);
    l.maxT = rnd(1.8, 2.5);
    l.t = 0;
    l.lm.position.set(l.x, l.y, l.z);
    l.lm.visible = true;
    if (++spawned >= count) break;
  }
}

/** Spawns asphalt ground decals (oil puddle, skid rubber, red paan splash). */
export function spawnGroundSplat(x, z, type = "oil") {
  const s = splatPool.find(it => !it.active);
  if (!s) return;
  s.active = true;
  s.x = x; s.z = z;
  s.timer = 12.0; // stays on road for 12 seconds
  s.sm.position.set(x, 0.02, z);
  s.sm.rotation.z = rnd(0, 6.28);
  s.sm.scale.setScalar(rnd(0.85, 1.4));
  s.sm.visible = true;
}

/** Master hit trigger: launches appropriate visual effects based on collision type. */
export function spawnCrashEffects({
  x = 0, y = 1.0, z = 0,
  type = "car",
  severity = 1.0,
  isPedestrian = false,
  color = null,
  vx = 0, vz = 0,
}) {
  // 1. Flash burst on heavy or medium hit
  if (flashMesh && severity > 0.4) {
    flashMesh.position.set(x, y, z);
    flashMesh.scale.setScalar(severity > 0.8 ? 1.6 : 1.1);
    flashMesh.visible = true;
    flashTimer = 0.09;
  }

  // 2. Explosive Debris fragments (InstancedMesh)
  const debrisCount = Math.min(45, Math.floor(14 * severity + 10));
  spawnDebris(x, y, z, debrisCount, color);

  // 3. Fiery Additive Sparks (Points)
  const sparkCount = Math.min(48, Math.floor(18 * severity + 12));
  spawnSparks(x, y, z, sparkCount, vx * 0.3, vz * 0.3);

  // 4. Ground Dust Puffs
  spawnDustPuffs(x, y, z, Math.floor(6 * severity + 3));

  // 5. 3D Comic Words popping into the scene
  let wordIdx = -1;
  if (isPedestrian) wordIdx = 5; // "আউচ!"
  else if (type === "truck" || type === "bus" || type === "pillar") wordIdx = 2; // "দুম!"
  else if (type === "mirror") wordIdx = 1; // "ঠাস!"
  else if (severity > 0.8) wordIdx = 0; // "ধপাস!"
  spawnComicWord(x, y, z, wordIdx);

  // 6. Flying vehicle chunks
  if (!isPedestrian && type !== "stall" && type !== "manhole") {
    const chunkCount = severity > 0.8 ? 3 : 2;
    spawnVehicleChunks(x, y, z, chunkCount, color);
  }

  // 7. Loose Items (Tea cups, sandals, smartphones, umbrellas)
  if (isPedestrian || type === "stall" || type === "rickshaw" || type === "bike") {
    spawnLooseItems(x, y, z, type === "stall" ? 5 : 3);
  }

  // 8. Ground road splats
  if (type === "truck" || type === "bus" || severity > 0.8) {
    spawnGroundSplat(x, z, "oil");
  } else if (isPedestrian || Math.random() < 0.35) {
    spawnGroundSplat(x, z, "paan");
  } else {
    spawnGroundSplat(x, z, "skid");
  }
}

/** Continuous scrape sparks when bus side grazes barriers or vehicles. */
export function spawnScrapeSparks(x, y, z, count = 8, dirX = 0, dirZ = 0) {
  spawnSparks(x, y, z, count, dirX, dirZ);
  if (Math.random() < 0.25) {
    spawnDebris(x, y, z, 3, 0xffd54f);
  }
}

/** Skid tire smoke puffs during sudden braking or sharp drifting. */
export function spawnSkidPuff(x, y, z) {
  spawnDustPuffs(x, y, z, 2);
}

/* ====== Per-Frame Animation Tick ====== */

export function updateEffects(dt) {
  // 1. Update Flash
  if (flashTimer > 0) {
    flashTimer -= dt;
    if (flashTimer <= 0 && flashMesh) flashMesh.visible = false;
  }

  // 2. Update Debris InstancedMesh
  let debrisUpdated = false;
  for (let i = 0; i < MAX_DEBRIS; i++) {
    const d = debrisPool[i];
    if (!d.active) continue;

    d.life -= dt;
    if (d.life <= 0) {
      d.active = false;
      dummy.position.set(0, -999, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      if (debrisMesh) debrisMesh.setMatrixAt(i, dummy.matrix);
      debrisUpdated = true;
      continue;
    }

    // Gravity & Velocity
    d.vy -= 18.0 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;

    // Ground bounce off asphalt
    if (d.y <= 0.08) {
      d.y = 0.08;
      d.vy = -d.vy * 0.42;
      d.vx *= 0.72;
      d.vz *= 0.72;
    }

    // Tumble rotation
    d.rx += d.vrx * dt;
    d.ry += d.vry * dt;
    d.rz += d.vrz * dt;

    // Fade out by shrinking in final fraction of life
    const u = d.life / d.maxLife;
    d.scale = d.baseScale * Math.min(1.0, u * 1.5);

    dummy.position.set(d.x, d.y, d.z);
    dummy.rotation.set(d.rx, d.ry, d.rz);
    dummy.scale.setScalar(d.scale);
    dummy.updateMatrix();
    if (debrisMesh) debrisMesh.setMatrixAt(i, dummy.matrix);
    debrisUpdated = true;
  }
  if (debrisUpdated && debrisMesh) debrisMesh.instanceMatrix.needsUpdate = true;

  // 3. Update Sparks Points
  let sparkUpdated = false;
  for (let i = 0; i < MAX_SPARKS; i++) {
    const s = sparkPool[i];
    if (!s.active) {
      sparkPositions[i * 3 + 1] = -999;
      continue;
    }

    s.life -= dt;
    if (s.life <= 0) {
      s.active = false;
      sparkPositions[i * 3 + 1] = -999;
      sparkUpdated = true;
      continue;
    }

    s.vy -= 22.0 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;

    if (s.y <= 0.04) {
      s.y = 0.04;
      s.vy = -s.vy * 0.35;
      s.vx *= 0.65;
      s.vz *= 0.65;
    }

    // Decay from golden yellow to ember red
    const u = s.life / s.maxLife;
    const r = s.r * u;
    const g = s.g * (u * u);
    const b = s.b * (u * u * u);

    sparkPositions[i * 3] = s.x;
    sparkPositions[i * 3 + 1] = s.y;
    sparkPositions[i * 3 + 2] = s.z;

    sparkColors[i * 3] = r;
    sparkColors[i * 3 + 1] = g;
    sparkColors[i * 3 + 2] = b;

    sparkUpdated = true;
  }
  if (sparkUpdated && sparkGeo) {
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
  }

  // 4. Update Vehicle Chunks
  for (const c of chunkPool) {
    if (!c.active) continue;
    c.t += dt;
    if (c.t >= c.maxT) {
      c.active = false; c.m.visible = false;
      continue;
    }

    c.vy -= 18.0 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.z += c.vz * dt;

    if (c.y <= 0.12) {
      c.y = 0.12;
      c.vy = -c.vy * 0.38;
      c.vx *= 0.75;
      c.vz *= 0.75;
    }

    c.m.position.set(c.x, c.y, c.z);
    c.m.rotation.x += c.rx * dt;
    c.m.rotation.y += c.ry * dt;
    c.m.rotation.z += c.rz * dt;
  }

  // 5. Update 3D Comic Words
  for (const w of wordPool) {
    if (!w.active) continue;
    w.t += dt;
    if (w.t >= w.maxT) {
      w.active = false; w.sp.visible = false;
      continue;
    }

    const u = w.t / w.maxT;
    // Comic scale pop curve: pops up to 1.35 then settles at 1.05
    const pop = u < 0.25 ? (u / 0.25) * 1.35 : 1.35 - ((u - 0.25) / 0.75) * 0.3;
    w.sp.scale.set(2.4 * pop, 1.2 * pop, 1);

    w.y += w.vy * dt;
    w.vy = Math.max(0.4, w.vy - 3.5 * dt);
    w.sp.position.set(w.x, w.y, w.z);

    // Fade out towards the end
    w.sp.material.opacity = u > 0.65 ? (1.0 - (u - 0.65) / 0.35) : 1.0;
  }

  // 6. Update Dizzy Stars
  for (const d of dizzyPool) {
    if (!d.active) continue;
    d.timer -= dt;
    if (d.timer <= 0) {
      d.active = false; d.rig.visible = false; d.target = null;
      continue;
    }

    // Follow target if moving
    if (d.target) {
      if (d.target.position) {
        d.x = d.target.position.x;
        d.y = d.target.position.y + 1.25;
        d.z = d.target.position.z;
      } else if (d.target.x !== undefined) {
        d.x = d.target.x;
        d.y = (d.target.y || 1.0) + 1.25;
        d.z = d.target.z;
      }
    }

    d.ang += 8.5 * dt;
    d.rig.position.set(d.x, d.y, d.z);

    // 4 stars orbiting in a circle around the head
    const radius = 0.42;
    for (let sIdx = 0; sIdx < 4; sIdx++) {
      const starMesh = d.rig.children[sIdx];
      if (!starMesh) continue;
      const sa = d.ang + (sIdx * Math.PI) / 2;
      starMesh.position.set(
        Math.cos(sa) * radius,
        Math.sin(d.ang * 2.0 + sIdx) * 0.08,
        Math.sin(sa) * radius
      );
      starMesh.rotation.y = sa + Math.PI / 2;
    }
  }

  // 7. Update Dust Puffs
  for (const du of dustPool) {
    if (!du.active) continue;
    du.t += dt;
    if (du.t >= du.maxT) {
      du.active = false; du.dm.visible = false;
      continue;
    }

    const u = du.t / du.maxT;
    du.x += du.vx * dt;
    du.y += du.vy * dt;
    du.z += du.vz * dt;
    du.vx *= 0.94; du.vz *= 0.94;

    const curScale = du.scale * (1.0 + u * 2.2);
    du.dm.scale.setScalar(curScale);
    du.dm.position.set(du.x, du.y, du.z);
    du.dm.material.opacity = 0.55 * (1.0 - u);
  }

  // 8. Update Flying Loose Items (flip-flops, tea cups, phones, umbrellas)
  for (const l of loosePool) {
    if (!l.active) continue;
    l.t += dt;
    if (l.t >= l.maxT) {
      l.active = false; l.lm.visible = false;
      continue;
    }

    l.vy -= 16.0 * dt;
    l.x += l.vx * dt;
    l.y += l.vy * dt;
    l.z += l.vz * dt;

    if (l.y <= 0.08) {
      l.y = 0.08;
      l.vy = -l.vy * 0.32;
      l.vx *= 0.72;
      l.vz *= 0.72;
    }

    l.lm.position.set(l.x, l.y, l.z);
    l.lm.rotation.x += l.rx * dt;
    l.lm.rotation.y += l.ry * dt;
    l.lm.rotation.z += l.rz * dt;
  }

  // 9. Update Ground Splats
  for (const s of splatPool) {
    if (!s.active) continue;
    s.timer -= dt;
    if (s.timer <= 0) {
      s.active = false; s.sm.visible = false;
    }
  }
}

