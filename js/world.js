// Renderer, scene, lights, camera, and the scrolling road with buildings.
// The bus never really moves forward: the world slides towards the camera instead,
// which keeps all numbers small and avoids precision problems on long runs.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";

const W = CFG.world;
const R = W.roadHalfWidth;

/* ====== Renderer, scene, camera ====== */
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, CFG.render.maxPixelRatio));
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(W.skyColor);
scene.fog = new THREE.Fog(W.skyColor, W.fogNear, W.fogFar);

export const cam = new THREE.PerspectiveCamera(CFG.camera.fov, innerWidth / innerHeight, 0.1, CFG.camera.far);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.0));
const sun = new THREE.DirectionalLight(0xfff2cc, 1.2);
sun.position.set(20, 40, 10);
scene.add(sun);

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
});

/* ====== Mesh helpers ====== */

/** A coloured box mesh at (x, y, z). */
export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

/** A flat sign with text drawn on a canvas (works with Bangla text). */
export function plate(text, w, h, bg, fg) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = Math.round(256 * h / w);
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.font = "bold 38px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

/* ====== Road, pavements, buildings ====== */
scene.add(box(400, .2, 400, 0x8d8a7a, 0, -.15, -100)); // ground
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

const blds = [];
for (let i = 0; i < W.buildingCount; i++) {
  const side = i % 2 ? 1 : -1, h = rnd(8, 26);
  const b = box(rnd(5, 9), h, rnd(6, 10), pick(W.buildingColors),
    side * rnd(R + 6, R + 10), h / 2, -Math.floor(i / 2) * W.buildingGap);
  blds.push(b); scene.add(b);
}

/**
 * Slide the road and buildings towards the camera by d units.
 * Anything that passes behind the camera jumps back to the far end (recycling).
 */
export function scrollWorld(d) {
  for (const s of stripes) { s.position.z += d; if (s.position.z > W.stripeRecycleAt) s.position.z -= W.recycleLength; }
  for (const b of blds) { b.position.z += d; if (b.position.z > W.buildingRecycleAt) b.position.z -= W.recycleLength; }
}

/* ====== Camera and drawing ====== */

/** Move the chase camera behind the bus, add shake, widen the view with speed, and draw. */
export function renderWorld(dt, busX, speed, shake) {
  const C = CFG.camera;
  const cx = busX * C.followX;
  cam.position.set(cx + rnd(-1, 1) * shake, C.height + rnd(-1, 1) * shake, C.distance);
  cam.lookAt(cx, C.lookY, C.lookZ);
  const fov = C.baseFov + speed * C.fovPerSpeed;
  // Rebuilding the projection is not free, so only do it when the change is visible.
  if (Math.abs(cam.fov - fov) > .1) { cam.fov = fov; cam.updateProjectionMatrix(); }
  renderer.render(scene, cam);
}
