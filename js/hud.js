// Everything drawn with HTML on top of the 3D view: numbers, bars, route progress,
// stage cards, messages, and screens.
import * as THREE from "three";
import { CFG } from "./config.js";
import { $, clamp } from "./utils.js";
import { game } from "./state.js";
import { on } from "./events.js";
import { stats, comboMult, bestScore, bestTime, getWantedList, saveWantedEntry } from "./score.js";
import { crowd } from "./crowd.js";
import { ROUTE, TOTAL } from "./route.js";
import { progress } from "./journey.js";
import { NAMES, bnNum, clock, getLang, setLang, applyLangDOM } from "./i18n.js";
import { showPaper, hidePaper, savePaperImage, copyRunSummary, saveRunVideo, copyDareLink } from "./newspaper.js";
import { TICKER } from "./data/ticker.bn.js";
import { nearestCng } from "./marks.js";
import { renderer } from "./world.js";
import { cam } from "./camera.js";

let msgT = 0;   // seconds left before the current message disappears
let cardT = 0;  // seconds left before the stage card hides
let memeT = 0;  // seconds left before the airborne ramp meme banner hides
const projVec = new THREE.Vector3();

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

/** Refresh the "মোস্ট ওয়ান্টেড" leaderboard and the friend-challenge banner on the title screen. */
export function refreshWantedAndDare() {
  const wl = $("wantedList");
  if (wl) {
    const list = getWantedList();
    wl.innerHTML = list.map((it, idx) =>
      `<div class="wrow${it.isYou ? " you" : ""}">` +
      `<span>#${bnNum(idx + 1)} ${it.name} <small>(${it.stage})</small></span>` +
      `<b>৳${bnNum(it.score.toLocaleString("en-IN"))}</b></div>`
    ).join("");
  }
  const db = $("dareBanner");
  if (db) {
    const params = new URLSearchParams(location.search);
    const dareVal = Number(params.get("dare")) || 0;
    const dareAt = params.get("at") || "শাহবাগ";
    if (dareVal > 0) {
      db.textContent = `🔥 এক বন্ধু "${dareAt}" এলাকায় ৳${bnNum(dareVal.toLocaleString("en-IN"))} রাস্তার ড্যামেজ করে চ্যালেঞ্জ দিয়েছে! ভাঙতে পারবেন?`;
      db.hidden = false;
    } else {
      db.hidden = true;
    }
  }
}

refreshBestBanner();
refreshWantedAndDare();
applyLangDOM();

const CRASH_TICKER = {
  bike: "ধাক্কায় মোটরসাইকেল উল্টে গেল, আরোহী এখন পেছনে দৌড়ে",
  rickshaw: "রিকশায় লোকাল বাসের ধাক্কা, হেল্পার বললেন 'সামনে খালি ছিল'",
  cng: "সিএনজি অটোরিকশায় ঠোকাঠুকি, চালকের সাথে তুমুল তর্ক",
  car: "প্রাইভেট কারে আচমকা ঘষা, হর্ন বাজিয়ে ছুটছে লোকাল বাস",
  vip: "ভিআইপি কালো গাড়িতে লোকাল বাসের ধাক্কা! হেল্পার বললেন 'স্যার ব্রেক ধরছিল না'",
  policeCar: "টহল পুলিশের গাড়িতে লোকাল বাসের ধাক্কা, ওয়াকিটকিতে তোলপাড়!",
  stall: "রাস্তার পাশের দোকানে বাসের ধাক্কা, চায়ের কাপ ও সিঙ্গারা আকাশে",
  trench: "ওয়াসার খোঁড়া গর্তে লোকাল বাসের চাকা, যাত্রীরা শূন্যে লাফালেন!",
  ramp: "কাঠের র‍্যাম্পে চড়ে আকাশে উড়ল লোকাল বাস! প্রত্যক্ষদর্শীরা হতবাক!",
};

/** Spawn a floating +৳ damage number and comic hit-word over the 3D impact point. */
function spawnFloater(e) {
  const wrap = $("floaters");
  if (!wrap) return;
  let sx = innerWidth * 0.5, sy = innerHeight * 0.42;
  if (e.x !== undefined && e.z !== undefined) {
    projVec.set(e.x, e.y || 1.4, e.z).project(cam);
    if (projVec.z < 1) {
      sx = clamp((projVec.x * 0.5 + 0.5) * innerWidth, 80, innerWidth - 80);
      sy = clamp((-projVec.y * 0.5 + 0.5) * innerHeight, 70, innerHeight - 90);
    }
  }
  const div = document.createElement("div");
  div.className = "floater";
  div.style.left = `${sx.toFixed(0)}px`;
  div.style.top = `${sy.toFixed(0)}px`;
  const wwTag = e.wrongWay ? " · উল্টো পথ ×১.৫" : "";
  div.innerHTML = `${e.word || "ধুম!"} +৳${bnNum(e.gained.toLocaleString("en-IN"))}<small>${NAMES[e.type] || ""}${wwTag}</small>`;
  wrap.appendChild(div);
  setTimeout(() => div.remove(), 1050);
}

/* ====== Event reactions ====== */
on("floatDmg", e => {
  spawnFloater(e);
  $("dmgPop").textContent = `${NAMES[e.type] || "ধাক্কা"}! +৳${bnNum(e.gained.toLocaleString("en-IN"))}` + (game.combo > 1 ? `  কম্বো x${bnNum(comboMult())}` : "");
  pop($("dmgPop"));
  const news = CRASH_TICKER[e.type];
  if (news && $("tickerTrack")) {
    $("tickerTrack").textContent = `${news}   ✦   ` + TICKER.join("   ✦   ");
  }
});
on("rampJump", e => {
  if ($("meme")) {
    $("meme").textContent = `🚀 ঠেলায় চড়ে উড়ন্ত লোকাল বাস! +৳${bnNum(((e.gained || 100) * 10).toLocaleString("en-IN"))}`;
    $("meme").hidden = false;
    memeT = 2.2;
  }
});
on("morPass", e => {
  if ($("placeText")) $("placeText").textContent = `সরাসরি · ${e.name}`;
  if (game.running) msg(`📍 ${e.name}`, 1300);
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
  $("fare").textContent = "৳" + bnNum(Math.floor(game.fare));
  $("damage").textContent = "৳" + bnNum(Math.floor(game.damage * 10).toLocaleString("en-IN"));
  $("combo").textContent = game.combo > 1 ? `x${bnNum(comboMult())}` : "";
  $("pass").textContent = bnNum(game.pass);
  $("spd").textContent = bnNum(Math.round(game.speed * CFG.hud.kmhPerSpeed));
  // The route is scaled so the whole trip reads as the real ~7 km.
  $("dist").textContent = bnNum((Math.min(game.prog, TOTAL) / TOTAL * ROUTE.realKm).toFixed(1));
  $("fuelbar").style.width = game.fuel + "%";
  if ($("fuelPct")) $("fuelPct").textContent = bnNum(Math.round(game.fuel)) + "%";
  $("fuelbox").classList.toggle("low", game.fuel < CFG.hud.lowFuel);
  const cng = game.running && game.fuel < 85 ? nearestCng() : null;
  if ($("cngHint")) {
    const m = cng ? Math.round(cng.d / TOTAL * ROUTE.realKm * 1000 / 10) * 10 : 0;
    $("cngHint").textContent = cng ? `▲⛽ সিএনজি ${bnNum(m)} মি সামনে` : "";
  }
  $("hpbar").style.width = game.hp + "%";
  $("hpbox").classList.toggle("low", game.hp < CFG.bus.lowHp);
  $("comfortbar").style.width = game.comfort + "%";
  $("comfortbox").classList.toggle("low", game.comfort < CFG.comfort.lowThreshold);
  $("speedlines").style.opacity = (boostFx * CFG.camera.speedLinesOpacity).toFixed(3);
  $("pbus").style.left = (progress(game.prog) * 100).toFixed(2) + "%";

  // Top-centre red chasing crowd pill ("পাবলিক পিছে! ৬ জন!") + bottom orange glow.
  const chasing = game.running && crowd.active;
  $("crowdbox").hidden = !chasing;
  if (chasing && $("crowdText")) {
    $("crowdText").textContent = `পাবলিক পিছে! ${bnNum(crowd.size)} জন!`;
  }
  const close = chasing ? clamp(1 - (crowd.gap - CFG.crowd.catchGap) / (CFG.crowd.cueGap - CFG.crowd.catchGap), 0, 1) : 0;
  $("crowdbar").style.width = (close * 100).toFixed(1) + "%";
  $("crowdcue").style.opacity = close.toFixed(3);
  if ($("wrongWay")) $("wrongWay").hidden = !(game.running && game.wrongWay);

  // Red warning: text + icon (not colour alone) and a soft red glow at the screen edges.
  const warn = game.running && game.warn;
  $("warn").hidden = !warn;
  $("vignette").style.opacity = warn ? (.35 + .25 * Math.sin(game.time * Math.PI * 2 * CFG.warning.pulseHz)).toFixed(3) : "0";
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $("msg").textContent = ""; }
  if (cardT > 0) { cardT -= dt; if (cardT <= 0) $("stagecard").hidden = true; }
  if (memeT > 0) { memeT -= dt; if (memeT <= 0 && $("meme")) $("meme").hidden = true; }
}

/** Call fns when the main button (start / from checkpoint) or the "from the start" button is pressed. */
export function onStartPressed(main, fromStart) {
  $("go").onclick = main;
  $("restart").onclick = fromStart;
  $("share").onclick = () => savePaperImage();
  if ($("clipBtn")) {
    $("clipBtn").onclick = async () => {
      const ok = await saveRunVideo();
      if (!ok) msg("ভিডিও তৈরির জন্য অন্তত কয়েক সেকেন্ড খেলুন!", 1400);
    };
  }
  if ($("dareBtn")) {
    $("dareBtn").onclick = async () => {
      const ok = await copyDareLink();
      msg(ok ? "🔥 চ্যালেঞ্জ লিংক কপি হয়েছে! বন্ধুকে পাঠান!" : "লিংক কপি করা যায়নি", 1500);
    };
  }
  if ($("copyBtn")) {
    $("copyBtn").onclick = async () => {
      const ok = await copyRunSummary();
      msg(ok ? "📋 স্কোর কপি হয়েছে!" : "কপি করা যায়নি", 1400);
    };
  }
  if ($("startPlaceBtn")) {
    const spots = [
      { idx: 0,  label: "মোহাম্মদপুর বাসস্ট্যান্ড (শুরু থেকে)" },
      { idx: 1,  label: "ধানমন্ডি ২৭ — লেকপাড়" },
      { idx: 2,  label: "সায়েন্সল্যাব — শাহবাগ মোড়" },
      { idx: 3,  label: "ঢাকা বিশ্ববিদ্যালয় — টিএসসি" },
      { idx: -1, label: "অটো রোটেশন (প্রতিবার নতুন এলাকা)" },
    ];
    let cur = 0;
    $("startPlaceBtn").onclick = () => {
      cur = (cur + 1) % spots.length;
      game.startStage = spots[cur].idx;
      $("startPlaceBtn").textContent = `📍 শুরুর এলাকা: ${spots[cur].label}`;
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
  if ($("clipBtn")) $("clipBtn").hidden = true;
  if ($("dareBtn")) $("dareBtn").hidden = true;
  if ($("copyBtn")) $("copyBtn").hidden = true;
  $("screen").style.display = "none";
  $("pausebtn").hidden = false;
  $("msg").textContent = "";
  $("stagecard").hidden = true;
  if ($("meme")) $("meme").hidden = true;
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
  if ($("wrongWay")) $("wrongWay").hidden = true;
  if ($("meme")) $("meme").hidden = true;
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
  saveWantedEntry(run.stage);
  refreshBestBanner();
  refreshWantedAndDare();
  if ($("ticker")) $("ticker").hidden = false;
  $("titleblock").hidden = true;
  showPaper(run, photo);
  $("share").hidden = false;
  if ($("dareBtn")) $("dareBtn").hidden = false;
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
