# Assets & Licensing (`ASSETS.md`)

All visual, 3D, text, and audio assets in **"Local Bus — Dhaka Route" (`লোকাল বাস — ঢাকা রুট`)** are **100% original and generated procedurally in code**:

| Category | Source / Implementation | License |
| :--- | :--- | :--- |
| **3D Engine** | [Three.js `v0.160.0`](https://threejs.org/) loaded via jsDelivr CDN importmap | MIT License |
| **3D Models (Bus, Vehicles, Landmarks, Metro Rail, Crowd)** | Procedurally built from `THREE.BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `IcosahedronGeometry`, and `CatmullRomCurve3` in `js/bus.js`, `js/vehicles.js`, `js/landmarks.js`, `js/world.js`, and `js/crowd.js` | Original code (Repository License) |
| **2D Textures & Rickshaw Art** | Procedurally drawn at runtime onto HTML5 `<canvas>` (`THREE.CanvasTexture`) in `js/world.js`, `js/vehicles.js`, `js/marks.js`, and `js/bus.js` | Original code (Repository License) |
| **Sound Effects & Engine Audio** | Synthesized in real time using the browser's native `AudioContext` (WebAudio API oscillators, noise buffers, and biquad filters) in `js/audio.js` | Original code (Repository License) |
| **Bangla Dialogue, Headlines, Slogans & Banners** | Original fictional, satirical Bangla writing in `js/data/dialogue.bn.js`, `js/data/headlines.bn.js`, `js/data/shouts.bn.js`, `js/data/slogans.bn.js`, `js/data/banners.bn.js`, and `js/data/ticker.bn.js` | Original work (Repository License) |
| **App Icon** | Custom inline SVG vector (`icons/icon.svg`) | Original work (Repository License) |

No external copyrighted images, 3D models, fonts, or audio files are bundled or copied from any other game.

