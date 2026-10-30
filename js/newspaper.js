// The fake newspaper front page shown at the end of every run, and its "save as image".
import { CFG } from "./config.js";
import { $, pick } from "./utils.js";
import { PAPER, HEADLINES, STORIES } from "./data/headlines.bn.js";
import { bnNum, bnDate, clock, UI } from "./i18n.js";

const FONT = "'Noto Sans Bengali', 'Nirmala UI', sans-serif";
let current = null; // the last page shown, so "save image" can redraw it
let mediaRec = null, recChunks = [], lastVideoBlob = null;

/** Start recording the 3D canvas stream for the end-of-run video replay button. */
export function startRunVideo(canvas) {
  lastVideoBlob = null;
  recChunks = [];
  if (!canvas?.captureStream || typeof MediaRecorder === "undefined") return;
  try {
    const stream = canvas.captureStream(24);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
    mediaRec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1800000 }) : new MediaRecorder(stream);
    mediaRec.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        recChunks.push(e.data);
        if (recChunks.length > 36) recChunks.shift(); // keep the last ~18 seconds compact
      }
    };
    mediaRec.onstop = () => {
      if (recChunks.length) {
        lastVideoBlob = new Blob(recChunks, { type: mediaRec?.mimeType || "video/webm" });
        if ($("clipBtn")) $("clipBtn").hidden = false;
      }
    };
    mediaRec.start(500);
  } catch {
    mediaRec = null;
  }
}

/** Stop recording at the end of a run so the final seconds + crash are ready to download/share. */
export function stopRunVideo() {
  if (mediaRec && mediaRec.state !== "inactive") {
    try { mediaRec.stop(); } catch {}
  }
}

/** Share or download the recorded WebM video clip of the run. */
export async function saveRunVideo() {
  if (!lastVideoBlob) return false;
  const file = new File([lastVideoBlob], "local-bus-dhaka.webm", { type: lastVideoBlob.type || "video/webm" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: PAPER.name }); return true; } catch {}
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(lastVideoBlob);
  a.download = "local-bus-dhaka.webm";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

/** Funny Bangladeshi real-world equivalents for the run's total damage ("এই টাকায় হতো..."). */
function priceEquivalents(damageUnits) {
  const taka = Math.max(100, damageUnits * 10);
  const kacchi = Math.max(1, Math.round(taka / 320));
  const cha = Math.max(4, Math.round(taka / 20));
  const pillow = (taka / 27000).toFixed(2);
  const committee = Math.max(1, Math.round(taka / 1500));
  return [
    `🍛 কাচ্চি বিরিয়ানি (হাফ): ${bnNum(kacchi)} প্লেট`,
    `☕ টংয়ের মালাই চা ও সিঙ্গারা: ${bnNum(cha)} সেট`,
    `🛏 মেগা প্রকল্পের বালিশ: ${bnNum(pillow)}টি`,
    `📋 যানজট তদন্ত কমিটির সমুচা-নাস্তা: ${bnNum(committee)} বার`,
  ];
}

const STAMPS = {
  complete: { text: "ট্রিপ সফল ✓", color: "#1f6b3a" },
  caught:   { text: "পাবলিক ঘেরাও!", color: "#b8322a" },
  fuel:     { text: "তেল শেষ!", color: "#b8322a" },
  hp:       { text: "কাঁচ চুরমার!", color: "#b8322a" },
  default:  { text: "কেস পেন্ডিং!", color: "#b8322a" },
};

function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|Messenger|Line\/|MicroMessenger/i.test(ua);
}

/** Put the run's numbers into a template like "{stage}-এ {crashes}টি ধাক্কা". */
function fill(text, run) {
  return text
    .replaceAll("{stageIn}", run.stageIn)
    .replaceAll("{stageOf}", run.stageOf)
    .replaceAll("{stage}", run.stage)
    .replaceAll("{damage}", bnNum(run.damage))
    .replaceAll("{combo}", bnNum(run.combo))
    .replaceAll("{km}", bnNum(run.km))
    .replaceAll("{time}", clock(run.time))
    .replaceAll("{crashes}", bnNum(run.crashes))
    .replaceAll("{fines}", bnNum(run.fines));
}

/** Choose a headline and story that fit how the run went. */
function write(run) {
  const P = CFG.paper;
  const specials = [];
  if (run.combo >= P.bigCombo) specials.push(...HEADLINES.bigCombo);
  if (run.damage >= P.highDamage) specials.push(...HEADLINES.highDamage);
  if (run.cause === "complete" && run.crashes === 0) specials.push(...HEADLINES.noCrash);
  if (run.fines > 0) specials.push(...HEADLINES.fines);
  const base = HEADLINES[run.cause] || HEADLINES.general;
  const headline = specials.length && Math.random() < P.specialChance ? pick(specials)
    : Math.random() < P.generalChance ? pick(HEADLINES.general) : pick(base);
  const story = pick(STORIES[run.cause] || STORIES.general);
  return { headline: fill(headline, run), story: fill(story, run) };
}

/** The stats lines printed on the page (same text on screen and in the saved image). */
function statLines(run) {
  return [
    `${UI.score}: ${bnNum(run.score)}${run.isRecord ? "  " + UI.record : ""}`,
    `${UI.damage}: ${bnNum(run.damage)} · ${UI.fare}: ৳${bnNum(run.fare)} · ${UI.combo}: x${bnNum(run.combo)}`,
    `${UI.route}: ${bnNum(run.km)} / ${bnNum(run.totalKm)} ${UI.km} · ${UI.time}: ${clock(run.time)}${run.isBestTime ? "  " + UI.fastest : ""}`,
    `${UI.fines}: ৳${bnNum(run.fines)} · ${UI.best}: ${bnNum(run.best)}`,
    `${UI.crashes}: ${run.crashList || UI.none}`,
  ];
}

/**
 * Fill and show the newspaper.
 * @param {object} run   numbers from the run (see main.js `runReport`)
 * @param {string} photo a JPEG data URL of the last game frame
 */
export function showPaper(run, photo) {
  const text = write(run);
  current = { run, photo, ...text, kicker: `${UI.lastNews}: ${run.why}` };
  $("pname").textContent = PAPER.name;
  $("ptag").textContent = PAPER.tagline;
  $("pdate").textContent = bnDate();
  $("pprice").textContent = PAPER.price;
  $("pkicker").textContent = current.kicker;
  $("phead").textContent = text.headline;
  $("pphoto").src = photo;
  $("pcap").textContent = PAPER.photoCaption;
  $("pstory").textContent = text.story;
  $("pstats").innerHTML = statLines(run).map(l => `<div>${l}</div>`).join("");
  const stamp = STAMPS[run.cause] || STAMPS.default;
  const stEl = $("pstamp");
  if (stEl) {
    stEl.textContent = stamp.text;
    stEl.style.color = stamp.color;
    stEl.style.borderColor = stamp.color;
  }
  const ledEl = $("ledger");
  if (ledEl) {
    ledEl.innerHTML =
      `<div class="lhead">📒 হেল্পারের হিসাবের খাতা</div>` +
      `<div class="lrow"><span>যাত্রী ভাড়া ও বকশিশ</span><b>+৳${bnNum(run.fare)}</b></div>` +
      `<div class="lrow"><span>রাস্তার ড্যামেজ বোনাস (x${bnNum(run.combo)})</span><b>+${bnNum(run.damage)}</b></div>` +
      `<div class="lrow"><span>সার্জেন্টের জরিমানা</span><b>−৳${bnNum(run.fines)}</b></div>` +
      `<div class="lrow ltot"><span>সর্বমোট স্কোর</span><b>${bnNum(run.score)}</b></div>`;
  }
  const pboxEl = $("npPriceBox");
  if (pboxEl) {
    const eqs = priceEquivalents(run.damage);
    pboxEl.innerHTML =
      `<div class="pbox-head">💡 এই ৳${bnNum((run.damage * 10).toLocaleString("en-IN"))} রাস্তার ক্ষতির টাকায় হতো —</div>` +
      eqs.map(line => `<div class="lrow"><span>${line}</span></div>`).join("");
  }
  const npDareEl = $("npDare");
  if (npDareEl) {
    const params = new URLSearchParams(location.search);
    const dareVal = Number(params.get("dare")) || 0;
    const dareAt = params.get("at") || "শাহবাগ";
    if (dareVal > 0) {
      const won = run.damage * 10 >= dareVal;
      npDareEl.textContent = won
        ? `🏆 অভিনন্দন! আপনি বন্ধুর ৳${bnNum(dareVal.toLocaleString("en-IN"))} (${dareAt}) চ্যালেঞ্জ ভেঙে ফেলেছেন!`
        : `🔥 বন্ধুর চ্যালেঞ্জ ছিল ৳${bnNum(dareVal.toLocaleString("en-IN"))} (${dareAt}) — আরেকটু হলেই ভাঙত!`;
      npDareEl.hidden = false;
    } else {
      npDareEl.hidden = true;
    }
  }
  const inappEl = $("inappNote");
  if (inappEl) inappEl.hidden = !isInAppBrowser();
  $("pnote").textContent = PAPER.disclaimer;
  $("paper").hidden = false;
}

/** Copy a short Bangla summary of the run to the clipboard for easy sharing. */
export async function copyRunSummary() {
  if (!current) return false;
  const { run, headline } = current;
  const summary =
    `🚌 লোকাল বাস — ঢাকা রুট\n` +
    `📰 "${headline}"\n` +
    `🏆 স্কোর: ${bnNum(run.score)} (ড্যামেজ ${bnNum(run.damage)}, ভাড়া ৳${bnNum(run.fare)}, সেরা কম্বো x${bnNum(run.combo)})\n` +
    `📍 পথ: ${bnNum(run.km)}/${bnNum(run.totalKm)} কিমি (${run.stage})\n` +
    `${location.href}`;
  try {
    await navigator.clipboard.writeText(summary);
    return true;
  } catch {
    return false;
  }
}

export function hidePaper() {
  $("paper").hidden = true;
}

/** Copy a challenge link (?dare=...&at=...) so friends can try to beat this run's damage! */
export async function copyDareLink() {
  if (!current) return false;
  const { run } = current;
  const taka = Math.max(100, run.damage * 10);
  const url = new URL(location.href);
  url.searchParams.set("dare", String(taka));
  url.searchParams.set("at", run.stage);
  const text = `🔥 আমি "${run.stage}" এলাকায় লোকাল বাস চালিয়ে ৳${bnNum(taka.toLocaleString("en-IN"))} রাস্তার ড্যামেজ করেছি! আমার রেকর্ড ভাঙতে পারবেন? 👇\n${url.toString()}`;
  if (navigator.share) {
    try { await navigator.share({ title: PAPER.name, text, url: url.toString() }); return true; } catch {}
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Draw text that wraps at word boundaries. @returns {number} y after the last line */
function wrap(g, text, x, y, maxW, lineH) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? line + " " + word : word;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = word; y += lineH; }
    else line = test;
  }
  if (line) { g.fillText(line, x, y); y += lineH; }
  return y;
}

/** Render the page into a PNG and share it (phones) or download it (computers). */
export async function savePaperImage() {
  if (!current) return;
  const { run, photo, headline, story, kicker } = current;
  // Draw on a tall sheet first, then cut it to the height the text really needs.
  const W = 1080, H = 2400, M = 70;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#f3ead7"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1a1a1a"; g.textAlign = "center"; g.textBaseline = "top";

  g.font = `800 96px ${FONT}`; g.fillText(PAPER.name, W / 2, 50);
  g.font = `28px ${FONT}`; g.fillText(PAPER.tagline, W / 2, 165);
  g.fillRect(M, 215, W - 2 * M, 4);
  g.textAlign = "left"; g.fillText(bnDate(), M, 230);
  g.textAlign = "right"; g.fillText(PAPER.price, W - M, 230);
  g.fillRect(M, 275, W - 2 * M, 2);

  g.textAlign = "left";
  g.fillStyle = "#b71c1c"; g.font = `700 34px ${FONT}`; g.fillText(kicker, M, 300);
  g.fillStyle = "#1a1a1a"; g.font = `800 62px ${FONT}`;
  let y = wrap(g, headline, M, 350, W - 2 * M, 78) + 10;

  const img = new Image();
  img.src = photo;
  await img.decode();
  // The photo is cropped to a wide 16:9 strip so the page never gets too tall.
  const pw = W - 2 * M, ph = Math.round(pw * 9 / 16);
  const sh = Math.min(img.height, img.width * 9 / 16);
  g.drawImage(img, 0, (img.height - sh) / 2, img.width, sh, M, y, pw, ph);
  y += ph + 8;
  g.font = `italic 24px ${FONT}`; g.fillText(PAPER.photoCaption, M, y); y += 50;

  g.font = `32px ${FONT}`; y = wrap(g, story, M, y, W - 2 * M, 46) + 16;
  g.fillRect(M, y, W - 2 * M, 2); y += 18;
  g.font = `600 30px ${FONT}`;
  for (const l of statLines(run)) y = wrap(g, l, M, y, W - 2 * M, 42);

  // Draw the "এই টাকায় হতো..." box on the exported PNG image too.
  y += 14;
  g.fillStyle = "#4a148c"; g.font = `700 28px ${FONT}`;
  y = wrap(g, `💡 এই ৳${bnNum((run.damage * 10).toLocaleString("en-IN"))} ক্ষতির টাকায় হতো:`, M, y, W - 2 * M, 38);
  g.fillStyle = "#222"; g.font = `600 25px ${FONT}`;
  for (const eq of priceEquivalents(run.damage)) {
    y = wrap(g, "  • " + eq, M, y, W - 2 * M, 35);
  }

  // Diagonal rubber stamp on the exported newspaper PNG.
  const stamp = STAMPS[run.cause] || STAMPS.default;
  g.save();
  g.translate(W - 220, 320);
  g.rotate(-0.18);
  g.strokeStyle = stamp.color; g.lineWidth = 6;
  g.strokeRect(-150, -42, 300, 84);
  g.fillStyle = stamp.color; g.font = `800 36px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(stamp.text, 0, 0);
  g.restore();

  g.font = `22px ${FONT}`; g.fillStyle = "#555"; g.textAlign = "center";
  y += 30;
  g.fillText(PAPER.disclaimer, W / 2, y);
  y += 60;

  const out = document.createElement("canvas");
  out.width = W; out.height = Math.min(H, y);
  out.getContext("2d").drawImage(c, 0, 0);

  const blob = await new Promise(r => out.toBlob(r, "image/png"));
  const file = new File([blob], "jamvarta.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: PAPER.name }); return; } catch { /* cancelled: fall back to download */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "jamvarta.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
