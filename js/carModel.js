// Loader and factory for authentic 3D Bangladeshi traffic cars & microbuses (Toyota Hiace, Corolla).
// Features:
// - Dynamic randomized authentic Dhaka automotive colors per vehicle instance (Pearl White, Silver, Black, Navy, etc.)
// - Dynamic authentic BRTA Bangladeshi Digital License Plates (e.g. ঢাকা মেট্রো-চ ১১-৪৫৬৭, ঢাকা মেট্রো-গ ২৮-৩৪১২)
// - Front and rear matching number plates
// - Smooth rolling wheels synchronized with vehicle speed
// - Side mirrors and hazard blinkers for stunt bonuses

import * as THREE from "three";
import { GLTFLoader } from "./GLTFLoader.js";
import { clone as skeletonClone } from "./SkeletonUtils.js";
import { pick, rnd } from "./utils.js";
import { box } from "./world.js";

const HIACE_PATH = "models/hiace.glb";
const COROLLA_PATH = "models/corolla.glb";

let hiaceGltf = null;
let corollaGltf = null;
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
  const geo = new THREE.PlaneGeometry(0.46, 0.23);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** Preload vehicle 3D models. */
export function loadCarModels() {
  if (hiaceGltf) return Promise.resolve(hiaceGltf);
  if (loadPromise) return loadPromise;

  const loader = new GLTFLoader();
  loadPromise = new Promise(resolve => {
    loader.load(
      HIACE_PATH,
      gltf => {
        hiaceGltf = gltf;
        gltf.scene.traverse(node => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        resolve(hiaceGltf);
      },
      undefined,
      err => {
        console.warn("Could not load Hiace GLB, using procedural fallback:", err);
        resolve(null);
      }
    );
  });
  return loadPromise;
}

export function isCarModelReady() {
  return hiaceGltf !== null;
}

/**
 * Creates an authentic 3D Bangladeshi Car/Microbus instance with dynamic paint & number plates.
 */
export function instantiateCarModel(opts = {}) {
  const baseGltf = hiaceGltf;
  if (!baseGltf) return null;

  const root = new THREE.Group();
  root.name = "BangladeshiTrafficCarInstance";

  const isVip = opts.type === "vip";
  const isPolice = opts.type === "police";

  // Pick color: prioritize explicit color, or pick randomly from Dhaka palette
  let carColor = opts.color;
  if (!carColor) {
    if (isVip) {
      carColor = pick([0x111111, 0x1a1a1a, 0x0a192f]); // VIP Black / Deep Navy
    } else if (isPolice) {
      carColor = 0xf5f5f5; // Police White
    } else {
      carColor = pick(DHAKA_CAR_COLORS);
    }
  }

  // Clone using SkeletonUtils to support skinned meshes
  const model = skeletonClone(baseGltf.scene);

  const bbox = new THREE.Box3().setFromObject(baseGltf.scene);
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  // Center model and orient forward along -Z
  model.position.set(-center.x, -bbox.min.y, -center.z);
  model.rotation.y = Math.PI / 2;

  // Scale: Hiace length is 3.74m * 1.15 = 4.3m length, width 1.85m, height 1.75m
  const scale = opts.scale || 1.15;
  model.scale.set(scale, scale, scale);
  root.add(model);

  // Dynamic automotive paint material
  const paintMat = new THREE.MeshStandardMaterial({
    color: carColor,
    roughness: isVip ? 0.20 : 0.28,
    metalness: isVip ? 0.45 : 0.35,
  });

  const wheels = [];
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

  // Generate authentic Bangladeshi Number Plates
  const plateClass = isPolice ? "police" : (isVip ? "vip" : (opts.type || "hiace"));
  const plateInfo = generateBangladeshiPlate(plateClass);

  // Front Number Plate: faces forward (-Z), rotated by Math.PI so text is not mirrored
  const frontPlate = createPlateMesh(plateInfo);
  frontPlate.position.set(0, 0.36, -2.16);
  frontPlate.rotation.y = Math.PI;
  root.add(frontPlate);

  // Rear Number Plate: faces rear (+Z), covering original white plate
  const rearPlate = createPlateMesh(plateInfo);
  rearPlate.position.set(0, 0.56, 2.16);
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

  // Wheel rolling controller
  const controller = {
    roll(speed, dt) {
      const spin = (speed * dt) / 0.34;
      for (const w of wheels) {
        w.rotation.x += spin;
      }
    }
  };

  root.userData.carController = controller;
  return root;
}
