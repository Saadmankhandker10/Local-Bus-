// Bangla lines, grouped by situation and rudeness level.
// Level 0 = no insults, 1 = mild Dhaka banter (default), 2 = louder street banter.
// A setting of N uses every line from level 0 up to N.
// Hard limits at every level: no slurs, nothing about religion, ethnicity, gender, region,
// disability, or any group; no sexual content, no threats, no real people or politics.
// Add your own lines anywhere below; the game picks them up automatically.

export const DIALOGUE = {
  // The crowd running after the bus.
  crowdChase: {
    0: [
      "থামেন! থামেন!",
      "ওই বাস, দাঁড়ান!",
      "ড্রাইভার সাহেব, থামেন একটু!",
      "এইটা কী করলেন ভাই!",
      "বাস থামান, কথা আছে!",
      "হায় হায়, আমার দোকান!",
      "আমার রিকশাটা!",
    ],
    1: [
      "ধুর মিয়া!",
      "চোখে দেখেন না?!",
      "পাগল হইছেন নাকি!",
      "গাধা নাকি!",
      "ওই ড্রাইভার, লাইসেন্স আছে?",
      "এই বাসের ব্রেক নাই নাকি?!",
    ],
    2: [
      "আরে ভাই, এইটা বাস না বুলডোজার?!",
      "ওই বেয়াদব ড্রাইভার, থাম!",
      "ঘুমাইয়া চালাস নাকি?!",
      "এই বাস আজকে ছাড়ুম না!",
    ],
  },

  // The moment the crowd surrounds the bus (cartoon, nobody gets hurt).
  crowdCaught: {
    0: [
      "পাইছি! এইবার নামেন!",
      "দাঁড়ান, আগে হিসাব হবে!",
      "সবাই ঘিরা ধরেন, বাস যেন না যায়!",
    ],
    1: [
      "এইবার কই পালাইবেন ওস্তাদ?",
    ],
    2: [],
  },

  // The crowd gives up the chase.
  crowdGaveUp: {
    0: [
      "উফ্‌, আর পারলাম না!",
      "যাক, পরের বার দেখুম!",
      "বাসটা তো উইড়া গেল!",
    ],
    1: [],
    2: [],
  },

  // The traffic sergeant at the pink mark.
  sergeantClosed: {
    0: [
      "ঠিক আছে, এবারের মতো ছাড়লাম!",
      "জরিমানা দিলেন, কেস ক্লোজ!",
      "সাবধানে চালান, বুঝছেন?",
      "রসিদটা রাখেন, যান যান!",
    ],
    1: [],
    2: [],
  },

  // Stopping at the pink mark with nobody chasing you.
  sergeantNothing: {
    0: [
      "সব ঠিক আছে, যান যান!",
      "কাগজপত্র ঠিক আছে? আচ্ছা যান!",
      "এইখানে দাঁড়াইয়া আছেন কেন? সামনে যান!",
    ],
    1: [],
    2: [],
  },

  // The helper calling out the stop when the bus reaches a new stage (keyed by stage id).
  helperStop: {
    mohammadpur: [
      "মোহাম্মদপুর, ধানমন্ডি, শাহবাগ, ঢাকা ভার্সিটি! চলো চলো!",
      "ওস্তাদ, চলো চলো চলো! সিট খালি আছে!",
    ],
    dhanmondi: [
      "ধানমন্ডি ধানমন্ডি, সামনে খালি আছে!",
      "ধানমন্ডি নামবেন? আসেন আসেন, তাড়াতাড়ি!",
      "লেকের পাড়, ধানমন্ডি! নামলে নামেন, উঠলে উঠেন!",
      "ধানমন্ডি সাতাশ, বত্রিশ! আসেন মামা!",
    ],
    shahbag: [
      "শাহবাগ শাহবাগ! শাহবাগ নামবেন, আসেন আসেন!",
      "সায়েন্সল্যাব, নিউমার্কেট, শাহবাগ! খালি খালি!",
      "শাহবাগ মোড়! ফুল নিবেন? নামেন নামেন!",
      "ওস্তাদ রাখো রাখো, শাহবাগের লোক নামবে!",
    ],
    du: [
      "ভার্সিটি ভার্সিটি! টিএসসি, কার্জন হল!",
      "ঢাকা ভার্সিটি! স্টুডেন্টরা নামেন, ক্লাস ধরেন!",
      "টিএসসি টিএসসি! আসেন আসেন!",
    ],
  },

  // Arriving at the end of the line.
  journeyDone: [
    "ধন্যবাদ ওস্তাদ! সবাই (মোটামুটি) ঠিকঠাক পৌঁছাইছে!",
    "লাস্ট স্টপ, ঢাকা ভার্সিটি! সবাই নামেন, বাস যাইব না আর!",
    "বাহ ওস্তাদ, দারুণ চালাইছেন! আজকের ট্রিপ শেষ!",
  ],
};
