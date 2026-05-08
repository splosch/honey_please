# honey_please – ESP32 Motor Control

ESP32-based motor control system with OTA firmware updates and a browser-accessible web terminal (WebSerial). Built with PlatformIO + Arduino framework.

> **Got a pre-flashed board?** You're in the right place – follow the steps below.  
> **Setting up a blank board for the first time?** → [docs/initial_esp32_setup.md](docs/initial_esp32_setup.md)

---

## Quick Start (Pre-installed Board)

### 1. Prerequisites

| Tool | Notes |
|---|---|
| [VS Code](https://code.visualstudio.com/) + [PlatformIO](https://platformio.org/install/ide?install=vscode) | For building and OTA uploads |
| Node.js | For running the self-check |

### 2. Install test dependencies

```bash
cd tests && npm install
```

### 3. Verify the board is alive

```bash
node tests/selfcheck.js 192.168.178.64
```

Expected:
```
[SELFCHECK PASSED] IP: 192.168.178.64
```

### 4. Open the web terminal

```
http://192.168.178.64/webserial
```

You should see live `[HEARTBEAT]` messages streaming from the board. You can also type commands into the input field – they arrive in the `[CMD]` handler in `src/main.cpp`.

---

## Deploying Code Changes

All updates go over Wi-Fi (OTA) – no USB cable needed:

```bash
pio run --target upload
```

`platformio.ini` already points at the board:

```ini
upload_protocol = espota
upload_port = 192.168.178.64
```

After a successful upload the board reboots (~10 s), then verify:

```bash
node tests/selfcheck.js 192.168.178.64
```

---

## Project Structure

```
honey_please/
├── src/
│   ├── main.cpp          # Main firmware (active code)
│   └── secrets.h         # Wi-Fi credentials – NOT committed (see .gitignore)
├── tests/
│   ├── selfcheck.js      # Connectivity self-check script
│   └── package.json      # Node deps (ws)
├── docs/
│   ├── esp_basic_dev_env.md      # Milestone log & architecture decisions
│   └── initial_esp32_setup.md   # First-time USB flash guide (blank board)
├── platformio.ini        # Board config, OTA settings, library deps
├── AGENTS.md             # Copilot agent instructions
└── example_ota_helloworld.cpp   # Reference sketch (do not edit)
```

---

## Web Terminal

| | |
|---|---|
| URL | `http://192.168.178.64/webserial` |
| Read | Live log output (same as Serial Monitor at 115200 baud) |
| Write | Send commands – handled in `onWebSerialMessage()` in `main.cpp` |

### Log tags

| Tag | Meaning |
|---|---|
| `[START]` | Boot sequence started |
| `[READY]` | All subsystems initialized |
| `[VERSION]` | Firmware version |
| `[INFO]` | Informational message |
| `[HEARTBEAT]` | Periodic keep-alive (every 5 s) |
| `[OTA]` | OTA update event |
| `[CMD]` | Command received from browser |
| `[ERROR]` | Hardware init or connection failure |

---

## Troubleshooting

Run the self-check first – it pinpoints exactly which layer is broken:

```bash
node tests/selfcheck.js 192.168.178.64
```

| Result | Diagnosis |
|---|---|
| HTTP FAIL | Board offline or still booting – wait 10 s and retry |
| HTTP OK + WS Write FAIL | WebSocket route broken – check `WebSerial.begin(&server)` is before `server.begin()` |
| HTTP OK + WS Read TIMEOUT | Board not sending – check `ArduinoOTA.handle()` is in `loop()` |
| OTA upload timeout | Windows firewall blocking port 3232 – see [initial setup guide](docs/initial_esp32_setup.md#step-5--windows-firewall-ota-port-3232) |
| **SELFCHECK PASSED** | Everything nominal |

---

## Architecture Notes

- **`LOG()` macro** – writes to both USB Serial and WebSerial simultaneously. Use it for all application output instead of bare `Serial.println()`.
- **`onWebSerialMessage()`** – entry point for all browser commands; extend here for motor control logic.
- **OTA hostname** – `esp32-motor-control` (also resolvable as `esp32-motor-control.local` via mDNS).
- **IP change** – if the board gets a new IP, update `upload_port` in `platformio.ini`.

---

## Libraries

| Library | Version | Purpose |
|---|---|---|
| `ayushsharma82/WebSerial` | ^2.1.2 | Browser-based serial terminal |
| `me-no-dev/ESPAsyncWebServer` | ^3.6.0 | Async HTTP + WebSocket server |
| `me-no-dev/AsyncTCP` | ^1.1.1 | Async TCP base |
| `ArduinoOTA` | built-in | OTA firmware update |
| `ESPmDNS` | built-in | mDNS hostname resolution |
---

## Architecture Notes

- **All output** goes through the `LOG()` macro – writes to both USB Serial and WebSerial simultaneously. Never use bare `Serial.println()` for application messages.
- **OTA hostname:** `esp32-motor-control` (resolvable as `esp32-motor-control.local` via mDNS on supported networks)
- **`onWebSerialMessage()`** in `main.cpp` is the entry point for all browser commands – extend here for motor control.
- **IP change:** If the board gets a new IP, update `upload_port` in `platformio.ini` and re-run the self-check.

---

## Libraries

| Library | Version | Purpose |
|---|---|---|
| `ayushsharma82/WebSerial` | ^2.1.2 | Browser-based serial terminal |
| `me-no-dev/ESPAsyncWebServer` | ^3.6.0 | Async HTTP + WebSocket server |
| `me-no-dev/AsyncTCP` | ^1.1.1 | Async TCP base for above |
| `ArduinoOTA` | built-in | OTA firmware update |
| `ESPmDNS` | built-in | mDNS hostname resolution |
