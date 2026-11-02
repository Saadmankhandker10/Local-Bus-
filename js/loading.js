// Branded Loading Screen Controller for "Local Bus: Dhaka Route"
// Features: Real asset load stages, 5-stop route line with moving bus, rotating helper lines, 30s fail-safe.
import { MENU_BN } from "./data/menu.bn.js";
import { $ } from "./utils.js";

class LoadingController {
  constructor() {
    this.stage = 0; // 0..5
    this.totalStages = 5;
    this.quoteIndex = 0;
    this.quoteTimer = null;
    this.timeoutTimer = null;
    this.isDone = false;
  }

  init() {
    const screen = $("loadScreen");
    if (!screen) return;

    // Start rotating helper quotes every 2.5 seconds
    this.rotateQuotes();
    this.quoteTimer = setInterval(() => this.rotateQuotes(), 2500);

    // 30-second failsafe timeout
    this.timeoutTimer = setTimeout(() => {
      if (!this.isDone) {
        this.showFailure(MENU_BN.loading.timeoutMsg);
      }
    }, 30000);
  }

  rotateQuotes() {
    const qEl = $("loadHelperQuote");
    if (!qEl) return;
    qEl.style.opacity = "0";
    setTimeout(() => {
      const quotes = MENU_BN.loading.helpers;
      qEl.textContent = quotes[this.quoteIndex % quotes.length];
      qEl.style.opacity = "1";
      this.quoteIndex++;
    }, 180);
  }

  /**
   * Advance real progress.
   * @param {number} stageIndex 1..5
   */
  setStage(stageIndex) {
    if (this.isDone) return;
    this.stage = Math.max(this.stage, stageIndex);
    const pct = Math.min(100, Math.round((this.stage / this.totalStages) * 100));

    // Update moving bus position
    const bus = $("loadBusMarker");
    if (bus) {
      bus.style.left = `${pct}%`;
    }

    // Light up completed stop dots
    for (let i = 0; i < 5; i++) {
      const dot = $(`loadDot${i}`);
      if (dot) {
        dot.classList.toggle("lit", i < this.stage);
      }
    }

    if (this.stage >= this.totalStages) {
      this.complete();
    }
  }

  complete() {
    if (this.isDone) return;
    this.isDone = true;
    if (this.quoteTimer) clearInterval(this.quoteTimer);
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);

    // Light all dots and bus to 100%
    const bus = $("loadBusMarker");
    if (bus) bus.style.left = "100%";
    for (let i = 0; i < 5; i++) {
      const dot = $(`loadDot${i}`);
      if (dot) dot.classList.add("lit");
    }

    // Smooth zero-CLS fadeout into the main menu
    setTimeout(() => {
      const screen = $("loadScreen");
      if (screen) {
        screen.classList.add("loaded");
        setTimeout(() => {
          screen.hidden = true;
        }, 500);
      }
    }, 450);
  }

  showFailure(msgText) {
    const errBox = $("loadErrorBox");
    const errText = $("loadErrorText");
    if (errBox && errText) {
      errText.textContent = msgText;
      errBox.hidden = false;
    }
  }
}

export const loader = new LoadingController();

