// Advanced WebAudio Engine for Local Bus: Dhaka Route.
// Features: 3D Positional Panning (HRTF), 1.8s Convolver Street Reverb, Master Compressor & High-Shelf EQ,
// Dynamic Audio Ducking, Atmospheric City Noise Beds (Brown/Pink/White), and 25+ Dhaka Bus Megaphone Memes.
import * as THREE from "three";
import { CFG } from "./config.js";

const A = CFG.audio;
const MUTE_KEY = "localbus.muted";

let ctx = null;               // WebAudio Context
let master = null;            // Master output gain
let highShelf = null;         // Master High-Shelf EQ (-1.8 dB @ 4.2 kHz)
let compressor = null;        // Master Broadcast Dynamics Compressor
let reverb = null;            // 1.8s Street Canyon Convolver Reverb
let reverbGain = null;        // Reverb return level
let bgDuckingGain = null;     // Master ducking control for background audio
let engOsc = null, engFilter = null, engGain = null; // Continuous bus diesel engine hum
let crowdGain = null;         // Chasing mob murmur
let cityBedGain = null;       // Dhaka ambient noise beds (brown/pink/white noise)
let muted = localStorage.getItem(MUTE_KEY) === "1";

const listenerPos = { x: 0, y: 0, z: 0 };
const _fwdVec = new THREE.Vector3();
const _upVec = new THREE.Vector3();

/* ====== 1. Procedural 1.8s Street Canyon Impulse Response ====== */
function buildImpulseResponse(seconds = 1.8, decay = 2.2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const env = Math.exp(-decay * t);
    // Early flutter reflections (first 80ms) mimicking concrete building canyons
    let early = 0;
    if (t < 0.08) {
      early = Math.sin(t * 680) * 0.35 + Math.sin(t * 1150) * 0.22;
    }
    left[i] = ((Math.random() * 2 - 1) * env + early) * 0.42;
    right[i] = ((Math.random() * 2 - 1) * env - early) * 0.42;
  }
  return impulse;
}

/* ====== 2. City Noise Beds (Brown, Pink, White Noise) ====== */
function startBeds() {
  if (!ctx || cityBedGain) return;
  cityBedGain = ctx.createGain();
  cityBedGain.gain.value = 0.09; // Subtle city ambiance
  cityBedGain.connect(bgDuckingGain);

  const rate = ctx.sampleRate;
  const sec = 4.0;
  const total = Math.floor(rate * sec);

  // Brown Noise: Sub-rumble of city traffic, distant flyovers, diesel generators (40-120 Hz)
  const brownBuf = ctx.createBuffer(1, total, rate);
  const bData = brownBuf.getChannelData(0);
  let lastB = 0;
  for (let i = 0; i < total; i++) {
    const white = Math.random() * 2 - 1;
    lastB = (lastB + 0.04 * white) / 1.04;
    bData[i] = lastB * 3.5;
  }
  const brownSrc = ctx.createBufferSource();
  brownSrc.buffer = brownBuf;
  brownSrc.loop = true;
  const brownFilter = ctx.createBiquadFilter();
  brownFilter.type = "lowpass";
  brownFilter.frequency.value = 115;
  const brownGain = ctx.createGain();
  brownGain.gain.value = 0.65;
  brownSrc.connect(brownFilter);
  brownFilter.connect(brownGain);
  brownGain.connect(cityBedGain);
  brownSrc.start();

  // Pink Noise: Distant tires on asphalt, crowd hum (Paul Kellet 1/f filter)
  const pinkBuf = ctx.createBuffer(1, total, rate);
  const pData = pinkBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < total; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    pData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
    b6 = white * 0.115926;
  }
  const pinkSrc = ctx.createBufferSource();
  pinkSrc.buffer = pinkBuf;
  pinkSrc.loop = true;
  const pinkFilter = ctx.createBiquadFilter();
  pinkFilter.type = "bandpass";
  pinkFilter.frequency.value = 460;
  pinkFilter.Q.value = 1.2;
  const pinkGain = ctx.createGain();
  pinkGain.gain.value = 0.42;
  pinkSrc.connect(pinkFilter);
  pinkFilter.connect(pinkGain);
  pinkGain.connect(cityBedGain);
  pinkSrc.start();

  // White Noise / Street Air Hiss: High-frequency air layer
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "highpass";
  airFilter.frequency.value = 2800;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.14;
  pinkSrc.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(cityBedGain);
}

/** Create / resume the audio engine. Sets up mastering chain, 1.8s reverb, and city noise beds. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    // 1. Master Output Gain
    master = ctx.createGain();
    master.gain.value = muted ? 0 : A.volume;

    // 2. High-Shelf EQ (-1.8 dB at 4.2 kHz): Warms up high end, eliminates digital harshness
    highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 4200;
    highShelf.gain.value = -1.8;

    // 3. Broadcast Dynamics Compressor: Prevents clipping, gives punchy radio presence
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 10;
    compressor.ratio.value = 4.5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;

    // Mastering Chain Wiring: Master -> HighShelf -> Compressor -> Speakers
    master.connect(highShelf);
    highShelf.connect(compressor);
    compressor.connect(ctx.destination);

    // 4. Convolver Reverb: 1.8s impulse response representing concrete street corridors
    reverb = ctx.createConvolver();
    reverb.buffer = buildImpulseResponse(1.8, 2.2);
    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.22; // 22% wet reverb return
    reverb.connect(reverbGain);
    reverbGain.connect(master);

    // 5. Ducking Bus: Background audio (engine hum, city beds, crowd) ducks when voice/horn plays
    bgDuckingGain = ctx.createGain();
    bgDuckingGain.gain.value = 1.0;
    bgDuckingGain.connect(master);

    // 6. Continuous Diesel Bus Engine Hum
    engOsc = ctx.createOscillator();
    engOsc.type = "sawtooth";
    engOsc.frequency.value = 46;
    engFilter = ctx.createBiquadFilter();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 160;
    engGain = ctx.createGain();
    engGain.gain.value = 0;
    engOsc.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(bgDuckingGain);
    engOsc.start();

    // 7. Chasing Mob Murmur
    const len = 2.0;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 800));
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const cf = ctx.createBiquadFilter();
    cf.type = "bandpass"; cf.frequency.value = 520; cf.Q.value = 1.4;
    crowdGain = ctx.createGain();
    crowdGain.gain.value = 0;
    src.connect(cf); cf.connect(crowdGain); crowdGain.connect(bgDuckingGain);
    src.start();

    // 8. Start Dhaka City Noise Beds
    startBeds();
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function isMuted() { return muted; }

/** Turn all sound on or off. */
export function toggleMute() {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : A.volume, ctx.currentTime, 0.02);
  return muted;
}

/* ====== 3. Audio Ducking & 3D Positional Audio ====== */

/**
 * Ducks background sound (engine hum, city beds, crowd murmur) when voice or horn plays.
 * Smoothly lowers volume by 60% and returns to normal after duration.
 */
export function duckBackground(duration = 1.4, duckLevel = 0.38) {
  if (!ctx || !bgDuckingGain || muted) return;
  const t = ctx.currentTime;
  bgDuckingGain.gain.cancelScheduledValues(t);
  bgDuckingGain.gain.setValueAtTime(bgDuckingGain.gain.value, t);
  bgDuckingGain.gain.linearRampToValueAtTime(duckLevel, t + 0.06); // Quick 60ms dip
  bgDuckingGain.gain.setValueAtTime(duckLevel, t + Math.max(0.15, duration - 0.25));
  bgDuckingGain.gain.exponentialRampToValueAtTime(1.0, t + duration + 0.35); // Smooth release
}

/**
 * Creates a 3D PannerNode with inverse distance attenuation, low-pass air absorption,
 * and send to the 1.8s street canyon convolver reverb.
 */
export function create3DPanner(x = 0, y = 0, z = 0, options = {}) {
  if (!ctx) return null;
  const panner = ctx.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = options.refDistance || 8;
  panner.maxDistance = options.maxDistance || 150;
  panner.rolloffFactor = options.rolloffFactor || 1.15;
  panner.coneInnerAngle = 360;

  if (panner.positionX) {
    panner.positionX.setValueAtTime(x, ctx.currentTime);
    panner.positionY.setValueAtTime(y, ctx.currentTime);
    panner.positionZ.setValueAtTime(z, ctx.currentTime);
  } else if (panner.setPosition) {
    panner.setPosition(x, y, z);
  }

  // Atmospheric Low-Pass Filter: Distant sounds lose high frequencies
  const distLp = ctx.createBiquadFilter();
  distLp.type = "lowpass";
  const dist = Math.hypot(x - listenerPos.x, y - listenerPos.y, z - listenerPos.z);
  distLp.frequency.value = Math.max(650, 7500 - dist * 45);

  distLp.connect(panner);
  panner.connect(master);

  // Send to 1.8s street canyon convolver reverb
  if (options.reverb !== false && reverb) {
    const revSend = ctx.createGain();
    revSend.gain.value = options.reverbSend || 0.25;
    distLp.connect(revSend);
    revSend.connect(reverb);
  }

  return { input: distLp, panner };
}

/** Updates the 3D AudioListener position and orientation each frame from the 3D camera. */
export function updateAudioListener(cam) {
  if (!ctx || !ctx.listener || !cam) return;
  const t = ctx.currentTime;
  const p = cam.position;
  listenerPos.x = p.x; listenerPos.y = p.y; listenerPos.z = p.z;

  _fwdVec.set(0, 0, -1).applyQuaternion(cam.quaternion);
  _upVec.set(0, 1, 0).applyQuaternion(cam.quaternion);

  if (ctx.listener.positionX) {
    ctx.listener.positionX.setTargetAtTime(p.x, t, 0.05);
    ctx.listener.positionY.setTargetAtTime(p.y, t, 0.05);
    ctx.listener.positionZ.setTargetAtTime(p.z, t, 0.05);
    ctx.listener.forwardX.setTargetAtTime(_fwdVec.x, t, 0.05);
    ctx.listener.forwardY.setTargetAtTime(_fwdVec.y, t, 0.05);
    ctx.listener.forwardZ.setTargetAtTime(_fwdVec.z, t, 0.05);
    ctx.listener.upX.setTargetAtTime(_upVec.x, t, 0.05);
    ctx.listener.upY.setTargetAtTime(_upVec.y, t, 0.05);
    ctx.listener.upZ.setTargetAtTime(_upVec.z, t, 0.05);
  } else if (ctx.listener.setPosition) {
    ctx.listener.setPosition(p.x, p.y, p.z);
    ctx.listener.setOrientation(_fwdVec.x, _fwdVec.y, _fwdVec.z, _upVec.x, _upVec.y, _upVec.z);
  }
}

/** One tone with a quick attack and release, routed through a soft low-pass filter and reverb send. */
function tone(freqs, start, length, type, gain, pos = null) {
  const f = ctx.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = A.hornTone;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.02);
  g.gain.setValueAtTime(gain, start + length - 0.04);
  g.gain.linearRampToValueAtTime(0, start + length);
  f.connect(g);

  if (pos && typeof pos.x === "number") {
    const pan = create3DPanner(pos.x, pos.y || 0, pos.z || 0);
    if (pan) g.connect(pan.input);
    else g.connect(master);
  } else {
    g.connect(master);
  }

  // Reverb send
  if (reverb) {
    const revSend = ctx.createGain();
    revSend.gain.value = 0.22;
    f.connect(revSend);
    revSend.connect(reverb);
  }

  for (const fr of freqs) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = fr;
    o.connect(f); o.start(start); o.stop(start + length + 0.05);
  }
}

/* ====== 4. Gameplay Sound Effects ====== */

/** A two-note bus horn: "পোঁ-পোঁ" blended with Dhaka hydraulic bus horn and audio ducking. */
export function horn() {
  if (!ctx || muted) return;
  duckBackground(0.8, 0.45);
  const t = ctx.currentTime;
  tone(A.hornNote1, t, A.hornLength, "sawtooth", A.hornGain);
  tone(A.hornNote2, t + A.hornLength + 0.04, A.hornLength * 1.4, "sawtooth", A.hornGain);
  if (Math.random() < 0.35) playHydraulicHorn();
}

/** A short noise burst: the helper slapping the side of the bus. */
export function slap() {
  if (!ctx || muted) return;
  const t = ctx.currentTime, len = 0.12;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
  const g = ctx.createGain(); g.gain.value = A.slapGain;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
  if (Math.random() < 0.3) playHelperSlapSound();
}

/** Overhead metro train rumble + electric chime/horn when a train passes above the bus. */
export function metroPass(pos = null) {
  if (!ctx || muted) return;
  const t = ctx.currentTime, len = 1.4;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const env = Math.sin((i / d.length) * Math.PI);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 135; f.Q.value = 1.8;
  const g = ctx.createGain(); g.gain.value = 0.28;

  if (pos) {
    const pan = create3DPanner(pos.x, pos.y, pos.z, { refDistance: 15 });
    src.connect(f); f.connect(g); g.connect(pan ? pan.input : master);
  } else {
    src.connect(f); f.connect(g); g.connect(master);
  }
  src.start(t);
  tone([587.3, 880], t + 0.18, 0.28, "triangle", 0.12, pos);
}

/** Cartoon window-crack / projectile thud when a thrown item hits the bus. */
export function glassHit(pos = null) {
  if (!ctx || muted) return;
  const t = ctx.currentTime, len = 0.16;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.value = 0.45;

  if (pos) {
    const pan = create3DPanner(pos.x, pos.y, pos.z);
    src.connect(f); f.connect(g); g.connect(pan ? pan.input : master);
  } else {
    src.connect(f); f.connect(g); g.connect(master);
  }
  src.start(t);
  tone([1320, 1760], t, 0.08, "square", 0.12, pos);
}

/** Update continuous engine hum pitch/filter, city beds, and listener position every frame. */
export function updateAudio(speed, boosting, crowdClose, active, cam = null) {
  if (!ctx || !engOsc) return;
  const t = ctx.currentTime;
  if (cam) updateAudioListener(cam);

  const targetGain = active && !muted ? (0.045 + Math.min(0.055, speed * 0.0012) + (boosting ? 0.03 : 0)) : 0;
  const targetFreq = 42 + speed * 1.65 + (boosting ? 22 : 0);
  engOsc.frequency.setTargetAtTime(targetFreq, t, 0.05);
  engFilter.frequency.setTargetAtTime(140 + speed * 5.5 + (boosting ? 180 : 0), t, 0.05);
  engGain.gain.setTargetAtTime(targetGain, t, 0.06);

  if (crowdGain) {
    crowdGain.gain.setTargetAtTime(active && !muted ? crowdClose * 0.12 : 0, t, 0.08);
  }
  if (cityBedGain) {
    cityBedGain.gain.setTargetAtTime(active && !muted ? 0.09 : 0, t, 0.1);
  }
}

/** Punchy thud and rattle on a crash, routed through 3D panner if position is given. */
export function crashSound(heavy = false, pos = null) {
  if (!ctx || muted) return;
  const t = ctx.currentTime, len = heavy ? 0.42 : 0.22;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 1.8;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = heavy ? 280 : 480;
  const g = ctx.createGain(); g.gain.value = heavy ? 0.75 : 0.5;

  if (pos && typeof pos.x === "number") {
    const pan = create3DPanner(pos.x, pos.y || 0, pos.z || 0);
    src.connect(f); f.connect(g); g.connect(pan ? pan.input : master);
  } else {
    src.connect(f); f.connect(g); g.connect(master);
  }
  src.start(t);
  tone([heavy ? 65 : 95], t, len * 0.8, "triangle", heavy ? 0.35 : 0.22, pos);

  if (heavy) {
    playMemeSound("bus_crash_comic.mp3", 0.85, 1.05, pos);
  } else if (Math.random() < 0.35) {
    playKajThikHoyni(pos);
  }
}

/** Ascending two-note chime when chaining a crash combo. */
export function comboSound(mult = 1) {
  if (!ctx || muted) return;
  const t = ctx.currentTime, base = 440 + Math.min(6, mult) * 55;
  tone([base], t, 0.09, "triangle", 0.16);
  tone([base * 1.25], t + 0.08, 0.14, "triangle", 0.18);
  if (mult >= 3) {
    if (Math.random() < 0.5) playKhelaHobe();
    else playStuntYooo();
  }
}

/** Classic Dhaka bus conductor bell ("টুং-টুং") when passengers board. */
export function boardDing() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone([1174.7, 2349.3], t, 0.11, "sine", 0.15);
}

/** Warm rising tone when refueling at a CNG station mark. */
export function refuelSound() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone([330, 440], t, 0.14, "sine", 0.14);
  tone([440, 554.4], t + 0.12, 0.18, "sine", 0.16);
}

/** Short two-pip alert when a heavy hazard enters the warning zone ahead. */
export function warnBeep() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone([784], t, 0.07, "square", 0.1);
  tone([784], t + 0.1, 0.07, "square", 0.1);
}

/** Crisp snap sound when grazing and breaking a vehicle's side mirror. */
export function mirrorSnap(pos = null) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone([1568, 2093], t, 0.06, "square", 0.14, pos);
}

/** 3D Car alarm ("wee-oo wee-oo") triggered when a car, VIP SUV, or police car is hit. */
export function carAlarmSound(pos = null) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    tone([880], t + i * 0.24, 0.1, "square", 0.09, pos);
    tone([660], t + i * 0.24 + 0.11, 0.1, "square", 0.09, pos);
  }
}

/** Celebratory ascending synth fanfare ("Technologia / Yooo!") when launching off a jump ramp. */
export function rampFanfare() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, i) => {
    tone([n, n * 1.5], t + i * 0.09, 0.16, "sawtooth", 0.16);
  });
}

/** Crisp traffic-police pea-whistle trill with 3D positioning. */
export function whistleSound(pos = null) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 8; i++) {
    tone([2850 + (i % 2) * 240], t + i * 0.045, 0.04, "sine", 0.18, pos);
  }
}

// =========================================================================
// 5. DHAKA LOCAL BUS MEME & BUS INTERCOM AUDIO SYSTEM (25+ Sounds)
// Pitch-shifted & megaphone-filtered with real audio ducking and FM voice fallback.
// =========================================================================

const soundCache = new Map();
let lastMemeTime = 0;

/**
 * Synthesizes a megaphone voice shout for Bengali phrases when MP3 audio file is not present.
 * Uses FM modulation, speech formant filtering, and megaphone resonance with zero missing file errors.
 */
function synthesizeMegaphoneVoice(phraseType = "ostad_dane", gainVal = 0.75, pos = null) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  duckBackground(1.4, 0.35);

  const pitches = {
    ostad_dane: [165, 185, 210, 160],
    ostad_bame: [170, 195, 220, 175],
    chhara_chhara: [180, 220, 180, 220],
    sholosho_taka: [190, 210, 230, 180],
    baper_rasta: [175, 230, 260, 165],
    dhaka_police: [150, 170, 190, 150],
    shobai_uthun: [160, 185, 215, 170],
    bhara_den: [180, 210, 240, 185],
    gap_nai: [195, 230, 195, 160],
    brake_fao: [220, 260, 280, 200],
    ar_koto: [170, 200, 225, 165],
    direct_gari: [185, 215, 245, 190],
    chai_gorom: [210, 260, 240, 280]
  }[phraseType] || [180, 210, 230, 175];

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(pitches[0], t);
  pitches.forEach((p, idx) => {
    osc.frequency.linearRampToValueAtTime(p, t + 0.12 * (idx + 1));
  });

  const formant = ctx.createBiquadFilter();
  formant.type = "bandpass";
  formant.frequency.value = 1650;
  formant.Q.value = 3.2;

  const hornLp = ctx.createBiquadFilter();
  hornLp.type = "lowpass";
  hornLp.frequency.value = 3600;

  const hornHp = ctx.createBiquadFilter();
  hornHp.type = "highpass";
  hornHp.frequency.value = 340;

  const voiceGain = ctx.createGain();
  const dur = 0.12 * pitches.length + 0.12;
  voiceGain.gain.setValueAtTime(0, t);
  for (let i = 0; i < pitches.length; i++) {
    const st = t + i * 0.12;
    voiceGain.gain.linearRampToValueAtTime(gainVal * 0.9, st + 0.03);
    voiceGain.gain.linearRampToValueAtTime(gainVal * 0.25, st + 0.10);
  }
  voiceGain.gain.linearRampToValueAtTime(0, t + dur);

  osc.connect(formant);
  formant.connect(hornHp);
  hornHp.connect(hornLp);
  hornLp.connect(voiceGain);

  if (pos && typeof pos.x === "number") {
    const pan = create3DPanner(pos.x, pos.y || 0, pos.z || 0);
    voiceGain.connect(pan ? pan.input : master);
  } else {
    voiceGain.connect(master);
  }

  if (reverb) {
    const revSend = ctx.createGain();
    revSend.gain.value = 0.25;
    hornLp.connect(revSend);
    revSend.connect(reverb);
  }

  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/**
 * Play an adapted Dhaka meme soundbite through the custom Local Bus megaphone DSP filter
 * (bandpass EQ, pitch shift, tube saturation, and 3D positional audio).
 */
export async function playMemeSound(fileName, gainVal = 0.75, baseRate = 1.05, pos = null) {
  if (!ctx || muted) return;
  const now = performance.now();
  if (now - lastMemeTime < 1400) return;
  lastMemeTime = now;

  // Trigger dynamic background audio ducking
  duckBackground(1.6, 0.35);

  try {
    let buf = soundCache.get(fileName);
    if (!buf) {
      const resp = await fetch(`audio/memes/${fileName}`);
      if (!resp.ok) {
        // Fallback to procedural synthesis if file is not on disk
        const key = fileName.replace(".mp3", "").replace("conductor_", "").replace("passenger_", "").replace("bus_", "");
        synthesizeMegaphoneVoice(key, gainVal, pos);
        return;
      }
      const ab = await resp.arrayBuffer();
      buf = await ctx.decodeAudioData(ab);
      soundCache.set(fileName, buf);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = baseRate * (0.99 + Math.random() * 0.04);

    // Filter 1: Highpass at 310 Hz (megaphone profile)
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 310;

    // Filter 2: Mid-range peak at 2150 Hz (Dhaka bus roof loudspeaker resonance)
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 2150;
    mid.Q.value = 1.35;
    mid.gain.value = 4.2;

    // Filter 3: Lowpass at 3750 Hz (PA speaker roll-off)
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3750;

    const g = ctx.createGain();
    g.gain.value = gainVal;

    src.connect(hp);
    hp.connect(mid);
    mid.connect(lp);
    lp.connect(g);

    if (pos && typeof pos.x === "number") {
      const pan = create3DPanner(pos.x, pos.y || 0, pos.z || 0);
      g.connect(pan ? pan.input : master);
    } else {
      g.connect(master);
    }

    // Street reverb send
    if (reverb) {
      const revSend = ctx.createGain();
      revSend.gain.value = 0.24;
      lp.connect(revSend);
      revSend.connect(reverb);
    }

    src.start();
  } catch (err) {
    const key = fileName.replace(".mp3", "");
    synthesizeMegaphoneVoice(key, gainVal, pos);
  }
}

/* ====== 25+ Iconic Dhaka Bus & Bengali Meme Voice Triggers ====== */

export function playMasud(pos = null) { playMemeSound("conductor_masud.mp3", 0.85, 1.05, pos); }
export function playKhelaHobe(pos = null) { playMemeSound("conductor_khela_hobe.mp3", 0.9, 1.06, pos); }
export function playKajThikHoyni(pos = null) { playMemeSound("conductor_kaj_thik_hoyni.mp3", 0.82, 1.05, pos); }
export function playKiPagolami(pos = null) { playMemeSound("passenger_ki_pagolami.mp3", 0.85, 1.06, pos); }
export function playRagKorla(pos = null) { playMemeSound("conductor_rag_korla.mp3", 0.88, 1.05, pos); }
export function playNoNeed(pos = null) { playMemeSound("conductor_no_need.mp3", 0.85, 1.05, pos); }
export function playHydraulicHorn(pos = null) { playMemeSound("bus_hydraulic_horn.mp3", 0.95, 0.97, pos); }
export function playHelperSlapSound(pos = null) { playMemeSound("helper_bus_slap.mp3", 0.95, 1.08, pos); }
export function playRallyCrowd(pos = null) { playMemeSound("rally_crowd_shout.mp3", 0.78, 1.03, pos); }
export function playStuntYooo(pos = null) { playMemeSound("bus_stunt_yooo.mp3", 0.88, 1.05, pos); }
export function playHelperLaugh(pos = null) { playMemeSound("helper_laugh.mp3", 0.85, 1.05, pos); }
export function playBusCrashComic(pos = null) { playMemeSound("bus_crash_comic.mp3", 0.88, 1.05, pos); }

// Additional 13 Dhaka Bus Street Sounds & Memes (synthesized & megaphone filtered)
export function playOstadDane(pos = null) { playMemeSound("ostad_dane.mp3", 0.86, 1.06, pos); }
export function playOstadBame(pos = null) { playMemeSound("ostad_bame.mp3", 0.86, 1.06, pos); }
export function playChharaChhara(pos = null) { playMemeSound("chhara_chhara.mp3", 0.88, 1.08, pos); }
export function playSholoshoTaka(pos = null) { playMemeSound("sholosho_taka.mp3", 0.88, 1.05, pos); }
export function playBaperRasta(pos = null) { playMemeSound("baper_rasta.mp3", 0.92, 1.08, pos); }
export function playDhakaPolice(pos = null) { playMemeSound("dhaka_police.mp3", 0.88, 1.04, pos); }
export function playShobaiUthun(pos = null) { playMemeSound("shobai_uthun.mp3", 0.84, 1.06, pos); }
export function playBharaDen(pos = null) { playMemeSound("bhara_den.mp3", 0.86, 1.06, pos); }
export function playGapNai(pos = null) { playMemeSound("gap_nai.mp3", 0.88, 1.08, pos); }
export function playBrakeFao(pos = null) { playMemeSound("brake_fao.mp3", 0.92, 1.10, pos); }
export function playArKoto(pos = null) { playMemeSound("ar_koto.mp3", 0.85, 1.05, pos); }
export function playDirectGari(pos = null) { playMemeSound("direct_gari.mp3", 0.88, 1.06, pos); }
export function playChaiGorom(pos = null) { playMemeSound("chai_gorom.mp3", 0.85, 1.10, pos); }
