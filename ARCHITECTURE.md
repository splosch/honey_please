# ARCHITECTURE.md – honey_please Project Map

**Version:** 1.6.0 | **Board:** Arduino Uno R4 WiFi | **Last updated:** 2026-06-28

This is the central architecture map for the repository.
AI agents: read this file first and keep scope small.

---

## Active Application Scope

- Primary application: `basic-control/`.
- `advanced-control/` is legacy and not part of the default implementation path.
- Work in `advanced-control/` only when explicitly requested.

---

## System Overview (Current Default)

```
Developer-PC
  └── VS Code + PlatformIO
      ├── Build:  npm run basic-control:build
      ├── Flash:  npm run basic-control:flash
      └── Serial monitor (115200) for runtime diagnostics

Arduino Uno R4 WiFi
  ├── RA4M1 MCU (Cortex-M4 @ 48 MHz, 256 KB Flash, 32 KB SRAM)
  │   ├── Basic-control state machine (no WiFi runtime required)
  │   ├── Relay outputs for motor start/direction wiring checks
  │   ├── Keypad inputs (INPUT_PULLUP)
  │   └── USB Serial CDC logging via Serial.println()
  └── Internal ESP32-S3 used only as WiFi co-processor
      (not user-accessible, no external wiring)
```

---

## Project Folder Map

```
honey_please/
  ARCHITECTURE.md
  AGENTS.md
  README.md
  platformio.ini
  package.json
  basic_control_flash.js
  deploy.js
  serve.js

  basic-control/                 <- ACTIVE APP CHAIN (env: r4wifi_basic_control)
    main.cpp                     <- standalone state machine + wiring verification
    config.h                     <- pin/config single source for basic-control
    docs/
      ErsteInbetriebnahmeMotorundSteuerung.html

  advanced-control/              <- LEGACY CHAIN (not used by default)
    ...

  verify_sketch/                 <- board health verification sketch
  tests/                         <- scripts (includes legacy selfcheck)
  docs/
    current_task.md
    FEATURE-OVERVIEW.md
    hardware/
    ops/
    features/
    webui/
    simulation/
```

---

## Domain Index — AI Agent Scope Guide

Use only the smallest relevant documentation set.

### Default domains for current work (basic-control)

| Document | Load when |
|---|---|
| [platformio.ini](platformio.ini) | Checking active env, pins, board constraints |
| [basic-control/main.cpp](basic-control/main.cpp) | Basic control logic or state transitions |
| [basic-control/config.h](basic-control/config.h) | Pin assignment or timing constants |
| [basic-control/docs/ErsteInbetriebnahmeMotorundSteuerung.html](basic-control/docs/ErsteInbetriebnahmeMotorundSteuerung.html) | Wiring validation |
| [docs/hardware/README.md](docs/hardware/README.md) | Hardware constraints and cautions |
| [docs/ops/README.md](docs/ops/README.md) | Build/flash/monitor commands |
| [docs/current_task.md](docs/current_task.md) | Current milestone and working plan |


---

## Key Architecture Decisions

| Decision | Rationale |
|---|---|
| `basic-control/` is the default implementation path | It is the currently working chain in this repository |
| `advanced-control/` is legacy | Not used for normal tasks unless explicitly requested |
| USB serial is the mandatory debug channel | Stable on Uno R4 WiFi and independent from network stack |
| Build-before-flash workflow | Reduces risk and keeps iteration predictable |
| R4 is single-threaded | No FreeRTOS task model in this project path |

---

## Maintenance Rules

1. After structural changes, update this file's folder map and scope notes.
2. After workflow changes, update [README.md](README.md) and [docs/ops/README.md](docs/ops/README.md).
3. Keep [AGENTS.md](AGENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [docs/current_task.md](docs/current_task.md) consistent.
