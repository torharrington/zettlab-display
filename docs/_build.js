// Shared helper: build a self-contained HTML page from the REAL dashboard
// assets (static/index.html + style.css + app.js) with sample data injected,
// so it renders offline (no backend / no NAS). Used by render.js and preview.js.
const fs = require("fs");
const path = require("path");
const { SAMPLE } = require("./sample-data.js");

const ROOT = path.resolve(__dirname, "..");
const STATIC = path.join(ROOT, "static");

function buildPage({ bottomPad = false } = {}) {
  const html = fs.readFileSync(path.join(STATIC, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(STATIC, "style.css"), "utf8");
  const appjs = fs.readFileSync(path.join(STATIC, "app.js"), "utf8");

  const extraCss = bottomPad
    ? "\n/* render-only: bottom breathing room for the docs screenshot */\n#screen{height:176px;padding-bottom:11px}\n"
    : "";

  return html
    .replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${css}${extraCss}\n</style>`)
    .replace(
      /<script src="app.js"><\/script>/,
      `<script>
         // Offline preview: feed sample data instead of hitting /api/stats.
         window.fetch = () => Promise.resolve({ json: () => Promise.resolve(${JSON.stringify(SAMPLE)}) });
       </script>
       <script>\n${appjs}\n</script>`
    );
}

module.exports = { buildPage, ROOT, STATIC };
