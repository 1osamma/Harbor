# Harbor iOS — Mobile UI Redesign Progress

Tracks the touch-first iPhone/iPad UI work on `feature/harbor-ios` (fork `1osamma/Harbor`).
The native port itself (Rust/Swift/libmpv/CI) is tracked in `CODEX_HANDOFF.md`,
`IOS_PROGRESS.md` and `IOS_BUILD_LOG.md`.

Last updated: 2026-10-20 (Claude Code, UI session 1).

## Approach (read this first)

- **No second app.** The iOS UI is Harbor's own desktop shell and views. Their data logic
  (Continue Watching merge across Stremio/Trakt/Simkl/AniList, catalogs, addons, watchlist,
  player bridge) is untouched. Only presentation changes, behind:
  - `isIos()` (`src/lib/platform.ts`) in TS, and
  - `html[data-os="ios"]` in CSS: almost all styling lives in **`src/styles/ios.css`**.
- Views are restyled through **`data-*` attributes** added to existing elements
  (`data-hero-*`, `data-detail-*`, `data-home-*`, `data-episode-row`, `data-transport-*`…).
  Attributes are inert on desktop, so desktop rendering is byte-for-byte the same DOM + classes.
- Form factor and orientation are published by `src/lib/ios-shell.ts`:
  `html[data-ios-form="phone"|"tablet"]` (shortest screen edge < 600pt = phone) and
  `html[data-ios-orientation]`. `html[data-ios-tabbar]` is set while the tab bar shows.
- **Preview without a Mac:** run the Vite dev server and open
  `http://localhost:1420/?harbor-os=ios` with a phone-sized viewport. `?harbor-os=ios` is a
  dev-only override (`import.meta.env.DEV`), stripped from production builds. Tauri-only
  features (mpv, native commands) don't work there; layout and data do.

## Completed

| Area | What | Files |
|---|---|---|
| Foundation | iPhone renders at device width (the 960px scaled desktop is gone). Edge-to-edge: `#root` is inset only at the sides; each surface applies safe-area insets itself. Shared gutter (20pt phone / 32pt tablet) for all page scrollers. Desktop scrollbars hidden. | `lib/ios-shell.ts`, `index.css`, `styles/ios.css` |
| Navigation | Floating glass **tab bar**: Home, Discover, Search, Library, Profile (avatar). Wired to `setView` / the global search overlay / Settings; honours parental locks; tapping the active tab pops to its root; hidden during onboarding, playback, picker, Big Picture and immersive views. Portaled to `<body>` so it can sit over the search sheet. Round glass **back button** on pushed pages (same condition as desktop floating back). | `chrome/ios-tab-bar.tsx`, `chrome/ios-back-button.tsx`, `App.tsx` |
| Long press | WebKit on iOS never fires `contextmenu`; a still 480ms press now dispatches one, so every Harbor context menu (CW dismiss, mark watched, card actions…) works by touch. | `lib/ios-shell.ts` |
| Onboarding | Full-screen sheet on phone; desktop layout-picker step skipped on iOS. | `components/onboarding.tsx` |
| Home | Cinematic full-bleed hero under the status bar: centred logo, rank pill, 2-line synopsis, year/IMDb/runtime, Play + Watchlist, swipe (existing carousel), dots on the artwork. Seasonal invite + TMDB nudge flow below the hero. Rows: cards sized so the next one peeks past the edge; rows scroll to the screen edge. Continue Watching uses Harbor's `ContinueCard` (artwork, S/E, time left, progress bar, resume). | `components/hero.tsx`, `components/hero-carousel.tsx`, `components/row.tsx`, `views/home.tsx` |
| Details | Full-bleed hero, centred title/pills/actions on phone (existing overflow menu collapses extra actions), body on the shared gutter, compact episode rows (thumbnail 44%, 2-line title, 3-line synopsis, watched badge + progress kept) for Cinemeta/TMDB/anime episode lists. Detail "Customize layout" hidden on phone (kept on iPad). | `views/detail.tsx`, `views/detail/*` |
| Settings | iOS root: large title, search, profile card, grouped rows generated from Harbor's `TOP_GROUPS` (every existing page reachable, nothing new or decorative). Pages get a "‹ Settings" back control; re-tapping Profile returns to the root. | `views/settings/ios-settings-home.tsx`, `views/settings.tsx` |
| Search tab | Harbor's search overlay as a full-height sheet under the status bar, tab bar stays on top. Its "Jump to" grid reaches Movies, Shows, Anime, Live TV, Calendar, Addons, Music, eBook, TV Guide. | `styles/ios.css` |
| Discover / Library | Shared gutter; Library header wraps on phone. | `views/library.tsx`, `styles/ios.css` |
| Player chrome | Touch gestures on iOS: tap shows/hides controls (never pauses), double tap left/right third = −/+10s (stacks on repeated taps, with a flash), double tap centre = play/pause. Transport clears status bar + home indicator; 44pt minimum hit areas on control buttons. Controls with no iOS backend hidden on iOS: fullscreen, window controls, RTX HDR/VSR, desktop PiP window. | `views/player/drag-click-stage.tsx`, `views/player/hooks/use-chrome-visibility.ts`, `views/player.tsx`, `views/player/player-overlay-layers.tsx`, `components/player/transport.tsx`, `lib/player-chrome.ts` |
| iPad | Same chrome; wider tab bar, 32pt gutter, larger hero, desktop settings sidebar at ≥900pt; landscape hero keeps a side gradient and start-aligned copy. | `styles/ios.css` |
| Landscape iPhone | Icon-only compact tab bar; hero fills the screen with copy above the bar. | `styles/ios.css` |

## Verified

- `pnpm run typecheck`: passes.
- `pnpm test`: 6171 tests, **6043 pass / 106 fail**, identical to the documented pre-existing
  baseline. Re-run of the tests touching changed modules (row sizing, hero carousel, chapter
  menu, HDR overlay providers, row arrows): 19/19 pass.
- Browser preview (`?harbor-os=ios`, Chromium emulation): iPhone portrait 393×852, iPhone landscape
  852×393, iPad 820×1180 — Home, Details (movie + series), Settings root + page, Search,
  Discover, Library, onboarding. Desktop (no flag) checked: unchanged sidebar/topbar/hero.
- CI: see Build results.

## Not verified / needs a device

- **Real WebKit rendering on iPhone/iPad** (backdrop-filter, `svh`, `:has()`; all supported on
  iOS 16+, but only the simulator/device proves it).
- **Player chrome and gestures**: could not be rendered in the browser preview (Harbor sends a
  bare URL to the stream picker without a configured source). Needs a device with a stream
  addon. Playback itself (libmpv) remains unverified as before.
- Long-press context menus on a real touch screen.
- Keyboard + search sheet interplay on device (on-screen keyboard height).
- Dynamic Type: not implemented (the app uses fixed px type; see Known issues).

## Commits

| SHA | Summary |
|---|---|
| `ca9859db` | touch-first shell, floating tab bar, cinematic home and details |
| (next) | settings root, search sheet, player touch gestures, landscape + polish, this file |

## Build results

| Run | Commit | Result |
|---|---|---|
| [39364609792](https://github.com/1osamma/Harbor/actions/runs/39364609792) | `ca9859db` | **Simulator: success** (installs, launches, alive after 45s on iPhone 16 Pro + iPad Pro 13"; screenshot shows the new full-screen onboarding sheet under the Dynamic Island). **Device: IPA built + uploaded** (`Harbor-iOS-unsigned-ca9859db…`, 173 MB); job marked failed only by the Inspect IPA FFmpeg marker (false negative: FFmpeg ships as `Frameworks/Libavformat.framework`, verified by downloading the IPA). Fixed in `9c1eacdd`. |

## Known issues / limitations

- **Bottom black band (fix pending verification):** both simulator screenshots of run 39364609792
  (and the earlier run 39352217482) show a black band below the page (~97pt iPhone, ~52pt iPad):
  UIKit's automatic safe-area content inset on the WKWebView scroll view shrinks the page height.
  `src-tauri/ios/Sources/HarborWebViewInsets.swift` (called from `HarborMpvBootstrap.c`) sets
  `contentInsetAdjustmentBehavior = .never` once the webview exists. Confirm on the next run's
  screenshots. `mpv_set_geometry` reads `adjustedContentInset`, which is now zero, consistent with
  a page that starts at the screen origin.
- `color-mix()` needs iOS 16.2+; on 16.0–16.1 the glass surfaces fall back to transparent
  (Harbor's desktop CSS already relies on it).

- One navigation stack (Harbor's `ViewProvider`), not one stack per tab like `UITabBarController`:
  switching tabs resets to that tab's root (desktop sidebar behaviour). Per-tab stacks would need
  changes in `lib/view.tsx`.
- Player cannot force landscape on play; the user rotates the device (`Info.ios.plist` allows all
  orientations). Forcing it needs a native `requestGeometryUpdate` call (Swift).
- Dynamic Type is not followed; text sizes are px from the desktop design.
- Some desktop copy remains ("Right-click any title…" in Library empty state).
- In-app PiP (desktop window) is hidden on iOS; native PiP with mpv is still unimplemented
  (see `IOS_KNOWN_ISSUES.md`).
- CI simulator screenshots only capture the first launch screen (onboarding); deeper screens
  are checked in the browser preview.

## Remaining tasks (priority order)

1. Device test of the new IPA: navigation, long press, player gestures, rotation.
2. Player: native landscape-on-play (Swift), and verify transport layout in compact mode.
3. Per-tab navigation stacks (optional, `lib/view.tsx`).
4. Dynamic Type: map `-apple-system-body` to a root font-size scale for rem-based text.
5. Polish remaining desktop-only copy on iOS.

## Next exact step

Wait for (or re-run) `ios-build` on the latest commit, download
`Harbor-iOS-simulator-<sha>` to confirm the onboarding sheet renders inside the safe area, then
install `Harbor-iOS-unsigned-<sha>` on the iPhone (IOS_INSTALL.md) and walk the checklist above.
