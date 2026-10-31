// Renderer, scene, lights, shared mesh helpers, the curved Dhaka boulevards (from map.js),
// yellow-and-black striped kerbs & tree-lined centre medians, footpath hawker canopies,
// and multi-storey windowed Dhaka buildings with Bangla shop signboards.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";
import { SEGS, here, sample, place, ahead, progressOf, hitsAnyRoad } from "./map.js";
import { getProcessionBySegId } from "./data/events.js";
import {
  createAsphaltTex,
  createPaversTex,
  createBuildingMaterials,
  DHAKA_SHOP_DATA,
  createPlaidTex,
  createGamchhaTex,
  createSareeTex,
  createGenjiTex
} from "./textures.js";
import { attachBlackoutShader, disposeHierarchy, applyPolygonOffset, blackoutState } from "./shaders.js";

const W = CFG.world;

export const isMobile = typeof navigator !== "undefined" && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  (typeof window !== "undefined" && ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)) && window.innerWidth < 900)
);

/* ====== Renderer, scene, lights, cinematic ACES tonemapping & soft shadows ====== */
export const renderer = new THREE.WebGLRenderer({
  antialias: !isMobile,
  powerPreference: "high-performance"
});
renderer.setSize(innerWidth, innerHeight);
const defaultMaxPr = isMobile ? 1.5 : CFG.render.maxPixelRatio;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, defaultMaxPr));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(W.skyColor, W.fogNear, W.fogFar);

export const hemi = new THREE.HemisphereLight(0xffeedd, 0x556655, 1.1);
scene.add(hemi);

export const sun = new THREE.DirectionalLight(0xfff2cc, 1.8);
sun.position.set(20, 60, 20);
sun.castShadow = true;
const defaultShadowRes = isMobile ? 1024 : 2048;
sun.shadow.mapSize.set(defaultShadowRes, defaultShadowRes);
const sc = sun.shadow.camera;
sc.left = -45;
sc.right = 45;
sc.top = 45;
sc.bottom = -45;
sc.near = 1;
sc.far = 180;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

/* ====== Custom Atmospheric Sky Dome Shader with Sun Disk & Horizon Haze ====== */
export const skyUniforms = {
  top: { value: new THREE.Color(0x3b6d9e) },
  hor: { value: new THREE.Color(0xe8ad84) },
  sunCol: { value: new THREE.Color(0xffd285) },
  sunDir: { value: new THREE.Vector3(0.3, 0.7, -0.4).normalize() },
};

const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 top;
    uniform vec3 hor;
    uniform vec3 sunCol;
    uniform vec3 sunDir;
    varying vec3 vDir;

    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y, 0.0, 1.0);
      vec3 c = mix(hor, top, pow(h, 0.5));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      // Intense solar core disc + broad atmospheric corona
      c += sunCol * (pow(s, 700.0) * 1.6 + pow(s, 10.0) * 0.35);
      // Soft haze blend matching the horizon fog
      c = mix(c, hor, smoothstep(0.25, 0.0, d.y) * 0.6);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
});

const skyGeo = new THREE.SphereGeometry(520, 24, 16);
export const skyMesh = new THREE.Mesh(skyGeo, skyMat);
skyMesh.frustumCulled = false;
skyMesh.renderOrder = -1;
scene.add(skyMesh);

/** Dynamically toggle soft shadows and tune pixel ratio based on quality setting. */
export function setRenderQuality(qualityMode) {
  const isLow = qualityMode === "low";
  const isHigh = qualityMode === "high";
  let pr = 1.0;
  if (isHigh) {
    pr = isMobile ? Math.min(devicePixelRatio || 1, 1.75) : Math.min(devicePixelRatio || 1, 2);
  } else if (!isLow) {
    pr = isMobile ? Math.min(devicePixelRatio || 1, 1.25) : Math.min(devicePixelRatio || 1, 1.5);
  }
  renderer.setPixelRatio(pr);
  const enableShadows = (qualityMode !== "low");
  renderer.shadowMap.enabled = enableShadows;
  sun.castShadow = enableShadows;
  const shadowRes = (isMobile || !isHigh) ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
}

addEventListener("resize", () => renderer.setSize(innerWidth, innerHeight));

/* ====== Mesh helpers ====== */

// Every box in the game is the same 1×1×1 cube, stretched with `scale`, and boxes of the
// same colour share one material. So the GPU stores one cube, not thousands of copies.
export const UNIT = new THREE.BoxGeometry(1, 1, 1);
UNIT.userData = { isShared: true };
const matCache = new Map();

/** A coloured box mesh of size w×h×d at (x, y, z). All boxes share GPU data and cast/receive soft shadows. */
export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  if (!matCache.has(color)) {
    const mat = new THREE.MeshLambertMaterial({ color });
    mat.userData = { isShared: true };
    matCache.set(color, mat);
  }
  const m = new THREE.Mesh(UNIT, matCache.get(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A shared Lambert material for a colour. */
export function lambert(color) {
  if (!matCache.has(color)) {
    const mat = new THREE.MeshLambertMaterial({ color });
    mat.userData = { isShared: true };
    matCache.set(color, mat);
  }
  return matCache.get(color);
}

/* ====== Human Characters, Diverse Bangladeshi Outfits & Articulated Limbs ====== */
const headGeo = new THREE.SphereGeometry(0.18, 8, 8);
const torsoGeo = new THREE.CylinderGeometry(0.19, 0.22, 0.46, 8);
const armGeo = new THREE.CylinderGeometry(0.052, 0.044, 0.40, 6).translate(0, -0.20, 0);
const legGeo = new THREE.CylinderGeometry(0.065, 0.052, 0.48, 6).translate(0, -0.24, 0);
const lungiGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.50, 8);
const sareeSkirtGeo = new THREE.CylinderGeometry(0.23, 0.32, 0.52, 8);
const sareeAnchalGeo = new THREE.BoxGeometry(0.24, 0.54, 0.05);
const hairBunGeo = new THREE.SphereGeometry(0.09, 6, 6);
const sandalGeo = new THREE.BoxGeometry(0.12, 0.04, 0.24);
const tupiGeo = new THREE.CylinderGeometry(0.18, 0.19, 0.09, 8);
const gamchhaRingGeo = new THREE.TorusGeometry(0.19, 0.045, 6, 12);

// Mark shared geometries to prevent unintended disposal
[headGeo, torsoGeo, armGeo, legGeo, lungiGeo, sareeSkirtGeo, sareeAnchalGeo, hairBunGeo, sandalGeo, tupiGeo, gamchhaRingGeo].forEach(g => {
  g.userData = { isShared: true };
});

const lungiMat1 = new THREE.MeshLambertMaterial({ map: createPlaidTex("#1a365d", "#e2e8f0", "#2b6cb0") });
const lungiMat2 = new THREE.MeshLambertMaterial({ map: createPlaidTex("#1b4332", "#d8f3dc", "#2d6a4f") });
const lungiMat3 = new THREE.MeshLambertMaterial({ map: createPlaidTex("#5c1d1d", "#f5e6e6", "#8b2525") });
const gamchhaMat = new THREE.MeshLambertMaterial({ map: createGamchhaTex() });
const genjiMat = new THREE.MeshLambertMaterial({ map: createGenjiTex() });

const sareeMatCrimson = new THREE.MeshLambertMaterial({ map: createSareeTex("#b71c1c", "#ffd700") });
const sareeMatTeal = new THREE.MeshLambertMaterial({ map: createSareeTex("#00695c", "#ffca28") });
const sareeMatMagenta = new THREE.MeshLambertMaterial({ map: createSareeTex("#880e4f", "#ffe082") });
const sareeMatYellow = new THREE.MeshLambertMaterial({ map: createSareeTex("#f57f17", "#ff6f00") });
const SAREE_MATS = [sareeMatCrimson, sareeMatTeal, sareeMatMagenta, sareeMatYellow];

const LUNGI_MATS = [lungiMat1, lungiMat2, lungiMat3];
const PANT_COLORS = [0x1a237e, 0x263238, 0x8d6e63, 0x212121, 0x37474f];
const SHIRT_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0x00897b, 0xfdd835, 0xffffff, 0x546e7a];

[lungiMat1, lungiMat2, lungiMat3, gamchhaMat, genjiMat, ...SAREE_MATS].forEach(m => {
  m.userData = { isShared: true };
});

/** A detailed person with authentic Bangladeshi outfits (lungi, saree, pants, genji, salwar) and articulated limbs. */
export function person(shirt, y = 0, cap, wearsLungi = false, opts = {}) {
  const g = new THREE.Group();
  g.userData.baseY = y;

  // Resolve outfit type
  let outfit = opts.outfit;
  const isCop = cap === 0x1a237e || shirt === 0xf5f5f5 && cap;
  if (isCop) {
    outfit = "police";
  } else if (!outfit) {
    if (wearsLungi) {
      outfit = "lungi";
    } else {
      const r = Math.random();
      if (r < 0.32) outfit = "lungi";
      else if (r < 0.58) outfit = "pants";
      else if (r < 0.74) outfit = "saree";
      else if (r < 0.88) outfit = "genji";
      else outfit = "salwar";
    }
  }
  g.userData.outfit = outfit;

  // Resolve shirt / torso material
  let shirtColor = typeof shirt === "number" ? shirt : pick(SHIRT_COLORS);
  let torsoMat = lambert(shirtColor);
  let skinMat = lambert(0xc68642);
  let hairMat = lambert(0x1a1a1a);
  let sandalMat = lambert(pick([0x1565c0, 0x4e342e, 0x212121]));

  if (outfit === "genji") {
    torsoMat = genjiMat;
  } else if (outfit === "saree") {
    torsoMat = pick(SAREE_MATS);
  } else if (outfit === "police") {
    torsoMat = lambert(0xf5f5f5);
  }

  // 1. Torso Group
  const torso = new THREE.Group();
  torso.position.y = y + 0.48;
  const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
  torsoMesh.position.y = 0.23;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torso.add(torsoMesh);

  // 2. Head Group
  const head = new THREE.Group();
  head.position.set(0, 0.46, 0);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.position.y = 0.18;
  headMesh.castShadow = true;
  head.add(headMesh);

  // Headwear / Hair / Accessories
  if (outfit === "saree" || outfit === "salwar") {
    // Female hair bun (খোপা) at back of head
    const bun = new THREE.Mesh(hairBunGeo, hairMat);
    bun.position.set(0, 0.18, -0.18);
    // Red bindi on forehead
    const bindi = box(0.04, 0.04, 0.02, 0xd50000, 0, 0.20, 0.18);
    head.add(bun, bindi);
  } else if (outfit === "police") {
    // Police navy cap
    const pCap = box(0.44, 0.10, 0.44, 0x1a237e, 0, 0.35, 0);
    pCap.castShadow = true;
    head.add(pCap);
  } else if (cap) {
    const cMesh = box(0.44, 0.10, 0.44, cap, 0, 0.35, 0);
    cMesh.castShadow = true;
    head.add(cMesh);
  } else {
    // Male: prayer tupi or neat hair
    if (Math.random() < 0.35) {
      const tupi = new THREE.Mesh(tupiGeo, lambert(0xf5f5f5));
      tupi.position.y = 0.33;
      tupi.castShadow = true;
      head.add(tupi);
    } else {
      const hair = box(0.38, 0.08, 0.38, 0x1a1a1a, 0, 0.34, 0);
      head.add(hair);
    }
  }
  torso.add(head);

  // 3. Articulated Arms (Pivoted at shoulders)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.25, 0.38, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, outfit === "genji" ? skinMat : torsoMat);
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  torso.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.25, 0.38, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, outfit === "genji" ? skinMat : torsoMat);
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  torso.add(rightArm);

  g.add(torso);

  // 4. Articulated Legs (Pivoted at hips)
  const pantColor = outfit === "police" ? 0x1a237e : pick(PANT_COLORS);
  const legMat = (outfit === "pants" || outfit === "police" || outfit === "salwar") ? lambert(pantColor) : skinMat;

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.11, y + 0.48, 0);
  const leftLegMesh = new THREE.Mesh(legGeo, legMat);
  leftLegMesh.castShadow = true;
  leftLegMesh.receiveShadow = true;
  const leftSandal = new THREE.Mesh(sandalGeo, sandalMat);
  leftSandal.position.set(0, -0.46, 0.03);
  leftLeg.add(leftLegMesh, leftSandal);
  g.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.11, y + 0.48, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, legMat);
  rightLegMesh.castShadow = true;
  rightLegMesh.receiveShadow = true;
  const rightSandal = new THREE.Mesh(sandalGeo, sandalMat);
  rightSandal.position.set(0, -0.46, 0.03);
  rightLeg.add(rightLegMesh, rightSandal);
  g.add(rightLeg);

  // 5. Lower Garments: Lungi / Saree Skirt & Anchal
  if (outfit === "lungi" || outfit === "genji") {
    const lungiMat = pick(LUNGI_MATS);
    const lungiMesh = new THREE.Mesh(lungiGeo, lungiMat);
    lungiMesh.position.y = y + 0.25;
    lungiMesh.castShadow = true;
    lungiMesh.receiveShadow = true;
    g.add(lungiMesh);

    // Gamchha over shoulder or around neck
    if (Math.random() < 0.65) {
      const gamchha = new THREE.Mesh(gamchhaRingGeo, gamchhaMat);
      gamchha.rotation.x = Math.PI / 2;
      gamchha.position.set(0, 0.42, 0);
      torso.add(gamchha);
    }
  } else if (outfit === "saree") {
    const sareeSkirt = new THREE.Mesh(sareeSkirtGeo, torsoMat);
    sareeSkirt.position.y = y + 0.26;
    sareeSkirt.castShadow = true;
    sareeSkirt.receiveShadow = true;
    g.add(sareeSkirt);

    // Anchal drape across chest to shoulder
    const anchal = new THREE.Mesh(sareeAnchalGeo, torsoMat);
    anchal.rotation.z = -0.35;
    anchal.position.set(-0.06, 0.24, 0.12);
    torso.add(anchal);
  }

  // Store limb references on userData for runtime animation
  g.userData.torso = torso;
  g.userData.head = head;
  g.userData.leftArm = leftArm;
  g.userData.rightArm = rightArm;
  g.userData.leftLeg = leftLeg;
  g.userData.rightLeg = rightLeg;

  return g;
}

/** Animates a character's articulated limbs based on their current state machine action. */
export function animatePerson(g, state = "walk", animTime = 0, dt = 0.016) {
  const u = g.userData;
  if (!u || !u.leftArm || !u.rightArm || !u.leftLeg || !u.rightLeg) return;
  const la = u.leftArm, ra = u.rightArm, ll = u.leftLeg, rl = u.rightLeg;
  const torso = u.torso, head = u.head;

  // Reset base pose before applying state
  la.rotation.set(0, 0, 0);
  ra.rotation.set(0, 0, 0);
  ll.rotation.set(0, 0, 0);
  rl.rotation.set(0, 0, 0);
  torso.rotation.set(0, 0, 0);
  if (head) head.rotation.set(0, 0, 0);

  switch (state) {
    case "walk": {
      const freq = 6.0;
      const legA = Math.sin(animTime * freq) * 0.55;
      ll.rotation.x = legA;
      rl.rotation.x = -legA;
      la.rotation.x = -legA * 0.75;
      ra.rotation.x = legA * 0.75;
      torso.position.y = (u.baseY || 0) + 0.48 + Math.abs(Math.sin(animTime * freq)) * 0.04;
      break;
    }
    case "calm": {
      la.rotation.x = 0.05;
      ra.rotation.x = -0.05;
      if (head) head.rotation.y = Math.sin(animTime * 1.5) * 0.22;
      torso.position.y = (u.baseY || 0) + 0.48;
      break;
    }
    case "impatient": {
      // Tapping right foot rapidly + checking watch with left arm
      rl.rotation.x = Math.sin(animTime * 14) * 0.20;
      la.rotation.x = -Math.PI * 0.48;
      la.rotation.z = 0.38;
      ra.rotation.x = Math.sin(animTime * 3) * 0.15;
      if (head) head.rotation.y = Math.sin(animTime * 4.5) * 0.35;
      torso.position.y = (u.baseY || 0) + 0.48;
      break;
    }
    case "chase": {
      // High-speed running chase, shaking right fist angrily!
      const freq = 13.0;
      const legA = Math.sin(animTime * freq) * 0.85;
      ll.rotation.x = legA;
      rl.rotation.x = -legA;
      la.rotation.x = -legA * 0.7;
      ra.rotation.x = -Math.PI * 0.72 + Math.sin(animTime * 16) * 0.35; // shaking fist in air
      torso.rotation.x = 0.24; // leaned forward
      torso.position.y = (u.baseY || 0) + 0.48 + Math.abs(Math.sin(animTime * freq)) * 0.08;
      break;
    }
    case "grab": {
      // Reaching forward with both hands to grab the bus handle or window
      la.rotation.x = -Math.PI * 0.55 + Math.sin(animTime * 8) * 0.12;
      ra.rotation.x = -Math.PI * 0.55 - Math.sin(animTime * 8) * 0.12;
      torso.rotation.x = 0.32;
      break;
    }
    case "punch": {
      // Throwing aggressive forward punches
      const punchA = Math.sin(animTime * 12);
      ra.rotation.x = -Math.PI * 0.45 + punchA * 0.8;
      la.rotation.x = -0.3;
      torso.rotation.y = punchA * 0.35;
      break;
    }
    case "kick": {
      // Aggressive street kick
      rl.rotation.x = -Math.PI * 0.45 + Math.sin(animTime * 8) * 0.25;
      la.rotation.x = 0.5;
      ra.rotation.x = 0.5;
      break;
    }
    case "tumble": {
      // Flailing wildly in mid-air
      la.rotation.x = Math.sin(animTime * 22) * 1.6;
      ra.rotation.x = -Math.sin(animTime * 24) * 1.6;
      la.rotation.z = 0.95;
      ra.rotation.z = -0.95;
      ll.rotation.x = Math.sin(animTime * 18) * 0.9;
      rl.rotation.x = -Math.sin(animTime * 18) * 0.9;
      break;
    }
    case "down": {
      // Lying flat on the ground
      la.rotation.z = 1.15;
      ra.rotation.z = -1.15;
      ll.rotation.z = 0.35;
      rl.rotation.z = -0.35;
      break;
    }
    case "stunned": {
      // Sitting up groggily holding head
      ra.rotation.x = -Math.PI * 0.72; // hand to forehead
      ra.rotation.z = -0.25;
      la.rotation.x = 0.2;
      if (head) {
        head.rotation.y = Math.sin(animTime * 3) * 0.3;
        head.rotation.z = Math.sin(animTime * 2) * 0.15;
      }
      break;
    }
    case "getUp":
    case "beaten": {
      // Standing up, dusting off, shaking fist
      const phase = Math.sin(animTime * 8);
      la.rotation.x = -0.3 + phase * 0.2;
      ra.rotation.x = -Math.PI * 0.5 + phase * 0.4; // shaking fist
      break;
    }
  }
}

/** A flat sign with text drawn on a canvas (works with Bangla text). Long text shrinks to fit. */
export function plate(text, w, h, bg, fg) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = Math.max(4, Math.round(c.height * .06));
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  let size = Math.round(c.height * .58);
  const font = s => `bold ${s}px 'Noto Sans Bengali', 'Nirmala UI', sans-serif`;
  g.font = font(size);
  while (g.measureText(text).width > c.width * .9 && size > 10) g.font = font(--size);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

/* ====== Ground ====== */
/** The ground has its own material so time-of-day can tint it (grass, dust, night). */
export const groundMat = new THREE.MeshLambertMaterial({ color: 0x6d6a61 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), groundMat);
ground.position.y = -.2;
ground.receiveShadow = true;
scene.add(ground);

/** Keep the ground under the camera (the fog hides its edges). */
export function followGround(x, z) {
  ground.position.x = x;
  ground.position.z = z;
}

/* ====== Roads: one long ribbon mesh per material, built once from map.js ====== */
// Batching: every road piece with the same material goes into ONE geometry, so the
// whole network costs only a handful of draw calls.
const batches = new Map(); // material -> { pos: [], uvs: [], cols: [], idx: [] }
function batch(mat) {
  if (!batches.has(mat)) batches.set(mat, { pos: [], uvs: [], cols: [], idx: [] });
  return batches.get(mat);
}

const pt = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };
/**
 * Add a flat band along a segment, from lateral x0 to x1, raised y above the road.
 * dash = [on, period, offset] makes it a dashed/alternating line; range = [f0, f1] limits it to part of the segment.
 */
function band(seg, x0, x1, y, mat, dash, range) {
  const b = batch(mat), S = SEGS[seg];
  const i0 = range ? Math.floor(range[0] * (S.n - 1)) : 0;
  const i1 = range ? Math.ceil(range[1] * (S.n - 1)) : S.n - 1;
  const off = dash && dash[2] ? dash[2] : 0;
  for (let i = i0; i <= i1; i++) {
    sample(seg, i * S.step, pt);
    const rx = Math.cos(pt.yaw), rz = -Math.sin(pt.yaw);
    const base = b.pos.length / 3;
    b.pos.push(pt.x + rx * x0, pt.y + y, pt.z + rz * x0, pt.x + rx * x1, pt.y + y, pt.z + rz * x1);
    b.uvs.push(x0 * 0.15, (i * S.step) * 0.1, x1 * 0.15, (i * S.step) * 0.1);
    const ok = !dash || (((i - .5) * S.step + off) % dash[1]) < dash[0];
    if (i > i0 && ok) b.idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
  }
}

/** Add a low wall along a segment at lateral x, starting at height y0 and rising by h. */
function wall(seg, x, y0, h, mat, range) {
  const b = batch(mat), S = SEGS[seg];
  const i0 = range ? Math.floor(range[0] * (S.n - 1)) : 0;
  const i1 = range ? Math.ceil(range[1] * (S.n - 1)) : S.n - 1;
  for (let i = i0; i <= i1; i++) {
    sample(seg, i * S.step, pt);
    const rx = Math.cos(pt.yaw), rz = -Math.sin(pt.yaw);
    const base = b.pos.length / 3;
    b.pos.push(pt.x + rx * x, pt.y + y0, pt.z + rz * x, pt.x + rx * x, pt.y + y0 + h, pt.z + rz * x);
    b.uvs.push((i * S.step) * 0.1, 0, (i * S.step) * 0.1, 1);
    if (i > i0) b.idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
  }
}

/** A cross-road intersecting at a junction (with zebra crossing and dashed centre line). */
function stub(seg, s, side) {
  sample(seg, s, pt);
  const S = SEGS[seg], h = 7, L = 95;
  const rx = Math.cos(pt.yaw), rz = -Math.sin(pt.yaw);
  const fx = -Math.sin(pt.yaw), fz = -Math.cos(pt.yaw);
  const ox = pt.x + rx * side * S.half, oz = pt.z + rz * side * S.half;
  const corner = (d, a, y) => [ox + rx * side * d + fx * a, pt.y + y, oz + rz * side * d + fz * a];
  const quad = (mat, d0, d1, a0, a1, y) => {
    const b = batch(mat), base = b.pos.length / 3;
    b.pos.push(...corner(d0, a0, y), ...corner(d0, a1, y), ...corner(d1, a0, y), ...corner(d1, a1, y));
    b.uvs.push(d0 * 0.15, a0 * 0.1, d0 * 0.15, a1 * 0.1, d1 * 0.15, a0 * 0.1, d1 * 0.15, a1 * 0.1);
    b.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  quad(MATS.road, -0.5, L, -h, h, .004);
  quad(MATS.pave, 0, L, h, h + 2.5, .14);
  quad(MATS.pave, 0, L, -h - 2.5, -h, .14);
  // Zebra crossing stripes across the mouth of the cross-street.
  for (let a = -h + 1.2; a <= h - 1.2; a += 1.6) {
    quad(MATS.line, 1.2, 4.4, a - 0.35, a + 0.35, .02);
  }
  // Dashed centre divider along the cross-street.
  for (let d = 8; d < L - 6; d += 10) {
    quad(MATS.line, d, d + 4, -0.1, 0.1, .02);
  }
}

const asphaltTex = createAsphaltTex();
const paversTex = createPaversTex();

const MATS = {
  road: new THREE.MeshLambertMaterial({ map: asphaltTex, side: THREE.DoubleSide }),
  patch: applyPolygonOffset(new THREE.MeshLambertMaterial({ color: 0x242220, side: THREE.DoubleSide }), -1.0, -2.0),
  pave: new THREE.MeshLambertMaterial({ map: paversTex, side: THREE.DoubleSide }),
  median: new THREE.MeshLambertMaterial({ color: 0xa68966, side: THREE.DoubleSide }),
  kerbYellow: applyPolygonOffset(new THREE.MeshLambertMaterial({ color: 0xf5b014, side: THREE.DoubleSide }), -1.0, -2.0),
  kerbBlack: applyPolygonOffset(new THREE.MeshLambertMaterial({ color: 0x1c1c1c, side: THREE.DoubleSide }), -1.0, -2.0),
  kerbStripes: applyPolygonOffset(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), -1.0, -2.0),
  line: applyPolygonOffset(new THREE.MeshLambertMaterial({ color: 0xeae6df, side: THREE.DoubleSide }), -2.0, -4.0),
  wall: new THREE.MeshLambertMaterial({ color: 0xbdb5a6, side: THREE.DoubleSide }),
  metroGreen: new THREE.MeshLambertMaterial({ color: 0x1f6b3a, side: THREE.DoubleSide }),
};

const treeCrownGeo = new THREE.IcosahedronGeometry(1, 0);
const treeLeafMat = new THREE.MeshLambertMaterial({ color: 0x263818 });
const bushMat = new THREE.MeshLambertMaterial({ color: 0x2f481e });

/** Build every road ribbon, yellow-black striped kerbs, tree-lined medians, and overhead metro viaduct. */
function buildRoads() {
  const M = CFG.metro;
  const medianGroup = new THREE.Group();
  for (let i = 0; i < SEGS.length; i++) {
    const S = SEGS[i], h = S.half;
    const lift = S.main ? 0 : .03;
    band(i, -h, h, lift, MATS.road);

    // Darker asphalt wear patches along the road for rich street texture.
    band(i, -h * .65, -h * .25, lift + .006, MATS.patch, [6, 22, 0]);
    band(i, h * .2, h * .6, lift + .006, MATS.patch, [5, 19, 9]);

    if (S.kind === "flyover") {
      for (const s of [-1, 1]) wall(i, s * h, 0, 1, MATS.wall);
    } else {
      // Sidewalks + yellow-and-black striped roadside kerbs on both sides.
      band(i, h, h + 3.2, lift + .14, MATS.pave);
      band(i, -h - 3.2, -h, lift + .14, MATS.pave);
      for (const s of [-1, 1]) {
        const kx0 = s > 0 ? h - .32 : -h;
        const kx1 = s > 0 ? h : -h + .32;
        band(i, kx0, kx1, lift + .15, MATS.kerbYellow, [2, 4, 0]);
        band(i, kx0, kx1, lift + .15, MATS.kerbBlack, [2, 4, 2]);
      }
    }

    // White dashed lane dividers.
    if (S.kind !== "street") {
      for (const s of [-1, 1]) band(i, s * h * .52 - .08, s * h * .52 + .08, lift + .015, MATS.line, W.dash);
    }

    // Yellow-and-black striped centre median island with low-poly trees and bushes,
    // featuring open gaps at every crossroad (মোড়) and every ~75 units for wrong-way/U-turn lane switching.
    if (S.half >= 6) {
      const inGap = d => {
        if (d < 14 || d > S.len - 14) return true;
        for (const j of S.junctions || []) {
          if (Math.abs(d - j.at * S.len) < 12) return true;
        }
        const proc = getProcessionBySegId(S.id);
        if (proc) {
          if (proc.openCorridor === "wrong-way") {
            // Smooth open median corridor covering entry, barricade bypass, and exit back to normal lane
            if (Math.abs(d - proc.barricadeAt * S.len) < (proc.medianGapSpan || 32)) return true;
          } else {
            if (proc.entryMedianGap && Math.abs(d - proc.entryMedianGap * S.len) < 14) return true;
            if (proc.exitMedianGap && Math.abs(d - proc.exitMedianGap * S.len) < 14) return true;
            if (Math.abs(d - proc.barricadeAt * S.len) < proc.barricadeHalfLen + 4) return true;
          }
        }
        return (d % 80) > 68;
      };
      // Build continuous median sub-ranges between gaps.
      const ranges = [];
      let rStart = null;
      const stepD = 4;
      for (let d = 0; d <= S.len; d += stepD) {
        const g = inGap(d);
        if (!g && rStart === null) rStart = d / S.len;
        else if (g && rStart !== null) {
          const rEnd = (d - stepD) / S.len;
          if (rEnd - rStart > 0.03) ranges.push([rStart, rEnd]);
          rStart = null;
        }
      }
      if (rStart !== null && 0.98 - rStart > 0.03) ranges.push([rStart, 0.98]);

      for (const rg of ranges) {
        band(i, -.42, .42, .16, MATS.median, null, rg);
        for (const s of [-1, 1]) {
          const mx0 = s > 0 ? .28 : -.42, mx1 = s > 0 ? .42 : -.28;
          band(i, mx0, mx1, .17, MATS.kerbYellow, [2, 4, 0], rg);
          band(i, mx0, mx1, .17, MATS.kerbBlack, [2, 4, 2], rg);
        }
        // Plant median trees every 18 units and small green bushes in between.
        for (let d = rg[0] * S.len + 6; d < rg[1] * S.len - 6; d += 9) {
          sample(i, d, pt);
          if (Math.round(d / 9) % 2 === 0) {
            const trunk = box(.24, 2.2, .24, 0x3e2723, pt.x, pt.y + 1.2, pt.z);
            const crown = new THREE.Mesh(treeCrownGeo, treeLeafMat);
            crown.position.set(pt.x, pt.y + 2.85, pt.z);
            crown.scale.set(1.25, 1.15, 1.25);
            medianGroup.add(trunk, crown);
          } else {
            const bush = new THREE.Mesh(treeCrownGeo, bushMat);
            bush.position.set(pt.x, pt.y + .36, pt.z);
            bush.scale.set(.32, .22, .35);
            medianGroup.add(bush);
          }
        }
      }
    }

    // Overhead metro rail viaduct deck and side parapets (Shahbagh & Dhaka University).
    if (S.metro) {
      const mw = M.deckWidth / 2;
      band(i, -mw, mw, M.deckY, MATS.wall, null, S.metro);
      for (const s of [-1, 1]) {
        wall(i, s * mw, M.deckY - .2, 1.15, MATS.wall, S.metro);
        wall(i, s * (mw + .04), M.deckY + .25, .3, MATS.metroGreen, S.metro);
      }
    }
    for (const j of S.junctions || []) {
      for (const side of j.type === "X" ? [-1, 1] : [j.side]) stub(i, j.at * S.len, side);
    }
  }
  scene.add(medianGroup);

  for (const [mat, b] of batches) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    if (b.uvs && b.uvs.length === (b.pos.length / 3) * 2) {
      g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uvs, 2));
    }
    if (b.cols && b.cols.length === b.pos.length) {
      g.setAttribute("color", new THREE.Float32BufferAttribute(b.cols, 3));
    }
    g.setIndex(b.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.receiveShadow = true;
    scene.add(m);
  }
}

/* ====== Procedural Multi-Storey Windowed Dhaka Building Textures & Shop Signs ====== */

export const BLDG_MATS = createBuildingMaterials();
for (const m of BLDG_MATS) {
  attachBlackoutShader(m);
}

export function setBuildingEmissive(nightFactor) {
  const blackoutDim = Math.max(0.05, 1.0 - (blackoutState?.uniform?.value || 0.0) * 0.95);
  const intensity = (0.15 + Math.max(0, Math.min(1, nightFactor)) * 1.25) * blackoutDim;
  for (const m of BLDG_MATS) {
    if (m && m.userData?.isBuilding) {
      m.emissiveIntensity = intensity;
    }
  }
}

const SHOP_SIGNS = DHAKA_SHOP_DATA.map(([text, bg, fg]) => plate(text, 4.8, 0.85, bg, fg).material);

const signGeo = new THREE.PlaneGeometry(4.8, 0.85);
const canopyMatBlue = new THREE.MeshLambertMaterial({ color: 0x0d3b66 });
const canopyMatRed = new THREE.MeshLambertMaterial({ color: 0x8e2424 });

function makePooledBuilding(idx) {
  const g = new THREE.Group();
  // Main apartment/commercial building block (unit cube scaled per placement).
  const bldg = new THREE.Mesh(UNIT, BLDG_MATS[idx % BLDG_MATS.length]);
  bldg.castShadow = true;
  bldg.receiveShadow = true;
  g.add(bldg);

  // 1st-floor Bangla shop signboard facing the road (local -x faces road when placed on right, flipped via side).
  const sign = new THREE.Mesh(signGeo, SHOP_SIGNS[idx % SHOP_SIGNS.length]);
  sign.position.set(0, 3.6, 0);
  g.add(sign);

  // Footpath hawker canopy + colourful stall tables right in front of the building along the sidewalk.
  const hawker = new THREE.Group();
  const awning = new THREE.Mesh(UNIT, idx % 3 === 0 ? canopyMatRed : canopyMatBlue);
  awning.scale.set(2.4, 0.14, 7.6);
  awning.position.set(0, 2.55, 0);
  awning.rotation.z = 0.12;
  awning.castShadow = true;
  awning.receiveShadow = true;
  hawker.add(awning);
  for (const dz of [-3.4, 0, 3.4]) {
    hawker.add(box(0.08, 2.5, 0.08, 0x78583a, -1.0, 1.25, dz));
    const tableColor = pick([0xd32f2f, 0xffb300, 0x1976d2, 0x388e3c, 0xc2185b]);
    hawker.add(box(1.3, 0.72, 2.1, tableColor, -0.2, 0.36, dz));
    hawker.add(box(0.6, 0.45, 0.9, 0x212121, 0.1, 0.85, dz));
  }
  g.add(hawker);

  g.userData = { bldg, sign, hawker };
  g.visible = false;
  scene.add(g);
  return g;
}

/* ====== Buildings: a pool of richly detailed Dhaka street blocks reused along the road ====== */
const pool = [];
const placements = SEGS.map(() => []);
const active = new Set();

function blocked(seg, s, side) {
  const S = SEGS[seg];
  if (S.kind === "flyover") return true;
  if (!S.main) {
    if (side !== S.side || s < 36 || s > S.len - 36) return true;
  }
  if (S.main && S.alts?.length) {
    const t = s / S.len;
    for (const altIdx of S.alts) {
      const A = SEGS[altIdx];
      if (A.side === side && t > .04 && t < .96) return true;
    }
  }
  for (const j of S.junctions || []) {
    if ((j.type === "X" || j.side === side) && Math.abs(j.at * S.len - s) < W.stubWidth / 2 + 12) return true;
  }
  return false;
}

export function initWorld(scenery) {
  buildRoads();
  for (let i = 0; i < W.buildingPool; i++) {
    pool.push(makePooledBuilding(i));
  }
  for (let i = 0; i < SEGS.length; i++) {
    const S = SEGS[i];
    const gap = S.main ? 10.5 : W.buildingGap; // denser continuous street wall on main boulevards
    for (const side of [-1, 1]) {
      for (let s = rnd(8, gap + 6); s < S.len - 8; s += gap + rnd(-1, 1.5)) {
        if (blocked(i, s, side)) continue;
        const look = scenery(progressOf(i, s), side);
        const w = rnd(7.5, 11.5), d = rnd(8.5, 11.5);
        const h = rnd(Math.max(12, look.minH + 4), look.maxH + 6);
        const off = S.half + 3.4 + w / 2;
        sample(i, s, pt);
        const wx = pt.x + Math.cos(pt.yaw) * side * off;
        const wz = pt.z - Math.sin(pt.yaw) * side * off;
        const radius = Math.hypot(w / 2 + 2.4, d / 2 + 1.2);
        if (hitsAnyRoad(wx, wz, radius, i, s)) continue;
        placements[i].push({
          seg: i, s, side, w, d, h,
          off, hidden: look.hidden, mesh: null,
        });
      }
    }
  }
}

function release(p) {
  p.mesh.visible = false;
  pool.push(p.mesh);
  p.mesh = null;
  active.delete(p);
}

export function resetWorld() {
  for (const p of [...active]) release(p);
}

const near = [];
export function updateWorld() {
  for (const p of active) {
    const a = ahead(p.seg, p.s);
    if (!(a > -W.buildingBehind && a < W.buildingAhead)) release(p);
  }
  const cur = SEGS[here.seg];
  near.length = 0;
  near.push(here.seg, ...cur.next);
  if (here.prev >= 0) near.push(here.prev);
  for (let i = 0; i < SEGS.length; i++) if (i !== here.seg && SEGS[i].from === cur.from) near.push(i);
  for (const seg of near) {
    for (const p of placements[seg]) {
      if (p.mesh || p.hidden || !pool.length) continue;
      const a = ahead(seg, p.s);
      if (!(a > -W.buildingBehind && a < W.buildingAhead)) continue;
      const g = pool.pop();
      const { bldg, sign, hawker } = g.userData;
      bldg.scale.set(p.w, p.h, p.d);
      bldg.position.set(0, p.h / 2, 0);
      // Position the shop signboard and sidewalk hawker canopy on the road-facing side of the building.
      const faceX = -p.side * (p.w / 2 + 0.08);
      sign.position.set(faceX, 3.8, 0);
      sign.rotation.y = -p.side * Math.PI / 2;
      hawker.position.set(-p.side * (p.w / 2 + 1.4), 0, 0);
      hawker.scale.x = p.side;
      place(g, seg, p.s, p.side * p.off, 0);
      g.visible = true;
      p.mesh = g;
      active.add(p);
    }
  }
}
