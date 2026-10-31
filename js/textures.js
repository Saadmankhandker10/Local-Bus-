// Procedural Dhaka urban street and vehicle Canvas textures.
// All textures are generated with pure 2D Canvas math and cached as Three.js textures.
import * as THREE from "three";
import { rnd, pick } from "./utils.js";

/* ====== Grime, Weathering & Noise Helpers ====== */

export function applyNoise(ctx, x, y, w, h, count, maxAlpha = 0.15) {
  for (let i = 0; i < count; i++) {
    const isDark = Math.random() < 0.55;
    ctx.fillStyle = isDark
      ? `rgba(0,0,0,${(Math.random() * maxAlpha).toFixed(3)})`
      : `rgba(255,255,255,${(Math.random() * maxAlpha * 0.55).toFixed(3)})`;
    ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 1 + Math.random() * 1.8, 1 + Math.random() * 1.8);
  }
}

export function applyDrip(ctx, x, y, w, h, maxAlpha = 0.3) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(45,35,25,${maxAlpha})`);
  g.addColorStop(1, "rgba(45,35,25,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

export function applyMudSplash(ctx, w, h, maxAlpha = 0.4) {
  const g = ctx.createLinearGradient(0, h * 0.65, 0, h);
  g.addColorStop(0, "rgba(55,42,30,0)");
  g.addColorStop(1, `rgba(55,42,30,${maxAlpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.65, w, h * 0.35);
}

/* ====== 1. Asphalt Road Texture ====== */

export function createAsphaltTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");

  // Base asphalt hue
  ctx.fillStyle = "#33302c";
  ctx.fillRect(0, 0, 512, 512);

  // Micro stone aggregate
  applyNoise(ctx, 0, 0, 512, 512, 14000, 0.22);

  // Dark bitumen oil spots
  for (let i = 0; i < 7; i++) {
    const px = Math.random() * 420 + 46, py = Math.random() * 420 + 46;
    const rad = Math.random() * 40 + 20;
    const g = ctx.createRadialGradient(px, py, 3, px, py, rad);
    g.addColorStop(0, "rgba(20, 18, 16, 0.6)");
    g.addColorStop(1, "rgba(35, 32, 28, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Branching Dhaka tar cracks
  ctx.strokeStyle = "rgba(16, 14, 12, 0.72)";
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 5; i++) {
    let cx = Math.random() * 460 + 26, cy = Math.random() * 460 + 26;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += (Math.random() - 0.5) * 36;
      cy += (Math.random() - 0.5) * 36;
      ctx.lineTo(cx, cy);
      if (Math.random() < 0.4) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (Math.random() - 0.5) * 22, cy + (Math.random() - 0.5) * 22);
        ctx.moveTo(cx, cy);
      }
    }
    ctx.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 18);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ====== 2. Sidewalk Concrete Paver Tiles ====== */

export function createPaversTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#8a7f72";
  ctx.fillRect(0, 0, 512, 512);

  // Concrete paver block grid with subtle color variations
  const tw = 64, th = 64;
  for (let y = 0; y < 512; y += th) {
    const shift = ((y / th) % 2 === 0) ? 0 : tw / 2;
    for (let x = -tw; x < 512 + tw; x += tw) {
      const rx = x + shift;
      const shade = Math.floor((Math.random() - 0.5) * 28);
      ctx.fillStyle = `rgb(${142 + shade}, ${132 + shade}, ${118 + shade})`;
      ctx.fillRect(rx + 2, y + 2, tw - 4, th - 4);
      // Subtle 3D concrete bevel
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(rx + 2, y + 2, tw - 4, 3);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(rx + 2, y + th - 5, tw - 4, 3);
    }
  }

  // Mortar groove lines
  ctx.strokeStyle = "rgba(42,34,26,0.65)";
  ctx.lineWidth = 3;
  for (let y = 0; y <= 512; y += th) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
  }

  applyNoise(ctx, 0, 0, 512, 512, 10000, 0.18);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 22);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ====== 3. 5 Dhaka Architectural Facades with Night-Lit Emissive Windows ====== */

export function createBuildingMaterials() {
  const mats = [];

  // 5 Distinct Architectural Styles
  const configs = [
    // 0: Modern Mirpur/Dhanmondi Commercial Glass Tower (Cool Slate Blue)
    {
      name: "commercial_glass",
      wall: "#607d8b",
      trim: "#455a64",
      floors: 8,
      style: "glass_grid",
      litWindows: ["#ffe082", "#b3e5fc", "#fff8e1"],
    },
    // 1: Old Dhaka Brick & Stucco Residential (Warm Terracotta Brick)
    {
      name: "old_dhaka_brick",
      wall: "#a15d48",
      trim: "#7c3826",
      floors: 6,
      style: "arched_brick",
      litWindows: ["#ffd54f", "#ffca28", "#ffe082"],
    },
    // 2: Dhaka Shopping Complex / Market Building (Ochre / Beige)
    {
      name: "dhaka_market",
      wall: "#b8976c",
      trim: "#8d6e45",
      floors: 5,
      style: "shopping_complex",
      litWindows: ["#fff59d", "#ffecb3", "#ffe082"],
    },
    // 3: Residential Apartment with Balconies & Verandas (Warm Clay)
    {
      name: "residential_balcony",
      wall: "#9e7960",
      trim: "#6e4f3a",
      floors: 7,
      style: "balcony_apartment",
      litWindows: ["#ffe082", "#ffb74d", "#fff9c4"],
    },
    // 4: Medical / Diagnostic Centre with Tiled Facade (Teal & Cream)
    {
      name: "clinic_diagnostic",
      wall: "#80cbc4",
      trim: "#00796b",
      floors: 6,
      style: "clinic_tile",
      litWindows: ["#e0f7fa", "#fffde7", "#b2ebf2"],
    },
  ];

  for (const cfg of configs) {
    const W = 256, H = 512;
    // Diffuse Canvas
    const diff = document.createElement("canvas");
    diff.width = W; diff.height = H;
    const g = diff.getContext("2d");

    // Emissive Canvas (pure black everywhere except lit windows!)
    const emis = document.createElement("canvas");
    emis.width = W; emis.height = H;
    const eg = emis.getContext("2d");
    eg.fillStyle = "#000000";
    eg.fillRect(0, 0, W, H);

    // Paint main facade
    g.fillStyle = cfg.wall;
    g.fillRect(0, 0, W, H);

    const fh = Math.floor(430 / cfg.floors);

    for (let f = 0; f < cfg.floors; f++) {
      const y = 14 + f * fh;

      // Floor slab / cornice
      g.fillStyle = cfg.trim;
      g.fillRect(0, y + fh - 5, W, 5);
      applyDrip(g, 0, y + fh, W, 12, 0.25);

      if (cfg.style === "glass_grid") {
        // Wide modern glass curtain bays
        for (let col = 0; col < 3; col++) {
          const x = 16 + col * 76;
          const isLit = (f * 5 + col * 11) % 3 !== 0;
          const winColor = isLit ? pick(cfg.litWindows) : "#202830";
          g.fillStyle = winColor;
          g.fillRect(x, y + 6, 68, fh - 16);

          // Aluminum mullion lines
          g.fillStyle = "rgba(30,40,50,0.55)";
          g.fillRect(x + 33, y + 6, 2, fh - 16);

          if (isLit) {
            eg.fillStyle = winColor;
            eg.fillRect(x, y + 6, 68, fh - 16);
          }
        }
      } else if (cfg.style === "arched_brick") {
        // Traditional brick with arched lintels
        for (let col = 0; col < 4; col++) {
          const x = 14 + col * 60;
          const isLit = (f * 3 + col * 7) % 2 === 0;
          const winColor = isLit ? pick(cfg.litWindows) : "#241812";

          // Arch top
          g.fillStyle = cfg.trim;
          g.beginPath();
          g.arc(x + 22, y + 14, 18, Math.PI, 0);
          g.fill();

          g.fillStyle = winColor;
          g.fillRect(x + 4, y + 14, 36, fh - 24);

          if (isLit) {
            eg.fillStyle = winColor;
            eg.fillRect(x + 4, y + 14, 36, fh - 24);
          }
          // Clothesline / grill
          g.strokeStyle = "rgba(20,15,10,0.5)";
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + 2, y + fh - 14);
          g.lineTo(x + 42, y + fh - 14);
          g.stroke();
        }
      } else if (cfg.style === "balcony_apartment") {
        // Deep balconies with wrought iron railings
        for (let col = 0; col < 3; col++) {
          const x = 18 + col * 76;
          const isLit = (f * 7 + col * 9) % 3 !== 1;
          const winColor = isLit ? pick(cfg.litWindows) : "#1c1815";

          g.fillStyle = winColor;
          g.fillRect(x + 6, y + 6, 56, fh - 16);

          if (isLit) {
            eg.fillStyle = winColor;
            eg.fillRect(x + 6, y + 6, 56, fh - 16);
          }

          // Balcony ledge + dark grill bars
          g.fillStyle = cfg.trim;
          g.fillRect(x, y + fh - 18, 68, 14);
          g.fillStyle = "rgba(15,12,10,0.6)";
          for (let gx = x + 4; gx < x + 64; gx += 8) {
            g.fillRect(gx, y + fh - 18, 2, 14);
          }
        }
      } else {
        // Standard mixed storefront & office windows
        for (let col = 0; col < 4; col++) {
          const x = 16 + col * 58;
          const isLit = (f * 4 + col * 6) % 3 === 0;
          const winColor = isLit ? pick(cfg.litWindows) : "#221c18";
          g.fillStyle = winColor;
          g.fillRect(x, y + 8, 42, fh - 20);

          if (isLit) {
            eg.fillStyle = winColor;
            eg.fillRect(x, y + 8, 42, fh - 20);
          }
        }
      }
    }

    // Ground floor commercial shop / showroom
    g.fillStyle = "#1e1b18";
    g.fillRect(0, 444, W, 68);
    for (let s = 0; s < 3; s++) {
      const sx = 14 + s * 80;
      g.fillStyle = s % 2 === 0 ? "#ffecb3" : "#e1f5fe";
      g.fillRect(sx, 454, 66, 54);
      // Bright shopfront illumination
      eg.fillStyle = s % 2 === 0 ? "#ffe082" : "#81d4fa";
      eg.fillRect(sx, 454, 66, 54);
    }

    // Urban grime, water streaks & road mud splash
    applyNoise(g, 0, 0, W, H, 3200, 0.16);
    applyMudSplash(g, W, H, 0.35);

    const diffTex = new THREE.CanvasTexture(diff);
    diffTex.colorSpace = THREE.SRGBColorSpace;

    const emisTex = new THREE.CanvasTexture(emis);
    emisTex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshLambertMaterial({
      map: diffTex,
      emissiveMap: emisTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.15,
    });
    mat.userData = { isBuilding: true, baseIntensity: 0.15 };
    mats.push(mat);
  }

  return mats;
}

/* ====== 4. Hand-Painted Dhaka Truck Art & Rear Signatures ====== */

export function createTruckArtTex(text = "দূর হতে ভালোবাসুন") {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const ctx = c.getContext("2d");

  // Vibrant folk gradient background (Bengali Rickshaw/Truck Art style)
  const bg = ctx.createLinearGradient(0, 0, 512, 256);
  bg.addColorStop(0, "#ffd600");
  bg.addColorStop(0.5, "#ff3d00");
  bg.addColorStop(1, "#c51162");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);

  // Ornamental scalloped folk border
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 240);

  ctx.strokeStyle = "#2962ff";
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, 484, 228);

  // Decorative corner floral ornaments
  for (const [cx, cy] of [[30, 30], [482, 30], [30, 226], [482, 226]]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#00e676";
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  }

  // Classic Bengali folk truck slogan
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 44px 'Kalpurush', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.fillText(text, 256, 120);

  // Sub-badge: "মা-বাবার দোয়া"
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#ffea00";
  ctx.font = "bold 24px 'Kalpurush', 'Noto Sans Bengali', 'Nirmala UI', sans-serif";
  ctx.fillText("✦ মা-বাবার দোয়া ✦", 256, 185);

  applyNoise(ctx, 0, 0, 512, 256, 1200, 0.12);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ====== 5. Lungi Plaid & Gamchha Fabrics ====== */

export function createPlaidTex(c1 = "#1a365d", c2 = "#e2e8f0", c3 = "#2b6cb0") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");

  ctx.fillStyle = c2;
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, 128, 28);
  ctx.fillRect(0, 64, 128, 28);
  ctx.fillRect(0, 0, 28, 128);
  ctx.fillRect(64, 0, 28, 128);

  ctx.fillStyle = c3;
  ctx.fillRect(0, 32, 128, 6);
  ctx.fillRect(32, 0, 6, 128);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGamchhaTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");

  // Classic red-and-white Dhaka checkered gamchha
  ctx.fillStyle = "#faf5f0";
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = "#c53030";
  ctx.fillRect(0, 0, 128, 22);
  ctx.fillRect(0, 64, 128, 22);
  ctx.fillRect(0, 0, 22, 128);
  ctx.fillRect(64, 0, 22, 128);

  ctx.fillStyle = "#742a2a";
  ctx.fillRect(0, 0, 22, 22);
  ctx.fillRect(64, 64, 22, 22);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSareeTex(baseColor = "#b71c1c", borderGold = "#ffd700") {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d");

  // Rich saree body color
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 128);

  // Tiny floral gold buti polka motifs
  ctx.fillStyle = borderGold;
  for (let y = 14; y < 90; y += 22) {
    for (let x = 14; x < 128; x += 22) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Broad golden zari border along bottom hem
  ctx.fillStyle = borderGold;
  ctx.fillRect(0, 96, 128, 32);

  // Zari zig-zag chevron detail
  ctx.strokeStyle = "#b26a00";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = 0; x <= 128; x += 8) {
    ctx.lineTo(x, x % 16 === 0 ? 102 : 118);
  }
  ctx.stroke();

  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGenjiTex() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f8f9fa";
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = "#e9ecef";
  ctx.lineWidth = 2;
  for (let x = 0; x < 64; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ====== 6. Rickshaw Floral Art Hood & Vinyl Rain Film ====== */

export function createRickshawHoodTex() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#d97706"; // Amber background
  ctx.fillRect(0, 0, 256, 256);

  // Folk diamond repeating pattern
  ctx.fillStyle = "#059669";
  for (let y = 0; y < 256; y += 64) {
    for (let x = 0; x < 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 32, y);
      ctx.lineTo(x + 64, y + 32);
      ctx.lineTo(x + 32, y + 64);
      ctx.lineTo(x, y + 32);
      ctx.fill();
    }
  }

  // Floral red centers
  ctx.fillStyle = "#dc2626";
  for (let y = 32; y < 256; y += 64) {
    for (let x = 32; x < 256; x += 64) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createRickshawFilmTex() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d");

  // Translucent vinyl with subtle glare streak
  ctx.fillStyle = "rgba(220, 240, 255, 0.28)";
  ctx.fillRect(0, 0, 128, 128);

  const g = ctx.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.45)");
  g.addColorStop(0.4, "rgba(255,255,255,0.05)");
  g.addColorStop(1, "rgba(255,255,255,0.3)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ====== 7. Danger Ring & Glow Sprite Textures ====== */

export function createDangerRingTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");

  const cx = 128, cy = 128;
  const g = ctx.createRadialGradient(cx, cy, 75, cx, cy, 125);
  g.addColorStop(0, "rgba(255, 20, 20, 0)");
  g.addColorStop(0.75, "rgba(255, 30, 30, 0.85)");
  g.addColorStop(0.9, "rgba(255, 80, 80, 0.95)");
  g.addColorStop(1, "rgba(255, 20, 20, 0)");

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 125, 0, Math.PI * 2);
  ctx.fill();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGlowSpriteTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");

  const cx = 64, cy = 64;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 64);
  g.addColorStop(0, "rgba(255, 245, 200, 1.0)");
  g.addColorStop(0.3, "rgba(255, 210, 120, 0.65)");
  g.addColorStop(0.7, "rgba(255, 160, 60, 0.2)");
  g.addColorStop(1, "rgba(255, 100, 20, 0)");

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 64, 0, Math.PI * 2);
  ctx.fill();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ====== 8. Expanded 24 Dhaka Roadside Shop Signs ====== */

export const DHAKA_SHOP_DATA = [
  ["মবিলে ভাজা সিঙ্গারা ও পুরি", "#b71c1c", "#ffeb3b"],
  ["বাবার দোয়া ডিজিটাল হার্ডওয়্যার", "#0d47a1", "#ffffff"],
  ["ভাই ভাই স্পেশাল বিরিয়ানি হাউস", "#e65100", "#ffeb3b"],
  ["মায়ের দোয়া ডিপার্টমেন্টাল স্টোর", "#1b5e20", "#ffffff"],
  ["বিসমিল্লাহ টেইলার্স ও ফেব্রিক্স", "#4a148c", "#ffca28"],
  ["বাকি চাহিয়া লজ্জা দিবেন না", "#c62828", "#ffffff"],
  ["সাময়িক অসুবিধার জন্য আন্তরিকভাবে দুঃখিত", "#37474f", "#fff59d"],
  ["হাজী বিরিয়ানি ও কাবাব হাউস", "#d84315", "#ffffff"],
  ["মেট্রো মোবাইল সার্ভিসিং ও বিকাশ", "#006064", "#ffffff"],
  ["পদ্মা জেনারেল ফার্মেসি", "#00796b", "#e0f2f1"],
  ["চাঁদনী চক লেডিস কালেকশন", "#ad1457", "#ffffff"],
  ["মদিনা ডায়াগনস্টিক অ্যান্ড কনসালটেশন", "#1565c0", "#ffffff"],
  ["নিউ ঢাকা ফটোকপি ও স্টেশনারি", "#f57f17", "#111111"],
  ["জনতা ইলেকট্রনিক্স ও ফ্যান মেরামত", "#c2185b", "#ffffff"],
  ["আমানত হোটেল অ্যান্ড রেস্তোরাঁ", "#bf360c", "#fff8e1"],
  ["সোনার বাংলা সেলুন অ্যান্ড স্পা", "#004d40", "#ffecb3"],
  ["শাহবাগ ফুল বিতান", "#6a1b9a", "#e1bee7"],
  ["স্বর্ণালী জুয়েলার্স", "#ff6f00", "#ffffff"],
  ["আল্লাহর দান ফল ভাণ্ডার", "#2e7d32", "#fffde7"],
  ["মিরপুর মটর পার্টস ও ব্যাটারি", "#263238", "#ffc107"],
  ["ক্যাফে ধানমন্ডি এক্সপ্রেস", "#3e2723", "#ffe0b2"],
  ["রয়েল চশমা ঘর ও অপটিক্যালস", "#01579b", "#ffffff"],
  ["গ্রিন বাংলা নার্সারি ও চারা", "#33691e", "#ffffff"],
  ["সততা বুক ডিপো ও লাইব্রেরি", "#880e4f", "#ffffff"],
];

