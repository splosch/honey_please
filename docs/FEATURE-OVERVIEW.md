# honey_please – Feature Documentation Overview

**Project:** ESP32-based Honigschleuder Motor Control  
**Board:** ESP32-D0WDQ6 @ `192.168.178.64`  
**Firmware:** v1.4.0 | Framework: Arduino / PlatformIO

---

## Quick Links

| Document | Topic |
|---|---|
| [Initial ESP32 Setup](./initial_esp32_setup.md) | First flash, OTA setup, self-check |
| [Dev Environment & Milestone History](./esp_basic_dev_env.md) | Milestones 1–4 (USB, OTA, WebSerial) |
| **[F01 – Motor Control Architecture](./features/F01-motor-control-architecture.md)** | `IMotorDriver` HAL, `SimMotorDriver`, `RealMotorDriver` (Phase 5), state machine, WebSocket protocol |
| **[F02 – RPM Monitoring](./features/F02-rpm-monitoring.md)** | `IRpmSource` HAL, `SimRpmSource`, `RealRpmSource` (Phase 5), error detection |
| **[F03 – Acceleration/Deceleration Ramps](./features/F03-acceleration-deceleration-ramps.md)** | Ramp algorithm, params, UI visualization |
| **[F04 – Direction Control](./features/F04-direction-control.md)** | CW/CCW, safe direction change sequence |
| **[F05 – Error States](./features/F05-error-states.md)** | Error codes, EMERGENCY_STOP, recovery |
| **[F06 – RPM Limits & Parameters](./features/F06-rpm-limits-and-params.md)** | All configurable params, persistence, validation |
| **[F07 – Web UI Schematic View](./features/F07-webui-schematic-view.md)** | Layout, component boxes, controls, sparkline |
| **[F08 – Simulation Mode](./features/F08-simulation-mode.md)** | **Phase 1 starting point** – HAL-based sim, fault injection, compile-time driver selection |
| **[F09 – Multi-Step Extraction Program](./features/F09-multistep-program.md)** | L-Slow → R-Fast sequence, configuration |
| **[F10 – Honey Extraction Session](./features/F10-extraction-session.md)** | Session lifecycle, protocol log, export |

---

## System Architecture (Bird's Eye)

```
Browser (Web UI)
    │   HTTP  /         → serves index.html from LittleFS
    │   WS    /ws       → real-time bidirectional state sync (10 Hz)
    │   GET   /sessions        → session list (JSON) or download by ?id=N
    ▼
ESP32 (192.168.178.64)
    │
    ├── AsyncWebServer  (port 80)
    ├── WebSerial       (port 80, /webserial – debug terminal)
    ├── ArduinoOTA      (port 3232 – wireless firmware updates)
    │
    ├── RampController  → calls IMotorDriver
    ├── StateMachine    → calls IMotorDriver
    ├── ErrorHandler    → calls IMotorDriver + IRpmSource
    ├── Session         → LittleFS log writer
    ├── Params          → NVS persistence
    │
    ├── IMotorDriver  ◄─ HAL boundary
    │       ├─ SimMotorDriver   (Phases 1–4: no GPIO)
    │       └─ RealMotorDriver  (Phase 5: PWM + GPIO)
    │
    └── IRpmSource    ◄─ HAL boundary
            ├─ SimRpmSource     (Phases 1–4: reads RampController)
            └─ RealRpmSource    (Phase 5: GPIO interrupt ISR)
                      │
                      ▼ (Phase 5 only)
              Motor Controller (type TBD)
                      │
                      ▼
              Motor – Honigschleuder
```

---

## Implementation Milestones

### ✅ Phase 0 – Foundation (DONE)

- ✅ M0.1: VS Code + PlatformIO setup
- ✅ M0.2: USB flash, Serial Monitor working
- ✅ M0.3: OTA deployment via WiFi
- ✅ M0.4: WebSerial terminal in browser

---

### ✅ Phase 1 – HAL + Simulation Drivers

**Goal:** The firmware compiles and runs end-to-end with `SimMotorDriver` + `SimRpmSource`. No hardware required. All subsequent phases build on this foundation.

| ID | Milestone | Feature Docs |
|---|---|---|
| ✅ M1.1 | `IMotorDriver` interface defined | F01 §2 |
| ✅ M1.2 | `SimMotorDriver` implemented + unit-tested via WebSerial | F01, F08 |
| ✅ M1.3 | `IRpmSource` interface defined | F02 §2 |
| ✅ M1.4 | `SimRpmSource` reads `RampController.getCurrent()` | F02, F08 |
| ✅ M1.5 | `main.cpp` wires `SimMotorDriver` + `SimRpmSource` via interface pointers | F01 |
| ✅ M1.6 | Fault injection via WebSerial: `injectFault`, `injectSensorLoss` | F08 |
| ✅ M1.7 | Default `platformio.ini` env uses sim build (no `REAL_HARDWARE` flag) | F08 |

---

### ✅ Phase 2 – Ramp Control, Direction & Safety Logic

**Goal:** Full motor behaviour implemented and testable via WebSerial commands, all using sim drivers.

| ID | Milestone | Feature Docs |
|---|---|---|
| ✅ M2.1 | `RampController` (linear ramp, 20 Hz tick, ETA) | F03 |
| ✅ M2.2 | Accel/decel configurable via WebSerial command | F03, F06 |
| ✅ M2.3 | Safe direction change sequence: decel → pause → GPIO flip → accel | F04 |
| ✅ M2.4 | `ErrorHandler` with all error codes E01–E09 | F05 |
| ✅ M2.5 | EMERGENCY_STOP: immediate `disable()` + `FAULT_STOP` state | F05 |
| ✅ M2.6 | Fault injection (E03, E06) triggers correct state via sim drivers | F05, F08 |
| ✅ M2.7 | Params NVS persistence via `Preferences` | F06 |

---

### ✅ Phase 3 – Web UI Schematic  (DONE)

**Goal:** Browser shows the live system schematic driven by sim data. Full UI is developed and verified without hardware.

| ID | Milestone | Feature Docs | Status |
|---|---|---|---|
| ✅ M3.1 | LittleFS partition configured; `index.html`, `style.css`, `app.js` served from `/` | F07 | Done |
| ✅ M3.2 | WebSocket `/ws` endpoint, JSON state frames at 10 Hz | F01, F07 | Done |
| ✅ M3.3 | Three component boxes (ESP32, Motor Ctrl, Honigschleuder) rendered | F07 | Done |
| ✅ M3.4 | GPIO / internal state live in ESP32 box (duty bar, HIGH/LOW badges) | F07 | Done |
| ✅ M3.5 | Ramp progress bar + ETA countdown in Honigschleuder box | F03, F07 | Done |
| ✅ M3.6 | Direction indicator + basket SVG animation (speed ∝ RPM, freezes on DIR_CHANGE_PAUSE) | F04, F07 | Done |
| ✅ M3.7 | Large RPM display + 30 s sparkline (Canvas 2D, 500 ms resolution) | F02, F07 | Done – arc gauge replaced by numerical display |
| ⚠️ M3.8 | Control bar: LEFT, RIGHT, **PAUSE**, STOP, E-STOP | F04, F07 | Optional – PAUSE not yet added |
| ⚠️ M3.9 | Error overlays: CRITICAL ✅ / WARNING + ERROR banners | F05, F07, F08 | Optional – WARNING/ERROR banners not yet shown |
| ⚠️ M3.10 | Parameters panel with sliders + live preview | F06, F07 | Optional – `set_param` WS command wired; UI panel deferred |
| ✅ M3.11 | SIM mode indicator banner always visible | F08 | Done |

---

### ✅ Phase 4 – Multi-Step Program & Session Protocol  (DONE)

**Goal:** Full extraction workflow runs end-to-end in simulation. Session log is exported and verified.

| ID | Milestone | Feature Docs |
|---|---|---|
| ✅ M4.1 | Multi-step program (6 default steps) stored in NVS | F09 |
| ✅ M4.2 | Program runner: step sequencer with direction transitions | F09 |
| ✅ M4.3 | Program UI: step bubbles, active highlight, skip/pause/abort | F09 |
| ✅ M4.4 | LittleFS session directory, JSONL append-write on each event | F10 |
| ✅ M4.5 | Session start/stop on operator command | F10 |
| ✅ M4.6 | RPM samples every 5 s + program/step/error/direction events logged | F10 |
| ✅ M4.7 | Session summary on stop; `GET /sessions` JSON list | F10 |
| ✅ M4.8 | JSONL export via `GET /sessions?id=N` | F10 |
| ✅ M4.9 | Full 6-step program runs in SIM, session export verified | F08, F09, F10 |

---

## Open / Optional Items from Completed Phases

> These items were descoped during Phases 1–4 to keep scope tight. All are non-blocking.  
> Pick up any of them before or alongside Phase 5.

| ID | Item | Phase | Feature | Priority |
|---|---|---|---|---|
| O-3.1 | PAUSE button in motor control bar | 3 | F04, F07 | Low – ramp to 0 already works; purely a UI shortcut |
| O-3.2 | WARNING / ERROR-level banners in UI (non-critical errors) | 3 | F05, F07 | Medium – CRITICAL overlay done; WARNING/ERROR_LVL banners not shown |
| O-3.3 | Parameters panel (sliders for max_rpm, accel, decel, dir_pause) | 3 | F06, F07 | Medium – `set_param` WS command fully wired; only the UI panel is missing |
| O-4.1 | Step editing UI (change RPM%, duration, add/remove steps) | 4 | F09 | Medium – NVS storage + runner fully support it; UI panel not built |
| O-4.2 | Live event log in session bar (scrolling feed during recording) | 4 | F10 | Low – events already in JSONL; UI panel not built |
| O-4.3 | Session history browser (list, view, delete stored sessions) | 4 | F10 | Low – `GET /sessions` JSON list exists; no browser UI |
| O-4.4 | Plain-text session export (human-readable summary) | 4 | F10 | Low – JSONL export works; TXT rendering not implemented |
| O-4.5 | `RAMP_START` / `RAMP_COMPLETE` / `RPM_TARGET_SET` session events | 4 | F10 | Low – SessionLogger has `logEvent()`; hooks in RampController not wired |

---

### 🔲 Phase 5 – Hardware Integration (RealMotorDriver)

**Goal:** Swap `SimMotorDriver` + `SimRpmSource` for real GPIO implementations. All other code stays unchanged.

> ⚠️ **Blocked by:** Q1–Q6 below. No GPIO code is written before these are answered.

| ID | Milestone | Feature Docs | Blocker |
|---|---|---|---|
| M5.1 | Hardware confirmed: driver chip, motor specs, pin wiring, RPM sensor | F01, F02 | Q1–Q6 |
| M5.2 | `motor_config.h` with confirmed pin `#define`s | F01 | M5.1 |
| M5.3 | `RealMotorDriver` implemented + `REAL_HARDWARE` build env added | F01 | M5.2 |
| M5.4 | PWM output verified on oscilloscope / multimeter | F01 | M5.3 |
| M5.5 | Direction GPIO toggles confirmed physically | F04 | M5.3 |
| M5.6 | `RealRpmSource` ISR implemented + `PULSES_PER_REVOLUTION` calibrated | F02 | M5.1 |
| M5.7 | nFAULT pin polling and EMERGENCY_STOP verified on real driver | F05 | M5.3 |
| M5.8 | Runtime SIM↔Real toggle tested with motor running | F08 | M5.3 |
| M5.9 | End-to-end extraction session with real motor | F09, F10 | M5.6 |

---

## Phase 5 Prerequisites – Open Questions

> These questions block **Phase 5 only**. All of Phases 1–4 proceed without answers.

| # | Question | Needed before |
|---|---|---|
| Q1 | Which motor driver chip? (L298N / DRV8833 / DRV8871 / BTS7960) | M5.3 |
| Q2 | Motor voltage and rated current? | Driver selection |
| Q3 | RPM sensor type? (Hall / optical / encoder) | M5.6 |
| Q4 | Gear ratio between motor shaft and basket? | `GEAR_RATIO` constant |
| Q5 | PWM frequency appropriate for driver? | `motor_config.h` |
| Q6 | Exact pin wiring (schematic or photo)? | All `PIN_*` defines |

---

## What Can Be Built Today (No Hardware)

| Component | Hardware needed? |
|---|---|
| `IMotorDriver` + `IRpmSource` interfaces | No |
| `SimMotorDriver` + `SimRpmSource` | No |
| `RampController` (full ramp logic) | No |
| `StateMachine` (all state transitions) | No |
| `ErrorHandler` (all E01–E09 + fault injection) | No |
| `Params` NVS persistence | No |
| WebSocket state broadcast | No |
| Full Web UI (schematic, controls, charts) | No |
| Multi-step extraction program | No |
| Session logging + export | No |
| `RealMotorDriver` + PWM calibration | **Yes – Phase 5** |
| `RealRpmSource` ISR calibration | **Yes – Phase 5** |

## Dependency Graph

```
F08 (Simulation / HAL)  ◄── STARTS HERE
 ├─ F01 (IMotorDriver + SimMotorDriver)
 └─ F02 (IRpmSource + SimRpmSource)
      │
      ▼
F06 (Params)
 └► F03 (Ramps)
      └► F04 (Direction)
           └► F09 (Multi-step)
                └► F10 (Session)

F05 (Errors) ◄── F01 + F02 + fault injection (F08)

F07 (Web UI) ◄── ALL features feed into (Phase 3)

[Phase 5 only]
F01 RealMotorDriver ◄── Q1–Q6 hardware confirmed
F02 RealRpmSource   ◄── Q3 sensor confirmed
```
