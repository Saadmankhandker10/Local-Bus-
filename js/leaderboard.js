// Online & Offline Weekly Leaderboard System with Friday Midnight BD Reset.
// Manages player's Driver/Ostad name, score submissions, and weekly rankings.
import { bnNum } from "./i18n.js";
import { trackEvent } from "./analytics.js";

const DRIVER_KEY = "localbus.driverName";
const WEEKLY_KEY = "localbus.weeklyLeaderboard";
const DEFAULT_NAME = "কালা ওস্তাদ";

const DEFAULT_WEEKLY_CHAMPS = [
  { name: "ওস্তাদ কালাচাঁদ (মিরপুর এক্সপ্রেস)", stage: "মিরপুর ১০", score: 18450, week: "current" },
  { name: "ওস্তাদ জব্বার (নিরাপদ পরিবহন)", stage: "শাহবাগ মোড়", score: 14200, week: "current" },
  { name: "হেল্পার সুমন (তরঙ্গ প্লাস)", stage: "সায়েন্সল্যাব", score: 11800, week: "current" },
  { name: "ওস্তাদ রফিক (বিহঙ্গ স্পেশাল)", stage: "ফার্মগেট", score: 9650, week: "current" },
  { name: "ওস্তাদ বশির (ঠিকানা পরিবহন)", stage: "আসাদগেট", score: 7400, week: "current" },
  { name: "ওস্তাদ মোখলেস (তুরাগ)", stage: "মোহাম্মদপুর", score: 6250, week: "current" },
  { name: "ড্রাইভার রাসেল (শিকড় পরিবহন)", stage: "ধানমন্ডি ২৭", score: 5300, week: "current" },
  { name: "ওস্তাদ আনোয়ার (স্বাধীন)", stage: "ঢাকা বিশ্ববিদ্যালয়", score: 4800, week: "current" }
];

/** Read the player's saved driver name. */
export function getDriverName() {
  try {
    return localStorage.getItem(DRIVER_KEY) || DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

/** Save a new driver name. */
export function setDriverName(name) {
  const clean = (name || "").trim().slice(0, 24) || DEFAULT_NAME;
  try {
    localStorage.setItem(DRIVER_KEY, clean);
  } catch {}
  return clean;
}

/** Calculate current weekly tournament cycle with Friday midnight BD reset info. */
export function getWeeklyTournamentInfo() {
  const now = new Date();
  // Bangladesh is UTC+6
  const bdNow = new Date(now.getTime() + 6 * 3600 * 1000);
  const day = bdNow.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
  
  // Days until next Friday (day 5)
  let daysUntilFriday = (5 - day + 7) % 7;
  if (daysUntilFriday === 0 && bdNow.getUTCHours() >= 0) {
    daysUntilFriday = 7;
  }

  const nextFriday = new Date(bdNow);
  nextFriday.setUTCDate(bdNow.getUTCDate() + daysUntilFriday);
  nextFriday.setUTCHours(0, 0, 0, 0);

  const diffMs = Math.max(0, nextFriday.getTime() - bdNow.getTime());
  const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
  const daysLeft = Math.floor(hoursLeft / 24);
  const remHours = hoursLeft % 24;

  const countdownText = daysLeft > 0 
    ? `${bnNum(daysLeft)} দিন ${bnNum(remHours)} ঘণ্টা` 
    : `${bnNum(hoursLeft)} ঘণ্টা`;

  // ISO Week ID
  const weekYear = bdNow.getUTCFullYear();
  const firstDay = new Date(Date.UTC(weekYear, 0, 1));
  const weekNum = Math.ceil((((bdNow - firstDay) / 86400000) + 1) / 7);
  const weekId = `${weekYear}-W${weekNum}`;

  return {
    weekId,
    countdownText,
    resetSchedule: "প্রতি শুক্রবার রাত ১২:০০ টায় নতুন সপ্তাহ শুরু হয়"
  };
}

/** Fetch current top 10 weekly leaderboard entries. */
export async function getWeeklyLeaderboard() {
  const info = getWeeklyTournamentInfo();
  let localEntries = [];
  try {
    const raw = localStorage.getItem(WEEKLY_KEY);
    if (raw) localEntries = JSON.parse(raw);
  } catch {
    localEntries = [];
  }

  localEntries = localEntries.filter(e => e.week === info.weekId);

  const combined = [...localEntries, ...DEFAULT_WEEKLY_CHAMPS.map(c => ({ ...c, week: info.weekId }))];
  combined.sort((a, b) => b.score - a.score);

  const unique = [];
  const seen = new Set();
  for (const item of combined) {
    const key = `${item.name}-${item.score}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique.slice(0, 10);
}

/** Submit player's run score to the weekly tournament leaderboard. */
export async function submitScoreToLeaderboard(runScore, stageName) {
  const info = getWeeklyTournamentInfo();
  const name = getDriverName();
  const entry = {
    name: `ওস্তাদ ${name}`,
    stage: stageName || "ঢাকা রুট",
    score: Math.max(100, Math.floor(runScore)),
    week: info.weekId,
    timestamp: Date.now(),
    isYou: true
  };

  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(WEEKLY_KEY) || "[]");
  } catch {
    saved = [];
  }
  saved = saved.filter(e => e.week === info.weekId);
  saved.push(entry);
  saved.sort((a, b) => b.score - a.score);
  try {
    localStorage.setItem(WEEKLY_KEY, JSON.stringify(saved.slice(0, 20)));
  } catch {}

  trackEvent("leaderboard_submit", { driver: name, score: entry.score, week: info.weekId });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    const resp = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (resp.ok) return { success: true, online: true, entry };
  } catch {}

  return { success: true, online: false, entry };
}

/** Handles newsletter / tournament updates subscription. */
export function handleNewsletterSubscribe(email) {
  if (!email || !email.includes("@")) return false;
  let subs = [];
  try {
    subs = JSON.parse(localStorage.getItem("localbus.subscribers") || "[]");
  } catch {
    subs = [];
  }
  if (!subs.includes(email)) {
    subs.push(email);
    try {
      localStorage.setItem("localbus.subscribers", JSON.stringify(subs));
    } catch {}
  }
  trackEvent("email_subscribed", { email });
  fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, timestamp: Date.now() })
  }).catch(() => {});
  return true;
}

