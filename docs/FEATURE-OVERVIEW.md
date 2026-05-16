# honey_please – Feature Documentation Overview

**Project:** Honigschleuder Motor Control  
**Board:** Arduino Uno R4 WiFi (RA4M1 @ 48 MHz + internal ESP32-S3 WiFi co-processor)  
**Firmware:** v1.5.0 | Framework: Arduino / PlatformIO  
**ESP32 legacy board:** retired – see [F11](./features/F11-platform-migration-r4-wifi.md)

---

## Quick Links

| Document | Topic |
|---|---|
| **[R4 WiFi Onboarding](./r4wifi_onboarding.md)** | First flash, OTA setup, selfcheck, Web UI dev server |
| **[F01 – Motor Control Architecture](./features/F01-motor-control-architecture.md)** | `IMotorDriver` HAL, `SimMotorDriver`, `RealMotorDriver`, state machine, WebSocket protocol |
| **[F02 – RPM Monitoring](./features/F02-rpm-monitoring.md)** | `IRpmSource` HAL, `SimRpmSource`, `RealRpmSource`, error detection |
| **[F03 – Acceleration/Deceleration Ramps](./features/F03-acceleration-deceleration-ramps.md)** | Ramp algorithm, params, UI visualization |
| **[F04 – Direction Control](./features/F04-direction-control.md)** | CW/CCW, safe direction change sequence |
| **[F05 – Error States](./features/F05-error-states.md)** | Error codes, EMERGENCY_STOP, recovery |
| **[F06 – RPM Limits & Parameters](./features/F06-rpm-limits-and-params.md)** | All configurable params, persistence, validation |
| **[F07 – Web UI Schematic View](./features/F07-webui-schematic-view.md)** | Layout, component boxes, controls, sparkline |
| **[F08 – Simulation Mode](./features/F08-simulation-mode.md)** | HAL-based sim, fault injection, compile-time driver selection |
| **[F09 – Multi-Step Extraction Program](./features/F09-multistep-program.md)** | L-Slow → R-Fast sequence, configuration |
| **[F10 – Honey Extraction Session](./features/F10-extraction-session.md)** | Session lifecycle, protocol log, export |
| **[F11 – Platform Migration: Arduino Uno R4 WiFi](./features/F11-platform-migration-r4-wifi.md)** | Board swap rationale, impact analysis, milestones |

---

## System Architecture (Bird's Eye)

```
Developer-PC
  ├── Browser
  │     Web UI loaded from LOCAL dev server (VS Code Live Server, port 5500 or similar)
  │     Data files: data/index.html, data/style.css, data/app.js
  │     ─────────────────────────────────────────────────────────────────
  │     WS    ws://<board-ip>/ws     →  real-time bidirectional (10 Hz JSON)
  │     GET   http://<board-ip>/status  →  JSON status snapshot
  │     OPTIONS <any>               →  board replies 200 + CORS headers
  │
  └── VS Code + PlatformIO
        OTA upload  →  ArduinoOTA over WiFi  →  Arduino Uno R4 WiFi

Arduino Uno R4 WiFi
  ├── RA4M1 MCU (Cortex-M4 @ 48 MHz, 256 KB Flash, 32 KB SRAM)
  │     ├── WiFiServer (synchronous, port 80)
  │     │       GET /status         → JSON system snapshot
  │     │       WS  /ws             → 10 Hz state frames (ArduinoJson)
  │     │       CORS                → Access-Control-Allow-Origin: *
  │     ├── ArduinoOTA              → WiFi firmware update
  │     ├── USB Serial CDC          → debug output + command interface
  │     ├── RampController          → IMotorDriver
  │     ├── ErrorHandler            → IMotorDriver + IRpmSource
  │     ├── ProgramRunner           → step sequencer
  │     ├── Session                 → in-memory ring buffer (≤50 entries)
  │     ├── Params                  → EEPROM (8 KB emulated)
  │     ├── IMotorDriver  ◄─ HAL ─► SimMotorDriver | RealMotorDriver (5 V GPIO)
  │     └── IRpmSource    ◄─ HAL ─► SimRpmSource   | RealRpmSource (Pin 2, INT0)
  │
  └── Internal ESP32-S3 (WiFi co-processor, transparent via WiFiS3.h)
        ⚠️  NOT user-accessible – no external wiring

Motor Driver  ←  GPIO (Pin 6/7/8/9)
RPM Sensor    →  Pin 2 (INT0, 5 V tolerant)
Motor (Honigschleuder)
```

> **Key architecture decision:** The Arduino board does **not** serve HTML/CSS/JS. The Web UI lives entirely on the developer's machine. The board exposes only a WebSocket endpoint and a minimal REST status endpoint. CORS headers are mandatory so the browser can connect cross-origin.

> **Internal ESP32-S3:** This chip is soldered onto the R4 PCB as the WiFi co-processor for the RA4M1. `WiFiS3.h` is the only interface. Do NOT wire anything to it directly.

---

## Implementation Milestones

### ✅ Phase 0 – Foundation (DONE – on ESP32 legacy board)

- ✅ M0.1: VS Code + PlatformIO setup
- ✅ M0.2: USB flash, Serial Monitor working
- ✅ M0.3: OTA deployment via WiFi
- ✅ M0.4: WebSerial terminal in browser *(ESP32-specific, not carried to R4)*

---

### ✅ Phase 1 – HAL + Simulation Drivers (DONE on ESP32)

**Goal:** Firmware compiles and runs end-to-end with `SimMotorDriver` + `SimRpmSource`. No hardware required.

> The HAL interfaces (`motor_driver.h`, `rpm_source.h`, `sim_motor_driver.h`, `sim_rpm_source.h`) and `ramp_controller.h/.cpp`, `error_handler.h/.cpp` are **platform-independent** and carry over to R4 unchanged. `main.cpp`, `log.h`, `web_api.*`, `params.*`, `session.*`, `program.*` all need R4 rewrites (Phase 6).

| ID | Milestone | Feature Docs |
|---|---|---|
| ✅ M1.1 | `IMotorDriver` interface defined | F01 §2 |
| ✅ M1.2 | `SimMotorDriver` implemented + tested | F01, F08 |
| ✅ M1.3 | `IRpmSource` interface defined | F02 §2 |
| ✅ M1.4 | `SimRpmSource` reads `RampController.getCurrent()` | F02, F08 |
| ✅ M1.5 | `main.cpp` wires drivers via interface pointers | F01 |
| ✅ M1.6 | Fault injection: `injectFault`, `injectSensorLoss` | F08 |
| ✅ M1.7 | Default build uses sim (no `REAL_HARDWARE` flag) | F08 |

---

### ✅ Phase 2 – Ramp Control, Direction & Safety Logic (DONE on ESP32)

**Goal:** Full motor behaviour testable via serial commands, all sim drivers.

| ID | Milestone | Feature Docs |
|---|---|---|
| ✅ M2.1 | `RampController` (linear ramp, 20 Hz tick, ETA) | F03 |
| ✅ M2.2 | Accel/decel configurable via serial command | F03, F06 |
| ✅ M2.3 | Safe direction change: decel → pause → GPIO flip → accel | F04 |
| ✅ M2.4 | `ErrorHandler` with all error codes E01–E09 | F05 |
| ✅ M2.5 | EMERGENCY_STOP: immediate `disable()` + `FAULT_STOP` state | F05 |
| ✅ M2.6 | Fault injection (E03, E06) triggers correct state | F05, F08 |
| ✅ M2.7 | Params persistence via NVS `Preferences` – **R4: replace with EEPROM (M6.8)** | F06 |

---

### ✅ Phase 3 – Web UI Schematic (DONE on ESP32)

**Goal:** Browser shows live system schematic. Developed without hardware.

> ⚠️ **Completed on ESP32 (AsyncWebServer + LittleFS + FreeRTOS).** The Web UI files (`data/`) carry over unchanged. The board-side web server (`web_api.cpp`, `main.cpp`) must be rewritten for R4 as part of Phase 6 (M6.4–M6.7). After that rewrite, all Phase 3 features work identically on R4.

> **Web UI architecture change on R4:** Static files served from developer’s local dev server (not from the board). WebSocket protocol is unchanged.

| ID | Milestone | Feature Docs | Notes |
|---|---|---|---|
| ✅ M3.1 | Static files (`index.html`, `style.css`, `app.js`) served | F07 | ESP32: LittleFS; R4: local dev server |
| ✅ M3.2 | WebSocket `/ws` endpoint, 10 Hz JSON state frames | F01, F07 | Protocol unchanged on R4 |
| ✅ M3.3 | Three component boxes rendered | F07 | |
| ✅ M3.4 | GPIO / internal state live in board box | F07 | |
| ✅ M3.5 | Ramp progress bar + ETA countdown | F03, F07 | |
| ✅ M3.6 | Direction indicator + basket SVG animation | F04, F07 | |
| ✅ M3.7 | Large RPM display + 30 s sparkline | F02, F07 | |
| ⚠️ M3.8 | PAUSE button in control bar | F04, F07 | Optional, not yet added |
| ⚠️ M3.9 | WARNING / ERROR-level banners | F05, F07 | Optional, CRITICAL overlay done |
| ⚠️ M3.10 | Parameters panel (sliders) | F06, F07 | Optional, `set_param` WS command wired |
| ✅ M3.11 | SIM mode indicator banner | F08 | |

---

### ✅ Phase 4 – Multi-Step Program & Session Protocol (DONE on ESP32)

**Goal:** Full extraction workflow end-to-end in simulation. Session log exported and verified.

> ⚠️ **Completed on the ESP32 board.** The logic is sound and the feature set is complete. The R4 port replaces ESP32-specific storage (NVS → EEPROM, LittleFS → ring buffer) and the async web server, tracked in Phase 6 milestones M6.4, M6.8, M6.9.

| ID | Milestone | Feature Docs |
|---|---|---|
| ✅ M4.1 | Multi-step program (6 default steps) stored in NVS params | F09 |
| ✅ M4.2 | Program runner: step sequencer with direction transitions | F09 |
| ✅ M4.3 | Program UI: step bubbles, active highlight, skip/pause/abort | F09 |
| ✅ M4.4 | Session storage: JSONL append to LittleFS `/sessions/sNNN.jsonl` + event on each state change | F10 |
| ✅ M4.5 | Session start/stop on operator command | F10 |
| ✅ M4.6 | RPM samples every 5 s + program/step/error/direction events | F10 |
| ✅ M4.7 | Session summary on stop; `GET /sessions` JSON list | F10 |
| ✅ M4.8 | JSONL export via `GET /sessions?id=N` | F10 |
| ✅ M4.9 | Full 6-step program runs in SIM, session export verified | F08, F09, F10 |

---

### 🔄 Phase 6 – Platform Migration: Arduino Uno R4 WiFi

**Goal:** Sketch runs natively on the Arduino Uno R4 WiFi. WiFi, OTA, WebSocket API, USB Serial, and CORS all verified. Web UI served from developer's local dev server. See [F11](./features/F11-platform-migration-r4-wifi.md).

> **Why before Phase 5:** The R4's 5 V GPIO eliminates the level-shifter required for the 3.3 V ESP32. Migrating now avoids redoing hardware connections.

> **Web UI strategy:** No SD card needed. The `data/` folder is served by any local static file server on the developer's machine. The board only hosts WebSocket + a REST status endpoint.

| ID | Milestone | Feature Docs | Status |
|---|---|---|---|
| ✅ M6.1 | `[env:r4wifi]` only env in `platformio.ini`; ESP32 envs removed | F11 | Done |
| 🔲 M6.2 | `main.cpp` rewritten for R4: `WiFiS3.h`, ArduinoOTA, no FreeRTOS, USB Serial | F11 | Next |
| 🔲 M6.3 | USB Serial command interface (`help`, `status`, `target`, `stop`, `estop`, `resetfault`) | F11 | |
| 🔲 M6.4 | `web_api.cpp` rewritten: synchronous `WiFiServer`/`WiFiClient` replaces `ESPAsyncWebServer` | F11, F07 | |
| 🔲 M6.5 | WebSocket `/ws` alive on R4 (10 Hz JSON frames) | F11, F07 | |
| 🔲 M6.6 | **CORS** – `Access-Control-Allow-Origin: *` on all HTTP responses + OPTIONS preflight | F11 | Critical |
| 🔲 M6.7 | `GET /status` JSON endpoint (replaces legacy WebSerial status command) | F11 | |
| 🔲 M6.8 | EEPROM params persistence (replaces NVS `Preferences`) | F11, F06 | |
| 🔲 M6.9 | In-memory session ring buffer ≤50 entries (replaces LittleFS JSONL) | F11, F10 | |
| 🔲 M6.10 | `log.h` rewritten: direct `Serial.println()`, no FreeRTOS queue, no WebSerial | F11 | |
| 🔲 M6.11 | Status LED on `LED_BUILTIN` (GPIO 13, active-HIGH) | F11 | |
| ✅ M6.12 | `selfcheck.js` updated: checks `/status` + `/ws` (no `/webserial`) | F11 | Done |
| 🔲 M6.13 | WiFi + OTA verified on real R4 hardware (USB-flash first, then OTA) | F11 | |
| 🔲 M6.14 | Full simulation run verified on R4 (WebSocket + USB Serial + Web UI from local dev server) | F11, F08 | |

---

### 🔲 Phase 5 – Hardware Integration (RealMotorDriver)

**Goal:** Swap sim drivers for real GPIO implementations. All other code stays unchanged.

> ⚠️ **Blocked by Q1–Q6 below.** No GPIO code is written until these are answered.  
> Phase 6 (R4 migration in simulation mode) can run in parallel and does not require Q1–Q6.

| ID | Milestone | Feature Docs | Blocker |
|---|---|---|---|
| M5.1 | Hardware confirmed: driver, motor specs, pin wiring, RPM sensor | F01, F02 | Q1–Q6 |
| M5.2 | `motor_config.h` with confirmed `PIN_*` defines | F01 | M5.1 |
| M5.3 | `RealMotorDriver` (PWM + direction GPIO) + `REAL_HARDWARE` build flag | F01 | M5.2 |
| M5.4 | PWM output verified on oscilloscope / multimeter | F01 | M5.3 |
| M5.5 | Direction GPIO toggles confirmed physically | F04 | M5.3 |
| M5.6 | `RealRpmSource` ISR + `PULSES_PER_REVOLUTION` calibrated | F02 | M5.1 |
| M5.7 | nFAULT pin polling and EMERGENCY_STOP verified | F05 | M5.3 |
| M5.8 | End-to-end extraction session with real motor | F09, F10 | M5.6 |

---

## Open / Optional Items from Completed Phases

> Non-blocking — pick up alongside Phase 6 or after.

| ID | Item | Phase | Feature | Priority |
|---|---|---|---|---|
| O-3.1 | PAUSE button in motor control bar | 3 | F04, F07 | Low |
| O-3.2 | WARNING / ERROR-level banners in UI | 3 | F05, F07 | Medium |
| O-3.3 | Parameters panel (sliders for max_rpm, accel, decel, dir_pause) | 3 | F06, F07 | Medium |
| O-4.1 | Step editing UI (change RPM%, duration, add/remove steps) | 4 | F09 | Medium |
| O-4.2 | Live event log in session bar | 4 | F10 | Low |
| O-4.3 | Session history browser (list, view, delete) | 4 | F10 | Low |
| O-4.4 | Plain-text session export | 4 | F10 | Low |
| O-4.5 | `RAMP_START` / `RAMP_COMPLETE` session events in RampController | 4 | F10 | Low |
| O-6.1 | EEPROM snapshot of last SESSION_SUMMARY on stop (survives reboot) | 6 | F10 | Low |
| O-6.2 | Board IP configurable via URL param in Web UI (`?ip=<board-ip>`) | 6 | F07 | Medium |
| O-6.3 | Finalize and verify pin assignments (schematic) before Phase 5 | 6 | F01, F02 | High |

---

## Phase 5 / 6 Prerequisites – Open Questions

| # | Question | Needed before |
|---|---|---|
| Q1 | Which motor driver chip? (L298N / DRV8871 / BTS7960 / IBT-2) | M5.3 / real-HW milestone |
| Q2 | Motor voltage and rated current? | Driver selection |
| Q3 | RPM sensor type? (Hall / optical / encoder) | M5.6 |
| Q4 | Gear ratio between motor shaft and basket? | `GEAR_RATIO` constant |
| Q5 | PWM frequency appropriate for driver? | `motor_config.h` |
| Q6 | Exact pin wiring (schematic)? | All `PIN_*` defines |

---

## Code Files Needing R4 Rewrite (Phase 6 Scope)

These files currently contain ESP32-only code. They will not compile against the R4 toolchain and must be rewritten before M6.14:

| File | ESP32-only dependency | R4 replacement | Phase 6 milestone |
|---|---|---|---|
| `src/main.cpp` | `WiFi.h`, `ESPmDNS.h`, `AsyncTCP.h`, `ESPAsyncWebServer.h`, `WebSerial.h`, FreeRTOS, `LittleFS.h` | `WiFiS3.h`, `ArduinoOTA.h`, `WiFiServer`/`WiFiClient`, `Serial`, `EEPROM.h` | M6.2 |
| `src/web_api.h` / `.cpp` | `ESPAsyncWebServer`, `AsyncWebSocket`, `LittleFS`, `freertos/semphr.h` | Synchronous `WiFiServer`/`WiFiClient` WebSocket | M6.4 |
| `src/log.h` | FreeRTOS queue + `WebSerial.h` | Direct `Serial.println()` | M6.10 |
| `src/params.h` / `.cpp` | `Preferences.h` (NVS) | `EEPROM.h` struct + magic-byte | M6.8 |
| `src/program.cpp` | `Preferences.h` (NVS) | EEPROM struct after MotorParams | M6.8 |
| `src/session.h` / `.cpp` | `LittleFS.h` JSONL files | In-memory ring buffer (≤50 entries, ~5 KB SRAM) | M6.9 |

**Platform-independent (no rewrite needed):**  
`motor_driver.h`, `sim_motor_driver.h`, `rpm_source.h`, `sim_rpm_source.h`, `ramp_controller.h/.cpp`, `error_handler.h/.cpp`, `program.h`

> **Current build state:** The sketch does **not** compile for `[env:r4wifi]` yet. Platform migration starts at M6.2.

---

## Dependency Graph

```
F08 (Simulation / HAL)  ◄── FOUNDATION
 ├─ F01 (IMotorDriver + SimMotorDriver)
 └─ F02 (IRpmSource + SimRpmSource)
      │
      ▼
F06 (Params) → F03 (Ramps) → F04 (Direction) → F09 (Multi-step) → F10 (Session)

F05 (Errors) ◄── F01 + F02 + fault injection (F08)

F07 (Web UI) ◄── All features feed in

[Phase 5 only – blocked by Q1–Q6]
F01 RealMotorDriver
F02 RealRpmSource
```

