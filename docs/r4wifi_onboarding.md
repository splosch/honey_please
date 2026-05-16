# Arduino Uno R4 WiFi – Onboarding & Verification Guide

This guide walks from an unprogrammed R4 WiFi board to a fully functional OTA-deployable system, with the Web UI running from your local dev server. Follow every step in order and verify each one before proceeding.

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
[BOOT] honey_please v1.5.0
[WIFI] Connecting to <your-ssid>...
[WIFI] Connected. IP: 192.168.x.x
[OTA]  ArduinoOTA ready
[READY] Board up. Simulation mode active.
```

> **Note the IP address.** You will need it for OTA and the Web UI.

If you see `[WIFI] Connection failed` — check your SSID/password in `secrets.h`, then reflash.

---

## Step 5 – Configure OTA in platformio.ini

Edit `platformio.ini` and activate the OTA lines (currently commented out):

```ini
[env:r4wifi]
; ... existing settings ...
upload_protocol = arduinoota
upload_port     = 192.168.x.x   ; ← replace with your board's IP
```

> **Tip:** Give the board a static DHCP lease in your router (bind by MAC address) so the IP never changes. The board prints its MAC address on boot if you add `Serial.println(WiFi.macAddress())` to setup.

**Windows Firewall:** OTA uses UDP port 3232. If the upload times out, allow it:
```
netsh advfirewall firewall add rule name="ArduinoOTA R4" dir=in action=allow protocol=UDP localport=3232
```

---

## Step 6 – First OTA Flash

With OTA configured, rebuild and upload wirelessly:

```bash
pio run -e r4wifi --target upload
```

PlatformIO now sends the firmware via WiFi instead of USB. The board reboots automatically.

**Expected output:**
```
Uploading: [============================================================] 100%
```

The board's built-in LED will blink rapidly during the OTA transfer, then go solid when the sketch restarts.

> **Fallback:** If OTA fails (board unreachable, wrong IP), switch back to USB by temporarily commenting out `upload_protocol` and `upload_port` lines.

---

## Step 7 – Run the Self-Check

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

## Step 8 – Connect the Web UI

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

## Step 9 – Agentic Development Workflow (Copilot + PlatformIO)

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
| Upload (USB) | Comment out `upload_protocol`; `pio run -e r4wifi --target upload` |
| Upload (OTA) | Uncomment `upload_protocol = arduinoota`; same command |
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
[OTA]   ArduinoOTA ready
[HTTP]  Server started on port 80
[WS]    WebSocket /ws ready
[SIM]   SimMotorDriver + SimRpmSource active
[READY] Board up.
```

Any `[ERROR]` line at boot indicates a hardware or configuration problem. Copy the full Serial Monitor output from `[BOOT]` and share it for diagnosis.
