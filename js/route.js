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
      flyover: { from: 0.4, to: 0.9 },   // flyover pillars only on this part of the route
      stalls: 1.4,                        // more tea stalls
      buildings: { colors: [0xd7ccc8, 0xbcaaa4, 0xa1887f, 0xe0c9a6, 0x90a4ae], minH: 8, maxH: 22 },
      landmarks: [
        { prefab: "busStand", at: 0.03, side: -1, clear: 40 },
        { prefab: "busStand", segId: "mohammadpur-road", at: 0.18, side: -1, clear: 35 },
        { prefab: "metroStation", at: 0.08, text: "উত্তরা উত্তর" },
        { prefab: "metroStation", at: 0.21, text: "উত্তরা সেন্টার" },
        { prefab: "metroStation", at: 0.34, text: "উত্তরা দক্ষিণ" },
        { prefab: "metroStation", at: 0.47, text: "পল্লবী" },
        { prefab: "metroStation", at: 0.62, text: "মিরপুর ১১" },
        { prefab: "metroStation", at: 0.76, text: "মিরপুর ১০" },
        { prefab: "metroStation", at: 0.90, text: "কাজীপাড়া" },
        { prefab: "wires", every: 70, from: 0, to: 1 },
        { prefab: "teaShop", every: 160, from: 0.05, to: 0.6 },
        { prefab: "gateArch", at: 0.82, text: "আসাদগেট" },
        { prefab: "gateArch", segId: "asadgate-road", at: 0.72, text: "আসাদগেট" },
      ],
    },
    {
      id: "dhanmondi",
      name: "ধানমন্ডি",
      nameIn: "ধানমন্ডিতে", nameOf: "ধানমন্ডির",
      card: "শেওড়াপাড়া — আগারগাঁও — ধানমন্ডি",
      traffic: { density: 1.0, heavy: 0.9, mix: { rickshaw: 2.2, car: 1.3, bike: 1.2 } },
      marks: { cng: [450, 700], police: [700, 1000], stops: [250, 400] },
      stalls: 0.6,
      buildings: { colors: [0xfff3e0, 0xf8bbd0, 0xc5e1a5, 0xb3e5fc, 0xffe0b2], minH: 10, maxH: 26 },
      // Along the lake there are no buildings on that side.
      zones: [{ type: "lake", side: 1, from: 0.15, to: 0.7 }],
      landmarks: [
        { prefab: "metroStation", at: 0.16, text: "শেওড়াপাড়া" },
        { prefab: "metroStation", at: 0.42, text: "আগারগাঁও" },
        { prefab: "metroStation", at: 0.76, text: "বিজয় সরণি" },
        { prefab: "lake", every: 40, from: 0.15, to: 0.7, side: 1 },
        { prefab: "lake", segId: "dhanmondi-lake-road", every: 40, from: 0.15, to: 0.8, side: 1 },
        { prefab: "wires", every: 55, from: 0, to: 1 },
        { prefab: "tree", every: 22, from: 0, to: 1, side: -1 },
        { prefab: "tree", every: 22, from: 0.7, to: 1, side: 1 },
        { prefab: "coachingBanner", every: 140, from: 0.05, to: 1 },
      ],
    },
    {
      id: "shahbag",
      name: "শাহবাগ",
      nameIn: "শাহবাগে", nameOf: "শাহবাগের",
      card: "ফার্মগেট — সায়েন্সল্যাব — শাহবাগ",
      traffic: { density: 1.15, heavy: 1.1, mix: { rickshaw: 1.4, cng: 1.3, bus: 1.4 } },
      marks: { cng: [450, 700], police: [600, 900], stops: [220, 350] },
      stalls: 1.6,
      buildings: { colors: [0xffcc80, 0xef9a9a, 0xce93d8, 0x80cbc4, 0xfff59d], minH: 6, maxH: 18 },
      // In the market the shop rows take the place of buildings.
      zones: [{ type: "shops", from: 0, to: 0.6 }],
      landmarks: [
        { prefab: "metroStation", at: 0.18, text: "ফার্মগেট" },
        { prefab: "metroStation", at: 0.42, text: "কারওয়ান বাজার" },
        { prefab: "shopRow", every: 28, from: 0, to: 0.6 },
        { prefab: "wires", every: 55, from: 0, to: 0.8 },
        { prefab: "marketSign", at: 0.12, text: "মার্কেট এলাকা — সাবধানে চলুন" },
        { prefab: "marketSign", segId: "sciencelab-road", at: 0.22, text: "সায়েন্সল্যাব — নিউমার্কেট এলাকা" },
        { prefab: "footbridge", at: 0.28, text: "সায়েন্সল্যাব ফুটওভার ব্রিজ" },
        { prefab: "footbridge", segId: "sciencelab-road", at: 0.55, text: "নিউমার্কেট ফুটওভার ব্রিজ" },
        { prefab: "footbridge", at: 0.68, text: "ফুটওভার ব্রিজ — পথচারী পারাপার" },
        { prefab: "studentDemo", at: 0.72, clear: 24 },
        { prefab: "museum", at: 0.78, side: 1, clear: 40 },
        { prefab: "library", at: 0.8, side: -1, clear: 40 },
        { prefab: "metroStation", at: 0.86, text: "শাহবাগ" },
        { prefab: "crossing", at: 0.9, text: "শাহবাগ", clear: 25 },
        { prefab: "junctionFlyover", at: 0.95 },
        { prefab: "flowerStalls", every: 14, from: 0.82, to: 0.97 },
      ],
    },
    {
      id: "du",
      name: "ঢাকা বিশ্ববিদ্যালয়",
      nameIn: "ঢাকা বিশ্ববিদ্যালয়ে", nameOf: "ঢাকা বিশ্ববিদ্যালয়ের",
      card: "ঢাকা বিশ্ববিদ্যালয় — সচিবালয় — মতিঝিল",
      traffic: { density: 0.9, heavy: 0.8, mix: { rickshaw: 2.4, bike: 1.3, truck: 0.4 } },
      marks: { cng: [500, 750], police: [700, 1000], stops: [250, 400] },
      stalls: 0.8,
      buildings: { colors: [0xb5543c, 0xa1887f, 0xc0694e, 0xd7ccc8], minH: 6, maxH: 14 },
      landmarks: [
        { prefab: "banyan", every: 45, from: 0, to: 1 },
        { prefab: "curzonHall", at: 0.18, side: -1, clear: 50 },
        { prefab: "shaheedMinar", at: 0.28, side: 1, clear: 55 },
        { prefab: "metroStation", at: 0.36, text: "ঢাকা বিশ্ববিদ্যালয়" },
        { prefab: "tsc", at: 0.44, side: 1, clear: 60 },
        { prefab: "monument", at: 0.48, side: -1 },
        { prefab: "metroStation", at: 0.68, text: "বাংলাদেশ সচিবালয়" },
        { prefab: "metroStation", at: 0.90, text: "মতিঝিল" },
        { prefab: "finishBanner", at: 0.985, text: "গন্তব্য: ঢাকা বিশ্ববিদ্যালয় — মতিঝিল মেট্রো" },
      ],
    },
  ],

  // Time of day along the whole journey (p = 0 at the start, 1 at the end).
  // Warm Dhaka golden-afternoon / sunset boulevard atmosphere fading into dusk.
  sky: [
    { p: 0.00, sky: 0xd99672, fog: 0xe3ab84, fogFar: 175, sun: 0xffc680, sunI: 1.25, hemiI: 0.95, ground: 0x6d5e4e, sunPos: [25, 22, -40] },
    { p: 0.28, sky: 0xe8b282, fog: 0xedc093, fogFar: 185, sun: 0xffd699, sunI: 1.3,  hemiI: 1.0,  ground: 0x6e6452, sunPos: [10, 35, -30] },
    { p: 0.55, sky: 0xd68a6c, fog: 0xde9878, fogFar: 175, sun: 0xffa766, sunI: 1.15, hemiI: 0.9,  ground: 0x635548, sunPos: [-20, 18, -35] },
    { p: 0.80, sky: 0xb56565, fog: 0xbf736b, fogFar: 165, sun: 0xff8052, sunI: 0.85, hemiI: 0.8,  ground: 0x4f443c, sunPos: [-40, 12, -30] },
    { p: 1.00, sky: 0x2c2238, fog: 0x382a42, fogFar: 155, sun: 0x99aaff, sunI: 0.45, hemiI: 0.6,  ground: 0x2e2a28, sunPos: [-20, 28, 10] },
  ],
};

/** Total length of the journey in world units. */
ROUTE.stages.forEach((s, i) => { s.length = STAGE_LENGTHS[i]; });

export const TOTAL = ROUTE_LENGTH;

/** Distance where each stage starts. */
export const STAGE_START = ROUTE.stages.map((_, i) => ROUTE.stages.slice(0, i).reduce((a, s) => a + s.length, 0));
