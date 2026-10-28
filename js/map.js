// The Dhaka city road network: main boulevards + Left/Right turnable avenues & flyovers.
// Every leg can have `alts` (Left and Right turnable avenues at the intersection that
// swing out smoothly around the block and rejoin at the next major intersection).
// At any intersection:
//   - Steer Left (A / ←) or stay in the left lane to take the Left avenue (side = -1)
//   - Stay near the middle to continue Straight (side = 0, Main Metro Corridor)
//   - Steer Right (D / →) or stay in the right lane to take the Right avenue (side = +1)
import * as THREE from "three";

export const MAP = {
  start: { x: 0, z: 0, heading: 90 },
  width: 14,        // normal boulevard width
  sample: 2,        // distance between stored points

  legs: [
    // ---- Stage 1: Mohammadpur, Mirpur & Uttara Metro Corridor ----
    {
      id: "uttara-line", stage: 0,
      path: [["s", 220], ["r", 25, 220], ["s", 240], ["l", 25, 220], ["s", 180]],
      metro: [0.04, 0.96],
      junctions: [{ at: 0.48, type: "X" }, { at: 0.96, type: "X" }],
      alts: [
        { id: "mohammadpur-road", kind: "main", side: 1, width: 12, bulge: 28, chord: 0.5 },
        { id: "flyover", kind: "flyover", side: -1, width: 10, height: 7.5, bulge: 13 },
      ],
    },
    {
      id: "mirpur-line", stage: 0,
      path: [["s", 200], ["l", 35, 180], ["s", 220], ["r", 55, 160], ["s", 180]],
      metro: [0.04, 0.96],
      junctions: [{ at: 0.5, type: "X" }, { at: 0.96, type: "X" }],
      alts: [
        { id: "asadgate-road", kind: "main", side: 1, width: 12, bulge: 28, chord: 0.5 },
        { id: "mirpur-goli", kind: "street", side: -1, width: 9, bulge: 24, chord: 0.5 },
      ],
    },

    // ---- Stage 2: Shewrapara, Agargaon, Bijoy Sarani & Dhanmondi ----
    {
      id: "agargaon-line", stage: 1,
      path: [["s", 220], ["r", 35, 180], ["s", 240], ["l", 30, 190], ["s", 180]],
      metro: [0.04, 0.96],
      junctions: [{ at: 0.45, type: "X" }, { at: 0.96, type: "X" }],
      alts: [
        { id: "dhanmondi-lake-road", kind: "main", side: 1, width: 12, bulge: 30, chord: 0.5 },
        { id: "manik-mia-ave", kind: "main", side: -1, width: 12, bulge: 28, chord: 0.5 },
      ],
    },
    {
      id: "dhanmondi-mid", stage: 1,
      path: [["s", 200], ["r", 30, 180], ["s", 220], ["l", 30, 180], ["s", 180]],
      metro: [0.04, 0.96],
      junctions: [{ at: 0.52, type: "X" }, { at: 0.96, type: "X" }],
      alts: [
        { id: "kalabagan-lane", kind: "street", side: -1, width: 9, bulge: 25, chord: 0.6 },
        { id: "tejgaon-flyover", kind: "flyover", side: 1, width: 10, height: 7.5, bulge: 13 },
      ],
    },

    // ---- Stage 3: Farmgate, Karwan Bazar, Science Lab & Shahbagh ----
    {
      id: "science-lab", stage: 2,
      path: [["l", 45, 150], ["s", 240], ["r", 50, 150], ["s", 220], ["l", 35, 160], ["s", 180]],
      metro: [0.04, 0.96],
      junctions: [{ at: 0.08, type: "X" }, { at: 0.52, type: "X" }, { at: 0.96, type: "X" }],
      alts: [
        { id: "sciencelab-road", kind: "main", side: 1, width: 12, bulge: 28, chord: 0.55 },
        { id: "hatirjheel-road", kind: "main", side: -1, width: 11, bulge: 26, chord: 0.55 },
      ],
    },
    {
      id: "shahbag-approach", stage: 2,
      path: [["s", 280], ["r", 25, 200], ["s", 260]],
      metro: [0.04, 0.96],
      junctions: [{ at: 0.48, type: "X" }, { at: 0.96, type: "X" }],
      alts: [
        { id: "katabon-lane", kind: "street", side: -1, width: 9, bulge: 24, chord: 0.55 },
        { id: "ramna-road", kind: "main", side: 1, width: 11, bulge: 26, chord: 0.55 },
      ],
    },

    // ---- Stage 4: Dhaka University, Secretariat & Motijheel ----
    {
      id: "du-north", stage: 3,
      path: [["s", 140], ["r", 45, 150], ["s", 240], ["l", 30, 170], ["s", 200]],
      metro: [0.04, 0.96],
      junctions: [{ at: 0.18, type: "X" }, { at: 0.96, type: "X" }],
      alts: [
        { id: "nilkhet-road", kind: "street", side: -1, width: 10, bulge: 25, chord: 0.55 },
        { id: "ramna-south", kind: "main", side: 1, width: 11, bulge: 26, chord: 0.55 },
      ],
    },
    {
      id: "du-campus", stage: 3,
      path: [["s", 220], ["r", 35, 170], ["s", 260], ["l", 35, 170], ["s", 220]],
      metro: [0.04, 0.92],
      junctions: [{ at: 0.48, type: "X" }],
      alts: [
        { id: "paltan-road", kind: "main", side: -1, width: 11, bulge: 26, chord: 0.55 },
        { id: "motijheel-flyover", kind: "flyover", side: 1, width: 10, height: 7.5, bulge: 13 },
      ],
    },
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

function makeSeg(points, props) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / SAMPLE) + 1);
  const P = curve.getSpacedPoints(n - 1);
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), A = new Float32Array(n), K = new Float32Array(n);
  for (let i = 0; i < n; i++) { X[i] = P[i].x; Y[i] = P[i].y; Z[i] = P[i].z; }
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
    K[i] = -(A[j] - A[k]) / step;
  }
  return { ...props, len, n, step, X, Y, Z, A, K, next: [], alts: [] };
}

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

/**
 * A branching avenue or flyover that peels off smoothly at an intersection and rejoins at the next hub.
 * Uses the chord normal so inner curves never pinch or self-intersect, and keeps the first/last 3%
 * aligned with the main road so transitions across intersections are completely seamless.
 */
function makeAlt(main, alt) {
  const pts = [], m = Math.ceil(main.len / (SAMPLE * 3));
  const ax = main.X[0], az = main.Z[0], bx = main.X[main.n - 1], bz = main.Z[main.n - 1];
  const dx = bx - ax, dz = bz - az, chordLen = Math.hypot(dx, dz) || 1;
  // Right-hand unit normal of the chord from start to end of the leg.
  const crx = -dz / chordLen, crz = dx / chordLen;

  for (let i = 0; i <= m; i++) {
    const t = i / m, f = Math.min(main.n - 1, t * (main.n - 1)), idx = Math.round(f);
    let x = main.X[idx], z = main.Z[idx], y = 0;
    const a = main.A[idx], rx = Math.cos(a), rz = -Math.sin(a);
    const w = smooth(0.03, 0.24, t) * smooth(0.97, 0.76, t);
    if (alt.kind === "flyover") {
      const off = alt.bulge * w;
      y = alt.height * smooth(0.05, 0.28, t) * smooth(0.95, 0.72, t);
      pts.push(new THREE.Vector3(x + rx * off * alt.side, y, z + rz * off * alt.side));
    } else {
      const off = alt.bulge * w;
      const c = (alt.chord || 0.5) * w;
      x += ((ax + dx * t) - x) * c;
      z += ((az + dz * t) - z) * c;
      // Blend local road normal near the ends with chord normal in the middle for a smooth, twist-free curve.
      const nx = rx * (1 - c) + crx * c, nz = rz * (1 - c) + crz * c;
      const nLen = Math.hypot(nx, nz) || 1;
      pts.push(new THREE.Vector3(x + (nx / nLen) * off * alt.side, 0, z + (nz / nLen) * off * alt.side));
    }
  }
  return makeSeg(pts, { id: alt.id, kind: alt.kind, side: alt.side, half: alt.width / 2, stage: main.stage, main: false });
}

export const SEGS = [];
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

    const altList = leg.alts || (leg.alt ? [leg.alt] : []);
    for (const altDef of altList) {
      const a = makeAlt(seg, altDef);
      a.p0 = seg.p0; a.p1 = seg.p1; a.from = li; a.junctions = [];
      const f = a.len / seg.len;
      a.turns = seg.turns.map(t => ({ ...t, s: t.s * f, end: t.end * f }));
      if (seg.alt === undefined) seg.alt = SEGS.length;
      seg.alts.push(SEGS.length);
      SEGS.push(a);
    }
    if (leg.metro) {
      seg.metro = leg.metro;
    }
    // Place centre folk-art pillars on the flyover & Shahbagh/DU metro stretches.
    if (li === 0 || li === 5 || li === 6) {
      seg.pillarFrom = seg.len * 0.25;
      seg.pillarTo = seg.len * 0.78;
    }
  }
  // Connect every segment in leg `li` to the main road and all left/right branches of leg `li + 1`.
  for (let li = 0; li < MAIN.length - 1; li++) {
    const nextMain = MAIN[li + 1];
    const targets = [nextMain, ...SEGS[nextMain].alts];
    SEGS[MAIN[li]].next = targets;
    for (const altIdx of SEGS[MAIN[li]].alts) {
      SEGS[altIdx].next = targets;
    }
  }
})();

export const ROUTE_LENGTH = SEGS[MAIN[MAIN.length - 1]].p1;

export const STAGE_LENGTHS = MAP.legs.reduce((acc, leg, i) => {
  acc[leg.stage] = (acc[leg.stage] || 0) + SEGS[MAIN[i]].len;
  return acc;
}, []);

/* ====== Lookups ====== */

export const here = { seg: 0, s: 0, prev: -1 };

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
export function place(obj, seg, s, x, y = 0, extraYaw = 0) {
  sample(seg, s, tmp);
  obj.position.set(tmp.x + Math.cos(tmp.yaw) * x, tmp.y + y, tmp.z - Math.sin(tmp.yaw) * x);
  obj.rotation.y = tmp.yaw + extraYaw;
}

export function ahead(seg, s) {
  if (seg === here.seg) return s - here.s;
  const cur = SEGS[here.seg];
  if (cur.next.includes(seg)) return cur.len - here.s + s;
  if (seg === here.prev) return -(here.s + SEGS[seg].len - s);
  if (SEGS[seg].from === cur.from) return (s / SEGS[seg].len - here.s / cur.len) * cur.len;
  for (const n of cur.next) if (SEGS[n].next.includes(seg)) return cur.len - here.s + SEGS[n].len + s;
  return NaN;
}

export function progressOf(seg, s) {
  const S = SEGS[seg];
  return S.p0 + (s / S.len) * (S.p1 - S.p0);
}

export function fromProgress(p, out) {
  for (const i of MAIN) {
    const S = SEGS[i];
    if (p < S.p1 || i === MAIN[MAIN.length - 1]) { out.seg = i; out.s = Math.min(S.len, Math.max(0, p - S.p0)); return out; }
  }
  return out;
}

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

export function lanesOf(seg, lanes) {
  const h = SEGS[seg].half;
  return lanes.filter(l => Math.abs(l) <= h - 2);
}
