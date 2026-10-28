// The road network: Open-World Dhaka Grid City (BLOCK = 40, ROAD = 10, N = 5).
// Horizontal and vertical roads cross at 121 intersections (মোড়),
// with buildings strictly inside city blocks between roads, and ZERO artificial road boundaries!
import * as THREE from "three";
import { bnNum } from "./i18n.js";

export const GRID = {
  BLOCK: 40,  // distance between road centerlines
  ROAD: 10,   // road width
  N: 5,       // grid extent (-N to +N)
  get size() { return this.BLOCK * 2 * this.N; }, // 400
  get min() { return -this.N * this.BLOCK; },     // -200
  get max() { return this.N * this.BLOCK; },      // +200
  get laneW() { return 2.5; },
};

export const MAP = {
  start: { x: -120, z: -120, heading: 90 }, // Start at Mohammadpur Bus Stand (heading East)
  width: GRID.ROAD,
  sample: 2,
};

/* ====== Iconic Dhaka Intersections (মোড়) across the Grid ====== */
export const DHAKA_JUNCTIONS = {
  // Mohammadpur & Lalmatia (West)
  "-3,-3": "মোহাম্মদপুর বাসস্ট্যান্ড মোড়",
  "-2,-3": "তাজমহল রোড মোড়",
  "-1,-3": "টাউন হল মোড়",
  "0,-3": "আসাদগেট মোড়",
  "-3,-2": "শ্যামলী মোড়",
  "-2,-2": "রিং রোড মোড়",
  "-1,-2": "লালমাটিয়া আড়ং মোড়",
  "0,-2": "মানিক মিয়া এভিনিউ মোড়",

  // Dhanmondi & Kalabagan (South-West)
  "-2,-1": "সাতমসজিদ রোড মোড়",
  "-1,-1": "ধানমন্ডি ২৭ মোড়",
  "0,-1": "কলাবাগান মোড়",
  "-2,0": "জিগাতলা মোড়",
  "-1,0": "ধানমন্ডি ১৫ মোড়",
  "0,0": "সায়েন্সল্যাব মোড়",
  "-1,1": "ধানমন্ডি ২ — সিটি কলেজ মোড়",
  "0,1": "বাটা সিগন্যাল — এলিফ্যান্ট রোড মোড়",

  // Shahbagh, Farmgate & Katabon (Central)
  "1,0": "কাঁটাবন মোড়",
  "2,0": "শাহবাগ মোড়",
  "1,1": "নীলক্ষেত মোড়",
  "2,1": "টিএসসি রাজু ভাস্কর্য মোড়",
  "1,-1": "বাংলামোটর মোড়",
  "2,-1": "ফার্মগেট মোড়",

  // Dhaka University Campus & Old Dhaka (East)
  "3,1": "দোয়েল চত্বর মোড়",
  "3,2": "কার্জন হল মোড়",
  "2,2": "শহীদ মিনার মোড়",
  "3,0": "প্রেসক্লাব মোড়",
  "3,-1": "মৎস্য ভবন মোড়",
};

/** Get the Dhaka intersection name near grid coordinates (i, j). */
export function getJunctionName(i, j) {
  const key = `${i},${j}`;
  if (DHAKA_JUNCTIONS[key]) return DHAKA_JUNCTIONS[key];
  const roads = ["মিরপুর রোড", "ভিআইপি রোড", "কাজী নজরুল এভিনিউ", "গ্রিন রোড", "রোকেয়া সরণি", "টপখানা রোড"];
  const rName = roads[Math.abs(i * 3 + j * 7) % roads.length];
  const roadNo = (Math.abs(i * 5 + j * 11) % 32) + 1;
  return `${rName} — রোড ${bnNum(roadNo)} মোড়`;
}

/* ====== Grid Roads Definition ====== */
export const GRID_ROADS = [];
(function buildGridRoads() {
  const B = GRID.BLOCK, R = GRID.ROAD, N = GRID.N;
  const len = B * 2 * N + R * 2; // ~420
  // Vertical roads (along Z)
  for (let i = -N; i <= N; i++) {
    GRID_ROADS.push({
      dir: "Z", i,
      x: i * B, z: 0,
      w: R, l: len,
      x0: i * B - R / 2, x1: i * B + R / 2,
      z0: -N * B - R, z1: N * B + R,
    });
  }
  // Horizontal roads (along X)
  for (let j = -N; j <= N; j++) {
    GRID_ROADS.push({
      dir: "X", j,
      x: 0, z: j * B,
      w: R, l: len,
      x0: -N * B - R, x1: N * B + R,
      z0: j * B - R / 2, z1: j * B + R / 2,
    });
  }
})();

/* ====== Backward-compatible SEGS array for route & stage compatibility ====== */
export const SEGS = [];
export const MAIN = [];
const SAMPLE = MAP.sample;

(function buildSegs() {
  // Create straight segments between key Dhaka hubs to preserve journey/stage progression.
  const hubs = [
    { id: "mohammadpur-stand", name: "মোহাম্মদপুর বাসস্ট্যান্ড", x: -120, z: -120, stage: 0 },
    { id: "asad-gate", name: "আসাদগেট", x: 0, z: -120, stage: 0 },
    { id: "dhanmondi-27", name: "ধানমন্ডি ২৭", x: 0, z: -40, stage: 1 },
    { id: "science-lab", name: "সায়েন্সল্যাব", x: 0, z: 40, stage: 1 },
    { id: "shahbag", name: "শাহবাগ", x: 80, z: 40, stage: 2 },
    { id: "tsc", name: "টিএসসি", x: 80, z: 120, stage: 3 },
    { id: "curzon-hall", name: "কার্জন হল", x: 120, z: 160, stage: 3 },
  ];

  let prog = 0;
  for (let hi = 0; hi < hubs.length - 1; hi++) {
    const h0 = hubs[hi], h1 = hubs[hi + 1];
    const dx = h1.x - h0.x, dz = h1.z - h0.z;
    const len = Math.hypot(dx, dz);
    const n = Math.max(2, Math.ceil(len / SAMPLE) + 1);
    const step = len / (n - 1);
    const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
    const A = new Float32Array(n), K = new Float32Array(n);
    const heading = Math.atan2(dx, -dz);

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      X[i] = h0.x + dx * t;
      Y[i] = 0;
      Z[i] = h0.z + dz * t;
      A[i] = -heading;
      K[i] = 0;
    }

    const seg = {
      id: h0.id, mor: h0.name + " মোড়", stage: h0.stage,
      kind: "main", side: 0, half: GRID.ROAD / 2, len, n, step,
      X, Y, Z, A, K, p0: prog, p1: prog + len,
      junctions: [{ at: 0.5, type: "X", name: h0.name + " মোড়" }],
      next: [], alts: [], turns: [], main: true,
    };
    prog += len;
    MAIN.push(SEGS.length);
    SEGS.push(seg);
  }

  for (let i = 0; i < MAIN.length - 1; i++) {
    SEGS[MAIN[i]].next = [MAIN[i + 1]];
  }
})();

export const ROUTE_LENGTH = SEGS.length ? SEGS[SEGS.length - 1].p1 : 1200;
export const STAGE_LENGTHS = [350, 350, 350, 350];

/* ====== Where the bus is on the network ====== */
export const here = { seg: 0, s: 0, prev: -1 };

/** Sample position, heading, and curvature on a segment. */
export function sample(seg, s, out) {
  const S = SEGS[seg] || SEGS[0];
  const f = Math.min(S.n - 1, Math.max(0, s / S.step));
  const i = Math.min(S.n - 2, Math.floor(f)), t = f - i;
  out.x = S.X[i] + (S.X[i + 1] - S.X[i]) * t;
  out.y = S.Y[i] + (S.Y[i + 1] - S.Y[i]) * t;
  out.z = S.Z[i] + (S.Z[i + 1] - S.Z[i]) * t;
  out.yaw = S.A[i] + (S.A[i + 1] - S.A[i]) * t;
  out.k = S.K[i] || 0;
  return out;
}

/** Place an object in 3D world space at (x, y, z) with yaw. */
export function place(mesh, seg, s, lat = 0, y = 0, relYaw = 0) {
  const S = SEGS[seg] || SEGS[0];
  const f = Math.min(S.n - 1, Math.max(0, s / S.step));
  const i = Math.min(S.n - 2, Math.floor(f)), t = f - i;
  const px = S.X[i] + (S.X[i + 1] - S.X[i]) * t;
  const pz = S.Z[i] + (S.Z[i + 1] - S.Z[i]) * t;
  const yaw = S.A[i] + (S.A[i + 1] - S.A[i]) * t;
  mesh.position.set(px + Math.cos(yaw) * lat, y, pz - Math.sin(yaw) * lat);
  mesh.rotation.y = yaw + relYaw;
}

export function ahead(seg, s) {
  const S = SEGS[seg] || SEGS[0];
  return (S.p0 + s) - (SEGS[here.seg].p0 + here.s);
}

export function progressOf(seg, s) {
  const S = SEGS[seg] || SEGS[0];
  return S.p0 + Math.min(S.len, Math.max(0, s));
}

export function fromProgress(p, out) {
  for (let i = 0; i < SEGS.length; i++) {
    const S = SEGS[i];
    if (p <= S.p1 || i === SEGS.length - 1) {
      out.seg = i;
      out.s = Math.max(0, Math.min(S.len, p - S.p0));
      return out;
    }
  }
  out.seg = 0; out.s = 0;
  return out;
}

export function walk(seg, s, distance, chooseNext, out) {
  s += distance;
  while (s > SEGS[seg].len) {
    const nx = SEGS[seg].next;
    if (!nx.length) { s = SEGS[seg].len; break; }
    s -= SEGS[seg].len;
    seg = nx[0];
  }
  out.seg = seg; out.s = s;
  return out;
}

export function lanesOf(seg, lanes) {
  return [-2.5, 2.5];
}

/** Check if world position (wx, wz) is currently on ANY grid road. */
export function hitsAnyRoad(wx, wz, pad = 0) {
  const B = GRID.BLOCK, halfR = GRID.ROAD / 2 + pad;
  const maxBound = GRID.N * B + halfR;
  if (Math.abs(wx) > maxBound || Math.abs(wz) > maxBound) return false;

  // Check distance to closest vertical road
  const nearI = Math.round(wx / B);
  if (Math.abs(nearI) <= GRID.N && Math.abs(wx - nearI * B) <= halfR) return true;

  // Check distance to closest horizontal road
  const nearJ = Math.round(wz / B);
  if (Math.abs(nearJ) <= GRID.N && Math.abs(wz - nearJ * B) <= halfR) return true;

  return false;
}

/** Find the nearest Dhaka intersection (মোড়) to world position (wx, wz). */
export function nearestIntersection(wx, wz) {
  const B = GRID.BLOCK;
  const i = Math.round(wx / B);
  const j = Math.round(wz / B);
  const cx = i * B, cz = j * B;
  const dist = Math.hypot(wx - cx, wz - cz);
  return { i, j, cx, cz, dist, name: getJunctionName(i, j) };
}
