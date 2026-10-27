// UI words in one place. English comes in a later milestone; for now only Bangla.

export const NAMES = {
  rickshaw: "রিকশা",
  bike: "বাইক",
  cng: "সিএনজি",
  car: "প্রাইভেট কার",
  truck: "ট্রাক",
  bus: "বাস",
  stall: "দোকান",
  pillar: "পিলার",
};

/** Turn 0-9 into Bangla digits (০-৯). */
export function bnNum(n) {
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
};
