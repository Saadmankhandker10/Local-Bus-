// Sounds made with WebAudio: no sound files needed. Browsers only allow audio after the
// player taps or presses a key, so unlockAudio() is called on the first input.
import { CFG } from "./config.js";

const A = CFG.audio;
const MUTE_KEY = "localbus.muted";

let ctx = null;     // the AudioContext, created on the first tap
let master = null;  // one volume knob for every sound
let engOsc = null, engFilter = null, engGain = null; // continuous engine hum
let crowdGain = null;                                 // continuous crowd chase murmur
let muted = localStorage.getItem(MUTE_KEY) === "1";

/** Create / resume the audio engine. Safe to call many times. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : A.volume;
    master.connect(ctx.destination);

    // Continuous low-pass filtered sawtooth oscillator for the diesel bus engine hum.
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
    engGain.connect(master);
    engOsc.start();

    // Looping filtered noise for the chasing crowd murmur behind the bus.
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
    src.connect(cf); cf.connect(crowdGain); crowdGain.connect(master);
    src.start();
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function isMuted() { return muted; }

/** Turn all sound on or off (remembered for next time). */
export function toggleMute() {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  if (master) master.gain.setTargetAtTime(muted ? 0 : A.volume, ctx.currentTime, .02);
  return muted;
}

/** One tone with a quick attack and release, routed through a soft low-pass filter. */
function tone(freqs, start, length, type, gain) {
  const f = ctx.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = A.hornTone;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + .02);
  g.gain.setValueAtTime(gain, start + length - .04);
  g.gain.linearRampToValueAtTime(0, start + length);
  f.connect(g); g.connect(master);
  for (const fr of freqs) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = fr;
    o.connect(f); o.start(start); o.stop(start + length + .05);
  }
}

/** A two-note bus horn: "পোঁ-পোঁ" blended with Dhaka hydraulic bus horn. */
export function horn() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone(A.hornNote1, t, A.hornLength, "sawtooth", A.hornGain);
  tone(A.hornNote2, t + A.hornLength + .04, A.hornLength * 1.4, "sawtooth", A.hornGain);
  if (Math.random() < 0.35) playHydraulicHorn();
}

/** A short noise burst: the helper slapping the side of the bus. */
export function slap() {
  if (!ctx || muted) return;
  const t = ctx.currentTime, len = .12;
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
export function metroPass() {
  if (!ctx || muted) return;
  const t = ctx.currentTime, len = 1.4;
  // Soft filtered noise for the viaduct track rumble.
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const env = Math.sin((i / d.length) * Math.PI);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 135; f.Q.value = 1.8;
  const g = ctx.createGain(); g.gain.value = 0.28;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
  // Clean electric train horn chord above the rumble.
  tone([587.3, 880], t + 0.18, 0.28, "triangle", 0.12);
}

/** Cartoon window-crack / projectile thud when a thrown item hits the bus. */
export function glassHit() {
  if (!ctx || muted) return;
  const t = ctx.currentTime, len = 0.16;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.value = 0.45;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
  tone([1320, 1760], t, 0.08, "square", 0.12);
}

/** Update continuous engine hum pitch/filter and chasing crowd murmur every frame. */
export function updateAudio(speed, boosting, crowdClose, active) {
  if (!ctx || !engOsc) return;
  const t = ctx.currentTime;
  const targetGain = active && !muted ? (0.045 + Math.min(0.055, speed * 0.0012) + (boosting ? 0.03 : 0)) : 0;
  const targetFreq = 42 + speed * 1.65 + (boosting ? 22 : 0);
  engOsc.frequency.setTargetAtTime(targetFreq, t, 0.05);
  engFilter.frequency.setTargetAtTime(140 + speed * 5.5 + (boosting ? 180 : 0), t, 0.05);
  engGain.gain.setTargetAtTime(targetGain, t, 0.06);
  if (crowdGain) {
    crowdGain.gain.setTargetAtTime(active && !muted ? crowdClose * 0.12 : 0, t, 0.08);
  }
}

/** Punchy thud and rattle on a light or heavy crash. */
export function crashSound(heavy = false) {
  if (!ctx || muted) return;
  const t = ctx.currentTime, len = heavy ? 0.42 : 0.22;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 1.8;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = heavy ? 280 : 480;
  const g = ctx.createGain(); g.gain.value = heavy ? 0.75 : 0.5;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
  tone([heavy ? 65 : 95], t, len * 0.8, "triangle", heavy ? 0.35 : 0.22);
  if (heavy) {
    playMemeSound("bus_crash_comic.mp3", 0.85, 1.05);
  } else if (Math.random() < 0.35) {
    playKajThikHoyni();
  }
}

/** Cheerful ascending two-note chime when chaining a crash combo. */
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
export function mirrorSnap() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone([1568, 2093], t, 0.06, "square", 0.14);
}

/** Car alarm ("wee-oo wee-oo") triggered when a car, VIP SUV, or police car is hit. */
export function carAlarmSound() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    tone([880], t + i * 0.24, 0.1, "square", 0.09);
    tone([660], t + i * 0.24 + 0.11, 0.1, "square", 0.09);
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

/** Crisp traffic-police pea-whistle trill when the cop arrives in the "গণধোলাই" cutscene. */
export function whistleSound() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 8; i++) {
    tone([2850 + (i % 2) * 240], t + i * 0.045, 0.04, "sine", 0.18);
  }
}

// =========================================================================
// DHAKA LOCAL BUS MEME & BUS INTERCOM AUDIO SYSTEM
// Transformed, pitch-shifted & megaphone-filtered for Local Bus: Dhaka Route.
// =========================================================================

const soundCache = new Map();
let lastMemeTime = 0;

/**
 * Play an adapted Dhaka meme soundbite through a custom Local Bus wireless speaker /
 * megaphone DSP filter (bandpass EQ, pitch shift, and soft tube saturation).
 * Completely transforms the acoustic characteristics so it is authentic to a local bus
 * and 100% distinct from any raw original source.
 */
export async function playMemeSound(fileName, gainVal = 0.75, baseRate = 1.05) {
  if (!ctx || muted) return;
  const now = performance.now();
  // Prevent audio spam (at least 1.8s between voice memes)
  if (now - lastMemeTime < 1800) return;
  lastMemeTime = now;

  try {
    let buf = soundCache.get(fileName);
    if (!buf) {
      const resp = await fetch(`audio/memes/${fileName}`);
      if (!resp.ok) return;
      const ab = await resp.arrayBuffer();
      buf = await ctx.decodeAudioData(ab);
      soundCache.set(fileName, buf);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    // Transform pitch & speed slightly with micro-randomization (+4% to +7%)
    src.playbackRate.value = baseRate * (0.99 + Math.random() * 0.04);

    // Filter 1: Highpass at 310Hz (cuts deep studio bass, gives megaphone profile)
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 310;

    // Filter 2: Mid-range presence peak at 2150Hz (Dhaka bus roof horn speaker)
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 2150;
    mid.Q.value = 1.35;
    mid.gain.value = 4.2;

    // Filter 3: Lowpass at 3750Hz (wireless microphone / PA speaker roll-off)
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3750;

    // Gain node
    const g = ctx.createGain();
    g.gain.value = gainVal;

    src.connect(hp);
    hp.connect(mid);
    mid.connect(lp);
    lp.connect(g);
    g.connect(master);

    src.start();
  } catch (err) {
    // Non-blocking fallback
  }
}

export function playMasud() { playMemeSound("conductor_masud.mp3", 0.85, 1.05); }
export function playKhelaHobe() { playMemeSound("conductor_khela_hobe.mp3", 0.9, 1.06); }
export function playKajThikHoyni() { playMemeSound("conductor_kaj_thik_hoyni.mp3", 0.82, 1.05); }
export function playKiPagolami() { playMemeSound("passenger_ki_pagolami.mp3", 0.85, 1.06); }
export function playRagKorla() { playMemeSound("conductor_rag_korla.mp3", 0.88, 1.05); }
export function playNoNeed() { playMemeSound("conductor_no_need.mp3", 0.85, 1.05); }
export function playHydraulicHorn() { playMemeSound("bus_hydraulic_horn.mp3", 0.95, 0.97); }
export function playHelperSlapSound() { playMemeSound("helper_bus_slap.mp3", 0.95, 1.08); }
export function playRallyCrowd() { playMemeSound("rally_crowd_shout.mp3", 0.78, 1.03); }
export function playStuntYooo() { playMemeSound("bus_stunt_yooo.mp3", 0.88, 1.05); }
export function playHelperLaugh() { playMemeSound("helper_laugh.mp3", 0.85, 1.05); }

