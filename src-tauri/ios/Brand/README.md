# iOS brand assets

Installed into the generated Xcode project by `scripts/ios/prepare-xcode.mjs`.
All are derived from Harbor's existing artwork; nothing here is a new design.

| File | Source |
|---|---|
| `AppIcon-1024.png` | `src-tauri/icons/ios/AppIcon-512@2x.png` (the official icon). That file is a rounded square on an opaque white canvas; iOS masks icons itself, so its corners are filled with the icon's own background. Xcode builds every icon size from this one (single-size app icon). |
| `LaunchLogo@{1,2,3}x.png`, `launch-logo.svg` | The boat paths of the web boot splash (`index.html`, `#harbor-boot`), `#f5f5f5`, 96pt wide. |
| `LaunchScreen.storyboard` | Same layout as the boot splash (boat centred on `#0a0a0a`), so launch → page has no flash. |

Regenerate the PNGs with `node scripts/ios/brand-assets.mjs .` from the repository root.
