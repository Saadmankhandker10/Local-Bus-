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
