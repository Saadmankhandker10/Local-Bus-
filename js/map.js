// The Dhaka city road network: main MRT-6 Metro Spine + West/East branching avenues.
// Every leg can have `alts` (Left and Right turnable avenues at the intersection that
// swing out into their own neighbourhood and rejoin at the next major hub).
// At any intersection:
//   - Steer Left (A / ←) to take the Left avenue (side = -1)
//   - Stay near the middle to continue Straight (side = 0, Main Metro Spine)
//   - Steer Right (D / →) to take the Right avenue (side = +1)
import * as THREE from "three";

export const MAP = {
  start: { x: 0, z: 0, heading: 90 },
  width: 14,        // normal boulevard width
  sample: 2,        // distance between stored points

  legs: [
    // ---- Stage 1: Uttara, Pallabi, Mirpur & Mohammadpur ----
    {
      id: "uttara-line", stage: 0,
      path: [["s", 320], ["r", 25, 220], ["s", 340], ["l", 25, 220], ["s", 280]],
      metro: [0.02, 0.98],
      junctions: [{ at: 0.48, type: "X" }, { at: 0.98, type: "X" }],
      alts: [
        { id: "mohammadpur-road", kind: "main", side: 1, width: 12, bulge: 58, chord: 0.25 },
        { id: "flyover", kind: "flyover", side: -1, width: 10, height: 8, bulge: 14 },
      ],
    },
    {
      id: "mirpur-line", stage: 0,
      path: [["s", 280], ["l", 35, 180], ["s", 320], ["r", 65, 140], ["s", 280]],
      metro: [0.02, 0.98],
      junctions: [{ at: 0.5, type: "X" }, { at: 0.98, type: "X" }],
      alts: [
        { id: "asadgate-road", kind: "main", side: 1, width: 12, bulge: 62, chord: 0.3 },
        { id: "mirpur-goli", kind: "street", side: -1, width: 9, bulge: 46, chord: 0.4 },
      ],
    },

    // ---- Stage 2: Shewrapara, Agargaon, Bijoy Sarani & Dhanmondi ----
    {
      id: "agargaon-line", stage: 1,
      path: [["s", 300], ["r", 40, 170], ["s", 340], ["l", 30, 190], ["s", 260]],
      metro: [0.02, 0.98],
      junctions: [{ at: 0.45, type: "X" }, { at: 0.98, type: "X" }],
      alts: [
        { id: "dhanmondi-lake-road", kind: "main", side: 1, width: 12, bulge: 64, chord: 0.25 },
        { id: "manik-mia-ave", kind: "main", side: -1, width: 13, bulge: 56, chord: 0.2 },
      ],
    },
    {
      id: "dhanmondi-mid", stage: 1,
      path: [["s", 260], ["r", 35, 180], ["s", 320], ["l", 35, 180], ["s", 260]],
      metro: [0.02, 0.98],
      junctions: [{ at: 0.52, type: "X" }, { at: 0.98, type: "X" }],
      alts: [
        { id: "kalabagan-lane", kind: "street", side: -1, width: 9, bulge: 44, chord: 0.5 },
        { id: "tejgaon-flyover", kind: "flyover", side: 1, width: 10, height: 8, bulge: 14 },
      ],
    },

    // ---- Stage 3: Farmgate, Karwan Bazar, Science Lab & Shahbagh ----
    {
      id: "science-lab", stage: 2,
      path: [["l", 65, 90], ["s", 340], ["r", 70, 95], ["s", 300], ["l", 45, 120], ["s", 280]],
      metro: [0.02, 0.98],
      junctions: [{ at: 0.04, type: "X" }, { at: 0.52, type: "X" }, { at: 0.98, type: "X" }],
      alts: [
        { id: "sciencelab-road", kind: "main", side: 1, width: 12, bulge: 60, chord: 0.3 },
        { id: "hatirjheel-road", kind: "main", side: -1, width: 11, bulge: 54, chord: 0.25 },
      ],
    },
    {
      id: "shahbag-approach", stage: 2,
      path: [["s", 380], ["r", 30, 200], ["s", 340]],
      metro: [0.02, 0.98],
      junctions: [{ at: 0.48, type: "X" }, { at: 0.98, type: "X" }],
      alts: [
        { id: "katabon-lane", kind: "street", side: -1, width: 9, bulge: 42, chord: 0.35 },
        { id: "ramna-road", kind: "main", side: 1, width: 11, bulge: 54, chord: 0.25 },
      ],
    },

    // ---- Stage 4: Dhaka University, Secretariat & Motijheel ----
    {
      id: "du-north", stage: 3,
      path: [["s", 120], ["r", 75, 65], ["s", 320], ["l", 35, 160], ["s", 280]],
      metro: [0.02, 0.98],
      junctions: [{ at: 0.15, type: "X" }, { at: 0.98, type: "X" }],
      alts: [
        { id: "nilkhet-road", kind: "street", side: -1, width: 10, bulge: 48, chord: 0.3 },
        { id: "ramna-south", kind: "main", side: 1, width: 11, bulge: 52, chord: 0.25 },
      ],
    },
    {
      id: "du-campus", stage: 3,
      path: [["s", 300], ["r", 40, 170], ["s", 380], ["l", 40, 170], ["s", 300]],
      metro: [0.02, 0.94],
      junctions: [{ at: 0.48, type: "X" }],
      alts: [
        { id: "paltan-road", kind: "main", side: -1, width: 11, bulge: 52, chord: 0.25 },
        { id: "motijheel-flyover", kind: "flyover", side: 1, width: 10, height: 8, bulge: 14 },
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

/** A branching avenue or flyover that peels off at an intersection and rejoins at the next hub. */
function makeAlt(main, alt) {
  const pts = [], m = Math.ceil(main.len / (SAMPLE * 3));
  const ax = main.X[0], az = main.Z[0], bx = main.X[main.n - 1], bz = main.Z[main.n - 1];
  for (let i = 0; i <= m; i++) {
    const t = i / m, f = Math.min(main.n - 1, t * (main.n - 1)), idx = Math.round(f);
    let x = main.X[idx], z = main.Z[idx], y = 0;
    const a = main.A[idx], rx = Math.cos(a), rz = -Math.sin(a);
    let off;
    if (alt.kind === "flyover") {
      const top = smooth(.2, .32, t) * smooth(.8, .68, t);
      off = alt.bulge * smooth(0, .1, t) * smooth(1, .9, t) * (1 - top);
      y = alt.height * smooth(0, .25, t) * smooth(1, .75, t);
    } else {
      const w = smooth(0, .14, t) * smooth(1, .86, t);
      off = alt.bulge * w;
      const c = (alt.chord || 0) * w;
      x += ((ax + (bx - ax) * t) - x) * c;
      z += ((az + (bz - az) * t) - z) * c;
    }
    pts.push(new THREE.Vector3(x + rx * off * alt.side, y, z + rz * off * alt.side));
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
      if (altDef.kind === "flyover" && !leg.metro) {
        seg.pillarFrom = seg.len * .3; seg.pillarTo = seg.len * .7;
      }
    }
    if (leg.metro) {
      seg.metro = leg.metro;
      seg.pillarFrom = seg.len * leg.metro[0] + 14;
      seg.pillarTo = seg.len * leg.metro[1] - 14;
    }
  }
  // Connect every segment in leg `li` to the main road and all left/right branches of leg `li + 1`.
  for (let li = 0; li < MAIN.length; li++) {
    const nextMain = MAIN[li + 1];
    // At the end of the final leg, loop back to leg 0 for endless open-world exploration if needed.
    const targetLeg = nextMain !== undefined ? nextMain : MAIN[0];
    const targets = [targetLeg, ...SEGS[targetLeg].alts];
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
