# Operations – Domain Overview

**Parent:** [ARCHITECTURE.md](../../ARCHITECTURE.md)

This folder documents the operational workflows for building, flashing, testing, and serving the honey_please project.

---

## Contents

| Document | Description |
|---|---|
| [deploy.md](./deploy.md) | Full deploy workflow: compile → flash → selfcheck + failure decision tree |

---

## Quick Reference

```bash
npm run build        # compile only (no flash) — sanity check
npm run deploy       # compile + flash + selfcheck (see deploy.md)
npm start            # start local Web UI dev server
```

Board IP and COM port are set in `package.json` scripts and `platformio.ini`. Override: `node deploy.js COM5 192.168.1.99`.

---

## Serial Monitor

```bash
pio device monitor --port COM4 --baud 115200
```

Expect `[BOOT]` banner within 5 s of power-on. WiFi watchdog prints `[WIFI] IP: x.x.x.x` every 10 s.

---

## When Things Go Wrong

**Board not responding after flash:** The R4 WiFi needs 8–15 s to reconnect WiFi after a reboot. `deploy.js` waits 12 s — if your network is slow, increase the delay in `deploy.js`.

**DHCP IP changed:** Check `[WIFI] IP: x.x.x.x` in Serial Monitor. Update the IP in `package.json` (`test`/`selfcheck` scripts) and in the repo memory (`/memories/repo/honey_please.md`).

**`[ERROR] WiFi connect timeout` in Serial Monitor:** Check `src/secrets.h` — SSID/password must match your network.

**Upload FAILED:** Press the white RESET button **twice rapidly** — board enters bootloader (orange LED breathes). Then retry `npm run deploy`.

---

## Key Scripts

| Script | Purpose |
|---|---|
| `deploy.js` | PlatformIO build + USB flash + post-flash selfcheck |
| `demo_flash.js` | Build/flash `demo/main.cpp` (env `r4wifi_demo`) |
| `serve.js` | Local static file server for `data/` (Web UI) |
| `tests/selfcheck.js` | HTTP + WebSocket health check against board IP |
