# Harbor for iOS — Build, Sign and Install

The CI builds an **unsigned** `.ipa`. iOS will not run unsigned apps, so you sign it with your own
certificate through a sideloading service. No Apple credentials are stored in this repository or
its workflows.

## Current test build (2026-10-20)

[Download Harbor-iOS-unsigned-00c8dfa3](https://github.com/1osamma/Harbor/actions/runs/39352217482/artifacts/12236388185) and extract `Harbor.ipa` from the artifact ZIP.
GitHub sign-in may be required. Artifact expires 2026-11-19.
The IPA is 173,005,084 bytes, arm64, `app.harbor`, version 1.0.0, iOS 16.0+.

This artifact uploaded successfully despite a failed content-marker inspection
(`libavformat license` was not found). Rust, Swift and mpv markers were found.
Simulator build/install/launch passed, but screenshot contents have not been visually verified
in this continuation. Real-device behavior and playback are untested. CI debugging stopped
when the IPA uploaded, as requested.

## 1. Get the IPA

1. Open your fork on GitHub → **Actions** → **ios-build**.
   (First time only: on a fork, click **"I understand my workflows, go ahead and enable them"**.)
2. Either push to `feature/harbor-ios`, or click **Run workflow** and pick that branch.
3. When the **iOS device build (unsigned IPA)** job is green, open the run and download the artifact
   **`Harbor-iOS-unsigned-<commit>`**. It is a zip that contains `Harbor.ipa`; unzip it.

The **iOS Simulator build + launch smoke test** job uploads screenshots of the app starting on an
iPhone and an iPad simulator, plus the app's log. That is a quick way to see a build boots before
you install it.

## 2. Sign and install with Signulous

1. Sign in at signulous.com and register your device's UDID (Signulous walks you through it; it
   installs a profile on the iPhone/iPad).
2. In the dashboard choose **Upload / Sign app** (wording varies) and upload `Harbor.ipa`.
3. Keep the bundle identifier (`app.harbor`) unless you already have another app with it.
4. When signing finishes, open the install link **on the device** in Safari and tap **Install**.
5. On iOS 16+: Settings → Privacy & Security → **Developer Mode** → on (restart required),
   if iOS asks for it.
6. The first launch asks for **Local Network** access. Allow it if you use Jellyfin/Plex/Emby on
   your LAN, casting, or the torrent engine's local stream server.

### Other signers

- **SideStore / AltStore:** open the app on the device, **+**, pick `Harbor.ipa`. Free Apple IDs
  expire the install after 7 days; refresh it in SideStore/AltStore.
- **Sideloadly / Xcode (on a Mac):** sign with your Apple ID or developer certificate.
- **Your own certificate:** `zsign` or `codesign` with a provisioning profile that includes the
  device; re-sign `Payload/Harbor.app` and zip it again.

## 3. Updating

There is no in-app updater on iOS. Download a newer IPA and sign/install it the same way; with the
same bundle identifier and signing team, iOS keeps your data.

## 4. Building it yourself

You need a Mac with Xcode 16+ (or use the workflow).

```sh
pnpm install --frozen-lockfile
pnpm run setup:fonts
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
brew install xcodegen
pnpm tauri ios init --ci
node scripts/ios/prepare-xcode.mjs
pnpm tauri ios build --no-sign --target aarch64      # unsigned IPA
# or: pnpm tauri ios dev                               # simulator / device with your team
```

The IPA lands in `src-tauri/gen/apple/build/arm64/`.

## 5. Real-device test checklist

Record the device model, iOS version, build SHA (`00c8dfa3`), and pass/fail for each test.
Do not send credentials or private stream URLs with reports.

1. Launch Harbor and confirm home/onboarding appears without "Plugin window not initialized".
   Complete onboarding; close and reopen the app to check settings persistence.
2. Check navigation, safe areas, portrait/landscape rotation, and touch targets on your device.
3. With known accessible test media, test MP4 and MKV H.264/HEVC using the native mpv engine.
   Confirm picture and sound, pause/play, seeking, chapters, and resume after reopening.
4. Switch audio tracks; test volume, playback speed, audio/subtitle delay, and next episode.
5. Test embedded and external SRT/ASS subtitles, Arabic/RTL, styling, and custom fonts.
6. Test rotation during playback, background/lock-screen audio, then foreground recovery.
7. On supported hardware, separately test HDR/HEVC, AV1, and Anime4K; report heat or stutter.
8. If needed, test addon installation, search, debrid, and LAN media-server access separately.
   Test HTML5 PiP/AirPlay separately from mpv; native mpv PiP/video AirPlay is not implemented.

For a failure, record the exact message, reproduction steps, media container/codecs, engine,
and a screenshot. These are test requests, not claims that the features work.
