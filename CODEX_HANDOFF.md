# Harbor iOS — Handoff to Codex

Written 2026-10-20 at the end of Claude Code session 1. Read this file first, then
`IOS_BUILD_LOG.md` (every CI attempt and its root cause) and `IOS_FEATURE_MATRIX.md`.

> **Status in one line:** the iOS implementation is written, and the build has been fixed past
> every error found so far. **No IPA has been produced yet. Nothing has run on a simulator or a
> device.** No playback feature is verified. "Ported" in the docs means the code path exists, not
> that it works.

---

## 1. Project overview

### Objective (from the project owner)

Port Harbor (https://github.com/Harborofficial/Harbor), a Tauri 2 + React + Rust + libmpv Stremio
client for Windows/macOS/Linux, to a **real, standalone iPhone/iPad app**, packaged as an `.ipa`
that can be signed and sideloaded with Signulous, SideStore, AltStore etc. The rules:

- A real native app: not a PWA, a remote control, or a mock UI. It must run without a PC.
- Reuse Harbor's code (React/TS, Rust, Tauri) wherever practical; preserve the desktop app.
- Native iOS replacements for desktop-only parts, above all **libmpv playback** (MKV/MP4/WebM,
  H.264/HEVC/AV1, HDR, hardware decode, embedded + external SRT/ASS, custom fonts, Arabic/RTL,
  subtitle styling, audio tracks, delays, speed, chapters, resume, next episode, skip intro,
  PiP, AirPlay, Anime4K where feasible). AVPlayer only as a documented fallback.
- Preserve Harbor features: discovery (Cinemeta/TMDB), Stremio addons, stream ranking, debrid,
  Trakt/AniList/MAL/Simkl, profiles, Jellyfin/Plex/Emby, local files, downloads, live TV/EPG,
  watch parties, casting, themes, manga, etc., each one verified or documented as blocked.
- iPhone + iPad, portrait + landscape, safe areas, Harbor's design language and settings.
- No fake buttons or mock playback. Don't remove features just to make the build pass. Never
  hardcode keys, tokens or credentials. Never claim untested things work.
- Development happens **only in the fork** `1osamma/Harbor`, branch `feature/harbor-ios`.
  **Never push to Harborofficial/Harbor.**
- The owner is on Windows with no Mac. All iOS compilation happens on GitHub Actions macOS runners.
- Keep these files current so work can resume: `IOS_PORT_PLAN.md`, `IOS_FEATURE_MATRIX.md`,
  `IOS_PROGRESS.md`, `IOS_BUILD_LOG.md`, `IOS_KNOWN_ISSUES.md` (plus `IOS_INSTALL.md` and this file).

### Repository

| | |
|---|---|
| Fork | https://github.com/1osamma/Harbor |
| Branch | `feature/harbor-ios` |
| Base | upstream `beta-branch` @ `cd2a0aff` ("Release", 2026-10-18) |
| Upstream | https://github.com/Harborofficial/Harbor (read-only for us) |
| Latest code commit | `00c8dfa3` (docs-only commits on top); see §3 "Final state at handoff" |

Local clone (owner's machine): `E:\SteamLibrary\steamapps\common\harbor-ios`.
Remotes: `origin` = fork; `upstream` = Harborofficial/Harbor, with its **push URL deliberately set
to `DISABLED_no_push_to_upstream`**. Keep it that way.

### Architecture and strategy

1. **UI = Harbor's existing desktop shell** (`index.html` → `src/main.tsx` → `src/App.tsx`) in the
   iOS WKWebView. It's the only standalone, full-featured UI in the repo:
   - `src/views/mobile/*` is a *remote control* for a desktop host (needs a desktop over a
     WebSocket), so it can't serve as the app.
   - The Android TV "Big Picture" UI (`index-tv.html`) is a 10-foot d-pad UI.
   - The desktop shell needs ≥960 CSS px. iPads get native width. On iPhone,
     `src/lib/ios-shell.ts` widens the layout viewport to 960 and lets WebKit scale it.
2. **Native runtime = Harbor's existing mobile builder.** `src-tauri/src/mobile.rs` (written
   upstream for Android TV, `cfg(mobile)`) is shared with iOS. Its command list sits in a
   `macro_rules!` (`mobile_handler_with!`) so iOS can add commands without duplicating the list.
   ~60 desktop modules stay `#[cfg(desktop)]` and don't compile on iOS.
3. **Playback = libmpv on iOS behind the *same* Tauri command surface as desktop.**
   - The frontend's mpv bridge `src/lib/player/mpv.ts` (1.7k lines) is shared and unchanged
     except for `isIos()` checks. It calls `mpv_start`, `mpv_command`, `mpv_set_property`,
     `mpv_get_property`, `mpv_sub_add`, `mpv_set_geometry`, `mpv_stop` …, and listens for
     `mpv://event`.
   - `src-tauri/src/mpv_ios.rs` implements those commands for iOS, with the same argument
     shapes, the same option policy (cache, subtitle, HDR, header handling copied from desktop
     `mpv.rs`), the same command allow-list and property block-list, and the same event payloads.
   - `src-tauri/ios/Sources/HarborMpvPlayer.swift` is a thin libmpv wrapper (MPVKit's `Libmpv`
     module). It owns the `mpv_handle` and a `CAMetalLayer` view inserted **below** the WKWebView,
     and makes the webview transparent. Options: `vo=gpu-next`, `gpu-api=vulkan`,
     `gpu-context=moltenvk`, `hwdec=videotoolbox`. It also runs the event loop (JSON payloads
     back to Rust), EDR toggling for PQ/HLG, `vid=no` in background, and the AVAudioSession
     `.playback` category.
   - `src-tauri/ios/Sources/HarborMpvBootstrap.c` builds a C function-pointer table
     (`HarborMpvVtable`) from Swift `@_cdecl` functions and hands it to Rust
     (`harbor_mpv_ios_register`) from an `__attribute__((constructor))`. **Why:** the Rust crate is
     `crate-type = ["staticlib","cdylib","rlib"]`, so a cdylib is also linked for iOS. A Rust
     `extern "C"` reference to a Swift symbol would be unresolved in that cdylib link. With
     function pointers, neither link has unresolved symbols. Swift → Rust events go through
     `harbor_mpv_ios_emit` (`@_silgen_name`), which resolves inside the app binary.
   - Embed mode (video under a transparent page, chrome as DOM) is forced on iOS, the same
     arrangement desktop uses on macOS. HTML5 `<video>` stays as the fallback engine and is what
     gives PiP/AirPlay today.
4. **Xcode project is generated in CI, not committed** (`src-tauri/gen/` is gitignored upstream).
   `pnpm tauri ios init --ci` generates it. `scripts/ios/prepare-xcode.mjs` then:
   - copies `src-tauri/ios/Sources/*` into `gen/apple/Sources/harbor/harbor-native/`,
   - adds the MPVKit SPM package (`https://github.com/mpvkit/MPVKit`, exactVersion **1.0.0**,
     product `MPVKit`, the LGPL build) to `project.yml`,
   - sets `SWIFT_VERSION`,
   - reruns `xcodegen`.
5. **Unsigned IPA:** `pnpm tauri ios build --ci --no-sign --target aarch64`. `--no-sign` exists
   from Tauri CLI 2.11, which is why the lockfile was bumped from 2.10.1 to **2.12.3**. It archives
   without signing and zips `Payload/Harbor.app`.

---

## 2. Completed work

Commits on `feature/harbor-ios` (oldest first):

| SHA | Summary |
|---|---|
| `1e281631` | iOS foundation, native libmpv player, IPA workflow, docs |
| `2b148a5d` | workflow comment (dispatch only works from default branch) |
| `40b523bc` | CI: stop pnpm re-installing deps inside the Xcode build phase |
| `70a74fd3` | CI: drop a pnpm key that pnpm 11 global config rejects |
| `d7bc3823` | `modal_overlay` and `pip_window` compiled on desktop only (first successful simulator build, run 4) |
| `00c8dfa3` | error-view ignores missing desktop capabilities on mobile; IPA inspection by `strings`; upload IPA even if inspection fails (unverified: run 5 cancelled) |
| (top) | handoff documentation only |

### Files created

| File | Purpose |
|---|---|
| `src-tauri/src/mpv_ios.rs` | iOS mpv command surface + vtable FFI + `mpv://event` emitter (log lines scrubbed with `log_privacy::scrub`). |
| `src-tauri/ios/Sources/HarborMpvPlayer.swift` | libmpv handle, Metal video view, event loop, node→JSON, EDR, lifecycle, audio session. |
| `src-tauri/ios/Sources/HarborMpvBootstrap.c` | Function-pointer table, registered before `main`. The layout must match `HarborMpvVtable` in `mpv_ios.rs` field for field. |
| `src-tauri/tauri.ios.conf.json` | iOS overlay: `beforeBuildCommand: pnpm build:ios`, visible window, no externalBin/file associations, drops capstan + pokemon-engine resources, iOS 16.0 minimum, updater off. |
| `src-tauri/Info.ios.plist` | Merged by the Tauri CLI. ATS arbitrary loads (addons/proxy are often plain http), local network + Bonjour, mic/photo strings, `UIBackgroundModes: audio`, Files-app sharing, `harbor://` + `stremio://` URL schemes, orientations, status bar. |
| `src/lib/ios-shell.ts` | iOS viewport (960 px minimum layout width on iPhone, recomputed on rotation), tap highlight/callout off. |
| `scripts/ios/prepare-xcode.mjs` | Patches the generated Xcode project (see §1.4). Idempotent. |
| `.github/workflows/ios-build.yml` | Two jobs: unsigned IPA, and a simulator build + launch screenshots (iPhone 16 Pro, iPad Pro 13" M4). |
| `IOS_*.md`, `CODEX_HANDOFF.md` | Tracking docs. `.gitignore` gained `!/IOS_*.md`. Upstream ignores `*.md`; `CODEX_HANDOFF.md` is force-added. |

### Files modified

| File | Change |
|---|---|
| `src-tauri/src/lib.rs` | `mod mpv_ios` (`cfg(target_os="ios")`). `anime4k`, `shaders` → `cfg(any(desktop, target_os="ios"))`. `modal_overlay`, `pip_window` → `cfg(desktop)`. |
| `src-tauri/src/mobile.rs` | Command list moved into `mobile_handler_with!`. iOS adds 17 `mpv_*` commands + `anime4k_dir/download`, `shader_dir/download`, `streams::resolve_playback_redirect`. `mpv_ios::init(app.handle())` in setup on iOS. Android's list is unchanged. |
| `src/lib/platform.ts` | `OsClass` gains `"ios"`; `isIos()`; `hasDesktopWindow()` (windows/macos/linux). |
| `src/chrome/hybrid-title-bar.tsx`, `window-controls.tsx`, `window-resize-edges.tsx` | Render nothing when `!hasDesktopWindow()`. |
| `src/index.css` | `html[data-os="ios"] #root` fixed and inset by `env(safe-area-inset-*)`, `contain: layout`, so fixed descendants stay inside the safe area. |
| `src/main.tsx` | Calls `initIosShell()` after `applyOsDataset()`. |
| `src/views/player/hooks/use-player-bridge.ts`, `use-mpv-embed.ts`, `player-utils.ts` | Embed mode always on for iOS; transparent webview; stage background cleared when a frame exists. |
| `src/lib/player/mpv.ts` | `target-colorspace-hint` also on iOS when HDR→SDR is off. |
| `src/components/error-view.tsx` | `isNoisyError` ignores `plugin … not initialized` / `command … not found` rejections when `!hasDesktopWindow()` in a Tauri runtime. |
| `package.json` / `pnpm-lock.yaml` | Scripts `build:ios`, `ios:init`, `ios:build`; `@tauri-apps/cli` ^2.12.3. |

Desktop safety: every Rust change is iOS-gated or `cfg(desktop)` (identical on desktop), and every
TS change is behind `isIos()` or `hasDesktopWindow()` (true on all desktop OSes).
`pnpm test` gives the same 6043 pass / 106 fail as unmodified upstream (the 106 failures are
pre-existing upstream). **Desktop Rust was not compiled after these changes.** There is no Rust
toolchain on the owner's machine, and CI has no desktop job on this branch.

---

## 3. Current build state

See the "Final state at handoff" block at the bottom of this section (filled in last) for the
latest run.

History (details in `IOS_BUILD_LOG.md`):

1. **Run 39344058176:** "Build Rust Code" Xcode phase failed. pnpm 11, invoked by
   `tauri ios xcode-script` inside Xcode, re-verified deps and aborted with
   `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Fix: workflow step
   `pnpm config set --location=global verify-deps-before-run false`.
   This run also proved that `tauri ios init`, `prepare-xcode.mjs`, MPVKit package resolution and
   the MPVKit framework embedding/codesign all work.
2. **Run 39345352304:** `pnpm config set --location=global confirm-modules-purge false` is
   rejected by pnpm 11 (`ERR_PNPM_CONFIG_SET_UNSUPPORTED_YAML_CONFIG_KEY`). Removed.
3. **Run 39345684445:** **all ~600 Rust dependencies compiled for `aarch64-apple-ios-sim`**
   (librqbit, ring, rustls, unrar_sys, mdns-sd, axum, gilrs, harbor-core …). 3 errors in Harbor:
   `modal_overlay.rs:81 always_on_top`, `pip_window.rs:165 decorations`,
   `pip_window.rs:299 unminimize` (desktop-only Tauri APIs in ungated modules). Fixed in `d7bc3823`.
4. **Run 39347877439:** result below.

Dependencies installed by the workflow: Xcode (newest on `macos-15`; run 1 used **Xcode 26.3,
iPhoneSimulator 26.2 SDK**), Rust stable + `aarch64-apple-ios`, `aarch64-apple-ios-sim`, Node 22,
pnpm 11.9.0 (from `packageManager`), xcodegen (brew), and MPVKit 1.0.0 via SPM (downloads ~30
xcframeworks from MPVKit's GitHub releases).

IPA artifact: once the device job is green, look for an artifact named
`Harbor-iOS-unsigned-<sha>` on the run page. The simulator job uploads
`Harbor-iOS-simulator-<sha>` (screenshots + log).

5. **Run 39347877439 (commit `d7bc3823`)**, the last *completed* run:
   - **iOS Simulator build + launch smoke test: SUCCESS.** Frontend, Rust, Swift and MPVKit
     compiled and linked for `aarch64-apple-ios-sim`. The app installed and launched on the
     iPhone 16 Pro and iPad Pro 13" (M4) simulators and was still running after 45 s. Harbor's
     React UI rendered inside the safe area (artifact `Harbor-iOS-simulator-d7bc3823…`).
     **But** both screenshots show Harbor's full-screen error view, *"Plugin window not
     initialized"*. `src/components/error-view.tsx` shows a fatal error for *any* unhandled
     promise rejection, and the desktop shell makes many fire-and-forget calls into Tauri's
     desktop `window` plugin, which doesn't exist on iOS.
   - **iOS device build (unsigned IPA): FAILED at the "Inspect IPA" step, *after* a successful
     build.** `pnpm tauri ios build --ci --no-sign --target aarch64` produced
     `src-tauri/gen/apple/build/arm64/Harbor.ipa` (173,005,382 bytes; `app.harbor`, version
     1.0.0, MinimumOSVersion 16.0, arm64). My verification step then ran
     `nm -gU <binary> | grep …`. Release executables are stripped of exported symbols, so it
     found nothing and exited 1. That is a false negative in the check, not a build failure.
     Because the upload step came after it, **no IPA artifact was uploaded**.
6. **Run 39352217482 (commit `00c8dfa3`): CANCELLED after ~4 min**, during "Typecheck" (device)
   and "Build for simulator" (simulator). Nothing was built. No newer push caused it, and the
   reason was not investigated (the owner stopped development at this point). Commit
   `00c8dfa3` holds the two fixes for run 4's problems, **neither verified**:
   - `error-view.tsx`: on platforms without a desktop window, rejections whose message is
     `plugin … not initialized` or `command … not found` are not shown as fatal.
   - `ios-build.yml`: "Inspect IPA" checks for strings from each layer with `strings -a`
     (`embedded libmpv (MPVKit)`, `app.harbor.mpv.events`, `mplayer2 projects`,
     `libavformat license`) instead of `nm -gU`. "Upload IPA" now has
     `if: always() && steps.ipa.outputs.path != ''`.

### Final state at handoff

| | |
|---|---|
| Latest code commit | `00c8dfa3f7d4992e1ab34e822f59c1c5497784f1` (handoff docs are committed on top of it; docs-only commits don't trigger CI) |
| Latest CI run | https://github.com/1osamma/Harbor/actions/runs/39352217482: **cancelled**, nothing built |
| Last completed run | https://github.com/1osamma/Harbor/actions/runs/39347877439: simulator **success**, device **failure (inspection only)** |
| Simulator | Builds, installs and launches on iPhone + iPad simulators. UI stops at the error view (fix pending verification). |
| Device IPA | Builds (173 MB, arm64). **No artifact uploaded yet**: the inspection false negative blocked the upload. |
| IPA artifact | none yet. After the next green run: artifact `Harbor-iOS-unsigned-<sha>` on the run page. |
| Exact blocker | (1) No run has completed with the `00c8dfa3` workflow fix, so no IPA is downloadable. (2) It's unconfirmed whether the `error-view.tsx` fix lets the shell render past the error screen; more desktop-only calls may surface. |
| Real-device testing | none |
| Playback testing | none (simulator screenshots show only the error view) |

---

## 4. Remaining work (prioritised)

1. **Get a completed green run on `00c8dfa3`** (or later): the device job uploads
   `Harbor-iOS-unsigned-<sha>` and the "Inspect IPA" markers are found. Rust/Swift compile and
   link are **already solved**. Run 4 built both the simulator app and a 173 MB device IPA, so
   what remains is the inspection/upload step and confirming it.
   - If a marker is missing, check whether it's really absent (e.g. the Swift queue label or
     the Rust string was optimised out) before assuming the code isn't linked. Relax or replace
     that one marker; don't drop the check.
   - `@_silgen_name("harbor_mpv_ios_emit")` relies on Swift and C calling conventions matching
     for a single pointer argument. If events don't arrive at runtime, replace it with a C shim
     in `HarborMpvBootstrap.c`.
2. **Get the simulator past the error screen.** Run 4's screenshots show "Plugin window not
   initialized". `00c8dfa3` stops such rejections from being fatal on mobile; confirm with the
   new screenshots. If another error view appears, fix that call site (gate desktop-only calls
   behind `hasDesktopWindow()`) rather than widening the filter further.
   - Caveat: MoltenVK/Metal video in the iOS **simulator** may not render. Judge playback on a
     device only.
3. **Device test by the owner** (sideload via `IOS_INSTALL.md`): playback of MKV H.264/HEVC,
   ASS + Arabic subtitles, audio tracks, seek, resume, rotate, background audio, HDR on an HDR
   iPhone. Record the results in `IOS_FEATURE_MATRIX.md`'s Verified column.
4. **Playback correctness review** of `mpv_ios.rs` against desktop behaviour:
   - `mpv_get_property` reply flattening (desktop reads strings and re-parses numbers).
   - `mpv_set_geometry` mapping CSS px → UIKit points, with `adjustedContentInset`.
   - Embed-mode DOM subtitles vs libass rendering. Desktop sets `sub-visibility=no` in embed mode
     and Harbor draws text subtitles in the DOM. Decide whether iOS should let libass render
     ASS styling instead.
5. **Compact iPhone layout.** Scaled 960 px is functional but small in portrait.
6. **mpv PiP:** render to `AVSampleBufferDisplayLayer` + `AVPictureInPictureController`.
   **AirPlay video with mpv:** needs AVPlayer handoff.
7. **Port portable desktop commands to iOS:**
   - `compute_moviehash` (`subsync/moviehash.rs`)
   - Chromecast (`cast.rs`, mdns-sd already compiles on iOS)
   - DLNA
   - notifications (`tauri-plugin-notification` is a dependency but not registered in
     `mobile.rs`)
   - Keychain-backed `secrets_*`
8. **ffmpeg-sidecar features** (thumbnails, subtitle extract, DVR, GIF/clip, trailers via yt-dlp)
   are blocked by "no subprocesses on iOS". Reimplementing them on the FFmpeg libs already
   linked via MPVKit is the possible route.
9. **Blocked by platform** (documented in `IOS_KNOWN_ISSUES.md`): updater, tray/multi-window,
   Discord RPC, games, SVP/RTX, Spotify/music module set (desktop-only, large), capstan manga
   extensions (not in the repo).
10. **Desktop regression check:** add a CI job (or run locally) for
    `cargo check --manifest-path src-tauri/Cargo.toml` on macOS/Windows for the desktop target, to
    prove the cfg changes are desktop-neutral.

---

## 5. Development environment

| Tool | Version / requirement |
|---|---|
| Node.js | 22 in CI (`actions/setup-node`). Owner's PC has 24.20. |
| pnpm | **11.9.0** (`packageManager` field). In CI, set `verify-deps-before-run=false` globally. |
| Tauri | crate `tauri` 2.12.0, `tauri-build` 2.7.0, **`@tauri-apps/cli` 2.12.3** (≥2.11 needed for `--no-sign`) |
| Rust | stable; targets `aarch64-apple-ios` (device), `aarch64-apple-ios-sim` (simulator) |
| Xcode | newest on `macos-15` runner (26.3 at the time); iOS deployment target 16.0 |
| xcodegen | brew (`tauri ios init` needs it) |
| Swift deps | MPVKit **1.0.0**, product `MPVKit` (LGPL): Libmpv, FFmpeg 7/8 libs, libass, libplacebo, MoltenVK, dav1d, libdovi, gnutls … (all binary xcframeworks) |
| Bundle id | `app.harbor` (from `tauri.conf.json` `identifier`) |

**Secrets / signing:** none are used. The IPA is unsigned by design, and users sign it with their own
certificate in Signulous/SideStore/AltStore. If a signed CI build is ever wanted, Tauri reads
`APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_PATH` (or a certificate + provisioning profile
via `IOS_CERTIFICATE`, `IOS_CERTIFICATE_PASSWORD`, `IOS_MOBILE_PROVISION`, plus
`APPLE_DEVELOPMENT_TEAM`) as GitHub secrets. These names are checked against tauri-cli 2.12.3.
Never commit them. The GitHub CLI on the owner's machine is logged in as `1osamma` with `repo` and
`workflow` scopes, and Actions is enabled on the fork.

**Local checks available on Windows:** `pnpm run typecheck` (passes) and `pnpm test` (baseline:
106 pre-existing failures, compare against that, not against zero). `pnpm run check` needs `vp`,
which is not installed in this repo. No Rust or iOS compile is possible locally.

---

## 6. Instructions for Codex

### Exact next task

**Re-run `ios-build` on the current `feature/harbor-ios` head (`00c8dfa3` + docs) and get both
jobs green.** Either push a commit that touches a non-`.md` file, or make the workflow
dispatchable (see below).

1. Device job: "Inspect IPA" must find its four `strings` markers (arm64,
   `embedded libmpv (MPVKit)`, `app.harbor.mpv.events`, `mplayer2 projects`,
   `libavformat license`), and `Harbor-iOS-unsigned-<sha>` must be uploaded. That is the first
   downloadable IPA.
2. Simulator job: the new screenshots must show Harbor's shell (home screen or onboarding), not
   the "Oops… Plugin window not initialized" error view.

Then hand the IPA to the owner for a device test (`IOS_INSTALL.md`).

### Relevant files

- Rust: `src-tauri/src/mpv_ios.rs`, `src-tauri/src/mobile.rs`, `src-tauri/src/lib.rs`
  (module gating), `src-tauri/Cargo.toml` (mobile/desktop dependency split; don't write
  `cfg(desktop)` there, Cargo can't see that alias. Spell out `target_os`.)
- Swift/C: `src-tauri/ios/Sources/HarborMpvPlayer.swift`, `HarborMpvBootstrap.c`
- Xcode patching: `scripts/ios/prepare-xcode.mjs`
- Config: `src-tauri/tauri.ios.conf.json`, `src-tauri/Info.ios.plist`
- CI: `.github/workflows/ios-build.yml`
- Frontend: `src/lib/platform.ts`, `src/lib/ios-shell.ts`, `src/lib/player/mpv.ts`,
  `src/views/player/hooks/use-player-bridge.ts`
- Desktop reference for behaviour: `src-tauri/src/mpv.rs` (do not change it for iOS)

### Reproduce the latest error

```sh
gh run list -R 1osamma/Harbor --workflow ios-build.yml --limit 3
gh run view <run-id> -R 1osamma/Harbor --json jobs --jq '.jobs[] | .name+" "+(.conclusion//.status)'
# logs are only downloadable after the whole run finishes:
gh api --allow-escape-sequences repos/1osamma/Harbor/actions/jobs/<job-id>/logs \
  | sed 's/\x1b\[[0-9;]*m//g' > job.log
grep -nE 'error(\[E[0-9]+\])?:|error: could not compile|\*\* BUILD FAILED|Undefined symbols|ERR_PNPM' job.log
```

The simulator job fails faster than the device job (no archive step), so read it first.
Rust errors appear inside the Xcode "Build Rust Code" phase output.

### Validate a fix

1. Locally (Windows): `pnpm run typecheck` for TS changes; `pnpm test` should still show 106
   failures, the same names as baseline.
2. Push to `feature/harbor-ios`. The push triggers `ios-build` (`*.md`-only changes are ignored by
   `paths-ignore`). A new push cancels the in-flight run (`concurrency`).
3. Watch the run; read the simulator job log first.
4. Record every attempt in `IOS_BUILD_LOG.md`: date, run, result, root cause, fix.

### Commit / push / CI

```sh
git checkout feature/harbor-ios
git commit -am "fix(ios): <what and why>"   # end messages with your own attribution line
git push origin feature/harbor-ios          # never `upstream`
```

`workflow_dispatch` ("Run workflow" button) only works once the workflow file exists on the fork's
default branch (`beta-branch`). Until then, trigger by pushing.

### Approaches that failed, or must not be used

- **Don't** call Swift symbols directly from Rust via `extern "C"`: the iOS cdylib link fails.
  Use the vtable.
- **Don't** link libmpv into Rust (`libmpv2`/`libmpv2-sys` on iOS). Its build script emits
  `-lmpv`, which breaks the cdylib link, and desktop `mpv.rs` is full of window-handle code.
  That's why `mpv_ios.rs` exists.
- **Don't** commit `src-tauri/gen/apple`. It's generated in CI; customise via
  `prepare-xcode.mjs`, `tauri.ios.conf.json` and `Info.ios.plist`.
- **Don't** run `xcodebuild` directly for the Rust phase. `tauri ios xcode-script` needs a running
  `tauri ios build/dev` (options server, token-authenticated since CLI 2.12). Always go through
  `pnpm tauri ios build`.
- `pnpm config set --location=global confirm-modules-purge` is rejected by pnpm 11. Only
  `verify-deps-before-run=false` is needed.
- **Don't** use `src/views/mobile` as the iOS UI. It's a remote that needs a desktop host.
- **Don't** downgrade `@tauri-apps/cli` below 2.11 (`--no-sign` disappears).
- **Don't** "fix" a compile error by deleting a feature: gate desktop-only code with
  `#[cfg(desktop)]` and document the gap in `IOS_FEATURE_MATRIX.md`.
- **Never push to upstream** (`Harborofficial/Harbor`); the local `upstream` remote has a disabled
  push URL on purpose.
