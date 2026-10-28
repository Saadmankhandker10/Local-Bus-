// Everything drawn with HTML on top of the 3D view: numbers, bars, route progress,
// stage cards, messages, and screens.
import { CFG } from "./config.js";
import { $, clamp } from "./utils.js";
import { game } from "./state.js";
import { on } from "./events.js";
import { stats, comboMult, bestScore, bestTime } from "./score.js";
import { crowd } from "./crowd.js";
import { ROUTE, TOTAL } from "./route.js";
import { progress } from "./journey.js";
import { NAMES, bnNum, clock, getLang, setLang, applyLangDOM } from "./i18n.js";
import { showPaper, hidePaper, savePaperImage, copyRunSummary } from "./newspaper.js";
import { TICKER } from "./data/ticker.bn.js";
import { nearestCng } from "./marks.js";
import { renderer } from "./world.js";

let msgT = 0;   // seconds left before the current message disappears
let cardT = 0;  // seconds left before the stage card hides

/** Show a short message in the middle of the screen. */
export function msg(text, ms = 1200) {
  $("msg").textContent = text;
  msgT = ms / 1000;
}


// Restarting a CSS animation needs a reflow in between, or the browser skips it.
function pop(el) {
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

/* ====== Route progress bar & bottom LED news ticker (built once) ====== */
for (const st of ROUTE.stages) {
  const seg = document.createElement("div");
  seg.className = "seg";
  seg.style.flexGrow = st.length;
  seg.textContent = st.name;
  $("ptrack").appendChild(seg);
}
if ($("tickerTrack")) {
  $("tickerTrack").textContent = TICKER.join("   ✦   ") + "   ✦   " + TICKER.join("   ✦   ");
}

/** Refresh the Best Score / Best Time badge on the title screen. */
export function refreshBestBanner() {
  const b = bestScore(), t = bestTime(), el = $("bestBanner");
  if (!el) return;
  if (!b && !t) { el.hidden = true; return; }
  const parts = [];
  if (b) parts.push(`🏆 সেরা স্কোর: ${bnNum(b)}`);
  if (t) parts.push(`⏱ সেরা সময়: ${clock(t)}`);
  el.textContent = parts.join("   ·   ");
  el.hidden = false;
}
refreshBestBanner();
applyLangDOM();

/* ====== Event reactions ====== */
on("crash", e => {
  $("dmgPop").textContent = `${NAMES[e.type]}! +${e.gained}` + (game.combo > 1 ? `  কম্বো x${comboMult()}` : "");
  pop($("dmgPop"));
});
on("chaseStart", () => msg("পাবলিক দৌড়াচ্ছে! পালান! 🏃", 1400));
on("crowdGaveUp", () => msg("পাবলিক হাল ছেড়ে দিল 😅", 1400));
on("refuel", () => msg("সিএনজি ভরা হচ্ছে… ⛽", 900));
on("demoBlocked", () => msg("✊ ছাত্রদের মিছিল — বাম লেন বা কাঁটাবনের গলি ধরেন!", 1800));
on("projectileHit", e => msg(`💥 পাবলিকের ${e.item} লাগছে! ডানে-বামে কাটিয়ে পালান!`, 1100));
on("pedScared", () => msg("🚶 পথচারী পার হচ্ছে — হর্ন (H) দিন!", 1200));

on("stageArrive", t => {
  $("cardTitle").textContent = `ধাপ ${bnNum(t.index + 1)} — ${t.stage.card}`;
  $("cardBody").textContent =
    `নামলেন ${bnNum(t.off)} জন, উঠলেন ${bnNum(t.on)} জন · এই ধাপে ড্যামেজ +${t.damage} · ভাড়া +৳${t.fare} (বকশিশ +৳${bnNum(t.tip || 0)})`;
  $("stagecard").hidden = false;
  pop($("stagecard"));
  cardT = CFG.journey.cardSeconds;
});

/**
 * Copy the current game numbers into the HUD. Called once per frame.
 * @param {number} boostFx 0..1 strength of the boost effect (for speed lines)
 */
export function updateHud(dt, boostFx) {
  $("fare").textContent = "৳" + Math.floor(game.fare);
  $("damage").textContent = Math.floor(game.damage);
  $("combo").textContent = game.combo > 1 ? `x${comboMult()}` : "";
  $("pass").textContent = game.pass;
  $("spd").textContent = Math.round(game.speed * CFG.hud.kmhPerSpeed);
  // The route is scaled so the whole trip reads as the real ~7 km.
  $("dist").textContent = (Math.min(game.prog, TOTAL) / TOTAL * ROUTE.realKm).toFixed(1);
  $("fuelbar").style.width = game.fuel + "%";
  $("fuelbox").classList.toggle("low", game.fuel < CFG.hud.lowFuel);
  const cng = game.running && game.fuel < 68 ? nearestCng() : null;
  if ($("cngHint")) {
    const m = cng ? Math.round(cng.d / TOTAL * ROUTE.realKm * 1000 / 10) * 10 : 0;
    $("cngHint").textContent = cng ? `${cng.side < 0 ? "↖" : "↗"}${bnNum(m)}মি` : "";
  }
  $("hpbar").style.width = game.hp + "%";
  $("hpbox").classList.toggle("low", game.hp < CFG.bus.lowHp);
  $("comfortbar").style.width = game.comfort + "%";
  $("comfortbox").classList.toggle("low", game.comfort < CFG.comfort.lowThreshold);
  $("speedlines").style.opacity = (boostFx * CFG.camera.speedLinesOpacity).toFixed(3);
  $("pbus").style.left = (progress(game.prog) * 100).toFixed(2) + "%";

  // Crowd: a bar that fills as they get closer, plus an orange glow at the bottom edge
  // (the crowd is behind the bus, so the cue is where they come from).
  const chasing = game.running && crowd.active;
  $("crowdbox").hidden = !chasing;
  const close = chasing ? clamp(1 - (crowd.gap - CFG.crowd.catchGap) / (CFG.crowd.cueGap - CFG.crowd.catchGap), 0, 1) : 0;
  $("crowdbar").style.width = (close * 100).toFixed(1) + "%";
  $("crowdcue").style.opacity = close.toFixed(3);

  // Red warning: text + icon (not colour alone) and a soft red glow at the screen edges.
  const warn = game.running && game.warn;
  $("warn").hidden = !warn;
  $("vignette").style.opacity = warn ? (.35 + .25 * Math.sin(game.time * Math.PI * 2 * CFG.warning.pulseHz)).toFixed(3) : "0";
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $("msg").textContent = ""; }
  if (cardT > 0) { cardT -= dt; if (cardT <= 0) $("stagecard").hidden = true; }
}

/** Call fns when the main button (start / from checkpoint) or the "from the start" button is pressed. */
export function onStartPressed(main, fromStart) {
  $("go").onclick = main;
  $("restart").onclick = fromStart;
  $("share").onclick = () => savePaperImage();
  if ($("copyBtn")) {
    $("copyBtn").onclick = async () => {
      const ok = await copyRunSummary();
      msg(ok ? "📋 স্কোর কপি হয়েছে!" : "কপি করা যায়নি", 1400);
    };
  }
}

/* ====== Settings & Info Modals + PWA Install Prompt ====== */
const INFO_PAGES = {
  howto: {
    title: "🎮 কীভাবে খেলবেন (How to Play)",
    body: `<p><b>লক্ষ্য:</b> মোহাম্মদপুর বাসস্ট্যান্ড থেকে ধানমন্ডি, সায়েন্সল্যাব ও শাহবাগ হয়ে ঢাকা বিশ্ববিদ্যালয় (টিএসসি) পর্যন্ত বাস চালিয়ে যান।</p>
      <ul>
        <li><b>ড্যামেজ ও কম্বো:</b> রিকশা, বাইক, সিএনজি, প্রাইভেট কার ও চায়ের দোকানে ধাক্কা দিলে ড্যামেজ পয়েন্ট বাড়ে। ২.৫ সেকেন্ডের মধ্যে পরপর ধাক্কা দিলে কম্বো গুণক (x4 পর্যন্ত) বাড়ে!</li>
        <li><b>ভারী বিপদ:</b> ট্রাক, অন্য বাস বা মেট্রো/ফ্লাইওভারের পিলারে ধাক্কা লাগলে সাথে সাথে খেলা শেষ।</li>
        <li><b>পাবলিক ও ইট-স্যান্ডেল:</b> ধাক্কার পর পাবলিক পেছনে দৌড়াবে এবং ইট-স্যান্ডেল ছুঁড়বে। ডানে-বামে কাটিয়ে পালান অথবা গোলাপি <b>👮 পুলিশ</b> দাগে থেমে কেস ক্লোজ করুন।</li>
        <li><b>তেল, স্টপ ও গলি:</b> হলুদ <b>⛽ সিএনজি</b> দাগে থেমে তেল নিন, নীল <b>বাস স্টপে</b> আস্তে থামলে যাত্রী উঠবে। শাহবাগে ছাত্রদের মিছিল এড়াতে বাম লেন বা <b>কাঁটাবনের গলি</b> ধরুন!</li>
      </ul>`,
  },
  about: {
    title: "🚌 গেম সম্পর্কে (About)",
    body: `<p><b>লোকাল বাস — ঢাকা রুট</b> একটি সম্পূর্ণ ব্রাউজার-ভিত্তিক 3D আর্কেড ও ব্যঙ্গাত্মক ড্রাইভিং গেম।</p>
      <p>এই গেমের প্রতিটি 3D মডেল (বাস, রিকশা, মেট্রোরেল, কার্জন হল, শহীদ মিনার, টিএসসি), রিকশা-আর্ট টেক্সচার এবং সাউন্ড ইফেক্ট কোনো বাহ্যিক ছবি বা অডিও ফাইল ছাড়াই সরাসরি জাভাস্ক্রিপ্ট ও WebAudio কোডে তৈরি।</p>`,
  },
  disclaimer: {
    title: "⚠ সতর্কবার্তা (Disclaimer)",
    body: `<p>এটি সম্পূর্ণ কাল্পনিক ও ব্যঙ্গাত্মক একটি আর্কেড গেম। ঢাকার দৈনন্দিন যানজট ও লোকাল বাসের মজার অভিজ্ঞতাকে কার্টুন আকারে তুলে ধরা হয়েছে।</p>
      <p>গেমটি কোনোভাবেই বাস্তবে বেপরোয়া গাড়ি চালানো, ট্রাফিক আইন ভাঙা বা সহিংসতাকে উৎসাহিত করে না। বাস্তব জীবনে সর্বদা ট্রাফিক নিয়ম মেনে নিরাপদে গাড়ি চালান।</p>`,
  },
  privacy: {
    title: "🔒 গোপনীয়তা নীতি (Privacy)",
    body: `<p>এই গেমটি আপনার কোনো ব্যক্তিগত তথ্য সংগ্রহ বা সার্ভারে প্রেরণ করে না।</p>
      <p>শুধুমাত্র আপনার সর্বোচ্চ স্কোর, সেরা সময় এবং সাউন্ড/গ্রাফিক্স সেটিংস আপনার ব্রাউজারের নিজস্ব <code>localStorage</code>-এ সংরক্ষিত থাকে।</p>`,
  },
};

function initModalsAndPwa() {
  // Respect OS reduced-motion preference by default.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    CFG.camera.shakeScale = 0;
    if ($("setShake")) $("setShake").checked = false;
  }
  if ($("setLang")) {
    $("setLang").value = getLang();
    $("setLang").onchange = e => setLang(e.target.value);
  }
  if ($("setRude")) {
    $("setRude").onchange = e => { CFG.speech.rudeness = Number(e.target.value); };
  }
  if ($("setQuality")) {
    $("setQuality").onchange = e => {
      const v = e.target.value;
      const pr = v === "low" ? 1 : Math.min(devicePixelRatio || 1, CFG.render.maxPixelRatio);
      renderer.setPixelRatio(pr);
    };
  }
  if ($("setShake")) {
    $("setShake").onchange = e => { CFG.camera.shakeScale = e.target.checked ? 1 : 0; };
  }
  if ($("btnFullscreen")) {
    $("btnFullscreen").onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    };
  }
  const openSettings = () => { $("settingsModal").hidden = false; };
  if ($("settingsbtn")) $("settingsbtn").onclick = openSettings;
  if ($("pauseSettings")) $("pauseSettings").onclick = openSettings;
  if ($("closeSettings")) $("closeSettings").onclick = () => { $("settingsModal").hidden = true; };

  for (const btn of document.querySelectorAll("[data-info]")) {
    btn.onclick = () => {
      const page = INFO_PAGES[btn.getAttribute("data-info")];
      if (!page) return;
      $("infoTitle").textContent = page.title;
      $("infoBody").innerHTML = page.body;
      $("infoModal").hidden = false;
    };
  }
  if ($("closeInfo")) $("closeInfo").onclick = () => { $("infoModal").hidden = true; };

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    if ($("installBtn")) $("installBtn").hidden = false;
  });
  if ($("installBtn")) {
    $("installBtn").onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $("installBtn").hidden = true;
    };
  }
}
initModalsAndPwa();

/** Call fn when the on-screen pause or resume button is pressed. */
export function onPauseButton(fn) {
  $("pausebtn").onclick = fn;
  $("resume").onclick = fn;
}

export function hideScreen() {
  hidePaper();
  $("share").hidden = true;
  if ($("copyBtn")) $("copyBtn").hidden = true;
  if ($("ticker")) $("ticker").hidden = true;
  $("screen").style.display = "none";
  $("pausebtn").hidden = false;
  $("msg").textContent = "";
  $("stagecard").hidden = true;
  cardT = 0;
  // Move focus off the start button, or Space (boost) would "click" it again.
  document.activeElement?.blur();
}

/** Show or hide the pause overlay. */
export function showPause(on) {
  $("pause").hidden = !on;
  if (!on) document.activeElement?.blur();
}

/** Hide the HUD extras that should not sit on top of a menu screen. */
function clearOverlays() {
  $("screen").style.display = "flex";
  $("pausebtn").hidden = true;
  $("warn").hidden = true;
  $("crowdbox").hidden = true;
  $("stagecard").hidden = true;
  $("vignette").style.opacity = "0";
  $("crowdcue").style.opacity = "0";
}

/** Crash counts like "রিকশা ২, সিএনজি ১" for the newspaper. */
export function crashList() {
  return Object.entries(stats.crashes).map(([k, n]) => `${NAMES[k]} ${bnNum(n)}`).join(", ");
}

/**
 * Show the end of a run as a newspaper front page.
 * @param {object} run    numbers from the run (see main.js)
 * @param {string} photo  snapshot of the last frame
 * @param {string} checkpointName stage to restart from after a failed run, or ""
 */
export function showRunEnd(run, photo, checkpointName) {
  clearOverlays();
  refreshBestBanner();
  if ($("ticker")) $("ticker").hidden = false;
  $("titleblock").hidden = true;
  showPaper(run, photo);
  $("share").hidden = false;
  if ($("copyBtn")) $("copyBtn").hidden = false;
  if (run.cause === "complete") {
    $("go").textContent = "🎫 আবার যাত্রা";
    $("restart").hidden = true;
  } else {
    const pct = Math.round(CFG.journey.checkpointPenalty * 100);
    $("go").textContent = checkpointName ? `🎫 ${checkpointName} থেকে আবার (স্কোর −${bnNum(pct)}%)` : "🎫 আবার চালান";
    $("restart").hidden = !checkpointName;
  }
}
