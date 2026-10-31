// Time of day along the journey: sky shader, soft shadows, lights, fog, and exposure.
// Smoothly blends the 15 atmospheric parameters between Dhaka daylight keyframes.
import * as THREE from "three";
import { ROUTE } from "./route.js";
import { scene, sun, hemi, groundMat, skyUniforms, skyMesh, renderer, setBuildingEmissive } from "./world.js";
import { cam } from "./camera.js";
import { bus } from "./bus.js";
import { blackoutState } from "./shaders.js";

const K = ROUTE.sky;
// Reused colour objects, so nothing new is created every frame.
const a = new THREE.Color(), b = new THREE.Color();

function mix(target, hexA, hexB, t) {
  target.copy(a.setHex(hexA).lerp(b.setHex(hexB), t));
}

/** Set the sky shader, soft shadows, lights, and exposure for a point on the journey (p = 0 start .. 1 end). */
export function applyTimeOfDay(p) {
  let i = 0;
  while (i < K.length - 2 && p > K[i + 1].p) i++;
  const k0 = K[i], k1 = K[i + 1];
  const t = Math.min(1, Math.max(0, (p - k0.p) / (k1.p - k0.p)));

  // Custom sky dome shader atmospheric gradient
  mix(skyUniforms.top.value, k0.skyTop, k1.skyTop, t);
  mix(skyUniforms.hor.value, k0.skyHor, k1.skyHor, t);
  mix(skyUniforms.sunCol.value, k0.sunCol, k1.sunCol, t);

  // Fog color matches horizon exactly so distant streetscape fades seamlessly
  mix(scene.fog.color, k0.skyHor, k1.skyHor, t);
  scene.fog.near = (k0.fogNear || 50) + ((k1.fogNear || 50) - (k0.fogNear || 50)) * t;
  scene.fog.far = (k0.fogFar || 170) + ((k1.fogFar || 170) - (k0.fogFar || 170)) * t;

  // Directional sun and hemisphere ambient light
  mix(sun.color, k0.sunCol, k1.sunCol, t);
  sun.intensity = k0.sunI + (k1.sunI - k0.sunI) * t;

  mix(hemi.color, k0.hemiSky || 0xffeedd, k1.hemiSky || 0xffeedd, t);
  mix(hemi.groundColor, k0.hemiGround || 0x556655, k1.hemiGround || 0x556655, t);
  hemi.intensity = k0.hemiI + (k1.hemiI - k0.hemiI) * t;

  // Cinematic ACES Filmic exposure
  const exp0 = k0.exposure || 1.1, exp1 = k1.exposure || 1.1;
  let curExp = exp0 + (exp1 - exp0) * t;

  // Loadshedding blackout effect: drop ambient and sun brightness while vehicle lights shine
  if (blackoutState.uniform.value > 0) {
    const dim = 1.0 - blackoutState.uniform.value * 0.42;
    sun.intensity *= dim;
    hemi.intensity *= dim;
    curExp *= (1.0 - blackoutState.uniform.value * 0.18);
  }
  renderer.toneMappingExposure = curExp;

  // Ground plane tint
  mix(groundMat.color, k0.ground, k1.ground, t);

  // Building night window glow between dusk (p=0.68) and night (p=0.82)
  const nightFactor = Math.min(1, Math.max(0, (p - 0.68) / 0.14));
  setBuildingEmissive(nightFactor);

  // Dynamic sun angle & shadow camera frustum tracking around the bus
  const offX = k0.sunPos[0] + (k1.sunPos[0] - k0.sunPos[0]) * t;
  const offY = k0.sunPos[1] + (k1.sunPos[1] - k0.sunPos[1]) * t;
  const offZ = k0.sunPos[2] + (k1.sunPos[2] - k0.sunPos[2]) * t;

  const bx = bus.position?.x || 0, by = bus.position?.y || 0, bz = bus.position?.z || 0;
  sun.target.position.set(bx, by, bz);
  sun.target.updateMatrixWorld();
  sun.position.set(bx + offX, by + offY, bz + offZ);
  skyUniforms.sunDir.value.set(offX, offY, offZ).normalize();

  // Keep sky dome centered on the camera
  if (skyMesh && cam) {
    skyMesh.position.set(cam.position.x, cam.position.y, cam.position.z);
  }
}
