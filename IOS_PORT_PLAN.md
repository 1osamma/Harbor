# Harbor iOS — Port Plan

Branch: `feature/harbor-ios` (in the user's fork, never pushed upstream).
Base: upstream `beta-branch` @ `cd2a0aff` (2026-10-18, Harbor 1.0.0 beta).

## Audit summary (what Harbor is, and what iOS can reuse)

| Layer | Upstream | iOS reuse |
|---|---|---|
| UI | React 19 + TypeScript (~1.08M lines, `src/`), Vite 7, Tailwind 4 | **Full reuse.** The desktop shell (`index.html` → `src/main.tsx` → `App.tsx`) runs in WKWebView. |
| Native shell | Tauri 2.12 (`src-tauri/`), Rust | **Reuse.** Tauri 2 supports iOS. Harbor already has a separate mobile builder (`src-tauri/src/mobile.rs`, written for Android TV) behind `cfg(mobile)`; iOS uses it. |
| Desktop-only Rust | ~60 modules behind `#[cfg(desktop)]` (windows, tray, libmpv, ffmpeg sidecars, games, Spotify, Discord, DLNA, casting…) | Not compiled on iOS. Selected self-contained ones are enabled for iOS (`anime4k`, `shaders`). |
| Stream logic | `harbor-core` (Rust parsing/ranking), Stremio addon protocol in TS | **Full reuse** (compiles on mobile, used by Android today). |
| Torrent engine | `librqbit` + localhost stream server | **Reuse** (already mobile-gated for Android). |
| Playback | libmpv on desktop via `libmpv2` crate (`mpv.rs`, 3.7k lines), HTML5 fallback | **Replaced natively:** MPVKit (libmpv + FFmpeg + libass + MoltenVK for iOS) + a thin Swift layer, exposing the *same* `mpv_*` Tauri commands, so the shared `src/lib/player/mpv.ts` bridge runs unchanged. HTML5 (`<video>` in WKWebView = AVFoundation) remains the fallback engine and gives PiP/AirPlay. |
| Existing mobile code | Android TV build (`tauri.android.conf.json`, `index-tv.html`, Big Picture UI); phone "remote" UI (`src/views/mobile`) that drives a desktop | Android runtime path reused. Phone remote UI is *not* standalone (needs a desktop host), so it is not the iOS UI. |
| CI | Windows/macOS desktop workflows | New `.github/workflows/ios-build.yml`. |

## Architecture decisions

1. **UI = the desktop shell.** It is the only standalone, full-feature UI. It needs ≥960 CSS px;
   iPads meet that at device width. On iPhone the layout viewport is widened to 960 and scaled
   (`src/lib/ios-shell.ts`) — correct but small, best in landscape. A dedicated compact phone
   layout is a later phase (see IOS_KNOWN_ISSUES.md).
2. **Playback = libmpv, same command surface as desktop.**
   - `src-tauri/src/mpv_ios.rs`: `mpv_probe/start/command/set_property/get_property/sub_add/…`,
     same option policy and allow/block lists as desktop `mpv.rs`, same `mpv://event` payloads.
   - `src-tauri/ios/Sources/HarborMpvPlayer.swift`: owns the mpv handle, a `CAMetalLayer` view
     inserted *below* the transparent WKWebView (`vo=gpu-next`, `gpu-api=vulkan`,
     `gpu-context=moltenvk`, `hwdec=videotoolbox`), event loop, EDR toggling, background handling,
     audio session.
   - `src-tauri/ios/Sources/HarborMpvBootstrap.c`: hands Swift function pointers to Rust at
     process start. Needed because the Rust crate is also linked as a cdylib, where direct
     references to Swift symbols would be unresolved.
   - Frontend: `isIos()` forces embed mode (video under a transparent page, chrome as DOM), the
     same arrangement macOS uses.
3. **Xcode project is generated in CI** (`tauri ios init`), then patched by
   `scripts/ios/prepare-xcode.mjs` (adds MPVKit SPM package + native sources, reruns xcodegen).
   Nothing in `gen/apple` is committed.
4. **Unsigned IPA.** `tauri ios build --no-sign` (Tauri CLI ≥ 2.11; lockfile bumped to 2.12.3)
   archives without signing and packs `Payload/Harbor.app` into an `.ipa`. Sideloading services
   re-sign it with the user's certificate.
5. **Desktop is untouched in behaviour.** Every Rust change is `cfg(target_os = "ios")` or
   `cfg(any(desktop, target_os = "ios"))`; every TS change is behind `isIos()` / `hasDesktopWindow()`
   (which is true on all desktop OSes).

## Phases

- [x] Phase 1 — audit, compatibility matrix (IOS_FEATURE_MATRIX.md)
- [~] Phase 2 — iOS foundation: config overlay, Info.plist, safe areas, chrome gating, viewport
- [~] Phase 3 — native libmpv player through the existing bridge
- [ ] Phase 4 — feature verification on simulator/device; iOS-specific fixes
- [~] Phase 5 — IPA pipeline (workflow runs; Xcode project generation, MPVKit resolution and all Rust dependencies build for iOS; Harbor crate fixes in progress — see IOS_BUILD_LOG.md)
- [ ] Phase 6 — testing matrix filled with real results
- [ ] Phase 7 — delivery docs (IOS_INSTALL.md written; artifact link pending)

## Next steps (in order)

1. Finish CI: remaining Harbor-crate Rust errors, then Swift compile and link (see CODEX_HANDOFF.md §6).
2. Simulator launch screenshots (iPhone + iPad) → fix boot/layout problems.
3. Physical-device playback test by the user (MKV/HEVC/ASS/Arabic subtitles).
4. Port further portable desktop commands to iOS (moviehash, subtitle sync, DLNA discovery).
5. Compact iPhone layout.
6. Native AVPictureInPicture for the mpv engine (needs sample-buffer rendering).

## Handoff

Development moves to OpenAI Codex after session 1. `CODEX_HANDOFF.md` is the starting point.
