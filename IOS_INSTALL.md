# Harbor for iOS — Build, Sign and Install

The CI builds an **unsigned** `.ipa`. iOS will not run unsigned apps, so you sign it with your own
certificate through a sideloading service. No Apple credentials are stored in this repository or
its workflows.

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
