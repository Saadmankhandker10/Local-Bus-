// Collision helpers. The bus always sits at z = 0; other objects slide past it.

/**
 * Swept box test: did a box touch the bus at any moment while moving from zPrev to zNow?
 * Checking the whole path (not just the end point) means a fast object can never
 * jump straight through the bus between two steps ("tunnelling").
 * @param {number} bx       the bus's sideways position
 * @param {number} bHalfW   the bus's half width
 * @param {number} ox       the object's sideways position
 * @param {number} oHalfW   the object's half width
 * @param {number} zPrev    the object's z before this step
 * @param {number} zNow     the object's z after this step
 * @param {number} halfLens bus half length + object half length
 */
export function sweptHit(bx, bHalfW, ox, oHalfW, zPrev, zNow, halfLens) {
  if (Math.abs(ox - bx) >= bHalfW + oHalfW) return false;
  return Math.min(zPrev, zNow) < halfLens && Math.max(zPrev, zNow) > -halfLens;
}

/** Gap between the sides of two objects (negative means they overlap sideways). */
export function sideGap(bx, bHalfW, ox, oHalfW) {
  return Math.abs(ox - bx) - bHalfW - oHalfW;
}
