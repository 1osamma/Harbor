import { useEffect, useRef } from "react";
import { classifySwipeMove, EDGE_ZONE, shouldCommitSwipe } from "@/lib/ios-gestures";
import { IOS_SETTINGS_ROOT_EVENT } from "@/lib/ios-shell";
import { useView } from "@/lib/view";
import { useFloatingBackShown } from "./floating-back";

/** The element that visually is the current page, for the drag transform. */
function activePage(): HTMLElement | null {
  const layer = document.querySelector<HTMLElement>("[data-harbor-shell] .harbor-layer-active");
  if (!layer) return null;
  if (getComputedStyle(layer).display !== "contents") return layer;
  return layer.firstElementChild instanceof HTMLElement ? layer.firstElementChild : null;
}

/**
 * Left-edge swipe to go back, the UINavigationController gesture. It follows
 * Harbor's own history (goBack) under the same condition as the back button,
 * and in Settings returns a page to the Settings list. It never starts while
 * the player or the source picker is up, and only claims a touch once the
 * movement is clearly horizontal and rightward, so rows and vertical
 * scrolling keep working from the edge.
 */
export function IosSwipeBack({ disabled }: { disabled: boolean }) {
  const { goBack, view, topKind } = useView();
  const backShown = useFloatingBackShown();
  const state = useRef({ disabled, backShown, view, topKind, goBack });
  state.current = { disabled, backShown, view, topKind, goBack };

  useEffect(() => {
    let tracking = false;
    let claimed = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let page: HTMLElement | null = null;

    const canSwipe = () => {
      const s = state.current;
      if (s.disabled) return false;
      if (s.backShown) return true;
      return s.view === "settings" && s.topKind === "settings";
    };

    const reset = (el: HTMLElement | null, animate: boolean) => {
      if (!el) return;
      if (animate) {
        el.style.transition = "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        el.style.transform = "translate3d(0, 0, 0)";
        window.setTimeout(() => clear(el), 280);
      } else {
        clear(el);
      }
    };
    const clear = (el: HTMLElement) => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.boxShadow = "";
      el.style.willChange = "";
    };

    const onStart = (e: TouchEvent) => {
      tracking = false;
      claimed = false;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const edge = EDGE_ZONE + (parseFloat(getComputedStyle(document.getElementById("root")!).left) || 0);
      if (t.clientX > edge || !canSwipe()) return;
      tracking = true;
      startX = lastX = t.clientX;
      startY = t.clientY;
      lastT = performance.now();
      velocity = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!claimed) {
        const verdict = classifySwipeMove(dx, dy);
        if (verdict === "abandon") {
          tracking = false;
          return;
        }
        if (verdict === "wait") return;
        claimed = true;
        page = activePage();
        if (page) {
          page.style.willChange = "transform";
          page.style.boxShadow = "-24px 0 48px rgb(0 0 0 / 0.45)";
        }
      }
      e.preventDefault();
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) velocity = velocity * 0.6 + ((t.clientX - lastX) / dt) * 0.4;
      lastX = t.clientX;
      lastT = now;
      if (page) {
        page.style.transition = "none";
        page.style.transform = `translate3d(${Math.max(0, dx)}px, 0, 0)`;
      }
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!claimed) return;
      claimed = false;
      const el = page;
      page = null;
      const width = window.innerWidth || 1;
      if (!shouldCommitSwipe(lastX - startX, width, velocity)) {
        reset(el, true);
        return;
      }
      const finish = () => {
        const s = state.current;
        if (s.view === "settings" && s.topKind === "settings" && !s.backShown) {
          window.dispatchEvent(new Event(IOS_SETTINGS_ROOT_EVENT));
        } else {
          s.goBack();
        }
        // The page left the stack (or was replaced); put the element back for its next use.
        requestAnimationFrame(() => el && clear(el));
      };
      if (!el) {
        finish();
        return;
      }
      el.style.transition = "transform 200ms cubic-bezier(0.3, 0.7, 0.4, 1)";
      el.style.transform = `translate3d(${width}px, 0, 0)`;
      window.setTimeout(finish, 190);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return null;
}
