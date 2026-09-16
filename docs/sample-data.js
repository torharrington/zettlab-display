// Sample data for offline dashboard previews / renders (no NAS needed).
// Edit these values to preview different states (temps, health, disk counts).
// Used by docs/render.js (screenshot) and docs/preview.js (browser preview).
const SAMPLE = {
  name: "NAS",
  status: "1 WARN",
  clock: "22:45",
  ip: "0.0.0.0",
  storage: { used: "6.1TB", total: "16TB", pct: 38 },
  cpu: { temp: 52, util: 12 },
  mem: { used_gb: 9.4, total_gb: 30.9, pct: 30 },
  fans: [731, 726, 3281],
  uptime: "2d 4h",
  disks: [
    { name: "nv0", role: "os",    temp: 41, health: "ok" },
    { name: "sda", role: "data",  temp: 34, health: "ok" },
    { name: "sdb", role: "data",  temp: 33, health: "ok" },
    { name: "sdc", role: "data",  temp: 35, health: "ok" },
    { name: "sdd", role: "data",  temp: 34, health: "ok" },
    { name: "sde", role: "data",  temp: 48, health: "warn" },
    { name: "sdf", role: "data",  temp: 34, health: "ok" },
    { name: "nv1", role: "cache", temp: 39, health: "ok" },
    { name: "nv2", role: "cache", temp: 44, health: "ok" }
  ]
};

// export for Node; also attach to window when loaded in a browser
if (typeof module !== "undefined" && module.exports) module.exports = { SAMPLE };
if (typeof window !== "undefined") window.__SAMPLE__ = SAMPLE;
