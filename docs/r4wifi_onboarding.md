# Arduino Uno R4 WiFi – Onboarding & Verification Guide

This guide walks from an unprogrammed R4 WiFi board to a fully functional OTA-deployable system, with the Web UI running from your local dev server. Follow every step in order and verify each one before proceeding.

> **✅ CURRENT STATE (2026-05-16):** Migration complete. All source files compile cleanly for `[env:r4wifi]`. Board verified at `192.168.178.70`. Selfcheck PASSED (HTTP + WebSocket). Steps 0–11 done. Steps 12–15 (Web UI + simulation run) are next.
>
> **Note on OTA:** `ArduinoOTA` is **not available** in the `renesas-ra` PlatformIO package. USB flash via `sam-ba` is the current upload workflow. OTA may become available in a future platform release.

---

## Verification Checklist (Top-Level)

| Step | What | Maps to | Status |
|---|---|---|---|
| 0 | Hardware pre-check: board, cable, COM port | M0.2 pre-req | ✅ |
| 1 | WiFi credentials in `secrets.h` | M6.2 pre-req | ✅ |
| 2 | Board package + R4 Arduino core installed | M0.1 on R4 | ✅ |
| 3 | Rewrite `log.h` for R4 (no FreeRTOS, no WebSerial) | M6.10 | ✅ |
| 4 | Rewrite `params.cpp` for R4 (EEPROM, no NVS) | M6.8 | ✅ |
| 5 | Rewrite `session.cpp` for R4 (ring buffer, no LittleFS) | M6.9 | ✅ |
| 6 | Rewrite `web_api.cpp` for R4 (sync WiFiServer/WiFiClient) | M6.4 | ✅ |
| 7 | Rewrite `main.cpp` for R4 (WiFiS3, USB Serial, no FreeRTOS) | M6.2 | ✅ |
| 8 | First USB flash – verify Serial output and WiFi connect | M0.2, M0.3 on R4 | ✅ |
| 9 | USB Serial command interface verified | M6.3 | ✅ |
| 10 | USB flash workflow (OTA not available in renesas-ra PlatformIO) | M6.13 | ✅ (USB) |
| 11 | Run `selfcheck.js` – HTTP + WebSocket pass | M6.12 check | ✅ |
| 12 | Start local dev server, Web UI connects to board | M6.14 pre-req | ✅ |
| 13 | Full simulation run in browser (6-step program) | M6.14 | 🔲 |
| 14 | Fault injection panel verified in SIM mode | M6.14, F08 | 🔲 |
| 15 | Status LED behavior verified (`LED_BUILTIN`) | M6.11 | 🔲 |

---

## Prerequisites

| Item | Notes |
|---|---|
| Arduino Uno R4 WiFi | USB-C cable (data, not charge-only) |
| VS Code | [Download](https://code.visualstudio.com/) |
| PlatformIO extension | Install from VS Code Marketplace |
| Node.js ≥ 18 | For `tests/selfcheck.js` |
| WiFi network | 2.4 GHz. Note: R4 WiFi supports both 2.4 and 5 GHz (ESP32-S3 co-processor) |

> **No additional USB driver needed.** The R4 WiFi uses native USB CDC. Windows 10/11, macOS, and Linux all recognise it without driver installation.

---

## Step 1 – WiFi Credentials

Create `src/secrets.h` (this file is `.gitignore`d — never commit it):

```cpp
#define WIFI_SSID     "your-network-name"
#define WIFI_PASSWORD "your-password"
```

---

## Step 2 – Install Test Dependencies

```bash
cd tests && npm install
```

This installs the `ws` package used by `selfcheck.js`.

---

## Step 3 – First Flash via USB

The R4 WiFi has an **auto-reset circuit**. Unlike the old ESP32 clone board, you do **not** need to hold BOOT.

1. Connect the board via USB-C.
2. PlatformIO should detect it automatically (bottom status bar shows the COM port).
3. Build and upload:

```bash
pio run -e r4wifi --target upload
```

Or use the PlatformIO sidebar: **Project Tasks → r4wifi → Upload**.

**Expected terminal output (success):**
```
Linking .pio/build/r4wifi/firmware.elf
Checking size .pio/build/r4wifi/firmware.elf
...
Uploading .pio/build/r4wifi/firmware.bin
...
Verified OK
```

**If the upload fails** with "No device found" or "Permission denied":
- Windows: Check Device Manager → Ports. The board should appear as "USB Serial Device (COMx)".
- Linux/macOS: Check `ls /dev/ttyACM*` or `/dev/tty.usbmodem*`.
- If the board disappeared from the port list mid-upload, the sketch may have crashed. Press the RESET button and try again.

---

## Step 4 – Verify via USB Serial Monitor

Open the Serial Monitor at **115200 baud**:
- PlatformIO: click the plug icon in the bottom toolbar, or run `pio device monitor -e r4wifi`
- Arduino IDE: Tools → Serial Monitor

**Expected output after boot:**
```
[BOOT]  honey_please v1.5.0
[WIFI]  Connecting to <ssid>...
[WIFI]  Connected. IP: 192.168.x.x
[HTTP]  Server started on port 80
[WS]    WebSocket /ws ready
[SIM]   SimMotorDriver + SimRpmSource active
[READY] Board up.
```

> **Note:** There is no `[OTA]` line — ArduinoOTA is not available in the renesas-ra PlatformIO package and has been removed from the sketch. Upload via USB only.

---

## Step 5 – Note on OTA (Not Available)

`ArduinoOTA` is **not included** in the `renesas-ra` PlatformIO platform package (as of 2026-05-16). The `upload_protocol = arduinoota` lines in `platformio.ini` are commented out.

**Current workflow — USB flash:**
```bash
pio run -e r4wifi --target upload --upload-port COM4
```
Replace `COM4` with your board's port (check Device Manager or `pio device list`).

> If OTA becomes available in a future renesas-ra release, uncomment the OTA lines and follow the original instructions. Firewall rule for UDP 3232 may be required on Windows.

---

## Step 6 – Run the Self-Check

After OTA (or USB flash), wait ~10 seconds for the board to boot, then run:

```bash
node tests/selfcheck.js 192.168.x.x
```

The script performs three checks:
1. **HTTP** – `GET /status` → expects HTTP 200 + JSON body
2. **WebSocket connect** – opens `ws://<ip>/ws`
3. **WebSocket read** – waits for at least one JSON frame (10 Hz, so it arrives within 200 ms)

**Expected output (all passing):**
```
[1/3] HTTP GET http://192.168.x.x/status ...
      → HTTP 200 OK
[2/3] WebSocket ws://192.168.x.x/ws ...
      → Connected
[3/3] Waiting for WebSocket frame ...
      → Received: {"rpm":0,"target":0,"state":"IDLE",...}

[SELFCHECK PASSED] IP: 192.168.x.x
```

**Troubleshooting:**

| Symptom | Cause | Fix |
|---|---|---|
| HTTP FAIL (connection refused) | Board not running or wrong IP | `ping <ip>`, check Serial Monitor |
| HTTP OK but WS FAIL | WebSocket handler not registered | Check `web_api.cpp` – is `/ws` route added? |
| WS connects but no frame | `loop()` not calling `webApi.tick()` | Add `webApi.tick()` to `loop()` |
| HTTP TIMEOUT | Port 80 blocked or server not started | Check `server.begin()` in `setup()` |

---

## Step 7 – Connect the Web UI

The Web UI (`data/index.html`) runs on your computer and connects to the board via WebSocket.

### Start the local file server

**Option A – VS Code Live Server (easiest):**
1. Install the "Live Server" VS Code extension.
2. Right-click `data/index.html` in the file explorer → "Open with Live Server".
3. Your browser opens `http://localhost:5500/data/index.html` (or similar port).

**Option B – Node.js (no extension needed):**
```bash
npx serve data -p 5500
# then open http://localhost:5500 in your browser
```

**Option C – Python:**
```bash
python -m http.server 5500 --directory data
# then open http://localhost:5500 in your browser
```

### Point the UI at the board

The Web UI reads the board IP from a config field or URL parameter. Depending on the current `data/app.js` implementation:
- Look for a `BOARD_IP` or `WS_URL` constant near the top of `app.js` and set it to your board's IP.
- Or: append `?ip=192.168.x.x` to the URL.

> **CORS:** The board responds with `Access-Control-Allow-Origin: *` on all HTTP responses. No browser extension or proxy is needed.

### Verify the connection

Once the UI loads:
- The board status box should show `CONNECTED` and the state should be `IDLE`.
- The RPM display should show `0`.
- The SIM mode banner should be visible.

If the WebSocket shows "Connecting..." forever:
1. Open browser DevTools (F12) → Console tab. Look for a CORS error or connection refused.
2. Run `node tests/selfcheck.js <ip>` to isolate whether the board or the UI is the issue.

---

## Step 8 – Agentic Development Workflow (Copilot + PlatformIO)

Once onboarding is complete, the standard development cycle is:

```
Edit code in VS Code
  → Copilot Agent makes changes
  → pio run -e r4wifi --target upload   (OTA, ~30 s)
  → node tests/selfcheck.js <ip>        (automated verify)
  → Check Serial Monitor for [ERROR] / [BOOT] lines
  → Refresh browser UI
```

The Copilot Agent (see `AGENTS.md`) runs this cycle automatically after each code change.

### PlatformIO VSC integration tips

| Task | How |
|---|---|
| Compile only | `pio run -e r4wifi` or click ✓ in PlatformIO toolbar |
| Upload (USB) | `pio run -e r4wifi --target upload --upload-port COM4` |
| Upload (OTA) | Not available in renesas-ra PlatformIO (see Step 5) |
| Serial Monitor | `pio device monitor -e r4wifi` or click plug icon |
| Clean build | `pio run -e r4wifi --target clean` |
| Library update | `pio pkg update -e r4wifi` |

### Flash size check

The R4 WiFi has only 256 KB of program flash. Always check after adding libraries:

```bash
pio run -e r4wifi 2>&1 | grep -E "RAM:|Flash:"
```

If Flash exceeds ~90%, remove unused libraries or reduce `String` usage.

---

## Appendix: Expected Serial Boot Messages

```
[BOOT]  honey_please v1.5.0
[WIFI]  Connecting to <ssid>...
[WIFI]  Connected. IP: 192.168.x.x
[HTTP]  Server started on port 80
[WS]    WebSocket /ws ready
[SIM]   SimMotorDriver + SimRpmSource active
[READY] Board up.
```

Any `[ERROR]` line at boot indicates a hardware or configuration problem. Copy the full Serial Monitor output from `[BOOT]` and share it for diagnosis.
