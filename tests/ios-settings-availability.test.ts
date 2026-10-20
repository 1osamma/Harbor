// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { iosSettingsOptionVisible } from "../src/views/settings/ios-availability.ts";

test("iOS search excludes hidden desktop destinations while preserving shared pages", () => {
  for (const option of [
    { section: "basics", label: "Picture in picture style", anchorTitle: "Picture in picture style" },
    { section: "theme", tab: "window", label: "Moving the window" },
    { section: "advanced", label: "Close to the system tray", anchorTitle: "Window behavior" },
    { section: "advanced", label: "Show on Discord", anchorTitle: "Discord Rich Presence" },
    { section: "anime", tab: "svp", label: "Enable SVP" },
    { section: "player", label: "Separate window display" },
    { section: "player", label: "Device compatibility", anchorTitle: "Casting" },
    { section: "updates", label: "Check for updates", anchorTitle: "Updates" },
    { section: "bigPicture", label: "Big Picture display" },
  ]) assert.equal(iosSettingsOptionVisible(option), false, option.label);
  for (const option of [
    { section: "player", label: "mpv", anchorTitle: "Player engine" },
    { section: "advanced", label: "Block ads & trackers", anchorTitle: "Privacy" },
    { section: "updates", label: "Export everything", anchorTitle: "Backup & restore" },
    { section: "anime", tab: "smooth", label: "Motion smoothing" },
  ]) assert.equal(iosSettingsOptionVisible(option), true, option.label);
});
