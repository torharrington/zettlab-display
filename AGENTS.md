# AGENTS.md

Guidance for AI coding agents (Kiro, Claude, Cursor, Copilot, etc.) working in
this repository. This is the single source of truth for agent context; the
tool-specific files (`CLAUDE.md`, `.kiro/steering/*`) point back here.

## What this project is

A custom status dashboard for a NAS front LCD panel. It was developed and proven
on a **Zettlab D6 Ultra** (front eDP panel, 172x640) running the stock ZettOS,
and is designed to be portable to a plain Debian/Ubuntu (or FygoOS) install.

It has three decoupled layers that only talk over HTTP:

1. **Dashboard app** (`app.py` + `static/`) — a dependency-free Python HTTP
   server that collects host metrics and serves a 640x172 web page.
2. **Kiosk browser** (`cog`) — renders that page fullscreen on the panel.
3. **Compositor** (`weston` on ZettOS, or `cage` on plain Linux) — owns the
   panel and applies the 270° rotation.

Only layer 3 is OS-specific. See `DOCS.md` for the full architecture (with
Mermaid diagrams), setup guides, and the FygoOS notes.

## Repository layout

| Path | Purpose |
|------|---------|
| `app.py` | HTTP server: serves the page + `/api/stats` JSON; collects metrics |
| `static/index.html` | 640x172 layout: header, metric cards, grouped disk row |
| `static/style.css` | Dark theme, arc gauges, role colours, health states |
| `static/app.js` | Polls `/api/stats` every 3s, renders gauges/disks |
| `Dockerfile` | `python:3.12-slim` + `smartmontools` |
| `docker-compose.yml` | Host mounts, caps, and env config |
| `nas-lcd-kiosk.service` | systemd unit that runs the `cog` kiosk |
| `README.md` | Quick start / overview |
| `DOCS.md` | Full documentation: architecture, setup, FygoOS, disks, troubleshooting |

## Architecture rules (do not break)

- **No runtime dependencies.** `app.py` uses only the Python 3 standard library
  (`http.server`, `subprocess`, `glob`, etc.). Do **not** add Flask/FastAPI or
  pip packages — offline-safe and zero-dep is a design goal.
- **No frontend build step / no CDN.** `static/` is plain HTML/CSS/JS with inline
  SVG icons. Do **not** introduce npm, bundlers, or external chart libraries.
  The panel may be offline.
- **Fixed target size: 640x172** (the panel after 270° rotation). Layout must fit
  this exactly. Test any layout change against that viewport.
- **Two independent colour systems** in the disk row — keep them separate:
  - *Role* (data/cache/os) = fixed colour identity (left edge + icon + label).
  - *Health* (ok/warn/crit) = dynamic, from SMART data (temp number + border + dot).
- **The three layers stay decoupled** — they communicate only via HTTP on
  `127.0.0.1:8080`. Don't couple the collector to the compositor.

## Key implementation details

- **Disk discovery** (`_discover_disks` in `app.py`): scans `/sys/block` for
  `sd*` (HDD) and `nvme*n1`; classifies by `queue/rotational` + `OS_NVME` env
  into roles `data` / `cache` / `os`.
- **SMART health** (`_parse_smart`): runs `smartctl -H -A -d {sat|nvme}` and
  derives `ok|warn|crit` from the overall-health verdict, reallocated/pending
  sectors, CRC errors, and NVMe wear/spare/media errors — not just temperature.
- **smartctl over bind-mounted `/host/dev`** loses udev auto-detection, so the
  device type is passed explicitly (`-d sat` for `sd*`, `-d nvme` for NVMe).
- **Rotation**: `weston` needs `transform=rotate-270` (weston 10 rejects a bare
  `90`); `cage`/wlroots uses `WLR_DRM_TRANSFORM=270`.

## How to run / test

```bash
# Dashboard only (serves 127.0.0.1:8080):
docker compose up -d

# Quick metric sanity check (no browser needed):
curl -s http://127.0.0.1:8080/api/stats | python3 -m json.tool

# Run the collector directly against host paths (no container):
sudo HOST_PROC=/proc HOST_SYS=/sys HOST_DEV=/dev POOL_PATH=/path/to/pool \
  python3 -c "import app, json; print(json.dumps(app.collect(), indent=2))"
```

There is no automated test suite yet. Validate changes by:
1. `python3 -c "import app"` (import/syntax check).
2. Hitting `/api/stats` and confirming the JSON shape.
3. For layout changes, load the page in a 640x172 viewport.

## Hardware facts (Zettlab D6 Ultra — confirmed on the device)

- Panel: `eDP-1`, 172x640, Intel i915 (Meteor Lake), Lenovo "Go Display".
- Backlight: `/sys/class/backlight/intel_backlight` (0..192000).
- Fans: hwmon `zettos_pwm_fan` (custom in-kernel ZettOS driver — **won't exist
  on FygoOS/other kernels**; the fan card degrades to "n/a").
- CPU temp: hwmon `coretemp`, "Package id 0".
- The `zettos_pwm_fan` name and pool path are the two most hardware/OS-specific
  bits — see `DOCS.md` §5–6 for how to adapt them.

## Conventions

- Keep `app.py` standard-library only and readable; prefer small pure functions.
- Frontend: vanilla JS, no frameworks; keep icons as inline SVG symbols.
- Env-driven config lives in `docker-compose.yml` (`OS_NVME`, `SHOW_OS_DISK`,
  `NAS_NAME`, `DISKS`, `POOL_PATH`, `TZ`).
- When you change behaviour, update `DOCS.md` (the detailed doc) and, if the
  quick-start changes, `README.md`.

## Gotchas / non-obvious constraints

- Docker on ZettOS uses the `vfs` storage driver because `/var/lib/docker` sits
  on an overlay root; do not assume `overlay2` works there.
- Restarting `weston` can drop an SSH session — long-running display actions on
  the device were run via detached `systemd-run` units.
- The panel is physically rotated; the *unrotated* framebuffer is 172x640
  portrait, so all layout is authored for the 640x172 *rotated* result.
