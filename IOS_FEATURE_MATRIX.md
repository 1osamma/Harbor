# Harbor iOS — Feature Compatibility Matrix

Status legend:
- **Ported** — code path exists for iOS; *not yet verified on a device* unless the Verified column says so.
- **Shared** — pure TypeScript/HTTP feature that runs unchanged in the webview; untested on iOS.
- **Partial** — works with reduced functionality (see notes).
- **Blocked** — cannot work on iOS today; blocker given.
- **Not ported** — possible on iOS, not done yet.

> **State at handoff (2026-10-20): no iOS build has completed yet, so every Verified cell is empty.**
> Dependencies compile for iOS; the Harbor crate, Swift layer and link step are still being fixed.

"Verified" is only filled in with what was actually observed (CI log, simulator screenshot,
device test). Compiling is not verification.

## App shell

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Launch, splash, main shell | Ported | – | Desktop shell in WKWebView; boot waits only on caught promises. |
| Navigation (sidebar/topbar/rail layouts) | Shared | – | Touch = pointer events; hover-only affordances may need tap equivalents. |
| iPad layout | Ported | – | Native width (≥960 CSS px in landscape on all iPads; most in portrait). |
| iPhone layout | Partial | – | Viewport widened to 960 CSS px and scaled. Readable in landscape; small in portrait. Compact layout not built. |
| Safe area / notch / home indicator | Ported | – | `#root` inset by `env(safe-area-inset-*)`. |
| Portrait + landscape | Ported | – | Info.ios.plist orientations; viewport recomputed on rotation. |
| Desktop window chrome (title bar, min/max/close, resize edges) | Hidden on iOS | – | `hasDesktopWindow()`. |
| Themes, custom themes, settings | Shared | – | localStorage + `settings_read/write` (registered on mobile). |
| Settings persistence | Ported | – | Rust `settings_store` in app data dir. |
| Secure credential storage | Partial | – | `secrets_read/write` file in the app sandbox (iOS Data Protection at rest). Not yet Keychain. |
| Deep links `harbor://`, `stremio://` | Ported | – | CFBundleURLTypes + tauri-plugin-deep-link. |
| OAuth callbacks (Trakt, AniList, MAL, Simkl) | Shared | – | Device-code / redirect flows use the opener + deep link. Needs device test. |
| File import (subtitles, fonts, local media) | Partial | – | tauri-plugin-dialog/fs on iOS use the document picker; app folder visible in Files (UIFileSharingEnabled). |
| Notifications | Not ported | – | `send_clickable_notification` is desktop-only; tauri-plugin-notification is not registered on mobile yet. |
| Auto-updater | Blocked | – | iOS apps cannot self-update; disabled in tauri.ios.conf.json. Re-sideload new IPAs. |
| Tray, multi-window, PiP window, monitors | Blocked | – | No such concepts on iOS. |
| Discord Rich Presence | Blocked | – | No Discord IPC on iOS. |

## Content & discovery (TypeScript, HTTP via `harbor_fetch`)

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Home, Discover, Movies, Shows, Anime | Shared | – | |
| Cinemeta, TMDB metadata, posters, recommendations | Shared | – | TMDB key from user settings, never hardcoded. |
| Search, filters, sorting | Shared | – | |
| Seasons/episodes | Shared | – | |
| Continue Watching, history | Shared | – | |
| Trailers | Partial | – | YouTube embed works; `fetch_trailer` (yt-dlp sidecar) is blocked — no subprocesses on iOS. |
| Calendar, people, collections, lists, awards | Shared | – | |

## Streaming & addons

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Stremio addon protocol, install, configure, catalogs | Shared | – | |
| Stremio account sign-in | Ported | – | `stremio_auth_start` registered on mobile. |
| Stream ranking (harbor-core) | Ported | – | `streams_run_pipeline` (Rust) on mobile. |
| Stream switching during playback | Shared | – | |
| Debrid (Real-Debrid, AllDebrid, TorBox) | Shared | – | HTTP APIs, user's own keys. |
| Torrent streaming (librqbit) | Ported | – | Runs while the app is foreground. iOS suspends sockets in background. |
| Stream proxy (headers, redirects) | Ported | – | `resolve_playback_redirect` added to iOS command list. |
| Cloudflare challenge solver | Blocked | – | Needs a hidden desktop webview; mobile stub reports "unavailable". |

## Playback

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Native libmpv engine (MPVKit) | Ported | – | Same `mpv_*` commands as desktop; video under transparent webview. |
| MKV / MP4 / WebM / TS containers | Ported | – | FFmpeg demuxers in MPVKit. |
| H.264 / HEVC hardware decode | Ported | – | `hwdec=videotoolbox`. |
| AV1 | Partial | – | dav1d software decode (MPVKit). HW AV1 only on A17 Pro/M3+ via VideoToolbox; unverified. |
| Audio: AAC, AC3/E-AC3, DTS, TrueHD, Opus, FLAC | Ported | – | FFmpeg decoders; output is stereo/AirPlay as iOS routes it. Passthrough not available. |
| HDR10/HLG/Dolby Vision on HDR displays | Partial | – | EDR via `target-colorspace-hint` + `wantsExtendedDynamicRangeContent` when "HDR → SDR" is off. DV profile 5 tone-mapped by libplacebo (libdovi). Unverified. |
| Embedded subtitles (SRT/ASS/PGS) | Ported | – | libass/FFmpeg. In embed mode Harbor renders text subtitles in the DOM, as on desktop. |
| External SRT/ASS/SSA | Ported | – | `mpv_sub_add`. |
| Custom subtitle fonts (.ttf/.otf) | Ported | – | `install_sub_font` (mobile) → `sub-fonts-dir`. |
| Arabic / RTL subtitles | Ported | – | `sub-ass-shaper=complex` (HarfBuzz + FriBidi), Vazirmatn bundled. |
| Subtitle size/position/colour/style | Ported | – | Same properties as desktop. |
| Multiple audio tracks, subtitle/audio delay, speed | Ported | – | |
| Seeking, chapters | Ported | – | |
| Resume, Next Episode, Skip Intro/Outro | Shared | – | Driven from the shared player UI. |
| Picture-in-Picture | Partial | – | Works with the HTML5 engine (WKWebView `<video>`). Not with mpv: needs AVSampleBufferDisplayLayer rendering. |
| AirPlay | Partial | – | HTML5 engine via WebKit. mpv engine: audio follows the system route; video AirPlay needs AVPlayer. |
| Fullscreen | Ported | – | App is always full screen; player fills the safe area. |
| Anime4K / custom GLSL shaders | Ported | – | Shader download modules enabled on iOS; gpu-next on MoltenVK. GPU cost on phones unmeasured. |
| SVP, RTX VSR/HDR, VapourSynth | Blocked | – | Windows/NVIDIA/Linux-only components. |
| Screenshots | Ported | – | `screenshot-to-file` into app cache. |
| GIF / clip recording | Not ported | – | Needs ffmpeg CLI; would need libav-based reimplementation. |
| Thumbnails (seek preview) | Not ported | – | Uses the ffmpeg sidecar. |
| Subtitle extract / auto-sync | Not ported | – | ffmpeg / ffsubsync sidecars. |
| Stats overlay | Shared | – | Reads mpv properties. |

## Tracking & libraries

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Trakt, AniList, MyAnimeList, Simkl, Letterboxd | Shared | – | |
| Scrobbling, watch progress, watchlists | Shared | – | |
| Profiles | Shared | – | |
| Jellyfin, Plex, Emby | Ported | – | `media_server_request` registered on mobile. |
| Local files / folders | Partial | – | `harbor_scan_folder` works inside the sandbox / picked folders. |
| Downloads + offline playback | Ported | – | `download_start` on mobile; stored in app sandbox. Background downloads stop when iOS suspends the app. |

## Additional

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Live TV, M3U playlists, EPG | Shared | – | HLS/TS via HTML5 (hls.js/mpegts.js need MSE/ManagedMediaSource, iOS 17.1+) or mpv. |
| DVR recording | Blocked | – | ffmpeg sidecar. |
| Watch parties ("Together") | Shared | – | WebSocket service. |
| Chromecast | Not ported | – | `cast.rs` desktop-only (mdns + TLS); portable in principle. |
| DLNA / Roku | Not ported | – | Desktop-only modules. |
| LAN web server / phone remote | Ported | – | `web_serve_*` on mobile; local network permission string set. |
| Manga + extensions | Partial | – | Reader is TS; Android-extension compat layer (capstan) is not in the repo and is desktop-only. |
| E-books + TTS | Ported | – | `ebook_tts_*` registered on mobile. |
| Music (Spotify/YT Music/local) | Blocked | – | 90 desktop-only commands; librespot + desktop audio pipeline. Possible future work. |
| Games library | Blocked | – | Launchers, emulators and installers cannot run on iOS. |
| Gamepad | Partial | – | gilrs has no iOS backend; Web Gamepad API in WKWebView may work. |
