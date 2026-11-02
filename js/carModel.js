// Loader and factory for authentic 3D Bangladeshi traffic cars, microbuses & sedans:
// 1. Toyota Hiace 2005 Microbus (`models/hiace.glb`)
// 2. Toyota Hiace 2004 Classic Boxy Microbus (`models/hiace_2004.glb`)
// 3. Toyota Corolla Luxel Private Sedan (`models/corolla.glb`)
// 4. Toyota Corolla Fielder Station Wagon (`models/fielder.glb`)
//
// Features:
// - Dynamic randomized authentic Dhaka automotive colors per vehicle instance (Pearl White, Silver, Black, Navy, etc.)
// - Dynamic authentic BRTA Bangladeshi Digital License Plates (e.g. ঢাকা মেট্রো-চ ১১-৪৫৬৭, ঢাকা মেট্রো-গ ২৮-৩৪১২)
// - Front and rear matching number plates mounted on front & rear bumpers
// - Smooth rolling wheels synchronized with vehicle speed
// - Side mirrors and hazard blinkers for stunt bonuses

import * as THREE from "three";
import { GLTFLoader } from "./GLTFLoader.js";
import { clone as skeletonClone } from "./SkeletonUtils.js";
import { pick, rnd } from "./utils.js";
import { box } from "./world.js";

const MODEL_PATHS = {
  hiace: "models/hiace.glb",
  hiace_2004: "models/hiace_2004.glb",
  corolla: "models/corolla.glb",
  fielder: "models/fielder.glb"
};

const loadedModels = {
  hiace: null,
  hiace_2004: null,
  corolla: null,
  fielder: null
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

/** Generate authentic BRTA registration plate details. */
export function generateBangladeshiPlate(vehicleClass = "hiace") {
  let letter = "চ"; // Default microbus
  if (vehicleClass === "car" || vehicleClass === "sedan") {
    letter = pick(["গ", "খ", "ক"]);
  } else if (vehicleClass === "vip" || vehicleClass === "suv") {
    letter = pick(["ঘ", "ভ", "গ"]);
  } else if (vehicleClass === "bus") {
    letter = "ব";
  } else if (vehicleClass === "police") {
    letter = "ম";
  }

  const seriesList = [11, 12, 13, 14, 15, 21, 23, 28, 33, 34, 43, 53];
  const series = pick(seriesList);
  const regNumber = Math.floor(1000 + Math.random() * 9000);

  return {
    top: `ঢাকা মেট্রো-${letter}`,
    bottom: `${toBanglaDigits(series)}-${toBanglaDigits(regNumber)}`
  };
}

// Cache canvas textures so duplicate plates do not leak GPU memory
const plateTexCache = new Map();

/** Create a canvas texture for a Bangladeshi license plate. */
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
  plateTexCache.set(key, tex);
  return tex;
}

/** Create a 3D Mesh with the license plate. */
export function createPlateMesh(plateInfo) {
  const tex = createPlateTexture(plateInfo);
  const geo = new THREE.PlaneGeometry(0.48, 0.24);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** Preload all vehicle 3D models in parallel. */
export function loadCarModels() {
  if (modelsLoaded) return Promise.resolve(loadedModels);
  if (loadPromise) return loadPromise;

  const loader = new GLTFLoader();
  const loadOne = (path, key) => new Promise(resolve => {
    loader.load(
      path,
      gltf => {
        loadedModels[key] = gltf;
        gltf.scene.traverse(node => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        resolve(gltf);
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
    return loadedModels;
  });

  return loadPromise;
}

export function isCarModelReady() {
  return loadedModels.hiace !== null ||
         loadedModels.hiace_2004 !== null ||
         loadedModels.corolla !== null ||
         loadedModels.fielder !== null;
}

/**
 * Creates an authentic 3D Bangladeshi Car/Microbus/Sedan instance with dynamic paint & number plates.
 */
export function instantiateCarModel(opts = {}) {
  const availableKeys = Object.keys(loadedModels).filter(k => loadedModels[k] !== null);
  if (!availableKeys.length) return null;

  const isVip = opts.type === "vip";
  const isPolice = opts.type === "police";

  // Select model: explicit, or chosen based on type
  let modelKey = opts.model;
  if (!modelKey || !loadedModels[modelKey]) {
    if (isVip) {
      // VIPs prefer sleek sedans or executive microbuses
      const vipChoices = ["corolla", "hiace"].filter(k => loadedModels[k]);
      modelKey = vipChoices.length ? pick(vipChoices) : availableKeys[0];
    } else if (isPolice) {
      const policeChoices = ["corolla", "hiace"].filter(k => loadedModels[k]);
      modelKey = policeChoices.length ? pick(policeChoices) : availableKeys[0];
    } else {
      modelKey = pick(availableKeys);
    }
  }

  const baseGltf = loadedModels[modelKey];
  if (!baseGltf) return null;

  const root = new THREE.Group();
  root.name = `TrafficCar_${modelKey}`;

  // Pick color: prioritize explicit color, or pick randomly from Dhaka palette
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

  // Dynamic automotive paint material
  const paintMat = new THREE.MeshStandardMaterial({
    color: carColor,
    roughness: isVip ? 0.20 : 0.28,
    metalness: isVip ? 0.45 : 0.35,
  });

  const wheels = [];
  let frontPlateZ = -2.18;
  let rearPlateZ = 2.18;
  let frontPlateY = 0.38;
  let rearPlateY = 0.58;

  // Build model instance according to model architecture
  if (modelKey === "hiace") {
    // 2005 Toyota Hiace Microbus (SkinnedMesh cloned via SkeletonUtils)
    const model = skeletonClone(baseGltf.scene);
    const bbox = new THREE.Box3().setFromObject(baseGltf.scene);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    model.position.set(-center.x, -bbox.min.y, -center.z);
    model.rotation.y = Math.PI / 2;
    model.scale.set(1.15, 1.15, 1.15);
    root.add(model);

    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material && child.material.name === "paint") {
          child.material = paintMat;
        }
        if (child.name && child.name.toLowerCase().includes("wheel")) {
          wheels.push(child);
        }
      }
    });

    frontPlateZ = -2.16;
    rearPlateZ = 2.16;
    frontPlateY = 0.36;
    rearPlateY = 0.56;

  } else if (modelKey === "hiace_2004") {
    // 2004 Classic Toyota Hiace (Single mesh)
    const model = baseGltf.scene.clone(true);
    const bbox = new THREE.Box3().setFromObject(baseGltf.scene);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    model.position.set(-center.x, -bbox.min.y, -center.z);
    model.rotation.y = 0; // faces -Z
    model.scale.set(0.88, 0.88, 0.88);
    root.add(model);

    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = child.material.clone();
          child.material.color.setHex(carColor);
        }
      }
    });

    frontPlateZ = -1.38;
    rearPlateZ = 2.45;
    frontPlateY = 0.42;
    rearPlateY = 0.58;

  } else if (modelKey === "corolla") {
    // 2005 Toyota Corolla Luxel Private Sedan
    const model = baseGltf.scene.clone(true);
    const bbox = new THREE.Box3().setFromObject(baseGltf.scene);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const pivot = new THREE.Group();
    model.position.set(-center.x, -bbox.min.y, -center.z);
    pivot.add(model);
    pivot.rotation.y = Math.PI; // faces -Z
    pivot.scale.set(0.48, 0.48, 0.48);
    root.add(pivot);

    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          const name = child.material.name || "";
          if (name.includes("Dark_Blue") || name.includes("Paint1") || name.includes("Color_E01") || name.includes("Color_E012") || name.includes("Color_M05")) {
            child.material = paintMat;
          }
        }
      }
    });

    frontPlateZ = -2.18;
    rearPlateZ = 2.18;
    frontPlateY = 0.38;
    rearPlateY = 0.58;

  } else if (modelKey === "fielder") {
    // 2006 Toyota Corolla Fielder Station Wagon
    const model = baseGltf.scene.clone(true);
    const bbox = new THREE.Box3().setFromObject(baseGltf.scene);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const pivot = new THREE.Group();
    model.position.set(-center.x, -bbox.min.y, -center.z);
    pivot.add(model);
    pivot.rotation.y = Math.PI; // faces -Z
    pivot.scale.set(0.48, 0.48, 0.48);
    root.add(pivot);

    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          const name = child.material.name || "";
          if (name.includes("Super_Red") || name.includes("0012_dark_red1") || name.includes("Paint1") || name.includes("Color_E01") || name.includes("Color_E011")) {
            child.material = paintMat;
          }
        }
      }
    });

    frontPlateZ = -2.18;
    rearPlateZ = 2.18;
    frontPlateY = 0.38;
    rearPlateY = 0.58;
  }

  // Generate authentic Bangladeshi Number Plates
  let plateClass = "car";
  if (isPolice) {
    plateClass = "police";
  } else if (isVip) {
    plateClass = "vip";
  } else if (modelKey.includes("hiace")) {
    plateClass = "hiace";
  } else {
    plateClass = "car";
  }
  const plateInfo = generateBangladeshiPlate(plateClass);

  // Front Number Plate (faces forward -Z, rotated Math.PI so text is not mirrored)
  const frontPlate = createPlateMesh(plateInfo);
  frontPlate.position.set(0, frontPlateY, frontPlateZ);
  frontPlate.rotation.y = Math.PI;
  root.add(frontPlate);

  // Rear Number Plate (faces rear +Z)
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
  root.userData.modelKey = modelKey;

  // Wheel rolling controller (rolls available wheel nodes, or oscillates subtle vehicle pitch)
  const controller = {
    roll(speed, dt) {
      if (wheels.length > 0) {
        const spin = (speed * dt) / 0.34;
        for (const w of wheels) w.rotation.x += spin;
      }
    }
  };

  root.userData.carController = controller;
  return root;
}
