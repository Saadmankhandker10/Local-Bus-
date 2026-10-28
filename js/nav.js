// 4D Navigation & Interactive Dhaka City Map:
//   1. Corner 4D tilted minimap (#minimap): 3D extruded buildings, multi-level flyover & Metro viaduct,
//      live moving traffic dots, live moving Metro train, chasing crowd radar, and 4th-dimension Time-of-Day clock.
//   2. Full-screen interactive 4D Dhaka Route Map (#bigmap in #mapModal): click the minimap or press Tab
//      to inspect the entire 7 km route in 3D perspective with pan & zoom.
import { CFG } from "./config.js";
import { $, clamp } from "./utils.js";
import { game } from "./state.js";
import { emit } from "./events.js";
import { bus, chooseNext } from "./bus.js";
import { SEGS, here, sample, walk, fromProgress } from "./map.js";
import { ROUTE, TOTAL, STAGE_START } from "./route.js";
import { journey, progress } from "./journey.js";
import { eachMark } from "./marks.js";
import { eachTraffic } from "./traffic.js";
import { eachMetroCar } from "./landmarks.js";
import { crowd } from "./crowd.js";
import { lineFrom } from "./speech.js";
import { bnNum, ROADS, UI } from "./i18n.js";

const N = CFG.nav;
const mm = $("minimap"), ctx = mm.getContext("2d");
const bm = $("bigmap"), bctx = bm ? bm.getContext("2d") : null;
const p = { x: 0, y: 0, z: 0, yaw: 0, k: 0 };  // reused road sample
const spot = { seg: 0, s: 0 };                 // reused road spot
let drawT = 0;      // seconds until the next minimap redraw
let lastCall = 0;   // key of the turn / fork the helper called last (so it is called once)
let shownArrow = 99, shownDest = "", shownNext = "", shownClock = "";

/* ====== Pre-computed 3D Road & Building Shapes for the 4D Map ====== */

const SHAPES = SEGS.map(S => {
  const pts = [], metroPts = [];
  for (let i = 0; i < S.n; i += 3) {
    pts.push(S.X[i], S.Y[i], S.Z[i]);
    if (S.metro) {
      const f = i / (S.n - 1);
      if (f >= S.metro[0] && f <= S.metro[1]) metroPts.push(S.X[i], S.Z[i]);
    }
  }
  pts.push(S.X[S.n - 1], S.Y[S.n - 1], S.Z[S.n - 1]);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    z0 = Math.min(z0, pts[i + 2]); z1 = Math.max(z1, pts[i + 2]);
  }
  return {
    id: S.id, kind: S.kind, stage: S.stage, width: S.half * 2,
    pts: new Float32Array(pts), metroPts: new Float32Array(metroPts),
    x0, x1, z0, z1,
  };
});

// Pre-build 3D roadside building blocks & Dhanmondi lake polygons once for the 3D/4D map extrusion.
const MAP_BLDGS = [];
const LAKE_PTS = [];
(function buildMapScenery() {
  for (let segIdx = 0; segIdx < SEGS.length; segIdx++) {
    const S = SEGS[segIdx];
    if (!S.main) continue;
    for (let s = 20; s < S.len - 20; s += 38) {
      sample(segIdx, s, p);
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const f = s / S.len;
      // Along Dhanmondi lake (stage 1, right side), record water strip instead of buildings.
      if (S.stage === 1 && f >= 0.15 && f <= 0.75) {
        LAKE_PTS.push({ x: p.x + rx * (S.half + 20), z: p.z + rz * (S.half + 20) });
      }
      for (const side of [-1, 1]) {
        if (S.stage === 1 && side === 1 && f >= 0.15 && f <= 0.75) continue;
        const dist = S.half + 11 + ((s * 7 + side * 3) % 7);
        const h = 8 + ((s * 13 + (side > 0 ? 5 : 2)) % 16); // building height in world units
        const color = S.stage === 3 ? "#b5543c" : S.stage === 2 ? "#ce93d8" : S.stage === 1 ? "#80cbc4" : "#bcaaa4";
        MAP_BLDGS.push({
          x: p.x + rx * dist * side,
          z: p.z + rz * dist * side,
          w: 11, h, color,
        });
      }
    }
  }
})();

// Key Dhaka landmarks pinned on the 4D map with 3D labels.
const MAP_PINS = [
  { progFrac: 0.01, side: -1, icon: "🚏", name: "মোহাম্মদপুর বাসস্ট্যান্ড" },
  { progFrac: 0.22, side: 0,  icon: "⛩", name: "আসাদগেট" },
  { progFrac: 0.36, side: 1,  icon: "🌊", name: "ধানমন্ডি লেক" },
  { progFrac: 0.56, side: 0,  icon: "🌉", name: "সায়েন্সল্যাব মোড়" },
  { progFrac: 0.69, side: 0,  icon: "✊", name: "শাহবাগ মিছিল" },
  { progFrac: 0.74, side: 0,  icon: "🌸", name: "শাহবাগ মোড়" },
  { progFrac: 0.85, side: -1, icon: "🏛", name: "কার্জন হল" },
  { progFrac: 0.89, side: 1,  icon: "🕊", name: "শহীদ মিনার" },
  { progFrac: 0.94, side: 1,  icon: "🎓", name: "টিএসসি / ঢাবি" },
].map(pin => {
  fromProgress(pin.progFrac * TOTAL, spot);
  sample(spot.seg, spot.s, p);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  return { ...pin, x: p.x + rx * pin.side * 18, z: p.z + rz * pin.side * 18 };
});

const STYLE = {
  street: { color: "#5c646b" },
  main: { color: "#8d949b" },
  flyover: { color: "#cfd8dc", edge: "#101619" },
};

/* ====== 4th Dimension: Journey Time-of-Day Clock & Palette ====== */

function timeOfDayInfo(progFrac) {
  // Maps journey progress 0..1 to 6:30 AM .. 7:00 PM (12.5 hours across the Dhaka day).
  const totalMins = Math.round(6 * 60 + 30 + progFrac * (12 * 60 + 30));
  const h24 = Math.floor(totalMins / 60) % 24, m = totalMins % 60;
  const h12 = h24 % 12 || 12;
  const period = h24 < 12 ? "☀ সকাল" : h24 < 15 ? "🌤 দুপুর" : h24 < 18 ? "🌇 বিকেল" : "🌙 সন্ধ্যা";
  const bg = progFrac < 0.2 ? "#182622" : progFrac < 0.55 ? "#142822" : progFrac < 0.8 ? "#281e18" : "#0c1324";
  return {
    label: `${period} ${bnNum(h12)}:${bnNum(String(m).padStart(2, "0"))}`,
    bg,
    isNight: progFrac >= 0.74,
  };
}

/* ====== What comes next on the way ====== */

const next = { kind: "", d: 0, dir: "", road: "", key: 0 };

function findNext(limit) {
  next.kind = "";
  let seg = here.seg, base = -here.s;
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

function fmtDist(units) {
  const m = Math.max(0, units) / TOTAL * ROUTE.realKm * 1000;
  return m >= 1000 ? `${bnNum((m / 1000).toFixed(1))} ${UI.km}` : `${bnNum(Math.round(m / 10) * 10)} ${UI.m}`;
}

function destProgress() {
  const i = journey.stage + 1;
  return i < STAGE_START.length ? STAGE_START[i] : TOTAL;
}
function destName() {
  return ROUTE.stages[Math.min(journey.stage + 1, ROUTE.stages.length - 1)].name;
}

/* ====== Update (simulation) ====== */

export function resetNav() {
  lastCall = 0;
  drawT = 0;
}

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

/* ====== Drawing the 4D Corner Minimap & Full-Screen 4D City Map ====== */

export function drawNav(dt) {
  const show = game.running;
  if ($("nav").hidden === show) $("nav").hidden = !show;
  const modalOpen = $("mapModal") && !$("mapModal").hidden;
  if (!show && !modalOpen) return;
  drawT -= dt;
  if (drawT > 0 && !modalOpen) return;
  drawT = 1 / N.mapHz;
  const tod = timeOfDayInfo(progress(game.prog));
  if (tod.label !== shownClock) {
    shownClock = tod.label;
    if ($("map4dClock")) $("map4dClock").textContent = tod.label;
    if ($("bigMapClock")) $("bigMapClock").textContent = tod.label;
  }
  if (show) {
    drawMap(tod);
    updateGps();
  }
  if (modalOpen) drawBig4DMap(tod);
}

function drawMap(tod) {
  const want = Math.round(mm.clientWidth * (devicePixelRatio || 1));
  if (!want) return;
  if (mm.width !== want) mm.width = mm.height = want;
  const W = want, R = W / 2, cx = R, cy = W * N.mapBusY, k = R / N.mapRange;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "rgba(22, 22, 28, 0.55)";
  ctx.fillRect(0, 0, W, W);

  // Subtle radar crosshairs and rings.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cy); ctx.lineTo(W, cy);
  ctx.moveTo(cx, 0); ctx.lineTo(cx, W);
  ctx.stroke();

  const yaw = bus.rotation.y, a = Math.cos(yaw) * k, b = Math.sin(yaw) * k;
  const bx = bus.position.x, bz = bus.position.z;
  const e = cx - (a * bx - b * bz), f = cy - (b * bx + a * bz);
  ctx.setTransform(a, b, -b, a, e, f);
  ctx.lineCap = ctx.lineJoin = "round";

  const reach = N.mapRange * 1.6;

  // Dhanmondi Lake water shimmer on the map.
  if (LAKE_PTS.length > 1) {
    ctx.beginPath();
    ctx.moveTo(LAKE_PTS[0].x, LAKE_PTS[0].z);
    for (let i = 1; i < LAKE_PTS.length; i++) ctx.lineTo(LAKE_PTS[i].x, LAKE_PTS[i].z);
    ctx.lineWidth = 26;
    ctx.strokeStyle = "rgba(41, 182, 246, 0.45)";
    ctx.stroke();
  }

  // Ground & Flyover roads.
  for (const kind of ["street", "main", "flyover"]) {
    const st = STYLE[kind];
    for (const pass of st.edge ? [0, 1] : [1]) {
      ctx.beginPath();
      let width = 0;
      for (const sh of SHAPES) {
        if (sh.kind !== kind || bx < sh.x0 - reach || bx > sh.x1 + reach || bz < sh.z0 - reach || bz > sh.z1 + reach) continue;
        const P = sh.pts;
        ctx.moveTo(P[0], P[2]);
        for (let i = 3; i < P.length; i += 3) ctx.lineTo(P[i], P[i + 2]);
        width = sh.width;
      }
      if (!width) continue;
      ctx.lineWidth = width * N.mapRoadScale + (pass ? 0 : 7);
      ctx.strokeStyle = pass ? st.color : st.edge;
      ctx.stroke();
    }
  }

  // Elevated Metro Rail viaduct line (teal track).
  ctx.beginPath();
  for (const sh of SHAPES) {
    const M = sh.metroPts;
    if (!M.length) continue;
    ctx.moveTo(M[0], M[1]);
    for (let i = 2; i < M.length; i += 2) ctx.lineTo(M[i], M[i + 1]);
  }
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(53, 224, 194, 0.55)";
  ctx.stroke();

  // Yellow GPS route line ahead of the bus.
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

  // Switch to screen pixels for 3D extruded buildings, live traffic, Metro train, and icons.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const px = N.markPx * (W / mm.clientWidth);

  // 3D extruded roadside buildings (roof offset upward along -y on screen).
  for (const bl of MAP_BLDGS) {
    if (Math.abs(bl.x - bx) > reach || Math.abs(bl.z - bz) > reach) continue;
    const sx = a * bl.x - b * bl.z + e, sy = b * bl.x + a * bl.z + f;
    if ((sx - R) ** 2 + (sy - R) ** 2 > R * R) continue;
    const hPx = bl.h * k * 0.55, wPx = Math.max(3, bl.w * k * 0.65);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(sx - wPx / 2, sy - wPx / 2, wPx, wPx);
    ctx.fillStyle = bl.color;
    ctx.fillRect(sx - wPx / 2, sy - wPx / 2 - hPx, wPx, wPx);
  }

  // Live moving traffic dots (4th dimension: real-time vehicles).
  eachTraffic((kind, vx, vy, vz) => {
    const sx = a * vx - b * vz + e, sy = b * vx + a * vz + f - vy * k * 0.5;
    if ((sx - R) ** 2 + (sy - R) ** 2 > R * R) return;
    ctx.fillStyle = kind === "heavy" ? "#ff5252" : kind === "cng" ? "#00e676" : "#ffee58";
    ctx.fillRect(sx - px * .7, sy - px * .7, px * 1.4, px * 1.4);
  });

  // Live moving Metro Rail carriages overhead.
  eachMetroCar((mx, my, mz) => {
    const sx = a * mx - b * mz + e, sy = b * mx + a * mz + f - my * k * 0.6;
    if ((sx - R) ** 2 + (sy - R) ** 2 > R * R) return;
    ctx.fillStyle = "#35e0c2";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, px * 1.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });

  // Chasing crowd radar pulse behind the bus.
  if (crowd.active) {
    const pulse = 0.55 + 0.45 * Math.sin(game.time * 8);
    ctx.fillStyle = `rgba(255, 111, 0, ${pulse.toFixed(2)})`;
    const cyCrowd = cy + crowd.gap * k;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * px * 1.4, Math.min(W - px, cyCrowd), px * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  eachMark((kind, x, z) => {
    const sx = a * x - b * z + e, sy = b * x + a * z + f;
    if ((sx - R) ** 2 + (sy - R) ** 2 > R * R) return;
    markIcon(ctx, kind, sx, sy, px);
  });

  // Next stop flag at the rim of the minimap.
  fromProgress(destProgress(), spot);
  sample(spot.seg, spot.s, p);
  let sx = a * p.x - b * p.z + e, sy = b * p.x + a * p.z + f;
  const dx = sx - R, dy = sy - R, dist = Math.hypot(dx, dy), rim = R - px * 3;
  if (dist > rim) { sx = R + dx / dist * rim; sy = R + dy / dist * rim; }
  ctx.font = `${Math.round(px * 3.8)}px "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🏁", sx, sy);

  // Night / dusk headlight cone in front of the bus arrow.
  if (tod.isNight || game.boostT > 0) {
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy - px * 9, px * 10);
    grad.addColorStop(0, "rgba(255, 245, 157, 0.55)");
    grad.addColorStop(1, "rgba(255, 245, 157, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - px * 5, cy - px * 11);
    ctx.lineTo(cx + px * 5, cy - px * 11);
    ctx.closePath();
    ctx.fill();
  }

  // The bus: 3D extruded arrow in the centre.
  ctx.beginPath();
  ctx.moveTo(cx, cy - px * 2.7);
  ctx.lineTo(cx + px * 1.8, cy + px * 2);
  ctx.lineTo(cx, cy + px * 1.1);
  ctx.lineTo(cx - px * 1.8, cy + px * 2);
  ctx.closePath();
  ctx.fillStyle = "#fff"; ctx.fill();
  ctx.lineWidth = px * .55; ctx.strokeStyle = "#1b5e20"; ctx.stroke();
  ctx.restore();
}

function markIcon(g, kind, x, y, r) {
  g.beginPath();
  if (kind === "stop") { g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = "#42a5f5"; }
  else if (kind === "cng") { g.rect(x - r, y - r, r * 2, r * 2); g.fillStyle = "#ffd600"; }
  else { g.moveTo(x, y - r * 1.2); g.lineTo(x + r * 1.1, y + r * .8); g.lineTo(x - r * 1.1, y + r * .8); g.closePath(); g.fillStyle = "#ff6fb5"; }
  g.fill();
  g.lineWidth = r * .4; g.strokeStyle = "#111"; g.stroke();
}

/* ====== Full-Screen Interactive 4D Dhaka City Map (#bigmap) ====== */

let bigZoom = 1.0, bigPanX = 0, bigPanZ = 0, dragging = false, dragX = 0, dragY = 0;

function drawBig4DMap(tod) {
  if (!bm || !bctx) return;
  const dpr = devicePixelRatio || 1;
  const W = Math.round(bm.clientWidth * dpr), H = Math.round(bm.clientHeight * dpr);
  if (!W || !H) return;
  if (bm.width !== W || bm.height !== H) { bm.width = W; bm.height = H; }

  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.fillStyle = tod.bg;
  bctx.fillRect(0, 0, W, H);

  // Isometric 3D projection centred on the bus + user pan offset, tilted at 35 degrees.
  const cx = bus.position.x + bigPanX, cz = bus.position.z + bigPanZ;
  const scale = (Math.min(W, H) / 1450) * bigZoom;
  const tilt = 0.72; // vertical foreshortening for 3D perspective
  const projX = (wx, wz) => W * 0.5 + (wx - cx) * scale;
  const projY = (wx, wy, wz) => H * 0.5 + (wz - cz) * scale * tilt - wy * scale * 2.2;

  // Background grid lines.
  bctx.strokeStyle = "rgba(53, 224, 194, 0.08)";
  bctx.lineWidth = 1;
  const step = 200;
  for (let gx = Math.floor((cx - 1200) / step) * step; gx <= cx + 1200; gx += step) {
    bctx.beginPath();
    bctx.moveTo(projX(gx, cz - 1200), projY(gx, 0, cz - 1200));
    bctx.lineTo(projX(gx, cz + 1200), projY(gx, 0, cz + 1200));
    bctx.stroke();
  }

  // Dhanmondi Lake water body.
  if (LAKE_PTS.length > 1) {
    bctx.beginPath();
    bctx.moveTo(projX(LAKE_PTS[0].x, LAKE_PTS[0].z), projY(LAKE_PTS[0].x, 0, LAKE_PTS[0].z));
    for (let i = 1; i < LAKE_PTS.length; i++) {
      bctx.lineTo(projX(LAKE_PTS[i].x, LAKE_PTS[i].z), projY(LAKE_PTS[i].x, 0, LAKE_PTS[i].z));
    }
    bctx.lineWidth = Math.max(8, 30 * scale);
    bctx.lineCap = "round";
    bctx.strokeStyle = "rgba(41, 182, 246, 0.5)";
    bctx.stroke();
  }

  // Draw all roads (ground roads first, then 3D elevated flyover with height wy = P[i+1]).
  bctx.lineCap = bctx.lineJoin = "round";
  for (const kind of ["street", "main", "flyover"]) {
    const st = STYLE[kind];
    for (const sh of SHAPES) {
      if (sh.kind !== kind) continue;
      const P = sh.pts;
      if (kind === "flyover") {
        // Shadow on the ground below the flyover.
        bctx.beginPath();
        bctx.moveTo(projX(P[0], P[2]), projY(P[0], 0, P[2]));
        for (let i = 3; i < P.length; i += 3) bctx.lineTo(projX(P[i], P[i + 2]), projY(P[i], 0, P[i + 2]));
        bctx.lineWidth = Math.max(4, sh.width * scale * 1.4);
        bctx.strokeStyle = "rgba(0,0,0,0.45)";
        bctx.stroke();
      }
      bctx.beginPath();
      bctx.moveTo(projX(P[0], P[2]), projY(P[0], P[1], P[2]));
      for (let i = 3; i < P.length; i += 3) bctx.lineTo(projX(P[i], P[i + 2]), projY(P[i], P[i + 1], P[i + 2]));
      bctx.lineWidth = Math.max(3, sh.width * scale * 1.4);
      bctx.strokeStyle = st.color;
      bctx.stroke();
    }
  }

  // Elevated Metro Rail viaduct (drawn at height wy = 7.6).
  for (const sh of SHAPES) {
    const M = sh.metroPts;
    if (!M.length) continue;
    bctx.beginPath();
    bctx.moveTo(projX(M[0], M[1]), projY(M[0], 7.6, M[1]));
    for (let i = 2; i < M.length; i += 2) bctx.lineTo(projX(M[i], M[i + 1]), projY(M[i], 7.6, M[i + 1]));
    bctx.lineWidth = Math.max(2.5, 9 * scale);
    bctx.strokeStyle = "#35e0c2";
    bctx.stroke();
  }

  // 3D Extruded Buildings (base + vertical wall + roof).
  for (const bl of MAP_BLDGS) {
    const sx = projX(bl.x, bl.z), syBase = projY(bl.x, 0, bl.z), syRoof = projY(bl.x, bl.h, bl.z);
    if (sx < -20 || sx > W + 20 || syBase < -20 || syBase > H + 20) continue;
    const w = Math.max(2.5, bl.w * scale * 0.8);
    bctx.fillStyle = "rgba(0,0,0,0.4)";
    bctx.fillRect(sx - w / 2, syRoof, w, syBase - syRoof + w * 0.5);
    bctx.fillStyle = bl.color;
    bctx.fillRect(sx - w / 2, syRoof - w * 0.4, w, w * 0.7);
  }

  // Active Stops, CNG stations, and Police marks.
  const rMark = Math.max(4, 5 * dpr);
  eachMark((kind, x, z) => {
    markIcon(bctx, kind, projX(x, z), projY(x, 0, z), rMark);
  });

  // Live moving traffic vehicles in 3D space.
  eachTraffic((kind, vx, vy, vz) => {
    const sx = projX(vx, vz), sy = projY(vx, vy, vz);
    bctx.fillStyle = kind === "heavy" ? "#ff5252" : kind === "cng" ? "#00e676" : "#ffee58";
    bctx.fillRect(sx - 3 * dpr, sy - 3 * dpr, 6 * dpr, 6 * dpr);
  });

  // Live moving Metro Train carriages on the viaduct.
  eachMetroCar((mx, my, mz) => {
    const sx = projX(mx, mz), sy = projY(mx, my, mz);
    bctx.fillStyle = "#35e0c2";
    bctx.strokeStyle = "#fff";
    bctx.lineWidth = 2;
    bctx.beginPath(); bctx.arc(sx, sy, 5.5 * dpr, 0, Math.PI * 2); bctx.fill(); bctx.stroke();
  });

  // Landmark 3D pins and Bangla labels.
  bctx.font = `700 ${Math.round(12 * dpr)}px "Noto Sans Bengali", sans-serif`;
  bctx.textAlign = "center";
  for (const pin of MAP_PINS) {
    const sx = projX(pin.x, pin.z), sy = projY(pin.x, 12, pin.z), syGround = projY(pin.x, 0, pin.z);
    bctx.strokeStyle = "rgba(255,194,26,0.6)";
    bctx.lineWidth = 1.5;
    bctx.beginPath(); bctx.moveTo(sx, syGround); bctx.lineTo(sx, sy); bctx.stroke();
    bctx.fillStyle = "rgba(15, 22, 18, 0.88)";
    const tw = bctx.measureText(`${pin.icon} ${pin.name}`).width + 12 * dpr;
    bctx.fillRect(sx - tw / 2, sy - 12 * dpr, tw, 20 * dpr);
    bctx.strokeStyle = "#ffc21a";
    bctx.strokeRect(sx - tw / 2, sy - 12 * dpr, tw, 20 * dpr);
    bctx.fillStyle = "#fff";
    bctx.fillText(`${pin.icon} ${pin.name}`, sx, sy + 2 * dpr);
  }

  // Player Bus pulsing 3D beacon.
  const bxScreen = projX(bus.position.x, bus.position.z);
  const byScreen = projY(bus.position.x, bus.position.y + 2, bus.position.z);
  const pulseR = (10 + 5 * Math.sin(game.time * 6)) * dpr;
  bctx.fillStyle = "rgba(255, 194, 26, 0.3)";
  bctx.beginPath(); bctx.arc(bxScreen, byScreen, pulseR, 0, Math.PI * 2); bctx.fill();
  bctx.font = `${Math.round(20 * dpr)}px "Segoe UI Emoji", sans-serif`;
  bctx.fillText("🚌", bxScreen, byScreen);
}

function init4DMapModal() {
  const toggleModal = show => {
    const m = $("mapModal");
    if (!m) return;
    m.hidden = show !== undefined ? !show : !m.hidden;
    if (!m.hidden) drawBig4DMap(timeOfDayInfo(progress(game.prog)));
  };
  if ($("mapWrap")) $("mapWrap").onclick = () => toggleModal(true);
  if ($("open4dMapBtn")) $("open4dMapBtn").onclick = () => toggleModal(true);
  if ($("title4dMapBtn")) $("title4dMapBtn").onclick = () => toggleModal(true);
  if ($("close4dMap")) $("close4dMap").onclick = () => toggleModal(false);
  if ($("mapZoomIn")) $("mapZoomIn").onclick = () => { bigZoom = clamp(bigZoom * 1.3, 0.45, 4.5); drawBig4DMap(timeOfDayInfo(progress(game.prog))); };
  if ($("mapZoomOut")) $("mapZoomOut").onclick = () => { bigZoom = clamp(bigZoom / 1.3, 0.45, 4.5); drawBig4DMap(timeOfDayInfo(progress(game.prog))); };
  if ($("mapResetView")) $("mapResetView").onclick = () => { bigPanX = 0; bigPanZ = 0; bigZoom = 1.0; drawBig4DMap(timeOfDayInfo(progress(game.prog))); };

  addEventListener("keydown", e => {
    if (e.code === "Tab") {
      e.preventDefault();
      toggleModal();
    }
  });

  if (bm) {
    bm.addEventListener("pointerdown", e => { dragging = true; dragX = e.clientX; dragY = e.clientY; bm.setPointerCapture?.(e.pointerId); });
    bm.addEventListener("pointermove", e => {
      if (!dragging) return;
      const scale = (Math.min(bm.clientWidth, bm.clientHeight) / 1450) * bigZoom;
      bigPanX -= (e.clientX - dragX) / Math.max(0.1, scale);
      bigPanZ -= (e.clientY - dragY) / Math.max(0.1, scale * 0.72);
      dragX = e.clientX; dragY = e.clientY;
      drawBig4DMap(timeOfDayInfo(progress(game.prog)));
    });
    for (const ev of ["pointerup", "pointercancel"]) bm.addEventListener(ev, () => { dragging = false; });
    bm.addEventListener("wheel", e => {
      e.preventDefault();
      bigZoom = clamp(bigZoom * (e.deltaY < 0 ? 1.15 : 0.87), 0.45, 4.5);
      drawBig4DMap(timeOfDayInfo(progress(game.prog)));
    }, { passive: false });
  }
}
init4DMapModal();

const GLYPH = { l: "↰", r: "↱", u: "↶" };

function updateGps() {
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

  const dest = `${destName()} ${fmtDist(destProgress() - game.prog)} সামনে`;
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
