// A tiny message board. One module shouts "crash happened!" with emit(), and any
// module that cares listens with on(). This keeps score, HUD, sound, etc. separate.

const handlers = {};

/** Listen for an event, e.g. on("crash", e => ...). */
export function on(name, fn) {
  (handlers[name] ||= []).push(fn);
}

/** Tell every listener that an event happened. */
export function emit(name, data) {
  for (const fn of handlers[name] || []) fn(data);
}
