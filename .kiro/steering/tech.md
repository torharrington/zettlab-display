# Tech

## Stack

- **Backend:** Python 3 (standard library only — `http.server`, `subprocess`,
  `glob`, `shutil`). No web framework, no pip dependencies.
- **Frontend:** vanilla HTML/CSS/JS with inline SVG icons. No build step, no npm,
  no CDN, no chart libraries.
- **Packaging:** Docker (`python:3.12-slim` + `smartmontools`), `docker compose`.
- **Display:** `cog` (kiosk WebKit browser) on a Wayland compositor
  (`weston` on ZettOS, `cage` on plain Linux).

## Hard constraints

- Zero runtime dependencies in `app.py` — do not add packages.
- No frontend build/bundler; keep it offline-safe.
- Fixed target viewport: **640x172** (the panel after 270° rotation).
- Disk row uses two separate colour systems: **role** (fixed) vs **health**
  (dynamic, from SMART). Keep them independent.

## Common commands

```bash
docker compose up -d                                   # run dashboard :8080
curl -s http://127.0.0.1:8080/api/stats | python3 -m json.tool   # check API
python3 -c "import app"                                # syntax/import check
```

## Configuration (env in docker-compose.yml)

`NAS_NAME`, `OS_NVME`, `SHOW_OS_DISK`, `DISKS` (override/auto), `POOL_PATH`, `TZ`,
`HOST_PROC` / `HOST_SYS` / `HOST_DEV`.

> Full architecture, setup, and gotchas: `AGENTS.md` and `DOCS.md` at repo root.
