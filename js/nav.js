// Navigation: the round minimap in the corner, the GPS box under it (an arrow that shows
// which way the road goes, the next stop, the next turn or fork), and the helper
// shouting out turns and forks before the bus gets there.
//
// The minimap is "heading-up": it turns with the bus, so up on the map is always the
// way the bus is facing, like a phone GPS in a car.
import { CFG } from "./config.js";
import { $ } from "./utils.js";
import { game } from "./state.js";
import { emit } from "./events.js";
import { bus, chooseNext } from "./bus.js";
import { SEGS, here, sample, walk, fromProgress } from "./map.js";
import { ROUTE, TOTAL, STAGE_START } from "./route.js";
import { journey } from "./journey.js";
import { eachMark } from "./marks.js";
import { lineFrom } from "./speech.js";
import { bnNum, ROADS, UI } from "./i18n.js";

const N = CFG.nav;
const mm = $("minimap"), ctx = mm.getContext("2d");
const p = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };  // reused road sample
const spot = { seg: 0, s: 0 };                 // reused road spot
let drawT = 0;      // seconds until the next minimap redraw
let lastCall = 0;   // key of the turn / fork the helper called last (so it is called once)
let shownArrow = 99, shownDest = "", shownNext = "";

/* ====== Road shapes for the minimap (made once) ====== */

// Every road piece as a short list of x, z points (every third stored point is plenty
// at this size) plus a box around it, so pieces far from the bus are skipped quickly.
const SHAPES = SEGS.map(S => {
  const pts = [];
  for (let i = 0; i < S.n; i += 3) pts.push(S.X[i], S.Z[i]);
  pts.push(S.X[S.n - 1], S.Z[S.n - 1]);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]);
  }
  return { kind: S.kind, width: S.half * 2, pts: new Float32Array(pts), x0, x1, z0, z1 };
});
const STYLE = {
  street: { color: "#6f7378" },
  main: { color: "#9a9ea4" },
  flyover: { color: "#c5d3da", edge: "#1b1f22" },
};

/* ====== What comes next on the way ====== */

// The nearest turn or fork ahead, on the way the bus is heading. Reused object.
const next = { kind: "", d: 0, dir: "", road: "", key: 0 };

/**
 * Look ahead along the road the bus will take (at a fork, the branch on the side it is
 * driving) for the first sharp turn or fork within `limit` units.
 */
function findNext(limit) {
  next.kind = "";
  let seg = here.seg, base = -here.s; // base = distance from the bus to the start of `seg`
  for (let hop = 0; hop < 3 && base < limit; hop++) {
    const S = SEGS[seg];
    for (const t of S.turns) {
      const d = base + t.s;
      if (t.deg < N.turnMinDeg || d < 0 || d > limit) continue;
      next.kind = "turn"; next.d = d; next.dir = t.deg >= N.uTurnDeg ? "u" : t.dir;
      next.key = seg * 100000 + Math.round(t.s) + 1;
      return next;
    }
    const end = base + S.len;
    if (S.next.length > 1 && end <= limit) {
      const alt = SEGS[S.next[1]];
      next.kind = "fork"; next.d = end; next.dir = alt.side > 0 ? "r" : "l";
      next.road = ROADS[alt.id] || "";
      next.key = -(seg + 1);
      return next;
    }
    if (!S.next.length) break;
    base = end;
    seg = chooseNext(S.next);
  }
  return next;
}

/** Distance in world units as Bangla metres or kilometres (the trip is scaled to the real ~7 km). */
function fmtDist(units) {
  const m = Math.max(0, units) / TOTAL * ROUTE.realKm * 1000;
  return m >= 1000 ? `${bnNum((m / 1000).toFixed(1))} ${UI.km}` : `${bnNum(Math.round(m / 10) * 10)} ${UI.m}`;
}

/** Journey progress of the next stop (the end of the current stage), and its name. */
function destProgress() {
  const i = journey.stage + 1;
  return i < STAGE_START.length ? STAGE_START[i] : TOTAL;
}
function destName() {
  return ROUTE.stages[Math.min(journey.stage + 1, ROUTE.stages.length - 1)].name;
}

/* ====== Update (simulation) ====== */

/** New run: the helper may call every turn again. */
export function resetNav() {
  lastCall = 0;
  drawT = 0;
}

/** The helper calls the next turn or fork once, a little before the bus gets there. Call every step. */
export function navStep() {
  if (!game.running || game.crashing || game.caught) return;
  const m = findNext(Math.max(CFG.map.forkWarn, N.turnCall));
  if (!m.kind || m.key === lastCall) return;
  if (m.d > (m.kind === "fork" ? CFG.map.forkWarn : N.turnCall)) return;
  lastCall = m.key;
  const text = m.kind === "fork"
    ? lineFrom("navFork", m.dir === "r" ? "right" : "left").replace("{road}", m.road)
    : lineFrom("navTurn", m.dir);
  emit("helperSay", text);
}

/* ====== Drawing (every frame, but the minimap only a few times a second) ====== */

/** Redraw the minimap and the GPS box when it is time. dt = real seconds since the last frame. */
export function drawNav(dt) {
  const show = game.running;
  if ($("nav").hidden === show) $("nav").hidden = !show;
  if (!show) return;
  drawT -= dt;
  if (drawT > 0) return;
  drawT = 1 / N.mapHz;
  drawMap();
  updateGps();
}

function drawMap() {
  // Match the canvas pixels to its size on screen (sharp on phones with dense screens).
  const want = Math.round(mm.clientWidth * (devicePixelRatio || 1));
  if (!want) return;
  if (mm.width !== want) mm.width = mm.height = want;
  const W = want, R = W / 2, cx = R, cy = W * N.mapBusY, k = R / N.mapRange;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "rgba(20, 30, 22, .78)";
  ctx.fillRect(0, 0, W, W);

  // World -> minimap: move the bus to (cx, cy), turn so the bus faces up, and scale.
  // A canvas transform (a, b, c, d, e, f) maps x, z to (a*x + c*z + e, b*x + d*z + f).
  const yaw = bus.rotation.y, a = Math.cos(yaw) * k, b = Math.sin(yaw) * k;
  const bx = bus.position.x, bz = bus.position.z;
  const e = cx - (a * bx - b * bz), f = cy - (b * bx + a * bz);
  ctx.setTransform(a, b, -b, a, e, f);
  ctx.lineCap = ctx.lineJoin = "round";

  const reach = N.mapRange * 1.6;
  for (const kind of ["street", "main", "flyover"]) {
    const st = STYLE[kind];
    for (const pass of st.edge ? [0, 1] : [1]) {
      ctx.beginPath();
      let width = 0;
      for (const sh of SHAPES) {
        if (sh.kind !== kind || bx < sh.x0 - reach || bx > sh.x1 + reach || bz < sh.z0 - reach || bz > sh.z1 + reach) continue;
        const P = sh.pts;
        ctx.moveTo(P[0], P[1]);
        for (let i = 2; i < P.length; i += 2) ctx.lineTo(P[i], P[i + 1]);
        width = sh.width;
      }
      if (!width) continue;
      // The flyover gets a dark outline first, so it reads as passing over the road below.
      ctx.lineWidth = width * N.mapRoadScale + (pass ? 0 : 6);
      ctx.strokeStyle = pass ? st.color : st.edge;
      ctx.stroke();
    }
  }

  // Yellow route line: the way the bus is heading, up to the next stop.
  const toDest = destProgress() - game.prog;
  ctx.beginPath();
  ctx.moveTo(bx, bz);
  for (let d = N.routeStep; d < Math.min(toDest, reach); d += N.routeStep) {
    walk(here.seg, here.s, d, chooseNext, spot);
    sample(spot.seg, spot.s, p);
    ctx.lineTo(p.x, p.z);
  }
  ctx.lineWidth = N.routeWidth;
  ctx.strokeStyle = "#ffd600";
  ctx.stroke();

  // From here on, draw in screen pixels so icons keep their size.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const px = N.markPx * (W / mm.clientWidth);
  eachMark((kind, x, z) => {
    const sx = a * x - b * z + e, sy = b * x + a * z + f;
    if ((sx - R) ** 2 + (sy - R) ** 2 > R * R) return;
    markIcon(kind, sx, sy, px);
  });

  // The next stop: a flag, held at the rim of the map while it is still far away.
  fromProgress(destProgress(), spot);
  sample(spot.seg, spot.s, p);
  let sx = a * p.x - b * p.z + e, sy = b * p.x + a * p.z + f;
  const dx = sx - R, dy = sy - R, dist = Math.hypot(dx, dy), rim = R - px * 3;
  if (dist > rim) { sx = R + dx / dist * rim; sy = R + dy / dist * rim; }
  ctx.font = `${Math.round(px * 4)}px "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🏁", sx, sy);

  // The bus: a white arrow in the middle, always pointing up.
  ctx.beginPath();
  ctx.moveTo(cx, cy - px * 2.6);
  ctx.lineTo(cx + px * 1.7, cy + px * 2);
  ctx.lineTo(cx, cy + px * 1.1);
  ctx.lineTo(cx - px * 1.7, cy + px * 2);
  ctx.closePath();
  ctx.fillStyle = "#fff"; ctx.fill();
  ctx.lineWidth = px * .5; ctx.strokeStyle = "#1b5e20"; ctx.stroke();
  ctx.restore();
}

/** Stop = blue circle, CNG = yellow square, police = pink triangle (colour AND shape differ). */
function markIcon(kind, x, y, r) {
  ctx.beginPath();
  if (kind === "stop") { ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = "#42a5f5"; }
  else if (kind === "cng") { ctx.rect(x - r, y - r, r * 2, r * 2); ctx.fillStyle = "#ffd600"; }
  else { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y + r * .8); ctx.lineTo(x - r * 1.1, y + r * .8); ctx.closePath(); ctx.fillStyle = "#ff6fb5"; }
  ctx.fill();
  ctx.lineWidth = r * .4; ctx.strokeStyle = "#111"; ctx.stroke();
}

const GLYPH = { l: "↰", r: "↱", u: "↶" };

/** The GPS box: arrow towards the road ahead, the next stop, and the next turn or fork. */
function updateGps() {
  // Arrow: points at the spot on the road a little ahead, compared with where the bus faces.
  walk(here.seg, here.s, N.arrowAhead, chooseNext, spot);
  sample(spot.seg, spot.s, p);
  const lat = Math.max(-SEGS[spot.seg].half, Math.min(SEGS[spot.seg].half, game.lat));
  const dx = p.x + Math.cos(p.yaw) * lat - bus.position.x, dz = p.z - Math.sin(p.yaw) * lat - bus.position.z;
  const yaw = bus.rotation.y;
  const right = dx * Math.cos(yaw) - dz * Math.sin(yaw), fwd = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  const ang = Math.atan2(right, fwd);
  if (Math.abs(ang - shownArrow) > .02) {
    shownArrow = ang;
    $("gpsArrow").style.transform = `rotate(${ang.toFixed(3)}rad)`;
  }

  const dest = destName() + "\n" + fmtDist(destProgress() - game.prog); // name, then distance below it
  if (dest !== shownDest) { shownDest = dest; $("gpsDest").textContent = dest; }

  const m = findNext(N.showAhead);
  let text = "";
  if (m.kind === "turn") text = `${GLYPH[m.dir]} ${m.dir === "u" ? UI.uTurn : m.dir === "l" ? UI.left : UI.right} · ${fmtDist(m.d)}`;
  else if (m.kind === "fork") text = `${m.dir === "r" ? "↗" : "↖"} ${UI[m.dir === "r" ? "right" : "left"]} ${m.road} · ${fmtDist(m.d)}`;
  if (text !== shownNext) {
    shownNext = text;
    $("gpsNext").textContent = text;
    $("gpsNext").hidden = !text;
  }
}
