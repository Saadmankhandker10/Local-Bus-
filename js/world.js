// Renderer, scene, lights, and the scrolling road with buildings.
// The bus never really moves forward: the world slides towards the camera instead,
// which keeps all numbers small and avoids precision problems on long runs.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";

const W = CFG.world;
const R = W.roadHalfWidth;

/* ====== Renderer, scene, lights (the camera lives in camera.js) ====== */
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, CFG.render.maxPixelRatio));
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(W.skyColor);
scene.fog = new THREE.Fog(W.skyColor, W.fogNear, W.fogFar);

export const hemi = new THREE.HemisphereLight(0xffffff, 0x556655, 1.0);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff2cc, 1.2);
sun.position.set(20, 40, 10);
scene.add(sun);

addEventListener("resize", () => renderer.setSize(innerWidth, innerHeight));

/* ====== Mesh helpers ====== */

// Every box in the game is the same 1×1×1 cube, stretched with `scale`, and boxes of the
// same colour share one material. So the GPU stores one cube, not thousands of copies.
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();

/** A coloured box mesh of size w×h×d at (x, y, z). All boxes share GPU data. */
export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  const m = new THREE.Mesh(UNIT, matCache.get(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

/** A shared Lambert material for a colour. */
export function lambert(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

const bodyGeo = new THREE.CylinderGeometry(.22, .27, .9, 8);
const headGeo = new THREE.SphereGeometry(.21, 8, 8);
/** A simple person (body + head, optional cap) standing at height y. Shares all GPU data. */
export function person(shirt, y = 0, cap) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(bodyGeo, lambert(shirt)); b.position.y = y + .45;
  const h = new THREE.Mesh(headGeo, lambert(0xc68642)); h.position.y = y + 1.12;
  g.add(b, h);
  if (cap) g.add(box(.48, .12, .48, cap, 0, y + 1.32, 0));
  return g;
}

/** A flat sign with text drawn on a canvas (works with Bangla text). Long text shrinks to fit. */
export function plate(text, w, h, bg, fg) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  let size = Math.round(c.height * .62);
  const font = s => `bold ${s}px 'Noto Sans Bengali', 'Nirmala UI', sans-serif`;
  g.font = font(size);
  while (g.measureText(text).width > c.width * .92 && size > 10) g.font = font(--size);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

/* ====== Road, pavements, buildings ====== */
/** The ground has its own material so time-of-day can tint it (grass, dust, night). */
export const groundMat = new THREE.MeshLambertMaterial({ color: 0x8d8a7a });
const ground = new THREE.Mesh(new THREE.BoxGeometry(400, .2, 400), groundMat);
ground.position.set(0, -.15, -100);
scene.add(ground);
scene.add(box(R * 2, .1, 400, 0x3a3a3a, 0, -.05, -100)); // asphalt
for (const s of [-1, 1]) {
  scene.add(box(2, .25, 400, 0x9e9e9e, s * (R + 1), 0, -100)); // pavement
  scene.add(box(.2, .03, 400, 0xffffff, s * (R - .2), .02, -100)); // edge line
}

const stripes = [];
for (let i = 0; i < W.stripeCount; i++) for (const x of W.stripeLanesX) {
  const s = box(.18, .02, 3, 0xffffff, x, .02, -i * W.stripeGap);
  stripes.push(s); scene.add(s);
}

// Buildings use one unit cube scaled to size, and each has its own material so it can
// be recoloured when it is recycled into a new part of the route.
const blds = [];
for (let i = 0; i < W.buildingCount; i++) {
  const b = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial());
  b.userData.side = i % 2 ? 1 : -1;
  b.position.z = -Math.floor(i / 2) * W.buildingGap;
  blds.push(b); scene.add(b);
}

/**
 * Who decides how buildings look at a given spot of the route (set by the journey).
 * @type {(atDist: number, side: number) => {colors: number[], minH: number, maxH: number, hidden: boolean}}
 */
let scenery = () => ({ colors: W.buildingColors, minH: 8, maxH: 26, hidden: false });
export function setScenery(fn) { scenery = fn; }

/** Give a building a new random size and colour that fits the route at that spot. */
function dressBuilding(b, busDist) {
  const s = scenery(busDist - b.position.z, b.userData.side);
  const h = rnd(s.minH, s.maxH);
  b.visible = !s.hidden;
  b.scale.set(rnd(5, 9), h, rnd(6, 10));
  b.position.set(b.userData.side * rnd(R + 6, R + 10), h / 2, b.position.z);
  b.material.color.setHex(pick(s.colors));
}

/** Re-dress every building for the current spot (used when a run starts). */
export function dressAll(busDist) {
  for (const b of blds) dressBuilding(b, busDist);
}

/**
 * Slide the road and buildings towards the camera by d units.
 * Anything that passes behind the camera jumps back to the far end (recycling).
 * @param {number} busDist how far the bus has driven (used to style recycled buildings)
 */
export function scrollWorld(d, busDist = 0) {
  for (const s of stripes) { s.position.z += d; if (s.position.z > W.stripeRecycleAt) s.position.z -= W.recycleLength; }
  for (const b of blds) {
    b.position.z += d;
    if (b.position.z > W.buildingRecycleAt) { b.position.z -= W.recycleLength; dressBuilding(b, busDist); }
  }
}

dressAll(0);
