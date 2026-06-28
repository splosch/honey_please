# honey_please – Honigschleuder Motor Control

Motor control system for a honey extractor with a browser-accessible Web UI. Built with PlatformIO + Arduino framework.

## Development Chains

- `basic-control/` (working): current stable wiring-verification and control baseline.
- `advanced-control/` (not working end-to-end): future architecture with Web UI, sessions, and advanced control flow.

`npm run basic-control:build` and `npm run basic-control:flash` target the working chain. `npm run build` / `npm run deploy` target `advanced-control/` and are intended for ongoing development, not production usage yet.

> **Hardware:** Arduino Uno R4 WiFi (RA4M1 @ 48 MHz) · IP `192.168.178.70` · Firmware v1.5.0  
> **Status:** Phase 0–2 fully verified on R4. Phase 3–4 board-side verified. M6.14 (full sim run) pending.  
> **ESP32 board:** retired — replaced by R4 WiFi (see [F11](docs/features/F11-platform-migration-r4-wifi.md))

---

## Quick Start (Pre-installed Board)

### 1. Prerequisites

| Tool | Notes |
|---|---|
| [VS Code](https://code.visualstudio.com/) + [PlatformIO](https://platformio.org/install/ide?install=vscode) | Build and flash |
| Node.js ≥ 18 | Selfcheck script + local dev server |

### 2. Install dependencies

```bash
npm install
```

Installs the WebSocket library used by the selfcheck and the built-in dev server.

### 3. Verify the board is alive

```bash
npm test
```

Expected:
```
[SELFCHECK PASSED] IP: 192.168.178.70
```

### 4. Start the Web UI

```bash
npm start
```

Serves `data/` at `http://localhost:5500`. The UI connects to the board at `ws://192.168.178.70/ws` automatically. Use `?ip=<board-ip>` in the URL if your board has a different IP.

### 5. USB Serial Monitor (debug + commands)

```bash
pio device list
pio device monitor --port <port> --baud 115200
```

Type `help` to see all available commands. Boot banner starts with `[BOOT]`.

---

## Deploying Code Changes

Flash via USB — OTA WiFi upload is not available in the renesas-ra PlatformIO toolchain.

This section applies to the `advanced-control/` chain.

```bash
npm run deploy
```

This runs three steps automatically:
1. **Compile** — sanity-checks the sketch (`pio run -e r4wifi`). Aborts on any compiler error.
2. **Port detection** — finds the USB upload port automatically.
3. **Upload** — flashes via USB using the detected port (`pio run -e r4wifi --target upload --upload-port <detected-port>`).
4. **Selfcheck** — waits 12 s for the board to reboot, then verifies HTTP + WebSocket.

To compile without flashing (e.g. after editing firmware files):

```bash
npm run build
```

Override port or board IP if needed:

```bash
node deploy.js COM5 192.168.1.99
```

`platformio.ini` is already configured for the R4 WiFi board:

```ini
[env:r4wifi]
platform  = renesas-ra
board     = uno_r4_wifi
framework = arduino
```

---

## USB Serial Commands

Connect with `pio device monitor --port <port> --baud 115200` and type:

| Command | Effect |
|---|---|
| `help` | Print all commands |
| `status` | Full system state (RPM, ramp, params, errors) |
| `target <rpm>` | Ramp to target RPM |
| `stop` | Ramp to 0 RPM |
| `estop` | Immediate cut (E09 EMERGENCY_STOP) |
| `resetfault` | Clear all errors after fault |
| `dir cw` / `dir ccw` | Direction change (safe ramp sequence) |
| `fault on/off` | Inject/clear simulated driver fault (E06) |
| `sensor on/off` | Inject/clear simulated RPM sensor loss (E03) |
| `set max_rpm <n>` | RPM ceiling (RAM only until `params save`) |
| `set accel <n>` | Acceleration rate RPM/s |
| `set decel <n>` | Deceleration rate RPM/s |
| `set dir_pause <ms>` | Pause between direction changes |
| `params save` | Persist current params to EEPROM |
| `params reset` | Reset params to defaults + save |

---

## Project Structure

```
honey_please/
├── advanced-control/
│   ├── main.cpp              # Firmware entry point (R4 WiFi, v1.5.0)
│   ├── web_api.cpp/.h        # HTTP + WebSocket server (synchronous WiFiServer)
│   ├── motor_driver.h        # IMotorDriver HAL + SimMotorDriver
│   ├── rpm_source.h          # IRpmSource HAL
│   ├── sim_rpm_source.h      # SimRpmSource (reads RampController)
│   ├── ramp_controller.cpp/.h# Linear ramp, 20 Hz tick, ETA
│   ├── error_handler.cpp/.h  # Error codes E03–E09, CRITICAL/FAULT_STOP
│   ├── params.cpp/.h         # MotorParams – EEPROM persistence
│   ├── program.cpp/.h        # Multi-step extraction program (ProgramRunner)
│   ├── session.cpp/.h        # In-memory session ring buffer (≤50 entries)
│   ├── log.h                 # LOG() macro → Serial.println()
│   ├── secrets.h             # Wi-Fi credentials – NOT committed
│   └── docs/
│      ├── FEATURE-OVERVIEW.md   # Milestone tracker + architecture
│      ├── r4wifi_onboarding.md  # First flash, selfcheck, Web UI dev server
│      └── features/             # Per-feature design docs (F01–F11)
├── basic-control/
│   └── main.cpp              # Working wiring-verification + basic control sketch
├── data/
│   ├── index.html            # Web UI – served from local dev server, NOT the board
│   ├── style.css
│   └── app.js                # WebSocket client (connects ws://<board-ip>/ws)
├── tests/
│   ├── selfcheck.js          # Connectivity check: GET /status + WS /ws
│   └── package.json          # ws dependency (also installed via root npm install)

├── verify_sketch/
│   └── main.cpp              # Standalone board health check (env:r4wifi_verify)
├── package.json              # npm scripts for basic-control and advanced-control flows
├── basic_control_flash.js    # Build/flash helper for basic-control (env:r4wifi_basic_control)
├── serve.js                  # Built-in static dev server for data/ (port 5500)
├── platformio.ini            # Board config, build flags, library deps
└── AGENTS.md                 # Copilot agent instructions
```

---

## Board Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/ws` | WebSocket | 10 Hz JSON state frames; accepts command frames |
| `/status` | GET | JSON system snapshot |
| `/sessions` | GET | Session ring-buffer list |
| `/sessions?id=N` | GET | JSONL export of session N |

All HTTP responses include `Access-Control-Allow-Origin: *` (CORS for local dev server).

### WebSocket state frame (10 Hz)

```json
{
  "rpm": 0, "target": 0, "eta": 0, "state": "IDLE",
  "duty": 0, "dir": "CW", "enabled": false, "fault": false,
  "sim": true, "critical": false, "errors": [],
  "params": { "max_rpm": 100, "accel_rate": 10, "decel_rate": 15, "dir_pause_ms": 2000 },
  "prog": { "state": "IDLE", "step": 0, "total": 6 },
  "session": { "active": false, "id": 0 },
  "uptime": 12345
}
```

---

## Troubleshooting

Run the selfcheck first — it pinpoints exactly which layer is broken:

```bash
npm test
```

| Result | Diagnosis | Next step |
|---|---|---|
| HTTP FAIL + WS FAIL | Board offline or wrong IP | `ping 192.168.178.70`; check Serial Monitor for `[WIFI] IP:` |
| HTTP OK + WS FAIL | HTTP server up, `/ws` route missing | Check `webApi.tick()` in `loop()` |
| HTTP OK + WS TIMEOUT | WS connected but no frames | Check loop timing; ensure WiFi connected |
| **SELFCHECK PASSED** | Everything nominal | — |

**Board IP changed?** Open Serial Monitor (`pio device monitor --port <port> --baud 115200`) and look for `[WIFI] IP: x.x.x.x`, or check the FRITZ!Box device list at `http://192.168.178.1`.

---

## Libraries

| Library | Purpose |
|---|---|
| `bblanchon/ArduinoJson @ ^7.3.1` | JSON serialization for WS frames |
| `WiFiS3` | WiFi (bundled with renesas-ra, no lib_deps entry needed) |
| `EEPROM` | Params + program step persistence (bundled) |

---

## Architecture Notes

- **Simulation mode active** — `SimMotorDriver` + `SimRpmSource` are used; no GPIO output until Phase 5 hardware integration.
- **Single-threaded** — no FreeRTOS, no mutexes. Everything runs in `loop()`.
- **Web UI is NOT served by the board** — open `data/index.html` from a local dev server; the board only exposes WebSocket + REST.
- **LOG()** — writes directly to `Serial.println()` (USB CDC). No WebSerial, no FreeRTOS queue.
- **EEPROM layout** — `MotorParams` at offset 0, magic byte at offset 16, program steps at offset 32.
- **IP change** — update `upload_port` in `platformio.ini` (OTA section, currently commented out) and re-run the selfcheck.
