// The road network, as data plus the code that turns it into smooth curved roads.
//
// The route is a chain of "legs" (main road). A leg can have an `alt`: a second road
// that leaves at the leg's start and rejoins at its end (a side street or a flyover).
// At the fork the bus takes the alt if it is on that side of the road.
//
// Path commands for a leg, starting from where the previous leg ended:
//   ["s", length]            straight
//   ["l", degrees, radius]   turn left       ["r", degrees, radius]   turn right
// Heading 0 = north, 90 = east. Units are world units (the bus is about 7 long).
import * as THREE from "three";

export const MAP = {
  start: { x: 0, z: 0, heading: 90 },
  width: 14,        // normal road width
  sample: 2,        // distance between stored points (smaller = smoother, more memory)

  legs: [
    // ---- Stage 1: Mohammadpur (heading east) ----
    { id: "mohammadpur-stand", stage: 0, path: [["s", 380], ["r", 12, 300], ["s", 300], ["l", 20, 240], ["s", 260]],
      junctions: [{ at: 0.6, type: "T", side: -1 }] },
    { id: "mohammadpur-flyover", stage: 0, path: [["s", 200], ["r", 10, 450], ["s", 420], ["l", 10, 450], ["s", 200]],
      // A flyover over this stretch: faster and empty of rickshaws, but trucks love it too.
      alt: { id: "flyover", kind: "flyover", side: 1, width: 10, height: 8, bulge: 11 } },
    { id: "asad-gate", stage: 0, path: [["s", 360], ["r", 90, 45], ["s", 300]],
      junctions: [{ at: 0.45, type: "T", side: 1 }] },

    // ---- Stage 2: Dhanmondi (heading south) ----
    { id: "dhanmondi-north", stage: 1, path: [["s", 260], ["l", 8, 500], ["s", 360]] },
    { id: "dhanmondi-mid", stage: 1, path: [["s", 260], ["r", 18, 280], ["s", 320], ["l", 18, 280], ["s", 260]],
      // A narrow lane through the neighbourhood: shorter, but full of rickshaws.
      alt: { id: "kalabagan-lane", kind: "street", side: -1, width: 9, bulge: 22, chord: 0.55 } },
    { id: "dhanmondi-south", stage: 1, path: [["s", 320], ["l", 10, 320], ["s", 420]],
      junctions: [{ at: 0.98, type: "X" }] },

    // ---- Stage 3: Science Lab, New Market, Shahbag (east, a U-turn, then east again) ----
    { id: "science-lab", stage: 2, path: [["l", 90, 40], ["s", 360], ["l", 180, 22], ["s", 80], ["r", 90, 30], ["s", 140], ["r", 90, 36], ["s", 320]],
      junctions: [{ at: 0.02, type: "X" }] },
    { id: "shahbag-approach", stage: 2, path: [["s", 420], ["l", 6, 600], ["s", 320]],
      // The way round the jam at the big junction.
      alt: { id: "katabon-lane", kind: "street", side: -1, width: 9, bulge: 24, chord: 0.3 },
      junctions: [{ at: 0.99, type: "X" }] },

    // ---- Stage 4: Dhaka University (heading south) ----
    { id: "du-north", stage: 3, path: [["s", 70], ["r", 90, 40], ["s", 320], ["l", 15, 300], ["s", 260]] },
    { id: "du-campus", stage: 3, path: [["s", 320], ["r", 20, 260], ["s", 420], ["l", 20, 260], ["s", 320]] },
  ],
};

/* ====== Building the roads ====== */

const SAMPLE = MAP.sample;
const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

/** Points along one leg's commands, starting at pose {x, z, h} (h in radians). Updates pose. */
function commandPoints(cmds, pose) {
  const pts = [new THREE.Vector3(pose.x, 0, pose.z)];
  const step = SAMPLE * 2;
  for (const [type, a, r] of cmds) {
    if (type === "s") {
      const n = Math.max(1, Math.round(a / step));
      for (let i = 0; i < n; i++) {
        pose.x += Math.sin(pose.h) * a / n;
        pose.z -= Math.cos(pose.h) * a / n;
        pts.push(new THREE.Vector3(pose.x, 0, pose.z));
      }
    } else {
      // Walk along a circle arc: right turns bend clockwise (heading grows), left turns the other way.
      const dir = type === "r" ? 1 : -1, total = a * Math.PI / 180;
      const n = Math.max(2, Math.round(total * r / step));
      for (let i = 0; i < n; i++) {
        const dh = dir * total / n;
        pose.x += Math.sin(pose.h + dh / 2) * r * total / n;
        pose.z -= Math.cos(pose.h + dh / 2) * r * total / n;
        pose.h += dh;
        pts.push(new THREE.Vector3(pose.x, 0, pose.z));
      }
    }
  }
  return pts;
}

/**
 * Turn a list of points into an evenly spaced road through a Catmull-Rom spline
 * (a smooth curve that passes through every point), and store position, direction
 * and curvature every SAMPLE units for fast lookups.
 */
function makeSeg(points, props) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / SAMPLE) + 1);
  const P = curve.getSpacedPoints(n - 1);
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), A = new Float32Array(n), K = new Float32Array(n);
  for (let i = 0; i < n; i++) { X[i] = P[i].x; Y[i] = P[i].y; Z[i] = P[i].z; }
  // Heading h from each point to the next; stored as three.js rotation.y = -h.
  let prevH = 0;
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + 1), k = j === i ? i - 1 : i;
    let h = Math.atan2(X[j] - X[k], -(Z[j] - Z[k]));
    if (i > 0) { while (h - prevH > Math.PI) h -= 2 * Math.PI; while (h - prevH < -Math.PI) h += 2 * Math.PI; }
    prevH = h; A[i] = -h;
  }
  const step = len / (n - 1);
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + 1), k = Math.max(0, j - 1);
    K[i] = -(A[j] - A[k]) / step; // curvature: heading change per unit, right turns positive
  }
  return { ...props, len, n, step, X, Y, Z, A, K, next: [] };
}

/**
 * Where the turns of a leg are, measured along it: { s: start, end, dir: "l" | "r", deg }.
 * Used by the GPS box and by the helper calling out turns.
 */
function turnsOf(cmds) {
  const out = [];
  let d = 0;
  for (const [type, a, r] of cmds) {
    const len = type === "s" ? a : a * Math.PI / 180 * r;
    if (type !== "s") out.push({ s: d, end: d + len, dir: type, deg: a });
    d += len;
  }
  return out;
}

/** The side road / flyover next to a main leg. */
function makeAlt(main, alt) {
  const pts = [], m = Math.ceil(main.len / (SAMPLE * 3));
  const ax = main.X[0], az = main.Z[0], bx = main.X[main.n - 1], bz = main.Z[main.n - 1];
  for (let i = 0; i <= m; i++) {
    const t = i / m, f = Math.min(main.n - 1, t * (main.n - 1)), idx = Math.round(f);
    let x = main.X[idx], z = main.Z[idx], y = 0;
    const a = main.A[idx], rx = Math.cos(a), rz = -Math.sin(a); // right-hand direction of the main road
    let off;
    if (alt.kind === "flyover") {
      // Rise beside the road, move over its middle, come down beside it again.
      const top = smooth(.2, .32, t) * smooth(.8, .68, t);
      off = alt.bulge * smooth(0, .1, t) * smooth(1, .9, t) * (1 - top);
      y = alt.height * smooth(0, .25, t) * smooth(1, .75, t);
    } else {
      // A street that peels off, runs alongside (cutting corners), and comes back.
      const w = smooth(0, .18, t) * smooth(1, .82, t);
      off = alt.bulge * w;
      const c = (alt.chord || 0) * w;
      x += ((ax + (bx - ax) * t) - x) * c;
      z += ((az + (bz - az) * t) - z) * c;
    }
    pts.push(new THREE.Vector3(x + rx * off * alt.side, y, z + rz * off * alt.side));
  }
  return makeSeg(pts, { id: alt.id, kind: alt.kind, side: alt.side, half: alt.width / 2, stage: main.stage, main: false });
}

/** All road pieces. Index = segment id used everywhere else. */
export const SEGS = [];
/** Index of the main segment for each leg. */
const MAIN = [];

(function build() {
  const pose = { x: MAP.start.x, z: MAP.start.z, h: MAP.start.heading * Math.PI / 180 };
  let prog = 0;
  for (const [li, leg] of MAP.legs.entries()) {
    const seg = makeSeg(commandPoints(leg.path, pose), {
      id: leg.id, kind: "main", side: 0, half: MAP.width / 2, stage: leg.stage, main: true,
      junctions: leg.junctions || [], from: li, turns: turnsOf(leg.path),
    });
    seg.p0 = prog; prog += seg.len; seg.p1 = prog;
    MAIN.push(SEGS.length); SEGS.push(seg);
    if (leg.alt) {
      const a = makeAlt(seg, leg.alt);
      a.p0 = seg.p0; a.p1 = seg.p1; a.from = li; a.junctions = [];
      // The side road follows the main road's shape, so it has the same turns (scaled).
      const f = a.len / seg.len;
      a.turns = seg.turns.map(t => ({ ...t, s: t.s * f, end: t.end * f }));
      seg.alt = SEGS.length;
      SEGS.push(a);
      if (leg.alt.kind === "flyover") {
        // Pillars stand in the middle of the main road where the flyover is right above it.
        seg.pillarFrom = seg.len * .3; seg.pillarTo = seg.len * .7;
      }
    }
  }
  // Connect: each leg leads to the next leg's main road and its alt (if any).
  for (let li = 0; li < MAIN.length; li++) {
    const nextMain = MAIN[li + 1];
    if (nextMain === undefined) continue;
    const targets = [nextMain];
    if (SEGS[nextMain].alt !== undefined) targets.push(SEGS[nextMain].alt);
    SEGS[MAIN[li]].next = targets;
    if (SEGS[MAIN[li]].alt !== undefined) SEGS[SEGS[MAIN[li]].alt].next = targets;
  }
})();

/** Length of the main route (the journey's progress runs from 0 to this). */
export const ROUTE_LENGTH = SEGS[MAIN[MAIN.length - 1]].p1;

/** Main-route length of each stage. */
export const STAGE_LENGTHS = MAP.legs.reduce((acc, leg, i) => {
  acc[leg.stage] = (acc[leg.stage] || 0) + SEGS[MAIN[i]].len;
  return acc;
}, []);

/* ====== Lookups ====== */

/** Where the bus is on the network. Written by bus.js, read by everyone. */
export const here = { seg: 0, s: 0, prev: -1 };

/**
 * Position, heading, and curvature at distance s along a segment, written into `out`
 * (pass a reused object so nothing new is created every frame).
 */
export function sample(seg, s, out) {
  const S = SEGS[seg];
  const f = Math.min(S.n - 1, Math.max(0, s / S.step));
  const i = Math.min(S.n - 2, Math.floor(f)), t = f - i;
  out.x = S.X[i] + (S.X[i + 1] - S.X[i]) * t;
  out.y = S.Y[i] + (S.Y[i + 1] - S.Y[i]) * t;
  out.z = S.Z[i] + (S.Z[i + 1] - S.Z[i]) * t;
  out.yaw = S.A[i] + (S.A[i + 1] - S.A[i]) * t;
  out.k = S.K[i];
  return out;
}

const tmp = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };
/**
 * Put a 3D object on the road: `x` to the right of the centre line, `y` above the road.
 * The object's local -z points along the road (forward), local +x to the right.
 */
export function place(obj, seg, s, x, y = 0, extraYaw = 0) {
  sample(seg, s, tmp);
  obj.position.set(tmp.x + Math.cos(tmp.yaw) * x, tmp.y + y, tmp.z - Math.sin(tmp.yaw) * x);
  obj.rotation.y = tmp.yaw + extraYaw;
}

/**
 * Distance along the roads from the bus to (seg, s): positive ahead, negative behind,
 * NaN if that spot is not on the bus's way (for example the other branch of a fork).
 */
export function ahead(seg, s) {
  if (seg === here.seg) return s - here.s;
  const cur = SEGS[here.seg];
  if (cur.next.includes(seg)) return cur.len - here.s + s;
  if (seg === here.prev) return -(here.s + SEGS[seg].len - s);
  // The road next to ours (main road vs. its side street): compare by progress.
  if (SEGS[seg].from === cur.from) return (s / SEGS[seg].len - here.s / cur.len) * cur.len;
  for (const n of cur.next) if (SEGS[n].next.includes(seg)) return cur.len - here.s + SEGS[n].len + s;
  return NaN;
}

/** Journey progress (0 .. ROUTE_LENGTH) of a spot on any segment. */
export function progressOf(seg, s) {
  const S = SEGS[seg];
  return S.p0 + (s / S.len) * (S.p1 - S.p0);
}

/** The main-road spot for a journey progress value. Writes { seg, s } into out. */
export function fromProgress(p, out) {
  for (const i of MAIN) {
    const S = SEGS[i];
    if (p < S.p1 || i === MAIN[MAIN.length - 1]) { out.seg = i; out.s = Math.min(S.len, Math.max(0, p - S.p0)); return out; }
  }
  return out;
}

/**
 * Walk forward d units from (seg, s), choosing a branch at forks with pick(nextList).
 * Writes { seg, s } into out; stops at the end of the network.
 */
export function walk(seg, s, d, pick, out) {
  s += d;
  while (s > SEGS[seg].len) {
    const nx = SEGS[seg].next;
    if (!nx.length) { s = SEGS[seg].len; break; }
    s -= SEGS[seg].len;
    seg = nx.length === 1 ? nx[0] : pick(nx);
  }
  out.seg = seg; out.s = s;
  return out;
}

/** Lanes that fit on a segment (centre positions, from the normal lane list). */
export function lanesOf(seg, lanes) {
  const h = SEGS[seg].half;
  return lanes.filter(l => Math.abs(l) <= h - 2);
}
