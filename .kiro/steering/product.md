# Product

NAS front-LCD status dashboard.

A custom status display for a NAS front LCD panel, developed and proven on a
**Zettlab D6 Ultra** (172x640 eDP panel) running stock ZettOS, and designed to
be portable to plain Debian/Ubuntu or FygoOS.

It shows, on the little front screen: hostname/clock/IP, storage usage, CPU
temp + utilisation, memory, fan RPMs, and a per-disk row grouped by role
(OS / DATA / CACHE) with SMART-based health colouring (green/amber/red +
alert on failure).

## Goals

- Look good and be readable at a glance on a tiny 640x172 strip.
- Be a genuine early-warning display: disks turn amber/red on real SMART
  degradation, not just temperature.
- Stay portable: the dashboard is OS-independent; only the compositor layer
  differs between ZettOS and a plain Linux install.

## Non-goals

- Not a full monitoring/metrics platform (no history, no time-series charts —
  the panel is too small).
- Not tied to Zettlab hardware beyond a couple of adaptable specifics
  (fan sensor name, pool path).

> Full context for AI agents: see `AGENTS.md` at the repo root.
