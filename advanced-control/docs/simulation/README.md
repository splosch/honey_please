# Simulation Mode – Domain Overview

**Parent:** [ARCHITECTURE.md](../../ARCHITECTURE.md)

The firmware uses a HAL (Hardware Abstraction Layer) pattern so the entire motor control logic can run in software simulation — no physical hardware required. This is the default build mode.

---

## Contents

See [F08 – Simulation Mode](../features/F08-simulation-mode.md) for the full feature specification.

---

## How It Works

```
RampController
    │
    ├─ IMotorDriver  ◄─── SimMotorDriver   (default build)
    │                └─── RealMotorDriver  (Phase 5, REAL_HARDWARE flag)
    │
    └─ IRpmSource    ◄─── SimRpmSource     (default build)
                     └─── RealRpmSource    (Phase 5, REAL_HARDWARE flag)
```

`SimMotorDriver` tracks enable/direction/speed state in memory.  
`SimRpmSource` reads the current ramp position from `RampController.getCurrent()` and returns it as a simulated RPM value.

No `#ifdef REAL_HARDWARE` is needed in control logic — the HAL interfaces are injected at startup in `main.cpp`.

---

## Build Flags

| Mode | Flag | Drivers used |
|---|---|---|
| Simulation (default) | *(none)* | `SimMotorDriver`, `SimRpmSource` |
| Real hardware | `-DREAL_HARDWARE` | `RealMotorDriver`, `RealRpmSource` |

---

## Fault Injection (Simulation Only)

`SimMotorDriver` supports fault injection for testing the `ErrorHandler`. See `advanced-control/sim_rpm_source.h` for the current API. Also available via USB serial command: `inject_fault <code>`.

---

## Demo Sketch

A standalone simulation demo (`basic-control/main.cpp`) mirrors the state machine from `advanced-control/` but is self-contained for quick hardware-free demos. Build and flash via:

```bash
npm run basic-control:build    # compile only
npm run basic-control:flash    # compile + flash via auto-detected USB port
```

The basic-control sketch uses env `r4wifi_basic_control` (see `platformio.ini`).

---

## Interactive Simulation Reference

The file [ErsteInbetriebnahmeMotorundSteuerung.html](../ErsteInbetriebnahmeMotorundSteuerung.html) provides a browser-based interactive simulation of the 6-state machine with animated wiring and membrane keypad simulation. It does not connect to the board — it is purely a documentation/demo tool.

---

## Related Feature Docs

| Feature | Doc |
|---|---|
| HAL interfaces + driver implementations | [F01 – Motor Control Architecture](../features/F01-motor-control-architecture.md) |
| SimRpmSource + IRpmSource | [F02 – RPM Monitoring](../features/F02-rpm-monitoring.md) |
| Fault injection | [F08 – Simulation Mode](../features/F08-simulation-mode.md) |
