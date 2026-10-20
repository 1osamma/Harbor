// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { classifySwipeMove, shouldCommitSwipe } from "../src/lib/ios-gestures.ts";
import { rowCellWidth } from "../src/lib/row-cell-width.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const iosCss = read("src/styles/ios.css");

/** Top-level selectors of a stylesheet (comments and @-rule bodies' own selectors included). */
function selectors(css: string): string[] {
  const out: string[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}@;]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    for (const s of m[1].split(",")) {
      const sel = s.trim();
      // Keyframe stops and @-rule preludes ("media (...)", "keyframes name") are not selectors.
      if (sel && !/^(from|to|\d+%|media\b|keyframes\b|supports\b)/.test(sel)) out.push(sel);
    }
  }
  return out;
}

test("every iOS rule is scoped to the iOS app, so desktop is untouched", () => {
  const offenders = selectors(iosCss).filter(
    (s) =>
      !s.startsWith('html[data-os="ios"]') &&
      // Classes only iOS components render.
      !s.startsWith(".ios-") &&
      !s.startsWith(".hset-ios-"),
  );
  assert.deepEqual(offenders, [], "unscoped selectors leak into desktop/web/TV");
});

test("lazy sections bleed exactly to the iOS gutter (no page wider than the screen)", () => {
  assert.match(
    iosCss,
    /\.harbor-lazy-cull \{\s*padding-left: var\(--ios-gutter\) !important;\s*padding-right: var\(--ios-gutter\) !important;\s*margin-left: calc\(-1 \* var\(--ios-gutter\)\) !important;\s*margin-right: calc\(-1 \* var\(--ios-gutter\)\) !important;/,
  );
  // The desktop bleed itself stays 48px.
  assert.match(read("src/components/lazy-mount.tsx"), /marginLeft: "-48px"/);
});

test("empty drag-region strips are not hidden on iOS: some are safe-area spacers", () => {
  assert.doesNotMatch(iosCss, /\[data-tauri-drag-region\]:empty/);
  assert.match(iosCss, /\.hset-top-space \{\s*block-size: var\(--ios-safe-top\) !important;/);
});

test("page scrollers pad past the status bar and the tab bar", () => {
  assert.match(
    iosCss,
    /main\.overflow-y-auto \{\s*padding-inline: var\(--ios-gutter\) !important;\s*padding-top: calc\(var\(--ios-safe-top\) \+ 16px\) !important;\s*padding-bottom: calc\(var\(--ios-tabbar-space\) \+ 24px\) !important;/,
  );
});

test("mpv's Metal drawable follows the view's pixel size (no stretched video after rotation)", () => {
  const swift = read("src-tauri/ios/Sources/HarborMpvPlayer.swift");
  const layout = swift.slice(swift.indexOf("override func layoutSubviews()"));
  assert.match(layout, /metalLayer\.frame = bounds/);
  assert.match(layout, /bounds\.width \* scale/);
  assert.match(layout, /bounds\.height \* scale/);
  assert.match(layout, /metalLayer\.drawableSize = pixels/);
});

test("the Swift/Rust function table has the same fields in the same order on both sides", () => {
  const c = read("src-tauri/ios/Sources/HarborMpvBootstrap.c");
  const rust = read("src-tauri/src/mpv_ios.rs");
  const cBody = c.slice(c.indexOf("typedef struct HarborMpvVtable {"), c.indexOf("} HarborMpvVtable;"));
  const cFields = [...cBody.matchAll(/\(\*(\w+)\)\(/g)].map((m) => m[1]);
  const rBody = rust.slice(rust.indexOf("pub struct HarborMpvVtable {"));
  const rFields = [
    ...rBody.slice(0, rBody.indexOf("\n}")).matchAll(/^\s+(\w+): extern "C" fn/gm),
  ].map((m) => m[1]);
  assert.ok(cFields.includes("set_presentation"));
  assert.deepEqual(rFields, cFields);
});

test("the player presentation command is registered for iOS", () => {
  assert.match(read("src-tauri/src/mobile.rs"), /crate::mpv_ios::ios_player_presentation,/);
  assert.match(read("src-tauri/Info.ios.plist"), /UIViewControllerBasedStatusBarAppearance<\/key>\s*<true\/>/);
});

test("edge swipe: only a rightward drag past a third of the width, or a flick, goes back", () => {
  assert.equal(shouldCommitSwipe(200, 393, 0.1), true);
  assert.equal(shouldCommitSwipe(60, 393, 0.1), false);
  assert.equal(shouldCommitSwipe(60, 393, 0.9), true, "a fast flick commits early");
  assert.equal(shouldCommitSwipe(-200, 393, 2), false, "leftward never goes back");
  assert.equal(classifySwipeMove(4, 2), "wait");
  assert.equal(classifySwipeMove(30, 4), "claim");
  assert.equal(classifySwipeMove(6, 40), "abandon", "vertical scrolls stay scrolls");
  assert.equal(classifySwipeMove(14, 13), "wait", "diagonal is not yet a swipe");
});

test("row cards: desktop fills whole cards exactly; iOS leaves the next card peeking", () => {
  // Desktop (peek 0) keeps the original formula: n cards and n-1 gaps fill the row.
  const desktop = rowCellWidth(1200, 144, 20, 0);
  const n = Math.floor((1200 + 20) / (144 + 20));
  assert.equal(desktop, (1200 - (n - 1) * 20) / n);
  // iPhone row (353pt usable, 12pt gap, 0.6 peek): two whole cards and 60% of a third.
  const phone = rowCellWidth(353, 106, 12, 0.6);
  assert.ok(Math.abs(phone * 2.6 + 2 * 12 - 353) < 1e-9);
  assert.ok(phone > 106, "cards never shrink below the minimum");
  // Narrow rows still show at least one card.
  assert.ok(rowCellWidth(80, 200, 12, 0.6) > 0);
});
