// Small helpers used everywhere.

/** Get a DOM element by id. */
export const $ = id => document.getElementById(id);

/** Random number between a and b. */
export const rnd = (a, b) => a + Math.random() * (b - a);

/** Random item from an array. */
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/** Keep v between a and b. */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
