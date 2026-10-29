// Where the bus is on the route: current stage, checkpoints, and what the scenery
// should look like at any distance. Emits "stageArrive" and "journeyComplete".
import { CFG } from "./config.js";
import { ROUTE, TOTAL, STAGE_START } from "./route.js";
import { rnd } from "./utils.js";
import { game } from "./state.js";
import { emit } from "./events.js";

const J = CFG.journey;

export const journey = {
  stage: 0,       // index of the stage the bus is in
  done: false,    // reached Dhaka University
  cp: null,       // last checkpoint: { stage, dist, damage, fare, pass, time }
  stageStartDamage: 0, stageStartFare: 0, // for the tally at the next checkpoint
};

/** Index of the stage that contains this distance. */
export function stageAt(dist) {
  let i = 0;
  while (i < STAGE_START.length - 1 && dist >= STAGE_START[i + 1]) i++;
  return i;
}

/** The stage data the bus is in right now. */
export function currentStage() {
  return ROUTE.stages[journey.stage];
}

/** 0 at the start of the journey, 1 at the end. */
export function progress(dist) {
  return Math.min(1, Math.max(0, dist / TOTAL));
}

/** How far into its own stage a distance is (0..1). */
function stageFrac(dist, i) {
  return (dist - STAGE_START[i]) / ROUTE.stages[i].length;
}

/** Are flyover pillars allowed at this distance? */
export function flyoverAllowed(dist) {
  const i = stageAt(dist), f = ROUTE.stages[i].flyover;
  if (!f) return false;
  const p = stageFrac(dist, i);
  return p >= f.from && p <= f.to;
}

/**
 * How buildings should look at a spot: the stage's colours and heights, hidden where
 * a lake or a big landmark needs the space.
 */
export function sceneryAt(dist, side) {
  const i = stageAt(dist), st = ROUTE.stages[i], p = stageFrac(dist, i);
  let hidden = (st.zones || []).some(z => (z.side === undefined || z.side === side) && p >= z.from && p <= z.to);
  // Stage spawn clearance: keep buildings away for 30 units around each stage spawn point
  // so the bus and camera start in a completely clear, wide-open view without clipping!
  if (!hidden) {
    for (let si = 0; si < ROUTE.stages.length; si++) {
      const spawnDist = (STAGE_START[si] || 0) + (SAFE_STAGE_OFFSET[si] || 0);
      if (Math.abs(dist - spawnDist) < 30) { hidden = true; break; }
    }
  }
  if (!hidden) {
    for (const lm of st.landmarks) {
      // Single landmarks on one side keep buildings away (default 25 units) so they can be seen.
      const clear = lm.clear ?? (lm.side ? CFG.journey.landmarkClear : 0);
      if (lm.at === undefined || !clear) continue;
      const at = STAGE_START[i] + lm.at * st.length;
      if ((lm.side === undefined || lm.side === side) && Math.abs(at - dist) < clear) { hidden = true; break; }
    }
  }
  return { colors: st.buildings.colors, minH: st.buildings.minH, maxH: st.buildings.maxH, hidden };
}

let autoRotateIdx = -1;
// Safe straight-boulevard offset past the initial 90-degree entry corner of each stage.
const SAFE_STAGE_OFFSET = [0, 20, 95, 190];

/** Start the journey from the beginning (or selected/rotating Dhaka area), or from the last checkpoint. */
export function resetJourney(fromCheckpoint) {
  const cp = fromCheckpoint ? journey.cp : null;
  journey.done = false;
  if (cp) {
    // Coming back costs a little: a share of the score is lost.
    const keep = 1 - J.checkpointPenalty;
    journey.stage = cp.stage;
    game.dist = game.prog = cp.dist + (SAFE_STAGE_OFFSET[cp.stage] || 0);
    game.damage = Math.floor(cp.damage * keep);
    game.fare = Math.floor(cp.fare * keep);
    game.pass = cp.pass;
    game.journeyT = cp.time;
  } else {
    autoRotateIdx = (autoRotateIdx + 1) % 3;
    const startSt = game.startStage >= 0 ? game.startStage : autoRotateIdx;
    journey.stage = startSt;
    journey.cp = null;
    game.dist = game.prog = (STAGE_START[startSt] || 0) + (SAFE_STAGE_OFFSET[startSt] || 0);
    game.journeyT = 0;
  }
  journey.stageStartDamage = game.damage;
  journey.stageStartFare = game.fare;
}

/** Check for arriving at a new stage or the destination. Call once per step. */
export function updateJourney() {
  if (journey.done) return;
  if (game.prog >= TOTAL - CFG.journey.finishSlack) {
    journey.done = true;
    emit("journeyComplete");
    return;
  }
  const i = stageAt(game.prog);
  if (i === journey.stage) return;
  journey.stage = i;

  // Checkpoint: people get off and on, and we tally this stage (including the comfort tip).
  const off = Math.round(game.pass * J.passengersOffShare);
  const on = Math.min(CFG.fare.maxPassengers - (game.pass - off), Math.round(rnd(J.passengersOnMin, J.passengersOnMax)));
  const tip = Math.round(CFG.comfort.maxStageTip * (game.comfort / CFG.comfort.max));
  game.pass = game.pass - off + on;
  game.fare += on * CFG.fare.perPassenger + tip;
  game.hp = Math.min(CFG.bus.maxHp, game.hp + CFG.bus.stageHpRepair);
  const tally = {
    index: i,
    stage: ROUTE.stages[i],
    off, on, tip,
    damage: Math.floor(game.damage - journey.stageStartDamage),
    fare: Math.floor(game.fare - journey.stageStartFare),
  };
  journey.stageStartDamage = game.damage;
  journey.stageStartFare = game.fare;
  journey.cp = { stage: i, dist: STAGE_START[i], damage: game.damage, fare: game.fare, pass: game.pass, time: game.journeyT };
  emit("stageArrive", tally);
}
