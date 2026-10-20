// Adds Harbor's native iOS layer to the Xcode project `tauri ios init` generates.
//
// gen/apple is generated, not committed: it can only be produced on macOS, and
// regenerating it keeps it in step with the Tauri CLI version. This script runs
// after init and is idempotent, so it can also be run again on an existing
// project. It
//   1. copies src-tauri/ios/Sources into the app target's sources,
//   2. adds the MPVKit Swift package (libmpv + FFmpeg + libass for iOS) and
//      links its LGPL product into the app target,
//   3. installs Harbor's app icon and launch screen (src-tauri/ios/Brand),
//   4. regenerates the .xcodeproj with xcodegen.
//
// Usage: node scripts/ios/prepare-xcode.mjs [--no-generate]

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Pinned for reproducible builds. MPVKit's binary targets are checksummed in
// its Package.swift, so a tag pins the exact libmpv and FFmpeg binaries too.
const MPVKIT_URL = "https://github.com/mpvkit/MPVKit";
const MPVKIT_VERSION = "1.0.0";
// LGPL build. "MPVKit-GPL" adds GPL-only FFmpeg parts and samba; nothing in
// Harbor needs them, and LGPL keeps relinking obligations simple.
const MPVKIT_PRODUCT = "MPVKit";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appleDir = join(root, "src-tauri", "gen", "apple");
const specPath = join(appleDir, "project.yml");
const nativeSrc = join(root, "src-tauri", "ios", "Sources");

function fail(message) {
  console.error(`[prepare-xcode] ${message}`);
  process.exit(1);
}

if (!existsSync(specPath)) fail(`${specPath} not found; run \`pnpm tauri ios init\` first`);
let spec = readFileSync(specPath, "utf8").replace(/\r\n/g, "\n");

const targetMatch = spec.match(/^targets:\n {2}([A-Za-z0-9_-]+_iOS):\n/m);
if (!targetMatch) fail("could not find the <app>_iOS target in project.yml");
const target = targetMatch[1];
const appName = target.replace(/_iOS$/, "");

// 1. Native sources, into the folder xcodegen already globs for the target.
const sourcesDir = join(appleDir, "Sources", appName);
if (!existsSync(sourcesDir)) fail(`${sourcesDir} not found`);
const nativeDest = join(sourcesDir, "harbor-native");
mkdirSync(nativeDest, { recursive: true });
for (const name of readdirSync(nativeSrc)) {
  cpSync(join(nativeSrc, name), join(nativeDest, name), { recursive: true });
}
console.log(`[prepare-xcode] copied ${readdirSync(nativeSrc).length} native source(s) into ${nativeDest}`);

// 2. The Swift package and the dependency on it.
if (!/^packages:\n/m.test(spec)) {
  spec = spec.replace(
    /^targetTemplates:\n/m,
    `packages:\n  MPVKit:\n    url: ${MPVKIT_URL}\n    exactVersion: ${MPVKIT_VERSION}\ntargetTemplates:\n`,
  );
}

// Scope edits to the app target's block so a template change elsewhere in the
// file cannot be matched by accident.
const targetStart = spec.indexOf(`\n  ${target}:\n`);
const rest = spec.slice(targetStart + 1);
const nextTarget = rest.slice(1).search(/\n {2}[A-Za-z0-9_-]+:\n/);
const targetEnd = nextTarget === -1 ? spec.length : targetStart + 1 + nextTarget + 1;
let block = spec.slice(targetStart, targetEnd);

if (!block.includes(`product: ${MPVKIT_PRODUCT}\n`)) {
  if (!/\n {4}dependencies:\n/.test(block)) fail(`no dependencies list in ${target}`);
  block = block.replace(
    /\n {4}dependencies:\n/,
    `\n    dependencies:\n      - package: MPVKit\n        product: ${MPVKIT_PRODUCT}\n`,
  );
}

// Swift in an app target that also holds Objective-C++ and C. The bootstrap
// file uses a constructor that references a Rust symbol, so the Rust static
// library must not be dead-stripped before that reference is seen; it is not,
// because the reference comes from an object file in the app itself.
if (!block.includes("SWIFT_VERSION:")) {
  block = block.replace(
    /\n {6}base:\n/,
    `\n      base:\n        SWIFT_VERSION: "5.0"\n        CLANG_ENABLE_MODULES: YES\n`,
  );
}

spec = spec.slice(0, targetStart) + block + spec.slice(targetEnd);
writeFileSync(specPath, spec);
console.log(`[prepare-xcode] patched ${specPath} (target ${target}, MPVKit ${MPVKIT_VERSION})`);

// 3. Branding: Harbor's own icon, full-bleed, and a launch screen identical to the web boot
// splash (index.html: the boat, 96pt wide, #f5f5f5 on #0a0a0a), so launch hands over to the page
// without a flash. Assets come from src-tauri/ios/Brand (see its README).
const brandDir = join(root, "src-tauri", "ios", "Brand");
function findUnder(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.name === name) return path;
    if (entry.isDirectory() && entry.name !== "build" && !entry.name.endsWith(".xcodeproj")) {
      const found = findUnder(path, name);
      if (found) return found;
    }
  }
  return null;
}
const appIconSet = findUnder(appleDir, "AppIcon.appiconset");
if (!appIconSet) fail("AppIcon.appiconset not found in the generated project");
for (const name of readdirSync(appIconSet)) rmSync(join(appIconSet, name), { force: true });
cpSync(join(brandDir, "AppIcon-1024.png"), join(appIconSet, "AppIcon-1024.png"));
writeFileSync(
  join(appIconSet, "Contents.json"),
  JSON.stringify(
    {
      images: [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
      info: { author: "xcode", version: 1 },
    },
    null,
    2,
  ),
);
const logoSet = join(dirname(appIconSet), "LaunchLogo.imageset");
mkdirSync(logoSet, { recursive: true });
for (const scale of [1, 2, 3]) {
  cpSync(join(brandDir, `LaunchLogo@${scale}x.png`), join(logoSet, `LaunchLogo@${scale}x.png`));
}
writeFileSync(
  join(logoSet, "Contents.json"),
  JSON.stringify(
    {
      images: [1, 2, 3].map((s) => ({ filename: `LaunchLogo@${s}x.png`, idiom: "universal", scale: `${s}x` })),
      info: { author: "xcode", version: 1 },
    },
    null,
    2,
  ),
);
const launchStoryboard = findUnder(appleDir, "LaunchScreen.storyboard");
if (!launchStoryboard) fail("LaunchScreen.storyboard not found in the generated project");
cpSync(join(brandDir, "LaunchScreen.storyboard"), launchStoryboard);
console.log(`[prepare-xcode] branding: ${appIconSet}, ${logoSet}, ${launchStoryboard}`);

// 4. Regenerate the project from the patched spec.
if (!process.argv.includes("--no-generate")) {
  execFileSync("xcodegen", ["generate", "--spec", specPath], { cwd: appleDir, stdio: "inherit" });
  console.log("[prepare-xcode] xcodegen generate done");
}
