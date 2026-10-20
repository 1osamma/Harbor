import { isIos } from "@/lib/platform";

// iPhone and iPad render at device width with the touch layout in
// src/styles/ios.css and the iOS chrome in src/chrome/ios-*. The form factor
// is published on <html> so CSS can tell a phone from a tablet without
// guessing from the current width, which flips on rotation.
//
// phone:  shortest screen edge below 600pt (every iPhone)
// tablet: everything else (every iPad, including iPad mini at 744pt)
const TABLET_MIN_EDGE = 600;

export type IosFormFactor = "phone" | "tablet";

export function iosFormFactor(): IosFormFactor {
  if (typeof window === "undefined") return "phone";
  const edge = Math.min(window.screen.width, window.screen.height);
  return edge >= TABLET_MIN_EDGE ? "tablet" : "phone";
}

function applyViewport(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.appendChild(meta);
  }
  const next = "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no";
  if (meta.content !== next) meta.content = next;
}

function applyOrientation(): void {
  const landscape = window.matchMedia("(orientation: landscape)").matches;
  document.documentElement.dataset.iosOrientation = landscape ? "landscape" : "portrait";
}

const LONG_PRESS_MS = 480;
const LONG_PRESS_SLOP = 10;

/**
 * WebKit on iOS never fires `contextmenu`, so every Harbor context menu (card
 * actions, dismiss from Continue Watching, mark watched…) was unreachable by
 * touch. A still long press dispatches one at the finger, and the click that
 * follows the lift is swallowed so the card does not also open.
 */
function installLongPressContextMenu(): void {
  let timer = 0;
  let startX = 0;
  let startY = 0;
  let fired = false;
  const cancel = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };
  window.addEventListener(
    "touchstart",
    (e) => {
      cancel();
      fired = false;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest("input, textarea, select, [contenteditable='true'], video")) return;
      startX = touch.clientX;
      startY = touch.clientY;
      timer = window.setTimeout(() => {
        timer = 0;
        const event = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: startX,
          clientY: startY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          button: 2,
        });
        target.dispatchEvent(event);
        // Only claim the gesture when someone handled it; a plain page keeps its tap.
        fired = event.defaultPrevented;
      }, LONG_PRESS_MS);
    },
    { passive: true },
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (
        Math.abs(touch.clientX - startX) > LONG_PRESS_SLOP ||
        Math.abs(touch.clientY - startY) > LONG_PRESS_SLOP
      ) {
        cancel();
      }
    },
    { passive: true },
  );
  window.addEventListener("touchend", cancel, { passive: true });
  window.addEventListener("touchcancel", cancel, { passive: true });
  window.addEventListener(
    "click",
    (e) => {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}

/** iOS-only shell setup. Call once, before the first render. */
export function initIosShell(): void {
  if (!isIos() || typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.iosForm = iosFormFactor();
  applyViewport();
  applyOrientation();
  window.matchMedia("(orientation: landscape)").addEventListener("change", applyOrientation);
  // WebKit treats a long press as text selection and a double tap as zoom.
  // Both fight Harbor's own press-and-hold and double-tap-to-seek gestures.
  root.style.setProperty("-webkit-touch-callout", "none");
  root.style.setProperty("-webkit-tap-highlight-color", "transparent");
  // Stop WebKit inflating text on rotation; the iOS stylesheet sizes text itself.
  root.style.setProperty("-webkit-text-size-adjust", "100%");
  installLongPressContextMenu();
}
