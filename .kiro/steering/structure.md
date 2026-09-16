# Structure

```
nas-lcd-dashboard/
├── app.py                 # HTTP server: serves page + /api/stats; collects metrics
├── static/
│   ├── index.html         # 640x172 layout: header, metric cards, grouped disk row
│   ├── style.css          # dark theme, arc gauges, role colours, health states
│   └── app.js             # polls /api/stats every 3s, renders gauges/disks
├── Dockerfile             # python:3.12-slim + smartmontools
├── docker-compose.yml     # host mounts, caps, env config
├── nas-lcd-kiosk.service  # systemd unit for the cog kiosk (installed on host)
├── README.md              # quick start / overview
├── DOCS.md                # full docs: architecture, setup, FygoOS, disks, troubleshooting
├── AGENTS.md              # primary AI-agent context (source of truth)
├── CLAUDE.md              # Claude pointer -> AGENTS.md
└── .kiro/steering/        # Kiro steering docs (product/tech/structure)
```

## Key modules in `app.py`

- `read_cpu_util` / `read_cpu_temp` / `read_mem` / `read_fans` / `read_storage`
  / `read_uptime` / `read_ip` — individual metric collectors.
- `_discover_disks` — scans `/sys/block`, classifies disks into roles
  (data/cache/os) via `rotational` + `OS_NVME`.
- `_parse_smart` — parses `smartctl -H -A` into temp + health (ok/warn/crit).
- `read_disk_temps` — per-disk temp + role + health list.
- `collect` — assembles the full `/api/stats` payload + aggregate status pill.
- `Handler` / `__main__` — the stdlib HTTP server.

## Frontend rendering (`static/app.js`)

- `ROLE_META` — role → {label, icon, css class}.
- `lvlDisk` / `lvlCpu` / `lvlUtil` / `lvlFull` — threshold helpers → ok/warn/crit.
- `diskTile` / `renderDisks` — grouped disk row (order: os → data → cache).
- `renderFans` — RPM-driven spinning fan icons (degrades to "n/a" if none).
- `tick` — the 3s poll + DOM update loop.

> For architecture diagrams and rationale, see `DOCS.md` and `AGENTS.md`.
