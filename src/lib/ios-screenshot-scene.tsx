import { useEffect, useRef } from "react";
import { useOnboarding } from "@/lib/onboarding";
import { isIos } from "@/lib/platform";
import { useView } from "@/lib/view";

/**
 * CI screenshots of the iOS simulator. The workflow relaunches the app with
 * SIMCTL_CHILD_HARBOR_SCREENSHOT=<scene>; Rust hands the value over through
 * `ios_screenshot_scene`, and this opens that scene with Harbor's normal
 * navigation. On a device the variable is never set and this does nothing.
 */
const TEST_VIDEO = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

let scene: string | null = null;

/** The portrait player scene keeps the phone upright for its screenshot. */
export function screenshotSceneKeepsPortrait(): boolean {
  return scene === "player-portrait";
}

export function IosScreenshotScene() {
  const view = useView();
  const { onboarded, finishOnboarding } = useOnboarding();
  const viewRef = useRef(view);
  viewRef.current = view;
  const started = useRef(false);

  useEffect(() => {
    if (!isIos() || started.current) return;
    started.current = true;
    let wake = 0;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string | null>("ios_screenshot_scene"))
      .then((name) => {
        if (!name) return;
        scene = name;
        if (!onboarded) finishOnboarding();
        const v = () => viewRef.current;
        const later = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
        switch (name) {
          case "home":
            v().setView("home");
            break;
          case "movie":
            v().openMeta({ id: "tt27199254", type: "movie", name: "Practical Magic 2" });
            break;
          case "series":
            v().openMeta({ id: "tt1190634", type: "series", name: "The Boys" });
            break;
          case "long":
            v().openMeta({ id: "tt27199254", type: "movie", name: "Practical Magic 2" });
            later(9000, () => {
              document.querySelector("[data-detail-main]")?.scrollTo({ top: 1100 });
            });
            break;
          case "settings":
            v().setView("settings");
            break;
          case "settings-page":
            v().openSettings("player");
            break;
          case "player-portrait":
          case "player-landscape":
            v().openPlayer({
              meta: { id: "local:harbor-ci-test", type: "movie", name: "Big Buck Bunny" },
              url: TEST_VIDEO,
              title: "Big Buck Bunny",
            });
            // Keep the controls up for the screenshot (the same event a gamepad sends).
            wake = window.setInterval(
              () => window.dispatchEvent(new Event("harbor:controller-activity")),
              1000,
            );
            break;
        }
      })
      .catch(() => {});
    return () => window.clearInterval(wake);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
