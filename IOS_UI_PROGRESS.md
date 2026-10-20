# Harbor iOS — Mobile UI Redesign Progress

Tracks the touch-first iPhone/iPad UI work on `feature/harbor-ios` (fork `1osamma/Harbor`).
The native port itself (Rust/Swift/libmpv/CI) is tracked in `CODEX_HANDOFF.md`,
`IOS_PROGRESS.md` and `IOS_BUILD_LOG.md`.

Last updated: 2026-10-20 (Claude Code, UI session 1, after run 39367474752).

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
| [39367474752](https://github.com/1osamma/Harbor/actions/runs/39367474752) | `1e6a173f` | **Both jobs success (first fully green run).** Inspect IPA: Rust, Swift, mpv and FFmpeg markers found. Simulator screenshots: onboarding sheet fills the screen, bottom black band gone. **IPA:** [Harbor-iOS-unsigned-1e6a173f](https://github.com/1osamma/Harbor/actions/runs/39367474752/artifacts/12241017065) (173 MB, arm64, `app.harbor`, iOS 16+, expires 2026-11-19). |

## Known issues / limitations


- **Bottom black band (FIXED, verified in run 39367474752 screenshots):** both simulator screenshots of run 39364609792
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

Install `Harbor-iOS-unsigned-1e6a173f` on the iPhone (IOS_INSTALL.md, Signulous section), then
walk: onboarding → Home hero swipe → open a series → episode list → Play with a stream addon →
tap / double-tap gestures → rotate → Settings root + a page → Search tab → long-press a Continue
Watching card. Record results in the Verified section above and in IOS_FEATURE_MATRIX.md.

---

## Session 2 (2026-10-20): real-device fixes. Commit `c3feb442`

Owner tested the `1e6a173f` IPA on an iPhone and reported: stretched video strip in landscape,
details page wider than the screen, Settings back button under the clock, desktop PiP settings.

| Priority | Fix | Verified |
|---|---|---|
| 1 Video scaling | **Root cause:** `HarborVideoView.layoutSubviews` never updated `CAMetalLayer.drawableSize`; mpv's MoltenVK swapchain kept the portrait size and UIKit stretched it after rotation. drawableSize now tracks bounds × scale. `#root` drops notch insets while the player is open. Fit/Fill/Zoom/ratios via the aspect menu (always shown on iOS) + pinch out = fill, pinch in = fit. | Logic + Swift source test. **Device: pending.** |
| 2 Player | Playback cluster centred; menus not dropped by width; menus as bottom sheet / side panel; cast hidden (no iOS backend); iPhone volume = hardware buttons. | Browser preview (HTML5 engine, VP9 test video): portrait + landscape layout, subtitles sheet. mpv path: device pending. |
| 3 Auto-landscape | `HarborPresentation.swift`: requestGeometryUpdate(.landscape) on play (iPhone), restore on close, status bar + home indicator hidden, edge gestures deferred. `ios_player_presentation` command (vtable field `set_presentation`), plist VC-based status bar = true. | Device pending. |
| 4 Branding | Official icon made full-bleed (source had opaque white corners) as single-size AppIcon; launch screen = web boot splash (boat on #0a0a0a). `src-tauri/ios/Brand`, installed by prepare-xcode.mjs. | CI build pending. |
| 5 Overflow | LazyMount 48px bleed → iOS gutter (was +56px page width); Library tab strip scrolls in itself; hover edge arrows hidden. | Browser audit: Home, Discover, Library, movie + series details scrollWidth == 393. |
| 6 Swipe-back | `src/chrome/ios-swipe-back.tsx` + `src/lib/ios-gestures.ts`. | Synthetic touch tests in preview: commits, cancels, ignores mid-screen / vertical / root. |
| 7 Safe areas | Removed my earlier rule hiding empty drag-region strips (it hid Settings' safe-area spacer). Status bar scrim. Dev `&harbor-safe=59,34` fakes insets in the preview. | Audit with fake insets: nothing under the status bar on Home, Discover, Library, Search, Details, Settings root/page, Player. |
| 8 Desktop settings | Hidden on iOS only: PiP style, title bar, window moving/tray, separate mpv window, casting, Discord, SVP, BP monitor, updater. | Preview: PiP group gone on iOS; desktop unchanged. |

Tests: `tests/ios-mobile-ui.test.ts` (9 tests). `pnpm test`: 6052 pass / 106 fail, identical
failure set to baseline. Typecheck passes. Desktop preview unchanged.

CI: run [39376176469](https://github.com/1osamma/Harbor/actions/runs/39376176469) on `c3feb442`
was **in progress at hand-off**. The simulator job now captures per-scene screenshots
(`<device>-<n>-<scene>.png`: home, movie, series, long, settings, settings-page,
player-portrait, player-landscape) via `HARBOR_SCREENSHOT` (`src/lib/ios-screenshot-scene.tsx`).

### Next exact step
1. Check run 39376176469. If the Swift/Rust build failed, read the simulator job log first
   (new files: HarborPresentation.swift, vtable field `set_presentation`, `ios_screenshot_scene`).
2. Inspect the scene screenshots, then hand `Harbor-iOS-unsigned-c3feb442…` to the owner.
3. Device checks: landscape video fills correctly after rotation; auto-landscape on play and
   restore on close; status bar/home indicator hidden in the player; launch screen and icon.

### Known gaps
- Settings search can still list rows that are hidden on iOS (it opens their page).
- Native PiP with mpv still unimplemented (desktop PiP hidden on iOS).
- Subtitle rendering path (DOM vs libass for ASS/Arabic) unchanged from session 1; device test needed.

## Codex continuation (2026-10-20)

- Resumed the clean branch at `b8e99aa01`; preserved the implementation in `c3feb442d`.
  Run [39376176469](https://github.com/1osamma/Harbor/actions/runs/39376176469) completed with
  **both jobs successful**. The device build, IPA inspection and upload passed.
  [Unsigned IPA for c3feb442d](https://github.com/1osamma/Harbor/actions/runs/39376176469/artifacts/12244480662).
- Simulator logs confirm live processes after launch on iPhone 16 Pro and iPad Pro 13-inch M4,
  and capture/upload of 18 scene screenshots. **Visual review remains blocked**: the connector
  returned the ZIP, but the cloud network rejects its download host with HTTP 403. Do not infer
  safe-area correctness, video playback or landscape rotation from successful screenshot capture.
- Native review: the C/Rust vtable field order agrees; presentation uses the existing bridge;
  drawable dimensions follow bounds times scale. Found a handle lifetime race: the Swift lock
  was released before libmpv used the pointer, allowing concurrent stop to free it. The lock now
  covers API calls and event reads. Foreground recovery preserves `vid=no`, and stop clears the
  saved video track. Native compilation and runtime verification of these changes require CI;
  real-device playback, audio/subtitle switching and lifecycle stress still need an iPhone.
- Navigation: cancelled edge swipes no longer navigate. Adding a second finger cancels the
  gesture; pending animations/timers are cleaned up on unmount and cannot navigate afterwards.
- Settings search filters destinations already hidden on iOS (desktop window/PiP, SVP, casting,
  updater, Discord presence, monitor selection), retaining shared backup and privacy controls.
  Experimental installer controls are also excluded on iOS.
- CI smoke checks now fail for missing simulators, unsuccessful scene launches/captures, or a
  missing live process. Logs are collected on failure. Library and Search scenes are included.
- Local checks: 15 focused regression tests passed. Chromium at 393×852 exercised completed,
  cancelled and multi-touch swipes in Settings, and Home/Library/Search/Discover navigation;
  document width stayed at 393. Catalog requests failed under this environment's network setup,
  so these checks do not verify online catalog services. Browser emulation is not native WebKit.
- Required `pnpm run check` is blocked because the existing `vp` executable is absent;
  `pnpm tauri:build:linux-system` is blocked because Rust/cargo is not installed. These are
  environment limitations, not successful desktop native validation.
- Native mpv PiP, Dynamic Type and independent per-tab navigation stacks remain deferred.
  Physical-device scaling, rotation/restore, status bar/home indicator, ASS/Arabic subtitles,
  background audio and foreground recovery remain unverified.
- Additional browser checks: iOS Settings search excludes “Picture in picture style”, desktop
  search retains it, and both retain “Export everything”. Landscape Settings at 852×393 has
  no document overflow. Desktop Settings at 1440×1000 retains its sidebar and content layout.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm run typecheck`: passed. The initial attempt
  exhausted Node's default 2 GB heap; the 6 GB setting matches CI. Full-suite comparison is
  still running; the historical 106 failures are not being presented as a fresh result.
