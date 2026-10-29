// Reusable, data-driven procession & demonstration events along the Dhaka route.
// Each event defines its road segment, barrier bounds, traffic jam behavior,
// 3D cast visuals, banners, audio horns, and narrative dialogue.

export const PROCESSION_EVENTS = [
  {
    id: "shahbag-demo",
    name: "শাহবাগ মিছিল",
    subTitle: "ছাত্রদের মিছিল",
    icon: "✊",
    stage: 2,
    segId: "shahbag-approach",
    prefab: "studentDemo",
    mapPinProgFrac: 0.69,

    // Road & Barrier Geography
    fromFrac: 0.14,            // jam slowdown starts here (fraction of segment)
    toFrac: 0.44,              // jam slowdown ends here
    barricadeAt: 0.324,        // fraction of segment where the student barricade stands
    barricadeMinX: -2.2,       // barricade covers x from -2.2 to the right curb (+7.0)
    barricadeMaxX: 7.0,
    barricadeHalfLen: 7.5,     // half-length of the barricade zone along the road
    openCorridor: "left-lane", // far-left lane open (x < -2.2)
    openLaneX: -4.6,
    entryMedianGap: null,
    exitMedianGap: null,
    maxTrafficSpeed: 3.5,      // vehicles inside the jam zone crawl at most this fast
    hornInterval: 2.4,         // seconds between ambient traffic horns in the jam

    // Cast & Visuals
    castType: "students",
    crowdCount: 15,
    bannerColor: { bg: "#b8322a", fg: "#fff8e1" },
    mainBannerText: "অটো পাস চাই!",
    bypassSignText: "◄ বাম লেন খোলা",

    // Dialogue & Messages
    alertMsg: "✊ ছাত্রদের মিছিল — বাম লেন বা কাঁটাবনের গলি ধরেন!",
    dialogueKey: "demoBlock",
  },
  {
    id: "asadgate-michil",
    name: "আসাদ গেট মিছিল",
    subTitle: "নাগরিক ও ব্যবসায়ীদের সমাবেশ",
    icon: "📢",
    stage: 0,
    segId: "asad-gate",
    prefab: "civicMichil",
    mapPinProgFrac: 0.22,

    // Road & Barrier Geography: Left lane (normal path) is FULLY BLOCKED!
    // Player swerves right through an open median gap into the opposite lane,
    // passes the procession, and returns via a post-barricade median gap.
    fromFrac: 0.10,            // jam slowdown starts here
    toFrac: 0.38,              // jam slowdown ends here
    barricadeAt: 0.247,        // barricade stands at s = 184.4 along asad-gate (matches civicMichil 3D prefab)
    barricadeMinX: -7.0,       // blocks entire left lane (from left curb to median island)
    barricadeMaxX: -0.2,       // up to the median divider
    barricadeHalfLen: 8.5,     // half-length of the barrier along the road
    openCorridor: "wrong-way", // must swerve into oncoming/wrong lane (x > +0.5)
    openLaneX: 2.8,
    entryMedianGap: 0.17,      // pre-barrier median gap (near s = 126)
    exitMedianGap: 0.32,       // post-barrier median gap (near s = 238)
    maxTrafficSpeed: 3.0,      // vehicles inside jam crawl at most this fast
    hornInterval: 2.0,         // seconds between ambient traffic horns

    // Cast & Visuals
    castType: "civic",
    crowdCount: 18,
    bannerColor: { bg: "#1565c0", fg: "#fff8e1" },
    mainBannerText: "ফুটপাথ আমাদের, হাঁটতে দিন!",
    bypassSignText: "উল্টা লেনে কাটেন ►",

    // Dialogue & Messages
    alertMsg: "📢 আসাদ গেট মিছিল — বাম লেন বন্ধ, উল্টা লেনে কাটেন!",
    dialogueKey: "asadGateMichil",
  },
];

/** Quick lookup: map of segment ID -> event configuration. */
const EVENT_BY_SEG_ID = new Map(PROCESSION_EVENTS.map(e => [e.segId, e]));

/** Get event config by segment ID. */
export function getProcessionBySegId(segId) {
  return EVENT_BY_SEG_ID.get(segId) || null;
}

/** Get event config by event ID. */
export function getProcessionById(id) {
  return PROCESSION_EVENTS.find(e => e.id === id) || null;
}

