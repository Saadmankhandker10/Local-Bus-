// The journey from Mohammadpur to Dhaka University, as plain data.
// Change names, lengths, traffic, scenery, or landmarks here without touching game code.
//
// Distances are in world units (the bus covers about 30 per second at normal speed).
// The length of each stage comes from the roads drawn in map.js.
// `at`, `from`, `to` inside a stage are fractions of that stage: 0 = start, 1 = end.
// Landmarks: `at` places one, `every` repeats one; no `side` means both sides of the road.
// `clear` keeps the normal buildings away for that many units around a big landmark.

import { STAGE_LENGTHS, ROUTE_LENGTH } from "./map.js";

export const ROUTE = {
  realKm: 7,   // the real trip is about 7 km; the HUD scales the distance to this

  stages: [
    {
      id: "mohammadpur",
      name: "মোহাম্মদপুর",
      nameIn: "মোহাম্মদপুরে", nameOf: "মোহাম্মদপুরের",   // "in X" and "of X" for headlines
      card: "মোহাম্মদপুর বাসস্ট্যান্ড",
      // Traffic: density multiplies how often vehicles appear; mix multiplies each type's chance.
      traffic: { density: 0.85, heavy: 0.8, mix: { rickshaw: 1.3, bus: 1.6, truck: 1.0 } },
      marks: { cng: [450, 650], police: [700, 1000], stops: [250, 400] },
      stalls: 1.4,                        // more tea stalls
      buildings: { colors: [0xd7ccc8, 0xbcaaa4, 0xa1887f, 0xe0c9a6, 0x90a4ae], minH: 8, maxH: 22 },
      landmarks: [
        { prefab: "busStand", at: 0.03, side: -1, clear: 40 },
        { prefab: "wires", every: 70, from: 0, to: 1 },
        { prefab: "teaShop", every: 160, from: 0.05, to: 0.6 },
        { prefab: "mosque", at: 0.38, side: 1, text: "মোহাম্মদপুর জামে মসজিদ", clear: 35 },
        { prefab: "civicMichil", at: 0.80, clear: 24 },
        { prefab: "gateArch", at: 0.82, text: "আসাদগেট" },
      ],
    },
    {
      id: "dhanmondi",
      name: "ধানমন্ডি",
      nameIn: "ধানমন্ডিতে", nameOf: "ধানমন্ডির",
      card: "ধানমন্ডি",
      traffic: { density: 1.0, heavy: 0.9, mix: { rickshaw: 2.2, car: 1.3, bike: 1.2 } },
      marks: { cng: [450, 700], police: [700, 1000], stops: [250, 400] },
      stalls: 0.6,
      buildings: { colors: [0xfff3e0, 0xf8bbd0, 0xc5e1a5, 0xb3e5fc, 0xffe0b2], minH: 10, maxH: 26 },
      // Along the lake there are no buildings on that side.
      zones: [{ type: "lake", side: 1, from: 0.15, to: 0.7 }],
      landmarks: [
        { prefab: "lake", every: 40, from: 0.15, to: 0.7, side: 1 },
        { prefab: "wires", every: 55, from: 0, to: 1 },
        { prefab: "tree", every: 22, from: 0, to: 1, side: -1 },
        { prefab: "tree", every: 22, from: 0.7, to: 1, side: 1 },
        { prefab: "coachingBanner", every: 140, from: 0.05, to: 1 },
        { prefab: "mosque", at: 0.85, side: -1, text: "সোবহানবাগ জামে মসজিদ", clear: 35 },
      ],
    },
    {
      id: "shahbag",
      name: "শাহবাগ",
      nameIn: "শাহবাগে", nameOf: "শাহবাগের",
      card: "সায়েন্সল্যাব — নিউমার্কেট — শাহবাগ",
      traffic: { density: 1.15, heavy: 1.1, mix: { rickshaw: 1.4, cng: 1.3, bus: 1.4 } },
      marks: { cng: [450, 700], police: [600, 900], stops: [220, 350] },
      stalls: 1.6,
      buildings: { colors: [0xffcc80, 0xef9a9a, 0xce93d8, 0x80cbc4, 0xfff59d], minH: 6, maxH: 18 },
      // In the market the shop rows take the place of buildings.
      zones: [{ type: "shops", from: 0, to: 0.6 }],
      landmarks: [
        { prefab: "shopRow", every: 28, from: 0, to: 0.6 },
        { prefab: "wires", every: 55, from: 0, to: 0.8 },
        { prefab: "marketSign", at: 0.12, text: "মার্কেট এলাকা — সাবধানে চলুন" },
        { prefab: "footbridge", at: 0.28, text: "সায়েন্সল্যাব ফুটওভার ব্রিজ" },
        { prefab: "mosque", at: 0.44, side: 1, text: "কাটাবন জামে মসজিদ", clear: 35 },
        { prefab: "footbridge", at: 0.68, text: "ফুটওভার ব্রিজ — পথচারী পারাপার" },
        { prefab: "studentDemo", at: 0.72, clear: 24 },
        { prefab: "museum", at: 0.78, side: 1, clear: 40 },
        { prefab: "library", at: 0.8, side: -1, clear: 40 },
        { prefab: "crossing", at: 0.9, text: "শাহবাগ", clear: 25 },
        { prefab: "flowerStalls", every: 14, from: 0.82, to: 0.97 },
      ],
    },
    {
      id: "du",
      name: "ঢাকা বিশ্ববিদ্যালয়",
      nameIn: "ঢাকা বিশ্ববিদ্যালয়ে", nameOf: "ঢাকা বিশ্ববিদ্যালয়ের",
      card: "ঢাকা বিশ্ববিদ্যালয়",
      traffic: { density: 0.9, heavy: 0.8, mix: { rickshaw: 2.4, bike: 1.3, truck: 0.4 } },
      marks: { cng: [500, 750], police: [700, 1000], stops: [250, 400] },
      stalls: 0.8,
      buildings: { colors: [0xb5543c, 0xa1887f, 0xc0694e, 0xd7ccc8], minH: 6, maxH: 14 },
      landmarks: [
        { prefab: "banyan", every: 45, from: 0, to: 1 },
        { prefab: "curzonHall", at: 0.3, side: -1, clear: 50 },
        { prefab: "shaheedMinar", at: 0.42, side: 1, clear: 55 },
        { prefab: "tsc", at: 0.58, side: 1, clear: 60 },
        { prefab: "monument", at: 0.62, side: -1 },
        { prefab: "mosque", at: 0.78, side: -1, text: "বিশ্ববিদ্যালয় কেন্দ্রীয় মসজিদ", clear: 35 },
        { prefab: "finishBanner", at: 0.985, text: "গন্তব্য: ঢাকা বিশ্ববিদ্যালয়" },
      ],
    },
  ],

  // Time of day along the whole journey (p = 0 at the start, 1 at the end).
  // Rich atmospheric Dhaka presets: Dawn -> Morning -> High Noon -> Golden Sunset -> City Night
  sky: [
    {
      p: 0.00, // Mohammadpur Bus Stand: crisp golden dawn
      skyTop: 0x3b6d9e, skyHor: 0xe8ad84,
      sunCol: 0xffd999, sunI: 2.05,
      hemiSky: 0xfff3e0, hemiGround: 0x6e5848, hemiI: 1.25,
      fogNear: 55, fogFar: 180,
      exposure: 1.24, ground: 0x6d5e4e,
      sunPos: [25, 42, -35]
    },
    {
      p: 0.28, // Dhanmondi / Mirpur Road: clear tropical noon
      skyTop: 0x226bb8, skyHor: 0x86c2e2,
      sunCol: 0xfffaea, sunI: 2.30,
      hemiSky: 0xffffff, hemiGround: 0x586b58, hemiI: 1.30,
      fogNear: 60, fogFar: 190,
      exposure: 1.20, ground: 0x6e6856,
      sunPos: [15, 68, -25]
    },
    {
      p: 0.55, // Science Lab / New Market: golden afternoon
      skyTop: 0x3d6494, skyHor: 0xeb8b52,
      sunCol: 0xffa84d, sunI: 2.10,
      hemiSky: 0xffcca6, hemiGround: 0x563e2e, hemiI: 1.20,
      fogNear: 52, fogFar: 180,
      exposure: 1.22, ground: 0x624e40,
      sunPos: [-35, 34, -35]
    },
    {
      p: 0.80, // Shahbagh / Asad Gate: dramatic crimson sunset
      skyTop: 0x242a54, skyHor: 0xc45645,
      sunCol: 0xff5e3d, sunI: 1.60,
      hemiSky: 0x8e5c6a, hemiGround: 0x3a242d, hemiI: 1.10,
      fogNear: 48, fogFar: 168,
      exposure: 1.25, ground: 0x483a34,
      sunPos: [-55, 18, -30]
    },
    {
      p: 1.00, // Curzon Hall / Dhaka University: atmospheric night with neon/streetlight glow
      skyTop: 0x080d1a, skyHor: 0x1a1f33,
      sunCol: 0x90b0f8, sunI: 0.75,
      hemiSky: 0x283254, hemiGround: 0x161522, hemiI: 0.85,
      fogNear: 42, fogFar: 155,
      exposure: 1.38, ground: 0x262326,
      sunPos: [-20, 42, 10]
    },
  ],
};

/** Total length of the journey in world units. */
ROUTE.stages.forEach((s, i) => { s.length = STAGE_LENGTHS[i]; });

export const TOTAL = ROUTE_LENGTH;

/** Distance where each stage starts. */
export const STAGE_START = ROUTE.stages.map((_, i) => ROUTE.stages.slice(0, i).reduce((a, s) => a + s.length, 0));
