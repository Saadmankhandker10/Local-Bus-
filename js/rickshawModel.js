// Loader and factory for the authentic 3D Bangladeshi Cycle Rickshaw GLB model.
// Produces detailed, shadow-casting rickshaw instances with rotating spoked wheels,
// traditional painted hood canopy colorways, and lungi & gamchha-clad pullers
// with animated pedaling legs and handlebars grip.

import * as THREE from "three";
import { GLTFLoader } from "./GLTFLoader.js";
import { person } from "./world.js";
import { pick } from "./utils.js";

const MODEL_PATH = "models/rickshaw.glb";

let cachedGltf = null;
let loadPromise = null;

// Traditional Dhaka rickshaw hood color variations
export const RICKSHAW_HOOD_COLORS = [
  0x1b5e20, // Emerald Green
  0xd50000, // Crimson Red
  0x0d47a1, // Royal Blue
  0xf57f17, // Marigold Yellow
  0x4a148c, // Deep Purple
  0x00838f, // Peacock Teal
];

/** Load and cache the GLB rickshaw model. */
export function loadRickshawModel() {
  if (cachedGltf) return Promise.resolve(cachedGltf);
  if (loadPromise) return loadPromise;

  const loader = new GLTFLoader();
  loadPromise = new Promise((resolve, reject) => {
    loader.load(
      MODEL_PATH,
      gltf => {
        cachedGltf = gltf;
        gltf.scene.traverse(node => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.material) {
              node.material.roughness = Math.max(0.35, node.material.roughness || 0.5);
            }
          }
        });
        resolve(cachedGltf);
      },
      undefined,
      err => {
        console.warn("Could not load GLB rickshaw model, fallback to procedural:", err);
        reject(err);
      }
    );
  });
  return loadPromise;
}

/** Check if rickshaw model is ready. */
export function isRickshawModelReady() {
  return cachedGltf !== null;
}

/**
 * Creates an instance of the authentic 3D Bangladeshi Rickshaw.
 */
export function instantiateRickshawModel(opts = {}) {
  if (!cachedGltf) return null;

  const root = new THREE.Group();
  root.name = "BangladeshiRickshawInstance";

  // Deep clone scene hierarchy so materials and wheels roll independently
  const model = cachedGltf.scene.clone(true);

  // In original FBX, front points to -X. Rotating by -Math.PI / 2 points front to -Z (forward on road).
  model.rotation.y = -Math.PI / 2;

  // Scale: fits our 1.3m x 2.6m traffic bounding box
  const scale = opts.scale || 0.82;
  model.scale.set(scale, scale, scale);
  root.add(model);

  // Find all wheel & tire nodes
  const wheels = [];
  ['tire_front', 'wheel_spoke_front', 'tire_back_left', 'wheel_spoke_back_left', 'tire_back_right', 'wheel_spoke_back_right'].forEach(name => {
    const obj = model.getObjectByName(name);
    if (obj) wheels.push(obj);
  });

  // Authentic lungi & gamchha clad rickshaw puller
  const pullerColor = pick([0xffffff, 0x8d6e63, 0x1e88e5, 0x2e7d32, 0xd84315]);
  const puller = person(pullerColor, 0, null, true);
  puller.rotation.y = Math.PI; // Face forward towards handlebars (-Z)
  puller.position.set(0, 0.70, -0.32);
  puller.scale.set(0.85, 0.85, 0.85);

  // Pose puller: torso leaning forward, arms holding handlebars, legs bent towards pedals
  if (puller.userData.torso) puller.userData.torso.rotation.x = -0.32;
  if (puller.userData.leftArm) puller.userData.leftArm.rotation.x = 1.05;
  if (puller.userData.rightArm) puller.userData.rightArm.rotation.x = 1.05;
  if (puller.userData.leftLeg) puller.userData.leftLeg.rotation.x = -0.45;
  if (puller.userData.rightLeg) puller.userData.rightLeg.rotation.x = 0.3;

  root.add(puller);

  // Optional color tint for the folding hood canopy
  const hoodMesh = model.getObjectByName("seat");
  if (hoodMesh && hoodMesh.material) {
    hoodMesh.material = hoodMesh.material.clone();
    if (opts.color) {
      hoodMesh.material.color.setHex(opts.color);
    }
  }

  // Wheel rolling & pedaling controller
  let pullerT = 0;
  const controller = {
    roll(speed, dt) {
      const spin = (speed * dt) / 0.35; // angle = distance / radius
      for (const w of wheels) {
        w.rotation.z += spin;
      }
      pullerT += dt * (speed / 0.35);
      const pedalCycle = Math.sin(pullerT * 2.5) * 0.4;
      if (puller.userData.leftLeg) puller.userData.leftLeg.rotation.x = -0.15 + pedalCycle;
      if (puller.userData.rightLeg) puller.userData.rightLeg.rotation.x = -0.15 - pedalCycle;
    }
  };

  root.userData.rickshawController = controller;
  return root;
}
