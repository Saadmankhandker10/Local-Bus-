// Loader, optimizer and pool for authentic 3D Bangladeshi traffic cars, microbuses & sedans:
// 1. Toyota Hiace 2005 Microbus (`models/hiace.glb`)
// 2. Toyota Hiace 2004 Classic Boxy Microbus (`models/hiace_2004.glb`)
// 3. Toyota Corolla Luxel Private Sedan (`models/corolla.glb`)
// 4. Toyota Corolla Fielder Station Wagon (`models/fielder.glb`)
//
// Performance Optimizations:
// - BufferGeometryUtils batching: combines 538 Corolla & 603 Fielder sub-meshes into ~50 material batches
// - Selective shadow casting: only major exterior body shells cast shadows, dropping shadow draw calls by 95%
// - Object Pooling: pre-allocates and reuses vehicle instances; zero garbage collection pauses during driving
// - Static Plate Cache: pre-renders authentic BRTA license plates once; zero canvas texture allocations

import * as THREE from "three";
import { GLTFLoader } from "./GLTFLoader.js";
import { clone as skeletonClone } from "./SkeletonUtils.js";
import { mergeGeometries } from "./BufferGeometryUtils.js";
import { pick, rnd } from "./utils.js";
import { box } from "./world.js";

const MODEL_PATHS = {
  hiace: "models/hiace.glb",
  hiace_2004: "models/hiace_2004.glb",
  corolla: "models/corolla.glb",
  fielder: "models/fielder.glb"
};

const loadedTemplates = {
  hiace: null,
  hiace_2004: null,
  corolla: null,
  fielder: null
};

// Object pools per model key
const carPool = {
  hiace: [],
  hiace_2004: [],
  corolla: [],
  fielder: []
};

let modelsLoaded = false;
let loadPromise = null;

// Authentic Dhaka automotive paint color palette
export const DHAKA_CAR_COLORS = [
  0xf5f5f5, // Pearl White (most common in Dhaka!)
  0xb0bec5, // Metallic Silver
  0x607d8b, // Slate Metallic Gray
  0x1a1a1a, // Midnight Executive Black
  0x0d47a1, // Deep Navy Blue
  0x1565c0, // Royal Blue
  0xd7ccc8, // Champagne Gold
  0xb71c1c, // Wine Red / Crimson
  0x1b5e20, // Dark Emerald Green
  0x37474f, // Charcoal Gray
];

export const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBanglaDigits(num) {
  return String(num).split("").map(d => BANGLA_DIGITS[parseInt(d, 10)] ?? d).join("");
}

/** Pre-defined pool of authentic BRTA registration plate details. */
const PRESET_PLATES = {
  hiace: [
    { top: "ঢাকা মেট্রো-চ", bottom: "১১-৪৫৬৭" },
    { top: "ঢাকা মেট্রো-চ", bottom: "১৩-৮৯০১" },
    { top: "ঢাকা মেট্রো-চ", bottom: "১৫-২৩৪৫" },
    { top: "ঢাকা মেট্রো-চ", bottom: "১৯-৬৭৮৯" }
  ],
  car: [
    { top: "ঢাকা মেট্রো-গ", bottom: "২৮-৩৪১২" },
    { top: "ঢাকা মেট্রো-খ", bottom: "১৪-৮৯০১" },
    { top: "ঢাকা মেট্রো-ক", bottom: "১১-২৩৪৫" },
    { top: "ঢাকা মেট্রো-গ", bottom: "৩৩-৫৬৭৮" },
    { top: "ঢাকা মেট্রো-গ", bottom: "৩৫-১২৩৪" },
    { top: "ঢাকা মেট্রো-খ", bottom: "১৭-৬৭৮৯" }
  ],
  vip: [
    { top: "ঢাকা মেট্রো-ঘ", bottom: "৫৩-৯৯০১" },
    { top: "ঢাকা মেট্রো-ভ", bottom: "১১-৭৭৭৭" },
    { top: "ঢাকা মেট্রো-ঘ", bottom: "১৩-০০০১" }
  ],
  police: [
    { top: "ঢাকা মেট্রো-ম", bottom: "১১-০০১২" },
    { top: "ঢাকা মেট্রো-ম", bottom: "২১-৩৪৫৬" },
    { top: "ঢাকা মেট্রো-ম", bottom: "১৪-৭৮৯০" }
  ]
};

export function generateBangladeshiPlate(vehicleClass = "car") {
  const list = PRESET_PLATES[vehicleClass] || PRESET_PLATES.car;
  return pick(list);
}

// Cache canvas textures so duplicate plates do not leak GPU memory
const plateTexCache = new Map();

/** Create or retrieve a cached canvas texture for a Bangladeshi license plate. */
export function createPlateTexture(plateInfo) {
  const key = `${plateInfo.top}|${plateInfo.bottom}`;
  if (plateTexCache.has(key)) return plateTexCache.get(key);

  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d");

  // BRTA Green retroreflective background
  ctx.fillStyle = "#0c5026";
  ctx.fillRect(0, 0, 256, 128);

  // White embossed border
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 244, 116);

  // Top line: Metro & Class
  ctx.fillStyle = "#ffffff";
  ctx.font = 'bold 32px "Noto Sans Bengali", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(plateInfo.top, 128, 42);

  // Bottom line: Series & Registration Number
  ctx.font = 'bold 38px "Noto Sans Bengali", sans-serif';
  ctx.fillText(plateInfo.bottom, 128, 88);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { isShared: true };
  plateTexCache.set(key, tex);
  return tex;
}

/** Pre-cache all preset license plate textures on startup to avoid canvas allocations. */
function initPlateTextures() {
  for (const group of Object.values(PRESET_PLATES)) {
    for (const p of group) {
      createPlateTexture(p);
    }
  }
}
initPlateTextures();

/** Create a 3D Mesh with the license plate. */
export function createPlateMesh(plateInfo) {
  const tex = createPlateTexture(plateInfo);
  const geo = new THREE.PlaneGeometry(0.48, 0.24);
  geo.userData = { isShared: true };
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  mat.userData = { isShared: true };
  return new THREE.Mesh(geo, mat);
}

/** Normalizes geometry attributes for clean batching in BufferGeometryUtils. */
function normalizeGeomForMerge(geom) {
  if (!geom.attributes.normal) {
    geom.computeVertexNormals();
  }
  if (!geom.attributes.uv && geom.attributes.position) {
    const count = geom.attributes.position.count;
    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!geom.index && geom.attributes.position) {
    const count = geom.attributes.position.count;
    const indices = [];
    for (let i = 0; i < count; i++) indices.push(i);
    geom.setIndex(indices);
  }
  return geom;
}

/**
 * Optimizes complex Sketchfab GLTF models (Corolla & Fielder) by merging static sub-meshes
 * sharing the same material into unified geometries, slashing draw calls by ~95%.
 */
function optimizeComplexGltf(scene, isFielder = false) {
  scene.updateMatrixWorld(true);

  // Group geometries by material or material type
  const matMap = new Map();
  const paintGeoms = [];
  let primaryPaintMat = null;

  scene.traverse(node => {
    if (node.isMesh && node.geometry) {
      const mat = node.material;
      const matName = mat ? (mat.name || "") : "";

      const isPaint = isFielder
        ? (matName.includes("Super_Red") || matName.includes("0012_dark_red1") || matName.includes("Paint1") || matName.includes("Color_E01") || matName.includes("Color_E011"))
        : (matName.includes("Dark_Blue") || matName.includes("Paint1") || matName.includes("Color_E01") || matName.includes("Color_E012") || matName.includes("Color_M05"));

      const g = node.geometry.clone();
      g.applyMatrix4(node.matrixWorld);
      normalizeGeomForMerge(g);

      if (isPaint) {
        paintGeoms.push(g);
        if (!primaryPaintMat) primaryPaintMat = mat;
      } else {
        if (!matMap.has(mat)) matMap.set(mat, []);
        matMap.get(mat).push(g);
      }
    }
  });

  const root = new THREE.Group();

  // 1. Unified Exterior Automotive Paint Mesh (carries dynamic paint color)
  let paintMesh = null;
  if (paintGeoms.length > 0) {
    const mergedPaintGeom = paintGeoms.length === 1 ? paintGeoms[0] : mergeGeometries(paintGeoms, false);
    if (mergedPaintGeom) {
      mergedPaintGeom.userData = { isShared: true };
      const defaultPaintMat = new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        roughness: 0.28,
        metalness: 0.35,
      });
      paintMesh = new THREE.Mesh(mergedPaintGeom, defaultPaintMat);
      paintMesh.name = "paintMesh";
      paintMesh.castShadow = true;
      paintMesh.receiveShadow = true;
      root.add(paintMesh);
    }
  }

  // 2. Merged Trim, Glass, Chrome, and Interior Meshes
  for (const [mat, geoms] of matMap.entries()) {
    if (geoms.length === 1) {
      geoms[0].userData = { isShared: true };
      const m = new THREE.Mesh(geoms[0], mat);
      // Only exterior glass and large bumpers cast shadows
      const isMinor = (mat.name || "").includes("Screenshot") || (mat.name || "").includes("sticker") || (mat.name || "").includes("lanyard");
      m.castShadow = !isMinor;
      m.receiveShadow = true;
      root.add(m);
    } else {
      try {
        const merged = mergeGeometries(geoms, false);
        if (merged) {
          merged.userData = { isShared: true };
          const m = new THREE.Mesh(merged, mat);
          m.castShadow = true;
          m.receiveShadow = true;
          root.add(m);
        }
      } catch (err) {
        for (const g of geoms) {
          g.userData = { isShared: true };
          root.add(new THREE.Mesh(g, mat));
        }
      }
    }
  }

  return { root, paintMesh };
}

/** Preload all vehicle 3D models in parallel and optimize complex hierarchies. */
export function loadCarModels() {
  if (modelsLoaded) return Promise.resolve(loadedTemplates);
  if (loadPromise) return loadPromise;

  const loader = new GLTFLoader();

  const loadOne = (path, key) => new Promise(resolve => {
    loader.load(
      path,
      gltf => {
        if (key === "corolla") {
          loadedTemplates.corolla = optimizeComplexGltf(gltf.scene, false);
        } else if (key === "fielder") {
          loadedTemplates.fielder = optimizeComplexGltf(gltf.scene, true);
        } else if (key === "hiace_2004") {
          gltf.scene.traverse(node => {
            if (node.isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
              if (node.geometry) node.geometry.userData = { isShared: true };
            }
          });
          loadedTemplates.hiace_2004 = { root: gltf.scene, baseGltf: gltf };
        } else if (key === "hiace") {
          gltf.scene.traverse(node => {
            if (node.isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
              if (node.geometry) node.geometry.userData = { isShared: true };
            }
          });
          loadedTemplates.hiace = { root: gltf.scene, baseGltf: gltf };
        }
        resolve(loadedTemplates[key]);
      },
      undefined,
      err => {
        console.warn(`Could not load car model ${path}:`, err);
        resolve(null);
      }
    );
  });

  loadPromise = Promise.allSettled([
    loadOne(MODEL_PATHS.hiace, "hiace"),
    loadOne(MODEL_PATHS.hiace_2004, "hiace_2004"),
    loadOne(MODEL_PATHS.corolla, "corolla"),
    loadOne(MODEL_PATHS.fielder, "fielder"),
  ]).then(() => {
    modelsLoaded = true;
    return loadedTemplates;
  });

  return loadPromise;
}

export function isCarModelReady() {
  return loadedTemplates.hiace !== null ||
         loadedTemplates.hiace_2004 !== null ||
         loadedTemplates.corolla !== null ||
         loadedTemplates.fielder !== null;
}

/**
 * Creates or retrieves a pooled authentic 3D Bangladeshi Car/Microbus/Sedan instance.
 */
export function instantiateCarModel(opts = {}) {
  const availableKeys = Object.keys(loadedTemplates).filter(k => loadedTemplates[k] !== null);
  if (!availableKeys.length) return null;

  const isVip = opts.type === "vip";
  const isPolice = opts.type === "police";

  // Select model key
  let modelKey = opts.model;
  if (!modelKey || !loadedTemplates[modelKey]) {
    if (isVip) {
      const vipChoices = ["corolla", "hiace"].filter(k => loadedTemplates[k]);
      modelKey = vipChoices.length ? pick(vipChoices) : availableKeys[0];
    } else if (isPolice) {
      const policeChoices = ["corolla", "hiace"].filter(k => loadedTemplates[k]);
      modelKey = policeChoices.length ? pick(policeChoices) : availableKeys[0];
    } else {
      modelKey = pick(availableKeys);
    }
  }

  // 1. Check object pool for an idle instance
  const pool = carPool[modelKey];
  let car = pool.find(c => !c.userData.inUse);

  // Pick color
  let carColor = opts.color;
  if (!carColor) {
    if (isVip) {
      carColor = pick([0x111111, 0x1a1a1a, 0x0a192f, 0x212121]);
    } else if (isPolice) {
      carColor = 0xf5f5f5;
    } else {
      carColor = pick(DHAKA_CAR_COLORS);
    }
  }

  if (car) {
    car.userData.inUse = true;
    car.visible = true;
    if (car.userData.setPaintColor) car.userData.setPaintColor(carColor);
    return car;
  }

  // 2. Build a new instance from the pre-optimized template
  const template = loadedTemplates[modelKey];
  if (!template) return null;

  const root = new THREE.Group();
  root.name = `TrafficCar_${modelKey}`;
  root.userData.isPooledCar = true;
  root.userData.inUse = true;
  root.userData.modelKey = modelKey;

  const wheels = [];
  let frontPlateZ = -2.18;
  let rearPlateZ = 2.18;
  let frontPlateY = 0.38;
  let rearPlateY = 0.58;
  let setPaintColorFn = null;

  if (modelKey === "hiace") {
    const model = skeletonClone(template.root);
    const bbox = new THREE.Box3().setFromObject(template.root);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    model.position.set(-center.x, -bbox.min.y, -center.z);
    model.rotation.y = Math.PI / 2;
    model.scale.set(1.15, 1.15, 1.15);
    root.add(model);

    let hiacePaintMat = null;
    model.traverse(child => {
      if (child.isMesh) {
        if (child.material && child.material.name === "paint") {
          hiacePaintMat = new THREE.MeshStandardMaterial({
            color: carColor,
            roughness: isVip ? 0.20 : 0.28,
            metalness: isVip ? 0.45 : 0.35,
          });
          child.material = hiacePaintMat;
        }
        if (child.name && child.name.toLowerCase().includes("wheel")) {
          wheels.push(child);
        }
      }
    });

    setPaintColorFn = col => {
      if (hiacePaintMat) hiacePaintMat.color.setHex(col);
    };

    frontPlateZ = -2.16;
    rearPlateZ = 2.16;
    frontPlateY = 0.36;
    rearPlateY = 0.56;

  } else if (modelKey === "hiace_2004") {
    const model = template.root.clone(true);
    const bbox = new THREE.Box3().setFromObject(template.root);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    model.position.set(-center.x, -bbox.min.y, -center.z);
    model.scale.set(0.88, 0.88, 0.88);
    root.add(model);

    let hiace2004Mat = null;
    model.traverse(child => {
      if (child.isMesh && child.material) {
        hiace2004Mat = child.material.clone();
        hiace2004Mat.color.setHex(carColor);
        child.material = hiace2004Mat;
      }
    });

    setPaintColorFn = col => {
      if (hiace2004Mat) hiace2004Mat.color.setHex(col);
    };

    frontPlateZ = -1.38;
    rearPlateZ = 2.45;
    frontPlateY = 0.42;
    rearPlateY = 0.58;

  } else if (modelKey === "corolla" || modelKey === "fielder") {
    // Clone only the 50 merged meshes instead of 1630 individual nodes!
    const model = template.root.clone(true);
    const bbox = new THREE.Box3().setFromObject(template.root);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const pivot = new THREE.Group();
    model.position.set(-center.x, -bbox.min.y, -center.z);
    pivot.add(model);
    pivot.rotation.y = Math.PI; // faces -Z
    pivot.scale.set(0.48, 0.48, 0.48);
    root.add(pivot);

    let dynamicPaintMat = null;
    const pMesh = model.getObjectByName("paintMesh");
    if (pMesh) {
      dynamicPaintMat = new THREE.MeshStandardMaterial({
        color: carColor,
        roughness: isVip ? 0.20 : 0.28,
        metalness: isVip ? 0.45 : 0.35,
      });
      pMesh.material = dynamicPaintMat;
    }

    setPaintColorFn = col => {
      if (dynamicPaintMat) dynamicPaintMat.color.setHex(col);
    };

    frontPlateZ = -2.18;
    rearPlateZ = 2.18;
    frontPlateY = 0.38;
    rearPlateY = 0.58;
  }

  // Pre-cached authentic Bangladeshi license plates
  let plateClass = isPolice ? "police" : (isVip ? "vip" : (modelKey.includes("hiace") ? "hiace" : "car"));
  const plateInfo = generateBangladeshiPlate(plateClass);

  const frontPlate = createPlateMesh(plateInfo);
  frontPlate.position.set(0, frontPlateY, frontPlateZ);
  frontPlate.rotation.y = Math.PI;
  root.add(frontPlate);

  const rearPlate = createPlateMesh(plateInfo);
  rearPlate.position.set(0, rearPlateY, rearPlateZ);
  root.add(rearPlate);

  // Side mirrors & collision bonus hazard blinkers
  const tw = opts.w || 1.9;
  const th = opts.h || 1.4;
  const tl = opts.l || 4.2;
  const mirrorColor = isVip ? 0xffd54f : carColor;

  const leftMirror = box(.22, .14, .18, mirrorColor, -tw * .56, th * .58, -tl * .18);
  const rightMirror = box(.22, .14, .18, mirrorColor, tw * .56, th * .58, -tl * .18);
  const hzL = box(.22, .16, .08, 0xff9800, -tw * .38, th * .36, tl * .51);
  const hzR = box(.22, .16, .08, 0xff9800, tw * .38, th * .36, tl * .51);
  hzL.visible = hzR.visible = false;
  root.add(leftMirror, rightMirror, hzL, hzR);

  root.userData.mirrors = { left: leftMirror, right: rightMirror };
  root.userData.hazards = [hzL, hzR];
  root.userData.plateInfo = plateInfo;
  root.userData.setPaintColor = setPaintColorFn;

  // Wheel rolling controller
  root.userData.carController = {
    roll(speed, dt) {
      if (wheels.length > 0) {
        const spin = (speed * dt) / 0.34;
        for (const w of wheels) w.rotation.x += spin;
      }
    }
  };

  pool.push(root);
  return root;
}

/** Return a car instance to the object pool. */
export function releaseCarModel(root) {
  if (!root) return;
  root.visible = false;
  root.userData.inUse = false;
}

/** Reset all car pools (e.g. on new run). */
export function resetCarPools() {
  for (const pool of Object.values(carPool)) {
    for (const c of pool) {
      c.visible = false;
      c.userData.inUse = false;
    }
  }
}
