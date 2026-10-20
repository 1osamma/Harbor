/** Touches that start this close to the left edge can become a back swipe. */
export const EDGE_ZONE = 24;
/** Horizontal travel before a swipe is claimed from vertical scrolling. */
export const CLAIM_PX = 10;
/** Release past this share of the width, or faster than the flick speed, goes back. */
export const COMMIT_RATIO = 0.33;
export const FLICK_PX_PER_MS = 0.5;

/** Does a released edge swipe go back? */
export function shouldCommitSwipe(dx: number, width: number, velocity: number): boolean {
  if (dx <= 0) return false;
  return dx > width * COMMIT_RATIO || velocity > FLICK_PX_PER_MS;
}

/**
 * Has the finger moved far enough, and horizontally enough, to own the gesture?
 * "abandon" means it is a vertical scroll and the swipe should stop tracking.
 */
export function classifySwipeMove(dx: number, dy: number): "claim" | "wait" | "abandon" {
  if (Math.abs(dy) > CLAIM_PX && Math.abs(dy) > Math.abs(dx)) return "abandon";
  if (dx < CLAIM_PX || dx < Math.abs(dy) * 1.2) return "wait";
  return "claim";
}
