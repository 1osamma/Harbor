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
