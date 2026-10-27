// The journey from Mohammadpur to Dhaka University, as plain data.
// Change names, lengths, traffic, scenery, or landmarks here without touching game code.
//
// Distances are in world units (the bus covers about 30 per second at normal speed).
// `at`, `from`, `to` inside a stage are fractions of that stage: 0 = start, 1 = end.
// Landmarks: `at` places one, `every` repeats one; no `side` means both sides of the road.
// `clear` keeps the normal buildings away for that many units around a big landmark.

export const ROUTE = {
  realKm: 7,   // the real trip is about 7 km; the HUD scales the distance to this

  stages: [
    {
      id: "mohammadpur",
      name: "মোহাম্মদপুর",
      card: "মোহাম্মদপুর বাসস্ট্যান্ড",
      length: 2700,
      // Traffic: density multiplies how often vehicles appear; mix multiplies each type's chance.
      traffic: { density: 0.85, heavy: 0.8, mix: { rickshaw: 1.3, bus: 1.6, truck: 1.0 } },
      marks: { cng: [450, 650], police: [700, 1000], stops: [250, 400] },
      flyover: { from: 0.4, to: 0.9 },   // flyover pillars only on this part of the route
      stalls: 1.4,                        // more tea stalls
      buildings: { colors: [0xd7ccc8, 0xbcaaa4, 0xa1887f, 0xe0c9a6, 0x90a4ae], minH: 8, maxH: 22 },
      landmarks: [
        { prefab: "busStand", at: 0.03, side: -1, clear: 40 },
        { prefab: "wires", every: 70, from: 0, to: 1 },
        { prefab: "teaShop", every: 160, from: 0.05, to: 0.6 },
        { prefab: "gateArch", at: 0.82, text: "আসাদগেট" },
      ],
    },
    {
      id: "dhanmondi",
      name: "ধানমন্ডি",
      card: "ধানমন্ডি",
      length: 2700,
      traffic: { density: 1.0, heavy: 0.9, mix: { rickshaw: 2.2, car: 1.3, bike: 1.2 } },
      marks: { cng: [450, 700], police: [700, 1000], stops: [250, 400] },
      stalls: 0.6,
      buildings: { colors: [0xfff3e0, 0xf8bbd0, 0xc5e1a5, 0xb3e5fc, 0xffe0b2], minH: 10, maxH: 26 },
      // Along the lake there are no buildings on that side.
      zones: [{ type: "lake", side: -1, from: 0.15, to: 0.7 }],
      landmarks: [
        { prefab: "lake", every: 40, from: 0.15, to: 0.7, side: -1 },
        { prefab: "tree", every: 22, from: 0, to: 1, side: 1 },
        { prefab: "tree", every: 22, from: 0.7, to: 1, side: -1 },
        { prefab: "coachingBanner", every: 220, from: 0.05, to: 1 },
      ],
    },
    {
      id: "shahbag",
      name: "শাহবাগ",
      card: "সায়েন্সল্যাব — নিউমার্কেট — শাহবাগ",
      length: 2700,
      traffic: { density: 1.15, heavy: 1.1, mix: { rickshaw: 1.4, cng: 1.3, bus: 1.4 } },
      marks: { cng: [450, 700], police: [600, 900], stops: [220, 350] },
      stalls: 1.6,
      buildings: { colors: [0xffcc80, 0xef9a9a, 0xce93d8, 0x80cbc4, 0xfff59d], minH: 6, maxH: 18 },
      // In the market the shop rows take the place of buildings.
      zones: [{ type: "shops", from: 0, to: 0.6 }],
      landmarks: [
        { prefab: "shopRow", every: 28, from: 0, to: 0.6 },
        { prefab: "marketSign", at: 0.12, text: "মার্কেট এলাকা — সাবধানে চলুন" },
        { prefab: "museum", at: 0.78, side: 1, clear: 40 },
        { prefab: "library", at: 0.8, side: -1, clear: 40 },
        { prefab: "crossing", at: 0.9, text: "শাহবাগ", clear: 25 },
        { prefab: "flowerStalls", every: 14, from: 0.84, to: 0.97 },
      ],
    },
    {
      id: "du",
      name: "ঢাকা বিশ্ববিদ্যালয়",
      card: "ঢাকা বিশ্ববিদ্যালয়",
      length: 2700,
      traffic: { density: 0.9, heavy: 0.8, mix: { rickshaw: 2.4, bike: 1.3, truck: 0.4 } },
      marks: { cng: [500, 750], police: [700, 1000], stops: [250, 400] },
      stalls: 0.8,
      buildings: { colors: [0xb5543c, 0xa1887f, 0xc0694e, 0xd7ccc8], minH: 6, maxH: 14 },
      landmarks: [
        { prefab: "banyan", every: 45, from: 0, to: 1 },
        { prefab: "curzonHall", at: 0.3, side: -1, clear: 50 },
        { prefab: "tsc", at: 0.58, side: 1, clear: 60 },
        { prefab: "monument", at: 0.62, side: -1 },
        { prefab: "finishBanner", at: 0.985, text: "গন্তব্য: ঢাকা বিশ্ববিদ্যালয়" },
      ],
    },
  ],

  // Time of day along the whole journey (p = 0 at the start, 1 at the end).
  // Colours fade smoothly from one key to the next.
  sky: [
    { p: 0.00, sky: 0xdcd6cc, fog: 0xdcd6cc, fogFar: 140, sun: 0xffd9a8, sunI: 0.9, hemiI: 0.9, ground: 0x8d8a7a, sunPos: [40, 15, -30] }, // early morning haze
    { p: 0.22, sky: 0xa9d4f0, fog: 0xbcdcf0, fogFar: 180, sun: 0xfffbe8, sunI: 1.3, hemiI: 1.0, ground: 0x7d8f5a, sunPos: [10, 50, 10] },  // bright late morning
    { p: 0.48, sky: 0xa9d4f0, fog: 0xbcdcf0, fogFar: 180, sun: 0xfffbe8, sunI: 1.3, hemiI: 1.0, ground: 0x8d8a7a, sunPos: [0, 50, 0] },
    { p: 0.62, sky: 0xf4c27c, fog: 0xf0c89a, fogFar: 170, sun: 0xffb35c, sunI: 1.2, hemiI: 0.9, ground: 0x9a8a6a, sunPos: [-40, 18, -20] }, // golden afternoon
    { p: 0.78, sky: 0xc9786a, fog: 0xb8766e, fogFar: 160, sun: 0xff8a5c, sunI: 0.7, hemiI: 0.75, ground: 0x6f7a50, sunPos: [-50, 8, -30] }, // dusk
    { p: 1.00, sky: 0x1f2747, fog: 0x1f2747, fogFar: 150, sun: 0x8899ff, sunI: 0.3, hemiI: 0.5, ground: 0x2e3a28, sunPos: [-20, 30, 10] }, // early night
  ],
};

/** Total length of the journey in world units. */
export const TOTAL = ROUTE.stages.reduce((a, s) => a + s.length, 0);

/** Distance where each stage starts. */
export const STAGE_START = ROUTE.stages.map((_, i) => ROUTE.stages.slice(0, i).reduce((a, s) => a + s.length, 0));
