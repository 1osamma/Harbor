import { useRef, useState } from "react";
import { isIos } from "@/lib/platform";

const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_SLOP = 40;
const TOUCH_SEEK_SEC = 10;
const SEEK_ZONE = 0.36;

type TouchActions = {
  onSeekStep: (delta: number) => void;
  hideChrome: () => void;
};

export function DragClickStage(props: {
  drawMode: boolean;
  pipMode: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onWheelVolume?: (deltaY: number) => void;
  /** iOS: tap toggles the controls, double tap seeks (sides) or toggles play (centre). */
  touch?: TouchActions;
}) {
  const { drawMode, pipMode, onClick, onDoubleClick, onWheelVolume, touch } = props;
  if (touch && isIos()) {
    return (
      <TouchStage drawMode={drawMode} pipMode={pipMode} onPlayPause={onClick} actions={touch} />
    );
  }
  return (
    <div
      data-player-click-stage
      className="pointer-events-auto absolute inset-0 z-[3]"
      onWheel={(e) => {
        if (drawMode || pipMode) return;
        if (e.ctrlKey || e.metaKey) return;
        onWheelVolume?.(e.deltaY);
      }}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (drawMode || pipMode) return;
        if (e.button !== 0) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startTime = Date.now();
        let dragStarted = false;
        const onMove = (ev: MouseEvent) => {
          if (dragStarted) return;
          if (Date.now() - startTime < 150) return;
          const dx = Math.abs(ev.clientX - startX);
          const dy = Math.abs(ev.clientY - startY);
          if (dx > 8 || dy > 8) {
            dragStarted = true;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            import("@tauri-apps/api/window")
              .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
              .catch(() => {});
          }
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          if (!dragStarted) onClick();
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (drawMode || pipMode) return;
        onDoubleClick();
      }}
    />
  );
}

type SeekFlash = { side: "back" | "forward"; total: number; key: number };

/**
 * The phone gesture set: a tap shows or hides the controls (it never pauses,
 * since a finger rests on the glass far more often than a cursor clicks), and
 * a double tap skips 10s on the outer thirds or toggles play in the middle.
 * Repeated double taps keep stacking, as seekStep chains rapid requests.
 */
function TouchStage({
  drawMode,
  pipMode,
  onPlayPause,
  actions,
}: {
  drawMode: boolean;
  pipMode: boolean;
  onPlayPause: () => void;
  actions: TouchActions;
}) {
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const singleTimer = useRef(0);
  const chromeWasVisible = useRef(false);
  const [flash, setFlash] = useState<SeekFlash | null>(null);
  const flashTimer = useRef(0);

  const showFlash = (side: SeekFlash["side"]) => {
    window.clearTimeout(flashTimer.current);
    setFlash((prev) =>
      prev && prev.side === side
        ? { side, total: prev.total + TOUCH_SEEK_SEC, key: prev.key + 1 }
        : { side, total: TOUCH_SEEK_SEC, key: Date.now() },
    );
    flashTimer.current = window.setTimeout(() => setFlash(null), 650);
  };

  return (
    <div
      data-player-click-stage
      className="pointer-events-auto absolute inset-0 z-[3] touch-manipulation"
      onPointerDown={(e) => {
        // Read before this touch wakes the controls, so the tap can toggle them.
        chromeWasVisible.current = document.documentElement.hasAttribute(
          "data-player-chrome-visible",
        );
        if (e.pointerType === "mouse") e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (drawMode || pipMode) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const now = performance.now();
        const prev = lastTap.current;
        const isDouble =
          prev &&
          now - prev.at < DOUBLE_TAP_MS &&
          Math.abs(e.clientX - prev.x) < DOUBLE_TAP_SLOP &&
          Math.abs(e.clientY - prev.y) < DOUBLE_TAP_SLOP;
        if (isDouble) {
          window.clearTimeout(singleTimer.current);
          // A third tap right after a double keeps seeking instead of resetting.
          lastTap.current = { at: now, x: e.clientX, y: e.clientY };
          const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
          if (ratio < SEEK_ZONE) {
            actions.onSeekStep(-TOUCH_SEEK_SEC);
            showFlash("back");
          } else if (ratio > 1 - SEEK_ZONE) {
            actions.onSeekStep(TOUCH_SEEK_SEC);
            showFlash("forward");
          } else {
            onPlayPause();
          }
          return;
        }
        lastTap.current = { at: now, x: e.clientX, y: e.clientY };
        const wasVisible = chromeWasVisible.current;
        window.clearTimeout(singleTimer.current);
        singleTimer.current = window.setTimeout(() => {
          lastTap.current = null;
          if (wasVisible) actions.hideChrome();
        }, DOUBLE_TAP_MS);
      }}
    >
      {flash && (
        <div
          key={flash.key}
          aria-hidden
          className={`ios-seek-flash ${flash.side === "back" ? "is-back" : "is-forward"}`}
        >
          <span className="ios-seek-flash-label">
            {flash.side === "back" ? "−" : "+"}
            {flash.total}s
          </span>
        </div>
      )}
    </div>
  );
}
