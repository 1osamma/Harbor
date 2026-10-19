# Harbor iOS — Progress Log

Newest first. Each entry says what was done and how it was checked.

## 2026-10-20 — Session 1

Environment: Windows 11, no Mac. Installed GitHub CLI 2.102, Node 24.20, pnpm 11.9.0.
Rust is not installed locally; iOS Rust can only be compiled on the macOS CI runner.

Done:
- Cloned upstream, created `feature/harbor-ios` from `beta-branch` @ `cd2a0aff`.
  The `upstream` remote's push URL is set to an invalid value so nothing can be pushed there.
- Audit of the repository; findings in IOS_PORT_PLAN.md and IOS_FEATURE_MATRIX.md.
- Rust: `mpv_ios.rs` (iOS libmpv command surface), mobile builder shared by Android and iOS with
  iOS extras, `anime4k`/`shaders` enabled on iOS.
- Swift/C: `src-tauri/ios/Sources/HarborMpvPlayer.swift`, `HarborMpvBootstrap.c`.
- Frontend: `isIos()`, `hasDesktopWindow()`, embed mode forced on iOS, window chrome hidden,
  iOS viewport scaling and safe-area insets.
- Config: `tauri.ios.conf.json`, `Info.ios.plist`, `build:ios` script, Tauri CLI 2.10.1 → 2.12.3.
- CI: `.github/workflows/ios-build.yml` (unsigned IPA job + simulator smoke-test job),
  `scripts/ios/prepare-xcode.mjs`.

Checked locally:
- `pnpm run typecheck` — passes.

Not yet checked:
- Any Rust/Swift compile for iOS (needs the CI run).
- Anything at runtime.
