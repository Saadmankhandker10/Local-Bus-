// Open-World Dhaka Grid City:
// Builds the road network using the exact user-specified grid formula:
//   const BLOCK = 40, ROAD = 10, N = 5;
//   for (let i = -N; i <= N; i++) {
//     addRoad(i * BLOCK, 0, ROAD, BLOCK * 2 * N);   // লম্বালম্বি রাস্তা
//     addRoad(0, i * BLOCK, BLOCK * 2 * N, ROAD);   // আড়াআড়ি রাস্তা
//   }
// Buildings sit strictly inside the empty blocks between roads.
// Pushback & collision boundaries exist ONLY around buildings, NOT beside roads!
import * as THREE from "three";
import { CFG } from "./config.js";
import { rnd, pick } from "./utils.js";
import { GRID, DHAKA_JUNCTIONS, getJunctionName } from "./map.js";

const W = CFG.world;
const BLOCK = GRID.BLOCK; // 40
const ROAD = GRID.ROAD;   // 10
const N = GRID.N;         // 5

/* ====== Renderer, scene, lights ====== */
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, CFG.render.maxPixelRatio));
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(W.skyColor);
scene.fog = new THREE.Fog(W.skyColor, W.fogNear, W.fogFar);

export const hemi = new THREE.HemisphereLight(0xffffff, 0x556655, 1.0);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff2cc, 1.25);
sun.position.set(30, 50, 20);
scene.add(sun);

addEventListener("resize", () => renderer.setSize(innerWidth, innerHeight));

/* ====== Mesh helpers ====== */
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();

export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  const m = new THREE.Mesh(UNIT, matCache.get(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

export function lambert(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

const bodyGeo = new THREE.CylinderGeometry(.22, .27, .9, 8);
const headGeo = new THREE.SphereGeometry(.21, 8, 8);
export function person(shirt, y = 0, cap) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(bodyGeo, lambert(shirt)); b.position.y = y + .45;
  const h = new THREE.Mesh(headGeo, lambert(0xc68642)); h.position.y = y + 1.12;
  g.add(b, h);
  if (cap) g.add(box(.48, .12, .48, cap, 0, y + 1.32, 0));
  return g;
}

export function plate(text, w, h, bg, fg) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = Math.max(4, Math.round(c.height * .06));
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  let size = Math.round(c.height * .58);
  const font = s => `bold ${s}px 'Noto Sans Bengali', 'Nirmala UI', sans-serif`;
  g.font = font(size);
  while (g.measureText(text).width > c.width * .9 && size > 10) g.font = font(--size);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

/* ====== Ground ====== */
export const groundMat = new THREE.MeshLambertMaterial({ color: 0x605c54 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), groundMat);
ground.position.y = -.2;
scene.add(ground);

export function followGround(x, z) {
  ground.position.x = x;
  ground.position.z = z;
}

/* ====== Materials for Roads, Markings & Sidewalks ====== */
const MATS = {
  road: new THREE.MeshLambertMaterial({ color: 0x2b2824 }),
  sidewalk: new THREE.MeshLambertMaterial({ color: 0x827c73 }),
  kerbYellow: new THREE.MeshLambertMaterial({ color: 0xffd54f }),
  kerbBlack: new THREE.MeshLambertMaterial({ color: 0x212121 }),
  whiteLine: new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }),
  median: new THREE.MeshLambertMaterial({ color: 0x3d3731 }),
  treeLeaf: new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
  treeTrunk: new THREE.MeshLambertMaterial({ color: 0x4e342e }),
};

/* ====== Geometry Batching for High Performance ====== */
const batches = new Map();
function batch(mat) {
  if (!batches.has(mat)) batches.set(mat, { pos: [], idx: [] });
  return batches.get(mat);
}

function addQuad(mat, x0, z0, x1, z1, x2, z2, x3, z3, y = 0.02) {
  const b = batch(mat);
  const base = b.pos.length / 3;
  b.pos.push(x0, y, z0, x1, y, z1, x2, y, z2, x3, y, z3);
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function addRect(mat, cx, cz, w, d, y = 0.02) {
  const hw = w / 2, hd = d / 2;
  addQuad(mat, cx - hw, cz - hd, cx + hw, cz - hd, cx + hw, cz + hd, cx - hw, cz + hd, y);
}

/* ====== Road Network Generation ====== */
const roadGroup = new THREE.Group();
const decorGroup = new THREE.Group();

/**
 * Adds a road ribbon to the world.
 * For lengthwise roads (Z): rw = ROAD, rl = length along Z.
 * For crosswise roads (X): rw = length along X, rl = ROAD.
 */
function addRoad(cx, cz, rw, rl) {
  const isVertical = rl > rw;
  // Asphalt road surface
  addRect(MATS.road, cx, cz, rw, rl, 0.015);

  const halfW = (isVertical ? rw : rl) / 2;
  const totalL = isVertical ? rl : rw;
  const halfL = totalL / 2;

  // Build mid-block features (kerbs, dashed centre line) between 4-way intersections.
  // Gaps are left at every intersection (where distance to nearest crossroad is <= ROAD/2 + 1)
  // so that vehicles and players can turn left/right completely free of obstacles!
  const step = 4;
  for (let d = -halfL; d < halfL; d += step) {
    const curCoord = d + step / 2;
    // Check if curCoord is inside an intersection zone
    const nearJ = Math.round(curCoord / BLOCK) * BLOCK;
    const inIntersection = Math.abs(curCoord - nearJ) <= (ROAD / 2 + 1.2);

    if (inIntersection) {
      // Paint pedestrian zebra crossing on the road approach
      if (Math.abs(Math.abs(curCoord - nearJ) - (ROAD / 2 - 1.2)) < 1.5) {
        if (isVertical) {
          for (let zx = -halfW + 1.2; zx <= halfW - 1.2; zx += 1.8) {
            addRect(MATS.whiteLine, cx + zx, curCoord, 0.9, 1.4, 0.022);
          }
        } else {
          for (let zx = -halfW + 1.2; zx <= halfW - 1.2; zx += 1.8) {
            addRect(MATS.whiteLine, curCoord, cz + zx, 1.4, 0.9, 0.022);
          }
        }
      }
      continue; // Skip kerbs and lane dividers inside intersections so roads connect cleanly!
    }

    // White dashed centre divider line along mid-block stretches
    if (Math.abs(d % 8) < 4) {
      if (isVertical) addRect(MATS.whiteLine, cx, curCoord, 0.22, step * 0.7, 0.02);
      else addRect(MATS.whiteLine, curCoord, cz, step * 0.7, 0.22, 0.02);
    }

    // Striped yellow & black kerbs along sidewalk edges
    const kerbMat = (Math.abs(Math.round(d / 4)) % 2 === 0) ? MATS.kerbYellow : MATS.kerbBlack;
    if (isVertical) {
      addRect(kerbMat, cx - halfW + 0.16, curCoord, 0.32, step, 0.08);
      addRect(kerbMat, cx + halfW - 0.16, curCoord, 0.32, step, 0.08);
    } else {
      addRect(kerbMat, curCoord, cz - halfW + 0.16, step, 0.32, 0.08);
      addRect(kerbMat, curCoord, cz + halfW - 0.16, step, 0.32, 0.08);
    }
  }
}

/* ====== Procedural Dhaka Building Textures & Shop Signs ====== */
function makeBuildingMat(wallHex, warmTint) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = wallHex;
  g.fillRect(0, 0, 256, 512);

  const floors = 7, fh = Math.floor(430 / floors);
  for (let f = 0; f < floors; f++) {
    const y = 16 + f * fh;
    g.fillStyle = "rgba(30, 22, 18, 0.35)";
    g.fillRect(0, y + fh - 6, 256, 6);
    for (let col = 0; col < 4; col++) {
      const x = 16 + col * 58;
      const seed = (f * 7 + col * 13) % 5;
      g.fillStyle = seed === 0 ? "#fff3c4" : seed === 1 ? warmTint : seed === 2 ? "#d7e8f0" : "#221c18";
      g.fillRect(x, y + 8, 42, fh - 20);
      if (col === 1 || col === 2) {
        g.fillStyle = "rgba(20, 20, 20, 0.55)";
        g.fillRect(x - 2, y + fh - 18, 46, 10);
      }
    }
  }
  g.fillStyle = "#26201c";
  g.fillRect(0, 446, 256, 66);
  for (let col = 0; col < 3; col++) {
    g.fillStyle = col % 2 === 0 ? "#ffecb3" : "#b3e5fc";
    g.fillRect(14 + col * 80, 456, 66, 52);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: tex });
}

const BLDG_MATS = [
  makeBuildingMat("#a67c5b", "#ffd584"),
  makeBuildingMat("#8d6e63", "#ffe082"),
  makeBuildingMat("#b89272", "#fff59d"),
  makeBuildingMat("#78909c", "#ffecb3"),
  makeBuildingMat("#9c7a65", "#ffcc80"),
  makeBuildingMat("#c29b78", "#fff9c4"),
  makeBuildingMat("#b26a49", "#ffe082"),
];

const SHOP_SIGNS = [
  ["ঢাকা ফটোকপি ও স্টেশনারি", "#e65100", "#ffffff"],
  ["রূপসী বিউটি পার্লার", "#1b5e20", "#ffeb3b"],
  ["বিসমিল্লাহ ফার্মেসি", "#0d47a1", "#ffffff"],
  ["জনতা ইলেকট্রনিক্স", "#b71c1c", "#ffeb3b"],
  ["ভাই ভাই বিরিয়ানি হাউস", "#f57f17", "#111111"],
  ["আল-মদিনা টেইলার্স", "#4a148c", "#ffffff"],
  ["মেট্রো মোবাইল সার্ভিসিং", "#006064", "#ffffff"],
  ["পদ্মা ডিপার্টমেন্টাল স্টোর", "#c62828", "#ffffff"],
  ["কাচ্চি ভাই ডাইনিং", "#d84315", "#ffffff"],
  ["শাহবাগ পুষ্পবিতান", "#2e7d32", "#fff9c4"],
].map(([text, bg, fg]) => plate(text, 5.2, 0.95, bg, fg).material);

const signGeo = new THREE.PlaneGeometry(5.2, 0.95);
const treeCrownGeo = new THREE.DodecahedronGeometry(1.5, 1);

/* ====== Physical Building Colliders Array ====== */
// Every physical building in the city is registered here with its 2D AABB.
// Collision boundaries exist ONLY around buildings, NOT beside roads!
export const BUILDINGS = [];

/**
 * Find all buildings within `radius` of world point (x, z).
 * Ultra-fast lookup for 60fps physics collision.
 */
export function getNearbyBuildings(x, z, radius = 25) {
  const nearby = [];
  const r2 = (radius + 15) ** 2;
  for (let i = 0; i < BUILDINGS.length; i++) {
    const b = BUILDINGS[i];
    const dx = b.cx - x, dz = b.cz - z;
    if (dx * dx + dz * dz < r2) nearby.push(b);
  }
  return nearby;
}

/* ====== City Blocks & Buildings Construction ====== */
function buildCityBlocks() {
  const B = BLOCK, R = ROAD;
  let bldgIdx = 0;

  for (let bi = -N; bi < N; bi++) {
    for (let bj = -N; bj < N; bj++) {
      // The empty block bounds between roads:
      // Roads sit at i*BLOCK and j*BLOCK with width ROAD (10).
      // So the block between roads is: [i*B + R/2, (i+1)*B - R/2] (width = 30, depth = 30).
      const x0 = bi * B + R / 2;
      const x1 = (bi + 1) * B - R / 2;
      const z0 = bj * B + R / 2;
      const z1 = (bj + 1) * B - R / 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const blockW = x1 - x0; // 30
      const blockD = z1 - z0; // 30

      // Raised pedestrian sidewalk slab covering the entire block under the buildings
      addRect(MATS.sidewalk, cx, cz, blockW, blockD, 0.08);

      // Check if this block is a special Dhaka Landmark location
      const isCurzon = (bi === 2 && bj === 2);
      const isMinar = (bi === 2 && bj === 1);
      const isTSC = (bi === 2 && bj === 0);
      const isLake = (bi === 0 && bj === -1);
      const isTownHall = (bi === -2 && bj === -2);

      if (isCurzon) {
        // Dhaka University Curzon Hall (Colonial Mughal Red-Brick Architecture)
        const curzonMesh = box(22, 24, 22, 0x8d281e, cx, 12, cz);
        curzonMesh.add(box(6, 7, 6, 0xb71c1c, 0, 15.5, 0));
        decorGroup.add(curzonMesh);
        BUILDINGS.push({
          x0: cx - 11, x1: cx + 11,
          z0: cz - 11, z1: cz + 11,
          cx, cz, hw: 11, hd: 11, h: 24,
          name: "কার্জন হল", mesh: curzonMesh,
        });
        continue;
      }

      if (isMinar) {
        // Central Shaheed Minar Monument
        const minarGroup = new THREE.Group();
        minarGroup.position.set(cx, 0, cz);
        minarGroup.add(box(16, 0.6, 16, 0x424242, 0, 0.3, 0));
        minarGroup.add(box(2.2, 18, 0.8, 0xeeeeee, 0, 9.3, 0));
        minarGroup.add(box(1.8, 14, 0.8, 0xeeeeee, -4.5, 7.3, 0));
        minarGroup.add(box(1.8, 14, 0.8, 0xeeeeee, 4.5, 7.3, 0));
        const sunRed = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.4, 16).rotateX(Math.PI / 2), lambert(0xd32f2f));
        sunRed.position.set(0, 11, -1.2);
        minarGroup.add(sunRed);
        decorGroup.add(minarGroup);
        BUILDINGS.push({
          x0: cx - 8.5, x1: cx + 8.5,
          z0: cz - 8.5, z1: cz + 8.5,
          cx, cz, hw: 8.5, hd: 8.5, h: 18,
          name: "শহীদ মিনার", mesh: minarGroup,
        });
        continue;
      }

      if (isTSC) {
        // TSC Raju Memorial Sculpture & Campus Green
        const tscGroup = new THREE.Group();
        tscGroup.position.set(cx, 0, cz);
        tscGroup.add(box(18, 12, 18, 0xa1887f, 0, 6, 0));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(4.5, 12, 10), lambert(0xfff3e0));
        dome.position.set(0, 12.5, 0);
        tscGroup.add(dome);
        decorGroup.add(tscGroup);
        BUILDINGS.push({
          x0: cx - 9.5, x1: cx + 9.5,
          z0: cz - 9.5, z1: cz + 9.5,
          cx, cz, hw: 9.5, hd: 9.5, h: 14,
          name: "টিএসসি রাজু ভাস্কর্য", mesh: tscGroup,
        });
        continue;
      }

      if (isLake) {
        // Dhanmondi Lake Park with Trees & Reflection Pool
        const lakeMesh = box(22, 0.1, 22, 0x1976d2, cx, 0.1, cz);
        decorGroup.add(lakeMesh);
        // Plant trees around the lake
        for (const [tx, tz] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
          const trunk = box(0.4, 3.5, 0.4, 0x3e2723, cx + tx, 1.75, cz + tz);
          const crown = new THREE.Mesh(treeCrownGeo, MATS.treeLeaf);
          crown.position.set(cx + tx, 4.2, cz + tz);
          decorGroup.add(trunk, crown);
        }
        continue; // Lakes are open for scenic view!
      }

      // Standard City Block: 4 commercial/residential quadrant buildings
      // Each building is 11.5 × 11.5, leaving a 1.5m perimeter sidewalk next to the road kerb!
      const quads = [
        { dx: -7.2, dz: -7.2, signFace: "Z", signDir: -1 },
        { dx: 7.2, dz: -7.2, signFace: "X", signDir: 1 },
        { dx: -7.2, dz: 7.2, signFace: "X", signDir: -1 },
        { dx: 7.2, dz: 7.2, signFace: "Z", signDir: 1 },
      ];

      for (const q of quads) {
        bldgIdx++;
        const bx = cx + q.dx, bz = cz + q.dz;
        const bw = rnd(10.5, 12.0), bd = rnd(10.5, 12.0);
        const bh = rnd(16, 36);

        const bldgMesh = new THREE.Mesh(UNIT, BLDG_MATS[bldgIdx % BLDG_MATS.length]);
        bldgMesh.scale.set(bw, bh, bd);
        bldgMesh.position.set(bx, bh / 2 + 0.15, bz);
        decorGroup.add(bldgMesh);

        // Bangla Shop Signboard facing the outer road
        const signMat = SHOP_SIGNS[bldgIdx % SHOP_SIGNS.length];
        const signMesh = new THREE.Mesh(signGeo, signMat);
        if (q.signFace === "Z") {
          signMesh.position.set(bx, 3.8, bz + q.signDir * (bd / 2 + 0.08));
          signMesh.rotation.y = q.signDir < 0 ? Math.PI : 0;
        } else {
          signMesh.position.set(bx + q.signDir * (bw / 2 + 0.08), 3.8, bz);
          signMesh.rotation.y = q.signDir < 0 ? -Math.PI / 2 : Math.PI / 2;
        }
        decorGroup.add(signMesh);

        // Footpath hawker canopy & fruit/cha stalls along the sidewalk in front of the building
        if (bldgIdx % 2 === 0) {
          const stallColor = pick([0x0d3b66, 0x8e2424, 0x1b5e20, 0xd84315]);
          const awning = box(3.2, 0.15, 2.2, stallColor, bx, 2.4, bz + (q.signFace === "Z" ? q.signDir * (bd / 2 + 1.4) : 0));
          decorGroup.add(awning);
        }

        // Register building collider: collision boundary ONLY around this building!
        BUILDINGS.push({
          x0: bx - bw / 2, x1: bx + bw / 2,
          z0: bz - bd / 2, z1: bz + bd / 2,
          cx: bx, cz: bz,
          hw: bw / 2, hd: bd / 2,
          h: bh,
          name: "বিল্ডিং",
          mesh: bldgMesh,
        });
      }
    }
  }
}

/* ====== Outer City Perimeter Boundary Barricades ====== */
function buildCityPerimeter() {
  const maxBound = N * BLOCK + ROAD / 2 + 2; // ~207
  const perimeterMat = new THREE.MeshLambertMaterial({ color: 0xb71c1c });

  // Place red-and-white police barricades along the 4 outer perimeter edges
  for (let x = -maxBound; x <= maxBound; x += 12) {
    decorGroup.add(box(8, 1.2, 0.6, 0xd32f2f, x, 0.6, -maxBound));
    decorGroup.add(box(8, 1.2, 0.6, 0xd32f2f, x, 0.6, maxBound));
  }
  for (let z = -maxBound; z <= maxBound; z += 12) {
    decorGroup.add(box(0.6, 1.2, 8, 0xd32f2f, -maxBound, 0.6, z));
    decorGroup.add(box(0.6, 1.2, 8, 0xd32f2f, maxBound, 0.6, z));
  }
}

/* ====== Initialize the World ====== */
export function initWorld() {
  // 1. Build the grid roads using the exact user-specified formula:
  const roadLength = BLOCK * 2 * N + ROAD * 2; // ~420
  for (let i = -N; i <= N; i++) {
    addRoad(i * BLOCK, 0, ROAD, roadLength);   // লম্বালম্বি রাস্তা (Z-axis)
    addRoad(0, i * BLOCK, roadLength, ROAD);   // আড়াআড়ি রাস্তা (X-axis)
  }

  // 2. Build city blocks & buildings strictly inside the empty blocks:
  buildCityBlocks();

  // 3. Build outer perimeter boundaries:
  buildCityPerimeter();

  // 4. Compile batch geometries for ultra-fast GPU rendering:
  for (const [mat, b] of batches) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setIndex(b.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    roadGroup.add(m);
  }

  scene.add(roadGroup);
  scene.add(decorGroup);
}

export function resetWorld() {
  // World geometry is persistent
}

export function updateWorld() {
  // The grid city is pre-built and optimized in batch meshes
}
