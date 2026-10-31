// Loader and factory for the authentic 3D Bangladeshi Local Bus GLB model.
// Caches the loaded template and produces fully articulated, shadow-casting bus instances
// for both the player's bus and AI traffic buses with operator colorways.

import * as THREE from "three";
import { GLTFLoader } from "./GLTFLoader.js";
import { plate } from "./world.js";
import { pick } from "./utils.js";

const MODEL_PATH = "models/bangladeshi_bus.glb";

// Dhaka local bus operator liveries for traffic buses
export const BUS_OPERATORS = [
  { name: "বিহঙ্গ পরিবহন", card: "মিরপুর — আজিমপুর", bodyTint: 0x1976d2, bannerBg: "#0d47a1", bannerFg: "#ffeb3b" },
  { name: "প্রজাপতি পরিবহন", card: "মোহাম্মদপুর — আবদুল্লাহপুর", bodyTint: 0x2e7d32, bannerBg: "#1b5e20", bannerFg: "#ffffff" },
  { name: "বিকাশ পরিবহন", card: "কমলাপুর — গাবতলী", bodyTint: 0x6a1b9a, bannerBg: "#4a148c", bannerFg: "#ffd54f" },
  { name: "রাইদা পরিবহন", card: "পোস্তগোলা — দিয়াবাড়ী", bodyTint: 0x00838f, bannerBg: "#006064", bannerFg: "#ffffff" },
  { name: "শতাব্দী পরিবহন", card: "মতিঝিল — মিরপুর", bodyTint: 0xf57f17, bannerBg: "#e65100", bannerFg: "#ffffff" },
  { name: "মিরপুর লিংক", card: "মিরপুর ১২ — সায়েদাবাদ", bodyTint: 0xc62828, bannerBg: "#b71c1c", bannerFg: "#ffeb3b" },
  { name: "স্বাধীন এক্সপ্রেস", card: "গাজীপুর — নিউমার্কেট", bodyTint: 0x37474f, bannerBg: "#212121", bannerFg: "#00e5ff" },
];

let cachedGltf = null;
let loadPromise = null;

/** Load and cache the GLTF bus model. Returns the raw gltf object. */
export function loadBusModel() {
  if (cachedGltf) return Promise.resolve(cachedGltf);
  if (loadPromise) return loadPromise;

  const loader = new GLTFLoader();
  loadPromise = new Promise((resolve, reject) => {
    loader.load(
      MODEL_PATH,
      gltf => {
        cachedGltf = gltf;
        // Optimize materials & shadow settings on template
        gltf.scene.traverse(node => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.material) {
              node.material.roughness = Math.max(0.35, node.material.roughness || 0.5);
              node.material.metalness = Math.min(0.8, node.material.metalness || 0.1);
            }
          }
        });
        resolve(cachedGltf);
      },
      undefined,
      err => {
        console.warn("Could not load GLB bus model, will use procedural fallback:", err);
        reject(err);
      }
    );
  });
  return loadPromise;
}

/** Check if model is already loaded and ready synchronously. */
export function isBusModelReady() {
  return cachedGltf !== null;
}

/**
 * Creates an instance of the 3D Bangladeshi bus.
 * Options:
 *   scale: uniform scale (default 0.85 to fit Dhaka lanes)
 *   operator: operator object for traffic buses (tints body & adds sign)
 *   isPlayer: boolean
 */
export function instantiateBusModel(opts = {}) {
  if (!cachedGltf) return null;

  const root = new THREE.Group();
  root.name = "BangladeshiBusInstance";

  // Deep clone scene hierarchy so wheel nodes and materials can be manipulated independently
  const model = cachedGltf.scene.clone(true);

  // Front of GLB faces +Z; our game bus drives forward in -Z direction.
  // Rotating by Math.PI (180°) aligns front with -Z, and places passenger door on left (-X).
  model.rotation.y = Math.PI;

  const scale = opts.scale || 0.85;
  model.scale.set(scale, scale, scale);
  root.add(model);

  // Find wheel nodes by their exact names from the GLB hierarchy
  const wheelFL = model.getObjectByName("Wheel_FL");
  const wheelFR = model.getObjectByName("Wheel_FR");
  const wheelRL = model.getObjectByName("Wheel_RL");
  const wheelRR = model.getObjectByName("Wheel_RR");

  const wheels = [wheelFL, wheelFR, wheelRL, wheelRR].filter(Boolean);

  // Find body mesh and clone material if custom operator tint is requested
  let bodyMesh = null;
  let bodyMaterial = null;
  let glassMesh = null;

  model.traverse(node => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.name.includes("Body") || (node.material && node.material.name === "Bus_Body")) {
        bodyMesh = node;
        if (opts.operator || opts.tint) {
          // Clone material for this specific bus instance
          node.material = node.material.clone();
          bodyMaterial = node.material;
          const tintColor = opts.tint || (opts.operator && opts.operator.bodyTint);
          if (tintColor) {
            node.material.color.setHex(tintColor);
          }
        } else {
          bodyMaterial = node.material;
        }
      }
      if (node.name.includes("Glass") || (node.material && node.material.name === "Bus_Glass")) {
        glassMesh = node;
      }
    }
  });

  // Attach operator signboard for traffic buses
  if (opts.operator) {
    const op = opts.operator;
    const signW = 3.6, signH = 0.55;
    // Front destination plate above windscreen
    const frontPlate = plate(op.name, signW, signH, op.bannerBg, op.bannerFg);
    frontPlate.position.set(0, 2.72 * scale, -4.85 * scale);
    root.add(frontPlate);

    // Left side banner
    const sidePlateL = plate(`${op.name} • ${op.card}`, 4.8, 0.48, op.bannerBg, op.bannerFg);
    sidePlateL.position.set(-1.32 * scale, 2.65 * scale, 0);
    sidePlateL.rotation.y = -Math.PI / 2;
    root.add(sidePlateL);

    // Right side banner
    const sidePlateR = plate(`${op.name} • ${op.card}`, 4.8, 0.48, op.bannerBg, op.bannerFg);
    sidePlateR.position.set(1.32 * scale, 2.65 * scale, 0);
    sidePlateR.rotation.y = Math.PI / 2;
    root.add(sidePlateR);
  }

  return {
    root,
    model,
    wheels,
    wheelFL,
    wheelFR,
    wheelRL,
    wheelRR,
    bodyMesh,
    bodyMaterial,
    glassMesh,
    scale,
    rollDistance: 0,
    /** Roll wheels forward at given ground speed */
    roll(speed, dt) {
      const dist = (speed * dt) / (0.53 * scale);
      for (let i = 0; i < wheels.length; i++) {
        // Since model is rotated 180° around Y, rolling forward is +X on wheels
        wheels[i].rotation.x += dist;
      }
    },
    /** Steer front wheels smoothly based on steering angle (radians) */
    steer(yawAngle) {
      if (wheelFL) wheelFL.rotation.y = -yawAngle;
      if (wheelFR) wheelFR.rotation.y = -yawAngle;
    }
  };
}
