#!/usr/bin/env node
// Render the dashboard to a PNG using headless Chrome + sample data.
// Usage: node docs/render.js [output.png]
// Regenerates the docs preview image so it always matches the current UI.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { buildPage } = require("./_build.js");

// Find a Chrome/Chromium binary across platforms (or CHROME_BIN override).
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (_) {} }
  throw new Error("No Chrome/Chromium found. Set CHROME_BIN=/path/to/chrome");
}

const outPng = path.resolve(process.argv[2] || path.join(__dirname, "dashboard-example.png"));
const outHtml = path.join(__dirname, "_render.html");

fs.writeFileSync(outHtml, buildPage({ bottomPad: true }));
try {
  execFileSync(findChrome(), [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=2",   // 2x for a crisp image
    "--window-size=640,176",
    `--screenshot=${outPng}`,
    "--default-background-color=00000000",
    "--virtual-time-budget=1500",
    `file://${outHtml}`,
  ], { stdio: "inherit" });
} finally {
  fs.unlinkSync(outHtml);
}
console.log("wrote", outPng);
