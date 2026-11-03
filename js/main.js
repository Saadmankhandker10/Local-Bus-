// Entry point: starts input, runs the game loop, and handles starting, pausing, and ending a run.
import { CFG } from "./config.js";
import { game, resetGame } from "./state.js";
import { on, emit } from "./events.js";
import { renderer, scene, initWorld, resetWorld, updateWorld, setRenderQuality, sun, skyMesh } from "./world.js";
import { initInput, pollInput, onTap, onAnyInput } from "./input.js";
import { resetBus, updateBus, updateAutopilot, updateBusVisual, triggerHelperSlap, recoverToRoad } from "./bus.js";
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
import { ROUTE, TOTAL, STAGE_START } from "./route.js";
import { SHOUTS } from "./data/shouts.bn.js";
import { HEAVY_HIT } from "./i18n.js";
import { pick, clamp, $ } from "./utils.js";
import { updateHud, onStartPressed, onPauseButton, hideScreen, showPause, showRunEnd, crashList } from "./hud.js";
import { initEffects, resetEffects, updateEffects } from "./effects.js";
import { trackEvent } from "./analytics.js";
import { loadBusModel } from "./busModel.js";
import { loadRickshawModel } from "./rickshawModel.js";
import { loadCarModels } from "./carModel.js";
import { loader } from "./loading.js";

// Initialize branded loading screen controller
loader.init();

// Preload the authentic 3D Bangladeshi bus, rickshaw & car models at boot
Promise.allSettled([loadBusModel(), loadRickshawModel(), loadCarModels()]).then(() => {
  loader.setStage(2);
  if (!game.running) {
    resetLandmarks(game.dist);
    updateLandmarks();
  }
});

// Signal that all modules have evaluated and the engine is booting
if (typeof window !== "undefined") {
  window.__localBusBooted = true;
  trackEvent("game_ready");
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
    trackEvent("run_start", { fromCheckpoint, startStage: game.startStage });
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

let isStarting = false;
function triggerStartWithTransition(fromCheckpoint) {
  if (isStarting) return;
  isStarting = true;

  const goBtn = $("go");
  const doorEl = $("doorTransition");
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (goBtn) {
    goBtn.classList.add("punched");
  }

  const runGameStart = () => {
    start(fromCheckpoint);
    isStarting = false;
    if (goBtn) goBtn.classList.remove("punched");
  };

  if (prefersReducedMotion || !doorEl) {
    setTimeout(runGameStart, 180);
    return;
  }

  // 180ms ticket punch animation, then 700ms pneumatic bus door slide-apart (Section 7.2, 9)
  setTimeout(() => {
    doorEl.classList.add("active", "sliding-shut");
    hideScreen();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        doorEl.classList.remove("sliding-shut");
        doorEl.classList.add("sliding-open");
        start(fromCheckpoint);
        setTimeout(() => {
          doorEl.classList.remove("active", "sliding-open");
          isStarting = false;
          if (goBtn) goBtn.classList.remove("punched");
        }, 720);
      });
    });
  }, 180);
}

const startMain = () => triggerStartWithTransition(lastEnd === "fail");
const startFresh = () => triggerStartWithTransition(false);

/** The helper speaks from the door: bubble + subtitle + a slap on the bus side. */
function helperSays(text) {
  say("হেল্পার", text, CFG.shout.seconds, true);
  slap();
  triggerHelperSlap();
}

/** Draw one fresh frame and keep it as a JPEG for the newspaper photo. */
function snapshot() {
  if (skyMesh) skyMesh.position.copy(cam.position);
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
on("mirrorHit", pos => { mirrorSnap(pos); if (Math.random() < 0.4) playKajThikHoyni(pos); });
on("carAlarm", pos => carAlarmSound(pos));
on("rampJump", () => {
  rampFanfare();
  if (navigator.vibrate) navigator.vibrate([40, 30, 60]);
  helperSays("ওস্তাদ! বাস তো রকেট বানায়া ফেলছেন! 🚀");
});
on("copWhistle", () => {
  whistleSound();
  if (navigator.vibrate) navigator.vibrate(50);
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
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 150]);
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

/**
 * Switch the live 3D menu scene to the selected route stage's scenery, sky, and time-of-day.
 * Preloaded with existing pooled meshes for zero hitch.
 * @param {string|number} stageKey
 */
export function setMenuSceneStage(stageKey) {
  if (game.running) return;

  let dist = 0;
  let p = 0.0;
  let stageIdx = 0;

  if (stageKey === "asadgate") {
    dist = 2205;
    p = 0.20;
    stageIdx = 0;
  } else {
    const num = Number(stageKey);
    if (num >= 0 && num < ROUTE.stages.length) {
      stageIdx = num;
      const offsets = [0, 20, 95, 190];
      dist = (STAGE_START[num] || 0) + (offsets[num] || 0);
      const skyPresets = [0.00, 0.28, 0.55, 1.00];
      p = skyPresets[num] !== undefined ? skyPresets[num] : progress(dist);
    } else {
      dist = 0;
      p = 0.00;
      stageIdx = 0;
    }
  }

  game.prog = game.dist = dist;
  journey.stage = stageIdx;
  resetBus(dist);
  resetLandmarks(dist);
  resetWorld();
  resetTraffic(dist);
  resetCamera(false);
  applyTimeOfDay(p);
  updateWorld();
  updateLandmarks();
}

on("startStageChanged", stageKey => setMenuSceneStage(stageKey));

/** Advance the game by exactly one fixed step of dt seconds. */
function step(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * CFG.camera.shakeDecay);
  if (!game.running) {
    // Live idling backdrop behind the title menu!
    updateAutopilot(dt);
    updateWorld();
    updateLandmarks();
    updateTraffic(dt);
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
    updateAudio(game.speed, game.boostT > 0, close, game.running && !game.paused && !game.crashing && !game.caught, cam);

    updateShaders(dt);
    updateEffects(dt);
    applyTimeOfDay(progress(game.prog));
    updateBusVisual(dt);
    updateCrowdVisual(dt);
    updateSpeech(dt);
    const boostFx = updateCamera(dt);
    if (skyMesh) skyMesh.position.copy(cam.position);
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
  loader.setStage(1);
  initEffects(scene);
  loader.setStage(3);
  // Behind the title screen: set up backdrop scene at selected or saved start stop
  const initialStop = $("startPlaceSelect")?.value || game.startStage || 0;
  setMenuSceneStage(initialStop);
} catch (err) {
  console.warn("Initial scene layout warning:", err);
}

try {
  initInput(onPauseInput);
  loader.setStage(4);
  onAnyInput(unlockAudio);
  onTap("horn", doHorn);
  onTap("shout", doShout);
  onTap("mute", doMute);
  onTap("recover", () => recoverToRoad());
  if ($("backToRoadBtn")) {
    $("backToRoadBtn").onclick = () => recoverToRoad();
  }
  if ($("soundbtn")) {
    $("soundbtn").textContent = isMuted() ? "🔇" : "🔊";
    $("soundbtn").onclick = () => { unlockAudio(); doMute(); };
  }
  onPauseButton(() => setPaused(!game.paused));
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });
} catch (err) {
  console.error("Input setup warning:", err);
}

// Check fonts and finalize loading stage
if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
  document.fonts.ready
    .then(() => loader.setStage(5))
    .catch(() => loader.setStage(5));
} else {
  loader.setStage(5);
}
const devUrlParams = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search) : null;
if (devUrlParams && (devUrlParams.get("start") || devUrlParams.get("autostart") || devUrlParams.get("dev") === "freeroam" || devUrlParams.get("freeroam"))) {
  if (devUrlParams.get("dev") === "freeroam" || devUrlParams.get("freeroam") === "1") {
    game.freeRoam = true;
  }
  setTimeout(() => start(false), 250);
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
let menuSlowFrameAcc = 0;

(function loop(now) {
  requestAnimationFrame(loop);

  // Pause rendering when tab is hidden to save GPU & battery (Section 9)
  if (typeof document !== "undefined" && document.hidden) {
    last = now;
    return;
  }

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
  } else if (!game.running && $("setQuality")?.value === "auto" && renderer.getPixelRatio() > 1) {
    // Menu frame-rate protection: if device drops below 30 FPS during menu, reduce pixel ratio
    menuSlowFrameAcc = frameDt > 0.033 ? menuSlowFrameAcc + frameDt : Math.max(0, menuSlowFrameAcc - frameDt * .5);
    if (menuSlowFrameAcc > 2.5) {
      renderer.setPixelRatio(1);
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
