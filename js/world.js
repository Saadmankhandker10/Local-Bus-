// Renderer, scene, lights, shared mesh helpers, the curved roads (from map.js), and the
// buildings beside them. The bus really drives through this world; see map.js for the roads.
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";
import { SEGS, here, sample, place, ahead, progressOf } from "./map.js";

const W = CFG.world;

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

/* ====== Ground ====== */
/** The ground has its own material so time-of-day can tint it (grass, dust, night). */
export const groundMat = new THREE.MeshLambertMaterial({ color: 0x8d8a7a });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), groundMat);
ground.position.y = -.2;
scene.add(ground);

/** Keep the ground under the camera (the fog hides its edges). */
export function followGround(x, z) {
  ground.position.x = x;
  ground.position.z = z;
}

/* ====== Roads: one long ribbon mesh per material, built once from map.js ====== */
// Batching: every road piece with the same material goes into ONE geometry, so the
// whole network costs only a handful of draw calls.
const batches = new Map(); // material -> { pos: [], idx: [] }
function batch(mat) {
  if (!batches.has(mat)) batches.set(mat, { pos: [], idx: [] });
  return batches.get(mat);
}

const pt = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };
/**
 * Add a flat band along a segment, from lateral x0 to x1, raised y above the road.
 * dash = [on, period] makes it a dashed line; range = [f0, f1] limits it to part of the segment.
 */
function band(seg, x0, x1, y, mat, dash, range) {
  const b = batch(mat), S = SEGS[seg];
  const i0 = range ? Math.floor(range[0] * (S.n - 1)) : 0;
  const i1 = range ? Math.ceil(range[1] * (S.n - 1)) : S.n - 1;
  for (let i = i0; i <= i1; i++) {
    sample(seg, i * S.step, pt);
    const rx = Math.cos(pt.yaw), rz = -Math.sin(pt.yaw);
    const base = b.pos.length / 3;
    b.pos.push(pt.x + rx * x0, pt.y + y, pt.z + rz * x0, pt.x + rx * x1, pt.y + y, pt.z + rz * x1);
    // For dashes, paint the piece from the previous point only if its middle is in a painted stretch.
    const ok = !dash || ((i - .5) * S.step) % dash[1] < dash[0];
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
    if (i > i0) b.idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
  }
}

/** A straight side road leaving a junction (looks only; the kerb keeps the bus out). */
function stub(seg, s, side) {
  sample(seg, s, pt);
  const S = SEGS[seg], h = W.stubWidth / 2, L = W.stubLength;
  const rx = Math.cos(pt.yaw), rz = -Math.sin(pt.yaw);  // across the main road
  const fx = -Math.sin(pt.yaw), fz = -Math.cos(pt.yaw); // along the main road
  const ox = pt.x + rx * side * S.half, oz = pt.z + rz * side * S.half;
  const corner = (d, a, y) => [ox + rx * side * d + fx * a, pt.y + y, oz + rz * side * d + fz * a];
  const quad = (mat, a0, a1, y) => {
    const b = batch(mat), base = b.pos.length / 3;
    b.pos.push(...corner(0, a0, y), ...corner(0, a1, y), ...corner(L, a0, y), ...corner(L, a1, y));
    b.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  quad(MATS.road, -h, h, -.01);
  quad(MATS.pave, h, h + 2, .1);
  quad(MATS.pave, -h - 2, -h, .1);
}

const MATS = {
  road: new THREE.MeshLambertMaterial({ color: 0x3a3a3a, side: THREE.DoubleSide }),
  pave: new THREE.MeshLambertMaterial({ color: 0x9e9e9e, side: THREE.DoubleSide }),
  line: new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  wall: new THREE.MeshLambertMaterial({ color: 0xbdb5a6, side: THREE.DoubleSide }),
  metroGreen: new THREE.MeshLambertMaterial({ color: 0x1f6b3a, side: THREE.DoubleSide }),
};

/** Build every road ribbon, the junction side roads, and the overhead metro viaduct. */
function buildRoads() {
  const M = CFG.metro;
  for (let i = 0; i < SEGS.length; i++) {
    const S = SEGS[i], h = S.half;
    // Side streets and flyovers sit a hair higher so they never flicker where they overlap the main road.
    const lift = S.main ? 0 : .03;
    band(i, -h, h, lift, MATS.road);
    band(i, h - .35, h - .15, lift + .01, MATS.line);
    band(i, -h + .15, -h + .35, lift + .01, MATS.line);
    if (S.kind === "flyover") {
      for (const s of [-1, 1]) wall(i, s * h, 0, 1, MATS.wall);
    } else {
      band(i, h, h + 2, lift + .12, MATS.pave);
      band(i, -h - 2, -h, lift + .12, MATS.pave);
    }
    if (S.kind !== "street") for (const s of [-1, 1]) band(i, s * h / 2 - .09, s * h / 2 + .09, lift + .015, MATS.line, W.dash);
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
  for (const [mat, b] of batches) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setIndex(b.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; // one mesh spans the whole city, so it is always "in view"
    scene.add(m);
  }
}

/* ====== Buildings: a pool of boxes reused along the road (streaming) ====== */
// Pooling: instead of creating and destroying buildings, a fixed set of boxes is moved to
// whichever spots are near the bus. Nothing new is created while driving.
const pool = [];
const placements = SEGS.map(() => []);   // per segment: { seg, s, side, w, d, h, off, color, hidden, mesh }
const active = new Set();

/** Is this spot taken by a side street running next to the road, or by a junction? */
function blocked(seg, s, side) {
  const S = SEGS[seg];
  if (S.kind === "flyover") return true;
  if (S.kind === "street" && side !== S.side) return true; // only the outer side of a lane
  if (S.main && S.alt !== undefined) {
    const A = SEGS[S.alt], t = s / S.len;
    if (A.kind === "street" && A.side === side && t > .08 && t < .92) return true;
  }
  for (const j of S.junctions || []) {
    if ((j.type === "X" || j.side === side) && Math.abs(j.at * S.len - s) < W.stubWidth / 2 + 6) return true;
  }
  return false;
}

/**
 * Build the roads and plan every building spot along the network (cheap plain objects, made once).
 * @param {(progress: number, side: number) => {colors: number[], minH: number, maxH: number, hidden: boolean}} scenery
 */
export function initWorld(scenery) {
  buildRoads();
  for (let i = 0; i < W.buildingPool; i++) {
    const b = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial());
    b.visible = false;
    pool.push(b); scene.add(b);
  }
  for (let i = 0; i < SEGS.length; i++) {
    const S = SEGS[i];
    for (const side of [-1, 1]) {
      for (let s = rnd(0, W.buildingGap); s < S.len; s += W.buildingGap + rnd(-2, 2)) {
        if (blocked(i, s, side)) continue;
        const look = scenery(progressOf(i, s), side);
        const w = rnd(5, 9);
        placements[i].push({ seg: i, s, side, w, d: rnd(6, 10), h: rnd(look.minH, look.maxH),
          off: S.half + 3 + w / 2 + rnd(0, 3), color: pick(look.colors), hidden: look.hidden, mesh: null });
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

/** Take every building off the road (new run). */
export function resetWorld() {
  for (const p of [...active]) release(p);
}

const near = []; // reused list of segments near the bus
/** Move pooled buildings onto the spots near the bus. Call once per step. */
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
      p.mesh = pool.pop();
      p.mesh.scale.set(p.w, p.h, p.d);
      place(p.mesh, seg, p.s, p.side * p.off, p.h / 2);
      p.mesh.material.color.setHex(p.color);
      p.mesh.visible = true;
      active.add(p);
    }
  }
}
