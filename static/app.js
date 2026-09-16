// Polls /api/stats and updates the 640x172 dashboard with gauges, icons,
// color thresholds and RPM-driven fan animation.
const $ = (id) => document.getElementById(id);
const FAN_LABELS = ["D1", "D2", "CPU", "SYS"];

// ---- threshold helpers: return 'ok' | 'warn' | 'crit' ----
// Disk (HDD/SSD) temps: warn 50, crit 60 (drives should stay under ~45-50).
const lvlDisk   = (t) => t == null ? "ok" : t >= 60 ? "crit" : t >= 50 ? "warn" : "ok";
// CPU package temp: modern laptop-class CPUs idle 45-55C happily; only alert when hot.
const lvlCpu    = (t) => t == null ? "ok" : t >= 85 ? "crit" : t >= 70 ? "warn" : "ok";
const lvlUtil   = (u) => u >= 90 ? "crit" : u >= 75 ? "warn" : "ok";
const lvlFull   = (p) => p >= 90 ? "crit" : p >= 75 ? "warn" : "ok";
const cssVar    = (lvl) => lvl === "crit" ? "var(--crit)" : lvl === "warn" ? "var(--warn)" : "var(--ok)";

function setArc(el, pct, lvl) {
  el.style.setProperty("--pct", Math.max(0, Math.min(100, pct)));
  el.style.setProperty("--c", cssVar(lvl));
}

function renderFans(fans) {
  const row = $("fanRow");
  row.innerHTML = "";
  if (!fans || fans.length === 0) {
    row.innerHTML = '<span class="fv" style="color:var(--muted);font-size:12px">n/a</span>';
    return;
  }
  const max = Math.max(...fans, 1);
  fans.forEach((rpm, i) => {
    // spin duration inversely proportional to RPM (faster fan = faster spin)
    const dur = rpm > 0 ? Math.max(0.35, 2.2 - (rpm / max) * 1.8).toFixed(2) : 0;
    const spin = rpm > 0 ? "spin" : "";
    const d = document.createElement("div");
    d.className = "fan";
    d.innerHTML =
      `<svg class="fan-ic ${spin}" style="--dur:${dur}s"><use href="#i-fan"/></svg>` +
      `<span class="fv">${rpm}</span>` +
      `<span class="fl">${FAN_LABELS[i] || ("F" + (i + 1))}</span>`;
    row.appendChild(d);
  });
}

const ROLE_META = {
  data:  { label: "DATA",  icon: "#i-disk", cls: "r-data" },
  cache: { label: "CACHE", icon: "#i-nvme", cls: "r-cache" },
  os:    { label: "OS",    icon: "#i-nvme", cls: "r-os" },
};

function diskTile(d) {
  // health comes from backend (SMART verdict + attributes + temp); fall back to temp.
  const lvl = d.health || lvlDisk(d.temp);
  const t = d.temp;
  const meta = ROLE_META[d.role] || ROLE_META.data;
  const w = t == null ? 0 : Math.max(8, Math.min(100, ((t - 20) / 40) * 100));
  const el = document.createElement("div");
  el.className = "disk " + meta.cls + " h-" + lvl;
  el.innerHTML =
    `<div class="dh"><svg class="disk-ic"><use href="${meta.icon}"/></svg>` +
    `<span class="dn">${d.name}</span>` +
    `<span class="hdot ${"dot-" + lvl}"></span></div>` +
    `<div class="dt ${"s-" + lvl}">${t == null ? "--" : t}<span class="u">°C</span></div>` +
    `<div class="db"><i class="${"bg-" + lvl}" style="width:${w}%"></i></div>`;
  return el;
}

function renderDisks(disks) {
  const row = $("diskRow");
  row.innerHTML = "";
  const total = disks.length || 1;
  row.classList.toggle("compact", total >= 7);

  // group by role, display order: OS first, then DATA (HDD), then CACHE
  const order = ["os", "data", "cache"];
  const groups = order
    .map((r) => ({ role: r, items: disks.filter((d) => d.role === r) }))
    .filter((g) => g.items.length);

  groups.forEach((g, gi) => {
    const meta = ROLE_META[g.role];
    const grp = document.createElement("div");
    grp.className = "disk-group " + meta.cls;
    grp.style.setProperty("--n", g.items.length);
    // small group label
    const lab = document.createElement("div");
    lab.className = "group-label";
    lab.innerHTML = `<svg class="grp-ic"><use href="${meta.icon}"/></svg>${meta.label}`;
    grp.appendChild(lab);
    const tiles = document.createElement("div");
    tiles.className = "group-tiles";
    tiles.style.setProperty("--n", g.items.length);
    g.items.forEach((d) => tiles.appendChild(diskTile(d)));
    grp.appendChild(tiles);
    row.appendChild(grp);
    if (gi < groups.length - 1) {
      const div = document.createElement("div");
      div.className = "group-div";
      row.appendChild(div);
    }
  });
}

let anyWarn = false;

async function tick() {
  try {
    const s = await (await fetch("/api/stats", { cache: "no-store" })).json();
    anyWarn = false;

    $("nasName").textContent = s.name;
    $("statusText").textContent = s.status;
    $("clock").textContent = s.clock;
    $("ip").textContent = s.ip;

    // storage donut
    const stLvl = lvlFull(s.storage.pct);
    $("storagePct").textContent = s.storage.pct + "%";
    $("stUsed").textContent = s.storage.used;
    $("stTotal").textContent = s.storage.total;
    const donut = $("donut");
    donut.style.setProperty("--pct", s.storage.pct);
    donut.style.setProperty("--c", cssVar(stLvl));

    // cpu arc = temp gauge (0..80C mapped), util on side
    const cpuLvl = lvlCpu(s.cpu.temp);
    const utilLvl = lvlUtil(s.cpu.util);
    $("cpuTemp").textContent = s.cpu.temp;
    $("cpuTemp").parentElement.className = "arc-val " + "s-" + cpuLvl;
    $("cpuUtil").textContent = s.cpu.util + "%";
    $("cpuUtil").className = "val s-" + utilLvl;
    setArc($("cpuArc"), (s.cpu.temp / 100) * 100, cpuLvl);

    // memory arc = pct
    const memLvl = lvlUtil(s.mem.pct);
    $("memPct").textContent = s.mem.pct;
    $("memPct").parentElement.className = "arc-val s-" + memLvl;
    $("memUsed").textContent = s.mem.used_gb.toFixed(1) + "G";
    $("memTotal").textContent = "/" + s.mem.total_gb.toFixed(0) + "G";
    setArc($("memArc"), s.mem.pct, memLvl);

    renderFans(s.fans);
    renderDisks(s.disks);
    $("uptime").textContent = "up " + s.uptime;

    // escalate status pill if anything is warn/crit
    if ([stLvl, cpuLvl, utilLvl, memLvl].includes("crit") ||
        s.disks.some((d) => (d.health || lvlDisk(d.temp)) !== "ok")) anyWarn = true;
    $("statusPill").className = "pill" + (anyWarn ? " warn" : "");
  } catch (e) {
    console.error(e);
  }
}

tick();
setInterval(tick, 3000);
