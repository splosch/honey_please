# F02 – RPM Monitoring

**Status:** In Development (SimRpmSource – Phase 1)  
**Depends on:** [F01 – Motor Control Architecture](./F01-motor-control-architecture.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md), [F10 – Extraction Session](./F10-extraction-session.md)

> **Development approach:** RPM is provided by an `IRpmSource` interface. `SimRpmSource` is used in Phases 1–4: it reads the current RPM directly from `RampController` (no hardware needed). `RealRpmSource` (GPIO interrupt ISR) is added in Phase 5.

---

## 1. Goal

Provide real-time RPM of the Honigschleuder basket to the ramp controller (F03), Web UI (F07), and session protocol (F10). The source of that RPM value (simulation math vs. physical sensor) is interchangeable via the `IRpmSource` interface.

---

## 2. HAL Interface: `IRpmSource`

```cpp
// src/rpm_source.h
class IRpmSource {
public:
    virtual void  begin()          = 0;
    virtual float getRpm()   const = 0;  // basket RPM (gear-ratio corrected)
    virtual bool  isHealthy() const = 0; // false triggers E03_RPM_SENSOR_LOST
    virtual ~IRpmSource() {}
};
```

### SimRpmSource (Phase 1 – builds today)

```cpp
// src/sim_rpm_source.h
class SimRpmSource : public IRpmSource {
    const RampController& _ramp;
    bool _healthy = true;
public:
    explicit SimRpmSource(const RampController& ramp) : _ramp(ramp) {}
    void  begin()          override { LOG("[SIM] RPM source ready"); }
    float getRpm()   const override { return _ramp.getCurrent(); }  // synthetic
    bool  isHealthy() const override { return _healthy; }
    void  injectSensorLoss(bool lost) { _healthy = !lost; }  // F08 fault injection
};
```

The ramp math already tracks `current_rpm` with full noise and deviation behaviour – the UI and session log see a realistic RPM signal from the very first development build.

### RealRpmSource (Phase 5 – deferred)

```cpp
// src/real_rpm_source.h  – skeleton; implement when sensor is confirmed
class RealRpmSource : public IRpmSource {
public:
    void  begin()          override;  // attaches ISR to RPM_SENSOR_PIN
    float getRpm()   const override;  // sliding-window calculation
    bool  isHealthy() const override; // checks zero-RPM timeout
};
```

---

## 3. Sensor Options (Phase 5 decision)

❓ **Open question – confirm which sensor is mounted (needed only for Phase 5):**

| Option | Sensor Type | Signal | Pulses/Rev | Notes |
|---|---|---|---|---|
| A | Hall sensor (e.g. A3144) | Digital pulse | 1–N per rev | Requires magnet(s) on shaft |
| B | Optical (IR slot) | Digital pulse | 1–N per rev | Clean signal, no magnet needed |
| C | Encoder (quadrature) | 2x digital | N per rev | Direction info, higher resolution |

> All options use interrupt-driven counting on GPIO 34 (input-only, no pull-up needed with external circuit).  
> Update `PULSES_PER_REVOLUTION` constant once sensor is confirmed.

---

## 4. RealRpmSource Calculation (Phase 5 reference)

### Interrupt Service Routine (ISR)

```cpp
// real_rpm_source.cpp – simplified
volatile uint32_t pulseCount = 0;
volatile uint32_t lastPulseTime_us = 0;

void IRAM_ATTR onRpmPulse() {
    pulseCount++;
    lastPulseTime_us = micros();
}
```

### Sliding-window average (500 ms window)

```
RPM = (pulse_count_in_window / PULSES_PER_REVOLUTION) * (60000 / window_ms)
```

### Zero-RPM detection

If no pulse arrives within `ZERO_RPM_TIMEOUT_MS` (default: 2000 ms) while the motor is commanded ON, `isHealthy()` returns `false` → triggers E03.

---

## 5. Firmware Constants (in `motor_config.h` – Phase 5)

```cpp
#define RPM_SENSOR_PIN          34
#define PULSES_PER_REVOLUTION    1   // Update once sensor confirmed
#define RPM_WINDOW_MS          500
#define ZERO_RPM_TIMEOUT_MS   2000
```

---

## 6. Data Flow

```
[Phase 1–4 – Sim]               [Phase 5 – Real]
RampController.getCurrent()      GPIO 34 interrupt ISR
          │                           │
          └──────── IRpmSource ────────┘
                       │
                       ▼  every RPM_WINDOW_MS in loop()
               rpmSource.update()
                       │
                       ├─► rampController.setCurrentRpm(rpm)  → F03
                       ├─► session.logRpm(rpm)               → F10
                       └─► ws_frame.rpm = rpm                → F07
```

---

## 7. Web UI Display (see F07 for full UI spec)

| Element | Description |
|---|---|
| Large RPM numeric | Current RPM, bold, centered on motor component |
| RPM arc gauge | 0 – MAX_RPM semicircle, needle + colored zones |
| Target RPM line | Dashed line on gauge showing current target |
| RPM sparkline | Last 30 seconds of RPM values, 500 ms resolution |

**Color zones on gauge:**
- 0–50 % of max_rpm → Green
- 50–85 % → Yellow
- 85–100 % → Orange
- > max_rpm (sensor overshoot) → Red + alert

---

## 8. Calibration (Phase 5)

If a gear ratio exists between motor shaft and basket:

```cpp
#define GEAR_RATIO   1.0f   // motor RPM / basket RPM (update if geared)
float basketRpm = motorRpm / GEAR_RATIO;
```

The UI always shows **basket RPM** (what the honey sees), not motor RPM.

---

## 9. Error Conditions

| Code | Condition | Sim behaviour | Real behaviour |
|---|---|---|---|
| `E03_RPM_SENSOR_LOST` | `isHealthy()` false while motor ON | Triggered by `injectSensorLoss(true)` via F08 | No pulse for > ZERO_RPM_TIMEOUT |
| `E04_OVERSPEED` | `getRpm()` > 300 (physical max) | Triggered by `injectFault` or target > 300 | Measured RPM exceeds hard limit |
| `E05_STALL` | Power > 20 % but RPM < 5 for > 3 s | Synthetic RPM never stalls unless injected | Sensor detects no rotation under load |

See [F05 – Error States](./F05-error-states.md) for full error handling spec.

---

## 10. Acceptance Criteria

### Phase 1 – SimRpmSource (verifiable now)
- [ ] `SimRpmSource.getRpm()` returns exactly `RampController.getCurrent()`
- [ ] RPM value updates on WebSocket at ≥ 10 Hz
- [ ] `injectSensorLoss(true)` triggers E03 within one `loop()` cycle
- [ ] Simulated overspeed (target > 300) triggers E04 and EMERGENCY_STOP

### Phase 5 – RealRpmSource (requires hardware)
- [ ] Displayed RPM within ±2 RPM of actual at steady state
- [ ] Zero-RPM correctly detected within `ZERO_RPM_TIMEOUT_MS` of motor stop
- [ ] Overspeed triggers EMERGENCY_STOP and is visible in session log
- [ ] Stall condition generates warning within 3 seconds
