# F08 – Simulation Mode

**Status:** Phase 1 – Active Development Starting Point  
**Depends on:** [F01 – Motor Control Architecture / HAL](./F01-motor-control-architecture.md), [F03 – Ramps](./F03-acceleration-deceleration-ramps.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md)

> **This is where development begins.** Simulation is not a feature added later – it is the default runtime for Phases 1–4. `SimMotorDriver` and `SimRpmSource` (from F01/F02 HAL) are the active implementations from the first build. Real hardware support (`RealMotorDriver`, `RealRpmSource`) is added in Phase 5 without touching any existing code.

---

## 2. How It Works (HAL-based, not a mode toggle)

Simulation is not a runtime switch applied over the real driver – it is the **default HAL implementation** during Phases 1–4. The architecture from F01 makes this transparent:

```
Phases 1–4 (now)             Phase 5 (later)

SimMotorDriver               RealMotorDriver
    + SimRpmSource                + RealRpmSource
         │                              │
    IMotorDriver / IRpmSource  ◄─ same interface
         │
    RampController
    StateMachine
    ErrorHandler
    WebApi
    Session
```

The runtime SIM toggle on the UI (see §6) is an additional convenience during Phase 3+ that allows toggling between sim and real **within the same firmware build** – useful for live demonstrations. The compile-time default remains `SimMotorDriver` until the `REAL_HARDWARE` build flag is added.

---

## 3. Simulation Behavior

With `SimMotorDriver` + `SimRpmSource` active:

| Real firmware behavior | SIM behavior |
|---|---|
| PWM written to GPIO | PWM calculated but **not** output to pin |
| Direction GPIOs set | Direction tracked internally, **not** applied to GPIO |
| Enable pin HIGH/LOW | Internally tracked, **not** written to GPIO |
| RPM read from interrupt | `SimRpmSource.getRpm()` returns `RampController.getCurrent()` |
| `nFAULT` pin read | `SimMotorDriver.isFault()` always returns `false` unless fault is injected |

The ramp controller runs its full algorithm unchanged. State machine, error handler, and session logger see no difference – they all call through `IMotorDriver` / `IRpmSource`.

---

## 4. Fault Injection (available in SIM builds)

The Web UI exposes a **Fault Injection Panel** in simulation mode:

```
┌──────────────────────────────────────────┐
│ 🔬 SIMULATION MODE                       │
├──────────────────────────────────────────┤
│ Inject Fault:                            │
│  [E03 – RPM Sensor Lost]                 │
│  [E04 – Overspeed]                       │
│  [E05 – Stall]                           │
│  [E06 – Driver Fault]                    │
│  [E09 – Emergency Stop]                  │
│                                          │
│ RPM Noise:  [──●──────] ±5 RPM          │
│ Ramp Jitter: [──●──────] ±2 RPM/step    │
└──────────────────────────────────────────┘
```

Injected faults call directly into the HAL sim implementations:
- `SimMotorDriver.injectFault(true)` → `isFault()` returns `true` → triggers E06
- `SimRpmSource.injectSensorLoss(true)` → `isHealthy()` returns `false` → triggers E03
- Overspeed injection: sets `targetRpm > 300` → triggers E04

Injected faults trigger the full error handling path (E-Stop, state machine, UI overlay) so operators and developers can verify every error state.

---

## 5. SIM Mode Indicator

When simulation is active, every component box has a prominent **[SIM]** badge:

```
┌─────────────────────────┐
│ ⬡ R4 WiFi    [SIM] 🟡   │
│  ...                    │
└─────────────────────────┘
```

The top navigation bar shows a persistent **yellow SIM banner**:

```
  ⚠ SIMULATION MODE – No hardware output  [EXIT SIM]
```

This banner cannot be hidden. It prevents the operator from confusing a simulation run with real motor operation.

---## 6. Enabling / Disabling SIM Mode at Runtime

### Via Web UI

Top bar `[SIM]` button toggles the runtime simulation flag. Applicable only in a `REAL_HARDWARE` build where both drivers exist. In a sim-only build (Phases 1-4), the button is not shown.

### Via WebSocket Command

```json
{ "cmd": "SIM_MODE", "enable": true }
{ "cmd": "SIM_MODE", "enable": false }
```

### Compile-time Default

```ini
; platformio.ini - Phases 1-4 (default, no hardware)
[env:r4wifi]
build_flags =
    ; no REAL_HARDWARE flag -> SimMotorDriver is active

; platformio.ini - Phase 5 (real hardware)
[env:r4wifi_hw]
build_flags = -DREAL_HARDWARE
```

No source file changes are needed when switching envs.

---

## 7. Multi-Step Program Simulation

The multi-step extraction program (F09) runs identically in SIM mode. The operator can walk through all 6 steps (L-Slow → R-Fast) and observe:

- Direction change sequences
- Ramp curves
- Step timing
- Session protocol entries

This is the primary use case for SIM mode: rehearsing a honey extraction session before attaching the motor.

---

## 8. Acceptance Criteria

### Phase 1 – Core Sim (verifiable now)
- [ ] Default build uses `SimMotorDriver` and `SimRpmSource` (no GPIO calls)
- [ ] Synthetic RPM matches `RampController.getCurrent()` exactly
- [ ] All 5 fault injections call through HAL and trigger correct state + UI overlay
- [ ] SIM badge and banner visible at all times in sim build
- [ ] Full multi-step program (F09) runs to completion with sim drivers

### Phase 5 – HAL Switchover (requires hardware)
- [ ] `REAL_HARDWARE` build compiles and links `RealMotorDriver` + `RealRpmSource`
- [ ] Runtime SIM toggle (UI button) switches active driver pointer without reboot
- [ ] SIM → Real transition validates GPIO safe state before enabling output
- [ ] Real → SIM transition requires motor to be in IDLE
