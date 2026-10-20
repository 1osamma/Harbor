# Harbor iOS — Progress Log

Newest first. Each entry says what was done and how it was checked.

## 2026-10-20 — Codex continuation

- Verified a clean `feature/harbor-ios` checkout at `4a673fcc48f6ffb702054858bc7a62d80cdfe5b5`,
  matching the remote branch. Read the six handoff files and the workflow before changes.
- Confirmed that the diff from `00c8dfa3` to HEAD contains documentation only.
- Requested attempt 2 of run [39352217482](https://github.com/1osamma/Harbor/actions/runs/39352217482)
  through the GitHub connector; both cancelled jobs restarted on the unchanged application code
  and workflow from `00c8dfa3`. Results below.
- Local required checks attempted: `pnpm run check` cannot run (`vp: not found`);
  `pnpm tauri:build:linux-system` cannot run (`cargo` is absent). No TS or Rust changes.

## 2026-10-20 — Continuation result (run 5, attempt 2)

- **Downloadable unsigned IPA:** [Harbor-iOS-unsigned-00c8dfa3](https://github.com/1osamma/Harbor/actions/runs/39352217482/artifacts/12236388185).
  `Harbor.ipa`: 173,005,084 bytes, arm64, bundle ID `app.harbor`, version 1.0.0, iOS 16.0+.
  Artifact ZIP expires 2026-11-19. Built from `00c8dfa3`, whose application code and workflow
  are identical to handoff HEAD `4a673fcc` (only documentation differs).
- **Simulator job: SUCCESS.** Logs confirm installation, launch, and a live process after 45 s
  on iPhone 16 Pro and iPad Pro 13-inch (M4). [Screenshots and logs](https://github.com/1osamma/Harbor/actions/runs/39352217482/artifacts/12236124928) uploaded.
  Screenshot contents have **not been visually verified** in this continuation: the environment
  blocks the connector download host (`sdmntprpolandcentral.oaiusercontent.com`, HTTP 403).
  Do not yet claim the plugin error screen is gone or onboarding is visible.
- **Device job: FAILURE at Inspect IPA; build and upload SUCCESS.** The Rust marker
  `embedded libmpv (MPVKit)`, Swift marker `app.harbor.mpv.events`, and mpv marker
  `mplayer2 projects` were found. The check failed on **`missing: libavformat license`**.
  This establishes a missing inspection marker, not the underlying reason or absent FFmpeg.
  `strings` also logged `failed to flush output` for the three successful `grep -q` checks.
- Stopped CI debugging after successful IPA upload as explicitly requested by the owner.
  No application/workflow changes or further CI runs. Both-jobs-green and visual startup
  acceptance remain incomplete. Signing, real-device launch, and all playback remain untested.

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

### Session 1, later

- GitHub: signed in as `1osamma`; fork created at https://github.com/1osamma/Harbor (none existed).
  `origin` = fork, `upstream` = Harborofficial/Harbor with pushes disabled.
- Actions enabled on the fork via the API. Branch `feature/harbor-ios` pushed.
- `pnpm test` matches the upstream baseline exactly (6043 pass / 106 pre-existing failures).
- First CI run: https://github.com/1osamma/Harbor/actions/runs/39344058176

### Session 1, end: handed off to Codex

- Run 4 (39347877439, `d7bc3823`): **simulator build + launch smoke test succeeded** on iPhone 16
  Pro and iPad Pro 13" simulators. Harbor launched and rendered its error view
  ("Plugin window not initialized"). The **device job built `Harbor.ipa` (173 MB, arm64)** but my
  `nm -gU` inspection gave a false negative, so no IPA was uploaded.
- Commit `00c8dfa3` fixes both (error-view filter on mobile; `strings`-based inspection; upload
  regardless). Run 5 (39352217482) was cancelled after ~4 min, so these are **unverified**.
- Development stopped at the owner's request. See CODEX_HANDOFF.md for the next task.
