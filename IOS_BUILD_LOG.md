# Harbor iOS — Build Log

Every CI run or local build attempt, with its outcome and the root cause of any failure.
Newest first.

| # | Date | Where | Commit | Result | Root cause / notes |
|---|---|---|---|---|---|
| 3 | 2026-10-20 | CI run 39344058176 (simulator job) | 59a… | FAILED in "Build Rust Code" | Not a Rust error: pnpm 11 inside the Xcode script phase re-verified deps and aborted (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). Fix: runner-global `verify-deps-before-run=false`, `confirm-modules-purge=false`. tauri ios init, prepare-xcode.mjs and MPVKit resolution all succeeded. |
| 2 | 2026-10-20 | local (Windows) | working tree | `pnpm test`: 6043 pass / 106 fail | Identical to unmodified upstream baseline (same 106 tests fail before the iOS changes). No regressions. |
| 1 | 2026-10-20 | local (Windows) | working tree | `pnpm run typecheck` passed | — |
