# ARCHITECTURE.md – honey_please Project Map

**Version:** 1.7.0 | **Board:** Arduino Uno R4 WiFi | **Last updated:** 2026-07-08

This is the central architecture map for the repository.
AI agents: read this file first and keep scope small.

---

## Active Application Scope

- Primary application: `basic-control/`.
- The former `advanced-control/` chain has been removed (archived as .zip).

---

## System Overview (Current Default)

```
Developer-PC
  └── VS Code + PlatformIO
      ├── Build:  npm run build
      ├── Flash:  npm run flash
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

  basic-control/                 <- ACTIVE APP CHAIN (env: r4wifi_basic_control)
    main.cpp                     <- application entry + state machine wiring
    config.h                     <- pin/config single source for basic-control
    controller_state.h           <- explicit controller state model and transition API
    controller_state.cpp         <- controller state transitions and ramp timing logic
    controller_logic.h           <- controller tick interface (state machine extraction)
    controller_logic.cpp         <- state machine transitions operating on input snapshots
    docs/
      ErsteInbetriebnahmeMotorundSteuerung.html

  verify_sketch/                 <- board health verification sketch
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
| [basic-control/controller_state.h](basic-control/controller_state.h) | Controller state types and transition helpers |
| [basic-control/controller_state.cpp](basic-control/controller_state.cpp) | Ramp progress and effective ramp durations |
| [basic-control/controller_logic.h](basic-control/controller_logic.h) | Controller tick API for state machine execution |
| [basic-control/controller_logic.cpp](basic-control/controller_logic.cpp) | State machine transition flow and transition helper orchestration |
| [basic-control/docs/ErsteInbetriebnahmeMotorundSteuerung.html](basic-control/docs/ErsteInbetriebnahmeMotorundSteuerung.html) | Wiring validation |

---

## Key Architecture Decisions

| Decision | Rationale |
|---|---|
| `basic-control/` is the only implementation path | It is the currently working chain in this repository |
| USB serial is the mandatory debug channel | Stable on Uno R4 WiFi and independent from network stack |
| Build-before-flash workflow | Reduces risk and keeps iteration predictable |
| R4 is single-threaded | No FreeRTOS task model in this project path |

---

## Maintenance Rules

1. After structural changes, update this file's folder map and scope notes.
2. After workflow changes, update [README.md](README.md).
3. Keep [AGENTS.md](AGENTS.md) and [ARCHITECTURE.md](ARCHITECTURE.md) consistent.
