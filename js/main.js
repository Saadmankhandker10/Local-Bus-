// Entry point: starts input, runs the game loop, and handles starting, pausing, and ending a run.
import { CFG } from "./config.js";
import { game, resetGame } from "./state.js";
import { on, emit } from "./events.js";
import { renderer, scene, initWorld, resetWorld, updateWorld, setRenderQuality, sun } from "./world.js";
import { initInput, pollInput, onTap, onAnyInput } from "./input.js";
import { resetBus, updateBus, updateAutopilot, updateBusVisual, triggerHelperSlap } from "./bus.js";
import { cam, updateCamera, resetCamera } from "./camera.js";
import { resetTraffic, updateTraffic } from "./traffic.js";
import { resetMarks, updateMarks } from "./marks.js";
import { crowd, resetCrowd, updateCrowd, updateCrowdVisual } from "./crowd.js";
import { line, lineFrom, say, updateSpeech, clearSpeech } from "./speech.js";
import { stats, resetScore, saveBest, saveBestTime, totalScore, bestScore } from "./score.js";
import { journey, resetJourney, updateJourney, currentStage, sceneryAt, progress } from "./journey.js";
import { resetLandmarks, updateLandmarks } from "./landmarks.js";
import { resetNav, navStep, drawNav } from "./nav.js";
import { applyTimeOfDay } from "./lighting.js";
import {
  unlockAudio, toggleMute, isMuted, horn, slap, glassHit,
  updateAudio, crashSound, comboSound, boardDing, refuelSound, warnBeep,
  mirrorSnap, carAlarmSound, rampFanfare, whistleSound,
  playMasud, playKhelaHobe, playKajThikHoyni, playKiPagolami, playRagKorla,
  playNoNeed, playRallyCrowd, playStuntYooo, playHelperLaugh
} from "./audio.js";
import { startRunVideo, stopRunVideo } from "./newspaper.js";
import { updateShaders, triggerLoadshedding } from "./shaders.js";
import { ROUTE, TOTAL } from "./route.js";
import { SHOUTS } from "./data/shouts.bn.js";
import { HEAVY_HIT } from "./i18n.js";
import { pick, clamp, $ } from "./utils.js";
import { updateHud, onStartPressed, onPauseButton, hideScreen, showPause, showRunEnd, crashList } from "./hud.js";
import { initEffects, resetEffects, updateEffects } from "./effects.js";

// Signal that all modules have evaluated and the engine is booting
if (typeof window !== "undefined") {
  window.__localBusBooted = true;
}

let endReason = "";   // title of the ending, e.g. "ট্রাকে ধাক্কা!"
let endCause = "";    // what ended it: truck / bus / pillar / caught / fuel / complete
let caughtT = 0;      // seconds left in the "surrounded" moment
let shoutT = 0;       // time of the next crowd shout
let grumbleT = 0;     // earliest time a passenger may grumble again
let prevWarn = false; // tracks when the heavy-hazard warning first turns on
let lastEnd = "";     // "fail" or "complete": decides what the main button does
let hornT = 0, shoutBtnT = 0; // earliest time the next horn / shout may play

/**
 * Start a run from the beginning, or from the last checkpoint after a failed run.
 * @param {boolean} fromCheckpoint
 */
function start(fromCheckpoint) {
  try {
    resetGame();
    resetScore();
    resetJourney(fromCheckpoint && !!journey.cp);
    resetTraffic(game.dist);
    resetMarks(game.dist);
    resetLandmarks(game.prog);
    resetWorld();
    resetEffects();
    resetCrowd();
    resetNav();
    clearSpeech();
    resetBus(game.prog);
    resetCamera(!(fromCheckpoint && !!journey.cp));
    updateWorld();
    updateLandmarks();
    game.running = true;
    game.autopilot = false;
    setPaused(false);
    hideScreen();
    startRunVideo(renderer.domElement);
    const urlParams = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search) : null;
    if (game.startStage === "asadgate" || (urlParams && urlParams.get("start") === "asadgate")) {
      helperSays("ওস্তাদ, সামনে আসাদ গেটে মিছিল! আস্তে!");
    } else {
      helperSays(lineFrom("helperStop", currentStage().id));
    }
  } catch (err) {
    console.error("Game start error:", err);
    hideScreen();
    game.running = true;
  }
}

const startMain = () => start(lastEnd === "fail");
const startFresh = () => start(false);

/** The helper speaks from the door: bubble + subtitle + a slap on the bus side. */
function helperSays(text) {
  say("হেল্পার", text, CFG.shout.seconds, true);
  slap();
  triggerHelperSlap();
}

/** Draw one fresh frame and keep it as a JPEG for the newspaper photo. */
function snapshot() {
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL("image/jpeg", CFG.paper.photoQuality);
}

/** Everything the newspaper needs to know about the run. */
function runReport(isRecord, isBestTime) {
  const light = Object.entries(stats.crashes).filter(([k]) => !HEAVY_HIT[k]).reduce((a, [, n]) => a + n, 0);
  return {
    cause: endCause, why: endReason,
    stage: currentStage().name, stageIn: currentStage().nameIn, stageOf: currentStage().nameOf,
    damage: Math.floor(game.damage), fare: Math.floor(game.fare), combo: stats.bestCombo,
    fines: stats.fines, crashes: light, crashList: crashList(),
    km: (Math.min(game.prog, TOTAL) / TOTAL * ROUTE.realKm).toFixed(1), totalKm: ROUTE.realKm,
    time: game.journeyT, score: totalScore(), best: bestScore(), isRecord, isBestTime,
  };
}

function end(why, cause) {
  game.running = false;
  game.crashing = false;
  lastEnd = "fail";
  endReason = why; endCause = cause;
  stopRunVideo();
  const photo = snapshot();
  showRunEnd(runReport(saveBest(), false), photo, journey.cp ? ROUTE.stages[journey.cp.stage].name : "");
}

function setPaused(on) {
  game.paused = on && game.running;
  showPause(game.paused);
}

/** P / Esc / pause button toggles pause. A gamepad's Start button also starts a new run. */
function onPauseInput(fromPad) {
  if (game.running) setPaused(!game.paused);
  else if (fromPad) startMain();
}

/* ====== Horn, shout, sound ====== */
function doHorn() {
  if (game.time < hornT) return;
  hornT = game.time + CFG.horn.cooldown;
  horn();
  if (game.running) emit("horn");
}

function doShout() {
  if (!game.running || game.time < shoutBtnT) return;
  shoutBtnT = game.time + CFG.shout.cooldown;
  const s = pick(SHOUTS);
  say(s.who, s.text, CFG.shout.seconds, true);
  if (s.who === "হেল্পার") { slap(); triggerHelperSlap(); }
}

function doMute() {
  $("soundbtn").textContent = toggleMute() ? "🔇" : "🔊";
}

// A light crash shakes the camera, buzzes the phone, and drops passenger comfort & bus HP.
on("crash", () => {
  crashSound(false);
  if (game.combo > 1) comboSound(game.combo);
  game.shake = CFG.hit.shake;
  game.hp = Math.max(0, game.hp - CFG.bus.crashHpLoss);
  game.hpHealCooldown = CFG.bus.autoHealDelay;
  game.comfort = Math.max(0, game.comfort - CFG.comfort.crashDrop);
  if (navigator.vibrate) navigator.vibrate(CFG.hit.vibrateMs);
});

// Thrown cartoon projectile from the chasing crowd hits the bus windows.
on("projectileHit", () => {
  if (!game.running || game.crashing || game.caught) return;
  glassHit();
  game.shake = Math.max(game.shake, 0.45);
  game.hp = Math.max(0, game.hp - CFG.bus.projectileHpLoss);
  game.hpHealCooldown = CFG.bus.autoHealDelay;
  game.comfort = Math.max(0, game.comfort - 6);
  say("যাত্রী", lineFrom("projectileHit"));
});

// Shahbagh student demonstration barricade, crossing pedestrians, boarding, refueling, jam horns, mirrors, ramps, and cutscene whistle.
on("processionBlocked", e => {
  const ev = e?.event;
  if (ev?.dialogueKey) helperSays(lineFrom(ev.dialogueKey));
  else helperSays(lineFrom("demoBlock"));
});
on("demoBlocked", () => { helperSays(lineFrom("demoBlock")); playMasud(); });
on("processionPassed", e => {
  playRallyCrowd();
  const ev = e?.event;
  if (ev?.id === "asadgate-michil") {
    helperSays("মিছিল পার হইছে ওস্তাদ! এবার নিজের লেনে ফিরে আসেন!");
  } else {
    helperSays("বাঁচলাম ওস্তাদ, আর একটু হইলে জ্যামে মরতাম!");
  }
});
on("pedScared", () => { helperSays(lineFrom("pedScared")); if (Math.random() < 0.35) playKiPagolami(); });
on("board", () => boardDing());
on("refuel", () => {
  refuelSound();
  triggerLoadshedding(4.5);
});
on("jamHorn", () => horn());
on("mirrorHit", () => { mirrorSnap(); if (Math.random() < 0.4) playKajThikHoyni(); });
on("carAlarm", () => carAlarmSound());
on("rampJump", () => {
  rampFanfare();
  helperSays("ওস্তাদ! বাস তো রকেট বানায়া ফেলছেন! 🚀");
});
on("copWhistle", () => {
  whistleSound();
  say("পুলিশ", "ওই থামেন! গরীব মানুষ, ছাইড়া দেন! গাড়ি থানায় নেন!", 2.4);
});

// A heavy crash: big shake, then a short slow-motion moment before the game-over screen.
on("heavyHit", e => {
  crashSound(true);
  const C = CFG.crash;
  game.crashing = true;
  game.crashT = C.realSeconds * C.slowMo; // counted in (slowed) simulation time
  game.speed *= C.speedKeep;
  game.boostT = 0;
  game.shake = C.shake;
  if (navigator.vibrate) navigator.vibrate(C.vibrateMs);
  endReason = HEAVY_HIT[e.type];
  endCause = e.type;
});

// The crowd reached the bus: it stops, they stand around it, then the game-over screen.
on("caught", () => {
  game.caught = true;
  game.boostT = 0;
  caughtT = CFG.crowd.caughtSeconds;
  say("পাবলিক", line("crowdCaught"));
});

on("crowdGaveUp", () => say("পাবলিক", line("crowdGaveUp")));

// The helper calling the way ahead (turns, forks) from nav.js.
on("helperSay", helperSays);

// New stage: the helper shouts the stop name (the HUD shows the stage card).
on("stageArrive", t => helperSays(lineFrom("helperStop", t.stage.id)));

// Reached Dhaka University.
on("journeyComplete", () => {
  game.running = false;
  lastEnd = "complete";
  endReason = "পৌঁছে গেছি! ঢাকা বিশ্ববিদ্যালয় 🎓";
  endCause = "complete";
  stopRunVideo();
  helperSays(lineFrom("journeyDone"));
  const photo = snapshot();
  const isBestTime = saveBestTime(game.journeyT);
  showRunEnd(runReport(saveBest(), isBestTime), photo, "");
});

/** Advance the game by exactly one fixed step of dt seconds. */
function step(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * CFG.camera.shakeDecay);
  if (!game.running) {
    // Live Autopilot demo behind the title menu!
    if (game.autopilot) {
      updateAutopilot(dt);
      updateWorld();
      updateLandmarks();
      updateTraffic(dt);
    }
    return;
  }
  game.journeyT += dt;

  const d = updateBus(dt);
  // Passengers on board keep paying while the bus moves.
  game.fare += game.pass * game.speed * CFG.fare.travelRate * dt;
  game.dist += d;

  // Passenger comfort / patience: drops on hard braking or crawling in a jam, recovers on smooth driving.
  const C = CFG.comfort;
  if (!game.crashing && !game.caught) {
    const hardBrake = game.accel < C.hardBrakeThreshold;
    const inJam = game.speed < C.jamSpeedMax && !game.onMark && game.pass > 0;
    if (hardBrake) game.comfort = Math.max(0, game.comfort - C.hardBrakeDrain * dt);
    else if (inJam) game.comfort = Math.max(0, game.comfort - C.jamDrain * dt);
    else if (game.speed >= C.recoverMinSpeed) game.comfort = Math.min(C.max, game.comfort + C.recoverRate * dt);

    if ((hardBrake || (inJam && game.comfort < C.lowThreshold)) && game.pass > 0 && game.time > grumbleT) {
      grumbleT = game.time + C.grumbleCooldown;
      say("যাত্রী", lineFrom("passengerGrumble"));
    }
  }

  updateWorld();
  updateLandmarks();
  // Auto health restore: after clean driving without crashes/hits for a few seconds,
  // bus body & window HP smoothly regenerates back to full!
  if (game.hp < CFG.bus.maxHp && !game.crashing && !game.caught) {
    if (game.hpHealCooldown > 0) {
      game.hpHealCooldown -= dt;
    } else {
      game.hp = Math.min(CFG.bus.maxHp, game.hp + CFG.bus.autoHealRate * dt);
    }
  }

  updateJourney();
  if (!game.running) return; // the journey just finished

  updateTraffic(dt);
  updateMarks(dt);
  navStep();
  updateCrowd(dt);

  // The crowd shouts while it is close behind the bus.
  if (crowd.active && !game.caught && crowd.gap < CFG.crowd.cueGap && game.time > shoutT) {
    shoutT = game.time + CFG.speech.crowdShoutEvery;
    say("পাবলিক", line("crowdChase"));
  }

  if (game.crashing) {
    game.crashT -= dt;
    if (game.crashT <= 0) end(endReason, endCause);
  }
  else if (game.caught) {
    caughtT -= dt;
    if (caughtT <= 0) end("পাবলিক ঘিরে ফেলেছে!", "caught");
  }
  else if (game.hp <= 0) {
    end("কাঁচ ভেঙে চুরমার!", "hp");
  }
  // Out of fuel in the open: if a crowd is chasing, they will reach the bus; otherwise it is over.
  else if (game.fuel <= 0 && game.speed < .5 && game.onMark !== "cng" && !crowd.active) end("তেল শেষ!", "fuel");
}

/** Draw one frame. dt is the real time since the last frame (0 while paused). */
function render(dt) {
  try {
    if (game.warn && !prevWarn && game.running) warnBeep();
    prevWarn = game.warn;
    const close = (game.running && crowd.active)
      ? clamp(1 - (crowd.gap - CFG.crowd.catchGap) / (CFG.crowd.cueGap - CFG.crowd.catchGap), 0, 1) : 0;
    updateAudio(game.speed, game.boostT > 0, close, game.running && !game.paused && !game.crashing && !game.caught);

    updateShaders(dt);
    updateEffects(dt);
    applyTimeOfDay(progress(game.prog));
    updateBusVisual(dt);
    updateCrowdVisual(dt);
    updateSpeech(dt);
    const boostFx = updateCamera(dt);
    renderer.render(scene, cam);
    updateHud(dt, boostFx);
    drawNav(dt);
  } catch (err) {
    console.warn("Render loop frame error:", err);
  }
}

// Mark the engine as loaded and bind start buttons immediately
window.__localBusBooted = true;
onStartPressed(startMain, startFresh);
try {
  const savedQ = $("setQuality")?.value || (typeof localStorage !== "undefined" ? localStorage.getItem("lb_quality") : null) || "auto";
  setRenderQuality(savedQ);
} catch {}

try {
  initWorld(sceneryAt);
  initEffects(scene);
  // Behind the title screen: the bus stand at Mohammadpur, early morning.
  resetBus(0);
  resetCamera();
  updateWorld();
  resetLandmarks(0);
  updateLandmarks();
  resetTraffic(0);
} catch (err) {
  console.warn("Initial scene layout warning:", err);
}

try {
  initInput(onPauseInput);
  onAnyInput(unlockAudio);
  onTap("horn", doHorn);
  onTap("shout", doShout);
  onTap("mute", doMute);
  if ($("soundbtn")) {
    $("soundbtn").textContent = isMuted() ? "🔇" : "🔊";
    $("soundbtn").onclick = () => { unlockAudio(); doMute(); };
  }
  onPauseButton(() => setPaused(!game.paused));
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });
} catch (err) {
  console.error("Input setup warning:", err);
}
const devUrlParams = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search) : null;
if (devUrlParams && (devUrlParams.get("start") || devUrlParams.get("autostart"))) {
  setTimeout(() => startFresh(), 150);
}
const isLocalhost = Boolean(
  typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]"
  )
);

if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  if (isLocalhost) {
    // In local development, purge service workers immediately to prevent stale cached shaders
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister());
    }).catch(() => {});
  } else if (location.protocol === "https:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

// Fixed timestep: the game always simulates in equal 1/60 s steps, no matter how fast
// the screen draws, so the bus drives the same on a slow phone and a fast PC.
const STEP = 1 / CFG.loop.hz;
let acc = 0;
let last = performance.now();
let slowFrameAcc = 0;
(function loop(now) {
  requestAnimationFrame(loop);
  // Cap the frame time so a long freeze can't trigger hundreds of catch-up steps.
  const frameDt = Math.min(CFG.loop.maxFrameDt, Math.max(0, now - last) / 1000);
  last = now;
  // Auto-quality watchdog: if a phone struggles below ~28 FPS for 3 s, step down pixel ratio to 1 and disable shadows.
  if (game.running && !game.paused && $("setQuality")?.value === "auto" && (renderer.getPixelRatio() > 1 || renderer.shadowMap.enabled)) {
    slowFrameAcc = frameDt > 0.036 ? slowFrameAcc + frameDt : Math.max(0, slowFrameAcc - frameDt * .5);
    if (slowFrameAcc > 3) {
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      sun.castShadow = false;
    }
  }
  pollInput();
  if (game.paused) acc = 0;
  else {
    // Slow motion simply feeds the simulation less time per real second.
    acc += frameDt * (game.crashing ? CFG.crash.slowMo : 1);
    while (acc >= STEP) { step(STEP); acc -= STEP; }
  }
  render(game.paused ? 0 : frameDt);
})(last);
