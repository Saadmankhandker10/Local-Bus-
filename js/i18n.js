// UI words and bilingual (Bangla / English) labels in one place.
const LANG_KEY = "localbus.lang";
let lang = localStorage.getItem(LANG_KEY) === "en" ? "en" : "bn";

export function getLang() { return lang; }
export function setLang(next) {
  lang = next === "en" ? "en" : "bn";
  localStorage.setItem(LANG_KEY, lang);
  applyLangDOM();
}

export const NAMES = {
  rickshaw: "রিকশা",
  bike: "বাইক",
  cng: "সিএনজি",
  car: "প্রাইভেট কার",
  vip: "ভিআইপি গাড়ি",
  policeCar: "পুলিশের গাড়ি",
  mirror: "সাইড মিরর",
  ramp: "উড়ন্ত র‍্যাম্প",
  trench: "ওয়াসার গর্ত",
  manhole: "ম্যানহোল",
  truck: "ট্রাক",
  bus: "বাস",
  stall: "দোকান",
  pillar: "পিলার",
};

/** Turn 0-9 into Bangla digits (০-৯) when in Bangla mode. */
export function bnNum(n) {
  if (lang === "en") return String(n);
  return String(n).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
}

/** Game-over titles for heavy crashes. */
export const HEAVY_HIT = {
  truck: "ট্রাকে ধাক্কা!",
  bus: "আরেক বাসে ধাক্কা!",
  pillar: "পিলারে ধাক্কা!",
};

const MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const DAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];

/** Today's date in Bangla, e.g. "মঙ্গলবার, ২৭ অক্টোবর ২০২৬". */
export function bnDate(d = new Date()) {
  if (lang === "en") return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${DAYS[d.getDay()]}, ${bnNum(d.getDate())} ${MONTHS[d.getMonth()]} ${bnNum(d.getFullYear())}`;
}

/** Seconds as m:ss in Bangla digits. */
export function clock(seconds) {
  const s = Math.round(seconds);
  return bnNum(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
}

/** Labels used on the newspaper and the HUD buttons. */
export const UI = {
  score: "স্কোর", damage: "ড্যামেজ", fare: "ভাড়া", combo: "সেরা কম্বো", fines: "জরিমানা",
  route: "পথ", time: "সময়", crashes: "ধাক্কা", none: "একটাও না", best: "সেরা স্কোর", bestTime: "সেরা সময়",
  record: "🏆 নতুন রেকর্ড!", fastest: "⏱ সবচেয়ে দ্রুত!", km: "কিমি", lastNews: "শেষ খবর",
  saveImage: "📰 ছবি সেভ / শেয়ার",
  m: "মি", left: "বামে", right: "ডানে", uTurn: "ইউ-টার্ন",
};

/** Names of the cross-avenues and side streets (keyed by the branch id in map.js), for the GPS and the helper. */
export const ROADS = {
  "mohammadpur-lane": "মোহাম্মদপুর তাজমহল রোড",
  "shyamoli-ring-road": "শ্যামলী — রিং রোড",
  "mirpur-road-north": "ফার্মগেট — মিরপুর ১০ রোড",
  "satmasjid-road": "সাতমসজিদ রোড — জিগাতলা",
  "kalabagan-lane": "কলাবাগান — গ্রিন রোড",
  "newmarket-azimpur": "নিউমার্কেট — আজিমপুর রোড",
  "katabon-lane": "কাঁটাবন — এলিফ্যান্ট রোড",
  "karwan-farmgate": "কারওয়ান বাজার — ফার্মগেট",
  "matsya-motijheel": "মৎস্য ভবন — মতিঝিল রোড",
  "nilkhet-palashi": "নীলক্ষেত — পলাশী মোড়",
};

/** Bilingual HUD and button labels keyed by data-i18n attribute. */
const DOM_STRINGS = {
  bn: {
    lblDamage: "ড্যামেজ", lblFare: "ভাড়া", lblPass: "যাত্রী", lblSpd: "গতি", lblDist: "দূরত্ব",
    lblFuel: "⛽ তেল", lblHp: "🚌 বডি", lblComfort: "😊 স্বস্তি", lblCrowd: "🏃 পাবলিক",
    title: "লোকাল বাস — ঢাকা রুট",
    goStart: "🎫 যাত্রা শুরু", restartBtn: "শুরু থেকে", shareBtn: "📰 ছবি সেভ / শেয়ার", copyBtn: "📋 স্কোর কপি",
    pauseTitle: "বিরতি", resumeBtn: "চালিয়ে যান", settingsTitle: "⚙ সেটিংস",
  },
  en: {
    lblDamage: "Damage", lblFare: "Fare", lblPass: "Pass.", lblSpd: "Speed", lblDist: "Dist.",
    lblFuel: "⛽ Fuel", lblHp: "🚌 Body", lblComfort: "😊 Comfort", lblCrowd: "🏃 Crowd",
    title: "Local Bus — Dhaka Route",
    goStart: "🎫 Start Journey", restartBtn: "From Start", shareBtn: "📰 Save / Share PNG", copyBtn: "📋 Copy Score",
    pauseTitle: "Paused", resumeBtn: "Resume", settingsTitle: "⚙ Settings",
  },
};

export function applyLangDOM() {
  const dict = DOM_STRINGS[lang] || DOM_STRINGS.bn;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const k = el.getAttribute("data-i18n");
    if (dict[k]) el.textContent = dict[k];
  }
}
