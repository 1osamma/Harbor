// Builds the iOS brand assets from Harbor's own artwork (no new design):
//  - AppIcon-1024.png: the official icon (src-tauri/icons/ios/AppIcon-512@2x.png) with its
//    transparent rounded corners filled by the neighbouring background colour, because iOS masks
//    icons itself and renders transparency as black.
//  - LaunchLogo@{1,2,3}x.png: the boat mark from index.html's boot splash, 96pt wide, #f5f5f5.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
// Usage: node scripts/ios/brand-assets.mjs <repo root>  (uses pngjs and @resvg/resvg-js from node_modules)
const repo = process.argv[2];
const out = join(repo, "src-tauri", "ios", "Brand");
mkdirSync(out, { recursive: true });
const req = createRequire(join(repo, "node_modules", ".pnpm", "pngjs@5.0.0", "node_modules", "pngjs", "package.json"));
const { PNG } = req("pngjs");
const req2 = createRequire(join(repo, "node_modules", ".pnpm", "@resvg+resvg-js@2.6.2", "node_modules", "@resvg", "resvg-js", "package.json"));
const { Resvg } = req2("@resvg/resvg-js");

// 1. Full-bleed icon.
const icon = PNG.sync.read(readFileSync(join(repo, "src-tauri/icons/ios/AppIcon-512@2x.png")));
const { width: W, height: H, data } = icon;
const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
const probe = { tl: at(200, 200), tr: at(W - 200, 200), bl: at(200, H - 200), br: at(W - 200, H - 200) };
let filled = 0;
// The official icon is a rounded square exported on a white canvas: its four corners are opaque
// white. iOS applies its own mask, so give the corners the icon's own background instead. Only the
// 220px corner squares are touched; the boat starts at x >= 255, so the artwork itself is unchanged.
const CORNER = 220;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const inCorner = (x < CORNER || x >= W - CORNER) && (y < CORNER || y >= H - CORNER);
  if (!inCorner) continue;
  const i = (y * W + x) * 4;
  const bg = probe[(y < H / 2 ? "t" : "b") + (x < W / 2 ? "l" : "r")];
  const lighter = data[i] + data[i + 1] + data[i + 2] > bg[0] + bg[1] + bg[2] + 24;
  if (!lighter && data[i + 3] === 255) continue;
  data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; data[i + 3] = 255;
  filled++;
}
writeFileSync(join(out, "AppIcon-1024.png"), PNG.sync.write(icon, { colorType: 2 }));
console.log("icon", W, H, "filled px", filled, "corner probes", JSON.stringify(probe));

// 2. Launch logo from the boot splash paths.
const paths = [
  "m 72.0781,1534.27 c 0,0 1127.5819,922.03 1526.9319,2636.89 0,0 463.95,-1274.4 17.61,-2625.15 L 72.0781,1534.27",
  "M 3975.59,2945.05 2812.18,2222.26 c -36.68,-22.79 -84.13,3.59 -84.13,46.78 v 1391.45 c 0,42.35 45.8,68.85 82.51,47.75 l 1163.41,-668.68 c 36.11,-20.75 37,-72.53 1.62,-94.51 z M 2021.85,4821.57 V 1438.84 l 2818.94,416.96 c 0,0 252.54,2501.82 -2818.94,2965.77",
  "m 615.313,4.40234 c 0,0 -364.817,308.39866 -604.4224,706.25766 -28.3125,47.012 1.4922,107.77 55.8555,115.281 L 5090.13,1520.12 c 57.31,7.92 102.66,-47.69 82.95,-102.09 C 5065.81,1122 4746.77,351.742 4222.68,0 L 615.313,4.40234",
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 642.88"><g fill="#f5f5f5" transform="matrix(0.13333333,0,0,-0.13333333,0,642.88)">${paths.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
writeFileSync(join(out, "launch-logo.svg"), svg);
for (const scale of [1, 2, 3]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 96 * scale }, background: "rgba(0,0,0,0)" }).render().asPng();
  writeFileSync(join(out, `LaunchLogo@${scale}x.png`), png);
}
console.log("launch logos written");
