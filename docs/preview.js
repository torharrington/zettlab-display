#!/usr/bin/env node
// Build a standalone, openable preview of the dashboard with sample data.
// Usage: node docs/preview.js [--open]
// Writes docs/preview.html — open it in any browser to iterate on the design
// offline (no NAS, no Docker). Edit docs/sample-data.js to try different states.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { buildPage } = require("./_build.js");

const out = path.join(__dirname, "preview.html");
// The panel is 640x172; wrap in a framed viewport so it's obvious at desktop size.
const body = buildPage({ bottomPad: false });
const framed = body.replace(
  "</head>",
  `<style>
     body{background:#222;display:flex;align-items:center;justify-content:center;height:100vh}
     #screen{outline:1px solid #444;box-shadow:0 8px 40px rgba(0,0,0,.6)}
   </style></head>`
);
fs.writeFileSync(out, framed);
console.log("wrote", out);
console.log("open it in a browser to preview (640x172 panel, framed).");

if (process.argv.includes("--open")) {
  const opener = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start" : "xdg-open";
  try { execSync(`${opener} "${out}"`); } catch (_) {}
}
