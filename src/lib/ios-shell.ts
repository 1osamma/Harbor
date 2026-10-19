import { isIos } from "@/lib/platform";

// The desktop shell is laid out for a window at least 960 CSS pixels wide
// (tauri.conf.json's minWidth). Every iPad in landscape and most in portrait
// meet that at device-width. iPhones do not, and below it the sidebar, rows and
// player chrome overlap instead of wrapping. Rather than ship a broken layout,
// widen the layout viewport to the minimum and let WebKit scale it to fit; the
// page then renders exactly as it does in a 960 pixel desktop window.
const MIN_LAYOUT_WIDTH = 960;

function viewportContent(): string {
  const width = Math.min(window.screen.width, window.screen.height);
  const landscape = window.matchMedia("(orientation: landscape)").matches;
  const deviceWidth = landscape ? Math.max(window.screen.width, window.screen.height) : width;
  const base = "viewport-fit=cover, user-scalable=no";
  if (deviceWidth >= MIN_LAYOUT_WIDTH) return `width=device-width, initial-scale=1, ${base}`;
  return `width=${MIN_LAYOUT_WIDTH}, ${base}`;
}

function applyViewport(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.appendChild(meta);
  }
  const next = viewportContent();
  if (meta.content !== next) meta.content = next;
}

/** iOS-only shell setup. Call once, before the first render. */
export function initIosShell(): void {
  if (!isIos() || typeof document === "undefined") return;
  applyViewport();
  window.matchMedia("(orientation: landscape)").addEventListener("change", applyViewport);
  // WebKit treats a long press as text selection and a double tap as zoom.
  // Both fight Harbor's own press-and-hold and double-tap-to-seek gestures.
  document.documentElement.style.setProperty("-webkit-touch-callout", "none");
  document.documentElement.style.setProperty("-webkit-tap-highlight-color", "transparent");
}
