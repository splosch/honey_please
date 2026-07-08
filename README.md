# honey_please – Honigschleuder Motor Control

Motor control system for a honey extractor. Built with PlatformIO + Arduino framework for the Arduino Uno R4 WiFi.

> **Hardware:** Arduino Uno R4 WiFi (RA4M1 @ 48 MHz) · Firmware v1.6.0  
> **Status:** Phase 0–2 fully verified on R4. Phase 3–4 board-side verified.

---

## Quick Start

### 1. Prerequisites

| Tool | Notes |
|---|---|
| [VS Code](https://code.visualstudio.com/) + [PlatformIO](https://platformio.org/install/ide?install=vscode) | Build and flash |
| Node.js ≥ 18 | Flash helper script |

### 2. Install dependencies

```bash
npm install
```

### 3. Build the firmware

```bash
npm run build
```

### 4. Flash the board (USB)

```bash
npm run flash
```

Override USB port if needed:

```bash
node basic_control_flash.js COM5
```

### 5. USB Serial Monitor (debug + commands)

```bash
pio device monitor -e r4wifi_basic_control --baud 115200
```

---

## USB Serial Commands

Connect with `pio device monitor -e r4wifi_basic_control --baud 115200` and type:

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
├── basic-control/
│   ├── main.cpp                  # Firmware entry point + state machine
│   ├── config.h                  # Pin assignment + timing constants
│   ├── controller_state.h/.cpp   # State model + transition API
│   ├── controller_logic.h/.cpp   # State machine transitions
│   └── docs/
│       └── ErsteInbetriebnahmeMotorundSteuerung.html
├── verify_sketch/
│   └── main.cpp                  # Standalone board health check
├── basic_control_flash.js        # Build/flash helper
├── platformio.ini                # Board config, build flags, library deps
├── package.json                  # npm scripts
├── AGENTS.md                     # Copilot agent instructions
└── ARCHITECTURE.md               # Central architecture map
```

---

## platformio.ini Environments

| Environment | Purpose |
|---|---|
| `r4wifi_basic_control` | Active firmware (build + flash via `basic_control_flash.js`) |
| `r4wifi_verify` | Board health verification sketch |

---

## Libraries

| Library | Purpose |
|---|---|
| `bblanchon/ArduinoJson @ ^7.3.1` | JSON serialization |
| `WiFiS3` | WiFi (bundled with renesas-ra) |
| `EEPROM` | Params persistence (bundled) |

---

## Architecture Notes

- **Single-threaded** — no FreeRTOS, no mutexes. Everything runs in `loop()`.
- **USB Serial is the debug channel** — no WebSerial, no network stack at runtime.
- **EEPROM layout** — `MotorParams` at offset 0, magic byte at offset 16, program steps at offset 32.
