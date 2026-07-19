# honey_please – Honigschleuder Motor Control

Motor control system for a honey extractor. Built with PlatformIO + Arduino framework for the Arduino Uno R4 WiFi.

> **Hardware:** Arduino Uno R4 WiFi (RA4M1 @ 48 MHz) · Firmware v1.6.0  
> **Status:** Phase 0–2 fully verified on R4.

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

### 6. Interactive Documentation + BMP Snapshots

```bash
npm run docs          # Serve interactive docs (wiring, state machine, snapshots)
npm run snapshot      # Generate versioned BMP snapshots of all 41 simulation scenarios
```

- **`npm run docs`** — serves the tabbed documentation app (⚡ wiring schematic, 📊 state machine visualizer, 📋 snapshot viewer).
- **`npm run snapshot`** — headless batch simulation → versioned BMP folder. See [ImplementationQuestions.md](basic-control/VisualizeStateTransitions/ImplementationQuestions.md#10-snapshot-system) for details.

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
├── basic-control/                # Active firmware (C++ source + interactive docs)
│   ├── *.cpp / *.h               # Firmware: main, state machine, config, I/O
│   ├── VisualizeStateTransitions/ # BMP snapshot generator + viewer
│   └── docs/                     # Interactive documentation (Vue 3, zero-build)
├── verify_sketch/                # Standalone board health check
├── basic_control_flash.js        # Build/flash helper
├── platformio.ini                # Board config, build flags, library deps
├── package.json                  # npm scripts (build, flash, docs, snapshot)
├── AGENTS.md                     # Copilot agent instructions
└── ARCHITECTURE.md               # Central architecture map
```
> Full directory trees: [ARCHITECTURE.md](ARCHITECTURE.md) (project map) · [ARCHITECTURE_ANALYSIS.md](basic-control/docs/ARCHITECTURE_ANALYSIS.md) (docs subsystem)

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

---

## Publish Documentation with GitHub Pages

This repository includes a ready-to-use workflow:

- `.github/workflows/deploy-docs-pages.yml`

### What it deploys

The workflow publishes a static site containing:

- `basic-control/docs` (entry UI)
- `basic-control/VisualizeStateTransitions` (embedded visualizers + snapshot data)

This preserves the required relative paths between docs, iframe pages, and BMP snapshots.

### How to enable

1. Push to the `main` branch.
2. In GitHub: **Settings → Pages → Source = GitHub Actions**.
3. Wait for workflow **Deploy Documentation to GitHub Pages** to finish.

### URL

Open:

- `https://<your-user>.github.io/<your-repo>/docs/`

### Update behavior

Deployment runs automatically when relevant files change in:

- `basic-control/**`
- `package.json`
- `package-lock.json`

You can also run it manually via **Actions → Deploy Documentation to GitHub Pages → Run workflow**.
