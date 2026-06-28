# ARCHITECTURE.md – honey_please Project Map

**Version:** 1.5.0 | **Board:** Arduino Uno R4 WiFi | **Last updated:** 2026-06-27

> This is the **single entry point** for all architectural, structural, and design knowledge in this project.  
> AI agents: read this file first, then load only the sub-documents listed under the relevant domain.

---

## System Overview

```
Developer-PC
  ├── Browser  (Web UI from local dev server)
  │     ├── GET  http://192.168.178.70/status    ← JSON snapshot
  │     └── WS   ws://192.168.178.70/ws          ← 10 Hz bidirectional JSON
  │
  └── VS Code + PlatformIO
      └── USB flash → auto-detected COM port  →  Arduino Uno R4 WiFi

Arduino Uno R4 WiFi  (192.168.178.70)
  ├── RA4M1 MCU  (Cortex-M4 @ 48 MHz · 256 KB Flash · 32 KB SRAM)
  │     ├── WiFiServer/WiFiClient (synchronous, port 80)
  │     │       GET /status  · WS /ws  · CORS *
  │     ├── USB Serial CDC  (debug + command interface)
  │     ├── RampController  → IMotorDriver
  │     ├── ErrorHandler    → IMotorDriver + IRpmSource
  │     ├── ProgramRunner   (multi-step extraction sequence)
  │     ├── Session         (in-memory ring buffer ≤50 entries)
  │     ├── Params          (EEPROM-persisted configuration)
  │     ├── IMotorDriver  ◄─ HAL ─► SimMotorDriver | RealMotorDriver
  │     └── IRpmSource    ◄─ HAL ─► SimRpmSource   | RealRpmSource
  │
  └── Internal ESP32-S3  (WiFi co-processor · transparent via WiFiS3.h)
        ⚠️  NOT user-accessible — no external wiring

Motor Driver (Oriental Motor BLF)  ←  GPIO relays (D2, D3)
RPM Sensor  →  Pin 2 (INT0, 5 V tolerant)
Membrane Keypads  →  Pins D4–D9 (INPUT_PULLUP)
```

---

## Project Folder Map

### Development Chains

- `basic-control/` = current working chain (wiring verification + basic control).
- `advanced-control/` = target architecture chain (currently not working end-to-end).

```
honey_please/
  ARCHITECTURE.md           ← you are here
  AGENTS.md                 ← AI agent rules & workflow instructions
  README.md                 ← quick-start, board IP, commands
  platformio.ini            ← build environments, pin comments, library deps
  package.json              ← npm scripts (build, deploy, serve, test)
  deploy.js                 ← compile + USB flash + selfcheck orchestrator
  basic_control_flash.js    ← basic-control sketch build/flash
  serve.js                  ← local Web UI dev server (port 3000)
  secrets.h.template        ← WiFi credentials template (not committed)
  │
  advanced-control/         ← ADVANCED CONTROL CHAIN (env: r4wifi, not yet stable)
  │   main.cpp              ← setup(), loop(), HAL wiring
  │   web_api.cpp/h         ← HTTP + WebSocket server
  │   motor_driver.h        ← IMotorDriver interface
  │   ramp_controller.cpp/h ← linear ramp, 20 Hz tick
  │   rpm_source.h          ← IRpmSource interface
  │   sim_rpm_source.h      ← SimRpmSource implementation
  │   error_handler.cpp/h   ← error codes E01–E09, EMERGENCY_STOP
  │   program.cpp/h         ← ProgramRunner, step sequencer
  │   session.cpp/h         ← extraction session ring buffer
  │   params.cpp/h          ← EEPROM-persisted params
  │   log.h                 ← Serial.println wrapper
  └── docs/                 ← ALL DOCUMENTATION
  │   FEATURE-OVERVIEW.md   ← milestone tracker (Phase 0–6, open items)
  │   r4wifi_onboarding.md  ← first flash, WiFi setup, dev server
  │   current_task.md       ← active task plan & progress log
  │   base_honey_extractor_controller.ino        ← legacy reference sketch
  │   │
  │   hardware/             ← HARDWARE DOMAIN
  │   │   README.md         ← constraints, relay isolation rationale, Phase 5 blockers
  │   │   motor-driver.md   ← BLF driver: 3-wire relay logic rationale, relay config
  │   │
  │   webui/                ← WEB UI DOMAIN
  │   │   README.md         ← UI architecture, CORS, dev server setup
  │   │   websocket-protocol.md ← WS/HTTP message schema, commands, error codes
  │   │
  │   simulation/           ← SIMULATION DOMAIN
  │   │   README.md         ← HAL pattern, sim drivers, fault injection, basic-control sketch
  │   │
  │   ops/                  ← OPERATIONS DOMAIN
  │   │   README.md         ← quick-ref scripts, serial monitor, when-things-go-wrong
  │   │   deploy.md         ← full deploy workflow + failure decision tree
  │   │
  │   features/             ← FEATURE SPECIFICATIONS
  │       F01-motor-control-architecture.md
  │       F02-rpm-monitoring.md
  │       F03-acceleration-deceleration-ramps.md
  │       F04-direction-control.md
  │       F05-error-states.md
  │       F06-rpm-limits-and-params.md
  │       F07-webui-schematic-view.md
  │       F08-simulation-mode.md
  │       F09-multistep-program.md
  │       F10-extraction-session.md
  │       F11-platform-migration-r4-wifi.md
  │
  data/                     ← WEB UI (served from dev-PC, NOT the board)
  │   index.html
  │   style.css
  │   app.js                ← WS client, state rendering, control commands
  │
  basic-control/            ← BASIC CONTROL CHAIN (env: r4wifi_basic_control)
  │   main.cpp              ← standalone state machine, no WiFi
  │   ErsteInbetriebnahmeMotorundSteuerung.html  ← interactive wiring diagram
  │
  verify_sketch/            ← BOARD HEALTH CHECK (env: r4wifi_verify)
  │   main.cpp              ← USB CDC, WiFi co-processor probe, echo test
  │
  tests/
  │   selfcheck.js          ← HTTP /status + WebSocket /ws health check
  │   package.json
```

---

## Domain Index — AI Agent Scope Guide

> **Instruction for AI agents:** For each user task, identify the relevant domain(s) below and load only those sub-documents. Do not pre-load all feature docs.

### Hardware

_Use when:_ wiring, pin assignments, motor driver, relay logic, Phase 5 real-hardware work.

| Document | Load for |
|---|---|
| [docs/hardware/README.md](docs/hardware/README.md) | Board constraints, why relay isolation, Phase 5 blockers |
| [docs/hardware/motor-driver.md](docs/hardware/motor-driver.md) | 3-wire relay logic rationale, relay config |
| [docs/ErsteInbetriebnahmeMotorundSteuerung.html](docs/ErsteInbetriebnahmeMotorundSteuerung.html) | Interactive wiring diagram (open in browser) |
| [docs/features/F01-motor-control-architecture.md](docs/features/F01-motor-control-architecture.md) | IMotorDriver HAL, RealMotorDriver |
| [docs/features/F02-rpm-monitoring.md](docs/features/F02-rpm-monitoring.md) | IRpmSource, RealRpmSource, ISR |

### Web UI & Network Protocol

_Use when:_ WebSocket protocol, HTTP endpoints, CORS, `data/app.js`, `web_api.cpp`.

| Document | Load for |
|---|---|
| [docs/webui/README.md](docs/webui/README.md) | UI architecture, CORS, dev server |
| [docs/webui/websocket-protocol.md](docs/webui/websocket-protocol.md) | JSON schema, commands, HTTP endpoints |
| [docs/features/F07-webui-schematic-view.md](docs/features/F07-webui-schematic-view.md) | UI layout, component boxes, sparkline |

### Simulation & HAL

_Use when:_ simulation drivers, fault injection, HAL interfaces, `SimMotorDriver`, `SimRpmSource`, basic-control sketch.

| Document | Load for |
|---|---|
| [docs/simulation/README.md](docs/simulation/README.md) | Sim overview, HAL pattern, build flags |
| [docs/features/F08-simulation-mode.md](docs/features/F08-simulation-mode.md) | Full feature spec, fault injection API |

### Motor Control Logic

_Use when:_ ramp control, direction change, error handling, motor state machine.

| Document | Load for |
|---|---|
| [docs/features/F01-motor-control-architecture.md](docs/features/F01-motor-control-architecture.md) | State machine, motor driver interface |
| [docs/features/F03-acceleration-deceleration-ramps.md](docs/features/F03-acceleration-deceleration-ramps.md) | Ramp algorithm, params |
| [docs/features/F04-direction-control.md](docs/features/F04-direction-control.md) | CW/CCW, safe direction change |
| [docs/features/F05-error-states.md](docs/features/F05-error-states.md) | Error codes E01–E09, EMERGENCY_STOP |

### Parameters & Persistence

_Use when:_ EEPROM, `Params`, configurable values, `set_param` command.

| Document | Load for |
|---|---|
| [docs/features/F06-rpm-limits-and-params.md](docs/features/F06-rpm-limits-and-params.md) | All params, EEPROM schema, validation |

### Multi-Step Program & Sessions

_Use when:_ extraction program, step sequencer, session recording, export.

| Document | Load for |
|---|---|
| [docs/features/F09-multistep-program.md](docs/features/F09-multistep-program.md) | Step sequencer, default 6-step program |
| [docs/features/F10-extraction-session.md](docs/features/F10-extraction-session.md) | Session lifecycle, ring buffer, export |

### Operations & Deploy

_Use when:_ build, flash, selfcheck, dev server, COM port, board IP.

| Document | Load for |
|---|---|
| [docs/ops/README.md](docs/ops/README.md) | Quick-ref scripts, serial monitor, when-things-go-wrong |
| [docs/ops/deploy.md](docs/ops/deploy.md) | Full deploy workflow + failure decision tree |
| [docs/r4wifi_onboarding.md](docs/r4wifi_onboarding.md) | First flash, WiFi setup |

### Milestone & Feature Tracking

_Use when:_ checking status of a milestone, updating milestone after a phase is done.

| Document | Load for |
|---|---|
| [docs/FEATURE-OVERVIEW.md](docs/FEATURE-OVERVIEW.md) | All milestones M0–M6, open items, Phase 5 blockers |

### Platform Migration Reference

_Use when:_ understanding why certain ESP32 features are absent on R4.

| Document | Load for |
|---|---|
| [docs/features/F11-platform-migration-r4-wifi.md](docs/features/F11-platform-migration-r4-wifi.md) | ESP32 → R4 migration rationale, dropped features |

---

## Key Architecture Decisions

| Decision | Rationale | Record |
|---|---|---|
| Web UI served from dev-PC, not board | No LittleFS on R4; 256 KB Flash is too small for web assets | F11, AGENTS.md |
| HAL (IMotorDriver / IRpmSource) | Allows simulation without hardware, clean Phase 5 swap | F01, F08 |
| Synchronous WiFiServer (no async) | ESPAsyncWebServer not available on renesas-ra | F11, web_api.cpp |
| EEPROM for params (not NVS/LittleFS) | Only Arduino EEPROM available on R4 | F06, F11 |
| In-memory session ring buffer (≤50) | No filesystem; 32 KB SRAM budget | F10, F11 |
| No FreeRTOS | R4 is single-threaded; all work done in loop() | AGENTS.md |
| USB flash only (no OTA) | ArduinoOTA not available via PlatformIO renesas-ra | F11, ops/deploy.md |
| `const char*` over `String` | Heap fragmentation risk on 32 KB SRAM | AGENTS.md |
| CORS `Access-Control-Allow-Origin: *` | Dev UI runs on localhost, board on LAN IP | webui/README.md |

---

## Milestone Status Summary

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Foundation (PlatformIO, USB flash, Serial) | ✅ Done (OTA ⚠️ USB only) |
| Phase 1 | HAL + Simulation Drivers | ✅ Done |
| Phase 2 | Ramp Control, Direction, Safety Logic | ✅ Done |
| Phase 3 | Web UI Schematic | ✅ Done |
| Phase 4 | Multi-Step Program & Session Protocol | ✅ Done |
| Phase 5 | Hardware Integration (RealMotorDriver) | 🔲 Blocked (Q1–Q6) |
| Phase 6 | Platform Migration: Arduino Uno R4 WiFi | ✅ Done (2026-05-18) |

> Full milestone detail: [docs/FEATURE-OVERVIEW.md](docs/FEATURE-OVERVIEW.md)

---

## Current Active Task

[docs/current_task.md](docs/current_task.md) — updated after every milestone or structural change.

---

## Maintenance Rules

1. **After any milestone (Mx.y):** Update milestone status in [docs/FEATURE-OVERVIEW.md](docs/FEATURE-OVERVIEW.md) and the summary table above.
2. **After any structural change** (new file, renamed folder, new endpoint): Update the folder map in this file.
3. **After any architectural decision** (new constraint, new pattern): Add a row to the Key Architecture Decisions table.
4. **After any IP/protocol/deploy workflow change:** Update [README.md](README.md) and [docs/ops/deploy.md](docs/ops/deploy.md).
5. **Active task tracking:** Keep [docs/current_task.md](docs/current_task.md) current — open it at the start of every session and close it with a progress update.
