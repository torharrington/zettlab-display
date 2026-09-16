#!/usr/bin/env python3
"""
NAS LCD Dashboard backend.
Serves a 640x172 status page + /api/stats JSON for the front LCD.

Reads metrics from host-mounted /proc, /sys (hwmon), btrfs pool, and smartctl.
Designed to run in a container with --pid host and /proc,/sys,/dev mounted.
"""
import os
import time
import glob
import json
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---- config via env ----
HOST_PROC = os.environ.get("HOST_PROC", "/host/proc")
HOST_SYS = os.environ.get("HOST_SYS", "/host/sys")
HOST_DEV = os.environ.get("HOST_DEV", "/dev")
POOL_PATH = os.environ.get("POOL_PATH", "/host/pool")
NAS_NAME = os.environ.get("NAS_NAME", "NAS")
DISKS = os.environ.get("DISKS", "")  # optional comma-list override; empty = auto-discover
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

# ---- cpu util (delta between calls) ----
_prev = {"idle": 0, "total": 0}


def read_cpu_util():
    try:
        with open(os.path.join(HOST_PROC, "stat")) as f:
            parts = f.readline().split()[1:]
        vals = list(map(int, parts))
        idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
        total = sum(vals)
        d_idle = idle - _prev["idle"]
        d_total = total - _prev["total"]
        _prev["idle"], _prev["total"] = idle, total
        if d_total <= 0:
            return 0
        return round(100 * (1 - d_idle / d_total))
    except Exception:
        return 0


def read_mem():
    info = {}
    try:
        with open(os.path.join(HOST_PROC, "meminfo")) as f:
            for line in f:
                k, v = line.split(":")
                info[k.strip()] = int(v.split()[0])  # kB
        total = info.get("MemTotal", 0) / 1024 / 1024  # GB
        avail = info.get("MemAvailable", 0) / 1024 / 1024
        used = total - avail
        pct = round(100 * used / total) if total else 0
        return {"used_gb": round(used, 1), "total_gb": round(total, 1), "pct": pct}
    except Exception:
        return {"used_gb": 0, "total_gb": 0, "pct": 0}


def _hwmon_by_name(name):
    for h in glob.glob(os.path.join(HOST_SYS, "class/hwmon/hwmon*")):
        try:
            with open(os.path.join(h, "name")) as f:
                if f.read().strip() == name:
                    return h
        except Exception:
            continue
    return None


def read_cpu_temp():
    h = _hwmon_by_name("coretemp")
    if not h:
        return 0
    # find "Package id 0" label, else max core
    best = 0
    for t in glob.glob(os.path.join(h, "temp*_input")):
        lbl_path = t.replace("_input", "_label")
        try:
            lbl = open(lbl_path).read().strip() if os.path.exists(lbl_path) else ""
            val = int(open(t).read()) / 1000
            if "Package" in lbl:
                return round(val)
            best = max(best, val)
        except Exception:
            continue
    return round(best)


def read_fans():
    h = _hwmon_by_name("zettos_pwm_fan")
    fans = []
    if h:
        for f in sorted(glob.glob(os.path.join(h, "fan*_input"))):
            try:
                rpm = int(open(f).read().strip() or 0)
                fans.append(rpm)
            except Exception:
                fans.append(0)
    return fans


def _discover_disks():
    """Auto-discover physical disks and classify their role:
      - 'data'  : rotational HDD (main storage bays)
      - 'cache' : non-rotational NVMe/SSD that is NOT the OS drive
      - 'os'    : the OS/system NVMe (OS_NVME env)
    Honors DISKS env override (comma list) if set.
    """
    os_nvme = os.environ.get("OS_NVME", "nvme0n1")

    def rota(name):
        try:
            with open(os.path.join(HOST_SYS, "block", name, "queue/rotational")) as f:
                return f.read().strip() == "1"
        except Exception:
            return name.startswith("sd")  # assume sd* spinning if unknown

    def classify(name):
        if name == os_nvme:
            return "os"
        return "data" if rota(name) else "cache"

    override = os.environ.get("DISKS", "").strip()
    if override:
        return [{"dev": d, "role": classify(d)} for d in override.split(",")]
    disks = []
    try:
        names = sorted(os.listdir(os.path.join(HOST_SYS, "block")))
        for name in names:
            if name.startswith("sd") and len(name) == 3:      # sda..sdf
                disks.append({"dev": name, "role": classify(name)})
        for name in names:
            if name.startswith("nvme") and name.endswith("n1"):
                disks.append({"dev": name, "role": classify(name)})
    except Exception:
        pass
    return disks


def _short_name(dev, idx_nvme):
    if dev.startswith("nvme"):
        return "nv" + dev[4]           # nvme0n1 -> nv0, nvme1n1 -> nv1
    return dev                          # sda, sdb, ...


def _parse_smart(text, is_nvme):
    """Extract temp + failure indicators from `smartctl -H -A` output.
    Returns (temp, health) where health is 'ok' | 'warn' | 'crit'.
    """
    temp = None
    passed = None          # SMART overall-health verdict
    realloc = pending = offline = crc = 0
    nvme_spare = None; nvme_spare_thresh = None; nvme_used = None; nvme_media_err = 0

    for line in text.splitlines():
        s = line.strip()
        low = s.lower()

        # overall-health verdict
        if "overall-health" in low:
            passed = "passed" in low   # "... result: PASSED/FAILED"

        # temperature
        if s.startswith("Temperature:"):                      # NVMe
            nums = [int(x) for x in s.split() if x.isdigit()]
            if nums: temp = nums[0]
        elif ("Temperature_Celsius" in s or "Airflow_Temperature" in s) and temp is None:
            cols = s.split()
            if len(cols) >= 10 and cols[9].isdigit():
                temp = int(cols[9])

        # ATA failure attributes (RAW value = last-ish column; use col 10 if present)
        def raw(cols):
            return int(cols[9]) if len(cols) >= 10 and cols[9].lstrip("-").isdigit() else 0
        if "Reallocated_Sector_Ct" in s:      realloc  = raw(s.split())
        elif "Current_Pending_Sector" in s:   pending  = raw(s.split())
        elif "Offline_Uncorrectable" in s:    offline  = raw(s.split())
        elif "UDMA_CRC_Error_Count" in s:     crc      = raw(s.split())

        # NVMe health fields
        if is_nvme:
            def pct_val(txt):
                return [int(x.rstrip("%")) for x in txt.split() if x.rstrip("%").isdigit()]
            if low.startswith("available spare:"):
                v = pct_val(s)
                if v: nvme_spare = v[0]
            elif low.startswith("available spare threshold:"):
                v = pct_val(s)
                if v: nvme_spare_thresh = v[0]
            elif low.startswith("percentage used:"):
                v = pct_val(s)
                if v: nvme_used = v[0]
            elif "media and data integrity errors" in low:
                v = [int(x.replace(",", "")) for x in s.split() if x.replace(",", "").isdigit()]
                if v: nvme_media_err = v[-1]

    # ---- compute health level ----
    health = "ok"
    # CRIT: hard failure signals
    if passed is False: health = "crit"
    if pending > 0 or offline > 0: health = "crit"
    if nvme_media_err > 0: health = "crit"
    if nvme_spare is not None and nvme_spare_thresh is not None and nvme_spare <= nvme_spare_thresh:
        health = "crit"
    if temp is not None and temp >= 60: health = "crit"
    # WARN: early-warning signals (only if not already crit)
    if health != "crit":
        if realloc > 0 or crc > 0: health = "warn"
        elif nvme_used is not None and nvme_used >= 80: health = "warn"
        elif temp is not None and temp >= 50: health = "warn"
    return temp, health


def read_disk_temps():
    out = []
    show_os = os.environ.get("SHOW_OS_DISK", "0") == "1"
    for d in _discover_disks():
        dev_name = d["dev"]
        role = d["role"]
        if role == "os" and not show_os:
            continue
        dev = HOST_DEV.rstrip("/") + "/" + dev_name
        is_nvme = dev_name.startswith("nvme")
        dtype = "nvme" if is_nvme else "sat"
        temp, health = None, "ok"
        try:
            r = subprocess.run(
                ["smartctl", "-H", "-A", "-d", dtype, dev],
                capture_output=True, text=True, timeout=10
            )
            temp, health = _parse_smart(r.stdout, is_nvme)
        except Exception:
            temp, health = None, "ok"
        out.append({"name": _short_name(dev_name, 0), "temp": temp,
                    "role": role, "health": health})
    return out


def read_storage():
    try:
        u = shutil.disk_usage(POOL_PATH)
        total_gb = u.total / 1e9
        used_gb = u.used / 1e9
        pct = round(100 * u.used / u.total) if u.total else 0

        def fmt(g):
            return f"{g/1000:.0f}TB" if g >= 1000 else f"{g:.0f}GB"
        return {"used": fmt(used_gb), "total": fmt(total_gb), "pct": pct}
    except Exception:
        return {"used": "0GB", "total": "0GB", "pct": 0}


def read_uptime():
    try:
        with open(os.path.join(HOST_PROC, "uptime")) as f:
            secs = float(f.read().split()[0])
        h = int(secs // 3600)
        m = int((secs % 3600) // 60)
        if h >= 24:
            return f"{h//24}d {h%24}h"
        return f"{h}h {m}m"
    except Exception:
        return "?"


def read_ip():
    try:
        r = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=3)
        ips = [i for i in r.stdout.split() if "." in i and not i.startswith("172.")]
        return ips[0] if ips else "?"
    except Exception:
        return "?"


def collect():
    disks = read_disk_temps()
    bad = [d for d in disks if d.get("health") in ("warn", "crit")]
    if any(d.get("health") == "crit" for d in disks):
        status = f"{len(bad)} ALERT"
    elif bad:
        status = f"{len(bad)} WARN"
    else:
        status = f"{len(disks)} OK"
    return {
        "name": NAS_NAME,
        "status": status,
        "clock": time.strftime("%H:%M"),
        "ip": read_ip(),
        "storage": read_storage(),
        "cpu": {"temp": read_cpu_temp(), "util": read_cpu_util()},
        "mem": read_mem(),
        "fans": read_fans(),
        "uptime": read_uptime(),
        "disks": disks,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/stats"):
            body = json.dumps(collect()).encode()
            self._send(200, body, "application/json")
            return
        path = "index.html" if self.path in ("/", "") else self.path.lstrip("/")
        fp = os.path.join(STATIC_DIR, os.path.basename(path))
        if os.path.exists(fp):
            ctype = ("text/html" if fp.endswith(".html")
                     else "text/css" if fp.endswith(".css")
                     else "application/javascript" if fp.endswith(".js")
                     else "application/octet-stream")
            with open(fp, "rb") as f:
                self._send(200, f.read(), ctype)
        else:
            self._send(404, b"not found", "text/plain")


if __name__ == "__main__":
    read_cpu_util()  # prime the delta
    port = int(os.environ.get("PORT", "8080"))
    print(f"NAS LCD dashboard on :{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
