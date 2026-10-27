// Sounds made with WebAudio: no sound files needed. Browsers only allow audio after the
// player taps or presses a key, so unlockAudio() is called on the first input.
import { CFG } from "./config.js";

const A = CFG.audio;
const MUTE_KEY = "localbus.muted";

let ctx = null;     // the AudioContext, created on the first tap
let master = null;  // one volume knob for every sound
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

/** A two-note bus horn: "পোঁ-পোঁ". */
export function horn() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone(A.hornNote1, t, A.hornLength, "sawtooth", A.hornGain);
  tone(A.hornNote2, t + A.hornLength + .04, A.hornLength * 1.4, "sawtooth", A.hornGain);
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
}
