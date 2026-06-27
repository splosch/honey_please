# Arduino Uno R4 WiFi – Board Setup Guide

> **Migration status:** Complete (2026-05-16). All milestones M6.1–M6.14 verified. See [F11](./features/F11-platform-migration-r4-wifi.md) for the full migration history.

This guide covers the one-time setup for a new board or after a recovery flash. For the day-to-day deploy workflow, see [docs/ops/deploy.md](./ops/deploy.md).

---

## Prerequisites

| Item | Notes |
|---|---|
| Arduino Uno R4 WiFi | USB-C cable — must be a data cable, not charge-only |
| VS Code + PlatformIO | Install PlatformIO extension from Marketplace |
| Node.js ≥ 18 | For `npm run deploy` and `npm start` |
| 2.4 GHz or 5 GHz WiFi | R4 supports both via internal ESP32-S3 co-processor |

No additional USB driver is needed — the R4 uses native USB CDC.

---

## Step 1 – WiFi Credentials

Create `advanced-control/secrets.h` — **this file is `.gitignore`d, never commit it**:

```cpp
#define WIFI_SSID     "your-network-name"
#define WIFI_PASSWORD "your-password"
```

---

## Step 2 – First Flash

The R4 WiFi has an auto-reset circuit; you do not need to hold a BOOT button.

```bash
npm install          # once — installs ws package for selfcheck
npm run deploy       # compile + flash + selfcheck
```

**If upload fails** ("No device found" / port disappears mid-upload):
1. Press the white RESET button **twice rapidly** in quick succession.
2. The orange LED starts breathing slowly — the board is now in bootloader mode.
3. Retry `npm run deploy`.
4. If it still fails, check Device Manager (Windows) for the COM port number and pass it explicitly: `node deploy.js COM5`.

---

## Step 3 – Verify Boot

Open Serial Monitor at 115200 baud (`pio device monitor --port COM4 --baud 115200`).

Expected output:
```
[BOOT]  honey_please v1.5.0
[WIFI]  Connecting to <ssid>...
[WIFI]  Connected. IP: 192.168.x.x
[HTTP]  Server started on port 80
[WS]    WebSocket /ws ready
[SIM]   SimMotorDriver + SimRpmSource active
[READY] Board up.
```

Any `[ERROR]` line at boot is a hardware or configuration problem. Copy the full output from `[BOOT]` for diagnosis.

> **OTA is not available** via PlatformIO renesas-ra. Flash exclusively via USB (`npm run deploy`).

---

## Step 4 – Connect the Web UI

```bash
npm start    # starts serve.js — open http://localhost:3000 in your browser
```

The UI connects to the board via WebSocket. If it shows "Connecting…" forever, check `BOARD_IP` in `data/app.js` — it must match the IP printed by `[WIFI] IP: …` in Serial Monitor.

For CORS and dev server details see [docs/webui/README.md](./webui/README.md).
