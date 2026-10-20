# Harbor iOS — Known Issues and Limitations

## Platform blockers (cannot be fixed inside the app)

- **No subprocesses.** iOS forbids spawning executables, so every feature built on the bundled
  `ffmpeg`, `ffprobe` and `yt-dlp` sidecars is unavailable: seek thumbnails, DVR, GIF/clip export,
  subtitle extraction, subtitle auto-sync, yt-dlp trailers, transcoding for casting.
  Each could be reimplemented on top of the FFmpeg libraries already linked via MPVKit.
- **No self-update.** Updater is disabled. Install new IPAs through your sideloading service.
- **Background execution.** iOS suspends the app shortly after it leaves the foreground. Audio
  playback continues (UIBackgroundModes: audio); torrent downloads, the LAN server and
  downloads do not.
- **Sideloaded signing limits.** Free Apple IDs (AltStore/SideStore) expire apps after 7 days and
  allow 3 apps. Signulous and paid developer certificates last up to a year.
- **Desktop-only integrations:** Discord RPC, system tray, multiple windows, monitor selection,
  game launchers/emulators, NVIDIA RTX, SVP/VapourSynth.

## Not yet implemented on iOS

- **Compact iPhone layout.** iPhone runs the desktop shell scaled to a 960 px layout width.
- **Picture-in-Picture with the mpv engine.** Needs mpv frames rendered into an
  `AVSampleBufferDisplayLayer` for `AVPictureInPictureController`. PiP works with the HTML5 engine.
- **AirPlay video with the mpv engine.** Use the HTML5 engine for AirPlay video.
- **Music** (Spotify, YouTube Music, local library) — desktop-only Rust module set.
- **Chromecast, DLNA, Roku** — desktop-only modules; portable in principle.
- **Notifications** — plugin not registered in the mobile builder yet.
- **Keychain** — secrets live in a sandboxed file, not the Keychain.
- **Manga Android-extension layer (capstan)** — not in the repository; desktop-only.

## Unverified (needs a device)

Everything in IOS_FEATURE_MATRIX.md marked without a "Verified" entry. In particular HDR/EDR
output, Dolby Vision, AV1 performance, Anime4K performance, and audio track/route handling.

## Licensing notes

- MPVKit's `MPVKit` product (LGPL build of mpv and FFmpeg) is used, not `MPVKit-GPL`.
  LGPL requires that users can relink against a modified library; for a sideloaded,
  self-built IPA the source and build scripts in this repository satisfy that.
- Harbor itself is MIT.

## Build / tooling issues found so far

- pnpm 11 re-verifies dependencies when Xcode's "Build Rust Code" phase runs `pnpm tauri`, then
  aborts without a TTY. CI sets `verify-deps-before-run=false` globally. Local Mac builds need the
  same (`pnpm config set --location=global verify-deps-before-run false`).
- Upstream compiles `modal_overlay.rs` and `pip_window.rs` on every target, though they use
  desktop-only Tauri window APIs. They are now `cfg(desktop)`. Upstream's Android build
  presumably hits the same errors on `beta-branch`; that was not checked.
- Desktop Rust has not been recompiled after the iOS changes (no Rust toolchain on the dev
  machine). All changes are cfg-gated to be desktop-neutral, but a desktop `cargo check` is
  still owed.
- MoltenVK video output in the iOS **Simulator** may not render; judge playback on a device.

## Open at handoff (2026-10-20)

- **No downloadable IPA yet.** The device build succeeds (run 39347877439: `Harbor.ipa`, 173 MB),
  but the old `nm -gU` inspection failed on the stripped binary before the upload step. The fix
  (`strings` markers + unconditional upload, commit `00c8dfa3`) has not completed a run yet;
  run 39352217482 was cancelled.
- **Launch stops at Harbor's error view on iOS** ("Plugin window not initialized"): unhandled
  rejections from desktop `window` plugin calls. Commit `00c8dfa3` makes them non-fatal on
  mobile; unverified.
- `gilrs` reports "does not support current platform" at startup on iOS (logged, harmless).
