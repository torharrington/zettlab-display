# CLAUDE.md

This file gives Claude Code context for this repository.

**The primary, maintained context lives in [`AGENTS.md`](./AGENTS.md).** Read it
first — it covers the architecture, repo layout, hard constraints, how to run
and test, and hardware facts. This file only adds Claude-specific reminders.

## TL;DR

A custom 640x172 status dashboard for a NAS front LCD (Zettlab D6 Ultra), with
three decoupled layers (Python HTTP dashboard → `cog` kiosk browser → `weston`/
`cage` compositor at 270° rotation). Full details in `DOCS.md`.

## Non-negotiable constraints (repeated from AGENTS.md)

- `app.py` is **standard-library only** — no pip deps, no web frameworks.
- `static/` is **plain HTML/CSS/JS**, inline SVG icons — no npm, no CDN, no build.
- Target viewport is **exactly 640x172**.
- Keep the disk **role** colours (fixed) separate from **health** colours (SMART-driven).

## Working here

- Verify changes with: `python3 -c "import app"` then
  `curl -s http://127.0.0.1:8080/api/stats | python3 -m json.tool`.
- No test suite yet — if you add one, prefer stdlib `unittest` to keep zero-dep.
- Update `DOCS.md` when behaviour changes; update `README.md` if quick-start changes.
