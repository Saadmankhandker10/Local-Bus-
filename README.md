# লোকাল বাস — ঢাকা রুট (Local Bus: Dhaka Route)

A satirical 3D browser arcade driving game built with **Three.js** and vanilla ES modules. Drive a painted Dhaka local bus from **Mohammadpur Bus Stand** through **Dhanmondi**, **Science Lab / New Market**, and **Shahbagh** to **Dhaka University (TSC)**.

---

## 🚀 How to Run & Edit in VS Code (Live Server)

1. Open this folder in **VS Code**.
2. Install the **Live Server** extension (by Ritwick Dey) if you don't have it yet.
3. Right-click `index.html` and choose **"Open with Live Server"** (or click **Go Live** in the bottom-right status bar).
4. Edit any number in `js/config.js` or any Bangla line in `js/data/*.js` and press `Ctrl+S` — the browser reloads automatically!

---

## 🗂 Where Everything Lives

- `index.html` — Page layout, HUD boxes, newspaper template, Settings/Info modals, and Three.js importmap.
- `css/tokens.css` & `css/style.css` — Dhaka local-bus colour palette, HUD cards, newspaper front page, and mobile touch buttons.
- `js/config.js` — **Every tunable number** (speeds, fuel drain, traffic density, comfort meter, metro rail, camera).
- `js/map.js` & `js/route.js` — Curved Catmull-Rom road network, flyover & side-alley forks (`কলাবাগানের গলি`, `কাঁটাবনের গলি`), stages, and time-of-day sky keyframes.
- `js/bus.js` — Player bus 3D model, rear truck-art slogans, 3D helper at the front door, folding door, staged window cracks, and pooled exhaust puffs.
- `js/traffic.js` & `js/vehicles.js` — Rickshaws, bikes, CNGs, cars, trucks, rival buses, tea stalls, folk-art flyover/metro pillars, crossing pedestrians, and the Shahbagh traffic jam.
- `js/landmarks.js` — Mohammadpur Bus Stand (with morning crows), Dhanmondi Lake, footbridges, elevated Metro Rail stations & moving 4-car train, Shahbagh flower shops, Student Demonstration barricade, Curzon Hall, Shaheed Minar, and TSC.
- `js/crowd.js` — Instanced chasing crowd (`InstancedMesh`) + pooled thrown cartoon items (bricks, helmets, sandals, bottles, tea cups) and `"ঘেরাও"` surround ring.
- `js/audio.js` — 100% WebAudio procedural sounds (engine hum, দুই-নোট হর্ন, door slap, metro pass, glass crack, crash thud, combo chime, boarding bell, refuel tone).
- `js/data/*.bn.js` — All Bangla headlines (`headlines.bn.js`), dialogue (`dialogue.bn.js`), helper shouts (`shouts.bn.js`), rear bus slogans (`slogans.bn.js`), student banners (`banners.bn.js`), and news ticker (`ticker.bn.js`).

---

## ✅ Manual Test Checklist

- [ ] **Start & Dawn Intro:** Click `🎫 যাত্রা শুরু` — camera sweeps around Mohammadpur Bus Stand, crows lift off the shed roof, and the 3D helper slaps the door calling passengers.
- [ ] **Controls & Sound:** Test `W/S/A/D` (or arrows), `Shift/Space` boost (exhaust smoke + speed lines), `H` horn (vehicles move aside & crossing pedestrians jump back to the pavement), `G` helper shout, and `M` mute toggle.
- [ ] **Bus Stops, CNG & Police Marks:** Slow down at a blue Bus Stop (front door opens, bell dings, fare rises), stop on a yellow CNG mark to refuel (check the `↖/↗` distance hint on the fuel box when fuel < 68%), and stop on a pink Police mark to clear a chasing crowd.
- [ ] **Chasing Crowd & Thrown Items:** Bump a rickshaw or tea stall to start a chase; let the crowd get within 34 units to see thrown cartoon bricks/sandals/tea cups, dodge left/right, and watch staged cracks appear on the bus windows (`🚌 বডি` HP bar).
- [ ] **Shahbagh Set Piece (`Stage 3`):** Check the folk-art painted Metro pillars, overhead viaduct, elevated Shahbagh & DU Metro Stations, moving 4-carriage Metro train overhead, flower stalls, and Student Demonstration barricade (either bypass via `কাঁটাবনের গলি` on the left or crawl past the open left lane).
- [ ] **Newspaper End Screen & Ledger:** Finish a run or crash into a heavy hazard — check the `দৈনিক জ্যামবার্তা` front page, diagonal rubber stamp, `📒 হেল্পারের হিসাবের খাতা` ledger, `📰 ছবি সেভ / শেয়ার` PNG export, and `📋 স্কোর কপি`.
- [ ] **Settings (`⚙`):** Open `⚙ সেটিংস` (top-right or inside Pause `P`) and test switching Language (`বাংলা` / `English`), Street Banter level (`0 / 1 / 2`), Graphics quality, and Camera Shake.

