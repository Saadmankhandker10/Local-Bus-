// Time of day along the journey: sky, fog, sun, and ground colours.
// Time-of-day lighting: the route has a few "key moments" (dawn, noon, golden hour, night);
// between two keys every colour is blended smoothly by how far the bus has driven.
import * as THREE from "three";
import { ROUTE } from "./route.js";
import { scene, sun, hemi, groundMat } from "./world.js";

const K = ROUTE.sky;
// Reused colour objects, so nothing new is created every frame.
const a = new THREE.Color(), b = new THREE.Color();

function mix(target, hexA, hexB, t) {
  target.copy(a.setHex(hexA).lerp(b.setHex(hexB), t));
}

/** Set the sky and lights for a point on the journey (p = 0 start .. 1 end). */
export function applyTimeOfDay(p) {
  let i = 0;
  while (i < K.length - 2 && p > K[i + 1].p) i++;
  const k0 = K[i], k1 = K[i + 1];
  const t = Math.min(1, Math.max(0, (p - k0.p) / (k1.p - k0.p)));

  mix(scene.background, k0.sky, k1.sky, t);
  mix(scene.fog.color, k0.fog, k1.fog, t);
  scene.fog.far = k0.fogFar + (k1.fogFar - k0.fogFar) * t;
  mix(sun.color, k0.sun, k1.sun, t);
  sun.intensity = k0.sunI + (k1.sunI - k0.sunI) * t;
  hemi.intensity = k0.hemiI + (k1.hemiI - k0.hemiI) * t;
  sun.position.set(
    k0.sunPos[0] + (k1.sunPos[0] - k0.sunPos[0]) * t,
    k0.sunPos[1] + (k1.sunPos[1] - k0.sunPos[1]) * t,
    k0.sunPos[2] + (k1.sunPos[2] - k0.sunPos[2]) * t,
  );
  mix(groundMat.color, k0.ground, k1.ground, t);
}
